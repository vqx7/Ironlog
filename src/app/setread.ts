/* Reading a set: its effort as RIR (typed, a RIR check, or the lift's usual), the
   RIR checks' calibration, whether it was hard, the bodyweight it is read with, and its load, PR load and weight
   lifted. Each function that reads the log, the date or a cache takes the model first (model.ts). */
import type { Bodyweight, OpenSet, OpenWorkout, Rir } from './types';
import type { CalStats, CalSummary, CheckSet, Efforts, ExerciseLike, Model, RatedSet } from './model';
import { bwShare, isCompound, loadMode } from './library';
import { addDays, median, WEEK_DAYS } from './util';
import { EXIn, rirHalfOnIn } from './model';
import { isWork, setCredit, E1_MAX_RIR, HARD_RIR, HALF_SET } from './formulas';

import { EFFORT_TOP } from './records';
/** A set's effort as these read it: its RIR as typed, and whether it was a RIR check. */
type Effort = { rir?: Rir; cal?: unknown };

/** A set as the hard-set count reads it: a working set's reps, marks and effort. */
type CountedSet = Effort & { r: number | string | null; warm?: boolean | undefined; drop?: boolean | undefined };

/** A set's load and reps as typed, as the load and tonnage read them. */
export type LoadedSet = { w?: number | string | null | undefined; r?: number | string | null | undefined };

/** The bodyweight logged on or before a date, or null. */
function bwKnownAtIn(M: Model, date: string): number | null {
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

/** The RIR calibration's numbers, below. */
export const CAL_WEEKS = 12,
  CAL_N = 8,
  CAL_SHRINK = 3,
  CAL_CAP = 2,
  CAL_MIN = 2;

/** A lift's usual RIR is read once it has RIR_USUAL_MIN rated working sets in the CAL_WEEKS weeks before the day read (a convention). */
export const RIR_USUAL_MIN = 3;

/** The days a reading of effort looks back over: the CAL_WEEKS weeks before the day read. */
const LOOKBACK_DAYS = WEEK_DAYS * CAL_WEEKS;

/* ---------- the day a set is read as of ----------
   A set's effort is read from the 12 weeks before its workout's day: a blank by the lift's usual effort then, and with
   Corrected RIR on a rated one by the RIR checks then. Read as of today, a past workout would move as later ones
   were logged (a blank read at today's usual; October's checks correcting September's ratings). Read from before its
   day, nothing logged that day or after moves it, so a set reads the same as it is ticked, in the recap and on every
   list once saved (a row never announces a PR its saved session then does not count). A workout not yet saved is read
   in the log as it will be once saved: its saved copy and the session it is an edit of left out (an edit moved to a
   later day must not read its own saved ratings), its ticked rows in on its day. */

/** A workout not yet saved as a reading of effort takes it: its day, its saved copy's id and the session it is an edit
    of, which the reading leaves out, and its rows, which it puts in on its day. */
type OpenRead = Pick<OpenWorkout, 'date'> & Partial<Pick<OpenWorkout, 'id' | 'editingId' | 'ex'>>;

/** The day a set's effort is read as of: a saved workout's date, or a workout not yet saved. */
export type ReadDay = string | OpenRead;

/** The date a reading is as of. */
export const dayOf = (at: ReadDay): string => (typeof at === 'string' ? at : at.date);

/** A workout not yet saved's own rated sets and RIR checks, on its day, as Finish saves its rows. */
type Own = { date: string; rated: Map<string, RatedSet[]>; checks: CheckSet[] };

/* What one reading sees: its day, the saved sessions it leaves out, and a workout not yet saved's own sets. A lift's
   first usual effort is read in the same log, as of the day after it formed. */
type View = { day: string; out: readonly string[]; own: Own | null };

/** A set's RIR as typed, as a number, or null when blank or not a number. */
function typedRir(s: Effort): number | null {
  if (s.rir == null || s.rir === '') return null;
  const v = +s.rir;
  return isFinite(v) ? v : null;
}

/* One lift's rows added to the lists: its rated working sets (not warm-ups, drop sets, RIR checks or timed holds) and
   its RIR checks (not a demo session's). A workout not yet saved gives its ticked rows alone, each as Finish saves it
   (savedEx: a warm-up keeps no drop or check mark). */
function addRows(
  M: Model,
  to: { rated: Map<string, RatedSet[]>; checks: CheckSet[] },
  b: { exId: string; sets: readonly OpenSet[] },
  date: string,
  sid: string,
  o: { demo: boolean; open: boolean }
): void {
  const ex = EXIn(M, b.exId);
  // The kind of lift is read only for a block with a RIR check: most have none.
  let c: 'c' | 'i' | null = null;
  for (const x of b.sets) {
    if (o.open && !x.done) continue;
    const cal = x.cal && !(o.open && x.warm) ? x.cal : null;
    const r = Number(x.r) || 0;
    if (cal && !o.demo && r >= cal.at)
      to.checks.push({ date, err: r - cal.at - cal.pred, c: c ?? (c = isCompound(ex) ? 'c' : 'i'), sid });
    if (ex.timed || !isWork(x) || (x.drop && !(o.open && x.warm)) || cal) continue;
    const v = typedRir(x);
    if (v == null) continue;
    const l = to.rated.get(b.exId);
    if (l) l.push({ date, rir: v, sid });
    else to.rated.set(b.exId, [{ date, rir: v, sid }]);
  }
}

const byDate = (a: { date: string }, b: { date: string }): number => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/** The first place in a list in date order whose day is on or after `d`. */
function bound(list: readonly { date: string }[], d: string): number {
  let lo = 0,
    hi = list.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (list[m].date < d) lo = m + 1;
    else hi = m;
  }
  return lo;
}

