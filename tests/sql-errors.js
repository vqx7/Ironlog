// The app's own error log (2.79, SUPABASE.md Part 9) on a real Postgres engine (PGlite), for `app_errors` and the
// preview's `app_errors_preview`: a signed-in phone may only add rows, with the columns the app sends, at most 50 an
// account a day; nobody reads, changes or deletes a row through the app; rows older than 90 days go.
const { rowsDb, rowsSql } = require('./rowsdb');
const fails = [];
let sink = null;
const ok = (c, m, x) => { if (sink) { if (!c) sink.push(m); return !!c; } if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 400))); return !!c; };
const row = n => ({ version: '2.79', build: '2026.11.28-r128', screen: 'today', area: 'uncaught', message: 'TypeError: x is undefined ' + n, stack: 'at f (index.html:1:2)', browser: 'Mozilla/5.0' });
(async () => {
  const sql = rowsSql();
  const live = sql.guard.slice(sql.guard.indexOf('create table public.app_errors ('));
  const prev = sql.guard_preview.slice(sql.guard_preview.indexOf('create table public.app_errors_preview ('));
  ok(prev.replace(/^--.*\n/gm, '').trim() === live.replace(/^--.*\n/gm, '').replace(/app_errors/g, 'app_errors_preview').trim(), "the preview's error log is the live one, the table's name aside");
  const behaviours = async (T, broken) => {
    const R = await rowsDb(broken ? { sql: broken } : {});
    const E = T === 'records' ? 'app_errors' : 'app_errors_preview';
    const add = (who, r) => R.call(who, T, 'erradd', [r]).then(() => 'taken', e => 'refused');
    const count = async who => Number((await R.admin(`select count(*) as n from public.${E} where user_id = $1`, [R.uuidOf(who)]))[0].n);
    ok((await add('a', row(1))) === 'taken' && (await count('a')) === 1, `${E}: a signed-in account adds a row`);
    ok((await add(null, row(2))) === 'refused', `${E}: signed out, refused`);
    for (const q of [`select * from public.${E}`, `update public.${E} set message = 'x'`, `delete from public.${E}`]) {
      const r = await R.tryAs('a', q);
      ok(!r.ok || !r.rows.length, `${E}: a signed-in account cannot ${q.split(' ')[0]} a row`, r);
    }
    ok((await R.call('a', T, 'erradd', [{ ...row(3), user_id: R.uuidOf('b') }]).then(() => 'taken', () => 'refused')) === 'refused', `${E}: a row for another account refused`);
    ok((await R.call('a', T, 'erradd', [{ ...row(4), at: '2020-01-01T00:00:00Z' }]).then(() => 'taken', () => 'refused')) === 'refused', `${E}: a time given refused`);
    ok((await add('a', { ...row(5), message: 'x'.repeat(201) })) === 'refused' && (await add('a', { ...row(6), message: '' })) === 'refused', `${E}: a message past 200 characters, and an empty one, refused`);
    for (let i = 0; i < 60; i++) await add('a', row(100 + i));
    ok((await count('a')) === 50, `${E}: 50 rows an account a day, the rest dropped without an error`, await count('a'));
    ok((await add('b', row(7))) === 'taken' && (await count('b')) === 1, `${E}: another account still adds its own`);
    await R.admin(`update public.${E} set at = now() - interval '25 hours' where user_id = $1`, [R.uuidOf('a')]);
    ok((await add('a', row(8))) === 'taken' && (await count('a')) === 51, `${E}: the day's cap counts the last 24 hours only`);
    await R.admin(`update public.${E} set at = now() - interval '91 days' where user_id = $1 and message like '%10_'`, [R.uuidOf('a')]);
    await add('b', row(9));
    ok((await count('a')) === 41, `${E}: rows older than 90 days deleted when a row is added`, await count('a'));
    ok(!(await R.tryAs('a', `select public.${E}_trim()`)).ok, `${E}: the trim cannot be called`);
    await R.admin(`delete from auth.users where id = $1`, [R.uuidOf('b')]);
    ok((await count('b')) === 0, `${E}: deleting an account deletes its rows`);
    const q = await R.admin(`select version, area, message, count(*) as times, count(distinct user_id) as accounts, max(at) as last, min(stack) as stack from public.${E} where at > now() - interval '7 days' group by version, area, message order by times desc, last desc`);
    ok(q.length > 0 && q[0].version === '2.79', `${E}: the saved query answers`);
    await R.close();
  };
  for (const T of ['records', 'records_preview']) await behaviours(T);
  const BROKEN = {
    'no cap a day': { from: `>= 50 then\n    return null;`, to: `>= 5000 then\n    return null;` },
    'every column open to the app': { from: `grant insert (version, build, screen, area, message, stack, browser) on public.app_errors to authenticated;`, to: `grant insert on public.app_errors to authenticated;` }
  };
  for (const [name, b] of Object.entries(BROKEN)) {
    const real = rowsSql();
    if (!real.guard.includes(b.from)) { ok(false, 'the SQL no longer holds the text the broken copy replaces: ' + name); continue; }
    sink = [];
    await behaviours('records', { guard: real.guard.split(b.from).join(b.to) });
    const got = sink; sink = null;
    ok(got.length > 0, `the checks fail on the SQL with one rule broken: ${name}`, 'nothing failed');
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
