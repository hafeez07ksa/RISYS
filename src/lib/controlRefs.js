// Parses the control label stored on a finding into framework references.
//
// Label format (one or more segments joined by " | "):
//   "NCA ECC 2-7-2 · Data and Information Protection"
//   "SDAIA PDPL-IR Art. 23 · Information Security"          (Implementing Regulation)
//   "SDAIA PDPL-TR Art. 2 · Transfer outside the Kingdom"    (Transfer Regulation)
// Anything that doesn't match is kept as plain text.

const ECC_RE  = /NCA ECC\s+(\d+(?:-\d+){2,3})/i
const PDPL_RE = /SDAIA PDPL-(IR|TR)\s+Art\.?\s*(\d+)/i

export function parseControlRefs(label) {
  if (!label) return []
  return String(label).split('|').map(s => s.trim()).filter(Boolean).map((text, i) => {
    const name = text.includes('·') ? text.split('·').slice(1).join('·').trim() : ''
    const ecc = text.match(ECC_RE)
    if (ecc) {
      return { key: `ecc:${ecc[1]}`, type: 'ecc', framework: 'NCA ECC', id: ecc[1], code: `NCA ECC ${ecc[1]}`, name, text }
    }
    const pdpl = text.match(PDPL_RE)
    if (pdpl) {
      const part = pdpl[1].toUpperCase() === 'TR' ? 'Transfer Regulation' : 'Implementing Regulation'
      return {
        key: `pdpl:${pdpl[1]}:${pdpl[2]}`, type: 'pdpl', framework: 'SDAIA PDPL',
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
