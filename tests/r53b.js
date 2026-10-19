// r53, the fixes from the whole-app audit V asked for on 2026-10-18 ("Instead
// of assuming nothing has changed vs prior release"): a simulated lifter took
// four journeys through the app as shipped in r52 and found these, each
// present since earlier builds. This suite drives the app's own flows on the
// real starter routine and fails on baselines/r52.html (`node tests/r53b.js
// baselines/r52.html`):
//   - dumbbells in kg with Your gym not set: a first session's adjustment
//     after 6 kg done easily is 8 kg, a dumbbell every kg rack has, not 8.5;
//   - a log kept in kg read in lb: a load converted from the other unit is
//     put on the 5 lb step, and the words add up to the load shown; a target
//     of reps at dumbbells off the step goes down to the one below, not up;
//   - on the RPE scale the reason behind a target says RPE, not RIR.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || 'index.html';

(async () => {
  const P = await open(FILE, { clock: '2026-10-15T10:00:00', realStarter: true });
  const { page } = P; const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
  const LB = 0.45359237;
  // Starts Upper A with only the given lift left in it, as a lifter who does that one lift today.
  const startWith = async (exId) => {
    await ev((exId) => { const L = window.__ironlog; L.state.draft = null; L.invalidate(); L.saveNow(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === exId); L.saveNow(); L.render(); }, exId);
    await wait(150);
  };
  const log = (sessions, settings) => ev(([sessions, settings]) => { const L = window.__ironlog; const s = L.state; s.sessions = sessions; s.draft = null; delete s.settings.gym; Object.assign(s.settings, settings); L.state = L.normalize(s); L.invalidate(); L.saveNow(); L.render(); }, [sessions, settings]);
  const ses = (id, date, exId, rr, sets) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId, rr, sets: sets.map(([w, r, rir]) => ({ w, r, rir: rir == null ? 1 : rir, done: true })) }] });

  // ---- Dumbbells in kg, Your gym not set, the incline curl never done: 6 kg for 15 at 5 in reserve, as typed and ticked.
  {
    await log([], { unit: 'kg' });
    const has = await ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); return R.days[0].items.some(i => i.exId === 'inclineCurl'); });
    ok(has, 'set up: the starter routine\'s Upper A has the incline dumbbell curl', has);
    await startWith('inclineCurl');
    const ws = '.sg input[data-f="w"][data-b="0"][data-s="0"]', rs = '.sg input[data-f="r"][data-b="0"][data-s="0"]';
    await page.fill(ws, '6'); await page.dispatchEvent(ws, 'input'); await page.dispatchEvent(ws, 'change');
    await page.fill(rs, '15'); await page.dispatchEvent(rs, 'input'); await page.dispatchEvent(rs, 'change');
    if (!(await ev(() => window.__ironlog.state.draft.ex[0].sets[0].done))) await page.click('[data-act="sDone"][data-b="0"][data-s="0"]');
    await ev(() => window.__ironlog.ACT.rirPick({ dataset: { b: '0', s: '0', v: '5' } })); await wait(150);
    const r = await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; return { next: L.effW(b, 1), adj: (document.getElementById('adj-0') || {}).innerText || '' }; });
    ok(Math.abs(r.next - 8) < 1e-6 && /8 kg/.test(r.adj), 'incline dumbbell curls in kg, never done, Your gym not set: after 6 kg for 15 at 5 in reserve, the next sets are 8 kg, a dumbbell every kg rack has, not 8.5', r);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
  }

  // ---- A log kept in kg, then read in lb (the lifter switched units).
  {
    const pl = await ev(() => { const p = window.__ironlog.planFor('bench'); return { lo: +p.repMin, hi: +p.repMax }; });
    // Bench at 42.5 kg, every set at the top of its range: the next load is on the 5 lb step, and the words add the step that gets there.
    await log([ses('b1', '2026-10-08', 'bench', [pl.lo, pl.hi], [[42.5, pl.hi], [42.5, pl.hi], [42.5, pl.hi]])], { unit: 'lb' });
    await startWith('bench');
    const b = await ev(() => { const L = window.__ironlog; const x = L.state.draft.ex[0]; return { sw: x.sw, hint: x.hint || '' }; });
    ok(Math.round(b.sw / LB * 1000) / 1000 === 100 && /at 93\.7 lb hit \d+: add 6\.3 lb/.test(b.hint), 'bench logged at 42.5 kg, every set at the top, now shown in lb: the next load is 100 lb, on the 5 lb step, and the words add 6.3 lb to the 93.7 shown (r52: 98.7 lb, "add 5 lb")', { lb: b.sw / LB, hint: b.hint });
    // Incline dumbbell press at 12.5 kg for 11, 10 and 10, short of the top: a target of reps, at 25 lb dumbbells, not 30.
    await log([ses('d1', '2026-10-08', 'incDb', [8, 12], [[12.5, 11], [12.5, 10], [12.5, 10]])], { unit: 'lb' });
    const d = await ev(() => { const L = window.__ironlog; return L.suggest('incDb', { ...L.planFor('incDb'), repMin: 8, repMax: 12 }, {}); });
    ok(Math.round(d.w / LB * 1000) / 1000 === 25 && d.tgt && d.tgt.kind === 'reps' && /at 25 lb per dumbbell/.test(d.text), 'incline dumbbell press logged at 12.5 kg (27.6 lb) for 11, 10 and 10, shown in lb: the reps to beat are at 25 lb dumbbells, not 30 (r52: 30 lb, 9% heavier, the same reps)', { lb: d.w / LB, text: d.text });
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
  }

  // ---- The RPE scale: 40 kg for 8 at 4 in reserve (RPE 6) against a target of 1 in reserve (RPE 9).
  {
    await log([ses('e1', '2026-10-08', 'bench', [6, 10], [[40, 8, 4], [40, 8, 4], [40, 8, 4]])], { unit: 'kg', rirScale: 'rpe' });
    const r = await ev(() => { const L = window.__ironlog; const p = { ...L.planFor('bench'), repMin: 6, repMax: 10, rir: 1 }; const s = L.suggest('bench', p, {}); const b = { hint: s.text, last: s.last, basis: s.basis }; return { text: s.text, why: L.whyTarget(b) }; });
    ok(/RPE 6 at 40 kg against a target of RPE 9/.test(r.text) && !/RIR/.test(r.why), 'on the RPE scale, an easy set\'s reason says RPE 6 against a target of RPE 9, and Why this target says no RIR (r52: "RIR 4 ... a target of 1")', r);
    await log([ses('e1', '2026-10-08', 'bench', [6, 10], [[40, 8, 4], [40, 8, 4], [40, 8, 4]])], { unit: 'kg', rirScale: undefined });
    const w = await ev(() => { const L = window.__ironlog; return L.suggest('bench', { ...L.planFor('bench'), repMin: 6, repMax: 10, rir: 1 }, {}).text; });
    ok(/RIR 4 at 40 kg against a target of 1, so that load was light/.test(w), 'in whole reps in reserve the words are as before', w);
  }

  ok(!P.errors.length, 'no page errors', P.errors);
  await P.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
