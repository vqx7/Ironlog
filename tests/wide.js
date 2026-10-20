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
  // Finish's offer to update the routine day (routineUpdates; changed in r53): the last sessions as finished drafts on the routine's first days, as a normal day, a lighter day, a deload and with limited equipment, the first exercise swapped in for the day's first and the first two done linked.
  if (R) for (const ss of s.sessions.slice(-3)) for (const d of R.days.slice(0, 3)) for (const mark of [{}, { light: true }, { deload: true }, { limited: true }]) {
    const half = mark.light || mark.deload;
    const ex = ss.ex.map((b, i) => ({ exId: b.exId, swappedFrom: i === 0 && d.items[0] ? d.items[0].exId : null, plan: { ...L.planFor(b.exId, R, d.id), sets: Math.max(1, Math.ceil(b.sets.length / (half ? 2 : 1))), ss: i < 2 ? 'g1' : null }, sets: b.sets.map(x => ({ done: true, warm: !!x.warm })) }));
    call('routineUpdates', { routineId: R.id, dayId: d.id, ...mark, ex });
  }
  for (const d of [7, 28, 56]) call('recentLighter', d);
  call('actualAvg4'); call('actualAvg4', true); for (const n of [2, 4, 8]) { call('avgWeeks', n); call('avgWeeks', n, true); }
  // The words for an average's weeks, a function of the average alone (r53: tests/engine.js runs it in Node too).
  for (const v of [L.actualAvg4(), L.avgWeeks(2), L.avgWeeks(8, true)]) if (v) call('avgWeeksTxt', v);
  const avg = L.actualAvg4(); call('regionBalance', avg || {}); call('regionBalance', L.IDX().weekSets[ws0] || {}); call('regionBalance', {});
  call('fatigueStalls', L.stalledIds()); call('fatigueStalls', ids);
  // invalidate clears every cache: the same answers again, newly built.
  call('invalidate');
  const I1 = L.IDX();
  out.push('fresh ' + ser([I1 !== I0, L.dateIndex() !== D0, L.calStats() !== C0]));
  call('IDX'); call('coach'); call('weekStats'); if (ids[0]) call('suggest', ids[0], L.planFor(ids[0]), {});
  // The log after every call: none writes to it, so it must still be the
  // log read above, in both builds (the second r52 review wrote to it where
  // no answer showed it).
  out.push('state-after ' + ser(s));
  return out.join('\n');
}

