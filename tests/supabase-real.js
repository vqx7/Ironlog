// The app's own account code against a real Supabase project (2.79, V's tooling list, item 2): the path PGlite and the
// Postgres server of tests/sql-two.js cannot show, Supabase's data API, its sign-in, its row rule, its limits and its
// timeouts. Runs only in the workflow's job `supabase`, against a test project that holds no real data (OWNER.md G1),
// the one suite that reaches an outside service. Its three secrets:
//   SUPA_TEST_URL, SUPA_TEST_ANON_KEY   the test project's address and publishable key
//   SUPA_TEST_DB_URL                    its database's session pooler connection string, with the password
// With them missing it says it was skipped and passes. SUPA_TEST_FAKE=1 runs the same calls against the stand-in server
// (tests/fake-supabase.js) instead, with no tables to set up: how this suite's own client side is tried without a project.
//   node tests/supabase-real.js            node tests/supabase-real.js --broken over   (must fail: the workflow checks)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { rowsSql } = require('./rowsdb');
const cfg = require('../scripts/config');
const ROOT = path.join(__dirname, '..');
const fails = [];
const ok = (c, m, x) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 600))); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const BROKEN = process.argv.includes('--broken') ? process.argv[process.argv.indexOf('--broken') + 1] : null;
const FAKE = process.env.SUPA_TEST_FAKE === '1';

