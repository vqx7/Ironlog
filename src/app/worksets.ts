/* The session in progress, set by set (r60, from workout.ts): the loads and
   reps a row shows in grey, a set ticked and what it changes (its load
   taken, the next sets adjusted, a PR, the rest timer, the fold), a load or
   reps far off asked about first, a tick waiting for its weight, the
   exercises' order after a first tick, the minutes left, and an exercise
   added or re-read when its plan changes. Every change to the log goes
   through act; the screen is drawn again through redraw (workstate.ts). */

import { act } from './act';
import { noE1, isCompound } from './library';
import { planItemOf, move, fixSupersets, DEFAULT_PLAN } from './routines';
import { min5, rangeWords, MISSED_SAID } from './format';
import {
  e1,
  rtfOf,
  rtfBand,
  REP_PR_SHARE,
  prSameLoad,
  setupSecs,
  setSecs,
  BACK_DAYS,
  isMissed,
  epley
} from './formulas';
import { PLATES_LB, PLATES_KG, LB, KM_MI, SMALL_PLATE } from './units';
import { isNum, r1, addDays, today, uid, numIn, EPS, EPS_SAME, HUNDREDTHS, MINUTE_S, WEEK_DAYS, r3 } from './util';
import { platesPerSide } from './gym';
import { loadWords } from './loads';
import { BAND_WORDS } from './prs';
import {
  prFrame,
  rirEst,
  EX,
  prLoad,
  U,
  loadLabel,
  fmtW,
  gymOf,
  exBarKg,
  rackTol,
  bwRefLoad,
  IDX,
  liftRead,
  pace,
  dayMinutes,
  calStats,
  daysOff,
  suggest,
  activeRoutine,
  invalidate,
  suggestCore,
  nextSets,
  oddLoad,
  lightZero,
  exName,
  trimPlan
} from './live';
import { state, ui } from './store';
import { lastDup, effTarget, blockRest, newRow, greyW, effW, blockDone } from './session';
import type { BlkRef } from './session';
import type { DraftBlock, DraftSet, Routine, PlanItem, NextSetsAdj } from './types';
import type { ExerciseLike } from './model';
import { fmtE, setShort, rirShow } from './display';
import { drawing } from './view';
import {
  W,
  adjSrc,
  blkIdx,
  blkIsOpen,
  blkRef,
  carried,
  keepOpen,
  mixSeen,
  ordBack,
  orderQ,
  redraw,
  FOLD_MS,
  unloaded
} from './workstate';
import type { Draft } from './workstate';

/** A remainder of plates this light, per unit of the gym's plates, is conversion dust when the app shows the other unit: not said. */
const PLATE_DUST: Readonly<Record<'kg' | 'lb', number>> = { kg: 0.1, lb: 0.25 };
/** The calibration set is offered once CAL_OFFER.sessions sessions are logged, and again CAL_OFFER.weeks weeks after the last (or after Later). */
export const CAL_OFFER = { sessions: 3, weeks: 3 } as const;
/** Reps past ODD_REPS, and more than ODD_REPS_TIMES the top of the range and anything logged on the lift, are asked about first: a slipped digit (r32, a convention). */
export const ODD_REPS = 30,
  ODD_REPS_TIMES = 2;
/** A PR's toast stays this many milliseconds, and the phone buzzes this pattern where it can. */
const PR_TOAST_MS = 4200,
  PR_BUZZ = [30, 50, 30];
/** The effort strip is scrolled into view when its bottom is within STRIP_ROOM_PX.edge of what covers the screen, leaving STRIP_ROOM_PX.gap. */
const STRIP_ROOM_PX = { edge: 8, gap: 16 } as const;
/** A load under MIX_RANGE[0] or over MIX_RANGE[1] of last time's is asked about once: a per-dumbbell or per-side mix-up (a convention). */
const MIX_RANGE = [0.6, 1.4] as const;
/** The mix-up toast stays this many milliseconds: it has two sentences. */
const MIX_TOAST_MS = 7000;
/** A ticked exercise moves up this many milliseconds after the tick, and tries again after ORDER_MS.again while something is being typed or open. */
const ORDER_MS = { soon: 900, again: 1500 } as const;
import { LIMITS } from './records';
import { toast } from './toast';
import { confirmBox, rerenderKeepScroll } from './page';
import { startTimer } from './timer';

/* ---------- rows and blocks ---------- */

/* Loads (r25). Filled-in loads made every row look already decided, and a
   row the lifter had not touched could not be told from one they had. So by
   default a working set's load stays empty and shows, in grey, the load of
   the working set above it (typed, or taken when that set was ticked), else
   the app's suggestion. Ticking the set, auto-mark and quick entry take the
   grey load; typing replaces it and is never overwritten. Settings > Logging
   > "Fill in suggested loads" (settings.loadFill 'fill') puts them in the
   rows as before. Warm-up and drop rows get their loads when added. */
/** Whether suggested loads are filled into the rows (a setting), rather than shown in grey. */
export const fillLoads = (): boolean => state.settings.loadFill === 'fill';

/** Whether the next sets move after a set clearly off its plan (r34; on unless turned off in Settings). */
export function adjOn(): boolean {
  return state.settings.autoAdj !== false;
}

/** A row's load is the app's, not the lifter's: empty (grey), the suggestion, carried down from a typed load above, or put there by the adjustment (r34). */
export function appLoad(b: DraftBlock | null | undefined, x: DraftSet): boolean {
  return x.w == null || (!!b && x.w === b.sw) || carried.has(x) || !!(b && b.adj && Math.abs(x.w - b.adj.w) < EPS);
}

/* A row that holds nothing of the lifter's: not ticked, no reps, no RIR, and
   a load that is empty or only the app's (the suggestion, or carried down).
   Everything that removes or rebuilds rows (− Set, Short on time, a swap)
   takes only these, so typed work is never dropped as a side effect (r25). */
/** Whether a row holds nothing of the lifter's. */
export function rowBlank(b: DraftBlock | null | undefined, x: DraftSet): boolean {
  return !x.done && x.r == null && x.rir == null && appLoad(b, x);
}

/** Short on time's trim of the session in progress to so many minutes, taking only blank rows (pick.ts, trimPlanIn). */
export function shortPlan(d: { ex: DraftBlock[] }, mins: number): ReturnType<typeof trimPlan> {
  return trimPlan(
    d,
    mins,
    d.ex.map(b => b.sets.map(x => rowBlank(b, x)))
  );
}

/* Last time's reps for row si. lastR lists last session's working sets in
   order (no warm-ups, no drop sets), so a row's number is found by counting
   the working rows above it. Indexing by row put a warm-up added at the top
   on last time's first set, and shifted every set below it by one. A later
   block of the same lift (r45): last time's reps are one merged list and the
   split is not recorded, so none is offered; the grey reps fall back to the
   set above or the bottom of the range, as the Last column shows dashes (the
   r45 review). */
