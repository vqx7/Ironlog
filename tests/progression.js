// Targets and progression, checked against their written rules (CA-1; the spec "Targets and progression", P-1 to P-28,
// in the project's claude/ironlog-spec-progression-draft1.md, taken from the Guide's "How targets are set"). A feature
// suite: each section is one rule, a lifter's log seeded and the session started from Today's card, and what the
// session screen shows (the grey load, the grey reps, the target) compared with what the rule gives, worked out here
// from the rule and its numbers (docs/EVIDENCE.md), never read from the app. A failure names its rule.
// PROGRESSION_ONLY=P-5,P-8 runs some rules.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.PROGRESSION_ONLY ? process.env.PROGRESSION_ONLY.split(',') : null;
const run = id => !ONLY || ONLY.includes(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-10'; // a Tuesday
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

// The rules' numbers (docs/EVIDENCE.md and the Guide): a barbell's default load step in lb, the step up on a compound
// lift, and the strength estimate the load rules read (Brzycki to 10 reps to failure, Epley past it).
const BAR_STEP_LB = 10, JUMP_COMPOUND = 0.025;
const e1 = (load, rtf) => (rtf <= 10 ? (load * 36) / (37 - rtf) : load * (1 + rtf / 30));
const loadFor = (est, rtf) => (rtf <= 10 ? (est * (37 - rtf)) / 36 : est / (1 + rtf / 30));
const stepsDown = (w, step) => Math.floor(w / step + 1e-9) * step;
const stepUp = (w, step, share) => Math.max(w + step, Math.round((w * (1 + share)) / step) * step);

/* A lifter in lb on a weekly routine whose days are given as { id, name, items: [[exId, sets, repMin, repMax, rir]] },
   with sessions as [date, dayId, [[exId, [[lb, reps, rir], ...]]]], each saved with its day and its plan's sets. */
async function lifter(days, sessions, o = {}) {
  const P = await open(FILE, { w: 390, h: 844, clock: (o.day || DAY) + 'T10:00:00' });
  await P.page.evaluate(([days, sessions, o]) => {
    const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
    S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false;
    S.routines = [{ id: 'R1', name: 'Mine', schedule: 'cycle', days: days.map(d => ({ id: d.id, name: d.name, rest: false,
      items: d.items.map(([exId, sets, repMin, repMax, rir], k) => ({ uid: d.id + k, exId, sets, repMin, repMax, rir, rest: 120, ss: null })) })) }];
    S.activeRoutineId = 'R1';
    S.sessions = sessions.map(([date, dayId, ex, f], i) => { const di = days.findIndex(d => d.id === dayId); const day = days[di];
      return { id: 's' + i, date, dayIdx: di, dayId, dayName: day.name, routineId: 'R1', notes: '', light: !!(f && f.light), deload: !!(f && f.deload),
        ex: ex.map(([exId, sets]) => { const it = day.items.find(x => x[0] === exId); return { exId, rr: [it[2], it[3]], ps: it[1], sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir, done: true })) }; }) }; });
    if (o.maxLoad) S.exercises = S.exercises.map(e => (e.id === 'bench' ? { ...e, maxLoad: o.maxLoad * LB } : e));
    if (o.inj) S.injuries = [{ id: 'i1', m: o.inj, note: '', date: '2026-11-01' }];
    L.state = L.normalize(S);
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
  }, [days, sessions, o]);
  await wait(100);
  return P;
}
// The session started on a day of the routine, as Today's card starts it, and what one exercise's rows show.
async function startOn(P, dayIdx) {
  await P.page.evaluate(k => { const L = window.__ironlog; L.ui.todayDay = k; L.render(); }, dayIdx);
  await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(250);
}
const shows = (P, exId) => P.page.evaluate(exId => {
  const L = window.__ironlog; const d = L.state.draft; const b = d.ex.findIndex(x => x.exId === exId); const blk = d.ex[b];
  const rows = blk.sets.map((s, si) => { const w = document.querySelector(`#view .sg input[data-f="w"][data-b="${b}"][data-s="${si}"]`), r = document.querySelector(`#view .sg input[data-f="r"][data-b="${b}"][data-s="${si}"]`); return { w: w ? Number(w.value || w.placeholder) : null, r: r ? Number(r.value || r.placeholder) : null }; });
  return { rows, tgt: blk.tgt, hint: blk.hint || '' };
}, exId);

