/* What a PR is called and the rep bands estimates are judged in (phase 3a,
   r51; moved unchanged from the legacy script). Finding the PRs moves with the analytics. */

import { EPS_SAME, EPS } from './util';
import { PR_BANDS, REP_PR_SHARE, prSameLoad, e1, rtfBand, rtfOf, prScoreOf } from './formulas';
import type { ExPoint, Exposure, ExerciseLike, Model, Pr } from './model';
import { noE1 } from './library';
import { EXIn } from './model';

import { noBodyIn } from './setread';

// The bands in words, counted as reps to failure (reps plus RIR).
/* Bands count reps to failure (reps plus reps in reserve), so they say so (r34.2, from the review:
   "sets of 11 to 12 reps" named the band of a set of 8 at 3 in reserve). */
/** Each band's reps to failure as a range, "1 to 5", in band order. */
export const BAND_RANGES: readonly string[] = PR_BANDS.map((b, i) => `${i ? PR_BANDS[i - 1].top + 1 : 1} to ${b.top}`);
/** Each band in words, by band. */
export const BAND_WORDS: Readonly<Record<number, string>> = Object.fromEntries(
  PR_BANDS.map((b, i) => [b.band, `${BAND_RANGES[i]} reps to failure`])
);

/** An estimate PR (type e1RM, the only kind these are given): its value, the
    best before it of any band, and its band. The analytics record a band with
    every estimate (the PR's type says it may be null, so one without reads as
    "its reps"). */
type PrMark = { value?: number | null; prevAll?: number | null; bb: number | null };

/** Whether an estimate PR beats every earlier estimate, not only its band's. */
export function prOverall(p: Pick<PrMark, 'value' | 'prevAll'>): boolean {
  return p.prevAll == null || (p.value != null && p.value > p.prevAll + EPS_SAME);
}

/* What an estimate PR is called (r34.2, from the review: a best for 6 to 8
   reps was shown as "Best estimate 30 kg (was 29)" beside an all-time best
   estimate of 30 kg from a set of 11): Best estimate only when it beats every
   earlier set's estimate, else the best for its band of reps, in the words
   the toast uses (until r54 a second table typed the same words). */
/** An estimate PR's name: Best estimate, or the best for its band of reps. */
export function prName(p: PrMark): string {
  return prOverall(p) ? 'Best estimate' : `Best for ${(p.bb != null && BAND_WORDS[p.bb]) || 'its reps'}`;
}

/* ---------- the PR scorer (r64, the r63 audit's A-6 and 339 o) ----------
   One rule for the PR list (idxPRsIn, a session at a time over a lift's
   stretch) and the toast as a set is ticked (livePR in worksets.ts, the set
   alone against the lift's sessions before): until r64 the toast read its
   own copy, its bands from the lift's current stretch (exStats) where the
   list read every earlier session, and a drop set or a band's first set
   one way where the list read it another. A blank effort is read once, as
   every estimate reads it (rirEst: the lift's usual, 339 o). */

/** What a lift's sessions so far are, as the next session's sets are judged against them. */
interface PrSoFar {
  /** The sets no other set matched on both load and reps (the rep PR frontier). */
  front: ExPoint[];
  /** The strongest set so far by the rep PR score. */
  topSc: number;
  /** The heaviest load done so far, as logged. */
  prevMaxW: number;
  /** The best estimate so far in each band of reps to failure. */
  byBand: Record<number, number>;
  /** The best estimate so far in any band. */
  maxPb: number | null;
  /** Every load logged so far, for prSameLoad (r54). */
  seen: Set<number>;
  /** Whether no session has been added yet: a lift's first session makes no PR. */
  none: boolean;
}

/** A lift with nothing logged yet, to judge sets against. */
export function prSoFar(): PrSoFar {
  return { front: [], topSc: 0, prevMaxW: -Infinity, byBand: {}, maxPb: null, seen: new Set(), none: true };
}

/* The rep PR score: the estimate, or Epley where the estimate gives none
   (past 12 reps to failure). */
const prScore = (q: ExPoint): number => prScoreOf(q.pl, q.r, q.rq);
const prDominated = (h: PrSoFar, p: ExPoint): boolean => h.front.some(q => q.pl >= p.pl - EPS_SAME && q.r >= p.r);

