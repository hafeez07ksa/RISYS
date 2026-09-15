// This function has been decommissioned.
// It was a diagnostic tool (verify_jwt: false) used during development.
// Do not re-enable or restore.
Deno.serve((_req) => {
  return new Response(
    JSON.stringify({ error: 'This endpoint has been removed.' }),
    { status: 410, headers: { 'Content-Type': 'application/json' } }
  )
})
