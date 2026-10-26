/* The load engine (phase 3b, r52; moved from the legacy script): what to lift next for one
   exercise (suggest and its cases), the steps a load moves in (racks, the
   gym's plates and stacks, the exercise's own step), lighter loads, a start
   borrowed from a close variation, and timed holds. Each function that reads
   the log, the date or a cache takes the model as its first parameter
   (model.ts). */

import type { DraftBlock, NextSetsAdj, Plan } from './types';
import type { Drift, ExPoint, Exposure, ExerciseLike, Model, Suggestion } from './model';
import type { LiftBests } from './analytics';
import { EXIn, UIn, exInjuryIn, gymOfIn } from './model';
import { IDXIn, bwLoadIn, bwRefLoadIn, lastOf, rirEstIn, statsUpToIn, triedAt } from './analytics';
import { atCapOfIn, capOfIn, exBarKgIn, gymK, gymRackIn, gymStepIn, platesMode, rackGapIn, rackTolIn } from './gym';
import {
  DEFAULT_STEP,
  LB,
  STEP_LB,
  TYPED_STEP,
  fromDIn,
  inUnitIn,
  kgOfIn,
  onStep,
  stepReadIn,
  toDIn,
  unitStepIn
} from './units';
import { fmtWIn, loadLabelIn, loadNote, roundLoadIn, swapWIn } from './loads';
import { addDays, daysBetween, isDate, isNum, r1, EPS, EPS_SAME, WEEK_DAYS, MILLIONTHS, pctOf } from './util';
import {
  BACK_DAYS,
  afterBreak,
  E1_MAX_RIR,
  LIGHTER_LOAD,
  LIGHT_SHARE,
  atLoad,
  e1,
  e1inv,
  fitE,
  isMissed,
  isWork,
  jumpCap,
  jumpPct,
  lighter,
  offTarget,
  repFloor,
  rtfAt,
  sameRR,
  workLoad,
  TREND_DAYS,
  EARLY_SESSIONS,
  RIR_CALL_TOP,
  e1At,
  BACK_RIR,
  CLEARLY_OFF,
  FATIGUE_RIR
} from './formulas';
import { KIN_UNI, RACK, injLabel, isCompound, loadMode, noE1, patternOf, rackKind } from './library';
import { LIGHT_RIR, effAt, effLeast, effScale, fmtDate, rangeWords, repSpan } from './format';
import { effW, overSets } from './session';

/* ---------- the engine's conventions ----------
   Each is a convention (docs/EVIDENCE.md), named once here and read by the
   rule it belongs to, below. */

/** Plates: a load within this many steps of a plate total is that total, at the least. */
const PLATE_TOL_MIN = 1e-3;
/** A load is off the unit's step when its distance from the nearest step is more than this share of one (r54): 220.462 from 100 kg is, 185 on a 10 lb step is not. */
const OFF_STEP = 0.02;
/** Just after a step up (no more than JUST_UP.steps steps), reps short by up to JUST_UP.short are the step's, not a drop (r31). */
export const JUST_UP = { steps: 1.5, short: 3 } as const;
/** Sessions in a row under the range at one load that drop it, rising or not (r32). */
export const SHORT_RUN = 4;
/** Well past the range: the top plus PAST_RANGE.share of it, at least PAST_RANGE.min reps (r27). */
const PAST_RANGE = { min: 3, share: 0.4 } as const;
/** A rep range narrower than this is a fixed-rep plan (5 x 5): the load steps up whatever the step costs (r32). */
export const FIXED_RANGE = 3;
/** A step costing this many reps or more is large for the load: reps build first (r32). */
export const BIG_STEP_REPS = 1.5;
/** Reps built before a large step: up to BUILD_PAST.share of the top of the range past it, at least BUILD_PAST.min (r32). */
export const BUILD_PAST = { min: 2, share: 0.25 } as const;
/** A first session borrowed from a close variation (r32.1): one trained in the last KIN.days days, its estimate times KIN.compound or KIN.isolation, to err light. */
export const KIN = { days: 120, compound: 0.8, isolation: 0.9 } as const;
/** A rack's spacing fits a load within this share of a step. */
const RACK_FIT = 0.01;
/** The newest sessions of a lift its rack spacing is read from. */
const RACK_READ_N = 12;

/** How a suggestion is asked for: for a past session's date (`before`), as a deload, or as a lighter day. */
export type SuggestOpts = {
  before?: string | null | undefined;
  deload?: boolean | undefined;
  light?: boolean | undefined;
};

/** What suggestCore works out once for a lift and hands to each of its cases in turn. */
export interface SuggestCtx {
  ex: ExerciseLike;
  exId: string;
  plan: Plan;
  opts: SuggestOpts;
  T: string;
  all: Exposure[];
  every: Exposure[];
  exps: Exposure[];
  done: Exposure[];
  seen: Exposure[];
  inRR: boolean;
  injM: string | null;
  last: Exposure;
  ws: ExPoint[];
  stx: Partial<LiftBests>;
  top: number;
  step: number;
  noAdd: boolean;
  abW: boolean;
  cap: number | null;
  atCap: boolean;
  capW: (w: number) => number;
  topPts: ExPoint[];
  planPts: ExPoint[];
  noHelp: boolean;
  lastR: number[];
  lastS: string;
  basis: string | null;
  lbl: (w: number) => string;
  prevBest: number | null;
  tgtRir: number;
  early: boolean;
  fl: (r: number) => number;
  tp: ExPoint[];
}

/* ---------- progression suggestion ---------- */
/* Double progression. Returns text (the full sentence, used on the Today
   preview), plus last/target (the same thing split into two lines for the
   logger) and tgt, a small object the logger uses to score the session live:
   {kind:'reps', w, total} means beat `total` reps at load w;
   {kind:'load', w, repMin} means hit repMin+ reps in every set at the new load w. */
/* A lighter day or a deload is worked out from the normal day's
   prescription (r32, from the third review): 90% of the load the normal day
   would ask for (or of last time's working load, if lower), in whole steps,
   with grey reps at the bottom of the range.
   It used to take 90% of last time's top load and keep last time's reps, so
   after 140 x 4, 3, 3 (normal day: drop to 122.5) the lighter day asked about
   125, and after 100 x 15 one tap logged 90 x 15 on a "3 or more in reserve"
   day. Injury, a first session and timed holds keep their own lines. */
/* Loads logged in the other unit (r32, second check: after kg to lb,
   100 kg read 220.5 lb and the next was "225.5", 16 kg dumbbells "35.3 per
   dumbbell"): when the last working load is off the step in the unit on
   screen, the suggestion is put on the nearest step (down for a lighter
   day), and the words follow. Loads already on the step are untouched, so
   a stack with odd pins keeps its whole steps. On a rack read from its
   spacing the result then goes onto the rack (gridSnap, r54), as on a rack
   from Your gym. */
export function snapUnitIn(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion, down?: boolean): Suggestion {
  const G = res && res.w != null && !ex.timed ? plateGridIn(M, ex, plan) : null;
  if (G) return plateSnap(M, ex, plan, res, G, down);
  return gridSnap(M, ex, plan, unitSnap(M, ex, plan, res, down));
}

/* Your gym's plates on a bar lift (r55.1, from the audit of r55: with no 2.5
   lb plates, bench logged at 230 lb was asked for 240, 230 or 200 and warmed
   up at 90 and 140, none of them loadable, beside a plate line saying 2.5 lb
   was not). A lift on the full bar typed as the total (loadFloorIn, so not a
   curl on a lighter bar) with no step of its own, in a gym whose plates are
   all whole multiples of the smallest, is loaded at the bar plus pairs of
   plates: the bar and every step of a pair of the smallest plate above it.
   Its suggestions, steps, lighter and heavier loads and warm-ups land on
   those loads. Plates that are not all multiples of the smallest (10 and 25
   lb without 5s) make other sums, so the lift keeps its step as before. */
/** A bar lift's loads as Your gym's plates make them, in kg (the bar, and a pair of the smallest plate), or null. */
export function plateGridIn(
  M: Model,
  ex: ExerciseLike | null | undefined,
  plan?: Pick<Plan, 'inc'> | null
): { bar: number; step: number } | null {
  const g = gymOfIn(M);
  if (!ex || ex.inc != null || ex.timed || !g || !Array.isArray(g.plates) || !g.plates.length) return null;
  if (platesMode(ex) !== 'bar' || loadMode(ex) !== 'total') return null;
  if (Math.abs(stepReadIn(M, plan && isNum(+plan.inc) ? +plan.inc : STEP_LB) - unitStepIn(M)) > EPS_SAME) return null;
  const bar = loadFloorIn(M, ex);
  if (!(bar > 0)) return null;
  const mn = Math.min(...g.plates);
  if (!g.plates.every(x => Math.abs(x / mn - Math.round(x / mn)) < EPS_SAME)) return null;
  return { bar, step: gymK(g, 2 * mn) };
}

/* The load the plates make at or under a load (dir -1) or at or over it (dir
   1), never under the bar. A load within `tol` of one is that load: half the
   last digit the screens show (rackTolIn), so a load typed as shown is the
   load it shows, as a bell typed as shown is that bell (PENDING 333: with Your
   gym in kg and the app in lb, 50 kg is shown as 110.2 lb, and 110.2 typed is
   49.986 kg, which a thousandth of a step read as off the plates). */
function plateAt(G: { bar: number; step: number }, w: number, dir: 1 | -1, tol: number): number {
  const k = (w - G.bar) / G.step,
    e = Math.max(PLATE_TOL_MIN, tol / G.step);
  const n = dir > 0 ? Math.ceil(k - e) : Math.floor(k + e);
  return G.bar + Math.max(0, n) * G.step;
}

/* A suggestion off the plates' loads moves onto them, as one off a rack does
   (gridSnap): a step up to the heaviest of them not past it that is still
   above last time, else the next one above last time; anything else, last
   time's own load included (it cannot be loaded now), to the heaviest not
   past it, so a repeat never asks for more than was done. In place of the
   rounding onto the step in the unit on screen (unitSnap), which counted the
   step from 0 and so missed the bar's (100 kg read in lb as 220, off 45 +
   10n). The words and a reps target follow the load as there (moveIn). */
function plateSnap(
  M: Model,
  ex: ExerciseLike,
  plan: Plan,
  res: Suggestion,
  G: { bar: number; step: number },
  down?: boolean
): Suggestion {
  const w = res.w,
    top = res.top,
    t = rackTolIn(M);
  if (w == null) return res;
  const dn = plateAt(G, w, -1, t);
  /* Within the shown digit of a load the plates make, the suggestion is that
     load itself (PENDING 333, the review of the fix): kept as the number
     typed (52.486 kg for 52.5), the plate line under it came out a plate
     short and the next step was taken from it, so it never reached the next
     plates. The number on screen is the same, so nothing more is said. */
  if (Math.abs(dn - w) <= t) return Math.abs(dn - w) < EPS ? res : swapWIn(M, ex, res, dn);
  const nw = !down && top != null && w > top + t ? (dn > top + t ? dn : plateAt(G, top + t, 1, t)) : dn;
  return moveIn(M, ex, plan, res, nw, 'the nearest load your plates make');
}

/* The snap onto the step in the unit on screen (above). */
function unitSnap(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion, down?: boolean): Suggestion {
  if (!res || res.w == null || res.top == null || ex.timed) return res;
  if (gymRackIn(M, ex, plan)) return rackSnapIn(M, ex, plan, res);
  const st = inUnitIn(M, incOfIn(M, ex, plan));
  if (!(st > 0)) return res;
  /* Off the step and not a number anyone types (220.462 from 100 kg): a
     custom step (185 lb on a 10 lb step) or microplates (101.25) are left as
     they are. Typed is exact in the unit on screen, as a number typed in it
     reads back (r54, from the audit V asked for: within a tenth of 0.05, one
     load in five converted from the other unit passed for typed, so 42.5 kg
     shown as 93.7 lb was told to add 5 lb, to 98.7). */
  const off = (v: number): boolean => Math.abs(inUnitIn(M, v) / st - Math.round(inUnitIn(M, v) / st)) > OFF_STEP;
  const typed = (v: number): boolean => onStep(inUnitIn(M, v), TYPED_STEP);
  if (!off(res.top) || !off(res.w) || typed(res.top)) return res;
  /* Which step (r54). A lighter day, a deload or a return after a break takes
     the step below; anything else the nearest. Never under the floor (the
     empty bar on a full-bar lift typed as the total, else one step on a
     loaded lift), and, but on those lighter days, never a tenth or more under
     the load last done (LIGHTER_LOAD): the next session would read as lighter
     and set no target, so the same snap came back each time. The step above
     then. From the review of r54's first fix, which rounded down under every
     target of reps: 2 kg dumbbells read in lb went to 0 lb, the 20 kg bar to
     40 lb, and 4 kg to 5 lb, three sessions running. */
  const x = inUnitIn(M, res.w);
  const lo = Math.floor(x / st + EPS) * st;
  const loaded = !ex.bw && !ex.assist;
  const fl = Math.max(inUnitIn(M, loadFloorIn(M, ex)), loaded ? st : 0);
  let d = down ? lo : Math.round(x / st) * st;
  if (!down && loaded && d < x * LIGHTER_LOAD - EPS) d = lo + st;
  if (!ex.assist && d < fl - EPS) d = Math.ceil(fl / st - EPS) * st;
  const nw = kgOfIn(M, d);
  if (Math.abs(nw - res.w) < EPS) return res;
  return moveIn(M, ex, plan, res, nw, `the nearest load in ${UIn(M)}`);
}

