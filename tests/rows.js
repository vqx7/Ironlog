// The account's rows, first phase (2.78): the documents decide what the log is and the app makes the account's rows
// say the same, record by record. Run in Node: phones made of the app's own modules (tests/sim.js) against the SQL
// of SUPABASE.md, Part 8, on PGlite (tests/rowsdb.js), through whole histories (tests/simlib.js).
//   1. The mirror, case by case: what the rows hold after each thing a lifter does, on one phone and on two.
//   2. What the rows never do: change the log or the documents, ask anything of an account with no table, write
//      when nothing changed.
//   3. The cost at three years of training.
//   4. Histories written from seeds, on two and on three phones, checked against the lifter's rules.
//   6. Once the rows decide (2.79): the cases of the design, each a history held to the strict rules, histories
//      from seeds on two phones, three, with the account switching midway and with two tabs of one phone, and a
//      copy of the rows' sync with one rule broken that must fail a case.
//   5. The histories are trusted because they find, on the source of 2.76, the losses the reviews of 2.76 and 2.77
//      found by hand (tests/sim-cases.json keeps the shortest history of each), and because a copy of the rows
//      module with one rule broken fails. The strict rules (simlib.js), which the rows must keep once they decide,
//      find on the source of 2.78 the workout's losses no document sync can decide, by script and from seeds.
//   ROWS_SEEDS=200 node tests/rows.js     more histories (default 40 with rows, 120 without)
//   7. The switch by itself at the daily check (decision 4): what counts toward it, what holds it, Forget it, each
//      with a copy of the gate with one rule broken that must fail a case.
//   8. Switch back: the documents written back, the layout with `made` kept and `hold`, every other phone crossing back.
//   ROWS_PART=mirror|cost|seeds|old|broken|decide|gate|back node tests/rows.js     one part alone
//   ROWS_PART=mirror ROWS_CASE=workout node tests/rows.js         the mirror's cases whose name holds the text
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
// The source of 2.78.2 (build r127), the last build on which the documents decide every account.
const DOCS_DECIDE = '4094416377777222f458ddd4524b55980232eb19';
/** The app's source at commit `sha`, unpacked once into the temporary directory; fetched when this clone does not hold the commit. */
function sourceAt(sha) {
  const dir = path.join(os.tmpdir(), 'ironlog-src-' + sha.slice(0, 10));
  if (fs.existsSync(path.join(dir, 'src', 'app', 'sync.ts'))) return dir;
  // GitHub's WebKit and Chromium jobs run in a container as another user than the checkout's owner, and git then refuses the repository unless told it is safe.
  const git = a => execFileSync('git', ['-c', 'safe.directory=' + ROOT, '-c', 'safe.directory=*', ...a], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  try { git(['cat-file', '-e', sha + '^{commit}']); } catch (e) { git(['fetch', '--quiet', '--depth', '1', 'origin', sha]); }
  fs.mkdirSync(dir, { recursive: true });
  execFileSync('tar', ['-x', '-C', dir], { input: git(['archive', sha, 'src/app']) });
  return dir;
}
/** A copy of this checkout's source with `from` replaced by `to` wherever a module of src/app/ holds it: the rows with one rule broken. A rule kept in two places is broken in both (`from` a list of pairs). */
function brokenCopy(name, from, to) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-broken-'));
  fs.cpSync(path.join(ROOT, 'src', 'app'), path.join(dir, 'src', 'app'), { recursive: true });
  const app = path.join(dir, 'src', 'app');
  const files = fs.readdirSync(app).filter(f => /\.ts$/.test(f));
  const text = new Map(files.map(f => [f, fs.readFileSync(path.join(app, f), 'utf8')]));
  for (const [a, b] of Array.isArray(from) ? from : [[from, to]]) {
    const holds = files.filter(f => text.get(f).includes(a));
    if (!holds.length) throw new Error(`no module holds the text the broken copy "${name}" replaces: ${a.slice(0, 50)}`);
    for (const f of holds) text.set(f, text.get(f).split(a).join(b));
  }
  for (const f of files) fs.writeFileSync(path.join(app, f), text.get(f));
  return dir;
}
/** A copy of the source at `dir` with each pattern of `pairs` replaced in the rows' modules (a build of another level). */
function copyWith(dir, pairs) {
  const to = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-copy-'));
  fs.cpSync(path.join(dir, 'src', 'app'), path.join(to, 'src', 'app'), { recursive: true });
  const app = path.join(to, 'src', 'app');
  for (const f of fs.readdirSync(app).filter(x => /^rows\w*\.ts$/.test(x))) {
    let text = fs.readFileSync(path.join(app, f), 'utf8');
    for (const [a, b] of pairs) text = text.replace(a, b);
    fs.writeFileSync(path.join(app, f), text);
  }
  return to;
}
let accounts = 0;
const acct = () => 'a' + ++accounts;
const S6 = (p, op, more) => ({ p, op, ...more });
/* The rows deciding, case by case (design part 1, 3 to 4): each a history on an account switched to its rows from the
   start, held to the strict rules (simlib.js); each answers with what went wrong, nothing when right. */