/** The log's efforts as saved, built once per change. */
function effortsIn(M: Model): Efforts {
  if (M.c._eff) return M.c._eff;
  const checks: CheckSet[] = [];
  const to = { rated: new Map<string, RatedSet[]>(), checks };
  for (const s of M.s.sessions) for (const b of s.ex) addRows(M, to, b, s.date, s.id, { demo: !!s.demo, open: false });
  for (const l of to.rated.values()) l.sort(byDate);
  checks.sort(byDate);
  return (M.c._eff = {
    ...to,
    cal: new Map<string, CalStats>(),
    usual: new Map<string, Map<string, number | null>>(),
    first: new Map<string, { date: string; v: number } | null>()
  });
}

/** What a reading as of `at` sees (above). */
function viewOf(M: Model, at: ReadDay): View {
  if (typeof at === 'string') return { day: at, out: [], own: null };
  const out: string[] = [];
  if (at.id) out.push(at.id);
  if (at.editingId) out.push(at.editingId);
  const checks: CheckSet[] = [];
  const own = { date: at.date, rated: new Map<string, RatedSet[]>(), checks };
  for (const b of at.ex || []) addRows(M, own, b, at.date, '', { demo: false, open: true });
  return { day: at.date, out, own };
}

/** Whether a view reads the log as saved, whose readings are kept per day. */
const asSaved = (v: View): boolean => !v.out.length && !v.own;

/** The entries of a saved list, in date order, a view sees from the weeks before its day: those of the sessions it
    leaves out taken away, and a workout not yet saved's own put in on its day, after the saved ones of that day. */
function before<T extends { date: string; sid: string }>(
  saved: readonly T[],
  own: readonly T[],
  v: View
): readonly T[] {
  const from = addDays(v.day, -LOOKBACK_DAYS);
  let got = saved.slice(bound(saved, from), bound(saved, v.day));
  if (v.out.length) got = got.filter(p => !v.out.includes(p.sid));
  if (!own.length || !v.own || v.own.date < from || v.own.date >= v.day) return got;
  const at = bound(got, addDays(v.own.date, 1));
  return [...got.slice(0, at), ...own, ...got.slice(at)];
}

/* Calibration sets across your real sessions. err is reps actually left at the
   stopping point minus reps you called: positive means you stop with more in
   the tank than you think. People mostly under-call it by about a rep
   (Halperin 2022). The correction is the median of the last CAL_N from the
   CAL_WEEKS weeks before the day read, shrunk toward zero while there are few (x
   n/(n+CAL_SHRINK): 40% at 2 sets, 73% at 8), rounded to half a rep and capped
   at CAL_CAP reps either way; it applies once CAL_MIN checks are in, to sets
   called at E1_MAX_RIR or less, where the checks measure the error. Conventions. */
