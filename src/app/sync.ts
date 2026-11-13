/* Saving the log, and the account's copy of it. A save goes to this device at once (saveNow) and on to the account after
   it (cloudSoon): localStorage alone is not durable on a phone (iOS deletes a
   site's storage after 7 days without a visit, clearing browser data wipes
   it, a new phone starts empty), so localStorage stays the instant, offline
   copy and the account is the durable one. The sync suites use the Claude
   artifact's database as their stand-in account (cloudProvider).

   Layout: one document for routines, exercises, settings and body data, one
   for the in-progress session, one per half-month of sessions, and one per
   year of body data, so no document nears the 256 KB cap and logging a set
   rewrites only the small draft doc. Each document stores its chunk as a JSON
   string with a timestamp and a write mark. Only chunks whose content changed
   are written, one at a time, in order, and each only while the account still
   holds the copy this device read: two devices writing one
   document at once each keep their own changes. The three-way merge of a document edited on two
   devices, the sync notes each device keeps, and the merge of another tab's
   save are here too. Nothing runs on import: syncStart() runs what the parts
   ran as the page loaded, called from main.ts at start. */

import { NET_MS } from './config';
import { uid, hashStr, SECOND_MS } from './util';
import { fmtDate } from './format';
import { arr, parseJson, rec } from './records';
import type { Rec } from './records';
import {
  CORE_ARR,
  CORE_FIELDS,
  baseFor,
  bodyChunkOf,
  chunkOf,
  chunksOf,
  emptyChunk,
  hasDemo,
  isChunkId,
  legacyBody,
  PHOTO_DOC,
  realCount,
  stripDemo,
  unionById
} from './chunks';
import { Hx, canon, merge3List, merge3Val, mergeSession, mergeWorkout } from './merge';
import { draftCardio, draftSession } from './session';
import type { DraftLike } from './session';
import type { CardioEntry } from './types';
import { routineEmpty } from './routines';
import { cleanCardio, normalize, plainTemplate } from './normalize';
import { invalidate } from './live';
import { AUTH, codeOf } from './providers';
import { photoHeld, photoNote, photoOf, photoPending, photoSent, photoTake } from './photo';
import { acct, cloud, fx, setState, state, ui } from './store';
import type {
  Base,
  CloudDb,
  CloudDbIn,
  CloudDoc,
  CloudRef,
  CloudSeen,
  CloudSent,
  CloudStatus,
  State,
  SyncNote
} from './store';
import {
  KEY,
  capturePost,
  demoRestore,
  device,
  log,
  clearTimer,
  keepAside,
  asideOf,
  parkedRetag,
  dropAside,
  load,
  undoForget
} from './storage';

/** Sync's timings, in milliseconds: a save and the edit notes once the taps
    pause, a flush once they pause, the wait for any answer from the account,
    an account error's toast, and how long after the last pull a return to the
    app pulls again. */
const SYNC_MS = {
  save: 400,
  track: 800,
  flush: 1200,
  net: NET_MS,
  errToast: 8000,
  pullAfter: 20000
} as const;
/** The waits between tries after a sync fails, in seconds, the last repeated. */
const RETRY_S: readonly number[] = [5, 15, 60, 180];
/** What a phone whose sign-in the server refuses says. */
const SIGNIN_AGAIN = 'Your sign-in has expired. Sign in again to sync. Your log stays on this phone.';
/** Says that the server refused this phone's sign-in: when a sync meets the refusal, and when the account library met it first and signed the phone out itself. */
export function signInAgain(): void {
  fx.toast(SIGNIN_AGAIN, null, SYNC_MS.errToast);
}
/** Whether the phone says it has no network: the sync then waits for it (the 'online' event, account.ts) rather than trying what cannot reach anything. */
const offline = (): boolean => navigator.onLine === false;
/** A sync document over this many characters of JSON is left unwritten (the account's size cap), so it cannot stop the others. */
const DOC_MAX = 250000;
/** Tries at writing one document in a flush when another device keeps writing it first (each read, merged and
    written again): past them the flush stops for that document and tries later, as after a dropped connection. */
const WRITE_TRIES = 3;
/** Tries at keeping the log aside before giving up (a set ticked while the copy is written makes another). */
const KEEP_TRIES = 10;

declare global {
  interface Window {
    /** The account backend's handle for the sync (scripts/cloud-supabase.js): the document store and who is signed in. */
    ironlogCloud?:
      | (() => Promise<{ db?: CloudDbIn | null | undefined; userId?: unknown } | null | undefined>)
      | undefined;
  }
}

/* ---------- the save on this device ---------- */

let saveT: number | null = null;
/** What runs after each write of the log to this device succeeds (onSaved). */
const savedHooks: (() => void)[] = [];
/* A copy kept elsewhere on the phone until the log holding it is written (park.ts's set-aside workout) is let
   go here, once a write succeeds: until then the log lives in memory alone. */
/** Runs `f` after each write of the log to this device succeeds. */
export function onSaved(f: () => void): void {
  savedHooks.push(f);
}
/** Writes the log's text to this device and notes it as the last saved, the base another tab's write is merged against (onStorage); throws as setItem does. */
function writeLocal(j: string): void {
  localStorage.setItem(KEY, j);
  device.lastSaved = j;
  for (const f of savedHooks)
    try {
      f();
    } catch (e) {
      // The write itself succeeded; what follows it is said in the error log, never taken as a failed save.
      log('storage', e);
    }
}
/* Whether another tab wrote the log since this one last saved or heard it:
   the save there is not yet heard here (a storage event comes a task later),
   so writing now would replace it (a tick in one tab and a load typed in
   another, each tab saving what it had, lost one of them). A log never saved or read here has nothing to compare. */
function storedElsewhere(): string | null {
  if (!device.boot || device.lastSaved == null) return null;
  try {
    const cur = localStorage.getItem(KEY);
    return cur != null && cur !== device.lastSaved ? cur : null;
  } catch (e) {
    // Storage that cannot be read now cannot be written either; the save below says so.
    log('storage', e);
    return null;
  }
}
let mergeDue = false;
/** Writes the log to this device now, notes the edit for the sync and schedules the flush. */
export function saveNow(): void {
  clearTimer(saveT);
  saveT = null;
  capturePost();
  /* Another tab's save not yet heard here is merged in first, once the
     change being made has run to its end (a microtask: the change may go on
     with the records it holds after this save), and the merge then saves. */
  if (storedElsewhere() != null) {
    if (!mergeDue) {
      mergeDue = true;
      queueMicrotask(() => {
        mergeDue = false;
        const cur = storedElsewhere();
        if (cur != null) mergeIn(cur, true);
        else saveNow();
      });
    }
    return;
  }
  /* Storage that failed its check at startup stays off: its old contents were
     never read, so writing now could overwrite them. A write that fails later
     (storage full) is tried again on every save, and saving resumes as soon
     as one succeeds, rather than stopping for the rest of the visit. */
  if (device.boot) {
    try {
      writeLocal(JSON.stringify(state));
      device.ok = true;
    } catch (e) {
      device.ok = false;
      log('storage', e);
    }
  }
  markEdit();
  fx.setSaveState();
  cloudSoon();
}
/* The log taken in from the account (a pull, or a flush that merged the
   account's copy) is written to this device before the sync notes say it
   agrees with the account: the notes describe the log on this device, so
   notes written ahead of a refused write read, on the next start, the
   records taken in as deleted here, and that deletion was sent to the
   account and the other phone. A refused write
   marks the save failed, which keeps the notes as they were (saveMeta) and
   says Not saving; a save that later succeeds (saveNow) clears it. A save
   that could not be read at start is never written over (device.boot). */
/** Writes the log just taken in from the account to this device, and says whether it is saved. */
function writeTakenIn(): boolean {
  if (!device.boot) return false;
  try {
    writeLocal(JSON.stringify(state));
    device.ok = true;
  } catch (e) {
    device.ok = false;
    log('storage', e);
  }
  fx.setSaveState();
  return device.ok;
}
/** Writes the log once the taps pause (SYNC_MS.save). */
export function saveSoon(): void {
  clearTimer(saveT);
  saveT = setTimeout(saveNow, SYNC_MS.save);
}
/** Drops every cached reading of the log and writes it now. */
export function commit(): void {
  invalidate();
  saveNow();
}

/* ---------- the sync notes ---------- */

/** The key the sync notes are saved under: each document's last agreed copy, the device id and the account. */
const SYNC_KEY = KEY + '.sync';
/* The notes as they were saved, each entry checked field by field: a note that fails is dropped, with a line in the error log,
   so a damaged note never reads as agreement with the account (its document
   then merges as a first sync does, with nothing judged deleted); a damaged
   merge base leaves its note with none, which reads the same way. The two
   readers of the notes, at start and from another tab, share this. */
/** A record of strings by key, or null when any value is not a string. */
const stringsIn = (v: unknown): Record<string, string> | null => {
  const R = rec(v);
  if (!R) return null;
  const o: Record<string, string> = {};
  for (const k in R) {
    const x = R[k];
    if (typeof x !== 'string') return null;
    o[k] = x;
  }
  return o;
};
/** A merge base as saved, or null when it is not one. */
const baseIn = (v: unknown): Base | null => {
  const R = rec(v);
  if (!R) return null;
  const b: Base = {};
  if (R.a !== undefined) {
    const A = rec(R.a);
    if (!A) return null;
    const a: Record<string, Record<string, string>> = {};
    for (const k in A) {
      const l = stringsIn(A[k]);
      if (!l) return null;
      a[k] = l;
    }
    b.a = a;
  }
  for (const k of ['f', 's'] as const) {
    if (R[k] === undefined) continue;
    const l = stringsIn(R[k]);
    if (!l) return null;
    b[k] = l;
  }
  if (R.d !== undefined) {
    if (typeof R.d !== 'string') return null;
    b.d = R.d;
  }
  if (R.draft != null) b.draft = draftOf(R);
  return b;
};
/** A sync note as saved, or null when it is not one (no fingerprint, or no time). */
const noteIn = (v: unknown): SyncNote | null => {
  const N = rec(v);
  if (!N || typeof N.h !== 'string' || typeof N.at !== 'number') return null;
  return { h: N.h, at: N.at, b: N.b == null ? null : baseIn(N.b) };
};
/** The unanswered writes as saved: each entry checked, its note through noteIn; anything else dropped. */
function sentIn(v: unknown): Record<string, CloudSent> {
  const S = rec(v);
  const out: Record<string, CloudSent> = {};
  if (!S) return out;
  for (const id of Object.keys(S)) {
    const e = rec(S[id]);
    const note = e ? noteIn(e.note) : null;
    if (
      e &&
      note &&
      isChunkId(id) &&
      typeof e.w === 'string' &&
      typeof e.uid === 'string' &&
      typeof e.from === 'string'
    )
      out[id] = { w: e.w, uid: e.uid, from: e.from, note };
  }
  return out;
}
/** The notes as saved: each document's note checked (noteIn), each edit time a number, the last sync a number. */
const notesIn = (
  m: Rec,
  from: string
): { meta: Record<string, SyncNote> | null; editAt: Record<string, number> | null; last: number | null } => {
  const M = rec(m.meta),
    E = rec(m.editAt);
  let meta: Record<string, SyncNote> | null = null,
    editAt: Record<string, number> | null = null;
  if (M) {
    meta = {};
    for (const k in M) {
      const n = noteIn(M[k]);
      if (n) meta[k] = n;
      else log(from, new Error(`the sync note for ${k} was not readable and was dropped`));
    }
  }
  if (E) {
    editAt = {};
    for (const k in E) {
      const t = E[k];
      if (typeof t === 'number') editAt[k] = t;
    }
  }
  return { meta, editAt, last: typeof m.last === 'number' ? m.last : null };
};
/* The notes on the phone describe the log on the phone, always. So they are not written while the log's own
   save is failing: a sync note saved ahead of the log made the log of the
   next start read as edited back, and the sync deleted the workouts it
   lacked from the account. Nor over newer notes from another
   tab. Tabs share one storage, but a tab reads another's write only once it
   arrives, milliseconds on: a second tab hearing the menu's Sign out a
   millisecond after the first had forgotten the notes still read the old
   ones and wrote them back, the first tab took them from it, and the next
   sign-in read the empty log as every session deleted and emptied the
   account. So the notes carry when they last stopped describing the log
   before them (`ep`: forgotten, or moved to another account), and notes from
   before that never stand over them: saveMeta does not write over newer
   ones, and a tab that hears older ones writes its own back (onStorage). */
