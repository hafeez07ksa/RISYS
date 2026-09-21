/* ── Report generation ────────────────────────────────────────────────────────
 *
 * One path for every report:
 *
 *   report_*_data RPC  →  model (models.js)  →  PDF (@react-pdf/renderer)
 *     →  SHA-256 of the file  →  private `reports` bucket  →  report_runs row
 *
 * The RPCs are SECURITY INVOKER, so a report can only ever contain what the
 * person generating it is allowed to read. The PDF is built in the browser —
 * nothing leaves the tenant's session except the finished file.
 *
 * report_runs is append-only for content: the database refuses any change to
 * the snapshot, file or fingerprint after insert (report_runs_guard), and no
 * one may delete a run. Only the presentation fields (status, presented_at,
 * presented_to, notes) can be updated afterwards.
 *
 * The renderer and fonts are ~1 MB, so everything here is loaded on first use
 * rather than in the main bundle.
 * -------------------------------------------------------------------------- */
import { createElement } from 'react'
import { supabase } from '@/lib/supabase'
import { REPORT_TYPES } from './theme'
import { buildBoardPackModel, buildEccModel, buildAuditModel, fmtDate, fmtDateTime } from './models'

import fontRegular from '@/assets/fonts/IBMPlexSans-Regular.ttf?url'
import fontItalic from '@/assets/fonts/IBMPlexSans-Italic.ttf?url'
import fontMedium from '@/assets/fonts/IBMPlexSans-Medium.ttf?url'
import fontSemiBold from '@/assets/fonts/IBMPlexSans-SemiBold.ttf?url'
import fontBold from '@/assets/fonts/IBMPlexSans-Bold.ttf?url'
import fontDisplay from '@/assets/fonts/DMSerifDisplay-Regular.ttf?url'
import markLight from '@/assets/risys-mark-light.png'
import markDark from '@/assets/risys-mark.png'

export const REPORTS_BUCKET = 'reports'

const TEMPLATES = {
  board_pack:   () => import('./BoardPackPdf'),
  ecc_status:   () => import('./EccStatusPdf'),
  audit_report: () => import('./AuditReportPdf'),
}

let rendererPromise
async function loadRenderer() {
  rendererPromise ??= (async () => {
    const [renderer, assets] = await Promise.all([import('@react-pdf/renderer'), import('./assets')])
    assets.registerReportAssets({
      fonts: { regular: fontRegular, italic: fontItalic, medium: fontMedium, semibold: fontSemiBold, bold: fontBold, display: fontDisplay },
      markLight: new URL(markLight, window.location.href).href,
      markDark: new URL(markDark, window.location.href).href,
    })
    return renderer
  })()
  return rendererPromise
}

async function sha256Hex(buffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Calendar quarters, most recent first — the periods a board pack is usually for. */
export function recentQuarters(count = 6, from = new Date()) {
  const out = []
  let y = from.getFullYear()
  let q = Math.floor(from.getMonth() / 3)
  for (let k = 0; k < count; k++) {
    const start = new Date(y, q * 3, 1)
    const end = new Date(y, q * 3 + 3, 0)
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push({ value: `${y}-Q${q + 1}`, label: `Q${q + 1} ${y}`, start: iso(start), end: iso(end),
               long: `Q${q + 1} ${y} · ${fmtDate(iso(start))} – ${fmtDate(iso(end))}` })
    q -= 1
    if (q < 0) { q = 3; y -= 1 }
  }
  return out
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args)
  if (error) throw new Error(`Could not read the report data: ${error.message}`)
  return data
}

/**
 * Generate, fingerprint, store and record a report.
 *
 * @param {object} p
 * @param {'board_pack'|'ecc_status'|'audit_report'} p.type
 * @param {object} p.organization  { id, name }
 * @param {object} p.user          { id, name }
 * @param {object} [p.period]      { start, end, label } — board pack
 * @param {object} [p.engagement]  { id } — audit report
 * @param {(stage: string) => void} [p.onStage]  progress callback for the UI
 * @returns {Promise<{ run: object, blob: Blob }>}
 */
