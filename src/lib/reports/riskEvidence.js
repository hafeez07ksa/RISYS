/* ── Evidence for the risk report ─────────────────────────────────────────────
 *
 * Turns the files behind a risk's evidence into something a PDF can carry:
 *
 *   images (PNG, JPEG, GIF, WebP)  drawn on the appendix pages
 *   PDFs                           their pages appended after the report,
 *                                  each stamped with the evidence number
 *   anything else (Word, Excel,    listed with a note to open it in RISYS —
 *   text)                          a PDF cannot show them
 *
 * Files are read with the person's own session, so storage RLS applies: the
 * report never holds a file they could not open from the risk page.
 *
 * Limits keep the finished report under the 25 MB the reports bucket accepts
 * and keep the browser responsive. Whatever is left out is listed with the
 * reason, never silently dropped.
 *
 * The file contents are kept out of the report's model, so the archived
 * snapshot (report_runs.snapshot) stays small; only a summary goes in.
 * -------------------------------------------------------------------------- */
import { supabase } from '@/lib/supabase'
import { RISK_EVIDENCE_BUCKET } from '@/lib/evidence'
import { tx } from '@/lib/i18n'

const MB = 1024 * 1024
export const EVIDENCE_LIMITS = {
  imageBytes: 12 * MB,      // a single image file
  pdfBytes: 15 * MB,        // a single PDF
  totalBytes: 18 * MB,      // everything embedded in one report
  pdfPages: 30,             // pages appended per PDF
  imageMaxSide: 2200,       // larger images are scaled down
}

const ext = (name) => (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '')
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp'])

function kindOf(file) {
  const e = ext(file.file_name || file.file_path)
  if (IMAGE_EXT.has(e)) return 'image'
  if (e === 'pdf') return 'pdf'
  return 'other'
}

const toDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(r.result)
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

/** PNG and JPEG pass through unless they are very large; GIF and WebP are
 *  redrawn as PNG, which is all the PDF renderer accepts. */
async function prepareImage(blob, name) {
  const e = ext(name)
  const bitmap = await createImageBitmap(blob)
  const { width, height } = bitmap
  const scale = Math.min(1, EVIDENCE_LIMITS.imageMaxSide / Math.max(width, height))
  const passThrough = (e === 'png' || e === 'jpg' || e === 'jpeg') && scale === 1
  if (passThrough) {
    bitmap.close?.()
    return { src: await toDataUrl(blob), width, height, bytes: blob.size }
  }
  const w = Math.round(width * scale), h = Math.round(height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  const jpeg = e === 'jpg' || e === 'jpeg'
  if (jpeg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h) }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()
  const out = await new Promise((resolve) => canvas.toBlob(resolve, jpeg ? 'image/jpeg' : 'image/png', 0.88))
  if (!out) throw new Error('image could not be converted')
  return { src: await toDataUrl(out), width: w, height: h, bytes: out.size }
}

/**
 * Reads the evidence files for a risk.
 *
 * @param {string} riskId
 * @param {Array}  evidence  model.evidence, in report order (gives E1, E2 …)
 * @returns {{ byId: Record<string, object>, pdfs: Array<{ ref, bytes, pages }>, summary: Array }}
 */