/** When the notes in this tab last stopped describing the log before them (above); 0 for notes from before r56.1. */
let notesEp = 0;
/** The notes in this tab now describe a new log (above): forgotten, or another account's. */
const newEp = (): void => {
  notesEp = Math.max(Date.now(), notesEp + 1);
};
/** The moment stored notes last stopped describing the log before them; 0 when they say none. */
const epOf = (m: Rec | null): number => (m && typeof m.ep === 'number' ? m.ep : 0);
/* Two tabs keep one set of notes for one log and account, and each changes them as it syncs. A tab takes in the
   other's by joining them into its own, never by taking or writing either whole. Each document's note is
   read against the notes this tab last saw: the one changed since, here or there, is kept; changed in both (both tabs
   synced it), the later agreement, by the account's time for the copy agreed. Edit times and the last sync are this
   phone's clock, so the later of each; a write sent from either tab is kept until it is answered. A tab that had not
   heard the other's notes wrote its own over them, so a session the other tab had synced lost its agreed copy, and
   the next sync read the tab's copy against the account's as an edit on two devices. Notes for another log (a later
   `ep`) or another account still replace these whole (onStorage, readStored). */
/** The notes' text as this tab last wrote or took it in: stored text unlike it was written by another tab and not yet taken in. */
let notesSeen: string | null = null;
/** Whether two notes for a document are one agreement (or both absent). */
const sameNote = (a: SyncNote | undefined, b: SyncNote | undefined): boolean =>
  a === b || (!!a && !!b && a.h === b.h && a.at === b.at);
/** Joins notes another tab wrote for the same log and account into this tab's (above): whether this tab's held something theirs did not. */
function joinNotes(m: Rec, text: string | null): boolean {
  const { meta, editAt, last } = notesIn(m, 'tabs');
  const seenRec = rec(parseJson(notesSeen || 'null'));
  const base: Record<string, SyncNote> = (seenRec && notesIn(seenRec, 'tabs').meta) || {};
  const theirs = meta || {};
  let mine = false;
  for (const k of new Set([...Object.keys(cloud.meta), ...Object.keys(theirs)])) {
    const here = cloud.meta[k],
      there = theirs[k];
    const keep = !there
      ? here
      : !here
        ? there
        : sameNote(there, base[k])
          ? here
          : sameNote(here, base[k])
            ? there
            : there.at > here.at
              ? there
              : here;
    if (keep) cloud.meta[k] = keep;
    if (!sameNote(keep, there)) mine = true;
  }
  const te = editAt || {};
  for (const k in cloud.editAt) if (!(k in te) || cloud.editAt[k] > te[k]) mine = true;
  for (const k in te) cloud.editAt[k] = Math.max(cloud.editAt[k] || 0, te[k]);
  if (cloud.last != null && (last == null || cloud.last > last)) mine = true;
  else cloud.last = last;
  const sent = sentIn(m.sent);
  for (const k in cloud.sent) if (!sent[k]) mine = true;
  for (const k in sent) if (!cloud.sent[k]) cloud.sent[k] = sent[k];
  notesSeen = text;
  return mine;
}
/* The notes describe the log they were written with, so another tab's are taken in only once its log is: a tab that has
   not yet heard the other's save (a storage event comes a task later, and a hidden page may hear none) would hold
   notes saying the account has what its own log lacks, and its sync would read the difference as its own deletion
   and send it (a session the other tab had pulled from a second phone would be taken off the account and that
   phone). It keeps its own notes, which describe its own log, until it hears that save. */
/** Takes in notes another tab wrote that this tab has not heard (above), before the sync reads its own; whether it found any. */
function notesCatchUp(): boolean {
  if (storedElsewhere() != null) return false;
  let text: string | null = null;
  try {
    text = localStorage.getItem(SYNC_KEY);
  } catch (e) {
    // Storage unreadable now: this tab goes on with the notes it holds.
    log('tabs', e);
    return false;
  }
  if (text == null || text === notesSeen) return false;
  const m = rec(parseJson(text));
  if (!m || epOf(m) !== notesEp || (typeof m.acct === 'string' ? m.acct : null) !== cloud.acct) return false;
  joinNotes(m, text);
  return true;
}
/** Writes the sync notes to this device: whether they were written (above). */
function saveMeta(): boolean {
  /* The notes describe the log on this device, so they are written only while
     it is saved: never while a write of it fails, and never over a save that
     could not be read at start (device.boot false: a blocked store, where a
     write fails anyway, or an unreadable save not kept aside). */
  if (!device.ok) return false;
  try {
    if (epOf(rec(parseJson(localStorage.getItem(SYNC_KEY) || 'null'))) > notesEp) {
      log('tabs', new Error('newer sync notes from another tab; not written over'));
      return false;
    }
    // Notes the other tab wrote and this one has not heard are joined in, never written over.
    notesCatchUp();
    const text = JSON.stringify({
      meta: cloud.meta,
      // Writes sent and not yet answered, so a reload before the answer still knows its own.
      sent: Object.keys(cloud.sent).length ? cloud.sent : undefined,
      last: cloud.last,
      editAt: cloud.editAt,
      devId: cloud.devId,
      acct: cloud.acct || undefined,
      ep: notesEp || undefined
    });
    localStorage.setItem(SYNC_KEY, text);
    notesSeen = text;
    return true;
  } catch (e) {
    log('sync-meta', e);
    return false;
  }
}

/* ---------- the documents, put together and taken apart ---------- */

/** The log put back together from its documents, by id, through normalize(). */
export function assemble(parts: Record<string, Rec | null>): ReturnType<typeof normalize> {
  const core = parts.core || {};
  const sessions: unknown[] = [],
    cardio: unknown[] = [],
    bw: unknown[] = [],
    ms: unknown[] = [];
  for (const k in parts) {
    const p = parts[k];
    if (k.startsWith('s-') && p) {
      const s = arr(p.sessions),
        c = arr(p.cardio);
      if (s) sessions.push(...s);
      if (c) cardio.push(...c);
    }
  }
  for (const k in parts) {
    const p = parts[k];
    if (k.startsWith('b-') && p) {
      const b = arr(p.bodyweights),
        m = arr(p.measurements);
      if (b) bw.push(...b);
      if (m) ms.push(...m);
    }
  }
  // A body document wins over a copy of the same record still in an older core.
  const L = legacyBody(core);
  const draft = rec(parts.draft);
  return normalize({
    ...core,
    bodyweights: unionById(bw, L.bodyweights),
    measurements: unionById(ms, L.measurements),
    sessions,
    cardio,
    draft: draft ? draft.draft : null
  });
}
/* The first time a device sees a body document it has no base for it. Its
   core base from before r22 already records which weigh-ins both sides had
   agreed on, by id, so that serves as the base: a weigh-in deleted on a
   device that updated first stays deleted when this one updates. Read before
   any document is processed, since syncing core replaces that base. */
function legacyBodyBase(): Base | null {
  const c = cloud.meta.core;
  const a = c && c.b && c.b.a;
  if (!a || !(a.bodyweights || a.measurements)) return null;
  return { a: { bodyweights: a.bodyweights || {}, measurements: a.measurements || {} } };
}
/* Adds them to the log without replacing anything already here; the next
   sync writes them into their body documents. Returns whether any were new. */
function absorbLegacy(L: { bodyweights: unknown[]; measurements: unknown[] }): boolean {
  const add = (k: 'bodyweights' | 'measurements'): unknown[] => {
    // What the list holds now, by id (an entry that is no record counts as it is, as `x && x.id` read it).
    const have = new Set(
      (arr(state[k]) || []).map(x => {
        const R = rec(x);
        return !x ? x : R ? R.id : undefined;
      })
    );
    return (L[k] || []).filter(x => {
      const R = rec(x);
      return !!R && typeof R.id === 'string' && !have.has(R.id);
    });
  };
  const bw = add('bodyweights'),
    ms = add('measurements');
  if (!bw.length && !ms.length) return false;
  setState(
    normalize({ ...state, bodyweights: [...state.bodyweights, ...bw], measurements: [...state.measurements, ...ms] })
  );
  return true;
}
/** Queues a sync step after the ones in flight, so reads and writes never interleave. */
export const cq = (fn: () => unknown): Promise<unknown> =>
  (cloud.chain = cloud.chain.then(fn, () => {
    // A step that failed does not stop the queue: the next step runs anyway, and each reports its own errors (cloudFail).
    return fn();
  }));
/** A promise, or a timeout error after ms; a failure that comes after the timeout is logged under `area`, so a slow one keeps its own reason. */
export function withTimeout<T>(pr: Promise<T>, ms: number, area = 'sync-late'): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    pr.finally(() => {
      clearTimeout(t);
    }),
    new Promise<never>((_, rej) => {
      t = setTimeout(() => {
        /* The sync goes on as for a dropped connection (cloudFail retries), but the request may still fail with
           a reason of its own (refused, the copy full), which a timeout alone would hide. */
        pr.catch((e: unknown) => {
          log(area, e);
        });
        rej({ code: 'timeout', message: `Timed out: no answer in ${ms / SECOND_MS} s` });
      }, ms);
    })
  ]);
}
/** Sets the sync's status and error, and redraws the save state's button and the sync line. */
export function setCloud(st: CloudStatus, err?: string | undefined): void {
  cloud.status = st;
  cloud.err = err || null;
  fx.setSaveState();
  fx.syncLine();
}
/** The account's document by id. Only called while the sync is on, when there is a db. */
function ref(id: string): CloudRef {
  if (!cloud.db) throw new Error('not syncing');
  return cloud.db.doc(`data/users/${cloud.uid}/${id}`);
}
function cloudFail(e: unknown): void {
  const E = rec(e);
  const c = codeOf(e);
  if (c === 'revoked' || c === 'not_granted' || c === 'capability_disabled' || c === 'capability_removed') {
    const was = cloud.on;
    cloud.on = false;
    setCloud('local');
    /* A sign-in the server refuses can never sync again: this phone signs out
       of it, keeping the log and the sync notes (signing back in to the
       account goes on from them), and says so, once, as the failure turns the
       sync off (else nothing is said, and Your data reads "Not syncing right
       now" with no way to sign in). */
    if (c === 'revoked' && was) {
      const A = AUTH();
      acct.user = null;
      cloudStop();
      if (A)
        A.signOut().catch((x: unknown) => {
          log('auth', x);
        });
      signInAgain();
    }
    fx.render();
    return;
  }
  if (c === 'gone') {
    /* the account was deleted elsewhere: signed out, the notes forgotten, the log kept */
    const A = AUTH();
    acct.user = null;
    cloudStop(true);
    if (A)
      A.signOut().catch((x: unknown) => {
        log('auth', x);
      });
    fx.render();
    fx.toast(String(E && E.message), null, SYNC_MS.errToast);
    return;
  }
  if (c === 'quota_exceeded') {
    setCloud('offline', 'The cloud copy is full. Export a backup and delete old demo data.');
    return;
  }
  setCloud('offline', c === 'denied' && E && typeof E.message === 'string' ? E.message : undefined);
  clearTimer(cloud.t);
  if (offline()) return;
  const wait = RETRY_S[Math.min(cloud.retry++, RETRY_S.length - 1)] * SECOND_MS;
  cloud.t = setTimeout(() => cq(cloudFlush), wait);
}

