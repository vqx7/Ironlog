/* The save on this device: the keys every stored value lives
   under, whether storage can be written, reading the save at start, the error
   log Settings can copy, Undo's steps and their copy in IndexedDB, the
   settings kept aside while the demo is loaded, a log kept aside for another
   account (in IndexedDB too), and the two readings the
   menu button makes of all that (backupDue, saveStateNow). Writing the save
   is in sync.ts (saveNow), since every write goes on to the account.
   Nothing here runs on import: storageStart() runs it as the page loads,
   called from main.ts at start. */

import { APP_VERSION, STORAGE_ID } from './config';
import { daysBetween, today, uid, DAY_MS } from './util';
import { arr, fixId, parseJson, rec } from './records';
import type { Rec } from './records';
import type { LogEntry } from './types';
import { realCount } from './chunks';
import { normalize } from './normalize';
import { cloud, fx, setState, state, ui } from './store';
import type { State } from './store';

/* ---------- the keys ---------- */

/* The preview build is served from the same site as the live app, so
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
const LOGK = KEY + '.log';
/** Week or Month in This week on Today, per device. */
export const WKVIEW_KEY = KEY + '.wkView';
/** How many weeks Stats' By region averages, per device. */
export const REGION_KEY = KEY + '.regionWk';
/** The muscle map's view, flat or 3D, per device. */
export const MAPVIEW_KEY = KEY + '.mapView';
/** Today's lines dismissed on this device: Set up sync (acctBar), Get the app (installBar), the new icon. */
export const ACCT_LATER = KEY + '.acctLater',
  INSTALL_LATER = KEY + '.installLater',
  ICON_NOTE = KEY + '.icon25';
/** This browser has installed the app (its appinstalled event): its tabs no longer offer Get the app. */
export const APP_INSTALLED = KEY + '.appInstalled';
/** The first pages on this device: the account page passed (Continue without an account), and held open after a sign-out. */
export const OB_ACCT = KEY + '.obAcct',
  OB_OUT = KEY + '.signedOut';
/** A weigh-in asked about on this device: snoozed until a date (Later), and the session's first ask answered (Not now). */
export const BWSNOOZE_KEY = KEY + '.bwSnooze',
  BWASK_KEY = KEY + '.bwAsk';
/** The account's profile photo as this phone holds it (kept on this phone only in 2.33), the note of where that
    copy stands against the account (photo.ts), and its one-time line on Today answered (Add photo or Not now). */
/** A workout in progress set aside while an earlier one is edited or logged: this phone's, with its account. */
export const PARKED_KEY = KEY + '.parked';
export const PHOTO_KEY = KEY + '.photo',
  PHOTO_SYNC = KEY + '.photoSync',
  PHOTO_ASKED = KEY + '.photoAsked';
/** Moves a set-aside workout from the log of account `from` ('' for none) to `to`, when a sign-in takes the phone's log into that account (takeAccount): it goes where the log goes. */
export function parkedRetag(from: string, to: string): void {
  const r = rec(parseJson(prefGet(PARKED_KEY) || 'null'));
  if (r && r['uid'] === from) prefSet(PARKED_KEY, JSON.stringify({ ...r, uid: to }));
}
/** The settings kept aside while the demo is loaded (demoKeep). */
const DEMOSET_KEY = KEY + '.demoSettings';
/** The start of the keys a preview of r56.1 kept a log aside under, before it moved to IndexedDB (asideStart). */
const ASIDE_KEY = KEY + '.aside.';

/* ---------- where the save stands ---------- */

