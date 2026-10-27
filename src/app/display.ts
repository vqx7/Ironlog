/* Words and numbers more than one screen shows (r57): moved with History,
   the first screen to move that reads them, and with Plan and Stats (r58),
   and imported by every screen that shows them. Each is as it was in the
   legacy script it came from (deleted in r63). */

import { IN, KM_MI, FT_IN } from './units';
import { NIL, fmtDate, fmtWith, missedTag } from './format';
import { e1, fitE, trendE, RECENT_DAYS, BEST_WEEKS, TAPE_WEEKS } from './formulas';
import { MK, isCommon, loadMode, nameMatch } from './library';
import { routineEmpty, routineSig, sessDayIdx } from './routines';
import { rec } from './records';
import { REGION_WKS, REGION_WK_DEFAULT } from './layout';
import {
  addDays,
  daysBetween,
  r1,
  today,
  uid,
  weekStart,
  EPS,
  EPS_SAME,
  yearOf,
  HUNDREDTHS,
  PERCENT,
  WEEK_DAYS,
  SUNDAY,
  dayOfWeek
} from './util';
import { loadNote } from './loads';
import { goalOk } from './goals';
import { avgWeeksTxt } from './weeks';
import { SIZE_MAP } from './coach';
import { REGION_KEY, prefGet } from './storage';
import { effShow, rirScale } from './effort';
import {
  EX,
  IDX,
  liftRead,
  U,
  activeRoutine,
  allTimeBests,
  avgFirstWeek,
  avgWeeks,
  bwRef,
  bwRefLoad,
  dateIndex,
  dayMinutes,
  isRestWeek,
  defPlan,
  loadLabel,
  logBack,
  sortedSessions,
  toD,
  weeksAvg,
  cycleState
} from './live';
import { state, ui } from './store';
import type { ExPoint, Exposure, ExerciseLike, Pr } from './model';
import type { Day, Exercise, LoggedSet, Measurement, PlanItem, Routine, Session } from './types';

/** Whether nothing is logged yet. */
export function noLog(): boolean {
  return !state.sessions.length;
}

/** The sessions logged on a date, in the order done. */
export const sessionsOn = (d: string): Session[] => dateIndex().byDate[d] || [];

/** A load lifted is written in thousands (12k) from K_FROM, whole below it. */
const K_FROM = 10000,
  K = 1000;
/** A load lifted, in the unit on screen: whole, and in thousands from K_FROM. */
export function fmtK(kg: number): string {
  const v = Math.round(toD(kg) ?? 0);
  return v >= K_FROM ? Math.round(v / K) + 'k' : v.toLocaleString();
}

/** The unit cardio distances are shown in: km with kg, miles with lb. */
export const distU = (): 'km' | 'mi' => (U() === 'kg' ? 'km' : 'mi');

/** A distance kept in km, in the unit on screen, to two places. */
export const distShow = (km: number): number => Math.round((U() === 'kg' ? km : km / KM_MI) * HUNDREDTHS) / HUNDREDTHS;

/** One set, short: the load and reps (185×8), or the hold (BW for 45s). */
export function setShort(
  ex: Pick<Exercise, 'bw' | 'timed'>,
  w: number | string | null | undefined,
  r: number | string | null
): string {
  return ex.timed ? `${loadLabel(ex, +(w ?? 0) || 0)} for ${r}s` : `${loadLabel(ex, +(w ?? 0) || 0)}×${r}`;
}

/** One saved set as History lists it: its mark, load and reps, missed, the effort called and a calibration set. */
export function setStr(
  ex: Pick<Exercise, 'bw' | 'timed'>,
  x: Pick<LoggedSet, 'w' | 'warm' | 'drop' | 'cal'> & {
    r: number | string | null;
    rir?: number | string | null | undefined;
  }
): string {
  return `${x.warm ? '(W) ' : x.drop ? '(D) ' : ''}${setShort(ex, x.w, x.r)}${missedTag(x)}${!ex.timed && x.rir != null && x.rir !== '' ? (rirScale() === 'rpe' ? ' @RPE ' + effShow(x.rir) : ' @' + effShow(x.rir)) : ''}${x.cal ? ' (RIR check)' : ''}`;
}

/* ---------- moved with Plan and Stats (r58) ---------- */

/** The number for a tile, or a dash before anything is logged. */
export const nz = (v: number | string): number | string => (noLog() ? NIL : v);

