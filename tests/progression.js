// Targets and progression, checked against their written rules (CA-1; the spec "Targets and progression", P-1 to P-43,
// in the project's claude/ironlog-spec-progression-draft1.md, built from the code, V's rulings deciding). A feature
// suite: each section is one rule, a lifter's log seeded and the session started from Today's card, and what the
// session screen shows (the grey load, the grey reps, the target) compared with what the rule gives, worked out here
// from the rule and its numbers (docs/EVIDENCE.md), never read from the app. A failure names its rule.
// Each rule's parts each have a check, with the number the rule gives rather than a range (V 2026-11-10, from the audit
// of 2.47's chat: the 10% cap was not pinned, P-27 never changed units, P-26 could not fail on its button), and the
// suite was run on builds with one rule's number changed to show each check fails there (PENDING, REV11-3).
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
// Reps to failure an estimate allows at a load: the inverse of e1, Brzycki to 10, Epley past it.
const rtfFor = (est, load) => { const b = 37 - (36 * load) / est; return b <= 10 ? b : 30 * (est / load - 1); };
/* Equal effort at another load (P-40): each set's reps to failure at last time's load read at the new one, less the
   plan's reserve; the total to beat is the whole reps under their sum, at most one under the top of the range in
   every set, spread over the sets largest remainder first (each set at most the top). No set changing by a whole rep
   is the same load, last time's total standing. */
const LBK = 0.45359237;
function equalEffort(at, nw, rs, rir, repMax) {
  const eq = rs.map(r => Math.min(repMax, Math.max(0, rtfFor(e1(at, r + rir), nw) - rir)));
  const sum = eq.reduce((a, b) => a + b, 0), last = rs.reduce((a, b) => a + b, 0);
  if (eq.every((x, i) => Math.abs(x - Math.min(repMax, rs[i])) < 1)) return { same: true, total: last, rs };
  const total = Math.min(Math.floor(sum + 1e-9), repMax * rs.length - 1);
  const per = eq.map(x => Math.floor(x + 1e-9)); let have = per.reduce((a, b) => a + b, 0);
  const idx = eq.map((_, i) => i).sort((x, y) => (eq[y] - per[y]) - (eq[x] - per[x]) || x - y);
  for (const i of idx) { if (have >= total) break; if (per[i] < repMax) { per[i]++; have++; } }
  return { same: false, total, rs: per };
}
const stepUp = (w, step, share) => Math.max(w + step, Math.round((w * (1 + share)) / step) * step);

/* A lifter in lb (o.unit 'kg' for kg) on a routine whose days are given as { id, name, items: [[exId, sets, repMin,
   repMax, rir, more]] }, with sessions as [date, dayId, [[exId, [[load, reps, rir], ...], more]], marks], each saved
   with its day and its plan's sets; `more` adds fields to the item or block (inc, nw), marks to the session (light).
   o.gym is Your gym, o.bw a weigh-in in lb, o.maxLoad the heaviest bench available, o.inj a flagged muscle; o.logUnit the
   unit the sets were typed in (the app's, o.unit, unless given), o.exInc a lift's own load step as { exId: step in lb },
   o.exSet fields set on a lift as stored, in kg ({ exId: { maxLoad: 100 } }), o.settings fields set in Settings,
   o.exUnit a lift's own unit as { exId: 'kg' or 'lb' } (390's Release B). */
