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
2. **Sender.** resend.com, free plan (100 emails a day, 3,000 a month). Add the domain, then add the DNS records it lists at your registrar. Wait until it shows Verified. Create an API key.
3. **Connect it.** Supabase: Authentication > Emails > SMTP Settings > Enable custom SMTP. Host `smtp.resend.com`, port `465`, username `resend`, password the Resend API key, sender `no-reply@yourdomain.com`, sender name `Ironlog`.
4. **Rate limit.** Authentication > Rate Limits: raise the email limit (30 an hour is plenty).

## What the app does (built in r17)

- Settings > Your data: Create account or Sign in, with email and password, and Forgot password. Accounts are optional; without one the app works on the phone as before.
- Sign-up sends a confirmation email. The link opens in the browser (on an iPhone, Safari, which keeps its own storage apart from the home-screen app), says it worked, and signs that browser out again so it never uploads whatever it holds. You then sign in inside the app.
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

Until this is done, Delete my account says it is not set up yet and deletes nothing. When it runs, the account and every synced row go (the table's `on delete cascade`); the copy on the phone stays.

**Keep-alive.** Free projects pause after a week without activity. Run this once in the SQL Editor:

```sql
-- A harmless call that touches the database and returns "ok". Reads nothing.
create or replace function public.ping() returns text language sql stable as $$ select 'ok' $$;
grant execute on function public.ping() to anon;
```

The GitHub Action in `.github/workflows/keepalive.yml` calls it once a day. GitHub pauses scheduled Actions in a repository with no commits for 60 days; if that happens, Actions > Keep Supabase awake > Enable workflow turns it back on. A paused project loses nothing and can be restored from the dashboard, but the app cannot sync until then.

## Who can see the data

- Other users: never. The rule in step 6 is enforced by the database for every request.
- You, as project owner: yes. The dashboard's Table Editor shows every row, friends' included. The privacy line in the app must say so.
- Supabase: stores it, encrypted on disk, like any host.

## Encryption (optional, later)

End-to-end encryption means the phone encrypts the log before upload, so neither you nor Supabase can read it. It is free (the browser's built-in Web Crypto, AES-GCM with a key derived from a passphrase) and about one build session. The cost: each person keeps a separate encryption passphrase, typed once per new device, and a forgotten passphrase makes the cloud copy unreadable forever; nobody can recover it. Recommendation: launch without it, and offer it as an opt-in setting before friends join if they care that you can see their logs.

Sources: supabase.com/pricing, supabase.com/docs/guides/auth/auth-smtp, resend.com/docs/knowledge-base/account-quotas-and-limits (checked 2026-09-27).
