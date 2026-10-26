/* The session screen (r60, phase 5's last screen; ARCHITECTURE.md, Phase 5
   design): Today with a workout open, drawn by lit-html as src/21-pick-session.js
   drew it (viewLogger), with its taps and fields, auto-mark and the grey reps,
   the effort strip, the folds and the reorder after a first tick, the drag of
   an exercise, Finish and Discard, and the next sets adjusted after a ticked
   set (the decision is the engine's, nextSetsIn; what it does to the rows is
   here). Every change to the session in progress goes through `act`, which
   leaves the caches for a change to the session alone (nothing they hold is
   read from it). The screen is drawn again after each change and lit-html
   changes only what differs, where the legacy code patched the page by hand
   (afterSet, the checkmark's classes, the progress bar, the grey numbers, the
   PR mark, the plates line, the effort strip put in after a row); the
   numbers a row shows are read from the session each draw, so the screen
   cannot say what the log does not. What the screen opens stays with the
   sheet code in the legacy script, by the button's data-act, until the
   sheets move: the exercise menu, the picker, Short on time, the calibration
   set, the heaviest load, the load step, the note, Type or dictate sets, a
   lift's history and muscles, Pick for me, and the recap. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { act } from './act';
import { CARDIO, CARDIOL, CWHEN, CWHENL, ML, injLabel, isCompound, loadMode, noE1 } from './library';
import { fixSupersets, linkToggle, move, planItemOf, ssLetters, withPlanSets, pwOf } from './routines';
import { LIGHT_RIR, MISSED_SAID, effLeastShort, estMin, min5, missedTag, rangeWords, repSpan, fmtDate } from './format';
import {
  BACK_DAYS,
  REP_PR_SHARE,
  e1,
  isMissed,
  isWork,
  prSameLoad,
  rtfAt,
  rtfBand,
  rtfOf,
  setSecs,
  setupSecs
} from './formulas';
import { LB, PLATES_KG, PLATES_LB, KM_MI } from './units';
import { numIn, isDate, isNum, putById, today, uid, r1, andList, addDays } from './util';
import { cleanCardio, keepExtra } from './normalize';
import { cleanChk } from './records';
import type { Rec } from './records';
import { platesMode, platesPerSide } from './gym';
import { emptyLoad, loadNote, loadWords } from './loads';
import { BAND_WORDS, prName, prOverall } from './prs';
import { CHK_Q, chkWord } from './coach';
import { stripDemo } from './chunks';
import { effName, effShow, rirScale } from './effort';
import { BWASK_KEY, demoRestore, prefGet, prefSet } from './storage';
import {
  EX,
  IDX,
  U,
  activeRoutine,
  bwLoad,
  bwRefLoad,
  calStats,
  dayMinutes,
  daysOff,
  exBarKg,
  exName,
  fmtW,
  fromD,
  gymOf,
  hardCredit,
  invalidate,
  lightZero,
  lighterLoad,
  loadLabel,
  nextSets,
  oddLoad,
  pace,
  prFrame,
  prLoad,
  rackTol,
  rirEff,
  rirEst,
  rirHalfOn,
  routineUpdates,
  suggest,
  suggestCore
} from './live';
import { fx, state, ui } from './store';
import {
  RIR_OPTS,
  blockDone,
  blockRest,
  draftCardio,
  editFp,
  effTarget,
  effW,
  greyW,
  hintOnce,
  joinAdjacent,
  lastCell,
  lastDup,
  lastHead,
  newRow,
  savedEx,
  sessProgress,
  targetText,
  whyTarget
} from './session';
import type { BlkRef, DraftCardio, DraftLike } from './session';
import type { CardioEntry, DraftBlock, DraftSet, NextSetsAdj, PlanItem, Routine, Session, SessionEx } from './types';
import type { ExerciseLike } from './model';
import { bestLine, distShow, distU, effTgt, fmtDateLong, fmtE, loadHead, prSet, rirShow, setShort } from './display';
import { coarse } from './env';
import { adjOn } from './settings';
import {
  drawScreen,
  drawing,
  dragDrop,
  dragStart,
  fieldShown,
  fieldValue,
  helpButton,
  howText,
  section,
  tipButton
} from './view';
import type { Part } from './view';

/** A tap's element as the page's handler gives it: its data attributes. */
type Tap = { dataset: DOMStringMap };

/** The session in progress, as the screen reads and changes it. */
type Draft = DraftLike;

/* lit-html moves an exercise's nodes, or a row's, with it when the order
   changes (a reorder, a warm-up added above), so the field being typed in
   stays on its set: each is drawn under its own id (the block's bid, the
   row's rid, r46 and r56.1), or, for one made before those ids, under one
   given it for this visit. A repeated id (none is made twice) falls back to
   the place, which is what lit-html would use without ids. */
const visitKeys = new WeakMap<object, string>();
// A list drawn by repeat under those ids: the items, their ids, and the part each draws, in order.
function repeatKeyed<X extends object>(
  xs: readonly X[],
  id: (x: X) => string | undefined,
  part: (x: X, i: number) => TemplateResult
): unknown {
  const ks = keysOf(xs, id);
  return repeat(xs, (_, i) => ks[i], part);
}
let visitN = 0;
function keysOf<X extends object>(xs: readonly X[], id: (x: X) => string | undefined): string[] {
  const seen = new Set<string>();
  return xs.map((x, i) => {
    let k = id(x);
    if (!k) {
      k = visitKeys.get(x);
      if (!k) visitKeys.set(x, (k = 'v' + ++visitN));
    }
    if (seen.has(k)) k = k + '#' + i;
    seen.add(k);
    return k;
  });
}

/* ---------- what is kept beside the session, this visit only ---------- */

/* A load typed on a working set fills the empty load fields of the working
   sets after it, so an exercise with no history (nothing to prefill from) is
   not typed out once per set. Only blanks are filled: a prefilled target, a
   changed row, a done set, a warm-up or a drop set is never touched. Rows it
   filled follow a correction (100 typed as 10, then fixed) until the lifter
   edits them; that memory is in-page only, so after a reload they are plain
   typed rows. */
/** The rows whose load was carried down from a load typed above them (in this visit only). */
export const carried = new WeakSet<DraftSet>();
// The set an adjustment came from, by object, so a row added or removed above it cannot move it onto another set (r34.2); after a reload or a merge, by its row id (PENDING 333).
const adjSrc = new WeakMap<DraftBlock, DraftSet>();
/* An exercise opened again after it folded stays open when exercises around
   it move (r25): the block itself is remembered as well as its place. */
const blkOpenObj = new WeakSet<DraftBlock>();
/* What an edit of a saved session holds, to tell whether anything changed
   (r30: Cancel on an untouched edit asked "Discard this session?"). Kept in
   memory per draft; after a reload the edit asks as before. */
/** The fingerprint an edit from History started from, by the edit's draft id. */
export const editFp0 = new Map<string, string>();
// A pending fold, the exercise drag and the blocks waiting to move up (r29, r45).
let foldT: ReturnType<typeof setTimeout> | null = null;
let blockDrag = false;
let orderT: ReturnType<typeof setTimeout> | null = null;
const orderQ: DraftBlock[] = [];
/* A block in the session over time (r46). Neither handle on its own
   survives: a place changes whenever exercises move, and the object is
   replaced by normalize, which runs on every sync, Undo, cross-tab write and
   restore. The id made with the exercise survives both, so it leads, with
   the object and then the place behind it for a session started on a build
   before r46, which has no id. */
// The set waiting to be confirmed after auto-mark (sDone's 15 s), the set whose auto-mark waits for its effort strip or its load field, and a far-off number answered Log it.
let lastAuto: { b: BlkRef | null; s: number; t: number } | null = null;
let pendAuto: { b: BlkRef | null; s: number } | null = null;
let oddOk: string | null = null;
/* The row whose tick waits for its weight (344) or whose load Finish asked
   for: its load field is marked until a load is typed into it or the screen
   is drawn afresh. */
let needAt: { b: BlkRef | null; s: number } | null = null;
// Where the last touch landed, for the blur a phone fires before the tap it leads to (auto-mark's routes).
let lastDown: { el: Element | null; t: number } = { el: null, t: 0 };
// Loads far from last time's, said once per exercise per session (mixCheck).
const mixSeen = new Set<string>();
// Where a block was before its first tick moved it up (r55): an untick within half a minute puts it back.
const ordBack = new WeakMap<DraftBlock, { i: number; t: number }>();

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

/** A row's load is the app's, not the lifter's: empty (grey), the suggestion, carried down from a typed load above, or put there by the adjustment (r34). */
export function appLoad(b: DraftBlock | null | undefined, x: DraftSet): boolean {
  return x.w == null || (!!b && x.w === b.sw) || carried.has(x) || !!(b && b.adj && Math.abs(x.w - b.adj.w) < 1e-9);
}
/* A row that holds nothing of the lifter's: not ticked, no reps, no RIR, and
   a load that is empty or only the app's (the suggestion, or carried down).
   Everything that removes or rebuilds rows (− Set, Short on time, a swap)
   takes only these, so typed work is never dropped as a side effect (r25). */
/** Whether a row holds nothing of the lifter's. */
export function rowBlank(b: DraftBlock | null | undefined, x: DraftSet): boolean {
  return !x.done && x.r == null && x.rir == null && appLoad(b, x);
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

// Keyed by session too, so a block opened in one session is not open in the next.
const blkKey = (bi: number, b: DraftBlock): string => ((state.draft && state.draft.id) || '') + ':' + bi + ':' + b.exId;
const blkIsOpen = (bi: number, b: DraftBlock): boolean => ui.blkOpen.has(blkKey(bi, b)) || blkOpenObj.has(b);
/** Opens a block again after it folded, by its place and the block itself (r25). */
export function blkOpen(bi: number, b: DraftBlock): void {
  ui.blkOpen.add(blkKey(bi, b));
  blkOpenObj.add(b);
}
/** Runs a change to the session's exercise order and carries each block's open state to its new place. */
export function keepOpen<T>(fn: () => T): T {
  const d = state.draft;
  if (!d) return fn();
  const was = new Set(d.ex.filter((b, i) => blkIsOpen(i, b)));
  const r = fn();
  const dd = state.draft;
  if (dd)
    dd.ex.forEach((b, i) => {
      const k = blkKey(i, b);
      if (was.has(b)) {
        ui.blkOpen.add(k);
        blkOpenObj.add(b);
      } else ui.blkOpen.delete(k);
    });
  return r;
}
/** A block of the session held so a move or a redraw finds it again, or null. */
export function blkRef(bi: number): BlkRef | null {
  const d = state.draft;
  const b = d && d.ex[bi];
  return b ? { bid: b.bid || null, b, i: bi } : null;
}
/** Where a held block is now, or -1. */
export function blkIdx(r: BlkRef | null | undefined): number {
  const d = state.draft;
  if (!d || !r || !r.b) return -1;
  if (r.bid) return d.ex.findIndex(x => x.bid === r.bid);
  const j = d.ex.indexOf(r.b);
  if (j >= 0) return j;
  const k = d.ex[r.i];
  return k && k.exId === r.b.exId ? r.i : -1;
}
/* Null when the row is gone. A field still focused when its row goes (− Set,
   Swap, Undo, another phone's change) fires its pending change for a set that
   is no longer there. */
/** The set a field or button stands for, by its data-b and data-s, or null. */
export function draftSet(t: Tap): DraftSet | null {
  const b = state.draft && state.draft.ex[Number(t.dataset.b)];
  return (b && b.sets[Number(t.dataset.s)]) || null;
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
  const scq = (l: number, rr: number, q: number | null): number => e1(l, rr, q) || l * (1 + rr / 30);
  let top = 0,
    dom = false;
  for (const x of exps)
    for (const q of x.pts) {
      if (q.pl >= load - 1e-6 && q.r >= r) dom = true;
      top = Math.max(top, scq(q.pl, q.r, q.rq));
    }
  const judge = !noE1(ex) && !ex.timed && load > 0;
  const stronger = !judge || scq(load, r, q0) > top + 1e-9;
  if (!ex.timed && s.w != null && isNum(+s.w) && f.w > f.heaviest + 1e-6 && stronger) return 'Weight PR';
  if (!(load > 0) && !ex.timed && !ex.bw) return null;
  if (v != null && st && stronger) {
    const rtf = rtfOf(r, q0);
    const bd = rtf == null ? undefined : st.byBand && st.byBand[rtfBand(rtf)];
    if (bd != null && v > bd + 1e-6) return 'Best';
  }
  if (dom || !stronger) return null;
  if (!ex.timed && scq(load, r, q0) < top * REP_PR_SHARE - 1e-9) return null;
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
    return e1(l, r, rirEst(x, ex)) || l * (1 + r / 30);
  };
  const me = scq(s);
  return b.sets.some((x, i) => i < si && x.done && !x.warm && !x.drop && +(x.r ?? 0) > 0 && scq(x) >= me - 1e-9)
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
    return all == null || (shown ?? 0) > all + 1e-6
      ? ` (estimated 1RM ${fmtE(shown)} ${U()}${all != null ? `; was ${fmtE(all)}` : ''})`
      : ` (your best for ${bandW}, ${fmtE(shown)} ${U()})`;
  }
  if (pr === 'Weight PR') {
    const mw = f.heaviest;
    const was = ex.assist
      ? `less help than ever`
      : `heaviest before ${ex.bw ? loadLabel(ex, mw) : fmtW(mw) + ' ' + U()}`;
    return ` (${was}${isCompound(ex) && bd != null && v != null && v > bd + 1e-6 ? `; best estimate for ${bandW} now ${fmtE(shown)}` : ''})`;
  }
  let m = 0;
  for (const x of exps) for (const p of x.pts) if (p.pl >= load - 1e-6) m = Math.max(m, p.r);
  return m ? ` (was ${m} ${ex.timed ? 's' : 'reps'})` : ' (heaviest yet)';
}

/* ---------- loads as shown ---------- */

/* An assisted lift keeps its sets as bodyweight minus the help, below 0, so
   every estimate, target and record works unchanged; the field shows and
   takes the help as a plain number, since phone number pads have no minus. */
/** A load as its field shows it: the help on an assisted lift, blank for none. */
export const loadIn = (ex: ExerciseLike | null | undefined, w: number | null | undefined): string =>
  w == null ? '' : fmtW(ex && ex.assist ? -w : w);

