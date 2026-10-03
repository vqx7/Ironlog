# What V does (owner actions)

Everything that needs you, in one place, with the exact code to paste. Claude keeps this file current: an item moves to Done only when you confirm it, or when Claude can check it from here (and says how it checked). Build work and decisions are tracked in `PENDING.md`; this file is only what you do by hand.

Last updated: r29 in preview, 2026-10-03.

## Now, in this order

0. A7: try r29 on the preview (https://ironapp.org/preview/, Reload when asked; the menu shows build r29), then say go. Look at Stats > Volume, the 3D body on Today, and drag an exercise by its ⠿ during a session.
1. Problem reports reaching you: B1 to B5 below (B1 alone already stores reports safely). The B1 code changed on 2026-10-03 (r29 audit); paste the version below, not an older copy.
2. D5: lock down every account (two-step verification everywhere, secret scanning, DNSSEC).
3. When you have a minute: Forgot password with your own email in the app, and check the email comes from Ironlog (no-reply@mail.ironapp.org). That is the last proof the sender works before friends sign up.
4. One decision in PENDING.md: 114 (the starter routine for someone who skips picking one).

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
  screenshot text check (screenshot is null or (screenshot ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' and char_length(screenshot) <= 1500000)),
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
Status: done, as you reported (2026-10-02). Claude cannot reach Supabase's settings from here; the Forgot password test under Now is the proof.
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

## Security and privacy

### D3. Who can see what (no action, for reference)
Your log: only your account, and you as the Supabase project owner (Table Editor shows every row, friends' included). The app says so in Settings > Your data. Reports: only accounts listed in `feedback_readers`. Optional end-to-end encryption is item 15 in PENDING.md.

### D5. Lock down every account (about 30 minutes, once)
Status: to do. Each step is free and none of them stops Claude from building and publishing.
1. **Your email** (the one every reset link goes to): turn on two-step verification with an authenticator app or a passkey. Everything else can be reset from this inbox, so it comes first.
2. **GitHub:** your photo > Settings > Password and authentication > enable two-factor authentication (authenticator app or passkey). Save the recovery codes in your password manager.
3. **GitHub, the Ironlog repository:** Settings > Advanced Security (or Code security) > turn on **Dependabot alerts**, **Secret Protection** and **Push protection**. They warn you if a key is ever committed by mistake. The repository stays public for now: free GitHub Pages needs that, and nothing secret is in it (the Supabase keys in it are the public ones; row level security protects the data). Making it private is decision 129 in PENDING.md.
4. **GitHub, B6:** protect main (steps above). After that nothing reaches the live app without passing every test.
5. **GitHub, what Claude can reach:** your photo > Settings > Applications > Installed GitHub Apps > the Claude app > Configure > Repository access: **Only select repositories**, with `Ironlog` (and `ironlog-feedback` only if you want Claude to read tickets later). You can revoke it here at any time.
6. **Supabase:** your account (top right) > Account preferences > Security > enable multi-factor authentication. Then Authentication > Sign In / Providers > Email: keep **Confirm email** on. Then Advisors > Security Advisor > Refresh: only the Leaked Password Protection warning should remain (Pro plan; the app checks passwords itself).
7. **Cloudflare:** My Profile > Authentication > enable two-factor. Then your domain > DNS > Settings > **Enable DNSSEC** (one tap on a Cloudflare-registered domain). Domain Registration > Manage > check **Registrar lock** is on.
8. **Resend:** Settings > Account > enable two-factor. The API key you made is sending-only for `mail.ironapp.org`; leave it that way.
9. **Claude:** your Claude account signs in through your email (or Google), so steps 1 and, if used, your Google account's two-step verification protect it.
10. **Never paste** the Supabase secret key, a GitHub token or the Resend key into a chat, the app or the repository. They belong only in the dashboards named in B4 and C4.

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
- D4: ping's search_path fixed and minimum password length 8 (you, 2026-10-02). The Leaked Password Protection warning stays on the free plan; the app checks itself.
- A4: r26 tried on the preview and approved; r26 live (2026-10-02, merged by Claude at your go-ahead).
- A5: r27 tried on the preview and approved; r27 live at https://ironapp.org (2026-10-02, merged by Claude at your go-ahead).
- A6: r28 tried on the preview and approved; r28 live at https://ironapp.org (2026-10-02, merged by Claude at your go-ahead).
- C1 to C5: domain ironapp.org, Resend sender on mail.ironapp.org, Supabase connected, app switched and reinstalled (2026-10-02).
