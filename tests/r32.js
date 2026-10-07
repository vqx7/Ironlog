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
      const halfOk = g.reps.filter(r => r >= g.lo).length * 2 >= g.reps.length;
      if (!g.mode && halfOk && n.kind === 'reps' && n.lastR && n.lastR.some(v => v < g.lo)) bad.push(['grey reps under the range', g, n]);
      if (!g.mode && n.kind === 'load' && n.aim != null && n.aim < 2) bad.push(['aim for 1+ reps', g, n]);
      if (DB.has(g.id) && n.w != null) { const v = g.unit === 'lb' ? n.w / LB : n.w; const gr = g.unit === 'lb' ? 5 : 2.5; if (Math.abs(v / gr - Math.round(v / gr)) > 1e-3 && Math.abs(v / 2 - Math.round(v / 2)) > 1e-3) bad.push(['dumbbell off the rack', g, n]); }
      const same = o.w === n.w && o.kind === n.kind && o.total === n.total && o.aim === n.aim && JSON.stringify(o.lastR) === JSON.stringify(n.lastR);
      if (same) return;
      let r = null;
      if (g.mode) r = '193 lighter day or deload';
      else if (DB.has(g.id) && o.w !== n.w && Math.abs((g.unit === 'lb' ? o.w / LB : o.w) % 2.5) > 1e-6) r = '194 rack step';
      else if (halfOk && g.reps.some(v => v < g.lo) && o.w === n.w && o.kind === n.kind) r = '195 one bad set';
      else if (n.buildTo || (o.kind === 'load' && o.aim < g.lo) || (n.kind === 'load' && n.aim < g.lo) || (o.kind === 'load' && n.kind === 'load' && o.w === n.w && o.aim !== n.aim)) r = '196 large step';
      if (r) why[r] = (why[r] || 0) + 1; else unexplained.push({ g, o, n });
    });
    console.log('     engine side by side: ' + grid.length + ' histories; differences by reason ' + JSON.stringify(why));
    ok(!unexplained.length, '197: every difference from r31.3 is one of 193 to 196 (' + unexplained.length + ' unexplained)', unexplained.slice(0, 3));
    ok(!bad.length, '197: the new engine keeps its rules on every history (' + bad.length + ' broken)', bad.slice(0, 3));
    ok(Object.keys(why).length >= 3, '197: the grid reaches the changed rules', why);
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
