// The engine runs alone (phase 3b, r52; ARCHITECTURE.md). The modules of
// the engine and the analytics, bundled for Node with no page, are given the
// wide histories of tests/r52.js as the page normalized them (normalize()
// stays in the legacy script until phase 4), deep-frozen, with the page's
// language and time zone. Each of the names live.ts gives the legacy
// script (r52's 74, routineUpdates since r53, and since r54 plannedSets,
// stallWeeks, stallWords, atRangeTop, avgFirstWeek, lastLighterWeek, muscleStatus,
// weeksAvg, defBand, appBand, fitFloors, refit, avgWait, sessionWords, prFrame
// and heavierLoad, since r55 oddLoad, and since r55.1 lightZero, read from live.ts) is called with the page's own arguments
// on a fresh model and must give the page's answer, then again on a second
// fresh model; so is each of PLAIN, the engine's functions the legacy script
// calls directly that take no model (since r53 avgWeeksTxt, whose lines no
// adapter reaches, and since r54 the routine helpers and musTrend). The bundle runs
// strict, so a write to the frozen log, a frozen argument or one of the
// modules' tables (all frozen too) throws and shows as a different answer;
// and on every tenth history the second model reads the log through a proxy
// that records any attempt to change it, so an attempt whose error the code
// catches is seen as well. The functions only the engine calls (sgEasyIn, idxLiftIn and the
// like) are reached through these, and how much of each module runs is
// measured with V8's own coverage and Node's source maps: the lines run in
// each module are a ratchet in ARCHITECTURE.md that may only rise.
// One time zone on every machine, for the page and for Node (the browser
// inherits it), so the same histories run the same lines everywhere and the
// ratchet below reads the same on GitHub as here.
if (process.argv[2] !== '--child') process.env.TZ = 'UTC';
const fs = require('fs'); const path = require('path'); const os = require('os');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'); const APP = path.join(ROOT, 'src', 'app');
const MODULES = ['model', 'units', 'routines', 'gym', 'format', 'loads', 'analytics', 'time', 'weeks', 'coach', 'engine', 'plans'];
// The histories of tests/r52.js, all of them, in batches of 100 (each batch's calls are about 100 MB as text).
const K = +process.env.ENGINE_N || 1000, BATCH = 100;
// The engine's functions that take no model and that the digest calls (tests/wide.js), run in Node beside the adapters,
// and since r54 the routine helpers the legacy script reads from routines.ts (EXTRA below calls them): when Finish's
// offer and a lift's own plan moved to plans.ts (r54) the lines that ran went with them, and these keep routines.ts's share;
// and musTrend, a muscle's strength trend in words, which Stats and the muscles sheet call and no adapter reaches (r54);
// and r55's routine helpers: what a session records of its routine (pwOf), a first-run choice replacing the starter
// (dropStarter), a day given an exercise (trainOn) and the item a lift's plan comes from (planItemOf).
const PLAIN = ['avgWeeksTxt', 'dayLabel', 'daySets', 'ssLetters', 'routineSig', 'tplCountLine', 'musTrend', 'pwOf', 'dropStarter', 'trainOn', 'planItemOf', 'platesPerSide', 'planSetsOf', 'withPlanSets'];
// Every adapter live.ts gives the legacy script, read from live.ts itself, so a new one cannot go uncalled.
const ADAPTERS = [...fs.readFileSync(path.join(APP, 'live.ts'), 'utf8').matchAll(/^export const (\w+) = live\(\w+In\);$/gm)].map(m => m[1]);
// The adapters added since r53, and the plain functions above the digest does not call: tests/wide.js is shared with
// the comparisons pinned to r52 and r53 (tests/r52.js, tests/r53w.js), so their calls are made here, after it, with these arguments.
const EXTRA = {
  // Each routine's day labels (a cycle's Day N, a weekly one's weekday), planned sets a day, superset letters and signature, and the templates' line.
  dayLabel: (s) => s.routines.flatMap(r => [[r, 0], [r, 3], [{ ...r, schedule: 'weekly' }, 2]]), daySets: (s) => s.routines.flatMap(r => r.days.map(d => [d])),
  ssLetters: (s) => s.routines.flatMap(r => r.days.map(d => [d.items])), routineSig: (s) => s.routines.map(r => [r]), tplCountLine: () => [[]],
  // r55: each routine's sessions a week by id (and an id no routine has), the routines less the first one's signature as a
  // starter, each day given an exercise, and where each tagged lift's plan comes from, with and without a day to look at first.
  pwOf: (s) => [[s.routines, s.activeRoutineId], [s.routines, 'none'], [[], '']],
  dropStarter: (s) => [[s.routines, s.sessions, s.routines.slice(0, 1).map(r => window.__ironlog.routineSig(r))], [s.routines, [], []]],
  trainOn: (s) => s.routines.flatMap(r => r.days.map(d => [d])),
  // r58 (339 h): the sets a routine plans for a lift, a day first, in the routine in use and one that is gone; and Finish's
  // exercises given them on a day of the routine, and not in Freestyle, with no day, or on an edit.
  planSetsOf: (s, ids) => ids.slice(0, 4).flatMap(id => [[s.routines, s.activeRoutineId, null, id], [s.routines, s.activeRoutineId, ((s.routines.find(r => r.id === s.activeRoutineId) || { days: [] }).days[1] || {}).id || null, id], [s.routines, 'none', null, id]]),
  withPlanSets: (s, ids) => { const day = ((s.routines.find(r => r.id === s.activeRoutineId) || { days: [] }).days[0] || {}).id || null; const ex = () => ids.slice(0, 4).map(id => ({ exId: id })); return [[ex(), { routineId: s.activeRoutineId, dayId: day }, s.routines], [ex(), { routineId: s.activeRoutineId, dayId: day, free: true }, s.routines], [ex(), { routineId: s.activeRoutineId, dayId: null }, s.routines], [ex(), { routineId: s.activeRoutineId, dayId: day, editingId: 'e1' }, s.routines]]; },
  planItemOf: (s, ids) => s.routines.slice(0, 2).flatMap(r => ids.slice(0, 6).flatMap(id => [[r, id], [r, id, r.days.length > 1 ? r.days[1].id : null]])),
  // A lift's all-time bests, now and as of the log's middle session (a past workout's), and where the weeks are counted from.
  allTimeBests: (s, ids) => ids.flatMap(id => [[id], [id, s.sessions.length ? s.sessions[Math.floor(s.sessions.length / 2)].date : '']]),
  logBack: () => [[]], logStart: () => [[]],
  // The plates one side takes (r56.1, PENDING 333): a load typed as shown in lb on kg plates (110.2 lb, 15 kg a side within
  // its tolerance, and strictly), lb plates, the bar alone, and less than the smallest plate.
  platesPerSide: () => [[[25, 20, 15, 10, 5, 2.5, 1.25], 14.993, 0.0113], [[25, 20, 15, 10, 5, 2.5, 1.25], 14.993, 1e-6], [[45, 35, 25, 10, 5, 2.5], 92.5, 0.025], [[45, 35, 25, 10, 5, 2.5], 0, 1e-6], [[25, 20, 15, 10, 5, 2.5, 1.25], 1.2, 1e-6]],
  plannedSets: (s) => s.routines.map(r => [r]), stallWeeks: (s, ids) => ids.map(id => [id]), stallWords: (s, ids) => ids.map(id => [id]), atRangeTop: (s, ids) => ids.map(id => [id]), avgFirstWeek: () => [[]], lastLighterWeek: () => [[]],
  // A week's sets so far and a plain average; the weekly averages, which carry the muscles on plan, reach it through the coach and regionBalance.
  muscleStatus: () => [[{ chest: 5, quads: 22, biceps: 0, serratus: 3 }], [{ chest: 5, quads: 22, biceps: 0 }, true], [null]],
  // The log's last three weeks trained, as the radar's fallback reads them (Monday-start weeks, as util's weekStart).
  weeksAvg: (s) => { const ws = d => { const t = new Date(d + 'T12:00:00Z'); return new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); }; const all = [...new Set(s.sessions.map(x => ws(x.date)))].sort(); return [[all.slice(-3)], [[]]]; },
  // The app's own targets (src/app/profile.ts since r54): with the log's own profile and floors, a focus, and floors given.
  // Whether a muscle has a weekly target (r58, 339 e): one by default, one the app does not give one, and one tracked only.
  hasTarget: () => [['chest'], ['traps'], ['serratus'], ['neck'], ['forearms']],
  defBand: () => [['chest'], ['serratus'], ['quads', { focus: ['quads'] }], ['biceps', { focus: ['quads'] }]],
  appBand: () => [['chest'], ['serratus'], ['quads', { focus: ['quads'] }], ['chest', null, { chest: 5 }], ['chest', null, null]],
  fitFloors: (s) => s.routines.flatMap(r => [[r], [r, { chest: 3, quads: 4 }], [r, null, 1.75]]),
  refit: () => [[]],
  avgWait: () => [[]],
  // History's words for each lift of a session (r54): the log's newest sessions, and none.
  sessionWords: (s) => [[s.sessions.slice(-6).map(x => x.id)], [[]]],
  // Each tagged lift a step up from loads on and off its rack, to a little above and well above (moved from the legacy script in r54).
  // A set being logged, as its PRs judge it (r54): each lift's newest set, the same weight typed in the other unit on its usual step, a blank load, and no date.
  prFrame: (s, ids) => ids.flatMap(id => { const ss = s.sessions.filter(x => x.ex.some(b => b.exId === id)); const last = ss[ss.length - 1]; if (!last) return [[id, { w: 20, r: 8 }, '']]; const set = last.ex.find(b => b.exId === id).sets[0], w = +set.w || 0; const other = Math.abs(w / 0.05 - Math.round(w / 0.05)) < 1e-6 ? Math.round(w / 0.45359237 / 5) * 5 * 0.45359237 : Math.round(w / 2.5) * 2.5; return [[id, set, last.date], [id, { ...set, w: other }, last.date], [id, { ...set, w: other, r: (+set.r || 0) + 1 }, last.date], [id, { w: '', r: 5 }, last.date], [id, set, '']]; }),
  heavierLoad: (s, ids) => ids.map(id => s.exercises.find(e => e.id === id)).filter(Boolean).flatMap(e => [[e, null, 20, 21], [e, null, 20, 40], [e, null, 5.443, 9], [e, { inc: 2.5 }, 50, 60]]),
  // A set about to be logged, its load far off or not (r55): 300 after two 50s, 30 after 300, a first set at ten times the lift's best,
  // one at its best, a blank load, no load, a row under a ticked set with its load grey, and a warm-up; on every lift, with the log's newest date.
  oddLoad: (s, ids) => ids.flatMap(id => { const d = s.sessions.length ? s.sessions[s.sessions.length - 1].date : ''; const S = (w, r, done, o) => ({ w, r, done, warm: false, drop: false, ...(o || {}) }); const b = sets => ({ exId: id, sw: 40, sets }); return [[b([S(50, 6, true), S(50, 6, true), S(300, 1, false)]), 2, d], [b([S(300, 5, true), S(30, 5, false)]), 1, d], [b([S(1000, 5, false)]), 0, d], [b([S(60, 8, false)]), 0, d], [b([S(null, null, false)]), 0, d], [b([S(0, 10, false)]), 0, d], [b([S(50, 8, true), S(null, null, false)]), 1, d], [b([S(40, 5, false, { warm: true })]), 0, d]]; }),
  // A set ticked with 0 reps (r55.1, V): at a light load after working sets, at the working load, under the suggested load with
  // nothing done yet, at a load with no working load known, on a warm-up, and a set that is no 0; on every lift, with the log's newest date.
  lightZero: (s, ids) => ids.flatMap(id => { const d = s.sessions.length ? s.sessions[s.sessions.length - 1].date : ''; const S = (w, r, done, o) => ({ w, r, done, warm: false, drop: false, ...(o || {}) }); const b = (sets, sw) => ({ exId: id, sw, sets }); return [[b([S(100, 8, true), S(60, 0, false)], 100), 1, d], [b([S(100, 8, true), S(100, 0, false)], 100), 1, d], [b([S(40, 0, false)], 100), 0, d], [b([S(40, 0, false)], null), 0, d], [b([S(40, 0, false, { warm: true })], 100), 0, d], [b([S(40, 8, false)], 100), 0, d]]; }),
  // Each muscle's score as the page reads it, and the shapes no history may hold: none measured, one, two, flat, rising and falling.
  musTrend: () => [...window.__ironlog.IDX().scores.map(x => [x]), [{ clear: false, n: 0, score: 0 }], [{ clear: false, n: 1, score: 0 }], [{ clear: false, n: 2, score: 0 }], [{ clear: true, n: 2, score: 1.5 }], [{ clear: true, n: 1, score: 4.2, wk: 5 }], [{ clear: true, n: 3, score: -6 }]]
};
// Hand-made histories beside the wide ones, for paths those never reach, each built on a wide history's settings,
// exercises and routines (since r54): a lifter back this week after ten weeks away, whose weeks count from the
// break since r55 (logStartIn), so the first week back waits as a first week does (the coach's "after your second
// week back", BACK_WEEK_WHY; until r55 "after a full week of training"); and Strength
// 5 x 5 done on Monday, Wednesday and Friday, every set as planned, whose last three full weeks hold four A days,
// so chest and upper back are on plan under their minimum (weeks.ts, cycleMixIn; the coach's "Every muscle on plan");
// a bench press changed from kilograms to pounds at the same weight (prSameLoad, r54); and three for coach lines the
// wide histories never reach: every muscle at target with nothing stalled, strength falling with nothing stalled, and
// a lift stalled at the top of the range of the day it was last done on (r54, after its review).
const day = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const monday = d => day(d, -((new Date(d + 'T12:00:00Z').getUTCDay() + 6) % 7));
// Strength 5 x 5 as the template makes it, and its planned hard sets a week by r54's reading (three sessions a week), as a first-run pick fits the targets to.
const STR5_PLANNED = { quads: 15.75, glutes: 9, adductors: 7.5, lowerBack: 12, chest: 7.5, frontDelts: 11.25, triceps: 7.5, upperBack: 7.5, lats: 3.75, biceps: 3.75, rearDelts: 3.75, sideDelts: 3.75, hamstrings: 0.75, traps: 0.75, forearms: 0.75 };
const TRACKED = ['serratus', 'rotatorCuff', 'neck', 'tibialis'];
const str5 = () => {
  const it = (uid, exId, sets, rest) => ({ uid, exId, sets, repMin: 5, repMax: 5, rir: 2, rest, inc: 2.5, ss: null });
  return { id: 'str5x', name: 'Strength, 5 x 5', schedule: 'cycle', days: [
    { id: 'sA', name: 'Strength A', rest: false, items: [it('a1', 'backSquat', 5, 180), it('a2', 'bench', 5, 180), it('a3', 'bbRow', 5, 150)] },
    { id: 'sR1', name: 'Rest', rest: true, items: [] },
    { id: 'sB', name: 'Strength B', rest: false, items: [it('b1', 'backSquat', 5, 180), it('b2', 'ohp', 5, 180), it('b3', 'deadlift', 1, 240)] },
    { id: 'sR2', name: 'Rest', rest: true, items: [] }] };
};
// Strength 5 x 5 done on Monday, Wednesday and Friday for four weeks, every set as planned and 2.5 heavier each
// session, on a wide history's settings, exercises and routines, with each minimum target set by low (its own
// minimum, where the history set one, over the default, and the muscle's planned sets a week).
const str5Log = (h, { LIB, BANDS }, low) => {
  const R = str5(), w0 = monday(h.today), lifts = ['backSquat', 'bench', 'bbRow', 'ohp', 'deadlift'];
  const sessions = []; let k = 0;
  for (const wk of [-28, -21, -14, -7]) for (const d of [0, 2, 4]) {
    const di = k % 2 ? 2 : 0, dd = R.days[di];
    sessions.push({ id: 'mwf' + k, date: day(w0, wk + d), dayIdx: di, dayId: dd.id, dayName: dd.name, routineId: R.id, notes: '',
      ex: dd.items.map(x => ({ exId: x.exId, rr: [5, 5], sets: Array.from({ length: x.sets }, () => ({ w: 60 + 2.5 * k, r: 5, rir: 2, done: true })) })) });
    k++;
  }
  // A wide history's own targets, where it set any, over the defaults, as normalize reads them.
  const b = { ...BANDS, ...(h.raw.settings.bands || {}) }, bands = {};
  for (const m in b) bands[m] = TRACKED.includes(m) ? b[m] : [low(b[m][0], STR5_PLANNED[m] || 0), b[m][1]];
  return { ...h, raw: { ...h.raw, injuries: [], deloadWeek: null, draft: null,
    exercises: h.raw.exercises.map(e => (lifts.includes(e.id) ? LIB.find(x => x.id === e.id) : e)),
    routines: [...h.raw.routines.filter(r => r.id !== R.id), R], activeRoutineId: R.id,
    settings: { ...h.raw.settings, restWeeks: [], todayStart: undefined, rirMode: 'on', rirHalf: undefined, profile: undefined, bandsFit: undefined, bands, priorities: [] },
    sessions } };
};
// Bench on a heavy day (5 sets of 3 to 5) and a light day (4 of 8 to 12) of a one-week cycle for six weeks, each
// session's load and reps from heavy(i) and light(i), the heavy days last when heavyLast, every minimum target at half
// of what bench gives it a week (5 and 4 sets for the chest, its helpers half), or the history's own where lower.
const heavyLight = (h, { LIB, BANDS }, heavy, light, heavyLast) => {
  const it = (uid, sets, lo, hi) => ({ uid, exId: 'bench', sets, repMin: lo, repMax: hi, rir: 1, rest: 150, inc: 2.5, ss: null });
  const rest = n => ({ id: 'hlr' + n, name: 'Rest', rest: true, items: [] });
  const R = { id: 'hl2', name: 'Heavy and light', schedule: 'cycle', days: [{ id: 'hlH', name: 'Heavy', rest: false, items: [it('h1', 5, 3, 5)] }, rest(1), rest(2), { id: 'hlL', name: 'Light', rest: false, items: [it('l1', 4, 8, 12)] }, rest(3), rest(4), rest(5)] };
  const one = (id, n, di, rr, k, [w, r]) => ({ id, date: day(h.today, n), dayIdx: di, dayId: R.days[di].id, dayName: R.days[di].name, routineId: R.id, notes: '', ex: [{ exId: 'bench', rr, sets: Array.from({ length: k }, () => ({ w, r, rir: 1, done: true })) }] });
  const sessions = [0, 1, 2, 3, 4, 5].flatMap(i => {
    const late = -1 - 7 * (5 - i), early = late - 3;
    return [one('hv' + i, heavyLast ? late : early, 0, [3, 5], 5, heavy(i)), one('lt' + i, heavyLast ? early : late, 3, [8, 12], 4, light(i))];
  }).sort((a, b) => (a.date < b.date ? -1 : 1));
  const planned = { chest: 9, triceps: 4.5, frontDelts: 4.5 }, b = { ...BANDS, ...(h.raw.settings.bands || {}) }, bands = {};
  for (const m in b) bands[m] = TRACKED.includes(m) ? b[m] : [Math.min(b[m][0], Math.floor((planned[m] || 0) / 2)), b[m][1]];
  return { ...h, raw: { ...h.raw, injuries: [], deloadWeek: null, draft: null,
    exercises: h.raw.exercises.map(e => (e.id === 'bench' ? LIB.find(x => x.id === 'bench') : e)),
    routines: [...h.raw.routines.filter(r => r.id !== R.id), R], activeRoutineId: R.id,
    settings: { ...h.raw.settings, restWeeks: [], todayStart: undefined, rirMode: 'on', rirHalf: undefined, profile: undefined, bandsFit: undefined, bands, priorities: [] },
    sessions } };
};
const SCENARIOS = [
  h => ({ ...h, raw: { ...h.raw, injuries: [], deloadWeek: null, draft: null, settings: { ...h.raw.settings, restWeeks: [] },
    sessions: [[-77, 60], [-73, 62.5], [-70, 65], [0, 67.5]].map(([n, w], i) => ({ id: 'back' + i, date: day(h.today, n), dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '',
      ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w, r: 8, rir: 1, done: true }, { w, r: 8, rir: 1, done: true }] }] })) } }),
  (h, o) => str5Log(h, o, (lo, planned) => Math.min(lo, Math.floor(planned))),
  // A bench press in kilograms, then the same weight typed in pounds at another gym (155 lb, the nearest 5 lb load over
  // 70 kg), one more rep there, and a step past it (157.5 lb): the PR reading of a load another unit stands for
  // (prSameLoad, r54), which the wide histories, each made in one unit, may not reach.
  h => ({ ...h, raw: { ...h.raw, injuries: [], deloadWeek: null, draft: null, settings: { ...h.raw.settings, restWeeks: [] },
    sessions: [[-30, 70, 8], [-23, 70, 8], [-16, 155, 8], [-9, 155, 9], [-2, 157.5, 8]].map(([n, w, r], i) => ({ id: 'unit' + i, date: day(h.today, n), dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '',
      ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: i < 2 ? w : w * 0.45359237, r, rir: 1, done: true }, { w: i < 2 ? w : w * 0.45359237, r: 8, rir: 1, done: true }] }] })) } }),
  // The same Strength 5 x 5 with each minimum brought down to half of what the plan gives a week: every muscle at
  // target, nothing stalled (the coach's last line, which no other history reached).
  (h, o) => str5Log(h, o, (lo, planned) => Math.min(lo, Math.floor(planned / 2))),
  // Bench on the light day only (8 to 12 at one load, its reps falling over six weeks), the last session opening with a
  // single at a load never done before, its targets at half the plan: falling in the one range in use, not stalled (the
  // single is a PR in the stall's last three sessions), with every muscle at target (the coach's falling line). Until r55
  // a light day falling beside a heavy day rising reached it (PENDING 319: falling only when it falls in every range in
  // use; the last history but one below).
  (h, o) => { const x = heavyLight(h, o, i => [100 + 2.5 * i, 5], i => [70, [12, 11, 10, 9, 8, 8][i]], false); return { ...x, raw: { ...x.raw, sessions: x.raw.sessions.filter(q => q.id.startsWith('lt')).map(q => (q.id === 'lt5' ? { ...q, ex: [{ ...q.ex[0], sets: [{ w: 90, r: 3, rir: 1, done: true }, ...q.ex[0].sets] }] } : q)) } }; },
  // The same two days flat, 100 x 5 x 5 at the top of 3 to 5 and 70 x 10 x 4 in 8 to 12, the heavy day last: stalled in
  // both, and at the top of its range by the plan of the day it was last done on (the coach's top-of-range line, which
  // since r54 reads that day's plan, coach.ts's atRangeTopIn; no wide history reaches it).
  (h, o) => heavyLight(h, o, () => [100, 5], () => [70, 10], true),
  // The heavy day a step heavier each week instead, the light day last: falling in the light day's range only, so not
  // falling (r55, PENDING 319; until r55 the coach said chest strength was falling), the range it falls in named.
  (h, o) => heavyLight(h, o, i => [100 + 2.5 * i, 5], i => [70, [12, 11, 10, 9, 8, 8][i]], false),
  // A lift's sessions read by the sets their plan gave them (r58, 339 h, from its review): bench planned at 4 on a day of the
  // routine, 100 x 8 x 4 done to a plan of 4, five weeks of 3 sets to a plan of 3 (a set taken off), then 3 sets and 4 to a plan
  // of 4 again: only the session of 3 after the set went back is short (the hold the wide histories, saved without it, never reach).
  h => { const R = { id: 'psR', name: 'Plan sets', schedule: 'cycle', days: [{ id: 'psD', name: 'Push', rest: false, items: [{ uid: 'ps1', exId: 'bench', sets: 4, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5, ss: null }] }] };
    return { ...h, raw: { ...h.raw, injuries: [], deloadWeek: null, draft: null, settings: { ...h.raw.settings, restWeeks: [] }, routines: [...h.raw.routines.filter(r => r.id !== R.id), R], activeRoutineId: R.id,
      sessions: [[100, 4, 4], [102.5, 3, 3], [105, 3, 3], [107.5, 3, 3], [110, 3, 3], [112.5, 3, 4], [112.5, 4, 4]].map(([w, n, ps], i) => ({ id: 'ps' + i, date: day(h.today, -44 + 7 * i), dayIdx: 0, dayId: 'psD', dayName: 'Push', routineId: R.id, notes: '',
        ex: [{ exId: 'bench', rr: [6, 10], sets: Array.from({ length: n }, () => ({ w, r: 8, rir: 1, done: true })), ps }] })) } }; },
  // Missed sets (r55, V): a bench session with a set tried and not made between two done and one after them, so the
  // analytics keep them for the Last line in their places (missedTag), which no wide history reaches (their reps are 1 or more).
  h => ({ ...h, raw: { ...h.raw, injuries: [], deloadWeek: null, draft: null, settings: { ...h.raw.settings, restWeeks: [] },
    sessions: [[-9, [[100, 8], [100, 8]]], [-2, [[100, 8], [120, 0], [100, 7], [100, 0]]]].map(([n, sets], i) => ({ id: 'miss' + i, date: day(h.today, n), dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '',
      ex: [{ exId: 'bench', rr: [6, 10], sets: sets.map(([w, r]) => ({ w, r, rir: 1, done: true })) }] })) } })
];

