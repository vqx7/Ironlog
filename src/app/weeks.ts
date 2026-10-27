/* The week as the screens count it (phase 3b, r52; moved from the legacy
   script): the weekly averages every flag, the coach and Muscles read, each
   muscle's status against its target and the region balance (r54), the
   routine a past week was trained on and what it asked for, the streak, the
   newest lighter session, and this week's numbers on Today. */

import type { Routine, Session } from './types';
import type { Model } from './model';
import { activeRoutineIn, freeModeIn, isDeloadWeekIn, isRestWeekIn, sortedSessionsIn } from './model';
import { addDays, daysBetween, weekStart, WEEK_DAYS, SUNDAY, PERCENT } from './util';
import { BACK_DAYS, DELOAD_GAP_DAYS } from './formulas';
import { sessCmp } from './records';
import { firstDate } from './charts';
import { IDXIn, dateIndexIn, lighterTally, weekSessionsIn } from './analytics';
import { MK, REGIONS } from './library';
import { hasTargetIn } from './profile';
import { aboveMax, belowMin } from './volume';
import { dayCreditIn, nextTrainIdx, planSetsPerWeekIn, plannedPerWeek, plannedSetsIn, sessDayIdx } from './routines';

/** What an average says about itself, kept beside the muscles' numbers and left
    out when they are listed: the full weeks it averages, the weeks missed,
    the weeks asked for, how far back it reached, the lighter and rest weeks
    left out, whether the log's first week cut it short, the share of the
    sets whose RIR was logged, per muscle, and the muscles on plan though
    under their minimum (cycleMixIn), and the sessions a week it averages. */
interface AvgMeta {
  _sess: number;
  _weeks: number;
  _missed: number;
  _n: number;
  _span: number;
  _light: number;
  _rest: number;
  _ff: boolean;
  _back: boolean;
  _conf: Record<string, number>;
  _mix: Record<string, boolean>;
}

/** A weekly average: hard sets a week per muscle, with what it says about itself (AvgMeta). */
type WeeklyAvg = Record<string, number> & AvgMeta;

/* Where the weeks are counted from: the log's first session, or the first
   after its last break of more than BACK_DAYS with nothing logged (r55, from
   the audit: a lifter who brought old bests in from June, as Today invites,
   read "You trained in 2 of the last 4 weeks" and 50% adherence in the third
   week of using the app, the weeks between counted as missed). A lift back
   after such a break starts lighter, with reps in reserve (BACK_DAYS), so the
   first week back is the week loads are found again, as a first week is. */
/** The first session the weekly counts start from: the log's first, or the first after its last break of more than 4 weeks. */
export function logStartIn(M: Model): string | null {
  let start: string | null = null,
    prev: string | null = null;
  // The index's dates are in order: it is built from the sessions sorted.
  for (const d of Object.keys(dateIndexIn(M).byDate)) {
    if (!prev || daysBetween(prev, d) > BACK_DAYS) start = d;
    prev = d;
  }
  return start;
}

/** Whether the weeks are counted from after a break, with sessions logged before it (logStartIn). */
export function logBackIn(M: Model): boolean {
  const s = logStartIn(M);
  return !!s && s !== firstDate(M.s.sessions);
}

/* The first week adherence counts: the week the log started in counts only
   if it started on that week's first day (r29): someone who began on a
   Saturday with one session read as "19 flagged" and a "1-week average" the
   following Monday. The weekly averages start a week later (avgFirstWeekIn).
   Since r55 the log starts after a break of more than 4 weeks (logStartIn). */
export function firstFullWeekIn(M: Model): string | null {
  const f = logStartIn(M);
  if (!f) return null;
  const w = weekStart(f);
  return f > w ? addDays(w, WEEK_DAYS) : w;
}

/* The weekly averages leave out the week the log starts in, however it
   started (r54, from the audit V asked for): it is the week loads are found,
   when sets end well short of failure while the weight is felt out, so a
   lifter doing every planned set from then on read below target, and was
   told to add sets, for the month it stayed in the average. */
/** Why the first week is left out of the averages, in the Guide's words. */
export const FIRST_WEEK_REASON = 'the week your loads are found, when sets usually end well short of failure';

