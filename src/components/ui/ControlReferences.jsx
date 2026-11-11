import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { parseControlRefs, eccControlPath, cccControlPath, pdplControlPath, deriveCccRefs, derivePdplRefs } from '@/lib/controlRefs'
import { mainControlId } from '@/data/eccAutomation'
import { CCC_FROM_ECC_EVIDENCE, cccMainId, cccProfile } from '@/data/cccAutomation'
import { PDPL_FROM_ECC_EVIDENCE, pdplProfile, printedSubId } from '@/data/pdplAutomation'
import { useAuth } from '@/hooks/useAuth'
import { tx, localizeRow } from '@/lib/i18n'

// Control references on a finding. Each reference is a chip; opening one shows
// the regulator's text and the implementation guidance, so a finding can be
// explained against the exact clause it is evidence for.
//
// In a workspace that is a cloud service tenant (CCC scope set), the CCC
// tenant controls a finding also evidences are added beside its ECC
// references, marked as derived from the ECC control they come through. With
// SDAIA PDPL in scope, the PDPL articles a finding also evidences are added
// the same way.

const cache = new Map()   // reference key → loaded detail
let guidesPromise = null  // bundled reference content, loaded once

let cccGuidePromise = null
function loadCccGuide() {
  if (!cccGuidePromise) cccGuidePromise = import('@/data/cccGuidance.json').then(m => m.default ?? m).catch(() => null)
  return cccGuidePromise
}

function loadGuides() {
  if (!guidesPromise) {
    guidesPromise = Promise.all([
      import('@/data/eccGuidance.json').then(m => m.default ?? m).catch(() => null),
      import('@/data/eccImplementationGuide.json').then(m => m.default ?? m).catch(() => null),
    ]).then(([nca, risys]) => ({ nca, risys }))
  }
  return guidesPromise
}

export async function loadDetail(ref) {
  if (cache.has(ref.key)) return cache.get(ref.key)
  let detail = null
  if (ref.type === 'ecc') {
    const main = mainControlId(ref.id)
    const ids = [...new Set([ref.id, main])]
    const [{ data }, guides] = await Promise.all([
      // select('*') so the Arabic columns come along when the migration is applied,
      // without failing when it is not.
      supabase.from('nca_ecc').select('*').in('control_id', ids),
      loadGuides(),
    ])
    const rowsL = (data || []).map(localizeRow)
    const row = rowsL.find(r => r.control_id === ref.id)
    const parent = ref.id !== main ? rowsL.find(r => r.control_id === main) : null
    const ncaNode = guides.nca?.controls?.[ref.id]?.nca_official || guides.nca?.controls?.[main]?.nca_official || null
    detail = {
      heading: row ? `${row.subdomain_id} ${row.subdomain_name}` : null,
      text: row?.control_text || null,
      parentText: parent?.control_text || null,
      parentId: parent ? main : null,
      guide: guides.risys?.controls?.[main] || null,
      guideCaveat: guides.risys?.source?.caveat || null,
      nca: (ncaNode || []).filter(s => ['guidelines', 'deliverables'].includes(s.key)),
      ncaCaveat: guides.nca?.sources?.nca_official?.caveat || null,
      ncaFromParent: !guides.nca?.controls?.[ref.id]?.nca_official && !!ncaNode,
    }
  } else if (ref.type === 'ccc') {
    const main = cccMainId(ref.id)
    const ids = [...new Set([ref.id, main])]
    const [{ data }, guide] = await Promise.all([
      supabase.from('nca_ccc').select('*').in('control_id', ids),
      loadCccGuide(),
    ])
    const rowsL = (data || []).map(localizeRow)
    const row = rowsL.find(r => r.control_id === ref.id)
    const parent = ref.id !== main ? rowsL.find(r => r.control_id === main) : null
    const node = guide?.controls?.[ref.id] || null
    detail = {
      heading: row ? `${row.subdomain_id} ${row.subdomain_name}` : null,
      role: row?.role || null,
      text: row?.control_text || null,
      parentText: parent?.control_text || null,
      parentId: parent ? main : null,
      nca: (node?.nca_official || []).filter(sec => ['guidelines', 'deliverables'].includes(sec.key)),
      ncaSource: node?.nca_source ? guide.sources?.[node.nca_source] : null,
      risys: (node?.risys || []).filter(sec => ['data', 'finding'].includes(sec.key)),
    }
  } else if (ref.type === 'pdpl') {
    const { data } = await supabase.from('sdaia_pdpl')
      .select('control_id, control_type, control_text, article_title')
      .eq('subdomain_id', ref.id).order('sort_order')
    const rows = data || []
    const main = rows.find(r => r.control_type === 'Main Control')
    detail = {
      heading: main ? `${ref.article} · ${main.article_title} (${ref.part})` : `${ref.article} (${ref.part})`,
      lead: main?.control_text || null,
      clauses: rows.filter(r => r.control_type !== 'Main Control').map(c => ({ id: c.control_id, text: c.control_text })),
    }
  }
  cache.set(ref.key, detail)
  return detail
}

