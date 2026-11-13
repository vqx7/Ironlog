/* The one way to change the log (ARCHITECTURE.md). An action on a moved screen hands its change to `act`,
   which does every step a change needs, always in this order: the check,
   the Undo step, the change, the caches dropped, the save on this device and
   the edit noted for the sync (the save does both, saveNow). A change that
   fails halfway is put back whole, with no save and no Undo step. Placed by hand in
   each action, one left out would be found only when it lost something;
   tests/hygiene.js refuses a write to the log in a screen outside `act`, and
   tests/r57.js reads every step on the page after each action's tap. */

import { CLOSED_KEY, log, prefDel, prefGet, prefSet, snapshot, undoPersist, undoStack } from './storage';
import { assemble, baseOf, mergeChunk, saveNow, saveSoon } from './sync';
import { canon, mergeDraft } from './merge';
import { chunksOf, emptyChunk } from './chunks';
import type { Rec } from './records';
import { invalidate } from './live';
import { normalize, plainTemplate } from './normalize';
import { begunIn, clockStart } from './session';
import { TRASH_BYTES, TRASH_DAYS, TRASH_MAX, parseJson, rec } from './records';
import type { Trashed } from './records';
import type { State } from './store';
import { fx, setState, state } from './store';
import { addDays, today } from './util';

/** How a change is made: its check, and the Undo step it keeps. */
interface ActOpts {
  /** Read first: false refuses the change, and nothing is kept, changed or written. */
  check?: (() => boolean) | undefined;
  /** An Undo step: true keeps the log as it was before the change, a function reverses the change in place (snapshot's `inv`, for a change a later one may touch). Absent, there is none, as for an edit. */
  undo?: boolean | (() => boolean) | undefined;
  /** Saves once the typing pauses (400 ms, saveSoon), for a change made on every keystroke; the caches are still dropped at once. */
  soon?: boolean | undefined;
  /** The change touches only the session in progress, which nothing cached reads (the index, the bests, the pace are built from saved sessions): the caches stay, through every keystroke and tick. */
  inProgress?: boolean | undefined;
}

/* A change made inside another one (a helper that changes the log, called
   from an action's change: Settings' Apply re-plans the session's exercises
   not started) is part of it. Its own Undo step, caches and save are the
   outer change's: the log is saved once, when the whole change is made. Run
   as its own change, it would save half the action, and Undo, which takes
   the first save after its step as the action's result, keep the rest as if
   made after it (tests/r44.js, Apply then Undo). Whether a change
   inside drops the caches is kept for the outer one. */
let depth = 0;
let dropInside = false;
/* The log as it was before the first change to the whole log made inside an outer change to the workout alone: the
   outer change copied the workout only, so a failure puts the rest back from this. */
let logBefore: State | null = null;
// Whether the outer change being made copied the workout alone (inProgress).
let outerDraftOnly = false;
// Whether the change being made keeps an Undo step: one asked for inside a change that keeps none cannot be taken (the log is half changed by then), so it is said in the error log rather than lost unsaid.
let outerUndo = false;
/* The Undo step the newest change kept, until its message names it: the toast that reports a change is
   shown just after it, and its words are what Undo says it took back. A change that keeps no step clears it, so a
   message never names an older change's step. */
let lastStep: (typeof undoStack)[number] | undefined;
// The workout in progress as the outer change being made found it (begunBefore): its clock is started against it.
let outerBegun: { id: string; begun: boolean; live: boolean } | null = null;

