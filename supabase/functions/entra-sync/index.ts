// Decommissioned. Superseded by entra-directory (which also syncs sign-in logs).
// It accepted any org_id without a membership check and wrote to columns that no longer exist.
Deno.serve(() => new Response(
  JSON.stringify({ error: 'This endpoint has been removed. Use entra-directory.' }),
  { status: 410, headers: { 'Content-Type': 'application/json' } },
))
