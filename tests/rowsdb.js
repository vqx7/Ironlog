// The account's rows for the suites (2.78): the SQL of SUPABASE.md, Part 8, run on a real Postgres engine (PGlite)
// with a stand-in for Supabase's auth schema and roles, so no suite keeps a copy of the account's rules in
// JavaScript. One database holds both tables; every call runs as one signed-in account, one call at a time (the
// engine has one connection), which is also how the account applies one account's writes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const STUB = `
create role anon nologin; create role authenticated nologin;
create schema auth; grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;`;
/** The two SQL blocks of SUPABASE.md, Part 8: the live table's and the preview's. */
function rowsSql() {
  const sup = fs.readFileSync(path.join(__dirname, '..', 'SUPABASE.md'), 'utf8');
  const blocks = [...sup.matchAll(/```sql\n([\s\S]*?)```/g)].map(m => m[1]);
  const pick = n => { const b = blocks.find(x => x.includes(n)); if (!b) throw new Error('SUPABASE.md has no block with ' + n); return b; };
  return { records: pick('create table public.records ('), records_preview: pick('create table public.records_preview (') };
}
/** A test's account name as the uuid the database knows it by (a uuid is kept as it is). */
const uuidOf = name => (/^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(name) ? name : (h => `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`)(crypto.createHash('md5').update('ironlog-test-account ' + name).digest('hex')));
const COLS = 'kind, id, body, sum, t, dev, a, gone_saw, gone_saw_dev, gone_good, gone_t, gone_dev, gone_day, gone_clash, seq';
// What a phone reads of each row when it reads the list: everything but the copy (scripts/cloud-supabase.js asks for the same; tests/rows.js checks that it does).
const LIST = 'kind,id,sum,t,dev,a,gone_saw,gone_saw_dev,gone_good,gone_day,gone_clash,seq';
/** A database with both tables. o.sql: the SQL to run in place of SUPABASE.md's (a copy with one rule broken). */
async function rowsDb(o = {}) {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(STUB);
  const sql = o.sql || rowsSql();
  await db.exec(sql.records);
  await db.exec(sql.records_preview);
  const known = new Set();
  let chain = Promise.resolve();
  // One call at a time: the role and the account are the connection's, so two calls must never interleave.
  const one = fn => { const p = chain.then(fn, fn); chain = p.then(() => {}, () => {}); return p; };
  const as = async uid => {
    await db.exec(`reset role;`);
    if (uid && !known.has(uid)) { await db.query(`insert into auth.users values ($1, $2) on conflict do nothing`, [uid, uid + '@example.com']); known.add(uid); }
    await db.exec(`select set_config('request.jwt.claim.sub', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'};`);
  };
  const fail = e => { const m = String((e && e.message) || e); const c = (m.match(/rows_[a-z_]+/) || [])[0]; return Object.assign(new Error(m), { code: c || (/permission denied|row-level security/i.test(m) ? 'denied' : 'error') }); };
  /** One of the account's calls as account `who` on `table`: push(rows, top), pull(since, most), digest(), list(since, most). */
  const call = (who, table, name, args = []) => one(async () => {
    const uid = who ? uuidOf(who) : null;
    await as(uid);
    try {
      if (name === 'push') return (await db.query(`select public.${table}_push($1::jsonb, $2::bigint) as r`, [JSON.stringify(args[0] || []), args[1] ?? null])).rows[0].r;
      if (name === 'pull') return (await db.query(`select public.${table}_pull($1::bigint, $2::int) as r`, [args[0] || 0, args[1] || 500])).rows[0].r;
      if (name === 'digest') return (await db.query(`select public.${table}_digest() as r`)).rows[0].r;
      if (name === 'list') {
        // args[2]: the columns asked for, as the Data API's `select` names them; only the table's own are read.
        const [since, most, select] = args;
        const cols = select ? String(select).split(',').map(c => c.trim()) : LIST.split(',');
        const bad = cols.find(c => !COLS.split(', ').includes(c));
        if (bad) throw new Error(`column ${table}.${bad} does not exist`);
        const r = await db.query(`select ${cols.join(', ')} from public.${table} where seq > $1 order by seq limit $2`, [since || 0, most || 1000]);
        return r.rows.map(num);
      }
      throw new Error('no such call: ' + name);
    } catch (e) { throw fail(e); } finally { await db.exec('reset role;'); }
  });
  const num = r => { for (const k of ['t', 'a', 'seq', 'gone_saw', 'gone_t']) if (r[k] !== null && r[k] !== undefined) r[k] = Number(r[k]); return r; };
  /** As the database's owner, outside the row rule: what a suite reads to check the account. */
  const admin = (text, params) => one(async () => { await db.exec('reset role;'); return (await db.query(text, params || [])).rows; });
  /** Every row of account `who` in `table`, as the owner reads them. */
  const rows = async (who, table = 'records') => (await admin(`select ${COLS} from public.${table} where user_id = $1 order by kind collate "C", id collate "C"`, [uuidOf(who)])).map(num);
  /** A statement as account `who` (or signed out), for the checks of the row rule: 'ok' or the error's message. */
  const tryAs = (who, text, params) => one(async () => { await as(who ? uuidOf(who) : null); try { if (!params && /;\s*\S/.test(text)) { const rs = await db.exec(text); return { ok: true, rows: (rs[rs.length - 1] || {}).rows || [] }; } const r = await db.query(text, params || []); return { ok: true, rows: r.rows }; } catch (e) { await db.exec('rollback').catch(() => {}); return { ok: false, err: String(e.message) }; } finally { await db.exec('reset role;'); } });
  return { db, call, admin, rows, tryAs, uuidOf, close: () => db.close() };
}
module.exports = { rowsDb, rowsSql, uuidOf, LIST };
