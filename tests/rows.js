// The account's rows, first phase (2.78): the documents decide what the log is and the app makes the account's rows
// say the same, record by record. Run in Node: phones made of the app's own modules (tests/sim.js) against the SQL
// of SUPABASE.md, Part 8, on PGlite (tests/rowsdb.js), through whole histories (tests/simlib.js).
//   1. The mirror, case by case: what the rows hold after each thing a lifter does, on one phone and on two.
//   2. What the rows never do: change the log or the documents, ask anything of an account with no table, write
//      when nothing changed.
//   3. The cost at three years of training.
//   4. Histories written from seeds, on two and on three phones, checked against the lifter's rules.
//   5. The histories are trusted because they find, on the source of 2.76, the losses the reviews of 2.76 and 2.77
//      found by hand (tests/sim-cases.json keeps the shortest history of each), and because a copy of the rows
//      module with one rule broken fails.
//   ROWS_SEEDS=200 node tests/rows.js     more histories (default 40 with rows, 120 without)
//   ROWS_PART=mirror|cost|seeds|old|broken node tests/rows.js     one part alone
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { history, told } = require('./simlib');
const { phoneOf } = require('./sim');
const { rowsDb, LIST } = require('./rowsdb');
const ROOT = path.join(__dirname, '..');
const PART = process.env.ROWS_PART || '';
const part = name => !PART || PART === name;
const fails = [];
const ok = (c, m, x) => { if (!c) fails.push(m); console.log((c ? 'ok   ' : 'FAIL ') + m + (c || x === undefined ? '' : ' ' + JSON.stringify(x).slice(0, 900))); return !!c; };
// The source of 2.76 (build r122), the last build before a session's move between documents was handled.
const OLD = '13f77cdf1d6c1d993b4a7edd9d35104dd65d69e5';
// The source of 2.77.1 (build r124), the build before the rows: a phone that has not updated yet.
const BEFORE = 'a90bfabc59c70793de70a0137cf3885f8f3c7e53';
/** The app's source at commit `sha`, unpacked once into the temporary directory; fetched when this clone does not hold the commit. */
function sourceAt(sha) {
  const dir = path.join(os.tmpdir(), 'ironlog-src-' + sha.slice(0, 10));
  if (fs.existsSync(path.join(dir, 'src', 'app', 'sync.ts'))) return dir;
  const git = a => execFileSync('git', a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  try { git(['cat-file', '-e', sha + '^{commit}']); } catch (e) { git(['fetch', '--quiet', '--depth', '1', 'origin', sha]); }
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('tar', ['-x', '-C', dir], { input: git(['archive', sha, 'src/app']) });
  return dir;
}
/** A copy of this checkout's source with `from` replaced by `to` in src/app/rows.ts: the rows module with one rule broken. */
function brokenCopy(name, from, to) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-broken-'));
  fs.cpSync(path.join(ROOT, 'src', 'app'), path.join(dir, 'src', 'app'), { recursive: true });
  const f = path.join(dir, 'src', 'app', 'rows.ts'), text = fs.readFileSync(f, 'utf8');
  if (!text.includes(from)) throw new Error(`rows.ts no longer holds the text the broken copy "${name}" replaces`);
  fs.writeFileSync(f, text.split(from).join(to));
  return dir;
}
let accounts = 0;
const acct = () => 'a' + ++accounts;
const said = r => [...r.fails.map(f => f.rule + ': ' + f.said), ...r.errors];
const diag = P => (P.E.rowsDiag() || { line: '', findings: [] });
const pushesOf = (C, who, from = 0) => C.calls.slice(from).filter(c => c.who === who && c.name === 'push').flatMap(c => c.keys);

