// Shared Microsoft Graph helpers for connector scans: paging, throttling
// retries, and per-source status reporting (connector_scan_runs.sources).

export const GRAPH = 'https://graph.microsoft.com/v1.0'

export type SourceState = 'ok' | 'partial' | 'not_licensed' | 'no_permission' | 'error' | 'skipped'
export interface SourceResult { state: SourceState; detail?: string; count?: number }

// deno-lint-ignore no-explicit-any
export type Json = any

export class SourceError extends Error {
  state: SourceState
  status: number
  constructor(state: SourceState, detail: string, status = 0) {
    super(detail)
    this.state = state
    this.status = status
  }
}

/** Retries throttling (429) and transient 5xx, honouring Retry-After. */
export async function fetchWithRetry(
  url: string, token: string, headers: Record<string, string> = {}, attempts = 4,
): Promise<Response> {
  let res: Response | null = null
  for (let i = 0; i < attempts; i++) {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, ...headers } })
    if ((res.status !== 429 && res.status < 500) || i === attempts - 1) return res
    const retryAfter = Number(res.headers.get('Retry-After'))
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : 500 * 2 ** i
    await res.body?.cancel()
    await new Promise(r => setTimeout(r, waitMs))
  }
  return res!
}

async function failure(res: Response, url: string): Promise<SourceError> {
  const body = await res.json().catch(() => ({}))
  const code = body?.error?.code ?? ''
  const endpoint = url.split('?')[0].replace(/^https:\/\/[^/]+/, '')
  const msg = `${endpoint} returned ${res.status} ${code}`.trim()
  if (res.status === 401 || res.status === 403) return new SourceError('no_permission', msg, res.status)
  return new SourceError('error', msg, res.status)
}

/** GET one Graph resource. Throws SourceError on failure. */
export async function graphGet(url: string, token: string, headers: Record<string, string> = {}): Promise<Json> {
  const res = await fetchWithRetry(url, token, headers)
  if (!res.ok) throw await failure(res, url)
  return res.json()
}

/** GET a collection, following @odata.nextLink. Throws SourceError on failure. */
export async function graphGetAll(
  url: string, token: string, { maxPages = 20, headers = {} }: { maxPages?: number; headers?: Record<string, string> } = {},
): Promise<Json[]> {
  const out: Json[] = []
  let next: string | null = url
  let pages = 0
  while (next && pages < maxPages) {
    const res = await fetchWithRetry(next, token, headers)
    if (!res.ok) throw await failure(res, next)
    const data = await res.json()
    if (Array.isArray(data.value)) out.push(...data.value)
    next = data['@odata.nextLink'] ?? null
    pages++
  }
  return out
}

export function sourceFailure(e: unknown, permission?: string): SourceResult {
  if (e instanceof SourceError) {
    if (e.state === 'no_permission') {
      return {
        state: 'no_permission',
        detail: `Microsoft refused access (${e.message}). Check the app has ${permission ?? 'the required permission'} with admin consent.`,
      }
    }
    return { state: e.state, detail: e.message }
  }
  return { state: 'error', detail: (e as Error)?.message ?? String(e) }
}

/** Run async work over items with a concurrency limit. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }))
  return out
}
