// m365-security — Exchange forwarding, SharePoint sharing and stale-guest findings (app-only token).
// V6: caller must be an admin of org_id. V12: per-user logging removed.
import { adminClient, corsHeaders, errorResponse, getMicrosoftAppToken, HttpError, json, requireOrgRole } from '../_shared/auth.ts'

const ALL_SCOPES = ['exchange', 'sharepoint', 'guests'] as const

// Control references (NCA ECC-2:2024 and SDAIA PDPL, verified against nca_ecc and sdaia_pdpl).
const CONTROL = {
  forwarding: 'NCA ECC 2-7-2 · Data and Information Protection | NCA ECC 2-4-2 · Email Protection | SDAIA PDPL-IR Art. 20 · Disclosure of Personal Data | SDAIA PDPL-TR Art. 2 · Transfer of Personal Data outside the Kingdom',
  sharing:    'NCA ECC 2-7-2 · Data and Information Protection | NCA ECC 2-2-3-3 · User Authorization (need-to-know, least privilege) | SDAIA PDPL-IR Art. 23 · Information Security',
  guests:     'NCA ECC 2-2-3-5 · Periodic Review of Identities and Access Rights | SDAIA PDPL-IR Art. 23 · Information Security',
}
type Scope = typeof ALL_SCOPES[number]

// deno-lint-ignore no-explicit-any
async function graphGet(url: string, token: string): Promise<any> {
  const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' } })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    // deno-lint-ignore no-explicit-any
    throw new Error(`Graph ${res.status}: ${(err as any)?.error?.message || res.statusText}`)
  }
  return res.json()
}

