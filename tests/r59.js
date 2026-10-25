// r59 (phase 5 of ARCHITECTURE.md): Today, the week bar and the calendar move
// into src/app/ as lit-html screens (today.ts, map.ts, calendar.ts), every
// change Today makes to the log through `act`; and looking ahead (PENDING
// 329). Run on r58 (`node tests/r59.js baselines/r58.html`, R59_ONLY=n for
// one section); the guards pass on both builds:
//   1  (a guard, the source build) they look as they did: Today in its logs,
//      settings and modes (the first pages, the start card, every section
//      open), the week bar on three tabs, and the calendar, give the same
//      elements, attributes, field values and visible text as r58
//      (baselines/r58.html), but for the changes held on purpose below (the
//      calendar's days ahead and its Next month, section 4);
//   2  (a guard: r58 placed these steps by hand) every Today action and field
//      that changes the log does act's steps, read on the page after a tap or
//      a typed value (changed, saved, the caches dropped, the edit noted for
//      the sync, the Undo step it had);
//   3  Today and the week bar are drawn by lit-html and kept between draws: a
//      weigh-in being typed keeps its field, focus and text (r58 drew them
//      fresh: fails there);
//   4  looking ahead (329): the calendar's days ahead show the workout the
//      routine plans on them (by weekday, or walking a cycle from today, a
//      rest week ahead planning nothing) and open Today on it, which says the
//      date; its months go on a year past this one, a month ahead saying what
//      is planned in it, inline in This week too (fails on r58);
//   5  found in the move: Calibration set (RIR check) in an exercise's menu
//      opens its sheet (the calendar took its sheet's name in r25, so the tap
//      threw: fails on r58);
//   6  (a guard) a weigh-in and a measurement saved from Body leave their
//      fields as a fresh card shows them, now that the fields are kept;
//   7  found by the review: a weigh-in's date is kept between draws as its
//      weight is, so Log saves it on the date chosen (2f6a50d saved it on
//      today; fails there and on r58);
//   8  found by the review: a day chosen another way drops the date a day
//      ahead put on the card (fails on 2f6a50d and r58);
//   9  a day ahead in another year says its year (fails on 2f6a50d and r58);
//  10  when three.js cannot load, the error log says why for each address
//      (fails on 2f6a50d and r58, which kept no reason);
//  11  a sync request that times out and then fails keeps its own reason
//      in the error log (fails on 2f6a50d and r58);
//  12  a sign-in the account service refuses keeps its reason in the error
//      log (fails on 2f6a50d and r58);
//  13  Copy my log in names in the error log a month of the account's log
//      it could not read (fails on 2f6a50d and r58);
//  14  a cycle's days ahead against dates worked out by hand, not the app's
//      own projection (fails on r58, which plans none);
//  15  a weigh-in or measurement being typed is dropped when the unit
//      changes under it, never saved in the wrong unit (fails on eb28bd8);
//  16  found by the second review: Body's date moves to the new day at
//      midnight, so a morning weigh-in never lands over the evening's
//      (fails on eb28bd8 to 93b20b2);
//  17  the same error in a row is one line in the error log, with its count,
//      so it cannot push an earlier one out (fails on 93b20b2 and before);
//  18  the app brought back to the screen on a new day draws Today again,
//      so a weigh-in typed at once is saved on the new day (fails on r58
//      and every r59 commit to ed972d2).
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
  ['history', 'the calendar, an earlier month', DEMO, "L.ACT.calOpen({dataset:{ym:'2026-09'}});", null, null, 'modal'],
  ['history', 'the calendar, this month', DEMO, "L.ACT.calOpen({dataset:{ym:L.today().slice(0,7)}});", null, null, 'modal']
];

