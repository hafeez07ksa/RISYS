import { supabase } from '@/lib/supabase'

// Calls a Supabase edge function as the signed-in user.
// V6: always sends the user's session JWT — never the public anon key — so the
// function can verify who is calling and that they belong to the organisation.
export async function callEdgeFunction(name, body = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.')
  }

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok || data?.error) {
    throw new Error(data?.error || `Request failed (${res.status})`)
  }
  return data
}
