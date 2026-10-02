# What V does (owner actions)

Everything that needs you, in one place, with the exact code to paste. Claude keeps this file current: an item moves to Done only when you confirm it, or when Claude can check it from here (and says how it checked). Build work and decisions are tracked in `PENDING.md`; this file is only what you do by hand.

Last updated: r26 in progress, 2026-10-01.

## Now, in this order

### D4. Supabase Security Advisor fixes (r26, 2 minutes)
Status: to do.
1. **ping:** Supabase > **SQL Editor** > **New query**, paste, **Run**:

```sql
alter function public.ping() set search_path = '';
```

   Then **Advisors** > **Security Advisor** > **Refresh**: the "Function Search Path Mutable" warning on `public.ping` is gone.
2. **Password length:** **Authentication** > **Sign In / Providers** > **Email** > Minimum password length `8` > **Save**. This matches what the app already asks for.
3. **Leaked Password Protection:** nothing to do on the free plan; it needs Supabase Pro ($25 a month), so this one warning stays. The app checks new passwords against known breaches itself since r26.

### A4. Try r26 on the preview, then say go
Status: to do once Claude says the preview is up.
Open the Preview icon (or https://vqx7.github.io/Ironlog/preview/ in Safari), wait for "New version ready" and tap Reload. Settings shows build r26. Try: This week > Month on Today; a trimmed exercise's "Last" next time; the grey or filled-in choice at the top of a session.

## When you want problem reports to reach you (item 58, about 20 minutes)

Until step B1, Report a problem says reports are not set up yet and keeps the text.

### B1. The report tables and their limits
Status: to do.
Supabase > **SQL Editor** > **New query**. Replace `YOUR IRONLOG ACCOUNT EMAIL` on the last line with the email you sign in to Ironlog with (type it only here, never in the repo). Run:

```sql
-- One row per report. Signed-in people may add one; nobody but the readers below may read.
create table public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'idea', 'question')),
  message text not null check (char_length(message) between 10 and 1000),
  reply_to text check (reply_to is null or char_length(reply_to) <= 200),
  screenshot text check (screenshot is null or (screenshot like 'data:image/jpeg;base64,%' and char_length(screenshot) <= 1500000)),
  context jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 20000),
  issue_url text
);
alter table public.feedback enable row level security;
create policy "signed-in people can add" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));
-- At most 5 reports a day per account, whatever the app does.
create function public.feedback_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger feedback_limit before insert on public.feedback for each row execute function public.feedback_limit();
-- Only the trigger runs it; nobody can call it through the API.
revoke all on function public.feedback_limit() from public, anon, authenticated;
-- Who may read reports: you. The app shows an Inbox button to these accounts only.
create table public.feedback_readers (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.feedback_readers enable row level security;
create policy "see own reader row" on public.feedback_readers
  for select to authenticated using (user_id = (select auth.uid()));
create policy "readers read feedback" on public.feedback
  for select to authenticated
  using (exists (select 1 from public.feedback_readers r where r.user_id = (select auth.uid())));
grant insert on public.feedback to authenticated;
grant select on public.feedback to authenticated;
grant select on public.feedback_readers to authenticated;
insert into public.feedback_readers (user_id) select id from auth.users where email = 'YOUR IRONLOG ACCOUNT EMAIL';
```

Check: Report a problem from the app (signed in), then Supabase > **Table Editor** > `feedback` shows it, and Settings > Help shows **Inbox** for your account.

Only if you ever ran the older version of this step (before r25), run this instead:

```sql
delete from public.feedback where user_id is null;
alter table public.feedback alter column user_id set not null;
alter table public.feedback drop constraint if exists feedback_message_check;
alter table public.feedback add constraint feedback_message_check check (char_length(message) between 1 and 1000) not valid;
drop policy if exists "anyone can add" on public.feedback;
create policy "signed-in people can add" on public.feedback for insert to authenticated with check (user_id = (select auth.uid()));
revoke insert on public.feedback from anon;
create or replace function public.feedback_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger feedback_limit before insert on public.feedback for each row execute function public.feedback_limit();
-- Only the trigger runs it; nobody can call it through the API.
revoke all on function public.feedback_limit() from public, anon, authenticated;
```

### B2. A private repository for the tickets
Status: to do.
GitHub > **+** > **New repository**. Name `ironlog-feedback`. Select **Private**. Tick **Add a README**. **Create repository**. Private because reports quote what people wrote and may show their screen.

### B3. A token that can only write tickets
Status: to do.
GitHub > your photo > **Settings** > **Developer settings** > **Personal access tokens** > **Fine-grained tokens** > **Generate new token**.
- Name: `ironlog-feedback`. Expiration: 1 year. Claude adds a reminder to this file to renew it before then.
- Repository access: **Only select repositories** > `ironlog-feedback`.
- Permissions > Repository: **Issues: Read and write**, **Contents: Read and write**. Nothing else.
- **Generate token**, copy it. It is shown once. It goes only into Supabase in B4.

### B4. The function that turns a report into a GitHub issue
Status: to do.
Supabase > **Edge Functions** > **Deploy a new function** > **Via editor**. Name it exactly `feedback-to-issue`. Delete the sample code, paste all of this:

````ts
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
const quote = (s: string) => quiet(s).split('\n').map((l) => '> ' + l).join('\n');

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
  const msg = String(r.message ?? '').slice(0, 4000);
  const first = msg.split('\n')[0].trim().slice(0, 70) || 'Feedback';
  const ctx = JSON.stringify(r.context ?? {}, null, 1).slice(0, 20000).replace(/```/g, "'''");
  const lines = [
    `**${cat}** from ${r.user_id ? 'a signed-in user' : 'a signed-out user'}, ${r.created_at}. Feedback id ${r.id}.`,
    '',
    quote(msg),
    '',
    shot ? `![screenshot](${shot})` : '_No screenshot._',
    '',
    r.reply_to ? `Reply to: ${quiet(String(r.reply_to).slice(0, 200))}` : '_No reply address._',
    '',
    '<details><summary>Attached by the app</summary>',
    '',
    '```json',
    ctx,
    '```',
    '</details>',
  ];
  const res = await gh(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title: `[${cat}] ${quiet(first)}`, body: lines.join('\n'), labels: ['feedback', cat] }) });
  if (!res.ok) return reply(502, { error: 'GitHub refused the issue', status: res.status, detail: (await res.text()).slice(0, 300) });
  const issue = await res.json();

  // Link the report to its issue, so the in-app inbox can show it.
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  let key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!key) { try { const k = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}'); key = k.default ?? Object.values(k)[0] ?? ''; } catch { key = ''; } }
  if (url && key) {
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    await admin.from('feedback').update({ issue_url: issue.html_url }).eq('id', r.id);
  }
  return reply(200, { issue: issue.html_url });
});
````

