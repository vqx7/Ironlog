// r54b: V's one rule for every session (PENDING 312 E, V 2026-10-18: "a
// lift counts toward its next target only at its usual load and reps for its
// usual sets; fewer sets still count for its trend and PRs, and the target
// repeats"; 317 (e) a bad day falls short too, one session clearly under its
// usual repeats the target and two in a row the app follows; (f) a lift's
// usual sets are what it did in most of its last three sessions, never more
// than the plan), replacing the trimmed mark and r30's half rule; a lift back
// after a break; and the plan a lift is done at (PENDING 313). Each case fails
// on r53 (`node tests/r54b.js baselines/r53.html`) unless it says it guards
// what r53 already did:
//   - fewer sets than usual repeats the target, its trend and PRs counting,
//     and Last says "fewer sets"; a lifter who does more sets than planned is
//     not short when doing the plan's (a guard);
//   - a bad day repeats the target, Last says "below usual" and grey reps
//     come from the session before it; a second in a row is followed;
//   - a session r53 saved as trimmed is read by the one rule, its trend
//     counting, and one whose sets were filled in later is a full session
//     (311 d); a lighter day at the usual load with fewer sets is short of
//     the usual, its trend counting;
//   - after a break the first session back sets the next target ("Next time
//     picks up from here"), a trend does not run across the break, and a
//     Lighter day as the first session back leaves the next one "back";
//   - two sessions under the range in a row, the first a bad day, still drop
//     the load (a guard), and two half-set lighter days never become the
//     usual (a guard);
//   - History tags a session with fewer sets than usual, and names each
//     lift's reading; Finish's question about sets left says the one rule;
//   - a lift on no day of the routine takes its plan from its last session
//     that sets a target, as the analytics read it, up to the date logged;
//   - the usual load on a lighter day is the working load, not a heavy
//     single; a lift counted in full on a lighter day is one of the sessions
//     a later one is read lighter against;
//   - Finish's offer after a lighter day adds Pick for me's own count;
//   - a week tagged as a deload, every lift done in full, is no lighter week
//     and stays in the weekly averages (313 e);
//   - a PR is announced as the set is logged on any day, and a bodyweight
//     lift before any weigh-in has its rep PRs listed and announced (311 a);
//   - a blank session in a week marked as a deload is a deload, an exercise
//     added to it at half its sets (311 c);
//   - a goal reads every set of the last 12 weeks, a lighter day's too, as
//     the bests do (311 e);
//   - Finish keeps an injury's hold on the saved exercise, and a lift held
//     for an injury since cleared is not read as stalled (311 g);
//   - an assisted lift's first session shows no help in grey, and Finish
//     asks for the help used (315 i);
//   - a change of units or gyms is not a PR (the 155 lb case of 315): in the
//     PR list, as the set is logged and in the toast's numbers, for a
//     barbell either way, dumbbells and an assisted lift, while a step past
//     the old load and a rep more at the same weight still are;
//   - a lift trained in two rep ranges is stalled only when every range in
//     use is (312 A), and at the top of its range, on Stats and in the coach,
//     by the plan of the day it was last done on (found after the review);
//   - the sign-in sheet keeps its fields through a wrong password (311 f),
//     and sheets do not move with the keyboard (322);
//   - from the independent review of r54: a session's sets are its sets near
//     its working load and any at its usual load, so a lighter or heavier set
//     among them, or a load lowered mid-session, is no "fewer sets", while a
//     back-off set a tenth or more lighter is no usual set; a set beyond the
//     usual never counts against a session, on any day; and the stall's
//     weeks are those the stall test read, held sessions left out. Each
//     fails on the build the review read (2478d73) but the back-off set,
//     which guards it; on r53, which marked no session short, the lighter,
//     heavier and extra sets guard what it did, and the rest fail.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || 'index.html';

