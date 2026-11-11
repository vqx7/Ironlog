/* Reading a set (CL-1, split from analytics.ts): its effort as RIR (typed, a RIR check, or the lift's usual), the
   RIR checks' calibration, whether it was hard, the bodyweight it is read with, and its load, PR load and weight
   lifted. Each function that reads the log, the date or a cache takes the model first (model.ts). */
import type { Bodyweight, Rir } from './types';
import type { CalStats, CalSummary, ExerciseLike, Model } from './model';
import { bwShare, isCompound, loadMode } from './library';
import { addDays, median, WEEK_DAYS } from './util';
import { EXIn, rirHalfOnIn } from './model';
import { isWork, setCredit, E1_MAX_RIR, HARD_RIR, HALF_SET } from './formulas';

import { EFFORT_TOP } from './records';
/** A set's effort as these read it: its RIR as typed, and whether it was a RIR check. */
type Effort = { rir?: Rir; cal?: unknown };

/** A set as the hard-set count reads it: a working set's reps, marks and effort. */
type CountedSet = Effort & { r: number | string | null; warm?: boolean | undefined; drop?: boolean | undefined };

/** A set's load and reps as typed, as the load and tonnage read them. */
export type LoadedSet = { w?: number | string | null | undefined; r?: number | string | null | undefined };

/** The bodyweight logged on or before a date, or null. */
function bwKnownAtIn(M: Model, date: string): number | null {
  let best: Bodyweight | null = null;
  for (const b of M.s.bodyweights) if (b.date <= date && (!best || b.date >= best.date)) best = b;
  return best ? best.kg : null;
}

/** The bodyweight on a date: the last on or before it, else the first logged, or null. */
export function bwAtIn(M: Model, date: string): number | null {
  let best: Bodyweight | null = null,
    earliest: Bodyweight | null = null;
  for (const b of M.s.bodyweights) {
    if (b.date <= date && (!best || b.date >= best.date)) best = b;
    if (!earliest || b.date < earliest.date) earliest = b;
  }
  // One of the two is set whenever the test passes, as the ! says.
  return best || earliest ? (best || earliest)!.kg : null;
}

/* RIR as the analytics read it. Off: ignored everywhere, so every working set
   counts as hard and estimates use reps alone. On: as logged. Corrected: as
   logged, shifted by the median error of your recent calibration sets once
   there are at least two. The log itself is never changed, so switching modes
   is fully reversible. A calibration set is logged to failure and is never
   shifted. */
/* The correction is only applied to sets called at RIR 4 or less, because
   calibration sets measure the error close to failure, and a compound lift
   uses compound calibration sets when there are two or more (isolation
   likewise), else all of them. */
export function rirEffIn(M: Model, s: Effort, ex?: ExerciseLike | null): number | null {
  const m = M.s.settings.rirMode;
  if (m === 'off') return null;
  if (s.rir == null || s.rir === '') return null;
  const v = +s.rir;
  if (!isFinite(v)) return null;
  if (m === 'cal' && !s.cal && v <= E1_MAX_RIR) {
    const c = calStatsIn(M);
    const k = ex ? (isCompound(ex) ? 'c' : 'i') : null;
    const src = k && c.cls[k].recent >= CAL_MIN ? c.cls[k] : c;
    if (src.recent >= CAL_MIN && src.bias) return Math.min(EFFORT_TOP, Math.max(0, v + src.bias));
  }
  return v;
}

/* Calibration sets across your real sessions. err is reps actually left at the
   stopping point minus reps you called: positive means you stop with more in
   the tank than you think. People mostly under-call it by about a rep
   (Halperin 2022). The correction is the median of the last CAL_N from the
   past CAL_WEEKS weeks, shrunk toward zero while there are few (x
   n/(n+CAL_SHRINK): 40% at 2 sets, 73% at 8), rounded to half a rep and capped
   at CAL_CAP reps either way; it applies once CAL_MIN checks are in, to sets
   called at E1_MAX_RIR or less, where the checks measure the error. Conventions. */
/** The RIR calibration's numbers, above. */
export const CAL_WEEKS = 12,
  CAL_N = 8,
  CAL_SHRINK = 3,
  CAL_CAP = 2,
  CAL_MIN = 2;

