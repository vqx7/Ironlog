// Progressive overload over nine weekly sessions, through the session screen
// the way it is used, for five kinds of lift (barbell, dumbbells, cable
// stack, pull-up with added load, assisted pull-up), run twice: grey loads
// and filled-in loads. Each week the reps are typed and every set ticked with
// the real fields and buttons, then the session is finished and the app is
// reopened a week later. The next session's loads, targets, "Last" line and
// grey reps are checked against an independent copy of the rules:
//   - every top set at the top of the rep range: load goes up one step
//     (5 lb here; on assisted lifts, 5 lb less help);
//   - otherwise: same load, beat the rep total;
//   - a trimmed exercise (Short on time) and a deload week never set the next
//     target, but "Last" shows them, labelled, and grey reps follow a trimmed
//     session (same loads) but not a deload (lighter loads); when the target is a
//     new load, grey reps are the bottom of the range (r27);
//   - a deload week: half the sets, lighter loads on a real step;
//   - two sessions in a row below the range at the same load: the load drops,
//     on a real step, and never below zero.
// Nothing shown may read NaN or undefined, and what is saved is what was shown.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const LB = 0.45359237;
const EXS = [
  { id: 'bench', sets: 3, min: 6, max: 10, start: 135, kind: 'w' },
  { id: 'dbCurl', sets: 3, min: 8, max: 12, start: 30, kind: 'w' },
  { id: 'latPulldown', sets: 3, min: 8, max: 12, start: 120, kind: 'w' },
  { id: 'pullup', sets: 3, min: 6, max: 10, start: 0, kind: 'bw' },
  { id: 'assistPullup', sets: 3, min: 6, max: 10, start: -50, kind: 'assist' }
];
// Reps typed each week, per exercise (one number for every set, or a list).
const TOP = e => e.max, MID = e => [e.max - 1, e.max - 2, e.max - 2];
const PLAN = [
  { reps: TOP },                                   // 1: every set at the top: up a step next week
  { reps: MID },                                   // 2: short of the top: same load next week
  { reps: TOP },                                   // 3: top again: up a step
  { reps: TOP, trim: true },                       // 4: Short on time: trimmed lifts do not set the target
  { reps: TOP, deload: true },                     // 5: deload week: lighter, half the sets, sets no target
  { reps: MID },                                   // 6: back to the target from the last full session
  { reps: e => e.id === 'bench' ? [6, 6, 5] : MID(e) },   // 7: bench just under the range at one set
  { reps: e => e.id === 'bench' ? [5, 4, 4] : MID(e) },   // 8: bench under, at the same load: still holds (gap 1)
  { reps: e => e.id === 'bench' ? [5, 4, 4] : MID(e) },   // 9: under again, same load, twice running: the load drops next
];

