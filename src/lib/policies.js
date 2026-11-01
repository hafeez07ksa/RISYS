import { supabase } from '@/lib/supabase'
import { tx } from '@/lib/i18n'

/* ── Policies, exceptions and the evidence library: shared vocabulary ────────
 *
 * The rules live in the database (see the 2026-10-31 migrations): who may
 * approve at which authority, that a published version never changes, that a
 * person cannot review their own evidence or decide their own exception. This
 * file only holds the labels, the badge tones and the file helpers the pages
 * share.
 * -------------------------------------------------------------------------- */

export const labelOf = (list, v) => list.find((x) => x.value === v)?.label ?? v ?? '—'

export const POLICY_KINDS = [
  { value: 'policy', label: tx('Policy') },
  { value: 'procedure', label: tx('Procedure') },
  { value: 'standard', label: tx('Standard') },
  { value: 'plan', label: tx('Plan') },
]
export const CRITICALITY = [
  { value: 'low', label: tx('Low') },
  { value: 'medium', label: tx('Medium') },
  { value: 'high', label: tx('High') },
  { value: 'critical', label: tx('Critical') },
]
export const REVIEW_MONTHS = [
  { value: 6, label: tx('Every 6 months') },
  { value: 12, label: tx('Every year') },
  { value: 24, label: tx('Every 2 years') },
]
export const POLICY_STATUSES = [
  { value: 'draft', label: tx('Draft') },
  { value: 'in_review', label: tx('In review') },
  { value: 'approved', label: tx('Approved') },
  { value: 'published', label: tx('Published') },
  { value: 'retired', label: tx('Retired') },
]
export const VERSION_STATUSES = [
  ...POLICY_STATUSES.slice(0, 4),
  { value: 'superseded', label: tx('Superseded') },
  { value: 'retired', label: tx('Retired') },
]
export const RELATIONS = [
  { value: 'documents', label: tx('Documents the requirement') },
  { value: 'reviews', label: tx('Covers its periodic review') },
  { value: 'supports', label: tx('Supports it') },
]
export const AUDIENCE_KINDS = [
  { value: 'everyone', label: tx('Everyone in the workspace') },
  { value: 'role', label: tx('A role') },
  { value: 'group', label: tx('A group') },
  { value: 'business_unit', label: tx('A business unit') },
  { value: 'entra_department', label: tx('An Entra department') },
]
export const AUTHORITIES = [
  { value: 'risk_owner', label: tx('Risk owner') },
  { value: 'ciso', label: tx('CISO') },
  { value: 'committee', label: tx('Committee') },
  { value: 'board', label: tx('Board') },
]
/* Mirrors authority_for_rating() in the database. */
export const AUTHORITY_FOR = { low: 'risk_owner', medium: 'ciso', high: 'committee', critical: 'board' }

export const EXCEPTION_SUBJECTS = [
  { value: 'policy', label: tx('Policy') },
  { value: 'requirement', label: tx('Framework requirement') },
  { value: 'control', label: tx('Control') },
  { value: 'finding', label: tx('Finding') },
  { value: 'vendor', label: tx('Vendor') },
]
export const EXCEPTION_STATUSES = [
  { value: 'submitted', label: tx('Awaiting decision') },
  { value: 'approved', label: tx('Approved') },
  { value: 'rejected', label: tx('Rejected') },
  { value: 'expired', label: tx('Expired') },
  { value: 'revoked', label: tx('Revoked') },
]
/* Longest exception allowed per rating, in months (request_exception()). */
export const EXCEPTION_MAX_MONTHS = { critical: 6, high: 12, medium: 24, low: 24 }

export const EVIDENCE_KINDS = [
  { value: 'document', label: tx('Document') },
  { value: 'export', label: tx('System export') },
  { value: 'screenshot', label: tx('Screenshot') },
  { value: 'record', label: tx('Record or log') },
  { value: 'attestation_set', label: tx('Attestation set') },
  { value: 'policy_version', label: tx('Published policy') },
]
export const EVIDENCE_REVIEW = [
  { value: 'pending', label: tx('Awaiting review') },
  { value: 'accepted', label: tx('Accepted') },
  { value: 'returned', label: tx('Returned') },
]

export const TONES = {
  policy: { draft: 'neutral', in_review: 'medium', approved: 'info', published: 'low', retired: 'neutral', superseded: 'neutral' },
  criticality: { low: 'low', medium: 'medium', high: 'high', critical: 'critical' },
  exception: { submitted: 'medium', approved: 'low', rejected: 'critical', expired: 'neutral', revoked: 'neutral' },
  evidence: { pending: 'medium', accepted: 'low', returned: 'critical' },
  attestation: { pending: 'medium', accepted: 'low', excused: 'neutral' },
}

/* Postgres raises the guard text as the message; show the database's sentence. */
export function fail(error) {
  if (!error) return
  throw new Error(error.message?.replace(/^.*?ERROR:\s*/, '') || tx('The change was refused.'))
}

export const todayRiyadh = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)
export const addMonths = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
export const daysUntil = (iso) => iso ? Math.round((new Date(`${iso}T12:00:00Z`) - new Date(`${todayRiyadh()}T12:00:00Z`)) / 86400e3) : null

/* ── Files ────────────────────────────────────────────────────────────────── */

export const LIBRARY_BUCKET = 'compliance-evidence'

export async function sha256Hex(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Upload under <org>/library/<area>/ (policies | evidence) and describe the file. */
export async function uploadLibraryFile(orgId, area, file) {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${orgId}/library/${area}/${Date.now()}_${safe}`
  const sha256 = await sha256Hex(file)
  const { error } = await supabase.storage.from(LIBRARY_BUCKET).upload(path, file, { upsert: false, cacheControl: '3600' })
  if (error) throw new Error(`${tx('File upload failed:')} ${error.message}`)
  return { bucket: LIBRARY_BUCKET, path, name: file.name, size: file.size, type: file.type || null, sha256 }
}

export async function openLibraryFile(f) {
  const win = window.open('', '_blank')
  try {
    const { data, error } = await supabase.storage.from(f.bucket || LIBRARY_BUCKET).createSignedUrl(f.path, 60)
    if (error) throw new Error(`${tx('Could not open the file:')} ${error.message}`)
    if (win) { win.opener = null; win.location.href = data.signedUrl } else window.location.assign(data.signedUrl)
  } catch (err) { if (win) win.close(); throw err }
}

export const fileSize = (n) => !n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`
