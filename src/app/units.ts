/* Units and the plates a gym has. Logged loads are
   kept in kilograms, tape measurements in centimetres and cardio distances in
   kilometres (Your gym's lists keep the unit the gym is labelled in); these
   convert to and from the unit on screen. */

import type { Model } from './model';
import { UIn } from './model';
import { EPS_SAME } from './util';
import { LIMITS } from './records';

/** Kilograms in a pound, and centimetres in an inch (both exact by definition). */
export const LB = 0.45359237,
  IN = 2.54;

/** Kilometres in a mile (exact by definition). */
export const KM_MI = 1.609344;
/** Inches in a foot, for a height in feet and inches. */
export const FT_IN = 12;
/** The standard bar, in the unit a gym is labelled in: 45 lb, or 20 kg. */
export const BAR: Readonly<Record<'kg' | 'lb', number>> = { lb: 45, kg: 20 };

/** The default load step in each unit, as typed in it: 5 lb and 2.5 kg. */
export const DEFAULT_STEP: Readonly<Record<'kg' | 'lb', number>> = { kg: 2.5, lb: 5 };

/** The default load step, 5 lb, in kilograms. A step is stored in kg; the
    engine's stepRead reads this one, or 2.5 kg, as the default of whichever
    unit is on screen. */
export const STEP_LB = DEFAULT_STEP.lb * LB;

/** The default load step by how a lift is loaded (367, V's pick of 2026-11-02, "By equipment"), as typed in each
    unit: a barbell or Smith bar and a pin-loaded stack or cable go up 10 lb or 5 kg (5 lb or 2.5 kg a side on a bar,
    the smallest plates most gyms keep in pairs, and a stack's usual plate), a dumbbell 5 lb or 2 kg each (the usual
    spacing of a rack). Any other lift, a plate-loaded machine typed a side and load added to a bodyweight lift
    keep DEFAULT_STEP. Conventions (docs/EVIDENCE.md, Load steps by equipment). A lift's own step, Your gym's plates,
    stack and rack, and a rack read from a lift's own loads all come first. */
export const EQUIP_STEP: Readonly<Record<'bar' | 'stack' | 'each', Readonly<Record<'kg' | 'lb', number>>>> = {
  bar: { lb: 10, kg: 5 },
  stack: { lb: 10, kg: 5 },
  each: { lb: 5, kg: 2 }
};

/** Whether a number is a whole number of a step, to a millionth of the step. */
export const onStep = (v: number, step: number): boolean => Math.abs(v / step - Math.round(v / step)) < EPS_SAME;

/** What a load typed in its unit is a whole number of: a load converted
    from the other unit almost never is, so a number on it reads as typed. */
export const TYPED_STEP = 0.05;

/* The unit a load was typed in, read from the number kept (kilograms, every
   set as typed): one typed in kilograms is a whole number of TYPED_STEP kg,
   one typed in pounds a whole number of TYPED_STEP lb, and no other load is
   both. 0, or a load on neither (a number not typed as such, as the engine
   reads one too), says nothing. Help on an assisted lift is read by its
   size. */
/** The unit a load was typed in, from its number, or null when the number does not say. */
export function typedUnit(w: number): 'kg' | 'lb' | null {
  const a = Math.abs(w);
  if (!(a > 0)) return null;
  const kg = onStep(a, TYPED_STEP),
    lb = onStep(a / LB, TYPED_STEP);
  return kg === lb ? null : kg ? 'kg' : 'lb';
}

/** Whether a load in kilograms was typed in the other unit from the one on screen, as its number says. */
export function typedOtherIn(M: Model, kg: number): boolean {
  const u = typedUnit(kg);
  return u != null && u !== UIn(M);
}

/** The plates a gym usually has, heaviest first, in each unit: what the plate
    count for a barbell load is made from unless Your gym lists its own. */
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5],
  PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

/* The change plates gyms and makers stock (V 2026-11-08: "1 KG and
   half KG plates ... should've been there for ease"): offered as buttons in
   Your gym, off until tapped, never counted unless the gym lists them, so no
   lifter's loads move. kg change plates are sold as 0.5, 1, 1.5, 2 and 2.5
   (2.5 and up are usual already); lb as 1.25, 2.5, 5 and 10 (docs/EVIDENCE.md). */
/** The change plates Your gym offers as buttons beside the usual ones, heaviest first, in each unit. */
export const CHANGE_PLATES: Readonly<Record<'kg' | 'lb', readonly number[]>> = { kg: [2, 1.5, 1, 0.5], lb: [1.25] };