export async function generateReport({ type, organization, user, period, engagement, onStage = () => {} }) {
  const def = REPORT_TYPES[type]
  if (!def) throw new Error(`Unknown report type: ${type}`)

  onStage('Reading data')
  let model, title, periodLabel = null, periodStart = null, periodEnd = null, engagementId = null
  if (type === 'board_pack') {
    if (!period?.start || !period?.end) throw new Error('Choose a reporting period.')
    const raw = await rpc('report_board_pack_data', { p_org: organization.id, p_start: period.start, p_end: period.end })
    model = buildBoardPackModel(raw)
    title = def.label
    periodLabel = period.label ?? `${fmtDate(period.start)} – ${fmtDate(period.end)}`
    periodStart = period.start
    periodEnd = period.end
  } else if (type === 'ecc_status') {
    const raw = await rpc('report_ecc_status_data', { p_org: organization.id })
    model = buildEccModel(raw)
    title = def.label
    periodLabel = `As at ${fmtDate(new Date())}`
  } else {
    if (!engagement?.id) throw new Error('Choose an audit engagement.')
    const raw = await rpc('report_audit_data', { p_engagement: engagement.id })
    model = buildAuditModel(raw)
    const e = model.engagement
    title = `${def.label}: ${e.title}`
    periodLabel = e.period_start || e.period_end ? `${fmtDate(e.period_start)} – ${fmtDate(e.period_end)}` : null
    periodStart = e.period_start ?? null
    periodEnd = e.period_end ?? null
    engagementId = engagement.id
  }

  onStage('Laying out pages')
  const [renderer, template] = await Promise.all([loadRenderer(), TEMPLATES[type]()])
  const id = crypto.randomUUID()
  const now = new Date()
  const meta = {
    title, shortTitle: def.short, eyebrow: def.short,
    orgName: organization.name, audience: def.audience, classification: def.classification,
    periodLabel, generatedLabel: fmtDateTime(now), generatedBy: user.name ?? null, reportId: id,
  }
  const blob = await renderer.pdf(createElement(template.default, { model, meta })).toBlob()

  onStage('Fingerprinting and filing')
  const buffer = await blob.arrayBuffer()
  const sha256 = await sha256Hex(buffer)
  const filePath = `${organization.id}/reports/${id}.pdf`

  // File first, then the record. If the insert fails the file is unreachable
  // (nothing points at it); the reverse order could leave a record with no file.
  const up = await supabase.storage.from(REPORTS_BUCKET)
    .upload(filePath, blob, { contentType: 'application/pdf', upsert: false, cacheControl: '3600' })
  if (up.error) throw new Error(`Could not store the report: ${up.error.message}`)

  const { data: run, error } = await supabase.from('report_runs').insert({
    id, org_id: organization.id, report_type: type, title,
    period_label: periodLabel, period_start: periodStart, period_end: periodEnd,
    engagement_id: engagementId,
    snapshot: { model, meta, schema: 1 },
    file_path: filePath, file_size: blob.size, sha256,
    generated_by: user.id, generated_at: now.toISOString(),
  }).select().single()
  if (error) throw new Error(`The report was built but could not be recorded: ${error.message}`)

  return { run, blob }
}

/** A short-lived link to an archived report. */
export async function reportSignedUrl(run, { download = false } = {}) {
  if (!run?.file_path) throw new Error('This report has no file.')
  const name = `${(run.title || 'report').replace(/[^\w\s.-]/g, '').trim().replace(/\s+/g, '-')}-${run.id.slice(0, 8)}.pdf`
  const { data, error } = await supabase.storage.from(REPORTS_BUCKET)
    .createSignedUrl(run.file_path, 60, download ? { download: name } : undefined)
  if (error) throw new Error(`Could not open the report: ${error.message}`)
  return data.signedUrl
}

/** Open an archived report in a new tab (opened synchronously so popup blockers allow it). */
export async function openReport(run) {
  const win = window.open('', '_blank')
  try {
    const url = await reportSignedUrl(run)
    if (win) { win.opener = null; win.location.href = url } else window.location.assign(url)
  } catch (err) {
    if (win) win.close()
    throw err
  }
}

/**
 * Re-compute the SHA-256 of the stored file and compare it with the one
 * recorded when the report was generated — proof the file has not changed.
 */
export async function verifyReport(run) {
  const { data, error } = await supabase.storage.from(REPORTS_BUCKET).download(run.file_path)
  if (error) throw new Error(`Could not read the stored file: ${error.message}`)
  const actual = await sha256Hex(await data.arrayBuffer())
  return { ok: actual === run.sha256, actual, expected: run.sha256 }
}