/** Where the save on this device stands, read by the screens and the sync. */
interface Device {
  /** Whether localStorage took the last write: false until a write succeeds again (saveStateNow says so). */
  ok: boolean;
  /** Whether storage passed its check at start. When not, nothing is ever written: the old contents were never read. */
  boot: boolean;
  /** Whether a readable save was found at start (the sync's first pull adopts the account's copy when not). */
  hadLocal: boolean;
  /** Whether this device had a log before this page first ran, read before any save (only an install from before r25 still has the old icon). */
  hadLog: boolean;
  /** The text this tab last wrote or adopted. Another tab's change is merged against it (the storage listener, sync.ts). */
  lastSaved: string | null;
}
/** Where the save on this device stands (the type above). */
export const device: Device = { ok: true, boot: true, hadLocal: false, hadLog: false, lastSaved: null };

/** Clears a timer that may not be set (a browser takes null, TypeScript's types do not). */
export const clearTimer = (t: number | null): void => {
  if (t != null) clearTimeout(t);
};

/* ---------- the error log ---------- */

/* Diagnostics log: the last 60 errors, kept in this browser only. Errors that
   would be swallowed silently land here, and Settings can copy them. Filled
   at start from LOGK, each entry checked as it is read. */
/** The last 60 errors on this device, oldest first. */
export const logBuf: LogEntry[] = [];
/** An entry of the error log as saved, or null when it is not one. */
const logEntryIn = (v: unknown): LogEntry | null => {
  const E = rec(v);
  if (!E || typeof E.t !== 'string' || typeof E.a !== 'string' || typeof E.m !== 'string' || typeof E.v !== 'string')
    return null;
  return {
    t: E.t,
    a: E.a,
    m: E.m,
    v: E.v,
    ...(typeof E.s === 'string' ? { s: E.s } : {}),
    ...(typeof E.n === 'number' && Number.isInteger(E.n) && E.n > 1 ? { n: E.n } : {})
  };
};
/* A URL's query and fragment, cut from what the log keeps. The log
   goes out with a problem report, and the page's own URL holds a reset
   link's token in its fragment for a moment after the link is opened; a stack
   frame carries that URL, and an error message can. Only the part after ? or #
   of a URL goes, up to the frame's :line:column, so the file and line stay and
   ordinary words with a ? or # in them are left alone. */
/** Text with the query and fragment of any URL in it cut out. */
export const logCut = (t: unknown): string =>
  String(t).replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#)]*)[?#](?:[^\s):]|:(?!\d))*/gi, '$1');
/** What the error log keeps: the first lines of a stack and how many characters of it, a message's characters, and how many entries. */
const LOG_LIMITS = { stackLines: 4, stackChars: 400, messageChars: 300, kept: 60 } as const;

/** Records an error under an area, with the first lines of its stack, in the log Settings can copy. */
export function log(area: string, err: unknown): void {
  try {
    const E = rec(err);
    // What an account server said that the app does not show (serverSaid, scripts/cloud-supabase.js) is kept here.
    const said = E && typeof E.serverSaid === 'string' ? ` (server: ${E.serverSaid})` : '';
    const m = (E && E.message ? E.message : E ? JSON.stringify(err) : String(err)) + said;
    // Where it broke, not only what it said: the first lines of the stack travel with a problem report, so a crash can be found in the code without the phone.
    const st =
      E && typeof E.stack === 'string'
        ? logCut(E.stack.split('\n').slice(0, LOG_LIMITS.stackLines).join('\n')).slice(0, LOG_LIMITS.stackChars)
        : '';
    const t = new Date().toISOString(),
      msg = logCut(m).slice(0, LOG_LIMITS.messageChars);
    /* The same error again (its area, message, build and place in the code), straight after itself, is counted on its line (n) with the time it last came, so one that
       repeats (a sign-in tried each time the app comes back to the screen, offline) cannot push an earlier one out of
       the LOG_LIMITS.kept kept or the 10 a problem report carries. */
    const last = logBuf[logBuf.length - 1];
    if (last && last.a === area && last.m === msg && last.v === APP_VERSION && (last.s || '') === st) {
      last.t = t;
      last.n = (last.n || 1) + 1;
    } else logBuf.push({ t, a: area, m: msg, v: APP_VERSION, ...(st ? { s: st } : {}) });
    while (logBuf.length > LOG_LIMITS.kept) logBuf.shift();
    localStorage.setItem(LOGK, JSON.stringify(logBuf));
  } catch (e) {
    /* logging must never throw */
  }
}

