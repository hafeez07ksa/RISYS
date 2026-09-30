import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { Topbar } from '@/components/layout/Topbar'
import { MetricStrip } from '@/components/ui/Metric'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { FilterBar } from '@/components/ui/Filters'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { usePeople } from '@/hooks/usePeople'
import { useReviewSchedule, summariseReviews, REVIEW_STATES } from '@/hooks/useCompliance'
import { fmtDate } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'

/* ── Review calendar ──────────────────────────────────────────────────────────
 *
 * ECC asks for 24 things to be reviewed periodically. Each review is recorded
 * as evidence on its control, with a next review date; once that date passes a
 * compliant control counts as Partial. This page is the one place that shows
 * what is due, what has lapsed and what has never been done, so the review
 * happens before the lapse rather than after it.
 *
 * Reminders go out from the database (send_review_reminders, daily 08:00
 * Riyadh): 30 days and 7 days before the date, and once when it passes — to the
 * owner on record, or to the people who can record compliance when there is
 * none. The state shown here is the same one the reminders use.
 * -------------------------------------------------------------------------- */

const CYCLE_LABEL = { 1: 'Monthly', 3: 'Quarterly', 6: 'Semi-annual', 12: 'Annual' }

function dueText(r) {
  const d = r.days_until_due
  if (d == null) return null
  if (d < 0) return tx('{{n}} days overdue', { n: -d })
  if (d === 0) return tx('Due today')
  return tx('in {{n}} days', { n: d })
}

export function ReviewCalendarPage() {
  const navigate = useNavigate()
  const { organization } = useAuth()
  const { members } = usePeople()
  const { rows, loading } = useReviewSchedule()
  // null until someone picks a tab: then the page opens on the first tab that
  // has something in it, so a new workspace does not land on an empty table.
  const [picked, setPicked] = useState(null)
  const [search, setSearch] = useState('')

  const stats = useMemo(() => summariseReviews(rows), [rows])
  const attention = stats.overdue + stats.dueSoon + stats.unscheduled
  const view = picked ?? (attention > 0 ? 'attention' : stats.never > 0 ? 'never_reviewed' : 'all')
  const nameOf = useMemo(() => {
    const map = Object.fromEntries(members.map(m => [m.user_id, m.full_name || m.email]))
    return (id) => (id && map[id]) || null
  }, [members])

  const VIEWS = [
    { value: 'attention', label: 'Needs attention', count: attention },
    { value: 'never_reviewed', label: 'Not yet reviewed', count: stats.never },
    { value: 'scheduled', label: 'Scheduled', count: stats.scheduled },
    { value: 'all', label: 'All', count: stats.total },
  ]

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (view === 'attention' && !['overdue', 'due_soon', 'unscheduled'].includes(r.state)) return false
      if (view !== 'attention' && view !== 'all' && r.state !== view) return false
      if (!q) return true
      return [r.requirement_id, r.title, nameOf(r.owner_id)].some(v => String(v || '').toLowerCase().includes(q))
    })
  }, [rows, view, search, nameOf])

  const openControl = (r) =>
    navigate(`/app/compliance/${encodeURIComponent(r.framework)}/${encodeURIComponent(r.requirement_id)}`)

  const columns = useMemo(() => [
    {
      key: 'requirement_id', header: tx('Control'),
      render: r => (
        <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', minWidth: 0 }}>
          <span className="tnum" style={{ fontWeight: 600, color: 'var(--text)', flexShrink: 0, minWidth: 52 }}>
            {r.requirement_id}
          </span>
          <span style={{ color: 'var(--text-2)', minWidth: 0 }}>
            {r.title ? tx(r.title) : tx('Evidence review')}
          </span>
        </span>
      ),
    },
    {
      key: 'owner', header: tx('Owner'), width: 170, hideBelow: 1100,
      render: r => nameOf(r.owner_id)
        ? <span style={{ color: 'var(--text-2)' }}>{nameOf(r.owner_id)}</span>
        : <span style={{ color: 'var(--text-3)' }}>{tx('Not assigned')}</span>,
    },
    {
      key: 'cycle', header: tx('Cycle'), width: 110, hideBelow: 1200,
      render: r => r.cycle_months
        ? <span style={{ color: 'var(--text-2)' }}>{tx(r.frequency || CYCLE_LABEL[r.cycle_months] || `${r.cycle_months} mo`)}</span>
        : <span style={{ color: 'var(--text-3)' }}>—</span>,
    },
    {
      key: 'last', header: tx('Last reviewed'), width: 130, hideBelow: 900,
      render: r => <span className="tnum" style={{ color: r.last_reviewed_on ? 'var(--text-2)' : 'var(--text-3)' }}>
        {r.last_reviewed_on ? fmtDate(r.last_reviewed_on) : '—'}
      </span>,
    },
    {
      key: 'due', header: tx('Next review'), width: 170,
      render: r => r.due_date ? (
        <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
          <span className="tnum" style={{ color: 'var(--text)' }}>{fmtDate(r.due_date)}</span>
          <span className="tnum" style={{
            fontSize: 'var(--t-meta)',
            color: r.state === 'overdue' ? 'var(--critical)' : 'var(--text-3)',
          }}>{dueText(r)}</span>
        </span>
      ) : <span style={{ color: 'var(--text-3)' }}>—</span>,
    },
    {
      key: 'state', header: tx('Status'), width: 150,
      render: r => {
        const s = REVIEW_STATES[r.state] || { label: r.state, tone: 'neutral' }
        return <StatusBadge tone={s.tone} label={tx(s.label)} />
      },
    },
  ], [nameOf])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Topbar title={tx('Review calendar')} subtitle={organization?.name} />

      <div className="page-content" style={{ flex: 1, overflowY: 'auto' }}>
        <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 720, margin: '0 0 16px', lineHeight: 1.6 }}>{tx(
          'Every ECC control that must be reviewed periodically, and every other control with a next review date on record. Owners are reminded 30 and 7 days before the date and when it passes. A compliant control counts as Partial once its review date has passed.'
        )}</p>

        <div style={{ marginBottom: 16 }}>
          <MetricStrip metrics={[
            { label: tx('Overdue'), value: stats.overdue, tone: 'critical' },
            { label: tx('Due in 30 days'), value: stats.dueSoon, tone: 'medium' },
            { label: tx('Not yet reviewed'), value: stats.never },
            { label: tx('Scheduled'), value: stats.scheduled },
          ]} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            searchPlaceholder={tx('Search by control or owner…')}
            views={VIEWS}
            activeView={view}
            onViewChange={setPicked}
          />
        </div>

        <DataTable
          columns={columns}
          rows={visible}
          rowKey={r => `${r.framework}:${r.requirement_id}`}
          loading={loading && rows.length === 0}
          onRowClick={openControl}
          empty={
            <EmptyState
              icon={CalendarClock}
              title={view === 'attention' && !search ? tx('Nothing needs attention') : tx('No reviews match')}
              description={view === 'attention' && !search
                ? tx('No review is overdue or due in the next 30 days.')
                : tx('Try a different view or search.')}
              filtered={!!search}
              onClearFilters={() => setSearch('')}
            />
          }
        />
      </div>
    </div>
  )
}
