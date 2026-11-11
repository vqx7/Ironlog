/* The analytics index and what it reads (phase 3b, r52; moved from the
   legacy script): RIR as the
   analytics read it and the RIR checks, hard sets, bodyweight, IDX() and its
   six steps, a lift's bests up to a date, the Last line, and the sessions by
   date. Each function that reads the log, the date or a cache takes the model
   as its first parameter (model.ts). */

import type { Session } from './types';
import type { DateIndex, DayMeta, ExPoint, ExStat, Exposure, Idx, MissedPoint, Model, Pr, Score } from './model';
import { MK, SLOW_RECOVERY, noE1 } from './library';
import { addDays, daysBetween, median, r1, weekStart, EPS, EPS_SAME, WEEK_DAYS, PERCENT } from './util';
import { EXIn, exInjuryIn, sinceNew, sortedSessionsIn, stretchesOf } from './model';
import {
  BACK_DAYS,
  GROW_PCT,
  LIGHTER_LOAD,
  LIGHTER_READING,
  afterBreak,
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
  trendE,
  workLoad,
  HELPER_CREDIT,
  TREND_DAYS,
  RECENT_DAYS,
  MUSCLE_TREND_MIN,
  FLAT_PCT_WEEK,
  STALL,
  LIGHTER_REF,
  USUAL_BEFORE,
  NEW_LEVEL,
  RIR_TREND,
  DRIFT_N
} from './formulas';
import { sameExOnce } from './session';
import { trendScope, trendW, liftTrendIn, stallReads, stallScopesIn, stallStretch } from './trend';
import { basePlanIn, routinePlanIn } from './routines';
import { atCapOfIn, capOfIn } from './gym';
import { fmtDateFrom, missedTag } from './format';
import { LIMITS } from './records';
import { hardCreditIn, isHardIn, loadOfIn, noBodyIn, prLoadIn, rirEffIn, rirEstIn, tonnageIn } from './setread';
import { atUsualLoad, atUsualWork, idxShort } from './usual';
import { idxPRsIn, prBestOf } from './prs';

/** The sessions and the lighter ones in a week (idxAutoLighter, idxLightWeeks). */
type WeekCount = { n: number; l: number };

/* The sessions on each date, in sessCmp order, and the count per week.
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
const RECOVERY_EASY_RIR = 3;

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
    /* Each stretch's PRs judged against that stretch alone (a new machine
       or gym starts the lift over, r61), the list keeping every stretch's;
       the lift's bests are its newest stretch's. */
    let maxBest: number | null = null;
    for (const part of stretchesOf(byEx[id])) maxBest = idxPRsIn(M, id, part, prs);
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

/* The sessions of a lift its rules read up to a date (r61, PENDING 343 7):
   those since its newest New machine or gym mark (sinceNew), and, while the
   session in progress marks the lift (a block's nw), only those after that
   session's day, since it starts the lift over: none until one is logged
   after it. The target, the return after a break, the next sets, the rack's
   spacing, a load far off and the live PR read a lift through this. */
/** A lift's sessions up to a date (all of them with none) as its rules read them: since a new machine or gym. */
export function liftReadIn(M: Model, exId: string, T?: string): Exposure[] {
  const every = IDXIn(M).byEx[exId] || [];
  const all = T === undefined ? every : every.filter(x => x.date <= T);
  const d = M.s.draft;
  if (d && (T === undefined || d.date <= T) && d.ex.some(b => b.exId === exId && b.nw))
    return sinceNew(all.filter(x => x.date > d.date));
  return sinceNew(all);
}

/** Where idxSessionsIn adds up a session's hard sets: its week's (ws, wc and weekHard), its day's (dm, dx), and the start of the recent weeks RIR is counted over. */
type Tally = {
  ws: Record<string, number>;
  wc: Record<string, number>;
  dm: Record<string, number>;
  dx: Record<string, DayMeta>;
  weekHard: Record<string, number>;
  wk: string;
  recentFrom: string;
};

