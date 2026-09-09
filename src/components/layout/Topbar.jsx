import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { useNotifications } from '../../hooks/useRisks'

function timeAgo(iso) {
  if (!iso) return ''
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function NotificationsBell() {
  const navigate = useNavigate()
  const { notifications, unread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleClick = async (n) => {
    if (!n.read_at) await markRead(n.id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-8 h-8 flex items-center justify-center rounded-md transition-colors hover:bg-[#f6eeec]"
        style={{ border: '1px solid #e9dad7', color: unread > 0 ? '#5D0F0F' : '#97817d', position: 'relative' }}
        title="Notifications"
      >
        <Bell size={14} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, padding: '0 4px',
            borderRadius: 999, background: '#5D0F0F', color: '#fff', fontSize: 9.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 340, maxHeight: 420,
          background: '#fff', border: '1px solid #e9dad7', borderRadius: 10, zIndex: 60,
          boxShadow: '0 8px 24px rgba(26,19,20,0.10)', display: 'flex', flexDirection: 'column', overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid #e9dad7' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#292021' }}>Notifications</span>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#5D0F0F', background: 'none', border: 'none', cursor: 'pointer' }}>
                <CheckCheck size={12} /> Mark all read
              </button>
            )}
          </div>
          <div style={{ overflowY: 'auto' }}>
            {notifications.length === 0 && (
              <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 12, color: '#97817d' }}>
                No notifications yet
              </div>
            )}
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', cursor: 'pointer',
                  background: n.read_at ? '#fff' : '#fdf7f7', border: 'none', borderBottom: '1px solid #f0ecec'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {!n.read_at && <span style={{ width: 7, height: 7, borderRadius: 999, background: '#5D0F0F', marginTop: 4, flexShrink: 0 }} />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: n.read_at ? 500 : 600, color: '#292021' }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: 11.5, color: '#6b5a5a', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.body}</div>}
                    <div style={{ fontSize: 10.5, color: '#97817d', marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function Topbar({ title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1 className="text-sm font-medium" style={{ color: '#292021' }}>{title}</h1>
        {subtitle && <p className="text-xs mt-0.5" style={{ color: '#97817d' }}>{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <NotificationsBell />
      </div>
    </header>
  )
}
