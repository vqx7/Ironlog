/* The load engine: what to lift next for one
   exercise (suggest and its cases), a start borrowed from a close variation, and timed holds. The steps a load moves
   in are loadsteps.ts. Each function that reads
   the log, the date or a cache takes the model as its first parameter
   (model.ts). */

import type { Plan } from './types';
import type { Drift, ExPoint, Exposure, ExerciseLike, Model, Suggestion } from './model';
import { statsUpToIn } from './bests';
import type { LiftBests } from './bests';
import { EXIn, UIn, exInjuryIn } from './model';
import { IDXIn, lastOf, liftReadIn } from './analytics';
import { atCapOfIn, capOfIn, gymRackIn, loadFloorIn } from './gym';
import { DEFAULT_STEP, fromDIn, toDIn } from './units';
import { fmtWIn, loadLabelIn, loadNote } from './loads';
import { addDays, daysBetween, isDate, r1, EPS, EPS_SAME, WEEK_DAYS, pctOf } from './util';
import {
  BACK_DAYS,
  afterBreak,
  sinceLongBreak,
  E1_MAX_RIR,
  LIGHT_SHARE,
  atLoad,
  e1inv,
  bestFit,
  jumpCap,
  lighter,
  offTarget,
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
import { KIN_UNI, injLabel, isCompound, loadMode, noE1, patternOf, rackKind } from './library';
import { LIGHT_RIR, awayWords, effAt, effLeast, effScale, fmtDateFrom, rangeWords, repSpan } from './format';
import { overSets } from './session';
import {
  BIG_STEP_REPS,
  heavierLoadIn,
  incOfIn,
  lighterLoadIn,
  loadGridIn,
  offGrid,
  progStepIn,
  rackStepIn,
  snapUnitIn,
  unitGridIn
} from './loadsteps';
import { bwRefLoadIn } from './setread';
import { triedAt } from './usual';

/* ---------- the engine's conventions ----------
   Each is a convention (docs/EVIDENCE.md), named once here and read by the
   rule it belongs to, below. */

/** Just after a step up (no more than JUST_UP.steps steps), reps short by up to JUST_UP.short are the step's, not a drop. */
export const JUST_UP = { steps: 1.5, short: 3 } as const;
/** Sessions in a row under the range at one load that drop it, rising or not. */
export const SHORT_RUN = 4;
/** Reps maxed where the load cannot go up (the heaviest load available, a fixed load, bodyweight alone): every set past the top by REPS_MAXED.share of it, at least REPS_MAXED.min reps, is told to make each rep harder instead. */
const REPS_MAXED = { min: 3, share: 0.4 } as const;
/** The slower lowering suggested then, in seconds: a lifting convention, not a number the app reads back. */
const SLOW_LOWER_S = [3, 4] as const;
/** A rep range narrower than this is a fixed-rep plan (5 x 5): the load steps up whatever the step costs. */
export const FIXED_RANGE = 3;
/** Reps built before a large step: up to BUILD_PAST.share of the top of the range past it, at least BUILD_PAST.min. */
export const BUILD_PAST = { min: 2, share: 0.25 } as const;
/** A first session borrowed from a close variation: one trained in the last KIN.days days, its estimate times KIN.compound or KIN.isolation, to err light. */
export const KIN = { days: 120, compound: 0.8, isolation: 0.9 } as const;
/* ---------- progression suggestion ---------- */
/* Double progression. Returns text (the full sentence, used on the Today
   preview), plus last/target (the same thing split into two lines for the
   logger) and tgt, a small object the logger uses to score the session live:
   {kind:'reps', w, total} means beat `total` reps at load w;
   {kind:'load', w, repMin} means hit repMin+ reps in every set at the new load w. */
/* A lighter day or a deload is worked out from the normal day's
   prescription: 90% of the load the normal day
   would ask for (or of last time's working load, if lower), in whole steps,
   with grey reps at the bottom of the range.
   90% of last time's top load at last time's reps would ask about 125 after
   140 x 4, 3, 3 (normal day: drop to 122.5), and after 100 x 15 one tap would
   log 90 x 15 on a "3 or more in reserve" day. Injury, a first session and timed holds keep their own lines. */
/** How a suggestion is asked for: for a past session's date (`before`), as a deload, or as a lighter day. */
type SuggestOpts = {
  before?: string | null | undefined;
  deload?: boolean | undefined;
  light?: boolean | undefined;
};

/** What suggestCore works out once for a lift and hands to each of its cases in turn. */
interface SuggestCtx {
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
  tp: ExPoint[];
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
   target, so the lift stops being back once it is done, unless it was
   done lighter (a Lighter day or a deload, tapped on coming back), so the
   session after it does not ask for the load from before the break. */
export function backDaysIn(M: Model, exId: string, plan: Plan, opts: SuggestOpts): number {
  const T = opts.before && isDate(opts.before) ? opts.before : M.today();
  // After a long break the lift starts fresh, so only its sessions since are a way back from anything.
  const all = sinceLongBreak(liftReadIn(M, exId, T), T);
  /* A lift trained in two rep ranges restarts each on its own first session
     back (else a light day eased after a break ends the heavy day's return
     too, and the heavy day's first session back asks for the load from
     before the break). The break is read from the sessions
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
  if (!(opts.deload || opts.light || back) || ex.timed) {
    const core = suggestCoreIn(M, exId, plan, opts);
    // The load lifted earlier today is asked as it was, in the unit it was logged in (not 60 kg read as 135 lb).
    return core.same ? core : snapUnitIn(M, ex, plan, core);
  }
  const base = suggestCoreIn(M, exId, plan, { ...opts, deload: false, light: false });
  /* A close variation's first session on a Lighter day or deload: 90% of the start, like any lighter day; back after a
     long break, said as the time away, as its first session is. */
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
      text: `${base.away ? `Back after ${awayWords(base.away)}` : 'First time'}, ${opts.deload ? 'deload' : 'Lighter day'}. About ${loadLabelIn(M, ex, lw)} ${UIn(M)}${loadNote(ex)} for ${repSpan(plan.repMin, plan.repMax, '-')} with ${effLeast(effScale(M.s.settings.rirScale), LIGHT_RIR)}, from your ${EXIn(M, base.kin).name}. Half the usual sets, nothing to beat.`
    };
  }
  if (!base.last || base.w == null) return base;
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
  /* An injury flag keeps these rules: the lift is held at or below the
     lower of last time's load and the day's or the return's, in the injury's
     words, nothing to beat. Returning first, the flag would let a flagged
     bench back after six weeks ask its 195 from before the break, and on a
     Lighter day or deload keep flagged lifts at full loads while the others
     drop to about 90%. */
  if (base.inj) {
    const lw = Math.min(base.w, w);
    return snapUnitIn(
      M,
      ex,
      plan,
      {
        ...base,
        w: lw,
        text: `${base.last} Injury flagged (${injLabel(base.inj)}): stay at or below ${lbl(lw)}, keep ${effLeast(effScale(M.s.settings.rirScale), LIGHT_RIR)}, stop on pain.`,
        lastR: lw < base.w - EPS ? Array<number>(n).fill(+plan.repMin) : base.lastR,
        ...(back ? { back: Math.round(off / WEEK_DAYS) } : {})
      },
      true
    );
  }
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

/* Whether the plan's rep range is in use for a lift: the lift was
   trained for no more than the trend window (TREND_DAYS) since the range's newest
   full session. A lift on two days at two ranges then reads each from its own
   sessions; a range left for another while training went on (a lift back on
   8-12 after months on 5-8), or never logged, reads them all. A break of more
   than four weeks (afterBreak) is time not trained, so it does not count
   toward the window, and a range trained just before a break is still its
   own after it (counting the break, a heavy day six weeks off would read
   the light day's eased session as its start). The target
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

/* Two sessions of a lift on one day (V's ruling of 2026-11-02, "match the morning"). A
   lift's sessions on one day are read as one: the day's best stands for it (the heavier working load, then more
   reps at it, the later on a tie), so the next day's target comes from the better of a morning and an evening,
   not simply the later one, and a second session the same day does not step up from the first (bench 140 x 10 x 3
   at 8:00 asking 145 at 17:00). */
/** The lift's readings with one a day: on a day with more than one, the best of them, in date order. */
function oneADay(xs: Exposure[] | undefined, repMin: number): Exposure[] | undefined {
  if (!xs || xs.length < 2) return xs;
  const score = (x: Exposure): [number, number] => {
    const w = workLoad(x.pts, repMin);
    return [w, triedAt(x, w).reduce((t, p) => t + p.r, 0)];
  };
  const out: Exposure[] = [];
  for (const x of xs) {
    const prev = out[out.length - 1];
    if (!prev || prev.date !== x.date) {
      out.push(x);
      continue;
    }
    const [a0, a1] = score(prev),
      [b0, b1] = score(x);
    if (b0 > a0 + EPS_SAME || (Math.abs(b0 - a0) <= EPS_SAME && b1 >= a1)) out[out.length - 1] = x;
  }
  return out;
}
/* A second session of a lift on a day it was already done in full: the same load and reps as the day's best
   session so far, no step up, nothing set to beat (a load progresses across days, not within one; the lifter
   can still type more). The next day reads the day's sessions as one (oneADay). Only for a session asked for on
   its date (opts.before: one being started or logged, and Today's card for the session Start would begin); a
   lift's next session elsewhere (Stats) is a later day, so the day's best sets it there. */
function sgSameDayIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, last, T, top, planPts, lastR, lastS, basis, opts, plan } = C;
  if (!opts.before || last.date !== T || !(planPts.length > 0)) return null;
  /* Earlier that day in another rep range (a heavy morning, a light evening), or in one not on record (an import):
     that range's own rules read it. */
  if (!(last.rr && sameRR(last.rr, [+plan.repMin, +plan.repMax]))) return null;
  const sets = last.pts.map(p => `${loadLabelIn(M, ex, p.w)}×${p.r}`).join(', ');
  return {
    top,
    w: top,
    text: `${T === M.today() ? 'Earlier today' : 'Earlier that day'}: ${sets}. The same again: no step up within one day.`,
    lastR,
    basis,
    last: lastS,
    target: '',
    tgt: null,
    easier: null,
    same: true
  };
}

