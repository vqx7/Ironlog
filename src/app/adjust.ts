/* Adjusting the next sets in a session: after a set well over or under its target,
   the sets after it are offered a load or reps that fit. Each function that reads the log takes the model first. */

import type { DraftBlock, NextSetsAdj, Plan } from './types';
import type { ExerciseLike, Model } from './model';

import { EXIn, exInjuryIn } from './model';
import { IDXIn, liftReadIn } from './analytics';
import { capOfIn } from './gym';
import { EPS, EPS_SAME } from './util';
import {
  BACK_DAYS,
  afterBreak,
  sinceLongBreak,
  E1_MAX_RIR,
  e1inv,
  fitE,
  jumpCap,
  rtfAt,
  workLoad,
  RIR_CALL_TOP,
  BACK_RIR,
  CLEARLY_OFF,
  FATIGUE_RIR
} from './formulas';
import { noE1 } from './library';
import { effAt, effScale, rangeWords } from './format';
import { heavierLoadIn, incOfIn, lighterLoadIn } from './loadsteps';
import { backDaysIn, suggestCoreIn } from './engine';
import type { ReadDay } from './setread';
import { bwRefLoadIn, rirEstIn } from './setread';
/* ---------- Adjusting the next sets (V) ----------
   Coaches who program by effort move the next set from how the last one
   went. After a ticked working set, when it was clearly off, the rows below
   that are still the app's (nothing typed) take a new load:
   - lighter than planned: 2 or more reps in reserve over the target with the
     reps in the range, or 2 or more reps past the top of the range (the
     same 2 that moves the next session's load from the estimate; V: 3 left
     the load alone after 14 reps on a 10 to 12 range);
   - heavier than planned: 2 or more reps under both the bottom of the range
     and what this session expected of the set (last time's reps at this
     load, or the target's minimum after a new load), not stopped early (no
     reserve over the target). A lift building reps up from under the range
     (a large step) is expected there and is left alone.
   The new load is what the set's own estimate says allows the middle of the
   range (up) or the bottom of it (down) at the target RIR with one rep more
   in reserve for fatigue, in whole steps or on the rack. Past the loads the
   lift has done since its last break it goes at most 10% up (15% on light
   isolation lifts, jumpCap); up to them the estimate alone bounds it. On the
   first session back after a break (backDaysIn) the next
   sets aim where the return's own words do, the bottom of the range with 2
   or more in reserve, and never past the load from before the break (165
   x 10 at 3 in reserve gives 185 x 6, 165 x 6 at 3 gives 170, where the 10%
   cap and the middle of the range would hold them at 175 and 165 for 8);
   any set there in the range whose estimate gives a heavier load moves them
   (V's decision 1), not only one clearly off, and a
   blank effort there reads as BACK_RIR in reserve (165 x 10 at 2, or
   unrated, gives 185 x 6). Conventions, meant to err light.
   A rep or two lost per set is normal fatigue and changes nothing. What the
   session decides (adjusting off in Settings, Keep, a warm-up, a drop, an
   unticked set, no row left to move, a past workout, an edit, a lighter day
   or deload) is the session screen's (workout.ts); what the lift decides is
   here: a timed hold, an assisted lift, a lift with no estimate, an injury,
   no range or step, and a bodyweight lift with no load or no weigh-in. */
/* The heaviest working load a lift has been done at in its stretch up to
   its last session, from its last break before it (all of its sessions when
   it has had none), or null with none: the loads a next-sets adjustment
   re-approaches without the 10% cap. Read only when the lift
   is not back after a break, so its last session is in today's stretch. */
function stretchTopIn(M: Model, exId: string, plan: Plan): number | null {
  // After a long break the lift starts fresh: loads from before it are no re-approach.
  const xs = sinceLongBreak(liftReadIn(M, exId, M.today()), M.today());
  if (!xs.length) return null;
  let i = xs.length - 1;
  while (i > 0 && !afterBreak(xs[i - 1], xs[i].date)) i--;
  let t: number | null = null;
  for (const x of xs.slice(i)) {
    const w = workLoad(x.pts, +plan.repMin);
    if (t == null || w > t) t = w;
  }
  return t;
}

