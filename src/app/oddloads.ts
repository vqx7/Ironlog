/* Loads far off (split from engine.ts): a set ticked at a load far from the lift's own, under the bar, or at 0
   where the lift is loaded, asked about before it is logged. Each function that reads the log takes the model first. */

import type { DraftBlock } from './types';
import type { Model } from './model';

import { EXIn, UIn } from './model';
import { liftReadIn } from './analytics';
import { loadFloorIn, rackTolIn } from './gym';
import { fmtWIn, loadLabelIn } from './loads';
import { EPS, pctOf, timesWord } from './util';
import { LIGHTER_LOAD, isMissed, isWork, sinceLongBreak } from './formulas';
import { effW } from './session';
import { bwAtIn, bwLoadIn } from './setread';

/* A load far off (V 2026-10-19: 300 typed after two sets of 50, logged
   without a word). Before a working set is logged the app asks, Log it or
   Fix it, when its load is more than three times the heaviest set ticked in
   the session, or under a third of it, or more than twice the heaviest ever
   logged on the lift (or in the session, when that is heavier). Conventions,
   set to catch a slipped digit or a load typed in the other unit and to
   leave real training alone: a ramp of warm-ups not marked as such climbs
   less than threefold a set (the bar and then a plate a side is three times,
   which does not ask), a back-off set is rarely under half the top set, and
   no lift doubles its best in a session. Loads are read as moved, a
   bodyweight lift's share of the bodyweight added, so its first added load
   is no jump from nothing; an assisted lift (its help typed) and a timed hold
   are not asked about. Null when nothing is far off, else the reason. */
export const ODD_SESSION = 3;
/** How many times a lift's heaviest logged load a set may be before the app asks (a convention, above). */
export const ODD_BEST = 2;
/* Bodyweight typed as added load (V's decision 2 of 2026-10-27, from
   the r63 audit's P-S2-3: pull-ups at a bodyweight of 180 lb typed as
   BW+180 were saved with no question and became a PR, "best estimate 463
   lb"). Read as totals, added load equal to bodyweight sits exactly on the
   limit of twice the heaviest logged, so on a bodyweight lift the added
   load is read on its own too: the app asks, Log it or Fix it, when it is
   ODD_ADDED_BW of the bodyweight or more, or more than ODD_ADDED_BEST times
   the most added on the lift before (in its log or today's sets). Both are
   conventions, set to catch the bodyweight typed in the field for added
   load and a slipped digit: a vest or belt heavier than nine tenths of the
   lifter is rare, and no lifter doubles their added load in a session. */
/** The share of bodyweight added load on a bodyweight lift may reach before the app asks (V's decision 2, a convention, above). */
export const ODD_ADDED_BW = 0.9;
/** How many times the most added before a bodyweight lift's added load may be before the app asks (V's decision 2, a convention, above). */
export const ODD_ADDED_BEST = 2;
/* A set ticked with 0 reps at a load well under the session's working load
   (V 2026-10-19): at a warm weight a slip of the finger is likelier
   than a missed attempt, so it is asked about, Log it as missed or Fix it,
   where at or near the working load a 0 is logged as missed at once. Well
   under is under LIGHTER_LOAD of the heavier of the block's suggested load and
   the heaviest working set done today, the share a lighter session is read by
   (a convention). Loads are compared as moved, a bodyweight lift's with its
   share of bodyweight (as oddLoadIn compares them), so a 0 at bodyweight after
   bodyweight sets is not asked and one after sets with 20 kg added is. A
   warm-up, a drop, a timed hold and an assisted lift (its load is help) are
   never asked. */
/** Whether a ticked 0 on a row is at a load well under the session's working load, and so asked about. */
export function lightZeroIn(M: Model, b: DraftBlock, si: number, date: string): boolean {
  const s = b.sets[si];
  if (!s || s.warm || s.drop || !isMissed(s)) return false;
  const ex = EXIn(M, b.exId);
  const w = effW(b, si);
  if (ex.assist || ex.timed || w == null) return false;
  const bw = bwLoadIn(M, ex, date);
  let work = b.sw != null && b.sw > 0 ? bw + b.sw : 0;
  b.sets.forEach((x, i) => {
    if (i !== si && x.done && !x.warm && !x.drop && isWork(x) && x.w != null) work = Math.max(work, bw + x.w);
  });
  return work > 0 && bw + w >= 0 && bw + w < work * LIGHTER_LOAD - EPS;
}

