# Supabase setup for Ironlog accounts and sync

What V does in the Supabase dashboard, once. The app code (sign-in screen, sync adapter, tests, keep-alive) is build work tracked in `PENDING.md` 12 to 17. All of this is free on the Supabase Free plan: 2 active projects, 500 MB database, 50,000 monthly active users. Ironlog uses a few MB per person per year.

## Part 1: for V alone (free, about 15 minutes)

1. **Account.** Go to supabase.com, Start your project, sign in with GitHub.
2. **Project.** New project. Name `ironlog`. Region: West US (North California). Generate a database password and save it in your password manager (the app never uses it). Plan: Free. Wait about 2 minutes while it starts.
3. **Keys.** Project Settings > API Keys. Copy the **Project URL** and the **publishable key** (older projects call it `anon`). Both are safe to put in the app: they identify the project, and the table rules below decide what each signed-in person can read. Never copy the **secret key** (older name `service_role`) anywhere.
4. **Email sign-in.** Authentication > Sign In / Providers > Email: enabled (the default). Leave "Confirm email" on.
5. **Links in emails.** Authentication > URL Configuration. Site URL: `https://vqx7.github.io/Ironlog/`. Add the same address under Redirect URLs. Once the app moves to its own domain (`OWNER.md` C5), the Site URL becomes `https://YOURDOMAIN/`, and `https://YOURDOMAIN/` and `https://YOURDOMAIN/preview/` are added under Redirect URLs. Confirmation and password-reset emails send people back here.
6. **The table and its privacy rule.** SQL Editor > New query, paste this, Run:

```sql
-- One row per Ironlog document (core, draft, session chunks) per person.
create table public.docs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null,
  -- At most 1 MB stored per document (r45): the largest the app writes is
  -- tens of kilobytes, so this only stops an account filling the free database.
  data jsonb not null check (pg_column_size(data) <= 1048576),
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);
-- Row level security: a signed-in person can read and write only their own rows.
alter table public.docs enable row level security;
create policy "own rows only" on public.docs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
-- Signed-in users may use the table (subject to the rule above); signed-out visitors may not.
grant select, insert, update, delete on public.docs to authenticated;
revoke all on public.docs from anon;
-- At most 2,000 documents and 25 MB stored per account (r64): three and a half years
-- of four sessions a week is 88 documents and about 1.1 MB, so this only stops one
-- account filling the free database. A document being replaced is not counted twice.
create or replace function public.docs_limit() returns trigger language plpgsql security definer set search_path = '' as $$
declare n bigint; b bigint;
begin
  -- One account's documents are counted one write at a time (2.28): two written at once each counted without the other, and both passed the limit.
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || ' ' || new.user_id::text, 0));
  execute format('select count(*), coalesce(sum(pg_column_size(data)), 0) from %I.%I where user_id = $1 and path <> $2', tg_table_schema, tg_table_name)
    into n, b using new.user_id, new.path;
  if n >= 2000 or b + pg_column_size(new.data) > 26214400 then
    raise exception 'docs_limit' using errcode = 'P0001';
  end if;
  return new;
end $$;
-- Only the triggers run it; nobody can call it through the API.
revoke all on function public.docs_limit() from public, anon, authenticated;
create or replace trigger docs_limit before insert or update on public.docs for each row execute function public.docs_limit();
```

   `on delete cascade` means deleting an account deletes its data too.
7. **Hand over.** Paste the Project URL and the publishable key into the build chat. Nothing else is needed from the dashboard.

At this stage sign-up emails work only for you: Supabase's built-in email service sends only to members of the project's team, at most 2 emails an hour. That is enough for one person.

## Part 2: before friends sign up (about $10 to $12 a year)

Friends need confirmation and password-reset emails, which needs your own email sender, which needs a domain.

1. **Domain.** Buy one (Cloudflare Registrar sells at cost, about $10 a year for a `.com`). The same domain can later serve the app itself instead of `vqx7.github.io` (`PENDING.md` item 23), so decide both at once, before friends install.
2. **Sender.** resend.com, free plan (100 emails a day, 3,000 a month). Add the domain, then add the DNS records it lists at your registrar (DKIM, SPF and MX; add the optional DMARC record `v=DMARC1; p=none;` at `_dmarc` too, since Gmail and Yahoo favour it). Wait until it shows Verified. Create an API key with sending access only. It is a secret: it goes only into Supabase's SMTP password field.
3. **Connect it.** Supabase: Authentication > Emails > SMTP Settings > Enable custom SMTP. Host `smtp.resend.com`, port `465`, username `resend`, password the Resend API key, sender `no-reply@yourdomain.com`, sender name `Ironlog`.
4. **Rate limit.** Authentication > Rate Limits: raise the email limit (30 an hour is plenty).

## What the app does (built in r17)