export async function collectRiskEvidence(riskId, evidence, onStage = () => {}) {
  const byId = {}
  const pdfs = []
  if (!evidence?.length) return { byId, pdfs, summary: [] }

  const { data: rows, error } = await supabase
    .from('risk_evidence').select('id, file_path, file_name, file_size').eq('risk_id', riskId)
  if (error) throw new Error(`Could not read the evidence list: ${error.message}`)
  const files = Object.fromEntries((rows ?? []).map((r) => [r.id, r]))

  let used = 0
  let pdfLib = null
  for (let i = 0; i < evidence.length; i++) {
    const ev = evidence[i]
    const ref = `E${i + 1}`
    const file = files[ev.id]
    const item = { ref, kind: 'none', name: file?.file_name ?? ev.file_name ?? null, size: file?.file_size ?? ev.file_size ?? null }
    byId[ev.id] = item
    if (!file?.file_path) { item.note = tx('No file is attached to this evidence.'); continue }

    item.kind = kindOf(file)
    if (item.kind === 'other') {
      item.note = tx('This file type cannot be shown inside a PDF. Open it from the risk in RISYS.')
      continue
    }
    const limit = item.kind === 'image' ? EVIDENCE_LIMITS.imageBytes : EVIDENCE_LIMITS.pdfBytes
    if ((file.file_size ?? 0) > limit) {
      item.kind = 'skipped'
      item.note = tx('Too large to include ({{size}}). Open it from the risk in RISYS.', { size: fmtSize(file.file_size) })
      continue
    }
    if (used + (file.file_size ?? 0) > EVIDENCE_LIMITS.totalBytes) {
      item.kind = 'skipped'
      item.note = tx('Not included: the report has reached its size limit for evidence. Open it from the risk in RISYS.')
      continue
    }

    onStage(tx('Reading evidence {{n}} of {{total}}', { n: i + 1, total: evidence.length }))
    try {
      const { data: blob, error: dlError } = await supabase.storage.from(RISK_EVIDENCE_BUCKET).download(file.file_path)
      if (dlError || !blob) throw new Error(dlError?.message || 'no data')

      if (item.kind === 'image') {
        const img = await prepareImage(blob, file.file_name || file.file_path)
        Object.assign(item, img)
        used += img.bytes
      } else {
        pdfLib ??= await import('pdf-lib')
        const bytes = new Uint8Array(await blob.arrayBuffer())
        let doc
        try {
          doc = await pdfLib.PDFDocument.load(bytes)
        } catch (e) {
          if (/encrypt/i.test(String(e?.message))) {
            item.kind = 'skipped'
            item.note = tx('This PDF is password-protected, so its pages cannot be added. Open it from the risk in RISYS.')
            continue
          }
          throw e
        }
        const total = doc.getPageCount()
        item.pages = total
        item.appended = Math.min(total, EVIDENCE_LIMITS.pdfPages)
        pdfs.push({ ref, bytes, appended: item.appended, total })
        used += bytes.byteLength
      }
    } catch (e) {
      item.kind = 'error'
      item.note = tx('The file could not be read ({{reason}}). Open it from the risk in RISYS.', { reason: e.message || 'error' })
    }
  }

  const summary = evidence.map((ev) => {
    const it = byId[ev.id]
    return { evidence_id: ev.id, ref: it.ref, kind: it.kind, pages: it.appended ?? null, note: it.note ?? null }
  })
  return { byId, pdfs, summary }
}

/**
 * Appends the evidence PDFs after the report. Each appended page gets a small
 * stamp in its top margin naming the risk, the evidence number and the page,
 * so a printed page can always be traced back. (ASCII only: the stamp uses a
 * standard PDF font.)
 */
export async function appendEvidencePdfs(reportBlob, pdfs, riskRef) {
  if (!pdfs.length) return reportBlob
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const out = await PDFDocument.load(await reportBlob.arrayBuffer())
  const font = await out.embedFont(StandardFonts.Helvetica)
  const safeRef = String(riskRef || '').replace(/[^\x20-\x7E]/g, '')
  for (const p of pdfs) {
    const src = await PDFDocument.load(p.bytes)
    const idx = Array.from({ length: p.appended }, (_, k) => k)
    const pages = await out.copyPages(src, idx)
    pages.forEach((page, k) => {
      out.addPage(page)
      const { width, height } = page.getSize()
      const label = `RISYS ${safeRef ? `${safeRef} ` : ''}- Evidence ${p.ref} - page ${k + 1} of ${p.total}`
      const size = 7
      const w = font.widthOfTextAtSize(label, size)
      page.drawRectangle({ x: width - w - 22, y: height - 19, width: w + 12, height: 13, color: rgb(1, 1, 1), opacity: 0.92 })
      page.drawText(label, { x: width - w - 16, y: height - 15, size, font, color: rgb(0.5, 0.11, 0.13) })
    })
  }
  const bytes = await out.save()
  return new Blob([bytes], { type: 'application/pdf' })
}

export function fmtSize(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / MB).toFixed(1)} MB`
}