// The child: the bundle on the page's histories, under V8's coverage.
if (process.argv[2] === '--child') {
  const { decode, ser, err } = require('./wide');
  const [dataFile, bundleFile] = process.argv.slice(3);
  const E = require(bundleFile);
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  // Every value a module keeps (its tables), frozen, so a write to one by any
  // path throws, an alias included (the second r52 review), but for the date
  // formatters hygiene's rule 6 lists, which only gain entries.
  const STATE_OK = new Set(['DTF']);
  const freezeDeep = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.getOwnPropertyNames(v)) freezeDeep(v[k]); } return v; };
  let tables = 0; for (const [k, v] of Object.entries(E)) if (v && typeof v === 'object' && !STATE_OK.has(k)) { freezeDeep(v); tables++; }
  const out = { locale: Intl.DateTimeFormat().resolvedOptions().locale, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, calls: 0, same: 0, again: 0, first: null, names: {}, tables, watched: 0, writes: [] };
  // A log that records every attempt to change it, even one whose error the
  // code catches (the second r52 review swallowed one): a proxy over an
  // unfrozen copy, each object reached through it watched too.
  const watch = (root, seen) => {
    const wrap = new WeakMap();
    const p = (o, path) => {
      if (!o || typeof o !== 'object') return o;
      if (wrap.has(o)) return wrap.get(o);
      const pr = new Proxy(o, {
        get: (t, k, r) => p(Reflect.get(t, k, r), path + '.' + String(k)),
        set: (t, k) => { seen.push(`${path}.${String(k)} set`); return false; },
        defineProperty: (t, k) => { seen.push(`${path}.${String(k)} defined`); return false; },
        deleteProperty: (t, k) => { seen.push(`${path}.${String(k)} deleted`); return false; },
        setPrototypeOf: () => { seen.push(`${path} prototype set`); return false; },
        preventExtensions: () => { seen.push(`${path} frozen or sealed`); return false; }
      });
      wrap.set(o, pr); return pr;
    };
    return p(root, 'log');
  };
  const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) freeze(v[k]); } return v; };
  for (const h of data.histories) {
    const state = freeze(decode(h.state));
    const byName = new Map();
    for (const line of h.calls) { const [name, args, res] = line.split('\t'); if (!byName.has(name)) byName.set(name, []); byName.get(name).push([args, res]); }
    for (const [tagged, calls] of byName) {
      const name = tagged.replace(/^~/, ''), plain = PLAIN.includes(name), fn = plain ? E[name] : E[name + 'In'];
      out.names[name] = (out.names[name] || 0) + calls.length;
      // Every tenth history's second round runs on the watched log (a proxy is slow).
      const watched = h.seed % 10 === 0;
      for (const round of [0, 1]) {
        const seen = [];
        const M = E.modelOf(round === 1 && watched ? watch(decode(h.state), seen) : state, () => h.today);
        for (const [args, res] of calls) {
          let r; try { r = plain ? fn(...freeze(decode(args))) : fn(M, ...freeze(decode(args))); } catch (e) { r = err(e); }
          const got = typeof fn === 'function' ? ser(r) : 'no such function';
          if (round === 0) { out.calls++; if (got === res) out.same++; else if (!out.first) out.first = { seed: h.seed, name, args: args.slice(0, 300), page: res.slice(0, 400), node: got.slice(0, 400) }; }
          else if (got === res) out.again++;
        }
        if (round === 1 && watched) { out.watched += calls.length; for (const w of seen) if (out.writes.length < 5) out.writes.push(`${name}: ${w}`); if (seen.length) out.wroteAny = true; }
      }
    }
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const { open, engine, settle } = require('./h');
const { wide, digest, specOf } = require('./wide');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); };

