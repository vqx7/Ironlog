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
//      constants their rules apply).
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
      const [a, b] = [await guideOf(OLD, unit, rir), await guideOf(FILE, unit, rir)];
      let k = 0; while (k < a.html.length && a.html[k] === b.html[k]) k++;
      ok(a.html === b.html && a.text === b.text, `1. the Guide in ${unit} with RIR ${rir}: the same markup and text as r60 (${b.text.length} characters)`, a.html === b.html ? { r60: a.text.slice(0, 300), now: b.text.slice(0, 300) } : { at: k, r60: a.html.slice(Math.max(0, k - 120), k + 200), now: b.html.slice(Math.max(0, k - 120), k + 200) });
      ok(!b.errors.length, `1. the Guide in ${unit} with RIR ${rir}: no page errors`, b.errors);
    }
  } else if (run(1)) console.log('note r61 section 1 compares source pages; it runs on the source build');

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
