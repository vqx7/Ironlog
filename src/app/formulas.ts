/* The numbers the engine and the analytics share: the 1RM estimate and its
   inverses, the working load of a session, set counting, the time model, and
   the thresholds behind trends, breaks and the per-session cap (phase 2, r50;
   moved unchanged from the legacy script). Each is a pure function of its arguments. Where a number comes from
   is said beside it; CLAUDE.md's Evidence base has the sources. */

import type { Exercise, Point, Rir } from './types';
import { daysBetween, isNum, pct1, EPS, EPS_SAME, PERCENT, WEEK_DAYS } from './util';
import { LB, TYPED_STEP, onStep } from './units';
import { LOAD_STEPS, isCompound } from './library';

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
/** The most reserve a set is rated at on the effort strip (0 to RIR_CALL_TOP): a set rated there is "this many or more", so the estimate it gives is only a floor (r34.2). */
export const RIR_CALL_TOP = 5;

/** Brzycki's formula, 1RM = load x BRZYCKI_A / (BRZYCKI_B - reps to failure)
    (Brzycki 1993), used up to BRZYCKI_TOP reps to failure. */
const BRZYCKI_A = 36,
  BRZYCKI_B = 37;
/** The reps to failure where Brzycki gives way to Epley, which meet there. */
export const BRZYCKI_TOP = 10;
/** Epley's formula, 1RM = load x (1 + reps to failure / EPLEY_REPS) (Epley 1985). */
const EPLEY_REPS = 30;
/** How far a trend reads, in reps to failure, with Epley past E1_MAX_REPS (r30, a convention): never shown as a 1RM. */
export const TREND_MAX_RTF = 20;
/** How far load-finding reads, in reps to failure, with Epley past E1_MAX_REPS (r31, a convention): never shown. */
export const FIT_MAX_RTF = 30;

/* The two formulas, each way: the 1RM a load allows at some reps to failure,
   and the load that leaves them at a 1RM. */
const brzycki = (load: number, rtf: number): number => (load * BRZYCKI_A) / (BRZYCKI_B - rtf);
/** Epley's 1RM of a load at some reps to failure, with no limit on the reps: for the load-finding and rep-PR readings past the estimate's range, never shown. */
export const epley = (load: number, rtf: number): number => load * (1 + rtf / EPLEY_REPS);
/** The 1RM a load allows at some reps to failure by the formula for those reps, with no limit on them: for load-finding only, never shown. */
export const e1At = (load: number, rtf: number): number => (rtf <= BRZYCKI_TOP ? brzycki(load, rtf) : epley(load, rtf));

/** Reps to failure: reps plus the RIR called (blank as 0), or null past E1_MAX_RIR. */
export function rtfOf(r: number | string, rir?: Rir): number | null {
  const q = rir == null || rir === '' || !isFinite(+rir) ? 0 : Math.max(+rir, 0);
  return q > E1_MAX_RIR ? null : +r + q;
}

/** The estimated 1RM of one set, by the rules above E1_MAX_RIR; null when the
    set gives none (no load or reps, a reserve past 4, or past 12 reps to failure). */
export function e1(load: number, r: number, rir?: Rir): number | null {
  if (!(load > 0 && r > 0)) return null;
  const rtf = rtfOf(r, rir);
  if (rtf == null || rtf > E1_MAX_REPS) return null;
  return e1At(load, rtf);
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
  return rtf <= E1_MAX_REPS ? e1(load, r, rir) : rtf <= TREND_MAX_RTF ? epley(load, rtf) : null;
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
  return t <= FIT_MAX_RTF ? epley(load, t) : null;
}

/* The load that leaves a given number of reps to failure at an estimated 1RM:
   the inverse of e1(). Past 12 RTF it keeps using Epley, only to pick loads. */
export function e1inv(est: number, rtf: number): number {
  return rtf <= BRZYCKI_TOP ? (est * (BRZYCKI_B - rtf)) / BRZYCKI_A : est / (1 + rtf / EPLEY_REPS);
}

