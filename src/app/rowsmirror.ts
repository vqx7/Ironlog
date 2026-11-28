/* The first phase of the account's rows: the documents decide what the log is, and a pass makes the rows say what
   the log says, record by record, after each sync of the documents, and checks once a day that they do. A pass
   compares the log with the rows as the notes hold them and asks the account only where one differs; what the
   account changed, or holds as the later copy, is left alone for a while before the log's copy goes over it. */

import { APP_VERSION } from './config';
import { today, uid } from './util';
import { rec } from './records';
import type { Rec } from './records';
import { md5 } from './md5';
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
  found,
  heldText,
  keyOf,
  notesFor,
  notesOut,
  offWhy,
  placeOf,
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
/** The last character a single UTF-16 unit holds. */
const UNIT_TOP = 0xffff;
/** What was last sent as it stood for a record the account then did not take, by key: the same is not sent as it stands again (it waits, then goes over the account's). */
const tried = new Map<string, string>();

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
  if (!R || !C || !acct || !cloud.on || offWhy() || blockedNow() || !device.ok) return;
  // Not in the stretch of work that ended the sync (this is called from there): the screen is drawn first.
  await pause();
  await warm();
  if (!cloud.on || cloud.uid !== acct) return;
  const ep = C.ep();
  const still = (): boolean => cloud.on && cloud.uid === acct && C.ep() === ep && !offWhy() && !blockedNow();
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
      const layout = JSON.stringify({ made: uid(), decides: 'docs', level: LEVEL, gen: 1, at: 0 });
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
        tried.delete(k);
        continue;
      }
      /* A row the account changed since this phone last agreed with it waits from the read that brought it in
         (takeIn): it may be ahead of the documents this phone holds (another phone writes the document first, then
         the row). So does one the account would not take as the log holds it (the account's copy is the later one).
         If it still differs a minute on, and after a whole read of the documents since, the documents did decide
         otherwise, and the log's state is sent over the account's. */
      const since = N.wait[k];
      const ripe = since !== undefined && now - since >= WAIT_MS && C.pulledAt() > since;
      /* Sent as it stands: a row this phone has not seen change since it last agreed with the log, which the account
         will take (the log moved, not the account); or, of a row that waits, only a copy the documents time later
         than the account's, once (the lifter changed it here since: the account is behind, not ahead). A record gone
         from the log, or one whose time is not later, is never sent over a row that waits before the wait is over. */
      const plain = since === undefined ? takes(m, h) : !!m && (!h || timeOf(m) > h.t) && tried.get(k) !== mineText(m);
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
        found(
          N,
          k,
          m
            ? 'the documents kept a copy the rows held a later version of; the log was sent over it'
            : 'the rows held a record the documents do not; it was marked deleted',
          mineText(m),
          h ? `${placeOf(h)} ${heldText(h)}` : 'no row'
        );
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
    }
  }
}
/** Two texts in the order of their bytes, as the account orders them: by code point, which a comparison of UTF-16 units is not for characters past U+FFFF. */
function bytesCmp(a: string, b: string): number {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.codePointAt(i) ?? 0,
      y = b.codePointAt(i) ?? 0;
    if (x !== y) return x < y ? -1 : 1;
    if (x > UNIT_TOP) i++;
  }
  return a.length < b.length ? -1 : 1;
}
/** The daily check: the account's one checksum over all its rows against the same worked out from the notes. A difference means the notes are not the account's rows: they are made again, and it is said. */
async function check(R: CloudRows, N: Notes): Promise<void> {
  const d = rec(await soon(R.digest()));
  if (!d) return;
  // Rows changed since this pass read them: checked at the next pass.
  if (ansNum(d['top']) !== N.n) return;
  const keys = Object.keys(N.rows).sort((a, b) => {
    const ca = a.indexOf('/'),
      cb = b.indexOf('/');
    return bytesCmp(a.slice(0, ca), b.slice(0, cb)) || bytesCmp(a.slice(ca + 1), b.slice(cb + 1));
  });
  const text = keys
    .map(k => {
      const h = N.rows[k];
      const cut = k.indexOf('/');
      return h
        ? [
            k.slice(0, cut),
            k.slice(cut + 1),
            h.t,
            h.dev,
            h.a,
            h.s,
            h.saw === null ? '' : h.saw,
            h.saw === null ? '' : h.sawDev,
            h.good ? 1 : 0
          ].join('\x1f')
        : '';
    })
    .join('\x1e');
  if (ansNum(d['n']) === keys.length && ansText(d['sum']) === md5(text)) {
    if (N.chk.day !== today()) N.chk.clean++;
    N.chk.day = today();
    return;
  }
  found(
    N,
    '',
    'the notes were not what the account holds; they were made again',
    `${keys.length} rows`,
    `${ansNum(d['n'])} rows`
  );
  N.chk.day = today();
  N.rows = {};
  N.n = 0;
  if (!(await takeIn(R, N))) turnOff(NO_TABLE);
}
/** This phone's own row: its build, the level it syncs at, the day it was last here and how its checks stand. Written once a day at most. */
async function deviceRow(R: CloudRows, N: Notes): Promise<void> {
  const id = cloud.devId;
  if (!id || N.devDay === today()) return;
  const body = JSON.stringify({
    build: APP_VERSION,
    level: LEVEL,
    seen: today(),
    checked: N.chk.day,
    clean: N.chk.clean,
    diffs: N.chk.diffs,
    removed: N.chk.removed
  });
  if (await send(R, N, [{ kind: 'device', id, body, t: Date.now(), dev: id, a: 0 }])) N.devDay = today();
}
/** Forgets what was last sent and not taken: wherever the notes are forgotten (rowsOnForget). */
export function mirrorForget(): void {
  tried.clear();
}
