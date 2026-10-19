/* Units and the plates a gym has (phase 2, r50; moved unchanged from the
   legacy script). Logged loads are
   kept in kilograms, tape measurements in centimetres and cardio distances in
   kilometres (Your gym's lists keep the unit the gym is labelled in); these
   convert to and from the unit on screen. */

import type { Model } from './model';
import { UIn } from './model';

/** Kilograms in a pound, and centimetres in an inch (both exact by definition). */
export const LB = 0.45359237,
  IN = 2.54;

/** Kilometres in a mile (exact by definition). */
export const KM_MI = 1.609344;

/** The default load step, 5 lb, in kilograms. A step is stored in kg; the
    engine's stepRead reads this one, or 2.5 kg, as the default of whichever
    unit is on screen (r27). */
export const STEP_LB = 5 * LB;

/** The plates a gym usually has, heaviest first, in each unit: what the plate
    count for a barbell load is made from unless Your gym lists its own. */
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5],
  PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];

/** A load in kilograms, a number, in the unit on screen. */
export const inUnitIn = (M: Model, kg: number): number => (UIn(M) === 'lb' ? kg / LB : kg);

/** A load in the unit on screen, a number, in kilograms. */
export const kgOfIn = (M: Model, v: number): number => (UIn(M) === 'lb' ? v * LB : v);

/** A load in kilograms in the unit on screen (null stays null). */
export const toDIn = (M: Model, kg: number | null | undefined): number | null => (kg == null ? null : inUnitIn(M, kg));

/** A load in the unit on screen in kilograms (null stays null). */
export const fromDIn = (M: Model, v: number | null | undefined): number | null => (v == null ? null : kgOfIn(M, v));

/* Load step: the exercise's own setting wins, so one change applies on every
   day and routine the lift appears in. */
/* The default step is stored as 5 lb, from before units were chosen, so a
   kg user saw "add 2.3 kg". Either unit's default (5 lb or 2.5 kg) now reads
   as the current unit's, so steps follow a change of units; any other step is
   used exactly as typed (r27). */
/** The default load step in the unit on screen, stored in kg as STEP_LB is. */
export function unitStepIn(M: Model): number {
  return UIn(M) === 'kg' ? 2.5 : STEP_LB;
}

/** A step as stored, read as the unit on screen's default when it is either unit's default. */
export function stepReadIn(M: Model, v: number): number {
  return Math.abs(v - STEP_LB) < 1e-6 || Math.abs(v - 2.5) < 1e-6 ? unitStepIn(M) : v;
}