(async () => {
  const P = await open(FILE, { clock: '2026-10-15T10:00:00', realStarter: true });
  const { page } = P; const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg'; L.saveNow(); L.render(); });
  // A log of these sessions only, nothing in progress, no deload week or injury.
  const log = sessions => ev(sessions => { const L = window.__ironlog; const s = L.state; s.sessions = sessions; s.draft = null; s.deloadWeek = null; s.injuries = []; L.state = L.normalize(s); L.invalidate(); L.saveNow(); L.render(); }, sessions);
  // One lift's session on a date, sets as [load, reps, rir]; o adds the session's marks, o.ex the exercise's.
  const ses = (id, date, exId, rr, sets, o) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ...(o || {}), ex: [{ exId, rr, ...((o && o.ex) || {}), sets: sets.map(([w, r, rir]) => ({ w, r, rir: rir == null ? 1 : rir, warm: false, drop: false })) }] });
  const x = (w, reps, rir) => reps.map(r => [w, r, rir]);
  // How the analytics read one lift's session: done lighter, short of its usual (r54), and the label it carried.
  const read = (exId, sid) => ev(([exId, sid]) => { const L = window.__ironlog; const q = (L.IDX().byEx[exId] || []).find(e => e.sid === sid); return q ? { light: q.light, deload: q.deload, auto: !!q.auto, short: q.short || null } : null; }, [exId, sid]);
  // The next suggestion for a lift at a plan.
  const next = (exId, plan, opts) => ev(([exId, plan, opts]) => { const L = window.__ironlog; const g = L.suggest(exId, plan, opts || {}); return { w: g.w, target: g.target, text: g.text, lastR: g.lastR, basis: g.basis || null, last: g.last || '' }; }, [exId, plan, opts]);
  // How many sessions a lift's trend reads (its sessions in the trend's window that have a reading).
  const trendN = exId => ev(exId => { const st = window.__ironlog.IDX().exStats[exId]; return st ? st.wN : null; }, exId);
  const P4 = { sets: 4, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5 }, P3 = { ...P4, sets: 3 };

  // ---- Fewer sets than usual (a session stopped early): the target repeats; the trend and the PR count.
  {
    const base = [ses('fa1', '2026-10-01', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])), ses('fa2', '2026-10-08', 'floorPress', [6, 10], x(100, [8, 8, 8, 8]))];
    await log(base); const before = await next('floorPress', P4);
    await log([...base, ses('fa3', '2026-10-12', 'floorPress', [6, 10], x(100, [9, 9, 9]))]);
    const after = await next('floorPress', P4); const r = await read('floorPress', 'fa3'); const n = await trendN('floorPress');
    const pr = await ev(() => window.__ironlog.IDX().prs.filter(p => p.sid === 'fa3' && p.big).map(p => p.type));
    ok(r && r.short === 'sets' && after.target === before.target && after.w === before.w && after.basis === '2026-10-08' && /^Last \(Oct 12, fewer sets\): /.test(after.text), 'floor press, 100 x 8 x 4 twice, then 100 x 9, 9 and 9, stopped a set early: short of its usual sets, so the target repeats (' + before.target + '), from Oct 8, and Last says fewer sets', { r, before, after });
    ok(n === 3 && pr.length === 1, 'its trend reads it (3 sessions) and its PR (100 x 9, stronger than ever) counts', { n, pr });
  }
  // A lifter who does more sets than the plan asks: the starter's bench is planned at 4; done at 5, then 4, the 4 is the plan's, so not short (a guard: r53 read 4 of 5 as full too).
  {
    await log([ses('fb1', '2026-10-01', 'bench', [6, 10], x(100, [8, 8, 8, 8, 8])), ses('fb2', '2026-10-08', 'bench', [6, 10], x(100, [8, 8, 8, 8, 8])), ses('fb3', '2026-10-12', 'bench', [6, 10], x(100, [9, 9, 9, 9]))]);
    const r = await read('bench', 'fb3'); const nx = await next('bench', P4);
    ok(r && !r.short && !nx.basis && /^37\+ reps over 4 sets at 100 kg$/.test(nx.target || ''), 'bench press planned at 4 sets, done at 5 twice, then 4: the plan\'s 4 are its usual, so the session sets the next target (37+ reps over 4 sets)', { r, nx });
  }

  // ---- A bad day: the target repeats, and grey reps come from the session before; a second in a row is followed.
  {
    const base = [ses('ba1', '2026-10-01', 'floorPress', [6, 10], x(100, [8, 8, 8])), ses('ba2', '2026-10-08', 'floorPress', [6, 10], x(100, [8, 8, 8]))];
    await log(base); const before = await next('floorPress', P3);
    await log([...base, ses('ba3', '2026-10-12', 'floorPress', [6, 10], x(100, [6, 6, 5]))]);
    const after = await next('floorPress', P3); const r = await read('floorPress', 'ba3');
    ok(r && r.short === 'reading' && after.target === before.target && JSON.stringify(after.lastR) === '[8,8,8]' && /^Last \(Oct 12, below usual\): /.test(after.text), 'floor press 100 x 8 x 3 twice, then 6, 6 and 5: a bad day, so the target repeats (' + before.target + '), Last says below usual, and the grey reps are the 8s of the session before', { r, before, after });
    await log([...base, ses('ba3', '2026-10-12', 'floorPress', [6, 10], x(100, [6, 6, 5])), ses('ba4', '2026-10-14', 'floorPress', [6, 10], x(100, [6, 6, 5]))]);
    const two = await next('floorPress', P3); const r4 = await read('floorPress', 'ba4');
    ok(r4 && !r4.short && !two.basis && /^19\+ reps over 3 sets at 100 kg$/.test(two.target || '') && /^Last \(Oct 14\): /.test(two.text), 'the same again two days later: two in a row, so the app follows it, and the next target is 19+ reps over 3 sets (the 5 counting as 6)', { r4, two });
  }

  // ---- A session r53 saved as trimmed is read by the one rule: short of its usual sets, its trend counting, the target repeating.
  {
    await log([ses('ca1', '2026-09-24', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])), ses('ca2', '2026-10-01', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])), ses('ca3', '2026-10-08', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])),
      ses('ca4', '2026-10-12', 'floorPress', [6, 10], x(102.5, [8, 8, 8]), { ex: { cut: true } })]);
    const r = await read('floorPress', 'ca4'); const n = await trendN('floorPress'); const nx = await next('floorPress', P4);
    const kept = await ev(() => window.__ironlog.state.sessions.find(s => s.id === 'ca4').ex[0].cut === true);
    ok(r && r.short === 'sets' && n === 4 && nx.basis === '2026-10-08', 'a session saved as trimmed before r54 (102.5 x 8 x 3 after 100 x 8 x 4): short of its usual sets, so its target comes from Oct 8, and its trend now reads it (4 sessions)', { r, n, nx });
    ok(kept, 'the mark it was saved with is kept as saved (normalize keeps it; nothing reads it since r54)');
  }
  // A session saved as trimmed whose two forgotten sets were added later in History (PENDING 311 d): read again from its sets, a full session, so it sets the next target (r53: trimmed still, its target from the week before).
  {
    await log([ses('cb1', '2026-09-24', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])), ses('cb2', '2026-10-01', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])),
      ses('cb3', '2026-10-08', 'floorPress', [6, 10], x(100, [9, 9, 9, 9]), { ex: { cut: true } })]);
    const r = await read('floorPress', 'cb3'); const nx = await next('floorPress', P4);
    ok(r && !r.short && !nx.basis && /^37\+ reps over 4 sets at 100 kg$/.test(nx.target || ''), 'floor press saved as trimmed, its sets since filled in to 100 x 9 x 4: a full session, so the next target comes from it (37+ reps over 4 sets)', { r, nx });
  }
  // A lighter day at the usual load, half the sets: short of the usual, its trend counting, the target repeating.
  {
    await log([ses('da1', '2026-09-24', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])), ses('da2', '2026-10-01', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])), ses('da3', '2026-10-08', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])),
      ses('da4', '2026-10-12', 'floorPress', [6, 10], x(102.5, [8, 8]), { light: true, dayName: 'Session (lighter)' })]);
    const r = await read('floorPress', 'da4'); const n = await trendN('floorPress'); const nx = await next('floorPress', P4);
    ok(r && r.light === false && r.short === 'sets' && n === 4 && nx.basis === '2026-10-08', 'a Lighter day at 102.5 x 8 x 2 after 100 x 8 x 4: done at its usual load and reps, so not lighter, but short of its usual sets: the trend reads it and the target still comes from Oct 8', { r, n, nx });
  }

  // ---- Back after a break.
  const august = ['2026-08-03', '2026-08-06', '2026-08-10', '2026-08-13', '2026-08-17', '2026-08-20', '2026-08-24', '2026-08-27'].map((d, i) => ses('au' + i, d, 'floorPress', [8, 12], x(100, [10, 10, 9])));
  const P8 = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 120, inc: 2.5 };
  {
    await log(august); const back = await next('floorPress', P8);
    ok(back.w === 90 && /Back after 7 weeks: about 90 kg/.test(back.text) && /Next time picks up from here\./.test(back.text), 'floor press seven weeks off: back at about 90 kg, and next time picks up from there', back);
    await log([...august, ses('bk1', '2026-10-15', 'floorPress', [8, 12], x(90, [8, 8, 8], 2))]);
    const r = await read('floorPress', 'bk1'); const nx = await next('floorPress', P8);
    ok(r && !r.auto && !r.short && nx.w === 90 && /^25\+ reps over 3 sets at 90 kg$/.test(nx.target || '') && !nx.basis, 'that session done, 90 x 8 x 3 at 2 in reserve: it is the lift\'s new start, not read lighter than August, so the next target picks up from it (25+ reps over 3 sets at 90 kg), not from August\'s 100', { r, nx });
  }
  {
    await log([...august, ses('bt1', '2026-10-01', 'floorPress', [8, 12], x(90, [8, 8, 8], 2)), ses('bt2', '2026-10-04', 'floorPress', [8, 12], x(92.5, [9, 9, 8])), ses('bt3', '2026-10-08', 'floorPress', [8, 12], x(95, [9, 8, 8]))]);
    const t = await ev(() => { const L = window.__ironlog; const st = L.IDX().exStats.floorPress; return { pct: st.pct, falling: st.falling, wN: st.wN, head: L.exHeadline('floorPress').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }; });
    ok(t.pct === null && !t.falling && t.wN === 3 && !/Down/.test(t.head), 'five weeks off, then 90, 92.5 and 95 kg: the trend starts again from the first session back (3 sessions in a week, no trend yet), never "down" across the break', t);
  }
  {
    await log([...august, ses('bl1', '2026-10-12', 'floorPress', [8, 12], x(90, [8, 8], 3), { light: true, dayName: 'Session (lighter)' })]);
    const nx = await next('floorPress', P8);
    ok(/Back after 7 weeks: about 90 kg/.test(nx.text) && nx.w === 90, 'a Lighter day as the first session back sets no target, so the next session is still back after 7 weeks, at about 90 kg, not August\'s 100', nx);
  }

  // ---- Guards: two under the range in a row, the first a bad day, still drop the load; two half-set lighter days never become the usual.
  {
    await log([ses('ua1', '2026-09-24', 'floorPress', [6, 10], x(100, [8, 8, 8])), ses('ua2', '2026-10-01', 'floorPress', [6, 10], x(100, [8, 8, 8])), ses('ua3', '2026-10-08', 'floorPress', [6, 10], x(100, [5, 5, 5])), ses('ua4', '2026-10-12', 'floorPress', [6, 10], x(100, [5, 5, 5]))]);
    const nx = await next('floorPress', P3);
    ok(nx.w < 100 && /Drop to /.test(nx.text), 'floor press under its range twice running at 100 kg, the first a bad day: the load drops (r32\'s rule, kept)', nx);
  }
  {
    const base = [ses('ha1', '2026-09-24', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])), ses('ha2', '2026-10-01', 'floorPress', [6, 10], x(100, [8, 8, 8, 8]))];
    await log(base); const before = await next('floorPress', P4);
    const lt = (id, d) => ses(id, d, 'floorPress', [6, 10], x(100, [8, 8]), { light: true, dayName: 'Session (lighter)' });
    await log([...base, lt('hl1', '2026-10-06'), lt('hl2', '2026-10-09')]);
    const after = await next('floorPress', P4); const r = await read('floorPress', 'hl2');
    ok(r && r.short === 'sets' && after.target === before.target, 'two Lighter days in a row, each half the sets at the usual load: both short of the usual, never the new usual, so the target is still the four-set one', { r, before, after });
  }

  // ---- History tags a session with fewer sets than usual, and names each lift's reading in it.
  {
    await log([ses('ja1', '2026-09-24', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])), ses('ja2', '2026-10-01', 'floorPress', [6, 10], x(100, [8, 8, 8, 8])), ses('ja3', '2026-10-08', 'floorPress', [6, 10], x(100, [8, 8, 8]))]);
    const h = await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.ui.histOpen = 'ja3'; L.render(); const rows = [...document.querySelectorAll('.hitem')].map(e => e.innerText.replace(/\s+/g, ' ').trim()); return rows; });
    ok(/fewer sets/.test(h[0] || '') && /Floor Press fewer sets:/.test(h[0] || '') && !/fewer sets/.test(h[1] || ''), 'History: the session with a set fewer than usual is tagged fewer sets, and its panel says it of the floor press; the sessions before are not', h.slice(0, 2));
  }

  // ---- Finish's question about sets left says the one rule (r53: "saved as trimmed").
  {
    await log([]);
    await ev(() => { const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; const b = d.ex[0]; b.sets[0].w = 60; b.sets[0].r = 8; b.sets[0].done = true; d._rampAsked = true; L.saveNow(); L.ACT.finish(); });
    await wait(150);
    const q = await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? document.getElementById('modal').innerText.replace(/\s+/g, ' ') : ''; });
    ok(/An exercise with fewer sets than usual does not set your next target, and still counts toward its trend\./.test(q) && !/trimmed/.test(q), 'Finish with sets left: an exercise with fewer sets than usual does not set the next target, and still counts toward its trend', q);
    await ev(() => { const L = window.__ironlog; L.ACT.mClose(); L.state.draft = null; L.saveNow(); });
  }

  // ---- The plan a lift on no day of the routine is done at: its last session that sets a target, as the analytics read it.
  {
    const F = (id, d, w, reps, o) => ses(id, d, 'frontSquat', [3, 5], reps.map(r => [w, r, 1]), o);
    await log([F('la1', '2026-09-17', 100, [5, 5, 5, 5, 5]), F('la2', '2026-09-24', 100, [5, 5, 5, 5, 5]), F('la3', '2026-10-01', 100, [5, 5, 5, 5, 5]), F('la4', '2026-10-08', 85, [3, 3, 3])]);
    const p1 = await ev(() => window.__ironlog.planFor('frontSquat').sets); const r1 = await read('frontSquat', 'la4');
    ok(r1 && r1.auto && p1 === 5, 'front squat, on no day of the routine: after an untagged deload (85 x 3 x 3, read lighter from its loads) it comes in at its last full session\'s 5 sets, not the deload\'s 3', { p1, r1 });
    await log([F('lb1', '2026-09-24', 100, [5, 5, 5, 5]), F('lb2', '2026-10-01', 100, [5, 5, 5, 5]), F('lb3', '2026-10-08', 100, [5, 5, 5, 5, 5], { light: true, dayName: 'Session (lighter)' })]);
    const p2 = await ev(() => window.__ironlog.planFor('frontSquat').sets);
    ok(p2 === 5, 'done at its usual load and reps on a Lighter day, five sets after four: that session is its last full one, so it comes in at 5 sets', p2);
    await log([F('lc1', '2026-10-01', 100, [5, 5, 5]), F('lc2', '2026-10-10', 100, [5, 5, 5, 5, 5])]);
    await ev(() => window.__ironlog.ACT.pastOpen({ dataset: { date: '2026-10-05' } })); await wait(100);
    await page.click('[data-act="pastGo"][data-day="free"]'); await wait(150);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.pickSession(); L.ACT.pickDo({ dataset: { ex: 'frontSquat' } }); }); await wait(150);
    const past = await ev(() => { const d = window.__ironlog.state.draft; const b = d && d.ex.find(q => q.exId === 'frontSquat'); return { date: d && d.date, past: d && d.past, sets: b ? b.sets.filter(q => !q.warm).length : null }; });
    ok(past.past && past.date === '2026-10-05' && past.sets === 3, 'added to a past workout on Oct 5, it comes in at its last session up to that date, 3 sets on Oct 1, not the 5 done on Oct 10', past);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
  }

  // ---- The usual load on a lighter day is the working load: a heavy single left out, the back-off sets as usual, is a full session.
  {
    const S = (id, d, sets, o) => ses(id, d, 'backSquat', [6, 10], sets, o);
    const usual = [[120, 3, 1], [100, 8, 1], [100, 8, 1], [100, 8, 1]];
    await log([S('oa1', '2026-09-24', usual), S('oa2', '2026-10-01', usual), S('oa3', '2026-10-08', usual), S('oa4', '2026-10-12', x(100, [8, 8, 8]), { light: true, dayName: 'Lower A (lighter)' })]);
    const r = await read('backSquat', 'oa4'); const nx = await next('backSquat', P3);
    ok(r && r.light === false && !r.short && !nx.basis, 'back squat opened with 120 x 3 before 100 x 8 x 3 every time; on a Lighter day the 100s alone, as usual: a full session, so the next target comes from it', { r, nx });
  }
  // A lift counted in full on a lighter day is one of the sessions a later one is read lighter against (PENDING 313 b).
  {
    await log([ses('qa1', '2026-09-17', 'floorPress', [6, 10], x(90, [8, 8, 8])), ses('qa2', '2026-09-24', 'floorPress', [6, 10], x(95, [8, 8, 8])),
      ses('qa3', '2026-10-01', 'floorPress', [6, 10], x(100, [8, 8, 8]), { light: true, dayName: 'Session (lighter)' }), ses('qa4', '2026-10-08', 'floorPress', [6, 10], x(90, [6, 6, 6]))]);
    const r3 = await read('floorPress', 'qa3'); const r4 = await read('floorPress', 'qa4'); const nx = await next('floorPress', P3);
    ok(r3 && r3.light === false && r4 && r4.auto && nx.basis === '2026-10-01', 'a Lighter day at 100 x 8 x 3 after 90 and 95, its usual and more: full; then 90 x 6 x 3, a tenth under it and weaker, reads lighter, so the target comes from the 100s', { r3, r4, nx });
  }

  // ---- Finish's offer after a lighter day adds Pick for me's own count, as after a normal day (PENDING 313 g).
  {
    await log([]);
    await ev(() => { const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0', light: '1' } }); L.saveNow(); L.render(); }); await wait(150);
    await ev(() => window.__ironlog.ACT.pickEx()); await wait(150);
    const card = await ev(() => { const b = document.querySelector('#modal [data-act="pickExAdd"]'); return b ? { ex: b.dataset.ex, sets: +b.dataset.sets, full: +b.dataset.full } : null; });
    ok(card && card.full >= 1 && card.sets === Math.max(1, Math.ceil(card.full / 2)), 'Pick for me on a Lighter day offers half its count, and keeps the count it halved', card);
    if (card) {
      await ev(() => document.querySelector('#modal [data-act="pickExAdd"]').click()); await wait(150);
      const blk = await ev((id) => { const b = window.__ironlog.state.draft.ex.find(q => q.exId === id); return b ? { full: b.full, rows: b.sets.filter(q => !q.warm).length } : null; }, card.ex);
      ok(blk && blk.full === card.full && blk.rows === card.sets, 'the exercise comes in at half, carrying the count before', blk);
      const upd = await ev((id) => { const L = window.__ironlog; const d = L.state.draft; const b = d.ex.find(q => q.exId === id); b.sets.forEach(s => { s.w = s.w == null ? 20 : s.w; s.r = 10; s.done = true; }); const u = L.routineUpdates(d); return u ? (u.add.find(a => a.exId === id) || {}).plan : null; }, card.ex);
      ok(upd && upd.sets === card.full, 'Finish\'s offer puts it in the routine at Pick for me\'s count, ' + card.full + ' sets, as a normal day would', { upd, card });
      // Pick for me chooses 2 for a muscle near its target; the plan's count is 3: the offer is Pick for me's (r53 offered the plan's).
      const two = await ev((id) => { const L = window.__ironlog; const d = L.state.draft; const b = d.ex.find(q => q.exId === id); b.full = 2; const u = L.routineUpdates(d); return { offer: u ? (u.add.find(a => a.exId === id) || {}).plan.sets : null, plan: L.planFor(id, null, d.dayId).sets }; }, card.ex);
      ok(two.offer === 2 && two.plan === 3, 'with Pick for me\'s count at 2 and the plan\'s at 3, the offer is 2', two);
    }
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
  }

  // ---- A week whose every session was tagged a deload, each lift at its usual work, is no lighter week: it stays in the weekly averages (PENDING 313 e).
  {
    const days = ['2026-09-14', '2026-09-17', '2026-09-21', '2026-09-24', '2026-09-28', '2026-10-01', '2026-10-05', '2026-10-08'];
    await log(days.map((d, i) => ses('lw' + i, d, 'bench', [6, 10], x(100, [8, 8, 8]), d >= '2026-09-28' && d < '2026-10-05' ? { deload: true, dayName: 'Session (deload)' } : undefined)));
    const w = await ev(() => { const L = window.__ironlog; const a = L.avgWeeks(4); return { light: !!L.IDX().lightWk['2026-09-28'], left: a ? a._light : null, chest: a ? a.chest : null, tags: L.IDX().byEx.bench.filter(q => q.date >= '2026-09-28' && q.date < '2026-10-05').map(q => [q.deload, q.tag || null]) }; });
    ok(!w.light && w.left === 0 && w.chest === 6 && JSON.stringify(w.tags) === '[[false,"deload"],[false,"deload"]]', 'bench 100 x 8 x 3 twice a week for four weeks, the third week\'s two sessions tagged deload but done in full: not a lighter week, so the weekly average keeps it (6 chest sets a week; r53 left the week out by its label)', w);
  }

  // ---- A PR is announced as the set is logged on any day (PENDING 311 a; r53 counted it, shown at Finish only).
  {
    await log(['2026-09-24', '2026-10-01', '2026-10-08'].map((d, i) => ses('pa' + i, d, 'bench', [6, 10], x(100, [8, 8, 8]))));
    await ev(() => { const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0', light: '1' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench'); L.saveNow(); L.render(); }); await wait(150);
    const W = '.sg input[data-f="w"][data-b="0"][data-s="0"]', R = '.sg input[data-f="r"][data-b="0"][data-s="0"]';
    await page.fill(W, '105'); await page.dispatchEvent(W, 'input'); await page.dispatchEvent(W, 'change');
    await page.fill(R, '8'); await page.dispatchEvent(R, 'input'); await page.dispatchEvent(R, 'change');
    if (!(await ev(() => window.__ironlog.state.draft.ex[0].sets[0].done))) await page.click('[data-act="sDone"][data-b="0"][data-s="0"]');
    await wait(150);
    const t = await ev(() => { const row = document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').closest('.sg'); const el = document.getElementById('toast'); const toast = el && !el.hidden ? el.innerText : ''; return { light: window.__ironlog.state.draft.light, pr: row.getAttribute('data-pr'), toast }; });
    ok(t.light && t.pr === 'Weight PR' && /Weight PR: Barbell Bench Press/.test(t.toast), 'a Lighter day, the bench at 105 x 8 after 100 x 8 every week: the PR is announced as the set is logged, as on any day', t);
    // This set started the device's first rest, which says once, 0.6 s later, that a locked screen holds the rest alert: it
    // waits for the PR's message to go, where it used to take its place (found in r54, a run where this check read the toast late).
    await wait(1000);
    const t2 = await ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText : ''; });
    const tip = await page.waitForFunction(() => { const el = document.getElementById('toast'); return !!el && !el.hidden && /A locked screen holds the rest alert/.test(el.innerText); }, null, { timeout: 9000 }).then(() => true, () => false);
    ok(/Weight PR: Barbell Bench Press/.test(t2) && tip, 'the first rest\'s one-time tip about a locked screen waits until the PR\'s message has gone, then shows (it took the PR\'s place 0.6 s after the set)', { t2, tip });
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
  }
  // A bodyweight lift before any weigh-in has no load to score a set by: its rep PRs count, listed and announced (the sixth review of r53).
  {
    await ev(() => { const L = window.__ironlog; L.state.bodyweights = []; L.saveNow(); });
    await log([ses('pu1', '2026-10-01', 'pullup', [6, 10], x(0, [8, 8, 8])), ses('pu2', '2026-10-08', 'pullup', [6, 10], x(0, [8, 8, 8])), ses('pu3', '2026-10-12', 'pullup', [6, 10], x(0, [10, 8, 8]))]);
    const listed = await ev(() => { const L = window.__ironlog; return { bw: L.state.bodyweights.length, prs: L.IDX().prs.filter(p => p.sid === 'pu3' && p.big).map(p => p.type) }; });
    ok(listed.bw === 0 && JSON.stringify(listed.prs) === '["Rep PR"]', 'pull-ups with no weigh-in, 10 reps after 8s: a rep PR, listed and counted', listed);
    await ev(() => { const L = window.__ironlog; L.state.sessions = L.state.sessions.filter(q => q.id !== 'pu3'); L.invalidate(); L.saveNow(); L.ACT.startSession({ dataset: { day: '3', light: '0' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'pullup'); L.saveNow(); L.render(); }); await wait(150);
    const R = '.sg input[data-f="r"][data-b="0"][data-s="0"]';
    await page.fill(R, '10'); await page.dispatchEvent(R, 'input'); await page.dispatchEvent(R, 'change');
    if (!(await ev(() => window.__ironlog.state.draft.ex[0].sets[0].done))) await page.click('[data-act="sDone"][data-b="0"][data-s="0"]');
    await wait(150);
    const live = await ev(() => { const row = document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').closest('.sg'); return { id: window.__ironlog.state.draft.ex[0].exId, pr: row.getAttribute('data-pr') }; });
    ok(live.id === 'pullup' && live.pr === 'Rep PR', 'and live: 10 pull-ups in a session after 8s is announced as a rep PR', live);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
  }

  // ---- The independent review of r54: a session's sets are its sets near its working load, not only those at it, and a
  // set beyond its usual never counts against it; the stall's weeks are those of the sessions the stall test read.
  {
    const P3 = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 120, inc: 2.5 }, P4x = { ...P3, sets: 4 };
    const tagOf = (exId, sid) => ev(([exId, sid]) => { const q = (window.__ironlog.IDX().byEx[exId] || []).find(e => e.sid === sid); return q ? { light: q.light, tag: q.tag || null, short: q.short || null } : null; }, [exId, sid]);
    // All four planned sets, the last 2.5 kg lighter: a full session, its target from it (before the fix: "fewer sets", counting the three at 100).
    await log([ses('ra1', '2026-10-01', 'bench', [8, 12], x(100, [9, 9, 9, 9])), ses('ra2', '2026-10-05', 'bench', [8, 12], x(100, [10, 9, 9, 9])), ses('ra3', '2026-10-09', 'bench', [8, 12], [[100, 10], [100, 9], [100, 9], [97.5, 9]])]);
    const a = await read('bench', 'ra3'), na = await next('bench', P4x);
    ok(a && !a.short && !na.basis && /^Last \(Oct 9\): /.test(na.text), 'bench 100 x 10, 9 and 9, then 97.5 x 9: all four planned sets, a full session that sets the next target (it read as fewer sets, counting only the three at 100)', { a, na });
    // A heavier last set: 100 x 9, 9, then 102.5 x 7 after 100 x 8 x 3 twice, every planned set done.
    await log([ses('rb1', '2026-10-01', 'bench', [6, 10], x(100, [8, 8, 8])), ses('rb2', '2026-10-05', 'bench', [6, 10], x(100, [8, 8, 8])), ses('rb3', '2026-10-09', 'bench', [6, 10], [[100, 9], [100, 9], [102.5, 7]])]);
    const b = await read('bench', 'rb3'), nb = await next('bench', { ...P3, repMin: 6, repMax: 10 });
    ok(b && !b.short && !nb.basis, 'bench 100 x 9, 9, then 102.5 x 7 after 100 x 8 x 3 twice: every planned set, the last tried a step up, a full session (it read as fewer sets)', { b, nb });
    // A set a tenth or more under the working load is no usual set: 100 x 9, 9 and a back-off set of 80 x 12 after 100 x 8 x 3 twice
    // is two sets at the usual load, fewer sets, so its target repeats. The review's build did the same (it counted only the sets at the
    // working load), so this guards it; counting every lighter set read the session as full, its next target 19+ reps over the first 2 sets.
    await log([ses('rk1', '2026-10-01', 'bench', [6, 10], x(100, [8, 8, 8])), ses('rk2', '2026-10-05', 'bench', [6, 10], x(100, [8, 8, 8])), ses('rk3', '2026-10-09', 'bench', [6, 10], [[100, 9], [100, 9], [80, 12]])]);
    const k = await read('bench', 'rk3'), nk = await next('bench', { ...P3, repMin: 6, repMax: 10 });
    ok(k && k.short === 'sets' && nk.basis === '2026-10-05' && /^Last \(Oct 9, fewer sets\): /.test(nk.text), 'bench 100 x 9, 9 and a back-off set of 80 x 12 after 100 x 8 x 3 twice: two sets at the usual load, so fewer sets and the target repeats from Oct 5', { k, nk });
    // The load lowered after a bad first set: all three sets done, a bad day, "below usual", its target repeating.
    await log([ses('rc1', '2026-10-01', 'bench', [8, 12], x(100, [9, 9, 9])), ses('rc2', '2026-10-05', 'bench', [8, 12], x(100, [10, 9, 9])), ses('rc3', '2026-10-09', 'bench', [8, 12], [[100, 6, 0], [90, 9], [90, 9]])]);
    const c = await read('bench', 'rc3'), nc = await next('bench', P3);
    ok(c && c.short === 'reading' && nc.basis === '2026-10-05' && /^Last \(Oct 9, below usual\): /.test(nc.text), 'bench 100 x 6, then 90 x 9 and 9 after 100 x 9 x 3: every set done, a bad day, so below usual and its target repeats (it read as fewer sets)', { c, nc });
    // The same through the page, the load lowered further than a tenth by the app itself (the review's reproduction): the starter's
    // bench, planned at 4 sets of 6 to 10, 100 x 7 x 4 twice; set 1 today stops at 3, so the app lowers the rest to 82.5 (r34), done
    // for 7 each, then Finish. The set at 100 is a set at the usual load, so all four planned sets were done: below usual, not fewer sets.
    {
      const plan = await ev(() => { const it = window.__ironlog.activeRoutine().days[0].items.find(i => i.exId === 'bench'); return { sets: +it.sets, repMin: +it.repMin, repMax: +it.repMax }; });
      const rr = [plan.repMin, plan.repMax];
      await log([ses('rj1', '2026-10-01', 'bench', rr, x(100, Array(plan.sets).fill(plan.repMin + 1))), ses('rj2', '2026-10-08', 'bench', rr, x(100, Array(plan.sets).fill(plan.repMin + 1)))]);
      await ev(() => { const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench'); L.saveNow(); L.render(); }); await wait(200);
      const typ = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'input'); await page.dispatchEvent(sel, 'change'); };
      const tick = async (si, w, r) => {
        if (w != null) await typ(`.sg input[data-f="w"][data-b="0"][data-s="${si}"]`, w);
        await typ(`.sg input[data-f="r"][data-b="0"][data-s="${si}"]`, r);
        if (!(await ev(si => window.__ironlog.state.draft.ex[0].sets[si].done, si))) await page.click(`[data-act="sDone"][data-b="0"][data-s="${si}"]`);
        await wait(150);
      };
      await tick(0, 100, plan.repMin - 3);
      const adj = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return b.adj ? b.adj.w : null; });
      for (let si = 1; si < plan.sets; si++) await tick(si, null, plan.repMin + 1);
      await ev(() => window.__ironlog.ACT.finish()); await wait(300);
      await ev(() => { const L = window.__ironlog; L.ui.modal = null; L.render(); });
      const j = await ev(() => { const L = window.__ironlog; const xs = L.IDX().byEx.bench; const q = xs[xs.length - 1]; const g = L.suggest('bench', L.planFor('bench'), {}); return { saved: L.state.sessions.length, short: q.short || null, text: g.text, target: g.target, basis: g.basis || null }; });
      ok(plan.sets === 4 && adj === 82.5 && j.saved === 3 && j.short === 'reading' && j.basis === '2026-10-08' && /^Last \(Oct 15, below usual\): 100×3, 82\.5×7, 82\.5×7, 82\.5×7\. /.test(j.text) && /^29\+ reps over 4 sets at 100 kg$/.test(j.target || ''), 'the starter\'s bench, set 1 stopped at 3 and the rest at the 82.5 the app lowered it to, through the page: all four planned sets, a bad day, so below usual and the target repeats (29+ reps over 4 sets at 100 kg; it read as fewer sets)', { plan, adj, j });
    }
    // An extra set of 5 after 11, 10 and 10, on a plan of 3 after 50 x 10 x 3 twice: the planned sets beat the target, so it moves on.
    await log([ses('rd1', '2026-10-01', 'bench', [8, 12], x(50, [10, 10, 10])), ses('rd2', '2026-10-05', 'bench', [8, 12], x(50, [10, 10, 10])), ses('rd3', '2026-10-09', 'bench', [8, 12], [[50, 11], [50, 10], [50, 10], [50, 5, 0]])]);
    const d = await read('bench', 'rd3'), nd = await next('bench', P3);
    ok(d && !d.short && !nd.basis && /^32\+ reps over 3 sets at 50 kg$/.test(nd.target || ''), 'bench 50 x 11, 10 and 10 with an extra set of 5, after 50 x 10 x 3 twice: the three planned sets beat the target, so the next is 32+ (the extra set held it back as below usual)', { d, nd });
    // A lifter who usually does 3 of 4 planned sets does all 4, the fourth the weakest: not under the usual by it.
    await log([ses('re1', '2026-10-01', 'bench', [8, 12], x(50, [10, 10, 10])), ses('re2', '2026-10-05', 'bench', [8, 12], x(50, [10, 10, 10])), ses('re3', '2026-10-09', 'bench', [8, 12], [[50, 11], [50, 10], [50, 10], [50, 5, 0]])]);
    const e = await read('bench', 're3'), ne = await next('bench', P4x);
    ok(e && !e.short && !ne.basis, 'the same on a plan of 4 the lifter usually does 3 of: doing all four is not a session under the usual', { e, ne });
    // A Lighter day at the usual 100 x 8 x 3 with a fourth set of 3: done in full, so counted in full (before: read lighter, from r53).
    await log([ses('rf1', '2026-10-01', 'bench', [6, 10], x(100, [8, 8, 8])), ses('rf2', '2026-10-05', 'bench', [6, 10], x(100, [8, 8, 8])), ses('rf3', '2026-10-09', 'bench', [6, 10], [[100, 8], [100, 8], [100, 8], [100, 3]], { light: true, dayName: 'Session (lighter)' })]);
    const f = await tagOf('bench', 'rf3');
    ok(f && f.light === false && f.tag === 'light' && !f.short, 'a Lighter day at the usual 100 x 8 x 3 and a fourth set of 3: done in full, so a full session for the bench (the extra set read it lighter, on r53 too)', f);
    // Flat at 100 x 8 x 3 for six weeks, then held for a chest injury twice a week for three weeks, the injury since cleared: the
    // stall's weeks are the stretch the stall test read (five, ending before the injury), not the last weeks, which were held.
    const pre = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31', '2026-09-07'], held = ['2026-09-21', '2026-09-24', '2026-09-28', '2026-10-01', '2026-10-05', '2026-10-08'];
    await log([...pre.map((dd, i) => ses('rg' + i, dd, 'bench', [6, 10], x(100, [8, 8, 8], 2))), ...held.map((dd, i) => ses('rh' + i, dd, 'bench', [6, 10], x(100, [8, 8, 8], 2), { ex: { inj: 'chest' } }))]);
    const g = await ev(() => { const L = window.__ironlog; return { stalled: L.IDX().exStats.bench.stalled, weeks: L.stallWeeks ? L.stallWeeks('bench') : null, head: L.exHeadline('bench').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }; });
    ok(g.stalled === true && g.weeks === 5 && /Stalled over 5 weeks\./.test(g.head) && !/over the last/.test(g.head), 'bench flat for five weeks, then held for an injury since cleared: stalled, over the 5 weeks the test read, not "the last" weeks (it said the last 4, counting the held sessions)', g);
  }

  // ---- A blank session in a week marked as a deload is a deload (PENDING 311 c: r53 started it untagged, at full sets).
  {
    await log(['2026-09-24', '2026-10-01', '2026-10-08'].map((d, i) => ses('fd' + i, d, 'bench', [6, 10], x(100, [8, 8, 8]))));
    await ev(() => { const L = window.__ironlog; if (!L.isDeloadWeek()) L.ACT.deloadToggle(); L.ACT.startFree(); }); await wait(150);
    await page.click('#modal [data-act="pickDo"][data-ex="bench"]'); await wait(150);
    const fd = await ev(() => { const L = window.__ironlog; const d = L.state.draft; const b = d.ex[0]; return { week: L.isDeloadWeek(), deload: d.deload, name: d.dayName, ex: b && b.exId, rows: b ? b.sets.length : null, plan: L.planFor('bench', null, d.dayId).sets, full: b ? b.full : null, sw: b ? b.sw : null }; });
    ok(fd.week && fd.deload === true && /deload/i.test(fd.name) && fd.ex === 'bench' && fd.rows === Math.ceil(fd.plan / 2) && fd.full === fd.plan && fd.sw < 100, 'a deload week marked, then a blank session: it is a deload, and bench added to it comes in at half its sets (' + fd.rows + ' of ' + fd.plan + ') and under 100 kg', fd);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; if (L.isDeloadWeek()) L.ACT.deloadToggle(); L.saveNow(); L.render(); });
  }

  // ---- A goal reads every set of the last 12 weeks, a lighter day's too, as the bests do (PENDING 311 e: r53 left those days out).
  {
    await log([ses('ga1', '2026-09-24', 'bench', [6, 10], x(90, [8, 8, 8])), ses('ga2', '2026-10-01', 'bench', [6, 10], x(90, [8, 8, 8])), ses('ga3', '2026-10-08', 'bench', [6, 10], [[120, 2, 1], [85, 8, 1], [85, 8, 1]], { light: true })]);
    const g = await ev(() => { const L = window.__ironlog; L.state.exercises.find(e => e.id === 'bench').goal = { w: 110, r: 5 }; L.invalidate(); const s = L.goalState('bench'); const q = L.IDX().byEx.bench.find(e => e.sid === 'ga3'); return { cur: s.cur, pct: s.pct, light: q.light, best: q.best, line: L.goalLine('bench').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }; });
    ok(g.light === true && Math.abs(g.cur - g.best) < 1e-9 && g.pct === 100 && /within reach/.test(g.line), 'bench 90 x 8 twice, then a Lighter day at 85 kg opened with 120 x 2: a goal of 110 x 5 reads that 120 x 2, as the bests do, so it is within reach (r53: 93% there)', g);
    await ev(() => { const L = window.__ironlog; delete L.state.exercises.find(e => e.id === 'bench').goal; L.invalidate(); L.saveNow(); });
  }

  // ---- A session held for an injury stays held: clearing the injury does not make the lift read stalled (PENDING 311 g).
  {
    await log(['2026-09-24', '2026-10-01', '2026-10-08'].map((d, i) => ses('ia' + i, d, 'bench', [6, 10], x(100, [8, 8, 8]))));
    await ev(() => { const L = window.__ironlog; L.state.injuries = [{ m: 'chest', note: '' }]; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench'); for (const q of d.ex[0].sets) { q.w = 100; q.r = 8; q.done = true; } d._rampAsked = true; L.saveNow(); });
    const held = await ev(() => window.__ironlog.state.draft.ex[0].inj);
    await ev(() => window.__ironlog.ACT.finish()); await wait(400);
    const saved = await ev(() => { const L = window.__ironlog; const ss = L.state.sessions[L.state.sessions.length - 1]; return { draft: !!L.state.draft, inj: ss.ex[0].inj, exId: ss.ex[0].exId, stored: JSON.parse(localStorage.getItem(L.KEY)).sessions.slice(-1)[0].ex[0].inj }; });
    ok(held === 'chest' && !saved.draft && saved.exId === 'bench' && saved.inj === 'chest' && saved.stored === 'chest', 'chest flagged, bench held for it: Finish saves the hold on the exercise, on the phone too (r53 kept no record of it)', { held, saved });
    await ev(() => { const L = window.__ironlog; L.state.injuries = []; L.invalidate(); L.saveNow(); });
    const days = ['2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];
    await log(days.map((d, i) => ses('ih' + i, d, 'bench', [6, 10], x(100, [8, 8, 8]), i >= 3 ? { ex: { inj: 'chest' } } : undefined)));
    const st = await ev(() => { const L = window.__ironlog; return { inj: L.state.injuries.length, kept: L.state.sessions.filter(q => q.ex[0].inj === 'chest').length, stalled: L.IDX().exStats.bench.stalled, ids: L.stalledIds(), coach: L.coach().text }; });
    ok(st.inj === 0 && st.kept === 4 && st.stalled === false && !st.ids.includes('bench') && !/stall/i.test(st.coach), 'bench flat at 100 x 8 x 3 for seven weeks, the last four held for a chest injury now cleared: not stalled, and the coach does not say so (r53: stalled)', st);
  }

  // ---- An assisted lift's first session shows no help in grey, and Finish asks for the help used (PENDING 315 i).
  {
    await log([]);
    await ev(() => { const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = []; L.saveNow(); L.ACT.pickSession(); }); await wait(100);
    await ev(() => window.__ironlog.applyPick(window.__ironlog.ui.modal, 'assistPullup')); await wait(150);
    const a = await ev(() => { const L = window.__ironlog; const d = L.state.draft; const b = d.ex[0]; const inp = document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="0"]'); return { exId: b.exId, sw: b.sw, grey: L.greyW(b, 0), shown: inp ? inp.placeholder : null }; });
    ok(a.exId === 'assistPullup' && a.sw == null && a.grey == null && !a.shown, 'assisted pull-ups with nothing logged: no help in grey to tick past (r53: 0, full bodyweight)', a);
    await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; for (const q of b.sets) { q.r = 6; q.done = true; } L.state.draft._rampAsked = true; L.saveNow(); L.ACT.finish(); }); await wait(300);
    const q = await ev(() => { const L = window.__ironlog; const m = L.ui.modal; return { kind: m && m.kind, title: m && m.title, body: m && m.body, draft: !!L.state.draft }; });
    ok(q.kind === 'confirm' && q.title === 'Add the help you used?' && /Assisted Pull-up/.test(q.body || '') && q.draft, 'ticked with no help typed, Finish asks for the help used before saving', q);
    await ev(() => { const L = window.__ironlog; L.closeModal && L.closeModal(); L.ui.modal = null; L.state.draft = null; L.saveNow(); L.render(); });
  }

  // ---- Changing units or gyms is not a PR (PENDING 315, the audit: 155 lb after 70 kg logged a weight PR made of unit rounding; V 317 a).
  {
    const LBK = 0.45359237, lb = v => v * LBK;
    const prsOf = sid => ev(sid => window.__ironlog.IDX().prs.filter(p => p.sid === sid).map(p => ({ type: p.type, big: p.big, w: p.w, r: p.r, value: p.value, prev: p.prev })), sid);
    const expOf = (exId, sid) => ev(([exId, sid]) => { const q = (window.__ironlog.IDX().byEx[exId] || []).find(e => e.sid === sid); return q ? { progress: q.progress, pb: q.pb } : null; }, [exId, sid]);
    const kgBench = [ses('ua1', '2026-09-24', 'bench', [6, 10], x(70, [8, 8, 8])), ses('ua2', '2026-10-01', 'bench', [6, 10], x(70, [8, 8, 8]))];
    await log([...kgBench, ses('ua3', '2026-10-08', 'bench', [6, 10], x(lb(155), [8, 8, 8]))]);
    const same = await prsOf('ua3'), e3 = await expOf('bench', 'ua3');
    ok(same.length === 0 && e3 && e3.progress === false, 'bench 70 kg x 8 x 3 twice, then 155 lb x 8 x 3 (70.3 kg, the nearest 5 lb load over 70 kg): no PR of any kind, nor progress for the stall test (r53: a weight PR and a best estimate)', { same, e3 });
    await log([...kgBench, ses('ua3', '2026-10-08', 'bench', [6, 10], x(lb(155), [8, 8, 8])), ses('ua4', '2026-10-12', 'bench', [6, 10], x(lb(157.5), [8, 8, 8]))]);
    const up = await prsOf('ua4');
    ok(up.length === 1 && up[0].type === 'Weight PR' && up[0].big && Math.abs(up[0].w - lb(157.5)) < 1e-9, 'then 157.5 lb x 8, a step past the load 70 kg meant: a weight PR, at the load as logged (a guard)', up);
    await log([...kgBench, ses('ua5', '2026-10-08', 'bench', [6, 10], x(lb(155), [9, 8, 8]))]);
    const reps = await prsOf('ua5'), e5 = await expOf('bench', 'ua5');
    ok(reps.length === 1 && reps[0].type === 'e1RM' && reps[0].big && e5 && reps[0].value === e5.pb && reps[0].value > reps[0].prev, '155 lb x 9 after 70 kg x 8: a rep more at the same weight is a new best estimate, shown as logged, the number the session\'s best reads (r53: a weight PR, heavier than 70 kg)', { reps, e5 });
    // The other way, and dumbbells and an assisted lift at another gym.
    const lbBench = [ses('ub1', '2026-09-24', 'bench', [6, 10], x(lb(155), [8, 8, 8])), ses('ub2', '2026-10-01', 'bench', [6, 10], x(lb(155), [8, 8, 8]))];
    await log([...lbBench, ses('ub3', '2026-10-08', 'bench', [6, 10], x(70, [8, 8, 8])), ses('ub4', '2026-10-12', 'bench', [6, 10], x(72.5, [8, 8, 8]))]);
    const b3 = await prsOf('ub3'), b4 = await prsOf('ub4');
    ok(b3.length === 0 && b4.length === 1 && b4[0].type === 'Weight PR', 'in pounds, 155 lb x 8 twice, then 70 kg x 8: no PR, and 72.5 kg after it a weight PR (guards)', { b3, b4 });
    await log([ses('uc1', '2026-09-24', 'dbBench', [8, 12], x(22, [10, 10, 10])), ses('uc2', '2026-10-01', 'dbBench', [8, 12], x(lb(50), [10, 10, 10])), ses('uc3', '2026-10-08', 'dbBench', [8, 12], x(24, [10, 10, 10]))]);
    const c2 = await prsOf('uc2'), c3 = await prsOf('uc3');
    ok(c2.length === 0 && c3.length === 1 && c3[0].type === 'Weight PR', 'dumbbells, 22 kg each x 10, then 50 lb at another gym (22.7 kg, the nearest 5 lb dumbbell): no PR (r53: a weight PR); 24 kg after it, a step past: a weight PR', { c2, c3 });
    await log([ses('ud1', '2026-09-24', 'assistPullup', [6, 10], x(-lb(45), [8, 8, 8])), ses('ud2', '2026-10-01', 'assistPullup', [6, 10], x(-20, [8, 8, 8])), ses('ud3', '2026-10-08', 'assistPullup', [6, 10], x(-lb(40), [8, 8, 8]))]);
    const d2 = await prsOf('ud2'), d3 = await prsOf('ud3');
    ok(d2.length === 0 && d3.length === 1 && d3[0].type === 'Weight PR', 'assisted pull-ups, 45 lb of help, then 20 kg (44.1 lb, the nearest 2.5 kg): not less help, so no PR (r53: less help than ever); 40 lb after it is', { d2, d3 });
    // Live, as the lifter logs: Settings changed to lb after the kg sessions; 155 lb x 8 is announced as nothing, 157.5 lb x 8 as a weight PR, and 155 lb x 9 as a new best estimate in the numbers the list keeps.
    await log(kgBench);
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; L.saveNow(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench'); L.saveNow(); L.render(); }); await wait(150);
    const tick = async (si, w, r) => {
      const W = `.sg input[data-f="w"][data-b="0"][data-s="${si}"]`, R = `.sg input[data-f="r"][data-b="0"][data-s="${si}"]`;
      await page.fill(W, String(w)); await page.dispatchEvent(W, 'input'); await page.dispatchEvent(W, 'change');
      await page.fill(R, String(r)); await page.dispatchEvent(R, 'input'); await page.dispatchEvent(R, 'change');
      if (!(await ev(si => window.__ironlog.state.draft.ex[0].sets[si].done, si))) await page.click(`[data-act="sDone"][data-b="0"][data-s="${si}"]`);
      await wait(150);
      return ev(si => { const row = document.querySelector(`[data-act="sDone"][data-b="0"][data-s="${si}"]`).closest('.sg'); const el = document.getElementById('toast'); return { pr: row.getAttribute('data-pr'), toast: el && !el.hidden ? el.innerText : '', w: window.__ironlog.state.draft.ex[0].sets[si].w }; }, si);
    };
    const s1 = await tick(0, 155, 8), s2 = await tick(1, 157.5, 8), s3 = await tick(2, 155, 9);
    ok(Math.abs(s1.w - lb(155)) < 1e-9 && s1.pr == null && !/PR|best/i.test(s1.toast), 'live: 155 lb x 8 after 70 kg x 8 is not marked or announced (r53: Weight PR)', s1);
    ok(s2.pr === 'Weight PR' && /Weight PR: Barbell Bench Press/.test(s2.toast), 'live: 157.5 lb x 8 is a weight PR', s2);
    ok(s3.pr === 'Best' && /estimated 1RM 207 lb; was 198\)/.test(s3.toast), 'live: 155 lb x 9 is a new best estimate, 207 lb as logged (155 lb x 9), was 198 (70 kg x 8)', s3);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.state.settings.unit = 'kg'; L.saveNow(); L.render(); });
  }

  // ---- A lift trained in two rep ranges is stalled only when it is stalled in each (PENDING 312 A, V 2026-10-18).
  {
    // The bench on Upper A at 6 to 10, and on Upper B at 12 to 15 as well: a heavy day and a light day.
    await ev(() => { const L = window.__ironlog; const R = L.activeRoutine(); const B = R.days.find(d => d.name === 'Upper B'); if (!B.items.some(i => i.exId === 'bench')) B.items.push({ uid: 'lb1', exId: 'bench', sets: 3, repMin: 12, repMax: 15, rir: 1, rest: 90, inc: 2.5, ss: null }); L.saveNow(); });
    const heavyDays = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08', '2026-10-15'];
    const lightDays = ['2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04', '2026-10-11'];
    const two = (lightW, hr = 8) => [...heavyDays.map((d, i) => ses('sh' + i, d, 'bench', [6, 10], x(100, [hr, hr, hr]))), ...lightDays.map((d, i) => ses('sl' + i, d, 'bench', [12, 15], x(lightW(i), [12, 12, 12])))].sort((a, b) => a.date < b.date ? -1 : 1);
    await log(two(i => 60 + 2.5 * i));
    const rising = await ev(() => { const L = window.__ironlog; return { stalled: L.IDX().exStats.bench.stalled, ids: L.stalledIds() }; });
    ok(rising.stalled === false && !rising.ids.includes('bench'), 'bench flat at 100 x 8 x 3 on its heavy day for six weeks, its light day rising 60 to 70 kg: not stalled, though its newest session is a heavy day (r53 read the newest range alone: stalled)', rising);
    await log(two(() => 60));
    const flat = await ev(() => { const L = window.__ironlog; return { stalled: L.IDX().exStats.bench.stalled, weeks: L.stallWeeks ? L.stallWeeks('bench') : 'none on this build' }; });
    ok(flat.stalled === true && flat.weeks === 4, 'both days flat, the heavy day\'s stretch 5 weeks and the light day\'s 4: stalled, for as long as the shorter (4 weeks)', flat);
    // Whether a stalled lift is at the top of its range, on Stats and in the coach, is read against the range its last session was
    // done at (found after r54's review: both read the plan's, the heavy day's 6 to 10, so the light day's 60 x 12 x 3, the bottom
    // of 12 to 15, read as the top of the range and "due a step up"). Every minimum at 0 here, so the coach reaches its stall line.
    const reads = () => ev(() => { const L = window.__ironlog; const b = L.state.settings.bands, kept = JSON.stringify(b); for (const m in b) b[m] = [0, b[m][1]]; L.invalidate(); const out = { stalled: L.IDX().exStats.bench.stalled, head: L.exHeadline('bench').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), coach: L.coach().text }; L.state.settings.bands = JSON.parse(kept); L.invalidate(); return out; });
    await log(two(() => 60).filter(q => q.id !== 'sh6'));
    const lt = await reads();
    ok(lt.stalled === true && /Stalled over the last 4 weeks\. Try another rep range or a variation\./.test(lt.head) && /has stalled\. Try another rep range or a close variation/.test(lt.coach) && !/top of (its|the) range/.test(lt.head + lt.coach), 'both days flat, last done on the light day at 60 x 12 x 3, the bottom of its 12 to 15: Stats and the coach say stalled, try another range, not at the top of the range (it read the heavy day\'s 6 to 10)', lt);
    await log(two(() => 60, 10));
    const hv = await reads();
    ok(hv.stalled === true && /Stalled at the top of the range: due a step up\./.test(hv.head) && /is at the top of its range at 100 kg and has stalled over the last 4 weeks: it is due a step up/.test(hv.coach), 'both days flat, last done on the heavy day at 100 x 10 x 3, the top of its 6 to 10: Stats and the coach say at the top of the range, due a step up, as before this fix', hv);
    await ev(() => { const L = window.__ironlog; const R = L.activeRoutine(); for (const d of R.days) d.items = d.items.filter(i => i.uid !== 'lb1'); L.saveNow(); });
  }

  // ---- The sign-in sheet and the on-screen keyboard (PENDING 311 f, 309, 322; V on the r52 preview: after Wrong email or
  // password the email field could not be tapped). No browser here has an on-screen keyboard; V checks the real one.
  {
    const Q = await open(FILE, { browser: P.browser, touch: true, clock: '2026-10-15T10:00:00', realStarter: true, setup: ctx => ctx.addInitScript(() => {
      // A stand-in account service that refuses every password, as the real one answers a wrong one.
      window.ironlogAuth = { user: async () => null, onChange: () => {}, signOut: async () => {}, release: () => {}, signIn: async () => { const e = new Error('Wrong email or password.'); e.code = 'invalid_credentials'; throw e; } };
    }) });
    const q = Q.page; const qe = (f, a) => q.evaluate(f, a);
    await qe(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); L.ACT.acctOpen({ dataset: { mode: 'signin' } }); }); await wait(150);
    const EM = '#modal [data-abind="email"]', PW = '#modal [data-abind="pw"]';
    await q.fill(EM, 'v@example.com'); await q.fill(PW, 'not it');
    await qe(([a, b]) => { document.querySelector(a).__kept = 1; document.querySelector(b).__kept = 1; }, [EM, PW]);
    await q.tap('#modal [data-act="acctSubmit"]');
    await q.waitForFunction(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'account' && !m.busy && m.err; }, null, { timeout: 5000 }).catch(() => {});
    const after = await qe(([a, b]) => { const al = document.querySelector('#modal [role="alert"]'); return { err: al && !al.hidden ? al.textContent : null, email: document.querySelector(a).__kept === 1, pw: document.querySelector(b).__kept === 1, value: document.querySelector(a).value }; }, [EM, PW]);
    ok(after.err === 'Wrong email or password.' && after.email && after.pw && after.value === 'v@example.com', 'a wrong password: the sheet says so and keeps its fields as they were, the same fields, so the one in use stays under the keyboard (r53 drew new ones)', after);
    await q.tap(EM); await wait(100);
    const tapped = await qe((a) => document.activeElement === document.querySelector(a), EM);
    await q.fill(EM, 'v2@example.com');
    ok(tapped && (await qe((a) => document.querySelector(a).value, EM)) === 'v2@example.com', 'then a tap on the email field puts the cursor there, and it takes a new address (a guard: r53 does this here, in a browser with no keyboard)', { tapped });
    /* A stand-in keyboard (the visual viewport moved as a keyboard moves it: no browser here has one). Sheets do not follow
       it: r54 tried twice, and on V's iPhone the first showed the page under the sheet ("showing twice") and the second made
       the page move up and down slowly as the keyboard came and hid the sheet's last links (V, 2026-10-19). iOS scrolls the
       field being typed in into view itself, as it did on r53, so the sheets' layer stays the whole screen, the sheet at its
       bottom, and nothing moves when the keyboard comes or goes (this fails on the build V saw last, a guard of r53). */
    const vv = (h, top) => qe(([h, top]) => { const v = window.visualViewport; if (h == null) { delete v.height; delete v.offsetTop; } else { Object.defineProperty(v, 'height', { configurable: true, get: () => h }); Object.defineProperty(v, 'offsetTop', { configurable: true, get: () => top }); } v.dispatchEvent(new Event('resize')); v.dispatchEvent(new Event('scroll')); }, [h, top]);
    const box = () => qe(() => { const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) }; }; const m = document.getElementById('modal'); const pe = getComputedStyle(m, '::after'); return { modal: r('#modal'), sheet: r('#modal .sheet'), h: innerHeight, strip: pe.content !== 'none' && parseFloat(pe.height) > 0 }; });
    const k0 = await box();
    await vv(380, 0); await wait(50); const k1 = await box();
    await vv(380, 120); await wait(50); const k2 = await box();
    await vv(null); await wait(50); const k3 = await box();
    const still = k => k.modal.top === 0 && k.modal.bottom === k.h && k.sheet.bottom === k.h && k.sheet.top === k0.sheet.top && !k.strip;
    ok(k0.sheet.bottom === k0.h && still(k1) && still(k2) && still(k3), 'with a keyboard coming, the page scrolled to the field and the keyboard gone, the sheets\' layer stays the whole screen and the sheet stays where it is at its bottom: nothing moves with the keyboard (the build V saw moved it, and the page with it)', { k0, k1, k2, k3 });
    // A sheet of a fixed height, the exercise picker with its search field, keeps its height too.
    await qe(() => { const L = window.__ironlog; L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); L.ACT.pickSession(); }); await wait(150);
    const pick = () => qe(() => { const e = document.querySelector('#modal .sheet.fixed'); const b = e && e.getBoundingClientRect(); return e ? { bottom: Math.round(b.bottom), height: Math.round(b.height), h: innerHeight } : null; });
    const p0 = await pick(); await vv(380, 0); await wait(50); const p1 = await pick();
    ok(p0 && p1 && p1.bottom === p1.h && p1.height === p0.height && Math.abs(p0.height - 0.88 * p0.h) <= 1, 'the exercise picker keeps 88% of the screen whether the keyboard is up or not', { p0, p1 });
    await vv(null);
    await qe(() => { const L = window.__ironlog; L.ACT.mClose(); L.state.draft = null; L.saveNow(); });
    ok(!Q.errors.length, 'no page errors on the sheets with the keyboard', Q.errors);
    await Q.ctx.close();
  }

  ok(!P.errors.length, 'no page errors', P.errors);
  await P.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