/* A suggestion moved to another load (by unitSnap or plateSnap): the load
   swapped in, a reps target turned into a load target when the load went
   up, and the step its words name restated. `why` names what the new load
   is nearest to. */
function moveIn(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion, nw: number, why: string): Suggestion {
  if (res.w == null || Math.abs(nw - res.w) < EPS) return res;
  const out = swapWIn(M, ex, res, nw);
  /* A heavier load under a target of reps (r54, from the audit V asked for:
     12.5 kg dumbbells read in lb went to 30 lb, 9% heavier, with the reps to
     beat unchanged, and the lifter fell short): those reps were done lighter,
     so the target is that load for the bottom of the range in every set, as
     after any step up. */
  if (nw > res.w + EPS && res.tgt && res.tgt.kind === 'reps') {
    const lbl = `${loadLabelIn(M, ex, nw)}${ex.bw ? '' : ' ' + UIn(M)}${loadNote(ex)}`;
    return {
      ...out,
      text: `${res.last ? res.last + ' ' : ''}${lbl} is ${why} to what you did: aim for ${plan.repMin}+ reps in every set.`,
      target: `${lbl} for ${plan.repMin}+ reps in every set`,
      tgt: { kind: 'load', w: nw, repMin: +plan.repMin, prevBest: res.tgt.prevBest }
    };
  }
  /* The step the words name moves with the load, so they add up to what is
     shown (r54, from the audit: "add 5 lb" to 93.7 lb beside 100 lb, and "take
     5 lb of help off" beside help that moved by another amount). With no
     load before (a first session), no step is named. */
  if (res.top == null) return out;
  const was = fmtWIn(M, res.w - res.top),
    now = fmtWIn(M, nw - res.top);
  const say = (t: string): string =>
    t
      .replace(`add ${was} ${UIn(M)}`, `add ${now} ${UIn(M)}`)
      .replace(`take ${was} ${UIn(M)} of help off`, `take ${now} ${UIn(M)} of help off`);
  out.text =
    out.last && out.text.startsWith(out.last) ? out.last + say(out.text.slice(out.last.length)) : say(out.text);
  return out;
}

/* Days since a lift was last done, by its newest session of any kind up to
   the date being logged. */
export function daysOffIn(M: Model, exId: string, opts?: SuggestOpts | null): number {
  const T = opts && opts.before && isDate(opts.before) ? opts.before : M.today();
  const xs = (IDXIn(M).byEx[exId] || []).filter(x => x.date <= T);
  if (!xs.length) return 0;
  return daysBetween(xs[xs.length - 1].date, T);
}

/* A lift is back after a break (BACK_DAYS) until a session since the break
   sets its target: the length of the break, from its session before it to
   the first after it, or to the date being logged when nothing came after;
   else 0. The first session back is the lift's new start and sets the next
   target (r54), so the lift stops being back once it is done, unless it was
   done lighter (a Lighter day or a deload, tapped on coming back): until
   r54 the session after that asked for the load from before the break. */
function backDaysIn(M: Model, exId: string, plan: Plan, opts: SuggestOpts): number {
  const T = opts.before && isDate(opts.before) ? opts.before : M.today();
  const all = (IDXIn(M).byEx[exId] || []).filter(x => x.date <= T);
  /* A lift trained in two rep ranges restarts each on its own first session
     back (r55.1, from the audit of r55: a light day eased after a break ended
     the heavy day's return too, so the heavy day's first session back asked
     for the load from before the break). The break is read from the sessions
     in the plan's range when that range is in use, as the target is
     (suggestCoreIn), and from all of them otherwise. */
  const want: [number, number] = [+plan.repMin, +plan.repMax];
  const xs = rangeInUse(
    all.filter(x => !offTarget(x)),
    want
  )
    ? all.filter(x => sameRR(x.rr, want))
    : all;
  if (!xs.length) return 0;
  if (afterBreak(xs[xs.length - 1], T)) return daysBetween(xs[xs.length - 1].date, T);
  for (let i = xs.length - 1; i > 0 && offTarget(xs[i]); i--)
    if (afterBreak(xs[i - 1], xs[i].date)) return daysBetween(xs[i - 1].date, xs[i].date);
  return 0;
}

/* What to lift next for one exercise on a plan: the normal prescription
   (suggestCore), or a lighter day, a deload, or a lift back after a break
   worked out from it (above). A close variation's start, a lighter one, is
   given only when it set a load, as the ! after base.w say; once the base has
   a load (the test below), it is read as one. toD and fromD of a number are
   numbers, as the other ! say. */
export function suggestIn(M: Model, exId: string, plan: Plan, opts?: SuggestOpts | null): Suggestion {
  opts = opts || {};
  const ex = EXIn(M, exId);
  const off = !(opts.deload || opts.light) && !ex.timed ? backDaysIn(M, exId, plan, opts) : 0;
  const back = off > BACK_DAYS;
  if (!(opts.deload || opts.light || back) || ex.timed)
    return snapUnitIn(M, ex, plan, suggestCoreIn(M, exId, plan, opts));
  const base = suggestCoreIn(M, exId, plan, { ...opts, deload: false, light: false });
  /* A close variation's first session on a Lighter day or deload (r32.1): 90% of the start, like any lighter day. */
  if (base.kin && base.w! > 0) {
    const ks =
      !gymRackIn(M, ex, plan) && rackKind(ex) && rackKind(EXIn(M, base.kin)) ? rackStepIn(M, EXIn(M, base.kin)) : null;
    const lw = ks
      ? fromDIn(M, Math.floor(toDIn(M, base.w! * LIGHT_SHARE)! / toDIn(M, ks)! + EPS) * toDIn(M, ks)!)!
      : lighterLoadIn(M, ex, plan, base.w!, base.w! * LIGHT_SHARE);
    return {
      ...base,
      w: lw,
      lastR: Array<number>(Math.max(1, +plan.sets || 1)).fill(+plan.repMin),
      text: `First time, ${opts.deload ? 'deload' : 'Lighter day'}. About ${loadLabelIn(M, ex, lw)} ${UIn(M)}${loadNote(ex)} for ${repSpan(plan.repMin, plan.repMax, '-')} with ${effLeast(effScale(M.s.settings.rirScale), LIGHT_RIR)}, from your ${EXIn(M, base.kin).name}. Half the usual sets, nothing to beat.`
    };
  }
  if (base.inj || !base.last || base.w == null) return base;
  // Never above last time's working load either: after 25 lb x 12 the normal day may ask 30, and a deload at 25 is not lighter.
  const word = opts.deload ? 'Deload' : opts.light ? 'Lighter day' : `Back after ${Math.round(off / WEEK_DAYS)} weeks`;
  const step = incOfIn(M, ex, plan);
  const w0 = base.top != null ? Math.min(base.w, base.top) : base.w;
  const bl = bwRefLoadIn(M, ex);
  const lbl = (w: number): string => `${loadLabelIn(M, ex, w)}${ex.bw ? '' : ' ' + UIn(M)}${loadNote(ex)}`;
  /* Assisted: LIGHT_SHARE of the lifted load means more help, rounded up to the
     machine's step so it never lands back on the full load; with no weigh-in
     to read the lifted load from, the help goes up by the share the load
     would go down (2 - LIGHT_SHARE times it). */
  const hs = step > 0 ? toDIn(M, step)! : DEFAULT_STEP[UIn(M)];
  const dw = ex.assist
    ? -fromDIn(
        M,
        Math.ceil(toDIn(M, bl > 0 ? bl - (w0 + bl) * LIGHT_SHARE : -w0 * (2 - LIGHT_SHARE))! / hs - EPS) * hs
      )!
    : ex.bw
      ? (w0 + bl) * LIGHT_SHARE - bl > 0
        ? lighterLoadIn(M, ex, plan, w0, (w0 + bl) * LIGHT_SHARE - bl)
        : 0
      : lighterLoadIn(M, ex, plan, w0, w0 * LIGHT_SHARE);
  const w = w0 > 0 || ex.assist ? dw : w0;
  // Grey reps at the bottom of the range: at about 90% of the load that is 3 or more in reserve for anyone in the range last time.
  const n = Math.max(1, (base.lastR || []).length || +plan.sets || 1);
  if (back)
    return snapUnitIn(
      M,
      ex,
      plan,
      {
        top: base.top,
        prev: base.prev,
        prevOff: base.prevOff,
        w,
        text: `${base.last} ${word}: about ${lbl(w)} for ${repSpan(plan.repMin, plan.repMax, '-')} with ${BACK_RIR} or more reps in reserve. Next time picks up from here.`,
        lastR: Array<number>(n).fill(+plan.repMin),
        basis: base.basis,
        last: base.last,
        target: '',
        tgt: null,
        easier: null,
        back: Math.round(off / WEEK_DAYS)
      },
      true
    );
  return snapUnitIn(
    M,
    ex,
    plan,
    {
      top: base.top,
      prev: base.prev,
      prevOff: base.prevOff,
      w,
      text: `${base.last} ${word}: about ${lbl(w)} for ${repSpan(plan.repMin, plan.repMax, '-')} with ${effLeast(effScale(M.s.settings.rirScale), LIGHT_RIR)}. Half the usual sets, nothing to beat.`,
      lastR: Array<number>(n).fill(+plan.repMin),
      basis: base.basis,
      last: base.last,
      target: '',
      tgt: null,
      easier: null
    },
    true
  );
}

/* Whether the plan's rep range is in use for a lift (r27): the lift was
   trained for no more than the trend window (TREND_DAYS) since the range's newest
   full session. A lift on two days at two ranges then reads each from its own
   sessions; a range left for another while training went on (a lift back on
   8-12 after months on 5-8), or never logged, reads them all. A break of more
   than four weeks (afterBreak) is time not trained, so it does not count
   toward the window, and a range trained just before a break is still its
   own after it (r55.1, the spec review: counting the break, a heavy day six
   weeks off read the light day's eased session as its start). The target
   (suggestCoreIn) and the return after a break (backDaysIn) read it alike. */
function rangeInUse(full: readonly Exposure[], want: readonly [number, number]): boolean {
  const last = full.filter(x => !!x.rr && x.rr[0] === want[0] && x.rr[1] === want[1]).pop();
  if (!last) return false;
  let prev: Exposure = last,
    span = 0;
  for (const x of full) {
    if (x.date <= last.date) continue;
    if (!afterBreak(prev, x.date)) span += daysBetween(prev.date, x.date);
    prev = x;
  }
  return span <= TREND_DAYS;
}

/* The load engine's prescription for one lift (r36: the 250-line function cut
   into its cases, each below and tried in order, with no change to what comes
   out; tests/r36.js compares it with r35 on random histories). A lift with
   sessions has them under its id in IDX (byEx); with none, every and all are
   absent, and the test for exps below returns first, so past it both are
   there, and seen with them, as the ! after them say. seen reads all before
   that test only when inRR holds, which needs a full session, so all is
   there then too. */