/** Whether a lift's sets take an RIR: RIR is on and it is not a timed hold. */
export const rirShow = (ex: { timed?: boolean | undefined } | null | undefined): boolean =>
  state.settings.rirMode !== 'off' && !(ex && ex.timed);

/** A plan's target effort as the lifter enters effort: "1 RIR", or "RPE 9" in RPE mode. */
export function effTgt(rir: number | string | null | undefined): string {
  return rirScale() === 'rpe' ? `RPE ${effShow(rir)}` : `${effShow(rir)} RIR`;
}

/* Estimates (1RM, PR toasts, the bests board) are good to a few percent at
   best, so they show whole pounds or half kilos (r34): 293.8 next to 294 and
   301 read as precision the numbers do not have. Loads keep their decimals. */
/** An estimate in the unit on screen: whole pounds or half kilos, or '' for none. */
export function fmtE(kg: number | null | undefined): string {
  if (kg == null || isNaN(kg)) return '';
  const v = toD(kg) ?? 0;
  return String(U() === 'lb' ? Math.round(v) : Math.round(v * 2) / 2);
}

/* A best estimate a little above the one before it can show as the same
   number (r64, the r63 audit's P-S4-2: "Best estimate 8 lb per dumbbell
   (was 8)"): the PR stands, and a "was" that reads the same number is left
   out, in the recap and the toast alike. */
/** What an estimate was before, as shown, or '' when it shows as the same number now. */
export function wasE(now: number | null | undefined, before: number | null | undefined): string {
  const b = fmtE(before);
  return b && b !== fmtE(now) ? b : '';
}

/** The unit tape measurements are shown in: inches with lb, cm with kg. */
export const LU = (): 'in' | 'cm' => (U() === 'lb' ? 'in' : 'cm');
/** A tape entry's site in cm, or undefined when it was not measured. */
export function measAt(m: Measurement, k: string): number | undefined {
  const v = rec(m)?.[k];
  return typeof v === 'number' ? v : undefined;
}
/** A length as typed in the unit on screen, in cm. */
export const lenFrom = (v: number): number => (U() === 'lb' ? v * IN : v);

/** A length kept in cm, in the unit on screen, to one place, or '' for none. */
export const lenD = (cm: number | null | undefined): string =>
  cm == null ? '' : String(r1(U() === 'lb' ? cm / IN : cm));

/** A load lifted, whole, with thousands separated (295,403). */
export const fmtBig = (kg: number): string => Math.round(toD(kg) ?? 0).toLocaleString();

/** The load column's heading: the unit, and what the number is (each, per side, the stack, added, or the machine's help). */
export function loadHead(ex: ExerciseLike | null | undefined): string {
  const m = loadMode(ex),
    u = U().toUpperCase();
  if (ex && ex.assist) return 'Help ' + u;
  return m === 'each' ? u + ' each' : m === 'side' ? u + '/side' : m === 'stack' ? 'Stack' : m === 'bw' ? '+' + u : u;
}

/* Here, not in format.ts beside fmtDate: only the screens use it, and format.ts is one of the engine's modules, whose share of lines run is a ratchet (tests/engine.js). */
/** A date as "Oct 17", with its year when it is not this one ("Mar 1, 2027"): a date a year ahead is not read as one this year. */
export const fmtDateYr = (s: string): string =>
  yearOf(s) === yearOf(today()) ? fmtDate(s) : fmtWith('dy', { month: 'short', day: 'numeric', year: 'numeric' }, s);

/** A date written out: "Sat, Oct 24, 2026". */
export const fmtDateLong = (s: string): string =>
  fmtWith('l', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }, s);

/** A session's strongest set by reps alone: its score and the set as typed. */
export function topSetPt(ex: ExerciseLike, x: Exposure): { v: number; txt: string } {
  let q: { v: number; p: ExPoint } | null = null;
  for (const p of x.pts) {
    const v = trendE(p.load, p.r, 0) || 0;
    if (!q || v > q.v) q = { v, p };
  }
  return q ? { v: q.v, txt: setShort(ex, q.p.w, q.p.r) } : { v: 0, txt: '' };
}

/** A lift's strongest working set by reps alone, with its date; at one score, the one with more reps (r55). */
export function bestSet(exId: string): { v: number; w: number; r: number; date: string } | null {
  let b: { v: number; w: number; r: number; date: string } | null = null;
  for (const x of liftRead(exId))
    for (const p of x.pts) {
      const v = trendE(p.load, p.r, 0) || p.load;
      if (!b || v > b.v + EPS || (v > b.v - EPS && p.r > b.r)) b = { v, w: p.w, r: p.r, date: x.date };
    }
  return b;
}

