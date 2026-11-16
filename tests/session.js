// The session screen, checked against its written rules (CA-1; the spec "The session screen", L-1 to L-44, in the
// project's claude/ironlog-spec-session.md, built from the code: workout.ts, worksets.ts, worktaps.ts, workfields.ts,
// workfinish.ts, timer.ts, actsstart.ts, actspick.ts and session.ts, V's rulings deciding, and where neither does, what a lifter
// expects). A feature suite: each section is one rule, a lifter's log seeded, the workout started from Today's card
// and driven by taps and typing as a lifter drives it, and what the screen shows and the log then holds compared with
// what the rule gives, with the rule's numbers and the app's own words. A failure names its rule. Each rule was changed
// in a copy of the page to show its check fails there (PENDING, CA-1). The targets themselves are tests/progression.js's
// (P-1 to P-37); saving and sync tests/storage-sync.js's. SESSION_ONLY=L-1,L-5 runs some rules.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.SESSION_ONLY ? process.env.SESSION_ONLY.split(',') : null;
const run = id => !ONLY || ONLY.includes(id);
// A moved check named by its rule.
const okAs = rule => (c, m, x) => ok(c, `${rule}: ${m}`, x);
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-11';
const LB = 0.45359237;

// The rules' numbers, from the spec (each the code's, named where it lives).
const BAR_STEP_LB = 10; // L-8, the bench's load step in lb (formulas.ts, the barbell's step)
const DROP_START = 0.75; // L-11, formulas.ts DROP_START
const ADD_S = 15; // L-16, timer.ts ADD_S
const REST_BENCH = 120, REST_RAISE = 60; // L-15, the plan's rest seconds, seeded below

// What the screen holds, read as a lifter reads it.
const TOAST = () => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText.replace(/\s+/g, ' ').replace(/ Undo$/, '').trim() : ''; };
const TOAST_LOG = () => {
  window.__toasts = [];
  const hook = () => {
    const el = document.getElementById('toast');
    if (!el) { setTimeout(hook, 20); return; }
    const note = () => {
      if (el.hidden) return;
      const t = el.innerText.replace(/\s+/g, ' ').replace(/ Undo$/, '').trim(), last = window.__toasts[window.__toasts.length - 1];
      if (t && t !== last) window.__toasts.push(t);
    };
    // A message the app showed as it started, before this watch began, is taken as it stands: the standalone build
    // and WebKit start the app before the first look for the box, and the message then never changes for the watch
    // to see (NEW-143, L-19's removal message).
    note();
    new MutationObserver(note).observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
  };
  hook();
};
// One exercise's rows: each row's load and reps as the fields show them (typed, or grey as "~n"), and whether ticked,
// a warm-up or a drop set.
const ROWS = b => [...document.querySelectorAll(`#view .sg`)].filter(r => r.querySelector(`[data-act="sDone"][data-b="${b}"]`)).map(r => {
  const w = r.querySelector('input[data-f="w"]'), rr = r.querySelector('input[data-f="r"]');
  const v = f => (!f ? null : f.value !== '' ? f.value : f.placeholder ? '~' + f.placeholder : '');
  return { w: v(w), r: v(rr), done: r.classList.contains('done'), warm: r.classList.contains('warm'), drop: r.classList.contains('drop') };
});

/* A lifter in lb on one day of a routine ("Push": bench 3 x 6 to 10, rest 120 s; lateral raise 2 x 10 to 15, rest
   60 s; o.items replaces them), with last week's session (bench 185 x 8, 8, 7; raises 20 x 12, 12) unless o.fresh.
   o.settings sets settings; o.seed (S, L) changes anything else first. */
async function lifter(o = {}) {
  const items = o.items || [['bench', 3, 6, 10, REST_BENCH], ['dbLateral', 2, 10, 15, REST_RAISE]];
  // o.movable: a clock the check moves (window.__setClock), from 10:00 on the day, as a lifter's day goes on. A page
  // loaded again, an app closed and opened on a later day, is given its time by an init script the check adds before
  // the reload (L-19's reopen), run after this one: a value handed to the script, not storage (in this harness an init
  // script that read localStorage as a page reloaded sometimes gave that page an empty storage) and not the tab's name
  // (WebKit gave the reloaded page none, so it opened on the first day: GitHub's WebKit run of 2.59, NEW-143).
  const T0 = JSON.stringify((o.day || DAY) + 'T10:00:00');
  const MOVABLE = `(()=>{const R=Date;let off=new R(${T0}).getTime()-R.now();window.__setClock=t=>{off=new R(t).getTime()-R.now();};class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`;
  const P = await open(FILE, { browser: o.browser, w: o.w || 390, h: 844, clock: o.movable ? undefined : (o.day || DAY) + 'T10:00:00', setup: async ctx => { if (o.movable) await ctx.addInitScript(MOVABLE); await ctx.addInitScript(TOAST_LOG); } });
  P.ev = (f, a) => P.page.evaluate(f, a);
  await P.ev(([items, o, LB]) => {
    const L = window.__ironlog; const S = L.state;
    S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.lastExport = '2026-11-11';
    Object.assign(S.settings, o.settings || {});
    const its = (list, p) => list.map(([exId, sets, repMin, repMax, rest], k) => ({ uid: p + k, exId, sets, repMin, repMax, rir: 2, rest, ss: null }));
    // o.more: further days of the routine, as [name, items].
    S.routines = [{ id: 'R1', name: 'Mine', schedule: 'cycle', days: [{ id: 'A', name: 'Push', rest: false, items: its(items, 'i') }, ...(o.more || []).map(([name, list], k) => ({ id: 'D' + k, name, rest: false, items: its(list, 'd' + k + '-') }))] }];
    S.activeRoutineId = 'R1';
    S.sessions = o.fresh ? [] : [{ id: 'last', date: '2026-11-07', dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [
      { exId: 'bench', rr: [6, 10], ps: 3, sets: [[185, 8], [185, 8], [185, 7]].map(([w, r]) => ({ w: w * LB, r, rir: 2, done: true })) },
      { exId: 'dbLateral', rr: [10, 15], ps: 2, sets: [[20, 12], [20, 12]].map(([w, r]) => ({ w: w * LB, r, rir: 2, done: true })) }] }];
    // eslint-disable-next-line no-new-func
    if (o.seed) new Function('return ' + o.seed)()(S, L);
    // Read as the app reads a log it opens: cleaned, and each machine session that names no machine named as it reads
    // (a build before 2.70 names none, and one run to show a check fails there reads the log as it did).
    L.state = L.normalize(S);
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
  }, [items, { settings: o.settings, fresh: !!o.fresh, seed: o.seed ? String(o.seed) : '', more: o.more || [] }, LB]);
  await wait(100);
  P.rows = b => P.ev(ROWS, b);
  P.toast = () => P.ev(TOAST);
  P.toasts = () => P.ev(() => window.__toasts.slice());
  P.draft = () => P.ev(() => window.__ironlog.state.draft);
  P.stored = () => P.ev(() => JSON.parse(localStorage.getItem('ironlog.v1')));
  P.modal = () => P.ev(() => { const m = window.__ironlog.ui.modal; const el = document.querySelector('#modal .sheet'); return m ? { kind: m.kind, title: m.title || '', text: el ? el.innerText.replace(/\s+/g, ' ') : '', buttons: el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()) : [] } : null; });
  P.tap = async (sel, ms = 200) => { await P.page.click(sel); await wait(ms); };
  P.close = () => P.browser.close();
  return P;
}
// The day started from Today's card, as a lifter starts it.
async function start(P) { await P.page.click('#tabs [data-tab="today"]'); await wait(120); await P.tap('#view .hero [data-act="startSession"]:not([data-light])', 300); }
const tick = (b, s) => `#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`;
const field = (f, b, s) => `#view input[data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
/* A machine added in the open Machine sheet (2.70, NEW-168): Add a machine, its name typed (none given, none typed),
   then Add. */
async function addMachine(P, name = '') {
  await P.tap('#modal [data-act="machineNaming"][data-k="new"]', 250);
  if (name) await P.page.fill('#mcName', name);
  await P.tap('#modal [data-act="machineNameSave"]', 300);
}
// A row's button by its action, for exercise b's row s (or the exercise's own when s is null).
const btn = (act, b, s) => `#view [data-act="${act}"][data-b="${b}"]${s == null ? '' : `[data-s="${s}"]`}`;
// A lift's weights switched as a lifter does it: its badge opens its sheet, and the unit is picked there (L-38).
const toUnit = async (X, b, to) => { await X.tap(`#view [data-act="unitOpen"][data-b="${b}"]`, 250); await X.tap(`#modal [data-act="liftUnit"][data-v="${to}"]`, 300); };
// The confirm sheet's buttons, as the lifter taps them.
const mOk = P => P.tap('#modal [data-act="mOk"]', 250);
const mAlt = P => P.tap('#modal [data-act="mAlt"]', 250);

