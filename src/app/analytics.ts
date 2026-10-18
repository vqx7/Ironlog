/* The analytics index and what it reads (phase 3b, r52; moved from the
   legacy script, tests/moved.js reads each back to r51's code): RIR as the
   analytics read it and the RIR checks, hard sets, bodyweight, IDX() and its
   six steps, a lift's bests up to a date, the Last line, and the sessions by
   date. Each function that reads the log, the date or a cache takes the model
   as its first parameter (model.ts). */

import type { Bodyweight, Rir, Session } from './types';
import type {
  CalStats,
  CalSummary,
  DateIndex,
  DayMeta,
  ExPoint,
  ExStat,
  Exposure,
  ExerciseLike,
  Idx,
  Model,
  Pr,
  Score
} from './model';
import { MK, SLOW_RECOVERY, bwShare, isCompound, loadMode, noE1 } from './library';
import { addDays, daysBetween, median, r1, weekStart } from './util';
import { EXIn, rirHalfOnIn, sortedSessionsIn } from './model';
import {
  BACK_DAYS,
  GROW_PCT,
  REP_PR_SHARE,
  atLoad,
  e1,
  isWork,
  repFloor,
  rtfBand,
  rtfOf,
  sameRR,
  setCredit,
  t90,
  tagged,
  trendE,
  workLoad
} from './formulas';
import { sameExOnce } from './session';
import { trendEnds, trendScope, trendW } from './trend';
import { planForIn } from './routines';
import { atCapOfIn, capOfIn } from './gym';
import { fmtDate } from './format';

/** A set's effort as these read it: its RIR as typed, and whether it was a RIR check. */
type Effort = { rir?: Rir; cal?: unknown };

/** A set as the hard-set count reads it: a working set's reps, marks and effort. */
type CountedSet = Effort & { r: number | string | null; warm?: boolean | undefined; drop?: boolean | undefined };

/** A set's load and reps as typed, as the load and tonnage read them. */
type LoadedSet = { w?: number | string | null | undefined; r?: number | string | null | undefined };

/** The sessions and the lighter ones in a week (idxAutoLighter, idxLightWeeks). */
type WeekCount = { n: number; l: number };

/** The bodyweight logged on or before a date, or null. */
export function bwKnownAtIn(M: Model, date: string): number | null {
  let best: Bodyweight | null = null;
  for (const b of M.s.bodyweights) if (b.date <= date && (!best || b.date >= best.date)) best = b;
  return best ? best.kg : null;
}

/** The bodyweight on a date: the last on or before it, else the first logged, or null. */
export function bwAtIn(M: Model, date: string): number | null {
  let best: Bodyweight | null = null,
    earliest: Bodyweight | null = null;
  for (const b of M.s.bodyweights) {
    if (b.date <= date && (!best || b.date >= best.date)) best = b;
    if (!earliest || b.date < earliest.date) earliest = b;
  }
  // One of the two is set whenever the test passes, as the ! says.
  return best || earliest ? (best || earliest)!.kg : null;
}

/* RIR as the analytics read it. Off: ignored everywhere, so every working set
   counts as hard and estimates use reps alone. On: as logged. Corrected: as
   logged, shifted by the median error of your recent calibration sets once
   there are at least two. The log itself is never changed, so switching modes
   is fully reversible. A calibration set is logged to failure and is never
   shifted. */
/* The correction is only applied to sets called at RIR 4 or less, because
   calibration sets measure the error close to failure, and a compound lift
   uses compound calibration sets when there are two or more (isolation
   likewise), else all of them. */
export function rirEffIn(M: Model, s: Effort, ex?: ExerciseLike | null): number | null {
  const m = M.s.settings.rirMode;
  if (m === 'off') return null;
  if (s.rir == null || s.rir === '') return null;
  const v = +s.rir;
  if (!isFinite(v)) return null;
  if (m === 'cal' && !s.cal && v <= 4) {
    const c = calStatsIn(M);
    const k = ex ? (isCompound(ex) ? 'c' : 'i') : null;
    const src = k && c.cls[k].recent >= 2 ? c.cls[k] : c;
    if (src.recent >= 2 && src.bias) return Math.min(10, Math.max(0, v + src.bias));
  }
  return v;
}

/* Calibration sets across your real sessions. err is reps actually left at the
   stopping point minus reps you called: positive means you stop with more in
   the tank than you think. People mostly under-call it by about a rep
   (Halperin 2022). The correction is the median of the last 8 from the past
   12 weeks, shrunk toward zero while there are few (x n/(n+3): 40% at 2 sets,
   73% at 8), rounded to half a rep and capped at 2 reps either way. */
export const CAL_WEEKS = 12;

/** The RIR checks of a list summed up: how many, their median error, the correction, the mean error. */
export function calSummary(list: readonly { err: number }[]): CalSummary {
  const last = list.slice(-8);
  const n = last.length;
  const med = n ? median(last.map(p => p.err)) : null;
  const shr = med == null ? 0 : (med * n) / (n + 3);
  // Rounded to the nearest half rep symmetrically: Math.round sends x.5 up,
  // which made +1.5 and -1.5 shrink to +1 and -0.5.
  return {
    recent: n,
    raw: med,
    bias: Math.max(-2, Math.min(2, (Math.sign(shr) * Math.round(Math.abs(shr) * 2)) / 2)),
    mae: n ? last.reduce((a, p) => a + Math.abs(p.err), 0) / n : null
  };
}

/** Every RIR check in the log, and those of compound and isolation lifts apart, built once per change. */
export function calStatsIn(M: Model): CalStats {
  if (M.c._cal) return M.c._cal;
  const pts: { date: string; err: number; c: 'c' | 'i' }[] = [];
  for (const s of M.s.sessions) {
    if (s.demo) continue;
    for (const b of s.ex) {
      const c = isCompound(EXIn(M, b.exId)) ? 'c' : 'i';
      for (const x of b.sets)
        if (x.cal && +x.r >= x.cal.at) pts.push({ date: s.date, err: +x.r - x.cal.at - x.cal.pred, c });
    }
  }
  pts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const cut = addDays(M.today(), -7 * CAL_WEEKS);
  const rec = pts.filter(p => p.date >= cut);
  M.c._cal = {
    ...calSummary(rec),
    n: pts.length,
    lastDate: pts.length ? pts[pts.length - 1].date : null,
    cls: { c: calSummary(rec.filter(p => p.c === 'c')), i: calSummary(rec.filter(p => p.c === 'i')) }
  };
  return M.c._cal;
}

/* A blank RIR, for estimates and the hard-set count. RIR is optional and
   opened with a tap, so most logs mix rated and blank sets. Reading every
   blank as 0 made the same 100 x 8 estimate lower when left blank than when
   rated 2, so trends dipped, stalls were flagged and PRs appeared just from
   whether RIR was tapped. A blank is instead read as your usual RIR on that
   lift: the median of your rated working sets of it (not warm-ups, drop sets
   or RIR checks) in the last 12 weeks, once there are at least 3. That is a
   convention, not a study figure. With fewer, a blank counts as hard and as 0
   for estimates, which errs low and never inflates a PR. Recovery and the
   "that load was light" step read only the RIR you entered, since both act on
   what you said about effort. RIR off: no ratings are read at all.
   Object.create(null) is typed any, so the two casts name the maps it makes;
   the median of three or more numbers is a number, as the ! says. */
