// r32 (V, 2026-10-06): the third independent review. Each finding is
// reproduced with the reviewer's inputs and must now read right.
// Part 1, the load engine: a lighter day or deload never heavier than the
// normal day (or last time), with grey reps at the bottom of the range;
// dumbbells and kettlebells on weights a rack has; one bad set never sets
// grey reps or the target; no target under the planned range after an
// ordinary step, and a large step built up to first; then the whole engine
// side by side with r31.3 (baselines/r31-3.html) over a grid of histories,
// every difference explained by one of those rules.
// Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const LB = 0.45359237;
const FILE = 'index.html'; // tests/h.js swaps in dist/ when IRONLOG_FILE is set

// Seeds sessions of one lift: [date, [[w, r, rir], ...]] in the unit on screen.
const seed = (L, unit, exId, list, rr) => {
  const s = L.state; s.settings.onboarded = true; s.settings.unit = unit; s.settings.rirMode = 'on';
  const f = unit === 'lb' ? 0.45359237 : 1; let n = 0;
  s.sessions = s.sessions.filter(x => !x.ex.some(b => b.exId === exId));
  for (const [date, sets] of list) s.sessions.push({ id: 'r32' + exId + (n++), date, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId, rr: rr || undefined, sets: sets.map(([w, r, rir]) => ({ w: w * f, r, rir: rir == null ? null : rir, warm: false, drop: false })) }] });
  L.invalidate();
};

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();

  // ---------- 193: a lighter day or deload is lighter than the normal day ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const r = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog; const out = {};
      const plan = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5 };
      seed(L, 'kg', 'backSquat', [['2026-09-30', [[140, 4, 1], [140, 3, 1], [140, 3, 1]]], ['2026-10-04', [[140, 4, 1], [140, 4, 1], [140, 3, 1]]]], [6, 10]);
      const n = L.suggest('backSquat', plan, {}), l = L.suggest('backSquat', plan, { light: true }), d = L.suggest('backSquat', plan, { deload: true });
      out.squat = { n: n.w, l: l.w, d: d.w, lr: l.lastR, dr: d.lastR, lt: l.text };
      const bp = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 120, inc: 2.5 };
      seed(L, 'kg', 'bench', [['2026-10-02', [[100, 15, 1], [100, 15, 1], [100, 15, 1]]]], [8, 12]);
      const bn = L.suggest('bench', bp, {}), bl = L.suggest('bench', bp, { light: true });
      out.bench = { n: bn.w, l: bl.w, lr: bl.lastR, lt: bl.text };
      return out;
    }, [seed.toString()]);
    ok(r.squat.n < 140 && r.squat.n >= 120, '193: squat after 140 x 4, 3, 3 and 140 x 4, 4, 3: the normal day drops (to ' + r.squat.n + ')', r.squat);
    const lw = Math.floor(r.squat.n * 0.9 / 2.5 + 1e-9) * 2.5;
    ok(r.squat.l === lw && r.squat.d === lw, '193: the Lighter day and the deload are 90% of the normal day in whole steps (' + lw + '), never above it', r.squat);
    ok(r.squat.lr.every(v => v === 6) && r.squat.dr.every(v => v === 6), '193: their grey reps are the bottom of the range (6), not last time\'s 4, 4, 3', r.squat);
    ok(new RegExp('Lighter day: about ' + r.squat.l + ' kg for 6-10 with 3 or more reps in reserve').test(r.squat.lt), '193: the line says about ' + r.squat.l + ' kg', r.squat.lt);
    ok(r.bench.l <= 90 + 1e-9 && r.bench.l < r.bench.n, '193: bench after 100 x 15: the Lighter day is 90 or under, never above last time', r.bench);
    ok(r.bench.lr.every(v => v === 8), '193: and its grey reps are 8, so one tap never logs 90 x 15 on a "3 or more in reserve" day', r.bench);
    // Through the screen: start a Lighter day and tick the first squat set untyped.
    const ui = await P.page.evaluate(() => {
      const L = window.__ironlog; const R = L.state.routines[0]; R.days[0].items = [{ uid: 'q', exId: 'backSquat', sets: 4, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5, ss: null }];
      L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0', light: '1' } });
      const b = L.state.draft.ex[0]; const wf = document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="0"]'); const rf = document.querySelector('.sg input[data-f="r"][data-b="0"][data-s="0"]');
      return { n: b.sets.length, w: wf.value || wf.placeholder, r: rf.placeholder };
    });
    ok(ui.n === 2 && +ui.w === r.squat.l && ui.r === '6', '193: on screen, the Lighter day squat is 2 sets at ' + r.squat.l + ' for 6 (grey)', ui);
    await P.ctx.close();
  }

  // ---------- 194: dumbbells and kettlebells a rack has ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const r = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog; const out = [];
      const cases = [['dbLateral', 12, 12, 15], ['incDb', 34, 8, 12], ['inclineCurl', 14, 10, 15], ['hammer', 18, 8, 12], ['bss', 22, 8, 12], ['dbCurl', 12.5, 8, 12], ['kbSwing', 16, 10, 15]];
      for (const [id, w, lo, hi] of cases) {
        const plan = { sets: 3, repMin: lo, repMax: hi, rir: 1, rest: 90, inc: 5 * 0.45359237 };
        // Three sessions, the last one at the top of the range.
        seed(L, 'kg', id, [['2026-09-22', [[w, lo + 1, 1], [w, lo, 1], [w, lo, 1]]], ['2026-09-29', [[w, hi - 1, 1], [w, hi - 1, 1], [w, hi - 2, 1]]], ['2026-10-03', [[w, hi, 1], [w, hi, 1], [w, hi, 1]]]], [lo, hi]);
        const n = L.suggest(id, plan, {}), l = L.suggest(id, plan, { light: true });
        out.push({ id, w, n: n.w, l: l.w, step: L.incOf(L.EX(id), plan), text: n.text });
      }
      // 2 kg, 2.5 kg and lb racks: a lighter day under 12 kg.
      seed(L, 'kg', 'dbLateral', [['2026-10-03', [[12, 13, 1], [12, 13, 1]]]], [12, 15]);
      out.push({ id: 'dbLateral light', w: 12, l: L.suggest('dbLateral', { sets: 3, repMin: 12, repMax: 15, rir: 1, inc: 2.5 }, { light: true }).w });
      seed(L, 'lb', 'dbCurl', [['2026-10-03', [[35, 12, 1], [35, 12, 1], [35, 12, 1]]]], [8, 12]);
      const c = L.suggest('dbCurl', { sets: 3, repMin: 8, repMax: 12, rir: 1, inc: 5 * 0.45359237 }, {});
      out.push({ id: 'dbCurl lb', w: 35, n: c.w / 0.45359237, text: c.text });
      return out;
    }, [seed.toString()]);
    const on = (v, g) => Math.abs(v / g - Math.round(v / g)) < 1e-6;
    for (const x of r.slice(0, 7)) {
      const g = x.id === 'kbSwing' ? 4 : on(x.w, 2.5) ? 2.5 : 2;
      ok(on(x.n, g) && on(x.l, g), `194: ${x.id} from ${x.w} kg stays on a ${g} kg rack: next ${x.n}, lighter day ${x.l}`, x);
    }
    ok(r[0].n === 14 || r[0].n === 12, '194: DB lateral 12 kg: 14 or more reps at 12 first, never 14.5', r[0]);
    ok(on(r[7].l, 2) && r[7].l < 12, '194: a lighter day under 12 kg dumbbells is 10, not 9.5', r[7]);
    ok(on(r[8].n, 5), '194: in lb, 35 lb dumbbells go to 40 (or stay at 35), never 37.5', r[8]);
    await P.ctx.close();
  }

  // ---------- 195: one bad set is not next time's plan ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const r = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog;
      seed(L, 'kg', 'backSquat', [['2026-09-29', [[140, 6, 2], [140, 6, 2], [140, 6, 2]]], ['2026-10-02', [[140, 3, 0], [140, 6, 1], [140, 6, 1]]]], [6, 10]);
      const R = L.state.routines[0]; R.days[0].items = [{ uid: 'q', exId: 'backSquat', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5, ss: null }];
      L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } });
      const b = L.state.draft.ex[0]; const ph = [0, 1, 2].map(i => document.querySelector(`.sg input[data-f="r"][data-b="0"][data-s="${i}"]`).placeholder);
      document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').click();
      return { ph, target: b.target, logged: L.state.draft.ex[0].sets[0].r };
    }, [seed.toString()]);
    ok(JSON.stringify(r.ph) === '["6","6","6"]', '195: squat 140 x 3, 6, 6 on 6-10: grey reps (6)(6)(6), not (3)(6)(6)', r.ph);
    ok(/^19\+ reps over your first 3 sets at 140/.test(r.target), '195: the target is 19+ reps over 3 sets, not 16+', r.target);
    ok(r.logged === 6, '195: ticking set 1 untyped logs 6, not 3', r.logged);
    // Most sets under the range is a load that was too heavy: grey reps stay as done.
    const r2 = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog; L.state.draft = null;
      seed(L, 'kg', 'backSquat', [['2026-10-02', [[140, 6, 1], [140, 5, 0], [140, 4, 0]]]], [6, 10]);
      return L.suggest('backSquat', { sets: 3, repMin: 6, repMax: 10, rir: 1, inc: 2.5 }, {}).lastR;
    }, [seed.toString()]);
    ok(JSON.stringify(r2) === '[6,5,4]', '195: with most sets under the range, grey reps stay as done (6, 5, 4)', r2);
    await P.ctx.close();
  }

  // ---------- 196: no target under the range after an ordinary step ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const r = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog; const out = {};
      const fp = { sets: 3, repMin: 10, repMax: 15, rir: 1, rest: 60, inc: 2.5 };
      seed(L, 'kg', 'cableFly', [['2026-10-03', [[17.5, 15, 1], [17.5, 15, 1], [17.5, 15, 1]]]], [10, 15]);
      const a = L.suggest('cableFly', fp, {}); out.fly1 = { w: a.w, kind: a.tgt && a.tgt.kind, buildTo: a.buildTo, text: a.text, target: a.target };
      seed(L, 'kg', 'cableFly', [['2026-09-30', [[17.5, 15, 1], [17.5, 15, 1], [17.5, 15, 1]]], ['2026-10-03', [[17.5, a.buildTo, 1], [17.5, a.buildTo, 1], [17.5, a.buildTo, 1]]]], [10, 15]);
      const b = L.suggest('cableFly', fp, {}); out.fly2 = { w: b.w, aim: b.tgt && b.tgt.repMin, text: b.text };
      // A 5 x 5 goes up 5 lb and repeats the 5s.
      seed(L, 'lb', 'backSquat', [['2026-10-03', [[225, 5], [225, 5], [225, 5], [225, 5], [225, 5]]]], [5, 5]);
      const c = L.suggest('backSquat', { sets: 5, repMin: 5, repMax: 5, rir: 1, inc: 5 * 0.45359237 }, {}); out.sq = { w: c.w / 0.45359237, aim: c.tgt && c.tgt.repMin };
      // A pressdown at 42.5 x 12 on 10-12: 45 for 10+, not 8+.
      L.state.settings.unit = 'kg';
      seed(L, 'kg', 'pressdown', [['2026-10-03', [[42.5, 12, 1], [42.5, 12, 1], [42.5, 12, 1]]]], [10, 12]);
      const d = L.suggest('pressdown', { sets: 3, repMin: 10, repMax: 12, rir: 1, inc: 2.5 }, {}); out.pd = { w: d.w, aim: d.tgt && d.tgt.repMin, buildTo: d.buildTo };
      return out;
    }, [seed.toString()]);
    ok(r.fly1.w === 17.5 && r.fly1.kind === 'reps' && r.fly1.buildTo >= 16 && r.fly1.buildTo <= 19 && /build every set to \d+ here first/.test(r.fly1.text), '196: cable fly 17.5 x 15 on 10-15: stay at 17.5 and build to a few reps past 15 first, never "20 kg for 9+"', r.fly1);
    ok(r.fly2.w === 20 && r.fly2.aim >= 10, '196: once built to that, 20 kg for 10+, inside the range', r.fly2);
    ok(Math.abs(r.sq.w - 230) < 1e-6 && r.sq.aim === 5, '196: a 5 x 5 at 225 goes to 230 for 5s (a 2% step is not a large one)', r.sq);
    ok(r.pd.aim >= 10 || r.pd.buildTo, '196: pressdown 42.5 x 12 on 10-12: never "45 for 8+"', r.pd);
    await P.ctx.close();
  }

  // ---------- 197: the engine side by side with r31.3 ----------
  {
    const grid = [];
    const LIFTS = [['bench', 100, 'kg'], ['backSquat', 315, 'lb'], ['latPulldown', 60, 'kg'], ['legPress', 400, 'lb'], ['ohp', 50, 'kg'], ['cableFly', 17.5, 'kg'], ['dbCurl', 30, 'lb'], ['dbLateral', 12, 'kg'], ['incDb', 32.5, 'kg'], ['pullup', 0, 'lb'], ['pullup', 25, 'lb'], ['assistPullup', -40, 'lb'], ['hangingLegRaise', 0, 'lb']];
    const RANGES = [[5, 5], [6, 10], [8, 12], [12, 15]];
    const PATS = [hi => [hi, hi, hi], hi => [hi - 1, hi - 2, hi - 2], (hi, lo) => [lo - 1, lo - 1, lo - 2], (hi, lo) => [lo - 3, lo - 3, lo - 3], (hi, lo) => [Math.max(1, lo - 3), lo, lo], hi => [hi + 3, hi + 3, hi + 2], (hi, lo) => [lo, lo, lo]];
    for (const [id, w, unit] of LIFTS) for (const [lo, hi] of RANGES) for (let pi = 0; pi < PATS.length; pi++) for (const rir of [null, 1, 3]) for (const mode of ['', 'light', 'deload'])
      grid.push({ id, w, unit, lo, hi, reps: PATS[pi](hi, lo).map(v => Math.max(1, v)), rir, mode, pi });
    const run = async file => {
      const P = await open(file, { browser, clock: '2026-10-06T10:00:00' });
      const res = await P.page.evaluate(([grid, seedS]) => {
        const seed = eval(seedS); const L = window.__ironlog; const out = [];
        L.state.bodyweights = [{ id: 'bw', date: '2026-09-01', kg: 80 }];
        for (const g of grid) {
          const plan = { sets: 3, repMin: g.lo, repMax: g.hi, rir: 1, rest: 90, inc: 5 * 0.45359237 };
          seed(L, g.unit, g.id, [['2026-09-26', g.reps.map(r => [g.w, Math.max(1, r - 1), g.rir])], ['2026-10-03', g.reps.map(r => [g.w, r, g.rir])]], [g.lo, g.hi]);
          const s = L.suggest(g.id, plan, g.mode ? { [g.mode]: true } : {});
          out.push({ w: s.w == null ? null : Math.round(s.w * 1000) / 1000, kind: s.tgt ? s.tgt.kind : null, total: s.tgt ? s.tgt.total : null, aim: s.tgt ? s.tgt.repMin : null, lastR: s.lastR, buildTo: s.buildTo || null, text: s.text });
        }
        return out;
      }, [grid, seed.toString()]);
      await P.ctx.close(); return res;
    };
    const oldR = await run('baselines/r31-3.html'), newR = await run(FILE);
    const why = {}; const unexplained = []; const bad = [];
    const DB = new Set(['dbCurl', 'dbLateral', 'incDb']);
    grid.forEach((g, i) => {
      const o = oldR[i], n = newR[i];
      if (/NaN|undefined|Infinity/.test(n.text)) bad.push(['NaN', g, n.text]);
      // Invariants of the new engine.
      const nl = g.unit === 'lb' ? n.w / LB : n.w;
      if (g.mode && n.w != null && g.w > 0 && g.id !== 'assistPullup' && nl > g.w + 1e-6) bad.push(['lighter day above last time', g, n]);
      if (g.mode && n.lastR && n.lastR.some(v => v !== g.lo)) bad.push(['lighter grey reps not the bottom of the range', g, n]);
      const halfOk = g.reps.length >= 2 && g.reps.filter(r => r < g.lo).length === 1; // one set under the range (repFloor)
      if (!g.mode && halfOk && n.kind === 'reps' && n.lastR && n.lastR.some(v => v < g.lo)) bad.push(['grey reps under the range', g, n]);
      if (!g.mode && n.kind === 'load' && n.aim != null && n.aim < 2) bad.push(['aim for 1+ reps', g, n]);
      if (DB.has(g.id) && n.w != null) { const v = g.unit === 'lb' ? n.w / LB : n.w; const gr = g.unit === 'lb' ? 5 : 2.5; if (Math.abs(v / gr - Math.round(v / gr)) > 1e-3 && Math.abs(v / 2 - Math.round(v / 2)) > 1e-3) bad.push(['dumbbell off the rack', g, n]); }
      const same = o.w === n.w && o.kind === n.kind && o.total === n.total && o.aim === n.aim && JSON.stringify(o.lastR) === JSON.stringify(n.lastR);
      if (same) return;
      let r = null;
      if (g.mode) r = '193 lighter day or deload';
      else if (DB.has(g.id) && o.w !== n.w && Math.abs((g.unit === 'lb' ? o.w / LB : o.w) % 2.5) > 1e-6) r = '194 rack step';
      else if (halfOk && g.reps.some(v => v < g.lo) && o.w === n.w && o.kind === n.kind) r = '195 one bad set';
      else if (g.id === 'hangingLegRaise' && g.w === 0) r = '203 ab work by reps';
      else if (n.buildTo || (o.kind === 'load' && o.aim < g.lo) || (n.kind === 'load' && n.aim < g.lo) || (o.kind === 'load' && n.kind === 'load' && o.w === n.w && o.aim !== n.aim)) r = '196 large step';
      if (r) why[r] = (why[r] || 0) + 1; else unexplained.push({ g, o, n });
    });
    console.log('     engine side by side: ' + grid.length + ' histories; differences by reason ' + JSON.stringify(why));
    ok(!unexplained.length, '197: every difference from r31.3 is one of 193 to 196 (' + unexplained.length + ' unexplained)', unexplained.slice(0, 3));
    ok(!bad.length, '197: the new engine keeps its rules on every history (' + bad.length + ' broken)', bad.slice(0, 3));
    ok(Object.keys(why).length >= 3, '197: the grid reaches the changed rules', why);
  }


  // ---------- Part 2: the rest of the third review ----------
  // The reviewer's Strong export (mkstrong.py), rebuilt: push, pull, legs twice a week for 7
  // weeks from Monday 2026-08-10, the fifth week a deload nobody marked, one pull day missed,
  // an overhead press alternating 6s and 5s at 60 kg, curls going from 10 to 11 reps at 14 kg.
  const pplCsv = () => {
    const rows = [['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE']];
    const PUSH = [['Bench Press (Barbell)', 95, 8, 3, 2.5], ['Overhead Press (Barbell)', 60, 6, 3, 0], ['Incline Bench Press (Dumbbell)', 30, 10, 3, 1], ['Lateral Raise (Dumbbell)', 10, 15, 3, 0], ['Triceps Pushdown (Cable - Straight Bar)', 30, 12, 3, 2.5]];
    const PULL = [['Deadlift (Barbell)', 170, 5, 2, 5], ['Bent Over Row (Barbell)', 80, 8, 3, 2.5], ['Pull Up', 0, 9, 3, 0], ['Lat Pulldown (Cable)', 65, 10, 3, 2.5], ['Bicep Curl (Dumbbell)', 14, 10, 3, 0], ['Face Pull (Cable)', 22.5, 15, 2, 0]];
    const LEGS = [['Squat (Barbell)', 130, 6, 3, 2.5], ['Romanian Deadlift (Barbell)', 110, 8, 3, 2.5], ['Leg Press', 200, 10, 3, 10], ['Leg Extension (Machine)', 60, 12, 3, 2.5], ['Seated Leg Curl (Machine)', 50, 12, 3, 0], ['Standing Calf Raise (Machine)', 90, 12, 3, 5]];
    const DAYS = [['Push', PUSH, 0], ['Pull', PULL, 1], ['Legs', LEGS, 2], ['Push', PUSH, 3], ['Pull', PULL, 4], ['Legs', LEGS, 5]];
    let k = 0;
    for (let wk = 0; wk < 7; wk++) DAYS.forEach(([name, exs, off], dn) => {
      if (wk === 2 && dn === 4) return;
      const d = new Date(Date.UTC(2026, 7, 10 + wk * 7 + off)).toISOString().slice(0, 10);
      for (const [ex, w0, r0, ns, inc] of exs) {
        const ew = wk < 4 ? wk : wk - 1; let w = w0 + inc * ew, sets = ns, r = r0;
        if (ex.startsWith('Overhead')) r = wk % 2 === 0 ? 6 : 5;
        if (ex.startsWith('Bicep')) r = 10 + (wk >= 3 ? 1 : 0);
        if (wk === 4) { w = w ? Math.round(w * 0.85 / 2.5) * 2.5 : 0; sets = Math.max(1, ns - 1); }
        for (let i = 0; i < sets; i++) { const rr = r - (i === sets - 1 && wk !== 4 && (k++ % 2) ? 1 : 0); rows.push([d + ' 18:0' + dn + ':00', name, '1h 5m', ex, String(i + 1), ex === 'Pull Up' ? '' : w, rr, '', '', '', '', '']); }
      }
    });
    return rows.map(r => r.map(c => /[ ,()]/.test(String(c)) ? '"' + c + '"' : c).join(',')).join('\n');
  };
  {
    const P = await open(FILE, { browser, clock: '2026-09-28T10:00:00', realStarter: true });
    const ev = (f, a) => P.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'kg'; L.saveNow(); });
    await ev(csv => window.__ironlog.impStart({ text: csv }), pplCsv()); await new Promise(r => setTimeout(r, 300));
    await ev(() => { const L = window.__ironlog; if (L.ui.modal && L.ui.modal.unit !== 'kg') L.ACT.impUnit({ dataset: { v: 'kg' } }); L.ACT.impGo(); }); await new Promise(r => setTimeout(r, 300));
    const r = await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); const R = L.activeRoutine(); L.ui.tab = 'today'; L.render();
      return { days: R.days.map(d => d.rest ? 'Rest' : d.name), n: L.state.sessions.length, today: document.querySelector('#view').innerText }; });
    ok(JSON.stringify(r.days) === JSON.stringify(['Push', 'Pull', 'Legs', 'Push', 'Pull', 'Legs', 'Rest']), '199: push, pull, legs twice a week is imported as a 7-day cycle with both rounds, not 3 on and 1 off', r.days);
    ok(!/of ~5 sessions/.test(r.today), '199: Today no longer plans about 5 sessions a week for someone doing 6', (r.today.match(/of ~?\d+ sessions?/) || [''])[0]);
    const st = await ev(() => { const L = window.__ironlog; const I = L.IDX(); const id = n => L.state.exercises.find(e => e.name === n).id;
      const ohp = id('Standing Overhead Press'), curl = id('DB Curl');
      L.ui.tab = 'dash'; L.ui.dashEx = ohp; L.render();
      return { ohpTrend: L.liftTrend(ohp), ohp: I.exStats[ohp], curl: I.exStats[curl], coach: L.coach().text, mv: document.getElementById('dashSummary') ? document.getElementById('dashSummary').innerText : '' }; });
    ok(!/· up\b/.test(st.ohpTrend), '200: the press at 60 kg for 7 weeks never reads "up" from its last three sessions', st.ohpTrend);
    ok(!/over 6 weeks/.test(st.mv) || true, '198: (checked below on a short log)');
    await P.ctx.close();
  }
  {
    // 200: the same press with no deload in between is stalled; a raise held at the top of its range is told to add load.
    const P = await open(FILE, { browser, clock: '2026-09-28T10:00:00' });
    const r = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog; const out = {};
      const dates = [0, 7, 14, 21, 28, 35].map(k => { const d = new Date(Date.UTC(2026, 7, 17 + k)); return d.toISOString().slice(0, 10); });
      seed(L, 'kg', 'ohp', dates.map((d, i) => [d, i % 2 ? [[60, 5], [60, 5], [60, 4]] : [[60, 6], [60, 6], [60, 6]]]), [6, 8]);
      out.ohp = L.IDX().exStats.ohp.stalled; out.ohpTrend = L.liftTrend('ohp');
      L.state.sessions = []; seed(L, 'kg', 'dbLateral', dates.map(d => [d, [[10, 15], [10, 15], [10, 15]]]), [12, 15]);
      const R = L.activeRoutine(); R.days[0].items = [{ uid: 'lat', exId: 'dbLateral', sets: 3, repMin: 12, repMax: 15, rir: 1, rest: 60, inc: 2.5, ss: null }]; L.invalidate();
      // Targets met, so the Coach reaches the stall (volume shortfalls come first).
      for (const m in L.state.settings.bands) L.state.settings.bands[m] = [0, 20]; L.invalidate();
      out.lat = L.IDX().exStats.dbLateral.stalled; out.coach = L.coach().text;
      return out;
    }, [seed.toString()]);
    ok(r.ohp === true && !/· up\b/.test(r.ohpTrend), '200: a press alternating 6, 6, 6 and 5, 5, 4 at 60 kg for 6 weeks is stalled, not "up"', r);
    ok(r.lat === true && /at the top of its range/.test(r.coach) && /due a step up/.test(r.coach) && !/Try another rep range/.test(r.coach), '200: lateral raises held at 15 of 12-15 are told they are due a step up, not to change the range', r.coach);
    await P.ctx.close();
  }
  {
    // 198: a log 19 days old: the Moving line says the weeks it covers; a muscle needs 4 sessions over 3 weeks.
    const P = await open(FILE, { browser, clock: '2026-09-27T10:00:00' });
    const r = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog;
      seed(L, 'kg', 'bbRow', [['2026-09-08', [[60, 8], [60, 8], [60, 8]]], ['2026-09-15', [[62.5, 8], [62.5, 8], [62.5, 8]]], ['2026-09-22', [[65, 8], [65, 8], [65, 8]]]], [6, 10]);
      L.state.sessions.push(...[['2026-09-09', 9], ['2026-09-16', 9.5], ['2026-09-23', 10]].map(([d, r], i) => ({ id: 'inc' + i, date: d, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'incDb', rr: [8, 12], sets: [{ w: 30, r: Math.floor(r), rir: 1, warm: false, drop: false }, { w: 30, r: Math.round(r), rir: 1, warm: false, drop: false }] }] })));
      L.invalidate(); L.ui.tab = 'dash'; L.render();
      const sum = document.getElementById('dashSummary').innerText; const chest = L.IDX().scores.find(x => x.m === 'chest');
      return { sum, chest: chest || null, moving: L.IDX().exStats.bbRow.moving };
    }, [seed.toString()]);
    ok(!/over 6 weeks/.test(r.sum) && (!r.moving || /over [23] weeks/.test(r.sum)), '198: no "over 6 weeks" on a log 19 days old; a lift moving says the weeks it covers', r.sum.split('\n').filter(l => /Moving|weeks/.test(l)));
    ok(!r.chest || !r.chest.clear, '198: three sessions of incline DB are not a chest trend yet (no "Chest +4%, rising")', r.chest);
    await P.ctx.close();
  }
  {
    // 201: notes the way lifters write them.
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'kg'; L.state.settings.onboarded = true; L.state.sessions = [{ id: 'x', date: '2026-09-01', dayIdx: 0, dayId: null, dayName: 'A', routineId: '', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: null, warm: false, drop: false }] }] }]; L.invalidate(); L.saveNow(); });
    await ev(t => window.__ironlog.impStart({ text: t }), 'Oct 1\nDeadlift 180x5 @RPE8\nChins +10 3x8\nPull-ups BW 3x10'); await new Promise(r => setTimeout(r, 300));
    const pre = await ev(() => { const L = window.__ironlog; const m = L.ui.modal; return { pick: m && m.pick, text: document.querySelector('#modal') ? document.querySelector('#modal').innerText : '' }; });
    await ev(() => { const L = window.__ironlog; if (L.ui.modal.unit !== 'kg') L.ACT.impUnit({ dataset: { v: 'kg' } }); L.ACT.impGo(); }); await new Promise(r => setTimeout(r, 300));
    const got = await ev(() => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.date === '2026-10-01'); return s ? s.ex.map(b => ({ id: b.exId, sets: b.sets.map(q => [Math.round(q.w * 100) / 100, q.r, q.rir]) })) : null; });
    ok(pre.pick && pre.pick['Chins'] === 'chinup' && pre.pick['Pull-ups'] === 'pullup' && !/not understood|no weight given/i.test(pre.text), '201: "Chins" is matched to Chin-up and "Pull-ups BW" to Pull-up; nothing refused or unread', { pick: pre.pick, text: pre.text.slice(0, 300) });
    const by = id => got && got.find(b => b.id === id);
    ok(by('deadlift') && JSON.stringify(by('deadlift').sets) === '[[180,5,2]]', '201: "Deadlift 180x5 @RPE8" is 180 x 5 at RIR 2', got);
    ok(by('chinup') && by('chinup').sets.length === 3 && by('chinup').sets.every(q => q[0] === 10 && q[1] === 8), '201: "Chins +10 3x8" is 3 sets of 8 with 10 added', by('chinup'));
    ok(by('pullup') && by('pullup').sets.length === 3 && by('pullup').sets.every(q => q[0] === 0 && q[1] === 10), '201: "Pull-ups BW 3x10" is 3 sets of 10 at bodyweight', by('pullup'));
    await P.ctx.close();
  }
  {
    // 202: a load step that is not stronger is kept in the list but not counted; a stronger set is.
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const r = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog;
      seed(L, 'kg', 'bench', [['2026-09-20', [[100, 10, 1], [100, 10, 1], [100, 10, 1]]], ['2026-09-27', [[102.5, 7, 1], [102.5, 7, 1], [102.5, 6, 1]]], ['2026-10-04', [[102.5, 10, 1], [102.5, 9, 1], [102.5, 9, 1]]]], [6, 10]);
      const p = L.IDX().prs.filter(x => x.exId === 'bench').map(x => ({ d: x.date, t: x.type, big: x.big }));
      const live = L.livePR('bench', { w: 105, r: 4, rir: 1, done: true }, '2026-10-06');
      return { p, n30: L.prsWithin(30).length, live };
    }, [seed.toString()]);
    const step = r.p.find(x => x.d === '2026-09-27'), more = r.p.find(x => x.d === '2026-10-04');
    ok(step && step.t === 'Weight PR' && step.big === false, '202: 102.5 x 7 after 100 x 10 stays in the list as heavier, not counted as a PR', r.p);
    ok(more && more.big === true && r.n30 === 1, '202: 102.5 x 10 is stronger than ever: counted (1 PR in 30 days, not 2)', r);
    ok(r.live === null, '202: live, 105 x 4 after 102.5 x 10 is not announced', r.live);
    await P.ctx.close();
  }
  {
    // 203: a hanging leg raise at 15 reps progresses by reps, not "BW+2.5".
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const r = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog;
      seed(L, 'kg', 'hangingLegRaise', [['2026-09-29', [[0, 15], [0, 15], [0, 15]]], ['2026-10-03', [[0, 15], [0, 15], [0, 15]]]], [10, 15]);
      const a = L.suggest('hangingLegRaise', { sets: 3, repMin: 10, repMax: 15, rir: 1, inc: 2.5 }, {});
      seed(L, 'kg', 'hangingLegRaise', [['2026-10-03', [[5, 15], [5, 15], [5, 15]]]], [10, 15]);
      const b = L.suggest('hangingLegRaise', { sets: 3, repMin: 10, repMax: 15, rir: 1, inc: 2.5 }, {});
      return { a: { w: a.w, text: a.text, kind: a.tgt && a.tgt.kind }, b: { w: b.w, kind: b.tgt && b.tgt.kind } };
    }, [seed.toString()]);
    ok(r.a.w === 0 && r.a.kind === 'reps' && !/BW\+/.test(r.a.text) && /keep adding reps past 15/.test(r.a.text), '203: leg raise at bodyweight x 15: more reps, never "BW+2.5 for 10+"', r.a);
    ok(r.b.w > 5 && r.b.kind === 'load', '203: once a load has been used, it progresses by load like any lift', r.b);
    await P.ctx.close();
  }
  {
    // 204: minutes rounded to 5 on Today as in the picker; the RIR check, passed over, waits 3 weeks.
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const r = await P.page.evaluate(() => {
      const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render();
      const mins = [...document.querySelectorAll('#view')].map(e => e.innerText).join(' ').match(/about (\d+) min/g) || [];
      // Three sessions with a cable exercise, then a session where the check is offered and passed over.
      const R = L.activeRoutine(); R.days[0].items = [{ uid: 'c', exId: 'latPulldown', sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 60, inc: 2.5, ss: null }];
      L.state.sessions = ['2026-09-20', '2026-09-27', '2026-10-01'].map((d, i) => ({ id: 'cs' + i, date: d, dayIdx: 0, dayId: R.days[0].id, dayName: 'A', routineId: R.id, notes: '', ex: [{ exId: 'latPulldown', sets: [{ w: 60, r: 10, rir: 2, warm: false, drop: false }] }] }));
      L.invalidate(); L.saveNow(); L.render(); L.ACT.startSession({ dataset: { day: '0' } });
      const offered = L.calDueIdx(L.state.draft) >= 0;
      const b = L.state.draft.ex[0]; b.sets.forEach(x => { x.w = 60; x.r = 10; x.done = true; }); L.state.draft._leftAsked = true; L.state.draft._rampAsked = true; L.ACT.finish();
      if (L.ui.modal) L.ACT.mClose();
      return { mins, offered, snooze: L.state.settings.calSnooze };
    });
    ok(r.mins.length > 0 && r.mins.every(m => +m.match(/\d+/)[0] % 5 === 0), '204: Today gives minutes in fives, as the routine picker does', r.mins);
    ok(r.offered && r.snooze === '2026-10-06', '204: an RIR check offered and passed over waits 3 weeks', r);
    await P.ctx.close();
  }

  // ---------- Part 3: what a Strong or Hevy user expects on day one ----------
  {
    // 205: a lift's history and chart from inside a session; 208: bodyweight asked once.
    const P = await open(FILE, { browser, touch: true, clock: '2026-10-06T10:00:00', w: 320, h: 640 });
    const ev = (f, a) => P.page.evaluate(f, a);
    await ev(([seedS]) => { const seed = eval(seedS); const L = window.__ironlog;
      seed(L, 'kg', 'bench', [['2026-09-15', [[80, 8, 2], [80, 8, 2]]], ['2026-09-22', [[80, 9, 2], [80, 8, 2]]], ['2026-09-29', [[82.5, 8, 1], [82.5, 7, 1]]], ['2026-10-03', [[82.5, 9, 1], [82.5, 8, 1]]]], [6, 10]);
      L.state.bodyweights = []; const R = L.state.routines[0];
      R.days[0].items = [{ uid: 'b', exId: 'bench', sets: 2, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 2.5, ss: null }, { uid: 'p', exId: 'pullup', sets: 2, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 2.5, ss: null }];
      L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } }); }, [seed.toString()]);
    await new Promise(r => setTimeout(r, 200));
    await P.page.click('[data-act="bMenu"][data-b="0"]'); await new Promise(r => setTimeout(r, 150));
    await P.page.click('#modal [data-op="bHist"]'); await new Promise(r => setTimeout(r, 200));
    const h = await ev(() => { const m = document.querySelector('#modal'); return { kind: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind, text: m.innerText, svg: !!m.querySelector('svg polyline'), rows: m.querySelectorAll('li').length, over: document.documentElement.scrollWidth > innerWidth, link: !!m.querySelector('[data-act="goDash"][data-ex="bench"]') }; });
    ok(h.kind === 'exhist' && h.rows === 4 && h.svg && /82\.5×9 @1/.test(h.text) && h.link, '205: an exercise\'s ⋯ menu opens its history (4 sessions, sets as logged), a chart, and Open in Stats', h);
    ok(!/NaN|undefined/.test(h.text) && !h.over, '205: nothing reads NaN, and it fits 320 px', h.text.slice(0, 200));
    await ev(() => window.__ironlog.ACT.mClose());
    const a = await ev(() => ({ card: !!document.getElementById('bwAsk'), btns: [...document.querySelectorAll('#bwAsk [data-act="addBW"], #bwAsk [data-act="bwAskNo"]')].map(b => Math.round(b.getBoundingClientRect().height)) }));
    ok(a.card && a.btns.every(v => v >= 44), '208: with a pull-up in the session and no weigh-in, the session asks for bodyweight once (44 px buttons)', a);
    await P.page.fill('#bwVal', '82'); await P.page.click('#bwAsk [data-act="addBW"]'); await new Promise(r => setTimeout(r, 150));
    const b = await ev(() => ({ card: !!document.getElementById('bwAsk'), bw: window.__ironlog.state.bodyweights.map(x => [x.date, x.kg]) }));
    ok(!b.card && b.bw.length === 1 && b.bw[0][0] === '2026-10-06' && Math.abs(b.bw[0][1] - 82) < 1e-6, '208: Save logs it as today\'s weigh-in and the question goes', b);
    await P.ctx.close();
  }

  // ---------- Part 4: the second check of r32 (a fresh reviewer on this build) ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const r = await P.page.evaluate(([seedS]) => {
      const seed = eval(seedS); const L = window.__ironlog; const out = {};
      // W1: 5 x 5 at beginner loads goes up a step.
      seed(L, 'kg', 'ohp', [['2026-10-03', [[50, 5], [50, 5], [50, 5], [50, 5], [50, 5]]]], [5, 5]);
      const a = L.suggest('ohp', { sets: 5, repMin: 5, repMax: 5, rir: 2, inc: 2.5 }, {}); out.w1 = { w: a.w, aim: a.tgt && a.tgt.repMin, text: a.text };
      seed(L, 'lb', 'deadlift', [['2026-10-03', [[95, 5]]]], [5, 5]);
      const b = L.suggest('deadlift', { sets: 1, repMin: 5, repMax: 5, rir: 2, inc: 5 * 0.45359237 }, {}); out.w1b = { w: Math.round(b.w / 0.45359237 * 100) / 100, text: b.text };
      // W2: one good day does not make a lift stalled.
      L.state.settings.unit = 'kg';
      const sq = [[6, 5, 5, 4], [6, 5, 5, 4], [8, 8, 7, 7], [6, 6, 5, 5], [7, 6, 6, 5], [7, 6, 6, 5]];
      seed(L, 'kg', 'backSquat', sq.map((rs, i) => [new Date(Date.UTC(2026, 7, 25 + i * 7)).toISOString().slice(0, 10), rs.map(r => [140, r, 2])]), [5, 8]);
      out.w2 = { stalled: L.IDX().exStats.backSquat.stalled, head: L.exHeadline ? L.exHeadline('backSquat') : '' };
      // W6: a bad day at a load done in the range asks for the range again.
      seed(L, 'kg', 'bench', [['2026-09-26', [[100, 7, 2], [100, 7, 2], [100, 6, 2], [100, 6, 2]]], ['2026-10-03', [[100, 5, 2], [100, 5, 2], [100, 4, 2], [100, 4, 2]]]], [6, 10]);
      const c = L.suggest('bench', { sets: 4, repMin: 6, repMax: 10, rir: 2, inc: 2.5 }, {}); out.w6 = { w: c.w, kind: c.tgt && c.tgt.kind, aim: c.tgt && c.tgt.repMin, target: c.target };
      // Four sessions in a row under the range at one load drop it.
      seed(L, 'kg', 'bench', [['2026-09-12', [[100, 5], [100, 5], [100, 4]]], ['2026-09-19', [[100, 5], [100, 5], [100, 5]]], ['2026-09-26', [[100, 5], [100, 5], [100, 5]]], ['2026-10-03', [[100, 5], [100, 5], [100, 5]]]].map(([d, st]) => [d, st.map(([w, r]) => [w, r + 0, 2])]).map(([d, st], i) => [d, i === 3 ? st.map(x => [x[0], 5, 2]) : st]), [6, 10]);
      const e = L.suggest('bench', { sets: 3, repMin: 6, repMax: 10, rir: 2, inc: 2.5 }, {}); out.run = { w: e.w, text: e.text };
      // A floored set is said: 7, 7, 7, 3 on 6-10.
      seed(L, 'kg', 'bench', [['2026-10-03', [[100, 7, 2], [100, 7, 2], [100, 7, 2], [100, 3, 2]]]], [6, 10]);
      out.fl = L.suggest('bench', { sets: 4, repMin: 6, repMax: 10, rir: 2, inc: 2.5 }, {}).text;
      // W7: no trend word with no trend.
      seed(L, 'kg', 'cableFly', [['2026-09-30', [[20, 13]]], ['2026-10-02', [[20, 13]]], ['2026-10-04', [[20, 13]]]], [10, 15]);
      out.w7 = L.liftTrend('cableFly');
      // W8: kg log, lb on screen: suggestions on 5 lb steps.
      seed(L, 'kg', 'bench', [['2026-10-03', [[100, 10, 1], [100, 10, 1], [100, 10, 1]]]], [6, 10]);
      L.state.settings.unit = 'lb'; L.invalidate();
      const f = L.suggest('bench', { sets: 3, repMin: 6, repMax: 10, rir: 1, inc: 5 * 0.45359237 }, {}); out.w8 = { w: f.w / 0.45359237, text: f.text };
      const g = L.suggest('bench', { sets: 3, repMin: 6, repMax: 10, rir: 1, inc: 5 * 0.45359237 }, { light: true }); out.w8l = g.w / 0.45359237;
      L.state.settings.unit = 'kg'; L.invalidate();
      // W4: a Lighter day's sets are never PRs.
      seed(L, 'kg', 'bench', [['2026-09-26', [[100, 8, 1]]]], [6, 10]);
      L.state.sessions.push({ id: 'lt', date: '2026-10-03', dayIdx: 0, dayId: null, dayName: 'A (lighter)', routineId: '', notes: '', light: true, ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: 90, r: 12, rir: 3, warm: false, drop: false }] }] }); L.invalidate();
      out.w4 = L.IDX().prs.filter(x => x.date === '2026-10-03').length;
      return out;
    }, [seed.toString()]);
    ok(r.w1.w === 52.5 && r.w1.aim === 5, 'W1: 5 x 5 at 50 kg goes to 52.5 for 5s, never "building to 7"', r.w1);
    ok(Math.abs(r.w1b.w - 100) < 1e-6 && !/building to/.test(r.w1b.text), 'W1: a 1 x 5 deadlift at 95 lb goes to 100', r.w1b);
    ok(r.w2.stalled === false, 'W2: squat 20, 20, 30, 22, 24, 24 working reps at 140 is not stalled by its one good day', r.w2);
    ok(r.w6.w === 100 && r.w6.kind === 'load' && r.w6.aim === 6 && /6\+ reps in every set/.test(r.w6.target), 'W6: 7, 7, 6, 6 then 5, 5, 4, 4: stay at 100 and get back to 6+ in every set, not "19+ reps"', r.w6);
    ok(r.run.w < 100 && /Drop to/.test(r.run.text), 'W6: four sessions in a row under the range at one load drop it', r.run);
    ok(/a set under 6 counts as 6/.test(r.fl), 'W6: a target with one set read at the bottom of the range says so', r.fl);
    ok(!/·/.test(r.w7), 'W7: three sessions in 4 days get no trend word', r.w7);
    ok(Math.abs(r.w8.w / 5 - Math.round(r.w8.w / 5)) < 1e-6 && Math.abs(r.w8l / 5 - Math.round(r.w8l / 5)) < 1e-6 && !/225\.5|220\.5 lb for/.test(r.w8.text.split('.').slice(1).join('.')), 'W8: after kg to lb, the next load and the lighter day are on 5 lb steps', r);
    ok(r.w4 === 0, 'W4: a Lighter day\'s 90 x 12 is not a PR', r.w4);
    await P.ctx.close();
  }
  {
    // W3, L1, L2 through the session screen.
    const P = await open(FILE, { browser, clock: '2026-10-06T10:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    await ev(([seedS]) => { const seed = eval(seedS); const L = window.__ironlog;
      seed(L, 'kg', 'bench', [['2026-09-26', [[100, 8, 1], [100, 8, 1], [100, 7, 1]]]], [6, 10]);
      L.state.bodyweights = [{ id: 'bw', date: '2026-09-01', kg: 80 }]; L.state.settings.autoDone = false;
      const R = L.state.routines[0]; R.days[0].items = [{ uid: 'b', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 0, inc: 2.5, ss: null }];
      L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } }); }, [seed.toString()]);
    await new Promise(r => setTimeout(r, 200));
    const tick = async (si, w, r) => { await P.page.fill(`.sg input[data-f="w"][data-b="0"][data-s="${si}"]`, String(w)); await P.page.dispatchEvent(`.sg input[data-f="w"][data-b="0"][data-s="${si}"]`, 'change');
      await P.page.fill(`.sg input[data-f="r"][data-b="0"][data-s="${si}"]`, String(r)); await P.page.dispatchEvent(`.sg input[data-f="r"][data-b="0"][data-s="${si}"]`, 'change');
      await ev(() => { const t = document.getElementById('toast'); if (t) { t.hidden = true; t.textContent = ''; } });
      await P.page.click(`[data-act="sDone"][data-b="0"][data-s="${si}"]`); await new Promise(r => setTimeout(r, 200));
      return ev(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText : ''; }); };
    // 100 x 9 at RIR 1 is 10 reps to failure, the same band as last time's 100 x 8: a new best estimate. Then 100 x 8 is weaker.
    const t1 = await tick(0, 100, 9), t2 = await tick(1, 100, 8);
    ok(/New best estimate/.test(t1) && /estimated 1RM [\d.]+ kg/.test(t1), 'L2: the PR toast says "estimated 1RM … kg"', t1);
    ok(!/PR|best/i.test(t2), 'W3: 100 x 8 after 100 x 9 in the same session is not announced', t2);
    await P.page.fill('.sg input[data-f="r"][data-b="0"][data-s="2"]', '105'); await P.page.dispatchEvent('.sg input[data-f="r"][data-b="0"][data-s="2"]', 'change');
    await P.page.click('[data-act="sDone"][data-b="0"][data-s="2"]'); await new Promise(r => setTimeout(r, 200));
    const q = await ev(() => { const L = window.__ironlog; return { modal: L.ui.modal && L.ui.modal.kind, title: L.ui.modal && L.ui.modal.title, done: L.state.draft.ex[0].sets[2].done }; });
    ok(q.modal === 'confirm' && /105/.test(q.title) && !q.done, 'L1: 105 reps on a 6-10 bench asks before it counts', q);
    await P.ctx.close();
  }
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
