// r34.2: the fixes from the independent review of r34.1 (three reviewers,
// 2026-10-11), each checked the way the reviewer met it, plus a scan of all
// copy for wording V ruled out (shared phones, someone else, em dashes).
// Runs on the source and again on dist/ (tests/run.js); the first-page fit
// runs once, on the built app with the stand-in Supabase.
const { open, cspFix } = require('./h');
const fs = require('fs'); const path = require('path'); const os = require('os');
const { execFileSync } = require('child_process');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = 'index.html';
const LB = 0.45359237;
// Wording V ruled out (2026-10-10): an account reads like any normal app's.
const ODD = /shared (phone|device|computer)|someone else|another person|other people|anyone else|whoever shared|not your (phone|device)|public (computer|device)|second person|other users/i;

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();

  // ---------- 1. The engine, with hand-worked numbers ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-11T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    // Seed sessions in lb: each is [date, exId, [[w, r, rir], ...], range].
    const seed = (o) => ev(o => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state;
      s.settings.onboarded = true; s.settings.unit = o.kg ? 'kg' : 'lb'; delete s.settings.gym; delete s.settings.rirScale; s.settings.restWeeks = o.rest || [];
      if (o.gym) s.settings.gym = o.gym;
      s.injuries = []; s.bodyweights = (o.bw || []).map(([date, w], i) => ({ id: 'bw' + i, date, kg: w * LB }));
      s.sessions = o.ss.map(([date, exId, sets, rr, extra], i) => ({ id: 's' + i, date, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ...(extra || {}), ex: [{ exId, rr: rr || null, sets: sets.map(([w, r, rir]) => ({ w: o.kg ? w : w * LB, r, rir: rir == null ? null : rir, done: true })) }] }));
      s.draft = null; L.state = L.normalize(s); L.invalidate(); return true;
    }, o);
    const sug = (exId, plan) => ev(([exId, plan]) => { const L = window.__ironlog; const LB = 0.45359237; const p = { ...plan, inc: plan.inc == null ? 5 * LB : plan.inc }; const r = L.suggest(exId, p); return { w: r.w == null ? null : Math.round(r.w / LB * 100) / 100, text: r.text || '', target: r.target || '', lastR: r.lastR, back: r.back }; }, [exId, plan]);
    const bench = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120 };

    // 1a. Back after more than 4 weeks off a lift (Bosquet 2013): about 90% of the last working load, in whole steps, full sets.
    const old = [['2026-08-20', 'bench', [[180, 8, 1], [180, 8, 1], [180, 7, 1]], [6, 10]], ['2026-08-27', 'bench', [[185, 8, 1], [185, 7, 1], [185, 7, 1]], [6, 10]], ['2026-09-03', 'bench', [[185, 9, 1], [185, 8, 1], [185, 8, 1]], [6, 10]]];
    await seed({ ss: old });
    let r = await sug('bench', bench);
    // 185 x 0.9 = 166.5; the whole 5 lb step under it from 185 is 165.
    ok(r.w === 165 && /Back after 5 weeks: about 165 lb/.test(r.text) && /2 or more reps in reserve/.test(r.text) && r.lastR.length === 3 && r.lastR.every(x => x === 6), '38 days off bench: "Back after 5 weeks", 165 lb (90% of 185 is 166.5, down to the step), the usual 3 sets at the bottom of the range', r);
    ok(!/Half the usual sets|nothing to beat/.test(r.text), 'the first session back keeps its sets, unlike a lighter day', r.text);
    await seed({ ss: old.map(([d, ...x], i) => [['2026-09-20', '2026-09-27', '2026-10-04'][i], ...x]) });
    r = await sug('bench', bench);
    ok(!/Back after/.test(r.text) && r.w >= 185, '7 days off: no break, the usual target (185 or more)', r);
    ok(await ev(() => window.__ironlog.BACK_DAYS === 28), 'the break is more than 28 days (4 weeks)');

    // 1b. Push-ups never done with added load progress by reps, never to BW+10.
    await seed({ ss: [['2026-09-27', 'pushup', [[0, 20, 1], [0, 20, 1], [0, 20, 1]], [10, 20]], ['2026-10-04', 'pushup', [[0, 20, 1], [0, 20, 1], [0, 20, 1]], [10, 20]]], bw: [['2026-09-20', 180]] });
    r = await sug('pushup', { sets: 3, repMin: 10, repMax: 20, rir: 1, rest: 90 });
    ok(r.w === 0 && !/BW\s*\+|\+\s*\d+ lb/.test(r.text + r.target), 'push-ups at bodyweight for every set at the top: still bodyweight, no added load asked for', r);
    ok(await ev(() => { const L = window.__ironlog; return L.bwNoLoad(L.EX('pushup'), null) === true && L.bwNoLoad(L.EX('bench'), null) === false; }), 'bwNoLoad: true for a bodyweight lift never loaded, false for a loaded lift');

    // 1c. Every set at 5 or more in reserve: at least one real step, even where the cap would hold it.
    await seed({ ss: [['2026-10-04', 'dbCurl', [[20, 12, 5], [20, 12, 5], [20, 12, 5]], [8, 12]]] });
    r = await sug('dbCurl', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 60 });
    ok(r.w === 25, '20 lb curls x 12 at 5+ in reserve every set: 25 lb next time (one 5 lb step, 25%, past the 15% cap because 5 RIR is only a floor)', r);

    // 1d. A dumbbell typed in the other unit is that bell: 35 lb is the 16 kg dumbbell, so the next step is 18 kg, not 0.3 lb.
    await seed({ ss: [], gym: { u: 'kg', db: { lo: 2, hi: 40, st: 2 } } });
    const step = await ev(() => { const L = window.__ironlog; const LB = 0.45359237; const ex = L.EX('dbRow'); const plan = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90 }; const at = 35 * LB; return { inc: L.incOf(ex, plan, at), tol: L.rackTol(L.gymRack(ex, plan), at) }; });
    ok(Math.abs(step.inc - (18 - 35 * LB)) < 0.01, '35 lb (15.88 kg) on a 2 kg rack steps to the 18 kg bell (+2.12 kg), not a 0.12 kg "step" to the same bell', step);

    // 1e. Plates in the gym's unit: a kg gym with the app in lb gets one 20 kg plate a side for 60 kg.
    await seed({ ss: [], gym: { u: 'kg', plates: [25, 20, 15, 10, 5, 2.5] } });
    const pl = await ev(() => { const L = window.__ironlog; const ex = L.EX('bench'); return L.plateText(60, L.platesMode(ex), ex); });
    ok(/20 kg/.test(pl) && !/not loadable/.test(pl) && !/35|2\.5,|1\.14/.test(pl), 'a kg gym, app in lb, 60 kg on the bar: "20 kg" a side, no lb plates, no "not loadable"', pl);

    // 1f. "Over your first 3 sets" only when the plan has more sets than that.
    const os1 = await ev(() => { const L = window.__ironlog; return [L.overSets(3, { sets: 3 }), L.overSets(3, { sets: 4 }), L.overSets(1, { sets: 3 }), L.overSets(2, { sets: 2 }, 'hold')]; });
    ok(os1[0] === 'over 3 sets' && os1[1] === 'over your first 3 sets' && os1[2] === 'in one set' && os1[3] === 'over 2 holds', 'overSets: "over 3 sets" when 3 is all there are, "your first 3" only with a 4th', os1);

    // 1g. PRs: a weaker set at a heavier load is not a PR; a band's best is named as that, not as the best estimate.
    await seed({ ss: [['2026-10-01', 'bench', [[75, 15, 0]], [8, 15]], ['2026-10-08', 'bench', [[80, 10, 0]], [8, 15]]] });
    const pr = await ev(() => { const L = window.__ironlog; return { big: L.prsWithin(30).filter(p => p.date === '2026-10-08').map(p => p.type), names: [L.prName({ value: 30, prevAll: 31, bb: 2 }), L.prName({ value: 32, prevAll: 31, bb: 2 }), L.prName({ value: 30, prevAll: null, bb: 1 })] }; });
    // 80 x 10 is about 107 by the estimate; 75 x 15 about 112: weaker, so nothing to announce.
    ok(pr.big.length === 0, '80 x 10 after 75 x 15 (weaker by the estimate) is not a PR in Recent PRs', pr.big);
    ok(pr.names[0] === 'Best for 6 to 10 reps' && pr.names[1] === 'Best estimate' && pr.names[2] === 'Best estimate', 'a best only for its reps is "Best for 6 to 10 reps"; "Best estimate" only when it beats every earlier estimate', pr.names);

    // 1h. A heavier load with the reps in range is never read as down.
    await seed({ ss: [['2026-09-13', 'latPulldown', [[90, 14, 1], [90, 14, 1], [90, 13, 1]], [8, 15]], ['2026-09-20', 'latPulldown', [[90, 15, 1], [90, 14, 1], [90, 14, 1]], [8, 15]], ['2026-09-27', 'latPulldown', [[95, 11, 1], [95, 10, 1], [95, 10, 1]], [8, 15]], ['2026-10-04', 'latPulldown', [[95, 11, 1], [95, 10, 1], [95, 10, 1]], [8, 15]], ['2026-10-10', 'latPulldown', [[95, 12, 1], [95, 11, 1], [95, 10, 1]], [8, 15]]] });
    const lu = await ev(() => { const L = window.__ironlog; const st = L.IDX().exStats.latPulldown; const h = L.exHeadline('latPulldown'); return { falling: st.falling, loadUp: st.loadUp, pct: st.pct, head: typeof h === 'string' ? h : JSON.stringify(h) }; });
    ok(!lu.falling && (lu.loadUp || lu.pct >= 0) && !/\bdown\b|recovery/i.test(lu.head), 'lat pulldown 90 x 14 to 95 x 10 to 12, in the 8 to 15 range: not falling, no "down, look at recovery"', lu);

    // 1i. A lift weeks off has no trend direction, no projection, and says when it was last done.
    await seed({ ss: [['2026-07-23', 'bench', [[175, 8, 1], [175, 8, 1], [175, 7, 1]], [6, 10]], ['2026-07-30', 'bench', [[180, 8, 1], [180, 8, 1], [180, 7, 1]], [6, 10]], ['2026-08-06', 'bench', [[185, 8, 1], [185, 8, 1], [185, 7, 1]], [6, 10]], ['2026-08-13', 'bench', [[190, 8, 1], [190, 8, 1], [190, 8, 1]], [6, 10]]] });
    const fr = await ev(() => { const L = window.__ironlog; const st = L.IDX().exStats.bench; const t = L.liftTrend('bench'); const d = document.createElement('div'); d.innerHTML = t || ''; const h = L.exHeadline('bench'); const hd = document.createElement('div'); hd.innerHTML = typeof h === 'string' ? h : ''; return { fresh: st.fresh, trend: d.innerText || d.textContent, proj: L.exProjection('bench'), head: hd.textContent || '' }; });
    ok(fr.fresh === false && !/\bup\b|slowly|\bdown\b/.test(fr.trend) && fr.proj == null && /Last done .*\d+ weeks ago/.test(fr.head), 'bench last done 8 weeks ago: no up or down, no projection, "Last done ..., 8 weeks ago"', fr);

    // 1j. Two empty weeks just gone are a break, not a lighter week.
    await seed({ ss: old });
    ok(await ev(() => window.__ironlog.lastLighterWeek() == null), 'after weeks off, no "last lighter week"');

    // 1k. A rest week is said as a rest week.
    const wk = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-28'].map(d => [d, 'bench', [[185, 8, 1], [185, 8, 1], [185, 8, 1]], [6, 10]]);
    await seed({ ss: wk, rest: ['2026-09-21'] });
    const rw = await ev(() => { const L = window.__ironlog; const a = L.avgWeeks(4); return { rest: a._rest, light: a._light, txt: L.avgWeeksTxt(a) }; });
    ok(rw.rest === 1 && /a rest week/.test(rw.txt) && /left out/.test(rw.txt) && !/lighter/.test(rw.txt), 'a rest week in the last 4 is "a rest week left out", not a lighter week', rw);

    // 1l. Weight lifted counts hanging leg raises at their bodyweight share, as push-ups.
    await seed({ ss: [['2026-10-05', 'hangingLegRaise', [[0, 19, 1], [0, 19, 1], [0, 18, 1]], [10, 20]]], bw: [['2026-10-01', 180]] });
    const tv = await ev(() => { const L = window.__ironlog; const v = L.IDX().sessVol.find(x => x.date === '2026-10-05'); return v ? v.vol / 0.45359237 : null; });
    // 56 reps x 180 lb x 0.35 = 3,528 lb.
    ok(tv != null && Math.abs(tv - 3528) < 1, 'hanging leg raises 19, 19, 18 at 180 lb: 3,528 lb lifted (56 x 180 x 0.35), no longer left out', tv);

    // 1m. Backup due: not for an account synced this week; yes for a log only on the phone.
    const bk = await ev(() => { const L = window.__ironlog; const c = L.cloud; const was = { on: c.on, last: c.last }; c.on = true; c.last = Date.now(); const a = L.backupDue(); c.on = false; c.last = 0; const b = L.backupDue(); c.on = was.on; c.last = was.last; return { a, b }; });
    ok(bk.a === false && bk.b === true, 'Backup due: never while the account synced this week, still when the log is only on the phone', bk);

    // 1n. The weigh-in card: never weighed in, only for someone who logs bodyweight lifts.
    await seed({ ss: [['2026-10-05', 'bench', [[185, 8, 1]], [6, 10]]] });
    const bw1 = await ev(() => window.__ironlog.bwDueCard());
    await seed({ ss: [['2026-10-05', 'pushup', [[0, 15, 1]], [10, 20]]] });
    const bw2 = await ev(() => window.__ironlog.bwDueCard());
    ok(!bw1 && !!bw2, 'never weighed in: no weigh-in card for a lifter with no bodyweight lifts; one for a lifter who does push-ups', { bw1: !!bw1, bw2: !!bw2 });

    // 1o. Small helpers: the plan's effort in RPE mode, a hint said once, a start time.
    const hp = await ev(() => {
      const L = window.__ironlog; const s = L.state; s.settings.rirScale = 'rpe'; const a = L.effTgt(1); delete s.settings.rirScale; const b = L.effTgt(1);
      const full = "First time: pick a load you think you could lift about 12 times, erring light. Do 6 to 10 reps, stopping with about 2 still in you. Next time's load is worked out from this.";
      const seen = new Set(); const h1 = L.hintOnce(full, seen); const h2 = L.hintOnce(full, seen);
      return { a, b, h1, h2, tm: L.sessTm({ t: new Date(2026, 9, 9, 18, 0).getTime() }), tm0: L.sessTm({}) };
    });
    ok(hp.a === 'RPE 9' && hp.b === '1 RIR', 'a plan\'s effort reads "RPE 9" in RPE mode and "1 RIR" otherwise', hp);
    ok(/Next time's load is worked out from this/.test(hp.h1) && hp.h2 === 'First time: a load you could lift about 12 times; do 6 to 10 reps.', 'the first-time paragraph once, then a short line on later exercises', hp.h2);
    ok(/6:00/.test(hp.tm) && hp.tm0 === '', 'a session\'s start time reads as a clock time, nothing when unknown', hp);
    ok(!P.errors.length, 'engine checks: no page errors', P.errors);
    await P.ctx.close().catch(() => {});
  }

  // ---------- 2. The session screen at 320 px ----------
  for (const dark of [false, true]) {
    const P = await open(FILE, { browser, touch: true, dark, w: 320, h: 640, clock: '2026-10-11T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const T = dark ? ' (dark)' : ' (light)';
    // A blank session with the given exercises, none with history unless given.
    const start = (o) => ev(o => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state;
      s.settings.onboarded = true; s.settings.unit = 'lb'; s.settings.autoDone = false; s.settings.timerMode = 'auto'; delete s.settings.rirScale; if (o.rpe) s.settings.rirScale = 'rpe';
      s.injuries = []; s.sessions = o.ss || []; s.bodyweights = [{ id: 'bw0', date: '2026-10-01', kg: 180 * LB }]; s.draft = null; L.state = L.normalize(s); L.invalidate();
      L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose();
      const d = L.state.draft;
      for (const [exId, plan] of o.ex) d.ex.push(L.newBlock(exId, { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * LB, ...plan }, {}));
      if (o.ss1) { d.ex[0].plan.ss = 1; d.ex[1].plan.ss = 1; }
      L.saveNow(); L.ui.tab = 'today'; L.render(); return d.ex.length;
    }, o);
    const tick = (bi, si, reps, rir) => ev(async ([bi, si, reps, rir]) => {
      const L = window.__ironlog; const b = L.state.draft.ex[bi];
      const inp = document.querySelector(`[data-f="r"][data-b="${bi}"][data-s="${si}"]`); inp.value = String(reps);
      inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
      b.sets[si].rir = rir == null ? null : rir;
      document.querySelector(`[data-act="sDone"][data-b="${bi}"][data-s="${si}"]`).click(); await new Promise(r => setTimeout(r, 120));
    }, [bi, si, reps, rir]);

    // 2a. RPE mode: the exercise header says the target as RPE.
    await start({ rpe: true, ex: [['bench', {}]] });
    const hdr = await ev(() => document.querySelector('#blk-0 .bh-m p.small').innerText);
    ok(/@RPE 9/.test(hdr) && !/RIR/.test(hdr), 'RPE mode: the header reads "@RPE 9", never "@1 RIR"' + T, hdr);

    // 2b. The whole-RIR strip at 320 px: six buttons 40 px or wider and 44 tall, inside the screen.
    await start({ ex: [['bench', {}]] });
    await ev(async () => { document.querySelector('.rirb[data-b="0"][data-s="0"]').click(); await new Promise(r => setTimeout(r, 80)); });
    const strip = await ev(() => { const s = document.querySelector('.rirstrip'); const bs = [...s.querySelectorAll('[data-act="rirPick"]:not(.rs-x)')].map(b => b.getBoundingClientRect()); const x = s.querySelector('.rs-x').getBoundingClientRect(); return { n: bs.length, minW: Math.min(...bs.map(b => b.width)), minH: Math.min(...bs.map(b => b.height)), inside: bs.every(b => b.left >= 0 && b.right <= innerWidth) && x.right <= innerWidth, xW: x.width, xH: x.height }; });
    ok(strip.n === 6 && strip.minW >= 40 && strip.minH >= 44 && strip.inside && strip.xW >= 44 && strip.xH >= 44, 'the whole-RIR strip at 320 px: 6 buttons at least 40 x 44, the clear button 44, all on screen' + T, strip);

    // 2c. First time on several lifts: the reason once, a short line on the rest.
    await start({ ex: [['bench', {}], ['latPulldown', {}], ['dbCurl', {}]] });
    const hints = await ev(() => [0, 1, 2].map(i => (document.querySelector(`#blk-${i} .hint`) || {}).innerText || ''));
    ok(/worked out from this/.test(hints[0]) && hints.slice(1).every(h => /^First time: a load you could lift about \d+ times; do .+\.$/.test(h.trim())), 'three new lifts: the first-time paragraph on the first, one short line on the others' + T, hints);

    // 2d. The low check-in: one line and an i, with the two buttons.
    const rc = await ev(() => { const L = window.__ironlog; const d = L.state.draft; d.chk = { sleep: 1, energy: 1, joints: 1 }; L.render(); const c = document.getElementById('readyCard'); if (!c) return null; const p = c.querySelector('p'); const txt = [...p.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(); return { txt, tip: !!p.querySelector('.tipi'), light: !!c.querySelector('[data-act="makeLight"]'), short: !!c.querySelector('[data-act="shortOpen"]') }; });
    ok(rc && rc.txt === 'Low readiness today.' && rc.tip && rc.light && rc.short, 'two low check-in answers: "Low readiness today." with the reason behind an i, and both buttons' + T, rc);
    await ev(() => { const L = window.__ironlog; delete L.state.draft.chk; L.render(); });

    // 2e. Push-ups never loaded: a much easier set never moves the next sets to an added load.
    await start({ ex: [['pushup', { repMin: 8, repMax: 15 }]] });
    await tick(0, 0, 15, 4);
    const pu = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { adj: b.adj || null, line: !!document.getElementById('adj-0'), ph: [...document.querySelectorAll('[data-f="w"][data-b="0"]')].map(i => i.value || i.placeholder) }; });
    ok(!pu.adj && !pu.line, 'push-ups at bodyweight x 15 with 4 in reserve: no "next sets" load change (a load never used)' + T, pu);

    // 2f. Minutes left follow each tick, and go when every set is done.
    await start({ ex: [['dbCurl', { sets: 2 }]] });
    // Minutes left are for a planned session (a blank one has no plan to time).
    await ev(() => { const L = window.__ironlog; L.state.draft.free = false; L.render(); });
    const l0 = await ev(() => (document.getElementById('sessLeft') || {}).textContent);
    await tick(0, 0, 10, 1); await tick(0, 1, 10, 1);
    const l1 = await ev(() => (document.getElementById('sessLeft') || {}).textContent);
    ok(/about \d+ min left/.test(l0 || '') && l1 === '', 'the header\'s minutes left: shown with sets to do, gone once every set is ticked' + T, { l0, l1 });

    // 2g. A superset rests only while a later partner has a set to do.
    await start({ ss1: true, ex: [['bench', { sets: 3 }], ['latPulldown', { sets: 1 }]] });
    const resting = () => ev(() => { const t = window.__ironlog.timer; return !!(t.end && t.end > Date.now()); });
    const stop = () => ev(() => { const t = window.__ironlog.timer; t.end = 0; });
    await stop();
    await tick(0, 0, 8, 1); const r1 = await resting(); await stop();
    await tick(1, 0, 10, 1); const r2 = await resting(); await stop();
    await tick(0, 1, 8, 1); const r3 = await resting(); await stop();
    ok(!r1 && r2 && r3, 'superset of 3 and 1 sets: no rest after A1 (B to do), rest after B1, and rest after A2 once B is done' + T, { r1, r2, r3 });

    // 2h. History: one word for a freestyle session, a time on two sessions of one day, no second count.
    const t1 = new Date(2026, 9, 9, 7, 0).getTime(), t2 = new Date(2026, 9, 9, 18, 0).getTime();
    await ev(([t1, t2]) => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; const mk = (id, t) => ({ id, date: '2026-10-09', t, free: true, dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', notes: '', ex: [{ exId: 'bench', sets: [{ w: 135 * LB, r: 8, rir: 1, done: true }] }] });
      s.sessions = [mk('a', t1), mk('b', t2), { ...mk('c', null), date: '2026-10-02' }]; s.draft = null; L.state = L.normalize(s); L.invalidate(); L.ui.tab = 'history'; L.render();
    }, [t1, t2]);
    const hi = await ev(() => { const rows = [...document.querySelectorAll('.hitem .pick')].map(b => b.innerText.replace(/\s+/g, ' ')); const sub = document.querySelector('[data-mkey="sessions"] .sec-s').innerText; return { rows, sub, tags: document.querySelectorAll('.hitem .tag').length }; });
    ok(hi.tags === 0 && hi.rows.every(t => !/Freestyle freestyle/i.test(t)), 'History: a freestyle session reads "Freestyle" once, no repeated tag' + T, hi.rows);
    ok(hi.rows.filter(t => /Oct 9|9 Oct/.test(t)).every(t => /\d:\d\d/.test(t)) && !hi.rows.some(t => /Oct 2|2 Oct/.test(t) && /\d:\d\d/.test(t)), 'two sessions on one day show their start times; a day with one does not' + T, hi.rows);
    ok(/^since /.test(hi.sub), 'the Sessions section says since when, not the count the page head already gives' + T, hi.sub);

    // 2i. Touch targets at 320 px.
    await ev(() => { const L = window.__ironlog; const s = L.state; s.sessions = []; s.draft = null; s.settings.hidden = []; s.measurements = [{ id: 'm1', date: '2026-10-01', arm: 38, forearm: 30, chest: 100, waist: 80, thigh: 58, calf: 38, neck: 38 }]; L.state = L.normalize(s); L.invalidate(); L.ui.tab = 'today'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
    await wait(150);
    const tt = await ev(() => {
      const q = s => document.querySelector(s);
      const g = q('#view .sgrip'); g.scrollIntoView({ block: 'center' }); const gr = g.getBoundingClientRect(); const cx = gr.left + gr.width / 2, cy = gr.top + gr.height / 2;
      const hit = (x, y) => { const e = document.elementFromPoint(x, y); return !!(e && e.closest('.sgrip') === g); };
      const sel = q('[data-bind="todayDay"]'); const wv = [...document.querySelectorAll('.wkview button')];
      const del = q('[data-act="delMeas"]'); const date = q('#bwDate');
      const lb = document.createElement('button'); lb.className = 'linkbtn tall'; lb.textContent = 'Not now'; document.body.appendChild(lb); const lh = lb.getBoundingClientRect().height; lb.remove();
      return { grip: [hit(cx - 20, cy), hit(cx + 19, cy), hit(cx, cy - 20), hit(cx, cy + 20)], sel: sel ? sel.getBoundingClientRect().height : null, wv: wv.map(b => b.getBoundingClientRect().height), del: del ? { r: del.getBoundingClientRect().right, vw: innerWidth } : null, date: date ? date.getBoundingClientRect().width : null, lh };
    });
    ok(tt.grip.every(Boolean), 'a section\'s ⠿ handle answers a touch 20 px either side and above and below its centre (44 px)' + T, tt.grip);
    ok(tt.sel == null || tt.sel >= 44, 'Change day is 44 px tall' + T, tt.sel);
    ok(tt.wv.length === 0 || tt.wv.every(h => h >= 44), 'Week and Month are 44 px tall' + T, tt.wv);
    ok(tt.del && tt.del.r <= tt.del.vw, 'the tape row\'s delete button stays on screen at 320 px' + T, tt.del);
    ok(tt.date >= 150, 'the body date field is wide enough for the year at 320 px (its own row)' + T, tt.date);
    ok(tt.lh >= 44, 'standalone link buttons (Calibration set, Not now, I have an account) are 44 px tall' + T, tt.lh);

    // 2j. Settings at 320 px: the weigh-in reminder has the full width; the rest timer choices are short.
    const st = await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const s = document.querySelector('[data-bind="bwEvery"]'); const t = document.querySelector('[data-bind="timerMode"]'); return { w: s.getBoundingClientRect().width, opts: [...t.options].map(o => o.text) }; });
    ok(st.w >= 250 && st.opts.every(t => t.length <= 22), 'Settings at 320 px: Weigh-in reminder full width, rest timer choices of 22 characters or fewer' + T, st);
    const wide = await ev(() => document.documentElement.scrollWidth <= innerWidth);
    ok(wide, 'no sideways scroll on Settings at 320 px' + T);
    ok(!P.errors.length, 'session screen: no page errors' + T, P.errors);
    await P.ctx.close().catch(() => {});
  }

  // ---------- 3. Copy: no shared-phone wording, no em dashes ----------
  {
    // The source, every line (comments too, so nothing slips in by a copy from one).
    for (const f of ['index.html', 'scripts/cloud-supabase.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
      const odd = src.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => ODD.test(l)).map(([n, l]) => n + ': ' + l.trim().slice(0, 120));
      ok(!odd.length, `${f}: no talk of shared phones, someone else, or another person`, odd.slice(0, 5));
      ok(!/\u2014/.test(src), `${f}: no em dashes`);
    }
    // What a lifter sees: every tab with every section open, the menu, and the Guide, on demo data.
    const P = await open(FILE, { browser, clock: '2026-10-11T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; L.state = L.normalize(s); L.invalidate(); L.makeDemo(); L.invalidate(); });
    let seen = '';
    for (const tab of ['today', 'program', 'dash', 'history', 'settings']) {
      seen += await ev(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); return document.getElementById('view').innerText + ' ' + [...document.querySelectorAll('[data-tip]')].map(e => e.getAttribute('data-tip')).join(' '); }, tab);
    }
    for (const act of ['menuOpen', 'guideOpen']) {
      seen += await ev(async a => { const L = window.__ironlog; L.ACT[a]({ dataset: {} }); await new Promise(r => setTimeout(r, 60)); document.querySelectorAll('.sheet details').forEach(d => d.open = true); const m = document.querySelector('.sheet'); const t = m ? m.innerText + ' ' + [...m.querySelectorAll('[data-tip]')].map(e => e.getAttribute('data-tip')).join(' ') : ''; if (L.ui.modal) L.ACT.mClose(); return t; }, act);
    }
    ok(seen.length > 5000, 'the scan read the tabs, the menu, and the Guide', seen.length);
    const bad = (seen.match(new RegExp('.{0,40}(' + ODD.source + ').{0,40}', 'gi')) || []);
    ok(!bad.length, 'on screen and in tips: no talk of shared phones, someone else, or another person', bad.slice(0, 5));
    ok(!/\u2014/.test(seen), 'on screen and in tips: no em dashes', (seen.match(/.{0,30}\u2014.{0,30}/g) || []).slice(0, 5));
    ok(!P.errors.length, 'copy scan: no page errors', P.errors);
    await P.ctx.close().catch(() => {});
  }

  // ---------- 4. The built app's first page fits short phones (once) ----------
  if (!process.env.IRONLOG_FILE) {
    const { start, quietHibp } = require('./fake-supabase');
    execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build.js')], { stdio: 'ignore' });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r34b-'));
    fs.cpSync(path.join(__dirname, '..', 'dist'), tmp, { recursive: true });
    const fake = await start(tmp);
    const ip = path.join(tmp, 'index.html');
    fs.writeFileSync(ip, cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
    for (const [w, h] of [[320, 568], [375, 667], [390, 844]]) {
      for (const scheme of ['light', 'dark']) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true, serviceWorkers: 'block', colorScheme: scheme });
        await quietHibp(ctx); const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.goto(fake.base + '/ironlog/'); await page.waitForFunction(() => window.__ironlog && document.getElementById('obTrack'), null, { timeout: 15000 });
        await page.evaluate(() => document.fonts.ready); await wait(300);
        const m = await page.evaluate(() => { const b = s => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; }; const c = b('[data-act="acctOpen"][data-mode="signup"]'), i = b('[data-act="acctOpen"][data-mode="signin"]'), l = b('.ob-later'); return { sh: document.documentElement.scrollHeight, ih: innerHeight, sw: document.documentElement.scrollWidth <= innerWidth, c: c && c.height, i: i && i.height, later: l && l.bottom, laterH: l && l.height }; });
        ok(m.sh <= m.ih + 2 && m.later <= m.ih && m.c >= 44 && m.i >= 44 && m.laterH >= 44 && m.sw, `the first page at ${w} x ${h} (${scheme}): Create account, I have an account, and Continue without an account all on screen, no scroll, 44 px targets`, m);
        ok(!errors.length, `first page at ${w} x ${h} (${scheme}): no page errors`, errors);
        await ctx.close();
      }
    }
    await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