/* Reps to failure a load allows at an estimated 1RM, the inverse the other way. */
export function rtfAt(est: number, load: number): number | null {
  if (!(est > 0 && load > 0)) return null;
  const b = BRZYCKI_B - (BRZYCKI_A * load) / est;
  return b <= BRZYCKI_TOP ? b : EPLEY_REPS * (est / load - 1);
}

/** A rep band PRs are judged within. */
type PrBand = 1 | 2 | 3;
/** The rep bands for PR comparisons, by the reps to failure each ends at (a
    convention, r56.2): estimates from triples and from sets of 12 are not
    interchangeable, so a best is judged within its own band. The last ends
    where estimates do. */
export const PR_BANDS: readonly { readonly band: PrBand; readonly top: number }[] = [
  { band: 1, top: 5 },
  { band: 2, top: 10 },
  { band: 3, top: E1_MAX_REPS }
];
/** The band of a set's reps to failure; past the last band's top (no estimate there), the last band. */
export const rtfBand = (rtf: number): PrBand =>
  (PR_BANDS.find(b => rtf <= b.top) ?? PR_BANDS[PR_BANDS.length - 1]).band;

/* A rep PR counts at 90% or more of the strongest set before it (r30, a convention). */
export const REP_PR_SHARE = 0.9;

/* The unit a load was typed in, read from the number kept (kilograms, every
   set as typed): one typed in kilograms is a whole number of TYPED_STEP kg,
   one typed in pounds a whole number of TYPED_STEP lb, and no other load is
   both. 0, or a load on neither (a number not typed as such, as the engine
   reads one too), says nothing. Help on an assisted lift is read by its
   size. */
/** The unit a load was typed in, from its number, or null when the number does not say. */
function typedUnit(w: number): 'kg' | 'lb' | null {
  const a = Math.abs(w);
  if (!(a > 0)) return null;
  const kg = onStep(a, TYPED_STEP),
    lb = onStep(a / LB, TYPED_STEP);
  return kg === lb ? null : kg ? 'kg' : 'lb';
}

/* Half the largest spacing loads come in (LOAD_STEPS) that a load is a whole
   number of, in the unit it was typed in, in kilograms: no weight is farther
   than that from the nearest load on that spacing. 0 for a load on none. */
function halfStep(a: number, u: 'kg' | 'lb'): number {
  const k = u === 'lb' ? LB : 1;
  const st = LOAD_STEPS[u].find(s => onStep(a / k, s));
  return st ? (st / 2) * k : 0;
}

/* The load a set is judged at for its PRs against earlier sets (r54, from
   the audit V asked for: 155 lb after 70 kg, which is 154.3 lb, logged a
   weight PR, and a new best estimate with it, made of unit rounding, the
   lifter having changed units or gyms). A load is read as the earlier load
   it stands for when that was typed in the other unit and lies under it by
   no more than half the load's own spacing, so it is that load on the
   nearest step up (the nearest of them when there are two): 155 lb on 5 lb
   steps is the nearest load over 70 kg. Any other load is itself. Only ever
   lighter, so this takes away a PR made of rounding and never makes one:
   more weight is a PR once past the step the old load meant (157.5 lb), and
   more reps at the same weight are still more reps. A convention: on a
   spacing finer than the load shows (70 kg on 1 kg plates), one step past
   the nearest can read as the same load (70 kg after 152.5 lb, 69.2 kg). */
/** A set's load for its PRs: the earlier load typed in the other unit that it stands for, else its own. */
export function prSameLoad(w: number, earlier: ReadonlySet<number>): number {
  const u = typedUnit(w);
  if (!u) return w;
  /* Or within half the last digit the screens show a load to (a tenth, so
     0.05 in the unit it was typed in, TYPED_STEP): 100 kg is shown in lb as
     220.5, and 220.5 typed as the Last column shows it is that load, not a
     heavier one (r55.1, from the audit of r55: a Weight PR made of rounding). */
  const k = u === 'lb' ? LB : 1;
  const lo = w - Math.max(halfStep(Math.abs(w), u), TYPED_STEP * k) - EPS;
  let best = w;
  for (const e of earlier)
    if (e < w - EPS && e >= lo && (best === w || e > best) && typedUnit(e) === (u === 'kg' ? 'lb' : 'kg')) best = e;
  return best;
}

