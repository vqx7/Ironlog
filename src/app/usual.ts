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
   lighter (r30); one a tenth or more heavier is a top set, which the target
   does not build on (r31), unless it was at the usual load: a set at the
   usual load is a usual set, whatever the session's working load came to
   (100 x 3, then 82.5 x 7 three times, is four sets, a day below usual).
   From the independent review of r54: counting only the sets at the
   working load read 100 x 10, 9 and 9 with 97.5 x 9, all four planned sets,
   as fewer sets, and so a heavier last set, and the sets after a load
   lowered mid-session. With no load to compare (a bodyweight lift with
   nothing added, an assisted one before any weigh-in), every working set.
   A set tried and missed (r55) counts by the same test (r64, the r63 audit's
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
   set (r55) among them with its 0 reps and marked as missed (PENDING 338 A).
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
    working load since r54 (PENDING 313 c): by the heaviest set, a lifter
    who opens with a heavy single and leaves it out on a lighter day, doing
    the usual sets after it, read lighter, though the single is not where
    reps are built (r31). */
export function atUsualLoad(x: Exposure, ref: readonly Exposure[]): boolean {
  const k = usualSets(ref);
  const mW = Math.max(...ref.map(q => q.topW)),
    mT = Math.max(...ref.map(q => readingOf(q, k) ?? -Infinity)),
    t = readingOf(x, k);
  return !(x.topW < mW - EPS_SAME || (t != null && isFinite(mT) && t < mT * USUAL_SHARE));
}

/** Whether a lift's session on a deload or lighter day was at its usual
    load and reps (r53), against its previous sessions in the range not
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

/* Step 2b (r54, V's one rule for every session, PENDING 312 E: "a lift
   counts toward its next target only at its usual load and reps for its
   usual sets; fewer sets still count for its trend and PRs, and the target
   repeats", replacing the trimmed mark and r30's half rule; with V's
   answers of 2026-10-18 evening, a bad day falls short too, and a lift's
   usual sets are what it did in most of its last three sessions, never
   more than the plan). A lift's session not done lighter is short of its
   usual by its sets when it has fewer sets near its working load (setsAt)
   than its usual, and by its reading when, at a working load no heavier
   than the two sessions before it, its reading is more than USUAL_SHARE
   under its usual: the strength reading, reps alone, where it and those it
   is read with have one, else its reps a set at its working load, and that
   load, each over as many sets at the working load as the usual
   (readingOf), so a set beyond the usual never counts against it. Its
   usual is the middle of it and the two sessions of the lift before it in
   the range not done lighter (the higher of two with only one before it),
   so one session under it repeats the target and a second in a row is the
   usual, which the app then follows.
   On a lift the routine plans (`planSets`, the day it was done on first;
   null for a lift on no day of the routine, which reads its own sessions),
   its usual sets are never more than the plan's, so a lifter who does more
   sets than planned is not short when doing the plan. A session saved on a
   day of a routine keeps the sets its plan gave the lift then (`ps`, r58,
   339 h); once a session of the lift in the range since its last break did
   that many near its working load, those are the sets it must reach, so
   fewer sets than planned never become the usual (a 5 x 5 done as 4 x 5
   twice read as a 4-set lift, and its target asked for 4 sets the plan
   never set). Each session is read by its own plan, so a plan changed
   later never rereads the sessions before it (the r58 review: read by the
   plan as it is now, a plan raised from 3 sets to 4 marked every session of
   3 short and took the target back to the first of them). A session with
   none recorded (Freestyle, a lift on no day of the routine, one saved
   before r58, a blank session saved before r70) reads its own sets, as
   before. Since r70 a blank session records them too (NEW-51): Finish saves,
   on a lift the routine plans, the sets of its day nearest to what the
   session did, unless Today opens blank (Freestyle), so two one-set PR attempts in a
   row never make a 3-set lift a 1-set one, and, as on a routine's day, each
   session is read by what was saved with it, never by the plan or the mode
   as they are now (the review of r70, R70-1 and R70-2). On a lift labelled
   lighter or a deload but done at its usual load
   and reps (`tag`, step 2), the label cut the plan, so its usual sets are
   its own, and if it falls short it is not one of the sessions later ones
   are read against, so half the sets of a deload twice running never
   become the usual. A heavier working load than both before it is a step
   up, whose reps fall as a step costs them: never under its usual by its
   reading, as a trend reads it (r34.2, loadUp); a step too big is the
   engine's to read (sgBelowRange). The first session of a lift in a range,
   or back after a break (afterBreak), is its own usual. */
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
      const cap = before.length && !x.tag ? planSets(id, x) : null;
      // The sets to reach (339 h, r58): those its plan gave it when saved (ps), once an earlier session did as many.
      const hold = !x.tag && x.ps != null && prior.some(q => setsAt(q, q.topW) >= (x.ps || 0)) ? x.ps : null;
      const sh = before.length ? shortOf(x, before, cap, hold) : undefined;
      if (sh) x.short = sh;
      if (!(x.tag && x.short)) normal.push(x);
    }
  }
  /* Short of its usual by its sets, or by its reading, against the two
     sessions before it in the range (see above), or not. A lift with a
     label (`tag`) is read against those two alone: its own sets were cut by
     the label, so they are no sign of a new usual (the second review of
     r53: after a session stopped at two sets of four, a lighter day of two
     sets of 10 read as the usual and let half the work set the target). */
  function shortOf(
    x: Exposure,
    before: readonly Exposure[],
    cap: number | null,
    hold: number | null
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
    // Its usual sets, never more than the plan's; the sets its plan gave it to reach once held (see above: 339 h, r58).
    const usualN = cap != null && cap > 0 ? Math.min(sets, cap) : sets;
    const want = hold != null ? hold : usualN;
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