/** The RIR checks of a list summed up: how many, their median error, the correction, the mean error. */
function calSummary(list: readonly { err: number }[]): CalSummary {
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

/** The RIR checks of a list in date order summed up: how many, the last one's day, and the summaries, all and by kind of lift, of those from `from` on. */
function calStatsOf(list: readonly CheckSet[], from: string): CalStats {
  const rec = list.slice(bound(list, from));
  return {
    ...calSummary(rec),
    n: list.length,
    lastDate: list.length ? list[list.length - 1].date : null,
    cls: { c: calSummary(rec.filter(p => p.c === 'c')), i: calSummary(rec.filter(p => p.c === 'i')) }
  };
}

/** The RIR checks a set is corrected by: those of the weeks before its view's day, summed up, and how many and the
    last before it. Read only for its summaries, so the count and the last are of the weeks too. */
function calOf(M: Model, v: View): CalStats {
  const eff = effortsIn(M);
  const hit = asSaved(v) ? eff.cal.get(v.day) : undefined;
  if (hit) return hit;
  const out = calStatsOf(before(eff.checks, v.own ? v.own.checks : [], v), addDays(v.day, -LOOKBACK_DAYS));
  if (asSaved(v)) eff.cal.set(v.day, out);
  return out;
}

/** The RIR checks up to today, today's included, the log as saved: what Settings shows and the next check waits on. */
export function calStatsIn(M: Model): CalStats {
  const eff = effortsIn(M);
  const day = M.today();
  return calStatsOf(eff.checks.slice(0, bound(eff.checks, addDays(day, 1))), addDays(day, -LOOKBACK_DAYS));
}

/* RIR as the analytics read it. Off: ignored everywhere, so every working
   set counts as hard and estimates use reps alone. On: as logged. Corrected: as
   logged, shifted by the median error of the RIR checks of the 12 weeks before
   the set's day once there are at least two. The log itself is never changed, so
   switching modes is fully reversible. A calibration set is logged to failure
   and is never shifted. The correction is only applied to sets called at RIR 4
   or less, because calibration sets measure the error close to failure, and a
   compound lift uses compound calibration sets when there are two or more
   (isolation likewise), else all of them. */
function correctedOf(M: Model, v: number, k: 'c' | 'i' | null, view: View): number {
  if (M.s.settings.rirMode !== 'cal' || v > E1_MAX_RIR) return v;
  const c = calOf(M, view);
  const src = k && c.cls[k].recent >= CAL_MIN ? c.cls[k] : c;
  return src.recent >= CAL_MIN && src.bias ? Math.min(EFFORT_TOP, Math.max(0, v + src.bias)) : v;
}

/** The kind of lift whose RIR checks correct a set: compound or isolation, or either with no lift given. */
const kindOf = (ex: ExerciseLike | null | undefined): 'c' | 'i' | null => (ex ? (isCompound(ex) ? 'c' : 'i') : null);

/** A set's RIR as read on its workout's day (above), or null: blank, or RIR off. */
export function rirEffIn(M: Model, s: Effort, ex: ExerciseLike | null | undefined, at: ReadDay): number | null {
  const m = M.s.settings.rirMode;
  if (m === 'off') return null;
  const v = typedRir(s);
  if (v == null) return null;
  // Only Corrected RIR reads the day, so a set read otherwise needs no view of it.
  return s.cal || m !== 'cal' || v > E1_MAX_RIR ? v : correctedOf(M, v, kindOf(ex), viewOf(M, at));
}

/** A lift's usual effort as a view sees it: the median of its rated sets of the weeks before its day, each read with
    that day's correction, once there are RIR_USUAL_MIN; null with fewer. */
function usualFrom(M: Model, ex: ExerciseLike, v: View): number | null {
  const saved = effortsIn(M).rated.get(ex.id) || [];
  const got = before(saved, (v.own && v.own.rated.get(ex.id)) || [], v);
  if (got.length < RIR_USUAL_MIN) return null;
  if (M.s.settings.rirMode !== 'cal') return median(got.map(p => p.rir));
  const k = kindOf(ex);
  return median(got.map(p => correctedOf(M, p.rir, k, v)));
}

/** A lift's first usual effort in a view's log, read on the day after the first day it had RIR_USUAL_MIN rated sets
    in the weeks to it, that day's included; with that day after, or null if it has none. */
function firstOf(M: Model, ex: ExerciseLike, v: View): { date: string; v: number } | null {
  const saved = effortsIn(M).rated.get(ex.id) || [];
  const days = new Set<string>();
  for (const p of saved) if (!v.out.includes(p.sid)) days.add(p.date);
  if (v.own && v.own.rated.get(ex.id)) days.add(v.own.date);
  for (const d of [...days].sort()) {
    const day = addDays(d, 1);
    const u = usualFrom(M, ex, { ...v, day });
    if (u != null) return { date: day, v: u };
  }
  return null;
}

/* A blank RIR, for estimates and the hard-set count. RIR is optional and
   opened with a tap, so most logs mix rated and blank sets. Reading every
   blank as 0 would make the same 100 x 8 estimate lower when left blank than
   when rated 2, so trends would dip, stalls be flagged and PRs appear just
   from whether RIR was tapped. A blank is instead read as your usual RIR on that
   lift as of its workout's day: the median of your rated working sets of it
   (not warm-ups, drop sets or RIR checks) in the 12 weeks before that day,
   once there are at least 3. That is a convention, not a study figure. Before
   a lift's first usual RIR forms, its blanks read that first one, which never
   moves once formed, so a lifter who starts rating sees no step in the lift's
   history. After it, in weeks with fewer than 3, a blank counts as
   hard and as 0 for estimates, which errs low and never inflates a PR.
   Recovery and the "that load was light" step read only the RIR you entered,
   since both act on what you said about effort. RIR off: no ratings are read
   at all. */
/** A lift's usual RIR as of a day (above), or null. */
export function rirUsualIn(M: Model, exId: string, at: ReadDay): number | null {
  if (M.s.settings.rirMode === 'off') return null;
  const eff = effortsIn(M);
  // A saved day read before is a lookup, the many reads of the index's sets with it.
  const kept = typeof at === 'string' ? eff.usual.get(exId)?.get(at) : undefined;
  if (kept !== undefined) return kept;
  const v = viewOf(M, at);
  // The log as saved has its readings kept per lift and day; a workout not yet saved's are read each time.
  let byDay = asSaved(v) ? eff.usual.get(exId) : undefined;
  if (asSaved(v) && !byDay) eff.usual.set(exId, (byDay = new Map<string, number | null>()));
  const hit = byDay ? byDay.get(v.day) : undefined;
  if (hit !== undefined) return hit;
  const ex = EXIn(M, exId);
  let u = usualFrom(M, ex, v);
  if (u == null) {
    let f = asSaved(v) ? eff.first.get(exId) : undefined;
    if (f === undefined) {
      f = firstOf(M, ex, v);
      if (asSaved(v)) eff.first.set(exId, f);
    }
    if (f && f.date > v.day) u = f.v;
  }
  if (byDay) byDay.set(v.day, u);
  return u;
}

/** A set's RIR as read, else the lift's usual RIR for a blank, each as of its workout's day, else null. */
export const rirEstIn = (M: Model, s: Effort, ex: ExerciseLike | null | undefined, at: ReadDay): number | null => {
  const q = rirEffIn(M, s, ex, at);
  return q != null ? q : ex ? rirUsualIn(M, ex.id, at) : null;
};

/* Hard set: RIR HARD_RIR or less (Robinson 2024, Refalo 2023: growth rises as sets
   end closer to failure; the exact cut-off is a convention). A blank RIR is
   read as above and shown as assumed. A drop set is half a set: one heavy
   set with three drops is not four sets of work. */
/** Whether a working set was hard, read as of its workout's day. */
export const isHardIn = (M: Model, s: CountedSet, ex: ExerciseLike | null | undefined, at: ReadDay): boolean => {
  if (!isWork(s)) return false;
  const q = rirEstIn(M, s, ex, at);
  return q == null || q <= HARD_RIR;
};

/* Count RIR 4 to 5 as half a set (a setting, off by default).
   Any working set past RIR 3 counts half: calls top out at 5, but Corrected
   RIR can read a call of 4 as 5.5 or 6, and that set is no less hard than a
   call of 5.
   Growth rises as sets end closer to failure (Robinson 2024), so sets a long
   way short still do something; half is a convention, not a measured dose.
   It moves the weekly hard sets, the bands they are read against and the
   plan's weekly sets, and nothing else: estimates, PRs, recovery and the
   per-session flag keep counting hard sets only. With RIR off every working
   set is hard already, so the setting has nothing to do. */
/** A set's weekly credit: a hard set's (a drop set half), or with RIR 4 to 5 as half a set on, half of it; read as of its workout's day. */
export function hardCreditIn(M: Model, s: CountedSet, ex: ExerciseLike | null | undefined, at: ReadDay): number {
  if (isHardIn(M, s, ex, at)) return setCredit(s);
  if (!rirHalfOnIn(M) || !isWork(s)) return 0;
  const q = rirEstIn(M, s, ex, at);
  return q != null && q > HARD_RIR ? setCredit(s) * HALF_SET : 0;
}

/** The bodyweight part of a bodyweight lift's load on a date (0 on any other lift). */
export function bwLoadIn(M: Model, ex: ExerciseLike | null | undefined, date: string): number {
  return ex && ex.bw ? (bwAtIn(M, date) || 0) * bwShare(ex) : 0;
}

/** The total a set moved: its load as typed plus, on a bodyweight lift, that day's bodyweight share. */
export function loadOfIn(M: Model, ex: ExerciseLike | null | undefined, s: LoadedSet, date: string): number {
  // A row with no load reads as 0: Number(null) is 0, and NaN || 0 is 0.
  return bwLoadIn(M, ex, date) + (Number(s.w) || 0);
}

/* PRs on a bodyweight lift are judged at one bodyweight: the latest
   weigh-in, the same for every session. Were each set's load to include the
   bodyweight of its day, a weigh-in 0.4 kg up would make the same 8 pull-ups
   or 12 leg raises a new PR every week (8 identical weeks, 10 PRs counted),
   and the bests board would date a record to the heaviest day, not the
   first. A PR on these lifts is more reps or more added load than before, as
   lifters count them. Estimates, trends, charts and the load engine are read
   at the latest weigh-in too (see IDX's pts); weight lifted keeps each
   day's. */
export const bwRefIn = (M: Model): number =>
  M.c._bwRef !== undefined ? M.c._bwRef : (M.c._bwRef = bwAtIn(M, '9999-12-31') || 0);

// The bodyweight part of a bodyweight lift's load at the latest weigh-in: what the engine and every reading use.
export const bwRefLoadIn = (M: Model, ex: ExerciseLike | null | undefined): number =>
  ex && ex.bw ? bwRefIn(M) * bwShare(ex) : 0;

/** Whether a lift reads bodyweight while none is logged: its estimates would be of the added load alone, so it has
    none until a weigh-in (not "Best estimate ≈ 28.9 kg ... total" for +20 kg pull-ups), as its trend waits (the
    Guide's Trends). Its reps, weight PRs and targets read without one. */
export const noBodyIn = (M: Model, ex: ExerciseLike | null | undefined): boolean =>
  !!ex && !!ex.bw && !(bwRefIn(M) > 0);

/** The load a set's PRs are judged at: on a bodyweight lift at the latest weigh-in, else loadOf. */
export function prLoadIn(M: Model, ex: ExerciseLike | null | undefined, s: LoadedSet, date: string): number {
  // A row with no load reads as 0, as in loadOfIn.
  return ex && ex.bw ? bwRefIn(M) * bwShare(ex) + (Number(s.w) || 0) : loadOfIn(M, ex, s, date);
}

/* Weight actually moved by one set, for weekly totals. */
export function tonnageIn(M: Model, ex: ExerciseLike, s: LoadedSet, date?: string): number {
  const m = loadMode(ex);
  // A row with no load or reps reads as 0, as in loadOfIn.
  const w = Number(s.w) || 0;
  // Assisted with no bodyweight logged would go below 0; weight lifted is then 0.
  /* Bodyweight known on or before the date only: a first weigh-in
     logged today used to be applied to every earlier session, so weight
     lifted in past weeks changed after the fact (4,420 to 6,634 kg). */
  const known = bwKnownAtIn(M, date || M.today());
  const bl = ex && ex.bw && known != null ? known * bwShare(ex) : 0;
  const load = m === 'bw' ? Math.max(0, bl + w) : m === 'each' || m === 'side' ? w * 2 : w;
  return load * (Number(s.r) || 0) * (ex.perSide ? 2 : 1);
}