/** Changes the log with every step a change needs, in order; false when its check refused it. Inside another change it is part of that one. */
export function act(change: () => void, opts: ActOpts = {}): boolean {
  if (opts.check && !opts.check()) return false;
  if (depth > 0) {
    // A change to the whole log inside one to the workout alone: the log as it was before it is kept for the outer change to put back if it fails.
    if (!opts.inProgress && outerDraftOnly && !logBefore) logBefore = structuredClone(state);
    if (!opts.inProgress) dropInside = true;
    if (opts.undo && !outerUndo) log('act', 'an Undo step was asked inside a change that keeps none');
    change();
    /* Here too, against the workout as the outer change found it, so a screen drawn before the outer change ends (a
       tick inside the tap's change, after the tap took the grey reps) shows the clock started. */
    clockAfter(outerBegun);
    return true;
  }
  /* A toast's Undo takes back the change it reports. Once another change is
     made after it, the newest step is no longer that change alone (a set
     ticked on a lift just swapped in, Undo would put the old lift back and
     move the new one, its set with it, to the end), so
     the toast goes; a change that keeps a step shows its own after this.
     Settings' Undo last delete or reset still takes back the steps kept. */
  fx.undoToastHide();
  const top0 = undoStack[undoStack.length - 1];
  if (opts.undo) snapshot(typeof opts.undo === 'function' ? opts.undo : null);
  // The step this change keeps: a new entry on top, none when the snapshot could not be taken.
  const top = undoStack[undoStack.length - 1];
  const step = opts.undo && top !== top0 ? top : undefined;
  lastStep = step;
  /* A step is named only by the message shown with its own change, in the same turn (not Settings' Your gym in kg
     showing its message with Undo after making no change, naming an older change's step). A message shown later leaves its step unnamed, which reads "Undone", never wrong words. */
  if (step)
    queueMicrotask(() => {
      if (lastStep === step) lastStep = undefined;
    });
  /* What a change that fails halfway is put back to: an exact copy of the workout in progress for a
     change to it alone, else of the whole log, so the next change never saves a half-changed log. */
  const draftWas = opts.inProgress ? structuredClone(state.draft) : null;
  const logWas = opts.inProgress ? null : structuredClone(state);
  outerUndo = !!opts.undo;
  outerDraftOnly = !!opts.inProgress;
  depth++;
  let inside = false;
  outerBegun = begunBefore();
  try {
    change();
    // The workout's clock starts with the change that begins it, whichever tap began it (session.ts).
    clockAfter(outerBegun);
    followsAfter(outerBegun);
  } catch (e) {
    if (logWas) setState(logWas);
    else {
      if (logBefore) setState(logBefore);
      state.draft = draftWas;
    }
    // The step kept for a change that was not made is taken back with it.
    if (step && undoStack[undoStack.length - 1] === step) {
      undoStack.pop();
      undoPersist();
    }
    invalidate();
    throw e;
  } finally {
    // Read and cleared whether or not the change threw, so the next change starts clean.
    depth--;
    inside = dropInside;
    dropInside = false;
    logBefore = null;
  }
  if (!opts.inProgress || inside) invalidate();
  if (opts.soon) saveSoon();
  else saveNow();
  return true;
}

/* The workout in progress before a change, for its clock after it (session.ts clockStart): which workout, and whether
   it had begun. The clock starts only at the change that begins it, so a workout that arrives begun (another tab's or
   phone's on a build that keeps no start, a backup restored) keeps the start it came with, or none. */
/** The workout in progress before a change: its id, whether it had begun, whether it is one being lifted (not a past workout or an edit), and the one it follows. */
function begunBefore(): { id: string; begun: boolean; live: boolean; follows?: string | undefined } | null {
  const d = state.draft;
  return d ? { id: d.id, begun: begunIn(d), live: !d.past && !d.editingId, follows: d.follows } : null;
}
/* The workout this phone closed last (finished or discarded), for the next one started here, which notes it
   (follows): a merge with a copy of the closed one that another phone kept working in then knows this phone moved on
   from it, and keeps the next workout open rather than bringing the closed one back (sync.ts mergeChunk). Kept on the
   phone (CLOSED_KEY), and for the visit when storage refuses it: a workout finished, the app closed, and the next
   started later is the usual order, and known for the visit alone the finished workout would come back open on both
   phones. */
let closedHere: string | null = null;
/** Notes a workout closed here, or gives the next one started here the one it follows; after an outer change (act). */
function followsAfter(
  before: { id: string; begun: boolean; live: boolean; follows?: string | undefined } | null
): void {
  const d = state.draft;
  if (before && before.live && !d) {
    /* A workout closed before it began (the wrong day tapped, then discarded) moved the phone on from nothing: the
       next one follows what that one followed, so a merge still knows the phone moved on from the workout before it. */
    const id = !before.begun && before.follows ? before.follows : before.id;
    closedHere = id;
    prefSet(CLOSED_KEY, id);
    return;
  }
  if (before || !d) return;
  const closed = prefGet(CLOSED_KEY) || closedHere;
  if (closed && !d.past && !d.editingId && !d.follows && !begunIn(d)) {
    d.follows = closed;
    closedHere = null;
    prefDel(CLOSED_KEY);
  }
}
/** Starts or stops the clock of the workout in progress after a change, given what it was before (begunBefore). */
function clockAfter(before: { id: string; begun: boolean } | null): void {
  const d = state.draft;
  clockStart(d, !before || !d || before.id !== d.id ? true : before.begun);
}