export function suggestCoreIn(M: Model, exId: string, plan: Plan, opts?: SuggestOpts | null): Suggestion {
  opts = opts || {};
  /* opts.before: the date of a past session being logged. Only what was
     logged up to that date counts, so a workout entered after later ones
     gets the target and "Last" it would have had on the day. */
  const T = opts.before && isDate(opts.before) ? opts.before : M.today();
  const every = IDXIn(M).byEx[exId];
  const all = every ? every.filter(x => x.date <= T) : every;
  const ex = EXIn(M, exId);
  const injM = exInjuryIn(M, ex);
  // The last full session sets the target: not one done lighter, nor one short of its usual (r54, V's one rule). If there is nothing else, use them.
  const full = all ? all.filter(x => !offTarget(x)) : [];
  /* The same lift can sit on two days with different rep ranges (heavy 4-6,
     light 10-12). Each day progresses from its own sessions in its own range
     (r27). That holds while the range is in use: the newest session in it
     within the trend window (42 days) of the newest full session. A range not
     used lately (a lift back on 8-12 after months on 5-8) or never logged
     reads every full session, so the newest load is the starting point.
     Sessions with no range on record (from before r13, imported or demo) go
     along with the range when it is in use. */
  const want: [number, number] = [+plan.repMin, +plan.repMax];
  const inRR = rangeInUse(full, want);
  const fullRR = inRR ? full.filter(x => sameRR(x.rr, want)) : [];
  const exps = all && all.length ? (fullRR.length ? fullRR : full.length ? full : all) : all;
  /* The same sessions with those short of their usual (r54, V's one rule):
     a short session sets no target, but it was done, so a case that reads
     the session before last time's (two sessions under the range in a row,
     reps rising after a step) reads it among these. */
  const done =
    all && all.length
      ? fullRR.length
        ? all.filter(x => !lighter(x) && sameRR(x.rr, want))
        : full.length
          ? all.filter(x => !lighter(x))
          : all
      : [];
  const seen = inRR ? all!.filter(x => sameRR(x.rr, want)) : all;
  if (ex.timed) return suggestTimedIn(M, ex, plan, exps, opts, injM, seen);
  if (!exps || !exps.length) return sgFirstIn(M, ex, plan, T, injM);
  const last = exps[exps.length - 1],
    ws = last.pts;
  const stx: Partial<LiftBests> =
    all!.length < every!.length ? statsUpToIn(M, exId, all!) : IDXIn(M).exStats[exId] || {};
  const top = workLoad(ws, +plan.repMin);
  const step = incOfIn(M, ex, plan, top);
  /* Ab work on bodyweight with no load ever added (a hanging leg raise, a
     crunch) progresses by reps, then harder reps (r32, from the third
     review: a leg raise at 15 reps was told "BW+2.5 for 10+"). Once a load
     has been logged, it progresses like any loaded lift. */
  /* Since r34.2 every bodyweight lift never done with added load, not only
     ab work (from the review: push-ups done on bodyweight for 6 weeks were
     asked for BW+10 every session and counted as missed targets). A load
     typed once makes it a loaded lift. */
  const noAdd = !!ex.bw && !ex.assist && !all!.some(x => x.pts.some(p => p.w > EPS_SAME));
  const abW = ['abs', 'obliques'].includes(ex.primary);
  // Heaviest available load (top of the stack or rack), if set.
  const cap = capOfIn(M, ex, plan, top);
  /* An assisted lift at no help is at the most the machine gives (r55, the
     audit: at BW it asked to "take 2.5 kg of help off", BW+2.5): reps, as at
     the heaviest load of a rack. */
  const noHelp = !!ex.assist && top >= -EPS;
  const atCap = atCapOfIn(M, ex, plan, top, cap) || noHelp;
  const capW = (w: number): number => (cap != null ? Math.min(w, cap) : w);
  // Only the sets at the top load decide progression. Ramp-up sets at lighter
  // loads used to block every load increase unless they also reached repMax.
  // As tried, a missed set among them with its 0 reps (triedAt, PENDING 338 A).
  const topPts = triedAt(last, top);
  /* The planned sets among them decide a step, as they set the rep target
     (tp, below): a set past the plan's count is left out (r55, the audit: 80
     x 10 x 4 and a fifth set of 8 held the load and asked 41+ reps over 4). */
  const planPts = topPts.slice(0, Math.max(1, +plan.sets || topPts.length));
  const L0 = lastOf(seen, last, p => `${loadLabelIn(M, ex, p.w)}×${p.r}`, +plan.repMin);
  const lastR = L0.lastR,
    lastS = L0.line,
    basis = L0.basis;
  const lbl = (w: number): string => `${loadLabelIn(M, ex, w)}${ex.bw ? '' : ' ' + UIn(M)}${loadNote(ex)}`;
  const prevBest = stx.best == null ? null : stx.best;
  /* Injured area: no target to chase, load capped at last time, and a reminder
     to stop short. No target is set, so nothing in this session reads as
     "beaten" or "missed". */
  if (injM)
    return {
      top,
      prev: L0.prev,
      prevOff: L0.prevOff,
      w: top,
      text: `${lastS} Injury flagged (${injLabel(injM)}): stay at or below ${lbl(top)}, keep ${effLeast(effScale(M.s.settings.rirScale), LIGHT_RIR)}, stop on pain.`,
      lastR,
      basis,
      last: lastS,
      target: '',
      tgt: null,
      easier: null,
      inj: injM
    };
  /* A lighter day (r30) is a one-day deload: lighter loads, 3 or more in
     reserve, half the sets, no target. suggest() works it out from this
     function's normal prescription (r32). */
  /* Recalibrate when every top set was logged with RIR at least 2 above the
     target. It uses the same e1() estimate as everything else,
     and the new load is what leaves the middle of the rep range at the target
     RIR. It moves in whole steps from the last load, so machine stacks with odd
     offsets stay on real pin positions, and never jumps more than 10% (see
     jumpCap). A set called past 4 RIR is read as 4 here only, which errs low. */
  const tgtRir = +plan.rir || 0;
  /* The first 3 sessions of a lift find its load (a convention, r31): the
     cap on a jump is 25% there, so a first guess well under what the
     lifter can do moves up by what the estimate allows, not a step at a
     time; a set rated 5 or more in reserve is read as 5 (E1_MAX_RIR), so
     from such sets it moves about a step a session (PENDING 338 E). */
  const early = exps.length <= EARLY_SESSIONS;
  // One set under the range among sets made reads as the bottom of it (repFloor); a missed set never does.
  const fl = repFloor(
    topPts.filter(p => !p.missed),
    plan.repMin
  );
  const tp = topPts.slice(0, Math.max(1, +plan.sets || topPts.length)).map(p => (p.missed ? p : { ...p, r: fl(p.r) }));
  const C: SuggestCtx = {
    ex,
    exId,
    plan,
    opts,
    T,
    all: all!,
    every: every!,
    exps,
    done,
    seen: seen!,
    inRR,
    injM,
    last,
    ws,
    stx,
    top,
    step,
    noAdd,
    abW,
    cap,
    atCap,
    capW,
    topPts,
    planPts,
    noHelp,
    lastR,
    lastS,
    basis,
    lbl,
    prevBest,
    tgtRir,
    early,
    fl,
    tp
  };
  // The sets of the session shown as Last, for the Last column in the session (r44): each case's result carries them.
  const res =
    sgAfterReturnIn(M, C) ||
    sgEasyIn(M, C) ||
    sgPastRangeIn(M, C) ||
    sgBelowRangeIn(M, C) ||
    sgNoStep(C) ||
    sgTopOfRangeIn(M, C) ||
    sgBadDay(C) ||
    sgRepsIn(M, C);
  return res && res.last ? { ...res, prev: L0.prev, prevOff: L0.prevOff } : res;
}

/* The session after a return from a break (341 b, rule 5; V 2026-10-24:
   "make the decision that is not convoluted and most comprehensive"). The
   return asked about LIGHT_SHARE of the load from before the break with
   BACK_RIR or more in reserve; done as asked (every planned set at its load reached the
   bottom of the range), its sets say how much came back. The next session
   asks the load that estimate gives for the reps the lift was done for
   before the break at the planned reserve, in whole steps on the rack or
   plates, up to the load from before the break and never past it; a set
   left unrated reads as BACK_RIR in reserve, what the return asked. Until r60 the
   return's sets set a reps target at its load (165 x 8 x 3 unrated: beat 24
   reps at 165), the app reading its own instruction to stop short as the
   lifter's limit, so the load took several sessions of reps to come back.
   When the estimate gives no more than the return's load, the usual cases
   below decide. Conventions (docs/EVIDENCE.md, Back after a break). */
function sgAfterReturnIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, plan, all, exps, last, top, cap, planPts, lastR, lastS, basis, lbl, prevBest, tgtRir } = C;
  if (C.injM || C.noAdd || ex.assist || noE1(ex) || !(top > 0)) return null;
  const i = all.indexOf(last);
  if (i < 1 || !afterBreak(all[i - 1], last.date)) return null;
  const k = exps.indexOf(last);
  const pre = k > 0 ? exps[k - 1] : null;
  if (!pre || !afterBreak(pre, last.date)) return null;
  const preTop = workLoad(pre.pts, +plan.repMin);
  if (!(preTop > top + EPS_SAME)) return null;
  // Done as asked: every set at its load reached the bottom of the range (a return with fewer sets is short, so it is not in exps).
  if (triedAt(last, top).some(p => p.missed || p.r < +plan.repMin)) return null;
  const bw = bwRefLoadIn(M, ex);
  if (ex.bw && !(bw > 0)) return null;
  let est = 0;
  for (const p of planPts) {
    const v = fitE(p.load, p.r, p.rir == null ? BACK_RIR : Math.min(p.rir, E1_MAX_RIR));
    if (v != null && v > est) est = v;
  }
  if (!(est > 0)) return null;
  // The reps the lift was done for before the break: the middle of its sets at that session's load.
  const rs = pre.pts
    .filter(p => Math.abs(p.w - preTop) < EPS_SAME)
    .map(p => p.r)
    .sort((a, b) => a - b);
  if (!rs.length) return null;
  const preR = Math.max(+plan.repMin, Math.min(+plan.repMax, rs[Math.floor((rs.length - 1) / 2)]));
  const want = Math.min(e1inv(est, preR + Math.min(tgtRir, E1_MAX_RIR)) - bw, preTop);
  const nw = heavierLoadIn(M, ex, plan, top, cap != null ? Math.min(want, cap) : want);
  if (nw == null) return null;
  return {
    top,
    w: nw,
    text: `${lastS} Back from the break: those sets say ${lbl(nw)} fits your usual ${preR} reps, so ${lbl(nw)} next${nw < preTop - EPS_SAME ? `, on the way back to ${lbl(preTop)}` : ''}. Aim for ${plan.repMin}+ reps in every set.`,
    lastR,
    basis,
    last: lastS,
    target: `${lbl(nw)} for ${plan.repMin}+ reps in every set`,
    tgt: { kind: 'load', w: nw, repMin: +plan.repMin, prevBest },
    easier: null
  };
}

/* No history yet: an injury note, a start from a close variation, or the first-time line. */
export function sgFirstIn(M: Model, ex: ExerciseLike, plan: Plan, T: string, injM: string | null): Suggestion {
  /* An assisted lift's help is the lifter's to set the first time (the text
     says so): with none shown, a set ticked untyped is one Finish asks about,
     where a help of 0 shown saved it at full bodyweight, and the next
     session, with help typed, read as lighter (r54, from the audit V asked
     for, PENDING 315 i). Bodyweight alone is a bodyweight lift's start. */
  const w0 = ex.bw && !ex.assist ? 0 : null;
  if (injM)
    return {
      w: w0,
      text: `Injury flagged (${injLabel(injM)}). Start light, keep ${effLeast(effScale(M.s.settings.rirScale), LIGHT_RIR)}, and stop on pain.`,
      lastR: [],
      last: '',
      target: '',
      tgt: null,
      inj: injM
    };
  /* A first session (r30, from the review: "pick a load you can take to
     6-10 at 2 RIR" is no help to a beginner). Start light, in words a new
     lifter can act on. The next session's load comes from this one. */
  const rr = +plan.rir || 0;
  // One line per exercise; the warm-up is said once, in the workout preview.
  /* r31: the load and the reps agree. "A load you could lift about 17
     times, do 8 to 12 with 3 still in you" asked for two different loads,
     and it was said for push-ups and Nordics, which have no load to pick.
     Erring light is fine: the next session's load is worked out from this
     one, by up to 25% in the first sessions (jumpCap). */
  const can = +plan.repMax + Math.round(rr);
  const reps = `${repSpan(plan.repMin, plan.repMax)} rep${+plan.repMax === 1 ? '' : 's'}`;
  const stop = rr >= 1 ? `stopping with about ${rr} still in you` : 'to the last rep you can do well';
  const kin = !ex.bw ? kinStartIn(M, ex, plan, T) : null;
  if (kin)
    return {
      w: kin.w,
      text: `First time. About ${loadLabelIn(M, ex, kin.w)} ${UIn(M)}${loadNote(ex)} for ${reps}, from your ${kin.ex.name} (${kin.set}, ${fmtDate(kin.date)}), ${stop}. If the first set is off, change the load.`,
      lastR: [],
      last: '',
      target: '',
      tgt: null,
      kin: kin.ex.id
    };
  const text = ex.assist
    ? `First time: set the help so you could do about ${can} reps. Do ${reps}, ${stop}. Next time the help is set from this.`
    : ex.bw
      ? `First time: your bodyweight only. Do ${reps}, ${stop}. If ${plan.repMin} is out of reach, use an easier version; if it is easy past ${plan.repMax}, the next target says so.`
      : `First time: pick a load you think you could lift about ${can} times, erring light. Do ${reps}, ${stop}. Next time's load is worked out from this.`;
  return { w: w0, text, lastR: [], last: '', target: '', tgt: null };
}

/* Every top set 2 or more over the target reserve: the load from the estimate.
   Every top set has a RIR here (the test below), as the ! say. */
