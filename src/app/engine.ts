/* The load engine (phase 3b, r52; moved from the legacy script,
   tests/moved.js reads each back to r51's code): what to lift next for one
   exercise (suggest and its cases), the steps a load moves in (racks, the
   gym's plates and stacks, the exercise's own step), lighter loads, a start
   borrowed from a close variation, and timed holds. Each function that reads
   the log, the date or a cache takes the model as its first parameter
   (model.ts). */

import type { Plan } from './types';
import type { Drift, ExPoint, Exposure, ExerciseLike, Model, Suggestion } from './model';
import type { LiftBests } from './analytics';
import { EXIn, UIn, exInjuryIn } from './model';
import { IDXIn, bwRefLoadIn, lastOf, statsUpToIn } from './analytics';
import { atCapOfIn, capOfIn, exBarKgIn, gymRackIn, gymStepIn, platesMode, rackGapIn, rackTolIn } from './gym';
import { STEP_LB, fromDIn, stepReadIn, toDIn, unitStepIn } from './units';
import { fmtWIn, loadLabelIn, loadNote, roundLoadIn, swapWIn } from './loads';
import { addDays, daysBetween, isDate, isNum, r1 } from './util';
import {
  BACK_DAYS,
  E1_MAX_RIR,
  atLoad,
  e1,
  e1inv,
  fitE,
  jumpCap,
  jumpPct,
  offSession,
  repFloor,
  rtfAt,
  sameRR,
  workLoad
} from './formulas';
import { KIN_UNI, RACK, injLabel, isCompound, loadMode, noE1, patternOf, rackKind } from './library';
import { fmtDate, rangeWords, repSpan } from './format';
import { overSets } from './session';

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
   a stack with odd pins keeps its whole steps. toD and fromD of a number
   are numbers, as the ! say. */
export function snapUnitIn(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion, down?: boolean): Suggestion {
  if (!res || res.w == null || res.top == null || ex.timed) return res;
  if (gymRackIn(M, ex, plan)) return rackSnapIn(M, ex, plan, res);
  const st = toDIn(M, incOfIn(M, ex, plan))!;
  if (!(st > 0)) return res;
  /* Off the step and not a number anyone types (220.462 from 100 kg): a
     custom step (185 lb on a 10 lb step) or microplates (101.25) are left as
     they are. */
  const off = (v: number): boolean => Math.abs(toDIn(M, v)! / st - Math.round(toDIn(M, v)! / st)) > 0.02;
  const typed = (v: number): boolean => Math.abs(toDIn(M, v)! / 0.05 - Math.round(toDIn(M, v)! / 0.05)) < 0.1;
  if (!off(res.top) || !off(res.w) || typed(res.top)) return res;
  const nw = fromDIn(M, (down ? Math.floor(toDIn(M, res.w)! / st + 1e-9) : Math.round(toDIn(M, res.w)! / st)) * st)!;
  if (Math.abs(nw - res.w) < 1e-9) return res;
  return swapWIn(M, ex, res, nw);
}

/* Days since a lift was last done, by its newest session of any kind up to
   the date being logged. */
export function daysOffIn(M: Model, exId: string, opts?: SuggestOpts | null): number {
  const T = opts && opts.before && isDate(opts.before) ? opts.before : M.today();
  const xs = (IDXIn(M).byEx[exId] || []).filter(x => x.date <= T);
  if (!xs.length) return 0;
  return daysBetween(xs[xs.length - 1].date, T);
}

/* What to lift next for one exercise on a plan: the normal prescription
   (suggestCore), or a lighter day, a deload, or a lift back after a break
   worked out from it (above). A close variation's start, a lighter one, is
   given only when it set a load, as the ! after base.w say; once the base has
   a load (the test below), it is read as one. */
