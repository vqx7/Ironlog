/* The week as the screens count it (phase 3b, r52; moved from the legacy
   script, tests/moved.js reads each back to r51's code): the weekly averages
   every flag, the coach and Muscles read, the region balance, the routine a
   past week was trained on and what it asked for, the streak, the newest
   lighter session, and this week's numbers on Today. */

import type { Routine } from './types';
import type { Model } from './model';
import { activeRoutineIn, freeModeIn, isDeloadWeekIn, isRestWeekIn, sortedSessionsIn } from './model';
import { addDays, weekStart } from './util';
import { firstDate } from './charts';
import { IDXIn, lighterTally, weekSessionsIn } from './analytics';
import { REGIONS, TRACK_ONLY } from './library';
import { aboveMax, belowMin } from './volume';
import { planSetsPerWeekIn, plannedPerWeek, trainDaysOf, weekFactor } from './routines';

/** What an average says about itself, kept beside the muscles' numbers and left
    out when they are listed: the full weeks it averages, the weeks missed,
    the weeks asked for, how far back it reached, the lighter and rest weeks
    left out, whether the log's first week cut it short, and the share of the
    sets whose RIR was logged, per muscle. */
export interface AvgMeta {
  _weeks: number;
  _missed: number;
  _n: number;
  _span: number;
  _light: number;
  _rest: number;
  _ff: boolean;
  _conf: Record<string, number>;
}

/** A weekly average: hard sets a week per muscle, with what it says about itself (AvgMeta). */
export type WeeklyAvg = Record<string, number> & AvgMeta;

/* The week the log started in counts only if it started on that week's
   first day (r29): someone who began on a Saturday with one session read as
   "19 flagged" and a "1-week average" the following Monday. */
export function firstFullWeekIn(M: Model): string | null {
  const f = firstDate(M.s.sessions);
  if (!f) return null;
  const w = weekStart(f);
  return f > w ? addDays(w, 7) : w;
}

/* The weeks an average covers, in words: "your last 4 full weeks", or
   "the 1 week you trained of the last 4" when weeks were missed (r31). */
/* r31.2: says the span the weeks really came from, and a lighter week left
   out (the review saw "3 full weeks logged so far" for a deload and a
   missed week inside the window of a 9-week log). */
export function avgWeeksTxt(avg: Pick<AvgMeta, '_weeks' | '_missed' | '_light' | '_rest' | '_span' | '_n'>): string {
  const w = avg._weeks,
    m = avg._missed || 0,
    l = avg._light || 0,
    r = avg._rest || 0;
  if (!m && !l && !r) return `your last ${w} full week${w === 1 ? '' : 's'}`;
  const out = [
    l ? `${l === 1 ? 'a lighter week' : l + ' lighter weeks'}` : '',
    r ? `${r === 1 ? 'a rest week' : r + ' rest weeks'}` : ''
  ].filter(Boolean);
  return `the ${w} week${w === 1 ? '' : 's'} you trained of the last ${avg._span || Math.min(avg._n || 4, w + m)}${out.length ? `, ${out.join(' and ')} left out` : ''}`;
}

/* The 4-week average every flag, the coach and Muscles read. The radar on
   Stats can choose 2 or 8 weeks instead (avgWeeks, r31.2); nothing else does,
   so a flag never changes with that choice. */
export function actualAvg4In(M: Model, lightToo?: boolean): WeeklyAvg | null {
  return avgWeeksIn(M, 4, lightToo);
}