export function sgEasyIn(M: Model, C: SuggestCtx): Suggestion | null {
  const {
    ex,
    plan,
    top,
    step,
    noAdd,
    atCap,
    capW,
    topPts,
    planPts,
    lastR,
    lastS,
    basis,
    lbl,
    prevBest,
    tgtRir,
    early
  } = C;
  /* A bodyweight lift with no weigh-in has no total load for the estimate to
     read (r55, the audit: BW+5 x 10 was read as a 5 kg lift), so its load is
     never set from one. */
  if (
    step > 0 &&
    !atCap &&
    !noAdd &&
    !noE1(ex) &&
    !(ex.bw && !(bwRefLoadIn(M, ex) > 0)) &&
    planPts.length &&
    planPts.every(p => p.rir != null && p.rir >= tgtRir + CLEARLY_OFF && p.r >= plan.repMin)
  ) {
    let est: number | null = null;
    for (const p of topPts) {
      const v = fitE(p.load, p.r, Math.min(p.rir!, E1_MAX_RIR));
      if (v != null && (est == null || v > est)) est = v;
    }
    const bwNow = bwRefLoadIn(M, ex);
    const topLoad = top + bwNow;
    if (est != null && topLoad > 0) {
      const want =
        Math.min(
          e1inv(est, Math.round((+plan.repMin + +plan.repMax) / 2) + Math.min(tgtRir, E1_MAX_RIR)),
          topLoad * jumpCap(ex, topLoad, early)
        ) - bwNow;
      let k = Math.floor((want - top) / step + EPS_SAME);
      /* Every set at 5 or more in reserve, the top of the scale: the estimate
         is a floor, so at least one real step, even past the cap (r34.2, from
         the review: 20 lb curls at 5+ in reserve asked to build reps for
         weeks, a 5 lb dumbbell step being more than the cap allows). */
      const easy5 = planPts.every(p => p.rir! >= RIR_CALL_TOP);
      if (k < 1 && easy5) k = 1;
      /* From a load off a rack read from its spacing (r54): the heaviest of
         its weights the estimate allows, the next one up at least when every
         set was 5 or more in reserve (12 lb to 15). */
      const onR = offGrid(M, ex, plan, top) != null;
      const rk = onR ? (heavierLoadIn(M, ex, plan, top, want) ?? (easy5 ? top + step : null)) : null;
      if (onR ? rk != null : k >= 1) {
        const nw = rk != null ? capW(rk) : ex.assist && top < 0 ? Math.min(0, top + k * step) : capW(top + k * step);
        const rr = r1(topPts.reduce((a, p) => a + p.rir!, 0) / topPts.length);
        // In the lifter's effort scale (r54, from the audit V asked for: RPE lifters were told RIR).
        const sc = effScale(M.s.settings.rirScale);
        return {
          top,
          w: nw,
          text: `${lastS} ${sc === 'rpe' ? 'RPE' : 'RIR'} ${effAt(sc, rr)} at ${lbl(top)} against a target of ${sc === 'rpe' ? 'RPE ' : ''}${effAt(sc, tgtRir)}, so that load was light. Try ${lbl(nw)} for ${repSpan(plan.repMin, plan.repMax, '-')} reps.`,
          lastR,
          basis,
          last: lastS,
          target: `${lbl(nw)} for ${plan.repMin}+ reps in every set`,
          tgt: { kind: 'load', w: nw, repMin: +plan.repMin, prevBest },
          easier: null
        };
      }
    }
  }
  return null;
}

/* Every top set 2 or more reps over the top of the range. */
export function sgPastRangeIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, plan, top, step, noAdd, atCap, capW, topPts, lastR, lastS, basis, lbl, prevBest, tgtRir, early } = C;
  /* Well past the range: every top set at least 2 reps over repMax, which is
     what happens when the range is moved down (12s, then a 4 to 6 plan). One
     step a session would take weeks to reach a load that fits, so the same
     e1RM estimate the drop below the range uses sets the load for the middle
     of the new range at the target RIR, capped like a recalibration (jumpCap)
     and in whole steps (r27). Above 12 reps there is no estimate, so the usual
     one step applies. */
  if (
    step > 0 &&
    !atCap &&
    !noAdd &&
    !noE1(ex) &&
    topPts.length &&
    topPts.every(p => p.r >= +plan.repMax + CLEARLY_OFF)
  ) {
    let est: number | null = null;
    for (const p of topPts) {
      const v = fitE(p.load, p.r, p.rq);
      if (v != null && (est == null || v > est)) est = v;
    }
    const bwNow = bwRefLoadIn(M, ex);
    const topLoad = top + bwNow;
    if (est != null && topLoad > 0) {
      const want =
        Math.min(
          e1inv(est, Math.round((+plan.repMin + +plan.repMax) / 2) + Math.min(tgtRir, E1_MAX_RIR)),
          topLoad * jumpCap(ex, topLoad, early)
        ) - bwNow;
      const k = Math.floor((want - top) / step + EPS_SAME);
      const one = progStepIn(M, ex, plan, topLoad, top);
      // From a load off a rack read from its spacing (r54): the heaviest of its weights the estimate allows, when more than the usual step.
      const onR = offGrid(M, ex, plan, top) != null;
      const rk = onR ? heavierLoadIn(M, ex, plan, top, want) : null;
      if (onR ? rk != null && rk - top > one + EPS_SAME : k >= 1 && k * step > one + EPS_SAME) {
        const nw = rk != null ? capW(rk) : ex.assist && top < 0 ? Math.min(0, top + k * step) : capW(top + k * step);
        const minR = Math.min(...topPts.map(p => p.r));
        return {
          top,
          w: nw,
          text: `${lastS} Every set at ${lbl(top)} reached ${minR}+ reps, well past your ${rangeWords(plan)}. Try ${lbl(nw)} for ${repSpan(plan.repMin, plan.repMax, '-')} reps.`,
          lastR,
          basis,
          last: lastS,
          target: `${lbl(nw)} for ${plan.repMin}+ reps in every set`,
          tgt: { kind: 'load', w: nw, repMin: +plan.repMin, prevBest },
          easier: null
        };
      }
    }
  }
  return null;
}

/* Every top set under the range: drop to a load that fits it. */
export function sgBelowRangeIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, plan, last, done, inRR, top, step, noAdd, topPts, lastR, lastS, basis, lbl, prevBest, tgtRir } = C;
  /* Below the rep range. Every top set fell short of repMin, either by 2 or
     more reps, or by any amount two sessions running at the same load. Adding
     one rep a week from there never reaches the range, so drop the load to
     what the same e1RM estimate says leaves repMin at the target RIR. Whole
     steps down from the last load, so stacks stay on real pins. */
  if (step > 0 && !noAdd && topPts.length && topPts.every(p => p.r < +plan.repMin)) {
    const gap = +plan.repMin - Math.max(...topPts.map(p => p.r));
    // The session before last time's, short of its usual or not (r54): last time's is one of done.
    const at = done.indexOf(last);
    const prev = at >= 1 ? done[at - 1] : null;
    /* Not a drop while the reps are coming up after a step up (r31): a big
       step for the load (a dumbbell, a small stack) starts below the range
       on purpose, and dropping back made the load swing between two
       numbers. Just after one step up, short by up to 3 is that; two
       sessions short at one load drop only when the reps did not rise. */
    const prevAt = prev ? prev.pts.filter(p => Math.abs(p.w - top) < EPS_SAME) : [];
    const sumR = (a: readonly ExPoint[]): number => a.reduce((x, p) => x + p.r, 0);
    const rising = prevAt.length > 0 && sumR(topPts.slice(0, prevAt.length)) > sumR(prevAt);
    const justUp = !!prev && prev.topW < top - EPS_SAME && top - prev.topW <= step * JUST_UP.steps + EPS_SAME;
    const repeat = !!prev && Math.abs(prev.topW - top) < EPS_SAME && prevAt.every(p => p.r < +plan.repMin) && !rising;
    /* A range not yet trained (r30): history at 5 x 5 under a 6 to 10 plan
       asked for 122.5 x 16 reps over 3 sets, under the plan's minimum. The
       first session in a new range sets its load from the estimate at once,
       as a range moved down does. */
    /* Four sessions in a row under the range at one load drop it, rising or
       not (r32, second check: 5, 5, 4, 4 then 5, 5, 5, 4 then 5, 5, 5, 5
       kept the load for weeks, each "rising"). */
    let shortRun = 0;
    for (let k = at; k >= 0; k--) {
      const x = done[k];
      if (Math.abs(x.topW - top) > EPS_SAME) break;
      const at = atLoad(x.pts, x.topW);
      if (!at.length || !at.every(p => p.r < +plan.repMin)) break;
      shortRun++;
    }
    if ((gap >= CLEARLY_OFF && !(justUp && gap <= JUST_UP.short)) || repeat || !inRR || shortRun >= SHORT_RUN) {
      let est: number | null = null;
      for (const p of topPts) {
        const v = e1(p.load, p.r, p.rq);
        if (v != null && (est == null || v > est)) est = v;
      }
      const bwNow = bwRefLoadIn(M, ex);
      if (est != null) {
        const want = e1inv(est, +plan.repMin + Math.min(tgtRir, E1_MAX_RIR)) - bwNow;
        /* Whole steps down to the estimated load. None needed means the
           estimate already puts this load at repMin for the target RIR: the
           sets were stopped early, not too heavy, so the usual rep target
           below applies instead of a forced drop. */
        const k = Math.ceil((top - want) / step - EPS_SAME);
        // From a load off a rack read from its spacing (r54): the heaviest of its weights not past the estimate (12 lb to 10).
        const nw = k >= 1 && offGrid(M, ex, plan, top) ? lighterLoadIn(M, ex, plan, top, want) : top - k * step;
        if (k >= 1 && nw < top - EPS_SAME && (nw > 0 || (ex.bw && (nw >= 0 || ex.assist)))) {
          const bestR = Math.max(...topPts.map(p => p.r));
          return {
            top,
            w: nw,
            text: `${lastS} Top sets at ${lbl(top)} stopped at ${bestR} rep${bestR === 1 ? '' : 's'}, below your ${rangeWords(plan)}. Drop to ${lbl(nw)} and build back up.`,
            lastR,
            basis,
            last: lastS,
            target: `${lbl(nw)} for ${plan.repMin}+ reps in every set`,
            tgt: { kind: 'load', w: nw, repMin: +plan.repMin, prevBest },
            easier: null,
            down: true
          };
        }
      }
    }
  }
  return null;
}

/* At the heaviest load available, a fixed load, or bodyweight never loaded: reps. */
export function sgNoStep(C: SuggestCtx): Suggestion | null {
  const { plan, top, step, noAdd, abW, atCap, noHelp, topPts, lastR, lastS, basis, lbl, prevBest, tp } = C;
  /* At the heaviest load available: keep adding reps past the top of the range.
     Once every set reaches about 40% past it, the next step is harder reps
     rather than more load. A load step of 0 means the load never changes (a
     fixed dumbbell, say), so it reads the same way instead of "add 0 lb" (r27). */
  /* The rep target counts as many sets as the plan has (r30): five sets of
     history under a three-set plan read "26+ reps over your first 5 sets". */
  if (atCap || !(step > 0) || noAdd) {
    const where = atCap ? 'the heaviest load available' : noAdd ? 'your bodyweight' : 'a fixed load (load step 0)';
    // An assisted lift at no help: the unassisted lift with added load is what comes after the reps (r55).
    const at = noHelp ? 'with no help' : `at ${where}`,
      lead = noHelp ? 'With no help left' : `That is ${where}`;
    const below = topPts.every(p => p.r < +plan.repMin);
    const total = tp.reduce((a, p) => a + p.r, 0);
    const nT = tp.length;
    const over = overSets(nT, plan);
    const ext = +plan.repMax + Math.max(PAST_RANGE.min, Math.round(+plan.repMax * PAST_RANGE.share));
    const maxed = topPts.every(p => p.r >= ext);
    const tip = maxed
      ? noAdd && !abW
        ? ` Every set reached ${ext}+ on bodyweight alone. Add a little load (a belt or a vest) by typing it, or make each rep harder: a 3 to 4 second lowering, a pause, or a harder version.`
        : ` Every set reached ${ext}+ ${at}, so make each rep harder instead: lower for 3 to 4 seconds and pause at the stretch, go one arm or one leg at a time, or finish with a drop set. Add a note when you change it so the numbers stay comparable.`
      : below
        ? ` ${lead}, so build the reps up to ${plan.repMin} or more.`
        : ` ${lead}, so keep adding reps past ${plan.repMax}${noHelp ? '; the lift without the machine, with load added, comes after' : ''}.`;
    return {
      top,
      w: top,
      text: `${lastS} Beat ${total} reps ${over} at ${lbl(top)}.${tip}`,
      lastR,
      basis,
      last: lastS,
      target: `${total + 1}+ reps ${over} at ${lbl(top)}${noHelp ? '' : atCap ? ', the heaviest available' : ''}`,
      tgt: { kind: 'reps', w: top, total, n: nT, rs: tp.map(p => p.r), prevBest },
      easier: maxed
        ? `Past ${ext} reps ${noHelp ? 'with no help' : atCap ? 'at the heaviest load' : 'at this load'}: slow the lowering to 3 to 4 seconds with a pause at the stretch, go one side at a time, or add a drop set.`
        : null,
      capped: atCap
    };
  }
  return null;
}

