/* The one way to change the log (phase 5, r57; ARCHITECTURE.md, Phase 5
   design, item 2). An action on a moved screen hands its change to `act`,
   which does every step a change needs, always in this order: the check,
   the Undo step, the change, the caches dropped, the save on this device and
   the edit noted for the sync (the save does both, saveNow). Before r57 each
   action placed these by hand, about 170 saves and 41 Undo steps, and one
   left out was found only when it lost something. The legacy script's
   direct writes are replaced screen by screen as each moves; tests/hygiene.js
   refuses a write to the log in a moved screen outside `act`, and
   tests/r57.js reads every step on the page after each action's tap. */

import { snapshot } from './storage';
import { saveNow, saveSoon } from './sync';
import { invalidate } from './live';
import { plainTemplate } from './normalize';
import { TRASH_BYTES, TRASH_MAX, parseJson, rec } from './records';
import type { Trashed } from './records';
import { state } from './store';
import { today } from './util';

/** How a change is made: its check, and the Undo step it keeps. */
export interface ActOpts {
  /** Read first: false refuses the change, and nothing is kept, changed or written. */
  check?: (() => boolean) | undefined;
  /** An Undo step: true keeps the log as it was before the change, a function reverses the change in place (snapshot's `inv`, for a change a later one may touch). Absent, there is none, as for an edit before r57. */
  undo?: boolean | (() => boolean) | undefined;
  /** Saves once the typing pauses (400 ms, saveSoon), for a change made on every keystroke; the caches are still dropped at once. */
  soon?: boolean | undefined;
  /** The change touches only the session in progress, which nothing cached reads (the index, the bests, the pace are built from saved sessions): the caches stay, as the legacy session screen left them on every keystroke and tick (r60). */
  inProgress?: boolean | undefined;
}

/** Changes the log with every step a change needs, in order; false when its check refused it. */
export function act(change: () => void, opts: ActOpts = {}): boolean {
  if (opts.check && !opts.check()) return false;
  if (opts.undo) snapshot(typeof opts.undo === 'function' ? opts.undo : null);
  change();
  if (!opts.inProgress) invalidate();
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