const DECIDE = {
  // A delete sent, its answer lost after the account applied it, then put back by Undo: the phone's own write is known as its own, and the session stays.
  'a write whose answer was lost is this phone\'s own': [S6(0, 'drop', { kind: 'rows-push', when: 'after' }), S6(0, 'del', { id: 's2' }), S6(0, 'undo'), S6(1, 'note', { id: 's1', v: 'typed on B' }), S6(0, 'check')],
  // Two different workouts, each kept on the phone that started it, each saved whole when finished.
  'two different workouts each stay on their own phone': [S6(0, 'start', { id: 'k1', v: '2026-11-20' }), S6(1, 'start', { id: 'k2', v: '2026-11-20' }), S6(0, 'tick', { i: 0 }), S6(1, 'tick', { i: 1 }), S6(0, 'check'), S6(1, 'finish'), S6(0, 'tick', { i: 2 }), S6(0, 'check')],
  // One workout ticked on two phones with no signal, Finish tapped on both: one session with every set.
  'one workout finished on two phones keeps every set': [S6(0, 'start', { id: 'k1', v: '2026-11-20' }), S6(0, 'check'), S6(1, 'off'), S6(0, 'tick', { i: 0 }), S6(1, 'tick', { i: 1 }), S6(0, 'finish'), S6(1, 'finish'), S6(1, 'on'), S6(0, 'check')],
  // The saved session edited on one phone while the other, not caught up, ticks: both kept.
  'the saved session edited while the other phone ticks': [S6(0, 'start', { id: 'k1', v: '2026-11-20' }), S6(0, 'check'), S6(0, 'tick', { i: 0 }), S6(0, 'finish'), S6(1, 'off'), S6(1, 'tick', { i: 1 }), S6(0, 'note', { id: 'k1', v: 'typed after' }), S6(1, 'on'), S6(0, 'check')],
  // A date and a note changed alone on the phone behind join the session finished elsewhere.
  // A date and a note changed alone on the phone behind, which saw none of the sets, join the session finished elsewhere.
  'a date or a note changed on the phone behind joins the session': [S6(0, 'start', { id: 'k1', v: '2026-11-20' }), S6(1, 'check'), S6(1, 'off'), S6(0, 'tick', { i: 0 }), S6(0, 'finish'), S6(1, 'redate', { v: '2026-11-16' }), S6(1, 'wnote', { v: 'typed on B' }), S6(1, 'on'), S6(0, 'check')],
  // Deleted on A, edited on B (not caught up), restored on A: the restore only puts a copy back, and B's edit stands.
  'a copy only put back never beats an edit made elsewhere': { expect: { s1: 'edited on B' }, script: [S6(1, 'off'), S6(0, 'del', { id: 's1' }), S6(0, 'sync'), S6(1, 'note', { id: 's1', v: 'edited on B' }), S6(0, 'restore', { id: 's1' }), S6(1, 'on'), S6(0, 'check')] },
  // The other way round: B's edit reaches the account first, then A's restore, made offline, is read against it.
  'a put-back that meets an edit it had not seen keeps the edit': { expect: { s1: 'edited on B' }, script: [S6(1, 'off'), S6(0, 'del', { id: 's1' }), S6(0, 'sync'), S6(1, 'note', { id: 's1', v: 'edited on B' }), S6(1, 'on'), S6(1, 'sync'), S6(0, 'off'), S6(0, 'restore', { id: 's1' }), S6(0, 'on'), S6(0, 'check')] },
  // The edit reaches the account between A's read and A's write of its restore: A's write replaces it unseen, and the answer says so.
  'a put-back written over an edit it had not seen gives the edit back': { expect: { s1: 'edited on B' }, script: [S6(1, 'off'), S6(0, 'del', { id: 's1' }), S6(0, 'sync'), S6(1, 'note', { id: 's1', v: 'edited on B' }), S6(1, 'on'), S6(0, 'off'), S6(0, 'restore', { id: 's1' }), S6(0, 'on'), S6(0, 'squeeze', { q: 1, then: { op: 'sync' } }), S6(0, 'check')] },
  // A workout finished on A, which then starts another that follows nothing (a past day), while B still ticks the first: B's late set joins the session, and B closes it.
  'a workout finished elsewhere joins its session whatever opens next': [S6(1, 'start', { id: 'k1', v: '2026-11-16' }), S6(1, 'tick', { i: 2 }), S6(0, 'check'), S6(1, 'off'), S6(0, 'finish'), S6(0, 'start', { id: 'k2', v: '2026-11-03' }), S6(1, 'tick', { i: 0 }), S6(1, 'on'), S6(0, 'check')],
  /* Two tabs of one phone and a second phone: a set ticked in each tab, the workout finished in one. The last tick is
     made in the moment before its tab hears of the finish, and the pull in the moment before the other tab hears of
     that tick (now), so each tab's sync reads what the other stored without its storage event. */
  'two tabs of one phone tick and finish one workout': { tabs: { 1: 0 }, dirs: 3, script: [S6(2, 'start', { id: 'k5', v: '2026-11-20' }), S6(0, 'sync'), S6(0, 'tick', { i: 3 }), S6(1, 'check'), S6(1, 'finish'), S6(2, 'tick', { i: 1 }), S6(0, 'tick', { i: 0, now: true }), S6(1, 'pull', { now: true }), S6(2, 'check')] }
};
/** Runs the cases of DECIDE on the source at `dir`: what failed, by case. */
async function decideCases(dir, R, only) {
  const out = [];
  for (const [name, c] of Object.entries(DECIDE)) {
    if (only && !only.includes(name)) continue;
    const o = Array.isArray(c) ? { script: c } : c;
    const n = o.dirs || 2;
    const r = await history({ dirs: Array(n).fill(dir), tabs: o.tabs, rows: R, name: acct(), strict: true, switched: true, script: o.script });
    for (const f of [...said(r)]) out.push(`${name}: ${f}`);
    // What a lifter expects of a record the rules above do not name: its note on every phone.
    for (const [id, note] of Object.entries(o.expect || {})) for (const P of r.phones) { const x = P.state().sessions.find(q => q.id === id); if (!x || x.notes !== note) out.push(`${name}: ${id} on ${P.name} holds ${x ? JSON.stringify(x.notes) : 'nothing'}, not ${JSON.stringify(note)}`); }
  }
  return out;
}
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
    /* Phone B deleted a session for good: on phone A it left the log by a sync, and B's mark deleting it explains it, so
       it is no difference (decision 2, V 2026-11-27): only a record gone with no device deleting it is counted. */
    for (const P of r.phones) {
      const d = diag(P);
      if (d.line !== 'Rows check: 2 of 3 clean days, 0 differences, 0 removed with no delete') out.push(`${P.name} says "${d.line}" after two days with nothing wrong`);
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
    if (diag(C3).line !== 'Rows check: 1 of 3 clean days, 0 differences, 0 removed with no delete') out.push(`the third phone says "${diag(C3).line}"`);
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
  /* The same row, read by a pass that then stops before it compares: the lifter typed again while the rows were
     being read. The rows are in the notes all the same, and the next pass (a send of that second change, with no
     read of the documents since) must still leave the other phone's new session alone (REV32-2). */
  async 'a row read by a pass that stopped early is still left alone by the next pass'(dir, R) {
    const r = await history({ dirs: [dir, dir], rows: R, name: acct(), script: [{ p: 0, op: 'check' }] });
    const [A, B] = r.phones, out = [];
    const x9 = async () => (await r.C.rows()).find(x => x.kind === 'session' && x.id === 'x9');
    await r.run({ p: 1, op: 'add', id: 'x9', v: '2025-12-30' }); await B.flush();
    let once = true;
    A.hook = async (kind, when) => { if (kind === 'rows-pull' && when === 'after' && once) { once = false; A.edit(S => { S.sessions.find(s => s.id === 's2').notes = 'typed while the rows were read'; }); } };
    await r.run({ p: 0, op: 'note', id: 's1', v: 'typed on A' });
    A.hook = null;
    if (once) return ['phone A read no rows'];
    r.clock.t += 1500; await A.tick(); await A.flush();
    let row = await x9();
    if (!row || row.body === null || row.gone_saw !== null) out.push('phone A marked the session it has not read yet as deleted');
    if (!/1 waiting$/.test(diag(A).line)) out.push(`phone A says "${diag(A).line}", not that one record waits`);
    // The same by the workout's row: its write is refused as stale, the rows are read again, and that read brings another new session in.
    await r.check();
    for (const x of [{ p: 0, op: 'start', id: 'k1', v: '2026-11-20' }, { p: 0, op: 'check' }, { p: 1, op: 'tick', i: 0 }, { p: 1, op: 'add', id: 'x8', v: '2026-11-20' }]) await r.run(x);
    await B.flush();
    await r.run({ p: 0, op: 'tick', i: 1 }); await r.run({ p: 0, op: 'tick', i: 2 });
    row = (await r.C.rows()).find(x => x.kind === 'session' && x.id === 'x8');
    if (!row || row.body === null || row.gone_saw !== null) out.push('after the workout row\'s second try, phone A marked a session it has not read yet as deleted');
    await r.check();
    out.push(...said(r));
    for (const P of r.phones) if (diag(P).findings.length) out.push(`${P.name} recorded a difference: ${diag(P).findings[0].why}`);
    return out;
  },
  /* A record leaves the log by a sync while the phone's own pass over the rows is under way: it is still noted, though
     the pass writes the notes after the note was written (REV32-4); the mark B sent deleting it then explains it, so
     it is no difference (decision 2). */
  async 'a record a sync removed while a pass was under way is still counted'(dir, R) {
    const r = await history({ dirs: [dir, dir], rows: R, name: acct(), script: [{ p: 0, op: 'check' }] });
    const [A, B] = r.phones;
    B.E.act(() => { const S = B.state(); S.bodyweights = S.bodyweights.filter(b => b.id !== 'w1'); }); r.clock.t += 1500; await B.tick(); await B.flush();
    let once = true;
    A.hook = async (kind, when) => { if (kind === 'rows-pull' && when === 'after' && once) { once = false; await A.E.cq(A.E.cloudPull); } };
    await r.run({ p: 0, op: 'note', id: 's1', v: 'typed on A' });
    A.hook = null; await A.settle();
    if (once || A.state().bodyweights.some(b => b.id === 'w1')) return ['the read of the documents did not run inside the pass'];
    r.clock.t += 61000; await A.tick(); await A.sync(); await A.sync();
    return /, 0 differences, 0 removed with no delete/.test(diag(A).line) && A.rowNotes().chk.removed === 1 ? [] : [`phone A says "${diag(A).line}" and its notes hold ${A.rowNotes().chk.removed}`];
  },
  /* The account holds a later version of a session than the documents kept (as if the documents had decided against
     the order of the times). The phone waits a minute and a whole read of the documents, then sends the log's copy
     over it with a new time, and records the difference. */
  async "a row the documents decided against is sent over, and the difference recorded"(dir, R) {
    const name = acct(), r = await history({ dirs: [dir, dir], rows: R, name, outside: true, script: [{ p: 0, op: 'check' }] });
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
  /* The account's layout asks for a build newer than this one (a level above this build's, or a layer it does not know):
     this build stops syncing, says to update, writes nothing more to the account, and keeps the lifter's changes. */
  async 'an account that asks for a newer build: the phone stops syncing and says to update'(dir, R) {
    const out = [];
    for (const want of [{ decides: 'docs', level: 3 }, { decides: 'cubes', level: 1 }]) {
      const name = acct(), r = await history({ dirs: [dir, dir], rows: R, name, outside: true, script: [{ p: 0, op: 'check' }] });
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
      /* The app closed and opened again, three times, a change made each time: the phone knows from what it kept
         that it must not sync, and writes no document and takes none in (REV32-5). */
      let store = A.ls, last = A;
      for (let n = 1; n <= 3; n++) {
        last.E.cloudStop();
        const P = phoneOf(dir, { name: 'A', clock: r.clock, storage: store, seed: 20 + n }).start(); P.signIn(r.C);
        const w = r.C.writes.length, reads = r.C.calls.length, docs = r.C.reads.length;
        P.edit(S => { S.sessions.find(s => s.id === 's2').notes = 'typed at open ' + n; }); r.clock.t += 3000; await P.tick(); await P.sync();
        if (r.C.writes.length !== w) out.push(tag + `app opened again (${n}): ${r.C.writes.length - w} documents written`);
        if (P.E.cloud.status !== 'offline' || P.E.cloud.err !== P.E.ROWS_UPDATE) out.push(tag + `app opened again (${n}): the phone reads "${P.E.cloud.status}: ${P.E.cloud.err}"`);
        if (r.C.calls.slice(reads).some(c => c.name !== 'pull')) out.push(tag + `app opened again (${n}): the phone wrote to the rows`);
        if (r.C.reads.length !== docs) out.push(tag + `app opened again (${n}): the phone read the account's documents ${r.C.reads.length - docs} times`);
        last = P; store = P.ls;
      }
      // The account goes back to a layout this build knows: the phone syncs again at the second try, and what was typed meanwhile goes out.
      await R.call(name, 'records', 'push', [[{ kind: 'meta', id: 'layout', body: JSON.stringify({ ...layout, decides: 'docs', level: 1, gen: 3 }), t: r.clock.t + 5000, dev: 'dev-new', a: 0 }]]);
      r.clock.t += 61000; await last.tick(); await last.sync(); await last.settle(); await last.sync();
      if (last.E.cloud.status !== 'synced') out.push(tag + `with the layout back, the phone reads "${last.E.cloud.status}: ${last.E.cloud.err}"`);
      if (!JSON.stringify(r.C.all('u')).includes('typed at open 3')) out.push(tag + 'with the layout back, what was typed meanwhile did not reach the account');
    }
    {
      // A layout whose level cannot be read is read as more than this build knows, not as nothing asked.
      const name = acct(), r = await history({ dirs: [dir, dir], rows: R, name, outside: true, script: [{ p: 0, op: 'check' }] });
      const A = r.phones[0], layout = JSON.parse((await r.C.rows()).find(x => x.kind === 'meta').body);
      await R.call(name, 'records', 'push', [[{ kind: 'meta', id: 'layout', body: JSON.stringify({ ...layout, level: 'two' }), t: r.clock.t + 1000, dev: 'dev-new', a: 0 }]]);
      r.clock.t += 61000; await A.tick(); await A.sync(); await A.sync();
      if (A.E.cloud.err !== A.E.ROWS_UPDATE) out.push(`a layout whose level is not a number: the phone reads "${A.E.cloud.status}: ${A.E.cloud.err}"`);
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
    if (!/Rows check: 1 of 3 clean days, 1 difference,/.test(diag(A2).line)) out.push(`the day after, Settings says "${diag(A2).line}"`);
    return out;
  },
  /* Another phone writes a row at the very moment this phone writes its own, after this phone last read the rows.
     The phone's next read must start before that row, not after its own write: else its notes never hold it, and
     the next daily check finds the notes wrong. */
  async 'a row another phone wrote while this phone was writing is read at the next pass'(dir, R) {
    const name = acct(), r = await history({ dirs: [dir, dir], rows: R, name, outside: true, script: [{ p: 0, op: 'check' }] });
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
    if (diag(A).line !== 'Rows check: 2 of 3 clean days, 0 differences, 0 removed with no delete') out.push(`the next day phone A says "${diag(A).line}"`);
    if (!A.rowNotes().rows['device/dev-third']) out.push("phone A's notes do not hold the third phone's row");
    return out;
  },
  /* Two tabs of one phone hold one set of notes. A tab that read them before the other tab recorded a difference
     must not write its own, older ones over that: it acts on the notes as stored. Here the second tab is a second
     page on the same storage, behind by a day. */
  async 'a second tab of the phone never writes its older notes over what the first recorded'(dir, R) {
    const name = acct(), r = await history({ dirs: [dir, dir], rows: R, name, outside: true, script: [{ p: 0, op: 'check' }] });
    const out = [], A = r.phones[0];
    const A2 = phoneOf(dir, { name: 'A', clock: r.clock, storage: A.ls, seed: 8 }).start(); A2.signIn(r.C); await A2.sync();
    if (diag(A2).line !== 'Rows check: 1 of 3 clean days, 0 differences, 0 removed with no delete') return [`the second tab starts with "${diag(A2).line}"`];
    // The first tab meets a row the documents decided against, and records the difference (the case above).
    await R.call(name, 'records', 'push', [[{ kind: 'session', id: 's1', body: '{"id":"s1","notes":"not what the documents hold"}', t: r.clock.t + 5000, dev: 'dev-other', a: 0 }]]);
    await r.run({ p: 0, op: 'note', id: 's2', v: 'typed in the first tab' }); await A.flush();
    await r.check();
    if (!/1 difference,/.test(diag(A).line)) return [`the first tab did not record the difference: "${diag(A).line}"`];
    // The next day the second tab syncs and runs its daily check.
    r.clock.t += 26 * 3600000; await A2.sync(); await A2.sync();
    const kept = A2.rowNotes();
    if (!/1 difference,/.test(diag(A2).line)) out.push(`the second tab says "${diag(A2).line}"`);
    if (kept.chk.diffs !== 1 || kept.find.length !== 1) out.push(`the notes on the phone hold ${kept.chk.diffs} differences and ${kept.find.length} findings after the second tab's pass`);
    return out;
  },
  /* What the review's own broken copies showed unchecked (REV32): a mark that names another device's copy of the same
     millisecond deletes nothing; a write the app makes on its own, with the record's time unmoved, reaches the row;
     an account whose rows were lost and begun again is filled again; the profile photo has its row. */
  async 'a mark of another copy, the app\'s own write, an account begun again, and the photo'(dir, R) {
    const name = acct(), r = await history({ dirs: [dir, dir], rows: R, name, outside: true, script: [{ p: 0, op: 'check' }] });
    const out = [], A = r.phones[0];
    // The row of s1 as another phone wrote it in the same millisecond, with a mark that names this phone's copy of that millisecond, not the one kept: in the log.
    const s1 = (await r.C.rows()).find(x => x.kind === 'session' && x.id === 's1');
    await R.call(name, 'records', 'push', [[{ kind: 'session', id: 's1', body: s1.body, t: s1.t, dev: 'dev-b', a: 0, gone_saw: s1.t, gone_saw_dev: 'dev-a', gone_t: s1.t + 10, gone_dev: 'dev-a', gone_day: '2026-11-22' }]]);
    await r.run({ p: 0, op: 'note', id: 's2', v: 'typed on A' }); await r.check();
    out.push(...said(r));
    if (r.phones.some(P => diag(P).findings.length || / waiting$/.test(diag(P).line))) out.push('a mark that names another device\'s copy was read as deleting the copy kept: ' + r.phones.map(P => diag(P).line).join(' | '));
    // The app's own write: the note changed with the record's time unmoved (act's `app`), to a text before the old one by bytes.
    const t0 = (await r.C.rows()).find(x => x.id === 's3').t;
    A.E.act(() => { A.state().sessions.find(s => s.id === 's3').notes = 'app wrote'; }, { app: true });
    r.clock.t += 1500; await A.tick(); await r.check();
    const s3 = (await r.C.rows()).find(x => x.kind === 'session' && x.id === 's3');
    if (JSON.parse(s3.body).notes !== 'app wrote' || s3.t !== t0 || s3.a !== 1) out.push(`the app's own write: the row holds "${JSON.parse(s3.body).notes}" at time ${s3.t === t0 ? 'unmoved' : 'moved'}, written ${s3.a} times by the app`);
    out.push(...said(r));
    // The profile photo: a row of its own, its copy the photo, written once.
    const photo = 'data:image/jpeg;base64,' + Buffer.from('a small picture '.repeat(40)).toString('base64');
    A.ls.set(A.E.KEY + '.photo', photo); A.ls.set(A.E.KEY + '.photoSync', JSON.stringify({ uid: 'u', et: r.clock.t, up: true }));
    await A.E.cq(A.E.photoFlush); await A.settle(); r.clock.t += 5000; await A.sync(); await A.sync();
    const ph = (await r.C.rows()).find(x => x.kind === 'photo');
    if (!ph || JSON.parse(ph.body) !== photo) out.push('the photo has no row holding it' + (A.E.photoPending() ? ' (the photo was never sent as a document)' : ''));
    const from = r.C.calls.length; r.clock.t += 5000; await A.sync();
    if (pushesOf(r.C, 'A', from).length) out.push('the photo\'s row was written again with nothing changed');
    // The account's rows lost and begun again (a restore from a copy made before them): the phone reads that its number is past the account's, and fills the rows again.
    await R.admin(`delete from public.records where user_id = $1`, [R.uuidOf(name)]);
    r.versions.clear();
    await r.run({ p: 0, op: 'note', id: 's2', v: 'typed after the rows were lost' }); await r.check();
    out.push(...said(r));
    if (!(await r.C.rows()).some(x => x.kind === 'meta' && x.id === 'layout')) out.push('the account begun again has no layout row');
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
  /* The account switches to its rows while this phone still mirrors, with the same workout open there and on the
     phone the rows decide on, which ticks set 2 after the switch. This phone ticks set 3: its write of the workout's
     row is refused (it was made over a copy the account no longer holds), and the read that follows says the rows
     decide. The mirror stops there: it never writes the row over the copy it just read. */
  async 'a phone still mirroring never writes the workout over the account\'s once the rows decide'(dir, R) {
    const out = [], name = acct();
    const r = await history({ dirs: [dir, dir], rows: R, name, outside: true, script: [{ p: 0, op: 'start', id: 'k1', v: '2026-11-22' }, { p: 0, op: 'tick', i: 0 }, { p: 0, op: 'check' }] });
    const B = r.phones[1];
    const draft = async () => (await r.C.rows()).find(x => x.kind === 'draft');
    const ticks = body => { const d = JSON.parse(body); return d ? d.ex[0].sets.map(x => (x.done ? 1 : 0)).join('') : 'closed'; };
    let row = await draft();
    const layout = JSON.parse((await r.C.rows()).find(x => x.kind === 'meta').body);
    await R.call(name, 'records', 'push', [[{ kind: 'meta', id: 'layout', body: JSON.stringify({ ...layout, decides: 'rows', level: 2, gen: 2 }), t: r.clock.t + 1000, dev: 'dev-S', a: 0 }]]);
    const w = JSON.parse(row.body); w.ex[0].sets[1].done = true;
    await R.call(name, 'records', 'push', [[{ kind: 'draft', id: 'draft', body: B.E.canon(w), t: r.clock.t + 2000, dev: 'dev-S', a: 0, over_t: row.t, over_dev: row.dev }]]);
    const calls = r.C.calls.length;
    await r.run({ p: 1, op: 'tick', i: 2 });
    await B.settle();
    row = await draft();
    const pushes = r.C.calls.slice(calls).filter(c => c.who === 'B' && c.name === 'push' && c.keys.includes('draft/draft')).length;
    if (ticks(row.body)[1] !== '1') out.push(`set 2, ticked after the switch on the phone the rows decide on, is no longer in the account's workout (${ticks(row.body)}, written by ${row.dev})`);
    if (pushes > 1) out.push(`the mirroring phone wrote the workout's row ${pushes} times, the second after the read that said the rows decide`);
    return out;
  },
  /* A build that can decide by the rows still writes an account's first rows as the first phase: its first layout
     says level 1, so every phone still on the first phase's build syncs that account as before. */
  async 'the first layout says level 1, whatever the level of the build that writes it'(dir, R) {
    const lv2 = copyWith(dir, [[/(export )?const LEVEL = \d+;/, 'export const LEVEL = 2;']]);
    try {
      const name = acct(), r = await history({ dirs: [lv2, lv2], rows: R, name, script: [{ p: 0, op: 'check' }] });
      const L = JSON.parse(((await r.C.rows()).find(x => x.kind === 'meta' && x.id === 'layout') || { body: 'null' }).body);
      return L && L.level === 1 && L.decides === 'docs' && L.gen === 1 ? [] : [`the first layout a build of level 2 writes is ${JSON.stringify(L)}`];
    } finally { fs.rmSync(lv2, { recursive: true, force: true }); }
  },
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
    for (const name of Object.keys(CASES).filter(n => n.includes(process.env.ROWS_CASE || ''))) { const out = await CASES[name](ROOT, R); ok(out.length === 0, name, out.slice(0, 4)); }

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
    ok(/Rows check: 1 of 3 clean days, 0 differences, 0 removed with no delete$/.test(diag(A).line), `three years of training (624 sessions, 1,000 weigh-ins, 150 cardio entries): ${rows.length} rows written in ${pushes.length} writes, ${Math.round(sent / 1024)} KB of copies, ${first} ms here; the first check is clean`, diag(A));
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
    for (const c of cases.filter(x => !x.on)) {
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
    {
      /* The strict rules, calibrated: what the rows must keep once they decide fails on the build before them, each
         kept case by the rule it names and the seeds by themselves (two phones, with rows, as on V's account). */
      let docs = null;
      try { docs = sourceAt(DOCS_DECIDE); } catch (e) { ok(false, 'the source of 2.78.2 could not be read from git', String((e && e.message) || e).slice(0, 300)); }
      for (const c of cases.filter(x => x.on === '2.78')) {
        const now = await history({ dirs: [ROOT, ROOT], rows: R, name: acct(), strict: true, switched: true, script: c.script });
        ok(said(now).length === 0, `${c.name}: right on this build once the rows decide (${told(c.script)})`, said(now));
        if (!docs) continue;
        const was = await history({ dirs: [docs, docs], rows: R, name: acct(), strict: true, script: c.script });
        ok(was.fails.some(f => f.rule === c.rule), `${c.name}: on the source of 2.78.2 it fails the rule "${c.rule}" (${told(c.script)}): the strict histories find ${c.found}`, was.fails);
      }
      if (docs) {
        const rules = {}; let bad = 0;
        for (let seed = 1; seed <= 20; seed++) for (const n of [2, 3]) {
          const r = await history({ dirs: Array(n).fill(docs), seed: seed + (n === 3 ? 5000 : 0), steps: 60, rows: R, name: acct(), strict: true });
          if (r.fails.length) bad++;
          for (const f of r.fails) rules[f.rule] = (rules[f.rule] || 0) + 1;
        }
        ok(bad >= 3 && rules.sets > 0 && rules.date > 0, `40 strict histories from seeds on the source of 2.78.2 (20 on two phones, 20 on three): ${bad} fail a lifter's rule (${Object.keys(rules).map(k => k + ' ' + rules[k]).join(', ')})`, rules);
      }
    }
    if (old) {
      // Not only the kept cases: histories written from seeds find losses on 2.76 by themselves.
      let bad = 0; const rules = {};
      for (let seed = 1; seed <= 40; seed++) { const r = await history({ dirs: [old, old], seed, steps: 60 }); if (r.fails.length) bad++; for (const f of r.fails) rules[f.rule] = (rules[f.rule] || 0) + 1; }
      ok(bad >= 5 && rules.held > 0 && rules.back > 0, `40 histories from seeds on the source of 2.76: ${bad} fail a lifter's rule (${Object.keys(rules).map(k => k + ' ' + rules[k]).join(', ')}); the same seeds are clean on this build (part 4)`, rules);
    }
  }
  let lockCase;
  if (part('decide')) {
    /* ---------- 6. the rows decide ---------- */
    for (const name of Object.keys(DECIDE)) { const out = await decideCases(ROOT, R, [name]); ok(out.length === 0, `the rows decide: ${name}`, out.slice(0, 3)); }
    {
      // Each phone of an account switched to its rows says nothing of a clash where two phones made the same change.
      const r = await history({ dirs: [ROOT, ROOT], rows: R, name: acct(), strict: true, switched: true, script: [S6(0, 'off'), S6(1, 'off'), S6(0, 'note', { id: 's1', v: 'same' }), S6(1, 'note', { id: 's1', v: 'same' }), S6(0, 'on'), S6(1, 'on'), S6(0, 'check')] });
      const clash = r.phones.flatMap(P => P.toasts).filter(t => /edited on two devices/.test(t));
      ok(said(r).length === 0 && clash.length === 0, 'the same change made on two phones is no clash, and nothing is said', { said: said(r), clash });
    }
    {
      // A workout kept on this phone while the account holds another counts as not yet saved: "Sign out" and the rest send it first.
      const r = await history({ dirs: [ROOT, ROOT], rows: R, name: acct(), strict: true, switched: true, script: [S6(0, 'start', { id: 'k1', v: '2026-11-20' }), S6(1, 'start', { id: 'k2', v: '2026-11-20' }), S6(1, 'tick', { i: 0 }), S6(0, 'check')] });
      const held = r.phones.filter(P => (JSON.parse(P.ls.get(P.E.KEY + '.rows.now') || '{}').held || null) !== null);
      ok(held.length === 1 && held[0].E.hasUnsent() === true, 'a workout kept on its own phone counts as not yet saved there', held.map(P => P.name));
    }
    {
      // The switch is written only over the account as this phone read it: another phone's write in between refuses it whole, and nothing changed.
      const name = acct();
      const r = await history({ dirs: [ROOT, ROOT], rows: R, name, strict: true, script: [S6(0, 'check')] });
      const [A, B] = r.phones;
      let fired = false;
      A.hook = async (kind, when) => { if (!fired && kind === 'rows-push' && when === 'before') { fired = true; await r.run(S6(1, 'note', { id: 's2', v: 'written during the switch' })); } };
      const first = await A.E.switchNow(); A.hook = null;
      const layout = JSON.parse((await r.C.rows()).find(x => x.kind === 'meta' && x.id === 'layout').body);
      ok(first === false && layout.decides === 'docs', 'a switch that another phone wrote a row ahead of is refused whole', { first, layout });
      await r.check();
      const again = await A.E.switchNow();
      await r.check();
      ok(again === true && said(r).length === 0, 'and the next one, made in step, switches, nothing lost', said(r));
    }
    {
      // An account whose rows decide and whose layout then asks for a newer build: the phone stops and says to update, and sends nothing more.
      const name = acct();
      const r = await history({ dirs: [ROOT, ROOT], rows: R, name, outside: true, strict: true, switched: true, script: [S6(0, 'check')] });
      const [A] = r.phones;
      const L = JSON.parse((await r.C.rows()).find(x => x.kind === 'meta' && x.id === 'layout').body);
      await R.call(name, 'records', 'push', [[{ kind: 'meta', id: 'layout', body: JSON.stringify({ ...L, level: 3, gen: L.gen + 1 }), t: r.clock.t + 1000, dev: 'dev-new', a: 0 }]]);
      await r.run(S6(0, 'note', { id: 's1', v: 'typed after the account asked for more' }));
      await A.sync();
      const row = (await r.C.rows()).find(x => x.kind === 'session' && x.id === 's1');
      ok(A.E.cloud.status === 'offline' && A.E.cloud.err === A.E.ROWS_UPDATE && !/typed after/.test(row.body) && A.state().sessions.find(x => x.id === 's1').notes === 'typed after the account asked for more', 'once the rows decide, an account that asks for a newer build stops the phone, which says to update and keeps what it typed', { status: A.E.cloud.status, err: A.E.cloud.err, row: row.body.slice(0, 80) });
    }
    lockCase = async dir => {
      // A tab frozen in the background while it holds the rows' lock never stops the other tab from saving: it waits LOCK_MS, then saves.
      const name = acct();
      const r = await history({ dirs: [dir, dir], tabs: { 1: 0 }, rows: R, name, strict: true, switched: true, script: [S6(0, 'check')] });
      const [A, B] = r.phones;
      let froze = false;
      A.hook = async (kind, when) => { if (!froze && kind === 'rows-pull' && when === 'before') { froze = true; A.freeze(); } };
      // Not waited for: the tab's own request waits until it is thawed.
      const aGoing = r.run(S6(0, 'note', { id: 's1', v: 'typed in the tab that froze' }));
      for (let i = 0; i < 2000 && !froze; i++) await new Promise(q => setImmediate(q));
      A.hook = null;
      if (!froze) return ['the first tab never froze in its pass'];
      B.edit(S => { S.sessions.find(x => x.id === 's2').notes = 'typed in the other tab'; });
      const going = B.flush();
      // The phone's clock on, its timers fired, until the sync that waited for the lock has saved (each wait is LOCK_MS).
      let done = false;
      void going.then(() => { done = true; });
      for (let i = 0; i < 12 && !done; i++) { r.clock.t += 6000; B.fire(); for (let j = 0; j < 200 && !done; j++) await new Promise(q => setImmediate(q)); }
      const row = (await r.C.rows()).find(x => x.kind === 'session' && x.id === 's2');
      const out = [];
      if (!done || !row || !/typed in the other tab/.test(row.body)) out.push('the other tab did not save while the frozen tab held the lock: ' + JSON.stringify({ done, row: row && row.body.slice(0, 60), status: B.E.cloud.status, errors: B.errors().slice(-3), note: B.state().sessions.find(x => x.id === 's2').notes }));
      A.thaw();
      await aGoing;
      await r.check();
      out.push(...said(r));
      return out;
    };
    {
      const out = await lockCase(ROOT);
      ok(out.length === 0, 'a tab frozen holding the rows\' lock never stops the other tab from saving', out.slice(0, 3));
      const dir = brokenCopy('the lock waited for without end', `    stop.abort();\n`, ``);
      const bad = await lockCase(dir).catch(e => ['crashed ' + e.message]);
      ok(bad.length > 0, 'the case fails with the lock waited for without end', 'nothing failed');
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const lookCase = async dir => {
      /* A document written just before the switch, its row not yet written (that phone's push lost): the one look at the
         switch crosses it, records first and the frozen rows after, so a look stopped between the two writes is crossed
         again; frozen first, the record's change would be taken as crossed and lost. */
      const r = await history({ dirs: [dir, dir], rows: R, name: acct(), strict: true, switchable: true, script: [S6(0, 'check')] });
      const [A, B] = r.phones;
      B.drop = { kind: 'rows-push', when: 'before', n: 5 };
      await r.run(S6(1, 'note', { id: 's3', v: 'from B before the switch' }));
      B.drop = null; B.off = true;
      let n = 0;
      A.hook = async (kind, when) => { if (kind === 'rows-push' && when === 'before' && ++n === 3) throw new Error('rows: no answer in time'); };
      const sw = await A.E.switchNow();
      A.hook = null; B.off = false;
      if (!sw) return ['the account did not switch'];
      await r.check();
      const out = [];
      for (const P of r.phones) { const s3 = P.state().sessions.find(x => x.id === 's3'); if (!s3 || s3.notes !== 'from B before the switch') out.push(`${P.name} lost what B wrote just before the switch (${s3 && s3.notes})`); }
      return out;
    };
    {
      const out = await lookCase(ROOT);
      ok(out.length === 0, 'a document written just before the switch, its look stopped half way, still reaches the rows', out.slice(0, 3));
      const dir = brokenCopy('the frozen rows written before their records', `  for (let i = 0; i < out.length; i += WRITE_ROWS)
    if (!rec(await soon(R.push(out.slice(i, i + WRITE_ROWS))))) return false;
  for (let i = 0; i < moved.length; i += WRITE_ROWS)
    if (!rec(await soon(R.push(moved.slice(i, i + WRITE_ROWS))))) return false;`, `  for (let i = 0; i < moved.length; i += WRITE_ROWS)
    if (!rec(await soon(R.push(moved.slice(i, i + WRITE_ROWS))))) return false;
  for (let i = 0; i < out.length; i += WRITE_ROWS)
    if (!rec(await soon(R.push(out.slice(i, i + WRITE_ROWS))))) return false;`);
      const bad = await lookCase(dir).catch(e => ['crashed ' + e.message]);
      ok(bad.length > 0, 'the case fails with the frozen rows written before their records', 'nothing failed');
      fs.rmSync(dir, { recursive: true, force: true });
    }
    {
      // An account whose documents are not guarded never switches.
      const name = acct();
      const r = await history({ dirs: [ROOT, ROOT], rows: R, name, strict: true, script: [S6(0, 'check')] });
      const A = r.phones[0];
      const g = A.E.cloud.db.rows.guarded; A.E.cloud.db.rows.guarded = async () => null;
      const sw = await A.E.switchNow(); A.E.cloud.db.rows.guarded = g;
      ok(sw === false, 'an account whose documents are not guarded is never switched', sw);
    }
    {
      // Histories from seeds once the rows decide: two phones, three, the account switching midway, two tabs of one phone.
      const N = Number(process.env.ROWS_SEEDS || 40);
      const runs = [['two phones', { dirs: 2, switched: true, from: 1, n: N }], ['three phones', { dirs: 3, switched: true, from: 5001, n: Math.ceil(N / 2) }], ['the account switched midway on two phones', { dirs: 2, switchable: true, from: 101, n: N }], ['two tabs of one phone and a second phone', { dirs: 3, tabs: { 1: 0 }, switched: true, from: 201, n: Math.ceil(N / 2) }]];
      for (const [what, o] of runs) {
        let bad = 0, first = null, sw = 0; const known = {}; const t0 = Date.now();
        for (let seed = o.from; seed < o.from + o.n; seed++) {
          const r = await history({ dirs: Array(o.dirs).fill(ROOT), tabs: o.tabs, seed, steps: 60, rows: R, name: acct(), strict: true, switched: o.switched, switchable: o.switchable });
          if (r.switchedAt >= 0) sw++;
          for (const k of Object.keys(r.known)) known[k] = (known[k] || 0) + 1;
          if (said(r).length) { bad++; if (!first) first = { seed, said: said(r).slice(0, 2), script: told(r.script).slice(0, 400) }; }
        }
        ok(bad === 0, `${o.n} strict histories once the rows decide, ${what}${o.switchable ? ` (${sw} switched)` : ''}: the lifter's rules hold (${Math.round((Date.now() - t0) / 1000)} s)`, first);
        if (Object.keys(known).length) console.log('     counted apart, not failed: ' + Object.keys(known).map(k => `${k} (${known[k]} histories)`).join('; '));
      }
    }
    /* A copy of the rows' sync with one rule broken fails a case. */
    const BROKEN_DECIDE = [
      ['a write whose answer was lost read as another phone\'s', `if (o && o.t === X.t && o.dev === X.dev && o.a === X.a && o.place === placeOf(X) && o.s === X.s) {`, `if (false && o) {`, ['a write whose answer was lost is this phone\'s own']],
      ['two copies of one workout\'s session decided by the later edit', `if (mineLive && theirsLive && m.kind === 'session' && baseFor(W, m.id) && g.body)`, `if (false && mineLive)`, ['one workout finished on two phones keeps every set', 'the saved session edited while the other phone ticks']],
      ['a different workout swapped into the account', `return way(M, false, { held: { id: M.id, copy: A && A.id === M.id ? A : null } });`, `return way(T, false, { held: null });`, ['two different workouts each stay on their own phone']],
      ['the join of a workout closed elsewhere kept to its ticked sets', `const kept = have ? draftSession(lost, true) : draftSession(lost),`, `const kept = draftSession(lost),`, ['a date or a note changed on the phone behind joins the session']],
      ['a copy only put back taken as an edit', `if (putBack(m, h) && theirsLive && !theirsBack) return { v: 'take', clash: false };`, ``, ['a put-back that meets an edit it had not seen keeps the edit', 'a copy only put back never beats an edit made elsewhere']],
      ['a put-back kept where the answer says it replaced an edit', `if (putBack(mine.get(g.k), was)) {`, `if (false) {`, ['a put-back written over an edit it had not seen gives the edit back']],
      ['a held workout let go while still open', `  if (M && M.id === W.held.id) return;`, `  if (false) return;`, ['two different workouts each stay on their own phone']],
      ['a workout this phone finished elsewhere not joined when the account opened another', `  if (M && !M.editingId && state.sessions.some(s => s.id === M.id) && (!T || T.id !== M.id)) {`, `  if (false && M) {`, ['a workout finished elsewhere joins its session whatever opens next']]
    ];
    for (const [name, from, to, which] of BROKEN_DECIDE) {
      let out = [];
      const dir = brokenCopy(name, from, to);
      try { out = await decideCases(dir, R, which); } catch (e) { out = ['crashed: ' + String((e && e.message) || e).slice(0, 120)]; }
      ok(out.length > 0, `the cases fail on the rows' sync with one rule broken: ${name}`, 'nothing failed');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (part('gate')) {
    /* ---------- 7. the switch by itself (decision 4), and what holds it ---------- */
    const DAY = 24 * 3600000;
    const layoutOf = async r => { const L = (await r.C.rows()).find(x => x.kind === 'meta' && x.id === 'layout'); return L ? JSON.parse(L.body) : null; };
    const decides = async r => ((await layoutOf(r)) || {}).decides;
    const line = P => { const d = P.E.rowsDiag(); return d ? d.line + (d.hold ? ' | ' + d.hold.text : '') : ''; };
    /** A day on which the phones given are opened: the clock moved on a day, then every phone given syncs until quiet. */
    const day = async (r, on) => { r.clock.t += DAY; for (const P of r.phones) P.off = !on.includes(P.name); for (let i = 0; i < 4; i++) { r.clock.t += 61000; for (const P of r.phones) if (on.includes(P.name)) { await P.tick(); await P.sync(); } } for (const P of r.phones) P.off = false; };
    const gateCases = {
      // One phone, its daily checks clean on three days: the account switches by itself at the third, not before.
      async 'one phone switches by itself at its third clean day'(dir) {
        const out = [];
        const r = await history({ dirs: [dir], rows: R, name: acct(), strict: true, switchable: true, script: [S6(0, 'check')] });
        const [A] = r.phones;
        const seen = [line(A)];
        if ((await decides(r)) !== 'docs') out.push('switched at the first check');
        await day(r, ['A']); seen.push(line(A));
        if ((await decides(r)) !== 'docs') out.push('switched at the second clean day');
        await day(r, ['A']); seen.push(line(A));
        if ((await decides(r)) !== 'rows') out.push('did not switch at the third clean day: ' + seen.join(' / '));
        if (!/1 of 3 clean days/.test(seen[0]) || !/2 of 3 clean days/.test(seen[1])) out.push('the line does not count the days: ' + seen.join(' / '));
        if (!/^Saving by rows since /.test(line(A))) out.push('after the switch the line says: ' + line(A));
        await r.run(S6(0, 'note', { id: 's1', v: 'after the switch' })); await r.check();
        out.push(...said(r));
        return out;
      },
      // On the preview no clean days are needed: the first daily check switches.
      async 'the preview switches at its first daily check'(dir) {
        const r = await history({ dirs: [dir], rows: R, name: acct(), strict: true, switchable: true, env: 'preview', script: [S6(0, 'check')] });
        return (await decides(r)) === 'rows' ? said(r) : ['not switched: ' + line(r.phones[0])];
      },
      // A second phone not opened for three days holds the switch (its clean days are not recent); Forget it lets it go.
      async 'a device not opened lately holds the switch until it is forgotten'(dir) {
        const out = [];
        const r = await history({ dirs: [dir, dir], rows: R, name: acct(), strict: true, switchable: true, script: [S6(0, 'check')] });
        const [A, B] = r.phones;
        await day(r, ['A']); await day(r, ['A']); await day(r, ['A']);
        if ((await decides(r)) !== 'docs') out.push('switched while B had not been opened for three days');
        const d = A.E.rowsDiag();
        if (!d || !d.hold || d.hold.dev !== B.E.cloud.devId || !/^Waiting for another device, 0 of 3 clean days, last seen /.test(d.hold.text)) out.push('the line does not name B: ' + line(A));
        if (!(await A.E.forgetDevice(B.E.cloud.devId))) out.push('Forget it was not written');
        await day(r, ['A']);
        if ((await decides(r)) !== 'rows') out.push('not switched once B was forgotten: ' + line(A));
        await r.check();
        out.push(...said(r));
        return out;
      },
      // B's three clean days are long past (it has not been opened for three days): they no longer count.
      async 'clean days long past do not count'(dir) {
        const out = [];
        const name = acct();
        const r = await history({ dirs: [dir, dir], rows: R, name, strict: false, outside: true, switchable: true, script: [S6(0, 'check')] });
        const [A, B] = r.phones;
        // Day 2: a difference on A alone (its row of s3 changed from outside while B is not opened), so A's count restarts and B's does not.
        r.clock.t += DAY; B.off = true;
        await R.call(name, 'records', 'push', [[{ kind: 'session', id: 's3', body: '{"id":"s3","notes":"not what the documents hold"}', t: r.clock.t + 5000, dev: 'dev-other', a: 0 }]]);
        for (let i = 0; i < 4; i++) { r.clock.t += 61000; await A.tick(); await A.pull(); }
        B.off = false;
        for (let i = 0; i < 3; i++) { r.clock.t += 61000; await B.tick(); await B.sync(); }
        await day(r, ['A', 'B']);
        if (!/3 of 3 clean days/.test(line(B))) out.push('B has not its three clean days: ' + line(B));
        if ((await decides(r)) !== 'docs') out.push('switched while A had a difference');
        await day(r, ['A']); await day(r, ['A']); await day(r, ['A']);
        if ((await decides(r)) !== 'docs') out.push('switched on clean days of B three days old');
        return out;
      },
      // Both phones opened each day: three clean days on each, and the account switches; nothing either holds is lost.
      async 'two phones each clean three days switch, nothing lost'(dir) {
        const out = [];
        const r = await history({ dirs: [dir, dir], rows: R, name: acct(), strict: true, switchable: true, script: [S6(0, 'check')] });
        await day(r, ['A', 'B']); await r.run(S6(1, 'note', { id: 's2', v: 'from B on day 2' }));
        await day(r, ['A', 'B']);
        if ((await decides(r)) !== 'rows') out.push('not switched: ' + line(r.phones[0]) + ' / ' + line(r.phones[1]));
        await r.run(S6(0, 'note', { id: 's1', v: 'after' })); await r.check();
        for (const P of r.phones) { const s = P.state().sessions.find(x => x.id === 's2'); if (!s || s.notes !== 'from B on day 2') out.push(P.name + ' lost the note of day 2'); }
        out.push(...said(r));
        return out;
      },
      // A phone on 2.78.2 (its own row at level 1) holds the switch as a device on an older version.
      async 'a device on 2.78 holds the switch'(dir) {
        const old = sourceAt(DOCS_DECIDE);
        const r = await history({ dirs: [dir, old], rows: R, name: acct(), strict: false, script: [S6(0, 'check')] });
        await day(r, ['A', 'B']); await day(r, ['A', 'B']); await day(r, ['A', 'B']);
        const d = r.phones[0].E.rowsDiag();
        const out = [];
        if ((await decides(r)) !== 'docs') out.push('switched while a phone on 2.78 syncs the account');
        if (!d || !d.hold || !/^Waiting for a device on an older version, last seen /.test(d.hold.text)) out.push('the line does not say so: ' + line(r.phones[0]));
        return out;
      },
      // A phone on 2.77.1, which writes no row of its own, is seen by the documents it writes, and holds the switch.
      async 'a device that writes no row of its own holds the switch'(dir) {
        const before = sourceAt(BEFORE);
        const r = await history({ dirs: [dir, before], rows: R, name: acct(), strict: false, script: [S6(0, 'check')] });
        await day(r, ['A', 'B']); await r.run(S6(1, 'note', { id: 's2', v: 'from 2.77' }));
        await day(r, ['A', 'B']); await day(r, ['A', 'B']);
        const d = r.phones[0].E.rowsDiag();
        const out = [];
        if ((await decides(r)) !== 'docs') out.push('switched while a phone on 2.77 writes the documents');
        if (!d || !d.hold || !/^Waiting for a device on an older version/.test(d.hold.text)) out.push('the line does not say so: ' + line(r.phones[0]));
        return out;
      },
      // A difference found later on a day already checked clean is written to the device's row the same day: no other phone reads that device as clean that day.
      async 'a difference found after the day was checked holds the switch that day'(dir) {
        const out = [];
        const name = acct();
        const r = await history({ dirs: [dir, dir], rows: R, name, strict: false, outside: true, switchable: true, script: [S6(0, 'check')] });
        const [A, B] = r.phones;
        await day(r, ['A', 'B']);
        r.clock.t += DAY; A.off = true;
        for (let i = 0; i < 3; i++) { r.clock.t += 61000; await B.tick(); await B.sync(); }
        /* B's day 3 is checked clean and its row written; then the account's row of s3 is changed from outside the
           phones, which B's next pass (after a change on B) records as a difference and puts right, so A, reading
           later, finds the rows in step and knows of it only by B's row. */
        await R.call(name, 'records', 'push', [[{ kind: 'session', id: 's3', body: '{"id":"s3","notes":"not what the documents hold"}', t: r.clock.t + 5000, dev: 'dev-other', a: 0 }]]);
        await r.run(S6(1, 'note', { id: 's2', v: 'a note on B, read by its next pass' }));
        for (let i = 0; i < 4; i++) { r.clock.t += 61000; await B.tick(); await B.pull(); }
        if (!/1 difference/.test(line(B))) out.push('B found no difference: ' + line(B));
        A.off = false;
        for (let i = 0; i < 4; i++) { r.clock.t += 61000; await A.tick(); await A.sync(); }
        if ((await decides(r)) !== 'docs') out.push('A switched on the day B found a difference');
        return out;
      },
      // Decision 2: a record another phone deleted is no difference; one the documents lost with no device deleting it is.
      async 'a record deleted on another phone keeps the count; one gone with no delete restarts it'(dir) {
        const out = [];
        const name = acct();
        const r = await history({ dirs: [dir, dir], rows: R, name, strict: false, outside: true, switchable: true, script: [S6(0, 'check')] });
        const [A] = r.phones;
        await r.run(S6(1, 'bw', { id: 'w9', v: 81.5, d: '2026-11-10' })); await r.check();
        await day(r, ['A', 'B']);
        await r.run(S6(1, 'del', { id: 's4' })); await r.run(S6(1, 'forgood', { id: 's4' })); await r.check();
        if (!/2 of 3 clean days/.test(line(A))) out.push('a delete on B held the count: ' + line(A));
        // The documents lose s1 with no device deleting it: its document written again without it, as from A.
        const k = [...r.C.store.keys()].find(x => { const d = JSON.parse(r.C.store.get(x)); return typeof d.json === 'string' && JSON.parse(d.json).sessions && JSON.parse(d.json).sessions.some(z => z.id === 's1'); });
        const d = JSON.parse(r.C.store.get(k)), j = JSON.parse(d.json);
        j.sessions = j.sessions.filter(z => z.id !== 's1');
        r.C.store.set(k, JSON.stringify({ ...d, json: JSON.stringify(j), at: r.clock.t, w: A.E.cloud.devId + '.zzzz' }));
        await r.check(); await r.check();
        if (!/1 difference, 1 removed with no delete/.test(line(A))) out.push('a record gone with no delete is not a difference: ' + line(A));
        await day(r, ['A', 'B']);
        if ((await decides(r)) !== 'docs') out.push('switched although a record went with no delete two days ago');
        return out;
      }
    };
    // The same, with the documents read inside the phone's own pass: the record gone is still noted, and still a difference (REV32-4).
    gateCases['a record gone with no delete during a pass is still a difference'] = async dir => {
      const r = await history({ dirs: [dir, dir], rows: R, name: acct(), strict: false, outside: true, switchable: true, script: [S6(0, 'check')] });
      const [A] = r.phones;
      const k = [...r.C.store.keys()].find(x => { const d = JSON.parse(r.C.store.get(x)); return typeof d.json === 'string' && JSON.parse(d.json).sessions && JSON.parse(d.json).sessions.some(z => z.id === 's1'); });
      const d = JSON.parse(r.C.store.get(k)), j = JSON.parse(d.json);
      j.sessions = j.sessions.filter(z => z.id !== 's1');
      r.C.store.set(k, JSON.stringify({ ...d, json: JSON.stringify(j), at: r.clock.t, w: A.E.cloud.devId + '.zzzz' }));
      let once = true;
      A.hook = async (kind, when) => { if (kind === 'rows-pull' && when === 'after' && once) { once = false; await A.E.cq(A.E.cloudPull); } };
      await r.run(S6(0, 'note', { id: 's2', v: 'typed on A' }));
      A.hook = null; await A.settle();
      if (once || A.state().sessions.some(x => x.id === 's1')) return ['the read of the documents did not run inside the pass'];
      await r.check(); await r.check();
      return /1 difference, 1 removed with no delete/.test(line(A)) ? [] : ['not a difference: ' + line(A)];
    };
    // The same, read by the other tab of the phone while this tab's pass is under way: the pass keeps what that tab noted.
    gateCases['a record gone with no delete, read by the other tab during a pass, is still a difference'] = async dir => {
      const r = await history({ dirs: [dir, dir, dir], tabs: { 1: 0 }, rows: R, name: acct(), strict: false, outside: true, switchable: true, script: [S6(0, 'check')] });
      const [A, B] = r.phones;
      const k = [...r.C.store.keys()].find(x => { const d = JSON.parse(r.C.store.get(x)); return typeof d.json === 'string' && JSON.parse(d.json).sessions && JSON.parse(d.json).sessions.some(z => z.id === 's1'); });
      const d = JSON.parse(r.C.store.get(k)), j = JSON.parse(d.json);
      j.sessions = j.sessions.filter(z => z.id !== 's1');
      r.C.store.set(k, JSON.stringify({ ...d, json: JSON.stringify(j), at: r.clock.t, w: A.E.cloud.devId + '.zzzz' }));
      let once = true;
      A.hook = async (kind, when) => { if (kind === 'rows-pull' && when === 'after' && once) { once = false; await B.E.cq(B.E.cloudPull); } };
      await r.run(S6(0, 'note', { id: 's2', v: 'typed on A' }));
      A.hook = null; await A.settle();
      if (once || B.state().sessions.some(x => x.id === 's1')) return ['the other tab did not read the documents during the pass'];
      await r.check(); await r.check();
      return /1 difference, 1 removed with no delete/.test(line(A)) ? [] : ['not a difference: ' + line(A)];
    };
    const gateRun = async (dir, only) => { const out = []; for (const [n, f] of Object.entries(gateCases)) { if (only && !only.includes(n)) continue; for (const x of await f(dir)) out.push(n + ': ' + x); } return out; };
    for (const n of Object.keys(gateCases)) { const out = await gateRun(ROOT, [n]); ok(out.length === 0, `the switch: ${n}`, out.slice(0, 3)); }
    {
      // On 2.78.2 an account never switches by itself.
      const out = await gateRun(sourceAt(DOCS_DECIDE), ['one phone switches by itself at its third clean day']);
      ok(out.some(x => /did not switch at the third clean day/.test(x)), 'on 2.78.2 the same phone never switches (the case fails there)', out.slice(0, 2));
    }
    const BROKEN_GATE = [
      ['a device not on a build that lets the rows decide counted', `if (!D || D.level < SWITCH_LEVEL) holders.push`, `if (!D) holders.push`, ['a device on 2.78 holds the switch']],
      ['a device seen only by its documents not counted', `if (!holders.some(x => x.dev === w.dev)) holders.push`, `if (false) holders.push`, ['a device that writes no row of its own holds the switch']],
      ['clean days counted however long ago', `    if (n === 0 && daysBetween(D.d, day) > RECENT_DAYS) return 0;\n`, ``, ['clean days long past do not count']],
      ['a device row not written again after a difference', `  if (gone) D.gone++;\n  N.devDay = null;`, `  if (gone) D.gone++;`, ['a difference found after the day was checked holds the switch that day']],
      ['a record gone noted by the other tab written over by the pass', `      for (const k in other.gone) N.gone[k] ??= other.gone[k] ?? 0;\n`, ``, ['a record gone with no delete, read by the other tab during a pass, is still a difference']],
      ['a record gone during a pass not known to the pass', `    for (const k of keys) notes.gone[k] ??= now;`, `    for (const k of keys) void k;`, ['a record gone with no delete during a pass is still a difference']],
      ['a record gone with no delete sent as a plain delete', `      if (!m && N.gone[k] !== undefined) N.wait[k] ??= N.gone[k] ?? now;\n`, ``, ['a record deleted on another phone keeps the count; one gone with no delete restarts it']]
    ];
    for (const [name, from, to, which] of BROKEN_GATE) {
      let out = [];
      const dir = brokenCopy(name, from, to);
      try { out = await gateRun(dir, which); } catch (e) { out = ['crashed: ' + String((e && e.message) || e).slice(0, 120)]; }
      ok(out.length > 0, `the switch's cases fail with one rule broken: ${name}`, 'nothing failed');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (part('back')) {
    /* ---------- 8. Switch back (5.1, 5.2) ---------- */
    const DAY = 24 * 3600000;
    const layoutOf = async r => { const L = (await r.C.rows()).find(x => x.kind === 'meta' && x.id === 'layout'); return L ? JSON.parse(L.body) : null; };
    const day = async r => { r.clock.t += DAY; for (let i = 0; i < 4; i++) { r.clock.t += 61000; for (const P of r.phones) { await P.tick(); await P.sync(); } } };
    const backCases = {
      // A switches back; B, offline then, had typed a note: it reaches the documents, both logs end the same, nothing lost, and the account never switches again by itself.
      async 'switched back from one phone, the other crosses back with what it typed'(dir) {
        const out = [];
        const r = await history({ dirs: [dir, dir], rows: R, name: acct(), strict: true, switched: true, script: [S6(0, 'note', { id: 's1', v: 'after the switch' }), S6(0, 'check'), S6(1, 'off'), S6(1, 'note', { id: 's2', v: 'typed on B offline' })] });
        const [A, B] = r.phones;
        const before = await layoutOf(r);
        const got = await A.E.switchBack();
        if (got !== 'done') return ['Switch back said ' + got];
        const L = await layoutOf(r);
        if (L.decides !== 'docs' || L.level !== 1 || L.hold !== true || L.made !== before.made || L.gen !== before.gen + 1) out.push('the layout written back is ' + JSON.stringify(L));
        const docs = r.C.all('u');
        const inDocs = id => Object.values(docs).flatMap(d => (d && d.sessions) || []).find(x => x.id === id);
        if (!inDocs('s1') || inDocs('s1').notes !== 'after the switch') out.push('the documents do not hold what the rows decided');
        await r.run(S6(1, 'on')); await r.check();
        for (const P of r.phones) { const s2 = P.state().sessions.find(x => x.id === 's2'); if (!s2 || s2.notes !== 'typed on B offline') out.push(P.name + ' lost what B typed offline'); }
        if (B.E.rowsDecideHere() || A.E.rowsDecideHere()) out.push('a phone still lets the rows decide');
        await day(r); await day(r); await day(r);
        if ((await layoutOf(r)).decides !== 'docs') out.push('the account switched again by itself after Switch back');
        out.push(...said(r));
        return out;
      },
      // A phone on 2.78.2, stopped by the switch, syncs the account again once it is switched back, and leaves the layout as written.
      async 'after Switch back a phone on 2.78.2 syncs again and keeps the layout'(dir) {
        const out = [];
        const old = sourceAt(DOCS_DECIDE);
        const r = await history({ dirs: [dir, dir, old], rows: R, name: acct(), strict: false, switched: true, script: [S6(0, 'note', { id: 's1', v: 'after the switch' }), S6(0, 'check')] });
        const [A, , O] = r.phones;
        if (O.E.cloud.status !== 'offline') out.push('the phone on 2.78.2 did not stop at the switch: ' + O.E.cloud.status);
        if ((await A.E.switchBack()) !== 'done') return ['Switch back failed'];
        const L = await layoutOf(r);
        await r.run(S6(2, 'note', { id: 's3', v: 'typed on 2.78.2' })); await r.check();
        for (const P of r.phones) for (const [id, v] of [['s1', 'after the switch'], ['s3', 'typed on 2.78.2']]) { const s = P.state().sessions.find(x => x.id === id); if (!s || s.notes !== v) out.push(`${P.name} does not hold "${v}"`); }
        if (JSON.stringify(await layoutOf(r)) !== JSON.stringify(L)) out.push('the phone on 2.78.2 wrote the layout again: ' + JSON.stringify(await layoutOf(r)));
        return out;
      }
    };
    // A phone on 2.77.1 after the switch: its writes refused by the guard, its log kept; once it updates, what it typed reaches the account.
    backCases['a phone on 2.77.1 after the switch keeps its log, and what it typed reaches the account once it updates'] = async dir => {
      const out = [];
      const r = await history({ dirs: [dir, sourceAt(BEFORE)], rows: R, name: acct(), strict: false, switched: true, script: [S6(0, 'check')] });
      const [A, O] = r.phones;
      const before = r.C.writes.length;
      await r.run(S6(1, 'note', { id: 's2', v: 'typed on 2.77.1 after the switch' }));
      for (let i = 0; i < 3; i++) { r.clock.t += 61000; await O.tick(); await O.sync(); }
      if (r.C.writes.slice(before).some(w => w.who === 'B')) out.push('a document write of the phone on 2.77.1 went through after the switch');
      if (O.state().sessions.find(x => x.id === 's2').notes !== 'typed on 2.77.1 after the switch') out.push('the phone on 2.77.1 lost what it typed');
      if (O.E.cloud.status === 'synced') out.push('the phone on 2.77.1 says its log is saved');
      const U = phoneOf(dir, { name: 'B', clock: r.clock, storage: O.ls, seed: 31 }).start(); U.signIn(r.C);
      for (let i = 0; i < 3; i++) { r.clock.t += 61000; await U.tick(); await U.sync(); await A.tick(); await A.sync(); }
      for (const P of [A, U]) { const s2 = P.state().sessions.find(x => x.id === 's2'); if (!s2 || s2.notes !== 'typed on 2.77.1 after the switch') out.push(`${P === A ? 'A' : 'the updated phone'} does not hold what was typed on 2.77.1`); }
      return out;
    };
    const backRun = async (dir, only) => { const out = []; for (const [n, f] of Object.entries(backCases)) { if (only && !only.includes(n)) continue; for (const x of await f(dir)) out.push(n + ': ' + x); } return out; };
    for (const n of Object.keys(backCases)) { const out = await backRun(ROOT, [n]); ok(out.length === 0, `Switch back: ${n}`, out.slice(0, 3)); }
    const BROKEN_BACK = [
      ['Switch back without made', `      made: N.made,\n      decides: 'docs',`, `      made: null,\n      decides: 'docs',`, ['after Switch back a phone on 2.78.2 syncs again and keeps the layout']],
      ['Switch back without hold', `      at: top,\n      hold: true\n`, `      at: top\n`, ['switched back from one phone, the other crosses back with what it typed']],
      ['Switch back at level 2', `      level: BACK_LEVEL,`, `      level: 2,`, ['after Switch back a phone on 2.78.2 syncs again and keeps the layout']],
      ['the other phone not crossing back', `      await S.crossBack();\n`, ``, ['switched back from one phone, the other crosses back with what it typed']]
    ];
    for (const [name, from, to, which] of BROKEN_BACK) {
      let out = [];
      const dir = brokenCopy(name, from, to);
      try { out = await backRun(dir, which); } catch (e) { out = ['crashed: ' + String((e && e.message) || e).slice(0, 120)]; }
      ok(out.length > 0, `Switch back's cases fail with one rule broken: ${name}`, 'nothing failed');
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (part('broken')) {
    const BROKEN = [
      ['a row a read brought in waits only for the pass that read it', `      if (MIRRORED.has(X['kind'])) N.wait[k] ??= Date.now();`, ``, ['a row read by a pass that stopped early is still left alone by the next pass']],
      ['a count written during a pass is written over by the pass', `    if (own) written = text;
    return;
  }
  if (prefSet(ROWS_KEY, text) && own) written = text;`, `    written = text;
    return;
  }
  if (prefSet(ROWS_KEY, text)) written = text;`, ['a record a sync removed while a pass was under way is still counted']],
      ['the layout is forgotten when the app is closed', `  const mine = !!L && L['acct'] === cloud.uid;`, `  const mine = false && !!L;`, ['an account that asks for a newer build: the phone stops syncing and says to update']],
      ['a level that is not a number is read as the first', `typeof lv === 'number' && Number.isFinite(lv) && lv >= 1 ? lv : Infinity`, `typeof lv === 'number' && Number.isFinite(lv) && lv >= 1 ? lv : 1`, ['an account that asks for a newer build: the phone stops syncing and says to update']],
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
      ['a tab writes the notes it read before over what another tab has stored since', [[`notes.ep !== ep || stored !== written) {`, `notes.ep !== ep) {`], [`if (stored !== null && stored !== written) {`, `if (stored === 'never') {`]], '', ['a second tab of the phone never writes its older notes over what the first recorded']],
      ['a mark read by its time alone, not its device', `  if (h.saw === null || h.saw !== h.t || h.sawDev !== h.dev) return 'log';`, `  if (h.saw === null || h.saw !== h.t) return 'log';`, ['a mark of another copy, the app\'s own write, an account begun again, and the photo']],
      ['the app\'s own write sent with its count unmoved', `  if (h && t === h.t) return { t: h.t, dev: h.dev, a: h.a + 1 };`, `  if (h && t === h.t) return { t: h.t, dev: h.dev, a: h.a };`, ['a mark of another copy, the app\'s own write, an account begun again, and the photo']],
      ['an account begun again is not noticed', `  if (!none() && (ansNum(p['top']) < N.n || (N.made !== null && (!L || L.made !== N.made)))) {`, `  if (!none() && ansNum(p['top']) < -1) {`, ['a mark of another copy, the app\'s own write, an account begun again, and the photo']],
      ['the photo has no row', `  if (photo && (photoHeld() !== null || N.rows['photo/photo'])) mine.set('photo/photo', photo);`, ``, ['a mark of another copy, the app\'s own write, an account begun again, and the photo']],
      ['the mirror writes the workout again after a read that says the rows decide', `      if (rowsDecide()) return;
    }`, `    }`, ['a phone still mirroring never writes the workout over the account\'s once the rows decide']],
      ['the first layout written at the build\'s level', `level: FIRST_LEVEL, gen: 1`, `level: LEVEL, gen: 1`, ['the first layout says level 1, whatever the level of the build that writes it']],
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
