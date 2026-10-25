/* The save on this device (phase 4, r56; moved from the legacy script's
   storage part, changing nothing it does): the keys every stored value lives
   under, whether storage can be written, reading the save at start, the error
   log Settings can copy, Undo's steps and their copy in IndexedDB, the
   settings kept aside while the demo is loaded, a log kept aside for another
   account (r56.1, in IndexedDB too), and the two readings the
   menu button makes of all that (backupDue, saveStateNow). Writing the save
   is in sync.ts (saveNow), since every write goes on to the account.
   Nothing here runs on import: storageStart() runs what the legacy part
   ran when the page loaded, from the start of the legacy script. */

import { APP_VERSION, STORAGE_ID } from './config';
import { daysBetween, today } from './util';
import { arr, fixId, parseJson, rec } from './records';
import type { Rec } from './records';
import type { LogEntry } from './types';
import { realCount } from './chunks';
import { normalize } from './normalize';
import { cloud, fx, setState, state, ui } from './store';
import type { State } from './store';

/* ---------- the keys ---------- */

/* The preview build (r24) is served from the same site as the live app, so
   the two would otherwise share this browser's storage: a preview could
   rewrite the live log, or migrate it forward to a shape the live build
   cannot read. Every stored key here is derived from KEY, so a different KEY
   (and undo database) keeps the preview's log apart. Only scripts/build.js
   --preview sets IRONLOG_ENV, in the page's head, before any module runs;
   in Node (tests/engine.js bundles every module) there is no window. */
/** Which build this is, live or preview: the flag the build's head script sets. */
export const ENV: 'preview' | 'live' =
  typeof window !== 'undefined' && window.IRONLOG_ENV === 'preview' ? 'preview' : 'live';
/** The key the log is saved under; every other key is built from it. */
export const KEY = ENV === 'preview' ? `${STORAGE_ID}-preview.v1` : `${STORAGE_ID}.v1`;
/** The error log's key. */
export const LOGK = KEY + '.log';
/** Week or Month in This week on Today (r26), per device. */
export const WKVIEW_KEY = KEY + '.wkView';
/** How many weeks Stats' By region averages (r31), per device. */
export const REGION_KEY = KEY + '.regionWk';
/** The muscle map's view, flat or 3D (r27), per device. */
export const MAPVIEW_KEY = KEY + '.mapView';
/** Today's lines dismissed on this device: Set up sync (acctBar), Get the app (installBar), the new icon (r25). */
export const ACCT_LATER = KEY + '.acctLater',
  INSTALL_LATER = KEY + '.installLater',
  ICON_NOTE = KEY + '.icon25';
/** The first pages on this device: the account page passed (Continue without an account), and held open after a sign-out (r33). */
export const OB_ACCT = KEY + '.obAcct',
  OB_OUT = KEY + '.signedOut';
/** A weigh-in asked about on this device: snoozed until a date (Later), and the session's first ask answered (Not now). */
export const BWSNOOZE_KEY = KEY + '.bwSnooze',
  BWASK_KEY = KEY + '.bwAsk';
/** The settings kept aside while the demo is loaded (demoKeep). */
export const DEMOSET_KEY = KEY + '.demoSettings';
/** The start of the keys a preview of r56.1 kept a log aside under, before it moved to IndexedDB (asideStart). */
export const ASIDE_KEY = KEY + '.aside.';

/* ---------- where the save stands ---------- */

/** Where the save on this device stands, read by the screens and the sync. */
export interface Device {
  /** Whether localStorage took the last write: false until a write succeeds again (saveStateNow says so). */
  ok: boolean;
  /** Whether storage passed its check at start. When not, nothing is ever written: the old contents were never read. */
  boot: boolean;
  /** Whether a readable save was found at start (the sync's first pull adopts the account's copy when not). */
  hadLocal: boolean;
  /** Whether this device had a log before this page first ran, read before any save (r25: only an existing install still has the old icon). */
  hadLog: boolean;
  /** The text this tab last wrote or adopted. Another tab's change is merged against it (the storage listener, sync.ts). */
  lastSaved: string | null;
}
export const device: Device = { ok: true, boot: true, hadLocal: false, hadLog: false, lastSaved: null };

/** Clears a timer that may not be set (a browser takes null, TypeScript's types do not). */
export const clearTimer = (t: number | null): void => {
  if (t != null) clearTimeout(t);
};

/* ---------- the error log ---------- */

