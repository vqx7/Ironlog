/* A lift's usual (CL-1, split from analytics.ts; V's one rule, r54): the sets a session is read by, its strength
   reading and reps against the sessions before it, whether it was at its usual load and work, and a session of
   fewer sets than its plan gave it (short). Functions of a lift's exposures, which the analytics index builds. */
import type { ExPoint, Exposure } from './model';
import { EPS, EPS_SAME } from './util';
import { LIGHTER_LOAD, afterBreak, lighter, sameRR, trendE, USUAL_BEFORE } from './formulas';

/** How far under its usual a lift's session may fall and still be at its
    usual level: 97% of the best strength reading of the sessions it is
    compared with (the r30 audit's tolerance, a convention: at 8 reps and the
    same load, one of two sets a rep short is within it, every set a rep
    short is not), or, where a lift has no reading, of each one's reps a set
    (a convention of r53's, stricter: at 12 a set, 12, 12 and 11 is within it
    and 12 and 11 is not; on a 60 s hold, 58 s is). */
export const USUAL_SHARE = 0.97;

/* The middle of a list of numbers, the higher of the two middle ones in an
   even list (a lift's usual, V's one rule, r54). */
const mid = (v: readonly number[]): number => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/* A lift's sets in a session as its usual sets count them (V's one rule,
   r54): its working sets at a load, as moved, within a tenth of its working
   load either way (LIGHTER_LOAD), and any heavier set up to its usual
   working load (`usualW`, typed). A set a tenth or more lighter is a
   back-off set or an unmarked warm-up, as a session that much lighter reads
   lighter; one a tenth or more heavier is a top set, which the target
   does not build on, unless it was at the usual load: a set at the
   usual load is a usual set, whatever the session's working load came to
   (100 x 3, then 82.5 x 7 three times, is four sets, a day below usual).
   From the independent review of r54: counting only the sets at the
   working load read 100 x 10, 9 and 9 with 97.5 x 9, all four planned sets,
   as fewer sets, and so a heavier last set, and the sets after a load
   lowered mid-session. With no load to compare (a bodyweight lift with
   nothing added, an assisted one before any weigh-in), every working set.
   A set tried and missed counts by the same test (r64, the r63 audit's
   R-1): it was one of the session's sets, short of the range, which the
   next target reads (triedAt). Left out, 185 x 10, 0, 0 after 185 x 10 x 3
   read as a session of fewer sets, which sets no target, so the target came
   from the session before and stepped the load up, "every set at 185 hit
   10", the sets missed at that very load. */
function setsAt(q: Exposure, usualW: number): number {
  const tried: readonly ExPoint[] = q.miss ? [...q.pts, ...q.miss] : q.pts;
  let tw = -Infinity;
  for (const p of q.pts) if (Math.abs(p.w - q.topW) < EPS_SAME) tw = Math.max(tw, p.load);
  if (!(tw > 0)) return tried.length;
  let n = 0;
  for (const p of tried)
    if (p.load >= tw * LIGHTER_LOAD - EPS && (p.load * LIGHTER_LOAD <= tw + EPS || p.w <= usualW + EPS_SAME)) n++;
  return n;
}

/* The sets a lift's session tried at a load, in the order done, a missed
   set among them with its 0 reps and marked as missed (PENDING 338 A).
   A missed set counts toward no volume, PR, estimate or trend, but it is a
   set of the session short of the range, which the next target reads: read
   without it, a 5 x 5 with its last two sets missed twice running read as
   three sets of 5, every set made, and stepped up, and a 4-set plan read
   "over your first 2 sets". */
/** A session's sets at load w as tried, in order, a missed one with its 0 reps and `missed` set. */
export function triedAt(x: Exposure, w: number): (ExPoint & { missed?: true })[] {
  const at = (p: ExPoint): boolean => Math.abs(p.w - w) < EPS_SAME;
  const miss = (x.miss || []).filter(at);
  const out: (ExPoint & { missed?: true })[] = [];
  let k = 0;
  x.pts.forEach((p, i) => {
    for (; k < miss.length && miss[k].at <= i; k++) out.push({ ...miss[k], missed: true });
    if (at(p)) out.push(p);
  });
  for (; k < miss.length; k++) out.push({ ...miss[k], missed: true });
  return out;
}

/* The usual sets of the sessions a lift's session is read against: the
   middle of their sets (setsAt), at the middle of their working loads. */
const usualSets = (ref: readonly Exposure[]): number => {
  const w = mid(ref.map(q => q.topW));
  return mid(ref.map(q => setsAt(q, w)));
};

