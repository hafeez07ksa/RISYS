import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePlatform } from '@/hooks/usePlatform'
import { Spinner } from '@/components/ui/Spinner'
import {
  PlatformShell, Card, Table, Td, Empty, SearchInput, ActionChip, MetaSummary,
  ErrorNote, ACTION_LABELS, fmtDateTime, ago,
} from './shared'

/* /platform/activity — the console's own audit trail.
 *
 * Rows come from platform_audit_log, which is append-only: a trigger refuses
 * updates and deletes, so an action taken here cannot be taken back out of the
 * record. Company names are stored as text, so a deleted tenant still reads
 * correctly long after its row is gone. */
export function PlatformActivityPage() {
  const { listAudit } = usePlatform()
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [error, setError] = useState('')
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (before = null) => {
    setBusy(true); setError('')
    try {
      const data = await listAudit({ limit: 100, before, action: action || null, search: q || null })
      setRows((prev) => (before && prev ? [...prev, ...data] : data))
      setMore(data.length === 100)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }, [action, q]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setTimeout(() => load(), q ? 250 : 0); return () => clearTimeout(t) }, [load, q])

  return (
    <PlatformShell title="Console activity" description="Every action taken in the platform console. Append-only — entries cannot be edited or removed.">
      <ErrorNote>{error}</ErrorNote>
      <Card pad={false}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <SearchInput value={q} onChange={setQ} placeholder="Company, staff member, reason…" width={300} />
          <select className="risys-input" value={action} onChange={(e) => setAction(e.target.value)}
            style={{ fontSize: 12.5, width: 'auto', minWidth: 190 }}>
            <option value="">All actions</option>
            {Object.entries(ACTION_LABELS).map(([value, [label]]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {busy && <Spinner size="sm" />}
        </div>

        {rows === null ? <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner size="lg" /></div> : (
          <Table
            columns={[{ label: 'When', width: 150 }, { label: 'Action', width: 190 }, { label: 'Company' }, { label: 'Detail' }, { label: 'By', width: 190 }]}
            empty={rows.length === 0 ? <Empty>No console activity matches.</Empty> : null}
          >
            {rows.map((r) => (
              <tr key={r.id}>
                <Td style={{ whiteSpace: 'nowrap' }}>
                  <div style={{ color: 'var(--text)' }}>{ago(r.created_at)}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)' }}>{fmtDateTime(r.created_at)}</div>
                </Td>
                <Td><ActionChip action={r.action} /></Td>
                <Td>
                  {r.org_id && r.action !== 'company.deleted'
                    ? <Link to={`/platform/companies/${r.org_id}`} style={{ color: 'var(--text)', fontWeight: 500, textDecoration: 'none' }}>{r.org_name}</Link>
                    : <span style={{ color: 'var(--text)' }}>{r.org_name || '—'}</span>}
                </Td>
                <Td>
                  {r.target_email && <div style={{ color: 'var(--text-2)' }}>{r.target_email}</div>}
                  {r.reason && <div style={{ color: 'var(--text)', fontStyle: 'italic' }}>“{r.reason}”</div>}
                  <MetaSummary meta={r.meta} />
                </Td>
                <Td style={{ fontSize: 11.5 }}>{r.actor_email || '—'}</Td>
              </tr>
            ))}
          </Table>
        )}
        {more && rows?.length > 0 && (
          <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--border)' }}>
            <button className="btn-secondary" disabled={busy} onClick={() => load(rows[rows.length - 1].created_at)}>Load older</button>
          </div>
        )}
      </Card>
    </PlatformShell>
  )
}