/* ---------- sets and sessions ---------- */

/** A working set: not a warm-up, and reps done. Reps are null on a row with
    none typed, which Number reads as 0. */
export const isWork = (s: { warm?: boolean | undefined; r: number | string | null }): boolean =>
  !s.warm && Number(s.r) > 0;

/** A missed set (r55, V 2026-10-19): reps typed as 0, a lift tried and not
    made. Ticked, it is kept and shown as missed, and counts toward no volume,
    PR, estimate or target, which isWork already gives, since it reads reps
    above 0. A row with no reps typed (null, or '' in a field) is not one. */
export const isMissed = (s: { r: number | string | null }): boolean => s.r !== null && s.r !== '' && +s.r === 0;

/** A hard set is one called at HARD_RIR or less (Robinson 2024, Refalo 2023: growth rises as sets end closer to failure; the exact cut-off is a convention). */
export const HARD_RIR = 3;
/** With Count RIR 4 to 5 as half a set on (r40, a convention), a working set past HARD_RIR counts this share of one. */
export const HALF_SET = 0.5;
/** A set counts this share toward a muscle it trains as a helper, against 1 for its main muscle (Pelland 2025: 0.5 fitted the dose-response data best). */
export const HELPER_CREDIT = 0.5;
/** + Drop starts at about this share of the last working load, in the lift's steps (a convention, r56.2). */
export const DROP_START = 0.75;
/** + Warm-up's loads, as shares of the working load: the first warm-up, the second, the third and any after (a convention, r56.2). */
export const WARM_RAMP: readonly number[] = [0.4, 0.6, 0.75, 0.85];
/** A drop set's weight in a weekly count, against 1 for a straight set (a convention, r56.2: no study measures it). */
export const DROP_CREDIT = 0.5;
/** A set's weight in a weekly count: a drop set counts DROP_CREDIT. */
export const setCredit = (s: { drop?: boolean | undefined }): number => (s.drop ? DROP_CREDIT : 1);

/* Two planned rep ranges match when equal, or when either is unknown (sessions
   logged before rep ranges were recorded). */
export function sameRR(
  a: readonly [number, number] | null | undefined,
  b: readonly [number, number] | null | undefined
): boolean {
  return !a || !b || (a[0] === b[0] && a[1] === b[1]);
}

/** The share of a session's heaviest load a set's must reach to count toward its working load (r31, a convention): unmarked warm-ups sit lower. */
export const WORK_FLOOR = 0.6;
/** Loads compared as whole thousandths, so loads typed in either unit and kept in kilograms group by the gram. */
const LOAD_KEY = 1000;

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
  /* The floor is of the total moved (load, which adds the bodyweight share on
     a pull-up or dip), not of the number typed: +25 on a 180 lb pull-up is
     89% of +50, not half (the review saw +50 prescribed for every set). */
  const T = (p: Point): number => (p.load != null ? p.load : p.w);
  const top = Math.max(...pts.map(T));
  const floor = top > 0 ? top * WORK_FLOOR : -Infinity;
  const ok = (p: Point): boolean => T(p) >= floor - EPS;
  const k = (v: number): number => Math.round(v * LOAD_KEY);
  const n = new Map<number, number>();
  for (const p of pts) if (ok(p)) n.set(k(p.w), (n.get(k(p.w)) || 0) + 1);
  let w: number | null = null,
    best = -1;
  /* w is null only until the first set at or over the floor, which always
     sets it (its count beats -1), so the comparison never meets a null. The
     ! says so to TypeScript and is not code, as is the one on the count, which
     the loop above set for every load at or over the floor. */
  for (const p of pts) {
    if (!ok(p)) continue;
    const c = n.get(k(p.w))!;
    if (c > best || (c === best && p.w > w!)) {
      best = c;
      w = p.w;
    }
  }
  return w == null ? Math.max(...pts.map(p => p.w)) : w;
}

