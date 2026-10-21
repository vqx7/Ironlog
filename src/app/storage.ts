/* The save on this device (phase 4, r56; moved from the legacy script's
   storage part, changing nothing it does): the keys every stored value lives
   under, whether storage can be written, reading the save at start, the error
   log Settings can copy, Undo's steps and their copy in IndexedDB, the
   settings kept aside while the demo is loaded, and the two readings the
   menu button makes of all that (backupDue, saveStateNow). Writing the save
   is in sync.ts (saveNow), since every write goes on to the account.
   Nothing here runs on import: storageStart() runs what the legacy part
   ran when the page loaded, from the start of the legacy script. */

import { APP_VERSION, STORAGE_ID } from './config';
import { daysBetween, today } from './util';
import { arr, parseJson, rec } from './records';
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
/** The settings kept aside while the demo is loaded (demoKeep). */
export const DEMOSET_KEY = KEY + '.demoSettings';

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
export const logBuf: unknown[] = [];
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
      if (raw) localStorage.setItem(KEY + '.unreadable', raw);
    } catch (e2) {
      log('load', e2);
    }
  }
  return normalize(null);
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
  if (cloud.on && cloud.status === 'synced') {
    cls = 'ok';
    txt = 'Synced';
  } else if (cloud.on && (cloud.status === 'saving' || cloud.status === 'connecting')) {
    cls = 'busy';
    txt = 'Syncing';
  } else if (cloud.on && cloud.status === 'offline') {
    cls = 'warn';
    txt = 'Offline, saved on this device';
  } else if (!device.ok) {
    cls = 'bad';
    txt = 'Not saving: export a backup';
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
    if (a) logBuf.push(...a);
  } catch (e) {
    // No readable error log yet: the log starts empty.
  }
  // An error's own object is typed any on the event; the cast reads it as the unknown value it is.
  window.addEventListener('error', e => log('uncaught', (e.error as unknown) || e.message));
  // The reason a promise was rejected with: the same cast.
  window.addEventListener('unhandledrejection', e => log('promise', e.reason as unknown));
  setState(load());
  // Records the save held that this build could not read are gone at the next save (r45 review): say so in Diagnostics.
  if (normalize.dropped)
    log(
      'load',
      new Error(
        `${normalize.dropped} damaged record${normalize.dropped === 1 ? ' was' : 's were'} skipped when the save was read`
      )
    );
}