/** Last time's reps for working row si of a block, or null. */
export function lastRFor(b: DraftBlock, si: number): number | null {
  const s = b.sets[si];
  if (!s || s.warm || s.drop || !Array.isArray(b.lastR)) return null;
  const d = state.draft;
  const bi = d && d.ex ? d.ex.indexOf(b) : -1;
  if (d && bi > 0 && lastDup(d, bi)) return null;
  let k = 0;
  for (let i = 0; i < si; i++) {
    const x = b.sets[i];
    if (!x.warm && !x.drop) k++;
  }
  const v = b.lastR[k];
  return v != null && v > 0 ? v : null;
}

/* The grey number in an empty reps field, which the checkmark, auto-mark and
   the keyboard's Done take as the set's reps: last time's reps for that set;
   with none (a new or just-swapped exercise, or more sets than last time),
   the reps of the working set above it in this session; else the bottom of
   the planned range. Warm-ups and drop sets have none. When the target is a
   new load (up a step, down after missing the range, or a range change),
   last time's reps were at the old load, so a tick without typing would log
   reps never done there (r27). Then the grey number is the set above, else
   the target's minimum. Under an adjusted set (r34): reps done since at the
   new load, else what the estimate expects there. */
/** The grey reps of row si, or null. */
export function greyR(b: DraftBlock | null | undefined, si: number): number | null {
  const s = b && b.sets[si];
  if (!b || !s || s.warm || s.drop) return null;
  if (b.adj && si > b.adj.at) {
    for (let i = si - 1; i > b.adj.at; i--) {
      const x = b.sets[i];
      if (!x.warm && !x.drop && +(x.r ?? 0) > 0) return +(x.r ?? 0);
    }
    return b.adj.r;
  }
  const loadT = !!(b.tgt && b.tgt.kind === 'load');
  const lr = loadT ? null : lastRFor(b, si);
  if (lr != null) return lr;
  for (let i = si - 1; i >= 0; i--) {
    const x = b.sets[i];
    if (!x.warm && !x.drop && +(x.r ?? 0) > 0) return +(x.r ?? 0);
  }
  const m = +(loadT && b.tgt && +(b.tgt.repMin ?? 0) > 0 ? (b.tgt.repMin ?? 0) : b.plan.repMin);
  return m > 0 ? m : null;
}

/* Anything the lifter put into a session: a ticked set, typed reps or a
   typed load, an RIR, cardio minutes, a note on an exercise, or session notes
   other than the text the app wrote itself. The grey numbers and prefilled
   loads are the app's. A typed load counts too (r25): with grey loads, a load
   in the row is the lifter's. */
/** Whether the lifter has put anything into a session in progress. */
export function draftEntered(d: Draft | null | undefined): boolean {
  if (!d) return false;
  if (d.ex.some(b => (b.note && b.note.trim()) || b.sets.some(x => x.done || +(x.r ?? 0) > 0 || !rowBlank(b, x))))
    return true;
  if ((d.cardio || []).some(c => (c.min || 0) > 0)) return true;
  const n = (d.notes || '').trim();
  if (!n) return false;
  return typeof d.note0 === 'string' ? n !== d.note0.trim() : true;
}

/* ---------- PRs as a set is logged ---------- */

/* A set is a PR live if its estimate beats your best, or no earlier set
   matched it on both load and reps: the same two tests the PR list uses.
   Only sets logged up to the session's date count, so a past session entered
   late is judged against what came before it, at its load as the list judges
   it (prFrame, r54: changing units or gyms is not a PR). Announced only when
   stronger than ever (r32, as the list's big): by the same score as the rep
   PR floor, against every earlier set. A lift with no estimate (timed, joint
   rotation) or no load known keeps every kind, a bodyweight lift before any
   weigh-in by its reps alone (r54). More weight than any earlier working set
   comes first (r29), as in the PR list, and before the load check: an
   assisted set with no bodyweight logged has no load to estimate from, but
   less help is still a PR. A new best is judged within the set's own band of
   reps to failure, and is a PR only when stronger than ever, as every PR is
   (r58, 343 6). A rep PR needs 90% or more of the strongest set before it,
   as in the PR list (r30). */
/** The PR a set being logged makes against the log up to its date, or null. */
export function livePR(exId: string, s: DraftSet | null | undefined, date: string): string | null {
  if (!s || s.warm || s.drop || !(+(s.r ?? 0) > 0)) return null;
  const f = prFrame(exId, s, date);
  if (!f) return null;
  const { ex, exps, st, load } = f;
  const q0 = rirEst(s, ex);
  const r = +(s.r ?? 0);
  const v = noE1(ex) ? null : e1(load, r, q0);
  const scq = (l: number, rr: number, q: number | null): number => e1(l, rr, q) || epley(l, rr);
  let top = 0,
    dom = false;
  for (const x of exps)
    for (const q of x.pts) {
      if (q.pl >= load - EPS_SAME && q.r >= r) dom = true;
      top = Math.max(top, scq(q.pl, q.r, q.rq));
    }
  const judge = !noE1(ex) && !ex.timed && load > 0;
  const stronger = !judge || scq(load, r, q0) > top + EPS;
  if (!ex.timed && s.w != null && isNum(+s.w) && f.w > f.heaviest + EPS_SAME && stronger) return 'Weight PR';
  if (!(load > 0) && !ex.timed && !ex.bw) return null;
  if (v != null && st && stronger) {
    const rtf = rtfOf(r, q0);
    const bd = rtf == null ? undefined : st.byBand && st.byBand[rtfBand(rtf)];
    if (bd != null && v > bd + EPS_SAME) return 'Best';
  }
  if (dom || !stronger) return null;
  if (!ex.timed && scq(load, r, q0) < top * REP_PR_SHARE - EPS) return null;
  return ex.timed ? 'Time PR' : 'Rep PR';
}

/* Not a PR when an earlier set in this session was as strong (r32, second
   check: 100 x 10, then 100 x 9 announced as a new best). On any day since
   r54, as the list counts it since r53 (PENDING 311 a). Until r60 the screen
   applied this only when a set was ticked, and drew every row of a redraw by
   livePR alone, so a redraw marked 100 x 9 a PR again after 100 x 10: the row
   and the folded line are now read by this one rule every draw. */
/** The PR row si of a block shows: livePR, unless an earlier set of this session was as strong. */
export function rowPR(b: DraftBlock, si: number, date: string): string | null {
  const s = b.sets[si];
  if (!s || !s.done) return null;
  const pr = livePR(b.exId, s, date);
  if (!pr) return null;
  const ex = EX(b.exId);
  const scq = (x: DraftSet): number => {
    const l = prLoad(ex, x, date);
    const r = +(x.r ?? 0);
    return e1(l, r, rirEst(x, ex)) || epley(l, r);
  };
  const me = scq(s);
  return b.sets.some((x, i) => i < si && x.done && !x.warm && !x.drop && +(x.r ?? 0) > 0 && scq(x) >= me - EPS)
    ? null
    : pr;
}

/* What a live PR beat, as a short tail for the toast: the old best estimate
   in the set's band, or the most reps done at this load or heavier, judged as
   livePR judges it and shown as logged, as the PR list shows it (r54). The
   estimate a set beats is the best from sets of a similar number of reps
   (its band), so the toast names the band (r30): "new best estimate 279"
   read as wrong beside an overall best of 301 from heavier sets. The overall
   best before the set is named, so "was" never names a band's best that
   reads as lower than the bests board (r34.2). */
