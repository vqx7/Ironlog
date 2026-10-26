// r62: the sheets and the exercise picker moved into typed modules (PENDING
// 355; ARCHITECTURE.md, What is left). Run on r61 (`node tests/r62.js
// baselines/r61.html`, R62_ONLY=n for one section):
//   1  (a guard, the source build) every sheet, opened as the app opens it,
//      in the states a lifter meets it in, has the same elements,
//      attributes, field values and visible text as r61's
//      (baselines/r61.html), in light and dark, pounds and kilograms.
//   2  (a guard, the source build) Pick for me, Swap's closest matches,
//      Limited equipment and Short on time, moved from the legacy script
//      into src/app/pick.ts as functions of the model, give r61's answers
//      on N wide histories (R62_N, 1,000 by default): the cycle, a day's
//      sets, each muscle's week and recovery, the days ranked and why, the
//      session's sets, the exercises ranked to add, the swaps, a day under
//      three sets of equipment, the trim to four budgets, and the Pick for
//      me sheets' words, call for call.
//   3  a ticked set's load cleared (V on r61's preview, 2026-10-26: set 2
//      ticked on its grey 225, its load then cleared, stayed ticked with no
//      weight, and the recap read it as 0 x 8): the set is unticked, as a
//      ticked set's reps cleared already untick it; ticked again it takes
//      the grey load; Finish saves 225 x 8 on every set and the recap has
//      no 0. A bodyweight lift's added load cleared keeps its tick (its load
//      may be none). Fails on r61.
const { engine, screenOf, screenDiff, open } = require('./h');
const { wide, specOf } = require('./wide');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r61.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const ONLY = process.env.R62_ONLY ? process.env.R62_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const N = +process.env.R62_N || 1000;

