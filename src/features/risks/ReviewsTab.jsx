import { useState } from 'react'
import { CalendarCheck, AlertTriangle } from 'lucide-react'
import { useRiskReviews } from '@/hooks/useRisks'
import { REVIEW_OUTCOMES, getReviewOutcome, nextReviewDate, isReviewOverdue } from '@/lib/risks'
import { Spinner } from '@/components/ui/Spinner'
import { SelectField } from '@/components/ui/Combobox'

function Card({ children }) {
  return <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>{children}</div>
}

/**
 * Periodic review / recertification (Archer: risk review cycle).
 * Completing a review logs an attestation and advances the next
 * review date according to the risk's review frequency.
 */
export function ReviewsTab({ risk, member, onRiskChanged, canReview }) {
  const { reviews, loading, addReview } = useRiskReviews(risk.id)
  const [showForm, setShowForm] = useState(false)
  const [outcome, setOutcome] = useState('no_change')
  const [notes, setNotes] = useState('')
  const [nextDate, setNextDate] = useState(nextReviewDate(risk.review_frequency))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const overdue = isReviewOverdue(risk)
  const due = risk.review_date ? new Date(risk.review_date) : null

  const save = async () => {
    setSaving(true); setError('')
    try {
      await addReview({ outcome, notes, next_review_date: nextDate })
      setShowForm(false); setNotes('')
      onRiskChanged && onRiskChanged()
    } catch (e) { setError(e.message) } finally { setSaving(false) }
  }

  if (loading) return <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}><Spinner /></div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Periodic Reviews</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
            {risk.review_frequency || 'Quarterly'} review cycle
            {due && <> · next due <strong style={{ color: overdue ? '#8C1616' : 'var(--text-2)' }}>{due.toLocaleDateString('en-GB')}</strong></>}
            {risk.last_reviewed_at && <> · last reviewed {new Date(risk.last_reviewed_at).toLocaleDateString('en-GB')}</>}
          </p>
        </div>
        {canReview && <button onClick={() => setShowForm(s => !s)} className="btn-primary" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
          <CalendarCheck size={13} /> Complete Review
        </button>}
      </div>

      {overdue && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: '#FBEAEA', border: '1px solid #F0CECE' }}>
          <AlertTriangle size={14} style={{ color: '#8C1616', flexShrink: 0 }} />
          <p style={{ fontSize: 12.5, color: '#8C1616' }}>
            This risk's review is overdue — it was due {due.toLocaleDateString('en-GB')}. Complete a review to re-affirm or update the assessment.
          </p>
        </div>
      )}

      {showForm && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Review outcome</p>
              <SelectField value={outcome} onChange={e => setOutcome(e.target.value)} className="risys-input" style={{ width: '100%', fontSize: 13 }}>
                {REVIEW_OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </SelectField>
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              placeholder="Review notes — what was considered, any changes in exposure, control performance, KRI trends…"
              className="risys-input" style={{ width: '100%', fontSize: 13, resize: 'vertical' }} />
            <div>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>Next review date (auto-set from {risk.review_frequency || 'Quarterly'} frequency)</p>
              <input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} className="risys-input" style={{ fontSize: 13 }} />
            </div>
            {error && <p style={{ fontSize: 12, color: '#8C1616' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} className="btn-secondary" style={{ fontSize: 13 }}>Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary" style={{ fontSize: 13 }}>
                {saving ? <Spinner size="sm" /> : null} Sign Off Review
              </button>
            </div>
          </div>
        </Card>
      )}

      {reviews.length === 0 && !showForm ? (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 10, padding: '36px 16px', textAlign: 'center', background: '#fff' }}>
          <CalendarCheck size={26} strokeWidth={1.2} style={{ color: 'var(--border-2)', margin: '0 auto 10px' }} />
          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>No reviews recorded</p>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Periodic reviews keep the assessment current and auditable</p>
        </div>
      ) : (
        reviews.map(r => {
          const o = getReviewOutcome(r.outcome)
          return (
            <Card key={r.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: o.color }}>{o.label}</p>
                  {r.notes && <p style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 4, lineHeight: 1.5 }}>{r.notes}</p>}
                  <p style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>
                    Reviewed by {member(r.reviewed_by)} · {new Date(r.created_at).toLocaleString('en-GB')}
                    {r.next_review_date && <> · next review {new Date(r.next_review_date).toLocaleDateString('en-GB')}</>}
                  </p>
                </div>
              </div>
            </Card>
          )
        })
      )}
    </div>
  )
}