/* ---------- 1. the mirror, case by case: each answers with what went wrong, nothing when right ---------- */
const CASES = {
  /* Everything a lifter does on two phones, with the rows compared with the log each time both have synced
     (simlib's rule `rows`), across a night so the daily check runs twice. */
  async 'the rows say what the log says after each thing a lifter does'(dir, R) {
    const S = (p, op, more) => ({ p, op, ...more });
    const r = await history({ dirs: [dir, dir], rows: R, name: acct(), script: [
      S(0, 'check'), S(0, 'note', { id: 's1', v: 'typed on A' }), S(0, 'check'),
      S(0, 'del', { id: 's2' }), S(0, 'check'), S(0, 'restore', { id: 's2' }), S(0, 'check'),
      S(1, 'del', { id: 's3' }), S(1, 'forgood', { id: 's3' }), S(1, 'check'),
      S(0, 'start', { id: 'k1', v: '2026-11-20' }), S(0, 'tick', { i: 0 }), S(1, 'check'), S(1, 'tick', { i: 1 }), S(0, 'check'), S(0, 'finish'), S(0, 'check'),
      S(1, 'note', { id: 's4', v: 'typed on B' }), S(1, 'move', { id: 's1', v: '2026-10-27' }), S(0, 'check'),
      S(0, 'bw', { id: 'w9', v: 81.5, d: '2026-11-20' }), S(0, 'cardio', { id: 'c1', v: 'easy' }), S(1, 'set', { v: 'V' }), S(0, 'add', { id: 'x1', v: '2025-12-30' }), S(1, 'check'),
      S(0, 'del', { id: 's4' }), S(0, 'check'), S(0, 'wait', { ms: 26 * 3600000 }),
      // The next day, with no signal: put back and deleted again. Recently deleted shows the new day, and so must the row.
      S(0, 'off'), S(0, 'restore', { id: 's4' }), S(0, 'del', { id: 's4' }), S(0, 'on'), S(0, 'check')
    ] });
    const out = said(r);
    // Phone B deleted a session for good: on phone A it left the log by a sync, which A counts; nothing left B's that way.
    for (const [P, removed] of [[r.phones[0], 1], [r.phones[1], 0]]) {
      const d = diag(P);
      if (d.line !== `Rows check: 2 clean days, 0 differences, ${removed} removed by a sync`) out.push(`${P.name} says "${d.line}" after two days with nothing wrong`);
      if (d.findings.length) out.push(`${P.name} recorded ${d.findings.length} findings: ${d.findings[0].why}`);
    }
    const rows = await r.C.rows();
    if (!rows.some(x => x.kind === 'meta' && x.id === 'layout' && /"decides":"docs"/.test(x.body) && /"level":1/.test(x.body))) out.push('the account has no layout row that says the documents decide');
    if (rows.filter(x => x.kind === 'device').length !== 2) out.push('the account does not hold one device row a phone');
    return out;
  },
  /* A second phone reads the account's list, finds its log already there, and sends its own device row and nothing else. */
  async 'a second phone finds the log already in the rows and sends none of it again'(dir, R) {
    const r = await history({ dirs: [dir, dir], rows: R, name: acct(), script: [{ p: 0, op: 'check' }] });
    const out = said(r), sent = pushesOf(r.C, 'B');
    if (!r.C.calls.some(c => c.who === 'B' && c.name === 'list')) out.push('phone B never read the list');
    if (sent.some(k => !k.startsWith('device/'))) out.push('phone B sent rows the account already held: ' + sent.filter(k => !k.startsWith('device/')).slice(0, 4).join(', '));
    // A third phone, later, with a session in Recently deleted and one deleted for good in the account by then.
    for (const x of [{ p: 0, op: 'del', id: 's2' }, { p: 0, op: 'del', id: 's3' }, { p: 0, op: 'forgood', id: 's3' }, { p: 0, op: 'check' }]) await r.run(x);
    const from = r.C.calls.length;
    const C3 = phoneOf(dir, { name: 'C', clock: r.clock, seed: 9 }).start(); C3.signIn(r.C); await C3.sync(); await C3.sync();
    const late = pushesOf(r.C, 'C', from).filter(k => !k.startsWith('device/'));
    if (late.length) out.push('the third phone sent rows the account already held: ' + late.slice(0, 4).join(', '));
    if (diag(C3).line !== 'Rows check: 1 clean day, 0 differences, 0 removed by a sync') out.push(`the third phone says "${diag(C3).line}"`);
    out.push(...said(r));
    return out;
  },
  /* A session added on A: A writes its document, then its row. B, whose documents are behind (no read since), saves
     a change of its own, and its pass reads A's new row, which its log does not hold. B must leave it alone: a row
     the account just changed may be ahead of the documents B holds. Marked deleted, it would stay so for a minute. */
  async "a row ahead of the documents a phone holds is left alone"(dir, R) {
    const r = await history({ dirs: [dir, dir], rows: R, name: acct(), script: [{ p: 0, op: 'check' }] });
    const [A, B] = r.phones, out = [];
    await r.run({ p: 0, op: 'add', id: 'x9', v: '2026-11-20' }); await A.flush();
    const from = r.C.calls.length;
    await r.run({ p: 1, op: 'note', id: 's4', v: 'typed on B' }); await B.flush();
    const sent = pushesOf(r.C, 'B', from), row = (await r.C.rows()).find(x => x.kind === 'session' && x.id === 'x9');
    if (!sent.includes('session/s4')) out.push("phone B did not send its own edit's row");
    if (sent.includes('session/x9')) out.push('phone B sent a row for the session it has not read yet');
    if (!row || row.body === null || row.gone_saw !== null) out.push('the new session\'s row is not as phone A wrote it');
    if (!/1 waiting$/.test(diag(B).line)) out.push(`phone B says "${diag(B).line}", not that one record waits`);
    await r.check();
    out.push(...said(r));
    for (const P of r.phones) if (diag(P).findings.length || / waiting$/.test(diag(P).line)) out.push(`${P.name} ends with "${diag(P).line}" and ${diag(P).findings.length} findings`);
    return out;
  },
  /* The account holds a later version of a session than the documents kept (as if the documents had decided against
     the order of the times). The phone waits a minute and a whole read of the documents, then sends the log's copy
     over it with a new time, and records the difference. */
  async "a row the documents decided against is sent over, and the difference recorded"(dir, R) {
    const name = acct(), r = await history({ dirs: [dir, dir], rows: R, name, script: [{ p: 0, op: 'check' }] });
    const out = [], A = r.phones[0];
    await R.call(name, 'records', 'push', [[{ kind: 'session', id: 's1', body: '{"id":"s1","notes":"not what the documents hold"}', t: r.clock.t + 5000, dev: 'dev-other', a: 0 }]]);
    await r.run({ p: 0, op: 'note', id: 's2', v: 'typed on A' }); await A.flush();
    // A second change a few seconds on: the row has waited less than a minute and is still left alone.
    await r.run({ p: 0, op: 'note', id: 's2', v: 'typed again on A' }); await A.flush();
    const row = (await r.C.rows()).find(x => x.id === 's1');
    if (!/not what the documents hold/.test(row.body)) out.push('the phone wrote over the later row with no wait');
    await r.check();
    out.push(...said(r));
    const f = r.phones.flatMap(P => diag(P).findings).filter(x => x.key === 'session/s1');
    if (f.length !== 1 || !/sent over it/.test(f[0].why)) out.push('the difference was not recorded once: ' + JSON.stringify(f.map(x => x.why)));
    if (!r.phones.some(P => /1 difference,/.test(diag(P).line))) out.push('no phone counts the difference: ' + r.phones.map(P => diag(P).line).join(' | '));
    return out;
  },
  /* The account's layout asks for a newer build (as the release that switches an account to its rows will write):
     this build stops syncing, says to update, writes nothing more to the account, and keeps the lifter's changes. */
  async 'an account that asks for a newer build: the phone stops syncing and says to update'(dir, R) {
    const out = [];
    for (const want of [{ decides: 'docs', level: 2 }, { decides: 'rows', level: 1 }]) {
      const name = acct(), r = await history({ dirs: [dir, dir], rows: R, name, script: [{ p: 0, op: 'check' }] });
      const [A, B] = r.phones, tag = JSON.stringify(want) + ': ';
      const layout = JSON.parse((await r.C.rows()).find(x => x.kind === 'meta').body);
      await R.call(name, 'records', 'push', [[{ kind: 'meta', id: 'layout', body: JSON.stringify({ ...layout, ...want, gen: 2 }), t: r.clock.t + 1000, dev: 'dev-new', a: 0 }]]);
      const writes = r.C.writes.length, rows = JSON.stringify(await r.C.rows());
      await r.run({ p: 0, op: 'note', id: 's1', v: 'typed after the switch' });
      r.clock.t += 61000; await A.tick(); await A.sync(); await A.sync(); await B.sync(); await B.sync();
      for (const P of [A, B]) if (P.E.cloud.status !== 'offline' || P.E.cloud.err !== P.E.ROWS_UPDATE) out.push(`${tag}phone ${P.name} reads "${P.E.cloud.status}: ${P.E.cloud.err}", not that it must be updated`);
      /* A's change may go out with the sync during which the layout was read; nothing is written after that sync. */
      const after = r.C.writes.length;
      await r.run({ p: 0, op: 'note', id: 's2', v: 'typed later' }); r.clock.t += 61000; await A.tick(); await A.sync();
      if (r.C.writes.length !== after) out.push(tag + 'a document was written after the phone said to update');
      if (JSON.stringify(await r.C.rows()) !== rows) out.push(tag + 'a row was written by a build the account asks more of');
      if (A.state().sessions.find(s => s.id === 's2').notes !== 'typed later') out.push(tag + 'the change made after the stop is not in the log on the phone');
      if (after - writes > 1) out.push(tag + `${after - writes} documents were written after the layout changed`);
      if (!/needs a newer version/.test(diag(A).line)) out.push(tag + `Settings says "${diag(A).line}"`);
    }
    return out;
  },
  /* The notes the phone keeps of the account's rows are wrong (here: a row of another phone gone from them): the
     daily check finds it by the account's one checksum, makes the notes again from the account, and says so. No row changes. */
  async 'notes that are not what the account holds are found by the daily check and made again'(dir, R) {
    const r = await history({ dirs: [dir, dir], rows: R, name: acct(), script: [{ p: 0, op: 'check' }] });
    const out = [], A = r.phones[0];
    // Phone A reads the rows again (it has a change to send), so its notes hold phone B's device row.
    await r.run({ p: 0, op: 'note', id: 's1', v: 'typed' }); await A.flush();
    const N = A.rowNotes(), other = Object.keys(N.rows).find(k => k.startsWith('device/') && !k.endsWith(A.E.cloud.devId));
    if (!other) return ['phone A holds no note of the other phone\'s device row'];
    delete N.rows[other];
    // The app closed and opened again on the changed notes, the next day.
    const A2 = phoneOf(dir, { name: 'A', clock: r.clock, storage: new Map([...A.ls.entries()].map(([k, v]) => [k, k.endsWith('.rows') ? JSON.stringify(N) : v])), seed: 7 }).start();
    A.E.cloudStop();
    const before = JSON.stringify((await r.C.rows()).filter(x => x.kind !== 'device'));
    r.clock.t += 26 * 3600000; A2.signIn(r.C); await A2.sync(); await A2.sync();
    const d = diag(A2);
    if (!d.findings.some(f => /notes were not what the account holds; they were made again/.test(f.why))) out.push('the daily check did not find the notes wrong: ' + d.line);
    if (JSON.stringify((await r.C.rows()).filter(x => x.kind !== 'device')) !== before) out.push('a row changed while the notes were made again');
    if (!A2.rowNotes().rows[other]) out.push('the notes made again do not hold the row that was missing');
    r.clock.t += 26 * 3600000; await A2.sync(); await A2.sync();
    if (!/Rows check: 1 clean day, 1 difference,/.test(diag(A2).line)) out.push(`the day after, Settings says "${diag(A2).line}"`);
    return out;
  },
  /* Another phone writes a row at the very moment this phone writes its own, after this phone last read the rows.
     The phone's next read must start before that row, not after its own write: else its notes never hold it, and
     the next daily check finds the notes wrong. */
  async 'a row another phone wrote while this phone was writing is read at the next pass'(dir, R) {
    const name = acct(), r = await history({ dirs: [dir, dir], rows: R, name, script: [{ p: 0, op: 'check' }] });
    const out = [], A = r.phones[0];
    let once = true;
    A.hook = async (kind, when) => {
      if (kind !== 'rows-push' || when !== 'before' || !once) return;
      once = false;
      await R.call(name, 'records', 'push', [[{ kind: 'device', id: 'dev-third', body: '{"build":"a third phone"}', t: r.clock.t, dev: 'dev-third', a: 0 }]]);
    };
    await r.run({ p: 0, op: 'note', id: 's1', v: 'typed' }); await A.flush();
    A.hook = null;
    if (once) return ['phone A wrote no row'];
    r.clock.t += 26 * 3600000; await A.sync(); await A.sync();
    if (diag(A).line !== 'Rows check: 2 clean days, 0 differences, 0 removed by a sync') out.push(`the next day phone A says "${diag(A).line}"`);
    if (!A.rowNotes().rows['device/dev-third']) out.push("phone A's notes do not hold the third phone's row");
    return out;
  },
  /* "Sign out", then signed in again: the phone reads the list, finds its log there, and nothing in the account changes. */
  async '"Sign out" then signed in again changes nothing in the account'(dir, R) {
    const r = await history({ dirs: [dir, dir], rows: R, name: acct(), script: [{ p: 0, op: 'note', id: 's1', v: 'typed' }, { p: 0, op: 'check' }] });
    const out = [], A = r.phones[0];
    // The phone's own device row aside: it says how the phone's checks stand, which "Sign out" forgets.
    const kept = async () => JSON.stringify((await r.C.rows()).filter(x => x.kind !== 'device'));
    const rows = await kept(), docs = JSON.stringify(r.C.all('u')), from = r.C.calls.length;
    A.E.cloudStop(true);
    if (A.rowNotes()) out.push('the rows\' notes are still on the phone after "Sign out"');
    r.clock.t += 5000; A.signIn(r.C); await A.sync(); await A.sync();
    if ((await kept()) !== rows) out.push('a row changed');
    if (JSON.stringify(r.C.all('u')) !== docs) out.push('a document changed');
    const sent = pushesOf(r.C, 'A', from).filter(k => !k.startsWith('device/'));
    if (sent.length) out.push('the phone sent rows: ' + sent.slice(0, 4).join(', '));
    if (!r.C.calls.slice(from).some(c => c.who === 'A' && c.name === 'list')) out.push('the phone did not read the list');
    await r.check(); out.push(...said(r));
    return out;
  },
  /* A request that gets no answer, before the account applied it or after: the rows end right all the same, and the rows are not switched off. */
  async 'a write or a read of the rows that gets no answer is made again at the next sync'(dir, R) {
    const out = [];
    for (const [kind, when] of [['rows-push', 'before'], ['rows-push', 'after'], ['rows-pull', 'before'], ['rows-pull', 'after']]) {
      const r = await history({ dirs: [dir, dir], rows: R, name: acct(), script: [{ p: 0, op: 'check' }, { p: 0, op: 'drop', kind, when }, { p: 0, op: 'note', id: 's1', v: 'typed' }, { p: 0, op: 'del', id: 's2' }, { p: 0, op: 'check' }] });
      out.push(...said(r).map(x => `${kind} dropped ${when}: ${x}`));
      if (/off/.test(diag(r.phones[0]).line)) out.push(`${kind} dropped ${when}: the rows are off: ${diag(r.phones[0]).line}`);
    }
    return out;
  }
};

