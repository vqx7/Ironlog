// Ironlog: delete the signed-in person's account and, through the table's
// "on delete cascade", every row of their synced log. Paste this into the
// Supabase dashboard (Edge Functions > Deploy a new function > Via editor),
// name it delete-account, and turn "Verify JWT" off: the function checks the
// caller itself below, with the Auth server, which works with every key type.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  // Admin rights exist only here, on the server; never in the app.
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!key) {
    try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); key = k.default ?? Object.values(k)[0] ?? ''; } catch { key = ''; }
  }
  if (!url || !key) return reply(500, { error: 'Server keys missing' });
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return reply(401, { error: 'Not signed in' });
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  // Only the person the token belongs to is deleted: the Auth server checks the token.
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data?.user) return reply(401, { error: 'Not signed in' });
  const { error: delErr } = await admin.auth.admin.deleteUser(data.user.id);
  if (delErr) return reply(500, { error: delErr.message });
  return reply(200, { deleted: true });
});