/* Every top set at the top of the range: the next load (or more reps first when the step is large).
   With an estimate, reps to failure at the last load are read too: a null
   there (no estimate) reads as 0 in the subtraction, which the casts let
   TypeScript accept. */
export function sgTopOfRangeIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, plan, top, cap, capW, topPts, planPts, lastR, lastS, basis, lbl, prevBest, tgtRir, tp } = C;
  if (planPts.every(p => p.r >= plan.repMax)) {
    const nw = capW(top + progStepIn(M, ex, plan, top + bwRefLoadIn(M, ex), top));
    if (ex.assist) {
      const aw = top < 0 ? Math.min(0, nw) : nw;
      return {
        top,
        w: aw,
        text: `${lastS} Every set at ${lbl(top)} hit ${plan.repMax}: ${aw === 0 ? 'try it without help' : `take ${fmtWIn(M, aw - top)} ${UIn(M)} of help off`} and aim for ${plan.repMin}+ reps.`,
        lastR,
        basis,
        last: lastS,
        target: `${lbl(aw)} for ${plan.repMin}+ reps in every set`,
        tgt: { kind: 'load', w: aw, repMin: +plan.repMin, prevBest },
        easier: null
      };
    }
    /* A step that is large for the load (5 lb on a 35 lb dumbbell is 14%)
       costs more reps than the range has room for (r31, found by a
       simulated lifter following the app: 35 x 12 asked 40 for 8+, and 7
       was all there was). The target at the new load is then what the
       estimate says that load allows at the planned RIR, said as such, and
       the reps build back up from there. */
    /* A range under 3 reps wide (5 x 5, 3 x 3-5) is a fixed-rep plan: the
       load goes up a step and the reps are repeated, as those programs say,
       whatever the step costs (r32, second check: 5 x 5 at 50 kg asked for
       reps past 5 instead of 52.5). A miss is caught by the drop below the
       range. */
    const wide = +plan.repMax - +plan.repMin >= FIXED_RANGE;
    let aim = +plan.repMin;
    const q = Math.min(tgtRir, E1_MAX_RIR);
    const bwT = bwRefLoadIn(M, ex);
    // Not on a bodyweight lift with no weigh-in, which has no total load to read the step against (r55, as sgEasyIn).
    if (!noE1(ex) && !(ex.bw && !(bwT > 0))) {
      let est: number | null = null;
      for (const p of topPts) {
        const v = fitE(p.load, p.r, p.rq);
        if (v != null && (est == null || v > est)) est = v;
      }
      /* Only a step that costs 1.5 reps or more is large for the load (about
         5% or more, r32): a 5 lb step on a 5 x 5 at 225 costs under one, and
         a fixed-rep plan goes up and repeats the reps, the drop below the
         range catching a miss. Read against the planned RIR alone, a 5 x 5
         at 335 with no RIR rated (read as 0) made 5 lb (1.5%) look like two
         reps. */
      const f = est ? rtfAt(est, nw + bwT) : null;
      // f is read only from an estimate, so est is there, as the ! says.
      const cost = f != null ? (rtfAt(est!, top + bwT) as number) - f : 0;
      if (f != null && cost >= BIG_STEP_REPS && wide) {
        const can = Math.floor(f - q + EPS);
        if (can < aim) aim = Math.max(1, can);
      }
    }
    // Not when every set was rated 5 or more in reserve: the estimate is only a floor there (r34.2).
    if (topPts.every(p => p.rir != null && p.rir >= RIR_CALL_TOP)) aim = +plan.repMin;
    const big = aim < +plan.repMin;
    /* Before such a step, a few more reps at this load first (r32, from the
       third review: a cable fly asked "20 kg for 9+" on a 10-15 plan, the
       app aiming under its own range). The reps to build to are those that
       make the new load reachable for the bottom of the range at the planned
       RIR, by the same estimate, and at most a quarter of the top of the
       range past it (at least 2). Once there, the step is taken, with the
       lower aim if the estimate still says so (a plan of curls for 5 on 5 lb
       dumbbell steps asked "aim for 1+" without this cap). */
    if (big && nw + bwT > 0 && top + bwT > 0) {
      const rn = +plan.repMin + q;
      const need = e1At(nw + bwT, rn);
      const ext2 = +plan.repMax + Math.max(BUILD_PAST.min, Math.round(+plan.repMax * BUILD_PAST.share));
      const Z = Math.min(ext2, Math.ceil((rtfAt(need, top + bwT) as number) - q - EPS));
      const minR = Math.min(...topPts.map(p => p.r));
      if (Z > minR) {
        const total = tp.reduce((a, p) => a + p.r, 0);
        const nT = tp.length;
        const over = overSets(nT, plan);
        return {
          top,
          w: top,
          text: `${lastS} Every set at ${lbl(top)} hit ${plan.repMax}. The next step, ${fmtWIn(M, nw - top)} ${UIn(M)}, is large for this load, so build every set to ${Z} here first; then the new load starts inside your range.`,
          lastR,
          basis,
          last: lastS,
          target: `${total + 1}+ reps ${over} at ${lbl(top)}, building to ${Z} each`,
          tgt: { kind: 'reps', w: top, total, n: nT, rs: tp.map(p => p.r), prevBest },
          easier: null,
          buildTo: Z
        };
      }
    }
    return {
      top,
      w: nw,
      text: `${lastS} Every set at ${lbl(top)} hit ${plan.repMax}: add ${fmtWIn(M, nw - top)} ${UIn(M)}${cap != null && nw >= cap - EPS_SAME ? ', which is the heaviest available,' : ''} and aim for ${aim}+ reps${big ? `, then build back to ${plan.repMax}. That step is large for this load, so fewer reps than the range is expected at first` : ''}.`,
      lastR,
      basis,
      last: lastS,
      target: `${lbl(nw)} for ${aim}+ reps in every set`,
      tgt: { kind: 'load', w: nw, repMin: aim, prevBest },
      easier: null
    };
  }
  return null;
}

/* A bad day under the range at a load done in it before: the bottom of the range again. */
export function sgBadDay(C: SuggestCtx): Suggestion | null {
  const { plan, last, done, top, topPts, lastR, lastS, basis, lbl, prevBest } = C;
  /* A bad day at a load already done in the range (r32, second check: 7,
     7, 6, 6 then 5, 5, 4, 4 asked "19+ reps" and greyed 5, 5, 4, 4): every set
     under the range, the session before at this load in it. The target is
     the bottom of the range in every set again, not one rep more than the
     bad day. */
  {
    // The session before, short of its usual or not (r54), as in sgBelowRangeIn.
    const at = done.indexOf(last);
    const prv = at >= 1 ? done[at - 1] : null;
    const pAt = prv && Math.abs(prv.topW - top) < EPS_SAME ? atLoad(prv.pts, top) : [];
    if (topPts.length && topPts.every(p => p.r < +plan.repMin) && pAt.length && pAt.every(p => p.r >= +plan.repMin))
      return {
        top,
        w: top,
        text: `${lastS} Every set fell under ${plan.repMin} at ${lbl(top)}, where you did ${plan.repMin}+ the time before. Stay at ${lbl(top)} and get back to ${plan.repMin}+ in every set.`,
        lastR,
        basis,
        last: lastS,
        target: `${lbl(top)} for ${plan.repMin}+ reps in every set`,
        tgt: { kind: 'load', w: top, repMin: +plan.repMin, prevBest },
        easier: null
      };
  }
  return null;
}

/* Otherwise: beat last time's reps at the same load. */
export function sgRepsIn(M: Model, C: SuggestCtx): Suggestion {
  const { ex, plan, stx, top, topPts, lastR, lastS, basis, lbl, prevBest, tp } = C;
  /* The rep target covers the same number of sets as last time, so an extra
     set can never count as progress on its own. A set under the range that
     counts as the bottom of it (repFloor) is said. A set past the top counts
     as the top (r55, a convention, from the audit: 70 x 11, 11, 9 and 10 on
     6 to 10 asked 42+ reps over 4 sets, more than 10 a set can make, and 10
     x 4 then read as missed while it moved the load up): every set at the
     top is what moves the load, so reps past it make up for no short set. */
  const hi = +plan.repMax;
  const tc = tp.map(p => ({ ...p, r: Math.min(p.r, hi) }));
  const total = tc.reduce((a, p) => a + p.r, 0);
  const nT = tc.length;
  const over = overSets(nT, plan);
  const floored = tp.some((p, i) => topPts[i] && topPts[i].r < p.r)
    ? ` (a set under ${plan.repMin} counts as ${plan.repMin})`
    : '';
  const topped = tp.some(p => p.r > hi) ? ` (a set past ${hi} counts as ${hi})` : '';
  return {
    top,
    w: top,
    text: `${lastS} Beat ${total} reps ${over} at ${lbl(top)}${floored}${topped}. When every set at that load reaches ${plan.repMax}, ${ex.assist ? 'take some help off' : 'add load'}.`,
    lastR,
    basis,
    last: lastS,
    target: `${total + 1}+ reps ${over} at ${lbl(top)}`,
    tgt: { kind: 'reps', w: top, total, n: nT, rs: tc.map(p => p.r), prevBest },
    easier: stx.easier ? easierTextIn(M, ex, stx.easier) : null
  };
}

/* A first session of a close variation (r32.1, from r32's second check: a
   swap from DB curl to hammer curl started from nothing). A lift with no
   history borrows a start from a related lift trained in the last 120 days:
   same equipment, load meaning (per dumbbell, total, stack), one side or two,
   main muscle and movement, neither on bodyweight, timed or without an
   estimate. Machines and cables are left out: two machines' numbers do not
   compare. The newest such lift's last full session gives an estimate from
   its working sets; the start is 90% of it (80% on a compound lift, where
   variations differ more: a front squat is well under a back squat), for the
   middle of the range with one more rep in reserve than planned, rounded
   down to the step (the related lift's rack for dumbbells). Conventions,
   meant to err light; the next session works out from what was done. Each
   id read from IDX's byEx comes from its own keys, so it is there, as the !
   says. */
export function kinOfIn(
  M: Model,
  ex: ExerciseLike | null | undefined,
  T: string
): { ex: ExerciseLike; x: Exposure } | null {
  if (
    !ex ||
    ex.bw ||
    ex.assist ||
    ex.timed ||
    noE1(ex) ||
    !['barbell', 'dumbbell', 'kettlebell', 'landmine', 'other'].includes(ex.equip)
  )
    return null;
  const pat = patternOf(ex);
  if (!pat) return null;
  const I = IDXIn(M);
  let best: { ex: ExerciseLike; x: Exposure } | null = null;
  const from = addDays(T, -KIN.days);
  for (const id of Object.keys(I.byEx)) {
    if (id === ex.id) continue;
    const e = EXIn(M, id);
    if (
      !e ||
      e.archived ||
      e.bw ||
      e.assist ||
      e.timed ||
      noE1(e) ||
      e.equip !== ex.equip ||
      loadMode(e) !== loadMode(ex) ||
      !!e.perSide !== !!ex.perSide ||
      KIN_UNI.test(e.name) !== KIN_UNI.test(ex.name) ||
      e.primary !== ex.primary ||
      patternOf(e) !== pat
    )
      continue;
    const xs = I.byEx[id]!.filter(x => x.date <= T && !offTarget(x));
    const x = xs[xs.length - 1];
    if (!x || x.date < from) continue;
    if (!best || x.date > best.x.date) best = { ex: e, x };
  }
  return best;
}

/* The start a close variation gives a lift with no history (above): the
   related lift, the session it came from, the load, and the set it was read
   from. The best set is kept with the estimate, as the ! after set says;
   toD and fromD of a number are numbers, as the other ! say. */
