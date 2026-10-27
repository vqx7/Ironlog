// r64: the smaller fixes of the r63 audit (PENDING.md's tracker), each case
// failing on r63 (`node tests/r64.js baselines/r63.html`) unless it says it
// guards what r63 did. `node tests/r64.js <page> 3` runs section 3 alone.
//   1  P-S4-2: a best estimate that rounds to the one before it says no
//      "was" number, in the recap and in the toast as the set is ticked.
//   2  P-S4-8: a workout left open overnight says it started yesterday (or
//      on its date), not a bare time that reads as this morning.
//   3  F8: a workout from 23:30 to 00:20 is saved on the day it began with
//      its 50 minutes, as one done before midnight is.
//   4  P-S4-6: the first Set up page, whose header is hidden, has Help at
//      its foot: the menu, with Report a problem and the Guide, and only
//      items that do something there.
//   5  P-S4-4: on a weekly routine, Today right after a workout says it is
//      done today, as a cycle's card does.
//   6  P-S4-9: a toast's Undo reverses the change it reports, so it goes once
//      another change is made after it.
//   7  P-S4-5 (V's decision 3): warm-up and drop rows have grey reps, what
//      that row did last time; the first time, a drop takes the set before
//      it and a warm-up the top of the range. Their checkmark takes them.
//   8  363: the reason for a load raised because the sets were easy names
//      the reserve of the sets the plan asked for, not a set past them.
//   9  A-4: a page left open past midnight reads the new day as a page
//      opened on it does, without waiting for the log to change.
//  10  F2: notes that name both kg and lb start on the app's unit and say
//      so, so a line with no unit is not read in the first unit named.
//  11  302: the ready-made routines rest an isolation lift 90 s at least
//      (V, 2026-10-25), one named value; a copy made before r64, untouched,
//      still reads as ready-made, and a routine on a phone keeps its rests.
const { open, engine } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', m); };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const run = n => !ONLY || ONLY.includes(n);

