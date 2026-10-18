// Wide histories for tests/r52.js and tests/engine.js (phase 3b): a seeded
// log reaching far more than tests/r36.js's histories, and the digest that
// calls each of the 74 names live.ts gives the legacy script, in one fixed
// order, with arguments covering each form it takes. Each line of a digest is
// a call: the name, its arguments and its answer, each written out whole
// with undefined, -0, NaN, Infinity, Sets and Maps told apart (`ser`), so
// tests/engine.js can make the same call in Node and compare the answer.
// A small seeded generator (mulberry32), so a failure is the same history on every run.
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const LB = 0.45359237;
const MUSCLES = ['chest', 'serratus', 'lats', 'upperBack', 'traps', 'lowerBack', 'frontDelts', 'sideDelts', 'rearDelts', 'rotatorCuff', 'biceps', 'triceps', 'forearms', 'abs', 'obliques', 'neck', 'quads', 'hamstrings', 'glutes', 'adductors', 'abductors', 'calves', 'tibialis'];
const JOINTS = ['j_knee', 'j_hip', 'j_shoulder', 'j_elbow', 'j_wrist'];
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayAt = (base, n) => { const d = new Date(base + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };

// One wide history: a raw log (normalize runs on it in each page) and the day it is read on.
function wide(seed, LIB) {
  const r = rng(seed); const pick = a => a[Math.floor(r() * a.length)]; const chance = p => r() < p; const int = (a, b) => a + Math.floor(r() * (b - a + 1));
  const kg = chance(0.35); const toKg = v => (kg ? v : v * LB);
  // Today: Sunday 2026-10-11 to Saturday 2026-10-17, every day of the week across the histories.
  const today = dayAt('2026-10-11', seed % 7);
  const byKind = k => LIB.filter(k);
  const kinds = {
    barbell: byKind(e => e.equip === 'barbell' && !e.bw), dumbbell: byKind(e => e.equip === 'dumbbell' && !e.timed), machine: byKind(e => (e.equip === 'machine' || e.equip === 'cable') && !e.bw),
    bw: byKind(e => e.bw && !e.timed && !e.assist && e.equip === 'bodyweight'), assist: byKind(e => e.assist), timed: byKind(e => e.timed), smith: byKind(e => e.equip === 'smith'), landmine: byKind(e => e.equip === 'landmine'),
  };
  const order = ['barbell', 'dumbbell', 'machine', 'bw', 'barbell', 'dumbbell', 'assist', 'timed', 'smith', 'landmine', 'machine', 'dumbbell'];
  const n = int(3, 9); const lifts = []; const seen = new Set();
  for (let i = 0; i < n; i++) { const k = order[(i + seed) % order.length]; const pool = kinds[k]; if (!pool.length) continue; const e = pick(pool); if (seen.has(e.id)) continue; seen.add(e.id); lifts.push({ e, k }); }
  // Custom lifts: a kettlebell one (racks), and others of any kind.
  const exercises = [];
  if (chance(0.35)) { const c = { id: 'cx' + seed + 'k', name: 'Custom kettlebell press', primary: pick(['frontDelts', 'chest', 'glutes']), secondary: [], equip: 'kettlebell', bw: false, custom: true, rare: false, perSide: chance(0.3), note: '', archived: false }; exercises.push(c); lifts.push({ e: c, k: 'kettlebell' }); }
  if (chance(0.25)) { const c = { id: 'cx' + seed + 'c', name: pick(['Custom row', 'Custom curl', 'Custom hold']), primary: pick(MUSCLES), secondary: [pick(MUSCLES)], equip: pick(['other', 'machine', 'dumbbell', 'barbell']), bw: chance(0.2), custom: true, rare: false, perSide: false, note: '', archived: false, ...(chance(0.15) ? { timed: true } : {}) }; exercises.push(c); lifts.push({ e: c, k: c.timed ? 'timed' : c.bw ? 'bw' : c.equip === 'barbell' ? 'barbell' : c.equip === 'dumbbell' ? 'dumbbell' : 'machine' }); }
  // Library lifts with the lifter's own settings: a step, a kind, a load meaning, the heaviest load, a bar, archived.
  for (const L of lifts) {
    if (L.e.custom || !chance(0.45)) continue;
    const o = { ...L.e };
    if (chance(0.4)) o.inc = toKg(pick([1, 2, 2.5, 5, 10]));
    if (chance(0.25)) o.kind = pick(['compound', 'iso']);
    if (chance(0.2)) o.load = pick(['each', 'total', 'side', 'stack']);
    if (chance(0.25)) o.maxLoad = toKg(pick([50, 80, 120, 200]));
    if (chance(0.2) && L.k === 'barbell') o.barKg = pick([10, 15, 20]);
    if (chance(0.08)) o.archived = true;
    if (chance(0.1)) o.perSide = !o.perSide;
    if (chance(0.1) && !o.timed && !o.assist) o.goal = { w: toKg(int(20, 200)), r: int(1, 10) };
    exercises.push(o); L.e = o;
  }
  // Ranges by kind; one lift on two days with different ranges.
  const rangeOf = k => (k === 'timed' ? pick([[20, 40], [30, 60]]) : k === 'barbell' ? pick([[3, 5], [5, 8], [6, 10], [8, 12], [5, 5]]) : k === 'bw' ? pick([[8, 15], [10, 20], [5, 10]]) : pick([[8, 12], [10, 15], [12, 20], [6, 10]]));
  const nDays = int(2, 5);
  const days = [];
  for (let d = 0; d < nDays; d++) {
    const items = [];
    for (const L of lifts) if (chance(0.55)) { const rr = rangeOf(L.k); items.push({ uid: `u${d}-${L.e.id}`, exId: L.e.id, sets: int(2, 5), repMin: rr[0], repMax: rr[1], rir: int(0, 3), rest: pick([0, 45, 60, 90, 120, 180]), inc: chance(0.06) ? 0 : toKg(pick([2.5, 5, 10])), ss: null, ...(chance(0.08) ? { jump: pick([0, 2.5, 5, 10]) } : {}) }); }
    if (!items.length) items.push({ uid: `u${d}-x`, exId: lifts[0].e.id, sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: toKg(5), ss: null });
    // Superset links: two neighbours share a link.
    if (items.length >= 2 && chance(0.35)) { items[0].ss = 'ss' + d; items[1].ss = 'ss' + d; }
    days.push({ id: `d${d}`, name: `Day ${d + 1}`, rest: false, items });
  }
  // One lift on two days at two ranges, so a day's own range decides (r27).
  if (days.length >= 2) { const it = days[0].items[0]; const twin = { ...it, uid: 'twin', repMin: it.repMin + 4, repMax: it.repMax + 6 }; if (!days[1].items.some(x => x.exId === it.exId)) days[1].items.push(twin); }
  const weekly = chance(0.35);
  const R1 = { id: 'r1', name: 'Main', schedule: weekly ? 'weekly' : 'cycle', days: weekly ? Array.from({ length: 7 }, (_, i) => (i < days.length ? days[i] : { id: `w${i}`, name: 'Rest', rest: true, items: [] })) : days };
  const routines = [R1];
  if (chance(0.25)) routines.push({ id: 'r2', name: 'Other', schedule: 'cycle', days: [{ id: 'o0', name: 'Other day', rest: false, items: days[0].items.slice(0, 2).map((x, i) => ({ ...x, uid: 'o' + i, repMin: x.repMin + 2, repMax: x.repMax + 2 })) }] });
  // Sessions: 2 to 30 weeks, some sessions on the routine's days, some free, a layoff now and then.
  // Now and then a log of one shape, for the coach's rarer lines: lifts flat
  // for weeks (a stall, three main lifts at once), every set at the top of
  // its range, strength falling, an empty log, one that stopped months ago,
  // or one that began in the last few days.
  const mode = pick(['normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'normal', 'flat', 'top', 'falling', 'empty', 'old', 'new']);
  const weeks = mode === 'new' ? 1 : mode === 'flat' || mode === 'top' || mode === 'falling' ? int(6, 14) : int(2, 30); const end = mode === 'old' ? -int(70, 120) : chance(0.15) ? -int(20, 60) : -int(0, 3);
  const level = {}; const sessions = []; let sid = 0;
  const startLoad = k => (k === 'barbell' ? toKg(pick([45, 95, 135, 185, 225])) : k === 'dumbbell' ? toKg(pick([15, 25, 35, 50])) : k === 'machine' ? toKg(pick([40, 70, 100, 150])) : k === 'kettlebell' ? pick([8, 12, 16, 20]) : k === 'assist' ? -toKg(pick([30, 50, 70])) : k === 'smith' || k === 'landmine' ? toKg(pick([25, 45, 90])) : k === 'bw' ? (chance(0.3) ? toKg(pick([10, 25])) : 0) : 0);
  const stepOf = k => (k === 'kettlebell' ? 4 : k === 'dumbbell' ? toKg(pick([2.5, 5])) : k === 'machine' ? toKg(pick([5, 10])) : k === 'assist' ? toKg(5) : k === 'bw' ? toKg(5) : toKg(pick([5, 10])));
  const deloadWk = new Set(); for (let w = 0; w < weeks; w++) if (chance(0.07) && mode === 'normal') deloadWk.add(w);
  const gone = chance(0.2) ? 'goneLift' + seed : null;
  let dayIdx = 0;
  for (let w = 0; w < (mode === 'empty' ? 0 : weeks); w++) {
    const per = int(1, 4);
    for (let k = 0; k < per; k++) {
      if (chance(0.12)) continue;
      const off = end - (weeks - 1 - w) * 7 - int(0, 6);
      if (off > 0) continue;
      const date = dayAt(today, off);
      const onDay = chance(0.8); const dIdx = dayIdx % days.length; dayIdx++;
      const day = days[dIdx];
      const free = !onDay && chance(0.6);
      const items = onDay ? day.items.filter(() => chance(0.85)) : lifts.filter(() => chance(0.5)).map(L => { const rr = rangeOf(L.k); return { exId: L.e.id, sets: 3, repMin: rr[0], repMax: rr[1] }; });
      const blocks = [];
      for (const it of items) {
        const L = lifts.find(x => x.e.id === it.exId); if (!L) continue;
        const key = it.exId + ':' + it.repMin;
        if (level[key] === undefined) level[key] = startLoad(L.k);
        const sets = []; const nS = Math.max(1, it.sets + int(-1, 1));
        let wv = level[key]; if (deloadWk.has(w)) wv = wv * 0.9;
        // Now and then a bad day: every set under the range at the usual load.
        const badDay = L.k !== 'timed' && mode === 'normal' && chance(0.08);
        for (let i = 0; i < nS; i++) {
          const reps = mode === 'flat' ? Math.round((it.repMin + it.repMax) / 2) : mode === 'top' ? it.repMax : L.k === 'timed' ? int(it.repMin - 10, it.repMax + 10) : badDay ? Math.max(1, it.repMin - int(1, 2)) : Math.max(1, int(it.repMin - 2, it.repMax + 3));
          const rir = chance(0.2) ? null : int(0, 5);
          const set = { w: Math.round(wv * 100) / 100, r: reps, rir, done: true };
          if (i === 0 && chance(0.1)) set.warm = true;
          if (i === nS - 1 && chance(0.06)) set.drop = true;
          if (rir != null && chance(0.06)) set.cal = { at: reps + rir, pred: rir };
          sets.push(set);
        }
        if (mode === 'falling') { if (chance(0.6)) level[key] -= stepOf(L.k); }
        else if (mode === 'normal' || mode === 'old') { if (chance(0.45)) level[key] += stepOf(L.k) * (chance(0.8) ? 1 : -1); }
        blocks.push({ exId: it.exId, rr: chance(0.85) ? [it.repMin, it.repMax] : null, sets, ...(chance(0.04) ? { cut: true } : {}), ...(chance(0.03) ? { light: true } : {}) });
      }
      if (gone && chance(0.15)) blocks.push({ exId: gone, rr: [8, 12], sets: [{ w: toKg(50), r: 10, rir: 2, done: true }] });
      if (blocks.length && chance(0.05)) blocks.push(JSON.parse(JSON.stringify(blocks[0])));
      if (!blocks.length) continue;
      const s = { id: 's' + (sid++), date, dayIdx: onDay ? dIdx : 0, dayId: onDay ? day.id : null, dayName: onDay ? day.name : 'Freestyle', routineId: onDay ? R1.id : '', notes: '', ex: blocks };
      if (deloadWk.has(w) && chance(0.6)) s.deload = true;
      if (chance(0.03)) s.light = true;
      if (chance(0.03)) s.demo = true;
      if (free) s.free = true;
      if (chance(0.3)) s.chk = { sleep: int(1, 3), energy: int(1, 3), joints: int(1, 3) };
      if (chance(0.55)) s.durMin = int(25, 110);
      if (chance(0.3)) s.t = new Date(date + 'T' + String(int(6, 20)).padStart(2, '0') + ':00:00').getTime();
      sessions.push(s);
    }
  }
  const bodyweights = []; if (chance(0.7)) for (let d = 0; d < weeks * 7; d += int(3, 14)) bodyweights.push({ id: 'b' + d, date: dayAt(today, -d), kg: 70 + r() * 25 });
  const cardio = []; if (chance(0.4)) for (const s of sessions) if (chance(0.25)) cardio.push({ id: 'c' + s.id, date: s.date, kind: pick(['run', 'bike', 'row', 'walk']), min: int(5, 40), when: pick(['pre', 'post', 'solo']) });
  const injuries = chance(0.2) ? [{ id: 'j1', m: chance(0.5) ? pick(lifts).e.primary : pick(JOINTS), note: '', date: today }] : [];
  const settings = { unit: kg ? 'kg' : 'lb', onboarded: true };
  if (chance(0.12)) settings.rirMode = 'off'; else if (chance(0.15)) settings.rirMode = 'cal';
  if (chance(0.25)) settings.rirHalf = true;
  if (chance(0.2)) settings.rirScale = pick(['half', 'rpe']);
  if (chance(0.35)) settings.profile = { goal: pick(['size', 'strength', 'both']), exp: pick(['new', 'mid', 'adv']), days: pick([2, 3, 4, 5, 6]), ...(chance(0.4) ? { focus: [pick(MUSCLES.filter(m => !['serratus', 'rotatorCuff', 'neck', 'tibialis'].includes(m)))] } : {}) };
  if (chance(0.3)) settings.priorities = [pick(MUSCLES), pick(MUSCLES)];
  if (chance(0.3)) { settings.bands = {}; for (const m of MUSCLES) if (chance(0.3)) settings.bands[m] = [int(0, 12), int(8, 22)]; }
  if (chance(0.15) && sessions.length) settings.restWeeks = [sessions[int(0, sessions.length - 1)].date, dayAt(today, -7 * int(1, 4)), ...(chance(0.3) ? ['THIS_WEEK'] : [])];
  if (chance(0.15)) settings.todayStart = 'free';
  if (chance(0.3)) settings.barKg = pick([15, 20, 25]);
  if (chance(0.15)) settings.smallPlates = true;
  if (chance(0.45)) {
    const gu = chance(0.5) ? 'kg' : 'lb';
    const g = { u: gu };
    if (chance(0.8)) g.db = gu === 'kg' ? { lo: 2, hi: pick([30, 40, 50]), st: pick([2, 2.5]), ...(chance(0.4) ? { fine: 1, fineTo: 10 } : {}) } : { lo: 5, hi: pick([75, 100, 120]), st: 5, ...(chance(0.4) ? { fine: 2.5, fineTo: 25 } : {}) };
    if (chance(0.5)) g.kb = gu === 'kg' ? [8, 12, 16, 20, 24, 32] : [18, 26, 35, 44, 53, 70];
    if (chance(0.4)) g.plates = gu === 'kg' ? [25, 20, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
    if (chance(0.4)) g.stack = gu === 'kg' ? pick([5, 7]) : pick([10, 15]);
    settings.gym = g;
  }
  const raw = { version: 5, exercises, routines, activeRoutineId: 'r1', sessions, bodyweights, measurements: [], cardio, injuries, draft: null, deloadWeek: chance(0.12) ? 'THIS_WEEK' : null, trash: [], settings };
  // A close variation never done (same equipment and main muscle as a lift that was), for a first session borrowed from it (r32.1).
  const kin = LIB.filter(e => !seen.has(e.id) && !e.bw && lifts.some(L => !L.e.custom && L.e.equip === e.equip && L.e.primary === e.primary && ['barbell', 'dumbbell', 'landmine'].includes(e.equip)));
  return { raw, today, ids: [...lifts.map(L => L.e.id), ...(gone ? [gone] : []), 'constructor', pick(LIB).id, ...(kin.length ? [pick(kin).id] : [])] };
}

// Everything the 74 say about one history, in each page: called in one fixed
// order (the caches fill in that order in both builds), each answer written
// out whole. Runs in the page.
function digest(spec) {
  const L = window.__ironlog;
  // The encoding and the error text are this file's ser and err, handed in
  // as text (specOf), so the page and Node use one copy of each.
  const ser = new Function(`return (${spec.ser})`)(), err = new Function(`return (${spec.err})`)();
  const out = [];
  let tag = '';
  const call = (name, ...args) => { let r; try { r = L[name](...args); } catch (e) { r = err(e); } out.push(tag + name + '\t' + ser(args) + '\t' + ser(r)); return r; };
  const raw = JSON.parse(spec.raw);
  // This week's start, for a deload week or a rest week marked this week.
  const thisWeek = (() => { const d = new Date(); const g = (d.getDay() + 6) % 7; d.setDate(d.getDate() - g); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
  if (Array.isArray(raw.settings.restWeeks)) raw.settings.restWeeks = raw.settings.restWeeks.map(w => (w === 'THIS_WEEK' ? thisWeek : w));
  if (raw.deloadWeek === 'THIS_WEEK') { const d = new Date(); const g = (d.getDay() + 6) % 7; d.setDate(d.getDate() - g); raw.deloadWeek = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  L.state = L.normalize(raw); L.invalidate();
  const s = L.state;
  out.push('state ' + ser(s));
  const today = spec.today, ids = spec.ids;
  const dates = s.sessions.map(x => x.date).sort();
  const mid = dates.length ? dates[Math.floor(dates.length / 2)] : today;
  const add = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
  const ws0 = (() => { const t = new Date(today + 'T12:00:00'); const g = (t.getDay() + 6) % 7; return add(today, -g); })();
  const weeks = [...new Set([...Array.from({ length: 10 }, (_, i) => add(ws0, -7 * i)), ...((s.settings.restWeeks) || []), add(ws0, 7)])];
  // The accessors and readers with no arguments.
  for (const n of ['U', 'activeRoutine', 'freeMode', 'gymOf', 'injuredSet', 'isDeloadWeek', 'prof', 'rirHalfOn', 'barKg', 'sortedSessions', 'bwRef', 'calStats', 'pace', 'paceRatios', 'dateIndex', 'IDX', 'firstFullWeek', 'weekStats', 'weekStreak', 'coach', 'movers', 'readiness', 'stalledIds']) call(n);
  // Identity, which values cannot show.
  const idn = [];
  for (const id of ids) { const rec = s.exercises.find(e => e.id === id); if (rec) idn.push(['EX is the record', id, L.EX(id) === rec]); }
  idn.push(['EX of a missing id is a new stand-in each time', L.EX('missing-id') === L.EX('missing-id')]);
  idn.push(['prof is the log\'s profile', s.settings.profile ? L.prof() === s.settings.profile : null, L.prof() === L.prof()]);
  const I0 = L.IDX(), D0 = L.dateIndex(), C0 = L.calStats();
  idn.push(['caches kept', L.IDX() === I0, L.dateIndex() === D0, L.calStats() === C0, L.activeRoutine() === s.routines.find(r => r.id === s.activeRoutineId) || s.routines[0] === L.activeRoutine(), L.gymOf() === (s.settings.gym && typeof s.settings.gym === 'object' ? s.settings.gym : null)]);
  // Made anew on each call in r51 (a sorted copy, a new Set): compared across builds, not held here.
  idn.push(['made anew', L.sortedSessions() === L.sortedSessions(), L.injuredSet() === L.injuredSet()]);
  out.push('identity ' + ser(idn));
  for (const v of [0, 1, 2.5, 2.2679618, 20, 45.359237, 100.5, -40, 0.001, 1e-9, null, undefined]) { call('toD', v); call('fromD', v); call('fmtW', v); }
  for (const v of [2.2679618, 2.5, 5, 1.25, 0, 10, 4.5359237]) call('stepRead', v);
  for (const d of [today, mid, dates[0] || today, '9999-12-31', '2000-01-01']) call('bwAt', d);
  // Calls on the id "constructor" are tagged, since they throw in both builds (byEx is a plain object).
  for (const id of ids) { tag = id === 'constructor' ? '~' : ''; call('EX', id); call('exName', id); call('rirUsual', id); call('dropOnlyLift', id); call('defPlan', id); call('defPlan', id, true); call('daysOff', id); call('daysOff', id, { before: mid }); call('daysOff', id, null); }
  tag = '';
  const R = s.routines.find(r => r.id === s.activeRoutineId) || s.routines[0];
  const profs = [undefined, null, { goal: 'strength' }, { goal: 'both', exp: 'new' }, { goal: 'size', exp: 'adv' }, { goal: 'strength', exp: 'mid', focus: ['chest'] }];
  const lists = [];
  for (const id of ids) {
    tag = id === 'constructor' ? '~' : '';
    const ex = L.EX(id);
    call('exInjury', ex); call('exBarKg', ex); call('bwLoad', ex, today); call('bwLoad', ex, mid); call('bwRefLoad', ex);
    for (const w of [0, 20, -30, 2.5]) call('loadLabel', ex, w);
    for (const p of profs) call('profRule', ex, p);
    call('profPlan', ex); call('profPlan', ex, true);
    call('easierText', ex, { w: 20, from: 1, to: 3 });
    call('rackStep', ex);
    const plans = [call('planFor', id), call('planFor', id, null, null, true)];
    for (const d of R.days) if (d.items.some(it => it.exId === id)) plans.push(call('planFor', id, R, d.id));
    for (const r2 of s.routines) if (r2 !== R) plans.push(call('planFor', id, r2));
    // (byEx is a plain object: an id such as "constructor" would find Object's, so only an array counts.)
    const xs = Array.isArray(L.IDX().byEx[id]) ? L.IDX().byEx[id] : [];
    const top = xs.length ? xs[xs.length - 1].topW : 0;
    for (const P of plans.filter(p => p && typeof p === 'object')) {
      const G = call('gymRack', ex, P); if (Array.isArray(G)) lists.push(G);
      for (const t of [top, top + 5, 0]) { call('capOf', ex, P, t); call('incOf', ex, P, t); }
      call('incOf', ex, P); call('incOf', ex, null);
      call('progStep', ex, P, top + 80, top); call('progStep', ex, P, 100); call('progStep', ex, P, top + 80, null);
      call('lighterLoad', ex, P, top, top * 0.9); call('lighterLoad', ex, P, top, top * 0.5); call('lighterLoad', ex, P, 20, 0);
      for (const o of [undefined, null, {}, { light: true }, { deload: true }, { before: mid }, { before: dates[0] || mid, deload: true }]) { call('suggest', id, P, o); call('suggestCore', id, P, o); }
    }
    call('statsUpTo', id, xs.filter(x => x.date <= mid)); call('statsUpTo', id, xs);
  }
  tag = '';
  for (const Lx of lists.slice(0, 6)) for (const at of [undefined, null, Lx[0], Lx[Math.floor(Lx.length / 2)], (Lx[Lx.length - 1] || 0) + 1]) call('rackTol', Lx, at);
  call('rackTol');
  // Sets as the analytics read them, with their lift and date.
  let k = 0;
  for (const ss of s.sessions) for (const b of ss.ex) for (const x of b.sets) {
    if (k++ % 7) continue; if (k > 120) break;
    const ex = L.EX(b.exId);
    call('rirEff', x, ex); call('rirEst', x, ex); call('isHard', x, ex); call('hardCredit', x, ex); call('loadOf', ex, x, ss.date); call('prLoad', ex, x, ss.date); call('tonnage', ex, x, ss.date); call('tonnage', ex, x);
  }
  for (const ws of weeks) { call('isRestWeek', ws); call('weekSessions', ws); call('weekNeed', ws); call('weekRoutine', ws); }
  for (const r2 of s.routines) { call('planSetsPerWeek', r2); call('planSetsPerWeek', r2, true); for (const d of r2.days) { call('dayMinutes', d); call('dayMinutes', d, true); call('dayMinutes', d, false, true); for (const it of d.items) call('planCredit', it); } }
  for (const ss of s.sessions.slice(-8)) call('sessModelMin', ss);
  for (const d of [7, 28, 56]) call('recentLighter', d);
  call('actualAvg4'); call('actualAvg4', true); for (const n of [2, 4, 8]) { call('avgWeeks', n); call('avgWeeks', n, true); }
  const avg = L.actualAvg4(); call('regionBalance', avg || {}); call('regionBalance', L.IDX().weekSets[ws0] || {}); call('regionBalance', {});
  call('fatigueStalls', L.stalledIds()); call('fatigueStalls', ids);
  // invalidate clears every cache: the same answers again, newly built.
  call('invalidate');
  const I1 = L.IDX();
  out.push('fresh ' + ser([I1 !== I0, L.dateIndex() !== D0, L.calStats() !== C0]));
  call('IDX'); call('coach'); call('weekStats'); if (ids[0]) call('suggest', ids[0], L.planFor(ids[0]), {});
  return out.join('\n');
}

// One encoding for an answer, in the page and in Node: JSON, with undefined,
// -0, NaN, Infinity, a function, a hole, a Set and a Map marked, and every
// own property of an object or array, a property that is not enumerable
// (avgWeeks keeps its notes so) under its name marked "~ne:". JSON.stringify
// alone drops those, and the r52 review changed two of them unseen.
function ser(v) {
  const enc = (x, up) => {
    if (x === undefined) return '~undef';
    if (typeof x === 'function') return '~fn';
    if (typeof x === 'number') return Object.is(x, -0) ? '~-0' : isFinite(x) ? x : '~' + String(x);
    if (x === null || typeof x !== 'object') return x;
    if (up.includes(x)) return '~cycle';
    const u2 = [...up, x];
    if (x instanceof Set) return { '~set': [...x].map(y => enc(y, u2)) };
    if (x instanceof Map) return { '~map': [...x.entries()].map(([k, y]) => [enc(k, u2), enc(y, u2)]) };
    if (x instanceof Date) return { '~date': x.getTime() };
    const props = {};
    let extra = false;
    for (const k of Object.getOwnPropertyNames(x)) {
      if (Array.isArray(x) && (k === 'length' || String(k >>> 0) === k)) continue;
      const d = Object.getOwnPropertyDescriptor(x, k);
      props[d.enumerable ? k : '~ne:' + k] = 'value' in d ? enc(d.value, u2) : '~accessor';
      extra = true;
    }
    if (!Array.isArray(x)) return props;
    const items = []; for (let i = 0; i < x.length; i++) items.push(i in x ? enc(x[i], u2) : '~hole');
    return extra ? { '~arr': items, '~props': props } : items;
  };
  try { return JSON.stringify(enc(v, [])); } catch (e) { return 'SERR ' + e.message; }
}
// An error, by its kind and message, the message read back as the r51 name
// where it quotes a function taking the model (V8 words a TypeError from the
// source: "IDXIn(...).byEx" for r51's "IDX(...).byEx"; the crash screen
// shows that text, the one difference r52 makes, ARCHITECTURE.md).
function err(e) {
  return 'ERR ' + (e && e.name) + ': ' + String(e && e.message).replace(/\b([A-Za-z_$][\w$]*)In\(/g, '$1(');
}
// What the digest is given for one history.
const specOf = h => ({ raw: JSON.stringify(h.raw), today: h.today, ids: h.ids, ser: ser.toString(), err: err.toString() });
// ser read back: each mark becomes the value it stands for, a property kept
// present when it was, and one marked "~ne:" defined as not enumerable.
function decode(text) {
  const back = v => {
    if (v === '~undef') return undefined;
    if (v === '~NaN') return NaN; if (v === '~Infinity') return Infinity; if (v === '~-Infinity') return -Infinity; if (v === '~-0') return -0;
    if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) if (v[i] !== '~hole') a[i] = back(v[i]); return a; }
    if (v && typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 1 && Array.isArray(v['~set'])) return new Set(v['~set'].map(back));
      if (keys.length === 1 && Array.isArray(v['~map'])) return new Map(v['~map'].map(([k, x]) => [back(k), back(x)]));
      if (keys.length === 1 && typeof v['~date'] === 'number') return new Date(v['~date']);
      const own = (o, props) => { for (const k of Object.keys(props)) { if (k.startsWith('~ne:')) Object.defineProperty(o, k.slice(4), { value: back(props[k]), enumerable: false, writable: true, configurable: true }); else o[k] = back(props[k]); } return o; };
      if (keys.length === 2 && Array.isArray(v['~arr']) && v['~props']) return own(back(v['~arr']), v['~props']);
      return own({}, v);
    }
    return v;
  };
  return back(JSON.parse(text));
}
module.exports = { rng, wide, digest, decode, ser, err, specOf };
