// Customization (r27): what the user sets is what the numbers use. An
// independent audit found sixteen places where a custom routine, exercise or
// setting was ignored or read inconsistently; each fixed one has a case here,
// with the expected number worked out in this file, not read from the app.
//   1. the same lift on two days with different rep ranges progresses per day
//   2. grey reps follow a new load target instead of last time's reps
//   3. deloads, warm-ups and drop sets use the exercise's own step and the bar
//   4. the default load step follows the unit (2.5 kg, not 2.3)
//   5. a change to the load step, heaviest load or plan reaches the session
//   6. a swap gives the new exercise a plan that fits it
//   7. a lift no longer trained is not called stalled
//   8. compound or isolation can be set for a custom exercise
//   9. a range moved well below last time's reps jumps by the estimate
//  10. a muscle whose target starts at 0 is on target with no sets
//  11. planned hard sets count like logged ones, halved in a deload week
//  12. past weeks are scored against the routine they were logged on
//  13. a load step of 0 is a fixed load, never "add 0 lb"
//  14. Pick for me halves its sets in a deload or lighter session
//  15. warm-ups climb to the working load
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const LB = 0.45359237;
const near = (a, b, e) => a != null && b != null && Math.abs(a - b) < (e || 1e-6);

(async () => {
  const { browser, page, errors } = await open('index.html', { clock: '2026-10-02T12:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  // A fresh state with the given sessions and exercise changes, in lb or kg.
  await ev(() => {
    window.__reset = (unit, sessions, exMod, extra) => {
      const A = window.__ironlog; const s = A.normalize(null); s.settings.onboarded = true; s.settings.unit = unit || 'lb'; s.sessions = sessions || [];
      if (exMod) for (const e of s.exercises) if (exMod[e.id]) Object.assign(e, exMod[e.id]);
      if (extra) extra(s);
      A.state = A.normalize(s); A.invalidate(); try { localStorage.setItem('ironlog.v1.loadAsk', '1'); } catch (e) { /* no storage */ }
    };
    window.__sess = (date, exId, wKg, reps, o) => ({ id: 's' + date + exId + Math.random().toString(36).slice(2, 6), date, dayName: 'x', routineId: (o && o.rid) || '', dayId: (o && o.did) || '', deload: !!(o && o.deload), ex: [{ exId, rr: (o && o.rr) || null, cut: o && o.cut ? true : undefined, sets: reps.map(r => ({ w: wKg, r, rir: o && o.rir != null ? o.rir : 1, warm: false, drop: false })) }] });
  });

  // ---- 1. Bench on two days: Heavy 4-6 and Light 10-12.
  const r1 = await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('lb', [window.__sess('2026-09-21', 'bench', 225 * LB, [5, 5, 5, 5, 5], { rr: [4, 6] }), window.__sess('2026-09-24', 'bench', 165 * LB, [12, 12, 12], { rr: [10, 12] })]);
    const heavy = A.suggest('bench', { sets: 5, repMin: 4, repMax: 6, rir: 1, rest: 180, inc: 5 * LB });
    const light = A.suggest('bench', { sets: 3, repMin: 10, repMax: 12, rir: 1, rest: 120, inc: 5 * LB });
    const fresh = A.suggest('bench', { sets: 3, repMin: 6, repMax: 8, rir: 1, rest: 120, inc: 5 * LB });
    return { heavy: { w: heavy.w / LB, last: heavy.last, tgt: heavy.tgt }, light: { w: light.w / LB, last: light.last, tgt: light.tgt }, fresh: { last: fresh.last } };
  }, [LB]);
  ok(near(r1.heavy.w, 225) && /^Last \(Sep 21\)/.test(r1.heavy.last) && r1.heavy.tgt.kind === 'reps' && r1.heavy.tgt.total === 25, '1. the heavy day (4-6) reads its own last session: 225 lb, beat 25 reps', r1.heavy);
  ok(near(r1.light.w, 170) && /^Last \(Sep 24\)/.test(r1.light.last) && r1.light.tgt.kind === 'load', '1. the light day (10-12) reads its own: every set hit 12, so 165 + 5 = 170 lb', r1.light);
  ok(/^Last \(Sep 24\)/.test(r1.fresh.last), '1. a range not logged yet starts from the newest session', r1.fresh);
  // Back to a range last used months ago: the newest session decides, not the old one (review, r27).
  const r1b = await ev(([LB]) => {
    const A = window.__ironlog; const ss = [window.__sess('2026-01-05', 'bench', 100 * LB, [12, 12, 12], { rr: [8, 12] })];
    for (let k = 0; k < 20; k++) ss.push(window.__sess(new Date(Date.UTC(2026, 4, 1 + 7 * k)).toISOString().slice(0, 10), 'bench', (110 + 2.5 * k) * LB, [6, 6, 6], { rr: [5, 8] }));
    window.__reset('lb', ss);
    const sg = A.suggest('bench', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 120, inc: 5 * LB });
    return { w: sg.w / LB, last: sg.last };
  }, [LB]);
  ok(r1b.w > 140 && !/Jan 5/.test(r1b.last), '1. back on 8-12 after months on 5-8: the target follows the newest sessions (157.5 lb), not 100 lb from January', r1b);

  // ---- 2. Grey reps after a load target.
  const r2 = await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('lb', [window.__sess('2026-09-28', 'bench', 185 * LB, [10, 10, 10, 10], { rr: [6, 10] })]);
    const up = A.newBlock('bench', { sets: 4, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB }, {});
    window.__reset('lb', [window.__sess('2026-09-28', 'bench', 185 * LB, [8, 8, 7], { rr: [6, 10] })]);
    const same = A.newBlock('bench', { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB }, {});
    return { up: { tgt: up.tgt.kind, w: up.tgt.w / LB, grey: up.sets.map((x, i) => A.greyR(up, i)) }, same: { tgt: same.tgt.kind, grey: same.sets.map((x, i) => A.greyR(same, i)) } };
  }, [LB]);
  ok(r2.up.tgt === 'load' && near(r2.up.w, 190) && r2.up.grey.every(v => v === 6), '2. after an earned increase to 190 lb, every grey reps number is 6 (the target), not last time\'s 10', r2.up);
  ok(r2.same.tgt === 'reps' && JSON.stringify(r2.same.grey) === '[8,8,7]', '2. at the same load, grey reps are still last time\'s, set by set', r2.same);
  // Through the screen: ticking an untyped set after an increase logs 6, not 10.
  await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('lb', [window.__sess('2026-09-28', 'bench', 185 * LB, [10, 10, 10], { rr: [6, 10] })], null, s => { const R = s.routines[0]; R.days[0].items = [{ uid: 'b1', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 0, inc: 5 * LB, ss: null }]; });
    A.ui.tab = 'today'; A.ui.todayDay = 0; A.render(); A.ACT.startSession({ dataset: { day: '0' } });
  }, [LB]);
  await page.waitForTimeout(100);
  await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await page.waitForTimeout(80);
  const t2 = await ev(([LB]) => { const s = window.__ironlog.state.draft.ex[0].sets[0]; return { r: s.r, w: s.w / LB, done: s.done }; }, [LB]);
  ok(t2.done && t2.r === 6 && near(t2.w, 190), '2. on screen: ticking the first set untyped logs 190 lb x 6', t2);
  await ev(() => { const A = window.__ironlog; A.state.draft = null; A.render(); });

  // ---- 3. Deloads, warm-ups and drops on the exercise's own step and the bar.
  const r3 = await ev(([LB]) => {
    const A = window.__ironlog; const out = {};
    const dl = (unit, exId, wKg, reps, mod, plan) => { window.__reset(unit, [window.__sess('2026-09-28', exId, wKg, reps)], mod); return A.suggest(exId, plan, { deload: true }).w; };
    const P = (a, b, inc) => ({ sets: 3, repMin: a, repMax: b, rir: 1, rest: 60, inc: inc == null ? 5 * LB : inc });
    out.cable = dl('lb', 'cableLateral', 15 * LB, [12, 12, 12], { cableLateral: { inc: 2.5 * LB } }, P(10, 20)) / LB;
    out.stack = dl('lb', 'legExt', 150 * LB, [12, 12, 12], { legExt: { inc: 10 * LB } }, P(10, 15)) / LB;
    out.db10 = dl('lb', 'dbLateral', 10 * LB, [15, 15, 15], { dbLateral: { inc: 2.5 * LB } }, P(10, 20)) / LB;
    out.db5 = dl('lb', 'dbLateral', 5 * LB, [15, 15, 15], { dbLateral: { inc: 2.5 * LB } }, P(10, 20)) / LB;
    out.kg = dl('kg', 'legExt', 21, [12, 12, 12], { legExt: { inc: 1 } }, P(10, 15, 1));
    out.bar = dl('lb', 'bench', 45 * LB, [10, 10, 10], null, P(6, 10)) / LB;
    out.bench = dl('lb', 'bench', 225 * LB, [8, 8, 8], null, P(6, 10)) / LB;
    // Warm-ups and a drop through the session's own actions.
    const wu = (unit, exId, wKg, mod, n) => {
      window.__reset(unit, [], mod, s => { const R = s.routines[0]; R.days[0].items = [{ uid: 'w1', exId, sets: 2, repMin: 6, repMax: 10, rir: 1, rest: 0, inc: unit === 'kg' ? 2.5 : 5 * LB, ss: null }]; });
      A.ui.tab = 'today'; A.ui.todayDay = 0; A.render(); A.ACT.startSession({ dataset: { day: '0' } });
      const b = A.state.draft.ex[0]; b.sets.forEach(x => { x.w = wKg; });
      for (let k = 0; k < n; k++) A.ACT.wAdd({ dataset: { b: '0' } });
      A.ACT.dropAdd({ dataset: { b: '0' } });
      const r = A.state.draft.ex[0].sets.map(x => ({ w: x.w, warm: x.warm, drop: x.drop }));
      A.state.draft = null; return r;
    };
    out.wBench = wu('lb', 'bench', 95 * LB, null, 1).filter(x => x.warm).map(x => x.w / LB);
    out.wBenchKg = wu('kg', 'bench', 40, null, 1).filter(x => x.warm).map(x => x.w);
    const st = wu('lb', 'legExt', 150 * LB, { legExt: { inc: 10 * LB } }, 3);
    out.wStack = st.filter(x => x.warm).map(x => x.w / LB); out.dStack = st.filter(x => x.drop).map(x => x.w / LB);
    out.firstWarmBeforeWork = st[0].warm && st[1].warm && st[2].warm && !st[3].warm;
    return out;
  }, [LB]);
  ok(near(r3.cable, 12.5), '3. deload, cable with a 2.5 lb step at 15 lb: 12.5 lb (was 10)', r3.cable);
  ok(near(r3.stack, 130), '3. deload, stack with 10 lb pins at 150: 130 lb, a real pin (was 135)', r3.stack);
  ok(near(r3.db10, 7.5) && near(r3.db5, 2.5), '3. deload, 2.5 lb dumbbell steps: 10 lb to 7.5, and 5 lb to 2.5 (was 5, no change)', [r3.db10, r3.db5]);
  ok(near(r3.kg, 18), '3. deload in kg with a 1 kg step at 21 kg: 18 kg (was 17.5)', r3.kg);
  ok(near(r3.bar, 45) && near(r3.bench, 200), '3. deload never goes under the empty bar (45 stays 45); 225 lb bench still goes to 200', [r3.bar, r3.bench]);
  ok(r3.wBench.every(w => w >= 45 - 1e-6) && r3.wBenchKg.every(w => w >= 20 - 1e-6), '3. warm-ups are never under the bar (95 lb bench, 40 kg bench)', [r3.wBench, r3.wBenchKg]);
  ok(JSON.stringify(r3.wStack.map(w => Math.round(w * 100) / 100)) === '[60,90,110]' && JSON.stringify(r3.dStack.map(w => Math.round(w * 100) / 100)) === '[110]', '3. a 10 lb pin stack at 150: warm-ups 60, 90, 110 and a drop at 110, all on pins', [r3.wStack, r3.dStack]);
  // EZ and fixed bars are lighter than the bar weight setting; per-side numbers have no bar in them (review, r27).
  const r3b = await ev(([LB]) => {
    const A = window.__ironlog; const out = {};
    const dl = (exId, wKg, mod) => { window.__reset('lb', [window.__sess('2026-09-28', exId, wKg, [10, 10, 10])], mod); return A.suggest(exId, { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 60, inc: 5 * LB }, { deload: true }).w / LB; };
    out.ez = dl('ezCurl', 40 * LB); out.wrist = dl('wristCurl', 30 * LB); out.side = dl('bench', 45 * LB, { bench: { load: 'side' } });
    window.__reset('lb', [], null, s => { const R = s.routines[0]; R.days[0].items = [{ uid: 'w1', exId: 'bbCurl', sets: 2, repMin: 8, repMax: 12, rir: 1, rest: 0, inc: 5 * LB, ss: null }]; });
    A.ui.tab = 'today'; A.ui.todayDay = 0; A.render(); A.ACT.startSession({ dataset: { day: '0' } });
    A.state.draft.ex[0].sets.forEach(x => { x.w = 50 * LB; }); for (let k = 0; k < 3; k++) A.ACT.wAdd({ dataset: { b: '0' } });
    out.curlWarm = A.state.draft.ex[0].sets.filter(x => x.warm).map(x => Math.round(x.w / LB * 100) / 100); A.state.draft = null;
    return out;
  }, [LB]);
  ok(near(r3b.ez, 35) && near(r3b.wrist, 25), '3. curls on an EZ or fixed bar deload below 45 lb (40 to 35, 30 to 25)', r3b);
  ok(near(r3b.side, 40), '3. a load typed per side has no bar floor (45 per side deloads to 40)', r3b.side);
  ok(JSON.stringify(r3b.curlWarm) === '[20,30,35]', '3. a 50 lb barbell curl warms up at 20, 30, 35, not 45, 45, 45', r3b.curlWarm);
  // ---- 15. Warm-ups climb.
  ok(r3.firstWarmBeforeWork && r3.wStack[0] < r3.wStack[1] && r3.wStack[1] < r3.wStack[2], '15. three warm-ups sit above the working sets, lightest first', r3.wStack);

  // ---- 4. The default step in kg.
  const r4 = await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('kg', [window.__sess('2026-09-28', 'bench', 60, [10, 10, 10], { rr: [6, 10] })]);
    const tpl = A.routineFromTemplate('ul4'); const it = tpl.days[0].items.find(i => i.exId === 'bench') || tpl.days.flatMap(d => d.items).find(i => i.exId === 'bench');
    const sg = A.suggest('bench', { ...it, repMin: 6, repMax: 10 });
    const lbStep = A.incOf(A.EX('bench'), { inc: 5 * LB });
    window.__reset('lb', []);
    const lbBack = A.incOf(A.EX('bench'), { inc: 2.5 }) / LB;
    return { item: it && it.inc, step: lbStep, w: sg.w, text: sg.text, lbBack };
  }, [LB]);
  ok(near(r4.step, 2.5) && near(r4.w, 62.5) && /add 2\.5 kg/.test(r4.text), '4. in kg the default step reads 2.5 kg: 60 kg x 10 x 3 goes to 62.5 kg ("add 2.5 kg", was 2.3)', r4);
  ok(near(r4.lbBack, 5), '4. and the kg default reads as 5 lb in lb', r4.lbBack);
  const r4b = await ev(([LB]) => { const A = window.__ironlog; window.__reset('kg', [], { bench: { inc: 5 * LB } }); A.ACT.exEdit({ dataset: { ex: 'bench' } }); const v = A.ui.modal.e.incRaw; A.ACT.mClose(); return v; }, [LB]);
  ok(r4b === '2.5', '4. the exercise editor shows the step in use (2.5 kg), so saving it never stores 2.3', r4b);

  // ---- 5. Changes reach the session in progress.
  const r5 = await ev(([LB]) => {
    const A = window.__ironlog; const out = {};
    window.__reset('lb', [window.__sess('2026-09-28', 'bench', 185 * LB, [10, 10, 10], { rr: [6, 10] }), window.__sess('2026-09-28', 'rdl', 135 * LB, [10, 10, 10], { rr: [6, 10] })], null, s => { const R = s.routines[0]; R.days[0].items = [{ uid: 'b1', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 0, inc: 5 * LB, ss: null }, { uid: 'r1', exId: 'rdl', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 0, inc: 5 * LB, ss: null }]; });
    A.ui.tab = 'today'; A.ui.todayDay = 0; A.render(); A.ACT.startSession({ dataset: { day: '0' } });
    const d = A.state.draft; out.before = d.ex[0].tgt.w / LB;
    // The session's load step sheet.
    A.ACT.bInc({ dataset: { b: '0' } }); document.getElementById('incVal').value = '10'; A.ACT.incSave();
    out.afterStep = A.state.draft.ex[0].tgt.w / LB;
    // A set done on the second lift, then its rep range changed in Plan: it keeps its plan.
    const b2 = A.state.draft.ex[1]; b2.sets[0].r = 10; b2.sets[0].w = 140 * LB; b2.sets[0].done = true;
    return out;
  }, [LB]);
  ok(near(r5.before, 190) && near(r5.afterStep, 195), '5. a new load step (10 lb) set in the session moves its target at once: 190 to 195 lb', r5);
  // A rep range edited in Plan mid-session: the untouched exercise follows, the started one does not.
  await ev(() => { const A = window.__ironlog; A.ui.tab = 'program'; A.render(); });
  const planEdit = await ev(() => {
    const A = window.__ironlog; const set = (uid, k, v) => { A.ui.openItem = uid; A.render(); const el = document.querySelector(`[data-it="${k}"][data-uid="${uid}"]`); if (!el) return false; el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true; };
    const okB = set('b1', 'repMin', 12) && set('b1', 'repMax', 15); const okR = set('r1', 'repMin', 12);
    const d = A.state.draft; return { okB, okR, b: [d.ex[0].plan.repMin, d.ex[0].plan.repMax, d.ex[0].tgt && d.ex[0].tgt.repMin], r: [d.ex[1].plan.repMin] };
  });
  ok(planEdit.okB && JSON.stringify(planEdit.b.slice(0, 2)) === '[12,15]' && planEdit.b[2] === 12, '5. a rep range edited in Plan reaches the exercise not started yet (12-15)', planEdit);
  ok(planEdit.okR && planEdit.r[0] === 6, '5. an exercise with a set done keeps the range it started with', planEdit);
  await ev(() => { const A = window.__ironlog; A.state.draft = null; A.ui.tab = 'today'; A.render(); });

  // ---- 6. Swaps.
  const r6 = await ev(([LB]) => {
    const A = window.__ironlog; const out = {};
    window.__reset('lb', [], null, s => { const R = s.routines[0]; R.days[0].items = [{ uid: 'p1', exId: 'plank', sets: 3, repMin: 30, repMax: 60, rir: 1, rest: 60, inc: 5 * LB, ss: null }, { uid: 'b1', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 150, inc: 5 * LB, ss: null }]; R.days[1].items = [{ uid: 'c1', exId: 'cableCrunch', sets: 3, repMin: 10, repMax: 15, rir: 1, rest: 60, inc: 5 * LB, ss: null }]; });
    const R = A.state.routines[0];
    out.toRoutine = A.swapPlan(R.days[0].items[0], 'plank', 'cableCrunch', R);
    out.toTimed = A.swapPlan(R.days[0].items[1], 'bench', 'plank', R);
    out.sameKind = A.swapPlan(R.days[0].items[1], 'bench', 'dbBench', R);
    return out;
  }, [LB]);
  ok(r6.toRoutine.repMin === 10 && r6.toRoutine.repMax === 15 && r6.toRoutine.sets === 3, '6. a plank swapped for Cable Crunch takes Cable Crunch\'s plan from the routine (10-15), keeps 3 sets', r6.toRoutine);
  ok(r6.toTimed.repMin === 30 && r6.toTimed.repMax === 60, '6. bench swapped for a plank holds 30-60 s, not 6-10 s', r6.toTimed);
  ok(r6.sameKind.repMin === 6 && r6.sameKind.repMax === 10 && r6.sameKind.rest === 150, '6. bench swapped for DB bench (not in the routine) fills the same slot: 6-10, 150 s', r6.sameKind);

  // ---- 7. Stalls expire.
  const r7 = await ev(([LB]) => {
    const A = window.__ironlog; const ss = [];
    const flat = (exId, start) => { for (let k = 0; k < 6; k++) ss.push(window.__sess(new Date(Date.UTC(2025, 0, 6 + 7 * k)).toISOString().slice(0, 10), exId, 100 * LB, [8, 8, 8], { rr: [6, 10] })); };
    flat('smithInc'); flat('frontSquat');
    for (let k = 0; k < 6; k++) ss.push(window.__sess(new Date(Date.UTC(2026, 7, 17 + 7 * k)).toISOString().slice(0, 10), 'bench', (150 + 5 * k) * LB, [8, 8, 8], { rr: [6, 10] }));
    for (let k = 0; k < 6; k++) ss.push(window.__sess(new Date(Date.UTC(2026, 7, 18 + 7 * k)).toISOString().slice(0, 10), 'rdl', 135 * LB, [8, 8, 8], { rr: [6, 10] }));
    window.__reset('lb', ss);
    return A.stalledIds();
  }, [LB]);
  ok(!r7.includes('smithInc') && !r7.includes('frontSquat') && !r7.includes('bench'), '7. lifts last done in 2025 are not called stalled, and a rising one is not', r7);
  ok(r7.includes('rdl'), '7. a lift trained flat for the last 6 weeks still is', r7);
  const r7b = await ev(([LB]) => { const A = window.__ironlog; const ss = []; for (let k = 0; k < 6; k++) ss.push(window.__sess(new Date(Date.UTC(2026, 4, 4 + 7 * k)).toISOString().slice(0, 10), 'rdl', 135 * LB, [8, 8, 8], { rr: [6, 10] })); window.__reset('lb', ss); return A.stalledIds(); }, [LB]);
  ok(!r7b.length, '7. after a three-month break nothing is called stalled', r7b);

  // ---- 8. Compound or isolation for a custom exercise.
  const r8 = await ev(([LB]) => {
    const A = window.__ironlog;
    const ex = { id: 'hsChest', name: 'Hammer Strength Chest', primary: 'chest', secondary: ['triceps'], equip: 'machine', custom: true };
    window.__reset('lb', [], null, s => { s.exercises.push({ ...ex }); });
    const auto = A.isCompound(A.EX('hsChest'));
    const autoStep = A.progStep(A.EX('hsChest'), { inc: 5 * LB }, 200 * LB) / LB;
    window.__reset('lb', [], null, s => { s.exercises.push({ ...ex, kind: 'compound' }); });
    const set = A.isCompound(A.EX('hsChest')); const setStep = A.progStep(A.EX('hsChest'), { inc: 5 * LB }, 200 * LB) / LB;
    const kept = A.normalize(JSON.parse(JSON.stringify(A.state))).exercises.find(e => e.id === 'hsChest').kind;
    window.__reset('lb', [], null, s => { s.exercises.push({ ...ex, name: 'Overhead Tricep Press', primary: 'triceps', kind: 'iso' }); });
    const iso = A.isCompound(A.EX('hsChest'));
    // The editor shows the choice and saves it.
    A.ACT.exEdit({ dataset: { ex: 'hsChest' } }); const sel = document.querySelector('#modal [data-ebind="kind"]'); const opts = sel ? [...sel.options].map(o => o.textContent) : [];
    sel.value = 'compound'; sel.dispatchEvent(new Event('change', { bubbles: true })); A.ACT.exSave();
    return { auto, autoStep, set, setStep, kept, iso, opts, saved: A.EX('hsChest').kind };
  }, [LB]);
  ok(r8.auto === false && near(r8.autoStep, 10), '8. "Hammer Strength Chest" reads as isolation from its name (5% step: 10 lb at 200)', r8);
  ok(r8.set === true && near(r8.setStep, 5) && r8.kept === 'compound', '8. set to Compound, it is one (2.5% step: 5 lb at 200), and the choice is kept', r8);
  ok(r8.iso === false, '8. set to Isolation, a name that sounds compound is not', r8.iso);
  ok(r8.opts.length === 3 && /Automatic/.test(r8.opts[0]) && r8.saved === 'compound', '8. the editor has Movement: Automatic, Compound, Isolation, and saves it', r8.opts);
  await ev(() => window.__ironlog.ACT.mClose());

  // ---- 9. A range moved well below last time's reps.
  const r9 = await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('lb', [window.__sess('2026-09-28', 'bench', 135 * LB, [12, 12, 12], { rr: [10, 12], rir: 0 })]);
    const plan = { sets: 3, repMin: 4, repMax: 6, rir: 1, rest: 180, inc: 5 * LB };
    const early = A.suggest('bench', plan);
    // Past a lift's first 3 sessions the 10% cap applies (r31: up to 25% while its load is being found).
    window.__reset('lb', ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'].map(d => window.__sess(d, 'bench', 135 * LB, [12, 12, 12], { rr: [10, 12], rir: 0 })));
    const sg = A.suggest('bench', plan);
    return { w: sg.w / LB, ew: early.w / LB, kind: sg.tgt && sg.tgt.kind, text: sg.text, e1: A.e1(135 * LB, 12, 0) / LB, inv: A.e1inv(A.e1(135 * LB, 12, 0), 6) / LB };
  }, [LB]);
  ok(near(r9.ew, 160), '9. the same after one session only: 160 lb, the estimate in whole steps (inside the 25% cap of a first session)', r9);
  // Independent: Epley at 12 reps to failure, 135 x (1 + 12/30) = 189; for 6 reps
  // to failure (middle of 4-6 is 5, plus 1 RIR) Brzycki gives 189 x 31/36 = 162.75;
  // capped at 10% over 135 = 148.5; whole 5 lb steps from 135: 145.
  ok(near(r9.e1, 189, 0.01) && near(r9.w, 145) && r9.kind === 'load', '9. 3 x 12 at 135 to failure for 4 sessions, then a 4-6 plan: 145 lb (10% cap, whole steps), not one step to 140', r9);

  // ---- 10. A target that starts at 0.
  const r10 = await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('lb', [window.__sess('2026-10-01', 'bench', 135 * LB, [8, 8, 8], { rr: [6, 10] })], null, s => { for (const k in s.settings.bands) s.settings.bands[k] = [0, 20]; });
    const st = A.muscleStatus({ chest: 3 });
    A.ui.tab = 'today'; A.render();
    return { lats: st.lats.st, chest: st.chest.st, serratus: st.serratus.st, latsLow: A.belowMin(0, st.lats.lo) };
  }, [LB]);
  // Since r29 no sets reads as none (grey), never green before a set (V); still never below.
  ok(r10.lats === 'none' && !r10.latsLow && r10.chest === 'in', '10. with every target at 0-20, a muscle with no sets is not below (none, not green); one with sets is on target', r10);

  // ---- 11. Planned hard sets.
  const r11 = await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('lb', [], null, s => { const R = s.routines[0]; R.schedule = 'weekly'; R.days = R.days.slice(0, 7); R.days.forEach((d, i) => { d.rest = i > 1; d.items = i === 0 ? [{ uid: 'a', exId: 'bench', sets: 4, repMin: 6, repMax: 10, rir: 1, rest: 0, inc: 5 * LB, ss: null }, { uid: 'b', exId: 'cableLateral', sets: 3, repMin: 10, repMax: 20, rir: 4, rest: 0, inc: 5 * LB, ss: null }] : i === 1 ? [{ uid: 'c', exId: 'rdl', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 0, inc: 5 * LB, ss: null }] : []; }); });
    const R = A.state.routines[0];
    const normal = A.planSetsPerWeek(R), deload = A.planSetsPerWeek(R, true);
    A.state.settings.rirMode = 'off'; const off = A.planSetsPerWeek(R); A.state.settings.rirMode = 'on';
    A.state.deloadWeek = A.weekStart(A.today()); const ws = A.weekStats().tgt; A.state.deloadWeek = null;
    const ps = A.plannedSets(R);
    return { normal, deload, off, ws, sideDelts: ps.sideDelts || 0 };
  }, [LB]);
  // Bench 4 (RIR 1) + RDL 3 (RIR 2) = 7; the RIR 4 lateral raises are not hard. Deload: 2 + 2 = 4. RIR off: 10.
  ok(r11.normal === 7 && r11.off === 10 && r11.sideDelts === 0, '11. sets planned at RIR 4 are not counted as planned hard sets (7, or 10 with RIR off)', r11);
  ok(r11.deload === 4 && r11.ws === 4, '11. in a deload week the target is half the sets per exercise, rounded up (4)', r11);

  // ---- 12. Past weeks against the routine they were logged on.
  const r12 = await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('lb', [], null, s => {
      const fb = A.routineFromTemplate('full3'); fb.id = 'fb'; const ppl = A.routineFromTemplate('ppl6'); ppl.id = 'ppl';
      s.routines = [fb, ppl]; s.activeRoutineId = 'fb';
      // Six full weeks of three sessions on Full body, before this week.
      for (let w = 1; w <= 6; w++) for (const off of [0, 2, 4]) { const d = new Date(Date.UTC(2026, 8, 28 - 7 * w + off)).toISOString().slice(0, 10); s.sessions.push({ id: 'x' + w + off, date: d, dayName: 'Full', routineId: 'fb', dayId: fb.days[0].id, ex: [{ exId: 'bench', rr: null, sets: [{ w: 100 * LB, r: 8, rir: 1 }] }] }); }
    });
    const before = A.weekStreak();
    A.state.activeRoutineId = 'ppl'; A.invalidate();
    const after = A.weekStreak();
    return { before: [before.weeks, before.best], after: [after.weeks, after.best, after.need] };
  }, [LB]);
  ok(r12.before[0] === 6 && r12.after[0] === 6 && r12.after[1] === 6, '12. switching to a 6-day routine keeps the 6-week streak earned on the 3-day one', r12);

  // ---- 13. A load step of 0.
  const r13 = await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('lb', [window.__sess('2026-09-28', 'dbCurl', 25 * LB, [12, 12, 12], { rr: [8, 12] })]);
    const sg = A.suggest('dbCurl', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 60, inc: 0 });
    return { w: sg.w / LB, kind: sg.tgt && sg.tgt.kind, total: sg.tgt && sg.tgt.total, text: sg.text, target: sg.target };
  }, [LB]);
  ok(near(r13.w, 25) && r13.kind === 'reps' && r13.total === 36 && !/add 0/.test(r13.text) && /fixed load/.test(r13.text) && !/heaviest/.test(r13.target), '13. step 0: same 25 lb, beat 36 reps, "a fixed load", never "add 0 lb"', r13);

  const r13b = await ev(([LB]) => { const A = window.__ironlog; window.__reset('lb', [window.__sess('2026-09-28', 'dbCurl', 25 * LB, [5, 5, 5], { rr: [8, 12] })]); return A.suggest('dbCurl', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 60, inc: 0 }).text; }, [LB]);
  ok(/build the reps up to 8/.test(r13b) && !/past 12/.test(r13b), '13. step 0 below the range says to build the reps up to 8, not past 12', r13b);

  // ---- 14. Pick for me in a deload session.
  const r14 = await ev(([LB]) => {
    const A = window.__ironlog;
    window.__reset('lb', [window.__sess('2026-09-28', 'bench', 135 * LB, [8, 8, 8], { rr: [6, 10] })]);
    const d0 = { ex: [], deload: false, light: false, date: A.today(), dayId: '' };
    const full = A.rankExercises(d0).map(x => [x.e.id, x.plan.sets]);
    const half = A.rankExercises({ ...d0, deload: true }).map(x => [x.e.id, x.plan.sets]);
    const light = A.rankExercises({ ...d0, light: true }).map(x => [x.e.id, x.plan.sets]);
    return { full, half, light };
  }, [LB]);
  ok(r14.full.length && r14.half.every(([id, n], i) => r14.full[i] && r14.full[i][0] === id && n === Math.max(1, Math.ceil(r14.full[i][1] / 2))) && JSON.stringify(r14.light) === JSON.stringify(r14.half), '14. Pick for me offers half the sets (rounded up) in a deload or lighter session', r14);

  ok(!errors.length, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
