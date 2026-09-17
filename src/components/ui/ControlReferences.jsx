import { useEffect, useState } from 'react'
import { BookOpen, ChevronDown, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { parseControlRefs, eccControlPath } from '@/lib/controlRefs'
import { mainControlId } from '@/data/eccAutomation'

// Control references on a finding. Each reference is a chip; opening one shows
// the regulator's text and the implementation guidance, so a finding can be
// explained against the exact clause it is evidence for.

const cache = new Map()   // reference key → loaded detail
let guidesPromise = null  // bundled reference content, loaded once

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
      supabase.from('nca_ecc').select('control_id, control_text, subdomain_id, subdomain_name').in('control_id', ids),
      loadGuides(),
    ])
    const row = (data || []).find(r => r.control_id === ref.id)
    const parent = ref.id !== main ? (data || []).find(r => r.control_id === main) : null
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
  } else if (ref.type === 'pdpl') {
    const { data } = await supabase.from('sdaia_pdpl')
      .select('article_title, clause_id, clause_text')
      .eq('regulation_part', ref.part).eq('article_id', ref.article).order('id')
    detail = {
      heading: data?.[0] ? `${ref.article} · ${data[0].article_title} (${ref.part})` : `${ref.article} (${ref.part})`,
      clauses: (data || []).map(c => ({ id: c.clause_id, text: c.clause_text })),
    }
  }
  cache.set(ref.key, detail)
  return detail
}

export function ControlReferences({ control, compact = false }) {
  const refs = parseControlRefs(control)
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
              title={linkable ? 'Show the control text and implementation guidance' : undefined}
              className="inline-flex items-center gap-1"
              style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                color: '#5D0F0F', background: isOpen ? '#F6EBE8' : '#fff',
                border: `1px solid ${isOpen ? '#d9b8b1' : '#eadcd8'}`,
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

  if (error) return <div style={box}>Could not load the control text.</div>
  if (!detail) return <div style={box}>Loading…</div>

  if (ref.type === 'pdpl') {
    return (
      <div style={box}>
        <p style={{ fontWeight: 600 }}>SDAIA PDPL · {detail.heading}</p>
        {detail.clauses.length === 0 && <p style={{ color: '#8a7070' }}>Article text not loaded.</p>}
        <ol style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
          {detail.clauses.map((c, i) => <li key={`${c.id}-${i}`} style={{ marginBottom: 4 }}>{c.text}</li>)}
        </ol>
        <a href={`/app/compliance/${encodeURIComponent('SDAIA PDPL')}`} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2" style={{ color: '#5D0F0F', fontWeight: 600 }}>
          Open SDAIA PDPL in RISYS <ExternalLink size={11} />
        </a>
      </div>
    )
  }

  return (
    <div style={box}>
      <p style={{ fontWeight: 600 }}>NCA ECC-2:2024 · {ref.id}{detail.heading ? ` · ${detail.heading.replace(/^\S+\s/, '')}` : ''}</p>
      <p style={h}>Control text</p>
      {detail.parentText && (
        <p style={{ color: '#6b5555' }}>{detail.parentId}: {detail.parentText}</p>
      )}
      <p style={{ fontWeight: 500, paddingInlineStart: detail.parentText ? 12 : 0 }}>
        {detail.parentText ? `${ref.id}: ` : ''}{detail.text || 'Control text not loaded.'}
      </p>

      {detail.guide && (
        <>
          <p style={h}>What it requires{detail.parentId ? ` (main control ${detail.parentId})` : ''}</p>
          <p>{detail.guide.plain}</p>
          {detail.guide.how && <p style={{ marginTop: 4 }}><strong>How to implement:</strong> {detail.guide.how}</p>}
          {detail.guide.evidence && <p style={{ marginTop: 4 }}><strong>Evidence an auditor expects:</strong> {detail.guide.evidence}</p>}
        </>
      )}

      {detail.nca.map(section => (
        <div key={section.key}>
          <p style={h}>NCA guide · {section.label}{detail.ncaFromParent ? ` (from ${detail.parentId})` : ''}</p>
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
        className="inline-flex items-center gap-1 mt-2" style={{ color: '#5D0F0F', fontWeight: 600 }}>
        Open control {ref.id} in RISYS (full guidance, status and evidence) <ExternalLink size={11} />
      </a>
    </div>
  )
}