/** The weekly average of hard sets per muscle over the last n full weeks (below), or null with none trained. */
export function avgWeeksIn(M: Model, n: number, lightToo?: boolean): WeeklyAvg | null {
  const I = IDXIn(M);
  const cur = weekStart(M.today());
  let weeks = 0;
  const tot: Record<string, number> = {},
    con: Record<string, number> = {};
  const ff = firstFullWeekIn(M);
  /* The last n weeks, but a lighter week among them is skipped and the
     week before them takes its place (r30), up to twice as far back: a
     deload halves the sets on purpose, and averaging it in read as below
     target for a month after every deload. Weeks with no training are
     skipped without a replacement, so the average is per week trained; they
     are counted in _missed (r31) and said wherever the average is, so one
     week trained out of four never reads as on track without saying so. */
  let extra = 0,
    missed = 0,
    span = 0,
    ffHit = false,
    rest = 0,
    light = 0;
  for (let k = 1; k <= Math.min(2 * n, n + extra); k++) {
    const wk = addDays(cur, -7 * k);
    if (ff && wk < ff) {
      ffHit = true;
      continue;
    }
    span = k;
    if (isRestWeekIn(M, wk)) {
      extra++;
      rest++;
      continue;
    }
    const ws = I.weekSets[wk];
    if (!ws) {
      if (k <= n) missed++;
      continue;
    }
    if (I.lightWk[wk] && !lightToo) {
      extra++;
      light++;
      continue;
    }
    weeks++;
    for (const m in ws) tot[m] = (tot[m] || 0) + ws[m];
    const wc = I.weekConf[wk] || {};
    for (const m in wc) con[m] = (con[m] || 0) + wc[m];
  }
  // Only lighter weeks in reach: those, rather than nothing.
  if (!weeks && extra && !lightToo) return avgWeeksIn(M, n, true);
  if (!weeks) return null;
  // average over the weeks that actually have training, not a flat 4.
  // dividing by 4 when only 2 weeks were logged halved every muscle and
  // produced false "under band" flags after any break.
  const out: Record<string, number> = {},
    conf: Record<string, number> = {};
  for (const m in tot) out[m] = tot[m] / weeks;
  for (const m in con) conf[m] = con[m] / weeks;
  Object.defineProperty(out, '_weeks', { value: weeks, enumerable: false });
  Object.defineProperty(out, '_missed', { value: missed, enumerable: false });
  Object.defineProperty(out, '_n', { value: n, enumerable: false });
  Object.defineProperty(out, '_span', { value: span, enumerable: false });
  // Rest weeks are said as rest weeks, not lighter weeks (r34.2, from the review).
  Object.defineProperty(out, '_light', { value: lightToo ? 0 : light, enumerable: false });
  Object.defineProperty(out, '_rest', { value: rest, enumerable: false });
  Object.defineProperty(out, '_ff', { value: ffHit, enumerable: false });
  Object.defineProperty(out, '_conf', { value: conf, enumerable: false });
  // The eight defineProperty calls above add what an average says about itself, which TypeScript cannot see; the cast names them.
  return out as WeeklyAvg;
}

/* Region balance: hard sets in a region against that region's combined
   minimum (r29; before, the midpoint of the band). 100 means the region has
   reached its target. This is relative to the bands you set, not an
   absolute standard. */
export function regionBalanceIn(M: Model, sets: Readonly<Record<string, number>>) {
  const bands = M.s.settings.bands;
  // Tracked-only muscles have no target, so they count toward neither side (r29).
  return REGIONS.map(([label, all]) => {
    const ms = all.filter(m => !TRACK_ONLY.has(m));
    const got = ms.reduce((a, m) => a + (sets[m] || 0), 0);
    const mid = ms.reduce((a, m) => a + (bands[m][0] + bands[m][1]) / 2, 0);
    const lo = ms.reduce((a, m) => a + bands[m][0], 0);
    const hi = ms.reduce((a, m) => a + bands[m][1], 0);
    /* Measured against the region's minimum since r29: 100% is on target.
       Against the middle of the range, a region at its minimum sat well
       inside the ring and read as behind (V). */
    return {
      label,
      ms,
      got,
      mid,
      lo,
      hi,
      pct: lo > 0 ? (got / lo) * 100 : 0,
      low: belowMin(got, lo),
      high: aboveMax(got, hi)
    };
  });
}