/** The tail of a PR toast: what the set beat. */
export function prBeat(exId: string, s: DraftSet, date: string, pr: string): string {
  const f = prFrame(exId, s, date);
  if (!f) return '';
  const { ex, exps, st, load } = f;
  const r = +(s.r ?? 0);
  const q = rirEst(s, ex);
  const rtf = rtfOf(r, q);
  const band = rtf == null ? null : rtfBand(rtf);
  const bd = band == null ? undefined : st && st.byBand && st.byBand[band];
  const v = noE1(ex) ? null : e1(load, r, q),
    shown = noE1(ex) ? null : e1(f.own, r, q);
  const bandW = (band != null && BAND_WORDS[band]) || '';
  if (pr === 'Best') {
    if (bd == null || v == null) return '';
    let all: number | null = null;
    for (const x of exps)
      if (x.pb != null && !(date && x.date === date)) all = all == null ? x.pb : Math.max(all, x.pb);
    if (!isCompound(ex)) return ` (your best for ${bandW})`;
    return all == null || (shown ?? 0) > all + EPS_SAME
      ? ` (estimated 1RM ${fmtE(shown)} ${U()}${all != null ? `; was ${fmtE(all)}` : ''})`
      : ` (your best for ${bandW}, ${fmtE(shown)} ${U()})`;
  }
  if (pr === 'Weight PR') {
    const mw = f.heaviest;
    const was = ex.assist
      ? `less help than ever`
      : `heaviest before ${ex.bw ? loadLabel(ex, mw) : fmtW(mw) + ' ' + U()}`;
    return ` (${was}${isCompound(ex) && bd != null && v != null && v > bd + EPS_SAME ? `; best estimate for ${bandW} now ${fmtE(shown)}` : ''})`;
  }
  let m = 0;
  for (const x of exps) for (const p of x.pts) if (p.pl >= load - EPS_SAME) m = Math.max(m, p.r);
  return m ? ` (was ${m} ${ex.timed ? 's' : 'reps'})` : ' (heaviest yet)';
}

/* ---------- loads as shown ---------- */

/* An assisted lift keeps its sets as bodyweight minus the help, below 0, so
   every estimate, target and record works unchanged; the field shows and
   takes the help as a plain number, since phone number pads have no minus. */
/** A load as its field shows it: the help on an assisted lift, blank for none. */
export const loadIn = (ex: ExerciseLike | null | undefined, w: number | null | undefined): string =>
  w == null ? '' : fmtW(ex && ex.assist ? -w : w);

/* Small change plates (r29, item 98) add 1.25 lb or 0.5 kg, for gyms that
   have them; the load step is still set per exercise. Your gym's own plates
   when they are in the unit asked for. */
/** The plates a bar is loaded from, in a unit: Your gym's, else the usual set, with the small ones when on. */
export function plateList(u?: 'lb' | 'kg'): number[] {
  const unit = u || U();
  const g = gymOf();
  const own =
    g && (g.u || U()) === unit && Array.isArray(g.plates) && g.plates.length
      ? g.plates.slice().sort((a, b) => b - a)
      : null;
  const b = own || (unit === 'lb' ? PLATES_LB : PLATES_KG);
  return state.settings.smallPlates ? [...b, SMALL_PLATE[unit]] : b.slice();
}

/* Plates per side for a barbell load, greedy from the biggest plate down.
   The plates are counted in the unit the gym's plates are labelled in, and
   said in it (r34.2, from the review: a kg gym with the app in lb was told
   "35, 5, 2.5, 1.14 lb not loadable" for one 20 kg plate a side). A plate
   within half the load's last shown digit, split across the sides, is that
   plate (platesPerSide, PENDING 333); within a rounding of the shown load,
   not a plate short (a 60 kg load shown as 132.3 lb). */
/** The plates line for a load: per side, on the sleeve, or below the bar. */
export function plateText(kg: number, mode?: string, ex?: ExerciseLike | null): string {
  const md = mode || 'bar';
  if (md === 'none') return '';
  const g = gymOf();
  const pu: 'lb' | 'kg' = g && g.u && g.u !== U() ? g.u : U();
  const inU = (v: number): number => (pu === 'lb' ? v / LB : v);
  const load = inU(kg),
    bar = md === 'bar' ? inU(exBarKg(ex)) : 0;
  if (!(load > 0)) return '';
  if (load < bar - EPS_SAME) return `${fmtW(kg)} ${U()} is below the ${r1(bar)} ${pu} bar`;
  const { plates: out, rest: left } = platesPerSide(
    plateList(pu),
    md === 'sleeve' ? load : (load - bar) / 2,
    Math.max(EPS_SAME, inU(rackTol()) / (md === 'sleeve' ? 1 : 2))
  );
  const rest = Math.round(left * HUNDREDTHS) / HUNDREDTHS;
  const tiny = pu !== U() && rest < PLATE_DUST[pu];
  const lead =
    md === 'sleeve'
      ? `On the sleeve at ${fmtW(kg)}`
      : md === 'side'
        ? `Per side at ${fmtW(kg)} (no bar)`
        : `Per side at ${fmtW(kg)}`;
  const tag = pu !== U() ? ` ${pu}` : '';
  return `${lead}: ${out.length ? out.join(', ') + tag : 'bar only'}${rest > 0 && !tiny ? ` (${rest} ${pu} not loadable)` : ''}`;
}

/* ---------- progress, time, the calibration set ---------- */

/* Live score for one block against its target. Only sets marked done, not
   warm-up, with reps, at or above the target load count. Reps are compared
   only at the target load; anything heavier is judged on estimated 1RM
   against your previous best, each set at the load it stands for, as PRs are
   judged (prSameLoad: the same load in the other unit beats nothing, r55.1).
   Estimates in whole pounds, and on an isolation lift the set itself, never
   a 1RM (r34.2). Only the first n sets at the target load count, n being
   last time's set count; reps past the top count as the top, as the target
   counted them (r55; not for a target set past the range on purpose). With
   fewer sets than last time, nothing is beaten: the one rule repeats the
   target (r55, the audit). Drop sets are extra work after the working sets,
   never part of the target; nor a set past the plan's count (r55). */