/* The load engine's prescription for one lift, in its cases, each below and
   tried in order. A lift with
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
  // Since a new machine or gym, if one is marked (liftReadIn): with none since, it is a first session.
  const read = every ? liftReadIn(M, exId, T) : every;
  /* And since the lift's last long break: with none since, it starts fresh, as a first session, saying the
     time away (away, in days, from its last session before). */
  const all = read ? sinceLongBreak(read, T) : read;
  const away = read && read.length && all && !all.length ? daysBetween(read[read.length - 1].date, T) : 0;
  const ex = EXIn(M, exId);
  const injM = exInjuryIn(M, ex);
  // The last full session sets the target: not one done lighter, nor one short of its usual (V's one rule). If there is nothing else, use them.
  const full = all ? all.filter(x => !offTarget(x)) : [];
  /* The same lift can sit on two days with different rep ranges (heavy 4-6,
     light 10-12). Each day progresses from its own sessions in its own range.
     That holds while the range is in use: the newest session in it
     within the trend window (42 days) of the newest full session. A range not
     used lately (a lift back on 8-12 after months on 5-8) or never logged
     reads every full session, so the newest load is the starting point.
     Sessions with no range on record (saved before r13, imported or demo) go
     along with the range when it is in use. */
  const want: [number, number] = [+plan.repMin, +plan.repMax];
  const inRR = rangeInUse(full, want);
  const fullRR = inRR ? full.filter(x => sameRR(x.rr, want)) : [];
  const exps = oneADay(all && all.length ? (fullRR.length ? fullRR : full.length ? full : all) : all, want[0]);
  /* The same sessions with those short of their usual (V's one rule):
     a short session sets no target, but it was done, so a case that reads
     the session before last time's (two sessions under the range in a row,
     reps rising after a step) reads it among these. */
  const done =
    oneADay(
      all && all.length
        ? fullRR.length
          ? all.filter(x => !lighter(x) && sameRR(x.rr, want))
          : full.length
            ? all.filter(x => !lighter(x))
            : all
        : [],
      want[0]
    ) ?? [];
  const seen = oneADay(inRR ? all!.filter(x => sameRR(x.rr, want)) : all, want[0]);
  /* Ab work on bodyweight with no load ever added (a hanging leg raise, a
     crunch) progresses by reps, then harder reps (from the third
     review: a leg raise at 15 reps was told "BW+2.5 for 10+"). Once a load
     has been logged, it progresses like any loaded lift. */
  /* Every bodyweight lift never done with added load, not only ab work
     (else push-ups done on bodyweight for 6 weeks are asked for BW+10 every
     session and counted as missed targets). A load typed once makes it a
     loaded lift. Read from the whole log in any range, and so for a hold too
     (read from its range's sessions alone, a plank loaded on its heavy day
     would pass for one never loaded). */
  const noAdd = !!ex.bw && !ex.assist && !(all || []).some(x => x.pts.some(p => p.w > EPS_SAME));
  if (ex.timed) return suggestTimedIn(M, ex, plan, exps, opts, injM, seen, noAdd, away);
  if (!exps || !exps.length) return sgFirstIn(M, ex, plan, T, injM, away);
  const last = exps[exps.length - 1],
    ws = last.pts;
  const stx: Partial<LiftBests> =
    all!.length < every!.length ? statsUpToIn(M, exId, all!) : IDXIn(M).exStats[exId] || {};
  const top = workLoad(ws, +plan.repMin);
  const step = incOfIn(M, ex, plan, top);
  const abW = ['abs', 'obliques'].includes(ex.primary);
  // Heaviest available load (top of the stack or rack), if set.
  const cap = capOfIn(M, ex, plan, top);
  /* An assisted lift at no help is at the most the machine gives (the
     audit: at BW it asked to "take 2.5 kg of help off", BW+2.5): reps, as at
     the heaviest load of a rack. */
  const noHelp = !!ex.assist && top >= -EPS;
  const atCap = atCapOfIn(M, ex, plan, top, cap) || noHelp;
  const capW = (w: number): number => (cap != null ? Math.min(w, cap) : w);
  // Only the sets at the top load decide progression. Ramp-up sets at lighter
  // loads used to block every load increase unless they also reached repMax.
  // As tried, a missed set among them with its 0 reps (triedAt).
  const topPts = triedAt(last, top);
  /* The planned sets among them decide a step, as they set the rep target
     (tp, below): a set past the plan's count is left out (else 80 x 10 x 4
     and a fifth set of 8 hold the load and ask 41+ reps over 4). */
  const planPts = topPts.slice(0, Math.max(1, +plan.sets || topPts.length));
  const L0 = lastOf(seen, last, p => `${loadLabelIn(M, ex, p.w)}×${p.r}`, M.today(), +plan.repMin);
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
  /* A lighter day is a one-day deload: lighter loads, 3 or more in
     reserve, half the sets, no target. suggest() works it out from this
     function's normal prescription. */
  /* Recalibrate when every top set was logged with RIR at least 2 above the
     target. It uses the same e1() estimate as everything else,
     and the new load is what leaves the middle of the rep range at the target
     RIR. It moves in whole steps from the last load, so machine stacks with odd
     offsets stay on real pin positions, and never jumps more than 10% (see
     jumpCap). A set called past 4 RIR is read as 4 here only, which errs low. */
  const tgtRir = +plan.rir || 0;
  /* The first 3 sessions of a lift find its load (a convention): the
     cap on a jump is 25% there, so a first guess well under what the
     lifter can do moves up by what the estimate allows, not a step at a
     time; a set rated RIR_CALL_TOP or more in reserve is read as
     E1_MAX_RIR, which errs low, so from such sets it moves about a step a
     session. A lift's first
     sessions are counted since its last break or New machine or gym (all
     is read from that mark), whatever their rep range (counted in the plan's
     range only, a bench with 11 sessions whose range changed would be allowed
     25%, 200 to 240, where 10% gives 220). */
  const xs = all || [];
  let since = xs.length - 1;
  while (since > 0 && !afterBreak(xs[since - 1], xs[since].date)) since--;
  const early = xs.length - since <= EARLY_SESSIONS;
  /* The reps a target is set from: last time's sets at the working load over the plan's sets, as done (V
     2026-11-04: "practical, realistic, helpful, not confusing"). One set under the range read as the bottom of it
     would make 185 x 10, 10, 5 (25 reps) ask more than 185 x 10, 9, 8 (27), "Beat 28 ... (a set
     under 8 counts as 8)". The grey reps of the next session still show the bottom of the range for that one set
     (repFloor in analytics.ts), so one bad set is not next time's plan. */
  const tp = topPts.slice(0, Math.max(1, +plan.sets || topPts.length));
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
    tp
  };
  // The sets of the session shown as Last, for the Last column in the session: each case's result carries them.
  const res =
    sgSameDayIn(M, C) ||
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

