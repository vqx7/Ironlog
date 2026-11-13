/* A lift's bests (split from analytics.ts): its bests up to a date (a past session's, read as it was then),
   the frame a set is judged a PR in, and its all-time bests. Each takes the model first (model.ts) and reads the
   analytics index. */
import type { ExPoint, ExStat, Exposure, ExerciseLike, Model } from './model';
import { noE1 } from './library';
import { EPS_SAME } from './util';
import { EXIn, sinceNew } from './model';
import { prSameLoad, e1, longBreakAt, sameRR } from './formulas';

import type { LoadedSet } from './setread';
import { noBodyIn, prLoadIn } from './setread';
import { IDXIn, liftReadIn } from './analytics';
/* The bests a lift had up to a date, for a past session entered after later
   ones: the same fields exStats gives for the whole log (best in the current
   rep range, best per band of reps to failure, best overall). No "easier"
   read, since that is about the lift now. A session with a best estimate has
   its band, as the ! says. */
export function statsUpToIn(M: Model, exId: string, exps: readonly Exposure[]): LiftBests {
  const now: Partial<ExStat> = IDXIn(M).exStats[exId] || {};
  let best: number | null = null,
    bestAll: number | null = null;
  const byBand: Record<number, number> = {};
  for (const x of exps) {
    if (x.best == null) continue;
    if (sameRR(x.rr, now.rr)) best = best == null ? x.best : Math.max(best, x.best);
    bestAll = bestAll == null ? x.best : Math.max(bestAll, x.best);
  }
  for (const x of exps) if (x.pb != null) byBand[x.pbb!] = Math.max(byBand[x.pbb!] || 0, x.pb);
  return { best, bestAll, byBand, rr: now.rr, easier: null };
}

/** A lift's bests as the engine reads them: the whole log's (exStats), or those up to a date (statsUpTo). */
export type LiftBests = Pick<ExStat, 'best' | 'bestAll' | 'byBand'> & {
  rr?: ExStat['rr'] | undefined;
  easier?: ExStat['easier'] | undefined;
};

/** A set being logged as its PRs judge it (prFrame): the lift, its sessions
    up to the day and their bests, the heaviest working load among them, the
    set's load as judged (w, prSameLoad), and its PR load (prLoad) as judged
    (load) and as logged (own). */
type PrFrame = {
  ex: ExerciseLike;
  exps: Exposure[];
  st: LiftBests | undefined;
  heaviest: number;
  w: number;
  load: number;
  own: number;
};

/* What the live PR check and the PR toast judge a set being logged against:
   the lift's sessions up to its day (a past workout entered after
   later ones reads only those up to it) with their bests (statsUpTo for a
   past day), and the set's load as the PR list judges it once saved
   (prSameLoad against every load of those sessions), so the toast and the
   list agree that changing units or gyms is not a PR. Null when the lift has
   no session yet. Before r54 each of the two read these itself. */
export function prFrameIn(M: Model, exId: string, s: LoadedSet, date: string): PrFrame | null {
  const I = IDXIn(M);
  const every = I.byEx[exId];
  if (!every || !every.length) return null;
  /* A set in a saved workout open for editing (History's Edit) is judged against the sessions before it, as the PR
     list judges it once saved, never against its own saved copy (R75-6: its 100 x 8 lost the Weight PR the list
     counts). Only this judgement leaves the copy out; the lift's history, bests and trend still show the workout as
     saved until the edit is (the review of 2.30: leaving it out of every reader made the history sheet's best set
     disagree with the PR list during an edit). */
  const ed = M.s.draft && M.s.draft.editingId;
  const read = date ? liftReadIn(M, exId, date) : sinceNew(every);
  const exps = ed ? read.filter(x => x.sid !== ed) : read;
  if (!exps.length) return null;
  const ex = EXIn(M, exId);
  const seen = new Set<number>();
  let heaviest = -Infinity;
  for (const x of exps)
    for (const p of x.pts) {
      seen.add(p.w);
      if (p.r > 0) heaviest = Math.max(heaviest, p.w);
    }
  const typed = Number(s.w) || 0;
  const w = prSameLoad(typed, seen);
  const own = prLoadIn(M, ex, s, date);
  const st = exps.length < every.length ? statsUpToIn(M, exId, exps) : I.exStats[exId];
  return { ex, exps, st, heaviest, w, load: own + (w - typed), own };
}

/** One record on the bests board: the set, the day it was first reached and the session it was in (the recap's). */
type BestAt = { p: ExPoint; date: string; sid: string };