// A field typed as a thumb does, and a set typed, rated and ticked, on the session screen.
async function type(P, b, si, f, v) {
  const q = `#view .sg input[data-f="${f}"][data-b="${b}"][data-s="${si}"]`;
  await P.page.click(q); await P.page.fill(q, ''); await P.page.keyboard.type(String(v));
  await P.page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(60);
}
async function tick(P, b, si, w, r, rir) {
  await type(P, b, si, 'w', w); await type(P, b, si, 'r', r);
  const strip = `#view [data-act="rirOpen"][data-b="${b}"][data-s="${si}"]`;
  if (rir != null && await P.page.$(strip)) { await P.page.click(strip); await wait(80); await P.page.click(`#view [data-act="rirPick"][data-b="${b}"][data-s="${si}"][data-v="${rir}"]`); await wait(80); }
  await P.page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
  await P.page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${si}"]`); await wait(150);
  // A question about the set (a load far off) is answered as a lifter who meant it.
  for (let k = 0; k < 3; k++) { const m = await P.page.evaluate(() => { const m = window.__ironlog.ui.modal; return m ? m.kind : null; }); if (!m) break; await P.page.click('#modal [data-act="mOk"]').catch(() => {}); await wait(120); }
}
// Days of 200 lb on bench, three sessions a week apart ending a week ago, each with these sets.
const weeks = (dayId, sets, n = 3) => Array.from({ length: n }, (_, k) => [addD(DAY, -7 * (n - k)), dayId, [['bench', sets]]]);
const DAY_BENCH = [{ id: 'A', name: 'Push', items: [['bench', 3, 6, 10, 2]] }];

