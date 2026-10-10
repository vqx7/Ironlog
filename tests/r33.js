// r33 (V, 2026-10-09): Your gym (item 207), effort in half points or RPE
// (item 206), Most common from measured data with the library checked, and
// on the built app the first page's tour and the new sign-out.
// Part 1 runs on the source and again on dist/ (tests/run.js); Part 2 builds
// dist/ and runs once, against the stand-in Supabase.
const fs = require('fs'); const os = require('os'); const path = require('path');
const { execFileSync } = require('child_process');
const { open, cspFix } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = 'index.html';
const LBK = 0.45359237;
// Sessions in lb, stored in kg as the app stores them.
const mk = (id, d, exId, sets, rr, extra) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ...(extra || {}), ex: [{ exId, rr, sets: sets.map(([w, r, rir]) => ({ w: w * LBK, r, rir, done: true })) }] });

// The histories the no-gym check runs over: every branch of the engine on the lift kinds that Your gym touches.
const CASES = (() => {
  const out = []; const D = ['2026-09-18', '2026-09-25', '2026-10-02'];
  const lifts = [['dbLateral', 20, [12, 15]], ['incDb', 60, [8, 10]], ['goblet', 50, [8, 12]], ['bench', 185, [6, 10]], ['backSquat', 225, [5, 5]], ['cableRow', 120, [8, 12]], ['legPress', 300, [10, 15]], ['landmineRow', 70, [8, 12]], ['kbSwing', 35, [12, 15]], ['ohp', 95, [6, 10]], ['hammer', 32.5, [8, 12]]];
  const shapes = { top: (w, rr) => [[w, rr[1], 1], [w, rr[1], 1], [w, rr[1], 2]], mid: (w, rr) => [[w, rr[0] + 1, 1], [w, rr[0], 1], [w, rr[0], 1]], low: (w, rr) => [[w, rr[0] - 3, 0], [w, rr[0] - 3, 0]], easy: (w, rr) => [[w, rr[0] + 1, 4], [w, rr[0] + 1, 4]], past: (w, rr) => [[w, rr[1] + 4, 1], [w, rr[1] + 4, 1]] };
  for (const [ex, w, rr] of lifts) for (const k of Object.keys(shapes)) out.push({ ex, rr, hist: [mk('a', D[0], ex, shapes.mid(w, rr), rr), mk('b', D[1], ex, shapes[k](w, rr), rr)] });
  return out;
})();
async function engineRun(page, cases, gym) {
  return page.evaluate(([cases, gym]) => {
    const L = window.__ironlog; const res = [];
    for (const c of cases) {
      L.state.settings.onboarded = true; L.state.settings.unit = 'lb'; L.state.draft = null; L.state.sessions = c.hist;
      if (gym) L.state.settings.gym = gym; else delete L.state.settings.gym;
      L.invalidate();
      const plan = { sets: 3, repMin: c.rr[0], repMax: c.rr[1], rir: 1, rest: 90, inc: 5 * 0.45359237 };
      for (const o of [{}, { light: true }, { deload: true }]) { const x = L.suggest(c.ex, plan, o); res.push([c.ex, JSON.stringify(o), x.w, x.text, x.target]); }
    }
    return res;
  }, [cases, gym || null]);
}

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();

  // ---------- Part 1a: nothing set in Your gym changes nothing ----------
  {
    const A = await open(FILE, { browser, clock: '2026-10-09T12:00:00' });
    const B = await open('baselines/r32-1.html', { browser, clock: '2026-10-09T12:00:00' });
    const a = await engineRun(A.page, CASES), b = await engineRun(B.page, CASES);
    const diff = a.map((x, i) => JSON.stringify(x) === JSON.stringify(b[i]) ? null : [x, b[i]]).filter(Boolean);
    ok(a.length === CASES.length * 3 && !diff.length, `with no gym set, all ${a.length} suggestions (normal, lighter day, deload) match r32.1 word for word`, diff.slice(0, 3));
    // An older build keeps Your gym when it loads and saves a log (its settings spread unknown keys).
    const gym = { u: 'lb', db: { lo: 5, hi: 100, st: 5, fine: 2.5, fineTo: 25 }, kb: [18, 26, 35], plates: [45, 25, 10, 5], stack: 10 };
    const kept = await B.page.evaluate(g => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); s.settings.gym = g; s.settings.rirScale = 'rpe'; const n = L.normalize(s); return { gym: n.settings.gym, sc: n.settings.rirScale }; }, gym);
    ok(JSON.stringify(kept.gym) === JSON.stringify(gym) && kept.sc === 'rpe', 'r32.1 keeps Your gym and the effort setting through its own load and save, so phones on either build agree', kept);
    await A.ctx.close().catch(() => {}); await B.ctx.close().catch(() => {});
  }

  // ---------- Part 1a2: the first page's styles touch nothing else ----------
  // r33's first draft named the tour's pictures .tv, a class the rest timer and At a glance already use: the
  // timer grew to 150 px and covered Finish (tests/r22.js caught it). Measured against r32.1 on the same screens.
  {
    const measure = async file => {
      const P = await open(file, { browser, touch: true, clock: '2026-09-27T18:00:00' });
      const r = await P.page.evaluate(async () => {
        const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); for (const x of L.state.sessions) delete x.demo;
        L.state.settings.hidden = []; L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
        document.querySelectorAll('#view details').forEach(d => { d.open = true; });
        const tile = document.querySelector('.tile .tv'); const tileBox = tile ? [Math.round(tile.getBoundingClientRect().height), getComputedStyle(tile).fontSize, getComputedStyle(tile).backgroundColor] : null;
        L.ACT.startSession({ dataset: { day: '0' } }); L.ACT.tStart({ dataset: { b: '0' } }); await new Promise(r => setTimeout(r, 200));
        const t = document.getElementById('timer'), v = t.querySelector('.tv');
        return { timer: Math.round(t.getBoundingClientRect().height), value: v ? [Math.round(v.getBoundingClientRect().height), getComputedStyle(v).fontSize, getComputedStyle(v).backgroundColor, getComputedStyle(v).padding] : null, tile: tileBox };
      });
      await P.ctx.close(); return r;
    };
    const now = await measure(FILE), was = await measure('baselines/r32-1.html');
    ok(JSON.stringify(now) === JSON.stringify(was) && now.value && now.tile, 'the rest timer and the At a glance numbers are the same size and look as in r32.1', { now, was });
  }

  // ---------- Part 1b: Your gym in the numbers ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-09T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const rack = { u: 'lb', db: { lo: 5, hi: 100, st: 5, fine: 2.5, fineTo: 25 } };
    const R = await ev(rack => {
      const L = window.__ironlog; const LB = 0.45359237; const lb = v => v == null ? null : Math.round(v / LB * 1000) / 1000; const o = {};
      const mk = (id, d, exId, sets, rr) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId, rr, sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir, done: true })) }] });
      const set = (sessions, gym) => { L.state.settings.onboarded = true; L.state.settings.unit = 'lb'; L.state.draft = null; L.state.sessions = sessions; if (gym) L.state.settings.gym = gym; else delete L.state.settings.gym; L.state = L.normalize(L.state); L.invalidate(); };
      const P = (a, b) => ({ sets: 3, repMin: a, repMax: b, rir: 1, rest: 90, inc: 5 * LB });
      o.list = L.dbListOf(rack.db);
      // 20 lb raises at the top of 12 to 15: the next dumbbell is 22.5 on this rack, not 25.
      set([mk('a', '2026-10-02', 'dbLateral', [[20, 18, 1], [20, 18, 1], [20, 18, 1]], [12, 15])], rack);
      let x = L.suggest('dbLateral', P(12, 15), {}); o.up = [lb(x.w), x.text];
      x = L.suggest('dbLateral', P(12, 15), { deload: true }); o.deload = lb(x.w);
      x = L.suggest('dbLateral', P(12, 15), { light: true }); o.light = lb(x.w);
      // 60 lb presses at the top of 8 to 10: 65 (5 lb steps above 25).
      set([mk('a', '2026-10-02', 'incDb', [[60, 10, 1], [60, 10, 1], [60, 10, 1]], [8, 10])], rack);
      x = L.suggest('incDb', P(8, 10), {}); o.press = [lb(x.w), x.text];
      // The top of the rack is the heaviest available.
      const short = { u: 'lb', db: { lo: 5, hi: 55, st: 5 } };
      set([mk('a', '2026-10-02', 'incDb', [[50, 10, 1], [50, 10, 1], [50, 10, 1]], [8, 10])], short);
      x = L.suggest('incDb', P(8, 10), {}); o.capUp = [lb(x.w), x.text];
      set([mk('a', '2026-10-02', 'incDb', [[55, 10, 1], [55, 10, 1], [55, 10, 1]], [8, 10])], short);
      x = L.suggest('incDb', P(8, 10), {}); o.capAt = [lb(x.w), x.text, x.capped];
      // A step set on the exercise wins over the rack.
      set([mk('a', '2026-10-02', 'dbLateral', [[20, 18, 1], [20, 18, 1], [20, 18, 1]], [12, 15])], rack);
      L.EX('dbLateral').inc = 5 * LB; L.invalidate(); x = L.suggest('dbLateral', P(12, 15), { deload: true }); o.own = lb(x.w); delete L.EX('dbLateral').inc;
      // So does a step set in the plan.
      x = L.suggest('dbLateral', { ...P(12, 15), inc: 1 * LB }, { deload: true }); o.planStep = lb(x.w);
      // Plates: no 2.5s on hand makes a bar step 10 lb.
      set([mk('a', '2026-10-02', 'bench', [[135, 10, 1], [135, 10, 1], [135, 10, 1]], [6, 10])], { u: 'lb', plates: [45, 35, 25, 10, 5] });
      x = L.suggest('bench', P(6, 10), {}); o.bench = [lb(x.w), x.text]; o.plates = L.plateText(140 * LB, 'bar', L.EX('bench'));
      // Stacks: a 10 lb pin step.
      set([mk('a', '2026-10-02', 'cableRow', [[100, 12, 1], [100, 12, 1], [100, 12, 1]], [8, 12])], { u: 'lb', stack: 10 });
      x = L.suggest('cableRow', P(8, 12), {}); o.stack = lb(x.w);
      // Kettlebells: the bells listed.
      set([mk('a', '2026-10-02', 'kbSwing', [[35, 20, 1], [35, 20, 1]], [12, 15])], { u: 'lb', kb: [18, 26, 35, 44, 53] });
      x = L.suggest('kbSwing', P(12, 15), { deload: true }); o.kbDown = lb(x.w);
      o.kbRack = (L.gymRack(L.EX('kbSwing'), P(12, 15)) || []).map(lb);
      // A rack in lb with the app in kg: the suggestion is still a dumbbell the gym has.
      set([mk('a', '2026-10-02', 'dbLateral', [[20, 18, 1], [20, 18, 1], [20, 18, 1]], [12, 15])], rack); L.state.settings.unit = 'kg'; L.invalidate();
      x = L.suggest('dbLateral', { ...P(12, 15), inc: 2.5 }, {}); o.kg = [x.w, (L.gymRack(L.EX('dbLateral'), P(12, 15)) || []).some(v => Math.abs(v - x.w) < 1e-6), x.text];
      L.state.settings.unit = 'lb';
      // Lifts it does not touch: bodyweight, a two-dumbbell lift logged as the total, a timed hold.
      L.EX('incDb').load = 'total'; o.totalSkip = L.gymRack(L.EX('incDb'), P(8, 10)); delete L.EX('incDb').load;
      o.bwSkip = L.gymRack(L.EX('pullup'), P(6, 10)); o.timedSkip = L.gymRack(L.EX('farmerHold'), P(30, 60)); o.oneDb = !!L.gymRack(L.EX('goblet'), P(8, 12));
      return o;
    }, rack);
    ok(R.list.length === 24 && R.list[0] === 5 && R.list[8] === 25 && R.list[9] === 30 && R.list[23] === 100, 'a rack from 5 to 100 by 5, with 2.5 steps to 25, is the 24 dumbbells it says', R.list);
    ok(R.up[0] === 22.5 && /add 2\.5 lb/.test(R.up[1]), 'after 20 lb at the top of the range, the next dumbbell is 22.5, not 25', R.up);
    ok(R.deload === 17.5 && R.light === 17.5, 'a deload or lighter day from 20 lb is 17.5 (90% is 18, the dumbbell under it), not 15', [R.deload, R.light]);
    ok(R.press[0] === 65 && /add 5 lb/.test(R.press[1]), 'above 25 the rack steps by 5: 60 lb at the top of the range goes to 65', R.press);
    ok(R.capUp[0] === 55 && /heaviest available/.test(R.capUp[1]), 'the top of the rack is the heaviest available: 50 to 55, said so', R.capUp);
    ok(R.capAt[0] === 55 && R.capAt[2] === true && /heaviest load available/.test(R.capAt[1]), 'at the top of the rack, more reps instead of a dumbbell that is not there', R.capAt);
    ok(R.own === 15, 'a step set on the exercise wins over the rack (5 lb steps: the deload from 20 is 15)', R.own);
    ok(R.planStep === 18, 'a step set in the plan wins over the rack too (1 lb steps: 18)', R.planStep);
    ok(R.bench[0] === 145 && /add 10 lb/.test(R.bench[1]), 'with no 2.5 lb plates on hand a bar steps by 10: 135 to 145', R.bench);
    ok(/^Per side at 140: 45 \(2\.5 lb not loadable\)$/.test(R.plates), 'the plates line uses only the plates on hand (140 needs a 2.5 the gym does not have)', R.plates);
    ok(R.stack === 110, 'a 10 lb stack step: 100 to 110', R.stack);
    ok(R.kbRack.join() === '18,26,35,44,53' && R.kbDown === 26, 'kettlebells are the bells listed: a deload from 35 is 26', [R.kbRack, R.kbDown]);
    ok(R.kg[1], 'a rack in lb with the app in kg still suggests a dumbbell the gym has', R.kg);
    ok(R.totalSkip === null && R.bwSkip === null && R.timedSkip === null && R.oneDb, 'not on the rack: bodyweight, timed holds, and a two-dumbbell lift logged as the total; a one-dumbbell lift is', R);

    // Every suggestion on a rack lift is a dumbbell on the rack (or last time's load, which was lifted).
    const prop = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const bad = []; let n = 0;
      const gym = { u: 'lb', db: { lo: 5, hi: 80, st: 5, fine: 2.5, fineTo: 20 } };
      L.state.settings.gym = gym; L.state = L.normalize(L.state); const exs = ['dbLateral', 'incDb', 'hammer', 'goblet', 'dbRow', 'seatedDbPress', 'dbCurl'];
      let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      for (let t = 0; t < 400; t++) {
        const exId = exs[t % exs.length]; const lo = 6 + Math.floor(rnd() * 6); const hi = lo + 2 + Math.floor(rnd() * 6);
        const w = [7, 12, 17.5, 22.5, 27, 30, 45, 62.5, 80, 85][Math.floor(rnd() * 10)];
        const reps = () => Math.max(1, lo - 3 + Math.floor(rnd() * (hi - lo + 8)));
        const sets = Array.from({ length: 3 }, () => ({ w: w * LB, r: reps(), rir: Math.floor(rnd() * 5), done: true }));
        L.state.sessions = [{ id: 'p' + t, date: '2026-10-02', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId, rr: [lo, hi], sets }] }];
        L.state.draft = null; L.invalidate();
        const plan = { sets: 3, repMin: lo, repMax: hi, rir: 1 + Math.floor(rnd() * 2), rest: 90, inc: 5 * LB };
        const R = L.gymRack(L.EX(exId), plan);
        for (const o of [{}, { light: true }, { deload: true }]) {
          const x = L.suggest(exId, plan, o); n++;
          if (x.w == null) continue;
          const onR = R.some(v => Math.abs(v - x.w) < 1e-6), same = Math.abs(x.w - w * LB) < 1e-6;
          if (!onR && !same) bad.push([exId, w, o, x.w / LB, x.text]);
          if ((o.light || o.deload) && x.w > w * LB + 1e-6) bad.push(['heavier', exId, w, o, x.w / LB]);
          if (!/^[^]*$/.test(x.text) || /NaN|undefined|Infinity/.test(x.text + x.target)) bad.push(['text', x.text]);
        }
      }
      delete L.state.settings.gym; return { n, bad: bad.slice(0, 5), nb: bad.length };
    });
    ok(prop.n === 1200 && prop.nb === 0, `400 random dumbbell histories, ${prop.n} suggestions: every load is a dumbbell on the rack or last time's, lighter days never heavier, no NaN`, prop);

    // Settings > Your gym, as typed.
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; delete L.state.settings.gym; L.saveNow(); L.ui.tab = 'settings'; L.ui.folds['settings:gym'] = true; L.render(); document.querySelectorAll('#view details[data-sk="settings:gym"]').forEach(d => { d.open = true; }); });
    const typeIn = async (sel, v) => { await P.page.fill(sel, v); await P.page.dispatchEvent(sel, 'change'); await wait(80); await ev(() => document.querySelectorAll('#view details[data-sk="settings:gym"]').forEach(d => { d.open = true; })); };
    ok(await ev(() => /usual steps/.test(document.querySelector('[data-sk="settings:gym"] .sec-s').textContent) && !!document.querySelector('[data-bind="barKg"]') && !!document.querySelector('[data-bind="smallPlates"]')), 'Your gym starts on the usual steps, with the bar weight and small plates moved into it');
    await typeIn('[data-gym="db.lo"]', '5');
    const half = await ev(() => ({ g: window.__ironlog.state.settings.gym || null, lo: document.querySelector('[data-gym="db.lo"]').value, msg: document.getElementById('gymDbList').textContent }));
    ok(half.g === null && half.lo === '5' && /Add From, To, and Step/.test(half.msg), 'a half-filled rack is kept on screen, not saved, and says what is missing', half);
    await typeIn('[data-gym="db.hi"]', '100'); await typeIn('[data-gym="db.st"]', '5');
    let g = await ev(() => ({ g: window.__ironlog.state.settings.gym, msg: document.getElementById('gymDbList').textContent, sub: document.querySelector('[data-sk="settings:gym"] .sec-s').textContent }));
    ok(JSON.stringify(g.g) === JSON.stringify({ u: 'lb', db: { lo: 5, hi: 100, st: 5 } }) && /20 pairs: 5, 10, 15, 20, 25 … 95, 100 lb/.test(g.msg) && /dumbbells 5 to 100 lb/.test(g.sub), 'From, To, and Step make the rack, listed under it and in the section line', g);
    await typeIn('[data-gym="db.fine"]', '2,5'); await typeIn('[data-gym="db.fineTo"]', '25');
    g = await ev(() => ({ g: window.__ironlog.state.settings.gym, msg: document.getElementById('gymDbList').textContent }));
    ok(g.g.db.fine === 2.5 && g.g.db.fineTo === 25 && /24 pairs/.test(g.msg), 'smaller steps at the light end (a comma decimal too) add the 2.5s up to 25', g);
    await typeIn('[data-gym="kb"]', '16 8, 12;24, 8');
    ok(await ev(() => window.__ironlog.state.settings.gym.kb.join()) === '8,12,16,24', 'kettlebells typed in any order, any separator, are sorted with repeats dropped');
    await ev(() => document.querySelector('[data-act="gymPlate"][data-v="2.5"]').click()); await wait(80);
    g = await ev(() => ({ p: window.__ironlog.state.settings.gym.plates, pressed: document.querySelector('[data-act="gymPlate"][data-v="2.5"]').getAttribute('aria-pressed') }));
    ok(g.p.join() === '45,35,25,10,5' && g.pressed === 'false', 'a plate tapped off is taken out of the plates on hand', g);
    await ev(() => document.querySelector('[data-act="gymPlate"][data-v="2.5"]').click()); await wait(80);
    ok(await ev(() => window.__ironlog.state.settings.gym.plates === undefined), 'all plates back on is the same as not set');
    await typeIn('[data-gym="stack"]', '10');
    ok(await ev(() => window.__ironlog.state.settings.gym.stack) === 10, 'the stack step is saved');
    // Junk from an import or a hand-edited backup is dropped, never guessed.
    const junk = await ev(() => window.__ironlog.gymClean({ u: 'stone', db: { lo: 5, hi: 10, st: 5 } }) === null && JSON.stringify(window.__ironlog.gymClean({ u: 'kg', db: { lo: -2, hi: 10, st: 2 }, kb: ['x', 0, 16, 1e9], plates: [20, 7, 25], stack: 0 })));
    ok(junk === '{"u":"kg","kb":[16],"plates":[25,20]}', 'bad values are dropped: an unknown unit, a negative dumbbell, non-numbers, plates that do not exist, a 0 step', junk);
    // A session in progress takes the rack on exercises with nothing ticked.
    const live = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; delete L.state.settings.gym;
      L.state.sessions = [{ id: 'q', date: '2026-10-02', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'dbLateral', rr: [12, 15], sets: [0, 1, 2].map(() => ({ w: 20 * LB, r: 13, rir: 1, done: true })) }] }];
      L.invalidate(); L.ACT.startFree(); L.ACT.mClose && L.ACT.mClose();
      const d = L.state.draft; const plan = { sets: 3, repMin: 12, repMax: 15, rir: 1, rest: 90, inc: 5 * LB };
      d.ex.push({ exId: 'dbLateral', plan, sets: [0, 1, 2].map(() => ({ w: null, r: null, rir: null, warm: false, drop: false, done: false })), note: '', sw: null, light: true });
      L.refreshEx('dbLateral'); const before = d.ex[0].sw / LB;
      L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details[data-sk="settings:gym"]').forEach(x => { x.open = true; });
      return before;
    });
    await typeIn('[data-gym="db.lo"]', '5'); await typeIn('[data-gym="db.hi"]', '50'); await typeIn('[data-gym="db.st"]', '2.5');
    const after = await ev(() => window.__ironlog.state.draft.ex[0].sw / 0.45359237);
    ok(Math.abs(live - 15) < 1e-6 && Math.abs(after - 17.5) < 1e-6, 'a lighter day in progress moves from 15 to 17.5 when a rack in 2.5s is set', [live, after]);
    // The step sheet says the lift follows the rack, and Save unchanged keeps it that way.
    const sheet = await ev(() => { const L = window.__ironlog; L.ACT.mClose && L.ACT.mClose(); L.ui.modal = null; L.openModal ? L.openModal({ kind: 'inc', exId: 'dbLateral', plan: { inc: 5 * 0.45359237 } }) : null; return null; });
    const hasOpen = await ev(() => typeof window.__ironlog.openModal === 'function');
    if (hasOpen) {
      const t = await ev(() => document.getElementById('modal').innerText);
      await ev(() => window.__ironlog.ACT.incSave()); await wait(50);
      ok(/Following the dumbbells in Settings > Your gym/.test(t) && await ev(() => window.__ironlog.EX('dbLateral').inc == null), 'the load step sheet says the lift follows Your gym, and saving it unchanged keeps it so', t);
    }
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details[data-sk="settings:gym"]').forEach(x => { x.open = true; }); });
    await ev(() => document.querySelector('[data-act="gymClear"]').click()); await wait(80);
    ok(await ev(() => window.__ironlog.state.settings.gym === undefined && /usual steps/.test(document.querySelector('[data-sk="settings:gym"] .sec-s').textContent)), 'Clear my gym goes back to the usual steps');
    await ev(() => window.__ironlog.ACT.undo()); await wait(300);
    ok(await ev(() => !!window.__ironlog.state.settings.gym && window.__ironlog.state.settings.gym.db.hi === 50), 'and Undo brings the gym back');
    const wide = await ev(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(wide && !P.errors.length, 'Your gym fits the screen, with no page errors', P.errors);
    await P.ctx.close().catch(() => {});
  }

  // ---------- Part 1c: effort in half points or RPE ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-09T12:00:00', w: 320 });
    const ev = (f, a) => P.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.sessions = []; L.saveNow(); L.ACT.startFree(); L.ACT.mClose(); const d = L.state.draft; d.ex.push({ exId: 'bench', plan: { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 5 * 0.45359237 }, sets: [0, 1, 2].map(() => ({ w: 60, r: null, rir: null, warm: false, drop: false, done: false })), note: '', sw: null }); L.saveNow(); L.render(); });
    const strip = async () => { await ev(() => document.querySelector('.rirb[data-b="0"][data-s="0"]').click()); await wait(60); return ev(() => { const s = document.querySelector('.rirstrip'); return s ? { label: s.querySelector('.rs-l').textContent, rows: s.querySelectorAll('.rs-r').length, vals: [...s.querySelectorAll('[data-act="rirPick"]:not(.rs-x)')].map(b => b.textContent + '=' + b.dataset.v), h: Math.min(...[...s.querySelectorAll('[data-act="rirPick"]')].map(b => b.getBoundingClientRect().height)), fit: s.getBoundingClientRect().right <= window.innerWidth } : null; }); };
    let s0 = await strip();
    ok(s0 && s0.label === 'RIR' && s0.rows === 0 && s0.vals.slice(0, 6).join() === '0=0,1=1,2=2,3=3,4=4,5=5' && await ev(() => window.__ironlog.state.settings.rirScale === undefined), 'by default effort is whole RIR, 0 to 5 in one row, and nothing new is saved', s0);
    await ev(() => document.querySelector('.rirb[data-b="0"][data-s="0"]').click());
    await ev(() => { const L = window.__ironlog; L.state.settings.rirScale = 'half'; L.render(); });
    s0 = await strip();
    ok(s0.rows === 2 && s0.vals.filter(v => !/x/.test(v)).length >= 11 && s0.h >= 44 && s0.fit, 'half reps: two rows, whole numbers over the halves, 44 px tall, inside a 320 px screen', s0);
    await ev(() => document.querySelector('.rirstrip [data-v="2.5"]').click()); await wait(60);
    ok(await ev(() => window.__ironlog.state.draft.ex[0].sets[0].rir === 2.5 && document.querySelector('.rirb[data-b="0"][data-s="0"]').textContent === '2.5'), 'a half point is stored as picked and shown in the box');
    await ev(() => { const L = window.__ironlog; L.state.settings.rirScale = 'rpe'; L.render(); });
    const head = await ev(() => [...document.querySelectorAll('.sg.head span')].map(x => x.textContent).join('|'));
    ok(/\|RPE\|/.test(head) && await ev(() => document.querySelector('.rirb[data-b="0"][data-s="0"]').textContent === '7.5'), 'RPE: the column says RPE and RIR 2.5 reads RPE 7.5', head);
    s0 = await strip();
    ok(s0.label === 'RPE' && s0.vals[0] === '5=5' && s0.vals[5] === '10=0' && s0.vals.includes('8.5=1.5'), 'the RPE picker reads 5 to 10 with the halves, each button carrying the RIR it means', s0.vals);
    await ev(() => document.querySelector('.rirstrip [data-v="1.5"]').click()); await wait(60);
    const st = await ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[0]; return { rir: s.rir, box: document.querySelector('.rirb[data-b="0"][data-s="0"]').textContent, line: L.setStr(L.EX('bench'), { w: 60, r: 8, rir: s.rir }) }; });
    ok(st.rir === 1.5 && st.box === '8.5' && /@RPE 8\.5$/.test(st.line), 'RPE 8.5 is saved as RIR 1.5, and History lines read @RPE 8.5', st);
    await ev(() => { const L = window.__ironlog; delete L.state.settings.rirScale; L.render(); });
    ok(await ev(() => document.querySelector('.rirb[data-b="0"][data-s="0"]').textContent === '1.5' && / @1\.5$/.test(window.__ironlog.setStr(window.__ironlog.EX('bench'), { w: 60, r: 8, rir: 1.5 }))), 'back on whole RIR the same set reads 1.5: switching loses nothing');
    // Half points in the numbers: 3 or less is a hard set, 3.5 is not; estimates take the half.
    const nums = await ev(() => {
      const L = window.__ironlog; L.state.draft = null; const LB = 0.45359237;
      L.state.sessions = [{ id: 'h', date: '2026-10-07', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: 100, r: 8, rir: 2.5, done: true }, { w: 100, r: 8, rir: 3, done: true }, { w: 100, r: 8, rir: 3.5, done: true }] }] }];
      L.invalidate(); const I = L.IDX(); const wk = Object.keys(I.weekHard)[0]; const st = I.exStats.bench || {};
      return { hard: I.weekHard[wk], best: st.best, ok: isFinite(st.best) };
    });
    ok(nums.hard === 2 && nums.ok, 'RIR 2.5 and 3 count as hard sets and 3.5 does not; the estimate is a number', nums);
    ok(await ev(() => window.__ironlog.normalize({ settings: { rirScale: 'tenths' } }).settings.rirScale === undefined && window.__ironlog.normalize({ settings: { rirScale: 'half' } }).settings.rirScale === 'half'), 'an unknown scale is dropped on load; half and RPE are kept');
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:rir'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    await P.page.selectOption('[data-bind="rirScale"]', 'rpe'); await wait(80);
    ok(await ev(() => window.__ironlog.state.settings.rirScale === 'rpe' && /Open the RPE picker/.test(document.getElementById('view').innerText)), 'Settings > Effort sets RPE, and the picker setting says RPE');
    await P.page.selectOption('[data-bind="rirScale"]', 'whole'); await wait(80);
    ok(await ev(() => window.__ironlog.state.settings.rirScale === undefined), 'choosing whole RIR removes the setting again');
    ok(!P.errors.length, 'effort settings: no page errors', P.errors);
    await P.ctx.close().catch(() => {});
  }

  // ---------- Part 1d: the library and Most common ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-09T12:00:00' });
    const lib = await P.page.evaluate(() => {
      const L = window.__ironlog; const libx = L.libExercises(); const P = [];
      const MK = new Set(['chest', 'lats', 'upperBack', 'traps', 'lowerBack', 'frontDelts', 'sideDelts', 'rearDelts', 'triceps', 'biceps', 'forearms', 'abs', 'obliques', 'quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves', 'neck', 'tibialis', 'serratus', 'rotatorCuff']);
      const EQ = new Set(['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'landmine', 'bodyweight', 'other']);
      const ids = new Set(), names = new Set();
      for (const e of libx) {
        if (ids.has(e.id)) P.push('duplicate id ' + e.id); ids.add(e.id);
        if (names.has(e.name.toLowerCase())) P.push('duplicate name ' + e.name); names.add(e.name.toLowerCase());
        if (!MK.has(e.primary)) P.push('primary ' + e.id);
        for (const m of e.secondary) if (!MK.has(m) || m === e.primary) P.push('secondary ' + e.id + ' ' + m);
        if (!EQ.has(e.equip)) P.push('equipment ' + e.id);
        if (e.bw !== (e.equip === 'bodyweight' || !!e.assist)) P.push('bodyweight flag ' + e.id);
        if (e.assist && e.equip !== 'machine') P.push('assisted ' + e.id);
        if (/—/.test(e.name + (e.note || ''))) P.push('em dash ' + e.id);
        if (e.note && !/[.)]$/.test(e.note)) P.push('note ending ' + e.id);
      }
      for (const t of L.TEMPLATES) for (const d of t.days || []) for (const it of d.items || []) if (!ids.has(it.exId)) P.push('routine ' + t.name + ' ' + it.exId);
      const C = [...L.COMMON]; for (const c of C) { const e = libx.find(x => x.id === c); if (!e) P.push('most common missing ' + c); else if (e.rare) P.push('most common and less common ' + c); }
      return { n: libx.length, problems: P, common: C.length, ids: C.join() };
    });
    ok(lib.n === 174 && !lib.problems.length, `the library's ${lib.n} exercises check out: unique ids and names, real muscles and equipment, bodyweight flags, notes, every ready-made routine's lifts`, lib.problems);
    ok(lib.common === 30 && /^bench,backSquat,deadlift,latPulldown,ohp,bbRow/.test(lib.ids), 'Most common is the 30 lifts from the measured list, led by bench, squat, deadlift, lat pulldown, overhead press, and barbell row', lib.ids);
    await P.ctx.close().catch(() => {});
  }

  // ---------- Part 2 (once): the built app's first page and sign-out ----------
  if (!process.env.IRONLOG_FILE) {
    const { start, quietHibp } = require('./fake-supabase');
    execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build.js')], { stdio: 'ignore' });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r33-'));
    fs.cpSync(path.join(__dirname, '..', 'dist'), tmp, { recursive: true });
    const fake = await start(tmp);
    const ip = path.join(tmp, 'index.html');
    fs.writeFileSync(ip, cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
    const APP = fake.base + '/ironlog/';
    async function device(o) {
      const ctx = await browser.newContext({ viewport: { width: (o && o.w) || 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', reducedMotion: (o && o.reduce) ? 'reduce' : 'no-preference' });
      await quietHibp(ctx); if (o && o.auto) await ctx.addInitScript('window.IRONLOG_TOUR_AUTO=1;');
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push(m.text()); });
      await page.goto(APP); await page.waitForFunction(() => window.__ironlog && document.getElementById('obTrack'), null, { timeout: 15000 });
      await page.evaluate(() => document.fonts.ready); await wait(300);
      return { ctx, page, errors, ev: (f, a) => page.evaluate(f, a) };
    }
    const W = await device();
    const tour = await W.ev(() => {
      const sl = [...document.querySelectorAll('#obTrack .ob-slide')]; const vw = innerWidth;
      const r = sl.map(e => e.getBoundingClientRect());
      return { titles: sl.map(e => e.querySelector('h2').textContent), lines: sl.map(e => e.querySelector('p').textContent), pics: sl.every(e => e.querySelector('.obv[aria-hidden="true"]')), pips: [...document.querySelectorAll('.ob-pips button')].map(b => b.getAttribute('aria-current')), first: r[0].left >= 0 && r[0].right <= vw, peek: r[1].left < vw && r[1].left > vw - 60, role: document.querySelector('.ob-tour').getAttribute('aria-roledescription'), label: sl[0].getAttribute('aria-label'), fits: document.documentElement.scrollHeight <= innerHeight + 2, wide: document.documentElement.scrollWidth <= vw, h44: [...document.querySelectorAll('.ob-pips button')].every(b => b.getBoundingClientRect().height >= 30) };
    });
    ok(tour.titles.join('|') === 'Log a set in one tap|Pick a plan or build one|Track every lift|Every session, by day|Volume by muscle' && tour.pics, 'the first page tours five things: logging, the plan, progress, history, and volume by muscle, each with a picture of that screen', tour.titles);
    ok(tour.lines.every(l => l.length <= 80 && !/—|!/.test(l)) && /from 174 exercises/.test(tour.lines[1]), 'one plain line each, no exclamation marks or em dashes, the exercise count read from the library', tour.lines);
    ok(tour.first && tour.peek, 'the first slide shows whole, with the next one peeking in from the edge so it reads as swipeable', tour);
    ok(tour.pips.join() === 'true,,,,' && tour.role === 'carousel' && tour.label === '1 of 5: Log a set in one tap', 'five pips with the first current; a labelled carousel for screen readers', tour);
    ok(tour.fits && tour.wide, 'the whole first page fits 390 x 844 without scrolling, and nothing spills sideways', tour);
    // A swipe moves the pips.
    await W.ev(() => { const t = document.getElementById('obTrack'); t.scrollTo({ left: t.children[2].offsetLeft - t.children[0].offsetLeft }); }); await wait(400);
    let st = await W.ev(() => ({ pip: [...document.querySelectorAll('.ob-pips button')].findIndex(b => b.getAttribute('aria-current') === 'true'), on: [...document.querySelectorAll('.ob-slide')].findIndex(e => e.classList.contains('on')) }));
    ok(st.pip === 2 && st.on === 2, 'swiping to the third slide makes its pip current', st);
    await W.page.click('.ob-pips button[data-i="4"]'); await wait(900);
    st = await W.ev(() => { const s = document.querySelectorAll('.ob-slide')[4].getBoundingClientRect(); return { pip: [...document.querySelectorAll('.ob-pips button')].findIndex(b => b.getAttribute('aria-current') === 'true'), inView: s.left >= 0 && s.right <= innerWidth + 1 }; });
    ok(st.pip === 4 && st.inView, 'tapping the last pip brings the last slide fully into view', st);
    // A re-render keeps the slide.
    await W.ev(() => window.__ironlog.render()); await wait(200);
    ok(await W.ev(() => document.querySelectorAll('.ob-slide')[4].classList.contains('on') && document.getElementById('obTrack').scrollLeft > 0), 'a re-render of the page stays on the slide being read');
    ok(!W.errors.length, 'first page: no page errors', W.errors);
    // In kg, the pictures are in kg.
    await W.ev(() => { const L = window.__ironlog; L.state.settings.unit = 'kg'; L.render(); });
    ok(/est\. 1RM 102 to 110 kg/.test(await W.ev(() => document.querySelectorAll('.ob-slide')[2].innerText)), 'the pictures follow the unit');
    // It moves on by itself until touched, and not at all with reduced motion.
    const A = await device({ auto: true });
    await wait(6200);
    const a1 = await A.ev(() => window.__ironlog.obTour.i);
    await A.page.dispatchEvent('#obTrack', 'pointerdown'); const a2 = await A.ev(() => window.__ironlog.obTour.i); await wait(6200);
    const a3 = await A.ev(() => window.__ironlog.obTour.i);
    ok(a1 === 1 && a3 === a2, 'it moves to the next slide on its own, and stops for good once touched', [a1, a2, a3]);
    const M = await device({ auto: true, reduce: true }); await wait(6200);
    ok(await M.ev(() => window.__ironlog.obTour.i === 0 && !window.__ironlog.obTour.auto), 'with reduced motion it never moves on its own');
    const N = await device({ w: 320 });
    ok(await N.ev(() => document.documentElement.scrollWidth <= 320 && [...document.querySelectorAll('.ob-slide')][0].getBoundingClientRect().right <= 320), 'at 320 px the slide fits and nothing spills sideways');

    // Sign-out while changes have not reached the account: nothing is removed, and keeping them is offered.
    const S = await device();
    await S.ev(() => { localStorage.setItem('ironlog.v1.installLater', '1'); });
    await S.page.click('#obPage [data-act="acctOpen"][data-mode="signup"]'); await wait(100);
    await S.page.fill('#modal [data-abind="email"]', 'so@example.com'); await S.page.fill('#modal [data-abind="pw"]', 'a good pass 9');
    await S.page.click('#modal [data-act="acctSubmit"]'); await wait(800);
    fake.confirm('so@example.com');
    await S.page.click('#modal [data-act="acctWaitNow"]').catch(() => {}); await wait(1500);
    await S.page.waitForFunction(() => { const L = window.__ironlog; return L.acctUser() && L.cloudState().on && L.cloudState().status === 'synced'; }, null, { timeout: 20000 }).catch(() => {});
    const signedIn = await S.ev(() => !!window.__ironlog.acctUser() && window.__ironlog.cloudState().on);
    ok(signedIn, 'a new account signs in from the first page and syncs');
    if (signedIn) {
      await S.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.settings.onboarded = true; const R = L.state.routines[0]; L.state.sessions.push({ id: 'so-1', date: '2026-10-08', dayIdx: 0, dayId: R.days[0].id, dayName: 'Day', routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 1, done: true }] }] }); L.saveNow(); L.render(); });
      await wait(1500);
      fake.setDeny(true);
      await S.ev(() => { const L = window.__ironlog; L.state.sessions.push({ id: 'so-2', date: '2026-10-09', dayIdx: 0, dayId: L.state.routines[0].days[0].id, dayName: 'Day', routineId: L.state.routines[0].id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 62.5, r: 8, rir: 1, done: true }] }] }); L.saveNow(); L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
      await wait(800);
      await S.page.click('#acctPanel [data-act="acctSignOut"]'); await wait(100);
      await S.page.click('#modal [data-act="mOk"]'); await wait(2500);
      const un = await S.ev(() => ({ t: document.getElementById('modal').innerText.replace(/\s+/g, ' '), on: !!window.__ironlog.acctUser(), n: window.__ironlog.state.sessions.length }));
      ok(/Not in your account yet/.test(un.t) && /Keep on this phone and sign out/.test(un.t) && un.on && un.n === 2, 'with changes not yet in the account, Sign out removes nothing and offers to keep them on the phone', un);
      await S.page.click('#modal [data-act="mOk"]'); await wait(1500);
      const kept = await S.ev(() => ({ on: !!window.__ironlog.acctUser(), n: window.__ironlog.state.sessions.map(s => s.id).join(), step: (document.getElementById('obPage') || {}).dataset && document.getElementById('obPage').dataset.step }));
      ok(!kept.on && kept.n === 'so-1,so-2' && kept.step === 'acct', 'keeping them signs out with the whole log on the phone and opens the first page', kept);
      fake.setDeny(false);
    }
    await fake.close();
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  await browser.close().catch(() => {});
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
