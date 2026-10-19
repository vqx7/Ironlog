// Code moved out of the legacy script into src/app/ is the same code
// (ARCHITECTURE.md, the phases). For every declaration a phase moved, this
// compares the module's version with the same declaration in the published
// build the phase started from, after both go through esbuild's printer:
// TypeScript types, formatting and comments do not count, every expression,
// operator, literal and statement does, and so does the kind of declaration
// (const, let, var or function). So a move can type the code and lay it out
// to be read, and this suite still proves the logic did not change by a
// single token.
//
// Equal text is not enough on its own: the same text can mean something else
// if a name in it now points elsewhere (the r50 review planted five such
// changes and each passed the text comparison). So, in a moved module:
// - the top level holds only imports and exported declarations: no private
//   helper, no statement that runs on load, nothing that could change an
//   export after it is made;
// - an import keeps its name (`import { a as b }` would let `b` mean `a`);
// - every name a moved declaration uses resolves as it did in the build it
//   came from: a name that was a legacy declaration is a moved export of this
//   move (in this module, or imported under its own name from a module of the
//   move), a name that was imported from config still is, and a name that was
//   a browser or JavaScript global is not declared or imported in the module
//   (a `declare` in TypeScript leaves no trace in the code, and that is how
//   it is caught).
// And no module outside a move exports a name the move's baseline had as a
// legacy declaration, so moved code cannot sit somewhere this suite does not
// look.
//
// A declaration changed on purpose in a move, or added by one, is listed in
// `changed` or `added` with the release and the reason, and is held to the
// exact code and names its entry states and to an executable check.
const fs = require('fs'); const path = require('path');
const acorn = require('acorn'); const esbuild = require('esbuild');
const { freeNames, scanWrites } = require('../scripts/depmap');
const ROOT = path.join(__dirname, '..'); const APP = path.join(ROOT, 'src', 'app');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };

const MOVES = [
  // Phase 2 (r50): the bottom layers, from r49's legacy script.
  { release: 'r50', baseline: 'baselines/r49.html', modules: ['util', 'units', 'library', 'routines', 'formulas'], changed: {} },
  // Phase 3a (r51): the rest of the self-contained code, from r50's (ARCHITECTURE.md). Four modules grow.
  // The store owns the shared state: ui, cloud, acct and acctWait move unchanged;
  // state is declared there without a value, and the legacy script's one
  // assignment at start, like every later one, goes through setState.
  { release: 'r51', baseline: 'baselines/r50.html', modules: ['util', 'library', 'routines', 'formulas', 'format', 'layout', 'icons', 'profile', 'records', 'gym', 'chunks', 'merge', 'session', 'loads', 'prs', 'trend', 'volume', 'goals', 'charts', 'importing', 'feedback', 'store'],
    changed: { state: { why: 'r51: declared in the store with no value; the save is put in it by setState(load()) where `let state=load();` stood', code: 'let state = undefined;', uses: [], check: m => m.state === undefined } },
    added: { setState: { why: 'r51: an import cannot be assigned to, so the legacy script replaces the log through this; it returns the value as the assignment did', code: 'function setState(next) { return state = next; }', uses: ['state'], check: m => { const a = { sessions: [] }, b = { sessions: [1] }; return m.setState(a) === a && m.state === a && m.setState(b) === b && m.state === b && m.setState.length === 1; } } },
    // The legacy script left behind must be r50's, statement for statement,
    // once each setState(x) is read back as the assignment it replaced.
    legacy: { calls: { setState: 'state' }, statements: { 'state = load();': 'let state = load();' } },
    // The one change on the page outside the app script (two iPhone users,
    // 2026-10-17): the installed app's page is held to the screen's height on
    // iOS 26 (src/02-style.css says why; tests/ios-bar.js holds it).
    page: { why: 'the tab bar on iOS 26 home-screen apps (tests/ios-bar.js)', adds: [{ after: "html{scroll-padding-top:calc(var(--head-h) + env(safe-area-inset-top,0px));-webkit-text-size-adjust:100%}\n", text: "/* iOS 26's home-screen app (r51; two iPhone users, 2026-10-17: the tab bar\n   rises and the page shrinks when tapping through the tabs, on History,\n   Settings and sometimes Plan). With viewport-fit=cover and the translucent\n   status bar, iOS 26 gives a page shorter than the screen a viewport shorter\n   by the status bar's height, so the fixed tab bar stops above the bottom\n   edge (frappe-ui pull requests 1284 and 1289). With a real log, Plan (about\n   780 px) is shorter than every current iPhone and Today (about 860 to 920)\n   than the larger ones, while Stats, History and Settings are taller; Plan\n   comes before those three in the bar, so the short viewport may begin on\n   Plan and carry over. That is a reading, not a proof (PENDING 303). In the installed\n   app no page is shorter than the screen now, and none is taller for it:\n   100lvh caps it where iOS has no such bug. Browsers without lvh drop it. */\n@media (display-mode:standalone){html{min-height:min(100lvh,calc(100% + env(safe-area-inset-top,0px)))}}\n" }] } },
  // Phase 3b (r52): the engine and the analytics, from r51's
  // (ARCHITECTURE.md, Phase 3b in detail). Each function that read the log,
  // the date or a cache takes the model as its first parameter, M, and gains
  // In; the read-back below turns it into r51's code before the comparison,
  // and allows no other use of the model.
  { release: 'r52', baseline: 'baselines/r51.html', modules: ['model', 'units', 'routines', 'gym', 'format', 'loads', 'analytics', 'time', 'weeks', 'coach', 'engine', 'live'],
    changed: {},
    model: {
      // The model's parts under the names r51 read them by: the log and the date.
      state: 'state', today: 'today',
      // The caches leave the legacy script; freshCaches gives their starting values.
      retired: ['EXMAP', '_idx', '_dix', '_cal', '_rirUse', '_bwRef', '_pace'],
    },
    // The declarations TypeScript's noUnusedLocals refuses as written, and
    // what is dropped from each on r51's side before the comparison; each is
    // verified below.
    prunes: {
      sgEasy: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'abW', 'cap', 'fl', 'tp'] },
      sgPastRange: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'abW', 'cap', 'fl', 'tp'] },
      sgBelowRange: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'seen', 'injM', 'last', 'ws', 'stx', 'abW', 'cap', 'atCap', 'capW', 'early', 'fl', 'tp'] },
      sgNoStep: { from: 'C', drop: ['ex', 'exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'cap', 'capW', 'tgtRir', 'early', 'fl'] },
      sgTopOfRange: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'step', 'noAdd', 'abW', 'atCap', 'early', 'fl'] },
      sgBadDay: { from: 'C', drop: ['ex', 'exId', 'opts', 'T', 'all', 'every', 'seen', 'inRR', 'injM', 'last', 'ws', 'stx', 'step', 'noAdd', 'abW', 'cap', 'atCap', 'capW', 'tgtRir', 'early', 'fl', 'tp'] },
      sgReps: { from: 'C', drop: ['exId', 'opts', 'T', 'all', 'every', 'exps', 'seen', 'inRR', 'injM', 'last', 'ws', 'step', 'noAdd', 'abW', 'cap', 'atCap', 'capW', 'tgtRir', 'early', 'fl'] },
      idxLift: { from: 'sc', drop: ['exWin'] },
      // A date suggest computes and never reads. Dropping it changes nothing
      // only if reading opts.before and calling isDate and today do nothing:
      // the functions are held to their exact code here, and every caller
      // passes plain data (below).
      suggest: { statement: 'const T=opts.before&&isDate(opts.before)?opts.before:today();', reads: { isDate: 'const isDate = (v) => typeof v === "string" && /^\\d{4}-\\d{2}-\\d{2}$/.test(v);', today: 'const today = () => iso(new Date());', iso: 'const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;', pad: 'const pad = (n) => String(n).padStart(2, "0");' }, passes: { suggest: 2, newBlock: 2 } },
    },
    added: {
      freshCaches: { why: "r52: the caches' starting values, as r51 declared them (every one null but _bwRef, which bwRef tests for undefined)", code: 'function freshCaches() { return { EXMAP: null, _idx: null, _dix: null, _cal: null, _rirUse: null, _bwRef: undefined, _pace: null }; }', uses: [],
        check: m => { const a = m.freshCaches(), b = m.freshCaches(); return a !== b && JSON.stringify(Object.keys(a)) === JSON.stringify(['EXMAP', '_idx', '_dix', '_cal', '_rirUse', '_bwRef', '_pace']) && Object.keys(a).every(k => (k === '_bwRef' ? a[k] === undefined : a[k] === null)); } },
      modelOf: { why: 'r52: a model of a given log and date, with fresh caches, for a test', code: 'function modelOf(s, today) { return { s, today, c: freshCaches() }; }', uses: ['freshCaches'],
        check: m => { const s = { sessions: [] }, t = () => '2026-01-05'; const A = m.modelOf(s, t), B = m.modelOf(s, t); return JSON.stringify(Object.keys(A)) === JSON.stringify(['s', 'today', 'c']) && A.s === s && A.today === t && A.c !== B.c && A.c._bwRef === undefined && '_bwRef' in A.c && A.c._idx === null; } },
      LIVE: { why: "r52: the model the app runs on: the store's log read at every use, util's today, and the caches", code: 'const LIVE = { get s() { return state; }, today, c: freshCaches() };', uses: ['freshCaches', 'state', 'today'], with: ['util', 'store'],
        check: (m, w) => { const L = m.LIVE, d = Object.getOwnPropertyDescriptor(L, 's'); if (!d || typeof d.get !== 'function' || d.set !== undefined) return false; if (JSON.stringify(Object.keys(L)) !== JSON.stringify(['s', 'today', 'c']) || L.today !== w.util.today || L.s !== w.store.state) return false; const a = { sessions: [] }, b = { sessions: [1] }; w.store.setState(a); if (L.s !== a) return false; w.store.setState(b); if (L.s !== b) return false; const c = L.c; return JSON.stringify(Object.keys(c)) === JSON.stringify(['EXMAP', '_idx', '_dix', '_cal', '_rirUse', '_bwRef', '_pace']) && Object.keys(c).every(k => (k === '_bwRef' ? c[k] === undefined : c[k] === null)); } },
      live: { why: 'r52: a function of the model as the app calls it, with LIVE and then every argument as given', code: 'function live(f) { return (...args) => f(LIVE, ...args); }', uses: ['LIVE'],
        check: m => { const seen = []; const f = function () { seen.push([...arguments]); return 'r'; }; const g = m.live(f); return g.length === 0 && g(1, 2, 3) === 'r' && g() === 'r' && g(undefined) === 'r' && seen.length === 3 && seen[0].length === 4 && seen[0][0] === m.LIVE && seen[0][1] === 1 && seen[0][3] === 3 && seen[1].length === 1 && seen[1][0] === m.LIVE && seen[2].length === 2 && seen[2][1] === undefined; } },
    },
    // Every other export of live.ts is `const X = live(XIn);`, for exactly the
    // names the legacy script imports from it.
    adapters: { module: 'live', fn: 'live', imports: 'src/09-imports.js' },
    // What the move reads back and compares, counted (ARCHITECTURE.md): the
    // functions taking the model (96 and invalidate), the 16 moved unchanged,
    // the adapters and the caches retired.
    expect: { model: 97, unchanged: 16, adapters: 74, retired: 7 },
    // The legacy script left behind is r51's, less the moved declarations and
    // the caches, once the 22 names the test hook gained are read back.
    legacy: { calls: {}, statements: {}, hook: ['U', 'toD', 'fromD', 'loadLabel', 'exName', 'planCredit', 'gymOf', 'isDeloadWeek', 'freeMode', 'injuredSet', 'prLoad', 'statsUpTo', 'readiness', 'bwRef', 'weekRoutine', 'easierText', 'barKg', 'suggestCore', 'loadOf', 'bwLoad', 'hardCredit', 'rirHalfOn'] } },
  // r53 (V, 2026-10-18): a change a lifter sees, between phases
  // (ARCHITECTURE.md, A change to the legacy script between phases). The
  // legacy declaration it changes moves first, as a function taking the
  // model, changed on purpose (`moved: true`: it left the legacy script), and
  // the app reaches it through an adapter in live.ts like r52's.
  { release: 'r53', baseline: 'baselines/r52.html', modules: ['routines', 'live', 'analytics', 'providers', 'effort', 'guide', 'session', 'format'],
    model: { state: 'state', today: 'today', retired: [] },
    changed: {
      plannedSetsIn: { why: 'r53: moved unchanged from the legacy script, as a function of the model, so the coach can tell a plan short of a muscle\'s target from one that reaches it (the audit V asked for); the legacy script reaches it through its adapter', moved: true,
        code: 'function plannedSetsIn(M, routine) { const out = {}; const f = weekFactor(routine); for (const d of routine.days) { if (d.rest) continue; for (const it of d.items) { const pc = planCreditIn(M, it); if (!pc) continue; const ex = EXIn(M, it.exId); out[ex.primary] = (out[ex.primary] || 0) + it.sets * f * pc; for (const m of ex.secondary) out[m] = (out[m] || 0) + 0.5 * it.sets * f * pc; } } return out; }',
        uses: ['EXIn', 'planCreditIn', 'weekFactor'], with: ['model', 'library'],
        check: (m, w) => {
          // A week of bench 3 sets at 1 in reserve and incline curls 2 at 4 (not hard): chest 3, each bench helper 1.5, no biceps; a 2-day cycle of it, 3.5 times that.
          const lib = w.library.libExercises(), b = lib.find(e => e.id === 'bench');
          const it = (exId, sets, rir) => ({ uid: exId, exId, sets, repMin: 6, repMax: 10, rir, rest: 90, inc: 2.5, ss: null });
          const R = sched => ({ id: 'R', name: 'R', schedule: sched, days: [{ id: 'D', name: 'D', rest: false, items: [it('bench', 3, 1), it('inclineCurl', 2, 4)] }, ...(sched === 'cycle' ? [{ id: 'E', name: 'E', rest: true, items: [] }] : [])] });
          const M = w.model.modelOf({ sessions: [], exercises: lib, routines: [], activeRoutineId: '', bodyweights: [], cardio: [], injuries: [], deloadWeek: null, settings: { unit: 'kg', rirMode: 'on', bands: {}, priorities: [], restWeeks: [] } }, () => '2026-10-15');
          const wk = m.plannedSetsIn(M, R('weekly')), cy = m.plannedSetsIn(M, R('cycle'));
          return wk[b.primary] === 3 && b.secondary.every(x => wk[x] === 1.5) && !('biceps' in wk) && cy[b.primary] === 10.5 && Object.keys(wk).length === 1 + b.secondary.length;
        } },
      rirScale: { why: 'r53: the scale read through effScale, the one rule the engine\'s sentences share; the same answers as r52\'s', moved: true,
        code: 'const rirScale = () => effScale(state.settings.rirScale);', uses: ['effScale', 'state'], with: ['store'],
        check: (m, w) => ['half', 'rpe', undefined, 'x'].every(v => { w.store.setState({ settings: { rirScale: v } }); return m.rirScale() === (v === 'half' || v === 'rpe' ? v : 'whole'); }) },
      effShow: { why: 'r53: an effort shown through effAt, the one rule the engine\'s sentences share (the audit V asked for: RPE lifters were told RIR); the same answers as r52\'s', moved: true,
        code: "function effShow(v) { if (v == null || v === '') return ''; const n = +v; if (!isFinite(n)) return ''; return effAt(rirScale(), n); }", uses: ['effAt', 'isFinite', 'rirScale'], with: ['store'],
        check: (m, w) => { const at = (sc, v) => { w.store.setState({ settings: { rirScale: sc } }); return m.effShow(v); }; return at('rpe', 2) === '8' && at('rpe', 1.5) === '8.5' && at(undefined, 2) === '2' && at('half', 1.5) === '1.5' && at('rpe', '') === '' && at('rpe', null) === '' && at('rpe', 'x') === ''; } },
      whyTarget: { why: "r53: the reason behind a target says what does not set one, a session where the lift was trimmed or done lighter than usual, or on a lighter day, in a deload or on an exercise made lighter had fewer reps or sets than usual, since a lift done at its usual level on a lighter day or in a deload now does; the rest as r52's", moved: true,
        code: "function whyTarget(b) { if (!b) return ''; const h = (b.hint || b.text || '').trim(), l = (b.last || '').trim(); const reason = l && h.startsWith(l) ? h.slice(l.length).trim() : h; const basis = b.basis ? ` The target comes from your last full session, ${fmtDate(b.basis)}; a session where this lift was trimmed or done lighter than usual does not set one, nor, on a lighter day, in a deload, or on an exercise made lighter, one with fewer reps or sets than usual.` : ''; return (reason + basis).trim(); }",
        uses: ['fmtDate'],
        check: m => {
          // The Last line comes off the engine's sentence, the basis note names the date and what does not set a target.
          const r = m.whyTarget({ text: 'Last (Oct 1): 100x8. Every set hit 10: add 2.5.', last: 'Last (Oct 1): 100x8.', basis: '2026-10-01' });
          return /^Every set hit 10: add 2\.5\. The target comes from your last full session, [^;]+; a session where this lift was trimmed or done lighter than usual does not set one, nor, on a lighter day, in a deload, or on an exercise made lighter, one with fewer reps or sets than usual\.$/.test(r) && m.whyTarget(null) === '' && m.whyTarget({ hint: 'Beat 37 reps.' }) === 'Beat 37 reps.';
        } },
      routineUpdatesIn: { why: "r53: Finish's offer adds an exercise added on a lighter day or in a deload at its normal-day sets (tests/r53.js); the rest as r52's routineUpdates", moved: true,
        code: "function routineUpdatesIn(M, d) { const R = M.s.routines.find(r => r.id === d.routineId); if (!R) return null; const day = R.days.find(x => x.id === d.dayId); if (!day) return null; const have = new Set(day.items.map(i => i.exId)); const add = [], swap = []; const seen = new Set(); for (const b of d.ex) { if (have.has(b.exId) || seen.has(b.exId) || !b.sets.some(s => s.done && !s.warm)) continue; seen.add(b.exId); if (d.limited && b.swappedFrom) continue; if (b.swappedFrom && have.has(b.swappedFrom)) swap.push({ from: b.swappedFrom, to: b.exId }); else { const { ss: _s, ...p } = b.plan; const sets = d.deload || d.light ? planForIn(M, b.exId, R, d.dayId).sets : p.sets; add.push({ exId: b.exId, plan: { ...p, sets: Math.max(1, +(sets || 0) || 3) } }); } } const after = new Set([...day.items.map(i => i.exId).map(id => { const sw = swap.find(x => x.from === id); return sw ? sw.to : id; }), ...add.map(x => x.exId)]); const ss = []; const groups = new Map(); for (const b of d.ex) { const g = b.plan && b.plan.ss; if (!g || !b.sets.some(x => x.done && !x.warm)) continue; let list = groups.get(g); if (!list) groups.set(g, list = []); list.push(b.exId); } for (const ids of groups.values()) { const u = [...new Set(ids)].filter(id => after.has(id)); if (u.length < 2) continue; const its = u.map(id => day.items.find(i => i.exId === id)); const first = its[0]; if (first && first.ss && its.every(i => !!i && i.ss === first.ss)) continue; ss.push(u); } if (!add.length && !swap.length && !ss.length) return null; const bits = [...swap.map(x => `${exNameIn(M, x.from)} \\u2192 ${exNameIn(M, x.to)}`), ...add.map(x => `add ${exNameIn(M, x.exId)}`), ...ss.map(u => `superset ${andList(u.map(id => exNameIn(M, id)))}`)]; return { rid: R.id, dayId: day.id, dayName: day.name, add, swap, ss, text: bits.join(', ') }; }",
        uses: ['Map', 'Math', 'Set', 'andList', 'exNameIn', 'planForIn'], with: ['model'],
        check: (m, w) => {
          // Day 1 is trained; B sits on day 2 at 4 sets, A on no day (3, the default). Each added at 2, as a lighter day or a deload halves it.
          const R = { id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'd1', name: 'Day 1', rest: false, items: [] }, { id: 'd2', name: 'Day 2', rest: false, items: [{ uid: 'u', exId: 'b', sets: 4, repMin: 6, repMax: 8, rir: 1, rest: 120, inc: 2.5, ss: null }] }] };
          // A second routine, not the active one, has B on its day 2 at 5 sets: its offer reads its own plan, not the active routine's.
          const R2 = { id: 'R2', name: 'R2', schedule: 'weekly', days: [{ id: 'e1', name: 'Day A', rest: false, items: [] }, { id: 'e2', name: 'Day B', rest: false, items: [{ uid: 'v', exId: 'b', sets: 5, repMin: 6, repMax: 8, rir: 1, rest: 120, inc: 2.5, ss: null }] }] };
          const M = w.model.modelOf({ routines: [R, R2], activeRoutineId: 'R', exercises: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], sessions: [], settings: {} }, () => '2026-10-15');
          const blk = exId => ({ exId, plan: { sets: 2, repMin: 6, repMax: 8, rir: 1, rest: 120, inc: 2.5, ss: null }, sets: [{ done: true, warm: false }] });
          const run = mark => m.routineUpdatesIn(M, { routineId: 'R', dayId: 'd1', ...mark, ex: [blk('a'), blk('b')] });
          const sets = u => u && u.add.map(x => `${x.exId}${x.plan.sets}`).join(' ');
          const n = run({}), l = run({ light: true }), dl = run({ deload: true });
          const other = m.routineUpdatesIn(M, { routineId: 'R2', dayId: 'e1', light: true, ex: [blk('b')] });
          return sets(n) === 'a2 b2' && sets(l) === 'a3 b4' && sets(dl) === 'a3 b4' && l.text === 'add A, add B' && l.dayName === 'Day 1' && l.add[1].plan.repMin === 6 && !('ss' in l.add[0].plan) && sets(other) === 'b5';
        } },
    },
    added: {
      lighterTally: { module: 'analytics', why: "r53: what a lighter week is, read from what the lifts did, one rule for the weekly averages (idxLightWeeks) and the coach (recentLighterIn), V's ruling and the audit V asked for", code: 'function lighterTally(sessions, byEx, deloadWeek) { const lifts = {}, done = {}; for (const xs of Object.values(byEx)) for (const x of xs || []) { lifts[x.sid] = (lifts[x.sid] || 0) + 1; if (x.deload || x.light || x.auto) done[x.sid] = (done[x.sid] || 0) + 1; } const lighter = (sid) => (done[sid] || 0) > 0 && (done[sid] || 0) * 2 >= (lifts[sid] || 0); const weeks = {}; for (const x of sessions) { const k = weekStart(x.date); const w = weeks[k] || (weeks[k] = { all: 0, light: 0, tail: 0 }); w.all++; if (lighter(x.id)) { w.light++; w.tail = x.deload || k === deloadWeek ? w.tail + 1 : 0; } else w.tail = 0; } return { weeks, lighter }; }', uses: ['Object', 'weekStart'],
        check: m => {
          // Sessions a to e, Monday 5 October to Friday 9: two lifts each; b one of two done lighter (half, so lighter), c none, d and e deload and lighter, f untagged and lighter in a marked week.
          const x = (sid, f) => ({ sid, deload: f === 'd', light: f === 'l', auto: f === 'a' });
          const byEx = { bench: [x('a'), x('b', 'l'), x('c'), x('d', 'd'), x('e', 'd'), x('f', 'a')], squat: [x('a'), x('b'), x('c'), x('d', 'd'), x('e'), x('f', 'a')] };
          const s = (id, date, deload) => ({ id, date, deload: !!deload });
          const T = m.lighterTally([s('a', '2026-10-05'), s('b', '2026-10-06'), s('c', '2026-10-07'), s('d', '2026-10-08', true), s('e', '2026-10-09', true), s('f', '2026-10-13')], byEx, '2026-10-12');
          const w1 = T.weeks['2026-10-05'], w2 = T.weeks['2026-10-12'];
          return w1.all === 5 && w1.light === 3 && w1.tail === 2 && w2.all === 1 && w2.light === 1 && w2.tail === 1 && T.lighter('b') && !T.lighter('a') && !T.lighter('c') && T.lighter('e');
        } },
      stallStretch: { module: 'analytics', why: "r53: the sessions the stall test reads, one rule for the test (idxLiftIn) and the coach's words about how long a lift has not moved (the audit V asked for)", code: 'function stallStretch(wE) { if (wE.length < 4) return null; const lastE = wE[wE.length - 1].date; let i0 = wE.length - 1; while (i0 > 0 && (wE.length - i0 < 6 || daysBetween(wE[i0].date, lastE) < 21)) i0--; const l = wE.slice(i0); return daysBetween(l[0].date, lastE) >= 21 ? l : null; }', uses: ['daysBetween'],
        check: m => {
          const d = ds => ds.map(date => ({ date }));
          const wk = d(['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21']);
          const two = d(['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10', '2026-09-15', '2026-09-17', '2026-09-22', '2026-09-24']);
          const a = m.stallStretch(wk), b = m.stallStretch(two);
          // Weekly: the last 6, 35 days. Twice a week: the last 6 span 16 days, so widened to 7 (21 days). Three sessions, or four in 20 days: none.
          return a.length === 6 && a[0].date === '2026-08-17' && b.length === 7 && b[0].date === '2026-09-03' && m.stallStretch(wk.slice(0, 3)) === null && m.stallStretch(d(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-21'])) === null;
        } },
      effScale: { module: 'format', why: 'r53: the effort scale a setting names, one rule for the screens (rirScale) and the engine\'s sentences (the audit V asked for)', code: "function effScale(v) { return v === 'half' || v === 'rpe' ? v : 'whole'; }", uses: [],
        check: m => m.effScale('half') === 'half' && m.effScale('rpe') === 'rpe' && m.effScale(undefined) === 'whole' && m.effScale('whole') === 'whole' && m.effScale(4) === 'whole' },
      effAt: { module: 'format', why: 'r53: an effort, stored as RIR, as a scale shows it (RPE is 10 less RIR), one rule for the screens and the engine\'s sentences', code: "function effAt(scale, rir) { return scale === 'rpe' ? String(Math.round((10 - rir) * 10) / 10) : String(Math.round(rir * 10) / 10); }", uses: ['Math', 'String'],
        check: m => m.effAt('rpe', 4) === '6' && m.effAt('rpe', 1) === '9' && m.effAt('rpe', 0.5) === '9.5' && m.effAt('whole', 4) === '4' && m.effAt('half', 2.5) === '2.5' && m.effAt('whole', 2.25) === '2.3' },
      USUAL_SHARE: { why: "r53: the r30 audit's 97%, named once for the usual-load test and the usual-level test", code: 'const USUAL_SHARE = 0.97;', uses: [], with: ['formulas'],
        // What its comment says: at 8 reps and the same load, one of two sets a rep short is within it, every set a rep short is not.
        check: (m, w) => { const e = r => w.formulas.trendE(100, r, 0); return m.USUAL_SHARE === 0.97 && (e(8) + e(7)) / 2 >= e(8) * m.USUAL_SHARE && e(7) < e(8) * m.USUAL_SHARE; } },
      atUsualLoad: { why: "r53: the usual-load test of step 2's second pass (r30 audit), one copy for it and the usual-level test", code: 'function atUsualLoad(x, ref) { const mL = Math.max(...ref.map(q => q.topL)), mT = Math.max(...ref.map(q => (q.tRaw == null ? -Infinity : q.tRaw))); return !(x.topL < mL - 1e-6 || (x.tRaw != null && isFinite(mT) && x.tRaw < mT * USUAL_SHARE)); }', uses: ['Infinity', 'Math', 'USUAL_SHARE', 'isFinite'],
        check: m => { const x = (topL, tRaw) => ({ topL, tRaw }); const ref = [x(100, 120), x(95, 118)]; return m.atUsualLoad(x(100, 120), ref) && m.atUsualLoad(x(110, 117), ref) && m.atUsualLoad(x(100, null), ref) && !m.atUsualLoad(x(99, 130), ref) && !m.atUsualLoad(x(100, 116), ref) && m.atUsualLoad(x(100, 116.4), ref); } },
      atUsualLevel: { why: "r53: whether a lift on a deload or lighter day was at its usual level: the usual-load test where there is a strength reading, else its working load and its reps a set", code: 'function atUsualLevel(x, ref) { if (!ref.length || ref.some(q => x.topN < q.topN)) return false; if (x.tRaw != null && ref.some(q => q.tRaw != null)) return atUsualLoad(x, ref); const reps = (q) => q.topReps / q.topN; return ref.every(q => x.topW >= q.topW - 1e-6 && reps(x) >= reps(q) * USUAL_SHARE); }', uses: ['USUAL_SHARE', 'atUsualLoad'],
        check: m => {
          const x = (topL, tRaw, topW, topReps, topN) => ({ topL, tRaw, topW, topReps, topN });
          // Bench with readings: as the usual-load test. Two sessions of 2 sets of 8.
          const R = [x(100, 120, 100, 16, 2), x(95, 118, 95, 16, 2)];
          // Hanging leg raises, no reading: 12 and 12 at bodyweight, twice.
          const H = [x(0, null, 0, 24, 2), x(0, null, 0, 24, 2)];
          // An assisted pull-up before any weigh-in (load 0, no reading): 30 kg of help, 8 and 8.
          const A = [x(0, null, -30, 16, 2)];
          return m.atUsualLevel(x(100, 120, 100, 16, 2), R) && !m.atUsualLevel(x(100, 116, 100, 15, 2), R) && !m.atUsualLevel(x(99, 130, 99, 20, 2), R) &&
            // 8 and 8 leg raises: fewer reps at the same load, not usual (r53's first version said it was); 12 and 12, usual; 12, 12 and 11 (11.67 a set) within 97% of 12; 12 and 11 (11.5) not.
            !m.atUsualLevel(x(0, null, 0, 16, 2), H) && m.atUsualLevel(x(0, null, 0, 24, 2), H) && m.atUsualLevel(x(0, null, 0, 35, 3), H) && !m.atUsualLevel(x(0, null, 0, 23, 2), H) &&
            // More help is lighter; less help for the same reps is not.
            !m.atUsualLevel(x(0, null, -40, 16, 2), A) && m.atUsualLevel(x(0, null, -25, 16, 2), A) &&
            // A reading on one side only: the reps decide (8 a set after 25 a set is not usual; 22 a set at the usual load after 8 is).
            !m.atUsualLevel(x(100, 120, 100, 16, 2), [x(100, null, 100, 50, 2)]) && m.atUsualLevel(x(100, null, 100, 44, 2), R) &&
            // Nothing to compare with: the day's label stands.
            !m.atUsualLevel(x(100, 120, 100, 16, 2), []) &&
            // Fewer sets at the working load than the fewest before: half the sets of a lighter day after four, at the usual load and reps, is not usual (the review of r53); four again is.
            !m.atUsualLevel(x(100, 124, 100, 20, 2), [x(100, 120, 100, 37, 4), x(100, 120, 100, 37, 4)]) && m.atUsualLevel(x(100, 120, 100, 37, 4), [x(100, 120, 100, 37, 4), x(100, 120, 100, 30, 3)]) &&
            // One of them a set short (two of four, still a full session) lets no half-set day through: as many sets as each of them (the second review).
            !m.atUsualLevel(x(100, 124, 100, 20, 2), [x(100, 120, 100, 37, 4), x(100, 124, 100, 20, 2), x(100, 120, 100, 37, 4)]);
        } },
      idxTaggedFull: { why: "r53: a lift done at its usual level on a deload or lighter day, or made lighter, is a full session for it; done lighter, for fewer reps or trimmed, as before", code: 'function idxTaggedFull(byEx) { for (const id of Object.keys(byEx)) { const prev = []; for (const x of byEx[id]) { if ((x.deload || x.light) && !x.cut) { if (!atUsualLevel(x, prev.filter(q => sameRR(q.rr, x.rr)).slice(-3))) continue; x.deload = false; x.light = false; } if (!offSession(x)) prev.push(x); } } }', uses: ['Object', 'atUsualLevel', 'offSession', 'sameRR'],
        check: m => {
          const ex = (sid, topL, tRaw, mark, topReps) => ({ sid, rr: [8, 12], topL, tRaw, topW: topL, topReps: topReps || 16, topN: 2, deload: false, light: false, cut: false, ...mark });
          // Bench 100 x 8 twice, then a lighter day at 100 (usual), one at 90 for more reps (lighter), a deload at 100, a trimmed lighter one at 100, and a first lighter session with nothing before it.
          const byEx = { b: [ex('1', 100, 120), ex('2', 100, 120), ex('3', 100, 119, { light: true }), ex('4', 90, 140, { light: true }), ex('5', 100, 121, { deload: true }), ex('6', 100, 120, { light: true, cut: true })], c: [ex('7', 50, 60, { light: true })],
            // Hanging leg raises at bodyweight, no reading: 12 and 12 twice, then a lighter day of 8 and 8 (lighter), then one of 12 and 12 (usual).
            h: [ex('h1', 0, null, {}, 24), ex('h2', 0, null, {}, 24), ex('h3', 0, null, { light: true }, 16), ex('h4', 0, null, { deload: true }, 24)] };
          m.idxTaggedFull(byEx);
          const tags = xs => xs.map(x => `${x.sid}${x.light ? 'L' : ''}${x.deload ? 'D' : ''}`).join(' ');
          return tags(byEx.b) === '1 2 3 4L 5 6L' && byEx.c[0].light === true && tags(byEx.h) === 'h1 h2 h3L h4';
        } },
    },
    edits: {
      idxLightWeeks: { module: 'analytics', why: 'r53: a lighter week for the weekly averages is the one the coach reads (lighterTally), more than half its sessions done lighter or its last two or more deload sessions done lighter, not every session labelled or half the lifts read lighter: a deload begun mid-week now leaves the averages, and a week of deloads done at full stays (the audit V asked for)', uses: ['lighterTally'], drops: ['weekStart'],
        pairs: [["export function idxLightWeeks(\n  sessions: readonly Session[],\n  wkAuto: Record<string, WeekCount>\n): Record<string, boolean> {\n  /* Lighter weeks (r30): every session in the week tagged deload or lighter,\n     or the week read as lighter above. Weekly volume averages skip them: a\n     deload halves the sets on purpose, and averaging it in read as \"below\n     target\" for a month after every deload. */\n  const lightWk: Record<string, boolean> = {};\n  {\n    const tag: Record<string, WeekCount> = {};\n    for (const ss of sessions) {\n      const k = weekStart(ss.date);\n      const o = tag[k] || (tag[k] = { n: 0, l: 0 });\n      o.n++;\n      if (ss.deload || ss.light) o.l++;\n    }\n    for (const k in tag) if (tag[k].n && tag[k].l === tag[k].n) lightWk[k] = true;\n    for (const k in wkAuto) {\n      const o = wkAuto[k];\n      if (o.l >= 2 && o.l * 2 >= o.n) lightWk[k] = true;\n    }\n  }\n  return lightWk;\n}", "export function idxLightWeeks(\n  sessions: readonly Session[],\n  byEx: Record<string, Exposure[]>,\n  deloadWeek: string | null\n): Record<string, boolean> {\n  const lightWk: Record<string, boolean> = {};\n  const T = lighterTally(sessions, byEx, deloadWeek).weeks;\n  for (const k in T) if (T[k].light * 2 > T[k].all || T[k].tail >= 2) lightWk[k] = true;\n  return lightWk;\n}"]], with: ['model', 'library'],
        check: (m, w) => {
          const lib = w.library.libExercises();
          const set = (kg, r, rir) => ({ w: kg, r, rir: rir == null ? 1 : rir, warm: false, drop: false });
          const ses = (id, date, mark, kg, lifts) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: mark === 'deload', light: mark === 'light', durMin: null, ex: (lifts || ['bench', 'backSquat']).map(exId => ({ exId, note: '', rr: [6, 10], sets: [set(kg || 100, 8), set(kg || 100, 8)] })) });
          const M = (sessions, deloadWeek) => w.model.modelOf({ sessions, exercises: lib, routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], cardio: [], injuries: [], deloadWeek: deloadWeek || null, settings: { unit: 'kg', rirMode: 'on', bands: {}, priorities: [], restWeeks: [] } }, () => '2026-10-15');
          const base = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map((d, i) => ses('b' + i, d, ''));
          const lw = (sessions, dw) => m.IDXIn(M([...base, ...sessions], dw)).lightWk['2026-10-05'] === true;
          // A deload begun mid-week, Monday normal and Wednesday and Friday at 90: lighter. Deloads all week done at full: not. Two Lighter days of four: not; three of four: lighter.
          return lw([ses('n', '2026-10-05', ''), ses('d1', '2026-10-07', 'deload', 90), ses('d2', '2026-10-09', 'deload', 90)]) &&
            !lw([ses('d0', '2026-10-05', 'deload'), ses('d1', '2026-10-07', 'deload'), ses('d2', '2026-10-09', 'deload')]) &&
            !lw([ses('n1', '2026-10-05', ''), ses('n2', '2026-10-06', ''), ses('l1', '2026-10-08', 'light', 90), ses('l2', '2026-10-09', 'light', 90)]) &&
            lw([ses('n1', '2026-10-05', ''), ses('l0', '2026-10-06', 'light', 90), ses('l1', '2026-10-08', 'light', 90), ses('l2', '2026-10-09', 'light', 90)]);
        } },
      incOfIn: { module: 'engine', why: 'r53: the load in hand reaches the rack reading, which uses it only with nothing logged yet (the audit V asked for)', uses: [],
        pairs: [["      const g = rackStepIn(M, ex);\n", "      const g = rackStepIn(M, ex, at);\n"]], with: ['model', 'library'],
        check: (m, w) => {
          const LB = 0.45359237, lib = w.library.libExercises(), EX = id => lib.find(e => e.id === id);
          const set = (kg, r, rir) => ({ w: kg, r, rir: rir == null ? 1 : rir, warm: false, drop: false });
          const ss = (id, exId, rr, sets) => ({ id, date: '2026-10-05', dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: false, light: false, durMin: null, ex: [{ exId, note: '', rr, sets }] });
          const M = (sessions, unit, more) => w.model.modelOf({ sessions, exercises: lib, routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], cardio: [], injuries: [], deloadWeek: null, settings: { unit, rirMode: 'on', bands: {}, priorities: [], restWeeks: [], ...(more || {}) } }, () => '2026-10-12');
          // Incline dumbbell curls never done, in kg, Your gym not set: 6 kg in hand steps 2 kg, 7.5 kg steps 2.5; with no load, the unit's 2.5 kg. Logged at 12 and 14 kg: 2 kg, whatever is in hand.
          const c = EX('inclineCurl'), pk = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 }, m0 = M([], 'kg'), m1 = M([ss('a', 'inclineCurl', [8, 12], [set(12, 10), set(14, 10)])], 'kg');
          return m.incOfIn(m0, c, pk, 6) === 2 && m.incOfIn(m0, c, pk, 7.5) === 2.5 && m.incOfIn(m0, c, pk) === 2.5 && m.incOfIn(m1, c, pk, 15) === 2;
        } },
      rackStepIn: { module: 'engine', why: 'r53: with nothing logged yet, the load in hand is the rack\'s one known weight, so a first session\'s 6 kg dumbbells step to 8, not 8.5 kg, which no rack has (the audit V asked for); a rack read from logged loads as before', uses: [],
        pairs: [["export function rackStepIn(M: Model, ex: ExerciseLike): number | null {\n  const I = IDXIn(M);\n  I._rack = I._rack || {};\n  const key = UIn(M) + ex.id;\n  if (I._rack[key] !== undefined) return I._rack[key];\n  const xs = (I.byEx[ex.id] || []).slice(-12);\n  const ws: number[] = [];\n  for (const x of xs) for (const p of x.pts) if (p.w > 0) ws.push(toDIn(M, p.w)!);\n  const fits = (g: number): boolean => ws.every(w => Math.abs(w / g - Math.round(w / g)) < 0.01);\n  const g = ws.length ? RACK[rackKind(ex)!][UIn(M)].find(fits) : null;\n  return (I._rack[key] = g ? fromDIn(M, g) : null);\n}", "export function rackStepIn(M: Model, ex: ExerciseLike, at?: number | null): number | null {\n  const I = IDXIn(M);\n  I._rack = I._rack || {};\n  const key = UIn(M) + ex.id;\n  const fit = (ws: readonly number[]): number | null => {\n    const fits = (g: number): boolean => ws.every(w => Math.abs(w / g - Math.round(w / g)) < 0.01);\n    const g = RACK[rackKind(ex)!][UIn(M)].find(fits);\n    return g ? fromDIn(M, g) : null;\n  };\n  if (I._rack[key] === undefined) {\n    const xs = (I.byEx[ex.id] || []).slice(-12);\n    const ws: number[] = [];\n    for (const x of xs) for (const p of x.pts) if (p.w > 0) ws.push(toDIn(M, p.w)!);\n    I._rack[key] = ws.length ? fit(ws) : null;\n  }\n  const logged = (I.byEx[ex.id] || []).some(x => x.pts.some(p => p.w > 0));\n  const d = logged || at == null || !(at > 0) ? null : toDIn(M, at);\n  return d == null ? I._rack[key] : fit([d]);\n}"]], with: ['model', 'library'],
        check: (m, w) => {
          const LB = 0.45359237, lib = w.library.libExercises(), EX = id => lib.find(e => e.id === id);
          const set = (kg, r, rir) => ({ w: kg, r, rir: rir == null ? 1 : rir, warm: false, drop: false });
          const ss = (id, exId, rr, sets) => ({ id, date: '2026-10-05', dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: false, light: false, durMin: null, ex: [{ exId, note: '', rr, sets }] });
          const M = (sessions, unit, more) => w.model.modelOf({ sessions, exercises: lib, routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], cardio: [], injuries: [], deloadWeek: null, settings: { unit, rirMode: 'on', bands: {}, priorities: [], restWeeks: [], ...(more || {}) } }, () => '2026-10-12');
          const c = EX('inclineCurl'), m0 = M([], 'kg');
          // Nothing logged: none without a load, 2 kg from 6, 2.5 from 7.5 or 10 (a load on both racks keeps the larger), 1 from 9; a load on none is no reading. Logged at 6 and 8: 2 kg, whatever is in hand.
          return m.rackStepIn(m0, c) === null && m.rackStepIn(m0, c, 6) === 2 && m.rackStepIn(m0, c, 7.5) === 2.5 && m.rackStepIn(m0, c, 10) === 2.5 && m.rackStepIn(m0, c, 9) === 1 && m.rackStepIn(m0, c, 6.25) === null && m.rackStepIn(m0, c, 0) === null &&
            m.rackStepIn(M([ss('a', 'inclineCurl', [8, 12], [set(6, 15), set(8, 12)])], 'kg'), c, 9) === 2;
        } },
      snapUnitIn: { module: 'engine', why: 'r53: a load counts as typed only when exact in the unit on screen; under a target of reps, down to the step below; the step the words name moves with the load (the audit V asked for: one converted load in five was left off the plate grid, and dumbbells went 9% heavier with the reps unchanged)', uses: ['UIn', 'fmtWIn'],
        pairs: [["  /* Off the step and not a number anyone types (220.462 from 100 kg): a\n     custom step (185 lb on a 10 lb step) or microplates (101.25) are left as\n     they are. */\n  const off = (v: number): boolean => Math.abs(toDIn(M, v)! / st - Math.round(toDIn(M, v)! / st)) > 0.02;\n  const typed = (v: number): boolean => Math.abs(toDIn(M, v)! / 0.05 - Math.round(toDIn(M, v)! / 0.05)) < 0.1;\n  if (!off(res.top) || !off(res.w) || typed(res.top)) return res;\n  const nw = fromDIn(M, (down ? Math.floor(toDIn(M, res.w)! / st + 1e-9) : Math.round(toDIn(M, res.w)! / st)) * st)!;\n  if (Math.abs(nw - res.w) < 1e-9) return res;\n  return swapWIn(M, ex, res, nw);\n", "  /* Off the step and not a number anyone types (220.462 from 100 kg): a\n     custom step (185 lb on a 10 lb step) or microplates (101.25) are left as\n     they are. Typed is exact in the unit on screen, as a number typed in it\n     reads back (r53, from the audit V asked for: within a tenth of 0.05, one\n     load in five converted from the other unit passed for typed, so 42.5 kg\n     shown as 93.7 lb was told to add 5 lb, to 98.7). */\n  const off = (v: number): boolean => Math.abs(toDIn(M, v)! / st - Math.round(toDIn(M, v)! / st)) > 0.02;\n  const typed = (v: number): boolean => Math.abs(toDIn(M, v)! / 0.05 - Math.round(toDIn(M, v)! / 0.05)) < 1e-6;\n  if (!off(res.top) || !off(res.w) || typed(res.top)) return res;\n  /* Under a target of reps at last time's load, down to the step below, so\n     the reps asked for are not asked at a heavier load (r53, from the audit:\n     12.5 kg dumbbells shown in lb went up to 30 lb, 9% heavier, with the reps\n     to beat unchanged, and the lifter fell short). */\n  const dn = down || (!!res.tgt && res.tgt.kind === 'reps');\n  const nw = fromDIn(M, (dn ? Math.floor(toDIn(M, res.w)! / st + 1e-9) : Math.round(toDIn(M, res.w)! / st)) * st)!;\n  if (Math.abs(nw - res.w) < 1e-9) return res;\n  const out = swapWIn(M, ex, res, nw);\n  /* The step the words name moves with the load, so they add up to what is\n     shown (r53, from the audit: \"add 5 lb\" to 93.7 lb beside 100 lb, and \"take\n     5 lb of help off\" beside help that moved by another amount). */\n  const was = fmtWIn(M, res.w - res.top),\n    now = fmtWIn(M, nw - res.top);\n  const say = (t: string): string =>\n    t\n      .replace(`add ${was} ${UIn(M)}`, `add ${now} ${UIn(M)}`)\n      .replace(`take ${was} ${UIn(M)} of help off`, `take ${now} ${UIn(M)} of help off`);\n  out.text =\n    out.last && out.text.startsWith(out.last) ? out.last + say(out.text.slice(out.last.length)) : say(out.text);\n  return out;\n"]], with: ['model', 'library'],
        check: (m, w) => {
          const LB = 0.45359237, lib = w.library.libExercises(), EX = id => lib.find(e => e.id === id);
          const set = (kg, r, rir) => ({ w: kg, r, rir: rir == null ? 1 : rir, warm: false, drop: false });
          const ss = (id, exId, rr, sets) => ({ id, date: '2026-10-05', dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: false, light: false, durMin: null, ex: [{ exId, note: '', rr, sets }] });
          const M = (sessions, unit, more) => w.model.modelOf({ sessions, exercises: lib, routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], cardio: [], injuries: [], deloadWeek: null, settings: { unit, rirMode: 'on', bands: {}, priorities: [], restWeeks: [], ...(more || {}) } }, () => '2026-10-12');
          const pl = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB }, lb = kg => Math.round(kg / LB * 1000) / 1000;
          // Bench logged at 42.5 kg, every set at the top, shown in lb: 100 lb, and the words add 6.3 lb to the 93.7 shown. Typed as 101.25 lb: kept, plus 5.
          const a = m.suggestIn(M([ss('a', 'bench', [6, 10], [set(42.5, 10), set(42.5, 10), set(42.5, 10)])], 'lb'), 'bench', pl, {});
          const t = m.suggestIn(M([ss('a', 'bench', [6, 10], [set(101.25 * LB, 10), set(101.25 * LB, 10), set(101.25 * LB, 10)])], 'lb'), 'bench', pl, {});
          // Incline dumbbell press at 12.5 kg for 11, 10 and 10 in 8-12, shown in lb: a target of reps, so 25 lb, not 30.
          const d = m.suggestIn(M([ss('a', 'incDb', [8, 12], [set(12.5, 11), set(12.5, 10), set(12.5, 10)])], 'lb'), 'incDb', { ...pl, repMin: 8, repMax: 12 }, {});
          return lb(a.w) === 100 && /at 93\.7 lb hit 10: add 6\.3 lb/.test(a.text) && lb(t.w) === 106.25 && /add 5 lb/.test(t.text) && lb(d.w) === 25 && d.tgt.kind === 'reps';
        } },
      sgEasyIn: { module: 'engine', why: 'r53: the easy-set reason says effort in the lifter\'s scale, RPE 6 against a target of RPE 9, not RIR (the audit V asked for); RIR and half points read as before', uses: ['effAt', 'effScale'],
        pairs: [["        const rr = r1(topPts.reduce((a, p) => a + p.rir!, 0) / topPts.length);\n        return {\n          top,\n          w: nw,\n          text: `${lastS} RIR ${rr} at ${lbl(top)} against a target of ${tgtRir}, ", "        const rr = r1(topPts.reduce((a, p) => a + p.rir!, 0) / topPts.length);\n        // In the lifter's effort scale (r53, from the audit V asked for: RPE lifters were told RIR).\n        const sc = effScale(M.s.settings.rirScale);\n        return {\n          top,\n          w: nw,\n          text: `${lastS} ${sc === 'rpe' ? 'RPE' : 'RIR'} ${effAt(sc, rr)} at ${lbl(top)} against a target of ${sc === 'rpe' ? 'RPE ' : ''}${effAt(sc, tgtRir)}, "]], with: ['model', 'library'],
        check: (m, w) => {
          const LB = 0.45359237, lib = w.library.libExercises(), EX = id => lib.find(e => e.id === id);
          const set = (kg, r, rir) => ({ w: kg, r, rir: rir == null ? 1 : rir, warm: false, drop: false });
          const ss = (id, exId, rr, sets) => ({ id, date: '2026-10-05', dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: false, light: false, durMin: null, ex: [{ exId, note: '', rr, sets }] });
          const M = (sessions, unit, more) => w.model.modelOf({ sessions, exercises: lib, routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], cardio: [], injuries: [], deloadWeek: null, settings: { unit, rirMode: 'on', bands: {}, priorities: [], restWeeks: [], ...(more || {}) } }, () => '2026-10-12');
          const e = [ss('a', 'bench', [6, 10], [set(40, 8, 4), set(40, 8, 4), set(40, 8, 4)])], pl = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5 };
          const say = sc => m.suggestIn(M(e, 'kg', sc ? { rirScale: sc } : {}), 'bench', pl, {}).text;
          return say('rpe').includes('RPE 6 at 40 kg against a target of RPE 9, so that load was light.') && say().includes('RIR 4 at 40 kg against a target of 1, so that load was light.') && say('half').includes('RIR 4 at 40 kg against a target of 1, so');
        } },
      easierTextIn: { module: 'engine', why: 'r53: Getting easier says effort in the lifter\'s scale (the audit V asked for)', uses: ['effAt', 'effScale'],
        pairs: [["  return `Getting easier at ${loadLabelIn(M, ex, e.w)}${ex.bw ? '' : ' ' + UIn(M)}: RIR ${e.from} \u2192 ${e.to} at the same reps. Adding load today is reasonable.`;\n", "  // In the lifter's effort scale (r53, from the audit V asked for).\n  const sc = effScale(M.s.settings.rirScale);\n  return `Getting easier at ${loadLabelIn(M, ex, e.w)}${ex.bw ? '' : ' ' + UIn(M)}: ${sc === 'rpe' ? 'RPE' : 'RIR'} ${effAt(sc, e.from)} \u2192 ${effAt(sc, e.to)} at the same reps. Adding load today is reasonable.`;\n"]], with: ['model', 'library'],
        check: (m, w) => {
          const LB = 0.45359237, lib = w.library.libExercises(), EX = id => lib.find(e => e.id === id);
          const set = (kg, r, rir) => ({ w: kg, r, rir: rir == null ? 1 : rir, warm: false, drop: false });
          const ss = (id, exId, rr, sets) => ({ id, date: '2026-10-05', dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: false, light: false, durMin: null, ex: [{ exId, note: '', rr, sets }] });
          const M = (sessions, unit, more) => w.model.modelOf({ sessions, exercises: lib, routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], cardio: [], injuries: [], deloadWeek: null, settings: { unit, rirMode: 'on', bands: {}, priorities: [], restWeeks: [], ...(more || {}) } }, () => '2026-10-12');
          const say = sc => m.easierTextIn(M([], 'kg', sc ? { rirScale: sc } : {}), EX('bench'), { w: 40, from: 3, to: 4 });
          return say('rpe') === 'Getting easier at 40 kg: RPE 7 → 6 at the same reps. Adding load today is reasonable.' && say() === 'Getting easier at 40 kg: RIR 3 → 4 at the same reps. Adding load today is reasonable.';
        } },
      guideSheet: { module: 'guide', why: 'r53: the Guide states the rules r53 changes (a lift done at its usual load and reps for as many sets on a lighter day or in a deload, PRs on any day, a stall and an injury, the coach and a deload, an exercise you add)', uses: [],
        pairs: [["A week where most lifts read lighter is a lighter week. They are kept in history and treated like a deload.", "They are kept in history and, like a deload, set no target or trend. A week where half or more of the lifts trained read lighter, two at least, is left out of the weekly averages."], ["with no PR in the last 3 of them,", "with no PR in the last 3 of them, nor, in a session of that range left out of them since the third-last (a lighter day, a deload, a trimmed exercise), a set stronger than any before it,"], ["(a lighter week or a rest week is swapped for an earlier one)", "(a week where every session was a deload or lighter day, or half or more of the lifts trained read lighter, two at least, or a rest week, is swapped for an earlier one)"], ["A PR is the moment you set one, and it is announced as you log the set.", "A PR is the moment you set one, and it is announced as you log the set (on a lighter day, in a deload, or on an exercise made lighter, when you finish)."], ["and not within 4 weeks of a lighter week;", "and not within 4 weeks of a lighter week (more than half its sessions done lighter, counted once it ends or from the second, or a deload begun mid-week, once its last two or more deload sessions were done lighter), a rest week, or a week marked as a deload with nothing trained in it;"], ["For a day you are run down. It does not count against your trends or set your next targets.</p>", "For a day you are run down. A lift you still do at its usual load and reps, for as many sets, counts in full for that lift: its next target and its trend; a lift done lighter, or for fewer reps or sets, does not. A PR counts on any day.</p>"], ["Those sessions count as what you did, but they never set a target: the next target comes from the last full session, and the i beside the target names its date.</p>", "Those sessions count as what you did, but they never set a target: the next target comes from the last full session, and the i beside the target names its date. A lift done at its usual load and reps, for as many sets, on a lighter day or in a deload is a full session for that lift.</p>"], ["It stays out of trends, and out of the weekly volume average.", "A week where every session was a deload or lighter day stays out of the weekly volume average; each lift done lighter stays out of its trend, and a lift done at its usual load and reps, for as many sets, counts for that lift."], ["and only while you still train the lift.", "and only while you still train the lift and no injury it loads is flagged (the app holds its load then)."], ["A set that is more than one shows the first of these.", "A set that is more than one shows the first of these. PRs count on any day, a lighter day or a deload included; on those days, and on an exercise made lighter, a PR shows when you finish, not as you log the set."], ["<p><b>Swap</b>: sets you did stay with the old exercise;", "<p><b>An exercise you add</b> takes its sets and rep range from your routine when it is on a day there; otherwise from its own last full session (the range from Your training when that sets one); otherwise the start for a new exercise. Finish offers to keep it in the day, with a normal day's sets.</p>\n   <p><b>Swap</b>: sets you did stay with the old exercise;"]], with: ['store'],
        check: (m, w) => {
          // The Guide says the rules r53 brings, and nothing it said before is lost but the sentences changed (the pairs above).
          // The page's window, as the plain source file has it: no account or report service, not the installed app, not inside Claude.
          w.store.setState({ settings: { rirMode: 'on', unit: 'kg', rirScale: 'rpe' }, sessions: [] });
          const had = 'window' in globalThis; globalThis.window = {};
          let h; try { h = m.guideSheet({ open: 'rules' }); } finally { if (!had) delete globalThis.window; }
          return h.includes('counts in full for that lift') && h.includes('for as many sets') && h.includes('more than half its sessions done lighter') && h.includes('or a deload begun mid-week, once its last two or more deload sessions were done lighter') && h.includes('a week where every session was a deload or lighter day, or half or more of the lifts trained read lighter') && h.includes('two at least, is left out of the weekly averages') && h.includes('a set stronger than any before it,') && h.includes('like a deload, set no target or trend') && h.includes('on an exercise made lighter') && h.includes('A week where every session was a deload or lighter day stays out') && h.includes('when you finish)') && h.includes('a full session for that lift') && h.includes('no injury it loads is flagged') && h.includes('PRs count on any day') && h.includes('An exercise you add') && h.includes('RPE 5 to 6.5') && h.includes('<details class="gsec" data-g="rules" open>');
        } },
      recentLighterIn: { module: 'weeks', why: 'r53: the coach holds back a deload after a lighter week read from what the lifts did (more than half its sessions with half their lifts done lighter, once it has ended or from the second, or, a deload begun mid-week, its last two or more sessions deloads done lighter, tagged deload or in the week marked as one), a rest week, or a marked deload week with nothing trained in it; not after one lighter or deload session in a week otherwise trained (the audit and the six reviews, 2026-10-18)', uses: ['lighterTally', 'sortedSessionsIn', 'weekStart'],
        pairs: [["  let d: string | null = null;\n  for (const x of M.s.sessions) if (x.date >= from && (x.deload || x.light) && (!d || x.date > d)) d = x.date;\n  const I = IDXIn(M);\n  for (const id in I.byEx) for (const x of I.byEx[id]!) if (x.auto && x.date >= from && (!d || x.date > d)) d = x.date;\n  // A rest week is recovery too: its last day, or today while it runs.\n  for (const w of M.s.settings.restWeeks || []) {", "  let d: string | null = null;\n  const I = IDXIn(M);\n  const cur = weekStart(M.today());\n  const { weeks: T, lighter } = lighterTally(sortedSessionsIn(M), I.byEx, M.s.deloadWeek);\n  // The lighter weeks the averages leave out (idxLightWeeks); the week in progress from its second lighter session.\n  const week = (k: string): boolean => !!I.lightWk[k] && (k < cur || T[k].light >= 2);\n  for (const x of M.s.sessions)\n    if (x.date >= from && lighter(x.id) && week(weekStart(x.date)) && (!d || x.date > d)) d = x.date;\n  // A rest week is recovery too, and so is a marked deload week with nothing trained in it: its last day, or today while it runs.\n  for (const w of [\n    ...(M.s.settings.restWeeks || []),\n    ...(M.s.deloadWeek && !T[M.s.deloadWeek] ? [M.s.deloadWeek] : [])\n  ]) {"]], with: ['model', 'library'],
        check: (m, w) => {
          // Three normal Mondays at 100 x 8, 8, then the cases, today Thursday 15 October. A day done lighter is at 90.
          const set = (kg, r) => ({ w: kg, r, rir: 1, warm: false, drop: false });
          const ss = (id, date, mark, kg) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: mark === 'deload', light: mark === 'light', durMin: null, ex: [{ exId: 'bench', note: '', rr: [6, 10], sets: [set(kg || 100, 8), set(kg || 100, 8)] }] });
          const st = (sessions, restWeeks, deloadWeek) => ({ sessions, exercises: w.library.libExercises(), routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], cardio: [], injuries: [], deloadWeek: deloadWeek || null, settings: { unit: 'kg', rirMode: 'on', bands: {}, priorities: [], restWeeks } });
          const base = [ss('a', '2026-09-07'), ss('b', '2026-09-14'), ss('c', '2026-09-21')];
          const at = (sessions, restWeeks, dw) => m.recentLighterIn(w.model.modelOf(st([...base, ...sessions], restWeeks || [], dw), () => '2026-10-15'), 28);
          // Three lifts a session, the first n made lighter (Make it lighter, at 90), after three normal Mondays of all three.
          const ss3 = (id, date, n) => ({ ...ss(id, date), ex: ['bench', 'backSquat', 'rdl'].map((exId, i) => ({ exId, note: '', rr: [6, 10], light: i < n ? true : undefined, sets: [set(i < n ? 90 : 100, 8), set(i < n ? 90 : 100, 8)] })) });
          // Two lifts, the first made lighter.
          const two = (id, date) => { const x = ss3(id, date, 1); return { ...x, ex: x.ex.slice(0, 2) }; };
          const three = sessions => m.recentLighterIn(w.model.modelOf(st([ss3('a', '2026-09-07', 0), ss3('b', '2026-09-14', 0), ss3('c', '2026-09-21', 0), ...sessions], []), () => '2026-10-15'), 28);
          return [
            // One Lighter day in a week otherwise trained: nothing. A whole ended week of them: its newest.
            at([ss('l', '2026-10-05', 'light', 90), ss('n', '2026-10-07')]) === null,
            at([ss('l1', '2026-10-05', 'light', 90), ss('l2', '2026-10-07', 'light', 90)]) === '2026-10-07',
            // A deload on Wednesday and Friday after a normal Monday: Friday. Done at the usual 100 x 8, 8, it was no deload. One deload session after a normal Monday and Wednesday: nothing, as for one Lighter day.
            at([ss('n', '2026-10-05'), ss('d1', '2026-10-07', 'deload', 90), ss('d2', '2026-10-09', 'deload', 90)]) === '2026-10-09',
            at([ss('n', '2026-10-05'), ss('d1', '2026-10-07', 'deload'), ss('d2', '2026-10-09', 'deload')]) === null,
            at([ss('n1', '2026-10-05'), ss('n2', '2026-10-07'), ss('d', '2026-10-10', 'deload', 90)]) === null,
            // A Lighter day done at full, then one done lighter: one lighter session of two, as with the first untagged.
            at([ss('l1', '2026-10-05', 'light'), ss('l2', '2026-10-07', 'light', 90)]) === null,
            // This week, one Lighter day on Monday: not a lighter week yet; two, Monday and Wednesday: it is.
            at([ss('n', '2026-10-07'), ss('l', '2026-10-12', 'light', 90)]) === null,
            at([ss('n', '2026-10-07'), ss('l1', '2026-10-12', 'light', 90), ss('l2', '2026-10-14', 'light', 90)]) === '2026-10-14',
            // A rest week, and a deload week marked with nothing trained in it: each its last day. Marked after a trained week: nothing.
            at([], ['2026-10-05']) === '2026-10-11',
            at([], [], '2026-09-28') === '2026-10-04',
            at([ss('n1', '2026-10-05'), ss('n2', '2026-10-07')], [], '2026-10-05') === null,
            // Four days, Deload week tapped on Wednesday: normal Monday and Tuesday, deloads Thursday and Friday, its last two (the fourth review).
            at([ss('n1', '2026-10-05'), ss('n2', '2026-10-06'), ss('d1', '2026-10-08', 'deload', 90), ss('d2', '2026-10-09', 'deload', 90)]) === '2026-10-09',
            // A session is lighter when half or more of its lifts were: three lifts, two sessions with one made lighter each and a normal Friday is no lighter
            // week; with two of three made lighter in each, it is.
            three([ss3('m', '2026-10-05', 1), ss3('w', '2026-10-07', 1), ss3('f', '2026-10-09', 0)]) === null,
            three([ss3('m', '2026-10-05', 2), ss3('w', '2026-10-07', 2), ss3('f', '2026-10-09', 0)]) === '2026-10-07',
            // Exactly half: two lifts a session, one made lighter in each of the week's two sessions, is a lighter week.
            three([two('m', '2026-10-05'), two('w', '2026-10-07')]) === '2026-10-07',
            // Only a deload makes the last-sessions run (the fifth review): Lighter days on Thursday and Friday after three normal days are two of
            // five, as they would be on Monday and Tuesday; and deloads on Monday and Tuesday followed by two normal days are no deload begun mid-week.
            at([ss('n1', '2026-10-05'), ss('n2', '2026-10-06'), ss('n3', '2026-10-07'), ss('l1', '2026-10-08', 'light', 90), ss('l2', '2026-10-09', 'light', 90)]) === null,
            at([ss('d1', '2026-10-05', 'deload', 90), ss('d2', '2026-10-06', 'deload', 90), ss('n1', '2026-10-07'), ss('n2', '2026-10-08')]) === null,
            // A blank or Freestyle session in a marked week is not tagged deload (PENDING 311): Deload week marked, normal Monday and Tuesday, then
            // Thursday and Friday untagged at 90 are its last two, done lighter (the sixth review); the same two with no week marked are two of four.
            at([ss('n1', '2026-10-05'), ss('n2', '2026-10-06'), ss('f1', '2026-10-08', '', 90), ss('f2', '2026-10-09', '', 90)], [], '2026-10-05') === '2026-10-09',
            at([ss('n1', '2026-10-05'), ss('n2', '2026-10-06'), ss('f1', '2026-10-08', '', 90), ss('f2', '2026-10-09', '', 90)]) === null
          ].every(Boolean);
        } },
      coachIn: { module: 'coach', why: 'r53: the stall tip says what is left out as r53 reads it, sessions where the lift was trimmed or done lighter than usual and, on a lighter day, in a deload or on an exercise made lighter, ones with fewer reps or sets, no longer deload and lighter sessions as a whole, and that, in this rep range, a set stronger than any before it in a session left out since the third-last of them is movement (the fifth and sixth reviews)', uses: ['daysBetween', 'freeModeIn', 'plannedSetsIn', 'stallStretch', 'trendScope'],
        pairs: [["'Flat or down over its last 6 sessions (or 3 weeks), with no PR in the last 3, no heavier load, and no more reps at the same load, leaving out deload, lighter, and trimmed sessions.'", "'Flat or down over its last 6 sessions in this rep range (or 3 weeks), leaving out ones where it was trimmed or done lighter than usual, and, on a lighter day, in a deload, or on an exercise made lighter, ones with fewer reps or sets than usual; with no PR in the last 3 of them, nor a set stronger than any before it in a session left out since the third-last, no heavier load, and no more reps at the same load.'"], ["      const exId = inR.find(done) || logged[0] || inR[0] || null;\n      const how = exId", "      const exId = inR.find(done) || logged[0] || inR[0] || null;\n      /* The plan already reaches the target (r53, from the audit V asked\n         for: a lifter doing every planned set was told for weeks to add\n         sets). The shortfall is then sets skipped, or ended 4 or more in\n         reserve, as a lift's first sessions are while its load is found, so\n         adding sets is not the fix. Not in Freestyle mode, where the plan is\n         not what the lifter follows. */\n      const planned = plannedSetsIn(M, R)[u.m] || 0;\n      if (!freeModeIn(M) && !belowMin(planned, u.lo))\n        return {\n          tone: 'yellow',\n          text: `${ML[u.m]}: ${r1(u.got)} hard set${r1(u.got) === 1 ? '' : 's'} a week, target ${u.lo}-${u.hi}. Your plan has ${r1(planned)}: do every planned set${M.s.settings.rirMode === 'off' ? '' : ', to 3 or fewer reps in reserve'}.${under.length > 1 ? ` ${under.length - 1} more below target.` : ''}`,\n          why: `Your average of hard sets per week over your recent full weeks. Your plan already reaches the target, so the gap is in how the sets are done, not how many are planned: ${M.s.settings.rirMode === 'off' ? 'a planned set skipped does not count.' : \"a set counts as hard at 3 or fewer reps in reserve, so a planned set skipped, or ended with 4 or more in reserve (as a lift's first sessions are while its load is found), does not.\"}`,\n          act: { label: `See ${ML[u.m]}`, sec: 'volume', m: u.m }\n        };\n      const how = exId"], ["    // A set at the top of the range means st was there to read it from, as the ! says.\n    if (lw.length && lw.every(q => q.r >= +p.repMax))\n      return {\n        tone: 'yellow',\n        text: `${exNameIn(M, id)} has been at the top of its range at ${loadLabelIn(M, EXIn(M, id), st!.last.topW)}${EXIn(M, id).bw ? '' : ' ' + UIn(M)} for 3 weeks: it is due a step up, not a new range. The session's target says how.`,", "    /* How long it has not moved: the stretch the stall test read (r53, from\n       the audit V asked for: \"for 3 weeks\" was said of a lift flat for ten,\n       and of its whole stretch at the top of the range, which nothing\n       checks); a lift with no strength reading is read over its last 3\n       sessions. A set at the top of the range means st was there to read it\n       from, as the ! says. */\n    const l = stallStretch(trendScope(I.byEx[id] || [], M.today()).inRange.filter(x => x.tv != null));\n    const flat = l\n      ? `in ${Math.round(daysBetween(l[0].date, l[l.length - 1].date) / 7)} weeks`\n      : 'in its last 3 sessions';\n    if (lw.length && lw.every(q => q.r >= +p.repMax))\n      return {\n        tone: 'yellow',\n        text: `${exNameIn(M, id)} is at the top of its range at ${loadLabelIn(M, EXIn(M, id), st!.last.topW)}${EXIn(M, id).bw ? '' : ' ' + UIn(M)} and has not moved ${flat}: it is due a step up, not a new range. The session's target says how.`,"]], with: ['model', 'library'],
        check: (m, w) => {
          // Bench 100 x 8, 8 every week for six weeks, every muscle's target at 0 so nothing is below it: the coach names the stall, with the tip.
          const set = r => ({ w: 100, r, rir: 1, warm: false, drop: false });
          const ss = (id, date) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: false, light: false, durMin: null, ex: [{ exId: 'bench', note: '', rr: [6, 10], sets: [set(8), set(8)] }] });
          const bands = Object.fromEntries(w.library.MK.map(k => [k, [0, 99]]));
          const s = { sessions: ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'].map((d, i) => ss('s' + i, d)), exercises: w.library.libExercises(), routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], measurements: [], cardio: [], injuries: [], deloadWeek: null, settings: { unit: 'kg', rirMode: 'on', bands, priorities: [], restWeeks: [] } };
          const c = m.coachIn(w.model.modelOf(s, () => '2026-10-12'));
          return /has stalled/.test(c.text) && c.why === 'Flat or down over its last 6 sessions in this rep range (or 3 weeks), leaving out ones where it was trimmed or done lighter than usual, and, on a lighter day, in a deload, or on an exercise made lighter, ones with fewer reps or sets than usual; with no PR in the last 3 of them, nor a set stronger than any before it in a session left out since the third-last, no heavier load, and no more reps at the same load.';
        } },
      idxLiftIn: { module: 'analytics', why: 'r53: a lift held for a flagged injury is not called stalled (the audit, 2026-10-18); a PR in its range on a session left out of the stall, trimmed or done lighter, since the third-last session of the stretch is movement, as one in the stretch is (the fifth review: a PR is a PR whenever it happens), on a lift with a reading only one Recent PRs lists (the sixth review)', uses: ['exInjuryIn', 'offSession', 'stallStretch'],
        pairs: [["  anchor: string,\n  winStart: string\n): ExStat {", "  anchor: string,\n  winStart: string,\n  prs: readonly Pr[]\n): ExStat {"], ["    M.s.exercises.some(e => e.id === id);\n  if (!capped && current) {\n    const wE = withE1;\n    if (wE.length >= 4) {\n      const lastE = wE[wE.length - 1].date;\n      let i0 = wE.length - 1;\n      while (i0 > 0 && (wE.length - i0 < 6 || daysBetween(wE[i0].date, lastE) < 21)) i0--;\n      const l = wE.slice(i0);\n      if (daysBetween(l[0].date, lastE) >= 21) {\n        /* More reps at the same working load over no more sets is progress\n           too (r31): double progression adds reps to sets 2 to 4 once set 1\n           is at the top of the range, and that is not a stall. Since r32\n           it has to beat every earlier session at that load in the\n           stretch, not only the first: a press alternating 6, 6, 6 and 5,\n           5, 4 at one load for 7 weeks \"moved\" every other week. */\n        const z = l[l.length - 1],\n          a0 = l[0];\n        const same = l.slice(0, -1).filter(x => Math.abs(x.topW - z.topW) < 1e-6 && x.topN >= z.topN);\n        const moved =\n          l.slice(-3).some(x => x.progress) ||\n          z.topL > a0.topL + 1e-6 ||\n          z.topW > a0.topW + 1e-6 ||\n          (same.length > 0 && z.topReps > Math.max(...same.map(x => x.topReps)));\n        /* Flat is under 0.1% a week (r31): averaging working sets leaves\n           rounding dust, and identical sessions came out at +1e-32 a\n           week, so a perfectly flat lift was not called stalled. */\n        /* Since r32 the line is the median of the slopes between every\n           pair of sessions (Theil and Sen), so one good or bad day does\n           not set it: a squat at 20, 20, 30, 22, 24, 24 working reps read\n           stalled from its one good day, and a press alternating 6s and\n           5s read up from its last two. These sessions all have a reading\n           (withE1), as the two ! below say. */\n        const sen = (() => {\n          const a: number[] = [];\n          for (let i = 0; i < l.length; i++)\n            for (let j = i + 1; j < l.length; j++) {\n              const dd = daysBetween(l[i].date, l[j].date);\n              if (dd > 0) a.push((l[j].tv! - l[i].tv!) / dd);\n            }\n          return a.length ? median(a) : null;\n        })();\n        // Every session in l has a reading (withE1), as the ! says.\n        const my = l.reduce((a, x) => a + x.tv!, 0) / l.length;\n        stalled = sen != null && my > 0 && ((sen * 7) / my) * 100 < 0.1 && !moved;\n      }\n    } else if (withE1.length < 2) stalled = inRange.length >= 4 && inRange.slice(-3).every(x => !x.progress);", "    M.s.exercises.some(e => e.id === id) &&\n    !exInjuryIn(M, exI);\n  /* A PR is movement whatever the day (r53, V 2026-10-18: a PR is a PR\n     whenever it happens). A session where the lift was trimmed or done\n     lighter is left out of the stretch, and its PR went with it, so a lift\n     that set one on yesterday's Lighter day read stalled beside it in Recent\n     PRs (the fifth review). The sessions left out, in the range, since the\n     third-last session of the stretch: on a lift with a reading, one of\n     them with a PR that Recent PRs lists (big, stronger than ever) counts as\n     movement, since a set that only beat earlier ones at its own lighter\n     load, 90 x 9 after 100 x 8, is no sign a plateau has ended and took a\n     deload the lifts needed away again (the sixth review); on a lift with\n     none, any PR, as for the sessions of the stretch. */\n  const offSince = (from: string): Exposure[] =>\n    exps.filter(x => offSession(x) && sameRR(x.rr, curRR) && x.date >= from);\n  const listed = (x: Exposure): boolean => prs.some(p => p.big && p.sid === x.sid && p.exId === id);\n  if (!capped && current) {\n    const l = stallStretch(withE1);\n    if (l) {\n      /* More reps at the same working load over no more sets is progress\n           too (r31): double progression adds reps to sets 2 to 4 once set 1\n           is at the top of the range, and that is not a stall. Since r32\n           it has to beat every earlier session at that load in the\n           stretch, not only the first: a press alternating 6, 6, 6 and 5,\n           5, 4 at one load for 7 weeks \"moved\" every other week. */\n      const z = l[l.length - 1],\n        a0 = l[0];\n      const same = l.slice(0, -1).filter(x => Math.abs(x.topW - z.topW) < 1e-6 && x.topN >= z.topN);\n      const moved =\n        l.slice(-3).some(x => x.progress) ||\n        offSince(l[l.length - 3].date).some(listed) ||\n        z.topL > a0.topL + 1e-6 ||\n        z.topW > a0.topW + 1e-6 ||\n        (same.length > 0 && z.topReps > Math.max(...same.map(x => x.topReps)));\n      /* Flat is under 0.1% a week (r31): averaging working sets leaves\n           rounding dust, and identical sessions came out at +1e-32 a\n           week, so a perfectly flat lift was not called stalled. */\n      /* Since r32 the line is the median of the slopes between every\n           pair of sessions (Theil and Sen), so one good or bad day does\n           not set it: a squat at 20, 20, 30, 22, 24, 24 working reps read\n           stalled from its one good day, and a press alternating 6s and\n           5s read up from its last two. These sessions all have a reading\n           (withE1), as the two ! below say. */\n      const sen = (() => {\n        const a: number[] = [];\n        for (let i = 0; i < l.length; i++)\n          for (let j = i + 1; j < l.length; j++) {\n            const dd = daysBetween(l[i].date, l[j].date);\n            if (dd > 0) a.push((l[j].tv! - l[i].tv!) / dd);\n          }\n        return a.length ? median(a) : null;\n      })();\n      // Every session in l has a reading (withE1), as the ! says.\n      const my = l.reduce((a, x) => a + x.tv!, 0) / l.length;\n      stalled = sen != null && my > 0 && ((sen * 7) / my) * 100 < 0.1 && !moved;\n    } else if (withE1.length < 2)\n      stalled =\n        inRange.length >= 4 &&\n        inRange.slice(-3).every(x => !x.progress) &&\n        !offSince(inRange[inRange.length - 3].date).some(x => x.progress);"]], with: ['model', 'library'],
        check: (m, w) => {
          // Bench 100 x 8, 8 every week for six weeks, today Monday 12 October: stalled; with the chest flagged as injured: not stalled, held on purpose.
          const set = (r, kg) => ({ w: kg == null ? 100 : kg, r, rir: 1, warm: false, drop: false });
          const ss = (id, date) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: false, light: false, durMin: null, ex: [{ exId: 'bench', note: '', rr: [6, 10], sets: [set(8), set(8)] }] });
          const six = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'].map((d, i) => ss('s' + i, d));
          const st = (injuries, more) => ({ sessions: [...six, ...(more || [])], exercises: w.library.libExercises(), routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], cardio: [], injuries, deloadWeek: null, settings: { unit: 'kg', rirMode: 'on', bands: {}, priorities: [], restWeeks: [] } });
          const I = (injuries, more) => m.IDXIn(w.model.modelOf(st(injuries, more), () => '2026-10-12'));
          const I0 = I([]), I1 = I([{ m: 'chest', note: '' }]);
          // A Lighter day on Saturday at 105 x 8, one set: a weight PR, so not stalled; the same set on a normal day with the bench made lighter: the same.
          // At 90 x 8 it set no PR: still stalled. Dated on the third-last session of the stretch (24 September) it counts; the day before, not.
          const one = (id, date, kg, light, made) => ({ ...ss(id, date), light: !!light, ex: [{ exId: 'bench', note: '', rr: [6, 10], light: made ? true : undefined, sets: [set(8, kg)] }] });
          const lit = I([], [one('l', '2026-10-10', 105, true)]);
          const pu = (id, date) => ({ ...ss(id, date), light: true, ex: [{ exId: 'pullup', note: '', rr: [8, 12], sets: [set(12, 0)] }] });
          const alt = (rr, r, kg, rir) => ({ ...ss('l', '2026-10-10'), light: true, ex: [{ exId: 'bench', note: '', rr, sets: [{ ...set(r, kg), rir }] }] });
          return I0.exStats.bench.stalled === true && I1.exStats.bench.stalled === false &&
            lit.exStats.bench.stalled === false && lit.prs.some(p => p.sid === 'l' && p.type === 'Weight PR') &&
            I([], [one('l', '2026-10-10', 105, false, true)]).exStats.bench.stalled === false &&
            I([], [one('l', '2026-10-10', 90, true)]).exStats.bench.stalled === true &&
            I([], [one('l', '2026-09-24', 105, true)]).exStats.bench.stalled === false &&
            I([], [one('l', '2026-09-23', 105, true)]).exStats.bench.stalled === true &&
            // Only a PR Recent PRs lists counts from a day left out (the sixth review): 90 x 9 at 3 in reserve on the Lighter day is a rep PR at
            // its lighter load, not stronger than ever, so still stalled; and only in the range: 120 x 3 on a Lighter day planned at 3-5 is a
            // listed weight PR in another range, so still stalled.
            I([], [alt([6, 10], 9, 90, 3)]).exStats.bench.stalled === true && I([], [alt([6, 10], 9, 90, 3)]).prs.some(p => p.sid === 'l' && !p.big) &&
            I([], [alt([3, 5], 3, 120, 1)]).exStats.bench.stalled === true && I([], [alt([3, 5], 3, 120, 1)]).prs.some(p => p.sid === 'l' && p.big) &&
            // Pull-ups before any weigh-in have no strength reading and keep the count test: at 10, 10 for six weeks, stalled; a Lighter day at 12,
            // one set, is a rep PR, so not stalled; on 24 September, the third-last session, the same; on 23 September, before it, stalled.
            [[[], true], [[pu('l', '2026-10-10')], false], [[pu('l', '2026-09-24')], false], [[pu('l', '2026-09-23')], true]].every(([more, want]) =>
              m.IDXIn(w.model.modelOf({ ...st([]), sessions: [...six.map(x => ({ ...x, ex: [{ exId: 'pullup', note: '', rr: [8, 12], sets: [set(10, 0), set(10, 0)] }] })), ...more] }, () => '2026-10-12')).exStats.pullup.stalled === want);
        } },
      idxAutoLighter: { module: 'analytics', why: 'r53: its second pass reads its usual-load test through atUsualLoad, which idxTaggedFull shares, the same comparison', uses: ['atUsualLoad'],
        pairs: [['      if (o && o.l >= 2 && o.l * 2 >= o.n && ref.length) {\n        const mL = Math.max(...ref.map(q => q.topL)),\n          mT = Math.max(...ref.map(q => (q.tRaw == null ? -Infinity : q.tRaw)));\n        if (x.topL < mL - 1e-6 || (x.tRaw != null && isFinite(mT) && x.tRaw < mT * 0.97)) {\n          x.auto = true;\n          continue;\n        }\n      }\n', '      if (o && o.l >= 2 && o.l * 2 >= o.n && ref.length && !atUsualLoad(x, ref)) {\n        x.auto = true;\n        continue;\n      }\n']],
        check: (m, w) => {
          // Step 2's second pass through the shared test: in a week read as lighter, a lift under its usual load is lighter too, one at it is not.
          const ex = (sid, date, topL, tRaw) => ({ sid, date, rr: [8, 12], topL, tRaw, deload: false, light: false, cut: false });
          const byEx = { a: [ex('a1', '2026-09-01', 100, 120), ex('a2', '2026-09-08', 100, 120), ex('a3', '2026-09-15', 80, 90)], b: [ex('b1', '2026-09-01', 50, 60), ex('b2', '2026-09-08', 50, 60), ex('b3', '2026-09-15', 40, 45)], c: [ex('c1', '2026-09-01', 30, 40), ex('c2', '2026-09-08', 30, 40), ex('c3', '2026-09-15', 30, 40)], d: [ex('d1', '2026-09-01', 20, 30), ex('d2', '2026-09-08', 20, 30), ex('d3', '2026-09-15', 19, 30)] };
          m.idxAutoLighter(byEx);
          return byEx.a[2].auto === true && byEx.b[2].auto === true && !byEx.c[2].auto && byEx.d[2].auto === true;
        } },
      planForIn: { module: 'routines', why: 'r53: a lift on no day of the routine starts from its own last full session, its sets and, where the training profile sets none, its range (tests/r53.js)', uses: ['EXIn', 'isWork', 'profRuleIn', 'sessCmp'],
        pairs: [['  return defPlanIn(M, exId, plain);\n', '  /* A lift on no day of the routine starts from its own last full session\n     (r53, V 2026-10-18: "tied at exercise level"; not a deload, a lighter\n     day, trimmed or sample): that session\'s number of working sets, and the\n     range it was planned at then where the training profile sets none for\n     the lift. Never logged, the default as before. plain (the pace model)\n     reads past sessions without this, as without the profile. */\n  const base = defPlanIn(M, exId, plain);\n  if (plain) return base;\n  const work = (q: { warm?: boolean; drop?: boolean; r: number | string | null }): boolean => isWork(q) && !q.drop;\n  let last: Session | null = null,\n    blk: SessionEx | null = null;\n  for (const x of M.s.sessions) {\n    if (x.demo || x.deload || x.light || (last && sessCmp(x, last) <= 0)) continue;\n    const b = x.ex.find(q => q.exId === exId && !q.cut && !q.light && q.sets.some(work));\n    if (b) [last, blk] = [x, b];\n  }\n  if (!blk) return base;\n  const range = blk.rr && !profRuleIn(M, EXIn(M, exId)) ? { repMin: blk.rr[0], repMax: blk.rr[1] } : {};\n  return { ...base, ...range, sets: blk.sets.filter(work).length };\n']], with: ['model', 'library'],
        check: (m, w) => {
          // Bench on no day of the routine; squat on its one day, 4 x 6-8. Bench's last full session: 5 x 3-5; a lighter day and sample data after it.
          const set = r => ({ w: 100, r, rir: 1, warm: false, drop: false });
          const sess = (id, date, mark, n, rr) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: mark === 'demo', deload: false, light: mark === 'light', durMin: null, ex: [{ exId: 'bench', note: '', rr, sets: Array.from({ length: n }, () => set(5)) }] });
          const R = { id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [{ uid: 'u', exId: 'backSquat', sets: 4, repMin: 6, repMax: 8, rir: 2, rest: 150, inc: 2.5, ss: null }] }] };
          const st = profile => ({ sessions: [sess('a', '2026-09-01', '', 5, [3, 5]), sess('b', '2026-09-08', 'light', 2, [3, 5]), sess('c', '2026-09-15', 'demo', 1, [8, 12])], exercises: w.library.libExercises(), routines: [R], activeRoutineId: 'R', settings: profile ? { profile } : {} });
          const M = w.model.modelOf(st(null), () => '2026-10-01'), P = w.model.modelOf(st({ goal: 'strength', exp: 'mid' }), () => '2026-10-01');
          const f = (Mx, id, plain) => { const p = m.planForIn(Mx, id, null, null, plain); return `${p.sets} ${p.repMin}-${p.repMax}`; };
          return f(M, 'bench') === '5 3-5' && f(M, 'bench', true) === '3 8-12' && f(M, 'backSquat') === '4 6-8' && f(M, 'frontSquat') === '3 8-12' && f(P, 'bench') === '5 3-6';
        } },
      idxPRsIn: { module: 'analytics', why: 'r53: PRs are read on every day, lighter and deload days too, as only one stronger than every earlier set is counted (big) (tests/r53.js)', uses: [],
        pairs: [["    // A deload or lighter day is lighter on purpose: its sets are never PRs (r32, second check: 90 x 12 on a Lighter day listed as one).\n    const offPR = x.deload || x.light;\n    // Each PR keeps its session (sid), so two sessions on one day never share one (r34.2), and the overall best before it (prevAll) beside the band's (prev).\n    if (!offPR) {\n      if (wPR)\n        prs.push({\n          date: x.date,\n          sid: x.sid,\n          exId: id,\n          type: 'Weight PR',\n          w: wPR.w,\n          r: wPR.r,\n          prevW: prevMaxW,\n          value: e1PR ? x.pb : null,\n          prev: e1PR ? pb : null,\n          prevAll: maxPb,\n          bb: x.pbb,\n          big\n        });\n      else if (e1PR)\n        prs.push({\n          date: x.date,\n          sid: x.sid,\n          exId: id,\n          type: 'e1RM',\n          value: x.pb,\n          prev: pb,\n          prevAll: maxPb,\n          bb: x.pbb,\n          big\n        });\n      else if (repPR)\n        prs.push({\n          date: x.date,\n          sid: x.sid,\n          exId: id,\n          type: 'Rep PR',\n          w: repPR.w,\n          r: repPR.r,\n          prevR: front.filter(q => q.pl >= repPR.pl - 1e-6).reduce((a, q) => Math.max(a, q.r), 0),\n          big\n        });\n    }\n", "    /* A PR is a PR whatever the day is called (r53, V 2026-10-18: a set\n       stronger than any before it, logged on a Lighter day, was not\n       counted). r32 kept every PR off deload and lighter days after a weaker\n       set on one was listed as a PR; since r34.2 only a set stronger than\n       every earlier one is counted and announced (big), and a heavier set\n       without one is said once, quietly (Heaviest yet), so the day's label\n       decides nothing here. */\n    // Each PR keeps its session (sid), so two sessions on one day never share one (r34.2), and the overall best before it (prevAll) beside the band's (prev).\n    if (wPR)\n      prs.push({\n        date: x.date,\n        sid: x.sid,\n        exId: id,\n        type: 'Weight PR',\n        w: wPR.w,\n        r: wPR.r,\n        prevW: prevMaxW,\n        value: e1PR ? x.pb : null,\n        prev: e1PR ? pb : null,\n        prevAll: maxPb,\n        bb: x.pbb,\n        big\n      });\n    else if (e1PR)\n      prs.push({\n        date: x.date,\n        sid: x.sid,\n        exId: id,\n        type: 'e1RM',\n        value: x.pb,\n        prev: pb,\n        prevAll: maxPb,\n        bb: x.pbb,\n        big\n      });\n    else if (repPR)\n      prs.push({\n        date: x.date,\n        sid: x.sid,\n        exId: id,\n        type: 'Rep PR',\n        w: repPR.w,\n        r: repPR.r,\n        prevR: front.filter(q => q.pl >= repPR.pl - 1e-6).reduce((a, q) => Math.max(a, q.r), 0),\n        big\n      });\n"]], with: ['model', 'library'],
        check: (m, w) => {
          // Bench 100 x 8 twice, then three days a lighter day each: 90 x 8 (lighter, no news), 120 x 8 (stronger than ever), 95 x 8.
          const set = (kg, r) => ({ w: kg, r, rir: 1, warm: false, drop: false });
          const day = (id, date, light, kg) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: false, light, durMin: null, ex: [{ exId: 'bench', note: '', rr: [6, 10], sets: [set(kg, 8), set(kg, 8)] }] });
          const s = { sessions: [day('a', '2026-09-01', false, 100), day('b', '2026-09-08', false, 100), day('c', '2026-09-15', true, 90), day('d', '2026-09-22', true, 120), day('e', '2026-09-29', true, 95)], exercises: w.library.libExercises(), routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], measurements: [], cardio: [], injuries: [], deloadWeek: null, settings: { unit: 'kg', rirMode: 'on', bands: {}, priorities: [], restWeeks: [] } };
          const I = m.IDXIn(w.model.modelOf(s, () => '2026-10-01'));
          const x = Object.fromEntries(I.byEx.bench.map(q => [q.sid, q.light]));
          const prs = I.prs.filter(p => p.exId === 'bench').map(p => `${p.sid} ${p.type} ${p.big}`);
          return x.c === true && x.d === false && x.e === true && JSON.stringify(prs) === JSON.stringify(['d Weight PR true']);
        } },
      IDXIn: { module: 'analytics', why: 'r53: a step after the lighter readings makes a lift done at its usual load on a deload or lighter day a full session for it (idxTaggedFull, tests/r53.js); the stall test is given the PR list, to read which PRs Recent PRs lists (the sixth review)', uses: ['idxTaggedFull'],
        pairs: [["  const wkAuto = idxAutoLighter(byEx);\n  const lightWk = idxLightWeeks(sessions, wkAuto);\n", "  idxAutoLighter(byEx);\n  idxTaggedFull(byEx);\n  const lightWk = idxLightWeeks(sessions, byEx, M.s.deloadWeek);\n"], ["    exStats[id] = idxLiftIn(M, id, byEx[id], maxBest, anchor, winStart);", "    exStats[id] = idxLiftIn(M, id, byEx[id], maxBest, anchor, winStart, prs);"]], with: ['model', 'library'],
        check: (m, w) => {
          // The step runs after the lighter readings and reaches what is read from them: bench 100 x 8, 8, 8 on two Tuesdays,
          // then a lighter day at 100 x 8, 8, 8 (usual: a full session, so the newest the trend and the stall test read),
          // a lighter day at 100 x 8, 8 (fewer sets: lighter), and an untagged session at 80 x 8, 8, 8 read lighter from its loads.
          const set = (kg, r) => ({ w: kg, r, rir: 1, warm: false, drop: false });
          const day = (id, date, light, kg, n) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', notes: '', demo: false, deload: false, light, durMin: null, ex: [{ exId: 'bench', note: '', rr: [6, 10], sets: Array.from({ length: n }, () => set(kg, 8)) }] });
          const s = { sessions: [day('a', '2026-09-01', false, 100, 3), day('b', '2026-09-08', false, 100, 3), day('c', '2026-09-15', true, 100, 3), day('d', '2026-09-22', true, 100, 2), day('e', '2026-09-29', false, 80, 3)], exercises: w.library.libExercises(), routines: [{ id: 'R', name: 'R', schedule: 'weekly', days: [{ id: 'D', name: 'D', rest: false, items: [] }] }], activeRoutineId: 'R', bodyweights: [], measurements: [], cardio: [], injuries: [], deloadWeek: null, settings: { unit: 'kg', rirMode: 'on', bands: {}, priorities: [], restWeeks: [] } };
          const I = m.IDXIn(w.model.modelOf(s, () => '2026-10-01'));
          const x = Object.fromEntries(I.byEx.bench.map(q => [q.sid, `${q.light ? 'L' : ''}${q.auto ? 'A' : ''}`]));
          return x.c === '' && x.d === 'L' && x.e === 'A' && I.exStats.bench.last.sid === 'c';
        } },

    },
    adapters: { module: 'live', fn: 'live', imports: 'src/09-imports.js' },
    expect: { adapters: 2 },
    legacy: { calls: {}, statements: {} } },
];

