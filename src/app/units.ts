/* Units and the plates a gym has. Logged loads are
   kept in kilograms, tape measurements in centimetres and cardio distances in
   kilometres (Your gym's lists keep the unit the gym is labelled in); these
   convert to and from the unit on screen. */

import type { Exercise } from './types';
import type { Model } from './model';
import { UIn, appModelIn, bodyIn, liftModelIn } from './model';
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

/* Which unit's 0.05 steps a load in kilograms lies on: a number typed in kilograms is a whole number of TYPED_STEP kg,
   one typed in pounds a whole number of TYPED_STEP lb, and no load from 0.05 to 1,000 kg or 2,200 lb is both. 0, or a
   load on neither, says nothing; help on an assisted lift is read by its size. It says what a number is made of, never
   what was typed: a load the lifter enters is stored with its unit (types.ts LoggedSet's u). Read for two kinds of
   number only: a load the engine makes, which it makes on its equipment's steps in that equipment's unit (a 24 kg
   dumbbell on a rack in kg, the 45 lb bar and 10 lb plates), so a load the app puts in a row is stored with the unit
   it was made in (session.ts madeLoad) and a rule handed one reads it so (loadsteps.ts unitOfIn); and a load stored
   before units were stored, which takes the one every build before then read from its number, once (normalize.ts
   unitField). */
/** The unit whose 0.05 steps a load in kilograms lies on, or null when it lies on neither or both. */
export function unitOnGrid(kg: number): 'kg' | 'lb' | null {
  const a = Math.abs(kg);
  if (!(a > 0)) return null;
  const k = onStep(a, TYPED_STEP),
    l = onStep(a / LB, TYPED_STEP);
  return k === l ? null : k ? 'kg' : 'lb';
}

/** How many TYPED_STEP make one: the 0.05 steps of a unit counted in whole numbers. */
const PER_ONE = Math.round(1 / TYPED_STEP);
/** A load in kilograms put on the nearest of unit `u`'s 0.05 steps, exactly as that number typed in `u` is stored. */
export function onUnitSteps(kg: number, u: 'kg' | 'lb'): number {
  const k = u === 'lb' ? LB : 1;
  return (Math.round((kg / k) * PER_ONE) / PER_ONE) * k;
}

/** Whether a load entered in unit `u` (as stored with it) was entered in the other unit from the one on screen. */
export const otherUnitIn = (M: Model, u: 'kg' | 'lb' | null | undefined): boolean => u != null && u !== UIn(M);

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
   keeps: at most the largest number typed in that unit not past the bound, so it is still a number typed in it.
   Bounded at the kilograms themselves, 1,200 lb typed as a step was kept as 500 kg, a number no one types in lb, and
   shown as lb's matching step (stepReadIn) or a bar's nearest load (loadReadAs) instead of the bound. */
/** A number typed in the unit on screen, in kilograms, at most the largest typed number within a bound in kilograms. */
function typedBoundIn(M: Model, v: number, most: number): number {
  return kgOfIn(M, Math.min(v, Math.floor(inUnitIn(M, most) / TYPED_STEP + EPS_SAME) * TYPED_STEP));
}

/** A number typed in a lift's unit, in kilograms, within a bound in kilograms (typedBoundIn in its unit). */
export const typedBoundOfIn = (
  M: Model,
  ex: Pick<Exercise, 'unit'> | null | undefined,
  v: number,
  most: number
): number => typedBoundIn(liftModelIn(M, ex), v, most);

/** A load in kilograms in the unit on screen (null stays null). */
export const toDIn = (M: Model, kg: number | null | undefined): number | null => (kg == null ? null : inUnitIn(M, kg));

/** A load in the unit on screen in kilograms (null stays null). */
export const fromDIn = (M: Model, v: number | null | undefined): number | null => (v == null ? null : kgOfIn(M, v));

/** A step as stored (kg, and the unit it was entered in), read for a lift in its unit (stepReadIn). */
export const stepReadOfIn = (
  M: Model,
  ex: Pick<Exercise, 'unit'> | null | undefined,
  v: number,
  u: 'kg' | 'lb' | null | undefined
): number => stepReadIn(liftModelIn(M, ex), v, u);

/** A load in kilograms in a lift's unit (null stays null): what its fields and lines show. */
export const toDOfIn = (
  M: Model,
  ex: Pick<Exercise, 'unit'> | null | undefined,
  kg: number | null | undefined
): number | null => toDIn(liftModelIn(M, ex), kg);

