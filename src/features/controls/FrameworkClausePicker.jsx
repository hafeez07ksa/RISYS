import { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, ChevronDown, ChevronUp, Search, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PRIMARY_FRAMEWORK_ID } from '@/hooks/useCompliance'
import { tx, localizeRow } from '@/lib/i18n'

// ── Framework registry ────────────────────────────────────────────────────────
// Column keys differ per framework table, so this picker keeps its own shape.
// Scope, however, is taken from the shared registry — a control can only be
// mapped to a framework that is actually being assessed.
const ALL_FRAMEWORKS = [
  { id: 'NCA ECC',    label: 'NCA ECC',    fullName: tx('Essential Cybersecurity Controls'),         table: 'nca_ecc',     color: '#5D0F0F', bg: '#fdf5f5', tag: tx('Critical Sector'),  idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'SAMA CSF',   label: 'SAMA CSF',   fullName: tx('Cybersecurity Framework'),                  table: 'sama_csf',    color: '#1e40af', bg: '#eff6ff', tag: tx('Financial Sector'), idKey: 'control_id',  textKey: 'control_text',  groupKey: 'subdomain_id', groupName: 'subdomain_name' },
  { id: 'SDAIA PDPL', label: 'SDAIA PDPL', fullName: tx('Personal Data Protection Law'),             table: 'sdaia_pdpl',  color: '#166534', bg: '#f0fdf4', tag: tx('Data Privacy'),     idKey: 'clause_id',   textKey: 'clause_text',   groupKey: 'article_id',   groupName: 'article_title'  },
  { id: 'NCA CCC',    label: 'NCA CCC',    fullName: tx('Cloud Cybersecurity Controls'),             table: 'nca_ccc',     color: '#6d28d9', bg: '#f5f3ff', tag: tx('Cloud'),            idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'NCA DCC',    label: 'NCA DCC',    fullName: tx('Data Cybersecurity Controls'),              table: 'nca_dcc',     color: '#92400e', bg: '#fffbeb', tag: tx('Data'),             idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'NCA TCC',    label: 'NCA TCC',    fullName: tx('Telework Cybersecurity Controls'),          table: 'nca_tcc',     color: '#0e7490', bg: '#ecfeff', tag: tx('Telework'),         idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'NCA CSCC',   label: 'NCA CSCC',   fullName: tx('Cybersecurity Controls for Comms Sector'), table: 'nca_cscc',    color: '#be185d', bg: '#fdf2f8', tag: tx('Telecom'),          idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'NCA NCNICC', label: 'NCA NCNICC', fullName: tx('Non-CNI Private Sector Controls'),         table: 'nca_ncnicc',  color: '#b45309', bg: '#fffbeb', tag: tx('Private Sector'),   idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
]

const FRAMEWORKS = ALL_FRAMEWORKS.filter(f => f.id === PRIMARY_FRAMEWORK_ID)

// ── Clause drill-down within a framework ──────────────────────────────────────
function ClauseList({ fw, onSelect, selected, search }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    setLoading(true)
    supabase.from(fw.table).select('*').order('id')
      .then(({ data }) => { setRows((data || []).map(localizeRow)); setLoading(false) })
  }, [fw.table])

  const filtered = search
    ? rows.filter(r => {
        const text = (r[fw.textKey] || '').toLowerCase()
        const id   = (r[fw.idKey]   || '').toLowerCase()
        return text.includes(search.toLowerCase()) || id.includes(search.toLowerCase())
      })
    : rows

  // Group
  const groups = {}
  for (const row of filtered) {
    const gId   = row[fw.groupKey]   || '—'
    const gName = row[fw.groupName]  || '—'
    if (!groups[gId]) groups[gId] = { id: gId, name: gName, rows: [] }
    groups[gId].rows.push(row)
  }
  const groupList = Object.values(groups)

  if (loading) return (<div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>{tx('Loading requirements…')}</div>)

  if (groupList.length === 0) return (<div style={{ padding: '32px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>{tx('No requirements match your search.')}</div>)

  return (
    <div>
      {groupList.map(g => {
        const isOpen = expanded[g.id] !== false // default open
        return (
          <div key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
            {/* Group header */}
            <button
              onClick={() => setExpanded(e => ({ ...e, [g.id]: !isOpen }))}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '9px 16px', background: 'var(--surface)', border: 'none',
                cursor: 'pointer', textAlign: 'start',
              }}
            >
              {isOpen
                ? <ChevronDown size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                : <ChevronRight
                size={13}
                style={{ color: 'var(--text-3)', flexShrink: 0 }}
                className='rtl-flip' />}
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--crimson)', fontFamily: 'var(--font-mono)', minWidth: 40 }}>{g.id}</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', flex: 1 }}>{g.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{g.rows.length}</span>
            </button>

            {/* Clause rows */}
            {isOpen && g.rows.map(row => {
              const clauseId = row[fw.idKey]
              const text     = row[fw.textKey] || ''
              const isSelected = selected === `${fw.id} ${clauseId}`

              return (
                <button
                  key={clauseId}
                  onClick={() => onSelect(`${fw.id} ${clauseId}`, text)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%',
                    paddingBlock: 9, paddingInlineStart: 36, paddingInlineEnd: 16, border: 'none', cursor: 'pointer',
                    textAlign: 'start',
                    background: isSelected ? '#fdf5f5' : '#fff',
                    borderTop: '1px solid var(--surface)',
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#faf3f1' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#fdf5f5' : '#fff' }}
                >
                  <span style={{
                    fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 600,
                    color: isSelected ? 'var(--crimson)' : 'var(--rose)',
                    flexShrink: 0, minWidth: 80, marginTop: 1,
                  }}>
                    {clauseId}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, flex: 1 }}>
                    {text}
                  </span>
                  {isSelected && (
                    <Check size={13} style={{ color: 'var(--crimson)', flexShrink: 0, marginTop: 2 }} />
                  )}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

// ── Inline clause field ───────────────────────────────────────────────────────
/* The field shows the chosen clause. Choosing opens the clause list right
 * under the field, in the page's own flow — nothing is laid over the page —
 * with a search box and the framework's own grouping. Picking a clause or
 * pressing Done folds it away again. */
export function ClausePickerField({ value, onChange, help }) {
  const [open, setOpen] = useState(false)
  const [fwId, setFwId] = useState(FRAMEWORKS[0]?.id)
  const [search, setSearch] = useState('')
  const searchRef = useRef(null)
  const fw = FRAMEWORKS.find((f) => f.id === fwId) ?? FRAMEWORKS[0]

  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 30) }, [open])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
          style={{
            flex: 1, textAlign: 'start', padding: '8px 12px', minWidth: 0,
            border: `1px solid ${open ? 'var(--rose)' : 'var(--border-2)'}`, borderRadius: 'var(--r)', cursor: 'pointer',
            background: value ? 'var(--crimson-wash)' : 'var(--bg-2)',
            fontSize: 'var(--t-body)', color: value ? 'var(--crimson)' : 'var(--text-3)',
            fontFamily: value ? 'var(--font-mono)' : 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
          <span className="truncate">{value || tx('Select framework clause…')}</span>
          {open ? <ChevronUp size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} /> : <ChevronDown size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
        </button>
        {value && (
          <button type="button" className="btn-ghost" title={tx('Clear')} onClick={() => { onChange('', ''); setOpen(false) }}>
            <X size={13} /> {tx('Clear')}
          </button>
        )}
      </div>
      {help && !open && <p className="field-help" style={{ margin: 0 }}>{help}</p>}

      {open && fw && (
        <div className="anim-fade" style={{ border: '1px solid var(--border)', borderRadius: 'var(--r-md)', background: 'var(--bg-2)', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {FRAMEWORKS.length > 1 ? FRAMEWORKS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFwId(f.id)} className={f.id === fw.id ? 'btn-primary' : 'btn-secondary'} style={{ padding: '4px 9px' }}>{f.label}</button>
            )) : <span style={{ fontSize: 'var(--t-sm)', fontWeight: 600, color: 'var(--text)' }}>{fw.label} · {fw.fullName}</span>}
            <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
              <Search size={13} style={{ position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input ref={searchRef} className="risys-input" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={tx('Search by number or wording…')} style={{ paddingInlineStart: 30 }} />
            </div>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>{tx('Done')}</button>
          </div>
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            <ClauseList fw={fw} search={search} selected={value}
              onSelect={(ref, text) => { onChange(ref, text); setOpen(false); setSearch('') }} />
          </div>
        </div>
      )}
    </div>
  )
}
