// r56.2: the audit before the screens are rebuilt (PENDING 333 step 3, 338),
// each wrong number as its reproduction showed it on the page. Each case fails
// on r56.1 (`node tests/r56-2.js baselines/r56-1.html`) and on r55, unless it
// says it guards:
//   A  sets tried and missed at the working load are sets short of the range
//      for the next target: a 5 x 5 with sets 4 and 5 missed twice repeats
//      its load, and a 4-set plan with two missed twice still reads 4 sets;
//   2  a lift done in full on a Lighter day is read against the same usual as
//      any other day, so it sets its target (untagged: a guard);
//   1  one best estimate everywhere it is named (Stats' Best estimate, the
//      exercise sheet, All-time bests), also after a change of units, and a
//      history row says PR only for a PR that Recent PRs lists;
//   D  the coach says when the lifter made fewer sessions than the plan has,
//      before it says to do every planned set;
//   C  dumbbells at a new gym step on that gym's rack, read from the newest
//      sessions, not on a spacing neither rack has.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || 'index.html';
const LB = 0.45359237;
const add = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const ses = (id, date, exId, rr, sets, x, bx) => Object.assign({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [Object.assign({ exId, rr, sets: sets.map(([w, r, rir]) => ({ w, r, rir: rir === undefined ? 1 : rir, warm: false, drop: false })) }, bx || {})] }, x || {});

