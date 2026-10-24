/* Words and numbers more than one screen shows (r57): moved with History,
   the first screen to move that reads them, and imported back by the screens
   still in the legacy script. Each is as it was there. */

import { KM_MI } from './units';
import { missedTag } from './format';
import { effShow, rirScale } from './effort';
import { U, loadLabel, toD } from './live';
import { state } from './store';
import type { Exercise, LoggedSet } from './types';

/** Whether nothing is logged yet. */
export function noLog(): boolean {
  return !state.sessions.length;
}

/** A load lifted, in the unit on screen: whole, and in thousands from 10,000 (12k). */
export function fmtK(kg: number): string {
  const v = Math.round(toD(kg) ?? 0);
  return v >= 10000 ? Math.round(v / 1000) + 'k' : v.toLocaleString();
}

/** The unit cardio distances are shown in: km with kg, miles with lb. */
export const distU = (): 'km' | 'mi' => (U() === 'kg' ? 'km' : 'mi');

/** A distance kept in km, in the unit on screen, to two places. */
export const distShow = (km: number): number => Math.round((U() === 'kg' ? km : km / KM_MI) * 100) / 100;

/** One set, short: the load and reps (185×8), or the hold (BW for 45s). */
export function setShort(
  ex: Pick<Exercise, 'bw' | 'timed'>,
  w: number | string | null | undefined,
  r: number | string | null
): string {
  return ex.timed ? `${loadLabel(ex, +(w ?? 0) || 0)} for ${r}s` : `${loadLabel(ex, +(w ?? 0) || 0)}×${r}`;
}

/** One saved set as History lists it: its mark, load and reps, missed, the effort called and a calibration set. */
export function setStr(
  ex: Pick<Exercise, 'bw' | 'timed'>,
  x: Pick<LoggedSet, 'w' | 'warm' | 'drop' | 'cal'> & {
    r: number | string | null;
    rir?: number | string | null | undefined;
  }
): string {
  return `${x.warm ? '(W) ' : x.drop ? '(D) ' : ''}${setShort(ex, x.w, x.r)}${missedTag(x)}${!ex.timed && x.rir != null && x.rir !== '' ? (rirScale() === 'rpe' ? ' @RPE ' + effShow(x.rir) : ' @' + effShow(x.rir)) : ''}${x.cal ? ' (RIR check)' : ''}`;
}