/** One block's hard sets added to its week, day and muscles (idxSessionsIn), and how many of its recent working sets have an RIR logged. */
function tallyIn(
  M: Model,
  ss: Session,
  b: Session['ex'][number],
  ex: ReturnType<typeof EXIn>,
  novel: boolean,
  T: Tally
): { logged: number; total: number } {
  const { ws, wc, dm, dx, weekHard, wk, recentFrom } = T;
  const mus: [string, number][] = [[ex.primary, 1], ...ex.secondary.map((m): [string, number] => [m, HELPER_CREDIT])];
  let n = 0,
    total = 0;
  for (const s of b.sets) {
    if (!isWork(s)) continue;
    // A saved set's RIR is a number or null, never '' (normalize), so the
    // test for '' never passes here; it is the test written for rows of a
    // session too, read through String so it holds for any value.
    const logged = M.s.settings.rirMode === 'off' || !(s.rir == null || String(s.rir) === '');
    if (ss.date >= recentFrom) {
      total++;
      if (logged) n++;
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

  return { logged: n, total };
}

/** A session's trend readings of a lift (idxSessionsIn): the average over the working sets at its top load with RIR and with reps alone, its heaviest load, and how many sets carry an RIR. */
function trendReads(
  ex: ReturnType<typeof EXIn>,
  atTop: readonly ExPoint[],
  pts: readonly ExPoint[]
): { tAdj: number | null; tRaw: number | null; topL: number; rated: number } {
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
  return { tAdj, tRaw, topL, rated };
}

/* Step 1: every session in date order. Hard sets per week, per day and per
   muscle, and each lift's exposure (its working sets read as loads, the
   working load, the best estimate, the trend readings, weight lifted). */
function idxSessionsIn(M: Model, sessions: readonly Session[]) {
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
      const rc = tallyIn(M, ss, b, ex, novel, { ws, wc, dm, dx, weekHard, wk, recentFrom });
      rirLogged += rc.logged;
      rirTotal += rc.total;
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
      /* Missed sets (r55, V): kept for the Last line, each with the number
         of the session's sets read before it, so the line lists every set in
         the order done; the next target reads them as sets short of the range
         (triedAt, PENDING 338 A) and a session's sets count them (setsAt, r64).
         No volume, PR, estimate or trend reads them, and the field is absent
         when there are none. */
      const miss: MissedPoint[] = [];
      let seen = 0;
      for (const s of b.sets)
        if (ptsSrc.includes(s)) seen++;
        else if (!s.warm && !s.drop && isMissed(s)) miss.push({ ...point(s), at: seen });
      // Mean logged RIR on the sets at this session's top load, or null if none was logged.
      // The working load: a heavy top single is not where reps are built.
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
      const nb = noBodyIn(M, ex);
      if (!noE1(ex) && !nb)
        for (const p of pts) {
          const v = e1(p.load, p.r, p.rq);
          if (v != null && (best == null || v > best)) {
            best = v;
            // A set with an estimate has reps to failure (e1 gives none without them), as the ! says.
            bb = rtfBand(rtfOf(p.r, p.rq)!);
          }
        }
      // The same at the PR load (prLoad): identical to best except on a bodyweight lift; the PR scorer's one reading.
      const { pb, pbb } = prBestOf(ex, pts, nb);
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
      const { tAdj, tRaw, topL, rated } = trendReads(ex, atTop, pts);
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
        ...(b.nw ? { nw: true as const } : {}),
        // Read from its drop sets alone: neither the PR list nor the bests board reads it, as no drop set feeds a PR.
        ...(main.length ? {} : { dropOnly: true as const }),
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
/* Removes in place the items of a list that match (the lighter reading's lists are read by reference). */
function removeWhere<T>(a: T[], f: (x: T) => boolean): void {
  for (let i = a.length - 1; i >= 0; i--) if (f(a[i])) a.splice(i, 1);
}

function idxAutoLighter(byEx: Record<string, Exposure[]>): Record<string, WeekCount> {
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
    // The earlier sessions each lighter session in the run was read against.
    const readAgainst = new Map<Exposure, readonly Exposure[]>();
    let before: Exposure | null = null;
    for (const x of exps) {
      // A new machine or gym starts the lift over as a break does.
      if (afterBreak(before, x.date) || x.nw) {
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
          readAgainst.set(x, ref);
          /* Lighter sessions in a row for two weeks or more is a new level
             (a layoff, an injury, a new technique), not a deload: they count
             again, and what follows is compared with them. Counting sessions
             alone (three in a row) read a deload week on a lift trained three
             times a week as a new level, then as a 16% fall and a stall
             (r31, from the review). In a row against the same usual: the
             lighter sessions read against any of the same earlier sessions
             (r72, the 387 audit's 387-C1, and the review's R72-1). Counted
             across every range, one lighter session on a light day's 16 to 23
             made two lighter sessions on 10 to 15 a new level, and the 10 to
             15 target fell from 100 kg to 85; counted within one range, a
             lifter back weaker in two ranges under an imported history (no
             range, the usual of every range) was lighter for good, the target
             50% over a month at 20 lb. A break (more than BACK_DAYS) still
             restarts everything. */
          const mine = new Set(ref);
          const inRun = run.filter(q => (readAgainst.get(q) || []).some(r => mine.has(r)));
          if (
            inRun.length >= NEW_LEVEL.sessions &&
            daysBetween(inRun[0].date, inRun[inRun.length - 1].date) >= NEW_LEVEL.days
          ) {
            for (const q of inRun) {
              q.auto = false;
              q.keep = true;
              wkAuto[weekStart(q.date)].l--;
            }
            // What follows in their ranges is read against them now.
            removeWhere(prev, q => inRun.some(m => sameRR(q.rr, m.rr)));
            prev.push(...inRun);
            removeWhere(run, q => inRun.includes(q));
          }
          continue;
        }
      }
      removeWhere(run, q => sameRR(q.rr, x.rr));
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
      if (afterBreak(before, x.date) || x.nw) prev.length = 0;
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

/* Step 3: lighter weeks. Weekly volume averages skip them: a deload
   halves the sets on purpose, and averaging it in read as below target for a
   month after every deload. Since r54 a week is lighter when more than half
   its sessions were, or its last two or more were deload sessions done
   lighter (lighterTally), the reading the coach holds a deload back by, so
   the averages leave out a deload begun mid-week, which they kept, and keep
   a week of deload sessions done at full for every lift, which they left out
   by its labels (the audit V asked for: four weeks of "add sets" after a
   deload tapped on a Thursday, for a lifter doing every planned set). */
function idxLightWeeks(
  sessions: readonly Session[],
  byEx: Record<string, Exposure[]>,
  deloadWeek: string | null
): Record<string, boolean> {
  const lightWk: Record<string, boolean> = {};
  const T = lighterTally(sessions, byEx, deloadWeek).weeks;
  for (const k in T) if (T[k].light * 2 > T[k].all || T[k].tail >= 2) lightWk[k] = true;
  return lightWk;
}

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

/** Whether a lift's trend reads RIR: only where it is logged on most of its recent working sets in range (idxLiftIn). */
function rirInTrendIn(M: Model, inRange: readonly Exposure[]): boolean {
  const recent = inRange.slice(-RIR_TREND.sessions);
  const nPts = recent.reduce((a, x) => a + x.pts.length, 0),
    nRated = recent.reduce((a, x) => a + x.rated, 0);
  const useAdj = M.s.settings.rirMode !== 'off' && nPts > 0 && nRated / nPts >= RIR_TREND.share;
  return useAdj;
}

/** Whether a lift can be stalled: still trained (in the window, not on a break today), kept, and not held for a flagged injury (idxLiftIn). */
function stillTrainedIn(
  M: Model,
  id: string,
  exI: ReturnType<typeof EXIn>,
  lastReal: Exposure | null | undefined,
  winStart: string
): boolean {
  return (
    !!lastReal &&
    lastReal.date >= winStart &&
    !afterBreak(lastReal, M.today()) &&
    !exI.archived &&
    M.s.exercises.some(e => e.id === id) &&
    !exInjuryIn(M, exI)
  );
}

/** Whether a lift moved over its stall stretch (idxLiftIn): a record in its last sessions, a PR Recent PRs lists in a session left out since, a heavier load or reading, or more reps than every earlier session at the same working load over no more sets. */
function stretchMoved(
  l: readonly Exposure[],
  offSince: (from: string) => Exposure[],
  listed: (x: Exposure) => boolean
): boolean {
  const z = l[l.length - 1],
    a0 = l[0];
  const same = l.slice(0, -1).filter(x => Math.abs(x.topW - z.topW) < EPS_SAME && x.topN >= z.topN);
  return (
    l.slice(-STALL.noProgress).some(x => x.progress) ||
    offSince(l[l.length - STALL.noProgress].date).some(listed) ||
    z.topL > a0.topL + EPS_SAME ||
    z.topW > a0.topW + EPS_SAME ||
    (same.length > 0 && z.topReps > Math.max(...same.map(x => x.topReps)))
  );
}

/** A falling lift's other rep ranges in use: those where it does not fall (holdRR) and those with too few sessions for a trend (quietRR); none when it is not falling (idxLiftIn). */
function otherRangesIn(
  M: Model,
  exI: ReturnType<typeof EXIn>,
  scopes: ReturnType<typeof stallScopesIn>,
  sc: ReturnType<typeof trendScope>,
  falling: boolean
): { holdRR: [number, number][]; quietRR: [number, number][] } {
  const holdRR: [number, number][] = [],
    quietRR: [number, number][] = [];
  if (falling)
    for (const q of scopes.slice(1)) {
      const o = q.rr ? liftTrendIn(M, exI, trendW({ inRange: q.inR, exWin: sc.exWin })) : null;
      if (q.rr && o && o.pct == null) quietRR.push(q.rr);
      else if (q.rr && o && !o.falling) holdRR.push(q.rr);
    }
  return { holdRR, quietRR };
}

/* Step 5: one lift's trend, stall, signals and bests. */
function idxLiftIn(
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
  // The lift as it is now: its sessions since a new machine or gym (sinceNew, r61), which its bests and readings come from; its count is every session.
  const cur = sinceNew(exps);
  /* At the heaviest load the machine or rack has, progress moves to reps and
     then to harder reps (tempo, pauses, one side), which the load-based PR
     tests cannot see. Such a lift is marked capped rather than stalled. */
  const exI = EXIn(M, id);
  // r33: the top of the rack in Your gym is a cap too (review: a lift at the heaviest dumbbell read as stalled).
  const plC = basePlanIn(M, id);
  const capL = lastReal ? capOfIn(M, exI, plC, lastReal.topW) : null;
  const capped = !!lastReal && atCapOfIn(M, exI, plC, lastReal.topW, capL);
  /* RIR in the trend only where it is logged consistently: on at
     least 80% of the lift's working sets in its last 8 sessions in range, a
     convention. Rated on some sets and blank on others, a 255 x 5 called
     RIR 3 read as strong as 270 x 5 called RIR 1, so the load going up
     15 lb showed as a stall. Otherwise the trend reads reps alone, the same
     way for every session. Bests, PRs and targets keep RIR as before. */
  const useAdj = rirInTrendIn(M, inRange);
  for (const x of exps) x.tv = useAdj ? x.tAdj : x.tRaw;
  /* Stalled: the fitted strength line over the last 6 real sessions (4 at
     least, widened to cover 21 days when 6 do not) in the current rep range,
     spanning 3 weeks or more, is flat or falling, and none of the last 3 of
     them set a PR or lifted more than the first session of that stretch
     (r30: double progression adds load and loses reps for a while, which a
     line through estimates reads as flat). A lift with no reading at all
     (timed, joint-rotation) keeps a count-based test: 4 or more sessions
     and no PR of any kind in the last 3. */
  let stalled = false;
  /* Only a lift still being trained can be stalled: one not done in the
     42 days up to the log's newest session, or deleted or archived,
     used to stay stalled forever and kept the Coach calling for a deload
     (r27). Nor one on a break today (afterBreak, more than BACK_DAYS since
     its last session, r64, the r63 audit's P-S2-2): its next session starts
     its readings over, so a pull-up last done 39 days ago read as stalled on
     Stats and by the coach until then. Nor one held for a flagged injury
     (r53, from the audit V asked for): the engine keeps it at last time's
     load on purpose, and three weeks of doing as told read as a stall to
     change the range. */
  const current = stillTrainedIn(M, id, exI, lastReal, winStart);
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
      cur.filter(x => (lighter(x) || x.held) && sameRR(x.rr, rr) && x.date >= from);
    const l = stallStretch(withE1);
    if (l) {
      /* More reps at the same working load over no more sets is progress
           too: double progression adds reps to sets 2 to 4 once set 1
           is at the top of the range, and that is not a stall. Since r32
           it has to beat every earlier session at that load in the
           stretch, not only the first: a press alternating 6, 6, 6 and 5,
           5, 4 at one load for 7 weeks "moved" every other week. */
      const moved = stretchMoved(l, offSince, listed);
      /* Flat is under 0.1% a week: averaging working sets leaves
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
  const w = trendW(sc);
  const t = liftTrendIn(M, exI, w);
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
  const { holdRR, quietRR } = otherRangesIn(M, exI, scopes, sc, t.falling);
  const falling = t.falling && !holdRR.length && !quietRR.length;
  /* RIR drift: the same load and at least the same reps across the last three
     exposures while logged RIR climbed by a full rep or more. e1RM cannot see
     this, but it is the clearest sign that the load is due to go up. */
  let easier: ExStat['easier'] = null;
  /* Not on a lift on a break today, as it is not stalled then (stillTrainedIn): the way back after the break, or its
     fresh start after a long one, sets the load, and Load due beside it contradicted it (REV10-5, 2.46 too). */
  if (inRange.length >= DRIFT_N && !afterBreak(lastReal, M.today())) {
    const l3 = inRange.slice(-DRIFT_N);
    const sameW = l3.every(x => Math.abs(x.topW - l3[0].topW) < EPS_SAME);
    const allRir = l3.every(x => x.topRir != null);
    const repsHeld = l3.every(x => x.topReps >= l3[0].topReps);
    // Worked out before allRir is tested, so a missing top RIR is read here
    // as Number reads it (null as 0), and it counts only when all three have one.
    const climbing =
      Number(l3[1].topRir) >= Number(l3[0].topRir) &&
      Number(l3[2].topRir) >= Number(l3[1].topRir) &&
      Number(l3[2].topRir) - Number(l3[0].topRir) >= 1;
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
  for (const x of cur) {
    if (x.best == null) continue;
    if (sameRR(x.rr, curRR)) bestCur = bestCur == null ? x.best : Math.max(bestCur, x.best);
  }
  // A session with an estimate at the PR load has its band, as the ! say.
  for (const x of cur) if (x.pb != null) byBand[x.pbb!] = Math.max(byBand[x.pbb!] || 0, x.pb);
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
    trendTv: w.map(x => x.tv),
    wSpan: w.length ? daysBetween(w[0].date, w[w.length - 1].date) : 0,
    last: real.length ? real[real.length - 1] : cur[cur.length - 1],
    best: bestCur,
    bestAll: maxBest,
    rr: curRR,
    easier,
    fade,
    capped
  };
}

/* Step 6: muscle scores from the lifts' trends. */
function idxScoresIn(M: Model, exStats: Record<string, ExStat>): Score[] {
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
     ranking to be worth saying. A rising muscle is progressing: ranked
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
   of a lift and its chart say it: short of its usual by its sets or
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
  now: string,
  repMin?: number
): { line: string; prev: string[]; prevOff: true | undefined; lastR: number[]; basis: string | null } {
  const rec = all && all.length ? all[all.length - 1] : base;
  const kind = sessionWord(rec);
  // Every set in the order done, a missed one in its place.
  const miss = rec.miss || [];
  const sets: string[] = [];
  rec.pts.forEach((p, i) => {
    for (const m of miss) if (m.at === i) sets.push(fmt(m) + missedTag(m));
    sets.push(fmt(p));
  });
  for (const m of miss) if (m.at >= rec.pts.length) sets.push(fmt(m) + missedTag(m));
  // The date with its year when it is not this one: "Last (Oct 20)" a year on read as last week.
  const line = `Last (${fmtDateFrom(rec.date, now)}${kind ? ', ' + kind : ''}): ${sets.join(', ')}.`;
  /* A session short of its usual sets at another working load than the one
     the target comes from gives no reps for it either (r55, the audit: after
     85 x 6, 6 stopped short, the target went back to 80 kg with 6s in grey). */
  const repsFrom =
    rec !== base && (lighter(rec) || rec.short === 'reading' || Math.abs(rec.topW - base.topW) > EPS_SAME) ? base : rec;
  /* Grey reps are last time's reps at the working load only: a top
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
     column beside the sets. The same rule as the grey reps, so row n of
     Last is the set row n repeats: a top single or a pyramid's other loads
     would push every set down a row. prevOff says some sets
     are left out, a missed one too, so the line above the sets keeps
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

// Sessions in the week, not days: two plan days done on one day are two of the week's sessions.
// Counted once per change and kept with the analytics (dateIndex, r47; r46: the streak scanned every session for each of 104 weeks, twice a render).
export function weekSessionsIn(M: Model, ws: string): number {
  return dateIndexIn(M).weekN[ws] || 0;
}
