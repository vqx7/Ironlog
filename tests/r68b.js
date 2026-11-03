// r68's independent review (CLAUDE.md, How work is done 5): each finding it reproduced, rerun and fixed, each section
// failing on f213a37, the build the review read (`node tests/r68b.js <that page>`), unless it says it is a guard.
//   1  A week of more than seven workouts (two a weekday) is not recorded on a session (pw): r67 drops a count past
//      seven when it loads the session and saves it back to the account, so every phone would lose it. Normalize
//      keeps r67's bound of seven.
//   2  kg dumbbells: a rack read from loads only 2.5 kg fits (17.5, then 20) is in 2.5 kg steps, so 22 kg, which
//      it does not have, is never asked; loads both spacings fit (20 alone) still read as 2 kg (367).
//   3  The same-day rule (NEW-18) only in the same rep range: a 12-15 evening after an 8-12 morning is read against
//      its range. A morning logged in kg is asked again as logged (132.3 lb), not moved to 135 with the "Earlier
//      today" line rewritten. A timed hold done again the same day holds the same (it stepped up before, on r67 too).
//   4  Warm-ups added one by one never fall: a 30 kg bench on 5 kg steps warmed up at 20, 25, then 20.
//   5  Finish's routine update after a day's second workout adds the exercise to that workout, not the first.
//   6  Do again of a second workout starts and saves it as the second workout; a past workout offers each of a
//      day's two workouts, each with its own exercises.
//   7  A lift in both of a day's workouts records the sets the workout it was done in planned (ps).
//   8  A date past this week shows the day's first workout, not this week's second still to do.
//   9  Plan's "Heavy for one workout" reads each of a day's workouts on its own.
//  10  The week bar names each of a day's workouts (done on another day, missed or planned), and a day whose
//      workout was done early is no longer marked planned.
// `node tests/r68b.js [page]`; R68B=1,3 runs some.
const { open, engine } = require('./h');
let browser;
const FILE = process.argv[2] || process.env.IRONLOG_FILE || 'index.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.env.R68B ? process.env.R68B.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const LB = 0.45359237;
const it = (uid, exId, extra) => ({ uid, exId, sets: 3, repMin: 8, repMax: 12, rir: 2, rest: 90, inc: 5 * LB, ss: null, ...(extra || {}) });
const wkSess = (id, date, di, dayId, dayName, extra) => ({ id, date, dayIdx: di, dayId, dayName, routineId: 'RW', notes: '', t: Date.parse(date + 'T09:00:00'), ex: [{ exId: 'bench', rr: [8, 12], sets: [{ w: 60, r: 10, rir: 2 }] }], ...(extra || {}) });
// Push Monday (bench, ohp), Pull Tuesday, Legs Wednesday, the rest rest days; mon adds to Monday.
const weekR = mon => ({ id: 'RW', name: 'Week', schedule: 'weekly', days: [
  { id: 'Dmon', name: 'Push', rest: false, items: [it('a1', 'bench'), it('a2', 'ohp'), ...(mon || [])] },
  { id: 'Dtue', name: 'Pull', rest: false, items: [it('b1', 'cableRow')] },
  { id: 'Dwed', name: 'Legs', rest: false, items: [it('c1', 'backSquat')] },
  { id: 'Dthu', name: 'Rest', rest: true, items: [] }, { id: 'Dfri', name: 'Rest', rest: true, items: [] },
  { id: 'Dsat', name: 'Rest', rest: true, items: [] }, { id: 'Dsun', name: 'Rest', rest: true, items: [] }] });