/** The same, as the coach, the radar's tip and Volume say it. */
export const FIRST_WEEK_WHY = `Your first week is left out of the weekly averages: it is ${FIRST_WEEK_REASON}.`;

/** The same for a first week back after a break of more than 4 weeks (logStartIn). */
export const BACK_WEEK_WHY = `Your first week back after a break of more than ${BACK_DAYS / WEEK_DAYS} weeks is left out of the weekly averages: like a first week, it is ${FIRST_WEEK_REASON}.`;

/** The first week the weekly averages count, or null with nothing logged. */
export function avgFirstWeekIn(M: Model): string | null {
  const f = logStartIn(M);
  return f ? addDays(weekStart(f), WEEK_DAYS) : null;
}

/* The weeks an average covers, in words: "your last 4 full weeks", or
   "the 1 week you trained of the last 4" when weeks were missed (r31). */
/* r31.2: says the span the weeks really came from, and a lighter week left
   out (the review saw "3 full weeks logged so far" for a deload and a
   missed week inside the window of a 9-week log). */
/* r54: an average cut short by the log's first week, left out while loads
   are found (avgFirstWeekIn), says so, as the radar's label did alone (the
   review of r54: Volume's Recent average said "the 1 week with training in
   the last 4" in a log's third week). */
export function avgWeeksTxt(
  avg: Pick<AvgMeta, '_weeks' | '_missed' | '_light' | '_rest' | '_span' | '_n' | '_ff' | '_back'>
): string {
  const w = avg._weeks,
    m = avg._missed || 0,
    l = avg._light || 0,
    r = avg._rest || 0;
  if (!m && !l && !r)
    return avg._ff && w < avg._n
      ? `the ${w} full week${w === 1 ? '' : 's'} after your first week${avg._back ? ' back' : ''}`
      : `your last ${w} full week${w === 1 ? '' : 's'}`;
  const out = [
    l ? `${l === 1 ? 'a lighter week' : l + ' lighter weeks'}` : '',
    r ? `${r === 1 ? 'a rest week' : r + ' rest weeks'}` : ''
  ].filter(Boolean);
  return `the ${w} week${w === 1 ? '' : 's'} you trained of the last ${avg._span || Math.min(avg._n || AVG_WEEKS, w + m)}${out.length ? `, ${out.join(' and ')} left out` : ''}`;
}

/* Why there is no weekly average yet, said one way by the coach, Stats'
   summary, Volume's Recent average and a muscle's headline (r54, from the
   review: Stats said to finish a full week beside the coach's after your
   second week, and Recent average said no sessions in the previous 4 full
   weeks of a log in its second week). Back: something logged before,
   nothing in the last 4 weeks. Second: the log's first week, or the week
   after it until it ends, since the averages leave the first week out
   (avgFirstWeekIn). Otherwise a full week of training brings one. Read
   only where there is no average. */
/** What brings a weekly average where there is none yet, with a lead sentence for a lifter back from a break, and why the first week waits. */
export function avgWaitIn(M: Model): { kind: 'back' | 'second' | 'full'; lead: string; after: string; why: string } {
  const ago = addDays(weekStart(M.today()), -WEEK_DAYS * AVG_WEEKS);
  const af = avgFirstWeekIn(M);
  if (M.s.sessions.some(x => x.date < ago) && !M.s.sessions.some(x => x.date >= ago))
    return {
      kind: 'back',
      lead: `Nothing logged in the last ${AVG_WEEKS} weeks. `,
      after: 'a full week of training',
      why: ''
    };
  // Back after a break, the week the averages wait for is the second week back (r55, logStartIn).
  if (!af || weekStart(M.today()) <= af)
    return logBackIn(M)
      ? { kind: 'second', lead: '', after: 'your second week back', why: BACK_WEEK_WHY }
      : { kind: 'second', lead: '', after: 'your second week', why: FIRST_WEEK_WHY };
  return { kind: 'full', lead: '', after: 'a full week of training', why: '' };
}

/** The weeks the average every flag, the coach and Muscles read covers. */
export const AVG_WEEKS = 4;

