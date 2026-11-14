/* The effort scale the lifter enters and reads effort in, with the Guide
   that names its ranges. */

import { state } from './store';
import { effAt, effScale } from './format';
import { EFFORT_TOP } from './records';

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

/* RIR 4 to 5 as half a set (a setting): hardCredit in
   src/app/analytics.ts counts it and says why. This names the range in the
   lifter's own effort scale: a half-rep scale allows 3.5, RPE reads 5 to 6.5. */
/** The range Count RIR 4 to 5 as half a set names, in the scale in use. */
export const halfLbl = () => {
  const k = rirScale();
  return k === 'rpe' ? 'RPE 5 to 6.5' : k === 'half' ? 'RIR 3.5 to 5' : 'RIR 4 to 5';
};