/* Diagnostics log: the last 60 errors, kept in this browser only. Errors that
   used to be swallowed silently land here, and Settings can copy them. Filled
   at start from LOGK, with the entries as they were saved (r56.1 checks each,
   PENDING 305). */
/** The last 60 errors on this device, oldest first. */
export const logBuf: LogEntry[] = [];
/** An entry of the error log as saved, or null when it is not one (r56.1, PENDING 305). */
const logEntryIn = (v: unknown): LogEntry | null => {
  const E = rec(v);
  if (!E || typeof E.t !== 'string' || typeof E.a !== 'string' || typeof E.m !== 'string' || typeof E.v !== 'string')
    return null;
  return { t: E.t, a: E.a, m: E.m, v: E.v, ...(typeof E.s === 'string' ? { s: E.s } : {}) };
};
/* A URL's query and fragment, cut from what the log keeps (r47). The log
   goes out with a problem report, and the page's own URL holds a reset
   link's token in its fragment for a moment after the link is opened; a stack
   frame carries that URL, and an error message can. Only the part after ? or #
   of a URL goes, up to the frame's :line:column, so the file and line stay and
   ordinary words with a ? or # in them are left alone. */
/** Text with the query and fragment of any URL in it cut out. */
export const logCut = (t: unknown): string =>
  String(t).replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#)]*)[?#](?:[^\s):]|:(?!\d))*/gi, '$1');
/** Records an error under an area, with the first lines of its stack, in the log Settings can copy. */
export function log(area: string, err: unknown): void {
  try {
    const E = rec(err);
    const m = E && E.message ? E.message : E ? JSON.stringify(err) : String(err);
    // Where it broke, not only what it said (r47): the first lines of the stack travel with a problem report, so a crash can be found in the code without the phone.
    const st = E && typeof E.stack === 'string' ? logCut(E.stack.split('\n').slice(0, 4).join('\n')).slice(0, 400) : '';
    logBuf.push({
      t: new Date().toISOString(),
      a: area,
      m: logCut(m).slice(0, 300),
      v: APP_VERSION,
      ...(st ? { s: st } : {})
    });
    while (logBuf.length > 60) logBuf.shift();
    localStorage.setItem(LOGK, JSON.stringify(logBuf));
  } catch (e) {
    /* logging must never throw */
  }
}

/* ---------- Undo's steps ---------- */

/** One step Undo can take back: the log before the action and right after it (captured at the next save), a direct reversal while the session is open, and when. */
export interface UndoStep {
  pre: string;
  post: string | null;
  inv: (() => boolean) | null;
  t: number;
}
/* Undo steps: the state before a destructive action, and the state right
   after it (captured at the next save). See snapshot() and ACT.undo. */
/** The steps Undo can take back, oldest first; UNDO_MAX at most. */
export const undoStack: UndoStep[] = [],
  UNDO_MAX = 20;
/* Undo history survives a reload and a closed app (item 20). It holds whole
   copies of the log, so it lives in IndexedDB, whose quota is separate from
   and much larger than localStorage's: it can never crowd out the main save.
   Entries older than a week are dropped. The reversal functions some
   in-session entries carry cannot be stored; after a reload those entries
   undo through the three-way merge, which gives the same result. Best
   effort: without IndexedDB, Undo works as before, for this visit only. */
const UNDO_DB = ENV === 'preview' ? `${STORAGE_ID}-preview-undo` : `${STORAGE_ID}-undo`,
  UNDO_TTL = 7 * 864e5;
let undoDbP: Promise<IDBDatabase | null> | null = null,
  undoT: number | null = null;