export function rirUsualIn(M: Model, exId: string): number | null {
  if (M.s.settings.rirMode === 'off') return null;
  if (!M.c._rirUse) {
    M.c._rirUse = Object.create(null) as Record<string, number>;
    const cut = addDays(M.today(), -7 * CAL_WEEKS);
    const by = Object.create(null) as Record<string, number[]>;
    for (const ss of M.s.sessions) {
      if (ss.date < cut) continue;
      for (const b of ss.ex) {
        const ex = EXIn(M, b.exId);
        if (ex.timed) continue;
        for (const x of b.sets) {
          if (!isWork(x) || x.drop || x.cal) continue;
          const q = rirEffIn(M, x, ex);
          if (q != null) (by[b.exId] || (by[b.exId] = [])).push(q);
        }
      }
    }
    for (const k in by) if (by[k].length >= 3) M.c._rirUse[k] = median(by[k])!;
  }
  const v = M.c._rirUse[exId];
  return v == null ? null : v;
}

/** A set's RIR as read, else the lift's usual RIR for a blank, else null. */
export const rirEstIn = (M: Model, s: Effort, ex?: ExerciseLike | null): number | null => {
  const q = rirEffIn(M, s, ex);
  return q != null ? q : ex ? rirUsualIn(M, ex.id) : null;
};

/* Hard set: RIR 3 or less (Robinson 2024, Refalo 2023: growth rises as sets
   end closer to failure; the exact cut-off is a convention). A blank RIR is
   read as above and shown as assumed. A drop set is half a set: one heavy
   set with three drops is not four sets of work. */
export const isHardIn = (M: Model, s: CountedSet, ex?: ExerciseLike | null): boolean => {
  if (!isWork(s)) return false;
  const q = rirEstIn(M, s, ex);
  return q == null || q <= 3;
};

/* Count RIR 4 to 5 as half a set (r40, item 41; a setting, off by default).
   Any working set past RIR 3 counts half: calls top out at 5, but Corrected
   RIR can read a call of 4 as 5.5 or 6, and that set is no less hard than a
   call of 5 (the independent review of r40).
   Growth rises as sets end closer to failure (Robinson 2024), so sets a long
   way short still do something; half is a convention, not a measured dose.
   It moves the weekly hard sets, the bands they are read against and the
   plan's weekly sets, and nothing else: estimates, PRs, recovery and the
   per-session flag keep counting hard sets only. With RIR off every working
   set is hard already, so the setting has nothing to do. */
/** A set's weekly credit: a hard set's (a drop set half), or with RIR 4 to 5 as half a set on, half of it. */
export function hardCreditIn(M: Model, s: CountedSet, ex?: ExerciseLike | null): number {
  if (isHardIn(M, s, ex)) return setCredit(s);
  if (!rirHalfOnIn(M) || !isWork(s)) return 0;
  const q = rirEstIn(M, s, ex);
  return q != null && q > 3 ? setCredit(s) * 0.5 : 0;
}

/** The bodyweight part of a bodyweight lift's load on a date (0 on any other lift). */
export function bwLoadIn(M: Model, ex: ExerciseLike | null | undefined, date: string): number {
  return ex && ex.bw ? (bwAtIn(M, date) || 0) * bwShare(ex) : 0;
}

/** The total a set moved: its load as typed plus, on a bodyweight lift, that day's bodyweight share. */
export function loadOfIn(M: Model, ex: ExerciseLike | null | undefined, s: LoadedSet, date: string): number {
  // A row with no load reads as 0 through + and ||; the cast lets TypeScript accept the +.
  return bwLoadIn(M, ex, date) + (+(s.w as number) || 0);
}

/* PRs on a bodyweight lift are judged at one bodyweight (r32.1): the latest
   weigh-in, the same for every session. Each set's load includes the
   bodyweight of its day, so a weigh-in 0.4 kg up made the same 8 pull-ups or
   12 leg raises a new PR every week (8 identical weeks, 10 PRs counted), and
   the bests board dated a record to the heaviest day, not the first. A PR on
   these lifts is now more reps or more added load than before, as lifters
   count them. Since r34 estimates, trends, charts and the load engine are
   read at the latest weigh-in too (see IDX's pts); weight lifted keeps each
   day's. */
export const bwRefIn = (M: Model): number =>
  M.c._bwRef !== undefined ? M.c._bwRef : (M.c._bwRef = bwAtIn(M, '9999-12-31') || 0);

// The bodyweight part of a bodyweight lift's load at the latest weigh-in: what the engine and every reading use (r34).
export const bwRefLoadIn = (M: Model, ex: ExerciseLike | null | undefined): number =>
  ex && ex.bw ? bwRefIn(M) * bwShare(ex) : 0;

/** The load a set's PRs are judged at: on a bodyweight lift at the latest weigh-in, else loadOf. */
export function prLoadIn(M: Model, ex: ExerciseLike | null | undefined, s: LoadedSet, date: string): number {
  // A row with no load reads as 0 through + and ||; the cast lets TypeScript accept the +.
  return ex && ex.bw ? bwRefIn(M) * bwShare(ex) + (+(s.w as number) || 0) : loadOfIn(M, ex, s, date);
}

/* Weight actually moved by one set, for weekly totals. */
export function tonnageIn(M: Model, ex: ExerciseLike, s: LoadedSet, date?: string): number {
  const m = loadMode(ex);
  // A row with no load or reps reads as 0 through + and ||; the two casts let TypeScript accept the +.
  const w = +(s.w as number) || 0;
  // Assisted with no bodyweight logged would go below 0; weight lifted is then 0.
  /* Bodyweight known on or before the date only (r30): a first weigh-in
     logged today used to be applied to every earlier session, so weight
     lifted in past weeks changed after the fact (4,420 to 6,634 kg). */
  const known = bwKnownAtIn(M, date || M.today());
  const bl = ex && ex.bw && known != null ? known * bwShare(ex) : 0;
  const load = m === 'bw' ? Math.max(0, bl + w) : m === 'each' || m === 'side' ? w * 2 : w;
  // No reps reads as 0 the same way, which the cast lets TypeScript accept.
  return load * (+(s.r as number) || 0) * (ex.perSide ? 2 : 1);
}

/* The sessions on each date, in sessCmp order, and the count per week (r47).
   Built once per change beside the other analytics and read by every screen
   that groups sessions by day: the week bar, the calendar, the day picker,
   This month's title, Consistency's heatmap. Before r47 each grouped the log
   itself, and the week bar ordered a two-a-day by id where the day picker
   ordered it by start time. A cache of its own, cleared by invalidate() with
   IDX's, so IDX's object keeps r35's shape (tests/r36.js compares it). */