/** A load typed in a lift's unit, in kilograms (null stays null): what its fields store. */
export const fromDOfIn = (
  M: Model,
  ex: Pick<Exercise, 'unit'> | null | undefined,
  v: number | null | undefined
): number | null => fromDIn(liftModelIn(M, ex), v);

/** A load in kilograms in the app's unit, for its own numbers (null stays null). */
export const toDAppIn = (M: Model, kg: number | null | undefined): number | null => toDIn(appModelIn(M), kg);

/** A load typed in the app's unit, in kilograms (null stays null). */
export const fromDAppIn = (M: Model, v: number | null | undefined): number | null => fromDIn(appModelIn(M), v);

/** A number typed in the app's unit, in kilograms, within a bound in kilograms (typedBoundIn in it). */
export const typedBoundAppIn = (M: Model, v: number, most: number): number => typedBoundIn(appModelIn(M), v, most);

/** A bodyweight in kilograms in the scale's unit (null stays null). */
export const toDBodyIn = (M: Model, kg: number | null | undefined): number | null => toDOfIn(M, bodyIn(M), kg);

/** A bodyweight typed in the scale's unit, in kilograms (null stays null). */
export const fromDBodyIn = (M: Model, v: number | null | undefined): number | null => fromDOfIn(M, bodyIn(M), v);

/* Load step: the exercise's own setting wins, so one change applies on every
   day and routine the lift appears in. A step is kept in kilograms, like a load, with the unit it was entered in
   (incU), a plan's read from its number (planStepUnit). Read in that unit it is used as entered. Read in the other unit it is the step of the
   equipment marked in that unit that matches it: the unit's default step (5 lb, 2.5 kg) doubled or halved to the
   nearest by ratio, so 10 lb is 5 kg, 5 kg is 10 lb, 5 lb is 2.5 kg, 2.5 lb is 1.25 kg and a dumbbell's 2 kg is 5 lb.
   Used as a mass instead, a 10 lb step seen in kg added 4.5 kg to a bar no plates make. The default step is stored as
   5 lb, from before units were chosen, and reads as 2.5 kg in kg by the same rule. Read so, a step is never past the
   largest a save keeps (LIMITS.step): the 500 kg bound read in lb would be 1280 lb, over what can be typed. */
/** The default load step in the unit on screen, stored in kg as STEP_LB is. */
export function unitStepIn(M: Model): number {
  return UIn(M) === 'kg' ? DEFAULT_STEP.kg : STEP_LB;
}

/** A step as stored (kg, and `t`, the unit it was entered in), read in the unit on screen: as entered when entered in it, else the matching step of that unit. */
export function stepReadIn(M: Model, v: number, t: 'kg' | 'lb' | null | undefined): number {
  const u = UIn(M);
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
/** A load set in kilograms and entered in unit `t`, read in unit `u`: as entered when entered in it, else the nearest load of that unit's own step. */
export function loadReadAs(kg: number, t: 'kg' | 'lb' | null | undefined, u: 'kg' | 'lb'): number {
  if (t == null || t === u) return kg;
  const k = u === 'lb' ? LB : 1,
    d = DEFAULT_STEP[u];
  return Math.max(1, Math.round(kg / k / d)) * d * k;
}

/** A load set on a lift (kg, entered in `t`), read in the unit on screen (loadReadAs). */
export const loadReadIn = (M: Model, kg: number, t: 'kg' | 'lb' | null | undefined): number =>
  loadReadAs(kg, t, UIn(M));

/** A load set on a lift (kg, entered in `t`), read in that lift's unit (loadReadAs). */
export const loadReadOfIn = (
  M: Model,
  ex: Pick<Exercise, 'unit'> | null | undefined,
  kg: number,
  t: 'kg' | 'lb' | null | undefined
): number => loadReadIn(liftModelIn(M, ex), kg, t);

/* A plan's step carries no unit of its own: it moves onto the lift, where its unit is stored, with the step's one
   owner. Until then it is read from its number as it always was: a step the app sets is one of a unit's own (STEP_LB,
   5 lb), and one typed in Plan is a whole number of 0.05 in the unit it was typed in. */
/** The unit a plan's step (kg) was set in, read from its number. */
export const planStepUnit = (v: number): 'kg' | 'lb' | null => unitOnGrid(v);