/** Adds a session's sets to what later sets are judged against. */
export function prAdd(h: PrSoFar, x: Pick<Exposure, 'pts' | 'pb' | 'pbb'>): void {
  if (x.pb != null) h.maxPb = h.maxPb == null ? x.pb : Math.max(h.maxPb, x.pb);
  // A session with an estimate at the PR load has its band.
  if (x.pb != null && x.pbb != null) h.byBand[x.pbb] = Math.max(h.byBand[x.pbb] ?? -Infinity, x.pb);
  for (const p of x.pts) if (p.r > 0) h.prevMaxW = Math.max(h.prevMaxW, p.w);
  for (const p of x.pts) h.topSc = Math.max(h.topSc, prScore(p));
  /* A rep PR is a set no earlier set matched on both load and reps. Keeping
     every earlier set to test that was O(exposures^2 x sets^2) and became
     seconds of work after a couple of years of logs. Only the non-dominated
     points can ever dominate anything, so keep just those. Same answers,
     and the frontier stays small. */
  for (const p of x.pts) {
    if (prDominated(h, p)) continue;
    for (let k = h.front.length - 1; k >= 0; k--)
      if (p.pl >= h.front[k].pl - EPS_SAME && p.r >= h.front[k].r) h.front.splice(k, 1);
    h.front.push(p);
  }
  for (const p of x.pts) h.seen.add(p.w);
  h.none = false;
}

/** A session's best estimate at the PR load and its band of reps to failure (an exposure's pb and pbb), none on a lift with no estimate. */
export function prBestOf(
  ex: ExerciseLike,
  pts: readonly ExPoint[],
  // Required, so no caller can leave a lift with no weigh-in its estimate by forgetting it (noBodyIn, NEW-72).
  noBody: boolean
): { pb: number | null; pbb: number | null } {
  let pb: number | null = null,
    pbb: number | null = null;
  // No estimate without one, nor on a bodyweight lift with no weigh-in (noBodyIn, NEW-72).
  if (noE1(ex) || noBody) return { pb, pbb };
  // At the PR load: the load itself, but on a bodyweight lift its share of bodyweight at the latest weigh-in.
  for (const p of pts) {
    const v = e1(ex.bw ? p.pl : p.load, p.r, p.rq),
      rt = rtfOf(p.r, p.rq);
    // A set with an estimate has reps to failure (e1 gives none without them).
    if (v != null && rt != null && (pb == null || v > pb)) {
      pb = v;
      pbb = rtfBand(rt);
    }
  }
  return { pb, pbb };
}

/** A PR as the scorer makes it, before the list gives it its date, session and lift: each kind of Pr without those three. */
type PrMade = Each<Pr>;
/** Each member of a union of PRs without its date, session and lift (distributed, so each kind keeps its own fields). */
type Each<P> = P extends Pr ? Omit<P, 'date' | 'sid' | 'exId'> : never;

