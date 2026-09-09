export function AuthLayout({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8f7f7' }}>
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
