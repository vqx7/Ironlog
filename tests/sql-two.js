// The account's rows under writers at the same moment (2.78), on a Postgres server, which PGlite (tests/sql-rows.js)
// cannot show with its one connection: every change of an account gets its number in the order the changes are
// saved, so a phone that has read up to N never later finds a change numbered below N that it missed; pushes of one
// row from many phones at once end as the join of them all, with no error; and Finish is whole.
//   PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres PGPASSWORD=... node tests/sql-two.js
// The GitHub workflow runs it against a Postgres service (job sql-two). It makes its own database and drops it.
// `--broken lock` runs it on a copy of the SQL with the account's lock taken out, where it must fail (a check that
// passes on that copy proves nothing).
const { execFile, spawn } = require('child_process');
const { rowsSql, uuidOf } = require('./rowsdb');
const fails = [];
const ok = (c, m, x) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 700))); return !!c; };
if (!process.env.PGHOST) {
  const must = process.env.SQL_TWO_MUST === '1';
  // tests/run.js reads a suite as passed by its last line; here nothing was checked, and the line before says so.
  console.log(must ? 'FAIL no Postgres server given to this job (PGHOST)' : 'note skipped: no Postgres server (set PGHOST, PGPORT, PGUSER); the GitHub workflow runs this suite in a job of its own\nALL PASS (nothing run here)');
  process.exit(must ? 1 : 0);
}
const BROKEN = process.argv.includes('--broken') ? process.argv[process.argv.indexOf('--broken') + 1] : '';
const DB = 'ironlog_two_' + process.pid;
const STUB = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema auth; grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;`;
const V = uuidOf('v');
const AS = `set role authenticated; select set_config('request.jwt.claim.sub', '${V}', false);\n`;
/** One psql session on database `db` fed `script`; resolves with its output and errors. */
const psql = (db, script) => new Promise(res => {
  const p = spawn('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=0', '-d', db], { env: process.env });
  let out = '', err = '';
  p.stdout.on('data', d => { out += d; }); p.stderr.on('data', d => { err += d; });
  p.on('close', () => res({ out, err }));
  p.stdin.end(script);
});
const q = (db, text) => new Promise((res, rej) => execFile('psql', ['-X', '-q', '-At', '-d', db, '-c', text], { env: process.env, maxBuffer: 64 << 20 }, (e, so, se) => (e ? rej(new Error(se || String(e))) : res(so.trim()))));
const lit = o => "'" + JSON.stringify(o).replace(/'/g, "''") + "'";
(async () => {
  // In English order where the server has it, as a Supabase project's database is; else as the server makes one.
  await q('postgres', `create database ${DB} template template0 lc_collate 'en_US.utf8' lc_ctype 'en_US.utf8'`).catch(() => q('postgres', `create database ${DB}`));
  try {
    let sql = rowsSql().records;
    if (BROKEN === 'lock') sql = sql.replace(/\n\s*perform pg_advisory_xact_lock\([^\n]*\n/g, '\n');
    if (BROKEN === 'lock' && /pg_advisory_xact_lock/.test(sql)) throw new Error('the broken copy still takes the lock');
    if (BROKEN === 'collate') sql = sql.replace(/ collate "C"/g, '');
    if (BROKEN === 'collate' && /collate "C"/.test(sql.replace(/text collate "C"/g, ''))) throw new Error('the broken copy still orders by bytes');
    await psql(DB, STUB); await psql(DB, sql);
    await q(DB, `insert into auth.users values ('${V}', 'v@example.com')`);
    console.log('server: ' + (await q(DB, 'select version()')).slice(0, 60) + (BROKEN ? `; the SQL broken on purpose: ${BROKEN}` : ''));

    /* 1. Eight phones write at once, each change a transaction of its own that stays open a moment after its write,
       while a ninth reads what changed since the last number it read, over and over. */
    const W = 8, M = 40;
    const writer = w => AS + Array.from({ length: M }, (_, i) => `begin; select 1 from public.records_push(${lit([{ kind: 'session', id: `w${w}-${i}`, body: `b${w}-${i}`, t: 1000 + i, dev: 'dev' + w }, { kind: 'session', id: 'shared', body: `s${w}-${i}`, t: 1000 + i, dev: 'dev' + w }])}::jsonb); select pg_sleep(0.004 * random()); commit;`).join('\n');
    const seen = new Map(); let N = 0, pulls = 0, backwards = 0, done = false;
    const reader = (async () => {
      for (;;) {
        const wasDone = done;
        const r = JSON.parse(await q(DB, `${AS.replace(/\n/g, ' ')} select public.records_pull(${N}, 500)`).then(t => t.split('\n').pop()));
        pulls++;
        for (const x of r.rows) { if (x.seq <= N) backwards++; seen.set(x.id, x.seq); N = Math.max(N, x.seq); }
        if (wasDone && !r.rows.length) break;
      }
    })();
    const ws = await Promise.all(Array.from({ length: W }, (_, w) => psql(DB, writer(w))));
    done = true; await reader;
    const errs = ws.map(x => x.err.trim()).filter(Boolean);
    const all = JSON.parse(await q(DB, `select coalesce(json_agg(json_build_object('id', id, 'seq', seq)), '[]') from public.records`));
    const missed = all.filter(x => seen.get(x.id) !== x.seq);
    ok(!errs.length, `${W} phones writing ${M} changes each at the same moment: no write fails`, errs.slice(0, 3));
    ok(all.length === W * M + 1 && new Set(all.map(x => x.seq)).size === all.length, `every row is there (${all.length}) and no two share a number`, all.length);
    ok(!missed.length && !backwards, `a phone reading what changed since its last number, ${pulls} times while they wrote, missed no change and was never given an old number`, { missed: missed.slice(0, 5), backwards });
    const shared = JSON.parse(await q(DB, `select json_build_object('t', t, 'dev', dev, 'body', body) from public.records where id = 'shared'`));
    ok(shared.t === 1000 + M - 1 && shared.dev === 'dev' + (W - 1) && shared.body === `s${W - 1}-${M - 1}`, 'one row written by all of them at once ends as the latest edit, the greater device at equal times', shared);

    /* 2. One workout on two phones, both writing at once: a tick on one against Finish on the other, many times.
       Whichever lands first, no read ever finds the session saved with the workout still open. */
    const R2 = 30;
    await q(DB, `${AS.replace(/\n/g, ' ')} select 1 from public.records_push(${lit([{ kind: 'draft', id: 'draft', body: 'null', t: 1, dev: 'devA' }])}::jsonb)`);
    let half = 0, both = 0, refused = 0;
    for (let i = 0; i < R2; i++) {
      const t0 = 10000 + i * 10, wid = 'W' + i;
      const cur = JSON.parse(await q(DB, `select json_build_object('t', t, 'dev', dev) from public.records where kind = 'draft'`));
      await q(DB, `${AS.replace(/\n/g, ' ')} select 1 from public.records_push(${lit([{ kind: 'draft', id: 'draft', body: wid + ':[s1]', t: t0, dev: 'devA', over_t: cur.t, over_dev: cur.dev }])}::jsonb)`);
      const tick = AS + `select 1 from public.records_push(${lit([{ kind: 'draft', id: 'draft', body: wid + ':[s1,b1]', t: t0 + 1, dev: 'devB', over_t: t0, over_dev: 'devA' }])}::jsonb);`;
      const finish = AS + `select 1 from public.records_push(${lit([{ kind: 'session', id: wid, body: 'session ' + wid, t: t0 + 2, dev: 'devA' }, { kind: 'draft', id: 'draft', body: 'null', t: t0 + 2, dev: 'devA', over_t: t0, over_dev: 'devA' }])}::jsonb);`;
      const [a, b] = await Promise.all([psql(DB, tick), psql(DB, finish)]);
      const st = JSON.parse(await q(DB, `select json_build_object('session', (select count(*) from public.records where id = '${wid}'), 'draft', (select body from public.records where kind = 'draft'))`));
      if (st.session && st.draft !== 'null') half++;
      if (/rows_draft_stale/.test(a.err + b.err)) refused++; else both++;
    }
    ok(half === 0 && refused + both === R2 && refused > 0, `a tick on one phone against Finish on the other at once, ${R2} times: the session is never saved with the workout still open (one of the two refused whole ${refused} times)`, { half, refused, both });

    /* 3. Order by bytes, whatever the database's own order of text. A phone decides a tie of two copies of one
       version, and orders the rows for the daily checksum, by bytes; PGlite's own order is by bytes too, so only a
       server whose order is a language's (Supabase's is) can show the SQL does the same. "a" is after "B" by bytes
       and before it in English. */
    const coll = await q(DB, `select datcollate from pg_database where datname = current_database()`);
    const say = `${AS.replace(/\n/g, ' ')} select 1 from public.records_push`;
    await q(DB, `${say}(${lit([{ kind: 'session', id: 'tie', body: 'B copy', t: 50, dev: 'devA', a: 1 }])}::jsonb)`);
    await q(DB, `${say}(${lit([{ kind: 'session', id: 'tie', body: 'a copy', t: 50, dev: 'devA', a: 1 }])}::jsonb)`);
    await q(DB, `${say}(${lit([{ kind: 'session', id: 'tie', body: 'B copy', t: 50, dev: 'devA', a: 1 }])}::jsonb)`);
    const tie = await q(DB, `select body from public.records where id = 'tie'`);
    await q(DB, `${say}(${lit([{ kind: 'zz', id: 'B', body: 'x', t: 1, dev: '' }, { kind: 'zz', id: 'a', body: 'x', t: 1, dev: '' }])}::jsonb)`);
    const rowsNow = JSON.parse(await q(DB, `select json_agg(json_build_object('kind', kind, 'id', id, 't', t, 'dev', dev, 'a', a, 'sum', sum, 'gone_saw', gone_saw, 'gone_saw_dev', gone_saw_dev, 'gone_good', gone_good)) from public.records`));
    const bytes = (x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y));
    const mine = require('crypto').createHash('md5').update(rowsNow.sort((x, y) => bytes(x.kind, y.kind) || bytes(x.id, y.id)).map(x => [x.kind, x.id, x.t, x.dev, x.a, (x.sum ?? '').slice(0, 12), x.gone_saw ?? '', x.gone_saw_dev ?? '', x.gone_good ? 1 : 0].join('\x1f')).join('\x1e'), 'utf8').digest('hex');
    const dg = JSON.parse(await q(DB, `${AS.replace(/\n/g, ' ')} select public.records_digest()`).then(t => t.split('\n').pop()));
    ok(tie === 'a copy', `of two copies of one version the one later by bytes is kept, whichever arrives last (the database orders text as ${coll})`, tie);
    ok(dg.sum === mine && dg.n === rowsNow.length, `the account's one checksum is over its rows in the order of their bytes, as a phone works it out (${dg.n} rows)`, { sql: dg.sum, phone: mine });
  } finally {
    await q('postgres', `drop database if exists ${DB} with (force)`).catch(e => console.log('note could not drop ' + DB + ': ' + e.message));
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