// deno-lint-ignore no-explicit-any
async function graphGetAll(url: string, token: string, maxPages = 10): Promise<any[]> {
  // deno-lint-ignore no-explicit-any
  const results: any[] = []
  let next: string | null = url
  let page = 0
  while (next && page < maxPages) {
    const data: any = await graphGet(next, token)
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
    if (connError || !conn) throw new HttpError(400, 'Entra connector not found')

    const tenantId: string = conn.meta?.tenant_id
    const savedScopes: string[] = conn.meta?.m365_scopes || [...ALL_SCOPES]
    const enabledScopes = new Set<Scope>(savedScopes.filter(s => ALL_SCOPES.includes(s as Scope)) as Scope[])
    const skipped = ALL_SCOPES.filter(s => !enabledScopes.has(s))

    const token = await getMicrosoftAppToken(tenantId)
    // deno-lint-ignore no-explicit-any
    const findings: any[] = []
    const syncedAt = new Date().toISOString()
    const breakdown: Record<string, number> = { exchange: 0, sharepoint: 0, guests: 0 }

    // ── 1. Exchange: forwarding detection ────────────────────────────────────
    if (enabledScopes.has('exchange')) {
      try {
        const users = await graphGetAll(
          'https://graph.microsoft.com/v1.0/users?$select=id,userPrincipalName,displayName,mail,accountEnabled&$top=999',
          token,
        )
        // NOTE: organisation-domain detection bug (B2) is tracked separately.
        const orgDomain = users
          // deno-lint-ignore no-explicit-any
          .map((u: any) => (u.userPrincipalName || '').split('@')[1]?.toLowerCase())
          .find((d: string) => d && !d.includes('onmicrosoft') === false)
          // deno-lint-ignore no-explicit-any
          || users.map((u: any) => (u.userPrincipalName || '').split('@')[1]?.toLowerCase()).find(Boolean)

        for (const user of users) {
          if (!user.accountEnabled) continue

          try {
            const settings = await graphGet(`https://graph.microsoft.com/v1.0/users/${user.id}/mailboxSettings`, token)
            if (settings.forwardingSmtpAddress) {
              const fwdDomain = settings.forwardingSmtpAddress.split('@')[1]?.toLowerCase()
              if (orgDomain && fwdDomain && fwdDomain !== orgDomain) {
                findings.push({
                  org_id,
                  finding_id: `exchange:mailboxfwd:${user.userPrincipalName}`,
                  category: 'exchange',
                  severity: 'critical',
                  title: 'Mailbox Forwarding to External Address',
                  description: `${user.displayName || user.userPrincipalName} has mailbox-level forwarding enabled to: ${settings.forwardingSmtpAddress}. All incoming email is being copied to this external address.`,
                  control: CONTROL.forwarding,
                  recommendation: 'Verify this was intentionally configured. If not authorised, disable immediately. Review sign-in logs for account compromise.',
                  subject_id: user.userPrincipalName,
                  subject_name: user.displayName || user.userPrincipalName,
                  subject_email: user.mail || user.userPrincipalName,
                  raw_data: { user, forwardingSmtpAddress: settings.forwardingSmtpAddress },
                  synced_at: syncedAt,
                })
              }
            }
          } catch { /* mailbox may be unlicensed — skip */ }

          try {
            const rules = await graphGetAll(`https://graph.microsoft.com/v1.0/users/${user.id}/mailFolders/inbox/messageRules`, token, 1)
            for (const rule of rules) {
              if (!rule.isEnabled) continue
              const fwdAddresses: string[] = [
                // deno-lint-ignore no-explicit-any
                ...(rule.actions?.forwardTo || []).map((r: any) => r.emailAddress?.address || ''),
                // deno-lint-ignore no-explicit-any
                ...(rule.actions?.forwardAsAttachmentTo || []).map((r: any) => r.emailAddress?.address || ''),
                // deno-lint-ignore no-explicit-any
                ...(rule.actions?.redirectTo || []).map((r: any) => r.emailAddress?.address || ''),
              ].filter(Boolean)
              const externalFwd = fwdAddresses.filter(a => {
                const d = a.split('@')[1]?.toLowerCase()
                return orgDomain && d && d !== orgDomain
              })
              if (externalFwd.length > 0) {
                findings.push({
                  org_id,
                  finding_id: `exchange:rulefwd:${user.userPrincipalName}:${rule.id}`,
                  category: 'exchange',
                  severity: 'critical',
                  title: 'Email Forwarding Rule to External Address',
                  description: `${user.displayName || user.userPrincipalName} has inbox rule "${rule.displayName || 'Unnamed'}" forwarding email to: ${externalFwd.join(', ')}.`,
                  control: CONTROL.forwarding,
                  recommendation: 'Delete the rule if unauthorised and reset the user password. Check sign-in logs.',
                  subject_id: user.userPrincipalName,
                  subject_name: user.displayName || user.userPrincipalName,
                  subject_email: user.mail || user.userPrincipalName,
                  raw_data: { user, rule, externalForwardingTo: externalFwd },
                  synced_at: syncedAt,
                })
              }
            }
          } catch { /* shared mailboxes may fail — skip */ }
        }
        breakdown.exchange = findings.filter(f => f.category === 'exchange').length
      } catch (e) {
        console.warn('[m365-security] Exchange scan failed:', (e as Error).message)
      }
    }

    // ── 2. SharePoint: external sharing ──────────────────────────────────────
    if (enabledScopes.has('sharepoint')) {
      try {
        const sites = await graphGetAll(
          'https://graph.microsoft.com/v1.0/sites?search=*&$select=id,name,displayName,webUrl,sharingCapability&$top=100',
          token, 5,
        )
        for (const site of sites) {
          if (site.sharingCapability && site.sharingCapability !== 'Disabled') {
            const isHighRisk = site.sharingCapability === 'ExternalUserAndGuestSharing'
            findings.push({
              org_id,
              finding_id: `sharepoint:sharing:${site.id}`,
              category: 'sharepoint',
              severity: isHighRisk ? 'critical' : 'warning',
              title: isHighRisk ? 'SharePoint Site Open to Anyone' : 'SharePoint Site Shared with External Users',
              description: `"${site.displayName || site.name}" has external sharing: ${site.sharingCapability}.`,
              control: CONTROL.sharing,
              recommendation: isHighRisk ? 'Disable anonymous sharing immediately.' : 'Review external sharing links and remove unnecessary access.',
              subject_id: site.id,
              subject_name: site.displayName || site.name || site.webUrl,
              subject_email: null,
              raw_data: { site },
              synced_at: syncedAt,
            })
          }
        }
        breakdown.sharepoint = findings.filter(f => f.category === 'sharepoint').length
      } catch (e) {
        console.warn('[m365-security] SharePoint failed:', (e as Error).message)
      }
    }

    // ── 3. Guests ─────────────────────────────────────────────────────────────
    if (enabledScopes.has('guests')) {
      try {
        const guests = await graphGetAll(
          `https://graph.microsoft.com/v1.0/users?$filter=userType eq 'Guest'&$select=id,userPrincipalName,displayName,mail,createdDateTime&$top=999`,
          token,
        )
        for (const guest of guests) {
          const days = Math.floor((Date.now() - new Date(guest.createdDateTime).getTime()) / 86400000)
          if (days > 30) {
            findings.push({
              org_id,
              finding_id: `guest:stale:${guest.id}`,
              category: 'guests',
              severity: 'warning',
              title: 'Stale Guest Account — Review Required',
              description: `${guest.displayName || guest.userPrincipalName} has been a guest for ${days} days without review.`,
              control: CONTROL.guests,
              recommendation: 'Confirm access is still needed. Remove if not.',
              subject_id: guest.userPrincipalName,
              subject_name: guest.displayName || guest.userPrincipalName,
              subject_email: guest.mail || null,
              raw_data: { guest, days },
              synced_at: syncedAt,
            })
          }
        }
        breakdown.guests = findings.filter(f => f.category === 'guests').length
      } catch (e) {
        console.warn('[m365-security] Guests failed:', (e as Error).message)
      }
    }

    // ── Upsert & cleanup (rows not refreshed this run are removed) ────────────
    let upserted = 0
    const BATCH = 50
    for (let i = 0; i < findings.length; i += BATCH) {
      const slice = findings.slice(i, i + BATCH)
      const { error } = await supabase.from('m365_findings').upsert(slice, { onConflict: 'org_id,finding_id' })
      if (error) throw new Error(`Upsert error: ${error.message}`)
      upserted += slice.length
    }
    for (const category of enabledScopes) {
      await supabase.from('m365_findings').delete()
        .eq('org_id', org_id).eq('category', category).lt('synced_at', syncedAt)
    }

    await supabase.from('org_connectors').update({ last_synced: new Date().toISOString() })
      .eq('org_id', org_id).eq('connector_id', 'entra')

    return json({ success: true, findings_upserted: upserted, breakdown, enabled_scopes: [...enabledScopes], skipped, tenant_id: tenantId })
  } catch (err) {
    return errorResponse(err, 'm365-security')
  }
})