/* The AVG_WEEKS-week average every flag, the coach and Muscles read. The
   radar on Stats can choose 2 or 8 weeks instead (avgWeeks, r31.2); nothing
   else does, so a flag never changes with that choice. */
export function actualAvg4In(M: Model, lightToo?: boolean): WeeklyAvg | null {
  return avgWeeksIn(M, AVG_WEEKS, lightToo);
}

/** The weekly average of hard sets per muscle over the last n full weeks (below), or null with none trained. */
export function avgWeeksIn(M: Model, n: number, lightToo?: boolean): WeeklyAvg | null {
  const I = IDXIn(M);
  const cur = weekStart(M.today());
  let weeks = 0;
  const tot: Record<string, number> = {},
    con: Record<string, number> = {};
  const ff = avgFirstWeekIn(M);
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
  const used: string[] = [];
  for (let k = 1; k <= Math.min(2 * n, n + extra); k++) {
    const wk = addDays(cur, -WEEK_DAYS * k);
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
    used.push(wk);
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
  // Sessions a week over the same weeks (PENDING 338 D): the coach reads them against the plan before it reads how sets were done.
  const sess = used.reduce((a, wk) => a + weekSessionsIn(M, wk), 0) / weeks;
  Object.defineProperty(out, '_sess', { value: sess, enumerable: false });
  Object.defineProperty(out, '_weeks', { value: weeks, enumerable: false });
  Object.defineProperty(out, '_missed', { value: missed, enumerable: false });
  Object.defineProperty(out, '_n', { value: n, enumerable: false });
  Object.defineProperty(out, '_span', { value: span, enumerable: false });
  // Rest weeks are said as rest weeks, not lighter weeks (r34.2, from the review).
  Object.defineProperty(out, '_light', { value: lightToo ? 0 : light, enumerable: false });
  Object.defineProperty(out, '_rest', { value: rest, enumerable: false });
  Object.defineProperty(out, '_ff', { value: ffHit, enumerable: false });
  // Cut short by a first week back after a break, not the log's first (r55).
  Object.defineProperty(out, '_back', { value: ffHit && logBackIn(M), enumerable: false });
  Object.defineProperty(out, '_conf', { value: conf, enumerable: false });
  Object.defineProperty(out, '_mix', { value: cycleMixIn(M, used, out), enumerable: false });
  // The eleven defineProperty calls above add what an average says about itself, which TypeScript cannot see; the cast names them.
  return out as WeeklyAvg;
}

/* A cycle's weeks are not alike when its turn is not a whole number of
   weeks: Strength 5 x 5, two days alternating three times a week, has two
   A days one week and one the next, so its chest sets go 10, 5, 10. The
   plan's sets a week are the average over a turn (dayShare), so an average
   of 1 or 3 weeks can fall short of a target the plan reaches (the review of
   r54: in a lifter's third week five muscles read below target and the
   coach said to do every planned set, to someone doing every one). A muscle
   is short only by that, on plan, when every week averaged had the sessions
   the plan asks for, the sets logged reach what the days due in those weeks
   plan (the day after the one last trained, as Today offers it,
   nextTrainIdx), and the plan reaches the target. A day trained out of turn,
   a set or a session skipped, or a week on another routine still reads
   below. Never on a weekly schedule, whose weeks are all alike, nor in
   Freestyle, where the plan is not followed. */
/** The muscles an average of the given weeks leaves under their minimum only by which days of a cycle fell in them. */
export function cycleMixIn(
  M: Model,
  weeks: readonly string[],
  avg: Readonly<Record<string, number>>
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const R = activeRoutineIn(M);
  const need = plannedPerWeek(R);
  if (!weeks.length || R.schedule === 'weekly' || freeModeIn(M) || !need) return out;
  const bands = M.s.settings.bands;
  const plan = plannedSetsIn(M, R);
  const short = MK.filter(m => hasTargetIn(M, m) && belowMin(avg[m], bands[m][0]) && !belowMin(plan[m], bands[m][0]));
  if (!short.length) return out;
  const wk = new Set(weeks);
  const per: Record<string, number> = {},
    due: Record<string, number> = {};
  let prev = -1;
  for (const s of sortedSessionsIn(M)) {
    if (s.routineId !== R.id) continue;
    const i = sessDayIdx(R, s);
    if (i < 0) continue;
    const d = nextTrainIdx(R, prev);
    prev = i;
    const w = weekStart(s.date);
    if (!wk.has(w)) continue;
    per[w] = (per[w] || 0) + 1;
    const c = dayCreditIn(M, R.days[d]);
    for (const m in c) due[m] = (due[m] || 0) + c[m];
  }
  if (weeks.some(w => (per[w] || 0) < need)) return out;
  for (const m of short) if (!belowMin(avg[m], (due[m] || 0) / weeks.length)) out[m] = true;
  return out;
}

/* The radar's fallback when no recent week was trained (regionSrc): the last
   weeks trained, however long ago, averaged as they stand, with the muscles
   on plan in them (cycleMixIn), as every average carries. */
/** Hard sets a week per muscle over the given weeks, carrying the muscles on plan in them as `_mix`. */
export function weeksAvgIn(M: Model, wks: readonly string[]): Record<string, number> {
  const I = IDXIn(M);
  const out: Record<string, number> = {};
  for (const w of wks) {
    const ws = I.weekSets[w] || {};
    for (const m in ws) out[m] = (out[m] || 0) + ws[m] / wks.length;
  }
  Object.defineProperty(out, '_mix', { value: cycleMixIn(M, wks, out), enumerable: false });
  return out;
}

/* On plan, as the screens say it (r54): under the minimum only by which
   days of a cycle fell in the weeks averaged (cycleMixIn). */
/** Why a muscle reads on plan though under its minimum, behind an i on the map, Volume, Muscles and the coach. */
export const ON_PLAN_TIP =
  'Your routine runs as a cycle, so some weeks hold fewer of the days that train a muscle. Every session and set it had due in these weeks was done, and over the whole cycle it reaches the target.';

/** A muscle's weekly hard sets against its target as every screen reads it: its sets, minimum and maximum, and status. */
export interface MuscleStatus {
  v: number;
  lo: number;
  hi: number;
  st: 'track' | 'none' | 'under' | 'part' | 'plan' | 'over' | 'in';
}

/* A muscle with no target (hasTargetIn, r58) is tracked ('track').
   soFar (r29): the week is still going, so a muscle short of its minimum is
   under way ('part'), not below target; amber on a Tuesday read as behind
   for training that had not happened yet. With no sets a muscle is 'none'
   whatever its target: one whose minimum was brought down to 0 (a routine
   that does not train it) showed green before a single set (V, r29). On an
   average, a muscle with a minimum and no sets is below target, and shows so
   on the map, in its legend and in the summary alike. On plan ('plan', r54):
   under its minimum only by which days of a cycle fell in the weeks averaged
   (cycleMixIn). The one reading of a muscle's status for the coach, Stats'
   summary, Volume, Muscles, the radar and the map (moved from the legacy
   script in r54, when the coach, Muscles and Volume each still judged it
   with belowMin themselves). */
/** Each muscle's status against its weekly target, from an average (with its on-plan muscles) or a week's sets so far. */
export function muscleStatusIn(
  M: Model,
  src: (Readonly<Record<string, number>> & { readonly _mix?: Readonly<Record<string, boolean>> }) | null,
  soFar?: boolean
): Record<string, MuscleStatus> {
  const b = M.s.settings.bands;
  const mix = (src && src._mix) || {};
  const out: Record<string, MuscleStatus> = {};
  for (const m of MK) {
    const v = src ? src[m] || 0 : 0;
    const [lo, hi] = b[m];
    out[m] = {
      v,
      lo,
      hi,
      st: !hasTargetIn(M, m)
        ? 'track'
        : mix[m]
          ? 'plan'
          : v <= 0
            ? !soFar && src && lo > 0
              ? 'under'
              : 'none'
            : belowMin(v, lo)
              ? soFar
                ? 'part'
                : 'under'
              : aboveMax(v, hi)
                ? 'over'
                : 'in'
    };
  }
  return out;
}

/* Region balance: hard sets in a region against that region's combined
   minimum (r29; before, the midpoint of the band). 100 means the region has
   reached its target. This is relative to the bands you set, not an
   absolute standard. A region short of its minimum only through muscles on
   plan (muscleStatusIn) is on plan, not low (r54). */
export function regionBalanceIn(
  M: Model,
  sets: Readonly<Record<string, number>> & { readonly _mix?: Readonly<Record<string, boolean>> }
) {
  const bands = M.s.settings.bands;
  const st = muscleStatusIn(M, sets);
  // A muscle with no target counts toward neither side (r29; since r58 the one rule, hasTargetIn).
  return REGIONS.map(([label, all]) => {
    const ms = all.filter(m => hasTargetIn(M, m));
    const got = ms.reduce((a, m) => a + (sets[m] || 0), 0);
    const mid = ms.reduce((a, m) => a + (bands[m][0] + bands[m][1]) / 2, 0);
    const lo = ms.reduce((a, m) => a + bands[m][0], 0);
    const hi = ms.reduce((a, m) => a + bands[m][1], 0);
    const short = belowMin(got, lo);
    const plan = short && ms.some(m => st[m].st === 'plan') && !ms.some(m => st[m].st === 'under');
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
      pct: lo > 0 ? (got / lo) * PERCENT : 0,
      low: short && !plan,
      plan,
      high: aboveMax(got, hi)
    };
  });
}