(async () => {
  const browser = await engine.launch();

  // ---- 1. The screens against r58's (both pages built from src/; the standalone build is left to the source run, as r58's section 1 is).
  /* The elements are read with the spaces at the ends of each run of text (screenOf's spaces), so a space lost
     or added between a date and a tag reads as a difference. The visible text has each run of spaces and line
     breaks read as one space: how text breaks at a wrap differs by engine (r58's WebKit run), not whether it is
     there. */
  /* The 3D body's loading line, hidden once it has loaded, is left out of both: r58 drew the card fresh, so
     its hidden line kept "Loading the 3D body" until the next draw, and r59 keeps the card and clears it. */
  /* The calendar's days ahead and its Next month (329, held by section 4) are left out of both: r58 left days
     ahead blank and stopped at this month. The days before them are held exactly. */
  const ahead = t => t.replace(/<(span|button)[^>]*class="cd fut[^"]*"[^>]*><span class="n">"\d+"<\/span><span class="x"><\/span><\/\1>/g, '(a day ahead)').replace(/(aria-label="Next month"[^>]*) p-disabled="(true|false)"/g, '$1');
  const flat = s => ({ ...s, tree: s.tree.map(t => ahead(t.replace(/(<p class="bm3d-msg muted small" hidden="">)"Loading the 3D body"(<\/p>)/g, '$1$2'))), text: s.text.replace(/\s+/g, ' ') });
  const textDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return { at: i, r58: a.slice(Math.max(0, i - 80), i + 160), now: b.slice(Math.max(0, i - 80), i + 160) }; };
  if (!run(1));
  else if (process.env.IRONLOG_FILE) console.log('note r59 section 1 compares source pages; it runs on the source build');
  else for (const [tab, name, seed, prep, env, init, root] of SCREENS) {
    const o = { browser, seed: seed + FIX, tab, prep, env, init, root, spaces: true };
    const a = flat(await screenOf(OLD, o)), b0 = await screenOf(FILE, o), b = flat(b0);
    const d = screenDiff({ tree: a.tree, text: '' }, { tree: b.tree, text: '' });
    ok(!d, `1. ${name}: the same elements, attributes and field values as r58`, d && { at: d.at, r58: d.before, now: d.now });
    ok(a.text === b.text, `1. ${name}: the same visible text as r58`, a.text === b.text ? '' : textDiff(a.text, b.text));
    ok(!b0.errors.length, `1. ${name}: no page errors`, b0.errors);
    ok(b.tree.length > 0, `1. ${name}: something drawn`, b.tree.length);
  }

  if (run(2) || run(3) || run(6)) {
  const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
  // Every section shown (Body is hidden on a new install), so each control is on the page.
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = []; L.saveNow(); L.render(); });
  await wait(300);
  // The first pages: a new install's log, nothing in it and not set up.
  const FIRST = 'L.state.sessions=[];L.state.bodyweights=[];L.state.measurements=[];L.state.settings.onboarded=false;';
  const BACK = 'L.state.settings.onboarded=true;L.makeDemo();L.state.settings.hidden=[];';

  // ---- 2. Today's actions and fields, each read on the page after it (a guard: r58 placed these steps by hand).
  const probe = (name, sel, undo, prep, typed) => ev(async ([name, sel, undo, prep, typed]) => {
    const L = window.__ironlog; const KEY = L.KEY;
    L.ui.tab = 'today';
    // What a case starts from is saved and seen by the sync first, so the tap's own change is what is read.
    if (prep) (new Function('L', prep))(L);
    L.saveNow(); await new Promise(r => setTimeout(r, 950));
    L.render(); await new Promise(r => setTimeout(r, 60));
    // The installed build asks about an account before Set up (it has an account service): passed as a lifter passes it.
    const later = document.querySelector('#view [data-act="obAcctLater"]'); if (later) { later.click(); await new Promise(r => setTimeout(r, 80)); }
    document.querySelectorAll('#view details').forEach(d => { d.open = true; });
    await new Promise(r => setTimeout(r, 60));
    for (const [s, v] of Object.entries(typed || {})) { const f = document.querySelector(s); if (f) f.value = v; }
    const el = document.querySelector(sel); if (!el) return { name, missing: sel };
    const idx0 = L.IDX(); const u0 = L.undoStack.length; const s0 = JSON.stringify(L.state); const e0 = JSON.stringify(L.cloud.editAt);
    el.click(); await new Promise(r => setTimeout(r, 80));
    const okb = document.querySelector('#modal [data-act="mOk"]'); if (okb) { okb.click(); await new Promise(r => setTimeout(r, 80)); }
    await new Promise(r => setTimeout(r, 950));
    const s1 = JSON.stringify(L.state);
    return { name, changed: s1 !== s0, saved: localStorage.getItem(KEY) === s1, undo: L.undoStack.length - u0, wantUndo: undo, dropped: L.IDX() !== idx0, noted: JSON.stringify(L.cloud.editAt) !== e0 };
  }, [name, sel, undo, prep || '', typed || null]);
  if (run(2)) {
  const cases = [
    ['Deload week', '#view [data-act="deloadToggle"]', 0, 'L.ui.heroMore=true;'],
    ['Deload week off', '#view [data-act="deloadToggle"]', 0, 'L.ui.heroMore=true;L.state.deloadWeek=L.weekStart(L.today());'],
    ['Log (a weigh-in)', '#view [data-act="addBW"]:not([data-in])', 0, null, { '#bwVal': '182.4' }],
    ['Save (the weigh-in due)', '#view [data-act="addBW"][data-in="bwDueVal"]', 0, "L.state.settings.bwEvery=7;L.state.bodyweights=L.state.bodyweights.filter(b=>b.date<'2026-10-10');", { '#bwDueVal': '183' }],
    ['delete a weigh-in', '#view [data-act="delBW"]', 1],
    ['Save measurements', '#view [data-act="addMeas"]', 1, null, { '#ms_arm': '15.5', '#ms_waist': '33' }],
    ['delete measurements', '#view [data-act="delMeas"]', 1],
    ['Cleared (an injury)', '#view [data-act="injClear"]', 1, "L.state.injuries=[{id:'i1',m:'chest',note:'',date:'2026-10-20'}];"],
    // Before Build my own routine, whose routine has no exercises for demo data to be made from.
    ['Clear demo and set up', '#view [data-act="demoStart"]', 0, FIRST + 'L.makeDemo();'],
    ['Units on Set up', '#obPage [data-act="obUnit"][data-v="kg"]', 0, FIRST],
    ['Build my own routine', '#obPage [data-act="obOwn"]', 0, FIRST]
  ];
  for (const c of cases) {
    const r = await probe(...c);
    if (r.missing) { ok(false, `2. ${c[0]}: its control is on Today`, r); continue; }
    ok(r.changed && r.saved && r.dropped && r.noted && r.undo === r.wantUndo, `2. ${c[0]}: changes the log, saves it, drops the caches, notes the edit for the sync${r.wantUndo ? ' and keeps one Undo step' : ', keeping no Undo step as before'}`, r);
  }
  await ev(new Function('L0', `const L=window.__ironlog;${BACK}L.saveNow();L.render();`));
  // The fields: typed, then left (change).
  const field = (name, sel, value, prep) => ev(async ([name, sel, value, prep]) => {
    const L = window.__ironlog; const KEY = L.KEY;
    L.ui.tab = 'today';
    if (prep) (new Function('L', prep))(L);
    L.saveNow(); await new Promise(r => setTimeout(r, 950));
    L.render(); await new Promise(r => setTimeout(r, 60));
    document.querySelectorAll('#view details').forEach(d => { d.open = true; });
    const el = document.querySelector(sel); if (!el) return { name, missing: sel };
    const idx0 = L.IDX(); const u0 = L.undoStack.length; const s0 = JSON.stringify(L.state); const e0 = JSON.stringify(L.cloud.editAt);
    el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 950));
    const s1 = JSON.stringify(L.state);
    return { name, changed: s1 !== s0, saved: localStorage.getItem(KEY) === s1, undo: L.undoStack.length - u0, dropped: L.IDX() !== idx0, noted: JSON.stringify(L.cloud.editAt) !== e0 };
  }, [name, sel, value, prep || '']);
  for (const [name, sel, value, prep] of [
    ['the height', '#view [data-bind="height"]', "6'1", "L.state.settings.unit='lb';"],
    ['the Set up page\'s bodyweight', '#obBw', '181', FIRST]
  ]) {
    const r = await field(name, sel, value, prep);
    if (r.missing) { ok(false, `2. ${name}: its field is on Today`, r); continue; }
    ok(r.changed && r.saved && r.dropped && r.noted && r.undo === 0, `2. ${name}: typed, changes the log, saves it, drops the caches and notes the edit for the sync, keeping no Undo step as before`, r);
  }
  await ev(new Function('L0', `const L=window.__ironlog;${BACK}L.saveNow();L.render();`));
  }

  // ---- 3. Today, the week bar and the calendar are drawn by lit-html and kept between draws (r58 drew them fresh: fails there).
  // The sections are opened as a lifter opens them, by a tap on each heading: opened by script, the next draw closed them
  // again before the browser said they had opened (the r59 review), and the case failed on r59 for that, not for the app.
  if (run(3)) {
    const r = await ev(async () => {
      const L = window.__ironlog; L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 60));
      for (const d of document.querySelectorAll('#view details:not([open])')) d.querySelector('summary').click(); await new Promise(r => setTimeout(r, 60));
      const hero = document.querySelector('#view .hero'), day = document.querySelector('#wkbar .w'), f = document.getElementById('bwVal');
      f.focus(); f.value = '18';
      L.render(); await new Promise(r => setTimeout(r, 60));
      const f2 = document.getElementById('bwVal');
      return { hero: document.querySelector('#view .hero') === hero, bar: document.querySelector('#wkbar .w') === day, field: f2 === f, focus: document.activeElement === f2, text: f2 && f2.value };
    });
    ok(r.hero && r.bar && r.field && r.focus && r.text === '18', '3. Today drawn again keeps its elements and the week bar its days, and a weigh-in being typed keeps its field, focus and text', r);
  }

  // ---- 6. (guards, both builds) a weigh-in or measurement saved from Body leaves its fields as a fresh card shows them: empty, the date today.
  if (run(6)) {
    const r = await ev(async () => {
      const L = window.__ironlog; L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 60));
      for (const d of document.querySelectorAll('#view details:not([open])')) d.querySelector('summary').click(); await new Promise(r => setTimeout(r, 60));
      document.getElementById('bwDate').value = '2026-10-20'; document.getElementById('bwVal').value = '179.6';
      document.querySelector('#view [data-act="addBW"]:not([data-in])').click(); await new Promise(r => setTimeout(r, 120));
      const bw = { val: document.getElementById('bwVal').value, date: document.getElementById('bwDate').value, saved: L.state.bodyweights.some(b => b.date === '2026-10-20' && Math.abs(L.fmtW(b.kg) - 179.6) < 0.05) };
      for (const d of document.querySelectorAll('#view details:not([open])')) d.querySelector('summary').click(); await new Promise(r => setTimeout(r, 60));
      document.getElementById('ms_arm').value = '15';
      document.querySelector('#view [data-act="addMeas"]').click(); await new Promise(r => setTimeout(r, 120));
      return { bw, arm: document.getElementById('ms_arm').value };
    });
    ok(r.bw.saved && r.bw.val === '' && r.bw.date === '2026-10-24' && r.arm === '', '6. a weigh-in (for Oct 20) and a measurement saved from Body leave the fields empty and the date today, as before', r);
  }
  ok(!P.errors.length, 'no page errors', P.errors);
  await P.page.context().close();
  }

  // ---- 4. Looking ahead (PENDING 329): the calendar's days ahead show the workout planned and open it on Today; its months go
  // on past this one. r58 left days ahead blank and untappable and stopped at this month: fails there.
  if (run(4)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const q = (f, a) => Q.page.evaluate(f, a);
    // A weekly routine of the demo's days, today a Saturday; the week of Nov 9 marked a rest week.
    await q(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); R.schedule = 'weekly'; L.state.settings.restWeeks = ['2026-11-09']; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); L.render(); });
    await wait(200);
    const cal = await q(async () => {
      const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId);
      L.ui.tab = 'history'; L.render(); await new Promise(r => setTimeout(r, 60));
      L.ACT.calOpen({ dataset: { ym: '2026-10' } }); await new Promise(r => setTimeout(r, 100));
      const next = document.querySelector('#modal [data-act="calMonth"][data-v="1"]');
      const out = { nextOn: !!next && !next.disabled };
      // The days left this month: Oct 25 (a Sunday) to 31.
      const ahead = [...document.querySelectorAll('#modal .cd.fut')].map(e => ({ d: e.dataset.date || null, btn: e.tagName === 'BUTTON', act: e.dataset.act || null, day: e.dataset.day || null, label: e.getAttribute('aria-label') || '' }));
      out.oct = ahead;
      const want = d => { const wd = (new Date(d + 'T12:00:00').getDay() + 6) % 7; const day = R.days[wd]; return day && !day.rest && day.items.length ? { wd, name: day.name } : null; };
      out.octOk = ahead.length === 7 && ahead.every((e, i) => { const d = `2026-10-${25 + i}`; const w = want(d); return w ? e.btn && e.act === 'wkGo' && e.d === d && e.day === String(w.wd) && e.label.includes(w.name + ', planned') : !e.btn; });
      if (next) { next.click(); await new Promise(r => setTimeout(r, 100)); }
      out.title = (document.getElementById('calH') || {}).textContent;
      const nov = [...document.querySelectorAll('#modal .cd')].map(e => ({ d: e.dataset.date || null, act: e.dataset.act || null }));
      const planned = nov.filter(e => e.act === 'wkGo').map(e => e.d);
      const wantNov = []; for (let i = 1; i <= 30; i++) { const d = `2026-11-${String(i).padStart(2, '0')}`; if (want(d) && !(d >= '2026-11-09' && d <= '2026-11-15')) wantNov.push(d); }
      out.novOk = planned.join() === wantNov.join();
      out.line = [...document.querySelectorAll('#modal .row.spread p')].map(p => p.textContent).join('|');
      out.wantN = wantNov.length;
      // A day ahead tapped: Today, on that day's workout, saying the date.
      const tap = document.querySelector(`#modal .cd[data-date="${wantNov[wantNov.length - 1]}"]`);
      if (tap) { tap.click(); await new Promise(r => setTimeout(r, 150)); }
      const d = wantNov[wantNov.length - 1]; const w = want(d);
      out.today = { tab: L.ui.tab, modal: !!L.ui.modal, name: (document.querySelector('#view .hero h2') || {}).textContent, eye: (document.querySelector('#view .hero .eyebrow') || {}).textContent, want: w && w.name, date: L.fmtDate(d) };
      return out;
    });
    ok(cal.nextOn && cal.octOk, '4. the calendar: this month\'s days ahead each show the workout the weekly plan has on them, a tap away (wkGo), its rest days not', cal);
    ok(cal.title === 'November 2026' && cal.novOk && cal.line.startsWith(`${cal.wantN} planned`), '4. Next month goes on to November, its planned days marked (the rest week marked ahead left out), and its line says how many are planned', cal);
    ok(cal.today.tab === 'today' && !cal.today.modal && cal.today.name === cal.today.want && (cal.today.eye || '').includes(cal.today.date), '4. a planned day ahead tapped opens Today on that day\'s workout, which says the date', cal.today);
    // A cycle: the days ahead walk the cycle from today, as the week bar's do.
    const cyc = await q(async () => {
      const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); R.schedule = 'cycle'; delete L.state.settings.restWeeks; L.state = L.normalize(L.state); L.invalidate(); L.saveNow();
      L.ui.tab = 'today'; L.ui.todayDay = null; L.ui.wkView = 'month'; L.ui.calYm = '2026-11'; L.render(); await new Promise(r => setTimeout(r, 100));
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const pj = L.cycleProjection(R, 40);
      const cells = [...document.querySelectorAll('#view .cal-inline .cd[data-act="wkGo"]')].map(e => [e.dataset.date, +e.dataset.day]);
      const want = Object.entries(pj).filter(([d, i]) => d.startsWith('2026-11') && !R.days[i].rest && R.days[i].items.length).map(([d, i]) => [d, i]);
      const out = { inline: (document.querySelector('#view .cal-inline h4') || {}).textContent, ok: JSON.stringify(cells) === JSON.stringify(want), n: cells.length, title: (document.querySelector('[data-sk="today:week"] .sec-t') || {}).textContent, sub: (document.querySelector('[data-sk="today:week"] .sec-s') || {}).textContent };
      // One of them tapped: the card says the date and the cycle's day.
      const last = want[want.length - 1];
      const b = last && document.querySelector(`#view .cal-inline .cd[data-date="${last[0]}"]`); if (b) { b.click(); await new Promise(r => setTimeout(r, 150)); }
      out.eye = (document.querySelector('#view .hero .eyebrow') || {}).textContent; out.wantEye = last ? `Viewing ${L.fmtDate(last[0])} · Day ${last[1] + 1}` : null;
      out.name = (document.querySelector('#view .hero h2') || {}).textContent; out.wantName = last ? R.days[last[1]].name : null;
      return out;
    });
    ok(cyc.inline === 'November 2026' && cyc.ok && cyc.n > 0 && cyc.title === 'November 2026' && cyc.sub === `${cyc.n} planned`, '4. This week as a month goes ahead too: a cycle\'s November shows the days the cycle reaches from today, and the title says how many are planned', cyc);
    ok(!!cyc.wantEye && (cyc.eye || '').endsWith(cyc.wantEye) && cyc.name === cyc.wantName, '4. a cycle\'s day ahead tapped opens Today on it, saying the date and the day of the cycle', cyc);
    ok(!Q.errors.length, '4. no page errors', Q.errors);
    await Q.page.context().close();
  }

  // ---- 5. Found in the move: a calibration set (RIR check) from an exercise's menu opens its sheet. From r25 the
  // calendar's sheet shared its name ('cal'), so the tap opened the calendar on no month and threw: fails on r58.
  if (run(5)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 100));
      document.querySelector('.hero [data-act="startSession"]').click(); await new Promise(r => setTimeout(r, 200));
      const bi = L.state.draft.ex.findIndex(b => !L.EX(b.exId).timed);
      L.ACT.bMenu({ dataset: { b: String(bi) } }); await new Promise(r => setTimeout(r, 150));
      const btn = document.querySelector('#modal [data-act="bMenuDo"][data-op="bCal"]'); if (!btn) return { noBtn: true };
      btn.click(); await new Promise(r => setTimeout(r, 200));
      const m = document.getElementById('modal');
      return { kind: L.ui.modal && L.ui.modal.kind, shown: !m.hidden, head: (m.querySelector('h3') || {}).textContent || '', save: !!m.querySelector('[data-act="calSave"]') };
    });
    ok(r.kind === 'cal' && r.shown && /^Calibration set: /.test(r.head) && r.save, '5. Calibration set (RIR check) in an exercise\'s menu opens the calibration sheet, with its Save', r);
    ok(!Q.errors.length, '5. no page errors', Q.errors);
    await Q.page.context().close();
  }

  // ---- 7. Found by the r59 review: Body's weigh-in date is kept between draws as its weight is. The first r59 commit (2f6a50d)
  // put the date back to today on every draw and kept the weight, so Log saved it on today, over today's weigh-in, and said
  // nothing; r58 lost both, so it refused the save (fails on both).
  if (run(7)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
      L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = []; L.saveNow(); L.ui.tab = 'today'; L.render(); await w(100);
      const out = {};
      const cases = [
        ['More options tapped', () => document.querySelector('#view [data-act="heroMore"]').click()],
        ['a muscle tapped on the map', () => document.querySelector('#view [data-act="mapSel"][data-m="chest"]').dispatchEvent(new MouseEvent('click', { bubbles: true }))],
        ['Today drawn again (as a sync pull does)', () => L.render()]
      ];
      for (const [name, redraw] of cases) {
        // Today's weigh-in is 181, none on Oct 22.
        L.state.bodyweights = L.state.bodyweights.filter(b => b.date !== '2026-10-22' && b.date !== '2026-10-24');
        L.state.bodyweights.push({ id: 'T' + name.length, date: '2026-10-24', kg: L.fromD(181), demo: false }); L.saveNow(); L.render(); await w(60);
        // Body opened as a lifter opens it, by its heading.
        for (const d of document.querySelectorAll('#view details:not([open])')) d.querySelector('summary').click();
        await w(60);
        const de = document.getElementById('bwDate'); de.value = '2026-10-22'; de.dispatchEvent(new Event('input', { bubbles: true })); de.dispatchEvent(new Event('change', { bubbles: true }));
        const f = document.getElementById('bwVal'); f.value = '180.2'; f.dispatchEvent(new Event('input', { bubbles: true }));
        redraw(); await w(100);
        const date = document.getElementById('bwDate').value;
        document.querySelector('#view [data-act="addBW"]:not([data-in])').click(); await w(150);
        out[name] = { date, oct22: L.state.bodyweights.filter(b => b.date === '2026-10-22').map(b => L.fmtW(b.kg)), oct24: L.state.bodyweights.filter(b => b.date === '2026-10-24').map(b => L.fmtW(b.kg)) };
      }
      return out;
    });
    for (const [name, x] of Object.entries(r))
      ok(x.date === '2026-10-22' && x.oct22.join() === '180.2' && x.oct24.join() === '181', `7. a weigh-in for Oct 22 being typed, then ${name}: the date stays Oct 22 and Log saves it there, today's weigh-in left as it was`, x);
    ok(Object.keys(r).length === 3, '7. all three draws tried', Object.keys(r));
    ok(!Q.errors.length, '7. no page errors', Q.errors);
    await Q.page.context().close();
  }

  // ---- 8. Found by the r59 review: a date said on the card goes when the day is chosen another way. After a day far ahead
  // was opened from the calendar, Change, Pick for me, Preview of the same day kept "Viewing Mon, Mar 1" (2f6a50d; r58 has
  // no days ahead on its calendar, so this fails there too).
  // ---- 9. A day ahead in another year says its year: "Viewing Sat, Oct 23" a year ahead read as yesterday beside today's
  // "Sat Oct 24" (2f6a50d; r58 has no days ahead on its calendar: fails there too). A day ahead this year says none.
  if (run(8) || run(9)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const q = (f, a) => Q.page.evaluate(f, a);
    await q(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); R.schedule = 'weekly'; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); });
    await wait(150);
    // A planned day in a month ahead (its first, or its last), tapped on the calendar sheet: what the card says.
    const openDay = (ym, first) => q(async ([ym, first]) => {
      const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
      L.ui.todayDay = null; L.ui.todayAt = null; L.ui.tab = 'today'; L.render(); await w(60);
      L.ACT.calOpen({ dataset: { ym } }); await w(100);
      const cells = [...document.querySelectorAll('#modal .cd[data-act="wkGo"]')]; const cell = first ? cells[0] : cells.pop();
      if (!cell) return { none: true };
      const d = cell.dataset.date, di = +cell.dataset.day; cell.click(); await w(150);
      return { d, di, eye: (document.querySelector('#view .hero .eyebrow') || {}).textContent || '', h2: (document.querySelector('#view .hero h2') || {}).textContent || '' };
    }, [ym, first]);
    if (run(8)) {
      const a = await openDay('2027-03', true);
      const r = a.none ? a : await q(async di => {
        const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
        document.querySelector('#view [data-act="startAltOpen"]').click(); await w(100);
        const pick = document.querySelector('#modal [data-act="altGo"][data-go="pickToday"]'); if (!pick) return { noPick: true };
        pick.click(); await w(150);
        const pv = document.querySelector(`#modal [data-act="pickView"][data-day="${di}"]`); if (!pv) return { noPreview: true };
        pv.click(); await w(150);
        return { eye: (document.querySelector('#view .hero .eyebrow') || {}).textContent || '', h2: (document.querySelector('#view .hero h2') || {}).textContent || '', want: L.activeRoutine().days[di].name, at: L.ui.todayAt || null };
      }, a.di);
      ok(!a.none && a.eye.includes('Mar'), '8. a planned day in March tapped on the calendar says its date', a);
      ok(!r.none && !r.noPick && !r.noPreview && r.h2 === r.want && !r.eye.includes('Mar') && r.at === null, '8. then Change, Pick for me, Preview of the same day: the card shows that day for this week, the March date gone', r);
    }
    if (run(9)) {
      const far = await openDay('2027-10', false), near = await openDay('2026-11', false);
      ok(!far.none && far.eye.includes('2027'), '9. a planned day a year ahead (October 2027) says its year on the card', far);
      ok(!near.none && !near.eye.includes('2026') && /Nov/.test(near.eye), '9. a planned day ahead this year (November) says its date without the year', near);
    }
    ok(!Q.errors.length, '8, 9. no page errors', Q.errors);
    await Q.page.context().close();
  }

  // ---- 10. When the 3D body cannot load, the error log says why for each address tried: its address and its own error
  // (r58 and 2f6a50d kept none, so the only sign was "could not load": fails on both).
  if (run(10)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    // The first address answers "not found" (with the header a server sends, so WebKit reads it as that, not as a refused
    // origin), the second is refused, as a blocked or offline phone sees them. The installed
    // build's own copy (./vendor/) is caught too: WebKit is served the build's files (tests/h.js), so without this it
    // loaded three.js and the case read nothing (GitHub's WebKit run of 93b20b2; Chromium refuses a file page's import).
    let n = 0;
    await Q.page.route(/three(@[\d.]+)?\/build\/three\.module\.min\.js|\/vendor\/three\.module\.min\.js/, r => (n++ === 0 ? r.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'not found' }) : r.abort('connectionrefused')));
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
      L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = []; L.saveNow(); L.ui.tab = 'today'; L.render(); await w(100);
      const before = L.logBuf.length;
      document.querySelector('#view [data-act="mapView"][data-v="3d"]').click();
      for (let i = 0; i < 100 && L.map3d().state !== 'fail'; i++) await w(50);
      return { state: L.map3d().state, urls: L.THREE_URLS, logged: L.logBuf.slice(before).map(e => ({ a: e.a, m: e.m, s: !!e.s })), msg: (document.querySelector('#view .bm3d-msg') || {}).textContent || '' };
    });
    const loads = r.logged.filter(e => e.a === 'load');
    ok(r.state === 'fail' && /could not load/.test(r.msg), '10. with every address for three.js failing, the 3D view says it could not load', r);
    ok(loads.length === r.urls.length && r.urls.every((u, i) => loads[i] && loads[i].m.startsWith(u + ': ') && loads[i].m.length > u.length + 2), '10. the error log has one line for each address tried, in order, each with its address and its own error', r);
    // The browser's own lines about the loads this case blocks (the standalone build's file page and its policy refuse
    // them before the route does) are the case itself; anything else is a page error.
    const own = Q.errors.filter(e => !/three\.module\.min\.js/.test(e));
    ok(!own.length, '10. no page errors', own);
    if (process.env.IRONLOG_FILE) ok(r.urls.length === 1 && r.urls[0] === './vendor/three.module.min.js', '10. the installed build tries only its own copy of three.js, as its policy allows no other', r.urls);
    await Q.page.context().close();
  }

  // ---- 11. A sync request that times out and then fails keeps its own reason in the error log (withTimeout dropped it, so
  // a refused or full copy read only as no answer; r58 and 2f6a50d keep none: fails on both). One that fails in time is
  // passed on as it came, and one that answers in time is not logged.
  if (run(11)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
      if (typeof L.withTimeout !== 'function') return { none: true };
      const later = (ms, v, bad) => new Promise((res, rej) => setTimeout(() => (bad ? rej(v) : res(v)), ms));
      const settle = p => p.then(v => ({ ok: v }), e => ({ err: e }));
      const before = L.logBuf.length;
      const slow = await settle(L.withTimeout(later(300, { code: 'quota_exceeded', message: 'The copy is full' }, true), 100, 'sync-write'));
      const quick = await settle(L.withTimeout(later(20, { code: 'denied', message: 'Refused' }, true), 200, 'sync-read'));
      const fine = await settle(L.withTimeout(later(20, 'done'), 200, 'sync-pull'));
      await w(400);
      return { slow, quick, fine, logged: L.logBuf.slice(before).map(e => [e.a, e.m]) };
    });
    ok(!r.none && r.slow.err && r.slow.err.code === 'timeout', '11. a request with no answer in time fails as a timeout', r);
    ok(!r.none && r.logged.some(([a, m]) => a === 'sync-write' && /The copy is full/.test(m)), '11. its own failure, after the timeout, is in the error log under its area', r);
    ok(!r.none && r.quick.err && r.quick.err.code === 'denied' && r.fine.ok === 'done' && !r.logged.some(([a]) => a === 'sync-read' || a === 'sync-pull'), '11. one that fails in time is passed on as it came, one that answers in time logs nothing', r);
    ok(!r.none && !r.logged.some(([a]) => a === 'promise'), '11. and nothing is left as an unhandled failure (the late one is caught where it is logged)', r.logged);
    ok(!Q.errors.length, '11. no page errors', Q.errors);
    await Q.page.context().close();
    // The same through the sync itself: an account whose writes get no answer for 21 s and then fail as a full copy.
    // The flush gives up at 20 s, as before; the reason that comes after is in the error log (r58 and 2f6a50d lose it).
    const C = await open(FILE, { browser, clock: '2026-10-24T10:00:00', setup: async ctx => ctx.addInitScript(() => {
      window.claude = { use: async k => {
        if (k === 'user') return { id: async () => 'u59' };
        if (k === 'db') return {
          doc: () => ({ get: async () => ({ exists: false, data: () => null }), set: () => new Promise((_, rej) => setTimeout(() => rej({ code: 'quota_exceeded', message: 'The copy is full' }), 21000)) }),
          collection: () => ({ get: async () => ({ docs: [] }) })
        };
        return null;
      } };
    }) });
    const f = await C.page.evaluate(async () => {
      const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
      for (let i = 0; i < 100 && !L.cloudState().on; i++) await w(50);
      L.state.settings.onboarded = true; L.makeDemo(); L.saveNow();
      const t0 = Date.now(); await L.flush(); const took = Date.now() - t0;
      await w(2500);
      return { on: L.cloudState().on, took, status: L.cloudState().status, logged: L.logBuf.map(e => [e.a, e.m]) };
    });
    ok(f.on && f.took >= 19000 && f.logged.some(([a, m]) => a === 'sync-flush' && /timeout|Timed out/.test(m)), '11. the sync, its write unanswered, gives up at 20 s and logs a timeout, as before', { on: f.on, took: f.took, logged: f.logged });
    ok(f.logged.some(([a, m]) => a === 'sync-write' && /The copy is full/.test(m)), '11. and the write\'s own failure, a full copy, is in the error log', f.logged);
    await C.page.context().close();
  }

  // ---- 12. A sign-in the account service refuses keeps its reason in the error log (cloudInit dropped it: the app went on
  // without an account, as it should, with nothing to say why; fails on r58 and 2f6a50d).
  if (run(12)) {
    const C = await open(FILE, { browser, clock: '2026-10-24T10:00:00', setup: async ctx => ctx.addInitScript(() => {
      window.claude = { use: async k => { if (k === 'db') throw new Error('The account service refused the sign-in'); return k === 'user' ? { id: async () => 'u59' } : null; } };
    }) });
    await wait(1500);
    const r = await C.page.evaluate(() => { const L = window.__ironlog; return { on: L.cloudState().on, status: L.cloudState().status, logged: L.logBuf.map(e => [e.a, e.m]) }; });
    ok(!r.on && r.status === 'local', '12. a refused sign-in leaves the app on this phone alone, as before', r);
    ok(r.logged.some(([a, m]) => a === 'auth' && /refused the sign-in/.test(m)), '12. and its reason is in the error log', r);
    await C.page.context().close();
  }

  // ---- 13. Copy my log in (the preview) says in the error log what it could not read: a month of the account's log that
  // would not read was left out of the copy with nothing said (fails on r58 and 2f6a50d).
  if (run(13) && process.env.IRONLOG_FILE) console.log('note r59 section 13 gives the page an account service; the standalone build brings its own, so it runs on the source build');
  else if (run(13)) {
    const C = await open(FILE, { browser, clock: '2026-10-24T10:00:00', setup: async ctx => ctx.addInitScript(() => {
      window.ironlogAuth = { onChange() {}, user() { return Promise.resolve({ id: 'u59', email: 'v@example.com' }); }, signOut() { return Promise.resolve(); }, deleteAccount() { return Promise.resolve(); } };
      window.ironlogLiveDocs = async () => [{ id: 's-2026-10-2', data: { json: '{not json' } }];
    }) });
    await wait(800);
    const r = await C.page.evaluate(async () => {
      const L = window.__ironlog; const before = L.logBuf.length;
      const got = await L.liveLogFetch();
      return { signedIn: !!L.acctUser(), err: got.err ? String(got.err) : null, logged: L.logBuf.slice(before).map(e => [e.a, e.m]) };
    });
    ok(r.signedIn && r.logged.some(([a, m]) => a === 'preview-copy' && m.includes('s-2026-10-2')), '13. a month of the account\'s log that will not read is named in the error log, not left out unsaid', r);
    await C.page.context().close();
  }

  // ---- 14. A cycle's days ahead, worked out by hand (section 4 and tests/coherence.js read them against the app's own
  // projection, which would agree with itself if it were wrong). A cycle of A, B and a rest day: with A done today,
  // November starts on the rest day, then A, B; resting today after B yesterday, it starts on B, then the rest day, A;
  // and a rest week marked ahead holds the cycle where it stands (the next session will start there). Fails on r58,
  // which plans no day ahead on the calendar, and the rest week's case on eb28bd8, which walked the cycle through it.
  if (run(14)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const nov = first => { const out = []; for (let d = 1; d <= 30; d++) { const i = (first + d - 1) % 3; if (i !== 2) out.push([`2026-11-${String(d).padStart(2, '0')}`, i]); } return out; };
    // With the week of Nov 2 a rest week: Nov 1 is the rest day (as above), the cycle waits through Nov 2 to 8, and Nov 9
    // takes the day Nov 2 would have had, A; then B, the rest day, A... (V, 2026-10-25: a cycle is held through a rest week).
    const held = [];
    for (let d = 9; d <= 30; d++) { const i = (d - 9) % 3; if (i !== 2) held.push([`2026-11-${String(d).padStart(2, '0')}`, i]); }
    const cases = [
      // Done A (0) today: tomorrow, Oct 25, is B (1); Nov 1 is 8 days on, (1 + 7) % 3 = 2, the rest day, so Nov 1 is index 2.
      ['A done today', '2026-10-24', 0, nov(2)],
      // B (1) yesterday and the rest day today: Oct 25 is A (0); Nov 1 is 7 days on, 7 % 3 = 1, B.
      ['B yesterday, resting today', '2026-10-23', 1, nov(1)],
      ['A done today, the week of Nov 2 a rest week', '2026-10-24', 0, held, ['2026-11-02']]
    ];
    for (const [name, date, di, want, rest] of cases) {
      const r = await Q.page.evaluate(async ([date, di, rest]) => {
        const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
        L.state.settings.onboarded = true; L.makeDemo();
        const R = L.state.routines.find(r => r.id === L.state.activeRoutineId);
        const [A, B] = R.days.filter(d => !d.rest && d.items.length);
        R.days = [A, B, { id: 'rest59', name: 'Rest', rest: true, items: [] }]; R.schedule = 'cycle';
        const one = JSON.parse(JSON.stringify(L.state.sessions[L.state.sessions.length - 1]));
        Object.assign(one, { id: 'cyc59', date, routineId: R.id, dayId: R.days[di].id, dayIdx: di, dayName: R.days[di].name });
        L.state.sessions = [one]; if (rest) L.state.settings.restWeeks = rest; else delete L.state.settings.restWeeks;
        L.state = L.normalize(L.state); L.invalidate(); L.saveNow();
        L.ui.modal = null; L.ui.tab = 'history'; L.render(); await w(60);
        L.ACT.calOpen({ dataset: { ym: '2026-11' } }); await w(100);
        const got = [...document.querySelectorAll('#modal .cd[data-act="wkGo"]')].map(e => [e.dataset.date, +e.dataset.day]);
        L.ACT.mClose(); await w(50);
        return got;
      }, [date, di, rest || null]);
      ok(JSON.stringify(r) === JSON.stringify(want), `14. a cycle of A, B and a rest day, ${name}: November's planned days, worked out by hand`, { got: r.slice(0, 6), want: want.slice(0, 6), n: [r.length, want.length] });
    }
    ok(!Q.errors.length, '14. no page errors', Q.errors);
    await Q.page.context().close();
  }

  // ---- 15. A weigh-in or measurement being typed is dropped when the unit changes under it (a sync from another device,
  // which redraws Today): kept, "180" typed in lb was saved as 180 kg (eb28bd8, the first build that keeps Today's fields;
  // r58 drew them fresh, so it passes there). The number goes; the field is empty in the new unit.
  if (run(15)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
      L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = []; L.state.settings.unit = 'lb';
      // The last weigh-in a week ago, asked for weekly, so the weigh-in due card shows too.
      L.state.bodyweights = L.state.bodyweights.filter(b => b.date <= '2026-10-17'); L.state.settings.bwEvery = 7; L.saveNow(); L.ui.tab = 'today'; L.render(); await w(100);
      for (const d of document.querySelectorAll('#view details:not([open])')) d.querySelector('summary').click();
      await w(60);
      const set = (id, v) => { const f = document.getElementById(id); if (f) { f.value = v; f.dispatchEvent(new Event('input', { bubbles: true })); } return !!f; };
      const had = { bw: set('bwVal', '180'), due: set('bwDueVal', '181'), arm: set('ms_arm', '15') };
      const n0 = L.state.bodyweights.length, m0 = L.state.measurements.length;
      // Another device switched to kilograms: the pull takes it in and draws Today again.
      L.state.settings.unit = 'kg'; L.invalidate(); L.render(); await w(100);
      const after = { bw: (document.getElementById('bwVal') || {}).value, due: (document.getElementById('bwDueVal') || {}).value, arm: (document.getElementById('ms_arm') || {}).value };
      document.querySelector('#view [data-act="addBW"]:not([data-in])').click(); await w(120);
      document.querySelector('#view [data-act="addMeas"]').click(); await w(120);
      return { had, after, saved: L.state.bodyweights.length - n0, meas: L.state.measurements.length - m0, kg: L.state.bodyweights.filter(b => b.date === '2026-10-24').map(b => b.kg) };
    });
    ok(r.had.bw && r.had.arm && r.had.due, '15. Body and the weigh-in due card were on the page, typed in', r.had);
    ok(r.after.bw === '' && r.after.arm === '' && r.after.due === '' && r.saved === 0 && r.meas === 0, '15. a change of unit while typing leaves the fields empty in the new unit, and nothing is saved in the wrong unit', r);
    ok(!Q.errors.length, '15. no page errors', Q.errors);
    await Q.page.context().close();
  }

  // ---- 16. Found by the second review: Body's date field moves to the new day at midnight. eb28bd8 kept the date as an
  // attribute, which a field once set no longer follows, so the morning after an evening weigh-in it still said
  // yesterday, and Log put the morning's weight over yesterday's, with no Undo (fails on eb28bd8 to 93b20b2; 2f6a50d and
  // r58 redrew the date). A date chosen and not saved is kept through a draw (section 7) but not into a new day.
  if (run(16)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T23:50:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
      const openAll = async () => { for (const d of document.querySelectorAll('#view details:not([open])')) d.querySelector('summary').click(); await w(80); };
      L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = [];
      L.state.bodyweights = L.state.bodyweights.filter(b => b.date < '2026-10-22'); L.saveNow(); L.ui.tab = 'today'; L.render(); await w(100); await openAll();
      // The evening weigh-in, 181, on today, Oct 24; then Oct 22 chosen for another and left unsaved.
      const f = document.getElementById('bwVal'); f.value = '181'; f.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#view [data-act="addBW"]:not([data-in])').click(); await w(150); await openAll();
      const de = document.getElementById('bwDate'); de.value = '2026-10-22'; de.dispatchEvent(new Event('change', { bubbles: true }));
      // The next morning, the page left open; it draws again (More options).
      (() => { const T = '2026-10-25T07:30:00'; const R = Date; const off = new R(T).getTime() - R.now(); class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } } window.Date = D; })();
      document.querySelector('#view [data-act="heroMore"]').click(); await w(120); await openAll();
      const morning = document.getElementById('bwDate').value;
      const f2 = document.getElementById('bwVal'); f2.value = '179.4'; f2.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#view [data-act="addBW"]:not([data-in])').click(); await w(150);
      return { morning, list: L.state.bodyweights.filter(b => b.date >= '2026-10-22').map(b => [b.date, L.fmtW(b.kg)]).sort() };
    });
    ok(r.morning === '2026-10-25', '16. the morning after, Body\'s date reads the new day, not yesterday nor a date chosen last night', r);
    ok(JSON.stringify(r.list) === JSON.stringify([['2026-10-24', '181'], ['2026-10-25', '179.4']]), '16. the morning\'s weigh-in is saved on the morning, and the evening\'s stays as it was', r.list);
    ok(!Q.errors.length, '16. no page errors', Q.errors);
    await Q.page.context().close();
  }

  // ---- 17. The same error over and over is one line in the error log, with how many times it came, so it cannot push an
  // earlier one out (the log keeps 60, a problem report the last 10). The second review: a sign-in that cannot start,
  // now logged (section 12), is tried each time the app comes back to the screen. Fails on 93b20b2 and before.
  if (run(17)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; L.logBuf.length = 0;
      L.log('render', new Error('Cannot read properties of undefined'));
      for (let i = 0; i < 70; i++) L.log('auth', new Error('Network request failed'));
      L.log('sync-pull', new Error('Timed out'));
      L.log('auth', new Error('Network request failed'));
      return { log: L.logBuf.map(e => [e.a, e.m, e.n || 1]), report: L.fbContext({ cat: 'bug', msg: '' }).errors.map(e => e.a) };
    });
    ok(r.log.length === 4 && r.log[0][0] === 'render' && r.log[1][0] === 'auth' && r.log[1][2] === 70 && r.log[2][0] === 'sync-pull' && r.log[3][2] === 1, '17. seventy of one error in a row are one line saying 70; the crash before them stays, and the same error after another starts a line of its own', r.log);
    ok(r.report.includes('render'), '17. a problem report still carries the crash', r.report);
    await Q.page.context().close();
  }

  // ---- 18. The app brought back to the screen on a new day draws again, so Today is today's: opened the morning after an
  // evening weigh-in and typed into at once, with no tap before, Body's date said yesterday on every build to r59's
  // d7423d5, r58 too, and Log put the morning's weight over the evening's, with no Undo (the second review's note).
  // Brought back the same day, it does not draw (nothing typed is touched).
  if (run(18)) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T23:50:00' });
    const r = await Q.page.evaluate(async () => {
      const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
      const openAll = async () => { for (const d of document.querySelectorAll('#view details:not([open])')) d.querySelector('summary').click(); await w(80); };
      L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = [];
      L.state.bodyweights = L.state.bodyweights.filter(b => b.date < '2026-10-22'); L.saveNow(); L.ui.tab = 'today'; L.render(); await w(100); await openAll();
      const f = document.getElementById('bwVal'); f.value = '181'; f.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#view [data-act="addBW"]:not([data-in])').click(); await w(150); await openAll();
      // Back on the screen the same evening, with a weight half typed: nothing is drawn, the text stays.
      const f1 = document.getElementById('bwVal'); f1.value = '18'; document.dispatchEvent(new Event('visibilitychange')); await w(120);
      const sameDay = { same: document.getElementById('bwVal') === f1, text: document.getElementById('bwVal').value };
      f1.value = '';
      // The next morning, the app brought back to the screen; the weight typed at once, nothing tapped before Log.
      (() => { const T = '2026-10-25T07:30:00'; const R = Date; const off = new R(T).getTime() - R.now(); class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } } window.Date = D; })();
      document.dispatchEvent(new Event('visibilitychange')); await w(150);
      const de = document.getElementById('bwDate'), f2 = document.getElementById('bwVal');
      const morning = de ? de.value : null, eyebrow = (document.querySelector('#view .hero .eyebrow') || {}).textContent || '';
      if (f2) { f2.value = '179.4'; f2.dispatchEvent(new Event('input', { bubbles: true })); }
      const log = document.querySelector('#view [data-act="addBW"]:not([data-in])'); if (log) log.click(); await w(150);
      return { sameDay, morning, eyebrow, list: L.state.bodyweights.filter(b => b.date >= '2026-10-22').map(b => [b.date, L.fmtW(b.kg)]).sort() };
    });
    ok(r.sameDay.same && r.sameDay.text === '18', '18. brought back the same day, Today is not drawn again and what is being typed stays', r.sameDay);
    ok(r.morning === '2026-10-25' && /Sun/.test(r.eyebrow), '18. brought back the next morning, Today is drawn for the new day, Body\'s date with it', r);
    ok(JSON.stringify(r.list) === JSON.stringify([['2026-10-24', '181'], ['2026-10-25', '179.4']]), '18. a weigh-in typed at once is saved on the morning, the evening\'s kept', r.list);
    ok(!Q.errors.length, '18. no page errors', Q.errors);
    await Q.page.context().close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