Turn **Verify JWT** off for this function, then **Deploy**. Then Edge Functions > **Secrets** > add three:
- `GITHUB_TOKEN`: the token from B3.
- `TICKETS_REPO`: `vqx7/ironlog-feedback`
- `WEBHOOK_SECRET`: a long random string (your password manager can make one). Keep it for B5.

### B5. The trigger
Status: to do.
Supabase > **Integrations** > **Database Webhooks** (enable it if asked) > **Create a new hook**.
- Name `feedback-to-issue`. Table `feedback`. Events: **Insert** only.
- Type: **Supabase Edge Functions**. Function `feedback-to-issue`. Method **POST**. Leave the timeout as it is.
- HTTP Headers > **Add new header**: name `x-webhook-secret`, value the string from B4.
- **Create webhook**.
Check: Report a problem from the app. Within seconds an issue labelled `feedback` appears in `ironlog-feedback`. If not: Edge Functions > `feedback-to-issue` > **Logs** says why (401 means the header and the secret differ).

### B6. Protect main, so a pull request is the only way into the live app
Status: to do whenever you like (D2 is done, so merges on the website use your private address). Once it is on, Claude opens pull requests and you merge them on the website.
GitHub > vqx7/Ironlog > **Settings** > **Rules** > **Rulesets** > **New ruleset** > **New branch ruleset**.
- Name `main`. Enforcement status: **Active**.
- Target branches: **Add target** > **Include default branch**.
- Tick **Require a pull request before merging** (leave required approvals at 0, since you merge your own).
- Tick **Require status checks to pass** > **Add checks** > `test`.
- **Create**.