/** A load in kilograms, a number, in the unit on screen. */
export const inUnitIn = (M: Model, kg: number): number => (UIn(M) === 'lb' ? kg / LB : kg);

/** A load in the unit on screen, a number, in kilograms. */
export const kgOfIn = (M: Model, v: number): number => (UIn(M) === 'lb' ? v * LB : v);

/* A number typed in the unit on screen, kept in kilograms within a bound (a step's 500 kg, a bar's 50 kg) that a save
   keeps: at most the largest number typed in that unit not past the bound, so it still reads as typed in it
   (typedUnit). Bounded at the kilograms themselves, 1,200 lb typed as a step was kept as 500 kg, read as typed in kg,
   and shown as lb's matching step (stepReadIn) or a bar's nearest load (loadReadAs) instead of the bound. */
/** A number typed in the unit on screen, in kilograms, at most the largest typed number within a bound in kilograms. */
export function typedBoundIn(M: Model, v: number, most: number): number {
  return kgOfIn(M, Math.min(v, Math.floor(inUnitIn(M, most) / TYPED_STEP + EPS_SAME) * TYPED_STEP));
}

/** A load in kilograms in the unit on screen (null stays null). */
export const toDIn = (M: Model, kg: number | null | undefined): number | null => (kg == null ? null : inUnitIn(M, kg));

/** A load in the unit on screen in kilograms (null stays null). */
export const fromDIn = (M: Model, v: number | null | undefined): number | null => (v == null ? null : kgOfIn(M, v));

/* Load step: the exercise's own setting wins, so one change applies on every
   day and routine the lift appears in. A step is kept as typed, in kilograms, like a load, so its number says which unit
   it was typed in (typedUnit). Read in that unit it is used as typed. Read in the other unit it is the step of the
   equipment marked in that unit that matches it: the unit's default step (5 lb, 2.5 kg) doubled or halved to the
   nearest by ratio, so 10 lb is 5 kg, 5 kg is 10 lb, 5 lb is 2.5 kg, 2.5 lb is 1.25 kg and a dumbbell's 2 kg is 5 lb.
   Used as a mass instead, a 10 lb step seen in kg added 4.5 kg to a bar no plates make. The default step is stored as
   5 lb, from before units were chosen, and reads as 2.5 kg in kg by the same rule. Read so, a step is never past the
   largest a save keeps (LIMITS.step): the 500 kg bound read in lb would be 1280 lb, over what can be typed. */
/** The default load step in the unit on screen, stored in kg as STEP_LB is. */
export function unitStepIn(M: Model): number {
  return UIn(M) === 'kg' ? DEFAULT_STEP.kg : STEP_LB;
}

/** A step as stored (kg), read in the unit on screen: as typed when typed in it, else the matching step of that unit. */
export function stepReadIn(M: Model, v: number): number {
  const u = UIn(M),
    t = typedUnit(v);
  if (t == null || t === u || !(v > 0)) return v;
  const k = u === 'lb' ? LB : 1,
    d = DEFAULT_STEP[u];
  return Math.min(LIMITS.step, d * 2 ** Math.round(Math.log2(v / k / d)) * k);
}

/* Any other number set on a lift in one unit and read in the other (its heaviest load, its goal, a bar's weight) is put
   on that unit's equipment as a step is: a load at the nearest load of the unit's own step (DEFAULT_STEP), never 0, so
   100 kg is 220 lb and a 20 kg bar the 45 lb bar. Used as a mass instead, 100 kg set as the heaviest available asked
   for 220.5 lb ("add 0.5 lb, which is the heaviest available"), a goal of 100 kg x 5 was not reached at 220 lb x 5, and
   a Lighter day at the bar was 44.1 lb. */
/** A load set in kilograms, read in a unit: as typed when typed in it, else the nearest load of that unit's own step. */
export function loadReadAs(kg: number, u: 'kg' | 'lb'): number {
  const t = typedUnit(kg);
  if (t == null || t === u) return kg;
  const k = u === 'lb' ? LB : 1,
    d = DEFAULT_STEP[u];
  return Math.max(1, Math.round(kg / k / d)) * d * k;
}

/** A load set on a lift (kg), read in the unit on screen (loadReadAs). */
export const loadReadIn = (M: Model, kg: number): number => loadReadAs(kg, UIn(M));