/* The way back after a break (V's decision 1 of 2026-10-27). The first session back
   asks about LIGHT_SHARE of the load from before the break with BACK_RIR or
   more in reserve (suggestIn). Until the lift is back at that load, each
   full session's next load is what that session's own estimate gives for
   the lift's usual reps (the middle of its sets at its load before the
   break) at the planned reserve, in whole steps on its rack or plates (or
   the step in the unit on screen, unitGridIn), never past the load from
   before the break; when that is no more than the current load, the usual
   cases below decide, which never lower a load done as asked. Once a
   session since the break is done at that load, the usual rules alone. On
   the first session back a set left unrated reads as BACK_RIR in reserve,
   what it asked, here as in the next sets (nextSetsIn). Done as asked: every
   planned set at its load reached the bottom of the range; a session under
   it is read by the usual cases. Run on the session after the return only,
   the usual one step at the top of the range would take over from the second
   session and keep a full-strength lifter at 175 x 9 for weeks, never back to
   185. No study gives a per-session rate of return for trained
   lifters, so the climb is a convention (docs/EVIDENCE.md, Back after a
   break, Loads going up). */
function sgAfterReturnIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, plan, all, exps, last, top, cap, planPts, lastR, lastS, basis, lbl, prevBest, tgtRir } = C;
  if (C.injM || C.noAdd || ex.assist || noE1(ex) || !(top > 0)) return null;
  // The first session after the lift's latest break up to its last full session (all is read since a New machine or gym).
  const i = all.indexOf(last);
  let j = i;
  while (j > 0 && !afterBreak(all[j - 1], all[j].date)) j--;
  if (j < 1) return null;
  // The load from before the break: the last full session before it that the target reads (exps).
  const pre = exps.filter(x => x.date < all[j].date).pop();
  if (!pre) return null;
  const preTop = workLoad(pre.pts, +plan.repMin);
  const backAt = all.slice(j, i + 1).filter(x => x.topW >= preTop - EPS_SAME);
  if (backAt.length) {
    /* Back at the load from before the break in this session alone, at fewer
       of the planned sets (the next sets moved up within it: 165, 175, 185 x
       8): every planned set at that load next, for the fewest reps done
       there, then the usual rules (V's choice of 2026-10-27; else the reps
       target asks to beat 8 reps in one set with three planned). */
    const at = triedAt(last, top);
    const fewest = Math.min(...at.map(p => p.r));
    if (
      backAt.length > 1 ||
      backAt[0] !== last ||
      !(top >= preTop - EPS_SAME) ||
      at.length >= +plan.sets ||
      at.some(p => p.missed) ||
      !(fewest >= +plan.repMin)
    )
      return null;
    return {
      top,
      w: top,
      text: `${lastS} Back at your load from before the break: ${lbl(top)} for ${fewest}+ reps in every set next.`,
      lastR,
      basis,
      last: lastS,
      target: `${lbl(top)} for ${fewest}+ reps in every set`,
      tgt: { kind: 'load', w: top, repMin: fewest, prevBest },
      easier: null
    };
  }
  if (triedAt(last, top).some(p => p.missed || p.r < +plan.repMin)) return null;
  const bw = bwRefLoadIn(M, ex);
  if (ex.bw && !(bw > 0)) return null;
  const est =
    bestFit(planPts, p => {
      const q = p.rir != null ? p.rir : i === j ? BACK_RIR : p.rq;
      return q == null ? q : Math.min(q, E1_MAX_RIR);
    })?.est ?? 0;
  if (!(est > 0)) return null;
  // The reps the lift was done for before the break: the middle of its sets at that session's load.
  const rs = pre.pts
    .filter(p => Math.abs(p.w - preTop) < EPS_SAME)
    .map(p => p.r)
    .sort((a, b) => a - b);
  if (!rs.length) return null;
  const preR = Math.max(+plan.repMin, Math.min(+plan.repMax, rs[Math.floor((rs.length - 1) / 2)]));
  const want = Math.min(e1inv(est, preR + Math.min(tgtRir, E1_MAX_RIR)) - bw, preTop);
  const up = heavierLoadIn(M, ex, plan, top, cap != null ? Math.min(want, cap) : want);
  if (up == null) return null;
  const g = unitGridIn(M, ex, plan, top, up, true);
  const nw = g == null ? up : g > top + EPS_SAME ? g : null;
  if (nw == null) return null;
  return {
    top,
    w: nw,
    text: `${lastS} Back from the break: those sets say ${lbl(nw)} fits your usual ${preR} reps, so ${lbl(nw)} next${nw < preTop - EPS_SAME && lbl(nw) !== lbl(preTop) ? `, on the way back to ${lbl(preTop)}` : ''}. Aim for ${plan.repMin}+ reps in every set.`,
    lastR,
    basis,
    last: lastS,
    target: `${lbl(nw)} for ${plan.repMin}+ reps in every set`,
    tgt: { kind: 'load', w: nw, repMin: +plan.repMin, prevBest },
    easier: null
  };
}

