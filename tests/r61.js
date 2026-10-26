// r61: the numbers the rules are made of named once (PENDING 350), the log
// read through its types end to end (351), and the sheets moved (r61's
// own sections, added as each is built). Run on r60 (`node tests/r61.js
// baselines/r60.html`, R61_ONLY=n for one section):
//   1  (a guard, the source build) it gives every number r60 gave: the wide
//      histories of tests/wide.js (1,000, every day of the week as today)
//      through every function the screens call, the same answers as r60
//      (baselines/r60.html), call for call; and every tab, in light and dark,
//      in pounds and kilograms, with effort as RIR and as RPE, the same
//      elements, attributes, field values and visible text as r60's; and the
//      Guide, every topic open, in pounds and kilograms with RIR on and off,
//      the same markup and text as r60's (its numbers now read from the
//      constants their rules apply), but for the sentences section 2 corrects.
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
//   4  the log read through its types end to end (351): normalize gives
//      r60's answer, key order included, with the same records dropped and
//      unknown fields kept, on 240 wide histories, each damaged three ways,
//      and the sync's documents, but for two inputs no build writes, each
//      read now as any other (both fail on r60): a workout in progress saved
//      as false, 0 or an empty string reads as none, where r60 kept it as it
//      came, and a log with no routine gets the starter read as any routine
//      is (its items with their superset field), where r60 gave it unread
//      until the next load; and the workout in progress is still cleaned in
//      place, the very object given, its own fields first in their order.
//      (On r60 the first check fails too, by exactly those two inputs.)
const { open, engine, screenOf, screenDiff } = require('./h');
const { wide, digest, specOf } = require('./wide');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r60.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const ONLY = process.env.R61_ONLY ? process.env.R61_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const N = +process.env.R61_N || 1000;

// The starter routine's ids are made at random, so both builds are given the same ones (as tests/r60.js does).
const FIX = "const m={};L.state.routines.forEach((r,i)=>{m[r.id]='R'+i;r.id='R'+i;});L.state.activeRoutineId=m[L.state.activeRoutineId]||L.state.activeRoutineId;L.state.sessions.forEach(s=>{if(m[s.routineId])s.routineId=m[s.routineId];});L.saveNow();";
const DEMO = 'L.state.settings.onboarded=true;L.makeDemo();' + FIX;
const SET = o => `Object.assign(L.state.settings,${JSON.stringify(o)});L.saveNow();`;
const START = "{const R=L.state.routines.find(r=>r.id===L.state.activeRoutineId);const di=String(R.days.findIndex(x=>!x.rest&&x.items.length));L.ACT.startSession({dataset:{day:di}});}";
const VARIANTS = [['lb, RIR, light', {}], ['kg, RPE, dark', { unit: 'kg', rirScale: 'rpe', theme: 'dark' }], ['lb, half points, RIR off', { rirScale: 'half', rirMode: 'off' }]];
const TABS = ['today', 'program', 'dash', 'history', 'settings'];
// The Guide's sentences r61 corrects to say what the code does (section 2): r60's words, then r61's.
const GUIDE_FIXED = [
  ['in reserve is read as 5, so from such sets', 'in reserve is read as 4, so from such sets'],
  ['of the top of the range more, until your estimate', 'of the top of the range more (two at least), until your estimate'],
  ['Past a quarter, the load goes up anyway', 'Past that, the load goes up anyway'],
  ['Lighter sessions in a row for 2 weeks or more are a new level', 'Lighter sessions in a row, three or more over 2 weeks or more, are a new level']
];

