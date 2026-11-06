/* The one way to change the log (phase 5, r57; ARCHITECTURE.md, Phase 5
   design, item 2). An action on a moved screen hands its change to `act`,
   which does every step a change needs, always in this order: the check,
   the Undo step, the change, the caches dropped, the save on this device and
   the edit noted for the sync (the save does both, saveNow). A change that
   fails halfway is put back whole, with no save and no Undo step (2.28). Before r57 each
   action placed these by hand, about 170 saves and 41 Undo steps, and one
   left out was found only when it lost something. The legacy script's
   direct writes are replaced screen by screen as each moves; tests/hygiene.js
   refuses a write to the log in a moved screen outside `act`, and
   tests/r57.js reads every step on the page after each action's tap. */

import { log, snapshot, undoPersist, undoStack } from './storage';
import { assemble, baseOf, mergeChunk, saveNow, saveSoon } from './sync';
import { canon, mergeDraft } from './merge';
import { chunksOf, emptyChunk } from './chunks';
import type { Rec } from './records';
import { invalidate } from './live';
import { normalize, plainTemplate } from './normalize';
import { TRASH_BYTES, TRASH_MAX, arr, parseJson, rec } from './records';
import type { Trashed } from './records';
import type { State } from './store';
import { fx, setState, state } from './store';
import { today } from './util';

/** How a change is made: its check, and the Undo step it keeps. */
interface ActOpts {
  /** Read first: false refuses the change, and nothing is kept, changed or written. */
  check?: (() => boolean) | undefined;
  /** An Undo step: true keeps the log as it was before the change, a function reverses the change in place (snapshot's `inv`, for a change a later one may touch). Absent, there is none, as for an edit before r57. */
  undo?: boolean | (() => boolean) | undefined;
  /** Saves once the typing pauses (400 ms, saveSoon), for a change made on every keystroke; the caches are still dropped at once. */
  soon?: boolean | undefined;
  /** The change touches only the session in progress, which nothing cached reads (the index, the bests, the pace are built from saved sessions): the caches stay, as the legacy session screen left them on every keystroke and tick (r60). */
  inProgress?: boolean | undefined;
}

/* A change made inside another one (a helper that changes the log, called
   from an action's change: Settings' Apply re-plans the session's exercises
   not started) is part of it. Its own Undo step, caches and save are the
   outer change's: the log is saved once, when the whole change is made. Run
   as its own change, it saved half the action, and Undo, which takes the
   first save after its step as the action's result, kept the rest as if made
   after it (r60's full run: tests/r44.js, Apply then Undo). Whether a change
   inside drops the caches is kept for the outer one. */
let depth = 0;
let dropInside = false;
/* The log as it was before the first change to the whole log made inside an outer change to the workout alone: the
   outer change copied the workout only, so a failure puts the rest back from this (2.28, the review of 2.28). */
let logBefore: State | null = null;
// Whether the outer change being made copied the workout alone (inProgress).
let outerDraftOnly = false;
// Whether the change being made keeps an Undo step: one asked for inside a change that keeps none cannot be taken (the log is half changed by then), so it is said in the error log rather than lost unsaid.
let outerUndo = false;

