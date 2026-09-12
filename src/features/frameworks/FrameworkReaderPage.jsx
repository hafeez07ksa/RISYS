import { useState, useMemo } from 'react'
import { ArrowLeft, Search, X } from 'lucide-react'
import { getFramework, useFrameworkRequirements, compareRequirementIds } from '@/hooks/useCompliance'
import { Spinner } from '@/components/ui/Spinner'
import { BackLink } from '@/components/ui/BackLink'

/*
 * Framework reader — reference only.
 *
 * This renders the framework as published: domain, subdomain, objective,
 * control reference number, control clause. Nothing is scored, mapped,
 * rated or rephrased. Control text is printed verbatim from the source
 * document; subcontrols appear beneath their parent in the document's own
 * dotted notation.
 *
 * Assessment lives in the Compliance section. This page deliberately has no
 * status control, no mapping affordance and no progress indicator — it is the
 * regulation, not the entity's position on it.
 */

const isSub = (row) => (row.control_type || '').toLowerCase().replace(/[\s-]/g, '') === 'subcontrol'

// Subcontrols are printed in the source document with dots, not hyphens:
// row 2-2-3-1 appears on the page as 2.2.3.1
const dotted = (id) => String(id).replace(/-/g, '.')

// ── Normalise the differing column shapes into one structure ────────────────
function buildTree(rows, fw) {
  const idKey   = fw?.requirementKey || 'control_id'
  const textKey = fw?.textKey || 'control_text'

  const domains = new Map()

  const parents = rows.filter(r => !isSub(r))
  const subs    = rows.filter(r => isSub(r))

  const childrenOf = new Map()
  for (const s of subs) {
    const pid = String(s[idKey]).replace(/-[0-9]+$/, '')
    if (!childrenOf.has(pid)) childrenOf.set(pid, [])
    childrenOf.get(pid).push(s)
  }
  for (const list of childrenOf.values()) {
    list.sort((a, b) => compareRequirementIds(a[idKey], b[idKey]))
  }

  for (const row of parents) {
    // PDPL and the NCA frameworks label their levels differently
    const domainId   = row.domain_id   ?? row.regulation_part ?? ''
    const domainName = row.domain_name ?? row.regulation_part ?? ''
    const groupId    = row.subdomain_id   ?? row.article_id    ?? domainId
    const groupName  = row.subdomain_name ?? row.article_title ?? domainName
    const objective  = row.subdomain_objective ?? null

    if (!domains.has(domainId)) {
      domains.set(domainId, { id: domainId, name: domainName, groups: new Map() })
    }
    const domain = domains.get(domainId)
    if (!domain.groups.has(groupId)) {
      domain.groups.set(groupId, { id: groupId, name: groupName, objective, controls: [] })
    }
    domain.groups.get(groupId).controls.push({
      id:       row[idKey],
      text:     row[textKey],
      children: childrenOf.get(String(row[idKey])) || [],
    })
  }

  const out = [...domains.values()].map(d => ({
    ...d,
    groups: [...d.groups.values()]
      .map(g => ({ ...g, controls: g.controls.sort((a, b) => compareRequirementIds(a.id, b.id)) }))
      .sort((a, b) => compareRequirementIds(a.id, b.id)),
  }))
  out.sort((a, b) => compareRequirementIds(a.id, b.id))
  return { tree: out, idKey, textKey }
}