(async () => {
  const R = await rowsDb();
  if (part('mirror')) {
    {
      // The app's account code and the suites' database read the same columns of the list (a phone needs each to know a row).
      const asks = (/const LISTED = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'scripts', 'cloud-supabase.js'), 'utf8')) || [])[1];
      ok(asks === LIST, 'scripts/cloud-supabase.js reads the list with the columns the suites\' database gives a phone', { asks, LIST });
    }
    for (const name of Object.keys(CASES)) { const out = await CASES[name](ROOT, R); ok(out.length === 0, name, out.slice(0, 4)); }

    /* ---------- 2. what the rows never do ---------- */
    const script = (await history({ dirs: [ROOT, ROOT], seed: 77, steps: 50 })).script;
    const runs = {};
    for (const [how, rows] of [['none', null], ['missing', 'missing'], ['rows', R]]) runs[how] = await history({ dirs: [ROOT, ROOT], rows, name: acct(), script });
    const logs = r => JSON.stringify(r.phones.map(P => r.phones[0].E.canon({ ...P.state(), undo: null })));
    const docs = r => JSON.stringify(r.C.all('u'));
    ok(said(runs.rows).length === 0 && said(runs.none).length === 0, 'one history of 50 actions on two phones, with rows and without: the lifter\'s rules hold in both', [said(runs.rows), said(runs.none)]);
    ok(logs(runs.rows) === logs(runs.none) && docs(runs.rows) === docs(runs.none), 'with rows and without, the same history leaves the same log on each phone and the same documents in the account: the rows change neither');
    ok(logs(runs.missing) === logs(runs.none) && docs(runs.missing) === docs(runs.none), 'the same on an account whose rows\' SQL was never run');
    const asked = runs.missing.C.calls;
    ok(asked.length === 2 && asked.every(c => c.name === 'pull') && runs.missing.phones.every(P => P.E.rowsDiag() === null) && runs.missing.phones.every(P => !P.rowNotes()), 'an account with no rows table is asked once by each phone, then never again this visit; Settings shows no line and the phone keeps no notes', asked.map(c => c.who + ' ' + c.name));
    ok(runs.none.C.calls.length === 0 && runs.none.phones.every(P => P.E.rowsDiag() === null), 'a backend that knows no rows is never asked');
    {
      const r = runs.rows, [A, B] = r.phones, from = r.C.calls.length;
      r.clock.t += 5000; await A.sync(); await B.sync();
      const idle = r.C.calls.slice(from);
      ok(idle.every(c => c.name === 'pull') && idle.length === 2, 'a sync with nothing changed asks the account for its layout once and writes no row', idle.map(c => c.who + ' ' + c.name));
      // No workout open on either phone first, so the one started here is the only one.
      for (const p of [0, 1]) await r.run({ p, op: 'discard' });
      await r.check();
      const at = r.C.calls.length;
      await r.run({ p: 0, op: 'start', id: 'kq', v: '2026-11-20' }); await r.run({ p: 0, op: 'tick', i: 0 }); await r.run({ p: 0, op: 'tick', i: 1 });
      const ticks = r.C.calls.slice(at).filter(c => c.who === 'A');
      ok(ticks.filter(c => c.name === 'push').length === 3 && ticks.filter(c => c.name === 'push').every(c => c.keys.join() === 'draft/draft') && !ticks.some(c => c.name === 'list' || c.name === 'digest'), 'a set ticked costs one write of the workout\'s row and no read of the rows', ticks.map(c => c.name + ' ' + c.keys.join()));
    }
  }

  /* ---------- 3. the cost at three years ---------- */
  if (part('cost')) {
    const clock = { t: Date.UTC(2026, 10, 22, 10) }, name = acct();
    const { accountOf } = require('./sim');
    const C = accountOf({ rows: { R, name } });
    const day = n => new Date(Date.UTC(2023, 10, 22) + n * 86400000).toISOString().slice(0, 10);
    const A = phoneOf(ROOT, { name: 'A', clock, seed: 5 }).start(S => {
      for (let i = 0; i < 624; i++) S.sessions.push({ id: 'ses' + i.toString(36) + 'q7x2k', date: day(Math.floor(i * 1.75)), dayIdx: i % 4, dayName: 'Day ' + (1 + (i % 4)), notes: i % 9 ? '' : 'felt strong, slept well', ex: ['bench', 'backSquat', 'bbRow', 'dbCurl', 'cableFly', 'deadlift'].map((exId, k) => ({ exId, sets: [0, 1, 2].map(j => ({ w: 40 + ((i + k * 7) % 60), r: 6 + ((i + j) % 6), rir: 2 })) })) });
      for (let i = 0; i < 1000; i++) S.bodyweights.push({ id: 'bw' + i.toString(36) + 'm3p9z', date: day(i + 90), kg: 78 + (i % 40) / 10, demo: false });
      for (let i = 0; i < 150; i++) S.cardio.push({ id: 'car' + i.toString(36) + 'h4t8w', date: day(i * 7), kind: 'run', min: 20 + (i % 30), hr: null, when: 'solo', note: '', demo: false });
      S.settings.onboarded = true;
    });
    clock.t += 2000; await A.tick(); A.signIn(C);
    const t0 = Date.now(); await A.sync(); const first = Date.now() - t0;
    const rows = await C.rows(), notes = (A.ls.get(A.E.KEY + '.rows') || '').length, log = (A.ls.get(A.E.KEY) || '').length;
    const pushes = C.calls.filter(c => c.name === 'push'), sent = rows.reduce((n, r) => n + (r.body ? r.body.length : 0), 0);
    ok(/Rows check: 1 clean day, 0 differences, 0 removed by a sync$/.test(diag(A).line), `three years of training (624 sessions, 1,000 weigh-ins, 150 cardio entries): ${rows.length} rows written in ${pushes.length} writes, ${Math.round(sent / 1024)} KB of copies, ${first} ms here; the first check is clean`, diag(A));
    ok(notes > 0 && notes <= 150000, `the notes the phone keeps of them are ${Math.round(notes / 1024)} KB (150 KB at most), beside a log of ${Math.round(log / 1024)} KB`, notes);
    ok(pushes.every(c => c.n <= 200), 'no write holds more than 200 rows');
    const from = C.calls.length; clock.t += 5000; const t1 = Date.now(); await A.sync(); const idle = Date.now() - t1;
    ok(C.calls.slice(from).every(c => c.name === 'pull') && C.calls.length - from === 1, `a sync with nothing changed then asks once for the layout and writes nothing (${idle} ms here for the whole sync)`, C.calls.slice(from).map(c => c.name));
    const B = phoneOf(ROOT, { name: 'B', clock, seed: 6 }).start(); B.signIn(C); const at = C.calls.length; await B.sync();
    const b = C.calls.slice(at).filter(c => c.who === 'B');
    ok(b.filter(c => c.name === 'list').length === Math.ceil((rows.length + 1) / 500) + (rows.length % 500 === 0 ? 0 : 0) && pushesOf(C, 'B', at).every(k => k.startsWith('device/')), `a second phone reads the list in ${b.filter(c => c.name === 'list').length} reads of 500 rows, with no copies, and sends only its own device row`, b.map(c => c.name + ':' + c.n));
  }

  /* ---------- 4. histories from seeds ---------- */
  if (part('seeds')) {
    const N = Number(process.env.ROWS_SEEDS || 40), plain = Number(process.env.ROWS_SEEDS || 40) * 3;
    const tally = async (count, from, n, rows) => {
      let bad = 0, first = null, hit = {}, acts = 0, rounds = 0;
      for (let seed = from; seed < from + count; seed++) {
        const r = await history({ dirs: Array(n).fill(ROOT), seed, steps: 60, rows, name: rows ? acct() : undefined, skews: seed % 3 === 0 ? [0, -40000, 90000] : [0, 0, 0] });
        acts += r.script.length; rounds += r.counts.rounds;
        for (const k of Object.keys(r.known)) hit[k] = (hit[k] || 0) + 1;
        if (said(r).length) { bad++; if (!first) first = { seed, n, said: said(r).slice(0, 2), script: told(r.script).slice(0, 500) }; }
      }
      return { bad, first, hit, acts, rounds };
    };
    const t0 = Date.now();
    const a = await tally(N, 1, 2, R), b = await tally(Math.ceil(N / 2), 3001, 3, R);
    ok(a.bad === 0 && b.bad === 0, `${N} histories on two phones and ${Math.ceil(N / 2)} on three, with rows, ${a.acts + b.acts} actions, checked ${a.rounds + b.rounds} times: the lifter's rules hold and the rows say what the log says (${Math.round((Date.now() - t0) / 1000)} s)`, a.first || b.first);
    const t1 = Date.now();
    const c = await tally(plain, 10001, 2, null), d = await tally(Math.ceil(plain / 2), 13001, 3, null);
    ok(c.bad === 0 && d.bad === 0, `${plain} histories on two phones and ${Math.ceil(plain / 2)} on three, documents alone, ${c.acts + d.acts} actions: the lifter's rules hold (${Math.round((Date.now() - t1) / 1000)} s)`, c.first || d.first);
    const hit = {}; for (const t of [a, b, c, d]) for (const k of Object.keys(t.hit)) hit[k] = (hit[k] || 0) + t.hit[k];
    console.log('     what the documents cannot decide, met and not failed: ' + (Object.keys(hit).map(k => `${k} (${hit[k]} histories)`).join('; ') || 'none'));
  }

  /* ---------- 5. the histories find what the reviews found, and fail on a rule broken ---------- */
  if (part('old')) {
    const cases = JSON.parse(fs.readFileSync(path.join(__dirname, 'sim-cases.json'), 'utf8'));
    let old = null;
    try { old = sourceAt(OLD); } catch (e) { ok(false, 'the source of 2.76 could not be read from git', String((e && e.message) || e).slice(0, 300)); }
    for (const c of cases) {
      const now = await history({ dirs: [ROOT, ROOT], script: c.script });
      ok(said(now).length === 0, `${c.name}: right on this build (${told(c.script)})`, said(now));
      if (!old) continue;
      const was = await history({ dirs: [old, old], script: c.script });
      ok(was.fails.some(f => f.rule === c.rule), `the same history on the source of 2.76 fails the rule "${c.rule}": the histories find ${c.found}`, was.fails);
    }
    {
      /* A phone still on 2.77.1 beside one on this build, on an account with rows: the older phone knows no rows and
         syncs as before; what it changes reaches the rows through the newer phone, which mirrors the documents'
         log whichever phone made the change. Checked with the newer phone first and with the older one first. */
      let before = null;
      try { before = sourceAt(BEFORE); } catch (e) { ok(false, 'the source of 2.77.1 could not be read from git', String((e && e.message) || e).slice(0, 300)); }
      const S = (p, op, more) => ({ p, op, ...more });
      for (const older of before ? [1, 0] : []) {
        const o = older, n = 1 - older;
        const r = await history({ dirs: older ? [ROOT, before] : [before, ROOT], rows: R, name: acct(), script: [
          S(n, 'check'), S(o, 'note', { id: 's1', v: 'typed on the older phone' }), S(o, 'del', { id: 's2' }), S(o, 'add', { id: 'x1', v: '2026-11-20' }), S(n, 'check'),
          S(o, 'restore', { id: 's2' }), S(o, 'del', { id: 's3' }), S(o, 'forgood', { id: 's3' }), S(n, 'note', { id: 's4', v: 'typed on the newer phone' }), S(o, 'move', { id: 's4', v: '2026-11-10' }), S(n, 'check'),
          S(o, 'start', { id: 'k1', v: '2026-11-20' }), S(o, 'tick', { i: 0 }), S(n, 'check'), S(n, 'tick', { i: 1 }), S(o, 'check'), S(o, 'finish'), S(n, 'check')
        ] });
        const sent = r.C.calls.filter(c => c.who === 'AB'[o]);
        ok(said(r).length === 0 && sent.length === 0 && r.phones[o].E.rowsDiag === undefined && (await r.C.rows()).filter(x => x.kind === 'device').length === 1, `a phone still on 2.77.1 beside this build (${older ? 'this build signed in first' : 'the older phone signed in first'}): the lifter's rules hold, the older phone asks nothing of the rows, and what it changed is in the rows as the log holds it`, { said: said(r), asked: sent.length });
      }
    }
    if (old) {
      // Not only the kept cases: histories written from seeds find losses on 2.76 by themselves.
      let bad = 0; const rules = {};
      for (let seed = 1; seed <= 40; seed++) { const r = await history({ dirs: [old, old], seed, steps: 60 }); if (r.fails.length) bad++; for (const f of r.fails) rules[f.rule] = (rules[f.rule] || 0) + 1; }
      ok(bad >= 5 && rules.held > 0 && rules.back > 0, `40 histories from seeds on the source of 2.76: ${bad} fail a lifter's rule (${Object.keys(rules).map(k => k + ' ' + rules[k]).join(', ')}); the same seeds are clean on this build (part 4)`, rules);
    }
  }
  if (part('broken')) {
    const BROKEN = [
      ['a row the account just changed is not left alone', `      if (changed.has(k)) {
        N.wait[k] ??= now;
        continue;
      }
`, '', ["a row ahead of the documents a phone holds is left alone"]],
      ['a record gone from the log is not marked in its row', `    if (!h) return null;
    const cut = k.indexOf('/');`, `    if (h) return null;
    const cut = k.indexOf('/');`, ['the rows say what the log says after each thing a lifter does']],
      ['a copy is sent with the time of the pass, not the time the documents hold', `  const t = cloud.recAt[m.doc]?.[m.rk];
  return t !== undefined && t > 0 ? t : 0;`, `  return Date.now();`, ['the rows say what the log says after each thing a lifter does']],
      ['the daily check reads the whole checksum where the notes keep twelve characters', `            h.s,
            h.saw === null ? '' : h.saw,`, `            h.s + '0',
            h.saw === null ? '' : h.saw,`, ['the rows say what the log says after each thing a lifter does']],
      ['the day shown in Recently deleted is not compared', `  return h.day === (m.day || '') && h.clash === (m.clash === true);`, `  return true;`, ['the rows say what the log says after each thing a lifter does']],
      ['the workout in progress is not written', `    if (h ? h.s === sumOf(body) : !state.draft) return;`, `    if (h || !h) return;`, ['the rows say what the log says after each thing a lifter does']],
      ['the layout is not heeded', `  blocked = needsNewer(L);`, `  blocked = false && needsNewer(L);`, ['an account that asks for a newer build: the phone stops syncing and says to update']],
      ['a row the documents decided against is never sent over', `      const ripe = since !== undefined && now - since >= WAIT_MS && C.pulledAt() > since;`, `      const ripe = false && since !== undefined && now - since >= WAIT_MS && C.pulledAt() > since;`, ["a row the documents decided against is sent over, and the difference recorded"]],
      ['a row is sent over the account\'s at once, with no wait', `      const ripe = since !== undefined && now - since >= WAIT_MS && C.pulledAt() > since;`, `      const ripe = true;`, ["a row the documents decided against is sent over, and the difference recorded", "a row ahead of the documents a phone holds is left alone"]],
      ['every read starts after the phone\'s own last write, whatever another phone wrote before it', `    if (top - N.n === own) N.n = top;`, `    N.n = top;`, ['a row another phone wrote while this phone was writing is read at the next pass']],
      ['the rows\' notes are kept at "Sign out"', `  // Notes storage would not forget name the log they were for, and are not read for another.
  prefDel(ROWS_KEY);`, ``, ['"Sign out" then signed in again changes nothing in the account']]
    ];
    for (const [name, from, to, which] of BROKEN) {
      const dir = brokenCopy(name, from, to);
      let out = [];
      try { for (const w of which) { out = await CASES[w](dir, R); if (out.length) break; } } catch (e) { out = ['crashed: ' + String((e && e.message) || e).slice(0, 120)]; }
      ok(out.length > 0, `the cases fail on the rows module with one rule broken: ${name}`, 'nothing failed');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  await R.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
