// The next sets and the next session after a set, across lifts, kinds,
// units, racks and breaks (341 b, V 2026-10-24: "every engine rule be
// provably right in every scenario, never misleading"). For each lift (a
// barbell compound in lb and kg, a dumbbell press, an isolation dumbbell lift,
// a plate-loaded machine, a cable isolation lift in kg, a barbell lift on
// Your gym's plates), each plan (6-10 at 1 in reserve, 8-12 at 2), each
// history (three sessions at one load, then none, 6 or 10 weeks off), and
// each first set (reps from three under the range to three over it, effort
// unrated or 0 to 5 in reserve), the set is ticked at the load the session
// asks and the next sets it gives are held to what the rules say, worked out
// here from the estimate the app states (Brzycki to 10 reps to failure,
// Epley past it, docs/EVIDENCE.md):
//   - an adjustment up is never lighter than its set, and one down is lighter;
//   - its load is on the lift's steps from the set's load (or its rack or
//     plates), never under the bar;
//   - the reps it states leave the reserve its aim says by the set's own
//     estimate: the target plus one for fatigue, or on a first session back
//     the return's own 2 or more (rule 4);
//   - on a first session back it never asks past the load from before the
//     break (rules 3 and 4), and anywhere else past the loads done since the
//     last break it rises at most 10% (15% on a light isolation lift), or
//     one step when the set was rated 5 or more in reserve (r34.2);
//   - and a first session back done as asked (every set at its load for the
//     bottom of the range or more, at 2 or more in reserve or unrated) never
//     asks less the next session (rule 5).
const { open, engine } = require('./h');
const FILE = process.argv[2] || process.env.IRONLOG_FILE || 'index.html';
const fails = [];
let checks = 0;
const ok = (c, m, x) => { checks++; if (!c) { fails.push(m); if (fails.length <= 40) console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } return !!c; };
const T = '2026-10-19';
const LB = 0.45359237;

// [id, unit, the load the history was done at, Your gym (its plates, or its dumbbells in tens)]
const PLATES = { u: 'lb', plates: [45, 25, 10, 5, 2.5] }, TENS = { u: 'lb', db: { lo: 10, hi: 120, st: 10 } };
const LIFTS = [['bench', 'lb', 185], ['bench', 'kg', 80], ['backSquat', 'kg', 100], ['dbBench', 'lb', 60], ['dbLateral', 'lb', 20], ['legPress', 'lb', 270], ['cableFly', 'kg', 15], ['bench', 'lb', 185, PLATES], ['dbBench', 'lb', 60, TENS]];
const PLANS = [[6, 10, 1], [8, 12, 2]];
const BREAKS = [0, 42, 70];
const RIRS = [null, 0, 1, 2, 3, 4, 5];