/* What a past week asked for: the routine most of its sessions were logged
   against, so switching from a 3-day to a 6-day routine does not rescore the
   weeks done on the 3-day one (r27). A week without routine sessions reads
   the active routine. Since r55 a week also keeps the sessions a week that
   routine planned, as its newest session recorded it (pwOf), so a routine
   changed or deleted since does not rescore it either. */
export function weekRoutineIn(M: Model, ws: string): Routine {
  // Built once per change and kept with the other analytics, so a streak over two years reads it, not every session per week.
  const I = IDXIn(M);
  if (!I.weekRid) {
    const by: Record<string, Record<string, number>> = {};
    const rec: Record<string, Record<string, Session>> = {};
    for (const x of M.s.sessions) {
      if (!x.routineId || x.free) continue;
      const w = weekStart(x.date);
      const c = by[w] || (by[w] = {});
      c[x.routineId] = (c[x.routineId] || 0) + 1;
      const r = rec[w] || (rec[w] = {});
      const was = r[x.routineId];
      if (x.pw && (!was || sessCmp(x, was) > 0)) r[x.routineId] = x;
    }
    I.weekRid = {};
    const pw: Record<string, number> = {};
    for (const w in by) {
      let id: string | null = null;
      for (const k in by[w]) if (id == null || by[w][k] > by[w][id]) id = k;
      I.weekRid[w] = id;
      const s = id && rec[w] ? rec[w][id] : undefined;
      if (s && s.pw) pw[w] = s.pw;
    }
    I.weekPw = pw;
  }
  const id = I.weekRid[ws];
  return (id && M.s.routines.find(r => r.id === id)) || activeRoutineIn(M);
}

