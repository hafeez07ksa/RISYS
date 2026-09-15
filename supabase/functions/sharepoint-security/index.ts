// sharepoint-security — site sharing, anonymous links and guest permissions.
// V6: caller must be an admin of org_id.
// V4: uses an app-only Graph token instead of a stored delegated token.
//     Requires application permission Sites.Read.All with admin consent.
import { adminClient, corsHeaders, errorResponse, getMicrosoftAppToken, HttpError, json, requireOrgRole } from '../_shared/auth.ts'

const GRAPH = 'https://graph.microsoft.com/v1.0'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const { org_id } = await req.json().catch(() => ({}))
    const supabase = adminClient()
    await requireOrgRole(req, supabase, org_id)

    const { data: conn, error: connErr } = await supabase
      .from('org_connectors').select('meta')
      .eq('org_id', org_id).eq('connector_id', 'entra').eq('status', 'active').single()
    if (connErr || !conn) throw new HttpError(400, 'Entra connector not connected')

    const token = await getMicrosoftAppToken(conn.meta?.tenant_id)
    let graphFailures = 0

    // deno-lint-ignore no-explicit-any
    async function graphGet(endpoint: string): Promise<any> {
      const res = await fetch(`${GRAPH}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { graphFailures++; return null }
      return res.json()
    }

    // deno-lint-ignore no-explicit-any
    async function graphGetAll(endpoint: string): Promise<any[]> {
      // deno-lint-ignore no-explicit-any
      const results: any[] = []
      let url: string | null = `${GRAPH}${endpoint}`
      let pages = 0
      while (url && pages < 20) {
        const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) { graphFailures++; break }
        const data: any = await res.json()
        if (data.value) results.push(...data.value)
        url = data['@odata.nextLink'] ?? null
        pages++
      }
      return results
    }

    const sites = await graphGetAll('/sites?search=*&$top=100&$select=id,name,displayName,webUrl,createdDateTime')
    const sitesListFailed = graphFailures > 0
    // deno-lint-ignore no-explicit-any
    const findings: any[] = []

    for (const site of sites.slice(0, 50)) {
      const siteId = site.id
      const siteName = site.displayName || site.name || 'Unknown Site'
      const siteUrl = site.webUrl ?? ''

      const siteDetail = await graphGet(`/sites/${siteId}?$select=sharingCapability,isPublic`)
      const sharingCap = siteDetail?.sharingCapability ?? null

      if (sharingCap === 'ExternalUserAndGuestSharing') {
        findings.push({
          org_id, finding_id: `sp:external:${siteId}`, source: 'sharing', category: 'external_sharing', severity: 'critical',
          title: `External Sharing Enabled — ${siteName}`,
          description: `Site "${siteName}" has external sharing enabled for anyone with a link. Sensitive files on this site can be shared outside the organisation without authentication.`,
          control: 'NCA ECC 2-3 · Information Asset Classification · PDPL Article 5',
          recommendation: 'Set external sharing to "Only people in your organisation" unless there is a documented business requirement. Review all existing shared links.',
          subject_id: siteId, subject_name: siteName, subject_email: null, subject_url: siteUrl,
          raw_data: { ...siteDetail, siteName, siteUrl },
        })
      } else if (sharingCap === 'ExternalUserSharingOnly') {
        findings.push({
          org_id, finding_id: `sp:extuser:${siteId}`, source: 'sharing', category: 'external_sharing', severity: 'warning',
          title: `Guest Sharing Enabled — ${siteName}`,
          description: `Site "${siteName}" allows sharing with authenticated external users (guests). Review whether this is intentional and whether shared content is appropriately classified.`,
          control: 'NCA ECC 2-3 · Information Asset Classification · PDPL Article 5',
          recommendation: 'Audit the guest access list for this site. Ensure externally shared content does not include personal data or confidential information under PDPL.',
          subject_id: siteId, subject_name: siteName, subject_email: null, subject_url: siteUrl,
          raw_data: { ...siteDetail, siteName, siteUrl },
        })
      }

      const drives = await graphGetAll(`/sites/${siteId}/drives?$select=id,name`)
      for (const drive of drives.slice(0, 3)) {
        const sharedItems = await graphGetAll(
          `/drives/${drive.id}/root/children?$filter=shared ne null&$select=id,name,webUrl,shared,size,lastModifiedDateTime&$top=50`,
        )
        for (const item of sharedItems) {
          if (!item.shared) continue
          if (item.shared.scope === 'anonymous') {
            findings.push({
              org_id, finding_id: `sp:anon:${item.id}`, source: 'shared_file', category: 'public_file', severity: 'critical',
              title: `Publicly Accessible File — ${item.name}`,
              description: `File "${item.name}" in site "${siteName}" has an anonymous (anyone with link) share link. Anyone on the internet can access this file without authentication.`,
              control: 'NCA ECC 2-3 · Data Classification · PDPL Article 13',
              recommendation: 'Remove the anonymous share link immediately. Verify whether this file contains personal or confidential data. If sharing is required, limit to authenticated users only.',
              subject_id: item.id, subject_name: item.name, subject_email: null, subject_url: item.webUrl,
              raw_data: { ...item, siteName, driveName: drive.name },
            })
          } else if (item.shared.scope === 'organization') {
            const sizeMb = Math.round((item.size ?? 0) / (1024 * 1024))
            if (sizeMb > 50) {
              findings.push({
                org_id, finding_id: `sp:orgshare:${item.id}`, source: 'shared_file', category: 'internal_exposure', severity: 'info',
                title: `Large File Shared Org-Wide — ${item.name}`,
                description: `File "${item.name}" (${sizeMb} MB) in site "${siteName}" is shared with all organisation members.`,
                control: 'NCA ECC 2-3 · Information Asset Management',
                recommendation: 'Verify the file classification. If it contains sensitive or personal data, restrict sharing to specific users or groups.',
                subject_id: item.id, subject_name: item.name, subject_email: null, subject_url: item.webUrl,
                raw_data: { ...item, siteName, driveName: drive.name },
              })
            }
          }
        }
      }

      const permissions = await graphGetAll(`/sites/${siteId}/permissions`)
      // deno-lint-ignore no-explicit-any
      const guestPerms = permissions.filter((p: any) =>
        // deno-lint-ignore no-explicit-any
        p.grantedToIdentitiesV2?.some((g: any) => g.user?.userType === 'Guest') || p.grantedToV2?.user?.userType === 'Guest')
      if (guestPerms.length > 0) {
        findings.push({
          org_id, finding_id: `sp:guests:${siteId}`, source: 'permissions', category: 'guest_access', severity: 'warning',
          title: `${guestPerms.length} Guest(s) with Site Access — ${siteName}`,
          description: `Site "${siteName}" has ${guestPerms.length} external guest user(s) with direct site permissions. Guest access should be time-limited and regularly reviewed.`,
          control: 'NCA ECC 2-1-4 · Third-Party Access Management · PDPL Article 5',
          recommendation: 'Review the guest access list and verify ongoing business need. Remove guests who no longer require access.',
          subject_id: siteId, subject_name: siteName, subject_email: null, subject_url: siteUrl,
          raw_data: { guestCount: guestPerms.length, siteName, siteUrl },
        })
      }
    }

    if (findings.length > 0) {
      const { error: upsertErr } = await supabase.from('sharepoint_findings').upsert(findings, { onConflict: 'org_id,finding_id' })
      if (upsertErr) throw new Error(`Upsert failed: ${upsertErr.message}`)
    }

    // Don't wipe existing findings if we couldn't even list sites (e.g. missing consent)
    if (!sitesListFailed) {
      const activeIds = new Set(findings.map(f => f.finding_id))
      const { data: existing } = await supabase.from('sharepoint_findings').select('finding_id').eq('org_id', org_id)
      const stale = (existing ?? []).map(r => r.finding_id).filter(id => !activeIds.has(id))
      for (let i = 0; i < stale.length; i += 100) {
        await supabase.from('sharepoint_findings').delete().eq('org_id', org_id).in('finding_id', stale.slice(i, i + 100))
      }
    }

    return json({
      findings_upserted: findings.length,
      breakdown: {
        external_sharing: findings.filter(f => f.category === 'external_sharing').length,
        public_files: findings.filter(f => f.category === 'public_file').length,
        guest_access: findings.filter(f => f.category === 'guest_access').length,
        internal_exposure: findings.filter(f => f.category === 'internal_exposure').length,
        sites_scanned: sites.length,
      },
      ...(sitesListFailed ? { warnings: ['Could not list SharePoint sites — check Sites.Read.All consent'] } : {}),
    })
  } catch (err) {
    return errorResponse(err, 'sharepoint-security')
  }
})
