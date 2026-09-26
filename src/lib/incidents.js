import { tx } from '@/lib/i18n'
export const SEVERITIES = [
  { value: 'critical',      label: tx('Critical'),      color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  { value: 'high',          label: tx('High'),           color: '#c2410c', bg: '#fff7ed', border: '#fed7aa' },
  { value: 'medium',        label: tx('Medium'),         color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'low',           label: tx('Low'),            color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'informational', label: tx('Informational'),  color: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' },
]

export const STATUSES = [
  { value: 'open',        label: tx('Open'),        color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  { value: 'in_progress', label: tx('In Progress'), color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  { value: 'resolved',    label: tx('Resolved'),    color: '#166534', bg: '#f0fdf4', border: '#bbf7d0' },
  { value: 'closed',      label: tx('Closed'),      color: '#374151', bg: '#f9fafb', border: '#e5e7eb' },
]

export function getSeverity(value) {
  return SEVERITIES.find(s => s.value === value) || SEVERITIES[2]
}

export function getStatus(value) {
  return STATUSES.find(s => s.value === value) || STATUSES[0]
}

export const JIRA_ISSUE_TYPES = [
  'Bug', 'Task', 'Story', 'Epic', 'Incident',
  'Service Request', 'Change', 'Problem', 'Sub-task',
]
