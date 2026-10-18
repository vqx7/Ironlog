/* The sessions a lift's trend reads, and its two ends (r41), shared by the
   trend itself and by the screens that say its change, so the two cannot
   disagree (phase 3a, r51; moved unchanged from the legacy script,
   tests/moved.js holds them to r50's code). The trend's reading of each
   session (tv) is set by the analytics (analytics.ts, idxLift), whose
   exposures these read (model.ts). */

import type { Exposure } from './model';
import { addDays } from './util';
import { offSession, sameRR } from './formulas';

/** An exposure that has a trend reading. */
type Read = { tv: number };

/* The sessions a lift's trend reads, shared by the trend itself and by the
   screens that say its change in loads (r41), so the two cannot disagree.
   Full sessions only; the current rep range only, since changing the range
   restarts the baseline instead of drawing one line across two scales; and
   the 6 weeks up to the lift's own last session (r30: it ended at the newest
   session of any kind, so logging an upper day moved a split squat's trend
   from +14% to +9% without a new split squat set). */
export function trendScope<X extends Exposure>(exps: readonly X[], anchor: string) {
  const real = exps.filter(x => !offSession(x));
  const curRR = real.length ? real[real.length - 1].rr : null;
  const inRange = real.filter(x => sameRR(x.rr, curRR));
  const lastReal = real.length ? real[real.length - 1] : null;
  const exWin = addDays(lastReal ? lastReal.date : anchor, -42);
  return { real, curRR, inRange, lastReal, exWin };
}

/* The sessions in that scope with a trend reading. Separate from trendScope
   because idxLift sets each session's reading (tv) only after deciding
   whether RIR enters the trend, which needs the scope first. The filter's
   type predicate is a cast: a session it keeps has a reading (tv), which is
   what the test beside it checks. */
export function trendW(sc: { inRange: readonly Exposure[]; exWin: string }): (Exposure & Read)[] {
  return sc.inRange.filter((x): x is Exposure & Read => x.date >= sc.exWin && x.tv != null);
}

/* Both ends of the trend are the better of two sessions, to damp a single
   fluky one. With exactly three, best-of-two at each end counts the middle
   one twice (100, 120, 110 came out as 0% instead of +10%), so three use
   single ends. It returns the sessions, not only their readings, so a screen
   can show what was lifted. The first of equal readings wins, as before.
   Both callers pass trendW's sessions, three or more, so every one has a
   reading. */
export function trendEnds<X extends Read>(w: readonly X[]): { first: X; last: X } {
  const k = w.length >= 4 ? 2 : 1;
  const best = (a: readonly X[]): X => a.reduce((m, x) => (x.tv > m.tv ? x : m));
  return { first: best(w.slice(0, k)), last: best(w.slice(w.length - k)) };
}
