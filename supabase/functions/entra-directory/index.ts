// entra-directory — syncs Entra users, MFA registration, roles and sign-ins (app-only token).
// V6: caller must be an admin of org_id.
import { adminClient, corsHeaders, errorResponse, getMicrosoftAppToken, HttpError, json, requireOrgRole } from '../_shared/auth.ts'

// deno-lint-ignore no-explicit-any
async function graphGetAll(url: string, token: string, maxPages = 10): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const results: any[] = []
  let next: string | null = url
  let page = 0
  while (next && page < maxPages) {
    const res: Response = await fetch(next, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' } })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      // deno-lint-ignore no-explicit-any
      throw new Error(`Graph ${res.status}: ${(err as any)?.error?.message || res.statusText}`)
    }
    const data: any = await res.json()
    results.push(...(data.value || []))
    next = data['@odata.nextLink'] || null
    page++
  }
  return results
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { org_id } = await req.json().catch(() => ({}))
    const supabase = adminClient()
    await requireOrgRole(req, supabase, org_id)

    const { data: conn, error: connError } = await supabase
      .from('org_connectors').select('meta').eq('org_id', org_id).eq('connector_id', 'entra').single()
    if (connError || !conn) throw new HttpError(400, 'Entra not connected for this org')

    const tenantId: string = conn.meta?.tenant_id
    const token = await getMicrosoftAppToken(tenantId)

    const rawUsers = await graphGetAll(
      'https://graph.microsoft.com/v1.0/users?$select=id,userPrincipalName,displayName,givenName,surname,mail,jobTitle,department,officeLocation,mobilePhone,accountEnabled,userType,createdDateTime&$top=999&$count=true',
      token, 20,
    )
    if (rawUsers.length === 0) throw new Error('No users returned from Graph API — check app permissions')

    // deno-lint-ignore no-explicit-any
    const mfaMap: Record<string, any> = {}
    try {
      const mfaRows = await graphGetAll('https://graph.microsoft.com/v1.0/reports/authenticationMethods/userRegistrationDetails?$top=999', token, 20)
      for (const m of mfaRows) mfaMap[m.id] = m
    } catch (e) {
      console.warn('[entra-directory] MFA details unavailable:', (e as Error).message)
    }

    const roleMap: Record<string, Array<{ id: string; displayName: string }>> = {}
    try {
      const roles = await graphGetAll('https://graph.microsoft.com/v1.0/directoryRoles?$expand=members($select=id)', token, 5)
      for (const role of roles) {
        for (const member of (role.members || [])) {
          (roleMap[member.id] ||= []).push({ id: role.id, displayName: role.displayName })
        }
      }
    } catch (e) {
      console.warn('[entra-directory] Roles unavailable:', (e as Error).message)
    }

    const syncedAt = new Date().toISOString()
    // deno-lint-ignore no-explicit-any
    const rows = rawUsers.map((u: any) => {
      const mfa = mfaMap[u.id] || {}
      const roles = roleMap[u.id] || []
      return {
        org_id,
        entra_id: u.id,
        user_principal_name: u.userPrincipalName || null,
        display_name: u.displayName || null,
        given_name: u.givenName || null,
        surname: u.surname || null,
        job_title: u.jobTitle || null,
        department: u.department || null,
        office_location: u.officeLocation || null,
        mail: u.mail || null,
        mobile_phone: u.mobilePhone || null,
        account_enabled: u.accountEnabled ?? true,
        user_type: u.userType || 'Member',
        created_datetime: u.createdDateTime || null,
        last_sign_in: null,
        is_mfa_registered: mfa.isMfaRegistered ?? false,
        is_mfa_capable: mfa.isMfaCapable ?? false,
        is_sspr_registered: mfa.isSsprRegistered ?? false,
        is_passwordless_capable: mfa.isPasswordlessCapable ?? false,
        default_mfa_method: mfa.defaultMfaMethod || null,
        methods_registered: mfa.methodsRegistered || [],
        directory_roles: roles,
        is_privileged: roles.length > 0,
        risk_level: 'none',
        synced_at: syncedAt,
        raw_data: { user: u, mfa: mfa || null },
      }
    })

    const BATCH = 100
    let upserted = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH)
      const { error } = await supabase.from('entra_users').upsert(batch, { onConflict: 'org_id,entra_id' })
      if (error) throw new Error(`User upsert error: ${error.message}`)
      upserted += batch.length
    }

    // Remove users not refreshed by this sync
    const { error: deleteError } = await supabase
      .from('entra_users').delete().eq('org_id', org_id).lt('synced_at', syncedAt)
    if (deleteError) console.warn('[entra-directory] Stale user cleanup:', deleteError.message)

    let signInsSynced = 0
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const signIns = await graphGetAll(
        `https://graph.microsoft.com/v1.0/auditLogs/signIns?$top=200&$orderby=createdDateTime desc&$filter=createdDateTime ge ${since}`,
        token, 5,
      )
      if (signIns.length > 0) {
        // deno-lint-ignore no-explicit-any
        const logRows = signIns.map((s: any) => ({
          org_id,
          event_id: s.id,
          user_email: s.userPrincipalName || null,
          user_display: s.userDisplayName || null,
          app_name: s.appDisplayName || null,
          status: s.status?.errorCode === 0 ? 'success' : 'failure',
          risk_level: s.riskLevelDuringSignIn || 'none',
          ip_address: s.ipAddress || null,
          location: s.location ? [s.location.city, s.location.countryOrRegion].filter(Boolean).join(', ') : null,
          // deno-lint-ignore no-explicit-any
          mfa_used: s.authenticationDetails?.some((a: any) => a.authenticationMethod !== 'Password') ?? false,
          failure_reason: s.status?.failureReason || null,
          raw_data: s,
          created_at: s.createdDateTime || new Date().toISOString(),
        }))
        for (let i = 0; i < logRows.length; i += BATCH) {
          const { error } = await supabase.from('entra_signin_logs').upsert(logRows.slice(i, i + BATCH), { onConflict: 'org_id,event_id' })
          if (error) console.warn('[entra-directory] Sign-in log upsert:', error.message)
        }
        signInsSynced = logRows.length
      }
    } catch (e) {
      console.warn('[entra-directory] Sign-in logs skipped (needs Entra P1):', (e as Error).message)
    }

    await supabase.from('org_connectors').update({ last_synced: new Date().toISOString() })
      .eq('org_id', org_id).eq('connector_id', 'entra')

    return json({ success: true, users_synced: upserted, signins_synced: signInsSynced, tenant_id: tenantId })
  } catch (err) {
    return errorResponse(err, 'entra-directory')
  }
})