export function kinStartIn(
  M: Model,
  ex: ExerciseLike,
  plan: Plan,
  T: string
): { ex: ExerciseLike; date: string; w: number; set: string } | null {
  const k = kinOfIn(M, ex, T);
  if (!k) return null;
  const x = k.x;
  const wl = workLoad(x.pts, +plan.repMin || 0);
  const at = atLoad(x.pts, wl);
  let est: number | null = null,
    set: ExPoint | null = null;
  for (const p of at) {
    const v = fitE(p.load, p.r, p.rq);
    if (v != null && (est == null || v > est)) {
      est = v;
      set = p;
    }
  }
  if (est == null) return null;
  const mid = Math.round((+plan.repMin + +plan.repMax) / 2);
  const q = Math.min((+plan.rir || 0) + FATIGUE_RIR, E1_MAX_RIR);
  const want = e1inv(est * (isCompound(ex) ? KIN.compound : KIN.isolation), mid + q);
  const L = gymRackIn(M, ex, plan);
  let w: number;
  if (L) {
    const c = L.filter(x => x <= want + EPS_SAME);
    if (!c.length) return null;
    w = c[c.length - 1];
  } else {
    const rs = rackKind(ex) && rackKind(k.ex) ? rackStepIn(M, k.ex) : null;
    const st = toDIn(M, rs || incOfIn(M, ex, plan))!;
    if (!(st > 0)) return null;
    w = fromDIn(M, Math.floor(toDIn(M, want)! / st + EPS) * st)!;
  }
  if (!(w > 0)) return null;
  return { ex: k.ex, date: x.date, w, set: `${loadLabelIn(M, k.ex, set!.w)}×${set!.r}` };
}

/* Timed holds: double progression on seconds. Beat the total time at the same
   load; when every hold reaches the top of the range, add the load step. */
export function suggestTimedIn(
  M: Model,
  ex: ExerciseLike,
  plan: Plan,
  exps: Exposure[] | null | undefined,
  opts: SuggestOpts | null | undefined,
  injM: string | null,
  all: Exposure[] | null | undefined
): Suggestion {
  opts = opts || {};
  const side = ex.perSide ? ' per side' : '';
  if (!exps || !exps.length) {
    if (injM)
      return {
        w: ex.bw ? 0 : null,
        text: `Injury flagged (${injLabel(injM)}). Keep holds short and easy, and stop on pain.`,
        lastR: [],
        last: '',
        target: '',
        tgt: null,
        inj: injM
      };
    return {
      w: ex.bw ? 0 : null,
      text: `No history yet. Hold for ${repSpan(plan.repMin, plan.repMax, '-')} seconds${side} each set.`,
      lastR: [],
      last: '',
      target: '',
      tgt: null
    };
  }
  const last = exps[exps.length - 1],
    ws = last.pts;
  const top = Math.max(...ws.map(p => p.w));
  const topPts = ws.filter(p => Math.abs(p.w - top) < EPS_SAME);
  const lbl = (w: number): string => `${loadLabelIn(M, ex, w)}${ex.bw ? '' : ' ' + UIn(M)}${loadNote(ex)}`;
  const L0 = lastOf(all, last, p => `${loadLabelIn(M, ex, p.w)} for ${p.r}s`);
  const lastR = L0.lastR,
    lastS = L0.line,
    basis = L0.basis;
  if (injM)
    return {
      prev: L0.prev,
      prevOff: L0.prevOff,
      w: top,
      text: `${lastS} Injury flagged (${injLabel(injM)}): stay at or below ${lbl(top)}, keep it easy, and stop on pain.`,
      lastR,
      basis,
      last: lastS,
      target: '',
      tgt: null,
      easier: null,
      inj: injM
    };
  if (opts.deload || opts.light)
    return {
      prev: L0.prev,
      prevOff: L0.prevOff,
      w: top,
      text: `${lastS} ${opts.deload ? 'Deload' : 'Lighter day'}: same load, hold about two thirds as long, and stop well before shaking.`,
      lastR,
      basis,
      last: lastS,
      target: '',
      tgt: null,
      easier: null
    };
  /* Back after a break, as any lift is (r55, from the audit: a plank seven
     weeks off was asked to beat its last time): the same load, holds about
     90% as long (the lighter day's 90%, r32, a convention), nothing to beat,
     and the next session picks up from this one. */
  const off = backDaysIn(M, ex.id, plan, opts);
  if (off > BACK_DAYS)
    return {
      prev: L0.prev,
      prevOff: L0.prevOff,
      w: top,
      text: `${lastS} Back after ${Math.round(off / WEEK_DAYS)} weeks: the same load, holds about ${pctOf(LIGHT_SHARE)}% as long, stopping before shaking. Next time picks up from here.`,
      lastR: lastR.map(r => Math.max(1, Math.round(r * LIGHT_SHARE))),
      basis,
      last: lastS,
      target: '',
      tgt: null,
      easier: null,
      back: Math.round(off / WEEK_DAYS)
    };
  const step = incOfIn(M, ex, plan, top);
  const cap = capOfIn(M, ex, plan, top);
  if (step > 0 && topPts.every(p => p.r >= plan.repMax) && !atCapOfIn(M, ex, plan, top, cap)) {
    const nw = cap != null ? Math.min(top + step, cap) : top + step;
    return {
      prev: L0.prev,
      prevOff: L0.prevOff,
      w: nw,
      text: `${lastS} Every hold at ${lbl(top)} reached ${plan.repMax}s: add ${fmtWIn(M, nw - top)} ${UIn(M)}${ex.bw ? ' (a plate or a vest)' : ''} and aim for ${plan.repMin}s+.`,
      lastR,
      basis,
      last: lastS,
      target: `${lbl(nw)} for ${plan.repMin}s+ in every set`,
      tgt: { kind: 'load', w: nw, repMin: +plan.repMin, prevBest: null },
      easier: null
    };
  }
  const total = topPts.reduce((a, p) => a + p.r, 0);
  const nT = topPts.length;
  const over = overSets(nT, plan, 'hold');
  return {
    prev: L0.prev,
    prevOff: L0.prevOff,
    w: top,
    text: `${lastS} Beat ${total}s ${over} at ${lbl(top)}. When every hold reaches ${plan.repMax}s, add load.`,
    lastR,
    basis,
    last: lastS,
    target: `${total + 1}s+ ${over} at ${lbl(top)}`,
    tgt: { kind: 'reps', w: top, total, n: nT, rs: topPts.map(p => p.r), prevBest: null },
    easier: null
  };
}

/* `at`: the load the step is taken from. Only a rack from Your gym needs it
   (r33): its spacing can change along the rack (2.5 lb steps to 25, then 5). */
/** A lift's load step in kg: its own, the plan's, the gym's rack or plates, or the rack read from its loads. */
export function incOfIn(
  M: Model,
  ex: ExerciseLike | null | undefined,
  plan?: Pick<Plan, 'inc'> | null,
  at?: number | null
): number {
  const v = stepReadIn(M, ex && ex.inc != null ? ex.inc : plan && isNum(+plan.inc) ? +plan.inc : STEP_LB);
  if (ex && ex.inc == null && Math.abs(v - unitStepIn(M)) < EPS_SAME) {
    const L = gymRackIn(M, ex, plan);
    if (L) return rackGapIn(M, L, at);
    // On a rack read from its spacing (rackGridIn): the spacing, or from a load off its weights the way to the next one up.
    const gr = rackGridIn(M, ex, plan, at);
    if (gr) return at != null && at > 0 && offGrid(M, ex, plan, at) ? gridStep(M, gr, at, 1) - at : gr;
    const G = plateGridIn(M, ex, plan);
    const t = rackTolIn(M);
    if (G && at != null && at > 0 && Math.abs(plateAt(G, at, -1, t) - at) > t) return plateAt(G, at, 1, t) - at;
    const gs = gymStepIn(M, ex);
    if (gs) return gs;
  }
  return v;
}

/* A suggestion that is not on the rack moves onto it: up, to the heaviest
   rack weight not past it that is still above last time; down, to the
   heaviest not past it. A load equal to last time's is left, since it was
   lifted. Engine steps are taken from the rack already, so this is the net
   for multi-step jumps on a rack whose spacing changes. */
export function rackSnapIn(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion): Suggestion {
  if (!res || res.w == null || ex.timed) return res;
  const L = gymRackIn(M, ex, plan);
  if (!L) return gridSnap(M, ex, plan, res);
  const w = res.w,
    top = res.top,
    tl = rackTolIn(M),
    tt = rackTolIn(M, L, top);
  if (L.some(x => Math.abs(x - w) < EPS_SAME) || (top != null && Math.abs(w - top) < EPS_SAME)) return res;
  const dn = L.filter(x => x <= w + tl);
  let nw: number | undefined;
  if (top != null && w > top) {
    const c = dn.filter(x => x > top + tt);
    nw = c.length ? c[c.length - 1] : L.find(x => x > top + tt);
  } else nw = dn.length ? dn[dn.length - 1] : L[0];
  return nw == null || Math.abs(nw - w) < EPS ? res : swapWIn(M, ex, res, nw);
}

/* Dumbbells and kettlebells come in fixed weights (r32, from the third
   review: 12 kg dumbbells went to 14.5, which no rack has). With no step set
   on the exercise, the step is the largest common rack spacing that every
   load logged on it fits: 12, 14 and 16 kg is a rack in 2 kg steps, 12.5 and
   15 one in 2.5. Loads that fit both (10, 20) keep the default. Steps are
   read in the unit on screen, since that is what the rack is labelled in.
   It is asked only of a dumbbell or kettlebell lift (its callers test
   rackKind first), as the ! after rackKind says, and toD of a number is a
   number, as the other ! says. With nothing logged yet, the load in hand
   (`at`) is the one weight of the rack known, read the same way (r54, from
   the audit V asked for: a first session's 6 kg dumbbells, done easily, were
   stepped to 8.5 kg, which no rack has, and the 6, 8.5 and 11 kg logged after
   read as a rack in 0.5 kg steps for the next twelve sessions); it is not
   kept, since it changes with the load. The loads are read from the newest
   session back (PENDING 338 C): an older session whose loads fit only a
   spacing that is no step of the newer ones' (2.5 kg against 2) is another
   gym's, so it and those before it are left out. Read all together, 22.5,
   25 and 27.5 kg, then 24 at a gym in 2 kg steps, fit only 0.5 kg, and 24.5
   was asked, which neither rack has. A spacing that is a step of the other
   (5 lb and 2.5) is the same rack read more closely. */
export function rackStepIn(M: Model, ex: ExerciseLike, at?: number | null): number | null {
  const I = IDXIn(M);
  I._rack = I._rack || {};
  const key = UIn(M) + ex.id;
  const fit = (ws: readonly number[]): number | null => {
    const fits = (g: number): boolean => ws.every(w => Math.abs(w / g - Math.round(w / g)) < RACK_FIT);
    const g = RACK[rackKind(ex)!][UIn(M)].find(fits);
    return g ? fromDIn(M, g) : null;
  };
  if (I._rack[key] === undefined) {
    const steps = (a: number, b: number): boolean => Math.abs(a / b - Math.round(a / b)) < RACK_FIT;
    let ws: number[] = [],
      g: number | null = null;
    for (const x of (I.byEx[ex.id] || []).slice(-RACK_READ_N).reverse()) {
      const own: number[] = [];
      for (const p of x.pts) if (p.w > 0) own.push(toDIn(M, p.w)!);
      if (!own.length) continue;
      const f = fit([...ws, ...own]);
      if (ws.length && f !== g) {
        const h = fit(own);
        if (f == null || g == null || h == null || !(steps(g, h) || steps(h, g))) break;
      }
      ws = [...ws, ...own];
      g = f;
    }
    I._rack[key] = g;
  }
  const logged = (I.byEx[ex.id] || []).some(x => x.pts.some(p => p.w > 0));
  const d = logged || at == null || !(at > 0) ? null : toDIn(M, at);
  return d == null ? I._rack[key] : fit([d]);
}

/* A rack read from its spacing (r54): a dumbbell or kettlebell lift with no
   step of its own, whose bells Your gym does not list, has its weights at
   the multiples of the spacing rackStepIn reads, so a weight off them steps
   to the rack's next one rather than by the spacing from where it is. Lb
   dumbbells are read on 5 lb, or 2.5 lb where the weights are on it, never
   1 (V's call of 2026-10-18, after the review of r54: with nothing logged,
   12 lb went up to 13, which no lb rack has): 12 lb steps to 15 and 8 to
   10. Kettlebells, and dumbbells in kg, read on the spacing their weights
   fit, as since r32. A load on the rack's weights steps by the spacing from
   where it is, as since r32, to the same number; a load off them (offGrid)
   steps to the rack's next weight in every path that steps a load: the step
   (incOfIn), progression (progStepIn), lighter loads (lighterLoadIn),
   heavier ones (heavierLoadIn), the engine's cases that take several steps
   at once, and the snap of a suggestion onto the rack (rackSnapIn). */
/** A dumbbell or kettlebell lift's rack spacing in kg when its weights are read from it, or null. */
export function rackGridIn(
  M: Model,
  ex: ExerciseLike | null | undefined,
  plan?: Pick<Plan, 'inc'> | null,
  at?: number | null
): number | null {
  if (!ex || ex.assist || ex.inc != null || !rackKind(ex) || gymRackIn(M, ex, plan)) return null;
  if (Math.abs(stepReadIn(M, plan && isNum(+plan.inc) ? +plan.inc : STEP_LB) - unitStepIn(M)) > EPS_SAME) return null;
  return rackStepIn(M, ex, at) || (UIn(M) === 'lb' && rackKind(ex) === 'dumbbell' ? RACK.dumbbell.lb[0] * LB : null);
}