/* A session's strength reading, reps alone, over its first k sets at its
   working load, as its target reads the first sets there (the engine's
   tp), or null where it has none (tRaw, the same over every set there, is
   null); and its reps a set over the same sets. So a set beyond the usual
   never counts against a session (from the independent review of r54: a
   fourth set of 5 after 11, 10 and 10 brought the average under the usual
   and held back a target the three planned sets beat). */
/* A set missed at the working load is one of those sets, read as 0 (r72, the 387 audit's 387-B3, V 2026-11-04: "count
   as 0 reps"): left out, 185 x 10, 10 and a missed set read as full and asked 21+ reps, where 185 x 10, 10, 2 read
   below its usual and repeated 31+, so failing a set outright set an easier target than two reps of it. Read as 0,
   it is below its usual too and the target repeats; the load still never steps up on it (setsAt, r56.2). */
function readingOf(q: Exposure, k: number): number | null {
  if (q.tRaw == null) return null;
  let sum = 0,
    n = 0,
    missed = 0;
  for (const p of triedAt(q, q.topW).slice(0, k)) {
    if (p.missed) {
      missed++;
      continue;
    }
    const t = trendE(p.load, p.r, 0);
    if (t != null) {
      sum += t;
      n++;
    }
  }
  // Every one of them missed reads 0 (the review's R72-8: on a one-set plan it fell back to the session's other sets and read as full).
  return n + missed ? sum / (n + missed) : q.tRaw;
}
function repsOf(q: Exposure, k: number): number {
  const at = triedAt(q, q.topW).slice(0, k);
  return at.length ? at.reduce((a, p) => a + p.r, 0) / at.length : q.topReps / q.topN;
}

/** Whether a lift's session was at its usual load (the r30 audit: a lift
    done at its usual load in a lighter week is not lighter): its working
    load not under the heaviest working load of its previous sessions in the
    range (`ref`, up to three), and its strength reading, reps alone, no
    further under theirs than USUAL_SHARE allows, each read over as many
    sets at the working load as theirs usually were (readingOf, r54). The
    working load since r54: by the heaviest set, a lifter
    who opens with a heavy single and leaves it out on a lighter day, doing
    the usual sets after it, read lighter, though the single is not where
    reps are built. */
export function atUsualLoad(x: Exposure, ref: readonly Exposure[]): boolean {
  const k = usualSets(ref);
  const mW = Math.max(...ref.map(q => q.topW)),
    mT = Math.max(...ref.map(q => readingOf(q, k) ?? -Infinity)),
    t = readingOf(x, k);
  return !(x.topW < mW - EPS_SAME || (t != null && isFinite(mT) && t < mT * USUAL_SHARE));
}

/** Whether a lift's session on a deload or lighter day was at its usual
    load and reps, against its previous sessions in the range not
    done lighter (`ref`, up to three), its sets aside: those V's one rule
    reads next, as on any day (idxShort, r54). With a strength reading on
    it and on one of them, the usual-load test above. Without one (a timed
    hold, a lift with no estimate such as a hanging leg raise, a bodyweight
    lift before any weigh-in, sets past 20 reps), the load says nothing on
    its own: a bodyweight leg raise is at its usual load on every day, and
    r53's first version counted 8 leg raises on a lighter day as a full
    session after 12s. So the working load must be no lighter than any of
    theirs (less help on an assisted lift), and the reps a set at it
    (seconds on a hold) no further under any of theirs than USUAL_SHARE
    allows. With no earlier session in the range to compare with, it is
    not: the day's label stands. */
export function atUsualWork(x: Exposure, ref: readonly Exposure[]): boolean {
  if (!ref.length) return false;
  if (x.tRaw != null && ref.some(q => q.tRaw != null)) return atUsualLoad(x, ref);
  const k = usualSets(ref);
  return ref.every(q => x.topW >= q.topW - EPS_SAME && repsOf(x, k) >= repsOf(q, k) * USUAL_SHARE);
}

/* The sets a lift's session is held to: the sets its plan gave it when saved (`ps`, Finish's withPlanSets), once a
   session of the lift in this stretch has done that many; else its usual sets, never more than the plan's (`plan`,
   the routine's sets for the lift on that day as it is now; null off the routine). So a plan is never asked of a lift
   that has not yet done it, and once done, fewer sets never become the usual. */