// Monday's second workout, Arms (curls).
const twoR = () => { const R = weekR([it('a3', 'dbCurl', { pm: true })]); R.days[0].pmName = 'Arms'; return R; };
const card = page => page.evaluate(() => { const h = document.querySelector('#view .hero'); const st = h && h.querySelector('[data-act="startSession"]'); return h ? { name: ((h.querySelector('h2') || {}).textContent || '').trim(), eye: ((h.querySelector('.eyebrow') || {}).textContent || '').replace(/\s+/g, ' ').trim(), part: st ? st.dataset.part || null : null } : null; });
const bar = page => page.evaluate(() => [...document.querySelectorAll('#wkbar .w')].map(w => ({ cls: w.className.replace(/\s+/g, ' ').trim(), label: w.getAttribute('aria-label') || '' })));
async function weekPage(clock, routine, sessions) {
  const P = await open(FILE, { browser, clock });
  await P.page.evaluate(([R, ss]) => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false; S.routines = [R]; S.activeRoutineId = R.id; S.sessions = ss; S.draft = null; L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = null; L.render(); }, [routine, sessions]);
  await wait(150);
  return P;
}
// Ticks every set and finishes, answering Finish's questions; returns the recap's routine update.
async function finish(page) {
  await page.evaluate(() => { const L = window.__ironlog; for (const b of L.state.draft.ex) for (const x of b.sets) { x.w = x.w == null ? 50 * 0.45359237 : x.w; x.r = x.r || 10; x.done = true; } L.saveNow(); L.render(); });
  await page.click('#view [data-act="finish"]');
  let upd = null;
  for (let k = 0; k < 8; k++) {
    await wait(150);
    const m = await page.evaluate(() => { const m = window.__ironlog.ui.modal; return m && { kind: m.kind, upd: m.upd || null }; });
    if (!m) break;
    if (m.kind === 'confirm') { await page.click('#modal [data-act="mOk"]'); continue; }
    if (m.kind === 'recap') upd = m.upd;
    break;
  }
  return upd;
}

