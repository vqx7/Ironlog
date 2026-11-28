// The account's rows (2.78, SUPABASE.md Part 8) on a real Postgres engine: the table, the row rule, the trigger that
// joins every write, the three calls and the limits, for `records` and for the preview's `records_preview`; and that
// the same writes in any order, any number of times, end as the same row (the rule the whole design rests on).
// PGlite has one connection: what two writers at once do is tests/sql-two.js's, on a Postgres server.
const crypto = require('crypto');
const { rowsDb, rowsSql } = require('./rowsdb');
const fails = [];
// While `sink` is a list, checks are counted there and not printed: a run on a copy of the SQL with a rule broken.
let sink = null;
const ok = (c, m, x) => { if (sink) { if (!c) sink.push(m); return !!c; } if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 600))); return !!c; };
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const S = (id, body, t, dev, more) => ({ kind: 'session', id, body, t, dev, ...more });
const del = (id, body, t, dev, gt, gdev, good) => S(id, good ? null : body, t, dev, { gone_saw: t, gone_saw_dev: dev, gone_t: gt, gone_dev: gdev, gone_good: !!good, gone_day: '2026-11-22' });
/** What a row says: in the log, in Recently deleted or deleted for good; in capitals what must never be. */
function what(r) {
  if (!r) return 'no row';
  const gone = r.gone_saw !== null && Number(r.gone_saw) === Number(r.t) && r.gone_saw_dev === r.dev;
  if (!gone) return r.body === null ? 'IN THE LOG WITH NO COPY' : `in the log (${r.body})`;
  if (r.gone_good) return r.body === null ? 'deleted for good' : `DELETED FOR GOOD, COPY HELD (${r.body})`;
  return r.body === null ? 'IN RECENTLY DELETED WITH NO COPY' : `in Recently deleted (${r.body})`;
}
(async () => {
  const sql = rowsSql();
  ok(sql.records_preview.replace(/^--.*\n/gm, '') === sql.records.replace(/^--.*\n/gm, '').replace(/(?<![a-z_])records(?![a-z])/g, 'records_preview'), "the preview's SQL is the live table's, the table's name aside");
  /** The behaviours, on table `T` of the SQL given (the real one when none); `quick` leaves out the limits, which fill an account. */
  const behaviours = async (T, broken, quick) => {
    const R = await rowsDb(broken ? { sql: broken } : {});
    const push = (rows, top, who = 'v') => R.call(who, T, 'push', [rows, top]).catch(e => ({ err: e.code + ' ' + e.message }));
    const pull = (since, most, who = 'v') => R.call(who, T, 'pull', [since, most]).catch(e => ({ err: e.code }));
    const row = async (kind, id, who = 'v') => (await R.rows(who, T)).find(r => r.kind === kind && r.id === id);
    const L = m => `${T}: ${m}`;
    // Numbering, the checksum, the shape of an answer.
    let r = await push([S('s1', '{"a":1}', 10, 'devA'), S('s2', '{"b":"é"}', 10, 'devA')]);
    ok(r.top === 2 && r.rows.length === 2 && r.rows.every(x => x.took && x.body === undefined), L('two new rows: both taken, numbered 1 and 2, no copy sent back'), r);
    ok((await row('session', 's2')).sum === md5('{"b":"é"}'), L("the account's own checksum is md5 of the bytes it holds (UTF-8)"));
    r = await push([S('s1', '{"a":1}', 10, 'devA')]);
    ok(r.top === 2 && r.rows[0].took === false && r.rows[0].body === undefined, L('the same write again: nothing changes, nothing numbered'), r);
    // R-7: the account only moves a record forward.
    r = await push([S('s1', '{"a":0}', 5, 'devZ', { over_t: 1, over_dev: 'x' })]);
    ok(r.rows[0].took === false && r.rows[0].body === '{"a":1}' && r.rows[0].t === 10, L('an earlier edit is not taken; the answer carries the copy held'), r);
    r = await push([S('s1', '{"a":2}', 11, 'devB', { over_t: 10, over_dev: 'devA' })]);
    ok(r.rows[0].took && r.rows[0].was_t === 10 && r.rows[0].was_dev === 'devA' && r.rows[0].was_body === undefined, L('a later edit made over the copy held: taken, nothing replaced unseen'), r);
    r = await push([S('s1', '{"a":3}', 12, 'devA', { over_t: 10, over_dev: 'devA' })]);
    ok(r.rows[0].took && r.rows[0].was_t === 11 && r.rows[0].was_body === '{"a":2}', L('a later edit made over a copy the row no longer holds: taken, and the answer carries what it replaced'), r);
    await push([S('e1', 'x', 100, 'devA')]); await push([S('e1', 'y', 100, 'devB')]);
    await push([S('e2', 'y', 100, 'devB')]); await push([S('e2', 'x', 100, 'devA')]);
    ok((await row('session', 'e1')).body === 'y' && (await row('session', 'e2')).body === 'y', L('equal times: the greater device id wins, in either order'));
    // R-9: the app's own write.
    await push([S('m1', 'c', 50, 'devA')]);
    r = await push([S('m1', 'c+name', 50, 'devA', { a: 1 })]);
    ok(r.rows[0].took && (await row('session', 'm1')).body === 'c+name', L("the app's own write (the count raised, the time unmoved) reaches the account"));
    await push([S('m1', 'old', 40, 'devB')]);
    ok((await row('session', 'm1')).body === 'c+name', L("an earlier lifter's edit does not replace it"));
    await push([S('m1', 'new', 60, 'devB')]);
    ok((await row('session', 'm1')).body === 'new' && (await row('session', 'm1')).a === 0, L("a later lifter's edit does"));
    await push([S('m2', 'c+appA', 50, 'devA', { a: 1 })]); await push([S('m2', 'c+appB', 50, 'devA', { a: 1 })]);
    await push([S('m3', 'c+appB', 50, 'devA', { a: 1 })]); await push([S('m3', 'c+appA', 50, 'devA', { a: 1 })]);
    ok((await row('session', 'm2')).body === 'c+appB' && (await row('session', 'm3')).body === 'c+appB', L('two app writes of one count: the greater text, in either order'));
    // R-3, R-6: marks.
    await push([S('d1', 'c5', 5, 'devA')]); await push([del('d1', 'c5', 5, 'devA', 30, 'devB')]);
    ok(what(await row('session', 'd1')) === 'in Recently deleted (c5)', L('a delete keeps the copy: in Recently deleted'));
    await push([S('d1', 'c9', 9, 'devC')]);
    ok(what(await row('session', 'd1')) === 'in the log (c9)', L('an edit the delete had not seen: in the log'));
    for (const order of ['BA', 'AB']) {
      const id = 'b2' + order; await push([S(id, 'c5', 5, 'dev0')]);
      const B = del(id, 'B-edit', 20, 'devB', 30, 'devB'), A = del(id, 'c5', 5, 'dev0', 100, 'devA');
      for (const w of order) await push([w === 'A' ? A : B]);
      ok(what(await row('session', id)) === 'in Recently deleted (B-edit)', L(`deleted on both phones (one after an edit), sent ${order}: deleted (REV31 B2)`), await row('session', id));
    }
    for (const order of ['BA', 'AB']) {
      // Two phones edit in the same millisecond and each deletes its own copy; the delete of the copy the account kept was made first.
      const id = 'ms' + order; await push([S(id, 'c5', 5, 'dev0')]);
      const A = del(id, 'A-edit', 20, 'devA', 30, 'devA'), B = del(id, 'B-edit', 20, 'devB', 25, 'devB');
      for (const w of order) await push([w === 'A' ? A : B]);
      ok(what(await row('session', id)) === 'in Recently deleted (B-edit)', L(`edited on two phones in one millisecond and deleted on both, sent ${order}: deleted, by the mark that names the copy kept (its time and its device)`), await row('session', id));
    }
    for (const order of ['new, old', 'old, new']) {
      // Two marks that name the same copy: the day shown and the put-aside flag are the kept mark's, not the last sent.
      const id = 'day' + order.length + order[0]; await push([S(id, 'c5', 5, 'dev0')]);
      const later = S(id, 'c5', 5, 'dev0', { gone_saw: 5, gone_saw_dev: 'dev0', gone_t: 30, gone_dev: 'devA', gone_good: false, gone_day: '2026-11-22', gone_clash: false });
      const earlier = S(id, 'c5', 5, 'dev0', { gone_saw: 5, gone_saw_dev: 'dev0', gone_t: 20, gone_dev: 'devB', gone_good: false, gone_day: '2026-11-20', gone_clash: true });
      for (const w of order.split(', ')) await push([w === 'new' ? later : earlier]);
      const got = await row('session', id);
      ok(got.gone_day === '2026-11-22' && got.gone_clash === false && got.gone_t === 30, L(`two marks of one copy, sent ${order}: the day and the put-aside flag stay with the mark kept`), got);
    }
    {
      // What a copy was made over is kept with the copy kept, not with a write the account did not take.
      await push([S('ov', 'c9', 9, 'devA', { over_t: 5, over_dev: 'dev0' })]);
      // An earlier copy sent with a mark the account takes: the row changes (its mark), the copy and what it was made over do not.
      await push([S('ov', 'c7', 7, 'devB', { over_t: 1, over_dev: 'devX', gone_saw: 7, gone_saw_dev: 'devB', gone_t: 40, gone_dev: 'devB' })]);
      const got = (await R.admin(`select over_t, over_dev from public.${T} where id = 'ov'`))[0];
      ok(Number(got.over_t) === 5 && got.over_dev === 'dev0' && what(await row('session', 'ov')) === 'in the log (c9)', L('an earlier edit not taken, sent with a mark that is, leaves the kept copy and what it was made over as they were'), got);
    }
    await push([S('q1', 'c', 1000, 'dev0')]);
    await push([del('q1', 'A-edit', 1001, 'devA', 1002, 'devA')]); await push([S('q1', 'B-edit', 1001, 'devB')]);
    ok(what(await row('session', 'q1')) === 'in the log (B-edit)', L('an edit with the same time on another phone is not the copy the mark names (REV31 S1)'));
    await push([S('g1', 'c5', 5, 'devA')]); await push([del('g1', 'c5', 5, 'devA', 6, 'devA')]); await push([del('g1', 'c5', 5, 'devA', 7, 'devA', true)]);
    ok(what(await row('session', 'g1')) === 'deleted for good' && (await row('session', 'g1')).sum === null, L('deleted for good drops the copy'));
    await push([S('g1', 'c5', 5, 'devA')]); await push([del('g1', 'c5', 5, 'devA', 99, 'devZ')]);
    ok(what(await row('session', 'g1')) === 'deleted for good', L('neither the same copy sent again nor a later not-for-good mark of that copy undoes it'));
    await push([del('g1', 'c5', 8, 'devA', 9, 'devA')]);
    ok(what(await row('session', 'g1')) === 'in Recently deleted (c5)', L('its Undo, a new copy with a new mark: in Recently deleted'));
    ok(!!(await push([S('n1', 'live', 0, '', { gone_saw: 0 })])).err, L('a mark must name a time and a device together'));
    await push([S('z1', 'on A', 0, '')]); await push([S('z1', 'on B', 0, '')]);
    await push([S('z2', 'on B', 0, '')]); await push([S('z2', 'on A', 0, '')]);
    ok((await row('session', 'z1')).body === 'on B' && (await row('session', 'z2')).body === 'on B', L('two copies with no time: the same one kept in either order'));
    // The workout in progress: written only over the copy it was merged with (S-12), Finish whole or not at all (R-2).
    const D = (body, t, dev, ot, od) => ({ kind: 'draft', id: 'draft', body, t, dev, over_t: ot, over_dev: od });
    await push([D('W:[s1]', 100, 'devA')]);
    r = await push([D('W:[s1,b1]', 110, 'devB', 100, 'devA')]);
    ok(r.rows && r.rows[0].took, L('a workout write over the copy held is taken'), r);
    r = await push([S('W', 'session W:[s1,a1]', 120, 'devA'), D('null', 120, 'devA', 100, 'devA')]);
    ok(r.err && /rows_draft_stale/.test(r.err) && !(await row('session', 'W')), L('Finish over a stale workout is refused whole: the session is not saved (REV31 S3)'), r);
    const fin = [S('W', 'session W:[s1,a1,b1]', 130, 'devA'), D('null', 130, 'devA', 110, 'devB')];
    r = await push(fin); const top1 = r.top; r = await push(fin);
    ok(!r.err && r.top === top1, L('after the merge Finish is taken; the same Finish sent again changes nothing and is not stale'), r);
    r = await push([D('W2', 125, 'devB', 130, 'devA')]);
    ok(r.err && /rows_draft_time/.test(r.err), L('a workout write that names the copy held but carries no later time is refused'), r);
    // The guarded write.
    r = await push([{ kind: 'meta', id: 'layout', body: '{"phase":2}', t: 1, dev: 'devA' }], 1);
    ok(r.err && /rows_moved/.test(r.err), L('a guarded write with a stale top is refused'), r);
    const top = (await pull(1e9)).top;
    r = await push([{ kind: 'meta', id: 'layout', body: '{"phase":2}', t: 1, dev: 'devA' }], top);
    ok(!r.err && r.layout === '{"phase":2}', L('with the top just read it is taken, and every answer carries the layout'), r);
    // Pull.
    let p = await pull(0, 5);
    ok(p.rows.length === 5 && p.rows.every((x, i, a) => !i || x.seq > a[i - 1].seq) && p.top === (await pull(0)).top, L('pull pages in seq order and reports the top'));
    const all = await R.rows('v', T);
    let got = 0, since = 0; for (;;) { p = await pull(since, 7); got += p.rows.length; if (!p.rows.length) break; since = p.rows[p.rows.length - 1].seq; }
    ok(got === all.length, L('paging to the end reads every row once'), { got, all: all.length });
    p = await pull(since); ok(p.rows.length === 0 && p.top === since && p.layout === '{"phase":2}', L('nothing changed: an empty answer, the top where the phone is, the layout with it'), p);
    ok(new Set(all.map(x => x.seq)).size === all.length, L('no two rows share a number'));
    // The digest and the list.
    const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
    const mine = md5([...all].sort((x, y) => cmp(x.kind, y.kind) || cmp(x.id, y.id)).map(x => [x.kind, x.id, x.t, x.dev, x.a, (x.sum ?? '').slice(0, 12), x.gone_saw ?? '', x.gone_saw_dev ?? '', x.gone_good ? 1 : 0].join('\x1f')).join('\x1e'));
    const dg = await R.call('v', T, 'digest');
    ok(dg.n === all.length && dg.sum === mine && dg.top === since, L('one digest of the whole account equals the one a phone works out from the same rows'), dg);
    await push([S('s2', '{"b":"e"}', 12, 'devA')]);
    ok((await R.call('v', T, 'digest')).sum !== mine, L('and differs once any row differs'));
    const l1 = await R.call('v', T, 'list', [0, 10]), l2 = await R.call('v', T, 'list', [l1[9].seq, 1000]);
    ok(l1.length === 10 && l1.length + l2.length === all.length && [...l1, ...l2].every((x, i, a) => !i || a[i - 1].seq < x.seq) && l1[0].body === undefined && l1[0].sum !== undefined, L('the list pages by change number, in order, with no copies'));
    {
      // Deleted for good is part of the checksum: a row in Recently deleted and the same row deleted for good do not read alike.
      await push([S('dg', 'c', 5, 'dev0')]); await push([del('dg', 'c', 5, 'dev0', 30, 'devA')]);
      const before = (await R.call('v', T, 'digest')).sum;
      await push([del('dg', 'c', 5, 'dev0', 30, 'devA', true)]);
      const rowsNow = await R.rows('v', T);
      const phone = md5([...rowsNow].sort((x, y) => cmp(x.kind, y.kind) || cmp(x.id, y.id)).map(x => [x.kind, x.id, x.t, x.dev, x.a, (x.sum ?? '').slice(0, 12), x.gone_saw ?? '', x.gone_saw_dev ?? '', x.gone_good ? 1 : 0].join('\x1f')).join('\x1e'));
      const after = await R.call('v', T, 'digest');
      const flipped = md5([...rowsNow].sort((x, y) => cmp(x.kind, y.kind) || cmp(x.id, y.id)).map(x => [x.kind, x.id, x.t, x.dev, x.a, (x.sum ?? '').slice(0, 12), x.gone_saw ?? '', x.gone_saw_dev ?? '', 0].join('\x1f')).join('\x1e'));
      ok(after.sum === phone && after.sum !== before && after.sum !== flipped, L('the checksum tells a row deleted for good from one in Recently deleted'), { after: after.sum, phone, before, flipped });
    }
    // What a phone cannot do.
    const V = R.uuidOf('v');
    ok(!(await R.tryAs('v', `delete from public.${T} where id = 'e1'`)).ok, L('DELETE is not granted to the signed-in account (REV31 S11)'));
    ok(/rows_key/.test((await R.tryAs('v', `update public.${T} set id = 'zz' where id = 'e1'`)).err || ''), L('a change of key is refused'));
    ok(!(await R.tryAs('v', `update public.${T} set sum = 'x' where id = 'e1'`)).ok, L('the checksum cannot be written by a phone'));
    r = await R.tryAs('v', `update public.${T} set seq = 1 where id = 'e1' returning seq`);
    ok(r.ok && r.rows.length === 0, L('a write that changes only seq changes nothing'), r);
    r = await R.tryAs('v', `update public.${T} set t = 1, body = 'older' where id = 'e1' returning body`);
    ok(r.ok && r.rows.length === 0 && (await row('session', 'e1')).body === 'y', L('a direct update with an earlier time changes nothing'), r);
    ok(!!(await push([S('u1', 'x', 1, 'dév')])).err, L('a device id outside ASCII is refused'));
    ok(/second time/.test((await push([S('k1', 'x', 1, 'a'), S('k1', 'y', 2, 'a')])).err || ''), L('the same key twice in one push fails the push'));
    r = await R.tryAs('v', `begin isolation level repeatable read; insert into public.${T} (kind, id, body) values ('session', 'iso', 'x'); commit;`);
    await R.admin('rollback').catch(() => {});
    ok(/rows_isolation/.test(r.err || ''), L('a write outside read committed is refused'), r);
    // S-32: own rows only; nothing signed out.
    ok((await pull(0, 500, 'f')).rows.length === 0 && (await R.call('f', T, 'digest')).n === 0 && (await R.call('f', T, 'list', [0])).length === 0, L("another account's pull, digest and list read none of these rows"));
    r = await push([S('s1', 'F', 1, 'devF')], undefined, 'f');
    ok(!r.err && r.rows[0].was_t === null && r.top === 1 && (await row('session', 's1')).body === '{"a":3}', L("another account's push of the same key makes its own row, numbered from 1, and learns nothing"), r);
    ok(!(await R.tryAs('f', `insert into public.${T} (user_id, kind, id, body) values ('${V}', 'session', 'evil', 'x')`)).ok, L('a row cannot be written for someone else'));
    ok(!(await R.tryAs('f', `update public.${T} set body = 'x' where user_id = '${V}' returning id`)).rows?.length, L("another account's update reaches none of these rows"));
    const out = [await push([S('s1', 'x', 1, 'a')], undefined, null), await pull(0, 500, null), await R.call(null, T, 'digest').catch(e => ({ err: e.code })), await R.tryAs(null, `select 1 from public.${T}`)];
    ok(out.slice(0, 3).every(x => x.err) && !out[3].ok, L('signed out: no table, no push, no pull, no digest'), out);
    if (quick) { await R.close(); return; }
    // The limits: 20,000 rows and 25 MB an account, 1 MB a row.
    const many = Array.from({ length: 19999 }, (_, i) => S('r' + i, 'x', 1, 'a'));
    for (let i = 0; i < many.length; i += 5000) await push(many.slice(i, i + 5000), undefined, 'big');
    ok(!(await push([S('last', 'x', 1, 'a')], undefined, 'big')).err, L('the 20,000th row is taken'));
    ok(/rows_limit/.test((await push([S('over1', 'x', 1, 'a'), S('over2', 'x', 1, 'a')], undefined, 'big')).err || ''), L('a push past 20,000 rows is refused whole'));
    r = await push([S('r5', 'y', 2, 'a')], undefined, 'big'); ok(!r.err && r.rows[0].took, L('at the limit an existing row can still be changed'));
    ok(!!(await push([S('huge', 'x'.repeat(1048577), 1, 'a')], undefined, 'f')).err, L('a row over 1 MB is refused'));
    {
      // 25 MB an account: 24 rows of 1 MB are taken, the 26th megabyte refused, as a new row and as a change of one held.
      const mb = 'y'.repeat(1048576);
      let bad = '';
      for (let i = 0; i < 25 && !bad; i++) { const a = await push([S('m' + i, mb, 1, 'a')], undefined, 'mb'); if (a.err) bad = `row ${i}: ${a.err}`; }
      ok(!bad, L('25 rows of 1 MB each are taken'), bad);
      ok(/rows_limit/.test((await push([S('m25', 'y'.repeat(1000), 1, 'a')], undefined, 'mb')).err || ''), L('a new row past 25 MB an account is refused'));
      await push([S('small', 'z', 1, 'a'), S('small2', 'z'.repeat(1000), 1, 'a')], undefined, 'mb2');
      for (let i = 0; i < 24; i++) await push([S('m' + i, mb, 1, 'a')], undefined, 'mb2');
      ok(/rows_limit/.test((await push([S('small', 'z'.repeat(1048576), 2, 'a')], undefined, 'mb2')).err || ''), L('and so is a change that takes a held row past it'));
    }
    await R.close();
  };
  // SQL_PART=replay runs the order replay and the broken copies alone (a quicker run while working on them).
  for (const T of process.env.SQL_PART === 'replay' ? [] : ['records', 'records_preview']) await behaviours(T, null, false);
  /* R-4: order never matters. Random histories of one record on three phones (edits, the app's own writes, deletes,
     restores, "Deleted for good" and its Undo, clocks apart), every row a phone sent kept, then replayed to a fresh
     row in five other orders with some sent twice: every order must end as the same row. */
  const replay = async (sql, N, stopAtFirst) => {
    const R = await rowsDb(sql ? { sql } : {}), T = 'records';
    const cols = ['body', 't', 'dev', 'a', 'gone_saw', 'gone_saw_dev', 'gone_good', 'gone_t', 'gone_dev'];
    const get = async (who, id) => (await R.rows(who, T)).find(x => x.id === id);
    const pushRow = async (who, id, s) => { await R.call(who, T, 'push', [[{ kind: 'session', id, ...s }]]); return get(who, id); };
    const pick = r => Object.fromEntries(cols.map(c => [c, r[c] === null || r[c] === undefined ? null : r[c]]));
    const key = r => JSON.stringify(pick(r));
    const rng = seed => { let x = seed >>> 0 || 1; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); };
    let bad = 0, first = null, sentTotal = 0, noCopy = 0;
    for (let h = 0; h < N; h++) {
      const who = 'h' + h, rnd = rng(1000 + h);
      // Clocks apart in two histories of three; the same on every phone in the third.
      const offs = h % 3 === 2 ? [0, 0, 0] : [0, -Math.floor(rnd() * 900), Math.floor(rnd() * 900)];
      let now = 1000;
      const phones = [0, 1, 2].map(i => ({ dev: 'dev' + 'ABC'[i], off: offs[i], seen: 0, s: null, undo: null }));
      const sent = [], story = [];
      const stamp = p => { const t = Math.max(now + p.off, p.seen + 1); p.seen = t; return t; };
      const see = (p, s) => { if (s) p.seen = Math.max(p.seen, Number(s.t) || 0, Number(s.gone_t) || 0); };
      const named = s => s.gone_saw !== null && s.gone_saw === s.t && s.gone_saw_dev === s.dev;
      const live = s => s && s.body !== null && !named(s);
      const trashed = s => s && s.body !== null && named(s) && !s.gone_good;
      { const p = phones[0]; p.s = { body: 'c0', t: stamp(p), dev: p.dev, a: 0, gone_t: 0, gone_dev: '', gone_saw: null, gone_saw_dev: null, gone_good: false }; }
      const sync = async (p, i) => {
        if (p.s) sent.push({ ...p.s });
        const r = p.s ? await pushRow(who, 'x', p.s) : await get(who, 'x');
        if (r) { p.s = pick(r); see(p, p.s); if (p.s.body === null && !(named(p.s) && p.s.gone_good)) noCopy++; }
        story.push('ABC'[i] + ' syncs');
      };
      for (let i = 0; i < 3; i++) await sync(phones[i], i);
      for (let step = 0; step < 14; step++) {
        // The clock stands still for some steps, so two phones change the record in the same millisecond, and their copies and marks differ by the device alone.
        if (rnd() < 0.6) now += 10;
        const i = Math.floor(rnd() * 3), p = phones[i], s = p.s, r = rnd();
        if (r < 0.3) { await sync(p, i); continue; }
        if (!s) continue;
        if (live(s)) {
          if (r < 0.46) { p.s = { ...s, body: s.body + '+app' + 'ABC'[i], a: s.a + 1 }; story.push('ABC'[i] + ' app write'); }
          else if (r < 0.7) { p.s = { ...s, body: `e${step}${'ABC'[i]}`, t: stamp(p), dev: p.dev, a: 0 }; story.push('ABC'[i] + ' edits'); }
          else { p.s = { ...s, gone_saw: s.t, gone_saw_dev: s.dev, gone_t: stamp(p), gone_dev: p.dev, gone_good: false }; story.push('ABC'[i] + ' deletes'); }
        } else if (trashed(s)) {
          if (r < 0.67) { p.s = { ...s, t: stamp(p), dev: p.dev, a: 0 }; story.push('ABC'[i] + ' restores'); }
          else { p.undo = s.body; p.s = { ...s, body: null, gone_t: stamp(p), gone_dev: p.dev, gone_good: true }; story.push('ABC'[i] + ' deletes for good'); }
        } else if (s.gone_good && p.undo !== null && named(s) && r < 0.8) {
          const t = stamp(p); p.s = { ...s, body: p.undo, t, dev: p.dev, a: 0, gone_saw: t, gone_saw_dev: p.dev, gone_t: stamp(p), gone_dev: p.dev, gone_good: false };
          p.undo = null; story.push('ABC'[i] + ' undoes "Deleted for good"');
        }
      }
      for (let k = 0; k < 2; k++) for (let i = 0; i < 3; i++) await sync(phones[i], i);
      const agreed = new Set(phones.map(p => key(p.s))).size === 1;
      sentTotal += sent.length;
      const ends = [];
      for (let k = 0; k < 6; k++) {
        const order = sent.map((_, j) => j);
        if (k) { for (let j = order.length - 1; j > 0; j--) { const m = Math.floor(rnd() * (j + 1)); [order[j], order[m]] = [order[m], order[j]]; } order.push(order[0], order[Math.floor(rnd() * order.length)]); }
        for (const j of order) await pushRow(who, 'k' + k, sent[j]);
        ends.push(key(await get(who, 'k' + k)));
      }
      if (new Set(ends).size > 1 || !agreed) { bad++; if (!first || sent.length < first.sent) first = { seed: h, sent: sent.length, story: story.join(', '), ends: [...new Set(ends)], agreed }; if (stopAtFirst) break; }
    }
    await R.close();
    return { bad, noCopy, first, sentTotal };
  };
  {
    const N = Number(process.env.SQL_ORDERS || 120);
    const { bad, noCopy, first, sentTotal } = await replay(null, N, false);
    ok(bad === 0 && noCopy === 0, `R-4: ${N} random histories of one record on three phones, ${sentTotal} rows sent, each history replayed in five other orders: every order ends as the same row, and no row is ever in the log with no copy`, first || { noCopy });
  }
  /* This suite is trusted only because it fails on the SQL with a joining rule broken: each rule below is taken out
     of a copy of the SQL, and a behaviour above must then fail, or the same histories end differently in some order. */
  {
    const real = rowsSql();
    // The joining rules are the rows' tables' (the live one and the preview's); the documents and their guard are left as they are.
    const swap = (from, to) => { const out = {}; for (const k of ['records', 'records_preview']) { if (!real[k].includes(from)) throw new Error('the SQL no longer holds the text a broken copy replaces: ' + from.slice(0, 60)); out[k] = real[k].split(from).join(to); } return out; };
    const BROKEN = {
      'a mark ordered by its own time, not by the copy it names':
        swap(`if not ((coalesce(new.gone_saw, -1), coalesce(new.gone_saw_dev, ''), new.gone_good, new.gone_t, new.gone_dev)
          > (coalesce(cur.gone_saw, -1), coalesce(cur.gone_saw_dev, ''), cur.gone_good, cur.gone_t, cur.gone_dev)) then`,
        `if not ((new.gone_t, new.gone_dev, coalesce(new.gone_saw, -1), coalesce(new.gone_saw_dev, ''), new.gone_good)
          > (cur.gone_t, cur.gone_dev, coalesce(cur.gone_saw, -1), coalesce(cur.gone_saw_dev, ''), cur.gone_good)) then`),
      'a mark that names a copy by its time without its device':
        swap(`if not ((coalesce(new.gone_saw, -1), coalesce(new.gone_saw_dev, ''), new.gone_good, new.gone_t, new.gone_dev)
          > (coalesce(cur.gone_saw, -1), coalesce(cur.gone_saw_dev, ''), cur.gone_good, cur.gone_t, cur.gone_dev)) then`,
        `if not ((coalesce(new.gone_saw, -1), new.gone_good, new.gone_t, new.gone_dev)
          > (coalesce(cur.gone_saw, -1), cur.gone_good, cur.gone_t, cur.gone_dev)) then`),
      'two copies of one version decided by which arrived first':
        swap(`and (cur.body is null or (new.body is not null and new.body collate "C" > cur.body collate "C")) then null;`, `and cur.body is null then null;`),
      'the day and the put-aside flag of the mark sent kept with another mark':
        swap(`new.gone_t := cur.gone_t; new.gone_dev := cur.gone_dev; new.gone_day := cur.gone_day; new.gone_clash := cur.gone_clash;`, `new.gone_t := cur.gone_t; new.gone_dev := cur.gone_dev;`),
      'what a copy was made over taken from a write whose copy was not':
        swap(`new.a := cur.a; new.over_t := cur.over_t; new.over_dev := cur.over_dev;`, `new.a := cur.a;`),
      'the checksum of an account blind to deleted for good':
        swap(`|| chr(31) || (r.gone_good::int),`, `,`),
      'a copy taken whenever it arrives, whatever its version':
        swap(`else new.body := cur.body; new.t := cur.t; new.dev := cur.dev; new.a := cur.a; new.over_t := cur.over_t; new.over_dev := cur.over_dev;`, `else null;`)
    };
    for (const name of Object.keys(BROKEN)) {
      sink = [];
      let crashed = '';
      try { await behaviours('records', BROKEN[name], true); } catch (e) { crashed = String((e && e.message) || e); }
      const failed = sink; sink = null;
      const r = failed.length || crashed ? null : await replay(BROKEN[name], Number(process.env.SQL_BROKEN_ORDERS || 60), true);
      ok(failed.length > 0 || !!crashed || r.bad > 0 || r.noCopy > 0, `the suite fails on the SQL with one rule broken: ${name} (${failed.length ? failed.length + ' behaviours, the first: ' + failed[0].replace('records: ', '') : crashed ? 'crashed: ' + crashed.slice(0, 80) : r.bad ? 'the replay' : 'nothing failed'})`);
    }
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
