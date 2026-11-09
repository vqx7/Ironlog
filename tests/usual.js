// V's one rule for every session as one table (CL-2, 2026-11-09): a lift's session sets its next target only when it
// did its usual load and reps for the sets it is held to. Each row is a case of the rule, with the release or finding
// that made it: a routine, sessions saved through Finish's own function (withPlanSets, which records the sets each lift
// is held to, `ps`), and the analytics index's verdict on each session (`short`: 'sets', 'reading' or none). The
// modules run in Node, bundled from src/app/ as the page's script is; `node tests/usual.js <dir>` runs another
// checkout's src/app/ (the build before). No browser.
const path = require('path');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const APP = path.resolve(process.argv[2] ? path.join(process.argv[2], 'src', 'app') : path.join(__dirname, '..', 'src', 'app'));
const built = require('esbuild').buildSync({
  stdin: { contents: "export { normalize } from './normalize'; export { modelOf } from './model'; export { IDXIn } from './analytics'; export { withPlanSets } from './routines';", resolveDir: APP, loader: 'ts', sourcefile: 'usual-entry.ts' },
  bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent', banner: { js: '"use strict";' }
});
const mod = { exports: {} };
// The install's starter routine reads the page's window; the six-day routine every suite starts with.
globalThis.window = { IRONLOG_STARTER: 'legacy' };
new Function('module', 'exports', 'require', built.outputFiles[0].text)(mod, mod.exports, require);
const E = mod.exports;

const EX = 'bench';
const day = (id, items) => ({ id, name: id, rest: false, items: items.map(([sets, lo, hi], k) => ({ uid: `${id}-${k}`, exId: EX, sets, repMin: lo, repMax: hi, rir: 1, rest: 120, inc: 2.5, ss: null })) });
/** A routine whose days plan the lift as given: [[sets, repMin, repMax], ...] a day. */
const routineOf = days => ({ id: 'R', name: 'Test', schedule: 'cycle', days: days.map((items, i) => day('D' + i, items)) });
const DATES = n => Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(2026, 8, 1 + i * 3)); return d.toISOString().slice(0, 10); });

/** Runs one row: sessions in order, each { day: index or null (blank), free, sets: [[w, r], ...], rr, light, gap },
    saved through withPlanSets; then `after` may change the routine before the log is read. Returns each session's
    `ps` and the index's `short`. */
function run(row) {
  const R = routineOf(row.days);
  const st = E.normalize({});
  st.routines = [R]; st.activeRoutineId = 'R';
  if (row.freestyle) st.settings.todayMode = 'free';
  const dates = DATES(row.sessions.length + 20);
  let di = 0;
  st.sessions = row.sessions.map((s, i) => {
    if (s.gap) di += s.gap;
    const date = dates[di++];
    const dayId = s.day == null ? null : 'D' + s.day;
    const it = s.day == null ? null : R.days[s.day].items[0];
    const rr = s.rr || (it ? [it.repMin, it.repMax] : null);
    const ex = [{ exId: EX, note: '', rr, sets: s.sets.map(([w, r]) => ({ w, r, rir: null, warm: false, drop: false })), ...(s.ps0 ? { ps: s.ps0 } : {}) }];
    const d = { editingId: s.edit ? 'old' : null, free: !!s.free, dayId, routineId: 'R' };
    const [saved] = E.withPlanSets(ex, d, [R], { routineId: 'R', freestyle: !!row.freestyle });
    return { id: 's' + i, date, dayIdx: s.day == null ? -1 : s.day, dayId, durMin: null, dayName: '', routineId: 'R', notes: '', deload: false, light: !!s.light, ...(s.free ? { free: true } : {}), ex: [saved], t: i };
  });
  if (row.after) row.after(R);
  const state = E.normalize(st);
  const M = E.modelOf(state, () => dates[dates.length - 1]);
  const xs = E.IDXIn(M).byEx[EX] || [];
  const by = Object.fromEntries(xs.map(x => [x.sid, x]));
  return state.sessions.map(s => ({ ps: s.ex[0].ps ?? null, short: (by[s.id] && by[s.id].short) || null }));
}
const S = (w, r, n) => Array.from({ length: n }, () => [w, r]);

