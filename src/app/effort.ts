/* The effort scale the lifter enters and reads effort in. Moved unchanged
   from the legacy script in r53, with the Guide that names its ranges. */

import { state } from './store';

/* Effort in half points or as RPE (r33, item 206): a setting for how effort
   is entered and shown. What is stored is always RIR (RPE 8 is RIR 2, RPE
   8.5 is RIR 1.5), so every estimate, hard-set count and target reads it
   unchanged, and switching back and forth loses nothing. Unset is whole RIR. */
/** The scale in use: whole RIR, half points, or RPE. */
export const rirScale = () =>
  state.settings.rirScale === 'half' || state.settings.rirScale === 'rpe' ? state.settings.rirScale : 'whole';

/* RIR 4 to 5 as half a set (r40, a setting): hardCredit in
   src/app/analytics.ts counts it and says why. This names the range in the
   lifter's own effort scale: a half-rep scale allows 3.5, RPE reads 5 to 6.5. */
/** The range Count RIR 4 to 5 as half a set names, in the scale in use. */
export const halfLbl = () => {
  const k = rirScale();
  return k === 'rpe' ? 'RPE 5 to 6.5' : k === 'half' ? 'RIR 3.5 to 5' : 'RIR 4 to 5';
};