/* ---------- three-way merge ----------
   Each synced document remembers the per-record hashes of the version both
   sides last agreed on (its base). On a conflict every record is judged on
   its own: changed on one side only, that side wins, deletions included; changed
   on both, the side edited later wins and the conflict is counted and shown.
   A record changed on one side and deleted on the other is kept, because
   keeping data is the recoverable mistake. Without a base (a document last
   synced by an older build) nothing can be judged deleted, so both sides'
   records are kept, which is how sync behaved before. */
/* Every comparison runs on the normalized form of a document. A record saved
   straight from the logger lacks defaults that normalize() adds later (demo,
   light), so without this the same session read as edited and a deletion on
   the other device was undone. */
function normChunk(id: string, data: unknown): Rec | null {
  if (!data) return null;
  // A document read by its fields; one that is no record reads as empty, as spreading it did.
  const D = rec(data) || {};
  try {
    if (id === 'core') return chunksOf(normalize({ ...D, sessions: [], cardio: [], draft: null })).core;
    if (id === 'draft') return { draft: normalize({ draft: D.draft || null }).draft };
    if (id.startsWith('b-'))
      return chunksOf(normalize({ bodyweights: D.bodyweights || [], measurements: D.measurements || [] }))[id] || {};
    return chunksOf(normalize({ sessions: D.sessions || [], cardio: D.cardio || [] }))[id] || { sessions: [] };
  } catch (e) {
    // A document normalize() cannot read is compared as it came.
    log('sync-norm', e);
    return D;
  }
}
/** The workout in progress a draft document holds, as normalize() keeps it, or null. */
const draftOf = (D: Rec | null): DraftLike | null => normalize({ draft: (D && D.draft) || null }).draft;
/** A document's merge base: the fingerprint of every record (by list), field and setting it holds; for the draft, the copy itself too. */
export function baseOf(id: string, data: unknown): Base | null {
  if (!data) return null;
  const D = normChunk(id, data) || {};
  const hl = (list: unknown): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const x of arr(list) || []) {
      const R = rec(x);
      if (R && typeof R.id === 'string') o[R.id] = Hx(x);
    }
    return o;
  };
  if (id === 'core') {
    const b: Required<Pick<Base, 'a' | 'f' | 's'>> = { a: {}, f: {}, s: {} };
    for (const k of CORE_ARR) b.a[k] = hl(D[k]);
    for (const k of CORE_FIELDS) b.f[k] = Hx(D[k]);
    const S = rec(D.settings) || {};
    for (const k in S) b.s[k] = Hx(S[k]);
    return b;
  }
  // The agreed copy is a copy of its own: normalize rebuilds a workout in place and the logger edits the one in
  // progress in place, so the document's own object would change under the note as the lifter ticks sets.
  if (id === 'draft') {
    const d = draftOf(D);
    return { d: Hx(D.draft), draft: d ? draftOf({ draft: parseJson(JSON.stringify(d)) }) : null };
  }
  if (id.startsWith('b-')) return { a: { bodyweights: hl(D.bodyweights), measurements: hl(D.measurements) } };
  return { a: { sessions: hl(D.sessions), cardio: hl(D.cardio) } };
}
/** Two copies of a document merged against their base, record by record (above). */
export function mergeChunk(
  id: string,
  base: Base | null | undefined,
  local: unknown,
  remote: unknown,
  remoteWins: boolean,
  stat: { conflicts: number }
): Rec {
  const l = normChunk(id, local || emptyChunk(id)) || {},
    r = normChunk(id, remote || emptyChunk(id)) || {};
  if (id === 'core') {
    const out: Rec = { ...l };
    const ba = (base && base.a) || null,
      bf = (base && base.f) || {},
      bs = (base && base.s) || {};
    for (const k of CORE_ARR) out[k] = merge3List(ba ? ba[k] || {} : null, l[k], r[k], remoteWins, stat);
    for (const k of CORE_FIELDS) {
      const v = merge3Val(base ? bf[k] : '?', l[k], r[k], remoteWins, stat);
      if (v === undefined) delete out[k];
      else out[k] = v;
    }
    const ls = rec(l.settings) || {},
      rs = rec(r.settings) || {};
    const settings: Rec = {};
    out.settings = settings;
    /* A setting absent from the base was absent, not unknown: a key one
       side added (Your gym, an accent) or brought back by Undo is a change on
       that side, not a conflict the other side's absence could win. */
    for (const k of new Set([...Object.keys(ls), ...Object.keys(rs)])) {
      const v = merge3Val(base ? (k in bs ? bs[k] : Hx(undefined)) : '?', ls[k], rs[k], remoteWins, stat);
      if (v !== undefined) settings[k] = v;
    }
    return out;
  }
  if (id === 'draft') {
    // One workout open on two phones: the same workout on both sides and in the base, neither an edit of a
    // saved session, merges exercise by exercise and set by set against the copy both agreed on (mergeWorkout).
    const ld = draftOf(l),
      rd = draftOf(r),
      bd = base && base.draft && !base.draft.editingId ? base.draft : null;
    if (bd && ld && rd && ld.id === rd.id && bd.id === ld.id && !ld.editingId && !rd.editingId)
      return { draft: mergeWorkout(bd, ld, rd, remoteWins, stat) };
    // Closed on one side (finished or discarded) while the other ticked on: closed stays closed, whichever edit was
    // later, since closing is the lifter's call; the sets ticked since are kept by keepLost (joined to the saved session).
    if (bd && ((!rd && ld && ld.id === bd.id) || (!ld && rd && rd.id === bd.id))) return { draft: null };
    /* The same with the next workout started on the side that closed it, which notes the one it follows: it stays open,
       and the sets ticked late in the closed one join its session (were the later edit to win, a phone behind would
       bring the finished workout back open on both and save the next one away as a session). A workout chosen at a
       first sign-in follows nothing, so there the later edit still decides (S-13). */
    if (bd && ld && rd && ld.id === bd.id && rd.follows === bd.id) return { draft: r.draft };
    if (bd && ld && rd && rd.id === bd.id && ld.follows === bd.id) return { draft: l.draft };
    // Otherwise one session in progress is one record: the later edit replaces the other (keepLost keeps the other's sets).
    const v = merge3Val(base ? base.d : '?', l.draft || null, r.draft || null, remoteWins, stat);
    return { draft: v === undefined ? null : v };
  }
  if (id.startsWith('b-')) {
    const ba = (base && base.a) || null;
    const out: Rec = {};
    for (const k of ['bodyweights', 'measurements']) {
      const v = merge3List(ba ? ba[k] || {} : null, l[k], r[k], remoteWins, stat);
      if (v.length) out[k] = v;
    }
    return out;
  }
  const ba = (base && base.a) || null;
  const out: Rec = { sessions: merge3List(ba ? ba.sessions || {} : null, l.sessions, r.sessions, remoteWins, stat) };
  const c = merge3List(ba ? ba.cardio || {} : null, l.cardio, r.cardio, remoteWins, stat);
  if (c.length) out.cardio = c;
  return out;
}
/* Put one merged document back into state. */
function applyChunk(id: string, data: Rec | null): void {
  if (id === 'core') {
    const c = data || {};
    setState(
      normalize({
        ...state,
        version: c.version,
        settings: c.settings,
        exercises: c.exercises,
        routines: c.routines,
        activeRoutineId: c.activeRoutineId,
        deloadWeek: c.deloadWeek,
        injuries: c.injuries,
        trash: c.trash
      })
    );
  } else if (id.startsWith('b-')) {
    const c = data || {};
    setState(
      normalize({
        ...state,
        bodyweights: [...state.bodyweights.filter(q => bodyChunkOf(q.date) !== id), ...(arr(c.bodyweights) || [])],
        measurements: [...state.measurements.filter(q => bodyChunkOf(q.date) !== id), ...(arr(c.measurements) || [])]
      })
    );
  } else if (id === 'draft') setState(normalize({ ...state, draft: data ? data.draft : null }));
  else
    setState(
      normalize({
        ...state,
        sessions: [...state.sessions.filter(q => chunkOf(q.date) !== id), ...(arr(data && data.sessions) || [])],
        cardio: [...(state.cardio || []).filter(q => chunkOf(q.date) !== id), ...(arr(data && data.cardio) || [])]
      })
    );
}

/* ---------- what changed on this device ---------- */

/* When each document last changed on this device. It decides conflicts, so it
   is tracked per document: an edit to a session never makes an older
   routine edit look new. Kept across reloads. */
/* Called on every save, so it only notes the time; the hashing runs once the
   taps pause, and again before any sync, so logging a set stays instant. */
let trackT: number | null = null;
function markEdit(): void {
  if (!cloud.pendAt) cloud.pendAt = Date.now();
  clearTimer(trackT);
  trackT = setTimeout(trackEdits, SYNC_MS.track);
}
/** Notes which documents changed since the last look, and when (editAt). */
function trackEdits(): void {
  clearTimer(trackT);
  trackT = null;
  try {
    const ch = chunksOf(state);
    const now = cloud.pendAt || Date.now();
    cloud.pendAt = null;
    let moved = false;
    for (const id of new Set([...Object.keys(ch), ...Object.keys(cloud.localH)])) {
      // Same-device change detection: key order is stable here, so the fast hash is enough.
      const h = hashStr(JSON.stringify(ch[id] || emptyChunk(id)));
      if (cloud.localH[id] !== h) {
        if (cloud.localH[id] !== undefined) {
          cloud.editAt[id] = now;
          moved = true;
        }
        cloud.localH[id] = h;
      }
    }
    if (moved) saveMeta();
  } catch (e) {
    log('sync-track', e);
  }
}
/* After adopting or merging, record the new content as seen without marking
   it as a local edit. */
/** Takes the log as it is now as this device's last-seen content. */
function resyncLocalH(): void {
  try {
    const ch = chunksOf(state);
    cloud.localH = {};
    for (const id in ch) cloud.localH[id] = hashStr(JSON.stringify(ch[id]));
    for (const id in cloud.meta) if (!(id in cloud.localH)) cloud.localH[id] = hashStr(JSON.stringify(emptyChunk(id)));
  } catch (e) {
    log('sync-track', e);
  }
}
/* The session in progress is one record, so another device finishing or
   discarding it replaces this one's (the later edit wins). Said in its own
   words rather than the generic note. */
