// Lifters built by kind for tests/r81b.js (from the independent review of 2.35's NEW-88 pass, 2026-11-08).
// cycling through the days, loads from `start` (kg per id) rising `step` every `stepEvery` sessions of the lift.
const iso = d => d.toISOString().slice(0, 10);
const add = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function lifter(o) {
  const unit = o.unit || 'kg';
  const src = o.restAfter ? o.days.flatMap(d => d.rest ? [d] : [d, ...Array.from({ length: o.restAfter }, () => ({ name: 'Rest', rest: true }))]) : o.days;
  const days = src.map((d, di) => ({ id: 'd' + di, name: d.name, rest: !!d.rest, items: (d.items || []).map(([exId, sets, repMin, repMax, rest = 120, rir = 2], k) => ({ uid: `u${di}_${k}`, exId, sets, repMin, repMax, rir, rest, inc: unit === 'kg' ? 2.5 : 2.2679618, ss: null })) }));
  const R = { id: 'r1', name: 'Main', schedule: o.weekly ? 'weekly' : 'cycle', days };
  const sessions = []; const lvl = {}; const cnt = {};
  const train = days.map((d, i) => i).filter(i => !days[i].rest && days[i].items.length);
  let k = 0;
  for (const date of o.dates) {
    const di = o.weekly ? ((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7) : train[k++ % train.length];
    const d = days[di]; if (!d || d.rest || !d.items.length) continue;
    const deload = o.deloadDates && o.deloadDates.includes(date);
    const ex = d.items.map(it => {
      const key = it.exId; cnt[key] = (cnt[key] || 0) + 1;
      if (lvl[key] == null) lvl[key] = (o.start && o.start[key]) || 40;
      const w0 = lvl[key] * (deload ? 0.9 : 1);
      if (!deload && cnt[key] % (o.stepEvery || 2) === 0) lvl[key] += (o.step && o.step[key]) || 2.5;
      const n = deload ? Math.ceil(it.sets / 2) : it.sets;
      const reps = o.reps ? o.reps(it, cnt[key]) : it.repMax;
      const rir = o.rir != null ? o.rir : 2;
      return { exId: it.exId, rr: [it.repMin, it.repMax], sets: Array.from({ length: n }, () => ({ w: Math.round(w0 * 100) / 100, r: reps, rir: deload ? 4 : rir, done: true })) };
    });
    sessions.push({ id: 's' + sessions.length, date, dayIdx: di, dayId: d.id, dayName: d.name + (deload ? ' (deload)' : ''), routineId: 'r1', notes: '', ex, ...(deload ? { deload: true } : {}), ...(o.durMin ? { durMin: o.durMin(d, date) } : {}) });
  }
  return { version: 5, exercises: o.exercises || [], routines: [R], activeRoutineId: 'r1', sessions, bodyweights: o.bodyweights || [], measurements: [], cardio: [], injuries: (o.injuries || []).map((m, i) => ({ id: 'j' + i, m, note: '', date: o.today })), draft: null, deloadWeek: o.deloadWeek || null, trash: [], settings: { unit, onboarded: true, ...(o.settings || {}) } };
}
// Every `every` days back from `end` (inclusive), n dates, oldest first.
const datesBack = (end, n, every) => Array.from({ length: n }, (_, i) => add(end, -every * (n - 1 - i)));
module.exports = { lifter, datesBack, add };