/** How a block stands against its target, or null when it has none. */
export function blockProgress(b: DraftBlock): { text: string; beat: boolean } | null {
  const t0 = b.tgt;
  const t = effTarget(b);
  if (!t0 || !t) return null;
  const ex = EX(b.exId);
  const bw = bwRefLoad(ex);
  const done = b.sets.filter(s => s.done && !s.warm && !s.drop && +(s.r ?? 0) > 0);
  if (!done.length) return { text: '', beat: false };
  const tw = t.w ?? 0;
  const at = done.filter(s => Math.abs((+(s.w ?? 0) || 0) - tw) < EPS_SAME);
  const heavier = done.filter(s => (+(s.w ?? 0) || 0) > tw + EPS_SAME);
  let heavyBeat = false,
    heavyTxt = '';
  if (heavier.length && t.prevBest != null && !ex.timed) {
    let best: number | null = null,
      bs: DraftSet | null = null;
    const seen = new Set<number>();
    for (const x of liftRead(b.exId)) for (const p of x.pts) seen.add(p.w);
    for (const s of heavier) {
      const v = e1(bw + prSameLoad(+(s.w ?? 0) || 0, seen), +(s.r ?? 0), rirEst(s, ex));
      if (v != null && (best == null || v > best)) {
        best = v;
        bs = s;
      }
    }
    if (best != null) {
      heavyBeat = best > t.prevBest + EPS_SAME;
      const iso = !isCompound(ex);
      const setW = bs ? setShort(ex, +(bs.w ?? 0) || 0, +(bs.r ?? 0)) : '';
      heavyTxt = iso
        ? heavyBeat
          ? `Beaten by load: ${setW}, your best yet`
          : `Heavier than target: ${setW}`
        : heavyBeat
          ? `Beaten by load: ${fmtE(best)} ${U()} estimated, previous best ${fmtE(t.prevBest)}`
          : `Heavier than target, ${fmtE(best)} ${U()} estimated against a best of ${fmtE(t.prevBest)}`;
    }
  }
  if (t.kind === 'reps') {
    if (!at.length) return { text: heavyTxt || `Nothing logged at ${loadLabel(ex, tw)} yet`, beat: heavyBeat };
    const tn = t.n ?? 0,
      total = t.total ?? 0;
    const cnt = tn > 0 ? at.slice(0, tn) : at;
    const hi = +b.plan.repMax,
      cap = hi > 0 && total < hi * (tn > 0 ? tn : cnt.length) ? hi : Infinity;
    const n = cnt.reduce((a, s) => a + Math.min(+(s.r ?? 0), cap), 0);
    const sx = ex.timed ? 's' : '',
      u = ex.timed ? 's' : ' reps';
    const fewer = t !== t0,
      base =
        fewer && n > total
          ? `${n}${u} over ${tn} set${tn === 1 ? '' : 's'}, last time ${total}${sx} over those. Fewer sets than usual: the target stays for next time`
          : n > total
            ? `Beaten: ${n}${u} at that load, last time ${total}${sx}`
            : `${n}${sx} of ${total + 1}${u} so far at that load`;
    return { text: heavyTxt ? `${base}. ${heavyTxt}` : base, beat: !fewer && (n > total || heavyBeat) };
  }
  const rows = b.sets.filter(s => !s.warm && !s.drop),
    planned = Math.min(rows.length, +b.plan.sets || rows.length);
  const rm = t.repMin ?? 0;
  const hit = rows
    .slice(0, planned)
    .filter(s => s.done && +(s.r ?? 0) > 0 && (+(s.w ?? 0) || 0) >= tw - EPS_SAME && +(s.r ?? 0) >= rm).length;
  const base = `${hit} of ${planned} sets hit ${rm}${ex.timed ? 's' : ''}+ at that load`;
  return { text: heavyTxt ? `${base}. ${heavyTxt}` : base, beat: (planned > 0 && hit >= planned) || heavyBeat };
}

/* Short on time: minutes of lifting left in the session, counted like the
   plan estimate: 40 seconds a set plus its rest (none inside a superset),
   and 3 minutes of setup for an exercise not started yet. No rest is taken
   after the very last set, the same as the plan's estimate. */
/** Minutes of lifting left in a session, at the lifter's pace. */
export function remainMin(d: Draft): number {
  let s = 0,
    cN = 0,
    lastRest = 0;
  d.ex.forEach((b, bi) => {
    const ex = EX(b.exId);
    const su = setupSecs(ex, cN);
    if (isCompound(ex)) cN++;
    const n = b.sets.filter(x => !x.done && !x.warm).length;
    if (!n) return;
    const r = blockRest(d, bi);
    s += n * (setSecs(ex, b.plan) + r) + (b.sets.some(x => x.done) ? 0 : su);
    lastRest = r;
  });
  return Math.round((Math.max(0, s - lastRest) * pace()) / MINUTE_S);
}

/* Minutes left for the header: none once every set is done (min5 shows at least 1, so 0 left read "about 1 min left"). */
export function leftMin(d: Draft): number {
  if (!d || d.editingId || d.free || d.past) return 0;
  const m = remainMin(d);
  return m > 0 ? min5(m) : 0;
}

/* The whole session's planned minutes as it stands, with every set it has
   now (r30): after Short on time the recap compared the time taken with the
   untrimmed routine day ("planned about 77" after trimming to 45). */
/** The session's planned minutes with the sets it has now. */
export function draftPlanMin(d: Draft | null | undefined): number {
  if (!d || !d.ex.length) return 0;
  return dayMinutes(
    {
      items: d.ex.map(b => ({
        ...b.plan,
        exId: b.exId,
        sets: b.sets.filter(x => !x.warm).length,
        rest: +b.plan.rest || 0
      }))
    },
    false
  );
}

/* The first machine, cable or Smith exercise in a session is offered a
   calibration set when none was done in the last 3 weeks, RIR is on, and
   you have at least 3 real sessions. Not now waits another 3 weeks. Not on a
   day meant to be easy (r31): a deload, a lighter day, or two or more low
   check-in answers; nor on a lift's first session back after weeks off
   (r34.2): a set to failure is the last thing it needs. */
/** The block offered a calibration set, or -1. */
export function calDueIdx(d: Draft): number {
  if (state.settings.rirMode === 'off') return -1;
  if (state.sessions.filter(s => !s.demo).length < CAL_OFFER.sessions) return -1;
  const cut = addDays(today(), -WEEK_DAYS * CAL_OFFER.weeks);
  if (state.settings.calSnooze && state.settings.calSnooze > cut) return -1;
  const c = calStats();
  if (c.lastDate && c.lastDate > cut) return -1;
  if (d.ex.some(b => b.sets.some(x => x.cal))) return -1;
  const chk = d.chk;
  if (d.deload || d.light || d.past || (chk && ['sleep', 'energy', 'joints'].filter(k => chk[k] === 1).length >= 2))
    return -1;
  return d.ex.findIndex(b => {
    const ex = EX(b.exId);
    return (
      !ex.timed &&
      ['machine', 'cable', 'smith'].includes(ex.equip) &&
      !b.inj &&
      !b.light &&
      daysOff(b.exId) <= BACK_DAYS
    );
  });
}

/* ---------- the suggestion a block holds ---------- */

/* The most recent non-empty note you left on this exercise in a saved session:
   seat height, pin, grip, which station. Shown when the exercise comes up again. */
/** The newest note left on a lift in a saved session, up to a date, or null. */
export function lastNoteOf(exId: string, before?: string | null): { date: string; text: string } | null {
  let best: { date: string; text: string } | null = null;
  for (const ss of state.sessions)
    if (!before || ss.date <= before)
      for (const b of ss.ex)
        if (b.exId === exId && b.note && b.note.trim() && (!best || ss.date > best.date))
          best = { date: ss.date, text: b.note.trim() };
  return best;
}