/* No history yet: an injury note, a start from a close variation, or the first-time line. */
function sgFirstIn(M: Model, ex: ExerciseLike, plan: Plan, T: string, injM: string | null, away: number): Suggestion {
  /* An assisted lift's help is the lifter's to set the first time (the text
     says so): with none shown, a set ticked untyped is one Finish asks about,
     where a help of 0 shown saved it at full bodyweight, and the next
     session, with help typed, read as lighter. Bodyweight alone is a bodyweight lift's start. */
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
  /* A first session ("pick a load you can take to 6-10 at 2 RIR" is no
     help to a beginner). Start light, in words a new
     lifter can act on. The next session's load comes from this one. */
  const rr = +plan.rir || 0;
  // One line per exercise; the warm-up is said once, in the workout preview.
  /* The load and the reps agree: a load you could lift about as many times
     as the top of the range and the reps left in you together (not "about 17
     times" for 8 to 12 with 3 still in you). Nothing is said of a load for
     push-ups and Nordics, which have none to pick.
     Erring light is fine: the next session's load is worked out from this
     one, by up to 25% in the first sessions (jumpCap). */
  const can = +plan.repMax + Math.round(rr);
  const reps = `${repSpan(plan.repMin, plan.repMax)} rep${+plan.repMax === 1 ? '' : 's'}`;
  const stop = rr >= 1 ? `stopping with about ${rr} still in you` : 'to the last rep you can do well';
  const kin = !ex.bw ? kinStartIn(M, ex, plan, T) : null;
  /* Back after a long break, it is said as the time away, not as new; the words after it are a first
     session's, since that is how it starts. The time away is kept on the suggestion for the screens (away). */
  const lead = away ? `Back after ${awayWords(away)}` : 'First time';
  const was = away ? { away } : {};
  if (kin)
    return {
      ...was,
      w: kin.w,
      text: `${lead}. About ${loadLabelIn(M, ex, kin.w)} ${UIn(M)}${loadNote(ex)} for ${reps}, from your ${kin.ex.name} (${kin.set}, ${fmtDateFrom(kin.date, M.today())}), ${stop}. If the first set is off, change the load.`,
      lastR: [],
      last: '',
      target: '',
      tgt: null,
      kin: kin.ex.id
    };
  const text = ex.assist
    ? `${lead}: set the help so you could do about ${can} reps. Do ${reps}, ${stop}. Next time the help is set from this.`
    : ex.bw
      ? `${lead}: your bodyweight only. Do ${reps}, ${stop}. If ${plan.repMin} is out of reach, use an easier version; if it is easy past ${plan.repMax}, the next target says so.`
      : `${lead}: pick a load you could lift about ${can} times, erring light. Do ${reps}, ${stop}. Next time's load is worked out from this.`;
  const again = ex.assist
    ? `${lead}: help for about ${can} reps; do ${reps}.`
    : ex.bw
      ? `${lead}: bodyweight only; do ${reps}.`
      : `${lead}: a load you could lift about ${can} times; do ${reps}.`;
  return { ...was, w: w0, text, again, lastR: [], last: '', target: '', tgt: null };
}

