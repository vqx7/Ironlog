/* The numbers the engine and the analytics share: the 1RM estimate and its
   inverses, the working load of a session, set counting, the time model, and
   the thresholds behind trends, breaks and the per-session cap (phase 2, r50;
   moved unchanged from the legacy script, tests/moved.js holds them to r49's
   code). Each is a pure function of its arguments. Where a number comes from
   is said beside it; CLAUDE.md's Evidence base has the sources. */

import type { Exercise, LoggedSet, Point } from './types';
import { isNum } from './util';
import { isCompound } from './library';

/* ---------- the 1RM estimate ---------- */

// Estimates stop at 12 reps to failure: past that the formulas spread too far to trust.
export const E1_MAX_REPS = 12;

/* The one 1RM estimate used everywhere: trends, PRs, live badges, targets,
   load suggestions and the CSV. It works on reps to failure (RTF): reps plus
   logged RIR, a blank RIR counting as 0 (so the estimate errs low).
   - Brzycki up to 10 RTF: load x 36/(37 - RTF). Exactly the load at 1 RTF.
   - Epley for 11 and 12 RTF: load x (1 + RTF/30). The two meet at 10 RTF, so
     the curve has no jump. Epley alone read a double as 6.7% above a single.
   - Nothing past 12 RTF: the spread between people and in RIR calls grows
     too wide there (Nuzzo 2024, Halperin 2022).
   - A set called at more than 4 RIR is left out rather than read as 4.
   No correction is made per exercise: nothing in the evidence base (CLAUDE.md)
   establishes how a formula errs on a given lift, so the number is shown as
   an estimate everywhere (fmtE, "Est. 1RM") rather than adjusted. */
export const E1_MAX_RIR = 4;

/** A RIR as typed: a number, a numeric string, or blank. */
type Rir = number | string | null | undefined;

/** Reps to failure: reps plus the RIR called (blank as 0), or null past E1_MAX_RIR. */
export function rtfOf(r: number | string, rir?: Rir): number | null {
  const q = rir == null || rir === '' || !isFinite(+rir) ? 0 : Math.max(+rir, 0);
  return q > E1_MAX_RIR ? null : +r + q;
}

export function e1(load: number, r: number, rir?: Rir): number | null {
  if (!(load > 0 && r > 0)) return null;
  const rtf = rtfOf(r, rir);
  if (rtf == null || rtf > E1_MAX_REPS) return null;
  return rtf <= 10 ? load * 36 / (37 - rtf) : load * (1 + rtf / 30);
}

/* The reading a lift's trend is drawn from (r30): e1() up to 12 reps to
   failure, then Epley up to 20. Past 12 the formulas spread too far to state
   a 1RM, but one lift compared with itself at similar reps still shows which
   way it is going, so a leg press done for 15 is not left without a trend.
   Never shown as a 1RM. */
export function trendE(load: number, r: number, rir?: Rir): number | null {
  if (!(load > 0 && r > 0)) return null;
  const rtf = rtfOf(r, rir);
  if (rtf == null) return null;
  return rtf <= E1_MAX_REPS ? e1(load, r, rir) : rtf <= 20 ? load * (1 + rtf / 30) : null;
}

/* For picking a load only, never shown (r31): the estimate up to 12 reps to
   failure, then Epley to 30. With the 12-rep limit, a set of 25 or a set of
   12 with 5 in reserve had no estimate, so a beginner who started light got
   one 5 lb step a session for months. Past 12 it is rough, which is why the
   jump stays capped. */
export function fitE(load: number, r: number, rir?: Rir): number | null {
  const v = e1(load, r, rir);
  if (v != null) return v;
  if (!(load > 0 && r > 0)) return null;
  const q = rir == null || rir === '' ? 0 : Math.min(Math.max(+rir, 0), E1_MAX_RIR);
  const t = +r + q;
  return t <= 30 ? load * (1 + t / 30) : null;
}

/* The load that leaves a given number of reps to failure at an estimated 1RM:
   the inverse of e1(). Past 12 RTF it keeps using Epley, only to pick loads. */
export function e1inv(est: number, rtf: number): number {
  return rtf <= 10 ? est * (37 - rtf) / 36 : est / (1 + rtf / 30);
}

/* Reps to failure a load allows at an estimated 1RM, the inverse the other way. */
export function rtfAt(est: number, load: number): number | null {
  if (!(est > 0 && load > 0)) return null;
  const b = 37 - 36 * load / est;
  return b <= 10 ? b : 30 * (est / load - 1);
}

/* Rep band for PR comparisons: estimates from triples and from sets of 12 are
   not interchangeable, so a best is judged within its own band. */
export const rtfBand = (rtf: number): 1 | 2 | 3 => rtf <= 5 ? 1 : rtf <= 10 ? 2 : 3;

/* A rep PR counts at 90% or more of the strongest set before it (r30, a convention). */
export const REP_PR_SHARE = 0.9;