/** Judges a session's sets against what came before (h): the PR it makes, one a session, and whether the lift moved. */
export function prJudge(
  ex: ExerciseLike,
  h: PrSoFar,
  x: Pick<Exposure, 'pts' | 'pb' | 'pbb'>
): { pr: PrMade | null; progress: boolean } {
  if (h.none) return { pr: null, progress: false };
  let repPR: ExPoint | null = null;
  /* Each set at the load its PRs judge it at (prSameLoad, r54: changing
     units or gyms is not a PR), and as logged (at), which the PR list
     shows. The earlier sets stay as logged: a set is only ever judged
     lighter, so this can take a PR away and never make one. */
  const judged = x.pts.map(p => {
    const w = prSameLoad(p.w, h.seen);
    return { p: w === p.w ? p : { ...p, w, pl: p.pl + (w - p.w) }, at: p };
  });
  const pts = judged.map(j => j.p);
  const asLogged = (q: ExPoint): ExPoint => (judged.find(j => j.p === q) || { at: q }).at;
  /* r30: a rep PR counts only when the set is at least 90% of the
     strongest set logged before (by the same estimate), a convention.
     Any new load and rep pairing used to count, so 40 kg x 10 after
     95 kg x 5 was a PR and the demo showed 54 PRs in 14 days. Every set in
     the session is judged against the frontier as it stood before the
     session, so sets within one session cannot cancel each other. */
  const floor = h.front.reduce((a, q) => Math.max(a, prScore(q)), 0) * REP_PR_SHARE;
  for (const p of pts) {
    if (!prDominated(h, p) && prScore(p) >= floor - EPS && (!repPR || prScore(p) > prScore(repPR))) repPR = p;
  }
  /* Its best estimate and the band it is in, at the loads it is judged at,
     and that set's own estimate (shown), which the list shows: the
     session's own (pb, pbb) unless a load was read as another. */
  let pbJ = x.pb,
    bandJ = x.pbb,
    shown = x.pb;
  if (x.pb != null && judged.some(j => j.p !== j.at)) {
    pbJ = null;
    for (const j of judged) {
      const v = e1(j.p.pl, j.p.r, j.p.rq),
        rt = rtfOf(j.p.r, j.p.rq);
      if (v != null && rt != null && (pbJ == null || v > pbJ)) {
        pbJ = v;
        bandJ = rtfBand(rt);
        shown = e1(j.at.pl, j.at.r, j.at.rq);
      }
    }
  }
  /* Estimates drift with reps, so the same strength reads differently from a
     triple and from a set of 12. An e1RM PR is judged against earlier bests
     from the same band of reps to failure (1-5, 6-10, 11-12), taken from the
     set itself, so a set that overshoots its planned range is judged where it
     landed; a band's first set against every earlier estimate (r64, the r63
     audit's R-6: 185 x 8 after 200 x 3 was the board's best estimate and a
     Rep PR in the list). Rep PRs compare actual load and reps, which mean the
     same in any range, so they stay global. */
  const pb = (bandJ != null ? h.byBand[bandJ] : undefined) ?? h.maxPb;
  const e1PR = pbJ != null && pb != null && pbJ > pb + EPS_SAME;
  /* A weight PR (r29): more weight than any earlier working set of the
     lift, as logged (added load on a bodyweight lift, less help on an
     assisted one). It is also a rep PR by definition, so it used to show
     as one (V: "a new weight and rep PR in the same set marks it as a
     rep PR"). One label per lift and session, the biggest news first:
     weight PR, then best estimate, then rep PR. Of the sets at the new
     weight, the strongest by the same score (r55, from the audit: the
     recap named 82.5 x 11 beside the estimate of 82.5 x 10, the set the live
     toast named, as reps alone had picked it). */
  const wJ = !ex.timed
    ? pts
        .filter(p => p.r > 0 && p.w > h.prevMaxW + EPS_SAME)
        .sort((a, b) => b.w - a.w || prScore(b) - prScore(a) || b.r - a.r)[0]
    : null;
  const wPR = wJ ? asLogged(wJ) : null;
  // Any record at all (heavier, a best for its reps, more reps at a load): the stall test's sign the lift moved. Since r58 (343 6) no screen calls it a PR; a PR is `big`.
  const progress = !!repPR || e1PR || !!wPR;
  /* big: a PR that is counted and announced (r32, from the third review:
     "8 new PRs" in a fifth session, 34 in 30 days after an import, since
     every load step was a weight PR and every added rep a rep PR). On a
     lift with a strength estimate that is a new best estimate; a heavier
     set or more reps without one stays in the list. Lifts with no
     estimate (timed, joint rotation) keep every kind, and so does a
     session with no load known (a bodyweight lift before any weigh-in,
     r54: none of its PRs was counted, the score being 0 on every set;
     the sixth review of r53). Stronger than ever is judged against every
     earlier set by the same score as the rep PR floor, so 100 x 9 after
     100 x 8 counts though it moved into a new band of reps. r34.2: a new
     best in a band alone no longer makes it big (from the review: triceps
     80 x 10 after 75 x 15 was announced as a PR though the set was weaker;
     sets past 12 reps have no estimate, so it was the band's first). Only
     stronger than ever, as the r32 rule says. A PR is a PR whatever the
     day is called (r53, V 2026-10-18); a heavier set without one is said
     once, quietly (Heaviest yet), so the day's label decides nothing here. */
  /* Stronger than ever: a higher score, or the same score with more reps than any earlier set at its load or
     heavier, a rep more past 12 to failure where the score reads no further (R72-4, V 2026-11-04). */
  const big =
    noE1(ex) ||
    !!ex.timed ||
    (!!ex.bw && !pts.some(q => q.pl > 0)) ||
    pts.some(q => prScore(q) > h.topSc + EPS || (prScore(q) >= h.topSc - EPS && !prDominated(h, q)));
  // What it beat: the old heaviest, the old best (in its band, else in any), or the most reps at this load or heavier.
  if (wPR)
    return {
      pr: {
        type: 'Weight PR',
        w: wPR.w,
        r: wPR.r,
        prevW: h.prevMaxW,
        value: e1PR ? shown : null,
        prev: e1PR ? pb : null,
        prevAll: h.maxPb,
        bb: bandJ,
        big
      },
      progress
    };
  if (e1PR) return { pr: { type: 'e1RM', value: shown, prev: pb, prevAll: h.maxPb, bb: bandJ, big }, progress };
  if (repPR) {
    const rp = repPR;
    return {
      pr: {
        type: 'Rep PR',
        w: asLogged(rp).w,
        r: rp.r,
        prevR: h.front.filter(q => q.pl >= rp.pl - EPS_SAME).reduce((a, q) => Math.max(a, q.r), 0),
        big
      },
      progress
    };
  }
  return { pr: null, progress };
}