/* An isolation lift's best-estimate PR is shown as the set that set it, not
   as a 1RM (r30): the strongest set of that lift in that session. */
/** The set with the best estimate in a lift's session on a date, or null. */
export function prSet(exId: string, date: string): { v: number; w: number; r: number } | null {
  const x = (IDX().byEx[exId] || []).find(q => q.date === date);
  if (!x) return null;
  let b: { v: number; w: number; r: number } | null = null;
  for (const p of x.pts) {
    const v = e1(p.load, p.r, p.rq);
    if (v != null && (!b || v > b.v)) b = { v, w: p.w, r: p.r };
  }
  return b;
}

/* The last 28 days, today included, and the 28 before: the one window for
   sessions and PRs on Today, the Stats tiles and Recent PRs (r46). The 4
   weeks before are given only when the log covers all of them, so 2 days of
   a first month never read as a jump. Counted PRs only (r32). */
/* The screens use recent4w; the suites reach for this one to check a window
   of their own (r63, from the legacy script's 19-today.js). */
/** The counted PRs (the ones marked big, r32) of the last days given. */
export function prsWithin(days: number): Pr[] {
  const from = addDays(today(), -days);
  return IDX().prs.filter(x => x.date >= from && x.big);
}
/** Sessions and counted PRs in the last 4 weeks, and in the 4 before when the log covers them. */
export function recent4w(): { back: boolean; sess: number; sessP: number; prs: Pr[]; prsP: number } {
  // The window's days counted with today: RECENT_DAYS of them, and the RECENT_DAYS before.
  const d28 = addDays(today(), -(RECENT_DAYS - 1)),
    d56 = addDays(today(), -(2 * RECENT_DAYS - 1));
  const ss = sortedSessions();
  const first = ss[0];
  const back = !!first && first.date <= d56;
  const in28 = (d: string): boolean => d >= d28,
    in56 = (d: string): boolean => d >= d56 && d < d28;
  const P = IDX().prs.filter(p => p.big);
  return {
    back,
    sess: ss.filter(x => in28(x.date)).length,
    sessP: ss.filter(x => in56(x.date)).length,
    prs: P.filter(p => in28(p.date)),
    prsP: P.filter(p => in56(p.date)).length
  };
}

/** The weight lifted in a week, to its day `upto` (0 Monday), or all of it. */
function weekVolume(ws: string, upto?: number | null): number {
  const end = addDays(ws, upto == null ? SUNDAY : upto);
  let v = 0;
  for (const x of IDX().sessVol) if (x.date >= ws && x.date <= end) v += x.vol;
  return v;
}
/* This week so far against last week at the same point, so a Tuesday is
   never compared with a whole finished week. */
/** Weight lifted this week so far, last week to the same day and in full, and the change. */
export function tonnageNow(): { now: number; prev: number; prevFull: number; delta: number | null } {
  const cur = weekStart(today());
  const off = daysBetween(cur, today());
  const now = weekVolume(cur, off),
    prev = weekVolume(addDays(cur, -WEEK_DAYS), off),
    prevFull = weekVolume(addDays(cur, -WEEK_DAYS));
  return { now, prev, prevFull, delta: prev > 0 ? (now / prev - 1) * PERCENT : null };
}

/* Bodyweight rate: the week's average now against the week's average
   BW_RATE.from to BW_RATE.to days earlier (2 to 6 weeks), per week. Needs
   entries at least BW_RATE.from days apart. */
/** The span the bodyweight rate reads, in days (a convention). */
const BW_RATE = { from: 14, to: 42 } as const;
/** The bodyweight's weekly change, in percent and kg, and the dates it reads, or null. */
export function bwRate(): { pct: number; wk: number; days: number; from: string; to: string } | null {
  const bw = [...state.bodyweights].sort((a, b) => (a.date < b.date ? -1 : 1));
  const last = bw[bw.length - 1];
  if (bw.length < 2 || !last) return null;
  const avgAt = (d: string): number => {
    const from = addDays(d, -(WEEK_DAYS - 1));
    const w = bw.filter(x => x.date >= from && x.date <= d);
    return w.reduce((a, x) => a + x.kg, 0) / w.length;
  };
  const first = bw.find(
    x => daysBetween(x.date, last.date) <= BW_RATE.to && daysBetween(x.date, last.date) >= BW_RATE.from
  );
  if (!first) return null;
  const days = daysBetween(first.date, last.date);
  const a = avgAt(first.date),
    b = avgAt(last.date);
  return {
    pct: (((b / a - 1) * PERCENT) / days) * WEEK_DAYS,
    wk: ((b - a) / days) * WEEK_DAYS,
    days,
    from: first.date,
    to: last.date
  };
}
/* The weekly rate in the lifter's unit (r41): "+0.4 lb a week" is what a
   scale shows. Under BW_FLAT of a unit a week reads flat. */
