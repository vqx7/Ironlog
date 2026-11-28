/* The first phase of the account's rows: the documents decide what the log is, and a pass makes the rows say what
   the log says, record by record, after each sync of the documents, and checks once a day that they do. A pass
   compares the log with the rows as the notes hold them and asks the account only where one differs; what the
   account changed, or holds as the later copy, is left alone for a while before the log's copy goes over it. */

import { APP_VERSION, DISPLAY_VERSION } from './config';
import { today, uid } from './util';
import { rec } from './records';
import type { Rec } from './records';
import { cloud, state } from './store';
import type { CloudRows, RowIn } from './store';
import { device } from './storage';
import {
  LEVEL,
  NO_TABLE,
  ansNum,
  ansText,
  blockedNow,
  ctxNow,
  dayNow,
  found,
  heldText,
  keyOf,
  notesDigest,
  notesFor,
  notesOut,
  offWhy,
  placeOf,
  rowsDecide,
  said,
  send,
  soon,
  sumOf,
  takeIn,
  turnOff
} from './rowsnotes';
import type { Held, Notes } from './rowsnotes';
import { bodyOf, copyOf, keysOf, logNow, mineText, pause, timeOf, warm } from './rowslog';
import type { Mine } from './rowslog';

/** How long a record the account holds differently is left alone before the log's copy is sent over it (below), in milliseconds. */
const WAIT_MS = 60000;
/** The level an account's first layout says: the first phase's, whatever this build's own, so a phone still on a
    first-phase build syncs the account as before. */
const FIRST_LEVEL = 1;
/** What was last sent as it stood for a record the account then did not take, by key: the same is not sent as it stands again (it waits, then goes over the account's). */
const tried = new Map<string, string>();

/** How long a document's writer counts as one of the account's devices since it wrote, in milliseconds (30 days, as the switch reads it). */
const WRITER_MS = 30 * 86400000;
/** Whether a device that writes no row of its own has written a document in the last 30 days, as the last whole read found them. */
function rowlessWriter(N: Notes, writers: Readonly<Record<string, { dev: string; at: number }>>): boolean {
  const now = Date.now();
  return Object.values(writers).some(
    w => now - w.at <= WRITER_MS && w.dev !== cloud.devId && !N.rows['device/' + w.dev]
  );
}

/* ---------- one pass ---------- */

/** Whether the account's row says what the log says of a record: where it is, its copy, and its time or the day it was deleted. */
function inStep(m: Mine | undefined, h: Held | undefined): boolean {
  if (!m) return !h || placeOf(h) === 'good';
  if (!h || placeOf(h) !== m.place || h.s !== m.s) return false;
  // In the log: the same copy, and no later time for it in the documents than the row's (two phones that made the same edit: the row takes the later time, as the documents did).
  if (m.place === 'log') return timeOf(m) <= h.t;
  return h.day === (m.day || '') && h.clash === (m.clash === true);
}
/** The version a copy is sent with: the time the documents hold for it, the app's own write counted where that time has not moved; `over`: later than everything the account holds, for a copy the documents kept against the order of the times. */
function versionOf(t: number, h: Held | undefined, over: boolean): { t: number; dev: string; a: number } {
  if (over && h) return { t: Math.max(Date.now(), h.t + 1), dev: cloud.devId || '', a: 0 };
  if (h && t === h.t) return { t: h.t, dev: h.dev, a: h.a + 1 };
  return { t, dev: '', a: 0 };
}
/** Whether the account would take the log's copy of a record as it is sent, with the time the documents hold for it: the account holds none, an earlier one, or the same one. */
function takes(m: Mine | undefined, h: Held | undefined): boolean {
  if (!m || !h) return true;
  const t = timeOf(m);
  if (m.place === 'trash') return h.s === m.s || t >= h.t;
  return t > h.t || (t === h.t && placeOf(h) === 'log');
}
/** The row that makes the account say what the log (its documents `ch`) says of the record keyed `k`; null when there is nothing to send. */
function rowFor(
  ch: Record<string, Rec>,
  k: string,
  m: Mine | undefined,
  h: Held | undefined,
  over: boolean
): RowIn | null {
  const made = h ? { over_t: h.t, over_dev: h.dev } : {};
  if (!m) {
    // The log no longer holds it, in its lists or in Recently deleted: deleted for good, the mark naming the copy the account holds.
    if (!h) return null;
    const cut = k.indexOf('/');
    return {
      kind: k.slice(0, cut),
      id: k.slice(cut + 1),
      body: null,
      t: h.t,
      dev: h.dev,
      a: h.a,
      gone_saw: h.t,
      gone_saw_dev: h.dev,
      gone_good: true,
      gone_t: Date.now(),
      gone_dev: cloud.devId || '',
      ...made
    };
  }
  const body = copyOf(ch, m);
  if (body === null) return null;
  const t = timeOf(m);
  if (m.place === 'log') {
    return { kind: m.kind, id: m.id, body, ...versionOf(t, h, over), ...made };
  }
  // In Recently deleted: the copy the account already holds keeps its version, and the mark names it.
  const v = h && h.s === m.s ? { t: h.t, dev: h.dev, a: h.a } : versionOf(t, h, over);
  return {
    kind: m.kind,
    id: m.id,
    body,
    ...v,
    gone_saw: v.t,
    gone_saw_dev: v.dev,
    gone_good: false,
    gone_t: over ? Date.now() : t || Date.now(),
    gone_dev: cloud.devId || '',
    gone_day: m.day || null,
    gone_clash: m.clash === true,
    ...made
  };
}