/* ---------- Undo's steps ---------- */

/** One step Undo can take back: the log before the action and right after it (captured at the next save), a direct reversal while the session is open, and when. */
interface UndoStep {
  pre: string;
  post: string | null;
  inv: (() => boolean) | null;
  t: number;
  /** The words of the message that reported the change, so Undo can say what it takes back; absent on a step kept by a build before 2.30 or by a change that reported nothing. */
  said?: string;
}
/** Undo's steps are kept this many days; the Settings line says so. */
export const UNDO_DAYS = 7;

/* Undo steps: the state before a destructive action, and the state right
   after it (captured at the next save). See snapshot() and ACT.undo. */
/** The steps Undo can take back, oldest first; UNDO_MAX at most. */
export const undoStack: UndoStep[] = [],
  UNDO_MAX = 20;
/* Undo history survives a reload and a closed app. It holds whole
   copies of the log, so it lives in IndexedDB, whose quota is separate from
   and much larger than localStorage's: it can never crowd out the main save.
   Entries older than UNDO_DAYS are dropped. The reversal functions some
   in-session entries carry cannot be stored; after a reload those entries
   undo through the three-way merge, which gives the same result. Best
   effort: without IndexedDB, Undo works for this visit only.
   Each step is stored under a key of its own (STEP_KEY and its id), written
   when it is new or changes (its log after the change kept, or its words)
   and deleted when it leaves the list, so a change writes its own step, not
   all 20 again (on two years of training, 416 sessions, rewriting the list
   is 40 copies of the log, about half a second of an older phone's time
   each; one step is two). Steps kept by 2.57 and before, the whole list
   under 'stack', are read and then stored on their own. */
const UNDO_DB = ENV === 'preview' ? `${STORAGE_ID}-preview-undo` : `${STORAGE_ID}-undo`,
  UNDO_TTL = UNDO_DAYS * DAY_MS;
let undoDbP: Promise<IDBDatabase | null> | null = null;
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
/** Whether a write of the steps is waiting for the tap that changed them to end. */
let undoWaiting = false;
/** The key prefix of a step stored on its own (above); the list as 2.57 and before kept it is under LEGACY_KEY. */
const STEP_KEY = 'step:',
  LEGACY_KEY = 'stack';