/* A load under the bar (V on the r59 preview, 2026-10-25: a set of barbell
   bench could be logged at 0 lb, "unless you're bench pressing air"). On a
   lift on the full bar typed as the total (loadFloorIn), no set, a warm-up
   or a drop included, is lighter than the empty bar: a load under it is a
   slip, or a lighter bar not yet set, so it is asked about as a load far off
   is, naming the bar where it is set (the exercise's own, else Settings'). A
   load within half the last digit shown of the bar is the bar (rackTolIn). A
   barbell curl or skull crusher has no floor (an EZ or fixed bar is often
   lighter), nor a load typed per side. */
function underBarIn(M: Model, b: DraftBlock, si: number): string | null {
  const ex = EXIn(M, b.exId);
  const w = effW(b, si);
  if (!b.sets[si] || ex.assist || ex.timed || w == null) return null;
  const bar = loadFloorIn(M, ex);
  if (!(bar > 0) || w >= bar - rackTolIn(M)) return null;
  const say = (x: number): string => `${loadLabelIn(M, ex, x)} ${UIn(M)}`;
  return (ex.barKg ?? 0) > 0
    ? `${say(w)} is under this lift's ${say(bar)} bar.`
    : `${say(w)} is under the ${say(bar)} bar set in Settings.`;
}

/* Why a set's load is far off its session or the lift's log (a working set
   only, above), or under the bar (any set, underBarIn), or null. The
   comparisons with the session and the log come first, as the more specific;
   the bar answers when they do not. */
/** Why a set's load is far off its session or the lift's log, or under the bar, or null (above). */
export function oddLoadIn(M: Model, b: DraftBlock, si: number, date: string): string | null {
  const s = b.sets[si];
  const under = underBarIn(M, b, si);
  if (!s || s.warm || s.drop) return under;
  const ex = EXIn(M, b.exId);
  const w = effW(b, si);
  if (ex.assist || ex.timed || w == null) return null;
  const bw = bwLoadIn(M, ex, date);
  const load = bw + w;
  if (!(load > 0)) return under;
  const say = (x: number): string => `${loadLabelIn(M, ex, x)}${ex.bw ? '' : ' ' + UIn(M)}`;
  let top = 0,
    topW = 0;
  b.sets.forEach((x, i) => {
    if (i !== si && x.done && isWork(x) && !x.drop && x.w != null && bw + x.w > top) {
      top = bw + x.w;
      topW = x.w;
    }
  });
  if (top > 0 && load > top * ODD_SESSION + EPS)
    return `${say(w)} is more than three times your heaviest set today, ${say(topW)}.`;
  if (top > 0 && load * ODD_SESSION < top - EPS)
    return `${say(w)} is under a third of your heaviest set today, ${say(topW)}.`;
  /* After a long break with nothing since, the lift starts fresh: a load from years ago is no measure of a
     slipped digit today, as on a lift never done. Once it is back, every session counts, so a load the lifter has
     lifted before is never called more than twice the heaviest logged (REV10-3: 285 after 135 last week, 315 in 2016). */
  const all = liftReadIn(M, b.exId, date);
  const read = sinceLongBreak(all, date).length ? all : [];
  let best = 0,
    bestW = 0;
  for (const x of read)
    for (const p of x.pts)
      if (bw + p.w > best) {
        best = bw + p.w;
        bestW = p.w;
      }
  if (best > 0 && load > Math.max(best, top) * ODD_BEST + EPS)
    return `${say(w)} is more than twice the heaviest logged on this exercise, ${say(bestW)}.`;
  if (ex.bw && w > 0) {
    const kg = bwAtIn(M, date);
    if (kg != null && kg > 0 && w >= kg * ODD_ADDED_BW - EPS)
      return `${say(w)} adds ${pctOf(ODD_ADDED_BW)}% or more of your bodyweight, ${fmtWIn(M, kg)} ${UIn(M)}.`;
    let most = 0;
    for (const x of read) for (const p of x.pts) most = Math.max(most, p.w);
    b.sets.forEach((x, i) => {
      if (i !== si && x.done && isWork(x) && !x.drop && x.w != null) most = Math.max(most, x.w);
    });
    if (most > 0 && w > most * ODD_ADDED_BEST + EPS)
      return `${say(w)} is more than ${timesWord(ODD_ADDED_BEST)} the most added on this exercise, ${say(most)}.`;
  }
  return under;
}
