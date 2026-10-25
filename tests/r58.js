// r58 (PENDING 343, phase 5 of ARCHITECTURE.md): Plan, the exercise library
// and Stats move into src/app/ as lit-html screens (plan.ts, stats.ts, their
// charts in graphs.ts), every change Plan makes to the log through `act`.
// Run on r57 (`node tests/r58.js baselines/r57.html`), sections 3 (Stats) and
// 5 fail there; the rest are guards that pass on both builds:
//   1  (a guard, the source build) they look as they did: Plan, the library
//      and Stats in 36 logs, settings and modes, every section open, give the
//      same elements, attributes, field values and visible text as r57
//      (baselines/r57.html);
//   2  (a guard: r57 placed these steps by hand) every Plan action and field
//      that changes the log does act's steps, read on the page after a tap or
//      a typed value (changed, saved, the caches dropped, the edit noted for
//      the sync, the Undo step it had); Stats' own taps change nothing in the
//      log;
//   3  Plan, the library and Stats are drawn by lit-html and kept between
//      draws: a search being typed keeps its element, focus and text while the
//      list under it filters (r57 kept them by writing the list alone), and
//      Stats drawn again keeps its elements (r57 drew it fresh: fails there);
//   4  (guards) a drag on Plan, now on nodes lit-html owns: an exercise
//      dragged within its day, one dragged from Add exercises into the day, a
//      day dragged in a cycle and a day moved by the arrow keys each change the
//      log once and leave the page as the log says; a draw mid-drag drops the
//      drag;
//   5  found in the move, each failing on r57: Stats draws with a joint
//      flagged as injured (r57 failed to draw the screen: the joint, which the
//      injury sheet lists first, was read as a muscle), and the waist-to-height
//      tip says all it says (r57 cut it at the height's inch mark, 5'10").
const { open, engine, screenOf, screenDiff, touchDriver } = require('./h');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r57.html';
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// The starter routine's ids are made at random, so both builds are given the same ones.
const FIX = "const m={};L.state.routines.forEach((r,i)=>{m[r.id]='R'+i;r.id='R'+i;});L.state.activeRoutineId=m[L.state.activeRoutineId]||L.state.activeRoutineId;L.state.sessions.forEach(s=>{if(m[s.routineId])s.routineId=m[s.routineId];});L.saveNow();";
const DEMO = 'L.state.settings.onboarded=true;L.makeDemo();';
const ACTIVE = 'const R=L.state.routines.find(r=>r.id===L.state.activeRoutineId);';
// Plan hides Schedule and Weekly volume on a new install (DEFAULT_HIDDEN): shown, so they are compared too.
const ALL = 'L.state.settings.hidden=[];';
const pickEx = cond => `const I=L.IDX();const id=Object.keys(I.byEx).find(id=>{const e=L.EX(id);return ${cond};});if(id)L.ui.dashEx=id;L.render();`;
const SCREENS = [
  // Plan
  ['program', 'Plan, a new install', 'L.state.settings.onboarded=true;'],
  ['program', 'Plan, demo data', DEMO],
  ['program', 'Plan, demo data, every section shown', DEMO + ALL],
  ['program', 'Plan, an exercise open', DEMO + ALL, ACTIVE + 'L.ui.openItem=R.days.find(d=>d.items.length).items[0].uid;L.render();'],
  ['program', 'Plan, kg, RPE, a time budget, the second day', DEMO + ALL + "L.state.settings.unit='kg';L.state.settings.rirScale='rpe';L.state.settings.timeBudget=40;", ACTIVE + 'const d=R.days.filter(d=>d.items.length)[1];L.ui.dayFocus=d.id;L.ui.openItem=d.items[1].uid;L.render();'],
  ['program', 'Plan, RIR off, no drag library', DEMO + ALL + "L.state.settings.rirMode='off';window.__libs.sortable=false;"],
  ['program', 'Plan, fixed weekdays', DEMO + ALL + ACTIVE + "while(R.days.length<7)R.days.push({id:'x'+R.days.length,name:'Rest',rest:true,items:[]});R.schedule='weekly';"],
  ['program', 'Plan, a superset and a heavy day', DEMO + ALL + ACTIVE + "const d=R.days.find(d=>d.items.length>2);d.items[0].ss='s1';d.items[1].ss='s1';d.items.forEach(i=>i.sets=8);", ACTIVE + 'const d=R.days.find(d=>d.items.length>2);L.ui.dayFocus=d.id;L.ui.openItem=d.items[0].uid;L.render();'],
  ['program', 'Plan, a timed exercise open', DEMO + ALL + ACTIVE + "const ex=L.state.exercises.find(e=>e.timed);R.days[0].items.unshift({...R.days[0].items[0],uid:'tt',exId:ex.id,ss:null});L.state=L.normalize(L.state);", "L.ui.openItem='tt';L.render();"],
  ['program', 'Plan, routines to tidy, another shown', DEMO + ALL + "L.state.routines.push({id:'e1',name:'Blank',schedule:'cycle',days:[{id:'d1',name:'Day',rest:false,items:[]}]});const a=L.state.routines.find(r=>r.id===L.state.activeRoutineId);L.state.routines.push({...JSON.parse(JSON.stringify(a)),id:'dup',name:'Copy'});L.state=L.normalize(L.state);", "L.ui.bRoutine=L.state.routines.find(r=>r.name==='Copy').id;L.render();"],
  ['program', 'Plan, targets fitted (the usual-range note)', ALL + "L.state.settings.onboarded=true;const R=L.routineFromTemplate('full3');L.state.routines.push(R);L.state.activeRoutineId=R.id;L.fitTargets(R);"],
  ['program', 'Plan, sections hidden and moved, a search', DEMO + "L.state.settings.hidden=['program:schedule'];L.state.settings.secOrder.program=['days','pvol','routine','library'];L.ui.bLibQ='press';L.ui.bLibM='chest';"],
  ['program', 'Plan, every day closed, + adds to day 2', DEMO + ALL, "L.ui.dayFocus='';L.ui.bTarget=1;L.render();"],
  ['program', 'the library', DEMO + ALL, "L.ui.planView='library';L.render();"],
  ['program', 'the library, filtered', DEMO + ALL + "L.state.exercises.find(e=>!e.custom).note='a <note>';", "L.ui.planView='library';L.ui.libQ='row';L.ui.libE='cable';L.ui.libKind='common';L.render();"],
  ['program', 'the library, nothing matches', DEMO + ALL, "L.ui.planView='library';L.ui.libKind='rare';L.ui.libQ='zzzz';L.render();"],
  ['program', 'the library, less common and a custom one', DEMO + ALL + "L.state.exercises.push({...L.state.exercises[0],id:'c_x',name:'My lift',custom:true,maxLoad:100,perSide:true});L.state=L.normalize(L.state);", "L.ui.planView='library';L.ui.libKind='rare';L.render();"],
  // Stats
  ['dash', 'Stats, a new install', 'L.state.settings.onboarded=true;'],
  ['dash', 'Stats, demo data', DEMO],
  ['dash', 'Stats, kg, RPE, calibrated, a bodyweight goal, cardio', DEMO + "const s=L.state;s.settings.unit='kg';s.settings.rirScale='rpe';s.settings.rirMode='cal';s.settings.bwGoalPct=-0.5;s.cardio.push({id:'c1',date:'2026-10-20',kind:'walk',min:30,hr:120,when:'post',note:'',demo:false},{id:'c2',date:'2026-09-21',kind:'bike',min:45,hr:null,when:'solo',note:'',demo:false});"],
  ['dash', 'Stats, This week', DEMO, "L.ui.volMode='week';L.render();"],
  ['dash', 'Stats, Recent average, RIR off', DEMO + "L.state.settings.rirMode='off';", "L.ui.volMode='avg';L.render();"],
  ['dash', 'Stats, Weekly trend', DEMO, "L.ui.volMode='trend';L.ui.dashMuscle='chest';L.render();"],
  ['dash', 'Stats, Weekly trend of a muscle only tracked', DEMO, "L.ui.volMode='trend';L.ui.dashMuscle=[...L.TRACK_ONLY][0];L.render();"],
  ['dash', 'Stats, Load', DEMO, "L.ui.volMode='load';L.render();"],
  ['dash', 'Stats, By region over 8 weeks', DEMO, 'L.ui.regionWk=8;L.render();'],
  ['dash', 'Stats, an isolation lift', DEMO, pickEx('!L.isCompound(e)&&!L.noE1(e)&&!e.timed')],
  ['dash', 'Stats, a lift with no 1RM', DEMO, pickEx('L.noE1(e)')],
  ['dash', 'Stats, a bodyweight lift with no weigh-ins', DEMO + 'L.state.bodyweights=[];', pickEx('e.bw')],
  ['dash', 'Stats, goals', DEMO + "const b=L.state.exercises.find(e=>e.id==='bench');if(b)b.goal={w:120,r:5};const q=L.state.exercises.find(e=>e.id==='backSquat');if(q)q.goal={w:500,r:3};", "L.ui.dashEx='bench';L.render();"],
  ['dash', 'Stats, every best, tape measurements', DEMO + "L.state.measurements.push({id:'m1',date:'2026-08-20',demo:false,arm:36,waist:82,chest:100,thigh:58},{id:'m2',date:'2026-10-10',demo:false,arm:36.8,waist:84,chest:101.2,thigh:59});", 'L.ui.bestsAll=true;L.render();'],
  ['dash', 'Stats, check-ins answered', DEMO + 'L.state.sessions.forEach((x,i)=>{x.chk={sleep:1+i%3,energy:1+(i+1)%3,aches:1+(i+2)%3};});'],
  ['dash', 'Stats, sections hidden and moved, priorities, a muscle injured', DEMO + "const s=L.state;s.settings.hidden=['dash:body'];s.settings.secOrder.dash=['weak','volume','consistency','exercise'];s.settings.priorities=['chest','glutes'];s.injuries=[{id:'i1',m:'quads',date:'2026-10-01',note:'sore'}];"],
  ['dash', 'Stats, one session', DEMO + 'L.state.sessions=L.state.sessions.slice(-1);'],
  ['dash', 'Stats, the preview, a new install', 'L.state.settings.onboarded=true;', null, 'preview'],
  ['dash', 'Stats, no chart library', DEMO + 'window.__libs.chart=false;']
];