/** The sessions a past week asked for: one in freestyle, else what its routine planned a week, as its sessions recorded it, or as the routine is now. */
export function weekNeedIn(M: Model, ws: string): number {
  if (freeModeIn(M)) return 1;
  const R = weekRoutineIn(M, ws);
  // weekRoutineIn has just built the week marks, weekPw among them.
  const rec = IDXIn(M).weekPw;
  return Math.max(1, (rec && rec[ws]) || plannedPerWeek(R));
}

/** The weeks the streak looks back over: two years of them. */
const STREAK_WEEKS = 104;

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
  for (let k = 1; k <= STREAK_WEEKS; k++) {
    const wk = addDays(cur, -WEEK_DAYS * k);
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
   back for four weeks with no deload done (the second review).
   Since r54 a week with nothing trained in it counts too, as the Stats line
   beside the suggestion has counted it since r30 (lastLighterWeekIn): one
   reading of a lighter week for the averages, the suggestion and that line. */
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
  // Weeks gone by since the log began with nothing trained in them, back to the first that ends inside the window.
  const off: string[] = [];
  const f = firstDate(M.s.sessions);
  if (f)
    for (let w = weekStart(f) > weekStart(from) ? weekStart(f) : weekStart(from); w < cur; w = addDays(w, WEEK_DAYS))
      if (!T[w]) off.push(w);
  /* A rest week is recovery too, and so is a week with nothing trained in it,
     or a marked deload week with nothing trained in it yet: its last day, or
     today while it runs. */
  for (const w of [
    ...(M.s.settings.restWeeks || []),
    ...(M.s.deloadWeek && !T[M.s.deloadWeek] ? [M.s.deloadWeek] : []),
    ...off
  ]) {
    const e = addDays(w, SUNDAY) < M.today() ? addDays(w, SUNDAY) : M.today();
    if (e >= from && w <= M.today() && (!d || e > d)) d = e;
  }
  return d;
}