export function ControlReferences({ control, compact = false }) {
  const { organization } = useAuth()
  const scope = cccProfile(organization)
  const parsed = parseControlRefs(control)
  // CCC chips only for a workspace with CCC in scope, and derived ones only for tenants.
  const stated = scope ? parsed : parsed.filter(r => r.type !== 'ccc')
  const withCcc = scope?.roles.includes('CST') ? [...stated, ...deriveCccRefs(stated, CCC_FROM_ECC_EVIDENCE)] : stated
  const refs = pdplProfile(organization) ? [...withCcc, ...derivePdplRefs(withCcc, PDPL_FROM_ECC_EVIDENCE)] : withCcc
  const [open, setOpen] = useState(null)
  if (!refs.length) return null
  const active = refs.find(r => r.key === open)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {!compact && <BookOpen size={12} style={{ color: '#5D0F0F' }} />}
        {refs.map(ref => {
          const isOpen = ref.key === open
          const linkable = ref.type !== 'text'
          return (
            <button key={ref.key} type="button" disabled={!linkable}
              onClick={() => setOpen(isOpen ? null : ref.key)}
              title={ref.derived
                ? (ref.type === 'pdpl'
                    ? tx('Also evidences this PDPL article, through ECC {{id}}', { id: ref.via })
                    : tx('Also evidences this CCC tenant control, through ECC {{id}}', { id: ref.via }))
                : linkable ? tx('Show the control text and implementation guidance') : undefined}
              className="inline-flex items-center gap-1"
              style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                color: ref.type === 'ccc' ? '#6d28d9' : '#5D0F0F',
                background: isOpen ? (ref.type === 'ccc' ? '#f5f3ff' : '#F6EBE8') : '#fff',
                border: `1px ${ref.derived ? 'dashed' : 'solid'} ${ref.type === 'ccc' ? '#ddd6fe' : isOpen ? '#d9b8b1' : '#eadcd8'}`,
                cursor: linkable ? 'pointer' : 'default',
              }}>
              <span>{ref.code}</span>
              {ref.name && <span style={{ fontWeight: 400, color: '#6b4a4a' }}>· {ref.name}</span>}
              {linkable && <ChevronDown size={11} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />}
            </button>
          )
        })}
      </div>
      {active && <ReferencePanel key={active.key} ref_={active} />}
    </div>
  )
}

