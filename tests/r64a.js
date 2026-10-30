// r64a: the training rules the r63 audit found wrong (PENDING.md's tracker,
// R-1 to R-5 and P-S2-1 to P-S2-3), each written as the answer a
// knowledgeable lifter expects, worked out here by hand from the app's own
// estimate (Brzycki up to 10 reps to failure, Epley past it; docs/EVIDENCE.md),
// before the fix. Each case fails on r63 (`node tests/r64a.js
// baselines/r63.html`; R64A_ONLY=R-1,R-3 runs some of them):
//   R-1    sets missed at the load already held never step it up, and the
//          words stay true: bench 185 x 10 x 3, then 185 x 10, 0, 0 holds 185
//          (r63: 190, "Every set at 185 lb hit 10");
//   R-2    a log kept in kg shown in lb never asks more than the caps allow,
//          and a lighter day, a deload or a return never more than last time:
//          the grid is counted from the bar where one applies;
//   R-3    back after a break, V's decision 1 (2026-10-27): until a lift is
//          back at its load from before the break, each full session's next
//          load is what its own estimate gives for the lift's usual reps and
//          reserve, never below the current load and never past the load from
//          before; the first set back moves the next sets when its estimate
//          says so, a blank effort there read as 2 in reserve;
//   R-4    the first-sessions cap of 25% is for a lift's first sessions since
//          its last break or New machine or gym, not the first in a new range;
//   R-5    the Guide says what the rules now do, and its break sentence claims
//          no figure Bosquet 2013 does not give;
//   P-S2-1 an injury flag keeps the break, Lighter day and deload rules, the
//          lower of the two loads;
//   P-S2-2 a lift is never called stalled across a break;
//   P-S2-3 bodyweight typed as added load is asked about (V's decision 2):
//          added load of 90% or more of bodyweight, or more than twice the
//          most added before.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R64A_ONLY ? process.env.R64A_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(n);
const LB = 0.45359237;
const EPS = 1e-6;
const lb = kg => (kg == null ? null : Math.round((kg / LB) * 100) / 100);
const add = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
// A lift's session: sets as [load, reps, RIR] in the unit given (lb unless 'kg'), a blank RIR as null.
const ses = (id, date, exId, rr, sets, unit, x) => Object.assign({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId, rr, sets: sets.map(([w, r, rir]) => ({ w: unit === 'kg' ? w : w * LB, r, rir: rir === undefined ? null : rir, warm: false, drop: false })) }] }, x || {});
const TODAY = '2026-10-26';