/** The sets a lift's session must do for its next target to build on it, by V's one rule (above). */
function setsHeldTo(usualSets: number, plan: number | null, saved: number | null, reached: boolean): number {
  if (saved != null && reached) return saved;
  return plan != null && plan > 0 ? Math.min(usualSets, plan) : usualSets;
}

/* V's one rule for every session: a lift's session sets its next target only when it did its usual load and
   reps for the sets it is held to (setsHeldTo); a session short of either still counts for the trend, stalls and PRs,
   and the target repeats. Short by its sets: fewer near its working load (setsAt) than it is held to. Short by its
   reading: at a working load no heavier than the sessions before it, its strength reading (else its reps a set) over
   those sets is more than USUAL_SHARE under the usual (readingOf), so a set beyond them never counts against it. The
   usual is the middle of it and the two sessions before it in the range not done lighter, so one session under it
   repeats the target and a second in a row becomes the usual. A heavier working load than both before it is a step
   up, never short by its reading. A session labelled lighter or a deload but done at its usual load and reps (`tag`)
   is read against the sessions before it alone, and if short is not one later sessions are read against. The first
   session in a range, or back after a break or on a new machine, is its own usual. Each case, with the release and
   the bug that made it, is a row of tests/usual.js; the history is in docs/ARCHIVE.md. */
/** Marks each of a lift's sessions short of its usual by its sets or its reading, by V's one rule (above). */
export function idxShort(byEx: Record<string, Exposure[]>, planSets: (id: string, x: Exposure) => number | null): void {
  for (const id of Object.keys(byEx)) {
    const normal: Exposure[] = [];
    let last: Exposure | null = null;
    for (const x of byEx[id]) {
      if (afterBreak(last, x.date) || x.nw) normal.length = 0;
      last = x;
      if (lighter(x)) continue;
      const prior = normal.filter(q => sameRR(q.rr, x.rr));
      const before = prior.slice(-USUAL_BEFORE);
      // A label cut the plan, so a labelled session is held to its own sets (above).
      const plan = before.length && !x.tag ? planSets(id, x) : null;
      const saved = !x.tag && x.ps != null ? x.ps : null;
      const reached = saved != null && prior.some(q => setsAt(q, q.topW) >= saved);
      const sh = before.length ? shortOf(x, before, plan, saved, reached) : undefined;
      if (sh) x.short = sh;
      if (!(x.tag && x.short)) normal.push(x);
    }
  }
  // Short of its usual by its sets, or by its reading, against the two sessions before it in the range, or not.
  function shortOf(
    x: Exposure,
    before: readonly Exposure[],
    plan: number | null,
    saved: number | null,
    reached: boolean
  ): Exposure['short'] {
    const usual = (v: readonly number[], own: number): number => mid(x.tag ? v : [...v, own]);
    /* Its sets near its working load (setsAt). At a heavier working load
       than both before it, a step up, its sets at or above their working
       load count too: an easy first set and the load raised for the rest
       (r34) is 1 set at the old load and 2 at the new, the old one more than
       a tenth under the new after a big jump early on. */
    const loads = before.map(q => q.topW);
    const was = Math.max(...loads),
      usualW = usual(loads, x.topW);
    const up = x.topW > was + EPS_SAME;
    const n = up ? Math.max(setsAt(x, usualW), x.pts.filter(p => p.w >= was - EPS_SAME).length) : setsAt(x, usualW);
    const sets = usual(
      before.map(q => setsAt(q, usualW)),
      n
    );
    const usualN = setsHeldTo(sets, plan, null, false);
    const want = setsHeldTo(sets, plan, saved, reached);
    if (n < want) return 'sets';
    if (up) return undefined;
    /* Read over as many sets at the working load as the usual, and no more
       than it had to reach (readingOf), so a set the sessions before it did
       not do never counts against it (a fourth planned set after sessions
       of three); with a reading on it and on both before it, every one of
       them has one, so the 0 is never read. */
    const k = Math.min(usualN, want);
    const tr = (q: Exposure): number => readingOf(q, k) ?? 0;
    if (x.tRaw != null && before.every(q => q.tRaw != null))
      return tr(x) < usual(before.map(tr), tr(x)) * USUAL_SHARE - EPS ? 'reading' : undefined;
    // Reps a set over those sets (seconds on a hold).
    const per = (q: Exposure): number => repsOf(q, k);
    const lighterW = x.topW < usualW - EPS_SAME;
    return lighterW || per(x) < usual(before.map(per), per(x)) * USUAL_SHARE - EPS ? 'reading' : undefined;
  }
}
