import { useMemo, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { Spinner } from '@/components/ui/Spinner'
import { MetricStrip } from '@/components/ui/Metric'
import { usePermissions } from '@/hooks/usePermissions'
import { usePolicyCoverage } from '@/hooks/usePolicies'
import { POLICY_TEMPLATES } from '@/data/policyTemplates'
import { Th, Td } from '@/features/audits/parts'
import { PolicyStatusBadge } from './parts'
import { tx } from '@/lib/i18n'

const NEED = {
  documented: tx('Documented policy'),
  review: tx('Periodic review'),
  standard: tx('Technical standard'),
}

/* /app/policies/coverage — the ECC main controls that ask for a documented
 * policy, a periodic review or a standard, and which policy answers each.
 * A gap links straight to a new policy from the matching template. */
export function PolicyCoveragePage() {
  const navigate = useNavigate()
  const perms = usePermissions()
  const { rows, loading } = usePolicyCoverage()
  const [gapsOnly, setGapsOnly] = useState(false)

  const stats = useMemo(() => {
    const docs = rows.filter((r) => r.need === 'documented')
    return { docs: docs.length, covered: docs.filter((r) => r.covered).length, inProgress: docs.filter((r) => !r.covered && r.policies.length).length }
  }, [rows])
  const list = rows.filter((r) => !gapsOnly || !r.covered)
  const tplFor = (req) => POLICY_TEMPLATES.find((t) => t.requirement === req)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('ECC policy coverage')} subtitle={tx('Which ECC controls your policies answer')} />
      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Controls that need a policy'), value: stats.docs },
            { label: tx('Answered by a published policy'), value: stats.covered, tone: 'low' },
            { label: tx('Policy in progress'), value: stats.inProgress, tone: 'medium' },
            { label: tx('No policy yet'), value: stats.docs - stats.covered - stats.inProgress, tone: 'critical' },
          ]} />
        </div>
        <section className="section">
          <div className="flex items-center justify-between" style={{ padding: '11px 16px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontSize: 'var(--t-section)', fontWeight: 600, margin: 0 }}>{tx('NCA ECC-2:2024')}</h3>
            <label className="flex items-center" style={{ gap: 6, fontSize: 'var(--t-sm)', color: 'var(--text-3)', cursor: 'pointer' }}>
              <input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} /> {tx('Gaps only')}</label>
          </div>
          {loading ? <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th width={80}>{tx('Control')}</Th><Th>{tx('Requirement')}</Th><Th width={150}>{tx('Asks for')}</Th><Th>{tx('Policies')}</Th></tr></thead>
                <tbody>{list.map((r) => {
                  const tpl = tplFor(r.requirement_id)
                  return (
                    <tr key={r.requirement_id}>
                      <Td><Link to={`/app/compliance/${encodeURIComponent('NCA ECC')}/${r.requirement_id}`} style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{r.requirement_id}</Link></Td>
                      <Td><div style={{ color: 'var(--text)' }}>{r.domain_name}</div><div style={{ fontSize: 'var(--t-meta)', color: 'var(--text-3)' }}>{r.control_text?.slice(0, 180)}{r.control_text?.length > 180 ? '…' : ''}</div></Td>
                      <Td>{NEED[r.need]}</Td>
                      <Td>
                        {r.policies.length ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {r.policies.map((p) => (
                              <div key={p.id} className="flex items-center" style={{ gap: 6 }}>
                                <Link to={`/app/policies/${p.id}`} style={{ color: 'var(--text)' }}>{p.ref} {p.title}</Link><PolicyStatusBadge v={p.status} />
                              </div>
                            ))}
                          </div>
                        ) : perms.isComplianceWriter && tpl ? (
                          <button className="btn-secondary" style={{ padding: '3px 8px' }} onClick={() => navigate(`/app/policies/new?template=${tpl.key}`)}>
                            <Plus size={12} /> {tpl.title}</button>
                        ) : <span style={{ color: 'var(--critical)', fontSize: 'var(--t-sm)' }}>{tx('No policy')}</span>}
                      </Td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