(async () => {
  const P = await open(FILE, { clock: TODAY + 'T10:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
  /* The log replaced whole (in pounds unless o.unit says), read afresh, and
     the suggestion for a lift on a plan, as the session would ask it. */
  const log = (sessions, o) => ev(([sessions, o]) => {
    const L = window.__ironlog; const S = L.state;
    S.settings.onboarded = true; S.settings.unit = o.unit || 'lb'; S.settings.autoDone = false;
    delete S.settings.gym; delete S.settings.barKg;
    S.injuries = o.inj || []; S.draft = null; S.deloadWeek = null; S.bodyweights = o.bw || [];
    if (o.routine) { S.routines = [o.routine]; S.activeRoutineId = o.routine.id; }
    S.sessions = sessions; L.state = L.normalize(S); L.invalidate(); L.saveNow();
  }, [sessions, o || {}]);
  const suggest = (exId, plan, opts) => ev(([exId, plan, opts]) => { const r = window.__ironlog.suggest(exId, plan, opts || {}); return { w: r.w, text: r.text, inj: r.inj || null }; }, [exId, plan, opts || null]);

  // ---- R-1: 185 x 10 x 3, then 185 x 10, 0, 0 (two sets tried and missed at the working load).
  if (run('R-1')) {
    const plan = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB };
    await log([ses('a', '2026-10-19', 'bench', [6, 10], [[185, 10, 1], [185, 10, 1], [185, 10, 1]]), ses('b', '2026-10-22', 'bench', [6, 10], [[185, 10, 1], [185, 0, null], [185, 0, null]])]);
    const s = await suggest('bench', plan);
    // Expected by hand: the missed sets are two of the session's three sets, each short of the range, so the load holds at 185 and the target is the reps done, 10 + 0 + 0, to beat.
    ok(Math.abs(lb(s.w) - 185) < EPS && !/Every set at 185 lb hit 10/.test(s.text) && /Beat 10 reps over 3 sets at 185 lb/.test(s.text), 'R-1. 185 x 10, then 185 x 10, 0, 0: the next target holds 185 lb, "Beat 10 reps over 3 sets at 185 lb", never "Every set at 185 lb hit 10" (r63: 190, the words false)', { lb: lb(s.w), text: s.text });
    ok(/^Last \(Oct 22\): 185×10, 185×0 missed, 185×0 missed\./.test(s.text), 'R-1. its Last line lists the two missed sets, and calls it no session of fewer sets: three sets were tried', s.text);
    // One set missed of three: the same, the load held.
    await log([ses('a', '2026-10-19', 'bench', [6, 10], [[185, 10, 1], [185, 10, 1], [185, 10, 1]]), ses('b', '2026-10-22', 'bench', [6, 10], [[185, 10, 1], [185, 10, 1], [185, 0, null]])]);
    const one = await suggest('bench', plan);
    ok(Math.abs(lb(one.w) - 185) < EPS && /Beat 20 reps over 3 sets at 185 lb/.test(one.text), 'R-1. 185 x 10, 10, 0: holds 185, "Beat 20 reps over 3 sets" (r63: 190)', { lb: lb(one.w), text: one.text });
  }

  // ---- R-2: a log kept in kg, shown in lb.
  if (run('R-2')) {
    const p812 = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 120, inc: 10 * LB };
    const twice = (exId, rr, kg, r, back) => (back ? ['2026-09-07', '2026-09-14'] : ['2026-10-12', '2026-10-19']).map((d, i) => ses('k' + i, d, exId, rr, [[kg, r, 1], [kg, r, 1], [kg, r, 1]], 'kg'));
    // 20 kg bench (44.1 lb) x 9 x 3, the plan's step 10 lb: the bar (45 lb) plus 10 lb steps makes 45, 55, ...; the nearest to 44.1 is 45.
    await log(twice('bench', [8, 12], 20, 9));
    const n = await suggest('bench', p812);
    ok(Math.abs(lb(n.w) - 45) < EPS && /45 lb is the nearest load in lb/.test(n.text), 'R-2. 20 kg bench (44.1 lb) x 9 on 10 lb steps: 45 lb, the nearest load in lb (r63: 50, "the nearest")', { lb: lb(n.w), text: n.text });
    // Lighter day, deload and a return after six weeks: never more than last time's load, and never under the bar (CLAUDE.md,
    // Numbers; tests/r54.js): 20 kg is under the 45 lb bar shown in lb, so the bar, 45, never 50.
    for (const [name, opts, back] of [['a Lighter day', { light: true }], ['a deload', { deload: true }], ['back after 6 weeks', {}, true]]) {
      await log(twice('bench', [8, 12], 20, 9, back));
      const x = await suggest('bench', p812, opts);
      ok(Math.abs(lb(x.w) - 45) < EPS, `R-2. 20 kg bench, ${name}: the 45 lb bar, never under it and never 50 (r63: 50)`, { lb: lb(x.w), text: x.text });
    }
    // 57.5 kg (126.8 lb) on its own 10 lb step, every set at the top: one step is 136.8; the bar's grid has 135 and 145; 135 is the nearest and within the 10% cap (126.8 x 1.1 = 139.4).
    const p610 = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 10 * LB };
    await log(twice('bench', [6, 10], 57.5, 10));
    const top = await suggest('bench', p610);
    ok(Math.abs(lb(top.w) - 135) < EPS, 'R-2. 57.5 kg bench (126.8 lb) x 10 x 3 on 10 lb steps: 135 lb, within 10% (r63: 140, +10.4%)', { lb: lb(top.w), text: top.text });
    // A 44 kg kettlebell (97.0 lb) at the top of 8-12 on 10 lb steps: one step is 107.0, past the cap of 106.7 (97.0 x 1.1).
    // Since NEW-6 (V, 2026-10-27) the whole step stays and is large for the load, so the reps build at 97 first, shown on
    // the grid in lb as 100, the nearest load to what was done; never 110 in one session (r63).
    await log(twice('kbSwing', [8, 12], 44, 12));
    const kb = await suggest('kbSwing', p812);
    ok(Math.abs(lb(kb.w) - 100) < EPS && /100 lb is the nearest load in lb/.test(kb.text), 'R-2. 44 kg kettlebell (97 lb) x 12 x 3 on 10 lb steps: 100 lb, the nearest load in lb, within 10% (r63: 110, +13.4%)', { lb: lb(kb.w), text: kb.text });
  }

  // ---- R-3: back after six weeks off, V's decision 1.
  if (run('R-3')) {
    const T0 = '2026-10-12';
    const plan = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB };
    const R = { id: 'Rb', name: 'Chest', schedule: 'weekly', days: [{ id: 'Db', name: 'Chest', items: [{ uid: 'u1', exId: 'bench', ...plan, ss: null }] }] };
    // 185 x 8, 8, 7 at 1 in reserve on 6-10, the last six weeks before T0 (personas 3's log).
    const pre = [ses('b1', add(T0, -56), 'bench', [6, 10], [[185, 8, 1], [185, 7, 1], [185, 7, 1]]), ses('b2', add(T0, -49), 'bench', [6, 10], [[185, 8, 1], [185, 8, 1], [185, 7, 1]]), ses('b3', add(T0, -42), 'bench', [6, 10], [[185, 8, 1], [185, 8, 1], [185, 7, 1]])];
    const three = (id, date, w, r, rir) => ses(id, date, 'bench', [6, 10], [[w, r, rir], [w, r, rir], [w, r, rir]]);
    /* The full-strength lifter (V's worked expectation): the return 165 x 10 x 3 rated 2 (as asked, 2 or more in reserve), then
       175 x 9 x 3 at 1, then 180 x 9 x 3 at 1. By hand, the usual reps are the middle of 8, 8, 7 (8) at the plan's 1 in reserve, 9 reps to failure:
         165 x 10 at 2: 12 to failure, Epley 165 x (1 + 12/30) = 231.0; for 9 to failure, Brzycki 231.0 x (37 - 9)/36 = 179.67; in 5 lb steps from 165 not past it: 175.
         175 x 9 at 1: 10 to failure, Brzycki 175 x 36/(37 - 10) = 233.33; x 28/36 = 181.48: 180.
         180 x 9 at 1: 10 to failure, 180 x 36/27 = 240.0; x 28/36 = 186.67, past the 185 before the break: 185.
       Then at 185, normal progression: 185 x 8 x 3 at 1 inside 6-10 asks 185, beat 24 reps. */
    const seq = [['r0', add(T0, 0), 165, 10, 2, 175], ['r1', add(T0, 3), 175, 9, 1, 180], ['r2', add(T0, 7), 180, 9, 1, 185]];
    const got = [];
    let done = pre.slice();
    await log(done, { routine: R });
    got.push(await suggest('bench', plan, { before: T0 }));
    for (const [id, date, w, r, rir] of seq) { done = [...done, three(id, date, w, r, rir)]; await log(done, { routine: R }); got.push(await suggest('bench', plan)); }
    const want = [165, 175, 180, 185];
    ok(got.every((g, i) => Math.abs(lb(g.w) - want[i]) < EPS), 'R-3. the full-strength lifter back after six weeks: 165, then 175, 180 and 185 in the three sessions after the return (decision 1; r63: 165, 175, 175, 180)', got.map(g => [lb(g.w), g.text]));
    done = [...done, three('r3', add(T0, 10), 185, 8, 1)]; await log(done, { routine: R });
    const at = await suggest('bench', plan);
    ok(Math.abs(lb(at.w) - 185) < EPS && /Beat 24 reps over 3 sets at 185 lb/.test(at.text), 'R-3. back at 185, normal progression: 185 x 8 x 3 asks 185, beat 24 reps', { lb: lb(at.w), text: at.text });
    // The same return left unrated reads as 2 in reserve, what the return asked: 175 again.
    await log([...pre, three('r0', T0, 165, 10, null)], { routine: R });
    const un = await suggest('bench', plan);
    ok(Math.abs(lb(un.w) - 175) < EPS, 'R-3. the return 165 x 10 x 3 unrated reads as 2 in reserve: 175 next', { lb: lb(un.w), text: un.text });
    /* The return done at the bottom of the range, then honest sets (the audit's case): 165 x 6 x 3 unrated reads 2 in reserve, 8 to failure,
       165 x 36/29 = 204.83; for 9 to failure 204.83 x 28/36 = 159.31, under 165, so 165 again (never below the current load).
       Then 165 x 10 x 3 at 3 (full strength leaves 3.25 at 10): 13 to failure, Epley 165 x (1 + 13/30) = 236.5; x 28/36 = 183.94: 180.
       Then 180 x 8 x 3 at 2 (full strength leaves 1.76 at 8, rated to the nearest rep): 10 to failure, 240.0; x 28/36 = 186.67: 185. */
    const aud = [['a0', add(T0, 0), 165, 6, null, 165], ['a1', add(T0, 3), 165, 10, 3, 180], ['a2', add(T0, 7), 180, 8, 2, 185]];
    const ag = [];
    done = pre.slice();
    for (const [id, date, w, r, rir] of aud) { done = [...done, three(id, date, w, r, rir)]; await log(done, { routine: R }); ag.push(await suggest('bench', plan)); }
    ok(ag.every((g, i) => Math.abs(lb(g.w) - aud[i][5]) < EPS), 'R-3. 165 x 6 x 3 as asked, then honest sets at full strength: 165, 180, 185, back at the load from before the break (r63: 165, 180, 180)', ag.map(g => [lb(g.w), g.text]));
    // Never past the load from before the break, never below the current load: 165 x 10 x 3 at 4 (a 14 to failure estimate of 242) asks 185, not more.
    await log([...pre, three('r0', T0, 165, 10, 4)], { routine: R });
    const far = await suggest('bench', plan);
    ok(Math.abs(lb(far.w) - 185) < EPS, 'R-3. a return far stronger than asked: 185, the load from before the break, not past it', { lb: lb(far.w), text: far.text });

    // The first set back, ticked on the session screen as the app ticks it: V's own 165 x 10 at 2, and the same unrated.
    const firstSet = (r, rir) => ev(([r, rir]) => {
      const L = window.__ironlog;
      L.ACT.startSession({ dataset: { day: '0' } });
      const d = L.state.draft; const b = d.ex[0];
      const w0 = b.sets[0].w != null ? b.sets[0].w : L.greyW(b, 0);
      b.sets[0].w = w0; b.sets[0].r = r; b.sets[0].rir = rir;
      L.ACT.sDone({ dataset: { b: '0', s: '0' } });
      if (L.ui.modal) L.ACT.mClose();
      const b2 = L.state.draft.ex[0];
      const out = { w0: w0 / 0.45359237, adj: b2.adj ? { w: Math.round(b2.adj.w / 0.45359237 * 100) / 100, r: b2.adj.r, up: b2.adj.up, why: b2.adj.why } : null, grey: L.greyW(b2, 1) / 0.45359237 };
      L.state.draft = null; L.saveNow();
      return out;
    }, [r, rir]);
    // The page's clock is TODAY, so the break is read from the sessions six weeks before it.
    const preNow = [ses('b1', add(TODAY, -56), 'bench', [6, 10], [[185, 8, 1], [185, 7, 1], [185, 7, 1]]), ses('b2', add(TODAY, -49), 'bench', [6, 10], [[185, 8, 1], [185, 8, 1], [185, 7, 1]]), ses('b3', add(TODAY, -42), 'bench', [6, 10], [[185, 8, 1], [185, 8, 1], [185, 7, 1]])];
    /* By hand: 165 x 10 at 2 is 12 to failure, Epley 231.0; the return's aim, the bottom of the range with 2 in reserve, is 8 to failure:
       231.0 x 29/36 = 186.08, past 185, so 185; at 185 the estimate leaves 37 - 36 x 185/231.0 = 8.17 to failure, less 2 in reserve: 6 reps. */
    for (const [rir, name] of [[2, 'rated 2'], [null, 'unrated']]) {
      await log(preNow, { routine: R });
      const x = await firstSet(10, rir);
      ok(Math.abs(x.w0 - 165) < EPS && x.adj && x.adj.up && Math.abs(x.adj.w - 185) < EPS && x.adj.r === 6, `R-3. the first set back, 165 x 10 ${name}: the next sets go to 185 x 6 (r63: they stay at 165)`, x);
    }
    // A first set back at the bottom of the range with 2 in reserve, as asked, says nothing more: 8 to failure, 204.83, 165 for 8 to failure. The next sets stay.
    await log(preNow, { routine: R });
    const low = await firstSet(6, 2);
    ok(low.adj == null && Math.abs(low.grey - 165) < EPS, 'R-3. the first set back, 165 x 6 at 2 as asked: the next sets stay at 165 (a guard)', low);
  }

  // ---- R-4: eleven sessions of bench, then its rep range changed.
  if (run('R-4')) {
    const list = [];
    for (let i = 0; i < 10; i++) list.push(ses('w' + i, add('2026-08-10', 7 * i), 'bench', [8, 12], [[200, 10, 2], [200, 10, 2], [200, 10, 2]]));
    list.push(ses('n0', '2026-10-19', 'bench', [4, 6], [[200, 10, 2], [200, 10, 2], [200, 10, 2]]));
    await log(list);
    const s = await suggest('bench', { sets: 3, repMin: 4, repMax: 6, rir: 1, rest: 180, inc: 5 * LB });
    // Every set 2 or more past the top of 4-6: the estimate (200 x 10 at 2, 12 to failure, Epley 280) gives 241 for 6 to failure, capped at 10%: 200 x 1.1 = 220.
    ok(Math.abs(lb(s.w) - 220) < EPS, 'R-4. a lift with 11 sessions, its range changed: at most 10% up, 220 lb (r63: 240, the first-sessions 25%)', { lb: lb(s.w), text: s.text });
    // A guard: a lift's first sessions since a break still find their load at up to 25%.
    await log([ses('e0', '2026-10-19', 'bench', [4, 6], [[200, 10, 2], [200, 10, 2], [200, 10, 2]])]);
    const e = await suggest('bench', { sets: 3, repMin: 4, repMax: 6, rir: 1, rest: 180, inc: 5 * LB });
    ok(Math.abs(lb(e.w) - 240) < EPS, 'R-4. a lift\'s first session: up to 25%, 240 lb (a guard)', { lb: lb(e.w), text: e.text });
  }

  // ---- R-5: the Guide.
  if (run('R-5')) {
    const g = await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; L.render(); L.openModal({ kind: 'guide', open: '' }); const m = document.getElementById('modal'); m.querySelectorAll('details').forEach(d => { d.open = true; }); const t = m.innerText; L.ACT.mClose(); return t; });
    ok(!/strength holds for about 4 weeks/.test(g) && /The 4 weeks is the app's convention for where a break begins: strength falls the longer a lift is left \(Bosquet 2013\)/.test(g), 'R-5. the Guide\'s break sentence: the 4 weeks is the app\'s convention, strength falling the longer a lift is left (Bosquet 2013), no figure the study does not give', (g.match(/Back after more than[^\n]*/) || [''])[0]);
    ok(/at most 10% up past the loads you have done since a break/.test(g), 'R-5. the next sets: at most 10% up past the loads done since a break, as the rule is (r63: "at most 10% up", while a set after a break goes 165 to 185)', (g.match(/The next sets adjust[^\n]*/) || [''])[0]);
    ok(/Until the lift is back at its load from before the break, each full session sets the next load: what its sets say fits your usual reps, never lower than the load you did and never past that load \(a convention\)/.test(g), 'R-5. the Guide states decision 1\'s way back', (g.match(/Back after more than[^\n]*/) || [''])[0]);
  }

  // ---- P-S2-1: an injury flag and the break, Lighter day and deload rules.
  if (run('P-S2-1')) {
    const plan = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB };
    const inj = [{ id: 'i1', m: 'chest', note: '', date: '2026-10-01' }];
    const at = (w, dates) => dates.map((d, i) => ses('j' + i, d, 'bench', [6, 10], [[w, 8, 1], [w, 8, 1], [w, 8, 1]]));
    // Six weeks off at 195: the return is 90% (175.5), in 5 lb steps down from 195: 175. Flagged, the lower of 175 and the injury's 195.
    await log(at(195, ['2026-08-31', '2026-09-07', '2026-09-14']), { inj });
    const b = await suggest('bench', plan);
    ok(Math.abs(lb(b.w) - 175) < EPS && b.inj === 'chest', 'P-S2-1. a flagged bench six weeks off: 175 lb, the return\'s load, the injury kept (r63: 195)', { lb: lb(b.w), text: b.text, inj: b.inj });
    // A Lighter day and a deload at 205: 90% is 184.5, in 5 lb steps down from 205: 180, flagged or not.
    for (const [name, opts] of [['a Lighter day', { light: true }], ['a deload', { deload: true }]]) {
      await log(at(205, ['2026-10-12', '2026-10-19']), { inj });
      const x = await suggest('bench', plan, opts);
      await log(at(205, ['2026-10-12', '2026-10-19']));
      const y = await suggest('bench', plan, opts);
      ok(Math.abs(lb(x.w) - 180) < EPS && Math.abs(lb(y.w) - 180) < EPS && x.inj === 'chest', `P-S2-1. ${name} at 205: a flagged bench 180 lb, as an unflagged one (r63: 205 flagged)`, { flagged: [lb(x.w), x.text], plain: [lb(y.w), y.text] });
    }
  }

  // ---- P-S2-2: a pull-up last done 39 days ago, flat for six sessions before.
  if (run('P-S2-2')) {
    const list = [];
    for (let i = 0; i < 7; i++) list.push(ses('p' + i, add('2026-08-06', 7 * i), 'pullup', [6, 10], [[0, 8, 1], [0, 8, 1], [0, 8, 1]]));
    for (let i = 0; i < 4; i++) list.push(ses('q' + i, add('2026-10-05', 5 * i), 'bench', [6, 10], [[135 + 5 * i, 8, 1], [135 + 5 * i, 8, 1], [135 + 5 * i, 8, 1]]));
    await log(list, { bw: [{ id: 'w1', date: '2026-08-01', kg: 80 }] });
    const r = await ev(() => { const L = window.__ironlog; const st = L.IDX().exStats.pullup || {}; return { stalled: L.stalledIds(), stall: !!st.stalled, coach: L.coach().text }; });
    ok(!r.stalled.includes('pullup') && !r.stall && !/Pull-up has stalled/.test(r.coach), 'P-S2-2. a pull-up last done Sep 17, today Oct 26 (39 days, a break): not stalled, on Stats or by the coach (r63: stalled)', r);
    // A guard: the same pull-ups up to 3 weeks ago are stalled.
    const near = list.filter(x => x.ex[0].exId === 'pullup').map(x => Object.assign({}, x, { date: add(x.date, 18) }));
    await log([...near, ...list.filter(x => x.ex[0].exId !== 'pullup')], { bw: [{ id: 'w1', date: '2026-08-01', kg: 80 }] });
    const g = await ev(() => window.__ironlog.stalledIds());
    ok(g.includes('pullup'), 'P-S2-2. the same pull-ups up to 21 days ago: stalled (a guard)', g);
  }

  // ---- P-S2-3: bodyweight typed as added load, ticked on the session screen.
  if (run('P-S2-3')) {
    const plan = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB };
    const R = { id: 'Rp', name: 'Back', schedule: 'weekly', days: [{ id: 'Dp', name: 'Back', items: [{ uid: 'u1', exId: 'pullup', ...plan, ss: null }] }] };
    const bw = [{ id: 'w1', date: '2026-10-01', kg: 180 * LB }];
    const tick = (wLb, r) => ev(([wLb, r]) => {
      const L = window.__ironlog;
      L.ACT.startSession({ dataset: { day: '0' } });
      const b = L.state.draft.ex[0];
      b.sets[0].w = wLb * 0.45359237; b.sets[0].r = r; b.sets[0].rir = 1;
      L.ACT.sDone({ dataset: { b: '0', s: '0' } });
      const m = L.ui.modal; const out = { asked: !!(m && m.kind === 'confirm'), body: m && m.kind === 'confirm' ? m.body : null, done: !!L.state.draft.ex[0].sets[0].done };
      if (m) L.ACT.mClose();
      L.state.draft = null; L.saveNow();
      return out;
    }, [wLb, r]);
    const plain = ['2026-10-12', '2026-10-19'].map((d, i) => ses('p' + i, d, 'pullup', [6, 10], [[0, 8, 1], [0, 8, 1], [0, 8, 1]]));
    // Bodyweight 180 lb, pull-ups at bodyweight only: BW+180 is 100% of bodyweight, at least 90%: asked.
    await log(plain, { routine: R, bw });
    const a = await tick(180, 8);
    ok(a.asked && !a.done && /90% or more of your bodyweight/.test(a.body || ''), 'P-S2-3. pull-ups at 180 lb bodyweight, BW+180 typed: asked, Log it or Fix it, before it is saved (r63: saved, a PR)', a);
    await log(plain, { routine: R, bw });
    const b162 = await tick(162, 8);
    ok(b162.asked, 'P-S2-3. BW+162, exactly 90% of 180: asked', b162);
    await log(plain, { routine: R, bw });
    const b160 = await tick(160, 8);
    ok(!b160.asked && b160.done, 'P-S2-3. BW+160 with no load added before (89%): logged at once (a guard)', b160);
    // The most added before 10 lb: BW+20 is twice it, logged; BW+25 is more than twice: asked.
    const loaded = ['2026-10-12', '2026-10-19'].map((d, i) => ses('l' + i, d, 'pullup', [6, 10], [[10, 8, 1], [10, 8, 1], [10, 8, 1]]));
    await log(loaded, { routine: R, bw });
    const b20 = await tick(20, 8);
    await log(loaded, { routine: R, bw });
    const b25 = await tick(25, 8);
    ok(!b20.asked && b20.done && b25.asked && /more than twice the most you have added/.test(b25.body || ''), 'P-S2-3. the most added before 10 lb: BW+20 logged, BW+25 asked', { b20, b25 });
  }

  if (P.errors.length) ok(false, 'no page errors', P.errors);
  await P.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