function undoDb(): Promise<IDBDatabase | null> {
  if (!undoDbP)
    undoDbP = new Promise(res => {
      try {
        const r = indexedDB.open(UNDO_DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (e) {
        // No IndexedDB here (a private window, an old browser): Undo keeps this visit's steps in memory alone.
        res(null);
      }
    });
  return undoDbP;
}
/** Writes the steps to IndexedDB once the taps pause. */
export function undoPersist(): void {
  clearTimer(undoT);
  undoT = setTimeout(async () => {
    const db = await undoDb();
    if (!db) return;
    try {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(
        undoStack.map(e => ({ pre: e.pre, post: e.post, t: e.t || Date.now() })),
        'stack'
      );
    } catch (e) {
      log('undo-save', e);
    }
  }, 400);
}
/** Reads the steps saved by an earlier visit, those under a week old, once at start. */
export async function undoRestore(): Promise<void> {
  const db = await undoDb();
  if (!db) return;
  const list = await new Promise<unknown>(res => {
    try {
      // A request's result is typed any; the cast reads it as the unknown value it is.
      const q = db.transaction('kv').objectStore('kv').get('stack') as IDBRequest<unknown>;
      q.onsuccess = () => res(q.result || []);
      q.onerror = () => res([]);
    } catch (e) {
      // The store cannot be read (a database another build made): no steps to restore.
      res([]);
    }
  });
  if (undoStack.length) return;
  const now = Date.now();
  for (const e of arr(list) || []) {
    const E = rec(e);
    if (E && typeof E.pre === 'string' && now - (Number(E.t) || 0) < UNDO_TTL)
      undoStack.push({ pre: E.pre, post: typeof E.post === 'string' ? E.post : null, inv: null, t: Number(E.t) });
  }
  if (undoStack.length && ui.tab === 'settings' && !ui.modal) fx.rerenderKeepScroll();
}
/** Drops every step, here and in IndexedDB (a restore, a sign-in that takes the account's log). */
export function undoForget(): void {
  undoStack.length = 0;
  clearTimer(undoT);
  undoDb().then(db => {
    if (!db) return;
    try {
      db.transaction('kv', 'readwrite').objectStore('kv').delete('stack');
    } catch (e) {
      log('undo-clear', e);
    }
  });
}
/* inv, when given, reverses the action directly on the current state and
   returns true, or returns false when things have moved on too far, in which
   case Undo falls back to the merge. Used for the in-session actions, where
   a set logged a second later touches the same record. */
/** Keeps the log as it is before a destructive action, so Undo can put it back. */
export function snapshot(inv?: (() => boolean) | null): void {
  try {
    undoStack.push({
      pre: JSON.stringify(state),
      post: null,
      inv: typeof inv === 'function' ? inv : null,
      t: Date.now()
    });
  } catch (e) {
    // A log JSON cannot write is not kept as a step: the action goes ahead without Undo, as before the move.
    return;
  }
  while (undoStack.length > UNDO_MAX) undoStack.shift();
  undoPersist();
}
/* The first save after a snapshot is the action itself; remember the result,
   so Undo can tell the action apart from anything logged after it. */
/** Records the log right after the last snapshotted action, at its first save. */
export function capturePost(): void {
  const e = undoStack[undoStack.length - 1];
  if (e && e.post == null) {
    try {
      e.post = JSON.stringify(state);
      undoPersist();
    } catch (x) {
      log('undo', x);
    }
  }
}

/* ---------- reading the save ---------- */

/* A screen's small choice kept on this phone only (By region's weeks, the
   map's view, a line dismissed on Today): read and written here, as every
   stored value is. */
/** A choice kept on this phone, as saved, or null. */
export function prefGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    // Private mode or blocked storage refuses the read: the screen's default.
    return null;
  }
}
/** Keeps a choice on this phone; false when storage refused it (it then lasts this visit only). */
export function prefSet(key: string, v: string): boolean {
  try {
    localStorage.setItem(key, v);
    return true;
  } catch (e) {
    // Private mode or a full store refuses the write: the screen keeps the choice for this visit.
    return false;
  }
}
/** Forgets a choice kept on this phone. */
export function prefDel(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    // Blocked storage keeps nothing to forget.
  }
}
/** Whether localStorage can be written at all. */
export function storageTest(): boolean {
  try {
    localStorage.setItem('__il', '1');
    localStorage.removeItem('__il');
    return true;
  } catch (e) {
    // Storage blocked (a private window with it off): the app runs without it for this visit.
    return false;
  }
}
/** The save on this device, read through normalize(), or a new log. */
export function load(): State {
  device.ok = device.boot = storageTest();
  if (!device.ok) return normalize(null);
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
    if (raw) {
      const st = normalize(parseJson(raw));
      device.hadLocal = true;
      device.lastSaved = raw;
      return st;
    }
  } catch (e) {
    /* An unreadable save used to be replaced by a fresh state on the next
       save, destroying it. Keep the raw text aside so it can be recovered. */
    log('load', e);
    device.hadLocal = false;
    try {
      if (raw) localStorage.setItem(UNREAD_KEY, raw);
    } catch (e2) {
      log('load', e2);
    }
  }
  return normalize(null);
}

