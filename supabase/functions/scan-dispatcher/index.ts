// scan-dispatcher — runs due connector scans for every tenant.
//
// Called by pg_cron (via pg_net) every 15 minutes with the internal scheduler
// secret in x-risys-internal. It claims due rows from connector_schedules
// (claim_due_scans pushes next_run_at forward first, so two dispatcher runs
// never scan the same tenant twice), calls each connector function
// server-to-server, and records the outcome with backoff on failure.
//
// verify_jwt = false: pg_net has no user session. The secret check below is
// the authentication and it fails closed.
import { adminClient, corsHeaders, errorResponse, HttpError, isInternalCall, json } from '../_shared/auth.ts'

// Connectors that accept internal (scheduled) calls.
const SCHEDULABLE: Record<string, string> = {
  defender: 'defender-security',
  sharepoint: 'sharepoint-security',
}

const BATCH = 10        // schedules claimed per dispatcher run
const CONCURRENCY = 3   // scans running at once

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const admin = adminClient()
    if (!(await isInternalCall(req, admin))) throw new HttpError(401, 'Unauthorized')

    const { data: due, error } = await admin.rpc('claim_due_scans', {
      p_limit: BATCH, p_connectors: Object.keys(SCHEDULABLE),
    })
    if (error) throw new Error(`claim_due_scans failed: ${error.message}`)
    const jobs = (due ?? []) as { org_id: string; connector_id: string }[]
    if (!jobs.length) return json({ dispatched: 0 })

    const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1`
    const secret = req.headers.get('x-risys-internal')!
    const results: { org_id: string; connector_id: string; status: string }[] = []

    const runOne = async (job: { org_id: string; connector_id: string }) => {
      let status = 'failed'
      try {
        const res = await fetch(`${base}/${SCHEDULABLE[job.connector_id]}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'x-risys-internal': secret,
          },
          body: JSON.stringify({ org_id: job.org_id }),
        })
        const body = await res.json().catch(() => ({}))
        status = res.ok ? (body.status ?? 'success') : 'failed'
        if (!res.ok) console.warn('[scan-dispatcher] scan failed', job.connector_id, res.status, body?.error ?? '')
      } catch (e) {
        console.warn('[scan-dispatcher] scan error', job.connector_id, (e as Error)?.message)
      }
      await admin.rpc('record_scheduled_scan', { p_org: job.org_id, p_connector: job.connector_id, p_status: status })
      results.push({ ...job, status })
    }

    const queue = [...jobs]
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) await runOne(queue.shift()!)
    }))

    return json({ dispatched: results.length, results })
  } catch (err) {
    return errorResponse(err, 'scan-dispatcher')
  }
})