/* A bodyweight lift never done with added load (not push-ups at BW x 20
   moved to BW+10 mid-session, a load the lifter never had, which one tap
   would log). It progresses by reps until the lifter
   types a load. */
/** Whether a bodyweight lift has never had added load, in this session or its log, and so moves by reps alone. */
export function bwNoLoadIn(M: Model, ex: ExerciseLike | null | undefined, b?: DraftBlock | null): boolean {
  if (!ex || !ex.bw || ex.assist) return false;
  if (b && b.sets.some(x => +(x.w ?? 0) > EPS_SAME)) return false;
  // Since a long break, as the engine starts it: loads from years ago make no loaded lift today.
  return !sinceLongBreak(IDXIn(M).byEx[ex.id] || [], M.today()).some(x => x.pts.some(p => p.w > EPS_SAME));
}

/** The next sets after ticked set `si` of a block, or null when it was not clearly off or the lift does not take an adjustment (above); `lastR` is last time's reps for that row (the Last column's), or null. */
export function nextSetsIn(M: Model, b: DraftBlock, si: number, lastR: number | null): NextSetsAdj | null {
  const s = b.sets[si];
  if (!s || !(+(s.r ?? 0) > 0) || s.w == null) return null;
  const ex = EXIn(M, b.exId);
  const p = b.plan;
  if (ex.timed || ex.assist || noE1(ex) || exInjuryIn(M, ex) || !(+p.repMin > 0)) return null;
  if (!(incOfIn(M, ex, p, s.w) > 0) || bwNoLoadIn(M, ex, b)) return null;
  // Nor a bodyweight lift with no weigh-in, which has no total load to estimate from.
  if (ex.bw && !(bwRefLoadIn(M, ex) > 0)) return null;
  const sc = effScale(M.s.settings.rirScale);
  // A first session back after a break: its reserve is the return's, 2 or more; the load from before it is a re-approach, and the most it asks.
  const back = backDaysIn(M, b.exId, p, {}) > BACK_DAYS;
  /* A blank effort is read as the lift's usual effort, as everywhere else
     (not as failure here only, which would drop the load further), but on a
     first session back, where it reads as BACK_RIR, what the return
     asked (V's decision 1). */
  const tgt = +p.rir || 0,
    lo = +p.repMin,
    hi = +p.repMax,
    r = +(s.r ?? 0);
  const q = s.rir == null || s.rir === '' ? null : +s.rir;
  // Read as a row of the workout open, as once it is saved; a block of none, as of today.
  const at: ReadDay = M.s.draft && M.s.draft.ex.includes(b) ? M.s.draft : M.today();
  const qe = q != null ? q : back ? BACK_RIR : rirEstIn(M, s, ex, at);
  const bw = bwRefLoadIn(M, ex),
    Lt = s.w + bw;
  const expR =
    b.tgt && b.tgt.kind === 'load' && +(b.tgt.repMin ?? 0) > 0 ? +(b.tgt.repMin ?? 0) : lastR != null ? lastR : lo;
  /* On a first session back any set in the range whose estimate gives a
     heavier load moves the next sets up, not only one clearly off the plan
     (V's decision 1: 165 x 10 at 2 in reserve, or unrated, would leave them
     at 165, where its estimate gives 185 x 6). */
  const offLight = (q != null && q >= tgt + CLEARLY_OFF && r >= lo) || r >= hi + CLEARLY_OFF;
  const light = offLight || (back && r >= lo),
    heavy = r <= Math.min(lo, expR) - CLEARLY_OFF && (q == null || q <= tgt);
  if (!(Lt > 0) || !(light || heavy)) return null;
  const est = fitE(Lt, r, qe == null ? 0 : Math.min(qe, E1_MAX_RIR));
  if (!est) return null;
  const pre = back ? suggestCoreIn(M, b.exId, p, {}) : null;
  const preTop = pre && pre.top != null && pre.top > 0 ? pre.top : null;
  const resUp = back ? Math.max(BACK_RIR, Math.min(tgt, E1_MAX_RIR)) : Math.min(tgt, E1_MAX_RIR) + FATIGUE_RIR;
  const resDown = back
    ? Math.max(BACK_RIR, Math.min(tgt, E1_MAX_RIR) + FATIGUE_RIR)
    : Math.min(tgt, E1_MAX_RIR) + FATIGUE_RIR;
  const n = b.sets.slice(0, si + 1).filter(x => !x.warm && !x.drop).length;
  const easy = (): string =>
    sc === 'rpe'
      ? `set ${n} was RPE ${effAt(sc, q ?? 0)}, against a target of RPE ${effAt(sc, tgt)}`
      : `set ${n} had ${effAt(sc, q ?? 0)} in reserve, against a target of ${effAt(sc, tgt)}`;
  let nw: number | null = null;
  if (light) {
    const byEst = e1inv(est, back ? lo + resUp : Math.round((lo + hi) / 2) + resUp) - bw;
    const done = back ? preTop : stretchTopIn(M, b.exId, p);
    const lim = back && done != null ? done : Math.max(done ?? -Infinity, Lt * jumpCap(ex, Lt, false) - bw);
    const want = Math.min(byEst, lim);
    const cap = capOfIn(M, ex, p);
    nw = heavierLoadIn(M, ex, p, s.w, cap != null ? Math.min(want, cap) : want);
    /* Rated 5 or more in reserve, the top of the scale, the estimate is
       only a floor, so one real step is always right even where it is
       more than the cap allows (else 20 lb curls at 5+ in
       reserve never move, a 5 lb step being 25% of the load). */
    if (nw == null && q != null && q >= RIR_CALL_TOP) {
      const one = s.w + incOfIn(M, ex, p, s.w);
      nw = heavierLoadIn(M, ex, p, s.w, cap != null ? Math.min(one, cap) : one);
    }
  } else {
    const want = e1inv(est, lo + resDown) - bw;
    const w = lighterLoadIn(M, ex, p, s.w, Math.max(0, want));
    nw = w < s.w - EPS_SAME ? w : null;
    if (nw != null && ex.bw && nw < 0) nw = 0;
  }
  if (nw != null) {
    const f = rtfAt(est, nw + bw);
    const er = f == null ? lo : Math.max(lo, Math.min(hi, Math.floor(f - (light ? resUp : resDown) + EPS)));
    const why = light
      ? q != null && q >= tgt + CLEARLY_OFF
        ? easy()
        : r >= hi + CLEARLY_OFF
          ? `set ${n} went ${r} reps, past your ${hi}`
          : `set ${n} showed more strength than a first session back asks`
      : `set ${n} stopped at ${r}, under your ${rangeWords(p)}`;
    return { at: si, w: nw, from: s.w, r: er, up: light, why, ...(typeof s.rid === 'string' ? { rid: s.rid } : {}) };
  }
  if (light && q != null && q >= tgt + CLEARLY_OFF && r < hi) {
    /* No heavier load fits (the next step is more than the estimate
       allows): the same load for more reps, so a set this easy is not
       met with silence (V). Reps the estimate gives at the target
       effort, up to the top of the range. */
    const f = rtfAt(est, Lt);
    const er = f == null ? null : Math.min(hi, Math.floor(f - (back ? resUp : Math.min(tgt, E1_MAX_RIR)) + EPS));
    if (er != null && er > r)
      return {
        at: si,
        w: s.w,
        from: s.w,
        r: er,
        up: true,
        why: easy(),
        ...(typeof s.rid === 'string' ? { rid: s.rid } : {})
      };
  }
  return null;
}