/** The key a save this build could not read is kept under (load, above), so a later build or the lifter can still recover it. */
const UNREAD_KEY = KEY + '.unreadable';
/** The save kept aside because it could not be read at start, as text, or '' when there is none. */
export function unreadableRaw(): string {
  try {
    return localStorage.getItem(UNREAD_KEY) || '';
  } catch (e) {
    // Storage this browser refuses: nothing kept aside can be read, as before the move.
    return '';
  }
}
/** Deletes the save kept aside (Forget it, or once a restore has read it). */
export function unreadableForget(): void {
  try {
    localStorage.removeItem(UNREAD_KEY);
  } catch (e) {
    // Storage this browser refuses: there is nothing kept aside to delete.
  }
}
/** Empties the error log, here and on this device (Settings, Clear log). */
export function logClear(): void {
  logBuf.length = 0;
  try {
    localStorage.removeItem(LOGK);
  } catch (e) {
    log('diag', e);
  }
}

/* ---------- the settings kept aside for the demo ---------- */

// The settings are taken when the demo goes in (not again while it is still
// loaded, which would keep what was changed while looking around), and are
// put back only while this is still a first run: once a routine is picked,
// a session is logged or an account brings a log, every setting is the
// person's own, and a snapshot left from earlier is thrown away unused.
/** Whether this is still a first run: nothing picked, logged or signed in, so the demo's settings are not yet anyone's own. */
export const demoFirstRun = (): boolean => !state.settings.onboarded && !realCount(state) && !state.draft;
/** Keeps the settings aside when the demo is loaded on a first run. */
export function demoKeep(): void {
  if (!demoFirstRun() || state.sessions.some(x => x.demo)) return;
  try {
    localStorage.setItem(DEMOSET_KEY, JSON.stringify(state.settings));
  } catch (e) {
    log('demo', e);
  }
}
/** Puts the settings kept aside back when the demo leaves a first run. */
export function demoRestore(): void {
  let saved: unknown = null;
  try {
    const t = localStorage.getItem(DEMOSET_KEY);
    saved = t ? parseJson(t) : null;
    localStorage.removeItem(DEMOSET_KEY);
  } catch (e) {
    log('demo', e);
  }
  const S = rec(saved);
  if (!S || !demoFirstRun()) return;
  // Facts about this device and its backups are not part of looking around.
  const keep = {
    onboarded: state.settings.onboarded,
    lastExport: state.settings.lastExport,
    calSnooze: state.settings.calSnooze
  };
  state.settings = normalize({ ...state, settings: { ...S, ...keep } }).settings;
}

/* ---------- a log kept aside for another account (r56.1, PENDING 328 b) ---------- */

/* A phone signed in to one account that holds another account's log, told
   to use this account's log, keeps the other's aside first, whole, with the
   sync notes that go with it, so nothing only this phone holds is lost: the
   next sign-in to that account on this phone starts from it (asideOf) and
   syncs as a continuation. Your data lists what is kept (asideList), and
   Erase everything clears it with the rest (asideClear).
   A log kept aside is a whole copy of a log, so it lives in IndexedDB, as
   Undo's copies do: that room is separate from localStorage's and far
   larger, so a log kept aside never crowds out the save of the log in use,
   then or as that log grows (PENDING 333, tests/room.js: kept in
   localStorage, a log of 40% of the room kept aside made the save of a log
   of 62% of it fail, and every save after it). Your data's line reads a list
   held in memory (asideIdx), read from the database at start and kept
   current by every change here. */