/** Each step's id in the store, given when it is first written or read back. */
const stepIds = new WeakMap<UndoStep, string>();
/** A step's id in the store: the time it was kept and a fresh id, unique on this phone. */
function stepId(e: UndoStep): string {
  let id = stepIds.get(e);
  if (!id) {
    id = `${e.t || Date.now()}-${uid()}`;
    stepIds.set(e, id);
  }
  return id;
}
/** What a step as stored says beyond its log before (which never changes): whether its log after is kept, and its words. */
const stepSig = (e: UndoStep): string => `${e.post == null ? '' : 'p'}|${e.said ?? ''}`;
/** The steps in the store, by id, with what each says (stepSig); a step not listed here is not stored. */
const stepsStored = new Map<string, string>();
/** Whether the list as 2.57 kept it is still in the store, to be deleted once the steps are stored on their own. */
let legacyStored = false;
/** Writes the steps to IndexedDB now: the new and changed ones, and deletes those that left the list. */
async function undoWrite(): Promise<void> {
  undoWaiting = false;
  const db = await undoDb();
  if (!db) return;
  try {
    const tx = db.transaction('kv', 'readwrite');
    const st = tx.objectStore('kv');
    const live = new Set<string>(),
      put = new Map<string, string>(),
      gone: string[] = [];
    for (const e of undoStack) {
      const id = stepId(e),
        sig = stepSig(e);
      live.add(id);
      if (stepsStored.get(id) === sig) continue;
      st.put({ pre: e.pre, post: e.post, t: e.t || Date.now(), ...(e.said ? { said: e.said } : {}) }, STEP_KEY + id);
      put.set(id, sig);
    }
    for (const id of stepsStored.keys())
      if (!live.has(id)) {
        st.delete(STEP_KEY + id);
        gone.push(id);
      }
    const legacy = legacyStored;
    if (legacy) st.delete(LEGACY_KEY);
    // The store's own record follows the write only once it has ended: a write that failed is tried again next time.
    tx.oncomplete = () => {
      for (const [id, sig] of put) stepsStored.set(id, sig);
      for (const id of gone) stepsStored.delete(id);
      if (legacy) legacyStored = false;
    };
    tx.onerror = () => log('undo-save', tx.error);
    /* Committed at once rather than when the page next idles: a page reloaded or closed straight after (Update, the
       app closed, another address) can be gone before the write ends, and Undo then takes back the change before it.
       A browser without commit() ends the write when it idles. */
    if ('commit' in tx) tx.commit();
  } catch (e) {
    log('undo-save', e);
  }
}
/* The steps are written as the tap that changed them ends: a microtask, so the step, the log right after it and its
   words, all made in that tap, go in one write, and the write is under way before anything else can happen. Waiting for a pause in the taps, or
   for the page to be hidden or left, a change made just before the app closed would lose its step, and in WebKit a
   write begun as the page is torn down (a reload with no hiding first: Update, another address) never ends. Either
   way Undo would then take back the change before it. */