function draftNote(prev: unknown, kept?: Kept, where = 'on another device'): void {
  const P = rec(prev);
  const d = state.draft;
  if (!P || (d && d.id === P.id)) return;
  /* Only called when the draft document itself came from the cloud, so a
     Finish or Discard made here during a sync is never put on another device.
     It says what it can see, and no more: the session it became, the workout
     that took its place, or just that it is closed. Whether a workout we
     cannot see was finished or discarded is not recorded anywhere, and the
     other phone's session document may simply not have arrived (a weak
     signal, a failed write), so "discarded" was a guess that came out wrong
     on a save that did not upload. The draft goes up last, so in the
     ordinary case the session is already here and this says saved. */
  if (P.editingId) {
    if (!d) fx.toast('The edit in progress was closed on another device.');
    else if (d.editingId) {
      const s = state.sessions.find(x => x.id === d.editingId);
      fx.toast(
        s
          ? `Now editing ${s.dayName || 'a session'}, ${fmtDate(s.date)}, opened on another device.`
          : 'A different saved session was opened for editing on another device.'
      );
    } else fx.toast('The edit in progress was replaced by the workout on another device.');
    return;
  }
  // What became of the sets ticked here (keepLost) is said with it: joined to the session the other phone
  // saved, or saved as a session of their own. A session of the workout's id with another workout now open was
  // either finished there or kept there from this copy; either way its sets are in History, and that is what is said.
  // Where it happened: another device, or another tab of this phone for a tab's merge (mergeIn).
  const saved = state.sessions.some(s => s.id === P.id);
  fx.toast(
    kept === 'joined' || kept === 'cardioJoined'
      ? `The workout in progress was saved ${where}. What was done here since was added to it.`
      : kept === 'saved' || kept === 'cardio'
        ? `The workout in progress was ${state.draft ? 'replaced by the one' : 'closed'} ${where}. Its ${kept === 'saved' ? 'ticked sets are' : 'cardio is'} saved in History.`
        : state.draft
          ? saved
            ? `The workout in progress was replaced by the one ${where}. Its ticked sets are in History.`
            : `The workout in progress was replaced by the one ${where}.`
          : saved
            ? `The workout in progress was saved ${where}.`
            : `The workout in progress was closed ${where}.`
  );
}
/* The copy of the workout in progress that loses a merge is never dropped:
   its ticked sets go into the log as a session,
   with its cardio rows and check-in, as a first link keeps another phone's
   workout (draftSession); when the same workout was finished on another
   phone (a session of its id is in the log), the sets join that session row
   by row against the copy both agreed on, and its cardio rows join the log's
   cardio, as Finish saves them (joining the sets alone would
   drop a copy with cardio and no ticked set whole). A copy
   that lost nothing (the same workout, still open), an edit of a saved
   session, or one with nothing ticked and no cardio is left alone. Only a
   copy that carried changes the account did not have is kept: the callers
   pass the local copy when it was dirty, and the account's copy a later edit
   here replaced. */
/** What became of a losing copy (keepLost): its sets saved as a session, joined to the one saved elsewhere, its cardio alone saved, or nothing. */
type Kept = 'saved' | 'joined' | 'cardio' | 'cardioJoined' | null;
/** Keeps a losing copy's ticked sets and cardio (above); says what was done, for the toast. */
function keepLost(
  lost: DraftLike | null | undefined,
  now: DraftLike | null,
  agreed: DraftLike | null | undefined,
  remoteWins: boolean,
  tabs = false
): Kept {
  if (!lost || lost.editingId || (now && now.id === lost.id)) return null;
  const kept = draftSession(lost),
    cardio = draftCardio(lost);
  if (!kept && !cardio.length) return null;
  const was = agreed && agreed.id === lost.id ? agreed : null;
  const have = state.sessions.find(q => q.id === lost.id);
  if (have) {
    /* The agreed copy is the base, an agreed copy with nothing ticked an
       empty one (read as none, two identical sets ticked
       one on each phone would be matched as one). */
    const base = was ? draftSession(was, true) : null;
    const stat = { conflicts: 0 };
    // With no agreed copy (a note from a build before r56.1) the saved session's values stand where the two differ,
    // and only the rows this copy has and it lacks are added: Finish's duration and plan are not this copy's to undo.
    const joined = kept ? mergeSession(base, kept, have, base ? remoteWins : true, stat) : have;
    /* Its cardio rows merge against the agreed copy's, record by record, as
       its sets do: an edit made here is kept, a row the other phone deleted
       stays deleted (with the log's row standing as it was,
       an edit here would be lost and a deletion there come back). */
    const norm = (l: readonly unknown[]): CardioEntry[] => l.map(c => cleanCardio(c));
    const ids = new Set(
      [...(was ? draftCardio(was) : []), ...cardio].map(c => c.id).filter(x => typeof x === 'string')
    );
    const bh: Record<string, string> = {};
    for (const c of norm(was ? draftCardio(was) : [])) if (typeof c.id === 'string') bh[c.id] = Hx(c);
    const theirs = state.cardio.filter(c => ids.has(c.id));
    const merged = merge3List(was ? bh : null, norm(cardio), theirs, base ? remoteWins : true, stat);
    const cardioNow = [...state.cardio.filter(c => !ids.has(c.id)), ...merged];
    const sets = canon(joined) !== canon(have),
      rows = canon(normalize({ cardio: cardioNow }).cardio) !== canon(state.cardio);
    if (!sets && !rows) return null;
    setState(
      normalize({ ...state, sessions: state.sessions.map(q => (q.id === lost.id ? joined : q)), cardio: cardioNow })
    );
    edited(joined.date);
    conflictNote(stat, tabs);
    return sets ? 'joined' : 'cardioJoined';
  }
  // Closed on the other phone with no session of its id (discarded there): what was done here is kept, as its ticked sets are.
  setState(
    normalize({
      ...state,
      sessions: kept ? [...state.sessions, kept] : state.sessions,
      cardio: unionById(state.cardio, cardio)
    })
  );
  edited(lost.date);
  return kept ? 'saved' : 'cardio';
}
/** Notes an edit of the half-month document of a date made here now (keepLost), so a later merge of it reads this device's change as the later one; the flush that follows carries it. */
function edited(date: string): void {
  cloud.editAt[chunkOf(date)] = Date.now();
  saveMeta();
}
/** Says what became of the account's copy of a workout that lost a merge here (keepLost): the sets ticked or the cardio logged on the other phone, saved, or added to the session saved here. */
function lostNote(kept: Kept): void {
  if (kept === 'saved') fx.toast('Sets ticked on another device were saved in History.');
  else if (kept === 'joined') fx.toast('Sets ticked on another device were added to the session saved here.');
  else if (kept === 'cardio') fx.toast('Cardio logged on another device was saved in History.');
  else if (kept === 'cardioJoined') fx.toast('Cardio logged on another device was added to the session saved here.');
}
/** The half-month document of a workout read from the account and taken in as a pull takes it (adopted, or merged with this device's changes to it), when this device has not pulled it since the workout was finished elsewhere (keepLost): the session is then here to join. */
async function sessionFromCloud(d: DraftLike, legB: Base | null): Promise<void> {
  if (d.editingId || state.sessions.some(q => q.id === d.id)) return;
  const id = chunkOf(d.date);
  const sn = await withTimeout(ref(id).get(), SYNC_MS.net, 'sync-read');
  const sb = sn && sn.exists ? rec(sn.data()) : null;
  ownWrite(id, sb);
  if (!sb || typeof sb.json !== 'string') return;
  const data = parseJson(sb.json);
  const m = cloud.meta[id],
    h = hashStr(sb.json);
  if (m && m.h === h) return;
  const mine = chunksOf(state)[id] || emptyChunk(id);
  const localDirty = !m || hashStr(JSON.stringify(mine)) !== m.h;
  const et = Number(sb.et) || Number(sb.at) || 0;
  if (!localDirty) applyChunk(id, rec(data));
  else {
    applyChunk(id, mergeChunk(id, baseFor(id, m, legB), mine, data, et > (cloud.editAt[id] || 0), { conflicts: 0 }));
    cloud.editAt[id] = Math.max(cloud.editAt[id] || 0, et);
  }
  // The account's copy is now the agreed base, as after a pull; what this device adds to it is its own later edit.
  cloud.meta[id] = { h, at: Number(sb.at), b: baseOf(id, data) };
  saveMeta();
}
/** Says how many records were edited on two devices, if any (the later edit kept). */
/* What a clash kept, in words that are true of it. Between devices the later edit is kept, by each document's time
   of edit. Between two tabs of one phone the tab merging keeps the other tab's copy (mergeIn): when both changed one
   item before either heard the other, that copy may be the earlier change, so the words say whose was kept, not
   that it was later (not "The later edit was kept" of the earlier one). */
/** Says how many items were changed in two places at once, and which copy was kept: the later edit between devices (tabs false), the other tab's between tabs. */
function conflictNote(stat: { conflicts: number }, tabs = false): void {
  const n = stat.conflicts;
  if (!n) return;
  log(
    'sync-conflict',
    `${n} record(s) edited ${tabs ? "in two tabs; kept the other tab's copy" : 'on two devices; kept the later edit'}`
  );
  const items = `${n} item${n === 1 ? ' was' : 's were'}`;
  fx.toast(
    tabs
      ? `${items} changed in two tabs at once. The other tab's change${n === 1 ? ' was' : 's were'} kept.`
      : `${items} edited on two devices. The later edit was kept.`
  );
}
/** What a write of a document expects it to hold, from the document as read (its record, or null when there is none). */
function seenOf(d: Rec | null): CloudSeen {
  if (!d) return null;
  if (typeof d.w === 'string') return { w: d.w };
  const at = Number(d.at);
  return { at: d.at === undefined || d.at === null || !Number.isFinite(at) ? null : at };
}
/** Whether the account holds this device's own unanswered write of a document, read as `d`: then its
    note is the copy written, as if the answer had come, so what was deleted here since is read as deleted, not as
    added on the account (else a session deleted after a lost answer comes back, and one phone alone is
    told a record was edited on two devices). Taken only for the account and the note it was sent from. */
function ownWrite(id: string, d: Rec | null): void {
  const s = cloud.sent[id];
  if (!s) return;
  const m = cloud.meta[id];
  if (d && d.w === s.w && s.uid === cloud.uid && (m ? m.h : '') === s.from) cloud.meta[id] = s.note;
  delete cloud.sent[id];
  saveMeta();
}
/** A new write mark: this device's id and a fresh id, so no two writes of a document, on any device, carry the same one. */
const writeMark = (): string => `${cloud.devId || 'dev'}.${uid()}`;
/* ---------- the profile photo in the account (V 2026-11-08) ----------
   One document of its own (`photo`), beside the log's and never one of them
   (isChunkId), so no merge reads it and builds before 2.34 leave it alone. It
   holds the photo as a JPEG data address, or null once removed, so a removal
   reaches every phone as a change of its own. Of the phone's copy and the
   account's, the later change is kept, by the time each was made (`et`): a
   change here still to be sent is never replaced by an older one, and a write
   lands only over the copy read (setIf), as the log's do. A photo kept by 2.33,
   with no note of an account, goes up to the account this phone syncs with
   when that account has none. Every step is caught here: a failure leaves the
   change marked to be sent, and the next sync tries again. */
/** Settles the phone's photo against the account's document as read (`d`, null when the account has none). */
async function photoReconcile(d: Rec | null): Promise<void> {
  const me = cloud.uid;
  if (!me) return;
  let remote: { et: number; url: string | null } | null = null;
  if (d && typeof d.json === 'string') {
    try {
      remote = { et: Number(d.et) || Number(d.at) || 0, url: photoOf(parseJson(d.json)) };
    } catch (e) {
      // A document that is not JSON is read as none: the phone's photo, if it has one, replaces it.
      log('photo-parse', e);
    }
  }
  const n = photoNote();
  // A copy noted for another account: kept by "Keep on this phone and sign out" with a change that account had not
  // taken (account.ts), or left by a sign-out stopped half way. This account's photo replaces it.
  if (n && n.uid !== '' && n.uid !== me) {
    photoTook(remote ? remote.url : null, remote ? remote.et : 0, me);
    return;
  }
  const held = photoHeld();
  if (n && n.up) {
    if (remote && remote.et > n.et) photoTook(remote.url, remote.et, me);
    else await photoSend(held, n.et, d, me);
    return;
  }
  if (remote) {
    if (remote.url !== held || !n || n.et !== remote.et) photoTook(remote.url, remote.et, me);
    return;
  }
  if (held) await photoSend(held, n ? n.et : Date.now(), null, me);
}
/** Takes the account's photo here, and redraws what shows it. */
function photoTook(url: string | null, et: number, me: string): void {
  const was = photoHeld();
  photoTake(url, et, me);
  if (was !== url) {
    fx.setSaveState();
    fx.rerenderKeepScroll();
  }
}
/** Writes the phone's photo (or its removal), changed at `et`, over the account's copy as read (`d`). */
async function photoSend(url: string | null, et: number, d: Rec | null, me: string): Promise<void> {
  const doc: CloudDoc = { v: 1, at: Date.now(), et, w: writeMark(), json: JSON.stringify(url) };
  try {
    if (await withTimeout(ref(PHOTO_DOC).setIf(doc, seenOf(d)), SYNC_MS.net, 'photo-write')) photoSent(et, me);
    // Another phone wrote it first: the next sync reads that copy and keeps the later change.
    else log('photo-race', { et });
  } catch (e) {
    // Offline or refused: the change stays marked to be sent.
    log('photo-write', e);
  }
}
/** Settles the photo with the account now: the account's copy read, then the later change kept or sent. Run in the
    sync's queue (cq); Sign out awaits it, so a change made here is sent before the phone lets go of it. */
