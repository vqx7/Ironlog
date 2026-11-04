// r70 (PENDING.md's tracker, rows NEW-51 and 379 to 384, 364 b-1, 364 b-2, 172 b and AUD-70), each written as
// what a lifter expects and run first on r69 (`node tests/r70.js baselines/r69.html`), where each section fails:
//   1  NEW-51: two blank sessions of one set in a row never turn a lift the routine plans at 3 sets into a
//      1-set lift; in Freestyle and for a lift on no day of the routine the lifter's own sets still lead (V's
//      rule of 2026-10-18), a plan of one set progresses, and one set on the routine's day reads fewer sets.
// R70_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R70_ONLY ? process.env.R70_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const LB = 0.45359237;
const lb = kg => Math.round((kg / LB) * 10) / 10;
const add = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const TODAY = '2026-11-03';
// A session of one lift: sets as [load lb, reps, RIR]; on the routine's day (with the plan's sets recorded, ps) or blank.
const ses = (id, date, exId, sets, o = {}) => Object.assign({ id, date, dayIdx: 0, dayId: o.day ? 'Db' : null, dayName: o.day ? 'Chest' : 'Session', routineId: o.day ? 'Rb' : '', free: !o.day, notes: '', ex: [{ exId, rr: [6, 10], sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir, warm: false, drop: false })), ...(o.ps ? { ps: o.ps } : {}) }] }, o.x || {});
const plan = n => ({ sets: n, repMin: 6, repMax: 10, rir: 2, rest: 150 });
const routine = n => ({ id: 'Rb', name: 'Chest', schedule: 'weekly', days: [{ id: 'Db', name: 'Chest', wd: [2], items: [{ uid: 'u1', exId: 'bench', ...plan(n), ss: null }] }] });

(async () => {
  const P = await open(FILE, { clock: TODAY + 'T10:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
  // The log replaced whole, read afresh; o.routine null for a lifter with no routine.
  const log = (sessions, o = {}) => ev(([sessions, R, free]) => {
    const L = window.__ironlog; const S = L.state;
    S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false; S.settings.todayStart = free ? 'free' : 'plan';
    S.injuries = []; S.draft = null; S.deloadWeek = null; S.bodyweights = [];
    S.routines = [R]; S.activeRoutineId = R.id;
    S.sessions = sessions; L.state = L.normalize(S); L.invalidate(); L.saveNow();
  }, [sessions, o.routine || routine(3), !!o.free]);
  // Each of bench's sessions as read (its sets and whether it was short), and the next target.
  const read = n => ev(pl => {
    const L = window.__ironlog; const xs = L.IDX().byEx.bench || [];
    const g = L.suggest('bench', pl, {});
    return { short: xs.map(x => x.short || 'full'), w: g.w, text: g.text };
  }, plan(n));
  const D = i => add('2026-10-06', i * 7);
  const three = (i, w) => ses('s' + i, D(i), 'bench', [[w, 8, 2], [w, 8, 2], [w, 8, 2]], { day: 1, ps: 3 });
  const base = [three(0, 205), three(1, 215), three(2, 225)];

  if (run(1)) {
    // Bench planned at 3 sets: three sessions of 3 on the routine's day, then 225 x 8 alone in two blank sessions.
    await log([...base, ses('b1', D(3), 'bench', [[225, 8, 2]]), ses('b2', add(D(3), 3), 'bench', [[225, 8, 2]])]);
    const a = await read(3);
    ok(a.short[3] === 'sets' && a.short[4] === 'sets', '1. NEW-51: two blank one-set sessions of a lift planned at 3 sets both read fewer sets (r69: the second read full)', a.short);
    ok(Math.abs(lb(a.w) - 225) < 0.01 && /over 3 sets at 225 lb/.test(a.text) && !/in one set/.test(a.text), '1. NEW-51: the next target keeps the plan\'s 3 sets at 225 lb, never "Beat 8 reps in one set" (r69)', { lb: lb(a.w), text: a.text });
    // The same two sessions on the routine's day (339 h, r58): fewer sets, as before.
    await log([...base, ses('d1', D(3), 'bench', [[225, 8, 2]], { day: 1, ps: 3 }), ses('d2', add(D(3), 3), 'bench', [[225, 8, 2]], { day: 1, ps: 3 })]);
    const b = await read(3);
    ok(b.short[3] === 'sets' && b.short[4] === 'sets' && /over 3 sets at 225 lb/.test(b.text), '1. two one-set sessions on the routine\'s day read fewer sets, as since r58 (a guard)', b);
    // Freestyle (Today opens blank, the routine not followed): the second one-set session in a row is the usual (V, 2026-10-18).
    const fr = [0, 1, 2].map(i => ses('f' + i, D(i), 'bench', [[205 + 10 * i, 8, 2], [205 + 10 * i, 8, 2], [205 + 10 * i, 8, 2]]));
    await log([...fr, ses('f3', D(3), 'bench', [[225, 8, 2]]), ses('f4', add(D(3), 3), 'bench', [[225, 8, 2]])], { free: true });
    const c = await read(3);
    ok(c.short[3] === 'sets' && c.short[4] === 'full', '1. in Freestyle, the second one-set session in a row is the usual, as V\'s rule says (a guard)', c.short);
    // A lift on no day of the routine: the same.
    const other = { id: 'Rb', name: 'Legs', schedule: 'weekly', days: [{ id: 'Db', name: 'Legs', wd: [2], items: [{ uid: 'u1', exId: 'squat', ...plan(3), ss: null }] }] };
    await log([...fr, ses('f3', D(3), 'bench', [[225, 8, 2]]), ses('f4', add(D(3), 3), 'bench', [[225, 8, 2]])], { routine: other });
    const c2 = await read(3);
    ok(c2.short[3] === 'sets' && c2.short[4] === 'full', '1. a lift on no day of the routine: the second one-set session in a row is the usual (a guard)', c2.short);
    // A plan of one hard set, by design: each session full, the target in one set.
    await log([0, 1, 2].map(i => ses('o' + i, D(i), 'bench', [[205 + 10 * i, 8, 2]], { day: 1, ps: 1 })), { routine: routine(1) });
    const d = await read(1);
    ok(d.short.every(s => s === 'full') && /in one set at 225 lb/.test(d.text), '1. a plan of one set: every session full, the target in one set (a guard)', d);
    // One heavy set on a blank day after full sessions: a Weight PR, read fewer sets, the target from the last full session.
    await log([...base, ses('p1', D(3), 'bench', [[255, 4, 0]])]);
    const e = await ev(() => { const L = window.__ironlog; const I = L.IDX(); return { prs: I.prs.filter(p => p.exId === 'bench' && p.sid === 'p1').map(p => p.type), short: (I.byEx.bench || []).map(x => x.short || 'full') }; });
    const et = await read(3);
    ok(e.prs.includes('Weight PR') && e.short[3] === 'sets' && /over 3 sets at 225 lb/.test(et.text), '1. one PR attempt on a blank day: a Weight PR, fewer sets, the target kept at 225 lb for 3 sets (a guard)', { e, text: et.text });
  }

  await P.page.close();
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