export function dateIndexIn(M: Model): DateIndex {
  if (M.c._dix) return M.c._dix;
  const byDate: Record<string, Session[]> = {},
    weekN: Record<string, number> = {};
  for (const x of sortedSessionsIn(M)) {
    (byDate[x.date] = byDate[x.date] || []).push(x);
    const w = weekStart(x.date);
    weekN[w] = (weekN[w] || 0) + 1;
  }
  return (M.c._dix = { byDate, weekN });
}

/* IDX() is everything the screens read, built once per change (r36: the
   one 420-line function split into its steps, each below, with no change to
   what comes out; tests/r36.js compares every number with r35 on random
   histories). */
export function IDXIn(M: Model): Idx {
  if (M.c._idx) return M.c._idx;
  const sessions = sortedSessionsIn(M);
  const V = idxSessionsIn(M, sessions);
  const byEx = V.byEx;
  const anchor = sessions.length ? sessions[sessions.length - 1].date : M.today();
  const winStart = addDays(anchor, -42);
  const wkAuto = idxAutoLighter(byEx);
  const lightWk = idxLightWeeks(sessions, wkAuto);
  const prs: Pr[] = [];
  const exStats: Record<string, ExStat> = {};
  for (const id of Object.keys(byEx)) {
    const maxBest = idxPRsIn(M, id, byEx[id], prs);
    exStats[id] = idxLiftIn(M, id, byEx[id], maxBest, anchor, winStart);
  }
  const scores = idxScoresIn(M, exStats);
  prs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  M.c._idx = {
    byEx,
    exStats,
    scores,
    prs,
    sessVol: V.sessVol,
    weekSets: V.weekSets,
    weekConf: V.weekConf,
    weekHard: V.weekHard,
    dayMus: V.dayMus,
    dayMeta: V.dayMeta,
    anchor,
    lightWk,
    rirCov: { logged: V.rirLogged, total: V.rirTotal }
  };
  return M.c._idx;
}

/* Step 1: every session in date order. Hard sets per week, per day and per
   muscle, and each lift's exposure (its working sets read as loads, the
   working load, the best estimate, the trend readings, weight lifted). */
export function idxSessionsIn(M: Model, sessions: readonly Session[]) {
  // weekSets counts every hard set (and, with rirHalf on, half of each set
  // past RIR 3: hardCredit, r40). weekConf counts only those whose RIR was
  // actually logged. A set with a blank RIR still counts as hard, because
  // most working sets are, but guessing a value would be inventing data -- so
  // the two are tracked apart and the dashboard shows how much of your volume
  // is assumption rather than measurement.
  // dayMus: hard sets per muscle per date, counted like weekSets. Pick for me
  // reads recovery and the last 7 days from it.
  // dayMeta: per date and muscle, what changes recovery time: sets taken to
  // failure, sets all left at 3+ RIR, slow-recovery lifts, a first exposure.
  const byEx: Record<string, Exposure[]> = {},
    sessVol: Idx['sessVol'] = [],
    weekSets: Record<string, Record<string, number>> = {},
    weekConf: Record<string, Record<string, number>> = {},
    dayMus: Record<string, Record<string, number>> = {},
    dayMeta: Record<string, Record<string, DayMeta>> = {},
    weekHard: Record<string, number> = {};
  const recentFrom = addDays(M.today(), -28);
  const seenEx = new Set<string>();
  let rirLogged = 0,
    rirTotal = 0;
  for (const ss of sessions) {
    let vol = 0;
    const wk = weekStart(ss.date);
    const ws = weekSets[wk] || (weekSets[wk] = {});
    const wc = weekConf[wk] || (weekConf[wk] = {});
    const dm = dayMus[ss.date] || (dayMus[ss.date] = {});
    const dx = dayMeta[ss.date] || (dayMeta[ss.date] = {});
    for (const b of sameExOnce(ss.ex)) {
      const ex = EXIn(M, b.exId);
      const novel = !seenEx.has(b.exId);
      const mus: [string, number][] = [[ex.primary, 1], ...ex.secondary.map((m): [string, number] => [m, 0.5])];
      for (const s of b.sets) {
        if (!isWork(s)) continue;
        // A saved set's RIR is a number or null, never '' (normalize), so the
        // test for '' never passes here; the cast widens it to the RIR as typed
        // so TypeScript accepts the test written for rows of a session too.
        const logged = M.s.settings.rirMode === 'off' || !(s.rir == null || (s.rir as Rir) === '');
        if (ss.date >= recentFrom) {
          rirTotal++;
          if (logged) rirLogged++;
        }
        const hard = isHardIn(M, s, ex);
        const cr = hard ? setCredit(s) : hardCreditIn(M, s, ex);
        if (!cr) continue;
        const q = rirEffIn(M, s, ex);
        weekHard[wk] = (weekHard[wk] || 0) + cr;
        for (const [m, f] of mus) {
          ws[m] = (ws[m] || 0) + f * cr;
          if (logged) wc[m] = (wc[m] || 0) + f * cr;
          // A half set from RIR 4 to 5 counts toward the week only; recovery and Pick for me read hard sets.
          if (!hard) continue;
          dm[m] = (dm[m] || 0) + f * cr;
          const o = dx[m] || (dx[m] = { fail: 0, easy: 0, hard: 0, slow: false, novel: false });
          o.hard++;
          if (q === 0) o.fail++;
          if (q != null && q >= 3) o.easy++;
          if (SLOW_RECOVERY.has(ex.id)) o.slow = true;
          if (novel) o.novel = true;
        }
      }
      seenEx.add(b.exId);
      const work = b.sets.filter(isWork);
      if (!work.length) continue;
      /* Drop sets are real work (they count toward hard sets and tonnage) but
         they are done fatigued at a reduced load, so they never feed e1RM,
         PRs, or next session's target. If a block is nothing but drop sets,
         use them rather than have no exposure at all. */
      const main = work.filter(s => !s.drop);
      const ptsSrc = main.length ? main : work;
      /* On a bodyweight lift every reading is at the latest weigh-in (r34,
         V: the right bodyweight pulled through everywhere): estimates, trends,
         charts, stalls, the lighter-week check and the load engine, as PRs
         already were (r32.1, prLoad). Read at each day's weigh-in, 8 kg lost
         on the scale read as unchanged push-ups being 10% weaker, with
         "look at recovery". Weight lifted (tonnage) keeps each day's weigh-in:
         that is the work actually done. */
      const pts = ptsSrc.map((s): ExPoint => {
        const pl = prLoadIn(M, ex, s, ss.date);
        return {
          load: ex.bw ? pl : loadOfIn(M, ex, s, ss.date),
          pl,
          r: +s.r,
          w: +s.w || 0,
          rir: rirEffIn(M, s, ex),
          rq: rirEstIn(M, s, ex)
        };
      });
      // Mean logged RIR on the sets at this session's top load, or null if none was logged.
      // The working load (r31): a heavy top single is not where reps are built.
      const topW = workLoad(pts, b.rr ? b.rr[0] : 0);
      const tr = pts.filter(p => Math.abs(p.w - topW) < 1e-6 && p.rir != null);
      const atTop = atLoad(pts, topW);
      // tr keeps only sets with a RIR, as the ! says.
      const topRir = tr.length ? tr.reduce((a, p) => a + p.rir!, 0) / tr.length : null;
      const topReps = atTop.reduce((a, p) => a + p.r, 0);
      // Reps lost from the first to the last set at the top load, in set order.
      const drop = atTop.length >= 2 ? atTop[0].r - atTop[atTop.length - 1].r : null;
      // Timed holds and joint-rotation bodyweight lifts have no 1RM, and
      // seconds times load is not tonnage. bb: rep band of the best set.
      let best: number | null = null,
        bb: number | null = null;
      if (!noE1(ex))
        for (const p of pts) {
          const v = e1(p.load, p.r, p.rq);
          if (v != null && (best == null || v > best)) {
            best = v;
            // A set with an estimate has reps to failure (e1 gives none without them), as the ! says.
            bb = rtfBand(rtfOf(p.r, p.rq)!);
          }
        }
      // The same at the PR load (prLoad): identical to best except on a bodyweight lift.
      let pb = best,
        pbb = bb;
      if (ex.bw) {
        pb = null;
        pbb = null;
        if (!noE1(ex))
          for (const p of pts) {
            const v = e1(p.pl, p.r, p.rq);
            if (v != null && (pb == null || v > pb)) {
              pb = v;
              // The same: an estimate means reps to failure, as the ! says.
              pbb = rtfBand(rtfOf(p.r, p.rq)!);
            }
          }
      }
      /* r30: the trend reads its own value per session, two ways. tAdj uses
         RIR as read everywhere else; tRaw ignores RIR (reps alone). Which one
         a lift's trend uses is decided per lift once its sessions are known
         (trendUse): RIR rated on most sets, or reps alone. Both reach 20 reps
         to failure (trendE), so a leg press done for 15 still has a trend. */
      /* r31: the reading is the average over the working sets, not the best
         one set. With the best set alone, a lifter on double progression who
         had set 1 at the top of the range and kept adding reps to sets 2 to
         4 read as flat, then stalled (the review: bench 36 to 39 total reps
         at 185, called stalled). A top single is left out, as above. */
      let tAdj: number | null = null,
        tRaw: number | null = null,
        topL = 0,
        rated = 0;
      if (!noE1(ex)) {
        const avg = (f: (p: ExPoint) => number | null): number | null => {
          const v = atTop.map(f).filter(x => x != null);
          return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
        };
        tAdj = avg(p => trendE(p.load, p.r, p.rq));
        tRaw = avg(p => trendE(p.load, p.r, 0));
      }
      for (const p of pts) {
        if (p.load > topL) topL = p.load;
        if (p.rir != null) rated++;
      }
      /* Timed holds count no weight lifted (their reps are seconds). Lifts with
         no 1RM estimate but real reps (leg raises, Nordics, sissy squats) count
         at their bodyweight share, as push-ups do (r34.2: they were left out
         without a word, so a calisthenics day read 3,500 lb light). */
      const v = ex && ex.timed ? 0 : work.reduce((a, s) => a + tonnageIn(M, ex, s, ss.date), 0);
      vol += v;
      (byEx[b.exId] || (byEx[b.exId] = [])).push({
        date: ss.date,
        sid: ss.id,
        pts,
        best,
        bb,
        pb,
        pbb,
        vol: v,
        n: work.length,
        topW,
        topRir,
        topReps,
        drop,
        deload: !!ss.deload,
        light: !!ss.light || !!b.light,
        rr: b.rr || null,
        topN: atTop.length,
        cut: !!b.cut,
        tAdj,
        tRaw,
        topL,
        rated
      });
    }
    sessVol.push({ date: ss.date, vol, id: ss.id, day: ss.dayName });
  }
  return { byEx, sessVol, weekSets, weekConf, dayMus, dayMeta, weekHard, rirLogged, rirTotal };
}

