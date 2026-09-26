import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { tx } from '@/lib/i18n'

/* Reference data the scope and finding pages pick from. */

const ECC_DOMAINS = {
  1: tx('1 — Cybersecurity governance'),
  2: tx('2 — Cybersecurity defence'),
  3: tx('3 — Cybersecurity resilience'),
  4: tx('4 — Third-party and cloud computing cybersecurity'),
}

const sortKey = (id) => id.split('-').map((p) => p.padStart(4, '0')).join('-')

export function useFrameworkRequirements(framework) {
  const [reqs, setReqs] = useState([])
  useEffect(() => {
    if (!framework) { setReqs([]); return }
    let alive = true
    supabase.from('framework_requirements_v').select('requirement_id, requirement_text, parent_requirement_id')
      .eq('framework', framework).then(({ data }) => {
        if (!alive) return
        setReqs((data || []).sort((a, b) => sortKey(a.requirement_id).localeCompare(sortKey(b.requirement_id))))
      })
    return () => { alive = false }
  }, [framework])
  return reqs
}

/* Requirement options grouped by ECC domain, searchable by id or wording. */
export function requirementOptions(reqs, { inScope = new Set(), noneLabel = tx('None') } = {}) {
  const groups = new Map()
  for (const r of reqs) {
    const d = r.requirement_id.split('-')[0]
    if (!groups.has(d)) groups.set(d, [])
    groups.get(d).push({
      value: r.requirement_id,
      label: `${r.requirement_id}${inScope.has(r.requirement_id) ? ` · ${tx('in scope')}` : ''}`,
      description: r.requirement_text?.length > 140 ? `${r.requirement_text.slice(0, 140)}…` : r.requirement_text,
    })
  }
  return [
    { value: '', label: noneLabel },
    ...[...groups.entries()].map(([d, options]) => ({ group: ECC_DOMAINS[d] ?? `${tx('Domain')} ${d}`, options })),
  ]
}

export function useOrgControls() {
  const { organization } = useAuth()
  const [controls, setControls] = useState([])
  useEffect(() => {
    if (!organization?.id) return
    supabase.from('risk_controls').select('id, control_id, name').eq('org_id', organization.id).order('name')
      .then(({ data }) => setControls(data || []))
  }, [organization?.id])
  return controls
}

/* The regulator's wording of the chosen requirement, shown under the picker so
 * the auditor tests against the text itself, not a memory of it. */
export function RequirementText({ reqs, id, framework }) {
  const r = reqs.find((x) => x.requirement_id === id)
  if (!r) return null
  return (
    <blockquote style={{
      margin: 0, padding: '10px 12px', borderInlineStart: '3px solid var(--rose)', background: 'var(--surface)',
      borderRadius: 'var(--r-sm)', fontSize: 'var(--t-sm)', color: 'var(--text-2)', lineHeight: 1.6,
    }}>
      <div style={{ fontSize: 'var(--t-meta)', fontWeight: 600, color: 'var(--text-3)', marginBottom: 3 }}>{framework} {r.requirement_id}</div>
      {r.requirement_text}
    </blockquote>
  )
}
