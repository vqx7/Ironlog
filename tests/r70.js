// r70 (PENDING.md's tracker, rows NEW-51 and 379 to 384, 364 b-1, 364 b-2, 172 b and AUD-70), each written as
// what a lifter expects and run first on r69 (`node tests/r70.js baselines/r69.html`), where each section fails:
//   1  NEW-51: two blank sessions of one set in a row never turn a lift the routine plans at 3 sets into a
//      1-set lift; in Freestyle and for a lift on no day of the routine the lifter's own sets still lead (V's
//      rule of 2026-10-18), a plan of one set progresses, and one set on the routine's day reads fewer sets.
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
    // Bench planned at 3 sets: three sessions of 3 on the routine's day, then 225 x 8 alone in two blank sessions.
    await log([...base, ses('b1', D(3), 'bench', [[225, 8, 2]]), ses('b2', add(D(3), 3), 'bench', [[225, 8, 2]])]);
    const a = await read(3);
    ok(a.short[3] === 'sets' && a.short[4] === 'sets', '1. NEW-51: two blank one-set sessions of a lift planned at 3 sets both read fewer sets (r69: the second read full)', a.short);
    ok(Math.abs(lb(a.w) - 225) < 0.01 && /over 3 sets at 225 lb/.test(a.text) && !/in one set/.test(a.text), '1. NEW-51: the next target keeps the plan\'s 3 sets at 225 lb, never "Beat 8 reps in one set" (r69)', { lb: lb(a.w), text: a.text });
    // The same two sessions on the routine's day (339 h, r58): fewer sets, as before.
    await log([...base, ses('d1', D(3), 'bench', [[225, 8, 2]], { day: 1, ps: 3 }), ses('d2', add(D(3), 3), 'bench', [[225, 8, 2]], { day: 1, ps: 3 })]);
    const b = await read(3);
    ok(b.short[3] === 'sets' && b.short[4] === 'sets' && /over 3 sets at 225 lb/.test(b.text), '1. two one-set sessions on the routine\'s day read fewer sets, as since r58 (a guard)', b);
    // Freestyle (Today opens blank, the routine not followed): the second one-set session in a row is the usual (V, 2026-10-18).
    const fr = [0, 1, 2].map(i => ses('f' + i, D(i), 'bench', [[205 + 10 * i, 8, 2], [205 + 10 * i, 8, 2], [205 + 10 * i, 8, 2]]));
    await log([...fr, ses('f3', D(3), 'bench', [[225, 8, 2]]), ses('f4', add(D(3), 3), 'bench', [[225, 8, 2]])], { free: true });
    const c = await read(3);
    ok(c.short[3] === 'sets' && c.short[4] === 'full', '1. in Freestyle, the second one-set session in a row is the usual, as V\'s rule says (a guard)', c.short);
    // A lift on no day of the routine: the same.
    const other = { id: 'Rb', name: 'Legs', schedule: 'weekly', days: [{ id: 'Db', name: 'Legs', wd: [2], items: [{ uid: 'u1', exId: 'squat', ...plan(3), ss: null }] }] };
    await log([...fr, ses('f3', D(3), 'bench', [[225, 8, 2]]), ses('f4', add(D(3), 3), 'bench', [[225, 8, 2]])], { routine: other });
    const c2 = await read(3);
    ok(c2.short[3] === 'sets' && c2.short[4] === 'full', '1. a lift on no day of the routine: the second one-set session in a row is the usual (a guard)', c2.short);
    // A plan of one hard set, by design: each session full, the target in one set.
    await log([0, 1, 2].map(i => ses('o' + i, D(i), 'bench', [[205 + 10 * i, 8, 2]], { day: 1, ps: 1 })), { routine: routine(1) });
    const d = await read(1);
    ok(d.short.every(s => s === 'full') && /in one set at 225 lb/.test(d.text), '1. a plan of one set: every session full, the target in one set (a guard)', d);
    // One heavy set on a blank day after full sessions: a Weight PR, read fewer sets, the target from the last full session.
    await log([...base, ses('p1', D(3), 'bench', [[255, 4, 0]])]);
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