/* Step 2: sessions lighter than their lift's usual that nobody tagged. Marks
   each such exposure (auto, or keep for a new level) and returns the count per
   week. */
export function idxAutoLighter(byEx: Record<string, Exposure[]>): Record<string, WeekCount> {
  /* Lighter sessions nobody tagged (r30, from an independent review): an
     imported deload week, or one logged without the Deload or Lighter
     buttons, sat in every trend as a dip and made rising lifts read flat or
     stalled. A lift's session is read as lighter when its heaviest load is at
     least 10% under the heaviest of its previous three full sessions and its
     strength reading, reps alone, is at least 7% under theirs (both, so a
     lighter load for more reps, a rep range change, is not caught). A week in
     which at least half the lifts trained, and two or more, read lighter is
     read as a lighter week, all of it. These are conventions: a deload is
     usually 10% or more off the load (the app's own is about 90%), and day to
     day swings in estimated strength run 2 to 8% (Sigvaldsen 2023). Lighter
     sessions read this way are treated exactly like tagged ones: kept in
     history and charts, left out of trends, stalls and targets. */
  const wkAuto: Record<string, WeekCount> = {};
  for (const id of Object.keys(byEx)) {
    const exps = byEx[id];
    const prev: Exposure[] = [];
    let run: Exposure[] = [];
    for (const x of exps) {
      if (tagged(x)) continue;
      const k = weekStart(x.date);
      const o = wkAuto[k] || (wkAuto[k] = { n: 0, l: 0 });
      o.n++;
      const ref = prev.filter(q => sameRR(q.rr, x.rr)).slice(-3);
      if (ref.length >= 2) {
        const mL = Math.max(...ref.map(q => q.topL)),
          mT = Math.max(...ref.map(q => (q.tRaw == null ? -Infinity : q.tRaw)));
        if (mL > 0 && x.topL <= mL * 0.9 + 1e-9 && (x.tRaw == null || !isFinite(mT) || x.tRaw <= mT * 0.93 + 1e-9)) {
          x.auto = true;
          o.l++;
          run.push(x);
          /* Lighter sessions in a row for two weeks or more is a new level
             (a layoff, an injury, a new technique), not a deload: they count
             again, and what follows is compared with them. Counting sessions
             alone (three in a row) read a deload week on a lift trained three
             times a week as a new level, then as a 16% fall and a stall
             (r31, from the review). */
          if (run.length >= 3 && daysBetween(run[0].date, run[run.length - 1].date) >= 14) {
            for (const q of run) {
              q.auto = false;
              q.keep = true;
              wkAuto[weekStart(q.date)].l--;
            }
            prev.length = 0;
            prev.push(...run);
            run = [];
          }
          continue;
        }
      }
      run = [];
      prev.push(x);
    }
  }
  /* In a lighter week, a lift that was also lighter, by less than the
     thresholds above, is read as lighter too (a deload of 8%, say). A lift
     done at its usual load that week is not (r30 audit: a pushdown at its
     normal 50 x 12 was labelled lighter because the rest of the week was). */
  for (const id of Object.keys(byEx)) {
    const prev: Exposure[] = [];
    for (const x of byEx[id]) {
      if (tagged(x)) continue;
      if (x.auto || x.keep) {
        if (x.keep) prev.push(x);
        continue;
      }
      const o = wkAuto[weekStart(x.date)];
      const ref = prev.filter(q => sameRR(q.rr, x.rr)).slice(-3);
      if (o && o.l >= 2 && o.l * 2 >= o.n && ref.length) {
        const mL = Math.max(...ref.map(q => q.topL)),
          mT = Math.max(...ref.map(q => (q.tRaw == null ? -Infinity : q.tRaw)));
        if (x.topL < mL - 1e-6 || (x.tRaw != null && isFinite(mT) && x.tRaw < mT * 0.97)) {
          x.auto = true;
          continue;
        }
      }
      prev.push(x);
    }
  }
  return wkAuto;
}