/* sw is the load the app suggested, kept so a later refresh can tell a row
   still on the suggestion from one the lifter typed (refreshBlock). */
/** A new block for a lift in a session, its rows and its suggestion. */
export function newBlock(
  exId: string,
  plan: DraftBlock['plan'],
  opts?: { deload?: boolean; light?: boolean; before?: string | null } | null
): DraftBlock {
  const sg = suggest(exId, plan, opts);
  return {
    bid: uid(),
    exId,
    plan: { ...plan },
    note: '',
    lastNote: lastNoteOf(exId, opts && opts.before),
    inj: sg.inj || null,
    hint: sg.text,
    last: sg.last,
    prev: sg.prev || undefined,
    prevOff: sg.prevOff || undefined,
    target: sg.target,
    tgt: sg.tgt,
    easier: sg.easier || null,
    lastR: sg.lastR,
    basis: sg.basis || undefined,
    sw: sg.w == null ? null : sg.w,
    sets: Array.from({ length: +plan.sets || DEFAULT_PLAN.sets }, () => newRow({ w: fillLoads() ? sg.w : null }))
  };
}

/* Re-run the suggestion for one block, for example after its heaviest
   available load changes. Only untouched sets take the new load. A row is
   untouched when it still holds the load the app suggested (b.sw, null when
   there was none). Drafts from before r24 have no b.sw and fall back to the
   old test, the first undone row's load. Called inside a change given to act. */
/** A block's suggestion read again, its untouched rows taking the new load. */
export function refreshBlock(b: DraftBlock): void {
  const d = state.draft;
  if (!d || !b) return;
  const old = b.sets.find(x => !x.done && !x.warm);
  const oldW = b.sw !== undefined ? b.sw : old ? old.w : null;
  const sg = suggest(b.exId, b.plan, { deload: !!d.deload, light: !!d.light || !!b.light, before: d.date });
  Object.assign(b, {
    inj: sg.inj || null,
    hint: sg.text,
    last: sg.last,
    prev: sg.prev || undefined,
    prevOff: sg.prevOff || undefined,
    target: sg.target,
    tgt: sg.tgt,
    easier: sg.easier || null,
    lastR: sg.lastR,
    basis: sg.basis || undefined,
    lastNote: lastNoteOf(b.exId, d.date),
    sw: sg.w == null ? null : sg.w
  });
  for (const x of b.sets)
    if (!x.done && !x.warm && !x.drop && x.r == null && x.w === oldW && !carried.has(x)) x.w = sg.w;
}

/* A change to an exercise or its plan reaches the session in progress (r27):
   an exercise not started yet re-reads its target, so a new load step, rep
   range or heaviest load shows at once instead of next session. Exercises
   with a set done keep what they started with, and typed loads are never
   touched. Called after the change to the exercise, which saved the log. */
/** The session's blocks of a lift not started yet, read again after a change to the lift. */
export function refreshEx(exId: string): void {
  const d = state.draft;
  if (!d || d.editingId) return;
  const todo = d.ex.filter(b => b.exId === exId && !b.sets.some(x => x.done));
  if (todo.length) act(() => todo.forEach(refreshBlock), { inProgress: true });
}

/** A plan item's change carried into the session in progress: the blocks of its lift not started yet take its range, effort, rest and step, when the item is the one the session's lift took its plan from (planFor's order, so a blank session's follows it too, r55, the audit). */
export function syncDraftPlan(f: { r: Routine; di: number; it: PlanItem }): void {
  const d = state.draft;
  if (!d || !f || d.editingId) return;
  if (
    f.r !== (state.routines.find(r => r.id === d.routineId) || activeRoutine()) ||
    planItemOf(f.r, f.it.exId, d.dayId) !== f.it
  )
    return;
  const it = f.it;
  const todo = d.ex.filter(b => b.exId === it.exId && !b.sets.some(x => x.done));
  if (!todo.length) return;
  act(
    () => {
      for (const b of todo) {
        b.plan.repMin = it.repMin;
        b.plan.repMax = it.repMax;
        b.plan.rir = it.rir;
        b.plan.rest = it.rest;
        b.plan.inc = it.inc;
        if (it.jump != null) b.plan.jump = it.jump;
        else delete b.plan.jump;
        refreshBlock(b);
      }
    },
    { inProgress: true }
  );
}

/* After a unit change, a session in progress says its targets and last time
   in the new unit (r34.2, from the review: "at 60 kg" beside fields in lb).
   Only the words: the loads are stored in kg and stay as they are, and a
   suggestion is re-read without the unit's rounding so it names the same
   load the rows hold. */
/** The session's targets and last time worded again in the unit just chosen. */
export function unitWords(): void {
  const d = state.draft;
  if (!d) return;
  invalidate();
  act(
    () => {
      for (const b of d.ex) {
        if (d.deload || d.light || b.light || b.inj) continue;
        const sg = suggestCore(b.exId, b.plan, { before: d.date });
        if (b.sw != null && sg.w != null && Math.abs(sg.w - b.sw) > EPS_SAME) continue;
        Object.assign(b, {
          hint: sg.text,
          last: sg.last,
          prev: sg.prev || undefined,
          prevOff: sg.prevOff || undefined,
          target: sg.target,
          easier: sg.easier || null
        });
      }
    },
    { inProgress: true }
  );
}

/* ---------- the next sets adjusted (r34; the rule is nextSetsIn's) ---------- */

/** Keeps a block's adjustment on the set it came from after rows move (or drops it when that set is gone, undone or no longer a working set). Called inside a change given to act. */
export function adjSync(b: DraftBlock | null | undefined): void {
  if (!b || !b.adj) return;
  const rid = b.adj.rid;
  const src = adjSrc.get(b) || (typeof rid === 'string' ? b.sets.find(x => x.rid === rid) : undefined);
  if (!src) return;
  adjSrc.set(b, src);
  const i = b.sets.indexOf(src);
  if (i < 0 || src.warm || src.drop || !src.done) {
    const prev = { ...b.adj };
    delete b.adj;
    adjSrc.delete(b);
    adjRows(b, prev, null);
    return;
  }
  b.adj.at = i;
}

/* With "Fill in suggested loads" on, the rows hold the app's numbers rather
   than grey ones: those still on the old load (not done, not typed) take the
   new one, and go back when the adjustment is undone, Kept, or replaced. */
export function adjRows(b: DraftBlock, prev: NextSetsAdj | null, next: NextSetsAdj | null): void {
  const rows = (at: number, f: (x: DraftSet) => void): void =>
    b.sets.forEach((x, i) => {
      if (i > at && !x.done && !x.warm && !x.drop && x.w != null) f(x);
    });
  if (prev && (!next || next.at !== prev.at || next.w !== prev.w))
    rows(prev.at, x => {
      if (x.w != null && Math.abs(x.w - prev.w) < EPS) x.w = prev.from;
    });
  if (next)
    rows(next.at, x => {
      if (x.w != null && Math.abs(x.w - next.from) < EPS && (x.w === b.sw || carried.has(x))) x.w = next.w;
    });
}