/** The sets at a load (within a millionth, as loads are stored in kg). */
export const atLoad = <P extends Pick<Point, 'w'>>(pts: readonly P[], w: number): P[] =>
  pts.filter(p => Math.abs(p.w - w) < EPS_SAME);

/* The floor for reps that set targets and grey reps (r32): one set under
   the range among two or more is read at the bottom of the range. With more
   of them under it, the load was heavy that day or too heavy, and the drop
   below the range (or the way back to it) handles that. */
export function repFloor(
  pts: readonly Pick<Point, 'r'>[],
  repMin: number | string | null | undefined
): (r: number) => number {
  // No range reads as 0: Number(undefined) is NaN, and NaN || 0 is 0.
  const m = Number(repMin) || 0;
  const ok = m > 0 && pts.length >= 2 && pts.filter(p => p.r < m).length === 1;
  return r => (ok ? Math.max(r, m) : r);
}

/** The share of a lift's sets a lighter day, a deload or Make it lighter keeps, rounded up (a convention). */
export const LIGHTER_SET_SHARE = 1 / 2;
/** The sets a lighter day, a deload or Make it lighter keeps of a lift's: LIGHTER_SET_SHARE of them, rounded up, at least one. */
export const lighterSets = (n: number): number => Math.max(1, Math.ceil(n * LIGHTER_SET_SHARE));
/** A deload is not suggested within DELOAD_GAP_DAYS of a lighter week (r30, a convention). */
export const DELOAD_GAP_DAYS = 28;

/** A lift's session reads lighter than its usual when its heaviest load is this share of the heaviest of its previous three or less (r30, a convention: a deload is usually about 10% off), and its strength reading LIGHTER_READING of theirs or less. */
export const LIGHTER_LOAD = 0.9;
/** The share of the normal load a lighter day, a deload or a lift back after a break asks for, and of the hold time on a timed hold back after one (r32, r55; a convention, the usual deload of about a tenth). */
export const LIGHT_SHARE = 0.9;
/** The strength reading, reps alone, at which a session with a load LIGHTER_LOAD or less under reads lighter (r30, a convention). */
export const LIGHTER_READING = 0.93;
/** A lift's usual (V's one rule, r54) is the middle of its session and the USUAL_BEFORE sessions before it in its range, not done lighter (a convention). */
export const USUAL_BEFORE = 2;

/** How far off its plan a set must be to be clearly off, in reps or in reps
    in reserve: past the top of the range, short of the bottom, or easier than
    the target RIR, by this many or more. It moves the next session's load
    from the estimate (r27) and the next sets in a session (r34; 3 until r45,
    V: 14 reps on a 10 to 12 range left the load alone). A convention. */
export const CLEARLY_OFF = 2;
/** The rep more in reserve a load set from an estimate leaves for fatigue: the next sets in a session, and a close variation's first session (r32.1, r34; a convention, meant to err light). */
export const FATIGUE_RIR = 1;

/** The marks a lift's session can carry that keep it from setting targets, or trends too. */
type SessionMarks =
  | { deload?: boolean; light?: boolean; auto?: boolean; short?: string | undefined }
  | null
  | undefined;

/* One test for each (r31: written out by hand in six places, which could
   drift; since r54, V's one rule for every session, PENDING 312 E). A lift's
   session done lighter, tagged a deload or a lighter day or made lighter and
   not done at its usual level there, or read lighter from its loads, sets no
   target and no trend; its PRs count (r53). A session short of its usual,
   fewer working sets than usual or a reading under it (analytics.ts,
   idxShort), sets no target, so the target repeats, while its trend, stalls
   and PRs count; two in a row make it the usual, and the app follows. Until
   r54 a lift trimmed by Short on time, or stopped at under half its sets,
   was marked trimmed and left out of trends too. */
