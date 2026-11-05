// r72 (PENDING.md's tracker: NEW-63 and the 387 audit's 387-B1 to 387-B7 and 387-C1, with V's rulings of
// 2026-11-04 on B3, B5 and C1), each written as what a lifter expects and run first on r71
// (`node tests/r72.js baselines/r71.html`), where each section fails:
//   1  NEW-63: after an exercise's last set the next one comes up by a glide from where the page is, never by a
//      jump to the top of the session first (r71: the scroll went to 0, the title on screen, then back down).
//   2  387-B1: a load step of the lift's or the plan's own, viewed in the other unit, is honoured from the last
//      load: 37.5 kg dumbbells on a 5 kg step read 82.7 lb, never 88.2 (no lb rack has it); a 65 lb curl on a
//      10 lb step reads 29.5 kg (65 lb), never 27.2 (60 lb). The unit's own step still takes the nearest load in
//      the unit on screen (NEW-46, a guard).
//   3  387-B2: every set under the range by 2 or more drops the load whatever the RIR rated: leg press 15-20,
//      100 x 12 x 3 at RIR 2 (14 reps to failure) drops, as at RIR 0 (r71: held at 100).
//   4  387-B3: a missed set counts as 0 reps in the session's reading (V, 2026-11-04): after 185 x 10 x 3,
//      185 x 10, 10 and a missed set repeats the target, 31+ reps, as a near miss does (r71: 21+); never a step up.
//   5  387-B4: one more rep at the same load and effort is a PR: lateral raise 20 lb x 10, then 11, then 12 at
//      RIR 2 (r71: no PR for 11 or 12, scored below 10 past 12 reps to failure).
//   6  387-B5: the total to beat is the reps done (V, 2026-11-04: practical, not confusing): only session 185 x
//      10, 10, 5 asks "Beat 25 reps" (r71: 28, "a set under 8 counts as 8"); the grey reps still show 8 for the
//      short set (a guard).
//   7  387-B6: a plank held at bodyweight only, never loaded, keeps building time as push-ups build reps (r71:
//      "add 5 lb (a plate or a vest)").
//   8  387-B7: normalize run twice gives what it gives once, so a library lift added to an old save hashes the
//      same on the next load (r71: inc and plates added the second time).
//   9  387-C1: lighter sessions in one rep range never make another range's lighter sessions a new level (r71:
//      one lighter session in range B made range A's target 85 kg).
//  From the independent review of r72 (each run first on d230f03, r72 before the review, where each fails):
//  10  R72-1: an imported history (no rep range) and two ranges since: three lighter sessions in a row against the
//      same earlier sessions are a new level, so the target and the injury cap follow the lifter's own 20 lb.
//  11  R72-2: a PR the list counts is labelled on its row and in the toast as it is ticked, after an earlier set of
//      the session that was no PR (135 x 15 at 3 in reserve, then 145 x 12; 225 x 5 rated 5, then 235 x 5).
//  12  R72-3: a set rated 5 or more in reserve is read as 4 by the same formula as any set: 105 x 3 is no PR after
//      100 x 5 at 4 (126 against 128.6).
//  13  R72-5: a touch or a wheel as the glide begins leaves the page where it can, never at the session's title.
//  14  R72-6: a hold once done with load is never "bodyweight never loaded", whichever range that was in.
//  15  R72-7: normalize twice is once for a lift whose main muscle this build does not know, chest among its helpers.
//  17  R72-4 (V, 2026-11-04: "Count heavier as PR"): past 12 reps to failure a set reads no stronger than at 12, so 65 x 9
//      at 1 after 60 x 12 at 3 in reserve is a PR on every screen, as All-time bests' new best estimate says; one more
//      rep at a load is still one (20 lb x 11 and 12 at 2 in reserve).
//  16  R72-8: on a one-set plan, a missed first set reads as 0, so the session reads below its usual and the target
//      repeats, never "Beat 0 reps".
// R72_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R72_ONLY ? process.env.R72_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const LB = 0.45359237;
const T = '2026-11-04';
const add = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const lb = kg => Math.round((kg / LB) * 10) / 10;
// A session on the routine's day (ps = the plan's sets) or on another day (dayId given).
const ses = (id, date, exId, rr, sets, o = {}) => ({ id, date, dayIdx: 0, dayId: o.dayId || 'D1', dayName: o.dayName || 'Day 1', routineId: 'R1', notes: '', ex: [{ exId, rr, sets, ps: o.ps ?? 3 }] });
// A set typed in a unit: [w, r, rir, 'miss'].
const set = unit => ([w, r, rir, flag]) => ({ w: unit === 'lb' ? w * LB : w, r: flag === 'miss' ? 0 : r, rir: rir === undefined ? null : rir, warm: false, drop: false });

