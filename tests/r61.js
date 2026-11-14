// r61: the numbers the rules are made of named once (PENDING 350), the log
// read through its types end to end (351), and the sheets moved (r61's
// own sections, added as each is built). Run on r60 (`node tests/r61.js
// baselines/r60.html`, R61_ONLY=n for one section):
//   1  (a guard) every tab and the session screen, in lb with RIR, kg with RPE in dark, and lb with half points and RIR
//      off, and the Guide in each unit with RIR on and off, drawn with no page error and nothing undefined, NaN or
//      [object Object] on screen (CL-3, 2.40; until then r60 and r61 compared, docs/ARCHIVE.md).
//   2  the Guide says what the code does where it did not: a set rated 5 or
//      more in reserve is read as 4, reps built past the top before a large
//      step are a quarter of the top of the range with two at least, and a new
//      level is three or more lighter sessions in a row over 2 weeks or more
//      (fails on r60).
//   3  a number typed past its bound shows at once the bound a save keeps,
//      one bound in kilograms whatever the unit: a bar up to 50 kg (110.2 lb),
//      a load step up to 500 kg (1102.3 lb), a load up to 20,000 lb (9071.8 kg),
//      and the log opened again holds what the fields showed (fails on r60:
//      the bar and the step were bounded in the unit typed, 110 and 500 lb,
//      and 20000 kg typed showed 20000 until the app was opened again).
//   4  the log read through its types end to end (351), held to normalize's own rules (CL-3, 2.40; until then
//      to r60's answer with six later changes taken out by hand): on 240 wide histories, each damaged three ways,
//      and the sync's documents, it never throws; read again it gives the same answer, key order included, and
//      drops nothing more; a log keeps every record and every set's load and reps a build could have saved; a
//      log the build before saved keeps every value it wrote, whatever the field (a migration only adds; REV8-O5,
//      shown to fail on a planted change to how a set's RIR is read); a field it does not know is kept, and the
//      record keeps the key order it came in. And two inputs no build writes read as any other (both
//      fail on r60): a workout in progress saved as false, 0 or an empty string reads as none, and a log with no
//      routine gets the starter read as any routine is; and the workout in progress is cleaned in place, the very
//      object given, its own fields first in their order.
//   5  New machine or gym (343 7, 339 g, 338 B): the exercise menu marks a
//      lift as done at a new machine or gym, and tapped again takes it off;
//      marked, the lift reads as a first session (no target or grey load
//      from the old gym, no PR while logged: the new gym's leg press at 280 x
//      11 after 225 x 10), Finish saves the mark last on the exercise, and
//      the lift starts over from that session (its bests and next target the
//      new machine's, its dumbbell spacing read from it alone) with every
//      session kept and counted; the log reopens as the same bytes, r60 keeps
//      the mark it does not know, an edit from History can take it off, and
//      normalize keeps it only as true (fails on r60: no such choice).
const { open, engine, screenOf, screenLeaks } = require('./h');
const { wide } = require('./wide');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r60.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const ONLY = process.env.R61_ONLY ? process.env.R61_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));