/** A lift's session done lighter: no target, no trend. */
export const lighter = (x: SessionMarks): boolean => !!x && !!(x.deload || x.light || x.auto);
/** A lift's session that sets no target: done lighter, or short of its usual. */
export const offTarget = (x: SessionMarks): boolean => lighter(x) || !!(x && x.short);

/* ---------- load steps ---------- */

/** The load jump at the top of the range, as a share of the load, when the plan sets none: about 2.5% on compound lifts and 5% on isolation lifts (r30, a convention, double progression). */
export const JUMP_COMPOUND = 0.025,
  JUMP_ISOLATION = 0.05;

/* When every set reaches the top of the range, the load goes up by whole
   multiples of the smallest step you can add, sized to about 2.5% of the
   load on compound lifts and 5% on isolation lifts (the engine's progStep).
   The jump can be set per exercise in a routine (plan.jump, r30, V: "the
   progression should be overridable in the planner"): a percent of the load,
   rounded down to whole load steps and never less than one step; 0 means
   always one step. Unset, it is the 2.5% or 5%. */
export function jumpPct(
  ex: Parameters<typeof isCompound>[0],
  plan: { jump?: number | string | null | undefined } | null | undefined
): number {
  return plan && plan.jump != null && isNum(+plan.jump)
    ? Math.max(0, +plan.jump) / PERCENT
    : isCompound(ex)
      ? JUMP_COMPOUND
      : JUMP_ISOLATION;
}

/** The most one session's adjustment may raise the load, as a multiple of it
    (conventions): JUMP_CAP, or JUMP_CAP_LIGHT on an isolation lift under
    LIGHT_LIFT_KG, where one plate or dumbbell step is a large fraction, and
    JUMP_CAP_EARLY in a lift's first EARLY_SESSIONS sessions (r31), while its
    load is still being found. One rep of RIR error is normal, so bigger jumps
    overshoot. */
export const JUMP_CAP = 1.1,
  JUMP_CAP_LIGHT = 1.15,
  LIGHT_LIFT_KG = 20,
  JUMP_CAP_EARLY = 1.25,
  EARLY_SESSIONS = 3;

/** The cap above for a lift at a load (kg); early: one of its first EARLY_SESSIONS sessions. */
export function jumpCap(ex: Parameters<typeof isCompound>[0], loadKg: number, early?: boolean): number {
  return early ? JUMP_CAP_EARLY : !isCompound(ex) && loadKg < LIGHT_LIFT_KG ? JUMP_CAP_LIGHT : JUMP_CAP;
}

/* Back after more than 4 weeks off a lift (a convention, r34.2, from the
   review: after 6 weeks away the app asked for the next load up, as if no
   time had passed). Strength falls the longer training stops (Bosquet
   2013, a meta-analysis of training cessation, which names no number of
   weeks; the 4 weeks is the app's line), so the first session back is about 90% of the last working load, in whole
   steps, like a Lighter day but with the usual sets. It is the lift's new
   start (r54): the sessions before the break are not its usual any more, so
   it is not read lighter than them, and its trend and stall test start from
   it, and the session after it picks up from it. Until r54 it read lighter
   than the sessions before the break, so the session after it asked for the
   load from before the break again, and a trend across a five-week break
   read as a fall. */
export const BACK_DAYS = 28;
/** The reps in reserve a lift back after a break is asked to keep at least (r34.2, a convention), and what an unrated set of it reads as. */
export const BACK_RIR = 2;

/** Whether a lift's session on `date` comes after a break in it: more than BACK_DAYS after its session before, of any kind. */
export function afterBreak(prev: { date: string } | null | undefined, date: string): boolean {
  return !!prev && daysBetween(prev.date, date) > BACK_DAYS;
}

/* ---------- trends ---------- */

/* Percent change over the trend window below which a muscle is treated as flat
   rather than moving. Weak points and Return on volume both read this, so the
   two sections can no longer describe the same number differently. */
// 3%: day-to-day swings in estimated 1RM run 2 to 8% (Sigvaldsen 2023), so a
// 1% change is noise. A lift is also only called moving or falling when its
// fitted slope is clear of zero (see IDX).
export const GROW_PCT = 3;
/** How far estimated 1RM swings from day to day, in percent, lowest and highest (Sigvaldsen 2023). */
export const DAY_SWING_PCT = [2, 8] as const;

