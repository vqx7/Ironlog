// The SQL V pastes into Supabase (SUPABASE.md, and so OWNER.md) runs on a
// real Postgres engine (PGlite) with a stand-in for Supabase's auth schema
// and roles, and does what the docs say: own rows only, nothing for signed-out
// visitors, report length limits, 5 reports a day per account, the owner
// reads them, and the upgrade from the pre-r25 report table.
const fs = require('fs');
const fails = [];
(async () => {
const { PGlite } = await import('@electric-sql/pglite');
const sup = fs.readFileSync(require('path').join(__dirname, '..', 'SUPABASE.md'), 'utf8');
const blocks = [...sup.matchAll(/```sql\n([\s\S]*?)```/g)].map(m => m[1]);
const pick = n => blocks.find(b => b.includes(n));
const stub = `
create role anon nologin; create role authenticated nologin;
create schema auth; grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
insert into auth.users values ('11111111-1111-1111-1111-111111111111','v@example.com'),('22222222-2222-2222-2222-222222222222','f@example.com');`;
const ok = (c, m) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m); };
async function run(db, sql, label) { try { await db.exec(sql); ok(true, label); } catch (e) { ok(false, label + ': ' + e.message); } }
async function as(db, uid) { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`); await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`); }
async function tryq(db, sql) { try { await db.exec(sql); return 'ok'; } catch (e) { return e.message; } }
const V = '11111111-1111-1111-1111-111111111111', F = '22222222-2222-2222-2222-222222222222';
{
  const db = new PGlite(); await db.exec(stub);
  await run(db, pick('create table public.docs ('), 'Part 1 docs table runs');
  await run(db, pick('create table public.docs_preview'), 'Part 5 docs_preview runs (A2)');
  await run(db, pick('create table public.feedback (').replace('YOUR IRONLOG ACCOUNT EMAIL','v@example.com'), 'Part 4 report tables run (B1), with your email filled in');
  await run(db, pick('create or replace function public.ping()'), 'keep-alive ping runs');
  await as(db, V);
  ok(await tryq(db, `insert into public.docs_preview(path,data) values ('data/users/x/core','{}')`) === 'ok', 'signed in: can write own preview row');
  await as(db, F);
  const r = await db.query(`select count(*)::int n from public.docs_preview`); ok(r.rows[0].n === 0, 'another account sees none of those rows');
  ok(/row-level security|violates/i.test(await tryq(db, `insert into public.docs_preview(user_id,path,data) values ('${V}','p','{}')`)), 'cannot write a row for someone else');
  await as(db, null);
  ok(/permission denied/i.test(await tryq(db, `select * from public.docs_preview`)), 'signed out: no access to docs_preview');
  ok(/permission denied|row-level/i.test(await tryq(db, `insert into public.feedback(category,message) values ('bug','signed out spam text')`)), 'signed out: a report is refused');
  await as(db, V);
  ok(/check/i.test(await tryq(db, `insert into public.feedback(category,message) values ('bug','short')`)), 'a report under 10 characters is refused');
  ok(/check/i.test(await tryq(db, `insert into public.feedback(category,message) values ('bug','${'x'.repeat(1001)}')`)), 'a report over 1,000 characters is refused');
  let n = 0; for (let i = 0; i < 5; i++) if (await tryq(db, `insert into public.feedback(category,message) values ('bug','report number ${i} here')`) === 'ok') n++;
  ok(n === 5, 'five reports in a day are accepted (' + n + ')');
  ok(/feedback_rate_limited/.test(await tryq(db, `insert into public.feedback(category,message) values ('bug','the sixth report today')`)), 'the sixth is refused with feedback_rate_limited');
  await as(db, F);
  ok(await tryq(db, `insert into public.feedback(category,message) values ('idea','another account is separate')`) === 'ok', 'another account has its own five');
  ok((await db.query(`select count(*)::int n from public.feedback`)).rows[0].n === 0, 'a non-reader reads no reports');
  await as(db, V);
  ok((await db.query(`select count(*)::int n from public.feedback`)).rows[0].n === 6, 'the owner (in feedback_readers) reads every report');
  // r29 review: what a sender cannot set. A back-dated report still counts
  // today, a made-up ticket link is dropped, and the screenshot must be a
  // plain base64 JPEG from start to end.
  await db.exec('reset role'); await db.exec(`delete from public.feedback`);
  await as(db, F);
  let back = 0; for (let i = 0; i < 6; i++) if (await tryq(db, `insert into public.feedback(category,message,created_at) values ('bug','back-dated report ${i}','2001-01-01')`) === 'ok') back++;
  ok(back === 5, 'back-dated reports still count toward today: the sixth is refused (' + back + ' of 6 went in)');
  await as(db, V);
  ok(await tryq(db, `insert into public.feedback(category,message,issue_url,screenshot) values ('bug','with a made-up link','https://github.com/x/y','data:image/jpeg;base64,/9j/4AAQSkZJRg==')`) === 'ok', 'a report with a plain JPEG screenshot is accepted');
  ok(/check/i.test(await tryq(db, `insert into public.feedback(category,message,screenshot) values ('bug','hostile screenshot here','data:image/jpeg;base64,AAAA" onerror="x')`)), 'a screenshot with anything but base64 after the prefix is refused');
  const row = (await db.query(`select issue_url, created_at > now() - interval '1 minute' as fresh from public.feedback where message = 'with a made-up link'`)).rows[0];
  ok(row && row.issue_url === null && row.fresh === true, 'the ticket link and the time are the server\'s, not the sender\'s');
}
{ // r29: the block for a table made by step 1 between r25 and r28.
  const db = new PGlite(); await db.exec(stub);
  const r25 = pick('create table public.feedback (').replace('YOUR IRONLOG ACCOUNT EMAIL', 'v@example.com').replace("screenshot ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$'", "screenshot like 'data:image/jpeg;base64,%'").replace(/  -- The time and the ticket link[\s\S]*?new\.issue_url := null;\n/, '');
  await db.exec(r25);
  await as(db, V);
  ok(await tryq(db, `insert into public.feedback(category,message,screenshot) values ('bug','old rules let this in','data:image/jpeg;base64,AAAA" onerror="x')`) === 'ok', 'before: the r25 rules let a hostile screenshot in (what the fix is for)');
  await db.exec('reset role');
  await run(db, pick("new.issue_url := null;\n  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '24 hours') >= 5 then\n    raise exception 'feedback_rate_limited' using errcode = 'P0001';\n  end if;\n  return new;\nend $$;\nrevoke"), 'the r29 block runs on a table made between r25 and r28');
  await as(db, V);
  ok(/check/i.test(await tryq(db, `insert into public.feedback(category,message,screenshot) values ('bug','new rules stop this','data:image/jpeg;base64,AAAA" onerror="x')`)), 'after: a hostile screenshot is refused');
  let back = 0; for (let i = 0; i < 6; i++) if (await tryq(db, `insert into public.feedback(category,message,created_at) values ('bug','back-dated report ${i}','2001-01-01')`) === 'ok') back++;
  ok(back === 4, 'after: back-dated reports count toward today (' + back + ' more went in beside the one from before)');
}
{ // r26: the Security Advisor fixes. A ping made the old way gets a fixed search path from the fix block, and still answers anon.
  const db = new PGlite(); await db.exec(stub);
  await db.exec(`create or replace function public.ping() returns text language sql stable as $$ select 'ok' $$; grant execute on function public.ping() to anon;`);
  const cfg = async (fn) => (await db.query(`select coalesce(array_to_string(proconfig, ','), '') c from pg_proc where proname = '${fn}'`)).rows[0].c;
  ok(!/search_path/.test(await cfg('ping')), 'before the fix: ping has no fixed search path (what the advisor flags)');
  await run(db, pick("alter function public.ping() set search_path = '';"), 'the advisor fix for ping runs');
  ok(/search_path=""/.test(await cfg('ping')), 'after the fix: ping has a fixed, empty search path', await cfg('ping'));
  await as(db, null);
  ok((await db.query(`select public.ping() as p`)).rows[0].p === 'ok', 'signed out (the keep-alive): ping still answers ok');
  await db.exec('reset role');
  // The current Part 1 ping is created fixed already.
  await run(db, pick('create or replace function public.ping()'), 'the keep-alive block runs over an existing ping');
  ok(/search_path=""/.test(await cfg('ping')), 'the keep-alive block makes ping with a fixed search path');
  // The report-limit function: fixed search path, not callable by anyone, and the trigger still works.
  await db.exec(pick('create table public.feedback (').replace('YOUR IRONLOG ACCOUNT EMAIL', 'v@example.com'));
  ok(/search_path=""/.test(await cfg('feedback_limit')), 'the report-limit function has a fixed search path');
  await as(db, V);
  ok(/permission denied/i.test(await tryq(db, `select public.feedback_limit()`)), 'nobody can call the report-limit function directly');
  let n = 0; for (let i = 0; i < 6; i++) if (await tryq(db, `insert into public.feedback(category,message) values ('bug','report number ${i} here')`) === 'ok') n++;
  ok(n === 5, 'and the trigger still stops the sixth report (' + n + ' of 6 went in)');
}
{ // The upgrade path from the pre-r25 table.
  const db = new PGlite(); await db.exec(stub);
  await db.exec(`create table public.feedback (id bigint generated always as identity primary key, created_at timestamptz not null default now(), user_id uuid default auth.uid() references auth.users(id) on delete set null, category text not null check (category in ('bug','idea','question')), message text not null check (char_length(message) between 1 and 4000), reply_to text, screenshot text, context jsonb not null default '{}'::jsonb, issue_url text);
  alter table public.feedback enable row level security;
  create policy "anyone can add" on public.feedback for insert to anon, authenticated with check (user_id is null or user_id = (select auth.uid()));
  grant insert on public.feedback to anon, authenticated;
  insert into public.feedback(category,message,user_id) values ('bug','old anonymous one', null),('bug','old signed in one','${V}');`);
  await run(db, pick('delete from public.feedback where user_id is null;'), 'the upgrade block runs on the older table (B1 alternative)');
  await as(db, null);
  ok(/permission denied|row-level/i.test(await tryq(db, `insert into public.feedback(category,message) values ('bug','signed out spam text')`)), 'after the upgrade, signed out is refused');
  await as(db, V);
  ok(/check/i.test(await tryq(db, `insert into public.feedback(category,message) values ('bug','${'x'.repeat(1001)}')`)), 'after the upgrade, over 1,000 characters is refused');
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
