// 2.35 (build r81): the independent review of NEW-88's areas (2026-11-08), each section a reproduction of its finding,
// older than 2.35 (each fails on 2.34, `node tests/r81b.js baselines/r80.html`, and on 94a1c9b):
//   1  R81-4: the coach never asks for sets on a lift that loads a flagged injury, a joint or a helper muscle: a muscle
//      whose every lift the lifter has loads one is not pushed (the knee, or the lower back with back squat the only quads lift).
//   2  R81-5: Pick for me says a day loads a flagged muscle even when it is not one of the day's two largest.
//   3  R81-6: Pick for me never says "not trained hard" of a muscle with hard sets in the window.
//   4  R81-7: a barbell lift with no history, swapped in from a light close variation, never opens under the bar.
//   5  R81-8: Swap takes the new lift's own step when it is on other equipment; guard: the slot's range is kept.
//   6  R81-9: a day of 61 minutes with a 60-minute budget, shown as ~60 min, is not called over the budget.
//   7  R81-10: the coach never asks for sets on a lift the lifter deleted.
// R81B_ONLY=1,2 runs some sections.
const { open } = require('./h');
const { lifter, datesBack, add } = require('./kinds');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R81B_ONLY ? process.env.R81B_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const T = '2026-11-08';
const LBK = 0.45359237;

/** The log `raw` loaded into the page at T, 10:00. */
async function load(P, raw) {
  await P.page.clock.setFixedTime(new Date(T + 'T10:00:00'));
  await P.page.evaluate(raw => { const L = window.__ironlog; L.state = L.normalize(JSON.parse(raw)); L.invalidate(); }, JSON.stringify(raw));
}
const ev = (P, fn, arg) => P.page.evaluate(fn, arg);

