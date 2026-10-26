/* The session screen's state between draws (r60, from workout.ts): which
   exercise is open, the set an auto-mark waits on, the row whose load is
   marked, the effort strip open, the plates line, the folds waiting, an
   exercise being dragged, and the hook the screen draws itself again
   through, with the handles that find a block again after a move or a
   normalize (BlkRef). One object (W) holds what more than one module of the
   session screen changes, so each reads the same value; workoutFullDraw
   resets what a full draw starts afresh. Nothing here draws or writes the
   log. */

import { state, ui } from './store';
import type { DraftLike, BlkRef } from './session';
import type { DraftSet, DraftBlock } from './types';
/** What more than one module of the session screen changes between draws, read and written through W. */
export interface WorkState {
  // A pending fold, the exercise drag and the timer for the blocks waiting to move up (r29, r45).
  foldT: ReturnType<typeof setTimeout> | null;
  blockDrag: boolean;
  orderT: ReturnType<typeof setTimeout> | null;
  // The set waiting to be confirmed after auto-mark (sDone's 15 s), the set whose auto-mark waits for its effort strip or its load field, and a far-off number answered Log it.
  lastAuto: { b: BlkRef | null; s: number; t: number } | null;
  pendAuto: { b: BlkRef | null; s: number } | null;
  oddOk: string | null;
  /* The row whose tick waits for its weight (344) or whose load Finish asked
     for: its load field is marked until a load is typed into it or the screen
     is drawn afresh. */
  needAt: { b: BlkRef | null; s: number } | null;
  // Where the last touch landed, for the blur a phone fires before the tap it leads to (auto-mark's routes).
  lastDown: { el: Element | null; t: number };
  // The effort strip open under a set (StripAt).
  stripAt: StripAt | null;
  // The row whose load is being typed, whose plates the line under the exercise shows (r29), until the next tick or full draw.
  platesAt: { b: BlkRef | null; s: number } | null;
  /* A block done this visit folds a moment after its last tick (1.2 s, or
     once its effort is picked), not on the tick: the lifter sees the tick and
     the effort strip first. Until then it is drawn open. */
  foldWait: WeakSet<DraftBlock>;
  // The load field a tap just focused, whose selection is made again when the tap is released.
  selAgain: HTMLInputElement | null;
  // The load field just focused whose number the first key replaces (and backspace clears), until a key, a tap on it or leaving it.
  replaceNext: HTMLInputElement | null;
}
/** The session screen's state between draws (WorkState). */
export const W: WorkState = {
  foldT: null,
  blockDrag: false,
  orderT: null,
  lastAuto: null,
  pendAuto: null,
  oddOk: null,
  needAt: null,
  lastDown: { el: null, t: 0 },
  stripAt: null,
  platesAt: null,
  foldWait: new WeakSet<DraftBlock>(),
  selAgain: null,
  replaceNext: null
};

/** A tap's element as the page's handler gives it: its data attributes. */
export type Tap = { dataset: DOMStringMap };

/** The session in progress, as the screen reads and changes it. */
export type Draft = DraftLike;

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
export const adjSrc = new WeakMap<DraftBlock, DraftSet>();

/* An exercise opened again after it folded stays open when exercises around
   it move (r25): the block itself is remembered as well as its place. */
export const blkOpenObj = new WeakSet<DraftBlock>();

/* What an edit of a saved session holds, to tell whether anything changed
   (r30: Cancel on an untouched edit asked "Discard this session?"). Kept in
   memory per draft; after a reload the edit asks as before. */
/** The fingerprint an edit from History started from, by the edit's draft id. */
export const editFp0 = new Map<string, string>();

/* The session screen draws itself again through one hook: the set logic and
   Finish sit in modules below the screen (worksets.ts, workfinish.ts), which
   cannot import it without a circle, so the screen gives its draw here when
   it starts (workoutStart). */
let drawer: (() => void) | null = null;

/** Gives the session screen's draw, once, at start. */
export function onRedraw(f: () => void): void {
  drawer = f;
}

/** Draws the session screen again in place, where it is on screen: lit-html changes only what differs, so the field being typed in and its caret stay. */
export function redraw(): void {
  if (drawer) drawer();
}

/** The blocks waiting to move up after their first tick (r45), in the order ticked. */
export const orderQ: DraftBlock[] = [];

// Loads far from last time's, said once per exercise per session (mixCheck).
export const mixSeen = new Set<string>();

// Where a block was before its first tick moved it up (r55): an untick within half a minute puts it back.
export const ordBack = new WeakMap<DraftBlock, { i: number; t: number }>();

// Keyed by session too, so a block opened in one session is not open in the next.
const blkKey = (bi: number, b: DraftBlock): string => ((state.draft && state.draft.id) || '') + ':' + bi + ':' + b.exId;

/** Whether a block was opened again after it folded, by its place or itself. */
export const blkIsOpen = (bi: number, b: DraftBlock): boolean => ui.blkOpen.has(blkKey(bi, b)) || blkOpenObj.has(b);

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

/* A block in the session over time (r46). Neither handle on its own
   survives: a place changes whenever exercises move, and the object is
   replaced by normalize, which runs on every sync, Undo, cross-tab write and
   restore. The id made with the exercise survives both, so it leads, with
   the object and then the place behind it for a session started on a build
   before r46, which has no id. */
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

/** The effort strip open under a set this visit: the block, held, and the row; a full redraw closes it, as the legacy page's did. */
interface StripAt {
  b: BlkRef | null;
  s: number;
}

/** Whether row si's load field is the one marked as needing a load. */
export function needHere(bi: number, si: number): boolean {
  return !!W.needAt && W.needAt.s === si && blkIdx(W.needAt.b) === bi;
}

/** The load fields showing a grey load put in to be typed over (workoutFocus, workout.ts). */
export const greyIn = new WeakSet<HTMLInputElement>();