/** What a lighter week is, in the words the Guide and Stats say it (idxLightWeeks, lighterTally). */
export const LIGHTER_WEEK_WORDS =
  'more than half its sessions done lighter, or two or more deload sessions done lighter at its end';

/** The tip beside Stats' line on the last lighter week: what counts, and what reads it. */
export const LIGHTER_WEEK_TIP = `A lighter week has ${LIGHTER_WEEK_WORDS}. A rest week or a week with nothing trained counts too. Your weekly averages leave these weeks out, and a deload is not suggested within ${DELOAD_GAP_DAYS / WEEK_DAYS} weeks of one.`;

/* The last lighter week, said under Stalls on Stats (r30). Until r54 it was
   read by hard sets, a week at 65% or less of the usual, and named weeks the
   averages kept and the deload suggestion beside it did not count (the audit
   V asked for). Since r54 it is their reading: a lighter week as the
   averages leave it out, a rest week, or a week with nothing trained.
   Completed weeks only, back to the week the log began, 12 at most; nothing
   until 4 of them were trained, nor just after two empty weeks, which are a
   break, not a lighter week (r34.2). */
/** The last lighter week is looked for in the last LIGHTER_LOOK.weeks weeks, once LIGHTER_LOOK.trained of them were trained (r30, a convention). */
const LIGHTER_LOOK = { weeks: 12, trained: 4 } as const;

/** How many weeks ago the last lighter week was and what kind it was, weeks null for none in 12, or null with nothing to say. */
export function lastLighterWeekIn(M: Model): { weeks: number | null; kind?: 'lighter' | 'rest' | 'off' } | null {
  const f = firstDate(M.s.sessions);
  if (!f) return null;
  const I = IDXIn(M);
  const cur = weekStart(M.today());
  const ks: string[] = [];
  for (let k = 1; k <= LIGHTER_LOOK.weeks && addDays(cur, -WEEK_DAYS * k) >= weekStart(f); k++)
    ks.push(addDays(cur, -WEEK_DAYS * k));
  const trained = (w: string): boolean => weekSessionsIn(M, w) > 0;
  if (ks.filter(trained).length < LIGHTER_LOOK.trained) return null;
  if (ks.length >= 2 && !trained(ks[0]) && !trained(ks[1])) return null;
  for (let k = 0; k < ks.length; k++) {
    const w = ks[k];
    const kind = isRestWeekIn(M, w) ? 'rest' : !trained(w) ? 'off' : I.lightWk[w] ? 'lighter' : null;
    if (kind) return { weeks: k + 1, kind };
  }
  return { weeks: null };
}

/** This week on Today: the routine, sessions done and planned, hard sets against the plan, cardio, a rest week. */
export function weekStatsIn(M: Model) {
  const R = activeRoutineIn(M);
  const cur = weekStart(M.today());
  const weekly = R.schedule === 'weekly';
  let cardioMin = 0,
    cardioN = 0;
  for (const c of M.s.cardio)
    if (c.date >= cur && c.date <= addDays(cur, SUNDAY)) {
      cardioMin += c.min;
      cardioN++;
    }
  const doneDays = weekSessionsIn(M, cur);
  const planDays = plannedPerWeek(R);
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
    pct: !rest && tgt > 0 ? Math.min(PERCENT, (got / tgt) * PERCENT) : 0,
    cardioMin,
    cardioN,
    rest
  };
}
