// The documents guarded once an account's rows decide (2.79, SUPABASE.md Part 9) on a real Postgres engine (PGlite),
// for `docs` with `records` and for the preview's `docs_preview` with `records_preview`: a phone on an older build
// cannot save where no phone on 2.79 reads; "Switch back" (a write carrying `back`) can; another account writes freely.
const { rowsDb, rowsSql } = require('./rowsdb');
const fails = [];
let sink = null;
const ok = (c, m, x) => { if (sink) { if (!c) sink.push(m); return !!c; } if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 400))); return !!c; };
const doc = (n, more) => ({ v: 1, at: 1000 + n, et: 1000 + n, w: 'dev-x.' + n, json: JSON.stringify({ sessions: [{ id: 's' + n }] }), ...more });
(async () => {
  const sql = rowsSql();
  ok(sql.guard_preview.split('create table public.app_errors_preview')[0].replace(/^--.*\n/gm, '').trim() === sql.guard.split('create table public.app_errors (')[0].replace(/^--.*\n/gm, '').replace(/(?<![a-z_'])docs_frozen/g, 'docs_preview_frozen').replace(/(?<![a-z_])docs_guarded/g, 'docs_preview_guarded').replace(/public\.records /g, 'public.records_preview ').replace(/public\.docs /g, 'public.docs_preview ').trim(), "the preview's guard is the live one, the tables' names aside");
  const behaviours = async (T, broken) => {
    const R = await rowsDb(broken ? { sql: broken } : {});
    const put = (who, path, d) => R.call(who, T, 'docput', [path, d]).then(() => 'taken', e => e.code);
    let n = 0;
    const layout = (who, body) => R.call(who, T, 'push', [[{ kind: 'meta', id: 'layout', body: JSON.stringify(body), t: Date.now() + ++n, dev: 'dev-l', a: 0 }]]);
    const docs = T === 'records' ? 'docs' : 'docs_preview';
    const held = async (who, path) => { const r = await R.admin(`select data from public.${docs} where user_id = $1 and path = $2`, [R.uuidOf(who), path]); return r[0] ? r[0].data.w : null; };
    ok((await put('a', 'data/users/a/2026-11a', doc(1))) === 'taken', `${T}: with no layout row, a document write is taken`);
    await layout('a', { made: 'm1', decides: 'docs', level: 1, gen: 1, at: 0 });
    ok((await put('a', 'data/users/a/2026-11a', doc(2))) === 'taken', `${T}: with the documents deciding, taken`);
    await layout('a', { made: 'm1', decides: 'rows', level: 2, gen: 2, at: 5 });
    ok((await put('a', 'data/users/a/2026-11a', doc(3))) === 'docs_frozen', `${T}: with the rows deciding, an older phone's write is refused by name`);
    ok((await held('a', 'data/users/a/2026-11a')) === 'dev-x.2', `${T}: and nothing of it is written`);
    ok((await put('a', 'data/users/a/2026-12a', doc(4))) === 'docs_frozen', `${T}: so is a new document`);
    ok((await put('b', 'data/users/b/2026-11a', doc(5))) === 'taken', `${T}: another account, whose rows do not decide, still writes`);
    ok((await put('a', 'data/users/a/2026-11a', doc(6, { back: true }))) === 'taken' && (await held('a', 'data/users/a/2026-11a')) === 'dev-x.6', `${T}: a write carrying back (Switch back) is taken`);
    await layout('a', { made: 'm1', decides: 'docs', level: 1, gen: 3, at: 7, hold: true });
    ok((await put('a', 'data/users/a/2026-11a', doc(7))) === 'taken', `${T}: with the layout back to the documents, an older phone writes again`);
    ok((await R.call('a', T, 'guarded')) === true, `${T}: signed in, the app learns the guard is in place`);
    ok(await R.call(null, T, 'guarded').then(() => false, () => true), `${T}: signed out, it cannot ask`);
    await R.call('a', T, 'push', [[{ kind: 'meta', id: 'layout', body: 'not json', t: Date.now() + ++n, dev: 'dev-l', a: 0 }]]);
    ok((await put('a', 'data/users/a/2026-11a', doc(8))) !== 'taken', `${T}: a layout that cannot be read refuses the write (closed, not open)`);
    await R.close();
  };
  for (const T of ['records', 'records_preview']) await behaviours(T);
  // This suite is trusted only because it fails on the SQL with the guard's rule broken.
  const BROKEN = {
    'the guard reading no layout': { from: `if lay is not null and (lay::jsonb ->> 'decides') is distinct from 'docs' and not (new.data ? 'back') then`, to: `if false then` },
    'the guard letting no Switch back through': { from: ` and not (new.data ? 'back') then`, to: ` then` }
  };
  for (const [name, b] of Object.entries(BROKEN)) {
    const real = rowsSql();
    if (!real.guard.includes(b.from) || !real.guard_preview.includes(b.from)) { ok(false, 'the SQL no longer holds the text the broken copy replaces: ' + name); continue; }
    sink = [];
    await behaviours('records', { guard: real.guard.split(b.from).join(b.to), guard_preview: real.guard_preview.split(b.from).join(b.to) });
    const got = sink; sink = null;
    ok(got.length > 0, `the checks fail on the SQL with one rule broken: ${name}`, 'nothing failed');
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
