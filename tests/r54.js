// r54, the fixes from the whole-app audit V asked for on 2026-10-18 ("Instead
// of assuming nothing has changed vs prior release"; PENDING 315): a simulated
// lifter took four journeys through the app as shipped in r52 and found these,
// each present since earlier builds and still in r53. This suite drives the
// app's own flows on the real starter routine, and each case fails on r53
// (`node tests/r54.js baselines/r53.html`):
//   - dumbbells in kg with Your gym not set: a first session's adjustment
//     after 6 kg done easily is 8 kg, a dumbbell every kg rack has, not 8.5;
//   - dumbbells in lb with Your gym not set are read on a 5 lb rack (2.5 lb
//     where the weights are on it), never 1 lb: 12 lb steps to 15, 8 to 10;
//     and a Lighter day or deload on the lightest dumbbells keeps them;
//   - a log kept in kg read in lb: a load converted from the other unit is
//     put on the nearest 5 lb step, never under the bar or at nothing, and the
//     words add up to the load shown; a target of reps put on a heavier step
//     becomes that load for the bottom of the range in every set;
//   - on the RPE scale the reason behind a target says RPE, not RIR;
//   - one reading of a lighter week for Stats, the weekly averages and the
//     deload suggestion: a week off holds the suggestion back, a short week
//     is not named lighter, and a deload begun mid-week leaves the averages;
//   - the log's first week, while loads are found, is left out of the
//     averages, and the coach and the radar say so;
//   - "add sets" only when the plan itself is short of a target;
//   - how long a lift has stalled is the stall test's own stretch;
//   - an every-other-day routine counts 3 sessions as a week on plan;
//   - Build my own routine plans three days a week, with rest days;
//   - a past workout in a week marked as a deload is a normal day;
//   - History names a deload once.
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

  // ---- Dumbbells in lb with Your gym not set are read on a 5 lb rack, 2.5 lb where the weights are on it, never 1 lb (V's call of
  // 2026-10-18 after the review of r54: 12 lb went up to 13). A weight off the rack steps to its next one: 12 lb to 15, 8 to 10.
  {
    const next = [];
    for (const load of ['12', '8']) {
      await log([], { unit: 'lb' });
      await startWith('inclineCurl');
      const ws = '.sg input[data-f="w"][data-b="0"][data-s="0"]', rs = '.sg input[data-f="r"][data-b="0"][data-s="0"]';
      await page.fill(ws, load); await page.dispatchEvent(ws, 'input'); await page.dispatchEvent(ws, 'change');
      await page.fill(rs, '15'); await page.dispatchEvent(rs, 'input'); await page.dispatchEvent(rs, 'change');
      if (!(await ev(() => window.__ironlog.state.draft.ex[0].sets[0].done))) await page.click('[data-act="sDone"][data-b="0"][data-s="0"]');
      await ev(() => window.__ironlog.ACT.rirPick({ dataset: { b: '0', s: '0', v: '5' } })); await wait(150);
      next.push(await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; return { lb: Math.round(L.effW(b, 1) / 0.45359237 * 100) / 100, adj: ((document.getElementById('adj-0') || {}).innerText || '').replace(/\s+/g, ' ') }; }));
      await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
    }
    ok(next[0].lb === 15 && /^Next sets: 15 lb per dumbbell/.test(next[0].adj) && next[1].lb === 10, 'incline dumbbell curls in lb, never done, Your gym not set: after 12 lb for 15 at 5 in reserve the next sets are 15 lb, and after 8 lb, 10 (r53: 17 and 13, five pounds on from a weight off the rack; r54 before V\'s call: 13 and 9, a 1 lb rack)', next);
    // Between sessions, the same rack: a step from 12 or 17 lb is to the rack's next weight, from 12.5 a 2.5 lb step, and a drop from 12 to 10.
    const lbS = (id, exId, rr, sets) => ses(id, '2026-10-08', exId, rr, sets.map(([w, r, rir]) => [w * LB, r, rir]));
    const sg = async (sessions, exId, rr, opts) => { await log(sessions, { unit: 'lb' }); return ev(([exId, rr, opts]) => { const L = window.__ironlog; const s = L.suggest(exId, { ...L.planFor(exId), repMin: rr[0], repMax: rr[1] }, opts); return { lb: s.w == null ? null : Math.round(s.w / 0.45359237 * 100) / 100, text: s.text }; }, [exId, rr, opts || {}]); };
    const easy = await sg([lbS('e', 'dbCurl', [8, 12], [[12, 10, 5], [12, 10, 5], [12, 10, 5]])], 'dbCurl', [8, 12]);
    const top12 = await sg([lbS('t', 'dbCurl', [8, 12], [[12, 12], [12, 12], [12, 12]])], 'dbCurl', [8, 12]);
    const top17 = await sg([lbS('u', 'dbCurl', [8, 12], [[17, 12], [17, 12], [17, 12]])], 'dbCurl', [8, 12]);
    const half = await sg([lbS('h', 'dbCurl', [8, 12], [[12.5, 12], [12.5, 12], [12.5, 12]])], 'dbCurl', [8, 12]);
    const light = await sg([lbS('l', 'dbCurl', [8, 12], [[12, 10], [12, 10], [12, 10]])], 'dbCurl', [8, 12], { light: true });
    const r = { easy, top12, top17, half, light };
    ok(easy.lb === 15 && /The next step, 3 lb,/.test(top12.text) && /The next step, 3 lb,/.test(top17.text) && /The next step, 2\.5 lb,/.test(half.text) && light.lb === 10, 'dumbbell curls in lb between sessions: 12 lb done easily goes to 15, the next step from 12 or 17 lb is 3 lb, to the rack\'s next weight, from 12.5 lb it is 2.5, and a Lighter day from 12 is 10 (r53: 13 lb, and steps of 1 lb)', r);
    // The lightest dumbbells: a Lighter day or a deload keeps them, as nothing on the rack is lighter.
    const five = await sg([lbS('f', 'dbLateral', [12, 15], [[5, 13], [5, 13], [5, 13]])], 'dbLateral', [12, 15], { light: true });
    await log([ses('k2', '2026-10-08', 'dbLateral', [12, 15], [[2, 13], [2, 13], [2, 13]])], { unit: 'kg' });
    const two = await ev(() => { const L = window.__ironlog; return L.suggest('dbLateral', { ...L.planFor('dbLateral'), repMin: 12, repMax: 15 }, { deload: true }).w; });
    ok(five.lb === 5 && Math.abs(two - 2) < 1e-9 && /about 5 lb per dumbbell/.test(five.text), 'a Lighter day on 5 lb lateral raises and a deload on 2 kg ones keep the lightest dumbbell, with the reps in reserve making them lighter (r53: about 0 lb, and 0 kg)', { five, two });
    // Your gym listing every pound to 15: the gym's own rack, as before.
    await log([lbS('g', 'dbCurl', [8, 12], [[12, 12], [12, 12], [12, 12]])], { unit: 'lb' });
    const gym = await ev(() => { const L = window.__ironlog; L.state.settings.gym = { u: 'lb', db: { lo: 5, hi: 50, st: 5, fine: 1, fineTo: 15 } }; L.invalidate(); const s = L.suggest('dbCurl', { ...L.planFor('dbCurl'), repMin: 8, repMax: 12 }, {}); delete L.state.settings.gym; L.invalidate(); return Math.round(s.w / 0.45359237 * 100) / 100; });
    ok(gym === 13, 'with Your gym listing 12, 13, 14 and 15 lb dumbbells, 12 lb at the top of the range goes to 13, the gym\'s next bell', gym);
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
    ok(Math.round(d.w / LB * 1000) / 1000 === 30 && d.tgt && d.tgt.kind === 'load' && d.tgt.repMin === 8 && /30 lb per dumbbell is the nearest load in lb to what you did: aim for 8\+ reps in every set/.test(d.text), 'incline dumbbell press logged at 12.5 kg (27.6 lb) for 11, 10 and 10, shown in lb: the nearest dumbbells, 30 lb, for 8+ reps in every set, not the same reps at a 9% heavier load (r52 and r53: beat 31 reps at 30 lb)', { lb: d.w / LB, text: d.text, tgt: d.tgt });
    // Light dumbbells and the empty bar logged in kg, read in lb (the review of r54's first fix, which rounded every target of reps down: 0 lb, 5 lb for 4 kg, and 40 lb on the 45 lb bar).
    const snaps = [];
    for (const [exId, kg, rr] of [['dbLateral', 2, [10, 20]], ['dbLateral', 4, [10, 20]], ['bench', 20, [6, 10]]]) {
      await log([ses('k' + kg, '2026-10-08', exId, rr, [[kg, rr[0] + 2], [kg, rr[0] + 2], [kg, rr[0] + 2]])], { unit: 'lb' });
      snaps.push(await ev(([exId, rr]) => { const L = window.__ironlog; const p = { ...L.planFor(exId), repMin: rr[0], repMax: rr[1] }; const n = L.suggest(exId, p, {}), l = L.suggest(exId, p, { light: true }); const LB = 0.45359237; return { exId, lb: Math.round(n.w / LB * 100) / 100, kind: n.tgt && n.tgt.kind, light: Math.round(l.w / LB * 100) / 100 }; }, [exId, rr]));
    }
    ok(JSON.stringify(snaps.map(x => [x.lb, x.kind])) === '[[5,"load"],[10,"load"],[45,"load"]]' && snaps[2].light === 45, 'logged in kg, read in lb: 2 kg dumbbells go to 5 lb and 4 kg to 10 lb, the nearest, each for the bottom of the range; the empty 20 kg bar goes to the 45 lb bar, a Lighter day too, never under it (r53: the same reps at 5, 10 and 45 lb, and 40 lb on a Lighter day)', snaps);
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

  // Sessions of several lifts: [exId, rep range, [[load, reps, reserve], ...]] each.
  const sesM = (id, date, exs, extra) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ...(extra || {}), ex: exs.map(([exId, rr, sets]) => ({ exId, rr, sets: sets.map(([w, r, rir]) => ({ w, r, rir: rir == null ? 1 : rir, done: true })) })) });
  const flat3 = () => [['bench', [6, 10], [[100, 8], [100, 8]]], ['backSquat', [6, 10], [[100, 8], [100, 8]]], ['rdl', [6, 10], [[100, 8], [100, 8]]]];
  const thursdays = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];
  const read = () => ev(() => { const L = window.__ironlog; L.invalidate(); const a = L.actualAvg4(); return { coach: L.coach().text, lw: L.lastLighterWeek(), light: a ? a._light : null, stalled: L.stalledIds().slice().sort() }; });

  // ---- One reading of a lighter week for Stats, the weekly averages and the deload suggestion (the audit V asked for, 2026-10-18).
  {
    // Bench, back squat and Romanian deadlift flat at 100 x 8, 8 on Thursdays, with nothing trained in the week of 28 September.
    await log(thursdays.filter(d => d !== '2026-10-01').map((d, i) => sesM('t' + i, d, flat3())), { unit: 'kg' });
    const off = await read();
    ok(JSON.stringify(off.stalled) === '["backSquat","bench","rdl"]' && off.lw && off.lw.weeks === 2 && off.lw.kind === 'off' && !/stalled at once/.test(off.coach), 'three main lifts flat for five weeks with a week off two weeks ago: Stats says the last lighter week was that week off, and the deload suggestion beside it waits, as it does after a rest week (r53: "A deload week may help" beside "Last lighter week: 2 weeks ago (a week off)")', off);
    // The same Thursdays, and in the week of 28 September one short session, the bench for one set: fewer sets, none done lighter.
    await log(thursdays.map((d, i) => sesM('t' + i, d, d === '2026-10-01' ? [['bench', [6, 10], [[100, 8]]]] : flat3())), { unit: 'kg' });
    const short = await read();
    ok(short.lw && short.lw.weeks === null && short.light === 0 && /^3 main lifts stalled at once/.test(short.coach), 'the same weeks with one short session in the week of 28 September: no lighter week on Stats, since the averages keep that week and the deload suggestion counts it as training (r53: "Last lighter week: 2 weeks ago (1 hard sets against your usual 6)", a week the averages kept)', short);
    // Four sessions a week to the week of 5 October, when Deload week was tapped on Wednesday: Monday and Tuesday as usual, Thursday and Friday deloads, half the sets at 90.
    const wk4 = (mon, tag) => [0, 1, 3, 4].map(k => { const d = new Date(Date.parse(mon + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10); const dl = tag && k >= 3; return sesM(mon + k, d, [['bench', [6, 10], dl ? [[90, 8, 3]] : [[100, 8], [100, 8]]]], dl ? { deload: true, dayName: 'Session (deload)' } : {}); });
    await log([...wk4('2026-08-24'), ...wk4('2026-08-31'), ...wk4('2026-09-07'), ...wk4('2026-09-14'), ...wk4('2026-09-21'), ...wk4('2026-09-28'), ...wk4('2026-10-05', true)], { unit: 'kg' });
    const mid = await ev(() => { const L = window.__ironlog; L.invalidate(); const a = L.actualAvg4(); return { chest: a && Math.round(a.chest * 10) / 10, light: a && a._light, label: L.regionSrc().label, lw: L.lastLighterWeek() }; });
    ok(mid.light === 1 && mid.chest === 8 && /a lighter week left out/.test(mid.label) && mid.lw && mid.lw.weeks === 1 && mid.lw.kind === 'lighter', 'a deload begun on Wednesday, done on Thursday and Friday: the weekly average leaves the week out, as the deload suggestion and Stats already read it, so the chest stays at its usual 8 hard sets a week (r53: 7.5, the deload averaged in)', mid);
  }

  // ---- The log's first week, while loads are found, is left out of the weekly averages (the audit V asked for).
  {
    // The starter routine, its targets fitted to it as a first-run pick does, then followed set for set from Monday 21 September,
    // except that in the first week each lift's first set ended 5 in reserve while its load was found.
    const built = await ev(() => {
      const L = window.__ironlog; const S = L.state; const R = L.activeRoutine();
      S.settings.bands = Object.fromEntries(Object.entries(L.BANDS).map(([m, b]) => [m, b.slice()])); L.fitTargets(R);
      const out = [];
      for (const [w, mon] of [[1, '2026-09-21'], [2, '2026-09-28'], [3, '2026-10-05']])
        R.days.forEach((day, i) => {
          if (day.rest || !day.items.length) return;
          const date = new Date(Date.parse(mon + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10);
          out.push({ id: 'w' + w + 'd' + i, date, dayIdx: i, dayId: day.id, dayName: day.name, routineId: R.id, notes: '', ex: day.items.map(it => ({ exId: it.exId, rr: [+it.repMin, +it.repMax], sets: Array.from({ length: +it.sets }, (_, k) => ({ w: 40, r: +it.repMin, rir: w === 1 && k === 0 ? 5 : +it.rir, done: true })) })) });
        });
      S.sessions = out; S.draft = null; L.state = L.normalize(S); L.invalidate(); L.saveNow();
      L.ui.tab = 'dash'; L.render();
      const vol = [...document.querySelectorAll('#dashSummary .srow')].map(e => e.textContent.replace(/\s+/g, ' ').trim()).find(t => /^Volume/.test(t)) || '';
      return { n: out.length, vol, coach: L.coach().text, label: L.regionSrc().label };
    });
    ok(built.n === 12 && /Every muscle at or above target/.test(built.vol) && !/Add /.test(built.coach) && built.label === 'the 2 full weeks after your first week', 'the starter routine followed set for set for three weeks, its first week finding loads: every muscle at or above target, no "add sets", and the radar says it uses the 2 full weeks after the first (r53: muscles below target from the first week\'s sets)', built);
    // The same routine with only its first week logged, the week of 5 October: no average yet, and the words say when one comes.
    const first = await ev(() => {
      const L = window.__ironlog; const S = L.state;
      S.sessions = S.sessions.filter(x => x.id.startsWith('w1')).map(x => ({ ...x, date: new Date(Date.parse(x.date + 'T12:00:00Z') + 14 * 864e5).toISOString().slice(0, 10) }));
      L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.render();
      const rs = L.regionSrc();
      return { avg: L.actualAvg4(), coach: L.coach().text, label: rs.label, old: !!rs.old };
    });
    ok(first.avg === null && first.coach === 'Volume advice appears here after your second week.' && /^your first week, to /.test(first.label) && !first.old, 'only the first week logged, the week just gone: no weekly average, the coach says advice comes after the second week, and the radar shows that first week as such, not as "nothing logged in the last 4 weeks" (r53: a 1-week average of the load-finding week)', first);
    // Every place that says why there is no average says the same week (the review of r54: "Finish a full week" beside "after your second week").
    const said = () => ev(() => {
      const L = window.__ironlog; const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
      L.ui.tab = 'dash'; L.ui.folds['dash:volume'] = true; L.ui.volMode = 'avg'; L.render();
      const rows = [...document.querySelectorAll('#dashSummary .srow')].map(txt);
      const recent = txt([...document.querySelectorAll('#view [data-mkey="volume"] p')].find(e => /Averaged over|An average/.test(e.textContent)));
      L.ui.volMode = 'trend'; L.ui.dashMuscle = 'chest'; L.render();
      const head = txt([...document.querySelectorAll('#view p.headline')].find(e => /^Chest\./.test(txt(e))));
      return { volume: rows.find(t => /^Volume/.test(t)) || '', change: rows.find(t => /^Change/.test(t)) || null, recent, head };
    });
    const w2 = await said();
    ok(/^VolumeVolume advice appears here after your second week\./.test(w2.volume) && w2.change === null && /^An average starts after your second week\./.test(w2.recent) && /Compare against it after your second week\./.test(w2.head), 'in the log\'s second week, Stats\' summary says once that volume advice comes after the second week, as the coach does, and Recent average and a muscle\'s headline say the same week (r53: "Finish a full week for a volume read" beside it, and "No sessions in the previous 4 full weeks")', w2);
    // The same first week three weeks back, with the week after it trained: the average is of one week, and Recent average says which.
    const w3 = await ev(() => { const L = window.__ironlog; const S = L.state; const R = L.activeRoutine(); const out = [];
      for (const [w, mon] of [[1, '2026-09-28'], [2, '2026-10-05']]) R.days.forEach((day, i) => { if (day.rest || !day.items.length) return; const date = new Date(Date.parse(mon + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10);
        out.push({ id: 'x' + w + 'd' + i, date, dayIdx: i, dayId: day.id, dayName: day.name, routineId: R.id, notes: '', ex: day.items.map(it => ({ exId: it.exId, rr: [+it.repMin, +it.repMax], sets: Array.from({ length: +it.sets }, () => ({ w: 40, r: +it.repMin, rir: +it.rir, done: true })) })) }); });
      S.sessions = out; L.state = L.normalize(S); L.invalidate(); L.saveNow(); return true; });
    const r3 = w3 && await said();
    ok(/^Averaged over the 1 full week after your first week\./.test(r3.recent), 'in its third week Recent average says it is the 1 full week after the first, as the radar does (r53: "the 1 week with training in the last 4")', r3);
  }

  // ---- "Add sets" only when the plan itself is short of the target (the audit V asked for).
  {
    // The starter routine with its fitted targets, its last set of every lift left out in the weeks of 28 September and 5 October.
    const r = await ev(() => {
      const L = window.__ironlog; const S = L.state; const R = L.activeRoutine();
      const out = [];
      // The loads go up 2.5 kg a week, so the lifts are moving, not stalled.
      ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05'].forEach((mon, wi) =>
        R.days.forEach((day, i) => {
          if (day.rest || !day.items.length) return;
          const date = new Date(Date.parse(mon + 'T12:00:00Z') + i * 864e5).toISOString().slice(0, 10);
          const skip = mon >= '2026-09-28';
          out.push({ id: mon + 'd' + i, date, dayIdx: i, dayId: day.id, dayName: day.name, routineId: R.id, notes: '', ex: day.items.map(it => ({ exId: it.exId, rr: [+it.repMin, +it.repMax], sets: Array.from({ length: +it.sets - (skip ? 1 : 0) }, () => ({ w: 40 + 2.5 * wi, r: +it.repMin, rir: +it.rir, done: true })) })) });
        }));
      S.sessions = out; S.draft = null; L.state = L.normalize(S); L.invalidate(); L.saveNow();
      return L.coach().text;
    });
    ok(/: do every planned set, to 3 or fewer reps in reserve\./.test(r) && !/Add \d+ sets? a week/.test(r), 'a plan that reaches every target, with planned sets skipped: the coach says to do every planned set, not to add sets (r53: "Add a set a week to" a lift the plan already has enough of)', r);
    // The same on the RPE scale: the line says the effort as RPE, as the engine's reasons do since r54.
    const rp = await ev(() => { const L = window.__ironlog; L.state.settings.rirScale = 'rpe'; L.invalidate(); const c = L.coach(); L.state.settings.rirScale = undefined; L.invalidate(); return { text: c.text, why: c.why || '' }; });
    ok(/: do every planned set, to RPE 7 or harder\./.test(rp.text) && /counts as hard at RPE 7 or harder, so a planned set skipped, or ended at RPE 6 or easier/.test(rp.why) && !/reps in reserve/.test(rp.text + rp.why), 'on the RPE scale that line and its tip say RPE 7 or harder, not reps in reserve', rp);
  }

  // ---- How long a lift has stalled, from the stall's own stretch (the audit V asked for: "3 weeks" was said of a lift flat for ten).
  {
    const ten = ['2026-08-06', '2026-08-13', '2026-08-20', '2026-08-27', ...thursdays];
    await log(ten.map((d, i) => sesM('s' + i, d, [['bench', [6, 10], [[100, 8], [100, 8]]]])), { unit: 'kg' });
    const h = await ev(() => { const L = window.__ironlog; L.invalidate(); const t = document.createElement('div'); t.innerHTML = L.exHeadline('bench'); return { text: t.innerText.replace(/\s+/g, ' '), tip: (t.querySelector('[data-tip]') || { dataset: {} }).dataset.tip || '', stalled: L.stalledIds() }; });
    ok(h.stalled.includes('bench') && /Stalled over the last 5 weeks\. Try another rep range or a variation\./.test(h.text) && /over its last 6 sessions in this rep range/.test(h.tip), 'a bench press flat at 100 x 8, 8 for ten Thursdays: its headline on Stats says it stalled over the last 5 weeks, the stretch the stall test read, and its tip gives the rule (r53: "Stalled for 3 weeks")', h);
    // Machine curls, on no day of the routine, at 30 kg for 15, 15, 15, the top of a 10 to 15 range, for ten Thursdays: the coach's line says the same span.
    const mc = await ev(() => { const L = window.__ironlog; const R = L.activeRoutine(); return !R.days.some(d => d.items.some(i => i.exId === 'machCurl')) && L.state.exercises.some(e => e.id === 'machCurl'); });
    await log(ten.map((d, i) => sesM('l' + i, d, [['machCurl', [10, 15], [[30, 15], [30, 15], [30, 15]]]])), { unit: 'kg' });
    const c = await ev(() => { const L = window.__ironlog; const S = L.state; for (const m in S.settings.bands) S.settings.bands[m] = [0, S.settings.bands[m][1]]; L.invalidate(); return { text: L.coach().text, plan: L.planFor('machCurl').repMax }; });
    ok(mc && +c.plan === 15 && /is at the top of its range at 30 kg and has stalled over the last 5 weeks: it is due a step up/.test(c.text), 'machine curls at the top of their range for ten Thursdays: the coach says they stalled over the last 5 weeks, the stall test\'s stretch (r53: "for 3 weeks")', c);
  }

  // ---- An every-other-day routine counts 3 sessions as a week on plan (V's call, 2026-10-18, after the audit).
  {
    const r = await ev(() => {
      const L = window.__ironlog; const S = L.state; const R = L.routineFromTemplate('str5');
      S.routines.push(R); S.activeRoutineId = R.id; S.sessions = []; S.draft = null;
      // Every other day from Monday 14 September, the cycle followed in order: 4, 3, 4 and 3 sessions a week, and 2 so far this week.
      for (let k = 0, i = 0; k <= 30; k += 2, i++) { const di = (i % 2) * 2; const day = R.days[di]; const date = new Date(Date.parse('2026-09-14T12:00:00Z') + k * 864e5).toISOString().slice(0, 10); S.sessions.push({ id: 'e' + k, date, dayIdx: di, dayId: day.id, dayName: day.name, routineId: R.id, notes: '', ex: day.items.map(it => ({ exId: it.exId, rr: [+it.repMin, +it.repMax], sets: Array.from({ length: +it.sets }, () => ({ w: 60, r: +it.repMin, rir: 2, done: true })) })) }); }
      L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'dash'; L.ui.folds['dash:consistency'] = true; L.render();
      const w = L.weekStats();
      return { streak: L.weekStreak().weeks, adh: ((document.getElementById('adhLine') || {}).textContent || '').replace(/\s+/g, ' '), done: w.doneDays, plan: w.planDays };
    });
    ok(r.streak === 4 && /Adherence, previous 4 full weeks: 100% of planned sessions \(12\/12\)/.test(r.adh) && r.plan === 3 && r.done === 2, 'Strength 5 x 5, every other day, done exactly as the cycle runs: a 4-week streak, 100% adherence, and this week 2 of 3 (r53: weeks of 3 broke the streak, 93% adherence against 3.5 a week, 2 of 4)', r);
    // A slow cycle, one training day in nine (0.78 a week), still plans one a week: rounded down alone it would plan none and lose its ring.
    const slow = await ev(() => { const L = window.__ironlog; const S = L.state; const R = S.routines.find(r => r.id === S.activeRoutineId);
      const slowR = { id: 'slow9', name: 'Slow', schedule: 'cycle', days: Array.from({ length: 9 }, (_, i) => ({ id: 'sd' + i, name: i ? 'Rest' : 'Day', rest: !!i, items: i ? [] : R.days[0].items.slice(0, 1) })) };
      S.routines.push(slowR); S.activeRoutineId = 'slow9'; L.invalidate(); const w = L.weekStats(); L.ui.tab = 'today'; L.render();
      const out = { plan: w.planDays, ring: !!document.querySelector('.hero .ring') };
      S.activeRoutineId = R.id; S.routines = S.routines.filter(r => r.id !== 'slow9'); L.invalidate(); L.saveNow(); return out; });
    ok(slow.plan === 1 && slow.ring, 'a cycle of one training day in nine plans 1 a week and keeps its ring', slow);
  }

  // ---- A cycle whose weeks differ in their days (the review of r54): Strength 5 x 5, two days in turn on Monday,
  // Wednesday and Friday, has two A days one week and one the next, so chest gets 10 sets, then 5. Followed set for
  // set, a muscle under its minimum only by which days fell in the weeks averaged is on plan, everywhere it is read.
  {
    const mwf = (from, opts) => ev(([from, opts]) => {
      const L = window.__ironlog; const S = L.state;
      let R = S.routines.find(r => r.name === 'Strength, 5 x 5');
      if (!R) { R = L.routineFromTemplate('str5'); S.routines.push(R); }
      S.activeRoutineId = R.id; S.settings.todayStart = opts.free ? 'free' : undefined;
      S.settings.bands = Object.fromEntries(Object.entries(L.BANDS).map(([m, b]) => [m, b.slice()])); L.fitTargets(R);
      const tr = R.days.map((d, i) => i).filter(i => !R.days[i].rest);
      const out = []; let k = 0;
      // Monday, Wednesday and Friday from the given Monday to yesterday, the cycle in turn from A; opts.swap: the session
      // given trains the other day (and the cycle goes on from there); opts.cut: the session given does one bench set fewer.
      for (let t = Date.parse(from + 'T12:00:00Z'); ; t += 864e5) {
        const date = new Date(t).toISOString().slice(0, 10); if (date >= '2026-10-15') break;
        if (![1, 3, 5].includes(new Date(t).getUTCDay())) continue;
        let di = tr[(out.length ? (tr.indexOf(out[out.length - 1].dayIdx) + 1) : 0) % tr.length];
        if (opts.swap === k) di = tr[(tr.indexOf(di) + 1) % tr.length];
        const day = R.days[di];
        out.push({ id: 'c' + k, date, dayIdx: di, dayId: day.id, dayName: day.name, routineId: R.id, notes: '', ex: day.items.map(it => ({ exId: it.exId, rr: [+it.repMin, +it.repMax], sets: Array.from({ length: +it.sets - (opts.cut === k && it.exId === 'bench' ? 1 : 0) }, () => ({ w: 60 + 2.5 * k, r: +it.repMin, rir: +it.rir, done: true })) })) });
        k++;
      }
      S.sessions = out; S.draft = null; L.state = L.normalize(S); L.invalidate(); L.saveNow();
      const txt = el => el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
      const a = L.actualAvg4(); const st = L.muscleStatus(a);
      L.ui.tab = 'dash'; L.ui.folds['dash:volume'] = true; L.ui.folds['dash:weak'] = true; L.ui.volMode = 'region'; L.render();
      const vol = txt([...document.querySelectorAll('#dashSummary .srow')].find(e => /^Volume/.test(txt(e))));
      const radar = txt([...document.querySelectorAll('#view p.headline')].find(e => /region/i.test(e.textContent)));
      const flagged = [...document.querySelectorAll('#view .tag')].filter(e => e.textContent === 'Below target').length;
      L.ui.volMode = 'avg'; L.render();
      const row = [...document.querySelectorAll('#view .mrow')].find(e => /^Chest/.test(txt(e)));
      L.ui.tab = 'today'; L.ui.folds['today:map'] = true; L.ui.mapSrc = 'avg'; L.render();
      const legend = txt(document.querySelector('.bm-legend'));
      return { weeks: a && a._weeks, chest: a && Math.round(a.chest * 100) / 100, st: Object.fromEntries(['chest', 'upperBack', 'lats', 'sideDelts'].map(m => [m, st[m].st])), coach: L.coach().text, vol, radar, flagged, row: row ? row.querySelector('.fill').className : '', legend };
    }, [from, opts]);
    const three = await mwf('2026-09-14', {});
    ok(three.weeks === 3 && three.chest === 6.67 && three.st.chest === 'plan' && three.coach === 'Every muscle on plan, nothing stalled.' && /Every muscle on plan\./.test(three.vol) && three.radar === 'Every region on plan.' && three.flagged === 0 && /\bplan\b/.test(three.row) && /Below target 0/.test(three.legend) && /On plan 2/.test(three.legend), 'Strength 5 x 5 on Monday, Wednesday and Friday, every set done: over 3 weeks holding four A days, chest at 6.7 of 7 is on plan in the coach, the summary, Muscles, Volume, the radar and the map, not below target (r53 and r54 before this: "do every planned set" to a lifter doing every one)', three);
    const one = await mwf('2026-09-28', {});
    ok(one.weeks === 1 && one.chest === 5 && one.coach === 'Every muscle on plan, nothing stalled.' && one.flagged === 0, 'the same after one full week, a B, A, B week: chest at 5 of 7 is on plan, five muscles read nothing below target', one);
    const cut = await mwf('2026-09-14', { cut: 4 });
    ok(cut.st.chest === 'under' && cut.st.upperBack === 'plan' && /^Chest: 6\.3 hard sets a week, target 7-20\. Your plan has 7\.5: do every planned set/.test(cut.coach) && cut.flagged === 1, 'one bench set skipped on an A day in those weeks: chest is below target and the coach says to do every planned set, while upper back, every set done, stays on plan', cut);
    const swap = await mwf('2026-09-14', { swap: 6 });
    ok(swap.st.chest === 'under' && /^Chest: /.test(swap.coach), 'an A day due and B trained instead in those weeks: the A day\'s chest sets were due and not done, so chest reads below target', swap);
    const free = await mwf('2026-09-14', { free: true });
    ok(free.st.chest === 'under' && /^Chest: 6\.7 hard sets a week, target 7-20\. Add /.test(free.coach), 'the same log with Today starting a blank session: the plan is not what is followed, so chest reads below target as logged', free);
    await ev(() => { const L = window.__ironlog; const S = L.state; S.settings.todayStart = undefined; S.routines = S.routines.filter(r => r.name !== 'Strength, 5 x 5'); S.activeRoutineId = S.routines[0].id; S.sessions = []; S.draft = null; L.invalidate(); L.saveNow(); });
  }

  // ---- Build my own routine plans three days a week, with rest days between (the audit: three days and no rest planned 7 a week).
  {
    const r = await ev(() => {
      const L = window.__ironlog; const S = L.state; S.sessions = []; S.draft = null; L.saveNow();
      L.ACT.obOwn(); const R = L.activeRoutine();
      for (const d of R.days) if (!d.rest) d.items.push({ uid: 'u' + Math.random(), exId: 'bench', ...L.defPlan('bench') });
      L.invalidate(); L.saveNow();
      return { days: R.days.map(d => d.rest ? 'rest' : 'train').join(' '), plan: L.weekStats().planDays };
    });
    ok(r.days === 'train rest train rest train rest rest' && r.plan === 3, 'Build my own routine: three training days with rest days between, so a week plans 3 sessions once each day has an exercise (r53: three days and no rest, 7 a week)', r);
  }

  // ---- A past workout logged in a week marked as a deload is set up as a normal day (the audit: the mark does not say which day it began).
  {
    const R0 = await ev(() => { const L = window.__ironlog; const S = L.state; S.routines = S.routines.filter(r => r.id !== S.activeRoutineId || r.name !== 'My routine'); S.activeRoutineId = S.routines[0].id; S.sessions = []; S.draft = null; S.deloadWeek = '2026-10-12'; L.invalidate(); L.saveNow(); L.render(); const R = L.activeRoutine(); const i = R.days.findIndex(d => !d.rest && d.items.length); return { i, name: R.days[i].name, sets: R.days[i].items.map(x => +x.sets) }; });
    await ev(() => window.__ironlog.ACT.pastOpen({ dataset: { date: '2026-10-13' } }));
    await page.click(`[data-act="pastGo"][data-day="${R0.i}"]`); await wait(150);
    const d = await ev(() => { const x = window.__ironlog.state.draft; return { deload: x.deload, past: x.past, name: x.dayName, sets: x.ex.map(b => b.sets.length), note: x.notes }; });
    ok(d.past && d.deload === false && d.name === R0.name && JSON.stringify(d.sets) === JSON.stringify(R0.sets) && !d.note, 'Deload week tapped this week, then Tuesday logged as a past workout: it opens as the normal day, all its sets, not as a deload (r53: half the sets, marked deload)', { d, R0 });
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.state.deloadWeek = null; L.saveNow(); });
  }

  // ---- History names a deload once (the audit: "(deload) deload").
  {
    await log([sesM('h1', '2026-10-13', [['bench', [6, 10], [[90, 8, 3]]]], { deload: true, free: false, dayName: 'Upper A (deload)' })], { unit: 'kg' });
    const h = await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); const b = document.querySelector('.hitem .pick'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : ''; });
    ok(/^Upper A deload Tue, Oct 13\b/.test(h) && !/\(deload\)/.test(h), 'a deload session in History reads "Upper A" with its deload tag, not "Upper A (deload) deload"', h);
  }

  ok(!P.errors.length, 'no page errors', P.errors);
  await P.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