/* Step 3: lighter weeks, tagged or read as lighter. */
export function idxLightWeeks(
  sessions: readonly Session[],
  wkAuto: Record<string, WeekCount>
): Record<string, boolean> {
  /* Lighter weeks (r30): every session in the week tagged deload or lighter,
     or the week read as lighter above. Weekly volume averages skip them: a
     deload halves the sets on purpose, and averaging it in read as "below
     target" for a month after every deload. */
  const lightWk: Record<string, boolean> = {};
  {
    const tag: Record<string, WeekCount> = {};
    for (const ss of sessions) {
      const k = weekStart(ss.date);
      const o = tag[k] || (tag[k] = { n: 0, l: 0 });
      o.n++;
      if (ss.deload || ss.light) o.l++;
    }
    for (const k in tag) if (tag[k].n && tag[k].l === tag[k].n) lightWk[k] = true;
    for (const k in wkAuto) {
      const o = wkAuto[k];
      if (o.l >= 2 && o.l * 2 >= o.n) lightWk[k] = true;
    }
  }
  return lightWk;
}

/* Step 4: one lift's PRs, in order, into prs (and each exposure's progress
   mark, which the stall test reads). Returns the lift's best estimate ever. */
export function idxPRsIn(M: Model, id: string, exps: Exposure[], prs: Pr[]): number | null {
  /* A rep PR is a set no earlier set matched on both load and reps. Keeping
     every earlier set to test that was O(exposures^2 x sets^2) and became
     seconds of work after a couple of years of logs. Only the non-dominated
     points can ever dominate anything, so keep just those. Same answers,
     and the frontier stays small. */
  const front: ExPoint[] = [];
  let maxBest: number | null = null,
    maxPb: number | null = null;
  const ex = EXIn(M, id);
  let prevMaxW = -Infinity,
    topSc = 0;
  /* Estimates drift with reps, so the same strength reads differently from a
     triple and from a set of 12. An e1RM PR is judged only against earlier
     bests from the same band of reps to failure (1-5, 6-10, 11-12), taken
     from the set itself, so a set that overshoots its planned range is
     judged where it landed. Rep PRs compare actual load and reps, which mean
     the same in any range, so they stay global. */
  const bestIn = (i: number): number | null => {
    let m: number | null = null;
    for (let k = 0; k < i; k++) {
      const q = exps[k];
      if (q.pb != null && q.pbb === exps[i].pbb) m = m == null ? q.pb : Math.max(m, q.pb);
    }
    return m;
  };
  const dominated = (p: ExPoint): boolean => front.some(q => q.pl >= p.pl - 1e-6 && q.r >= p.r);
  const addFront = (p: ExPoint): void => {
    if (dominated(p)) return;
    for (let k = front.length - 1; k >= 0; k--) if (p.pl >= front[k].pl - 1e-6 && p.r >= front[k].r) front.splice(k, 1);
    front.push(p);
  };
  exps.forEach((x, i) => {
    let repPR: ExPoint | null = null;
    // Every set in this exposure is judged against the frontier as it stood
    // before the exposure, so sets within one session cannot cancel each other.
    const sc = (q: ExPoint): number => e1(q.pl, q.r, q.rq) || q.pl * (1 + q.r / 30);
    /* r30: a rep PR counts only when the set is at least 90% of the
       strongest set logged before (by the same estimate), a convention.
       Any new load and rep pairing used to count, so 40 kg x 10 after
       95 kg x 5 was a PR and the demo showed 54 PRs in 14 days. */
    const floor = front.reduce((a, q) => Math.max(a, sc(q)), 0) * REP_PR_SHARE;
    if (i > 0) {
      for (const p of x.pts) {
        if (!dominated(p) && sc(p) >= floor - 1e-9 && (!repPR || sc(p) > sc(repPR))) repPR = p;
      }
    }
    const pb = bestIn(i);
    const e1PR = i > 0 && x.pb != null && pb != null && x.pb > pb + 1e-6;
    /* A weight PR (r29): more weight than any earlier working set of the
       lift, as logged (added load on a bodyweight lift, less help on an
       assisted one). It is also a rep PR by definition, so it used to show
       as one (V: "a new weight and rep PR in the same set marks it as a
       rep PR"). One label per lift and session, the biggest news first:
       weight PR, then best estimate, then rep PR. */
    const wPR =
      i > 0 && !ex.timed
        ? x.pts.filter(p => p.r > 0 && p.w > prevMaxW + 1e-6).sort((a, b) => b.w - a.w || b.r - a.r)[0]
        : null;
    x.progress = i > 0 && (!!repPR || e1PR || !!wPR);
    // What it beat, for the recap: the old heaviest, the old best in the same band, or the most reps at this load or heavier (0: never this heavy).
    /* big: a PR that is counted and announced (r32, from the third review:
       "8 new PRs" in a fifth session, 34 in 30 days after an import, since
       every load step was a weight PR and every added rep a rep PR). On a
       lift with a strength estimate that is a new best estimate; a heavier
       set or more reps without one stays in the list. Lifts with no
       estimate (timed, joint rotation) keep every kind. Stronger than
       ever is judged against every earlier set by the same score as the
       rep PR floor, so 100 x 9 after 100 x 8 counts though it moved into a
       new band of reps. */
    /* r34.2: a new best in a band alone no longer makes it big (from the
       review: triceps 80 x 10 after 75 x 15 was announced as a PR though the
       set was weaker; sets past 12 reps have no estimate, so it was the
       band's first). Only stronger than ever, as the r32 rule says. */
    const big = noE1(ex) || !!ex.timed || x.pts.some(q => sc(q) > topSc + 1e-9);
    // A deload or lighter day is lighter on purpose: its sets are never PRs (r32, second check: 90 x 12 on a Lighter day listed as one).
    const offPR = x.deload || x.light;
    // Each PR keeps its session (sid), so two sessions on one day never share one (r34.2), and the overall best before it (prevAll) beside the band's (prev).
    if (!offPR) {
      if (wPR)
        prs.push({
          date: x.date,
          sid: x.sid,
          exId: id,
          type: 'Weight PR',
          w: wPR.w,
          r: wPR.r,
          prevW: prevMaxW,
          value: e1PR ? x.pb : null,
          prev: e1PR ? pb : null,
          prevAll: maxPb,
          bb: x.pbb,
          big
        });
      else if (e1PR)
        prs.push({
          date: x.date,
          sid: x.sid,
          exId: id,
          type: 'e1RM',
          value: x.pb,
          prev: pb,
          prevAll: maxPb,
          bb: x.pbb,
          big
        });
      else if (repPR)
        prs.push({
          date: x.date,
          sid: x.sid,
          exId: id,
          type: 'Rep PR',
          w: repPR.w,
          r: repPR.r,
          prevR: front.filter(q => q.pl >= repPR.pl - 1e-6).reduce((a, q) => Math.max(a, q.r), 0),
          big
        });
    }
    if (x.pb != null) maxPb = maxPb == null ? x.pb : Math.max(maxPb, x.pb);
    for (const p of x.pts) if (p.r > 0) prevMaxW = Math.max(prevMaxW, p.w);
    for (const p of x.pts) topSc = Math.max(topSc, sc(p));
    for (const p of x.pts) addFront(p);
    if (x.best != null) maxBest = maxBest == null ? x.best : Math.max(maxBest, x.best);
  });
  return maxBest;
}