/* What a past week asked for: the routine most of its sessions were logged
   against, so switching from a 3-day to a 6-day routine does not rescore the
   weeks done on the 3-day one (r27). A week without routine sessions reads
   the active routine. */
export function weekRoutineIn(M: Model, ws: string): Routine {
  // Built once per change and kept with the other analytics, so a streak over two years reads it, not every session per week.
  const I = IDXIn(M);
  if (!I.weekRid) {
    const by: Record<string, Record<string, number>> = {};
    for (const x of M.s.sessions) {
      if (!x.routineId || x.free) continue;
      const w = weekStart(x.date);
      const c = by[w] || (by[w] = {});
      c[x.routineId] = (c[x.routineId] || 0) + 1;
    }
    I.weekRid = {};
    for (const w in by) {
      let id: string | null = null;
      for (const k in by[w]) if (id == null || by[w][k] > by[w][id]) id = k;
      I.weekRid[w] = id;
    }
  }
  const id = I.weekRid[ws];
  return (id && M.s.routines.find(r => r.id === id)) || activeRoutineIn(M);
}

/** The sessions a past week asked for: one in freestyle, else its routine's training days a week. */
export function weekNeedIn(M: Model, ws: string): number {
  return freeModeIn(M) ? 1 : Math.max(1, plannedPerWeek(weekRoutineIn(M, ws)));
}

/* Consecutive weeks in which you trained at least as many days as the routine
   plans. The current week joins the streak once it is met, and does not break
   it before it is over. Rest weeks are skipped (r34). */
export function weekStreakIn(M: Model): { weeks: number; best: number; need: number; thisWeek: number } {
  const R = activeRoutineIn(M);
  const need = freeModeIn(M) ? 1 : Math.max(1, plannedPerWeek(R));
  const cur = weekStart(M.today());
  const thisWeek = weekSessionsIn(M, cur);
  if (!M.s.sessions.length) return { weeks: 0, best: 0, need, thisWeek: 0 };
  const first = weekStart(sortedSessionsIn(M)[0].date);
  let run: number | null = null,
    cnt = 0,
    best = 0;
  for (let k = 1; k <= 104; k++) {
    const wk = addDays(cur, -7 * k);
    if (wk < first) break;
    if (isRestWeekIn(M, wk)) continue;
    if (weekSessionsIn(M, wk) >= weekNeedIn(M, wk)) {
      cnt++;
      best = Math.max(best, cnt);
    } else {
      if (run == null) run = cnt;
      cnt = 0;
    }
  }
  if (run == null) run = cnt;
  const weeks = run + (thisWeek >= need ? 1 : 0);
  return { weeks, best: Math.max(best, weeks), need, thisWeek };
}

/* The newest session within the last `days` of a lighter week, or the end
   of a rest week or of a week marked as a deload with nothing trained in
   it, or null. The coach suggests no deload so soon after one. Read from
   what the lifts did, not from the day's label (V, 2026-10-18): a session
   is lighter when at least half its lifts were done lighter (still deload,
   lighter or read lighter once a lift at its usual level counts in full,
   idxTaggedFull), and a week is lighter when more than half its sessions
   were, once it has ended, or while it is under way from the second; or,
   for a deload begun mid-week, when its last two or more sessions were
   deloads done lighter: the coach's own Deload week button marks the week
   from the day it is tapped, and a lifter who trains four days and taps it
   on Wednesday deloads on two of four (the fourth review). Only deload
   sessions make that run, since lighter sessions late in a calendar week
   are otherwise no different from ones early in it: two Lighter days on
   Thursday and Friday after three normal days held the deload back where
   the same two on Monday and Tuesday did not, and a heavy and light
   programme with its light days late in the week never had one suggested
   (the fifth review). A deload session is one tagged deload, or any in the
   week marked as one: a blank or Freestyle session in a marked week is not
   tagged (PENDING 311), so a lifter in Freestyle mode who tapped Deload
   week on Wednesday was asked for another deload the next week (the sixth
   review). Only the latest mark is kept, which is the one four weeks
   reach in practice.
   Until r53 any one lighter session, or one lift read lighter, counted (the
   audit V asked for): one Lighter day after a poor night kept a deload the
   lifts needed away for four weeks. A deload begun mid-week, Wednesday and
   Friday after a normal Monday, is a lighter week, so the coach does not ask
   again the next week (the review of r53); one deload session after a
   normal Monday and Wednesday is not, as one Lighter day is not (the third
   review); a deload done at full for every lift is no deload; and a week
   marked as a deload counts on its own only with nothing trained in it,
   since a week tapped on a Saturday after normal training held the coach
   back for four weeks with no deload done (the second review). */