/** Half the last digit the weekly rate shows (a tenth of a unit): less reads flat. */
const BW_FLAT = 0.05;
/** The bodyweight's weekly rate in words, in the unit on screen. */
export function bwWeekTxt(r: { wk: number }): string {
  const v = toD(r.wk) ?? 0;
  return Math.abs(v) < BW_FLAT ? 'Flat' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)} ${U()} a week`;
}

/** A height kept in cm, as the lifter reads it: 5'10" with lb, 178 cm with kg. */
export function heightTxt(cm: number | null | undefined): string {
  if (cm == null) return '';
  if (U() === 'kg') return `${Math.round(cm)} cm`;
  const i = Math.round(cm / IN);
  return `${Math.floor(i / FT_IN)}'${i % FT_IN}"`;
}

/* ---------- routines, as Plan reads them ---------- */

/** The routine Plan shows (ui.bRoutine), else the one in use. */
export function curRoutineB(): Routine {
  return state.routines.find(r => r.id === ui.bRoutine) || activeRoutine();
}
/** A plan item anywhere in the routines, with its routine, day and place, or null. */
export function findItem(uidv: string | undefined): { r: Routine; di: number; i: number; it: PlanItem } | null {
  for (const r of state.routines)
    for (let di = 0; di < r.days.length; di++) {
      const d = r.days[di];
      const i = d ? d.items.findIndex(x => x.uid === uidv) : -1;
      const it = d && i >= 0 ? d.items[i] : undefined;
      if (d && it) return { r, di, i, it };
    }
  return null;
}
/** A new plan item for an exercise, at its default plan, its fields in the order normalize() writes them (no superset). */
export function newItem(exId: string): PlanItem {
  return { uid: uid(), exId, ...defPlan(exId), ss: null };
}
/** Whether another routine already has this name, ignoring case and spaces at the ends. */
export const nameTaken = (nm: string, exceptId?: string): boolean =>
  state.routines.some(r => r.id !== exceptId && r.name.trim().toLowerCase() === nm.trim().toLowerCase());
/** Routines with no logged sessions that are empty or an exact copy of one before them, other than the one in use. */
export function routineClutter(): Routine[] {
  const used = new Set(state.sessions.map(x => x.routineId));
  const seen = new Set<string>();
  const out: Routine[] = [];
  for (const r of state.routines) {
    const sig = routineSig(r);
    const dup = seen.has(sig);
    seen.add(sig);
    if (r.id === state.activeRoutineId || used.has(r.id)) continue;
    if (routineEmpty(r) || dup) out.push(r);
  }
  return out;
}