/** One pass: the log's records compared with the rows as the notes hold them and, where any differs, the account's
    rows read, compared again, and what still differs sent. A pass that finds nothing to do asks the account nothing. */
export async function mirrorPass(): Promise<void> {
  const R = cloud.db && cloud.db.rows;
  const C = ctxNow();
  const acct = cloud.uid;
  if (!R || !C || !acct || !cloud.on || offWhy() || blockedNow() || rowsDecide() || !device.ok) return;
  // Not in the stretch of work that ended the sync (this is called from there): the screen is drawn first.
  await pause();
  await warm();
  if (!cloud.on || cloud.uid !== acct) return;
  const ep = C.ep();
  const still = (): boolean =>
    cloud.on && cloud.uid === acct && C.ep() === ep && !offWhy() && !blockedNow() && !rowsDecide();
  // The documents are in step with the account: only then is the log what the rows should say.
  const quiet = (): boolean => cloud.status === 'synced' && !C.unsent();
  if (!quiet()) return;
  const { N, read } = notesFor(acct, ep);
  if (read) tried.clear();
  const day = today();
  let L = logNow(N);
  // A record that waited and now reads as its row does (the documents caught up) waits no longer.
  for (const k in N.wait)
    if (inStep(L.mine.get(k), N.rows[k])) {
      delete N.wait[k];
      tried.delete(k);
    }
  /* A record the documents took out that is back in the log, or that a device's mark has deleted, is explained; so is
     every one while a device that writes no rows of its own writes the documents (a build before the rows deletes
     without a mark, and holds the switch anyway). */
  const rowless = rowlessWriter(N, C.writers());
  for (const k in N.gone) {
    const h = N.rows[k];
    if (rowless || L.mine.has(k) || !h || placeOf(h) === 'good') delete N.gone[k];
  }
  const differs = (): boolean => {
    for (const k of keysOf(N, L)) if (!inStep(L.mine.get(k), N.rows[k])) return true;
    return false;
  };
  const daily = N.chk.day !== day || N.devDay !== day;
  if (!N.made || daily || differs()) {
    if (!(await takeIn(R, N))) {
      turnOff(NO_TABLE);
      return;
    }
    if (!still()) return;
    if (!N.made) {
      // The account's first rows: its layout, with an id of its own, so a copy restored later is known as one.
      const layout = JSON.stringify({ made: uid(), decides: 'docs', level: FIRST_LEVEL, gen: 1, at: 0 });
      const row: RowIn = { kind: 'meta', id: 'layout', body: layout, t: Date.now(), dev: cloud.devId || '', a: 0 };
      if (!(await send(R, N, [row]))) {
        turnOff(NO_TABLE);
        return;
      }
      if (!still()) return;
    }
    // The log may have moved while the account answered: it is read again, and compared only if still in step.
    if (!quiet()) {
      notesOut(N);
      return;
    }
    L = logNow(N);
    const now = Date.now();
    const out: RowIn[] = [];
    const sums = new Map<string, string>();
    const forced = new Set<string>();
    for (const k of keysOf(N, L)) {
      const m = L.mine.get(k),
        h = N.rows[k];
      if (inStep(m, h)) {
        delete N.wait[k];
        delete N.gone[k];
        tried.delete(k);
        continue;
      }
      /* A row the account changed since this phone last agreed with it waits from the read that brought it in
         (takeIn): it may be ahead of the documents this phone holds (another phone writes the document first, then
         the row). So does one the account would not take as the log holds it (the account's copy is the later one).
         If it still differs a minute on, and after a whole read of the documents since, the documents did decide
         otherwise, and the log's state is sent over the account's. */
      /* A record the documents took out of the log while its row still holds it, with no device's mark deleting it,
         waits too: the device that deleted it marks its row at its own next pass. If none has within the wait, no
         device deleted it, which is what the daily check is there to catch: it is a difference (`gone`). */
      if (!m && N.gone[k] !== undefined) N.wait[k] ??= N.gone[k] ?? now;
      const since = N.wait[k];
      const ripe = since !== undefined && now - since >= WAIT_MS && C.pulledAt() > since;
      /* Sent as it stands: a row this phone has not seen change since it last agreed with the log, which the account
         will take (the log moved, not the account); or, of a row that waits, only a copy the documents time later
         than the account's, once (the lifter changed it here since: the account is behind, not ahead). A record gone
         from the log, or one whose time is not later, is never sent over a row that waits before the wait is over. */
      /* A row deleted elsewhere whose mark names the very copy the log holds is ahead of the documents here, whatever
         time they give the copy (a copy put in Recently deleted keeps its version, which the documents do not): never
         sent over before the wait is over. */
      const stale = !!m && !!h && placeOf(h) !== 'log' && (m.s === h.s || m.s === h.gs) && m.place !== placeOf(h);
      const plain =
        since === undefined ? takes(m, h) : !!m && !stale && (!h || timeOf(m) > h.t) && tried.get(k) !== mineText(m);
      if (!plain && !ripe) {
        N.wait[k] ??= now;
        continue;
      }
      const r = rowFor(L.ch, k, m, h, !plain);
      if (!r) continue;
      out.push(r);
      if (m) sums.set(k, m.s);
      if (!plain) {
        forced.add(k);
        const gone = !m && N.gone[k] !== undefined;
        found(
          N,
          k,
          m
            ? 'the documents kept a copy the rows held a later version of; the log was sent over it'
            : gone
              ? 'the documents took out a record no device deleted; it was marked deleted'
              : 'the rows held a record the documents do not; it was marked deleted',
          mineText(m),
          h ? `${placeOf(h)} ${heldText(h)}` : 'no row',
          gone
        );
        delete N.gone[k];
      }
    }
    if (out.length && !(await send(R, N, out, sums))) {
      turnOff(NO_TABLE);
      return;
    }
    if (!still()) return;
    // What the account did not take as sent waits, as a row it changed does (above).
    for (const r of out) {
      const k = keyOf(r.kind, r.id);
      const m = L.mine.get(k);
      if (inStep(m, N.rows[k])) {
        delete N.wait[k];
        tried.delete(k);
        continue;
      }
      if (forced.has(k)) {
        const h = N.rows[k];
        found(N, k, 'the account did not take the copy sent over it', mineText(m), h ? heldText(h) : 'no row');
        N.wait[k] = Date.now();
      } else {
        tried.set(k, mineText(m));
        N.wait[k] ??= Date.now();
      }
    }
  }
  await draftRow(R, N);
  if (!still()) return;
  if (daily) {
    if (!Object.keys(N.wait).length && N.chk.day !== day) await check(R, N);
    if (!still()) return;
    await deviceRow(R, N);
  }
  if (still()) notesOut(N);
}
/** The workout in progress as its row: written over whatever the row holds (it changes with every tick, and the documents decide it). */
async function draftRow(R: CloudRows, N: Notes): Promise<void> {
  for (let n = 0; n < 2; n++) {
    const body = state.draft ? bodyOf(state.draft) : 'null';
    const h = N.rows['draft/draft'];
    if (h ? h.s === sumOf(body) : !state.draft) return;
    const row: RowIn = {
      kind: 'draft',
      id: 'draft',
      body,
      t: Math.max(cloud.editAt['draft'] || 0, h ? h.t + 1 : 1),
      dev: cloud.devId || '',
      a: 0,
      ...(h ? { over_t: h.t, over_dev: h.dev } : {})
    };
    try {
      await send(R, N, [row]);
      return;
    } catch (e) {
      // Another phone wrote the workout's row since this phone read it: its row is read, and this copy written over that.
      if (n || !/rows_draft_(stale|time)/.test(said(e))) throw e;
      if (!(await takeIn(R, N))) return;
      /* The read says the rows now decide (the account switched since this phone's last read): the copy just read is
         another phone's, made after the switch, and this phone takes it as the rows' when it crosses, never writes over it. */
      if (rowsDecide()) return;
    }
  }
}
/** The daily check: the account's one checksum over all its rows against the same worked out from the notes. A difference means the notes are not the account's rows: they are made again, and it is said. */
async function check(R: CloudRows, N: Notes): Promise<void> {
  const d = rec(await soon(R.digest()));
  if (!d) return;
  // Rows changed since this pass read them: checked at the next pass.
  if (ansNum(d['top']) !== N.n) return;
  const { n, sum } = notesDigest(N);
  if (ansNum(d['n']) === n && ansText(d['sum']) === sum) {
    if (N.chk.day !== today()) N.chk.clean++;
    N.chk.day = today();
    dayNow(N, today()).ok = true;
    return;
  }
  found(
    N,
    '',
    'the notes were not what the account holds; they were made again',
    `${n} rows`,
    `${ansNum(d['n'])} rows`
  );
  N.chk.day = today();
  N.rows = {};
  N.n = 0;
  if (!(await takeIn(R, N))) turnOff(NO_TABLE);
}
/** This phone's own row: its build and version, the level it syncs at, the day it was last here, how its checks
    stand and its last daily checks (`days`, which the switch reads, rowsgate.ts). Written once a day, and again the
    same day once a difference is found (found). */