export async function photoFlush(): Promise<void> {
  if (!cloud.on || !cloud.db) return;
  try {
    const s = await withTimeout(ref(PHOTO_DOC).get(), SYNC_MS.net, 'photo-read');
    await photoReconcile(s.exists ? rec(s.data()) : null);
  } catch (e) {
    // Offline or refused: the change stays marked to be sent, and the next sync sends it.
    log('photo-read', e);
  }
}
/** Sends a change to the photo made here, read against the account's copy first; nothing while not syncing. */
export function photoSyncSoon(): void {
  if (!cloud.on || !cloud.db) return;
  void cq(photoFlush);
}

/* Whether this device holds a change the account does not have yet, by the
   same test a sync uses, without sending anything: the status still reads
   synced for the second or so before the next sync starts. */
/** Whether anything here has not reached the account yet. */
export function hasUnsent(): boolean {
  if (!cloud.on) return false;
  if (cloud.status !== 'synced' || photoPending()) return true;
  try {
    const ch = chunksOf(state);
    for (const id of new Set([...Object.keys(ch), ...Object.keys(cloud.meta)])) {
      if (!isChunkId(id)) continue;
      const data = ch[id] || emptyChunk(id);
      if (!data) continue;
      const m = cloud.meta[id];
      if (!m || m.h !== hashStr(JSON.stringify(data))) return true;
    }
  } catch (e) {
    log('sync-unsent', e);
    return true;
  }
  return false;
}
/** Schedules a flush once the taps pause (SYNC_MS.flush). */
function cloudSoon(): void {
  if (!cloud.on) return;
  cloud.dirtyAt = Date.now();
  clearTimer(cloud.t);
  cloud.t = setTimeout(() => cq(cloudFlush), SYNC_MS.flush);
}

/* ---------- sending and pulling ---------- */

/** The documents that differ from the copy last agreed with the account, each with its text and hash; one an older build synced, identical to the account's, is given its base and the notes saved. */
function changedDocs(): { id: string; json: string; h: string }[] {
  const ch = chunksOf(state);
  const ids = new Set([...Object.keys(ch), ...Object.keys(cloud.meta)]);
  const todo: { id: string; json: string; h: string }[] = [];
  let backfilled = false;
  for (const id of ids) {
    if (!isChunkId(id)) continue;
    const data = ch[id] || emptyChunk(id);
    if (!data) continue;
    const json = JSON.stringify(data);
    const h = hashStr(json);
    const m = cloud.meta[id];
    // Synced by an older build: identical to the cloud copy, so it is its own base.
    if (m && !m.b && m.h === h) {
      m.b = baseOf(id, data);
      backfilled = true;
    }
    if (!m || m.h !== h) todo.push({ id, json, h });
  }
  if (backfilled) saveMeta();
  return todo;
}

/** What the sync line says when a document is over the size cap, by which one it is. */
function tooBigSaid(tooBig: readonly string[]): string {
  return tooBig.includes('core')
    ? 'Routines and settings are too large to sync. Export a backup.'
    : tooBig.some(i => i.startsWith('b-'))
      ? 'A year of body data is too large to sync. Export a backup.'
      : tooBig.includes('draft')
        ? 'The workout in progress is too large to sync. Export a backup.'
        : 'One month of sessions is too large to sync. Export a backup.';
}

/** Writes every document that changed here to the account, merging each the account changed meanwhile. */
export async function cloudFlush(): Promise<void> {
  if (!cloud.on) return;
  notesCatchUp();
  /* No pull has come through since the sync started (it failed, or got no
     answer): this one pulls first, which then sends. A retry that only sent
     would find nothing to send and say Synced, the account's own changes
     never read. */
  if (!pulled) return cloudPull();
  if (trackT || cloud.pendAt) trackEdits();
  const todo = changedDocs();
  /* The draft goes up last: Finish empties it and adds the
     session, and written first, a device pulling in between saw the workout
     gone and no session, and said it was discarded. */
  todo.sort((a, b) => +(a.id === 'draft') - +(b.id === 'draft'));
  if (!todo.length) {
    if (cloud.status !== 'synced') {
      cloud.last = Date.now();
      saveMeta();
      setCloud('synced');
    }
    return;
  }
  if (offline()) {
    setCloud('offline');
    return;
  }
  setCloud('saving');
  try {
    let adopted = false,
      moreBody = false,
      again = false;
    const stat = { conflicts: 0 };
    let dn: {
      prev: DraftLike | null;
      sessions0: unknown;
      kept: Kept;
      lost: Kept;
    } | null = null;
    const tooBig: string[] = [];
    const raced: string[] = [];
    const legB = legacyBodyBase();
    for (const x of todo) {
      let done = false;
      for (let tries = 0; tries < WRITE_TRIES && !done; tries++) {
        /* Read before write. If another device changed this document since we
           last agreed on it, merge record by record instead of overwriting. */
        const snap = await withTimeout(ref(x.id).get(), SYNC_MS.net, 'sync-read');
        ownWrite(x.id, snap && snap.exists ? rec(snap.data()) : null);
        const m = cloud.meta[x.id];
        /* Sets logged while that read was in flight are in state, not in the
           copy taken before it. Work from the current document, or the merge
           below would write the older copy back and lose them. */
        let json = JSON.stringify(chunksOf(state)[x.id] || emptyChunk(x.id));
        const b = snap && snap.exists ? rec(snap.data()) : null;
        // The write below goes through only while the account's copy is still this one.
        const seen = seenOf(b);
        // The account's copy as taken in here, when it was: the base of the next merge if the write finds it changed.
        let took: SyncNote | null = null;
        /* Changed in the cloud means its content differs from what we last
           agreed on. Timestamps are not compared: they come from each device's
           own clock, and one running behind made a newer write look older. */
        if (b && typeof b.json === 'string' && (!m || hashStr(b.json) !== m.h)) {
          let rd: unknown = null;
          try {
            rd = parseJson(b.json);
          } catch (e) {
            log('sync-parse', e);
          }
          if (rd) {
            const ret = Number(b.et) || Number(b.at);
            const remoteWins = ret > (cloud.editAt[x.id] || 0);
            const merged = mergeChunk(x.id, baseFor(x.id, m, legB), parseJson(json), rd, remoteWins, stat);
            cloud.editAt[x.id] = Math.max(cloud.editAt[x.id] || 0, ret);
            // The workout here before this flush took anything in, for what is said after it; each merge reads the one here now.
            const prev = x.id === 'draft' ? state.draft : null;
            if (x.id === 'draft' && !dn) dn = { prev, sessions0: state.sessions, kept: null, lost: null };
            const agreed = x.id === 'draft' && m && m.b ? m.b.draft : null;
            const mergedDraft = x.id === 'draft' ? draftOf(merged) : null;
            // This copy lost (closed or replaced): the session it may have become on the other phone is read first,
            // before anything here changes, so its sets join that session rather than making a second one of its id,
            // and a read that fails (the connection gone mid-flush) leaves the workout here as it was, for the retry.
            if (prev && (!mergedDraft || mergedDraft.id !== prev.id)) await sessionFromCloud(prev, legB);
            applyChunk(x.id, merged);
            adopted = true;
            writeTakenIn();
            took = { h: hashStr(b.json), at: Number(b.at), b: baseOf(x.id, rd) };
            if (x.id === 'draft' && dn) {
              // The copy that lost (this device's, dirty here, or the account's, which a later edit here replaced) keeps its sets.
              const remoteDraft = draftOf(rec(rd));
              dn.kept = keepLost(prev, mergedDraft, agreed, remoteWins) || dn.kept;
              dn.lost = keepLost(remoteDraft, mergedDraft, agreed, remoteWins) || dn.lost;
              if (dn.kept || dn.lost || canon(state.sessions) !== canon(dn.sessions0)) again = true;
            }
            if (x.id === 'core' && absorbLegacy(legacyBody(rec(rd)))) moreBody = true;
            json = JSON.stringify(chunksOf(state)[x.id] || emptyChunk(x.id));
            if (hashStr(json) === hashStr(b.json)) {
              cloud.meta[x.id] = took;
              saveMeta();
              done = true;
              continue;
            }
          }
        }
        // One document over the size cap must not stop the others from syncing.
        if (json.length > DOC_MAX) {
          tooBig.push(x.id);
          log('sync-flush', { code: 'too_big', id: x.id, len: json.length });
          done = true;
          continue;
        }
        const at = Date.now();
        const doc: CloudDoc = { v: 1, at, et: cloud.editAt[x.id] || at, w: writeMark(), json };
        // Kept until the answer comes, so a write applied whose answer is lost is known as this device's own (ownWrite).
        cloud.sent[x.id] = {
          w: doc.w,
          uid: cloud.uid || '',
          from: m ? m.h : '',
          note: { h: hashStr(json), at, b: baseOf(x.id, parseJson(json)) }
        };
        saveMeta();
        const wrote = await withTimeout(ref(x.id).setIf(doc, seen), SYNC_MS.net, 'sync-write');
        delete cloud.sent[x.id];
        if (wrote) {
          cloud.meta[x.id] = { h: hashStr(json), at, b: baseOf(x.id, parseJson(json)) };
          saveMeta();
          done = true;
        } else {
          /* Another device wrote it between the read and this write (landing over that write would take its
             sets off every phone, unsaid). What was taken in from the copy read is
             merged here now, so that copy is the base the next read is merged against. */
          log('sync-race', { id: x.id, tries: tries + 1 });
          if (took) {
            cloud.meta[x.id] = took;
            saveMeta();
          }
        }
      }
      if (!done) raced.push(x.id);
    }
    if (adopted) {
      invalidate();
      writeTakenIn();
      resyncLocalH();
      if (!ui.modal) fx.rerenderKeepScroll();
      conflictNote(stat);
      if (dn) {
        draftNote(dn.prev, dn.kept);
        lostNote(dn.lost);
      }
    }
    /* Written first by another device every time it was tried: not synced, and tried again later, as after a
       dropped connection (cloudFail's waits), with nothing here lost. */
    if (raced.length) {
      log('sync-flush', { code: 'raced', ids: raced });
      cloudFail({ code: 'raced', message: 'Another device was saving at the same moment.' });
      return;
    }
    cloud.retry = 0;
    // Weigh-ins found in an older core go to their body documents on the next pass, as do the sets a losing copy kept.
    if (moreBody || again) cloudSoon();
    if (tooBig.length) {
      saveMeta();
      setCloud('offline', tooBigSaid(tooBig));
      return;
    }
    cloud.last = Date.now();
    saveMeta();
    setCloud('synced');
  } catch (e) {
    log('sync-flush', e);
    cloudFail(e);
  }
}
/** One document of the account as read: its write time, its edit time, its data and the hash of its text. */
type Remote = { at: number; et: number; data: unknown; h: string };