// Line coverage of each source file from V8's block coverage of the bundle
// and the bundle's source map: a line counts once it has code mapped to it,
// and is run when any of that code ran.
function lineCoverage(covDir, bundleFile, mapPayload) {
  const { SourceMap } = require('module');
  const url = require('url').pathToFileURL(bundleFile).href;
  // One file per batch: a place counts as run when it ran in any of them.
  const entries = fs.readdirSync(covDir).flatMap(f => JSON.parse(fs.readFileSync(path.join(covDir, f), 'utf8')).result).filter(r => r.url === url);
  if (!entries.length) return null;
  const src = fs.readFileSync(bundleFile, 'utf8');
  const count = new Int32Array(src.length).fill(0);
  for (const entry of entries) {
    const one = new Int32Array(src.length).fill(-1);
    // Outer ranges first, so each inner block's count overwrites the function around it.
    const fns = entry.functions.slice().sort((a, b) => (b.ranges[0].endOffset - b.ranges[0].startOffset) - (a.ranges[0].endOffset - a.ranges[0].startOffset));
    for (const f of fns) for (const r of f.ranges) one.fill(r.count, Math.max(0, r.startOffset), Math.min(src.length, r.endOffset));
    for (let i = 0; i < src.length; i++) if (one[i] > 0) count[i] += one[i];
  }
  const sm = new SourceMap(mapPayload);
  const lines = new Map(); // "file:line" -> run (true) or not
  let off = 0;
  const gen = src.split('\n');
  for (let ln = 0; ln < gen.length; ln++) {
    const text = gen[ln];
    for (let col = 0; col < text.length; col++) {
      if (text[col] === ' ') continue;
      const e = sm.findEntry(ln, col);
      if (!e || !e.originalSource || e.generatedLine !== ln) continue;
      const file = path.basename(e.originalSource).replace(/\.ts$/, '');
      if (!MODULES.includes(file)) continue;
      const key = `${file}:${e.originalLine}`;
      const ran = count[off + col] > 0;
      lines.set(key, lines.get(key) || ran);
    }
    off += text.length + 1;
  }
  const per = {};
  for (const [key, ran] of lines) { const f = key.slice(0, key.indexOf(':')); per[f] = per[f] || { run: 0, all: 0, not: [] }; per[f].all++; if (ran) per[f].run++; else per[f].not.push(+key.slice(key.indexOf(':') + 1) + 1); }
  return per;
}

