// r30 (V, 2026-10-04): the independent review (Ironlog_feedback.docx). Each
// finding is reproduced here the way the reviewer met it, and must now read
// right: an imported lifter with an unmarked deload week, a stalling press,
// patchy RPE and treadmill rows; the numbers that were wrong (trends, stalls,
// muscle trends, the window, weight lifted, rep PRs, best dates, the PR
// toast, 1RMs on isolation lifts, labels that contradicted each other,
// history changing after a weigh-in, a KPI from one session); the flows
// (lighter day, check-in, sets left at Finish, demo beside real data, an
// import under a different plan, notes, Strong cardio, rep range, swaps,
// joints, Enter, the kg example, an untouched edit); the routines; the
// targets note on Plan; the load jump; and how-to videos.
// Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

// The reviewer's Strong export, rebuilt: push, pull, legs three days a week
// for six weeks from Monday 2026-08-24, the fourth week a deload nobody
// marked (about 85% loads), legs missed in week two, a press that stalls,
// RPE on some squat sets only, and a treadmill walk on legs days.
function strongCsv() {
  const rows = [['Date', 'Workout Name', 'Duration', 'Exercise Name', 'Set Order', 'Weight', 'Reps', 'Distance', 'Seconds', 'Notes', 'Workout Notes', 'RPE']];
  const day = (w, k) => { const d = new Date(Date.UTC(2026, 7, 24 + 7 * w + k)); return d.toISOString().slice(0, 10) + ' 18:00:00'; };
  const add = (date, name, ex, sets) => sets.forEach((s, i) => rows.push([date, name, '1h', ex, String(i + 1), String(s[0]), String(s[1]), s[3] || '', s[4] || '', '', '', s[2] == null ? '' : String(s[2])]));
  const five = (w, rpe, reps) => (reps || [5, 5, 5, 5, 5]).map(r => [w, r, rpe]);
  const bench = [185, 190, 195, 160, 200, 205], ohp = [[5, 5, 5, 5, 5], [5, 5, 5, 5, 4], [5, 5, 5, 4, 4], [5, 5, 5, 5, 5], [5, 5, 4, 4, 4], [5, 5, 4, 4, 4]];
  const dl = [315, 325, 335, 275, 345, 355], row = [155, 160, 165, 135, 170, 175];
  const squat = [245, null, 255, 215, 265, 270], press = [360, null, 380, 310, 400, 410];
  for (let w = 0; w < 6; w++) {
    const dl8 = w === 3;
    add(day(w, 0), 'Push', 'Bench Press (Barbell)', five(bench[w], 8));
    add(day(w, 0), 'Push', 'Overhead Press (Barbell)', five(dl8 ? 100 : 115, null, dl8 ? [5, 5, 5, 5, 5] : ohp[w]));
    add(day(w, 0), 'Push', 'Triceps Pushdown (Cable - Straight Bar)', [[50, 12], [50, 12], [50, 11]]);
    add(day(w, 2), 'Pull', 'Deadlift (Barbell)', [[dl[w], 5]]);
    add(day(w, 2), 'Pull', 'Bent Over Row (Barbell)', [[row[w], 8], [row[w], 8], [row[w], 8]]);
    if (squat[w] != null) {
      // RPE on some sets only: rated 7 one week and 9 another, blank otherwise.
      const rpe = w === 2 ? [7, 7, null, null, null] : w === 4 ? [9, null, null, null, null] : [null, null, null, null, null];
      add(day(w, 4), 'Legs', 'Squat (Barbell)', [0, 1, 2, 3, 4].map(i => [squat[w], 5, rpe[i]]));
      add(day(w, 4), 'Legs', 'Leg Press', [[press[w], 15], [press[w], 15], [press[w], 14]]);
      add(day(w, 4), 'Legs', 'Treadmill', [[0, 0, null, 2, 1200]]);
    }
  }
  return rows.map(r => r.join(',')).join('\n');
}