// A page with a log seeded through window.__ironlog, as the suites do.
async function page() {
  const P = await open(FILE, { clock: T + 'T10:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
  const seed = o => ev(o => {
    const L = window.__ironlog; const S = L.state;
    S.settings.onboarded = true; S.settings.unit = o.unit; S.settings.autoDone = false; S.settings.rirMode = 'on';
    delete S.settings.gym; S.settings.barKg = null;
    S.injuries = []; S.draft = null; S.deloadWeek = null; S.bodyweights = o.bw ? [{ id: 'b1', date: '2025-01-01', kg: o.bw, demo: false }] : [];
    const item = { uid: 'u1', exId: o.exId, ...o.plan, ss: null };
    S.routines = [{ id: 'R1', name: 'Routine', schedule: 'cycle', days: [{ id: 'D1', name: 'Day 1', rest: false, items: [item] }, ...(o.days || [])] }]; S.activeRoutineId = 'R1';
    S.sessions = o.sessions; L.state = L.normalize(S); L.invalidate(); L.saveNow();
  }, o);
  const unit = u => ev(u => { const L = window.__ironlog; L.state.settings.unit = u; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); }, u);
  const sug = (exId, plan, opts) => ev(([exId, plan, opts]) => { const g = window.__ironlog.suggest(exId, plan, opts || {}); return { w: g.w, text: g.text, target: g.target, lastR: g.lastR }; }, [exId, plan, opts || null]);
  return { P, ev, seed, unit, sug, close: () => P.browser.close() };
}

(async () => {
  if (run(1)) {
    // The demo log at a phone's size, by touch: the first lift's sets ticked, the scroll read every frame through the fold.
    for (const compact of [false, true]) {
      const D = await open(FILE, { touch: true, w: 390, h: 664, clock: T + 'T18:00:00', dark: true });
      const pg = D.page;
      await pg.evaluate(c => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.timerCompact = c; L.makeDemo(); for (const x of S.sessions) delete x.demo; localStorage.setItem('ironlog.v1.tipWake', '1'); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); }, compact);
      await pg.click('.hero [data-act="startSession"]:not([data-light])'); await wait(500);
      const n = await pg.evaluate(() => window.__ironlog.state.draft.ex[0].sets.length);
      for (let si = 0; si < n; si++) {
        const sel = `[data-act="sDone"][data-b="0"][data-s="${si}"]`;
        // As a lifter does: the set scrolled by hand to the middle of the screen, then tapped where it is.
        const p = await pg.evaluate(sel => { const e = document.querySelector(sel); let r = e.getBoundingClientRect(); if (r.bottom > innerHeight - 200 || r.top < 80) window.scrollBy(0, r.top - innerHeight * 0.45); r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
        await wait(300);
        if (si === n - 1) await pg.evaluate(() => { window.__tr = []; const t0 = performance.now(); const f = () => { const a = document.getElementById('blk-1'); window.__tr.push({ t: Math.round(performance.now() - t0), y: Math.round(scrollY), a: a ? Math.round(a.getBoundingClientRect().top) : null }); if (performance.now() - t0 < 2600) requestAnimationFrame(f); }; requestAnimationFrame(f); });
        await pg.touchscreen.tap(p.x, p.y); await wait(si === n - 1 ? 2800 : 400);
      }
      const r = await pg.evaluate(() => { const tr = window.__tr; const a = document.getElementById('blk-1'); const m = a ? parseFloat(getComputedStyle(a).scrollMarginTop) + parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) : null; return { tr, folded: !!document.querySelector('#blk-0.folded'), endTop: a ? Math.round(a.getBoundingClientRect().top) : null, margin: m, style: a ? a.getAttribute('style') : null }; });
      const y0 = r.tr[0].y, y1 = r.tr[r.tr.length - 1].y;
      const lowest = Math.min(...r.tr.map(x => x.y));
      // The next lift only ever moves up the screen (or stays), from where it was to its place.
      let back = 0; for (let i = 1; i < r.tr.length; i++) if (r.tr[i].a != null && r.tr[i - 1].a != null) back = Math.max(back, r.tr[i].a - r.tr[i - 1].a);
      const tag = compact ? ' (the compact pill)' : ' (the card)';
      ok(r.folded && lowest >= Math.min(y0, y1) - 2, '1. NEW-63: the fold never scrolls above where it starts and ends' + tag + ' (r71: to 0, the session\'s title on screen)', { y0, y1, lowest, trace: r.tr.filter((x, i) => i % 6 === 0).map(x => `${x.t}:${x.y}/${x.a}`) });
      ok(back <= 2, '1. NEW-63: the next exercise moves only up the screen to its place, never back down' + tag, { back, trace: r.tr.slice(55, 110).map(x => x.t + ':' + x.y + '/' + x.a) });
      ok(r.endTop != null && Math.abs(r.endTop - r.margin) <= 2 && !r.style, '1. NEW-63: it ends where it did before, under the bar at the top of the screen, with no style left on it' + tag, r);
      ok(!D.errors.length, '1. no page errors' + tag, D.errors);
      await D.browser.close();
    }
  }

  if (run(13)) {
    // A touch and a wheel the moment the glide begins (its first frame), as a thumb landing on the screen then.
    for (const kind of ['touchstart', 'wheel']) {
      const D = await open(FILE, { touch: true, w: 390, h: 664, clock: T + 'T18:00:00', dark: true });
      const pg = D.page;
      await pg.evaluate(() => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; L.makeDemo(); for (const x of S.sessions) delete x.demo; localStorage.setItem('ironlog.v1.tipWake', '1'); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
      await pg.click('.hero [data-act="startSession"]:not([data-light])'); await wait(500);
      const n = await pg.evaluate(() => window.__ironlog.state.draft.ex[0].sets.length);
      for (let si = 0; si < n; si++) {
        const sel = `[data-act="sDone"][data-b="0"][data-s="${si}"]`;
        const p = await pg.evaluate(sel => { const e = document.querySelector(sel); let r = e.getBoundingClientRect(); if (r.bottom > innerHeight - 200 || r.top < 80) window.scrollBy(0, r.top - innerHeight * 0.45); r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
        await wait(300);
        if (si === n - 1) await pg.evaluate(kind => { window.__tr = []; let fired = false; const t0 = performance.now(); const f = () => { const a = document.getElementById('blk-1'); if (!fired && a && a.getAttribute('style')) { fired = true; window.dispatchEvent(kind === 'wheel' ? new WheelEvent('wheel', { deltaY: 1 }) : new Event('touchstart')); } window.__tr.push(Math.round(scrollY)); if (performance.now() - t0 < 2600) requestAnimationFrame(f); }; requestAnimationFrame(f); }, kind);
        await pg.touchscreen.tap(p.x, p.y); await wait(si === n - 1 ? 2800 : 400);
      }
      const r = await pg.evaluate(() => ({ tr: window.__tr, y: Math.round(scrollY), style: (document.getElementById('blk-1') || {}).getAttribute ? document.getElementById('blk-1').getAttribute('style') : 'gone' }));
      const y0 = r.tr[0];
      // 269 is where this demo session's glide ends (section 1).
      ok(r.y >= Math.min(y0, 269) - 2 && !r.style, `13. R72-5: a ${kind} as the glide begins leaves the page at or below where it was, never at the session's title, and no style on the block (d230f03: left at 0)`, { y0, end: r.y, style: r.style });
      ok(!D.errors.length, `13. no page errors (${kind})`, D.errors);
      await D.browser.close();
    }
  }

  const G = await page();
  const { ev, seed, unit, sug } = G;
  const p812 = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * LB };

  if (run(2)) {
    const K = set('kg'), L = set('lb');
    // 37.5 kg dumbbells on the plan's own 5 kg step, 12 x 3 on 12-20: shown in lb, the load done, 82.7 lb.
    const pA = { sets: 3, repMin: 12, repMax: 20, rir: 1, rest: 90, inc: 5 };
    await seed({ unit: 'kg', exId: 'dbBench', plan: pA, sessions: [ses('a', add(T, -7), 'dbBench', [12, 20], [[37.5, 12, 1], [37.5, 12, 1], [37.5, 12, 1]].map(K))] });
    await unit('lb');
    const a = await sug('dbBench', pA), al = await sug('dbBench', pA, { light: true });
    ok(Math.abs(a.w - 37.5) < 1e-6 && /Beat 36 reps over 3 sets at 82\.7 lb/.test(a.text) && !/nearest load/.test(a.text), '2. 387-B1: 37.5 kg dumbbells on the plan\'s 5 kg step, shown in lb: "Beat 36 reps ... at 82.7 lb", the load done (r71: 88.2 lb, "the nearest load in lb")', { lb: lb(a.w), text: a.text });
    ok(al.w < 37.5 && Math.abs(((37.5 - al.w) / 5) - Math.round((37.5 - al.w) / 5)) < 1e-6, '2. 387-B1: its Lighter day is whole 5 kg steps down from 37.5 kg (r71: 66.1 lb, on no step)', { kg: al.w, lb: lb(al.w) });
    // A 65 lb curl on the plan's own 10 lb step, shown in kg: 29.5 kg, the 65 lb done.
    const pD = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 10 * LB };
    await seed({ unit: 'lb', exId: 'ezCurl', plan: pD, sessions: [ses('a', add(T, -7), 'ezCurl', [8, 12], [[65, 10, 1], [65, 10, 1], [65, 10, 1]].map(L))] });
    await unit('kg');
    const d = await sug('ezCurl', pD);
    ok(Math.abs(lb(d.w) - 65) < 0.05 && /Beat 30 reps over 3 sets at 29\.5 kg/.test(d.text), '2. 387-B1: a 65 lb curl on its 10 lb step, shown in kg: "Beat 30 reps ... at 29.5 kg" (r71: 27.2 kg, which is 60 lb, with no word of the move)', { lb: lb(d.w), text: d.text });
    // The guard: the unit's own step still takes the nearest load in the unit on screen (NEW-46, V 2026-11-03).
    await seed({ unit: 'kg', exId: 'dbBench', plan: { ...pA, inc: 5 * LB }, sessions: [ses('a', add(T, -7), 'dbBench', [12, 20], [[37.5, 12, 1], [37.5, 12, 1], [37.5, 12, 1]].map(K))] });
    await unit('lb');
    const e = await sug('dbBench', { ...pA, inc: 5 * LB });
    ok(Math.abs(lb(e.w) - 85) < 0.05 && /85 lb per dumbbell is the nearest load in lb/.test(e.text), '2. 387-B1: on the unit\'s own step the nearest load in lb stands, 85 lb (NEW-46, a guard)', { lb: lb(e.w), text: e.text });
  }

  if (run(3)) {
    const K = set('kg');
    const p = { sets: 3, repMin: 15, repMax: 20, rir: 1, rest: 120, inc: 2.5 };
    const out = {};
    for (const rir of [0, 2]) {
      await seed({ unit: 'kg', exId: 'legPress', plan: p, sessions: [ses('a', add(T, -7), 'legPress', [15, 20], [[100, 12, rir], [100, 12, rir], [100, 12, rir]].map(K))] });
      out[rir] = await sug('legPress', p);
    }
    ok(out[0].w < 100 && out[2].w < 100 && /below your 15-20 range\. Drop to/.test(out[2].text), '3. 387-B2: leg press 15-20, 100 x 12 x 3 at RIR 2 drops the load as at RIR 0 (r71: held at 100, "Beat 36 reps")', { rir0: out[0].w, rir2: out[2].w, text: out[2].text });
    ok(out[2].w >= out[0].w, '3. rated with more in reserve, the drop is no larger', { rir0: out[0].w, rir2: out[2].w });
  }

  if (run(4)) {
    const L = set('lb');
    const read = async last => { await seed({ unit: 'lb', exId: 'bench', plan: p812, sessions: [ses('a', add(T, -14), 'bench', [8, 12], [[185, 10, 1], [185, 10, 1], [185, 10, 1]].map(L)), ses('b', add(T, -7), 'bench', [8, 12], last.map(L))] }); return sug('bench', p812); };
    const miss = await read([[185, 10, 1], [185, 10, 1], [185, 0, null, 'miss']]);
    const near = await read([[185, 10, 1], [185, 10, 1], [185, 2, 0]]);
    const two = await read([[185, 10, 1], [185, 0, null, 'miss'], [185, 0, null, 'miss']]);
    ok(Math.abs(lb(miss.w) - 185) < 0.05 && miss.target === '31+ reps over 3 sets at 185 lb', '4. 387-B3: 185 x 10, 10 and a missed set repeats the target, "31+ reps over 3 sets at 185 lb" (r71: 21+)', miss);
    ok(near.target === miss.target && two.target === miss.target && Math.abs(lb(two.w) - 185) < 0.05, '4. 387-B3: a near miss (10, 10, 2) and two missed sets ask the same 31+ at 185 lb (r71: 10, 0, 0 asked 11+)', { near: near.target, two: two.target });
  }

  if (run(5)) {
    const L = set('lb');
    const plan = { sets: 3, repMin: 10, repMax: 15, rir: 2, rest: 60, inc: 5 * LB };
    const log = (rir, n) => [10, 11, 12].slice(0, n).map((r, i) => ses('s' + i, add(T, -7 * (3 - i)), 'dbLateral', [10, 15], [[20, r, rir], [20, r, rir], [20, r, rir]].map(L)));
    const live = [];
    for (const k of [1, 2]) {
      await seed({ unit: 'lb', exId: 'dbLateral', plan, sessions: log(2, k) });
      live.push(await ev(([r, date]) => { const L = window.__ironlog; return L.livePR('dbLateral', { w: 20 * 0.45359237, r, rir: 2, done: true, warm: false, drop: false }, date); }, [10 + k, add(T, -7 * (3 - k))]));
    }
    ok(live.every(Boolean), '5. 387-B4: at RIR 2, 20 lb x 11 after x 10, and x 12 after x 11, each gets a live PR as it is ticked (r71: none)', live);
    await seed({ unit: 'lb', exId: 'dbLateral', plan, sessions: log(2, 3) });
    const big = await ev(() => window.__ironlog.IDX().prs.filter(p => p.exId === 'dbLateral').sort((a, b) => a.date.localeCompare(b.date)).map(p => ({ date: p.date, type: p.type, big: p.big })));
    ok(big.length === 2 && big.every(p => p.big), '5. 387-B4: both count as PRs on Stats and the recap, as at RIR 0 (r71: held but not counted)', big);
  }

  if (run(6)) {
    const L = set('lb');
    await seed({ unit: 'lb', exId: 'bench', plan: p812, sessions: [ses('a', add(T, -7), 'bench', [8, 12], [[185, 10, 1], [185, 10, 1], [185, 5, 1]].map(L))] });
    const a = await sug('bench', p812);
    await seed({ unit: 'lb', exId: 'bench', plan: p812, sessions: [ses('a', add(T, -7), 'bench', [8, 12], [[185, 10, 1], [185, 9, 1], [185, 8, 1]].map(L))] });
    const b = await sug('bench', p812);
    ok(/Beat 25 reps over 3 sets at 185 lb\./.test(a.text) && a.target === '26+ reps over 3 sets at 185 lb' && !/counts as/.test(a.text), '6. 387-B5: after 185 x 10, 10, 5 the total to beat is the 25 done, "26+" (r71: 29+, "a set under 8 counts as 8")', a);
    ok(b.target === '28+ reps over 3 sets at 185 lb', '6. 387-B5: after 185 x 10, 9, 8 (27 done) it asks more than after 25, 28+', b);
    // The grey reps are shaped apart from the total (analytics.ts): the short set still shows the bottom of the range.
    ok(Array.isArray(a.lastR) && a.lastR.join() === '10,10,8', '6. the grey reps still read 10, 10 and 8, the short set at the bottom of the range (a guard)', { lastR: a.lastR });
  }

  if (run(7)) {
    const L = set('lb');
    const plan = { sets: 3, repMin: 30, repMax: 60, rir: 1, rest: 60, inc: 5 * LB };
    const hold = (id, k, s) => ses(id, add(T, -7 * k), 'plank', [30, 60], [[0, s, null], [0, s, null], [0, s, null]].map(L));
    await seed({ unit: 'lb', exId: 'plank', plan, bw: 80, sessions: [hold('a', 2, 60), hold('b', 1, 60)] });
    const g = await sug('plank', plan);
    ok(g.w === 0 && !/add 5 lb|a plate or a vest\) and aim/.test(g.text) && /181s\+/.test(g.target) && /keep adding time past 60s/.test(g.text), '7. 387-B6: a plank held at bodyweight for 60 s x 3 twice keeps building time, "181s+" at BW (r71: "add 5 lb (a plate or a vest)")', g);
    await seed({ unit: 'lb', exId: 'plank', plan, bw: 80, sessions: [hold('a', 2, 85), hold('b', 1, 85)] });
    const h = await sug('plank', plan);
    ok(h.w === 0 && /harder/.test(h.text), '7. 387-B6: every hold 40% past the top on bodyweight alone asks for a harder hold, as push-ups ask for harder reps', h);
  }

  if (run(8)) {
    const n = await ev(() => {
      const L = window.__ironlog;
      // A save from before a library lift was added: normalize appends it, and normalize again changes nothing.
      const raw = JSON.parse(JSON.stringify(L.state)); raw.exercises = raw.exercises.filter(e => e.id !== 'bench');
      const one = L.normalize(raw), two = L.normalize(JSON.parse(JSON.stringify(one)));
      const b1 = one.exercises.find(e => e.id === 'bench'), b2 = two.exercises.find(e => e.id === 'bench');
      return { once: JSON.stringify(b1), twice: JSON.stringify(b2), all: JSON.stringify(one.exercises) === JSON.stringify(two.exercises) };
    });
    ok(n.once === n.twice && n.all, '8. 387-B7: normalize twice gives what it gives once, a library lift added to an old save included (r71: inc and plates added the second time)', n);
  }

  if (run(9)) {
    const K = set('kg');
    const light = { uid: 'u2', exId: 'dbFrontRaise', sets: 3, repMin: 16, repMax: 23, rir: 1, rest: 90, inc: 5 * LB, ss: null };
    const pA = { sets: 3, repMin: 10, repMax: 15, rir: 1, rest: 90, inc: 5 * LB };
    const s3 = (w, r) => [[w, r, 1], [w, r, 1], [w, r, 1]].map(K);
    const A = (k, l, r) => ses('A' + k, add(T, -7 * k), 'dbFrontRaise', [10, 15], s3(l, r));
    const B = (k, l, r) => ses('B' + k, add(T, -7 * k + 3), 'dbFrontRaise', [16, 23], s3(l, r), { dayId: 'D2', dayName: 'Light' });
    const base = [A(8, 100, 12), B(8, 80, 20), A(7, 100, 12), B(7, 80, 20), A(6, 100, 12), B(6, 80, 20), A(5, 100, 12), B(5, 80, 20), A(3, 85, 11), A(2, 85, 11)];
    const res = [];
    for (const sess of [base, [...base, B(1, 68, 18)]]) {
      await seed({ unit: 'kg', exId: 'dbFrontRaise', plan: pA, days: [{ id: 'D2', name: 'Light', rest: false, items: [light] }], sessions: sess });
      res.push(await ev(pA => { const L = window.__ironlog; const xs = L.IDX().byEx.dbFrontRaise; return { reads: xs.filter(x => Math.abs(x.topW - 85) < 1e-6).map(x => (x.keep ? 'keep' : x.auto ? 'lighter' : 'full')), w: L.suggest('dbFrontRaise', pA, {}).w }; }, pA));
    }
    ok(res[0].w === 100 && res[1].w === 100 && res[1].reads.join() === 'lighter,lighter', '9. 387-C1: a lighter session in range B leaves range A\'s two lighter sessions lighter and A\'s target 100 kg (r71: both read as a new level, 85 kg)', res);
  }

  if (run(10)) {
    const L = set('lb');
    const plan = { sets: 3, repMin: 12, repMax: 20, rir: 1, rest: 60, inc: 5 * LB };
    const imp = (id, date) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Imported', routineId: '', notes: '', ex: [{ exId: 'dbLateral', note: '', rr: null, sets: [[30, 12], [30, 12], [30, 12]].map(L) }] });
    const imported = ['2026-08-05', '2026-08-12', '2026-08-19', '2026-08-26', '2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30'].map((d, i) => imp('i' + i, d));
    const mine = [ses('a1', '2026-10-10', 'dbLateral', [8, 12], [[20, 12, 1], [20, 11, 1], [20, 10, 1]].map(L)), ses('a2', '2026-10-17', 'dbLateral', [8, 12], [[20, 12, 1], [20, 12, 1], [20, 11, 1]].map(L)), ses('b1', '2026-10-24', 'dbLateral', [12, 20], [[20, 15, 1], [20, 14, 1], [20, 13, 1]].map(L)), ses('b2', '2026-10-31', 'dbLateral', [12, 20], [[20, 16, 1], [20, 15, 1], [20, 14, 1]].map(L))];
    await seed({ unit: 'lb', exId: 'dbLateral', plan, sessions: [...imported, ...mine] });
    const g = await sug('dbLateral', plan);
    const inj = await ev(plan => { const L = window.__ironlog; L.state.injuries = [{ id: 'j1', m: 'sideDelts', note: '', date: '2026-11-04' }]; L.invalidate(); const g = L.suggest('dbLateral', plan, {}); L.state.injuries = []; L.invalidate(); return g.text; }, plan);
    ok(Math.abs(lb(g.w) - 20) < 0.05 && !/lighter\)/.test(g.text), '10. R72-1: after a month at 20 lb in two ranges, under an import at 30, the target is at 20 lb, the lifter\'s level (d230f03: 30 lb, every session read lighter)', g);
    ok(/at or below 20 lb/.test(inj), '10. R72-1: and an injury caps it at 20 lb, never the import\'s 30', inj);
    // 387-C1's own case, lighter sessions against different earlier sessions (each range its own), is section 9.
  }

  if (run(11)) {
    // Ticked on the screen by the check, as a lifter does: the row's label and the toast after each tick, then Finish.
    for (const [name, rr, hist, today, prAt] of [['bench', [12, 20], [[135, 15, 0], [135, 15, 0], [135, 15, 0]], [[135, 15, 3], [145, 12, 0], [145, 12, 0]], 1], ['rir5', [5, 8], [[225, 5, 1], [225, 5, 1], [225, 5, 1]], [[225, 5, 5], [235, 5, 1], [235, 5, 1]], 1]]) {
      const D = await open(FILE, { clock: T + 'T18:00:00', w: 390, h: 844 });
      const pg = D.page;
      await pg.evaluate(([rr, hist, today, LB]) => {
        const L = window.__ironlog; const S = L.state;
        S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false; S.settings.rirMode = 'on'; S.settings.timerMode = 'off';
        delete S.settings.gym; S.injuries = []; S.draft = null; S.deloadWeek = null;
        const item = { uid: 'u1', exId: 'bench', sets: 3, repMin: rr[0], repMax: rr[1], rir: 1, rest: 0, inc: 5 * LB, ss: null };
        S.routines = [{ id: 'R1', name: 'Routine', schedule: 'cycle', days: [{ id: 'D1', name: 'Day 1', rest: false, items: [item] }] }]; S.activeRoutineId = 'R1';
        const st = ([w, r, rir]) => ({ w: w * LB, r, rir, warm: false, drop: false });
        S.sessions = ['2026-10-21', '2026-10-28'].map((date, i) => ({ id: 'h' + i, date, dayIdx: 0, dayId: 'D1', dayName: 'Day 1', routineId: 'R1', notes: '', ex: [{ exId: 'bench', rr, sets: hist.map(st), ps: 3 }] }));
        L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render();
      }, [rr, hist, today, LB]);
      await pg.click('.hero [data-act="startSession"]:not([data-light])'); await wait(300);
      await pg.evaluate(([today, LB]) => { const L = window.__ironlog; const b = L.state.draft.ex[0]; while (b.sets.length < today.length) b.sets.push({ ...b.sets[0] }); today.forEach(([w, r, rir], i) => Object.assign(b.sets[i], { w: w * LB, r, rir, done: false, warm: false, drop: false })); L.render(); }, [today, LB]);
      const seen = [];
      for (let si = 0; si < today.length; si++) {
        await pg.evaluate(() => { const t = document.getElementById('toast'); if (t) { t.hidden = true; t.textContent = ''; } });
        await pg.click(`[data-act="sDone"][data-b="0"][data-s="${si}"]`); await wait(220);
        seen.push(await pg.evaluate(si => { const b = document.querySelector(`[data-act="sDone"][data-b="0"][data-s="${si}"]`); const row = b && b.closest('.sg'); const t = document.getElementById('toast'); return { row: row && row.getAttribute('data-pr') || null, toast: t && !t.hidden ? t.textContent : '' }; }, si));
      }
      ok(seen[prAt].row === 'Weight PR' && /Weight PR/.test(seen[prAt].toast), `11. R72-2 (${name}): set ${prAt + 1}, a Weight PR the list counts, is labelled on its row and in the toast as it is ticked, after an earlier set that was no PR (d230f03: neither)`, seen);
      ok(seen[0].row === null, `11. R72-2 (${name}): the earlier set, no PR itself, has no label`, seen[0]);
      ok(!D.errors.length, `11. no page errors (${name})`, D.errors);
      await D.browser.close();
    }
  }

  if (run(12)) {
    const K = set('kg');
    await seed({ unit: 'kg', exId: 'bench', plan: { sets: 3, repMin: 3, repMax: 6, rir: 1, rest: 120, inc: 2.5 }, sessions: [ses('a', add(T, -14), 'bench', [3, 6], [[100, 5, 4], [100, 5, 4], [100, 5, 4]].map(K))] });
    const r = await ev(d => { const L = window.__ironlog; const s = (rir) => L.livePR('bench', { w: 105, r: 3, rir, done: true, warm: false, drop: false }, d); return { at5: s(5), at4: s(4) }; }, add(T, -7));
    ok(r.at5 === null && r.at4 === null, '12. R72-3: 105 x 3 after 100 x 5 at 4 in reserve is no PR, rated 5 or 4 (read as 4: 126 against 128.6; d230f03: a Weight PR rated 5)', r);
  }

  if (run(14)) {
    const L = set('lb');
    const heavy = { sets: 3, repMin: 20, repMax: 40, rir: 1, rest: 60, inc: 5 * LB }, long = { sets: 3, repMin: 30, repMax: 60, rir: 1, rest: 60, inc: 5 * LB };
    const hold = (id, k, day, rr, w, s2) => ses(id, add(T, -k), 'plank', rr, [[w, s2], [w, s2], [w, s2]].map(L), { dayId: day, dayName: day });
    await seed({ unit: 'lb', exId: 'plank', plan: long, bw: 80, days: [{ id: 'D2', name: 'Heavy', rest: false, items: [{ uid: 'u2', exId: 'plank', ...heavy, ss: null }] }], sessions: [hold('a', 15, 'D2', [20, 40], 10, 40), hold('b', 13, 'D1', [30, 60], 0, 60), hold('c', 8, 'D2', [20, 40], 10, 40), hold('d', 6, 'D1', [30, 60], 0, 60)] });
    const g = await sug('plank', long);
    ok(g.w > 0 && /add 5 lb/.test(g.text) && !/keep adding time/.test(g.text), '14. R72-6: a plank held with 10 lb on its heavy day, at bodyweight for 60 s x 3 on the long day, adds load there (it has been loaded; d230f03: "keep adding time")', g);
  }

  if (run(15)) {
    const r = await ev(() => { const L = window.__ironlog; const raw = JSON.parse(JSON.stringify(L.state));
      raw.exercises.push({ id: 'c_new', name: 'Landmine Thing', primary: 'futureMuscle', secondary: ['chest', 'triceps'], equip: 'landmine', bw: false, rare: false, perSide: false, note: '', custom: true, archived: false });
      const one = L.normalize(JSON.parse(JSON.stringify(raw))), two = L.normalize(JSON.parse(JSON.stringify(one)));
      return { once: JSON.stringify(one.exercises.find(e => e.id === 'c_new')), twice: JSON.stringify(two.exercises.find(e => e.id === 'c_new')), all: JSON.stringify(one) === JSON.stringify(two) }; });
    ok(r.once === r.twice && r.all && !/"secondary":\["chest"/.test(r.once), '15. R72-7: normalize twice is once for a lift whose main muscle this build does not know (read as chest), chest dropped from its helpers the first time (r71 and d230f03: the second time)', r);
  }

  if (run(16)) {
    const L = set('lb');
    const p1 = { sets: 1, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB };
    await seed({ unit: 'lb', exId: 'bench', plan: p1, sessions: [ses('a', add(T, -15), 'bench', [6, 10], [[185, 9]].map(L), { ps: 1 }), ses('b', add(T, -8), 'bench', [6, 10], [[185, 0, null, 'miss'], [185, 10]].map(L), { ps: 1 })] });
    const g = await sug('bench', p1);
    ok(Math.abs(lb(g.w) - 185) < 0.05 && g.target === '10+ reps in one set at 185 lb' && /below usual/.test(g.text), '16. R72-8: a one-set plan with its set missed reads below usual and repeats its target, 10+ reps at 185 (r71 and d230f03: "Beat 0 reps in one set")', g);
  }

  if (run(17)) {
    const K = set('kg');
    const plan = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 };
    const first = ses('a', add(T, -14), 'bench', [8, 12], [[60, 12, 3], [60, 12, 3], [60, 12, 3]].map(K));
    // As it is ticked: against the log before that day, as in a workout.
    await seed({ unit: 'kg', exId: 'bench', plan, sessions: [first] });
    const live = await ev(d => window.__ironlog.livePR('bench', { w: 65, r: 9, rir: 1, done: true, warm: false, drop: false }, d), add(T, -7));
    await seed({ unit: 'kg', exId: 'bench', plan, sessions: [first, ses('b', add(T, -7), 'bench', [8, 12], [[65, 9, 1], [65, 9, 1], [65, 9, 1]].map(K))] });
    const r = { live, list: await ev(d => window.__ironlog.IDX().prs.filter(p => p.exId === 'bench' && p.date === d).map(p => p.type + (p.big ? ' counted' : '')), add(T, -7)) };
    ok(r.live === 'Weight PR' && r.list.join() === 'Weight PR counted', '17. R72-4: 65 x 9 at 1 after 60 x 12 at 3 in reserve is a Weight PR as it is ticked and in the counted list (d230f03: Heaviest yet, no PR)', r);
    // A rep more at a load past 12 to failure is still a PR: section 5 holds the raises; here the leg press read at its ceiling.
    await seed({ unit: 'kg', exId: 'legPress', plan: { sets: 3, repMin: 10, repMax: 20, rir: 1, rest: 120, inc: 5 }, sessions: [12, 13, 14].map((n, i) => ses('l' + i, add(T, -7 * (3 - i)), 'legPress', [10, 20], [[100, n, 3], [100, n, 3], [100, n, 3]].map(K))) });
    const lp = await ev(() => window.__ironlog.IDX().prs.filter(p => p.exId === 'legPress' && p.big).map(p => p.date));
    ok(lp.length === 2, '17. R72-4: the leg press at 100 kg for 13 and then 14 at 3 in reserve, each a rep more at that load, are each a PR', lp);
  }

  ok(!G.P.errors.length, 'no page errors', G.P.errors);
  await G.close();
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
