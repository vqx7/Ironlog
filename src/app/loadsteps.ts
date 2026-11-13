/* The steps a load moves in: a lift's own step, its equipment's, the gym's racks,
   plates and stacks, the grid every suggestion snaps to and the move of a suggestion onto it, and the loads above and
   below one, for lighter loads and minus and plus. Each function that reads the log, the date or a cache takes the
   model first (model.ts). */

import type { Plan } from './types';
import type { ExerciseLike, Model, Suggestion } from './model';

import { UIn } from './model';
import { IDXIn, liftReadIn } from './analytics';
import { capOfIn, gymRackIn, gymStepIn, loadFloorIn, loadsFloorAt, plateGridIn, rackGapIn, rackTolIn } from './gym';
import {
  EQUIP_STEP,
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
import { isNum, EPS, EPS_SAME, MILLIONTHS } from './util';
import { LIGHTER_LOAD, jumpCap, jumpPct, rtfAt, e1At } from './formulas';
import { RACK, loadMode, noE1, rackKind } from './library';
import { bwRefLoadIn } from './setread';
/** Plates: a load within this many kilograms of a load the plates make is that load, at the least (a thousandth of a step before). */
const PLATE_TOL_MIN = 1e-3;
/** A load is off the unit's step when its distance from the nearest step is more than this share of one: 220.462 from 100 kg is, 185 on a 10 lb step is not. */
const OFF_STEP = 0.02;
/** A step costing this many reps or more is large for the load: reps build first. */
export const BIG_STEP_REPS = 1.5;
/** A rack's spacing fits a load within this share of a step. */
const RACK_FIT = 0.01;
/** The newest sessions of a lift its rack spacing is read from. */
const RACK_READ_N = 12;

/* Loads logged in the other unit (after kg to lb, 100 kg reads 220.5 lb,
   and the next is not "225.5", nor 16 kg dumbbells "35.3 per dumbbell"): when the last working load is off the step in the unit on
   screen, the suggestion is put on the nearest step (down for a lighter
   day), and the words follow. Loads already on the step are untouched, so
   a stack with odd pins keeps its whole steps. On a rack read from its
   spacing the result then goes onto the rack (gridSnap), as on a rack
   from Your gym. A lighter day, a deload or a return after a break (down)
   never comes out heavier than last time's load (20 kg logged on the bar,
   shown in lb, is not raised to the 45 lb bar the app assumes for a Lighter
   day to ask more than last time); when nothing
   lighter is loadable, last time's own load, which was lifted, is the one
   asked. */
/** A suggestion put on the nearest step in the unit on screen (onto the rack where the lift has one); going down, never heavier than last time's load. */
export function snapUnitIn(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion, down?: boolean): Suggestion {
  const plates = res && res.w != null && !ex.timed && !!plateGridIn(M, ex, plan);
  const out = plates ? plateSnap(M, ex, plan, res, down) : gridSnap(M, ex, plan, unitSnap(M, ex, plan, res, down));
  /* A lighter day, a deload or a return is never above last time's load, but never under the bar either (CLAUDE.md, Numbers): the empty 20 kg
     bar shown in lb is the 45 lb bar, a Lighter day too. */
  if (
    !down ||
    res.top == null ||
    res.w == null ||
    out.w == null ||
    out.w <= Math.max(res.top, loadFloorIn(M, ex)) + EPS
  )
    return out;
  return Math.abs(res.w - res.top) < EPS ? res : swapWIn(M, ex, res, res.top);
}

/* A suggestion off the plates' loads moves onto them, as one off a rack does
   (gridSnap): a step up to the heaviest of them not past it that is still
   above last time, else the next one above last time; anything else, last
   time's own load included (it cannot be loaded now), to the heaviest not
   past it, so a repeat never asks for more than was done. In place of the
   rounding onto the step in the unit on screen (unitSnap), which counted the
   step from 0 and so missed the bar's (100 kg read in lb as 220, off 45 +
   10n). The words and a reps target follow the load as there (moveIn). */
function plateSnap(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion, down?: boolean): Suggestion {
  const w = res.w,
    top = res.top;
  if (w == null) return res;
  // The loads Your gym's plates make, from the one list (loadsForIn), as every other rule reads them.
  const Ls = loadsForIn(M, ex, plan, top ?? null),
    t = rackTolIn(M);
  const dn = Ls.floor(w) ?? w;
  /* Within the shown digit of a load the plates make, the suggestion is that
     load itself: kept as the number typed (52.486 kg for
     52.5), the plate line under it would come out a plate short and the next
     step be taken from it, so it would never reach the next plates. The number on screen is the same, so nothing more is said. */
  if (Math.abs(dn - w) <= t) return Math.abs(dn - w) < EPS ? res : swapWIn(M, ex, res, dn);
  /* Up from last time: the heaviest load the plates make not past what was asked, else the next one above last time,
     but never past the heaviest load the lift has (capOfIn: with 102 kg the most there is, 100 kg does not step to 105
     called the heaviest available). */
  const cap = capOfIn(M, ex, plan, top),
    up = top != null ? Ls.above(top) : null,
    upOk = up != null && (cap == null || up <= cap + t);
  const nw = !down && top != null && w > top + t ? (dn > top + t ? dn : upOk ? up : dn) : dn;
  return moveIn(M, ex, plan, res, nw, 'the nearest load your plates make');
}

/* The snap onto the step in the unit on screen (above). */
function unitSnap(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion, down?: boolean): Suggestion {
  if (!res || res.w == null || res.top == null || ex.timed) return res;
  if (gymRackIn(M, ex, plan)) return rackSnapIn(M, ex, plan, res);
  const nw = unitGridIn(M, ex, plan, res.top, res.w, down);
  if (nw == null || Math.abs(nw - res.w) < EPS) return res;
  return moveIn(M, ex, plan, res, nw, `the nearest load in ${UIn(M)}`);
}

/* The spacing of the loads that exist for a lift, in kg: its own step, the plan's, Your gym's rack,
   plates or stack, the rack read from its loads, else the unit's default, 5 lb or 2.5 kg. The step by equipment (10
   lb on a bar) is how far a load goes up, not which loads exist (V, 2026-11-03: on a 10 lb grid 100 kg shown in lb,
   220.5, was held at 225 and stepped to 235, 225 lb shown in kg was held at 100, and a first front squat's 93.7 kg
   start was rounded down to 90). The finer of that step and the unit's default would take 5 lb over a kg gym's 2.5
   kg plates. */
/** The spacing of the loads that exist for a lift, in kg: which loads exist, not how far a load goes up. */
export function loadGridIn(M: Model, ex: ExerciseLike, plan?: Pick<Plan, 'inc'> | null): number {
  return stepOfIn(M, ex, plan, undefined, false);
}

/* The load on the step in the unit on screen for a load `w` asked after
   last time's `top` (kg), or null where that step does not apply: a load
   typed in the unit on screen, or on its step already (unitSnap, above). The
   engine's cases whose words depend on the load (the step at the top of the
   range, the way back after a break) take it before they word it, so what
   they say is said of the load shown. */
/** The load on the step in the unit on screen for a load asked after last time's, or null where that step does not apply. */
export function unitGridIn(
  M: Model,
  ex: ExerciseLike,
  plan: Plan,
  top: number,
  w: number,
  down?: boolean,
  whole?: boolean
): number | null {
  if (ex.timed || gymRackIn(M, ex, plan) || plateGridIn(M, ex, plan)) return null;
  const sl = inUnitIn(M, incOfIn(M, ex, plan));
  if (!(sl > 0)) return null;
  /* Only a step set in the unit on screen makes loads that exist in it: the unit's own,
     or one typed in it (10 lb on a lb plan, whose loads around a 20 kg bar are the 45 lb bar and 10 lb steps). A
     step set in the other unit (5 kg dumbbells seen in lb, a 10 lb curl bar seen in kg) makes its loads from
     the last one, so they are shown converted: counted on that step from 0 in the unit on screen, 37.5 kg dumbbells
     on a 5 kg step would be "88.2 lb ... the nearest load in lb", which no rack has, and a 65 lb curl on a 10 lb step
     would read 27.2 kg, which is 60 lb. */
  const st = inUnitIn(M, loadGridIn(M, ex, plan));
  if (!onStep(st, TYPED_STEP)) return null;
  /* The loads the step makes are counted from the bar on a lift on the full
     bar typed as the total (loadFloorIn), from 0 on any other: counted
     from 0, a 10 lb step would make 40 and 50 around a 20 kg bar (44.1 lb),
     and call 50 "the nearest load in lb" where the 45 lb bar and 10 lb steps
     make 45, 55 and so on. */
  const o = inUnitIn(M, loadFloorIn(M, ex));
  const at = (k: number): number => o + k * st;
  /* Off the step and not a number anyone types (220.462 from 100 kg): a
     custom step (185 lb on a 10 lb step) or microplates (101.25) are left as
     they are. Typed is exact in the unit on screen, as a number typed in it
     reads back (within a tenth of 0.05, one load in five converted from the
     other unit would pass for typed, and 42.5 kg shown as 93.7 lb be told to
     add 5 lb, to 98.7). */
  const off = (v: number): boolean => {
    const k = (inUnitIn(M, v) - o) / st;
    return Math.abs(k - Math.round(k)) > OFF_STEP;
  };
  const typed = (v: number): boolean => onStep(inUnitIn(M, v), TYPED_STEP);
  if (!off(top) || !off(w) || typed(top)) return null;
  /* Which step. A lighter day, a deload or a return after a break takes
     the step below; anything else the nearest. Never under the floor (the
     empty bar on a full-bar lift typed as the total, else one step on a
     loaded lift), and, but on those lighter days, never a tenth or more under
     the load last done (LIGHTER_LOAD): the next session would read as lighter
     and set no target, so the same snap would come back each time. The step
     above then. Rounded down under every target of reps, 2 kg dumbbells read
     in lb went to 0 lb, the 20 kg bar to 40 lb, and 4 kg to 5 lb, three
     sessions running. */
  const x = inUnitIn(M, w);
  const lo = at(Math.floor((x - o) / st + EPS));
  const loaded = !ex.bw && !ex.assist;
  const fl = Math.max(o, loaded ? st : 0);
  let d = down ? lo : at(Math.round((x - o) / st));
  if (!down && loaded && d < x * LIGHTER_LOAD - EPS) d = lo + st;
  if (!ex.assist && d < fl - EPS) d = at(Math.ceil((fl - o) / st - EPS));
  /* Up from last time, never past both what was asked and the cap on one
     session's rise (jumpCap, on the load as moved: a bodyweight lift's share
     of its bodyweight with it) while a step under that is still above last
     time (not 57.5 kg on its own 10 lb step, 126.8 lb, rounded from 136.8 to
     140, 10.4% up; nor a 44 kg kettlebell, 97 lb, from 107 to 110). With no step between last time and the cap, the step past
     it: one real step at least, as at the top of the range. Asked for a whole
     step (whole: the step at the top of the range), the step under is taken
     only when it is a whole step above last time: a sliver of one (49.5 lb
     to 50 on a 10 lb step, "add 0.5 lb") is none, so the whole step stays
     and the top of the range builds reps for it first (V, 2026-10-27). */
  const bwK = bwRefLoadIn(M, ex);
  const tp = inUnitIn(M, top);
  if (!down && !ex.assist && !(ex.bw && !(bwK > 0)) && d > tp + EPS) {
    const tot = top + bwK;
    const most = Math.max(x, inUnitIn(M, tot * jumpCap(ex, tot) - bwK));
    const under = at(Math.floor((most - o) / st + EPS));
    if (d > most + EPS && under > tp + EPS && !(whole && under < tp + sl - EPS)) d = under;
  }
  // Never past the heaviest load the lift has (capOfIn), which the engine's own load already keeps to: that load, then.
  const cp = capOfIn(M, ex, plan, top);
  return cp != null && kgOfIn(M, d) > cp + EPS ? null : kgOfIn(M, d);
}

/* A suggestion moved to another load (by unitSnap or plateSnap): the load
   swapped in, a reps target turned into a load target when the load went
   up, and the step its words name restated. `why` names what the new load
   is nearest to. */
function moveIn(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion, nw: number, why: string): Suggestion {
  if (res.w == null || Math.abs(nw - res.w) < EPS) return res;
  const out = swapWIn(M, ex, res, nw);
  /* A heavier load under a target of reps (12.5 kg dumbbells read in lb
     going to 30 lb, 9% heavier): with the reps to beat unchanged, the lifter
     falls short. Those reps were done lighter,
     so the target is that load for the bottom of the range in every set, as
     after any step up. */
  /* Unless the move costs under BIG_STEP_REPS by the rep formula: a load the unit on screen cannot
     make, rounded to one it can, is the same load, so the reps to beat stand there. A lb lifter's 185 lb for 8s read
     in kg was 85 kg for 6+, reps back to the bottom for 1.3% more; a 60 lb pressdown done for 15s, 27.5 kg for 10+. */
  if (nw > res.w + EPS && res.tgt && res.tgt.kind === 'reps' && smallMoveIn(M, ex, res.w, nw, res.tgt.rs || [])) {
    return {
      ...out,
      // The target alone: the rest of the words were said of the load done, and swapped they would say it was done here.
      text: `${res.last ? res.last + ' ' : ''}${loadLabelIn(M, ex, nw)}${ex.bw ? '' : ' ' + UIn(M)}${loadNote(ex)} is ${why} to what you did: aim for ${out.target}.`
    };
  }
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
     shown (not "add 5 lb" to 93.7 lb beside 100 lb, nor "take 5 lb of help
     off" beside help that moved by another amount). With no
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

/* Whether a load moved up from `w` to `nw` costs under BIG_STEP_REPS at the most reps a set did, by the rep formula
   (fitE's, reps read to failure): what makes it the same load for a target of reps. Never on a lift with no estimate,
   or a bodyweight lift with no weigh-in, which have no total load to read it against: those keep the bottom of the
   range. */
function smallMoveIn(M: Model, ex: ExerciseLike, w: number, nw: number, rs: readonly number[]): boolean {
  const bwK = bwRefLoadIn(M, ex);
  if (noE1(ex) || (ex.bw && !(bwK > 0)) || !rs.length) return false;
  const r = Math.max(...rs);
  if (!(r > 0) || !(w + bwK > 0)) return false;
  const at = rtfAt(e1At(w + bwK, r), nw + bwK);
  return at != null && r - at < BIG_STEP_REPS;
}

/* `at`: the load the step is taken from. Only a rack from Your gym needs it:
   its spacing can change along the rack (2.5 lb steps to 25, then 5). */
/** A lift's load step in kg: its own, the plan's, the gym's rack or plates, or the rack read from its loads. */
export function incOfIn(
  M: Model,
  ex: ExerciseLike | null | undefined,
  plan?: Pick<Plan, 'inc'> | null,
  at?: number | null
): number {
  return stepOfIn(M, ex, plan, at, true);
}

/** A lift's load step in kg, with the step by equipment or, for the loads that exist (loadGridIn), without it. */
function stepOfIn(
  M: Model,
  ex: ExerciseLike | null | undefined,
  plan: Pick<Plan, 'inc' | 'jump'> | null | undefined,
  at: number | null | undefined,
  byEquip: boolean
): number {
  const v = stepReadIn(M, ex && ex.inc != null ? ex.inc : plan && isNum(+plan.inc) ? +plan.inc : STEP_LB);
  if (ex && ex.inc == null && Math.abs(v - unitStepIn(M)) < EPS_SAME) {
    const L = gymRackIn(M, ex, plan);
    if (L) return rackGapIn(M, L, at);
    /* On a rack read from its spacing (rackGridIn) or Your gym's plates: the spacing, or from a load off them the way to
       the next one up, as every rule that moves a load reads it (loadsForIn). */
    const gr = rackGridIn(M, ex, plan, at);
    if (gr) {
      if (at != null && at > 0 && offGrid(M, ex, plan, at)) {
        const up = loadsForIn(M, ex, plan, at).above(at);
        return up == null ? gr : up - at;
      }
      return gr;
    }
    if (plateGridIn(M, ex, plan) && at != null && at > 0) {
      const Ls = loadsForIn(M, ex, plan, at);
      if (!Ls.has(at)) return (Ls.above(at) ?? at) - at;
    }
    const gs = gymStepIn(M, ex);
    if (gs) return gs;
    const es = byEquip ? equipStepIn(M, ex) : null;
    if (es) return es;
  }
  return v;
}

/** The default step for how a lift is loaded (EQUIP_STEP, 367), in kg, or null where the unit's default stands. */
function equipStepIn(M: Model, ex: ExerciseLike | null | undefined): number | null {
  if (!ex || ex.bw || ex.timed) return null;
  const m = loadMode(ex);
  const kind =
    m === 'stack'
      ? 'stack'
      : m === 'each'
        ? 'each'
        : m === 'total' && (ex.equip === 'barbell' || ex.equip === 'smith')
          ? 'bar'
          : null;
  if (!kind) return null;
  const u = UIn(M);
  return u === 'kg' ? EQUIP_STEP[kind].kg : EQUIP_STEP[kind].lb * LB;
}

/* A suggestion that is not on the rack moves onto it: up, to the heaviest
   rack weight not past it that is still above last time; down, to the
   heaviest not past it. A load equal to last time's is left, since it was
   lifted. Engine steps are taken from the rack already, so this is the net
   for multi-step jumps on a rack whose spacing changes. */
function rackSnapIn(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion): Suggestion {
  return listSnapIn(M, ex, plan, res);
}

/* One rounding onto a rack, Your gym's or one read from its spacing, one rule rather than two to drift
   apart: a load on the rack, or last time's load (it was lifted), is left; up from last time, the
   heaviest weight not past what was asked that is still above last time, else the next one above last time; anything
   else, the heaviest not past it, at least the lightest. */
function listSnapIn(M: Model, ex: ExerciseLike, plan: Plan, res: Suggestion): Suggestion {
  const w = res.w,
    top = res.top;
  if (w == null || ex.timed) return res;
  const Ls = loadsForIn(M, ex, plan, top ?? null);
  if (Ls.kind !== 'rack' && Ls.kind !== 'grid') return res;
  if (Ls.has(w) || (top != null && Math.abs(w - top) < EPS_SAME)) return res;
  const f = Ls.floor(w);
  let nw: number | null;
  if (top != null && w > top) {
    const u = Ls.above(top);
    nw = f != null && u != null && f >= u - EPS_SAME ? f : u;
  } else nw = f ?? Ls.first;
  return nw == null || Math.abs(nw - w) < EPS ? res : swapWIn(M, ex, res, nw);
}

/* Dumbbells and kettlebells come in fixed weights (12 kg dumbbells do not
   go to 14.5, which no rack has). With no step set
   on the exercise, the step is the largest common rack spacing that every
   load logged on it fits: 12, 14 and 16 kg is a rack in 2 kg steps, 12.5 and
   15 one in 2.5. Loads that fit both (10, 20) keep the default. Steps are
   read in the unit on screen, since that is what the rack is labelled in.
   It is asked only of a dumbbell or kettlebell lift (its callers test
   rackKind first), as the ! after rackKind says, and toD of a number is a
   number, as the other ! says. With nothing logged yet, the load in hand
   (`at`) is the one weight of the rack known, read the same way (else a
   first session's 6 kg dumbbells, done easily, are stepped to 8.5 kg, which no
   rack has, and the 6, 8.5 and 11 kg logged after read as a rack in 0.5 kg
   steps for the next twelve sessions); it is not
   kept, since it changes with the load. The loads are read from the newest
   session back: an older session whose loads fit only a
   spacing that is no step of the newer ones' (2.5 kg against 2) is another
   gym's, so it and those before it are left out. Read all together, 22.5,
   25 and 27.5 kg, then 24 at a gym in 2 kg steps, fit only 0.5 kg, and 24.5
   would be asked, which neither rack has. A spacing that is a step of the other
   (5 lb and 2.5) is the same rack read more closely. */
export function rackStepIn(M: Model, ex: ExerciseLike, at?: number | null): number | null {
  const I = IDXIn(M);
  I._rack = I._rack || {};
  // Read since a new machine or gym (liftReadIn), its rack another gym's before: kept by where that stretch starts.
  const xs = liftReadIn(M, ex.id);
  const key = UIn(M) + ex.id + '|' + (xs.length ? xs[0].sid : '');
  /* The spacings tried, largest first. For dumbbells the default step by equipment (V's pick of 2026-11-02:
     2 kg each) is read once the rack is: when every load read fits it too (10, 20, 30 kg), the rack is in 2 kg
     steps; a load only 2.5 kg fits (12.5, 17.5), in any session read, keeps 2.5. Read the other way round, the
     newest loads alone (20 kg) read as 2 and an older 17.5 would be taken for another gym's, so 22 kg, which
     that rack does not have, would be asked. */
  // A lift with no rack has no rack step, before the rack is read, which would throw.
  const kind = rackKind(ex);
  if (!kind) return null;
  const all = RACK[kind][UIn(M)];
  const pref = kind === 'dumbbell' ? EQUIP_STEP.each[UIn(M)] : null;
  const fits = (ws: readonly number[], g: number): boolean =>
    ws.every(w => Math.abs(w / g - Math.round(w / g)) < RACK_FIT);
  const fitD = (ws: readonly number[]): number | null => all.find(g => fits(ws, g)) ?? null;
  const fit = (ws: readonly number[]): number | null => {
    const g = pref != null && all.includes(pref) && fits(ws, pref) ? pref : fitD(ws);
    return g != null ? fromDIn(M, g) : null;
  };
  if (I._rack[key] === undefined) {
    const steps = (a: number, b: number): boolean => Math.abs(a / b - Math.round(a / b)) < RACK_FIT;
    let ws: number[] = [],
      g: number | null = null;
    for (const x of xs.slice(-RACK_READ_N).reverse()) {
      const own: number[] = [];
      for (const p of x.pts) if (p.w > 0) own.push(toDIn(M, p.w)!);
      if (!own.length) continue;
      const f = fitD([...ws, ...own]);
      if (ws.length && f !== g) {
        const h = fitD(own);
        if (f == null || g == null || h == null || !(steps(g, h) || steps(h, g))) break;
      }
      ws = [...ws, ...own];
      g = f;
    }
    I._rack[key] = ws.length ? fit(ws) : null;
  }
  const logged = xs.some(x => x.pts.some(p => p.w > 0));
  const d = logged || at == null || !(at > 0) ? null : toDIn(M, at);
  return d == null ? I._rack[key] : fit([d]);
}

/* A rack read from its spacing: a dumbbell or kettlebell lift with no
   step of its own, whose bells Your gym does not list, has its weights at
   the multiples of the spacing rackStepIn reads, so a weight off them steps
   to the rack's next one rather than by the spacing from where it is. Lb
   dumbbells are read on 5 lb, or 2.5 lb where the weights are on it, never
   1 (V's call of 2026-10-18: with nothing logged, 12 lb went up to 13, which
   no lb rack has): 12 lb steps to 15 and 8 to
   10. Kettlebells, and dumbbells in kg, read on the spacing their weights
   fit. A load on the rack's weights steps by the spacing from where it is,
   to the same number; a load off them (offGrid)
   steps to the rack's next weight in every path that steps a load: the step
   (incOfIn), progression (progStepIn), lighter loads (lighterLoadIn),
   heavier ones (heavierLoadIn), the engine's cases that take several steps
   at once, and the snap of a suggestion onto the rack (rackSnapIn). */
/** A dumbbell or kettlebell lift's rack spacing in kg when its weights are read from it, or null. */
function rackGridIn(
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
/** A rack's spacing read from its weights when a load is off it, else null. */
export function offGrid(
  M: Model,
  ex: ExerciseLike,
  plan: Pick<Plan, 'inc'> | null | undefined,
  at: number
): number | null {
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
  return listSnapIn(M, ex, plan, res);
}

/* When every set reaches the top of the range, the load goes up by whole
   multiples of the smallest step you can add, sized to about 2.5% of the
   load on compound lifts and 5% on isolation lifts. A fixed 5 lb was 20% on a
   25 lb raise and 1% on a 500 lb leg press. A rack is read only with a load
   to step from (at), as the ! say. */
export function progStepIn(M: Model, ex: ExerciseLike, plan: Plan, loadKg: number, at?: number | null): number {
  /* On a rack, from Your gym or read from its spacing when the load is off its weights: the heaviest weight within
     the jump, at least the next one up (a load near a weight is that weight, so the next one up is a whole
     step: V 2026-10-27). */
  if (at != null) {
    const Ls = loadsForIn(M, ex, plan, at);
    if (Ls.kind === 'rack' || Ls.kind === 'grid') {
      const up = Ls.above(at);
      const L = gymRackIn(M, ex, plan);
      if (up == null) return L ? rackGapIn(M, L, at) : 0;
      const c = Ls.floor(at + jumpPct(ex, plan) * Math.max(0, loadKg), EPS_SAME);
      return Math.max(up, c ?? up) - at;
    }
  }
  const inc = incOfIn(M, ex, plan, at);
  if (!(inc > 0)) return inc;
  const pct = jumpPct(ex, plan);
  return inc * Math.max(1, Math.floor((pct * Math.max(0, loadKg)) / inc + EPS));
}

/* The loads a lift can use, from one of four kinds of load list, each with its own lookup: Your gym's rack (the
   bells it lists), a rack read from its spacing (dumbbells and kettlebells, when the load is off its weights,
   offGrid), Your gym's plates on a bar lift (the bar and pairs of the smallest plate, plateGridIn) and, for
   everything else, whole steps of the lift's own step from the load it is at. Every rule that moves a load
   (lighter, heavier, the snap, the step) asks this for its list, so the choice is made once: written out in each
   rule, a fix to one kind in one rule would miss the others. */
/** The loads a lift can use around a load `at` (kg): the lightest (null when there is no floor of its own), the rung below and above a load, and the heaviest rung not past a load. */
interface Loads {
  /** Which kind of list this is, for the few rules whose policy still differs by kind (each says why). */
  kind: 'rack' | 'grid' | 'plates' | 'step';
  /** The lightest load on the list, or null when the list has no lightest of its own (whole steps from a load). */
  first: number | null;
  /** The heaviest load on the list strictly under `w`, or null when there is none. */
  below(w: number): number | null;
  /** The heaviest load on the list not past `w` by more than `tol` (the shown digit when not given), or null when every load on it is past `w`. */
  floor(w: number, tol?: number): number | null;
  /** The lightest load on the list strictly above `w`, or null when there is none. */
  above(w: number): number | null;
  /** Whether `w` is a load on the list, within the tolerance its kind reads (a rack's weight exactly, a spacing's or the plates' within the shown digit). */
  has(w: number): boolean;
}

/** The loads a lift can use, chosen once in the order every rule used (Your gym's rack, a rack read from its spacing whatever the load, Your gym's plates, else whole steps of the lift's step from `at`). */
function loadsForIn(
  M: Model,
  ex: ExerciseLike,
  plan: Pick<Plan, 'inc' | 'jump'> | null | undefined,
  at: number | null
): Loads {
  const L = gymRackIn(M, ex, plan);
  if (L) {
    const tl = rackTolIn(M),
      tf = rackTolIn(M, L, at);
    return {
      kind: 'rack',
      first: L[0] ?? null,
      below: w => [...L].reverse().find(x => x < w - (at != null && Math.abs(w - at) < EPS_SAME ? tf : tl)) ?? null,
      floor: (w, tol = tl) => [...L].reverse().find(x => x <= w + tol) ?? null,
      above: w => L.find(x => x > w + (at != null && Math.abs(w - at) < EPS_SAME ? tf : tl)) ?? null,
      has: w => L.some(x => Math.abs(x - w) < EPS_SAME)
    };
  }
  /* A dumbbell or kettlebell rack read from its spacing (rackGridIn) is the list whatever the load, so the kind of list
     never depends on the rule asking. */
  const og = rackGridIn(M, ex, plan, at);
  if (og) {
    const t = rackTolIn(M),
      first = gridStep(M, og, 0, 1);
    /* Every step is worked out from the weight lifted, converted exactly (V, 2026-11-07 08:58: "it should convert
       based on the weight", then the closest real weight, "prioritizing progression rather than trying to match 0.4
       pounds"). Going up, the next weight on the rack is skipped only when it is a sliver: a load converted from the
       other unit (22.5 kg is 49.6 lb) that is less than the lift's own jump (jumpPct: 2.5% compound, 5% isolation, or
       the plan's) under that weight, so 49.6 goes to 55, never 50, while 17.6 (8 kg) goes to 20 and 8.8 (4 kg)
       to 10. A load typed in the unit on screen is a weight the lifter has, so its next weight is never skipped (8 lb
       to 10). Going down is always from the weight lifted: a Lighter day from 12.1 lb (5.5 kg) is 10, never 5. */
    const typed = (w: number): boolean => onStep(inUnitIn(M, w), TYPED_STEP);
    const jump = jumpPct(ex, plan);
    return {
      kind: 'grid',
      first,
      below: w => {
        const d = gridStep(M, og, w, -1);
        return d < first - EPS_SAME ? null : d;
      },
      floor: (w, tol = t) => {
        const c = gridFloor(M, og, w, tol);
        return c < first - EPS_SAME ? null : c;
      },
      above: w => {
        const u = gridStep(M, og, w, 1);
        return !typed(w) && u - w < jump * w ? gridStep(M, og, u, 1) : u;
      },
      has: w => Math.abs(gridFloor(M, og, w, t) - w) <= t
    };
  }
  /* The loads Your gym's plates make (plateGridIn), a list lightest first like a rack's, read by the rules of the plates'
     own arithmetic, so on plates that are whole multiples of the smallest every answer is that arithmetic's: floor, the heaviest not past a load by the shown digit, else the bar; below, the load
     under the one nearest (a tie going up), so a load a little over a rung steps down past it; above, the lightest
     past a load by the shown digit, the bar from under it, and none past the heaviest the plates are counted to. A load
     within the shown digit (half the last digit the screens show, rackTolIn) of one is that load, as a bell typed as
     shown is that bell (with Your gym in kg and the app in lb, 50 kg is shown as 110.2 lb, and 110.2 typed is
     49.986 kg). */
  const G = plateGridIn(M, ex, plan);
  if (G) {
    const t = rackTolIn(M),
      P = G.loads,
      tf = Math.max(t, PLATE_TOL_MIN);
    const fl = (w: number): number => P[Math.max(0, loadsFloorAt(P, w + tf))] ?? G.bar;
    return {
      kind: 'plates',
      first: G.bar,
      below: w => {
        if (w <= G.bar + t) return null;
        const k = loadsFloorAt(P, w);
        const lo = P[k],
          hi = P[k + 1];
        const near = lo == null ? 0 : hi != null && hi - w <= w - lo + 2 * tf ? k + 1 : k;
        // Never under the bar: a load a little over the bar steps down to the bar, as the arithmetic gave before.
        return P[Math.max(0, near - 1)] ?? null;
      },
      floor: w => fl(w),
      above: w => P[loadsFloorAt(P, w + t + EPS_SAME) + 1] ?? null,
      has: w => Math.abs(fl(w) - w) <= t
    };
  }
  // Whole steps of the lift's step from the load it is at; with no load to count from there is no list of its own.
  if (at == null)
    return { kind: 'step', first: null, below: () => null, floor: () => null, above: () => null, has: () => false };
  const from = at;
  const step = incOfIn(M, ex, plan, from);
  const k = (w: number): number => (w - from) / step;
  return {
    kind: 'step',
    first: null,
    below: w => (step > 0 ? from + (Math.ceil(k(w) - EPS_SAME) - 1) * step : null),
    floor: w => (step > 0 ? from + Math.floor(k(w) + EPS_SAME) * step : null),
    above: w => (step > 0 ? from + (Math.floor(k(w) + EPS_SAME) + 1) * step : null),
    has: w => step > 0 && Math.abs(k(w) - Math.round(k(w))) < EPS_SAME
  };
}

/* A load at or below `to`, reached from `from` in whole steps of the
   exercise's own load step, so a stack stays on its pins and a dumbbell rack
   on its dumbbells, and never below the empty bar on a barbell lift.
   Rounded to the nearest 5 lb or 2.5 kg whatever the equipment, a 15 lb
   cable raise would deload to 10, a 150 lb stack with 10 lb pins to 135, a
   95 lb bench warm up at 40, under the bar. With no step set, it rounds down
   to 5 lb or 2.5 kg. May return `from` when nothing lighter
   exists (the bar itself). On a list with a lightest load of its own (a rack or the plates): the heaviest load not
   past `to` and under `from`, at least the lightest, or `from` itself when nothing on the list is under it. */
export function lighterLoadIn(
  M: Model,
  ex: ExerciseLike,
  plan: Pick<Plan, 'inc' | 'jump'> | null | undefined,
  from: number,
  to: number
): number {
  const Ls = loadsForIn(M, ex, plan, from);
  if (Ls.kind !== 'step') {
    const dn = Ls.below(from);
    if (dn == null) return Math.max(0, from);
    const c = Ls.floor(to);
    return c == null ? (Ls.first ?? dn) : Math.min(dn, c);
  }
  // Whole steps from `from`: at least one, as many as reach `to`; with no step, rounded down to the unit's.
  const dn = Ls.below(from);
  let w: number;
  if (dn != null) w = Math.min(dn, Ls.floor(to) ?? dn);
  else w = roundLoadIn(M, to, true);
  // At the bar itself nothing lighter exists, so `from` comes back and a deload keeps the bar.
  const floor = loadFloorIn(M, ex);
  if (w < floor - EPS_SAME) w = Math.min(floor, from);
  /* Nor under the lightest of a rack's dumbbells or bells: a Lighter
     day on 5 lb lateral raises is not "about 0 lb per dumbbell", nor on a
     2.5 lb, 2 kg or 1 kg one. */
  const gr = rackGridIn(M, ex, plan, from);
  if (gr && w < gridStep(M, gr, 0, 1) - EPS_SAME) w = Math.min(gridStep(M, gr, 0, 1), from);
  return Math.max(0, w);
}

/* A load above `from` and not past `to`, or null when the next one is past
   it (for adjusting the next sets, with the rack read from its spacing):
   the heaviest load on the lift's list
   between them. */
/** The heaviest load above `from` and not past `to` on the lift's rack or steps, or null. */
export function heavierLoadIn(
  M: Model,
  ex: ExerciseLike,
  plan: Pick<Plan, 'inc' | 'jump'> | null | undefined,
  from: number,
  to: number
): number | null {
  const Ls = loadsForIn(M, ex, plan, from);
  const up = Ls.above(from),
    c = Ls.floor(to);
  return up != null && c != null && c >= up - EPS_SAME ? c : null;
}

/* Minus and plus on a set: the next load down or up on the lift's own list (loadsForIn), so a tap lands on
   a load the lift can use, as every rule that moves a load reads it. Down never goes under the bar or the lightest
   bell (lighterLoadIn); null when there is nothing further that way. */
/** The next load on the lift's list below (`dir` -1) or above (1) `from`, or null when there is none. */
export function stepLoadIn(
  M: Model,
  ex: ExerciseLike,
  plan: Pick<Plan, 'inc' | 'jump'> | null | undefined,
  from: number,
  dir: 1 | -1
): number | null {
  if (dir > 0) return loadsForIn(M, ex, plan, from).above(from);
  const w = lighterLoadIn(M, ex, plan, from, from - EPS_SAME);
  return w < from - EPS_SAME ? w : null;
}