async function deviceRow(R: CloudRows, N: Notes): Promise<void> {
  const id = cloud.devId;
  if (!id || N.devDay === today()) return;
  const body = JSON.stringify({
    build: APP_VERSION,
    ver: DISPLAY_VERSION,
    level: LEVEL,
    seen: today(),
    checked: N.chk.day,
    clean: N.chk.clean,
    diffs: N.chk.diffs,
    removed: N.chk.removed,
    days: N.days
  });
  if (await send(R, N, [{ kind: 'device', id, body, t: Date.now(), dev: id, a: 0 }])) N.devDay = today();
}
/** Whether the log's every record reads as its row in notes `N`, the workout in progress too, and nothing waits: the
    first phase's pass found the rows saying what the log says. The workout's row is written over whatever it holds, so
    one another phone wrote since (a set ticked there) differs from the workout here until the documents bring it. */
export function mirrorInStep(N: Notes): boolean {
  if (Object.keys(N.wait).length) return false;
  const d = N.rows['draft/draft'];
  if (d ? d.s !== sumOf(state.draft ? bodyOf(state.draft) : 'null') : !!state.draft) return false;
  const L = logNow(N);
  for (const k of keysOf(N, L)) if (!inStep(L.mine.get(k), N.rows[k])) return false;
  return true;
}
/** Forgets what was last sent and not taken: wherever the notes are forgotten (rowsOnForget). */
export function mirrorForget(): void {
  tried.clear();
}