// The scenarios a fresh comparison cannot reach (r52), shared since r53 by
// tests/r52.js (r51 against r52) and tests/r53w.js (r52 against this build),
// each run in one page P. midnightRun: a page left open past midnight from
// Sunday into Monday, read before, after with Sunday's caches, and after
// invalidate; `after(P, j)`, when given, is run in the same moment after
// each read j (0, 1 and 2) and its answer kept beside it. staleRun: one cache read stale on purpose, the log changed and read
// again before invalidate, then after it (STALE_CASES). demoRun: makeDemo's
// whole log and what the engine reads in it, the random ids set aside.
const MIDNIGHT_KEYS = ['isDeloadWeek', 'weekStats', 'weekStreak', 'coach', 'recentLighter', 'firstFullWeek', 'actualAvg4', 'paceRatios', 'pace', 'movers', 'stalledIds', 'readiness'];
// Each read whole in the digest's encoding (the second r52 review hid a change in avgWeeks's notes from JSON), and the log after it; each lift's plan beside its suggestion.
function midnightRead([ids, keys, S, E]) { const L = window.__ironlog; const ser = new Function(`return (${S})`)(), err = new Function(`return (${E})`)(); const o = {}; for (const k of keys) { try { o[k] = ser(k === 'recentLighter' ? L[k](28) : L[k]()); } catch (e) { o[k] = err(e); } } for (const id of ids) { try { o['p ' + id] = ser(L.planFor(id)); o['s ' + id] = ser(L.suggest(id, L.planFor(id), {})); o['d ' + id] = ser(L.daysOff(id)); } catch (e) { o['s ' + id] = err(e); } } o.idx = ser(L.IDX()); o.dix = ser(L.dateIndex()); o.log = ser(L.state); return JSON.stringify(o); }
async function midnightRun(P, h, after) {
  const sun = new Date('2026-10-11T23:59:30'), mon = new Date('2026-10-12T00:00:30');
  const arg = [h.ids, MIDNIGHT_KEYS, ser.toString(), err.toString()];
  await P.page.clock.setFixedTime(sun);
  await P.page.evaluate(raw => { const L = window.__ironlog; const r = JSON.parse(raw); const d = new Date(); const g = (d.getDay() + 6) % 7; d.setDate(d.getDate() - g); r.deloadWeek = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; L.state = L.normalize(r); L.invalidate(); }, JSON.stringify(h.raw));
  const out = [];
  const one = async j => out.push([await P.page.evaluate(midnightRead, arg), after ? await after(P, j) : null]);
  await one(0);
  await P.page.clock.setFixedTime(mon);
  await one(1);
  await P.page.evaluate(() => window.__ironlog.invalidate());
  await one(2);
  return out;
}
const STALE_CASES = {
  EXMAP: { build: 'L.EX(s.exercises[0].id)', change: "s.exercises.push({ ...s.exercises[0], id: 'zz-new', name: 'New lift' })", read: "[L.EX('zz-new').name, L.exName('zz-new')]" },
  _idx: { build: 'L.IDX()', change: 's.sessions.push({ ...s.sessions[s.sessions.length - 1], id: "zz-s", date: s.sessions[s.sessions.length - 1].date })', read: 'Object.keys(L.IDX().byEx).map(k => L.IDX().byEx[k].length)' },
  _dix: { build: 'L.dateIndex()', change: 's.sessions.push({ ...s.sessions[0], id: "zz-d", date: "2026-10-10" })', read: 'L.dateIndex().byDate["2026-10-10"] ? L.dateIndex().byDate["2026-10-10"].length : 0' },
  _cal: { build: 'L.calStats()', change: 's.sessions.forEach(x => x.ex.forEach(b => b.sets.forEach(y => { if (y.rir != null) y.cal = { at: y.r + y.rir + 1, pred: y.rir }; })))', read: 'L.calStats()' },
  _rirUse: { build: 'ids.map(id => L.rirUsual(id))', change: 's.sessions.forEach(x => x.ex.forEach(b => b.sets.forEach(y => { y.rir = 4; })))', read: 'ids.map(id => L.rirUsual(id))' },
  _bwRef: { build: 'L.bwRef()', change: 's.bodyweights.push({ id: "zz-b", date: "2026-10-10", kg: 123 })', read: '[L.bwRef(), ids.map(id => L.bwRefLoad(L.EX(id)))]' },
  _pace: { build: 'L.pace()', change: 's.sessions.forEach(x => { x.durMin = 200; })', read: '[L.pace(), L.paceRatios().length]' },
  _rack: { build: 'ids.map(id => { try { return L.rackStep(L.EX(id)); } catch (e) { return "ERR"; } })', change: 's.sessions.forEach(x => x.ex.forEach(b => b.sets.forEach(y => { y.w = y.w + 0.37; })))', read: 'ids.map(id => { try { return L.rackStep(L.EX(id)); } catch (e) { return "ERR"; } })' },
  weekRid: { build: 'L.weekRoutine(L.state.sessions.length ? L.state.sessions[0].date : "2026-10-05")', change: 's.routines.push({ ...s.routines[0], id: "zz-r", name: "Swapped" }); s.sessions.forEach(x => { x.routineId = "zz-r"; })', read: 'L.weekRoutine(L.state.sessions.length ? L.state.sessions[0].date : "2026-10-05").name' },
};
const staleRun = (P, h, c) => P.page.evaluate(([raw, ids, c, S, E]) => {
  const L = window.__ironlog; L.state = L.normalize(JSON.parse(raw)); L.invalidate(); const s = L.state;
  const ser = new Function(`return (${S})`)(), err = new Function(`return (${E})`)();
  const ev = t => { try { return ser(new Function('L', 's', 'ids', `return (${t});`)(L, s, ids)); } catch (e) { return err(e); } };
  const built = ev(c.build); ev(c.read); new Function('L', 's', 'ids', c.change)(L, s, ids);
  const stale = ev(c.read); L.invalidate(); const after = ev(c.read);
  return [built, stale, after, ser(L.state)];
}, [JSON.stringify(h.raw), h.ids, c, ser.toString(), err.toString()]);
// makeDemo calls the engine while it builds the demo log, so the log it
// builds depends on when each cache fills: compared whole, its seed being
// fixed, with the random ids set aside (each id read as the order it first
// appears in). The page is left holding the demo log.
const demoRun = P => P.page.evaluate(([S]) => {
  const L = window.__ironlog; L.state = L.normalize(null); L.invalidate(); L.makeDemo(); L.invalidate();
  const ser = new Function(`return (${S})`)();
  const ids = new Map(); const canon = v => (typeof v === 'string' && /^[a-z0-9]{8,}$/i.test(v) && /\d/.test(v) && /[a-z]/i.test(v) ? (ids.has(v) || ids.set(v, '#' + ids.size), ids.get(v)) : v);
  // Read in the digest's encoding first, so no property is left out, then the ids set aside.
  const walk = x => (Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)])) : canon(x));
  const enc = v => walk(JSON.parse(ser(v)));
  return JSON.stringify({ state: enc(L.state), idx: enc(L.IDX()), coach: enc(L.coach()) });
}, [ser.toString()]);

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
// An error, by its kind and message, the message read back by the rules
// tests/moved.js read the code back by until r54, where it quotes the code: a
// function taking the model as its r51 name with the model left out of its
// arguments, and M.s, M.c.X and M.today as state, X and today. An engine
// words a TypeError from the source: V8 writes "IDXIn(...).byEx" for r51's
// "IDX(...).byEx", and Safari's engine the arguments too, "IDXIn(M).byEx"
// for "IDX().byEx" (found on GitHub, in WebKit). The crash screen shows that
// text, the one difference r52 makes (ARCHITECTURE.md).
function err(e) {
  const back = String(e && e.message)
    .replace(/\b([A-Za-z_$][\w$]*)In\(M(?:, |(?=\)))/g, '$1(')
    .replace(/\b([A-Za-z_$][\w$]*)In\(/g, '$1(')
    .replace(/\bM\.s\b/g, 'state')
    .replace(/\bM\.c\.([A-Za-z_$][\w$]*)/g, '$1')
    .replace(/\bM\.today\b/g, 'today');
  return 'ERR ' + (e && e.name) + ': ' + back;
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
// What r53's changes on purpose can touch in one history, read in an r53 or
// later page with the history loaded, so tests/r36.js and tests/r53w.js can
// compare the rest. r53 (V, 2026-10-18): a lift done at its usual load and
// reps on a lighter or deload day counts as a full session for it; PRs on
// any day; no stall while an injury it loads is flagged; the coach holds
// back a deload only after a lighter week; and a lift on no day of a
// routine is planned from its own last full session (Finish's offer, the
// last change, each suite checks call by call). full: a lift on a lighter
// or deload day now counts as a full session, which reaches IDX and
// everything read from it; injury: an injury is flagged, likewise. tagged:
// each lift in a session tagged lighter or deload, or made lighter itself
// (session id, a tab, the lift), whose PRs are new in IDX's PR list, so a
// suite can take them out and compare the rest; such a PR also counts as
// movement in its lift's stall test once it is since the third-last session
// of the stretch (prOff, below; the fifth review), which a suite allows as
// that rule says. rls: the
// lighter-week test (recentLighter) over 7, 28 and 56 days by r52's rule
// (the newest lighter or deload session or lift read lighter, then the end
// of a rest week) and by r53's (the newest lighter session, half its lifts
// done lighter, of a week with more than half its sessions lighter, once it
// has ended or from the second, or, a deload begun mid-week, its last two or
// more sessions deloads done lighter (tagged deload or in the marked week);
// then the
// end of a rest week or of a marked
// deload week with nothing trained in it), read here from the log, a copy
// of that rule kept beside it on purpose so each build's answer is held to
// its rule (tests/r53.js holds the rule itself by named cases); rl: the coach's 28 days answer one way in one and the
// other in the other, so r53's coach can suggest a deload r52's held back,
// or the reverse, which only the coach reads. plan: a lift on no day of a
// routine plans differently from r52's default, which reaches what is
// called with that plan; planStall: such a lift is stalled, the one place
// the analytics or the coach read a lift's plan for more than its load step
// (the coach reads its range).
function r53Touches() {
  const L = window.__ironlog, s = L.state, I = L.IDX(), today = L.today();
  const tagged = new Set();
  for (const x of s.sessions) for (const b of x.ex) if (x.deload || x.light || b.light) tagged.add(x.id + '\t' + b.exId);
  const full = Object.keys(I.byEx).some(id => I.byEx[id].some(x => tagged.has(x.sid + '\t' + id) && !x.deload && !x.light && !x.cut));
  const injury = (s.injuries || []).length > 0;
  const rls = {};
  for (const days of [7, 28, 56]) {
    const from = L.addDays(today, -days);
    const rest = (d0, weeks) => { let d = d0; for (const w of weeks) { const e = L.addDays(w, 6) < today ? L.addDays(w, 6) : today; if (e >= from && w <= today && (!d || e > d)) d = e; } return d; };
    let a = null; for (const x of s.sessions) if (x.date >= from && (x.deload || x.light) && (!a || x.date > a)) a = x.date;
    for (const id in I.byEx) for (const x of I.byEx[id]) if (x.auto && x.date >= from && (!a || x.date > a)) a = x.date;
    const cur = L.weekStart(today), lifts = {}, done = {}, all = {}, light = {}, tail = {};
    for (const id in I.byEx) for (const x of I.byEx[id]) { lifts[x.sid] = (lifts[x.sid] || 0) + 1; if (x.deload || x.light || x.auto) done[x.sid] = (done[x.sid] || 0) + 1; }
    const lighter = sid => (done[sid] || 0) > 0 && (done[sid] || 0) * 2 >= (lifts[sid] || 0);
    for (const x of [...s.sessions].sort(L.sessCmp)) { const k = L.weekStart(x.date); all[k] = (all[k] || 0) + 1; if (lighter(x.id)) { light[k] = (light[k] || 0) + 1; tail[k] = x.deload || k === s.deloadWeek ? (tail[k] || 0) + 1 : 0; } else tail[k] = 0; }
    const week = k => ((light[k] || 0) * 2 > (all[k] || 0) && (k < cur || (light[k] || 0) >= 2)) || (tail[k] || 0) >= 2;
    let b = null; for (const x of s.sessions) if (x.date >= from && lighter(x.id) && week(L.weekStart(x.date)) && (!b || x.date > b)) b = x.date;
    rls[days] = { r52: rest(a, s.settings.restWeeks || []), r53: rest(b, [...(s.settings.restWeeks || []), ...(s.deloadWeek && !all[s.deloadWeek] ? [s.deloadWeek] : [])]) };
  }
  const rl = !rls[28].r52 !== !rls[28].r53;
  const differs = (p, q) => p.sets !== q.sets || p.repMin !== q.repMin || p.repMax !== q.repMax;
  let plan = false, planStall = false;
  for (const id of new Set(s.sessions.flatMap(x => x.ex.map(b => b.exId)))) {
    for (const R of s.routines) if (!R.days.some(d => d.items.some(it => it.exId === id)) && differs(L.planFor(id, R), L.defPlan(id))) plan = true;
    if (I.exStats[id] && I.exStats[id].stalled && differs(L.planFor(id), L.defPlan(id))) planStall = true;
  }
  // prOff: the lifts this build reads as not stalled that have a PR, on a session left out of the stall's stretch (trimmed or done lighter), in
  // its range since the third-last session of the stretch (the fifth review: a PR is a PR whenever it happens; on a lift with a reading, one
  // Recent PRs lists, the sixth review), each with the muscles it trains. r52 left those PRs out with their sessions, so it can read such a lift stalled; read here from this build's analytics, the
  // stretch as idxLiftIn takes it (its last sessions with a reading when 4 or more have one, else all of them for the count test).
  const prOff = {};
  const off = x => !!(x.deload || x.light || x.cut || x.auto), sameR = (a, b) => !a || !b || (a[0] === b[0] && a[1] === b[1]);
  for (const id in I.byEx) {
    const xs = I.byEx[id], real = xs.filter(x => !off(x));
    if (!real.length || !I.exStats[id] || I.exStats[id].stalled) continue;
    const rr = real[real.length - 1].rr, inR = real.filter(x => sameR(x.rr, rr)), wE = inR.filter(x => x.tv != null);
    const base = wE.length >= 4 ? wE : wE.length < 2 && inR.length >= 4 ? inR : null;
    if (!base) continue;
    const from = base[base.length - 3].date;
    if (xs.some(x => off(x) && sameR(x.rr, rr) && x.date >= from && (base === wE ? I.prs.some(p => p.big && p.sid === x.sid && p.exId === id) : x.progress))) { try { const e = L.EX(id); prOff[id] = [e.primary, ...(e.secondary || [])]; } catch (e) { prOff[id] = []; } }
  }
  return { full, injury, tagged: [...tagged], rls, rl, plan, planStall, prOff };
}

// The coach as r53 changes it on purpose, else the same (r52's and r53's
// answers, each from coach()), the stall tip read in r53's words: where the lighter-week test answers one way
// in one build and the other in the other (rl), a deload suggested in one
// and not the other, the side with no lighter week suggesting it; where a
// stalled lift on no day of the routine is read at its own range
// (planStall), the same lift named by both.
function coachSame(a, b, t) {
  // The stall tip's words changed in r53 (what is left out of a stall, and a PR on any day, read as r53 reads them); the same advice otherwise.
  const tip = c => (c && typeof c.why === 'string' ? { ...c, why: c.why.replace('Flat or down over its last 6 sessions (or 3 weeks), with no PR in the last 3, no heavier load, and no more reps at the same load, leaving out deload, lighter, and trimmed sessions.', 'Flat or down over its last 6 sessions in this rep range (or 3 weeks), leaving out ones where it was trimmed or done lighter than usual, and, on a lighter day, in a deload, or on an exercise made lighter, ones with fewer reps or sets than usual; with no PR in the last 3 of them, nor a set stronger than any before it in a session left out since the third-last, no heavier load, and no more reps at the same load.') } : c);
  if (ser(tip(a)) === ser(b)) return true;
  const dl = c => !!c && /main lifts stalled at once/.test(c.text);
  if (t.rl && dl(a) !== dl(b) && dl(b) === !t.rls[28].r53) return true;
  const lift = c => c && c.act && c.act.sec === 'exercise' && c.act.ex;
  return !!t.planStall && !!lift(a) && lift(a) === lift(b);
}

// Lighter and deload sessions done lighter than the lift's last full
// sessions, as they are in the gym. A generator draws each session's loads
// and reps on their own, so a lift on a day tagged lighter was often at or
// over its usual, which since r53 makes it a full session for that lift,
// reaching everything read from the log. tests/r36.js and tests/r53w.js
// compare builds on what r53 does not change, so before a history is used
// each tagged lift that is not trimmed is made lighter than its last three
// full sessions in the same range (sessions with no range on record match
// any, as sameRR has it), in the order the app sorts sessions (sessCmp):
// 85% of the lightest of their top loads where every one had a load, no
// added load where one had none, 5 kg more help than their most on an
// assisted lift, and a fifth fewer reps than their fewest a set, at least
// 1. A lift with no full
// session before it is left as drawn, as r53 leaves its label alone. The
// sessions are changed in place and returned. The suites still count the
// histories where a lift counts in full regardless (a set of 1 cannot lose
// a fifth), from the page's own reading (r53Touches).
function honestTags(sessions) {
  // The sets IDX reads a session by: the working sets less drop sets, or the drop sets when there is nothing else.
  const work = q => !q.warm && +q.r > 0;
  const same = (a, b) => !a || !b || (a[0] === b[0] && a[1] === b[1]);
  const ord = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.t || 0) - (b.t || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  const full = {};
  for (const x of ord) for (const b of x.ex) {
    const all = b.sets.filter(work), main = all.filter(q => !q.drop), ws = main.length ? main : all;
    if (!(x.deload || x.light || b.light)) { if (!b.cut && ws.length) (full[b.exId] = full[b.exId] || []).push({ rr: b.rr, ws }); continue; }
    const ref = (full[b.exId] || []).filter(q => same(q.rr, b.rr)).slice(-3);
    if (b.cut || !ref.length) continue;
    const top = Math.min(...ref.map(q => Math.max(...q.ws.map(z => +z.w || 0))));
    const most = Math.min(...ref.map(q => Math.min(...q.ws.map(z => +z.w || 0))));
    const minR = Math.min(...ref.map(q => Math.min(...q.ws.map(z => +z.r))));
    for (const q of b.sets) { q.w = top > 0 ? top * 0.85 : top === 0 ? 0 : most - 5; q.r = Math.max(1, Math.floor(minR * 0.8)); }
  }
  return sessions;
}

// Shared by tests/r53w.js (against r52) and tests/r36.js (against r35).
// The lifts whose stall r53 can lift on purpose: those a flagged injury loads, and those with a PR on a session left out of the stall since
// the third-last session of its stretch (r53Touches, prOff), each with the muscles it trains. A lift of the second kind is not stalled here
// by construction, so the allowance below is only ever the earlier build stalled and this build not.
const freed = (t, inj) => ({ ids: [...inj.ids, ...Object.keys(t.prOff).filter(id => !inj.ids.includes(id))], mus: { ...t.prOff, ...inj.mus } });
// IDX as r53 changes it (x the earlier build's, r52's or r35's, y this build's, both decoded and changed here).
function idxSame(x, y, t, inj) {
  const tagged = new Set(t.tagged); const before = y.prs.length;
  y.prs = y.prs.filter(p => !tagged.has(p.sid + '\t' + p.exId));
  const touched = new Set();
  for (const id of inj.ids) { if (x.exStats[id] && x.exStats[id].stalled) for (const m of inj.mus[id]) touched.add(m); for (const I of [x, y]) if (I.exStats[id]) delete I.exStats[id].stalled; }
  // A muscle the earlier build read as lagging only through a freed lift's stall moves the coach's order of muscles below target (lag).
  const lag = x.scores.some(q => touched.has(q.m) && q.label === 'lagging');
  for (const I of [x, y]) I.scores = I.scores.filter(q => !touched.has(q.m));
  return { same: ser(x) === ser(y), out: before - y.prs.length, lag };
}
// The coach as r53 changes it: coachSame; or a freed lift's stall named in the earlier build's answer and in no stall message here,
// or, where such a stall made a muscle read lagging there (lag), the same muscles below target taken in another order: both answers about
// volume, with as many more below target. (When a deload is suggested or held back, or a freed lift's stall is no longer named, what
// the coach says instead is its next branch, which this suite cannot read without writing the coach again; tests/r53.js holds those cases.)
function coachOk(x, y, t, inj, names, lag) {
  if (coachSame(x, y, t)) return true;
  const below = c => { const k = c && /(\d+) more (below|above) target/.exec(c.text); return k ? k[1] + ' ' + k[2] : '0'; };
  if (lag && x && y && x.act && y.act && x.act.sec === 'volume' && y.act.sec === 'volume' && below(x) === below(y)) return true;
  const dl = c => !!c && /main lifts stalled at once/.test(c.text);
  const one = c => (c && c.act && c.act.sec === 'exercise' && /has stalled|top of its range/.test(c.text) ? c.act.ex : null);
  const namesInjured = c => (dl(c) && inj.ids.some(id => c.text.includes(names[id]))) || inj.ids.includes(one(c));
  return inj.ids.length > 0 && namesInjured(x) && !namesInjured(y);
}
const less = (a, ids) => a.filter(id => !ids.includes(id));

module.exports = { rng, wide, digest, decode, ser, err, specOf, r53Touches, coachSame, honestTags, freed, idxSame, coachOk, less, MIDNIGHT_KEYS, midnightRun, STALE_CASES, staleRun, demoRun };