/* A rack's weights are counted in the unit it is labelled in, the unit on
   screen, and each comes back as kg the way a load typed in that unit does,
   so 10 lb from the rack is the 10 lb a lifter types (a multiple of the
   spacing in kg carries the conversion's last digits). The spacing is read
   to the precision its values have (5, 2.5, 2, 1, 0.5). */
const gridD = (M: Model, g: number): number => Math.round(inUnitIn(M, g) * MILLIONTHS) / MILLIONTHS;

/* The rack weight above (dir 1) or below (dir -1) a load on a spacing, in
   kg: a load within half the last shown digit of a rack weight is that
   weight (rackTolIn), so 15 lb shown from a kg number is 15. */
function gridStep(M: Model, g: number, at: number, dir: 1 | -1): number {
  const gd = gridD(M, g),
    ad = inUnitIn(M, at),
    t = inUnitIn(M, rackTolIn(M));
  return kgOfIn(M, (dir > 0 ? Math.floor((ad + t) / gd) + 1 : Math.ceil((ad - t) / gd) - 1) * gd);
}

/* The heaviest rack weight on a spacing not past a load by more than `tol`, all in kg. */
function gridFloor(M: Model, g: number, w: number, tol: number): number {
  const gd = gridD(M, g);
  return kgOfIn(M, Math.floor((inUnitIn(M, w) + inUnitIn(M, tol)) / gd) * gd);
}

/* The spacing of a rack read from its spacing when a load is off its
   weights (12 lb on a 5 lb rack), else null: within half the last shown
   digit of a multiple is on it. */
function offGrid(M: Model, ex: ExerciseLike, plan: Pick<Plan, 'inc'> | null | undefined, at: number): number | null {
  const g = rackGridIn(M, ex, plan, at);
  if (g == null) return null;
  const gd = gridD(M, g),
    ad = inUnitIn(M, at);
  return Math.abs(ad - Math.round(ad / gd) * gd) > inUnitIn(M, rackTolIn(M)) ? g : null;
}

/* A suggestion off a rack read from its spacing moves onto it, as on a rack
   from Your gym (rackSnapIn): up, to the heaviest rack weight not past it
   that is still above last time; down, to the heaviest not past it, at
   least the lightest. A load equal to last time's is left, since it was
   lifted. */
function gridSnap(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion): Suggestion {
  const w = res.w,
    top = res.top;
  const g = w == null || ex.timed ? null : rackGridIn(M, ex, plan, top);
  if (w == null || g == null) return res;
  const t = rackTolIn(M);
  const dn = gridFloor(M, g, w, t);
  if (Math.abs(dn - w) <= t || (top != null && Math.abs(w - top) < EPS_SAME)) return res;
  const nw = top != null && w > top ? Math.max(dn, gridStep(M, g, top, 1)) : Math.max(dn, gridStep(M, g, 0, 1));
  return Math.abs(nw - w) < EPS ? res : swapWIn(M, ex, res, nw);
}

/* When every set reaches the top of the range, the load goes up by whole
   multiples of the smallest step you can add, sized to about 2.5% of the
   load on compound lifts and 5% on isolation lifts. A fixed 5 lb was 20% on a
   25 lb raise and 1% on a 500 lb leg press. A rack is read only with a load
   to step from (at), as the ! say. */
export function progStepIn(M: Model, ex: ExerciseLike, plan: Plan, loadKg: number, at?: number | null): number {
  const L = at != null ? gymRackIn(M, ex, plan) : null;
  /* On a rack: the heaviest rack weight within the jump, at least the next one up. */
  if (L) {
    const ta = rackTolIn(M, L, at);
    const up = L.filter(x => x > at! + ta);
    if (!up.length) return rackGapIn(M, L, at);
    const want = at! + jumpPct(ex, plan) * Math.max(0, loadKg);
    let nw = up[0];
    for (const x of up) if (x <= want + EPS_SAME) nw = x;
    return nw - at!;
  }
  // From a load off a rack read from its spacing (offGrid, r54): the same, its weights the spacing's multiples.
  if (at != null) {
    const gr = offGrid(M, ex, plan, at);
    if (gr)
      return (
        Math.max(gridStep(M, gr, at, 1), gridFloor(M, gr, at + jumpPct(ex, plan) * Math.max(0, loadKg), EPS_SAME)) - at
      );
  }
  const inc = incOfIn(M, ex, plan, at);
  if (!(inc > 0)) return inc;
  const pct = jumpPct(ex, plan);
  return inc * Math.max(1, Math.floor((pct * Math.max(0, loadKg)) / inc + EPS));
}

/** The note that a lift is getting easier at a load (RIR climbing at the same reps), for the session. */
export function easierTextIn(M: Model, ex: ExerciseLike, e: Drift): string {
  // In the lifter's effort scale (r54, from the audit V asked for).
  const sc = effScale(M.s.settings.rirScale);
  return `Getting easier at ${loadLabelIn(M, ex, e.w)}${ex.bw ? '' : ' ' + UIn(M)}: ${sc === 'rpe' ? 'RPE' : 'RIR'} ${effAt(sc, e.from)} → ${effAt(sc, e.to)} at the same reps. Adding load today is reasonable.`;
}

/* The lightest load a lift can be given (r27): the empty bar on a lift on the
   full bar (bench, squat, rows) typed as the total. Curls and skull crushers
   are often on an EZ or fixed bar lighter than the bar weight setting, and a
   per-side number has no bar in it, so neither has one. An exercise with no
   bar of its own set reads as none. */
/** The lightest load a lift can be given: the empty bar where one applies, else 0. */
export function loadFloorIn(M: Model, ex: ExerciseLike): number {
  return platesMode(ex) === 'bar' && loadMode(ex) === 'total' && (isCompound(ex) || (ex.barKg ?? 0) > 0)
    ? exBarKgIn(M, ex)
    : 0;
}

/* A load at or below `to`, reached from `from` in whole steps of the
   exercise's own load step, so a stack stays on its pins and a dumbbell rack
   on its dumbbells, and never below the empty bar on a barbell lift (r27).
   It used to round to the nearest 5 lb or 2.5 kg whatever the equipment: a
   15 lb cable raise deloaded to 10, a 150 lb stack with 10 lb pins to 135, a
   95 lb bench warmed up at 40, under the bar. With no step set, it rounds
   down to 5 lb or 2.5 kg as before. May return `from` when nothing lighter
   exists (the bar itself). */
export function lighterLoadIn(
  M: Model,
  ex: ExerciseLike,
  plan: Pick<Plan, 'inc'> | null | undefined,
  from: number,
  to: number
): number {
  // On a rack from Your gym: the heaviest bell not past `to` and under `from`, else the lightest under `from`.
  const L = gymRackIn(M, ex, plan);
  if (L) {
    const tl = rackTolIn(M),
      tf = rackTolIn(M, L, from);
    const lo = L.filter(x => x < from - tf);
    if (!lo.length) return Math.max(0, from);
    const c = lo.filter(x => x <= to + tl);
    return c.length ? c[c.length - 1] : lo[0];
  }
  // From a load off a rack read from its spacing (offGrid, r54): the same, its weights the spacing's multiples.
  const og = offGrid(M, ex, plan, from);
  if (og) {
    const dn = gridStep(M, og, from, -1),
      first = gridStep(M, og, 0, 1);
    if (dn < first - EPS_SAME) return Math.max(0, from);
    const c = gridFloor(M, og, to, rackTolIn(M));
    return c >= first - EPS_SAME ? Math.min(dn, c) : first;
  }
  // On Your gym's plates (plateGridIn, r55.1): the heaviest load they make not past `to` and under `from`; the bar keeps the bar.
  const G = plateGridIn(M, ex, plan);
  if (G) {
    const t = rackTolIn(M);
    return from <= G.bar + t
      ? Math.max(0, from)
      : Math.min(plateAt(G, to, -1, t), plateAt(G, from - G.step / 2, -1, t));
  }
  const step = incOfIn(M, ex, plan, from);
  let w: number;
  if (step > 0) {
    const k = Math.max(1, Math.ceil((from - to) / step - EPS_SAME));
    w = from - k * step;
  } else w = roundLoadIn(M, to, true);
  // At the bar itself nothing lighter exists, so `from` comes back and a deload keeps the bar.
  const floor = loadFloorIn(M, ex);
  if (w < floor - EPS_SAME) w = Math.min(floor, from);
  /* Nor under the lightest of a rack's dumbbells or bells (r54): a Lighter
     day on 5 lb lateral raises was "about 0 lb per dumbbell" until then, as a
     2.5 lb, 2 kg or 1 kg one was. */
  const gr = rackGridIn(M, ex, plan, from);
  if (gr && w < gridStep(M, gr, 0, 1) - EPS_SAME) w = Math.min(gridStep(M, gr, 0, 1), from);
  return Math.max(0, w);
}

/* A load above `from` and not past `to`, or null when the next one is past
   it (r34, for adjusting the next sets; moved from the legacy script in r54
   to read the rack from its spacing): on a rack from Your gym, the heaviest
   bell between them; on a rack read from its spacing, the heaviest of its
   weights between them; else whole steps of the lift's step from `from`. */
/** The heaviest load above `from` and not past `to` on the lift's rack or steps, or null. */
export function heavierLoadIn(
  M: Model,
  ex: ExerciseLike,
  plan: Pick<Plan, 'inc'> | null | undefined,
  from: number,
  to: number
): number | null {
  const L = gymRackIn(M, ex, plan);
  if (L) {
    const tl = rackTolIn(M),
      tf = rackTolIn(M, L, from);
    const c = L.filter(x => x > from + tf && x <= to + tl);
    return c.length ? c[c.length - 1] : null;
  }
  const og = offGrid(M, ex, plan, from);
  if (og) {
    const c = gridFloor(M, og, to, rackTolIn(M));
    return c >= gridStep(M, og, from, 1) - EPS_SAME ? c : null;
  }
  const G = plateGridIn(M, ex, plan);
  if (G) {
    const t = rackTolIn(M),
      c = plateAt(G, to, -1, t);
    return c > from + t ? c : null;
  }
  const step = incOfIn(M, ex, plan, from);
  if (!(step > 0)) return null;
  const k = Math.floor((to - from) / step + EPS_SAME);
  return k >= 1 ? from + k * step : null;
}

/* A load far off (r55, V 2026-10-19: 300 typed after two sets of 50, logged
   without a word). Before a working set is logged the app asks, Log it or
   Fix it, when its load is more than three times the heaviest set ticked in
   the session, or under a third of it, or more than twice the heaviest ever
   logged on the lift (or in the session, when that is heavier). Conventions,
   set to catch a slipped digit or a load typed in the other unit and to
   leave real training alone: a ramp of warm-ups not marked as such climbs
   less than threefold a set (the bar and then a plate a side is three times,
   which does not ask), a back-off set is rarely under half the top set, and
   no lift doubles its best in a session. Loads are read as moved, a
   bodyweight lift's share of the bodyweight added, so its first added load
   is no jump from nothing; an assisted lift (its help typed) and a timed hold
   are not asked about. Null when nothing is far off, else the reason. */
export const ODD_SESSION = 3;
/** How many times a lift's heaviest logged load a set may be before the app asks (r55, a convention, above). */
export const ODD_BEST = 2;
/* A set ticked with 0 reps at a load well under the session's working load
   (r55.1, V 2026-10-19): at a warm weight a slip of the finger is likelier
   than a missed attempt, so it is asked about, Log it as missed or Fix it,
   where at or near the working load a 0 is logged as missed at once. Well
   under is under LIGHTER_LOAD of the heavier of the block's suggested load and
   the heaviest working set done today, the share a lighter session is read by
   (a convention). Loads are compared as moved, a bodyweight lift's with its
   share of bodyweight (as oddLoadIn compares them), so a 0 at bodyweight after
   bodyweight sets is not asked and one after sets with 20 kg added is. A
   warm-up, a drop, a timed hold and an assisted lift (its load is help) are
   never asked. */
/** Whether a ticked 0 on a row is at a load well under the session's working load, and so asked about. */
export function lightZeroIn(M: Model, b: DraftBlock, si: number, date: string): boolean {
  const s = b.sets[si];
  if (!s || s.warm || s.drop || !isMissed(s)) return false;
  const ex = EXIn(M, b.exId);
  const w = effW(b, si);
  if (ex.assist || ex.timed || w == null) return false;
  const bw = bwLoadIn(M, ex, date);
  let work = b.sw != null && b.sw > 0 ? bw + b.sw : 0;
  b.sets.forEach((x, i) => {
    if (i !== si && x.done && !x.warm && !x.drop && isWork(x) && x.w != null) work = Math.max(work, bw + x.w);
  });
  return work > 0 && bw + w >= 0 && bw + w < work * LIGHTER_LOAD - EPS;
}