function ReferencePanel({ ref_: ref }) {
  const [detail, setDetail] = useState(cache.get(ref.key) || null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let cancelled = false
    if (!detail) loadDetail(ref).then(d => { if (!cancelled) setDetail(d) }).catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [ref.key]) // eslint-disable-line react-hooks/exhaustive-deps

  const box = { marginTop: 8, padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid #eadcd8', fontSize: 12, lineHeight: 1.55, color: '#2a1f1f' }
  const h = { fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8a7070', margin: '10px 0 4px' }

  if (error) return <div style={box}>{tx('Could not load the control text.')}</div>
  if (!detail) return <div style={box}>{tx('Loading…')}</div>

  if (ref.type === 'ccc') {
    return (
      <div style={box}>
        <p style={{ fontWeight: 600 }}>{tx('NCA CCC-2:2024 ·')} {ref.id}{detail.heading ? ` · ${detail.heading.replace(/^\S+\s/, '')}` : ''}</p>
        {ref.derived && (
          <p style={{ color: '#6b5555', marginTop: 2 }}>
            {tx('Derived: the finding is keyed to ECC {{id}}, and on a cloud service the same evidence serves this CCC tenant control.', { id: ref.via })}
          </p>
        )}
        <p style={h}>{tx('Control text')}</p>
        {detail.parentText && (
          <p style={{ color: '#6b5555' }}>{detail.parentId}: {detail.parentText}</p>
        )}
        <p style={{ fontWeight: 500, paddingInlineStart: detail.parentText ? 12 : 0 }}>
          {detail.parentText ? `${ref.id}: ` : ''}{detail.text || tx('Control text not loaded.')}
        </p>

        {detail.risys.map(section => (
          <div key={section.key}>
            <p style={h}>{tx('RISYS ·')} {section.label}</p>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {section.items.slice(0, 6).map((it, i) => <li key={i}>{it.text}</li>)}
            </ul>
          </div>
        ))}

        {detail.nca.map(section => (
          <div key={section.key}>
            <p style={h}>{tx('NCA guide ·')} {section.label}</p>
            <ul style={{ margin: 0, paddingInlineStart: 18 }}>
              {section.items.slice(0, 8).map((it, i) => (
                <li key={i} style={{ marginInlineStart: (it.level || 0) * 16, listStyle: it.level ? 'circle' : 'disc' }}>{it.text}</li>
              ))}
            </ul>
          </div>
        ))}
        {detail.nca.length > 0 && detail.ncaSource && (
          <p style={{ fontSize: 10.5, color: '#8a7070', marginTop: 6 }}>{detail.ncaSource.version}. {detail.ncaSource.caveat}</p>
        )}

        <a href={cccControlPath(ref.id)} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2" style={{ color: '#6d28d9', fontWeight: 600 }}>{tx('Open control')} {ref.id} {tx('in RISYS (full guidance, status and evidence)')} <ExternalLink size={11} />
        </a>
      </div>
    )
  }

  if (ref.type === 'pdpl') {
    return (
      <div style={box}>
        <p style={{ fontWeight: 600 }}>{tx('SDAIA PDPL ·')} {detail.heading}</p>
        {ref.derived && (
          <p style={{ color: '#6b5555', marginTop: 2 }}>
            {tx('Derived: the finding is keyed to ECC {{id}}, and the same evidence serves this PDPL article.', { id: ref.via })}
          </p>
        )}
        {!detail.lead && detail.clauses.length === 0 && <p style={{ color: '#8a7070' }}>{tx('Article text not loaded.')}</p>}
        {detail.lead && <p style={{ marginTop: 6 }}>{detail.lead}</p>}
        <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
          {detail.clauses.map(c => (
            <li key={c.id} style={{ marginBottom: 4 }}>
              <span className="mono" style={{ color: '#5D0F0F', fontWeight: 600 }}>{printedSubId(c.id)}</span> {c.text}
            </li>
          ))}
        </ul>
        <a href={pdplControlPath(ref.id)} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2" style={{ color: '#5D0F0F', fontWeight: 600 }}>{tx('Open {{id}} in RISYS (status, evidence and the Law text)', { id: ref.code })} <ExternalLink size={11} />
        </a>
      </div>
    )
  }

  return (
    <div style={box}>
      <p style={{ fontWeight: 600 }}>{tx('NCA ECC-2:2024 ·')} {ref.id}{detail.heading ? ` · ${detail.heading.replace(/^\S+\s/, '')}` : ''}</p>
      <p style={h}>{tx('Control text')}</p>
      {detail.parentText && (
        <p style={{ color: '#6b5555' }}>{detail.parentId}: {detail.parentText}</p>
      )}
      <p style={{ fontWeight: 500, paddingInlineStart: detail.parentText ? 12 : 0 }}>
        {detail.parentText ? `${ref.id}: ` : ''}{detail.text || tx('Control text not loaded.')}
      </p>

      {detail.guide && (
        <>
          <p style={h}>{tx('What it requires')}{detail.parentId ? ` (main control ${detail.parentId})` : ''}</p>
          <p>{detail.guide.plain}</p>
          {detail.guide.how && <p style={{ marginTop: 4 }}><strong>{tx('How to implement:')}</strong> {detail.guide.how}</p>}
          {detail.guide.evidence && <p style={{ marginTop: 4 }}><strong>{tx('Evidence an auditor expects:')}</strong> {detail.guide.evidence}</p>}
        </>
      )}

      {detail.nca.map(section => (
        <div key={section.key}>
          <p style={h}>{tx('NCA guide ·')} {section.label}{detail.ncaFromParent ? ` (from ${detail.parentId})` : ''}</p>
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {section.items.slice(0, 8).map((it, i) => (
              <li key={i} style={{ marginInlineStart: (it.level || 0) * 16, listStyle: it.level ? 'circle' : 'disc' }}>{it.text}</li>
            ))}
          </ul>
        </div>
      ))}
      {detail.nca.length > 0 && detail.ncaCaveat && (
        <p style={{ fontSize: 10.5, color: '#8a7070', marginTop: 6 }}>{detail.ncaCaveat}</p>
      )}

      <a href={eccControlPath(ref.id)} target="_blank" rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-2" style={{ color: '#5D0F0F', fontWeight: 600 }}>{tx('Open control')} {ref.id} {tx('in RISYS (full guidance, status and evidence)')} <ExternalLink size={11} />
      </a>
    </div>
  )
}