// The starter routine's ids are made at random, so they are fixed: a failure names the same routine on every run.
const FIX = "const m={};L.state.routines.forEach((r,i)=>{m[r.id]='R'+i;r.id='R'+i;});L.state.activeRoutineId=m[L.state.activeRoutineId]||L.state.activeRoutineId;L.state.sessions.forEach(s=>{if(m[s.routineId])s.routineId=m[s.routineId];});L.saveNow();";
const DEMO = 'L.state.settings.onboarded=true;L.makeDemo();' + FIX;
const SET = o => `Object.assign(L.state.settings,${JSON.stringify(o)});L.saveNow();`;
const START = "{const R=L.state.routines.find(r=>r.id===L.state.activeRoutineId);const di=String(R.days.findIndex(x=>!x.rest&&x.items.length));L.ACT.startSession({dataset:{day:di}});}";
const VARIANTS = [['lb, RIR, light', {}], ['kg, RPE, dark', { unit: 'kg', rirScale: 'rpe', theme: 'dark' }], ['lb, half points, RIR off', { rirScale: 'half', rirMode: 'off' }]];
const TABS = ['today', 'program', 'dash', 'history', 'settings'];
(async () => {
  const browser = await engine.launch();

  // ---- 1. Every tab and the session screen in three settings, and the Guide in each unit with RIR on and off, drawn on
  // this build with no page error and nothing undefined, NaN or [object Object] on screen (CL-3, 2.40). Until 2.40 this
  // section held r61 to r60 call for call on the wide histories, and every tab and the Guide to r60's, pinned since r64 to
  // r60 and r61 as published, so it read no code of the build under test (docs/ARCHIVE.md).
  if (run(1) && !process.env.IRONLOG_FILE) {
    const T0 = new Date('2026-10-11T12:00:00');
    const setup = async (ctx, page) => { await page.clock.setFixedTime(T0); };
    for (const [vn, v] of VARIANTS) for (const tab of [...TABS, 'session']) {
      const seed = DEMO + SET(v) + (tab === 'session' ? START : '');
      const o = { browser, seed, tab: tab === 'session' ? 'today' : tab, spaces: true, prep: "document.querySelectorAll('#view details').forEach(d=>{d.open=true;});" };
      const b = await screenOf(FILE, o);
      const leaks = screenLeaks(b);
      ok(!b.errors.length && b.tree.length > 0 && !leaks.length, `1. ${tab}, ${vn}: drawn, with no page error and no undefined, NaN or [object Object] on screen`, { errors: b.errors, leaks });
    }
    // The Guide, every topic open, in each unit with RIR on and off.
    for (const unit of ['lb', 'kg']) for (const rir of ['on', 'off']) {
      const P = await open(FILE, { browser, setup });
      const g = await P.page.evaluate(([unit, rir]) => {
        const L = window.__ironlog, S = L.state.settings;
        S.onboarded = true; S.unit = unit;
        if (rir === 'off') S.rirMode = 'off'; else delete S.rirMode;
        L.state = L.normalize(L.state); L.invalidate(); L.render();
        L.openModal({ kind: 'guide', open: '' });
        const m = document.getElementById('modal');
        m.querySelectorAll('details').forEach(d => { d.open = true; });
        const out = { html: m.innerHTML.replace(/<!--[^]*?-->/g, ''), text: m.innerText };
        L.ACT.mClose();
        return out;
      }, [unit, rir]);
      const errors = P.errors.slice();
      await P.ctx.close();
      const leaks = screenLeaks({ tree: [g.html], text: g.text });
      ok(g.text.length > 5000 && !errors.length && !leaks.length, `1. the Guide in ${unit} with RIR ${rir}: drawn whole (${g.text.length} characters), with no page error and no undefined, NaN or [object Object]`, { errors, leaks });
    }
  } else if (run(1)) console.log('note r61 section 1 reads the source build');

  // ---- 2. The Guide says what the code does (found by the numbers pass: three sentences r56.2 and r32 wrote did not).
  if (run(2)) {
    const P = await open(FILE, { browser });
    const text = await P.page.evaluate(() => {
      const L = window.__ironlog;
      L.state.settings.onboarded = true; L.render();
      L.openModal({ kind: 'guide', open: '' });
      const m = document.getElementById('modal');
      m.querySelectorAll('details').forEach(d => { d.open = true; });
      const t = m.innerText; L.ACT.mClose(); return t.replace(/\s+/g, ' ');
    });
    // The engine reads a set rated 5 or more in reserve as 4 (E1_MAX_RIR, since r49; the estimate errs low), not 5.
    ok(text.includes('A set rated 5 or more in reserve is read as 4, so from such sets the load moves about a step a session'), '2. the Guide: a set rated 5 or more in reserve is read as 4, as the engine reads it', text.match(/A set rated 5[^.]*\./));
    // Reps built past the top before a large step: a quarter of the top of the range, two at least (BUILD_PAST, r32).
    ok(text.includes('up to a quarter of the top of the range more (two at least), until your estimate says the new load allows the bottom of the range; then the load goes up. Past that, the load goes up anyway'), '2. the Guide: reps built past the top are a quarter of the top of the range, two at least', text.match(/you first build[^.]*\.[^.]*\./));
    // A new level needs three lighter sessions in a row as well as two weeks (NEW_LEVEL, r31).
    ok(text.includes('Lighter sessions in a row against the same earlier sessions, three or more over 2 weeks or more, are a new level, not a deload'), '2. the Guide: a new level is three or more lighter sessions in a row against the same earlier sessions over 2 weeks or more (since r72, 387-C1 and R72-1)', text.match(/Lighter sessions in a row[^.]*\./));
    ok(!P.errors.length, '2. no page errors', P.errors);
    await P.ctx.close();
  }

  // ---- 3. A number typed past its bound shows the bound a save keeps (r61: one bound, in kilograms).
  if (run(3)) {
    const LB = 0.45359237;
    for (const unit of ['lb', 'kg']) {
      const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
      const ev = (f, a) => P.page.evaluate(f, a);
      const wait = ms => new Promise(r => setTimeout(r, ms));
      await ev(u => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = u; S.settings.autoDone = false; L.state = L.normalize(S); L.saveNow(); L.ui.tab = 'settings'; L.render(); }, unit);
      await wait(100);
      // A field typed into and left, in a folded section or not: its text, then its input and change events, as the keyboard sends them.
      const typeIn = async (q, v) => { await ev(([q, v]) => { const e = document.querySelector(q); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [q, String(v)]); await wait(100); };
      const fieldOf = q => ev(q => (document.querySelector(q) || {}).value, q);
      const R = await ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); const di = R.days.findIndex(x => !x.rest && x.items.length); return { di, uid: R.days[di].items[0].uid }; });
      const itemOf = uid => ev(uid => window.__ironlog.state.routines.flatMap(r => r.days).flatMap(d => d.items).find(i => i.uid === uid).inc, uid);
      // The bar in Settings: 120 lb or 60 kg typed; a bar is kept up to 50 kg.
      const barQ = '#view input[data-bind="barKg"]';
      await typeIn(barQ, unit === 'lb' ? 120 : 60);
      const bar = { field: await fieldOf(barQ), kg: await ev(() => window.__ironlog.state.settings.barKg) };
      // The first lift's load step on Plan: 1200 lb or 600 kg typed; a step is kept up to 500 kg.
      await ev(uid => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.openItem = uid; L.render(); }, R.uid);
      await wait(150);
      const stepQ = `#view input[data-it="inc"][data-uid="${R.uid}"]`;
      await typeIn(stepQ, unit === 'lb' ? 1200 : 600);
      const step = { field: await fieldOf(stepQ), kg: await itemOf(R.uid) };
      // A set's load in a session: 30000 lb or 20000 kg typed; a load is kept up to 20,000 lb (9,071.8 kg).
      await ev(di => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); L.ACT.startSession({ dataset: { day: String(di) } }); }, R.di);
      await wait(200);
      const wQ = '#view .sg input[data-f="w"][data-b="0"][data-s="0"]';
      await typeIn(wQ, unit === 'lb' ? 30000 : 20000);
      const load = { field: await fieldOf(wQ), kg: await ev(() => window.__ironlog.state.draft.ex[0].sets[0].w) };
      const want = unit === 'lb' ? { bar: '110.2', step: '1102.3', load: '20000' } : { bar: '50', step: '500', load: '9071.8' };
      // Kept as the largest number typed in the unit within the bound (since 2.65), so it reads back as typed in it.
      const inKg = v => (unit === 'lb' ? Number(v) * LB : Number(v));
      ok(bar.field === want.bar && Math.abs(bar.kg - inKg(want.bar)) < 1e-9, `3. ${unit}: a bar typed past 50 kg shows ${want.bar}, the bound a save keeps`, bar);
      ok(step.field === want.step && Math.abs(step.kg - inKg(want.step)) < 1e-9, `3. ${unit}: a load step typed past 500 kg shows ${want.step}`, step);
      ok(load.field === want.load && Math.abs(load.kg - 20000 * LB) < 1e-6, `3. ${unit}: a load typed past 20,000 lb shows ${want.load}`, load);
      // Opened again, the log holds what the fields showed.
      await P.page.reload(); await wait(400);
      const after = await ev(([q, uid]) => { const L = window.__ironlog; const it = L.state.routines.flatMap(r => r.days).flatMap(d => d.items).find(i => i.uid === uid); return { bar: L.state.settings.barKg, step: it.inc, load: L.state.draft.ex[0].sets[0].w, field: (document.querySelector(q) || {}).value }; }, [wQ, R.uid]);
      ok(Math.abs(after.bar - bar.kg) < 1e-9 && Math.abs(after.step - step.kg) < 1e-9 && Math.abs(after.load - load.kg) < 1e-9 && after.field === load.field, `3. ${unit}: opened again, the bar, the step and the load are what the fields showed`, after);
      ok(!P.errors.length, `3. ${unit}: no page errors`, P.errors);
      await P.ctx.close();
    }
  }

  // ---- 4. The log read through its types (351), held to normalize's own rules on every raw log (CL-3, 2.40; until 2.40
  // held to r60's answer with every change made since taken out by hand, six of them, docs/ARCHIVE.md): it never throws;
  // read again, its answer is the same, key order included, and drops nothing more; a log a build saved keeps every
  // record and every set's load and reps as they were; a field it does not know is kept, in its place.
  if (run(4)) {
    const B = await open(FILE, { browser, clock: '2026-10-20T10:00:00', realStarter: true });
    const LIB = await B.page.evaluate(() => window.__ironlog.libExercises());
    // Each raw log normalized with the same ids for a new routine in both pages (the clock and Math.random held), and,
    // where asked, the answer read once more; with the damaged records dropped and the unknown fields kept.
    const norm = (P, list) => P.page.evaluate(list => {
      const L = window.__ironlog, R = Math.random, N = Date.now;
      const one = (raw, again) => {
        let s = 1;
        Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
        Date.now = () => 1792000000000;
        try {
          L.keepExtra.n = 0;
          const out = L.normalize(raw === undefined ? undefined : JSON.parse(raw));
          const res = { j: JSON.stringify(out), d: L.normalize.dropped, k: L.keepExtra.n };
          if (again && res.j[0] === '{') { s = 1; res.j2 = JSON.stringify(L.normalize(JSON.parse(res.j))); res.d2 = L.normalize.dropped; }
          return res;
        } catch (e) { return { j: 'throws ' + e.message }; } finally { Math.random = R; Date.now = N; }
      };
      return list.map(([raw, again]) => one(raw, again));
    }, list);
    const damage = (raw, seed) => {
      let a = seed >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
      const pick = xs => xs[Math.floor(r() * xs.length)];
      const odd = () => pick([null, '', 'x', -1, 0, 3.7, '8', 1e20, -1e20, true, false, [], {}, [1, 2], { a: 1 }, 'NaN', '2026-13-40', 'constructor', 'chest', 'j_knee', '2026-10-01']);
      const s = JSON.parse(JSON.stringify(raw));
      const poke = (o, depth) => {
        if (!o || typeof o !== 'object' || depth > 6) return;
        for (const k of Object.keys(o)) { if (r() < 0.05) o[k] = odd(); else if (o[k] && typeof o[k] === 'object') poke(o[k], depth + 1); }
        if (!Array.isArray(o) && r() < 0.06) o['zz' + Math.floor(r() * 9)] = pick([1, 'two', { three: 3 }, [4], null]);
      };
      poke(s, 0);
      if (r() < 0.3 && Array.isArray(s.sessions) && s.sessions.length) s.sessions.push(JSON.parse(JSON.stringify(s.sessions[0])));
      if (r() < 0.2 && Array.isArray(s.sessions) && s.sessions.length && s.sessions[0] && typeof s.sessions[0] === 'object') s.sessions.push({ ...JSON.parse(JSON.stringify(s.sessions[0])), date: '2025-01-02' });
      if (r() < 0.25) s.draft = pick([{}, null, { ex: 'x', date: '2026-10-01' }, { ex: [{ exId: 'bench', sets: [null, {}, { w: 'x', r: '' }, []] }, { exId: 'squat', sets: [], plan: { sets: 'x', repMin: 12, repMax: 5, ss: 'A', jump: '7' }, adj: { at: 0, w: 100, from: 90, r: 5, rid: 'q' }, keepRR: [5], prev: ['a', 1], lastR: [1, 'x', -1, 99999] }], date: '2026-10-01', zz: 1, cardio: [{ min: 'x' }, null, { id: 'c', kind: 'run', min: 0 }] }, { date: '2026-10-01', ex: [], startedAt: 1e20, durMin: '30', past: true, extra: { a: 1 } }]);
      if (r() < 0.2) s.trash = [{ id: 't1', kind: 'session', date: '2026-10-10', data: { id: 't1', date: '2026-10-01', ex: [] } }, { id: 't2', kind: 'zz', date: 'x', data: null }, null, { id: 't3', kind: 'cardio', date: '2026-10-11', data: { id: 't3', date: '2026-10-01', min: 20 } }];
      if (r() < 0.15) s.version = pick([1, 2, 3, 4, 'x', null]);
      // The accent is one no build knows, dropped by every build: it was 'red' until r65.2 made Red an accent (370).
      if (r() < 0.1) s.settings = pick([null, 'x', [], {}, { unit: 'kg', zz: 1, bwEvery: 14, bands: { chest: [30, 2], lats: 'x' }, secOrder: { today: ['a', 1] }, ownTargets: ['traps', 'chest'], bandsFit: { chest: 5, neck: 3 }, restWeeks: ['2026-10-05', 'x', '2026-10-05'], userName: '  a   b  ', accent: 'gold' }]);
      if (r() < 0.1) s.routines = pick([[], null, [{ days: 'x' }], [{ id: 'q', days: [null, { items: 'x' }, { items: [null, { exId: 'bench', sets: 'x' }] }] }]]);
      return s;
    };
    const N4 = +process.env.R61_N4 || 240;
    let n = 0; const threw = [], unstable = [], lost = [];
    for (let seed = 1; seed <= N4; seed++) {
      const h = wide(seed, LIB);
      const raws = [h.raw, damage(h.raw, seed * 31 + 1), damage(h.raw, seed * 31 + 2), damage(h.raw, seed * 31 + 3)];
      const docs = [{ draft: h.raw.draft || null }, { sessions: h.raw.sessions, cardio: h.raw.cardio }, { bodyweights: h.raw.bodyweights || [], measurements: h.raw.measurements || [] }];
      const list = [...raws, ...docs].map(s => [JSON.stringify(s), true]);
      const rb = await norm(B, list);
      list.forEach(([raw], i) => {
        n++;
        const b = rb[i];
        if (/^throws /.test(b.j)) { if (threw.length < 5) threw.push({ seed, i, err: b.j.slice(0, 200) }); return; }
        if (b.j2 !== undefined && (b.j2 !== b.j || b.d2)) { if (unstable.length < 5) { let at = 0; while (at < b.j.length && b.j[at] === b.j2[at]) at++; unstable.push({ seed, i, dropped: b.d2, once: b.j.slice(Math.max(0, at - 120), at + 120), twice: b.j2.slice(Math.max(0, at - 120), at + 120) }); } }
        // The log as a build saved it (the history itself, undamaged): every record, and every set's load and reps.
        if (i === 0) {
          const o = JSON.parse(b.j), r0 = JSON.parse(raw);
          for (const k of ['sessions', 'bodyweights', 'cardio', 'measurements']) {
            const ids = new Set((o[k] || []).map(x => x.id));
            for (const x of r0[k] || []) if (!ids.has(x.id) && lost.length < 5) lost.push({ seed, k, id: x.id });
          }
          const byId = Object.fromEntries((o.sessions || []).map(x => [x.id, x]));
          for (const x of r0.sessions || []) {
            const y = byId[x.id]; if (!y) continue;
            // Each set a build could have saved (a load, and reps of 0 or more) is the set in its place, as it was; the
            // histories hold impossible ones too (-1 reps), which normalize mends in place.
            x.ex.forEach((e, k) => e.sets.forEach((t, m) => {
              const u = y.ex[k] && y.ex[k].sets[m];
              if (+t.r >= 0 && isFinite(+t.w) && !(u && +u.w === +t.w && +u.r === +t.r) && lost.length < 5) lost.push({ seed, id: x.id, ex: e.exId, set: m, was: [t.w, t.r], now: u && [u.w, u.r] });
            }));
          }
        }
      });
    }
    ok(n > N4 * 6 && !threw.length, `4. normalize never throws, on ${n} raw logs (${N4} wide histories, each damaged three ways, and the sync's documents)`, threw);
    ok(!unstable.length, '4. read again, its answer is the same, key order included, and it drops nothing more', unstable);
    ok(!lost.length, `4. a log keeps every session, weigh-in, cardio entry and measurement, and every set's load and reps a build could have saved (${N4} histories)`, lost);
    /* A migration only adds (CLAUDE.md, Data): a log the build before this one saved, read by this build, keeps every
       value it wrote, at the same place, whatever the field (the review of 2.36 to 2.41, REV8-O5: the checks above hold
       records, loads and reps, and a field read differently elsewhere was caught only where a feature suite read it).
       The build before is the newest page in baselines/ (tests/migration.js loads every one). A release that changes
       how a stored value is read on purpose says so here, for that one build. */
    {
      const fs = require('fs');
      const before = fs.readdirSync('baselines').filter(f => /^r\d+(-\d+)?\.html$/.test(f)).sort((a, b) => { const n = f => f.slice(1, -5).split('-').map(Number); const [x, y] = [n(a), n(b)]; return x[0] - y[0] || (x[1] || 0) - (y[1] || 0); }).pop();
      const P = await open('baselines/' + before, { browser, clock: '2026-10-20T10:00:00', realStarter: true });
      const N5 = +process.env.R61_N5 || 120;
      const changed = [];
      let leaves = 0;
      const walk = (a, b, p) => {
        if (a !== null && typeof a === 'object') {
          if (b === null || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) { if (changed.length < 6) changed.push({ p, was: JSON.stringify(a).slice(0, 120), now: JSON.stringify(b).slice(0, 120) }); return; }
          for (const k of Object.keys(a)) walk(a[k], b[k], p + '.' + k);
          return;
        }
        leaves++;
        if (a !== b && changed.length < 6) changed.push({ p, was: a, now: b });
      };
      for (let seed = 1; seed <= N5; seed++) {
        const raw = JSON.stringify(wide(seed, LIB).raw);
        // The build before's save, as it would sit on the phone; then this build's reading of it.
        const saved = await P.page.evaluate(r => JSON.stringify(window.__ironlog.normalize(JSON.parse(r))), raw);
        const read = await B.page.evaluate(r => JSON.stringify(window.__ironlog.normalize(JSON.parse(r))), saved);
        walk(JSON.parse(saved), JSON.parse(read), 'log');
      }
      ok(leaves > N5 * 1000 && !changed.length, `4. a log the build before (${before}) saved keeps every value it wrote, read by this build (${N5} wide histories, ${leaves} values): a migration only adds`, changed);
      await P.ctx.close();
    }
    // A field normalize does not know is kept where it was (keepExtra): after the record's own fields, in the order it came, its value as it was.
    const extra = await B.page.evaluate(() => {
      const L = window.__ironlog;
      const base = L.normalize(null); base.settings.onboarded = true; L.state = base; L.makeDemo();
      const raw = JSON.parse(JSON.stringify(L.state));
      raw.sessions[0].zz1 = { a: 1 }; raw.sessions[0].zz2 = 'two';
      raw.sessions[0].ex[0].sets[0].zz3 = [3];
      raw.settings.zz4 = 4;
      const out = L.normalize(JSON.parse(JSON.stringify(raw)));
      const s0 = out.sessions.find(x => x.id === raw.sessions[0].id), had = Object.keys(raw.sessions[0]);
      return { order: Object.keys(s0).filter(k => had.includes(k)).join() === had.join(), v: [s0.zz1, s0.zz2, s0.ex[0].sets[0].zz3, out.settings.zz4] };
    });
    ok(extra.order && JSON.stringify(extra.v) === JSON.stringify([{ a: 1 }, 'two', [3], 4]), '4. a field it does not know is kept with its value, and the record keeps the key order it came in (keepExtra)', extra);
    // The two inputs no build writes, read as any other (each fails on r60).
    const named = await B.page.evaluate(() => {
      const L = window.__ironlog;
      const drafts = [false, 0, ''].map(v => L.normalize({ ...L.normalize(null), draft: v }).draft);
      const none = L.normalize({ ...L.normalize(null), routines: [] });
      const r = none.routines[0];
      const again = L.normalize(JSON.parse(JSON.stringify(none)));
      return { drafts, items: r.days.flatMap(d => d.items).length, ss: r.days.flatMap(d => d.items).every(it => 'ss' in it && it.ss === null), active: none.activeRoutineId === r.id, stable: JSON.stringify(again.routines) === JSON.stringify(none.routines) };
    });
    ok(named.drafts.every(d => d === null), '4. a workout in progress saved as false, 0 or an empty string reads as none (r60 kept it as it came)', named.drafts);
    ok(named.items > 0 && named.ss && named.active && named.stable, '4. a log with no routine gets the starter read as any routine is: every item with its superset field, the routine in use, the same when read again (r60 gave it unread, its items without the field)', named);
    // The workout in progress is cleaned in place, as every build since r56 cleans it: the log holds the very object it was given, its fields in their order.
    const kept = await B.page.evaluate(() => {
      const L = window.__ironlog;
      const d = { zz: 1, date: '2026-10-20', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8 }] }], dayName: 'Upper A' };
      const out = L.normalize({ ...L.normalize(null), draft: d });
      return { same: out.draft === d, keys: Object.keys(out.draft).slice(0, 4) };
    });
    ok(kept.same && kept.keys.join() === 'zz,date,ex,dayName', '4. the workout in progress comes back as the object given, cleaned in place, its own fields first in their order', kept);
    ok(!B.errors.length, '4. no page errors', B.errors);
    await B.ctx.close();
  }

  // ---- 5. New machine or gym (343 7, 339 g, 338 B): a lift starts over from a session the menu marks, its history kept.
  if (run(5)) {
    const P = await open(FILE, { browser, clock: '2026-10-15T10:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // Leg press at the old gym: six weekly sessions of 3 x 10, 200 to 225 kg, on a routine's one day, saved as Finish saves them.
    await ev(() => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg'; s.settings.autoDone = false;
      const R = { id: 'R61', name: 'R61', schedule: 'cycle', days: [{ id: 'D61', name: 'Legs', rest: false, items: [{ uid: 'i61', exId: 'legPress', sets: 3, repMin: 8, repMax: 12, rir: 2, rest: 120, inc: 5, ss: null }] }] };
      s.routines = [R]; s.activeRoutineId = 'R61'; s.draft = null; s.injuries = [];
      const days = ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06'];
      s.sessions = days.map((date, i) => ({ id: 'g' + i, date, dayIdx: 0, dayId: 'D61', dayName: 'Legs', routineId: 'R61', notes: '', ex: [{ exId: 'legPress', note: '', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w: 200 + 5 * i, r: 10, rir: 2, warm: false, drop: false })), ps: 3 }] }));
      L.state = L.normalize(s); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
      L.ACT.startSession({ dataset: { day: '0' } });
    });
    await wait(200);
    const block = () => ev(() => {
      const L = window.__ironlog; const b = L.state.draft.ex[0]; const el = document.getElementById('blk-0');
      return { target: b.target, hint: b.hint, sw: b.sw, w: b.sets.map(x => x.w), nw: b.nw === true, tag: !!el && !!el.querySelector('.bh') && /New machine/.test(el.querySelector('.bh').innerText), prs: el ? el.querySelectorAll('[data-pr], .bf-pr').length : -1 };
    });
    // The menu as a lifter opens it: the ⋯ on the exercise, then the option by its words.
    const menu = async words => {
      await P.page.click('#blk-0 [data-act="bMenu"]'); await wait(100);
      const label = await ev(() => [...document.querySelectorAll('#modal [data-op="bNew"]')].map(x => x.textContent.trim()).join('|'));
      if (words && label) { await P.page.click(`#modal [data-op="bNew"]`); await wait(150); }
      else await ev(() => window.__ironlog.ACT.mClose());
      return label;
    };
    const before = await block();
    const label0 = await menu(true);
    const marked = await block();
    const label1 = await menu(false);
    ok(label0 === 'New machine or gym' && label1 === 'Same machine as before', '5. the exercise menu offers New machine or gym, and once tapped, Same machine as before', [label0, label1]);
    ok(before.target && /225/.test(before.target) && marked.nw && marked.target === '' && /^First time/.test(marked.hint) && marked.sw == null && marked.w.every(w => w == null) && marked.tag,
      '5. marked, leg press reads as a first session at the new machine: no target from 225 kg, no grey load, the first-time hint, and a New machine tag on the exercise', { before, marked });
    await menu(true);
    const unmarked = await block();
    ok(!unmarked.nw && unmarked.target === before.target && unmarked.sw === before.sw && !unmarked.tag, '5. tapped again, it reads its history again: the target and load it had before', { before, unmarked });
    // The new gym's leg press reads heavier (338 B: 280 x 11 read as a weight PR, best estimate 392): marked, it sets no PR.
    await menu(true);
    await ev(() => { const L = window.__ironlog; const d = L.state.draft; for (const x of d.ex[0].sets) Object.assign(x, { w: 280, r: 11, rir: 1, done: true }); L.render(); });
    await wait(100);
    const live = await block();
    ok(live.prs === 0, '5. sets of 280 x 11 at the new machine show no PR while logged', live);
    const fin = await ev(async () => {
      const L = window.__ironlog; const d = L.state.draft; d._rampAsked = true; d._leftAsked = true; L.ACT.finishNow(); await new Promise(r => setTimeout(r, 300)); if (L.ui.modal) L.ACT.mClose();
      const sv = L.state.sessions.find(x => x.date === '2026-10-15'); const I = L.IDX(); const st = I.exStats.legPress;
      const sg = L.suggest('legPress', { sets: 3, repMin: 8, repMax: 12, rir: 2, rest: 120, inc: 5 }, {});
      const bests = L.allTimeBests('legPress');
      return { keys: sv ? Object.keys(sv.ex[0]) : null, nw: sv && sv.ex[0].nw, prs: I.prs.filter(p => p.exId === 'legPress' && p.sid === (sv && sv.id)).length, oldPrs: I.prs.filter(p => p.exId === 'legPress').length,
        n: st.n, best: st.bestAll, pct: st.pct, stalled: st.stalled, line: L.liftTrend('legPress'), bestDate: bests && bests.est && bests.est.date, heavy: L.bestLine('legPress'), target: sg.target, w: sg.w, exps: I.byEx.legPress.length, hist: L.state.sessions.length };
    });
    ok(fin.nw === true && fin.keys && fin.keys.slice(-2).join() === 'ps,nw', '5. Finish saves the mark on the exercise, last, after the sets its plan gave it', fin);
    ok(fin.prs === 0 && fin.bestDate === '2026-10-15' && /280/.test(fin.heavy) && fin.n === 7 && fin.exps === 7 && fin.hist === 7,
      '5. saved: no PR, its bests are the new machine\'s (the best estimate and heaviest set from today), and its seven sessions are all kept and counted', fin);
    ok(fin.line === '', '5. the lift\'s history sheet shows no trend line from the old gym\'s sessions: one session at the new machine is none yet (the independent review of r61)', fin.line);
    ok(fin.pct == null && fin.stalled === false, '5. its trend starts over too: one session at the new machine is no trend yet (the old gym\'s 200 to 225 read with 280 would be a rise)', fin);
    ok(fin.w != null && fin.w >= 280 && !/225/.test(fin.target), '5. the next target comes from the new machine\'s 280 x 11, not the old gym\'s loads', fin);
    // Opened again, the log reads the same (each session's fingerprint, as the sync compares it), and the exercise's fields in Finish's order.
    // (A session just saved is read with demo false from the next load on, as since r55; so both are read through normalize.)
    const read = () => ev(() => { const L = window.__ironlog; const S = L.normalize(JSON.parse(JSON.stringify(L.state))); const sv = S.sessions.find(x => x.date === '2026-10-15'); return { h: S.sessions.map(x => L.Hx(x)).join(), keys: Object.keys(JSON.parse(JSON.stringify(sv.ex[0]))).join() }; });
    const j0 = await read();
    await P.page.reload(); await wait(400);
    const j1 = await read();
    ok(j0.h === j1.h && j0.keys === j1.keys, '5. opened again, every session reads the same, the mark where Finish put it', [j0, j1]);
    const jNew = await ev(() => JSON.stringify(window.__ironlog.state.sessions));
    // The way back: r60 (what a revert of r61 republishes) keeps the mark it does not know, in place, and r61 reads it again.
    const raw = await ev(() => localStorage.getItem('ironlog.v1'));
    const O = await open(OLD, { browser, clock: '2026-10-15T10:00:00', state: JSON.parse(raw) });
    const jOld = await O.page.evaluate(() => JSON.stringify(window.__ironlog.state.sessions));
    ok(jOld === jNew, '5. r60 opens the log with the mark kept as it came, every session the same bytes', [jOld.length, jNew.length]);
    await O.ctx.close();
    // An edit from History keeps the mark, and can take it off: then 280 x 11 reads against the old gym, a PR.
    const ed = await ev(async () => {
      const L = window.__ironlog; const sv = L.state.sessions.find(x => x.date === '2026-10-15');
      L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id: sv.id } }); await new Promise(r => setTimeout(r, 150));
      return { nw: L.state.draft.ex[0].nw === true, id: sv.id };
    });
    const label2 = await menu(true);
    const ed2 = await ev(async id => {
      const L = window.__ironlog; const d = L.state.draft; d._rampAsked = true; d._leftAsked = true; L.ACT.finishNow(); await new Promise(r => setTimeout(r, 300)); if (L.ui.modal) L.ACT.mClose();
      const sv = L.state.sessions.find(x => x.id === id);
      return { draft: !!L.state.draft, nw: 'nw' in sv.ex[0], prs: L.IDX().prs.filter(p => p.exId === 'legPress' && p.sid === id).length };
    }, ed.id);
    ok(ed.nw && label2 === 'Same machine as before' && !ed2.draft && !ed2.nw && ed2.prs > 0, '5. an edit from History opens with the mark, and saved with it taken off, the session reads against the old gym again (a PR)', { ed, label2, ed2 });
    // A mark only as true: anything else a damaged save carries is dropped, on a saved exercise and in a workout.
    const clean = await ev(() => {
      const L = window.__ironlog; const f = L.normalize(null);
      const one = nw => L.normalize({ ...f, sessions: [{ id: 's', date: '2026-10-01', dayIdx: 0, dayId: null, dayName: 'S', routineId: '', ex: [{ exId: 'bench', rr: null, sets: [{ w: 60, r: 8 }], nw }] }], draft: { date: '2026-10-15', ex: [{ exId: 'bench', sets: [], nw }] } });
      return [true, 1, 'yes', false].map(v => { const o = one(v); const a = o.sessions[0].ex[0], b = o.draft.ex[0]; return [a.nw === true, 'nw' in a, b.nw === true, 'nw' in b]; });
    });
    ok(JSON.stringify(clean) === JSON.stringify([[true, true, true, true], [false, false, false, false], [false, false, false, false], [false, false, false, false]]),
      '5. normalize keeps a mark only as true, and drops 1, "yes" or false, on a saved exercise and in a workout', clean);
    ok(!P.errors.length, '5. no page errors', P.errors);
    await P.ctx.close();
    // The new gym's dumbbells: in 5 lb steps where the old gym's went in 2.5, read alone once marked (the old ones would make it 2.5).
    const Q = await open(FILE, { browser, clock: '2026-10-15T10:00:00' });
    const rk = await Q.page.evaluate(() => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb';
      const LB = 0.45359237; const S = (id, date, ws, nw) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', free: true, notes: '', ex: [{ exId: 'dbBench', note: '', rr: [8, 12], sets: ws.map(w => ({ w: w * LB, r: 10, rir: 2, warm: false, drop: false })), ...(nw ? { nw: true } : {}) }] });
      const old = [S('a', '2026-09-20', [42.5, 47.5]), S('b', '2026-09-27', [42.5, 47.5])];
      s.sessions = [...old, S('c', '2026-10-04', [45, 50], false), S('d', '2026-10-11', [45, 50], false)];
      L.state = L.normalize(s); L.invalidate(); const unmarked = L.rackStep(L.EX('dbBench')) / LB;
      s.sessions = [...old, S('c', '2026-10-04', [45, 50], true), S('d', '2026-10-11', [45, 50], false)];
      L.state = L.normalize(s); L.invalidate(); const marked = L.rackStep(L.EX('dbBench')) / LB;
      return { unmarked: Math.round(unmarked * 100) / 100, marked: Math.round(marked * 100) / 100 };
    });
    ok(rk.unmarked === 2.5 && rk.marked === 5, '5. dumbbells read from the new gym alone once marked: 5 lb steps, where reading the old gym too gave 2.5', rk);
    ok(!Q.errors.length, '5. no page errors (the rack)', Q.errors);
    await Q.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