(async () => {
  const browser = await engine.launch();
  const pages = [];

  // ---- 1. P-S4-2: "Best estimate 8 lb per dumbbell (was 8)". DB bench at 3 kg (6.6 lb) for 7, then for 8, shown in
  // pounds: a little stronger, the same whole pound. The PR stands; a "was" that reads the same number says nothing.
  if (run(1)) {
    const P = await open(FILE, { browser, clock: '2026-10-15T10:00:00' }); pages.push(P);
    const r = await P.page.evaluate(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb';
      const sess = (id, date, w, r) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId: 'dbBench', rr: [6, 15], sets: [{ w, r, rir: 0, warm: false, drop: false }] }] });
      const out = {};
      for (const [k, w, r0] of [['same', 3, 7], ['more', 3, 8]]) {
        s.draft = null; s.sessions = [sess('p1', '2026-10-08', w, r0)];
        L.state = L.normalize(s); L.invalidate(); L.saveNow();
        const set = { w, r: r0 + 1, rir: 0, warm: false, drop: false, done: true }; const kind = L.livePR('dbBench', set, '2026-10-15'); const live = kind ? kind + L.prBeat('dbBench', set, '2026-10-15', kind) : '';
        L.ACT.startFree(); await new Promise(q => setTimeout(q, 120));
        const f = L.state.draft; f.ex = [L.newBlock('dbBench', L.planFor('dbBench', null, null, false, f.date), {})];
        f.ex[0].sets.length = 1; Object.assign(f.ex[0].sets[0], { w, r: r0 + 1, rir: 0, done: true });
        f._rampAsked = true; f._leftAsked = true; L.ACT.finishNow(); await new Promise(q => setTimeout(q, 300));
        const m = L.ui.modal; out[k] = { live, prs: m && m.prs };
        if (L.ui.modal) L.ACT.mClose();
      }
      return out;
    });
    const num = t => ((t || '').match(/(\d+) lb/) || [])[1];
    const same = r.same.prs && r.same.prs[0];
    ok(same && /^Best estimate 8 lb/.test(same.what) && same.was === '', '1. the recap: Best estimate 8 lb per dumbbell, with no "was 8" beside it (r63: "was 8")', r.same);
    ok(typeof r.same.live === 'string' && /estimated 1RM 8 lb/.test(r.same.live) && !/was 8/.test(r.same.live), '1. the toast as the set is ticked: the estimate with no "was 8" (r63: "; was 8")', r.same.live);
    const more = r.more.prs && r.more.prs[0];
    ok(more && /^Best estimate 9 lb/.test(more.what) && more.was === 'was 8' && /was 8/.test(r.more.live || ''), '1. (a guard) a best estimate one pound up still says what it was, in the recap and the toast', r.more);
    ok(num(same && same.what) === '8', '1. (the case) the two estimates round to one number', r.same);
  }

  // ---- 2. P-S4-8: started at 9:00 one morning, still open the next: "started 9:00 AM" read as today.
  if (run(2)) {
    const P = await open(FILE, { browser, clock: '2026-10-27T08:15:00' }); pages.push(P);
    const r = await P.page.evaluate(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true;
      const meta = async startIso => {
        if (L.state.draft) { L.state.draft = null; L.saveNow(); }
        L.ACT.startFree(); await new Promise(q => setTimeout(q, 120));
        L.state.draft.startedAt = new Date(startIso).getTime(); L.saveNow(); L.render(); await new Promise(q => setTimeout(q, 120));
        const el = document.querySelector('#view .ph .meta'); return el ? el.innerText.replace(/\s+/g, ' ') : '';
      };
      return { yesterday: await meta('2026-10-26T09:00:00'), earlier: await meta('2026-10-24T09:00:00'), today: await meta('2026-10-27T07:40:00') };
    });
    ok(/started yesterday/.test(r.yesterday) && !/9:00/.test(r.yesterday), '2. begun yesterday at 9:00 and opened this morning: "started yesterday", not "started 9:00 AM" (r63)', r.yesterday);
    ok(/started (Sat, )?Oct 24/.test(r.earlier) && !/9:00/.test(r.earlier), '2. begun three days before: started on its date', r.earlier);
    ok(/started 7:40/.test(r.today), '2. (a guard) begun this morning: started at its time, as before', r.today);
  }

  // ---- 3. F8: begun at 23:30 on Oct 31, finished at 00:20 on Nov 1: saved on Oct 31 with no minutes on r63.
  if (run(3)) {
    const P = await open(FILE, { browser, clock: '2026-11-01T00:20:00' }); pages.push(P);
    const r = await P.page.evaluate(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; L.saveNow();
      const fin = async (date, minsAgo, past) => {
        L.ACT.startFree(); await new Promise(q => setTimeout(q, 120));
        const f = L.state.draft; f.date = date; f.startedAt = Date.now() - minsAgo * 60000; if (past) f.past = true;
        f.ex = [L.newBlock('bench', L.planFor('bench', null, null, false, f.date), {})]; f.ex[0].sets.length = 1;
        Object.assign(f.ex[0].sets[0], { w: 100, r: 8, rir: 2, done: true }); f._rampAsked = true; f._leftAsked = true;
        const id = f.id; L.ACT.finishNow(); await new Promise(q => setTimeout(q, 300)); if (L.ui.modal) L.ACT.mClose();
        const x = L.state.sessions.find(z => z.id === id); return x ? { date: x.date, durMin: x.durMin ?? null } : null;
      };
      return { across: await fin('2026-10-31', 50, false), past: await fin('2026-10-20', 50, true), tonight: await fin('2026-11-01', 15, false) };
    });
    ok(r.across && r.across.date === '2026-10-31' && r.across.durMin === 50, '3. begun at 23:30 and finished at 00:20: saved on Oct 31 with its 50 minutes (r63: no minutes)', r.across);
    ok(r.past && r.past.durMin === null, '3. (a guard) a past workout logged later is not timed by the clock', r.past);
    ok(r.tonight && r.tonight.durMin === 15, '3. (a guard) a workout begun and finished the same day is timed as before', r.tonight);
  }

  // ---- 4. P-S4-6: a new install's Set up page hides the header and its menu button, so a person stuck there had no
  // way to Help or to Report a problem.
  if (run(4)) {
    const P = await open(FILE, { browser, clock: '2026-10-15T10:00:00', realStarter: true }); pages.push(P);
    const r = await P.page.evaluate(async () => {
      const p0 = document.getElementById('obPage'); if (p0 && p0.dataset.step === 'acct') { document.querySelector('#obPage [data-act="obAcctLater"]').click(); await new Promise(q => setTimeout(q, 200)); }
      const page = document.getElementById('obPage');
      const lines = [...page.querySelectorAll('*')].filter(e => e.children.length === 0 && e.textContent.trim()).map(e => e.textContent.trim());
      const help = [...page.querySelectorAll('button')].find(b => b.textContent.trim() === 'Help');
      const box = help ? help.getBoundingClientRect() : null;
      if (help) help.click(); await new Promise(q => setTimeout(q, 200));
      const m = window.__ironlog.ui.modal; const items = [...document.querySelectorAll('#modal button')].map(b => b.textContent.trim());
      // Each item the menu offers here must do something: tapped, it leaves the menu (a sheet, or the page changed).
      const dead = [];
      for (const label of [...document.querySelectorAll('#modal button.mnu')].map(b => b.textContent.trim())) {
        if (!window.__ironlog.ui.modal) { help.click(); await new Promise(q => setTimeout(q, 150)); }
        const b = [...document.querySelectorAll('#modal button.mnu')].find(x => x.textContent.trim() === label); if (!b) continue;
        const before = document.getElementById('obPage') && document.getElementById('obPage').dataset.step;
        b.click(); await new Promise(q => setTimeout(q, 250));
        const m2 = window.__ironlog.ui.modal; const now = document.getElementById('obPage') && document.getElementById('obPage').dataset.step;
        if (m2 && m2.kind === 'menu' && now === before) dead.push(label);
        if (window.__ironlog.ui.modal) window.__ironlog.ACT.mClose(); await new Promise(q => setTimeout(q, 150));
        if (m2 && m2.kind === 'menu') continue;
        // The menu went: it did something, unless it closed and left the Set up page as it was with nothing open.
        if (!m2 && now === before && document.getElementById('obPage')) dead.push(label);
      }
      // The menu from the header, once Set up is done, still offers the two that open a tab (a guard).
      return { step: page.dataset.step, len: lines.join(' ').length, long: lines.filter(t => t.length > 45), help: !!help, h: box && Math.round(box.height), kind: m && m.kind, items, dead };
    });
    ok(r.step === 'start' && r.help && r.kind === 'menu' && r.items.some(t => /Report a problem/.test(t)) && r.items.some(t => /^Guide/.test(t)), '4. the Set up page has Help at its foot, opening the menu with Report a problem and the Guide (r63: no way to either)', r);
    ok(r.len < 400 && !r.long.length && r.h >= 44, '4. the page stays under 400 characters in lines of 45 at most, and Help is 44 px tall', r);
    ok(Array.isArray(r.dead) && !r.dead.length && !r.items.some(t => /reorder sections|Your data and backups/.test(t)), '4. every item of the menu opened there does something: the sections and Your data, which need the tabs, are left out (r63 offered taps that did nothing)', r);
    const g = await P.page.evaluate(async () => {
      const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); await new Promise(q => setTimeout(q, 150));
      L.ACT.menuOpen(); await new Promise(q => setTimeout(q, 150));
      const items = [...document.querySelectorAll('#modal button')].map(b => b.textContent.trim()); L.ACT.mClose(); return items;
    });
    ok(g.some(t => /reorder sections/.test(t)) && g.some(t => /Your data and backups/.test(t)), '4. (a guard) the menu once Set up is done still offers the sections and Your data', g);
  }

  // ---- 5. P-S4-4: a weekly routine's Tuesday done on Tuesday: Today offered Tuesday again with nothing to say it was done
  // (a cycle's card says "Day 2 done today."). Tuesday 2026-10-27.
  if (run(5)) {
    const P = await open(FILE, { browser, clock: '2026-10-27T18:00:00' }); pages.push(P);
    const r = await P.page.evaluate(async () => {
      const L = window.__ironlog;
      const note = async (weekly, sess) => {
        const s = L.state; s.settings.onboarded = true; s.settings.todayStart = 'plan'; s.draft = null;
        const R = s.routines.find(x => x.id === s.activeRoutineId) || s.routines[0]; s.activeRoutineId = R.id;
        if (weekly) { R.schedule = 'weekly'; while (R.days.length < 7) R.days.push({ id: 'dx' + R.days.length, name: 'Rest', rest: true, items: [] }); R.days = R.days.slice(0, 7); R.days.forEach((d, i) => { if (i > 1) { d.rest = true; d.items = []; } else d.rest = false; }); R.days[1].name = 'Pull'; }
        const d = R.days[sess.di];
        s.sessions = sess.date ? [{ id: 'w1', date: sess.date, dayIdx: sess.di, dayId: d.id, dayName: d.name, routineId: R.id, free: false, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: 100, r: 8, rir: 2, warm: false, drop: false }] }] }] : [];
        L.state = L.normalize(s); L.invalidate(); L.saveNow(); L.ui.todayDay = null; L.ui.tab = 'today'; L.render(); await new Promise(q => setTimeout(q, 150));
        const h = document.querySelector('#view .hero'); const n = h && h.querySelector('.hero-note');
        return { h2: h && h.querySelector('h2') && h.querySelector('h2').textContent.trim(), note: n ? n.textContent.trim() : '' };
      };
      const cycle = await note(false, { di: 0, date: '2026-10-27' }); // first: the weekly cases turn the routine weekly
      return { cycle, done: await note(true, { di: 1, date: '2026-10-27' }), monday: await note(true, { di: 0, date: '2026-10-26' }), none: await note(true, {}) };
    });
    ok(r.done.h2 === 'Pull' && r.done.note === 'Pull done today.', '5. a weekly routine\'s Tuesday done on Tuesday: Today says "Pull done today." (r63: nothing)', r.done);
    ok(r.monday.note === '' && r.none.note === '', '5. (a guard) yesterday\'s Monday, or nothing logged, says nothing', r);
    ok(r.cycle.note === 'Day 1 done today.', '5. (a guard) a cycle still says its day is done today', r.cycle);
  }

  // ---- 6. P-S4-9: Bench swapped to Hack Squat ("Swapped to Hack Squat", Undo), then its first set ticked. The toast's Undo stayed:
  // tapped, it put Bench back and moved Hack Squat, with its set, to the end of the workout.
  if (run(6)) {
    const P = await open(FILE, { browser, clock: '2026-10-15T10:00:00' }); pages.push(P);
    const start = () => P.page.evaluate(async () => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb'; delete s.settings.todayStart; s.sessions = []; s.draft = null; L.state = L.normalize(s); L.invalidate();
      L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose(); const d = L.state.draft;
      for (const id of ['bench', 'latPulldown', 'dbCurl']) d.ex.push(L.newBlock(id, { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * LB }, {}));
      L.saveNow(); L.ui.tab = 'today'; L.render(); await new Promise(q => setTimeout(q, 150));
      L.applyPick({ mode: 'swapBlock', b: 0 }, 'hackSquat'); await new Promise(q => setTimeout(q, 150));
      const t = document.getElementById('toast');
      return { undo: !!(t && !t.hidden && t.querySelector('[data-act="undo"]')), shape: L.state.draft.ex.map(b => b.exId).join() };
    });
    const shape = () => P.page.evaluate(() => window.__ironlog.state.draft.ex.map(b => `${b.exId}${b.sets.some(x => x.done) ? '*' : ''}`).join(' '));
    const a = await start();
    ok(a.undo && a.shape === 'hackSquat,latPulldown,dbCurl', '6. (the case) the swap shows its toast with Undo', a);
    // Hack Squat's first set, its load and reps typed as a lifter types them, then ticked by its button.
    await P.page.fill('[data-f="w"][data-b="0"][data-s="0"]', '135').catch(() => {});
    await P.page.fill('[data-f="r"][data-b="0"][data-s="0"]', '8').catch(() => {});
    await P.page.evaluate(async () => { const L = window.__ironlog; const x = L.state.draft.ex[0].sets[0]; if (!(x.w > 0)) x.w = 135 * 0.45359237; if (!(x.r > 0)) x.r = 8; L.render(); await new Promise(q => setTimeout(q, 100)); });
    await P.page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await P.page.waitForTimeout(250);
    const after = await P.page.evaluate(() => { const t = document.getElementById('toast'); return { visible: !!(t && !t.hidden), undo: !!(t && !t.hidden && t.querySelector('[data-act="undo"]')), text: t ? t.textContent : '' }; });
    const s1 = await shape();
    ok(s1 === 'hackSquat* latPulldown dbCurl', '6. (the case) Hack Squat\'s first set is ticked', s1);
    ok(!after.undo, '6. once a set is ticked after the swap, the toast no longer offers the swap\'s Undo (r63: it did, and it moved Hack Squat to the end)', after);
    // A guard: the Undo offered and tapped at once still reverses the swap.
    const b = await start();
    if (b.undo) { await P.page.click('#toast [data-act="undo"]'); await P.page.waitForTimeout(250); }
    ok(b.undo && (await shape()) === 'bench latPulldown dbCurl', '6. (a guard) the swap\'s Undo tapped before anything else puts Bench back in its place', await shape());
    // A guard: Settings' Undo last delete or reset still takes back a delete after other changes.
    const g = await P.page.evaluate(async () => {
      const L = window.__ironlog; const s = L.state; s.draft = null;
      s.sessions = [{ id: 'k1', date: '2026-10-10', dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [8, 12], sets: [{ w: 60, r: 8, rir: 2, warm: false, drop: false }] }] }];
      L.state = L.normalize(s); L.invalidate(); L.saveNow();
      L.act(() => { L.state.sessions = L.state.sessions.filter(x => x.id !== 'k1'); }, { undo: true });
      L.act(() => { L.state.settings.timeBudget = 55; });
      L.ui.tab = 'settings'; L.render(); await new Promise(q => setTimeout(q, 150));
      const btn = [...document.querySelectorAll('#view [data-act="undo"]')][0]; if (btn) btn.click(); await new Promise(q => setTimeout(q, 200));
      return { back: L.state.sessions.some(x => x.id === 'k1'), budget: L.state.settings.timeBudget };
    });
    ok(g.back && g.budget === 55, '6. (a guard) Settings\' Undo still takes back a delete made before another change, and keeps that change', g);
  }

  // ---- 7. P-S4-5: bench last time: warm-ups 40 x 10 and 60 x 5, three sets of 8 at 100, a drop at 70 for 12. Today its
  // warm-up and drop rows showed no grey reps, and a warm-up's checkmark said "Enter reps first".
  if (run(7)) {
    const P = await open(FILE, { browser, clock: '2026-10-15T10:00:00' }); pages.push(P);
    const setup = () => P.page.evaluate(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg'; s.settings.autoDone = false; delete s.settings.todayStart; s.draft = null;
      const set = (w, r, k) => ({ w, r, rir: 2, warm: k === 'w', drop: k === 'd' });
      s.sessions = [{ id: 'p1', date: '2026-10-08', dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [set(40, 10, 'w'), set(60, 5, 'w'), set(100, 8), set(100, 8), set(100, 8), set(70, 12, 'd')] }] }];
      L.state = L.normalize(s); L.invalidate(); L.saveNow();
      L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose(); await new Promise(q => setTimeout(q, 100));
      const d = L.state.draft;
      d.ex = [L.newBlock('bench', L.planFor('bench', null, null, false, d.date), {}), L.newBlock('dbCurl', { sets: 2, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2 }, {})];
      // Each block given two warm-up rows above its sets and a drop row below, as the set number's taps make them.
      for (const b of d.ex) { const t = b.sets[0]; const blank = k => ({ ...JSON.parse(JSON.stringify(t)), w: null, r: null, rir: null, done: false, warm: k === 'w', drop: k === 'd' }); b.sets = [blank('w'), blank('w'), ...b.sets, blank('d')]; }
      L.saveNow(); L.ui.tab = 'today'; L.render(); await new Promise(q => setTimeout(q, 150));
      const ph = bi => [...document.querySelectorAll(`.sg input[data-f="r"][data-b="${bi}"]`)].map(x => x.placeholder);
      return { bench: ph(0), curl: ph(1), n: d.ex.map(b => b.sets.length) };
    });
    const a = await setup();
    const nb = a.n[0];
    ok(a.bench[0] === '10' && a.bench[1] === '5', '7. bench\'s warm-up rows show last time\'s warm-up reps in grey, 10 and 5 (r63: none)', a.bench);
    ok(a.bench[nb - 1] === '12', '7. bench\'s drop row shows last time\'s drop, 12 (r63: none)', a.bench);
    ok(a.bench.slice(2, nb - 1).every(x => x === '8'), '7. (a guard) its working rows still show last time\'s 8s', a.bench);
    ok(a.curl[0] === '12' && a.curl[1] === '12', '7. a lift done for the first time: its warm-ups show the top of its range, 12', a.curl);
    ok(a.curl[a.n[1] - 1] === a.curl[a.n[1] - 2] && a.curl[a.n[1] - 1] === '8', '7. its drop row the first time takes the set before it (in grey, 8)', a.curl);
    // The first warm-up's load typed, then its checkmark: logged at 10 reps.
    await P.page.fill('.sg input[data-f="w"][data-b="0"][data-s="0"]', '40');
    await P.page.press('.sg input[data-f="w"][data-b="0"][data-s="0"]', 'Tab').catch(() => {});
    await P.page.waitForTimeout(150);
    await P.page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await P.page.waitForTimeout(250);
    const t1 = await P.page.evaluate(() => { const x = window.__ironlog.state.draft.ex[0].sets[0]; const t = document.getElementById('toast'); return { done: !!x.done, r: x.r, w: x.w, toast: t && !t.hidden ? t.textContent : '' }; });
    ok(t1.done && t1.r === 10 && t1.w === 40, '7. the warm-up\'s checkmark logs it at its grey 10 reps (r63: "Enter reps first")', t1);
    // Curl's working set before the drop typed at 10: the drop's grey reps follow it.
    const last = a.n[1] - 2;
    await P.page.fill(`.sg input[data-f="r"][data-b="1"][data-s="${last}"]`, '10');
    await P.page.press(`.sg input[data-f="r"][data-b="1"][data-s="${last}"]`, 'Tab').catch(() => {});
    await P.page.waitForTimeout(200);
    const dropPh = await P.page.evaluate(n => document.querySelector(`.sg input[data-f="r"][data-b="1"][data-s="${n}"]`).placeholder, a.n[1] - 1);
    ok(dropPh === '10', '7. the first time, a drop takes the reps typed in the set before it, 10', dropPh);
    // A warm-up with no load still asks for it: a set is never saved without its load (a guard).
    await P.page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await P.page.waitForTimeout(250);
    const t2 = await P.page.evaluate(() => { const x = window.__ironlog.state.draft.ex[0].sets[1]; const t = document.getElementById('toast'); return { done: !!x.done, toast: t && !t.hidden ? t.textContent : '' }; });
    ok(!t2.done && /Add the weight first/.test(t2.toast), '7. (a guard) a warm-up with no load is not ticked: "Add the weight first"', t2);
  }

  // ---- 8. 363: bench planned 3 x 8-12 at RIR 1, done 60 kg x 10 at RIR 4 three times and a fourth set x 8 at RIR 0. The load
  // goes up because the planned sets were easy; the reason said "RIR 3", the fourth set averaged in.
  if (run(8)) {
    const P = await open(FILE, { browser, clock: '2026-10-15T10:00:00' }); pages.push(P);
    const r = await P.page.evaluate(() => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg';
      const plan = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 };
      const one = (sets, scale) => {
        s.settings.rirScale = scale; s.draft = null;
        s.sessions = [{ id: 'q1', date: '2026-10-08', dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [8, 12], sets: sets.map(([r, rir]) => ({ w: 60, r, rir, warm: false, drop: false })) }] }];
        L.state = L.normalize(s); L.invalidate(); return L.suggest('bench', plan).text;
      };
      return { extra: one([[10, 4], [10, 4], [10, 4], [8, 0]], 'rir'), plain: one([[10, 4], [10, 4], [10, 4]], 'rir'), rpe: one([[10, 4], [10, 4], [10, 4], [8, 0]], 'rpe') };
    });
    ok(/RIR 4 at 60 kg against a target of 1/.test(r.extra), '8. a fourth set past the plan is left out of the reason: "RIR 4 at 60 kg" (r63: "RIR 3")', r.extra);
    ok(/RIR 4 at 60 kg against a target of 1/.test(r.plain), '8. (a guard) three planned sets at RIR 4 say RIR 4, as before', r.plain);
    ok(/RPE 6 at 60 kg against a target of RPE 9/.test(r.rpe), '8. the same reason in RPE: RPE 6 (r63: RPE 7)', r.rpe);
  }

  // ---- 9. A-4: the caches built on Sunday were read on Monday until the log next changed. wide.js's histories, read
  // just before midnight, just after it with nothing done, and after the caches are dropped by hand: the second must be
  // the third (r63 read Sunday's weeks and gaps there).
  if (run(9)) {
    const { wide, midnightRun } = require('./wide');
    const P = await open(FILE, { browser, clock: '2026-10-11T12:00:00' }); pages.push(P);
    const LIB = await P.page.evaluate(() => window.__ironlog.libExercises());
    let same = 0, turned = 0, first = null; const N = 12;
    for (let i = 0; i < N; i++) {
      const h = wide(64000 + i, LIB);
      const o = (await midnightRun(P, h)).map(x => x[0]);
      if (o[1] === o[2]) same++;
      else if (!first) { const a = JSON.parse(o[1]), b = JSON.parse(o[2]); const k = Object.keys(b).find(q => a[q] !== b[q]); first = { seed: 64000 + i, key: k, stale: String(a[k]).slice(0, 300), fresh: String(b[k]).slice(0, 300) }; }
      if (o[0] !== o[2]) turned++;
    }
    ok(same === N, `9. a page open from Sunday into Monday reads Monday as it is, with nothing changed since (${same} of ${N}; r63 kept Sunday's readings)`, first);
    ok(turned > N / 2, `9. (the case) Monday reads differently from Sunday (${turned} of ${N})`);
    // What the lifter sees: bench last done Sep 22, Stats drawn on Oct 20 (4 weeks) and again just after midnight (past
    // 4 weeks, a break) with nothing changed.
    const v = await P.page.evaluate(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.draft = null; s.settings.hidden = [];
      const mk = (id, date, w) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w, r: 8, rir: 2, warm: false, drop: false })) }] });
      s.sessions = [mk('a1', '2026-08-25', 80), mk('a2', '2026-09-01', 82.5), mk('a3', '2026-09-08', 85), mk('a4', '2026-09-15', 85), mk('a5', '2026-09-22', 87.5)];
      L.state = L.normalize(s); L.invalidate(); L.saveNow(); L.ui.tab = 'dash'; L.render();
      return true;
    });
    const read = () => P.page.evaluate(() => { const L = window.__ironlog; L.render(); return JSON.stringify([L.daysOff('bench'), L.coach(), L.stalledIds(), L.weekStats(), L.liftRead('bench'), document.getElementById('view').innerText]); });
    await P.page.clock.setFixedTime(new Date('2026-10-20T23:59:00'));
    await P.page.evaluate(() => window.__ironlog.invalidate());
    await read();
    await P.page.clock.setFixedTime(new Date('2026-10-21T00:01:00'));
    const stale = await read();
    await P.page.evaluate(() => window.__ironlog.invalidate());
    const fresh = await read();
    ok(v && stale === fresh, '9. Stats drawn just after midnight reads the new day as Stats drawn after a change does', (() => { let i = 0; while (i < stale.length && stale[i] === fresh[i]) i++; return { stale: stale.slice(Math.max(0, i - 60), i + 200), fresh: fresh.slice(Math.max(0, i - 60), i + 200) }; })());
  }

  // ---- 10. F2: a lifter in lb pastes notes with bench in kg, a row in lb and squat with no unit. r63 read the first
  // unit named as the whole note's: kg chosen and stated as known, squat 225 saved as 225 kg (about 496 lb), no warning.
  if (run(10)) {
    const P = await open(FILE, { browser, clock: '2026-10-25T10:00:00' }); pages.push(P);
    const imp = async (text, pick) => {
      await P.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.modal = null; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb'; s.sessions = []; s.draft = null; L.state = L.normalize(s); L.invalidate(); L.saveNow(); L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); });
      await P.page.waitForTimeout(150);
      await P.page.click('#view [data-act="impOpen"]'); await P.page.waitForTimeout(150);
      await P.page.fill('#impText', text);
      await P.page.click('#modal [data-act="impRead"]'); await P.page.waitForTimeout(300);
      const pv = await P.page.evaluate(() => { const m = window.__ironlog.ui.modal; return { unit: m && m.unit, unitKnown: m && m.unitKnown, text: document.getElementById('modal').innerText.replace(/\s+/g, ' ') }; });
      if (pick) { await P.page.click(`#modal [data-act="impUnit"][data-v="${pick}"]`); await P.page.waitForTimeout(150); }
      await P.page.click('#modal [data-act="impGo"]'); await P.page.waitForTimeout(400);
      const kg = await P.page.evaluate(() => { const L = window.__ironlog; const o = {}; for (const s of L.state.sessions) for (const b of s.ex) o[L.EX(b.exId).name] = b.sets.map(x => Math.round(x.w * 100) / 100); return o; });
      return { pv, kg };
    };
    const LB = 0.45359237;
    const a = await imp('Oct 20\nBench press 100kg x 5, 100kg x 5\nBarbell row 135lb x 8\nSquat 225 x 5, 225 x 5\n');
    ok(a.pv.unit === 'lb' && a.pv.unitKnown === false, '10. notes naming kg on one line, lb on another and no unit on a third start on the app\'s unit, lb, not stated as known (r63: kg, known)', a.pv);
    ok(/both kg and lb/i.test(a.pv.text), '10. the sheet says the notes name both units, so the lifter checks', a.pv.text.slice(0, 400));
    const sq = Object.keys(a.kg).find(k => /squat/i.test(k)), bp = Object.keys(a.kg).find(k => /bench/i.test(k)), rw = Object.keys(a.kg).find(k => /row/i.test(k));
    ok(rw && Math.abs(a.kg[rw][0] - Math.round(135 * LB * 100) / 100) < 0.01, '10. (a guard) the row, in lb on its line, is saved in lb', a.kg);
    ok(sq && Math.abs(a.kg[sq][0] - Math.round(225 * LB * 100) / 100) < 0.01 && bp && a.kg[bp][0] === 100, '10. saved as written: bench 100 kg, squat 225 lb (r63: squat 225 kg)', a.kg);
    // Guards: a note in kg alone still starts on kg and says so; one that names no unit asks as before.
    const k = await imp('Oct 20\nBench press 100kg x 5\nSquat 140 x 5\n');
    ok(k.pv.unit === 'kg' && k.pv.unitKnown === true && !/both kg and lb/i.test(k.pv.text), '10. (a guard) notes naming kg alone start on kg, known', k.pv);
    const n0 = await imp('Oct 20\nBench press 185 x 5\n');
    ok(n0.pv.unit === 'lb' && n0.pv.unitKnown === false && /does not say which/.test(n0.pv.text), '10. (a guard) notes naming no unit start on the app\'s and ask', n0.pv);
  }

  // ---- 11. 302: the ready-made routines rested most isolation lifts 45 or 60 s; Singer 2024 found a small benefit to growth
  // past 60 s and none detected past 90 s. V (2026-10-25): 90 s, easy to change.
  if (run(11)) {
    const read = async file => {
      const P = await open(file, { browser, clock: '2026-10-15T10:00:00' }); pages.push(P);
      return P.page.evaluate(() => {
        const L = window.__ironlog;
        const keys = L.TEMPLATES.filter(t => !t.hidden).map(t => t.key);
        // The minutes each routine's line says on the templates sheet.
        L.state.settings.onboarded = true; L.openModal({ kind: 'templates', from: 'plan' });
        const mins = Object.fromEntries([...document.querySelectorAll('#modal .tpl[data-k]')].map(b => [b.dataset.k, ((b.querySelector('.tpl-m') || {}).textContent || '').match(/(\d+)(?: to (\d+))? min/)]).map(([k, m]) => [k, m ? +(m[2] || m[1]) : null]));
        return { keys, made: keys.map(k => L.routineFromTemplate(k)), iso: Object.fromEntries(L.libExercises().map(e => [e.id, !L.isCompound(e)])), mins };
      });
    };
    const was = await read('baselines/r63.html'), now = await read(FILE);
    const items = R => R.days.flatMap(d => d.items);
    const rows = [];
    now.made.forEach((R, i) => items(R).forEach((it, j) => rows.push({ key: now.keys[i], exId: it.exId, iso: now.iso[it.exId], now: it.rest, was: items(was.made[i])[j] && items(was.made[i])[j].rest })));
    const isoShort = rows.filter(r => r.iso && r.now < 90);
    ok(rows.length > 100 && !isoShort.length, `11. every isolation lift in the ready-made routines rests 90 s or more (r63: ${rows.filter(r => r.iso && r.was < 90).length} under 90)`, isoShort.slice(0, 6));
    ok(rows.every(r => (r.iso && r.was < 90 ? r.now === 90 : r.now === r.was)), '11. each one under 90 s is raised to 90 s exactly; compound lifts and isolation lifts at 90 s or more keep their rest', rows.filter(r => !(r.iso && r.was < 90 ? r.now === 90 : r.now === r.was)).slice(0, 6));
    // The templates sheet says the longer days: no routine's minutes fall, and those whose rests rose say more in all.
    const raised = now.keys.filter(k => rows.some(r => r.key === k && r.now > r.was));
    const fell = now.keys.filter(k => !(now.mins[k] >= was.mins[k]));
    const sum = ks => ks.reduce((a, k) => a + (now.mins[k] || 0) - (was.mins[k] || 0), 0);
    ok(raised.length && !fell.length && sum(raised) > 0, `11. the templates sheet's minutes follow: none falls, and the routines whose rests rose say ${sum(raised)} minutes more in all`, { was: was.mins, now: now.mins });
    // Copies made before r64, untouched, still read as ready-made: Recently deleted leaves them out, and a first run replaces the starter.
    const P = await open(FILE, { browser, clock: '2026-10-15T10:00:00', realStarter: true }); pages.push(P);
    const c = await P.page.evaluate(old => {
      const L = window.__ironlog;
      const plain = old.map(R => L.plainTemplate(R));
      const ul4 = old[old.length - 1];
      const starter = L.starterSigs().includes(L.routineSig(ul4));
      // A phone's routine as r63 made it keeps its rests through a load (a migration never overwrites a value the lifter has).
      const s = L.state; s.routines = [JSON.parse(JSON.stringify(ul4))]; s.activeRoutineId = ul4.id; L.state = L.normalize(s);
      const kept = JSON.stringify(L.state.routines[0].days.map(d => d.items.map(it => it.rest))) === JSON.stringify(ul4.days.map(d => d.items.map(it => it.rest)));
      // One changed by the lifter is theirs, as before (a guard).
      const mine = JSON.parse(JSON.stringify(ul4)); mine.days[0].items[0].sets = 9;
      return { plain, starter, kept, mine: L.plainTemplate(mine) };
    }, [...was.made, was.made[now.keys.indexOf('ul4')]]);
    ok(c.plain.every(Boolean), '11. each ready-made routine as r63 made it, untouched, still reads as ready-made', c.plain);
    ok(c.starter, '11. r63\'s untouched starter, Upper / lower, is still the starter a first run replaces');
    ok(c.kept && !c.mine, '11. (a guard) a routine on a phone keeps its rests, and one the lifter changed is theirs', c);
  }

  const errors = pages.flatMap(P => P.errors);
  ok(!errors.length, 'no page errors', errors.slice(0, 4));
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