// One declaration as a normalized statement: a function as written, a
// variable as `<kind> name = init;`, both printed by esbuild with its local
// names (parameters and variables inside the declaration) renamed by the
// minifier, which names them by structure alone. The bundle renames a local
// that shadows a top-level name (r49 printed e1's `load` as `load2`, since
// the script has a function `load`), and that is not a change in logic.
// Every name that reaches outside the declaration keeps its own name, so a
// call to a different function still fails here.
// Whitespace is minified too: esbuild keeps an array or object literal's line
// breaks when it reprints, so without it a reformatted list read as a change
// (found in r51, when the new modules were formatted).
// The names are minified from the code as esbuild reprints it, with no
// comments or pure annotations and every string in one spelling: the
// minifier picks short names by how often each character occurs in its
// input, so the compiler's /* @__PURE__ */ marks, or an arrow written as
// \u2192 in a stated code and as itself in the module, gave the same code two
// sets of names (found in r53, when one argument changed and a tie broke the
// other way). Two pieces of code with the same syntax compare equal, as
// before, and nothing that differs in code can.
const reprint = text => esbuild.transformSync(text, { loader: 'js', legalComments: 'none', minifyWhitespace: true, ignoreAnnotations: true }).code;
const norm = text => esbuild.transformSync(reprint(text), { loader: 'js', legalComments: 'none', minifyIdentifiers: true, minifyWhitespace: true }).code.trim();
// `kind` prints every variable with that keyword instead of its own, for a
// comparison where the keyword is the bundler's choice, not the code's: the
// minifier picks local names from the whole statement, keyword included.
function decls(code, statements, kind) {
  const out = new Map();
  for (const st of statements) {
    const s = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
    if (!s) continue;
    if (s.type === 'FunctionDeclaration') out.set(s.id.name, { code: norm(code.slice(s.start, s.end)), node: s });
    // The initializer is taken from after the name to the end of the declarator, so a parenthesized one keeps its parentheses (a sequence in them made esbuild stop, the r51 mutation test).
    else if (s.type === 'VariableDeclaration') for (const d of s.declarations) if (d.id.type === 'Identifier') out.set(d.id.name, { code: norm(`${kind || s.kind} ${d.id.name}${d.init ? code.slice(d.id.end, d.end) : ' = undefined'};`), node: d, kind: s.kind });
  }
  return out;
}
const declared = statements => new Set(statements.flatMap(st => {
  const s = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
  if (!s) return [];
  if (s.type === 'FunctionDeclaration' || s.type === 'ClassDeclaration') return [s.id.name];
  if (s.type === 'VariableDeclaration') return s.declarations.filter(d => d.id.type === 'Identifier').map(d => d.id.name);
  return [];
}));
// The legacy script in a built page, found by the shape scripts/join.js gives
// the bundle, never by what the code looks like: before r49 the page's app
// script is the legacy function called at once, `(function(){'use strict';
// ...})();`, and from r49 esbuild's wrapper `(() => { ... })();` (after a
// "use strict" line from r50) holds the modules' code and then, as its last
// statement, that same call, since esbuild writes the entry's own code after
// the modules it imports. Anything else stops the suite. Until r51 this took
// the largest function that starts with "use strict", and the review showed a
// copy of the legacy body in a module was then read in its place, so a change
// to the real one went unseen. `outer` is what the bundle declared outside the
// legacy wrapper: the modules' code.
function legacyIn(file) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => (b.length > a.length ? b : a), '');
  const ast = acorn.parse(app, { ecmaVersion: 'latest' });
  const top = ast.body.filter(s => !(s.type === 'ExpressionStatement' && s.directive === 'use strict'));
  const call = s => s && s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' && !s.expression.arguments.length ? s.expression.callee : null;
  const isLegacy = s => { const f = call(s); return !!f && f.type === 'FunctionExpression' && !f.params.length && f.body.body.length > 0 && f.body.body[0].directive === 'use strict'; };
  let wrap = null, outer = [];
  if (top.length === 1 && isLegacy(top[0])) wrap = call(top[0]);
  else if (top.length === 1 && call(top[0]) && call(top[0]).type === 'ArrowFunctionExpression' && call(top[0]).body.type === 'BlockStatement') {
    const inner = call(top[0]).body.body;
    if (inner.length && isLegacy(inner[inner.length - 1])) { wrap = call(inner[inner.length - 1]); outer = inner.slice(0, -1); }
  }
  if (!wrap) throw new Error(`${file}: the app script is not in the shape scripts/join.js builds, so its legacy script cannot be found`);
  // There is one legacy script, and it is the one found: a second call of
  // the same shape anywhere in the script (a copy of the legacy body
  // appended to it, the r51 mutation test) stops the suite.
  let shaped = 0;
  (function count(n) { if (!n || typeof n.type !== 'string') return; if (isLegacy(n)) shaped++; for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(count); else if (v && typeof v.type === 'string') count(v); } })(ast);
  if (shaped !== 1) throw new Error(`${file}: ${shaped} scripts of the legacy script's shape, where there is one`);
  return { app, ast, body: wrap.body.body, outer: [...ast.body.filter(s => s !== top[0]), ...outer], strict: ast.body[0] && ast.body[0].directive === 'use strict' };
}
// The legacy script's top-level declarations, and the names declared outside it.
function legacyOf(file) {
  const { app, body, outer } = legacyIn(file);
  return { decls: decls(app, body), outer: declared(outer), outerDecls: decls(app, outer, 'var'), app, body };
}
// Every file under src/app/, at any depth, named by its path from src/app/
// without `.ts` (`util`, `screens/today`). Anything that is not a `.ts` file
// is refused: the bundler would take `util.tsx` before `util.ts`, and no
// check reads it (the r51 mutation test).
function appFiles(dir = APP, rel = '') {
  const out = { ids: [], other: [] };
  for (const f of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${f.name}` : f.name;
    if (f.isDirectory()) { const sub = appFiles(path.join(dir, f.name), r); out.ids.push(...sub.ids); out.other.push(...sub.other); }
    else if (f.name.endsWith('.ts')) out.ids.push(r.slice(0, -3));
    else out.other.push(r);
  }
  return out;
}
const FILES = appFiles();
ok(FILES.other.length === 0, 'src/app/ holds .ts files only', FILES.other);
// An import's target as a module id, resolved from the importing file's own
// place, never by its base name (a `./sub/util` matched `util` before, the
// r51 mutation test); `fromApp` says it is a module of src/app/.
function resolveImport(fromId, spec) {
  const abs = path.resolve(path.dirname(path.join(APP, fromId + '.ts')), spec);
  const rel = path.relative(APP, abs).split(path.sep).join('/');
  const fromApp = !rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(abs + '.ts');
  return { from: rel, fromApp, spec };
}
// A module's code as esbuild compiles it on its own, with its syntax tree.
// Characters outside ASCII are kept as written, as scripts/join.js builds the
// page (charset utf8): the minifier picks local names by how often each
// character occurs, so `×` written as `\xD7` on one side named the locals of
// suggestCore differently on the page and in its module (found in r52).
const TS = { loader: 'ts', format: 'esm', charset: 'utf8' };
const compiled = mod => { const js = esbuild.transformSync(fs.readFileSync(path.join(APP, mod + '.ts'), 'utf8'), TS).code; return { js, ast: acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' }) }; };
// A module as esbuild leaves it for the browser: what it imports (local name
// to source and imported name), its top-level statements, and its exports.
// Declarations a release changes after the move that moved them (r53, a
// change a lifter sees between phases): its entry lists each edit, the text
// as it was and as it is now, in the TypeScript as written. The module is
// read here with each edit undone, so every other token of the declaration
// is still compared with its move's baseline as before; the new text must
// sit once in the named declaration, nowhere else; the names the edits
// bring in are stated; and each entry has an executable check (below).
const EDITS = MOVES.flatMap(mv => Object.entries(mv.edits || {}).map(([name, e]) => ({ release: mv.release, name, ...e })));
const editProblems = [];
function undoEdits(mod, text) {
  const tsc = require('typescript');
  for (const e of EDITS.filter(x => x.module === mod)) {
    const sf = tsc.createSourceFile(mod + '.ts', text, tsc.ScriptTarget.Latest, true);
    const st = sf.statements.find(x => (tsc.isFunctionDeclaration(x) && x.name && x.name.text === e.name) || (tsc.isVariableStatement(x) && x.declarationList.declarations.some(d => d.name.getText(sf) === e.name)));
    if (!st || !Array.isArray(e.pairs) || !e.pairs.length) { editProblems.push(`${e.release} ${mod}.${e.name}: ${st ? 'no edits listed' : 'not a top-level declaration'}`); continue; }
    const a = st.getStart(sf), b = st.end;
    let decl = text.slice(a, b);
    for (const [was, now] of e.pairs) {
      const inDecl = decl.split(now).length - 1, inFile = text.split(now).length - 1;
      if (typeof was !== 'string' || !now || inDecl !== 1 || inFile !== 1) { editProblems.push(`${e.release} ${mod}.${e.name}: an edit's new text is in the declaration ${inDecl} times and in the module ${inFile} times (once each expected)`); continue; }
      decl = decl.replace(now, () => was);
    }
    text = text.slice(0, a) + decl + text.slice(b);
  }
  return text;
}
function moduleOf(name) {
  const ts = undoEdits(name, fs.readFileSync(path.join(APP, name + '.ts'), 'utf8'));
  const js = esbuild.transformSync(ts, TS).code;
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  const imports = new Map(), odd = [], exported = new Set();
  const top = declared(ast.body);
  for (const s of ast.body) {
    if (s.type === 'ImportDeclaration') {
      // An import with no names (`import './x'`) runs a module for its effects: nothing a move may bring (the r51 review).
      if (!s.specifiers.length) odd.push(`import '${s.source.value}' (run for its effects)`);
      for (const sp of s.specifiers) {
        if (sp.type !== 'ImportSpecifier' || sp.imported.name !== sp.local.name) odd.push(`import ${js.slice(sp.start, sp.end)} from ${s.source.value}`);
        imports.set(sp.local.name, { ...resolveImport(name, s.source.value), name: sp.imported ? sp.imported.name : null });
      }
      continue;
    }
    if (s.type === 'ExportNamedDeclaration' && !s.source) {
      // esbuild prints `export function f` as `function f` plus `export { f }`,
      // so the exported names come from either form.
      for (const sp of s.specifiers || []) { if (sp.exported.name !== sp.local.name || !top.has(sp.local.name)) odd.push(`export ${js.slice(sp.start, sp.end)}`); exported.add(sp.exported.name); }
      if (s.declaration && s.declaration.type === 'VariableDeclaration' && s.declaration.declarations.some(d => d.id.type !== 'Identifier')) odd.push(`a destructured export: ${js.slice(s.start, Math.min(s.end, s.start + 80))}`);
      if (s.declaration) for (const n of declared([s])) exported.add(n);
      continue;
    }
    // A binding made by destructuring is a top-level name too, and one that
    // can take a global's name or run code on load (`const { Math } = ...`,
    // `const [] = [...]`, the r51 mutation test); only plain names pass.
    if (s.type === 'VariableDeclaration' && s.declarations.some(d => d.id.type !== 'Identifier')) odd.push(`a destructured top-level binding: ${js.slice(s.start, Math.min(s.end, s.start + 80))}`);
    if (s.type === 'FunctionDeclaration' || s.type === 'VariableDeclaration') continue; // checked below: every one must be exported
    odd.push(js.slice(s.start, Math.min(s.end, s.start + 80)));
  }
  for (const n of top) if (!exported.has(n)) odd.push(`a private top-level name: ${n}`);
  const all = decls(js, ast.body);
  // A function taking the model is known by its first parameter, M (phase
  // 3b), never by its name; its name is the r51 name with In added.
  const modelFns = new Map();
  for (const [n, d] of all) { const f = fnOf(d.node); if (f && f.params.length && f.params[0].type === 'Identifier' && f.params[0].name === MODEL) modelFns.set(n, n.endsWith('In') ? n.slice(0, -2) : null); }
  // Names declared in a statement with other declarators: code added on
  // purpose must stand alone, so nothing rides in its statement (the second
  // r52 review put an adapter in LIVE's statement, and a cast with it).
  const shared = new Set(ast.body.map(st => (st.type === 'ExportNamedDeclaration' ? st.declaration : st)).filter(st => st && st.type === 'VariableDeclaration' && st.declarations.length > 1).flatMap(st => st.declarations.filter(d => d.id.type === 'Identifier').map(d => d.id.name)));
  return { js, ast, imports, odd, modelFns, shared, exported: new Map([...exported].map(n => [n, all.get(n)])) };
}
// The function a top-level declaration is: a function declaration, or a
// variable bound to a function or arrow expression.
const fnOf = node => node.type === 'FunctionDeclaration' ? node : node.type === 'VariableDeclarator' && node.init && /^(FunctionExpression|ArrowFunctionExpression)$/.test(node.init.type) ? node.init : null;
const MODEL = 'M';
// The names a declaration changed or added on purpose may read without
// binding them: ECMAScript's own built-ins (Map, Math, Set and the like), as
// a fresh context has them, so no browser or Node global passes, and neither
// eval nor console (r53), nor what runs or reaches code by other means:
// Function (eval by another name), Reflect, Proxy and WebAssembly (the
// review of r53).
const GLOBAL_OK = new Set(require('vm').runInNewContext('Object.getOwnPropertyNames(globalThis)').filter(n => !['eval', 'console', 'globalThis', 'Function', 'Reflect', 'Proxy', 'WebAssembly'].includes(n)));
// Every identifier in a piece of code, with the chain of nodes above it.
function idents(node) {
  const out = [];
  (function walk(n, up) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'Identifier') { out.push({ n, up }); return; }
    const next = [...up, n];
    for (const k in n) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, next)); else if (v && typeof v.type === 'string') walk(v, next); }
  })(node, []);
  return out;
}
// Whether an identifier names something rather than being a property name
// (`x.M`, `{ M: 1 }`) or a label.
function isRef({ n, up }) {
  const p = up[up.length - 1];
  if (!p) return true;
  if (p.type === 'MemberExpression' && p.property === n && !p.computed) return false;
  if ((p.type === 'Property' || p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') && p.key === n && !p.computed && !(p.type === 'Property' && p.shorthand && p.value === n)) return false;
  if ((p.type === 'LabeledStatement' || p.type === 'BreakStatement' || p.type === 'ContinueStatement') && p.label === n) return false;
  if (p.type === 'MetaProperty') return false;
  return true;
}
// A function taking the model read back as the r51 code it came from (phase
// 3b's five rules, ARCHITECTURE.md): the declaration loses In and its first
// parameter M; M.s is state, M.today is today and M.c.X is the cache X; a call
// fIn(M, ...) of a function taking the model is f(...); and `p => fIn(M, p)`
// is f where r51's f takes that one parameter. Any other use of M, or of a
// function taking the model, is a problem: M nested, indexed or passed whole,
// a spread, a call without M, a reader used as a value. `model(name)` says
// whether a name, as this module binds it, is a function taking the model, and
// gives its r51 name; `oneParam(name)` whether r51's declaration of it takes
// exactly one parameter. Returns the read-back code, the names the read-back
// produced (each resolved by the rule that produced it, not by an import), and
// the problems.
function readBack(js, d, base, spec, model, oneParam) {
  const node = d.node, f = fnOf(node), problems = [], produced = new Set(), edits = [];
  const own = f.params[0];
  const handled = new Set([own, node.id]);
  const at = n => js.slice(n.start, Math.min(n.end, n.start + 60));
  const all = idents(f);
  // Calls of a function taking the model, and the one-parameter arrows of rule 5.
  for (const r of all) {
    if (handled.has(r.n) || !isRef(r)) continue;
    const m = model(r.n.name);
    if (m === undefined) continue;
    if (m === null) { problems.push(`${r.n.name} takes the model but is not named for an r51 declaration with In`); continue; }
    const p = r.up[r.up.length - 1], g = r.up[r.up.length - 2];
    const firstIsM = p && p.type === 'CallExpression' && p.callee === r.n && p.arguments.length && p.arguments[0].type === 'Identifier' && p.arguments[0].name === MODEL;
    if (!firstIsM) { problems.push(`${r.n.name} used other than called with M first: ${at(p || r.n)}`); continue; }
    if (g && g.type === 'ArrowFunctionExpression' && g.body === p && g.params.length === 1 && g.params[0].type === 'Identifier' && p.arguments.length === 2 && p.arguments[1].type === 'Identifier' && p.arguments[1].name === g.params[0].name && oneParam(m)) {
      edits.push([g.start, g.end, m]); produced.add(m); handled.add(r.n); handled.add(p.arguments[0]); handled.add(p.arguments[1]); handled.add(g.params[0]);
      continue;
    }
    edits.push([r.n.start, r.n.end, m]); produced.add(m); handled.add(r.n); handled.add(p.arguments[0]);
    edits.push([p.arguments[0].start, p.arguments.length > 1 ? p.arguments[1].start : p.arguments[0].end, '']);
  }
  // M itself: the log, the date and the caches.
  for (const r of all) {
    if (handled.has(r.n) || r.n.name !== MODEL) continue;
    if (!isRef(r)) continue;
    const p = r.up[r.up.length - 1], g = r.up[r.up.length - 2];
    const prop = p && p.type === 'MemberExpression' && p.object === r.n && !p.computed ? p.property.name : null;
    if (prop === 's') { edits.push([p.start, p.end, spec.state]); produced.add(spec.state); }
    else if (prop === 'today') { edits.push([p.start, p.end, spec.today]); produced.add(spec.today); }
    else if (prop === 'c' && g && g.type === 'MemberExpression' && g.object === p && !g.computed && spec.retired.includes(g.property.name)) { edits.push([g.start, g.end, g.property.name]); produced.add(g.property.name); }
    else problems.push(`M used other than as M.s, M.today, M.c.<cache> or a first argument: ${at(p || r.n)}`);
  }
  // The declaration: its r51 name, and no M parameter.
  edits.push([node.id.start, node.id.end, base]);
  if (f.params.length === 1 && js[own.start - 1] !== '(') edits.push([own.start, own.end, '()']);
  else edits.push([own.start, f.params.length > 1 ? f.params[1].start : own.end, '']);
  // Apply, last first; overlapping edits mean a rule matched twice.
  const sorted = edits.sort((a, b) => b[0] - a[0]);
  for (let i = 1; i < sorted.length; i++) if (sorted[i][1] > sorted[i - 1][0]) problems.push(`two read-back rules overlap at ${js.slice(sorted[i][0], sorted[i][0] + 40)}`);
  let text = js.slice(node.start, node.end);
  for (const [a, b, rep] of sorted) text = text.slice(0, a - node.start) + (rep || '') + text.slice(b - node.start);
  const code = node.type === 'FunctionDeclaration' ? text : `${d.kind} ${text};`;
  // After the read-back no M and no function taking the model may remain.
  let back = null;
  try { const st = acorn.parse(code, { ecmaVersion: 'latest' }).body[0]; back = st.type === 'VariableDeclaration' ? st.declarations[0] : st; }
  catch (e) { problems.push(`the read-back does not parse: ${String(e.message)}`); }
  if (back) for (const r of idents(back)) if (isRef(r) && (r.n.name === MODEL || model(r.n.name) !== undefined)) problems.push(`${r.n.name} remains after the read-back`);
  return { code, node: back, produced, problems };
}

// A module can take declarations from more than one move (r51 added to four
// of r50's), so each export is compared with the baseline of the move that
// moved it: the latest move listing its module whose baseline still had it
// as a legacy declaration.
const bases = new Map(MOVES.map(mv => [mv.release, legacyOf(mv.baseline)]));
const listed = [...new Set(MOVES.flatMap(mv => mv.modules))];
const mods = new Map();
for (const mod of listed) {
  if (!FILES.ids.includes(mod)) { ok(false, `src/app/${mod}.ts exists`); continue; }
  mods.set(mod, moduleOf(mod));
}
// The names a module exports from its own declarations (re-exports never count).
const ownCache = new Map();
const ownExports = mod => { if (!ownCache.has(mod)) ownCache.set(mod, mods.get(mod) ? new Set(mods.get(mod).exported.keys()) : FILES.ids.includes(mod) ? new Set(moduleOf(mod).exported.keys()) : new Set()); return ownCache.get(mod); };
// The name an export moved under: a function taking the model is its r51
// name with In added (null when it is not named so).
const baseName = (mod, name) => { const m = mods.get(mod); return m && m.modelFns.has(name) ? m.modelFns.get(name) : name; };
// The adapters' module holds no moved code: its exports are held by the adapter rule below.
const adapterMod = mod => MOVES.some(mv => mv.adapters && mv.adapters.module === mod);
// A function taking the model is moved only by a move that reads the model back.
const homeOf = (mod, name) => {
  if (adapterMod(mod)) return null;
  const b = baseName(mod, name); if (b == null) return null;
  for (const mv of [...MOVES].reverse()) if (mv.modules.includes(mod) && bases.get(mv.release).decls.has(b)) return b !== name && !mv.model ? null : mv;
  return null;
};
// r51's code of a declaration with a listed prune applied (phase 3b): the
// names dropped from a destructuring, or the statement dropped, and a check
// that nothing left in the declaration reads what was dropped.
function pruned(mv, name) {
  const B = bases.get(mv.release), d = B.decls.get(name), spec = mv.prunes[name], f = d && fnOf(d.node), problems = [];
  if (!f || f.body.type !== 'BlockStatement') return { code: null, problems: [`${name} is not a function with a body in ${mv.baseline}`] };
  const top = f.body.body; let edit = null, dropped = [];
  if (spec.from) {
    const st = top.find(x => x.type === 'VariableDeclaration' && x.declarations.length === 1 && x.declarations[0].id.type === 'ObjectPattern' && x.declarations[0].init && x.declarations[0].init.type === 'Identifier' && x.declarations[0].init.name === spec.from);
    if (!st) problems.push(`${name} has no top-level destructuring of ${spec.from}`);
    else {
      const props = st.declarations[0].id.properties;
      const names = props.map(q => (q.type === 'Property' && q.shorthand && !q.computed && q.value.type === 'Identifier' ? q.value.name : null));
      if (names.includes(null)) problems.push(`${name}'s destructuring of ${spec.from} is not plain names`);
      for (const x of spec.drop) if (!names.includes(x)) problems.push(`${x} is not destructured in ${name}`);
      const keep = props.filter((q, i) => !spec.drop.includes(names[i]));
      edit = [st.declarations[0].id.start, st.declarations[0].id.end, `{${keep.map(q => B.app.slice(q.start, q.end)).join(',')}}`]; dropped = spec.drop;
    }
  } else if (spec.statement) {
    const st = top.find(x => norm(B.app.slice(x.start, x.end)) === norm(spec.statement));
    if (!st) problems.push(`${name} has no top-level statement ${spec.statement}`);
    else { edit = [st.start, st.end, '']; dropped = declNames(st); }
  }
  if (!edit) return { code: null, problems };
  const at = d.node.start; let text = B.app.slice(at, d.node.end);
  text = text.slice(0, edit[0] - at) + edit[2] + text.slice(edit[1] - at);
  const code = d.node.type === 'FunctionDeclaration' ? text : `${d.kind} ${text};`;
  const st = acorn.parse(code, { ecmaVersion: 'latest' }).body[0];
  const free = freeNames(st.type === 'VariableDeclaration' ? st.declarations[0] : st);
  for (const x of dropped) if (free.has(x)) problems.push(`${name} still reads ${x} once it is dropped`);
  return { code: norm(code), problems };
}
const declNames = st => st.type === 'FunctionDeclaration' || st.type === 'ClassDeclaration' ? [st.id.name] : st.type === 'VariableDeclaration' ? st.declarations.filter(d => d.id.type === 'Identifier').map(d => d.id.name) : [];
const counted = Object.fromEntries(MOVES.map(mv => [mv.release, 0]));
const tally = Object.fromEntries(MOVES.map(mv => [mv.release, { model: 0, unchanged: 0 }]));
for (const mv of MOVES) ok(bases.get(mv.release).decls.size > 500, `${mv.release}: the legacy declarations of ${mv.baseline} are read (${bases.get(mv.release).decls.size})`);
for (const [mod, m] of mods) {
  ok(m.odd.length === 0, `src/app/${mod}.ts holds only imports under their own names and exported declarations`, m.odd);
  const missing = [], differ = [], astray = [];
  // As this module binds a name: a function taking the model, by its r51
  // name (null when misnamed or not from a module of the move), or undefined.
  const modelOfName = mv => u => {
    const imp = m.imports.get(u);
    let b;
    if (imp) { if (!imp.fromApp || !mods.has(imp.from) || !mods.get(imp.from).modelFns.has(imp.name)) return undefined; b = mods.get(imp.from).modelFns.get(imp.name); if (b == null || homeOf(imp.from, imp.name) !== mv) return null; }
    else { if (!m.modelFns.has(u)) return undefined; b = m.modelFns.get(u); if (b == null || homeOf(mod, u) !== mv) return null; }
    return b;
  };
  for (const [name, d] of m.exported) {
    const mv = homeOf(mod, name);
    if (!mv && adapterMod(mod) && !(MOVES.find(x => x.adapters && x.adapters.module === mod).added || {})[name]) continue; // the adapter rule below
    // Code added or changed on purpose is held to the exact code its entry
    // states and to the names it states it uses (the r51 review: without
    // this, any body passed as long as the executable check did).
    const spec = mv && mv.changed[name] ? mv.changed[name] : !mv ? (MOVES.find(x => x.modules.includes(mod) && x.added && x.added[name]) || { added: {} }).added[name] : null;
    if (spec) {
      if (m.shared.has(name)) { differ.push({ name, release: 'stated', was: 'a statement of its own', now: 'declared with others in one statement' }); continue; }
      const uses = [...freeNames(d.node)].filter(u => u !== name).sort();
      if (!spec.code || norm(spec.code) !== d.code) differ.push({ name, release: 'stated', was: spec.code ? norm(spec.code) : '(no code stated)', now: d.code.slice(0, 300) });
      else if (JSON.stringify(uses) !== JSON.stringify([...(spec.uses || [])].sort()) || uses.some(u => !m.exported.has(u) && !m.imports.has(u) && !GLOBAL_OK.has(u))) astray.push(`${name} uses ${uses.join(', ') || 'nothing'}, its entry states ${(spec.uses || []).join(', ') || 'nothing'}`);
      // A declaration a move changed on purpose is compared too, with the code its entry states (r53).
      else if (mv) counted[mv.release]++;
      continue;
    }
    const base = mv && bases.get(mv.release);
    const bname = mv ? baseName(mod, name) : name;
    const was = base && base.decls.get(bname);
    if (!was || d == null) { missing.push(name); continue; }
    // A function taking the model is read back to r51's code first (phase 3b).
    const isModel = m.modelFns.has(name);
    let now = d, produced = new Set();
    if (isModel) {
      const rb = readBack(m.js, d, bname, mv.model, modelOfName(mv), u => { const w = base.decls.get(u); const f = w && fnOf(w.node); return !!f && f.params.length === 1; });
      if (rb.problems.length) { differ.push({ name, release: mv.release, was: 'the read-back', now: rb.problems.slice(0, 3) }); continue; }
      now = { code: norm(rb.code), node: rb.node }; produced = rb.produced;
    }
    let wasCode = was.code;
    if (mv.prunes && mv.prunes[bname]) { const p = pruned(mv, bname); if (p.problems.length || !p.code) { differ.push({ name, release: mv.release, was: 'the listed prune', now: p.problems }); continue; } wasCode = p.code; }
    if (wasCode !== now.code) { differ.push({ name, release: mv.release, was: wasCode.slice(0, 300), now: now.code.slice(0, 300) }); continue; }
    counted[mv.release]++;
    if (mv.model) tally[mv.release][isModel ? 'model' : 'unchanged']++;
    // Each name the declaration uses resolves as it did in that baseline. A
    // name the read-back produced resolves by the rule that produced it, so
    // the module may not also bind it.
    for (const u of freeNames(now.node)) {
      if (u === bname) continue;
      const imp = m.imports.get(u);
      const fromApp = imp && imp.fromApp;
      let good;
      if (produced.has(u)) good = !imp && !m.exported.has(u) && (u === mv.model.state ? base.outer.has(u) : u === mv.model.today ? base.outer.has(u) : base.decls.has(u));
      else if (base.decls.has(u)) good = imp ? (fromApp && mods.has(imp.from) && mods.get(imp.from).exported.has(u) && !!homeOf(imp.from, u)) : m.exported.has(u) && !!homeOf(mod, u);
      // A module's name must come from the module that declares it, under the
      // same name: a re-export elsewhere could hand over another value with
      // the same name (the r51 review: APP_NAME from types meant PREVIEW_NAME).
      else if (base.outer.has(u)) good = imp ? !!fromApp && ownExports(imp.from).has(u) : m.exported.has(u);
      else good = !imp && !m.exported.has(u);
      if (!good) astray.push(`${name} uses ${u}: ${produced.has(u) ? 'from the read-back' : base.decls.has(u) ? 'a legacy declaration' : base.outer.has(u) ? 'a module export' : 'a global'} in ${mv.baseline}, ${imp ? `imported here from ${imp.spec}` : m.exported.has(u) ? 'declared here' : 'unbound here'}`);
    }
  }
  ok(missing.length === 0, `every export of src/app/${mod}.ts was a declaration in the baseline of the move that moved it (nothing new slipped into a move)`, missing);
  ok(differ.length === 0, `every export of src/app/${mod}.ts is the same code as in that baseline, types and layout aside${MOVES.some(mv => mv.model && mv.modules.includes(mod)) ? ', once read back from the model' : ''}`, differ.slice(0, 3));
  ok(astray.length === 0, `every name the moved code in src/app/${mod}.ts uses points where it pointed in that baseline`, astray.slice(0, 5));
}
ok(editProblems.length === 0 && EDITS.every(e => mods.has(e.module)), `each edit a release lists to code moved earlier is found once in its declaration and undone before the comparison (${EDITS.length} declarations)`, editProblems);
for (const e of EDITS) {
  // What the edits bring in: the names the declaration uses now and not with its edits undone, as stated.
  const now = compiled(e.module), was = mods.get(e.module);
  const declIn = (ast, n) => ast.body.map(st => (st.type === 'ExportNamedDeclaration' ? st.declaration : st)).find(st => st && ((st.type === 'FunctionDeclaration' && st.id.name === n) || (st.type === 'VariableDeclaration' && st.declarations.some(d => d.id.name === n))));
  const a = declIn(now.ast, e.name), b = was && declIn(was.ast, e.name);
  const brought = a && b ? [...freeNames(a)].filter(u => !freeNames(b).has(u)).sort() : null;
  // Bound in the module as it is now (the TypeScript compiler drops an import its edits-undone reading no longer uses).
  const boundNow = new Set(now.ast.body.flatMap(st => st.type === 'ImportDeclaration' ? st.specifiers.map(sp => sp.local.name) : [...declared([st.type === 'ExportNamedDeclaration' && st.declaration ? st.declaration : st])]));
  ok(brought && JSON.stringify(brought) === JSON.stringify([...(e.uses || [])].sort()) && brought.every(u => GLOBAL_OK.has(u) || boundNow.has(u)), `${e.release}: ${e.module}.${e.name}, changed by its listed edits, uses as new only the names its entry states (${(e.uses || []).join(', ') || 'none'})`, brought);
  // And what they take away: a name the declaration read before and no longer reads freely, as stated. A new local
  // that takes the name of one used elsewhere in the declaration changes what that name means, and shows here (the review of r53).
  const lost = a && b ? [...freeNames(b)].filter(u => !freeNames(a).has(u)).sort() : null;
  ok(lost && JSON.stringify(lost) === JSON.stringify([...(e.drops || [])].sort()), `${e.release}: ${e.module}.${e.name}, changed by its listed edits, stops reading only the names its entry states (${(e.drops || []).join(', ') || 'none'})`, lost);
}
for (const mv of MOVES) ok(counted[mv.release] > 0, `${mv.release}: ${counted[mv.release]} moved declarations compared token for token`);
for (const mv of MOVES) if (mv.expect && 'model' in mv.expect) ok(tally[mv.release].model === mv.expect.model && tally[mv.release].unchanged === mv.expect.unchanged, `${mv.release}: ${tally[mv.release].model} functions taking the model read back and ${tally[mv.release].unchanged} moved unchanged, compared token for token (${mv.expect.model} and ${mv.expect.unchanged} expected)`);
// What makes each listed prune change nothing (phase 3b), checked on the
// baseline's code: a name dropped from a destructuring of an object of plain
// values, or of an object a function returns as a literal, has no getter to
// run; the statement dropped from suggest reads plain data and calls
// functions held here to their exact code, which change nothing.
for (const mv of MOVES) if (mv.prunes) {
  const B = bases.get(mv.release), problems = [];
  // Every identifier in the legacy script that names `name`, with the declaration it sits in.
  const refsIn = name => { const out = []; for (const st of B.body) for (const r of idents(st)) if (r.n.name === name && isRef(r)) out.push({ ...r, st }); return out; };
  const plainObj = o => o && o.type === 'ObjectExpression' && o.properties.every(q => q.type === 'Property' && q.kind === 'init' && !q.method && !q.computed);
  for (const [name, spec] of Object.entries(mv.prunes)) {
    const d = B.decls.get(name), f = d && fnOf(d.node);
    if (!f) { problems.push(`${name}: not a function in ${mv.baseline}`); continue; }
    if (spec.from === 'C') {
      // C is suggestCore's object of shorthand names, and suggestCore is the only caller of each case, passing C alone.
      const sc = B.decls.get('suggestCore'), scf = sc && fnOf(sc.node);
      const decl = scf && scf.body.body.find(x => x.type === 'VariableDeclaration' && x.declarations.length === 1 && x.declarations[0].id.type === 'Identifier' && x.declarations[0].id.name === 'C');
      const init = decl && decl.declarations[0].init;
      if (!(decl && decl.kind === 'const' && plainObj(init) && init.properties.every(q => q.shorthand))) problems.push(`${name}: C is not a constant object of shorthand names in suggestCore`);
      for (const r of refsIn(name)) {
        const p = r.up[r.up.length - 1];
        if (r.n === d.node.id) continue;
        if (!(r.st === sc.node && p.type === 'CallExpression' && p.callee === r.n && p.arguments.length === 1 && p.arguments[0].type === 'Identifier' && p.arguments[0].name === 'C')) problems.push(`${name}: referred to other than as suggestCore's call with C`);
      }
      // In the modules, the case is called only from suggestCore's moved form.
      // (Import and export lists name it without using it.)
      for (const [mod, m] of mods) for (const st of m.ast.body) {
        const s2 = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
        if (!s2 || !/^(FunctionDeclaration|VariableDeclaration)$/.test(s2.type)) continue;
        for (const r of idents(s2)) {
          if (!isRef(r) || baseName(mod, r.n.name) !== name || (m.imports.has(r.n.name) ? false : !m.exported.has(r.n.name))) continue;
          const own = s2 && (s2.id === r.n || (s2.declarations || []).some(x => x.id === r.n));
          const host = s2 && s2.type === 'FunctionDeclaration' ? s2.id.name : s2 && s2.declarations ? s2.declarations[0].id.name : null;
          if (!own && baseName(mod, host || '') !== 'suggestCore') problems.push(`${name}: referred to in src/app/${mod}.ts outside suggestCore`);
        }
      }
    } else if (spec.from === 'sc') {
      // sc is trendScope's result, and trendScope returns an object literal of plain values.
      const st = f.body.body.find(x => x.type === 'VariableDeclaration' && x.declarations.length === 1 && x.declarations[0].id.type === 'Identifier' && x.declarations[0].id.name === 'sc');
      const call = st && st.declarations[0].init;
      const ts = B.outerDecls.get('trendScope'), tf = ts && fnOf(ts.node);
      const rets = []; if (tf) (function walk(n, top) { if (!n || typeof n.type !== 'string') return; if (!top && /Function/.test(n.type)) return; if (n.type === 'ReturnStatement') rets.push(n); for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, false)); else if (v && typeof v.type === 'string') walk(v, false); } })(tf, true);
      if (!(st && st.kind === 'const' && call.type === 'CallExpression' && call.callee.type === 'Identifier' && call.callee.name === 'trendScope' && !B.decls.has('trendScope') && rets.length && rets.every(r => plainObj(r.argument)))) problems.push(`${name}: sc is not trendScope's object literal`);
    } else if (spec.statement) {
      // The statement reads suggest's options and calls functions held to their exact code here.
      const st = f.body.body.find(x => norm(B.app.slice(x.start, x.end)) === norm(spec.statement));
      const params = f.params.map(p => p.type === 'Identifier' ? p.name : null);
      const reads = st ? [...freeNames(st)].filter(u => !declNames(st).includes(u)) : [];
      const allowed = new Set([...Object.keys(spec.reads), ...params]);
      if (!st || reads.some(u => !allowed.has(u))) problems.push(`${name}: the dropped statement reads ${reads.join(', ')}`);
      for (const [fn, code] of Object.entries(spec.reads)) {
        // The bundle writes a module's const as var, so the keyword is the bundler's (decls, above).
        const o = B.outerDecls.get(fn);
        if (!o || o.code !== norm(code.replace(/^(const|let) /, 'var '))) problems.push(`${name}: ${fn} is not ${code}`);
        // Each calls only the others listed, and the two JavaScript globals that read nothing of the page.
        else for (const u of freeNames(o.node)) if (u !== fn && !spec.reads[u] && !['Date', 'String'].includes(u)) problems.push(`${name}: ${fn} uses ${u}`);
      }
      // Every caller passes plain data, or newBlock's own options, which its callers pass as plain data.
      for (const [callee, at] of Object.entries(spec.passes)) for (const r of refsIn(callee)) {
        const p = r.up[r.up.length - 1];
        if (r.n === (B.decls.get(callee) || { node: {} }).node.id) continue;
        const hook = r.st.type === 'ExpressionStatement' && r.st.expression.type === 'AssignmentExpression' && B.app.slice(r.st.expression.left.start, r.st.expression.left.end) === 'window.__ironlog';
        if (hook && p.type === 'Property' && p.shorthand) continue; // the test hook hands it to the suites
        if (!(p.type === 'CallExpression' && p.callee === r.n)) { problems.push(`${callee}: referred to other than called`); continue; }
        const a = p.arguments[at];
        if (!a || plainObj(a)) continue;
        const host = r.st.type === 'FunctionDeclaration' ? r.st : null;
        const viaParam = a.type === 'Identifier' && host && spec.passes[host.id.name] === at && host.params[at] && host.params[at].type === 'Identifier' && host.params[at].name === a.name && !scanWrites(host).has(a.name);
        if (!viaParam) problems.push(`${callee}: a call passes ${B.app.slice(a.start, Math.min(a.end, a.start + 60))}`);
      }
    }
  }
  ok(problems.length === 0, `${mv.release}: each of the ${Object.keys(mv.prunes).length} listed prunes drops only what nothing reads and nothing runs for`, problems.slice(0, 5));
}

