// r59 (phase 5 of ARCHITECTURE.md): Today, the week bar and the calendar move
// into src/app/ as lit-html screens (today.ts, map.ts, calendar.ts), every
// change Today makes to the log through `act`; and looking ahead (PENDING
// 329). Run on r58 (`node tests/r59.js baselines/r58.html`, R59_ONLY=n for
// one section); the guards pass on both builds:
//   1  (a guard, the source build) they look as they did: Today in its logs,
//      settings and modes (the first pages, the start card, every section
//      open), the week bar on three tabs, and the calendar, give the same
//      elements, attributes, field values and visible text as r58
//      (baselines/r58.html), but for the changes held on purpose below.
const { open, engine, screenOf, screenDiff } = require('./h');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r58.html';
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
// R59_ONLY=2,3 runs those sections alone (to show a case failing on r58 without the rest).
const ONLY = process.env.R59_ONLY ? process.env.R59_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));

// The starter routine's ids are made at random, so both builds are given the same ones.
const FIX = "const m={};L.state.routines.forEach((r,i)=>{m[r.id]='R'+i;r.id='R'+i;});L.state.activeRoutineId=m[L.state.activeRoutineId]||L.state.activeRoutineId;L.state.sessions.forEach(s=>{if(m[s.routineId])s.routineId=m[s.routineId];});L.saveNow();";
const DEMO = 'L.state.settings.onboarded=true;L.makeDemo();';
const ALL = 'L.state.settings.hidden=[];';
const ACTIVE = 'const R=L.state.routines.find(r=>r.id===L.state.activeRoutineId);';
// An account service that answers no one signed in, as the installed app's does before a sign-in.
const AUTH = 'window.ironlogAuth={onChange(){},user(){return Promise.resolve(null);},signOut(){return Promise.resolve();},deleteAccount(){return Promise.resolve();}};';
const WK = 'L.weekStart(L.today())';
const SCREENS = [
  // The first pages (a new install).
  ['today', 'the first page, with an account service', '', null, null, AUTH],
  ['today', 'Set up, after Continue without an account', '', 'L.ACT.obAcctLater();L.render();', null, AUTH],
  ['today', 'Set up, the source build (no account service)', ''],
  ['today', 'Set up in kg, a name typed', "L.state.settings.unit='kg';L.state.settings.userName='Vee';L.saveNow();"],
  ['today', 'Set up, the preview', '', null, 'preview'],
  ['today', 'demo data before setting up', 'L.makeDemo();'],
  // The start card and everything under it.
  ['today', 'a new install, set up', 'L.state.settings.onboarded=true;L.saveNow();'],
  ['today', 'demo data', DEMO],
  ['today', 'demo data, every section shown', DEMO + ALL],
  ['today', 'kg, a name, RIR off, a time budget it runs over', DEMO + ALL + "L.state.settings.unit='kg';L.state.settings.userName='Vee';L.state.settings.rirMode='off';L.state.settings.timeBudget=20;L.saveNow();"],
  ['today', 'another day viewed', DEMO + ALL, 'L.ui.todayDay=2;L.render();'],
  ['today', 'More options open', DEMO + ALL, 'L.ui.heroMore=true;L.render();'],
  ['today', 'a deload week', DEMO + ALL + `L.state.deloadWeek=${WK};L.saveNow();`],
  ['today', 'a rest week', DEMO + ALL + `L.state.settings.restWeeks=[${WK}];L.saveNow();`],
  ['today', 'Freestyle by default', DEMO + ALL + "L.state.settings.todayStart='free';L.saveNow();"],
  ['today', 'Freestyle by default, More options open', DEMO + ALL + "L.state.settings.todayStart='free';L.saveNow();", 'L.ui.heroMore=true;L.render();'],
  ['today', 'a weekly routine', DEMO + ALL + ACTIVE + "R.schedule='weekly';L.saveNow();"],
  ['today', 'a weekly routine, another day viewed', DEMO + ALL + ACTIVE + "R.schedule='weekly';L.saveNow();", 'L.ui.todayDay=5;L.render();'],
  ['today', 'a cycle routine, its day done today', DEMO + ALL + ACTIVE + "R.schedule='cycle';const d=R.days.find(x=>!x.rest&&x.items.length);L.state.sessions.push({id:'td',date:L.today(),dayIdx:R.days.indexOf(d),dayId:d.id,dayName:d.name,routineId:R.id,notes:'',ex:[{exId:d.items[0].exId,rr:[d.items[0].repMin,d.items[0].repMax],sets:[{w:50,r:8,rir:2,warm:false,drop:false}]}]});L.state=L.normalize(L.state);L.invalidate();L.saveNow();"],
  ['today', 'a weekly routine, a rest day today', DEMO + ALL + ACTIVE + "const wd=(new Date(L.today()+'T12:00:00').getDay()+6)%7;R.schedule='weekly';R.days[wd].rest=true;R.days[wd].items=[];L.saveNow();"],
  ['today', 'injuries flagged, a muscle and a joint', DEMO + ALL + "L.state.injuries=[{id:'i1',m:'chest',note:'twinge <b>',date:'2026-10-20'},{id:'i2',m:'j_knee',note:'',date:'2026-10-18'}];L.state=L.normalize(L.state);L.invalidate();L.saveNow();"],
  ['today', 'a weigh-in due', DEMO + ALL + "L.state.settings.bwEvery=7;L.state.bodyweights=L.state.bodyweights.filter(b=>b.date<'2026-10-10');L.saveNow();"],
  ['today', 'body: a height and tape measurements', DEMO + ALL + "L.state.settings.heightCm=178;L.saveNow();"],
  ['today', 'This week as a month', DEMO + ALL, "L.ui.wkView='month';L.ui.calYm=L.today().slice(0,7);L.render();"],
  ['today', 'This week as an earlier month', DEMO + ALL, "L.ui.wkView='month';L.ui.calYm='2026-09';L.render();"],
  ['today', 'the muscle map, a muscle picked', DEMO + ALL, "L.ui.mapSel='chest';L.render();"],
  ['today', 'the muscle map, this week', DEMO + ALL, "L.ui.mapSrc='week';L.render();"],
  ['today', 'the muscle map in 3D', DEMO + ALL + "localStorage.setItem(L.KEY+'.mapView','3d');", 'await new Promise(r=>setTimeout(r,800));'],
  ['today', 'the muscle map in 3D, a muscle picked', DEMO + ALL + "localStorage.setItem(L.KEY+'.mapView','3d');", "await new Promise(r=>setTimeout(r,800));L.ui.mapSel='quads';L.render();await new Promise(r=>setTimeout(r,300));"],
  ['today', 'the preview, demo data', DEMO + ALL, null, 'preview'],
  ['today', 'an account service, signed out', DEMO + ALL, null, null, AUTH],
  ['today', 'the installed build in a browser', DEMO + ALL + 'window.IRONLOG_APP=true;'],
  ['today', 'dark theme, volt accent', DEMO + ALL + "L.state.settings.theme='dark';L.state.settings.accent='volt';L.saveNow();"],
  // The week bar, at the top of every tab.
  ['today', 'the week bar on Today', DEMO, null, null, null, 'wkbar'],
  ['dash', 'the week bar on Stats', DEMO, null, null, null, 'wkbar'],
  ['history', 'the week bar on History, a weekly routine', DEMO + ACTIVE + "R.schedule='weekly';L.saveNow();", null, null, null, 'wkbar'],
  ['today', 'the week bar in a rest week', DEMO + `L.state.settings.restWeeks=[${WK}];L.saveNow();`, null, null, null, 'wkbar'],
  ['today', 'the week bar, a new install', 'L.state.settings.onboarded=true;L.saveNow();', null, null, null, 'wkbar'],
  ['history', 'the week bar, a session in progress', DEMO, "document.querySelector('.hero [data-act=\"startSession\"]')||0;L.ui.tab='today';L.render();await new Promise(r=>setTimeout(r,100));document.querySelector('.hero [data-act=\"startSession\"]').click();await new Promise(r=>setTimeout(r,200));L.ui.tab='history';L.render();", null, null, 'wkbar'],
  // The calendar sheet (History's Calendar, a Consistency square).
  ['history', 'the calendar, an earlier month', DEMO, "L.ACT.calOpen({dataset:{ym:'2026-09'}});", null, null, 'modal']
];