/* A load under the bar (V on the r59 preview, 2026-10-25: a set of barbell
   bench could be logged at 0 lb, "unless you're bench pressing air"). On a
   lift on the full bar typed as the total (loadFloorIn), no set, a warm-up
   or a drop included, is lighter than the empty bar: a load under it is a
   slip, or a lighter bar not yet set, so it is asked about as a load far off
   is, naming the bar where it is set (the exercise's own, else Settings'). A
   load within half the last digit shown of the bar is the bar (rackTolIn). A
   barbell curl or skull crusher has no floor (an EZ or fixed bar is often
   lighter), nor a load typed per side. */
function underBarIn(M: Model, b: DraftBlock, si: number): string | null {
  const ex = EXIn(M, b.exId);
  const w = effW(b, si);
  if (!b.sets[si] || ex.assist || ex.timed || w == null) return null;
  const bar = loadFloorIn(M, ex);
  if (!(bar > 0) || w >= bar - rackTolIn(M)) return null;
  const say = (x: number): string => `${loadLabelIn(M, ex, x)} ${UIn(M)}`;
  return (ex.barKg ?? 0) > 0
    ? `${say(w)} is under this lift's ${say(bar)} bar.`
    : `${say(w)} is under the ${say(bar)} bar set in Settings.`;
}

/* Why a set's load is far off its session or the lift's log (a working set
   only, above), or under the bar (any set, underBarIn), or null. The
   comparisons with the session and the log come first, as the more specific;
   the bar answers when they do not. */
/** Why a set's load is far off its session or the lift's log, or under the bar, or null (above). */
export function oddLoadIn(M: Model, b: DraftBlock, si: number, date: string): string | null {
  const s = b.sets[si];
  const under = underBarIn(M, b, si);
  if (!s || s.warm || s.drop) return under;
  const ex = EXIn(M, b.exId);
  const w = effW(b, si);
  if (ex.assist || ex.timed || w == null) return null;
  const bw = bwLoadIn(M, ex, date);
  const load = bw + w;
  if (!(load > 0)) return under;
  const say = (x: number): string => `${loadLabelIn(M, ex, x)}${ex.bw ? '' : ' ' + UIn(M)}`;
  let top = 0,
    topW = 0;
  b.sets.forEach((x, i) => {
    if (i !== si && x.done && isWork(x) && !x.drop && x.w != null && bw + x.w > top) {
      top = bw + x.w;
      topW = x.w;
    }
  });
  if (top > 0 && load > top * ODD_SESSION + EPS)
    return `${say(w)} is more than three times your heaviest set today, ${say(topW)}.`;
  if (top > 0 && load * ODD_SESSION < top - EPS)
    return `${say(w)} is under a third of your heaviest set today, ${say(topW)}.`;
  let best = 0,
    bestW = 0;
  for (const x of IDXIn(M).byEx[b.exId] || [])
    if (x.date <= date)
      for (const p of x.pts)
        if (bw + p.w > best) {
          best = bw + p.w;
          bestW = p.w;
        }
  if (best > 0 && load > Math.max(best, top) * ODD_BEST + EPS)
    return `${say(w)} is more than twice the heaviest you have logged on this exercise, ${say(bestW)}.`;
  return under;
}

/* ---------- Adjusting the next sets (r34, V; moved from src/17-adjust.js in r60) ----------
   Coaches who program by effort move the next set from how the last one
   went. After a ticked working set, when it was clearly off, the rows below
   that are still the app's (nothing typed) take a new load:
   - lighter than planned: 2 or more reps in reserve over the target with the
     reps in the range, or 2 or more reps past the top of the range (the
     same 2 that moves the next session's load from the estimate, r27;
     3 until r45, V: 14 reps on a 10 to 12 range left the load alone);
   - heavier than planned: 2 or more reps under both the bottom of the range
     and what this session expected of the set (last time's reps at this
     load, or the target's minimum after a new load), not stopped early (no
     reserve over the target). A lift building reps up from under the range
     (a large step, r31) is expected there and is left alone.
   The new load is what the set's own estimate says allows the middle of the
   range (up) or the bottom of it (down) at the target RIR with one rep more
   in reserve for fatigue, in whole steps or on the rack. Past the loads the
   lift has done since its last break it goes at most 10% up (15% on light
   isolation lifts, jumpCap); up to them the estimate alone bounds it (341 b,
   rule 3). On the first session back after a break (backDaysIn) the next
   sets aim where the return's own words do, the bottom of the range with 2
   or more in reserve, and never past the load from before the break (341 b,
   rule 4: 165 x 10 at 3 in reserve gives 185 x 6, 165 x 6 at 3 gives 170;
   until r60 the 10% cap and the middle of the range held them at 175 and
   165 for 8). Conventions, meant to err light.
   A rep or two lost per set is normal fatigue and changes nothing. What the
   session decides (adjusting off in Settings, Keep, a warm-up, a drop, an
   unticked set, no row left to move, a past workout, an edit, a lighter day
   or deload) is the session screen's (workout.ts); what the lift decides is
   here: a timed hold, an assisted lift, a lift with no estimate, an injury,
   no range or step, and a bodyweight lift with no load or no weigh-in. */

/* The heaviest working load a lift has been done at in its stretch up to
   its last session, from its last break before it (all of its sessions when
   it has had none), or null with none: the loads a next-sets adjustment
   re-approaches without the 10% cap (341 b, rule 3). Read only when the lift
   is not back after a break, so its last session is in today's stretch. */
function stretchTopIn(M: Model, exId: string, plan: Plan): number | null {
  const T = M.today();
  const xs = (IDXIn(M).byEx[exId] || []).filter(x => x.date <= T);
  if (!xs.length) return null;
  let i = xs.length - 1;
  while (i > 0 && !afterBreak(xs[i - 1], xs[i].date)) i--;
  let t: number | null = null;
  for (const x of xs.slice(i)) {
    const w = workLoad(x.pts, +plan.repMin);
    if (t == null || w > t) t = w;
  }
  return t;
}

/* A bodyweight lift never done with added load (r34.2, from the review:
   push-ups at BW x 20 were moved to BW+10 mid-session, a load the lifter
   never had, and one tap logged it). It progresses by reps until the lifter
   types a load. */
/** Whether a bodyweight lift has never had added load, in this session or its log, and so moves by reps alone. */
export function bwNoLoadIn(M: Model, ex: ExerciseLike | null | undefined, b?: DraftBlock | null): boolean {
  if (!ex || !ex.bw || ex.assist) return false;
  if (b && b.sets.some(x => +(x.w ?? 0) > EPS_SAME)) return false;
  return !(IDXIn(M).byEx[ex.id] || []).some(x => x.pts.some(p => p.w > EPS_SAME));
}

/** The next sets after ticked set `si` of a block, or null when it was not clearly off or the lift does not take an adjustment (above); `lastR` is last time's reps for that row (the Last column's), or null. */
export function nextSetsIn(M: Model, b: DraftBlock, si: number, lastR: number | null): NextSetsAdj | null {
  const s = b.sets[si];
  if (!s || !(+(s.r ?? 0) > 0) || s.w == null) return null;
  const ex = EXIn(M, b.exId);
  const p = b.plan;
  if (ex.timed || ex.assist || noE1(ex) || exInjuryIn(M, ex) || !(+p.repMin > 0)) return null;
  if (!(incOfIn(M, ex, p, s.w) > 0) || bwNoLoadIn(M, ex, b)) return null;
  // Nor a bodyweight lift with no weigh-in, which has no total load to estimate from (r55).
  if (ex.bw && !(bwRefLoadIn(M, ex) > 0)) return null;
  const sc = effScale(M.s.settings.rirScale);
  /* A blank effort is read as the lift's usual effort, as everywhere else
     (r34.2: a blank set was read as failure here only, and dropped further). */
  const tgt = +p.rir || 0,
    lo = +p.repMin,
    hi = +p.repMax,
    r = +(s.r ?? 0);
  const q = s.rir == null || s.rir === '' ? null : +s.rir;
  const qe = q != null ? q : rirEstIn(M, s, ex);
  const bw = bwRefLoadIn(M, ex),
    Lt = s.w + bw;
  const expR =
    b.tgt && b.tgt.kind === 'load' && +(b.tgt.repMin ?? 0) > 0 ? +(b.tgt.repMin ?? 0) : lastR != null ? lastR : lo;
  const light = (q != null && q >= tgt + CLEARLY_OFF && r >= lo) || r >= hi + CLEARLY_OFF,
    heavy = r <= Math.min(lo, expR) - CLEARLY_OFF && (q == null || q <= tgt);
  if (!(Lt > 0) || !(light || heavy)) return null;
  const est = fitE(Lt, r, qe == null ? 0 : Math.min(qe, E1_MAX_RIR));
  if (!est) return null;
  // A first session back after a break: its reserve is the return's, 2 or more; the load from before it is a re-approach, and the most it asks.
  const back = backDaysIn(M, b.exId, p, {}) > BACK_DAYS;
  const pre = back ? suggestCoreIn(M, b.exId, p, {}) : null;
  const preTop = pre && pre.top != null && pre.top > 0 ? pre.top : null;
  const resUp = back ? Math.max(BACK_RIR, Math.min(tgt, E1_MAX_RIR)) : Math.min(tgt, E1_MAX_RIR) + FATIGUE_RIR;
  const resDown = back
    ? Math.max(BACK_RIR, Math.min(tgt, E1_MAX_RIR) + FATIGUE_RIR)
    : Math.min(tgt, E1_MAX_RIR) + FATIGUE_RIR;
  const n = b.sets.slice(0, si + 1).filter(x => !x.warm && !x.drop).length;
  const easy = (): string =>
    sc === 'rpe'
      ? `set ${n} was RPE ${effAt(sc, q ?? 0)}, against a target of RPE ${effAt(sc, tgt)}`
      : `set ${n} had ${effAt(sc, q ?? 0)} in reserve, against a target of ${effAt(sc, tgt)}`;
  let nw: number | null = null;
  if (light) {
    const byEst = e1inv(est, back ? lo + resUp : Math.round((lo + hi) / 2) + resUp) - bw;
    const done = back ? preTop : stretchTopIn(M, b.exId, p);
    const lim = back && done != null ? done : Math.max(done ?? -Infinity, Lt * jumpCap(ex, Lt, false) - bw);
    const want = Math.min(byEst, lim);
    const cap = capOfIn(M, ex, p);
    nw = heavierLoadIn(M, ex, p, s.w, cap != null ? Math.min(want, cap) : want);
    /* Rated 5 or more in reserve, the top of the scale, the estimate is
       only a floor, so one real step is always right even where it is
       more than the cap allows (r34.2, from the review: 20 lb curls at
       5+ in reserve never moved, a 5 lb step being 25% of the load). */
    if (nw == null && q != null && q >= RIR_CALL_TOP) {
      const one = s.w + incOfIn(M, ex, p, s.w);
      nw = heavierLoadIn(M, ex, p, s.w, cap != null ? Math.min(one, cap) : one);
    }
  } else {
    const want = e1inv(est, lo + resDown) - bw;
    const w = lighterLoadIn(M, ex, p, s.w, Math.max(0, want));
    nw = w < s.w - EPS_SAME ? w : null;
    if (nw != null && ex.bw && nw < 0) nw = 0;
  }
  if (nw != null) {
    const f = rtfAt(est, nw + bw);
    const er = f == null ? lo : Math.max(lo, Math.min(hi, Math.floor(f - (light ? resUp : resDown) + EPS)));
    const why = light
      ? q != null && q >= tgt + CLEARLY_OFF
        ? easy()
        : `set ${n} went ${r} reps, past your ${hi}`
      : `set ${n} stopped at ${r}, under your ${rangeWords(p)}`;
    return { at: si, w: nw, from: s.w, r: er, up: light, why, ...(typeof s.rid === 'string' ? { rid: s.rid } : {}) };
  }
  if (light && q != null && q >= tgt + CLEARLY_OFF && r < hi) {
    /* No heavier load fits (the next step is more than the estimate
       allows): the same load for more reps, so a set this easy is not
       met with silence (r35, V). Reps the estimate gives at the target
       effort, up to the top of the range. */
    const f = rtfAt(est, Lt);
    const er = f == null ? null : Math.min(hi, Math.floor(f - (back ? resUp : Math.min(tgt, E1_MAX_RIR)) + EPS));
    if (er != null && er > r)
      return {
        at: si,
        w: s.w,
        from: s.w,
        r: er,
        up: true,
        why: easy(),
        ...(typeof s.rid === 'string' ? { rid: s.rid } : {})
      };
  }
  return null;
}
