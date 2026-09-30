# Supabase setup for Ironlog accounts and sync

What V does in the Supabase dashboard, once. The app code (sign-in screen, sync adapter, tests, keep-alive) is build work tracked in `PENDING.md` 12 to 17. All of this is free on the Supabase Free plan: 2 active projects, 500 MB database, 50,000 monthly active users. Ironlog uses a few MB per person per year.

## Part 1: for V alone (free, about 15 minutes)

1. **Account.** Go to supabase.com, Start your project, sign in with GitHub.
2. **Project.** New project. Name `ironlog`. Region: West US (North California). Generate a database password and save it in your password manager (the app never uses it). Plan: Free. Wait about 2 minutes while it starts.
3. **Keys.** Project Settings > API Keys. Copy the **Project URL** and the **publishable key** (older projects call it `anon`). Both are safe to put in the app: they identify the project, and the table rules below decide what each signed-in person can read. Never copy the **secret key** (older name `service_role`) anywhere.
4. **Email sign-in.** Authentication > Sign In / Providers > Email: enabled (the default). Leave "Confirm email" on.
5. **Links in emails.** Authentication > URL Configuration. Site URL: `https://vqx7.github.io/Ironlog/`. Add the same address under Redirect URLs. Confirmation and password-reset emails send people back here.
6. **The table and its privacy rule.** SQL Editor > New query, paste this, Run:

```sql
-- One row per Ironlog document (core, draft, session chunks) per person.
create table public.docs (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null,
  data jsonb not null,
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
create or replace function public.ping() returns text language sql stable as $$ select 'ok' $$;
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
  screenshot text check (screenshot is null or (screenshot like 'data:image/jpeg;base64,%' and char_length(screenshot) <= 1500000)),
  context jsonb not null default '{}'::jsonb check (pg_column_size(context) <= 20000),
  issue_url text
);
alter table public.feedback enable row level security;
create policy "signed-in people can add" on public.feedback
  for insert to authenticated
  with check (user_id = (select auth.uid()));
-- At most 5 reports a day per account, whatever the app does.
create function public.feedback_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger feedback_limit before insert on public.feedback for each row execute function public.feedback_limit();
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
create or replace function public.feedback_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then
    raise exception 'feedback_rate_limited' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger feedback_limit before insert on public.feedback for each row execute function public.feedback_limit();
```

Steps 2 to 5 turn each report into a GitHub issue, which is what lets Claude pick it up (`FEEDBACK.md`). They can wait.

2. **A private repository for tickets.** GitHub > New repository, name `ironlog-feedback`, **Private**, tick "Add a README". Reports quote what people wrote and may show their screen, so they must not go into the public Ironlog repository.
3. **A GitHub token for it.** GitHub > Settings > Developer settings > Fine-grained tokens > Generate new token. Repository access: Only select repositories > `ironlog-feedback`. Permissions: Issues read and write, Contents read and write. Nothing else. Expiry: a year. Copy it.
4. **The function.** Supabase > Edge Functions > Deploy a new function > Via editor. Name it exactly `feedback-to-issue`, paste everything in `supabase/functions/feedback-to-issue/index.ts`, turn **Verify JWT off**, Deploy. Then Edge Functions > Secrets, add:
   - `GITHUB_TOKEN`: the token from step 3.
   - `TICKETS_REPO`: `vqx7/ironlog-feedback`.
   - `WEBHOOK_SECRET`: a long random string (a password manager can make one). Keep it for step 5.
5. **The trigger.** Database > Webhooks > Create a new hook. Name `feedback-to-issue`, table `feedback`, events **Insert** only, type **Supabase Edge Functions**, function `feedback-to-issue`, method POST. Under HTTP Headers add `x-webhook-secret` with the same random string. Create.

   To check: send a report from the app. Within a few seconds an issue labelled `feedback` appears in `ironlog-feedback`, with any screenshot saved under `shots/`, and the report's row gets its `issue_url`. If nothing appears, Edge Functions > feedback-to-issue > Logs says why (a 401 means the header and the secret differ).

## Part 5: the preview build's table (added in r24, about 2 minutes)

The preview build (vqx7.github.io/Ironlog/preview/) uses the same project and the same accounts, so you sign in with your usual email and password. It syncs to its own table, so nothing tried in a preview reaches your real log. Until this step is done, the preview works on the phone only and Your data says "Preview sync is not set up yet".

1. Supabase > SQL Editor > New query. Paste this and Run:

```sql
-- The preview build's copy of public.docs: same shape, same rule.
create table public.docs_preview (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  path text not null,
  data jsonb not null,
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
```

   To check: sign in on the preview, log a set, then Table Editor > docs_preview shows your rows, and docs is unchanged.

2. Optional: Authentication > URL Configuration > Redirect URLs, add `https://vqx7.github.io/Ironlog/preview/`. Only needed to create a new account or reset a password from inside the preview; signing in to an existing account works without it.

The preview has no Delete my account (it would delete your real account). Deleting an account deletes its preview rows too (`on delete cascade`). To clear preview data only: Table Editor > docs_preview, delete your rows.

## Who can see the data

- Other users: never. The rule in step 6 is enforced by the database for every request.
- You, as project owner: yes. The dashboard's Table Editor shows every row, friends' included. The privacy line in the app must say so.
- Feedback: only accounts in `feedback_readers` (you) and the dashboard. The privacy line says feedback goes to the app owner.
- Supabase: stores it, encrypted on disk, like any host.

## Encryption (optional, later)

End-to-end encryption means the phone encrypts the log before upload, so neither you nor Supabase can read it. It is free (the browser's built-in Web Crypto, AES-GCM with a key derived from a passphrase) and about one build session. The cost: each person keeps a separate encryption passphrase, typed once per new device, and a forgotten passphrase makes the cloud copy unreadable forever; nobody can recover it. Recommendation: launch without it, and offer it as an opt-in setting before friends join if they care that you can see their logs.

Sources: supabase.com/pricing, supabase.com/docs/guides/auth/auth-smtp, resend.com/docs/knowledge-base/account-quotas-and-limits (checked 2026-09-27).
