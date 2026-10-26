// r62: the sheets and the exercise picker moved into typed modules (PENDING
// 355; ARCHITECTURE.md, What is left). Run on r61 (`node tests/r62.js
// baselines/r61.html`, R62_ONLY=n for one section):
//   1  (a guard, the source build) every sheet, opened as the app opens it,
//      in the states a lifter meets it in, has the same elements,
//      attributes, field values and visible text as r61's
//      (baselines/r61.html), in light and dark, pounds and kilograms.
const { engine, screenOf, screenDiff } = require('./h');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r61.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const ONLY = process.env.R62_ONLY ? process.env.R62_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));

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
  ['the menu, dark', DEMO + DARK, OPEN({ kind: 'menu' }), /Your data and backups/]
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
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