(async () => {
  for (const mode of ['grey', 'fill']) {
    const T = mode + ': ';
    const { chromium } = require('playwright');
    const browser = await chromium.launch();
    let state = null; const allErrors = [];
    // The independent model: per lift, the sessions logged, newest last.
    const hist = Object.fromEntries(EXS.map(e => [e.id, [{ load: e.start, reps: [8, 8, 8].map(r => Math.min(r, e.max)), kind: 'full', date: '2026-08-31' }]]));
    const expectNext = (e) => {
      const full = hist[e.id].filter(h => h.kind === 'full'); const L = full[full.length - 1];
      if (L.reps.every(r => r >= e.max)) return e.kind === 'assist' ? Math.min(0, L.load + 5) : L.load + 5;
      return L.load;
    };
    for (let wk = 0; wk <= PLAN.length; wk++) {
      const date = new Date(Date.UTC(2026, 8, 7 + 7 * wk)).toISOString().slice(0, 10);
      const P = await open('index.html', { browser, touch: true, w: 390, h: 844, clock: date + 'T10:00:00', state: state || undefined });
      const ev = (f, a) => P.page.evaluate(f, a);
      if (!state) {
        // Week 0: a routine of these five lifts, one earlier session, a bodyweight, the mode.
        await ev(([EXS, mode, LB]) => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb';
          if (mode === 'fill') s.settings.loadFill = 'fill';
          const R = s.routines[0]; R.days[0].items = EXS.map((e, i) => ({ uid: 'u' + i, exId: e.id, sets: e.sets, repMin: e.min, repMax: e.max, rir: 1, rest: 0, inc: 5 * LB, ss: null }));
          s.bodyweights.push({ id: 'bw1', date: '2026-08-30', kg: 180 * LB });
          s.sessions.push({ id: 'seed', date: '2026-08-31', dayIdx: 0, dayId: R.days[0].id, dayName: R.days[0].name, routineId: R.id, notes: '', ex: EXS.map(e => ({ exId: e.id, sets: [8, 8, 8].map(r => ({ w: e.start * LB, r: Math.min(r, e.max), rir: null, warm: false, drop: false })) })) });
          L.invalidate(); L.saveNow(); localStorage.setItem('ironlog.v1.tipWake', '1'); localStorage.setItem('ironlog.v1.loadAsk', '1'); }, [EXS, mode, LB]);
        state = await ev(() => JSON.parse(localStorage.getItem('ironlog.v1')));
        await P.ctx.close(); continue;
      }
      const step = PLAN[wk - 1]; const W = `week ${wk}${step.trim ? ' (trimmed)' : step.deload ? ' (deload)' : ''}: `;
      if (step.deload) await ev(() => { const L = window.__ironlog; L.state.deloadWeek = L.weekStart(L.today()); L.saveNow(); });
      await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } }); });
      await P.page.waitForTimeout(150);
      // What each lift shows before anything is typed.
      const shown = await ev(([EXS, LB]) => { const L = window.__ironlog; const d = L.state.draft;
        return EXS.map(e => { const bi = d.ex.findIndex(b => b.exId === e.id); const b = d.ex[bi];
          const rows = b.sets.map((x, i) => { const f = document.querySelector(`.sg input[data-f="w"][data-b="${bi}"][data-s="${i}"]`); const r = document.querySelector(`.sg input[data-f="r"][data-b="${bi}"][data-s="${i}"]`); return { w: f.value || f.placeholder, filled: f.value !== '', rph: r.placeholder }; });
          return { id: e.id, bi, rows, n: b.sets.length, last: b.last, target: b.target, basis: b.basis || null, tgtW: b.tgt && b.tgt.w != null ? Math.round(b.tgt.w / LB * 100) / 100 : null, sw: b.sw == null ? null : Math.round(b.sw / LB * 100) / 100 }; }); }, [EXS, LB]);
      for (const e of EXS) {
        const s = shown.find(x => x.id === e.id); const exp = expectNext(e);
        const disp = e.kind === 'assist' ? -exp : exp; // the field shows help as a plain number
        const nums = s.rows.map(r => +r.w);
        if (step.deload) {
          const prev = Math.abs(expectNext(e));
          ok(s.n === Math.ceil(e.sets / 2), T + W + e.id + ' has half the sets', s.n);
          if (e.kind === 'w') ok(nums.every(v => v < exp && v > 0 && Math.abs(v / 5 - Math.round(v / 5)) < 1e-9), T + W + e.id + ' is lighter than the target (' + exp + '), on a 5 lb step', nums);
          else if (e.kind === 'bw') ok(nums.every(v => v >= 0 && v <= exp), T + W + e.id + ' added load is at or below the target', nums);
          else ok(nums.every(v => v >= prev), T + W + e.id + ' has at least as much help as the target (' + prev + ')', nums);
        } else {
          ok(nums.every(v => Math.abs(v - disp) < 1e-9), T + W + e.id + ' shows ' + disp + ' on every set (rule: ' + (exp !== hist[e.id].filter(h => h.kind === 'full').slice(-1)[0].load ? 'up a step' : 'same load') + ')', s.rows.map(r => r.w));
          ok(s.rows.every(r => r.filled === (mode === 'fill')), T + W + e.id + ' loads are ' + (mode === 'fill' ? 'filled in' : 'grey'), s.rows.map(r => r.filled));
          ok(s.tgtW != null && Math.abs(s.tgtW - exp) < 0.01 && s.sw != null && Math.abs(s.sw - exp) < 0.01, T + W + e.id + ' target and suggestion are the load shown', { tgt: s.tgtW, sw: s.sw, exp });
        }
        // "Last" is the most recent session, labelled; the target says where it comes from when that differs.
        const h = hist[e.id]; const recent = h[h.length - 1];
        const lbl = recent.kind === 'trim' ? ', trimmed' : recent.kind === 'deload' ? ', deload' : '';
        ok(new RegExp('^Last \\([A-Z][a-z]{2} \\d+' + lbl + '\\)').test(s.last), T + W + e.id + ' Last is the most recent session' + (lbl ? ' (' + lbl.slice(2) + ')' : ''), s.last);
        if (!step.deload) ok(!!s.basis === (recent.kind !== 'full'), T + W + e.id + (recent.kind !== 'full' ? ' target says it comes from the last full session' : ' target comes from Last itself'), s.basis);
        // Grey reps: the reps of Last, except after a deload, the last full session's.
        // When the target is a new load (r27), last time's reps were at the old load,
        // so every row shows the bottom of the range instead.
        const newLoad = !step.deload && exp !== h.filter(x => x.kind === 'full').slice(-1)[0].load;
        const repsFrom = recent.kind === 'deload' ? h.filter(x => x.kind === 'full').slice(-1)[0] : recent;
        if (newLoad) {
          const rph = s.rows.map(r => +r.rph);
          ok(rph.every(v => v === e.min), T + W + e.id + ' grey reps are ' + e.min + ' on every set (a new load, so not last time\'s reps)', rph);
        } else {
          const rph = s.rows.slice(0, repsFrom.reps.length).map(r => +r.rph);
          ok(JSON.stringify(rph) === JSON.stringify(repsFrom.reps.slice(0, s.rows.length)), T + W + e.id + ' grey reps are ' + repsFrom.reps.join(',') + ' (' + (recent.kind === 'deload' ? 'last full session' : 'Last') + ')', rph);
        }
      }
      // Short on time this week: trim first, then log what is left.
      let cut = {};
      if (step.trim) {
        cut = await ev(() => { const L = window.__ironlog; L.ACT.shortOpen(); L.ui.modal.mins = 12; L.ACT.shortApply(); const d = L.state.draft; return Object.fromEntries(d.ex.filter(b => b.cut).map(b => [b.exId, b.sets.length])); });
        ok(Object.keys(cut).length >= 1, T + W + 'Short on time trims at least one lift', cut);
      }
      // Type the reps and tick every set through the screen.
      const plan = await ev(() => window.__ironlog.state.draft.ex.map(b => ({ id: b.exId, n: b.sets.length })));
      const typed = {};
      for (let bi = 0; bi < plan.length; bi++) {
        const e = EXS.find(x => x.id === plan[bi].id); const r = step.reps(e); const reps = Array.from({ length: plan[bi].n }, (_, i) => Array.isArray(r) ? r[Math.min(i, r.length - 1)] : r);
        typed[e.id] = reps;
        for (let si = 0; si < reps.length; si++) {
          const sel = `.sg input[data-f="r"][data-b="${bi}"][data-s="${si}"]`;
          await P.page.fill(sel, String(reps[si])); await P.page.dispatchEvent(sel, 'input'); await P.page.dispatchEvent(sel, 'change');
          await P.page.click(`[data-act="sDone"][data-b="${bi}"][data-s="${si}"]`);
        }
      }
      await P.page.waitForTimeout(100);
      // Before Finish: what each set will save is what its field showed.
      const pre = await ev(([LB]) => { const L = window.__ironlog; return L.state.draft.ex.map(b => ({ id: b.exId, w: b.sets.map(x => Math.round((x.w == null ? 0 : x.w) / LB * 100) / 100), done: b.sets.every(x => x.done), cut: !!b.cut })); }, [LB]);
      ok(pre.every(b => b.done), T + W + 'every set is ticked');
      await ev(() => window.__ironlog.ACT.finish()); await P.page.waitForTimeout(150);
      for (let k = 0; k < 4; k++) { if (!(await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm'; }))) break; await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await P.page.waitForTimeout(150); }
      const saved = await ev(([LB]) => { const L = window.__ironlog; const s = L.state.sessions[L.state.sessions.length - 1]; return { date: s.date, deload: !!s.deload, ex: s.ex.map(b => ({ id: b.exId, w: b.sets.map(x => Math.round(x.w / LB * 100) / 100), r: b.sets.map(x => x.r), cut: !!b.cut })) }; }, [LB]);
      ok(saved.date === date && !(await ev(() => window.__ironlog.state.draft)), T + W + 'the session is saved under this week\'s date');
      for (const b of saved.ex) {
        const p = pre.find(x => x.id === b.id);
        ok(JSON.stringify(b.w) === JSON.stringify(p.w) && JSON.stringify(b.r) === JSON.stringify(typed[b.id]), T + W + b.id + ' saved exactly the loads shown and the reps typed', { saved: b, pre: p.w, typed: typed[b.id] });
        const e = EXS.find(x => x.id === b.id);
        hist[b.id].push({ load: b.w[0], reps: b.r, kind: saved.deload ? 'deload' : b.cut ? 'trim' : 'full', date });
      }
      ok(await ev(() => { window.__ironlog.ui.tab = 'history'; window.__ironlog.render(); const t = document.body.innerText; return !/NaN|undefined|Infinity/.test(t); }), T + W + 'nothing shown reads NaN, undefined or Infinity');
      if (step.deload) await ev(() => { const L = window.__ironlog; L.state.deloadWeek = null; L.saveNow(); });
      state = await ev(() => JSON.parse(localStorage.getItem('ironlog.v1')));
      allErrors.push(...P.errors);
      await P.ctx.close();
    }
    // After two sessions in a row under the range at the same load, the bench load drops, on a real step, above zero.
    const P = await open('index.html', { browser, touch: true, clock: '2026-11-16T10:00:00', state });
    const drop = await P.page.evaluate(([LB]) => { const L = window.__ironlog; const b = L.newBlock('bench', { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 0, inc: 5 * LB }, {}); return { w: Math.round(b.sw / LB * 100) / 100, text: b.hint, target: b.target }; }, [LB]);
    const lastBench = hist.bench.filter(h => h.kind === 'full').slice(-1)[0].load;
    ok(drop.w < lastBench && drop.w > 0 && Math.abs(drop.w / 5 - Math.round(drop.w / 5)) < 1e-9 && /Drop to/.test(drop.text || ''), T + 'two sessions under the range at the same load: bench drops from ' + lastBench + ' to ' + drop.w + ', on a 5 lb step', drop);
    allErrors.push(...P.errors);
    await P.ctx.close();
    ok(!allErrors.length, T + 'no page errors in nine weeks (' + allErrors.join(' | ') + ')');
    await browser.close();
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
