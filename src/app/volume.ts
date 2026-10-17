/* Weekly sets against a muscle's target, judged one way everywhere a flag is
   decided (phase 3a, r51; moved unchanged from the legacy script,
   tests/moved.js holds them to r50's code). */

import { r1 } from './util';

/* Below or above a weekly target, judged at the precision the screen shows
   (one decimal, r29): an average of 9.96 reads "10" and is not called below
   a minimum of 10. A minimum of 0 is never missed. */
export function belowMin(v: number | null | undefined, lo: number): boolean {
  return lo > 0 && r1(v || 0) < lo;
}

export function aboveMax(v: number | null | undefined, hi: number): boolean {
  return r1(v || 0) > hi;
}

/** A muscle's status reads low: under its minimum, or nothing logged against a minimum above 0. */
export const lowSt = (x: { st: string; lo: number }): boolean => x.st === 'under' || (x.st === 'none' && x.lo > 0);