### B7. Choose who picks up the tickets
Status: your decision. Say which in chat and Claude sets it up.
- A scheduled Claude task (recommended): runs on your Claude plan, nothing extra to pay.
- Claude's GitHub Action: faster, but needs an Anthropic API key billed per run.

## Before friends sign up (item 6, about $10 to $12 a year)

Today, confirmation and reset emails reach only your own Supabase account's email, 2 an hour. Friends need your own sender, which needs a domain.

### C1. Decide the domain, and whether the app moves to it (items 6 and 23)
Status: your decision. Decide both together, before friends install: if the app's address ever changes, each phone starts with an empty local log at the new address. Signed-in people get theirs back by signing in; people without an account would need a backup file.

### C2. Buy the domain
Status: to do after C1. Cloudflare Registrar sells at cost (about $10 a year for a .com).

### C3. Email sender (Resend, free: 100 emails a day)
Status: to do after C2.
resend.com > sign up > **Domains** > **Add domain** > your domain. Resend then lists DNS records (DKIM, SPF, MX) whose exact values are made for your domain; add each one at your registrar exactly as shown. Also add this one yourself, a TXT record:
- Name: `_dmarc`  Value: `v=DMARC1; p=none;`
Wait until Resend shows **Verified**. Then **API Keys** > **Create API key**, permission **Sending access**, your domain. Copy it; it is a secret and goes only into C4.
Claude cannot give the DKIM, SPF and MX values ahead of time: Resend generates them per domain. Paste them in chat if you want them checked.

### C4. Connect Supabase to the sender
Status: to do after C3.
Supabase > **Authentication** > **Emails** > **SMTP Settings** > **Enable custom SMTP**:
- Sender email `no-reply@YOURDOMAIN`  Sender name `Ironlog`
- Host `smtp.resend.com`  Port `465`  Username `resend`  Password: the Resend API key
- **Save**. Then Authentication > **Rate Limits**: set the email limit to `30` an hour. **Save**.

## Security and privacy

### D3. Who can see what (no action, for reference)
Your log: only your account, and you as the Supabase project owner (Table Editor shows every row, friends' included). The app says so in Settings > Your data. Reports: only accounts listed in `feedback_readers`. Optional end-to-end encryption is item 15 in PENDING.md.

## Checks on your phone (items 7 and 63)
Status: to do whenever you are at the gym; tell Claude what you see.
- Rest timer across a screen lock; the share sheet to Files for a backup; the notch in the home-screen app; "New version ready" then Reload.
- Auto-mark with the keyboard's Done on a grey reps field; the 3D body's drag and tap; the Add to Home Screen guide on iOS 26 Safari.
- The app signing itself in after a confirmation link; a past workout from the week bar; the light Today card; a screenshot attached to a report.

## Reminders
- Renew the `ironlog-feedback` token (B3) before it expires, a year after you make it. Claude writes the date here when you say B3 is done.

## Done
- Supabase Part 1 (project, `docs` table, keys) and your account, with real sync confirmed (2026-09-27).
- Delete my account function and keep-alive `ping()` deployed; checked from the build machine: the function answers 405 "Use POST", `ping()` returns "ok" (2026-09-27).
- Claude artifact retired; log moved into the installed app (2026-09-27).
- Merged r21, r22, r23 and r24 (r24 on 2026-09-30). r25 merged by Claude at your go-ahead (2026-10-01).
- A1: Safari's copy updated; you opened r25 on the preview (2026-09-30).
- A2: the preview's sync table (`docs_preview`), run by you (confirmed 2026-10-01).
- A3: phone updated to r25, new icon in place, sign-in, password reset and history checked by you (2026-10-01).
- D1: old branches deleted on GitHub; only `main` and `gh-pages` remain (checked by Claude, 2026-10-01).
- D2: GitHub email kept private, command line pushes that expose it blocked (you, 2026-10-01). The four older merge commits still carry the Gmail address; you chose to leave them (PENDING 84, kept open as "not now").
- Security Advisor run by you (2026-10-01): two warnings, handled in D4.
