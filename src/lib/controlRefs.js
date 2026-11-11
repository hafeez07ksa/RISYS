// Parses the control label stored on a finding into framework references.
//
// Label format (one or more segments joined by " | "):
//   "NCA ECC 2-7-2 · Data and Information Protection"
//   "SDAIA PDPL-IR Art. 23 · Information Security"          (Implementing Regulation)
//   "SDAIA PDPL-TR Art. 2 · Transfer outside the Kingdom"    (Transfer Regulation)
//   "NCA CCC 2-2-T-1-4 · Identity and Access Management"     (Cloud controls)
// Anything that doesn't match is kept as plain text.

const ECC_RE  = /NCA ECC\s+(\d+(?:-\d+){2,3})/i
const CCC_RE  = /NCA CCC\s+(\d+-\d+-[PT]-\d+(?:-\d+)?)/i
const PDPL_RE = /SDAIA PDPL-(IR|TR)\s+Art\.?\s*(\d+)/i

export function parseControlRefs(label) {
  if (!label) return []
  return String(label).split('|').map(s => s.trim()).filter(Boolean).map((text, i) => {
    const name = text.includes('·') ? text.split('·').slice(1).join('·').trim() : ''
    const ccc = text.match(CCC_RE)
    if (ccc) {
      const id = ccc[1].toUpperCase().replace(/-([pt])-/i, (m, r) => `-${r.toUpperCase()}-`)
      return { key: `ccc:${id}`, type: 'ccc', framework: 'NCA CCC', id, code: `NCA CCC ${id}`, name, text }
    }
    const ecc = text.match(ECC_RE)
    if (ecc) {
      return { key: `ecc:${ecc[1]}`, type: 'ecc', framework: 'NCA ECC', id: ecc[1], code: `NCA ECC ${ecc[1]}`, name, text }
    }
    const pdpl = text.match(PDPL_RE)
    if (pdpl) {
      const part = pdpl[1].toUpperCase() === 'TR' ? 'Transfer Regulation' : 'Implementing Regulation'
      return {
        key: `pdpl:${pdpl[1].toUpperCase()}:${pdpl[2]}`, type: 'pdpl', framework: 'SDAIA PDPL',
        id: `${pdpl[1].toUpperCase()}-${pdpl[2]}`,
        part, article: `Article ${pdpl[2]}`, code: `PDPL-${pdpl[1].toUpperCase()} Art. ${pdpl[2]}`, name, text,
      }
    }
    return { key: `text:${i}`, type: 'text', code: text, name: '', text }
  })
}

/** Route of the full compliance page for an ECC control (official text, NCA guidance, evidence). */
export function eccControlPath(id) {
  return `/app/compliance/${encodeURIComponent('NCA ECC')}/${encodeURIComponent(id)}`
}

/** Route of the compliance page for a CCC control. */
export function cccControlPath(id) {
  return `/app/compliance/${encodeURIComponent('NCA CCC')}/${encodeURIComponent(id)}`
}

/** Route of the compliance page for a PDPL article: IR-23, TR-5, L-12. */
export function pdplControlPath(id) {
  return `/app/compliance/${encodeURIComponent('SDAIA PDPL')}/${encodeURIComponent(id)}`
}

/**
 * PDPL articles the ECC references on a finding also evidence (the
 * PDPL_FROM_ECC_EVIDENCE crosswalk; mirrors framework_crosswalk 'evidence'
 * rows). Returns refs not already on the label, marked derived.
 */
export function derivePdplRefs(refs, fromEcc) {
  const have = new Set(refs.map(r => r.key))
  const out = []
  for (const r of refs) {
    if (r.type !== 'ecc') continue
    for (const id of fromEcc[r.id] || []) {
      const [part, art] = id.split('-')
      const key = `pdpl:${part}:${art}`
      if (have.has(key)) continue
      have.add(key)
      out.push({
        key, type: 'pdpl', framework: 'SDAIA PDPL', id,
        part: part === 'TR' ? 'Transfer Regulation' : 'Implementing Regulation', article: `Article ${art}`,
        code: `PDPL-${part} Art. ${art}`, name: '', text: '', derived: true, via: r.id,
      })
    }
  }
  return out
}

/**
 * CCC tenant controls the ECC references on a finding also evidence, for a
 * workspace that is a cloud service tenant. `fromEcc` is the crosswalk map
 * (CCC_FROM_ECC_EVIDENCE). Returns refs not already on the label, each marked
 * derived with the ECC id it came through.
 */
export function deriveCccRefs(refs, fromEcc) {
  const have = new Set(refs.map(r => r.key))
  const out = []
  for (const r of refs) {
    if (r.type !== 'ecc') continue
    for (const id of fromEcc[r.id] || []) {
      const key = `ccc:${id}`
      if (have.has(key)) continue
      have.add(key)
      out.push({ key, type: 'ccc', framework: 'NCA CCC', id, code: `NCA CCC ${id}`, name: '', text: '', derived: true, via: r.id })
    }
  }
  return out
}