/* ---------- sets and sessions ---------- */

/** A working set: not a warm-up, and reps done. */
export const isWork = (s: Pick<LoggedSet, 'warm'> & { r: number | string }): boolean => !s.warm && +s.r > 0;

/** A set's weight in a weekly count: a drop set counts half. */
export const setCredit = (s: Pick<LoggedSet, 'drop'>): number => s.drop ? 0.5 : 1;

/* Two planned rep ranges match when equal, or when either is unknown (sessions
   logged before rep ranges were recorded). */
export function sameRR(a: readonly [number, number] | null | undefined, b: readonly [number, number] | null | undefined): boolean {
  return !a || !b || (a[0] === b[0] && a[1] === b[1]);
}

/* The working load of one session of a lift (r31): the load done for the
   most sets, the heavier on a tie, among loads at 60% or more of the
   session's heaviest (unmarked warm-ups sit lower). A heavy top set, or a
   pair of them, before back-off sets is a top set: it counts for bests and
   PRs, while the next target, the grey reps and the trend build on the
   back-off sets the session was made of. The review tried each rule in
   turn: "heaviest done twice" read two singles at 405 before 335 x 5 x 5 as
   the work, and "heaviest near the range" read one 365 x 4 before 335 x 5 x 5
   as five sets due at 365. Straight sets, ramps to a load, and pyramids
   (one set at each load, so the heaviest) read as before. repMin is kept
   for callers; the rule does not need it. Assisted lifts store less help as
   a higher number, so the heaviest is still the hardest. */
export function workLoad(pts: readonly Point[], _repMin?: number): number {
  if (!pts.length) return 0;
  /* The 60% is of the total moved (load, which adds the bodyweight share on
     a pull-up or dip), not of the number typed: +25 on a 180 lb pull-up is
     89% of +50, not half (the review saw +50 prescribed for every set). */
  const T = (p: Point): number => p.load != null ? p.load : p.w;
  const top = Math.max(...pts.map(T));
  const floor = top > 0 ? top * 0.6 : -Infinity;
  const ok = (p: Point): boolean => T(p) >= floor - 1e-9;
  const k = (v: number): number => Math.round(v * 1000);
  const n = new Map<number, number>();
  for (const p of pts) if (ok(p)) n.set(k(p.w), (n.get(k(p.w)) || 0) + 1);
  /* w is null only until the first set at or over the floor, which always
     sets it (its count beats -1), so the comparison never meets a null. The
     cast says so to TypeScript and is not code. */
  let w: number | null = null, best = -1;
  for (const p of pts) {
    if (!ok(p)) continue;
    const c = n.get(k(p.w)) as number;
    if (c > best || (c === best && p.w > (w as number))) { best = c; w = p.w; }
  }
  return w == null ? Math.max(...pts.map(p => p.w)) : w;
}

/** The sets at a load (within a millionth, as loads are stored in kg). */
export const atLoad = <P extends Pick<Point, 'w'>>(pts: readonly P[], w: number): P[] => pts.filter(p => Math.abs(p.w - w) < 1e-6);

/* The floor for reps that set targets and grey reps (r32): one set under
   the range among two or more is read at the bottom of the range. With more
   of them under it, the load was heavy that day or too heavy, and the drop
   below the range (or the way back to it) handles that. */
export function repFloor(pts: readonly Pick<Point, 'r'>[], repMin: number | string | null | undefined): (r: number) => number {
  // No range reads as 0: +undefined is NaN, and NaN || 0 is 0 (the cast tells TypeScript so).
  const m = +(repMin as number) || 0;
  const ok = m > 0 && pts.length >= 2 && pts.filter(p => p.r < m).length === 1;
  return r => ok ? Math.max(r, m) : r;
}

/** The marks a session can carry that keep it from setting targets and trends. */
type SessionMarks = { deload?: boolean; light?: boolean; cut?: boolean; auto?: boolean } | null | undefined;

/* One test for a session that is lighter or shorter on purpose (tagged), or
   also read as lighter from its loads (offSession): neither sets a target, a
   trend or a stall (r31: written out by hand in six places, which could
   drift). IDX uses tagged() while it is still deciding which are read as
   lighter. */
export const tagged = (x: SessionMarks): boolean => !!x && !!(x.deload || x.light || x.cut);
export const offSession = (x: SessionMarks): boolean => tagged(x) || !!(x && x.auto);

/* ---------- load steps ---------- */

/* When every set reaches the top of the range, the load goes up by whole
   multiples of the smallest step you can add, sized to about 2.5% of the
   load on compound lifts and 5% on isolation lifts (the engine's progStep).
   The jump can be set per exercise in a routine (plan.jump, r30, V: "the
   progression should be overridable in the planner"): a percent of the load,
   rounded down to whole load steps and never less than one step; 0 means
   always one step. Unset, it is the 2.5% or 5%. */