(async () => {
  browser = await engine.launch();

  // ---- 1. A week of more than seven workouts is not recorded (pw).
  if (run(1)) {
    // Seven training days, Monday with a second workout: eight a week.
    const R = twoR(); for (const d of R.days) if (d.rest) { d.rest = false; d.name = 'Day ' + d.id; d.items = [it('x' + d.id, 'cableCurl')]; }
    const P = await weekPage('2026-11-02T10:00:00', R, []);
    await P.page.click('#view .hero [data-act="startSession"]'); await wait(200);
    await finish(P.page);
    const r = await P.page.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions[L.state.sessions.length - 1]; const n = L.normalize({ ...JSON.parse(JSON.stringify(L.state)), sessions: [{ ...JSON.parse(JSON.stringify(s)), id: 'n9', pw: 9 }] }); return { name: s && s.dayName, pw: s ? (s.pw === undefined ? 'none' : s.pw) : null, nine: n.sessions[0].pw === undefined ? 'none' : n.sessions[0].pw }; });
    ok(r.name === 'Push' && r.pw === 'none', '1. a session on a routine planning eight a week records no count (r67 would drop it and sync the loss)', r);
    ok(r.nine === 'none', '1. a count of 9 is dropped on load, as r67 drops it', r);
    await P.ctx.close();
  }

  // ---- 2. A kg dumbbell rack read from loads only 2.5 kg fits.
  if (run(2)) {
    const P = await open(FILE, { browser, clock: '2026-11-02T10:00:00' });
    const r = await P.page.evaluate(() => {
      const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg'; delete S.settings.gym;
      const ses = (id, date, w, reps) => ({ id, date, notes: '', ex: [{ exId: 'dbBench', rr: [8, 12], sets: reps.map(r => ({ w, r, rir: 1 })) }] });
      const plan = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5, ss: null };
      const go = list => { S.sessions = list; L.state = L.normalize(S); for (const e of L.state.exercises) if (e.id === 'dbBench') delete e.inc; L.invalidate(); const g = L.suggest('dbBench', plan, {}); return { step: L.rackStep(L.state.exercises.find(e => e.id === 'dbBench')), w: Math.round(g.w * 100) / 100 }; };
      return {
        a: go([ses('s0', '2026-10-05', 22.5, [8, 7, 7]), ses('s1', '2026-10-12', 20, [10, 10, 9]), ses('s2', '2026-10-19', 20, [11, 11, 10]), ses('s3', '2026-10-26', 20, [12, 12, 12])]),
        c: go([ses('s1', '2026-10-12', 17.5, [12, 12, 12]), ses('s2', '2026-10-19', 20, [9, 9, 8]), ses('s3', '2026-10-26', 20, [12, 12, 12])]),
        both: go([ses('s1', '2026-10-19', 20, [10, 10, 9]), ses('s2', '2026-10-26', 20, [12, 12, 12])])
      };
    });
    ok(r.a.step === 2.5 && r.a.w !== 22, '2. 22.5 kg dumbbells earlier, 20 since: a 2.5 kg rack, never 22 kg', r.a);
    ok(r.c.step === 2.5 && r.c.w !== 22, '2. 17.5 then 20 kg: a 2.5 kg rack, never 22 kg', r.c);
    ok(r.both.step === 2, '2. (a guard) 20 kg alone, which both spacings fit, still reads as 2 kg (367)', r.both);
    await P.ctx.close();
  }

  // ---- 3. The same-day rule in another rep range, in the other unit, and on a timed hold.
  if (run(3)) {
    const P = await open(FILE, { browser, clock: '2026-11-02T19:00:00' });
    const r = await P.page.evaluate(() => {
      const L = window.__ironlog; const LB = 0.45359237; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb'; S.draft = null;
      const sess = (id, date, h, w, reps, rr) => ({ id, date, t: Date.parse(date + 'T' + String(h).padStart(2, '0') + ':00:00'), notes: '', ex: [{ exId: 'bench', rr, sets: reps.map(r => ({ w, r, rir: 2 })) }] });
      const pick = g => ({ w: g.w == null ? null : Math.round(g.w / LB * 10) / 10, text: g.text });
      const plan = (lo, hi, n) => ({ sets: n || 3, repMin: lo, repMax: hi, rir: 2, rest: 90, inc: 5 * LB });
      const out = {};
      S.sessions = [sess('a', '2026-10-26', 8, 130 * LB, [10, 10, 10], [8, 12]), sess('b', '2026-11-02', 8, 135 * LB, [10, 10, 10], [8, 12])];
      L.state = L.normalize(S); L.state.exercises.find(e => e.id === 'bench').inc = 5 * LB; L.invalidate();
      out.light = pick(L.suggest('bench', plan(12, 15, 2), { before: L.today() }));
      out.same = pick(L.suggest('bench', plan(8, 12), { before: L.today() }));
      S.sessions = [sess('a', '2026-10-26', 8, 57.5, [10, 10, 10], [8, 12]), sess('b', '2026-11-02', 8, 60, [10, 10, 10], [8, 12])];
      L.state = L.normalize(S); delete L.state.exercises.find(e => e.id === 'bench').inc; L.invalidate();
      out.unit = pick(L.suggest('bench', plan(8, 12), { before: L.today() }));
      // A weighted plank, 40 s x 3 at 10 kg last week and this morning, every hold at the top (30-40 s).
      S.settings.unit = 'kg';
      const hold = (id, date, h) => ({ id, date, t: Date.parse(date + 'T' + String(h).padStart(2, '0') + ':00:00'), notes: '', ex: [{ exId: 'plank', rr: [30, 40], sets: [0, 1, 2].map(() => ({ w: 10, r: 40, rir: 2 })) }] });
      S.sessions = [hold('p1', '2026-10-26', 8), hold('p2', '2026-11-02', 8)]; L.state = L.normalize(S); L.invalidate();
      const g = L.suggest('plank', { sets: 3, repMin: 30, repMax: 40, rir: 2, rest: 60, inc: 2.5 }, { before: L.today() });
      out.plank = { w: g.w, text: g.text };
      return out;
    });
    ok(!/Earlier today/.test(r.light.text) && r.light.w < 135, '3. a 12-15 evening after 135 x 10 x 3 on 8-12 this morning is read against its own range', r.light);
    ok(/^Earlier today: 135×10/.test(r.same.text) && r.same.w === 135, '3. (a guard) the same range again the same day asks the morning\'s 135', r.same);
    ok(r.unit.w === 132.3 && /^Earlier today: 132\.3×10, 132\.3×10, 132\.3×10\./.test(r.unit.text), '3. a 60 kg morning shown in lb is asked again at 132.3, as lifted, with its sets named as done', r.unit);
    ok(r.plank.w === 10 && /^Earlier today: /.test(r.plank.text) && !/add /.test(r.plank.text), '3. a plank held again the same day holds the same load, no step up', r.plank);
    ok(!P.errors.length, '3. no page errors', P.errors);
    await P.ctx.close();
  }

  // ---- 4. Warm-ups added one by one never fall.
  if (run(4)) {
    const P = await open(FILE, { browser, clock: '2026-11-02T18:00:00' });
    const r = await P.page.evaluate(() => {
      const L = window.__ironlog; const LB = 0.45359237; const out = [];
      for (const [u, w] of [['kg', 30], ['kg', 35], ['lb', 65], ['lb', 75]]) {
        const S = L.state; S.settings.onboarded = true; S.settings.unit = u; S.sessions = []; S.draft = null;
        const kg = u === 'kg' ? w : w * LB;
        S.routines = [{ id: 'RC', name: 'C', schedule: 'cycle', days: [{ id: 'DC', name: 'C', rest: false, items: [{ uid: 'c1', exId: 'bench', sets: 3, repMin: 8, repMax: 12, rir: 2, rest: 90, inc: 5 * LB, ss: null }] }] }]; S.activeRoutineId = 'RC';
        L.state = L.normalize(S); delete L.state.exercises.find(e => e.id === 'bench').inc; L.invalidate(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render();
        L.ACT.startSession({ dataset: { day: '0' } });
        L.state.draft.ex[0].sets.forEach(x => { x.w = kg; });
        for (let k = 0; k < 3; k++) L.ACT.wAdd({ dataset: { b: '0' } });
        out.push({ u, w, warm: L.state.draft.ex[0].sets.filter(x => x.warm).map(x => Math.round((u === 'kg' ? x.w : x.w / LB) * 100) / 100) });
        L.state.draft = null;
      }
      return out;
    });
    for (const c of r) ok(c.warm.length === 3 && c.warm.every((x, i) => (i === 0 || x >= c.warm[i - 1]) && x < c.w), `4. warm-ups for a ${c.w} ${c.u} bench never fall and stay under it: ${c.warm.join(', ')}`, c);
    await P.ctx.close();
  }

  // ---- 5. Finish's routine update after a day's second workout.
  if (run(5)) {
    const P = await weekPage('2026-11-02T19:00:00', twoR(), [wkSess('w1', '2026-11-02', 0, 'Dmon', 'Push', { pw: 4 })]);
    const c = await card(P.page);
    ok(c && c.name === 'Arms' && c.part === '2', '5. Monday evening offers Arms, the second workout', c);
    await P.page.click('#view .hero [data-act="startSession"]'); await wait(200);
    await P.page.evaluate(() => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' }); });
    await wait(150);
    await P.page.evaluate(() => window.__ironlog.ACT.pickDo({ dataset: { ex: 'facePull' } }));
    await wait(150);
    const upd = await finish(P.page);
    ok(upd && upd.dayName === 'Arms' && upd.add.some(x => x.exId === 'facePull'), '5. Finish offers to add the face pull to Arms', upd);
    await P.page.evaluate(() => window.__ironlog.ACT.applyUpd({ dataset: {} }));
    await wait(150);
    const mon = await P.page.evaluate(() => window.__ironlog.state.routines[0].days[0].items.map(i => i.exId + (i.pm ? ':pm' : '')));
    ok(mon.join() === 'bench,ohp,dbCurl:pm,facePull:pm', '5. accepted, the face pull joins the second workout', mon);
    ok(!P.errors.length, '5. no page errors', P.errors);
    await P.ctx.close();
  }

  // ---- 6. Do again of a second workout, and a past workout on a two-workout day.
  if (run(6)) {
    const push = wkSess('w1', '2026-11-02', 0, 'Dmon', 'Push', { pw: 4 });
    const arms = wkSess('w2', '2026-11-02', 0, 'Dmon', 'Arms', { part: 2, pw: 4, t: Date.parse('2026-11-02T18:00:00'), ex: [{ exId: 'dbCurl', rr: [8, 12], sets: [{ w: 10, r: 10, rir: 2 }] }] });
    let P = await weekPage('2026-11-04T10:00:00', twoR(), [push, arms]);
    await P.page.evaluate(() => window.__ironlog.ACT.histRepeat({ dataset: { id: 'w2' } }));
    await wait(200);
    const d = await P.page.evaluate(() => { const d = window.__ironlog.state.draft; return d && { part: d.part || null, name: d.dayName, ex: d.ex.map(b => b.exId) }; });
    ok(d && d.part === 2 && d.name === 'Arms' && d.ex.join() === 'dbCurl', '6. Do again of Arms starts it as the day\'s second workout', d);
    await finish(P.page);
    const saved = await P.page.evaluate(() => window.__ironlog.state.sessions.map(s => ({ name: s.dayName, part: s.part || null })));
    ok(saved.length === 3 && saved[2].part === 2 && saved[2].name === 'Arms', '6. ... and saves it as the second workout', saved);
    await P.ctx.close();
    P = await weekPage('2026-11-04T10:00:00', twoR(), []);
    await P.page.evaluate(() => window.__ironlog.ACT.pastOpen({ dataset: { date: '2026-10-26' } }));
    await wait(150);
    const opts = await P.page.evaluate(() => [...document.querySelectorAll('#modal [data-act="pastGo"]')].map(b => ({ day: b.dataset.day, part: b.dataset.part || null, text: b.textContent.replace(/\s+/g, ' ').trim() })));
    ok(opts.some(o => o.day === '0' && o.part === '2' && /Arms/.test(o.text)) && opts.some(o => o.day === '0' && !o.part && /Push/.test(o.text)), '6. a past workout offers Monday\'s Push and its second workout, Arms', opts);
    await P.page.evaluate(() => window.__ironlog.ACT.pastGo({ dataset: { day: '0' } }));
    await wait(200);
    const d1 = await P.page.evaluate(() => { const d = window.__ironlog.state.draft; return d && { part: d.part || null, name: d.dayName, ex: d.ex.map(b => b.exId) }; });
    ok(d1 && d1.part === null && d1.ex.join() === 'bench,ohp', '6. a past Push holds Push\'s exercises only', d1);
    await P.page.evaluate(() => { const L = window.__ironlog; L.state.draft = null; L.ACT.pastOpen({ dataset: { date: '2026-10-26' } }); });
    await wait(150);
    await P.page.evaluate(() => window.__ironlog.ACT.pastGo({ dataset: { day: '0', part: '2' } }));
    await wait(200);
    const d2 = await P.page.evaluate(() => { const d = window.__ironlog.state.draft; return d && { part: d.part || null, name: d.dayName, ex: d.ex.map(b => b.exId) }; });
    ok(d2 && d2.part === 2 && d2.name === 'Arms' && d2.ex.join() === 'dbCurl', '6. a past Arms is the second workout, with its exercises', d2);
    ok(!P.errors.length, '6. no page errors', P.errors);
    await P.ctx.close();
  }

  // ---- 7. A lift in both of a day's workouts records the sets of the one it was done in.
  if (run(7)) {
    const R = weekR([it('a3', 'bench', { pm: true, sets: 2, repMin: 15, repMax: 20 }), it('a4', 'dbCurl', { pm: true })]); R.days[0].pmName = 'Pump';
    const P = await weekPage('2026-11-02T19:00:00', R, [wkSess('p2', '2026-11-02', 0, 'Dmon', 'Push', { pw: 4 })]);
    const c = await card(P.page);
    ok(c && c.name === 'Pump' && c.part === '2', '7. Monday evening offers Pump', c);
    await P.page.click('#view .hero [data-act="startSession"]'); await wait(200);
    await finish(P.page);
    const s = await P.page.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions[L.state.sessions.length - 1]; return { name: s.dayName, ps: s.ex.map(b => b.exId + ':' + b.ps) }; });
    ok(s.name === 'Pump' && s.ps.includes('bench:2'), '7. the evening bench records the 2 sets Pump plans, not Push\'s 3', s);
    await P.ctx.close();
  }

  // ---- 8. A date past this week shows the day's first workout.
  if (run(8)) {
    const P = await weekPage('2026-11-03T10:00:00', twoR(), [wkSess('w1', '2026-11-02', 0, 'Dmon', 'Push', { pw: 4 })]);
    await P.page.evaluate(() => window.__ironlog.ACT.wkGo({ dataset: { date: '2026-11-09', day: '0' } }));
    await wait(150);
    const c = await card(P.page);
    ok(c && c.name === 'Push' && c.part === null && /Viewing Mon, Nov 9/.test(c.eye), '8. next Monday, opened ahead, shows Push, its first workout', c);
    await P.ctx.close();
  }

  // ---- 9. Plan's flag for one workout reads each of a day's workouts on its own.
  if (run(9)) {
    const P = await open(FILE, { browser, clock: '2026-11-02T18:00:00' });
    const r = await P.page.evaluate(() => {
      const L = window.__ironlog;
      const it = (uid, exId, extra) => ({ uid, exId, sets: 4, repMin: 8, repMax: 12, rir: 2, rest: 90, inc: 2.5, ss: null, ...(extra || {}) });
      const txt = p => String(p).replace(/<[^>]+>/g, '').trim();
      const two = { id: 'D1', name: 'Chest', rest: false, items: [it('a', 'bench'), it('b', 'inclineBench'), it('c', 'cableFly', { pm: true }), it('d', 'machPress', { pm: true })] };
      const one = { ...two, items: two.items.map(i => ({ ...i, pm: undefined })) };
      return { two: txt(L.sessionCapNote(two)), one: txt(L.sessionCapNote(one)) };
    });
    ok(!/Heavy for one workout/.test(r.two), '9. 8 chest sets in the morning and 8 in the evening: no flag for one workout', r);
    ok(/Heavy for one workout: Chest 16 sets/.test(r.one), '9. (a guard) the same 16 sets in one workout are flagged', r);
    await P.ctx.close();
  }

  // ---- 10. The week bar's words for each of a day's workouts.
  if (run(10)) {
    let P = await weekPage('2026-11-04T10:00:00', twoR(), [wkSess('w1', '2026-11-03', 0, 'Dmon', 'Push', { pw: 4 })]);
    let b = await bar(P.page);
    ok(/^Mon Nov 2: Push, done Tue; Arms, missed/.test(b[0].label) && /miss/.test(b[0].cls), '10. Monday, Push done Tuesday and Arms not done: each named, the day still missed', b[0]);
    await P.ctx.close();
    P = await weekPage('2026-11-03T10:00:00', weekR(), [wkSess('w1', '2026-11-02', 1, 'Dtue', 'Pull', { pw: 3 })]);
    b = await bar(P.page);
    ok(/^Tue Nov 3: Pull, done Mon/.test(b[1].label) && !/\bplan\b/.test(b[1].cls), '10. Tuesday, its Pull done Monday: done Mon, not planned', b[1]);
    ok(/^Wed Nov 4: Legs, planned/.test(b[2].label) && /\bplan\b/.test(b[2].cls), '10. (a guard) Wednesday still planned', b[2]);
    ok(!P.errors.length, '10. no page errors', P.errors);
    await P.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
