// r31 (V, 2026-10-05): the second independent review. Each finding is
// reproduced with the reviewer's own inputs and must now read right: a top
// single before back-off sets; an unmarked deload on a lift trained three
// times a week; Make it lighter after an exercise was done; load-finding in
// higher rep ranges; a Strong import on a first run; double progression at
// the top of the range; a trend from three sessions in nine days; a blank
// load called a warm-up; the first-time instruction; missed weeks in the
// average; accessory stalls and the deload advice; and the polish list
// (one-number ranges, "1 reps", the RIR check after a poor check-in, the
// toast over Discard, the grey-loads card with nothing grey, the region
// minimum, an import repeated in the other unit).
// Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const LB = 0.45359237;

// The reviewer's Strong export (rv/st/gen.py), rebuilt: Workout A and B three
// days a week for 8 weeks from Monday 2026-08-03, squat every day, the fifth
// week a deload nobody marked, one Friday missed, RPE on a few squat sets,
// ramp-up rows, a drop set, rest timers, planks and treadmill runs.
function strongCsv(weeks, name) {
  const rows = [['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE']];
  const add = (d, wn, ex, order, w, r, dist, sec, rpe) => rows.push([d + ' 18:05:12', wn, '1h 5m', ex, order, w, r, dist || 0, sec || 0, '', '', rpe || '']);
  const bench5 = [205, 210, 215, 220], sq = [245, 250, 255, 260, 0, 265, 270, 275], dl = [315, 325, 335, 345, 0, 355, 365, 375];
  const ohp = [115, 115, 120, 120, 0, 120, 125, 125], row = [155, 160, 165, 170, 0, 175, 175, 180];
  for (let wk = 0; wk < weeks; wk++) {
    const dl8 = wk === 4;
    for (const [wd, wn0] of [[0, 'Workout A'], [2, 'Workout B'], [4, 'Workout A']]) {
      if (wk === 2 && wd === 4) continue;
      const wn = name ? name(wn0) : wn0;
      const d = new Date(Date.UTC(2026, 7, 3 + 7 * wk + wd)).toISOString().slice(0, 10);
      const s = dl8 ? 205 : sq[wk];
      add(d, wn, 'Squat (Barbell)', 'W', 45, 10); add(d, wn, 'Squat (Barbell)', 'W', 135, 5); add(d, wn, 'Squat (Barbell)', 'W', 185, 3);
      for (let i = 0; i < 5; i++) {
        let r = 5, rpe = '', order = String(i + 1);
        if (wk === 7 && wd === 4 && i === 4) { r = 3; order = 'F'; }
        if ([1, 3, 6].includes(wk) && i === 4 && order !== 'F') rpe = wk !== 6 ? '8.5' : '9';
        add(d, wn, 'Squat (Barbell)', order, s, r, 0, 0, rpe);
      }
      if (wn0 === 'Workout A') {
        let sets;
        if (wk < 4) { const b = bench5[wk] + (wd === 4 ? 5 : 0); sets = Array(5).fill([b, 5]); }
        else if (dl8) sets = Array(3).fill([165, 5]);
        else { const b = 185 + 5 * (wk - 5); sets = { 5: [10, 9, 8], 6: [10, 10, 9], 7: [10, 10, 10] }[wk].map(x => [b, x]); }
        add(d, wn, 'Bench Press (Barbell)', 'W', 45, 10); add(d, wn, 'Bench Press (Barbell)', 'W', 135, 5);
        sets.forEach(([w, r], i) => add(d, wn, 'Bench Press (Barbell)', String(i + 1), w, r));
        const rw = dl8 ? 135 : row[wk]; for (let i = 0; i < 3; i++) add(d, wn, 'Bent Over Row (Barbell)', String(i + 1), rw, 8);
        [12, 11, 10].forEach((r, i) => add(d, wn, 'Lateral Raise (Dumbbell)', String(i + 1), 20, r));
        add(d, wn, 'Bicep Curl (Dumbbell)', '1', 35, 10); add(d, wn, 'Bicep Curl (Dumbbell)', '2', 35, 9); add(d, wn, 'Bicep Curl (Dumbbell)', 'D', 25, 8);
        add(d, wn, 'Rest Timer', '', 0, 0, 0, 90);
      } else {
        const o = dl8 ? 95 : ohp[wk]; for (let i = 0; i < 5; i++) add(d, wn, 'Overhead Press (Barbell)', String(i + 1), o, [3, 7].includes(wk) && i >= 3 ? 4 : 5);
        add(d, wn, 'Deadlift (Barbell)', 'W', 135, 5); add(d, wn, 'Deadlift (Barbell)', '1', dl8 ? 275 : dl[wk], 5);
        [8, 7, 6].forEach((r, i) => add(d, wn, 'Pull Up', String(i + 1), wk >= 5 ? 10 : 0, r));
        for (let i = 0; i < 3; i++) add(d, wn, 'Plank', String(i + 1), 0, 0, 0, 60);
        add(d, wn, 'Running (Treadmill)', '1', 0, 0, 2, 1200);
      }
    }
  }
  return rows.map(r => r.join(',')).join('\n');
}

