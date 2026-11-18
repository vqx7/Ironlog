/* The effort scale the lifter enters and reads effort in, with the Guide
   that names its ranges. */

import { state } from './store';
import { effAt, effScale } from './format';
import { EFFORT_TOP } from './records';
import { HARD_RIR, RIR_CALL_TOP } from './formulas';

/** The step of the half-rep scale and of RPE. */
const HALF_REP = 0.5;

/* Effort in half points or as RPE: a setting for how effort
   is entered and shown. What is stored is always RIR (RPE 8 is RIR 2, RPE
   8.5 is RIR 1.5), so every estimate, hard-set count and target reads it
   unchanged, and switching back and forth loses nothing. Unset is whole RIR. */
/** The scale in use: whole RIR, half points, or RPE. */
export const rirScale = () => effScale(state.settings.rirScale);

/* An effort as the lifter's scale shows it, blank when there is none, so the screens and the engine's sentences show it by one rule (effAt). */
/** A stored RIR, or nothing, as the effort scale in use shows it. */
export function effShow(v: number | string | null | undefined): string {
  if (v == null || v === '') return '';
  const n = +v;
  if (!isFinite(n)) return '';
  return effAt(rirScale(), n);
}

/* A plan's effort is typed in the scale in use too (on the RPE scale,
   Plan's line reading RPE 8 must not take the 8 in its field as RIR 8, and
   then read RPE 2). */
/** A number typed in the scale in use, as the RIR stored: RPE 8 is RIR 2. */
export function effIn(n: number): number {
  return rirScale() === 'rpe' ? EFFORT_TOP - n : n;
}

/** The name of the scale in use for a field's label: RPE, or RIR. */
export const effName = (): string => (rirScale() === 'rpe' ? 'RPE' : 'RIR');

/* A set past HARD_RIR, up to RIR_CALL_TOP, as half a set (a setting): hardCredit in src/app/setread.ts counts it and
   says why. This names that range in the lifter's own effort scale, from the first effort the scale has past HARD_RIR
   (a whole rep, or half of one on the half-rep scale and RPE): RIR 4 to 5, RIR 3.5 to 5, RPE 5 to 6.5. */
/** The range the half-set setting names (above), in the scale in use. */
export const halfLbl = () => {
  const k = rirScale();
  const from = HARD_RIR + (k === 'whole' ? 1 : HALF_REP);
  return k === 'rpe'
    ? `RPE ${effAt(k, RIR_CALL_TOP)} to ${effAt(k, from)}`
    : `RIR ${effAt(k, from)} to ${effAt(k, RIR_CALL_TOP)}`;
};
