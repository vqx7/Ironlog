// r60 (phase 5 of ARCHITECTURE.md, its last screen): the session screen moves
// into src/app/ as a lit-html screen (workout.ts), every change it makes to
// the session in progress through `act`, the next-set adjustment a function of
// the model (nextSetsIn); with the decisions placed in r60 (PENDING 347).
// Run on r59 (`node tests/r60.js baselines/r59.html`, R60_ONLY=n for one
// section); the guards pass on both builds:
//   1  (a guard, the source build) it looks as it did: the session screen in
//      its sessions, settings and modes gives the same elements, attributes,
//      field values and visible text as r59 (baselines/r59.html), but for the
//      changes held on purpose by the sections after it.
const { open, engine, screenOf, screenDiff } = require('./h');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r59.html';
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
// R60_ONLY=2,3 runs those sections alone (to show a case failing on r59 without the rest).
const ONLY = process.env.R60_ONLY ? process.env.R60_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));

// The starter routine's ids are made at random, so both builds are given the same ones.
const FIX = "const m={};L.state.routines.forEach((r,i)=>{m[r.id]='R'+i;r.id='R'+i;});L.state.activeRoutineId=m[L.state.activeRoutineId]||L.state.activeRoutineId;L.state.sessions.forEach(s=>{if(m[s.routineId])s.routineId=m[s.routineId];});L.saveNow();";
const DEMO = 'L.state.settings.onboarded=true;L.makeDemo();';
// Demo sessions read as the lifter's own (a calibration set is offered only after three of those).
const REAL = 'L.state.sessions.forEach(s=>{delete s.demo;});L.state.bodyweights.forEach(b=>{delete b.demo;});L.invalidate();L.saveNow();';
const ACTIVE = 'const R=L.state.routines.find(r=>r.id===L.state.activeRoutineId);';
// The first day of the routine with exercises on it, started as the start card starts it.
const DAY = ACTIVE + 'const di=String(R.days.findIndex(x=>!x.rest&&x.items.length));';
const START = (o = '') => FIX + DAY + `L.ui.tab='today';L.ACT.startSession({dataset:{day:di${o}}});`;
// A blank session holding the lifts named, each planned as a blank session plans a lift.
const FREE = ids => FIX + `L.ui.tab='today';L.ACT.startFree();L.ACT.mClose();{const d=L.state.draft;for(const id of ${JSON.stringify(ids)})d.ex.push(L.newBlock(id,L.planFor(id,null,null,false,d.date),{before:d.date}));L.saveNow();}`;
// A tap on a control by its data-act, as the page's handler gives it its dataset.
const TAP = (act, ds) => `L.ACT.${act}({dataset:${JSON.stringify(ds)}});`;
// Set k of exercise b typed (load in kilograms as stored, reps, RIR) and ticked through the checkmark's action.
const TICK = (b, s, w, r, rir) => `{const x=L.state.draft.ex[${b}].sets[${s}];${w == null ? '' : `x.w=${w};`}x.r=${r};${rir == null ? '' : `x.rir=${rir};`}}` + TAP('sDone', { b: String(b), s: String(s) });
const TICKALL = b => `{const bl=L.state.draft.ex[${b}];bl.sets.forEach((x,i)=>{if(x.done||x.warm)return;x.r=x.r==null?(+bl.plan.repMin||8):x.r;L.ACT.sDone({dataset:{b:'${b}',s:String(i)}});});}`;
const SCREENS = [
  ['a plan day, nothing done', DEMO + START()],
  ['a plan day in kg', DEMO + "L.state.settings.unit='kg';L.saveNow();" + START()],
  ['a plan day, RIR off', DEMO + "L.state.settings.rirMode='off';L.saveNow();" + START()],
  ['a plan day, effort as RPE', DEMO + "L.state.settings.rirScale='rpe';L.saveNow();" + START()],
  ['a plan day, half points of RIR', DEMO + "L.state.settings.rirScale='half';L.saveNow();" + START()],
  ['a plan day, Fill in suggested loads', DEMO + "L.state.settings.loadFill='fill';L.saveNow();" + START()],
  ['a plan day, the first set typed and ticked', DEMO + START() + TICK(0, 0, null, 8, 2)],
  ['a plan day, two sets ticked, the third typed', DEMO + START() + TICK(0, 0, null, 8, 2) + TICK(0, 1, null, 7, 1) + "L.state.draft.ex[0].sets[2].r=6;L.saveNow();"],
  ['an exercise done and folded', DEMO + START() + TICKALL(0), null, /folded/],
  ['an exercise done and opened again', DEMO + START() + TICKALL(0) + TAP('bOpen', { b: '0' })],
  ['the next sets adjusted up', DEMO + START() + TICK(0, 0, null, 14, 4), null, /Next sets: .*, up because/],
  ['the next sets adjusted down', DEMO + START() + TICK(0, 0, null, 3, 0), null, /Next sets: .*, down because/],
  ['the next sets adjusted, then Keep', DEMO + START() + TICK(0, 0, null, 14, 4) + TAP('adjKeep', { b: '0' })],
  ['a missed set (0 reps)', DEMO + START() + TICK(0, 0, null, 0, null), null, /missed/],
  ['a heavy set that is a PR', DEMO + START() + "{const b=L.state.draft.ex[0];const w=(b.sw||40)*1.06;b.sets[0].w=w;b.sets[0].r=12;b.sets[0].rir=0;}" + TAP('sDone', { b: '0', s: '0' }), null, /data-pr=/],
  ['the effort strip open', DEMO + START() + "L.state.draft.ex[0].sets[0].r=8;L.saveNow();", TAP('rirOpen', { b: '0', s: '0' }), /rirstrip/],
  ['the check-in answered low', DEMO + START() + TAP('chk', { k: 'sleep', v: '1' }) + TAP('chk', { k: 'energy', v: '1' })],
  ['made lighter after the check-in', DEMO + START() + TAP('chk', { k: 'sleep', v: '1' }) + TAP('chk', { k: 'energy', v: '1' }) + TAP('makeLight', {}), null, /Made lighter/],
  ['a lighter day', DEMO + START(",light:'1'")],
  ['a deload week', DEMO + "L.state.deloadWeek=L.weekStart(L.today());L.saveNow();" + START()],
  ['a calibration set due', DEMO + REAL + FREE(['machPress', 'cableFly']), null, /Calibration set/],
  ['warm-ups and a drop set', DEMO + START() + TAP('wAdd', { b: '0' }) + TAP('wAdd', { b: '0' }) + TICK(0, 2, null, 8, 2) + TAP('dropAdd', { b: '0' }), null, /drop/],
  ['a superset', DEMO + START() + TAP('bMenuDo', { op: 'bSs', b: '0' }), null, /Superset A/],
  ['a blank session, named, notes typed', DEMO + FREE(['bench', 'dbRow']) + "L.state.draft.dayName='Arms <b>';L.state.draft.notes='felt <i>good</i>';L.saveNow();"],
  ['bodyweight lifts and the bodyweight ask', DEMO + "L.state.bodyweights=[];L.invalidate();L.saveNow();" + FREE(['pullup', 'pushup', 'dips']), null, /Your bodyweight/],
  ['timed, per side, assisted and a loaded hold', DEMO + FREE(['plank', 'sidePlank', 'dbRow', 'assistPullup', 'farmerHold']), null, /Sec\/side[\s\S]*machine help/],
  ['plates under barbell lifts', DEMO + FREE(['bench', 'bbRow', 'ohp']), null, /Per side at/],
  ['a lift twice', DEMO + FREE(['bench', 'pecDeck', 'bench']), null, /Barbell Bench Press[\s\S]*Barbell Bench Press/],
  ['an injury on a lift', DEMO + "L.state.injuries=[{id:'i1',m:'chest',note:'',date:'2026-10-20'}];L.state=L.normalize(L.state);L.invalidate();L.saveNow();" + START(), null, /Injury: /],
  ['cardio rows', DEMO + START() + TAP('cDraftAdd', { when: 'pre' }) + TAP('cDraftAdd', { when: 'post' }) + "L.state.draft.cardio[0].min=12;L.state.draft.cardio[0].hr=130;L.saveNow();"],
  ['a past workout', DEMO + FIX + DAY + "L.ACT.pastOpen({dataset:{date:'2026-10-20'}});" + 'L.ACT.pastGo({dataset:{day:di}});', null, /Past workout/],
  ['an edit of a saved session', DEMO + FIX + "{const s=[...L.state.sessions].sort((a,b)=>a.date<b.date?1:-1)[0];L.ACT.histEdit({dataset:{id:s.id}});}", null, /Editing a saved session/],
  ['Copy last offered, then used', DEMO + START() + TAP('fillLast', { b: '1' })],
  ['a new install, a first session', "L.state.settings.onboarded=true;L.saveNow();" + START()],
  ['dark theme, the effort strip in RPE', DEMO + "L.state.settings.theme='dark';L.state.settings.rirScale='rpe';L.saveNow();" + START() + "L.state.draft.ex[0].sets[0].r=8;L.saveNow();", TAP('rirOpen', { b: '0', s: '0' }), /rirstrip/]
];