(async () => {
  // ---- 1. A top single before back-off sets (the powerlifter, rv/pl/p1.js).
  {
    const P = await open('index.html', { clock: '2026-10-05T07:00:00', realStarter: true });
    const r = await P.page.evaluate(LB => {
      const L = window.__ironlog; const st = L.state; st.settings.onboarded = true;
      const R = L.routineFromTemplate('str5'); st.routines = [R]; st.activeRoutineId = R.id;
      const mk = (date, ex) => ({ id: 's' + date, date, dayIdx: 0, dayId: R.days[0].id, routineId: R.id, dayName: 'Strength A', ex: ex.map(([id, sets]) => ({ exId: id, rr: [5, 5], note: '', sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir: rir == null ? null : rir, warm: false, drop: false })) })) });
      const five = w => Array(5).fill([w, 5]);
      st.sessions = [mk('2026-09-21', [['backSquat', five(325)], ['bench', five(225)], ['bbRow', five(185)]]),
        mk('2026-09-25', [['backSquat', five(330)], ['bench', five(230)], ['bbRow', five(190)]]),
        mk('2026-09-30', [['backSquat', [[405, 1, 1], ...five(335)]], ['bench', [[275, 1, 0], [230, 5], [230, 5], [230, 5], [230, 4], [230, 4]]], ['bbRow', five(195)]])];
      L.state = L.normalize(st); L.invalidate(); L.saveNow();
      const plan = { sets: 5, repMin: 5, repMax: 5, rir: 2, rest: 180, inc: 5 * LB };
      const sq = L.suggest('backSquat', plan), be = L.suggest('bench', plan);
      const I = L.IDX();
      return { sq: { w: Math.round(sq.w / LB), text: sq.text, lastR: sq.lastR }, be: { w: Math.round(be.w / LB), text: be.text, lastR: be.lastR },
        prs: I.prs.filter(p => p.date === '2026-09-30').map(p => [p.exId, p.type]), sqBest: Math.round(I.exStats.backSquat.bestAll / LB),
        sqTrend: { pct: I.exStats.backSquat.pct, wN: I.exStats.backSquat.wN }, bench: L.exHeadline('bench') };
    }, LB);
    ok(r.sq.w === 340 && !/Drop to|below your/.test(r.sq.text), 'squat 405 x 1 then 335 x 5 x 5: the target builds on the 5 x 5 (340 lb), never "drop to 345"', r.sq);
    ok(JSON.stringify(r.sq.lastR) === '[5,5,5,5,5]', 'grey reps follow the five working sets, not the single', r.sq.lastR);
    ok(r.be.w === 230 && !/225/.test(r.be.text), 'bench 275 x 1 then 230 x 5,5,5,4,4: same 230 lb, beat the reps (not 225)', r.be);
    ok(r.prs.some(p => p[0] === 'backSquat') && r.sqBest >= 405, 'the single still counts for bests and PRs', r);
    // Re-review: the heavy set done twice (two singles, two triples) is still a top set (rv/pl/p3.js).
    const r2 = await P.page.evaluate(LB => {
      const L = window.__ironlog; const st = L.state; const R = st.routines[0];
      const mk = (date, sets) => ({ id: 'q' + date, date, dayIdx: 0, dayId: R.days[0].id, routineId: R.id, dayName: 'Strength A', ex: [{ exId: 'backSquat', rr: [5, 5], note: '', sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir: rir == null ? null : rir, warm: false, drop: false })) }] });
      const plan = { sets: 5, repMin: 5, repMax: 5, rir: 2, rest: 180, inc: 5 * LB }; const five = w => Array(5).fill([w, 5]);
      const run = sets => { st.sessions = [mk('2026-09-25', five(330)), mk('2026-09-30', sets)]; L.state = L.normalize(st); L.invalidate(); const g = L.suggest('backSquat', plan); return { w: Math.round(g.w / LB), text: g.text }; };
      const out = { A: run([[405, 1, 1], [405, 1, 1], ...five(335)]), B: run([[255, 3], [255, 3], ...five(225)]), C: run([[365, 4, 2], ...five(335)]) };
      // A 3-5 plan (what an import gives a 5 x 5 squat): 385 x 2, then 335 x 5 x 5 (rv/pl/p6.js).
      st.sessions = [mk('2026-09-25', five(330)), mk('2026-09-30', [[385, 2], ...five(335)])]; L.state = L.normalize(st); L.invalidate();
      const d = L.suggest('backSquat', { ...plan, repMin: 3, repMax: 5 }); out.D = { w: Math.round(d.w / LB), text: d.text, lastR: d.lastR };
      // Unmarked warm-ups done twice at a light load, then one working set (a deadlift): the working set is the work.
      st.sessions = [mk('2026-09-30', [[135, 5], [135, 5], [225, 3], [345, 5]])]; L.state = L.normalize(st); L.invalidate();
      const e = L.suggest('backSquat', { sets: 1, repMin: 3, repMax: 5, rir: 2, rest: 180, inc: 5 * LB }); out.E = Math.round(e.w / LB);
      // Fourth pass: weighted pull-ups with lighter back-offs, at 180 lb bodyweight (rv/fmt/cases1.js).
      st.bodyweights = [{ id: 'bw1', date: '2026-09-01', kg: 180 * LB }];
      const pu = (date, sets) => ({ id: 'p' + date, date, dayIdx: 0, dayId: R.days[0].id, routineId: R.id, dayName: 'Strength A', ex: [{ exId: 'pullup', rr: [5, 8], note: '', sets: sets.map(([w, r]) => ({ w: w * LB, r, rir: null, warm: false, drop: false })) }] });
      st.sessions = [pu('2026-09-14', [[45, 5], [25, 8], [25, 8], [25, 8]]), pu('2026-09-21', [[45, 5], [25, 8], [25, 8], [25, 8]]), pu('2026-09-28', [[50, 5], [25, 8], [25, 8], [25, 8]])];
      L.state = L.normalize(st); L.invalidate();
      const pp = { sets: 4, repMin: 5, repMax: 8, rir: 1, rest: 180, inc: 5 * LB }; const g = L.suggest('pullup', pp); out.PU = { w: Math.round(g.w / LB), text: g.text };
      // A reverse pyramid: grey reps never ask, at the top load, for reps done at a lighter one.
      st.sessions = [{ id: 'rp', date: '2026-09-28', dayIdx: 0, dayId: R.days[0].id, routineId: R.id, dayName: 'Strength A', ex: [{ exId: 'bench', rr: [6, 10], note: '', sets: [[225, 7], [205, 8], [185, 10]].map(([w, r]) => ({ w: w * LB, r, rir: null, warm: false, drop: false })) }] }];
      L.state = L.normalize(st); L.invalidate();
      const blk = L.newBlock('bench', { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB }, {});
      out.RP = { w: Math.round(blk.sw / LB), grey: blk.sets.filter(x => !x.warm).map((x, i) => L.greyR(blk, blk.sets.indexOf(x))) };
      return out;
    }, LB);
    ok(r2.PU.w === 25 || r2.PU.w === 30, 'weighted pull-up +50 x 5 then +25 x 8 x 3 at 180 lb bodyweight: the back-offs at +25 are the work, never +50 for every set', r2.PU);
    ok(r2.RP.grey[0] === 7 && r2.RP.grey.slice(1).every(v => v <= 7), 'reverse pyramid 225 x 7, 205 x 8, 185 x 10: grey reps at 225 never ask for 8 or 10', r2.RP);
    ok(r2.C.w === 340 && !/365/.test(r2.C.text.replace(/^Last[^.]*\./, '')), 'one top set of 365 x 4 then 335 x 5 x 5: 340 for the back-offs, never five sets at 365 (rv/pl/p5.js)', r2.C);
    ok(r2.D.w === 340 && !/385/.test(r2.D.text.replace(/^Last[^.]*\./, '')), '385 x 2 then 335 x 5 x 5 on a 3-5 plan: 340, never "beat 2 reps at 385"', r2.D);
    ok(r2.E === 350, 'two unmarked warm-ups at 135 then 345 x 5: the target builds on 345', r2.E);
    ok(r2.A.w === 340 && !/Drop|below/.test(r2.A.text), 'two singles at 405 then 335 x 5 x 5: still 340, never "drop to 345"', r2.A);
    ok(r2.B.w === 230 && !/Drop|below/.test(r2.B.text), 'two triples at 255 then 225 x 5 x 5: 230 for 5s, never "drop to 230"', r2.B);
    // ---- 7. Three sessions in nine days are not a trend.
    ok(r.sqTrend.pct == null && /spread over 2 weeks/.test(r.bench), 'three sessions over 9 days give no trend, and the lift says what a trend needs', { t: r.sqTrend, h: r.bench });
    ok(!/over 6 weeks/.test(r.bench), 'no "over 6 weeks" for data that spans 9 days', r.bench);
    // The 5 x 5 plan reads as one number of reps, in the session and its texts.
    const blk = await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); const b = document.querySelector('.hero [data-act="startSession"]:not([data-light])'); b.click(); return [...document.querySelectorAll('section.block h3 + p.small')].map(s => s.innerText).join(' | '); });
    ok(/5\s*×\s*5\b/.test(blk) && !/5-5/.test(blk), 'a 5 x 5 plan shows "5×5", never "5×5-5"', blk.slice(0, 200));
    ok(P.errors.length === 0, 'no page errors (powerlifter)', P.errors);
    await P.browser.close();
  }

  // ---- 2. An unmarked deload on a lift trained 3 times a week, viewed right after it.
  {
    const P = await open('index.html', { clock: '2026-09-06T10:00:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
    await ev(csv => window.__ironlog.impStart({ text: csv }), strongCsv(5)); await wait(300);
    await ev(() => window.__ironlog.ACT.impGo()); await wait(200);
    const a = await ev(LB => {
      const L = window.__ironlog; const I = L.IDX(); const x = I.byEx.backSquat; const s = I.exStats.backSquat;
      return { dl: x.filter(q => q.date >= '2026-08-31').map(q => [q.date, Math.round(q.topL / LB), !!q.auto, !!q.keep]), pct: s.pct, stalled: s.stalled, light: Object.keys(I.lightWk), stalls: L.stalledIds(), head: L.exHeadline('backSquat') };
    }, LB);
    ok(a.dl.length === 3 && a.dl.every(q => q[2] && !q[3]), 'all three squat sessions of the deload week read as lighter, not as a new level', a.dl);
    ok(a.light.includes('2026-08-31'), 'that week is a lighter week', a.light);
    ok(!a.stalled && !a.stalls.includes('backSquat') && !(a.pct != null && a.pct < -3), 'right after it the squat is neither falling nor stalled', { pct: a.pct, stalled: a.stalled, h: a.head });
    ok(P.errors.length === 0, 'no page errors (deload)', P.errors);
    await P.browser.close();
  }

  // ---- 5. A Strong import on a first run makes its routine from the file.
  {
    const P = await open('index.html', { touch: true, clock: '2026-09-28T07:00:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(csv => window.__ironlog.impStart({ text: csv }), strongCsv(8)); await wait(300);
    await ev(() => window.__ironlog.ACT.impGo()); await wait(300);
    const a = await ev(() => {
      const L = window.__ironlog; const st = L.state; const R = st.routines.find(r => r.id === st.activeRoutineId);
      const tr = R.days.filter(d => !d.rest);
      const linked = st.sessions.filter(s => s.routineId === R.id).length;
      const sq = tr.map(d => d.items.find(i => i.exId === 'backSquat'));
      const bi = tr.map(d => d.items.find(i => i.exId === 'bench')).find(Boolean); const bench = bi && [bi.sets, bi.repMin, bi.repMax];
      L.ui.tab = 'dash'; L.render(); const dash = document.getElementById('view').innerText.replace(/\s+/g, ' ');
      L.ui.tab = 'today'; L.render(); const hero = (document.querySelector('.hero') || {}).innerText || '';
      return { sqRir: sq.map(i => i && i.rir), bench, routines: st.routines.map(r => r.name), name: R.name, days: R.days.map(d => d.rest ? 'Rest' : d.name), items: tr.map(d => d.items.map(i => i.exId)), sq: sq.map(i => i && [i.sets, i.repMin, i.repMax]),
        linked, n: st.sessions.length, coach: L.coach().text, dash, hero: hero.replace(/\s+/g, ' '), toast: document.getElementById('toast').innerText, tab: L.ui.tab };
    });
    ok(a.name === 'From your log' && a.routines.length === 1, 'the starter nobody picked is replaced by a routine made from the import', a.routines);
    ok(a.days.filter(d => d !== 'Rest').sort().join() === 'Workout A,Workout B' && a.days.length === 5, 'its days are the file\'s workouts, with rest days for 3 a week (a 5-day cycle of 2 workouts)', a.days);
    ok(a.items.every(l => l.includes('backSquat')) && a.items.some(l => l.includes('bench')) && a.items.some(l => l.includes('deadlift')) && !a.items.flat().includes('latPulldown'), 'each day keeps the lifts done on it, nothing never done', a.items);
    ok(a.sq.every(i => i && i[0] === 5 && i[1] === 3 && i[2] === 5), 'squat: 5 sets in a range around the usual 5 reps', a.sq);
    ok(a.sqRir.every(q => q >= 1), 'one failure set in the file does not make the plan go to failure (squat RIR stays at the default)', a.sqRir);
    ok(!/below target|is getting/.test(a.coach), 'the coach does not call the importer below a target fitted from their own log', a.coach);
    ok(JSON.stringify(a.bench) === '[3,8,10]', 'bench moved from 5 x 5 to 3 sets of 8 to 10 three weeks ago: the routine has the program now (3 x 8-10)', a.bench);
    ok(/\(\d+\/\d+\)/.test((a.dash.match(/Adherence[^)]*\)/) || [''])[0]), 'adherence counts are whole numbers', (a.dash.match(/Adherence[^)]*\)/) || [''])[0]);
    ok(a.linked === a.n, 'every imported session joins its day, so the cycle, streak and adherence read them', { linked: a.linked, n: a.n });
    ok(!/Lat Pulldown/.test(a.coach) && !/Lat Pulldown/.test(a.dash), 'the coach never asks for sets on a lift never done', a.coach);
    ok(!/Adherence[^%]*69%|\(11\/16\)/.test(a.dash), 'adherence is not measured against a routine never picked', (a.dash.match(/Adherence[^)]*\)/) || [''])[0]);
    ok(/Workout [AB]/.test(a.hero) && !/Upper A/.test(a.hero), 'Today offers the next workout from the file', a.hero.slice(0, 160));
    ok(/routine is made from them/.test(a.toast) && /Workout A/.test(a.toast), 'a note says the routine was made from the import and where to change it', a.toast);
    ok(P.errors.length === 0, 'no page errors (import)', P.errors);
    await P.browser.close();
  }
  // ---- 5b. Strong's default names ("Morning Workout"), after Log a workout now: days by their lifts, targets fitted.
  {
    const P = await open('index.html', { touch: true, clock: '2026-09-28T07:00:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    // Log a workout now first: targets fitted to the starter (rv/st/r31c.js).
    await ev(() => { const L = window.__ironlog; L.fitTargets(L.state.routines[0]); L.saveNow(); });
    await ev(csv => window.__ironlog.impStart({ text: csv }), strongCsv(8, () => 'Morning Workout')); await wait(300);
    await ev(() => window.__ironlog.ACT.impGo()); await wait(300);
    const a = await ev(() => {
      const L = window.__ironlog; const st = L.state; const R = st.routines.find(r => r.id === st.activeRoutineId); const tr = R.days.filter(d => !d.rest);
      const plan = L.plannedSets(R); const b = st.settings.bands;
      const over = Object.keys(plan).filter(m => !L.TRACK_ONLY.has(m) && b[m] && b[m][0] > Math.floor(plan[m] || 0) + 1e-9);
      return { name: R.name, days: tr.map(d => d.name), items: tr.map(d => d.items.map(i => i.exId)), linked: st.sessions.filter(s => s.routineId === R.id).length, n: st.sessions.length, over, modal: L.ui.modal && L.ui.modal.kind, coach: L.coach().text };
    });
    ok(a.name === 'From your log' && a.days.join() === 'Day A,Day B' && !a.modal, 'generic workout names: the days are found from the lifts in them (Day A, Day B)', a);
    ok(a.items.some(l => l.includes('bench') && !l.includes('deadlift')) && a.items.some(l => l.includes('deadlift') && !l.includes('bench')), 'each day has its own lifts', a.items);
    ok(a.linked === a.n, 'every session joins its day by its lifts', { linked: a.linked, n: a.n });
    ok(a.over.length === 0, 'targets set by Log a workout now are fitted again to the routine from the import', a.over);
    await P.browser.close();
  }
  // ---- 5c. Nothing repeats (three different sessions, no names): the picker opens and says why.
  {
    const P = await open('index.html', { touch: true, clock: '2026-09-28T07:00:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(t => window.__ironlog.impStart({ text: t }), 'Sep 1\nBench press 185x8, 185x8\n\nSep 3\nSquat 225x5, 225x5\n\nSep 5\nDeadlift 315x5'); await wait(300);
    await ev(() => window.__ironlog.ACT.impGo()); await wait(300);
    const a = await ev(() => { const L = window.__ironlog; const m = L.ui.modal; return { kind: m && m.kind, imported: m && m.imported, t: document.getElementById('modal').innerText, n: L.state.sessions.length }; });
    ok(a.kind === 'templates' && a.imported && /pick the routine you follow/.test(a.t) && a.n === 3, 'when no day repeats the routine picker opens and says why', a);
    await page.click('#modal [data-act="tplPick"][data-k="full3"]'); await wait(200);
    const b = await ev(() => { const L = window.__ironlog; return { name: L.state.routines.find(r => r.id === L.state.activeRoutineId).name, n: L.state.routines.length }; });
    ok(b.n === 1 && /Full body/.test(b.name), 'the pick replaces the starter', b);
    await P.browser.close();
  }

  // ---- 3, 8, 9, 12: the session flows.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-05T07:00:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.ui.tab = 'today'; L.render(); });
    // 12. The grey-loads card only shows when there is a grey load.
    await ev(() => window.__ironlog.toast('Upper / lower, 4 days is ready'));
    await page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(200);
    const s0 = await ev(() => { const L = window.__ironlog; const d = L.state.draft; return { card: !!document.getElementById('loadAsk'), toast: document.getElementById('toast').hidden, first: d.ex.map(b => b.hint), names: d.ex.map(b => b.exId) }; });
    ok(!s0.card, 'a first session with nothing suggested has no "suggested loads show in grey" card', s0);
    ok(s0.toast, 'the routine note goes when the session starts, so it never covers the title and Discard', s0.toast);
    // 9. The first-time line asks for one load, and fits bodyweight lifts.
    const ft = await ev(() => { const L = window.__ironlog; const p = { sets: 3, repMin: 8, repMax: 12, rir: 3, rest: 90, inc: 5 * 0.45359237 };
      return { w: L.suggest('legPress', p).text, bw: L.suggest('pushup', p).text, as: L.suggest('assistPullup', p).text, five: L.suggest('legPress', { ...p, repMin: 5, repMax: 5, rir: 2 }).text }; });
    ok(/about 15 times/.test(ft.w) && /8 to 12 reps, stopping with about 3 still in you/.test(ft.w), 'first time: a load you could lift about 15 times, 8 to 12 reps with 3 in reserve (one load, both agree)', ft.w);
    ok(!/load you/.test(ft.bw) && /bodyweight/i.test(ft.bw), 'first time on push-ups: no load to pick', ft.bw);
    ok(/help/.test(ft.as) && !/load you/.test(ft.as), 'first time on an assisted machine: set the help', ft.as);
    ok(/Do 5 reps/.test(ft.five) && !/5 to 5/.test(ft.five), 'a one-number range reads "5 reps", never "5 to 5"', ft.five);

    // 3. Make it lighter after an exercise is done keeps that exercise full.
    const ml = await ev(() => {
      const L = window.__ironlog; const d = L.state.draft; const b = d.ex[0];
      b.plan.repMin = 6; b.plan.repMax = 10; for (const x of b.sets) { if (x.warm) continue; x.w = 185 * 0.45359237; x.r = 10; x.done = true; }
      const n0 = b.sets.filter(x => !x.warm).length;
      d.chk = { sleep: 1, energy: 1 }; L.render(); L.ACT.makeLight();
      return { light0: !!b.light, dLight: !!d.light, sets0: b.sets.filter(x => !x.warm && x.done).length, n0, others: d.ex.slice(1).map(x => !!x.light), name: d.dayName, card: (document.getElementById('readyCard') || {}).innerText || '', cal: L.calDueIdx(d) };
    });
    ok(!ml.light0 && !ml.dLight && ml.sets0 === ml.n0 && ml.others.every(Boolean), 'Make it lighter changes only the exercises not started; the session is not marked lighter', ml);
    ok(/Made lighter/.test(ml.card) && !/\(lighter\)/.test(ml.name), 'the check-in says it was made lighter instead of offering it again', ml.card);
    ok(ml.cal === -1, 'no "take one set to failure" after two low check-in answers', ml.cal);
    const exId = await ev(() => window.__ironlog.state.draft.ex[0].exId);
    await ev(() => { const L = window.__ironlog; const d = L.state.draft; d._leftAsked = true; d._rampAsked = true; L.ACT.finish(); });
    await wait(200);
    const nx = await ev(id => { const L = window.__ironlog; const s = L.state.sessions[L.state.sessions.length - 1]; const p = { sets: 4, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 5 * 0.45359237 }; const g = L.suggest(id, p);
      return { sLight: !!s.light, b0: !!s.ex[0].light, w: Math.round(g.w / 0.45359237), text: g.text }; }, exId);
    ok(!nx.sLight && !nx.b0 && nx.w > 185 && !/Beat/.test(nx.text), 'next time the exercise done at full effort adds load (every set reached 10)', nx);
    await ev(() => window.__ironlog.ACT.mClose && window.__ironlog.ACT.mClose());

    // 8. A forgotten load is asked about as a missing load, not as a warm-up.
    const fl = await ev(() => {
      const L = window.__ironlog; L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose(); const d = L.state.draft;
      d.ex = [L.newBlock('machPress', { sets: 2, repMin: 8, repMax: 12, rir: 1, rest: 0 })];
      const w = d.ex[0].sets.filter(x => !x.warm); w[0].w = null; w[0].r = 8; w[0].done = true; w[1].w = 100 * 0.45359237; w[1].r = 8; w[1].done = true; d.ex[0].sw = null;
      d._leftAsked = true; L.ACT.finish(); const m = L.ui.modal; return m && m.title;
    });
    ok(fl === 'Add the missing loads?', 'a set ticked with no load: "Add the missing loads?" comes first, never "these look like ramp-up sets"', fl);
    ok(P.errors.length === 0, 'no page errors (session flows)', P.errors);
    await P.browser.close();
  }

  // ---- 4, 6, 10, 11, 12: the numbers.
  {
    const P = await open('index.html', { clock: '2026-10-05T07:00:00', realStarter: true });
    const r = await P.page.evaluate(LB => {
      const L = window.__ironlog; const st = L.state; st.settings.onboarded = true;
      const R = L.routineFromTemplate('full3'); st.routines = [R]; st.activeRoutineId = R.id;
      const ses = (date, list) => ({ id: 's' + date + Math.random(), date, dayIdx: 0, dayId: R.days[0].id, routineId: R.id, dayName: 'Day 1', ex: list.map(([id, sets, rr]) => ({ exId: id, rr: rr || null, note: '', sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir: rir == null ? null : rir, warm: false, drop: false })) })) });
      const p8 = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * LB };
      const one = sets => { st.sessions = [ses('2026-10-01', [['legPress', sets]])]; L.state = L.normalize(st); L.invalidate(); const g = L.suggest('legPress', p8); return { w: Math.round(g.w / LB), text: g.text }; };
      const out = { lp25: one([[90, 25], [90, 25], [90, 25]]), lp12: one([[90, 12, 5], [90, 12, 5], [90, 12, 5]]) };
      // 6. Double progression at the top of the range: set 1 at 10, more reps on sets 2 to 4 each week.
      const reps = [[10, 9, 9, 8], [10, 9, 9, 8], [10, 10, 9, 8], [10, 10, 9, 8], [10, 10, 9, 9], [10, 10, 10, 9]];
      st.sessions = reps.map((rs, i) => ses(['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'][i], [['bench', rs.map(r => [185, r]), [6, 10]], ['hangingLegRaise', [[0, 15], [0, 15], [0, 9]], [8, 15]]]));
      L.state = L.normalize(st); L.invalidate();
      const I = L.IDX(); out.bench = { stalled: I.exStats.bench.stalled, pct: I.exStats.bench.pct, tv: I.byEx.bench.map(x => Math.round(x.tv / LB)) };
      out.fat = L.fatigueStalls(['plank', 'hangingLegRaise', 'dbCurl', 'bench', 'backSquat']);
      out.coach = L.coach();
      // Re-review: a perfectly flat isolation lift is stalled (rounding never hides it), and a small steady rise reads as slow.
      const days = []; for (let i = 0; i < 16; i++) days.push(new Date(Date.UTC(2026, 7, 10 + Math.floor(i / 2) * 7 + (i % 2) * 3)).toISOString().slice(0, 10));
      st.sessions = days.map(d => ses(d, [['dbCurl', [[35, 10], [35, 9]], [8, 12]], ['dbLateral', [[20, 12], [20, 11], [20, 10]], [10, 15]]]));
      L.state = L.normalize(st); L.invalidate(); out.flat = L.stalledIds();
      st.sessions = [0, 1, 2, 3, 4, 5].map(i => ses(['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'][i], [['bench', [[100 + 0.25 * i, 8], [100 + 0.25 * i, 8], [100 + 0.25 * i, 8]], [6, 10]]]));
      L.state = L.normalize(st); L.invalidate(); out.slow = L.exHeadline('bench');
      // 10. One week trained out of the last four.
      st.sessions = [ses('2026-09-29', [['bench', [[185, 8], [185, 8], [185, 8]]]]), ses('2026-09-01', [['bench', [[185, 8]]]])];
      L.state = L.normalize(st); L.invalidate();
      const avg = L.actualAvg4(); out.avg = { weeks: avg && avg._weeks, missed: avg && avg._missed, coach: L.coach().text, txt: avg && L.avgWeeksTxt(avg) };
      out.lib = ['t bar row', 'tbar', 'T-bar'].map(q => L.libFiltered(q, '', '', '').map(e => e.name)); out.libDb = L.libFiltered('db curl', '', '', '').map(e => e.name);
      out.span = [L.repSpan(5, 5, '-'), L.repSpan(8, 12, '-'), L.rangeWords({ repMin: 5, repMax: 5 })];
      return out;
    }, LB);
    ok(r.lp25.w >= 105 && r.lp25.w <= 115, 'leg press 3 x 25 at 90 lb on 8-12: the next load jumps to fit the range (105-115 lb), not +5 lb', r.lp25);
    ok(r.lp12.w >= 100, 'leg press 3 x 12 at RIR 5: more than one step (100 lb or more)', r.lp12);
    ok(!r.bench.stalled, 'bench at 185 adding reps to sets 2 to 4 for six weeks is not stalled', r.bench);
    ok(r.bench.tv[5] > r.bench.tv[0], 'its trend reading rises with the back-set reps', r.bench.tv);
    ok(JSON.stringify(r.fat) === JSON.stringify(['bench', 'backSquat']), 'planks, leg raises and curls never count toward "lifts stalled at once"', r.fat);
    ok(r.coach.tone !== 'red', 'no red deload call from accessory stalls', r.coach);
    ok(r.flat.includes('dbCurl') && r.flat.includes('dbLateral'), 'curls and lateral raises identical for 8 weeks are stalled', r.flat);
    ok(/Slowly up/.test(r.slow) && !/No clear change/.test(r.slow), 'a small steady rise reads "slowly up", not "no clear change" beside a range above zero', r.slow);
    ok(r.avg.weeks === 1 && r.avg.missed === 3 && /trained in 1 of the last 4 weeks/.test(r.avg.coach), 'one week trained of four: the coach says so before any set count', r.avg);
    ok(/1 week you trained of the last 4/.test(r.avg.txt), 'the average says which weeks it covers', r.avg.txt);
    ok(r.lib.every(n => n.includes('Landmine T-Bar Row')) && r.libDb.includes('DB Curl'), 'library search ignores hyphens and spaces: "t bar row", "tbar", and "T-bar" find Landmine T-Bar Row; "db curl" finds DB Curl', r.lib);
    ok(r.span[0] === '5' && r.span[1] === '8-12' && r.span[2] === 'target of 5', 'one-number ranges read as one number', r.span);
    ok(P.errors.length === 0, 'no page errors (numbers)', P.errors);
    await P.browser.close();
  }

  // ---- 12/13. The same file imported again in the other unit is all duplicates; the region table shows minimums.
  {
    const P = await open('index.html', { clock: '2026-09-28T07:00:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
    await ev(csv => window.__ironlog.impStart({ text: csv }), strongCsv(3)); await wait(300);
    await ev(() => window.__ironlog.ACT.impGo()); await wait(200);
    const n1 = await ev(() => window.__ironlog.state.sessions.length);
    await ev(csv => window.__ironlog.impStart({ text: csv }), strongCsv(3)); await wait(300);
    const d = await ev(() => { const L = window.__ironlog; const m = L.ui.modal; m.unit = m.unit === 'kg' ? 'lb' : 'kg'; const b = L.impBuild(m); return { fresh: b.sessions.length, dup: b.dup }; });
    ok(n1 > 0 && d.fresh === 0 && d.dup >= n1, 'the same file again with the other unit chosen: every session skipped as already in the log', { n1, d });
    await ev(() => window.__ironlog.ACT.mClose());
    const t = await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.ui.volMode = 'region'; L.ui.folds['dash:volume'] = true; L.render(); const tb = [...document.querySelectorAll('table.t')].find(x => /Region/i.test(x.innerText)); return tb ? tb.innerText : ''; });
    ok(/Minimum/i.test(t) && !/\d-\d{2}\b/.test(t), 'the region table gives each region\'s minimum, not a sum of ranges like 14-66', t.slice(0, 200));
    await P.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