/** The account's documents as read, each with its times, its data and the hash of its text; one that cannot be read is left out and logged. */
function remoteDocs(docs: readonly { id: string; exists: boolean; data(): unknown }[]): Record<string, Remote> {
  const remote: Record<string, Remote> = {};
  for (const d of docs) {
    if (!d.exists || !isChunkId(d.id)) continue;
    const b = rec(d.data());
    ownWrite(d.id, b);
    if (!b || typeof b.json !== 'string') continue;
    try {
      remote[d.id] = {
        at: Number(b.at) || 0,
        et: Number(b.et) || Number(b.at) || 0,
        data: parseJson(b.json),
        h: hashStr(b.json)
      };
    } catch (e) {
      log('sync-parse', e);
    }
  }
  return remote;
}

/** A first sign-in on a phone that holds a log of its own: the two combined (below), the account's copy made the agreed base; true when the other phone's workout in progress was saved as a session. */
function mergeFirstLink(mine: State, rState: State, rids: readonly string[], remote: Record<string, Remote>): boolean {
  // a routine or exercise made here is the phone's own too, never replaced by the account's
  const base = realCount(mine) > realCount(rState) ? mine : rState,
    other = base === mine ? rState : mine;
  /* Settings come from the side with more sessions, but exercises and
     routines are combined by id (that side's copy wins a clash), so a
     custom exercise or routine made on the other device is not lost and
     its logged sets keep their name. Of two workouts in progress, this device's stays in progress and the other's ticked sets and cardio are saved, as Finish saves them, never dropped. */
  const aside = state.draft && rState.draft && rState.draft.id !== state.draft.id ? rState.draft : null;
  const kept = aside ? draftSession(aside) : null;
  const keptDraft = !!kept && ![...mine.sessions, ...rState.sessions].some(x => x.id === kept.id);
  setState(
    normalize({
      ...base,
      exercises: unionById(base.exercises, other.exercises),
      routines: unionById(base.routines, other.routines),
      sessions: unionById(mine.sessions, keptDraft && kept ? [...rState.sessions, kept] : rState.sessions),
      bodyweights: unionById(mine.bodyweights, rState.bodyweights),
      measurements: unionById(mine.measurements, rState.measurements),
      cardio: unionById(mine.cardio, aside ? [...rState.cardio, ...draftCardio(aside)] : rState.cardio),
      trash: unionById(arr(state.trash) || [], arr(rState.trash) || []),
      draft: state.draft || rState.draft
    })
  );
  // The cloud copy becomes the agreed base, so the merged result is what
  // the flush writes, rather than being merged a second time.
  for (const id of rids) {
    cloud.meta[id] = { h: remote[id].h, at: remote[id].at, b: baseOf(id, remote[id].data) };
    cloud.editAt[id] = Date.now();
  }
  return keptDraft;
}

/** Every document the account changed since the copy last agreed, taken in: as it is when nothing changed here, else merged record by record (mergeChunk), its copy made the agreed base. Null parts when nothing changed. The documents taken as they are go into adoptedIds, and weigh-ins an older core held into leg. */
function mergeChanged(
  local: Record<string, Rec | null>,
  remote: Record<string, Remote>,
  rids: readonly string[],
  legB: ReturnType<typeof legacyBodyBase>,
  stat: { conflicts: number },
  adoptedIds: Set<string>,
  leg: { bodyweights: unknown[]; measurements: unknown[] }
): { parts: Record<string, Rec | null> | null; draftIn: boolean; draftMerged: boolean; draftRemoteWins: boolean } {
  let parts: Record<string, Rec | null> | null = { ...local };
  let draftIn = false,
    draftMerged = false,
    draftRemoteWins = false;
  let any = false;
  for (const id of rids) {
    const r = remote[id],
      m = cloud.meta[id];
    // Unchanged in the cloud since we last agreed. Content, not clocks, decides.
    if (m && r.h === m.h) continue;
    if (id === 'draft') draftIn = true;
    const lJson = JSON.stringify(local[id] || emptyChunk(id));
    const localDirty = !m || hashStr(lJson) !== m.h;
    if (!localDirty) {
      parts[id] = rec(r.data);
      adoptedIds.add(id);
      any = true;
      continue;
    }
    if (id === 'draft') {
      draftMerged = true;
      draftRemoteWins = r.et > (cloud.editAt[id] || 0);
    }
    if (id === 'core') {
      const L = legacyBody(rec(r.data));
      leg.bodyweights.push(...L.bodyweights);
      leg.measurements.push(...L.measurements);
    }
    parts[id] = mergeChunk(
      id,
      baseFor(id, m, legB),
      local[id] || emptyChunk(id),
      r.data,
      r.et > (cloud.editAt[id] || 0),
      stat
    );
    cloud.editAt[id] = Math.max(cloud.editAt[id] || 0, r.et);
    // The cloud copy is now the agreed base; the merge result is written by the flush below.
    cloud.meta[id] = { h: r.h, at: r.at, b: baseOf(id, r.data) };
    any = true;
  }
  if (!any) parts = null;
  return { parts, draftIn, draftMerged, draftRemoteWins };
}

/* Pull what other devices wrote. Per document:
   - changed in the cloud only: take the cloud copy.
   - changed on both: merge record by record (see mergeChunk).
   - first link of a device that already had its own data: merge sessions, cardio and body logs from both (never demo data), keep the side
     with more real sessions for settings, routines and exercises combined; no Undo (it would put this device's copy back as the truth,
     deleting the account's own records everywhere). */
/** Reads every document of the account and takes in what other devices wrote, then flushes. */
export async function cloudPull(): Promise<void> {
  if (!cloud.on || !cloud.db) return;
  if (trackT || cloud.pendAt) trackEdits();
  if (offline()) {
    setCloud('offline');
    return;
  }
  setCloud('connecting');
  let snap: Awaited<ReturnType<ReturnType<CloudDb['collection']>['get']>>;
  try {
    snap = await withTimeout(cloud.db.collection(`data/users/${cloud.uid}`).get(), SYNC_MS.net, 'sync-pull');
  } catch (e) {
    log('sync-pull', e);
    cloudFail(e);
    return;
  }
  cloud.lastPull = Date.now();
  pulled = true;
  // What the other tab synced while this one waited for the account is read before this tab's notes are.
  notesCatchUp();
  // The profile photo, from the same listing: a document of its own, so nothing below reads it.
  const ph = snap.docs.find(x => x.id === PHOTO_DOC && x.exists);
  await photoReconcile(ph ? rec(ph.data()) : null);
  const remote = remoteDocs(snap.docs);
  const rids = Object.keys(remote);
  if (!rids.length) {
    // an empty account takes this device's log as it is, less its demo data, as a merge does
    if (!Object.keys(cloud.meta).length && hasDemo(state)) {
      stripDemo(state);
      demoRestore();
      invalidate();
      saveNow();
      fx.render();
      fx.toast('Demo data cleared. It never goes into an account.');
    }
    await cloudFlush();
    return;
  }
  const local = chunksOf(state);
  const first = !Object.keys(cloud.meta).length;
  // For a workout merged below: the copy both agreed on, read before the notes take the account's copy, and whether the account's edit is later.
  const agreedDraft = cloud.meta.draft && cloud.meta.draft.b ? cloud.meta.draft.b.draft : null;
  let draftMerged = false,
    draftRemoteWins = false;
  let parts: Record<string, Rec | null> | null = null,
    merged = false,
    draftIn = false,
    keptDraft = false;
  const stat = { conflicts: 0 };
  const adoptedIds = new Set<string>();
  const leg: { bodyweights: unknown[]; measurements: unknown[] } = { bodyweights: [], measurements: [] };
  const legB = legacyBodyBase();
  if (first) {
    const rState = assemble(Object.fromEntries(rids.map(k => [k, rec(remote[k].data)])));
    const mine = { ...state };
    stripDemo(mine); // demo data never goes into an account
    if (!holdsLog()) {
      // by what is here, not by whether a save was found at start: a first run's workout must survive a sign-in before a reopen
      parts = Object.fromEntries(rids.map(k => [k, rec(remote[k].data)]));
      rids.forEach(k => adoptedIds.add(k));
    } else {
      merged = true; // no Undo: a merge only adds, and undoing it would take the account's own sessions off every device
      keptDraft = mergeFirstLink(mine, rState, rids, remote);
    }
  } else {
    const got = mergeChanged(local, remote, rids, legB, stat, adoptedIds, leg);
    parts = got.parts;
    draftIn = got.draftIn;
    draftMerged = got.draftMerged;
    draftRemoteWins = got.draftRemoteWins;
  }
  const dr0 = state.draft;
  let kept: Kept = null,
    lost: Kept = null;
  if (parts) {
    setState(assemble(parts));
    absorbLegacy(leg);
    // A workout merged with the account's copy: the copy that lost keeps its sets (this device's, which held changes the account did not have, or the account's, which a later edit here replaced).
    if (draftMerged) {
      const remoteDraft = remote.draft ? draftOf(rec(remote.draft.data)) : null;
      kept = keepLost(dr0, state.draft, agreedDraft, draftRemoteWins);
      lost = keepLost(remoteDraft, state.draft, agreedDraft, draftRemoteWins);
    }
  }
  if (parts || merged) {
    invalidate();
    writeTakenIn();
    for (const id of adoptedIds) {
      // Mark adopted documents as agreed with the cloud copy. Normalizing can
      // change a document (a newer build adds defaults); it then differs from
      // the agreed hash, so the flush below writes the normalized form back.
      cloud.meta[id] = { h: remote[id].h, at: remote[id].at, b: baseOf(id, remote[id].data) };
    }
    saveMeta();
    resyncLocalH();
    // Ready-made routines from earlier builds' Recently deleted leave here too,
    // and the cleared list goes back to the cloud.
    {
      const n0 = state.trash.length;
      state.trash = state.trash.filter(t => !(t.kind === 'routine' && plainTemplate(t.data)));
      if (state.trash.length !== n0) saveNow();
    }
    if (!ui.modal) fx.rerenderKeepScroll();
    else fx.render();
    if (merged)
      fx.toast(
        keptDraft
          ? 'Merged this device with your cloud copy. The workout in progress on your other device is saved in History.'
          : 'Merged this device with your cloud copy'
      );
    conflictNote(stat);
    if (draftIn) draftNote(dr0, kept);
    lostNote(lost);
  } else if (first) {
    for (const id of rids) cloud.meta[id] = { h: 'x', at: remote[id].at, b: null };
  }
  await cloudFlush();
}

/* ---------- starting and stopping ---------- */

/* Set once the first cloud check has finished either way, so the welcome
   card never flashes on a device that is about to load your cloud copy. */
/** Whether the first cloud check has finished, either way. */
export let cloudChecked = false;
/** Whether a document as read (its record, or null when there is none) still holds what a write expects (`seen`). */
function stillSeen(d: Rec | null, seen: CloudSeen): boolean {
  if (!seen) return !d;
  if (!d) return false;
  if ('w' in seen) return d.w === seen.w;
  return d.w === undefined && (d.at === undefined ? null : Number(d.at)) === seen.at;
}
/* The document store the sync writes through. The account backend (scripts/cloud-supabase.js) writes
   conditionally on the server, in one step. Claude's db, which only the suites still inject as their stand-in cloud
   (CLAUDE.md), writes plainly, so its conditional write here reads, compares and writes: exact for the stand-in,
   whose documents live in one test's page or are written one request at a time. */
