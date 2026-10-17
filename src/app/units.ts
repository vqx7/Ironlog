/* Units and the plates a gym has (phase 2, r50; moved unchanged from the
   legacy script, tests/moved.js holds them to r49's code). Every load is
   stored in kilograms and every length in centimetres; these convert. */

/** Kilograms in a pound, and centimetres in an inch (both exact by definition). */
export const LB = 0.45359237, IN = 2.54;

/** Kilometres in a mile (exact by definition). */
export const KM_MI = 1.609344;

/** The default load step, 5 lb, in kilograms. A step is stored in kg; the
    engine's stepRead reads this one, or 2.5 kg, as the default of whichever
    unit is on screen (r27). */
export const STEP_LB = 5 * LB;

/** The plates a gym usually has, heaviest first, in each unit: what the plate
    count for a barbell load is made from unless Your gym lists its own. */
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5], PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25];