/** The RIR checks of a list summed up: how many, their median error, the correction, the mean error. */
function calSummary(list: readonly { err: number }[]): CalSummary {
  const last = list.slice(-CAL_N);
  const n = last.length;
  const med = n ? median(last.map(p => p.err)) : null;
  const shr = med == null ? 0 : (med * n) / (n + CAL_SHRINK);
  // Rounded to the nearest half rep symmetrically: Math.round sends x.5 up,
  // which made +1.5 and -1.5 shrink to +1 and -0.5.
  return {
    recent: n,
    raw: med,
    bias: Math.max(-CAL_CAP, Math.min(CAL_CAP, (Math.sign(shr) * Math.round(Math.abs(shr) * 2)) / 2)),
    mae: n ? last.reduce((a, p) => a + Math.abs(p.err), 0) / n : null
  };
}

/** Every RIR check in the log, and those of compound and isolation lifts apart, built once per change. */
export function calStatsIn(M: Model): CalStats {
  if (M.c._cal) return M.c._cal;
  const pts: { date: string; err: number; c: 'c' | 'i' }[] = [];
  for (const s of M.s.sessions) {
    if (s.demo) continue;
    for (const b of s.ex) {
      const c = isCompound(EXIn(M, b.exId)) ? 'c' : 'i';
      for (const x of b.sets)
        if (x.cal && +x.r >= x.cal.at) pts.push({ date: s.date, err: +x.r - x.cal.at - x.cal.pred, c });
    }
  }
  pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cut = addDays(M.today(), -WEEK_DAYS * CAL_WEEKS);
  const rec = pts.filter(p => p.date >= cut);
  M.c._cal = {
    ...calSummary(rec),
    n: pts.length,
    lastDate: pts.length ? pts[pts.length - 1].date : null,
    cls: { c: calSummary(rec.filter(p => p.c === 'c')), i: calSummary(rec.filter(p => p.c === 'i')) }
  };
  return M.c._cal;
}

/** A lift's usual RIR is read once it has RIR_USUAL_MIN rated working sets in the last CAL_WEEKS weeks (r20, a convention). */
export const RIR_USUAL_MIN = 3;

/* A blank RIR, for estimates and the hard-set count. RIR is optional and
   opened with a tap, so most logs mix rated and blank sets. Reading every
   blank as 0 made the same 100 x 8 estimate lower when left blank than when
   rated 2, so trends dipped, stalls were flagged and PRs appeared just from
   whether RIR was tapped. A blank is instead read as your usual RIR on that
   lift: the median of your rated working sets of it (not warm-ups, drop sets
   or RIR checks) in the last 12 weeks, once there are at least 3. That is a
   convention, not a study figure. With fewer, a blank counts as hard and as 0
   for estimates, which errs low and never inflates a PR. Recovery and the
   "that load was light" step read only the RIR you entered, since both act on
   what you said about effort. RIR off: no ratings are read at all.
   Object.create(null) is typed any, so the two casts name the maps it makes;
   the median of three or more numbers is a number, as the ! says. */
export function rirUsualIn(M: Model, exId: string): number | null {
  if (M.s.settings.rirMode === 'off') return null;
  if (!M.c._rirUse) {
    M.c._rirUse = Object.create(null) as Record<string, number>;
    const cut = addDays(M.today(), -WEEK_DAYS * CAL_WEEKS);
    const by = Object.create(null) as Record<string, number[]>;
    for (const ss of M.s.sessions) {
      if (ss.date < cut) continue;
      for (const b of ss.ex) {
        const ex = EXIn(M, b.exId);
        if (ex.timed) continue;
        for (const x of b.sets) {
          if (!isWork(x) || x.drop || x.cal) continue;
          const q = rirEffIn(M, x, ex);
          if (q != null) (by[b.exId] || (by[b.exId] = [])).push(q);
        }
      }
    }
    for (const k in by) if (by[k].length >= RIR_USUAL_MIN) M.c._rirUse[k] = median(by[k])!;
  }
  const v = M.c._rirUse[exId];
  return v == null ? null : v;
}

/** A set's RIR as read, else the lift's usual RIR for a blank, else null. */
export const rirEstIn = (M: Model, s: Effort, ex?: ExerciseLike | null): number | null => {
  const q = rirEffIn(M, s, ex);
  return q != null ? q : ex ? rirUsualIn(M, ex.id) : null;
};

/* Hard set: RIR HARD_RIR or less (Robinson 2024, Refalo 2023: growth rises as sets
   end closer to failure; the exact cut-off is a convention). A blank RIR is
   read as above and shown as assumed. A drop set is half a set: one heavy
   set with three drops is not four sets of work. */
export const isHardIn = (M: Model, s: CountedSet, ex?: ExerciseLike | null): boolean => {
  if (!isWork(s)) return false;
  const q = rirEstIn(M, s, ex);
  return q == null || q <= HARD_RIR;
};

