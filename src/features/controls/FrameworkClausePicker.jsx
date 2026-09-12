import { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, ChevronDown, ChevronUp, Search, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PRIMARY_FRAMEWORK_ID } from '@/hooks/useCompliance'

// ── Framework registry ────────────────────────────────────────────────────────
// Column keys differ per framework table, so this picker keeps its own shape.
// Scope, however, is taken from the shared registry — a control can only be
// mapped to a framework that is actually being assessed.
const ALL_FRAMEWORKS = [
  { id: 'NCA ECC',    label: 'NCA ECC',    fullName: 'Essential Cybersecurity Controls',         table: 'nca_ecc',     color: '#5D0F0F', bg: '#fdf5f5', tag: 'Critical Sector',  idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'SAMA CSF',   label: 'SAMA CSF',   fullName: 'Cybersecurity Framework',                  table: 'sama_csf',    color: '#1e40af', bg: '#eff6ff', tag: 'Financial Sector', idKey: 'control_id',  textKey: 'control_text',  groupKey: 'subdomain_id', groupName: 'subdomain_name' },
  { id: 'SDAIA PDPL', label: 'SDAIA PDPL', fullName: 'Personal Data Protection Law',             table: 'sdaia_pdpl',  color: '#166534', bg: '#f0fdf4', tag: 'Data Privacy',     idKey: 'clause_id',   textKey: 'clause_text',   groupKey: 'article_id',   groupName: 'article_title'  },
  { id: 'NCA CCC',    label: 'NCA CCC',    fullName: 'Cloud Cybersecurity Controls',             table: 'nca_ccc',     color: '#6d28d9', bg: '#f5f3ff', tag: 'Cloud',            idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'NCA DCC',    label: 'NCA DCC',    fullName: 'Data Cybersecurity Controls',              table: 'nca_dcc',     color: '#92400e', bg: '#fffbeb', tag: 'Data',             idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'NCA TCC',    label: 'NCA TCC',    fullName: 'Telework Cybersecurity Controls',          table: 'nca_tcc',     color: '#0e7490', bg: '#ecfeff', tag: 'Telework',         idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'NCA CSCC',   label: 'NCA CSCC',   fullName: 'Cybersecurity Controls for Comms Sector', table: 'nca_cscc',    color: '#be185d', bg: '#fdf2f8', tag: 'Telecom',          idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
  { id: 'NCA NCNICC', label: 'NCA NCNICC', fullName: 'Non-CNI Private Sector Controls',         table: 'nca_ncnicc',  color: '#b45309', bg: '#fffbeb', tag: 'Private Sector',   idKey: 'control_id',  textKey: 'control_text',  groupKey: 'domain_id',    groupName: 'domain_name'    },
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
      .then(({ data }) => { setRows(data || []); setLoading(false) })
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

  if (loading) return (
    <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
      Loading requirements…
    </div>
  )

  if (groupList.length === 0) return (
    <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
      No requirements match your search.
    </div>
  )

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
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              {isOpen
                ? <ChevronDown size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                : <ChevronRight size={13} style={{ color: 'var(--text-3)', flexShrink: 0 }} />}
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
                    padding: '9px 16px 9px 36px', border: 'none', cursor: 'pointer',
                    textAlign: 'left',
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

// ── Main picker modal ─────────────────────────────────────────────────────────
export function FrameworkClausePicker({ open, onClose, onSelect, currentValue }) {
  const [step, setStep] = useState('frameworks') // 'frameworks' | 'clauses'
  const [activeFw, setActiveFw] = useState(null)
  const [search, setSearch] = useState('')
  const searchRef = useRef(null)

  // Reset on open
  useEffect(() => {
    if (open) { setStep('frameworks'); setActiveFw(null); setSearch('') }
  }, [open])

  // Focus search when entering clause view
  useEffect(() => {
    if (step === 'clauses') setTimeout(() => searchRef.current?.focus(), 50)
  }, [step])

  if (!open) return null

  const handleSelect = (ref, text) => {
    onSelect(ref, text)
    onClose()
  }

  const handleClear = () => {
    onSelect('', '')
    onClose()
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: 600, maxHeight: '82vh',
        display: 'flex', flexDirection: 'column', border: '1px solid var(--border)',
        boxShadow: '0 8px 32px rgba(26,19,20,0.14)', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {step === 'clauses' && (
            <button
              onClick={() => { setStep('frameworks'); setSearch('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
            >
              <ChevronRight size={13} style={{ transform: 'rotate(180deg)' }} />
              Frameworks
            </button>
          )}
          {step === 'clauses' && <ChevronRight size={13} style={{ color: 'var(--border-2)', flexShrink: 0 }} />}

          <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', flex: 1 }}>
            {step === 'frameworks' ? 'Select Framework' : activeFw?.label}
          </h3>

          {currentValue && (
            <button onClick={handleClear} style={{ fontSize: 11, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
              Clear
            </button>
          )}
          <button onClick={onClose} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Search (only in clause view) */}
        {step === 'clauses' && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={`Search ${activeFw?.label} requirements…`}
                className="risys-input"
                style={{ paddingLeft: 30, fontSize: 12 }}
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {step === 'frameworks' ? (
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FRAMEWORKS.map(fw => (
                <button
                  key={fw.id}
                  onClick={() => { setActiveFw(fw); setStep('clauses'); setSearch('') }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                    border: `1px solid ${currentValue?.startsWith(fw.id) ? fw.color : 'var(--border)'}`,
                    borderRadius: 8, background: currentValue?.startsWith(fw.id) ? fw.bg : '#fff',
                    cursor: 'pointer', textAlign: 'left', width: '100%',
                    transition: 'all 0.1s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = fw.color; e.currentTarget.style.background = fw.bg }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = currentValue?.startsWith(fw.id) ? fw.color : 'var(--border)'
                    e.currentTarget.style.background = currentValue?.startsWith(fw.id) ? fw.bg : '#fff'
                  }}
                >
                  {/* Color dot */}
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: fw.color, flexShrink: 0 }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{fw.label}</span>
                      <span style={{
                        fontSize: 10, padding: '1px 6px', borderRadius: 99,
                        background: fw.bg, color: fw.color,
                        border: `1px solid ${fw.color}33`, fontWeight: 600,
                      }}>{fw.tag}</span>
                    </div>
                    <p style={{ fontSize: 11.5, color: 'var(--text-3)' }}>{fw.fullName}</p>
                  </div>

                  {currentValue?.startsWith(fw.id) && (
                    <span style={{ fontSize: 11, color: fw.color, fontWeight: 600, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                      {currentValue}
                    </span>
                  )}

                  <ChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
                </button>
              ))}
            </div>
          ) : (
            <ClauseList
              fw={activeFw}
              onSelect={handleSelect}
              selected={currentValue}
              search={search}
            />
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="btn-secondary" style={{ fontSize: 12 }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