// The adapters (phase 3b): every export of the adapters' module other than
// what the move added is `const X = live(XIn);`, XIn a function taking the
// model, moved by this move and imported under its own name, and X its r51
// name; and they are exactly the names the legacy script imports from it.
// Since r53 more than one move adds adapters to the module (each its own
// moved functions); they are checked together, each adapter's function
// moved by one of them, and each move's count held to its own number.
for (const mod of [...new Set(MOVES.filter(x => x.adapters).map(x => x.adapters.module))]) {
  const movesHere = MOVES.filter(x => x.adapters && x.adapters.module === mod), mv = movesHere[movesHere.length - 1];
  const addedHere = Object.assign({}, ...movesHere.map(x => x.added || {}));
  const byMove = Object.fromEntries(movesHere.map(x => [x.release, 0]));
  const m = mods.get(mod), problems = [], names = [];
  for (const [name, d] of m ? m.exported : []) {
    if (addedHere[name]) continue;
    const imp = m.imports.get(name + 'In');
    const src = imp && imp.fromApp && mods.get(imp.from);
    if (!d || d.code !== norm(`const ${name} = ${mv.adapters.fn}(${name}In);`)) { problems.push(`${name} is not ${mv.adapters.fn}(${name}In)`); continue; }
    if (!src || !src.modelFns.has(name + 'In') || src.modelFns.get(name + 'In') !== name || !movesHere.includes(homeOf(imp.from, name + 'In'))) { problems.push(`${name}In is not a function taking the model that this move moved`); continue; }
    names.push(name); byMove[homeOf(imp.from, name + 'In').release]++;
  }
  // The same in the TypeScript as written, statement for statement, since
  // the compiled code shows no type: a cast in an adapter (`live(EXIn as
  // ...)`) would otherwise pass here and be counted as moved code's mark by
  // tests/hygiene.js (the r52 review).
  {
    const ts = require('typescript'), file = path.join(APP, mod + '.ts');
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const st of sf.statements) {
      if (!ts.isVariableStatement(st)) continue;
      const names = st.declarationList.declarations.map(d => d.name.getText(sf));
      if (names.length === 1 && addedHere[names[0]]) continue;
      const want = names.length === 1 ? `export const ${names[0]} = ${mv.adapters.fn}(${names[0]}In);` : null;
      if (st.getText(sf) !== want) problems.push(`src/app/${mod}.ts as written: ${st.getText(sf).slice(0, 80)}`);
    }
  }
  const imp = acorn.parse(fs.readFileSync(path.join(ROOT, mv.adapters.imports), 'utf8'), { ecmaVersion: 'latest', sourceType: 'module' }).body.filter(st => st.type === 'ImportDeclaration' && st.source.value === `./app/${mod}`).flatMap(st => st.specifiers.map(sp => sp.imported.name));
  const a = [...names].sort(), b = [...imp].sort();
  const want = movesHere.map(x => `${x.release} ${x.expect.adapters}`).join(', '), got = movesHere.map(x => `${x.release} ${byMove[x.release]}`).join(', ');
  ok(problems.length === 0 && JSON.stringify(a) === JSON.stringify(b) && got === want && movesHere.every(x => x.adapters.fn === mv.adapters.fn && x.adapters.imports === mv.adapters.imports), `${a.length} adapters in src/app/${mod}.ts, each ${mv.adapters.fn}(XIn) under the legacy name, exactly the names the legacy script imports from it, by move ${got} (${want} expected)`, problems.length ? problems.slice(0, 5) : { only_here: a.filter(x => !b.includes(x)), only_imported: b.filter(x => !a.includes(x)) });
}

