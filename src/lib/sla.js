import { tx } from '@/lib/i18n'
export const SLA_DEFAULTS = {
  critical:      { hours: 4,   label: tx('4 hours') },
  high:          { hours: 24,  label: tx('24 hours') },
  medium:        { hours: 72,  label: tx('3 days') },
  low:           { hours: 168, label: tx('7 days') },
  informational: { hours: 720, label: tx('30 days') },
}

export function getSLADeadline(severity, createdAt) {
  const hours = SLA_DEFAULTS[severity]?.hours || 72
  const deadline = new Date(createdAt)
  deadline.setHours(deadline.getHours() + hours)
  return deadline
}

export function getSLAStatus(severity, createdAt, resolvedAt) {
  const deadline = getSLADeadline(severity, createdAt)
  const now = resolvedAt ? new Date(resolvedAt) : new Date()
  const diff = deadline - now  // ms remaining

  if (resolvedAt) {
    return { status: new Date(resolvedAt) <= deadline ? 'met' : 'breached', diff, deadline }
  }

  if (diff < 0) return { status: 'breached', diff, deadline }
  if (diff < 60 * 60 * 1000) return { status: 'critical', diff, deadline }  // < 1hr
  if (diff < 4 * 60 * 60 * 1000) return { status: 'warning', diff, deadline }  // < 4hrs
  return { status: 'ok', diff, deadline }
}

export function formatTimeRemaining(diff) {
  if (diff < 0) {
    const abs = Math.abs(diff)
    const hrs = Math.floor(abs / 3600000)
    const mins = Math.floor((abs % 3600000) / 60000)
    return hrs > 0 ? tx('{{h}}h {{m}}m overdue', { h: hrs, m: mins }) : tx('{{m}}m overdue', { m: mins })
  }
  const hrs = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hrs >= 24) return `${Math.floor(hrs / 24)}d ${hrs % 24}h remaining`
  return hrs > 0 ? `${hrs}h ${mins}m remaining` : `${mins}m remaining`
}

export const TASK_STATUSES = [
  { value: 'todo',        label: tx('To Do'),      color: '#4a3a3a', bg: '#f8f7f7', border: '#e5e0e0' },
  { value: 'in_progress', label: tx('In Progress'), color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'done',        label: tx('Done'),        color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'cancelled',   label: tx('Cancelled'),   color: '#6b7280', bg: '#f9fafb', border: '#e5e7eb' },
]

export const TASK_PRIORITIES = [
  { value: 'critical', label: tx('Critical'), color: '#b91c1c' },
  { value: 'high',     label: tx('High'),     color: '#c2410c' },
  { value: 'medium',   label: tx('Medium'),   color: '#92400e' },
  { value: 'low',      label: tx('Low'),      color: '#166534' },
]

export function getTaskStatus(value) {
  return TASK_STATUSES.find(s => s.value === value) || TASK_STATUSES[0]
}
export function getTaskPriority(value) {
  return TASK_PRIORITIES.find(p => p.value === value) || TASK_PRIORITIES[2]
}