/* After a set is ticked, unticked or changed: judged again. Which rows are
   still the app's is read before the old adjustment goes: with "Fill in
   suggested loads" on they hold its load, and reading them after it was
   dropped put them back at once (r34.2, from the review). Called inside a
   change given to act. */
export function assessSet(bi: number, si: number): void {
  const d = state.draft;
  const b = d && d.ex[bi];
  const s = b && b.sets[si];
  if (!d || !b || !s) return;
  const prev = b.adj ? { ...b.adj } : null;
  const appL = (x: DraftSet): boolean => appLoad(b, x) || (!!prev && x.w != null && Math.abs(x.w - prev.w) < EPS);
  const rest = b.sets.some((x, i) => i > si && !x.done && !x.warm && !x.drop && appL(x));
  if (b.adj && b.adj.at >= si) {
    delete b.adj;
    adjSrc.delete(b);
  }
  const off =
    !adjOn() ||
    b.adjOff ||
    !s.done ||
    s.warm ||
    s.drop ||
    !rest ||
    d.past ||
    d.editingId ||
    d.deload ||
    d.light ||
    b.light;
  if (!off) {
    const a = nextSets(b, si, lastRFor(b, si));
    if (a) {
      b.adj = a;
      adjSrc.set(b, s);
    }
  }
  adjRows(b, prev, b.adj || null);
}

/* ---------- a set done ---------- */

/** Whether reps are far past anything logged on the lift and its range (a typo: 105 for 10), asked about before they count (r32, second check: 100 x 105 was saved with a gold "Rep PR" and next time asked to beat 124 reps). */
export function oddReps(b: DraftBlock, s: DraftSet): boolean {
  const r = +(s.r ?? 0);
  if (!(r > ODD_REPS)) return false;
  let best = 0;
  for (const x of IDX().byEx[b.exId] || []) for (const p of x.pts) best = Math.max(best, p.r);
  return r > ODD_REPS_TIMES * Math.max(+b.plan.repMax || 0, best);
}

/* A saved set never has an empty load (the invariant; V on the r57 preview,
   PENDING 344: a barbell squat set with no weight could be ticked and sat at
   0 lb through the workout). A lift that takes a load has none for a row
   when nothing is typed and nothing shows in grey (a first session of the
   lift, with no suggestion yet). A bodyweight lift (its load is the added
   weight, often none), an assisted lift (the help, which Finish asks about)
   and a timed hold keep their rules. */
/** Whether row si of a lift that takes a load has no load typed and none in grey, so it cannot be ticked yet. */
export function noLoadYet(b: DraftBlock, si: number): boolean {
  const s = b.sets[si];
  const ex = EX(b.exId);
  return !!s && !ex.bw && !ex.timed && s.w == null && greyW(b, si) == null;
}

/* A set being ticked takes its grey load, so a saved set never has an empty
   load that would be stored as 0. Called inside a change given to act. */
/** A row about to be ticked takes the load it shows in grey. */
export function settleLoad(b: DraftBlock | null | undefined, si: number): void {
  const s = b && b.sets[si];
  if (!s || s.w != null) return;
  const g = greyW(b, si);
  if (g == null) return;
  s.w = g;
}

/* One place that marks a set done or not done, so the checkmark and
   auto-done paths cannot drift apart. The rest timer starts here only in
   Auto mode. A set far off (a load, or reps) is asked about first, and so is
   a 0 at a weight well under today's working load (r55.1, V 2026-10-19):
   Fix it goes back to the field; Log it ticks it, its rest not started over
   when it was ticked before (again, r55, the second review). In a superset
   the rest is taken after the last exercise of the group: no rest while a
   partner after this one still has a set to do; once the partners are
   through (a pair of 5 and 3 sets), every set rests (r34.2). The effort strip
   opens by itself only if asked for in Settings > Effort. The first set
   ticked on an exercise below untouched ones moves it up (r45). A set with no
   load to take (noLoadYet) is not ticked, whichever way the tick came (the
   checkmark, auto-mark, the grey reps): its load field is focused and marked,
   and the tick is made when a weight is typed there (workoutChange). */
/** Marks a set done or not done, with every effect a tick has. */
export function setDone(bi: number, si: number, val: boolean, again?: boolean): void {
  const d = state.draft;
  const b = d && d.ex[bi];
  const s = b && b.sets[si];
  if (!d || !b || !s) return;
  if (val && noLoadYet(b, si)) {
    W.needAt = { b: blkRef(bi), s: si };
    redraw();
    toast('Add the weight first');
    const f = document.querySelector<HTMLInputElement>(`.sg input[data-f="w"][data-b="${bi}"][data-s="${si}"]`);
    if (f) f.focus();
    return;
  }
  // A set its cleared load unticked is ticked again as the same set: its rest is not started over (356).
  if (val && unloaded.has(s)) {
    unloaded.delete(s);
    again = true;
  }
  const okKey = `${bi}:${si}:${s.r}:${effW(b, si)}`;
  const far = val && W.oddOk !== okKey && !oddReps(b, s) ? oddLoad(b, si, d.date) : null;
  const lz = val && W.oddOk !== okKey && !far && lightZero(b, si, d.date);
  if (val && W.oddOk !== okKey && (far || oddReps(b, s) || lz)) {
    const ex = EX(b.exId);
    const fix = far ? 'w' : 'r';
    confirmBox(
      `${setShort(ex, effW(b, si), s.r)}${ex.bw ? '' : ' ' + U()}?`,
      lz
        ? `0 ${ex.timed ? 'seconds' : 'reps'} at a weight well under today's working load. Log it as missed, or go back and fix it.`
        : `${far || `${s.r} ${ex.timed ? 'seconds' : 'reps'} is far past your ${rangeWords(b.plan)} and anything logged on this exercise.`} Log it as typed, or go back and fix it.`,
      lz ? 'Log it as missed' : 'Log it',
      () => {
        W.oddOk = okKey;
        setDone(bi, si, true, again);
        rerenderKeepScroll();
      },
      false,
      {
        label: 'Fix it',
        only: true,
        fn: () => {
          if (again) ui.refix = { b: blkRef(bi), s: si };
          const f = document.querySelector<HTMLInputElement>(
            `.sg input[data-f="${fix}"][data-b="${bi}"][data-s="${si}"]`
          );
          if (f) {
            f.focus();
            f.select();
          }
        }
      }
    );
    return;
  }
  const wasPR = rowPR(b, si, d.date);
  act(
    () => {
      if (val) settleLoad(b, si);
      s.done = val;
      assessSet(bi, si);
    },
    { inProgress: true }
  );
  if (val && isMissed(s) && !s.warm && !s.drop) toast(MISSED_SAID);
  W.platesAt = null;
  if (val && !d.editingId && blockDone(b) && !blkIsOpen(bi, b)) W.foldWait.add(b);
  redraw();
  const pr = rowPR(b, si, d.date);
  if (pr && !wasPR) {
    const ex = EX(b.exId);
    toast(
      `${pr === 'Best' ? (isCompound(ex) ? 'New best estimate' : 'PR') : pr}: ${exName(b.exId)}, ${setShort(ex, +(s.w ?? 0) || 0, s.r)}${prBeat(b.exId, s, d.date, pr)}`,
      false,
      PR_TOAST_MS,
      'pr'
    );
    /* The PR moment (item 28): a short gold pulse on the row, and a buzz where
       the phone allows it (Android; iPhones give web apps no vibration). */
    const btn = document.querySelector(`[data-act="sDone"][data-b="${bi}"][data-s="${si}"]`);
    const row = btn && btn.closest('.sg');
    // The pulse is the page's effect, not the screen's: lit-html keeps the row between draws, so the mark goes when the pulse ends.
    if (row instanceof HTMLElement) {
      row.classList.remove('prflash');
      void row.offsetWidth;
      row.classList.add('prflash');
      row.addEventListener('animationend', () => row.classList.remove('prflash'), { once: true });
    }
    try {
      if (navigator.vibrate) navigator.vibrate(PR_BUZZ);
    } catch (e) {
      // Vibration is optional; a browser that refuses it changes nothing.
    }
  }
  let autoRest =
    val && !again && !s.warm && !d.editingId && !d.past && +b.plan.rest > 0 && state.settings.timerMode === 'auto';
  if (autoRest && b.plan.ss) {
    const grp = d.ex.filter(x => x.plan && x.plan.ss === b.plan.ss);
    const k = grp.indexOf(b);
    if (grp.slice(k + 1).some(x => x.sets.some(y => !y.done && !y.warm && !y.drop))) autoRest = false;
  }
  if (autoRest) startTimer(+b.plan.rest);
  if (W.foldT) clearTimeout(W.foldT);
  W.foldT = null;
  const askRir =
    val &&
    state.settings.rirAsk === true &&
    !s.warm &&
    s.rir == null &&
    rirShow(EX(b.exId)) &&
    !!document.querySelector(`.rirb[data-b="${bi}"][data-s="${si}"]`);
  if (askRir) rirShowStrip(bi, si);
  else if (!val) rirClose();
  if (val && !askRir && !d.editingId && blockDone(b)) {
    const rf = blkRef(bi);
    W.foldT = setTimeout(() => autoFold(rf), FOLD_MS.tick);
  }
  if (val && b.sets.filter(x => x.done).length === 1 && orderAt(b) >= 0) orderSoon(b);
}