// M is the model's name (phase 3b): in every module it appears only inside a
// top-level function whose first parameter it is, so it can never name
// anything else (the read-back refuses any other use inside those).
{
  const bad = [];
  for (const id of FILES.ids) {
    const m = mods.get(id) || moduleOf(id);
    const hosts = m.ast.body.map(st => (st.type === 'ExportNamedDeclaration' ? st.declaration : st)).filter(Boolean).flatMap(s2 => s2.type === 'FunctionDeclaration' ? [s2] : s2.type === 'VariableDeclaration' ? s2.declarations.map(x => fnOf(x)).filter(Boolean) : []).filter(f => f.params.length && f.params[0].type === 'Identifier' && f.params[0].name === MODEL);
    for (const r of idents(m.ast)) if (r.n.name === MODEL && isRef(r) && !hosts.some(f => r.n.start >= f.start && r.n.end <= f.end)) bad.push(`src/app/${id}.ts: ${m.js.slice(Math.max(0, r.n.start - 30), r.n.end + 30)}`);
  }
  ok(bad.length === 0, 'the name M appears only inside a function taking the model as its first parameter', bad.slice(0, 5));
}

// Code a move adds or changes on purpose has no baseline to be compared
// with, so each entry carries a check that runs against the module itself,
// bundled on its own and loaded fresh: a declaration with no check fails. An
// entry whose check needs other modules (r52: LIVE reads the store's log and
// util's today) names them in `with`, and they are bundled with it, so the
// check sees the same instances the module does.
{
  const os = require('os');
  const load = (mod, withMods) => {
    const all = [mod, ...(withMods || [])];
    const entry = all.map((x, i) => `export * as m${i} from './${x}';`).join('\n');
    const out = esbuild.buildSync({ stdin: { contents: entry, resolveDir: APP, loader: 'ts' }, bundle: true, format: 'cjs', platform: 'neutral', write: false, logLevel: 'silent' }).outputFiles[0].text;
    const file = path.join(os.tmpdir(), `ironlog-moved-${mod}-${process.pid}.js`); fs.writeFileSync(file, out);
    let ns; try { delete require.cache[file]; ns = require(file); } finally { fs.unlinkSync(file); }
    return { main: ns.m0, with: Object.fromEntries((withMods || []).map((x, i) => [x, ns[`m${i + 1}`]])) };
  };
  for (const mv of MOVES) for (const kind of ['changed', 'added', 'edits']) for (const [name, spec] of Object.entries(mv[kind] || {})) {
    const mod = kind === 'edits' ? (mods.has(spec.module) && mods.get(spec.module).exported.has(name) ? spec.module : null) : mv.modules.find(x => mods.has(x) && mods.get(x).exported.has(name));
    let good = false, why = 'no check';
    if (mod && spec && typeof spec.check === 'function') { try { const L = load(mod, spec.with); good = spec.check(L.main, L.with) === true; why = good ? '' : 'the check failed'; } catch (e) { why = String(e); } }
    else if (!mod) why = 'not exported by a module of the move';
    ok(good, `${mv.release}: ${name}, ${kind} on purpose, does what its entry says (${spec && spec.why ? spec.why.split(':')[0] : '?'})`, why || undefined);
  }
}

