/* The analytics index and what it reads (phase 3b, r52; moved from the
   legacy script): RIR as the
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
  MissedPoint,
  Model,
  Pr,
  Score
} from './model';
import { MK, SLOW_RECOVERY, bwShare, isCompound, loadMode, noE1 } from './library';
import { addDays, daysBetween, median, r1, weekStart, EPS, EPS_SAME, WEEK_DAYS, PERCENT } from './util';
import { EXIn, activeRoutineIn, exInjuryIn, rirHalfOnIn, sortedSessionsIn } from './model';
import {
  BACK_DAYS,
  GROW_PCT,
  LIGHTER_LOAD,
  LIGHTER_READING,
  REP_PR_SHARE,
  afterBreak,
  prSameLoad,
  atLoad,
  e1,
  isMissed,
  isWork,
  lighter,
  repFloor,
  rtfBand,
  rtfOf,
  sameRR,
  setCredit,
  t90,
  trendE,
  workLoad,
  E1_MAX_RIR,
  HARD_RIR,
  HALF_SET,
  HELPER_CREDIT,
  TREND_DAYS,
  RECENT_DAYS,
  TREND_MIN,
  MUSCLE_TREND_MIN,
  FLAT_PCT_WEEK,
  STALL,
  LIGHTER_REF,
  USUAL_BEFORE,
  NEW_LEVEL,
  RIR_TREND,
  DRIFT_N,
  epley
} from './formulas';
import { sameExOnce } from './session';
import { trendEnds, trendScope, trendW } from './trend';
import { basePlanIn, routinePlanIn } from './routines';
import { atCapOfIn, capOfIn } from './gym';
import { fmtDate, missedTag } from './format';
import { EFFORT_TOP, LIMITS } from './records';

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
  if (m === 'cal' && !s.cal && v <= E1_MAX_RIR) {
    const c = calStatsIn(M);
    const k = ex ? (isCompound(ex) ? 'c' : 'i') : null;
    const src = k && c.cls[k].recent >= CAL_MIN ? c.cls[k] : c;
    if (src.recent >= CAL_MIN && src.bias) return Math.min(EFFORT_TOP, Math.max(0, v + src.bias));
  }
  return v;
}

/* Calibration sets across your real sessions. err is reps actually left at the
   stopping point minus reps you called: positive means you stop with more in
   the tank than you think. People mostly under-call it by about a rep
   (Halperin 2022). The correction is the median of the last CAL_N from the
   past CAL_WEEKS weeks, shrunk toward zero while there are few (x
   n/(n+CAL_SHRINK): 40% at 2 sets, 73% at 8), rounded to half a rep and capped
   at CAL_CAP reps either way; it applies once CAL_MIN checks are in, to sets
   called at E1_MAX_RIR or less, where the checks measure the error. Conventions. */
/** The RIR calibration's numbers, above. */
export const CAL_WEEKS = 12,
  CAL_N = 8,
  CAL_SHRINK = 3,
  CAL_CAP = 2,
  CAL_MIN = 2;

/** The RIR checks of a list summed up: how many, their median error, the correction, the mean error. */
export function calSummary(list: readonly { err: number }[]): CalSummary {
  const last = list.slice(-CAL_N);
  const n = last.length;
  const med = n ? median(last.map(p => p.err)) : null;
  const shr = med == null ? 0 : (med * n) / (n + CAL_SHRINK);
  // Rounded to the nearest half rep symmetrically: Math.round sends x.5 up,
  // which made +1.5 and -1.5 shrink to +1 and -0.5.
  return {
    recent: n,
    raw: med,
    bias: Math.max(-CAL_CAP, Math.min(CAL_CAP, (Math.sign(shr) * Math.round(Math.abs(shr) * 2)) / 2)),
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
  const cut = addDays(M.today(), -WEEK_DAYS * CAL_WEEKS);
  const rec = pts.filter(p => p.date >= cut);
  M.c._cal = {
    ...calSummary(rec),
    n: pts.length,
    lastDate: pts.length ? pts[pts.length - 1].date : null,
    cls: { c: calSummary(rec.filter(p => p.c === 'c')), i: calSummary(rec.filter(p => p.c === 'i')) }
  };
  return M.c._cal;
}

/** A lift's usual RIR is read once it has RIR_USUAL_MIN rated working sets in the last CAL_WEEKS weeks (r20, a convention). */
export const RIR_USUAL_MIN = 3;

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
    const cut = addDays(M.today(), -WEEK_DAYS * CAL_WEEKS);
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
    for (const k in by) if (by[k].length >= RIR_USUAL_MIN) M.c._rirUse[k] = median(by[k])!;
  }
  const v = M.c._rirUse[exId];
  return v == null ? null : v;
}

/** A set's RIR as read, else the lift's usual RIR for a blank, else null. */
export const rirEstIn = (M: Model, s: Effort, ex?: ExerciseLike | null): number | null => {
  const q = rirEffIn(M, s, ex);
  return q != null ? q : ex ? rirUsualIn(M, ex.id) : null;
};

/* Hard set: RIR HARD_RIR or less (Robinson 2024, Refalo 2023: growth rises as sets
   end closer to failure; the exact cut-off is a convention). A blank RIR is
   read as above and shown as assumed. A drop set is half a set: one heavy
   set with three drops is not four sets of work. */
