/* One row per record of the log in the account (SUPABASE.md, Part 8), first phase: the account's documents (sync.ts)
   decide what the log is, and this module makes the account's rows say what the log says, record by record, after
   each sync of the documents, and checks once a day that they do. It never changes the log. It reads the document
   sync's notes and writes none of them; its own notes are under a key of their own and can be made again from the
   account at any time. Its requests run outside the document sync's queue, so a slow one never holds a send. A
   failure turns it off until the app is opened again and is said in Diagnostics.

   A row is a copy of one record with its version (when the lifter last edited it, on which device, and how many
   times the app has written it since) and, once deleted, a mark that names the copy it deleted. The account joins
   every write itself: the later version of the copy, the mark that names the later copy. So the same writes in any
   order end as the same row, and a phone can send what it holds again at any time.

   This module is what the document sync and the screens call. The notes and what was learnt of the account are
   rowsnotes.ts's, the log as records is rowslog.ts's, and the pass is rowsmirror.ts's, each below the one after it. */

import { cloud } from './store';
import { log } from './storage';
import { netFault } from './providers';
import {
  NO_TABLE,
  ROWS_KEY,
  blockedNow,
  rowsDecide,
  ctxNow,
  ctxSet,
  gateBusy,
  notesNow,
  notesRemoved,
  offWhy,
  rowsOnForget,
  said,
  turnOff
} from './rowsnotes';
import type { Ctx, Finding } from './rowsnotes';
import { logForget, rowsLogKeys } from './rowslog';
import { mirrorForget, mirrorPass } from './rowsmirror';
import { gateNow, gatePass, seenDay } from './rowsgate';

/** What a phone on a build that cannot sync its account says. */
export const ROWS_UPDATE = 'Update the app to keep saving to your account. Your log stays on this phone.';
/** The characters of an error kept as the reason the rows are off. */
const WHY_MAX = 120;
let running: Promise<void> | null = null;
let again = false;

/* ---------- what the document sync calls ---------- */

/** Runs a pass in one tab of this phone at a time (Web Locks): two tabs hold one log and one set of notes, and two passes at once would each write the notes the other read. A tab that finds another's pass under way does nothing: that pass is mirroring the same log. Where the browser has no Web Locks the pass runs at once, as before them. */
async function oneTab(fn: () => Promise<void>): Promise<void> {
  const L = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!L || typeof L.request !== 'function') return fn();
  await L.request(ROWS_KEY, { ifAvailable: true }, async lock => {
    if (lock) await fn();
  });
}
/** Starts the rows: what the document sync tells them (Ctx). */
export function rowsStart(c: Ctx): void {
  ctxSet(c);
  rowsOnForget(logForget);
  rowsOnForget(mirrorForget);
}
/** Runs a pass once the documents are in step with the account; one at a time, and again when asked while one runs. Never throws: a failure is logged and turns the rows off until the app is opened again. */
export function rowsSoon(): void {
  if (offWhy() || !cloud.on || !cloud.db || !cloud.db.rows) return;
  if (running) {
    again = true;
    return;
  }
  // The gate is read after the pass, in the same hold of the lock, so no other tab's pass runs between them.
  running = oneTab(async () => {
    await mirrorPass();
    await gatePass();
  })
    .catch((e: unknown) => {
      log('rows', e);
      // No answer, or a sign-in the sync itself will say is lost, is no fault of the rows: the next sync tries again. Anything else stops them for this visit.
      if (!netFault(e)) turnOff(said(e).slice(0, WHY_MAX));
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        rowsSoon();
      }
    });
}
/** Notes the records the document sync just took out of the log (in `before`, in neither the log nor Recently deleted now): each is a difference unless a device's mark deleting it reaches the rows within the mirror's wait (rowsmirror.ts). Not noted on a phone that has not yet mirrored this account: its first sync takes the account's log in place of what it held (a new phone's starter routine). */
export function rowsRemoved(before: Set<string>): void {
  const C = ctxNow();
  if (!C || !cloud.uid || !cloud.db || !cloud.db.rows || offWhy()) return;
  const now = rowsLogKeys();
  const gone = [...before].filter(k => !now.has(k));
  if (!gone.length) return;
  notesRemoved(cloud.uid, C.ep(), gone, !!running);
}
/** The device that keeps the account from switching, as Settings > "More" says it under the rows' line: the words,
    and the device's id for **Forget it**. */
interface RowsHold {
  text: string;
  dev: string;
}
/** The rows' state for Diagnostics: one line, the findings kept, while the switch waits for another device that
    device, and once the rows decide whether **Switch back** is offered. */
export function rowsDiag(): { line: string; findings: Finding[]; hold?: RowsHold; back?: boolean } | null {
  if (!cloud.on || !cloud.db || !cloud.db.rows) return null;
  const off = offWhy(),
    notes = notesNow();
  if (off === NO_TABLE) return null;
  if (off) return { line: `Rows check: off (${off})`, findings: notes ? notes.find : [] };
  if (blockedNow()) return { line: 'Rows check: this account needs a newer version of the app', findings: [] };
  if (!notes) return { line: 'Rows check: not run yet', findings: [] };
  const n = (k: number, one: string, many: string): string => `${k} ${k === 1 ? one : many}`;
  const waiting = Object.keys(notes.wait).length ? `, ${Object.keys(notes.wait).length} waiting` : '';
  if (rowsDecide()) {
    const L = notes.rows['meta/layout'];
    return {
      line: `Saving by rows${L && L.t ? ` since ${seenDay(L.t)}` : ''}, ${n(notes.chk.diffs, 'difference', 'differences')}${waiting}`,
      findings: notes.find,
      back: true
    };
  }
  // The differences and the records no device deleted, over the daily checks the switch reads.
  const diffs = notes.days.reduce((a, D) => a + D.diffs, 0),
    gone = notes.days.reduce((a, D) => a + D.gone, 0);
  const G = gateNow();
  const days = G && G.need ? `${G.have} of ${G.need} clean days, ` : '';
  const H = G ? G.holder : null;
  return {
    line: `Rows check: ${days}${n(diffs, 'difference', 'differences')}, ${gone} removed with no delete${waiting}`,
    findings: notes.find,
    ...(H
      ? {
          hold: {
            text: H.older
              ? `Waiting for a device on an older version, last seen ${seenDay(H.seen)}.`
              : `Waiting for another device, ${H.have} of ${G ? G.need : 0} clean days, last seen ${seenDay(H.seen)}.`,
            dev: H.dev
          }
        }
      : {})
  };
}
/** Whether a pass is running or asked for: what the suites wait on. */
export const rowsBusy = (): boolean => !!running || again || gateBusy();
