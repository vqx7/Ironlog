/* Whether an account may switch to letting its rows decide, read by a phone of the first phase once its daily check
   has run (V, 2026-11-25; the account switches by itself, 2026-11-27). Every device of the account seen in the last
   30 days runs a build that lets the rows decide, and its last daily checks were clean on CLEAN_DAYS days of their
   own, the newest within the last two days. A device is seen by its own row and as the writer of a document read at
   the last whole read of the documents, which is how a device on a build that writes no row of its own is seen. A
   device no longer used is forgotten by a tap (Forget it): its row is marked so, as a later version of the row, and
   it counts again once it is opened. Where every device holds, the phone switches the account (switchNow), which
   checks once more, at that moment, that the log, the rows and the documents are equal. */

import { CLEAN_DAYS } from './config';
import { daysBetween, iso, today } from './util';
import { cloud } from './store';
import { ENV, device } from './storage';
import { fmtDate } from './format';
import { blockedNow, ctxNow, layoutNow, notesFor, notesOut, offWhy, placeOf, rowsDecide, send } from './rowsnotes';
import type { Day, Notes } from './rowsnotes';
import { switchNow } from './rowsswitch';

/** How long a device counts as one of the account's since it was last seen, in days. */
const SEEN_DAYS = 30;
/** The newest of a device's clean checks is at most this many days before today. */
const RECENT_DAYS = 1;
/** A day's length, in milliseconds. */
const DAY_MS = 86400000;
/** The level of sync a device's build needs for the switch: one that lets the rows decide. */
const SWITCH_LEVEL = 2;

/** A device that keeps the account from switching: its id, whether its build cannot let the rows decide (`older`),
    when it was last seen, and its clean days so far. */
interface Holder {
  dev: string;
  older: boolean;
  seen: number;
  have: number;
}
/** How the switch stands: this device's clean days and those needed, the device that holds it (none: every other
    device is ready), and whether the account switches now. */
interface Gate {
  have: number;
  need: number;
  holder: Holder | null;
  open: boolean;
}
/** A document's last writer as a whole read of the documents found it: the device's id and the time it wrote. */
interface Writer {
  dev: string;
  at: number;
}

/** Whether a daily check was clean: the account's checksum matched and nothing was found that day. */
const clean = (D: Day): boolean => D.ok && D.diffs === 0 && D.gone === 0;
/** The clean checks at the end of a device's day log, at most `need`: none when its newest check is older than the
    last two days, so a device last checked long ago never reads as ready. */
function cleanDays(days: readonly Day[], day: string, need: number): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0 && n < need; i--) {
    const D = days[i];
    if (!D) break;
    if (n === 0 && daysBetween(D.d, day) > RECENT_DAYS) return 0;
    if (!clean(D)) break;
    n++;
  }
  return n;
}

/** How the switch stands for this device (`me`), from its notes, the documents' last writers, today and the time now
    (above). */
function gateIn(
  N: Notes,
  writers: Readonly<Record<string, Writer>>,
  me: string,
  day: string,
  now: number,
  need: number
): Gate {
  const have = need ? cleanDays(N.days, day, need) : 0;
  const holders: Holder[] = [];
  const recent = (t: number): boolean => t > 0 && now - t <= SEEN_DAYS * DAY_MS;
  // Each other device by its own row: its time is when it last wrote it.
  const rowed = new Set<string>();
  for (const k in N.rows) {
    if (!k.startsWith('device/')) continue;
    const id = k.slice('device/'.length);
    const h = N.rows[k];
    if (!h || id === me || placeOf(h) !== 'log') continue;
    rowed.add(id);
    const D = N.devs[id];
    if (D && D.forgot !== null) continue;
    if (!recent(h.t)) continue;
    if (!D || D.level < SWITCH_LEVEL) holders.push({ dev: id, older: true, seen: h.t, have: 0 });
    else {
      const got = need ? cleanDays(D.days, day, need) : 0;
      if (got < need) holders.push({ dev: id, older: false, seen: h.t, have: got });
    }
  }
  // A device seen only as the writer of a document, with no row of its own at the level the switch needs: one on an
  // older version, until it is forgotten as it was last seen then.
  for (const w of Object.values(writers)) {
    if (w.dev === me || !recent(w.at)) continue;
    const D = N.devs[w.dev];
    if (D && D.forgot !== null && w.at <= D.forgot) continue;
    if (rowed.has(w.dev) && D && D.forgot === null) continue;
    if (!holders.some(x => x.dev === w.dev)) holders.push({ dev: w.dev, older: true, seen: w.at, have: 0 });
  }
  holders.sort((a, b) => b.seen - a.seen || (a.dev < b.dev ? -1 : 1));
  const holder = holders[0] || null;
  return { have, need, holder, open: have >= need && !holder };
}