(async () => {
  // ---- B. What the next session asks.
  if (run('P-5')) {
    // Every set at the top of the range: more weight, one step of the load step at least, about 2.5% on a compound lift.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 10, 2], [200, 10, 2], [200, 10, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    const want = stepUp(200, BAR_STEP_LB, JUMP_COMPOUND);
    ok(s.rows.every(r => r.w === want), `P-5 every set at the top of 6-10 at 200 lb: the next load is ${want} lb, one 10 lb step (2.5% is 5 lb, under a step)`, s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-7')) {
    // A fixed-rep plan goes up a step every time all its sets are done.
    const P = await lifter([{ id: 'A', name: 'Strength', items: [['bench', 5, 5, 5, 2]] }], weeks('A', [[200, 5, 2], [200, 5, 2], [200, 5, 2], [200, 5, 2], [200, 5, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.length === 5 && s.rows.every(r => r.w === 200 + BAR_STEP_LB && r.r === 5), 'P-7 5 x 5 done at 200 lb: 210 lb for 5 in every set', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-8')) {
    // Otherwise the same load, and beat last time's total reps over the same sets.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 24, 'P-8 200 x 8 x 3 in 6-10: the same 200 lb, 24 reps over 3 sets to beat', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-9')) {
    // One set under the range among the others shows the bottom of the range as its grey reps.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 9, 2], [200, 9, 2], [200, 4, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && s.rows[2].r === 6 && s.rows[0].r === 9, 'P-9 200 x 9, 9, 4: the same load, grey reps 9, 9 and the bottom of the range, 6, for the set that fell short', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-10')) {
    // Every set 2 or more reps short: down, in whole steps, to what the estimate says fits the bottom of the range.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 4, 2], [200, 4, 2], [200, 4, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    const want = stepsDown(loadFor(e1(200, 4 + 2), 6 + 2), BAR_STEP_LB);
    ok(s.rows.every(r => r.w === want), `P-10 200 x 4 x 3 at 2 in reserve on 6-10: down to ${want} lb, the load its estimate gives for 6 at 2 in reserve, in whole 10 lb steps`, s);
    await P.ctx.close(); await P.browser.close();
  }


  if (run('P-11')) {
    // Too easy: every top set 2 or more in reserve over the target. The estimate sets a heavier load, at most 10% more,
    // at least one step when every set was rated 5 or more.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 5], [200, 8, 5], [200, 8, 5]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    const w = s.rows[0].w;
    ok(s.rows.every(r => r.w === w) && w > 200 && w <= 220 && w % BAR_STEP_LB === 0, 'P-11 200 x 8 x 3 at 5 in reserve against a target of 2: heavier, by whole 10 lb steps, at most 10% (220 lb)', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-12')) {
    /* The first 3 sessions find the load: the cap on a step up from the estimate is 25% there, 10% after. 100 x 15 x 3 at 5
       in reserve (5 or more read as 4): an estimate of 100 x (1 + 19/30) = 163 lb (Epley, past 10 to failure), which gives
       about 122 lb for the middle of the range, 8, at the target's 2 in reserve (Brzycki), so the cap decides. */
    const est = e1(100, 15 + 4), mid = loadFor(est, 8 + 2);
    for (const [n, cap, why] of [[2, 1.25, 'the third session'], [5, 1.1, 'the sixth session']]) {
      const P = await lifter(DAY_BENCH, weeks('A', [[100, 15, 5], [100, 15, 5], [100, 15, 5]], n));
      await startOn(P, 0);
      const s = await shows(P, 'bench');
      const want = stepsDown(Math.min(mid, 100 * cap), BAR_STEP_LB);
      ok(s.rows.every(r => r.w === want), `P-12 ${why} after 100 x 15 x 3 at 5 in reserve: ${want} lb, the estimate's ${Math.round(mid)} lb capped at ${Math.round((cap - 1) * 100)}%, in whole 10 lb steps`, s);
      await P.ctx.close(); await P.browser.close();
    }
  }
  if (run('P-14')) {
    // At the heaviest load available: more reps, not more load.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 10, 2], [200, 10, 2], [200, 10, 2]]), { maxLoad: 200 });
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 30, 'P-14 the heaviest available is 200 lb, 200 x 10 x 3 at the top: the same 200 lb, 30 reps to beat (the target is the total to beat, as in P-8)', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-15')) {
    // A bodyweight lift never done with added load progresses by reps; the app never adds load.
    const P = await lifter([{ id: 'A', name: 'Pull', items: [['pullup', 3, 6, 10, 2]] }], weeks('A', [[0, 10, 2], [0, 10, 2], [0, 10, 2]]).map(([d, k]) => [d, k, [['pullup', [[0, 10, 2], [0, 10, 2], [0, 10, 2]]]]]));
    await startOn(P, 0);
    const s = await shows(P, 'pullup');
    ok(s.rows.every(r => !(r.w > 0)) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 30, 'P-15 pull-ups at bodyweight, 10 x 3 at the top: no added load, 30 reps to beat', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-16')) {
    // A session short of its usual (fewer sets, or clearly weaker reps) sets no target: the last target repeats.
    for (const [why, last] of [['two sets of a planned three', [[200, 8, 2], [200, 8, 2]]], ['6, 6, 6 after 8, 8, 8', [[200, 6, 2], [200, 6, 2], [200, 6, 2]]]]) {
      const P = await lifter(DAY_BENCH, [...weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]], 3).map(([d, k, e], i) => [addD(d, -7), k, e]), [addD(DAY, -7), 'A', [['bench', last]]]]);
      await startOn(P, 0);
      const s = await shows(P, 'bench');
      ok(s.rows.every(r => r.w === 200) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 24, `P-16 after 200 x 8 x 3 as usual, a session of ${why}: the target repeats, 24 reps at 200 lb`, s);
      await P.ctx.close(); await P.browser.close();
    }
  }
  if (run('P-18')) {
    // A session done lighter sets no target: the last full session does.
    const P = await lifter(DAY_BENCH, [...weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]], 3).map(([d, k, e]) => [addD(d, -7), k, e]), [addD(DAY, -7), 'A', [['bench', [[180, 8, 3], [180, 8, 3]]]], { light: true }]]);
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && s.tgt && s.tgt.total === 24, 'P-18 a Lighter day at 180 x 8 x 2 after 200 x 8 x 3: the target comes from 200 x 8 x 3 (24 reps at 200 lb)', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-19')) {
    // A ticked set of 0 reps is a missed set: read as a set short, the target repeats and never steps up.
    const P = await lifter(DAY_BENCH, [...weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]], 3).map(([d, k, e]) => [addD(d, -7), k, e]), [addD(DAY, -7), 'A', [['bench', [[200, 8, 2], [200, 8, 2], [200, 0, null]]]]]]);
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && s.tgt && s.tgt.total === 24, 'P-19 200 x 8, 8 and a missed set, after 200 x 8 x 3: the target repeats, 24 reps at 200 lb, never a step up', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-20')) {
    // More than 4 weeks off, up to 6 months: about 90% of the last working weight, with 2 or more reps in reserve.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]]).map(([d, k, e]) => [addD(d, -42), k, e]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    const w = s.rows[0].w;
    ok(w >= 170 && w <= 190 && w % BAR_STEP_LB === 0 && /2 or more/.test(s.hint || JSON.stringify(s)), 'P-20 seven weeks after 200 x 8 x 3: about 90% (180 lb) in whole steps, with 2 or more in reserve', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-21')) {
    // More than 6 months off: the lift starts fresh, nothing asked from before the break (tests/longbreak.js in full).
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]]).map(([d, k, e]) => [addD(d, -730), k, e]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => !(r.w > 0)) && !s.tgt, 'P-21 two years after 200 x 8 x 3: no load asked, no target', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-23')) {
    // During a session the next sets move only after a set clearly off: 3 reps past the top at the target's reserve moves them up.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]]));
    await startOn(P, 0);
    await tick(P, 0, 0, 200, 13, 2);
    const s = await shows(P, 'bench');
    ok(s.rows[1].w > 200 && s.rows[2].w > 200, 'P-23 200 x 13 at 2 in reserve on 6-10: the next sets are heavier', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-24')) {
    // A load you type is never changed: after a set clearly off, a typed load stays as typed.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]]));
    await startOn(P, 0);
    await type(P, 0, 2, 'w', 205);
    await tick(P, 0, 0, 200, 13, 2);
    const s = await shows(P, 'bench');
    ok(s.rows[2].w === 205 && s.rows[1].w > 200, 'P-24 205 typed on set 3, then 200 x 13 at 2 on set 1: set 3 stays 205, set 2 moves up', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-28')) {
    // An injury flagged on a muscle pauses targets for lifts that load it and caps them at last time.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 10, 2], [200, 10, 2], [200, 10, 2]]), { inj: 'chest' });
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w > 0 && r.w <= 200), 'P-28 chest flagged, bench 200 x 10 x 3 at the top: no step up, at most last time\'s 200 lb', s);
    await P.ctx.close(); await P.browser.close();
  }


  if (run('P-2')) {
    /* A range not used within 6 weeks of training before the lift's latest session starts from that latest session.
       The 6 weeks count time trained: a break of more than 4 weeks is not counted (r55.1), so the light day here is last
       done before eight weekly heavy days, 56 days of training, with no break between. */
    const days = [{ id: 'H', name: 'Heavy', items: [['bench', 3, 3, 5, 2]] }, { id: 'Lt', name: 'Light', items: [['bench', 3, 8, 12, 2]] }];
    const sessions = [[addD(DAY, -60), 'Lt', [['bench', [[155, 10, 2], [155, 10, 2], [155, 10, 2]]]]], ...[8, 7, 6, 5, 4, 3, 2, 1].map(k => [addD(DAY, -7 * k), 'H', [['bench', [[225, 5, 2], [225, 5, 2], [225, 5, 2]]]]])];
    const P = await lifter(days, sessions);
    await startOn(P, 1);
    const s = await shows(P, 'bench');
    const latest = await P.page.evaluate(d => window.__ironlog.fmtDate(d), addD(DAY, -7));
    ok(s.hint.startsWith(`Last (${latest})`) && !/155/.test(s.hint), `P-2 the light range last used before eight weeks of heavy days: its target starts from the latest session, the heavy day of ${latest}, not the 155 lb of then`, s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-4')) {
    /* A target is not a record: Today's workout names the lift's best set beside it, and the session's target is its own.
       The best by estimate here is 205 x 8 at 2 in reserve (205 x 36 / 27 = 273 lb), over 245 x 2 at 1 (245 x 36 / 34 = 259). */
    const P = await lifter(DAY_BENCH, weeks('A', [[245, 2, 1], [205, 8, 2], [205, 8, 2], [205, 8, 2]]));
    const t = await P.page.evaluate(() => { const L = window.__ironlog; L.ui.folds['today:session'] = true; L.render(); const b = document.querySelector('#view .pvbest'); return b ? b.textContent : ''; });
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(Math.round(e1(205, 10)) > Math.round(e1(245, 3)) && /^Best 205×8, /.test(t) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 24, 'P-4 Today names the best set, 205 x 8 (its estimate over 245 x 2\'s), with the date it was first done, apart from the session\'s target, 24 reps to beat', { t, s });
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-6')) {
    // A step that is large for the load (5 lb on 15 lb raises): reps past the top first, at the same load.
    const days = [{ id: 'A', name: 'Arms', items: [['dbLateral', 3, 10, 15, 2]] }];
    const P = await lifter(days, weeks('A', []).map(([d, k]) => [d, k, [['dbLateral', [[15, 15, 2], [15, 15, 2], [15, 15, 2]]]]]));
    await startOn(P, 0);
    const s = await shows(P, 'dbLateral');
    ok(s.rows.every(r => r.w === 15) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 45, 'P-6 15 lb raises at the top of 10-15, where a 5 lb step is a third of the load: the same 15 lb, reps past the top to build first (45 to beat)', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-13')) {
    // A close variation's first session starts from the related lift: about 90% of its estimate on an isolation lift,
    // rounded down to the rack's step, never more than the related lift's load.
    const days = [{ id: 'A', name: 'Arms', items: [['hammer', 3, 8, 12, 2]] }];
    const P = await lifter([{ id: 'A', name: 'Arms', items: [['hammer', 3, 8, 12, 2], ['dbCurl', 3, 8, 12, 2]] }], weeks('A', []).map(([d, k]) => [d, k, [['dbCurl', [[35, 10, 2], [35, 10, 2], [35, 10, 2]]]]]));
    await startOn(P, 0);
    const s = await shows(P, 'hammer');
    const w = s.rows[0].w;
    ok(w > 0 && w <= 35 && w % 5 === 0 && /DB Curl/.test(s.hint), 'P-13 a hammer curl\'s first session after DB curls of 35 x 10 x 3: a load from the curl\'s sets, on the 5 lb rack, no more than 35, naming the DB Curl', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-17')) {
    // Its usual sets are never more than the plan: four sets done on a plan of three are read over three.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2], [200, 8, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.length === 3 && s.tgt && s.tgt.n === 3 && s.tgt.total === 24, 'P-17 200 x 8 x 4 on a plan of 3: the target is read over the plan\'s 3 sets, 24 reps to beat', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-22')) {
    // A lift on a break today shows no Load due (tests/longbreak.js section 10 in full).
    const P = await lifter(DAY_BENCH, [0, 7, 14].map(k => [addD(DAY, -64 + k), 'A', [['bench', [[225, 8, 1 + k / 7], [225, 8, 1 + k / 7], [225, 8, 1 + k / 7]]]]]));
    const t = await P.page.evaluate(() => { const L = window.__ironlog; L.ui.folds['today:session'] = true; L.render(); return document.getElementById('view').innerText; });
    ok(!/Load due/.test(t), 'P-22 six weeks after three sessions getting easier: no Load due on Today', t.slice(0, 400));
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-25')) {
    // Every target has Why this target, giving the reason for that exact number.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 10, 2], [200, 10, 2], [200, 10, 2]]));
    await startOn(P, 0);
    const why = await P.page.evaluate(() => { const b = document.querySelector('#view .hint .tipi[aria-label="Why this target"]'); return b ? b.getAttribute('data-tip') : null; });
    ok(!!why && /200 lb/.test(why) && /add 10 lb/.test(why), 'P-25 the session\'s target has Why this target, and its reason gives the number: every set at 200 lb hit the top, add one 10 lb step', why);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-26')) {
    // Lighter loads are whole steps and never under the bar on a barbell lift typed as the total.
    const P = await lifter(DAY_BENCH, weeks('A', [[45, 10, 3], [45, 10, 3], [45, 10, 3]]));
    await P.page.click('#view .hero [data-act="startSession"][data-light="1"]').catch(async () => { await P.page.evaluate(() => window.__ironlog.ACT.startSession({ dataset: { light: '1', day: '0' } })); });
    await wait(250);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w >= 45), 'P-26 a Lighter day after 45 x 10 x 3 on the empty bar: never under 45 lb', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-27')) {
    // A change of units never moves a target by itself: 100 kg x 8 x 3, then the app switched to lb.
    const P = await lifter(DAY_BENCH, weeks('A', [[220.462, 8, 2], [220.462, 8, 2], [220.462, 8, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 24 && s.rows.every(r => Math.abs(r.w - 220.46) <= 5), 'P-27 100 kg x 8 x 3 read in lb: the same target, 24 reps, at the same load shown in lb (within one 5 lb step of 220.5)', s);
    await P.ctx.close(); await P.browser.close();
  }

  // ---- A. Where a target comes from.
  if (run('P-1')) {
    // The same lift on a heavy day and a light day progresses on each separately, from its own range.
    const days = [{ id: 'H', name: 'Heavy', items: [['bench', 3, 3, 5, 2]] }, { id: 'Lt', name: 'Light', items: [['bench', 3, 8, 12, 2]] }];
    const sessions = [];
    for (const k of [3, 2, 1]) { sessions.push([addD(DAY, -7 * k), 'H', [['bench', [[225, 5, 2], [225, 5, 2], [225, 5, 2]]]]]); sessions.push([addD(DAY, -7 * k + 3), 'Lt', [['bench', [[155, 10, 2], [155, 10, 2], [155, 10, 2]]]]]); }
    let P = await lifter(days, sessions);
    await startOn(P, 0);
    let s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === stepUp(225, BAR_STEP_LB, JUMP_COMPOUND)), 'P-1 the heavy day, 225 x 5 x 3 at the top of 3-5: a step up, 235 lb, from its own sessions', s);
    await P.ctx.close(); await P.browser.close();
    P = await lifter(days, sessions);
    await startOn(P, 1);
    s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 155) && s.tgt && s.tgt.total === 30, 'P-1 the light day, 155 x 10 x 3 in 8-12: 155 lb, 30 reps to beat, from its own sessions', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-3')) {
    // The working weight: the most sets, ignoring sets under 60% of the heaviest; a heavy top set before back-off sets
    // counts for bests, while the target follows the back-off sets.
    const P = await lifter(DAY_BENCH, weeks('A', [[95, 10, 5], [245, 2, 1], [205, 8, 2], [205, 8, 2], [205, 8, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    const work = s.rows.filter(r => r.w === 205);
    ok(work.length >= 3 && s.tgt && s.tgt.w != null && Math.round(s.tgt.w / 0.45359237) === 205, 'P-3 95 x 10, 245 x 2, then 205 x 8 x 3: the target is at 205 lb, the back-off sets\' load, not 245 or 95', s);
    await P.ctx.close(); await P.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
