// r32.1 (2026-10-07): the two items r32's second check left open.
// Part 1: PRs on bodyweight lifts are judged at one bodyweight (the latest
// weigh-in), so a heavier day on the scale never makes the same reps a PR,
// in the PR list, the count, the live toast, the bests board or the screen.
// Part 2: the first session of a close variation (a hammer curl after DB
// curls) starts from the related lift's last full session, conservatively;
// unrelated lifts, machines, cables and one-leg work still start fresh.
// Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const FILE = 'index.html';

// Eight weekly sessions, the same sets each time, weigh-ins drifting up.
const DATES = ['2026-08-19', '2026-08-26', '2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07'];
const BW = [80, 80.4, 80.1, 80.7, 81, 80.6, 81.2, 81.5];
const seedBW = (L, bw, lists) => {
  const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg'; s.settings.rirMode = 'on'; s.draft = null;
  s.bodyweights = bw.map((kg, i) => ({ id: 'bw' + i, date: lists.dates[i], kg }));
  s.sessions = lists.dates.map((d, i) => ({ id: 's' + i, date: d, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: lists.ex.map(([exId, rr, per]) => ({ exId, rr, sets: per(i).map(([w, r]) => ({ w, r, rir: 1, done: true })) })) }));
  L.invalidate();
};
const mk = (id, d, exId, sets, rr, extra) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ...(extra || {}), ex: [{ exId, rr, sets: sets.map(([w, r, rir]) => ({ w, r, rir, done: true })) }] });

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();

  // ---------- Part 1: bodyweight PRs ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-07T18:00:00' });
    const r = await P.page.evaluate(([D, B, seedS, mkS]) => {
      const seedBW = eval(seedS); const mk = eval(mkS); const L = window.__ironlog; const out = {};
      const same = { dates: D, ex: [['pullup', [6, 10], () => [[0, 8], [0, 8], [0, 7]]], ['hangingLegRaise', [10, 15], () => [[0, 12], [0, 12], [0, 11]]]] };
      seedBW(L, B, same);
      out.prs = L.IDX().prs.map(p => [p.date, p.exId, p.type]); out.n30 = L.prsWithin(30).length;
      const b = L.allTimeBests('pullup'); out.front = b.front.map(f => [f.p.w, f.p.r, f.date]); out.heavy = b.heavy.date;
      const h = L.allTimeBests('hangingLegRaise'); out.hfront = h.front.map(f => [f.p.w, f.p.r, f.date]);
      // A heavier weigh-in today, then the same 8 pull-ups and 12 leg raises live.
      L.state.bodyweights.push({ id: 'bwT', date: '2026-10-08', kg: 82.4 }); L.invalidate();
      out.live8 = L.livePR('pullup', { w: 0, r: 8, rir: 1, done: true }, '2026-10-08');
      out.live12 = L.livePR('hangingLegRaise', { w: 0, r: 12, rir: 1, done: true }, '2026-10-08');
      out.live9 = L.livePR('pullup', { w: 0, r: 9, rir: 1, done: true }, '2026-10-08');
      out.live13 = L.livePR('hangingLegRaise', { w: 0, r: 13, rir: 1, done: true }, '2026-10-08');
      out.liveW = L.livePR('pullup', { w: 5, r: 8, rir: 1, done: true }, '2026-10-08');
      // Real progress still counts: a rep more in week 4, added load in week 7; leg raises a rep more in week 5.
      const grow = { dates: D, ex: [['pullup', [6, 10], i => i >= 6 ? [[5, 8], [5, 8], [5, 7]] : i >= 3 ? [[0, 9], [0, 8], [0, 8]] : [[0, 8], [0, 8], [0, 7]]], ['hangingLegRaise', [10, 15], i => i >= 4 ? [[0, 13], [0, 12], [0, 12]] : [[0, 12], [0, 12], [0, 11]]]] };
      seedBW(L, B, grow);
      out.grow = L.IDX().prs.map(p => [p.date, p.exId, p.type, p.big]);
      // Weigh-ins falling: still nothing from the scale, and the earlier real PR is kept.
      seedBW(L, B.map(v => 160 - v), grow);
      out.fall = L.IDX().prs.map(p => [p.date, p.exId, p.type, p.big]);
      // A loaded lift is judged as before.
      L.state.sessions = [mk('b1', '2026-09-30', 'bench', [[100, 8, 1], [100, 8, 1]], [6, 10]), mk('b2', '2026-10-07', 'bench', [[100, 9, 1], [100, 8, 1]], [6, 10])]; L.invalidate();
      out.bench = L.IDX().prs.map(p => [p.date, p.type, p.big]);
      out.guide = (() => { L.ACT.guideOpen({ dataset: {} }); const t = document.body.innerText; L.state.modal = null; return /PRs are judged at your latest weigh-in/.test(document.documentElement.innerHTML); })();
      return out;
    }, [DATES, BW, seedBW.toString(), mk.toString()]);
    ok(r.prs.length === 0 && r.n30 === 0, 'eight identical weeks with weigh-ins going up: no PRs listed or counted (r32 had 10)', r);
    ok(r.front.length === 1 && r.front[0][2] === '2026-08-19' && r.heavy === '2026-08-19', 'the bests board dates the pull-up record (8 reps) to the first session, not the heaviest day on the scale', r);
    ok(r.hfront.length === 1 && r.hfront[0][2] === '2026-08-19', 'and the leg raise record (12 reps) too', r.hfront);
    ok(r.live8 === null && r.live12 === null, 'after a weigh-in 0.9 kg up, the same 8 pull-ups and 12 leg raises are not a PR in the session', r);
    ok(!!r.live9 && !!r.live13, 'one more rep is a PR on both (' + r.live9 + ', ' + r.live13 + ')', r);
    ok(r.liveW === 'Weight PR', 'added load on pull-ups is a weight PR', r.liveW);
    const g = r.grow;
    ok(g.some(p => p[0] === '2026-09-09' && p[1] === 'pullup' && p[3]) && g.some(p => p[0] === '2026-09-30' && p[1] === 'pullup' && p[2] === 'Weight PR'), 'real progress still counts: 9 pull-ups (Sep 9) and +5 kg (Sep 30, a weight PR)', g);
    ok(g.some(p => p[0] === '2026-09-16' && p[1] === 'hangingLegRaise' && p[2] === 'Rep PR' && p[3]), 'and 13 leg raises (Sep 16) is a counted rep PR', g);
    ok(g.filter(p => p[1] === 'pullup').length === 2 && g.filter(p => p[1] === 'hangingLegRaise').length === 1, 'and nothing else: one PR per real change, none from the scale', g);
    ok(JSON.stringify(r.fall) === JSON.stringify(g), 'with weigh-ins going down instead, the same PRs, no more and none lost', { fall: r.fall, grow: g });
    ok(r.bench.length === 1 && r.bench[0][0] === '2026-10-07' && r.bench[0][2], 'a loaded lift is judged as before: bench 100 x 9 after 100 x 8 is a counted PR', r.bench);
    ok(r.guide, 'the Guide says bodyweight PRs are judged at the latest weigh-in');

    // Through the screen: a session on the heavier day, tick 8 then 9 pull-ups.
    const ui = await P.page.evaluate(([D, B, seedS]) => {
      const seedBW = eval(seedS); const L = window.__ironlog;
      seedBW(L, B, { dates: D, ex: [['pullup', [6, 10], () => [[0, 8], [0, 8], [0, 7]]]] });
      L.state.bodyweights.push({ id: 'bwT', date: '2026-10-07', kg: 82.4 });
      const R = L.state.routines[0]; R.days[0].items = [{ uid: 'p', exId: 'pullup', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5, ss: null }];
      L.state.sessions = L.state.sessions.filter(s => s.date < '2026-10-07'); L.invalidate();
      L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } });
      return true;
    }, [DATES, BW, seedBW.toString()]);
    const tick = async (si, reps) => {
      await P.page.fill(`.sg input[data-f="r"][data-b="0"][data-s="${si}"]`, String(reps));
      await P.page.click(`[data-act="sDone"][data-b="0"][data-s="${si}"]`); await P.page.waitForTimeout(150);
      return P.page.evaluate(s => { const b = document.querySelector(`[data-act="sDone"][data-b="0"][data-s="${s}"]`); const row = b && b.closest('.sg'); return row ? row.classList.contains('pr') : null; }, si);
    };
    ok(ui && (await tick(0, 8)) === false, 'on screen, 8 pull-ups on a heavier day: no PR mark on the row');
    ok((await tick(1, 9)) === true, 'on screen, 9 pull-ups: the row is marked a PR');
    ok(!P.errors.length, 'part 1 ran with no page errors', P.errors);
    await P.ctx.close();
  }

  // ---------- Part 2: a close variation's first session ----------
  {
    const P = await open(FILE, { browser, clock: '2026-10-07T10:00:00' });
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
      return o;
    }, [mk.toString()]);
    ok(r.hammer.w === 14 && r.hammer.kin === 'dbCurl' && /from your DB Curl \(16×10, Oct 1\)/.test(r.hammer.t), 'a hammer curl after DB curl 16 x 10 starts at 14 kg, worked out by hand, and says where it came from', r.hammer);
    ok(r.incCurl.w === 14, 'an incline DB curl the same way', r.incCurl);
    ok(r.front.w === 92.5 && r.front.kin === 'backSquat', 'a front squat after back squat 120 x 8 starts at 92.5 kg (80% on a compound lift)', r.front);
    ok(r.inc.w === 75 && r.inc.kin === 'bench', 'an incline bench after bench 100 x 8 starts at 75 kg', r.inc);
    ok(r.cable.w == null && !r.cable.kin && /First time: pick a load/.test(r.cable.t), 'a cable curl starts fresh: a stack is not dumbbells', r.cable);
    ok(r.lunge.w == null && !r.lunge.kin, 'a walking lunge does not borrow from a back squat', r.lunge);
    ok(r.dbB.w == null && !r.dbB.kin, 'DB bench does not borrow from barbell bench (load per dumbbell, not total)', r.dbB);
    ok(r.bb.w == null && !r.bb.kin, 'a barbell curl does not borrow from DB curls', r.bb);
    ok(r.self.kin === null && !/First time/.test(r.self.t), 'the DB curl itself still reads its own history', r.self);
    ok(r.old.w == null && !r.old.kin, 'a related lift last trained over 120 days ago is not used', r.old);
    ok(r.dl.w === 14 && r.dl.kin === 'dbCurl' && /Sep 24/.test(r.dl.t), 'a deload session is skipped: the start comes from the full session before it', r.dl);
    ok(Math.abs(r.lbD - 30) < 1e-6, 'in lb on a 5 lb rack, DB curl 35 x 10 gives a hammer curl of 30 lb', r.lb);

    // Through the screen: a session with DB curls, swapped for hammer curls; the grey load is 14.
    const sw = await P.page.evaluate(([mkS]) => {
      const mk = eval(mkS); const L = window.__ironlog; const s = L.state; s.settings.unit = 'kg'; s.draft = null;
      s.sessions = [mk('a', '2026-10-01', 'dbCurl', [[16, 10, 1], [16, 10, 1], [16, 9, 1]], [8, 12])]; L.invalidate();
      const R = s.routines[0]; R.days[0].items = [{ uid: 'c', exId: 'dbCurl', sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5, ss: null }];
      L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } });
      L.ACT.bSwap({ dataset: { b: '0' } }); return !!document.querySelector('#pickList');
    }, [mk.toString()]);
    ok(sw, 'the swap picker opens');
    const picked = await P.page.evaluate(() => { const q = document.querySelector('#pickQ, #pickList input, .sheet input[type="search"]'); const el = document.querySelector('#pickList .pick[data-ex="hammer"]'); if (el) { el.click(); return 'list'; } if (q) { q.value = 'hammer'; q.dispatchEvent(new Event('input', { bubbles: true })); return 'search'; } return null; });
    if (picked === 'search') { await P.page.waitForTimeout(150); await P.page.evaluate(() => { const el = document.querySelector('#pickList .pick[data-ex="hammer"]'); if (el) el.click(); }); }
    await P.page.waitForTimeout(200);
    const after = await P.page.evaluate(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; const wf = document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="0"]'); const x = L.suggest('hammer', b.plan, {}); return { id: b.exId, sw: b.sw, w: wf && (wf.value || wf.placeholder), want: x.w, kin: x.kin, plan: [b.plan.repMin, b.plan.repMax, b.plan.rir], text: document.querySelector('#view').innerText.includes('from your DB Curl') }; });
    ok(after.id === 'hammer' && after.kin === 'dbCurl' && after.want > 0 && Math.abs(after.sw - after.want) < 1e-9 && +after.w === after.want && after.text, 'swapped to hammer curls in a session: the grey load is the start from the DB curl for the plan it got (' + after.want + ' kg for ' + after.plan.slice(0, 2).join('-') + '), and the line names the DB curl', after);
    // Once a hammer curl session is logged, it goes by its own history.
    const own = await P.page.evaluate(([mkS]) => { const mk = eval(mkS); const L = window.__ironlog; L.state.draft = null; L.state.sessions.push(mk('h', '2026-10-04', 'hammer', [[14, 12, 1], [14, 12, 1], [14, 11, 1]], [8, 12])); L.invalidate(); const x = L.suggest('hammer', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 }, {}); return { kin: x.kin || null, t: x.text }; }, [mk.toString()]);
    ok(!own.kin && !/DB Curl/.test(own.t), 'after its first session the hammer curl reads its own history', own);
    ok(!P.errors.length, 'part 2 ran with no page errors', P.errors);
    await P.ctx.close();
  }

  await browser.close();
  if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
  console.log('\nALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
