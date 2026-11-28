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
import { codeOf } from './providers';
import {
  NO_TABLE,
  ROWS_KEY,
  blockedNow,
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
  running = oneTab(mirrorPass)
    .catch((e: unknown) => {
      log('rows', e);
      // No answer, or a sign-in the sync itself will say is lost, is no fault of the rows: the next sync tries again. Anything else stops them for this visit.
      const c = codeOf(e);
      if (
        navigator.onLine !== false &&
        c !== 'timeout' &&
        c !== 'revoked' &&
        c !== 'gone' &&
        !/no answer in time|unavailable|offline|Failed to fetch|NetworkError|Load failed/i.test(said(e))
      )
        turnOff(said(e).slice(0, WHY_MAX));
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        rowsSoon();
      }
    });
}
/** Counts the records the document sync just took out of the log (in `before`, in neither the log nor Recently deleted now): on an account used on one phone there should be none. Not counted on a phone that has not yet mirrored this account: its first sync takes the account's log in place of what it held (a new phone's starter routine). */
export function rowsRemoved(before: Set<string>): void {
  const C = ctxNow();
  if (!C || !cloud.uid || !cloud.db || !cloud.db.rows || offWhy()) return;
  const now = rowsLogKeys();
  let n = 0;
  for (const k of before) if (!now.has(k)) n++;
  if (!n) return;
  notesRemoved(cloud.uid, C.ep(), n, !!running);
}
/** The rows' state for Diagnostics: one line, and the findings kept. */
export function rowsDiag(): { line: string; findings: Finding[] } | null {
  if (!cloud.on || !cloud.db || !cloud.db.rows) return null;
  const off = offWhy(),
    notes = notesNow();
  if (off === NO_TABLE) return null;
  if (off) return { line: `Rows check: off (${off})`, findings: notes ? notes.find : [] };
  if (blockedNow()) return { line: 'Rows check: this account needs a newer version of the app', findings: [] };
  if (!notes) return { line: 'Rows check: not run yet', findings: [] };
  const c = notes.chk;
  const n = (k: number, one: string, many: string): string => `${k} ${k === 1 ? one : many}`;
  return {
    line: `Rows check: ${n(c.clean, 'clean day', 'clean days')}, ${n(c.diffs, 'difference', 'differences')}, ${c.removed} removed by another phone${Object.keys(notes.wait).length ? `, ${Object.keys(notes.wait).length} waiting` : ''}`,
    findings: notes.find
  };
}
/** Whether a pass is running or asked for: what the suites wait on. */
export const rowsBusy = (): boolean => !!running || again || gateBusy();
