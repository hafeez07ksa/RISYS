// entra-directory — Microsoft Entra ID directory scan for one organisation.
//
// Data sources (each is reported separately in connector_scan_runs.sources):
//   directory  Users, account state, guests      Graph  User.Read.All / Directory.Read.All
//              plus signInActivity when the tenant has Entra ID P1 (AuditLog.Read.All)
//   mfa        Authentication-method registration report
//                                                Graph  Reports.Read.All / AuditLog.Read.All
//   roles      Directory role assignments        Graph  Directory.Read.All / RoleManagement.Read.Directory
//   signins    7 days of sign-in logs            Graph  AuditLog.Read.All (Entra ID P1)
//
// Callers: an org admin (manual "Scan now") or the scan dispatcher (scheduled).
//
// Findings are derived from entra_users in the browser (src/lib/findings.js), so
// this function keeps the directory table accurate and records what it could read.
// A source that fails leaves the previous data in place rather than wiping it.
//
// Fix (17 Sep 2026, B1): last_sign_in was hard-coded null, so the inactive-account
// finding never fired. It now comes from users?$select=signInActivity, with a
// fallback to the sign-in logs for tenants where that property is not available.
import {
  adminClient, corsHeaders, errorResponse, getMicrosoftAppToken, HttpError, json, requireOrgAccess,
} from '../_shared/auth.ts'
import { GRAPH, graphGetAll, Json, mapLimit, SourceError, SourceResult, sourceFailure } from '../_shared/graph.ts'

const CONNECTOR = 'entra'
const SIGNIN_WINDOW_DAYS = 7
const INACTIVE_DAYS = 90
const HEADERS = { ConsistencyLevel: 'eventual' }
// Tenants without Entra ID P1 cannot use the MFA registration report, so RISYS
// falls back to reading each user's registered methods one by one. That is a call
// per user, so it is capped and run a few at a time.
const MAX_METHOD_USERS = 600
const METHOD_CONCURRENCY = 6
// Anything other than a password or an email address (SSPR only) counts as MFA.
const WEAK_METHODS = ['passwordauthenticationmethod', 'emailauthenticationmethod']