/** Changes the log with every step a change needs, in order; false when its check refused it. Inside another change it is part of that one. */
export function act(change: () => void, opts: ActOpts = {}): boolean {
  if (opts.check && !opts.check()) return false;
  if (depth > 0) {
    // A change to the whole log inside one to the workout alone: the log as it was before it is kept for the outer change to put back if it fails (2.28).
    if (!opts.inProgress && outerDraftOnly && !logBefore) logBefore = structuredClone(state);
    if (!opts.inProgress) dropInside = true;
    if (opts.undo && !outerUndo) log('act', 'an Undo step was asked inside a change that keeps none');
    change();
    return true;
  }
  /* A toast's Undo takes back the change it reports. Once another change is
     made after it, the newest step is no longer that change alone (a set
     ticked on a lift just swapped in, Undo put the old lift back and moved
     the new one, its set with it, to the end: the r63 audit's P-S4-9), so
     the toast goes; a change that keeps a step shows its own after this.
     Settings' Undo last delete or reset still takes back the steps kept. */
  fx.undoToastHide();
  const top0 = undoStack[undoStack.length - 1];
  if (opts.undo) snapshot(typeof opts.undo === 'function' ? opts.undo : null);
  // The step this change keeps: a new entry on top, none when the snapshot could not be taken.
  const top = undoStack[undoStack.length - 1];
  const step = opts.undo && top !== top0 ? top : undefined;
  /* What a change that fails halfway is put back to (2.28, 2.27-F5): an exact copy of the workout in progress for a
     change to it alone, else of the whole log. Before 2.28 the half-changed log stayed, and the next change saved
     it. */
  const draftWas = opts.inProgress ? structuredClone(state.draft) : null;
  const logWas = opts.inProgress ? null : structuredClone(state);
  outerUndo = !!opts.undo;
  outerDraftOnly = !!opts.inProgress;
  depth++;
  let inside = false;
  try {
    change();
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

/** Puts a copy of a deleted session, routine or cardio entry into Recently deleted, newest first, within its count and size; a ready-made routine left as it came is not kept (r34.1). Called inside a change given to `act`. */
export function toTrash(kind: Trashed['kind'], data: { id: string }): void {
  if (kind === 'routine' && plainTemplate(data)) return;
  const copy = rec(parseJson(JSON.stringify(data))) ?? {};
  state.trash = [
    { id: data.id, kind, date: today(), data: copy },
    ...state.trash.filter(t => !(t.id === data.id && t.kind === kind))
  ].slice(0, TRASH_MAX);
  while (state.trash.length > 1 && JSON.stringify(state.trash).length > TRASH_BYTES) state.trash.pop();
}

/* ---------- Undo (moved from the legacy script's 27-actions.js in r63) ----------
   Undo used to put back the whole state from before the action, which also
   threw away every session, weigh-in or set logged since then. Now only the
   action is reversed: its own reversal while the session it changed is open
   (an Undo step given a function), else a three-way merge with the state
   right after the action as the base, what is here now as one side and the
   state before the action as the other. Records changed since the action
   keep their newer version. */
/** A step's whole log, which every step not cut to its documents has; one with neither is not read as an empty log. */
function wholeOf(pre: string | null): string {
  if (pre == null) throw new Error('an Undo step with neither its log nor its documents');
  return pre;
}

/** Takes back the newest Undo step: 'none' when there is none, 'failed' when it could not be read, 'unchanged' when nothing it changed is left to undo, else how many steps are left. */
export function undoStep(): 'none' | 'failed' | 'unchanged' | number {
  const e = undoStack.pop();
  if (!e) return 'none';
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
      /* A step cut to the documents its action changed (2.27-F4): only those are merged, every other document is
         as it is now, which is what the merge gives a document the action left alone. A whole step (2.28's, or one
         not yet saved) reads every document. */
      const D = e.d != null ? rec(parseJson(e.d)) : null;
      const cutP = D ? rec(D.p) || {} : null,
        cutQ = D ? rec(D.q) || {} : null,
        cutK = D ? rec(D.k) || {} : null,
        cutL = D ? rec(D.l) || {} : null;
      const strs = (v: unknown): string[] => {
        const out: string[] = [];
        for (const f of arr(v) || []) if (typeof f === 'string') out.push(f);
        return out;
      };
      const C = chunksOf(state);
      /* One side of a cut document: its changed fields as they were on that side, every other field as it is now
         (both sides alike, so the merge keeps it as it is now); a document absent on that side stays absent. */
      const side = (o: Rec): Record<string, Rec> => {
        const out: Record<string, Rec> = {};
        for (const id in o) {
          const v = rec(o[id]);
          if (!v) continue;
          const changed = new Set(strs(cutK && cutK[id]));
          const lists = new Set(strs(cutL && cutL[id]));
          const doc: Rec = {};
          const now = C[id];
          if (now) for (const f in now) if (!changed.has(f)) doc[f] = now[f];
          for (const f in v) {
            const cut = lists.has(f) ? rec(v[f]) : null;
            if (!cut) {
              doc[f] = v[f];
              continue;
            }
            // A list cut to its ids: each record as kept on this side, else as it is now; one gone since stays gone.
            const recs = rec(cut.recs) || {};
            const here = new Map((arr(now && now[f]) || []).map(r => [rec(r)?.id, r]));
            const list: unknown[] = [];
            for (const rid of strs(cut.ids)) {
              const r = rid in recs ? recs[rid] : here.get(rid);
              if (r !== undefined) list.push(r);
            }
            doc[f] = list;
          }
          out[id] = doc;
        }
        return out;
      };
      const P = cutP ? side(cutP) : chunksOf(normalize(parseJson(wholeOf(e.pre)))),
        Q = cutQ ? side(cutQ) : chunksOf(e.post ? normalize(parseJson(e.post)) : state);
      const stat = { conflicts: 0 };
      const parts: Record<string, Rec | null> = {};
      const ids = cutP && cutQ ? new Set([...Object.keys(cutP), ...Object.keys(cutQ)]) : null;
      if (ids) for (const id in C) if (!ids.has(id)) parts[id] = C[id];
      for (const id of ids || new Set([...Object.keys(P), ...Object.keys(Q), ...Object.keys(C)])) {
        const q = Q[id] || emptyChunk(id);
        /* The session in progress compared in one form, all three normalized,
           as a reload leaves it: the live one compared raw read every exercise
           as changed since and nothing went back (r55.1, the audit of r55:
           Undo after Make it lighter). */
        const qd = Q['draft'],
          pd = P['draft'];
        parts[id] =
          id === 'draft'
            ? {
                draft: mergeDraft(
                  qd && qd['draft'],
                  normalize(parseJson(JSON.stringify(state))).draft,
                  pd && pd['draft']
                )
              }
            : mergeChunk(id, q ? baseOf(id, q) : null, C[id] || emptyChunk(id), P[id] || emptyChunk(id), false, stat);
      }
      /* The documents in the order chunksOf makes them (core, the workout in progress, weigh-ins by year, sessions by
         half-month), which a date in the id sorts: assemble puts sessions back in the order of their documents, and
         a cut step's were added after the rest. */
      const rank = (id: string): string =>
        (id === 'core' ? '0' : id === 'draft' ? '1' : id.startsWith('b-') ? '2' : '3') + id;
      const sorted: Record<string, Rec | null> = {};
      for (const id of Object.keys(parts).sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0)))
        sorted[id] = parts[id];
      setState(assemble(ids ? sorted : parts));
    } catch (x) {
      log('undo', x);
      return 'failed';
    }
  // If the step below never saw a save of its own, its result is the state
  // before the step just undone, not what this undo is about to save.
  const below = undoStack[undoStack.length - 1];
  if (below && below.post == null && below.d == null && e.pre != null) below.post = e.pre;
  if (canon(state) === before) return 'unchanged';
  invalidate();
  saveNow();
  return undoStack.length;
}