(async () => {
  const browser = await engine.launch();

  // ---- 1. The session screen against r59's (both pages built from src/).
  /* The PR pulse on a row ticked as a PR (prflash, 2 s) is the page's effect, not part of the screen: r59's next draw
     made the row afresh without it, r60 keeps the row and takes the mark off when the pulse ends. It is left out of both. */
  const noPulse = t => t.replace(/class="([^"]*)"/g, (m, c) => `class="${c.split(' ').filter(x => x !== 'prflash').join(' ')}"`);
  const flat = s => ({ ...s, tree: s.tree.map(noPulse), text: s.text.replace(/\s+/g, ' ') });
  const textDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return { at: i, r59: a.slice(Math.max(0, i - 80), i + 160), now: b.slice(Math.max(0, i - 80), i + 160) }; };
  if (!run(1));
  else if (process.env.IRONLOG_FILE) console.log('note r60 section 1 compares source pages; it runs on the source build');
  else for (const [name, seed, prep, want] of SCREENS) {
    const o = { browser, seed, tab: 'today', prep, spaces: true };
    const a = flat(await screenOf(OLD, o)), b0 = await screenOf(FILE, o), b = flat(b0);
    const d = screenDiff({ tree: a.tree, text: '' }, { tree: b.tree, text: '' });
    ok(!d, `1. ${name}: the same elements, attributes and field values as r59`, d && { at: d.at, r59: d.before, now: d.now });
    ok(a.text === b.text, `1. ${name}: the same visible text as r59`, a.text === b.text ? '' : textDiff(a.text, b.text));
    ok(!b0.errors.length, `1. ${name}: no page errors`, b0.errors);
    ok(/Finish and save|Save changes/.test(b.text), `1. ${name}: the session screen drawn`, b.text.slice(0, 120));
    // The case is the state it names (a seed that missed it would compare two screens of something else).
    if (want) ok(want.test(b.tree.join('') + b.text), `1. ${name}: the screen is in that state`, String(want));
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
