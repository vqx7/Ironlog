// r58 (PENDING 343, phase 5 of ARCHITECTURE.md): Plan, the exercise library
// and Stats move into src/app/ as lit-html screens (plan.ts, stats.ts, their
// charts in graphs.ts), every change Plan makes to the log through `act`; and
// four decisions of V's (339 e, h, i and the PR notions). Run on r57 (`node
// tests/r58.js baselines/r57.html`, R58_ONLY=n for one section), sections 3
// (Stats) and 5 to 9 fail there; the rest are guards that pass on both builds:
//   1  (a guard, the source build) they look as they did: Plan, the library
//      and Stats in 36 logs, settings and modes, every section open, give the
//      same elements, attributes, field values and visible text as r57
//      (baselines/r57.html), but for the changes below held on purpose (the
//      muscles with a target on r57 given one, r57's e1RM read as Best
//      estimate);
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
//   5  found in the move: Stats draws with a joint flagged as injured (r57
//      failed to draw the screen: the joint, which the injury sheet lists
//      first, was read as a muscle), and the waist-to-height tip says all it
//      says (r57 cut it at the height's inch mark, 5'10");
//   6  339 (i): Stats says Best estimate, never e1RM, its tip naming it;
//   7  339 (h): in a session on a day of the routine, a lift's usual sets are
//      the plan's, so fewer sets never become the usual; a lift it does not
//      plan, or one done in Freestyle, reads its own as before;
//   8  one PR (343 6): a heavier set that is no PR is no PR in the toast, the
//      row's mark, the Lifts chart, the preview's PR last time and Readiness;
//   9  339 (e): a default target only on the muscles lifters train directly
//      for size; any other tracked only until given one (typed, Set a target,
//      a focus), which then counts on Stats, Plan and the map; Weekly set
//      targets offers Set a target and Track only; Default targets takes them
//      off, with Undo.
const { open, engine, screenOf, screenDiff, touchDriver } = require('./h');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r57.html';
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
// R58_ONLY=5,6 runs those sections alone (to show a case failing on r57 without the rest).
const ONLY = process.env.R58_ONLY ? process.env.R58_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));

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
  /* The release's changes on purpose are held here, so the comparison reads the move alone: every
     muscle that has a target on r57 is given one (KEEP, 339 e: the field is unknown to r57), a muscle
     tracked only says how to give it a target, and r57's "e1RM" reads as section 6 says (339 i). The
     rest of a difference fails. */
  const KEEP = "L.state.settings.ownTargets=['traps','lowerBack','frontDelts','forearms','obliques','adductors','abductors'];L.saveNow();";
  const TIP = 'Your best estimated one-rep max (e1RM): the most that one of your sets says you could lift for a single rep, worked out from its load, its reps, and its RIR. An estimate, not a tested max.';
  const asNow = shot => ({
    ...shot,
    tree: shot.tree.map(t => t.replace(/Tracked only: no study sets a weekly dose for it\./g, 'Tracked only: counted, with no target. Give it one in Settings, Weekly set targets.').replace(/<div class="l">"Best e1RM \(([^)]*)\)"<\/div>/g, (_, u) => `<div class="l">"Best estimate (${u})"<button aria-label="About the best estimate" class="tipi" data-tip=${JSON.stringify(TIP)} type="button">"i"</button></div>`).replace(/<th class="r">"e1RM"<\/th>/g, '<th class="r">"Best estimate"</th>')),
    // A table's heading is in capitals on screen (its style), so its words are too.
    text: tipless(shot.text.replace(/Best e1RM \(([^)]*)\)/g, 'Best estimate ($1)').replace(/\bE1RM\b/g, 'BEST ESTIMATE').replace(/\be1RM\b/g, 'Best estimate'))
  });
  /* The visible text is read with its spaces and line breaks left out, on both pages, and the tile's new tip
     button (held in the elements above) with them: the words of every text node are held by the elements (each
     run trimmed, so not a space at its ends: tests/r59.js reads those), and how text reads at a line wrap
     differs by engine. WebKit's CI run (2026-10-25) read "Oct 23PR" where a date
     and its PR tag wrap in Lifts' table, whose first column the longer "Best estimate" heading narrows
     (98 to 88 px at 390 wide), and where r57's fit on one line. */
  /* The spaces drawn between elements are read too (screenOf's spaces, since r59), but for the one r58 adds on
     purpose: before the tile's new tip button, after "Best estimate (lb)". */
  function tipSpace(t) { return t.replace(/("Best estimate \([a-z]+\)) "(<button aria-label="About the best estimate")/g, '$1"$2'); }
  function tipless(t) { return t.replace(/(Best estimate \([^)]*\))\s*i(?![\w])/g, '$1').replace(/\s+/g, ''); }
  // Where two texts first differ, with some of each around it.
  const textDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return { at: i, r57: a.slice(Math.max(0, i - 80), i + 160), now: b.slice(Math.max(0, i - 80), i + 160) }; };
  if (!run(1));
  else if (process.env.IRONLOG_FILE) console.log('note r58 section 1 compares source pages; it runs on the source build');
  else for (const [tab, name, seed, prep, env] of SCREENS) {
    const a = asNow(await screenOf(OLD, { browser, seed: seed + FIX + KEEP, tab, prep, env, spaces: true })), b1 = await screenOf(FILE, { browser, seed: seed + FIX + KEEP, tab, prep, env, spaces: true }), b0 = { ...b1, tree: b1.tree.map(tipSpace) }, b = { ...b0, text: tipless(b0.text) };
    const d = screenDiff({ tree: a.tree, text: '' }, { tree: b.tree, text: '' });
    ok(!d, `1. ${name}: the same elements, attributes and field values as r57`, d && { at: d.at, r57: d.before, now: d.now });
    ok(a.text === b.text, `1. ${name}: the same visible text as r57`, a.text === b.text ? '' : textDiff(a.text, b.text));
    ok(!b.errors.length, `1. ${name}: no page errors`, b.errors);
  }

  // Plan with a day of three or more exercises open, and Add exercises aimed at it (sections 2 and 4).
  const OPEN = "const R=L.state.routines.find(r=>r.id===L.state.activeRoutineId);const d=R.days.find(d=>d.items.length>2);L.ui.dayFocus=d.id;L.ui.bTarget=R.days.indexOf(d);";
  if (run(2) || run(3)) {
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
  }

  // ---- 4. Drags on Plan (guards: each passes on r57, whose page was drawn fresh).
  if (run(4)) {
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
      /* The finger rests where it drops, as a finger does: SortableJS reads where a touch drag is every 50 ms
         (_emulateDragOver), so a touch lifted 25 ms after its last move could end before the drag reached the day,
         and on a busy machine it did (r59: once in five here, and on GitHub's WebKit run of 93b20b2, on r58 too). */
      await wait(150);
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
  if (run(5)) {
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

  // ---- 6. 339 (i): Stats says "Best estimate", not "e1RM", with a tip that it is an estimated one-rep max.
  if (run(6)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.saveNow();
      L.ui.tab = 'dash'; L.ui.dashEx = 'bench'; L.render(); await new Promise(r => setTimeout(r, 200));
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const sec = document.querySelector('#view [data-mkey="exercise"]');
      const tile = [...sec.querySelectorAll('.kpi')].find(k => /Best/.test(k.textContent));
      const tip = tile && tile.querySelector('[data-tip]');
      const head = [...sec.querySelectorAll('table.t th')].map(t => t.textContent);
      const ch = window.Chart && window.Chart.getChart(document.getElementById('chEx'));
      return { text: /e1RM/.test(sec.innerText), tile: tile ? tile.querySelector('.l').textContent : null, tip: tip ? tip.dataset.tip : null, head, chart: ch ? ch.data.datasets[0].label : null };
    });
    ok(!r.text && r.tile && /^Best estimate \(lb\)/.test(r.tile) && r.tip && /estimated one-rep max \(e1RM\)/.test(r.tip) && r.head.includes('Best estimate') && r.chart === 'Best estimate (lb)',
      '6. Lifts says Best estimate on its tile, its table and its chart, never e1RM, the tile\'s tip saying it is an estimated one-rep max (e1RM)', r);
    await Q.page.context().close();
  }

  // ---- 7. 339 (h): in a session on a day of the routine, a lift's usual sets are the plan's, so fewer sets never become the usual.
  // Since the review of r58, each such session keeps the sets its plan gave the lift then (`ps`), written by Finish, and is read by them.
  if (run(7)) {
    const Q = await open(FILE, { browser, clock: '2026-10-15T10:00:00' });
    const q = (f, a) => Q.page.evaluate(f, a);
    // A routine of one day, bench press planned at 4 sets of 6 to 10, and the sessions given (sets as [load, reps], then
    // the sets the plan gave it then, as Finish saves them on a day of the routine: 4 unless given).
    const log = (planned, sets) => q(([planned, sets]) => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg';
      const R = { id: 'R58', name: 'R58', schedule: 'cycle', days: [{ id: 'D58', name: 'Push', rest: false, items: [{ uid: 'i58', exId: 'bench', sets: 4, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5, ss: null }] }] };
      s.routines = [R]; s.activeRoutineId = 'R58'; s.draft = null; s.deloadWeek = null; s.injuries = [];
      // planned: bench on the routine's day; 'free': bench in Freestyle sessions; false: floor press, on no day of the routine, in Freestyle.
      const exId = planned ? 'bench' : 'floorPress'; const day = planned === true;
      s.sessions = sets.map(([id, date, w, reps, ps]) => ({ id, date, dayIdx: 0, dayId: day ? 'D58' : null, dayName: day ? 'Push' : 'Session', routineId: day ? 'R58' : '', free: !day, notes: '', ex: [{ exId, rr: [6, 10], sets: reps.map(r => ({ w, r, rir: 1, warm: false, drop: false })), ...(day ? { ps: ps || 4 } : {}) }] }));
      L.state = L.normalize(s); L.invalidate(); L.saveNow();
      const I = L.IDX(); const xs = I.byEx[exId] || [];
      const g = L.suggest(exId, { sets: 4, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5 }, {});
      return { short: xs.map(x => x.short || null), basis: g.basis || null, target: g.target, text: g.text, n: (I.exStats[exId] || {}).wN, prs: I.prs.filter(p => p.exId === exId && p.big).map(p => p.sid) };
    }, [planned, sets]);
    const S = [['h1', '2026-10-01', 100, [8, 8, 8, 8]], ['h2', '2026-10-08', 100, [9, 9, 9]], ['h3', '2026-10-12', 100, [9, 9, 9]]];
    const pl = await log(true, S);
    ok(pl.short[1] === 'sets' && pl.short[2] === 'sets' && pl.basis === '2026-10-01' && /fewer sets/.test(pl.text || '') && pl.n === 3 && pl.prs.includes('h2'),
      '7. bench planned at 4 sets, 100 x 8 x 4 then 100 x 9 x 3 twice: both short of the plan\'s 4 sets, so the target still comes from the 4-set session, Last says fewer sets, and the trend and the PR read them', pl);
    // Guards: a lift on no day of the routine reads its own sessions, as before, so two of 3 sets in a row are its usual; so does a planned lift done in Freestyle.
    const fr = await log(false, S);
    ok(fr.short[1] === 'sets' && !fr.short[2] && fr.basis == null, '7. a lift the routine does not plan (floor press, freestyle) reads its own sessions as before: two of 3 sets in a row are its usual, and the target comes from the last', fr);
    const fb = await log('free', S);
    ok(fb.short[1] === 'sets' && !fb.short[2] && fb.basis == null, '7. bench, planned at 4, done in Freestyle sessions the same way reads its own sessions too, as before', fb);
    // From the review of r58 (fails on 5eb8d03, passes on r57; the next case fails on both): six weeks of 3 sets, 100 to 112.5, done to a plan of 3,
    // then the plan raised to 4. Each session is read by its own plan, so none is short and the target comes from the last.
    const WK = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];
    const up = await log(true, [100, 102.5, 105, 107.5, 110, 112.5].map((w, i) => ['u' + i, WK[i], w, [8, 8, 8], 3]));
    ok(up.short.every(x => x === null) && up.basis == null && !/fewer sets/.test(up.text || '') && /at 112\.5 kg$/.test(up.target || ''),
      '7. a plan raised from 3 sets to 4 after six sessions of 3 done to a plan of 3: none of them is short, and the target comes from the last (112.5), not the first', up);
    // The coach's two ways: a set taken off (4 to 3, after 100 x 8 x 4), five weeks of 3 to 110, then the set put back and a
    // session of 3 at 112.5: only that one is short of its plan's 4, which a session has done, so the target stays at 110.
    const back = await log(true, [[100, 4, 4], [102.5, 3, 3], [105, 3, 3], [107.5, 3, 3], [110, 3, 3], [112.5, 3, 4]].map(([w, n, ps], i) => ['b' + i, WK[i], w, Array(n).fill(8), ps]));
    ok(back.short.slice(0, 5).every(x => x === null) && back.short[5] === 'sets' && back.basis === '2026-10-01' && /at 110 kg$/.test(back.target || ''),
      '7. a set taken off and put back: the sessions of 3 done to a plan of 3 stay as they were, and only the session of 3 after it went back to 4 is short (the target from 110, not 100)', back);
    // Finish saves the sets the plan gave each lift on a day of the routine, and nothing in Freestyle; an edit from History
    // keeps the sets saved with it, whatever the plan says by then.
    const fin = await q(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.autoDone = true; s.sessions = []; s.draft = null; L.makeDemo();
      for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of s[k]) delete x.demo; L.invalidate();
      L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 100));
      document.querySelector('.hero [data-act="startSession"]').click(); await new Promise(r => setTimeout(r, 150));
      const d = s.draft; const R = s.routines.find(r => r.id === d.routineId);
      for (const b of d.ex) Object.assign(b.sets[0], { w: b.sets[0].w || 20, r: 8, done: true });
      d._rampAsked = true; d._leftAsked = true; L.ACT.finishNow(); await new Promise(r => setTimeout(r, 300));
      const sv = L.sortedSessions().slice(-1)[0];
      const planned = sv.ex.map(b => [b.ps, L.planItemOf(R, b.exId, d.dayId).sets]);
      const it = L.planItemOf(R, sv.ex[0].exId, d.dayId); const was = it.sets; it.sets = was + 1;
      L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id: sv.id } }); await new Promise(r => setTimeout(r, 100));
      s.draft.ex[0].sets[0].r = 9; s.draft._rampAsked = true; L.ACT.finishNow(); await new Promise(r => setTimeout(r, 300));
      const ed = s.sessions.find(x => x.id === sv.id); const edited = !s.draft && ed.ex[0].sets[0].r === 9;
      it.sets = was;
      L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 100));
      // Freestyle: a lift the routine plans, added to a blank session, saved with no plan's sets.
      L.ACT.startFree(); await new Promise(r => setTimeout(r, 150));
      const f = s.draft; const exId = it.exId; f.ex.push(L.newBlock(exId, L.planFor(exId, null, null, false, f.date), {})); Object.assign(f.ex[f.ex.length - 1].sets[0], { w: 20, r: 8, done: true });
      f._rampAsked = true; f._leftAsked = true; L.ACT.finishNow(); await new Promise(r => setTimeout(r, 300));
      const fs = s.sessions.find(x => x.id === f.id) || { ex: [] };
      return { planned, edited, kept: [ed.ex[0].ps, was], free: { free: !!fs.free, ex: fs.ex.map(b => [b.exId, 'ps' in b]) }, saved: JSON.parse(localStorage.getItem(L.KEY)).sessions.find(x => x.id === sv.id).ex.map(b => b.ps) };
    });
    ok(fin.planned.length > 0 && fin.planned.every(([a, b]) => a === b) && fin.saved.every(x => typeof x === 'number'), '7. Finish on a day of the routine saves, with each lift, the sets its plan gives it', fin);
    ok(fin.edited && fin.kept[0] === fin.kept[1], '7. an edit from History keeps the sets saved with the session, after the plan changed', fin);
    ok(fin.free.free && fin.free.ex.length === 1 && fin.free.ex[0][1] === false, '7. a Freestyle session saves no plan\'s sets, so it reads its own, as before', fin.free);
    await Q.page.context().close();
  }

  // ---- 8. Two PR notions, not three (343 6): a PR is a set stronger than every earlier one, the counted
  // PR of Recent PRs and the recap; a heavier set that is not one is Heaviest yet. The toast, the row's
  // mark, the Lifts chart's diamonds, the preview's PR last time and Readiness read that one PR.
  if (run(8)) {
    const Q = await open(FILE, { browser, clock: '2026-10-15T10:00:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg';
      const R = { id: 'R58', name: 'R58', schedule: 'cycle', days: [{ id: 'D58', name: 'Push', rest: false, items: [{ uid: 'i58', exId: 'bench', sets: 1, repMin: 3, repMax: 10, rir: 1, rest: 120, inc: 2.5, ss: null }] }] };
      s.routines = [R]; s.activeRoutineId = 'R58'; s.draft = null; s.deloadWeek = null; s.injuries = [];
      // 100 x 10 to failure (an estimate of about 133), then 120 x 3 to failure: heavier than ever, but weaker (about 127).
      const ses = (id, date, w, r, chk) => ({ id, date, dayIdx: 0, dayId: 'D58', dayName: 'Push', routineId: 'R58', free: false, notes: '', chk, ex: [{ exId: 'bench', rr: [3, 10], sets: [{ w, r, rir: 0, warm: false, drop: false }] }] });
      s.sessions = [ses('p1', '2026-09-20', 100, 10, { sleep: 3, energy: 3, joints: 3 }), ses('p2', '2026-09-27', 120, 3, { sleep: 3, energy: 3, joints: 3 })];
      L.state = L.normalize(s); L.invalidate(); L.saveNow();
      const I = L.IDX();
      const list = I.prs.filter(p => p.sid === 'p2').map(p => ({ type: p.type, big: p.big }));
      // The live toast's reading of a set of 122 x 3 to failure: a best for 1 to 5 reps, weaker than 100 x 10.
      const live = L.livePR('bench', { w: 122, r: 3, rir: 0, warm: false, drop: false, done: true }, '2026-10-15');
      L.ui.tab = 'dash'; L.ui.dashEx = 'bench'; L.render(); await new Promise(r => setTimeout(r, 300));
      const ch = window.Chart && window.Chart.getChart(document.getElementById('chEx'));
      const styles = ch ? ch.data.datasets[0].pointStyle : null;
      L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 200));
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const pv = document.querySelector('#view [data-mkey="session"]');
      const tag = pv && /Barbell Bench Press/.test(pv.innerText) ? /PR last time/.test(pv.innerText) : 'no preview';
      const rd = L.readiness().rows.find(x => x.k === 'sleep').groups.find(g => g.v === 3);
      return { list, live, styles, tag, rate: rd.rate };
    });
    ok(r.list.length === 1 && r.list[0].type === 'Weight PR' && !r.list[0].big, '8. the setup: 120 x 3 after 100 x 10 is a heavier set, not a PR (Heaviest yet)', r.list);
    ok(r.live == null, '8. the toast and the row\'s PR mark: a best for its reps that is weaker than an earlier set is no PR (r57 announced it as a new best estimate)', r.live);
    ok(Array.isArray(r.styles) && r.styles[1] === 'circle', '8. the Lifts chart marks no PR on the heavier set that was not one (r57 drew it as a PR diamond)', r.styles);
    ok(r.tag === false, '8. the workout preview says no PR last time after it (r57 did)', r.tag);
    ok(r.rate === 0, '8. Readiness counts it as no PR (r57: 100% of lifts set a PR)', r.rate);
    // The toast and the list read one rule, set by set: a best within its band of reps, weaker than an earlier set, is neither; one stronger than every earlier set is both (a guard).
    const pr = await Q.page.evaluate(() => {
      const L = window.__ironlog; const s = L.state;
      const ses = (id, date, sets) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: sets.map(([w, r, rir]) => ({ w, r, rir, warm: false, drop: false })) }] });
      s.routines[0].days[0].items = []; s.sessions = [ses('a', '2026-10-01', [[120, 3, 0]]), ses('b', '2026-10-08', [[90, 8, 1], [90, 8, 1]])];
      s.draft = null; L.state = L.normalize(s); L.invalidate();
      const one = (w, r, rir) => {
        const live = L.livePR('bench', { w, r, rir, done: true }, '2026-10-15');
        const st = L.normalize(JSON.parse(JSON.stringify(L.state))); st.sessions.push(ses('x', '2026-10-15', [[w, r, rir]]));
        const was = L.state; L.state = L.normalize(st); L.invalidate();
        const listed = L.IDX().prs.filter(p => p.sid === 'x' && p.big).map(p => p.type); L.state = was; L.invalidate();
        return { live, listed };
      };
      return { band: one(92.5, 8, 1), stronger: one(110, 8, 1) };
    });
    ok(pr.band.live === null && !pr.band.listed.length, '8. 92.5 x 8 after 120 x 3 to failure and 90 x 8: a best for 6 to 10 reps, weaker than 120 x 3, is neither announced nor listed (r57 announced it)', pr.band);
    ok(!!pr.stronger.live && pr.stronger.listed.length === 1, '8. 110 x 8, stronger than every earlier set, is announced and listed alike (a guard)', pr.stronger);
    await Q.page.context().close();
  }

  // ---- 9. 339 (e): a muscle has a default weekly target when lifters train it directly for size; any
  // other is tracked only until the lifter gives it a target (Set a target, a focus, or one typed before
  // r58 on a muscle that counted it then), which then counts everywhere a target counts.
  if (run(9)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const q = (f, a) => Q.page.evaluate(f, a);
    await q(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = []; L.saveNow(); });
    // How Stats' Recent average and Plan's Weekly volume show a muscle, the map's count, and the muscle's status.
    const look = m => q(async m => {
      const L = window.__ironlog; const row = sel => { const r = [...document.querySelectorAll(sel + ' .mrow')].find(e => e.children[1] && e.children[1].textContent === L.ML[m]); return r ? r.querySelector('.r').textContent : null; };
      L.ui.tab = 'dash'; L.ui.volMode = 'avg'; L.render(); await new Promise(r => setTimeout(r, 100)); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const stats = row('#view [data-mkey="volume"]');
      L.ui.tab = 'program'; L.ui.planView = 'routine'; L.render(); await new Promise(r => setTimeout(r, 100)); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const plan = row('#view [data-mkey="pvol"]');
      L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 100));
      const map = (document.querySelector('#view [data-mkey="map"] .sec-s') || {}).textContent || '';
      return { stats, plan, map, st: L.muscleStatus(L.actualAvg4())[m].st };
    }, m);
    const traps = await look('traps'), chest = await look('chest');
    ok(/tracked$/.test(traps.stats || '') && /tracked$/.test(traps.plan || '') && traps.st === 'track', '9. traps, given no target, is tracked only on Stats and Plan, with no target', traps);
    ok(/\/10-20$/.test(chest.stats || '') && chest.st !== 'track', '9. chest keeps its default target, 10 to 20', chest);
    ok(/of 12 on target/.test(traps.map), '9. the muscle map counts the 12 muscles with a target', traps.map);
    // A target typed before r58 for traps counts as it did on r57; one typed for serratus does not, as r57
    // never counted one on the four tracked since r29 (a log from before r29 can hold their old numbers),
    // until Set a target gives it one, with those numbers.
    await q(() => { const L = window.__ironlog; L.state.settings.bands.traps = [8, 14]; L.state.settings.bands.serratus = [3, 6]; L.saveNow(); L.invalidate(); });
    const tt = await look('traps'), ts = await look('serratus');
    ok(/\/8-14$/.test(tt.stats || '') && /\/8-14$/.test(tt.plan || '') && tt.st !== 'track' && /tracked$/.test(ts.stats || '') && ts.st === 'track' && /of 13 on target/.test(ts.map),
      '9. a target typed for traps (8 to 14) counts on Stats, Plan and the map; one typed for serratus before r58, which r57 never counted, does not', { tt, ts });
    await q(() => { const L = window.__ironlog; L.state.settings.ownTargets = ['serratus']; L.saveNow(); L.invalidate(); });
    const ts2 = await look('serratus');
    ok(/\/3-6$/.test(ts2.stats || '') && ts2.st !== 'track' && /of 14 on target/.test(ts2.map), '9. given a target (Set a target), serratus counts with the numbers it had, 3 to 6', ts2);
    await q(() => { const L = window.__ironlog; delete L.state.settings.ownTargets; L.saveNow(); L.invalidate(); });
    // Settings: a muscle with no target offers Set a target; with it set, the boxes and Track only.
    const ui1 = await q(async () => {
      const L = window.__ironlog; L.state.settings.bands.traps = L.appBand('traps'); L.state.settings.bands.serratus = L.appBand('serratus'); L.saveNow(); L.invalidate();
      L.ui.tab = 'settings'; L.render(); await new Promise(r => setTimeout(r, 100)); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const rowOf = m => [...document.querySelectorAll('#view [data-sk="settings:bands"] tr')].find(tr => tr.firstElementChild && tr.firstElementChild.textContent.startsWith(L.ML[m]));
      const r0 = rowOf('forearms'), c0 = rowOf('chest');
      const out = { offer: !!(r0 && r0.querySelector('[data-act="tgtSet"]')), boxes: !!(r0 && r0.querySelector('input[data-band]')), chestOffer: !!(c0 && c0.querySelector('[data-act="tgtSet"],[data-act="tgtOff"]')), chestBoxes: !!(c0 && c0.querySelector('input[data-band]')) };
      const b0 = r0 && r0.querySelector('[data-act="tgtSet"]'); if (!b0) return out;
      b0.click(); await new Promise(r => setTimeout(r, 200));
      const r1 = rowOf('forearms');
      out.after = { boxes: r1.querySelectorAll('input[data-band]').length, off: !!r1.querySelector('[data-act="tgtOff"]'), own: (L.state.settings.ownTargets || []).slice(), saved: (JSON.parse(localStorage.getItem(L.KEY)).settings.ownTargets || []).slice(), st: L.muscleStatus({ forearms: 0 })['forearms'].st };
      const box = r1.querySelector('input[data-band][data-bi="0"]'); box.value = '9'; box.dispatchEvent(new Event('input', { bubbles: true })); box.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      out.typed = L.state.settings.bands.forearms.slice();
      const u0 = L.undoStack.length;
      rowOf('forearms').querySelector('[data-act="tgtOff"]').click(); await new Promise(r => setTimeout(r, 300));
      out.off = { own: L.state.settings.ownTargets || null, band: L.state.settings.bands.forearms.slice(), app: L.appBand('forearms'), undo: L.undoStack.length - u0, offer: !!rowOf('forearms').querySelector('[data-act="tgtSet"]') };
      return out;
    });
    ok(ui1.offer && !ui1.boxes && !ui1.chestOffer && ui1.chestBoxes, '9. Weekly set targets: forearms, with no target, offers Set a target and no boxes; chest has its boxes and no such choice', ui1);
    ok(!!ui1.after && ui1.after.boxes === 2 && ui1.after.off && ui1.after.own.join() === 'forearms' && ui1.after.saved.join() === 'forearms' && ui1.after.st === 'under', '9. Set a target gives forearms its boxes, at once, saved, and its target counts (no sets reads under it)', ui1.after);
    ok(!!ui1.off && ui1.typed[0] === 9 && ui1.off.own == null && ui1.off.band.join() === ui1.off.app.join() && ui1.off.undo === 1 && ui1.off.offer, '9. Track only takes the target off (back to the app\'s numbers, the setting gone), with an Undo step', ui1);
    // Default targets takes every target the lifter gave back off, with an Undo step.
    const def = await q(async () => {
      const L = window.__ironlog; L.state.settings.ownTargets = ['forearms', 'neck']; L.saveNow(); L.invalidate();
      L.ui.tab = 'settings'; L.render(); await new Promise(r => setTimeout(r, 100)); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const bd = document.querySelector('#view [data-act="bandsDefault"]'); if (bd.disabled) return { disabled: true };
      bd.click(); await new Promise(r => setTimeout(r, 300));
      const after = L.state.settings.ownTargets || null; L.ACT.undo(); await new Promise(r => setTimeout(r, 300));
      return { after, back: (L.state.settings.ownTargets || []).join() };
    });
    ok(def.after == null && def.back === 'forearms,neck', '9. Default targets takes the targets given back off, and Undo puts them back', def);
    // The muscle map's legend says what Tracked only means for every such muscle, not only the four tracked since r29 (the review of r58).
    const tip = await q(async () => {
      const L = window.__ironlog; L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 150));
      const i = document.querySelector('#view .bm-legend .st-track'); return i && i.parentElement.dataset.tip;
    });
    ok(tip === 'Counted, with no weekly target, so never called under or over. Give one a target in Settings, Weekly set targets.', '9. the map\'s Tracked only tip covers every muscle with no target and says how to give one', tip);
    ok(!Q.errors.length, '9. no page errors', Q.errors);
    await Q.page.context().close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