/** Puts a copy of a deleted session, routine or cardio entry into Recently deleted, newest first, within its count and size; a ready-made routine left as it came is not kept. Called inside a change given to `act`. */
export function toTrash(kind: Trashed['kind'], data: { id: string }): void {
  if (kind === 'routine' && plainTemplate(data)) return;
  const copy = rec(parseJson(JSON.stringify(data))) ?? {};
  const cutoff = trashCutoff();
  state.trash = [
    { id: data.id, kind, date: today(), data: copy },
    ...state.trash.filter(t => !(t.id === data.id && t.kind === kind) && (t.clash || t.date >= cutoff))
  ].slice(0, TRASH_MAX);
  while (state.trash.length > 1 && JSON.stringify(state.trash).length > TRASH_BYTES) state.trash.pop();
}

/* Recently deleted keeps a deletion TRASH_DAYS days by this phone's date. The days are counted where they are shown
   (trashShown) and when something is deleted (toTrash, a change the lifter makes), never where the log is read
   (normalize), which must read every log the same way on every phone, and never as a change the app makes by
   itself: one at open would mark the whole core document as edited then, so an older edit kept on this phone would
   beat a later one made on another. */
/** The oldest date Recently deleted still keeps, by this phone's date. */
const trashCutoff = (): string => addDays(today(), -TRASH_DAYS);
/** Recently deleted as it is shown: the entries within its days, and every copy put aside from a session or cardio entry held twice (Trashed's clash, kept until the lifter acts on it), newest first. */
export function trashShown(): Trashed[] {
  const cutoff = trashCutoff();
  return state.trash.filter(t => t.clash || t.date >= cutoff);
}

/* ---------- Undo ----------
   Only the action is reversed, not the whole state put back from before it,
   which would throw away every session, weigh-in or set logged since then: its own reversal while the session it changed is open
   (an Undo step given a function), else a three-way merge with the state
   right after the action as the base, what is here now as one side and the
   state before the action as the other. Records changed since the action
   keep their newer version. */
/** Names the Undo step the newest change kept with the words of the message reporting it; nothing when that change kept none or it was named already. */
export function nameLastStep(said: string): void {
  if (!lastStep || lastStep.said || !undoStack.includes(lastStep)) return;
  lastStep.said = said;
  lastStep = undefined;
  undoPersist();
}

/** What the next Undo would take back, in the words of the message that reported it: null when nothing is kept, '' when the step was kept unnamed (by a build before 2.30). */
export function undoNext(): string | null {
  const e = undoStack[undoStack.length - 1];
  return e ? e.said || '' : null;
}

/** Takes back the newest Undo step: 'none' when there is none, 'failed' when it could not be read, 'unchanged' when nothing it changed is left to undo, else what it took back, in the words of the message that reported the change ('' for a step kept unnamed). */
export function undoStep(): 'none' | 'failed' | 'unchanged' | { said: string } {
  const e = undoStack.pop();
  if (!e) return 'none';
  lastStep = undefined;
  undoPersist();
  const before = canon(state);
  let done = false;
  if (e.inv) {
    try {
      done = e.inv() === true;
    } catch (x) {
      log('undo', x);
      done = false;
    }
    if (done) setState(normalize(state));
  }
  if (!done)
    try {
      const pre = normalize(parseJson(e.pre));
      const post = e.post ? normalize(parseJson(e.post)) : state;
      const P = chunksOf(pre),
        Q = chunksOf(post),
        C = chunksOf(state);
      const stat = { conflicts: 0 };
      const parts: Record<string, Rec | null> = {};
      for (const id of new Set([...Object.keys(P), ...Object.keys(Q), ...Object.keys(C)])) {
        const q = Q[id] || emptyChunk(id);
        /* The session in progress compared in one form, all three normalized,
           as a reload leaves it: the live one compared raw would read every
           exercise as changed since, and nothing would go back (Undo after
           Make it lighter). */
        const qd = Q['draft'],
          pd = P['draft'];
        parts[id] =
          id === 'draft'
            ? {
                draft: mergeDraft(
                  qd && qd['draft'],
                  normalize(parseJson(JSON.stringify(state))).draft,
                  pd && pd['draft'],
                  id => state.sessions.some(x => x.id === id)
                )
              }
            : mergeChunk(id, q ? baseOf(id, q) : null, C[id] || emptyChunk(id), P[id] || emptyChunk(id), false, stat);
      }
      setState(assemble(parts));
    } catch (x) {
      log('undo', x);
      return 'failed';
    }
  // If the step below never saw a save of its own, its result is the state
  // before the step just undone, not what this undo is about to save.
  const below = undoStack[undoStack.length - 1];
  if (below && below.post == null) below.post = e.pre;
  if (canon(state) === before) return 'unchanged';
  invalidate();
  saveNow();
  return { said: e.said || '' };
}
