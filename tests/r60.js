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
//   7  the installed build tries only its own copies of SortableJS and
//      Chart.js, as its policy allows no other address (PENDING 346 c; read
//      from the standalone build, IRONLOG_FILE=dist/index.html; fails on a
//      build made before r60).
const { open, engine, screenOf, screenDiff } = require('./h');
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