(async () => {
  const browser = await engine.launch();

  // ---- 1. Every number r60 gave, and every tab as r60 drew it.
  if (run(1) && !process.env.IRONLOG_FILE) {
    const T0 = new Date('2026-10-11T12:00:00');
    const setup = async (ctx, page) => { await page.clock.setFixedTime(T0); };
    const A = await open(OLD, { browser, setup });
    const B = await open(FILE, { browser, setup });
    const LIB = await B.page.evaluate(() => window.__ironlog.libExercises());
    let same = 0, first = null, calls = 0;
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const h = wide(61000 + i, LIB);
      const when = new Date(h.today + 'T12:00:00');
      await Promise.all([A.page.clock.setFixedTime(when), B.page.clock.setFixedTime(when)]);
      const spec = specOf(h);
      const [a, b] = await Promise.all([A.page.evaluate(digest, spec), B.page.evaluate(digest, spec)]);
      calls += b.split('\n').length;
      if (a === b) same++;
      else if (!first) { const la = a.split('\n'), lb = b.split('\n'); let k = 0; while (k < la.length && la[k] === lb[k]) k++; first = { seed: 61000 + i, line: k, r60: (la[k] || '').slice(0, 700), now: (lb[k] || '').slice(0, 700) }; }
    }
    ok(same === N, `1. the same answers as r60 on all ${N} wide histories (${same} identical, ${calls} calls, ${Math.round((Date.now() - t0) / 1000)} s)`, first);
    await A.ctx.close(); await B.ctx.close();
    const flat = s => ({ ...s, tree: s.tree.map(t => t.replace(/class="([^"]*)"/g, (m, c) => `class="${c.split(' ').filter(x => x !== 'prflash').join(' ')}"`)), text: s.text.replace(/\s+/g, ' ') });
    for (const [vn, v] of VARIANTS) for (const tab of [...TABS, 'session']) {
      const seed = DEMO + SET(v) + (tab === 'session' ? START : '');
      const o = { browser, seed, tab: tab === 'session' ? 'today' : tab, spaces: true, prep: "document.querySelectorAll('#view details').forEach(d=>{d.open=true;});" };
      const a = flat(await screenOf(OLD, o)), b0 = await screenOf(FILE, o), b = flat(b0);
      const d = screenDiff({ tree: a.tree, text: '' }, { tree: b.tree, text: '' });
      ok(!d && a.text === b.text, `1. ${tab}, ${vn}: the same elements, attributes, field values and text as r60`, d ? { at: d.at, r60: d.before, now: d.now } : a.text === b.text ? '' : { r60: a.text.slice(0, 300), now: b.text.slice(0, 300) });
      ok(!b0.errors.length, `1. ${tab}, ${vn}: no page errors`, b0.errors);
    }
    // The Guide, every topic open, as each build draws it in each unit with RIR on and off.
    const guideOf = async (file, unit, rir) => {
      const P = await open(file, { browser, setup });
      const g = await P.page.evaluate(([unit, rir]) => {
        const L = window.__ironlog, S = L.state.settings;
        S.onboarded = true; S.unit = unit;
        if (rir === 'off') S.rirMode = 'off'; else delete S.rirMode;
        L.state = L.normalize(L.state); L.invalidate(); L.render();
        L.openModal({ kind: 'guide', open: '' });
        const m = document.getElementById('modal');
        m.querySelectorAll('details').forEach(d => { d.open = true; });
        const out = { html: m.innerHTML, text: m.innerText };
        L.ACT.mClose();
        return out;
      }, [unit, rir]);
      const errors = P.errors.slice();
      await P.ctx.close();
      return { ...g, errors };
    };
    for (const unit of ['lb', 'kg']) for (const rir of ['on', 'off']) {
      const [a0, b] = [await guideOf(OLD, unit, rir), await guideOf(FILE, unit, rir)];
      // r60's Guide with the sentences section 2 corrects on purpose put as r61 words them; each must be there to correct.
      const missing = GUIDE_FIXED.filter(([was]) => !a0.html.includes(was) || !a0.text.includes(was)).map(([was]) => was);
      ok(!missing.length, `1. the Guide in ${unit} with RIR ${rir}: r60 has each sentence section 2 corrects`, missing);
      const fix = t => GUIDE_FIXED.reduce((x, [was, now]) => x.replace(was, now), t);
      const a = { html: fix(a0.html), text: fix(a0.text) };
      let k = 0; while (k < a.html.length && a.html[k] === b.html[k]) k++;
      ok(a.html === b.html && a.text === b.text, `1. the Guide in ${unit} with RIR ${rir}: the same markup and text as r60 (${b.text.length} characters)`, a.html === b.html ? { r60: a.text.slice(0, 300), now: b.text.slice(0, 300) } : { at: k, r60: a.html.slice(Math.max(0, k - 120), k + 200), now: b.html.slice(Math.max(0, k - 120), k + 200) });
      ok(!b.errors.length, `1. the Guide in ${unit} with RIR ${rir}: no page errors`, b.errors);
    }
  } else if (run(1)) console.log('note r61 section 1 compares source pages; it runs on the source build');

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
    ok(text.includes('Lighter sessions in a row, three or more over 2 weeks or more, are a new level, not a deload'), '2. the Guide: a new level is three or more lighter sessions in a row over 2 weeks or more', text.match(/Lighter sessions in a row[^.]*\./));
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
      ok(bar.field === want.bar && Math.abs(bar.kg - 50) < 1e-9, `3. ${unit}: a bar typed past 50 kg shows ${want.bar}, the bound a save keeps`, bar);
      ok(step.field === want.step && Math.abs(step.kg - 500) < 1e-9, `3. ${unit}: a load step typed past 500 kg shows ${want.step}`, step);
      ok(load.field === want.load && Math.abs(load.kg - 20000 * LB) < 1e-6, `3. ${unit}: a load typed past 20,000 lb shows ${want.load}`, load);
      // Opened again, the log holds what the fields showed.
      await P.page.reload(); await wait(400);
      const after = await ev(([q, uid]) => { const L = window.__ironlog; const it = L.state.routines.flatMap(r => r.days).flatMap(d => d.items).find(i => i.uid === uid); return { bar: L.state.settings.barKg, step: it.inc, load: L.state.draft.ex[0].sets[0].w, field: (document.querySelector(q) || {}).value }; }, [wQ, R.uid]);
      ok(Math.abs(after.bar - bar.kg) < 1e-9 && Math.abs(after.step - step.kg) < 1e-9 && Math.abs(after.load - load.kg) < 1e-9 && after.field === load.field, `3. ${unit}: opened again, the bar, the step and the load are what the fields showed`, after);
      ok(!P.errors.length, `3. ${unit}: no page errors`, P.errors);
      await P.ctx.close();
    }
  }

  // ---- 4. The log read through its types (351): r60's answer for every raw log, but for the two inputs no build writes.
  if (run(4)) {
    const A = await open(OLD, { browser, clock: '2026-10-20T10:00:00', realStarter: true });
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
          if (again) { s = 1; res.j2 = JSON.stringify(L.normalize(JSON.parse(res.j))); }
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
      if (r() < 0.1) s.settings = pick([null, 'x', [], {}, { unit: 'kg', zz: 1, bwEvery: 14, bands: { chest: [30, 2], lats: 'x' }, secOrder: { today: ['a', 1] }, ownTargets: ['traps', 'chest'], bandsFit: { chest: 5, neck: 3 }, restWeeks: ['2026-10-05', 'x', '2026-10-05'], userName: '  a   b  ', accent: 'red' }]);
      if (r() < 0.1) s.routines = pick([[], null, [{ days: 'x' }], [{ id: 'q', days: [null, { items: 'x' }, { items: [null, { exId: 'bench', sets: 'x' }] }] }]]);
      return s;
    };
    // Whether a raw log keeps no routine (r60 then adds the starter as made, read as any routine on the next load).
    const noRoutine = s => !(s && Array.isArray(s.routines) && s.routines.some(r => r && typeof r === 'object' && !Array.isArray(r) && Array.isArray(r.days)));
    // Whether a raw log's workout in progress is falsy other than null (r60 kept it as it came).
    const falsyDraft = s => !!s && typeof s === 'object' && !Array.isArray(s) && s.draft !== null && s.draft !== undefined && !s.draft;
    const N4 = +process.env.R61_N4 || 240;
    let n = 0, same = 0, routineCases = 0, draftCases = 0; const off = [];
    for (let seed = 1; seed <= N4; seed++) {
      const h = wide(seed, LIB);
      const raws = [h.raw, damage(h.raw, seed * 31 + 1), damage(h.raw, seed * 31 + 2), damage(h.raw, seed * 31 + 3)];
      const docs = [{ draft: h.raw.draft || null }, { sessions: h.raw.sessions, cardio: h.raw.cardio }, { bodyweights: h.raw.bodyweights || [], measurements: h.raw.measurements || [] }];
      const list = [...raws, ...docs].map(s => [JSON.stringify(s), noRoutine(s)]);
      const [ra, rb] = await Promise.all([norm(A, list), norm(B, list)]);
      list.forEach(([raw, none], i) => {
        n++;
        const s = JSON.parse(raw), a = ra[i], b = rb[i];
        // Where no routine is kept, r60's starter as its next load reads it; a falsy workout as none; the rest as r60 gave it.
        let want = a.j;
        if (none && a.j2) { routineCases++; const w = JSON.parse(a.j); w.routines = JSON.parse(a.j2).routines; want = JSON.stringify(w); }
        if (falsyDraft(s)) { draftCases++; const w = JSON.parse(want); w.draft = null; want = JSON.stringify(w); }
        if (b.j === want && a.d === b.d && a.k === b.k) same++;
        else if (off.length < 5) { let at = 0; while (at < want.length && want[at] === b.j[at]) at++; off.push({ seed, i, none, want: want.slice(Math.max(0, at - 150), at + 150), b: b.j.slice(Math.max(0, at - 150), at + 150), d: [a.d, b.d], k: [a.k, b.k] }); }
      });
    }
    ok(same === n && n > N4 * 6, `4. normalize gives r60's answer, key order included, with the records dropped and the fields kept, on ${n} raw logs (${N4} wide histories, each damaged three ways, and the sync's documents), but for the two inputs below (${routineCases} with no routine, ${draftCases} with a falsy workout)`, off);
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
    ok(!A.errors.length && !B.errors.length, '4. no page errors', [A.errors, B.errors]);
    await A.ctx.close(); await B.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
