// The session screen, checked against its written rules (CA-1; the spec "The session screen", L-1 to L-22, in the
// project's claude/ironlog-spec-session.md, built from the code: workout.ts, worksets.ts, worktaps.ts, workfields.ts,
// workfinish.ts, timer.ts, actsstart.ts and session.ts, V's rulings deciding, and where neither does, what a lifter
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
    new MutationObserver(() => {
      if (el.hidden) return;
      const t = el.innerText.replace(/\s+/g, ' ').replace(/ Undo$/, '').trim(), last = window.__toasts[window.__toasts.length - 1];
      if (t && t !== last) window.__toasts.push(t);
    }).observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
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
  const items = o.items || [['bench', 3, 6, 10, REST_BENCH], ['lateralRaise', 2, 10, 15, REST_RAISE]];
  const P = await open(FILE, { browser: o.browser, w: o.w || 390, h: 844, clock: (o.day || DAY) + 'T10:00:00', setup: async ctx => { await ctx.addInitScript(TOAST_LOG); } });
  P.ev = (f, a) => P.page.evaluate(f, a);
  await P.ev(([items, o, LB]) => {
    const L = window.__ironlog; const S = L.state;
    S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.lastExport = '2026-11-11';
    Object.assign(S.settings, o.settings || {});
    S.routines = [{ id: 'R1', name: 'Mine', schedule: 'cycle', days: [{ id: 'A', name: 'Push', rest: false, items: items.map(([exId, sets, repMin, repMax, rest], k) => ({ uid: 'i' + k, exId, sets, repMin, repMax, rir: 2, rest, ss: null })) }] }];
    S.activeRoutineId = 'R1';
    S.sessions = o.fresh ? [] : [{ id: 'last', date: '2026-11-07', dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [
      { exId: 'bench', rr: [6, 10], ps: 3, sets: [[185, 8], [185, 8], [185, 7]].map(([w, r]) => ({ w: w * LB, r, rir: 2, done: true })) },
      { exId: 'lateralRaise', rr: [10, 15], ps: 2, sets: [[20, 12], [20, 12]].map(([w, r]) => ({ w: w * LB, r, rir: 2, done: true })) }] }];
    // eslint-disable-next-line no-new-func
    if (o.seed) new Function('return ' + o.seed)()(S, L);
    L.state = L.normalize(S);
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
  }, [items, { settings: o.settings, fresh: !!o.fresh, seed: o.seed ? String(o.seed) : '' }, LB]);
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
// A row's button by its action, for exercise b's row s (or the exercise's own when s is null).
const btn = (act, b, s) => `#view [data-act="${act}"][data-b="${b}"]${s == null ? '' : `[data-s="${s}"]`}`;
// The confirm sheet's buttons, as the lifter taps them.
const mOk = P => P.tap('#modal [data-act="mOk"]', 250);
const mAlt = P => P.tap('#modal [data-act="mAlt"]', 250);

(async () => {
  /* ---------- L-1: Today's Start starts the day: its exercises, the plan's sets, the targets in grey ---------- */
  if (run('L-1')) {
    const P = await lifter();
    await start(P);
    const d = await P.draft();
    ok(d && d.ex.map(b => b.exId).join() === 'bench,lateralRaise', 'L-1: the day\'s exercises, in the plan\'s order', d && d.ex.map(b => b.exId));
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
    await P.close();
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
    await P.tap('#view [data-act="finish"]', 250); m = await P.modal();
    if (m && m.title === '2 of 5 sets not done') { await mOk(P); m = await P.modal(); }
    ok(m && m.title === 'Some sets are not marked done' && m.text.includes('Barbell Bench Press (1 set)'), 'L-18: a set with reps and no tick is named before saving: "Some sets are not marked done"', m);
    await mOk(P);
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

  /* ---------- L-20: Short on time: blank rows go from the end, typed and ticked sets stay, with Undo ---------- */
  if (run('L-20')) {
    // A longer day (about half an hour left), so 15 minutes asks for a trim.
    const P = await lifter({ settings: { autoDone: false }, items: [['bench', 6, 6, 10, 180], ['lateralRaise', 4, 10, 15, 90], ['cableFly', 4, 10, 15, 90]] });
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
    ok(s0.done && s0.r === 0 && (await P.toasts()).includes('Logged as missed. It counts toward no volume or PRs, and never earns a step up.'), 'L-21: a set ticked with 0 reps is logged as missed, and says what that means', { s0, t: await P.toasts() });
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
    ok(d.ex.map(b => b.exId).join() === 'lateralRaise,bench', 'L-22: "Move up" puts the raises first', d.ex.map(b => b.exId));
    await P.tap(btn('bMenu', 0), 250); await P.tap('#modal [data-act="bMenuDo"][data-op="bDown"]', 300);
    ok((await P.draft()).ex.map(b => b.exId).join() === 'bench,lateralRaise', 'L-22: "Move down" puts them back', (await P.draft()).ex.map(b => b.exId));
    await P.close();
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL the suite stopped:', (e && e.stack) || e); process.exit(1); });
