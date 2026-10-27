// Ironlog: turn each new feedback report into a GitHub issue in the private
// tickets repository. Called by a Supabase Database Webhook on INSERT into
// public.feedback (SUPABASE.md, Part 4). Paste this into the Supabase
// dashboard (Edge Functions > Deploy a new function > Via editor), name it
// feedback-to-issue, and turn "Verify JWT" off: the webhook proves itself with
// the x-webhook-secret header instead, checked below.
//
// Secrets (Edge Functions > Secrets):
//   WEBHOOK_SECRET  a long random string, also set as a header on the webhook
//   GITHUB_TOKEN    a fine-grained token for the tickets repository only,
//                   with Issues: read and write, Contents: read and write
//   TICKETS_REPO    owner/name of that private repository
//
// Feedback text is written by other people. It is quoted, never followed:
// mentions are broken so nobody is pinged, and nothing in it is run.
import { createClient } from 'npm:@supabase/supabase-js@2';

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// "@name" would notify a GitHub user; a zero-width space after @ stops that.
const quiet = (s: string) => s.replace(/@/g, '@​');
// GitHub ends a line at \n, \r or \r\n (CommonMark), so a report is split at each, or a bare \r
// would end the quote and let the sender write the issue's own lines (r64, the r63 audit's A-3).
const lines = (s: string) => s.split(/\r\n|\r|\n/);
const quote = (s: string) => lines(quiet(s)).map((l) => '> ' + l).join('\n');
// A value shown in a line of the app's own: one line, as code, so nothing in it is read as markup.
const code = (s: string) => '`' + lines(quiet(s)).join(' ').replace(/`/g, "'") + '`';
// The app's limit on a report's text (FB_MAX in src/app/feedback.ts, and the table's check);
// tests/report-fn.js holds them equal.
const MSG_MAX = 1000;
// GitHub refuses an issue whose body is longer than this many characters.
const BODY_MAX = 65536;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Use POST' });
  const secret = Deno.env.get('WEBHOOK_SECRET') ?? '';
  if (!secret || req.headers.get('x-webhook-secret') !== secret) return reply(401, { error: 'Not the webhook' });
  const token = Deno.env.get('GITHUB_TOKEN') ?? '', repo = Deno.env.get('TICKETS_REPO') ?? '';
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return reply(500, { error: 'GITHUB_TOKEN or TICKETS_REPO missing' });
  let body: any;
  try { body = await req.json(); } catch { return reply(400, { error: 'Not JSON' }); }
  if (body?.type !== 'INSERT' || body?.table !== 'feedback' || !body?.record) return reply(200, { skipped: true });
  const r = body.record;
  const gh = (p: string, init: RequestInit = {}) => fetch('https://api.github.com' + p, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'ironlog-feedback', 'Content-Type': 'application/json' },
  });

  // The screenshot goes into the private repository, so the issue can show it.
  let shot = '';
  const data = typeof r.screenshot === 'string' && r.screenshot.startsWith('data:image/jpeg;base64,') ? r.screenshot.slice(23) : '';
  if (data) {
    const p = `shots/${r.id}.jpg`;
    const res = await gh(`/repos/${repo}/contents/${p}`, { method: 'PUT', body: JSON.stringify({ message: `Screenshot for feedback ${r.id}`, content: data }) });
    if (res.ok) shot = `https://github.com/${repo}/blob/HEAD/${p}?raw=true`;
  }

  const cat = ['bug', 'idea', 'question'].includes(r.category) ? r.category : 'bug';
  const msg = String(r.message ?? '').slice(0, MSG_MAX);
  const first = lines(msg)[0].trim().slice(0, 70) || 'Feedback';
  const ctx = JSON.stringify(r.context ?? {}, null, 1).replace(/```/g, "'''");
  // The address is the account's own email, set by the database (SUPABASE.md, r64); shown as code all the same.
  const head = [
    `**${cat}** from ${r.user_id ? 'a signed-in user' : 'a signed-out user'}, ${r.created_at}. Feedback id ${r.id}.`,
    '',
    quote(msg),
    '',
    shot ? `![screenshot](${shot})` : '_No screenshot._',
    '',
    r.reply_to ? `Reply to: ${code(String(r.reply_to).slice(0, 200))}` : '_No reply address._',
    '',
    '<details><summary>Attached by the app</summary>',
    '',
    '```json',
  ].join('\n');
  const tail = ['```', '</details>'].join('\n');
  // What the app attached is cut, if it must be, so the whole body fits GitHub's limit and its code block still closes.
  const text = [head, ctx.slice(0, Math.max(0, BODY_MAX - head.length - tail.length - 2)), tail].join('\n');
  const res = await gh(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: `[${cat}] ${quiet(first)}`, body: text, labels: ['feedback', cat] }) });
  if (!res.ok) return reply(502, { error: 'GitHub refused the issue', status: res.status, detail: (await res.text()).slice(0, 300) });
  const issue = await res.json();

  // Link the report to its issue, so the in-app inbox can show it.
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!key) { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); key = k.default ?? Object.values(k)[0] ?? ''; } catch { key = ''; } }
  if (url && key) {
    // The issue is made either way; a link that fails is logged (Edge Functions > feedback-to-issue > Logs), so the Inbox's missing link can be explained.
    try {
      const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await admin.from('feedback').update({ issue_url: issue.html_url }).eq('id', r.id);
      if (error) console.error('issue_url not saved', r.id, error.message ?? error);
    } catch (e) {
      console.error('issue_url not saved', r.id, String(e));
    }
  }
  return reply(200, { issue: issue.html_url });
});