// The legacy script a move leaves behind is the baseline's, statement for
// statement and in order, less the declarations the move took out, once the
// rewrites the move lists are read back (r51: setState(x) for state = x). So
// nothing but the move and its listed rewrites can change in the legacy
// script, which the comparison of moved code alone does not show.
const legacyStatements = file => legacyIn(file);
{
  const mv = MOVES[MOVES.length - 1];
  const rw = mv.legacy || { calls: {}, statements: {} };
  const movedNames = new Set();
  // By the name each had in the baseline (a function taking the model less its In), with the caches the move retired.
  for (const [mod, m] of mods) for (const name of m.exported.keys()) { const h = homeOf(mod, name); if (h === mv && (!mv.changed[name] || mv.changed[name].moved)) movedNames.add(baseName(mod, name)); }
  for (const x of (mv.model && mv.model.retired) || []) movedNames.add(x);
  if (mv.expect && 'retired' in mv.expect) ok((mv.model.retired || []).length === mv.expect.retired && mv.model.retired.every(x => bases.get(mv.release).decls.has(x)), `${mv.release}: the ${mv.expect.retired} caches retired were legacy declarations in ${mv.baseline}`);
  const was = legacyStatements(mv.baseline);
  const before = was.body.filter(st => { const n = declNames(st); return !(n.length && n.every(x => movedNames.has(x))); }).map(st => norm(was.app.slice(st.start, st.end)));
  const now = legacyStatements('index.html');
  // Read each listed call back as the assignment it replaced, then the
  // statement as the one it replaced. Names the test hook gained (r52) are
  // read back by taking them off its end, where they must stand in order as
  // plain names; a hook that did not gain them, or gained them elsewhere,
  // stays as it is and differs.
  let hookRead = 0;
  const legacyBack = (code, st) => {
    let text = code.slice(st.start, st.end); const edits = [];
    const add = rw.hook || [];
    const e = st.type === 'ExpressionStatement' && st.expression.type === 'AssignmentExpression' ? st.expression : null;
    if (add.length && e && e.left.type === 'MemberExpression' && !e.left.computed && e.left.object.type === 'Identifier' && e.left.object.name === 'window' && e.left.property.name === '__ironlog' && e.right.type === 'ObjectExpression') {
      const ps = e.right.properties, tail = ps.slice(-add.length);
      if (ps.length > add.length && tail.every((q, i) => q.type === 'Property' && q.shorthand && q.key.name === add[i])) { edits.push([ps[ps.length - add.length - 1].end - st.start, ps[ps.length - 1].end - st.start, '']); hookRead++; }
    }
    (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && rw.calls[n.callee.name] && n.arguments.length === 1) edits.push([n.start - st.start, n.end - st.start, `(${rw.calls[n.callee.name]} = (${code.slice(n.arguments[0].start, n.arguments[0].end)}))`]);
      for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
    })(st);
    for (const [a, b, r] of edits.sort((x, y) => y[0] - x[0])) text = text.slice(0, a) + r + text.slice(b);
    const t = norm(text); const alias = Object.entries(rw.statements).find(([k]) => norm(k) === t); return alias ? norm(alias[1]) : t;
  };
  const after = now.body.map(st => legacyBack(now.app, st));
  if (rw.hook) ok(hookRead === 1, `${mv.release}: the test hook gained the ${rw.hook.length} listed names, at its end and in order`);
  let i = 0; while (i < before.length && i < after.length && before[i] === after[i]) i++;
  ok(before.length === after.length && i === before.length, `${mv.release}: every statement left in the legacy script is ${mv.baseline}'s, in order, once the listed rewrites are read back (${after.length} statements)`, i < Math.max(before.length, after.length) ? { at: i, was: (before[i] || '').slice(0, 200), now: (after[i] || '').slice(0, 200) } : { counts: [before.length, after.length] });
}