(async () => {
  const browser = await engine.launch();

  // ---- 1. The screens against r58's (both pages built from src/; the standalone build is left to the source run, as r58's section 1 is).
  /* The visible text is read with its spaces and line breaks left out (every text node is held exactly by the
     elements): how text reads at a line wrap differs by engine (r58's WebKit run). */
  /* The 3D body's loading line, hidden once it has loaded, is left out of both: r58 drew the card fresh, so
     its hidden line kept "Loading the 3D body" until the next draw, and r59 keeps the card and clears it. */
  const flat = s => ({ ...s, tree: s.tree.map(t => t.replace(/(<p class="bm3d-msg muted small" hidden="">)"Loading the 3D body"(<\/p>)/g, '$1$2')), text: s.text.replace(/\s+/g, '') });
  const textDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return { at: i, r58: a.slice(Math.max(0, i - 80), i + 160), now: b.slice(Math.max(0, i - 80), i + 160) }; };
  if (!run(1));
  else if (process.env.IRONLOG_FILE) console.log('note r59 section 1 compares source pages; it runs on the source build');
  else for (const [tab, name, seed, prep, env, init, root] of SCREENS) {
    const o = { browser, seed: seed + FIX, tab, prep, env, init, root };
    const a = flat(await screenOf(OLD, o)), b0 = await screenOf(FILE, o), b = flat(b0);
    const d = screenDiff({ tree: a.tree, text: '' }, { tree: b.tree, text: '' });
    ok(!d, `1. ${name}: the same elements, attributes and field values as r58`, d && { at: d.at, r58: d.before, now: d.now });
    ok(a.text === b.text, `1. ${name}: the same visible text as r58`, a.text === b.text ? '' : textDiff(a.text, b.text));
    ok(!b0.errors.length, `1. ${name}: no page errors`, b0.errors);
    ok(b.tree.length > 0, `1. ${name}: something drawn`, b.tree.length);
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