export function suggestIn(M: Model, exId: string, plan: Plan, opts?: SuggestOpts | null): Suggestion {
  opts = opts || {};
  const ex = EXIn(M, exId);
  const off = !(opts.deload || opts.light) && !ex.timed ? daysOffIn(M, exId, opts) : 0;
  const back = off > BACK_DAYS;
  if (!(opts.deload || opts.light || back) || ex.timed)
    return snapUnitIn(M, ex, plan, suggestCoreIn(M, exId, plan, opts));
  const base = suggestCoreIn(M, exId, plan, { ...opts, deload: false, light: false });
  /* A close variation's first session on a Lighter day or deload (r32.1): 90% of the start, like any lighter day. */
  if (base.kin && base.w! > 0) {
    const ks =
      !gymRackIn(M, ex, plan) && rackKind(ex) && rackKind(EXIn(M, base.kin)) ? rackStepIn(M, EXIn(M, base.kin)) : null;
    const lw = ks
      ? fromDIn(M, Math.floor(toDIn(M, base.w! * 0.9)! / toDIn(M, ks)! + 1e-9) * toDIn(M, ks)!)!
      : lighterLoadIn(M, ex, plan, base.w!, base.w! * 0.9);
    return {
      ...base,
      w: lw,
      lastR: Array<number>(Math.max(1, +plan.sets || 1)).fill(+plan.repMin),
      text: `First time, ${opts.deload ? 'deload' : 'Lighter day'}. About ${loadLabelIn(M, ex, lw)} ${UIn(M)}${loadNote(ex)} for ${repSpan(plan.repMin, plan.repMax, '-')} with 3 or more reps in reserve, from your ${EXIn(M, base.kin).name}. Half the usual sets, nothing to beat.`
    };
  }
  if (base.inj || !base.last || base.w == null) return base;
  // Never above last time's working load either: after 25 lb x 12 the normal day may ask 30, and a deload at 25 is not lighter.
  const word = opts.deload ? 'Deload' : opts.light ? 'Lighter day' : `Back after ${Math.round(off / 7)} weeks`;
  const step = incOfIn(M, ex, plan);
  const w0 = base.top != null ? Math.min(base.w, base.top) : base.w;
  const bl = bwRefLoadIn(M, ex);
  const lbl = (w: number): string => `${loadLabelIn(M, ex, w)}${ex.bw ? '' : ' ' + UIn(M)}${loadNote(ex)}`;
  // Assisted: 90% of the lifted load means more help, rounded up to the machine's step so it never lands back on the full load.
  const hs = step > 0 ? toDIn(M, step)! : UIn(M) === 'lb' ? 5 : 2.5;
  const dw = ex.assist
    ? -fromDIn(M, Math.ceil(toDIn(M, bl > 0 ? bl - (w0 + bl) * 0.9 : -w0 * 1.1)! / hs - 1e-9) * hs)!
    : ex.bw
      ? (w0 + bl) * 0.9 - bl > 0
        ? lighterLoadIn(M, ex, plan, w0, (w0 + bl) * 0.9 - bl)
        : 0
      : lighterLoadIn(M, ex, plan, w0, w0 * 0.9);
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
        text: `${base.last} ${word}: about ${lbl(w)} for ${repSpan(plan.repMin, plan.repMax, '-')} with 2 or more reps in reserve. Next time picks up from here.`,
        lastR: Array<number>(n).fill(+plan.repMin),
        basis: base.basis,
        last: base.last,
        target: '',
        tgt: null,
        easier: null,
        back: Math.round(off / 7)
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
      text: `${base.last} ${word}: about ${lbl(w)} for ${repSpan(plan.repMin, plan.repMax, '-')} with 3 or more reps in reserve. Half the usual sets, nothing to beat.`,
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

/* The load engine's prescription for one lift (r36: the 250-line function cut
   into its cases, each below and tried in order, with no change to what comes
   out; tests/r36.js compares it with r35 on random histories). A lift with
   sessions has them under its id in IDX (byEx); with none, every stays
   unread past the test for exps below, and the ! after it say so. */
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
  // Deload and lighter sessions are short or light on purpose, so the last
  // full session sets the target. If there is nothing else, use them.
  const full = all ? all.filter(x => !offSession(x)) : [];
  /* The same lift can sit on two days with different rep ranges (heavy 4-6,
     light 10-12). Each day progresses from its own sessions in its own range
     (r27). That holds while the range is in use: the newest session in it
     within the trend window (42 days) of the newest full session. A range not
     used lately (a lift back on 8-12 after months on 5-8) or never logged
     reads every full session, so the newest load is the starting point.
     Sessions with no range on record (from before r13, imported or demo) go
     along with the range when it is in use. */
  const want: [number, number] = [+plan.repMin, +plan.repMax];
  const exact = (x: Exposure): boolean => !!x.rr && x.rr[0] === want[0] && x.rr[1] === want[1];
  const lastEx = full.filter(exact).pop();
  const inRR = !!lastEx && lastEx.date >= addDays(full[full.length - 1].date, -42);
  const fullRR = inRR ? full.filter(x => sameRR(x.rr, want)) : [];
  const exps = all && all.length ? (fullRR.length ? fullRR : full.length ? full : all) : all;
  const seen = inRR ? all.filter(x => sameRR(x.rr, want)) : all;
  if (ex.timed) return suggestTimedIn(M, ex, plan, exps, opts, injM, seen);
  if (!exps || !exps.length) return sgFirstIn(M, ex, plan, T, injM);
  const last = exps[exps.length - 1],
    ws = last.pts;
  const stx: Partial<LiftBests> = all.length < every!.length ? statsUpToIn(M, exId, all) : IDXIn(M).exStats[exId] || {};
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
  const noAdd = !!ex.bw && !ex.assist && !all.some(x => x.pts.some(p => p.w > 1e-6));
  const abW = ['abs', 'obliques'].includes(ex.primary);
  // Heaviest available load (top of the stack or rack), if set.
  const cap = capOfIn(M, ex, plan, top);
  const atCap = atCapOfIn(M, ex, plan, top, cap);
  const capW = (w: number): number => (cap != null ? Math.min(w, cap) : w);
  // Only the sets at the top load decide progression. Ramp-up sets at lighter
  // loads used to block every load increase unless they also reached repMax.
  const topPts = ws.filter(p => Math.abs(p.w - top) < 1e-6);
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
      text: `${lastS} Injury flagged (${injLabel(injM)}): stay at or below ${lbl(top)}, keep 3 or more reps in reserve, stop on pain.`,
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
     cap on a jump is 25% there, so a first guess well under what the lifter
     can do is corrected in a session or two, not a step at a time. */
  const early = exps.length <= 3;
  const fl = repFloor(topPts, plan.repMin);
  const tp = topPts.slice(0, Math.max(1, +plan.sets || topPts.length)).map(p => ({ ...p, r: fl(p.r) }));
  const C: SuggestCtx = {
    ex,
    exId,
    plan,
    opts,
    T,
    all,
    every: every!,
    exps,
    seen,
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
    sgEasyIn(M, C) ||
    sgPastRangeIn(M, C) ||
    sgBelowRangeIn(M, C) ||
    sgNoStep(C) ||
    sgTopOfRangeIn(M, C) ||
    sgBadDay(C) ||
    sgRepsIn(M, C);
  return res && res.last ? { ...res, prev: L0.prev, prevOff: L0.prevOff } : res;
}

/* No history yet: an injury note, a start from a close variation, or the first-time line. */
export function sgFirstIn(M: Model, ex: ExerciseLike, plan: Plan, T: string, injM: string | null): Suggestion {
  if (injM)
    return {
      w: ex.bw ? 0 : null,
      text: `Injury flagged (${injLabel(injM)}). Start light, keep 3 or more reps in reserve, and stop on pain.`,
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
  return { w: ex.bw ? 0 : null, text, lastR: [], last: '', target: '', tgt: null };
}

/* Every top set 2 or more over the target reserve: the load from the estimate.
   Every top set has a RIR here (the test below), as the ! say. */
export function sgEasyIn(M: Model, C: SuggestCtx): Suggestion | null {
  const { ex, plan, top, step, noAdd, atCap, capW, topPts, lastR, lastS, basis, lbl, prevBest, tgtRir, early } = C;
  if (
    step > 0 &&
    !atCap &&
    !noAdd &&
    !noE1(ex) &&
    topPts.length &&
    topPts.every(p => p.rir != null && p.rir >= tgtRir + 2 && p.r >= plan.repMin)
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
      let k = Math.floor((want - top) / step + 1e-6);
      /* Every set at 5 or more in reserve, the top of the scale: the estimate
         is a floor, so at least one real step, even past the cap (r34.2, from
         the review: 20 lb curls at 5+ in reserve asked to build reps for
         weeks, a 5 lb dumbbell step being more than the cap allows). */
      if (k < 1 && topPts.every(p => p.rir! >= 5)) k = 1;
      if (k >= 1) {
        const nw = ex.assist && top < 0 ? Math.min(0, top + k * step) : capW(top + k * step);
        const rr = r1(topPts.reduce((a, p) => a + p.rir!, 0) / topPts.length);
        return {
          top,
          w: nw,
          text: `${lastS} RIR ${rr} at ${lbl(top)} against a target of ${tgtRir}, so that load was light. Try ${lbl(nw)} for ${repSpan(plan.repMin, plan.repMax, '-')} reps.`,
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
  if (step > 0 && !atCap && !noAdd && !noE1(ex) && topPts.length && topPts.every(p => p.r >= +plan.repMax + 2)) {
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
      const k = Math.floor((want - top) / step + 1e-6);
      const one = progStepIn(M, ex, plan, topLoad, top);
      if (k >= 1 && k * step > one + 1e-6) {
        const nw = ex.assist && top < 0 ? Math.min(0, top + k * step) : capW(top + k * step);
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
  const { ex, plan, exps, inRR, top, step, noAdd, topPts, lastR, lastS, basis, lbl, prevBest, tgtRir } = C;
  /* Below the rep range. Every top set fell short of repMin, either by 2 or
     more reps, or by any amount two sessions running at the same load. Adding
     one rep a week from there never reaches the range, so drop the load to
     what the same e1RM estimate says leaves repMin at the target RIR. Whole
     steps down from the last load, so stacks stay on real pins. */
  if (step > 0 && !noAdd && topPts.length && topPts.every(p => p.r < +plan.repMin)) {
    const gap = +plan.repMin - Math.max(...topPts.map(p => p.r));
    const prev = exps.length >= 2 ? exps[exps.length - 2] : null;
    /* Not a drop while the reps are coming up after a step up (r31): a big
       step for the load (a dumbbell, a small stack) starts below the range
       on purpose, and dropping back made the load swing between two
       numbers. Just after one step up, short by up to 3 is that; two
       sessions short at one load drop only when the reps did not rise. */
    const prevAt = prev ? prev.pts.filter(p => Math.abs(p.w - top) < 1e-6) : [];
    const sumR = (a: readonly ExPoint[]): number => a.reduce((x, p) => x + p.r, 0);
    const rising = prevAt.length > 0 && sumR(topPts.slice(0, prevAt.length)) > sumR(prevAt);
    const justUp = !!prev && prev.topW < top - 1e-6 && top - prev.topW <= step * 1.5 + 1e-6;
    const repeat = !!prev && Math.abs(prev.topW - top) < 1e-6 && prevAt.every(p => p.r < +plan.repMin) && !rising;
    /* A range not yet trained (r30): history at 5 x 5 under a 6 to 10 plan
       asked for 122.5 x 16 reps over 3 sets, under the plan's minimum. The
       first session in a new range sets its load from the estimate at once,
       as a range moved down does. */
    /* Four sessions in a row under the range at one load drop it, rising or
       not (r32, second check: 5, 5, 4, 4 then 5, 5, 5, 4 then 5, 5, 5, 5
       kept the load for weeks, each "rising"). */
    let shortRun = 0;
    for (let k = exps.length - 1; k >= 0; k--) {
      const x = exps[k];
      if (Math.abs(x.topW - top) > 1e-6) break;
      const at = atLoad(x.pts, x.topW);
      if (!at.length || !at.every(p => p.r < +plan.repMin)) break;
      shortRun++;
    }
    if ((gap >= 2 && !(justUp && gap <= 3)) || repeat || !inRR || shortRun >= 4) {
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
        const k = Math.ceil((top - want) / step - 1e-6);
        const nw = top - k * step;
        if (k >= 1 && (nw > 0 || (ex.bw && (nw >= 0 || ex.assist)))) {
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
  const { plan, top, step, noAdd, abW, atCap, topPts, lastR, lastS, basis, lbl, prevBest, tp } = C;
  /* At the heaviest load available: keep adding reps past the top of the range.
     Once every set reaches about 40% past it, the next step is harder reps
     rather than more load. A load step of 0 means the load never changes (a
     fixed dumbbell, say), so it reads the same way instead of "add 0 lb" (r27). */
  /* The rep target counts as many sets as the plan has (r30): five sets of
     history under a three-set plan read "26+ reps over your first 5 sets". */
  if (atCap || !(step > 0) || noAdd) {
    const where = atCap ? 'the heaviest load available' : noAdd ? 'your bodyweight' : 'a fixed load (load step 0)';
    const below = topPts.every(p => p.r < +plan.repMin);
    const total = tp.reduce((a, p) => a + p.r, 0);
    const nT = tp.length;
    const over = overSets(nT, plan);
    const ext = +plan.repMax + Math.max(3, Math.round(+plan.repMax * 0.4));
    const maxed = topPts.every(p => p.r >= ext);
    const tip = maxed
      ? noAdd && !abW
        ? ` Every set reached ${ext}+ on bodyweight alone. Add a little load (a belt or a vest) by typing it, or make each rep harder: a 3 to 4 second lowering, a pause, or a harder version.`
        : ` Every set reached ${ext}+ at ${where}, so make each rep harder instead: lower for 3 to 4 seconds and pause at the stretch, go one arm or one leg at a time, or finish with a drop set. Add a note when you change it so the numbers stay comparable.`
      : below
        ? ` That is ${where}, so build the reps up to ${plan.repMin} or more.`
        : ` That is ${where}, so keep adding reps past ${plan.repMax}.`;
    return {
      top,
      w: top,
      text: `${lastS} Beat ${total} reps ${over} at ${lbl(top)}.${tip}`,
      lastR,
      basis,
      last: lastS,
      target: `${total + 1}+ reps ${over} at ${lbl(top)}${atCap ? ', the heaviest available' : ''}`,
      tgt: { kind: 'reps', w: top, total, n: nT, rs: tp.map(p => p.r), prevBest },
      easier: maxed
        ? `Past ${ext} reps at ${atCap ? 'the heaviest load' : 'this load'}: slow the lowering to 3 to 4 seconds with a pause at the stretch, go one side at a time, or add a drop set.`
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
  const { ex, plan, top, cap, capW, topPts, lastR, lastS, basis, lbl, prevBest, tgtRir, tp } = C;
  if (topPts.every(p => p.r >= plan.repMax)) {
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
    const wide = +plan.repMax - +plan.repMin >= 3;
    let aim = +plan.repMin;
    const q = Math.min(tgtRir, E1_MAX_RIR);
    const bwT = bwRefLoadIn(M, ex);
    if (!noE1(ex)) {
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
      if (f != null && cost >= 1.5 && wide) {
        const can = Math.floor(f - q + 1e-9);
        if (can < aim) aim = Math.max(1, can);
      }
    }
    // Not when every set was rated 5 or more in reserve: the estimate is only a floor there (r34.2).
    if (topPts.every(p => p.rir != null && p.rir >= 5)) aim = +plan.repMin;
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
      const need = rn <= 10 ? ((nw + bwT) * 36) / (37 - rn) : (nw + bwT) * (1 + rn / 30);
      const ext2 = +plan.repMax + Math.max(2, Math.round(+plan.repMax * 0.25));
      const Z = Math.min(ext2, Math.ceil((rtfAt(need, top + bwT) as number) - q - 1e-9));
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
      text: `${lastS} Every set at ${lbl(top)} hit ${plan.repMax}: add ${fmtWIn(M, nw - top)} ${UIn(M)}${cap != null && nw >= cap - 1e-6 ? ', which is the heaviest available,' : ''} and aim for ${aim}+ reps${big ? `, then build back to ${plan.repMax}. That step is large for this load, so fewer reps than the range is expected at first` : ''}.`,
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
  const { plan, exps, top, topPts, lastR, lastS, basis, lbl, prevBest } = C;
  /* A bad day at a load already done in the range (r32, second check: 7,
     7, 6, 6 then 5, 5, 4, 4 asked "19+ reps" and greyed 5, 5, 4, 4): every set
     under the range, the session before at this load in it. The target is
     the bottom of the range in every set again, not one rep more than the
     bad day. */
  {
    const prv = exps.length >= 2 ? exps[exps.length - 2] : null;
    const pAt = prv && Math.abs(prv.topW - top) < 1e-6 ? atLoad(prv.pts, top) : [];
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
     counts as the bottom of it (repFloor) is said. */
  const total = tp.reduce((a, p) => a + p.r, 0);
  const nT = tp.length;
  const over = overSets(nT, plan);
  const floored = tp.some((p, i) => topPts[i] && topPts[i].r < p.r)
    ? ` (a set under ${plan.repMin} counts as ${plan.repMin})`
    : '';
  return {
    top,
    w: top,
    text: `${lastS} Beat ${total} reps ${over} at ${lbl(top)}${floored}. When every set at that load reaches ${plan.repMax}, ${ex.assist ? 'take some help off' : 'add load'}.`,
    lastR,
    basis,
    last: lastS,
    target: `${total + 1}+ reps ${over} at ${lbl(top)}`,
    tgt: { kind: 'reps', w: top, total, n: nT, rs: tp.map(p => p.r), prevBest },
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
   meant to err light; the next session works out from what was done. */
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
  const from = addDays(T, -120);
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
    const xs = I.byEx[id].filter(x => x.date <= T && !offSession(x) && !x.cut);
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
  const q = Math.min((+plan.rir || 0) + 1, E1_MAX_RIR);
  const want = e1inv(est * (isCompound(ex) ? 0.8 : 0.9), mid + q);
  const L = gymRackIn(M, ex, plan);
  let w: number;
  if (L) {
    const c = L.filter(x => x <= want + 1e-6);
    if (!c.length) return null;
    w = c[c.length - 1];
  } else {
    const rs = rackKind(ex) && rackKind(k.ex) ? rackStepIn(M, k.ex) : null;
    const st = toDIn(M, rs || incOfIn(M, ex, plan))!;
    if (!(st > 0)) return null;
    w = fromDIn(M, Math.floor(toDIn(M, want)! / st + 1e-9) * st)!;
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
  const topPts = ws.filter(p => Math.abs(p.w - top) < 1e-6);
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
  if (ex && ex.inc == null && Math.abs(v - unitStepIn(M)) < 1e-6) {
    const L = gymRackIn(M, ex, plan);
    if (L) return rackGapIn(M, L, at);
    if (rackKind(ex)) {
      const g = rackStepIn(M, ex);
      if (g) return g;
    }
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
  const L = gymRackIn(M, ex, plan);
  if (!L || !res || res.w == null || ex.timed) return res;
  const w = res.w,
    top = res.top,
    tl = rackTolIn(M),
    tt = rackTolIn(M, L, top);
  if (L.some(x => Math.abs(x - w) < 1e-6) || (top != null && Math.abs(w - top) < 1e-6)) return res;
  const dn = L.filter(x => x <= w + tl);
  let nw: number | undefined;
  if (top != null && w > top) {
    const c = dn.filter(x => x > top + tt);
    nw = c.length ? c[c.length - 1] : L.find(x => x > top + tt);
  } else nw = dn.length ? dn[dn.length - 1] : L[0];
  return nw == null || Math.abs(nw - w) < 1e-9 ? res : swapWIn(M, ex, res, nw);
}

/* Dumbbells and kettlebells come in fixed weights (r32, from the third
   review: 12 kg dumbbells went to 14.5, which no rack has). With no step set
   on the exercise, the step is the largest common rack spacing that every
   load logged on it fits: 12, 14 and 16 kg is a rack in 2 kg steps, 12.5 and
   15 one in 2.5. Loads that fit both (10, 20) keep the default. Steps are
   read in the unit on screen, since that is what the rack is labelled in.
   It is asked only of a dumbbell or kettlebell lift (its callers test
   rackKind first), as the ! after rackKind says, and toD of a number is a
   number, as the other ! says. */
export function rackStepIn(M: Model, ex: ExerciseLike): number | null {
  const I = IDXIn(M);
  I._rack = I._rack || {};
  const key = UIn(M) + ex.id;
  if (I._rack[key] !== undefined) return I._rack[key];
  const xs = (I.byEx[ex.id] || []).slice(-12);
  const ws: number[] = [];
  for (const x of xs) for (const p of x.pts) if (p.w > 0) ws.push(toDIn(M, p.w)!);
  const fits = (g: number): boolean => ws.every(w => Math.abs(w / g - Math.round(w / g)) < 0.01);
  const g = ws.length ? RACK[rackKind(ex)!][UIn(M)].find(fits) : null;
  return (I._rack[key] = g ? fromDIn(M, g) : null);
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
    for (const x of up) if (x <= want + 1e-6) nw = x;
    return nw - at!;
  }
  const inc = incOfIn(M, ex, plan, at);
  if (!(inc > 0)) return inc;
  const pct = jumpPct(ex, plan);
  return inc * Math.max(1, Math.floor((pct * Math.max(0, loadKg)) / inc + 1e-9));
}

/** The note that a lift is getting easier at a load (RIR climbing at the same reps), for the session. */
export function easierTextIn(M: Model, ex: ExerciseLike, e: Drift): string {
  return `Getting easier at ${loadLabelIn(M, ex, e.w)}${ex.bw ? '' : ' ' + UIn(M)}: RIR ${e.from} → ${e.to} at the same reps. Adding load today is reasonable.`;
}

/* A load at or below `to`, reached from `from` in whole steps of the
   exercise's own load step, so a stack stays on its pins and a dumbbell rack
   on its dumbbells, and never below the empty bar on a barbell lift (r27).
   It used to round to the nearest 5 lb or 2.5 kg whatever the equipment: a
   15 lb cable raise deloaded to 10, a 150 lb stack with 10 lb pins to 135, a
   95 lb bench warmed up at 40, under the bar. With no step set, it rounds
   down to 5 lb or 2.5 kg as before. May return `from` when nothing lighter
   exists (the bar itself). An exercise without its own bar has none, and an
   absent bar compares false with 0, which the cast lets TypeScript accept. */
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
  const step = incOfIn(M, ex, plan, from);
  let w: number;
  if (step > 0) {
    const k = Math.max(1, Math.ceil((from - to) / step - 1e-6));
    w = from - k * step;
  } else w = roundLoadIn(M, to, true);
  /* The bar floor is for lifts on the full bar (bench, squat, rows), typed as
     the total. Curls and skull crushers are often on an EZ or fixed bar
     lighter than the bar weight setting, and a per-side number has no bar in
     it, so neither is floored. At the bar itself nothing lighter exists, so
     `from` comes back and a deload keeps the bar. */
  const floor =
    platesMode(ex) === 'bar' && loadMode(ex) === 'total' && (isCompound(ex) || (ex.barKg as number) > 0)
      ? exBarKgIn(M, ex)
      : 0;
  if (w < floor - 1e-6) w = Math.min(floor, from);
  return Math.max(0, w);
}