async function lifter(days, sessions, o = {}) {
  const P = await open(FILE, { w: 390, h: 844, clock: (o.day || DAY) + 'T10:00:00' });
  await P.page.evaluate(([days, sessions, o]) => {
    const L = window.__ironlog; const S = L.state; const LB = 0.45359237; const U = (o.logUnit || o.unit) === 'kg' ? 1 : LB;
    S.settings.onboarded = true; S.settings.unit = o.unit || 'lb'; S.settings.autoDone = false;
    if (o.gym) S.settings.gym = o.gym;
    if (o.bw) S.bodyweights = [{ id: 'w1', date: '2026-09-01', kg: o.bw * LB }];
    S.routines = [{ id: 'R1', name: 'Mine', schedule: 'cycle', days: days.map(d => ({ id: d.id, name: d.name, rest: false,
      items: d.items.map(([exId, sets, repMin, repMax, rir, more], k) => ({ uid: d.id + k, exId, sets, repMin, repMax, rir, rest: 120, ss: null, ...(more || {}) })) })) }];
    S.activeRoutineId = 'R1';
    S.sessions = sessions.map(([date, dayId, ex, f], i) => { const di = days.findIndex(d => d.id === dayId); const day = days[di];
      return { id: 's' + i, date, dayIdx: di, dayId, dayName: day.name, routineId: 'R1', notes: '', light: !!(f && f.light), deload: !!(f && f.deload),
        ex: ex.map(([exId, sets, more]) => { const it = day.items.find(x => x[0] === exId); return { exId, rr: [it[2], it[3]], ps: it[1], sets: sets.map(([w, r, rir]) => ({ w: w * U, r, rir, done: true })), ...(more || {}) }; }) }; });
    if (o.maxLoad) S.exercises = S.exercises.map(e => (e.id === 'bench' ? { ...e, maxLoad: o.maxLoad * LB } : e));
    if (o.exInc) S.exercises = S.exercises.map(e => (o.exInc[e.id] ? { ...e, inc: o.exInc[e.id] * LB } : e));
    if (o.exSet) S.exercises = S.exercises.map(e => (o.exSet[e.id] ? { ...e, ...o.exSet[e.id] } : e));
    if (o.settings) Object.assign(S.settings, o.settings);
    if (o.exUnit) S.exercises = S.exercises.map(e => (o.exUnit[e.id] ? { ...e, unit: o.exUnit[e.id] } : e));
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
// The Guide's How targets are set, as its text reads.
const guideRules = P => P.page.evaluate(() => { window.__ironlog.ACT.guideOpen({ dataset: { topic: 'rules' } }); const t = (document.getElementById('modal') || {}).textContent.replace(/\s+/g, ' '); window.__ironlog.ACT.mClose(); return t; });
// A Lighter day started as a lifter starts one: Change on Today's card, then Lighter day.
async function startLighter(P) {
  await P.page.click('#view .hero [data-act="startAltOpen"]'); await wait(200);
  await P.page.click('#modal [data-act="altGo"][data-light="1"]'); await wait(250);
}
const shows = (P, exId) => P.page.evaluate(exId => {
  const L = window.__ironlog; const d = L.state.draft; const b = d.ex.findIndex(x => x.exId === exId); const blk = d.ex[b];
  const rows = blk.sets.map((s, si) => { const w = document.querySelector(`#view .sg input[data-f="w"][data-b="${b}"][data-s="${si}"]`), r = document.querySelector(`#view .sg input[data-f="r"][data-b="${b}"][data-s="${si}"]`); return { w: w ? Number(w.value || w.placeholder) : null, r: r ? Number(r.value || r.placeholder) : null }; });
  return { rows, tgt: blk.tgt, hint: blk.hint || '' };
}, exId);

/* The target line ("Today: ...") as the block shows it after − Set takes its last row (empty, so at once): the target
   counted over the sets left (session.ts targetText, which reads the engine's words with a pattern; NEW-122: a target
   the engine words another way would stop being restated, so each form the engine writes is checked here). */
async function restated(P, exId) {
  const b = await P.page.evaluate(exId => window.__ironlog.state.draft.ex.findIndex(x => x.exId === exId), exId);
  await P.page.click(`#view [data-act="sDel"][data-b="${b}"]`); await wait(200);
  return P.page.evaluate(b => { const h = document.querySelector(`#blk-${b} .hint b`); return h ? h.textContent.trim() : null; }, b);
}

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
/* A first guess well under the lifter: 200 x 15 x 3 at 5 in reserve against 6-10 at 0 in reserve. 5 or more is read as
   4, so the estimate is Epley's 200 x (1 + 19/30) = 327 lb and the load it gives for the middle of the range, 8, at 0 in
   reserve is 263 lb (Brzycki): far past either cap, so the cap alone sets the step. */
const DAY_EASY = [{ id: 'A', name: 'Push', items: [['bench', 3, 6, 10, 0]] }];
const EASY = [[200, 15, 5], [200, 15, 5], [200, 15, 5]];
const EASY_TO = loadFor(e1(200, 15 + 4), 8 + 0);
// The plates of Your gym made into the loads a 45 lb bar takes: the bar and pairs of those plates.
const barLoads = (plates, most = 600) => { let set = new Set([0]); for (const p of plates) for (let k = 0; k < 8; k++) set = new Set([...set, ...[...set].map(x => x + 2 * p)]); return [...set].map(x => 45 + x).filter(x => x <= most).sort((a, b) => a - b); };

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
    const t = await restated(P, 'bench');
    ok(t === 'Today: 17+ reps over 2 sets at 200 lb', 'P-8 with a set removed, the target counts the 2 left: "Today: 17+ reps over 2 sets at 200 lb" (NEW-122)', t);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-9')) {
    // One set under the range among the others shows the bottom of the range as its grey reps.
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 9, 2], [200, 9, 2], [200, 4, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && s.rows[2].r === 6 && s.rows[0].r === 9 && s.rows[1].r === 9, 'P-9 200 x 9, 9, 4: the same load, grey reps 9, 9 and the bottom of the range, 6, for the set that fell short', s);
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
    /* Short by any amount two sessions running at one load: down, the same way. 200 x 5 x 3 at 2 in reserve, 1 short
       of 6: an estimate of 200 x 36 / 30 = 240 lb, which gives 193 lb for 6 at 2 in reserve, so 190 in whole steps.
       One such session alone holds (a guard): the reps to beat, 15. */
    const SHORT = [[200, 5, 2], [200, 5, 2], [200, 5, 2]];
    const down = stepsDown(loadFor(e1(200, 5 + 2), 6 + 2), BAR_STEP_LB);
    for (const [n, w, why] of [[1, 200, 'one session'], [2, down, 'two sessions running']]) {
      const Q = await lifter(DAY_BENCH, weeks('A', SHORT, n));
      await startOn(Q, 0);
      const t = await shows(Q, 'bench');
      ok(t.rows.every(r => r.w === w) && (n === 2 || (t.tgt && t.tgt.kind === 'reps' && t.tgt.total === 15)), `P-10 ${why} of 200 x 5 x 3 on 6-10, one short: ${w} lb${n === 1 ? ' and 15 reps to beat (a guard)' : ', down in whole steps'}`, t);
      await Q.ctx.close(); await Q.browser.close();
    }
    // With the reps creeping up, four sessions short at one load drop it, and three hold.
    const CREEP = [[4, 4, 4], [4, 4, 5], [4, 5, 5], [5, 5, 5]].map(rs => rs.map(r => [200, r, 2]));
    for (const [from, w] of [[1, 200], [0, down]]) {
      const Q = await lifter(DAY_BENCH, CREEP.slice(from).map((sets, k, a) => [addD(DAY, -7 * (a.length - k)), 'A', [['bench', sets]]]));
      await startOn(Q, 0);
      const t = await shows(Q, 'bench');
      ok(t.rows.every(r => r.w === w), `P-10 ${4 - from} sessions short at 200 lb with the reps creeping up to 5, 5, 5: ${w} lb${from ? ' (a guard: under four, the load holds)' : ''}`, t);
      await Q.ctx.close(); await Q.browser.close();
    }
    // The first time in a range: 200 x 5 x 3 on a 3-5 day, then a 6-10 day never trained: down at once, to 190.
    const Q = await lifter([{ id: 'H', name: 'Heavy', items: [['bench', 3, 3, 5, 2]] }, { id: 'A', name: 'Volume', items: [['bench', 3, 6, 10, 2]] }], [[addD(DAY, -7), 'H', [['bench', SHORT]]]]);
    await startOn(Q, 1);
    const t = await shows(Q, 'bench');
    ok(t.rows.every(r => r.w === down), `P-10 the first time in 6-10, after 200 x 5 x 3 on a 3-5 day: down to ${down} lb at once`, t);
    await Q.ctx.close(); await Q.browser.close();
  }


  if (run('P-11')) {
    /* Too easy, every top set 2 or more in reserve over the target: the estimate sets a heavier load, at most 10% more
       once the lift's load is found (its fifth session here): 263 lb is past the cap, so 220. */
    let P = await lifter(DAY_EASY, weeks('A', EASY, 4));
    await startOn(P, 0);
    let s = await shows(P, 'bench');
    let want = stepsDown(Math.min(EASY_TO, 200 * 1.1), BAR_STEP_LB);
    ok(want === 220 && s.rows.every(r => r.w === want), `P-11 the fifth session after 200 x 15 x 3 at 5 in reserve against 0: ${want} lb, the estimate's ${Math.round(EASY_TO)} lb capped at 10%`, s);
    await P.ctx.close(); await P.browser.close();
    /* 15% on an isolation lift under 20 kg: curls of 40 lb (18 kg) x 8 x 3 at 4 in reserve against 0, the estimate
       40 x (1 + 12/30) = 56 lb giving 45.1 lb for 8; under the 15% cap (46), so 45 on 5 lb dumbbells. At the 10% cap
       (44) it is under a step and the curl stays at 40, beating 24 reps. On 5 lb steps at 40 lb, 45 is what any cap
       from 12.5% to 24% gives, so this tells the light cap from the 10% one, not 15% from 20%. */
    P = await lifter([{ id: 'A', name: 'Arms', items: [['dbCurl', 3, 6, 10, 0]] }], weeks('A', [], 4).map(([d, k]) => [d, k, [['dbCurl', [[40, 8, 4], [40, 8, 4], [40, 8, 4]]]]]));
    await startOn(P, 0);
    s = await shows(P, 'dbCurl');
    want = stepsDown(Math.min(loadFor(e1(40, 8 + 4), 8 + 0), 40 * 1.15), 5);
    ok(want === 45 && stepsDown(Math.min(loadFor(e1(40, 8 + 4), 8 + 0), 40 * 1.1), 5) === 40 && s.rows.every(r => r.w === want), `P-11 40 lb curls x 8 x 3 at 4 in reserve against 0, four sessions: ${want} lb, past the 10% cap, as an isolation lift under 20 kg is capped at 15%`, s);
    await P.ctx.close(); await P.browser.close();
    /* Every set at 5 or more in reserve: at least one step, even where the estimate gives none. 200 x 6 x 3 at 5 against
       2: 200 x 36 / 27 = 267 lb, which gives 200 for 8 at 2 in reserve, no step; still 210. */
    P = await lifter(DAY_BENCH, weeks('A', [[200, 6, 5], [200, 6, 5], [200, 6, 5]], 4));
    await startOn(P, 0);
    s = await shows(P, 'bench');
    ok(Math.round(loadFor(e1(200, 6 + 4), 8 + 2)) === 200 && s.rows.every(r => r.w === 200 + BAR_STEP_LB), 'P-11 200 x 6 x 3 at 5 in reserve against 2, where the estimate gives 200 lb: still one step, 210 lb', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-12')) {
    /* The first 3 sessions find the load: the cap on a step up from the estimate is 25% there (250 lb here), 10% after
       (220, P-11). They count again after a break and after a session marked New machine or gym. */
    const cases = [
      ['after three sessions', weeks('A', EASY, 3)],
      ['after a session back from eight weeks off, the fourth before it', [...weeks('A', EASY, 4).map(([d, k, e]) => [addD(d, -56), k, e]), [addD(DAY, -7), 'A', [['bench', EASY]]]]],
      ['after a session marked New machine or gym, the fourth before it', weeks('A', EASY, 5).map(([d, k, e], i) => (i === 4 ? [d, k, [['bench', EASY, { nw: true }]]] : [d, k, e]))]
    ];
    const want = stepsDown(Math.min(EASY_TO, 200 * 1.25), BAR_STEP_LB);
    for (const [why, hist] of cases) {
      const P = await lifter(DAY_EASY, hist);
      await startOn(P, 0);
      const s = await shows(P, 'bench');
      ok(want === 250 && s.rows.every(r => r.w === want), `P-12 ${why}, 200 x 15 x 3 at 5 in reserve against 0: ${want} lb, the estimate's ${Math.round(EASY_TO)} lb capped at 25%`, s);
      await P.ctx.close(); await P.browser.close();
    }
  }
  if (run('P-14')) {
    // At the heaviest load available: more reps, not more load.
    let P = await lifter(DAY_BENCH, weeks('A', [[200, 10, 2], [200, 10, 2], [200, 10, 2]]), { maxLoad: 200 });
    await startOn(P, 0);
    let s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 30, 'P-14 the heaviest available is 200 lb, 200 x 10 x 3 at the top: the same 200 lb, 30 reps to beat (the target is the total to beat, as in P-8)', s);
    const t14 = await restated(P, 'bench');
    ok(t14 === 'Today: 21+ reps over 2 sets at 200 lb, the heaviest available', 'P-14 with a set removed, the target counts the 2 left and still says why the load holds: "Today: 21+ reps over 2 sets at 200 lb, the heaviest available" (NEW-122)', t14);
    await P.ctx.close(); await P.browser.close();
    // Then harder reps: every set about 40% past the top (10 + 4 = 14), the next step is a harder rep, not load.
    P = await lifter(DAY_BENCH, weeks('A', [[200, 14, 2], [200, 14, 2], [200, 14, 2]]), { maxLoad: 200 });
    await startOn(P, 0);
    s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && /make each rep harder/.test(s.hint), 'P-14 at the heaviest, every set at 14 on 6-10: the same 200 lb, and each rep made harder', s);
    await P.ctx.close(); await P.browser.close();
    // A load step of 0 (a fixed load): reps, the same way, and never "add 0 lb".
    P = await lifter([{ id: 'A', name: 'Push', items: [['bench', 3, 6, 10, 2, { inc: 0 }]] }], weeks('A', [[200, 10, 2], [200, 10, 2], [200, 10, 2]]));
    await startOn(P, 0);
    s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 30 && !/add 0/.test(s.hint), 'P-14 a load step of 0, 200 x 10 x 3 at the top: the same 200 lb, 30 reps to beat', s);
    await P.ctx.close(); await P.browser.close();
  }

  if (run('P-15')) {
    // A bodyweight lift never done with added load progresses by reps; the app never adds load.
    let P = await lifter([{ id: 'A', name: 'Pull', items: [['pullup', 3, 6, 10, 2]] }], weeks('A', []).map(([d, k]) => [d, k, [['pullup', [[0, 10, 2], [0, 10, 2], [0, 10, 2]]]]]));
    await startOn(P, 0);
    let s = await shows(P, 'pullup');
    ok(s.rows.every(r => !(r.w > 0)) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 30, 'P-15 pull-ups at bodyweight, 10 x 3 at the top: no added load, 30 reps to beat', s);
    await P.ctx.close(); await P.browser.close();
    /* Assisted: less help is progress. 50 lb of help, 10 x 3 at the top: one step of help off, so 45 lb of help (a
       bodyweight lift's step is 5 lb, docs/EVIDENCE.md, load steps; 2.5% of the 130 lb lifted is under it). */
    P = await lifter([{ id: 'A', name: 'Pull', items: [['assistPullup', 3, 6, 10, 2]] }], weeks('A', []).map(([d, k]) => [d, k, [['assistPullup', [[-50, 10, 2], [-50, 10, 2], [-50, 10, 2]]]]]), { bw: 180 });
    await startOn(P, 0);
    s = await shows(P, 'assistPullup');
    ok(s.tgt && s.tgt.kind === 'load' && Math.round(s.tgt.w / 0.45359237) === -45 && s.rows.every(r => r.w === 45) && /help off/.test(s.hint), 'P-15 assisted pull-ups with 50 lb of help, 10 x 3 at the top: 45 lb of help next, one 5 lb step off', s);
    const g15 = await guideRules(P);
    ok(/5 lb on anything else, including the help on an assisted machine/.test(g15), 'P-15 the Guide says the help on an assisted machine moves 5 lb at a time (it said a machine stack moves 10)', g15.slice(g15.indexOf('Load steps'), g15.indexOf('Load steps') + 300));
    await P.ctx.close(); await P.browser.close();
    // Timed holds: add seconds, then load. A plank held 45 s x 3 on 30-60 s: beat 135 s, no load.
    P = await lifter([{ id: 'A', name: 'Core', items: [['plank', 3, 30, 60, 0]] }], weeks('A', []).map(([d, k]) => [d, k, [['plank', [[0, 45, null], [0, 45, null], [0, 45, null]]]]]));
    await startOn(P, 0);
    s = await shows(P, 'plank');
    ok(s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 135 && !(s.tgt.w > 0), 'P-15 a plank of 45 s x 3 on 30-60 s: 135 s to beat at bodyweight', s);
    const t15 = await restated(P, 'plank');
    ok(t15 === 'Today: 91s+ over 2 holds at BW', 'P-15 with a hold removed, the target counts the 2 left: "Today: 91s+ over 2 holds at BW" (NEW-122)', t15);
    await P.ctx.close(); await P.browser.close();
    // A plank held with 10 lb on the back, 60 s x 3, the top: the load step added, 5 lb, so 15 lb.
    P = await lifter([{ id: 'A', name: 'Core', items: [['plank', 3, 30, 60, 0]] }], weeks('A', []).map(([d, k]) => [d, k, [['plank', [[10, 60, null], [10, 60, null], [10, 60, null]]]]]));
    await startOn(P, 0);
    s = await shows(P, 'plank');
    ok(s.tgt && s.tgt.kind === 'load' && Math.round(s.tgt.w / 0.45359237) === 15, 'P-15 a plank with 10 lb held 60 s x 3, the top of 30-60: 15 lb next', s);
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
    /* Two such sessions in a row become the new usual, weaker reps among them: after 6, 6, 6 twice, beat 18. Fewer
       sets than the plan asks stay short however often: after two sessions of two sets, the target is still 24 over 3. */
    for (const [why, last, total] of [['6, 6, 6 twice', [[200, 6, 2], [200, 6, 2], [200, 6, 2]], 18], ['two sets of three twice', [[200, 8, 2], [200, 8, 2]], 24]]) {
      const P = await lifter(DAY_BENCH, [...weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]], 3).map(([d, k, e]) => [addD(d, -14), k, e]), [addD(DAY, -14), 'A', [['bench', last]]], [addD(DAY, -7), 'A', [['bench', last]]]]);
      await startOn(P, 0);
      const s = await shows(P, 'bench');
      ok(s.rows.every(r => r.w === 200) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === total && s.tgt.n === 3, `P-16 after 200 x 8 x 3 as usual, then ${why}: ${total} reps over 3 sets to beat${total === 18 ? ', the new usual' : ', as fewer sets stay short'}`, s);
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
    // More than 4 weeks off, up to 6 months: 90% of the last working weight in whole steps, 2 or more in reserve.
    const PRE = [[200, 8, 2], [200, 8, 2], [200, 8, 2]];
    let P = await lifter(DAY_BENCH, weeks('A', PRE).map(([d, k, e]) => [addD(d, -42), k, e]));
    await startOn(P, 0);
    let s = await shows(P, 'bench');
    const back = stepsDown(200 * 0.9, BAR_STEP_LB);
    ok(back === 180 && s.rows.every(r => r.w === back) && /2 or more/.test(s.hint), `P-20 seven weeks after 200 x 8 x 3: ${back} lb, 90% in whole steps, with 2 or more in reserve`, s);
    await P.ctx.close(); await P.browser.close();
    /* Each full session back then sets the next load from its own sets, never past the load from before the break.
       180 x 15 x 3 at 4 in reserve: 180 x (1 + 19/30) = 294 lb, which gives 220 lb for the 8 reps done before at 2 in
       reserve; never past 200. */
    P = await lifter(DAY_BENCH, [...weeks('A', PRE).map(([d, k, e]) => [addD(d, -56), k, e]), [addD(DAY, -7), 'A', [['bench', [[180, 15, 4], [180, 15, 4], [180, 15, 4]]]]]]);
    await startOn(P, 0);
    s = await shows(P, 'bench');
    ok(loadFor(e1(180, 15 + 4), 8 + 2) > 210 && s.rows.every(r => r.w === 200), 'P-20 after a first session back of 180 x 15 x 3 at 4 in reserve, whose estimate gives 220 lb: 200 lb, the load from before the break, no more', s);
    await P.ctx.close(); await P.browser.close();
    // The trend and the stall test restart from the first session back.
    const read = async hist => { const Q = await lifter(DAY_BENCH, hist); const r = await Q.page.evaluate(() => { const x = window.__ironlog.IDX().exStats.bench || {}; return { pct: x.pct, stalled: !!x.stalled }; }); await Q.ctx.close(); await Q.browser.close(); return r; };
    const flat = (n, w, end) => Array.from({ length: n }, (_, k) => [addD(DAY, -end - 7 * (n - 1 - k)), 'A', [['bench', [[w, 8, 2], [w, 8, 2], [w, 8, 2]]]]]);
    let r = await read([...flat(3, 200, 49), ...flat(2, 190, 7)]);
    ok(r.pct == null, 'P-20 two sessions back after five weeks off, three before: no trend yet, as it restarts', r);
    r = await read([...flat(3, 200, 21), ...flat(2, 190, 7)]);
    ok(r.pct != null, 'P-20 a guard: the same five sessions with no break have a trend', r);
    r = await read([...flat(6, 200, 56), ...flat(3, 180, 7)]);
    ok(!r.stalled, 'P-20 six flat sessions, five weeks off, then three flat sessions back: not stalled, as the test restarts', r);
    r = await read(flat(9, 200, 7));
    ok(r.stalled, 'P-20 a guard: nine flat sessions with no break are stalled', r);
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
    let P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]]));
    await startOn(P, 0);
    await tick(P, 0, 0, 200, 13, 2);
    let s = await shows(P, 'bench');
    ok(s.rows[1].w > 200 && s.rows[2].w > 200 && s.rows[1].w % BAR_STEP_LB === 0, 'P-23 200 x 13 at 2 in reserve on 6-10: the next sets are heavier, in whole steps', s);
    await P.ctx.close(); await P.browser.close();
    // 2 or more reps under the range and under what was asked: lighter. 200 x 4 at 2 when 8 was asked.
    P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]]));
    await startOn(P, 0);
    await tick(P, 0, 0, 200, 4, 2);
    s = await shows(P, 'bench');
    ok(s.rows[1].w < 200 && s.rows[2].w < 200 && s.rows[1].w >= 45 && s.rows[1].w % BAR_STEP_LB === 0, 'P-23 200 x 4 at 2 in reserve when 8 was asked on 6-10: the next sets are lighter, in whole steps', s);
    await P.ctx.close(); await P.browser.close();
    // Guards: one rep under the range, or the top at the target's reserve, is not clearly off, so nothing moves.
    for (const r of [5, 10]) {
      P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]]));
      await startOn(P, 0);
      await tick(P, 0, 0, 200, r, 2);
      s = await shows(P, 'bench');
      ok(s.rows[1].w === 200 && s.rows[2].w === 200, `P-23 a guard: 200 x ${r} at 2 in reserve on 6-10 is not clearly off, so the next sets stay at 200 lb`, s);
      await P.ctx.close(); await P.browser.close();
    }
    /* On a first session back, any set in the range that shows more strength moves them, never past the load from
       before the break: seven weeks after 200 x 8 x 3, asked 180, a set of 180 x 10 at 2 in reserve. */
    P = await lifter(DAY_BENCH, weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]]).map(([d, k, e]) => [addD(d, -42), k, e]));
    await startOn(P, 0);
    await tick(P, 0, 0, 180, 10, 2);
    s = await shows(P, 'bench');
    ok(s.rows[1].w > 180 && s.rows[1].w <= 200 && s.rows[2].w > 180 && s.rows[2].w <= 200, 'P-23 first session back, 180 x 10 at 2 in reserve: the next sets are heavier, and no more than the 200 lb from before the break', s);
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
    ok(s.rows.every(r => r.w === 200) && !s.tgt && /Injury flagged/.test(s.hint), 'P-28 chest flagged, bench 200 x 10 x 3 at the top: no target, last time\'s 200 lb, and the flag said', s);
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
    // And the Guide says the rule as the app keeps it, a break not counted (NEW-117: until 2.48 it said 6 weeks plain).
    const G = await lifter(DAY_BENCH, []);
    const g = await G.page.evaluate(() => { window.__ironlog.ACT.guideOpen({ dataset: { topic: 'rules' } }); return (document.getElementById('modal') || {}).textContent.replace(/\s+/g, ' '); });
    ok(/not used within 6 weeks of training before your latest session of the lift \(time on a break of more than 4 weeks is not counted\)/.test(g), 'P-2 the Guide says the 6 weeks are weeks of training, a break of more than 4 weeks not counted', g.slice(0, 120));
    await G.ctx.close(); await G.browser.close();
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
    // The line before and after a set is removed: the sets counted change, the engine's words around them stay.
    const before = await P.page.evaluate(() => { const h = document.querySelector('#blk-0 .hint b'); return h ? h.textContent.trim() : null; });
    const t6 = await restated(P, 'dbLateral');
    ok(/^Today: 46\+ reps over 3 sets at 15 lb per dumbbell, building to \d+ each$/.test(before || '') && t6 === before.replace('46+ reps over 3 sets', '31+ reps over 2 sets'), 'P-6 with a set removed, the target counts the 2 left and keeps what to build to: "Today: 31+ reps over 2 sets at 15 lb per dumbbell, building to ..." (NEW-122)', { before, t6 });
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-13')) {
    /* A close variation's first session starts from the related lift's last session in 120 days: the load for the
       middle of the range at the target's reserve and 1 more (erring light, FATIGUE_RIR), from 90% of its estimate on an
       isolation lift and 80% on a compound one, in whole steps down. DB curls of 35 x 10 x 3 at 2: 35 x (1 + 12/30) =
       49 lb, 90% is 44.1, which gives 30.8 lb for 10 at 3 in reserve, so 30 on 5 lb dumbbells. */
    let P = await lifter([{ id: 'A', name: 'Arms', items: [['hammer', 3, 8, 12, 2], ['dbCurl', 3, 8, 12, 2]] }], weeks('A', []).map(([d, k]) => [d, k, [['dbCurl', [[35, 10, 2], [35, 10, 2], [35, 10, 2]]]]]));
    await startOn(P, 0);
    let s = await shows(P, 'hammer');
    let want = stepsDown(loadFor(e1(35, 10 + 2) * 0.9, 10 + 2 + 1), 5);
    ok(want === 30 && s.rows.every(r => r.w === want) && /DB Curl/.test(s.hint), `P-13 a hammer curl's first session after DB curls of 35 x 10 x 3: ${want} lb, from 90% of the curl's estimate, naming the DB Curl`, s);
    await P.ctx.close(); await P.browser.close();
    // A compound lift, 80%: bench 225 x 10 x 3 at 2, 225 x 1.4 = 315 lb, 80% is 252, which gives 184 lb for 8 at 3, so 180.
    P = await lifter([{ id: 'A', name: 'Push', items: [['pauseBench', 3, 6, 10, 2], ['bench', 3, 6, 10, 2]] }], weeks('A', [[225, 10, 2], [225, 10, 2], [225, 10, 2]]));
    await startOn(P, 0);
    s = await shows(P, 'pauseBench');
    want = stepsDown(loadFor(e1(225, 10 + 2) * 0.8, 8 + 2 + 1), BAR_STEP_LB);
    ok(want === 180 && s.rows.every(r => r.w === want) && /Barbell Bench Press/.test(s.hint), `P-13 a paused bench's first session after bench at 225 x 10 x 3: ${want} lb, from 80% of the bench's estimate`, s);
    await P.ctx.close(); await P.browser.close();
    // Machines and cables start fresh: a machine chest press after the same bench is a first time.
    P = await lifter([{ id: 'A', name: 'Push', items: [['machPress', 3, 6, 10, 2], ['bench', 3, 6, 10, 2]] }], weeks('A', [[225, 10, 2], [225, 10, 2], [225, 10, 2]]));
    await startOn(P, 0);
    s = await shows(P, 'machPress');
    ok(/^First time/.test(s.hint) && !/Bench/.test(s.hint), 'P-13 a machine chest press after bench: a first time, nothing taken from the bench', s);
    await P.ctx.close(); await P.browser.close();
    // Only the last 120 days: the same curls last done 127 days ago give the hammer curl nothing.
    P = await lifter([{ id: 'A', name: 'Arms', items: [['hammer', 3, 8, 12, 2], ['dbCurl', 3, 8, 12, 2]] }], weeks('A', []).map(([d, k]) => [addD(d, -120), k, [['dbCurl', [[35, 10, 2], [35, 10, 2], [35, 10, 2]]]]]));
    await startOn(P, 0);
    s = await shows(P, 'hammer');
    ok(/^First time/.test(s.hint) && !/DB Curl/.test(s.hint), 'P-13 a guard: DB curls last done 127 days ago, past 120, give the hammer curl nothing: a first time', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-13')) {
    /* Moved whole from tests/r32b.js's part 2 (r32.1, 2026-10-07), every check kept and named by its rule: the first
       session of a close variation (a hammer curl after DB curls) starts from the related lift's last full session,
       conservatively; unrelated lifts, machines, cables and one-leg work still start fresh. Seeded and read through
       the engine as r32.1 wrote it, then through the screen: a swap to hammer curls shows that start in grey. */
    const okP = (c, m, x) => ok(c, 'P-13 ' + m, x);
    const mk = (id, d, exId, sets, rr, extra) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ...(extra || {}), ex: [{ exId, rr, sets: sets.map(([w, r, rir]) => ({ w, r, rir, done: true })) }] });
    const P = await open(FILE, { clock: '2026-10-07T10:00:00' });
    const r = await P.page.evaluate(([mkS]) => {
      const mk = eval(mkS); const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg'; s.settings.rirMode = 'on'; s.draft = null;
      s.sessions = [mk('a', '2026-10-01', 'dbCurl', [[16, 10, 1], [16, 10, 1], [16, 9, 1]], [8, 12]), mk('b', '2026-09-30', 'backSquat', [[120, 8, 2], [120, 8, 2], [120, 7, 2]], [6, 10]), mk('c', '2026-09-29', 'bench', [[100, 8, 1], [100, 7, 1]], [6, 10])];
      L.invalidate();
      const P8 = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 }, P6 = { sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 180, inc: 2.5 };
      const g = (id, pl) => { const x = L.suggest(id, pl, {}); return { w: x.w, t: x.text, kin: x.kin || null }; };
      const o = { hammer: g('hammer', P8), incCurl: g('inclineCurl', P8), front: g('frontSquat', P6), inc: g('incBench', P6), cable: g('cableCurl', P8), lunge: g('walkingLunge', P6), dbB: g('dbBench', P6), bb: g('bbCurl', P8), self: g('dbCurl', P8) };
      // Expected by hand: DB curl 16 x 10 at 1 RIR is 11 to failure, Epley 16 x 1.3667 = 21.87; 90% is 19.68; for 10 reps at 2 RIR (12): 19.68 / 1.4 = 14.06, down to 14 on the 2 kg rack.
      // Back squat 120 x 8 at 2 RIR (10, Brzycki): 120 x 36 / 27 = 160; 80% is 128; for 8 reps at 3 RIR (11, Epley): 128 / 1.3667 = 93.66, down to 92.5.
      // Bench 100 x 8 at 1 RIR (9): 100 x 36 / 28 = 128.57; 80% is 102.86; at 11: 75.26, down to 75.
      // A related lift trained only 130 days ago is too old; one whose last session was a deload uses the full one before it.
      s.sessions = [mk('o', '2026-05-30', 'dbCurl', [[16, 10, 1]], [8, 12])]; L.invalidate(); o.old = g('hammer', P8);
      s.sessions = [mk('f', '2026-09-24', 'dbCurl', [[16, 10, 1], [16, 10, 1]], [8, 12]), mk('d', '2026-10-01', 'dbCurl', [[8, 10, 4]], [8, 12], { deload: true })]; L.invalidate(); o.dl = g('hammer', P8);
      // In lb on a 5 lb rack: 35 x 10 at 1 RIR gives 30 (35 x 1.3667 x 0.9 / 1.4 = 30.75).
      s.settings.unit = 'lb'; const LB = 0.45359237;
      s.sessions = [mk('l', '2026-10-01', 'dbCurl', [[35 * LB, 10, 1], [35 * LB, 10, 1]], [8, 12])]; L.invalidate(); o.lb = g('hammer', { ...P8, inc: 5 * LB }); o.lbD = o.lb.w / LB;
      s.settings.unit = 'kg';
      // A Lighter day or a deload on a never-logged variation: 90% of the start, never the full start (r32 rule 193).
      s.sessions = [mk('a2', '2026-10-01', 'dbCurl', [[16, 10, 1], [16, 10, 1], [16, 9, 1]], [8, 12])]; L.invalidate();
      const lt = L.suggest('hammer', P8, { light: true }), de = L.suggest('hammer', P8, { deload: true });
      o.light = { w: lt.w, t: lt.text, r: lt.lastR }; o.deload = { w: de.w, t: de.text };
      return o;
    }, [mk.toString()]);
    okP(r.hammer.w === 14 && r.hammer.kin === 'dbCurl' && /from your DB Curl \(16×10, Oct 1\)/.test(r.hammer.t), 'a hammer curl after DB curl 16 x 10 starts at 14 kg, worked out by hand, and says where it came from', r.hammer);
    okP(r.incCurl.w === 14, 'an incline DB curl the same way', r.incCurl);
    okP(r.front.w === 92.5 && r.front.kin === 'backSquat', 'a front squat after back squat 120 x 8 starts at 92.5 kg (80% on a compound lift)', r.front);
    okP(r.inc.w === 75 && r.inc.kin === 'bench', 'an incline bench after bench 100 x 8 starts at 75 kg', r.inc);
    okP(r.cable.w == null && !r.cable.kin && /First time: pick a load/.test(r.cable.t), 'a cable curl starts fresh: a stack is not dumbbells', r.cable);
    okP(r.lunge.w == null && !r.lunge.kin, 'a walking lunge does not borrow from a back squat', r.lunge);
    okP(r.dbB.w == null && !r.dbB.kin, 'DB bench does not borrow from barbell bench (load per dumbbell, not total)', r.dbB);
    okP(r.bb.w == null && !r.bb.kin, 'a barbell curl does not borrow from DB curls', r.bb);
    okP(r.self.kin === null && !/First time/.test(r.self.t), 'the DB curl itself still reads its own history', r.self);
    okP(r.old.w == null && !r.old.kin, 'a related lift last trained over 120 days ago is not used', r.old);
    okP(r.dl.w === 14 && r.dl.kin === 'dbCurl' && /Sep 24/.test(r.dl.t), 'a deload session is skipped: the start comes from the full session before it', r.dl);
    okP(r.light.w === 12 && r.deload.w === 12 && /Lighter day\. About 12 kg per dumbbell for 8-12 with 3 or more reps in reserve, from your DB Curl/.test(r.light.t) && r.light.r.every(v => v === 8), 'on a Lighter day or a deload, a hammer curl after DB curls starts at 12 kg (90% of 14, down a step) for 8 with 3 or more in reserve', { l: r.light, d: r.deload });
    okP(Math.abs(r.lbD - 30) < 1e-6, 'in lb on a 5 lb rack, DB curl 35 x 10 gives a hammer curl of 30 lb', r.lb);

    // Through the screen: a session with DB curls, swapped for hammer curls; the grey load is 14.
    const sw = await P.page.evaluate(([mkS]) => {
      const mk = eval(mkS); const L = window.__ironlog; const s = L.state; s.settings.unit = 'kg'; s.draft = null;
      s.sessions = [mk('a', '2026-10-01', 'dbCurl', [[16, 10, 1], [16, 10, 1], [16, 9, 1]], [8, 12])]; L.invalidate();
      const R = s.routines[0]; R.days[0].items = [{ uid: 'c', exId: 'dbCurl', sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5, ss: null }];
      L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } });
      L.ACT.bSwap({ dataset: { b: '0' } }); return !!document.querySelector('#pickList');
    }, [mk.toString()]);
    okP(sw, 'the swap picker opens');
    const picked = await P.page.evaluate(() => { const q = document.querySelector('#pickQ, #pickList input, .sheet input[type="search"]'); const el = document.querySelector('#pickList .pick[data-ex="hammer"]'); if (el) { el.click(); return 'list'; } if (q) { q.value = 'hammer'; q.dispatchEvent(new Event('input', { bubbles: true })); return 'search'; } return null; });
    if (picked === 'search') { await P.page.waitForTimeout(150); await P.page.evaluate(() => { const el = document.querySelector('#pickList .pick[data-ex="hammer"]'); if (el) el.click(); }); }
    await P.page.waitForTimeout(200);
    const after = await P.page.evaluate(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; const wf = document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="0"]'); const x = L.suggest('hammer', b.plan, {}); return { id: b.exId, sw: b.sw, w: wf && (wf.value || wf.placeholder), want: x.w, kin: x.kin, plan: [b.plan.repMin, b.plan.repMax, b.plan.rir], text: document.querySelector('#view').innerText.includes('from your DB Curl') }; });
    okP(after.id === 'hammer' && after.kin === 'dbCurl' && after.want > 0 && Math.abs(after.sw - after.want) < 1e-9 && +after.w === after.want && after.text, 'swapped to hammer curls in a session: the grey load is the start from the DB curl for the plan it got (' + after.want + ' kg for ' + after.plan.slice(0, 2).join('-') + '), and the line names the DB curl', after);
    // Once a hammer curl session is logged, it goes by its own history.
    const own = await P.page.evaluate(([mkS]) => { const mk = eval(mkS); const L = window.__ironlog; L.state.draft = null; L.state.sessions.push(mk('h', '2026-10-04', 'hammer', [[14, 12, 1], [14, 12, 1], [14, 11, 1]], [8, 12])); L.invalidate(); const x = L.suggest('hammer', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 }, {}); return { kin: x.kin || null, t: x.text }; }, [mk.toString()]);
    okP(!own.kin && !/DB Curl/.test(own.t), 'after its first session the hammer curl reads its own history', own);
    okP(!P.errors.length, 'part 2 ran with no page errors', P.errors);
    await P.browser.close();
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
    const loadDue = async end => { const P = await lifter(DAY_BENCH, [0, 7, 14].map(k => [addD(DAY, -end - 14 + k), 'A', [['bench', [[225, 8, 1 + k / 7], [225, 8, 1 + k / 7], [225, 8, 1 + k / 7]]]]]));
      const t = await P.page.evaluate(() => { const L = window.__ironlog; L.ui.folds['today:session'] = true; L.render(); return document.getElementById('view').innerText; });
      await P.ctx.close(); await P.browser.close(); return t; };
    let t = await loadDue(50);
    ok(!/Load due/.test(t), 'P-22 six weeks after three sessions getting easier: no Load due on Today', t.slice(0, 400));
    t = await loadDue(7);
    ok(/Load due/.test(t), 'P-22 a guard: the same sessions ending last week say Load due', t.slice(0, 400));
    const P = await lifter(DAY_BENCH, []);
    const g22 = await guideRules(P);
    await P.ctx.close(); await P.browser.close();
    ok(/Load due/.test(g22) && /last three sessions/.test(g22) && /on a break/.test(g22), 'P-22 the Guide says what Load due is (three sessions at one load, reps held, reps in reserve rising) and that it is not shown on a break (it said nothing about it)', g22.slice(g22.indexOf('Load due'), g22.indexOf('Load due') + 400));
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
    let P = await lifter(DAY_BENCH, weeks('A', [[45, 10, 3], [45, 10, 3], [45, 10, 3]]));
    await startLighter(P);
    let s = await shows(P, 'bench');
    ok(s.rows.length > 0 && s.rows.every(r => r.w === 45), 'P-26 a Lighter day after 45 x 10 x 3 on the empty bar: 45 lb, never under the bar', s);
    await P.ctx.close(); await P.browser.close();
    /* Whole steps down from the load, to about 90%: 90% of 245 is 220.5, and three 10 lb steps down from 245 is the
       first at or under it, 215. With Your gym's 45 and 25 lb plates only, a lighter load they make. */
    const lighter = (w, step) => w - Math.ceil((w - w * 0.9) / step - 1e-9) * step;
    const BENCH245 = weeks('A', [[245, 10, 2], [245, 10, 2], [245, 10, 2]]);
    P = await lifter(DAY_BENCH, BENCH245);
    await startLighter(P);
    s = await shows(P, 'bench');
    ok(s.rows.length > 0 && s.rows.every(r => r.w === lighter(245, BAR_STEP_LB)), `P-26 a Lighter day after 245 x 10 x 3: ${lighter(245, BAR_STEP_LB)} lb, whole 10 lb steps down to about 90%`, s);
    await P.ctx.close(); await P.browser.close();
    const made = barLoads([45, 25]);
    P = await lifter(DAY_BENCH, BENCH245, { gym: { u: 'lb', plates: [45, 25] } });
    await startLighter(P);
    s = await shows(P, 'bench');
    ok(s.rows.length > 0 && s.rows.every(r => r.w < 245 && r.w >= 45 && made.includes(r.w)), `P-26 with only 45 and 25 lb plates, a Lighter day after 245 x 10 x 3: a lighter load the bar and those plates make (${made.filter(x => x < 245).slice(-4).join(', ')})`, s);
    await P.ctx.close(); await P.browser.close();
    // Your gym's dumbbells in tens: curls of 40, a Lighter day at about 36 is 30, the heaviest of the rack under it.
    const CURLS = weeks('A', [], 3).map(([d, k]) => [d, k, [['dbCurl', [[40, 10, 2], [40, 10, 2], [40, 10, 2]]]]]);
    P = await lifter([{ id: 'A', name: 'Arms', items: [['dbCurl', 3, 6, 10, 2]] }], CURLS, { gym: { u: 'lb', db: { lo: 10, hi: 120, st: 10 } } });
    await startLighter(P);
    s = await shows(P, 'dbCurl');
    ok(s.rows.length > 0 && s.rows.every(r => r.w === 30), 'P-26 dumbbells in tens, a Lighter day after curls of 40 x 10 x 3: 30 lb, on the rack', s);
    await P.ctx.close(); await P.browser.close();
  }

  if (run('P-27')) {
    // A change of units never moves a target by itself: 100 kg x 8 x 3 logged in kg, then the app switched to lb in Settings.
    const KG = weeks('A', [[100, 8, 2], [100, 8, 2], [100, 8, 2]]);
    let P = await lifter(DAY_BENCH, KG, { unit: 'kg' });
    await startOn(P, 0);
    let s = await shows(P, 'bench');
    ok(s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 24 && s.rows.every(r => r.w === 100), 'P-27 in kg, after 100 kg x 8 x 3: 100 kg and 24 reps to beat', s);
    await P.ctx.close(); await P.browser.close();
    P = await lifter(DAY_BENCH, KG, { unit: 'kg' });
    const prs = () => P.page.evaluate(() => JSON.stringify(window.__ironlog.IDX().prs.map(p => [p.sid, p.exId, p.big])));
    const before = await prs();
    // Settings, Measurements open (its section folded open as a tap on it leaves it), then Units set to lb.
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:general'] = true; L.render(); }); await wait(150);
    await P.page.selectOption('#view select[data-bind="unit"]', 'lb'); await wait(200);
    const unit = await P.page.evaluate(() => window.__ironlog.state.settings.unit);
    const after = await prs();
    ok(unit === 'lb' && after === before, 'P-27 switched to lb in Settings: the same PRs as before, none made by the change', { unit, before, after });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await wait(150);
    await startOn(P, 0);
    s = await shows(P, 'bench');
    // 100 kg is 220.46 lb, held on the lb step it is shown on (docs/EVIDENCE.md, load steps: 100 kg shown in lb holds at 220).
    ok(s.tgt && s.tgt.kind === 'reps' && s.tgt.total === 24 && s.rows.every(r => r.w === 220), 'P-27 then in lb: the same target, 24 reps, at 100 kg shown as 220 lb', s);
    await P.ctx.close(); await P.browser.close();
    // A change of gyms is never a PR: 250 x 8 x 3 on a session marked New machine or gym after 200 x 8 x 3.
    for (const nw of [true, false]) {
      const Q = await lifter(DAY_BENCH, [...weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]], 3).map(([d, k, e]) => [addD(d, -7), k, e]), [addD(DAY, -7), 'A', [['bench', [[250, 8, 2], [250, 8, 2], [250, 8, 2]], nw ? { nw: true } : {}]]]]);
      const n = await Q.page.evaluate(() => window.__ironlog.IDX().prs.filter(p => p.sid === 's3').length);
      ok(nw ? n === 0 : n > 0, nw ? 'P-27 250 x 8 x 3 on a session marked New machine or gym after 200 x 8 x 3: no PR' : 'P-27 a guard: the same 250 x 8 x 3 with no new gym is a PR', n);
      await Q.ctx.close(); await Q.browser.close();
    }
  }  if (run('P-29')) {
    /* Another gym changes nothing unless a lift is marked New machine or gym (V 2026-11-10: "Everything should stay as
       is unless the user explicitly marks it"). Marked, the lift starts over: the marked session is its baseline, no PR,
       and the next one beating it is a PR. The mark says when to use it, in one line (V 2026-11-10, "keep it simple"):
       only when loads don't compare; plates and dumbbells weigh the same anywhere. */
    const P = await lifter(DAY_BENCH, [...weeks('A', [[200, 8, 2], [200, 8, 2], [200, 8, 2]], 3).map(([d, k, e]) => [addD(d, -14), k, e]), [addD(DAY, -14), 'A', [['bench', [[150, 8, 2], [150, 8, 2], [150, 8, 2]], { nw: true }]]], [addD(DAY, -7), 'A', [['bench', [[160, 8, 2], [160, 8, 2], [160, 8, 2]]]]]]);
    const pr = await P.page.evaluate(() => { const p = window.__ironlog.IDX().prs; return { marked: p.filter(x => x.sid === 's3').length, next: p.filter(x => x.sid === 's4' && x.big).length }; });
    ok(pr.marked === 0 && pr.next > 0, 'P-29 after 200 x 8 x 3, 150 x 8 x 3 marked New machine or gym is no PR, and 160 x 8 x 3 the week after is one', pr);
    const g = await P.page.evaluate(() => { window.__ironlog.ACT.guideOpen({ dataset: { topic: 'rules' } }); return (document.getElementById('modal') || {}).textContent.replace(/\s+/g, ' '); });
    ok(/New machine or gym/.test(g) && /only when the loads there don.t compare/i.test(g) && /plates and dumbbells weigh the same/i.test(g), 'P-29 the Guide says when to mark New machine or gym: only when loads don\'t compare, as plates and dumbbells weigh the same anywhere', g.slice(g.indexOf('New machine or gym'), g.indexOf('New machine or gym') + 400));
    await P.page.evaluate(() => window.__ironlog.ACT.mClose());
    await startOn(P, 0);
    await P.page.click('#view [data-act="bMenu"][data-b="0"]'); await wait(200);
    await P.page.click('#modal [data-act="bMenuDo"][data-op="bNew"]'); await wait(200);
    const tip = await P.page.evaluate(() => { const t = document.querySelector('#blk-0 .tag[data-tip]'); return t ? t.getAttribute('data-tip') : ''; });
    ok(/only when the loads there don.t compare/i.test(tip), 'P-29 marked from the exercise\'s menu, its New machine tag says the same in its tip', tip);
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

  // ---- G. The engine's other branches (each a rule of the code, engine.ts, with V's rulings; the Guide is checked against them).
  const USUAL8 = [[200, 8, 2], [200, 8, 2], [200, 8, 2]];
  if (run('P-30')) {
    // The same lift twice in one day, in the same range: the same again, no step up within one day (sgSameDayIn).
    for (const [when, d, w] of [['earlier today', DAY, 200], ['yesterday (a guard)', addD(DAY, -1), 200 + BAR_STEP_LB]]) {
      const P = await lifter(DAY_BENCH, [...weeks('A', USUAL8, 3).map(([x, k, e]) => [addD(x, -7), k, e]), [d, 'A', [['bench', [[200, 10, 2], [200, 10, 2], [200, 10, 2]]]]]]);
      await startOn(P, 0);
      const s = await shows(P, 'bench');
      ok(s.rows.every(r => r.w === w) && (d === DAY ? !s.tgt && /^Earlier today/.test(s.hint) : true), `P-30 200 x 10 x 3 at the top ${when}: ${w} lb${d === DAY ? ', the same again, nothing to beat' : ''}`, s);
      await P.ctx.close(); await P.browser.close();
    }
  }
  if (run('P-31')) {
    /* Well past the range (every set 2 or more over the top, as after moving the range down): the load the estimate gives
       for the middle of the range, capped as P-11, in whole steps. 200 x 14 x 3 at 2 on 6-10, the fifth session:
       200 x (1 + 16/30) = 307 lb gives 230 for 8 at 2, capped at 10%: 220, where one step would be 210. */
    const P = await lifter(DAY_BENCH, weeks('A', [[200, 14, 2], [200, 14, 2], [200, 14, 2]], 4));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    const want = stepsDown(Math.min(loadFor(e1(200, 14 + 2), 8 + 2), 200 * 1.1), BAR_STEP_LB);
    ok(want === 220 && s.rows.every(r => r.w === want) && /well past/.test(s.hint), `P-31 200 x 14 x 3 on 6-10: ${want} lb, from the estimate, not one step`, s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-32')) {
    /* A bad day at a load done in the range the time before: every set under the range now, every set in it then, and
       not below its usual. Stay at the load and get back to the bottom of the range in every set, not one rep more
       than the bad day (sgBadDay). 200 x 5, 5, 6 and 5 sets of three on 6-10: the last at its usual of 5, the one
       before in the range. (A bad day below its usual repeats the last target instead, P-16.) */
    const reps = [5, 5, 6, 5];
    const P = await lifter(DAY_BENCH, reps.map((r, k) => [addD(DAY, -7 * (reps.length - k)), 'A', [['bench', [[200, r, 2], [200, r, 2], [200, r, 2]]]]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 200) && s.tgt && s.tgt.kind === 'load' && s.tgt.repMin === 6, 'P-32 200 x 5 x 3 after 200 x 6 x 3 on 6-10, at its usual: stay at 200 lb, 6 or more in every set', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-33')) {
    /* Back at the load from before a break in fewer sets than planned (the next sets moved up within the session, 180,
       190, 200 x 8): every planned set at that load next, for the fewest reps done there (V 2026-10-27, NEW-5). */
    const P = await lifter(DAY_BENCH, [...weeks('A', USUAL8).map(([x, k, e]) => [addD(x, -56), k, e]), [addD(DAY, -7), 'A', [['bench', [[180, 8, 2], [190, 8, 2], [200, 8, 2]]]]]]);
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.length === 3 && s.rows.every(r => r.w === 200) && s.tgt && s.tgt.kind === 'load' && s.tgt.repMin === 8, 'P-33 back after eight weeks at 180, 190 and 200 x 8: 200 lb in all 3 sets, 8 or more in each', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-34')) {
    /* No drop just after one step up while 3 or fewer reps short: a step that is large for the load starts below the
       range on purpose. 210 x 4 x 3 just after 200 x 8 x 3 holds at 210; the same 210 x 4 x 3 twice drops, to what its
       estimate gives for 6 at 2 in reserve: 210 x 36 / 31 = 244 lb, which gives 197, so 190 in whole steps from 210. */
    const SHORT = [[210, 4, 2], [210, 4, 2], [210, 4, 2]];
    const down = 210 - Math.ceil((210 - loadFor(e1(210, 4 + 2), 6 + 2)) / BAR_STEP_LB) * BAR_STEP_LB;
    for (const [why, hist, w] of [['just after the step up from 200', [...weeks('A', USUAL8, 2).map(([x, k, e]) => [addD(x, -7), k, e]), [addD(DAY, -7), 'A', [['bench', SHORT]]]], 210], ['a second time at 210', [...weeks('A', USUAL8, 2).map(([x, k, e]) => [addD(x, -14), k, e]), [addD(DAY, -14), 'A', [['bench', SHORT]]], [addD(DAY, -7), 'A', [['bench', SHORT]]]], down]]) {
      const P = await lifter(DAY_BENCH, hist);
      await startOn(P, 0);
      const s = await shows(P, 'bench');
      ok(s.rows.every(r => r.w === w), `P-34 210 x 4 x 3 on 6-10 ${why}: ${w} lb`, s);
      await P.ctx.close(); await P.browser.close();
    }
  }
  if (run('P-35')) {
    // The plan's own Load jump %: 10% at the top of the range on 200 lb is two 10 lb steps, 220 (2.5% gives one step).
    const P = await lifter([{ id: 'A', name: 'Push', items: [['bench', 3, 6, 10, 2, { jump: 10 }]] }], weeks('A', [[200, 10, 2], [200, 10, 2], [200, 10, 2]]));
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === stepUp(200, BAR_STEP_LB, 0.1)) && stepUp(200, BAR_STEP_LB, 0.1) === 220, 'P-35 Load jump 10% on the plan, 200 x 10 x 3 at the top: 220 lb', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-36')) {
    /* A deload week: half the sets rounded up, about 90% of what the normal day would ask in whole steps down, the bottom
       of the range. After 200 x 8 x 3: 2 sets of 180 lb for 6. */
    const P = await lifter(DAY_BENCH, weeks('A', USUAL8));
    await P.page.evaluate(() => { const L = window.__ironlog; L.state.deloadWeek = L.weekStart(L.today()); L.saveNow(); L.invalidate(); L.render(); }); await wait(100);
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.length === Math.ceil(3 / 2) && s.rows.every(r => r.w === 200 - Math.ceil((200 - 200 * 0.9) / BAR_STEP_LB) * BAR_STEP_LB && r.r === 6) && !s.tgt, 'P-36 a deload week after 200 x 8 x 3 on 6-10: 2 sets of 180 lb for 6, nothing to beat', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-37')) {
    // A flagged injury on a lift back after a break: the lower of last time's load and the way back's, in the injury's words.
    const P = await lifter(DAY_BENCH, weeks('A', USUAL8).map(([x, k, e]) => [addD(x, -42), k, e]), { inj: 'chest' });
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 180) && !s.tgt && /Injury flagged/.test(s.hint), 'P-37 chest flagged, bench back after seven weeks from 200 x 8 x 3: 180 lb, the way back\'s, with the flag said and nothing to beat', s);
    await P.ctx.close(); await P.browser.close();
  }

  // ---- E. Loads typed in the other unit (390, Release A): what was done quoted as typed, steps and rack weights of the
  // unit on screen, the reps aimed at the load asked.
  if (run('P-38')) {
    /* What was lifted is quoted as it was typed, in the Last line and the words after it; a difference across units, a
       conversion no plate makes, is never named: the load to go to is. 225 x 10 x 3 typed in lb, the app now in kg: bench
       goes up its step in kg, 5 kg (a bar's, docs/EVIDENCE.md), on the loads that exist in kg (2.5 kg steps from the
       20 kg bar): 102.06 + 5 is 107.06, nearest 107.5. */
    let P = await lifter(DAY_BENCH, weeks('A', [[225, 10, 2], [225, 10, 2], [225, 10, 2]]), { unit: 'kg', logUnit: 'lb' });
    await startOn(P, 0);
    let s = await shows(P, 'bench');
    const want = 20 + Math.round((225 * LBK + 5 - 20) / 2.5) * 2.5;
    const cells = await P.page.evaluate(() => [...document.querySelectorAll('#blk-0 .sg .ls')].map(e => e.textContent));
    ok(s.hint.startsWith('Last (Nov 3): 225 lb×10, 225 lb×10, 225 lb×10.') && cells.every(c => c === '225 lb×10') && cells.length === 3,
      'P-38 225 x 10 x 3 typed in lb, the app in kg: the Last line and the Last column say 225 lb, as typed', { hint: s.hint, cells });
    ok(want === 107.5 && s.rows.every(r => r.w === want) && s.hint.includes(`Every set at 225 lb hit 10: go to ${want} kg and aim for 6+ reps.`) && !/102\.1|add \d/.test(s.hint),
      'P-38 then the load to go to, 107.5 kg, never the conversion ("102.1 kg", "add 5.4 kg")', s);
    await P.ctx.close(); await P.browser.close();
    // A lifter who never changed units reads the Last line as before, no unit named.
    P = await lifter(DAY_BENCH, weeks('A', [[225, 10, 2], [225, 10, 2], [225, 10, 2]]));
    await startOn(P, 0);
    s = await shows(P, 'bench');
    ok(s.hint.startsWith('Last (Nov 3): 225×10, 225×10, 225×10. Every set at 225 lb hit 10: add 10 lb'), 'P-38 a guard: in one unit the Last line names no unit and the step is said', s.hint);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-39')) {
    /* A step set in one unit, read in the other, is that unit's matching step: the default (5 lb, 2.5 kg) doubled or halved
       to the nearest by ratio, so a 10 lb step is 5 kg, and the loads are those it makes from the bar, 20 kg and 5 kg
       steps. 225 x 10 x 3 in lb, the app in kg: 102.06 + 5 is 107.06, nearest 105 (110 is farther), never 106.6. */
    const want = 20 + Math.round((225 * LBK + 5 - 20) / 5) * 5;
    for (const [how, days, o] of [
      ['its own step', DAY_BENCH, { exInc: { bench: 10 } }],
      ['the plan\'s step', [{ id: 'A', name: 'Push', items: [['bench', 3, 6, 10, 2, { inc: 10 * LBK }]] }], {}]
    ]) {
      const P = await lifter(days, weeks('A', [[225, 10, 2], [225, 10, 2], [225, 10, 2]]), { unit: 'kg', logUnit: 'lb', ...o });
      await startOn(P, 0);
      const s = await shows(P, 'bench');
      ok(want === 105 && s.rows.every(r => r.w === want) && s.hint.includes(`go to ${want} kg`) && !/4\.5 kg|106\.6/.test(s.hint), `P-39 a 10 lb step as ${how}, the app in kg, after 225 x 10 x 3: 105 kg, a 5 kg step's load`, s);
      await P.ctx.close(); await P.browser.close();
    }
    const P = await lifter(DAY_BENCH, weeks('A', [[225, 10, 2], [225, 10, 2], [225, 10, 2]]), { exInc: { bench: 10 } });
    await startOn(P, 0);
    const s = await shows(P, 'bench');
    ok(s.rows.every(r => r.w === 235) && s.hint.includes('add 10 lb'), 'P-39 a guard: the same 10 lb step in lb, 235 lb', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-40')) {
    /* At the nearest load in the unit on screen, heavier or lighter than what was done, the reps to beat are those of
       equal effort there by the estimate, plus one, as beating last time is at the same load; where no set changes
       by a whole rep it is the same load and last time's total stands. Dumbbells in lb come in 5s. */
    const DAY_DB = [{ id: 'A', name: 'Push', items: [['dbBench', 3, 8, 12, 1]] }];
    const db = sets => Array.from({ length: 3 }, (_, k) => [addD(DAY, -7 * (3 - k)), 'A', [['dbBench', sets]]]);
    for (const [kg, side] of [[24, 'heavier'], [26, 'lighter']]) {
      const P = await lifter(DAY_DB, db([[kg, 10, 1], [kg, 10, 1], [kg, 9, 1]]), { logUnit: 'kg' });
      await startOn(P, 0);
      const s = await shows(P, 'dbBench');
      const at = kg / LBK, nw = Math.round(at / 5) * 5;
      const E = equalEffort(at, nw, [10, 10, 9], 1, 12);
      ok(nw === 55 && !E.same && s.rows.every(r => r.w === nw) && s.tgt && s.tgt.kind === 'reps' && s.tgt.total === E.total && JSON.stringify(s.tgt.rs) === JSON.stringify(E.rs)
        && s.hint.includes(`55 lb per dumbbell is the nearest load in lb to what you did: aim for ${E.total + 1}+ reps over 3 sets at 55 lb per dumbbell.`),
        `P-40 ${kg} kg x 10, 10, 9 at 1 in reserve, the app in lb: 55 lb, ${side}, ${E.total + 1}+ reps (equal effort there, plus one), not 30+`, { s, E });
      const t = await restated(P, 'dbBench');
      ok(t === `Today: ${E.rs[0] + E.rs[1] + 1}+ reps over 2 sets at 55 lb per dumbbell`, `P-40 ${kg} kg: with a set removed, the target counts the 2 left`, t);
      await P.ctx.close(); await P.browser.close();
    }
    // A guard: 50 lb dumbbells seen in kg are 22.5 kg, 0.8% lighter, within a rep: beat 29 as before.
    const P = await lifter(DAY_DB, db([[50, 10, 1], [50, 10, 1], [50, 9, 1]]), { unit: 'kg', logUnit: 'lb' });
    await startOn(P, 0);
    const s = await shows(P, 'dbBench');
    ok(equalEffort(50 * LBK, 22.5, [10, 10, 9], 1, 12).same && s.rows.every(r => r.w === 22.5) && s.tgt && s.tgt.total === 29, 'P-40 a guard: 50 lb x 10, 10, 9 seen in kg, 22.5 kg: within a rep, 29 to beat', s);
    await P.ctx.close(); await P.browser.close();
  }
  if (run('P-41')) {
    /* Your gym's rack in one unit and sets typed in the other: a load typed in the other unit is another rack's weight,
       so it goes to the nearest weight this rack has, with the reps aimed there (P-40), and at the top of the range the
       next weight up is the first heavier than it, not one past the bell it is near. A load typed in the unit on screen
       was lifted here and stays. */
    const DAY_DB = [{ id: 'A', name: 'Push', items: [['dbBench', 3, 8, 12, 1]] }];
    const db = sets => Array.from({ length: 3 }, (_, k) => [addD(DAY, -7 * (3 - k)), 'A', [['dbBench', sets]]]);
    const gym = { u: 'lb', db: { lo: 5, hi: 100, st: 5 } };
    let P = await lifter(DAY_DB, db([[24, 10, 1], [24, 10, 1], [24, 9, 1]]), { logUnit: 'kg', gym });
    await startOn(P, 0);
    let s = await shows(P, 'dbBench');
    const E = equalEffort(24 / LBK, 55, [10, 10, 9], 1, 12);
    ok(s.rows.every(r => r.w === 55) && s.tgt && s.tgt.total === E.total && s.hint.includes(`55 lb per dumbbell is the nearest weight on your rack to what you did: aim for ${E.total + 1}+ reps`),
      `P-41 Your gym's dumbbells in 5 lb steps, 24 kg x 10, 10, 9 typed in kg: 55 lb, the nearest the rack has, for ${E.total + 1}+, never 52.9 lb`, s);
    await P.ctx.close(); await P.browser.close();
    P = await lifter(DAY_DB, db([[24, 12, 1], [24, 12, 1], [24, 12, 1]]), { logUnit: 'kg', gym });
    await startOn(P, 0);
    s = await shows(P, 'dbBench');
    ok(s.rows.every(r => r.w === 55) && s.tgt && s.tgt.kind === 'load' && s.tgt.repMin === 8 && s.hint.includes('Every set at 24 kg per dumbbell hit 12: go to 55 lb per dumbbell and aim for 8+ reps.'),
      'P-41 at the top, 24 kg x 12 x 3: 55 lb for 8+, the first weight heavier, not 60 lb nor reps built at 52.9 lb', s);
    await P.ctx.close(); await P.browser.close();
    P = await lifter(DAY_DB, db([[52.5, 10, 1], [52.5, 10, 1], [52.5, 9, 1]]), { gym });
    await startOn(P, 0);
    s = await shows(P, 'dbBench');
    ok(s.rows.every(r => r.w === 52.5) && s.tgt && s.tgt.total === 29, 'P-41 a guard: 52.5 lb typed in lb, off the rack in 5s, was lifted and stays: 52.5 lb, 29 to beat', s);
    await P.ctx.close(); await P.browser.close();
    /* A load typed in the rack's own unit is one of its weights, whatever unit the app shows: at the top of the range the
       next weight is the rack's next, and under the range the load drops on the rack, as with the app in the rack's
       unit. Each case is run in both units and must agree: 45 kg on 1 kg steps goes to 46 (never 47), a lateral raise
       at 24 kg to 25 (never held for more reps), 110 lb on 2.5 lb steps to 112.5, 30 kg with the plan's 10% jump on
       2 kg steps to 32, and a lateral raise 2 reps under its range at 25 kg drops to 23. */
    const KG = { u: 'kg', db: { lo: 1, hi: 50, st: 1 } };
    const top = (exId, w, r) => Array.from({ length: 3 }, (_, k) => [addD(DAY, -7 * (3 - k)), 'A', [[exId, [[w, r, 1], [w, r, 1], [w, r, 1]]]]]);
    const under = [[20, 19], [22, 10], [22, 14], [25, 10]].map(([w, r], k) => [addD(DAY, -7 * (4 - k)), 'A', [['dbLateral', [[w, r, 1], [w, r, 1], [w, k === 2 ? 11 : r, 1]]]]]);
    for (const [name, gym, item, log, want] of [
      ['DB bench 45 kg x 12 x 3, dumbbells in 1 kg steps', KG, ['dbBench', 3, 8, 12, 1], top('dbBench', 45, 12), 46],
      ['lateral raise 24 kg x 15 x 3 on 12-15', KG, ['dbLateral', 3, 12, 15, 1], top('dbLateral', 24, 15), 25],
      ['DB bench 110 lb x 12 x 3, dumbbells in 2.5 lb steps', { u: 'lb', db: { lo: 2.5, hi: 150, st: 2.5 } }, ['dbBench', 3, 8, 12, 1], top('dbBench', 110, 12), 112.5 * LBK],
      ['DB bench 30 kg x 12 x 3 with a 10% jump, dumbbells in 2 kg steps', { u: 'kg', db: { lo: 2, hi: 50, st: 2 } }, ['dbBench', 3, 8, 12, 1, { jump: 10 }], top('dbBench', 30, 12), 32],
      ['lateral raise at 25 kg x 10 x 3 on 12-16, under the range', { u: 'kg', db: { lo: 1, hi: 40, st: 1 } }, ['dbLateral', 3, 12, 16, 1], under, 23]
    ]) {
      const got = {};
      for (const unit of ['kg', 'lb']) {
        P = await lifter([{ id: 'A', name: 'Day', items: [item] }], log, { unit, logUnit: gym.u, gym });
        await startOn(P, 0);
        s = await shows(P, item[0]);
        got[unit] = s.rows.map(r => (unit === 'lb' ? r.w * LBK : r.w));
        await P.ctx.close(); await P.browser.close();
      }
      ok(['kg', 'lb'].every(u => got[u].length === 3 && got[u].every(w => Math.abs(w - want) < 0.03)),
        `P-41 Your gym in ${gym.u}, the app in either unit, ${name}: ${+(gym.u === 'lb' ? want / LBK : want).toFixed(2)} ${gym.u}, the rack's own weight, in both`, got);
    }
  }

  if (run('P-42')) {
    /* Every other number set on a lift in one unit and read in the other is put on that unit's equipment, as its step is
       (P-39): a load goes to the nearest load of the unit's own step (5 lb, 2.5 kg), so a heaviest load or a goal of
       100 kg set in kg reads as 220 lb set in lb does, and a 20 kg bar, the lift's own or Settings', as the 45 lb bar.
       Each case beside the same lifter with the number set in lb, which must read alike. */
    const read = async (sets, o, light) => {
      const P = await lifter(DAY_BENCH, weeks('A', sets), o);
      if (light) await startLighter(P); else await startOn(P, 0);
      const s = await shows(P, 'bench');
      const goal = await P.page.evaluate(() => { const L = window.__ironlog; const g = L.goalState('bench'); return { line: L.goalLine('bench').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), hit: g && g.hit }; });
      await P.ctx.close(); await P.browser.close();
      return { ...s, goal };
    };
    const at = (w, r) => [[w, r, 2], [w, r, 2], [w, r, 2]];
    for (const [w, why] of [[215, 'a step under it'], [220, 'at it']]) {
      const kg = await read(at(w, 10), { exSet: { bench: { maxLoad: 100 } } }), lb = await read(at(w, 10), { exSet: { bench: { maxLoad: 220 * LBK } } });
      ok(kg.rows.every(r => r.w === 220) && kg.hint === lb.hint && JSON.stringify(kg.rows) === JSON.stringify(lb.rows) && !/220\.5|0\.5 lb|5\.5 lb/.test(kg.hint),
        `P-42 a heaviest load of 100 kg set in kg, the app in lb, ${why} (${w} lb x 10 x 3): 220 lb, as 220 lb set in lb reads`, { kg, lb });
    }
    const gk = await read(at(220, 5), { exSet: { bench: { goal: { w: 100, r: 5 } } } }), gl = await read(at(220, 5), { exSet: { bench: { goal: { w: 220 * LBK, r: 5 } } } });
    ok(gk.goal.hit && gk.goal.line === gl.goal.line && /Goal 220 lb × 5/.test(gk.goal.line), 'P-42 a goal of 100 kg x 5 set in kg, the app in lb, after 220 lb x 5 x 3: "Goal 220 lb × 5", reached, as 220 lb set in lb reads', { gk: gk.goal, gl: gl.goal });
    /* A goal read on the other unit's equipment can read heavier than it was set (225 lb is 102.06 kg, read 102.5), so it
       is reached by a set at it as set, as by a set at what it reads as: a change of unit never takes a goal reached
       away. */
    for (const [log, w, why] of [['lb', 225, '225 lb x 5 x 3, the goal as set'], ['kg', 102.5, '102.5 kg x 5 x 3, the goal as it reads']]) {
      const g = await read(at(w, 5), { unit: 'kg', logUnit: log, exSet: { bench: { goal: { w: 225 * LBK, r: 5 } } } });
      ok(g.goal.hit && /^Goal 102\.5 kg × 5 : reached/.test(g.goal.line), `P-42 a goal of 225 lb x 5 set in lb, the app in kg, after ${why}: "Goal 102.5 kg × 5", reached`, g.goal);
    }
    for (const [where, kgO, lbO] of [
      ['the lift\'s own', { exSet: { bench: { barKg: 20 } } }, { exSet: { bench: { barKg: 45 * LBK } } }],
      ['Settings\'', { settings: { barKg: 20 } }, { settings: { barKg: 45 * LBK } }]
    ]) {
      const bk = await read(at(50, 10), kgO, true), bl = await read(at(50, 10), lbO, true);
      ok(bk.rows.every(r => r.w === 45) && bk.hint === bl.hint && !/44\.1/.test(bk.hint), `P-42 ${where} bar of 20 kg set in kg, the app in lb, a Lighter day after 50 lb x 10 x 3: the 45 lb bar, as 45 lb set in lb reads`, { bk, bl });
    }
    /* A bar typed in the unit its field shows is the bar the lifter has and reads as typed, whatever unit Your gym is in:
       the app in lb and Your gym in kg, 45 typed in Settings' bar is the 45 lb bar, not the gym's 20 kg one, and 25
       typed as a lift's own bar is 25 lb, never 27.6 (12.5 kg). */
    const P = await lifter(DAY_BENCH, [], { gym: { u: 'kg', plates: [25, 20, 15, 10, 5, 2.5, 1.25] } });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); }); await wait(200);
    const q = '#view input[data-bind="barKg"]';
    await P.page.fill(q, '45'); await P.page.$eval(q, e => e.dispatchEvent(new Event('change', { bubbles: true }))); await wait(250);
    const st = await P.page.evaluate(() => { const L = window.__ironlog; return { field: document.querySelector('#view input[data-bind="barKg"]').value, lb: +(L.exBarKg(L.EX('bench')) / 0.45359237).toFixed(3) }; });
    ok(st.field === '45' && st.lb === 45, 'P-42 the app in lb, Your gym in kg: 45 typed in Settings\' bar reads 45 lb, as typed, for every bar lift', st);
    const edit = async v => {
      await P.page.evaluate(() => window.__ironlog.ACT.exEdit({ dataset: { ex: 'bench' } })); await wait(250);
      await P.page.evaluate(() => { const d = document.querySelector('#modal details.more'); if (d) d.open = true; });
      const f = '#modal input[data-ebind="barRaw"]'; const shown = await P.page.$eval(f, e => e.value);
      if (v != null) { await P.page.fill(f, v); await P.page.$eval(f, e => { e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }); await P.page.click('#modal [data-act="exSave"]'); }
      else await P.page.evaluate(() => window.__ironlog.ACT.mClose({ dataset: {} }));
      await wait(250); return shown;
    };
    await edit('25'); const shown = await edit(null);
    const own = await P.page.evaluate(() => { const L = window.__ironlog; return +(L.exBarKg(L.EX('bench')) / 0.45359237).toFixed(3); });
    ok(shown === '25' && own === 25, 'P-42 the app in lb, Your gym in kg: 25 typed as the lift\'s own bar reads 25 lb, as typed', { shown, own });
    await P.ctx.close(); await P.browser.close();
  }

  if (run('P-43')) {
    /* A lift marked in the other unit (390's Release B: its equipment is marked in kg in an lb gym) is worked out in its
       unit, every other lift in the app's: its step, its loads and its words, by P-38 to P-41. Bench marked kg in an lb
       app: after 100 kg x 8 x 3 typed in kg, 100 kg and 24 to beat, no conversion said; after 225 lb x 10 x 3 typed in
       lb, 107.5 kg (P-38's), last time quoted as typed. The raises beside it stay in lb. */
    const DAY2 = [{ id: 'A', name: 'Push', items: [['bench', 3, 6, 10, 2], ['dbLateral', 3, 12, 15, 2]] }];
    const two = (bench, raise) => Array.from({ length: 3 }, (_, k) => [addD(DAY, -7 * (3 - k)), 'A', [['bench', bench], ['dbLateral', raise]]]);
    let P = await lifter(DAY2, two([[100 / LBK, 8, 2], [100 / LBK, 8, 2], [100 / LBK, 8, 2]], [[20, 13, 2], [20, 13, 2], [20, 13, 2]]), { exUnit: { bench: 'kg' } });
    await startOn(P, 0);
    let s = await shows(P, 'bench');
    const r = await shows(P, 'dbLateral');
    const head = await P.page.evaluate(() => [...document.querySelectorAll('#view .sg.head [data-act="liftUnit"]')].map(e => e.textContent.trim().toUpperCase()));
    ok(s.rows.every(x => x.w === 100) && s.tgt && s.tgt.total === 24 && s.hint.includes('Beat 24 reps over 3 sets at 100 kg') && !/ lb/.test(s.hint),
      'P-43 bench marked kg in an lb app, after 100 kg x 8 x 3: 100 kg and 24 to beat, said in kg', s);
    ok(r.rows.every(x => x.w === 20) && /20 lb/.test(r.hint) && JSON.stringify(head) === JSON.stringify(['KG', 'LB EACH']),
      'P-43 the raises beside it stay in lb, and each heading names its lift\'s unit', { r, head });
    await P.ctx.close(); await P.browser.close();
    P = await lifter(DAY_BENCH, weeks('A', [[225, 10, 2], [225, 10, 2], [225, 10, 2]]), { exUnit: { bench: 'kg' } });
    await startOn(P, 0);
    s = await shows(P, 'bench');
    ok(s.rows.every(x => x.w === 107.5) && s.hint.includes('Every set at 225 lb hit 10: go to 107.5 kg'), 'P-43 bench marked kg after 225 lb x 10 x 3 typed in lb: 107.5 kg, last time as typed', s);
    await P.ctx.close(); await P.browser.close();
    /* At Your gym in lb, its plates and dumbbells in lb, bench marked kg is on kg's standard plates: after 100 kg x 10 x
       3 at the top of 6 to 10, its 5 kg step to 105 kg (the 20 kg bar and kg plates make it), not the nearest load lb
       plates make (230 lb, 104.3 kg). The raises stay on the gym's rack in 5s. */
    const gym = { u: 'lb', plates: [45, 35, 25, 10, 5, 2.5], db: { lo: 5, hi: 100, st: 5 } };
    P = await lifter(DAY2, two([[100 / LBK, 10, 2], [100 / LBK, 10, 2], [100 / LBK, 10, 2]], [[20, 13, 2], [20, 13, 2], [20, 13, 2]]), { exUnit: { bench: 'kg' }, gym });
    await startOn(P, 0);
    s = await shows(P, 'bench');
    const g2 = await shows(P, 'dbLateral');
    ok(s.rows.every(x => x.w === 105) && s.hint.includes('add 5 kg') && g2.rows.every(x => x.w === 20), 'P-43 bench marked kg at Your gym in lb: 105 kg on kg plates, not lb plates; the raises on the gym\'s rack', { s, g2 });
    await P.ctx.close(); await P.browser.close();
    /* A round trip drifts nothing and makes no PR either way (390's plan): 225 lb x 8 x 3, then bench marked kg and
       102.5 kg x 8 x 3, then back in lb and 225 lb x 8 x 3. */
    const rt = (n, unit) => [[225 * LBK, 8, 2], [102.5, 8, 2], [225 * LBK, 8, 2]].slice(0, n).map((x, k) => [addD(DAY, -7 * (n - k)), 'A', [['bench', [x, x, x]]]]);
    for (const [n, o, w, u] of [[2, { exUnit: { bench: 'kg' } }, 102.5, 'kg'], [3, {}, 225, 'lb']]) {
      P = await lifter(DAY_BENCH, rt(n), { logUnit: 'kg', ...o });
      await startOn(P, 0);
      s = await shows(P, 'bench');
      const prs = await P.page.evaluate(() => window.__ironlog.IDX().prs.filter(p => p.sid !== 's0').map(p => [p.sid, p.type]));
      ok(s.rows.every(x => x.w === w) && s.tgt && s.tgt.total === 24 && s.hint.includes(`Beat 24 reps over 3 sets at ${w} ${u}`) && !prs.length,
        `P-43 the round trip: after ${n === 2 ? '225 lb, then 102.5 kg marked kg' : '225 lb, 102.5 kg, then 225 lb back in lb'}, ${w} ${u} and 24 to beat, no PR`, { s, prs });
      await P.ctx.close(); await P.browser.close();
    }
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
