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
//      fields as a fresh card shows them, now that the fields are kept.
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
  /* The visible text is read with its spaces and line breaks left out (every text node is held exactly by the
     elements): how text reads at a line wrap differs by engine (r58's WebKit run). */
  /* The 3D body's loading line, hidden once it has loaded, is left out of both: r58 drew the card fresh, so
     its hidden line kept "Loading the 3D body" until the next draw, and r59 keeps the card and clears it. */
  /* The calendar's days ahead and its Next month (329, held by section 4) are left out of both: r58 left days
     ahead blank and stopped at this month. The days before them are held exactly. */
  const ahead = t => t.replace(/<(span|button)[^>]*class="cd fut[^"]*"[^>]*><span class="n">"\d+"<\/span><span class="x"><\/span><\/\1>/g, '(a day ahead)').replace(/(aria-label="Next month"[^>]*) p-disabled="(true|false)"/g, '$1');
  const flat = s => ({ ...s, tree: s.tree.map(t => ahead(t.replace(/(<p class="bm3d-msg muted small" hidden="">)"Loading the 3D body"(<\/p>)/g, '$1$2'))), text: s.text.replace(/\s+/g, '') });
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
  if (run(3)) {
    const r = await ev(async () => {
      const L = window.__ironlog; L.ui.tab = 'today'; L.render(); await new Promise(r => setTimeout(r, 60));
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
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
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      document.getElementById('bwDate').value = '2026-10-20'; document.getElementById('bwVal').value = '179.6';
      document.querySelector('#view [data-act="addBW"]:not([data-in])').click(); await new Promise(r => setTimeout(r, 120));
      const bw = { val: document.getElementById('bwVal').value, date: document.getElementById('bwDate').value, saved: L.state.bodyweights.some(b => b.date === '2026-10-20' && Math.abs(L.fmtW(b.kg) - 179.6) < 0.05) };
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
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

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