export const isHardIn = (M: Model, s: CountedSet, ex?: ExerciseLike | null): boolean => {
  if (!isWork(s)) return false;
  const q = rirEstIn(M, s, ex);
  return q == null || q <= HARD_RIR;
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
  return q != null && q > HARD_RIR ? setCredit(s) * HALF_SET : 0;
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

/** Pick for me reads what each muscle got in the last PICK_DAYS days. */
export const PICK_DAYS = 7;

/** Recovery's rule of thumb (used only for ranking, by Pick for me) takes a day off when every hard set of a muscle stopped at RECOVERY_EASY_RIR or more in reserve. */
export const RECOVERY_EASY_RIR = 3;

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
  const winStart = addDays(anchor, -TREND_DAYS);
  idxAutoLighter(byEx);
  // Each session's day, for the plan of a lift on it (idxShort's cap on its usual sets).
  const dayOf: Record<string, string | null | undefined> = {};
  for (const x of sessions) dayOf[x.id] = x.dayId;
  idxShort(byEx, (id, x) => {
    const p = routinePlanIn(M, id, null, dayOf[x.sid]);
    return p ? +p.sets : null;
  });
  const lightWk = idxLightWeeks(sessions, byEx, M.s.deloadWeek);
  const prs: Pr[] = [];
  const exStats: Record<string, ExStat> = {};
  for (const id of Object.keys(byEx)) {
    const maxBest = idxPRsIn(M, id, byEx[id], prs);
    exStats[id] = idxLiftIn(M, id, byEx[id], maxBest, anchor, winStart, prs);
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
  // failure, sets all left at RECOVERY_EASY_RIR+ RIR, slow-recovery lifts, a first exposure.
  const byEx: Record<string, Exposure[]> = {},
    sessVol: Idx['sessVol'] = [],
    weekSets: Record<string, Record<string, number>> = {},
    weekConf: Record<string, Record<string, number>> = {},
    dayMus: Record<string, Record<string, number>> = {},
    dayMeta: Record<string, Record<string, DayMeta>> = {},
    weekHard: Record<string, number> = {};
  const recentFrom = addDays(M.today(), -RECENT_DAYS);
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
      const mus: [string, number][] = [
        [ex.primary, 1],
        ...ex.secondary.map((m): [string, number] => [m, HELPER_CREDIT])
      ];
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
          if (q != null && q >= RECOVERY_EASY_RIR) o.easy++;
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
      const point = (s: (typeof b.sets)[number]): ExPoint => {
        const pl = prLoadIn(M, ex, s, ss.date);
        return {
          load: ex.bw ? pl : loadOfIn(M, ex, s, ss.date),
          pl,
          r: +s.r,
          w: +s.w || 0,
          rir: rirEffIn(M, s, ex),
          rq: rirEstIn(M, s, ex)
        };
      };
      const pts = ptsSrc.map(point);
      /* Missed sets (r55, V): kept for the Last line alone, each with the
         number of the session's sets read before it, so the line lists every
         set in the order done. Nothing else reads them, and the field is
         absent when there are none. */
      const miss: MissedPoint[] = [];
      let seen = 0;
      for (const s of b.sets)
        if (ptsSrc.includes(s)) seen++;
        else if (!s.warm && !s.drop && isMissed(s)) miss.push({ ...point(s), at: seen });
      // Mean logged RIR on the sets at this session's top load, or null if none was logged.
      // The working load (r31): a heavy top single is not where reps are built.
      const topW = workLoad(pts, b.rr ? b.rr[0] : 0);
      const tr = pts.filter(p => Math.abs(p.w - topW) < EPS_SAME && p.rir != null);
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
        held: !!b.inj,
        rr: b.rr || null,
        ...(b.ps ? { ps: b.ps } : {}),
        topN: atTop.length,
        tAdj,
        tRaw,
        topL,
        rated,
        ...(miss.length ? { miss } : {})
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
  /* A lift on a deload or lighter day, or made lighter mid-session (r53, V
     2026-10-18: a session's label must not override what a lift actually
     did), done at its usual load and reps (atUsualWork) is not lighter: it
     is read as any other session of the lift, here and by V's one rule
     (idxShort, r54), so with its usual sets it is a full session for that
     lift, setting its targets, its trend, its stalls and its Last line, and
     with fewer it is short of its usual, its trend, stalls and PRs counting
     while its target repeats; the rest of the day stays lighter. Done
     lighter, at 90% for more reps say, or for fewer reps at its usual load,
     it stays lighter. Its label is kept (`tag`): with fewer sets than usual,
     half a deload's say, its week reads lighter (lighterTally), the sets
     cut on purpose. Read in the same pass as the loads (r54, PENDING 313
     b), so a lift counted there is one of the sessions later ones are
     compared with. A lift back after a break (afterBreak, more than
     BACK_DAYS since its session before) is compared with nothing before
     the break, since its usual from then is not its usual now (r54: the
     first session back read lighter than them). */
  const wkAuto: Record<string, WeekCount> = {};
  for (const id of Object.keys(byEx)) {
    const exps = byEx[id];
    const prev: Exposure[] = [];
    let run: Exposure[] = [];
    let before: Exposure | null = null;
    for (const x of exps) {
      if (afterBreak(before, x.date)) {
        prev.length = 0;
        run = [];
      }
      before = x;
      const ref = prev.filter(q => sameRR(q.rr, x.rr)).slice(-LIGHTER_REF);
      const k = weekStart(x.date);
      if (x.deload || x.light) {
        /* Its usual is the one V's rule reads a labelled session against
           (idxShort): the two sessions before it, not done lighter (PENDING
           338 2). Read against the best of three, 100 x 9 x 3 after 100 x
           10 x 3 and two of 100 x 8 x 3 was lighter on a Lighter day and
           set no target, where on any other day it set one. */
        if (!atUsualWork(x, ref.slice(-USUAL_BEFORE))) continue;
        x.tag = x.deload ? 'deload' : 'light';
        x.deload = false;
        x.light = false;
        (wkAuto[k] || (wkAuto[k] = { n: 0, l: 0 })).n++;
        prev.push(x);
        continue;
      }
      const o = wkAuto[k] || (wkAuto[k] = { n: 0, l: 0 });
      o.n++;
      if (ref.length >= 2) {
        const mL = Math.max(...ref.map(q => q.topL)),
          mT = Math.max(...ref.map(q => (q.tRaw == null ? -Infinity : q.tRaw)));
        if (
          mL > 0 &&
          x.topL <= mL * LIGHTER_LOAD + EPS &&
          (x.tRaw == null || !isFinite(mT) || x.tRaw <= mT * LIGHTER_READING + EPS)
        ) {
          x.auto = true;
          o.l++;
          run.push(x);
          /* Lighter sessions in a row for two weeks or more is a new level
             (a layoff, an injury, a new technique), not a deload: they count
             again, and what follows is compared with them. Counting sessions
             alone (three in a row) read a deload week on a lift trained three
             times a week as a new level, then as a 16% fall and a stall
             (r31, from the review). */
          if (
            run.length >= NEW_LEVEL.sessions &&
            daysBetween(run[0].date, run[run.length - 1].date) >= NEW_LEVEL.days
          ) {
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
    let before: Exposure | null = null;
    for (const x of byEx[id]) {
      if (afterBreak(before, x.date)) prev.length = 0;
      before = x;
      if (x.deload || x.light) continue;
      if (x.auto || x.keep) {
        if (x.keep) prev.push(x);
        continue;
      }
      const o = wkAuto[weekStart(x.date)];
      const ref = prev.filter(q => sameRR(q.rr, x.rr)).slice(-LIGHTER_REF);
      if (o && o.l >= 2 && o.l * 2 >= o.n && ref.length && !atUsualLoad(x, ref)) {
        x.auto = true;
        continue;
      }
      prev.push(x);
    }
  }
  return wkAuto;
}

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
   nothing added, an assisted one before any weigh-in), every working set. */
function setsAt(q: Exposure, usualW: number): number {
  let tw = -Infinity;
  for (const p of q.pts) if (Math.abs(p.w - q.topW) < EPS_SAME) tw = Math.max(tw, p.load);
  if (!(tw > 0)) return q.pts.length;
  let n = 0;
  for (const p of q.pts)
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
function readingOf(q: Exposure, k: number): number | null {
  if (q.tRaw == null) return null;
  let sum = 0,
    n = 0;
  for (const p of atLoad(q.pts, q.topW).slice(0, k)) {
    const t = trendE(p.load, p.r, 0);
    if (t != null) {
      sum += t;
      n++;
    }
  }
  return n ? sum / n : q.tRaw;
}
function repsOf(q: Exposure, k: number): number {
  const at = atLoad(q.pts, q.topW).slice(0, k);
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
   before r58) reads its own sets, as before. On a lift labelled
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
      if (afterBreak(last, x.date)) normal.length = 0;
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

/* What a lighter week is, read from what the lifts did (r53, V 2026-10-18,
   for the coach; since r54 one reading for the weekly averages, the coach
   and Stats). A session is lighter when half or more of its lifts were
   done lighter for the week: still deload or lighter once a lift at its
   usual load and reps is read as any other (step 2), read lighter from the
   loads, or labelled lighter or a deload and done with fewer sets than
   usual at its usual load (r54: the sets cut on purpose, which V's one rule
   reads as short of the usual for the lift's target and trend, are still
   a lighter week's, as r53 read them; a deload week of half the sets at
   full load was averaged in as a week under target). Per week: its sessions, those lighter, and
   the run of deload sessions done lighter at its end, a deload session
   being one tagged deload or any in the week marked as one (a blank or
   Freestyle session there is not tagged). Sessions in date order, as
   sortedSessionsIn gives them. */
/** Each week's sessions, lighter sessions and closing run of lighter deload sessions, and whether a session was lighter. */
export function lighterTally(
  sessions: readonly Session[],
  byEx: Partial<Record<string, Exposure[]>>,
  deloadWeek: string | null
): { weeks: Record<string, { all: number; light: number; tail: number }>; lighter: (sid: string) => boolean } {
  const lifts: Record<string, number> = {},
    done: Record<string, number> = {};
  for (const xs of Object.values(byEx))
    for (const x of xs || []) {
      lifts[x.sid] = (lifts[x.sid] || 0) + 1;
      if (lighter(x) || (x.tag != null && x.short === 'sets')) done[x.sid] = (done[x.sid] || 0) + 1;
    }
  const lit = (sid: string): boolean => (done[sid] || 0) > 0 && (done[sid] || 0) * 2 >= (lifts[sid] || 0);
  const weeks: Record<string, { all: number; light: number; tail: number }> = {};
  for (const x of sessions) {
    const k = weekStart(x.date);
    const w = weeks[k] || (weeks[k] = { all: 0, light: 0, tail: 0 });
    w.all++;
    if (lit(x.id)) {
      w.light++;
      w.tail = x.deload || k === deloadWeek ? w.tail + 1 : 0;
    } else w.tail = 0;
  }
  return { weeks, lighter: lit };
}

/* Step 3: lighter weeks (r30). Weekly volume averages skip them: a deload
   halves the sets on purpose, and averaging it in read as below target for a
   month after every deload. Since r54 a week is lighter when more than half
   its sessions were, or its last two or more were deload sessions done
   lighter (lighterTally), the reading the coach holds a deload back by, so
   the averages leave out a deload begun mid-week, which they kept, and keep
   a week of deload sessions done at full for every lift, which they left out
   by its labels (the audit V asked for: four weeks of "add sets" after a
   deload tapped on a Thursday, for a lifter doing every planned set). */
export function idxLightWeeks(
  sessions: readonly Session[],
  byEx: Record<string, Exposure[]>,
  deloadWeek: string | null
): Record<string, boolean> {
  const lightWk: Record<string, boolean> = {};
  const T = lighterTally(sessions, byEx, deloadWeek).weeks;
  for (const k in T) if (T[k].light * 2 > T[k].all || T[k].tail >= 2) lightWk[k] = true;
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
  const bestIn = (i: number, band: number | null): number | null => {
    let m: number | null = null;
    for (let k = 0; k < i; k++) {
      const q = exps[k];
      if (q.pb != null && q.pbb === band) m = m == null ? q.pb : Math.max(m, q.pb);
    }
    return m;
  };
  const dominated = (p: ExPoint): boolean => front.some(q => q.pl >= p.pl - EPS_SAME && q.r >= p.r);
  const addFront = (p: ExPoint): void => {
    if (dominated(p)) return;
    for (let k = front.length - 1; k >= 0; k--)
      if (p.pl >= front[k].pl - EPS_SAME && p.r >= front[k].r) front.splice(k, 1);
    front.push(p);
  };
  // Every load logged in the sessions before, for prSameLoad (r54).
  const seen = new Set<number>();
  exps.forEach((x, i) => {
    let repPR: ExPoint | null = null;
    // Every set in this exposure is judged against the frontier as it stood
    // before the exposure, so sets within one session cannot cancel each other.
    const sc = (q: ExPoint): number => e1(q.pl, q.r, q.rq) || epley(q.pl, q.r);
    /* Each set at the load its PRs judge it at (prSameLoad, r54: changing
       units or gyms is not a PR), and as logged (at), which the PR list
       shows. The earlier sets stay as logged: a set is only ever judged
       lighter, so this can take a PR away and never make one. */
    const judged = x.pts.map(p => {
      const w = prSameLoad(p.w, seen);
      return { p: w === p.w ? p : { ...p, w, pl: p.pl + (w - p.w) }, at: p };
    });
    const pts = judged.map(j => j.p);
    const asLogged = (q: ExPoint): ExPoint => (judged.find(j => j.p === q) || { at: q }).at;
    /* r30: a rep PR counts only when the set is at least 90% of the
       strongest set logged before (by the same estimate), a convention.
       Any new load and rep pairing used to count, so 40 kg x 10 after
       95 kg x 5 was a PR and the demo showed 54 PRs in 14 days. */
    const floor = front.reduce((a, q) => Math.max(a, sc(q)), 0) * REP_PR_SHARE;
    if (i > 0) {
      for (const p of pts) {
        if (!dominated(p) && sc(p) >= floor - EPS && (!repPR || sc(p) > sc(repPR))) repPR = p;
      }
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
    const pb = bestIn(i, bandJ);
    const e1PR = i > 0 && pbJ != null && pb != null && pbJ > pb + EPS_SAME;
    /* A weight PR (r29): more weight than any earlier working set of the
       lift, as logged (added load on a bodyweight lift, less help on an
       assisted one). It is also a rep PR by definition, so it used to show
       as one (V: "a new weight and rep PR in the same set marks it as a
       rep PR"). One label per lift and session, the biggest news first:
       weight PR, then best estimate, then rep PR. Of the sets at the new
       weight, the strongest by the same score (r55, from the audit: the
       recap named 82.5 x 11 beside the estimate of 82.5 x 10, the set the live
       toast named, as reps alone had picked it). */
    const wJ =
      i > 0 && !ex.timed
        ? pts
            .filter(p => p.r > 0 && p.w > prevMaxW + EPS_SAME)
            .sort((a, b) => b.w - a.w || sc(b) - sc(a) || b.r - a.r)[0]
        : null;
    const wPR = wJ ? asLogged(wJ) : null;
    // Any record at all (heavier, a best for its reps, more reps at a load): the stall test's sign the lift moved. Since r58 (343 6) no screen calls it a PR; a PR is `big`.
    x.progress = i > 0 && (!!repPR || e1PR || !!wPR);
    // What it beat, for the recap: the old heaviest, the old best in the same band, or the most reps at this load or heavier (0: never this heavy).
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
       100 x 8 counts though it moved into a new band of reps. */
    /* r34.2: a new best in a band alone no longer makes it big (from the
       review: triceps 80 x 10 after 75 x 15 was announced as a PR though the
       set was weaker; sets past 12 reps have no estimate, so it was the
       band's first). Only stronger than ever, as the r32 rule says. */
    const big = noE1(ex) || !!ex.timed || (!!ex.bw && !pts.some(q => q.pl > 0)) || pts.some(q => sc(q) > topSc + EPS);
    /* A PR is a PR whatever the day is called (r53, V 2026-10-18: a set
       stronger than any before it, logged on a Lighter day, was not
       counted). r32 kept every PR off deload and lighter days after a weaker
       set on one was listed as a PR; since r34.2 only a set stronger than
       every earlier one is counted and announced (big), and a heavier set
       without one is said once, quietly (Heaviest yet), so the day's label
       decides nothing here. */
    // Each PR keeps its session (sid), so two sessions on one day never share one (r34.2), and the overall best before it (prevAll) beside the band's (prev).
    if (wPR)
      prs.push({
        date: x.date,
        sid: x.sid,
        exId: id,
        type: 'Weight PR',
        w: wPR.w,
        r: wPR.r,
        prevW: prevMaxW,
        value: e1PR ? shown : null,
        prev: e1PR ? pb : null,
        prevAll: maxPb,
        bb: bandJ,
        big
      });
    else if (e1PR)
      prs.push({
        date: x.date,
        sid: x.sid,
        exId: id,
        type: 'e1RM',
        value: shown,
        prev: pb,
        prevAll: maxPb,
        bb: bandJ,
        big
      });
    else if (repPR)
      prs.push({
        date: x.date,
        sid: x.sid,
        exId: id,
        type: 'Rep PR',
        w: asLogged(repPR).w,
        r: repPR.r,
        prevR: front.filter(q => q.pl >= repPR.pl - EPS_SAME).reduce((a, q) => Math.max(a, q.r), 0),
        big
      });
    if (x.pb != null) maxPb = maxPb == null ? x.pb : Math.max(maxPb, x.pb);
    for (const p of x.pts) if (p.r > 0) prevMaxW = Math.max(prevMaxW, p.w);
    for (const p of x.pts) topSc = Math.max(topSc, sc(p));
    for (const p of x.pts) addFront(p);
    for (const p of x.pts) seen.add(p.w);
    if (x.best != null) maxBest = maxBest == null ? x.best : Math.max(maxBest, x.best);
  });
  return maxBest;
}

/* The sessions the stall test reads a lift with a strength reading over
   (r30, r31): its last 6 in the range, widened to cover 21 days when 6 do
   not, at least 4; none when they still do not reach 21 days. One rule for
   the test (idxLiftIn) and the coach's words about it (r54, from the audit V
   asked for: "for 3 weeks" was said of a lift flat for ten). */
/** The stretch of sessions a stall is read over, or null when there is none. */
export function stallStretch<X extends { date: string }>(wE: readonly X[]): X[] | null {
  if (wE.length < STALL.min) return null;
  const lastE = wE[wE.length - 1].date;
  let i0 = wE.length - 1;
  while (i0 > 0 && (wE.length - i0 < STALL.sessions || daysBetween(wE[i0].date, lastE) < STALL.days)) i0--;
  const l = wE.slice(i0);
  return daysBetween(l[0].date, lastE) >= STALL.days ? l : null;
}

/* The sessions in a range the stall test reads a strength reading over: those
   with one, not held for an injury (r54, PENDING 311 g). One list for the
   test (idxLiftIn) and for the span it says it read (stallSpans): from the
   independent review of r54, the span still counted the held sessions. */
const stallReads = (inR: readonly Exposure[]): Exposure[] => inR.filter(x => !x.held && x.tv != null);

/* The stretch the stall test read in each of a lift's ranges (stallScopesIn):
   its span in weeks, and whether it ends at the lift's newest session in the
   range; it ends earlier when held sessions came after it. Its readings are
   the ones IDX set on its sessions. */
function stallSpans(M: Model, id: string): { weeks: number; last: boolean }[] {
  const I = IDXIn(M);
  const out: { weeks: number; last: boolean }[] = [];
  for (const q of stallScopesIn(M, id, trendScope(I.byEx[id] || [], M.today()))) {
    const l = stallStretch(stallReads(q.inR));
    if (l)
      out.push({
        weeks: Math.round(daysBetween(l[0].date, l[l.length - 1].date) / WEEK_DAYS),
        last: l[l.length - 1] === q.inR[q.inR.length - 1]
      });
  }
  return out;
}

/* How many weeks the stall test read a lift over: its stretch's span, or
   null for a lift with no strength reading, which the count test reads over
   its last 3 sessions (r54, from the audit V asked for: the coach and the
   headline said "3 weeks" of a lift flat for ten). On two rep ranges,
   stalled only while both are, so for as long as the shorter. */
/** The weeks a lift's stall stretch spans, or null when it is read by count. */
export function stallWeeksIn(M: Model, id: string): number | null {
  const s = stallSpans(M, id);
  return s.length ? Math.min(...s.map(x => x.weeks)) : null;
}

/* How long a lift has stalled, in the words the coach and its headline on
   Stats both say: over the last N weeks when the stretch the test read ends
   at the lift's newest session, over N weeks when sessions held for an
   injury came after it (from the independent review of r54: "the last"
   weeks then were the injury's), over its last 3 sessions on a lift read by
   count. Until r54's review the coach and the headline each wrote it. */
/** The span a lift's stall was read over, in words. */
export function stallWordsIn(M: Model, id: string): string {
  const s = stallSpans(M, id);
  if (!s.length) return `over its last ${STALL.noProgress} sessions`;
  const q = s.reduce((a, b) => (b.weeks < a.weeks ? b : a));
  return q.last ? `over the last ${q.weeks} weeks` : `over ${q.weeks} weeks`;
}

/* The rep ranges a lift's stall is read in (r54, V 2026-10-18: "stalled only
   if every range is"): its newest session's, as the trend's, and each other
   the routine plans it at, a heavy day and a light day say, while the lift
   has a session in it within 42 days of its newest (as targets read a range
   in use, r27), each with its sessions not done lighter since the lift's
   last break. Until r54 only the newest session's range was read, so a lift
   could read stalled midweek and not at the weekend. */
/** The rep ranges a lift's stall is read in, each with its sessions. */
export function stallScopesIn(
  M: Model,
  id: string,
  sc: Pick<ReturnType<typeof trendScope>, 'real' | 'curRR' | 'inRange' | 'lastReal' | 'from'>
): { rr: [number, number] | null; inR: Exposure[] }[] {
  const out: { rr: [number, number] | null; inR: Exposure[] }[] = [{ rr: sc.curRR, inR: sc.inRange }];
  const last = sc.lastReal;
  if (!last) return out;
  const exact = (a: readonly number[] | null, b: readonly number[]): boolean => !!a && a[0] === b[0] && a[1] === b[1];
  for (const d of activeRoutineIn(M).days)
    for (const it of d.items) {
      if (it.exId !== id) continue;
      const rr: [number, number] = [+it.repMin, +it.repMax];
      if (out.some(q => q.rr && exact(q.rr, rr))) continue;
      const inR = sc.real.filter(x => sameRR(x.rr, rr) && x.date >= sc.from);
      if (inR.some(x => exact(x.rr, rr) && x.date >= addDays(last.date, -TREND_DAYS))) out.push({ rr, inR });
    }
  return out;
}

/* Step 5: one lift's trend, stall, signals and bests. */
export function idxLiftIn(
  M: Model,
  id: string,
  exps: Exposure[],
  maxBest: number | null,
  anchor: string,
  winStart: string,
  prs: readonly Pr[]
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
  const plC = basePlanIn(M, id);
  const capL = lastReal ? capOfIn(M, exI, plC, lastReal.topW) : null;
  const capped = !!lastReal && atCapOfIn(M, exI, plC, lastReal.topW, capL);
  /* RIR in the trend only where it is logged consistently (r30): on at
     least 80% of the lift's working sets in its last 8 sessions in range, a
     convention. Rated on some sets and blank on others, a 255 x 5 called
     RIR 3 read as strong as 270 x 5 called RIR 1, so the load going up
     15 lb showed as a stall. Otherwise the trend reads reps alone, the same
     way for every session. Bests, PRs and targets keep RIR as before. */
  const recent = inRange.slice(-RIR_TREND.sessions);
  const nPts = recent.reduce((a, x) => a + x.pts.length, 0),
    nRated = recent.reduce((a, x) => a + x.rated, 0);
  const useAdj = M.s.settings.rirMode !== 'off' && nPts > 0 && nRated / nPts >= RIR_TREND.share;
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
  let stalled = false;
  /* Only a lift still being trained can be stalled: one not done in the
     last 42 days (counted from today and from the last session), or deleted
     or archived, used to stay stalled forever and kept the Coach calling
     for a deload (r27). Nor one held for a flagged injury (r53, from the
     audit V asked for): the engine keeps it at last time's load on purpose,
     and three weeks of doing as told read as a stall to change the range. */
  const current =
    !!lastReal &&
    lastReal.date >= winStart &&
    lastReal.date >= addDays(M.today(), -TREND_DAYS) &&
    !exI.archived &&
    M.s.exercises.some(e => e.id === id) &&
    !exInjuryIn(M, exI);
  /* A PR is movement whatever the day (r53, V 2026-10-18: a PR is a PR
     whenever it happens). A session where the lift was done lighter is left
     out of the stretch (and until r54 a trimmed one), and its PR went with it, so a lift
     that set one on yesterday's Lighter day read stalled beside it in Recent
     PRs (the fifth review). The sessions left out, in the range, since the
     third-last session of the stretch: on a lift with a reading, one of
     them with a PR that Recent PRs lists (big, stronger than ever) counts as
     movement, since a set that only beat earlier ones at its own lighter
     load, 90 x 9 after 100 x 8, is no sign a plateau has ended and took a
     deload the lifts needed away again (the sixth review); on a lift with
     none, any PR, as for the sessions of the stretch. */
  const listed = (x: Exposure): boolean => prs.some(p => p.big && p.sid === x.sid && p.exId === id);
  /* The test in one rep range, on its sessions since the last break (all):
     a lift trained in two (a heavy day and a light day) is stalled only when
     it is stalled in each, as each range has its own targets (r54, V
     2026-10-18; stallScopesIn). A session held for a flagged injury, its
     load capped on purpose, is left out as one done lighter is (r54, PENDING
     311 g: once the injury was cleared, the held weeks read as a stall). */
  const stalledIn = (rr: [number, number] | null, all: readonly Exposure[]): boolean => {
    const inR = all.filter(x => !x.held);
    const withE1 = stallReads(all);
    const offSince = (from: string): Exposure[] =>
      exps.filter(x => (lighter(x) || x.held) && sameRR(x.rr, rr) && x.date >= from);
    const l = stallStretch(withE1);
    if (l) {
      /* More reps at the same working load over no more sets is progress
           too (r31): double progression adds reps to sets 2 to 4 once set 1
           is at the top of the range, and that is not a stall. Since r32
           it has to beat every earlier session at that load in the
           stretch, not only the first: a press alternating 6, 6, 6 and 5,
           5, 4 at one load for 7 weeks "moved" every other week. */
      const z = l[l.length - 1],
        a0 = l[0];
      const same = l.slice(0, -1).filter(x => Math.abs(x.topW - z.topW) < EPS_SAME && x.topN >= z.topN);
      const moved =
        l.slice(-STALL.noProgress).some(x => x.progress) ||
        offSince(l[l.length - STALL.noProgress].date).some(listed) ||
        z.topL > a0.topL + EPS_SAME ||
        z.topW > a0.topW + EPS_SAME ||
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
      return sen != null && my > 0 && ((sen * WEEK_DAYS) / my) * PERCENT < FLAT_PCT_WEEK && !moved;
    }
    return (
      withE1.length < 2 &&
      inR.length >= STALL.min &&
      inR.slice(-STALL.noProgress).every(x => !x.progress) &&
      !offSince(inR[inR.length - STALL.noProgress].date).some(x => x.progress)
    );
  };
  if (!capped && current) stalled = stallScopesIn(M, id, sc).every(q => stalledIn(q.rr, q.inR));
  /* The trend in one rep range, over its sessions with a reading in the
     window (trendW): the change and the weekly rate, moving or falling, and
     a heavier load read as no fall. */
  const trendOf = (w: (Exposure & { tv: number })[]) => {
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
       good day. The text gives the weeks it really covers (spanW). A
       bodyweight lift needs a weigh-in too (r55, found while fixing the
       audit's C10): with none its readings are the added load alone, so
       pull-ups from BW+10 to BW+17.5 read as 40% stronger, where at an 80 kg
       weigh-in they are 5%. Goals have said so since r40 (goalState). */
    const spanD = w.length ? daysBetween(w[0].date, w[w.length - 1].date) : 0;
    if (w.length >= TREND_MIN.sessions && spanD >= TREND_MIN.days && !(exI.bw && !(bwRefIn(M) > 0))) {
      spanW = Math.max(2, Math.round(spanD / WEEK_DAYS));
      const ends = trendEnds(w);
      pct = (ends.last.tv / ends.first.tv - 1) * PERCENT;
      // Slope in % of the mean per week, with its standard error. Moving or
      // falling needs 3% or more and the slope's 80% interval clear of zero.
      const f = slopeOf(w);
      if (f) {
        slope = ((f.b * WEEK_DAYS) / f.my) * PERCENT;
        slopeSe = f.se != null ? ((f.se * WEEK_DAYS) / f.my) * PERCENT : null;
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
      const zr = z.pts.filter(p => Math.abs(p.w - z.topW) < EPS_SAME).map(p => p.r);
      if (z.topW > a0.topW + EPS_SAME && zr.length && Math.min(...zr) >= (z.rr ? +z.rr[0] : 1) && pct < 0) {
        loadUp = true;
        falling = false;
        if (pHi != null && pHi < 0) {
          pLo = null;
          pHi = null;
        }
      }
    }
    return { pct, slope, slopeSe, moving, falling, pLo, pHi, spanW, loadUp };
  };
  const w = trendW(sc);
  const t = trendOf(w);
  const { pct, slope, slopeSe, moving, pLo, pHi, spanW, loadUp } = t;
  /* A lift trained in two rep ranges, a heavy day and a light day, reads
     falling only when it falls in each range in use, as it reads stalled
     (r55, V 2026-10-19, PENDING 319): its trend is read in its newest
     session's range, so until r55 Stats and the coach said "falling" after
     the light day and "up" after the heavy one. rrIn is the range the trend
     is read in when the lift is trained in more than one, so the screens
     name it; holdRR, when the trend falls there, the other ranges in use
     where it does not, and quietRR those with too few sessions for a trend
     (r55, the review: a range trained once was said to be "not" down, a
     claim with no reading behind it). Either keeps it from reading falling,
     as a range in use with too few sessions keeps it from reading stalled. */
  const scopes = stallScopesIn(M, id, sc);
  const rrIn = scopes.length > 1 ? curRR : null;
  const holdRR: [number, number][] = [],
    quietRR: [number, number][] = [];
  if (t.falling)
    for (const q of scopes.slice(1)) {
      const o = q.rr ? trendOf(trendW({ inRange: q.inR, exWin: sc.exWin })) : null;
      if (q.rr && o && o.pct == null) quietRR.push(q.rr);
      else if (q.rr && o && !o.falling) holdRR.push(q.rr);
    }
  const falling = t.falling && !holdRR.length && !quietRR.length;
  /* RIR drift: the same load and at least the same reps across the last three
     exposures while logged RIR climbed by a full rep or more. e1RM cannot see
     this, but it is the clearest sign that the load is due to go up. */
  let easier: ExStat['easier'] = null;
  if (inRange.length >= DRIFT_N) {
    const l3 = inRange.slice(-DRIFT_N);
    const sameW = l3.every(x => Math.abs(x.topW - l3[0].topW) < EPS_SAME);
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
  if (inRange.length >= DRIFT_N) {
    const l3 = inRange.slice(-DRIFT_N);
    // Each drop is read only once all three are known, as the ! say.
    if (
      l3.every(x => Math.abs(x.topW - l3[0].topW) < EPS_SAME) &&
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
    rrIn,
    holdRR,
    quietRR,
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
    if (st.wN < MUSCLE_TREND_MIN.sessions || st.wSpan < MUSCLE_TREND_MIN.days) continue;
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
     volume." on the same screen. Now a muscle that is actually growing is
     never called lagging, and one that is actually going backwards is always
     called lagging even if the rest of the list is worse; rank decides no
     label.
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

/* What a lift's session was, in the words the Last line, Stats' history
   of a lift and its chart say it (r54): short of its usual by its sets or
   its reading, lighter (tagged or read from its loads), a deload, or
   nothing for a full session. */
/** A lift's session in a word or two: fewer sets, below usual, lighter, deload, or empty for a full one. */
export function sessionWord(x: Pick<Exposure, 'short' | 'light' | 'auto' | 'deload'>): string {
  return x.short === 'sets'
    ? 'fewer sets'
    : x.short === 'reading'
      ? 'below usual'
      : x.light || x.auto
        ? 'lighter'
        : x.deload
          ? 'deload'
          : '';
}

/* Each lift's word in the sessions given (History, r54: its row says fewer
   sets where a lift had fewer than its usual, as it said trimmed until r54,
   and its open panel names each lift's), read from the same exposures as
   the Last line, so the two cannot disagree. */
/** Each lift's word (sessionWord), by session id and lift, in the sessions given. */
export function sessionWordsIn(M: Model, sids: readonly string[]): Record<string, Record<string, string>> {
  const want = new Set(sids);
  const out: Record<string, Record<string, string>> = {};
  for (const [id, xs] of Object.entries(IDXIn(M).byEx))
    for (const x of xs || []) {
      const w = want.has(x.sid) ? sessionWord(x) : '';
      if (w) (out[x.sid] || (out[x.sid] = {}))[id] = w;
    }
  return out;
}

/* "Last" is the most recent session of a lift, whatever kind (r26, V's
   rule): a session short of its usual, lighter, or a deload is what you did
   last, so it is what you look back at, labelled for what it was (fewer
   sets, below usual, lighter, deload; trimmed until r54). Targets still come
   from the last full session (base), so none of these sets one (since r53, a
   lift done at its usual level on a lighter day or in a deload is full work,
   idxAutoLighter). Grey reps and Copy last follow "Last" when its loads and
   reps are the ones you lift (a session with fewer sets keeps them); after a
   deload, a lighter session or one below its usual they come from the last
   full session, since those reps were not the usual (r54: repeating a bad
   day's reps was not its repeated target).
   basis is the date the target came from, when it is not the session in
   "Last", so the logger can say so. */
export function lastOf(
  all: readonly Exposure[] | null | undefined,
  base: Exposure,
  fmt: (p: ExPoint) => string,
  repMin?: number
): { line: string; prev: string[]; prevOff: true | undefined; lastR: number[]; basis: string | null } {
  const rec = all && all.length ? all[all.length - 1] : base;
  const kind = sessionWord(rec);
  // Every set in the order done, a missed one in its place (r55).
  const miss = rec.miss || [];
  const sets: string[] = [];
  rec.pts.forEach((p, i) => {
    for (const m of miss) if (m.at === i) sets.push(fmt(m) + missedTag(m));
    sets.push(fmt(p));
  });
  for (const m of miss) if (m.at >= rec.pts.length) sets.push(fmt(m) + missedTag(m));
  const line = `Last (${fmtDate(rec.date)}${kind ? ', ' + kind : ''}): ${sets.join(', ')}.`;
  /* A session short of its usual sets at another working load than the one
     the target comes from gives no reps for it either (r55, the audit: after
     85 x 6, 6 stopped short, the target went back to 80 kg with 6s in grey). */
  const repsFrom =
    rec !== base && (lighter(rec) || rec.short === 'reading' || Math.abs(rec.topW - base.topW) > EPS_SAME) ? base : rec;
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
     are left out, a missed one too (r55), so the line above the sets keeps
     listing them. */
  const rl = workLoad(rec.pts, repMin || 0);
  const rp = atLoad(rec.pts, rl);
  const shown = rp.length ? rp : rec.pts;
  return {
    line,
    prev: shown.map(fmt).slice(0, LIMITS.sets),
    prevOff: shown.length < rec.pts.length || miss.length > 0 || undefined,
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

/** A set being logged as its PRs judge it (prFrame): the lift, its sessions
    up to the day and their bests, the heaviest working load among them, the
    set's load as judged (w, prSameLoad), and its PR load (prLoad) as judged
    (load) and as logged (own). */
export type PrFrame = {
  ex: ExerciseLike;
  exps: Exposure[];
  st: LiftBests | undefined;
  heaviest: number;
  w: number;
  load: number;
  own: number;
};

/* What the live PR check and the PR toast judge a set being logged against
   (r54): the lift's sessions up to its day (a past workout entered after
   later ones reads only those up to it) with their bests (statsUpTo for a
   past day), and the set's load as the PR list judges it once saved
   (prSameLoad against every load of those sessions), so the toast and the
   list agree that changing units or gyms is not a PR. Null when the lift has
   no session yet. Before r54 each of the two read these itself. */
export function prFrameIn(M: Model, exId: string, s: LoadedSet, date: string): PrFrame | null {
  const I = IDXIn(M);
  const every = I.byEx[exId];
  if (!every || !every.length) return null;
  const exps = date ? every.filter(x => x.date <= date) : every;
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

/** One record on the bests board: the set and the day it was first reached. */
export type BestAt = { p: ExPoint; date: string };

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
  const exps = all && upTo ? all.filter(x => x.date <= upTo) : all;
  if (!exps || !exps.length) return null;
  const ex = EXIn(M, id);
  let est: (BestAt & { v: number }) | null = null,
    heavy: (BestAt & { j: number }) | null = null;
  const front: (BestAt & { j: number })[] = [];
  const seen = new Set<number>();
  for (const x of exps) {
    const fresh: { p: ExPoint; j: number }[] = [];
    for (const p of x.pts) {
      // Judged at the load it stands for: the same weight in the other unit is no heavier.
      const d = prSameLoad(p.w, seen) - p.w,
        j = p.pl + d;
      const v = noE1(ex) ? null : e1(p.load + d, p.r, p.rq);
      if (v != null && (!est || v > est.v + EPS_SAME)) est = { v, p, date: x.date };
      // Heaviest and rep records at the PR load (prLoad, r32.1): on a bodyweight lift, by added load and reps, dated when first done.
      if (!heavy || j > heavy.j + EPS_SAME || (Math.abs(j - heavy.j) < EPS_SAME && p.r > heavy.p.r))
        heavy = { p, j, date: x.date };
      if (!front.some(q => q.j >= j - EPS_SAME && q.p.r >= p.r)) fresh.push({ p, j });
    }
    for (const { p, j } of fresh) {
      if (front.some(q => q.j >= j - EPS_SAME && q.p.r >= p.r)) continue;
      for (let k = front.length - 1; k >= 0; k--)
        if (j >= front[k].j - EPS_SAME && p.r >= front[k].p.r) front.splice(k, 1);
      front.push({ p, j, date: x.date });
    }
    for (const p of x.pts) seen.add(p.w);
  }
  front.sort((a, b) => b.j - a.j);
  const dates: string[] = front.map(f => f.date);
  if (est) dates.push(est.date);
  if (heavy) dates.push(heavy.date);
  const last = dates.sort().pop();
  return {
    ex,
    est,
    heavy: heavy ? { p: heavy.p, date: heavy.date } : null,
    front: front.map(f => ({ p: f.p, date: f.date })),
    last
  };
}