/** The windows the readings look back over, in days: a trend reads the last
    TREND_DAYS (6 weeks), and the recent figures (sessions, PRs, the share of
    sets rated, the average session) the last RECENT_DAYS (4 weeks). */
export const TREND_DAYS = 42,
  RECENT_DAYS = 28;
/** The trend window in weeks, as the screens say it. */
export const TREND_WEEKS = TREND_DAYS / WEEK_DAYS,
  RECENT_WEEKS = RECENT_DAYS / WEEK_DAYS;
/** A lift's trend needs TREND_MIN.sessions sessions spread over TREND_MIN.days days or more (r31, a convention): three in nine days read one good day as "+6.6% a week". */
export const TREND_MIN = { sessions: 3, days: 14 } as const;
/** A muscle's trend counts a lift once it has MUSCLE_TREND_MIN.sessions sessions over MUSCLE_TREND_MIN.days days in the window (r32, a convention). */
export const MUSCLE_TREND_MIN = { sessions: 4, days: 21 } as const;
/** Flat: a slope under FLAT_PCT_WEEK percent a week (r31, a convention), below the rounding dust of averaged sets. */
export const FLAT_PCT_WEEK = 0.1;
/** The stall test (r30, r31, r32; conventions): the fitted line over a lift's
    last `sessions` sessions, widened to cover `days` days when they do not, at
    least `min`; with no strength reading, `min` sessions and no progress in
    the last `noProgress`, which is also how many sessions a PR in keeps a lift
    from reading stalled. */
export const STALL = { sessions: 6, days: 21, min: 4, noProgress: 3 } as const;
/** A session is read against its previous LIGHTER_REF sessions for a lighter reading (r30, a convention). */
export const LIGHTER_REF = 3;
/** Lighter sessions in a row are a new level, not a deload, once NEW_LEVEL.sessions of them cover NEW_LEVEL.days days or more (r31, a convention). */
export const NEW_LEVEL = { sessions: 3, days: 14 } as const;
/** A lift's best estimate now, as a goal's progress reads it, comes from its sets of the last BEST_WEEKS weeks, lighter days' and deloads' too (r38, r54; a convention). */
export const BEST_WEEKS = 12;
/** Tape measurements are compared when TAPE_WEEKS.from to TAPE_WEEKS.to weeks apart (a convention). */
export const TAPE_WEEKS = { from: 3, to: 12 } as const;
/** RIR enters a lift's trend only when rated on RIR_TREND.share or more of its working sets in its last RIR_TREND.sessions sessions in range (r30, a convention). */
export const RIR_TREND = { share: 0.8, sessions: 8 } as const;
/** The readings over a lift's last DRIFT_N sessions: RIR climbing at one load, and the back sets fading (conventions). */
export const DRIFT_N = 3;

/* The 0.90 quantile of Student's t, for the two-sided 80% interval of a fitted
   slope with n-2 degrees of freedom. The normal value (1.2816) was used
   before; with 3 to 6 sessions the interval came out up to 2.4 times too
   narrow, so noise was called a trend. Past the table's 30 degrees of
   freedom, T90_INF + T90_SLOPE / df is within 0.001 of the exact value. */
export const T90: readonly number[] = [
  NaN,
  3.078,
  1.886,
  1.638,
  1.533,
  1.476,
  1.44,
  1.415,
  1.397,
  1.383,
  1.372,
  1.363,
  1.356,
  1.35,
  1.345,
  1.341,
  1.337,
  1.333,
  1.33,
  1.328,
  1.325,
  1.323,
  1.321,
  1.319,
  1.318,
  1.316,
  1.315,
  1.314,
  1.313,
  1.311,
  1.31
];

/** The normal distribution's 0.90 quantile, the limit of T90 as the degrees of freedom grow. */
const T90_INF = 1.2816;
/** The slope of the approximation past T90's last row. */
const T90_SLOPE = 0.8521;