/* Every top set 2 or more over the target reserve: the load from the estimate.
   Every top set has a RIR here (the test below), as the ! say. */
function sgEasyIn(M: Model, C: SuggestCtx): Suggestion | null {
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
     read (BW+5 x 10 is not a 5 kg lift), so its load is
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
    // Every point here has a rating: the condition above reads p.rir != null for each.
    const est = bestFit(topPts, p => Math.min(p.rir!, E1_MAX_RIR))?.est ?? null;
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
         is a floor, so at least one real step, even past the cap (else 20 lb
         curls at 5+ in reserve are asked to build reps for weeks, a 5 lb
         dumbbell step being more than the cap allows). */
      const easy5 = planPts.every(p => p.rir! >= RIR_CALL_TOP);
      if (k < 1 && easy5) k = 1;
      /* From a load off a rack read from its spacing: the heaviest of
         its weights the estimate allows, the next one up at least when every
         set was 5 or more in reserve (12 lb to 15). */
      const onR = offGrid(M, ex, plan, top) != null;
      const rk = onR ? (heavierLoadIn(M, ex, plan, top, want) ?? (easy5 ? top + step : null)) : null;
      if (onR ? rk != null : k >= 1) {
        const nw = rk != null ? capW(rk) : ex.assist && top < 0 ? Math.min(0, top + k * step) : capW(top + k * step);
        /* The reserve said is that of the sets the rule read, the plan's (a set past them, at 0 in reserve, would make 4 read 3).
           Each has an RIR: the test above holds every one to a number. */
        const rr = r1(planPts.reduce((a, p) => a + p.rir!, 0) / planPts.length);
        // In the lifter's effort scale (RPE lifters are not told RIR).
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
function sgPastRangeIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, plan, top, step, noAdd, atCap, capW, topPts, lastR, lastS, basis, lbl, prevBest, tgtRir, early } = C;
  /* Well past the range: every top set at least 2 reps over repMax, which is
     what happens when the range is moved down (12s, then a 4 to 6 plan). One
     step a session would take weeks to reach a load that fits, so the same
     e1RM estimate the drop below the range uses sets the load for the middle
     of the new range at the target RIR, capped like a recalibration (jumpCap)
     and in whole steps. Above 12 reps there is no estimate, so the usual
     one step applies. */
  if (
    step > 0 &&
    !atCap &&
    !noAdd &&
    !noE1(ex) &&
    topPts.length &&
    topPts.every(p => p.r >= +plan.repMax + CLEARLY_OFF)
  ) {
    const est = bestFit(topPts, p => p.rq)?.est ?? null;
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
      // From a load off a rack read from its spacing: the heaviest of its weights the estimate allows, when more than the usual step.
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
function sgBelowRangeIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, plan, last, done, inRR, top, step, noAdd, topPts, lastR, lastS, basis, lbl, prevBest, tgtRir } = C;
  /* Below the rep range. Every top set fell short of repMin, either by 2 or
     more reps, or by any amount two sessions running at the same load. Adding
     one rep a week from there never reaches the range, so drop the load to
     what the same e1RM estimate says leaves repMin at the target RIR. Whole
     steps down from the last load, so stacks stay on real pins. */
  if (step > 0 && !noAdd && topPts.length && topPts.every(p => p.r < +plan.repMin)) {
    const gap = +plan.repMin - Math.max(...topPts.map(p => p.r));
    // The session before last time's, short of its usual or not: last time's is one of done.
    const at = done.indexOf(last);
    const prev = at >= 1 ? done[at - 1] : null;
    /* Not a drop while the reps are coming up after a step up: a big
       step for the load (a dumbbell, a small stack) starts below the range
       on purpose, and dropping back made the load swing between two
       numbers. Just after one step up, short by up to 3 is that; two
       sessions short at one load drop only when the reps did not rise. */
    const prevAt = prev ? prev.pts.filter(p => Math.abs(p.w - top) < EPS_SAME) : [];
    const sumR = (a: readonly ExPoint[]): number => a.reduce((x, p) => x + p.r, 0);
    const rising = prevAt.length > 0 && sumR(topPts.slice(0, prevAt.length)) > sumR(prevAt);
    const justUp = !!prev && prev.topW < top - EPS_SAME && top - prev.topW <= step * JUST_UP.steps + EPS_SAME;
    const repeat = !!prev && Math.abs(prev.topW - top) < EPS_SAME && prevAt.every(p => p.r < +plan.repMin) && !rising;
    /* A range not yet trained: history at 5 x 5 under a 6 to 10 plan
       asked for 122.5 x 16 reps over 3 sets, under the plan's minimum. The
       first session in a new range sets its load from the estimate at once,
       as a range moved down does. */
    /* Four sessions in a row under the range at one load drop it, rising or
       not (else 5, 5, 4, 4 then 5, 5, 5, 4 then 5, 5, 5, 5 keep the load for
       weeks, each "rising"). */
    let shortRun = 0;
    for (let k = at; k >= 0; k--) {
      const x = done[k];
      if (Math.abs(x.topW - top) > EPS_SAME) break;
      const at = atLoad(x.pts, x.topW);
      if (!at.length || !at.every(p => p.r < +plan.repMin)) break;
      shortRun++;
    }
    if ((gap >= CLEARLY_OFF && !(justUp && gap <= JUST_UP.short)) || repeat || !inRR || shortRun >= SHORT_RUN) {
      /* The estimate every other load is found with (fitE): read with e1, which gives none past 12 reps
         to failure, 100 x 12 x 3 at RIR 2 on 15 to 20 would have no estimate and hold at 100 where the same sets at
         RIR 0 drop, so rating more in reserve on a set three reps short would keep the load. */
      const est = bestFit(topPts, p => p.rq)?.est ?? null;
      const bwNow = bwRefLoadIn(M, ex);
      if (est != null) {
        const want = e1inv(est, +plan.repMin + Math.min(tgtRir, E1_MAX_RIR)) - bwNow;
        /* Whole steps down to the estimated load. None needed means the
           estimate already puts this load at repMin for the target RIR: the
           sets were stopped early, not too heavy, so the usual rep target
           below applies instead of a forced drop. */
        const k = Math.ceil((top - want) / step - EPS_SAME);
        // From a load off a rack read from its spacing: the heaviest of its weights not past the estimate (12 lb to 10).
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
function sgNoStep(C: SuggestCtx): Suggestion | null {
  const { plan, top, step, noAdd, abW, atCap, noHelp, topPts, lastR, lastS, basis, lbl, prevBest, tp } = C;
  /* At the heaviest load available: keep adding reps past the top of the range.
     Once every set reaches about 40% past it, the next step is harder reps
     rather than more load. A load step of 0 means the load never changes (a
     fixed dumbbell, say), so it reads the same way instead of "add 0 lb". */
  /* The rep target counts as many sets as the plan has: five sets of
     history under a three-set plan read "26+ reps over your first 5 sets". */
  if (atCap || !(step > 0) || noAdd) {
    const where = atCap ? 'the heaviest load available' : noAdd ? 'your bodyweight' : 'a fixed load (load step 0)';
    // An assisted lift at no help: the unassisted lift with added load is what comes after the reps.
    const at = noHelp ? 'with no help' : `at ${where}`,
      lead = noHelp ? 'With no help left' : `That is ${where}`;
    const below = topPts.every(p => p.r < +plan.repMin);
    const total = tp.reduce((a, p) => a + p.r, 0);
    const nT = tp.length;
    const over = overSets(nT, plan);
    const ext = +plan.repMax + Math.max(REPS_MAXED.min, Math.round(+plan.repMax * REPS_MAXED.share));
    const maxed = topPts.every(p => p.r >= ext);
    const tip = maxed
      ? noAdd && !abW
        ? ` Every set reached ${ext}+ on bodyweight alone. Add a little load (a belt or a vest) by typing it, or make each rep harder: a ${SLOW_LOWER_S[0]} to ${SLOW_LOWER_S[1]} second lowering, a pause, or a harder version.`
        : ` Every set reached ${ext}+ ${at}, so make each rep harder instead: lower for ${SLOW_LOWER_S[0]} to ${SLOW_LOWER_S[1]} seconds and pause at the stretch, go one arm or one leg at a time, or finish with a drop set. Add a note when you change it so the numbers stay comparable.`
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
        ? `Past ${ext} reps ${noHelp ? 'with no help' : atCap ? 'at the heaviest load' : 'at this load'}: slow the lowering to ${SLOW_LOWER_S[0]} to ${SLOW_LOWER_S[1]} seconds with a pause at the stretch, go one side at a time, or add a drop set.`
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
function sgTopOfRangeIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, plan, top, cap, capW, topPts, planPts, lastR, lastS, basis, lbl, prevBest, tgtRir, tp } = C;
  if (planPts.every(p => p.r >= plan.repMax)) {
    const n0 = capW(top + progStepIn(M, ex, plan, top + bwRefLoadIn(M, ex), top));
    // On the step in the unit on screen before it is worded (unitGridIn), so the reps aimed for are those of the load shown.
    const nw = ex.assist ? n0 : capW(unitGridIn(M, ex, plan, top, n0, false, true) ?? n0);
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
       costs more reps than the range has room for (found by a
       simulated lifter following the app: 35 x 12 asked 40 for 8+, and 7
       was all there was). The target at the new load is then what the
       estimate says that load allows at the planned RIR, said as such, and
       the reps build back up from there. */
    /* A range under 3 reps wide (5 x 5, 3 x 3-5) is a fixed-rep plan: the
       load goes up a step and the reps are repeated, as those programs say,
       whatever the step costs (not reps past 5 at 50 kg instead of
       52.5). A miss is caught by the drop below the
       range. */
    const wide = +plan.repMax - +plan.repMin >= FIXED_RANGE;
    let aim = +plan.repMin;
    const q = Math.min(tgtRir, E1_MAX_RIR);
    const bwT = bwRefLoadIn(M, ex);
    // Not on a bodyweight lift with no weigh-in, which has no total load to read the step against (as sgEasyIn).
    if (!noE1(ex) && !(ex.bw && !(bwT > 0))) {
      const est = bestFit(topPts, p => p.rq)?.est ?? null;
      /* Only a step that costs 1.5 reps or more is large for the load (about
         5% or more): a 5 lb step on a 5 x 5 at 225 costs under one, and
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
    // Not when every set was rated 5 or more in reserve: the estimate is only a floor there.
    if (topPts.every(p => p.rir != null && p.rir >= RIR_CALL_TOP)) aim = +plan.repMin;
    const big = aim < +plan.repMin;
    /* Before such a step, a few more reps at this load first (not a cable
       fly asked "20 kg for 9+" on a 10-15 plan, the app aiming under its own
       range). The reps to build to are those that
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
function sgBadDay(C: SuggestCtx): Suggestion | null {
  const { plan, last, done, top, topPts, lastR, lastS, basis, lbl, prevBest } = C;
  /* A bad day at a load already done in the range (not "19+ reps" with 5,
     5, 4, 4 in grey after 7, 7, 6, 6 then 5, 5, 4, 4): every set
     under the range, the session before at this load in it. The target is
     the bottom of the range in every set again, not one rep more than the
     bad day. */
  {
    // The session before, short of its usual or not, as in sgBelowRangeIn.
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
function sgRepsIn(M: Model, C: SuggestCtx): Suggestion {
  const { ex, plan, stx, top, lastR, lastS, basis, lbl, prevBest, tp } = C;
  /* The rep target covers the same number of sets as last time, so an extra
     set can never count as progress on its own. A set past the top counts
     as the top (a convention; else 70 x 11, 11, 9 and 10 on 6 to 10 asks
     42+ reps over 4 sets, more than 10 a set can make, and 10 x 4 then reads
     as missed while it moves the load up): every set at the
     top is what moves the load, so reps past it make up for no short set. */
  const hi = +plan.repMax;
  const tc = tp.map(p => ({ ...p, r: Math.min(p.r, hi) }));
  const total = tc.reduce((a, p) => a + p.r, 0);
  const nT = tc.length;
  const over = overSets(nT, plan);
  const topped = tp.some(p => p.r > hi) ? ` (a set past ${hi} counts as ${hi})` : '';
  return {
    top,
    w: top,
    text: `${lastS} Beat ${total} reps ${over} at ${lbl(top)}${topped}. When every set at that load reaches ${plan.repMax}, ${ex.assist ? 'take some help off' : 'add load'}.`,
    lastR,
    basis,
    last: lastS,
    target: `${total + 1}+ reps ${over} at ${lbl(top)}`,
    tgt: { kind: 'reps', w: top, total, n: nT, rs: tc.map(p => p.r), prevBest },
    easier: stx.easier ? easierTextIn(M, ex, stx.easier) : null
  };
}

/* A first session of a close variation (a swap from DB curl to hammer
   curl does not start from nothing). A lift with no
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
function kinOfIn(M: Model, ex: ExerciseLike | null | undefined, T: string): { ex: ExerciseLike; x: Exposure } | null {
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
function kinStartIn(
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
  const best = bestFit(at, p => p.rq);
  if (best == null) return null;
  const { est, set } = best;
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
    const st = toDIn(M, rs || loadGridIn(M, ex, plan))!;
    if (!(st > 0)) return null;
    w = fromDIn(M, Math.floor(toDIn(M, want)! / st + EPS) * st)!;
  }
  /* Never under the empty bar (not a bench borrowed from an incline
     bench at the bar opening at 15 kg on a 20 kg bar): the
     bar is the lightest a lift on it can start at. */
  const floor = loadFloorIn(M, ex);
  if (floor > 0 && w < floor - EPS) w = floor;
  if (!(w > 0)) return null;
  return { ex: k.ex, date: x.date, w, set: `${loadLabelIn(M, k.ex, set!.w)}×${set!.r}` };
}

/* Timed holds: double progression on seconds. Beat the total time at the same
   load; when every hold reaches the top of the range, add the load step. */
function suggestTimedIn(
  M: Model,
  ex: ExerciseLike,
  plan: Plan,
  exps: Exposure[] | null | undefined,
  opts: SuggestOpts | null | undefined,
  injM: string | null,
  all: Exposure[] | null | undefined,
  noAdd: boolean,
  away: number
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
    // Back after a long break, a hold starts fresh as any lift does, said as the time away.
    return {
      ...(away ? { away } : {}),
      w: ex.bw ? 0 : null,
      text: `${away ? `Back after ${awayWords(away)}.` : 'No history yet.'} Hold for ${repSpan(plan.repMin, plan.repMax, '-')} seconds${side} each set.`,
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
  const L0 = lastOf(all, last, p => `${loadLabelIn(M, ex, p.w)} for ${p.r}s`, M.today());
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
  // Held again the same day: what it held earlier today, as any lift is (sgSameDayIn).
  if (opts.before && last.date === opts.before && last.rr && sameRR(last.rr, [+plan.repMin, +plan.repMax]))
    return {
      prev: L0.prev,
      prevOff: L0.prevOff,
      w: top,
      text: `${opts.before === M.today() ? 'Earlier today' : 'Earlier that day'}: ${ws.map(p => `${loadLabelIn(M, ex, p.w)} for ${p.r}s`).join(', ')}. The same again: no step up within one day.`,
      lastR,
      basis,
      last: lastS,
      target: '',
      tgt: null,
      easier: null,
      same: true
    };
  /* Back after a break, as any lift is (not a plank seven weeks off asked
     to beat its last time): the same load, holds about
     90% as long (the lighter day's 90%, a convention), nothing to beat,
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
  /* A hold at bodyweight, never loaded (noAdd, read by the caller from the whole log), builds time as a bodyweight
     lift builds reps: asked to add a plate at the top of its range, a plank held at
     bodyweight missed its target every session. */
  if (step > 0 && !noAdd && topPts.every(p => p.r >= plan.repMax) && !atCapOfIn(M, ex, plan, top, cap)) {
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
  // As the reps on bodyweight read (sgNoStep): build to the range, past its top, then a harder hold once well past it.
  const ext = +plan.repMax + Math.max(REPS_MAXED.min, Math.round(+plan.repMax * REPS_MAXED.share));
  const then = !noAdd
    ? ` When every hold reaches ${plan.repMax}s, add load.`
    : topPts.every(p => p.r >= ext)
      ? ` Every hold reached ${ext}s+ on bodyweight alone. Add a little load (a plate or a vest) by typing it, or make each hold harder with a harder version.`
      : topPts.every(p => p.r < +plan.repMin)
        ? ` That is your bodyweight, so build the holds up to ${plan.repMin}s or more.`
        : ` That is your bodyweight, so keep adding time past ${plan.repMax}s.`;
  return {
    prev: L0.prev,
    prevOff: L0.prevOff,
    w: top,
    text: `${lastS} Beat ${total}s ${over} at ${lbl(top)}.${then}`,
    lastR,
    basis,
    last: lastS,
    target: `${total + 1}s+ ${over} at ${lbl(top)}`,
    tgt: { kind: 'reps', w: top, total, n: nT, rs: topPts.map(p => p.r), prevBest: null },
    easier: null
  };
}

/** The note that a lift is getting easier at a load (RIR climbing at the same reps), for the session. */
export function easierTextIn(M: Model, ex: ExerciseLike, e: Drift): string {
  // In the lifter's effort scale.
  const sc = effScale(M.s.settings.rirScale);
  return `Getting easier at ${loadLabelIn(M, ex, e.w)}${ex.bw ? '' : ' ' + UIn(M)}: ${sc === 'rpe' ? 'RPE' : 'RIR'} ${effAt(sc, e.from)} → ${effAt(sc, e.to)} at the same reps. Adding load today is reasonable.`;
}
