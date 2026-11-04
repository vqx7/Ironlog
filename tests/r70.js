// r70 (PENDING.md's tracker, rows NEW-51 and 379 to 384, 364 b-1, 364 b-2, 172 b and AUD-70), each written as
// what a lifter expects and run first on r69 (`node tests/r70.js baselines/r69.html`), where each section fails:
//   1  NEW-51: Finish saves, with each lift of a blank session, the fewest sets the routine plans for it (none in
//      Freestyle), so two blank one-set sessions in a row never make a 3-set lift a 1-set one; each session is read
//      by what was saved with it, so a plan raised or Freestyle turned off later rereads nothing (R70-1, R70-2).
//   2  381: a new install shows Plan's Schedule (cycle or fixed weekdays); a phone whose layout hides it keeps it hidden.
//   3  382 (not built, so a guard): homeFolded, dashFolded and tidyV keep their place in the settings, since a phone on
//      r69 and one on r70 must order settings alike or they rewrite them back and forth (tests/mixed.js; 339 n).
//   4  364 b-2: Today's Lifts moving names the lifts Stats and the coach call rising, in their order, three at most,
//      each line built from the lift's own sessions (lighter ones out) and rising, each set the latest session's
//      heaviest; a tap opens the lift on Stats; no rising lift, no section and no chip; first on a phone's saved order.
//   5  364 b-1: the rest runs as a ring in the top bar, over the week bar and beside the account button, covering no
//      row and staying as the page scrolls; -15, +15 and Skip work; done, it is the full accent; the compact pill stays.
//   6  379: each lift on Today's Workout preview names its best: the set behind a compound lift's best estimate, else its
//      heaviest set, with its date, the same set and date Stats' All-time bests names for it.
//   7  380: Add an old best, from All-time bests: a date, the lift, its one set, Finish; saved as a past workout of one
//      set on that date, shown in All-time bests; as the lift's only history the next load starts from it, and with
//      recent sessions they lead.
//   8  172 b: a session card's muscle is one tap to the muscles worked on the body, its tap area 44 px.
//   9  AUD-70 (b) and (c): Settings > Layout lists every section a lifter can hide, each drawn on its tab when shown,
//      and every other section is a tab's core one; an old single set pasted into Import ("2024-03-01", "Bench 315x1")
//      is saved on its date and shown in All-time bests. On r69 (b) fails only for Lifts moving, new in r70; (c) passes.
//  10  384: a group of three (a tri-set) is one box and the rest starts only after a set of its third lift. A guard:
//      it passes on r69.
// R70_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R70_ONLY ? process.env.R70_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const LB = 0.45359237;
const lb = kg => Math.round((kg / LB) * 10) / 10;
const add = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const TODAY = '2026-11-03';
// A session of one lift: sets as [load lb, reps, RIR]; on the routine's day (with the plan's sets recorded, ps) or blank.
const ses = (id, date, exId, sets, o = {}) => Object.assign({ id, date, dayIdx: 0, dayId: o.day ? 'Db' : null, dayName: o.day ? 'Chest' : 'Session', routineId: o.day ? 'Rb' : '', free: !o.day, notes: '', ex: [{ exId, rr: [6, 10], sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir, warm: false, drop: false })), ...(o.ps ? { ps: o.ps } : {}) }] }, o.x || {});
const plan = n => ({ sets: n, repMin: 6, repMax: 10, rir: 2, rest: 150 });
const routine = n => ({ id: 'Rb', name: 'Chest', schedule: 'weekly', days: [{ id: 'Db', name: 'Chest', wd: [2], items: [{ uid: 'u1', exId: 'bench', ...plan(n), ss: null }] }] });