(async () => {
  // ---- Nothing in the page names the GitHub account (r30: a fallback address did).
  {
    const fs = require('fs'); const path = require('path'); const f = process.env.IRONLOG_FILE || 'index.html';
    const dir = path.dirname(path.resolve(f)); const files = [f, ...['cloud.js', 'sw.js', 'manifest.webmanifest'].map(n => path.join(dir, n)).filter(n => fs.existsSync(n))];
    const hit = files.filter(n => /vqx7/i.test(fs.readFileSync(n, 'utf8')));
    ok(!hit.length, 'the shipped page and its files never name the GitHub account', hit);
  }
  // ---- The imported lifter.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-04T10:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
    await ev(csv => window.__ironlog.impStart({ text: csv }), strongCsv()); await wait(300);
    const pv = await ev(() => { const m = window.__ironlog.ui.modal; return { step: m.step, push: m.pick['Triceps Pushdown (Cable - Straight Bar)'], t: document.getElementById('modal').innerText.replace(/\s+/g, ' ') }; });
    ok(pv.step === 'preview' && pv.push === 'pressdown', 'Strong: "Triceps Pushdown (Cable - Straight Bar)" is matched to Triceps Pressdown', pv.push);
    ok(/Cardio: 5 entries/.test(pv.t) && /walk/i.test(pv.t) && /2 mi/.test(pv.t), 'Strong: treadmill rows are read as cardio with time and distance, not dropped', pv.t.slice(0, 400));
    await ev(() => window.__ironlog.ACT.impGo()); await wait(200);
    const im = await ev(() => { const L = window.__ironlog; return { n: L.state.sessions.length, cardio: L.state.cardio.map(c => [c.kind, c.min, Math.round(c.dist * 100) / 100]) }; });
    ok(im.n === 17 && im.cardio.length === 5 && im.cardio.every(c => c[0] === 'walk' && c[1] === 20 && Math.abs(c[2] - 3.22) < 0.01), 'imported: 17 sessions and 5 treadmill walks of 20 min and 2 miles (stored as 3.22 km)', im);

    const a = await ev(() => {
      const L = window.__ironlog; const I = L.IDX(); const st = id => I.exStats[id];
      const pick = id => { const s = st(id); return s && { pct: s.pct == null ? null : Math.round(s.pct * 10) / 10, moving: s.moving, stalled: s.stalled, useAdj: s.useAdj, wN: s.wN }; };
      const auto = Object.fromEntries(['bench', 'deadlift', 'bbRow', 'backSquat', 'legPress', 'ohp'].map(id => [id, (I.byEx[id] || []).filter(x => x.auto).map(x => x.date)]));
      L.ui.tab = 'dash'; L.render(); const moveRow = (document.querySelector('#dashSummary .srow') || {}).innerText || '';
      return { bench: pick('bench'), dl: pick('deadlift'), row: pick('bbRow'), squat: pick('backSquat'), press: pick('legPress'), ohp: pick('ohp'), auto, coach: L.coach().text, moveRow: moveRow.replace(/\s+/g, ' '), chest: (I.scores.find(s => s.m === 'chest') || {}), light: Object.keys(I.lightWk) };
    });
    ok(['bench', 'deadlift', 'bbRow', 'backSquat', 'legPress'].every(id => a.auto[id].length === 1 && a.auto[id][0].startsWith('2026-09-1')), 'the unmarked deload week is read as lighter on every lift that had it', a.auto);
    ok(a.light.includes('2026-09-14'), 'and the whole week is a lighter week', a.light);
    ok(a.bench.moving && a.dl.moving && a.row.moving, 'bench, deadlift and row (up 8 to 13%) read as moving, not "nothing measurably rising"', a);
    ok(/moving/i.test(a.moveRow) && /\+\d/.test(a.moveRow) && !/needs 3 sessions/.test(a.moveRow), 'the summary names what is moving and never says "needs 3 sessions" to someone with five', a.moveRow);
    ok(!a.squat.stalled && a.squat.pct > 0 && !a.squat.useAdj, 'squat 245 to 270 with RPE on a few sets only: read from loads and reps, rising, not stalled', a.squat);
    ok(a.press.pct != null && a.press.pct > 0, 'leg press done for 15 reps has a trend', a.press);
    ok(a.ohp.stalled, 'the press that really stalls is still stalled', a.ohp);
    ok(!/deload week may help/.test(a.coach), 'no deload suggested three weeks after one', a.coach);
    ok(a.chest.clear === true || a.chest.clear === false, 'chest has a strength reading (clear or unclear, never a made-up 0)', a.chest);

    // Muscle trends: unclear instead of 0%. Chest from one bench press going
    // sideways inside the noise, with a PR in it (so not stalled).
    const mt = await ev(() => { const L = window.__ironlog; const LB = 0.45359237; const S = (id, d, w, r) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: w * LB, r, rir: 1, warm: false }, { w: w * LB, r, rir: 1, warm: false }] }] });
      L.state.sessions = [S('m1', '2026-08-24', 200, 8), S('m2', '2026-08-31', 205, 7), S('m3', '2026-09-07', 200, 8), S('m4', '2026-09-14', 205, 8), S('m5', '2026-09-21', 200, 8), S('m6', '2026-09-28', 200, 8)]; L.state.cardio = []; L.invalidate();
      const I = L.IDX(); const sc = I.scores.find(s => s.m === 'chest'); L.ui.tab = 'dash'; L.ui.folds['dash:weak'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); return { sc, st: I.exStats.bench.stalled, txt: document.getElementById('view').innerText }; });
    ok(mt.sc && !mt.sc.clear && !mt.st && /unclear/.test(mt.txt) && !/Flat: try 2 more sets/.test(mt.txt), 'a muscle whose lifts are all inside the noise reads unclear, with no "try 2 more sets"', { sc: mt.sc, st: mt.st });
    ok(!P.errors.length, 'no page errors (import)', P.errors);
    await P.browser.close();
  }

  // ---- The numbers, one by one.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-04T10:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const r = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const out = {};
      const S = (id, date, exId, sets, extra) => Object.assign({ id, date, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId, sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir: rir == null ? null : rir, warm: false })) }] }, extra || {});
      L.state.settings.onboarded = true;
      // Each lift's own window: logging a bench day does not move the split squat's trend.
      L.state.sessions = ['2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07'].map((d, i) => S('b' + i, d, 'bss', [[40 + i * 5, 10, 2], [40 + i * 5, 10, 2]]));
      L.invalidate(); const before = L.IDX().exStats.bss.pct;
      L.state.sessions.push(S('u1', '2026-10-01', 'bench', [[185, 8, 2]])); L.invalidate(); const after = L.IDX().exStats.bss.pct;
      out.win = { before, after };
      // Rep PRs: 40 x 10 after 95 x 5 is not one.
      L.state.sessions = [S('p1', '2026-09-20', 'bench', [[95 / LB * LB, 5, 1]].map(x => x)), S('p2', '2026-09-27', 'bench', [[40, 10, 1]])];
      L.state.sessions[0].ex[0].sets[0].w = 95 * LB; L.invalidate();
      out.light = L.IDX().prs.filter(p => p.date === '2026-09-27').map(p => p.type);
      // All-time bests carry their own dates.
      L.state.sessions = [S('h1', '2026-09-25', 'backSquat', [[270, 5, 1]]), S('h2', '2026-10-02', 'backSquat', [[255, 8, 1]])]; L.invalidate();
      const b = L.allTimeBests('backSquat'); out.best = { heavy: b.heavy && b.heavy.date };
      L.ui.tab = 'dash'; L.ui.folds['dash:exercise'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const row = document.querySelector('#sub-bests .bx[data-ex="backSquat"] .bs'); out.best.txt = row ? row.innerText : null;
      // A 1RM only for compound lifts.
      L.state.sessions = ['2026-09-06', '2026-09-13', '2026-09-20', '2026-09-27'].map((d, i) => S('l' + i, d, 'dbLateral', [[20 + i * 2.5, 12, 1], [20 + i * 2.5, 12, 1]])); L.invalidate();
      L.ui.dashEx = 'dbLateral'; L.render(); out.iso = L.exHeadline ? L.exHeadline('dbLateral') : null;
      // Weight lifted from the bodyweight known at the time.
      L.state.sessions = [S('w1', '2026-09-20', 'pullup', [[0, 10, 1], [0, 10, 1]])]; L.state.bodyweights = []; L.invalidate();
      const v0 = L.IDX().sessVol[0].vol; L.state.bodyweights = [{ id: 'bw', date: '2026-10-04', kg: 80 }]; L.invalidate(); out.bw = { v0, v1: L.IDX().sessVol[0].vol };
      // Average session length needs 3 timed sessions.
      L.state.sessions = [S('t1', '2026-10-01', 'bench', [[185, 8, 1]], { durMin: 3 })]; L.invalidate(); out.len1 = L.sessionLength ? L.sessionLength() : 'none';
      return out;
    });
    ok(r.win.before != null && Math.abs(r.win.before - r.win.after) < 1e-9, 'a lift\'s 6-week window ends at its own last session: an unrelated session leaves its trend alone', r.win);
    ok(!r.light.includes('Rep PR'), '40 x 10 after 95 x 5 is not a rep PR', r.light);
    ok(r.best.heavy === '2026-09-25' && /heaviest [^·]*, Sep 25/.test(r.best.txt || ''), 'the heaviest set shows the date it was set, not the latest session', r.best);
    ok(r.iso && !/Best estimate/.test(r.iso) && /Best set/.test(r.iso), 'an isolation lift shows its best set, not a 1RM', r.iso);
    ok(r.bw.v0 === r.bw.v1, 'a weigh-in logged today does not change weight lifted in an earlier session', r.bw);
    ok(r.len1 === null, 'no average session length from one timed session', r.len1);

    // The PR toast names the band its estimate is from.
    const t = await ev(() => { const L = window.__ironlog; const LB = 0.45359237;
      const S = (id, d, w, r, rir) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: w * LB, r, rir, warm: false }] }] });
      L.state.sessions = [S('x1', '2026-09-20', 265, 3, 0), S('x2', '2026-09-27', 215, 6, 1)]; L.invalidate();
      return L.prBeat('bench', { w: 225 * LB, r: 7, rir: 1 }, '2026-10-04', 'Best'); });
    ok(/for sets of 6 to 10 reps/.test(t), 'the best-estimate toast says which rep band it beat, so it never reads wrong beside a higher overall best', t);

    // Labels that contradicted each other: "301 → 300.7 · up".
    const lt = await ev(() => { const L = window.__ironlog; const LB = 0.45359237; const S = (id, d, w, r) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'backSquat', sets: [{ w: w * LB, r, rir: 1, warm: false }] }] });
      L.state.sessions = [S('q1', '2026-09-20', 255, 5), S('q2', '2026-09-27', 256, 5), S('q3', '2026-10-01', 255.5, 5)]; L.invalidate(); return L.liftTrend('backSquat'); });
    ok(/flat/.test(lt) && !/up|down/.test(lt.replace(/Est\. 1RM|1RM/g, '')), 'within 1% the trend reads flat, never "up" beside the same number', lt);
    ok(!P.errors.length, 'no page errors (numbers)', P.errors);
    await P.browser.close();
  }

  // ---- Flows.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-04T10:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    // A history at 5 x 5 under a 3 x 6-10 plan: the load comes from the estimate, the target covers 3 sets.
    const sg = await ev(() => { const L = window.__ironlog; const LB = 0.45359237; L.state.settings.onboarded = true;
      L.state.sessions = ['2026-09-21', '2026-09-28'].map((d, i) => ({ id: 'f' + i, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [0, 1, 2, 3, 4].map(() => ({ w: (265 + i * 5) * LB, r: 5, rir: null, warm: false })) }] })); L.invalidate();
      const s = L.suggest('bench', { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB }, {});
      const l = L.suggest('bench', { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB }, { light: true });
      return { w: s.w / LB, kind: s.tgt && s.tgt.kind, target: s.target, lw: l.w / LB, ltgt: l.tgt, ltext: l.text }; });
    ok(sg.kind === 'load' && sg.w < 270 && !/first 5 sets/.test(sg.target), 'history at 5 x 5, plan 3 x 6-10: a lighter load from the estimate, not 16 reps over 3 sets', sg);
    ok(sg.lw < 270 && sg.ltgt === null && /Lighter day/.test(sg.ltext), 'a lighter day is lighter: about 90% of the load and nothing to beat', sg);

    // The check-in offers a lighter or shorter session, and Make it lighter halves what is not started.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(200);
    const ci = await ev(() => { const L = window.__ironlog; const d = L.state.draft; d.chk = { sleep: 1, energy: 1, joints: 1 }; L.render(); const c = document.getElementById('readyCard'); return { has: !!c, light: !!(c && c.querySelector('[data-act="makeLight"]')), short: !!(c && c.querySelector('[data-act="shortOpen"]')), sets: d.ex.map(b => b.sets.filter(x => !x.warm).length) }; });
    ok(ci.has && ci.light && ci.short, 'a poor check-in offers Make it lighter and Short on time', ci);
    await page.click('#readyCard [data-act="makeLight"]'); await wait(200);
    const ml = await ev(() => { const d = window.__ironlog.state.draft; return { light: d.light, sets: d.ex.map(b => b.sets.filter(x => !x.warm).length), tgt: d.ex.map(b => b.tgt) }; });
    ok(ml.light && ml.sets.every((n, i) => n === Math.max(1, Math.ceil(ci.sets[i] / 2))) && ml.tgt.every(t => t == null), 'Make it lighter: half the sets on every exercise not started, no targets to beat', { ci: ci.sets, ml });

    // Finish with sets left asks first; the recap counts only exercises started.
    const fin = await ev(() => { const L = window.__ironlog; const d = L.state.draft; const b = d.ex[0]; b.sets[0].w = b.sets[0].w || 60; b.sets[0].r = 8; b.sets[0].done = true; d._rampAsked = true; L.ACT.finish(); const m = L.ui.modal; return m && m.kind === 'confirm' ? m.title : null; });
    ok(/sets not done/.test(fin || ''), 'Finish with sets left asks first', fin);
    await page.click('#modal [data-act="mOk"]'); await wait(300);
    const rc = await ev(() => { const m = window.__ironlog.ui.modal; return m && m.lines; });
    ok(Array.isArray(rc) && !rc.some(l => /of [2-9]\d* exercise targets? beaten/.test(l) && !/of 1 exercise/.test(l)), 'the recap counts targets only for exercises started', rc);
    await ev(() => window.__ironlog.ACT.mClose());

    // Demo data and a real session never mix.
    const dm = await ev(() => { const L = window.__ironlog; L.state.sessions = []; L.invalidate(); L.makeDemo ? L.makeDemo() : L.ACT.demoLoad(); return L.state.sessions.filter(s => s.demo).length; });
    if (await ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'confirm')) { await page.click('#modal [data-act="mOk"]'); await wait(200); }
    const nd = await ev(() => window.__ironlog.state.sessions.filter(s => s.demo).length);
    await ev(() => { const L = window.__ironlog; L.ACT.startFree(); L.ACT.mClose && L.ACT.mClose(); const d = L.state.draft; d.ex = [L.newBlock('bench', { sets: 1, repMin: 6, repMax: 10, rir: 1, rest: 0 })]; d.ex[0].sets[0].w = 60; d.ex[0].sets[0].r = 8; d.ex[0].sets[0].done = true; d._rampAsked = true; d._leftAsked = true; L.ACT.finish(); });
    await wait(300);
    const mix = await ev(() => { const L = window.__ironlog; return { demo: L.state.sessions.filter(s => s.demo).length, real: L.state.sessions.length, lines: L.ui.modal && L.ui.modal.lines }; });
    ok((dm || nd) > 10 && mix.demo === 0 && mix.real === 1 && mix.lines.some(l => /Demo data removed/.test(l)), 'a real session saved while demo data is loaded removes the demo, and the recap says so', { dm, nd, mix });
    await ev(() => window.__ironlog.ACT.mClose());

    // The demo: one marked deload week, one missed day.
    const dd = await ev(() => { const L = window.__ironlog; L.state.sessions = []; L.invalidate(); L.makeDemo(); const s = L.state.sessions.filter(x => x.demo); return { deload: s.filter(x => x.deload).length, stalled: L.stalledIds().length }; });
    ok(dd.deload >= 2 && dd.stalled === 0, 'the demo has a marked deload week and nothing stalled', dd);
    await ev(() => { const L = window.__ironlog; L.state.sessions = []; L.invalidate(); });

    // A deload week is not averaged into weekly volume.
    const av = await ev(() => { const L = window.__ironlog; const LB = 0.45359237; const S = (id, d, n, dl) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', deload: !!dl, ex: [{ exId: 'bench', sets: Array.from({ length: n }, () => ({ w: 100 * LB, r: 8, rir: 1, warm: false })) }] });
      L.state.sessions = [S('a0', '2026-08-24', 12), S('a1', '2026-08-31', 12), S('a2', '2026-09-07', 12), S('a3', '2026-09-14', 12), S('a4', '2026-09-21', 6, true), S('a5', '2026-09-28', 12)]; L.invalidate(); const a = L.actualAvg4(); return { chest: a.chest, weeks: a._weeks }; });
    ok(av.chest === 12 && av.weeks === 4, 'the weekly average skips the deload week and reaches one week further back', av);

    // Notes: "OHP 3x8 40" is 3 sets of 8 at 40.
    const nt = await ev(() => { const L = window.__ironlog; const r = L.impFromText('Sep 30\nOHP 3x8 40'); const it = r.sessions[0].items[0]; return { name: it.name, sets: L.impTextSets(it, L.EX('ohp'), v => v) }; });
    ok(nt.sets && nt.sets.length === 3 && nt.sets.every(s => s.w === 40 && s.r === 8), 'notes: "OHP 3x8 40" is three sets of 8 at 40', nt);

    // Joints can be flagged.
    const jt = await ev(() => { const L = window.__ironlog; L.state.injuries = [{ id: 'j1', m: 'j_knee', note: '', date: '2026-10-04' }]; L.invalidate(); const s = L.suggest('legPress', { sets: 3, repMin: 10, repMax: 15, rir: 1, rest: 90, inc: 2.27 }, {}); const n = L.normalize(JSON.parse(JSON.stringify(L.state))); return { lp: L.exInjury(L.EX('legPress')), bench: L.exInjury(L.EX('bench')), curl: L.exInjury(L.EX('dbCurl')), text: s.text, kept: n.injuries.map(x => x.m) }; });
    ok(jt.lp === 'j_knee' && jt.bench === null && jt.curl === null && /Knee/.test(jt.text) && jt.kept[0] === 'j_knee', 'a knee flag marks the leg press (not bench or curls), says Knee, and survives a reload', jt);
    await ev(() => { window.__ironlog.state.injuries = []; window.__ironlog.invalidate(); });

    // Swaps: a much harder bodyweight lift is not the pick for a lifter who does not do it.
    const sw = await ev(() => { const L = window.__ironlog; const day = { items: [{ exId: 'seatedCurl', sets: 3, repMin: 10, repMax: 15, rir: 1, rest: 60 }, { exId: 'latPulldown', sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90 }] };
      const p = L.eqPlan(day, new Set(['barbell', 'dumbbell', 'bodyweight'])); return p.map(x => x.to); });
    ok(!sw.includes('nordic') && !sw.includes('pullup') && !sw.includes('chinup'), 'no machines or cables: a leg curl and a pulldown are not swapped for Nordics or pull-ups', sw);

    // Plan editor: a minimum typed above the maximum raises it (through the editor's own input and change handlers).
    const re = await ev(async () => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); const uid = R.days.find(d => d.items.length).items[0].uid;
      const i = document.createElement('input'); i.dataset.it = 'repMin'; i.dataset.uid = uid; document.getElementById('view').appendChild(i); const fire = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };
      fire(i, '14'); await new Promise(r => setTimeout(r, 50)); const it = R.days.flatMap(d => d.items).find(x => x.uid === uid); return [it.repMin, it.repMax]; });
    ok(re[0] === 14 && re[1] === 14, 'a rep minimum typed above the maximum raises the maximum, never saving 12-10', re);

    // Load jump %: overridable per exercise.
    // A 1 kg step (not a unit default, so read as typed) on a 100 kg bench.
    const jp = await ev(() => { const L = window.__ironlog; const e = L.EX('bench'); const r = v => Math.round(v * 1000) / 1000; return { auto: r(L.progStep(e, { inc: 1 }, 100)), ten: r(L.progStep(e, { inc: 1, jump: 10 }, 100)), zero: r(L.progStep(e, { inc: 1, jump: 0 }, 100)) }; });
    ok(jp.auto === 2 && jp.ten === 10 && jp.zero === 1, 'load jump: 2.5% by default (2 whole steps), 10% when set, one step at 0', jp);
    ok(!P.errors.length, 'no page errors (flows)', P.errors);
    await P.browser.close();
  }

  // ---- Small things, routines, the targets note, videos, cardio distance.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-04T10:00:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const rt = await ev(() => { const L = window.__ironlog; const T = L.TEMPLATES.filter(t => !t.hidden); const f3 = L.routineFromTemplate('full3');
      const lib = ['sumoDl', 'pauseSquat', 'pauseBench', 'floorPress', 'powerClean', 'kbSwing'].filter(id => L.state.exercises.some(e => e.id === id));
      return { keys: T.map(t => t.key), f3: f3.days.filter(d => !d.rest).map(d => d.items.length), f3rir: f3.days.flatMap(d => d.items).every(i => i.rir >= 2), lib, legacyHidden: !!L.TEMPLATES.find(t => t.key === 'legacy').hidden }; });
    ok(rt.keys.includes('full2') && rt.keys.includes('str5') && rt.legacyHidden, 'a 2-day plan and a 5 x 5 strength plan are offered', rt.keys);
    ok(rt.f3.every(n => n <= 5) && rt.f3rir, 'the beginner full body has 5 exercises a day, all 2 or more reps in reserve', rt);
    ok(rt.lib.length === 6, 'sumo deadlift, pause squat, paused bench, floor press, power clean, and kettlebell swing are in the library', rt.lib);
    // First-run pick of the beginner plan: Plan says where it is under the usual range.
    await ev(() => { const L = window.__ironlog; const r = L.routineFromTemplate('full3'); L.state.routines = [r]; L.state.activeRoutineId = r.id; L.fitTargets(r); L.state.settings.onboarded = true; L.state.settings.hidden = []; L.ui.tab = 'program'; L.ui.folds['program:pvol'] = true; L.render(); });
    const note = await ev(() => { const n = document.getElementById('planUsual'); return n ? n.innerText : null; });
    ok(note && /Under the usual range in this plan: .*of 10/.test(note), 'Plan, Weekly volume names muscles the fitted plan puts under the usual range', note);
    const st = await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); return document.getElementById('view').innerText; });
    ok(!/Under the usual range/.test(st), 'and nowhere else: Stats stays measured against the plan', null);
    // kg example, Enter in Type sets, how-to link, the equipment sheet.
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'kg'; L.ui.tab = 'today'; L.render(); });
    await page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(200);
    await ev(() => window.__ironlog.ACT.bMenu({ dataset: { b: '0' } })); await wait(100);
    const menu = await ev(() => { const a = document.querySelector('#modal a[href*="youtube.com/results"]'); return a ? { href: a.href, tgt: a.target, rel: a.rel } : null; });
    ok(menu && /search_query=/.test(menu.href) && menu.tgt === '_blank' && /noopener/.test(menu.rel), 'an exercise\'s menu has How-to videos: a YouTube search, opened outside the app', menu);
    await ev(() => { const L = window.__ironlog; L.ACT.mClose(); L.openModal({ kind: 'quick', b: 0 }); }); await wait(100);
    const q = await ev(() => document.getElementById('modal').innerText);
    ok(/100x5, 5, 4 rir 1/.test(q) && !/235x5/.test(q), 'Type sets in kg shows a kg example', q.slice(0, 200));
    await page.fill('#qTxt', '60x8, 8'); await page.press('#qTxt', 'Enter'); await wait(200);
    const qd = await ev(() => { const d = window.__ironlog.state.draft; return { open: !!window.__ironlog.ui.modal, done: d.ex[0].sets.filter(x => x.done).map(x => [x.w, x.r]) }; });
    ok(!qd.open && qd.done.length === 2 && qd.done.every(x => x[0] === 60 && x[1] === 8), 'Enter in Type sets fills them, like the button', qd);
    await ev(() => { const L = window.__ironlog; L.openModal({ kind: 'eq', day: 0, equip: L.EQUIP ? L.EQUIP.map(x => x[0]) : ['barbell', 'dumbbell', 'cable', 'machine', 'smith', 'landmine', 'bodyweight', 'other'] }); }); await wait(100);
    const eq1 = await ev(() => { const s = document.querySelector('#modal .sheet'); const c = document.querySelector('#modal [data-act="eqToggle"][data-k="machine"]'); return { fixed: s.classList.contains('fixed'), top: c.getBoundingClientRect().top }; });
    await page.click('#modal [data-act="eqToggle"][data-k="machine"]'); await wait(100);
    const eq2 = await ev(() => document.querySelector('#modal [data-act="eqToggle"][data-k="cable"]').getBoundingClientRect().top);
    ok(eq1.fixed && Math.abs(eq2 - eq1.top) < 2, 'Limited equipment: the chips stay put as swaps are listed', { eq1, eq2 });
    await ev(() => window.__ironlog.ACT.mClose());
    // Cardio distance, in km here.
    await ev(() => window.__ironlog.ACT.cardioNew()); await wait(100);
    await page.fill('#cMin', '25'); await page.fill('#cDist', '5'); await ev(() => window.__ironlog.ACT.cardioSave()); await wait(100);
    const cd = await ev(() => { const c = window.__ironlog.state.cardio[window.__ironlog.state.cardio.length - 1]; return { min: c.min, dist: c.dist }; });
    ok(cd.min === 25 && cd.dist === 5, 'cardio takes a distance (km when logging in kg)', cd);
    ok(!P.errors.length, 'no page errors (small things)', P.errors);
    await P.browser.close();
  }

  // ---- An untouched edit of a saved session closes without asking.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-04T10:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.sessions = [{ id: 's1', date: '2026-10-02', dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 1, warm: false }] }] }]; L.invalidate(); L.saveNow(); });
    await ev(() => window.__ironlog.ACT.histEdit({ dataset: { id: 's1' } })); await wait(200);
    await ev(() => window.__ironlog.ACT.discard()); await wait(150);
    const e = await ev(() => ({ modal: window.__ironlog.ui.modal && window.__ironlog.ui.modal.title, draft: !!window.__ironlog.state.draft, toast: document.getElementById('toast').innerText }));
    ok(!e.modal && !e.draft && /No changes/.test(e.toast), 'cancelling an edit with no change closes it without "Discard this session?"', e);
    ok(!P.errors.length, 'no page errors (edit)', P.errors);
    await P.browser.close();
  }

  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