/* Step 5: one lift's trend, stall, signals and bests. */
export function idxLiftIn(
  M: Model,
  id: string,
  exps: Exposure[],
  maxBest: number | null,
  anchor: string,
  winStart: string
): ExStat {
  /* A deload session is lighter by design. It is charted and counted in
     volume, but it cannot stall a lift, bend its trend, or count as one of
     the three exposures that RIR drift and drop-off are read from. */
  /* Lighter sessions (half the sets, about 90% loads since r30) are left out for the same
     reason: fewer sets always look like less, and a session run short on
     purpose is not evidence of a stall. */
  const sc = trendScope(exps, anchor);
  const { real, curRR, inRange, lastReal } = sc;
  /* At the heaviest load the machine or rack has, progress moves to reps and
     then to harder reps (tempo, pauses, one side), which the load-based PR
     tests cannot see. Such a lift is marked capped rather than stalled. */
  const exI = EXIn(M, id);
  // r33: the top of the rack in Your gym is a cap too (review: a lift at the heaviest dumbbell read as stalled).
  const plC = planForIn(M, id);
  const capL = lastReal ? capOfIn(M, exI, plC, lastReal.topW) : null;
  const capped = !!lastReal && atCapOfIn(M, exI, plC, lastReal.topW, capL);
  /* RIR in the trend only where it is logged consistently (r30): on at
     least 80% of the lift's working sets in its last 8 sessions in range, a
     convention. Rated on some sets and blank on others, a 255 x 5 called
     RIR 3 read as strong as 270 x 5 called RIR 1, so the load going up
     15 lb showed as a stall. Otherwise the trend reads reps alone, the same
     way for every session. Bests, PRs and targets keep RIR as before. */
  const recent = inRange.slice(-8);
  const nPts = recent.reduce((a, x) => a + x.pts.length, 0),
    nRated = recent.reduce((a, x) => a + x.rated, 0);
  const useAdj = M.s.settings.rirMode !== 'off' && nPts > 0 && nRated / nPts >= 0.8;
  for (const x of exps) x.tv = useAdj ? x.tAdj : x.tRaw;
  /* Stalled: the fitted strength line over the last 6 real sessions (4 at
     least, widened to cover 21 days when 6 do not) in the current rep range,
     spanning 3 weeks or more, is flat or falling, and none of the last 3 of
     them set a PR or lifted more than the first session of that stretch
     (r30: double progression adds load and loses reps for a while, which a
     line through estimates reads as flat). A lift with no reading at all
     (timed, joint-rotation) keeps a count-based test: 4 or more sessions
     and no PR of any kind in the last 3. */
  const slopeOf = (list: readonly { date: string; tv: number }[]) => {
    const xs = list.map(x => daysBetween(list[0].date, x.date)),
      ys = list.map(x => x.tv);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n,
      my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0,
      sxx = 0;
    xs.forEach((xv, k) => {
      sxy += (xv - mx) * (ys[k] - my);
      sxx += (xv - mx) ** 2;
    });
    if (!(sxx > 0)) return null;
    const b = sxy / sxx;
    let rss = 0;
    xs.forEach((xv, k) => {
      const e = ys[k] - (my + b * (xv - mx));
      rss += e * e;
    });
    const se = n > 2 ? Math.sqrt(rss / (n - 2) / sxx) : null;
    return { b, se, my, n };
  };
  const withE1 = inRange.filter(x => x.tv != null);
  let stalled = false;
  /* Only a lift still being trained can be stalled: one not done in the
     last 42 days (counted from today and from the last session), or deleted
     or archived, used to stay stalled forever and kept the Coach calling
     for a deload (r27). */
  const current =
    !!lastReal &&
    lastReal.date >= winStart &&
    lastReal.date >= addDays(M.today(), -42) &&
    !exI.archived &&
    M.s.exercises.some(e => e.id === id);
  if (!capped && current) {
    const wE = withE1;
    if (wE.length >= 4) {
      const lastE = wE[wE.length - 1].date;
      let i0 = wE.length - 1;
      while (i0 > 0 && (wE.length - i0 < 6 || daysBetween(wE[i0].date, lastE) < 21)) i0--;
      const l = wE.slice(i0);
      if (daysBetween(l[0].date, lastE) >= 21) {
        /* More reps at the same working load over no more sets is progress
           too (r31): double progression adds reps to sets 2 to 4 once set 1
           is at the top of the range, and that is not a stall. Since r32
           it has to beat every earlier session at that load in the
           stretch, not only the first: a press alternating 6, 6, 6 and 5,
           5, 4 at one load for 7 weeks "moved" every other week. */
        const z = l[l.length - 1],
          a0 = l[0];
        const same = l.slice(0, -1).filter(x => Math.abs(x.topW - z.topW) < 1e-6 && x.topN >= z.topN);
        const moved =
          l.slice(-3).some(x => x.progress) ||
          z.topL > a0.topL + 1e-6 ||
          z.topW > a0.topW + 1e-6 ||
          (same.length > 0 && z.topReps > Math.max(...same.map(x => x.topReps)));
        /* Flat is under 0.1% a week (r31): averaging working sets leaves
           rounding dust, and identical sessions came out at +1e-32 a
           week, so a perfectly flat lift was not called stalled. */
        /* Since r32 the line is the median of the slopes between every
           pair of sessions (Theil and Sen), so one good or bad day does
           not set it: a squat at 20, 20, 30, 22, 24, 24 working reps read
           stalled from its one good day, and a press alternating 6s and
           5s read up from its last two. These sessions all have a reading
           (withE1), as the two ! below say. */
        const sen = (() => {
          const a: number[] = [];
          for (let i = 0; i < l.length; i++)
            for (let j = i + 1; j < l.length; j++) {
              const dd = daysBetween(l[i].date, l[j].date);
              if (dd > 0) a.push((l[j].tv! - l[i].tv!) / dd);
            }
          return a.length ? median(a) : null;
        })();
        // Every session in l has a reading (withE1), as the ! says.
        const my = l.reduce((a, x) => a + x.tv!, 0) / l.length;
        stalled = sen != null && my > 0 && ((sen * 7) / my) * 100 < 0.1 && !moved;
      }
    } else if (withE1.length < 2) stalled = inRange.length >= 4 && inRange.slice(-3).every(x => !x.progress);
  }
  const w = trendW(sc);
  let pct: number | null = null,
    slope: number | null = null,
    slopeSe: number | null = null,
    moving = false,
    falling = false,
    pLo: number | null = null,
    pHi: number | null = null,
    spanW: number | null = null,
    loadUp = false;
  /* A trend needs 3 sessions spread over 2 weeks or more (r31): three
     sessions in nine days read as "+6.6% a week" from what was mostly one
     good day. The text gives the weeks it really covers (spanW). */
  const spanD = w.length ? daysBetween(w[0].date, w[w.length - 1].date) : 0;
  if (w.length >= 3 && spanD >= 14) {
    spanW = Math.max(2, Math.round(spanD / 7));
    const ends = trendEnds(w);
    pct = (ends.last.tv / ends.first.tv - 1) * 100;
    // Slope in % of the mean per week, with its standard error. Moving or
    // falling needs 3% or more and the slope's 80% interval clear of zero.
    const f = slopeOf(w);
    if (f) {
      slope = ((f.b * 7) / f.my) * 100;
      slopeSe = f.se != null ? ((f.se * 7) / f.my) * 100 : null;
      const tq = t90(f.n - 2);
      const lo = slopeSe != null ? slope - tq * slopeSe : slope,
        hi = slopeSe != null ? slope + tq * slopeSe : slope;
      moving = pct >= GROW_PCT && lo > 0;
      falling = pct <= -GROW_PCT && hi < 0;
      // The weekly rate the 80% interval allows (r30): "about 1.5% a week,
      // likely 1.2 to 1.8" rather than one number stated as fact. It is
      // given on the weekly rate the line measures; a range on the 6-week
      // change beside an endpoint percentage could leave that percentage
      // outside its own range.
      if (slopeSe != null) {
        pLo = lo;
        pHi = hi;
      }
    }
    /* A heavier working load with the reps still in the range is progress
       that rep-max formulas disagree on, never a fall (r34.2, from the
       review: a lat pulldown from 90 x 14 to 95 x 10, on plan, read "down
       4%, look at recovery"; Brzycki says -10%, Lombardi +2%, all inside
       the 2 to 8% day-to-day noise). */
    const z = w[w.length - 1],
      a0 = w[0];
    const zr = z.pts.filter(p => Math.abs(p.w - z.topW) < 1e-6).map(p => p.r);
    if (z.topW > a0.topW + 1e-6 && zr.length && Math.min(...zr) >= (z.rr ? +z.rr[0] : 1) && pct < 0) {
      loadUp = true;
      falling = false;
      if (pHi != null && pHi < 0) {
        pLo = null;
        pHi = null;
      }
    }
  }
  /* RIR drift: the same load and at least the same reps across the last three
     exposures while logged RIR climbed by a full rep or more. e1RM cannot see
     this, but it is the clearest sign that the load is due to go up. */
  let easier: ExStat['easier'] = null;
  if (inRange.length >= 3) {
    const l3 = inRange.slice(-3);
    const sameW = l3.every(x => Math.abs(x.topW - l3[0].topW) < 1e-6);
    const allRir = l3.every(x => x.topRir != null);
    const repsHeld = l3.every(x => x.topReps >= l3[0].topReps);
    // Worked out before allRir is tested, so a missing top RIR compares as 0
    // here, and it counts only when all three have one: the casts let
    // TypeScript accept the comparison.
    const climbing =
      (l3[1].topRir as number) >= (l3[0].topRir as number) &&
      (l3[2].topRir as number) >= (l3[1].topRir as number) &&
      (l3[2].topRir as number) - (l3[0].topRir as number) >= 1;
    // Once allRir holds, each top RIR is there, as the ! say.
    if (sameW && allRir && repsHeld && climbing)
      easier = { w: l3[0].topW, from: r1(l3[0].topRir!), to: r1(l3[2].topRir!) };
  }
  /* Widening set-to-set drop-off at an unchanged load: the top set still goes
     up but the back sets fall away. That is a fatigue or rest-length signal,
     not lost strength, and no other number here shows it. */
  let fade: ExStat['fade'] = null;
  if (inRange.length >= 3) {
    const l3 = inRange.slice(-3);
    // Each drop is read only once all three are known, as the ! say.
    if (
      l3.every(x => Math.abs(x.topW - l3[0].topW) < 1e-6) &&
      l3.every(x => x.drop != null) &&
      l3[2].drop! - l3[0].drop! >= 2
    )
      fade = { w: l3[0].topW, from: l3[0].drop!, to: l3[2].drop! };
  }
  // best: the top e1RM in the current rep range, which is what targets and
  // the live PR badge compare against. bestAll ignores rep range.
  let bestCur: number | null = null;
  const byBand: Record<number, number> = {};
  for (const x of exps) {
    if (x.best == null) continue;
    if (sameRR(x.rr, curRR)) bestCur = bestCur == null ? x.best : Math.max(bestCur, x.best);
  }
  // A session with an estimate at the PR load has its band, as the ! say.
  for (const x of exps) if (x.pb != null) byBand[x.pbb!] = Math.max(byBand[x.pbb!] || 0, x.pb);
  // fresh: trained in the last 42 days, so its trend still says something about the muscle now.
  // Done within the last 4 weeks (r34.2: 42 days let a lift 6 weeks off still read "up" and project ahead after a break).
  const fresh = !!lastReal && lastReal.date >= addDays(M.today(), -BACK_DAYS);
  return {
    n: exps.length,
    stalled,
    pct,
    slope,
    slopeSe,
    moving,
    falling,
    pLo,
    pHi,
    spanW,
    loadUp,
    useAdj,
    fresh,
    byBand,
    wN: w.length,
    wSpan: w.length ? daysBetween(w[0].date, w[w.length - 1].date) : 0,
    last: real.length ? real[real.length - 1] : exps[exps.length - 1],
    best: bestCur,
    bestAll: maxBest,
    rr: curRR,
    easier,
    fade,
    capped
  };
}