(async () => {
  const browser = await engine.launch();

  // ---- 1. The screens against r57's (both pages built from src/; the standalone build is left to the source run, as r57's section 4 is).
  if (process.env.IRONLOG_FILE) console.log('note r58 section 1 compares source pages; it runs on the source build');
  else for (const [tab, name, seed, prep, env] of SCREENS) {
    const a = await screenOf(OLD, { browser, seed: seed + FIX, tab, prep, env }), b = await screenOf(FILE, { browser, seed: seed + FIX, tab, prep, env });
    const d = screenDiff({ tree: a.tree, text: '' }, { tree: b.tree, text: '' });
    ok(!d, `1. ${name}: the same elements, attributes and field values as r57`, d && { at: d.at, r57: d.before, now: d.now });
    ok(a.text === b.text, `1. ${name}: the same visible text as r57`, a.text === b.text ? '' : { r57: a.text.slice(0, 400), now: b.text.slice(0, 400) });
    ok(!b.errors.length, `1. ${name}: no page errors`, b.errors);
  }

  const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.render(); });
  await wait(300);

  // ---- 2. Plan's actions and fields, each read on the page after it.
  const probe = (name, sel, undo, prep) => ev(async ([name, sel, undo, prep]) => {
    const L = window.__ironlog; const KEY = L.KEY;
    L.ui.tab = 'program'; L.ui.planView = 'routine';
    // What a case starts from is saved and seen by the sync first, so the tap's own change is what is read.
    if (prep) (new Function('L', prep))(L);
    L.saveNow(); await new Promise(r => setTimeout(r, 950));
    L.render(); await new Promise(r => setTimeout(r, 60));
    document.querySelectorAll('#view details').forEach(d => { d.open = true; });
    await new Promise(r => setTimeout(r, 60));
    const el = document.querySelector(sel); if (!el) return { name, missing: sel };
    const idx0 = L.IDX(); const u0 = L.undoStack.length; const s0 = JSON.stringify(L.state); const e0 = JSON.stringify(L.cloud.editAt);
    el.click(); await new Promise(r => setTimeout(r, 80));
    const okb = document.querySelector('#modal [data-act="mOk"]'); if (okb) { okb.click(); await new Promise(r => setTimeout(r, 80)); }
    await new Promise(r => setTimeout(r, 950));
    const s1 = JSON.stringify(L.state);
    return { name, changed: s1 !== s0, saved: localStorage.getItem(KEY) === s1, undo: L.undoStack.length - u0, wantUndo: undo, dropped: L.IDX() !== idx0, noted: JSON.stringify(L.cloud.editAt) !== e0 };
  }, [name, sel, undo, prep || '']);
  const OPEN = "const R=L.state.routines.find(r=>r.id===L.state.activeRoutineId);const d=R.days.find(d=>d.items.length>2);L.ui.dayFocus=d.id;L.ui.bTarget=R.days.indexOf(d);";
  const cases = [
    ['iUp', '#view .day:not(.rest) .dbody:not([hidden]) [data-act="iUp"]:not([disabled])', 0, OPEN],
    ['iDown', '#view .dbody:not([hidden]) [data-act="iDown"]:not([disabled])', 0, OPEN],
    ['iDel', '#view [data-act="iDel"]', 1, OPEN + 'L.ui.openItem=d.items[0].uid;'],
    ['ssToggle', '#view [data-act="ssToggle"]', 0, OPEN + 'L.ui.openItem=d.items[0].uid;'],
    ['libAdd', '#view #bLib [data-act="libAdd"]', 0, OPEN],
    ['dAdd', '#view [data-act="dAdd"]', 0],
    ['dAddRest', '#view [data-act="dAddRest"]', 0],
    ['dUp', '#view [data-act="dUp"]:not([disabled])', 0, 'window.__libs.sortable=false;'],
    ['dDown', '#view [data-act="dDown"]:not([disabled])', 0, 'window.__libs.sortable=false;'],
    ['dDel', '#view .dbody:not([hidden]) [data-act="dDel"]', 1, OPEN + 'window.__libs.sortable=true;'],
    ['rDup', '#view [data-act="rDup"]', 0],
    ['rActive', '#view [data-act="rActive"]', 0, "L.ui.bRoutine=L.state.routines.find(r=>r.id!==L.state.activeRoutineId).id;"],
    ['rDel', '#view [data-act="rDel"]', 1, "L.ui.bRoutine=L.state.routines.find(r=>r.id!==L.state.activeRoutineId).id;"],
    ['rClean', '#view [data-act="rClean"]', 1, "L.state.routines.push({id:'blank1',name:'Blank',schedule:'cycle',days:[{id:'bd1',name:'Day',rest:false,items:[]}]});"],
    ['exDel', '#view [data-act="exDel"][data-ex="c_r58"]', 1, "L.state.exercises.push({...L.state.exercises.find(e=>e.id==='bench'),id:'c_r58',name:'R58 lift',custom:true});L.state=L.normalize(L.state);L.ui.planView='library';"]
  ];
  for (const c of cases) {
    const r = await probe(...c);
    if (r.missing) { ok(false, `2. ${c[0]}: its control is on Plan`, r); continue; }
    ok(r.changed && r.saved && r.dropped && r.noted && r.undo === r.wantUndo, `2. ${c[0]}: changes the log, saves it, drops the caches, notes the edit for the sync${r.wantUndo ? ' and keeps one Undo step' : ', keeping no Undo step as before'}`, r);
  }
  // The fields: typed (input, then change) or picked (change).
  const field = (name, sel, value, undo, prep) => ev(async ([name, sel, value, undo, prep]) => {
    const L = window.__ironlog; const KEY = L.KEY;
    L.ui.tab = 'program'; L.ui.planView = 'routine';
    if (prep) (new Function('L', prep))(L);
    L.saveNow(); await new Promise(r => setTimeout(r, 950));
    L.render(); await new Promise(r => setTimeout(r, 60));
    document.querySelectorAll('#view details').forEach(d => { d.open = true; });
    const el = document.querySelector(sel); if (!el) return { name, missing: sel };
    const idx0 = L.IDX(); const u0 = L.undoStack.length; const s0 = JSON.stringify(L.state); const e0 = JSON.stringify(L.cloud.editAt);
    if (el.type === 'checkbox') el.checked = !el.checked;
    else { el.value = value; if (el.tagName === 'INPUT') el.dispatchEvent(new Event('input', { bubbles: true })); }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 950));
    const s1 = JSON.stringify(L.state);
    return { name, changed: s1 !== s0, saved: localStorage.getItem(KEY) === s1, undo: L.undoStack.length - u0, wantUndo: undo, dropped: L.IDX() !== idx0, noted: JSON.stringify(L.cloud.editAt) !== e0 };
  }, [name, sel, value, undo, prep || '']);
  const ITEM = OPEN + 'L.ui.openItem=d.items[0].uid;';
  for (const [name, sel, value, undo, prep] of [
    ['sets', '#view [data-it="sets"]', '5', 0, ITEM], ['rep min', '#view [data-it="repMin"]', '4', 0, ITEM], ['rep max', '#view [data-it="repMax"]', '15', 0, ITEM],
    ['target RIR', '#view [data-it="rir"]', '3', 0, ITEM], ['rest', '#view [data-it="rest"]', '137', 0, ITEM], ['load step', '#view [data-it="inc"]', '2.5', 0, ITEM],
    ['load jump', '#view [data-it="jump"]', '4', 0, ITEM], ['Move to', '#view [data-moveto]', '0', 0, OPEN.replace('R.days.find(d=>d.items.length>2)', 'R.days.filter(d=>d.items.length>2)[1]') + 'L.ui.openItem=d.items[0].uid;'],
    ['a day\'s name', '#view .dbody:not([hidden])', null, 0, null], ['the routine\'s name', '#view [data-bind="routineName"]', 'R58 plan', 0], ['Schedule', '#view [data-bind="rSchedule"]', 'weekly', 1, "L.state.settings.hidden=L.state.settings.hidden.filter(k=>k!=='program:schedule');const R=L.state.routines.find(r=>r.id===L.state.activeRoutineId);R.schedule='cycle';R.days=R.days.slice(0,6);"]
  ]) {
    // A day's name is the input in the open day's header.
    const s = name === 'a day\'s name' ? '#view .day [data-dayname]' : sel;
    const r = await field(name, s, name === 'a day\'s name' ? 'Push R58' : value, undo, prep);
    if (r.missing) { ok(false, `2. the ${name} field is on Plan`, r); continue; }
    ok(r.changed && r.saved && r.dropped && r.noted && r.undo === r.wantUndo, `2. ${name}: changed, saved, the caches dropped and the edit noted for the sync${r.wantUndo ? ', with one Undo step' : ''}`, r);
  }
  {
    const r = await field('Rest day', '#view [data-dayrest]', null, 1);
    ok(r.changed && r.saved && r.dropped && r.noted && r.undo === 1, '2. Rest day: changed, saved, the caches dropped, the edit noted for the sync, with one Undo step', r);
  }
  // A minimum typed above the maximum raises the maximum when it is left (r30).
  {
    const r = await ev(async open => {
      const L = window.__ironlog; (new Function('L', open))(L); const it = L.state.routines.find(x => x.id === L.state.activeRoutineId).days.find(x => x.items.length > 2).items[0];
      L.ui.openItem = it.uid; it.repMin = 6; it.repMax = 10; L.saveNow(); L.ui.tab = 'program'; L.render(); await new Promise(r => setTimeout(r, 60));
      const el = document.querySelector('#view [data-it="repMin"]'); el.value = '12'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      return { min: it.repMin, max: it.repMax, shown: document.querySelector('#view [data-it="repMax"]').value };
    }, OPEN);
    ok(r.min === 12 && r.max === 12 && r.shown === '12', '2. a rep minimum typed above the maximum raises the maximum, shown at once', r);
  }
  // Stats' taps change what it shows, never the log.
  for (const [name, sel] of [['volMode', '[data-act="volMode"][data-v="week"]'], ['regionWk', '[data-act="regionWk"][data-v="8"]'], ['bestsAll', '[data-act="bestsAll"]'], ['dashJump', '[data-act="dashJump"][data-sec="body"]']]) {
    const r = await ev(async ([name, sel]) => {
      const L = window.__ironlog; L.ui.tab = 'dash'; L.ui.volMode = 'region'; L.ui.bestsAll = false; L.saveNow(); L.render(); await new Promise(r => setTimeout(r, 60));
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const el = document.querySelector('#view ' + sel); if (!el) return { name, missing: sel };
      const s0 = JSON.stringify(L.state); const saved0 = localStorage.getItem(L.KEY);
      el.click(); await new Promise(r => setTimeout(r, 200));
      return { name, same: JSON.stringify(L.state) === s0 && localStorage.getItem(L.KEY) === saved0 };
    }, [name, sel]);
    ok(r.same, `2. Stats' ${name}: changes what Stats shows and nothing in the log`, r);
  }

  // ---- 3. Drawn by lit-html and kept between draws: the searches keep their focus and text as they filter.
  for (const [where, sel, typed, list] of [['Plan', '#view [data-bind="bLibQ"]', 'curl', '#view #bLib > li'], ['the library', '#view [data-bind="libQ"]', 'curl', '#view #libList .hitem']]) {
    const r = await ev(async ([where, sel, typed, list]) => {
      const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = where === 'Plan' ? 'routine' : 'library'; L.ui.bLibQ = ''; L.ui.libQ = ''; L.render(); await new Promise(r => setTimeout(r, 60));
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const head = document.querySelector('#view .ph'); const f = document.querySelector(sel); const n0 = document.querySelectorAll(list).length;
      f.focus(); f.value = typed; f.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 120));
      const again = document.querySelector(sel); const rows = [...document.querySelectorAll(list)].map(e => e.textContent);
      return { same: again === f && document.querySelector('#view .ph') === head, focus: document.activeElement === again, text: again.value === typed, n0, n: rows.length, all: rows.every(t => /curl/i.test(t)) };
    }, [where, sel, typed, list]);
    ok(r.same && r.focus && r.text && r.n > 0 && r.n < r.n0 && r.all, `3. ${where}: a search being typed keeps its element, focus and text while the list filters to it`, r);
  }
  {
    const r = await ev(async () => {
      const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); await new Promise(r => setTimeout(r, 60));
      const head = document.querySelector('#view .ph'), sel = document.querySelector('#view [data-bind="dashEx"]');
      L.render(); await new Promise(r => setTimeout(r, 60));
      return document.querySelector('#view .ph') === head && document.querySelector('#view [data-bind="dashEx"]') === sel;
    });
    ok(r, '3. Stats: drawn again, the screen keeps its elements');
  }
  ok(P.errors.length === 0, 'no page errors', P.errors);
  await P.page.context().close();

  // ---- 4. Drags on Plan (guards: each passes on r57, whose page was drawn fresh).
  {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00', touch: true });
    // Tall enough that a drag from Add exercises reaches the day without the page scrolling under the finger.
    await Q.page.setViewportSize({ width: 390, height: 3000 });
    const tp = await touchDriver(Q.page);
    const q = (f, a) => Q.page.evaluate(f, a);
    await q(open => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); (new Function('L', open))(L); L.saveNow(); L.ui.tab = 'program'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); }, OPEN);
    await wait(300);
    // What the page shows against what the log says.
    const read = () => q(() => {
      const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId);
      const d = R.days.find(x => x.id === document.querySelector('#view .day .dbody:not([hidden])').closest('.day').dataset.did);
      const saved = JSON.parse(localStorage.getItem(L.KEY)); const sR = saved.routines.find(r => r.id === R.id);
      return {
        dom: [...document.querySelectorAll('#view .dbody:not([hidden]) ul.items > li')].map(e => e.dataset.uid), log: d.items.map(i => i.uid), ex: d.items.map(i => i.exId),
        days: [...document.querySelectorAll('#view #dayList > section.day')].map(e => e.dataset.did), logDays: R.days.map(x => x.id),
        labels: [...document.querySelectorAll('#view #dayList .dlabel')].map(e => e.textContent),
        lib: [...document.querySelectorAll('#view #bLib > li')].map(e => e.dataset.ex),
        savedSame: JSON.stringify(sR) === JSON.stringify(R),
        ghost: document.querySelectorAll('.sortable-ghost,.sortable-chosen,.sortable-drag').length
      };
    });
    const drag = async (from, to, below, mid) => {
      await Q.page.locator(from).first().scrollIntoViewIfNeeded();
      const gb = await Q.page.locator(from).first().boundingBox(), tb = await Q.page.locator(to).first().boundingBox();
      const x0 = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2, x1 = tb.x + 24, y1 = below ? tb.y + tb.height - 4 : tb.y + 4;
      await tp('touchStart', x0, y0); await wait(60);
      for (let k = 1; k <= 20; k++) { await tp('touchMove', x0 + (x1 - x0) * k / 20, y0 + (y1 - y0) * k / 20); await wait(25); if (mid && k === 12) { await q(() => window.__ironlog.render()); await wait(40); } }
      await tp('touchEnd', x1, y1); await wait(500);
    };
    const s0 = await read();
    // An exercise dragged from first to last in its day.
    await drag('#view .dbody:not([hidden]) ul.items > li:first-child .grip', '#view .dbody:not([hidden]) ul.items > li:last-child', true);
    const s1 = await read();
    ok(s1.log[0] !== s0.log[0] && s1.log.length === s0.log.length && [...s1.log].sort().join() === [...s0.log].sort().join() && s1.dom.join() === s1.log.join() && s1.savedSame && !s1.ghost,
      '4. an exercise dragged down its day moves in the log, once, and the page shows the log\'s order with no drag left behind', { s0: s0.log, s1 });
    // Then the arrows still move the exercises the page shows.
    await Q.page.locator('#view .dbody:not([hidden]) [data-act="iDown"]').first().click(); await wait(200);
    const s2 = await read();
    ok(s2.dom.join() === s2.log.join() && s2.log[0] === s1.log[1] && s2.log[1] === s1.log[0], '4. after the drag, ↓ moves the exercise the page shows, and the page follows the log', { s1: s1.log, s2 });
    // An exercise dragged from Add exercises into the day: a new item there, the list as it was.
    const libEx = s2.lib[0];
    await drag('#view #bLib > li:first-child .grip', '#view .dbody:not([hidden]) ul.items > li:first-child', false);
    const s3 = await read();
    ok(s3.log.length === s2.log.length + 1 && s3.ex.includes(libEx) && s3.dom.join() === s3.log.join() && s3.lib.join() === s2.lib.join() && s3.savedSame && !s3.ghost,
      '4. an exercise dragged from Add exercises into the day is added there once, and the list stays as it was, with no copy left in it', { libEx, s2: s2.log.length, s3 });
    // A day dragged below the next one: the days in the log's order, renumbered.
    await drag('#view #dayList > section.day:nth-child(1) .dgrip', '#view #dayList > section.day:nth-child(2)', true);
    const s4 = await read();
    ok(s4.logDays[0] === s3.logDays[1] && s4.logDays[1] === s3.logDays[0] && s4.days.join() === s4.logDays.join() && s4.labels[0] === 'Day 1' && s4.savedSame && !s4.ghost,
      '4. a day dragged below the next one swaps with it in the log, and the page shows the days in that order, renumbered', { s3: s3.logDays, s4 });
    // A day moved by the arrow keys on its handle, the handle keeping the focus.
    await Q.page.locator('#view .dgrip[data-di="0"]').focus(); await Q.page.keyboard.press('ArrowDown'); await wait(250);
    const s5 = await read(); const foc = await q(() => document.activeElement && document.activeElement.dataset.di);
    ok(s5.logDays[1] === s4.logDays[0] && s5.days.join() === s5.logDays.join() && foc === '1' && s5.savedSame, '4. ↓ on a day\'s handle moves the day, and the handle keeps the focus in its new place', { s4: s4.logDays, s5: s5.logDays, foc });
    // A draw in the middle of a drag (a sync bringing another phone's change) drops the drag.
    await drag('#view .dbody:not([hidden]) ul.items > li:first-child .grip', '#view .dbody:not([hidden]) ul.items > li:last-child', true, true);
    const s6 = await read();
    ok(s6.log.join() === s5.log.join() && s6.dom.join() === s6.log.join() && !s6.ghost && s6.savedSame, '4. a draw mid-drag puts the exercise back, with nothing saved and no drag left behind', { s5: s5.log, s6 });
    ok(!Q.errors.length, '4. no page errors', Q.errors);
    await Q.page.context().close();
  }

  // ---- 5. Found in the move (each fails on r57).
  {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo();
      L.state.injuries = [{ id: 'i1', m: 'j_shoulder', date: '2026-10-01', note: '' }]; L.state = L.normalize(L.state); L.saveNow();
      L.ui.tab = 'dash'; L.render(); await new Promise(r => setTimeout(r, 100));
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const sec = document.querySelector('#view [data-mkey="weak"]');
      const row = sec && [...sec.querySelectorAll('.card > div')].find(e => /Shoulder/.test(e.textContent));
      return { broke: /Something broke/.test(document.getElementById('view').innerText), row: row ? row.innerText.replace(/\s+/g, ' ').trim() : null, log: L.logBuf.filter(x => x.a === 'render').length };
    });
    ok(!r.broke && !r.log && r.row && /Injured, targets paused/.test(r.row) && !/hard set/.test(r.row), '5. Stats draws with a joint flagged as injured, listing the joint as injured with no sets or target', r);
    const tips = await Q.page.evaluate(async () => {
      const L = window.__ironlog; L.state.settings.heightCm = 177.8; L.state.settings.unit = 'lb';
      L.state.measurements.push({ id: 'm9', date: '2026-10-20', demo: false, waist: 84 }); L.state = L.normalize(L.state); L.saveNow();
      L.ui.tab = 'dash'; L.render(); await new Promise(r => setTimeout(r, 100));
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const t = document.querySelector('#view .whtr .hastip');
      return { stats: t ? t.dataset.tip : null, suite: L.whtrLine(true) };
    });
    ok(tips.stats && /height 5'10"\. Under 0\.50 healthy/.test(tips.stats) && /Unlike BMI it does not count muscle against you\.$/.test(tips.stats), '5. the waist-to-height tip says the height with its inch mark and all that follows it', tips.stats);
    const today = await Q.page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = window.__ironlog.whtrLine(true); const t = d.querySelector('.hastip'); return t ? t.dataset.tip : null; });
    ok(today && /height 5'10"\. Under 0\.50/.test(today), '5. the same line on Today\'s tape measurements says it all too', today);
    await Q.page.context().close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