/* What the load number means. Every set stores the number you typed, as
   you typed it. What it means is a property of the exercise, shown on the
   exercise and above the load column:
   - each:  per dumbbell, two dumbbells (DB bench, curls, lunges)
   - total: everything on one implement (a barbell with its bar, one dumbbell,
            plates on a landmine or a plate-loaded machine)
   - side:  plates on one side of a plate-loaded machine
   - stack: the pin setting on a cable or selectorized machine
   - bw:    added to bodyweight (pull-ups, dips)
   Estimated 1RM and targets stay in that same frame (per dumbbell, per side),
   so progress compares like with like. Weight lifted counts what actually
   moved: both dumbbells, both sides of the plates, both limbs when reps are
   logged per side. Changing an exercise's setting does not convert past
   sets. On the exercise, always visible: what the load number is, and reps
   per side when that applies. Tap or hold for the longer version. */
// The longer words for a load mode; a mode not listed falls to the equipment's words.
const LOAD_TIPS: Readonly<Record<string, string>> = {
  each: 'Enter the weight of one dumbbell. Weight lifted counts both.',
  side: 'Enter the plates on one side. Weight lifted counts both sides.',
  stack: 'Enter the pin setting. It is not comparable across machines.',
  bw: 'Enter only what you add (belt, vest, dumbbell); 0 for bodyweight. Your logged bodyweight is added for estimates.'
};
function lmChips(ex: ExerciseLike): Part {
  if (ex.timed && !ex.bw && loadMode(ex) !== 'each')
    return ex.perSide ? html`<p class="lmrow"><span class="lm">seconds per side</span></p>` : '';
  const m = loadMode(ex);
  if (ex.assist)
    return html`<p class="lmrow"><span class="lm" data-tip="Enter the help the machine gives, as on its pin. Less help is progress; your logged bodyweight minus the help is what counts.">machine help</span></p>`;
  const long =
    LOAD_TIPS[m] ||
    (ex.equip === 'barbell'
      ? 'Enter everything on the bar, the bar included.'
      : ex.equip === 'dumbbell'
        ? 'Enter the weight of the one dumbbell you hold.'
        : 'Enter the total load.');
  return html`<p class="lmrow"><span class="lm" data-tip=${long}>${loadWords(ex)}</span>${
    ex.perSide
      ? html`<span class="lm" data-tip=${ex.timed ? 'Seconds for one side; do the same on the other.' : 'Reps for one side; do the same on the other. One set still counts as one set.'}>${ex.timed ? 'seconds' : 'reps'} per side</span>`
      : ''
  }</p>`;
}

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
  return state.settings.smallPlates ? [...b, unit === 'lb' ? 1.25 : 0.5] : b.slice();
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
  if (load < bar - 1e-6) return `${fmtW(kg)} ${U()} is below the ${r1(bar)} ${pu} bar`;
  const { plates: out, rest: left } = platesPerSide(
    plateList(pu),
    md === 'sleeve' ? load : (load - bar) / 2,
    Math.max(1e-6, inU(rackTol()) / (md === 'sleeve' ? 1 : 2))
  );
  const rest = Math.round(left * 100) / 100;
  const tiny = pu !== U() && rest < (pu === 'kg' ? 0.1 : 0.25);
  const lead =
    md === 'sleeve'
      ? `On the sleeve at ${fmtW(kg)}`
      : md === 'side'
        ? `Per side at ${fmtW(kg)} (no bar)`
        : `Per side at ${fmtW(kg)}`;
  const tag = pu !== U() ? ` ${pu}` : '';
  return `${lead}: ${out.length ? out.join(', ') + tag : 'bar only'}${rest > 0 && !tiny ? ` (${rest} ${pu} not loadable)` : ''}`;
}
/* Which load to show: the set just edited, else the next set not yet done,
   else the heaviest set in the block. Grey loads count: the plates are for
   the load the row is going to be. Logged per side: the helper works from
   the total that makes. */