const USER_SELECT =
  'id,userPrincipalName,displayName,givenName,surname,mail,jobTitle,department,officeLocation,' +
  'mobilePhone,accountEnabled,userType,createdDateTime'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabase = adminClient()
  let runId: string | null = null

  try {
    const { org_id } = await req.json().catch(() => ({}))
    const { user, trigger } = await requireOrgAccess(req, supabase, org_id)

    const { data: conn } = await supabase
      .from('org_connectors').select('meta')
      .eq('org_id', org_id).eq('connector_id', CONNECTOR).maybeSingle()
    if (!conn) throw new HttpError(400, 'Microsoft Entra ID is not connected. Connect it from Settings first.')

    const { data: run } = await supabase.from('connector_scan_runs').insert({
      org_id, connector_id: CONNECTOR, trigger, triggered_by: user?.id ?? null,
    }).select('id').single()
    runId = run?.id ?? null

    const tenantId: string = conn.meta?.tenant_id
    const token = await getMicrosoftAppToken(tenantId)
    const syncedAt = new Date().toISOString()
    const sources: Record<string, SourceResult> = {}
    const warnings: string[] = []

    // ── Directory (users) ────────────────────────────────────────────────────
    // signInActivity needs Entra ID P1; ask for it, and drop it if Graph refuses.
    let rawUsers: Json[] = []
    let signInActivity = true
    try {
      try {
        rawUsers = await graphGetAll(
          `${GRAPH}/users?$select=${USER_SELECT},signInActivity&$top=999`, token, { maxPages: 20, headers: HEADERS },
        )
      } catch (e) {
        if (e instanceof SourceError && (e.status === 400 || e.status === 403)) {
          signInActivity = false
          rawUsers = await graphGetAll(
            `${GRAPH}/users?$select=${USER_SELECT}&$top=999&$count=true`, token, { maxPages: 20, headers: HEADERS },
          )
        } else throw e
      }
      if (rawUsers.length === 0) throw new SourceError('error', 'Graph returned no users. Check the app has User.Read.All with admin consent.')
      sources.directory = {
        state: 'ok', count: rawUsers.length,
        detail: signInActivity ? undefined : 'Last sign-in dates need Microsoft Entra ID P1; they were taken from the sign-in logs instead.',
      }
    } catch (e) {
      sources.directory = sourceFailure(e, 'User.Read.All / Directory.Read.All')
      throw new HttpError(502, `Entra directory could not be read: ${sources.directory.detail}`)
    }

    // ── MFA registration ─────────────────────────────────────────────────────
    const mfaMap: Record<string, Json> = {}
    let mfaKnown = true
    try {
      const rows = await graphGetAll(
        `${GRAPH}/reports/authenticationMethods/userRegistrationDetails?$top=999`, token, { maxPages: 20, headers: HEADERS },
      )
      for (const m of rows) mfaMap[m.id] = m
      sources.mfa = { state: 'ok', count: rows.length }
    } catch (e) {
      mfaKnown = false
      const failure = sourceFailure(e, 'Reports.Read.All (or AuditLog.Read.All)')
      // Microsoft refuses this report on tenants without Entra ID P1, whatever the permissions.
      sources.mfa = /NonPremiumTenant/i.test(String((e as Error)?.message ?? ''))
        ? { state: 'not_licensed', detail: 'The MFA registration report needs Microsoft Entra ID P1. Until then RISYS cannot tell who has registered MFA, so it does not report missing MFA.' }
        : failure
      if (sources.mfa.state !== 'not_licensed') warnings.push(`MFA registration: ${sources.mfa.detail}`)
    }

    // Fallback: read each user's registered methods (no premium licence needed).
    // Needs UserAuthenticationMethod.Read.All with admin consent.
    const methodsByUser = new Map<string, string[]>()
    if (!mfaKnown) {
      const targets = rawUsers.slice(0, MAX_METHOD_USERS)
      let refused: SourceError | null = null
      await mapLimit(targets, METHOD_CONCURRENCY, async (u: Json) => {
        if (refused) return
        try {
          const methods = await graphGetAll(`${GRAPH}/users/${u.id}/authentication/methods`, token, { maxPages: 2 })
          methodsByUser.set(u.id, methods.map((m: Json) => String(m['@odata.type'] ?? '').split('.').pop()!.toLowerCase()))
        } catch (e) {
          // One failure means the permission is missing for all of them.
          if (e instanceof SourceError && e.state === 'no_permission') refused ??= e
        }
      })
      if (methodsByUser.size > 0) {
        mfaKnown = true
        const capped = rawUsers.length > MAX_METHOD_USERS
        sources.mfa = {
          state: capped ? 'partial' : 'ok',
          count: methodsByUser.size,
          detail: capped
            ? `Read per user because this tenant has no Entra ID P1. Checked the first ${MAX_METHOD_USERS} of ${rawUsers.length} users.`
            : 'Read per user because this tenant has no Entra ID P1 (the MFA registration report needs it).',
        }
      } else if (refused) {
        sources.mfa = {
          state: 'no_permission',
          detail: 'The MFA registration report needs Entra ID P1, and reading methods per user was refused. Grant the application permission UserAuthenticationMethod.Read.All (Microsoft Graph) with admin consent to report MFA coverage without P1.',
        }
        warnings.push(`MFA registration: ${sources.mfa.detail}`)
      }
    }

    // ── Directory roles ──────────────────────────────────────────────────────
    const roleMap: Record<string, Array<{ id: string; displayName: string }>> = {}
    try {
      const roles = await graphGetAll(
        `${GRAPH}/directoryRoles?$expand=members($select=id)`, token, { maxPages: 5, headers: HEADERS },
      )
      for (const role of roles) {
        for (const member of (role.members ?? [])) {
          (roleMap[member.id] ||= []).push({ id: role.id, displayName: role.displayName })
        }
      }
      sources.roles = { state: 'ok', count: Object.keys(roleMap).length }
    } catch (e) {
      sources.roles = sourceFailure(e, 'Directory.Read.All (or RoleManagement.Read.Directory)')
      warnings.push(`Directory roles: ${sources.roles.detail}`)
    }

    // ── Sign-in logs (last 7 days) ───────────────────────────────────────────
    const lastSignInFromLogs = new Map<string, string>()
    let signInsSynced = 0
    try {
      const since = new Date(Date.now() - SIGNIN_WINDOW_DAYS * 86400_000).toISOString()
      const signIns = await graphGetAll(
        `${GRAPH}/auditLogs/signIns?$top=200&$orderby=createdDateTime desc&$filter=createdDateTime ge ${since}`,
        token, { maxPages: 5, headers: HEADERS },
      )
      const logRows = signIns.map((s: Json) => {
        const upn = String(s.userPrincipalName ?? '').toLowerCase()
        const when = s.createdDateTime ?? null
        if (upn && when && s.status?.errorCode === 0) {
          const prev = lastSignInFromLogs.get(upn)
          if (!prev || prev < when) lastSignInFromLogs.set(upn, when)
        }
        return {
          org_id,
          event_id: s.id,
          user_email: s.userPrincipalName ?? null,
          user_display: s.userDisplayName ?? null,
          app_name: s.appDisplayName ?? null,
          status: s.status?.errorCode === 0 ? 'success' : 'failure',
          risk_level: s.riskLevelDuringSignIn ?? 'none',
          ip_address: s.ipAddress ?? null,
          location: s.location ? [s.location.city, s.location.countryOrRegion].filter(Boolean).join(', ') : null,
          mfa_used: s.authenticationDetails?.some((a: Json) => a.authenticationMethod !== 'Password') ?? false,
          failure_reason: s.status?.failureReason ?? null,
          raw_data: s,
          created_at: s.createdDateTime ?? new Date().toISOString(),
        }
      })
      for (let i = 0; i < logRows.length; i += 100) {
        const { error } = await supabase.from('entra_signin_logs')
          .upsert(logRows.slice(i, i + 100), { onConflict: 'org_id,event_id' })
        if (error) console.warn('[entra-directory] sign-in log upsert', error.message)
      }
      signInsSynced = logRows.length
      sources.signins = { state: 'ok', count: signInsSynced }
    } catch (e) {
      const failure = sourceFailure(e, 'AuditLog.Read.All')
      // Graph refuses sign-in logs without Entra ID P1 even when the permission is granted.
      sources.signins = failure.state === 'no_permission'
        ? { state: 'not_licensed', detail: 'Sign-in logs need Microsoft Entra ID P1 (or the app lacks AuditLog.Read.All).' }
        : failure
      if (sources.signins.state !== 'not_licensed') warnings.push(`Sign-in logs: ${sources.signins.detail}`)
    }

    const usedMethodFallback = methodsByUser.size > 0

    // Without the MFA report, keep whatever was known before rather than
    // marking every account as "no MFA registered".
    const previousMfa = new Map<string, Json>()
    if (!mfaKnown) {
      const { data: prev } = await supabase.from('entra_users')
        .select('entra_id, is_mfa_registered, is_mfa_capable, is_sspr_registered, is_passwordless_capable, default_mfa_method, methods_registered')
        .eq('org_id', org_id)
      for (const r of prev ?? []) previousMfa.set(r.entra_id, r)
    }

    // ── Persist the directory ────────────────────────────────────────────────
    const rows = rawUsers.map((u: Json) => {
      const report = mfaMap[u.id] ?? {}
      const methods = methodsByUser.get(u.id)
      // From the per-user methods: any method that is not a password or an email.
      const strong = methods?.filter(m => !WEAK_METHODS.includes(m)) ?? null
      const mfa: Json = methods
        ? {
            isMfaRegistered: strong!.length > 0,
            isMfaCapable: strong!.length > 0,
            isSsprRegistered: methods.includes('emailauthenticationmethod') || (strong?.length ?? 0) > 0,
            isPasswordlessCapable: methods.some(m => m.includes('fido2') || m.includes('windowshello') || m.includes('passwordless')),
            defaultMfaMethod: strong?.[0] ?? null,
            methodsRegistered: strong ?? [],
          }
        : (mfaKnown ? report : {})
      const prior = previousMfa.get(u.id)
      const roles = roleMap[u.id] ?? []
      const upn = String(u.userPrincipalName ?? '').toLowerCase()
      const lastSignIn = u.signInActivity?.lastSuccessfulSignInDateTime
        ?? u.signInActivity?.lastSignInDateTime
        ?? lastSignInFromLogs.get(upn)
        ?? null
      return {
        org_id,
        entra_id: u.id,
        user_principal_name: u.userPrincipalName ?? null,
        display_name: u.displayName ?? null,
        given_name: u.givenName ?? null,
        surname: u.surname ?? null,
        job_title: u.jobTitle ?? null,
        department: u.department ?? null,
        office_location: u.officeLocation ?? null,
        mail: u.mail ?? null,
        mobile_phone: u.mobilePhone ?? null,
        account_enabled: u.accountEnabled ?? true,
        user_type: u.userType ?? 'Member',
        created_datetime: u.createdDateTime ?? null,
        last_sign_in: lastSignIn,
        is_mfa_registered: mfa.isMfaRegistered ?? prior?.is_mfa_registered ?? false,
        is_mfa_capable: mfa.isMfaCapable ?? prior?.is_mfa_capable ?? false,
        is_sspr_registered: mfa.isSsprRegistered ?? prior?.is_sspr_registered ?? false,
        is_passwordless_capable: mfa.isPasswordlessCapable ?? prior?.is_passwordless_capable ?? false,
        default_mfa_method: mfa.defaultMfaMethod ?? prior?.default_mfa_method ?? null,
        methods_registered: mfa.methodsRegistered ?? prior?.methods_registered ?? [],
        directory_roles: roles,
        is_privileged: roles.length > 0,
        risk_level: 'none',
        synced_at: syncedAt,
        // mfa_known lets the UI tell "MFA not registered" apart from "we could not read it".
        raw_data: {
          user: u,
          mfa: methods ? mfa : (mfaKnown ? (mfaMap[u.id] ?? null) : null),
          mfa_source: methods ? 'per_user_methods' : (mfaKnown ? 'registration_report' : null),
          // With the fallback, only the users actually checked are known.
          mfa_known: usedMethodFallback ? methods != null : mfaKnown,
        },
      }
    })

    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from('entra_users')
        .upsert(rows.slice(i, i + 100), { onConflict: 'org_id,entra_id' })
      if (error) throw new Error(`Saving users failed: ${error.message}`)
    }
    // Users no longer in the directory (deleted or off-boarded) are removed.
    const { error: cleanupError, count: removed } = await supabase.from('entra_users')
      .delete({ count: 'exact' }).eq('org_id', org_id).lt('synced_at', syncedAt)
    if (cleanupError) console.warn('[entra-directory] stale user cleanup', cleanupError.message)

    // ── Summary ──────────────────────────────────────────────────────────────
    const enabled = rows.filter(r => r.account_enabled)
    const inactiveCutoff = Date.now() - INACTIVE_DAYS * 86400_000
    const counts = {
      open: {
        users: rows.length,
        no_mfa: mfaKnown
          ? enabled.filter(r => r.raw_data.mfa_known && !r.is_mfa_registered).length
          : null,
        privileged: sources.roles?.state === 'ok' ? rows.filter(r => r.is_privileged).length : null,
        guests: rows.filter(r => r.user_type === 'Guest').length,
        disabled: rows.filter(r => !r.account_enabled).length,
        inactive: enabled.filter(r => r.last_sign_in && new Date(r.last_sign_in).getTime() < inactiveCutoff).length,
      },
      users_synced: rows.length,
      users_removed: removed ?? 0,
      signins_synced: signInsSynced,
      sign_in_dates: signInActivity ? 'directory' : (sources.signins?.state === 'ok' ? 'sign-in logs' : 'unavailable'),
    }

    const states = Object.values(sources).map(s => s.state)
    const hardFail = states.filter(s => s === 'error' || s === 'no_permission').length
    const status = hardFail > 0 ? 'partial' : 'success'

    if (runId) {
      await supabase.from('connector_scan_runs').update({
        status, finished_at: new Date().toISOString(), sources, counts, warnings,
      }).eq('id', runId)
    }
    await supabase.from('org_connectors').update({ last_synced: new Date().toISOString() })
      .eq('org_id', org_id).eq('connector_id', CONNECTOR)
    if (warnings.length) console.warn('[entra-directory] warnings', JSON.stringify(warnings))

    return json({
      run_id: runId, status, sources, counts, warnings,
      // Kept for older clients.
      success: true, users_synced: rows.length, signins_synced: signInsSynced, tenant_id: tenantId,
    })
  } catch (err) {
    if (runId) {
      await supabase.from('connector_scan_runs').update({
        status: 'failed', finished_at: new Date().toISOString(),
        error: (err as Error)?.message ?? String(err),
      }).eq('id', runId)
    }
    return errorResponse(err, 'entra-directory')
  }
})