/** What is kept aside for an account: its log, its sync notes, and when. */
export interface Aside {
  at: number;
  state: State;
  meta: unknown;
  editAt: unknown;
  last: unknown;
}
/** A log kept aside, as Your data lists it: its account, its sessions, and when it was kept. */
export interface AsideEntry {
  acct: string;
  sessions: number;
  at: number;
}
const ASIDE_DB = ENV === 'preview' ? `${STORAGE_ID}-preview-aside` : `${STORAGE_ID}-aside`;
let asideDbP: Promise<IDBDatabase | null> | null = null;
/** The logs kept aside, as Your data lists them (above). */
const asideIdx: AsideEntry[] = [];
function asideDb(): Promise<IDBDatabase | null> {
  if (!asideDbP)
    asideDbP = new Promise(res => {
      try {
        const r = indexedDB.open(ASIDE_DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (e) {
        // No IndexedDB here (an old browser): nothing can be kept aside, so the lifter is told there is no room.
        res(null);
      }
    });
  return asideDbP;
}
/** One write to the aside database, true once it is on the device (the transaction complete, not only the request). */
async function asideWrite(run: (s: IDBObjectStore) => void): Promise<boolean> {
  const db = await asideDb();
  if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction('kv', 'readwrite');
      tx.oncomplete = () => res(true);
      tx.onerror = () => res(false);
      tx.onabort = () => {
        log('aside', tx.error || new Error('the write was not kept'));
        res(false);
      };
      run(tx.objectStore('kv'));
    } catch (e) {
      log('aside', e);
      res(false);
    }
  });
}
/** A cursor over the aside database as it is read: a stored value is unknown until checked (the browser types it any). */
type AsideCursor = { key: IDBValidKey; value: unknown; continue(): void } | null;
/** Every entry of the aside database, by account, or none when it cannot be read. */
async function asideAll(): Promise<[string, Rec][]> {
  const db = await asideDb();
  if (!db) return [];
  return new Promise(res => {
    try {
      const out: [string, Rec][] = [];
      const q = db.transaction('kv').objectStore('kv').openCursor();
      const step = (c: AsideCursor): void => {
        if (!c) return res(out);
        const R = rec(c.value);
        if (typeof c.key === 'string' && R) out.push([c.key, R]);
        c.continue();
      };
      q.onsuccess = () => step(q.result);
      q.onerror = () => res(out);
    } catch (e) {
      log('aside', e);
      res([]);
    }
  });
}
/** Notes in the list a log kept aside for an account, in place of any it had. */
function indexAside(e: AsideEntry): void {
  const i = asideIdx.findIndex(x => x.acct === e.acct);
  if (i >= 0) asideIdx.splice(i, 1);
  asideIdx.push(e);
}
/** Keeps a log (its text, as the caller took it) and the notes given aside for the account they belong to: true once it is on the device. */
export async function keepAside(
  acct: string,
  text: string,
  notes: { meta: unknown; editAt: unknown; last: unknown }
): Promise<boolean> {
  const id = fixId(acct),
    at = Date.now(),
    noted = JSON.stringify(notes);
  const S = rec(parseJson(text));
  const sessions = S ? (arr(S.sessions) || []).length : 0;
  const ok = await asideWrite(s => {
    s.put({ at, sessions, state: text, notes: noted }, id);
  });
  if (ok) indexAside({ acct: id, sessions, at });
  return ok;
}
/** The log kept aside for an account, read through normalize(), or null when there is none; it stays kept until dropAside. */
export async function asideOf(acct: string): Promise<Aside | null> {
  const id = fixId(acct);
  const hit = (await asideAll()).find(([k]) => k === id);
  const A = hit ? hit[1] : null;
  if (!A || typeof A.state !== 'string') return null;
  const N = rec(typeof A.notes === 'string' ? parseJson(A.notes) : null) || {};
  return { at: Number(A.at) || 0, state: normalize(parseJson(A.state)), meta: N.meta, editAt: N.editAt, last: N.last };
}
/** Removes the log kept aside for an account, once it is the log in use and saved on the device. */
export async function dropAside(acct: string): Promise<void> {
  const id = fixId(acct);
  if (await asideWrite(s => s.delete(id))) {
    const i = asideIdx.findIndex(x => x.acct === id);
    if (i >= 0) asideIdx.splice(i, 1);
  }
}
/** The logs kept aside on this device: each account, its sessions and when it was kept. */
export function asideList(): AsideEntry[] {
  return asideIdx.map(e => ({ ...e }));
}
/** Removes every log kept aside (Erase everything). */
export function asideClear(): void {
  asideIdx.length = 0;
  void asideWrite(s => s.clear());
}
/* A preview of r56.1 before PENDING 333 kept the log aside in localStorage,
   under ASIDE_KEY and the account; such a copy is moved into the database at
   start, then removed, so it is neither lost nor left taking the log's room. */
/** Reads the list of logs kept aside at start, after moving any a preview kept in localStorage; Your data is redrawn if it is open. */
async function asideStart(): Promise<void> {
  const old: [string, string][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const v = k && k.startsWith(ASIDE_KEY) ? localStorage.getItem(k) : null;
      if (k && v) old.push([k, v]);
    }
  } catch (e) {
    log('aside', e);
  }
  for (const [k, v] of old) {
    const A = rec(parseJson(v));
    if (!A || !A.state) continue;
    const moved = await keepAside(k.slice(ASIDE_KEY.length), JSON.stringify(A.state), {
      meta: A.meta,
      editAt: A.editAt,
      last: A.last
    });
    if (moved)
      try {
        localStorage.removeItem(k);
      } catch (e) {
        log('aside', e);
      }
  }
  for (const [acct, A] of await asideAll())
    indexAside({ acct, sessions: Number(A.sessions) || 0, at: Number(A.at) || 0 });
  if (asideIdx.length && ui.tab === 'settings' && !ui.modal) fx.rerenderKeepScroll();
}