(async () => {
  const P = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });

  if (run(1)) {
    const days = [
      { name: 'Upper', items: [['bench', 4, 6, 10], ['cableRow', 4, 8, 12], ['cableLateral', 4, 12, 15], ['inclineCurl', 3, 10, 12], ['pressdown', 3, 10, 15], ['facePull', 3, 12, 15]] }, { name: 'Rest', rest: true },
      { name: 'Lower', items: [['rdl', 2, 6, 10], ['backSquat', 2, 5, 8], ['standCalf', 4, 10, 15], ['hipThrust', 4, 8, 12]] }, { name: 'Rest', rest: true },
      { name: 'Upper 2', items: [['incDb', 4, 8, 12], ['latPulldown', 4, 8, 12], ['dbLateral', 4, 12, 15], ['hammer', 3, 10, 12], ['ohCableExt', 3, 10, 15], ['cableFly', 3, 10, 15]] }, { name: 'Rest', rest: true }];
    const read = () => ev(P, () => { const L = window.__ironlog; const c = L.coach(); const m = c.text.match(/a week to (.+?)\./); const e = m && L.state.exercises.find(x => x.name === m[1]); return { text: c.text, named: e ? e.id : null, inj: e ? L.exInjury(L.EX(e.id)) : null }; });
    await load(P, lifter({ today: T, injuries: [], dates: datesBack(add(T, -1), 21, 2), days }));
    const a = await read();
    ok(a.named === 'backSquat', '1. (setting up) with nothing flagged, the coach asks for quads sets on back squat', a);
    await load(P, lifter({ today: T, injuries: ['j_knee'], dates: datesBack(add(T, -1), 21, 2), days }));
    const b = await read();
    ok(!(b.named && b.inj) && !/^Quads/.test(b.text), '1. knee flagged, every quads lift loading it: the coach does not push quads', b);
    await load(P, lifter({ today: T, injuries: ['lowerBack'], dates: datesBack(add(T, -1), 21, 2), days }));
    const c = await read();
    // The lifter's only quads lift loads the lower back, so quads are not pushed (one rule: a muscle whose every lift the lifter has loads an injury), and whatever lift is named loads nothing flagged.
    ok(!c.inj && !/Back Squat/.test(c.text), '1. lower back flagged: the coach names no lift that loads it, back squat included', c);
  }

  if (run(2)) {
    await load(P, lifter({ today: T, injuries: ['frontDelts'], dates: datesBack('2026-11-05', 12, 2), days: [
      { name: 'Push', items: [['bench', 4, 6, 10], ['incDb', 3, 8, 12], ['ohp', 2, 6, 10], ['pressdown', 3, 10, 15]] },
      { name: 'Pull', items: [['latPulldown', 4, 8, 12], ['cableRow', 3, 8, 12], ['bbCurl', 3, 8, 12]] }] }));
    const r = await ev(P, () => { const L = window.__ironlog; const rk = L.rankDays(); const x = rk.rows.find(r => r.day.name === 'Push'); return L.dayReasons(x, rk.r7); });
    ok(r.some(t => /Front delts/i.test(t) && /flagged/.test(t)), "2. Push, which loads front delts as a helper, says it loads them and that they are flagged", r);
  }

  if (run(3)) {
    await load(P, lifter({ today: T, dates: datesBack(add(T, -1), 12, 2), days: [
      { name: 'Push', items: [['bench', 3, 6, 10], ['dbLateral', 3, 12, 15]] }, { name: 'Rest', rest: true },
      { name: 'Legs', items: [['legPress', 3, 8, 12], ['lyingCurl', 1, 10, 15]] }, { name: 'Rest', rest: true }] }));
    const o = await ev(P, () => { const L = window.__ironlog; const rk = L.rankDays(); const lines = rk.rows.flatMap(r => L.dayReasons(r, rk.r7));
      const d = { ex: [{ exId: 'legPress', plan: { sets: 3, repMin: 8, repMax: 12, rir: 2, rest: 120 }, sets: [{ w: null, r: null, done: false }] }], date: L.today(), dayId: 'd2' };
      const ham = L.rankExercises(d).find(x => x.m === 'hamstrings');
      return { lines, ham: ham ? L.exReasons(ham) : [] }; });
    const bad = [...o.lines, ...o.ham].filter(t => /not trained hard/i.test(t));
    const hamLine = o.lines.find(t => /^Hamstrings: [1-9]/.test(t));
    ok(!!hamLine && !bad.length, '3. hamstrings with hard sets this week are never called not trained hard', { hamLine, bad });
  }

  if (run(4)) {
    for (const [unit, start] of [['kg', 20], ['lb', 45]]) {
      await load(P, lifter({ unit, today: T, restAfter: 1, dates: datesBack(add(T, -2), 8, 3), stepEvery: 100, start: { incBench: unit === 'kg' ? start : start * LBK, cableRow: 30 }, days: [{ name: 'Upper', items: [['incBench', 3, 8, 12], ['cableRow', 3, 8, 12]] }] }));
      const o = await P.page.evaluate(async () => {
        const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0' } }); await new Promise(r => setTimeout(r, 200));
        L.applyPick({ kind: 'picker', mode: 'swapBlock', b: 0, title: '', q: '', m: '' }, 'bench'); await new Promise(r => setTimeout(r, 200));
        const b = L.state.draft.ex[0]; const ex = L.EX(b.exId); const m = String(b.hint || '').match(/About ([\d.]+)/);
        const r = { hint: b.hint, about: m ? +m[1] : null, bar: +L.fmtW(L.exBarKg(ex)), odd: L.oddLoad(b, 0, L.today()) };
        L.state.draft = null; return r;
      });
      ok(o.about != null && o.about >= o.bar && !o.odd, `4. bench swapped in from incline bench at the bar (${unit}) starts at the bar or above, never under it`, o);
    }
  }

  if (run(5)) {
    const raw = lifter({ unit: 'lb', today: T, restAfter: 1, dates: datesBack(add(T, -2), 6, 3), stepEvery: 100, start: { bench: 61.2 }, days: [{ name: 'Push', items: [['bench', 3, 8, 12]] }] });
    raw.routines[0].days[0].items[0].inc = 10 * LBK;
    raw.sessions.push({ id: 'f1', date: add(T, -4), dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', free: true, notes: '', ex: [{ exId: 'dbBench', rr: [8, 12], sets: [12, 12, 12].map(r => ({ w: 50 * LBK, r, rir: 2, done: true })) }] });
    await load(P, raw);
    const o = await P.page.evaluate(async () => {
      const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0' } }); await new Promise(r => setTimeout(r, 200));
      L.applyPick({ kind: 'picker', mode: 'swapBlock', b: 0, title: '', q: '', m: '' }, 'dbBench'); await new Promise(r => setTimeout(r, 200));
      const b = L.state.draft.ex[0]; const own = L.suggest('dbBench', L.planFor('dbBench'), {});
      const r = { target: b.target, own: own.target, inc: L.toD(b.plan.inc), ownInc: L.toD(L.defPlan('dbBench').inc), rr: [b.plan.repMin, b.plan.repMax] };
      L.state.draft = null; return r;
    });
    ok(o.target === o.own && Math.abs(o.inc - o.ownInc) < 1e-6, "5. DB bench swapped into a 10 lb barbell slot takes its own step and its own plan's target", o);
    ok(o.rr[0] === 8 && o.rr[1] === 12, "5. (a guard) the slot's rep range is kept", o);
  }

  if (run(6)) {
    const raw = lifter({ today: T, restAfter: 1, settings: { timeBudget: 60 }, dates: datesBack(add(T, -2), 4, 3), days: [{ name: 'Push', items: [['bench', 4, 6, 10, 180], ['incDb', 3, 8, 12, 120], ['cableLateral', 3, 12, 15, 60], ['pressdown', 3, 10, 15, 60]] }] });
    await load(P, raw);
    const pick = await ev(P, () => { const L = window.__ironlog; const d = L.state.routines[0].days[0]; for (let a = 1; a <= 8; a++) for (let b = 1; b <= 8; b++) { d.items[2].sets = a; d.items[3].sets = b; const m = L.dayMinutes(d); if (m === 61 || m === 62) return [a, b, m]; } return null; });
    raw.routines[0].days[0].items[2].sets = pick[0]; raw.routines[0].days[0].items[3].sets = pick[1];
    await load(P, raw);
    const o = await P.page.evaluate(async () => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 150)); return { m: L.dayMinutes(L.state.routines[0].days[0]), over: [...document.querySelectorAll('.overb')].map(x => x.textContent) }; });
    ok(pick && !o.over.some(t => /~60 min, over/.test(t)), `6. a day of ${pick && pick[2]} minutes with a 60-minute budget, shown as ~60 min, is not called over it`, o);
  }

  if (run(7)) {
    await load(P, lifter({ today: T, restAfter: 1, dates: datesBack(add(T, -1), 16, 2), days: [
      { name: 'Upper', items: [['dbBench', 2, 8, 12], ['latPulldown', 4, 8, 12], ['cableRow', 4, 8, 12], ['cableLateral', 4, 12, 15], ['inclineCurl', 4, 10, 12], ['pressdown', 4, 10, 15], ['facePull', 4, 12, 15], ['plank', 4, 30, 60]] },
      { name: 'Lower', items: [['backSquat', 4, 5, 8], ['rdl', 4, 6, 10], ['legExt', 4, 10, 15], ['lyingCurl', 4, 10, 15], ['standCalf', 4, 10, 15], ['hipThrust', 4, 8, 12], ['plank', 4, 30, 60]] }] }));
    const o = await P.page.evaluate(async () => {
      const L = window.__ironlog; const wait = ms => new Promise(r => setTimeout(r, ms));
      const before = L.coach().text;
      L.ACT.exDel({ dataset: { ex: 'dbBench' } }); await wait(80);
      const b = [...document.querySelectorAll('.sheet button')].find(x => /^Delete$/.test(x.textContent.trim())); if (b) b.click(); await wait(80);
      return { before, archived: L.EX('dbBench').archived, after: L.coach().text };
    });
    ok(/DB Bench Press/.test(o.before), '7. (setting up) the coach names DB Bench Press before it is deleted', o);
    ok(o.archived && !/DB Bench Press/.test(o.after), '7. once DB Bench Press is deleted, the coach no longer names it', o);
  }

  await P.browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