function plateLine(b: DraftBlock, si?: number | null): string {
  let at = si != null && b.sets[si] ? si : -1;
  if (at < 0) at = b.sets.findIndex((x, i) => !x.done && !x.warm && +(effW(b, i) ?? 0) > 0);
  const kg =
    at >= 0 ? +(effW(b, at) ?? 0) || 0 : Math.max(0, ...b.sets.map((x, i) => (x.warm ? 0 : +(effW(b, i) ?? 0) || 0)));
  const ex = EX(b.exId);
  const pm = platesMode(ex);
  if (loadMode(ex) === 'side')
    return plateText(kg * 2 + (pm === 'bar' ? exBarKg(ex) : 0), pm, ex).replace(
      /^Per side at [^:]+:/,
      'Plates a side:'
    );
  return plateText(kg, pm, ex);
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
  const at = done.filter(s => Math.abs((+(s.w ?? 0) || 0) - tw) < 1e-6);
  const heavier = done.filter(s => (+(s.w ?? 0) || 0) > tw + 1e-6);
  let heavyBeat = false,
    heavyTxt = '';
  if (heavier.length && t.prevBest != null && !ex.timed) {
    let best: number | null = null,
      bs: DraftSet | null = null;
    const seen = new Set<number>();
    for (const x of IDX().byEx[b.exId] || []) for (const p of x.pts) seen.add(p.w);
    for (const s of heavier) {
      const v = e1(bw + prSameLoad(+(s.w ?? 0) || 0, seen), +(s.r ?? 0), rirEst(s, ex));
      if (v != null && (best == null || v > best)) {
        best = v;
        bs = s;
      }
    }
    if (best != null) {
      heavyBeat = best > t.prevBest + 1e-6;
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
    .filter(s => s.done && +(s.r ?? 0) > 0 && (+(s.w ?? 0) || 0) >= tw - 1e-6 && +(s.r ?? 0) >= rm).length;
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
  return Math.round((Math.max(0, s - lastRest) * pace()) / 60);
}
/* Minutes left for the header: none once every set is done (min5 shows at least 1, so 0 left read "about 1 min left"). */
function leftMin(d: Draft): number {
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
  if (state.sessions.filter(s => !s.demo).length < 3) return -1;
  const cut = addDays(today(), -21);
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
    sets: Array.from({ length: +plan.sets || 3 }, () => newRow({ w: fillLoads() ? sg.w : null }))
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
        if (b.sw != null && sg.w != null && Math.abs(sg.w - b.sw) > 1e-6) continue;
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
function adjRows(b: DraftBlock, prev: NextSetsAdj | null, next: NextSetsAdj | null): void {
  const rows = (at: number, f: (x: DraftSet) => void): void =>
    b.sets.forEach((x, i) => {
      if (i > at && !x.done && !x.warm && !x.drop && x.w != null) f(x);
    });
  if (prev && (!next || next.at !== prev.at || next.w !== prev.w))
    rows(prev.at, x => {
      if (x.w != null && Math.abs(x.w - prev.w) < 1e-9) x.w = prev.from;
    });
  if (next)
    rows(next.at, x => {
      if (x.w != null && Math.abs(x.w - next.from) < 1e-9 && (x.w === b.sw || carried.has(x))) x.w = next.w;
    });
}
/* After a set is ticked, unticked or changed: judged again. Which rows are
   still the app's is read before the old adjustment goes: with "Fill in
   suggested loads" on they hold its load, and reading them after it was
   dropped put them back at once (r34.2, from the review). Called inside a
   change given to act. */
function assessSet(bi: number, si: number): void {
  const d = state.draft;
  const b = d && d.ex[bi];
  const s = b && b.sets[si];
  if (!d || !b || !s) return;
  const prev = b.adj ? { ...b.adj } : null;
  const appL = (x: DraftSet): boolean => appLoad(b, x) || (!!prev && x.w != null && Math.abs(x.w - prev.w) < 1e-9);
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
// Effort as the lifter reads it: RIR, or RPE when effort is entered as RPE. Same load, more reps: said as reps (r35).
function adjLine(b: DraftBlock, bi: number): Part {
  const a = b.adj;
  if (!a || !b.sets.some((x, i) => i > a.at && !x.done && !x.warm && !x.drop)) return '';
  const ex = EX(b.exId);
  const lb = (w: number): string => `${loadLabel(ex, w)}${ex.bw ? '' : ' ' + U()}${loadNote(ex)}`;
  if (Math.abs(a.w - a.from) < 1e-9)
    return html`<p class="adjline small" id=${`adj-${bi}`}><span><b>Next sets: ${a.r} reps at ${lb(a.w)}</b>, because ${a.why}.</span><button class="linkbtn" data-act="adjKeep" data-b=${bi}>Keep as it was</button></p>`;
  return html`<p class="adjline small" id=${`adj-${bi}`}><span><b>Next sets: ${lb(a.w)}</b>, ${a.up ? 'up' : 'down'} because ${a.why}.</span><button class="linkbtn" data-act="adjKeep" data-b=${bi}>Keep ${lb(a.from)}</button></p>`;
}

/* ---------- the screen ---------- */

/* RIR used to be a free-text field, then a native picker; it is picked from a
   strip of 0 to 5 under the set (r30): the cell shows the value, a tap on it
   opens the strip, and ticking a set with no RIR opens it by itself when
   asked for in Settings > Effort. Whole RIR is one row of 0 to 5. Half points
   and RPE are a grid under the label: whole numbers on top, each half between
   the two it sits between, every button 44 px tall and at least 40 px wide at
   320 px. The buttons carry RIR; RPE only changes what they say. */
function effOpts(): string[] {
  const sc = rirScale();
  return sc === 'whole' ? RIR_OPTS.slice() : ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5'];
}
const effAria = (si: number): string =>
  rirScale() === 'rpe' ? `RPE for set ${si + 1}` : `Reps in reserve for set ${si + 1}`;
/** The effort strip open under a set this visit: the block, held, and the row; a full redraw closes it, as the legacy page's did. */
interface StripAt {
  b: BlkRef | null;
  s: number;
}
let stripAt: StripAt | null = null;
function stripIs(bi: number, si: number): boolean {
  return !!stripAt && stripAt.s === si && blkIdx(stripAt.b) === bi;
}
function rirButton(val: DraftSet['rir'], bi: number, si: number, target: unknown): TemplateResult {
  const cur = effShow(val);
  return html`<button type="button" class=${'rirb' + (cur === '' ? ' unset' : '')} data-act="rirOpen" data-f="rir" data-b=${bi} data-s=${si} aria-haspopup="true" aria-expanded=${String(stripIs(bi, si))} aria-label=${`${effAria(si)}: ${cur === '' ? 'not set' : cur}`}>${cur === '' ? (target != null ? '–' : effName()) : cur}</button>`;
}
function rirStrip(bi: number, si: number, cur: string): TemplateResult {
  const sc = rirScale();
  const two = sc !== 'whole';
  // A stored value off the grid (0.25 from an import) shows in the set's box; the grid keeps its 11 places.
  const opts = effOpts();
  if (!two && cur !== '' && !opts.includes(cur)) {
    opts.push(cur);
    opts.sort((a, b) => +a - +b);
  }
  const btn = (o: string): TemplateResult =>
    html`<button type="button" data-act="rirPick" data-b=${bi} data-s=${si} data-v=${o} aria-pressed=${String(cur === o)} class=${cur === o ? 'on' : nothing}>${sc === 'rpe' ? effShow(o) : o}</button>`;
  // RPE reads up from 5 to 10, as RPE charts do; RIR from 0 up.
  const ord = sc === 'rpe' ? opts.slice().reverse() : opts;
  const body = two
    ? html`<div class="rs-g">${ord.filter(o => Number.isInteger(+o)).map(btn)}${ord.filter(o => !Number.isInteger(+o)).map(btn)}</div>`
    : opts.map(btn);
  return html`<div class=${'rirstrip' + (two ? ' two' : '')} role="group" aria-label=${effAria(si)} data-b=${bi} data-s=${si}><span class="rs-l">${effName()}</span>${body}<button type="button" class="rs-x" data-act="rirPick" data-b=${bi} data-s=${si} data-v="" aria-label=${`Clear ${effName()}`}>✕</button></div>`;
}

/* The three taps at the start of a session; how they line up with the
   sessions is Stats' Readiness and performance (stats.ts). What it offers
   (r30) sits below it with the two changes that answer it: two or more low
   answers, a lighter session first; one, a note to keep a rep more in
   reserve. Already made lighter: said instead of offered again. */
function checkinCard(d: Draft): TemplateResult {
  const c = d.chk || {};
  const sum = CHK_Q.filter(([k]) => c[k])
    .map(([k, l, n]) => `${l.toLowerCase()} ${chkWord(n[(c[k] || 1) - 1])}`)
    .join(', ');
  const low = CHK_Q.filter(([k]) => c[k] === 1).length;
  return html`${section({
    sk: 'logger:checkin',
    title: 'Check-in',
    sub: sum || 'optional',
    body: html`${CHK_Q.map(
      ([k, l, names]) =>
        html`<div class="ci-row"><span class="small">${l}</span><div class="seg" role="group" aria-label=${l}>${names.map(
          (n, i) =>
            html`<button class=${'chip ' + (c[k] === i + 1 ? 'on' : '')} data-act="chk" data-k=${k} data-v=${i + 1} aria-pressed=${String(c[k] === i + 1)}>${n}</button>`
        )}</div></div>`
    )}
  `
  })}${readyCard(d, low)}`;
}
/** What the check-in offers under it, or nothing (above). */
export function readyCard(d: Draft, low: number): Part {
  if (!low || d.light || d.deload || d.editingId || d.past) return '';
  const open = d.ex.some(b => !b.light && !b.sets.some(x => !x.warm && !rowBlank(b, x)));
  const left = remainMin(d);
  if (low >= 2 && !open && d.ex.some(b => b.light))
    return html`<p class="callout" style="margin:8px 0 0" id="readyCard">Made lighter: the exercises not started are half the sets at about 90% loads.</p>`;
  if (low < 2)
    return html`<p class="callout" style="margin:8px 0 0" id="readyCard">One low answer: keep the loads and leave a rep more in reserve than planned if it feels heavy.</p>`;
  return html`<div class="callout yellow" style="margin:8px 0 0" id="readyCard"><p style="margin:0">Low readiness today. ${tipButton('A lighter or shorter session fits a low day better than pushing. Make it lighter changes only the exercises not started: half the sets, about 90% loads, nothing to beat.')}</p><div class="row" style="margin-top:8px">${open ? html`<button class="btn sm" data-act="makeLight">Make it lighter</button>` : ''}${left > 0 ? html`<button class="btn sm" data-act="shortOpen">Short on time</button>` : ''}</div></div>`;
}
/* Bodyweight, asked once in the first session with a bodyweight lift when
   none is logged (r32, from the third review: pull-ups and leg raises added
   nothing to weight lifted, and had no estimate, with no weigh-in). Saved
   like a weigh-in on Today; Not now is kept per device. */
function bwAskCard(d: Draft): Part {
  if (d.editingId || d.past || state.bodyweights.length || !d.ex.some(b => EX(b.exId).bw)) return '';
  if (prefGet(BWASK_KEY)) return '';
  return html`<div class="card" id="bwAsk"><p class="small" style="margin:0 0 8px"><b>Your bodyweight</b> counts in bodyweight lifts, for weight lifted and estimates. ${tipButton('Logged as a weigh-in for today. Add more on Today, under Body.', 'About bodyweight')}</p>
  <div class="row"><label class="field" style="flex:1;margin:0"><span class="vh">Bodyweight (${U()})</span><input type="text" inputmode="decimal" id="bwVal" placeholder=${`Weight (${U()})`} aria-label=${`Bodyweight (${U()})`}></label><button class="btn sm primary" data-act="addBW">Save</button><button class="btn sm" data-act="bwAskNo">Not now</button></div></div>`;
}
/* Cardio and mobility inside a session: saved as their own entries on Finish,
   never counted as lifting sets. */
function cardioDraftCard(d: Draft): TemplateResult {
  const list = d.cardio || [];
  const rows = list.map(
    (
      c,
      ci
    ) => html`<div class="cgrid"><label class="field">Type<select data-cf="kind" data-c=${ci}>${CARDIO.map(([k, l]) => html`<option value=${k} .selected=${c.kind === k}>${l}</option>`)}</select></label>
    <label class="field">Minutes<input type="text" inputmode="numeric" data-cf="min" data-c=${ci} .value=${fieldValue(c.min == null ? '' : String(c.min))}></label>
    <label class="field">Avg HR<input type="text" inputmode="numeric" data-cf="hr" data-c=${ci} .value=${fieldValue(c.hr == null ? '' : String(c.hr))} placeholder="optional"></label></div>
    <label class="field" style="margin-top:6px">Distance (${distU()})<input type="text" inputmode="decimal" data-cf="dist" data-c=${ci} .value=${fieldValue(c.dist ? String(distShow(c.dist)) : '')} placeholder="optional"></label>
    <div class="row" style="margin-top:6px"><select data-cf="when" data-c=${ci} style="flex:1" aria-label="When">${CWHEN.map(([k, l]) => html`<option value=${k} .selected=${c.when === k}>${l}</option>`)}</select><button class="btn sm danger" data-act="cDraftDel" data-c=${ci}>Remove</button></div>`
  );
  const n = list.length;
  const mins = list.reduce((a, c) => a + (c.min || 0), 0);
  return section({
    sk: 'logger:cardio',
    title: 'Cardio and mobility',
    sub: n ? `${n} entr${n === 1 ? 'y' : 'ies'}${mins ? `, ${mins} min` : ''}` : 'optional',
    body: html`${rows}
  <div class="row" style=${`margin-top:${n ? 10 : 0}px`}><button class="btn sm" data-act="cDraftAdd" data-when="pre">+ Before lifting</button><button class="btn sm" data-act="cDraftAdd" data-when="post">+ After lifting</button></div>`
  });
}
/* A session's exercises move by dragging this handle too (V, r29), alongside
   the ⋯ menu's Move up and Move down, which do the same thing (bUp, bDown). */
function bgrip(bi: number, name: string): TemplateResult {
  return html`<span class="bgrip" role="button" tabindex="0" data-b=${bi} aria-label=${`Move ${name}: drag, or use the arrow keys`} title="Drag to move">⠿</span>`;
}
// Last time's set beside this row (r44): "100×8" with a break allowed before the ×, as the column is narrow.
function lastText(lt: string): Part {
  const k = lt.indexOf('×');
  return k < 0 ? lt : html`${lt.slice(0, k)}<wbr>${lt.slice(k)}`;
}
function setRow(
  d: Draft,
  b: DraftBlock,
  bi: number,
  si: number,
  ex: ExerciseLike,
  nr: boolean,
  dupB: boolean
): TemplateResult {
  const s = b.sets[si];
  const p = b.plan;
  const g = greyR(b, si);
  const ph = g == null ? '' : String(g);
  const pr = rowPR(b, si, d.date);
  const wn = b.sets.slice(0, si + 1).filter(x => !x.warm && !x.drop).length;
  // Last time's set for this row, beside this time's (r44, V): working sets only, by their order.
  const lt = s.warm || s.drop ? '' : lastCell(b, wn - 1, dupB);
  const gw = s.w == null ? greyW(b, si) : null;
  return html`<div class=${`sg${nr ? ' norir' : ''} ${s.done ? 'done' : ''}${pr ? ' pr' : ''}`} data-pr=${pr || nothing}><button class=${'n wbtn' + (s.drop ? ' drop' : s.warm ? ' warm' : '')} aria-label=${`Set ${si + 1} type: ${s.warm ? 'warm-up' : s.drop ? 'drop set' : 'working set'}. Tap to change`} data-act="sWarm" data-b=${bi} data-s=${si}>${s.drop ? '↓' : s.warm ? 'W' : wn}</button><span class="ls" aria-label=${lt ? 'Last time ' + lt : 'No set last time'}>${lt ? lastText(lt) : '–'}</span>
        <input type="text" inputmode="decimal" enterkeyhint="next" aria-label=${`${ex.name}, set ${si + 1} load`} data-f="w" data-b=${bi} data-s=${si} class=${needHere(bi, si) ? 'need' : nothing} .value=${fieldValue(loadIn(ex, s.w))} placeholder=${gw != null ? loadIn(ex, gw) : emptyLoad(ex)}>
        <input type="text" inputmode="numeric" enterkeyhint="next" aria-label=${`${ex.name}, set ${si + 1} ${ex.timed ? 'seconds' : 'reps'}${ex.perSide ? ' per side' : ''}`} data-f="r" data-b=${bi} data-s=${si} .value=${fieldValue(s.r == null ? '' : String(s.r))} placeholder=${ph}>
        ${nr ? '' : rirButton(s.rir, bi, si, p.rir)}
        <button class=${'cbtn ' + (s.done ? 'on' : '')} aria-label=${`Set ${si + 1} ${s.done && isMissed(s) ? 'missed' : 'done'}`} aria-pressed=${s.done ? 'true' : 'false'} data-act="sDone" data-b=${bi} data-s=${si}>✓</button></div>${stripIs(bi, si) ? rirStrip(bi, si, s.rir == null ? '' : String(s.rir)) : nothing}`;
}
function progressLine(b: DraftBlock, bi: number): Part {
  const p = blockProgress(b);
  return p ? html`<span class=${'tp' + (p.beat ? ' beat' : '')} id=${`tp-${bi}`}>${p.text}</span>` : '';
}
function blockPart(
  d: Draft,
  b: DraftBlock,
  bi: number,
  letters: Readonly<Record<string, string>>,
  hintSeen: Set<string>,
  calIdx: number
): TemplateResult {
  const ex = EX(b.exId);
  const p = b.plan;
  const ss = p.ss ? letters[p.ss] : null;
  const nr = !rirShow(ex);
  const dupB = lastDup(d, bi);
  if (!d.editingId && blockDone(b) && !blkIsOpen(bi, b) && !foldWait.has(b)) {
    const ws = b.sets.filter(x => !x.warm);
    const prs = b.sets.filter((x, si) => !x.warm && rowPR(b, si, d.date)).length;
    return html`<section class="block folded" id=${`blk-${bi}`} data-bi=${bi}>${bgrip(bi, ex.name)}<button class="bfold" data-act="bOpen" data-b=${bi} aria-expanded="false" aria-label=${`${ex.name}, done. Open to edit`}><span class="bf-ck" aria-hidden="true">✓</span><span class="bf-t"><b>${ex.name}</b><span>${ws.map(x => setShort(ex, x.w, x.r) + missedTag(x)).join(', ')}</span></span>${prs ? html`<span class="bf-pr">PR</span>` : ''}<span class="chev" aria-hidden="true"></span></button></section>`;
  }
  const partner = ss
    ? d.ex
        .filter(x => x !== b && x.plan.ss === p.ss)
        .map(x => exName(x.exId))
        .join(' + ')
    : '';
  const why = whyTarget(b);
  const bl = b.target ? bestLine(b.exId, d.past ? d.date : '') : '';
  const work = b.sets.filter(x => !x.warm && !x.drop).length;
  const canFill =
    !!b.lastR &&
    b.lastR.some(r => r != null) &&
    b.sets.some((s, i) => !s.done && !s.warm && !s.drop && s.r == null && lastRFor(b, i) != null);
  return html`<section class=${'block' + (ss ? ' ss' : '')} id=${`blk-${bi}`} data-bi=${bi}><div class="bh">${bgrip(bi, ex.name)}<div class="bh-m"><h3 aria-labelledby=${ex.note ? `bhn-${bi}` : nothing}><span id=${`bhn-${bi}`}>${ex.name}</span>${ex.note ? html` ${tipButton(ex.note, 'About ' + ex.name)}` : ''}</h3><p class="small muted">${ML[ex.primary]} · ${work || p.sets}×${repSpan(p.repMin, p.repMax, '-')}${ex.timed ? 's' : ''}${ex.perSide ? '/side' : ''}${nr ? '' : ` @${b.inj || ((d.light || d.deload || b.light) && b.last) ? effLeastShort(rirScale(), LIGHT_RIR) : effTgt(p.rir)}`} · ${p.rest}s${ss ? html` · <span class="tag blue">Superset ${ss}</span>` : ''}${b.inj ? html` · <span class="tag red">Injury: ${injLabel(b.inj)}</span>` : ''}</p>${lmChips(ex)}</div>
      <div class="bh-acts">${!d.editingId && blockDone(b) ? html`<button class="ib" aria-label=${`Fold ${ex.name}`} data-act="bFold" data-b=${bi}>▴</button>` : ''}<button class="ib" aria-label="Exercise options" data-act="bMenu" data-b=${bi}>⋯</button></div></div>
      ${
        b.target
          ? html`<p class="hint"><b>Today: ${targetText(b)}</b>${why ? html` ${tipButton(why, 'Why this target')}` : ''}<span class="tp muted" style="display:block">${lastHead(b, dupB)}</span>${bl ? html`<span class="tp muted" style="display:block">${bl}</span>` : ''}${b.easier ? html`<span class="tp ez">${b.easier}</span>` : ''}${progressLine(b, bi)}</p>`
          : html`<p class="hint">${hintOnce(b.hint || '', hintSeen)}</p>`
      }${bi === calIdx ? html`<p class="small caldue">Due for an RIR check: take one set here to failure. <button class="linkbtn tall" data-act="bCal" data-b=${bi}>Calibration set</button> <button class="linkbtn tall" data-act="calSnooze">Not now</button></p>` : ''}
      ${ss && partner ? html`<p class="small muted" style="margin:2px 0 0">Superset with ${partner}; rest after the pair.</p>` : ''}
      ${b.lastNote && !b.note ? html`<p class="small lnote">Your note, ${fmtDate(b.lastNote.date)}: ${b.lastNote.text} <button class="linkbtn" data-act="noteReuse" data-b=${bi}>Use again</button></p>` : ''}
      ${b.note ? html`<p class="small bnote" id=${`bn-${bi}`}>${b.note}</p>` : html`<p class="small bnote" id=${`bn-${bi}`} hidden></p>`}
      <div class=${'sg head' + (nr ? ' norir' : '')}><span data-tip="Tap a set's number to mark it a warm-up or a drop set.">#</span><span class="lsh">Last</span><span class="lh" data-tip=${'Load: ' + loadWords(ex)}>${loadHead(ex)}</span><span>${ex.timed ? (ex.perSide ? 'Sec/side' : 'Sec') : ex.perSide ? 'Reps/side' : 'Reps'}</span>${nr ? '' : html`<span>${effName()}</span>`}<span>Done</span></div>${repeatKeyed(
        b.sets,
        x => x.rid,
        (_, si) => setRow(d, b, bi, si, ex, nr, dupB)
      )}${adjLine(b, bi)}${
        platesMode(ex) !== 'none'
          ? html`<p class="small muted" id=${`pl-${bi}`} style="margin:6px 0 0">${plateLine(b, platesAt && blkIdx(platesAt.b) === bi ? platesAt.s : null)}</p>`
          : ''
      }<div class="row" style="margin-top:8px">${canFill ? html`<button class="btn sm" data-act="fillLast" data-b=${bi} aria-label="Copy last session's reps" data-tip="Fill empty rows with last session's reps.">Copy last</button>` : ''}<button class="btn sm" data-act="sAdd" data-b=${bi} aria-label="Add a set" data-tip="Add a working set at the last load.">+ Set</button><button class="btn sm" data-act="sDel" data-b=${bi} aria-label="Remove a set" data-tip="Removes the last set not yet done." ?disabled=${!b.sets.length}>− Set</button>${
        !ex.timed && b.sets.some(x => x.done && !x.warm && !x.drop)
          ? html`<button class="btn sm" data-act="dropAdd" data-b=${bi} aria-label="Add a drop set" data-tip="About 75% of the last working load, in your steps. Counts as half a set and never sets a target.">+ Drop</button>`
          : ''
      }${
        state.settings.timerMode !== 'off' && +p.rest > 0 && !d.past
          ? html`<button class="btn sm rest" data-act="tStart" data-b=${bi} aria-label=${`Start a ${p.rest} second rest`} data-tip="Start the rest timer.">⏱ ${p.rest}s</button>`
          : ''
      }</div></section>`;
}
const LOG_HELP_ON =
  'RIR is reps left in the tank: 3 or less counts the set as hard for weekly volume, 4 or more stays in history only. RIR is optional: a blank is read as your usual RIR on that lift, or as hard until you have rated a few of its sets. ';
const LOG_HELP =
  'W marks a warm-up (kept, never analysed); tap it again for D, a drop set (counts as work and volume, never as a PR or target). To add a new warm-up or drop set row, use the ⋯ menu on the exercise. Drag an exercise by its ⠿ to change the order. In a superset the rest timer starts after the last exercise of the pair. Timed holds log seconds in the Sec column. The date can be changed to log a past session.';
/** The session screen: Today with a workout open, drawn as a template of the session in progress and ui. */
export function viewWorkout(d: Draft): TemplateResult {
  const hintSeen = new Set<string>();
  // Warm-ups are not counted, the same as the progress bar under it.
  const doneN = d.ex.reduce((a, b) => a + b.sets.filter(s => s.done && !s.warm).length, 0);
  const left = leftMin(d);
  const sp = sessProgress(d);
  const calIdx = d.editingId ? -1 : calDueIdx(d);
  const letters = ssLetters(d.ex.map(b => b.plan));
  return html`<div class="ph"><div style="min-width:0;flex:1 1 auto"><p class="kick">${d.editingId ? 'Editing a saved session' : d.past ? 'Past workout' : 'Session in progress'}</p><div class="hrow"><h2 style="overflow-wrap:anywhere;min-width:0">${d.dayName}</h2>${helpButton('log')}<button class="btn sm danger" style="margin-left:auto;flex:none" data-act="discard">${d.editingId ? 'Cancel edit' : 'Discard'}</button></div><p class="meta"><span id="doneCount">${doneN}</span> <span id="doneWord">${doneN === 1 ? 'set' : 'sets'}</span> done${d.past ? `, for ${fmtDateLong(d.date)}` : ''}${d.startedAt && !d.past ? `, started ${new Date(d.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}<span id="sessLeft">${left > 0 ? `, ${estMin(left)} left` : ''}</span></p>${
    sp.n
      ? html`<div class="sprog" aria-hidden="true"><div class="band"><div class="fill prog" id="sessBar" style=${`width:${sp.pct}%`}></div></div><span id="sessOf">${sp.k} of ${sp.n}</span></div>`
      : ''
  }
  <div class="row lh-row"><input type="date" data-bind="draftDate" .value=${fieldValue(d.date)} max=${today()} aria-label="Session date" data-tip="Change to log a past session">${left > 0 ? html`<button class="btn sm" data-act="shortOpen">Short on time</button>` : ''}</div></div></div>
  ${howText('log', (state.settings.rirMode === 'off' ? 'RIR is switched off in Settings, so every working set counts as hard. ' : LOG_HELP_ON) + LOG_HELP + (d.past ? ' Quick entry: no rest timer, and a set counts as done once its reps are typed.' : state.settings.autoDone ? ' Auto-mark is on: sets tick themselves when you leave the reps field.' : ''))}
  ${
    d.free
      ? html`<label class="field" style="margin-top:8px">Name<input type="text" data-bind="draftName" maxlength="40" .value=${fieldValue(d.dayName || '')}></label><p class="small muted" style="margin:4px 0 0">Not tied to a routine day, so your cycle stays put.</p>`
      : ''
  }
  ${d.past ? '' : checkinCard(d)}${bwAskCard(d)}${
    !d.ex.length
      ? html`<div class="card"><p class="small" style="margin:0">No exercises yet. Tap + Add exercise below${d.editingId ? '' : ', or Pick for me for a suggestion based on your last 7 days,'} and log as you go.</p></div>`
      : ''
  }${repeatKeyed(
    d.ex,
    b => b.bid,
    (b, bi) => blockPart(d, b, bi, letters, hintSeen, calIdx)
  )}<div class="row"><button class="btn" style="flex:1" data-act="pickSession">+ Add exercise</button>${d.editingId ? '' : html`<button class="btn" data-act="pickEx">Pick for me</button>`}</div>${d.editingId ? '' : cardioDraftCard(d)}<label class="field" style="margin-top:12px">Notes<textarea data-bind="draftNotes" .defaultValue=${d.notes || ''} .value=${fieldValue(d.notes || '')}></textarea></label>
  <div class="row fin-row" style="margin-top:12px"><button class="btn danger" data-act="discard">${d.editingId ? 'Cancel edit' : 'Discard'}</button><button class="btn primary" style="flex:1" data-act="finish" data-tip="Only sets marked done are saved; you are asked about any with reps but no checkmark.">${d.editingId ? 'Save changes' : 'Finish and save'}</button></div>`;
}

/* ---------- drawing it again ---------- */

/* What a full draw of the page puts back as the legacy page's fresh markup
   did (the host calls this before it draws the session): the effort strip
   closed, the plates line on the next set again, and a fold waiting for its
   moment done now. A draw of the session in place (redraw, below) keeps
   them, as the legacy page's patches did. */
/** Puts back what a full draw of the page resets on the session screen. */
export function workoutFullDraw(): void {
  needAt = null;
  stripAt = null;
  platesAt = null;
  foldWait = new WeakSet();
}
// The row whose load is being typed, whose plates the line under the exercise shows (r29), until the next tick or full draw.
let platesAt: { b: BlkRef | null; s: number } | null = null;
/* A block done this visit folds a moment after its last tick (1.2 s, or
   once its effort is picked), not on the tick: the lifter sees the tick and
   the effort strip first. Until then it is drawn open. */
let foldWait = new WeakSet<DraftBlock>();
/** Draws the session screen again in place, where it is on screen: lit-html changes only what differs, so the field being typed in and its caret stay. */
export function redraw(): void {
  const v = document.getElementById('view');
  if (!v || ui.tab !== 'today' || !state.draft) return;
  if (drawing()) {
    queueMicrotask(redraw);
    return;
  }
  drawScreen(v, viewWorkout(state.draft));
}

/* ---------- a set done ---------- */

/** Whether reps are far past anything logged on the lift and its range (a typo: 105 for 10), asked about before they count (r32, second check: 100 x 105 was saved with a gold "Rep PR" and next time asked to beat 124 reps). */
export function oddReps(b: DraftBlock, s: DraftSet): boolean {
  const r = +(s.r ?? 0);
  if (!(r > 30)) return false;
  let best = 0;
  for (const x of IDX().byEx[b.exId] || []) for (const p of x.pts) best = Math.max(best, p.r);
  return r > 2 * Math.max(+b.plan.repMax || 0, best);
}
/** Whether row si's load field is the one marked as needing a load. */
function needHere(bi: number, si: number): boolean {
  return !!needAt && needAt.s === si && blkIdx(needAt.b) === bi;
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
    needAt = { b: blkRef(bi), s: si };
    redraw();
    fx.toast('Add the weight first');
    const f = document.querySelector<HTMLInputElement>(`.sg input[data-f="w"][data-b="${bi}"][data-s="${si}"]`);
    if (f) f.focus();
    return;
  }
  const okKey = `${bi}:${si}:${s.r}:${effW(b, si)}`;
  const far = val && oddOk !== okKey && !oddReps(b, s) ? oddLoad(b, si, d.date) : null;
  const lz = val && oddOk !== okKey && !far && lightZero(b, si, d.date);
  if (val && oddOk !== okKey && (far || oddReps(b, s) || lz)) {
    const ex = EX(b.exId);
    const fix = far ? 'w' : 'r';
    fx.confirm(
      `${setShort(ex, effW(b, si), s.r)}${ex.bw ? '' : ' ' + U()}?`,
      lz
        ? `0 ${ex.timed ? 'seconds' : 'reps'} at a weight well under today's working load. Log it as missed, or go back and fix it.`
        : `${far || `${s.r} ${ex.timed ? 'seconds' : 'reps'} is far past your ${rangeWords(b.plan)} and anything logged on this exercise.`} Log it as typed, or go back and fix it.`,
      lz ? 'Log it as missed' : 'Log it',
      () => {
        oddOk = okKey;
        setDone(bi, si, true, again);
        fx.rerenderKeepScroll();
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
  if (val && isMissed(s) && !s.warm && !s.drop) fx.toast(MISSED_SAID);
  platesAt = null;
  if (val && !d.editingId && blockDone(b) && !blkIsOpen(bi, b)) foldWait.add(b);
  redraw();
  const pr = rowPR(b, si, d.date);
  if (pr && !wasPR) {
    const ex = EX(b.exId);
    fx.toast(
      `${pr === 'Best' ? (isCompound(ex) ? 'New best estimate' : 'PR') : pr}: ${exName(b.exId)}, ${setShort(ex, +(s.w ?? 0) || 0, s.r)}${prBeat(b.exId, s, d.date, pr)}`,
      false,
      4200,
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
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
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
  if (autoRest) fx.startTimer(+b.plan.rest);
  if (foldT) clearTimeout(foldT);
  foldT = null;
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
    foldT = setTimeout(() => autoFold(rf), 1200);
  }
  if (val && b.sets.filter(x => x.done).length === 1 && orderAt(b) >= 0) orderSoon(b);
}
/* Typed reps, then a tap on the same row's RIR box (r30): auto-mark waits
   until the RIR strip closes, picked or not. Ticking at once started the
   rest timer, whose bar rose under the finger near the bottom of the
   screen, so the tap landed on the timer and the strip never opened. */
function autoPending(): void {
  const p = pendAuto;
  pendAuto = null;
  const d = state.draft;
  if (!p || !d || !state.settings.autoDone) return;
  const bi = blkIdx(p.b);
  if (bi < 0) return;
  const s = d.ex[bi].sets[p.s];
  if (!s || s.done || !(+(s.r ?? 0) > 0 || isMissed(s))) return;
  lastAuto = { b: blkRef(bi), s: p.s, t: Date.now() };
  setDone(bi, p.s, true);
}
/** Opens the effort strip under a set, lifted into view above the rest bar and the tabs. */
function rirShowStrip(bi: number, si: number): void {
  rirClose();
  const d = state.draft;
  if (!d || !d.ex[bi] || !d.ex[bi].sets[si]) return;
  if (!document.querySelector(`.rirb[data-b="${bi}"][data-s="${si}"]`)) return;
  stripAt = { b: blkRef(bi), s: si };
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
    if (r.bottom > lim - 8) window.scrollBy({ top: r.bottom - lim + 16, behavior: 'smooth' });
  });
}
/** Closes the effort strip, and runs an auto-mark that waited for it. */
export function rirClose(): void {
  if (!stripAt) return;
  stripAt = null;
  redraw();
  autoPending();
}
/* A load far from last time's (under 60% or over 140% of it) is the usual
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
  if (r >= 0.6 && r <= 1.4) return;
  const key = d.id + ':' + bi;
  if (mixSeen.has(key)) return;
  mixSeen.add(key);
  fx.toast(
    `${fmtW(+(s.w ?? 0))} ${U()} is ${r > 1 ? 'well above' : 'well below'} last time's ${fmtW(last)}. This one is logged as ${loadWords(ex)}.`,
    false,
    7000
  );
}
/* A load typed on a working set fills the empty load fields of the working
   sets after it (carried, above). Called inside a change given to act. */
function carryLoad(b: DraftBlock, si: number): void {
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
function autoFold(ref: BlkRef | null): void {
  foldT = null;
  if (blockDrag) return;
  const d = state.draft;
  if (!d || d.editingId || ui.modal || ui.tab !== 'today') return;
  const bi = blkIdx(ref);
  const b = bi < 0 ? null : d.ex[bi];
  if (!b || !blockDone(b) || blkIsOpen(bi, b)) return;
  // Any open effort strip waits the fold, not only this exercise's (r34.2: the rebuild closed a strip just opened on the next one).
  if (document.querySelector('.rirstrip')) {
    foldT = setTimeout(() => autoFold(ref), 1500);
    return;
  }
  let nx = d.ex.findIndex((x, i) => i > bi && !blockDone(x));
  if (nx < 0) nx = d.ex.findIndex(x => !blockDone(x));
  const a0 = nx >= 0 ? document.getElementById('blk-' + nx) : null;
  const top0 = a0 ? a0.getBoundingClientRect().top : null;
  fx.rerenderKeepScroll();
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
  if (foldT) clearTimeout(foldT);
  foldT = null;
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
  if (orderT) clearTimeout(orderT);
  orderT = setTimeout(orderRun, 900);
}
/** Moves up the blocks waiting to (orderSoon), once nothing is being typed or open; the last one ticked stays where it is on the screen. */
export function orderRun(): void {
  orderT = null;
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
    (typing || blockDrag || drawing() || ui.modal || foldT != null || document.querySelector('.rirstrip'))
  ) {
    orderT = setTimeout(orderRun, 1500);
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
  fx.rerenderKeepScroll();
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
function acceptGrey(bi: number, si: number): boolean {
  const d = state.draft;
  if (!d || !state.settings.autoDone || drawing()) return false;
  const b = d.ex[bi];
  const x = b && b.sets[si];
  if (!b || !x || x.done || x.warm || x.drop || +(x.r ?? 0) > 0) return false;
  const lr = greyR(b, si);
  if (lr == null || !(lr > 0)) return false;
  act(
    () => {
      x.r = Math.round(lr);
    },
    { inProgress: true }
  );
  lastAuto = { b: blkRef(bi), s: si, t: Date.now() };
  setDone(bi, si, true);
  return true;
}

/* ---------- the screen's actions ---------- */

/** Distance as typed, in the unit shown (miles to someone logging in lb), as kept: km, absent when none (r30). */
export const distIn = (v: string): number | null => {
  const n = numIn(v);
  return n != null && n > 0 ? Math.min(Math.round((U() === 'kg' ? n : n * KM_MI) * 1000) / 1000, 1000) : null;
};
// The block a tap names by its data-b, or null.
const tapBlock = (t: Tap): DraftBlock | null => (state.draft && state.draft.ex[Number(t.dataset.b)]) || null;

/* − Set (r25 guardrail). It takes the last row that holds nothing of the
   lifter's (no tick, no reps, no RIR, and a load that is only the app's
   suggestion), quietly. When every row holds something, it no longer
   removes the last one on a single tap: it asks first, naming the set, and
   Undo still follows; the last row not ticked goes first, a logged set only
   after. Found again when confirmed: a cloud refresh may have replaced the
   session while the question was open. */
function setRemove(t: Tap): void {
  const d = state.draft;
  const bi = Number(t.dataset.b);
  const b = d && d.ex[bi];
  if (!d || !b || !b.sets.length) return;
  let i = -1;
  for (let k = b.sets.length - 1; k >= 0; k--)
    if (rowBlank(b, b.sets[k])) {
      i = k;
      break;
    }
  if (i >= 0) {
    const at = i;
    act(
      () => {
        b.sets.splice(at, 1);
        adjSync(b);
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    return;
  }
  for (let k = b.sets.length - 1; k >= 0; k--)
    if (!b.sets[k].done) {
      i = k;
      break;
    }
  if (i < 0) i = b.sets.length - 1;
  const x = b.sets[i],
    ex = EX(b.exId),
    did = d.id,
    exId = b.exId,
    n = b.sets.slice(0, i + 1).filter(y => !y.warm && !y.drop).length;
  const what = `${x.warm ? 'Warm-up' : x.drop ? 'Drop set' : 'Set ' + n}`;
  const val =
    +(x.r ?? 0) > 0
      ? setShort(ex, x.w == null ? 0 : x.w, x.r)
      : x.w != null
        ? loadLabel(ex, x.w) + (ex.bw ? '' : ' ' + U())
        : '';
  const at = i;
  fx.confirm(
    `Remove ${what.toLowerCase()}?`,
    `${ex.name}${val ? `: ${val}` : ''}, ${x.done ? 'logged' : 'typed, not ticked'}. Undo is offered right after.`,
    'Remove set',
    () => {
      const dd = state.draft;
      const bb = dd && dd.id === did ? dd.ex[bi] : null;
      const xx = bb && bb.exId === exId ? bb.sets[at] : null;
      if (!bb || !xx || xx.done !== x.done || xx.r !== x.r || xx.w !== x.w) {
        fx.toast('That set changed. Nothing was removed.');
        fx.rerenderKeepScroll();
        return;
      }
      act(
        () => {
          bb.sets.splice(at, 1);
          adjSync(bb);
        },
        {
          inProgress: true,
          undo: () => {
            const d3 = state.draft;
            if (!d3 || d3.id !== did || !d3.ex.includes(bb)) return false;
            bb.sets.splice(Math.min(at, bb.sets.length), 0, xx);
            adjSync(bb);
            return true;
          }
        }
      );
      fx.rerenderKeepScroll();
      fx.toast(xx.done ? 'Logged set removed' : 'Set removed', true);
    },
    true
  );
}
/* Removing an exercise (r25 guardrail): one with logged or typed sets asks
   first, naming how many; an untouched one goes with an Undo as before. Back
   after the exercise it followed, which an automatic reorder may have moved
   (r45 review). */
function blockRemove(t: Tap): void {
  const d = state.draft;
  const bi = Number(t.dataset.b);
  const blk = d && d.ex[bi];
  if (!d || !blk) return;
  const did = d.id;
  const go = (): void => {
    const dd = state.draft;
    if (!dd || dd.id !== did || dd.ex[bi] !== blk) {
      if (ui.modal) fx.closeModal();
      fx.toast('That exercise changed. Nothing was removed.');
      fx.rerenderKeepScroll();
      return;
    }
    const prevBlk = bi > 0 ? dd.ex[bi - 1] : null;
    act(() => keepOpen(() => dd.ex.splice(bi, 1)), {
      inProgress: true,
      undo: () => {
        const d3 = state.draft;
        if (!d3 || d3.id !== did) return false;
        const k = prevBlk ? d3.ex.indexOf(prevBlk) : -1;
        d3.ex.splice(prevBlk == null ? 0 : k >= 0 ? k + 1 : Math.min(bi, d3.ex.length), 0, blk);
        fixSupersets(d3.ex.map(x => x.plan));
        return true;
      }
    });
    fx.rerenderKeepScroll();
    fx.toast('Exercise removed', true);
  };
  const logged = blk.sets.filter(x => x.done).length,
    typed = blk.sets.filter(x => !x.done && (+(x.r ?? 0) > 0 || x.rir != null)).length;
  if (logged || typed) {
    if (ui.modal) fx.closeModal();
    fx.confirm(
      `Remove ${EX(blk.exId).name}?`,
      `${logged ? `${logged} logged set${logged === 1 ? '' : 's'}` : ''}${logged && typed ? ' and ' : ''}${typed ? `${typed} typed set${typed === 1 ? '' : 's'}` : ''} go with it. Undo is offered right after.`,
      'Remove exercise',
      go,
      true
    );
    return;
  }
  go();
}
/* A filled cardio entry goes with an Undo, like a set with reps; an empty one goes quietly. */
function cardioRemove(t: Tap): void {
  const d = state.draft;
  const list = d && d.cardio;
  const i = Number(t.dataset.c);
  const c = list && list[i];
  if (!d || !list || !c) return;
  if ((c.min || 0) > 0 || (c.hr || 0) > 0 || (c.note || '').trim()) {
    const did = d.id;
    fx.confirm(
      `Remove ${(CARDIOL[c.kind || ''] || 'entry').toLowerCase()}?`,
      `${c.min ? c.min + ' min' : 'An entry with your notes'}. Undo is offered right after.`,
      'Remove',
      () => {
        const dd = state.draft;
        const l2 = dd && dd.id === did ? dd.cardio : null;
        const j = l2 ? l2.indexOf(c) : -1;
        if (!l2 || j < 0) {
          fx.toast('That entry changed. Nothing was removed.');
          fx.rerenderKeepScroll();
          return;
        }
        act(
          () => {
            l2.splice(j, 1);
          },
          {
            inProgress: true,
            undo: () => {
              const d3 = state.draft;
              if (!d3 || d3.id !== did) return false;
              const l3 = d3.cardio || (d3.cardio = []);
              l3.splice(Math.min(j, l3.length), 0, c);
              return true;
            }
          }
        );
        fx.rerenderKeepScroll();
        fx.toast(`${CARDIOL[c.kind || ''] || 'Entry'} removed`, true);
      },
      true
    );
    return;
  }
  act(
    () => {
      list.splice(i, 1);
    },
    { inProgress: true }
  );
  fx.rerenderKeepScroll();
}

/** The session screen's taps, by data-act: each change to the session in progress through act. */
export const WORKOUT_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  /* With auto-done on, leaving the reps field marks the set done, and on a
     phone that blur happens a moment before the tap on the checkmark lands.
     Without this guard the tap would immediately undo the auto-mark. Since
     r28 (auto-mark on for new installs) the first tap on that set's
     checkmark confirms it for 15 s, until another set is touched: typing
     reps, picking RIR and then tapping the checkmark is the natural order,
     and it used to untick the set. A second tap undoes it. Tapping done on
     an empty reps field logs the grey number in it (see greyR), like the
     paper log you copy from; warm-ups have none, so those still ask; a typed
     0 is a missed set (r55, V), ticked as typed. Unticked (r55, the audit):
     numbers that are what the row shows in grey go back to grey, so a tap by
     mistake leaves nothing typed for Finish to offer to save, and an
     exercise the tick moved up goes back if it has no set left ticked,
     within half a minute. */
  sDone(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const s = draftSet(t);
    const d = state.draft;
    if (!s || !d) return;
    if (lastAuto && (blkIdx(lastAuto.b) !== bi || lastAuto.s !== si)) lastAuto = null;
    if (lastAuto && Date.now() - lastAuto.t < 15000 && s.done) {
      lastAuto = null;
      return;
    }
    if (!s.done && !(+(s.r ?? 0) > 0) && !isMissed(s)) {
      const b = d.ex[bi];
      const lr = b ? greyR(b, si) : null;
      if (lr == null || !(lr > 0)) {
        fx.toast('Enter reps first');
        return;
      }
      act(
        () => {
          s.r = Math.round(lr);
        },
        { inProgress: true }
      );
    }
    const was = !!s.done;
    setDone(bi, si, !was);
    if (!was) return;
    const b = d.ex[bi];
    const o = ordBack.get(b);
    act(
      () => {
        if (s.r != null && +s.r === greyR(b, si)) s.r = null;
        const gw = greyW(b, si);
        if (!fillLoads() && s.w != null && gw != null && Math.abs(s.w - gw) < 1e-9) s.w = null;
      },
      { inProgress: true }
    );
    if (o && !b.sets.some(x => x.done) && Date.now() - o.t < 30000) {
      ordBack.delete(b);
      moveBlock(bi, Math.min(o.i, d.ex.length - 1));
    }
    fx.rerenderKeepScroll();
  },
  // Numbers, placeholders and the progress bar all depend on which rows are working sets, so the block is drawn again.
  sWarm(t) {
    const s = draftSet(t);
    const b = tapBlock(t);
    if (!s || !b) return;
    act(
      () => {
        if (!s.warm && !s.drop) s.warm = true;
        else if (s.warm) {
          s.warm = false;
          s.drop = true;
        } else s.drop = false;
        adjSync(b);
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
  },
  fillLast(t) {
    const b = tapBlock(t);
    if (!b) return;
    const todo = b.sets
      .map((s, i) => [s, lastRFor(b, i)] as const)
      .filter(([s, lr]) => !s.done && !s.warm && !s.drop && s.r == null && lr != null);
    if (!todo.length) {
      fx.toast('Nothing to fill');
      return;
    }
    act(
      () => {
        for (const [s, lr] of todo) s.r = lr;
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    fx.toast(`${todo.length} set${todo.length === 1 ? '' : 's'} filled with last time's reps`);
  },
  /* The new working set copies the last working set's load, not a drop set's
     (75%) or a warm-up's. Grey by default: the new row shows the load above
     it, or what the last set ticked asks for, as a planned row under it would
     have (r55, V: after 300 x 1, + Set copied 300). Filled in, it takes that load. */
  sAdd(t) {
    const bi = Number(t.dataset.b);
    const b = tapBlock(t);
    if (!b) return;
    act(
      () => {
        const ld = b.sets.reduce((k, x, i) => (x.done && isWork(x) && !x.drop ? i : k), -1);
        const row = newRow();
        b.sets.push(row);
        if (ld >= 0) assessSet(bi, ld);
        if (fillLoads()) row.w = effW(b, b.sets.length - 1);
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
  },
  sDel: setRemove,
  /* Warm-ups go in at the top, already flagged, so they stay out of every
     analytic, and are seeded from the working load; each new one goes after
     the ones already there, so they climb to the working load (r27). */
  wAdd(t) {
    const b = tapBlock(t);
    if (!b) return;
    let base = 0;
    for (let i = 0; i < b.sets.length; i++) {
      const s = b.sets[i];
      if (s.warm || s.drop) continue;
      const w = +(effW(b, i) ?? 0) || 0;
      if (w > 0) {
        base = w;
        break;
      }
    }
    if (!base) base = Math.max(0, ...b.sets.map((_, i) => +(effW(b, i) ?? 0) || 0));
    const n = b.sets.filter(s => s.warm).length;
    const frac = [0.4, 0.6, 0.75, 0.85][Math.min(n, 3)];
    let at = 0;
    while (at < b.sets.length && b.sets[at].warm) at++;
    const w = base > 0 ? lighterLoad(EX(b.exId), b.plan, base, base * frac) : null;
    act(
      () => {
        b.sets.splice(at, 0, newRow({ w, warm: true }));
        adjSync(b);
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    fx.toast('Warm-up set added');
  },
  // The load the last working set was, or will be (a grey load counts); a missed set's is passed over (r55).
  dropAdd(t) {
    const b = tapBlock(t);
    if (!b) return;
    let base = 0;
    for (let i = b.sets.length - 1; i >= 0; i--) {
      const s = b.sets[i];
      if (s.warm || s.drop || isMissed(s)) continue;
      const w = +(effW(b, i) ?? 0) || 0;
      if (w > 0) {
        base = w;
        break;
      }
    }
    const w = base > 0 ? lighterLoad(EX(b.exId), b.plan, base, base * 0.75) : null;
    act(
      () => {
        b.sets.push(newRow({ w, drop: true }));
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    fx.toast('Drop set added');
  },
  // Keep: no adjustment for this exercise for the rest of the session.
  adjKeep(t) {
    const b = tapBlock(t);
    if (!b || !b.adj) return;
    const prev = b.adj;
    act(
      () => {
        delete b.adj;
        b.adjOff = true;
        adjRows(b, prev, null);
      },
      { inProgress: true }
    );
    redraw();
  },
  rirOpen(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    if (stripIs(bi, si)) {
      rirClose();
      return;
    }
    rirShowStrip(bi, si);
    const f =
      document.querySelector<HTMLElement>('.rirstrip button.on') ||
      document.querySelector<HTMLElement>('.rirstrip button');
    if (f && !coarse())
      try {
        f.focus({ preventScroll: true });
      } catch (e) {
        // Focus is best effort; the strip is open either way.
      }
  },
  // The fold waits for the effort of the last set, then goes.
  rirPick(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const d = state.draft;
    const b = d && d.ex[bi];
    const s = b && b.sets[si];
    if (!d || !b || !s) return;
    const n = numIn(t.dataset.v || '');
    act(
      () => {
        s.rir = n == null ? null : Math.min(Math.max(n, 0), 10);
        if (s.done) assessSet(bi, si);
      },
      { inProgress: true, soon: true }
    );
    rirClose();
    redraw();
    const btn = document.querySelector<HTMLElement>(`.rirb[data-b="${bi}"][data-s="${si}"]`);
    if (btn)
      try {
        btn.focus({ preventScroll: true });
      } catch (e) {
        // Focus is best effort; the effort is saved either way.
      }
    if (!d.editingId && blockDone(b)) {
      if (foldT) clearTimeout(foldT);
      const rf = blkRef(bi);
      foldT = setTimeout(() => autoFold(rf), 900);
    }
  },
  bOpen(t) {
    const bi = Number(t.dataset.b);
    const b = tapBlock(t);
    if (!b) return;
    blkOpen(bi, b);
    fx.rerenderKeepScroll();
    const el = document.getElementById('blk-' + bi);
    if (el)
      try {
        el.scrollIntoView({ block: 'nearest' });
      } catch (e) {
        // Scrolling is best effort; the exercise is open either way.
      }
  },
  // Every place this exercise was opened at, so a move and a fold leave nothing behind.
  bFold(t) {
    const b = tapBlock(t);
    if (!b) return;
    const pre = ((state.draft && state.draft.id) || '') + ':';
    for (const k of [...ui.blkOpen])
      if (typeof k === 'string' && k.startsWith(pre) && k.endsWith(':' + b.exId)) ui.blkOpen.delete(k);
    blkOpenObj.delete(b);
    fx.rerenderKeepScroll();
  },
  bUp(t) {
    if (moveBlock(Number(t.dataset.b), Number(t.dataset.b) - 1)) fx.rerenderKeepScroll();
  },
  bDown(t) {
    if (moveBlock(Number(t.dataset.b), Number(t.dataset.b) + 1)) fx.rerenderKeepScroll();
  },
  bDel: blockRemove,
  // A superset made here is this session's; Finish offers to keep it in the plan (r34.2, from the review: it was gone next time without a word).
  bSs(t) {
    const d = state.draft;
    const bi = Number(t.dataset.b);
    if (!d || !d.ex[bi]) return;
    // linkToggle changes nothing when there is no exercise after this one to pair with.
    if (
      !act(
        () => {
          linkToggle(d.ex, bi, x => x.plan);
        },
        { inProgress: true, check: () => !!d.ex[bi] && !!d.ex[bi + 1] }
      )
    )
      return;
    fx.rerenderKeepScroll();
    const b = d.ex[bi];
    if (b && b.plan.ss)
      fx.toast(d.dayId ? 'Superset. Finish offers to keep it in your plan.' : 'Superset for this session.');
  },
  noteReuse(t) {
    const b = tapBlock(t);
    const ln = b && b.lastNote;
    if (!b || !ln) return;
    act(
      () => {
        b.note = ln.text;
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    fx.toast('Note carried into this session');
  },
  cDraftAdd(t) {
    const d = state.draft;
    if (!d) return;
    act(
      () => {
        // cast: cleanCardio builds the row field by field (its kind and time checked, its minutes left blank in a session), the shape of a session's cardio row.
        (d.cardio || (d.cardio = [])).push(
          cleanCardio({ id: uid(), kind: 'walk', when: t.dataset.when }, true) as DraftCardio
        );
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
  },
  cDraftDel: cardioRemove,
  /* The check-in: answering the last of the three folds it away. */
  chk(t) {
    const d = state.draft;
    if (!d) return;
    const k = t.dataset.k || '',
      v = Number(t.dataset.v);
    const c: Record<string, number> = Object.assign({}, d.chk || {});
    const was = CHK_Q.every(([q]) => c[q]);
    if (c[k] === v) delete c[k];
    else c[k] = v;
    act(
      () => {
        d.chk = Object.keys(c).length ? c : undefined;
      },
      { inProgress: true }
    );
    if (!was && CHK_Q.every(([q]) => c[q])) ui.folds['logger:checkin'] = false;
    fx.rerenderKeepScroll();
  },
  /* The check-in's lighter session (r30, r31): only the exercises not
     started become lighter (b.light: half their sets, about 90% loads, 3+
     RIR, no target); the session itself is not marked, so work already done
     at full effort still sets next time's target and counts in trends.
     Anything already logged or typed stays exactly as it is. Undo puts it back. */
  makeLight() {
    const d = state.draft;
    if (!d || d.light || d.deload) return;
    const todo = d.ex.filter(b => !b.light && !b.sets.some(x => !x.warm && !rowBlank(b, x)));
    if (!todo.length) {
      fx.toast('Every exercise is started, so nothing changed');
      return;
    }
    act(
      () => {
        if ((d.notes || '') === (d.note0 || ''))
          d.notes = d.note0 = 'Made lighter after the check-in: exercises not started, half sets at about 90% loads.';
        for (const b of todo) {
          b.light = true;
          const work = b.sets.filter(x => !x.warm);
          const keep = Math.max(1, Math.ceil(work.length / 2));
          let cut = work.length - keep;
          for (let i = b.sets.length - 1; i >= 0 && cut > 0; i--)
            if (!b.sets[i].warm) {
              b.sets.splice(i, 1);
              cut--;
            }
          refreshBlock(b);
        }
      },
      { inProgress: true, undo: true }
    );
    fx.rerenderKeepScroll();
    fx.toast(
      `Lighter: ${todo.length} exercise${todo.length === 1 ? '' : 's'} not started now half the sets at about 90% loads`,
      true
    );
  },
  calSnooze() {
    act(() => {
      state.settings.calSnooze = today();
    });
    fx.rerenderKeepScroll();
    fx.toast('The RIR check will come back in 3 weeks');
  },
  bwAskNo() {
    prefSet(BWASK_KEY, '1');
    fx.rerenderKeepScroll();
  },
  tStart(t) {
    const b = tapBlock(t);
    if (b && +b.plan.rest > 0) fx.startTimer(+b.plan.rest);
  },
  /* A session with nothing in it goes at once; one with anything entered
     (sets, reps, cardio, a note) asks first. An edit always asks, since the
     saved sets are already in it. */
  discard() {
    const d = state.draft;
    if (!d) return;
    const out = (): void => {
      act(
        () => {
          state.draft = null;
        },
        { inProgress: true }
      );
      fx.stopTimer();
      fx.wakeOff();
      window.scrollTo(0, 0);
      fx.render();
    };
    if (!d.editingId && !draftEntered(d)) {
      out();
      fx.toast('Session discarded');
      return;
    }
    if (d.editingId && editFp0.get(d.id) === editFp(d)) {
      out();
      fx.toast('No changes made');
      return;
    }
    fx.confirm(
      'Discard this session?',
      d.editingId
        ? 'Your edits will be lost. The saved session stays as it was.'
        : 'Sets and cardio logged in this session will not be saved.',
      'Discard',
      out,
      true
    );
  },
  finish: () => finish(),
  finishNow: () => finishNow()
};

/* ---------- Finish ---------- */

/* Sets left (r30): finishing with half the planned sets untouched used to
   save without a word. Asked once, only when something was done, and not for
   an edit or a past workout typed in afterwards. Ramp-up sets logged as work
   count as hard sets and inflate weekly volume: a done working set before
   the first set at the exercise's top load is a likely warm-up when it was
   easy (logged at 5+ RIR, or with no RIR 5+ reps short of what the best
   estimate says that load allows; with neither, under 75% of the top load on
   a compound lift or 80% on isolation work), never one logged at 4 RIR or
   less (hard pyramid sets stay working sets), never a weighted set with no
   load (asked about below as a missing load, r31), and never a set at the
   load the app suggested or one the app itself raised the load after
   (r34.2). Asked once per session; either answer moves on. Only sets marked
   done are saved, but sets with reps and no tick are counted first and the
   lifter may keep them, a typed 0 (a missed set, r55) among them, warm-ups
   too (r55, the audit); reps or a load far off ask first, as when ticked
   (r55, the audit: 110 reps put off once was saved here). */
function finish(): void {
  const d = state.draft;
  if (!d) return;
  if (!d._leftAsked && !d.editingId && !d.past) {
    let n = 0,
      left = 0;
    for (const b of d.ex)
      for (const x of b.sets) {
        if (x.warm) continue;
        n++;
        if (!x.done && rowBlank(b, x)) left++;
      }
    const any = d.ex.some(b => b.sets.some(x => x.done && !x.warm));
    if (any && left > 0) {
      fx.confirm(
        `${left} of ${n} sets not done`,
        `Finish now and they are left out. An exercise with fewer sets than usual does not set your next target, and still counts toward its trend.`,
        'Finish now',
        () => {
          const dd = state.draft;
          if (!dd) return;
          dd._leftAsked = true;
          finish();
        },
        false,
        { label: 'Keep going', fn: () => {} }
      );
      return;
    }
  }
  if (!d._rampAsked) {
    const ramps: { bi: number; si: number; name: string; txt: string }[] = [];
    for (const b of d.ex) {
      const e = EX(b.exId);
      const wk = b.sets.filter(x => x.done && !x.warm && !x.drop && +(x.r ?? 0) > 0);
      if (wk.length < 2) continue;
      const L = (x: DraftSet): number => bwLoad(e, d.date) + (+(x.w ?? 0) || 0);
      const top = Math.max(...wk.map(L));
      if (!(top > 0)) continue;
      const firstTop = b.sets.findIndex(
        x => x.done && !x.warm && !x.drop && +(x.r ?? 0) > 0 && Math.abs(L(x) - top) < 1e-6
      );
      const bi = d.ex.indexOf(b);
      const st = IDX().exStats[b.exId];
      const est = st ? st.bestAll : undefined;
      const thr = isCompound(e) ? 0.75 : 0.8;
      const easy = (x: DraftSet): boolean => {
        if (!(L(x) < top - 1e-6)) return false;
        const q = rirEff(x, e);
        if (q != null) return q >= 5;
        if (est && !noE1(e)) {
          const rtf = rtfAt(est, L(x));
          if (rtf != null) return rtf - +(x.r ?? 0) >= 5;
        }
        return L(x) < top * thr;
      };
      const appSet = (x: DraftSet, si: number): boolean =>
        (b.sw != null && Math.abs((+(x.w ?? 0) || 0) - b.sw) < 1e-6) || (!!b.adj && b.adj.up && si <= b.adj.at);
      b.sets.forEach((x, si) => {
        if (
          si < firstTop &&
          x.done &&
          !x.warm &&
          !x.drop &&
          +(x.r ?? 0) > 0 &&
          (e.bw || +(x.w ?? 0) > 0) &&
          !appSet(x, si) &&
          easy(x)
        )
          ramps.push({ bi, si, name: e.name, txt: `${loadLabel(e, +(x.w ?? 0) || 0)}×${x.r}` });
      });
    }
    if (ramps.length) {
      const done = (): void => {
        const dd = state.draft;
        if (!dd) return;
        act(
          () => {
            dd._rampAsked = true;
          },
          { inProgress: true }
        );
        finish();
      };
      fx.confirm(
        'These look like ramp-up sets',
        `${[...new Set(ramps.map(r => r.bi))]
          .map(bi => {
            const rs = ramps.filter(r => r.bi === bi);
            return `${rs[0].name}: ${rs.map(r => r.txt).join(', ')}`;
          })
          .join(
            '; '
          )}. Lighter and easy, before your top set. Mark ${ramps.length > 1 ? 'them' : 'it'} as warm-up${ramps.length > 1 ? 's' : ''}?`,
        `Mark as warm-up${ramps.length > 1 ? 's' : ''}`,
        () => {
          const dd = state.draft;
          if (!dd) return;
          act(
            () => {
              for (const r of ramps) {
                const x = dd.ex[r.bi] && dd.ex[r.bi].sets[r.si];
                if (x) {
                  x.warm = true;
                  x.drop = false;
                }
              }
            },
            { inProgress: true }
          );
          done();
        },
        false,
        { label: 'Keep as working sets', fn: done }
      );
      return;
    }
  }
  const unchecked: { n: number; name: string }[] = [];
  for (const b of d.ex) {
    const n = b.sets.filter(s => !s.done && (+(s.r ?? 0) > 0 || isMissed(s))).length;
    if (n) unchecked.push({ n, name: EX(b.exId).name });
  }
  if (unchecked.length) {
    const list = unchecked.map(u => `${u.name} (${u.n} set${u.n > 1 ? 's' : ''})`).join(', ');
    const total = unchecked.reduce((a, u) => a + u.n, 0);
    fx.confirm(
      'Some sets are not marked done',
      `${total} set${total > 1 ? 's have' : ' has'} reps entered but no checkmark, so ${total > 1 ? 'they' : 'it'} will not be saved: ${list}.`,
      `Mark ${total > 1 ? 'them' : 'it'} done and save`,
      () => {
        const dd = state.draft;
        if (!dd) return;
        for (const [bi, b] of dd.ex.entries())
          for (const [si, s] of b.sets.entries())
            if (!s.done && (+(s.r ?? 0) > 0 || isMissed(s))) {
              if (oddReps(b, s) || oddLoad(b, si, dd.date) || lightZero(b, si, dd.date)) {
                setDone(bi, si, true);
                if (!s.done) return;
              } else
                act(
                  () => {
                    settleLoad(b, si);
                    s.done = true;
                  },
                  { inProgress: true }
                );
            }
        finishNow();
      },
      false,
      { label: 'Save without them', fn: () => finishNow() }
    );
    return;
  }
  finishNow();
}
/* Nothing is marked trimmed since r54 (V's one rule, PENDING 312 E): an
   exercise with fewer sets than usual, stopped early, Short on time, typed
   in afterwards or edited, is read so from the log (analytics.ts, idxShort),
   so it sets no target and still counts toward its trend. savedEx
   (session.ts) is one source with a first link keeping another device's
   workout (r55); side by side, the same lift is saved as one exercise
   (r34.2, V), apart each stays where it was done; on a day of a routine each
   lift keeps the sets its plan gave it (withPlanSets, r58). A blank load on
   a weighted lift used to save silently as a real 0 set, which drags down
   volume load and still counts toward your weekly sets: asked as "add them"
   first (r29, item 116), Add loads going back to the first one, opened, its
   load field focused. */
function finishNow(): void {
  const d = state.draft;
  if (!d) return;
  const ex = withPlanSets(joinAdjacent(d.ex.map(savedEx).filter(b => b.sets.length)), d, state.routines);
  // cast: cleanCardio builds each entry field by field (its kind and time checked, its minutes over 0 by draftCardio), a saved cardio entry.
  const cardio = draftCardio(d).map(c => cleanCardio(c)) as unknown as CardioEntry[];
  if (!ex.length) {
    if (cardio.length && !d.editingId) {
      act(() => {
        putById(state.cardio, cardio);
        state.draft = null;
      });
      fx.stopTimer();
      fx.wakeOff();
      ui.todayDay = null;
      window.scrollTo(0, 0);
      fx.render();
      fx.toast('Cardio saved. No lifting session was recorded.');
      return;
    }
    fx.toast('Mark at least one set done');
    return;
  }
  const blanks: string[] = [];
  for (const b of ex) {
    const e = EX(b.exId);
    if (e.bw) continue;
    const n = b.sets.filter(s => !(+s.w > 0) && isWork(s)).length;
    if (n) blanks.push(`${e.name} (${n} set${n > 1 ? 's' : ''})`);
  }
  const help: string[] = [];
  for (const b of d.ex) {
    const e = EX(b.exId);
    if (!e.assist) continue;
    const n = b.sets.filter(s => s.done && !s.warm && s.w == null).length;
    if (n) help.push(`${e.name} (${n} set${n > 1 ? 's' : ''})`);
  }
  const save = (): void => saveSession(d, ex, cardio);
  if (blanks.length || help.length)
    fx.confirm(
      blanks.length ? 'Add the missing loads?' : 'Add the help you used?',
      [
        blanks.length
          ? `${andList(blanks)} ${blanks.length > 1 ? 'have' : 'has'} reps but no weight. Saved like this, they count as hard sets but give no estimate, PR, or weight lifted.`
          : '',
        help.length
          ? `${andList(help)} ${help.length > 1 ? 'have' : 'has'} no help typed, so saved like this ${help.length > 1 ? 'they read' : 'it reads'} as no help, your full bodyweight.`
          : ''
      ]
        .filter(Boolean)
        .join(' '),
      blanks.length ? 'Add loads' : 'Add the help',
      () => {
        const dr = state.draft;
        if (!dr) return;
        for (let bi = 0; bi < dr.ex.length; bi++) {
          const b = dr.ex[bi];
          const e = EX(b.exId);
          if (e.bw && !e.assist) continue;
          const si = b.sets.findIndex(x => x.done && (e.assist ? x.w == null : !(+(x.w ?? 0) > 0)));
          if (si < 0) continue;
          blkOpen(bi, b);
          fx.render();
          needAt = { b: blkRef(bi), s: si };
          redraw();
          const f = document.querySelector<HTMLElement>(`[data-f="w"][data-b="${bi}"][data-s="${si}"]`);
          if (f) {
            f.scrollIntoView({ block: 'center' });
            f.focus();
          }
          return;
        }
      },
      false,
      { label: 'Save anyway', fn: save }
    );
  else save();
}
/* The session saved, then the recap. Timed only when started and finished
   today in this app; an edit keeps whatever the original session measured.
   When it started: kept on an edit, else the start (or now, for a past
   workout entered later); and, new, what its routine planned a week (r55).
   An RIR check offered and passed over waits 3 weeks, as Not now does (r32),
   read before the session is saved, since the check counts sessions. An
   edit rebuilds the session from the screen, so fields a newer build stored
   on it, or on an exercise still in its place, are carried over (r43, as
   normalize keeps them), each exercise matched by its lift in order. A new
   session goes in by id: the other phone's copy of this workout, kept at its
   first link, is replaced, never held twice (r55). A real session saved
   while demo data is loaded (r30) takes the demo away, so stats never mix
   generated sessions with yours. Saving an edit of a session deleted while
   the edit was open brings it back: the save is the newer action. The recap
   is worked out before the session in progress is cleared, while its ticks
   exist: only exercises with a set done count toward targets (r30), not one
   with fewer sets than its target's (r55); heavier than ever without a new
   best estimate is said once, quietly, not counted as a PR (r32); the PR
   moment (item 28) is its own gold block, each with what it beat. */
function saveSession(d: Draft, ex: ReturnType<typeof savedEx>[], cardio: CardioEntry[]): void {
  const durMin = d.editingId
    ? d.durMin || null
    : d.startedAt && d.date === today()
      ? ((): number | null => {
          const m = Math.round((Date.now() - (d.startedAt || 0)) / 60000);
          return m >= 1 && m <= 360 ? m : null;
        })()
      : null;
  // Records carrying fields a newer build stored (keepExtra) are plain objects of their fields, as normalize builds them.
  const exR: (SessionEx & Rec)[] = ex.map(b => ({ ...b }));
  const sess: Session & Rec = {
    id: d.editingId || d.id,
    date: d.date,
    dayIdx: d.dayIdx,
    dayId: d.dayId || null,
    dayName: (d.dayName || '').trim() || 'Session',
    routineId: d.routineId,
    ex: exR,
    notes: d.notes || '',
    durMin,
    deload: !!d.deload,
    light: !!d.light,
    free: d.free ? true : undefined,
    chk: cleanChk(d.chk) || undefined
  };
  let upd: unknown = null,
    demoGone = false,
    targets = 0,
    beaten = 0,
    pmDraft = 0;
  const editing = !!d.editingId;
  act(() => {
    const was = d.editingId ? state.sessions.find(x => x.id === d.editingId) : null;
    const t0 = was ? was.t : d.startedAt || Date.now();
    if (t0) sess.t = t0;
    const pw = d.editingId || d.free ? undefined : pwOf(state.routines, d.routineId);
    if (pw) sess.pw = pw;
    if (!d.editingId) putById(state.cardio, cardio);
    if (!d.editingId && calDueIdx(d) >= 0 && !d.ex.some(b => b.sets.some(x => x.cal && x.done)))
      state.settings.calSnooze = today();
    upd = d.editingId ? null : routineUpdates(d);
    if (d.editingId) {
      const i = state.sessions.findIndex(s => s.id === d.editingId);
      if (i >= 0) {
        const o = state.sessions[i];
        // demo is written by an edit from the session it replaces, and absent on a new one, as Finish always wrote it.
        if (o.demo !== undefined) sess.demo = o.demo;
        keepExtra(o, sess);
        const used = new Set<object>();
        exR.forEach(b => {
          const ob = o.ex.find(x => x.exId === b.exId && !used.has(x));
          if (ob) {
            used.add(ob);
            keepExtra(ob, b);
          }
        });
        state.sessions[i] = sess;
      } else state.sessions.push(sess);
    } else putById(state.sessions, [sess]);
    demoGone =
      !d.editingId &&
      (state.sessions.some(x => x.demo) || state.bodyweights.some(x => x.demo) || state.measurements.some(x => x.demo));
    if (demoGone) {
      stripDemo(state);
      demoRestore();
      invalidate();
    }
    state.trash = state.trash.filter(t => !(t.kind === 'session' && t.id === sess.id));
    const tried = d.ex.filter(b => b.tgt && b.sets.some(x => x.done && !x.warm) && effTarget(b) === b.tgt);
    targets = tried.length;
    beaten = tried.filter(b => {
      const pr = blockProgress(b);
      return pr && pr.beat;
    }).length;
    pmDraft = draftPlanMin(d);
    state.draft = null;
  });
  fx.stopTimer();
  fx.wakeOff();
  // An Undo offered during the session (a trim, a removed set) has nothing left to undo once it is saved.
  fx.undoToastHide();
  const prAll = IDX().prs.filter(
    p => (p.sid ? p.sid === sess.id : p.date === sess.date) && ex.some(b => b.exId === p.exId)
  );
  const prs = prAll.filter(p => p.big);
  const heavier = prAll.flatMap(p => {
    if (p.big || p.type !== 'Weight PR') return [];
    const e = EX(p.exId);
    return [`${e.name} ${setShort(e, p.w, p.r)}`];
  });
  const work = ex.reduce((a, b) => a + b.sets.filter(isWork).length, 0),
    miss = ex.reduce((a, b) => a + b.sets.filter(q => !q.warm && !q.drop && isMissed(q)).length, 0),
    hard = r1(
      ex.reduce((a, b) => {
        const e = EX(b.exId);
        return a + b.sets.reduce((c, q) => c + hardCredit(q, e), 0);
      }, 0)
    );
  ui.todayDay = null;
  window.scrollTo(0, 0);
  fx.render();
  if (editing) {
    fx.toast('Session updated');
    return;
  }
  const lines = [
    `${work} working set${work === 1 ? '' : 's'}, ${hard} ${rirHalfOn() ? 'counted toward the week' : 'counted as hard'}${miss ? `, and ${miss} missed` : ''}`
  ];
  // A session dated in the past says where it went, since it is not at the top of History.
  if (sess.date !== today()) lines.unshift(`Saved under ${fmtDateLong(sess.date)}`);
  if (durMin) lines.push(`${durMin} minutes${pmDraft && !sess.free ? `, planned ${estMin(pmDraft)}` : ''}`);
  if (targets) lines.push(`${beaten} of ${targets} exercise target${targets === 1 ? '' : 's'} beaten`);
  if (heavier.length) lines.push(`Heaviest yet: ${andList(heavier, 4)}`);
  const prList = prs.map(pr => {
    const e = EX(pr.exId);
    if (pr.type === 'Weight PR')
      return {
        name: e.name,
        what: `Weight PR, ${setShort(e, pr.w, pr.r)}${pr.value != null && isCompound(e) ? `, best estimate ${fmtE(pr.value)} ${U()}${loadNote(e)}` : ''}`,
        was: e.assist
          ? 'less help than ever'
          : isFinite(pr.prevW ?? NaN)
            ? `heaviest before ${e.bw ? loadLabel(e, pr.prevW ?? 0) : fmtW(pr.prevW) + ' ' + U()}`
            : ''
      };
    const ps = pr.type === 'e1RM' && !isCompound(e) ? prSet(pr.exId, pr.date) : null;
    if (ps) return { name: e.name, what: `PR, ${setShort(e, ps.w, ps.r)}`, was: 'your best for that number of reps' };
    return pr.type === 'e1RM'
      ? {
          name: e.name,
          what: `${prName(pr)} ${fmtE(pr.value)} ${U()}${loadNote(e)}`,
          was: prOverall(pr)
            ? pr.prevAll != null
              ? `was ${fmtE(pr.prevAll)}`
              : ''
            : pr.prev != null
              ? `was ${fmtE(pr.prev)} at those reps`
              : ''
        }
      : {
          name: e.name,
          what: `${e.timed ? 'Time' : 'Rep'} PR, ${setShort(e, pr.w, pr.r)}`,
          was: pr.prevR ? `was ${pr.prevR} ${e.timed ? 's' : 'reps'} at this load or heavier` : 'heaviest yet'
        };
  });
  if (cardio.length) lines.push(`Cardio and mobility: ${cardio.reduce((a, c) => a + c.min, 0)} min`);
  if (demoGone) lines.push('Demo data removed, so your stats show only your own sessions');
  fx.recap({
    title: 'Session saved',
    lines,
    prs: prList,
    note: prs.length
      ? ''
      : state.sessions.filter(x => !x.demo).length <= 1
        ? 'Your first session: these are your starting numbers.'
        : 'No PRs this time.',
    upd,
    sid: sess.id
  });
}

/* ---------- the screen's fields ---------- */

// Where the last touch landed, for the routes auto-mark reads (the page's pointerdown, capture phase).
function noteDown(e: Event): void {
  lastDown = { el: e.target instanceof Element ? e.target : null, t: Date.now() };
}
/* What a field of the session screen typed changes, on every keystroke:
   clamped as stored (the field keeps what was typed so the lifter is not
   fought mid-keystroke, but history can never take a negative load or an
   impossible rep count), saved once the typing pauses. Whole reps: 8.5 is 8,
   a partial rep not a rep (r55). On an assisted lift the number is the help.
   A load typed is the lifter's, no longer carried. The grey numbers, the
   progress line and the plates follow at once, as the legacy patches had
   them; a name or notes are drawn at the next draw, as before. */
/** A keystroke in one of the session screen's fields; whether it was one. */
export function workoutInput(t: HTMLInputElement): boolean {
  const d = state.draft;
  if (!d) return false;
  if (t.dataset.cf && d.cardio) {
    const c = d.cardio[Number(t.dataset.c)];
    if (!c) return true;
    const k = t.dataset.cf;
    act(
      () => {
        if (k === 'min') {
          const n = numIn(t.value);
          c.min = n == null || n <= 0 ? null : Math.min(Math.round(n), 600);
        } else if (k === 'hr') {
          const n = numIn(t.value);
          c.hr = n != null && n >= 30 && n <= 230 ? Math.round(n) : null;
        } else if (k === 'dist') {
          const v = distIn(t.value);
          if (v == null) delete c.dist;
          else c.dist = v;
        } else if (k === 'kind' && CARDIOL[t.value]) c.kind = t.value;
        else if (k === 'when' && CWHENL[t.value]) c.when = t.value;
      },
      { inProgress: true, soon: true }
    );
    return true;
  }
  if (t.dataset.f === 'w' || t.dataset.f === 'r') {
    const s = draftSet(t);
    if (!s) return true;
    greyTyped(t);
    if (selAgain === t) selAgain = null;
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const n = numIn(t.value);
    act(
      () => {
        if (t.dataset.f === 'w') {
          const bx = d.ex[bi];
          const as = !!bx && !!EX(bx.exId).assist;
          // fromD of a number is a number (null only for no number), so 0 never stands in.
          s.w =
            n == null
              ? null
              : as
                ? -(fromD(Math.min(Math.abs(n), 660)) ?? 0)
                : (fromD(Math.min(Math.max(n, 0), 20000)) ?? 0);
          if (s.w === 0) s.w = 0;
          carried.delete(s);
        } else s.r = n == null ? null : Math.min(Math.max(Math.floor(n + 1e-9), 0), 1000);
      },
      { inProgress: true, soon: true }
    );
    if (t.dataset.f === 'w') platesAt = { b: blkRef(bi), s: si };
    redraw();
    return true;
  }
  const b = t.dataset.bind;
  if (b === 'draftNotes') {
    act(
      () => {
        d.notes = t.value;
      },
      { inProgress: true, soon: true }
    );
    return true;
  }
  if (b === 'draftName') {
    act(
      () => {
        d.dayName = t.value.trim() ? t.value.slice(0, 40) : 'Freestyle';
      },
      { inProgress: true, soon: true }
    );
    return true;
  }
  return false;
}
/* A field of the session screen left with a new value. Reps: the field shows
   the reps stored (r55); a done set whose reps were cleared is undone, once
   the new rows are in place (a field taken away mid-draw fires its change as
   if left); one typed as 0 is a missed set, ticked as typed (r55, V), and a
   ticked set changed to 0 asks, as a tick does, when its load is light
   (r55.1, the spec review); cleared, it is marked, so leaving the field does
   not tick it again at the grey reps (r55, the audit). Heading for this
   row's load: ticked when the load is left, so the load is never written
   into the field being typed in (r55, the audit: 105 typed there became
   101050); heading for this row's RIR box: ticked when its strip closes (or
   after 2 s if it never opened), by identity, so a later tick cannot run this
   one (r45). A load: a ticked set's load changed to one far off asks too,
   unticked until answered; Log it, or the load fixed after Fix it, ticks it
   again, its rest not started over (r55; the second review). The date: last
   time and the targets are read as of the session's date, so a new date
   reads them again; typed and ticked sets are left alone. */
/** A change in one of the session screen's fields; whether it was one. */
export function workoutChange(t: HTMLInputElement): boolean {
  const d = state.draft;
  if (!d) return false;
  if (t.dataset.cf && d.cardio) {
    const c = d.cardio[Number(t.dataset.c)];
    if (c) {
      const k = t.dataset.cf;
      act(
        () => {
          if (k === 'kind' && CARDIOL[t.value]) c.kind = t.value;
          else if (k === 'when' && CWHENL[t.value]) c.when = t.value;
        },
        { inProgress: true }
      );
    }
    return true;
  }
  if (t.dataset.f === 'r') {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const s = draftSet(t);
    if (!s) return true;
    if (drawing()) {
      if (s.done && s.r == null)
        queueMicrotask(() => {
          const b2 = state.draft && state.draft.ex[bi];
          const s2 = b2 && b2.sets[si];
          if (s2 && s2.done && s2.r == null) setDone(bi, si, false);
        });
      return true;
    }
    const near = (sel: string): boolean =>
      !d.past && !!lastDown.el && Date.now() - lastDown.t < 700 && !!lastDown.el.closest(sel);
    if (s.done && s.r == null) {
      setDone(bi, si, false);
      t.dataset.cleared = '1';
    } else if ((state.settings.autoDone || d.past) && !s.done && (+(s.r ?? 0) > 0 || isMissed(s))) {
      const toRir = near(`.rirb[data-b="${bi}"][data-s="${si}"]`);
      const toW = !toRir && near(`.sg input[data-f="w"][data-b="${bi}"][data-s="${si}"]`);
      if (toW) pendAuto = { b: blkRef(bi), s: si };
      else if (toRir) {
        const p = { b: blkRef(bi), s: si };
        pendAuto = p;
        setTimeout(() => {
          if (pendAuto === p && !document.querySelector('.rirstrip')) autoPending();
        }, 2000);
      } else {
        lastAuto = { b: blkRef(bi), s: si, t: Date.now() };
        setDone(bi, si, true);
      }
    } else if (s.done && isMissed(s)) {
      setDone(bi, si, false);
      setDone(bi, si, true, true);
    } else if (s.done) {
      act(() => assessSet(bi, si), { inProgress: true });
    }
    redraw();
    return true;
  }
  if (t.dataset.f === 'w') {
    const s = draftSet(t);
    if (!s) return true;
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const refix = ui.refix;
    const rf = !!refix && refix.s === si && blkIdx(refix.b) === bi;
    if (rf) ui.refix = null;
    // A tick that waited for its weight (344) is made once one is typed; the checkmark tapped next keeps it, as after auto-mark.
    const need = needHere(bi, si) && s.w != null;
    if (need) needAt = null;
    if (s.done && oddLoad(d.ex[bi], si, d.date)) {
      setDone(bi, si, false);
      setDone(bi, si, true, true);
      return true;
    }
    if (rf && !s.done) setDone(bi, si, true, true);
    else if (need && !s.done) {
      lastAuto = { b: blkRef(bi), s: si, t: Date.now() };
      setDone(bi, si, true);
    } else if (s.done) act(() => assessSet(bi, si), { inProgress: true });
    mixCheck(bi, si);
    if (fillLoads()) act(() => carryLoad(d.ex[bi], si), { inProgress: true });
    redraw();
    return true;
  }
  if (t.dataset.bind === 'draftDate') {
    if (isDate(t.value) && t.value <= today()) {
      const moved = d.date !== t.value;
      act(
        () => {
          d.date = t.value;
          if (moved && !d.editingId) for (const b of d.ex) refreshBlock(b);
        },
        { inProgress: true }
      );
      if (moved && !d.editingId) fx.rerenderKeepScroll();
    } else {
      t.value = d.date;
      fx.toast('A session cannot be dated in the future');
    }
    return true;
  }
  return false;
}
/* In a set row, Enter (the keyboard's Next) goes load, reps, then the next
   set's load, which is the order sets are typed in; Next on an empty reps
   field accepts the grey number (acceptGrey). Escape closes the effort strip.
   The arrow keys on an exercise's handle move it, as a drag does. */
/** A key on the session screen; whether it was one it acts on. */
export function workoutKey(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof Element)) return false;
  if (e.key === 'Enter' && t instanceof HTMLInputElement && t.matches('.sg input[data-f]')) {
    e.preventDefault();
    if (t.dataset.f === 'r' && !t.value.trim()) acceptGrey(Number(t.dataset.b), Number(t.dataset.s));
    const all = [...document.querySelectorAll<HTMLInputElement>('.sg input[data-f]')];
    const nx = all[all.indexOf(t) + 1];
    if (nx)
      try {
        nx.focus();
        nx.select();
      } catch (x) {
        // Focus is best effort; the set is typed either way.
      }
    else t.blur();
    return true;
  }
  if (e.key === 'Escape' && stripAt) {
    rirClose();
    return true;
  }
  const bg = t.closest('.bgrip');
  const d = state.draft;
  if (bg instanceof HTMLElement && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && d) {
    e.preventDefault();
    const i = Number(bg.dataset.b);
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= d.ex.length) return true;
    moveBlock(i, j);
    fx.rerenderKeepScroll();
    const n = document.querySelector<HTMLElement>(`.bgrip[data-b="${j}"]`);
    if (n) n.focus();
    fx.toast(`Moved to position ${j + 1}`);
    return true;
  }
  return false;
}
/* Leaving a set's reps field empty takes its grey reps (acceptGrey, above),
   unless the lifter went to the same row's load or effort, a button or any
   other control (where the lifter went: the newly focused element, or on an
   iPhone, where buttons never take focus, whatever was just touched), or the
   phone blurred the field itself (locked, or the app sent to the
   background). Leaving the load field a waiting auto-mark was heading for
   runs it. */
/* A tap on a load field shows its number selected (V, PENDING 341 a, from
   the live r56.1: a grey load was an empty field under a hint, so it could
   not be edited in place and backspace did nothing, while a filled one took
   the caret where tapped, 165 then 1 giving 1615). A grey load is put in the
   field to be typed over: a digit replaces it, backspace clears it, and left
   untouched it goes back to grey, so it still follows the next sets'
   adjustment and one tap on the checkmark still logs it. A filled load is
   selected the same way. The selection is made at once, so a digit typed
   right away replaces it, and again once the tap is over (the tap's own
   release can place the caret, on an iPhone as in Chrome) unless something
   was typed meanwhile; a second tap on the focused field places the caret as
   any tap does. iPhone selection behaviour is to be tried on V's phone
   before this ships. */
const greyIn = new WeakSet<HTMLInputElement>();
// The field whose selection is made again once the tap is over, until something is typed in it.
let selAgain: HTMLInputElement | null = null;
// A field of the session screen focused (focusin): a load field's number selected, a grey one put in to be typed over.
function workoutFocus(e: FocusEvent): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || !t.matches('.sg input[data-f="w"]')) return;
  if (!t.value && /\d/.test(t.placeholder)) {
    t.value = t.placeholder;
    greyIn.add(t);
    fieldShown(t, true);
  }
  t.select();
  selAgain = t;
  setTimeout(() => {
    if (selAgain === t && document.activeElement === t) t.select();
    if (selAgain === t) selAgain = null;
  }, 0);
}
// A grey load put in a field and typed over is the lifter's own from then on (workoutInput).
function greyTyped(t: HTMLInputElement): void {
  if (!greyIn.has(t)) return;
  greyIn.delete(t);
  fieldShown(t, false);
}
// A field of the session screen left (focusout).
function workoutBlur(e: FocusEvent): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  // A grey load left untouched goes back to grey: nothing was typed.
  if (greyIn.has(t)) {
    greyTyped(t);
    t.value = '';
  }
  if (
    t.matches('.sg input[data-f="w"]') &&
    pendAuto &&
    pendAuto.s === Number(t.dataset.s) &&
    blkIdx(pendAuto.b) === Number(t.dataset.b)
  ) {
    setTimeout(autoPending, 0);
    return;
  }
  if (!t.matches('.sg input[data-f="r"]') || t.value.trim()) return;
  if (t.dataset.cleared) {
    delete t.dataset.cleared;
    return;
  }
  if (drawing() || !state.draft || !state.settings.autoDone) return;
  const bi = Number(t.dataset.b),
    si = Number(t.dataset.s);
  const to = e.relatedTarget;
  if (to instanceof HTMLElement && to.dataset.b === t.dataset.b && to.dataset.s === t.dataset.s) return;
  const dn = lastDown;
  const dest = to instanceof Element ? to : Date.now() - dn.t < 700 && dn.el !== t ? dn.el : null;
  if (
    dest &&
    !dest.closest('.sg input[data-f]') &&
    dest.closest('button,a,select,label,input,textarea,summary,[data-act],[role="button"]')
  )
    return;
  setTimeout(() => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    acceptGrey(bi, si);
  }, 0);
}

/** Adds the session screen's listeners to the page: where a touch lands (capture), a field left, and a field focused. Called once at start, after the page's own. */
export function workoutStart(): void {
  document.addEventListener('pointerdown', noteDown, true);
  document.addEventListener('focusout', workoutBlur);
  document.addEventListener('focusin', workoutFocus);
}

/* ---------- an exercise dragged ---------- */

/* While an exercise is dragged, a finger near the top or bottom of the space
   between the header and the tab bar (or the rest timer) scrolls the page,
   faster the closer it is. Sortable's own scrolling did not run for a touch
   drag on the window. Sortable re-reads the target every 50 ms on its own, so
   a finger held still keeps moving the exercise as the page scrolls. Both
   bars are position:fixed, whose offsetParent is always null, so
   getClientRects is what tells a shown bar from a hidden one. */
const edgeScroll = ((): { start(): void; stop(): void } => {
  let y: number | null = null,
    raf = 0;
  const mv = (e: Event): void => {
    const p = e instanceof TouchEvent ? e.touches[0] : e instanceof PointerEvent ? e : null;
    if (p) y = p.clientY;
  };
  const zone = (): [number, number] => {
    const h = document.querySelector('header.top');
    const top = h ? h.getBoundingClientRect().bottom : 0;
    let bot = window.innerHeight;
    for (const el of [document.getElementById('tabs'), document.getElementById('timer')]) {
      if (el && !el.hidden && el.getClientRects().length) {
        const r = el.getBoundingClientRect();
        if (r.height) bot = Math.min(bot, r.top);
      }
    }
    return [top, bot];
  };
  const step = (): void => {
    raf = 0;
    if (!blockDrag) return;
    if (y != null) {
      const [top, bot] = zone();
      const edge = 56;
      let v = 0;
      if (y < top + edge) v = -Math.ceil(((top + edge - y) / edge) * 14);
      else if (y > bot - edge) v = Math.ceil(((y - (bot - edge)) / edge) * 14);
      if (v) window.scrollBy(0, Math.max(-20, Math.min(20, v)));
    }
    raf = requestAnimationFrame(step);
  };
  return {
    start(): void {
      y = null;
      document.addEventListener('touchmove', mv, { passive: true });
      document.addEventListener('pointermove', mv, { passive: true });
      if (!raf) raf = requestAnimationFrame(step);
    },
    stop(): void {
      document.removeEventListener('touchmove', mv);
      document.removeEventListener('pointermove', mv);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      y = null;
    }
  };
})();
/** Ends an exercise drag the page is drawn under (a full draw mid-drag): the drag marks off, the room added for it taken away. */
export function blockDragStop(): void {
  blockDrag = false;
  if (document.body.classList.contains('blkdrag')) {
    document.body.classList.remove('blkdrag');
    const v = document.getElementById('view');
    if (v) v.style.paddingBottom = '';
  }
  edgeScroll.stop();
}
/* The exercises open again at the drop. The scroll is moved with them, so
   the one just dropped stays where the finger left it instead of the page
   going back to a position measured on the one-line list (r29 review). */
function dragOpenUp(it: Element): void {
  const t0 = it.isConnected ? it.getBoundingClientRect().top : null;
  document.body.classList.remove('blkdrag');
  const v = document.getElementById('view');
  if (v) v.style.paddingBottom = '';
  if (t0 != null) {
    const t1 = it.getBoundingClientRect().top;
    if (t1 !== t0) window.scrollBy(0, t1 - t0);
  }
}
/* The session's exercises are dragged by their ⠿ handle (r29). lit-html owns
   their nodes (r60), so the exercise dragged goes back where it was drawn
   (view.ts, dragDrop) before the session changes and the screen is drawn in
   the new order, as a drag on Plan or a section does since r57 and r58. An
   open exercise is taller than the screen, so the next one started
   off-screen and a drag could only move one place (r29 review): while
   dragging, every exercise shows only its title line, the page scrolled so
   the one held stays under the finger, with room added below the list when
   the shorter page cannot scroll that far. A field still focused when the
   drag starts would get its focus back by place after the move, on whichever
   exercise landed there, so it is left first. */
/** Makes the session's exercises draggable, when the drag library is loaded and there are two or more; its teardown, or null. */
export function mountBlockDrag(): { destroy(): void } | null {
  const S = window.Sortable;
  const v = document.getElementById('view');
  if (!S || !state.draft || !v || v.querySelectorAll('section.block').length < 2) return null;
  return S.create(v, {
    group: { name: 'blocks', pull: false, put: false },
    handle: '.bgrip',
    draggable: 'section.block',
    animation: 150,
    fallbackOnBody: true,
    onStart: (e: { item: HTMLElement }) => {
      dragStart(e.item);
      blockDrag = true;
      if (foldT) clearTimeout(foldT);
      foldT = null;
      const f = document.activeElement;
      if (f instanceof HTMLElement && f.matches('#view input,#view textarea'))
        try {
          f.blur();
        } catch (x) {
          // Focus is best effort; the drag goes on either way.
        }
      const it = e.item,
        t0 = it.getBoundingClientRect().top;
      document.body.classList.add('blkdrag');
      const se = document.scrollingElement;
      const want = window.scrollY + it.getBoundingClientRect().top - t0,
        room = want - ((se ? se.scrollHeight : 0) - window.innerHeight);
      if (room > 0) v.style.paddingBottom = Math.ceil(room) + 'px';
      window.scrollTo(0, want);
      edgeScroll.start();
    },
    onEnd: (e: { item: HTMLElement; oldDraggableIndex?: number | null; newDraggableIndex?: number | null }) => {
      blockDrag = false;
      edgeScroll.stop();
      dragOpenUp(e.item);
      const a = e.oldDraggableIndex,
        b = e.newDraggableIndex;
      dragDrop();
      if (a == null || b == null || a === b || !state.draft) {
        fx.rerenderKeepScroll();
        return;
      }
      moveBlock(a, b);
      fx.rerenderKeepScroll();
      fx.toast(`Moved to position ${b + 1}`);
    }
  });
}
