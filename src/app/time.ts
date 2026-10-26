/* How long a session takes (phase 3b, r52; moved from the legacy script): the time model for a day's
   plan, the same model for the sets a past session logged, and your pace,
   the median of how long your timed sessions took against that model. They
   call each other (a day's minutes scale by the pace, which reads past
   sessions' minutes), so they share one module. */

import type { PlanItem, Session } from './types';
import type { Model } from './model';
import { EXIn, activeRoutineIn, sortedSessionsIn } from './model';
import { PACE_DAYS, PACE_HI, PACE_LO, PACE_MIN, PACE_N, setSecs, setupSecs } from './formulas';
import { isCompound } from './library';
import { basePlanIn } from './routines';
import { addDays, MINUTE_S } from './util';

/** A planned exercise as the time model reads it: its sets, range, rest and superset link. */
type TimedItem = Pick<PlanItem, 'exId' | 'sets' | 'repMin' | 'repMax' | 'rest'> & { ss?: string | null | undefined };

/* half: a lighter or deload session, which runs half the sets (rounded up).
   raw: the model alone, without your pace (pace() compares with it). */
/** The minutes a day's plan takes by the time model, at your pace unless raw. */
export function dayMinutesIn(M: Model, day: { items: readonly TimedItem[] }, half?: boolean, raw?: boolean): number {
  if (!day.items.length) return 0;
  let s = 0,
    cN = 0;
  day.items.forEach((it, i) => {
    const ex = EXIn(M, it.exId);
    const nx = day.items[i + 1];
    const rest = it.ss && nx && nx.ss === it.ss ? 0 : +it.rest;
    const n = half ? Math.max(1, Math.ceil(it.sets / 2)) : +it.sets;
    s += n * (setSecs(ex, it) + rest) + setupSecs(ex, cN);
    if (isCompound(ex)) cN++;
  });
  const lastRest = +day.items[day.items.length - 1].rest || 0;
  return Math.round((Math.max(0, s - lastRest) * (raw ? 1 : paceIn(M))) / MINUTE_S);
}

/* Your own pace (r43, V): how long your sessions take against the time model,
   so every estimate (Today, Plan, a session's minutes left, Short on time,
   Pick for me, the recap) follows what your sessions actually take. Each
   timed session in the last PACE_DAYS days is compared with the model for
   the sets it logged (its own rep ranges, the plan's rest), newest first, up
   to PACE_N of them; the median ratio is the pace, so one long or short day
   does not move it. A session at under a third or over three times its model
   is a clock left running or stopped early and is left out. Fewer than
   PACE_MIN usable sessions: the model as is (1). Conventions, not measured
   numbers: the model itself is one. Past workouts and imports have no time,
   so they never count. */
/** The minutes the time model gives for the sets a session logged, at its own ranges and the plan's rest. */
export function sessModelMinIn(M: Model, ss: Session): number {
  const R = M.s.routines.find(r => r.id === ss.routineId) || activeRoutineIn(M);
  // Superset links come from the day's plan, so partners rest once, as every
  // estimate counts them (the r43 review: without it a lifter who supersets
  // read about 30% faster than the model and every estimate came out short).
  const day = ss.dayId ? R.days.find(d => d.id === ss.dayId) : null;
  const link = (id: string): string | null => {
    const it = day && day.items.find(i => i.exId === id);
    return (it && it.ss) || null;
  };
  // plain (r44 review): a goal set later must not change how long a past session is read to have taken.
  const items = ss.ex
    .map(b => {
      const p = basePlanIn(M, b.exId, R, ss.dayId, true);
      const rr = Array.isArray(b.rr) ? b.rr : [p.repMin, p.repMax];
      return {
        ...p,
        exId: b.exId,
        ss: link(b.exId),
        repMin: rr[0],
        repMax: rr[1],
        rest: +p.rest || 0,
        sets: b.sets.filter(x => !x.warm).length
      };
    })
    .filter(it => it.sets > 0);
  return items.length ? dayMinutesIn(M, { items }, false, true) : 0;
}

/* Each timed session's minutes against its model, newest first, the ones the
   pace reads. A session with no time is skipped: an absent time compares
   false with 1, which the cast lets TypeScript accept, and past that test
   the time is there, as the ! says. */
export function paceRatiosIn(M: Model): number[] {
  const from = addDays(M.today(), -PACE_DAYS);
  const out: number[] = [];
  const sameDay: Record<string, number> = {};
  for (const x of M.s.sessions) sameDay[x.date] = (sameDay[x.date] || 0) + 1;
  for (const ss of sortedSessionsIn(M).slice().reverse()) {
    if (out.length >= PACE_N || ss.date < from) break;
    if (ss.demo || !((ss.durMin as number) >= 1)) continue;
    const m = sessModelMinIn(M, ss);
    if (m < 1) continue;
    // Cardio done before or after lifting is timed with the session but is not
    // in the model (the r43 review); taken off when the day had one session.
    const cm =
      sameDay[ss.date] === 1
        ? M.s.cardio
            .filter(c => c.date === ss.date && (c.when === 'pre' || c.when === 'post'))
            .reduce((a, c) => a + (+c.min || 0), 0)
        : 0;
    const r = (ss.durMin! - cm) / m;
    if (r >= PACE_LO && r <= PACE_HI) out.push(r);
  }
  return out;
}

/** Your pace: the median ratio of your timed sessions to the model, or 1 with too few; built once per change. */
export function paceIn(M: Model): number {
  if (M.c._pace != null) return M.c._pace;
  const r = paceRatiosIn(M).sort((a, b) => a - b);
  if (r.length < PACE_MIN) return (M.c._pace = 1);
  const k = r.length >> 1;
  return (M.c._pace = r.length % 2 ? r[k] : (r[k - 1] + r[k]) / 2);
}
