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
    ok(pr.names[0] === 'Best for 6 to 10 reps to failure' && pr.names[1] === 'Best estimate' && pr.names[2] === 'Best estimate', 'a best only for its reps is "Best for 6 to 10 reps"; "Best estimate" only when it beats every earlier estimate', pr.names);

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
      const sel = q('.hero [data-act="startAltOpen"]'); const wv = [...document.querySelectorAll('.wkview button')];
      const del = q('[data-act="delMeas"]'); const date = q('#bwDate');
      const lb = document.createElement('button'); lb.className = 'linkbtn tall'; lb.textContent = 'Not now'; document.body.appendChild(lb); const lh = lb.getBoundingClientRect().height; lb.remove();
      return { grip: [hit(cx - 20, cy), hit(cx + 19, cy), hit(cx, cy - 20), hit(cx, cy + 20)], sel: sel ? sel.getBoundingClientRect().height : null, wv: wv.map(b => b.getBoundingClientRect().height), del: del ? { r: del.getBoundingClientRect().right, vw: innerWidth } : null, date: date ? date.getBoundingClientRect().width : null, lh };
    });
    ok(tt.grip.every(Boolean), 'a section\'s ⠿ handle answers a touch 20 px either side and above and below its centre (44 px)' + T, tt.grip);
    ok(tt.sel >= 44, 'Change on the Today card is 44 px tall' + T, tt.sel);
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

  // ---------- 2b. The session, the rest of the review's steps, through the screen ----------
  {
    const P = await open(FILE, { browser, touch: true, clock: '2026-10-11T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    // One exercise in a blank session, with the given earlier sessions (sets in the unit shown).
    const setup = (o) => ev(o => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; const u = v => o.kg ? v : v * LB;
      s.settings.onboarded = true; s.settings.unit = o.kg ? 'kg' : 'lb'; s.settings.autoDone = !!o.auto; s.settings.timerMode = 'auto'; delete s.settings.rirScale; delete s.settings.gym; delete s.settings.autoAdj; delete s.settings.todayStart;
      if (o.fill) s.settings.loadFill = 'fill'; else delete s.settings.loadFill;
      s.injuries = []; s.bodyweights = [];
      s.sessions = (o.ss || []).map(([id, date, exId, sets, rr, t]) => ({ id, date, t: t || undefined, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId, rr, sets: sets.map(([w, r, rir]) => ({ w: u(w), r, rir, done: true })) }] }));
      s.draft = null; L.state = L.normalize(s); L.invalidate();
      L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose();
      const d = L.state.draft; d.ex.push(L.newBlock(o.ex, { sets: o.sets || 3, repMin: o.lo, repMax: o.hi, rir: o.rir == null ? 1 : o.rir, rest: 90, inc: o.kg ? 2.5 : 5 * LB }, {}));
      L.saveNow(); L.ui.tab = 'today'; L.render(); const b = d.ex[0]; return b.sw == null ? null : Math.round((o.kg ? b.sw : b.sw / LB) * 100) / 100;
    }, o);
    const typeIn = (f, si, v, bi) => ev(([f, si, v, bi]) => { const i = document.querySelector(`[data-f="${f}"][data-b="${bi || 0}"][data-s="${si}"]`); i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); }, [f, si, v, bi]);
    const click = (sel) => ev(async sel => { const e = document.querySelector(sel); if (!e) return false; e.click(); await new Promise(r => setTimeout(r, 150)); return true; }, sel);
    const tick = async (si, reps, rir) => { await typeIn('r', si, reps); await ev(([si, rir]) => { window.__ironlog.state.draft.ex[0].sets[si].rir = rir; }, [si, rir]); await click(`[data-act="sDone"][data-b="0"][data-s="${si}"]`); };
    const rows = (kg) => ev(kg => { const L = window.__ironlog; const b = L.state.draft.ex[0]; const k = v => v == null || v === '' ? null : Math.round((kg ? +v : +v / 0.45359237) * 100) / 100; return { w: b.sets.map(x => k(x.w)), shown: [...document.querySelectorAll('[data-f="w"][data-b="0"]')].map(i => i.value || i.placeholder), adj: b.adj ? { at: b.adj.at, w: k(b.adj.w) } : null, line: (document.getElementById('adj-0') || {}).innerText || '' }; }, kg);

    // B-F5: "Fill in suggested loads" with auto-mark on (the default): reps typed, then the RIR box, then 4. The adjustment holds, and holds when re-rated 5.
    const bench4 = [['h1', '2026-10-04', 'bench', [[180, 10, 2], [180, 9, 2], [180, 9, 2], [180, 8, 2]], [6, 10]]];
    await setup({ ss: bench4, ex: 'bench', lo: 6, hi: 10, rir: 2, sets: 4, fill: true, auto: true });
    await typeIn('r', 0, 10);
    await click('.rirb[data-b="0"][data-s="0"]');
    await click('.rirstrip [data-act="rirPick"][data-v="4"]');
    let r = await rows();
    ok(r.adj && r.adj.w > 180 && r.w.slice(1).every(w => w === r.adj.w) && /Next sets/.test(r.line), 'B-F5: fill mode and auto-mark on, 180 x 10 rated 4 against 2: the filled rows move up and the line shows', r);
    const up1 = r.adj && r.adj.w;
    await click('.rirb[data-b="0"][data-s="0"]');
    await click('.rirstrip [data-act="rirPick"][data-v="5"]');
    r = await rows();
    ok(r.adj && r.adj.w >= up1 && r.w.slice(1).every(w => w === r.adj.w), 'B-F5: re-rated 5, the adjustment holds (it was undone back to 180 before)', r);

    // B-F7: a warm-up added after an adjustment keeps it on its own set; that set made a warm-up drops it.
    await setup({ ss: bench4, ex: 'bench', lo: 6, hi: 10, rir: 2, sets: 4 });
    await tick(0, 10, 4);
    const before = await rows();
    await ev(() => window.__ironlog.ACT.wAdd({ dataset: { b: '0' } }));
    await ev(async () => { window.__ironlog.render(); await new Promise(r => setTimeout(r, 100)); });
    r = await rows();
    const srcAt = await ev(() => window.__ironlog.state.draft.ex[0].sets.findIndex(x => x.done && !x.warm));
    ok(before.adj && r.adj && r.adj.at === srcAt && srcAt === 1 && r.shown.slice(2).every(v => +v === before.adj.w), 'B-F7: a warm-up inserted above keeps the adjustment on set 1 (now row 2), the rows below still at ' + (before.adj && before.adj.w), { before, r, srcAt });
    await click(`[data-act="sWarm"][data-b="0"][data-s="${srcAt}"]`);
    r = await rows();
    ok(!r.adj && !r.line, 'B-F7: the adjusted-from set marked W drops the adjustment and its line', r);

    // B-F9: a blank effort reads as the lift's usual effort (2 here), not as failure: 180 x 4 goes to 160, not 150.
    const usual2 = [1, 2, 3, 4].map(i => ['u' + i, `2026-09-${String(6 + i * 7).padStart(2, '0')}`, 'bench', [[180, 9, 2], [180, 9, 2], [180, 8, 2], [180, 8, 2]], [6, 10]]);
    await setup({ ss: usual2, ex: 'bench', lo: 6, hi: 10, rir: 2, sets: 4 });
    await tick(0, 4, null);
    r = await rows();
    // e1(180, 4, 2) = 180 x 36 / 31 = 209.0; e1inv(209.0, 6 + 2 + 1) = 162.6, down to 160.
    ok(r.adj && r.adj.w === 160, 'B-F9: 180 x 4 with effort blank (usual 2): next sets 160, as if rated 2 (not 150, as if all-out)', r);
    ok(/under your 6-10 range/.test(r.line), 'B-F16: the down line says "under your 6-10 range", not "under your 6"', r.line);

    // B-F4: the line goes once no set is left under it.
    await setup({ ss: bench4, ex: 'bench', lo: 6, hi: 10, rir: 2, sets: 2 });
    await tick(0, 10, 4);
    const l1 = (await rows()).line;
    await tick(1, 9, 2);
    r = await rows();
    ok(/Next sets/.test(l1) && !r.line, 'B-F4: after the last set the "Next sets" line is gone', { l1, r });

    // B-F3 and C-F6: a set the app moved up from is a working set at Finish, never a "ramp-up".
    await setup({ kg: true, ss: [['r1', '2026-10-04', 'dbRow', [[28, 10, 1], [28, 10, 1], [28, 10, 1]], [8, 12]]], ex: 'dbRow', lo: 8, hi: 12, rir: 1, sets: 3 });
    await tick(0, 12, 5);
    const ad = await rows(true);
    await tick(1, 10, 1); await tick(2, 9, 1);
    await ev(() => window.__ironlog.ACT.finish());
    const fin = await ev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, title: m.title || '' } : null; });
    ok(ad.adj && ad.adj.w > 28 && !(fin && /ramp-up/i.test(fin.title)), 'C-F6: 28 x 12 at 5 in reserve moved the next sets up; Finish does not call it a ramp-up set', { ad, fin });
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });

    // C-F1: the evening session of a two-a-day does not repeat the morning's Weight PR.
    const am = new Date(2026, 9, 11, 7, 0).getTime();
    await setup({ kg: true, ss: [['p0', '2026-10-01', 'dbCurl', [[12, 8, 1], [12, 8, 1], [12, 8, 1]], [8, 12]], ['am', '2026-10-11', 'dbCurl', [[14, 7, 1], [14, 7, 1], [14, 6, 1]], [8, 12], am]], ex: 'dbCurl', lo: 8, hi: 12, rir: 1, sets: 3 });
    for (const si of [0, 1, 2]) { await typeIn('w', si, 14); }
    await ev(() => { const e = document.getElementById('toast'); if (e) e.innerText = ''; });
    await tick(0, 7, 1);
    const toastTxt = await ev(() => (document.getElementById('toast') || {}).innerText || '');
    await tick(1, 7, 1); await tick(2, 6, 1);
    await ev(() => window.__ironlog.ACT.finish());
    await wait(200);
    const rec = await ev(() => { const L = window.__ironlog; const m = L.ui.modal; const sheet = document.querySelector('.sheet'); return { kind: m && m.kind, pr: !!document.getElementById('recapPR'), text: sheet ? sheet.innerText : '', prs: L.IDX().prs.filter(p => p.date === '2026-10-11' && p.exId === 'dbCurl').map(p => ({ type: p.type, sid: p.sid })) }; });
    ok(!/PR/.test(toastTxt), 'C-F1: 14 kg in the evening, after 14 kg that morning: no live PR toast', toastTxt);
    ok(rec.kind === 'recap' && !rec.pr && rec.prs.length === 1 && rec.prs[0].sid === 'am', 'C-F1: the evening recap has no PR; the one Weight PR of the day stays the morning session\'s', rec);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });

    // B-F13: an RIR strip open on the next exercise survives the fold of the one just finished.
    await setup({ ss: bench4, ex: 'bench', lo: 6, hi: 10, rir: 2, sets: 1 });
    await ev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex.push(L.newBlock('latPulldown', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * 0.45359237 }, {})); L.saveNow(); L.render(); });
    await tick(0, 9, 2);
    await click('.rirb[data-b="1"][data-s="0"]');
    await wait(2600);
    const strip = await ev(() => { const s = document.querySelector('.rirstrip'); return s ? s.dataset.b : null; });
    ok(strip === '1', 'B-F13: the strip opened on the next exercise is still open after the first one folds', strip);

    // C-F11: after switching kg to lb mid-session, the target and Last line are in lb.
    await setup({ kg: true, ss: [['k1', '2026-10-04', 'bench', [[60, 9, 1], [60, 8, 1], [60, 8, 1]], [6, 10]]], ex: 'bench', lo: 6, hi: 10, rir: 1, sets: 3 });
    const kgTxt = await ev(() => document.querySelector('#blk-0 .hint').innerText);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); const s = document.querySelector('[data-bind="unit"]'); s.value = 'lb'; s.dispatchEvent(new Event('change', { bubbles: true })); L.ui.tab = 'today'; L.render(); });
    const lbTxt = await ev(() => document.querySelector('#blk-0 .hint').innerText);
    ok(/kg/.test(kgTxt) && /lb/.test(lbTxt) && !/\bkg\b/.test(lbTxt), 'C-F11: the target and Last line follow a switch from kg to lb mid-session', { kgTxt, lbTxt });

    // C-F2: Today in freestyle mode has More options, with Rest week.
    await ev(() => { const L = window.__ironlog; const s = L.state; s.draft = null; s.settings.unit = 'lb'; s.settings.todayStart = 'free'; L.state = L.normalize(s); L.invalidate(); L.ui.heroMore = false; L.ui.tab = 'today'; L.render(); });
    const more1 = await click('[data-act="heroMore"]');
    const more = await ev(() => ({ rest: !!document.querySelector('[data-act="restWkOpen"]'), cardio: /cardio/i.test(document.querySelector('#view').innerText) }));
    ok(more1 && more.rest, 'C-F2: a blank-session Today has More options, with Rest week', more);

    // A2 and B-F14: after 6 weeks off, the coach is not "On track", and no muscle reads "rising" on 0 sets.
    const st = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.settings.todayStart = undefined; delete s.settings.todayStart;
      const mk = (i, date) => ({ id: 'b' + i, date, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'squat', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: (200 + i * 5) * LB, r: 8, rir: 1, done: true })) }, { exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: (150 + i * 5) * LB, r: 8, rir: 1, done: true })) }] });
      s.sessions = [0, 1, 2, 3, 4, 5].map(i => mk(i, L.addDays('2026-08-03', i * 7))); s.draft = null; L.state = L.normalize(s); L.invalidate();
      const c = L.coach(); L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const t = document.getElementById('view').innerText;
      return { tone: c.tone, text: c.text, zeroRise: /0 (hard )?sets a week[^\n]*Rising|Rising[^\n]*0 (hard )?sets a week/.test(t), onTrack: /^On track/m.test(t) };
    });
    ok(st.tone !== 'green' && /last 4 weeks/.test(st.text) && !st.zeroRise, 'A2: after 6 weeks off the coach says so (not green "On track") and no muscle reads rising on 0 sets', st);
    // V (2026-10-11): the same lift twice in a session. Side by side it is one exercise; apart (2nd and 4th) each stays, and the numbers read it once.
    const three = (o) => ev(o => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.settings.unit = 'lb'; delete s.settings.todayStart; s.sessions = []; s.draft = null; L.state = L.normalize(s); L.invalidate();
      L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose(); const d = L.state.draft;
      for (const id of o.ids) d.ex.push(L.newBlock(id, { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * LB }, {}));
      if (o.doneFirst != null) { const b = d.ex[o.doneFirst]; b.sets[0].w = 100 * LB; b.sets[0].r = 10; b.sets[0].done = true; }
      L.saveNow(); L.ui.tab = 'today'; L.render(); return d.ex.map(b => b.exId).join();
    }, o);
    const shape = () => ev(() => window.__ironlog.state.draft.ex.map(b => `${b.exId}:${b.sets.filter(x => !x.warm && !x.drop).length}${b.sets.some(x => x.done) ? '*' : ''}`).join(' '));
    const pick = (mode, b, id) => ev(([mode, b, id]) => { const L = window.__ironlog; L.applyPick({ mode, b }, id); }, [mode, b, id]);
    // Swap a fresh exercise to the one right after it: one exercise of 6 sets.
    await three({ ids: ['bench', 'latPulldown', 'dbCurl'] });
    await pick('swapBlock', 0, 'latPulldown');
    const j1 = await shape();
    ok(j1 === 'latPulldown:6 dbCurl:3', 'a swap to the exercise just after it joins them: one Lat Pulldown of 6 sets', j1);
    await ev(() => window.__ironlog.ACT.undo());
    const j1u = await shape();
    ok(j1u === 'bench:3 latPulldown:3 dbCurl:3', 'Undo puts the swapped exercise back as it was', j1u);
    // With a set done on it, that set stays; the sets left join the same lift just below.
    await three({ ids: ['bench', 'latPulldown', 'dbCurl'], doneFirst: 0 });
    await pick('swapBlock', 0, 'latPulldown');
    const j2 = await shape();
    ok(j2 === 'bench:1* latPulldown:5 dbCurl:3', 'with one bench set done, the 2 sets left join Lat Pulldown below (5); the done set stays on bench', j2);
    // Apart (2nd and 4th): each stays where it is.
    await three({ ids: ['bench', 'latPulldown', 'dbCurl', 'squat'] });
    await pick('swapBlock', 3, 'latPulldown');
    const j3 = await shape();
    ok(j3 === 'bench:3 latPulldown:3 dbCurl:3 latPulldown:3', 'a swap to a lift two places away keeps both where they are', j3);
    // Adding the lift that is already last joins it.
    await three({ ids: ['bench', 'dbCurl'] });
    await pick('addBlock', 0, 'dbCurl');
    const j4 = await shape();
    ok(j4 === 'bench:3 dbCurl:6', 'adding the exercise that is already last adds its sets to it', j4);
    // Finish: two of one lift side by side (moved there) are saved as one exercise.
    const j5 = await ev(async () => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.sessions = []; s.draft = null; L.state = L.normalize(s); L.invalidate(); L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose(); const d = L.state.draft;
      for (const id of ['dbCurl', 'bench', 'dbCurl']) { const b = L.newBlock(id, { sets: 2, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * LB }, {}); b.sets.forEach(x => { x.w = (id === 'bench' ? 135 : 25) * LB; x.r = 10; x.rir = 1; x.done = true; }); d.ex.push(b); }
      L.moveBlock(1, 2); L.saveNow(); L.ACT.finish(); await new Promise(r => setTimeout(r, 150)); if (L.ui.modal && L.ui.modal.kind !== 'recap') L.ACT.mOk && L.ACT.mOk(); await new Promise(r => setTimeout(r, 150));
      const ss = L.state.sessions[0]; return ss ? ss.ex.map(b => `${b.exId}:${b.sets.length}`).join(' ') : 'none';
    });
    ok(j5 === 'dbCurl:4 bench:2', 'Finish saves the same lift side by side as one exercise (4 curl sets), in the order done', j5);
    // The numbers: a saved session with curls 2nd and 4th is one exposure, with one PR at most.
    const j6 = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state;
      const blk = (exId, w, r) => ({ exId, rr: [8, 12], sets: [0, 1].map(() => ({ w: w * LB, r, rir: 1, done: true })) });
      s.sessions = [{ id: 'e0', date: '2026-10-01', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [blk('dbCurl', 20, 10)] }, { id: 'e1', date: '2026-10-08', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [blk('bench', 135, 10), blk('dbCurl', 25, 10), blk('squat', 185, 8), blk('dbCurl', 25, 11)] }];
      s.draft = null; L.state = L.normalize(s); L.invalidate(); const I = L.IDX();
      return { exp: (I.byEx.dbCurl || []).filter(x => x.date === '2026-10-08').length, n: I.byEx.dbCurl.find(x => x.date === '2026-10-08').n, prs: I.prs.filter(p => p.exId === 'dbCurl' && p.date === '2026-10-08').length, kept: s.sessions[1].ex.length };
    });
    ok(j6.exp === 1 && j6.n === 4 && j6.prs <= 1 && j6.kept === 4, 'curls 2nd and 4th in one session: kept as logged, read as one exposure of 4 sets with at most one PR', j6);

    // C-F14: a best inside one band of reps is not announced as the lift's best estimate.
    const cf14 = await ev(() => {
      const L = window.__ironlog; const s = L.state; s.settings.unit = 'kg';
      const mk = (id, date, sets) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bss', rr: [6, 12], sets: sets.map(([w, r, rir]) => ({ w, r, rir, done: true })) }] });
      s.sessions = [mk('a', '2026-08-12', [[22, 10, 1]]), mk('b', '2026-09-02', [[22, 14, 4], [24, 6, 1]]), mk('c', '2026-09-09', [[24, 7, 1], [24, 6, 1]])]; s.draft = null; L.state = L.normalize(s); L.invalidate();
      return L.IDX().prs.filter(p => p.date === '2026-09-09' && p.type === 'e1RM').map(p => L.prName(p));
    });
    // Aug 12: 22 x 10 @1 is 11 to failure, Epley 30.07 kg. Sep 9: 24 x 7 @1 is 8 to failure, Brzycki 29.79 kg: under it.
    ok(cf14.every(n => n !== 'Best estimate'), 'C-F14: 24 x 7 (29.8 kg estimated) after 22 x 10 (30.1) is never called "Best estimate"', cf14);

    // C-F17: Save on the weigh-in card with the field empty takes the grey number, as every grey number does.
    const cf17 = await ev(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.unit = 'lb'; s.draft = null; delete s.settings.todayStart; delete s.settings.bwEvery;
      s.bodyweights = [{ id: 'w0', date: '2026-09-20', kg: 174 * 0.45359237 }];
      s.sessions = [{ id: 'p1', date: '2026-10-05', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'pushup', rr: [10, 20], sets: [{ w: 0, r: 15, rir: 1, done: true }] }] }];
      L.state = L.normalize(s); L.invalidate(); L.ui.tab = 'today'; L.render();
      const card = document.getElementById('bwDue'); if (!card) return { card: false };
      card.querySelector('[data-act="addBW"]').click(); await new Promise(r => setTimeout(r, 100));
      return { card: true, today: L.state.bodyweights.filter(b => b.date === '2026-10-11').map(b => Math.round(b.kg / 0.45359237 * 10) / 10) };
    });
    ok(cf17.card && cf17.today.length === 1 && cf17.today[0] === 174, 'C-F17: the weigh-in card\'s Save with the field empty logs the grey 174 lb', cf17);

    // A3: the bodyweight rate says the dates it covers, not "the last 42 days".
    const a3 = await ev(() => {
      const L = window.__ironlog; const s = L.state; s.bodyweights = []; for (let i = 0; i < 40; i += 2) s.bodyweights.push({ id: 'bw' + i, date: L.addDays('2026-07-04', i), kg: (180 + i * 0.05) * 0.45359237 });
      L.state = L.normalize(s); L.invalidate(); L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const m = document.getElementById('view').innerText.match(/[+-]?[\d.]+% per week[^\n]*/); return m ? m[0] : '';
    });
    ok(/per week, \w{3} \d+ to \w{3} \d+/.test(a3) && !/last \d+ days/.test(a3), 'A3: the bodyweight rate names its dates ("+0.1% per week, Jul 4 to ...")', a3);

    // A9: Volume says one count this week, regions at their minimum, not a second "hard sets" total.
    const a9 = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state;
      s.sessions = [{ id: 'v1', date: '2026-10-06', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: 150 * LB, r: 8, rir: 1, done: true })) }, { exId: 'squat', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: 200 * LB, r: 8, rir: 1, done: true })) }] }];
      L.state = L.normalize(s); L.invalidate(); L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const v = document.querySelector('#view [data-mkey="volume"]'); return v ? v.innerText : '';
    });
    ok(/This week so far: \d+ of \d+ regions at their minimum/.test(a9) && !/This week so far: [\d.]+ hard sets/.test(a9), 'A9: Volume\'s headline counts regions at their minimum, not a second hard-set total', a9.slice(0, 200));

    // A14: the muscle map says "1 hard set" and gives no target to a tracked-only muscle.
    const a14 = await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const tips = [...document.querySelectorAll('#view [data-tip], #view [aria-label]')].map(e => (e.getAttribute('data-tip') || '') + ' ' + (e.getAttribute('aria-label') || '')).join('\n'); return { plural1: /\b1 hard sets\b/.test(tips), neck: (tips.match(/Neck:[^\n]*/) || [''])[0] }; });
    ok(!a14.plural1 && (!a14.neck || (/tracked only/.test(a14.neck) && !/target/.test(a14.neck))), 'A14: "1 hard set", and Neck tracked only with no target', a14);

    // A10, B-F10, C-F16: the Guide covers what r33 and r34 added and states the adjustment as the code does.
    const guide = await ev(async () => { const L = window.__ironlog; L.ACT.guideOpen({ dataset: {} }); await new Promise(r => setTimeout(r, 80)); document.querySelectorAll('.sheet details').forEach(d => d.open = true); const t = document.querySelector('.sheet').innerText; L.ACT.mClose(); return t; });
    const need = ['Rest week', '+ Drop', 'Your gym', 'Today starts with', 'Two sessions in a day', 'Back after more than 4 weeks', 'best for its reps', '15%'];
    ok(need.every(w => guide.includes(w)), 'the Guide covers rest weeks, + Drop, Your gym, the blank-session start, two-a-days, coming back after a break, PR names, and the 15% cap on light isolation lifts', need.filter(w => !guide.includes(w)));

    // A16: wording found repeated or odd.
    const a16 = await ev(() => {
      const L = window.__ironlog; const s = L.state; s.settings.todayStart = undefined; delete s.settings.todayStart; s.draft = null; L.ui.tab = 'today'; L.render();
      L.ACT.startAltOpen({ dataset: { day: '0' } }); const opts = [...document.querySelectorAll('#modal [data-act="dayPick"]')].map(o => o.innerText.replace(/\s+/g, ' ')); L.ACT.mClose();
      s.trash = [{ id: 't1', kind: 'cardio', date: '2026-10-10', data: { id: 'c1', date: '2026-10-09', kind: 'run', min: 20 } }]; L.state = L.normalize(s); L.ACT.trashEmpty(); const m = L.ui.modal; const title = m ? m.title : ''; const body = m ? m.body : ''; L.ACT.mClose();
      return { opts, title, body };
    });
    ok(a16.opts.length > 0 && !a16.opts.some(o => /Rest \(rest\)/i.test(o)), 'A16: the days in Change never say "Rest (rest)"', a16.opts);
    ok(a16.title && !/for good/.test(a16.title) && /7 days/.test(a16.body), 'A16: emptying Recently deleted does not say "for good" beside Undo for 7 days', a16);
    ok(!P.errors.length, 'the review\'s session steps: no page errors', P.errors);
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
    for (const act of ['menuOpen', 'guideOpen', 'impOpen']) {
      seen += await ev(async a => { const L = window.__ironlog; L.ACT[a]({ dataset: {} }); await new Promise(r => setTimeout(r, 60)); document.querySelectorAll('.sheet details').forEach(d => d.open = true); const m = document.querySelector('.sheet'); const t = m ? m.innerText + ' ' + [...m.querySelectorAll('[data-tip]')].map(e => e.getAttribute('data-tip')).join(' ') : ''; if (L.ui.modal) L.ACT.mClose(); return t; }, act);
    }
    ok(seen.length > 5000, 'the scan read the tabs, the menu, and the Guide', seen.length);
    const bad = (seen.match(new RegExp('.{0,40}(' + ODD.source + ').{0,40}', 'gi')) || []);
    ok(!bad.length, 'on screen and in tips: no talk of shared phones, someone else, or another person', bad.slice(0, 5));
    ok(!/\u2014/.test(seen), 'on screen and in tips: no em dashes', (seen.match(/.{0,30}\u2014.{0,30}/g) || []).slice(0, 5));
    // V (2026-10-11): no other app named on screen, and the name field is just "Name".
    ok(!/\b(Strong|Hevy)\b/.test(seen), 'no other workout app named on any tab, tip, the menu, the Guide, or the import sheet', (seen.match(/.{0,40}\b(Strong|Hevy)\b.{0,40}/g) || []).slice(0, 5));
    const F = await open(FILE, { browser, realStarter: true, clock: '2026-10-11T12:00:00' });
    // On the build the account page comes first; Continue without an account leads to Set up.
    await F.page.evaluate(async () => { const l = document.querySelector('#obPage[data-step="acct"] .ob-later'); if (l) { l.click(); await new Promise(r => setTimeout(r, 200)); } });
    const first = await F.page.evaluate(() => { const v = document.getElementById('view'); return { t: v.innerText + ' ' + [...v.querySelectorAll('[data-tip],[placeholder]')].map(e => (e.getAttribute('data-tip') || '') + ' ' + (e.getAttribute('placeholder') || '')).join(' '), name: (([...v.querySelectorAll('label.field')].find(l => l.querySelector('[data-bind="userName"]')) || {}).innerText || '').trim() }; });
    ok(/^Name/.test(first.name) && !/greeting|Shown on Today/i.test(first.t) && !/\b(Strong|Hevy)\b/.test(first.t), 'the first-run page: "Name (optional)" with no greeting line, and no other app named', first.name);
    await F.ctx.close().catch(() => {});
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