(async () => {
  const P = await open(FILE, { clock: TODAY + 'T10:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
  // The log replaced whole, read afresh; o.routine null for a lifter with no routine.
  const log = (sessions, o = {}) => ev(([sessions, R, free]) => {
    const L = window.__ironlog; const S = L.state;
    S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false; S.settings.todayStart = free ? 'free' : 'plan';
    S.injuries = []; S.draft = null; S.deloadWeek = null; S.bodyweights = [];
    S.routines = [R]; S.activeRoutineId = R.id;
    S.sessions = sessions; L.state = L.normalize(S); L.invalidate(); L.saveNow();
  }, [sessions, o.routine || routine(3), !!o.free]);
  // Each of bench's sessions as read (its sets and whether it was short), and the next target.
  const read = n => ev(pl => {
    const L = window.__ironlog; const xs = L.IDX().byEx.bench || [];
    const g = L.suggest('bench', pl, {});
    return { short: xs.map(x => x.short || 'full'), w: g.w, text: g.text };
  }, plan(n));
  const D = i => add('2026-10-06', i * 7);
  const three = (i, w) => ses('s' + i, D(i), 'bench', [[w, 8, 2], [w, 8, 2], [w, 8, 2]], { day: 1, ps: 3 });
  const base = [three(0, 205), three(1, 215), three(2, 225)];

  if (run(1)) {
    // (a) Finish, by taps, on a blank session: the fewest sets the routine in use plans for the lift is saved with it
    // (bench planned at 5 one day and 3 another: 3); in Freestyle nothing is saved, so the lifter's own sets lead.
    const two = { id: 'Rb', name: 'Two days', schedule: 'weekly', days: [{ id: 'Da', name: 'A', wd: [1], items: [{ uid: 'a1', exId: 'bench', ...plan(5), ss: null }] }, { id: 'Db', name: 'B', wd: [4], items: [{ uid: 'b1', exId: 'bench', ...plan(3), ss: null }] }] };
    const finishBlank = async free => {
      const F = await open(FILE, { clock: TODAY + 'T18:00:00' });
      const pg = F.page; const wait = ms => new Promise(r => setTimeout(r, ms));
      await pg.evaluate(([R, free]) => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false; S.settings.todayStart = free ? 'free' : 'plan'; S.routines = [R]; S.activeRoutineId = R.id; S.sessions = []; L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); }, [two, free]);
      if (free) await pg.click('#view [data-act="startFree"], #view .hero [data-act="startSession"]').catch(() => {});
      else { await pg.click('#view .hero [data-act="startAltOpen"]'); await wait(200); await pg.click('#modal [data-act="altGo"][data-go="startFree"]'); }
      await wait(300);
      if ((await pg.evaluate(() => { const m = window.__ironlog.ui.modal; return m && m.kind; })) !== 'picker') await pg.click('#view [data-act="pickSession"]');
      await wait(200); await pg.fill('#pickQ', 'bench press'); await wait(200); await pg.click('#modal [data-act="pickDo"][data-ex="bench"]'); await wait(300);
      await pg.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await wait(100);
      const sel = (f, k) => `#view input[data-f="${f}"][data-b="0"][data-s="${k}"]`;
      await pg.fill(sel('w', 0), '255'); await pg.dispatchEvent(sel('w', 0), 'change'); await pg.fill(sel('r', 0), '4'); await pg.dispatchEvent(sel('r', 0), 'change');
      await pg.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(250);
      await pg.click('#view .fin-row .btn.primary'); await wait(400);
      // Finish asks about the rows left; skipping them saves the one set.
      for (const a of ['skip', 'mOk']) { const b = await pg.$(`#modal [data-act="${a}"], #modal .btn.primary`); if (b) { await b.click(); await wait(300); break; } }
      const got = await pg.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions[L.state.sessions.length - 1]; return s ? { free: s.free, ex: s.ex.map(e => ({ exId: e.exId, n: e.sets.length, ps: e.ps === undefined ? null : e.ps })) } : null; });
      await pg.close();
      return got;
    };
    const fin = await finishBlank(false);
    ok(fin && fin.ex.length === 1 && fin.ex[0].ps === 3, '1. NEW-51: a blank session finished saves, with bench, the fewest sets the routine plans for it (5 one day, 3 another: 3) (r69: none)', fin);
    const finFree = await finishBlank(true);
    ok(finFree && finFree.ex.length === 1 && finFree.ex[0].ps === null, '1. in Freestyle (Today opens blank) nothing is saved, so the lifter\'s own sets lead (a guard)', finFree);

    // (b) Read as saved: bench planned at 3 sets, three sessions of 3 on its day, then 225 x 8 alone in two blank sessions saved with 3.
    await log([...base, ses('b1', D(3), 'bench', [[225, 8, 2]], { ps: 3 }), ses('b2', add(D(3), 3), 'bench', [[225, 8, 2]], { ps: 3 })]);
    const a = await read(3);
    ok(a.short[3] === 'sets' && a.short[4] === 'sets' && Math.abs(lb(a.w) - 225) < 0.01 && /over 3 sets at 225 lb/.test(a.text) && !/in one set/.test(a.text), '1. two blank one-set sessions saved with 3 read fewer sets, and the target keeps 3 sets at 225 lb, never "Beat 8 reps in one set"', a);

    // (c) The review of r70: each session read by what was saved with it, never by the plan or the mode as they are now.
    // R70-1: blank sessions saved with 3, the plan raised to 4 later: none read short, the target from the last (245).
    const rising = [ses('r0', D(0), 'bench', [[205, 8, 2], [205, 8, 2], [205, 8, 2], [205, 8, 2]], { ps: 3 }), ...[1, 2, 3, 4].map(k => ses('r' + k, add(D(0), 7 * k - 3), 'bench', [[205 + 10 * k, 8, 2], [205 + 10 * k, 8, 2], [205 + 10 * k, 8, 2]], { ps: 3 }))];
    await log(rising, { routine: routine(4) });
    const r1 = await read(4);
    ok(r1.short.slice(1).every(x => x === 'full') && Math.abs(lb(r1.w) - 245) < 0.01, '1. R70-1: blank sessions saved with 3, the plan raised to 4 later: none read short, the target stays at 245 lb', r1);
    // R70-2: Freestyle sessions (none saved), then Freestyle turned off: they still read their own sets.
    const fr = [ses('f0', D(0), 'bench', [[205, 8, 2], [205, 8, 2], [205, 8, 2]]), ...[1, 2, 3, 4].map(k => ses('f' + k, add(D(0), 7 * k - 3), 'bench', [[205 + 10 * k, 8, 2], [205 + 10 * k, 8, 2]]))];
    await log(fr, { free: true });
    const f1 = await read(3);
    await log(fr);
    const f2 = await read(3);
    ok(JSON.stringify(f1.short) === JSON.stringify(f2.short) && Math.abs(lb(f2.w) - lb(f1.w)) < 0.01 && Math.abs(lb(f2.w) - 245) < 0.01, '1. R70-2: Freestyle sessions read the same after Freestyle is turned off, the target at 245 lb', { f1, f2 });

    // (d) Guards: a plan of one set progresses; one PR attempt on a blank day is a Weight PR and keeps the target.
    await log([0, 1, 2].map(k => ses('o' + k, D(k), 'bench', [[205 + 10 * k, 8, 2]], { day: 1, ps: 1 })), { routine: routine(1) });
    const d = await read(1);
    ok(d.short.every(x => x === 'full') && /in one set at 225 lb/.test(d.text), '1. a plan of one set: every session full, the target in one set (a guard)', d);
    await log([...base, ses('p1', D(3), 'bench', [[255, 4, 0]], { ps: 3 })]);
    const e = await ev(() => { const L = window.__ironlog; const I = L.IDX(); return { prs: I.prs.filter(p => p.exId === 'bench' && p.sid === 'p1').map(p => p.type), short: (I.byEx.bench || []).map(x => x.short || 'full') }; });
    const et = await read(3);
    ok(e.prs.includes('Weight PR') && e.short[3] === 'sets' && /over 3 sets at 225 lb/.test(et.text), '1. one PR attempt on a blank day: a Weight PR, fewer sets, the target kept at 225 lb for 3 sets (a guard)', { e, text: et.text });
  }

  if (run(2)) {
    // A new install, as the first-run page leaves it, then Plan.
    const F = await open(FILE, { clock: TODAY + 'T10:00:00' });
    const fresh = await F.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'program'; L.render(); return { hidden: L.state.settings.hidden.slice(), shown: !!document.querySelector('#view [data-sk="program:schedule"]'), select: !!document.querySelector('#view [data-bind="rSchedule"]') }; });
    ok(!fresh.hidden.includes('program:schedule') && fresh.shown && fresh.select, '2. 381: a new install shows Plan\'s Schedule section, its cycle or fixed weekdays choice on the page (r69: hidden)', fresh);
    ok(['today:tiles', 'today:coach', 'today:body', 'program:pvol'].every(k => fresh.hidden.includes(k)), '2. the other four sections a new install hides stay hidden (a guard)', fresh.hidden);
    // R70-4, the review of r70: Layout's Default layout tip says what the button does now.
    const tip = await F.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); const b = document.querySelector('[data-act="layoutDefault"]'); return b ? b.getAttribute('data-tip') : null; });
    ok(!!tip && !/Schedule/.test(tip) && /Weekly volume hidden on Plan/.test(tip), '2. R70-4: the Default layout tip no longer says Schedule is hidden', tip);
    // A phone's own layout with Schedule hidden, saved and opened again: it stays hidden.
    const kept = await F.page.evaluate(() => { const L = window.__ironlog; const S = L.state; S.settings.hidden = ['program:schedule']; L.state = L.normalize(S); L.saveNow(); L.render(); return { hidden: L.state.settings.hidden.slice(), shown: !!document.querySelector('#view [data-sk="program:schedule"]') }; });
    ok(kept.hidden.includes('program:schedule') && !kept.shown, '2. a phone whose layout hides Schedule keeps it hidden (a guard)', kept);
    await F.page.close();
  }

  if (run(3)) {
    const r = await ev(() => { const keys = Object.keys(window.__ironlog.normalize({}).settings); return { at: ['homeFolded', 'dashFolded', 'tidyV'].map(k => keys.indexOf(k)) }; });
    ok(r.at.every(x => x >= 0), '3. 382 not built: a new log still writes homeFolded, dashFolded and tidyV in their places, so two builds order settings alike (a guard)', r);
  }

  if (run(4)) {
    // The demo log, as a lifter's own, at 390 px.
    const T = await open(FILE, { clock: TODAY + 'T18:00:00' });
    const pg = T.page;
    const r = await pg.evaluate(() => {
      const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; L.makeDemo();
      for (const x of L.state.sessions) delete x.demo; L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
      const sec = document.querySelector('#view [data-sk="today:moving"]');
      if (!sec) return { sec: false };
      sec.open = true; L.render();
      const rows = [...document.querySelectorAll('#view [data-sk="today:moving"] .mvrow')].map(b => ({ id: b.dataset.ex, name: b.querySelector('.mvname').textContent, set: b.querySelector('.mvset').textContent, pts: b.querySelector('polyline') ? b.querySelector('polyline').getAttribute('points').split(' ').map(p => +p.split(',')[1]) : [] }));
      const mv = L.movers().map(x => x.id);
      // Each lift's latest heaviest set, read from the log itself.
      const latest = id => { const ss = L.state.sessions.filter(s => s.ex.some(e => e.exId === id)).sort((a, b) => (a.date < b.date ? -1 : 1)); const last = ss[ss.length - 1]; const sets = last.ex.filter(e => e.exId === id).flatMap(e => e.sets).filter(z => !z.warm && +z.r > 0); const t = sets.reduce((a, z) => (!a || z.w > a.w || (z.w === a.w && +z.r > +a.r) ? z : a), null); return t; };
      const want = rows.map(x => { const t = latest(x.id); return t ? { w: t.w, r: +t.r } : null; });
      const sub = sec.querySelector('.sec-s').textContent;
      const hidden = L.state.settings.hidden.includes('today:moving');
      return { sec: true, rows, mv, want, sub, first: document.querySelector('#view details.sec').dataset.sk, hidden, wide: document.documentElement.scrollWidth };
    });
    ok(r.sec && r.rows.length === Math.min(3, r.mv.length) && r.rows.every((x, i) => x.id === r.mv[i]), '4. 364 b-2: Today shows Lifts moving, the lifts Stats\'s summary and the coach call rising, in their order, three at most (r69: no section)', r);
    if (r.sec) {
      ok(new RegExp(`^${r.mv.length} rising`).test(r.sub), '4. its subtitle counts every rising lift', r.sub);
      ok(r.rows.every(x => x.pts.length >= 2 && x.pts[x.pts.length - 1] < x.pts[0]), '4. each line has its sessions and ends higher than it starts (y falls as the reading rises)', r.rows.map(x => x.pts));
      // The set as the app writes a set (setShort through the hook), against the log's own latest heaviest set.
      const sets = await pg.evaluate(w => { const L = window.__ironlog; return w.map((t, i) => { const id = [...document.querySelectorAll('#view .mvrow')][i].dataset.ex; return { shown: document.querySelectorAll('#view .mvrow')[i].querySelector('.mvset').textContent, want: t ? L.setShortOf(id, t.w, t.r) : null }; }); }, r.want);
      ok(sets.every(x => x.want && x.shown === x.want), '4. each set is the latest session\'s heaviest working set, read from the log', sets);
      ok(r.first === 'today:moving' && !r.hidden && r.wide <= 390, '4. first on Today, not hidden, no sideways scroll at 390 px', r);
      // Opened as a thumb opens it, by its title; then a tap on a lift opens it on Stats.
      await pg.click('#view [data-sk="today:moving"] summary'); await pg.waitForSelector('#view .mvrow', { state: 'visible' });
      await pg.click('#view .mvrow');
      const st = await pg.evaluate(() => ({ tab: window.__ironlog.ui.tab, ex: window.__ironlog.ui.dashEx }));
      ok(st.tab === 'dash' && st.ex === r.rows[0].id, '4. a tap opens that lift on Stats > Lifts', st);
      // A phone's own saved order from before r70: the new section comes first.
      const kept = await pg.evaluate(() => { const L = window.__ironlog; L.state.settings.secOrder.today = ['map', 'session', 'week', 'injuries', 'coach', 'tiles', 'body']; L.ui.tab = 'today'; L.render(); return document.querySelector('#view details.sec').dataset.sk; });
      ok(kept === 'today:moving', '4. on a phone with its own saved order, Lifts moving comes first', kept);
      // At 320 px, light: no sideways scroll.
      await pg.setViewportSize({ width: 320, height: 700 });
      const w320 = await pg.evaluate(() => { const L = window.__ironlog; L.state.settings.theme = 'light'; L.render(); return document.documentElement.scrollWidth; });
      ok(w320 <= 320, '4. no sideways scroll at 320 px', w320);
    }
    // R70-3, the review of r70: a lift on a heavy day (3-5) and a light day (8-12), both rising. Its line is the trend's own
    // readings (one range, the trend's weeks), so it rises and has as many points as the trend reads; r70 first drew every
    // session in the weeks, both ranges, a zigzag ending lower than it began.
    const two = await open(FILE, { clock: TODAY + 'T18:00:00' });
    const tw = await two.page.evaluate(([T]) => {
      const add = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
      const ses = (id, date, rr, w, r) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId: 'backSquat', rr, sets: [0, 1, 2].map(() => ({ w, r, rir: 2, warm: false, drop: false })) }] });
      const S = [];
      for (let i = 0; i < 5; i++) { S.push(ses('h' + i, add(T, -35 + 7 * i), [3, 5], 140 + 2.5 * i, 5)); S.push(ses('l' + i, add(T, -32 + 7 * i), [8, 12], 100 + 2.5 * i, 10)); }
      const L = window.__ironlog; const St = L.state; St.settings.onboarded = true; St.settings.unit = 'kg'; St.sessions = S; L.state = L.normalize(St); L.invalidate(); L.saveNow();
      L.ui.tab = 'today'; L.ui.folds['today:moving'] = true; L.render();
      const row = document.querySelector('#view .mvrow[data-ex="backSquat"]');
      const ys = row && row.querySelector('polyline') ? row.querySelector('polyline').getAttribute('points').split(' ').map(q => +q.split(',')[1]) : null;
      return { moving: L.movers().some(m => m.id === 'backSquat'), ys, wN: L.IDX().exStats.backSquat.wN };
    }, [TODAY]);
    ok(tw.moving && tw.ys && tw.ys.length === tw.wN && tw.ys.every((y, k) => k === 0 || y <= tw.ys[k - 1] + 0.01) && tw.ys[tw.ys.length - 1] < tw.ys[0], '4. R70-3: a lift rising on a heavy and a light day draws its trend\'s own sessions, one range, rising, as many points as the trend reads', tw);
    await two.page.close();
    // A new log: nothing rising, so no section and no chip.
    const N = await open(FILE, { clock: TODAY + 'T18:00:00' });
    const none = await N.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render(); return { sec: !!document.querySelector('#view [data-sk="today:moving"]'), chip: [...document.querySelectorAll('#view .tabfoot button, #view [data-act="secShow"]')].some(b => /Lifts moving/.test(b.textContent)) }; });
    ok(!none.sec && !none.chip, '4. a new log, nothing rising: no Lifts moving and no chip for it (a guard)', none);
    await N.page.close(); await pg.close();
  }

  if (run(5)) {
    const T = await open(FILE, { clock: TODAY + 'T18:00:00' });
    const pg = T.page;
    await pg.evaluate(() => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; L.makeDemo(); for (const x of L.state.sessions) delete x.demo; L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); });
    await pg.click('#view .hero [data-act="startSession"]:not([data-light])'); await pg.waitForSelector('#view .cbtn');
    await pg.click('#view .cbtn'); await pg.waitForSelector('#timer:not([hidden])');
    const where = () => pg.evaluate(() => {
      const t = document.getElementById('timer').getBoundingClientRect(), top = document.querySelector('.top').getBoundingClientRect(), wk = document.getElementById('wkbar').getBoundingClientRect();
      const ss = document.getElementById('saveState').getBoundingClientRect();
      const hit = document.elementFromPoint(ss.left + ss.width / 2, ss.top + ss.height / 2);
      const ring = document.querySelector('#timer [data-t="p"]');
      return { tTop: t.top, tBottom: t.bottom, headBottom: top.bottom, coversWk: t.left <= wk.left + 1 && t.right >= wk.left + wk.width * 0.6, acct: !!hit && !!hit.closest('#saveState'), dash: ring ? ring.getAttribute('stroke-dasharray') : null, tp: +document.getElementById('timer').style.getPropertyValue('--tp'), time: document.querySelector('#timer [data-t="v"]').textContent };
    });
    const a = await where();
    ok(a.tTop <= 1 && a.tBottom <= a.headBottom + 1 && a.coversWk, '5. 364 b-1: the rest runs in the top bar, over the week bar, not across the screen\'s foot (r69: a bar at the bottom)', a);
    ok(a.acct, '5. the account button beside it still takes a tap', a);
    ok(!!a.dash && Math.abs(parseFloat(a.dash) - a.tp * 100) < 1.5, '5. the ring shows the share of the rest left', a);
    await pg.evaluate(() => window.scrollTo(0, 700)); await new Promise(r => setTimeout(r, 200));
    const b = await where();
    ok(b.tTop <= 1 && b.tBottom <= b.headBottom + 1, '5. it stays in the top bar as the page scrolls', b);
    const secs = t => { const [m, s2] = t.split(':').map(Number); return m * 60 + s2; };
    const t0 = secs(b.time);
    await pg.click('#timer [data-act="tSub"]'); await new Promise(r => setTimeout(r, 300));
    const t1 = secs((await where()).time);
    await pg.click('#timer [data-act="tAdd"]'); await new Promise(r => setTimeout(r, 300));
    const t2 = secs((await where()).time);
    ok(t0 - t1 >= 14 && t0 - t1 <= 16 && t2 - t1 >= 14 && t2 - t1 <= 16, '5. -15 takes 15 seconds off and +15 puts 15 back', { t0, t1, t2 });
    await pg.evaluate(() => { window.__ironlog.timer.end = Date.now(); }); await new Promise(r => setTimeout(r, 600));
    const d = await pg.evaluate(() => { const t = document.getElementById('timer'); return { done: t.classList.contains('done'), word: t.querySelector('[data-t="l"]').textContent }; });
    ok(d.done && d.word === 'Rest done', '5. at the end it reads Rest done, in the full accent', d);
    await pg.click('#timer [data-act="tStop"]');
    ok(await pg.evaluate(() => document.getElementById('timer').hidden), '5. Skip ends the rest and the week bar shows again', null);
    // The compact pill, chosen in Settings: still in the corner above the tabs (a guard).
    await pg.evaluate(() => { window.__ironlog.state.settings.timerCompact = true; });
    await pg.click('#view .cbtn:not(.on)'); await pg.waitForSelector('#timer:not([hidden])');
    const c = await pg.evaluate(() => { const t = document.getElementById('timer').getBoundingClientRect(); return { compact: document.getElementById('timer').classList.contains('compact'), bottomGap: innerHeight - t.bottom, right: innerWidth - t.right }; });
    ok(c.compact && c.bottomGap > 50 && c.right < 20, '5. the compact pill stays in the corner above the tabs (a guard)', c);
    await pg.close();
  }

  if (run(6)) {
    const T = await open(FILE, { clock: TODAY + 'T18:00:00' });
    const pg = T.page;
    const r = await pg.evaluate(() => {
      const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; L.makeDemo(); for (const x of L.state.sessions) delete x.demo; L.invalidate(); L.saveNow();
      L.ui.tab = 'today'; L.ui.folds['today:session'] = true; L.render();
      const rows = [...document.querySelectorAll('#view [data-sk="today:session"] .pvi')].map(e => ({ name: e.querySelector('b').textContent, best: (e.querySelector('.pvbest') || { textContent: '' }).textContent }));
      // The board, every lift shown and open.
      L.ui.tab = 'dash'; L.ui.bestsAll = true; L.render();
      const board = {}; document.querySelectorAll('#view .bests .bx').forEach(b => { const name = b.querySelector('.bn').textContent; const from = b.querySelector('p'); board[name] = { s: b.querySelector('.bs').textContent, from: from ? from.textContent : '' }; });
      return { rows, board };
    });
    const fmt = x => x.replace(/\s+/g, ' ').trim();
    const agree = r.rows.map(x => {
      const b = r.board[x.name]; if (!b) return { ...x, board: null, ok: false };
      const m = x.best.match(/^(Best|Heaviest) (.+), (\w{3} \d{1,2}(?:, \d{4})?)$/);
      if (!m) return { ...x, board: b, ok: false };
      const okBest = m[1] === 'Best' ? fmt(b.from) === `Best estimate from ${m[2]}.` && new RegExp(`best est [^·]*, ${m[3]}`).test(b.s) : b.s.includes(`heaviest ${m[2]}, ${m[3]}`);
      return { ...x, board: b, ok: okBest };
    });
    ok(r.rows.length > 0 && agree.every(x => x.ok), '6. 379: each lift on the Workout preview names its best set and date, the same as Stats\' All-time bests (r69: none)', agree.filter(x => !x.ok).slice(0, 3));
    ok(agree.some(x => /^Best /.test(x.best)) && agree.some(x => /^Heaviest /.test(x.best)), '6. compound lifts name the set behind the best estimate, other lifts their heaviest set', agree.map(x => x.best));
    await pg.close();
  }

  if (run(7)) {
    const T = await open(FILE, { clock: TODAY + 'T18:00:00' });
    const pg = T.page;
    const wait = ms => new Promise(r => setTimeout(r, ms));
    // A lifter with a few sessions of other lifts, on Stats with every section open.
    await pg.evaluate(() => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb'; L.makeDemo(); for (const x of L.state.sessions) delete x.demo; L.state.sessions = L.state.sessions.filter(x => !x.ex.some(e => e.exId === 'bench')); L.invalidate(); L.saveNow(); L.ui.tab = 'dash'; L.render(); for (let k = 0; k < 2; k++) { document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render(); } });
    const btn = await pg.$('#view [data-act="oldBestOpen"]');
    ok(!!btn, '7. 380: All-time bests offers Add an old best (r69: none)', null);
    if (btn) {
      await pg.evaluate(() => document.querySelector('#view [data-act="oldBestOpen"]').click()); await wait(200);
      const h = await pg.evaluate(() => (document.getElementById('pastH') || { textContent: '' }).textContent);
      await pg.fill('#modal input[data-pbind="date"]', '2024-03-01'); await pg.dispatchEvent('#modal input[data-pbind="date"]', 'change'); await wait(150);
      await pg.click('#modal [data-act="pastGo"]'); await wait(300);
      const pk = await pg.evaluate(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'picker' ? m.title : null; });
      await pg.click('#modal [data-act="pickDo"][data-ex="bench"]'); await wait(300);
      const dr = await pg.evaluate(() => { const d = window.__ironlog.state.draft; return d ? { past: d.past, date: d.date, ex: d.ex.map(b => [b.exId, b.sets.length]) } : null; });
      ok(h === 'Add an old best' && pk === 'The lift of your old best' && dr && dr.past && dr.date === '2024-03-01' && JSON.stringify(dr.ex) === JSON.stringify([['bench', 1]]), '7. the sheet takes the date, the picker the lift, and a past workout of that date opens with the lift and one set', { h, pk, dr });
      await pg.fill('#view input[data-f="w"][data-b="0"][data-s="0"]', '315'); await pg.dispatchEvent('#view input[data-f="w"][data-b="0"][data-s="0"]', 'change');
      await pg.fill('#view input[data-f="r"][data-b="0"][data-s="0"]', '1'); await pg.dispatchEvent('#view input[data-f="r"][data-b="0"][data-s="0"]', 'change'); await wait(150);
      await pg.click('#view .fin-row .btn.primary'); await wait(500);
      const saved = await pg.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.date === '2024-03-01'); const b = L.allTimeBests('bench'); return { s: s ? s.ex.map(e => [e.exId, e.sets.map(z => [Math.round(z.w / 0.45359237), z.r])]) : null, draft: !!L.state.draft, best: b && b.heavy ? [Math.round(b.heavy.p.w / 0.45359237), b.heavy.p.r, b.heavy.date] : null }; });
      ok(saved.s && JSON.stringify(saved.s) === JSON.stringify([['bench', [[315, 1]]]]) && !saved.draft && JSON.stringify(saved.best) === JSON.stringify([315, 1, '2024-03-01']), '7. Finish saves one set of 315 x 1 on Mar 1, 2024, and All-time bests shows it', saved);
      // As the lift's only history, the next load starts from it (the return after a break); with recent sessions, they lead.
      const g = await pg.evaluate(() => { const L = window.__ironlog; const r = L.suggest('bench', { sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 150 }, {}); return { w: Math.round(r.w / 0.45359237), text: r.text }; });
      ok(/Back after \d+ weeks/.test(g.text) && g.w < 315 && g.w > 135, '7. as the only history, the next load is a return from it, lighter than 315 (V, r48)', g);
    }
    await pg.close();
  }

  if (run(8)) {
    const T = await open(FILE, { clock: TODAY + 'T18:00:00' });
    const pg = T.page;
    await pg.evaluate(() => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; L.makeDemo(); for (const x of L.state.sessions) delete x.demo; L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); });
    await pg.click('#view .hero [data-act="startSession"]:not([data-light])'); await pg.waitForSelector('#view .block');
    const b = await pg.$('#view .block .bmus');
    ok(!!b, '8. 172 b: a session card\'s muscle is a button (r69: words only)', null);
    if (b) {
      const tap = await pg.evaluate(() => { const e = document.querySelector('#view .block .bmus'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const at = dy => { const h = document.elementFromPoint(x, y + dy); return !!h && !!h.closest('.bmus'); }; return { up: at(-20), down: at(20) }; });
      ok(tap.up && tap.down, '8. its tap area reaches 44 px, as every small control\'s does', tap);
      await pg.click('#view .block .bmus'); await new Promise(r => setTimeout(r, 300));
      const m = await pg.evaluate(() => { const L = window.__ironlog; const m = L.ui.modal; return { kind: m && m.kind, ex: m && m.exId, first: L.state.draft.ex[0].exId, h: (document.getElementById('exMusH') || { textContent: '' }).textContent, figs: document.querySelectorAll('#modal .bm-wrap figure').length, main: document.querySelectorAll('#modal .ex-main').length }; });
      ok(m.kind === 'exMus' && m.ex === m.first && /^Muscles: /.test(m.h) && m.figs === 2 && m.main > 0, '8. the tap opens that lift\'s muscles on the body, front and back, its main muscle marked', m);
    }
    await pg.close();
  }

  if (run(9)) {
    const T = await open(FILE, { clock: TODAY + 'T18:00:00' });
    const pg = T.page;
    const r = await pg.evaluate(() => {
      const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; L.makeDemo(); for (const x of L.state.sessions) delete x.demo;
      L.state.settings.hidden = []; L.invalidate(); L.saveNow();
      L.ui.tab = 'settings'; L.render(); for (let k = 0; k < 2; k++) { document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render(); }
      const listed = [...document.querySelectorAll('#view [data-act="hideToggle"]')].map(b => b.dataset.k);
      const drawn = new Set(); const gripped = [];
      for (const t of ['today', 'program', 'dash', 'history', 'settings']) { L.ui.tab = t; L.render(); document.querySelectorAll('#view [data-sk]').forEach(e => { drawn.add(e.dataset.sk); if (e.querySelector(':scope > summary > .sgrip')) gripped.push(e.dataset.sk); }); }
      return { listed, drawn: [...drawn], gripped };
    });
    // Sections drawn only when there is something in them (an injury, cardio, something deleted).
    const onlyWithContent = ['today:injuries', 'history:cardio', 'history:trash'];
    // Each tab's core sections, never hidden by design: the routine and its days, the sessions, and Settings' own.
    const core = ['program:routine', 'program:days', 'history:sessions', 'settings:profile', 'settings:general', 'settings:gym', 'settings:layout', 'settings:data', 'settings:help'];
    const missingDrawn = r.listed.filter(k => !r.drawn.includes(k) && !onlyWithContent.includes(k));
    const unlisted = r.gripped.filter(k => !r.listed.includes(k) && !core.includes(k));
    ok(r.listed.length > 0 && !missingDrawn.length && !unlisted.length && r.listed.includes('today:moving'), '9. AUD-70 (b): Layout lists every section a lifter can hide, each drawn on its tab, Lifts moving among them; every other section is a core one', { missingDrawn, unlisted, listed: r.listed });
    // (c) An old single set through Import.
    await pg.evaluate(() => { const L = window.__ironlog; L.state.sessions = L.state.sessions.filter(x => !x.ex.some(e => e.exId === 'bench')); L.state.settings.unit = 'lb'; L.invalidate(); L.saveNow(); L.ACT.impOpen(); });
    await pg.waitForSelector('#impText');
    await pg.fill('#impText', '2024-03-01\nBench press 315x1'); await pg.click('[data-act="impRead"]'); await new Promise(r2 => setTimeout(r2, 300));
    const unit = await pg.$('[data-act="impUnit"][data-v="lb"]'); if (unit) { await unit.click(); await new Promise(r2 => setTimeout(r2, 80)); }
    await pg.click('[data-act="impGo"]'); await new Promise(r2 => setTimeout(r2, 400));
    const got = await pg.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.date === '2024-03-01'); const b = s ? L.allTimeBests(s.ex[0].exId) : null; return { s: s ? s.ex.map(e => [e.exId, e.sets.map(z => [Math.round(z.w / 0.45359237), z.r])]) : null, best: b && b.heavy ? [Math.round(b.heavy.p.w / 0.45359237), b.heavy.p.r, b.heavy.date] : null }; });
    ok(got.s && got.s.length === 1 && JSON.stringify(got.s[0][1]) === '[[315,1]]' && JSON.stringify(got.best) === JSON.stringify([315, 1, '2024-03-01']), '9. AUD-70 (c): "2024-03-01" then "Bench press 315x1" pasted into Import saves that one set on its date, and All-time bests shows it', got);
    await pg.close();
  }

  if (run(10)) {
    const T = await open(FILE, { clock: TODAY + 'T18:00:00' });
    const pg = T.page;
    // A blank session of three lifts linked as one group, each with three sets.
    const r = await pg.evaluate(() => {
      const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.autoDone = false; S.settings.timerMode = 'auto'; L.invalidate(); L.saveNow();
      L.ACT.startSession({ dataset: { day: '0' } }); return !!L.state.draft;
    });
    const tri = await pg.evaluate(() => {
      const L = window.__ironlog; const d = L.state.draft;
      const mk = id => ({ ...L.newBlock(id, { sets: 3, repMin: 8, repMax: 12, rir: 2, rest: 90, ss: 'g1' }, {}) });
      d.ex = ['bench', 'cableRow', 'dbLateral'].map(mk).filter(b => b && b.exId);
      d.ex.forEach(b => { b.plan.ss = 'g1'; });
      L.ui.tab = 'today'; L.render();
      return { n: d.ex.length, letters: [...document.querySelectorAll('#view .block')].map(e => (e.querySelector('.ssl, .tag') || { textContent: '' }).textContent).slice(0, 3), box: document.querySelectorAll('#view .ssh').length };
    });
    const timerOn = () => pg.evaluate(() => !document.getElementById('timer').hidden);
    const tick = async (b, sI) => { await pg.fill(`#view input[data-f="w"][data-b="${b}"][data-s="${sI}"]`, '50'); await pg.dispatchEvent(`#view input[data-f="w"][data-b="${b}"][data-s="${sI}"]`, 'change'); await pg.fill(`#view input[data-f="r"][data-b="${b}"][data-s="${sI}"]`, '10'); await pg.dispatchEvent(`#view input[data-f="r"][data-b="${b}"][data-s="${sI}"]`, 'change'); await pg.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${sI}"]`); await new Promise(r2 => setTimeout(r2, 250)); };
    let seq = null;
    if (r && tri.n === 3) {
      await tick(0, 0); const a1 = await timerOn();
      await tick(1, 0); const a2 = await timerOn();
      await tick(2, 0); const a3 = await timerOn();
      seq = { a1, a2, a3 };
    }
    ok(tri.n === 3 && tri.box >= 1 && seq && !seq.a1 && !seq.a2 && seq.a3, '10. 384: a group of three lifts is one box, and the rest starts only after its third lift\'s set (a guard)', { tri, seq });
    await pg.close();
  }

  await P.page.close();
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