// The starter routine's ids are made at random, so both builds are given the same ones (as tests/r60.js does).
const FIX = "const m={};L.state.routines.forEach((r,i)=>{m[r.id]='R'+i;r.id='R'+i;});L.state.activeRoutineId=m[L.state.activeRoutineId]||L.state.activeRoutineId;L.state.sessions.forEach(s=>{if(m[s.routineId])s.routineId=m[s.routineId];});L.saveNow();";
const DEMO = 'L.state.settings.onboarded=true;L.makeDemo();' + FIX;
const KG = "L.state.settings.unit='kg';L.saveNow();";
const DARK = "L.state.settings.theme='dark';L.saveNow();";
const ACTIVE = 'const R=L.state.routines.find(r=>r.id===L.state.activeRoutineId);';
const DAY = ACTIVE + 'const di=String(R.days.findIndex(x=>!x.rest&&x.items.length));';
const START = DAY + "L.ui.tab='today';L.ACT.startSession({dataset:{day:di}});";
const TAP = (act, ds) => `L.ACT.${act}({dataset:${JSON.stringify(ds)}});`;
const OPEN = o => `L.openModal(${JSON.stringify(o)});`;
const SAVED = "const sv=[...L.state.sessions].sort((a,b)=>a.date<b.date?1:-1)[0];";
// [name, the log and tab, the taps that open the sheet, what the sheet must show]
const SHEETS = [
  ['the menu', DEMO, OPEN({ kind: 'menu' }), /Your data and backups/],
  ['the Guide, closed', DEMO, OPEN({ kind: 'guide', open: '' }), /How this works|Guide/i],
  ['the Guide, a topic open', DEMO + KG, OPEN({ kind: 'guide', open: 'rules' }), /A target is not a record/],
  ['the calendar', DEMO, OPEN({ kind: 'calendar', ym: '2026-10' }), /October|2026/],
  ['a rest week', DEMO, TAP('restWkOpen', {}) + OPEN({ kind: 'restwk' }), /Rest week/],
  ['a day with two sessions', DEMO + SAVED + "{const c=JSON.parse(JSON.stringify(sv));c.id='two';c.t=(sv.t||0)+3600e3;L.state.sessions.push(c);L.state=L.normalize(L.state);L.invalidate();L.saveNow();}", SAVED + "L.openModal({kind:'daypick',date:sv.date});", /2 sessions/],
  ['a question', DEMO, "L.openModal({kind:'confirm',title:'Delete this?',body:'It goes to Recently deleted.',okLabel:'Delete',fn:()=>{},danger:true});", /Delete this\?/],
  ['a question with a second choice', DEMO, "L.openModal({kind:'confirm',title:'Save the sets?',body:'Two are not ticked.',okLabel:'Save',fn:()=>{},alt:{label:'Discard',fn:()=>{}}});", /Discard/],
  ['a question with a quiet choice', DEMO, "L.openModal({kind:'confirm',title:'Keep it?',body:'Body.',okLabel:'Keep',fn:()=>{},alt:{label:'Not now',quiet:true,fn:()=>{}}});", /Not now/],
  ['the picker, add to a session', DEMO + START, OPEN({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' }), /Pick for me/],
  ['the picker, searched', DEMO + START, OPEN({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: 'press', m: '' }), /Press/],
  ['the picker, one muscle', DEMO + START, OPEN({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: 'biceps' }), /Curl/],
  ['the picker, swap in a session', DEMO + START, TAP('bMenuDo', { op: 'bSwap', b: '0' }), /Swap exercise/],
  ['the picker, add to a day', DEMO, "L.ui.tab='program';L.render();" + ACTIVE + "L.openModal({kind:'picker',mode:'addDay',day:0,title:'Add to day 1',q:'',m:''});", /New exercise/],
  ['a new exercise', DEMO, TAP('exNew', {}), /New exercise/],
  ['an exercise edited, more options open', DEMO, "L.openModal({kind:'exEdit',isNew:false,e:{...L.EX('bench'),incRaw:'',maxRaw:'',barRaw:'',bwfRaw:''}});", /Edit exercise/],
  ['a bodyweight exercise edited', DEMO, "L.openModal({kind:'exEdit',isNew:false,e:{...L.EX('pullup'),incRaw:'',maxRaw:'',barRaw:'',bwfRaw:''}});", /Share of bodyweight/],
  ['an exercise\'s history', DEMO, OPEN({ kind: 'exhist', exId: 'bench' }), /Bench/],
  ['the exercise menu in a session', DEMO + START, TAP('bMenu', { b: '0' }), /New machine or gym/],
  ['the exercise menu, the lift marked new', DEMO + START + TAP('bNew', { b: '0' }), TAP('bMenu', { b: '0' }), /Same machine as before/],
  ['flag an injury', DEMO, OPEN({ kind: 'injury' }), /Flag an injury/],
  ['the recap after Finish', DEMO + START + "{const b=L.state.draft.ex[0];b.sets.forEach(x=>{x.r=8;x.done=true;if(x.w==null)x.w=b.sw||40;});L.state.draft._rampAsked=true;L.state.draft._leftAsked=true;}", 'L.ACT.finishNow();await new Promise(r=>setTimeout(r,300));', /working sets/],
  ['import, the text step', DEMO, OPEN({ kind: 'imp', step: 'input', text: '', err: '' }), /Import/],
  ['the routine templates', DEMO, OPEN({ kind: 'templates', from: 'plan' }), /Pick a routine/],
  ['the routine templates on a first run', 'L.saveNow();', OPEN({ kind: 'templates', from: 'welcome' }), /Your training/],
  ['the routine templates after an import', 'L.saveNow();', OPEN({ kind: 'templates', from: 'welcome', imported: true }), /Your workouts are in/],
  ['a new routine', DEMO, OPEN({ kind: 'routineNew' }), /New routine/],
  ['the muscles of a lift, flat', DEMO, OPEN({ kind: 'exMus', exId: 'bench' }), /Muscles: /],
  ['a lift goal, none set', DEMO, OPEN({ kind: 'goal', exId: 'bench' }), /Goal: /],
  ['a lift goal, set', DEMO + "{const e=L.state.exercises.find(x=>x.id==='bench');e.goal={w:120,r:5};L.saveNow();}", OPEN({ kind: 'goal', exId: 'bench' }), /Remove goal/],
  ['a load step', DEMO + START, TAP('bMenuDo', { op: 'bInc', b: '0' }), /Load step/],
  ['log cardio', DEMO, OPEN({ kind: 'cardio' }), /Log cardio/],
  ['log cardio in kg', DEMO + KG, OPEN({ kind: 'cardio' }), /km|Distance/],
  ['type or dictate sets', DEMO + START, TAP('bMenuDo', { op: 'bQuick', b: '0' }), /type sets/],
  ['type sets in kg with RPE', DEMO + KG + "L.state.settings.rirScale='rpe';L.saveNow();" + START, TAP('bMenuDo', { op: 'bQuick', b: '0' }), /rpe/],
  ['heaviest available', DEMO + START, TAP('bMenuDo', { op: 'bMax', b: '0' }), /Heaviest available/],
  ['a calibration set', DEMO + START, TAP('bMenuDo', { op: 'bCal', b: '0' }), /Calibration set/],
  ['short on time', DEMO + START, TAP('shortOpen', {}), /Short on time/],
  ['short on time, 30 minutes picked', DEMO + START, TAP('shortOpen', {}) + TAP('shortPick', { v: '30' }), /Short on time/],
  ['a note on a lift', DEMO + START, TAP('bMenuDo', { op: 'bNote', b: '0' }), /Note: /],
  ['pick for me, today', DEMO, OPEN({ kind: 'pickToday' }), /Pick for me/],
  ['pick for me, in a session', DEMO + START, OPEN({ kind: 'pickEx' }), /Pick for me|Add/],
  ['the backup text', DEMO, "L.openModal({kind:'text',title:'Backup text',help:'Select all and copy.',text:'{\"a\":1}',readonly:true});", /Backup text/],
  ['install', DEMO, OPEN({ kind: 'install', how: 'menu' }), /Install|home screen/i],
  ['the app icon', DEMO, OPEN({ kind: 'icon' }), /icon/i],
  ['a past workout', DEMO, TAP('pastOpen', { date: '2026-10-20' }), /Log a past workout/],
  ['report a problem', DEMO, TAP('fbOpen', {}), /Report|problem/i],
  ['sign in', DEMO, "L.openModal({kind:'account',mode:'signin',email:'',pw:''});", /Sign in/],
  ['the menu, dark', DEMO + DARK, OPEN({ kind: 'menu' }), /Your data and backups/],
  // r62's second pass: the lift sheets in the states their actions leave them in.
  ['typed sets not read', DEMO + START, TAP('bMenuDo', { op: 'bQuick', b: '0' }) + "document.querySelector('#qTxt').value='zz';L.ACT.qFill();", /Could not read that/],
  ['typed sets, nothing typed', DEMO + START, TAP('bMenuDo', { op: 'bQuick', b: '0' }) + 'L.ACT.qFill();', /Type at least one set/],
  ['typed sets for a timed hold', DEMO + START + "{const b=L.state.draft.ex[0];b.exId='plank';}", OPEN({ kind: 'quick', b: 0, text: '' }), /Timed hold/],
  ['typed sets for a bodyweight lift', DEMO + START + "{const b=L.state.draft.ex[0];b.exId='pullup';}", OPEN({ kind: 'quick', b: 0, text: '' }), /added to bodyweight/],
  ['a calibration set not filled in', DEMO + START, TAP('bMenuDo', { op: 'bCal', b: '0' }) + "document.querySelector('#calPred').value='3';L.ACT.calSave();", /Calibration set/],
  ['a load step following the dumbbell rack', DEMO + "L.state.settings.gym={u:'lb',db:{lo:5,hi:100,st:5,fine:2.5,fineTo:25}};L.state=L.normalize(L.state);L.invalidate();delete L.EX('dbLateral').inc;L.saveNow();", OPEN({ kind: 'inc', exId: 'dbLateral' }), /Following the dumbbells/],
  ['a bodyweight lift\'s goal', DEMO, OPEN({ kind: 'goal', exId: 'pullup' }), /Added load/],
  ['the heaviest load of a bodyweight lift', DEMO, OPEN({ kind: 'max', exId: 'pullup' }), /added to bodyweight/],
  ['a note with text', DEMO + START, "L.openModal({kind:'note',bi:0,title:'Note: Bench',text:'Left shoulder <tight> & sore'});", /Note: Bench/],
  ['one lift\'s goal opened over another\'s, typed in', DEMO, OPEN({ kind: 'goal', exId: 'bench' }) + "document.querySelector('#goalW').value='999';" + OPEN({ kind: 'goal', exId: 'backSquat' }), /Goal: (?!Deleted)/],
  // The plan sheets' states.
  ['the routine templates on a first run, Your training open', "L.state.settings.profile={goal:'size',days:4};L.saveNow();L.ui.obProf=true;", OPEN({ kind: 'templates', from: 'welcome' }), /Fits your days/],
  ['the routine templates, three days a week', DEMO + "L.state.settings.profile={days:3};L.saveNow();", OPEN({ kind: 'templates', from: 'plan' }), /Fits your days/],
  ['the recap with PRs and an update offer', DEMO, "L.openModal({kind:'recap',title:'Session saved',lines:['5 exercises, 18 working sets','Bench <b> & co'],prs:[{name:'Barbell Bench Press',what:'Rep PR, 185 x 9',was:'was 8 reps'},{name:'Back Squat',what:'Heaviest yet',was:''}],note:'',upd:{dayName:'Push',text:'Add Cable Fly'},sid:'x'});", /2 new PRs[\s\S]*Update Push/i],
  ['the recap with one PR', DEMO, "L.openModal({kind:'recap',title:'Session saved',lines:['1 exercise'],prs:[{name:'Bench',what:'Rep PR',was:'was 8'}],note:'',upd:null,sid:'x'});", /New PR/i],
  // The exercise sheets' states.
  ['a new exercise from the picker in a session', DEMO + START, OPEN({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' }) + "L.ACT.exNewFromPicker({dataset:{}});", /Create and add to session/],
  ['an exercise edited, shown on the body', DEMO + 'L.ui.exBody=true;', "L.openModal({kind:'exEdit',isNew:false,e:{...L.EX('bench'),incRaw:'',maxRaw:'',barRaw:'',bwfRaw:''}});", /Hide body/],
  ['a custom exercise edited', DEMO, "L.openModal({kind:'exEdit',isNew:false,e:{...L.EX('bench'),custom:true,incRaw:'2.5',maxRaw:'300',barRaw:'',bwfRaw:'',note:'Pause <1s> & go'}});", /Edit exercise/],
  ['an exercise edited: renamed, then made bodyweight', DEMO, "L.openModal({kind:'exEdit',isNew:false,e:{...L.EX('bench'),incRaw:'',maxRaw:'',barRaw:'',bwfRaw:''}});" + "{const n=document.querySelector('[data-ebind=\"name\"]');n.value='My bench';n.dispatchEvent(new Event('input',{bubbles:true}));const c=document.querySelector('[data-ebind=\"bw\"]');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));}", /Share of bodyweight/],
  ['an exercise edited: a helper muscle added, the primary changed', DEMO, "L.openModal({kind:'exEdit',isNew:false,e:{...L.EX('bench'),incRaw:'',maxRaw:'',barRaw:'',bwfRaw:''}});" + "L.ACT.secToggle({dataset:{m:'biceps'}});{const p=document.querySelector('[data-ebind=\"primary\"]');p.value='shoulders';p.dispatchEvent(new Event('change',{bubbles:true}));}", /Helper muscles/],
  ['a new exercise with no muscle picked', DEMO, "L.openModal({kind:'exEdit',isNew:true,e:{id:'',name:'',primary:'',secondary:[],equip:'machine',bw:false,rare:false,perSide:false,note:'',custom:true,archived:false,incRaw:'',maxRaw:'',barRaw:'',bwfRaw:''}});", /Pick one/],
  ['the muscles of a lift in 3D', DEMO + "L.ACT.mapView({dataset:{v:'3d'}});", OPEN({ kind: 'exMus', exId: 'bench' }), /Muscles: /],
  // The choosing sheets' states.
  ['Limited equipment, all on', DEMO, "L.ACT.eqOpen({dataset:{day:String(L.state.routines.find(r=>r.id===L.state.activeRoutineId).days.findIndex(x=>!x.rest&&x.items.length))}});", /Limited equipment/],
  ['Limited equipment, bodyweight only', DEMO, "L.ACT.eqOpen({dataset:{day:String(L.state.routines.find(r=>r.id===L.state.activeRoutineId).days.findIndex(x=>!x.rest&&x.items.length))}});['barbell','dumbbell','machine','cable','smith','kettlebell','band','landmine','other'].forEach(k=>{const b=document.querySelector('#modal [data-act=\"eqToggle\"][data-k=\"'+k+'\"]');if(b&&b.getAttribute('aria-pressed')==='true')b.click();});", /Limited equipment/],
  ['short on time, 15 minutes picked', DEMO + START, TAP('shortOpen', {}) + TAP('shortPick', { v: '15' }), /Short on time/],
  ['pick for me, in a deload week', DEMO + "L.state.deloadWeek=(()=>{const d=new Date();const g=(d.getDay()+6)%7;d.setDate(d.getDate()-g);return d.toISOString().slice(0,10);})();L.invalidate();L.saveNow();", OPEN({ kind: 'pickToday' }), /Pick for me/],
  ['the picker, swap in a session, one muscle', DEMO + START, TAP('bMenuDo', { op: 'bSwap', b: '0' }) + "{const sel=document.querySelector('#modal select[data-mbind=\"m\"]');sel.value=L.EX(L.state.draft.ex[0].exId).primary;sel.dispatchEvent(new Event('input',{bubbles:true}));}", /Swap exercise/],
  ['the picker, a search typed', DEMO + START, OPEN({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' }) + "{const q=document.querySelector('#pickQ');q.value='row';q.dispatchEvent(new Event('input',{bubbles:true}));}", /Row/],
  // The app's own sheets: install in each browser's steps, and a past workout on a day already logged.
  ['install, Safari 26', DEMO, OPEN({ kind: 'install', how: 'ios-safari26' }), /Add to Home Screen/],
  ['install, older Safari', DEMO, OPEN({ kind: 'install', how: 'ios-safari' }), /Add to Home Screen/],
  ['install, Chrome on an iPhone', DEMO, OPEN({ kind: 'install', how: 'ios-chrome' }), /Add to Home Screen/],
  ['install, another iPhone browser', DEMO, OPEN({ kind: 'install', how: 'ios-other' }), /in Safari/],
  ['a past workout on a day logged', DEMO + SAVED, SAVED + "L.ACT.pastOpen({dataset:{date:sv.date}});", /Already logged that day/],
  ['the exercise menu of the last lift', DEMO + START, "L.ACT.bMenu({dataset:{b:String(L.state.draft.ex.length-1)}});", /Remove from session/]
];

(async () => {
  const browser = await engine.launch();

  // ---- 1. Every sheet against r61's (both pages built from src/).
  // The page's own address shows in a sheet (Install, the app icon): each build's file, read as one.
  const page = t => t.replace(/Open \S+ in Safari/g, 'Open PAGE in Safari');
  const flat = s => ({ ...s, tree: s.tree.map(page), text: page(s.text).replace(/\s+/g, ' ') });
  const textDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return { at: i, r61: a.slice(Math.max(0, i - 80), i + 160), now: b.slice(Math.max(0, i - 80), i + 160) }; };
  if (!run(1));
  else if (process.env.IRONLOG_FILE) console.log('note r62 section 1 compares source pages; it runs on the source build');
  else for (const [name, seed, prep, want] of SHEETS) {
    const o = { browser, seed, tab: 'today', prep, root: 'modal', spaces: true };
    const a = flat(await screenOf(OLD, o)), b0 = await screenOf(FILE, o), b = flat(b0);
    const d = screenDiff({ tree: a.tree, text: '' }, { tree: b.tree, text: '' });
    ok(!d, `1. ${name}: the same elements, attributes and field values as r61`, d && { at: d.at, r61: d.before, now: d.now });
    ok(a.text === b.text, `1. ${name}: the same visible text as r61`, a.text === b.text ? '' : textDiff(a.text, b.text));
    ok(!b0.errors.length, `1. ${name}: no page errors`, b0.errors);
    // The case is the sheet it names (a prep that missed it would compare two empty sheets).
    ok(want.test(b.text), `1. ${name}: the sheet is open and in that state`, b.text.slice(0, 160));
    // and of a lift in the log (an id not in it reads as a deleted exercise in both builds alike).
    ok(!/Deleted exercise/.test(b.text), `1. ${name}: of a lift in the log`, b.text.slice(0, 160));
  }

  // ---- 2. The ranking and the trim, moved into pick.ts, against r61's, call for call.
  if (run(2) && !process.env.IRONLOG_FILE) {
    const digest = spec => {
      const L = window.__ironlog;
      const ser = new Function(`return (${spec.ser})`)(), err = new Function(`return (${spec.err})`)();
      const out = [];
      const call = (name, ...args) => { let r; try { r = L[name](...args); } catch (e) { r = err(e); } out.push(name + '\t' + ser(args) + '\t' + ser(r)); return r; };
      const raw = JSON.parse(spec.raw);
      const week = (() => { const d = new Date(); const g = (d.getDay() + 6) % 7; d.setDate(d.getDate() - g); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
      if (Array.isArray(raw.settings.restWeeks)) raw.settings.restWeeks = raw.settings.restWeeks.map(w => (w === 'THIS_WEEK' ? week : w));
      if (raw.deloadWeek === 'THIS_WEEK') raw.deloadWeek = week;
      L.state = L.normalize(raw); L.invalidate();
      const s = L.state;
      const dates = s.sessions.map(x => x.date).sort();
      const mid = dates.length ? dates[Math.floor(dates.length / 2)] : spec.today;
      const MK = Object.keys(s.settings.bands);
      const R = L.activeRoutine();
      for (const r of s.routines) { call('cycleState', r); call('cycleState', r, mid); }
      for (const d of R.days) call('sessionMuscleSets', d);
      for (const m of MK) { call('rolling7', m); call('rolling7', m, { [m]: 3 }, mid); call('recovery', m); call('recovery', m, mid); }
      const rk = call('rankDays');
      for (const row of rk.rows) call('dayReasons', row, rk.r7);
      const EQS = [['barbell', 'dumbbell', 'bodyweight'], ['bodyweight'], ['machine', 'cable', 'smith']];
      for (const id of spec.ids) { call('swapCands', id); call('swapCands', id, new Set(EQS[0]), new Set(spec.ids.slice(0, 2)), 8); }
      for (const d of R.days) for (const eq of EQS) call('eqPlan', d, new Set(eq));
      // A session on each training day (and one with none), some sets done, on the day itself and on a past one, full, deload and lighter.
      const days = R.days.map((d, i) => [d, i]).filter(([d]) => !d.rest && d.items.length).slice(0, 3);
      const drafts = [];
      for (const [d, i] of days) {
        const ex = d.items.map((it, bi) => ({ exId: it.exId, plan: { sets: +it.sets || 1, rest: +it.rest || 0, ss: it.ss || null, repMin: it.repMin, repMax: it.repMax, rir: it.rir, inc: it.inc }, sets: Array.from({ length: +it.sets || 1 }, (_, k) => { const on = k < bi % 3; return { w: on ? 50 + bi : null, r: on ? 8 - k : null, rir: on ? k % 3 : null, done: on, warm: false, drop: false }; }) }));
        drafts.push({ id: 'd' + i, date: spec.today, dayIdx: i, dayId: d.id, routineId: R.id, ex });
        drafts.push({ id: 'p' + i, date: mid, dayIdx: i, dayId: d.id, routineId: R.id, ex, deload: i % 2 === 0, light: i % 2 === 1 });
      }
      drafts.push({ id: 'f', date: spec.today, dayIdx: -1, dayId: null, routineId: R.id, ex: [] });
      const sheet = () => { const t = document.getElementById('modal').innerText; L.ACT.mClose(); return t.replace(/\s+/g, ' '); };
      for (const d of drafts) {
        call('sessionMuscles', d);
        call('rankExercises', d);
        for (const mins of [15, 30, 45, 75]) call('shortPlan', d, mins);
        L.state.draft = JSON.parse(JSON.stringify(d)); L.invalidate();
        L.openModal({ kind: 'pickEx' }); out.push('pickEx sheet\t' + sheet());
        L.openModal({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' }); out.push('picker sheet\t' + sheet());
        L.state.draft = null; L.invalidate();
      }
      // Strength as the goal, with priorities: the strength focus and the priority muscles in the ranking.
      s.settings.profile = { ...(s.settings.profile || {}), goal: 'strength' }; s.settings.priorities = MK.slice(0, 2); L.invalidate();
      for (const d of drafts) call('rankExercises', d);
      L.openModal({ kind: 'pickToday' }); out.push('pickToday sheet\t' + sheet());
      return out.join('\n');
    };
    const T0 = new Date('2026-10-11T12:00:00');
    const setup = async (ctx, page) => { await page.clock.setFixedTime(T0); };
    const A = await open(OLD, { browser, setup });
    const B = await open(FILE, { browser, setup });
    const LIB = await B.page.evaluate(() => window.__ironlog.libExercises());
    let same = 0, first = null, calls = 0;
    const t0 = Date.now();
    for (let i = 0; i < N; i++) {
      const h = wide(62000 + i, LIB);
      const when = new Date(h.today + 'T12:00:00');
      await Promise.all([A.page.clock.setFixedTime(when), B.page.clock.setFixedTime(when)]);
      const spec = specOf(h);
      const [a, b] = await Promise.all([A.page.evaluate(digest, spec), B.page.evaluate(digest, spec)]);
      calls += b.split('\n').length;
      if (a === b) same++;
      else if (!first) { const la = a.split('\n'), lb = b.split('\n'); let k = 0; while (k < la.length && la[k] === lb[k]) k++; first = { seed: 62000 + i, line: k, r61: (la[k] || '').slice(0, 900), now: (lb[k] || '').slice(0, 900) }; }
    }
    ok(same === N, `2. Pick for me, the swaps, Limited equipment and Short on time give r61's answers on all ${N} wide histories (${same} identical, ${calls} calls and sheets, ${Math.round((Date.now() - t0) / 1000)} s)`, first);
    ok(!A.errors.length && !B.errors.length, '2. no page errors', { r61: A.errors.slice(0, 3), now: B.errors.slice(0, 3) });
    await A.ctx.close(); await B.ctx.close();
  }

  // ---- 3. A ticked set's load cleared is unticked (V on r61's preview, 2026-10-26).
  if (run(3)) {
    const P = await open(FILE, { browser, setup: async (ctx, page) => { await page.clock.setFixedTime(new Date('2026-10-26T10:00:00')); } });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a); const wait = ms => new Promise(r => setTimeout(r, ms));
    await ev(() => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false;
      S.routines = [{ id: 'R1', name: 'Mine', schedule: 'weekly', days: [0, 1, 2, 3, 4, 5, 6].map(i => ({ id: 'D' + i, name: 'Push', rest: false, items: [{ uid: 'u' + i, exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 150, inc: 2.5, ss: null }, { uid: 'p' + i, exId: 'pullup', sets: 1, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 2.5, ss: null }] })) }];
      S.activeRoutineId = 'R1'; S.sessions = []; L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); });
    await wait(200);
    await page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(300);
    const q = (f, b, s) => `#view [data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
    const type = async (f, b, s, v) => { await page.click(q(f, b, s)); await page.keyboard.press('Control+A'); await page.keyboard.type(String(v)); await ev(() => document.activeElement && document.activeElement.blur()); await wait(150); };
    const clear = async (f, b, s) => { await page.click(q(f, b, s)); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await ev(() => document.activeElement && document.activeElement.blur()); await wait(200); };
    const tick = async (b, s) => { await page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`); await wait(200); };
    const sets = b => ev(b => window.__ironlog.state.draft.ex[b].sets.map(x => ({ lb: x.w == null ? null : Math.round(x.w / 0.45359237), r: x.r, done: !!x.done })), b);
    await type('w', 0, 0, 225); await type('r', 0, 0, 8); await tick(0, 0);
    await type('r', 0, 1, 8); await tick(0, 1);
    const before = await sets(0);
    ok(before[1].done && before[1].lb === 225, '3. set 2 ticked on its grey 225 is 225 x 8', before);
    await clear('w', 0, 1);
    const after = await sets(0);
    ok(!after[1].done && after[1].lb == null && after[1].r === 8, '3. its load cleared, set 2 is unticked, its reps kept (r61 kept it ticked with no weight)', after);
    const grey = await ev(s => document.querySelector(s).placeholder, q('w', 0, 1));
    ok(grey === '225', '3. the row shows the grey 225 again', grey);
    await tick(0, 1);
    const again = await sets(0);
    ok(again[1].done && again[1].lb === 225, '3. ticked again, it takes the grey 225', again);
    await type('w', 0, 2, 225); await type('r', 0, 2, 5); await tick(0, 2);
    // A bodyweight lift's added load: cleared, the set keeps its tick (none added is a load it may have).
    await type('w', 1, 0, 25); await type('r', 1, 0, 8); await tick(1, 0);
    await clear('w', 1, 0);
    const pu = await sets(1);
    ok(pu[0].done && pu[0].lb == null, '3. a pull-up\'s added load cleared keeps its tick', pu);
    await page.click('#view [data-act="finish"]');
    const asked = [];
    for (let k = 0; k < 6; k++) { await wait(150); const m = await ev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, title: m.title || '' } : null; }); if (!m || m.kind !== 'confirm') break; asked.push(m.title); await page.click('#modal [data-act="mAlt"]'); }
    await wait(250);
    const recap = await ev(() => (document.getElementById('modal').innerText || '').replace(/\s+/g, ' '));
    const saved = await ev(() => { const s = window.__ironlog.state.sessions.slice(-1)[0]; return s ? s.ex.map(b => ({ exId: b.exId, sets: b.sets.map(x => [x.w == null ? null : Math.round(x.w / 0.45359237), x.r]) })) : null; });
    const bench = saved && saved.find(b => b.exId === 'bench');
    ok(!asked.length && bench && JSON.stringify(bench.sets) === '[[225,8],[225,8],[225,5]]', '3. Finish asks nothing and saves the bench as 225 x 8, 225 x 8, 225 x 5', { asked, saved });
    ok(/Session saved/.test(recap) && !/\b0 ?[x×] ?\d/.test(recap), '3. the recap has no 0 x reps', recap.slice(0, 400));
    ok(!P.errors.length, '3. no page errors', P.errors);
    await P.ctx.close();
  }

  // ---- 4. A load typed into a set its cleared load unticked is ticked again (the independent review of r62).
  if (run(4)) {
    const ROUTINE = "S.routines=[{id:'R1',name:'Mine',schedule:'weekly',days:[0,1,2,3,4,5,6].map(i=>({id:'D'+i,name:'Push',rest:false,items:[{uid:'u'+i,exId:'bench',sets:3,repMin:6,repMax:10,rir:2,rest:150,inc:2.5,ss:null}]}))}];S.activeRoutineId='R1';";
    for (const mode of ['live', 'live, auto-mark', 'past', 'History edit']) {
      const P = await open(FILE, { browser, setup: async (ctx, page) => { await page.clock.setFixedTime(new Date('2026-10-26T10:00:00')); } });
      const { page } = P; const ev = (f, a) => page.evaluate(f, a); const wait = ms => new Promise(r => setTimeout(r, ms));
      await ev(([mode, ROUTINE]) => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = mode === 'live, auto-mark'; S.settings.timerMode = 'auto';
        eval(ROUTINE); S.sessions = [];
        if (mode === 'History edit') S.sessions = [{ id: 'S1', date: '2026-10-24', routineId: 'R1', dayId: 'D5', dayIdx: 5, dayName: 'Push', ex: [{ exId: 'bench', sets: [[225, 8], [225, 8], [225, 6]].map(([w, r]) => ({ w: w * 0.45359237, r, rir: 2 })) }] }];
        L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = mode === 'History edit' ? 'history' : 'today'; L.render(); }, [mode, ROUTINE]);
      await wait(250);
      const q = (f, b, s) => `#view [data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
      const type = async (f, b, s, v) => { await page.click(q(f, b, s)); await page.keyboard.press('Control+A'); await page.keyboard.type(String(v)); await ev(() => document.activeElement && document.activeElement.blur()); await wait(200); };
      const clear = async (f, b, s) => { await page.click(q(f, b, s)); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await ev(() => document.activeElement && document.activeElement.blur()); await wait(200); };
      const tick = async (b, s) => { await page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`); await wait(200); };
      const set = k => ev(k => { const x = window.__ironlog.state.draft.ex[0].sets[k]; return { lb: x.w == null ? null : Math.round(x.w / 0.45359237), r: x.r, done: !!x.done }; }, k);
      const left = () => ev(() => { const t = window.__ironlog.timer; return t && t.end ? Math.round((t.end - Date.now()) / 1000) : null; });
      if (mode === 'History edit') {
        await ev(() => window.__ironlog.ACT.histEdit({ dataset: { id: 'S1' } })); await wait(300);
        if (await ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'confirm')) { await page.click('#modal [data-act="mOk"]'); await wait(300); }
      } else if (mode === 'past') {
        await ev(() => window.__ironlog.ACT.pastOpen({ dataset: { date: '2026-10-24' } })); await wait(250);
        await page.click('#modal [data-act="pastGo"]'); await wait(300);
        await type('w', 0, 0, 225); await type('r', 0, 0, 8);
      } else {
        await page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(300);
        await type('w', 0, 0, 225); await type('r', 0, 0, 8);
        if (!(await set(0)).done) await tick(0, 0);
        await type('r', 0, 1, 8); if (!(await set(1)).done) await tick(0, 1);
        await page.clock.setFixedTime(new Date('2026-10-26T10:01:40')); await wait(300);
      }
      const rest0 = mode.startsWith('live') ? await left() : null;
      await clear('w', 0, 0);
      const cleared = await set(0);
      await type('w', 0, 0, 230);
      const after = await set(0);
      ok(!cleared.done && after.done && after.lb === 230 && after.r === 8, `4. ${mode}: cleared it is unticked, and 230 typed ticks it again as 230 x 8`, { cleared, after });
      if (mode.startsWith('live')) { const rest1 = await left(); ok(rest0 != null && rest1 != null && Math.abs(rest1 - rest0) <= 2, `4. ${mode}: the rest under way goes on (${rest0} s left before, ${rest1} s after)`, { rest0, rest1 }); }
      if (mode === 'History edit' || mode === 'past') {
        await page.click('#view [data-act="finish"]');
        const asked = [];
        for (let k = 0; k < 6; k++) { await wait(200); const m = await ev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, title: m.title || '' } : null; }); if (!m || m.kind !== 'confirm') break; asked.push(m.title); await page.click('#modal [data-act="mAlt"]'); }
        await wait(300);
        const saved = await ev(() => { const s = [...window.__ironlog.state.sessions].sort((a, b) => a.date < b.date ? 1 : -1)[0]; return s ? s.ex[0].sets.map(x => [Math.round(x.w / 0.45359237), x.r]) : null; });
        const want = mode === 'past' ? [[230, 8]] : [[230, 8], [225, 8], [225, 6]];
        ok(!asked.length && JSON.stringify(saved) === JSON.stringify(want), `4. ${mode}: Finish asks nothing and saves ${JSON.stringify(want)}`, { asked, saved });
      }
      ok(!P.errors.length, `4. ${mode}: no page errors`, P.errors);
      await P.ctx.close();
    }
  }

  // ---- 5. A past workout's date refused goes back to the date in use (the independent review of r62).
  if (run(5)) {
    const P = await open(FILE, { browser, setup: async (ctx, page) => { await page.clock.setFixedTime(new Date('2026-10-26T10:00:00')); } });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a); const wait = ms => new Promise(r => setTimeout(r, ms));
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.ui.tab = 'history'; L.render(); });
    await wait(300);
    await ev(() => window.__ironlog.ACT.pastOpen({ dataset: {} })); await wait(300);
    const field = '#modal input[data-pbind="date"]';
    const read = () => ev(f => ({ field: document.querySelector(f).value, date: window.__ironlog.ui.modal && window.__ironlog.ui.modal.date }), field);
    await page.fill(field, '2026-10-20'); await wait(300);
    const a = await read();
    await page.fill(field, '2026-10-29'); await wait(300);
    const b = await read();
    ok(a.field === '2026-10-20' && a.date === '2026-10-20', '5. a past date picked is the one in use', a);
    ok(b.field === '2026-10-20' && b.date === '2026-10-20', '5. a future date is refused and the field goes back to 2026-10-20, the date in use', b);
    await page.click('#modal [data-act="pastGo"]'); await wait(400);
    const d = await ev(() => window.__ironlog.state.draft && window.__ironlog.state.draft.date);
    ok(d === '2026-10-20', '5. the workout is logged under the date shown', d);
    ok(!P.errors.length, '5. no page errors', P.errors);
    await P.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