/* The PR a session counts, as its sets were announced one by one (r64, the
   r63 audit's A-6): each set judged alone against the sessions before, the
   biggest news among those counted (big), a weight PR first (the heaviest),
   then a best estimate (the highest), then a rep PR (the strongest). Judged
   as a whole, a session named a best estimate from one set and counted it
   by another set's strength, so the recap said Best estimate where the
   toast had said Rep PR. Null when no set counts one: the session's own
   judgement then names what it did (Heaviest yet), not counted (r72). */
function prCounted(ex: ExerciseLike, h: PrSoFar, x: Pick<Exposure, 'pts'>, noBody: boolean): PrMade | null {
  // The kinds, the smallest news first.
  const ORDER: readonly PrMade['type'][] = ['Rep PR', 'e1RM', 'Weight PR'];
  const rank = (t: PrMade['type']): number => ORDER.indexOf(t);
  let top: { pr: PrMade; key: number } | null = null;
  for (const p of x.pts) {
    const { pr } = prJudge(ex, h, { pts: [p], ...prBestOf(ex, [p], noBody) });
    if (!pr || !pr.big) continue;
    // Within a kind: the heaviest weight PR, the highest estimate, the strongest rep PR.
    const key = pr.type === 'Weight PR' ? pr.w : pr.type === 'e1RM' ? (pr.value ?? 0) : prScore(p);
    if (!top || rank(pr.type) > rank(top.pr.type) || (rank(pr.type) === rank(top.pr.type) && key > top.key + EPS_SAME))
      top = { pr, key };
  }
  return top && top.pr;
}

/* Step 4: one lift's PRs, in order, into prs (and each exposure's progress
   mark, which the stall test reads), each session judged against those
   before it in its stretch by the PR scorer above. Each PR keeps its session
   (sid), so two sessions on one day never share one (r34.2). Returns the
   lift's best estimate ever. */
export function idxPRsIn(M: Model, id: string, exps: Exposure[], prs: Pr[]): number | null {
  const ex = EXIn(M, id);
  const h = prSoFar();
  let maxBest: number | null = null;
  for (const x of exps) {
    // Drop sets never feed a PR or a best (r64: a block of drop sets alone made a Weight PR in the list, never in the toast).
    if (x.dropOnly) continue;
    const j = prJudge(ex, h, x);
    x.progress = j.progress;
    /* Its date, session and lift first, as every PR has kept them in that order. With no set counting one, the
       session's own judgement names what it did and is not counted (r72, from building 387-B4): judged as a
       whole it was counted when any set was stronger than ever, so 100 x 7 at 2 in reserve was a counted best
       estimate because 100 x 12 at 4 in the same session scored more, a set no toast announces, being no
       heavier and no more reps than one before. A PR is a set stronger than every earlier one (CLAUDE.md). */
    const pr = prCounted(ex, h, x, noBodyIn(M, ex)) ?? (j.pr ? { ...j.pr, big: false } : null);
    if (pr) prs.push({ date: x.date, sid: x.sid, exId: id, ...pr });
    prAdd(h, x);
    if (x.best != null) maxBest = maxBest == null ? x.best : Math.max(maxBest, x.best);
  }
  return maxBest;
}
