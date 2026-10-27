# What V does (owner actions)

Everything that needs you, in one place, with the exact code to paste. Claude keeps this file current: an item moves to Done only when you confirm it, or when Claude can check it from here (and says how it checked). Build work and decisions are tracked in `PENDING.md`; this file is only what you do by hand.

Last updated: r63 live (#60 merged by you at 05:28 UTC, published 05:57 from ce83d0c; checked by Claude: gh-pages "Publish ce83d0c", service worker ironlog-2026.10.27-r63-667bd9407f), r64 in progress, 2026-10-27.

## Now, in this order

1. A28 (r64 and r65, the hardening of the r63 audit): Claude opens r64's and r65's pull requests, stacked, once every suite passes in both browsers and one independent review over both is clean; you try the preview and merge them in order on GitHub's website. When r64 is built: one SQL step for problem reports (exact code given then). A27 (r63): done, merged by you (#60, 2026-10-27 05:28 UTC), r63 live as build 2026.10.27-r63. B1a (below), meant to run before that merge: status unknown, asked 2026-10-27; it is safe to run now if you have not (nothing breaks meanwhile: reports go without the key).
2. Problem reports, two pastes, any time, before or after r64's merge: B4 again with r64's code, then B1a, the r64 block (both below). Then confirm B5 (you believe it is done): Supabase > Integrations > Database Webhooks lists `feedback-to-issue`.
3. C6: add the code to the confirmation email (5 minutes, below). The app asks a new person for the code the email should carry. Status: to do, unless you have done it.
4. D6: delete the old branches and stop them piling up (2 minutes, below).
5. D5: lock down every account (two-step verification everywhere, push protection, DNSSEC, Claude's GitHub access limited to Ironlog).
6. Before friends sign up, decide item 15 in PENDING.md: optional encryption. Today you can read every account's log in Supabase's Table Editor, and the app's privacy line says so. With encryption on, nobody but the owner of a log can read it, and a forgotten passphrase loses that cloud copy for good. You chose to launch without it (2026-09-27); this is the last point to change that before other people's logs are in it.
7. After that, if you want it: decision 129 (make the repository private). Note that it hides the repository, not the app: every website's code is downloaded to the phone that opens it, so anyone can read the app's code at ironapp.org either way. No secret key is in it (checked 2026-10-04).
8. At the gym: Checks on your phone (below).

## When you want problem reports to reach you (item 58, about 20 minutes)

Until step B1, Report a problem says reports are not set up yet and keeps the text.

### B1. The report tables and their limits
Status: done, as you reported (2026-10-04).
Supabase > **SQL Editor** > **New query**. Replace `YOUR IRONLOG ACCOUNT EMAIL` on the last line with the email of your Ironlog account: the one shown at the top of the menu (top right) in the app when you are signed in. Not the ironapp.org mail address, unless that is what you signed up with. Type it only here, never in the repo. If you got it wrong, nothing breaks: run the last line again with the right email. Run:

```sql
-- One row per report. Signed-in people may add one; nobody but the readers below may read.
create table public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category text not null check (category in ('bug', 'idea', 'question')),
  message text not null check (char_length(message) between 10 and 1000),
  reply_to text check (reply_to is null or char_length(reply_to) <= 200),
  screenshot text check (screenshot is null or (screenshot ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' and char_length(screenshot) <= 1500000)),
  context jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 20000),
  issue_url text,
  client_id text check (client_id is null or char_length(client_id) <= 40)
);
-- A report's key, made on the phone (r63): the same report sent again is kept once.
create unique index feedback_client_once on public.feedback (user_id, client_id);
alter table public.feedback enable row level security;
create policy "signed-in people can add" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));
-- At most 5 reports a day per account, whatever the app does.
create function public.feedback_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The time and the ticket link are the server's, never the sender's: a back-dated
  -- report would slip past the daily limit, and a made-up link would show in your Inbox.
  new.created_at := now();
  new.issue_url := null;
  -- The reply address is the account's own email, never what was sent (r64): a made-up one could write anything into the ticket.
  new.reply_to := (select u.email from auth.users u where u.id = new.user_id and char_length(u.email) <= 200);
  -- The same report sent again (its answer lost on the way back, r63): kept once, and not counted again.
  if new.client_id is not null and exists (select 1 from public.feedback where user_id = new.user_id and client_id = new.client_id) then
    return null;
  end if;
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

### B1a. The r64 block: one paste, any time
Status: to do. It replaces r63's B1a (a report's key, which you may not have run) and D7 (a size limit on each synced document): this block does both, and adds two r64 rules. Supabase > **SQL Editor** > **New query**, paste, **Run**. It is safe to run more than once, and nothing in the app waits for it.
- A report sent again after its answer was lost is kept once, so one ticket, not two (r63).
- A report's reply address is your friend's account email, set by the database, never what the phone sent: a made-up one could write lines into the GitHub issue (r64, the r63 audit's A-3).
- A synced document is at most 1 MB (r45, D7), and one account at most 2,000 documents and 25 MB, about 20 times a three-year log, so no account can fill the free database (r64, PENDING 339 l).

```sql
-- r64: run once, after any block above; running it again does no harm.
alter table public.feedback add column if not exists client_id text check (client_id is null or char_length(client_id) <= 40);
create unique index if not exists feedback_client_once on public.feedback (user_id, client_id);
create or replace function public.feedback_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The time and the ticket link are the server's, never the sender's: a back-dated
  -- report would slip past the daily limit, and a made-up link would show in your Inbox.
  new.created_at := now();
  new.issue_url := null;
  -- The reply address is the account's own email, never what was sent (r64): a made-up one could write anything into the ticket.
  new.reply_to := (select u.email from auth.users u where u.id = new.user_id and char_length(u.email) <= 200);
  -- The same report sent again (its answer lost on the way back, r63): kept once, and not counted again.
  if new.client_id is not null and exists (select 1 from public.feedback where user_id = new.user_id and client_id = new.client_id) then
    return null;
  end if;
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.feedback_limit() from public, anon, authenticated;
-- At most 2,000 documents and 25 MB stored per account (r64): three and a half years
-- of four sessions a week is 88 documents and about 1.1 MB, so this only stops one
-- account filling the free database. A document being replaced is not counted twice.
create or replace function public.docs_limit() returns trigger language plpgsql security definer set search_path = '' as $$
declare n bigint; b bigint;
begin
  execute format('select count(*), coalesce(sum(pg_column_size(data)), 0) from %I.%I where user_id = $1 and path <> $2', tg_table_schema, tg_table_name)
    into n, b using new.user_id, new.path;
  if n >= 2000 or b + pg_column_size(new.data) > 26214400 then
    raise exception 'docs_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
-- Only the triggers run it; nobody can call it through the API.
revoke all on function public.docs_limit() from public, anon, authenticated;
-- Each table only if this project has it, and each limit only once.
do $$
begin
  if to_regclass('public.docs') is not null then
    if not exists (select 1 from pg_constraint where conname = 'docs_data_size') then
      alter table public.docs add constraint docs_data_size check (pg_column_size(data) <= 1048576) not valid;
    end if;
    create or replace trigger docs_limit before insert or update on public.docs for each row execute function public.docs_limit();
  end if;
  if to_regclass('public.docs_preview') is not null then
    if not exists (select 1 from pg_constraint where conname = 'docs_preview_data_size') then
      alter table public.docs_preview add constraint docs_preview_data_size check (pg_column_size(data) <= 1048576) not valid;
    end if;
    create or replace trigger docs_preview_limit before insert or update on public.docs_preview for each row execute function public.docs_limit();
  end if;
end $$;
```

Check: Supabase > **Table Editor** > `feedback` has a `client_id` column; and in a new query, `select tgname from pg_trigger where tgname like 'docs%limit';` lists `docs_limit` and `docs_preview_limit`.

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
  -- The time and the ticket link are the server's, never the sender's: a back-dated
  -- report would slip past the daily limit, and a made-up link would show in your Inbox.
  new.created_at := now();
  new.issue_url := null;
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger feedback_limit before insert on public.feedback for each row execute function public.feedback_limit();
alter table public.feedback drop constraint if exists feedback_screenshot_check;
alter table public.feedback add constraint feedback_screenshot_check check (screenshot is null or (screenshot ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' and char_length(screenshot) <= 1500000)) not valid;
-- Only the trigger runs it; nobody can call it through the API.
revoke all on function public.feedback_limit() from public, anon, authenticated;
```

**Already ran this step between r25 and r28?** Run this as well (r29): it stops back-dated reports and anything but a plain picture in the screenshot field.

```sql
create or replace function public.feedback_limit() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- The time and the ticket link are the server's, never the sender's: a back-dated
  -- report would slip past the daily limit, and a made-up link would show in your Inbox.
  new.created_at := now();
  new.issue_url := null;
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.feedback_limit() from public, anon, authenticated;
alter table public.feedback drop constraint if exists feedback_screenshot_check;
alter table public.feedback add constraint feedback_screenshot_check check (screenshot is null or (screenshot ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' and char_length(screenshot) <= 1500000)) not valid;
```

### B2. A private repository for the tickets
Status: done, as you reported (2026-10-04).
GitHub > **+** > **New repository**. Name `ironlog-feedback`. Select **Private**. Tick **Add a README**. **Create repository**. Private because reports quote what people wrote and may show their screen.

### B3. A token that can only write tickets
Status: done, as you reported (2026-10-04). Tell Claude the token's expiry date for the reminder below.
GitHub > your photo > **Settings** > **Developer settings** > **Personal access tokens** > **Fine-grained tokens** > **Generate new token**.
- Name: `ironlog-feedback`. Expiration: 1 year. Claude adds a reminder to this file to renew it before then.
- Repository access: **Only select repositories** > `ironlog-feedback`.
- Permissions > Repository: **Issues: Read and write**, **Contents: Read and write**. Nothing else.
- **Generate token**, copy it. It is shown once. It goes only into Supabase in B4.

### B4. The function that turns a report into a GitHub issue
Status: done, as you reported (2026-10-04). **Paste it again with r64's code** (to do): Supabase > **Edge Functions** > `feedback-to-issue` > **Code**, select all, paste the code below over it, **Deploy**. r64 keeps a report's words inside their quote whatever line endings they carry, shows the reply address as code on one line, cuts text to the app's own limits, and logs a report it could not link to its issue (the r63 audit's A-3, A-9 and A-12). It is not published by a merge: the copy in Supabase changes only when you paste it.
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
````

Turn **Verify JWT** off for this function, then **Deploy**. Then Edge Functions > **Secrets** > add three:
- `GITHUB_TOKEN`: the token from B3.
- `TICKETS_REPO`: `vqx7/ironlog-feedback`
- `WEBHOOK_SECRET`: a long random string (your password manager can make one). Keep it for B5.

### B5. The trigger
Status: you believe it is done (2026-10-27); to confirm: Supabase > **Integrations** > **Database Webhooks** lists `feedback-to-issue`. If it does, paste B4's r64 code first, since until then a report's words can write lines of their own into the issue.
Supabase > **Integrations** > **Database Webhooks** (enable it if asked) > **Create a new hook**.
- Name `feedback-to-issue`. Table `feedback`. Events: **Insert** only.
- Type: **Supabase Edge Functions**. Function `feedback-to-issue`. Method **POST**. Leave the timeout as it is.
- HTTP Headers > **Add new header**: name `x-webhook-secret`, value the string from B4.
- **Create webhook**.
Check: Report a problem from the app. Within seconds an issue labelled `feedback` appears in `ironlog-feedback`. If not: Edge Functions > `feedback-to-issue` > **Logs** says why (401 means the header and the secret differ).

### B6. Protect main, so a pull request is the only way into the live app
Status: done 2026-10-15 (V): the ruleset `main` is active, requiring a pull request and the `test` check, and refusing deletion and force pushes (checked through the API on 2026-10-17: `gh api repos/vqx7/Ironlog/rules/branches/main`). Claude opens pull requests and you merge them on the website. The steps below are kept as the record of what was set.
GitHub > vqx7/Ironlog > **Settings** > **Rules** > **Rulesets** > **New ruleset** > **New branch ruleset**.
- Name `main`. Enforcement status: **Active**.
- Target branches: **Add target** > **Include default branch**.
- Tick **Require a pull request before merging** (leave required approvals at 0, since you merge your own).
- Tick **Require status checks to pass** > **Add checks** > `test`.
- **Create**.

### B7. Who reads the tickets
Status: decided by you (2026-10-15, PENDING 349 b): you do, and nothing automated ever reads a ticket. A report is written by someone else, so no agent acts on one; when you want something in a report fixed, you say so in a chat with Claude, which reproduces it from your words. No ticket fixer was ever set up (checked 2026-10-27: no such scheduled task on your Claude account, and Claude's GitHub access does not reach `ironlog-feedback`). Keep it that way: leave `ironlog-feedback` out of Claude's GitHub access (D5 step 5), and add no Claude GitHub Action there.

## Before friends sign up (item 6, about $10 to $12 a year)

Today, confirmation and reset emails reach only your own Supabase account's email, 2 an hour. Friends need your own sender, which needs a domain. The app moves to the same domain (decided 2026-10-02).

### C1. Decide the domain (items 6 and 23)
Status: done. ironapp.org, bought 2026-10-02. If the app's address ever changes, each phone starts with an empty local log at the new address. Signed-in people get theirs back by signing in; people without an account would need a backup file. So this happens before friends install.

### C2. Buy the domain and point it at the app
Status: done (checked by Claude 2026-10-02: GitHub's domain file names ironapp.org and the site answers over https).
1. dash.cloudflare.com > sign up > **Domain Registration** > **Register Domains** > search > buy (about $10 a year for a .com). Tell Claude the name.
2. Cloudflare > your domain > **DNS** > **Records**. Delete any records Cloudflare made for `@` or `www`. Add these, each with Proxy status **DNS only** (grey cloud; GitHub cannot issue the https certificate through Cloudflare's proxy):
   - Type `A`, Name `@`, one record each for `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - Type `AAAA`, Name `@`, one record each for `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - Type `CNAME`, Name `www`, Target `vqx7.github.io`
3. Verify it with GitHub, so no one else can claim it there: github.com > your picture > **Settings** > **Pages** > **Add a domain** > your domain. GitHub shows a TXT record; add it in Cloudflare (DNS only), then **Verify** in GitHub.

### C3. Email sender (Resend, free: 100 emails a day)
Status: done, as you reported (2026-10-02).
resend.com > sign up > **Domains** > **Add Domain** > `mail.ironapp.org` (Resend recommends a subdomain, so email reputation stays apart from the site). Resend lists DNS records made for your domain; add each one in Cloudflare exactly as shown, DNS only. Also add a TXT record yourself:
- Name: `_dmarc`  Value: `v=DMARC1; p=none;`
Wait until Resend shows **Verified**. Then **API Keys** > **Create API key**, permission **Sending access**, domain `mail.ironapp.org`. Copy it; it is a secret and goes only into C4.

### C4. Connect Supabase to the sender
Status: done, and the Forgot password email arrives from Ironlog (you, 2026-10-04).
Supabase > **Authentication** > **Emails** > **SMTP Settings** > enable custom SMTP:
- Sender email `no-reply@mail.ironapp.org`  Sender name `Ironlog`
- Host `smtp.resend.com`  Port `465`  Username `resend`  Password: the Resend API key
- **Save**. Then Authentication > **Rate Limits**: emails `30` an hour. **Save**.
- Test: Forgot password with your own email. The email comes from Ironlog.

### C5. Switch the app to the domain
Status: done. Step 1 checked by Claude (2026-10-02); steps 2 and 3 as you reported, app reinstalled from ironapp.org.
1. GitHub > vqx7/Ironlog > **Settings** > **Pages** > **Custom domain**: your domain > **Save**. Wait for the DNS check to pass, then tick **Enforce HTTPS** (the certificate can take up to an hour). The old vqx7.github.io/Ironlog link then forwards to the domain.
2. Supabase > **Authentication** > **URL Configuration**: Site URL `https://ironapp.org/`. Under Redirect URLs add `https://ironapp.org/` and `https://ironapp.org/preview/`. Keep the old vqx7.github.io entries until every phone has moved.
3. Your phone: open `https://ironapp.org` in Safari, sign in, check your log is there, **Add to Home Screen**. Then remove the old Ironlog and Preview icons (signed in, nothing is lost).

### C6. The code in the confirmation email (r45, item 61)
Status: to do, unless you have done it. r45 is live, so until it is done a new person is asked for a code the email does not show (the link still works).
1. Supabase > **Authentication** > **Emails** > **Templates** > **Confirm signup**. Under the existing link, add this line (keep the link):
   `Or type this code in the Ironlog app: {{ .Token }}`
   **Save**.
2. Supabase > **Authentication** > **Sign In / Providers** > **Email**: check **Email OTP expiration** is `3600` (an hour, the default). The code is six digits; the app takes whatever the email shows.
3. Check: create a test account from the app with an address you own. The email shows the link and a 6-digit code. Type the code in the app: it signs in. Then delete the test account (Settings > Your data > Delete my account).
Until step 1 is done the email has no code, and the link works as before.

## Security and privacy

### D3. Who can see what (no action, for reference)
Your log: only your account, and you as the Supabase project owner (Table Editor shows every row, friends' included). The app says so in Settings > Your data. Reports: only accounts listed in `feedback_readers`. Optional end-to-end encryption is item 15 in PENDING.md.

### D5. Lock down every account (about 30 minutes, once)
Status: to do. Each step is free and none of them stops Claude from building and publishing.
1. **Your email** (the one every reset link goes to): turn on two-step verification with an authenticator app or a passkey. Everything else can be reset from this inbox, so it comes first.
2. **GitHub:** your photo > Settings > Password and authentication > enable two-factor authentication (authenticator app or passkey). Save the recovery codes in your password manager.
3. **GitHub, the Ironlog repository:** Settings > Advanced Security (or Code security) > turn on **Dependabot alerts**, **Secret Protection** and **Push protection**. They warn you if a key is ever committed by mistake. The repository stays public for now: free GitHub Pages needs that, and nothing secret is in it (the Supabase keys in it are the public ones; row level security protects the data). Making it private is decision 129 in PENDING.md.
4. **GitHub, B6:** protect main: done 2026-10-15 (B6 above).
5. **GitHub, what Claude can reach:** your photo > Settings > Applications > Installed GitHub Apps > the Claude app > Configure > Repository access: **Only select repositories**, with `Ironlog` only (checked 2026-10-27: it reaches Ironlog and not `ironlog-feedback`). Nothing automated reads a ticket (B7). You can revoke it here at any time.
6. **Supabase:** your account (top right) > Account preferences > Security > enable multi-factor authentication. Then Authentication > Sign In / Providers > Email: keep **Confirm email** on. Then Advisors > Security Advisor > Refresh: only the Leaked Password Protection warning should remain (Pro plan; the app checks passwords itself).
7. **Cloudflare:** My Profile > Authentication > enable two-factor. Then your domain > DNS > Settings > **Enable DNSSEC** (one tap on a Cloudflare-registered domain). Domain Registration > Manage > check **Registrar lock** is on.
8. **Resend:** Settings > Account > enable two-factor. The API key you made is sending-only for `mail.ironapp.org`; leave it that way.
9. **Claude:** your Claude account signs in through your email (or Google), so steps 1 and, if used, your Google account's two-step verification protect it.
10. **Never paste** the Supabase secret key, a GitHub token or the Resend key into a chat, the app or the repository. They belong only in the dashboards named in B4 and C4.

### D6. Old branches
Status: to do (checked by Claude on 2026-10-27 through GitHub's compare API: the branches below are on GitHub, and Automatically delete head branches is still off). Claude's GitHub access cannot delete branches.
These are wholly in `main` (GitHub shows each 0 commits ahead of it), so deleting them loses nothing: `modular`, `modular-2`, `r48`, `r51`, `r52`, `r53`, `r54`, `r55`, `r55.1`, `r56-wip`, `r56`, `r56.1`, `r56.2`, `r57`, `r58`, `r60`, `r61-on-r60`, `r62` and `r63`. Three more hold only what is in `main` already: `r59` (one commit ahead, the merge of #56 into it, changing no file), `r61` (22ac59e, an earlier copy of r61's first commits, each in `r61-on-r60`, checked 2026-10-26) and `r61-normalize-draft` (drafts r61 has since built). Keep `r64` (and `r65` when it exists) until their pull requests are merged.
1. github.com/vqx7/Ironlog/branches > tap the trash icon on `modular`, `modular-2`, `r48`, `r51`, `r52`, `r53`, `r54`, `r55`, `r55.1`, `r56-wip`, `r56`, `r56.1`, `r56.2`, `r57`, `r58`, `r59`, `r60`, `r61`, `r61-normalize-draft`, `r61-on-r60`, `r62` and `r63`. Two more hold commits that are not in `main`, your call: `r42-look` (the restyle you turned down, pull request #32) and `r31.2` (one commit pushed after its pull request #17 merged).
2. So it does not happen again: Settings > General > Pull Requests > tick **Automatically delete head branches**. Each branch then goes when its pull request is merged.

### D7. A size limit on each synced document (r45, item 286)
Status: in B1a, the r64 block, which adds it only where it is missing. Nothing separate to run.

## Checks on your phone (items 7 and 63)
Status: to do whenever you are at the gym; tell Claude what you see.
- Rest timer across a screen lock; the share sheet to Files for a backup; the notch in the home-screen app; "Update ready" then Update (from r60; until then "New version ready" then Reload).
- Auto-mark with the keyboard's Done on a grey reps field; the 3D body's drag and tap; the Add to Home Screen guide on iOS 26 Safari.
- The app signing itself in after a confirmation link; a past workout from the week bar; the light Today card; a screenshot attached to a report.
- From r54, in the preview (PENDING 311 f, 322; no browser here has an on-screen keyboard), in Safari and in the home-screen app: sign in with a wrong password, then tap the email field and change it without closing the sheet; the sheets you type in (sign in, create account, a problem report, a goal, a note) open tall with their fields at the top, so the field you tap stays in view with the keyboard up, nothing moves up and down as it comes, and nothing of the page shows under the sheet.
- r55, in the preview (pull request #48): tick a set with 0 reps (it shows as missed); type 1000 on a bench set and tick it (it asks Log it or Fix it); change a ticked set's load to 1000, tap Fix it, type the right load (the set stays ticked); Settings > More shows one demo button and the version; save one tape measurement, then another the same day (one entry with both); in the preview, sign out with Keep on this phone, log a set or two, and sign back in (everything is still there, the new sets included).

- r55.1, in the preview (pull request #49): tick a set at a light weight with 0 reps (it asks Log it as missed or Fix it); in Settings > Your gym, turn a small plate off and look at a barbell lift's next load and its warm-ups (all loadable with the plates left); after a set, type a load 10 times too heavy in Type or dictate sets (it asks); signed in, Settings > More > Load demo data (it says why it does not).
- r56.1 to r59, in the preview or live: one workout open on two phones, a set ticked on each (both kept); Your gym's plates and the next load on a barbell lift; History, Settings, Plan, Stats and Today look and work as before (r57 to r59 moved them, nothing meant to change); the calendar's days ahead (r59).
- r60, in the preview, in Safari and in the home-screen app (no browser here has an on-screen keyboard or iPhone selection): in a workout, tap a load field with a grey number (it shows the number selected; type a digit and it replaces it; tap away untouched and it is grey again) and a typed one (the same); a second tap places the cursor; one tap on the checkmark still logs the grey load. A barbell lift's first time, nothing typed: tap the checkmark (it says Add the weight first and puts the cursor in the load). Back after five weeks or more off a lift: the next sets after an easy first set (V's 165 x 10 at 3 in reserve case: 185 for 6). The update bar says "Update ready".
- r61, in the preview: in a workout, ⋯ on an exercise you have logged before > New machine or gym (its target and grey load go, the first-time hint shows, and a New machine tag sits by its name); ⋯ again > Same machine as before (they come back). Mark it, log and Finish: no PR for that lift even if the numbers are higher, and on Stats its best estimate is today's, with its earlier sessions still in History.
- r62, in the preview (every sheet but the account, menu, problem report and import ones is drawn anew; nothing meant to change): Pick for me from Change and inside a workout, Short on time, Limited equipment, ⋯ on an exercise and each choice in it, typed sets, a goal, the exercise editor (type a name, then tick Bodyweight: the name stays), the picker's search (type and the list follows, the keyboard stays), install and a past workout. Then tick a set on its grey load, clear the load and tap away: the set unticks (356); tick it again and it takes the grey load.
- r63, in the preview (every action and the start moved, the legacy script gone; nothing meant to change but two time limits): a workout from start to Finish, Undo after a change, swap and add an exercise, the exercise editor's Save, Short on time and Limited equipment, a past workout, the calendar's days; in Settings, Import workouts (a pasted note) and Export; the menu's account sheet (sign in, a wrong password, Forgot password); Report a problem with the phone in airplane mode: after about 20 s it says No answer and keeps your text, and sent again with the connection back it goes once.
## Reminders
- Renew the `ironlog-feedback` token (B3) before it expires, a year after you make it. Claude writes the date here when you say B3 is done.

## Done
- A26 and A27 (r59 to r63): merged by you (#55; #58 with r60 and r61; #59, r62; #60, r63 on 2026-10-27 at 05:28 UTC), r63 live as build 2026.10.27-r63 (checked by Claude on gh-pages, 2026-10-27).
- A9 to A25 (r30 to r58, 2026-10-04 to 2026-10-25): every release merged and published (pull requests #13 to #54; #32, the restyle, closed unmerged, and #50, r56, closed when #51 took its commits). r58 is live, build 2026.10.24-r58, checked by Claude on GitHub on 2026-10-25 (main at 0ed4bac). Each release's own line is in this file's git history.
- B6, protect main: done 2026-10-15 (details under B6).
- The tab bar on iOS 26 home-screen apps (r51): two iPhone users confirmed it stays on the bottom edge (2026-10-17).
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
- D4: ping's search_path fixed and minimum password length 8 (you, 2026-10-02). The Leaked Password Protection warning stays on the free plan; the app checks itself.
- A4: r26 tried on the preview and approved; r26 live (2026-10-02, merged by Claude at your go-ahead).
- A5: r27 tried on the preview and approved; r27 live at https://ironapp.org (2026-10-02, merged by Claude at your go-ahead).
- A6: r28 tried on the preview and approved; r28 live at https://ironapp.org (2026-10-02, merged by Claude at your go-ahead).
- A7: r29 tried on the preview and approved; live as r29.3 (2026-10-03). r29.4, the first-run taglines removed, went live the same day at your request without a preview check.
- B1 to B4 (you, by 2026-10-04).
- Forgot password email from Ironlog <no-reply@mail.ironapp.org> (you, 2026-10-04).
- C1 to C5: domain ironapp.org, Resend sender on mail.ironapp.org, Supabase connected, app switched and reinstalled (2026-10-02).