/* Typed reps, then a tap on the same row's RIR box (r30): auto-mark waits
   until the RIR strip closes, picked or not. Ticking at once started the
   rest timer, whose bar rose under the finger near the bottom of the
   screen, so the tap landed on the timer and the strip never opened. */
export function autoPending(): void {
  const p = W.pendAuto;
  W.pendAuto = null;
  const d = state.draft;
  if (!p || !d || !state.settings.autoDone) return;
  const bi = blkIdx(p.b);
  if (bi < 0) return;
  const s = d.ex[bi].sets[p.s];
  if (!s || s.done || !(+(s.r ?? 0) > 0 || isMissed(s))) return;
  W.lastAuto = { b: blkRef(bi), s: p.s, t: Date.now() };
  setDone(bi, p.s, true);
}

/** Opens the effort strip under a set, lifted into view above the rest bar and the tabs. */
export function rirShowStrip(bi: number, si: number): void {
  rirClose();
  const d = state.draft;
  if (!d || !d.ex[bi] || !d.ex[bi].sets[si]) return;
  if (!document.querySelector(`.rirb[data-b="${bi}"][data-s="${si}"]`)) return;
  W.stripAt = { b: blkRef(bi), s: si };
  redraw();
  // The rest bar appears on the same tap and can cover the strip; lift it into view above the bar and the tabs.
  requestAnimationFrame(() => {
    const st = document.querySelector('.rirstrip');
    if (!st) return;
    let lim = window.innerHeight;
    for (const id of ['timer', 'tabs']) {
      const el = document.getElementById(id);
      if (el && !el.hidden) {
        const t = el.getBoundingClientRect().top;
        if (t > 0) lim = Math.min(lim, t);
      }
    }
    const r = st.getBoundingClientRect();
    if (r.bottom > lim - STRIP_ROOM_PX.edge)
      window.scrollBy({ top: r.bottom - lim + STRIP_ROOM_PX.gap, behavior: 'smooth' });
  });
}

/** Closes the effort strip, and runs an auto-mark that waited for it. */
export function rirClose(): void {
  if (!W.stripAt) return;
  W.stripAt = null;
  redraw();
  autoPending();
}

/* A load far from last time's (under MIX_RANGE[0] or over MIX_RANGE[1] of it) is the usual
   sign of a per-dumbbell or per-side mix-up. Said once per exercise per
   session, never blocking. Warm-ups and drop sets are expected to be lighter. */
/** Says once when a typed load is far from last time's, the usual sign of a per-dumbbell or per-side mix-up. */
export function mixCheck(bi: number, si: number): void {
  const d = state.draft;
  const b = d && d.ex[bi];
  const s = b && b.sets[si];
  if (!d || !b || !s || s.warm || s.drop || !(+(s.w ?? 0) > 0)) return;
  const ex = EX(b.exId);
  const st = IDX().exStats[b.exId];
  const last = st && st.last ? st.last.topW : 0;
  if (!(last > 0)) return;
  const r = +(s.w ?? 0) / last;
  if (r >= MIX_RANGE[0] && r <= MIX_RANGE[1]) return;
  const key = d.id + ':' + bi;
  if (mixSeen.has(key)) return;
  mixSeen.add(key);
  toast(
    `${fmtW(+(s.w ?? 0))} ${U()} is ${r > 1 ? 'well above' : 'well below'} last time's ${fmtW(last)}. This one is logged as ${loadWords(ex)}.`,
    false,
    MIX_TOAST_MS
  );
}

/* A load typed on a working set fills the empty load fields of the working
   sets after it (carried, workstate.ts). Called inside a change given to act. */
export function carryLoad(b: DraftBlock, si: number): void {
  const s = b.sets[si];
  if (!s || s.warm || s.drop || s.w == null) return;
  for (let j = si + 1; j < b.sets.length; j++) {
    const x = b.sets[j];
    if (x.warm || x.drop || x.done || !(x.w == null || carried.has(x))) continue;
    x.w = s.w;
    carried.add(x);
  }
}

/* ---------- folds and order ---------- */

