/* Lift goals (r38): which lifts can have one, and how far a goal is (phase
   3a, r51; moved unchanged from the legacy script). goalState, which reads the log, stays in the legacy script
   until the screen that shows it moves (phase 5, ARCHITECTURE.md). */

import type { Exercise } from './types';
import { e1inv } from './formulas';

/** A goal is a load for reps, so a timed hold or an assisted lift has none. */
export function goalOk(ex: Pick<Exercise, 'timed' | 'assist'> | null | undefined): boolean {
  return !!ex && !ex.timed && !ex.assist;
}

/* The load still to add for the goal's reps: the goal's load less what the
   best estimate says is possible for those reps now (e1inv, the inverse of
   the estimate). The gap between the two estimates themselves overstated it
   by up to two thirds (review of r41: 35 lb shown for a 26 lb gap). */
export function goalGap(s: { g: { w: number; r: number }; cur: number }): number {
  return s.g.w - e1inv(s.cur, s.g.r);
}