(async () => {
  // The page's answers and its normalized logs, and its language and time zone.
  const browser = await engine.launch();
  const B = await open('index.html', { browser, setup: async (ctx, page) => { await page.clock.setFixedTime(new Date('2026-10-11T12:00:00')); } });
  const LIB = await B.page.evaluate(() => window.__ironlog.libExercises());
  // The default weekly targets, which a hand-made history fits to its routine as a first-run pick does.
  const BANDS = await B.page.evaluate(() => window.__ironlog.BANDS);
  const intl = await B.page.evaluate(() => { const o = Intl.DateTimeFormat().resolvedOptions(); return { locale: o.locale, timeZone: o.timeZone }; });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-engine-'));
  const histories = [], batches = [], made = [];
  for (let i = 0; i < K + SCENARIOS.length; i++) {
    const h = i < K ? wide(52000 + i, LIB) : SCENARIOS[i - K](wide(52000 + i, LIB), { LIB, BANDS });
    await B.page.clock.setFixedTime(new Date(h.today + 'T12:00:00'));
    const d = await B.page.evaluate(digest, specOf(h));
    const lines = d.split('\n');
    const state = lines.find(l => l.startsWith('state ')).slice(6);
    // The calls up to invalidate and it: after it the page reads the caches anew, which a fresh model always does.
    const calls = []; for (const l of lines) { if (l.split('\t').length === 3) calls.push(l); if (l.startsWith('invalidate\t')) break; }
    // The adapters the digest does not call, on the same log the digest leaves loaded.
    const sp = specOf(h);
    calls.push(...await B.page.evaluate(([spec, extra]) => {
      const L = window.__ironlog; const ser = new Function(`return (${spec.ser})`)(), err = new Function(`return (${spec.err})`)();
      const out = [];
      for (const [name, argsOf] of Object.entries(extra)) for (const args of new Function(`return (${argsOf})`)()(L.state, spec.ids)) { let r; try { r = L[name](...args); } catch (e) { r = err(e); } out.push(name + '\t' + ser(args) + '\t' + ser(r)); }
      return out;
    }, [sp, Object.fromEntries(Object.entries(EXTRA).map(([k, f]) => [k, f.toString()]))]));
    if (i >= K) made.push(calls.filter(l => l.startsWith('coach\t')).map(l => l.split('\t')[2]).join(' '));
    histories.push({ seed: 52000 + i, today: h.today, state, calls });
    if (histories.length === BATCH || i === K + SCENARIOS.length - 1) { batches.push(path.join(tmp, `data-${batches.length}.json`)); fs.writeFileSync(batches[batches.length - 1], JSON.stringify({ histories })); histories.length = 0; }
  }
  ok(/Volume advice appears here after your second week back/.test(made[0] || '') && /Every muscle on plan, nothing stalled/.test(made[1] || '') && /Every muscle at target, nothing stalled/.test(made[3] || '') && /Chest strength is falling over \d+ weeks/.test(made[4] || '') && /is at the top of its range at [^:]+ and has stalled over the last \d+ weeks: it is due a step up/.test(made[5] || '') && /Every muscle at target, nothing stalled/.test(made[6] || ''), 'the hand-made histories reach the coach lines they were made for', made);
  ok(!B.errors.length, 'no page errors while the page answered', B.errors.slice(0, 3));
  await settle(browser.close(), 'closing the browser');

  // The engine's modules, bundled for Node with their source map.
  // The engine's modules, and every other module but the store and the live
  // model (which the engine never reaches), so each table the engine could
  // reach is there to be frozen in the child.
  const others = fs.readdirSync(APP).filter(f => f.endsWith('.ts')).map(f => f.slice(0, -3)).filter(m => !MODULES.includes(m) && !['store', 'live'].includes(m)).sort();
  const entry = [...MODULES, ...others].map(m => `export * from './${m}';`).join('\n');
  // Strict, as the page's bundle is (scripts/join.js) and as modules always
  // are: in sloppy mode a write to a frozen object fails silently, so a write
  // to the log would pass unseen (the r52 review).
  const built = require('esbuild').buildSync({ stdin: { contents: entry, resolveDir: APP, loader: 'ts', sourcefile: 'engine-entry.ts' }, bundle: true, format: 'cjs', platform: 'node', write: false, sourcemap: 'external', outfile: path.join(tmp, 'engine.js'), charset: 'utf8', banner: { js: '"use strict";' }, logLevel: 'silent' });
  const js = built.outputFiles.find(f => f.path.endsWith('.js')), map = built.outputFiles.find(f => f.path.endsWith('.map'));
  ok(js.text.startsWith('"use strict";'), 'the engine runs strict in Node, so a write to the frozen log throws');
  fs.writeFileSync(js.path, js.text); fs.writeFileSync(map.path, map.text);
  const covDir = path.join(tmp, 'cov'); fs.mkdirSync(covDir);
  // The page's language and time zone, so dates are worded as the page words them.
  const lang = intl.locale.replace('-', '_') + '.UTF-8';
  const t0 = Date.now();
  // The batches run side by side, one Node process each, on every core the machine has (up to four): the browser is
  // closed by now and this process only waits, so leaving a core for it, as until r59, ran one batch at a time on a
  // two-core machine and took the suite to its 15 minutes there (r59: 838 s alone, 650 of them here).
  const runOne = dataFile => new Promise(done => {
    const c = spawn(process.execPath, [__filename, '--child', dataFile, js.path], { env: { ...process.env, NODE_V8_COVERAGE: covDir, TZ: intl.timeZone, LANG: lang, LC_ALL: lang } });
    let out = '', errText = ''; c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { errText += d; });
    c.on('close', () => { try { done(JSON.parse(out)); } catch (e) { done({ crash: (errText || out).slice(0, 1500) }); } });
  });
  const results = []; let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(4, os.cpus().length)) }, async () => { while (next < batches.length) { const i = next++; results[i] = await runOne(batches[i]); } }));
  let res = null;
  const crash = results.find(r => r.crash);
  if (crash) ok(false, 'the engine ran in Node', crash.crash);
  else for (const r of results) { if (!res) res = r; else { res.calls += r.calls; res.same += r.same; res.again += r.again; res.watched += r.watched; res.wroteAny = res.wroteAny || r.wroteAny; res.writes.push(...r.writes); res.first = res.first || r.first; for (const [n, c] of Object.entries(r.names)) res.names[n] = (res.names[n] || 0) + c; } }
  if (res) {
    ok(res.locale === intl.locale && res.timeZone === intl.timeZone, `Node read dates in the page's language and time zone (${intl.locale}, ${intl.timeZone})`, { node: [res.locale, res.timeZone], page: intl });
    const missing = ADAPTERS.filter(n => !(res.names[n] > 0));
    ok(ADAPTERS.length >= 79 && missing.length === 0 && Object.keys(res.names).length === ADAPTERS.length + PLAIN.length && PLAIN.every(n => res.names[n] > 0), `all ${ADAPTERS.length} adapters in live.ts and ${PLAIN.join(', ')} were called in Node (${Object.keys(res.names).length})`, { missing, names: Object.keys(res.names) });
    ok(res.calls > K * 1000 && res.same === res.calls, `each of the ${ADAPTERS.length}, on a fresh model of a frozen log, and ${PLAIN.join(', ')}, gives the page's answer: ${res.same} of ${res.calls} calls over ${K} histories and ${SCENARIOS.length} made by hand (${Math.round((Date.now() - t0) / 1000)} s)`, res.first);
    ok(res.again === res.calls, `and gives it again on a second fresh model (${res.again} of ${res.calls})`);
    ok(res.tables > 40, `every table the modules keep was frozen for the run, so no write to one passes (${res.tables})`);
    ok(res.watched > 0 && !res.wroteAny, `no call tried to change the log, watched on every tenth history's second round, a caught error included (${res.watched} calls)`, res.writes);
    const per = lineCoverage(covDir, js.path, JSON.parse(map.text));
    ok(per && MODULES.every(m => per[m] && per[m].all > 0), 'V8 measured the lines run in each module of the engine', per);
    if (per) {
      const pct = m => Math.floor((per[m].run / per[m].all) * 1000) / 10;
      const now = Object.fromEntries(MODULES.map(m => [m, pct(m)]));
      console.log('note lines run, per module:', MODULES.map(m => `${m} ${now[m]}% (${per[m].run} of ${per[m].all})`).join(', '));
      // ENGINE_UNRUN=coach,weeks lists the lines of those modules that never ran.
      for (const m of (process.env.ENGINE_UNRUN || '').split(',').filter(x => per[x])) console.log(`note ${m}.ts lines never run: ${per[m].not.sort((a, b) => a - b).join(' ')}`);
      const arch = fs.readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8');
      const line = (arch.match(/^Engine coverage, lines run by tests\/engine\.js: (.+)$/m) || [])[1] || '';
      const rec = Object.fromEntries([...line.matchAll(/([a-z]+) ([\d.]+)%/g)].map(m => [m[1], +m[2]]));
      ok(MODULES.every(m => m in rec), 'ARCHITECTURE.md records the lines run in each module of the engine', rec);
      const low = MODULES.filter(m => now[m] < rec[m]);
      ok(low.length === 0, 'no module of the engine runs fewer lines than ARCHITECTURE.md records (the ratchet only rises)', low.map(m => `${m} ${now[m]}% of ${rec[m]}%`));
      const high = MODULES.filter(m => now[m] > rec[m]);
      ok(high.length === 0, 'when more lines run, the number in ARCHITECTURE.md is raised to match, so it stays', high.map(m => `${m} ${now[m]}%, recorded ${rec[m]}%`));
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