/** The library's exercises a search, a muscle, a kind of equipment and a kind (common or less common) leave, by name; archived ones never. */
export function libFiltered(q: string | null | undefined, m: string, e: string, kind: string | false): Exercise[] {
  const t = (q || '').toLowerCase().trim();
  return state.exercises
    .filter(
      x =>
        !x.archived &&
        (!t || nameMatch(x.name, t)) &&
        (!m || x.primary === m || x.secondary.includes(m)) &&
        (!e || x.equip === e) &&
        (!kind || (kind === 'rare' ? x.rare : isCommon(x)))
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ---------- where the cycle stands: cycleStateIn in pick.ts since r62 ---------- */

/** The timed sessions the average session needs (r30, a convention). */
const AVG_SESSIONS = 3;

/* Session length measured from Start to Finish. Sessions logged for a past
   date, left open over six hours, or shorter than a minute are not timed. */
/** The average session in the last 4 weeks, in minutes, from 3 timed sessions or more, with the plan's for the same days, or null. */
export function sessionLength(): { avg: number; n: number; plan: number | null } | null {
  const from = addDays(today(), -RECENT_DAYS);
  const R = activeRoutine();
  const ss = state.sessions.filter(x => x.date >= from && x.durMin);
  // An average of one is not an average (r30): shown from AVG_SESSIONS timed sessions.
  if (ss.length < AVG_SESSIONS) return null;
  const avg = Math.round(ss.reduce((a, x) => a + (x.durMin || 0), 0) / ss.length);
  const pl = ss
    .filter(x => x.routineId === R.id)
    .map(x => {
      const d = R.days[sessDayIdx(R, x)];
      return d ? dayMinutes(d, x.light || x.deload) : 0;
    })
    .filter(x => x > 0);
  return { avg, n: ss.length, plan: pl.length ? Math.round(pl.reduce((a, b) => a + b, 0) / pl.length) : null };
}

/* ---------- bests and goals, as Stats and the session say them ---------- */

/* A lift's heaviest set, in the words the bests board uses, so nothing new is
   invented and the two always read alike (r48, V: "is it easy to see what your
   PR was during a today session"). "Heaviest" rather than "PR": in this app a
   PR is a record the moment it is set, while this is the standing best. The
   date is dropped when the heaviest set was the lift's last session, since
   the Last line beside it already carries that date. upTo reads it as of a
   past workout's date (r55, the audit). */
/** "Heaviest 225×5, Oct 3": a lift's heaviest set, or '' before one. */
export function bestLine(exId: string, upTo?: string): string {
  const r = allTimeBests(exId, upTo);
  if (!r || !r.heavy) return '';
  const ex = r.ex;
  const exps = (IDX().byEx[exId] || []).filter(x => !upTo || x.date <= upTo);
  const last = exps[exps.length - 1];
  const when = last && r.heavy.date === last.date ? '' : `, ${fmtDate(r.heavy.date)}`;
  return `Heaviest ${setShort(ex, r.heavy.p.w, r.heavy.p.r)}${loadNote(ex)}${when}`;
}

/* A goal is a load for a number of reps (225 x 5), as lifters say it. Where
   it stands: reached when a working set matched it (that load or more, those
   reps or more); otherwise the best estimate from the last 12 weeks against
   what the goal takes done to failure, by the same estimate the targets use
   (fitE), so a goal at any reps compares with sets at any reps (r38). No
   date to reach it (r41, V: guide, do not predict); on a lift whose estimate
   is a load anyone lifts, the gap is said as a load as well (goalLine). */
/** Where a lift's goal stands: the goal, the date a set reached it, how close the best estimate of 12 weeks is, and whether a weigh-in is missing; null with no goal. */
export function goalState(exId: string): {
  g: { w: number; r: number };
  hit: string | null;
  pct: number | null;
  cur: number | null;
  need: number | null;
  noBw: boolean;
} | null {
  const ex = EX(exId);
  const g = ex && ex.goal;
  if (!g || !goalOk(ex)) return null;
  // Since a new machine or gym (liftRead, r61): a goal reached at another machine is not reached here.
  const exps = liftRead(exId);
  const bw = bwRefLoad(ex);
  // With no weigh-in a bodyweight lift has no load to compare: say so rather than a number read from the added load alone (the review of r40).
  const noBw = !!ex.bw && !((bwRef() ?? 0) > 0);
  let hit: string | null = null;
  for (const x of exps) {
    if (x.pts.some(p => p.w >= g.w - EPS_SAME && p.r >= g.r)) {
      hit = x.date;
      break;
    }
  }
  const need = fitE(g.w + bw, g.r, 0);
  const from = addDays(today(), -WEEK_DAYS * BEST_WEEKS);
  // Every set of the last BEST_WEEKS weeks, a lighter day's and a deload's too, as the bests read them (r54, PENDING 311 e).
  let cur: number | null = null;
  for (const x of exps) {
    if (x.date < from) continue;
    for (const p of x.pts) {
      const v = fitE(p.load, p.r, p.rq);
      if (v != null && (cur == null || v > cur)) cur = v;
    }
  }
  const pct = !noBw && need && cur ? Math.min(PERCENT, (cur / need) * PERCENT) : null;
  return { g, hit, pct, cur, need, noBw };
}
/** A goal in words: "225 lb × 5", in the lift's own frame. */
export function goalWords(ex: ExerciseLike, g: { w: number; r: number }): string {
  return `${loadLabel(ex, g.w)}${ex.bw ? '' : ' ' + U()}${loadNote(ex)} × ${g.r}`;
}

/* ---------- Volume by region: what it reads ---------- */

/** The weeks By region averages: picked this visit, else as remembered on this phone, else REGION_WK_DEFAULT. */
export function regionWk(): number {
  const v: unknown = ui.regionWk != null ? ui.regionWk : prefGet(REGION_KEY);
  const n = v == null ? REGION_WK_DEFAULT : +String(v);
  return REGION_WKS.some(x => x[0] === n) ? n : REGION_WK_DEFAULT;
}

/** What By region draws from, and how it says so. */
interface RegionSrc {
  src: Readonly<Record<string, number>> & { readonly _mix?: Readonly<Record<string, boolean>>; readonly _ff?: boolean };
  n?: number;
  label: string;
  back?: boolean;
  week?: boolean;
  noFull?: boolean;
  old?: boolean;
  first?: boolean;
  end?: string;
  empty?: boolean;
}
/* Volume section, "By region" mode: the balance radar and its table, the
   first view of Volume since r28 (V). It reads what you logged and nothing
   else (V, r29: in r28 it read the routine's plan until a full week was
   logged, which made every new person look behind): your recent average,
   else this week so far, else your last trained weeks however long ago, so
   the chart is always drawn from real sets (V, r29: a blank card read as the
   chart being gone). With no sessions at all it still draws, empty, with the
   target ring. The chart and the table use this one source. */
/** The hard sets By region reads: the average of the weeks picked, else this week, else the last weeks trained. */
export function regionSrc(): RegionSrc {
  const n = regionWk();
  const avg = avgWeeks(n);
  if (avg)
    return {
      src: avg,
      n,
      back: avg._back,
      label:
        avg._missed || avg._light || avg._rest
          ? `your average over ${avgWeeksTxt(avg)}`
          : avg._weeks < n && avg._ff
            ? avgWeeksTxt(avg)
            : `your ${avg._weeks}-week average`
    };
  const I = IDX(),
    cur = weekStart(today());
  const wk = I.weekSets[cur] || {};
  if (MK.some(m => (wk[m] || 0) > 0)) return { src: wk, n, label: 'this week so far', week: true, noFull: true };
  const has = (w: string): boolean => {
    const x = I.weekSets[w];
    return !!x && MK.some(m => (x[m] || 0) > 0);
  };
  const ff = avgFirstWeek();
  const all = Object.keys(I.weekSets)
    .filter(w => w < cur && has(w))
    .sort();
  const full = all.filter(w => !ff || w >= ff);
  // With no full week, the first week (back, after a break: r55, logStart) alone, not weeks before the break.
  const wks = (full.length ? full : all.filter(w => !ff || w >= addDays(ff, -WEEK_DAYS))).slice(-n);
  const lastWk = wks[wks.length - 1];
  if (lastWk) {
    const out = weeksAvg(wks);
    const end = addDays(lastWk, SUNDAY);
    return {
      src: out,
      n,
      label: full.length
        ? `your last ${wks.length === 1 ? 'trained week' : wks.length + ' trained weeks'}, to ${fmtDate(end)}`
        : `your first week${logBack() ? ' back' : ''}, to ${fmtDate(end)}`,
      old: !!full.length,
      first: !full.length,
      back: logBack(),
      end
    };
  }
  return { src: {}, label: '', empty: true };
}

/* ---------- size check ---------- */

/** Each tape site measured TAPE_WEEKS.from to TAPE_WEEKS.to weeks apart: the change, the stretch, and the hard sets a week its muscles got in between. */
export function sizeRows(): {
  k: string;
  mus: readonly string[];
  from: string;
  to: string;
  d: number;
  sets: number;
  weeks: number;
}[] {
  const ms = [...state.measurements].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const I = IDX();
  const out: { k: string; mus: readonly string[]; from: string; to: string; d: number; sets: number; weeks: number }[] =
    [];
  const at = (m: Measurement, k: string): number => {
    const v = rec(m)?.[k];
    return typeof v === 'number' ? v : 0;
  };
  const pair = (k: string): { b: Measurement; L: Measurement } | null => {
    const has = ms.filter(m => at(m, k) > 0);
    const L = has[has.length - 1];
    if (has.length < 2 || !L) return null;
    const b = has.find(
      m =>
        daysBetween(m.date, L.date) >= WEEK_DAYS * TAPE_WEEKS.from &&
        daysBetween(m.date, L.date) <= WEEK_DAYS * TAPE_WEEKS.to
    );
    return b ? { b, L } : null;
  };
  for (const [k, mus] of SIZE_MAP) {
    const pr = pair(k);
    if (!pr) continue;
    const { b, L } = pr;
    let weeks = 0,
      sum = 0;
    for (let wk = weekStart(b.date); wk <= weekStart(L.date); wk = addDays(wk, WEEK_DAYS)) {
      const ws = I.weekSets[wk];
      if (!ws) continue;
      const v = mus.reduce((a, m) => a + (ws[m] || 0), 0);
      weeks++;
      sum += v;
    }
    out.push({ k, mus, from: b.date, to: L.date, d: at(L, k) - at(b, k), sets: weeks ? sum / weeks : 0, weeks });
  }
  return out;
}

/* ---------- what is planned on a date (Today, the week bar and the calendar, r59) ---------- */

/* The cycle day that falls on each date from today on. After a session the
   calendar walks the cycle one day per day, rest days included; a missed day
   waits (Today offers the next training day, whatever the date). With
   `restWeeks`, a rest week marked ahead holds the cycle where it is: its
   dates have no day, and the week after it starts where the cycle stood, as
   the lifter's next session will (329's look-ahead, V 2026-10-25: "do what is
   sensible"). */
/** The cycle's day index on each of the next `days` dates (a cycle routine); with `restWeeks`, none on a rest week's dates, the cycle held through them. */
export function cycleProjection(R: Routine, days?: number, restWeeks?: boolean): Record<string, number> {
  const n = R.days.length;
  const t = today();
  const cs = cycleState(R);
  const out: Record<string, number> = {};
  let idx: number, start: string;
  if (cs.lastDate === t) {
    idx = (cs.last + 1) % n;
    start = addDays(t, 1);
  } else if (cs.restToday) {
    idx = cs.restIdx;
    start = t;
  } else {
    idx = cs.next;
    start = t;
  }
  for (let k = 0; k < (days || WEEK_DAYS); k++) {
    const d = addDays(start, k);
    if (restWeeks && isRestWeek(weekStart(d))) continue;
    out[d] = idx;
    idx = (idx + 1) % n;
  }
  return out;
}

/** A routine's day planned on a date: its index and the day. */
export interface PlannedDay {
  di: number;
  day: Day;
}
/* What is planned on each date of this week: {di, day}, or nothing for a
   past day of a cycle. */
/** This week's planned day on each of its dates. */
export function weekPlan(R: Routine): Record<string, PlannedDay> {
  const cur = weekStart(today());
  const out: Record<string, PlannedDay> = {};
  if (R.schedule === 'weekly') {
    for (let i = 0; i < WEEK_DAYS; i++) {
      const day = R.days[i];
      if (day) out[addDays(cur, i)] = { di: i, day };
    }
    return out;
  }
  // A week from tomorrow at the latest, where the projection starts after a session today.
  const pj = cycleProjection(R, WEEK_DAYS + 1);
  for (let i = 0; i < WEEK_DAYS; i++) {
    const d = addDays(cur, i);
    const di = pj[d];
    const day = di == null ? undefined : R.days[di];
    if (di != null && day) out[d] = { di, day };
  }
  return out;
}

/* Looking ahead (329, V 2026-10-20: "future days, and the coming weeks and
   months, show the planned workout, and a tap opens it"): what the routine
   in use plans on each date after today up to a date, by weekday on a weekly
   routine, and on a cycle by walking it from today as the week bar does
   (cycleProjection: every day in turn, rest days included, as if each were
   done). A rest week marked ahead plans nothing, and a cycle waits through
   it. */
/** The routine in use's planned day on each date from tomorrow to `to`, a rest week's dates left out. */
export function planAhead(to: string): Record<string, PlannedDay> {
  const R = activeRoutine();
  const t = today();
  const out: Record<string, PlannedDay> = {};
  const n = to > t ? daysBetween(t, to) : 0;
  if (!n || !R.days.length) return out;
  const pj = R.schedule === 'weekly' ? null : cycleProjection(R, n + 2, true);
  for (let k = 1; k <= n; k++) {
    const d = addDays(t, k);
    if (isRestWeek(weekStart(d))) continue;
    const di = pj ? pj[d] : dayOfWeek(d);
    const day = di == null ? undefined : R.days[di];
    if (di != null && day) out[d] = { di, day };
  }
  return out;
}
