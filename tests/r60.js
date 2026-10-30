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
//   2  a number typed into a field the log saves when it is left (Settings'
//      time budget, the Set up page's bodyweight) and not yet left keeps
//      its text when the page draws meanwhile; once confirmed, the field
//      shows what was saved (fails on r59, PENDING 345 item 11);
//   3  the update bar says "Update ready" with Update (V, PENDING 335);
//      held by tests/update.js on the installed build, here on the page
//      (fails on r59).
//   4  a set of a lift that takes a load, with no load typed and none in grey,
//      is not ticked by its checkmark or by auto-mark: the load field is
//      focused and marked, "Add the weight first", and the tick is made once
//      the weight is typed; a bodyweight lift, a timed hold and a row with a
//      grey load tick as before (PENDING 344; fails on r59).
//   5  a change made inside another change is part of it (act, re-entrant):
//      one Undo step for the whole, the log saved once at its end, so Undo
//      puts everything back; Settings' Apply with a session in progress, which
//      also re-plans the exercises not started, is undone whole (the full run
//      of r60 in progress: tests/r44.js; fails on r59 for a nested change).
//   6  a tap on a load field, grey or filled, shows its number selected: a
//      digit replaces it, backspace clears it, a second tap places the caret;
//      a grey load tapped and left untouched stays grey; one tap on the
//      checkmark still logs the grey load (V, PENDING 341 a; fails on r59).
//   8  the independent review of r59 and r60 (each fails on r60 as reviewed,
//      f4e3a8d): a tick that waited for its weight is dropped when its reps
//      were cleared meanwhile, never saved as a missed set; Next on a set
//      waiting for its weight keeps the focus on its load field; each tap of
//      the checkmark, and Next taking the grey reps, saves the log once; two
//      tabs on one workout, a load typed in one while the other ticks or
//      unticks a set, both keep both; a save made while another tab's save is
//      not yet heard merges it rather than replacing it; a field focused by
//      code keeps its caret, so the next digit goes there; and a caret moved
//      by an arrow key or End after a tap takes the next digit where it is.
//   9  a load under the empty bar on a lift on the full bar typed as the total
//      (the bench at 0 or 20 lb) is asked about first, Fix it or Log it, on any
//      set, a warm-up included, and when a ticked set is changed to it; the bar
//      is the one in Settings or the exercise's own, in lb and kg; the bar
//      itself and a barbell curl at 20 lb tick at once (V on the r59 preview,
//      2026-10-25, PENDING 353; fails on f4e3a8d and on r59).
//   7  the installed build tries only its own copies of SortableJS and
//      Chart.js, as its policy allows no other address (PENDING 346 c; read
//      from the standalone build, IRONLOG_FILE=dist/index.html; fails on a
//      build made before r60).
const { open, tab, engine, screenOf, screenDiff } = require('./h');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r59.html';
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } else console.log('ok  ', m); return !!c; };
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
  /* Since r64 (V's decision 3, the r63 audit's P-S4-5) a warm-up or drop row has grey reps, held by tests/r64.js
     section 7; r59 had none. The grey number in a warm-up or drop row's reps field is read as none in both, every
     other placeholder exactly: a row's type is its number button's label, read before its fields. */
  const warmGrey = tree => { let cur = null; return tree.map(t => t.replace(/aria-label="Set (\d+) type: (warm-up|drop set|working set)\.|(, set (\d+) (?:reps|seconds)(?: per side)?"[^>]*?placeholder=")(\d*)(")/g, (m, n, kind, pre, sn, g, post) => { if (kind) { cur = { n, wd: kind !== 'working set' }; return m; } return cur && cur.wd && cur.n === sn ? pre + post : m; })); };
  const flat = s => ({ ...s, tree: warmGrey(s.tree.map(noPulse)), text: s.text.replace(/\s+/g, ' ') });
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

  // ---- 2. Text typed and not yet confirmed survives a draw (PENDING 345 item 11).
  if (run(2)) {
    const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const typed = async (sel, text) => { await P.page.focus(sel); await P.page.keyboard.type(text); };
    // Settings' time budget, saved when the field is left.
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.timeBudget = null; L.saveNow(); L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    await wait(200);
    await typed('#view [data-bind="timeBudget"]', '4');
    await ev(() => { window.__ironlog.render(); });
    await wait(80);
    const tb = await ev(() => { const f = document.querySelector('#view [data-bind="timeBudget"]'); return { v: f.value, focused: document.activeElement === f, saved: window.__ironlog.state.settings.timeBudget }; });
    ok(tb.v === '4' && tb.focused && tb.saved == null, '2. Settings: a time budget half typed keeps its text and focus through a draw, saved nothing yet', tb);
    await P.page.keyboard.type('5'); await P.page.keyboard.press('Enter'); await wait(120);
    await ev(() => { window.__ironlog.render(); }); await wait(80);
    const tb2 = await ev(() => { const f = document.querySelector('#view [data-bind="timeBudget"]'); return { v: f.value, saved: window.__ironlog.state.settings.timeBudget }; });
    ok(tb2.v === '45' && tb2.saved === 45, '2. Settings: confirmed, it is saved and the field shows what was saved', tb2);
    // The Set up page's bodyweight on a new install, saved when left.
    await ev(() => { const L = window.__ironlog; L.state.sessions = []; L.state.bodyweights = []; L.state.settings.onboarded = false; L.saveNow(); L.ui.tab = 'today'; L.render(); });
    await wait(200);
    const later = await ev(() => { const b = document.querySelector('#view [data-act="obAcctLater"]'); if (b) b.click(); return !!b; });
    if (later) await wait(150);
    await typed('#obBw', '18');
    await ev(() => { window.__ironlog.render(); });
    await wait(80);
    const bw = await ev(() => { const f = document.getElementById('obBw'); return { v: f && f.value, focused: document.activeElement === f, saved: window.__ironlog.state.bodyweights.length }; });
    ok(bw.v === '18' && bw.focused && bw.saved === 0, '2. Set up: a bodyweight half typed keeps its text and focus through a draw', bw);
    ok(!P.errors.length, '2. no page errors', P.errors);
    await P.page.context().close();
  }

  // ---- 3. The update bar's words (PENDING 335).
  if (run(3)) {
    const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const txt = await P.page.evaluate(() => { window.ironlogUpdateReady(); const b = document.getElementById('updbar'); return b && !b.hidden ? b.innerText.replace(/\s+/g, ' ').trim() : null; });
    ok(txt === 'Update ready Update Later', '3. the update bar reads "Update ready", with Update and Later', txt);
    // The installed app's Guide, Your data (the line shows only in the installed app); read whole, folded or not.
    const guide = await P.page.evaluate(() => { window.IRONLOG_APP = true; window.__ironlog.ACT.guideOpen({ dataset: { g: 'data' } }); const m = document.getElementById('modal'); return m ? m.textContent.replace(/\s+/g, ' ') : ''; });
    ok(guide.includes('Updates: when "Update ready" shows, tap Update.') && !/New version ready|tap Reload/.test(guide), '3. the Guide says to tap Update when "Update ready" shows', (guide.match(/Updates[^.]*\./) || [guide.slice(0, 200)])[0]);
    await P.page.context().close();
  }

  // ---- 4. A tick waits for the weight on a lift that takes one (PENDING 344).
  if (run(4)) {
    const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const sel = (f, b, s) => `#view .sg input[data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
    const tick = (b, s) => P.page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`);
    const typeIn = async (q, text) => { await P.page.focus(q); await P.page.keyboard.type(text); };
    const leave = () => ev(() => { if (document.activeElement) document.activeElement.blur(); });
    // A toast from the case before is put away first, so each case reads its own.
    const quiet = () => ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    const row = (b, s) => ev(([b, s, q]) => { const x = window.__ironlog.state.draft.ex[b].sets[s]; const f = document.querySelector(q); const t = document.getElementById('toast'); return { done: !!x.done, w: x.w, r: x.r, focused: document.activeElement === f, need: !!f && f.classList.contains('need'), grey: f ? f.placeholder : null, toast: t && !t.hidden ? t.innerText.trim() : '' }; }, [b, s, sel('w', b, s)]);
    // A new install's first session: no lift has a history, so no load is suggested.
    await ev(new Function('L', `{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.settings.autoDone=false;L.saveNow();${FREE(['backSquat', 'legPress', 'pullup', 'plank', 'farmerHold'])}L.render();}`));
    await wait(150);
    const pre = await row(0, 0);
    ok(!pre.done && pre.w == null && !/\d/.test(pre.grey), '4. the first squat set has no load typed and none in grey', pre);
    await typeIn(sel('r', 0, 0), '5');
    await quiet(); await tick(0, 0); await wait(120);
    const a = await row(0, 0);
    ok(!a.done && a.toast === 'Add the weight first' && a.focused && a.need, '4. its checkmark does not tick it: the load field is focused and marked, "Add the weight first"', a);
    await P.page.keyboard.type('135'); await leave(); await wait(120);
    const b = await row(0, 0);
    ok(b.done && Math.abs(b.w / 0.45359237 - 135) < 1e-6 && b.r === 5 && !b.need, '4. the weight typed and the field left, the set is ticked at 135 lb x 5, unmarked', b);
    // The set below shows a load in grey (135, or the next sets' adjustment after 5 reps), and ticks with it as before.
    const g = Number((await row(0, 1)).grey);
    await typeIn(sel('r', 0, 1), '5'); await quiet(); await tick(0, 1); await wait(120);
    const c = await row(0, 1);
    ok(g > 0 && c.done && Math.abs(c.w / 0.45359237 - g) < 1e-6 && c.toast !== 'Add the weight first', `4. a row with a grey load (${g} lb) ticks with it, as before`, c);
    // Auto-mark: reps typed and the field left on a lift with no load anywhere.
    await ev(() => { const L = window.__ironlog; L.state.settings.autoDone = true; L.saveNow(); });
    await typeIn(sel('r', 1, 0), '10'); await quiet(); await leave(); await wait(150);
    const d = await row(1, 0);
    ok(!d.done && d.toast === 'Add the weight first' && d.focused && d.need, '4. auto-mark does not tick it either: the load field is focused and marked', d);
    await P.page.keyboard.type('200'); await leave(); await wait(120);
    const e = await row(1, 0);
    ok(e.done && Math.abs(e.w / 0.45359237 - 200) < 1e-6 && !e.need, '4. auto-mark: the weight typed, the set is ticked', e);
    // A bodyweight lift, a bodyweight timed hold and a loaded timed hold keep their rules (no load needed to tick).
    await ev(() => { const L = window.__ironlog; L.state.settings.autoDone = false; L.saveNow(); });
    for (const [bi, n, what] of [[2, '8', 'pull-ups (bodyweight)'], [3, '30', 'a plank (timed)'], [4, '30', 'a farmer hold (timed)']]) {
      await typeIn(sel('r', bi, 0), n); await quiet(); await tick(bi, 0); await wait(120);
      const x = await row(bi, 0);
      ok(x.done && !x.need && x.toast !== 'Add the weight first', `4. ${what} ticks with no load, as before`, x);
    }
    ok(!P.errors.length, '4. no page errors', P.errors);
    await P.page.context().close();
  }

  // ---- 5. A change inside a change is one change (act).
  if (run(5)) {
    const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const r = await P.page.evaluate(() => {
      const L = window.__ironlog; const S = L.state;
      S.settings.onboarded = true; L.makeDemo(); S.sessions.forEach(x => { delete x.demo; }); L.saveNow();
      // Three settings the lifter can set, each to a value other than its own (checked below), so each change is real.
      const read = () => JSON.stringify([L.state.settings.timeBudget, L.state.settings.rirScale, L.state.settings.timerMode]);
      const before = read();
      // Three fields changed in one action, the second through a change of its own, as a moved screen's helper makes one.
      L.act(() => { L.state.settings.timeBudget = 33; L.act(() => { L.state.settings.rirScale = 'rpe'; }, { inProgress: true }); L.state.settings.timerMode = 'manual'; }, { undo: true });
      const mid = read();
      L.ACT.undo();
      const after = read();
      return { before, mid, after };
    });
    ok(r.before === '[null,null,"auto"]' && r.mid === '[33,"rpe","manual"]' && r.after === r.before, '5. Undo of a change with a change inside it puts all of it back', r);
    ok(!P.errors.length, '5. no page errors', P.errors);
    await P.page.context().close();
  }

  // ---- 6. A tap on a load field selects its number (341 a).
  if (run(6)) {
    const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const W = (b, s) => `#view .sg input[data-f="w"][data-b="${b}"][data-s="${s}"]`;
    const field = q => ev(q => { const f = document.querySelector(q); return f && { v: f.value, ph: f.placeholder, a: f.selectionStart, z: f.selectionEnd, focused: document.activeElement === f }; }, q);
    await ev(new Function(`{const L=window.__ironlog;${DEMO}${REAL}${START()}L.state.settings.autoDone=false;L.saveNow();L.render();}`));
    await wait(150);
    // A filled load: the first row's load typed.
    await P.page.fill(W(0, 0), '135'); await ev(q => { const f = document.querySelector(q); f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); f.blur(); }, W(0, 0));
    await P.page.click(W(0, 0)); await wait(60);
    let f = await field(W(0, 0));
    ok(f.focused && f.v === '135' && f.a === 0 && f.z === 3, '6. a tap on a filled load selects its number', f);
    await P.page.keyboard.type('1'); await wait(40);
    f = await field(W(0, 0));
    ok(f.v === '1', '6. a digit typed then replaces it', f);
    await P.page.keyboard.press('Backspace'); await P.page.keyboard.type('140'); await wait(40);
    // A second tap on the focused field places the caret, as a tap does.
    await P.page.click(W(0, 0)); await wait(60);
    f = await field(W(0, 0));
    ok(f.v === '140' && f.a === f.z, '6. a second tap places the caret', f);
    await ev(() => document.activeElement.blur()); await wait(60);
    // A grey load (the second row shows the load above it in grey): a tap shows it selected; left untouched, it stays grey.
    const g0 = await field(W(0, 1));
    await P.page.click(W(0, 1)); await wait(60);
    f = await field(W(0, 1));
    ok(g0.v === '' && /\d/.test(g0.ph) && f.focused && f.v === g0.ph && f.a === 0 && f.z === g0.ph.length, '6. a tap on a grey load shows its number selected', { before: g0, now: f });
    await ev(() => document.activeElement.blur()); await wait(60);
    f = await field(W(0, 1));
    const w1 = await ev(() => window.__ironlog.state.draft.ex[0].sets[1].w);
    ok(f.v === '' && f.ph === g0.ph && w1 == null, '6. left untouched, it stays grey and nothing is typed', { f, w1 });
    // Backspace clears it; left, it is grey again.
    await P.page.click(W(0, 1)); await wait(60); await P.page.keyboard.press('Backspace'); await wait(40);
    f = await field(W(0, 1));
    await ev(() => document.activeElement.blur()); await wait(60);
    const f2 = await field(W(0, 1));
    ok(f.v === '' && f2.v === '' && f2.ph === g0.ph, '6. backspace clears it, and left empty it shows the grey load', { f, f2 });
    // A digit typed over the grey load is the load.
    await P.page.click(W(0, 1)); await wait(60); await P.page.keyboard.type('145'); await ev(() => document.activeElement.blur()); await wait(60);
    const w2 = await ev(() => window.__ironlog.state.draft.ex[0].sets[1].w);
    ok(Math.abs(w2 / 0.45359237 - 145) < 1e-6, '6. a number typed over the grey load is saved as typed', w2);
    // One tap on the checkmark still logs a row on its grey load, and so does a tap on the field then the checkmark.
    const g3 = await field(W(0, 2));
    await P.page.click(W(0, 2)); await wait(60);
    await ev(() => { const x = window.__ironlog.state.draft.ex[0].sets[2]; x.r = 8; });
    await P.page.click('#view [data-act="sDone"][data-b="0"][data-s="2"]'); await wait(120);
    const s3 = await ev(() => { const x = window.__ironlog.state.draft.ex[0].sets[2]; return { w: x.w, done: x.done }; });
    ok(s3.done && Math.abs(s3.w / 0.45359237 - Number(g3.ph)) < 0.06, '6. the field tapped, then the checkmark: the set logs on its grey load', { s3, grey: g3.ph });
    /* Whatever the tap's release does to the selection, the first key does what
       the selection said (GitHub's WebKit run of r60, the engine of every
       iPhone browser: the release put the caret where the tap landed, so 135
       then 1 gave 1135, and 152.5 typed over a grey 135 gave 1152.535). The
       caret is put inside the number after the tap here, as that release did. */
    await ev(() => document.activeElement && document.activeElement.blur()); await wait(60);
    const gq = await ev(() => { const f = [...document.querySelectorAll('#view .sg input[data-f="w"]')].find(x => x.value === '' && /\d{2}/.test(x.placeholder)); return f && `#view .sg input[data-f="w"][data-b="${f.dataset.b}"][data-s="${f.dataset.s}"]`; });
    const g5 = gq && await field(gq);
    if (ok(!!gq, '6. a row with a grey load to type over is on screen')) {
      await P.page.click(gq); await wait(60);
      await ev(q => document.querySelector(q).setSelectionRange(1, 1), gq);
      await P.page.keyboard.type('152.5'); await wait(40);
      f = await field(gq);
      const sg = await ev(q => { const e = document.querySelector(q); return window.__ironlog.state.draft.ex[+e.dataset.b].sets[+e.dataset.s].w; }, gq);
      ok(f.v === '152.5' && Math.abs(sg / 0.45359237 - 152.5) < 1e-6, '6. 152.5 typed over a grey load is 152.5, with the caret moved inside it after the tap', { f, w: sg, grey: g5.ph });
    }
    await ev(() => document.activeElement && document.activeElement.blur()); await wait(60);
    await P.page.click(W(0, 0)); await wait(60);
    await ev(q => document.querySelector(q).setSelectionRange(1, 1), W(0, 0));
    await P.page.keyboard.type('9'); await wait(40);
    f = await field(W(0, 0));
    ok(f.v === '9', '6. a digit typed over a filled load replaces it, with the caret moved inside it after the tap', f);
    await P.page.keyboard.press('Backspace'); await P.page.keyboard.type('140'); await wait(40);
    // A second tap places the caret: the key after it goes there, as in any field.
    await P.page.click(W(0, 0)); await wait(60);
    await ev(q => document.querySelector(q).setSelectionRange(3, 3), W(0, 0));
    await P.page.keyboard.type('5'); await wait(40);
    f = await field(W(0, 0));
    ok(f.v === '1405', '6. after a second tap, a digit goes where the caret is', f);
    // One digit typed over a load is an edit like any: leaving the field sends its change, which checks a load far from last time's.
    await ev(() => document.activeElement && document.activeElement.blur()); await wait(60);
    await ev(() => { window.__chg = []; document.addEventListener('change', e => { if (e.target.matches && e.target.matches('.sg input[data-f="w"]')) window.__chg.push(e.target.value); }, true); });
    await P.page.click(W(0, 0)); await wait(60);
    await P.page.keyboard.type('7'); await wait(40);
    await ev(() => document.activeElement && document.activeElement.blur()); await wait(80);
    const chg = await ev(() => window.__chg);
    ok(chg.length === 1 && chg[0] === '7', '6. one digit typed over a load, then the field left: its change is sent once', chg);
    // Backspace as the first key clears a filled load (as it does a selected one).
    await ev(() => document.activeElement && document.activeElement.blur()); await wait(60);
    await P.page.click(W(0, 0)); await wait(60);
    await ev(q => document.querySelector(q).setSelectionRange(2, 2), W(0, 0));
    await P.page.keyboard.press('Backspace'); await wait(40);
    f = await field(W(0, 0));
    ok(f.v === '', '6. backspace as the first key clears a filled load, wherever the caret is', f);
    ok(!P.errors.length, '6. no page errors', P.errors);
    await P.page.context().close();
  }

  // ---- 8. The independent review of r59 and r60 (each fails on f4e3a8d).
  if (run(8)) {
    const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const sel = (f, b, s) => `#view .sg input[data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
    const tick = (b, s) => P.page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`);
    const leave = () => ev(() => { if (document.activeElement) document.activeElement.blur(); });
    const set = (b, s) => ev(([b, s]) => { const x = window.__ironlog.state.draft.ex[b].sets[s]; return { done: !!x.done, w: x.w, r: x.r }; }, [b, s]);
    const focusOn = () => ev(() => { const a = document.activeElement; return a && a.dataset ? `${a.dataset.f}:${a.dataset.b}:${a.dataset.s}` : ''; });
    // A first session, so no load is suggested; the reps are in grey from the plan.
    await ev(new Function('L', `{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.settings.autoDone=false;L.saveNow();${FREE(['backSquat', 'legPress'])}L.render();}`));
    await wait(150);
    // (a) The checkmark waits for the weight and writes the grey reps; the reps cleared, then a weight typed: no tick.
    await tick(0, 0); await wait(120);
    await P.page.click(sel('r', 0, 0)); await P.page.fill(sel('r', 0, 0), ''); await leave(); await wait(80);
    await P.page.click(sel('w', 0, 0)); await P.page.keyboard.type('135'); await leave(); await wait(150);
    const a = await set(0, 0);
    ok(!a.done && a.r == null && Math.abs(a.w / 0.45359237 - 135) < 1e-6, '8. a tick that waited for its weight, its reps cleared meanwhile: the weight typed does not tick the set (never 135 x 0 as missed)', a);
    // (b) Next on the empty reps of a set with no weight: the focus stays on that set's load.
    await ev(() => { const L = window.__ironlog; L.state.settings.autoDone = true; L.saveNow(); });
    await P.page.click(sel('r', 1, 0)); await P.page.keyboard.press('Enter'); await wait(150);
    const fb = await focusOn();
    await P.page.keyboard.type('200'); await leave(); await wait(150);
    const b0 = await set(1, 0), b1 = await set(1, 1);
    ok(fb === 'w:1:0' && b0.done && Math.abs(b0.w / 0.45359237 - 200) < 1e-6 && b1.w == null, '8. Next on a set waiting for its weight keeps the focus on its load, and the weight typed goes to it', { focus: fb, b0, b1 });
    // (f) A field focused by code (a draw giving the focus back) keeps its caret: the next digit goes there.
    await leave(); await wait(60);
    await ev(q => { const f = document.querySelector(q); f.value = '13'; f.dispatchEvent(new Event('input', { bubbles: true })); f.focus(); f.setSelectionRange(2, 2); }, sel('w', 0, 1));
    await P.page.keyboard.type('5'); await wait(60);
    const ff = await ev(q => document.querySelector(q).value, sel('w', 0, 1));
    ok(ff === '135', '8. a load field focused by code keeps its caret: 13, then 5, is 135', ff);
    // (g) A tap, then End or an arrow key: the next digit goes where the caret went.
    await leave(); await wait(60);
    await P.page.click(sel('w', 0, 1)); await wait(60); await P.page.keyboard.press('End'); await P.page.keyboard.type('0'); await wait(60);
    const g1 = await ev(q => document.querySelector(q).value, sel('w', 0, 1));
    await leave(); await wait(60);
    await P.page.click(sel('w', 0, 1)); await wait(60); await P.page.keyboard.press('ArrowRight'); await P.page.keyboard.press('End'); await P.page.keyboard.type('5'); await wait(60);
    const g2 = await ev(q => document.querySelector(q).value, sel('w', 0, 1));
    ok(g1 === '1350' && g2 === '13505', '8. after a tap, End or an arrow key moves the caret, and the digit goes there', { g1, g2 });
    // (e) A save while another tab's save is not yet heard: merged, not replaced.
    await leave(); await wait(60);
    const e = await ev(() => {
      const L = window.__ironlog;
      const other = JSON.parse(localStorage.getItem('ironlog.v1'));
      other.draft.notes = 'from the other tab';
      // The other tab's save, written where this tab has not heard it yet (a storage event comes a task later, and never to the tab that wrote).
      localStorage.setItem('ironlog.v1', JSON.stringify(other));
      L.state.draft.ex[0].sets[2].w = 100 * 0.45359237;
      L.saveNow();
      return new Promise(res => setTimeout(() => { const s = JSON.parse(localStorage.getItem('ironlog.v1')); res({ notes: s.draft.notes, w: s.draft.ex[0].sets[2].w, mem: L.state.draft.notes }); }, 50));
    });
    ok(e.notes === 'from the other tab' && e.mem === 'from the other tab' && Math.abs(e.w / 0.45359237 - 100) < 1e-6, '8. a save made while another tab\'s save is not yet heard keeps both', e);
    ok(!P.errors.length, '8. no page errors', P.errors);
    await P.ctx.close();
    // (c) Saves per tap, on a workout with history (grey numbers in every row): the checkmark on grey numbers, Next taking the grey reps, an untick.
    {
      const C = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
      await C.page.evaluate(new Function('L', `{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.settings.autoDone=false;L.state.settings.timerMode='off';L.makeDemo();${REAL}${START()}L.render();}`));
      await wait(300);
      const evC = (f, x) => C.page.evaluate(f, x);
      await evC(() => { window.__n = 0; const s = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'ironlog.v1') window.__n++; return s.call(this, k, v); }; });
      const saves = async f => { await evC(() => { window.__n = 0; }); await f(); await wait(700); return evC(() => window.__n); };
      const n1 = await saves(() => C.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'));
      await evC(() => { const L = window.__ironlog; L.state.settings.autoDone = true; L.saveNow(); });
      const n2 = await saves(async () => { await C.page.click(sel('r', 0, 1)); await C.page.keyboard.press('Enter'); });
      await evC(() => { if (document.activeElement) document.activeElement.blur(); });
      const n3 = await saves(() => C.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'));
      const st = await evC(() => window.__ironlog.state.draft.ex[0].sets.slice(0, 2).map(x => !!x.done));
      ok(n1 === 1 && n2 === 1 && n3 === 1 && JSON.stringify(st) === '[false,true]', '8. one save for the checkmark on grey numbers, for Next taking the grey reps, and for an untick', { tick: n1, next: n2, untick: n3, done: st });
      ok(!C.errors.length, '8. saves per tap: no page errors', C.errors);
      await C.ctx.close();
    }
    // (d) Two tabs on one workout: a load typed in one while the other ticks, or unticks, a set; both keep both, and so does storage.
    for (const mode of ['tick', 'untick']) {
      const A = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
      await A.page.evaluate(new Function('L', `{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.settings.autoDone=false;L.state.settings.timerMode='off';L.makeDemo();${REAL}${START()}L.render();}`));
      await wait(300);
      const B = await tab(A, FILE);
      await B.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
      await wait(300);
      if (mode === 'untick') { await B.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(2500); }
      await A.page.click(`#view .sg input[data-f="w"][data-b="1"][data-s="1"]`); await A.page.keyboard.type('70');
      await B.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]');
      await wait(900);
      await A.page.evaluate(() => document.activeElement.blur()); await wait(900);
      const pick = s => s && s.draft ? [s.draft.ex[1].sets[1].w == null ? null : Math.round(s.draft.ex[1].sets[1].w / 0.45359237), !!s.draft.ex[0].sets[0].done] : null;
      const nowOf = pg => pg.evaluate(() => ({ mem: window.__ironlog.state, sto: JSON.parse(localStorage.getItem('ironlog.v1')) }));
      const na = await nowOf(A.page), nb = await nowOf(B.page);
      const want = JSON.stringify([70, mode === 'tick']);
      const got = { A: pick(na.mem), B: pick(nb.mem), stored: pick(na.sto) };
      ok(JSON.stringify(got.A) === want && JSON.stringify(got.B) === want && JSON.stringify(got.stored) === want, `8. two tabs, a load typed in one while the other ${mode}s a set: both tabs and the save keep both`, got);
      ok(!A.errors.length && !B.errors.length, `8. two tabs (${mode}): no page errors`, [...A.errors, ...B.errors]);
      await A.ctx.close();
    }
  }

  // ---- 9. A load under the bar is asked about first (V on the r59 preview, 2026-10-25).
  if (run(9)) {
    const LB = 0.45359237;
    const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const sel = (f, b, s) => `#view .sg input[data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
    const tick = async (b, s) => { await P.page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`); await wait(120); };
    // Typed as a thumb does: the field tapped, its text replaced, then left.
    const type = async (f, b, s, v) => { const q = sel(f, b, s); await P.page.click(q); await P.page.fill(q, ''); await P.page.keyboard.type(String(v)); await ev(() => { if (document.activeElement) document.activeElement.blur(); }); await wait(80); };
    // A set as stored, the question open (its words), and whether its load field has the focus.
    const now = (b, s) => ev(([b, s, q]) => { const L = window.__ironlog; const x = L.state.draft.ex[b].sets[s]; const m = L.ui.modal; return { done: !!x.done, w: x.w, r: x.r, asked: m && m.kind === 'confirm' ? m.body : null, focused: document.activeElement === document.querySelector(q) }; }, [b, s, sel('w', b, s)]);
    // The question answered; on a build that does not ask, there is nothing to answer, and the checks say so.
    const answer = async act => { const q = `#modal [data-act="${act}"]`; if (await P.page.$(q)) await P.page.click(q); await wait(120); };
    const lb = (x, v) => x.w != null && Math.abs(x.w / LB - v) < 1e-9;
    // A barbell bench (on the full bar, typed as the total), a barbell curl, and two more bench blocks.
    await ev(new Function('L', `{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.settings.autoDone=false;L.state.settings.unit='lb';L.state.settings.barKg=null;L.saveNow();${FREE(['bench', 'bbCurl', 'bench', 'bench'])}L.render();}`));
    await wait(150);
    // 0 lb: asked, not ticked; Fix it goes back to the load, the 0 kept as typed.
    await type('w', 0, 0, 0); await type('r', 0, 0, 8); await tick(0, 0);
    let x = await now(0, 0);
    ok(!x.done && /^0 lb is under the 45 lb bar set in Settings\. Log it as typed, or go back and fix it\.$/.test(x.asked || ''), '9. 0 lb on a barbell bench is asked about, not ticked: "0 lb is under the 45 lb bar set in Settings."', x);
    await answer('mAlt'); x = await now(0, 0);
    ok(!x.done && x.focused && x.w === 0 && x.r === 8, '9. Fix it goes back to the load field, the set not ticked, 0 x 8 kept as typed', x);
    // 20 lb (a slip, or a lighter bar not set): asked; Log it logs it as typed.
    await type('w', 0, 0, 20); await tick(0, 0); x = await now(0, 0);
    ok(!x.done && /^20 lb is under the 45 lb bar set in Settings\./.test(x.asked || ''), '9. 20 lb is asked about too', x);
    await answer('mOk'); x = await now(0, 0);
    ok(x.done && lb(x, 20) && x.r === 8, '9. Log it ticks it as typed, 20 lb x 8', x);
    // The bar itself ticks at once.
    await type('w', 0, 1, 45); await type('r', 0, 1, 8); await tick(0, 1); x = await now(0, 1);
    ok(x.done && !x.asked && lb(x, 45), '9. 45 lb, the bar, ticks at once', x);
    // A ticked set whose load is changed to under the bar is asked about again.
    await type('w', 0, 1, 0); x = await now(0, 1);
    ok(/^0 lb is under the 45 lb bar/.test(x.asked || ''), '9. a ticked set changed to 0 lb is asked about', x);
    // Fix it, and the load typed again: the set unticked for the question is ticked again by the fixed load (r55's review).
    await answer('mAlt'); await type('w', 0, 1, 45); x = await now(0, 1);
    ok(x.done && lb(x, 45) && x.r === 8 && !x.asked, '9. Fix it and 45 lb typed again: the set is ticked again, 45 lb x 8', x);
    // A warm-up on the full bar is never lighter than the bar either (on the last bench, whose working sets are all still to do, so it stays open).
    await ev(() => { const L = window.__ironlog; L.state.draft.ex[3].sets[2].warm = true; L.saveNow(); L.render(); }); await wait(100);
    await type('w', 3, 2, 0); await type('r', 3, 2, 10); await tick(3, 2); x = await now(3, 2);
    ok(!x.done && /^0 lb is under the 45 lb bar/.test(x.asked || ''), '9. a warm-up at 0 lb on the bench is asked about', x);
    await answer('mAlt');
    // A barbell curl is often on an EZ or fixed bar lighter than the one in Settings: 20 lb ticks at once.
    await type('w', 1, 0, 20); await type('r', 1, 0, 10); await tick(1, 0); x = await now(1, 0);
    ok(x.done && !x.asked && lb(x, 20), '9. a barbell curl at 20 lb ticks at once (an EZ or fixed bar is often lighter)', x);
    // A lighter bar set in Settings is the one read: 35 lb ticks, 30 is asked about.
    await ev(() => { const L = window.__ironlog; L.state.settings.barKg = 35 * 0.45359237; L.saveNow(); L.render(); }); await wait(100);
    await type('w', 2, 0, 35); await type('r', 2, 0, 8); await tick(2, 0); x = await now(2, 0);
    ok(x.done && !x.asked && lb(x, 35), '9. with a 35 lb bar in Settings, 35 lb ticks at once', x);
    await type('w', 2, 1, 30); await type('r', 2, 1, 8); await tick(2, 1); x = await now(2, 1);
    ok(!x.done && /^30 lb is under the 35 lb bar set in Settings\./.test(x.asked || ''), '9. and 30 lb is asked about: "30 lb is under the 35 lb bar"', x);
    await answer('mAlt');
    // In kilograms with no bar set, the bar is 20 kg: 15 is asked about, 20 ticks.
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'kg'; L.state.settings.barKg = null; L.saveNow(); L.render(); }); await wait(100);
    await type('w', 3, 0, 15); await type('r', 3, 0, 8); await tick(3, 0); x = await now(3, 0);
    ok(!x.done && /^15 kg is under the 20 kg bar set in Settings\./.test(x.asked || ''), '9. in kilograms, 15 kg is asked about: "15 kg is under the 20 kg bar"', x);
    await answer('mAlt');
    await type('w', 3, 0, 20); await tick(3, 0); x = await now(3, 0);
    ok(x.done && !x.asked && Math.abs(x.w - 20) < 1e-9, '9. and 20 kg ticks at once', x);
    // A bar of its own set on the exercise (its editor's Bar for this lift) is the one read, and named as its own.
    await ev(() => { const L = window.__ironlog; const e = L.state.exercises.find(e => e.id === 'bench'); e.barKg = 15; L.invalidate(); L.saveNow(); L.render(); }); await wait(100);
    await type('w', 3, 1, 10); await type('r', 3, 1, 8); await tick(3, 1); x = await now(3, 1);
    ok(!x.done && /^10 kg is under this lift's 15 kg bar\./.test(x.asked || ''), "9. with a 15 kg bar on the exercise, 10 kg is asked about: \"10 kg is under this lift's 15 kg bar\"", x);
    await answer('mAlt');
    await type('w', 3, 1, 15); await tick(3, 1); x = await now(3, 1);
    ok(x.done && !x.asked && Math.abs(x.w - 15) < 1e-9, '9. and 15 kg, its bar, ticks at once', x);
    ok(!P.errors.length, '9. no page errors', P.errors);
    await P.page.context().close();
  }

  // ---- 7. The installed build's library addresses (346 c).
  if (run(7)) {
    if (!process.env.IRONLOG_FILE) console.log('note r60 section 7 reads the standalone build; it runs with IRONLOG_FILE');
    else {
      const page = require('fs').readFileSync(process.env.IRONLOG_FILE, 'utf8');
      const list = lib => { const m = page.match(new RegExp(`loadScript\\(\\[([^\\]]*)\\],ok=>\\{window\\.__libs\\.${lib}=`)); return m ? m[1].split(',').map(x => x.trim().replace(/^'|'$/g, '')) : null; };
      const so = list('sortable'), ch = list('chart');
      ok(JSON.stringify(so) === '["vendor/Sortable.min.js"]' && JSON.stringify(ch) === '["vendor/chart.umd.js"]', '7. the installed build loads SortableJS and Chart.js from its own copies alone', { so, ch });
      const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
      const libs = await P.page.evaluate(() => ({ ...window.__libs, sortable: !!window.Sortable, chart: !!window.Chart }));
      ok(libs.sortable && libs.chart, '7. and both load there', libs);
      await P.page.context().close();
    }
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