/* ---------- the menu button's two readings ---------- */

/* Everything lives in this one browser, so a backup is the only thing that
   survives a cleared cache or a new phone. Once real sessions exist, the
   header says so until a backup has been exported or copied in the last week.
   Demo data does not count. */
/** Whether the menu should say a backup is due. */
export function backupDue(): boolean {
  /* Signed in and synced, the account is where the log lives, as in any
     app; deletions are covered by Recently deleted (30 days) and Undo (7),
     so no reminder (r34.2, from the review: the menu said "Backup due" to a
     synced account while the first page says the account backs it up). */
  if (!state.sessions.some(s => !s.demo)) return false;
  const synced = cloud.on && cloud.last && Date.now() - cloud.last < 7 * 864e5;
  if (synced) return false;
  if (!device.ok && !synced) return false;
  const le = state.settings.lastExport;
  // Weekly when this device holds the only copy: a phone that is lost or wiped
  // loses everything since the last backup.
  return !le || daysBetween(le, today()) > (synced ? 30 : 7);
}
/* The menu button (r27) ends the top bar on every tab: a person for the
   account, with a dot for the save state (green synced, blue syncing, amber
   when something wants attention, red when nothing is being saved; none when
   the log is simply saved on this device). Wider screens show the words too.
   A tap opens the menu: account, Report a problem, the Guide, your data. */
/** The save state the menu button shows: its class (the dot's colour) and its words. */
export function saveStateNow(): { cls: string; txt: string } {
  let cls = '',
    txt = 'Saved on this device';
  /* A save the phone refuses is said first, signed in or not (PENDING 336):
     "Synced" or "Offline, saved on this device" said nothing of a log that was
     not being saved here. */
  if (!device.ok) {
    cls = 'bad';
    txt = 'Not saving: export a backup';
  } else if (cloud.on && cloud.status === 'synced') {
    cls = 'ok';
    txt = 'Synced';
  } else if (cloud.on && (cloud.status === 'saving' || cloud.status === 'connecting')) {
    cls = 'busy';
    txt = 'Syncing';
  } else if (cloud.on && cloud.status === 'offline') {
    cls = 'warn';
    txt = 'Offline, saved on this device';
  }
  // Synced means your data is already off this device; the backup reminder
  // then waits in Your data instead of up here.
  if (!cls && backupDue()) {
    cls = 'warn';
    txt = 'Saved · backup due';
  }
  return { cls, txt };
}

/* ---------- start ---------- */

/** What the storage part ran as the page loaded, in its order: the preview's
    mark on the page, whether a log was here, the error log, the error
    listeners, then the save read into the store. Called once, from the start
    of the legacy script. */
export function storageStart(): void {
  if (ENV === 'preview') document.documentElement.dataset.env = 'preview';
  try {
    device.hadLog = localStorage.getItem(KEY) != null;
  } catch (e) {
    // Storage blocked: read as a device with no log.
    device.hadLog = false;
  }
  try {
    const a = arr(parseJson(localStorage.getItem(LOGK) || '[]'));
    // Each entry checked (logEntryIn); one that is not an entry is left out.
    if (a)
      for (const e of a) {
        const x = logEntryIn(e);
        if (x) logBuf.push(x);
      }
  } catch (e) {
    // No readable error log yet: the log starts empty.
  }
  // An error's own object is typed any on the event; the cast reads it as the unknown value it is.
  window.addEventListener('error', e => log('uncaught', (e.error as unknown) || e.message));
  // The reason a promise was rejected with: the same cast.
  window.addEventListener('unhandledrejection', e => log('promise', e.reason as unknown));
  setState(load());
  // The logs kept aside for other accounts, listed once read (Your data).
  asideStart().catch((e: unknown) => {
    log('aside', e);
  });
  // Records the save held that this build could not read are gone at the next save (r45 review): say so in Diagnostics.
  if (normalize.dropped)
    log(
      'load',
      new Error(
        `${normalize.dropped} damaged record${normalize.dropped === 1 ? ' was' : 's were'} skipped when the save was read`
      )
    );
}