export function recentLighterIn(M: Model, days: number): string | null {
  const from = addDays(M.today(), -days);
  let d: string | null = null;
  const I = IDXIn(M);
  const cur = weekStart(M.today());
  const { weeks: T, lighter } = lighterTally(sortedSessionsIn(M), I.byEx, M.s.deloadWeek);
  // The lighter weeks the averages leave out (idxLightWeeks); the week in progress from its second lighter session.
  const week = (k: string): boolean => !!I.lightWk[k] && (k < cur || T[k].light >= 2);
  for (const x of M.s.sessions)
    if (x.date >= from && lighter(x.id) && week(weekStart(x.date)) && (!d || x.date > d)) d = x.date;
  // A rest week is recovery too, and so is a marked deload week with nothing trained in it: its last day, or today while it runs.
  for (const w of [
    ...(M.s.settings.restWeeks || []),
    ...(M.s.deloadWeek && !T[M.s.deloadWeek] ? [M.s.deloadWeek] : [])
  ]) {
    const e = addDays(w, 6) < M.today() ? addDays(w, 6) : M.today();
    if (e >= from && w <= M.today() && (!d || e > d)) d = e;
  }
  return d;
}

/** This week on Today: the routine, sessions done and planned, hard sets against the plan, cardio, a rest week. */
export function weekStatsIn(M: Model) {
  const R = activeRoutineIn(M);
  const cur = weekStart(M.today());
  const weekly = R.schedule === 'weekly';
  let cardioMin = 0,
    cardioN = 0;
  for (const c of M.s.cardio)
    if (c.date >= cur && c.date <= addDays(cur, 6)) {
      cardioMin += c.min;
      cardioN++;
    }
  const doneDays = weekSessionsIn(M, cur);
  const planDays = weekly ? trainDaysOf(R) : Math.round(trainDaysOf(R) * weekFactor(R));
  /* Sets are counted once each here, the same way the Plan tab counts them.
     Per-muscle volume (direct 1, secondary half) stays in the muscle views,
     where the split matters; summed across muscles it double-counts. The
     numerator is hard sets only, so a set left at RIR 4 or more does not
     count toward the week, unless Count RIR 4 to 5 as half a set is on
     (r40, hardCredit). Read from IDX's weekHard (r47), the same table the
     recap, Volume and the muscle views count from; until r47 this walked the
     log with its own copy of the rule. */
  const got = IDXIn(M).weekHard[cur] || 0;
  const tgt = planSetsPerWeekIn(M, R, isDeloadWeekIn(M));
  /* A rest week is said once, here, so the ring, the card and its body all
     follow (r46: the ring and the title were given their own test for it and
     the body kept saying "0 hard sets logged of 145 planned" underneath). */
  const rest = isRestWeekIn(M, cur);
  return {
    R,
    weekly,
    planDays: rest ? 0 : planDays,
    doneDays,
    got,
    tgt: rest ? 0 : tgt,
    pct: !rest && tgt > 0 ? Math.min(100, (got / tgt) * 100) : 0,
    cardioMin,
    cardioN,
    rest
  };
}