// The page is what src/ builds, and the module code on it is the modules'
// code (the r51 mutation test: a build script that injected a file, a
// package.json field that swapped a module in, a replace on the bundle's
// text, a module in a subfolder under a known name, and an index.html edited
// by hand each passed every check, since nothing compared the bundled module
// code with src/app/). So: scripts/join.js builds index.html exactly; the
// script starts strict; outside the legacy script the page holds only
// declarations, each one module's by name and code (types and layout set
// aside, and every variable printed as `var`, which the bundler writes for a
// module's `const` and `let`), every module
// declaration is on the page once, and the page's other inline scripts are
// the baseline's.
{
  let built = null, why = '';
  try { built = require('../scripts/join').build().html; } catch (e) { why = String(e.message).split('\n')[0]; }
  ok(built !== null && built === fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), 'index.html is what scripts/join.js builds from src/', why || undefined);
  const page = legacyIn('index.html');
  ok(page.strict, 'the page\'s script starts with "use strict", so the modules run strict as modules do');
  const stmts = page.outer.filter(s => !(s.type === 'ExpressionStatement' && s.directive));
  const odd = stmts.filter(s => s.type !== 'VariableDeclaration' && s.type !== 'FunctionDeclaration').map(s => page.app.slice(s.start, Math.min(s.end, s.start + 80)));
  ok(odd.length === 0, 'outside the legacy script the page holds declarations only', odd);
  const onPage = decls(page.app, stmts.filter(s => s.type === 'VariableDeclaration' || s.type === 'FunctionDeclaration'), 'var');
  const inMods = new Map(), twice = [];
  for (const id of FILES.ids) { const c = compiled(id); for (const [n, d] of decls(c.js, c.ast.body, 'var')) { if (inMods.has(n)) twice.push(`${n} (${inMods.get(n).id}, ${id})`); inMods.set(n, { id, code: d.code }); } }
  ok(twice.length === 0, 'no two modules declare the same top-level name, so the bundler renames nothing', twice);
  const notOnPage = [...inMods.keys()].filter(n => !onPage.has(n)), notInMods = [...onPage.keys()].filter(n => !inMods.has(n));
  ok(notOnPage.length === 0 && notInMods.length === 0, `the declarations on the page outside the legacy script are the modules' (${onPage.size})`, { notOnPage, notInMods });
  const differ = [...onPage].filter(([n, d]) => inMods.has(n) && d.code !== inMods.get(n).code).map(([n, d]) => ({ name: n, page: d.code.slice(0, 200), module: inMods.get(n).code.slice(0, 200) }));
  ok(differ.length === 0, 'every declaration on the page outside the legacy script is its module\'s code', differ.slice(0, 3));
  // A move changes nothing a lifter sees, so the page around the app script
  // (markup, styles, the loader, and with them any handler attribute, which
  // is a script the check above does not see) is the baseline's once the
  // build id is set aside. A release that changes the page says so in its
  // move entry (`page: { why, adds: [{ after, text }] }`): the page must then
  // be the baseline's with each text inserted directly after its anchor, a
  // run of the baseline's own text found there exactly once, and nothing
  // else (the second r51 review moved an addition into a comment, where it
  // dropped a rule, and the text alone still matched).
  const mvLast = MOVES[MOVES.length - 1];
  const around = (f, id) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(legacyIn(f).app, '{{APP}}').split(id).join('{{APP_VERSION}}');
  const idOf = f => (fs.readFileSync(path.join(ROOT, f), 'utf8').match(/<meta name="app-build" content="([^"]+)"/) || [])[1];
  const adds = mvLast.page ? mvLast.page.adds : [];
  const base = around(mvLast.baseline, idOf(mvLast.baseline));
  let want = base; const bad = [];
  for (const a of Array.isArray(adds) ? adds : []) {
    if (!a || typeof a.after !== 'string' || !a.after || typeof a.text !== 'string' || !a.text || base.split(a.after).length !== 2) { bad.push(a && a.after ? a.after.slice(0, 60) : a); continue; }
    want = want.replace(a.after, () => a.after + a.text);
  }
  if (mvLast.page) console.log(`note ${mvLast.release} adds to the page outside the app script: ${mvLast.page.why}`);
  ok(!mvLast.page || (typeof mvLast.page.why === 'string' && Array.isArray(adds) && adds.length > 0 && bad.length === 0), 'a move entry that changes the page says why and gives each addition an anchor found once in the baseline', bad.length ? { bad } : undefined);
  ok(around('index.html', idOf('index.html')) === want, `the page outside the app script is ${mvLast.baseline}'s, the build id set aside${adds.length ? `, with exactly the ${adds.length} listed addition${adds.length > 1 ? 's' : ''}, each at its anchor` : ''}`);
}