(async () => {
  const browser = await engine.launch();
  const P = await open(FILE, { browser, clock: T + 'T09:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
  /* One case on the page: the log seeded, the session started, set 1 typed and ticked as the app's tick does,
     and what the next sets became, with what the checks need to read them. */
  const one = c => ev(c => {
    const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
    const kg = v => (c.unit === 'kg' ? v : v * LB);
    const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
    S.settings.onboarded = true; S.settings.unit = c.unit; S.settings.autoDone = false; S.settings.timerMode = 'off';
    if (c.gym) S.settings.gym = c.gym; else delete S.settings.gym;
    const def = L.defPlan(c.id);
    const it = { uid: 'u1', exId: c.id, sets: 3, repMin: c.lo, repMax: c.hi, rir: c.tgt, rest: 120, inc: def.inc, ss: null };
    S.routines = [{ id: 'R1', name: 'One', schedule: 'weekly', days: [{ id: 'D1', name: 'Day', items: [it] }] }]; S.activeRoutineId = 'R1';
    const mid = Math.round((c.lo + c.hi) / 2);
    const last = add(c.T, -(c.brk || 7));
    S.sessions = [21, 14, 0].map((k, i) => ({ id: 'h' + i, date: add(last, -k), dayIdx: 0, dayId: 'D1', dayName: 'Day', routineId: 'R1', notes: '', ex: [{ exId: c.id, rr: [c.lo, c.hi], sets: [0, 1, 2].map(() => ({ w: kg(c.P), r: mid, rir: c.tgt, warm: false, drop: false })) }] }));
    S.bodyweights = [{ id: 'w1', date: add(c.T, -3), kg: 80 }];
    S.draft = null;
    L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
    L.ACT.startSession({ dataset: { day: '0' } });
    const d = L.state.draft; const b = d.ex[0]; const ex = L.EX(c.id);
    const w0 = b.sets[0].w != null ? b.sets[0].w : L.greyW(b, 0);
    if (w0 == null) return { skip: 'no load asked' };
    const s = b.sets[0]; s.w = w0; s.r = c.r; s.rir = c.rir;
    L.ACT.sDone({ dataset: { b: '0', s: '0' } });
    if (L.ui.modal) { const m = L.ui.modal; L.ACT.mClose(); return { skip: 'asked: ' + m.title }; }
    const b2 = L.state.draft.ex[0];
    const bw = ex.bw ? L.bwRefLoad(ex) : 0;
    const rq = c.rir != null ? c.rir : L.rirEst(b2.sets[0], ex);
    return { w0, adj: b2.adj || null, step: L.incOf(ex, b2.plan, w0), bar: L.exBarKg(ex), barbell: ex.equip === 'barbell', bw, rq, iso: !L.isCompound(ex), est: L.fitE(w0 + bw, c.r, rq == null ? 0 : Math.min(rq, 4)), preKg: kg(c.P), hint: b2.hint, next: L.heavierLoad(ex, b2.plan, w0, w0 + L.incOf(ex, b2.plan, w0) * 4) == null ? null : (() => { let t = w0 + L.incOf(ex, b2.plan, w0) * 0.5, h = null; for (let k = 0; k < 40 && h == null; k++, t += L.incOf(ex, b2.plan, w0) * 0.5) h = L.heavierLoad(ex, b2.plan, w0, t); return h; })() };
  }, c);
  const fitE = (load, r, q) => { const t = r + Math.max(0, Math.min(q == null ? 0 : q, 4)); return t <= 10 ? load * 36 / (37 - t) : t <= 30 ? load * (1 + t / 30) : null; };
  const rtfAt = (est, load) => { const b = 37 - 36 * load / est; return b <= 10 ? b : 30 * (est / load - 1); };
  let n = 0, adjN = 0;
  for (const [id, unit, Pl, gym] of LIFTS) for (const [lo, hi, tgt] of PLANS) for (const brk of BREAKS) {
    const back = brk > 28;
    for (let r = lo - 3; r <= hi + 3; r++) for (const rir of RIRS) {
      const c = { id, unit, P: Pl, gym: gym || null, lo, hi, tgt, brk, r, rir, T };
      const x = await one(c);
      n++;
      const name = `${id} ${unit}${gym ? (gym.plates ? ' (gym plates)' : ' (dumbbells in tens)') : ''} ${lo}-${hi} @${tgt}${back ? `, ${brk / 7} weeks off` : ''}: ${x.w0 != null ? Math.round((unit === 'kg' ? x.w0 : x.w0 / LB) * 10) / 10 : '?'} x ${r} @${rir == null ? '-' : rir}`;
      if (x.skip) continue;
      const a = x.adj;
      if (!a) continue;
      adjN++;
      const tol = 1e-6;
      ok(a.up ? a.w >= x.w0 - tol && (a.w > x.w0 + tol || a.r > r) : a.w < x.w0 - tol, `${name}: an up is never lighter than its set, a down is lighter`, a);
      // On the steps from the set's load, or Your gym's plates or dumbbells.
      if (gym && gym.plates) { let left = (a.w / LB - 45) / 2; for (const p of gym.plates) while (left >= p - 1e-6) left -= p; ok(Math.abs(left) < 1e-6, `${name}: a load the gym's plates make`, { lb: a.w / LB }); }
      else if (gym && gym.db) { const lb = a.w / LB; ok(Math.abs(lb / 10 - Math.round(lb / 10)) < 1e-6 && lb >= 10 && lb <= 120, `${name}: one of the gym's dumbbells`, { lb }); }
      else { const k = (a.w - x.w0) / x.step; ok(Math.abs(k - Math.round(k)) < 1e-6, `${name}: on the lift's steps from the set`, { a, step: x.step }); }
      if (x.barbell) ok(a.w >= x.bar - tol, `${name}: never under the bar`, a);
      // The reserve its stated reps leave, by the set's own estimate.
      const est = x.est;
      if (est) {
        const same = a.up && Math.abs(a.w - x.w0) < tol;
        const want = back ? (a.up ? Math.max(2, tgt) : Math.max(2, tgt + 1)) : same ? tgt : tgt + 1;
        const left = rtfAt(est, a.w + x.bw) - a.r;
        ok(left >= want - 1e-6 || a.r === lo, `${name}: ${a.r} reps at the new load leave ${want}+ in reserve`, { left, a });
      }
      if (back) ok(a.w <= x.preKg + tol, `${name}: a first session back never asks past the load before the break`, { a, pre: x.preKg });
      // Rated 5 or more in reserve, the top of the scale, one real step is always taken, past the cap if need be (r34.2): the next load on its steps or rack.
      else if (a.up && a.w > x.preKg + tol) ok(a.w + x.bw <= (x.w0 + x.bw) * (x.iso && x.w0 + x.bw < 20 ? 1.15 : 1.1) + tol || (rir >= 5 && x.next != null && Math.abs(a.w - x.next) < tol), `${name}: past the loads done since the break, at most 10% up (one step at 5 or more in reserve)`, { a, next: x.next });
    }
  }
  // A first session back done as asked never asks less the next session (rule 5).
  const asked = c => ev(c => {
    const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
    const kg = v => (c.unit === 'kg' ? v : v * LB);
    const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
    S.settings.onboarded = true; S.settings.unit = c.unit; S.settings.autoDone = false; delete S.settings.gym;
    const def = L.defPlan(c.id);
    const it = { uid: 'u1', exId: c.id, sets: 3, repMin: c.lo, repMax: c.hi, rir: c.tgt, rest: 120, inc: def.inc, ss: null };
    S.routines = [{ id: 'R1', name: 'One', schedule: 'weekly', days: [{ id: 'D1', name: 'Day', items: [it] }] }]; S.activeRoutineId = 'R1';
    const mid = Math.round((c.lo + c.hi) / 2), last = add(c.T, -c.brk), back = add(c.T, -7);
    S.sessions = [21, 14, 0].map((k, i) => ({ id: 'h' + i, date: add(last, -k), dayIdx: 0, dayId: 'D1', dayName: 'Day', routineId: 'R1', notes: '', ex: [{ exId: c.id, rr: [c.lo, c.hi], sets: [0, 1, 2].map(() => ({ w: kg(c.P), r: mid, rir: c.tgt, warm: false, drop: false })) }] }));
    S.draft = null;
    // The return, a week ago, as the app asked it: its load from the suggestion of that day, every set at the reps and effort given.
    L.state = L.normalize(S); L.invalidate();
    const sg = L.suggest(c.id, it, { before: back });
    const w = sg.w;
    L.state.sessions.push({ id: 'ret', date: back, dayIdx: 0, dayId: 'D1', dayName: 'Day', routineId: 'R1', notes: '', ex: [{ exId: c.id, rr: [c.lo, c.hi], sets: [0, 1, 2].map(() => ({ w, r: c.r, rir: c.rir, warm: false, drop: false })) }] });
    L.state = L.normalize(L.state); L.invalidate();
    const nx = L.suggest(c.id, it, {});
    return { ret: w, next: nx.w, text: nx.text, sg: sg.text };
  }, c);
  for (const [id, unit, Pl] of LIFTS.filter(l => !l[3])) for (const [lo, hi, tgt] of PLANS) for (const brk of [42, 70]) for (const r of [lo, lo + 2, hi]) for (const rir of [null, 2, 3, 4]) {
    const x = await asked({ id, unit, P: Pl, lo, hi, tgt, brk, r, rir, T });
    ok(x.ret != null && x.next != null && x.next >= x.ret - 1e-6, `${id} ${unit} ${lo}-${hi} @${tgt}, back after ${brk / 7} weeks, the return done as asked (${r} reps @${rir == null ? '-' : rir} at its load): the next session asks no less`, x);
  }
  ok(!P.errors.length, 'no page errors', P.errors);
  await browser.close();
  console.log(`${n} cases, ${adjN} adjusted, ${checks} checks`);
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
