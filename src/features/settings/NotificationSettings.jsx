import { useEffect, useMemo, useState } from 'react'
import { Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useEmailPreference } from '@/hooks/useRisks'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { fmtDateTime } from '@/lib/reports/models'
import { tx } from '@/lib/i18n'

/* ── Settings → Notifications ─────────────────────────────────────────────────
 *
 * Two things: the viewer's own email switch (the same one as in the bell), and
 * the workspace's outbound mail log, so an admin can answer "did that email go
 * out?" without asking us. email_log is readable by workspace admins only; it
 * never holds message bodies.
 * -------------------------------------------------------------------------- */

const TEMPLATE_LABEL = { invitation: 'Invitation', notification: 'Notification' }

export function NotificationSettings() {
  const { organization } = useAuth()
  const email = useEmailPreference()
  const [log, setLog] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    if (!organization?.id) return
    supabase.from('email_log')
      .select('id, created_at, template, to_email, subject, status, error')
      .eq('org_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { if (live) { setLog(data || []); setLoading(false) } })
    return () => { live = false }
  }, [organization?.id])

  const columns = useMemo(() => [
    { key: 'created_at', header: tx('When'), width: 170,
      render: r => <span className="tnum" style={{ color: 'var(--text-2)' }}>{fmtDateTime(r.created_at)}</span> },
    { key: 'template', header: tx('Type'), width: 120,
      render: r => <span style={{ color: 'var(--text-2)' }}>{tx(TEMPLATE_LABEL[r.template] || r.template)}</span> },
    { key: 'to_email', header: tx('To'), width: 280,
      render: r => <span style={{ color: 'var(--text-2)' }}>{r.to_email}</span> },
    { key: 'subject', header: tx('Subject'), hideBelow: 1100,
      render: r => <span style={{ color: 'var(--text)' }}>{r.subject}</span> },
    { key: 'status', header: tx('Result'), width: 110,
      render: r => (
        <span title={r.error || undefined}>
          <StatusBadge tone={r.status === 'sent' ? 'low' : 'critical'} label={r.status === 'sent' ? tx('Sent') : tx('Failed')} />
        </span>
      ) },
  ], [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, width: '100%' }}>
      <section style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', padding: '16px 18px',
      }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
          <Mail size={16} style={{ color: 'var(--text-3)', marginTop: 2, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
              {tx('Email me my notifications')}
            </span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 820 }}>{tx(
              'Everything that reaches your notification bell — review reminders, risk workflow, tasks, audit requests — is also sent to your email, grouped into one message every few minutes. Anything you have already read in RISYS is not emailed. This setting is yours alone; each person chooses for themselves.'
            )}</span>
          </span>
          <input type="checkbox" checked={email.enabled} disabled={email.loading || email.saving}
            onChange={(e) => email.setEmail(e.target.checked)} aria-label={tx('Email me my notifications')}
            style={{ marginTop: 3 }} />
        </label>
      </section>

      <section>
        <h3 style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', margin: '0 0 4px' }}>{tx('Emails sent from this workspace')}</h3>
        <p style={{ fontSize: 12.5, color: 'var(--text-3)', margin: '0 0 12px', lineHeight: 1.6 }}>{tx(
          'The last 50 invitations and notification emails, with whether the mail provider accepted them. Message contents are not stored.'
        )}</p>
        <DataTable
          columns={columns}
          rows={log}
          rowKey={r => r.id}
          loading={loading}
          defaultDensity="compact"
          empty={<EmptyState icon={Mail} title={tx('No emails sent yet')} compact />}
        />
      </section>
    </div>
  )
}