/** The quantile for df degrees of freedom, whole degrees only: under 1 reads as 1, past the table the approximation. */
export function t90(df: number): number {
  df = Math.floor(df);
  if (!(df >= 1)) return T90[1];
  return df < T90.length ? T90[df] : T90_INF + T90_SLOPE / df;
}

/* ---------- time ---------- */

/** The time model, worded by estMin ("~75 min") wherever it shows, in
    seconds. Per set: `set` up to `setReps` reps and `rep` for each rep past
    that (the middle of the planned range), twice that plus `switch` for a
    lift done one side at a time, the hold plus `hold` for a timed hold; then
    its rest (none between superset partners). Warm-up and setup: `setupFirst`
    for each of the first `firstCompounds` compound lifts, `setupLater` for
    later compounds, `setupIsolation` for isolation work. The rest after the
    final set is never taken, so it is dropped. (The rests are added by
    dayMinutes in the analytics.) Every figure here is a convention, not a
    measurement; your own pace (pace(), r43) scales the total to how long
    your sessions take. */
export const TIME_MODEL = {
  set: 40,
  setReps: 12,
  rep: 3,
  switch: 15,
  hold: 20,
  firstCompounds: 2,
  setupFirst: 300,
  setupLater: 180,
  setupIsolation: 60
} as const;

/** One set's time in seconds by the time model, before its rest. */
export function setSecs(
  ex: Partial<Pick<Exercise, 'timed' | 'perSide'>>,
  p: { repMin: number | string; repMax: number | string }
): number {
  const T = TIME_MODEL;
  const mid = ((+p.repMin || 0) + (+p.repMax || 0)) / 2;
  let t = ex.timed ? mid + T.hold : T.set + T.rep * Math.max(0, mid - T.setReps);
  if (ex.perSide) t = t * 2 + T.switch;
  return t;
}

/** Warm-up and setup before a lift, in seconds, by the time model above:
    compoundsBefore is how many compound lifts came earlier in the day. */
export function setupSecs(ex: Parameters<typeof isCompound>[0], compoundsBefore: number): number {
  const T = TIME_MODEL;
  return isCompound(ex) ? (compoundsBefore < T.firstCompounds ? T.setupFirst : T.setupLater) : T.setupIsolation;
}

/** Your pace (r43): pace() in the analytics compares your timed sessions with
    the time model above. It reads the newest PACE_N in the last PACE_DAYS
    days, needs PACE_MIN of them, and leaves out a session at under PACE_LO or
    over PACE_HI times its model (a clock left running or stopped early).
    Conventions; the comment on pace() says the rest. */
export const PACE_N = 8,
  PACE_DAYS = 84,
  PACE_MIN = 3,
  PACE_LO = 1 / 3,
  PACE_HI = 3;

/* Per-session volume per muscle, counted the same way as weekly volume
   (direct 1, secondary 0.5). Weekly bands cannot see a once-a-week split
   putting 17 sets on one muscle in one session. The per-session
   meta-regression (Remmert 2025, a preprint from the group behind the weekly
   dose-response paper, Pelland 2025) could not detect extra growth past about
   11 fractional sets for one muscle in a session, so more than 11 is flagged
   as a likely place to move sets to another day. Advisory, a convention. */
export const SESSION_CAP = 11;

/** Short on time takes sets off an exercise down to this many before it drops a whole exercise not started (a convention). */
export const SHORT_MIN_SETS = 2;

/** The Plan editor's tip on the load jump (jumpPct above), r30; moved in
    phase 3a (r51). */
export const JUMP_TIP = `When every set reaches the top of the rep range, the load goes up by about this share, in whole load steps and at least one step. Blank: ${pct1(JUMP_COMPOUND)}% on compound lifts, ${pct1(JUMP_ISOLATION)}% on isolation lifts, a convention. 0: one step every time. Until then the target is to beat last time's total reps at the same load. When the step is large for the load, a few more reps come first, so the new load starts inside the range.`;