/* Step 6: muscle scores from the lifts' trends. */
export function idxScoresIn(M: Model, exStats: Record<string, ExStat>): Score[] {
  // muscle scores
  // Direct work is authoritative. Secondary involvement is used only as a
  // fallback, so muscles trained indirectly (front delts, forearms, traps)
  // get a trend instead of sitting at "not enough data" forever. Rows scored
  // this way are flagged so the dashboard can say so.
  /* Each lift contributes its change only when that change is a clear trend
     (moving or falling). Since r30 a lift with a trend inside the noise is
     left out instead of counted as 0, and a muscle whose lifts are all
     inside the noise has no score (clear:false), shown as unclear. Counting
     them as 0 put "Chest +0%" beside a bench press up 10%, and "+0%, try 2
     more sets" on every muscle: not enough signal is not a measurement of
     zero. Lifts not trained in the last 42 days are left out. */
  const byMuscle: Record<string, number[]> = {},
    bySecondary: Record<string, number[]> = {},
    stallP: Record<string, boolean> = {},
    stallS: Record<string, boolean> = {},
    seenP: Record<string, number> = {},
    seenS: Record<string, number> = {},
    spanP: Record<string, number> = {},
    spanS: Record<string, number> = {};
  for (const [id, st] of Object.entries(exStats)) {
    const ex = EXIn(M, id);
    // A stall counts even on a lift with no estimate (its count-based test).
    if (st.stalled) {
      stallP[ex.primary] = true;
      for (const m of ex.secondary) stallS[m] = true;
    }
    if (st.pct == null || !st.fresh) continue;
    /* A muscle's trend needs a little more than a lift's (r32, from the third
       review: "Chest +4%, rising: hold this volume" after 3 sessions, off one
       extra rep): its lifts count once they have 4 sessions over 3 weeks or
       more in the window. */
    if (st.wN < 4 || st.wSpan < 21) continue;
    seenP[ex.primary] = (seenP[ex.primary] || 0) + 1;
    for (const m of ex.secondary) seenS[m] = (seenS[m] || 0) + 1;
    if (!(st.moving || st.falling)) continue;
    (byMuscle[ex.primary] || (byMuscle[ex.primary] = [])).push(st.pct);
    for (const m of ex.secondary) (bySecondary[m] || (bySecondary[m] = [])).push(st.pct);
    // The weeks a muscle's trend covers, said in its line: the longest of its lifts'.
    spanP[ex.primary] = Math.max(spanP[ex.primary] || 0, st.spanW || 0);
    for (const m of ex.secondary) spanS[m] = Math.max(spanS[m] || 0, st.spanW || 0);
  }
  const scoreMuscles: Record<string, { arr: number[]; n: number; indirect: boolean }> = {};
  for (const m of MK) {
    if (seenP[m]) scoreMuscles[m] = { arr: byMuscle[m] || [], n: seenP[m], indirect: false };
    else if ((seenS[m] || 0) >= 2) scoreMuscles[m] = { arr: bySecondary[m] || [], n: seenS[m], indirect: true };
    else if (stallP[m]) scoreMuscles[m] = { arr: [], n: 0, indirect: false };
  }
  // A list with something in it has a median, as the ! says.
  const scores: Score[] = Object.entries(scoreMuscles)
    .map(([m, o]) => ({
      m,
      score: o.arr.length ? median(o.arr)! : 0,
      clear: o.arr.length > 0,
      n: o.n,
      indirect: o.indirect,
      stall: !!(o.indirect ? stallS[m] : stallP[m]),
      wk: (o.indirect ? spanS[m] : spanP[m]) || null
    }))
    .sort((a, b) => b.score - a.score);
  /* The label used to be purely positional: bottom third of the list was
     "lagging" whatever the number said. So a muscle gaining 3% got a red
     "Lagging trend" flag in Weak points while Return on volume, which reads
     the same score against an absolute threshold, said "Growing. Hold this
     volume." on the same screen. Rank still breaks ties, but a muscle that is
     actually growing is never called lagging, and one that is actually going
     backwards is always called lagging even if the rest of the list is worse.
     In order below: going backwards is an absolute fact and does not need a
     ranking to be worth saying. A rising muscle is progressing (r30): ranked
     third or higher used to be needed too, so with eight muscles rising five
     read steady. A flat muscle is lagging only when one of its lifts has
     stalled (r29, a convention). By rank alone, the bottom third read
     "Lagging strength" in red while its lifts were gaining reps every
     session: sets above 12 reps to failure have no 1RM estimate, so high-rep
     isolation work shows no trend however well it is going (V: demotivating
     and not true). */
  scores.forEach(s => {
    // The same 3% boundary, inclusive, that marks a lift as moving or falling.
    const growing = s.clear && s.score >= GROW_PCT,
      declining = s.clear && s.score <= -GROW_PCT;
    if (declining) s.label = 'lagging';
    else if (growing) s.label = 'progressing';
    else s.label = s.stall ? 'lagging' : 'steady';
  });
  return scores;
}

