// The session screen, checked against its written rules (CA-1; the spec "The session screen", L-1 to L-35, in the
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
  const items = o.items || [['bench', 3, 6, 10, REST_BENCH], ['dbLateral', 2, 10, 15, REST_RAISE]];
  // o.movable: a clock the check moves (window.__setClock), from 10:00 on the day, as a lifter's day goes on; a page
  // loaded again starts at the time the check left in the tab's name ("__clock=..."), an app closed and opened on a
  // later day. The tab's name, not storage: in this harness an init script that reads localStorage as a page reloads
  // sometimes gave that page an empty storage (found building NEW-96's check).
  const T0 = JSON.stringify((o.day || DAY) + 'T10:00:00');
  const MOVABLE = `(()=>{const R=Date;let off=new R(${T0}).getTime()-R.now();const m=/^__clock=(.+)$/.exec(window.name||'');if(m)off=new R(m[1]).getTime()-R.now();window.__setClock=t=>{off=new R(t).getTime()-R.now();};class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`;
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
      await P.ev(t => { window.name = '__clock=' + t; }, t);
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
    ok((await P.toasts()).includes('Lighter: 1 exercise not started now half the sets at about 90% loads'), 'L-32: it says "Lighter: 1 exercise not started now half the sets at about 90% loads"', await P.toasts());
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

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL the suite stopped:', (e && e.stack) || e); process.exit(1); });
