/* The switch of an account from its documents to its rows. One write, made only while every record of the log reads
   as its row and the account's last change is the one this phone read (`only_if_top`), so two phones can never both
   switch an account and nothing written by another phone in between is lost: the layout says the rows decide, and a
   row for each document keeps the copy of it the rows equal at that moment. The switching phone is then the one whose
   log, rows and documents were just proven equal, and takes its notes as agreed. */

import { cloud, state } from './store';
import { device, log } from './storage';
import { canon } from './merge';
import type { RowIn } from './store';
import {
  LEVEL,
  ansNum,
  ctxNow,
  heldOf,
  keyOf,
  layoutNow,
  layoutTaken,
  notesDigest,
  notesFor,
  notesOut,
  rowsDecide,
  soon,
  takeIn
} from './rowsnotes';
import { arr, rec } from './records';
import type { Rec } from './records';
import { mirrorInStep } from './rowsmirror';
import { lookAtSwitch, rowSync, rowsSwitched, rowsUnsent, writeDocsBack } from './rowsync';

/** The level the layout says once switched back: the first phase's, so a phone on a build of that phase syncs the account again. */
const BACK_LEVEL = 1;
/** How many times Switch back reads again and tries again when another phone writes in between. */
const BACK_TRIES = 3;

/** Switches the account to its rows now, if this phone may: signed in, its documents in step with the account and
    nothing unsent, every record reading as its row, and the account's checksum the one its notes give. True when it
    switched; false when it did not, and nothing changed. */
export async function switchNow(): Promise<boolean> {
  try {
    return await trySwitch();
  } catch (e) {
    /* No answer, or the account refused: the switch is tried again at the next check. One that reached the account
       with its answer lost is learnt from the next read's layout, and this phone then crosses as any other does.
       Refused because another phone wrote a row since this one read the account (rows_moved) is no fault. */
    if (!/rows_moved/.test(String(rec(e)?.['message'] || e))) log('rows-switch', e);
    return false;
  }
}
/** The switch itself (switchNow). */
async function trySwitch(): Promise<boolean> {
  const R = cloud.db && cloud.db.rows;
  const C = ctxNow();
  const acct = cloud.uid;
  if (!R || !C || !acct || !cloud.on || rowsDecide() || !device.ok) return false;
  if (cloud.status !== 'synced' || C.unsent()) return false;
  const { N } = notesFor(acct, C.ep());
  if (!N.made || !mirrorInStep(N)) return false;
  // Only where the documents are guarded: else a phone on an older build would go on saving where no phone on this build reads.
  if (!R.guarded || (await soon(R.guarded())) !== true) return false;
  // What changed in the account since this phone's last read is read first: a row of the log changed there means the
  // log is not yet in step (it waits), and the switch is tried at the next check; any other row is only noted.
  if (!(await takeIn(R, N)) || !mirrorInStep(N)) {
    notesOut(N);
    return false;
  }
  const d = rec(await soon(R.digest()));
  const mine = notesDigest(N);
  if (!d || ansNum(d['top']) !== N.n || ansNum(d['n']) !== mine.n || d['sum'] !== mine.sum) return false;
  const L = layoutNow() || {};
  const top = N.n;
  const at = Date.now();
  const layout = JSON.stringify({
    ...L,
    made: N.made,
    decides: 'rows',
    level: LEVEL,
    gen: ansNum(L['gen']) + 1,
    at: top
  });
  const rows: RowIn[] = [{ kind: 'meta', id: 'layout', body: layout, t: at, dev: cloud.devId || '', a: 0 }];
  // Each document as the rows equal it now: its time and its records' fingerprints, the base a later look crosses from.
  for (const id in cloud.meta) {
    const m = cloud.meta[id];
    if (m)
      rows.push({
        kind: 'frozen',
        id,
        body: canon({ at: m.at, h: m.h, b: m.b || null }),
        t: at,
        dev: cloud.devId || '',
        a: 0
      });
  }
  // Refused whole (rows_moved) when another phone wrote a row since this phone read the account: nothing changed.
  const A = rec(await soon(R.push(rows, top)));
  if (!A) return false;
  layoutTaken(A['layout']);
  for (const x of arr(A['rows']) || []) {
    const X = rec(x);
    if (X && typeof X['kind'] === 'string' && typeof X['id'] === 'string')
      N.rows[keyOf(X['kind'], X['id'])] = heldOf(X);
  }
  if (!rowsDecide()) {
    log('rows-switch', new Error('the switch was written but the layout read back does not say the rows decide'));
    return false;
  }
  rowsSwitched(N, ansNum(A['top']), state.draft);
  notesOut(N);
  // What another phone wrote to the documents after this phone last read them, before the switch, crosses now.
  await lookAtSwitch();
  return true;
}

/* Switch back (V's design, 5.1): the account goes back to its documents deciding, from this phone. Its rows sync ends
   with nothing unsent, so its log is the rows at the account's last change; it writes that log over every document
   (writeDocsBack); then one write of the layout, made only while the account's last change is still that one, says the
   documents decide again, at the first phase's level, with `hold` so no phone switches the account again, and `made`
   kept so no phone takes the rows as begun again. A row written by another phone in between refuses that write whole:
   the rows are read again and the documents written again. Until the layout says so, no phone reads the documents, so
   a stop half way harms nothing and a tap again starts over. */
/** Switch back from this phone (above): 'done', 'unsent' when something could not be saved first, or 'failed' (nothing changed in what decides). */
export async function switchBack(): Promise<'done' | 'unsent' | 'failed'> {
  try {
    return await tryBack();
  } catch (e) {
    log('rows-back', e);
    return 'failed';
  }
}
/** Switch back itself (switchBack). */
async function tryBack(): Promise<'done' | 'unsent' | 'failed'> {
  const R = cloud.db && cloud.db.rows;
  const C = ctxNow();
  const acct = cloud.uid;
  if (!R || !C || !acct || !cloud.on || !rowsDecide() || !device.ok) return 'failed';
  for (let n = 0; n < BACK_TRIES; n++) {
    await rowSync();
    if (!rowsDecide()) return 'done';
    if (rowsUnsent()) return 'unsent';
    const { N } = notesFor(acct, C.ep());
    const top = N.n;
    if (!(await writeDocsBack())) continue;
    const L = layoutNow() || {};
    const layout = JSON.stringify({
      ...L,
      made: N.made,
      decides: 'docs',
      level: BACK_LEVEL,
      gen: ansNum(L['gen']) + 1,
      at: top,
      hold: true
    });
    let A: Rec | null;
    try {
      A = rec(
        await soon(
          R.push([{ kind: 'meta', id: 'layout', body: layout, t: Date.now(), dev: cloud.devId || '', a: 0 }], top)
        )
      );
    } catch (e) {
      // Another phone wrote a row since this one read the account: read again, written again.
      if (/rows_moved/.test(String(rec(e)?.['message'] || e))) continue;
      throw e;
    }
    if (!A) return 'failed';
    layoutTaken(A['layout']);
    for (const x of arr(A['rows']) || []) {
      const X = rec(x);
      if (X && typeof X['kind'] === 'string' && typeof X['id'] === 'string')
        N.rows[keyOf(X['kind'], X['id'])] = heldOf(X);
    }
    N.n = Math.max(N.n, ansNum(A['top']));
    notesOut(N);
    return rowsDecide() ? 'failed' : 'done';
  }
  return 'failed';
}