/* "Last" is the most recent session of a lift, whatever kind (r26, V's
   rule): a trimmed, lighter, or deload session is what you did last, so it is
   what you look back at, labelled for what it was. Targets still come from
   the last full session (base), so trimmed, lighter and deload work never
   sets one. Grey reps and Copy last follow "Last" when its loads are the ones
   you lift (trimmed and lighter sessions keep the loads); after a deload they
   come from the last full session, since deload reps were at lighter loads.
   basis is the date the target came from, when it is not the session in
   "Last", so the logger can say so. */
export function lastOf(
  all: readonly Exposure[] | null | undefined,
  base: Exposure,
  fmt: (p: ExPoint) => string,
  repMin?: number
): { line: string; prev: string[]; prevOff: true | undefined; lastR: number[]; basis: string | null } {
  const rec = all && all.length ? all[all.length - 1] : base;
  const kind = rec.cut ? 'trimmed' : rec.light || rec.auto ? 'lighter' : rec.deload ? 'deload' : '';
  const line = `Last (${fmtDate(rec.date)}${kind ? ', ' + kind : ''}): ${rec.pts.map(fmt).join(', ')}.`;
  const repsFrom = rec !== base && (rec.deload || rec.light || rec.auto) ? base : rec;
  /* Grey reps are last time's reps at the working load only (r31): a top
     single before them is not a row to repeat, and in a pyramid the reps
     done at a lighter load are not reps due at this one (225 x 7, 205 x 8,
     185 x 10 asked 225 x 10). Rows past them take the set above, or the
     bottom of the range (greyR). */
  const wl = workLoad(repsFrom.pts, repMin || 0);
  const wp = atLoad(repsFrom.pts, wl);
  /* One bad set is not next time's plan (r32, from the third review: squat
     140 x 3, 6, 6 on 6-10 greyed (3)(6)(6), and one tap logged 140 x 3
     again). With one set under the range among the rest, that set shows the
     bottom of the range instead. */
  const fl = repFloor(wp.length ? wp : repsFrom.pts, repMin);
  /* prev: that session's sets at its working load, one per row, for the Last
     column beside the sets (r44). The same rule as the grey reps, so row n of
     Last is the set row n repeats: a top single or a pyramid's other loads
     would push every set down a row (the r44 review). prevOff says some sets
     are left out, so the line above the sets keeps listing them. */
  const rl = workLoad(rec.pts, repMin || 0);
  const rp = atLoad(rec.pts, rl);
  const shown = rp.length ? rp : rec.pts;
  return {
    line,
    prev: shown.map(fmt).slice(0, 30),
    prevOff: shown.length < rec.pts.length || undefined,
    lastR: (wp.length ? wp : repsFrom.pts).map(p => fl(p.r)),
    basis: rec !== base ? base.date : null
  };
}

// Sessions in the week, not days (r34): two plan days done on one day are two of the week's sessions.
// Counted once per change and kept with the analytics (dateIndex, r47; r46: the streak scanned every session for each of 104 weeks, twice a render).
export function weekSessionsIn(M: Model, ws: string): number {
  return dateIndexIn(M).weekN[ws] || 0;
}

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