(async () => {
  /* ---------- L-1: Today's Start starts the day: its exercises, the plan's sets, the targets in grey ---------- */
  if (run('L-1')) {
    const P = await lifter();
    await start(P);
    const d = await P.draft();
    ok(d && d.ex.map(b => b.exId).join() === 'bench,dbLateral', 'L-1: the day\'s exercises, in the plan\'s order', d && d.ex.map(b => b.exId));
    const b0 = await P.rows(0), b1 = await P.rows(1);
    ok(b0.length === 3 && b1.length === 2, 'L-1: each with the plan\'s sets (3 and 2)', [b0.length, b1.length]);
    ok(b0.every(r => r.w === '~185') && b0.map(r => r.r).join() === '~8,~8,~7' && b1.every(r => r.w === '~20' && r.r === '~12'), 'L-1: every row shows the target in grey: last time\'s load and reps to beat (P-8)', { b0, b1 });
    ok(b0.concat(b1).every(r => !r.done), 'L-1: nothing is ticked yet');
    await P.close();
  }

  /* ---------- L-2: one workout in progress at a time ---------- */
  if (run('L-2')) {
    const P = await lifter();
    await start(P);
    const id = (await P.draft()).id;
    await P.tap('#tabs [data-tab="history"]', 150); await P.tap('#tabs [data-tab="today"]', 200);
    ok(await P.ev(id => !!document.querySelector('#view [data-act="sDone"]') && window.__ironlog.state.draft.id === id, id), 'L-2: while it is in progress, Today shows the workout itself', await P.ev(() => document.getElementById('view').innerText.slice(0, 120)));
    await P.ev(() => window.__ironlog.ACT.startSession({ dataset: { day: '0', light: '0' } })); await wait(250);
    ok((await P.draft()).id === id && (await P.toasts()).includes('Your workout in progress is open. Finish or discard it first.'), 'L-2: starting another opens the one in progress and says "Your workout in progress is open. Finish or discard it first."', await P.toasts());
    await P.close();
  }

  /* ---------- L-3: the workout survives the app closing, everything typed with it ---------- */
  if (run('L-3')) {
    const P = await lifter();
    await start(P);
    await P.page.fill(field('w', 0, 0), '190'); await P.page.fill(field('r', 0, 0), '9'); await P.tap(tick(0, 0));
    await P.page.fill(field('r', 0, 1), '7'); await wait(600);
    await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(300);
    if (!(await P.ev(() => !!document.querySelector('#view [data-act="sDone"]')))) await start(P);
    const r = await P.rows(0);
    ok(r[0].w === '190' && r[0].r === '9' && r[0].done && r[1].r === '7' && !r[1].done, 'L-3: reopened, the ticked set and the reps typed on the next are there as they were', r);
    await P.close();
  }

  /* ---------- L-4: backing out keeps the workout, and Today resumes it ---------- */
  if (run('L-4')) {
    const P = await lifter();
    await start(P);
    await P.tap(tick(0, 0));
    const away = await P.ev(() => { const b = document.querySelector('#view [data-act="wkAway"]'); return b ? b.textContent.trim() : null; });
    ok(away === 'Save for later', 'L-4: the button to step away from the workout reads "Save for later" (V, 2026-11-13: it read "Save and leave")', away);
    await P.tap('#view [data-act="wkAway"]', 300);
    ok((await P.toasts()).includes('Saved. Resume it from Today.') && (await P.ev(() => window.__ironlog.ui.tab)) === 'today', 'L-4: backing out says "Saved. Resume it from Today." and goes to Today', await P.toasts());
    await P.tap('#view .hero [data-act="startSession"], #view .hero [data-act="wkResume"]', 300);
    const r = await P.rows(0);
    ok(r.length === 3 && r[0].done, 'L-4: Resume opens it with its ticked set', r);
    await P.close();
  }

  /* ---------- L-5: a tick takes the grey numbers as the set's own ---------- */
  if (run('L-5')) {
    const P = await lifter();
    await start(P);
    await P.tap(tick(0, 0));
    const s = (await P.draft()).ex[0].sets[0];
    ok(s.done && Math.abs(s.w - 185 * LB) < 0.01 && s.r === 8, 'L-5: ticking a grey row saves its grey load and reps as the set\'s own (185 x 8)', s);
    ok((await P.rows(0))[0].w === '185' && (await P.rows(0))[0].r === '8', 'L-5: the row then shows them as numbers, not grey', (await P.rows(0))[0]);
    const st = await P.stored();
    ok(st.draft.ex[0].sets[0].done === true, 'L-5: and the tick is saved on the phone (S-1)');
    await P.close();
  }

  /* ---------- L-6: a set needs reps, and a loaded lift a load ---------- */
  if (run('L-6')) {
    const P = await lifter({ fresh: true });
    await start(P);
    const r = await P.rows(0);
    await P.tap(tick(0, 0));
    ok(!(await P.draft()).ex[0].sets[0].done && (await P.toasts()).includes('Add the weight first'), 'L-6: a loaded lift with no load anywhere is not ticked: "Add the weight first"', { r, t: await P.toasts() });
    ok(await P.ev(() => { const a = document.activeElement; return !!a && a.dataset.f === 'w' && a.dataset.b === '0' && a.dataset.s === '0'; }), 'L-6: and its load field is focused, to type the weight there');
    // The weight typed and the field left (Next or a tap elsewhere): the tick waiting is made, with the grey reps.
    await P.page.fill(field('w', 0, 0), '135'); await P.page.dispatchEvent(field('w', 0, 0), 'change'); await wait(300);
    const s0 = (await P.draft()).ex[0].sets[0];
    ok(s0.done && Math.abs(s0.w - 135 * LB) < 0.01 && s0.r === 6, 'L-6: typing the weight there ticks the set, with the grey reps (6, the bottom of a first range)', s0);
    await P.close();
  }

  /* ---------- L-7: unticking puts the grey numbers back ---------- */
  if (run('L-7')) {
    const P = await lifter();
    await start(P);
    await P.tap(tick(0, 0)); await P.tap(tick(0, 0));
    const s = (await P.draft()).ex[0].sets[0], r = (await P.rows(0))[0];
    ok(!s.done && s.w == null && s.r == null && r.w === '~185' && r.r === '~8', 'L-7: unticked, a set that took the grey numbers shows them in grey again, nothing typed left', { s, r });
    await P.page.fill(field('w', 0, 1), '190'); await P.tap(tick(0, 1)); await P.tap(tick(0, 1));
    const s1 = (await P.draft()).ex[0].sets[1];
    ok(!s1.done && Math.abs(s1.w - 190 * LB) < 0.01, 'L-7: a load the lifter typed stays when the set is unticked', s1);
    await P.close();
  }

  /* ---------- L-8: minus and plus step the load along the lift's loads, and reps by one; they never tick ---------- */
  if (run('L-8')) {
    const P = await lifter();
    await start(P);
    await P.tap(`${btn('sStep', 0, 0)}[data-sf="w"][data-d="1"]`);
    let r = (await P.rows(0))[0];
    ok(r.w === String(185 + BAR_STEP_LB) && !r.done, `L-8: plus on the load: one step of the bar's ${BAR_STEP_LB} lb (195), not ticked`, r);
    await P.tap(`${btn('sStep', 0, 0)}[data-sf="w"][data-d="-1"]`); await P.tap(`${btn('sStep', 0, 0)}[data-sf="w"][data-d="-1"]`);
    r = (await P.rows(0))[0];
    ok(r.w === String(185 - BAR_STEP_LB), 'L-8: minus twice from there: 175', r);
    await P.tap(`${btn('sStep', 0, 0)}[data-sf="r"][data-d="1"]`);
    r = (await P.rows(0))[0];
    ok(r.r === '9' && !r.done, 'L-8: plus on the reps: one more than the grey 8, not ticked', r);
    await P.close();
  }

  /* ---------- L-9: + Set and − Set ---------- */
  if (run('L-9')) {
    // Auto-mark off here, so leaving a field ticks nothing (L-10 checks auto-mark).
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await P.tap(tick(0, 0));
    await P.tap(btn('sAdd', 0));
    let r = await P.rows(0);
    ok(r.length === 4 && r[3].w === '~185' && !r[3].done, '+ Set adds a row with the last working set\'s load in grey (L-9)', r);
    await P.tap(btn('sDel', 0));
    r = await P.rows(0);
    ok(r.length === 3 && !(await P.modal()) && !(await P.toasts()).some(t => /removed/.test(t)), 'L-9: − Set takes an empty last row off at once, with nothing to say', { n: r.length, t: await P.toasts() });
    // − Set takes the last row with nothing typed, wherever it is, so typed numbers are kept; with every row holding
    // something, it asks about the last one not ticked.
    await P.page.fill(field('r', 0, 2), '6'); await wait(500);
    await P.tap(btn('sDel', 0));
    r = await P.rows(0);
    ok(r.length === 2 && r[1].r === '6' && !(await P.modal()), 'L-9: with a blank row above a typed one, − Set takes the blank one and keeps the typed reps', r);
    await P.tap(btn('sAdd', 0)); await P.page.fill(field('r', 0, 2), '5'); await wait(500);
    await P.tap(btn('sDel', 0));
    const m = await P.modal();
    ok(m && m.title === 'Remove set 3?' && /typed, not ticked/.test(m.text), 'L-9: with every row holding something, it asks first: "Remove set 3?"', m);
    await mOk(P);
    ok((await P.rows(0)).length === 2 && (await P.toasts()).includes('Set removed'), 'L-9: then takes it off: "Set removed", with Undo', await P.toasts());
    await P.tap('#toast button', 250);
    r = await P.rows(0);
    ok(r.length === 3 && r[2].r === '5', 'L-9: Undo puts it back with its reps', r);
    await P.tap(btn('sDel', 0)); await mOk(P); await P.tap(btn('sDel', 0));
    const m1 = await P.modal();
    ok(m1 && m1.title === 'Remove set 2?' && m1.text.includes('Barbell Bench Press: 185×6, typed, not ticked.'), 'L-9: the question names the set as the row shows it, its grey load with its reps (185×6, NEW-128)', m1);
    await P.tap('#modal [data-act="mClose"]', 200);
    await P.tap(tick(0, 1)); await P.tap(btn('sDel', 0));
    const m2 = await P.modal();
    ok(m2 && m2.title === 'Remove set 2?' && m2.text.includes('185×6, logged.'), 'L-9: with every row ticked it asks about the last: "logged"', m2);
    await mOk(P);
    ok((await P.toasts()).includes('Logged set removed'), 'L-9: and says "Logged set removed"', await P.toasts());
    await P.close();
    // A first session of a lift: reps typed and no load anywhere, typed or grey. The question names the reps alone,
    // never a load of 0 the row does not show (REV12-5).
    const Q = await lifter({ fresh: true, settings: { autoDone: false } });
    await start(Q);
    for (const k of [0, 1, 2]) await Q.page.fill(field('r', 0, k), '5');
    await Q.page.press(field('r', 0, 2), 'Tab'); await wait(300);
    await Q.tap(btn('sDel', 0), 250);
    const m3 = await Q.modal();
    ok(m3 && m3.title === 'Remove set 3?' && m3.text.includes('Barbell Bench Press: 5 reps, typed, not ticked.') && !/0×/.test(m3.text), 'L-9: with no load anywhere, the question names the reps alone: "5 reps, typed, not ticked" (REV12-5)', m3);
    await Q.close();
  }

  /* ---------- L-10: auto-mark: a row with its load and reps is ticked when the reps field is left ---------- */
  if (run('L-10')) {
    const P = await lifter();
    ok(await P.ev(() => window.__ironlog.state.settings.autoDone === true), 'L-10: auto-mark is on for a new phone');
    await start(P);
    await P.page.fill(field('r', 0, 0), '9'); await P.page.dispatchEvent(field('r', 0, 0), 'change'); await wait(300);
    let s0 = (await P.draft()).ex[0].sets[0];
    ok(s0.done && s0.r === 9 && Math.abs(s0.w - 185 * LB) < 0.01, 'L-10: reps typed and the field left: the set is ticked, with the grey load', s0);
    await P.close();
    const Q = await lifter({ settings: { autoDone: false } });
    await start(Q);
    await Q.page.fill(field('r', 0, 0), '9'); await Q.page.dispatchEvent(field('r', 0, 0), 'change'); await wait(300);
    s0 = (await Q.draft()).ex[0].sets[0];
    ok(!s0.done && s0.r === 9, 'L-10: with auto-mark off, the reps are kept and nothing is ticked', s0);
    await Q.close();
    /* Reps put in by minus and plus are the set's reps as if typed: the field left as it is, or the same number typed
       again (which fires no change), ticks the set, as leaving a field with its grey reps does. Before, only a new
       number ticked it, so after plus the set stayed unticked however the lifter left the field. */
    for (const how of ['left', 'retyped', 'next']) {
      const X = await lifter();
      await start(X);
      await X.tap('#view [data-act="sStep"][data-b="0"][data-sf="r"][data-d="1"]', 250);
      await X.page.click(field('r', 0, 0)); await wait(120);
      if (how === 'retyped') { await X.page.keyboard.press('Control+A'); await X.page.keyboard.type('9'); }
      if (how === 'next') await X.page.keyboard.press('Enter');
      else await X.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await wait(300);
      const x0 = (await X.draft()).ex[0].sets[0];
      ok(x0.done && x0.r === 9 && Math.abs(x0.w - 185 * LB) < 0.01, `L-10: reps set to 9 by plus, then the field ${how === 'left' ? 'left as it is' : how === 'retyped' ? 'given 9 again and left' : 'left by Next'}: the set is ticked at 9`, x0);
      await X.close();
    }
  }

  /* ---------- L-11: a row's mark: working, warm-up, drop set; a warm-up counts for nothing and starts no rest ---------- */
  if (run('L-11')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    const kind = async () => (await P.draft()).ex[0].sets[0];
    await P.tap(btn('sWarm', 0, 0)); let k = await kind();
    ok(k.warm && !k.drop, 'L-11: one tap on the mark makes the row a warm-up', k);
    await P.tap(btn('sWarm', 0, 0)); k = await kind();
    ok(!k.warm && k.drop, 'L-11: a second makes it a drop set', k);
    await P.tap(btn('sWarm', 0, 0)); k = await kind();
    ok(!k.warm && !k.drop, 'L-11: a third makes it a working set again', k);
    await P.tap(btn('sWarm', 0, 0));
    await P.page.fill(field('w', 0, 0), '95'); await P.page.fill(field('r', 0, 0), '10'); await P.tap(tick(0, 0));
    const t = await P.ev(() => ({ end: window.__ironlog.timer.end, now: Date.now(), done: window.__ironlog.state.draft.ex[0].sets[0].done }));
    ok(t.done && !(t.end > t.now), 'L-11: a warm-up ticked starts no rest', t);
    await P.tap(tick(0, 1)); await P.tap(tick(0, 2));
    await P.tap('#view [data-act="finish"]', 300);
    while (await P.modal()) { const m = await P.modal(); if (m.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } }
    const saved = (await P.ev(() => window.__ironlog.state.sessions.find(x => x.date === '2026-11-11')));
    ok(saved && saved.ex[0].sets.filter(x => x.warm).length === 1 && saved.ex[0].sets.filter(x => !x.warm).length === 2, 'L-11: the warm-up is saved, marked, beside the working sets', saved && saved.ex[0].sets.map(x => [Math.round(x.w / LB), x.r, !!x.warm]));
    await P.close();
  }

  /* ---------- L-12: a drop set goes under the last working set ticked, a whole step at about 75% of it, with no rest before it ---------- */
  if (run('L-12')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await P.tap(tick(0, 0));
    await P.ev(() => { window.__ironlog.timer.end = 0; });
    await P.tap(btn('dropAdd', 0));
    const sets = (await P.draft()).ex[0].sets;
    const drop = sets[1];
    // Whole bar steps down from the working load, to the first at or under 75% of it (185, 175 ... 135).
    const want = 185 - Math.ceil((185 - 185 * DROP_START) / BAR_STEP_LB) * BAR_STEP_LB;
    ok(drop && drop.drop && !drop.done && (await P.toasts()).includes('Drop set added'), 'L-12: "Drop set added", under the set just ticked', sets.map(x => [x.drop, x.done]));
    const shown = (await P.rows(0))[1];
    ok(shown.w === String(want) || shown.w === '~' + want, `L-12: whole bar steps down from 185 to the first at or under ${DROP_START * 100}% of it: ${want}`, shown);
    // The set before a drop set waiting starts no rest; the drop set ticked does.
    await P.tap(tick(0, 0)); await P.tap(tick(0, 0));
    ok(!((await P.ev(() => window.__ironlog.timer.end)) > (await P.ev(() => Date.now()))), 'L-12: ticking the set a drop set waits under starts no rest');
    await P.page.fill(field('r', 0, 1), '8'); await P.tap(tick(0, 1));
    const left = await P.ev(() => Math.round((window.__ironlog.timer.end - Date.now()) / 1000));
    ok(left > REST_BENCH - 5 && left <= REST_BENCH, 'L-12: the drop set ticked starts the rest', left);
    await P.close();
  }

  /* ---------- L-13: Fill with last time's reps ---------- */
  if (run('L-13')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await P.tap(btn('fillLast', 0));
    const sets = (await P.draft()).ex[0].sets;
    ok(sets.map(x => x.r).join() === '8,8,7' && sets.every(x => !x.done) && (await P.toasts()).includes("3 sets filled with last time's reps"), 'L-13: each set not ticked takes last time\'s reps for its place, and nothing is ticked', { r: sets.map(x => x.r), t: await P.toasts() });
    ok(!(await P.ev(() => !!document.querySelector('#view [data-act="fillLast"][data-b="0"]'))), 'L-13: with every set filled, the button is no longer offered');
    await P.close();
  }

  /* ---------- L-14: the rest timer ---------- */
  if (run('L-14')) {
    const P = await lifter({ settings: { autoDone: false } });
    ok(await P.ev(() => window.__ironlog.state.settings.timerMode === 'auto'), 'L-14: the rest starts by itself on a new phone (Auto)');
    await start(P);
    await P.tap(tick(0, 0));
    const left = () => P.ev(() => Math.round((window.__ironlog.timer.end - Date.now()) / 1000));
    let l = await left();
    ok(l > REST_BENCH - 5 && l <= REST_BENCH, `L-14: a working set ticked starts the exercise's rest (${REST_BENCH} s)`, l);
    ok(await P.ev(() => !document.getElementById('timer').hidden), 'L-14: and shows the timer');
    await P.tap('[data-act="tSub"]', 150); l = await left();
    ok(l > REST_BENCH - ADD_S - 5 && l <= REST_BENCH - ADD_S, `L-14: −15 takes ${ADD_S} s off`, l);
    await P.tap('[data-act="tAdd"]', 150); l = await left();
    ok(l > REST_BENCH - 5 && l <= REST_BENCH, `L-14: +15 puts ${ADD_S} s on`, l);
    // Closing the app keeps the rest running: it ends when it would have (the page's clock starts again at the suite's
    // time on a reload, so the end is compared, not the seconds left).
    const end0 = await P.ev(() => window.__ironlog.timer.end);
    await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(300);
    const re = await P.ev(() => ({ end: window.__ironlog.timer.end, shown: !document.getElementById('timer').hidden }));
    ok(re.end === end0 && re.shown, 'L-14: reopened, the rest carries on to the same end, on screen', { end0, re });
    await P.tap('[data-act="tStop"]', 150);
    ok(await P.ev(() => document.getElementById('timer').hidden && !window.__ironlog.timer.iv), 'L-14: ✕ stops it and takes it off the screen');
    // The other exercise rests its own time; a superset rests only after the round's last exercise.
    await P.tap(tick(1, 0)); l = await left();
    ok(l > REST_RAISE - 5 && l <= REST_RAISE, `L-14: the raises rest their own ${REST_RAISE} s`, l);
    await P.close();
    /* The set to do next is never left under the rest timer (UAT-14): a tick that starts the rest brings the next set
       clear of the timer when it would sit under it, and moves nothing when it is clear. Three lifts, so the page
       scrolls, on a 393 px phone. */
    const T = await lifter({ settings: { autoDone: false }, w: 393, items: [['bench', 3, 6, 10, REST_BENCH], ['dbLateral', 3, 10, 15, REST_RAISE], ['triPushdown', 3, 10, 15, REST_RAISE]] });
    await start(T);
    const at = () => T.ev(() => { const t = document.getElementById('timer').getBoundingClientRect(); const rows = [...document.querySelectorAll('#view .sg')].filter(r => r.querySelector('[data-act="sDone"][data-b="0"]')).map(r => Math.round(r.getBoundingClientRect().bottom)); return { top: Math.round(t.top), rows, y: Math.round(window.scrollY) }; });
    await T.tap(tick(0, 0), 900); const a1 = await at();
    ok(a1.y === 0 && a1.rows[1] <= a1.top, 'L-14: after the first tick the next set is clear of the rest timer, and the page stays where it was', a1);
    await T.tap(tick(0, 1), 900); const a2 = await at();
    ok(a2.rows[2] <= a2.top - 8, 'L-14: after the second, the next set (3), which would sit under the timer, is brought clear of it', a2);
    await T.close();
    const M = await lifter({ settings: { autoDone: false, timerMode: 'manual' } });
    await start(M); await M.tap(tick(0, 0));
    ok(!((await M.ev(() => window.__ironlog.timer.end)) > (await M.ev(() => Date.now()))), 'L-14: with the timer set to start by hand, a tick starts nothing');
    await M.close();
  }

  /* ---------- L-15: a superset: the pair is done in turn, and the rest comes after the round ---------- */
  if (run('L-15')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    // Superset, from the exercise's ⋯ menu.
    await P.tap(btn('bMenu', 0), 250); await P.tap('#modal [data-act="bMenuDo"][data-op="bSs"]', 300);
    const d = await P.draft();
    ok(d.ex[0].plan.ss && d.ex[0].plan.ss === d.ex[1].plan.ss, 'L-15: the exercise and the next are one superset', d.ex.map(b => b.plan.ss));
    ok((await P.toasts()).includes('Superset. Finish offers to keep it in your plan.'), 'L-15: "Superset. Finish offers to keep it in your plan."', await P.toasts());
    await P.ev(() => { window.__ironlog.timer.end = 0; });
    await P.tap(tick(0, 0));
    ok(!((await P.ev(() => window.__ironlog.timer.end)) > (await P.ev(() => Date.now()))), 'L-15: the first exercise\'s set starts no rest while its partner has a set to do');
    await P.tap(tick(1, 0));
    const l = await P.ev(() => Math.round((window.__ironlog.timer.end - Date.now()) / 1000));
    ok(l > 0, 'L-15: the partner\'s set, the round\'s last, starts the rest', l);
    await P.close();
  }

  /* ---------- L-16: removing an exercise ---------- */
  if (run('L-16')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await P.tap(tick(1, 0));
    // Remove, from the exercise's ⋯ menu: one with a set logged asks first.
    await P.tap(btn('bMenu', 1), 250); await P.tap('#modal [data-act="bMenuDo"][data-op="bDel"]', 250);
    const m = await P.modal();
    ok(m && m.kind === 'confirm', 'L-16: removing an exercise with a set logged asks first', m);
    if (m && m.kind === 'confirm') await mOk(P);
    const d = await P.draft();
    ok(d.ex.length === 1 && (await P.toasts()).includes('Exercise removed'), 'L-16: then it goes, saying "Exercise removed", with Undo', { n: d.ex.length, t: await P.toasts() });
    await P.tap('#toast button', 250);
    const d2 = await P.draft();
    ok(d2.ex.length === 2 && d2.ex[1].sets[0].done, 'L-16: Undo brings it back with its ticked set', d2.ex.map(b => b.exId));
    await P.close();
  }

  /* ---------- L-17: Discard ---------- */
  if (run('L-17')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await P.tap('#view [data-act="discard"]', 250);
    ok(!(await P.draft()) && (await P.toasts()).includes('Session discarded'), 'L-17: a workout with nothing entered is discarded at once: "Session discarded"', await P.toasts());
    await start(P); await P.tap(tick(0, 0));
    await P.tap('#view [data-act="discard"]', 250);
    const m = await P.modal();
    ok(m && m.title === 'Discard this session?' && m.text.includes('Sets and cardio logged in this session will not be saved.'), 'L-17: one with a set logged asks first: "Discard this session?"', m);
    await P.tap('#modal [data-act="mClose"]', 200);
    ok(!!(await P.draft()), 'L-17: Cancel keeps it');
    await P.tap('#view [data-act="discard"]', 250); await mOk(P);
    ok(!(await P.draft()) && (await P.ev(() => window.__ironlog.state.sessions.length)) === 1, 'L-17: Discard drops it, and saves nothing');
    /* UAT-2 (V, 2026-11-14 23:56: "undo after discard makes sense"): a confirmed Discard says so with Undo, which brings
       the workout back as it was, its set ticked, and saves it. */
    const said = await P.ev(() => { const t = document.getElementById('toast'); return t && !t.hidden ? { text: t.innerText.replace(/\s+/g, ' ').trim(), undo: !!t.querySelector('[data-act="undo"]') } : null; });
    ok(said && /^Session discarded/.test(said.text) && said.undo, 'L-17: a confirmed Discard says "Session discarded" with Undo', said);
    if (said && said.undo) await P.tap('#toast [data-act="undo"]', 300);
    const back = await P.draft(), kept = await P.stored();
    ok(back && back.ex[0].sets.filter(x => x.done).length === 1 && kept.draft && kept.draft.id === back.id && kept.draft.ex[0].sets.filter(x => x.done).length === 1, 'L-17: Undo brings the workout back with its ticked set, saved on the phone', back && back.ex[0].sets.map(x => x.done));
    await P.close();
    /* A guard: a workout set aside for an edit comes back when the edit is discarded, so that Discard keeps no Undo step
       (one taken before it would bring the edit back over the workout and let the set-aside copy go). */
    const Q = await lifter({ settings: { autoDone: false } });
    await start(Q); await Q.tap(tick(0, 0));
    await Q.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
    await Q.tap('#view [data-act="histToggle"][data-id="last"]', 150); await Q.tap('#view [data-act="histEdit"][data-id="last"]', 300);
    if ((await Q.modal()) && (await Q.modal()).kind === 'confirm') await mOk(Q);
    const ed = await Q.draft();
    await Q.tap(tick(0, 2), 200);
    await Q.tap('#view [data-act="discard"]', 250); if (await Q.modal()) await mOk(Q);
    const w = await Q.draft(), t = await Q.ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? !!el.querySelector('[data-act="undo"]') : false; });
    ok(ed && ed.editingId === 'last' && w && !w.editingId && w.ex[0].sets.filter(x => x.done).length === 1 && !t, 'L-17: (guard) an edit discarded with a workout set aside brings the workout back, its set ticked, and offers no Undo', { editing: ed && ed.editingId, back: w && w.ex[0].sets.map(x => x.done), undo: t });
    await Q.close();
    /* The review of 2.68 to 2.70, REV20-1: an edit discarded keeps no Undo step. Its saved session is untouched, and a
       step would bring the old edit back after a newer edit of the session is saved, and write over it. Bench saved
       185 x 8, 8, 7: edited to 9 reps and discarded, then edited to 10 reps on set 2 and saved: the 10 stays. */
    const E = await lifter({ settings: { autoDone: false } });
    // History with the session opened (a second visit finds it open still), then Edit.
    const editLast = async () => { await E.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.ui.histOpen = 'last'; L.render(); }); await wait(150); await E.tap('#view [data-act="histEdit"][data-id="last"]', 300); };
    const repsTo = async (s, r) => { await E.page.click(field('r', 0, s)); await E.page.fill(field('r', 0, s), String(r)); await E.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(100); };
    await editLast(); await repsTo(0, 9);
    await E.tap('#view [data-act="discard"]', 250); if (await E.modal()) await mOk(E);
    const t1 = await E.ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? { text: el.innerText.replace(/\s+/g, ' ').trim(), undo: !!el.querySelector('[data-act="undo"]') } : null; });
    await editLast(); await repsTo(1, 10);
    await E.tap('#view [data-act="finish"]', 300); for (let k = 0; k < 4; k++) { const m = await E.modal(); if (!m) break; if (m.kind === 'confirm') await mOk(E); else await E.ev(() => window.__ironlog.ACT.mClose()); }
    const next = await E.ev(() => (window.__ironlog.undoNext ? window.__ironlog.undoNext() : null));
    await E.ev(() => window.__ironlog.ACT.undo()); await wait(200);
    if (await E.draft()) { await E.tap('#view [data-act="finish"]', 300); for (let k = 0; k < 4; k++) { const m = await E.modal(); if (!m) break; if (m.kind === 'confirm') await mOk(E); else await E.ev(() => window.__ironlog.ACT.mClose()); } }
    const bench = await E.ev(() => window.__ironlog.state.sessions.find(x => x.id === 'last').ex[0].sets.map(x => x.r).join(','));
    ok(t1 && /^Edits discarded/.test(t1.text) && !t1.undo && next !== 'Edits discarded' && bench === '8,10,7', 'L-17: an edit discarded says "Edits discarded" with no Undo, and a newer edit saved after it stays (REV20-1)', { t1, next, bench });
    await E.close();
    /* REV20-3: a workout discarded with Undo, then another started and a set ticked: Undo cannot bring the first back
       while the second is open, says so, and keeps its step; with the second finished, it brings the first back. */
    const F = await lifter({ settings: { autoDone: false } });
    await start(F); await F.tap(tick(0, 0)); await F.tap(tick(0, 1));
    const first = (await F.draft()).id;
    await F.tap('#view [data-act="discard"]', 250); await mOk(F);
    await start(F); await F.tap(tick(0, 0));
    const second = (await F.draft()).id;
    await F.ev(() => window.__ironlog.ACT.undo()); await wait(200);
    const said3 = await F.ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText.replace(/\s+/g, ' ').trim() : ''; });
    const open3 = await F.draft(), kept3 = await F.ev(() => (window.__ironlog.undoNext ? window.__ironlog.undoNext() : null));
    ok(open3 && open3.id === second && open3.ex[0].sets.filter(x => x.done).length === 1 && !/^Undone/.test(said3) && /open/i.test(said3) && kept3 === 'Session discarded', 'L-17: with another workout open, Undo of a discarded one says it cannot come back yet, the open one untouched, the step kept (REV20-3)', { said3, open: open3 && open3.id === second, kept3 });
    await F.tap('#view [data-act="finish"]', 300); for (let k = 0; k < 4; k++) { const m = await F.modal(); if (!m) break; if (m.kind === 'confirm') await mOk(F); else await F.ev(() => window.__ironlog.ACT.mClose()); }
    await F.ev(() => window.__ironlog.ACT.undo()); await wait(200);
    const back3 = await F.draft();
    ok(back3 && back3.id === first && back3.ex[0].sets.filter(x => x.done).length === 2 && (await F.ev(id => window.__ironlog.state.sessions.some(x => x.id === id), second)), 'L-17: with that workout finished, Undo brings the discarded one back, its two sets ticked, and the finished one stays saved', { back: back3 && back3.id === first });
    await F.close();
  }

  /* ---------- L-18: Finish ---------- */
  if (run('L-18')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await P.tap('#view [data-act="finish"]', 250);
    ok((await P.toasts()).includes('Mark at least one set done') && !!(await P.draft()), 'L-18: Finish with nothing ticked: "Mark at least one set done", and the workout stays', await P.toasts());
    await P.tap(tick(0, 0)); await P.tap(tick(0, 1));
    await P.tap('#view [data-act="finish"]', 250);
    let m = await P.modal();
    ok(m && m.title === '3 of 5 sets not done' && m.buttons.includes('Finish now') && m.buttons.includes('Keep going'), 'L-18: with sets left it asks: "3 of 5 sets not done", Finish now or Keep going', m);
    await mAlt(P);
    ok(!!(await P.draft()), 'L-18: Keep going keeps the workout open');
    // A set with reps typed and no tick is asked about rather than lost.
    await P.page.fill(field('r', 0, 2), '7'); await wait(500);
    // Sets left and a set with reps and no tick are one question, not two in turn: the typed one named, Mark it done
    // and save, Save without them, or Cancel to keep going (UAT-18).
    await P.tap('#view [data-act="finish"]', 250); m = await P.modal();
    ok(m && m.title === '3 of 5 sets not done' && m.text.includes('Barbell Bench Press (1 set) has reps and no checkmark.') && m.text.includes('The other 2 are empty and left out.') && JSON.stringify(m.buttons) === '["Mark it done and save","Save without them","Cancel"]',
      'L-18: sets left and a set with reps and no tick are one question: "3 of 5 sets not done", the typed one named, Mark it done and save or Save without them', m);
    await mOk(P);
    m = await P.modal();
    ok(m && m.kind === 'recap', 'L-18: Mark it done and save saves at once, with no second question', m && { kind: m.kind, title: m.title, text: m.text.slice(0, 120) });
    while (await P.modal()) { const mm = await P.modal(); if (mm.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } }
    const saved = await P.ev(() => window.__ironlog.state.sessions.find(x => x.date === '2026-11-11'));
    ok(!(await P.draft()) && saved && saved.ex.length === 1 && saved.ex[0].exId === 'bench' && saved.ex[0].sets.length === 3 && saved.ex[0].sets.every(x => x.done !== false), 'L-18: the saved session holds the sets ticked (the typed one, ticked on that answer), and leaves out an exercise with none', saved && saved.ex.map(b => [b.exId, b.sets.length]));
    ok(saved && saved.dayId === 'A' && saved.routineId === 'R1' && saved.ex[0].ps === 3, 'L-18: saved with its day, its routine and the sets its plan gave it (3)', saved && { dayId: saved.dayId, routineId: saved.routineId, ps: saved.ex[0].ps });
    await P.close();
  }

  /* ---------- L-19: editing a saved session ---------- */
  if (run('L-19')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P); await P.tap(tick(0, 0));
    await P.tap('#tabs [data-tab="history"]', 200);
    await P.tap('#view [data-act="histToggle"][data-id="last"]', 150); await P.tap('#view [data-act="histEdit"][data-id="last"]', 300);
    const t = await P.toasts();
    ok(t.includes('Your workout in progress is set aside. It comes back when you save or discard this one.'), 'L-19: editing a saved session sets the workout in progress aside, and says so', t);
    const d = await P.draft();
    ok(d && d.editingId === 'last' && d.ex[0].sets.every(x => x.done), 'L-19: the saved session opens with its sets ticked', d && { id: d.editingId });
    // A set unticked and ticked again in the edit, with 8 reps typed: a tick that would start a rest in a workout.
    await P.ev(() => { window.__ironlog.timer.end = 0; });
    await P.tap(tick(0, 2)); await P.page.fill(field('r', 0, 2), '8'); await P.tap(tick(0, 2));
    ok(!((await P.ev(() => window.__ironlog.timer.end)) > (await P.ev(() => Date.now()))) && (await P.draft()).ex[0].sets[2].done, 'L-19: a set ticked in an edit starts no rest');
    await P.tap('#view [data-act="finish"]', 300);
    while (await P.modal()) { const mm = await P.modal(); if (mm.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } }
    const last = await P.ev(() => window.__ironlog.state.sessions.find(x => x.id === 'last'));
    ok(last && last.ex[0].sets[2].r === 8 && last.date === '2026-11-07', 'L-19: Finish saves the edit into that session, on its own date', last && last.ex[0].sets.map(x => x.r));
    ok((await P.toasts()).some(x => x === 'Session updated. Your workout in progress is back: Resume it on Today.'), 'L-19: "Session updated." and the workout set aside is back', await P.toasts());
    const back = await P.draft();
    ok(back && !back.editingId && back.ex[0].sets[0].done, 'L-19: the workout in progress is back as it was', back && back.ex[0].sets.map(x => x.done));
    await P.close();
  }
  if (run('L-19')) {
    /* The 30 days stand still while the edit the workout set aside waits for is open (V, 2026-11-13: "the draft workout
       is paused"). REV16-C1: the app left 32 days with the edit open, the copy was removed at the next open, its sets in
       no session, and no screen the lifter saw had given a date. Saved then, the edit brings the workout back. */
    const P = await lifter({ settings: { autoDone: false }, movable: true });
    await start(P); await P.tap(tick(0, 0));
    await P.tap('#tabs [data-tab="history"]', 200);
    await P.tap('#view [data-act="histToggle"][data-id="last"]', 150); await P.tap('#view [data-act="histEdit"][data-id="last"]', 300);
    const lineOf = () => P.ev(() => { const e = document.getElementById('parkedLine'); return e ? e.textContent.replace(/\s+/g, ' ').trim() : null; });
    await P.ctx.addInitScript(t => { if (window.__setClock) window.__setClock(t); }, '2026-12-13T09:00:00');
    await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__ironlog.state && document.querySelector('#tabs [data-tab="today"]')); await wait(400);
    const now = await P.ev(() => new Date().toISOString().slice(0, 10));
    if (now !== '2026-12-13') ok(false, 'L-19: (setup) the page reopened on 2026-12-13', now);
    const kept = { held: await P.ev(() => localStorage.getItem(window.__ironlog.KEY + '.parked') != null), line: await lineOf(), said: await P.toasts() };
    ok(kept.held && kept.line === 'Your workout in progress is set aside. It comes back when you save or discard this one.' && !kept.said.some(x => /removed/.test(x)), 'L-19: opened 32 days later with the edit still open, the workout set aside is kept, its line giving no date: nothing is removed while the edit is open (REV16-C1)', kept);
    await P.tap('#view [data-act="finish"]', 300);
    while (await P.modal()) { const mm = await P.modal(); if (mm.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } }
    const back = await P.draft();
    ok(back && !back.editingId && back.ex[0].sets[0].done && (await P.toasts()).some(x => /Your workout in progress is back/.test(x)), 'L-19: and the edit saved then brings it back as it was (REV16-C1)', back && back.ex[0].sets.map(x => x.done));
    await P.close();
  }
  if (run('L-19')) {
    /* NEW-96 (V, 2026-11-09 08:11: "is it possible to delete it after 30 days?"): a workout set aside and never
       brought back is kept 30 days from the day it was set aside, Today's card saying until when, then removed when
       the app next opens, said as it goes. Here the app closes while the edit is open and before the edit is saved
       (the log on the phone then holds no workout), so Today offers the workout set aside. */
    const P = await lifter({ settings: { autoDone: false }, movable: true });
    await start(P); await P.tap(tick(0, 0));
    await P.tap('#tabs [data-tab="history"]', 200);
    await P.tap('#view [data-act="histToggle"][data-id="last"]', 150); await P.tap('#view [data-act="histEdit"][data-id="last"]', 300);
    // Reopened: the page loaded again at that time, then Today's tab tapped, as a lifter opens the app to it.
    const reopen = async t => {
      await P.ctx.addInitScript(t => { if (window.__setClock) window.__setClock(t); }, t);
      await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__ironlog.state && document.querySelector('#tabs [data-tab="today"]'));
      await wait(300); await P.tap('#tabs [data-tab="today"]', 300);
      const now = await P.ev(() => new Date().toISOString().slice(0, 10));
      if (now !== t.slice(0, 10)) ok(false, 'L-19: (setup) the page reopened on ' + t.slice(0, 10), now);
    };
    await P.ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
    await reopen('2026-12-11T09:00:00');
    const card = await P.ev(() => { const c = document.getElementById('parkedCard'); return c ? c.innerText.replace(/\s+/g, ' ') : null; });
    ok(card && /Set aside while you fixed an earlier one\. Kept until Dec 11\./.test(card), 'L-19: Today\'s card says until when the workout set aside on Nov 11 is kept: "Kept until Dec 11." (NEW-96)', card);
    await reopen('2026-12-12T09:00:00');
    const gone = await P.ev(() => ({ card: !!document.getElementById('parkedCard'), held: localStorage.getItem(window.__ironlog.KEY + '.parked') }));
    const said = await P.toasts();
    ok(!gone.card && gone.held == null && said.includes('The workout set aside was removed: it was kept until Dec 11.'), 'L-19: opened the day after, it is removed and the app says so: "The workout set aside was removed: it was kept until Dec 11." (NEW-96)', { gone, said });
    // A copy set aside by a build before 2.57 carries no date: its 30 days count from the day this build first opens
    // with it, so it is never removed sooner than its card could say.
    // As 2.56 wrote it: the account and the workout, no date.
    await P.ev(() => { localStorage.setItem(window.__ironlog.KEY + '.parked', JSON.stringify({ uid: '', draft: { id: 'old1', date: '2026-11-01', ex: [{ exId: 'bench', sets: [{ w: 80, r: 8, done: true }] }] } })); });
    await reopen('2026-12-20T09:00:00');
    const old = await P.ev(() => { const c = document.getElementById('parkedCard'); const r = JSON.parse(localStorage.getItem(window.__ironlog.KEY + '.parked') || 'null'); return { card: c ? c.innerText.replace(/\s+/g, ' ') : null, at: r && r.at }; });
    ok(old.card && /Kept until Jan 19, 2027\./.test(old.card) && typeof old.at === 'number', 'L-19: a copy from before 2.57, first opened Dec 20, is kept until Jan 19, 2027 (NEW-96)', old);
    await P.close();
  }

  if (run('L-19')) {
    /* The workout set aside comes back reading the log as the edit saved it, as a change to a lift reaches a workout
       open (NEW-152): last week's bench made 185 x 10, 10, 10 in the edit, the bench, not started, asks what a workout
       started now asks, a step up (185 + 10 = 195 lb), with last time as saved; the raises, started, keep what they
       started with. Before, it came back asking for 24+ reps at 185 lb beside the old last time. */
    const P = await lifter({ settings: { autoDone: false } });
    await start(P); await P.tap(tick(1, 0));
    // Its target, the load it asked and its rows, compared by value (the copy set aside is read back with its keys in another order).
    const raises = () => P.ev(() => { const b = window.__ironlog.state.draft.ex[1]; const t = b.tgt || {}; return JSON.stringify({ tgt: Object.keys(t).sort().map(k => [k, t[k]]), sw: b.sw, sets: b.sets.map(x => [x.w, x.r, !!x.done]) }); });
    const raisesBefore = await raises();
    await P.tap('#tabs [data-tab="history"]', 200);
    await P.tap('#view [data-act="histToggle"][data-id="last"]', 150); await P.tap('#view [data-act="histEdit"][data-id="last"]', 300);
    const bi = await P.ev(() => window.__ironlog.state.draft.ex.findIndex(b => b.exId === 'bench'));
    for (const s of [0, 1, 2]) { await P.page.click(field('r', bi, s)); await P.page.fill(field('r', bi, s), ''); await P.page.keyboard.type('10'); await P.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(80); }
    await P.tap('#view [data-act="finish"]', 300);
    while (await P.modal()) { const mm = await P.modal(); if (mm.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } }
    const saved = await P.ev(() => window.__ironlog.state.sessions.find(x => x.id === 'last').ex.find(b => b.exId === 'bench').sets.map(x => x.r));
    if (saved.join() !== '10,10,10') ok(false, 'L-19: (setup) the edit saved the bench as 10, 10, 10', saved);
    await P.tap('#tabs [data-tab="today"]', 300);
    const bench = await P.ev(() => { const e = document.getElementById('blk-0'); return { grey: [...e.querySelectorAll('input[data-f="w"]')].map(i => i.value || i.placeholder), text: e.innerText.replace(/\s+/g, ' ') }; });
    const up = String(185 + BAR_STEP_LB);
    ok(bench.grey.length === 3 && bench.grey.every(v => v === up) && bench.text.includes(`${up} lb`) && /185×10 – ✓ 2 185×10 – ✓ 3 185×10/.test(bench.text) && !/185×7/.test(bench.text), `L-19: the workout set aside comes back with the bench, not started, at ${up} lb, read from last week as the edit saved it (NEW-152)`, bench);
    ok((await raises()) === raisesBefore, 'L-19: the raises, started before, keep what they started with (NEW-152)', { before: raisesBefore, after: await raises() });
    await P.close();
  }

  /* ---------- L-20: Short on time: blank rows go from the end, typed and ticked sets stay, with Undo ---------- */
  if (run('L-20')) {
    // A longer day (about half an hour left), so 15 minutes asks for a trim.
    const P = await lifter({ settings: { autoDone: false }, items: [['bench', 6, 6, 10, 180], ['dbLateral', 4, 10, 15, 90], ['cableFly', 4, 10, 15, 90]] });
    await start(P);
    // A set ticked at the top, and reps typed on the last row, where a trim from the end would reach first.
    await P.tap(tick(0, 0)); await P.page.fill(field('r', 0, 5), '8'); await wait(500);
    const before = (await P.draft()).ex.map(b => b.sets.length);
    await P.tap('#view [data-act="shortOpen"]', 250);
    await P.tap('#modal [data-act="shortPick"][data-v="15"]', 200);
    const canTrim = await P.ev(() => !!document.querySelector('#modal [data-act="shortApply"]'));
    ok(canTrim, 'L-20: 15 minutes is less than the session needs, so it offers "Trim the session"');
    if (canTrim) await P.tap('#modal [data-act="shortApply"]', 300);
    const d = await P.draft(), t = await P.toasts();
    const b0 = d.ex.find(b => b.exId === 'bench');
    ok(t.some(x => /^Trimmed to ~\d+ min$/.test(x)), 'L-20: it says what the session now takes: "Trimmed to ~N min"', t);
    ok(b0 && b0.sets[0].done && b0.sets[b0.sets.length - 1].r === 8, 'L-20: the ticked set and the typed one stay, though the typed one is last', b0 && b0.sets.map(x => [x.done, x.r]));
    ok(d.ex.reduce((n, b) => n + b.sets.length, 0) < before.reduce((a, c) => a + c, 0), 'L-20: blank rows go', { before, after: d.ex.map(b => b.sets.length) });
    await P.tap('#toast button', 250);
    ok(JSON.stringify((await P.draft()).ex.map(b => b.sets.length)) === JSON.stringify(before), 'L-20: Undo puts the session back as it was', (await P.draft()).ex.map(b => b.sets.length));
    await P.close();
  }

  /* ---------- L-21: 0 reps is a missed set, asked about first when its load is well under the session's ---------- */
  if (run('L-21')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await P.page.fill(field('r', 0, 0), '0'); await P.tap(tick(0, 0));
    const s0 = (await P.draft()).ex[0].sets[0];
    ok(s0.done && s0.r === 0 && (await P.toasts()).includes('Logged as missed.') && !(await P.toasts()).some(t => /counts toward|step up/.test(t)), 'L-21: a set ticked with 0 reps is logged as missed, and says so in three words: "Logged as missed." (V, 2026-11-14)', { s0, t: await P.toasts() });
    await P.page.fill(field('w', 0, 1), '95'); await P.page.fill(field('r', 0, 1), '0'); await P.tap(tick(0, 1));
    const m = await P.modal();
    ok(m && m.kind === 'confirm' && /0 reps at a weight well under today's working weight/.test(m.text) && !(await P.draft()).ex[0].sets[1].done, 'L-21: 0 at a load well under the session\'s working load asks first, and nothing is ticked yet', m);
    await P.close();
  }

  /* ---------- L-22: moving an exercise up or down ---------- */
  if (run('L-22')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await P.tap(btn('bMenu', 1), 250); await P.tap('#modal [data-act="bMenuDo"][data-op="bUp"]', 300);
    const d = await P.draft();
    ok(d.ex.map(b => b.exId).join() === 'dbLateral,bench', 'L-22: "Move up" puts the raises first', d.ex.map(b => b.exId));
    await P.tap(btn('bMenu', 0), 250); await P.tap('#modal [data-act="bMenuDo"][data-op="bDown"]', 300);
    ok((await P.draft()).ex.map(b => b.exId).join() === 'bench,dbLateral', 'L-22: "Move down" puts them back', (await P.draft()).ex.map(b => b.exId));
    await P.close();
  }

  /* ---------- the Swap sections' helpers ---------- */
  // The exercise's menu, then one of its items, as a lifter taps them.
  // A done exercise is folded: its heading opens it first, as a lifter opens it.
  const menuOp = async (P, b, op) => { if (await P.page.$(btn('bOpen', b))) await P.tap(btn('bOpen', b), 250); await P.tap(btn('bMenu', b), 250); await P.tap(`#modal [data-act="bMenuDo"][data-op="${op}"]`, 300); };
  // Swap exercise b for the lift named, picked from the list as a lifter finds it: its name typed in Search, every
  // muscle shown when it works another (the list opens on the swapped lift's muscle).
  const swapTo = async (P, b, id, name, all) => {
    await menuOp(P, b, 'bSwap');
    if (all) { await P.page.selectOption('#modal select[data-mbind="m"]', ''); await wait(200); }
    await P.page.fill('#pickQ', name); await wait(300);
    await P.tap(`#pickList .pick[data-ex="${id}"]`, 350);
  };
  const DB_SEED = S => { S.sessions.push({ id: 'db', date: '2026-11-04', dayIdx: 0, dayName: 'Push', notes: '', ex: [{ exId: 'dbBench', rr: [8, 12], ps: 3, sets: [[70, 10], [70, 10], [70, 9]].map(([w, r]) => ({ w: w * 0.45359237, r, rir: 2, done: true })) }] }); };
  const exIds = P => P.ev(() => window.__ironlog.state.draft.ex.map(b => b.exId));
  const undoToast = async P => { await P.tap('#toast [data-act="undo"], #toast button', 300); };
  // "Undo" in Settings, as a lifter reaches it: the Settings tab, the section that holds it opened.
  const settingsUndo = async P => {
    await P.tap('#tabs [data-tab="settings"]', 200);
    await P.ev(() => { const b = document.querySelector('#view [data-act="undo"]'); const d = b && b.closest('details'); if (d && !d.open) d.querySelector('summary').click(); });
    await wait(150);
    const label = await P.ev(() => (document.querySelector('#view [data-act="undo"]') || {}).innerText || '');
    await P.tap('#view [data-act="undo"]', 300);
    await P.tap('#tabs [data-tab="today"]', 200);
    return label;
  };

  /* ---------- L-23: a swap with nothing logged: the new lift in its place, with the rows it has now, and Undo ---------- */
  if (run('L-23')) {
    const P = await lifter({ settings: { autoDone: false }, seed: DB_SEED });
    await start(P);
    // − Set first, so the exercise has fewer rows than its plan.
    await P.tap(btn('sDel', 0), 250);
    ok((await P.rows(0)).length === 2, 'L-23: (setup) − Set leaves the bench two rows of its plan\'s three');
    await swapTo(P, 0, 'dbBench', 'DB Bench');
    let d = await P.draft();
    ok(d.ex[0].exId === 'dbBench' && d.ex.length === 2, 'L-23: the lift picked takes the bench\'s place', d.ex.map(b => b.exId));
    ok((await P.rows(0)).length === 2 && d.ex[0].plan.sets === 2, 'L-23: with the rows the bench had now (two), not the plan\'s three', { rows: (await P.rows(0)).length, plan: d.ex[0].plan.sets });
    ok((await P.toasts()).includes('Swapped to DB Bench Press'), 'L-23: it says "Swapped to DB Bench Press", with Undo', await P.toasts());
    await swapTo(P, 0, 'incBench', 'Incline Barbell');
    ok((await P.rows(0)).length === 2 && (await exIds(P))[0] === 'incBench', 'L-23: a second swap keeps the two rows', await P.rows(0));
    // The app closed as a phone closes it: hidden (the app switcher), then gone.
    await P.ev(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }); await wait(100);
    await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(300);
    if (!(await P.ev(() => !!document.querySelector('#view [data-act="sDone"]')))) await start(P);
    ok((await P.rows(0)).length === 2, 'L-23: and so does closing and reopening the app', await P.rows(0));
    // The message's Undo goes with the reload; the one in Settings takes the newest step back.
    await settingsUndo(P);
    d = await P.draft();
    ok(d.ex[0].exId === 'dbBench' && (await P.rows(0)).length === 2, 'L-23: Undo puts back the exercise the last swap replaced, with its rows', { ex: d.ex.map(b => b.exId), rows: await P.rows(0) });
    await P.close();
  }

  /* ---------- L-24: some sets logged and some left: the logged ones stay, the new lift takes the rest ---------- */
  if (run('L-24')) {
    const P = await lifter({ settings: { autoDone: false }, seed: DB_SEED });
    await start(P);
    await P.tap(tick(0, 0));
    await swapTo(P, 0, 'dbBench', 'DB Bench');
    let d = await P.draft();
    ok(d.ex.map(b => b.exId).join() === 'bench,dbBench,dbLateral', 'L-24: the new lift goes right after the one swapped', d.ex.map(b => b.exId));
    ok(d.ex[0].sets.length === 1 && d.ex[0].sets[0].done && Math.round(d.ex[0].sets[0].w / LB) === 185, 'L-24: the set ticked stays with the bench, as it was done', d.ex[0].sets);
    ok(d.ex[1].sets.length === 2 && d.ex[1].sets.every(x => !x.done), 'L-24: the dumbbell bench takes the two sets left', d.ex[1].sets.length);
    ok((await P.toasts()).includes('DB Bench Press added for the sets left. Your sets so far stay with Barbell Bench Press.'), 'L-24: it says "DB Bench Press added for the sets left. Your sets so far stay with Barbell Bench Press."', await P.toasts());
    await undoToast(P);
    d = await P.draft();
    ok(d.ex.map(b => b.exId).join() === 'bench,dbLateral' && d.ex[0].sets.length === 3 && d.ex[0].sets[0].done, 'L-24: Undo puts the bench back with its three rows and the set ticked', d.ex.map(b => [b.exId, b.sets.length]));
    // A set typed and not ticked is logged too: it stays (r25: typed sets used to go with the swap).
    const Q = await lifter({ settings: { autoDone: false }, seed: DB_SEED });
    await start(Q);
    await Q.page.fill(field('w', 0, 0), '190'); await Q.page.fill(field('r', 0, 0), '6'); await Q.page.press(field('r', 0, 0), 'Tab'); await wait(300);
    await swapTo(Q, 0, 'dbBench', 'DB Bench');
    const q = await Q.draft();
    ok(q.ex[0].exId === 'bench' && q.ex[0].sets.length === 1 && Math.round(q.ex[0].sets[0].w / LB) === 190 && q.ex[0].sets[0].r === 6 && q.ex[1].exId === 'dbBench' && q.ex[1].sets.length === 2, 'L-24: a set typed and not ticked counts as logged: 190 x 6 stays with the bench, and the dumbbell bench takes the two left', q.ex.map(b => [b.exId, b.sets.map(x => [Math.round((x.w || 0) / LB), x.r])]));
    await Q.close();
    await P.close();
  }

  /* ---------- L-25: every set logged: Move the sets, or add the lift after it ---------- */
  if (run('L-25')) {
    const P = await lifter({ settings: { autoDone: false }, seed: DB_SEED });
    await start(P);
    for (const s of [0, 1, 2]) await P.tap(tick(0, s));
    await swapTo(P, 0, 'dbBench', 'DB Bench');
    const m = await P.modal();
    ok(m && /Every set of Barbell Bench Press is logged/.test(m.text) && /Logged on the wrong exercise\? Move the sets to DB Bench Press\. Or add DB Bench Press after it\./.test(m.text) && m.buttons.includes('Move the sets') && m.buttons.includes('Add DB Bench Press'), 'L-25: with every set logged it asks: "Every set of Barbell Bench Press is logged", "Move the sets" or "Add DB Bench Press"', m);
    await mOk(P);
    let d = await P.draft();
    ok(d.ex.map(b => b.exId).join() === 'dbBench,dbLateral' && d.ex[0].sets.filter(x => x.done).map(x => x.r).join() === '8,8,7', 'L-25: "Move the sets" puts every set on the dumbbell bench, as logged', d.ex.map(b => [b.exId, b.sets.map(x => x.r)]));
    ok((await P.toasts()).includes('Your sets are on DB Bench Press now'), 'L-25: and says "Your sets are on DB Bench Press now"', await P.toasts());
    await undoToast(P);
    ok((await exIds(P)).join() === 'bench,dbLateral', 'L-25: Undo puts them back on the bench', await exIds(P));
    await swapTo(P, 0, 'dbBench', 'DB Bench');
    await mAlt(P);
    d = await P.draft();
    ok(d.ex.map(b => b.exId).join() === 'bench,dbBench,dbLateral' && d.ex[0].sets.every(x => x.done) && d.ex[1].sets.length === 3 && d.ex[1].sets.every(x => !x.done), 'L-25: "Add DB Bench Press" leaves the bench as logged and adds the dumbbell bench after it, with three sets to do', d.ex.map(b => [b.exId, b.sets.length]));
    ok((await P.toasts()).includes('DB Bench Press added after Barbell Bench Press'), 'L-25: and says "DB Bench Press added after Barbell Bench Press"', await P.toasts());
    await P.close();
  }

  /* ---------- L-26: swapped to the lift just above or below: one exercise, its sets together ---------- */
  if (run('L-26')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await swapTo(P, 0, 'dbLateral', 'Lateral Raise', true);
    let d = await P.draft();
    ok(d.ex.length === 1 && d.ex[0].exId === 'dbLateral' && d.ex[0].sets.length === 5, 'L-26: the bench swapped to the raises just below, with nothing logged: one exercise of five rows (the bench\'s three and the raises\' two)', d.ex.map(b => [b.exId, b.sets.length]));
    ok((await P.toasts()).includes('Swapped to DB Lateral Raise: its sets are together now'), 'L-26: it says "Swapped to DB Lateral Raise: its sets are together now"', await P.toasts());
    await undoToast(P);
    ok(JSON.stringify((await P.draft()).ex.map(b => [b.exId, b.sets.length])) === '[["bench",3],["dbLateral",2]]', 'L-26: Undo puts both back', (await P.draft()).ex.map(b => [b.exId, b.sets.length]));
    // The raises swapped to the bench just above: they join it.
    await swapTo(P, 1, 'bench', 'Barbell Bench', true);
    d = await P.draft();
    ok(d.ex.length === 1 && d.ex[0].exId === 'bench' && d.ex[0].sets.length === 5, 'L-26: the raises swapped to the bench just above, with nothing logged: one exercise of five rows', d.ex.map(b => [b.exId, b.sets.length]));
    ok((await P.toasts()).includes('Swapped to Barbell Bench Press: its sets are together now'), 'L-26: it says "Swapped to Barbell Bench Press: its sets are together now"', await P.toasts());
    await undoToast(P);
    await P.tap(tick(0, 0));
    await swapTo(P, 0, 'dbLateral', 'Lateral Raise', true);
    d = await P.draft();
    ok(JSON.stringify(d.ex.map(b => [b.exId, b.sets.length])) === '[["bench",1],["dbLateral",4]]' && d.ex[0].sets[0].done, 'L-26: with a set ticked, it stays with the bench and the two left join the raises below', d.ex.map(b => [b.exId, b.sets.length]));
    ok((await P.toasts()).includes('DB Lateral Raise: the sets left join the ones below. Your sets so far stay with Barbell Bench Press.'), 'L-26: it says "DB Lateral Raise: the sets left join the ones below. Your sets so far stay with Barbell Bench Press."', await P.toasts());
    await P.close();
  }

  /* ---------- L-27: the lift swapped in is done for the slot: its range, effort and rest; its own step and targets ---------- */
  if (run('L-27')) {
    // The bench's load step set to 10 lb in its menu, a fly on another day of the routine.
    const P = await lifter({ settings: { autoDone: false }, seed: DB_SEED, more: [['Pull', [['cableFly', 3, 12, 15, 45]]]] });
    // Pull is next in the cycle: Push is picked on Today's Change sheet, as a lifter picks a day.
    await P.page.click('#tabs [data-tab="today"]'); await wait(120);
    await P.tap('#view .hero [data-act="startAltOpen"]', 250); await P.tap('#modal [data-act="dayPick"][data-i="0"]', 250);
    if (await P.modal()) await P.tap('#modal [data-act="mClose"]', 200);
    await start(P);
    ok((await exIds(P)).join() === 'bench,dbLateral', 'L-27: (setup) Push started', await exIds(P));
    await P.ev(LB => { const L = window.__ironlog; L.act(() => { L.state.draft.ex[0].plan.inc = 10 * LB; }); L.render(); }, LB);
    await swapTo(P, 0, 'dbBench', 'DB Bench');
    let p = (await P.draft()).ex[0].plan;
    ok(p.repMin === 6 && p.repMax === 10 && p.rir === 2 && p.rest === REST_BENCH, 'L-27: the dumbbell bench is done for the bench\'s range, effort and rest (6 to 10, 2 in reserve, 120 s)', p);
    const r0 = (await P.rows(0))[0];
    const g = +String(r0.w).replace('~', '');
    ok(/^~\d/.test(r0.w) && g >= 65 && g <= 80, 'L-27: its grey load is its own, from its own 70 lb sets, not the bench\'s 185', r0);
    await undoToast(P);
    await swapTo(P, 0, 'incBench', 'Incline Barbell');
    p = (await P.draft()).ex[0].plan;
    ok(Math.round(p.inc / LB) === 10, 'L-27: on the same equipment it keeps the slot\'s 10 lb step', Math.round(p.inc / LB));
    await undoToast(P);
    await swapTo(P, 0, 'cableFly', 'Cable Fly');
    p = (await P.draft()).ex[0].plan;
    ok(p.repMin === 12 && p.repMax === 15 && p.rest === 45, 'L-27: a lift on another day of the routine is done as planned there (12 to 15, 45 s)', p);
    await undoToast(P);
    await swapTo(P, 0, 'plank', 'Plank', true);
    p = (await P.draft()).ex[0].plan;
    ok(!(p.repMin === 6 && p.repMax === 10) && p.repMin >= 15, 'L-27: a timed hold swapped in for a lift done for reps takes its own range in seconds, never 6 to 10', p);
    await undoToast(P);
    // Last, as a load typed takes the message's Undo away (r64).
    await swapTo(P, 0, 'dbBench', 'DB Bench');
    await P.page.fill(field('w', 0, 0), '70'); await P.tap(`${btn('sStep', 0, 0)}[data-sf="w"][data-d="1"]`, 200);
    ok(+(await P.page.inputValue(field('w', 0, 0))) === 75, 'L-27: on other equipment it takes its own load step: plus moves the dumbbells 5 lb (70 to 75), not the bar slot\'s 10', await P.page.inputValue(field('w', 0, 0)));
    await P.close();
  }

  /* ---------- L-28: a change after a swap is never undone by it; Finish saves the lift swapped in ---------- */
  if (run('L-28')) {
    const P = await lifter({ settings: { autoDone: false }, seed: DB_SEED });
    await start(P);
    await P.tap(tick(0, 0));
    await swapTo(P, 0, 'dbBench', 'DB Bench');
    await P.tap(tick(1, 0));
    ok(await P.ev(() => { const b = document.querySelector('#toast [data-act="undo"]'); return !b || b.hidden || b.offsetParent === null || document.getElementById('toast').hidden; }), 'L-28: a set ticked after the swap takes the swap\'s Undo off the message');
    const label = await settingsUndo(P);
    ok(label === 'Undo: DB Bench Press added for the sets left. Your sets so far stay with Barbell Bench Press.', 'L-28: "Undo" in Settings names the swap', label);
    const d = await P.draft();
    const bench = d.ex.find(b => b.exId === 'bench'), db = d.ex.find(b => b.exId === 'dbBench');
    ok(bench && bench.sets.length === 3 && bench.sets[0].done, 'L-28: it puts the bench back with its rows and the set ticked', bench && bench.sets.map(x => x.done));
    ok(db && db.sets[0].done, 'L-28: and the set ticked on the dumbbell bench since stays (S-7: Undo takes back only what that change did)', db && db.sets);
    await P.tap('#view [data-act="finish"]', 300);
    if ((await P.modal()) && (await P.modal()).buttons.includes('Finish now')) await P.tap('#modal button:has-text("Finish now")', 300);
    const m = await P.modal(); if (m && m.kind === 'confirm') await mOk(P);
    await wait(300);
    const s = await P.ev(() => { const L = window.__ironlog; return L.state.sessions.find(x => x.id !== 'last' && x.id !== 'db'); });
    ok(s && s.ex.map(b => b.exId).join() === 'bench,dbBench' && s.ex.every(b => b.sets.length === 1), 'L-28: Finish saves both: the bench\'s set and the dumbbell bench\'s', s && s.ex.map(b => [b.exId, b.sets.length]));
    await P.close();
  }

  /* ---------- L-23, L-24, L-28 and L-29: a swap keeps the rows an exercise has now (moved from tests/r24.js in 2.52, every check kept) ----------
     One change in a session never undoes another: a swap keeps the number of sets the exercise has right now (after
     Short on time, a lighter day, a deload, + Set or − Set), through a second swap, Undo, a reload and Finish; a date
     change keeps set counts and typed loads; a session left open by r23 carries on. Kept as r24 wrote them, on the
     demo's routine, each check named by its rule. */
  if (run('L-23') || run('L-24') || run('L-28') || run('L-29')) {
    let ok = okAs('L-23');
    const { browser, page, errors } = await open(FILE, { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
    const ev = (f, a) => page.evaluate(f, a);
    const fresh = async () => { await ev(() => { const L = window.__ironlog; L.state.draft = null; L.state.settings.onboarded = true; if (!L.state.sessions.length) L.makeDemo(); /* r30: history here, not sample data */ for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of (L.state[k] || [])) delete x.demo; L.invalidate && L.invalidate(); L.state.deloadWeek = null; L.ui.tab = 'today'; L.ui.todayDay = 0; L.ui.modal = null; document.getElementById('modal').hidden = true; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); window.scrollTo(0, 0); }); };
    // r35: a lighter day starts from the card's Change sheet.
    const start = async (light) => { await fresh(); if (light) { await page.click('.hero [data-act="startAltOpen"]'); await page.waitForTimeout(80); await page.click('#modal [data-go="startSession"][data-light="1"]'); } else await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(120); };
    const work = (bi) => ev(b => { const x = window.__ironlog.state.draft.ex[b]; return x ? x.sets.filter(s => !s.warm && !s.drop).length : -1; }, bi);
    // Swap block bi through the real picker, to the first exercise it lists that is not already in the session.
    const swap = async (bi) => {
      await ev(b => window.__ironlog.ACT.bSwap({ dataset: { b: String(b) } }), bi);
      await page.waitForTimeout(80);
      const id = await ev(() => { const inS = new Set(window.__ironlog.state.draft.ex.map(b => b.exId)); const el = [...document.querySelectorAll('#pickList .pick[data-ex]')].find(p => !inS.has(p.dataset.ex)); if (!el) return null; el.click(); return el.dataset.ex; });
      await page.waitForTimeout(150);
      return id;
    };

    // 1. Short on time, then a swap on a trimmed exercise that has not started.
    await start();
    const trim = await ev(() => { const L = window.__ironlog; const d = L.state.draft; const before = d.ex.map(b => ({ id: b.exId, n: b.sets.length }));
      L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply();
      const after = L.state.draft.ex.map((b, bi) => ({ bi, id: b.exId, n: b.sets.length, cut: !!b.cut }));
      const t = after.find(a => a.n < (before.find(x => x.id === a.id) || {}).n);
      return { t, after }; });
    ok(!!trim.t, 'Short on time trims at least one exercise to fewer sets (' + JSON.stringify(trim.after) + ')');
    ok(trim.after.every(a => !a.cut), 'and marks none of them: since r54 a lift with fewer sets than usual is read so from the log (' + JSON.stringify(trim.after) + ')');
    const bi = trim.t.bi, nTrim = trim.t.n;
    const planSets = await ev(b => window.__ironlog.state.draft.ex[b].plan.sets, bi);
    ok(planSets > nTrim, `the routine plans more sets than were kept (${planSets} planned, ${nTrim} kept)`);
    const newId = await swap(bi);
    ok(!!newId, 'the picker offers another exercise');
    const s1 = await ev(b => { const x = window.__ironlog.state.draft.ex[b]; return { id: x.exId, n: x.sets.length, cut: !!x.cut, plan: x.plan.sets }; }, bi);
    ok(s1.id === newId && s1.n === nTrim, `after the swap the new exercise keeps the trimmed ${nTrim} sets, not the planned ${planSets} (${JSON.stringify(s1)})`);
    ok(!s1.cut, 'and no mark: the swapped-in exercise is read against its own usual, as every lift is (r54)');
    ok(s1.plan === nTrim, 'its plan says the same number of sets, so targets and grey reps follow it');

    // 2. A second swap in a row keeps it too.
    await swap(bi);
    ok(await work(bi) === nTrim, 'a second swap keeps the trimmed count');

    // 3. Undo puts back the exercise before the last swap, with the same count.
    await ev(() => window.__ironlog.ACT.undo()); await page.waitForTimeout(80);
    ok(await ev((a) => { const x = window.__ironlog.state.draft.ex[a.b]; return x.exId === a.id && x.sets.length === a.n; }, { b: bi, id: newId, n: nTrim }), 'Undo returns the previous exercise with the trimmed count');

    // 4. A reload keeps the count.
    await ev(() => window.__ironlog.saveNow());
    await page.reload(); await page.waitForFunction(() => window.__libs && window.__libs.chart); await page.waitForTimeout(150);
    ok(await ev((a) => { const x = window.__ironlog.state.draft.ex[a.b]; return x && x.sets.length === a.n; }, { b: bi, n: nTrim }), 'after a reload the swapped exercise still has the trimmed count');

    ok = okAs('L-29');
    // 5. Changing the session date re-reads targets but keeps set counts and typed loads.
    await ev((b) => { const L = window.__ironlog; const x = L.state.draft.ex[b]; x.sets[0].w = 77; L.saveNow(); L.render(); }, bi);
    const counts0 = await ev(() => window.__ironlog.state.draft.ex.map(b => b.sets.length));
    await ev(() => { const el = document.querySelector('input[data-bind="draftDate"]'); el.value = '2026-09-19'; el.dispatchEvent(new Event('change', { bubbles: true })); });
    await page.waitForTimeout(120);
    const counts1 = await ev(() => window.__ironlog.state.draft.ex.map(b => b.sets.length));
    ok(JSON.stringify(counts0) === JSON.stringify(counts1), `a date change keeps every exercise's set count (${counts0} vs ${counts1})`);
    ok(await ev(b => window.__ironlog.state.draft.ex[b].sets[0].w === 77, bi), 'a date change keeps a load you typed');

    ok = okAs('L-24');
    // 6. Swap after one set is logged on a trimmed exercise: the new one gets only the sets left.
    await start();
    const t6 = await ev(() => { const L = window.__ironlog; const n0 = Object.fromEntries(L.state.draft.ex.map(b => [b.exId, b.sets.length])); L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); const d = L.state.draft; const i = d.ex.findIndex(b => b.sets.length < n0[b.exId] && b.sets.length >= 2); return { i, n: i >= 0 ? d.ex[i].sets.length : 0 }; });
    ok(t6.i >= 0, 'a trimmed exercise with 2 or more sets exists');
    await ev(b => { const L = window.__ironlog; const s = L.state.draft.ex[b].sets[0]; s.w = s.w || 40; s.r = 8; s.done = true; L.saveNow(); L.render(); }, t6.i);
    await swap(t6.i);
    const s6 = await ev(b => { const d = window.__ironlog.state.draft; return { old: d.ex[b].sets.length, oldCut: !!d.ex[b].cut, nw: d.ex[b + 1].sets.length, nwCut: !!d.ex[b + 1].cut }; }, t6.i);
    ok(s6.old === 1 && s6.nw === t6.n - 1, `the logged set stays and the new exercise takes the ${t6.n - 1} left (${JSON.stringify(s6)})`);
    ok(!s6.oldCut && !s6.nwCut, 'and neither half is marked (r54)');

    ok = okAs('L-23');
    // 7. Lighter day: a swap keeps half the sets.
    await start(true);
    const n7 = await work(0);
    await swap(0);
    ok(await work(0) === n7, `a lighter day's swap keeps its ${n7} sets`);

    // 8. + Set and − Set, then a swap: the count you chose stays.
    await start();
    const n8 = await work(1);
    await ev(() => { const L = window.__ironlog; L.ACT.sAdd({ dataset: { b: '1' } }); L.ACT.sAdd({ dataset: { b: '1' } }); });
    await swap(1);
    ok(await work(1) === n8 + 2, `+ Set twice then a swap keeps ${n8 + 2} sets (got ${await work(1)})`);
    const n8b = await work(2);
    await ev(() => document.querySelector('[data-act="sDel"][data-b="2"]').click()); await page.waitForTimeout(60);
    await swap(2);
    ok(await work(2) === n8b - 1, `− Set then a swap keeps ${n8b - 1} sets (got ${await work(2)})`);

    // 9. Deload week: a swap keeps the deload count.
    await fresh();
    await ev(() => { const L = window.__ironlog; L.state.deloadWeek = L.weekStart(L.today()); L.render(); });
    await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(120);
    const n9 = await work(0);
    await swap(0);
    ok(await work(0) === n9 && await ev(() => !!window.__ironlog.state.draft.deload), `a deload session's swap keeps its ${n9} sets`);
    await ev(() => { window.__ironlog.state.deloadWeek = null; });

    ok = okAs('L-28');
    // 10. Finishing a trimmed, swapped session: nothing is marked, and the lifts trimmed below their usual read so from the log (r54).
    await start();
    const f0 = await ev(() => Object.fromEntries(window.__ironlog.state.draft.ex.map(b => [b.exId, b.sets.length])));
    const f = await ev(() => { const L = window.__ironlog; const n0 = Object.fromEntries(L.state.draft.ex.map(b => [b.exId, b.sets.length])); L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); const d = L.state.draft; return d.ex.findIndex(b => b.sets.length < n0[b.exId] && !b.sets.some(s => s.done)); });
    // The trimmed lifts left in place, with their sets as Short on time left them, all done.
    const kept = await ev(([f, f0]) => { const L = window.__ironlog; const d = L.state.draft; const out = []; d.ex.forEach((b, i) => { if (i === f || b.sets.length >= f0[b.exId]) return; b.sets.forEach(s => { s.w = s.w == null ? L.greyW(b, b.sets.indexOf(s)) || 30 : s.w; s.r = 10; s.done = true; }); out.push(b.exId); }); L.saveNow(); return out; }, [f, f0]);
    const fid = await swap(f);
    await ev(b => { const L = window.__ironlog; const x = L.state.draft.ex[b]; x.sets.forEach(s => { s.w = s.w == null ? 30 : s.w; s.r = 10; s.done = true; }); L.saveNow(); }, f);
    const saved = await ev(async ([id, kept]) => { const L = window.__ironlog; const n0 = L.state.sessions.length; L.state.draft.ex = L.state.draft.ex.filter(b => b.sets.some(s => s.done)); L.ACT.finish(); await new Promise(r => setTimeout(r, 200)); const btn = document.querySelector('#modal [data-act="finishGo"],#modal [data-act="finishConfirm"]'); if (btn) { btn.click(); await new Promise(r => setTimeout(r, 200)); } const s = L.state.sessions[L.state.sessions.length - 1]; const b = s && s.ex.find(x => x.exId === id); const I = L.IDX(); const read = kept.map(k => { const x = (I.byEx[k] || []).find(q => q.sid === s.id); return { id: k, short: x ? x.short || null : 'none' }; }); return { grew: L.state.sessions.length > n0, saved: !!b, marks: s ? s.ex.filter(x => x.cut).length : -1, read }; }, [fid, kept]);
    ok(saved.grew && saved.saved && saved.marks === 0, 'the session is saved, the swapped-in exercise with it, and no exercise carries a trimmed mark (' + JSON.stringify(saved) + ')');
    ok(saved.read.length > 0 && saved.read.every(r => r.short === 'sets'), 'each lift Short on time left with fewer sets than its usual reads as short of its usual by its sets, so it sets no target (' + JSON.stringify(saved.read) + ')');

    ok = okAs('L-23');
    // 11. A session left open by the live build (r23, no stored suggestion) carries on here.
    const O = await open('baselines/r23.html', { browser, touch: true, clock: '2026-09-20T10:00:00' });
    await O.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); /* r30: history here, not sample data */ for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of (L.state[k] || [])) delete x.demo; L.invalidate && L.invalidate(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
    await O.page.click('.hero [data-act="startSession"]:not([data-light])'); await O.page.waitForTimeout(120);
    const old = await O.page.evaluate(() => { const L = window.__ironlog; L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); L.saveNow(); return JSON.parse(localStorage.getItem('ironlog.v1')); });
    await O.ctx.close();
    const N = await open(FILE, { browser, touch: true, state: old, stateOnce: false, clock: '2026-09-20T10:00:00' });
    const nb = await N.page.evaluate(() => { const d = window.__ironlog.state.draft; return d ? { n: d.ex.map(b => b.sets.length), sw: d.ex.map(b => b.sw), cut: d.ex.findIndex(b => b.cut) } : null; });
    ok(nb && nb.n.join() === old.draft.ex.map(b => b.sets.length).join() && nb.sw.every(v => v === undefined), 'an r23 session in progress loads with its trimmed counts and no stored suggestion (' + JSON.stringify(nb) + ')');
    await N.page.evaluate((b) => window.__ironlog.ACT.bSwap({ dataset: { b: String(b) } }), nb.cut); await N.page.waitForTimeout(80);
    await N.page.evaluate(() => { const inS = new Set(window.__ironlog.state.draft.ex.map(b => b.exId)); [...document.querySelectorAll('#pickList .pick[data-ex]')].find(p => !inS.has(p.dataset.ex)).click(); }); await N.page.waitForTimeout(150);
    // r23 filled its rows with the suggested load and stored none, so its rows read as typed: they stay with that exercise, and the mark r23 stored on it is kept as stored (normalize keeps it; nothing reads it since r54).
    ok(await N.page.evaluate((a) => { const x = window.__ironlog.state.draft.ex[a.b]; return x.sets.length === a.n && !!x.cut; }, { b: nb.cut, n: nb.n[nb.cut] }), 'a swap in that session keeps its trimmed count, and the mark r23 stored stays as stored');
    ok(!N.errors.length, 'no page errors loading an r23 session (' + N.errors.join(' | ') + ')');
    await N.ctx.close();

    ok(!errors.length, 'no page errors (' + errors.join(' | ') + ')');
    await browser.close();
  }

  /* ---------- L-30: the check-in: three questions, a tap each, kept with the session ---------- */
  if (run('L-30')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    await P.tap('#view [data-act="chkOpen"]', 250);
    const qs = await P.ev(() => [...document.querySelectorAll('#modal .ci-row')].map(r => [r.querySelector('span').innerText, ...[...r.querySelectorAll('[data-act="chk"]')].map(b => b.innerText)].join(' ')));
    ok(JSON.stringify(qs) === JSON.stringify(['Sleep Poor OK Good', 'Energy Low OK High', 'Aches Sore A little None']), 'L-30: "Check-in" asks three questions, worst answer first: sleep, energy and aches', qs);
    const pressed = () => P.ev(() => [...document.querySelectorAll('#modal [data-act="chk"][aria-pressed="true"]')].map(b => b.dataset.k + b.dataset.v).join());
    await P.tap('#modal [data-act="chk"][data-k="sleep"][data-v="1"]', 150);
    ok((await pressed()) === 'sleep1', 'L-30: a tap answers', await pressed());
    await P.tap('#modal [data-act="chk"][data-k="sleep"][data-v="1"]', 150);
    ok((await pressed()) === '' && !(await P.draft()).chk, 'L-30: the same tap again clears it', await P.draft().then(d => d.chk));
    await P.tap('#modal [data-act="chk"][data-k="sleep"][data-v="1"]', 150); await P.tap('#modal [data-act="chk"][data-k="energy"][data-v="2"]', 150);
    ok(!!(await P.modal()), 'L-30: two answers keep the sheet open');
    await P.tap('#modal [data-act="chk"][data-k="joints"][data-v="3"]', 250);
    ok(!(await P.modal()), 'L-30: the third answer closes it');
    const label = await P.ev(() => document.querySelector('#view [data-act="chkOpen"]').getAttribute('aria-label'));
    ok(label === 'Check-in: sleep poor, energy OK, aches none', 'L-30: the button then reads the answers', label);
    await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(300);
    ok(JSON.stringify((await P.draft()).chk) === JSON.stringify({ sleep: 1, energy: 2, joints: 3 }), 'L-30: the answers are kept with the workout', (await P.draft()).chk);
    await P.close();
  }

  /* ---------- L-31: what a low check-in offers ---------- */
  if (run('L-31')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    const card = () => P.ev(() => { const c = document.getElementById('readyCard'); return c ? { text: c.innerText.replace(/\s+/g, ' ').trim(), acts: [...c.querySelectorAll('button[data-act]')].map(b => b.dataset.act + ':' + b.innerText.trim()).filter(x => !/^tip/.test(x)) } : null; });
    ok(!(await card()), 'L-31: no answers, nothing offered');
    await P.tap('#view [data-act="chkOpen"]', 250); await P.tap('#modal [data-act="chk"][data-k="sleep"][data-v="1"]', 150); await P.tap('#modal [data-act="chk"][data-k="energy"][data-v="3"]', 150);
    let c = await card();
    ok(c && c.text === 'Keep the loads. Leave an extra rep in reserve if it feels heavy.', 'L-31: one low answer (sleep poor): "Keep the loads. Leave an extra rep in reserve if it feels heavy."', c);
    await P.tap('#modal [data-act="chk"][data-k="energy"][data-v="1"]', 150);
    c = await card();
    ok(c && /^Low readiness today\./.test(c.text) && c.acts.includes('makeLight:Make it lighter') && c.acts.includes('shortOpen:Short on time'), 'L-31: two low answers: "Low readiness today.", with "Make it lighter" and "Short on time"', c);
    await P.close();
  }

  /* ---------- L-32: Make it lighter: only the exercises not started, half their sets at lighter loads, with Undo ---------- */
  if (run('L-32')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    const lowCheckin = async () => { await P.tap('#view [data-act="chkOpen"]', 250); await P.tap('#modal [data-act="chk"][data-k="sleep"][data-v="1"]', 150); await P.tap('#modal [data-act="chk"][data-k="energy"][data-v="1"]', 150); await P.tap('#modal [data-act="chk"][data-k="joints"][data-v="3"]', 250); };
    await P.tap(tick(0, 0));
    await lowCheckin();
    const raises0 = await P.rows(1), bench0 = await P.rows(0);
    await P.tap('#readyCard [data-act="makeLight"]', 300);
    const b0 = await P.rows(0), b1 = await P.rows(1), d = await P.draft();
    ok(JSON.stringify(b0) === JSON.stringify(bench0), 'L-32: the bench, started, stays exactly as it was', { before: bench0, after: b0 });
    ok(b1.length === 1, 'L-32: the raises, not started, keep half their sets, rounded up (2 to 1)', b1);
    // 90% of 20 lb is 18; the heaviest whole dumbbell step at or under it is 15 (P-26).
    ok(b1[0].w === '~15' && b1[0].r === '~10', 'L-32: at a lighter load in whole steps (15 lb, from 20) for the bottom of the range (10), nothing to beat', b1);
    ok((await P.toasts()).includes('Made 1 exercise lighter'), 'L-32: it says "Made 1 exercise lighter", what the tap did; the card says how (V, 2026-11-14: no over-explaining)', await P.toasts());
    ok(d.notes === 'Made lighter after the check-in: exercises not started, half sets at about 90% loads.' && !d.light, 'L-32: the session\'s note says so; the session itself is not marked lighter', { notes: d.notes, light: d.light });
    const card = await P.ev(() => { const c = document.getElementById('readyCard'); return c ? c.innerText.replace(/\s+/g, ' ').trim() : ''; });
    ok(card === 'Made lighter: the exercises not started are half the sets at about 90% loads.' && !(await P.ev(() => !!document.querySelector('[data-act="makeLight"]'))), 'L-32: the card then says what was done instead of offering it again', card);
    await undoToast(P);
    ok(JSON.stringify(await P.rows(1)) === JSON.stringify(raises0) && !(await P.draft()).notes, 'L-32: Undo puts the raises back as they were, and the note with them', { before: raises0, after: await P.rows(1) });
    // A note typed first is kept as typed.
    await P.ev(() => { const L = window.__ironlog; L.act(() => { L.state.draft.notes = 'Left shoulder tight'; }, { inProgress: true }); L.render(); });
    await P.tap('#readyCard [data-act="makeLight"]', 300);
    ok((await P.draft()).notes === 'Left shoulder tight', 'L-32: a note you typed stays as typed', (await P.draft()).notes);
    await P.close();
  }

  /* ---------- L-33: made lighter, a lift sets no target; done at full effort, it does ---------- */
  if (run('L-33')) {
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    const raises0 = await P.rows(1);
    await P.page.fill(field('r', 0, 0), '9'); await P.tap(tick(0, 0)); await P.tap(tick(0, 1)); await P.tap(tick(0, 2));
    await P.tap('#view [data-act="chkOpen"]', 250); for (const k of ['sleep', 'energy', 'joints']) await P.tap(`#modal [data-act="chk"][data-k="${k}"][data-v="1"]`, 150);
    await P.tap('#readyCard [data-act="makeLight"]', 300);
    await P.tap(tick(1, 0));
    await P.tap('#view [data-act="finish"]', 400);
    const m = await P.modal(); if (m && m.kind === 'confirm') await mOk(P);
    await wait(300);
    await P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    await P.page.click('#tabs [data-tab="history"]'); await wait(250);
    // The session opened by its row, as a lifter opens it.
    const sid = await P.ev(() => window.__ironlog.state.sessions.find(s => s.id !== 'last').id);
    await P.tap(`#view [data-act="histToggle"][data-id="${sid}"]`, 250);
    const hist = await P.ev(() => document.getElementById('view').innerText);
    ok(/Check-in: sleep poor, energy low, aches sore/.test(hist), 'L-30: History shows the saved session\'s check-in', hist.slice(0, 400));
    // The next week's session: the bench's target comes from today's 185 x 9, 8, 7; the raises' from the last full one.
    await P.ev(() => { const L = window.__ironlog; L.state.sessions.forEach(s => { if (s.id !== 'last') s.date = '2026-11-10'; }); L.invalidate(); L.saveNow(); });
    await start(P);
    const b = await P.rows(0), r = await P.rows(1);
    ok(b.map(x => x.r).join() === '~9,~8,~7', 'L-33: the bench, done at full effort, sets next time\'s target: 185 x 9, 8, 7 to beat', b);
    ok(JSON.stringify(r) === JSON.stringify(raises0), 'L-33: the raises, made lighter, set none: next time asks what it asked before (20 x 12, 12)', { before: raises0, after: r });
    await P.close();
  }

  /* ---------- L-34: a lighter day from Today ---------- */
  if (run('L-34')) {
    const P = await lifter({ settings: { autoDone: false } });
    await P.page.click('#tabs [data-tab="today"]'); await wait(120);
    await P.tap('#view .hero [data-act="startAltOpen"]', 250);
    const label = await P.ev(() => (document.querySelector('#modal [data-go="startSession"][data-light="1"]') || {}).innerText || '');
    await P.tap('#modal [data-go="startSession"][data-light="1"]', 300);
    const d = await P.draft(), b0 = await P.rows(0), b1 = await P.rows(1);
    ok(d && d.light && d.dayName === 'Push (lighter)', 'L-34: "' + label.replace(/\s+/g, ' ').trim() + '" on Today\'s Change sheet starts the day lighter: "Push (lighter)"', d && { light: d.light, name: d.dayName });
    ok(b0.length === 2 && b1.length === 1, 'L-34: every lift with half its sets, rounded up (3 to 2, 2 to 1)', [b0.length, b1.length]);
    ok(b0.every(x => x.w === '~165' && x.r === '~6') && b1[0].w === '~15' && b1[0].r === '~10', 'L-34: at about 90% loads in whole steps (185 to 165, 20 to 15) for the bottom of the range, nothing to beat', { b0, b1 });
    await P.tap('#view [data-act="chkOpen"]', 250); for (const k of ['sleep', 'energy']) await P.tap(`#modal [data-act="chk"][data-k="${k}"][data-v="1"]`, 150);
    ok(!(await P.ev(() => !!document.getElementById('readyCard'))), 'L-34: a low check-in offers nothing more on a lighter day');
    await P.close();
  }

  /* ---------- L-35: the workout's clock starts at its first set ticked or cardio logged, not when it is opened ---------- */
  if (run('L-35')) {
    // The time on the page's clock a stored start reads as, "10:31".
    const hm = t => P => P.ev(t => { if (!t) return null; const d = new Date(t); return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'); }, t);
    const meta = P => P.ev(() => { const m = document.querySelector('#view .ph .meta'); return m ? m.innerText.replace(/\s+/g, ' ').trim() : null; });
    const at = (P, time) => P.ev(t => { window.__setClock(t); }, DAY + 'T' + time + ':00');
    // A routine day set up ahead: opened at 10:00 and left, resumed at the gym at 10:30, its first set ticked at 10:31.
    const P = await lifter({ settings: { autoDone: false }, movable: true });
    await start(P);
    const m0 = await meta(P);
    ok(/^Not started · ~\d+ min left$/.test(m0) && !(await P.draft()).begunAt, 'L-35: opened, the workout reads "Not started", its clock not running', { meta: m0, begunAt: (await P.draft()).begunAt });
    await P.tap('#view [data-act="wkAway"]', 300);
    await at(P, '10:30');
    await P.tap('#view [data-act="wkResume"]', 300);
    const m1 = await meta(P);
    ok(/^Not started/.test(m1), 'L-35: resumed half an hour later, still "Not started" until a set is ticked', m1);
    await at(P, '10:31');
    await P.tap(tick(0, 0));
    const m2 = await meta(P);
    ok(/^Started 10:31 AM · ~\d+ min left$/.test(m2), 'L-35: the first set ticked starts it: "Started 10:31 AM"', m2);
    await at(P, '11:16');
    for (const [b, s] of [[0, 1], [0, 2], [1, 0], [1, 1]]) await P.tap(tick(b, s));
    await P.tap('#view [data-act="finish"]', 400);
    const fm = await P.modal(); if (fm && fm.kind === 'confirm') await mOk(P);
    await wait(300);
    const s = await P.ev(() => window.__ironlog.state.sessions.find(x => x.id !== 'last') || null);
    ok(s && s.durMin === 45, 'L-35: saved with the minutes from its first set to Finish (45), not from when it was opened (76)', s && s.durMin);
    ok(s && (await hm(s.t)(P)) === '10:31', 'L-35: and saved as begun at 10:31, its first set', s && (await hm(s.t)(P)));
    await P.close();

    // A blank session set up ahead: not started either.
    const Q = await lifter({ movable: true });
    await Q.page.click('#tabs [data-tab="today"]'); await wait(120);
    await Q.tap('#view .hero [data-act="startAltOpen"]', 250);
    await Q.tap('#modal [data-go="startFree"]', 300);
    if (await Q.ev(() => !!window.__ironlog.ui.modal)) await Q.ev(() => window.__ironlog.ACT.mClose());
    await wait(150);
    const q0 = await meta(Q), qd = await Q.draft();
    ok(qd && qd.free && /Not started/.test(q0) && !qd.begunAt, 'L-35: a blank session opened reads "Not started" too', { meta: q0, free: qd && qd.free, begunAt: qd && qd.begunAt });
    await Q.close();

    // Cardio before lifting: a row added starts nothing; its minutes logged at 10:20 start the clock there.
    const C = await lifter({ movable: true });
    await start(C);
    await C.tap('#view details[data-sk="logger:cardio"] > summary', 200);
    await C.tap('#view [data-act="cDraftAdd"][data-when="pre"]', 250);
    ok(!(await C.draft()).begunAt, 'L-35: "+ Before lifting" alone starts nothing', (await C.draft()).begunAt);
    await at(C, '10:20');
    await C.page.fill('#view input[data-cf="min"][data-c="0"]', '10'); await wait(600);
    const cd = await C.ev(() => JSON.parse(localStorage.getItem('ironlog.v1')).draft);
    ok(cd && cd.cardio[0].min === 10 && (await hm(cd.begunAt)(C)) === '10:20', 'L-35: its minutes logged start the clock then (10:20), and it is saved', cd && { min: cd.cardio[0] && cd.cardio[0].min, started: await hm(cd.begunAt)(C) });
    await C.close();

    // The review of 2.52 (REV13-2): a lifter who types reps and does not tick, Finish marking the rows done. The first
    // reps entered begin the workout, so it is timed from them, not left untimed.
    const E = await lifter({ settings: { autoDone: false }, movable: true });
    await start(E);
    await at(E, '10:05');
    await E.page.fill(field('r', 0, 0), '8'); await wait(500);
    const e1 = await meta(E);
    ok(/^Started 10:05 AM/.test(e1), 'L-35: reps entered on a set, not ticked, start it too: "Started 10:05 AM" (REV13-2)', e1);
    await at(E, '10:50');
    for (const [b, k, r] of [[0, 1, '8'], [0, 2, '7'], [1, 0, '12'], [1, 1, '12']]) await E.page.fill(field('r', b, k), r);
    await wait(500);
    await E.tap('#view [data-act="finish"]', 300);
    let em = await E.modal();
    ok(em && em.title === 'Some sets are not marked done', 'L-35: (setup) Finish asks about the rows with reps and no tick', em && em.title);
    await mOk(E);
    while (await E.modal()) { const mm = await E.modal(); if (mm.kind === 'confirm') await mOk(E); else { await E.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } }
    const es = await E.ev(() => window.__ironlog.state.sessions.find(x => x.id !== 'last') || null);
    ok(es && es.durMin === 45 && (await hm(es.t)(E)) === '10:05', 'L-35: saved with 45 minutes, from the first reps entered (10:05) to Finish (10:50) (REV13-2: untimed)', es && { durMin: es.durMin, began: await hm(es.t)(E) });
    await E.close();

    // REV13-4: a set ticked by mistake while setting up, and unticked: nothing has begun, so it is not started again.
    const U = await lifter({ settings: { autoDone: false }, movable: true });
    await start(U);
    await at(U, '10:01');
    await U.tap(tick(0, 0)); await U.tap(tick(0, 0));
    const u1 = await meta(U);
    ok(/^Not started/.test(u1) && !(await U.draft()).begunAt, 'L-35: a tick taken back, with nothing else entered, leaves it "Not started" (REV13-4)', u1);
    await at(U, '10:31');
    await U.tap(tick(0, 0));
    await at(U, '11:16');
    for (const [b, k] of [[0, 1], [0, 2], [1, 0], [1, 1]]) await U.tap(tick(b, k));
    await U.tap('#view [data-act="finish"]', 400);
    const um = await U.modal(); if (um && um.kind === 'confirm') await mOk(U);
    await wait(300);
    const us = await U.ev(() => window.__ironlog.state.sessions.find(x => x.id !== 'last') || null);
    ok(us && us.durMin === 45 && (await hm(us.t)(U)) === '10:31', 'L-35: and timed from the set that began it (10:31 to 11:16, 45 minutes), not the tick taken back (REV13-4: 75)', us && { durMin: us.durMin, began: await hm(us.t)(U) });
    await U.close();

    // REV13-3: opened before midnight, first set after it: a workout of the day it began (NEW-132's rule, below),
    // timed from its first set.
    const N = await lifter({ settings: { autoDone: false }, movable: true, day: '2026-11-10' });
    await N.ev(() => window.__setClock('2026-11-10T23:50:00'));
    await start(N);
    await N.ev(() => window.__setClock('2026-11-11T00:05:00'));
    await N.tap(tick(0, 0));
    await N.ev(() => window.__setClock('2026-11-11T00:50:00'));
    for (const [b, k] of [[0, 1], [0, 2], [1, 0], [1, 1]]) await N.tap(tick(b, k));
    await N.tap('#view [data-act="finish"]', 400);
    const nm = await N.modal(); if (nm && nm.kind === 'confirm') await mOk(N);
    await wait(300);
    const ns = await N.ev(() => window.__ironlog.state.sessions.find(x => x.id !== 'last') || null);
    ok(ns && ns.date === '2026-11-11' && ns.durMin === 45, 'L-35: opened at 23:50, first set at 0:05, Finish at 0:50: saved on the day it began, with 45 minutes (REV13-3: untimed)', ns && { date: ns.date, durMin: ns.durMin });
    await N.close();

    // NEW-132: set up the evening before (21:00, Save and leave), lifted the next morning. Its first set makes it that
    // day's workout: the date field moves to it, and it is saved there, timed from its first set.
    const V = await lifter({ settings: { autoDone: false }, movable: true, day: '2026-11-10' });
    await V.ev(() => window.__setClock('2026-11-10T21:00:00'));
    await start(V);
    await V.tap('#view [data-act="wkAway"]', 300);
    await V.ev(() => { window.__setClock('2026-11-11T10:30:00'); const L = window.__ironlog; L.render(); });
    await V.tap('#view [data-act="wkResume"]', 300);
    const vd0 = await V.ev(() => document.querySelector('#view input[data-bind="draftDate"]').value);
    await V.ev(() => window.__setClock('2026-11-11T10:31:00'));
    await V.tap(tick(0, 0));
    const vd1 = await V.ev(() => document.querySelector('#view input[data-bind="draftDate"]').value);
    ok(vd0 === '2026-11-10' && vd1 === '2026-11-11', 'L-35: set up the evening before, its first set the next morning moves it to that day (NEW-132)', { before: vd0, after: vd1 });
    await V.ev(() => window.__setClock('2026-11-11T11:16:00'));
    for (const [b, k] of [[0, 1], [0, 2], [1, 0], [1, 1]]) await V.tap(tick(b, k));
    await V.tap('#view [data-act="finish"]', 400);
    const vm = await V.modal(); if (vm && vm.kind === 'confirm') await mOk(V);
    await wait(300);
    const vs = await V.ev(() => window.__ironlog.state.sessions.find(x => x.id !== 'last') || null);
    ok(vs && vs.date === '2026-11-11' && vs.durMin === 45, 'L-35: and it is saved on that day with 45 minutes, its first set to Finish (NEW-132: saved under the evening before, untimed)', vs && { date: vs.date, durMin: vs.durMin });
    await V.close();

    // A date set by hand stays: opened today, its date set to yesterday to log it there, then a set ticked.
    const H = await lifter({ settings: { autoDone: false }, movable: true });
    await start(H);
    await H.page.fill('#view input[data-bind="draftDate"]', '2026-11-10'); await H.page.dispatchEvent('#view input[data-bind="draftDate"]', 'change'); await wait(300);
    await at(H, '10:31');
    await H.tap(tick(0, 0));
    const hd = await H.ev(() => window.__ironlog.state.draft.date);
    ok(hd === '2026-11-10', 'L-35: a date set by hand stays when the first set is ticked (NEW-132)', hd);
    await H.close();
  }

  /* ---------- L-36: a ticked set keeps what the app asked of it (391) ---------- */
  if (run('L-36')) {
    /* V, 2026-11-05 and 2026-11-12: kept beside what was done, for an engine that later learns how a lifter answers
       what is asked, and shown only when asked for (a setting, off). Asked of each working set: the exercise's
       suggested load and the row's grey reps. A load typed over it is kept as typed, beside what was asked. */
    const P = await lifter({ settings: { autoDone: false } });
    await start(P);
    const sw = (await P.draft()).ex[0].sw;
    await P.tap(tick(0, 0));
    await P.page.fill(field('w', 0, 1), '190'); await P.page.fill(field('r', 0, 1), '8'); await P.tap(tick(0, 1));
    await P.tap(tick(0, 2));
    const d = await P.draft();
    const sg = d.ex[0].sets.map(x => x.sg || null);
    ok(sw != null && Math.abs(sw - 185 * LB) < 1e-6 && JSON.stringify(sg) === JSON.stringify([[sw, 8], [sw, 8], [sw, 7]]), 'L-36: each set ticked keeps what was asked of it: the suggested 185 and the grey reps 8, 8 and 7', { sw, sg });
    ok(Math.abs(d.ex[0].sets[1].w - 190 * LB) < 1e-6, 'L-36: a load typed over the asked one is kept as typed, beside it', d.ex[0].sets[1].w);
    await P.tap('#view [data-act="finish"]', 400);
    while (await P.modal()) { const mm = await P.modal(); if (mm.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } }
    const saved = await P.ev(() => window.__ironlog.state.sessions.find(x => x.id !== 'last'));
    const bench = saved && saved.ex.find(b => b.exId === 'bench');
    ok(bench && JSON.stringify(bench.sets.map(x => x.sg || null)) === JSON.stringify([[sw, 8], [sw, 8], [sw, 7]]) && bench.sets.every(x => Object.keys(x).pop() === 'sg'), 'L-36: Finish saves it with each set, last among its fields', bench && bench.sets);
    // History: not shown until asked for in Settings.
    await P.tap('#tabs [data-tab="history"]', 200); await P.tap(`#view [data-act="histToggle"][data-id="${saved.id}"]`, 200);
    let h = await P.ev(() => document.getElementById('view').innerText.replace(/\s+/g, ' '));
    ok(!/Asked:/.test(h), 'L-36: History does not show it by default', h.slice(0, 200));
    await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:timer'] = true; L.render(); document.querySelectorAll('#view details').forEach(x => { x.open = true; }); });
    await wait(150);
    await P.page.click('#view input[data-bind="askedShow"]'); await wait(250);
    ok(await P.ev(() => window.__ironlog.state.settings.askedShow === true), 'L-36: Settings turns it on');
    h = await P.ev(id => { const L = window.__ironlog; L.ui.tab = 'history'; L.ui.histOpen = id; L.render(); return document.getElementById('view').innerText.replace(/\s+/g, ' '); }, saved.id);
    ok(/Asked: 185×8, 185×8, 185×7/.test(h), 'L-36: then History lists what was asked under what was done: "Asked: 185×8, 185×8, 185×7"', (h.match(/Barbell Bench Press[^]*?Asked:[^.]*/) || [h.slice(0, 300)])[0]);
    // An edit from History keeps what was asked when the set was first ticked, whatever it asks now.
    await P.tap(`#view [data-act="histEdit"][data-id="${saved.id}"]`, 300);
    await P.tap(tick(0, 2)); await P.page.fill(field('r', 0, 2), '9'); await P.tap(tick(0, 2));
    await P.tap('#view [data-act="finish"]', 300);
    while (await P.modal()) { const mm = await P.modal(); if (mm.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } }
    const ed = await P.ev(id => window.__ironlog.state.sessions.find(x => x.id === id).ex.find(b => b.exId === 'bench').sets.map(x => [x.r, x.sg || null]), saved.id);
    ok(ed[2][0] === 9 && JSON.stringify(ed.map(x => x[1])) === JSON.stringify([[sw, 8], [sw, 8], [sw, 7]]), 'L-36: an edit keeps what was asked when each set was first ticked', ed);
    await P.close();
    // A workout typed in afterwards was not done to what was asked: it keeps none.
    const Q = await lifter({ settings: { autoDone: false } });
    await start(Q);
    await Q.ev(() => { const L = window.__ironlog; L.state.draft.past = true; L.render(); });
    await Q.tap(tick(0, 0));
    const qd = await Q.draft();
    ok(qd.ex[0].sets[0].done && !qd.ex[0].sets[0].sg, 'L-36: a set ticked in a workout typed in afterwards keeps nothing asked', qd.ex[0].sets[0]);
    await Q.close();
    // Sets typed in the lift's quick entry ("185x8, 8, 7") are ticked by the app, each keeping what was asked of it as a
    // set ticked by its button does (REV15-7: they kept nothing).
    const R = await lifter({ settings: { autoDone: false } });
    await start(R);
    const rsw = (await R.draft()).ex[0].sw;
    await R.ev(() => window.__ironlog.ACT.bQuick({ dataset: { b: '0' } })); await wait(250);
    await R.page.fill('#qTxt', '185x8, 8, 7'); await R.tap('#modal [data-act="qFill"]', 400);
    const rd = (await R.draft()).ex[0].sets.filter(x => x.done).map(x => x.sg || null);
    ok(rd.length === 3 && JSON.stringify(rd) === JSON.stringify([[rsw, 8], [rsw, 8], [rsw, 7]]), 'L-36: sets typed in quick entry keep what was asked of each, as sets ticked by their button do (REV15-7)', rd);
    await R.close();
  }

  /* ---------- L-37: the live line against the target says a previous best only when it reads differently ---------- */
  if (run('L-37')) {
    /* A set heavier than the target beats it by its estimate (Brzycki to 10 reps to failure, Epley past it); the best
       before it is said beside it only when it shows as another number, as the recap and the PR message say it. In kg,
       estimates show to the half kilo: 97.5 x 9 at 2 in reserve is 133.25 kg, 133.5 shown; 100 x 8 at 2 is 133.33, also
       133.5 shown, so "previous best 133.5" beside it would read as no gain. 105 x 8 at 2 is 140, past it. */
    const e1 = (w, rtf) => (rtf <= 10 ? (w * 36) / (37 - rtf) : w * (1 + rtf / 30));
    const half = v => String(Math.round(v * 2) / 2);
    for (const [w, r, says] of [
      [100, 8, `Beaten by load: ${half(e1(100, 10))} kg estimated`],
      [105, 8, `Beaten by load: ${half(e1(105, 10))} kg estimated, previous best ${half(e1(97.5, 11))}`]
    ]) {
      const P = await lifter({ items: [['bench', 3, 6, 10, REST_BENCH]], settings: { unit: 'kg', autoDone: false },
        seed: (S) => { S.sessions = [{ id: 'last', date: '2026-11-07', dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'bench', rr: [6, 10], ps: 3, sets: [9, 9, 9].map(r => ({ w: 97.5, r, rir: 2, done: true })) }] }]; } });
      await start(P);
      for (const [f, v] of [['w', w], ['r', r]]) { await P.page.click(field(f, 0, 0)); await P.page.fill(field(f, 0, 0), ''); await P.page.keyboard.type(String(v)); }
      await P.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(80);
      await P.tap(btn('rirOpen', 0, 0), 100); await P.tap('#view [data-act="rirPick"][data-b="0"][data-s="0"][data-v="2"]', 100);
      await P.tap(tick(0, 0), 200);
      if (await P.modal()) await mOk(P);
      const line = await P.ev(() => { const e = document.getElementById('tp-0'); return e ? e.innerText.trim() : ''; });
      ok(half(e1(100, 10)) === half(e1(97.5, 11)) && line.endsWith(says), `L-37: in kg after 97.5 x 9 x 3, ${w} x ${r} at 2 in reserve reads "${says}"`, line);
      await P.close();
    }
  }

  /* ---------- L-39: the unit switched on a lift already started, or in an edit: only the words change ---------- */
  if (run('L-39')) {
    /* Minus and plus on a lift switched to the other unit with a set done in the first: the next set's load is a load
       typed in lb, which no kg load is, so the steps land on loads that exist in kg (NEW-160). 185 lb done, the bench
       in kg: plus on set 2 is 85 kg, the nearest load a 5 kg step makes from the bar (P-39), then 90; minus twice from
       there, 85 and 80; never 88.9 or 93.9, which no plates make. A drop set under it is 60 kg (whole steps down from
       85 to the first at or under 75% of 83.9), never 58.9. */
    const P = await lifter();
    await start(P);
    await P.tap(btn('sDone', 0, 0), 250);
    await toUnit(P, 0, 'kg');
    await P.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    const step = d => P.tap(`#view [data-act="sStep"][data-b="0"][data-sf="w"][data-d="${d}"]`, 200);
    const set2 = () => P.ev(() => { const s = window.__ironlog.state.draft.ex[0].sets[1]; return { w: s.w == null ? null : Math.round(s.w * 1000) / 1000, shown: document.querySelector('#view input[data-f="w"][data-b="0"][data-s="1"]').value }; });
    const got = [];
    await step('1'); got.push(await set2()); await step('1'); got.push(await set2()); await step('-1'); await step('-1'); got.push(await set2());
    ok(JSON.stringify(got.map(x => x.w)) === '[85,90,80]' && got.every(x => String(x.w) === x.shown), 'L-39: plus and minus after 185 lb done and the bench switched to kg land on kg loads: 85, 90, then 80, as shown (NEW-160)', got);
    await P.tap('#view [data-act="bMenu"][data-b="0"]', 200); await P.tap('#modal [data-act="bMenuDo"][data-op="dropAdd"]', 300);
    const drop = await P.ev(() => window.__ironlog.state.draft.ex[0].sets.filter(s => s.drop).map(s => Math.round(s.w * 1000) / 1000));
    ok(JSON.stringify(drop) === '[60]', 'L-39: a drop set under 185 lb, the bench in kg: 60 kg, on the bar\'s 5 kg steps (NEW-160)', drop);
    /* A set's load in hand is counted from the nearest load; a Lighter day's target is the rule's load put on kg's loads once
       (P-45, NEW-163): 90% of 83.9 kg is 75.5, so 75 kg. */
    const lt = await P.ev(() => { const g = window.__ironlog.suggest('bench', { sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 120 }, { light: true }); return g.w == null ? null : Math.round(g.w * 1000) / 1000; });
    ok(lt === 75, 'L-39: a Lighter day\'s target from 185 lb, the bench in kg, is 75 kg, the heaviest kg load at or under 90% (P-45; 72.5 on 2.68)', lt);
    await P.close();
  }
  if (run('L-39')) {
    /* A lift with a set done keeps what it started with when its unit is tapped, as for a change of the app's unit:
       the target is worded in kg at the same load, the sets done at it still count, and Finish beats the target
       (REV17-4). In an edit of a saved session nothing is read again but the words, so no flag from today reaches the
       past session (REV17-2). */
    const P = await lifter();
    await start(P);
    for (const s of [0, 1]) { await P.page.click(field('r', 0, s)); await P.page.fill(field('r', 0, s), ''); await P.page.keyboard.type('9'); await P.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(60); await P.tap(btn('sDone', 0, s), 150); }
    const before = await P.ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { w: b.tgt && b.tgt.w, total: b.tgt && b.tgt.total }; });
    await toUnit(P, 0, 'kg');
    const mid = await P.ev(() => { const b = window.__ironlog.state.draft.ex[0]; const e = document.getElementById('blk-0'); return { w: b.tgt && b.tgt.w, total: b.tgt && b.tgt.total, prog: (e.querySelector('.bprog, .prog') || {}).textContent || e.innerText }; });
    ok(Math.abs(mid.w - before.w) < 1e-9 && mid.total === before.total && !/Nothing logged/.test(mid.prog), 'L-39: kg picked after two sets: the target keeps its load and total, the sets done still count', { before, mid });
    await P.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    await P.page.click(field('r', 0, 2)); await P.page.fill(field('r', 0, 2), ''); await P.page.keyboard.type('9'); await P.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(60);
    await P.tap(btn('sDone', 0, 2), 150);
    const finishAll = async X => { await X.tap('#view [data-act="finish"]', 300); let text = ''; for (let k = 0; k < 6; k++) { const m = await X.modal(); if (!m) break; if (m.kind === 'confirm') await mOk(X); else { if (m.kind === 'recap') text = m.text; await X.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } } return text; };
    const rec = await finishAll(P);
    ok(/1 of \d exercise targets? beaten/.test(rec) && !/ 0 of/.test(' ' + rec), 'L-39: Finish counts the bench\'s target beaten', rec);
    await P.close();
    // An edit: today chest flagged; the last session opened from History, KG tapped, saved: nothing from today reaches it.
    const E = await lifter();
    const sid = 'last';
    await E.ev(() => { const L = window.__ironlog; L.state.injuries = [{ id: 'i1', m: 'chest', note: '', date: L.today() }]; L.invalidate(); L.saveNow(); L.ui.tab = 'history'; L.render(); }); await wait(150);
    await E.tap('#view [data-act="histToggle"][data-id="last"]', 150); await E.tap('#view [data-act="histEdit"][data-id="last"]', 300);
    const bi = await E.ev(() => window.__ironlog.state.draft.ex.findIndex(b => b.exId === 'bench'));
    await toUnit(E, bi, 'kg');
    await E.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    await finishAll(E);
    const saved = await E.ev(sid => { const s = window.__ironlog.state.sessions.find(x => x.id === sid); const b = s.ex.find(x => x.exId === 'bench'); return { inj: b.inj || null }; }, sid);
    ok(saved.inj === null, 'L-39: in an edit of a saved session, KG tapped and saved: no injury flagged since reaches it (REV17-2)', saved);
    await E.close();
    /* kg picked in an edit while a workout waits set aside: the workout comes back with its bench, not started, in kg on
       kg's loads, as if kg were picked there (85 kg, L-38), never 83.9 kg under a target worded in lb (NEW-152). */
    const W = await lifter();
    await start(W);
    await W.tap('#tabs [data-tab="history"]', 200);
    await W.tap('#view [data-act="histToggle"][data-id="last"]', 150); await W.tap('#view [data-act="histEdit"][data-id="last"]', 300);
    await toUnit(W, await W.ev(() => window.__ironlog.state.draft.ex.findIndex(b => b.exId === 'bench')), 'kg');
    await W.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    await finishAll(W);
    await W.tap('#tabs [data-tab="today"]', 300);
    const back = await W.ev(() => { const e = document.getElementById('blk-0'); return { badge: e.querySelector('[data-act="unitOpen"]').textContent.trim(), grey: [...e.querySelectorAll('input[data-f="w"]')].map(i => i.value || i.placeholder), text: e.innerText.replace(/\s+/g, ' ') }; });
    ok(back.badge === 'kg' && back.grey.length === 3 && back.grey.every(v => v === '85') && /at 85 kg/.test(back.text) && !/at 185 lb/.test(back.text), 'L-39: kg picked in an edit while a workout waits set aside: the workout comes back with the bench in kg at 85 kg (NEW-152)', back);
    await W.close();
  }

  /* ---------- L-38: a lift's badge says its unit and opens its sheet, where it switches between lb and kg ---------- */
  if (run('L-38')) {
    /* 390's Release B, as V settled it on 2026-11-14: each exercise has a badge under its buttons with its unit and what
       its load column holds ("lb · total"); the column's heading is one word. The badge opens the exercise's sheet: what
       to enter there in full, and the unit its weights are marked in. kg picked there marks its equipment in kg: kept on
       the lift, said with Undo, its target read again in kg, a load already typed converted (225 lb shows as 102.1 kg,
       never read as 225 kg), the other lifts left in lb; Undo puts it back; it is still kg when the app is opened again. */
    const P = await lifter();
    await start(P);
    const badges = () => P.ev(() => [...document.querySelectorAll('#view [data-act="unitOpen"]')].map(e => e.textContent.trim()));
    const h0 = await badges();
    await P.page.click(field('w', 0, 0)); await P.page.fill(field('w', 0, 0), ''); await P.page.keyboard.type('225');
    await P.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(80);
    await P.tap('#view [data-act="unitOpen"][data-b="0"]', 250);
    const sheet = await P.ev(() => { const m = document.getElementById('modal'); const on = [...m.querySelectorAll('[data-act="liftUnit"]')].map(x => ({ v: x.dataset.v, on: x.getAttribute('aria-pressed') })); return { text: m.innerText, on, tip: !!document.querySelector('#tip:not([hidden])') }; });
    ok(sheet.text.replace(/\s+/g, ' ').trim() === 'Barbell Bench Press ✕ Total weight, bar included. Weights in lb kg' && JSON.stringify(sheet.on) === JSON.stringify([{ v: 'lb', on: 'true' }, { v: 'kg', on: 'false' }]) && !sheet.tip,
      'L-38: the bench\'s badge opens its sheet: what to enter in a few words ("Total weight, bar included."), and Weights in, lb picked, kg to pick; nothing more (V, 2026-11-14 15:33); no tip', sheet);
    await P.tap('#modal [data-act="liftUnit"][data-v="lb"]', 250);
    const same = await P.ev(() => ({ modal: !!window.__ironlog.ui.modal, unit: window.__ironlog.state.exercises.find(x => x.id === 'bench').unit || null }));
    ok(!same.modal && same.unit === null, 'L-38: lb picked again closes the sheet and changes nothing', same);
    await toUnit(P, 0, 'kg');
    const after = await P.ev(() => { const L = window.__ironlog; const d = L.state.draft; const e = L.state.exercises.find(x => x.id === 'bench');
      return { unit: e.unit, modal: !!L.ui.modal, w0: d.ex[0].sets[0].w, shown: document.querySelector('#view input[data-f="w"][data-b="0"][data-s="0"]').value, grey: document.querySelector('#view input[data-f="w"][data-b="0"][data-s="1"]').placeholder, hint: d.ex[0].hint || '' }; });
    const t1 = await P.toast();
    ok(JSON.stringify(h0) === JSON.stringify(['lb', 'lb']) && JSON.stringify(await badges()) === JSON.stringify(['kg', 'lb']), 'L-38: the bench\'s badge reads lb, then kg; the raises stay lb', { h0, h1: await badges() });
    ok(after.unit === 'kg' && !after.modal && Math.abs(after.w0 - 225 * LB) < 1e-9 && after.shown === '102.1' && after.grey === '102.1' && /85 kg is the nearest load in kg to what you did: aim for 24\+ reps over 3 sets at 85 kg/.test(after.hint) && t1 === 'Barbell Bench Press in kg',
      'L-38: kg picked: the sheet closes, kept on the lift; 225 typed shows as 102.1 kg, stored as typed, the rows under it following it; the target read again in kg (185 lb x 8, 8, 7 is 85 kg, aim for 24+, P-40); "Barbell Bench Press in kg", with Undo', { after, t1 });
    await P.tap('#toast [data-act="undo"]', 300);
    const back = await P.ev(() => { const L = window.__ironlog; return { unit: L.state.exercises.find(x => x.id === 'bench').unit || null, shown: document.querySelector('#view input[data-f="w"][data-b="0"][data-s="0"]').value }; });
    ok(back.unit === null && back.shown === '225', 'L-38: Undo puts it back in lb, the load as typed', back);
    await toUnit(P, 0, 'kg');
    await P.page.reload(); await wait(600);
    const kept = await P.ev(() => ({ unit: window.__ironlog.state.exercises.find(x => x.id === 'bench').unit, badge: document.querySelector('#view [data-act="unitOpen"][data-b="0"]').textContent.trim() }));
    ok(kept.unit === 'kg' && kept.badge === 'kg', 'L-38: switched again, it is still kg when the app is opened again', kept);
    await P.close();
    /* What each kind of lift says, and how it sits: the badge names the unit and what the column holds (each, stack,
       added, help); the column's heading is one word, one line at every width; the badge's touch area is 44 px each way
       over no other control, measured by taps, at 390 and 320 px, a tap at the bottom of the buttons above it doing what
       they do. */
    {
      const X = await lifter({ items: [['bench', 3, 6, 10, REST_BENCH], ['dbCurl', 3, 8, 12, REST_RAISE], ['latPulldown', 3, 8, 12, REST_RAISE], ['pullup', 3, 6, 10, REST_BENCH], ['assistPullup', 3, 6, 10, REST_BENCH]] });
      await start(X);
      const seen = {};
      for (const w of [320, 360, 375, 390, 430]) {
        await X.page.setViewportSize({ width: w, height: 844 }); await wait(150);
        seen[w] = await X.ev(() => [...document.querySelectorAll('#view section.block')].map(blk => {
          const h = blk.querySelector('.sg.head .lh'), u = blk.querySelector('[data-act="unitOpen"]');
          /* The plan's sets and range ("3×6-10") as one piece: the text from the sets to the end of the range read by a
             Range, whose line boxes all share one top when it is not broken (at the hyphen, say). */
          const walk = document.createTreeWalker(blk.querySelector('.bh-m'), NodeFilter.SHOW_TEXT);
          const nodes = []; let n; while ((n = walk.nextNode())) nodes.push(n);
          const xi = nodes.findIndex(t => t.textContent.includes('×'));
          let rangeOne = false;
          if (xi > 0) {
            const R = document.createRange(); const a = nodes[xi - 1], c = nodes[xi + 1];
            R.setStart(a, Math.max(0, a.textContent.search(/\d+$/))); R.setEnd(c, (c.textContent.match(/^[\d-]+/) || [''])[0].length);
            rangeOne = new Set([...R.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size === 1 && /^\d+×\d+(-\d+)?$/.test(R.toString());
          }
          // The effort ("@2 RIR") as one piece the same way.
          const at = nodes.find(t => t.textContent.includes('@'));
          let effOne = false;
          if (at) {
            // From the "@" to the end of the effort, whether it is one text or the "@" and its value as two.
            const end = at.textContent.slice(at.textContent.indexOf('@')).trim() === '@' ? nodes[nodes.indexOf(at) + 1] : at;
            const R = document.createRange(); R.setStart(at, at.textContent.indexOf('@')); R.setEnd(end, end.textContent.length);
            effOne = new Set([...R.getClientRects()].filter(r => r.width > 0).map(r => Math.round(r.top))).size === 1 && /^@\S+ \S+$/.test(R.toString().trim());
          }
          return { head: h.innerText.trim().toUpperCase(), one: h.getClientRects().length === 1 && h.getBoundingClientRect().height < 20, badge: u.textContent.trim(), badgeOne: u.getBoundingClientRect().height < 40, rangeOne, effOne };
        }));
      }
      const want = [['TOTAL', 'lb'], ['EACH', 'lb'], ['STACK', 'lb'], ['ADDED', 'lb'], ['ASSIST', 'lb']];
      ok(Object.values(seen).every(bs => bs.length === 5 && bs.every((x, i) => x.one && x.badgeOne && x.head === want[i][0] && x.badge === want[i][1])),
        'L-38: at 320, 360, 375, 390 and 430 px every load heading is one word on one line saying what the number is (Total, Each, Stack, Added, Assist), and every badge is the unit alone, lb', seen);
      ok(Object.values(seen).every(bs => bs.every(x => x.rangeOne && x.effOne)), 'L-38: at every width from 320 to 430 px the plan\'s sets and range under each name ("3×6-10") and its effort ("@2 RIR") each stay on one line, never broken at the hyphen or the space (NEW-159)', seen);
      await X.page.setViewportSize({ width: 390, height: 844 }); await wait(150);
      const said = [];
      for (let b = 0; b < 5; b++) {
        await X.tap(`#view [data-act="unitOpen"][data-b="${b}"]`, 250);
        said.push(await X.ev(() => document.getElementById('modal').innerText.replace(/\s+/g, ' ').trim()));
        await X.ev(() => window.__ironlog.ACT.mClose()); await wait(120);
      }
      const words = ['Barbell Bench Press ✕ Total weight, bar included.', 'DB Curl ✕ Weight of one dumbbell.', 'Lat Pulldown ✕ Weight on the stack.', 'Pull-up ✕ Weight you add. 0 for bodyweight.', 'Assisted Pull-up (machine) ✕ Assistance on the machine.'];
      ok(said.every((t, i) => t === `${words[i]} Weights in lb kg`) && !/\bhelp\b|comparable/i.test(said.join(' ')),
        'L-38: each kind of lift\'s sheet says what to enter in a few words and its unit, nothing more (V, 2026-11-14 15:33): total with the bar, one dumbbell, the stack, the weight you add, the assistance; never "help" or machines compared', said);
      for (const w of [390, 320]) {
        await X.page.setViewportSize({ width: w, height: 844 }); await wait(150);
        for (const b of [0, 4]) {
          const r = await X.ev(sel => {
            const u = document.querySelector(sel); u.scrollIntoView({ block: 'center' });
            const q = u.getBoundingClientRect(), cx = q.left + q.width / 2, cy = q.top + q.height / 2;
            const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === u || u.contains(e)); };
            let y1 = cy, y2 = cy, x1 = cx, x2 = cx;
            while (hit(cx, y1 - 1) && y1 > cy - 90) y1--; while (hit(cx, y2 + 1) && y2 < cy + 90) y2++;
            while (hit(x1 - 1, cy) && x1 > cx - 120) x1--; while (hit(x2 + 1, cy) && x2 < cx + 120) x2++;
            const others = [...document.querySelectorAll('button, a, input, select, textarea, [data-act]')].filter(e => e !== u && !u.contains(e) && !e.contains(u) && !(e.closest('details:not([open])') && !e.closest('summary')))
              .filter(e => { const z = e.getBoundingClientRect(); return z.width && z.height && z.left < x2 && z.right > x1 && z.top < y2 && z.bottom > y1; }).map(e => e.dataset.act || e.tagName);
            return { h: Math.round(y2 - y1 + 1), w: Math.round(x2 - x1 + 1), others };
          }, `#view [data-act="unitOpen"][data-b="${b}"]`);
          // Each button above it, found where it is just before its own tap, so a fold or a scroll after one tap moves nothing.
          const taps = [];
          for (const act of ['bFold', 'bNote', 'bMenu']) {
            const a = await X.ev(([b, act]) => { document.querySelector(`#view [data-act="unitOpen"][data-b="${b}"]`).scrollIntoView({ block: 'center' }); const z = document.querySelector(`#blk-${b} .bh-btns [data-act="${act}"]`).getBoundingClientRect(); return { x: z.left + z.width / 2, y: z.bottom - 1 }; }, [b, act]);
            await wait(80); await X.page.mouse.click(a.x, a.y); await wait(200);
            taps.push({ act, sheet: await X.ev(() => { const m = window.__ironlog.ui.modal; return m ? m.kind : null; }), folded: await X.ev(b => !!document.querySelector(`#blk-${b}.folded`), b) });
            await X.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await wait(120);
            await X.ev(b => { if (document.querySelector(`#blk-${b}.folded`)) window.__ironlog.ACT.bOpen({ dataset: { b: String(b) } }); }, b); await wait(150);
          }
          const did = { bFold: t => t.folded, bNote: t => t.sheet === 'note', bMenu: t => t.sheet !== null && t.sheet !== 'unit' };
          ok(r.h >= 44 && r.w >= 44 && !r.others.length && taps.length === 3 && taps.every(t => t.sheet !== 'unit' && did[t.act](t)),
            `L-38: at ${w} px the ${b ? 'assisted pull-up' : 'bench'}'s badge takes 44 px or more each way over no other control, and a tap at the bottom of the buttons above it does what that button does, never opening the badge's sheet`, { r, taps });
        }
      }
      await X.close();
    }
    /* Wherever the block puts a control just above the load column's heading (a note from last time with Use again, a
       bodyweight lift's Add bodyweight, a note's pictures), at 390 and 320 px: the heading holds no control, a tap at the
       bottom edge of that control does what it does and never switches the unit, and the badge still takes 44 px or
       more each way, measured by taps, over no other control. */
    const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    for (const w of [390, 320]) {
      for (const [what, o, prep, b] of [
        ['a note from last time with Use again', { seed: '(S) => { S.sessions[0].ex[0].note = "Seat 4, handles level, elbows at 45, pause on the chest"; }' }, null, 0],
        ['Add bodyweight on a bodyweight lift', { items: [['bench', 3, 6, 10, REST_BENCH], ['pullup', 3, 6, 10, REST_BENCH]] }, null, 1],
        ['a note\'s pictures', {}, async X => {
          await X.tap('#view [data-act="bNote"][data-b="0"]', 250);
          for (let n = 1; n <= 3; n++) {
            await X.page.setInputFiles('#modal input[type="file"][data-pic="0"]', { name: `seat${n}.png`, mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
            for (let k = 0; k < 30; k++) { if (await X.ev(n => (window.__ironlog.state.draft.ex[0].pics || []).length >= n, n)) break; await wait(100); }
          }
          await X.ev(() => { document.getElementById('mNote').value = 'Seat 4'; }); await X.tap('#modal [data-act="noteSave"]', 250);
        }, 0]
      ]) {
        const X = await lifter({ w, ...o });
        await start(X);
        if (prep) await prep(X);
        const r = await X.ev(sel => {
          const b = document.querySelector(sel); if (!b) return { none: true };
          b.scrollIntoView({ block: 'center' });
          const q = b.getBoundingClientRect(), cx = q.left + q.width / 2, cy = q.top + q.height / 2;
          const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!e && (e === b || b.contains(e)); };
          let y1 = cy, y2 = cy, x1 = cx, x2 = cx;
          while (hit(cx, y1 - 1) && y1 > cy - 90) y1--; while (hit(cx, y2 + 1) && y2 < cy + 90) y2++;
          while (hit(x1 - 1, cy) && x1 > cx - 90) x1--; while (hit(x2 + 1, cy) && x2 < cx + 90) x2++;
          const others = [...document.querySelectorAll('button, a, input, select, textarea, label.btn, [data-act]')].filter(e => e !== b && !b.contains(e) && !e.contains(b) && !(e.closest('details:not([open])') && !e.closest('summary')))
            .filter(e => { const z = e.getBoundingClientRect(); return z.width && z.height && z.left < x2 && z.right > x1 && z.top < y2 && z.bottom > y1; })
            .map(e => ({ act: e.dataset.act || e.tagName, box: [z => z.left, z => z.top, z => z.right, z => z.bottom].map(f => Math.round(f(e.getBoundingClientRect()))) }));
          const above = [...document.querySelectorAll('#blk-' + b.dataset.b + ' [data-act="noteReuse"], #blk-' + b.dataset.b + ' [data-act="bwOpen"], #blk-' + b.dataset.b + ' .pthumb')].map(e => { const z = e.getBoundingClientRect(); return { act: e.dataset.act, x: z.left + Math.min(z.width / 2, 20), y: z.bottom - 2 }; });
          const headCtl = document.querySelectorAll(`#blk-${b.dataset.b} .sg.head button, #blk-${b.dataset.b} .sg.head [data-act]`).length;
          return { h: Math.round(y2 - y1 + 1), w: Math.round(x2 - x1 + 1), others, above, headCtl };
        }, `#view [data-act="unitOpen"][data-b="${b}"]`);
        const taps = [];
        for (const a of r.above || []) {
          const exId = await X.ev(b => window.__ironlog.state.draft.ex[b].exId, b);
          await X.page.mouse.click(a.x, a.y); await wait(250);
          const unit = await X.ev(id => window.__ironlog.state.exercises.find(e => e.id === id).unit || null, exId);
          taps.push({ act: a.act, unit });
          await X.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await wait(150);
        }
        ok(!r.none && r.headCtl === 0 && r.h >= 44 && r.w >= 44 && !r.others.length && (r.above || []).length > 0 && taps.every(t => t.unit === null),
          `L-38: at ${w} px, with ${what} above the load column's heading: the heading holds no control, a tap at the bottom of that control leaves the unit as it was, and the badge takes 44 px or more each way over no other control`, { r, taps });
        await X.close();
      }
    }
  }

  /* ---------- L-40: Type or dictate sets reads a load typed with its unit in that unit ---------- */
  if (run('L-40')) {
    /* A load typed with its unit named is read in that unit, as a load typed in the other unit is anywhere (P-38): on
       the bench in lb, "100 kg x 5, 5, 5" fills 100 kg, stored as typed, never 100 lb; "100kg x 5" and "100 kilos x 5"
       read the same; a load with no unit is the lift's (225 x 5 is 225 lb), and a unit after the reps names no load. */
    const cases = [
      ['100 kg x 5, 5, 5', 100, 3], ['100kg x 5', 100, 1], ['100 kilos x 5', 100, 1], ['225 lbs x 5, 5', 225 * LB, 2],
      ['225 x 5', 225 * LB, 1], ['225 x 5 lb', 225 * LB, 1]
    ];
    const got = [];
    for (const [txt] of cases) {
      const P = await lifter();
      await start(P);
      await P.tap('#view [data-act="bMenu"][data-b="0"]', 150); await P.tap('#modal [data-act="bMenuDo"][data-op="bQuick"]', 200);
      await P.page.fill('#qTxt', txt); await P.tap('#modal [data-act="qFill"]', 250);
      got.push(await P.ev(() => { const L = window.__ironlog; return { err: (L.ui.modal && L.ui.modal.err) || null, sets: L.state.draft.ex[0].sets.filter(x => x.done).map(x => x.w), shown: (document.querySelector('#view input[data-f="w"][data-b="0"][data-s="0"]') || {}).value || null }; }));
      await P.close();
    }
    ok(cases.every(([, w, n], i) => !got[i].err && got[i].sets.length === n && got[i].sets.every(x => Math.abs(x - w) < 1e-9)),
      'L-40: on the bench in lb, "100 kg x 5, 5, 5", "100kg x 5" and "100 kilos x 5" fill 100 kg as typed; "225 lbs x 5, 5", "225 x 5" and "225 x 5 lb" fill 225 lb', { cases: cases.map(c => c[0]), got });
    ok(got[1].shown === '220.5', 'L-40: 100kg typed shows in the lb bench\'s row as 220.5, its stored number never read again in lb', got[1]);
  }

  /* ---------- L-41: a machine lift's Machine sheet (390 C) ---------- */
  if (run('L-41')) {
    /* A machine, cable or Smith lift's ⋯ menu has Machine where a free weight's has New machine or gym. Its sheet lists
       the machines the lift was done on, the one used most lately first, each by its last session's heaviest set
       ("Nov 7 · 200 lb × 11") until it is named, and Add a machine; the one it is on marked. A machine added (here with
       no name) starts it as a first session ("New machine: pick a load ..."), with Undo. Saved, the lift is on that machine next time (the one last done on),
       read from it alone; the first one picked again reads its own sessions and brings its kg or lb with it. A session
       logged on the wrong machine is moved in its edit from History, from the same sheet. */
    const LBk = 0.45359237;
    const seed = `(S, L) => { const LB = ${LBk}; const mk = (id, date, rs) => ({ id, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'machPress', rr: [8, 12], ps: 3, sets: rs.map(r => ({ w: 200 * LB, r, rir: 2, done: true })) }, { exId: 'bench', rr: [6, 10], ps: 3, sets: [8, 8, 7].map(r => ({ w: 185 * LB, r, rir: 2, done: true })) }] }); S.sessions = [mk('m1', '2026-10-31', [10, 10, 9]), mk('m2', '2026-11-07', [11, 11, 10])]; }`;
    const P = await lifter({ items: [['machPress', 3, 8, 12, 120], ['bench', 3, 6, 10, REST_BENCH]], fresh: true, seed, movable: true, settings: { autoDone: false } });
    const menu = async b => { await P.tap(`#view [data-act="bMenu"][data-b="${b}"]`, 200); const t = (await P.modal()).buttons; await P.ev(() => window.__ironlog.ACT.mClose()); await wait(120); return t; };
    const sheet = async () => { await P.tap('#view [data-act="bMenu"][data-b="0"]', 200); await P.tap('#modal [data-act="bMenuDo"][data-op="machineOpen"]', 250); return P.modal(); };
    const pick = async k => { await P.tap(`#modal [data-act="machinePick"][data-k="${k}"]`, 300); };
    const block = () => P.ev(() => { const e = document.getElementById('blk-0'); return { grey: [...e.querySelectorAll('input[data-f="w"]')].map(i => i.value || i.placeholder), hint: ((e.querySelector('.hint') || {}).innerText || '').replace(/\s+/g, ' '), badge: e.querySelector('[data-act="unitOpen"]').textContent.trim() }; });
    const doSets = async (w, rs) => { for (let i = 0; i < rs.length; i++) { await P.page.click(field('w', 0, i)); await P.page.fill(field('w', 0, i), String(w)); await P.page.click(field('r', 0, i)); await P.page.fill(field('r', 0, i), String(rs[i])); await P.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(60); await P.tap(tick(0, i), 120); } };
    const finish = async () => { await P.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); await P.tap('#view [data-act="finish"]', 300); for (let k = 0; k < 6; k++) { const m = await P.modal(); if (!m) break; if (m.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } } };
    const nextWeek = async t => { await P.ev(t => window.__setClock(t), t); await P.ev(() => { const L = window.__ironlog; L.invalidate(); L.ui.tab = 'today'; L.render(); }); await wait(150); await start(P); };
    const saved = date => P.ev(date => { const s = window.__ironlog.state.sessions.find(x => x.date === date); const b = s && s.ex.find(x => x.exId === 'machPress'); return b ? { nw: b.nw || null, mc: b.mc || null, sid: s.id } : null; }, date);

    await start(P);
    const menus = [await menu(0), await menu(1)];
    ok(menus[0].includes('Machine') && !menus[0].includes('New machine or gym') && menus[1].includes('New machine or gym') && !menus[1].includes('Machine'), 'L-41: the chest press\'s ⋯ menu has Machine; the bench\'s keeps New machine or gym', menus);
    let m = await sheet();
    ok(m && m.kind === 'machine' && /Machine Nov 7 · 200 lb × 11\s*✎\s*Add a machine/.test(m.text), 'L-41: the sheet lists the one machine by its last session, "Nov 7 · 200 lb × 11", and Add a machine', m);
    const before = await block();
    await addMachine(P);
    let b = await block();
    ok(/^Machine Chest Press: new machine$/.test(await P.toast()) && /^New machine: pick a load for 8 to 12 reps, about 2 to spare\.$/.test(b.hint) && b.grey.every(x => x === ''), 'L-41: New machine says "Machine Chest Press: new machine" and starts the lift as a first session there, no load asked', { t: await P.toast(), b });
    await P.tap('#toast [data-act="undo"]', 250);
    ok(JSON.stringify(await block()) === JSON.stringify(before), 'L-41: Undo puts the lift back on its machine, its target as it was', { before, after: await block() });
    m = await sheet(); await addMachine(P);
    // The new machine is marked kg (its stack is in kg): its badge, kept by the lift.
    await toUnit(P, 0, 'kg');
    await doSets(60, [10, 10, 9]);
    await finish();
    let day1 = await saved('2026-11-11');
    ok(day1 && day1.nw === true && day1.mc === day1.sid, 'L-41: saved, the session marks the lift done on a new machine, named by its own id as every machine session names its machine', day1);

    await nextWeek('2026-11-18T10:00:00');
    b = await block();
    m = await sheet();
    ok(b.badge === 'kg' && /Today: 30\+ reps over 3 sets at 60 kg/.test(b.hint) && !/200|lb/.test(b.hint) && b.grey.every(x => x === '60') && /Machine Nov 11 · 60 kg × 10\s*✎\s*Nov 7 · 200 lb × 11\s*✎\s*Add a machine/.test(m.text),
      'L-41: a week later the lift is on the machine it was last done on, in its kg, read from it alone (30+ at 60 kg); the sheet lists it first, then the first machine', { b, m: m && m.text });
    await pick('0');
    b = await block();
    const raw = await P.ev(() => document.getElementById('toast').textContent);
    ok(raw.includes('Nov\u00a07\u00a0·\u00a0200\u00a0lb\u00a0×\u00a011'), 'L-41: the message after a machine is picked keeps the machine\'s label on one line (V, 2026-11-14)', raw);
    ok(/^Machine Chest Press: Nov 7 · 200 lb × 11$/.test(await P.toast()) && b.badge === 'lb' && /Today: 33\+ reps over 3 sets at 200 lb/.test(b.hint) && /Heaviest 200×11/.test(b.hint) && !/kg/.test(b.hint) && b.grey.every(x => x === '200'),
      'L-41: the first machine picked again: said by its last session, back in lb, and read from its own sessions (33+ at 200 lb, its heaviest 200 × 11)', { t: await P.toast(), b });
    await doSets(200, [11, 11, 11]);
    await finish();
    const day2 = await saved('2026-11-18');
    const prs = await P.ev(() => window.__ironlog.IDX().prs.filter(p => p.exId === 'machPress').map(p => p.date));
    ok(day2 && day2.mc === '0' && !day2.nw && !prs.includes('2026-11-18') && !prs.includes('2026-11-11'), 'L-41: saved on the first machine by name; neither machine\'s session is a PR against the other', { day2, prs });

    // That session was on the kg machine after all: moved in its edit from History.
    await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
    await P.tap(`#view [data-act="histToggle"][data-id="${day2.sid}"]`, 150); await P.tap(`#view [data-act="histEdit"][data-id="${day2.sid}"]`, 300);
    const bi = await P.ev(() => window.__ironlog.state.draft.ex.findIndex(x => x.exId === 'machPress'));
    await P.tap(`#view [data-act="bMenu"][data-b="${bi}"]`, 200); await P.tap('#modal [data-act="bMenuDo"][data-op="machineOpen"]', 250);
    m = await P.modal();
    ok(m && /Machine Nov 18 · 200 lb × 11\s*✎\s*Nov 11 · 60 kg × 10\s*✎\s*Add a machine/.test(m.text), 'L-41: in the edit, the sheet marks the machine the session was saved on', m && m.text);
    await pick(day1.sid);
    await finish();
    const moved = await saved('2026-11-18');
    ok(moved && moved.mc === day1.sid, 'L-41: picked in the edit and saved, the session is on the kg machine', moved);
    await P.close();
  }

  if (run('L-41')) {
    /* An edit from History names the machine of that one session and nothing else (the review of 2.67, REV18-1 and
       REV18-2): a chest press done only on one machine on Oct 24, Oct 31 and Nov 7, Oct 31 moved to a new machine in its
       edit: Oct 31 alone moves, Nov 7 stays on the first machine, and the next workout reads it (beat 32 at 210 lb).
       The lift's unit is the lifter's: an edit that picks a machine typed in another unit leaves it as it was. */
    const LBk = 0.45359237;
    const seed = `(S, L) => { const LB = ${LBk}; const mk = (id, date, w, rs) => ({ id, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'machPress', rr: [8, 12], ps: 3, sets: rs.map(r => ({ w: w * LB, r, rir: 2, done: true })) }] }); S.sessions = [mk('e1', '2026-10-24', 200, [11, 11, 10]), mk('e2', '2026-10-31', 205, [11, 11, 10]), mk('e3', '2026-11-07', 210, [11, 11, 10])]; }`;
    const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } });
    const sheetAt = async b => { await P.tap(`#view [data-act="bMenu"][data-b="${b}"]`, 200); await P.tap('#modal [data-act="bMenuDo"][data-op="machineOpen"]', 250); return P.modal(); };
    const finish = async () => { await P.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); await P.tap('#view [data-act="finish"]', 300); for (let k = 0; k < 6; k++) { const m = await P.modal(); if (!m) break; if (m.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } } };
    await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
    await P.tap('#view [data-act="histToggle"][data-id="e2"]', 150); await P.tap('#view [data-act="histEdit"][data-id="e2"]', 300);
    let m = await sheetAt(0);
    await addMachine(P);
    await finish();
    const marks = await P.ev(() => { const L = window.__ironlog; const xs = L.IDX().byEx.machPress || []; return L.state.sessions.map(s => [s.id, s.ex[0].nw || null, (xs.find(x => x.sid === s.id) || {}).mk || null]); });
    await start(P);
    const blk = await P.ev(() => ({ hint: ((document.querySelector('#blk-0 .hint') || {}).innerText || '').replace(/\s+/g, ' '), grey: [...document.querySelectorAll('#blk-0 input[data-f="w"]')].map(i => i.value || i.placeholder) }));
    m = await sheetAt(0);
    ok(JSON.stringify(marks) === JSON.stringify([['e1', null, '0'], ['e2', null, 'e2'], ['e3', null, '0']]) && /Today: 33\+ reps over 3 sets at 210 lb/.test(blk.hint) && blk.grey.every(x => x === '210') && /Machine Nov 7 · 210 lb × 11\s*✎\s*Oct 31 · 205 lb × 11\s*✎\s*Add a machine/.test(m.text),
      'L-41: Oct 31 moved to a new machine in its edit moves alone: Nov 7 stays on the first machine and the next workout reads it (33+ at 210 lb)', { marks, blk, m: m && m.text });
    await P.ev(() => window.__ironlog.ACT.mClose()); await wait(120);
    await P.close();
    /* The unit: the first machine's weights typed in lb, a second machine in kg (New machine on Oct 31, Nov 7 on it by
       name), the lift set to kg as its machine in use is. Nov 7 moved to the first machine in its edit: the lift stays in
       kg, as the lifter set it. */
    const seed2 = `(S, L) => { const LB = ${LBk}; const mk = (id, date, w, more) => ({ id, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'machPress', rr: [8, 12], ps: 3, sets: [11, 11, 10].map(r => ({ w, r, rir: 2, done: true })), ...more }] }); S.sessions = [mk('f1', '2026-10-24', 200 * LB, {}), mk('f2', '2026-10-31', 90, { nw: true }), mk('f3', '2026-11-07', 92.5, { mc: 'f2' })]; S.exercises = S.exercises.map(e => e.id === 'machPress' ? { ...e, unit: 'kg' } : e); }`;
    const Q = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed: seed2, settings: { autoDone: false } });
    await Q.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
    await Q.tap('#view [data-act="histToggle"][data-id="f3"]', 150); await Q.tap('#view [data-act="histEdit"][data-id="f3"]', 300);
    await Q.tap('#view [data-act="bMenu"][data-b="0"]', 200); await Q.tap('#modal [data-act="bMenuDo"][data-op="machineOpen"]', 250);
    await Q.tap('#modal [data-act="machinePick"][data-k="0"]', 300);
    const mid = await Q.ev(() => window.__ironlog.state.exercises.find(e => e.id === 'machPress').unit || null);
    await Q.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); await Q.tap('#view [data-act="finish"]', 300);
    for (let k = 0; k < 6; k++) { const mm = await Q.modal(); if (!mm) break; if (mm.kind === 'confirm') await mOk(Q); else { await Q.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } }
    const after = await Q.ev(() => ({ unit: window.__ironlog.state.exercises.find(e => e.id === 'machPress').unit || null, f3: window.__ironlog.state.sessions.find(s => s.id === 'f3').ex[0].mc || null }));
    ok(mid === 'kg' && after.unit === 'kg' && after.f3 === '0', 'L-41: the first machine (typed in lb) picked in an edit leaves the lift in kg, as the lifter set it, and moves only that session', { mid, after });
    await Q.close();
  }

  if (run('L-41')) {
    /* A session's machine changes only by a pick (the review of 2.67's fixes, REV19-1, REV19-5): a chest press on its
       first machine on Oct 1 and 8, a new one from Oct 15 (Oct 22 and 29 on it, saved as 2.66 saved them, unnamed).
       Oct 8's date moved to Oct 26 in its edit, nothing else: it stays on the first machine, and the new one's next
       workout reads its own 130 lb. A machine added in an edit is marked in the sheet until it is saved. In the edit of
       the session that began a machine, the sheet offers no machine to add: the session is on a machine of its own
       already, so one added would be that machine again, and the tap would do nothing. */
    const LBk = 0.45359237;
    const seed = `(S, L) => { const LB = ${LBk}; const mk = (id, date, w, more) => ({ id, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'machPress', rr: [8, 12], ps: 3, sets: [11, 11, 10].map(r => ({ w: w * LB, r, rir: 2, done: true })), ...more }] }); S.sessions = [mk('g1', '2026-10-01', 200, {}), mk('g2', '2026-10-08', 205, {}), mk('g3', '2026-10-15', 120, { nw: true }), mk('g4', '2026-10-22', 125, {}), mk('g5', '2026-10-29', 130, {})]; }`;
    const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } });
    const finish = async () => { await P.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); await P.tap('#view [data-act="finish"]', 300); for (let k = 0; k < 6; k++) { const m = await P.modal(); if (!m) break; if (m.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } } };
    const edit = async id => { await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150); await P.tap(`#view [data-act="histToggle"][data-id="${id}"]`, 150); await P.tap(`#view [data-act="histEdit"][data-id="${id}"]`, 300); };
    await edit('g2');
    await P.ev(() => { const el = document.querySelector('input[data-bind="draftDate"]'); el.value = '2026-10-26'; el.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(200);
    await finish();
    const g2 = await P.ev(() => window.__ironlog.state.sessions.find(s => s.id === 'g2').ex[0].mc || null);
    await start(P);
    const blk = await P.ev(() => ((document.querySelector('#blk-0 .hint') || {}).innerText || '').replace(/\s+/g, ' '));
    ok(g2 === '0' && /Today: 33\+ reps over 3 sets at 130 lb/.test(blk) && !/205/.test(blk), 'L-41: a session\'s date moved past a new machine\'s first session in its edit keeps its machine; the new machine reads its own 130 lb', { g2, blk });
    await P.tap('#view [data-act="discard"]', 250); if (await P.modal()) await mOk(P);
    await edit('g5');
    const open = async () => { await P.tap('#view [data-act="bMenu"][data-b="0"]', 200); await P.tap('#modal [data-act="bMenuDo"][data-op="machineOpen"]', 250); };
    await open(); await addMachine(P);
    await open();
    const on = await P.ev(() => [...document.querySelectorAll('#modal [data-act="machinePick"][aria-pressed="true"]')].map(b => b.dataset.k));
    ok(JSON.stringify(on) === '["new"]', 'L-41: a machine added in an edit is the one the sheet marks until the edit is saved', on);
    await P.ev(() => window.__ironlog.ACT.mClose()); await wait(120);
    await P.tap('#view [data-act="discard"]', 250); if (await P.modal()) await mOk(P);
    await edit('g3'); await open();
    const own = await P.ev(() => ({ text: document.querySelector('#modal .sheet').innerText.replace(/\s+/g, ' '), on: [...document.querySelectorAll('#modal [aria-pressed="true"]')].map(b => b.dataset.k), add: !!document.querySelector('#modal [data-k="new"]') }));
    ok(!own.add && JSON.stringify(own.on) === '["g3"]' && /Machine Oct 29 · 130 lb × 11\s*✎?\s*Oct 26 · 205 lb × 11\s*✎?$/.test(own.text), 'L-41: in the edit of the session that began a machine, the sheet marks that machine and offers none to add (it would be the same machine)', own);
    await P.close();
  }

  if (run('L-41')) {
    /* Machines by name (V, 2026-11-15: "a list of all my frequently used machines ... I go ahead and select that
       machine or add in a new one"). A chest press on one machine, unnamed (Oct 31 and Nov 7, 200 lb); the pec deck's
       machine named Hammer Strength, the leg extension's Hammer Strength, the lat pulldown's Life Fitness, and a name
       kept on the leg extension for a machine it does not have. A machine's pencil names it, the names given on other
       lifts offered as one tap each, the most used first, those the lift has and those of no machine left out; the card
       then says the name, and the sheet lists it by name with its last session small beside it. Add a machine takes a
       name: the lift starts there, the card naming it, one Undo step taking the machine and its name away together.
       Saved, the next workout is on it by name; the other picked by name reads its own sessions. A name cleared is taken
       off, and the machine is said by its last session again. */
    const LBk = 0.45359237;
    const seed = `(S, L) => { const LB = ${LBk}; const mk = (id, date, ex) => ({ id, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: ex.map(([exId, w, rs]) => ({ exId, rr: [8, 12], ps: 3, sets: rs.map(r => ({ w: w * LB, r, rir: 2, done: true })) })) }); S.sessions = [mk('n1', '2026-10-31', [['machPress', 200, [10, 10, 9]], ['pecDeck', 120, [12, 12, 11]], ['legExt', 150, [12, 12, 12]], ['latPulldown', 140, [10, 10, 10]]]), mk('n2', '2026-11-07', [['machPress', 200, [11, 11, 10]], ['pecDeck', 120, [12, 12, 12]]])]; const nm = (id, m) => { S.exercises.find(e => e.id === id).machines = m; }; nm('pecDeck', { 0: 'Hammer Strength' }); nm('legExt', { 0: 'Hammer Strength', zz: 'Ghost' }); nm('latPulldown', { 0: 'Life Fitness' }); }`;
    const P = await lifter({ items: [['machPress', 3, 8, 12, 120], ['pecDeck', 3, 8, 12, 90]], fresh: true, seed, movable: true, settings: { autoDone: false } });
    const sheet = async () => { await P.tap('#view [data-act="bMenu"][data-b="0"]', 200); await P.tap('#modal [data-act="bMenuDo"][data-op="machineOpen"]', 250); return P.ev(() => ({ text: document.querySelector('#modal .sheet').innerText.replace(/\s+/g, ' ').trim(), on: [...document.querySelectorAll('#modal [data-act="machinePick"][aria-pressed="true"]')].map(b => b.dataset.k) })); };
    const naming = async k => { await P.tap(`#modal [data-act="machineNaming"][data-k="${k}"]`, 250); return P.ev(() => ({ title: (document.querySelector('#modal .sheet h3') || {}).textContent, field: document.getElementById('mcName').value, chips: [...document.querySelectorAll('#modal [data-act="machineChip"]')].map(b => b.textContent.trim()), save: (document.querySelector('#modal [data-act="machineNameSave"]') || {}).textContent })); };
    const save = async () => P.tap('#modal [data-act="machineNameSave"]', 300);
    const close = async () => { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(120); };
    const tag = b => P.ev(b => { const t = document.querySelector(`#blk-${b} .mctag`); return t ? t.textContent.trim() : null; }, b);
    const hint = () => P.ev(() => ((document.querySelector('#blk-0 .hint') || {}).innerText || '').replace(/\s+/g, ' '));
    const names = () => P.ev(() => { const st = JSON.parse(localStorage.getItem('ironlog.v1')); const e = (st.exercises || []).find(x => x.id === 'machPress'); return { live: window.__ironlog.state.exercises.find(x => x.id === 'machPress').machines || null, stored: (e && e.machines) || null }; });
    const undo = async () => { await close(); await P.tap('#toast [data-act="undo"]', 300); };
    const doSets = async (w, rs) => { for (let i = 0; i < rs.length; i++) { await P.page.fill(field('w', 0, i), String(w)); await P.page.fill(field('r', 0, i), String(rs[i])); await P.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(60); await P.tap(tick(0, i), 120); } };
    const finish = async () => { await P.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); await P.tap('#view [data-act="finish"]', 300); for (let k = 0; k < 6; k++) { const m = await P.modal(); if (!m) break; if (m.kind === 'confirm') await mOk(P); else { await close(); } } };

    await start(P);
    ok(await tag(0) === null && await tag(1) === 'Hammer Strength', 'L-41: a machine with no name puts nothing on the card; the pec deck\'s card names its machine, Hammer Strength', [await tag(0), await tag(1)]);
    let m = await sheet();
    ok(/^Machine Chest Press ✕ Machine Nov 7 · 200 lb × 11 ✎ Add a machine$/.test(m.text), 'L-41: unnamed, the machine is listed by its last session', m);
    let n = await naming('0');
    ok(n.title === 'Name this machine' && n.field === '' && JSON.stringify(n.chips) === '["Hammer Strength","Life Fitness"]' && n.save === 'Save', 'L-41: its pencil asks its name, offering the names given on other lifts, the most used first (Hammer Strength on two), and no name of a machine a lift does not have (Ghost)', n);
    await P.tap('#modal [data-act="machineChip"][data-v="Hammer Strength"]', 120);
    ok(await P.ev(() => document.getElementById('mcName').value) === 'Hammer Strength', 'L-41: a name offered, tapped, is typed into the field');
    await save();
    m = await P.ev(() => ({ text: document.querySelector('#modal .sheet').innerText.replace(/\s+/g, ' ').trim() }));
    ok(/^Named Hammer Strength$/.test(await P.toast()) && /Machine Hammer Strength\s*Nov 7 · 200 lb × 11\s*✎\s*Add a machine$/.test(m.text) && await tag(0) === 'Hammer Strength', 'L-41: saved, "Named Hammer Strength", the sheet lists it by name with its last session beside it, and the card names it', { t: await P.toast(), m, tag: await tag(0) });
    let nm = await names();
    ok(JSON.stringify(nm.live) === '{"0":"Hammer Strength"}' && JSON.stringify(nm.stored) === '{"0":"Hammer Strength"}', 'L-41: the name is kept on the lift, and saved on the phone', nm);
    await undo();
    nm = await names();
    ok(nm.live === null && await tag(0) === null, 'L-41: Undo takes the name off', { nm, tag: await tag(0) });

    // Named by typing, then a second machine added by name.
    await sheet(); await naming('0'); await P.page.fill('#mcName', '  Hammer   Strength '); await save();
    n = await naming('new');
    ok(n.title === 'Add a machine' && n.field === '' && JSON.stringify(n.chips) === '["Life Fitness"]' && n.save === 'Add', 'L-41: Add a machine asks its name, offering the names this lift does not have yet', n);
    await P.page.fill('#mcName', 'Newtech'); await save();
    ok(/^Machine Chest Press: Newtech$/.test(await P.toast()) && /^New machine: pick a load for 8 to 12 reps, about 2 to spare\.$/.test(await hint()) && await tag(0) === 'Newtech', 'L-41: added, "Machine Chest Press: Newtech": the lift starts there as a first session, and the card names it', { t: await P.toast(), h: await hint(), tag: await tag(0) });
    m = await sheet();
    ok(/Machine Hammer Strength\s*Nov 7 · 200 lb × 11\s*✎\s*Newtech\s*✎$/.test(m.text) && JSON.stringify(m.on) === '["new"]', 'L-41: the sheet lists both by name (the name typed with its spaces tidied), Newtech marked, and offers no other to add while it is new', m);
    await undo();
    nm = await names();
    ok(await tag(0) === 'Hammer Strength' && /Today: 33\+ reps over 3 sets at 200 lb/.test(await hint()) && JSON.stringify(nm.live) === '{"0":"Hammer Strength"}', 'L-41: one Undo takes the machine added and its name away together: back on Hammer Strength, its target as it was', { nm, h: await hint(), tag: await tag(0) });
    await sheet(); await naming('new'); await P.page.fill('#mcName', 'Newtech'); await save();
    await doSets(120, [10, 10, 9]);
    await finish();
    const sid = await P.ev(() => window.__ironlog.state.sessions.find(x => x.date === '2026-11-11').id);
    nm = await names();
    ok(nm.stored && nm.stored['0'] === 'Hammer Strength' && nm.stored[sid] === 'Newtech', 'L-41: saved, the new machine keeps its name under the session that began it', { nm, sid });

    // A week later: on Newtech by name; Hammer Strength picked by name reads its own sessions.
    await P.ev(t => window.__setClock(t), '2026-11-18T10:00:00'); await P.ev(() => { const L = window.__ironlog; L.invalidate(); L.ui.tab = 'today'; L.render(); }); await wait(150); await start(P);
    m = await sheet();
    ok(await tag(0) === 'Newtech' && /Today: 30\+ reps over 3 sets at 120 lb/.test(await hint()) && new RegExp(`Machine Newtech\\s*Nov 11 · 120 lb × 10\\s*✎\\s*Hammer Strength\\s*Nov 7 · 200 lb × 11\\s*✎\\s*Add a machine$`).test(m.text) && JSON.stringify(m.on) === JSON.stringify([sid]), 'L-41: a week later the lift is on Newtech, its card naming it, read from it alone (30+ at 120 lb); the sheet lists it first, marked, then Hammer Strength', { tag: await tag(0), h: await hint(), m });
    await P.tap('#modal [data-act="machinePick"][data-k="0"]', 300);
    ok(/^Machine Chest Press: Hammer Strength$/.test(await P.toast()) && await tag(0) === 'Hammer Strength' && /Today: 33\+ reps over 3 sets at 200 lb/.test(await hint()), 'L-41: Hammer Strength picked: "Machine Chest Press: Hammer Strength", the card names it, read from its own sessions (33+ at 200 lb)', { t: await P.toast(), tag: await tag(0), h: await hint() });
    await sheet(); n = await naming(sid);
    ok(n.title === 'Name this machine' && n.field === 'Newtech', 'L-41: a named machine\'s pencil opens its name to change', n);
    await P.page.fill('#mcName', ''); await save();
    m = await P.ev(() => ({ text: document.querySelector('#modal .sheet').innerText.replace(/\s+/g, ' ').trim() }));
    nm = await names();
    ok(/^Machine name taken off$/.test(await P.toast()) && /Machine Nov 11 · 120 lb × 10\s*✎\s*Hammer Strength\s*Nov 7 · 200 lb × 11\s*✎\s*Add a machine$/.test(m.text) && JSON.stringify(nm.live) === '{"0":"Hammer Strength"}', 'L-41: a name cleared is taken off: "Machine name taken off", the machine said by its last session again', { t: await P.toast(), m, nm });
    ok(!P.errors || !P.errors.length, 'L-41: no page errors', P.errors);
    await P.close();
  }

  if (run('L-41')) {
    /* A machine's name stays its machine's, and is said only of it (the review of 2.70's names, REV21-1 to REV21-7):
       a name is never dropped because its machine is out of the log for a while (a workout set aside, a session in
       Recently deleted); a machine added in an edit is named by its pencil as in a workout; a machine is added only
       beside another the lift was done on, so a lift never done, or the edit of its only session, names the one machine
       it has; the edit of the session that began a machine adds none (it would be that machine again); a machine added
       with its name cleared has none; and the lift added again in the workout stays on the machine added. */
    const LBk = 0.45359237;
    const mkS = `const LB = ${LBk}; const mk = (id, date, w, rs, x) => ({ id, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'machPress', rr: [8, 12], ps: 3, sets: rs.map(r => ({ w: w * LB, r, rir: 2, done: true })), ...(x || {}) }] });`;
    const two = `(S, L) => { ${mkS} S.sessions = [mk('m1', '2026-10-31', 200, [10, 10, 9]), mk('m2', '2026-11-07', 200, [11, 11, 10])]; }`;
    const H = P => ({
      sheet: async (b = 0) => { await P.tap(`#view [data-act="bMenu"][data-b="${b}"]`, 200); await P.tap('#modal [data-act="bMenuDo"][data-op="machineOpen"]', 250); return P.ev(() => ({ text: document.querySelector('#modal .sheet').innerText.replace(/\s+/g, ' ').trim(), on: [...document.querySelectorAll('#modal [data-act="machinePick"][aria-pressed="true"]')].map(b => b.dataset.k), add: !!document.querySelector('#modal [data-act="machineNaming"][data-k="new"]:not(.mcpen)') })); },
      pencil: async k => { await P.tap(`#modal .mcpen[data-k="${k}"]`, 250); return P.ev(() => ({ title: (document.querySelector('#modal .sheet h3') || {}).textContent, field: document.getElementById('mcName').value, save: (document.querySelector('#modal [data-act="machineNameSave"]') || {}).textContent })); },
      save: async name => { if (name != null) await P.page.fill('#mcName', name); await P.tap('#modal [data-act="machineNameSave"]', 300); },
      close: async () => { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(120); },
      tag: (b = 0) => P.ev(b => { const t = document.querySelector(`#blk-${b} .mctag`); return t ? t.textContent.trim() : null; }, b),
      names: () => P.ev(() => { const e = window.__ironlog.state.exercises.find(x => x.id === 'machPress'); return e.machines ? JSON.parse(JSON.stringify(e.machines)) : null; }),
      edit: async id => { await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150); await P.tap(`#view [data-act="histToggle"][data-id="${id}"]`, 150); await P.tap(`#view [data-act="histEdit"][data-id="${id}"]`, 300); },
      sets: async (b, w, rs) => { for (let i = 0; i < rs.length; i++) { await P.page.fill(field('w', b, i), String(w)); await P.page.fill(field('r', b, i), String(rs[i])); await P.ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(60); if (!(await P.ev(([b, i]) => window.__ironlog.state.draft.ex[b].sets[i].done, [b, i]))) await P.tap(tick(b, i), 120); } },
      finish: async () => { await P.ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }); await P.tap('#view [data-act="finish"]', 300); for (let k = 0; k < 6; k++) { const m = await P.modal(); if (!m) break; if (m.kind === 'confirm') await mOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); } } },
      week: async t => { await P.ev(t => window.__setClock(t), t); await P.ev(() => { const L = window.__ironlog; L.invalidate(); L.ui.tab = 'today'; L.render(); }); await wait(150); }
    });

    // A workout on a machine added by name, set aside by an edit in which the first machine is named: both names stand.
    {
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed: two, settings: { autoDone: false } }); const X = H(P);
      await start(P); await X.sheet(); await addMachine(P, 'Hammer');
      const did = (await P.draft()).id;
      await X.sets(0, 100, [10]);
      await X.edit('m2'); await X.sheet(); await X.pencil('0'); await X.save('Cybex'); await X.close(); await X.finish();
      await P.tap('#tabs [data-tab="today"]', 150);
      if (!(await P.ev(() => !!document.querySelector('#view [data-act="sDone"]')))) await P.tap('#view .hero [data-act="startSession"], #view .hero [data-act="wkResume"]', 300);
      const nm = await X.names();
      ok(await X.tag() === 'Hammer' && nm && nm['0'] === 'Cybex' && nm[did] === 'Hammer', 'L-41: a machine named in a workout set aside keeps its name while another machine of the lift is named in an edit (REV21-1)', { tag: await X.tag(), nm });
      await P.close();
    }
    // A session that began a named machine, deleted; the first machine named meanwhile; the session restored: its name stands.
    {
      const seed = `(S, L) => { ${mkS} S.sessions = [mk('m1', '2026-10-31', 200, [10, 10, 9]), mk('m2', '2026-11-07', 120, [11, 11, 10], { nw: true })]; S.exercises.find(e => e.id === 'machPress').machines = { m2: 'Hammer' }; }`;
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } }); const X = H(P);
      await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
      await P.tap('#view [data-act="histToggle"][data-id="m2"]', 150); await P.tap('#view [data-act="histDel"][data-id="m2"]', 250); if (await P.modal()) await mOk(P);
      await start(P); await X.sheet(); await X.pencil('0'); await X.save('Cybex'); await X.close();
      await P.tap('#view [data-act="discard"]', 250); if (await P.modal()) await mOk(P);
      await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
      if (!(await P.ev(() => document.querySelector('#view details[data-sk="history:trash"]').open))) await P.tap('#view details[data-sk="history:trash"] > summary .sec-t', 200);
      await P.tap('#view [data-act="restore"][data-id="m2"]', 300);
      await start(P); const m = await X.sheet();
      ok(/Hammer\s*Nov 7 · 120 lb × 11/.test(m.text) && (await X.names()).m2 === 'Hammer' && (await X.names())['0'] === 'Cybex', 'L-41: a session restored from Recently deleted brings back its machine\'s name, though another machine was named meanwhile (REV21-1)', { m, nm: await X.names() });
      await P.close();
    }
    // In an edit: a machine added, then named by its pencil, then its name corrected.
    {
      const seed = `(S, L) => { ${mkS} S.sessions = [mk('e1', '2026-10-24', 200, [11, 11, 10]), mk('e2', '2026-10-31', 205, [11, 11, 10]), mk('e3', '2026-11-07', 210, [11, 11, 10])]; }`;
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } }); const X = H(P);
      await X.edit('e2'); await X.sheet(); await addMachine(P);
      await X.sheet();
      let n = await X.pencil('new');
      ok(n.title === 'Name this machine' && n.save === 'Save', 'L-41: in an edit, the pencil of a machine just added names it (Name this machine, Save), as in a workout (REV21-2)', n);
      await X.save('Hamer');
      ok(/^Named Hamer$/.test(await P.toast()), 'L-41: and saved, it says "Named Hamer"', await P.toast());
      n = await X.pencil('new'); await X.save('Hammer');
      await X.close(); await X.finish();
      await start(P); const m = await X.sheet();
      ok(n.field === 'Hamer' && JSON.stringify(await X.names()) === '{"e2":"Hammer"}' && /Machine Nov 7 · 210 lb × 11\s*✎\s*Hammer\s*Oct 31 · 205 lb × 11\s*✎\s*Add a machine$/.test(m.text), 'L-41: its name corrected by the pencil, the edit saved, Oct 31 is on Hammer (REV21-2)', { n, nm: await X.names(), m });
      await P.close();
    }
    // The edit of a lift's only session: its one machine, named by its pencil; no machine to add.
    {
      const seed = `(S, L) => { ${mkS} S.sessions = [mk('only', '2026-11-07', 200, [11, 11, 10])]; }`;
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } }); const X = H(P);
      await X.edit('only'); let m = await X.sheet();
      ok(!m.add && JSON.stringify(m.on) === '["0"]' && /Machine Nov 7 · 200 lb × 11\s*✎$/.test(m.text), 'L-41: the edit of a lift\'s only session lists its one machine and offers none to add (it could be on no other; REV21-3)', m);
      await X.pencil('0'); await X.save('Hammer'); await X.close(); await X.finish();
      await start(P);
      ok(await X.tag() === 'Hammer' && JSON.stringify(await X.names()) === '{"0":"Hammer"}', 'L-41: named there, the next workout\'s card says Hammer (REV21-3)', { tag: await X.tag(), nm: await X.names() });
      await P.close();
    }
    // A lift never done: its one machine named by its pencil, no machine to add; the name stays on it whatever is deleted.
    {
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, movable: true, settings: { autoDone: false } }); const X = H(P);
      await start(P); let m = await X.sheet();
      ok(!m.add && JSON.stringify(m.on) === '["0"]' && /Machine New machine\s*✎$/.test(m.text), 'L-41: a lift never done lists the machine it is on, New machine, with its pencil, and offers none to add (REV21-4)', m);
      const n = await X.pencil('0');
      ok(n.title === 'Name this machine', 'L-41: its pencil names it', n);
      await X.save('Hammer'); await X.close();
      ok(await X.tag() === 'Hammer', 'L-41: and the card says Hammer', await X.tag());
      await X.sets(0, 100, [10, 10, 9]); await X.finish();
      const s1 = await P.ev(() => { const s = window.__ironlog.state.sessions.find(x => x.date === '2026-11-11'); return { id: s.id, nw: s.ex[0].nw || null, mc: s.ex[0].mc || null }; });
      await X.week('2026-11-18T10:00:00'); await start(P); await X.sets(0, 100, [11, 10, 10]); await X.finish();
      await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
      await P.tap(`#view [data-act="histToggle"][data-id="${s1.id}"]`, 150); await P.tap(`#view [data-act="histDel"][data-id="${s1.id}"]`, 250); if (await P.modal()) await mOk(P);
      await X.week('2026-11-25T10:00:00'); await start(P);
      ok(s1.nw === null && s1.mc === '0' && await X.tag() === 'Hammer' && JSON.stringify(await X.names()) === '{"0":"Hammer"}', 'L-41: saved on the lift\'s first machine by name, with no new-machine mark, so with that first session deleted the lift is still on Hammer (REV21-4)', { s1, tag: await X.tag(), nm: await X.names() });
      await P.close();
    }
    // The edit of the session that began a machine, now on another: no machine to add, so no name moves.
    {
      const seed = `(S, L) => { ${mkS} S.sessions = [mk('m1', '2026-10-31', 200, [10, 10, 9]), mk('m2', '2026-11-07', 120, [11, 11, 10], { nw: true, mc: '0' }), mk('m3', '2026-11-14', 125, [11, 11, 10], { mc: 'm2' })]; S.exercises.find(e => e.id === 'machPress').machines = { m2: 'Hammer' }; }`;
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, day: '2026-11-15', settings: { autoDone: false } }); const X = H(P);
      await X.edit('m2'); const m = await X.sheet();
      ok(!m.add && JSON.stringify(m.on) === '["0"]' && /Hammer\s*Nov 14 · 125 lb × 11\s*✎\s*Nov 7 · 120 lb × 11\s*✎$/.test(m.text), 'L-41: the edit of a session whose own key is a machine already offers none to add, so Hammer is never renamed by an add (REV21-5)', m);
      await P.close();
    }
    // A machine added by name, the first picked back, then one added with the name cleared: it has no name.
    {
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed: two, settings: { autoDone: false } }); const X = H(P);
      await start(P); await X.sheet(); await addMachine(P, 'Hammer');
      await X.sheet(); await P.tap('#modal [data-act="machinePick"][data-k="0"]', 300);
      await X.sheet(); await P.tap('#modal [data-act="machineNaming"][data-k="new"]', 250);
      const f = await P.ev(() => document.getElementById('mcName').value);
      await X.save('');
      ok(/^Machine Chest Press: new machine$/.test(await P.toast()) && await X.tag() === 'New machine', 'L-41: a machine added with its name cleared has none: "new machine", and the card says New machine, not the name cleared (REV21-6)', { f, t: await P.toast(), tag: await X.tag() });
      await P.close();
    }
    /* The session that began a second machine, deleted from History, or moved past the next in its edit: the sessions
       after it stay on that machine, never read on the first (REV21-4, NEW-171). Two on the first machine at 200 lb,
       Nov 7 began a second at 120 lb, Nov 14 on it at 125 lb. */
    {
      const seed = `(S, L) => { ${mkS} S.sessions = [mk('m1', '2026-10-24', 200, [10, 10, 9]), mk('m0', '2026-10-31', 200, [11, 10, 10]), mk('m2', '2026-11-07', 120, [11, 11, 10], { nw: true }), mk('m3', '2026-11-14', 125, [11, 11, 10])]; }`;
      const each = P => P.ev(() => (window.__ironlog.IDX().byEx.machPress || []).map(x => [x.sid, x.mk]));
      const hint = P => P.ev(() => ((document.querySelector('#blk-0 .hint') || {}).innerText || '').replace(/\s+/g, ' '));
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, day: '2026-11-18', settings: { autoDone: false } }); const X = H(P);
      await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
      await P.tap('#view [data-act="histToggle"][data-id="m2"]', 150); await P.tap('#view [data-act="histDel"][data-id="m2"]', 250); if (await P.modal()) await mOk(P);
      const after = await each(P);
      await start(P);
      ok(JSON.stringify(after) === '[["m1","0"],["m0","0"],["m3","m2"]]' && /Today: 33\+ reps over 3 sets at 125 lb/.test(await hint(P)), 'L-41: the session that began a machine deleted, the session after it stays on that machine and the next workout reads it (33+ at 125 lb), never the first machine\'s 200 lb (NEW-171)', { after, hint: await hint(P) });
      await P.close();
      const Q = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, day: '2026-11-18', settings: { autoDone: false } }); const Y = H(Q);
      await Y.edit('m2');
      await Q.ev(() => { const el = document.querySelector('input[data-bind="draftDate"]'); el.value = '2026-11-16'; el.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(200);
      await Y.finish();
      const moved = await each(Q);
      ok(JSON.stringify(moved) === '[["m1","0"],["m0","0"],["m3","m2"],["m2","m2"]]', 'L-41: moved in its edit past the session after it, that session stays on the machine it began (REV21-4)', moved);
      await Q.close();
    }
    /* Every session of a machine lift names the machine it was done on, so nothing but a pick moves a session to another
       machine (the review of the fixes, REV22-1 to REV22-7): a log saved before (2.69's, its sessions naming none) is
       named as it reads when it is opened, and every session saved names its machine. */
    {
      const marksOf = P => P.ev(() => { const L = window.__ironlog; const xs = L.IDX().byEx.machPress || []; return L.state.sessions.slice().sort((a, b) => (a.date < b.date ? -1 : 1)).filter(q => q.ex.some(b => b.exId === 'machPress')).map(q => [q.id, q.ex.filter(b => b.exId === 'machPress').map(b => b.mc || null).join(), (xs.find(x => x.sid === q.id) || {}).mk]); });
      const hint = P => P.ev(() => ((document.querySelector('#blk-0 .hint') || {}).innerText || '').replace(/\s+/g, ' '));
      const del = async (P, id) => { await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150); if (!(await P.ev(id => !!document.querySelector(`#view [data-act="histDel"][data-id="${id}"]`), id))) await P.tap(`#view [data-act="histToggle"][data-id="${id}"]`, 150); await P.tap(`#view [data-act="histDel"][data-id="${id}"]`, 250); if (await P.modal()) await mOk(P); };
      const restore = async (P, id) => { await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150); await P.ev(() => { const x = document.querySelector('[data-sk="history:trash"]'); if (x) x.open = true; }); await wait(100); await P.tap(`#view [data-act="restore"][data-id="${id}"][data-k="session"]`, 300); };
      const settingsUndo = async P => { await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); }); await wait(150); await P.ev(() => document.querySelectorAll('#view details').forEach(x => { x.open = true; })); await wait(100); await P.tap('#view [data-act="undo"]', 350); };
      // 2.69 left the session that began a machine marked and the ones after it unnamed: the first machine's deleted.
      {
        const seed = `(S, L) => { ${mkS} S.sessions = [mk('m1', '2026-10-24', 120, [11, 11, 10], { nw: true }), mk('m2', '2026-10-31', 125, [11, 11, 10]), mk('m3', '2026-11-07', 125, [11, 11, 10])]; }`;
        const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, movable: true, settings: { autoDone: false } }); const X = H(P);
        const opened = await marksOf(P);
        await del(P, 'm1'); await start(P); await X.sets(0, 125, [8, 8, 7]); await X.finish();
        await X.week('2026-11-18T10:00:00'); await start(P); const m = await X.sheet();
        ok(JSON.stringify(opened) === '[["m1","","m1"],["m2","","m1"],["m3","","m1"]]' && /Today: 33\+ reps over 3 sets at 125 lb/.test(await hint(P)) && /Last \(Nov 11, below usual\)/.test(await hint(P)) && /Machine Nov 11 · 125 lb × 8\s*✎\s*Add a machine$/.test(m.text), 'L-41: a 2.69 log is opened as it is, each session read on the machine its marks give; its first session deleted, the lift stays on one machine and a poor day repeats the target (33+ at 125 lb, below usual; REV22-1)', { opened, hint: await hint(P), m: m.text });
        await P.close();
      }
      // A past workout logged while a workout on a machine just added is set aside: on the machine of its own day.
      {
        const seed = `(S, L) => { ${mkS} S.sessions = [mk('m1', '2026-10-31', 200, [11, 11, 10]), mk('m2', '2026-11-07', 200, [12, 11, 11])]; }`;
        const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } }); const X = H(P);
        await start(P); await X.sheet(); await addMachine(P, 'Hammer'); await X.sets(0, 120, [10]);
        await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
        await P.tap('#view [data-act="pastOpen"]', 250);
        await P.ev(() => { const el = document.querySelector('#modal input[data-pbind="date"]'); el.value = '2026-11-09'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(200);
        await P.tap('#modal [data-act="pastGo"][data-day="0"]', 350);
        const past = { tag: await X.tag(), marks: await P.ev(() => window.__ironlog.state.draft.ex.map(b => [b.nw || null, b.mc || null])), hint: await hint(P) };
        await X.sets(0, 205, [11, 11, 10]); await X.finish();
        const saved = (await marksOf(P)).find(x => x[0] !== 'm1' && x[0] !== 'm2');
        ok(past.tag === null && JSON.stringify(past.marks) === '[[null,null]]' && /Target: 3\d\+ reps over 3 sets at 200 lb/.test(past.hint) && saved && saved[1] === '0' && saved[2] === '0', 'L-41: a past workout logged while a workout on a machine just added is set aside is on the machine of its own day, and saved on it by name (REV22-2)', { past, saved });
        await P.close();
      }
      // A machine added, the lift added again, then Settings' Undo of the machine: no card is left on it.
      {
        const P = await lifter({ items: [['machPress', 3, 8, 12, 120], ['bench', 3, 6, 10, REST_BENCH]], fresh: true, seed: two, settings: { autoDone: false } }); const X = H(P);
        await start(P); await X.sheet(); await addMachine(P, 'Hammer');
        await P.tap('#view [data-act="pickSession"]', 300); await P.page.fill('#pickQ', 'Machine Chest Press'); await wait(250);
        await P.tap('#modal [data-act="pickDo"][data-ex="machPress"]', 300); if ((await P.modal()) && (await P.modal()).kind === 'confirm') await mOk(P);
        await settingsUndo(P);
        const marks = await P.ev(() => window.__ironlog.state.draft.ex.filter(b => b.exId === 'machPress').map(b => [b.nw || null, b.mc || null]));
        ok(JSON.stringify(marks) === '[[null,null],[null,null]]', 'L-41: Undo of a machine added takes it off every card of the lift, the one added since too (REV22-3)', marks);
        await P.close();
      }
      // The session that began a machine restored after training since, and taken out of its session in an edit: no session moves.
      {
        const seed = `(S, L) => { ${mkS} S.sessions = [mk('s1', '2026-10-24', 200, [11, 11, 10]), mk('s2', '2026-10-31', 120, [11, 11, 10], { nw: true })]; S.exercises.find(e => e.id === 'machPress').machines = { 0: 'Cybex', s2: 'Hammer' }; }`;
        const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, movable: true, settings: { autoDone: false } }); const X = H(P);
        await del(P, 's2'); await start(P); await X.sets(0, 200, [12, 11, 11]); await X.finish();
        await restore(P, 's2');
        const after = await marksOf(P);
        ok(after.length === 3 && after[2][1] === '0' && after[2][2] === '0', 'L-41: the session that began a machine restored after a workout on the first machine leaves that workout on the first (REV22-4)', after);
        await P.close();
        // Oct 15 had the bench too, so the edit that takes the press out still saves a session.
        const seed2 = `(S, L) => { ${mkS} const g3 = mk('g3', '2026-10-15', 120, [11, 11, 10], { nw: true }); g3.ex.push({ exId: 'bench', rr: [6, 10], ps: 3, sets: [8, 8, 7].map(r => ({ w: 185 * LB, r, rir: 2, done: true })) }); S.sessions = [mk('g1', '2026-10-01', 200, [11, 11, 10]), mk('g2', '2026-10-08', 200, [12, 11, 11]), g3, mk('g4', '2026-10-22', 125, [11, 11, 10]), mk('g5', '2026-10-29', 130, [11, 11, 10])]; }`;
        const Q = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed: seed2, settings: { autoDone: false } }); const Y = H(Q);
        await Y.edit('g3'); await Q.tap('#view [data-act="bMenu"][data-b="0"]', 200); await Q.tap('#modal [data-act="bMenuDo"][data-op="bDel"]', 300); if (await Q.modal()) await mOk(Q);
        await Y.finish();
        const out = await marksOf(Q);
        ok(JSON.stringify(out.map(x => [x[0], x[2]])) === '[["g1","0"],["g2","0"],["g4","g3"],["g5","g3"]]', 'L-41: the lift taken out of the session that began its machine leaves the sessions after it on that machine (REV22-5)', out);
        await Q.close();
      }
      // A session on the second machine deleted, then the one that began it, then the first restored: back on its machine.
      {
        const seed = `(S, L) => { ${mkS} S.sessions = [mk('g1', '2026-10-01', 200, [11, 11, 10]), mk('g3', '2026-10-15', 120, [11, 11, 10], { nw: true }), mk('g4', '2026-10-22', 125, [11, 11, 10]), mk('g5', '2026-10-29', 130, [11, 11, 10])]; }`;
        const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } });
        await del(P, 'g4'); await del(P, 'g3'); await restore(P, 'g4');
        const out = await marksOf(P);
        ok(JSON.stringify(out.map(x => [x[0], x[2]])) === '[["g1","0"],["g4","g3"],["g5","g3"]]', 'L-41: a session restored after the one that began its machine was deleted is back on that machine (REV22-6)', out);
        await P.close();
      }
      /* The session that began a machine deleted, then a past workout logged between it and the sessions after it on a
         machine added there, then the delete undone in Settings: those sessions stay on the machine they were on
         (REV26-3). The first Undo, of the machine added in the workout already saved, says it has nothing to undo and
         changes nothing (REV26-4). */
      {
        const seed = `(S, L) => { ${mkS} S.sessions = [mk('g1', '2026-10-01', 200, [11, 11, 10]), mk('g3', '2026-10-15', 120, [11, 11, 10], { nw: true }), mk('g4', '2026-10-22', 125, [11, 11, 10]), mk('g5', '2026-10-29', 130, [11, 11, 10])]; }`;
        const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } }); const X = H(P);
        await del(P, 'g3');
        await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
        await P.tap('#view [data-act="pastOpen"]', 250);
        await P.ev(() => { const el = document.querySelector('#modal input[data-pbind="date"]'); el.value = '2026-10-18'; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }); await wait(200);
        await P.tap('#modal [data-act="pastGo"][data-day="0"]', 350);
        await X.sheet(); await addMachine(P, ''); await X.sets(0, 100, [12, 12, 12]); await X.finish();
        const saved = await marksOf(P);
        await settingsUndo(P);
        const first = { toast: await P.toast(), marks: await marksOf(P) };
        for (let i = 0; i < 3 && (await P.ev(() => window.__ironlog.state.sessions.every(q => q.id !== 'g3'))); i++) await settingsUndo(P);
        const out = await marksOf(P), past = out.find(x => !/^g/.test(x[0]));
        ok(JSON.stringify(out.filter(x => /^g/.test(x[0])).map(x => [x[0], x[2]])) === '[["g1","0"],["g3","g3"],["g4","g3"],["g5","g3"]]' && past && past[2] === past[0], 'L-41: the delete of the session that began a machine undone after a past workout on a machine added before the sessions after it: those sessions stay on the machine they were on, the past workout on its own (REV26-3)', { saved, out });
        ok(/^Nothing to undo/.test(first.toast) && JSON.stringify(first.marks) === JSON.stringify(saved), 'L-41: Undo of a machine added in a past workout already saved says there is nothing to undo, and changes nothing (REV26-4)', first);
        await P.close();
      }
      // A pick in the edit of the first machine's only session is kept.
      {
        const seed = `(S, L) => { ${mkS} S.sessions = [mk('f1', '2026-10-24', 115, [11, 11, 10]), mk('f2', '2026-10-31', 120, [11, 11, 10], { nw: true }), mk('f3', '2026-11-07', 125, [11, 11, 10])]; S.exercises.find(e => e.id === 'machPress').machines = { f2: 'Hammer' }; }`;
        const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } }); const X = H(P);
        await X.edit('f1'); await X.sheet(); await P.tap('#modal [data-act="machinePick"][data-k="f2"]', 300); await X.finish();
        const out = await marksOf(P);
        ok(JSON.stringify(out.map(x => [x[0], x[2]])) === '[["f1","f2"],["f2","f2"],["f3","f2"]]', 'L-41: a machine picked in the edit of the first machine\'s only session is the one it is saved on (REV22-7)', out);
        await P.close();
      }
      /* The review of the root rule (REV23): a lift's sessions name a machine only while it is done on machines, a lift
         made a machine lift names its sessions then, and a session from another log never takes this one's first. */
      const mkOf = exId => `const LB = ${LBk}; const mk = (id, date, w, x) => ({ id, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: '${exId}', rr: [8, 12], ps: 3, sets: [11, 11, 10].map(r => ({ w: w * LB, r, rir: 2, done: true })), ...(x || {}) }] });`;
      // A library machine lift set to Barbell, a session deleted and brought back by Undo: no session names a machine.
      {
        const seed = `(S, L) => { ${mkOf('smithInc')} S.exercises.find(e => e.id === 'smithInc').equip = 'barbell'; S.sessions = [mk('s1', '2026-10-03', 100), mk('s2', '2026-10-10', 100), mk('s3', '2026-10-24', 60, { nw: true }), mk('s4', '2026-10-31', 65), mk('s5', '2026-11-07', 70)]; }`;
        const P = await lifter({ items: [['smithInc', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } });
        await del(P, 's1'); await P.tap('#toast [data-act="undo"]', 300);
        const named = await P.ev(() => JSON.parse(localStorage.getItem('ironlog.v1')).sessions.flatMap(q => q.ex.filter(b => b.exId === 'smithInc').map(b => b.mc || null)));
        await start(P);
        ok(named.length === 5 && named.every(x => x === null) && /Today: 33\+ reps over 3 sets at 70 lb/.test(await hint(P)), 'L-41: a library machine lift set to Barbell, a session deleted and brought back by Undo: none names a machine, and the next target is its last load (33+ at 70 lb; REV23-1)', { named, hint: await hint(P) });
        await P.close();
      }
      // A session deleted before the update, kept in Recently deleted naming no machine, restored: read by its date.
      {
        const seed = `(S, L) => { ${mkOf('machPress')} S.sessions = [mk('a1', '2026-10-10', 200), mk('c1', '2026-10-31', 200)]; S.trash = [{ id: 'a2', kind: 'session', date: '2026-11-10', data: mk('a2', '2026-10-17', 200) }]; }`;
        const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } });
        await restore(P, 'a2');
        const back = await P.ev(() => { const L = window.__ironlog; const q = L.state.sessions.find(x => x.id === 'a2'); return [q ? q.ex[0].mc || null : 'gone', ((L.IDX().byEx.machPress || []).find(x => x.sid === 'a2') || {}).mk]; });
        ok(back[1] === '0', 'L-41: a session deleted on 2.69, kept in Recently deleted naming no machine, restored: it reads on the machine its date gives', back);
        await P.close();
      }
      // A load far off is told against the machine in use, as the target reads it: the first machine picked, its 200 lb
      // is no mix-up; a machine just added has no last time, so 60 lb on it is none either.
      {
        const seed = `(S, L) => { ${mkOf('machPress')} S.sessions = [mk('a1', '2026-10-10', 200), mk('a2', '2026-10-17', 200), mk('b1', '2026-10-24', 120, { nw: true }), mk('c1', '2026-10-31', 125)]; }`;
        const far = async P => (await P.toasts()).filter(t => /is well (above|below) last time/.test(t));
        const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } }); const X = H(P);
        await start(P); await X.sheet(); await P.tap('#modal [data-act="machinePick"][data-k="0"]', 300); await X.close();
        await X.sets(0, 200, [11]);
        const picked = await far(P);
        await P.close();
        const Q = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } }); const Y = H(Q);
        await start(Q); await Y.sheet(); await addMachine(Q, ''); await Y.close();
        await Y.sets(0, 60, [11]);
        const added = await far(Q);
        // Still said on the machine in use when a load is far from its last: 60 lb on the second machine, last at 125.
        await Q.close();
        const R = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } }); const Z = H(R);
        await start(R); await Z.sets(0, 60, [11]);
        const kept = await far(R);
        ok(!picked.length && !added.length && kept.length === 1 && /60 lb is well below last time's 125/.test(kept[0]), 'L-41: a load far off is told against the machine in use: none for 200 lb on the first machine picked (its last 200) or 60 lb on one just added (no last time), and 60 lb on the machine last at 125 is', { picked, added, kept });
        await R.close();
      }
      // A dumbbell lift set to Machine, then the session that began its second gym deleted: the session after stays on it.
      {
        const seed = `(S, L) => { ${mkOf('dbRow')} S.sessions = [mk('a1', '2026-10-10', 60), mk('a2', '2026-10-17', 60), mk('b1', '2026-10-24', 40, { nw: true }), mk('c1', '2026-10-31', 45)]; }`;
        const P = await lifter({ items: [['dbRow', 3, 8, 12, 120]], fresh: true, seed, settings: { autoDone: false } });
        await P.page.click('#tabs [data-tab="program"]'); await wait(200);
        await P.tap('#view [data-act="planLib"]', 300); await P.page.fill('#view input[data-bind="libQ"]', 'One-Arm DB Row'); await wait(400);
        await P.tap('#view [data-act="exEdit"][data-ex="dbRow"]', 300); await P.page.selectOption('#modal [data-ebind="equip"]', 'machine'); await wait(150);
        await P.tap('#modal [data-act="exSave"]', 300);
        await del(P, 'b1');
        const on = await P.ev(() => (window.__ironlog.IDX().byEx.dbRow || []).map(x => [x.sid, x.mk]));
        await start(P);
        ok(JSON.stringify(on) === '[["a1","0"],["a2","0"],["c1","b1"]]' && /Today: 33\+ reps over 3 sets at 45 lb/.test(await hint(P)), 'L-41: a lift set to Machine in the exercise editor, then the session that began its second machine deleted: the session after it stays on that machine (33+ at 45 lb; REV23-4)', { on, hint: await hint(P) });
        await P.close();
      }
    }

    // A card taken out hands its machine to the lift's card left; its Undo takes the mark back with the card, so the
    // Undo of the machine added before leaves no card on it.
    {
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120], ['bench', 3, 6, 10, REST_BENCH]], fresh: true, seed: two, settings: { autoDone: false } }); const X = H(P);
      const marks = () => P.ev(() => window.__ironlog.state.draft.ex.filter(b => b.exId === 'machPress').map(b => [b.nw || null, b.mc || null]));
      await start(P); await X.sheet(); await addMachine(P, 'Hammer');
      await P.tap('#view [data-act="pickSession"]', 300); await P.page.fill('#pickQ', 'Machine Chest Press'); await wait(250);
      await P.tap('#modal [data-act="pickDo"][data-ex="machPress"]', 300); if ((await P.modal()) && (await P.modal()).kind === 'confirm') await mOk(P);
      await P.tap('#view [data-act="bMenu"][data-b="0"]', 200); await P.tap('#modal [data-act="bMenuDo"][data-op="bDel"]', 300); if ((await P.modal()) && (await P.modal()).kind === 'confirm') await mOk(P);
      const handed = await marks();
      await P.tap('#toast [data-act="undo"]', 300);
      const back = await marks();
      await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); }); await wait(150); await P.ev(() => document.querySelectorAll('#view details').forEach(x => { x.open = true; })); await wait(100); await P.tap('#view [data-act="undo"]', 350);
      const none = await marks();
      ok(JSON.stringify(handed) === '[[true,null]]' && JSON.stringify(back) === '[[true,null],[null,null]]' && JSON.stringify(none) === '[[null,null],[null,null]]', 'L-41: a card taken out and put back by Undo takes back the machine it handed the lift\'s other card, so the Undo of that machine leaves no card on it (REV23-6)', { handed, back, none });
      await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await wait(200);
      const second = await P.ev(() => { const L = window.__ironlog; const i = L.state.draft.ex.map(b => b.exId).lastIndexOf('machPress'); const el = document.querySelector(`#blk-${i} .hint`); return el ? el.innerText.replace(/\s+/g, ' ') : ''; });
      ok(/^Today: /.test(second) && !/New machine/.test(second), 'L-41: and the lift\'s second card, added while the machine was, reads the lift\'s target on its machine again, never "New machine" (REV24-7)', second);
      await P.close();
    }
    // The same with another Undo between: the machine added renamed on the card left, then Settings' Undo three times
    // (the name, the card taken out, the machine added): no card is left on a machine (REV24-8).
    {
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120], ['bench', 3, 6, 10, REST_BENCH]], fresh: true, seed: two, settings: { autoDone: false } }); const X = H(P);
      const marks = () => P.ev(() => window.__ironlog.state.draft.ex.filter(b => b.exId === 'machPress').map(b => [b.nw || null, b.mc || null]));
      const undoIn = async () => { await P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = 'settings'; L.render(); }); await wait(150); await P.ev(() => document.querySelectorAll('#view details').forEach(x => { x.open = true; })); await wait(100); await P.tap('#view [data-act="undo"]', 350); };
      await start(P); await X.sheet(); await addMachine(P, 'Hammer');
      await P.tap('#view [data-act="pickSession"]', 300); await P.page.fill('#pickQ', 'Machine Chest Press'); await wait(250);
      await P.tap('#modal [data-act="pickDo"][data-ex="machPress"]', 300); if ((await P.modal()) && (await P.modal()).kind === 'confirm') await mOk(P);
      await P.tap('#view [data-act="bMenu"][data-b="0"]', 200); await P.tap('#modal [data-act="bMenuDo"][data-op="bDel"]', 300); if ((await P.modal()) && (await P.modal()).kind === 'confirm') await mOk(P);
      await X.sheet(1); await X.pencil('new'); await X.save('Hammer 2');
      const renamed = await marks();
      for (let k = 0; k < 3; k++) await undoIn();
      const none = await marks();
      ok(JSON.stringify(renamed) === '[[true,null]]' && JSON.stringify(none) === '[[null,null],[null,null]]', 'L-41: with the machine added renamed on the card left between, three Undos (the name, the card taken out, the machine added) leave no card on a machine (REV24-8)', { renamed, none });
      await P.close();
    }
    // The lift added again, the first card (nothing done) taken out: the sets stay on the machine added.
    {
      const P = await lifter({ items: [['machPress', 3, 8, 12, 120], ['bench', 3, 6, 10, REST_BENCH]], fresh: true, seed: two, movable: true, settings: { autoDone: false } }); const X = H(P);
      await start(P); await X.sheet(); await addMachine(P, 'Hammer');
      await P.tap('#view [data-act="pickSession"]', 300); await P.page.fill('#pickQ', 'Machine Chest Press'); await wait(250);
      await P.tap('#modal [data-act="pickDo"][data-ex="machPress"]', 300); if ((await P.modal()) && (await P.modal()).kind === 'confirm') await mOk(P);
      const bi = await P.ev(() => window.__ironlog.state.draft.ex.map(b => b.exId).lastIndexOf('machPress'));
      await X.sets(bi, 100, [10, 10, 9]);
      await P.tap('#view [data-act="bMenu"][data-b="0"]', 200); await P.tap('#modal [data-act="bMenuDo"][data-op="bDel"]', 300); if ((await P.modal()) && (await P.modal()).kind === 'confirm') await mOk(P);
      // Its card, done, is folded: the mark it carries is read from the workout.
      const marks = await P.ev(() => window.__ironlog.state.draft.ex.filter(b => b.exId === 'machPress').map(b => [b.nw || null, b.mc || null]));
      await X.finish();
      await X.week('2026-11-18T10:00:00'); await start(P);
      ok(JSON.stringify(marks) === '[[true,null]]' && await X.tag() === 'Hammer' && /Today: 30\+ reps over 3 sets at 100 lb/.test(await P.ev(() => ((document.querySelector('#blk-0 .hint') || {}).innerText || '').replace(/\s+/g, ' '))), 'L-41: the lift added again stays on the machine added when the first card is taken out, and next week is on Hammer, read from its 100 lb (REV21-7)', { marks, next: await X.tag() });
      await P.close();
    }
  }

  /* ---------- L-42: a target line says "Today" only on its own day; a past workout's, or one left open from an
     earlier day, says "Target" ---------- */
  if (run('L-42')) {
    const hint = X => X.ev(() => ((document.querySelector('#blk-0 .hint b') || {}).innerText || '').replace(/\s+/g, ' ').trim());
    const P = await lifter({ movable: true, settings: { autoDone: false } });
    await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(150);
    await P.tap('#view [data-act="pastOpen"]', 250);
    await P.tap('#modal [data-act="pastGo"][data-day="0"]', 300);
    const past = await hint(P), pastDate = (await P.draft()).date;
    ok(pastDate === '2026-11-10' && /^Target: \d+\+ reps over 3 sets at \d+ lb$/.test(past), 'L-42: a past workout\'s target line begins "Target:", never "Today:"', { pastDate, past });
    await P.tap('#view [data-act="discard"]', 250); if (await P.modal()) await mOk(P);
    await start(P);
    const now = await hint(P);
    ok(/^Today: \d+\+ reps over 3 sets at \d+ lb$/.test(now), 'L-42: today\'s workout\'s target line begins "Today:"', now);
    await P.tap(tick(0, 0), 250);
    await P.ev(() => window.__setClock('2026-11-14T10:00:00')); await P.ev(() => window.__ironlog.render()); await wait(150);
    const later = await hint(P), d = await P.draft();
    ok(d.date === DAY && later === now.replace(/^Today:/, 'Target:'), 'L-42: the same workout opened three days later keeps its targets, its line beginning "Target:"', { date: d.date, later, now });
    await P.close();
  }

  /* ---------- L-43: a lift added to a freestyle workout opens with the sets of its own last full session; a routine
     the lifter does not follow (freestyle mode) gives it nothing ---------- */
  if (run('L-43')) {
    /* The UAT's freestyler (UAT-3, UAT-9): Today in freestyle mode, the routine in use holding the bench at 4 sets, his
       own last bench 185 x 10, 10, 10 in a freestyle session. + Add exercise brings the bench with his 3 sets, the
       target over them, and Finish with all 3 ticked asks nothing about sets not done. */
    const LBk = 0.45359237;
    const seed = `(S, L) => { const LB = ${LBk}; S.settings.todayStart = 'free'; S.sessions = [{ id: 'f1', date: '2026-11-07', dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', free: true, notes: '', deload: false, light: false, ex: [{ exId: 'bench', rr: [6, 10], sets: [10, 10, 10].map(r => ({ w: 185 * LB, r, rir: 2, done: true })) }] }]; }`;
    const P = await lifter({ items: [['bench', 4, 6, 10, REST_BENCH]], fresh: true, seed, movable: true, settings: { autoDone: false } });
    await P.page.click('#tabs [data-tab="today"]'); await wait(120);
    await P.tap('#view .hero[data-day="free"] [data-act="startFree"]', 300);
    await P.ev(() => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' }); }); await wait(200);
    await P.tap('#modal [data-act="pickDo"][data-ex="bench"]', 300);
    const rows = await P.rows(0), hint = await P.ev(() => ((document.querySelector('#blk-0 .hint b') || {}).innerText || '').replace(/\s+/g, ' ').trim());
    ok(rows.length === 3 && hint === 'Today: 195 lb for 6+ reps in every set', 'L-43: the bench added to a freestyle workout opens with its own last session\'s 3 sets (10, 10, 10 at 185 lb, so a step up), not the 4 of a routine not followed', { rows: rows.length, hint });
    for (const k of [0, 1, 2]) await P.tap(tick(0, k), 200);
    await P.tap('#view [data-act="finish"]', 300);
    const m = await P.modal();
    ok(m && m.kind === 'recap', 'L-43: Finish with every row ticked asks nothing about sets not done', m && { kind: m.kind, title: m.title, text: m.text.slice(0, 160) });
    await P.ev(() => window.__ironlog.ACT.mClose()); await wait(150); await P.ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await wait(150);
    const done = await P.ev(() => { const x = window.__ironlog.state.sessions.find(q => q.id !== 'f1'); return x ? x.ex[0].sets.map(q => q.r) : null; });
    await P.ev(() => window.__setClock('2026-11-14T10:00:00')); await P.ev(() => window.__ironlog.render()); await wait(150);
    await P.tap('#view .hero[data-day="free"] [data-act="startFree"]', 300);
    await P.ev(() => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' }); }); await wait(200);
    await P.tap('#modal [data-act="pickDo"][data-ex="bench"]', 300);
    const next = await P.ev(() => ((document.querySelector('#blk-0 .hint b') || {}).innerText || '').replace(/\s+/g, ' ').trim());
    const sum = (done || []).reduce((a, r) => a + r, 0);
    ok(done && done.length === 3 && next === `Today: ${sum + 1}+ reps over 3 sets at 195 lb` && (await P.rows(0)).length === 3, 'L-43: the 3 sets done set the next target, three days later, over 3 sets again', { done, next });
    await P.close();
    // A guard: a lifter following the routine adds the bench on the same blank workout and gets the routine's 4 sets.
    const seedPlan = seed.replace("S.settings.todayStart = 'free'; ", '');
    const Q = await lifter({ items: [['bench', 4, 6, 10, REST_BENCH]], fresh: true, seed: seedPlan, settings: { autoDone: false } });
    await Q.ev(() => window.__ironlog.ACT.startFree({ dataset: {} })); await wait(300);
    await Q.ev(() => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' }); }); await wait(200);
    await Q.tap('#modal [data-act="pickDo"][data-ex="bench"]', 300);
    ok((await Q.rows(0)).length === 4, 'L-43: (guard) a lifter following the routine gets the bench\'s 4 sets from it in a blank workout', (await Q.rows(0)).length);
    await Q.close();
  }

  /* ---------- L-44: the RIR check is offered only to a lifter who rates his sets: it measures his calls, so one who
     makes none is never asked for a set to failure ---------- */
  if (run('L-44')) {
    // Three sessions of a machine press, each set rated (o.rir 2) or each left blank (null), then today's workout.
    const lifts = rir => {
      const LBk = 0.45359237;
      return `(S, L) => { const LB = ${LBk}; S.sessions = ['2026-10-28', '2026-11-01', '2026-11-07'].map((date, i) => ({ id: 'm' + i, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'machPress', rr: [8, 12], ps: 3, sets: [10, 10, 9].map(r => ({ w: 150 * LB, r, rir: ${rir}, done: true })) }] })); }`;
    };
    const due = X => X.ev(() => { const el = document.querySelector('#blk-0 .caldue'); return el ? el.innerText.replace(/\s+/g, ' ').trim() : ''; });
    const P = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed: lifts('null'), settings: { autoDone: false } });
    await start(P);
    const blank = await due(P);
    ok(blank === '', 'L-44: a lifter who never rated a set is not offered the RIR check', blank);
    await P.close();
    const Q = await lifter({ items: [['machPress', 3, 8, 12, 120]], fresh: true, seed: lifts(2), settings: { autoDone: false } });
    await start(Q);
    const rated = await due(Q);
    ok(/^Due for an RIR check: take one set here to failure\./.test(rated), 'L-44: (guard) a lifter who rated his sets in 3 sessions is offered it, as before', rated);
    await Q.close();
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL the suite stopped:', (e && e.stack) || e); process.exit(1); });
