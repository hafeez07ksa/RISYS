# connect-src includes login.microsoftonline.com: the Entra connector
# exchanges its authorization code in the browser (Microsoft requires the
# Origin header for SPA-registered redirect URIs). Every other connector
# exchanges server-side in the oauth-exchange edge function, so no other
# provider host is needed here.
# script-src includes 'wasm-unsafe-eval': the PDF renderer (@react-pdf/renderer)
# lays text out with a WebAssembly build of Yoga, and compiling WASM is blocked
# otherwise. This keyword permits WebAssembly ONLY -- it does not allow eval()
# of JavaScript strings, which is what plain 'unsafe-eval' would have done.
# Copied to dist/app/_headers by scripts/postbuild.mjs

/*
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: default-src 'self'; script-src 'self' blob: 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://login.microsoftonline.com; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'

# Filenames are content-hashed by Vite, so they can be cached permanently.
/assets/*
  Cache-Control: public, max-age=31536000, immutable

# Logo and images used by RISYS emails. Loaded by mail clients from other
# origins, so no hashed filename: cache for a day, not forever.
/email/*
  Cache-Control: public, max-age=86400
