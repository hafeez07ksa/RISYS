export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-8 rounded-xl"
      style={{ border: '1px dashed #e5e0e0', background: '#fff' }}>
      {Icon && <Icon size={36} strokeWidth={1} className="mb-4" style={{ color: '#d4cccc' }} />}
      <p className="text-sm font-medium mb-1" style={{ color: '#4a3a3a' }}>{title}</p>
      {description && <p className="text-xs max-w-xs" style={{ color: '#8a7070' }}>{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