const ROWS = [
  // The rule itself (r54).
  { name: 'three full sessions, then one a set short: short by its sets', days: [[[3, 6, 10]]],
    sessions: [{ day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 2) }],
    want: { short: [null, null, null, 'sets'], ps: [3, 3, 3, 3] } },
  { name: 'every set two reps under the usual at the same load: short by its reading', days: [[[3, 6, 10]]],
    sessions: [{ day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 6, 3) }],
    want: { short: [null, null, 'reading'] } },
  { name: 'a heavier working load than both before it is a step up, never short by its reading (r34.2)', days: [[[3, 6, 10]]],
    sessions: [{ day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(105, 6, 3) }],
    want: { short: [null, null, null] } },
  { name: 'the first session in a range is its own usual', days: [[[3, 6, 10]]],
    sessions: [{ day: 0, sets: S(100, 8, 1) }],
    want: { short: [null] } },
  { name: 'back after a break of more than four weeks, a session is its own usual', days: [[[3, 6, 10]]],
    sessions: [{ day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }, { day: 0, gap: 12, sets: S(80, 8, 2) }],
    want: { short: [null, null, null] } },
  // The sets it is held to: the plan's, saved with the session (339 h, r58).
  { name: '339 h: a 5 x 5 done as 4 x 5 twice stays short, never a 4-set lift', days: [[[5, 4, 6]]],
    sessions: [{ day: 0, sets: S(100, 5, 5) }, { day: 0, sets: S(100, 5, 5) }, { day: 0, sets: S(100, 5, 4) }, { day: 0, sets: S(100, 5, 4) }],
    want: { short: [null, null, 'sets', 'sets'], ps: [5, 5, 5, 5] } },
  { name: 'a plan never yet done is not asked: a 5-set plan done as 3 sets each time is held to 3', days: [[[5, 6, 10]]],
    sessions: [{ day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }],
    want: { short: [null, null, null], ps: [5, 5, 5] } },
  { name: 'more sets than planned: the plan is the most asked (4 done usually, 3 planned, 3 done is full)', days: [[[3, 6, 10]]],
    sessions: [{ day: 0, sets: S(100, 8, 4) }, { day: 0, sets: S(100, 8, 4) }, { day: 0, sets: S(100, 8, 3) }],
    want: { short: [null, null, null] } },
  { name: 'r58: a plan raised later from 3 to 4 sets never rereads the sessions before it', days: [[[3, 6, 10]]],
    sessions: [{ day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }],
    after: R => { R.days[0].items[0].sets = 4; },
    want: { short: [null, null, null], ps: [3, 3, 3] } },
  { name: 'off the routine (no plan, nothing saved), two short sessions in a row: the second is the new usual', days: [[[3, 6, 10]]],
    sessions: [{ day: null, free: true, rr: [6, 10], sets: S(100, 8, 3) }, { day: null, free: true, rr: [6, 10], sets: S(100, 8, 3) }, { day: null, free: true, rr: [6, 10], sets: S(100, 8, 2) }, { day: null, free: true, rr: [6, 10], sets: S(100, 8, 2) }],
    freestyle: true,
    want: { short: [null, null, 'sets', null], ps: [null, null, null, null] } },
  // A blank session, held to the day of the routine it most resembles (r70).
  { name: 'NEW-51: two one-set blank sessions in a row are held to the routine\'s 3 sets, not made a 1-set lift', days: [[[3, 6, 10]]],
    sessions: [{ day: 0, sets: S(100, 8, 3) }, { day: 0, sets: S(100, 8, 3) }, { day: null, sets: S(100, 8, 1) }, { day: null, sets: S(100, 8, 1) }],
    want: { short: [null, null, 'sets', 'sets'], ps: [3, 3, 3, 3] } },
  { name: 'R70-1: planned 5 one day and 3 another, a blank session of 3 is held to 3', days: [[[5, 6, 10]], [[3, 6, 10]]],
    sessions: [{ day: null, sets: S(100, 8, 3) }],
    want: { ps: [3] } },
  { name: 'R70-5: the same routine, a blank session of 5 is held to 5', days: [[[5, 6, 10]], [[3, 6, 10]]],
    sessions: [{ day: null, sets: S(100, 8, 5) }],
    want: { ps: [5] } },
  { name: 'a tie (4 sets between days of 3 and 5) goes to the fewer', days: [[[5, 6, 10]], [[3, 6, 10]]],
    sessions: [{ day: null, sets: S(100, 8, 4) }],
    want: { ps: [3] } },
  { name: 'R70-6: planned 5 x 4-6 and 3 x 8-12, three heavy blank sets are held to the heavy day\'s 5', days: [[[5, 4, 6]], [[3, 8, 12]]],
    sessions: [{ day: null, rr: [4, 6], sets: S(120, 5, 3) }],
    want: { ps: [5] } },
  { name: 'Freestyle: a blank session records no plan, its own sets lead', days: [[[3, 6, 10]]], freestyle: true,
    sessions: [{ day: null, sets: S(100, 8, 1) }],
    want: { ps: [null] } },
  { name: 'an edit keeps the sets saved with the session', days: [[[3, 6, 10]]],
    sessions: [{ day: 0, edit: true, ps0: 4, sets: S(100, 8, 3) }],
    want: { ps: [4] } },
  // Missed sets (r55, r64, r72).
  { name: 'r64 R-1: a missed set is one of the session\'s sets, so 185 x 10, 0, 0 is not short by its sets', days: [[[3, 8, 12]]],
    sessions: [{ day: 0, sets: S(185, 10, 3) }, { day: 0, sets: S(185, 10, 3) }, { day: 0, sets: [[185, 10], [185, 0], [185, 0]] }],
    want: { short: [null, null, 'reading'] } },
  { name: 'R72-8: on a one-set plan, the first set missed then one done reads the missed one, 0: short by its reading', days: [[[1, 8, 12]]],
    sessions: [{ day: 0, sets: S(185, 10, 1) }, { day: 0, sets: S(185, 10, 1) }, { day: 0, sets: [[185, 0], [185, 10]] }],
    want: { short: [null, null, 'reading'] } }
];

for (const row of ROWS) {
  let got;
  try { got = run(row); } catch (e) { ok(false, row.name + ' (ran)', String(e && e.stack || e).slice(0, 600)); continue; }
  const w = row.want;
  const g = { short: got.map(x => x.short), ps: got.map(x => x.ps) };
  ok((!w.short || JSON.stringify(g.short) === JSON.stringify(w.short)) && (!w.ps || JSON.stringify(g.ps) === JSON.stringify(w.ps)), row.name, { want: w, got: g });
}
console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