(async () => {
  const P = await open(FILE, { clock: '2026-09-14T10:00:00', realStarter: true });
  const { page } = P; const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg'; L.saveNow(); localStorage.setItem('ironlog.v1.tipWake', '1'); L.render(); });
  // The log replaced whole, with the routine given (or the starter kept), read afresh.
  const log = (sessions, routine) => ev(([sessions, routine]) => { const L = window.__ironlog; const s = L.state; s.sessions = sessions; s.draft = null; s.deloadWeek = null; s.injuries = []; if (routine) { s.routines = [routine]; s.activeRoutineId = routine.id; } L.state = L.normalize(s); L.invalidate(); L.saveNow(); L.render(); }, [sessions, routine || null]);
  const suggest = (exId, plan) => ev(([exId, plan]) => { const r = window.__ironlog.suggest(exId, plan); return { w: r.w, text: r.text, target: r.target }; }, [exId, plan]);

  // ---- D: the starter Upper / lower (4 sessions a week) done in full on the days made, two a week for six weeks, its minimums fitted as a first-run pick fits them.
  {
    const out = await ev(() => {
      const L = window.__ironlog; const s = L.state; const R = s.routines.find(r => r.id === s.activeRoutineId) || s.routines[0]; s.activeRoutineId = R.id;
      const days = R.days.filter(d => !d.rest); const plus = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
      const out = []; let k = 0;
      for (let w = 0; w < 6; w++) for (const o of [0, 3]) { const d = days[k++ % days.length]; const date = plus('2026-08-03', 7 * w + o);
        out.push({ id: 's' + date, date, dayIdx: R.days.indexOf(d), dayId: d.id, dayName: d.name, routineId: R.id, free: false, notes: '', ex: d.items.map(it => ({ exId: it.exId, rr: [it.repMin, it.repMax], sets: Array.from({ length: it.sets }, () => ({ w: 40 + 2.5 * w, r: it.repMin + 1, rir: 2, warm: false, drop: false })) })) }); }
      s.sessions = out; Object.assign(s.settings.bands, { traps: [1, 16], forearms: [1, 12], obliques: [0, 10], abductors: [0, 12] });
      L.state = L.normalize(s); L.invalidate(); L.saveNow(); const c = L.coach(); return { text: c.text, why: c.why, planned: L.plannedPerWeek ? L.plannedPerWeek(R) : null };
    });
    ok(/^You made 2 of 4 planned sessions a week\./.test(out.text) && !/do every planned set/.test(out.text), 'two of the four planned sessions made each week: the coach says so, not "do every planned set" (r56.1 and r55: "Your plan has 10: do every planned set")', out);
  }

  // ---- A: sets tried and missed. A 5 x 5 at 100, then 102.5 with sets 4 and 5 missed, once and twice running.
  {
    const R = { id: 'r5', name: '5 x 5', schedule: 'cycle', days: [{ id: 'd1', name: 'Strength A', rest: false, items: [{ uid: 'u1', exId: 'backSquat', sets: 5, repMin: 5, repMax: 5, rir: 2, rest: 180, inc: 2.5 }] }] };
    const plan = { sets: 5, repMin: 5, repMax: 5, rir: 2, rest: 180, inc: 2.5 };
    const mk = (d, w, rs) => ({ id: 'q' + d, date: d, dayIdx: 0, dayId: 'd1', dayName: 'Strength A', routineId: 'r5', free: false, notes: '', ex: [{ exId: 'backSquat', rr: [5, 5], sets: rs.map(r => ({ w, r, rir: null, warm: false, drop: false })), ps: 5 }] }); // ps: the plan's five, as Finish saves it since r58
    const base = [mk('2026-09-01', 100, [5, 5, 5, 5, 5]), mk('2026-09-03', 102.5, [5, 5, 5, 0, 0])];
    await log(base, R);
    const once = await suggest('backSquat', plan);
    await log([...base, mk('2026-09-05', 102.5, [5, 5, 5, 0, 0])], R);
    const twice = await suggest('backSquat', plan);
    /* r64 (the r63 audit's R-1): a set tried and missed is one of the session's sets, so five sets were tried, short of the
       range in two, and the session is not one of fewer sets; until r64 it read as one ("Last (Sep 5, fewer sets)") and the
       target came from the session before, which stepped a load up after sets missed at that load (tests/r64a.js). The load
       held is asserted as before, and the words now say exactly what was done and what to beat. */
    const said = d => new RegExp(`^Last \\(${d}\\): 102\\.5×5, 102\\.5×5, 102\\.5×5, 102\\.5×0 missed, 102\\.5×0 missed\\. Beat 15 reps over 5 sets at 102\\.5 kg\\.`);
    ok(Math.abs(once.w - 102.5) < 1e-9 && Math.abs(twice.w - 102.5) < 1e-9 && said('Sep 3').test(once.text) && said('Sep 5').test(twice.text), 'a 5 x 5 at 102.5 with sets 4 and 5 missed, once and twice running: the next target stays 102.5 until every set is made, the missed sets read as sets short of the range (r56.1 and r55: 105 after the second; since r58 two in a row are no new usual on a day of the routine)', { once, twice });
    // A plan of 4 x 6 to 10: 50 x 8 x 4, then 50 x 8, 8 and two missed, twice.
    const p4 = { sets: 4, repMin: 6, repMax: 10, rir: 2, rest: 150, inc: 2.5 };
    await log(['2026-09-01', '2026-09-05', '2026-09-09'].map((d, i) => ses('m' + i, d, 'bench', [6, 10], (i ? [8, 8, 0, 0] : [8, 8, 8, 8]).map(r => [50, r, null]))));
    const four = await suggest('bench', p4);
    ok(Math.abs(four.w - 50) < 1e-9 && /over 4 sets/.test(four.text) && !/first 2 sets/.test(four.text), 'a 4-set plan with two sets missed twice running: the target is still over 4 sets at 50 kg (r56.1 and r55: "over your first 2 sets")', four);
  }

  // ---- 2: 100 x 10 x 3, two sessions of 100 x 8 x 3, then 100 x 9 x 3: untagged, and on a Lighter day.
  {
    const plan = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 2.5 };
    const run = light => [ses('a', '2026-09-01', 'bench', [6, 10], [[100, 10], [100, 10], [100, 10]]), ses('b', '2026-09-04', 'bench', [6, 10], [[100, 8], [100, 8], [100, 8]]), ses('c', '2026-09-08', 'bench', [6, 10], [[100, 8], [100, 8], [100, 8]]), ses('d', '2026-09-11', 'bench', [6, 10], [[100, 9], [100, 9], [100, 9]], {}, light ? { light: true } : {})];
    await log(run(false));
    const plain = await suggest('bench', plan);
    await log(run(true));
    const lighter = await suggest('bench', plan);
    ok(/Beat 27 reps over 3 sets at 100 kg/.test(plain.text), 'untagged, 100 x 9 x 3 after two sessions of 8 sets the target from it (a guard)', plain);
    ok(/Beat 27 reps over 3 sets at 100 kg/.test(lighter.text), 'the same 100 x 9 x 3 on a Lighter day, its usual load and reps for its usual sets, sets the target from it as on any day (r56.1 and r55: "Beat 24 reps", the session before)', lighter);
  }

  // ---- 1: one best estimate. Bench at 3 to 5 (120 x 5), then moved to 8 to 12 (90 x 10 and 11).
  {
    await log([ses('a1', '2026-08-01', 'bench', [3, 5], [[120, 5, 0], [120, 5, 0], [120, 5, 0]]), ses('a2', '2026-08-08', 'bench', [3, 5], [[120, 5, 0], [120, 5, 0], [120, 4, 0]]),
      ses('b1', '2026-09-01', 'bench', [8, 12], [[90, 10, 1], [90, 10, 1], [90, 9, 1]]), ses('b2', '2026-09-08', 'bench', [8, 12], [[90, 11, 1], [90, 10, 1], [90, 10, 1]])]);
    const read = () => ev(async () => {
      const L = window.__ironlog; const pause = () => new Promise(r => setTimeout(r, 250));
      L.ui.tab = 'today'; L.render(); L.openModal({ kind: 'exhist', exId: 'bench' }); await pause();
      const sheet = (document.querySelector('#modal .sheet') || {}).innerText || '';
      L.ACT.mClose(); L.ui.tab = 'dash'; L.ui.dashEx = 'bench'; L.render(); await pause();
      const view = document.getElementById('view');
      const tile = [...view.querySelectorAll('.kpi')].find(k => /Best estimate/.test(k.textContent));
      const rows = [...view.querySelectorAll('table.t tr')].filter(tr => tr.querySelector('.tag.green') && /PR/.test(tr.querySelector('.tag.green').textContent)).map(tr => tr.cells[0].textContent.replace(/\s*PR.*$/s, '').trim());
      const listed = L.IDX().prs.filter(p => p.big && p.exId === 'bench').map(p => L.fmtDate(p.date));
      return { sheet: (sheet.match(/Best estimate ([\d.]+)/) || [])[1] || null, tile: tile ? tile.querySelector('.v').textContent.replace(/[^\d.]/g, '') : null, board: (view.textContent.match(/best est ([\d.]+)/) || [])[1] || null, rows, listed };
    });
    const r = await read();
    ok(r.board === '135' && r.tile === r.board && r.sheet === r.board, 'one best estimate: Stats\' Best estimate, the exercise sheet and All-time bests all say 135 kg (r56.1 and r55: 126 on the tile and the sheet)', r);
    ok(r.rows.join() === r.listed.join(), 'a history row says PR only for a PR Recent PRs lists (r56.1 and r55: "Sep 8 PR" and "Sep 1 PR" beside "No PRs yet")', r);
    // 70 kg x 8 x 3 twice, then the units set to lb and 155 lb x 8 x 3 twice.
    await log([0, 1, 2, 3].map(i => ses('u' + i, add('2026-08-20', 7 * i), 'bench', [6, 10], [0, 1, 2].map(() => [i < 2 ? 70 : 155 * LB, 8]))));
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; L.invalidate(); L.saveNow(); });
    const u = await read();
    ok(u.board && u.sheet === u.board && u.tile === u.board, 'after a change of units, the sheet, the tile and the board say one best estimate (r56.1 and r55: 199.3 on the sheet, 198.4 on the board)', u);
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'kg'; L.ui.tab = 'today'; L.saveNow(); L.render(); });
  }

  // ---- C: incline dumbbell press on a 2.5 kg rack (22.5, 25, 27.5), then 24 kg x 12 x 3 at a gym with 2 kg steps.
  {
    let d = '2026-07-27'; const list = [];
    for (const [w, r] of [[22.5, 10], [22.5, 12], [25, 9], [25, 11], [25, 12], [27.5, 8], [24, 12]]) { list.push(ses('i' + d, d, 'incDb', [8, 12], [0, 1, 2].map(() => [w, r]))); d = add(d, 7); }
    await log(list);
    await ev(() => { const L = window.__ironlog; delete L.state.settings.gym; L.invalidate(); L.saveNow(); });
    const at24 = await suggest('incDb', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 });
    ok(Math.abs(at24.w - 26) < 1e-9, 'after 24 kg x 12 x 3 at a gym with 2 kg dumbbell steps: 26 kg, on that rack (r56.1 and r55: 24.5, which neither rack has)', at24);
    // A guard: one gym in 2.5 kg steps all along steps on it.
    await log(list.slice(0, 5));
    const one = await suggest('incDb', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 });
    ok(Math.abs(one.w - 27.5) < 1e-9, 'one gym in 2.5 kg steps: 25 x 12 x 3 steps to 27.5 kg (a guard)', one);
  }

  if (P.errors.length) ok(false, 'no page errors', P.errors);
  await P.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
