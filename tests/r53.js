// r53 (V, 2026-10-18: "these things should be tied at exercise level", and
// "if you hit a pr that is a pr no matter when"). A set stronger than every
// earlier one is a PR on any day, a lighter day included (r32 kept every PR
// off lighter and deload days), and a lift done there at its usual load and
// reps counts as a full session for that lift, while one done lighter, or
// for fewer reps, stays lighter. A lift on no day of the routine starts from
// its own last full session; the coach and a flagged injury as the audit
// asked. And Finish's offer to add an exercise to the routine day gives it the sets it
// would have on a normal day. An exercise added on a lighter day or in a
// deload has half its sets, and r52 offered to add it with that half, so the
// day had it at half for good. Driven through the app's own actions: start
// the day, add the exercise, tick its sets, Finish, and Update the day.
// Runs on any build: node tests/r53.js baselines/r52.html fails on r52.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || 'index.html';

(async () => {
  const P = await open(FILE, { clock: '2026-10-15T10:00:00', realStarter: true });
  const { page } = P; const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
  // The starter routine (Upper / lower, 4 days): Upper A is day 0; the back squat sits on Lower A, 3 sets; the front squat on no day.
  const R0 = await ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); return { up: R.days[0].items.map(i => i.exId), squat: R.days[1].items.find(i => i.exId === 'backSquat').sets }; });
  ok(!R0.up.includes('frontSquat') && !R0.up.includes('backSquat') && R0.squat === 3, 'set up: Upper A has neither squat; Lower A has the back squat at 3 sets', R0);

  // One finished session of a kind, with the two squats added, then the offer and its Update.
  const run = async (kind) => {
    await ev((kind) => {
      const L = window.__ironlog; const S = L.state;
      S.draft = null; S.deloadWeek = kind === 'deload' ? L.weekStart(L.today()) : null;
      // Restore the routine day each run, so each starts from the starter's Upper A.
      const R = S.routines.find(r => r.id === S.activeRoutineId); R.days[0].items = R.days[0].items.filter(i => i.exId !== 'frontSquat' && i.exId !== 'backSquat');
      L.saveNow(); L.render();
    }, kind);
    // What the day's Start (and More options' Lighter day) button runs.
    await ev((light) => window.__ironlog.ACT.startSession({ dataset: { day: '0', light: light ? '1' : '0' } }), kind === 'light');
    await wait(200);
    const d0 = await ev(() => { const d = window.__ironlog.state.draft; return d && { light: d.light, deload: d.deload }; });
    for (const id of ['frontSquat', 'backSquat']) {
      await ev(() => window.__ironlog.ACT.pickSession()); await wait(100);
      await ev((id) => window.__ironlog.applyPick(window.__ironlog.ui.modal, id), id); await wait(100);
    }
    const added = await ev(() => window.__ironlog.state.draft.ex.slice(-2).map(b => ({ exId: b.exId, plan: b.plan.sets, rows: b.sets.length })));
    // Every set of every exercise done, so Finish asks nothing.
    await ev(() => { const L = window.__ironlog; for (const b of L.state.draft.ex) b.sets.forEach(x => { x.w = 60; x.r = 8; x.done = true; }); L.saveNow(); });
    await ev(() => window.__ironlog.ACT.finish()); await wait(400);
    const recap = await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'recap' ? { upd: m.upd && m.upd.add.map(a => [a.exId, a.plan.sets]), text: document.getElementById('modal').innerText } : { kind: m && m.kind }; });
    if (recap.upd) { await page.click('#modal [data-act="applyUpd"]'); await wait(200); }
    const day = await ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); return Object.fromEntries(R.days[0].items.filter(i => i.exId === 'frontSquat' || i.exId === 'backSquat').map(i => [i.exId, i.sets])); });
    return { d0, added, recap, day };
  };

  const normal = await run('normal');
  ok(normal.d0 && !normal.d0.light && !normal.d0.deload && normal.added.every(a => a.plan === 3), 'a normal day: each squat is added at 3 sets', normal.added);
  ok(normal.day.frontSquat === 3 && normal.day.backSquat === 3, 'a normal day: Update adds each squat to the day at 3 sets, as before', normal.day);

  const light = await run('light');
  ok(light.d0 && light.d0.light && light.added.every(a => a.plan === 2), 'a lighter day: each squat is added at half its sets (3 to 2), as built in r30', light.added);
  ok(/Update Upper A/.test(light.recap.text || '') && JSON.stringify(light.recap.upd) === JSON.stringify([['frontSquat', 3], ['backSquat', 3]]), 'a lighter day: Finish offers to add each squat at its normal-day sets, not the half', light.recap.upd);
  ok(light.day.frontSquat === 3 && light.day.backSquat === 3, 'a lighter day: after Update, Upper A has each squat at 3 sets', light.day);

  const deload = await run('deload');
  ok(deload.d0 && deload.d0.deload && deload.added.every(a => a.plan === 2), 'a deload week: each squat is added at half its sets', deload.added);
  ok(deload.day.frontSquat === 3 && deload.day.backSquat === 3, 'a deload week: after Update, Upper A has each squat at 3 sets', deload.day);

  // ---- A set stronger than ever on a lighter day is a PR, and that session is a full one for its lift (V, 2026-10-18).
  const pr = await (async () => {
    await ev(() => {
      const L = window.__ironlog; const S = L.state; const R = S.routines.find(r => r.id === S.activeRoutineId);
      const set = (w, r) => ({ w, r, rir: 1, warm: false, drop: false });
      // Bench (Upper A, 6-10): 100 x 8, 8 on two Thursdays. The loads here are kilograms, so the screens show kilograms: a log kept in one
      // unit and read in the other is put on the other unit's steps since r53 (tests/r53b.js), which is not what this part is about.
      S.settings.unit = 'kg';
      S.sessions = ['2026-10-01', '2026-10-08'].map((d, i) => ({ id: 'b' + i, date: d, dayIdx: 0, dayId: R.days[0].id, dayName: 'Upper A', routineId: R.id, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [set(100, 8), set(100, 8)] }] }));
      S.draft = null; S.deloadWeek = null; L.invalidate(); L.saveNow(); L.render();
    });
    // A lighter day with the bench press alone: its sets as [load, reps], every one done (a number alone: two sets of 8 at it).
    const one = async (w) => {
      const sets = Array.isArray(w) ? w : [[w, 8], [w, 8]];
      await ev(() => window.__ironlog.ACT.startSession({ dataset: { day: '0', light: '1' } })); await wait(150);
      await ev((sets) => { const L = window.__ironlog; const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench'); for (const b of d.ex) b.sets = sets.map(([w, r]) => ({ w, r, rir: null, warm: false, drop: false, done: true })); L.saveNow(); }, sets);
      await ev(() => window.__ironlog.ACT.finish()); await wait(400);
      const r = await ev(() => { const L = window.__ironlog; const m = L.ui.modal; const sid = L.state.sessions[L.state.sessions.length - 1].id; return { recap: m && m.kind === 'recap' ? (document.getElementById('recapPR') || { innerText: '' }).innerText : null, lines: m && m.kind === 'recap' ? m.lines : null, prs: L.IDX().prs.filter(p => p.sid === sid && p.big).map(p => p.type), exp: L.IDX().byEx.bench.slice(-1).map(x => ({ light: x.light })) }; });
      await ev(() => window.__ironlog.ACT.mClose()); await wait(100);
      return r;
    };
    const lighter = await one(90);
    // Today is Thursday 15 October; the second lighter session is dated the same day, after the first.
    const strong = await one(120);
    const next = await ev(() => { const L = window.__ironlog; const b = L.newBlock('bench', L.planFor('bench'), {}); return { last: b.last, sw: b.sw, target: b.target }; });
    const trendAt = await ev(() => { const L = window.__ironlog; const I = L.IDX(); const all = I.byEx.bench; return { lastFull: I.exStats.bench.last.date + ' ' + I.exStats.bench.last.topW, full: all.filter(x => !L.offTarget(x)).map(x => x.topW) }; });
    // What the trend reads: the lift's full sessions (exStats.last is the newest of them, the end the trend is drawn to).
    const recent = await ev(() => window.__ironlog.recent4w().prs.filter(p => p.exId === 'bench').length);
    // Then a lighter day with a heavy single, 130 x 1: heavier than ever, not stronger than 120 x 8 (Brzycki 149 against 130).
    const single = await one([[130, 1], [90, 8]]);
    const after = await ev(() => { const L = window.__ironlog; const I = L.IDX(); return I.byEx.bench.filter(x => !L.offTarget(x)).map(x => x.topW); });
    // A lighter day done at the usual load, 120 x 8 again: no PR, and a full session for the bench press all the same.
    const usual = await one(120);
    // A lighter day at 100 for 18 and 18: stronger than ever by the rep score (100 x 18 scores 160, 120 x 8 at its usual 1 in reserve 154), so a PR, but done lighter, so the session stays lighter and the next target stays at 120.
    const reps = await one([[100, 18], [100, 18]]);
    const next2 = await ev(() => { const L = window.__ironlog; const b = L.newBlock('bench', L.planFor('bench'), {}); return { last: b.last, sw: b.sw, target: b.target }; });
    const full2 = await ev(() => { const L = window.__ironlog; return L.IDX().byEx.bench.filter(x => !L.offTarget(x)).map(x => x.topW); });
    // Back to the starter's pounds for the parts below.
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; L.invalidate(); L.saveNow(); L.render(); });
    return { lighter, strong, next, recent, trend: trendAt, single, after, usual, reps, next2, full2 };
  })();
  // The screens show the log's kilograms in this part.
  const w120 = '120';
  ok(pr.lighter.prs.length === 0 && pr.lighter.exp[0].light === true && !pr.lighter.recap, 'a lighter day at 90 x 8, no stronger than before: no PR, and the session stays lighter for the lift', pr.lighter);
  ok(JSON.stringify(pr.strong.prs) === JSON.stringify(['Weight PR']) && /Bench/.test(pr.strong.recap || ''), 'a lighter day at 120 x 8, stronger than ever: Finish shows it as a PR, and the PR list counts it', pr.strong);
  ok(pr.strong.exp[0].light === false, 'that session counts as a full one for the bench press', pr.strong.exp);
  ok(pr.recent === 1, 'Recent PRs counts it', pr.recent);
  const w130 = '130';
  ok(pr.single.prs.length === 0 && pr.single.exp[0].light === true && (pr.single.lines || []).some(l => /^Heaviest yet: Barbell Bench Press /.test(l) && l.includes(w130)), 'a lighter day with a heavy single, 130 x 1, heavier than ever but not stronger: no PR, the recap says Heaviest yet, as on any day, and the session stays lighter', pr.single);
  ok(JSON.stringify(pr.after) === '[100,100,120]', 'the trend still reads 100, 100, and 120: the single does not move it', pr.after);
  ok(pr.usual.prs.length === 0 && pr.usual.exp[0].light === false, 'a lighter day done at the usual load, 120 x 8 again: no PR, and a full session for the lift all the same', pr.usual);
  ok(JSON.stringify(pr.reps.prs) === '["Rep PR"]' && pr.reps.exp[0].light === true && /Bench/.test(pr.reps.recap || ''), 'a lighter day at 100 for 18 and 18: a PR (stronger than ever by the rep score), but done lighter, so the session stays lighter', pr.reps);
  ok(JSON.stringify(pr.full2) === '[100,100,120,120]' && (pr.next2.target || '').includes(w120) && pr.next2.sw >= 120 - 1e-6 && (pr.next2.last || '').includes('lighter'), 'and the next bench press is still set from 120: its load and target, while its Last line shows that lighter day, marked lighter', pr);
  ok(pr.trend.lastFull === '2026-10-15 120' && JSON.stringify(pr.trend.full) === '[100,100,120]', 'the trend reads it: the bench press\'s full sessions are 100, 100, and 120, the lighter day at 90 left out', pr.trend);
  ok((pr.next.last || '').includes(w120) && !/lighter/i.test(pr.next.last || '') && pr.next.sw >= 120 - 1e-6 && (pr.next.target || '').includes(w120), 'the next bench press starts from it: its Last line (without "lighter"), its load and its target are 120 kg', pr.next);

  // ---- Half the sets at the usual load on a lighter day (the review of r53): the usual is the load and reps for as many sets.
  const half = await (async () => {
    await ev(() => {
      const L = window.__ironlog; const S = L.state; const R = S.routines.find(r => r.id === S.activeRoutineId);
      const set = (w, r) => ({ w, r, rir: 1, warm: false, drop: false });
      // Bench, four sets of 100 x 10, 10, 9 and 8 on two Thursdays.
      S.sessions = ['2026-10-01', '2026-10-08'].map((d, i) => ({ id: 'h' + i, date: d, dayIdx: 0, dayId: R.days[0].id, dayName: 'Upper A', routineId: R.id, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [set(100, 10), set(100, 10), set(100, 9), set(100, 8)] }] }));
      S.draft = null; S.deloadWeek = null; S.injuries = []; L.invalidate(); L.saveNow(); L.render();
    });
    const next = () => ev(() => { const L = window.__ironlog; const b = L.newBlock('bench', L.planFor('bench'), {}); return { target: b.target, sw: b.sw }; });
    const before = await next();
    // A lighter day as the app plans it, the bench at half its sets, both at the usual 100 x 10.
    const day = async (sets) => {
      await ev(() => window.__ironlog.ACT.startSession({ dataset: { day: '0', light: '1' } })); await wait(150);
      await ev((sets) => { const L = window.__ironlog; const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench'); for (const b of d.ex) b.sets = sets.map(([w, r]) => ({ w, r, rir: null, warm: false, drop: false, done: true })); L.saveNow(); }, sets);
      await ev(() => window.__ironlog.ACT.finish()); await wait(400);
      await ev(() => window.__ironlog.ACT.mClose()); await wait(100);
      // How the analytics read that bench press: done lighter, short of its usual (since r54, V's one rule), or full.
      return ev(() => { const x = window.__ironlog.IDX().byEx.bench.slice(-1)[0]; return { light: x.light, short: x.short || null }; });
    };
    const twoLight = await day([[100, 10], [100, 10]]);
    const after = await next();
    // Then a lighter day where all four sets were done as usual.
    const fourLight = await day([[100, 10], [100, 10], [100, 9], [100, 8]]);
    // Four sets, then a day stopped after two (half, so still a full session), then four: a lighter day of two sets of 10 is still half the work (the second review).
    await ev(() => {
      const L = window.__ironlog; const S = L.state; const R = S.routines.find(r => r.id === S.activeRoutineId);
      const set = (w, r) => ({ w, r, rir: 1, warm: false, drop: false });
      const four = [set(100, 10), set(100, 10), set(100, 9), set(100, 8)];
      S.sessions = [['2026-09-24', four], ['2026-10-01', [set(100, 10), set(100, 10)]], ['2026-10-08', four]].map(([d, sets], i) => ({ id: 'q' + i, date: d, dayIdx: 0, dayId: R.days[0].id, dayName: 'Upper A', routineId: R.id, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets }] }));
      S.draft = null; L.invalidate(); L.saveNow(); L.render();
    });
    const before2 = await next();
    const shortRef = await day([[100, 10], [100, 10]]);
    const after2 = await next();
    return { before, twoLight, after, fourLight, before2, shortRef, after2 };
  })();
  // Since r54 (V's one rule) a lift done at its usual load and reps with fewer sets than usual is short of its usual, not lighter: its trend counts, and its target repeats, so the next target is the same as before.
  ok(half.twoLight.light === false && half.twoLight.short === 'sets' && half.after.target === half.before.target && half.after.sw === half.before.sw && /over 4 sets/.test(half.before.target || ''), 'a lighter day with the bench at half its sets, 100 x 10 and 10 after four sets of 10, 10, 9 and 8: short of its usual by its sets, and the next target is still the four-set one, with no load added off half the work', half);
  ok(half.fourLight.light === false && !half.fourLight.short, 'a lighter day with all four sets done at the usual load and reps counts in full', half);
  ok(half.shortRef.light === false && half.shortRef.short === 'sets' && half.after2.target === half.before2.target && half.after2.sw === half.before2.sw, 'with one earlier session stopped after two sets of four, a lighter day of two sets of 10 is still short of its usual, and the next target does not change', half);

  // ---- Lifts with no strength reading on a lighter day: the load alone says nothing on them, so the reps (seconds on a hold) decide.
  const noRead = await (async () => {
    const IDS = ['hangingLegRaise', 'plank', 'pullup'];
    await ev(() => {
      const L = window.__ironlog; const S = L.state;
      const set = r => ({ w: 0, r, rir: 1, warm: false, drop: false });
      // Hanging leg raises (no estimate), a plank (a timed hold) and pull-ups before any weigh-in (a load of 0, so no reading): 12, 60 s and 8, two sets each, on two Thursdays.
      S.sessions = ['2026-09-24', '2026-10-01'].map((d, i) => ({ id: 'n' + i, date: d, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId: 'hangingLegRaise', rr: [8, 12], sets: [set(12), set(12)] }, { exId: 'plank', rr: [30, 60], sets: [set(60), set(60)] }, { exId: 'pullup', rr: [6, 10], sets: [set(8), set(8)] }] }));
      S.bodyweights = []; S.injuries = []; S.draft = null; S.deloadWeek = null; L.invalidate(); L.saveNow();
    });
    const next = () => ev(ids => { const L = window.__ironlog; return Object.fromEntries(ids.map(id => { const b = L.newBlock(id, L.planFor(id), {}); return [id, { target: b.target, sw: b.sw, last: b.last }]; })); }, IDS);
    const before = await next();
    // A lighter day with fewer reps and a shorter hold, at the same load: 8 and 8, 40 s and 40 s, 5 and 5.
    const day = (id, date, r) => ev(([id, date, r]) => {
      const L = window.__ironlog; const set = n => ({ w: 0, r: n, rir: 3, warm: false, drop: false });
      L.state.sessions.push({ id, date, dayIdx: 0, dayId: null, dayName: 'Session (lighter)', routineId: '', free: true, light: true, notes: '', ex: [{ exId: 'hangingLegRaise', rr: [8, 12], sets: [set(r[0]), set(r[0])] }, { exId: 'plank', rr: [30, 60], sets: [set(r[1]), set(r[1])] }, { exId: 'pullup', rr: [6, 10], sets: [set(r[2]), set(r[2])] }] });
      L.invalidate(); L.saveNow();
    }, [id, date, r]);
    const marks = sid => ev(([ids, sid]) => { const I = window.__ironlog.IDX(); return Object.fromEntries(ids.map(id => [id, I.byEx[id].find(x => x.sid === sid).light])); }, [IDS, sid]);
    await day('nl', '2026-10-08', [8, 40, 5]);
    const fewer = await marks('nl'), after = await next();
    // Then a lighter day done in full, at the usual reps and hold.
    await day('nf', '2026-10-10', [12, 60, 8]);
    const usual = await marks('nf');
    return { before, fewer, after, usual };
  })();
  ok(Object.values(noRead.fewer).every(v => v === true), 'a lighter day of 8 leg raises, a 40 s plank and 5 pull-ups (no weigh-in), at the usual load but for fewer reps: each stays lighter for its lift', noRead.fewer);
  ok(['hangingLegRaise', 'plank', 'pullup'].every(id => noRead.after[id].target === noRead.before[id].target && noRead.after[id].sw === noRead.before[id].sw && /lighter/.test(noRead.after[id].last || '')), 'so each next target is the one before that day, and its Last line shows the day, marked lighter', noRead);
  ok(Object.values(noRead.usual).every(v => v === false), 'a lighter day with 12 leg raises, a 60 s plank and 8 pull-ups, as usual: a full session for each lift', noRead.usual);

  // ---- A lift on no day of the routine starts from its own last full session (V, 2026-10-18: "tied at exercise level").
  const own = await (async () => {
    await ev(() => {
      const L = window.__ironlog; const S = L.state;
      const set = r => ({ w: 80, r, rir: 2, warm: false, drop: false });
      const fs = (id, date, light, n) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', light, ex: [{ exId: 'frontSquat', rr: [3, 5], sets: Array.from({ length: n }, () => set(5)) }] });
      // Five sets of 5 at 3-5 on 1 October; a lighter day with 2 on 8 October, which does not count.
      S.sessions = [fs('f1', '2026-10-01', false, 5), fs('f2', '2026-10-08', true, 2)];
      // The checks above added the front squat to Upper A: it leaves the routine again, so it sits on no day.
      for (const R of S.routines) for (const d of R.days) d.items = d.items.filter(i => i.exId !== 'frontSquat');
      S.draft = null; delete S.settings.profile; L.invalidate(); L.saveNow(); L.render();
    });
    const add = async (light) => {
      await ev((light) => window.__ironlog.ACT.startSession({ dataset: { day: '0', light: light ? '1' : '0' } }), light); await wait(100);
      await ev(() => window.__ironlog.ACT.pickSession()); await wait(100);
      await ev(() => window.__ironlog.applyPick(window.__ironlog.ui.modal, 'frontSquat')); await wait(100);
      const b = await ev(() => { const d = window.__ironlog.state.draft; const b = d.ex[d.ex.length - 1]; return { plan: `${b.plan.sets} x ${b.plan.repMin}-${b.plan.repMax}`, rows: b.sets.length, last: b.last }; });
      await ev(() => { window.__ironlog.state.draft = null; window.__ironlog.saveNow(); });
      return b;
    };
    const normal = await add(false), light = await add(true);
    await ev(() => { const L = window.__ironlog; L.state.settings.profile = { goal: 'strength', exp: 'mid' }; L.invalidate(); L.saveNow(); });
    const strength = await add(false);
    const pl = () => ev(() => { const p = window.__ironlog.planFor('pauseSquat'); return `${p.sets} x ${p.repMin}-${p.repMax}`; });
    const neverStrength = await pl();
    await ev(() => { const L = window.__ironlog; delete L.state.settings.profile; L.invalidate(); L.saveNow(); });
    const never = await pl();
    return { normal, light, strength, never, neverStrength };
  })();
  ok(own.normal.plan === '5 x 3-5' && own.normal.rows === 5, 'the front squat, on no day of the routine, comes in at its own last full session: 5 sets of 3-5, not 3 of 8-12', own.normal);
  ok(own.light.plan === '3 x 3-5', 'on a lighter day it comes in at half of that, 3 sets of 3-5', own.light);
  ok(own.strength.plan === '5 x 3-6', 'with Strength in Your training, the profile sets its range (3-6) and its own last session the sets', own.strength);
  ok(own.never === '3 x 8-12' && own.neverStrength === '3 x 3-6', 'a lift never logged starts at the default as before: 3 x 8-12, or 3 x 3-6 with Strength', own);

  // ---- The coach after one Lighter day, and a lift held for an injury (the audit V asked for, 2026-10-18).
  const coach = await (async () => {
    await ev(() => {
      const L = window.__ironlog; const S = L.state;
      const set = () => ({ w: 100, r: 8, rir: 1, warm: false, drop: false });
      // Bench, back squat and Romanian deadlift at 100 x 8, 8 every Thursday for six weeks: three main lifts stalled.
      const wk = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];
      S.sessions = wk.map((d, i) => ({ id: 'c' + i, date: d, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: ['bench', 'backSquat', 'rdl'].map(exId => ({ exId, rr: [6, 10], sets: [set(), set()] })) }));
      // Then one Lighter day on Saturday 10 October, a poor night: bench at 90.
      S.sessions.push({ id: 'cl', date: '2026-10-10', dayIdx: 0, dayId: null, dayName: 'Session (lighter)', routineId: '', free: true, light: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: 90, r: 8, rir: 3, warm: false, drop: false }] }] });
      S.injuries = []; S.draft = null; S.deloadWeek = null; L.invalidate(); L.saveNow();
    });
    const lighterDay = await ev(() => { const L = window.__ironlog; return { coach: L.coach().text, stalled: Object.entries(L.IDX().exStats).filter(([, x]) => x.stalled).map(([id]) => id).sort() }; });
    // The same six weeks, and the Lighter day with the bench at 105 x 8, one set: a weight PR, so the bench is moving, not stalled; a PR is a PR whenever it happens (the fifth review).
    await ev(() => { const L = window.__ironlog; const x = L.state.sessions.find(q => q.id === 'cl'); x.ex[0].sets = [{ w: 105, r: 8, rir: 1, warm: false, drop: false }]; L.invalidate(); L.saveNow(); });
    const prDay = await ev(() => { const L = window.__ironlog; const I = L.IDX(); return { coach: L.coach().text, prs: I.prs.filter(p => p.sid === 'cl').map(p => p.type), light: I.byEx.bench.find(x => x.sid === 'cl').light, short: I.byEx.bench.find(x => x.sid === 'cl').short || null, stalled: Object.entries(I.exStats).filter(([, x]) => x.stalled).map(([id]) => id).sort() }; });
    // The Lighter day's bench at 90 x 9, 3 in reserve: one rep more than the usual 8, at the lighter load. A rep PR at that load, not stronger than
    // ever, so Recent PRs does not list it and it does not end the stall (the sixth review).
    await ev(() => { const L = window.__ironlog; const x = L.state.sessions.find(q => q.id === 'cl'); x.ex[0].sets = [{ w: 90, r: 9, rir: 3, warm: false, drop: false }]; L.invalidate(); L.saveNow(); });
    const repDay = await ev(() => { const L = window.__ironlog; const I = L.IDX(); return { coach: L.coach().text, prs: I.prs.filter(p => p.sid === 'cl').map(p => p.type + (p.big ? ' listed' : '')), stalled: Object.entries(I.exStats).filter(([, x]) => x.stalled).map(([id]) => id).sort() }; });
    // The same six weeks, the last as a deload begun mid-week: a normal Monday, then deload sessions on Wednesday and Friday (the review of r53).
    const read = () => ev(() => { const L = window.__ironlog; L.invalidate(); return { coach: L.coach().text, stalled: Object.entries(L.IDX().exStats).filter(([, x]) => x.stalled).map(([id]) => id).sort() }; });
    await ev(() => {
      const L = window.__ironlog; const S = L.state;
      const set = () => ({ w: 100, r: 8, rir: 1, warm: false, drop: false });
      const ses = (id, date, deload) => ({ id, date, dayIdx: 0, dayId: null, dayName: deload ? 'Session (deload)' : 'Session', routineId: '', free: true, deload, notes: '', ex: ['bench', 'backSquat', 'rdl'].map(exId => ({ exId, rr: [6, 10], sets: deload ? [{ ...set(), w: 90, rir: 3 }] : [set(), set()] })) });
      S.sessions = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-05'].map((d, i) => ses('m' + i, d, false)).concat([ses('d1', '2026-10-07', true), ses('d2', '2026-10-09', true)]);
      L.saveNow();
    });
    const afterDeload = await read();
    // And six flat Thursdays, then a Lighter day this Monday, the only session of the week so far: not a lighter week yet.
    await ev(() => {
      const L = window.__ironlog; const S = L.state;
      const set = () => ({ w: 100, r: 8, rir: 1, warm: false, drop: false });
      S.sessions = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'].map((d, i) => ({ id: 'w' + i, date: d, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: ['bench', 'backSquat', 'rdl'].map(exId => ({ exId, rr: [6, 10], sets: [set(), set()] })) }));
      S.sessions.push({ id: 'wl', date: '2026-10-12', dayIdx: 0, dayId: null, dayName: 'Session (lighter)', routineId: '', free: true, light: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: 90, r: 8, rir: 3, warm: false, drop: false }] }] });
      L.saveNow();
    });
    const thisWeek = await read();
    // The coach's other cases from the second review, each on six flat Thursdays to 1 October and the week after it (5 to 11 October) as set out.
    const weeks = async (late) => { await ev((late) => {
      const L = window.__ironlog; const S = L.state;
      const set = (w) => ({ w, r: 8, rir: 1, warm: false, drop: false });
      const ses = (id, date, mark, w) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, deload: mark === 'deload', light: mark === 'light', notes: '', ex: ['bench', 'backSquat', 'rdl'].map(exId => ({ exId, rr: [6, 10], sets: [set(w), set(w)] })) });
      S.sessions = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01'].map((d, i) => ses('k' + i, d, '', 100)).concat(late.map(([id, d, mark, w]) => ses(id, d, mark, w)));
      S.deloadWeek = null; L.saveNow();
    }, late); };
    // A normal Monday and Wednesday, then Deload week tapped on the Saturday with nothing more done: no deload happened.
    await weeks([['n1', '2026-10-05', '', 100], ['n2', '2026-10-07', '', 100]]);
    await ev(() => { const L = window.__ironlog; L.state.deloadWeek = '2026-10-05'; L.saveNow(); });
    const markedLate = await read();
    // Deload sessions on Wednesday and Friday done at the usual 100 x 8, 8 for every lift: no deload happened either.
    await weeks([['n1', '2026-10-05', '', 100], ['d1', '2026-10-07', 'deload', 100], ['d2', '2026-10-09', 'deload', 100]]);
    const deloadFull = await read();
    // A normal week, then Lighter days this Monday and Wednesday, at 90: a lighter week under way.
    await weeks([['n1', '2026-10-05', '', 100], ['n2', '2026-10-08', '', 100], ['l1', '2026-10-12', 'light', 90], ['l2', '2026-10-14', 'light', 90]]);
    const twoLight = await read();
    // One deload session on the Saturday after a normal Monday and Wednesday: one day, as one Lighter day is (the third review).
    await weeks([['n1', '2026-10-05', '', 100], ['n2', '2026-10-07', '', 100], ['d1', '2026-10-10', 'deload', 90]]);
    const oneDeload = await read();
    // Four days a week, Deload week tapped on Wednesday: normal Monday and Tuesday, deloads on Thursday and Friday as it sets them (the fourth review).
    await weeks([['n1', '2026-10-05', '', 100], ['n2', '2026-10-06', '', 100], ['d1', '2026-10-08', 'deload', 90], ['d2', '2026-10-09', 'deload', 90]]);
    const fourDay = await read();
    // Lighter days on Thursday and Friday after three normal days: two of five, as on Monday and Tuesday; only a deload makes the last-sessions run (the fifth review).
    await weeks([['n1', '2026-10-05', '', 100], ['n2', '2026-10-06', '', 100], ['n3', '2026-10-07', '', 100], ['l1', '2026-10-08', 'light', 90], ['l2', '2026-10-09', 'light', 90]]);
    const lightLate = await read();
    // Deloads on Monday and Tuesday, then two normal days: no deload begun mid-week, two of four.
    await weeks([['d1', '2026-10-05', 'deload', 90], ['d2', '2026-10-06', 'deload', 90], ['n1', '2026-10-07', '', 100], ['n2', '2026-10-08', '', 100]]);
    const deloadEarly = await read();
    // Freestyle mode: Deload week tapped on Wednesday, normal Monday and Tuesday, then Thursday and Friday as blank sessions at 90, which a blank
    // session does not tag as deloads (PENDING 311): the marked week's last two, done lighter, so no deload is asked for again (the sixth review).
    await weeks([['n1', '2026-10-05', '', 100], ['n2', '2026-10-06', '', 100], ['f1', '2026-10-08', '', 90], ['f2', '2026-10-09', '', 90]]);
    await ev(() => { const L = window.__ironlog; L.state.deloadWeek = '2026-10-05'; L.saveNow(); });
    const freeDeload = await read();
    // Back to the first six weeks and the Lighter day after them, for the injury check below.
    await ev(() => {
      const L = window.__ironlog; const S = L.state;
      const set = () => ({ w: 100, r: 8, rir: 1, warm: false, drop: false });
      const wk = ['2026-09-03', '2026-09-10', '2026-09-17', '2026-09-24', '2026-10-01', '2026-10-08'];
      S.sessions = wk.map((d, i) => ({ id: 'c' + i, date: d, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: ['bench', 'backSquat', 'rdl'].map(exId => ({ exId, rr: [6, 10], sets: [set(), set()] })) }));
      S.sessions.push({ id: 'cl', date: '2026-10-10', dayIdx: 0, dayId: null, dayName: 'Session (lighter)', routineId: '', free: true, light: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: 90, r: 8, rir: 3, warm: false, drop: false }] }] });
      L.invalidate(); L.saveNow();
    });
    // The same, with the chest flagged as injured: the engine holds the bench press at last time's load.
    await ev(() => { const L = window.__ironlog; L.state.injuries = [{ m: 'chest', note: '' }]; L.invalidate(); L.saveNow(); });
    const injured = await ev(() => { const L = window.__ironlog; return { stalled: Object.entries(L.IDX().exStats).filter(([, x]) => x.stalled).map(([id]) => id).sort(), coach: L.coach().text }; });
    await ev(() => { const L = window.__ironlog; L.state.injuries = []; L.invalidate(); L.saveNow(); });
    return { lighterDay, prDay, repDay, afterDeload, thisWeek, markedLate, deloadFull, twoLight, oneDeload, fourDay, lightLate, deloadEarly, freeDeload, injured };
  })();
  ok(JSON.stringify(coach.lighterDay.stalled) === '["backSquat","bench","rdl"]' && /^3 main lifts stalled at once/.test(coach.lighterDay.coach || ''), 'one Lighter day after a poor night does not keep the deload away: three main lifts flat for six weeks, and the coach says so', coach.lighterDay);
  // Since r54 (V's one rule) the one set at a heavier load than usual is short of its usual by its sets, not lighter, so its PR is in the stall's own stretch.
  ok(JSON.stringify(coach.prDay.prs) === '["Weight PR"]' && coach.prDay.light === false && coach.prDay.short === 'sets' && JSON.stringify(coach.prDay.stalled) === '["backSquat","rdl"]' && !/^3 main lifts stalled at once/.test(coach.prDay.coach || '') && !/Bench Press has stalled/.test(coach.prDay.coach || ''), 'the same Lighter day with the bench at 105 x 8, one set: a weight PR on a session short of its usual sets, and the bench no longer reads stalled beside it (two main lifts stalled, not three)', coach.prDay);
  ok(JSON.stringify(coach.repDay.prs) === '["Rep PR"]' && JSON.stringify(coach.repDay.stalled) === '["backSquat","bench","rdl"]' && /^3 main lifts stalled at once/.test(coach.repDay.coach || ''), 'the Lighter day\'s bench at 90 x 9 instead: a rep PR at the lighter load that Recent PRs does not list, so the bench still reads stalled and the coach still names all three', coach.repDay);
  ok(JSON.stringify(coach.afterDeload.stalled) === '["backSquat","bench","rdl"]' && !/stalled at once/.test(coach.afterDeload.coach || ''), 'a deload begun mid-week, on Wednesday and Friday after a normal Monday: the coach does not ask for another deload the next week', coach.afterDeload);
  ok(JSON.stringify(coach.thisWeek.stalled) === '["backSquat","bench","rdl"]' && /^3 main lifts stalled at once/.test(coach.thisWeek.coach || ''), 'a Lighter day this Monday, the week\'s only session so far, is not a lighter week yet: the coach still names the three stalled lifts', coach.thisWeek);
  ok(/^3 main lifts stalled at once/.test(coach.markedLate.coach || ''), 'Deload week tapped on a Saturday after a normal week, with nothing done in it: the coach still names the three stalled lifts the next week', coach.markedLate);
  ok(/^3 main lifts stalled at once/.test(coach.deloadFull.coach || ''), 'deload sessions where every lift was done at its usual load and reps for as many sets are no deload: the coach still names the three stalled lifts', coach.deloadFull);
  ok(/^3 main lifts stalled at once/.test(coach.oneDeload.coach || ''), 'one deload session after a normal Monday and Wednesday is one day, not a deload week: the coach still names the three stalled lifts', coach.oneDeload);
  ok(!/stalled at once/.test(coach.fourDay.coach || ''), 'four days a week, Deload week tapped on Wednesday and done on Thursday and Friday: the coach does not ask for another deload the next week', coach.fourDay);
  ok(/^3 main lifts stalled at once/.test(coach.lightLate.coach || ''), 'Lighter days on Thursday and Friday after three normal days are two of five, as they would be on Monday and Tuesday: the coach still names the three stalled lifts the next week', coach.lightLate);
  ok(/^3 main lifts stalled at once/.test(coach.deloadEarly.coach || ''), 'deloads on Monday and Tuesday followed by two normal days are two of four, not a deload begun mid-week: the coach still names the three stalled lifts', coach.deloadEarly);
  ok(!/stalled at once/.test(coach.freeDeload.coach || ''), 'in Freestyle mode, Deload week tapped on Wednesday and blank sessions on Thursday and Friday done at 90: the coach does not ask for another deload the next week', coach.freeDeload);
  ok(!/stalled at once/.test(coach.twoLight.coach || ''), 'Lighter days on Monday and Wednesday of this week, done lighter: a lighter week under way, so the coach does not ask for a deload on Thursday', coach.twoLight);
  ok(JSON.stringify(coach.injured.stalled) === '["backSquat","rdl"]' && !/Bench/.test(coach.injured.coach || ''), 'a bench press held for a flagged chest injury is not called stalled, and the coach leaves it out', coach.injured);

  ok(!P.errors.length, 'no page errors', P.errors);
  await P.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