/* All-time bests (item 27; moved from the legacy script in r55 to judge loads
   as the PR list does): per lift, the best estimate and the heaviest set,
   and the rep records, for every load the most reps where no heavier set did
   as many. The same rule makes a rep PR, so the board and the PR feed agree,
   and since r55 the same reading of a load typed in the other unit (the
   audit: 155 lb after 70 kg was a new heaviest and a new best estimate on
   the board, beside a PR list that rightly had none): each set is judged at
   the earlier load it stands for (prSameLoad), and shown as logged. Each
   record carries the date it was first reached; up to a date, the sessions
   on or before it only (a past workout, r55: its Heaviest line named a set
   from after its day). */
/** A lift's best estimate, heaviest set and rep records, with the newest date among them, or null with nothing logged. */
export function allTimeBestsIn(
  M: Model,
  id: string,
  upTo?: string
): {
  ex: ExerciseLike;
  est: (BestAt & { v: number }) | null;
  heavy: BestAt | null;
  front: BestAt[];
  last: string | undefined;
} | null {
  const all = IDXIn(M).byEx[id];
  // Since a new machine or gym, if one is marked: another machine's loads are no record here.
  const exps = all ? sinceNew(upTo ? all.filter(x => x.date <= upTo) : all) : all;
  if (!exps || !exps.length) return null;
  const ex = EXIn(M, id);
  return { ex, ...recordsOfIn(M, ex, exps) };
}

/* The best since you came back (V 2026-11-10: an old best is never denied, never made a goal, and the
   lifter sees when they hit new numbers): a lift's records over its sessions since its last long break, read as the
   board reads them (since a new machine or gym too), with the day it came back. None when it has had no long break,
   so a lift trained on through deloads and short breaks shows its bests as before. */
/** A lift's records since it came back from its last long break, and the day it came back; null with no long break. */
export function sinceBackIn(
  M: Model,
  id: string
): { from: string; est: (BestAt & { v: number }) | null; heavy: BestAt | null; first: boolean } | null {
  const all = IDXIn(M).byEx[id];
  const exps = all ? sinceNew(all) : [];
  const i = longBreakAt(exps);
  if (!i) return null;
  const back = exps.slice(i);
  const r = recordsOfIn(M, EXIn(M, id), back);
  return { from: back[0].date, est: r.est, heavy: r.heavy, first: back.length === 1 };
}

/** A lift's records over some of its sessions (in date order): its best estimate, heaviest set and rep records, each dated when first reached, and the newest of those dates. */
function recordsOfIn(
  M: Model,
  ex: ExerciseLike,
  exps: readonly Exposure[]
): { est: (BestAt & { v: number }) | null; heavy: BestAt | null; front: BestAt[]; last: string | undefined } {
  let est: (BestAt & { v: number }) | null = null,
    heavy: (BestAt & { j: number }) | null = null;
  const front: (BestAt & { j: number })[] = [];
  const seen = new Set<number>();
  for (const x of exps) {
    // Drop sets are left out, as the board's help says (r64: a block of drop sets alone was read).
    if (x.dropOnly) continue;
    const fresh: { p: ExPoint; j: number }[] = [];
    for (const p of x.pts) {
      // Judged at the load it stands for: the same weight in the other unit is no heavier.
      const d = prSameLoad(p.w, seen) - p.w,
        j = p.pl + d;
      const v = noE1(ex) || noBodyIn(M, ex) ? null : e1(p.load + d, p.r, p.rq);
      if (v != null && (!est || v > est.v + EPS_SAME)) est = { v, p, date: x.date, sid: x.sid };
      // Heaviest and rep records at the PR load (prLoad): on a bodyweight lift, by added load and reps, dated when first done.
      if (!heavy || j > heavy.j + EPS_SAME || (Math.abs(j - heavy.j) < EPS_SAME && p.r > heavy.p.r))
        heavy = { p, j, date: x.date, sid: x.sid };
      if (!front.some(q => q.j >= j - EPS_SAME && q.p.r >= p.r)) fresh.push({ p, j });
    }
    for (const { p, j } of fresh) {
      if (front.some(q => q.j >= j - EPS_SAME && q.p.r >= p.r)) continue;
      for (let k = front.length - 1; k >= 0; k--)
        if (j >= front[k].j - EPS_SAME && p.r >= front[k].p.r) front.splice(k, 1);
      front.push({ p, j, date: x.date, sid: x.sid });
    }
    for (const p of x.pts) seen.add(p.w);
  }
  front.sort((a, b) => b.j - a.j);
  const dates: string[] = front.map(f => f.date);
  if (est) dates.push(est.date);
  if (heavy) dates.push(heavy.date);
  const last = dates.sort().pop();
  return {
    est,
    heavy: heavy ? { p: heavy.p, date: heavy.date, sid: heavy.sid } : null,
    front: front.map(f => ({ p: f.p, date: f.date, sid: f.sid })),
    last
  };
}