(async () => {
  let URL = process.env.SUPA_TEST_URL, KEY = process.env.SUPA_TEST_ANON_KEY, DB = process.env.SUPA_TEST_DB_URL;
  let fake = null;
  if (FAKE) {
    fake = await require('./fake-supabase').start(path.join(ROOT, 'dist'));
    URL = fake.base; KEY = 'sb_publishable_fake'; DB = 'fake';
    await fake.recordsOn();
  } else if (!URL || !KEY || !DB) {
    console.log('note skipped: no test project (SUPA_TEST_URL, SUPA_TEST_ANON_KEY and SUPA_TEST_DB_URL, OWNER.md G1); the GitHub workflow runs this suite in its job `supabase` once they are set\nALL PASS (nothing run here)');
    process.exit(0);
  }
  const psql = text => execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', DB], { input: text, encoding: 'utf8', maxBuffer: 64 << 20 });

  /* ---------- 1. Its own tables, from SUPABASE.md's own text, after dropping any a stopped run left ---------- */
  const sup = fs.readFileSync(path.join(ROOT, 'SUPABASE.md'), 'utf8');
  const blocks = [...sup.matchAll(/```sql\n([\s\S]*?)```/g)].map(m => m[1]);
  const ping = blocks.find(b => /create or replace function public\.ping\(\)/.test(b));
  const S = rowsSql();
  if (BROKEN === 'over') {
    // The workout's row written only over the copy read: taken out, the writers below must lose a write.
    const from = /      if new\.over_t is distinct from cur\.t or new\.over_dev is distinct from cur\.dev then\n\s*raise exception 'rows_draft_stale'[^\n]*\n\s*end if;\n/;
    if (!from.test(S.records)) { console.log('FAIL the SQL no longer holds the rule the broken run takes out'); process.exit(1); }
    S.records = S.records.replace(from, '');
  }
  if (!FAKE) {
    psql(`drop table if exists public.app_errors, public.app_errors_preview, public.records, public.records_preview, public.docs, public.docs_preview cascade;
drop function if exists public.docs_frozen(), public.docs_preview_frozen(), public.docs_guarded(), public.docs_preview_guarded(), public.app_errors_cap(), public.app_errors_preview_cap(), public.app_errors_trim(), public.app_errors_preview_trim() cascade;`);
    for (const b of [S.docs, S.docs_preview, ping, S.records, S.records_preview, S.guard, S.guard_preview]) psql(b);
    const made = psql(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('records_push','records_pull','records_digest','docs_frozen','docs_guarded','app_errors_cap','app_errors_trim','ping');`).trim();
    ok(Number(made) >= 8, '1. the tables, functions and triggers of Parts 1, 3, 5, 8 and 9 are made from SUPABASE.md\'s own text', made);
    psql(`notify pgrst, 'reload schema';`);
  }

  /* ---------- the app's own account code, in Node with a stand-in window ---------- */
  const text = fs.readFileSync(path.join(ROOT, 'scripts/cloud-supabase.js'), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, k) => String(cfg[k]));
  const lib = fs.readFileSync(path.join(ROOT, 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'), 'utf8');
  function phone(name) {
    const store = new Map();
    const localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), key: i => [...store.keys()][i] ?? null, get length() { return store.size; } };
    const win = { IRONLOG_SUPABASE: { url: URL, key: KEY }, localStorage, location: { hash: '', href: 'https://ironapp.org/', origin: 'https://ironapp.org', protocol: 'https:', pathname: '/' }, navigator: { standalone: false, onLine: true, userAgent: 'node ' + name }, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener() {}, removeEventListener() {}, document: { addEventListener() {}, visibilityState: 'visible' } };
    win.top = win; win.self = win; win.window = win; win.globalThis = win;
    const ctx = vm.createContext(Object.assign(win, { WebSocket: globalThis.WebSocket || class { constructor() { throw new Error("no realtime here"); } }, console, setTimeout, clearTimeout, setInterval, clearInterval, fetch, AbortController, Headers, Request, Response, URL: globalThis.URL, URLSearchParams, TextEncoder, TextDecoder, crypto: globalThis.crypto, atob, btoa, structuredClone, queueMicrotask, Promise }));
    vm.runInContext(lib, ctx);
    vm.runInContext(text, ctx);
    return win;
  }
  const pw = crypto.createHash('sha256').update('ironlog ci ' + DB).digest('hex').slice(0, 24) + 'Aa1!';
  async function account(email) {
    const P = phone(email);
    if (FAKE && !fake.users.has(email)) fake.addUser(email, pw);
    let r = await P.ironlogAuth.signIn(email, pw).then(() => 'in', e => String(e.message || e));
    if (r !== 'in' && !FAKE) { await P.ironlogAuth.signUp(email, pw).catch(() => {}); r = await P.ironlogAuth.signIn(email, pw).then(() => 'in', e => String(e.message || e)); }
    if (r !== 'in') throw new Error(`${email} could not sign in: ${r}`);
    const c = await P.ironlogCloud();
    return { P, db: c.db, id: c.userId };
  }
  const A = await account('ci-a@ironapp.org'), B = await account('ci-b@ironapp.org');
  // The data API serves the new tables only after it reloads its schema: asked until it stops answering "no such table".
  for (let i = 0; i < 30 && (await A.db.rows.digest().catch(() => null)) === null; i++) await wait(1000);

  /* ---------- 3. The app's own calls, round trip ---------- */
  const row = (id, t, more) => ({ kind: 'session', id, body: JSON.stringify({ id, notes: 'n' + t }), t, dev: 'dev-ci', a: 0, ...more });
  const pushed = await A.db.rows.push([row('c1', 1000), row('c2', 1001)]);
  ok(pushed && Array.isArray(pushed.rows) && typeof pushed.top === 'number', '3. a push answers with its rows and the account\'s last change number, a number', pushed);
  const pulled = await A.db.rows.pull(0, 500);
  ok(pulled && pulled.rows.some(r => r.id === 'c1' && typeof r.t === 'number' && typeof r.seq === 'number'), '3. a pull brings them back, numbers as numbers', pulled && pulled.rows.slice(0, 2));
  const dg = await A.db.rows.digest();
  ok(dg && typeof dg.n === 'number' && typeof dg.sum === 'string', '3. the digest answers its count and checksum', dg);
  const listed = await A.db.rows.list(0, 500);
  ok(Array.isArray(listed) && listed.length >= 2 && listed.every(r => r.body === undefined), '3. the list comes without copies', listed && listed.slice(0, 2));
  ok((await A.db.rows.guarded()) === true, '3. the guard\'s check answers true');
  ok((await A.db.errors.add({ version: cfg.DISPLAY_VERSION, build: cfg.APP_VERSION, screen: 'today', area: 'ci', message: 'the real server check', stack: '', browser: 'node' })) === true, '3. an error added, nothing read back');
  const stale = await A.db.rows.push([{ kind: 'draft', id: 'draft', body: '{"id":"w1"}', t: 5000, dev: 'dev-ci', a: 0 }]).then(() => A.db.rows.push([{ kind: 'draft', id: 'draft', body: '{"id":"w2"}', t: 6000, dev: 'dev-ci', a: 0, over_t: 1, over_dev: 'nobody' }])).then(() => 'taken', e => String(e.message));
  ok(/rows_draft_(stale|time)/.test(stale), '3. the SQL\'s own error names reach the app with their names (rows_draft_stale)', stale);
  const moved = await A.db.rows.push([row('c3', 1002)], 0).then(() => 'taken', e => String(e.message));
  ok(/rows_moved/.test(moved), '3. and rows_moved', moved);

  /* ---------- 4. The limits the app relies on ---------- */
  const big = Array.from({ length: 200 }, (_, i) => row('big' + i, 2000 + i, { body: JSON.stringify({ id: 'big' + i, notes: 'x'.repeat(1900) }) }));
  const t0 = Date.now();
  const took = await A.db.rows.push(big).then(() => true, e => String(e.message));
  ok(took === true && Date.now() - t0 < 8000, `4. a push of 200 rows and about 400 KB is taken inside 8 s (${Date.now() - t0} ms)`, took);
  const page = await A.db.rows.pull(0, 500);
  const pageList = await A.db.rows.list(0, 500);
  ok(page.rows.length >= 200 && pageList.length >= 200, `4. a pull and a list of up to 500 rows come back whole (${page.rows.length}, ${pageList.length})`);

  /* ---------- 5. The row rule ---------- */
  const theirs = await B.db.rows.pull(0, 500);
  ok(!theirs.rows.some(r => r.id === 'c1'), '5. the second account reads none of the first\'s rows', theirs.rows.length);
  await B.db.rows.push([row('c1', 9000)]);
  const mine = (await A.db.rows.pull(0, 500)).rows.find(r => r.id === 'c1');
  ok(mine && mine.t === 1000, '5. its push of the same key makes its own row, the first\'s unchanged', mine);

  // Signed out, with the publishable key alone: every call refused.
  const raw = (p, body, token) => fetch(URL + p, { method: body === undefined ? 'GET' : 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async r => ({ status: r.status, body: await r.text() }));
  const out = [await raw('/rest/v1/rpc/records_pull', { since: 0, most: 5 }), await raw('/rest/v1/rpc/records_push', { p: [row('x', 1)] }), await raw('/rest/v1/rpc/records_digest', {}), await raw('/rest/v1/records?select=kind,id&limit=5')];
  ok(out.every(r => r.status >= 400 || r.body === '[]'), '5. signed out, every call is refused or reads nothing', out.map(r => r.status + ' ' + r.body.slice(0, 60)));

  /* ---------- 6. Writers at the same moment ---------- */
  const W = await Promise.all([1, 2, 3, 4].map(async k => { const C = await account('ci-a@ironapp.org'); return C; }));
  const top0 = (await A.db.rows.pull(Number.MAX_SAFE_INTEGER, 1)).top;
  await Promise.all(W.map((C, k) => Promise.all(Array.from({ length: 10 }, (_, i) => C.db.rows.push([row(`w${k}-${i}`, 3000 + k * 100 + i)])))));
  const after = (await A.db.rows.pull(top0, 500)).rows;
  const seqs = after.map(r => r.seq);
  ok(after.filter(r => /^w\d-\d$/.test(r.id)).length === 40 && new Set(seqs).size === seqs.length, '6. four clients pushing one account at once: every change numbered once, none lost', { n: after.length });

  /* ---------- 7. The documents guard ---------- */
  const doc = n => ({ v: 1, at: 1000 + n, et: 1000 + n, w: 'dev-ci.' + n, json: '{"sessions":[]}' });
  const ref = (C, p) => C.db.doc(`data/users/${C.id}/${p}`);
  ok((await ref(A, 'ci-doc').setIf(doc(1), null).then(() => true, e => String(e.message))) === true, '7. a document written while the documents decide');
  await A.db.rows.push([{ kind: 'meta', id: 'layout', body: JSON.stringify({ made: 'ci', decides: 'rows', level: 2, gen: 2, at: 1 }), t: Date.now(), dev: 'dev-ci', a: 0 }]);
  const seen = { w: 'dev-ci.1' };
  const frozen = await ref(A, 'ci-doc').setIf(doc(2), seen).then(() => 'taken', e => String(e.message));
  ok(frozen === 'docs_frozen', '7. with the rows deciding, a write is refused by name', frozen);
  const back = await ref(A, 'ci-doc').setIf({ ...doc(3), back: true }, seen).then(() => 'taken', e => String(e.message));
  ok(back === 'taken', '7. one carrying back is taken', back);
  ok((await ref(B, 'ci-doc').setIf(doc(4), null).then(() => 'taken', e => String(e.message))) === 'taken', '7. the second account writes freely');

  /* ---------- 8. The error log ---------- */
  const add = (C, n) => C.db.errors.add({ version: '2.79', build: cfg.APP_VERSION, screen: 'today', area: 'ci', message: 'cap ' + n, stack: '', browser: 'node' }).then(() => 'taken', e => String(e.message));
  const tokenOf = C => { const st = C.P.localStorage; for (let i = 0; i < st.length; i++) { const v = st.getItem(st.key(i)); if (v && v.includes('access_token')) try { return JSON.parse(v).access_token; } catch (e) { /* not the sign-in */ } } return null; };
  const read = await raw('/rest/v1/app_errors?select=message', undefined, tokenOf(A));
  ok(read.status >= 400 || read.body === '[]', '8. a read of the error log is refused, signed in', read.status + ' ' + read.body.slice(0, 80));
  const anon = await raw('/rest/v1/app_errors', { version: '2.79', build: 'b', screen: 's', area: 'ci', message: 'signed out', stack: '', browser: '' });
  ok(anon.status >= 400, '8. signed out, an add is refused', anon.status);
  let dropped = 0;
  for (let i = 0; i < 52; i++) if ((await add(B, i)) !== 'taken') dropped++;
  ok(dropped === 0, '8. the 51st and 52nd of a day are dropped with no error', dropped);

  /* ---------- 9. Clears its tables; the two accounts stay ---------- */
  if (!FAKE) psql(`delete from public.records; delete from public.docs; delete from public.app_errors;`);
  if (fake) await fake.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', (e && e.stack) || e); process.exit(1); });