// ── One control row ─────────────────────────────────────────────────────────
function ControlRow({ control, textKey, idKey, last }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '112px 1fr',
      borderBottom: last ? 'none' : '1px solid var(--border)',
      alignItems: 'start',
    }}>
      <div style={{
        padding: '13px 14px',
        borderRight: '1px solid var(--border)',
        alignSelf: 'stretch',
      }}>
        <span style={{
          fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.02em',
        }}>
          {control.id}
        </span>
      </div>

      <div style={{ padding: '13px 18px' }}>
        <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text)' }}>
          {control.text}
        </p>

        {control.children.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {control.children.map(sub => (
              <div key={sub[idKey]} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                <span style={{
                  fontSize: 12.5, color: 'var(--text-3)', flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  minWidth: 56,
                }}>
                  {dotted(sub[idKey])}
                </span>
                <p style={{ fontSize: 13.5, lineHeight: 1.7, color: 'var(--text)' }}>
                  {sub[textKey]}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Subdomain block ─────────────────────────────────────────────────────────
function GroupBlock({ group, fw, idKey, textKey }) {
  return (
    <div style={{
      border: '1px solid var(--border)', borderRadius: 10,
      overflow: 'hidden', marginBottom: 18, background: '#fff',
    }}>
      {/* Subdomain header — neutral band with a thin accent, not a solid fill.
          A full-width block of the brand maroon on every subdomain is a lot of
          saturated colour on a page that is mostly long-form reading. */}
      <div style={{
        display: 'grid', gridTemplateColumns: '112px 1fr',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        borderLeft: `3px solid ${fw.color}`,
      }}>
        <div style={{ padding: '11px 14px', borderRight: '1px solid var(--border)' }}>
          <span style={{
            fontSize: 12.5, fontWeight: 700, color: fw.color,
            fontFamily: 'var(--font-mono)',
          }}>{group.id}</span>
        </div>
        <div style={{ padding: '11px 18px' }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{group.name}</span>
        </div>
      </div>

      {/* Objective */}
      {group.objective && (
        <div style={{
          display: 'grid', gridTemplateColumns: '112px 1fr',
          background: '#fff', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            padding: '12px 14px', borderRight: '1px solid var(--border)',
            fontSize: 12.5, color: 'var(--text-3)',
          }}>
            Objective
          </div>
          <div style={{ padding: '12px 18px' }}>
            <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-2)' }}>
              {group.objective}
            </p>
          </div>
        </div>
      )}

      {/* Controls band */}
      <div style={{
        padding: '7px 14px', background: 'var(--surface-2)',
        borderBottom: '1px solid var(--border)',
        fontSize: 11, fontWeight: 600, color: 'var(--text-3)',
        textTransform: 'uppercase', letterSpacing: '0.1em',
      }}>
        Controls
      </div>

      {group.controls.map((c, i) => (
        <ControlRow
          key={c.id}
          control={c}
          idKey={idKey}
          textKey={textKey}
          last={i === group.controls.length - 1}
        />
      ))}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────
export function FrameworkReaderPage({ frameworkId, onBack }) {
  const fw = getFramework(frameworkId)
  const { requirements, loading } = useFrameworkRequirements(frameworkId)
  const [search, setSearch] = useState('')

  const { tree, idKey, textKey } = useMemo(
    () => buildTree(requirements, fw),
    [requirements, fw]
  )

  // Filtering keeps a control whenever the parent or any subcontrol matches,
  // so a hit inside a minimum requirement still shows its lead-in sentence.
  const filtered = useMemo(() => {
    if (!search.trim()) return tree
    const q = search.toLowerCase()
    const hit = (t, id) =>
      String(t || '').toLowerCase().includes(q) || String(id || '').toLowerCase().includes(q)

    return tree
      .map(d => ({
        ...d,
        groups: d.groups
          .map(g => ({
            ...g,
            controls: g.controls.filter(c =>
              hit(c.text, c.id) || c.children.some(s => hit(s[textKey], s[idKey]))
            ),
          }))
          .filter(g => g.controls.length > 0),
      }))
      .filter(d => d.groups.length > 0)
  }, [tree, search, idKey, textKey])

  const mainCount = requirements.filter(r => !isSub(r)).length
  const subCount  = requirements.length - mainCount

  if (!fw) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '14px 28px', borderBottom: '1px solid var(--border)',
        background: '#fff', flexShrink: 0,
      }}>
        <BackLink to={onBack} label="Frameworks" style={{ marginBottom: 8 }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
              {fw.label} — {fw.fullName}
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>
              {fw.version} · {mainCount} main controls{subCount > 0 && ` · ${subCount} subcontrols`} · reference only
            </p>
          </div>
          <span style={{
            fontSize: 10.5, padding: '3px 9px', borderRadius: 99, fontWeight: 600,
            color: fw.color, background: fw.bg, border: `1px solid ${fw.color}22`,
            flexShrink: 0,
          }}>{fw.tag}</span>
        </div>
      </div>

      {/* Body */}
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>

        <div style={{ position: 'relative', marginBottom: 22, maxWidth: 460 }}>
          <Search size={14} style={{
            position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
            color: 'var(--text-3)', pointerEvents: 'none',
          }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${fw.label} controls…`}
            style={{
              width: '100%', padding: '9px 32px 9px 32px', fontSize: 13,
              border: '1px solid var(--border)', borderRadius: 8,
              background: '#fff', color: 'var(--text)',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-3)', padding: 2, display: 'flex',
              }}
            >
              <X size={13} />
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        ) : filtered.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)', padding: '32px 0' }}>
            No controls match that search.
          </p>
        ) : (
          filtered.map(domain => (
            <div key={domain.id} style={{ marginBottom: 30 }}>
              {/* Main domain heading */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 13 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                  background: fw.bg, color: fw.color,
                  border: `1px solid ${fw.color}33`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12.5, fontWeight: 700,
                }}>
                  {domain.id}
                </div>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  {domain.name}
                </h2>
              </div>

              {domain.groups.map(g => (
                <GroupBlock key={g.id} group={g} fw={fw} idKey={idKey} textKey={textKey} />
              ))}
            </div>
          ))
        )}

        <p style={{
          fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6,
          paddingTop: 6, paddingBottom: 12, maxWidth: 680,
        }}>
          Control text is reproduced from the published framework. Where the source
          document is issued in Arabic and English, the Arabic version is binding.
        </p>
      </div>
    </div>
  )
}