function storeOf(raw: CloudDbIn): CloudDb {
  return {
    collection: p => raw.collection(p),
    doc(path) {
      const d = raw.doc(path);
      return {
        get: () => d.get(),
        async setIf(doc, seen) {
          if (typeof d.setIf === 'function') return d.setIf(doc, seen);
          if (typeof d.set !== 'function') throw new Error('The cloud store cannot write.');
          const now = await d.get();
          if (!stillSeen(now && now.exists ? rec(now.data()) : null, seen)) return false;
          await d.set(doc);
          return true;
        }
      };
    }
  };
}
/* Where the cloud copy lives. The standalone app's backend
   (scripts/cloud-supabase.js) plugs in by defining window.ironlogCloud as an
   async function returning {db, userId}, where db offers doc(path).get() /
   .setIf(obj, seen) and collection(path).get() listing {id, exists, data()}.
   Claude's db (retired; the suites' stand-in) is taken first when the page
   has one. */
async function cloudProvider(): Promise<{ db: CloudDb; userId: string } | null> {
  if (window.claude && typeof window.claude.use === 'function') {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return null;
    const id = await user.id();
    return id ? { db: storeOf(db), userId: String(id) } : null;
  }
  if (typeof window.ironlogCloud === 'function') {
    const p = await window.ironlogCloud();
    return p && p.db && p.userId ? { db: storeOf(p.db), userId: String(p.userId) } : null;
  }
  return null;
}
/* A start under way (cloudInit), settled once it has decided whether the
   sync is on, before its first pull; and where that pull stands: the first
   pull of the latest start not yet tried (the first page waits for it,
   today.ts), and whether a pull has come through since the sync started
   (a flush pulls first until one has, cloudFlush). */
let starting: Promise<void> | null = null;
let starts = 0;
let firstPull = false;
let pulled = false;
/** Settles once no start of the sync is under way, so the sync then reads on or off: what a sign-in says waits for it. */
export async function cloudDecided(): Promise<void> {
  while (starting) await starting;
}
/** Whether the sync has started and its first pull is not yet tried: the first page shows only the logo until it is, so it never flashes before the account's log. It waits for the pull to be tried, not to come through, which with no answer it never does. */
export const cloudFirstPull = (): boolean => cloud.on && firstPull;
/* ---------- signing in: which log the phone holds ---------- */

/* The sync notes belong to one account (cloud.acct), and the log on the
   phone is the one they describe. Signing in to another account on this
   phone (V's call of 2026-10-20) is settled here, before any sync, by one
   rule for every path:
   - The log kept aside for the account signed in to, if there is one, comes
     back with its own notes, so it syncs as a continuation: what that account
     changed or deleted meanwhile stands. Taken back without its notes it
     synced as a first link, undoing edits and bringing back deletions on
     every phone. It is looked for whenever the notes do not
     name this account, also when they name none (Sign out, a restore, Copy
     my log in, demo data and Erase everything forget them), which would
     otherwise leave it aside for good.
   - The log here: when the notes name another account and it holds
     something of the lifter's, the question (Add it to this account, Use
     this account's log, Cancel). Add it: the log here is added, as a first
     link when nothing is kept aside for this account, else joined to the log
     kept aside, whose records win a clash. Use this account's log: the log
     here is kept aside for its account first, and a phone with no room for
     the copy keeps what it has. Cancel: nothing changes and the sign-in is
     undone. Notes that name no account have no one to ask about: the log here
     is added, as a first link adds it. Only what is the lifter's is added to
     a log kept aside (never demo data or a ready-made routine as it came),
     and with nothing of theirs here that log comes back as it was.
   - Nothing is left half done: the log is replaced and saved, then the notes
     naming this account; a save the phone refuses puts both back as they
     were and undoes the sign-in, so the next start never syncs one account's
     log under the other's notes. Undo is cleared once the log is
     another account's: a step held the log before, and undoing it would sync
     that log into this account.
   - One tab at a time: every tab hears a sign-in, and each would ask and act
     on the notes it read before. The rule runs under a lock the browser
     gives one tab at a time (Web Locks), and a tab that waited reads the
     notes, and the log with them, as the other tab left them, so it finds the
     switch made. A browser without Web Locks (Safari before 15.4) runs it at
     once. */
/** Runs fn in one tab of this app at a time (above); at once where the browser has no Web Locks. */
async function oneTab<T>(fn: () => Promise<T>): Promise<T> {
  const L = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (L && typeof L.request === 'function') return await L.request(KEY + '.account', () => fn());
  return fn();
}
/** The notes as stored now, and the log with them when another tab moved them to another account: a tab acts on what is stored, not on what it read before (above). */
function readStored(): void {
  let m: Rec | null = null,
    text: string | null = null;
  try {
    text = localStorage.getItem(SYNC_KEY);
    m = rec(parseJson(text || 'null'));
  } catch (e) {
    log('tabs', e);
  }
  if (!m) return;
  const now = typeof m.acct === 'string' ? m.acct : null;
  if (now === cloud.acct) {
    // The same account: notes for this log the other tab wrote and this one has not heard are joined in.
    if (epOf(m) === notesEp && text !== notesSeen) joinNotes(m, text);
    notesEp = epOf(m);
    return;
  }
  notesEp = epOf(m);
  notesSeen = text;
  const n = notesIn(m, 'tabs');
  cloud.meta = n.meta || {};
  cloud.sent = {};
  cloud.editAt = n.editAt || {};
  cloud.last = n.last;
  cloud.acct = now;
  setState(load());
  invalidate();
  resyncLocalH();
  fx.render();
}
/** Undoes the sign-in through the account service alone, waited for, so a tab waiting its turn finds it signed out: the notes and the log stay as they were. */
async function undoSignIn(): Promise<void> {
  const A = AUTH();
  if (!A) return;
  try {
    await A.signOut();
  } catch (e) {
    log('auth', e);
  }
}
/** Whether the log on this device holds anything the lifter made, as a first link reads it: never demo data; a routine the lifter built or a custom exercise count. */
function holdsLog(): boolean {
  const mine = { ...state };
  stripDemo(mine);
  return !!(
    realCount(mine) ||
    mine.bodyweights.length ||
    mine.measurements.length ||
    state.draft ||
    mine.cardio.length ||
    mine.routines.some(r => !plainTemplate(r) && !routineEmpty(r)) ||
    mine.exercises.some(e => e.custom)
  );
}
/** A log kept aside joined with the lifter's log here, as a first link joins them: every record of both by id (the log kept aside winning a clash), its settings, and the workout in progress here, which stays open as a first link keeps this device's, the other's ticked sets and cardio saved. */
function joinLogs(base: State, here: State): State {
  const away = base.draft && here.draft && here.draft.id !== base.draft.id ? base.draft : null;
  const kept = away ? draftSession(away) : null;
  return normalize({
    ...base,
    exercises: unionById(base.exercises, here.exercises),
    routines: unionById(base.routines, here.routines),
    sessions: unionById(base.sessions, kept ? [...here.sessions, kept] : here.sessions),
    bodyweights: unionById(base.bodyweights, here.bodyweights),
    measurements: unionById(base.measurements, here.measurements),
    cardio: unionById(base.cardio, away ? [...here.cardio, ...draftCardio(away)] : here.cardio),
    trash: unionById(arr(base.trash) || [], arr(here.trash) || []),
    draft: here.draft || base.draft
  });
}
/** Keeps the log here aside for its account, with its notes, as it stands once written (a set ticked while the copy is written makes a second copy): 'room' when the phone has no room for it. */
async function keepHere(from: string): Promise<'kept' | 'room' | 'busy'> {
  const notes = { meta: cloud.meta, editAt: cloud.editAt, last: cloud.last };
  for (let i = 0; i < KEEP_TRIES; i++) {
    const text = JSON.stringify(state);
    if (!(await keepAside(from, text, notes))) return 'room';
    if (JSON.stringify(state) === text) return 'kept';
  }
  // Changed under every copy, which taps cannot do.
  log('aside', new Error('the log kept changing while it was being kept aside'));
  return 'busy';
}
/** Settles which log the phone holds for the account signed in to (above): false when the sync must not start. */
async function takeAccount(id: string): Promise<boolean> {
  readStored();
  const from = cloud.acct;
  if (from === id) return true;
  const aside = await asideOf(id);
  /* Notes that name no account describe no account's log (they were
     forgotten, or came from a build before accounts): signing in with them
     is a first link, which keeps everything and judges nothing deleted. Kept
     as a continuation, a stale write from a tab signed out mid-sync could
     make an empty log read as deletions. */
  if (!from && !aside) {
    cloud.meta = {};
    cloud.sent = {};
    cloud.editAt = {};
    cloud.last = null;
    // The phone's log goes into the account, and a workout set aside for an edit with it.
    parkedRetag('', id);
    return true;
  }
  // Whether the log here holds anything of the lifter's, read before anything changes.
  const mine = holdsLog();
  let use = false;
  if (from && mine) {
    const a = await fx.ask(
      'A log from another account is on this phone',
      "Add it to this account, or use this account's log? Using this account's log keeps the other one on this phone until that account signs in here again.",
      'Add it to this account',
      "Use this account's log"
    );
    if (a === 'cancel') {
      // Nothing merges without an answer.
      await undoSignIn();
      return false;
    }
    use = a === 'alt';
  }
  const before = { state, meta: cloud.meta, editAt: cloud.editAt, last: cloud.last, acct: cloud.acct, ep: notesEp };
  if (use && from) {
    const k = await keepHere(from);
    if (k !== 'kept') {
      if (k === 'room')
        fx.toast('There is not enough room on this phone to keep the other log aside. Export a backup of it first.');
      await undoSignIn();
      return false;
    }
  }
  // The log for this account and the notes it goes with: the one kept aside for it, with its own, or a first link's (none).
  const n = aside ? notesIn({ meta: aside.meta, editAt: aside.editAt, last: aside.last }, 'aside') : null;
  /* With nothing of the lifter's here, the log kept aside comes back as it
     was; with something, what is the lifter's is joined to it, never demo
     data or a ready-made routine left as it came, which would put demo sessions
     and a second starter routine into the account. */
  const own = (): State => {
    const o: State = { ...state, routines: state.routines.filter(r => !plainTemplate(r) && !routineEmpty(r)) };
    stripDemo(o);
    return o;
  };
  const next = use
    ? aside
      ? aside.state
      : normalize(null)
    : aside
      ? mine
        ? joinLogs(aside.state, own())
        : aside.state
      : null;
  // Two workouts in progress: the one here stays open, and the one kept aside goes to History (joinLogs), said once the switch holds.
  const both =
    !use && !!aside && mine && !!state.draft && !!aside.state.draft && aside.state.draft.id !== state.draft.id;
  cloud.meta = (n && n.meta) || {};
  cloud.sent = {};
  cloud.editAt = (n && n.editAt) || {};
  cloud.last = n ? n.last : null;
  if (next) {
    setState(next);
    commit();
  }
  cloud.acct = id;
  newEp();
  // A device whose storage failed its check at start writes nothing, so there is nothing to keep in step there.
  const written = !device.boot || ((!next || device.ok) && saveMeta());
  if (!written) {
    setState(before.state);
    cloud.meta = before.meta;
    cloud.sent = {};
    cloud.editAt = before.editAt;
    cloud.last = before.last;
    cloud.acct = before.acct;
    notesEp = before.ep;
    // The log as it was, which the phone held before, and the notes that go with it.
    commit();
    saveMeta();
    if (use && from) await dropAside(from);
    fx.render();
    fx.toast("This phone could not save this account's log, so nothing was changed.");
    await undoSignIn();
    return false;
  }
  if (next) {
    undoForget();
    resyncLocalH();
    fx.render();
  }
  // The log here taken into the account (added, or the account's first): a workout set aside for it goes too.
  if (!use) parkedRetag(from || '', id);
  if (both)
    fx.toast('The workout in progress on this phone stays open. The one kept for this account is saved in History.');
  // The copy kept for this account is the log in use now, saved here with its notes.
  if (aside) await dropAside(id);
  return true;
}
/** Starts the sync for the account signed in, if there is one: the first pull, then every save flushes. */
export async function cloudInit(): Promise<void> {
  /* A start under way is joined: this call waits for its answer, which is
     this call's too, rather than reading the sync as off while it is still
     deciding (a sign-in made meanwhile would say "Signed in. Syncing your
     log." and nothing sync). A start of its own after it
     would ask again a question just answered Cancel (tests/storage-sync.js, S-14). */
  if (starting) {
    await starting;
    return;
  }
  if (cloud.on) return;
  const run = ++starts;
  let decided = (): void => {};
  const mine = new Promise<void>(r => {
    decided = r;
  });
  starting = mine;
  const decide = (): void => {
    if (starting === mine) starting = null;
    decided();
  };
  try {
    const pv = await cloudProvider();
    if (!pv) return;
    const db = pv.db,
      id = pv.userId;
    // Settled one tab at a time (takeAccount); a tab that waited its turn checks the account is still the one signed in.
    const go = await oneTab(async () => {
      const now = await cloudProvider();
      return !!now && now.userId === id && (await takeAccount(id));
    });
    if (!go) return;
    if (cloud.acct !== id) newEp();
    cloud.acct = id;
    saveMeta();
    cloud.db = db;
    cloud.uid = id;
    cloud.on = true;
    pulled = false;
    firstPull = true;
    setCloud('connecting');
    decide();
    if (ui.tab === 'settings') fx.render();
    await cq(cloudPull);
  } catch (e) {
    // The backend could not be reached or refused the sign-in: the app stays on this device alone, and the account panel offers a retry. Its reason is kept.
    log('auth', e);
    cloud.on = false;
    setCloud('local');
  } finally {
    decide();
    if (run === starts) firstPull = false;
    cloudChecked = true;
    // The first page waits for this check (a splash until then): after a sign-out too.
    if (
      ui.tab === 'today' &&
      !ui.modal &&
      (fx.obGate() || (!state.settings.onboarded && !state.draft && !state.sessions.some(s => !s.demo)))
    )
      fx.rerenderKeepScroll();
  }
}
/** Stops the sync. forget: the log or the account is gone, so the sync
    notes go too; else they stay with the copy kept, so signing back in to
    that account merges against them, as a sync does (as a first link the
    kept copy would undo edits and bring back deletions made since on other
    phones). A log replaced while signed out (Erase everything, a backup
    restored, Copy my log in, demo data loaded) forgets them, since the notes
    describe a log that is no longer here. */