/* Count RIR 4 to 5 as half a set (r40, item 41; a setting, off by default).
   Any working set past RIR 3 counts half: calls top out at 5, but Corrected
   RIR can read a call of 4 as 5.5 or 6, and that set is no less hard than a
   call of 5 (the independent review of r40).
   Growth rises as sets end closer to failure (Robinson 2024), so sets a long
   way short still do something; half is a convention, not a measured dose.
   It moves the weekly hard sets, the bands they are read against and the
   plan's weekly sets, and nothing else: estimates, PRs, recovery and the
   per-session flag keep counting hard sets only. With RIR off every working
   set is hard already, so the setting has nothing to do. */
/** A set's weekly credit: a hard set's (a drop set half), or with RIR 4 to 5 as half a set on, half of it. */
export function hardCreditIn(M: Model, s: CountedSet, ex?: ExerciseLike | null): number {
  if (isHardIn(M, s, ex)) return setCredit(s);
  if (!rirHalfOnIn(M) || !isWork(s)) return 0;
  const q = rirEstIn(M, s, ex);
  return q != null && q > HARD_RIR ? setCredit(s) * HALF_SET : 0;
}

/** The bodyweight part of a bodyweight lift's load on a date (0 on any other lift). */
export function bwLoadIn(M: Model, ex: ExerciseLike | null | undefined, date: string): number {
  return ex && ex.bw ? (bwAtIn(M, date) || 0) * bwShare(ex) : 0;
}

/** The total a set moved: its load as typed plus, on a bodyweight lift, that day's bodyweight share. */
export function loadOfIn(M: Model, ex: ExerciseLike | null | undefined, s: LoadedSet, date: string): number {
  // A row with no load reads as 0: Number(null) is 0, and NaN || 0 is 0.
  return bwLoadIn(M, ex, date) + (Number(s.w) || 0);
}

/* PRs on a bodyweight lift are judged at one bodyweight: the latest
   weigh-in, the same for every session. Each set's load includes the
   bodyweight of its day, so a weigh-in 0.4 kg up made the same 8 pull-ups or
   12 leg raises a new PR every week (8 identical weeks, 10 PRs counted), and
   the bests board dated a record to the heaviest day, not the first. A PR on
   these lifts is now more reps or more added load than before, as lifters
   count them. Since r34 estimates, trends, charts and the load engine are
   read at the latest weigh-in too (see IDX's pts); weight lifted keeps each
   day's. */
export const bwRefIn = (M: Model): number =>
  M.c._bwRef !== undefined ? M.c._bwRef : (M.c._bwRef = bwAtIn(M, '9999-12-31') || 0);

// The bodyweight part of a bodyweight lift's load at the latest weigh-in: what the engine and every reading use.
export const bwRefLoadIn = (M: Model, ex: ExerciseLike | null | undefined): number =>
  ex && ex.bw ? bwRefIn(M) * bwShare(ex) : 0;

/** Whether a lift reads bodyweight while none is logged: its estimates would be of the added load alone, so it has
    none until a weigh-in (NEW-72, 2.29: +20 kg pull-ups read "Best estimate ≈ 28.9 kg ... total"), as its trend
    already waits (394; the Guide's Trends). Its reps, weight PRs and targets read as before. */
export const noBodyIn = (M: Model, ex: ExerciseLike | null | undefined): boolean =>
  !!ex && !!ex.bw && !(bwRefIn(M) > 0);

/** The load a set's PRs are judged at: on a bodyweight lift at the latest weigh-in, else loadOf. */
export function prLoadIn(M: Model, ex: ExerciseLike | null | undefined, s: LoadedSet, date: string): number {
  // A row with no load reads as 0, as in loadOfIn.
  return ex && ex.bw ? bwRefIn(M) * bwShare(ex) + (Number(s.w) || 0) : loadOfIn(M, ex, s, date);
}

/* Weight actually moved by one set, for weekly totals. */
export function tonnageIn(M: Model, ex: ExerciseLike, s: LoadedSet, date?: string): number {
  const m = loadMode(ex);
  // A row with no load or reps reads as 0, as in loadOfIn.
  const w = Number(s.w) || 0;
  // Assisted with no bodyweight logged would go below 0; weight lifted is then 0.
  /* Bodyweight known on or before the date only: a first weigh-in
     logged today used to be applied to every earlier session, so weight
     lifted in past weeks changed after the fact (4,420 to 6,634 kg). */
  const known = bwKnownAtIn(M, date || M.today());
  const bl = ex && ex.bw && known != null ? known * bwShare(ex) : 0;
  const load = m === 'bw' ? Math.max(0, bl + w) : m === 'each' || m === 'side' ? w * 2 : w;
  return load * (Number(s.r) || 0) * (ex.perSide ? 2 : 1);
}