/** The exercise a done block folds to, after its moment: the next one not done is brought up, unless the thumb is already in it. */
export function autoFold(ref: BlkRef | null): void {
  W.foldT = null;
  if (W.blockDrag) return;
  const d = state.draft;
  if (!d || d.editingId || ui.modal || ui.tab !== 'today') return;
  const bi = blkIdx(ref);
  const b = bi < 0 ? null : d.ex[bi];
  if (!b || !blockDone(b) || blkIsOpen(bi, b)) return;
  // Any open effort strip waits the fold, not only this exercise's (r34.2: the rebuild closed a strip just opened on the next one).
  if (document.querySelector('.rirstrip')) {
    W.foldT = setTimeout(() => autoFold(ref), FOLD_MS.strip);
    return;
  }
  let nx = d.ex.findIndex((x, i) => i > bi && !blockDone(x));
  if (nx < 0) nx = d.ex.findIndex(x => !blockDone(x));
  const a0 = nx >= 0 ? document.getElementById('blk-' + nx) : null;
  const top0 = a0 ? a0.getBoundingClientRect().top : null;
  rerenderKeepScroll();
  const a1 = nx >= 0 ? document.getElementById('blk-' + nx) : null;
  if (a1 && top0 != null) {
    window.scrollBy(0, a1.getBoundingClientRect().top - top0);
    const ae = document.activeElement;
    if (!(ae && a1.contains(ae)))
      try {
        a1.scrollIntoView({ block: 'start', behavior: 'smooth' });
      } catch (e) {
        // Scrolling is best effort; the fold has happened either way.
      }
  }
}

/* One way to move an exercise in a session: the drag, the arrow keys on its
   handle and the ⋯ menu's Move up and Move down all come here. A superset
   split by the move is undone (its members are no longer next to each
   other, so the rest timer would never start), and a pending fold is dropped
   because the lifter is rearranging and should not have an exercise fold
   under them (r29). */
/** Moves an exercise of the session from place a to place b; false when nothing moved. */
export function moveBlock(a: number, b: number): boolean {
  const d = state.draft;
  if (!d || b < 0 || b >= d.ex.length || a === b) return false;
  if (W.foldT) clearTimeout(W.foldT);
  W.foldT = null;
  act(
    () =>
      keepOpen(() => {
        move(d.ex, a, b);
        fixSupersets(d.ex.map(x => x.plan));
      }),
    { inProgress: true }
  );
  return true;
}

/* Starting an exercise ahead of ones not yet touched moves it up, to just
   after the last one touched (V, 2026-10-13: a lift done out of order stayed
   below empty ones). It waits until no field is being typed in, no effort
   strip or sheet is open, and a pending fold has run, so a draw never takes
   a field from under the thumb; the moved exercise stays where it is on the
   screen, and the untouched ones go below it. The block itself is
   remembered, not its place. Never in a superset, a past workout, or an
   edit from History, and never past the same lift (Last and grey reps read
   repeats of a lift by order), nor between two halves of a superset. */
const blockUntouched = (b: DraftBlock | undefined): boolean =>
  !!b && !b.sets.some(x => x.done) && b.sets.every(x => rowBlank(b, x));

/** Where a block whose first set was just ticked moves up to, or -1. */
export function orderAt(b: DraftBlock): number {
  const d = state.draft;
  if (!d || d.editingId || d.past || !b || (b.plan && b.plan.ss)) return -1;
  const bi = d.ex.indexOf(b);
  if (bi < 1 || !b.sets.some(x => x.done)) return -1;
  let j = bi;
  while (j > 0 && blockUntouched(d.ex[j - 1]) && d.ex[j - 1].exId !== b.exId) j--;
  while (
    j < bi &&
    j > 0 &&
    d.ex[j].plan &&
    d.ex[j].plan.ss &&
    d.ex[j - 1].plan &&
    d.ex[j - 1].plan.ss === d.ex[j].plan.ss
  )
    j++;
  return j < bi ? j : -1;
}

function orderSoon(b: DraftBlock): void {
  if (!orderQ.includes(b)) orderQ.push(b);
  if (W.orderT) clearTimeout(W.orderT);
  W.orderT = setTimeout(orderRun, ORDER_MS.soon);
}

/** Moves up the blocks waiting to (orderSoon), once nothing is being typed or open; the last one ticked stays where it is on the screen. */
export function orderRun(): void {
  W.orderT = null;
  const d = state.draft;
  if (!d) {
    orderQ.length = 0;
    return;
  }
  const ae = document.activeElement;
  const typing =
    !!ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || (ae instanceof HTMLElement && ae.isContentEditable));
  if (
    ui.tab === 'today' &&
    (typing || W.blockDrag || drawing() || ui.modal || W.foldT != null || document.querySelector('.rirstrip'))
  ) {
    W.orderT = setTimeout(orderRun, ORDER_MS.again);
    return;
  }
  const q = orderQ.splice(0).filter(b => d.ex.includes(b));
  if (!q.length) return;
  const anchor = q[q.length - 1];
  const el0 = document.getElementById('blk-' + d.ex.indexOf(anchor));
  const top0 = ui.tab === 'today' && el0 ? el0.getBoundingClientRect().top : null;
  let moved = false;
  for (const b of q) {
    const bi = d.ex.indexOf(b),
      j = orderAt(b);
    if (j < 0) continue;
    // Only the focused field still carries a number, since it is markup; the set waiting to be confirmed, the pending auto-mark and the fold timer all hold the exercise itself (r46).
    const mi = (i: number): number => (i === bi ? j : i >= j && i < bi ? i + 1 : i);
    if (ae instanceof HTMLElement && /^\d+$/.test(ae.dataset.b || '')) ae.dataset.b = String(mi(Number(ae.dataset.b)));
    if (!moveBlock(bi, j)) continue;
    moved = true;
    ordBack.set(b, { i: bi, t: Date.now() });
  }
  if (!moved || ui.tab !== 'today') return;
  rerenderKeepScroll();
  const el1 = document.getElementById('blk-' + d.ex.indexOf(anchor));
  if (el1 && top0 != null) window.scrollBy(0, el1.getBoundingClientRect().top - top0);
}

/* ---------- the grey reps taken ---------- */

/* Auto-mark and the grey reps. With auto-mark on, typing reps and leaving the
   field ticks the set (the change handler). Leaving an empty field whose grey
   number is last time's reps is the same confirmation without the typing, so
   it ticks the set with that number, like tapping the checkmark. The iPhone
   number pad has no Next key; its keyboard Done or a tap elsewhere is how a
   field is left there, so both routes land here. Moving to the same row's
   load or RIR is not leaving the set, a tap on a button does that button's
   job instead (the row's own checkmark already takes the grey number), and a
   locked or backgrounded phone blurs fields without the lifter doing anything. */
export function acceptGrey(bi: number, si: number): boolean {
  const d = state.draft;
  if (!d || !state.settings.autoDone || drawing()) return false;
  const b = d.ex[bi];
  const x = b && b.sets[si];
  if (!b || !x || x.done || x.warm || x.drop || +(x.r ?? 0) > 0) return false;
  const lr = greyR(b, si);
  if (lr == null || !(lr > 0)) return false;
  // The grey reps and the tick are one change, saved once (as sDone's, from the independent review of r60).
  act(
    () => {
      x.r = Math.round(lr);
      W.lastAuto = { b: blkRef(bi), s: si, t: Date.now() };
      setDone(bi, si, true);
    },
    { inProgress: true }
  );
  return true;
}

/* ---------- the screen's actions ---------- */

/** Distance as typed, in the unit shown (miles to someone logging in lb), as kept: km, absent when none (r30). */
export const distIn = (v: string): number | null => {
  const n = numIn(v);
  return n != null && n > 0 ? Math.min(r3(U() === 'kg' ? n : n * KM_MI), LIMITS.distKm) : null;
};