/** Writes the steps to IndexedDB as the current tap ends. */
export function undoPersist(): void {
  if (undoWaiting) return;
  undoWaiting = true;
  queueMicrotask(() => {
    if (undoWaiting) void undoWrite();
  });
}
/** Reads the steps saved by an earlier visit, those under a week old, once at start. */
export async function undoRestore(): Promise<void> {
  const db = await undoDb();
  if (!db) return;
  const read = await new Promise<{ legacy: unknown; steps: [string, unknown][] }>(res => {
    const got: { legacy: unknown; steps: [string, unknown][] } = { legacy: null, steps: [] };
    try {
      // One pass over the store's keys from the list as 2.57 kept it ('stack') to the last step ('step:' and an id).
      const q = db
        .transaction('kv')
        .objectStore('kv')
        .openCursor(IDBKeyRange.bound(LEGACY_KEY, STEP_KEY + '\uffff'));
      q.onsuccess = () => {
        const c = q.result;
        if (!c) {
          res(got);
          return;
        }
        const k = String(c.key);
        // A cursor's value is typed any; the cast reads it as the unknown value it is.
        const v = c.value as unknown;
        if (k === LEGACY_KEY) got.legacy = v;
        else if (k.startsWith(STEP_KEY)) got.steps.push([k.slice(STEP_KEY.length), v]);
        c.continue();
      };
      q.onerror = () => res(got);
    } catch (e) {
      // The store cannot be read (a database another build made): no steps to restore, and the reason is kept.
      log('undo-read', e);
      res(got);
    }
  });
  const now = Date.now();
  /* Every step found is noted as stored, so one not taken back into the list (too old, past the newest UNDO_MAX, or
     steps kept here already this visit) is deleted at the next write, as the whole list once was written over. */
  for (const [id] of read.steps) stepsStored.set(id, '');
  legacyStored = read.legacy != null;
  const found: { e: UndoStep; id: string | null }[] = [];
  const take = (v: unknown, id: string | null): void => {
    const E = rec(v);
    if (E && typeof E.pre === 'string' && now - (Number(E.t) || 0) < UNDO_TTL)
      found.push({
        e: {
          pre: E.pre,
          post: typeof E.post === 'string' ? E.post : null,
          inv: null,
          t: Number(E.t),
          ...(typeof E.said === 'string' ? { said: E.said } : {})
        },
        id
      });
  };
  for (const v of arr(read.legacy) || []) take(v, null);
  for (const [id, v] of read.steps) take(v, id);
  if (!undoStack.length) {
    found.sort((a, b) => a.e.t - b.e.t);
    for (const f of found.slice(-UNDO_MAX)) {
      if (f.id) {
        stepIds.set(f.e, f.id);
        stepsStored.set(f.id, stepSig(f.e));
      }
      undoStack.push(f.e);
    }
  }
  // Steps to delete or to store on their own: written now, not left for the next change.
  if (legacyStored || [...stepsStored.values()].includes('')) undoPersist();
  if (undoStack.length && ui.tab === 'settings' && !ui.modal) fx.rerenderKeepScroll();
}
/** Drops every step, here and in IndexedDB (a restore, a sign-in that takes the account's log). */
export function undoForget(): void {
  undoStack.length = 0;
  undoWaiting = false;
  undoDb().then(db => {
    if (!db) return;
    try {
      const tx = db.transaction('kv', 'readwrite');
      // The store holds Undo's steps alone, each on its own and, from before 2.58, the list.
      tx.objectStore('kv').clear();
      tx.oncomplete = () => {
        stepsStored.clear();
        legacyStored = false;
      };
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
    // A log JSON cannot write is not kept as a step: the action goes ahead without Undo, and the reason is kept.
    log('undo-step', e);
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
function storageTest(): boolean {
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
    /* An unreadable save would be replaced by a fresh state on the next
       save, destroying it. Keep the raw text aside so it can be recovered. */
    log('load', e);
    device.hadLocal = false;
    let kept = false;
    try {
      if (raw) {
        localStorage.setItem(UNREAD_KEY, raw);
        kept = true;
      }
    } catch (e2) {
      log('load', e2);
    }
    /* Not kept aside (a full store refused the copy, or the save could not
       even be read out): it is the only copy, so nothing is saved over it
       this visit, and the menu says Not saving. */
    if (!kept) device.ok = device.boot = false;
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
    // Storage this browser refuses: nothing kept aside can be read.
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

/* ---------- a log kept aside for another account ---------- */

/* A phone signed in to one account that holds another account's log, told
   to use this account's log, keeps the other's aside first, whole, with the
   sync notes that go with it, so nothing only this phone holds is lost: the
   next sign-in to that account on this phone starts from it (asideOf) and
   syncs as a continuation. Your data lists what is kept (asideList), and
   Erase everything clears it with the rest (asideClear).
   A log kept aside is a whole copy of a log, so it lives in IndexedDB, as
   Undo's copies do: that room is separate from localStorage's and far
   larger, so a log kept aside never crowds out the save of the log in use,
   then or as that log grows (tests/room.js: kept in
   localStorage, a log of 40% of the room kept aside made the save of a log
   of 62% of it fail, and every save after it). Your data's line reads a list
   held in memory (asideIdx), read from the database at start and kept
   current by every change here. */
/** What is kept aside for an account: its log, its sync notes, and when. */
interface Aside {
  at: number;
  state: State;
  meta: unknown;
  editAt: unknown;
  last: unknown;
}
/** A log kept aside, as Your data lists it: its account, its sessions, and when it was kept. */
interface AsideEntry {
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
/* A preview of r56.1 kept the log aside in localStorage,
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

/** A backup is due this many days after the last one when this device holds the only copy, and an account counts as synced when it synced within as many. */
const BACKUP_DAYS = 7;

/* Everything lives in this one browser, so a backup is the only thing that
   survives a cleared cache or a new phone. Once real sessions exist, the
   header says so until a backup has been exported or copied in the last week.
   Demo data does not count. */
/** Whether the menu should say a backup is due. */
export function backupDue(): boolean {
  /* Signed in and synced, the account is where the log lives, as in any
     app; deletions are covered by Recently deleted (TRASH_DAYS) and Undo (UNDO_DAYS),
     so no reminder (no "Backup due" to a synced account while the
     first page says the account backs it up). */
  if (!state.sessions.some(s => !s.demo)) return false;
  const synced = cloud.on && cloud.last && Date.now() - cloud.last < BACKUP_DAYS * DAY_MS;
  if (synced) return false;
  if (!device.ok && !synced) return false;
  const le = state.settings.lastExport;
  // Every BACKUP_DAYS when this device holds the only copy: a phone that is
  // lost or wiped loses everything since the last backup.
  return !le || daysBetween(le, today()) > BACKUP_DAYS;
}
/* The menu button ends the top bar on every tab: a person for the
   account, with a dot for the save state (green synced, grey syncing, amber
   when something wants attention, red when nothing is being saved; none when
   the log is simply saved on this device). Wider screens show the words too.
   A tap opens the menu: account, Report a problem, the Guide, your data. */
/** The save state the menu button shows: its class (the dot's colour) and its words. */
export function saveStateNow(): { cls: string; txt: string } {
  let cls = '',
    txt = 'Saved on this device';
  /* A save the phone refuses is said first, signed in or not:
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
    listeners, then the save read into the store. Called once, from main.ts at
    start. */
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
  // Records the save held that this build could not read are gone at the next save: say so in Diagnostics.
  if (normalize.dropped)
    log(
      'load',
      new Error(
        `${normalize.dropped} damaged record${normalize.dropped === 1 ? ' was' : 's were'} skipped when the save was read`
      )
    );
}

/* ---------- pictures' bytes ----------
   A picture on a note keeps its bytes in IndexedDB, as Undo's copies and a
   log kept aside do, under a database of its own, so it never crowds the
   log's save. pics.ts decides what is kept; these read and write it, and
   nothing else names the database. Best effort: without IndexedDB, Add
   picture says the photo could not be kept. */
const PIC_DB = ENV === 'preview' ? `${STORAGE_ID}-preview-pics` : `${STORAGE_ID}-pics`;
let picDbP: Promise<IDBDatabase | null> | null = null;
function picDb(): Promise<IDBDatabase | null> {
  if (!picDbP)
    picDbP = new Promise(res => {
      try {
        const r = indexedDB.open(PIC_DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('pics', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => {
          log('pics-open', r.error);
          res(null);
        };
      } catch (e) {
        // No IndexedDB (a private window, an old browser): no picture can be kept, and the reason is logged.
        log('pics-open', e);
        res(null);
      }
    });
  return picDbP;
}
/** Every picture row kept on this phone, each still unknown until pics.ts checks it. */
export async function picRowsRead(): Promise<unknown[]> {
  const db = await picDb();
  if (!db) return [];
  return new Promise(res => {
    try {
      // A request's result is typed any; the cast reads it as the unknown value it is, each row then checked by pics.ts.
      const q = db.transaction('pics').objectStore('pics').getAll() as IDBRequest<unknown>;
      q.onsuccess = () => res(arr(q.result) || []);
      q.onerror = () => {
        log('pics-read', q.error);
        res([]);
      };
    } catch (e) {
      log('pics-read', e);
      res([]);
    }
  });
}
/** Writes picture rows and deletes others, or clears them all, in one transaction: true once it is done. */
export async function picRowsWrite(put: readonly object[], del: readonly string[], clear = false): Promise<boolean> {
  const db = await picDb();
  if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction('pics', 'readwrite');
      const st = tx.objectStore('pics');
      if (clear) st.clear();
      for (const r of put) st.put(r);
      for (const id of del) st.delete(id);
      tx.oncomplete = () => res(true);
      tx.onerror = () => {
        log('pics-write', tx.error);
        res(false);
      };
      tx.onabort = () => {
        log('pics-write', tx.error);
        res(false);
      };
    } catch (e) {
      log('pics-write', e);
      res(false);
    }
  });
}