// Every module is either in a move, so this suite compares it, or written new
// on purpose and held by tests of its own (the r51 review: a module in
// neither list was compared by nothing). A module written new is also held to
// what it may contain, since nothing compares it with a baseline (the second
// r51 review put `Math.round = x => Math.floor(x)` in types.ts and in
// config.ts, and a copy of the legacy body in config.ts, and each passed).
// Each value config defines is a constant made from literals and config's own
// constants: no import, no function, no assignment, nothing that runs, except
// the string methods FILE_PREFIX is made with and, in THREE_URLS alone, the
// page flag the build sets on window (IRONLOG_APP picks the installed app's
// own three.js). Nothing else may differ between the page and Node (a
// STORAGE_ID that read the flag passed, the r51 mutation test: the installed
// app would have lost its log while every check saw the other branch).
function configRules() {
  const { ast } = compiled('config'), bad = [], own = new Set();
  const CALLS = new Set(['toLowerCase', 'replace']), FLAGS = new Set(['IRONLOG_APP']), FLAGGED = new Set(['THREE_URLS']);
  let current = null;
  const NODES = new Set(['Literal', 'TemplateLiteral', 'TemplateElement', 'ArrayExpression', 'ObjectExpression', 'Property', 'SpreadElement', 'Identifier', 'MemberExpression', 'ConditionalExpression', 'LogicalExpression', 'BinaryExpression', 'UnaryExpression', 'CallExpression']);
  const okCall = n => n.callee.type === 'MemberExpression' && !n.callee.computed && CALLS.has(n.callee.property.name) && ((n.callee.object.type === 'Identifier' && own.has(n.callee.object.name)) || (n.callee.object.type === 'CallExpression' && okCall(n.callee.object)));
  const walk = (n, up) => {
    if (!n || typeof n.type !== 'string') return;
    if (!NODES.has(n.type)) { bad.push(n.type); return; }
    if (n.type === 'CallExpression' && !okCall(n)) bad.push('a call other than toLowerCase or replace on a config value');
    if (n.type === 'UnaryExpression' && n.operator === 'delete') bad.push('delete');
    if (n.type === 'Identifier' && !(up && ((up.type === 'MemberExpression' && up.property === n && !up.computed) || (up.type === 'Property' && up.key === n && !up.computed)))) {
      const flag = FLAGGED.has(current) && up && up.type === 'MemberExpression' && up.object === n && !up.computed && FLAGS.has(up.property.name);
      const tof = FLAGGED.has(current) && up && up.type === 'UnaryExpression' && up.operator === 'typeof';
      if (n.name === 'window' ? !(flag || tof) : !own.has(n.name)) bad.push(`the name ${n.name}`);
    }
    if (n.type === 'MemberExpression' && n.computed) bad.push('a computed property');
    for (const k in n) { if (k === 'type') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, n)); else if (v && typeof v.type === 'string') walk(v, n); }
  };
  // esbuild writes the exports as one `export { a, b }` at the end.
  const tail = ast.body.filter(st => st.type === 'ExportNamedDeclaration' && !st.source && !st.declaration);
  for (const st of ast.body) {
    if (tail.includes(st)) continue;
    const d = st.type === 'ExportNamedDeclaration' && !st.source && !st.specifiers.length ? st.declaration : st;
    if (!d || d.type !== 'VariableDeclaration' || d.kind !== 'const') { bad.push(`a top-level ${st.type}${st.source ? ' from ' + st.source.value : ''}`); continue; }
    for (const x of d.declarations) { if (x.id.type !== 'Identifier' || !x.init) { bad.push('a const with no name or value'); continue; } current = x.id.name; walk(x.init, null); own.add(x.id.name); }
  }
  for (const st of tail) for (const sp of st.specifiers) if (sp.local.name !== sp.exported.name || !own.has(sp.local.name)) bad.push(`export ${sp.local.name} as ${sp.exported.name}`);
  return bad;
}
const NEW_MODULES = {
  config: { why: 'r49: the app\'s name, version, address and storage id, written new; held by tests/hygiene.js and tests/r49.js', rules: configRules },
  types: { why: 'types only: nothing of it exists at run time', rules: () => { const { js } = compiled('types'); return js.trim() === '' || js.trim() === 'export {};' ? [] : [js.trim().slice(0, 200)]; } },
};
{
  const loose = FILES.ids.filter(m => !listed.includes(m) && !NEW_MODULES[m]);
  ok(loose.length === 0, 'every module in src/app/ is in a move or listed as written new, with the tests that hold it', loose);
  for (const [mod, spec] of Object.entries(NEW_MODULES)) { let bad; try { bad = spec.rules(); } catch (e) { bad = [String(e)]; } ok(bad.length === 0, `src/app/${mod}.ts holds only what a module written new may (${spec.why.split(':')[0]})`, bad); }
}
// Moved code lives only in the modules a move lists, where it is compared.
{
  const legacyNames = new Set(MOVES.flatMap(mv => [...legacyOf(mv.baseline).decls.keys()]));
  const stray = [];
  for (const mod of FILES.ids) {
    if (listed.includes(mod)) continue;
    for (const name of moduleOf(mod).exported.keys()) if (legacyNames.has(name)) stray.push(`src/app/${mod}.ts: ${name}`);
  }
  ok(stray.length === 0, 'no module outside a move exports a name that was a legacy declaration in a move\'s baseline', stray);
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