/** The documents' last writers as the document sync last read them (Ctx.writers); none before a whole read. */
const writersNow = (): Readonly<Record<string, Writer>> => {
  const C = ctxNow();
  return C ? C.writers() : {};
};
/** Whether "Switch back" asked that no device switch the account again (the layout's `hold`). */
const heldBack = (): boolean => (layoutNow() || {})['hold'] === true;

/** How the switch stands on this phone now, for Settings > "More"; null where there is nothing to switch (the rows
    decide, or the account cannot be synced by this build). */
export function gateNow(): Gate | null {
  const C = ctxNow();
  if (!C || !cloud.uid || rowsDecide() || blockedNow() || heldBack()) return null;
  const { N } = notesFor(cloud.uid, C.ep());
  return gateIn(N, writersNow(), cloud.devId || '', today(), Date.now(), CLEAN_DAYS[ENV]);
}
/** After a pass of the first phase: on a day whose daily check has run, the account is switched where the gate holds
    (decision 4: by itself, no tap). */
export async function gatePass(): Promise<boolean> {
  const C = ctxNow();
  if (!C || !cloud.uid || !cloud.on || offWhy() || rowsDecide() || blockedNow() || heldBack() || !device.ok)
    return false;
  const { N } = notesFor(cloud.uid, C.ep());
  if (N.chk.day !== today()) return false;
  const G = gateIn(N, writersNow(), cloud.devId || '', today(), Date.now(), CLEAN_DAYS[ENV]);
  return G.open ? switchNow() : false;
}

/** Forget it: the device keyed `dev` no longer counts toward the switch until it is opened again. Its row is written
    as a later version that says so (the count of the app's writes raised), so every phone takes it as any change and
    none reads it as a difference; a device seen only by a document gets a row that says so. True once written. */
export async function forgetDevice(dev: string): Promise<boolean> {
  const R = cloud.db && cloud.db.rows;
  const C = ctxNow();
  if (!R || !C || !cloud.uid || !cloud.on || rowsDecide()) return false;
  const { N } = notesFor(cloud.uid, C.ep());
  const k = 'device/' + dev;
  const h = N.rows[k];
  const wrote = Object.values(writersNow()).filter(x => x.dev === dev);
  const seen = Math.max(h ? h.t : 0, ...wrote.map(x => x.at));
  if (!seen) return false;
  const D = N.devs[dev];
  const body = JSON.stringify({ level: D ? D.level : 0, ver: D ? D.ver : '', forgot: seen, seen: iso(new Date(seen)) });
  const row = h
    ? { kind: 'device', id: dev, body, t: h.t, dev: h.dev, a: h.a + 1 }
    : { kind: 'device', id: dev, body, t: seen, dev, a: 0 };
  if (!(await send(R, N, [row]))) return false;
  notesOut(N);
  return true;
}
/** The day a device last seen at time `t` was last seen, as a line says it ("Nov 26"). */
export const seenDay = (t: number): string => fmtDate(iso(new Date(t)));
