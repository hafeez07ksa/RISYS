import { Topbar } from '@/components/layout/Topbar'
import { useAuth } from '@/hooks/useAuth'

export function StubPage({ title, icon: Icon, description }) {
  const { organization } = useAuth()
  return (
    <div>
      <Topbar title={title} subtitle={organization?.name} />
      <div className="page-content">
        <div className="rounded-xl p-16 text-center" style={{ background: '#fff', border: '1px dashed #e5e0e0' }}>
          {Icon && <Icon size={32} strokeWidth={1} className="mx-auto mb-4" style={{ color: '#d4cccc' }} />}
          <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>{title} — coming soon</p>
          <p className="text-xs" style={{ color: '#8a7070' }}>{description || 'This module will be built in the next session.'}</p>
        </div>
      </div>
    </div>
  )
}
