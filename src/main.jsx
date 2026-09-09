import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { router } from '@/router/routes'
import { useAuthStore } from '@/store/authStore'
import '@/styles/global.css'

function AppInitializer() {
  const initialize = useAuthStore((s) => s.initialize)
  useEffect(() => { initialize() }, [])
  return <RouterProvider router={router} />
}

// StrictMode removed — causes Supabase realtime double-subscribe in dev
createRoot(document.getElementById('root')).render(
  <AppInitializer />
)