export function cloudStop(forget?: boolean): void {
  clearTimer(cloud.t);
  cloud.on = false;
  cloud.db = null;
  cloud.uid = null;
  if (forget) {
    cloud.acct = null;
    cloud.meta = {};
    cloud.sent = {};
    cloud.editAt = {};
    cloud.last = null;
    newEp();
  }
  cloud.retry = 0;
  saveMeta();
  setCloud('local');
}

/* ---------- another tab, and leaving the page ---------- */

/* Two tabs (or the app and a second window) must not overwrite each other:
   each writing its whole state, the one that saved last would erase what the
   other had saved. So each tab hears the other's save and merges it into its own
   state, record by record, with this tab's last save as the base: changes
   made only there are taken, changes made only here are kept. Content is
   compared with canon(), which ignores key order, so two tabs holding the
   same data never keep rewriting it back and forth. */
function onStorage(ev: StorageEvent): void {
  if (ev.storageArea && ev.storageArea !== localStorage) return;
  if (ev.key === SYNC_KEY && ev.newValue) {
    try {
      const m = rec(parseJson(ev.newValue));
      if (m && epOf(m) < notesEp) {
        // Written by a tab that had not yet heard these notes (saveMeta, above): these stand, written back.
        log('tabs', new Error('older sync notes from another tab; this tab wrote its own back'));
        saveMeta();
      } else if (m && epOf(m) === notesEp && (typeof m.acct === 'string' ? m.acct : null) === cloud.acct) {
        // The same log and account: joined (joinNotes), and written back when this tab held something they lacked.
        if (joinNotes(m, ev.newValue)) saveMeta();
      } else if (m) {
        const { meta, editAt, last } = notesIn(m, 'tabs');
        if (meta) cloud.meta = meta;
        cloud.sent = sentIn(m.sent);
        if (editAt) cloud.editAt = editAt;
        cloud.last = last;
        // The notes' account with them: a tab that kept the account it read before acted for it on another's log.
        cloud.acct = typeof m.acct === 'string' ? m.acct : null;
        notesEp = epOf(m);
        notesSeen = ev.newValue;
      }
    } catch (e) {
      log('tabs', e);
    }
    return;
  }
  if (ev.key !== KEY || ev.newValue == null || ev.newValue === device.lastSaved) return;
  /* A write since replaced: by this tab, which merged what was stored before
     it wrote (saveNow), or by another, whose own event follows. */
  try {
    if (localStorage.getItem(KEY) !== ev.newValue) return;
  } catch (e) {
    // Storage unreadable now: the write is read from the event, as before.
    log('tabs', e);
  }
  mergeIn(ev.newValue, false);
}
/* Another tab's save merged into this tab's log: taken whole when this tab
   has nothing unsaved, else three ways against this tab's last save; what
   was only here is saved back so the other tab has it too. own: the merge is
   this tab's own save's (saveNow), which then saves whatever it holds. */
function mergeIn(text: string, own: boolean): void {
  let incoming: State,
    base: State | null = null;
  try {
    const raw = parseJson(text);
    // A save is a record; anything else (null, a number) would read as an empty log, every record in it deleted.
    if (!rec(raw)) throw new Error('another tab saved something that is not a log');
    incoming = normalize(raw);
  } catch (e) {
    log('tabs', e);
    // Not merged: what the other tab saved cannot be read, so this tab's own save goes ahead over it.
    if (own) {
      device.lastSaved = text;
      saveNow();
    }
    return;
  }
  try {
    base = device.lastSaved ? normalize(parseJson(device.lastSaved)) : null;
  } catch (e) {
    // This tab's own last save cannot be read back: the other tab's copy is taken whole, as with no base. Its reason is kept.
    log('tabs', e);
    base = null;
  }
  const stat = { conflicts: 0 };
  // The workout here before the merge: the copy that may lose it (below), and what is then said.
  const dr0 = state.draft;
  let kept: Kept = null;
  if (!base || canon(state) === canon(base)) setState(incoming);
  else {
    const L = chunksOf(state),
      Rr = chunksOf(incoming),
      B = chunksOf(base),
      parts: Record<string, Rec | null> = {};
    /* A record changed in both tabs keeps the other tab's copy. Letting this tab's own copy win on its own save
       loses what the other tab logged: a tab behind takes away the other's new workout and its sets, a change typed
       loses to a later tick, and Undo takes back the other tab's edit (tests/storage-sync.js S-6). A tab shown again takes in the other's saves first
       (onVisibility), so a clash needs both tabs changing one item before either hears the other, a moment; the
       words then say whose copy was kept (conflictNote). */
    for (const id of new Set([...Object.keys(L), ...Object.keys(Rr), ...Object.keys(B)]))
      parts[id] = mergeChunk(
        id,
        baseOf(id, B[id] || emptyChunk(id)),
        L[id] || emptyChunk(id),
        Rr[id] || emptyChunk(id),
        true,
        stat
      );
    setState(assemble(parts));
    /* The copy of the workout that lost the merge keeps its sets, as on two phones (keepLost): this tab's when it held
       something logged the other tab's save lacked, the other tab's when it did and this tab's copy stood. Logged means
       a set ticked or changed once ticked, or cardio entered: a load being typed or a question answered is no reason to
       keep a workout the other tab discarded (else Discard in one tab while a load is typed in the other brings the
       workout back in History). Without this, a set ticked in a tab behind, in a workout the other tab had finished,
       would be dropped without a word. */
    const agreed = base.draft;
    const loggedNew = (d: DraftLike | null | undefined): boolean => {
      if (!d) return false;
      const was = agreed && agreed.id === d.id ? agreed : null;
      const rows = new Set(was ? was.ex.flatMap(b => b.sets.filter(x => x.done).map(x => canon(x))) : []);
      const cards = new Set(was ? (was.cardio || []).map(c => canon(c)) : []);
      return (
        d.ex.some(b => b.sets.some(x => x.done && !rows.has(canon(x)))) ||
        (d.cardio || []).some(c => !!c.min && !cards.has(canon(c)))
      );
    };
    if (loggedNew(dr0)) kept = keepLost(dr0, state.draft, agreed, true, true);
    if (loggedNew(incoming.draft)) keepLost(incoming.draft, state.draft, agreed, true, true);
  }
  device.lastSaved = text;
  clearTimer(saveT);
  saveT = null;
  invalidate();
  resyncLocalH();
  // Anything that was only here goes back out, so the other tab has it too (and this tab's own save, made, is noted for the sync).
  if (own || canon(state) !== canon(incoming)) saveNow();
  if (!ui.modal) fx.rerenderKeepScroll();
  else fx.render();
  conflictNote(stat, true);
  // What became of what was done here, when the workout it was done in was closed in the other tab.
  if (kept) draftNote(dr0, kept, 'in another tab');
}
function onVisibility(): void {
  if (document.visibilityState === 'hidden') {
    if (saveT) saveNow();
    if (cloud.on) {
      clearTimer(cloud.t);
      cq(cloudFlush);
    }
  } else {
    /* Shown again: what another tab saved meanwhile is taken in first, since a hidden page may hear none of it, so a
       change made here next is the later one and is kept (else it meets that save unheard, and loses to it). */
    const cur = storedElsewhere();
    if (cur != null) mergeIn(cur, false);
    if (cloud.on && Date.now() - cloud.lastPull > SYNC_MS.pullAfter) cq(cloudPull);
  }
}
function onPageHide(): void {
  if (saveT) saveNow();
  if (trackT || cloud.pendAt) trackEdits();
}

/** What the sync part ran as the page loaded, in its order: the sync notes
    read from this device, the device id, the notes forgotten when no save
    was readable, this device's hashes of the log, then the listeners for
    another tab's save and for the page being hidden or left. Called once,
    from main.ts at start, after storageStart(). */
export function syncStart(): void {
  try {
    const text = localStorage.getItem(SYNC_KEY);
    const m = rec(parseJson(text || 'null'));
    notesSeen = text;
    if (m) {
      const { meta, editAt, last } = notesIn(m, 'sync-meta');
      cloud.meta = meta || {};
      cloud.last = last || null;
      cloud.editAt = editAt || {};
      cloud.devId = typeof m.devId === 'string' ? m.devId : null;
      cloud.acct = typeof m.acct === 'string' ? m.acct : null;
      cloud.sent = sentIn(m.sent);
      notesEp = epOf(m);
    }
  } catch (e) {
    log('sync-meta', e);
  }
  if (!cloud.devId) cloud.devId = 'dev-' + uid();
  /* No readable local data at startup (unreadable save, or storage cleared but
     the sync notes survived): the fresh state here is not an edit. Forget what
     was last agreed with the cloud, so the first pull adopts the cloud copy
     instead of the first flush writing an empty state over it. */
  if (!device.hadLocal) {
    // Writes sent from a log no longer here are not this log's: forgotten with the notes.
    cloud.meta = {};
    cloud.sent = {};
    cloud.editAt = {};
  }
  resyncLocalH();
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
}