export function jumpPct(ex: Parameters<typeof isCompound>[0], plan: { jump?: number | string | null } | null | undefined): number {
  return plan && plan.jump != null && isNum(+plan.jump) ? Math.max(0, +plan.jump) / 100 : isCompound(ex) ? 0.025 : 0.05;
}

/* Most a single session's easy RIR may raise the load: 10%, or 15% on an
   isolation lift under 20 kg, where one plate or dumbbell step is a large
   fraction. One rep of RIR error is normal, so bigger jumps overshoot. */
/* early: a lift's first 3 sessions, which may jump 25% (r31). */
export function jumpCap(ex: Parameters<typeof isCompound>[0], loadKg: number, early?: boolean): number {
  return early ? 1.25 : !isCompound(ex) && loadKg < 20 ? 1.15 : 1.10;
}

/* Back after more than 4 weeks off a lift (a convention, r34.2, from the
   review: after 6 weeks away the app asked for the next load up, as if no
   time had passed). Strength holds for about 4 weeks without training and
   falls faster after (Bosquet 2013, a meta-analysis of training cessation),
   so the first session back is about 90% of the last working load, in whole
   steps, like a Lighter day but with the usual sets; the session after it
   picks up from the last full session. */
export const BACK_DAYS = 28;

/* ---------- trends ---------- */

/* Percent change over the trend window below which a muscle is treated as flat
   rather than moving. Weak points and Return on volume both read this, so the
   two sections can no longer describe the same number differently. */
// 3%: day-to-day swings in estimated 1RM run 2 to 8% (Sigvaldsen 2023), so a
// 1% change is noise. A lift is also only called moving or falling when its
// fitted slope is clear of zero (see IDX).
export const GROW_PCT = 3;

/* The 0.90 quantile of Student's t, for the two-sided 80% interval of a fitted
   slope with n-2 degrees of freedom. The normal value (1.2816) was used
   before; with 3 to 6 sessions the interval came out up to 2.4 times too
   narrow, so noise was called a trend. Past 30 degrees of freedom the
   approximation below is within 0.001 of the table. */
export const T90: readonly number[] = [NaN, 3.078, 1.886, 1.638, 1.533, 1.476, 1.440, 1.415, 1.397, 1.383, 1.372, 1.363, 1.356, 1.350, 1.345, 1.341, 1.337, 1.333, 1.330, 1.328, 1.325, 1.323, 1.321, 1.319, 1.318, 1.316, 1.315, 1.314, 1.313, 1.311, 1.310];

export function t90(df: number): number {
  df = Math.floor(df);
  if (!(df >= 1)) return T90[1] as number;
  return df <= 30 ? (T90[df] as number) : 1.2816 + 0.8521 / df;
}

/* ---------- time ---------- */

/* Time estimate, worded by estMin ("~75 min") wherever it shows. Per set: 40 s up to 12
   reps and 3 s for each rep past that (middle of the planned range), twice
   that plus 15 s to switch for a lift done one side at a time, the hold plus
   20 s for a timed hold; then its rest (none between superset partners).
   Warm-up and setup: 5 min for each of the first two compound lifts, 3 for
   later compounds, 1 for isolation work. The rest after the final set is
   never taken, so it is dropped. (The rests are added by dayMinutes in the
   analytics.) */
export function setSecs(ex: Pick<Exercise, 'timed' | 'perSide'>, p: { repMin: number | string; repMax: number | string }): number {
  const mid = ((+p.repMin || 0) + (+p.repMax || 0)) / 2;
  let t = ex.timed ? mid + 20 : 40 + 3 * Math.max(0, mid - 12);
  if (ex.perSide) t = t * 2 + 15;
  return t;
}

export function setupSecs(ex: Parameters<typeof isCompound>[0], compoundsBefore: number): number {
  return isCompound(ex) ? (compoundsBefore < 2 ? 300 : 180) : 60;
}

/** Your pace (r43): pace() in the analytics compares your timed sessions with
    the time model above. It reads the newest PACE_N in the last PACE_DAYS
    days, needs PACE_MIN of them, and leaves out a session at under PACE_LO or
    over PACE_HI times its model (a clock left running or stopped early).
    Conventions; the comment on pace() says the rest. */
export const PACE_N = 8, PACE_DAYS = 84, PACE_MIN = 3, PACE_LO = 1 / 3, PACE_HI = 3;

/* Per-session volume per muscle, counted the same way as weekly volume
   (direct 1, secondary 0.5). Weekly bands cannot see a once-a-week split
   putting 17 sets on one muscle in one session. The per-session
   meta-regression (Remmert 2025, a preprint from the group behind the weekly
   dose-response paper, Pelland 2025) could not detect extra growth past about
   11 fractional sets for one muscle in a session, so more than 11 is flagged
   as a likely place to move sets to another day. Advisory, a convention. */
export const SESSION_CAP = 11;