- Settings > Your data: Create account or Sign in, with email and password, and Forgot password. Accounts are optional; without one the app works on the phone as before.
- Sign-up sends a confirmation email. The link opens in the browser (on an iPhone, Safari, which keeps its own storage apart from the home-screen app). Since r21 that browser asks "Where do you use Ironlog?": the home-screen app (it signs itself out, so it never uploads whatever it holds) or here in this browser (it stays signed in). Meanwhile the app, still on "Check your email", signs itself in when it comes back to the front, with the email and password just typed, held in memory only. If the link opens in the same storage the app is waiting in (the same browser, or Android's installed app), it signs in there without asking.
- Stays signed in on the phone and keeps working offline; changes sync when there is signal. The log already on the phone is merged in at first sign-in, not replaced, with Undo.
- Sign out asks whether to keep a copy on the phone or remove it (for a shared phone). Removing only happens once everything has synced.
- An emailed sign-in link without a password is left out on purpose: it would sign in Safari, not the installed app.

While only Part 1 is done, confirmation and reset emails go only to the email address you use for your Supabase account (the built-in sender's rule), at most 2 an hour. Sign up in Ironlog with that address.

## Part 3: Delete my account and keep-alive (added in r19, about 5 minutes)

**Delete my account** (Settings > Your data, when signed in). Admin rights cannot live in the app, so the deleting happens in a small function on Supabase:

1. Supabase > **Edge Functions** > **Deploy a new function** > **Via editor**.
2. Name it exactly `delete-account`.
3. Replace the sample code with everything in `supabase/functions/delete-account/index.ts` from this repo.
4. Turn **Verify JWT** (or "Enforce JWT verification") **off** for this function. The function checks who is calling itself, with the Auth server, so this is safe; with it on, the app's request is refused before the function runs.
5. **Deploy**.

To check it without deleting anything, open `https://fqvupierxrvpoidtwlon.supabase.co/functions/v1/delete-account` in a browser. `{"error":"Use POST"}` means it is deployed with Verify JWT off. A message about a missing authorization header means Verify JWT is still on. "Requested function was not found" means it is not deployed or the name is wrong.

Until this is done, Delete my account says it is not set up yet and deletes nothing. When it runs, the account and every synced row go (the table's `on delete cascade`); the copy on the phone stays.

**Keep-alive.** Free projects pause after a week without activity. Run this once in the SQL Editor:

```sql
-- A harmless call that touches the database and returns "ok". Reads nothing.
create or replace function public.ping() returns text language sql stable set search_path = '' as $$ select 'ok' $$;
grant execute on function public.ping() to anon;
```

To check it, run `select public.ping();` in the SQL Editor: it returns `ok`.

The GitHub Action in `.github/workflows/keepalive.yml` calls it once a day. GitHub pauses scheduled Actions in a repository with no commits for 60 days; if that happens, Actions > Keep Supabase awake > Enable workflow turns it back on. A paused project loses nothing and can be restored from the dashboard, but the app cannot sync until then.

## Part 4: Problem reports (added in r21, signed in only since r25, about 15 minutes)

Settings > Help (Report a problem, Ask a question, Suggest something) and Report a problem in an exercise's ⋯ menu store reports in a table that signed-in people can add to and only you can read. Until step 1 is done, Send says reports are not set up yet and keeps the text.

1. **The tables.** SQL Editor > New query, paste this, Run. On the last line, put the email you use for your own Ironlog account (type it here in the SQL editor only; it is not stored in the repo):

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
  -- One account's reports are counted one at a time (2.28): two sent at once each counted without the other, and both were kept.
  perform pg_advisory_xact_lock(hashtextextended('feedback_limit ' || new.user_id::text, 0));
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

   To check: send a report from the app, then Table Editor > feedback shows it; in the app, signed in with that account, Settings > Help shows Inbox.

   Limits, enforced here as well as in the app: signed-in accounts only, 5 reports a day each, 10 to 1,000 characters of text, one screenshot of about 1 MB.

   **Already ran the older version of this step (before r25)?** Run this instead of the block above, to bring the table up to the new rules:

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
  -- One account's reports are counted one at a time (2.28): two sent at once each counted without the other, and both were kept.
  perform pg_advisory_xact_lock(hashtextextended('feedback_limit ' || new.user_id::text, 0));
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
  -- One account's reports are counted one at a time (2.28): two sent at once each counted without the other, and both were kept.
  perform pg_advisory_xact_lock(hashtextextended('feedback_limit ' || new.user_id::text, 0));
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.feedback_limit() from public, anon, authenticated;
alter table public.feedback drop constraint if exists feedback_screenshot_check;
alter table public.feedback add constraint feedback_screenshot_check check (screenshot is null or (screenshot ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' and char_length(screenshot) <= 1500000)) not valid;
```

   **Set up before r64?** Run this as well, after any block above, once (running it again does no harm): it brings a project set up before r64 to the rules above. A report sent again after its answer was lost is kept once (r63, its key); a report's reply address is the account's own email, set by the database (r64); a synced document is at most 1 MB (r45, Part 6) and an account at most 2,000 documents and 25 MB (r64). Nothing changes in the app; until it runs, reports go without the key and take the reply address as sent.

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
  -- One account's reports are counted one at a time (2.28): two sent at once each counted without the other, and both were kept.
  perform pg_advisory_xact_lock(hashtextextended('feedback_limit ' || new.user_id::text, 0));
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
  -- One account's documents are counted one write at a time (2.28): two written at once each counted without the other, and both passed the limit.
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || ' ' || new.user_id::text, 0));
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

Steps 2 to 5 turn each report into a GitHub issue in a private repository, so you can read reports on GitHub as well as in the app's Inbox. Nothing automated reads them (V's ruling, `FEEDBACK.md`). They can wait.

2. **A private repository for tickets.** GitHub > New repository, name `ironlog-feedback`, **Private**, tick "Add a README". Reports quote what people wrote and may show their screen, so they must not go into the public Ironlog repository.
3. **A GitHub token for it.** GitHub > Settings > Developer settings > Fine-grained tokens > Generate new token. Repository access: Only select repositories > `ironlog-feedback`. Permissions: Issues read and write. Nothing else (Contents read and write was needed until r64, for screenshots; a token that has it still works). Expiry: a year. Copy it.
4. **The function.** Supabase > Edge Functions > Deploy a new function > Via editor. Name it exactly `feedback-to-issue`, paste everything in `supabase/functions/feedback-to-issue/index.ts`, turn **Verify JWT off**, Deploy. Then Edge Functions > Secrets, add:
   - `GITHUB_TOKEN`: the token from step 3.
   - `TICKETS_REPO`: `vqx7/ironlog-feedback`.
   - `WEBHOOK_SECRET`: a long random string (a password manager can make one). Keep it for step 5.
5. **The trigger.** Database > Webhooks > Create a new hook. Name `feedback-to-issue`, table `feedback`, events **Insert** only, type **Supabase Edge Functions**, function `feedback-to-issue`, method POST. Under HTTP Headers add `x-webhook-secret` with the same random string. Create.

   To check: send a report from the app. Within a few seconds an issue labelled `feedback` and `untrusted` appears in `ironlog-feedback`, its first line saying the report is untrusted text nobody follows (r66; a screenshot stays in the app's Inbox, r64), and the report's row gets its `issue_url`. If nothing appears, Edge Functions > feedback-to-issue > Logs says why (a 401 means the header and the secret differ).

## Security Advisor (r26)

Supabase > **Advisors** > **Security Advisor** checks the project. Two warnings came up on 2026-10-01:

1. **Function Search Path Mutable** on `public.ping`. A function without a fixed search path could be steered by objects someone creates in another schema. Fix, in SQL Editor > New query, then Run:

```sql
alter function public.ping() set search_path = '';
```

   Then Advisors > Security Advisor > **Refresh**: the warning is gone. The keep-alive still works (`select public.ping();` returns `ok`). The report-limit function in Part 4 is created with a fixed search path already.

2. **Leaked Password Protection Disabled.** Supabase's own check against breached passwords is only on its paid plans (Pro, $25 a month). On the free plan the warning stays. The app does the same check itself since r26: when a password is set, it asks Have I Been Pwned with the first 5 characters of the password's SHA-1 hash, compares the answers on the phone, and refuses a breached password. Also set the server's own minimum to match the app: Authentication > Sign In / Providers > **Email** > Minimum password length `8` > Save.

## Part 5: the preview build's table (added in r24, about 2 minutes)

The preview build (vqx7.github.io/Ironlog/preview/) uses the same project and the same accounts, so you sign in with your usual email and password. It syncs to its own table, so nothing tried in a preview reaches your real log. Until this step is done, the preview works on the phone only and Your data says "Preview sync is not set up yet".

1. Supabase > SQL Editor > New query. Paste this and Run:

```sql
-- The preview build's copy of public.docs: same shape, same rule.
create table public.docs_preview (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null,
  data jsonb not null check (pg_column_size(data) <= 1048576),
  updated_at timestamptz not null default now(),
  primary key (user_id, path)
);
alter table public.docs_preview enable row level security;
create policy "own rows only" on public.docs_preview
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.docs_preview to authenticated;
revoke all on public.docs_preview from anon;
-- The same per-account limit as docs (Part 1's docs_limit, r64).
create or replace trigger docs_preview_limit before insert or update on public.docs_preview for each row execute function public.docs_limit();
```

   To check: sign in on the preview, log a set, then Table Editor > docs_preview shows your rows, and docs is unchanged.

2. Optional: Authentication > URL Configuration > Redirect URLs, add `https://vqx7.github.io/Ironlog/preview/`. Only needed to create a new account or reset a password from inside the preview; signing in to an existing account works without it.

The preview has no Delete my account (it would delete your real account). Deleting an account deletes its preview rows too (`on delete cascade`). To clear preview data only: Table Editor > docs_preview, delete your rows.

## Part 6: a size limit on each synced document (added in r45, 1 minute)

Tables made before r45 have no limit on a document's size, so one account could fill the free plan's 500 MB database. The largest document the app writes is tens of kilobytes. SQL Editor > New query, paste this, Run:

```sql
-- At most 1 MB stored per synced document. "not valid" skips the check on rows already there.
alter table public.docs add constraint docs_data_size check (pg_column_size(data) <= 1048576) not valid;
alter table public.docs_preview add constraint docs_preview_data_size check (pg_column_size(data) <= 1048576) not valid;
```

   To check, run `select conname from pg_constraint where conname like '%data_size';` in a new query: it lists both names. Nothing changes in the app. Since r64 this is part of Part 4's r64 block, which adds it only where it is missing; run that block instead.

## Part 7: checking the rules live, and the sign-up bot check (r66, PENDING 378)

The rules above are what this file asks you to run; this query shows what the live project has, every table in the `public` and `storage` schemas with row level security on or off and every policy on it. Read-only. SQL Editor > New query, paste, Run:

```sql
-- r66: read-only. Every table in the public and storage schemas, whether row level security is on, and every policy on it.
select t.schemaname, t.tablename, t.rowsecurity as rls_on,
       p.policyname, p.cmd, p.roles, p.qual as using_rule, p.with_check
from pg_tables t
left join pg_policies p on p.schemaname = t.schemaname and p.tablename = t.tablename
where t.schemaname in ('public', 'storage')
order by t.schemaname, t.tablename, p.policyname;
```

What the right answer looks like for this project:
- Every row in `public` reads `rls_on` **true**: `docs`, `docs_preview`, `feedback` and `feedback_readers`. A public table with `rls_on` false is readable by anyone with the app's public key: tell Claude at once.
- `docs` and `docs_preview`: one policy each, `own rows only`, cmd `ALL`, roles `{authenticated}`, both rules `(( SELECT auth.uid() AS uid) = user_id)`. Each account reads and writes only its own rows.
- `feedback`: two policies. `signed-in people can add`, cmd `INSERT`, roles `{authenticated}`, with_check `(user_id = ( SELECT auth.uid() AS uid))`: a person adds reports only as themselves. `readers read feedback`, cmd `SELECT`, roles `{authenticated}`, using a rule that the reader is in `feedback_readers`: only you read reports. No UPDATE or DELETE policy: nobody changes or removes a report through the app.
- `feedback_readers`: one policy, `see own reader row`, cmd `SELECT`, roles `{authenticated}`, using `(user_id = ( SELECT auth.uid() AS uid))`. Nobody can add themselves: there is no INSERT policy.
- No other table in `public`. One you do not recognise: tell Claude before changing anything.
- `storage`: Supabase's own tables. `objects` and `buckets` should read `rls_on` true with no policy: that is right today, since no bucket is used, and with row level security on and no policy nothing in storage can be read or written with the app's key. Supabase's other storage tables are its own bookkeeping; the app's key cannot reach them, because the storage schema is not served by the Data API. If `objects` or `buckets` reads false, tell Claude. Pictures in the account (PENDING 373 b) will add policies here, and this check is run again then.

The sign-up bot check: Supabase Auth checks a Cloudflare Turnstile token on sign-up, password sign-in, a reset link and a new confirmation code once **Attack Protection > Enable CAPTCHA protection** is on with Turnstile's secret key. The app sends one only when `TURNSTILE_SITE_KEY` in `src/app/config.ts` is set (`src/app/captcha.ts`), so the app gets its key first and Supabase is switched on second (OWNER.md, E1).

## Part 8: one row per record (added in 2.78, about 3 minutes)

Until 2.78 the account held the log as documents: one per half-month of sessions, one per year of weigh-ins, one for the rest. Every sync bug of 2.72 to 2.77 that lost or doubled a record came from a record changing documents, or from a delete being read from a record's absence. From 2.78 the account also holds one row per record. In 2.78 the documents still decide what the log is: the app writes the rows beside them and checks that both say the same (Settings > "More" shows a line that starts "Rows check", under "Version"). A later release switches each account to the rows, only once its checks are clean.

Nothing here changes `docs` or `docs_preview`, and the app does nothing with the new tables until they exist.

1. The preview's table first. Supabase > SQL Editor > New query. Paste this and Run:

```sql
-- The preview build's copy of public.records: the same text under the preview's names, so nothing tried in a
-- preview reaches the real rows (2.78).
create table public.records_preview (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 24),
  id text not null check (char_length(id) between 1 and 120),
  body text check (body is null or octet_length(body) <= 1048576),
  sum text generated always as (md5(body)) stored,
  t bigint not null default 0 check (t >= 0),
  dev text collate "C" not null default '' check (dev ~ '^[ -~]{0,64}$'),
  a bigint not null default 0 check (a >= 0),
  gone_saw bigint,
  gone_saw_dev text collate "C" check (gone_saw_dev ~ '^[ -~]{0,64}$'),
  gone_good boolean not null default false,
  gone_t bigint not null default 0,
  gone_dev text collate "C" not null default '' check (gone_dev ~ '^[ -~]{0,64}$'),
  gone_day text check (gone_day is null or char_length(gone_day) <= 10),
  gone_clash boolean not null default false,
  over_t bigint,
  over_dev text collate "C",
  seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id),
  check ((gone_saw is null) = (gone_saw_dev is null))
);
create unique index records_preview_seq on public.records_preview (user_id, seq);
alter table public.records_preview enable row level security;
create policy "own rows only" on public.records_preview for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.records_preview from anon, authenticated;
grant select, insert, update on public.records_preview to authenticated;

create or replace function public.records_preview_join() returns trigger language plpgsql set search_path = '' as $$
declare cur public.records_preview%rowtype; has boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('records_preview ' || new.user_id::text, 0));
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'rows_isolation' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id or new.kind <> old.kind or new.id <> old.id then
      raise exception 'rows_key' using errcode = 'P0001';
    end if;
    cur := old; has := true;
  else
    select * into cur from public.records_preview r where r.user_id = new.user_id and r.kind = new.kind and r.id = new.id;
    has := found;
  end if;
  if has then
    if new.kind = 'draft' and not (new.t = cur.t and new.dev = cur.dev) then
      if new.over_t is distinct from cur.t or new.over_dev is distinct from cur.dev then
        raise exception 'rows_draft_stale' using errcode = 'P0001';
      end if;
      if not ((new.t, new.dev) > (cur.t, cur.dev)) then
        raise exception 'rows_draft_time' using errcode = 'P0001';
      end if;
    end if;
    if (new.t, new.dev, new.a) > (cur.t, cur.dev, cur.a) then null;
    elsif (new.t, new.dev, new.a) = (cur.t, cur.dev, cur.a)
      and (cur.body is null or (new.body is not null and new.body collate "C" > cur.body collate "C")) then null;
    else new.body := cur.body; new.t := cur.t; new.dev := cur.dev; new.a := cur.a; new.over_t := cur.over_t; new.over_dev := cur.over_dev;
    end if;
    if not ((coalesce(new.gone_saw, -1), coalesce(new.gone_saw_dev, ''), new.gone_good, new.gone_t, new.gone_dev)
          > (coalesce(cur.gone_saw, -1), coalesce(cur.gone_saw_dev, ''), cur.gone_good, cur.gone_t, cur.gone_dev)) then
      new.gone_saw := cur.gone_saw; new.gone_saw_dev := cur.gone_saw_dev; new.gone_good := cur.gone_good;
      new.gone_t := cur.gone_t; new.gone_dev := cur.gone_dev; new.gone_day := cur.gone_day; new.gone_clash := cur.gone_clash;
    end if;
  end if;
  if new.gone_good and new.gone_saw is not distinct from new.t and new.gone_saw_dev is not distinct from new.dev then new.body := null; end if;
  if has and new.body is not distinct from cur.body and new.t = cur.t and new.dev = cur.dev and new.a = cur.a
     and new.gone_saw is not distinct from cur.gone_saw and new.gone_saw_dev is not distinct from cur.gone_saw_dev
     and new.gone_good = cur.gone_good and new.gone_t = cur.gone_t and new.gone_dev = cur.gone_dev
     and new.gone_day is not distinct from cur.gone_day and new.gone_clash = cur.gone_clash then
    return null;
  end if;
  new.seq := (select coalesce(max(r.seq), 0) + 1 from public.records_preview r where r.user_id = new.user_id);
  new.updated_at := now();
  return new;
end $$;
create trigger records_preview_join before insert or update on public.records_preview for each row execute function public.records_preview_join();

create or replace function public.records_preview_push(p jsonb, only_if_top bigint default null) returns jsonb
language plpgsql set search_path = '' as $$
declare uid uuid := (select auth.uid()); res jsonb;
begin
  if uid is null then raise exception 'rows_signed_out' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('records_preview ' || uid::text, 0));
  if only_if_top is not null
     and only_if_top <> (select coalesce(max(r.seq), 0) from public.records_preview r where r.user_id = uid) then
    raise exception 'rows_moved' using errcode = 'P0001';
  end if;
  with x as (
    select * from jsonb_to_recordset(p) as x(kind text, id text, body text, t bigint, dev text, a bigint,
      gone_saw bigint, gone_saw_dev text, gone_good boolean, gone_t bigint, gone_dev text, gone_day text, gone_clash boolean,
      over_t bigint, over_dev text)
  ), was as (
    select r.* from public.records_preview r join x on x.kind = r.kind and x.id = r.id where r.user_id = uid
  ), up as (
    insert into public.records_preview (kind, id, body, t, dev, a, gone_saw, gone_saw_dev, gone_good, gone_t, gone_dev, gone_day, gone_clash, over_t, over_dev)
    select x.kind, x.id, x.body, coalesce(x.t, 0), coalesce(x.dev, ''), coalesce(x.a, 0), x.gone_saw, x.gone_saw_dev,
           coalesce(x.gone_good, false), coalesce(x.gone_t, 0), coalesce(x.gone_dev, ''), x.gone_day, coalesce(x.gone_clash, false), x.over_t, x.over_dev
    from x
    on conflict (user_id, kind, id) do update set body = excluded.body, t = excluded.t, dev = excluded.dev, a = excluded.a,
      gone_saw = excluded.gone_saw, gone_saw_dev = excluded.gone_saw_dev, gone_good = excluded.gone_good, gone_t = excluded.gone_t,
      gone_dev = excluded.gone_dev, gone_day = excluded.gone_day, gone_clash = excluded.gone_clash, over_t = excluded.over_t, over_dev = excluded.over_dev
    returning *
  )
  select jsonb_agg(jsonb_build_object(
      'kind', x.kind, 'id', x.id,
      't', coalesce(up.t, was.t), 'dev', coalesce(up.dev, was.dev), 'a', coalesce(up.a, was.a),
      'sum', case when up.kind is not null then up.sum else was.sum end,
      'gone_saw', case when up.kind is not null then up.gone_saw else was.gone_saw end,
      'gone_saw_dev', case when up.kind is not null then up.gone_saw_dev else was.gone_saw_dev end,
      'gone_good', coalesce(up.gone_good, was.gone_good), 'gone_t', coalesce(up.gone_t, was.gone_t),
      'gone_dev', coalesce(up.gone_dev, was.gone_dev),
      'gone_day', case when up.kind is not null then up.gone_day else was.gone_day end,
      'gone_clash', coalesce(up.gone_clash, was.gone_clash),
      'seq', coalesce(up.seq, was.seq),
      'took', up.kind is not null,
      'was_t', was.t, 'was_dev', was.dev, 'was_a', was.a, 'was_sum', was.sum, 'was_live',
        was.kind is not null and was.body is not null and not (was.gone_saw is not distinct from was.t and was.gone_saw_dev is not distinct from was.dev)
    )
    || case when (case when up.kind is not null then up.body else was.body end) is distinct from x.body
            then jsonb_build_object('body', case when up.kind is not null then up.body else was.body end) else '{}'::jsonb end
    || case when up.kind is not null and was.kind is not null and was.body is distinct from up.body
              and (was.t is distinct from x.over_t or was.dev is distinct from x.over_dev)
            then jsonb_build_object('was_body', was.body) else '{}'::jsonb end)
  into res
  from x left join up on up.kind = x.kind and up.id = x.id left join was on was.kind = x.kind and was.id = x.id;
  return jsonb_build_object(
    'top', (select coalesce(max(r.seq), 0) from public.records_preview r where r.user_id = uid),
    'layout', (select r.body from public.records_preview r where r.user_id = uid and r.kind = 'meta' and r.id = 'layout'),
    'rows', coalesce(res, '[]'::jsonb));
end $$;
revoke all on function public.records_preview_push(jsonb, bigint) from public, anon;
grant execute on function public.records_preview_push(jsonb, bigint) to authenticated;

create or replace function public.records_preview_pull(since bigint, most int default 500) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'top', (select coalesce(max(r.seq), 0) from public.records_preview r where r.user_id = (select auth.uid())),
    'layout', (select r.body from public.records_preview r where r.user_id = (select auth.uid()) and r.kind = 'meta' and r.id = 'layout'),
    'rows', coalesce((select jsonb_agg(to_jsonb(q) order by q.seq) from (
      select r.kind, r.id, r.body, r.sum, r.t, r.dev, r.a, r.gone_saw, r.gone_saw_dev, r.gone_good, r.gone_t, r.gone_dev, r.gone_day, r.gone_clash, r.seq
      from public.records_preview r where r.user_id = (select auth.uid()) and r.seq > since order by r.seq limit most) q), '[]'::jsonb));
$$;
revoke all on function public.records_preview_pull(bigint, int) from public, anon;
grant execute on function public.records_preview_pull(bigint, int) to authenticated;

create or replace function public.records_preview_limit() returns trigger language plpgsql set search_path = '' as $$
declare u uuid; n bigint; b bigint;
begin
  for u in select distinct w.user_id from written w loop
    select count(*), coalesce(sum(octet_length(r.body)), 0) into n, b from public.records_preview r where r.user_id = u;
    if n > 20000 or b > 26214400 then raise exception 'rows_limit' using errcode = 'P0001'; end if;
  end loop;
  return null;
end $$;
create trigger records_preview_limit_i after insert on public.records_preview referencing new table as written for each statement execute function public.records_preview_limit();
create trigger records_preview_limit_u after update on public.records_preview referencing new table as written for each statement execute function public.records_preview_limit();

create or replace function public.records_preview_digest() returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('n', count(*), 'top', coalesce(max(r.seq), 0),
    'sum', md5(coalesce(string_agg(
      r.kind || chr(31) || r.id || chr(31) || r.t || chr(31) || r.dev || chr(31) || r.a || chr(31) || left(coalesce(r.sum, ''), 12) || chr(31)
        || coalesce(r.gone_saw::text, '') || chr(31) || coalesce(r.gone_saw_dev, '') || chr(31) || (r.gone_good::int),
      chr(30) order by r.kind collate "C", r.id collate "C"), '')))
  from public.records_preview r where r.user_id = (select auth.uid());
$$;
revoke all on function public.records_preview_digest() from public, anon;
grant execute on function public.records_preview_digest() to authenticated;
```

   To check: `select public.records_preview_digest();` in a new query answers `{"n": 0, "sum": "d41d8cd98f00b204e9800998ecf8427e", "top": 0}`: no rows, because the SQL editor is not signed in as an app account, which is right. Then open the preview signed in and use it for a few minutes: Table Editor > records_preview shows your rows, and in the preview Settings > "More" shows a line that starts "Rows check" under "Version".

2. The live app's table. New query, paste this and Run:

```sql
-- One row per record of the log (2.78): a session, a weigh-in, a routine, each setting. A deleted record keeps its
-- row, marked. The trigger joins every write itself: the later edit of the copy, the mark that names the later copy,
-- and it numbers each change (seq) so a phone reads only what changed since it last looked.
create table public.records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (char_length(kind) between 1 and 24),
  id text not null check (char_length(id) between 1 and 120),
  body text check (body is null or octet_length(body) <= 1048576),
  sum text generated always as (md5(body)) stored,
  t bigint not null default 0 check (t >= 0),
  dev text collate "C" not null default '' check (dev ~ '^[ -~]{0,64}$'),
  a bigint not null default 0 check (a >= 0),
  gone_saw bigint,
  gone_saw_dev text collate "C" check (gone_saw_dev ~ '^[ -~]{0,64}$'),
  gone_good boolean not null default false,
  gone_t bigint not null default 0,
  gone_dev text collate "C" not null default '' check (gone_dev ~ '^[ -~]{0,64}$'),
  gone_day text check (gone_day is null or char_length(gone_day) <= 10),
  gone_clash boolean not null default false,
  over_t bigint,
  over_dev text collate "C",
  seq bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id),
  check ((gone_saw is null) = (gone_saw_dev is null))
);
create unique index records_seq on public.records (user_id, seq);
alter table public.records enable row level security;
create policy "own rows only" on public.records for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.records from anon, authenticated;
grant select, insert, update on public.records to authenticated;

create or replace function public.records_join() returns trigger language plpgsql set search_path = '' as $$
declare cur public.records%rowtype; has boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended('records ' || new.user_id::text, 0));
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'rows_isolation' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id or new.kind <> old.kind or new.id <> old.id then
      raise exception 'rows_key' using errcode = 'P0001';
    end if;
    cur := old; has := true;
  else
    select * into cur from public.records r where r.user_id = new.user_id and r.kind = new.kind and r.id = new.id;
    has := found;
  end if;
  if has then
    if new.kind = 'draft' and not (new.t = cur.t and new.dev = cur.dev) then
      if new.over_t is distinct from cur.t or new.over_dev is distinct from cur.dev then
        raise exception 'rows_draft_stale' using errcode = 'P0001';
      end if;
      if not ((new.t, new.dev) > (cur.t, cur.dev)) then
        raise exception 'rows_draft_time' using errcode = 'P0001';
      end if;
    end if;
    if (new.t, new.dev, new.a) > (cur.t, cur.dev, cur.a) then null;
    elsif (new.t, new.dev, new.a) = (cur.t, cur.dev, cur.a)
      and (cur.body is null or (new.body is not null and new.body collate "C" > cur.body collate "C")) then null;
    else new.body := cur.body; new.t := cur.t; new.dev := cur.dev; new.a := cur.a; new.over_t := cur.over_t; new.over_dev := cur.over_dev;
    end if;
    if not ((coalesce(new.gone_saw, -1), coalesce(new.gone_saw_dev, ''), new.gone_good, new.gone_t, new.gone_dev)
          > (coalesce(cur.gone_saw, -1), coalesce(cur.gone_saw_dev, ''), cur.gone_good, cur.gone_t, cur.gone_dev)) then
      new.gone_saw := cur.gone_saw; new.gone_saw_dev := cur.gone_saw_dev; new.gone_good := cur.gone_good;
      new.gone_t := cur.gone_t; new.gone_dev := cur.gone_dev; new.gone_day := cur.gone_day; new.gone_clash := cur.gone_clash;
    end if;
  end if;
  if new.gone_good and new.gone_saw is not distinct from new.t and new.gone_saw_dev is not distinct from new.dev then new.body := null; end if;
  if has and new.body is not distinct from cur.body and new.t = cur.t and new.dev = cur.dev and new.a = cur.a
     and new.gone_saw is not distinct from cur.gone_saw and new.gone_saw_dev is not distinct from cur.gone_saw_dev
     and new.gone_good = cur.gone_good and new.gone_t = cur.gone_t and new.gone_dev = cur.gone_dev
     and new.gone_day is not distinct from cur.gone_day and new.gone_clash = cur.gone_clash then
    return null;
  end if;
  new.seq := (select coalesce(max(r.seq), 0) + 1 from public.records r where r.user_id = new.user_id);
  new.updated_at := now();
  return new;
end $$;
create trigger records_join before insert or update on public.records for each row execute function public.records_join();

create or replace function public.records_push(p jsonb, only_if_top bigint default null) returns jsonb
language plpgsql set search_path = '' as $$
declare uid uuid := (select auth.uid()); res jsonb;
begin
  if uid is null then raise exception 'rows_signed_out' using errcode = 'P0001'; end if;
  perform pg_advisory_xact_lock(hashtextextended('records ' || uid::text, 0));
  if only_if_top is not null
     and only_if_top <> (select coalesce(max(r.seq), 0) from public.records r where r.user_id = uid) then
    raise exception 'rows_moved' using errcode = 'P0001';
  end if;
  with x as (
    select * from jsonb_to_recordset(p) as x(kind text, id text, body text, t bigint, dev text, a bigint,
      gone_saw bigint, gone_saw_dev text, gone_good boolean, gone_t bigint, gone_dev text, gone_day text, gone_clash boolean,
      over_t bigint, over_dev text)
  ), was as (
    select r.* from public.records r join x on x.kind = r.kind and x.id = r.id where r.user_id = uid
  ), up as (
    insert into public.records (kind, id, body, t, dev, a, gone_saw, gone_saw_dev, gone_good, gone_t, gone_dev, gone_day, gone_clash, over_t, over_dev)
    select x.kind, x.id, x.body, coalesce(x.t, 0), coalesce(x.dev, ''), coalesce(x.a, 0), x.gone_saw, x.gone_saw_dev,
           coalesce(x.gone_good, false), coalesce(x.gone_t, 0), coalesce(x.gone_dev, ''), x.gone_day, coalesce(x.gone_clash, false), x.over_t, x.over_dev
    from x
    on conflict (user_id, kind, id) do update set body = excluded.body, t = excluded.t, dev = excluded.dev, a = excluded.a,
      gone_saw = excluded.gone_saw, gone_saw_dev = excluded.gone_saw_dev, gone_good = excluded.gone_good, gone_t = excluded.gone_t,
      gone_dev = excluded.gone_dev, gone_day = excluded.gone_day, gone_clash = excluded.gone_clash, over_t = excluded.over_t, over_dev = excluded.over_dev
    returning *
  )
  select jsonb_agg(jsonb_build_object(
      'kind', x.kind, 'id', x.id,
      't', coalesce(up.t, was.t), 'dev', coalesce(up.dev, was.dev), 'a', coalesce(up.a, was.a),
      'sum', case when up.kind is not null then up.sum else was.sum end,
      'gone_saw', case when up.kind is not null then up.gone_saw else was.gone_saw end,
      'gone_saw_dev', case when up.kind is not null then up.gone_saw_dev else was.gone_saw_dev end,
      'gone_good', coalesce(up.gone_good, was.gone_good), 'gone_t', coalesce(up.gone_t, was.gone_t),
      'gone_dev', coalesce(up.gone_dev, was.gone_dev),
      'gone_day', case when up.kind is not null then up.gone_day else was.gone_day end,
      'gone_clash', coalesce(up.gone_clash, was.gone_clash),
      'seq', coalesce(up.seq, was.seq),
      'took', up.kind is not null,
      'was_t', was.t, 'was_dev', was.dev, 'was_a', was.a, 'was_sum', was.sum, 'was_live',
        was.kind is not null and was.body is not null and not (was.gone_saw is not distinct from was.t and was.gone_saw_dev is not distinct from was.dev)
    )
    || case when (case when up.kind is not null then up.body else was.body end) is distinct from x.body
            then jsonb_build_object('body', case when up.kind is not null then up.body else was.body end) else '{}'::jsonb end
    || case when up.kind is not null and was.kind is not null and was.body is distinct from up.body
              and (was.t is distinct from x.over_t or was.dev is distinct from x.over_dev)
            then jsonb_build_object('was_body', was.body) else '{}'::jsonb end)
  into res
  from x left join up on up.kind = x.kind and up.id = x.id left join was on was.kind = x.kind and was.id = x.id;
  return jsonb_build_object(
    'top', (select coalesce(max(r.seq), 0) from public.records r where r.user_id = uid),
    'layout', (select r.body from public.records r where r.user_id = uid and r.kind = 'meta' and r.id = 'layout'),
    'rows', coalesce(res, '[]'::jsonb));
end $$;
revoke all on function public.records_push(jsonb, bigint) from public, anon;
grant execute on function public.records_push(jsonb, bigint) to authenticated;

create or replace function public.records_pull(since bigint, most int default 500) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'top', (select coalesce(max(r.seq), 0) from public.records r where r.user_id = (select auth.uid())),
    'layout', (select r.body from public.records r where r.user_id = (select auth.uid()) and r.kind = 'meta' and r.id = 'layout'),
    'rows', coalesce((select jsonb_agg(to_jsonb(q) order by q.seq) from (
      select r.kind, r.id, r.body, r.sum, r.t, r.dev, r.a, r.gone_saw, r.gone_saw_dev, r.gone_good, r.gone_t, r.gone_dev, r.gone_day, r.gone_clash, r.seq
      from public.records r where r.user_id = (select auth.uid()) and r.seq > since order by r.seq limit most) q), '[]'::jsonb));
$$;
revoke all on function public.records_pull(bigint, int) from public, anon;
grant execute on function public.records_pull(bigint, int) to authenticated;

create or replace function public.records_limit() returns trigger language plpgsql set search_path = '' as $$
declare u uuid; n bigint; b bigint;
begin
  for u in select distinct w.user_id from written w loop
    select count(*), coalesce(sum(octet_length(r.body)), 0) into n, b from public.records r where r.user_id = u;
    if n > 20000 or b > 26214400 then raise exception 'rows_limit' using errcode = 'P0001'; end if;
  end loop;
  return null;
end $$;
create trigger records_limit_i after insert on public.records referencing new table as written for each statement execute function public.records_limit();
create trigger records_limit_u after update on public.records referencing new table as written for each statement execute function public.records_limit();

create or replace function public.records_digest() returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object('n', count(*), 'top', coalesce(max(r.seq), 0),
    'sum', md5(coalesce(string_agg(
      r.kind || chr(31) || r.id || chr(31) || r.t || chr(31) || r.dev || chr(31) || r.a || chr(31) || left(coalesce(r.sum, ''), 12) || chr(31)
        || coalesce(r.gone_saw::text, '') || chr(31) || coalesce(r.gone_saw_dev, '') || chr(31) || (r.gone_good::int),
      chr(30) order by r.kind collate "C", r.id collate "C"), '')))
  from public.records r where r.user_id = (select auth.uid());
$$;
revoke all on function public.records_digest() from public, anon;
grant execute on function public.records_digest() to authenticated;
```

   Nothing reads or writes it until 2.78 is merged.

3. One line for the tests: New query, `select version();`, Run, and send the line it answers (the tests then run on the same Postgres).

What each part does:
- **The table.** `kind` and `id` name the record; `body` is the record as the phone saves it; `sum` is the database's own checksum of it, which a phone cannot set; `t`, `dev` and `a` are the copy's version (when the lifter last edited it, on which phone, and how many times the app itself has written it since); the `gone_` columns are the deletion mark, which names the copy it deleted; `seq` numbers every change of the account.
- **The row rule.** The same as `docs`: each account reads and writes only its own rows; nothing for signed-out visitors. A phone can add and change rows, never delete one: a deleted row would be a deletion mark removed.
- **The trigger** (`records_join`). Every write goes through it, whoever makes it. It keeps the later edit of the copy and the mark that names the later copy, so the same writes in any order end as the same row, and it refuses an older edit over a newer one. Writes to one account are applied one at a time (the same lock `docs_limit` uses), so `seq` rises in the order they are saved.
- **The calls.** `records_push` writes a set of rows in one step and answers with what the account then holds; `records_pull` answers with the rows changed since a number; `records_digest` answers with one checksum of the whole account, for the daily check. Each runs with the caller's own rights.
- **The limits.** 1 MB a row; 20,000 rows and 25 MB an account.

Deleting an account deletes its rows in both tables (`on delete cascade`). To clear the preview's rows only: SQL Editor, `delete from public.records_preview where user_id = auth.uid();` does nothing there (the editor is no app account); use Table Editor > records_preview and delete your rows.

## Who can see the data

- Other users: never. The rule in step 6 is enforced by the database for every request.
- You, as project owner: yes. The dashboard's Table Editor shows every row, friends' included. The privacy line in the app must say so.
- Feedback: only accounts in `feedback_readers` (you) and the dashboard. The privacy line says feedback goes to the app owner.
- Supabase: stores it, encrypted on disk, like any host.

## Encryption (optional, later)

End-to-end encryption means the phone encrypts the log before upload, so neither you nor Supabase can read it. It is free (the browser's built-in Web Crypto, AES-GCM with a key derived from a passphrase) and about one build session. The cost: each person keeps a separate encryption passphrase, typed once per new device, and a forgotten passphrase makes the cloud copy unreadable forever; nobody can recover it. Recommendation: launch without it, and offer it as an opt-in setting before friends join if they care that you can see their logs.

Sources: supabase.com/pricing, supabase.com/docs/guides/auth/auth-smtp, resend.com/docs/knowledge-base/account-quotas-and-limits (checked 2026-09-27).
