/* The sessions a lift's trend reads, and its two ends (r41), shared by the
   trend itself and by the screens that say its change, so the two cannot
   disagree (phase 3a, r51; moved unchanged from the legacy script). The trend's reading of each
   session (tv) is set by the analytics (analytics.ts, idxLift), whose
   exposures these read (model.ts). */

import type { Exposure } from './model';
import { sinceNew } from './model';
import { addDays } from './util';
import { afterBreak, lighter, sameRR, TREND_DAYS } from './formulas';

/** An exposure that has a trend reading. */
type Read = { tv: number };

/* The sessions a lift's trend reads, shared by the trend itself and by the
   screens that say its change in loads (r41), so the two cannot disagree.
   Sessions not done lighter (a session short of its usual counts since r54,
   V's one rule); the current rep range only, since changing the range
   restarts the baseline instead of drawing one line across two scales; the
   sessions since the lift's last break only (afterBreak, r54), for the same
   reason, as strength falls over a break (a five-week break read as a fall,
   "look at recovery", while every session back was heavier than the one
   before); and the 6 weeks up to the lift's own last session (r30: it ended
   at the newest session of any kind, so logging an upper day moved a split
   squat's trend from +14% to +9% without a new split squat set). A new
   machine or gym starts the lift over (r61, sinceNew): its sessions before
   it are another machine's, read by none of these. The stall test reads
   the same sessions (inRange). */
export function trendScope<X extends Exposure>(every: readonly X[], anchor: string) {
  const exps = sinceNew(every);
  const real = exps.filter(x => !lighter(x));
  const curRR = real.length ? real[real.length - 1].rr : null;
  let from = '';
  for (let i = 1; i < exps.length; i++) if (afterBreak(exps[i - 1], exps[i].date)) from = exps[i].date;
  const inRange = real.filter(x => sameRR(x.rr, curRR) && x.date >= from);
  const lastReal = real.length ? real[real.length - 1] : null;
  const exWin = addDays(lastReal ? lastReal.date : anchor, -TREND_DAYS);
  return { real, curRR, inRange, lastReal, exWin, from };
}

/* The sessions in that scope with a trend reading. Separate from trendScope
   because idxLift sets each session's reading (tv) only after deciding
   whether RIR enters the trend, which needs the scope first. The filter's
   type predicate is a cast: a session it keeps has a reading (tv), which is
   what the test beside it checks. */
export function trendW(sc: { inRange: readonly Exposure[]; exWin: string }): (Exposure & Read)[] {
  return sc.inRange.filter((x): x is Exposure & Read => x.date >= sc.exWin && x.tv != null);
}

/** From this many sessions a trend's two ends are each the better of two; under it, single sessions (three would count the middle one twice). */
export const ENDS_PAIRED_FROM = 4;

/* Both ends of the trend are the better of two sessions, to damp a single
   fluky one. With exactly three, best-of-two at each end counts the middle
   one twice (100, 120, 110 came out as 0% instead of +10%), so three use
   single ends. It returns the sessions, not only their readings, so a screen
   can show what was lifted. The first of equal readings wins, as before.
   Both callers pass trendW's sessions, three or more, so every one has a
   reading. */
export function trendEnds<X extends Read>(w: readonly X[]): { first: X; last: X } {
  const k = w.length >= ENDS_PAIRED_FROM ? 2 : 1;
  const best = (a: readonly X[]): X => a.reduce((m, x) => (x.tv > m.tv ? x : m));
  return { first: best(w.slice(0, k)), last: best(w.slice(w.length - k)) };
}
