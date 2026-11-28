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
   devices and the merge of another tab's save are here too; the save on this phone (save.ts), the sync notes
   (syncnotes.ts), the tracker of each edit's time (edits.ts), one workout in two places (twoplaces.ts) and the
   join of a first sign-in (firstjoin.ts) are their own modules below this one. Nothing runs on import:
   syncStart() runs what the parts ran as the page loaded, called from main.ts at start. */

import { NET_MS } from './config';
import { uid, hashStr, SECOND_MS } from './util';
import { arr, parseJson, rec } from './records';
import type { Rec, Trashed } from './records';
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
import { Hx, canon, docWins, merge3List, merge3Val, mergeWorkout, recordKey, storedJson } from './merge';
import type { Lost, Wins } from './merge';
import type { DraftLike } from './session';
import { routineEmpty } from './routines';
import { normalize, plainTemplate, putAside } from './normalize';
import { invalidate } from './live';
import { AUTH, codeOf } from './providers';
import { photoHeld, photoNote, photoOf, photoPending, photoSent, photoTake } from './photo';
import { ROWS_UPDATE, rowsRemoved, rowsSoon, rowsStart } from './rows';
import { errlogFlush } from './errlog';
import { rowsAsked, rowsBlocked, rowsDecideHere, rowsForget, rowsGate } from './rowsnotes';
import { rowSync, rowsUnsent, rowsyncStart } from './rowsync';
import { rowsLogKeys } from './rowslog';
import { acct, cloud, fx, setState, state, ui } from './store';
import type { Base, CloudDb, CloudDbIn, CloudDoc, CloudRef, CloudSeen, CloudStatus, State, SyncNote } from './store';
import {
  KEY,
  capturePost,
  undoKeeps,
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
import { storedElsewhere, writeLocal, writeTakenIn } from './save';
import {
  draftOf,
  epOf,
  joinNotes,
  knownTime,
  laterEntry,
  newEp,
  normChunk,
  notesAt,
  notesCatchUp,
  notesEpNow,
  notesIn,
  notesRead,
  notesSeenNow,
  saveMeta,
  sentIn,
  SYNC_KEY,
  timesIn
} from './syncnotes';
import { editsPending, laterThanSeen, markEdit, recordKeys, resyncLocalH, seenAsIs, trackEdits } from './edits';
import { changedSince, conflictNote, draftNote, keepLost, lostNote } from './twoplaces';
import type { Kept } from './twoplaces';
import { firstJoin, joinLogs } from './firstjoin';

/** Sync's timings, in milliseconds: a save once the taps pause, a flush once
    they pause (the edit notes' own wait is the tracker's, edits.ts), the wait for any answer from the account,
    an account error's toast, and how long after the last pull a return to the
    app pulls again. */
const SYNC_MS = {
  save: 400,
  flush: 1200,
  net: NET_MS,
  errToast: 8000,
  pullAfter: 20000
} as const;
/** The waits between tries after a sync fails, in seconds, the last repeated. */
const RETRY_S: readonly number[] = [5, 15, 60, 180];
/** What a phone whose sign-in the server refuses says. */
const SIGNIN_AGAIN = 'Sign-in expired. Sign in again to keep saving. Your log stays on this phone.';
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
      writeLocal(storedJson(state));
      device.ok = true;
    } catch (e) {
      device.ok = false;
      log('storage', e);
    }
  }
  markEdit();
  // With another tab open, this save's records are noted now, so the notes it reads when it merges this save say when
  // each was edited (mergeIn).
  if (tabsHeard) trackEdits();
  fx.setSaveState();
  cloudSoon();
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
  // The documents are in step with the account: the account's rows are made to say what the log says (rows.ts), and
  // errors met before the account was known go to its error log (errlog.ts).
  if (st === 'synced') {
    rowsSoon();
    errlogFlush();
  }
}
/** Stops the sync on an account whose layout asks for a newer build than this one, and says so: nothing more is read from the account or written to it. True when it stopped. */
function rowsStop(): boolean {
  if (!rowsBlocked()) return false;
  // Asked again at each try, never waited for: an account that goes back to a layout this build knows syncs at the try after.
  void rowsGate();
  setCloud('offline', ROWS_UPDATE);
  return true;
}
/** The account's document by id. Only called while the sync is on, when there is a db. */
function ref(id: string): CloudRef {
  if (!cloud.db) throw new Error('no account open');
  return cloud.db.doc(`data/users/${cloud.uid}/${id}`);
}
function cloudFail(e: unknown): void {
  const E = rec(e);
  const c = codeOf(e);
  /* The account's documents refused the write: its rows decide now (SUPABASE.md, Part 9). The layout is read, and the
     sync goes on by the rows, from which this phone crosses with what it had not yet sent. */
  if (E && /docs_frozen/.test(String(E.message))) {
    setCloud('saving');
    void rowsGate().then(() => cq(cloudFlush));
    return;
  }
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
    setCloud('offline', 'Your account is full. Export a backup and delete old demo data.');
    return;
  }
  /* A send that kept losing its race to another device saving the same document, or kept finding records moving
     (above cloudFlush): with signal the phone tries again after its wait, so the sync says it is syncing, not that the
     phone is offline. With the connection gone at that moment it is offline, said so, and sent when the connection
     comes back (account.ts resumes an offline sync then). */
  if (E && E.code === 'raced' && !offline()) setCloud('saving');
  else setCloud('offline', c === 'denied' && E && typeof E.message === 'string' ? E.message : undefined);
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
  remoteWins: Wins,
  stat: { conflicts: number }
): Rec {
  const l = normChunk(id, local || emptyChunk(id)) || {},
    r = normChunk(id, remote || emptyChunk(id)) || {};
  if (id === 'core') {
    const out: Rec = { ...l };
    const ba = (base && base.a) || null,
      bf = (base && base.f) || {},
      bs = (base && base.s) || {};
    for (const k of CORE_ARR) out[k] = merge3List(ba ? ba[k] || {} : null, l[k], r[k], remoteWins, stat, k);
    for (const k of CORE_FIELDS) {
      const v = merge3Val(base ? bf[k] : '?', l[k], r[k], remoteWins, stat, recordKey('', k));
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
      const v = merge3Val(
        base ? (k in bs ? bs[k] : Hx(undefined)) : '?',
        ls[k],
        rs[k],
        remoteWins,
        stat,
        recordKey('settings', k)
      );
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
      return { draft: mergeWorkout(bd, ld, rd, docWins(remoteWins), stat) };
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
    const v = merge3Val(base ? base.d : '?', l.draft || null, r.draft || null, docWins(remoteWins), stat);
    return { draft: v === undefined ? null : v };
  }
  if (id.startsWith('b-')) {
    const ba = (base && base.a) || null;
    const out: Rec = {};
    for (const k of ['bodyweights', 'measurements']) {
      const v = merge3List(ba ? ba[k] || {} : null, l[k], r[k], remoteWins, stat, k);
      if (v.length) out[k] = v;
    }
    return out;
  }
  const ba = (base && base.a) || null;
  const out: Rec = {
    sessions: merge3List(ba ? ba.sessions || {} : null, l.sessions, r.sessions, remoteWins, stat, 'sessions')
  };
  const c = merge3List(ba ? ba.cardio || {} : null, l.cardio, r.cardio, remoteWins, stat, 'cardio');
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

/* ---------- when each record was last edited ---------- */

/* A clash on one record is decided by that record's own last edit, not its document's: a half-month document holds every
   session of those days, so an edit to Oct 31 on one phone outranked a correction of Oct 17 made later on the other.
   Each record's time is noted here as the document's is (trackEdits: the lifter's edits only, never the app's own),
   kept in the sync notes (recAt), and sent beside the document (`rt`), never in the record itself: a build that keeps
   no record times then writes the document without them, so a time never outlives an edit it does not describe, and a
   record whose two copies do not both carry a time is decided by the documents' times, as before. The records are
   each list's by its id, the core document's values by name, and each setting (recordKeys); the workout in progress is
   its own document. Every time this device writes, a record's or a document's, is later than every time it has seen
   (laterThanSeen), so a phone whose clock runs behind still writes its later edit as the later one. */
/** The rule a clash in document `id` keeps a record by: its own times where both sides know them, the other side's
    copy when its time is later (`theirs`: the times sent with it); else the document's rule, `doc`. */
function clashRule(id: string, theirs: Record<string, number> | null, doc: boolean): Wins {
  const mine = cloud.recAt[id];
  if (!theirs || !mine) return doc;
  return {
    doc,
    rec: k => {
      const a = knownTime(mine[k]),
        b = knownTime(theirs[k]);
      return a === undefined || b === undefined || a === b ? null : b > a;
    }
  };
}
/** Each record's time in document `id` once copies are merged or taken in: the other side's where the copy kept is
    its own (none when it sent none), the later of the two where both held the same copy, this device's otherwise. */
function recordTimesAfter(
  id: string,
  local: unknown,
  remote: unknown,
  merged: unknown,
  theirs: Record<string, number> | null
): void {
  const L = recordKeys(id, normChunk(id, local || emptyChunk(id)), Hx),
    R = recordKeys(id, normChunk(id, remote || emptyChunk(id)), Hx),
    M = recordKeys(id, normChunk(id, merged || emptyChunk(id)), Hx);
  const was = cloud.recAt[id] || {},
    times: Record<string, number> = {};
  // The moment a record's time stops being known here, read once, before any is written (laterThanSeen).
  let gone: number | null = null;
  const unknownSince = (): number => -(gone ??= laterThanSeen(Date.now()));
  for (const k in M) {
    const t = theirs ? knownTime(theirs[k]) : undefined,
      mine = was[k];
    if (M[k] === R[k] && M[k] !== L[k]) times[k] = t !== undefined ? t : unknownSince();
    else if (M[k] === R[k] && M[k] === L[k]) {
      if (mine !== undefined || t !== undefined) times[k] = laterEntry(mine ?? 0, t ?? 0);
    } else if (mine !== undefined) times[k] = mine;
  }
  if (Object.keys(times).length) cloud.recAt[id] = times;
  else delete cloud.recAt[id];
}
/** The record times sent with document `id` as it holds `chunk`: those of its records this device knows (none: undefined). */
function timesOut(id: string, chunk: unknown): Record<string, number> | undefined {
  const known = cloud.recAt[id];
  if (!known) return undefined;
  const keys = recordKeys(id, chunk, () => '');
  const out: Record<string, number> = {};
  for (const k in keys) {
    const t = knownTime(known[k]);
    if (t !== undefined) out[k] = t;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The half-month document of a workout read from the account and taken in as a pull takes it (adopted, or merged with this device's changes to it), when this device has not pulled it since the workout was finished elsewhere (keepLost): the session is then here to join. False, nothing taken in, when the session is not in it (the workout dated to another half-month on the other phone before Finish, or discarded there: a pull finds which) or when taking it in alone would move a record between documents (above cloudFlush). */
async function sessionFromCloud(d: DraftLike, legB: Base | null): Promise<boolean> {
  if (d.editingId || state.sessions.some(q => q.id === d.id)) return true;
  const id = chunkOf(d.date);
  const sn = await withTimeout(ref(id).get(), SYNC_MS.net, 'sync-read');
  // An edit made while the account was read is noted with its time before anything below reads or takes the log
  // (the rule above resyncLocalH).
  trackEdits();
  const sb = sn && sn.exists ? rec(sn.data()) : null;
  ownWrite(id, sb);
  const data = sb && typeof sb.json === 'string' ? parseJson(sb.json) : null;
  /* Read by this copy's date, the session may be elsewhere: kept alone, this copy would be saved as a second session
     of its id, and the one finished there (its sets, its date) put aside in Recently deleted. */
  if (!sb || typeof sb.json !== 'string' || !idsIn(data, 'sessions').has(d.id)) return false;
  const m = cloud.meta[id],
    h = hashStr(sb.json);
  if (m && m.h === h) return true;
  const mine = chunksOf(state)[id] || emptyChunk(id);
  const localDirty = !m || hashStr(storedJson(mine)) !== m.h;
  const et = Number(sb.et) || Number(sb.at) || 0,
    rt = timesIn(sb.rt);
  const merged = !localDirty
    ? rec(data)
    : mergeChunk(id, baseFor(id, m, legB), mine, data, clashRule(id, rt, et > (cloud.editAt[id] || 0)), {
        conflicts: 0
      });
  if (movesBetweenDocs(id, mine, merged)) return false;
  applyChunk(id, merged);
  recordTimesAfter(id, mine, data, merged, rt);
  // Taken as it is or merged, the document's edit time is at least the account's copy's (cloudFlush sends it on).
  cloud.editAt[id] = Math.max(cloud.editAt[id] || 0, et);
  // The account's copy is now the agreed base, as after a pull; what this device adds to it is its own later edit.
  cloud.meta[id] = { h, at: Number(sb.at), b: baseOf(id, data) };
  saveMeta();
  resyncLocalH();
  return true;
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
  // An account whose rows decide: what the rows' sync has not sent (rowsync.ts).
  if (rowsDecideHere()) return rowsUnsent();
  if (cloud.status !== 'synced' || photoPending()) return true;
  try {
    const ch = chunksOf(state);
    for (const id of new Set([...Object.keys(ch), ...Object.keys(cloud.meta)])) {
      if (!isChunkId(id)) continue;
      const data = ch[id] || emptyChunk(id);
      if (!data) continue;
      const m = cloud.meta[id];
      if (!m || m.h !== hashStr(storedJson(data))) return true;
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
    const json = storedJson(data);
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
    ? 'Routines and settings are too large to save to your account. Export a backup.'
    : tooBig.some(i => i.startsWith('b-'))
      ? 'A year of body data is too large to save to your account. Export a backup.'
      : tooBig.includes('draft')
        ? 'Your workout is too large to save to your account. Export a backup.'
        : 'One month of sessions is too large to save to your account. Export a backup.';
}

/* A send that finds the account's copy of a document changed since this device last agreed on it merges that one
   document (it reads one, not the whole account) only while no record moves between documents with it: one change of
   the log can be two documents' (a session whose date moved to another half-month leaves one and joins the other, a
   delete moves it into Recently deleted, a restore out). Merged alone, the half it brought made the log hold that
   session twice, the stale copy kept and the moved one put aside, and the next pull took the stale copy away too,
   leaving the session in no document and no log. So when the merge would bring in a record this device holds in
   another document, or take out one it holds in this one (moved or deleted on the other device), the send hands over
   to a pull, which takes in every changed document together and then sends (cloudPull). The workout in progress
   moves into a session's document when it is finished on the other phone: that document is read and merged the same
   way (sessionFromCloud). Handed over this many times in a row without a send that went through, the account is
   changing faster than it is read: the send waits and tries again (cloudFail's waits), as a write that keeps losing
   its race does. */
const HAND_OVERS = 3;
/** How many times in a row a send has handed over to a pull (above). */
let handedOver = 0;
/** The lists of document `id` whose records can move to another document: by their date (sessions and cardio between
    the half-months) or into and out of Recently deleted. A weigh-in or tape measurement keeps the date it was taken
    (a second one that day replaces it under a new id, in the same year), so a year's document has none. */
function movingLists(id: string): readonly string[] {
  return id === 'core' ? ['trash'] : id.startsWith('s-') ? ['sessions', 'cardio'] : [];
}
/** The ids of list `k`'s records in a document's data. */
function idsIn(data: unknown, k: string): Set<string> {
  const out = new Set<string>();
  for (const x of arr(rec(data)?.[k]) || []) {
    const R = rec(x);
    if (R && typeof R.id === 'string') out.add(R.id);
  }
  return out;
}
/** Every record id this device holds outside document `id`: the moving lists' records of its other documents. */
function idsOutside(id: string): Set<string> {
  const out = new Set<string>();
  const parts = chunksOf(state);
  for (const d in parts) if (d !== id) for (const k of movingLists(d)) for (const x of idsIn(parts[d], k)) out.add(x);
  return out;
}
/** Whether taking in `merged` for document `id` alone, over this device's `mine`, moves a record between documents (above). */
function movesBetweenDocs(id: string, mine: unknown, merged: unknown): boolean {
  let outside: Set<string> | null = null;
  for (const k of movingLists(id)) {
    const here = idsIn(mine, k),
      after = idsIn(merged, k);
    for (const x of here) if (!after.has(x)) return true;
    for (const x of after) if (!here.has(x) && (outside ??= idsOutside(id)).has(x)) return true;
  }
  return false;
}

/** Writes every document that changed here to the account; one the account changed meanwhile is merged first, or taken in with every other changed one by a pull (above). */
export async function cloudFlush(): Promise<void> {
  if (!cloud.on) return;
  // An account whose rows decide is synced by its rows (rowsync.ts); its documents are never written again here.
  if (rowsDecideHere()) return rowSync();
  notesCatchUp();
  /* No pull has come through since the sync started (it failed, or got no
     answer): this one pulls first, which then sends. A retry that only sent
     would find nothing to send and say Synced, the account's own changes
     never read. */
  if (!pulled) return cloudPull();
  // Nothing is sent while the account's layout, asked for when the read before this send began, is on its way (it answers, or is given up on within the sync's own wait for an answer).
  const asked = rowsAsked();
  if (asked) await asked;
  if (rowsStop()) return;
  if (rowsDecideHere()) return rowSync();
  if (editsPending()) trackEdits();
  const todo = changedDocs();
  /* The draft goes up last: Finish empties it and adds the
     session, and written first, a device pulling in between saw the workout
     gone and no session, and said it was discarded. */
  todo.sort((a, b) => +(a.id === 'draft') - +(b.id === 'draft'));
  if (!todo.length) {
    handedOver = 0;
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
    const stat: { conflicts: number; lost: Lost[] } = { conflicts: 0, lost: [] };
    let dn: {
      prev: DraftLike | null;
      sessions0: unknown;
      kept: Kept;
      lost: Kept;
    } | null = null;
    const tooBig: string[] = [];
    const raced: string[] = [];
    const legB = legacyBodyBase();
    /** What was taken in from the account, shown and said: the log redrawn, the clashes counted, the workout's fate. */
    const tellTakenIn = (): void => {
      if (!adopted) return;
      invalidate();
      writeTakenIn();
      // Each copy taken in was taken as seen as it came: what differs now is an edit made at a wait since, noted here.
      trackEdits();
      if (!ui.modal) fx.rerenderKeepScroll();
      conflictNote(stat);
      if (dn) {
        draftNote(dn.prev, dn.kept);
        lostNote(dn.lost);
      }
    };
    for (const x of todo) {
      let done = false;
      for (let tries = 0; tries < WRITE_TRIES && !done; tries++) {
        /* Read before write. If another device changed this document since we last agreed on it, merge record by
           record instead of overwriting, or take it in by a pull (above cloudFlush). */
        const snap = await withTimeout(ref(x.id).get(), SYNC_MS.net, 'sync-read');
        // An edit made while the account was read is noted with its time before the edit time is read below (the
        // rule above resyncLocalH).
        trackEdits();
        ownWrite(x.id, snap && snap.exists ? rec(snap.data()) : null);
        const m = cloud.meta[x.id];
        /* Sets logged while that read was in flight are in state, not in the
           copy taken before it. Work from the current document, or the merge
           below would write the older copy back and lose them. */
        let json = storedJson(chunksOf(state)[x.id] || emptyChunk(x.id));
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
            const remoteWins = ret > (cloud.editAt[x.id] || 0),
              rt = timesIn(b.rt);
            const mine = parseJson(json);
            const clashed = stat.conflicts,
              lostBefore = stat.lost.length;
            const merged = mergeChunk(x.id, baseFor(x.id, m, legB), mine, rd, clashRule(x.id, rt, remoteWins), stat);
            // The workout here before this flush took anything in, for what is said after it; each merge reads the one here now.
            const prev = x.id === 'draft' ? state.draft : null;
            const mergedDraft = x.id === 'draft' ? draftOf(merged) : null;
            /* Merged alone only while no record moves between documents with it (above cloudFlush). This copy of the
               workout lost (closed or replaced): the session it may have become on the other phone is read first,
               before anything here changes, so its sets join that session rather than making a second one of its id,
               and a read that fails (the connection gone mid-flush) leaves the workout here as it was, for the retry. */
            const alone =
              x.id === 'draft'
                ? !(prev && (!mergedDraft || mergedDraft.id !== prev.id)) || (await sessionFromCloud(prev, legB))
                : !movesBetweenDocs(x.id, mine, merged);
            if (!alone) {
              /* This document's merge is dropped, to be made again by the pull, which says its clashes; those of the
                 documents taken in before it are said with them (or at once, when the send gives up). */
              stat.conflicts = clashed;
              stat.lost.length = lostBefore;
              if (++handedOver > HAND_OVERS) {
                handedOver = 0;
                tellTakenIn();
                log('sync-flush', { code: 'raced', ids: [x.id] });
                cloudFail({ code: 'raced', message: 'Another device was saving at the same moment.' });
                return;
              }
              await pullAll(stat.conflicts);
              return;
            }
            recordTimesAfter(x.id, mine, rd, merged, rt);
            cloud.editAt[x.id] = Math.max(cloud.editAt[x.id] || 0, ret);
            if (x.id === 'draft' && !dn) dn = { prev, sessions0: state.sessions, kept: null, lost: null };
            const agreed = x.id === 'draft' && m && m.b ? m.b.draft : null;
            const before = rowsLogKeys();
            applyChunk(x.id, merged);
            rowsRemoved(before);
            // Undo of a change kept here over the account's copy goes back to that copy (undoKeeps).
            undoKeeps(stat.lost.splice(lostBefore));
            adopted = true;
            writeTakenIn();
            took = { h: hashStr(b.json), at: Number(b.at), b: baseOf(x.id, rd) };
            if (x.id === 'draft' && dn) {
              // The copy that lost (this device's, dirty here, or the account's, which a later edit here replaced) keeps its sets.
              const remoteDraft = draftOf(rec(rd));
              if (changedSince(prev, agreed)) dn.kept = keepLost(prev, mergedDraft, agreed, remoteWins) || dn.kept;
              if (changedSince(remoteDraft, agreed))
                dn.lost = keepLost(remoteDraft, mergedDraft, agreed, remoteWins) || dn.lost;
              if (dn.kept || dn.lost || canon(state.sessions) !== canon(dn.sessions0)) again = true;
            }
            if (x.id === 'core' && absorbLegacy(legacyBody(rec(rd)))) moreBody = true;
            // What was taken in is taken as seen at once, so an edit made at the next wait is all the tracker finds
            // (the rule above resyncLocalH).
            resyncLocalH();
            json = storedJson(chunksOf(state)[x.id] || emptyChunk(x.id));
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
        /* Sent with the time of the last edit made to it, here or in the copy taken in (editAt). A document this
           phone took from the account under an older build has none: it is sent with the time of the copy last
           agreed, never this moment, which made a change the app made on its own (a newer build's reading of an old
           log) outrank a lifter's edit made before it on another phone. A document never agreed is new here: this
           moment. */
        const rt = timesOut(x.id, parseJson(json));
        const doc: CloudDoc = {
          v: 1,
          at,
          et: cloud.editAt[x.id] || (m ? m.at : at),
          w: writeMark(),
          json,
          // Each record's last edit, where this device knows it (recordTimesAfter): what a clash on one is decided by.
          ...(rt ? { rt } : {})
        };
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
    tellTakenIn();
    /* Written first by another device every time it was tried: not synced, and tried again later, as after a
       dropped connection (cloudFail's waits), with nothing here lost. */
    if (raced.length) {
      log('sync-flush', { code: 'raced', ids: raced });
      cloudFail({ code: 'raced', message: 'Another device was saving at the same moment.' });
      return;
    }
    cloud.retry = 0;
    handedOver = 0;
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
/* "Switch back" (rowsswitch.ts): the rows have decided the log since the switch, and the documents are frozen as
   they were then (the guard, SUPABASE.md Part 9). Every document is written over with this phone's whole log, which
   equals the rows at the account's last change, each over the copy read and marked `back`, the one mark the guard
   lets through, each record's time sent beside it (`rt`) and the latest of them as the document's edit time (`et`),
   so a phone on an earlier build that later decides a clash decides it by those times, not by this moment. */
/** Writes the log over every document (above): true once every one is written; false when one changed since it was
    read (the caller reads again and tries again). */
async function writeBack(): Promise<boolean> {
  const db = cloud.db;
  if (!db || !cloud.uid) return false;
  const snap = await withTimeout(db.collection(`data/users/${cloud.uid}`).get(), SYNC_MS.net, 'sync-pull');
  const read = new Map<string, Rec | null>();
  for (const d of snap.docs) if (d.exists && isChunkId(d.id)) read.set(d.id, rec(d.data()));
  const mine = chunksOf(state);
  for (const id of new Set([...Object.keys(mine), ...read.keys()])) {
    const json = storedJson(mine[id] || emptyChunk(id));
    const rt = timesOut(id, parseJson(json));
    const at = Date.now();
    const latest = rt ? Math.max(...Object.values(rt)) : 0;
    const doc: CloudDoc = {
      v: 1,
      at,
      et: latest > 0 ? latest : cloud.editAt[id] || at,
      w: writeMark(),
      json,
      ...(rt ? { rt } : {}),
      back: true
    };
    if (!(await withTimeout(ref(id).setIf(doc, seenOf(read.get(id) ?? null)), SYNC_MS.net, 'sync-write'))) return false;
    cloud.meta[id] = { h: hashStr(json), at, b: baseOf(id, parseJson(json)) };
  }
  cloud.sent = {};
  saveMeta();
  return true;
}
/* Another phone switched the account back to its documents: they now hold that phone's log, which was the rows'. They
   are taken as the agreed copies, so what this phone holds beyond them (its own changes, and what it took from the
   rows since, each with its time) is what its next send writes to them. */
/** Takes the documents as they are now as the agreed copies (above), then sends. */
async function crossBack(): Promise<void> {
  const db = cloud.db;
  if (!db || !cloud.uid) return;
  const snap = await withTimeout(db.collection(`data/users/${cloud.uid}`).get(), SYNC_MS.net, 'sync-pull');
  const meta: Record<string, SyncNote> = {};
  for (const d of snap.docs) {
    const b = d.exists && isChunkId(d.id) ? rec(d.data()) : null;
    if (!b || typeof b.json !== 'string') continue;
    meta[d.id] = { h: hashStr(b.json), at: Number(b.at) || 0, b: baseOf(d.id, parseJson(b.json)) };
  }
  cloud.meta = meta;
  cloud.sent = {};
  writers = writersOf(snap.docs);
  saveMeta();
  cq(cloudFlush);
}
/** Each document's last writer, as the last whole read of the documents found it (its write mark names the device,
    `writeMark`): how the switch sees a device on a build that writes no row of its own (rowsgate.ts). */
let writers: Record<string, { dev: string; at: number }> = {};
/** The last writer of each document read (above); a document with no write mark is left out. */
function writersOf(docs: readonly { id: string; exists: boolean; data(): unknown }[]): typeof writers {
  const out: typeof writers = {};
  for (const d of docs) {
    if (!d.exists) continue;
    const b = rec(d.data());
    const w = b && typeof b.w === 'string' ? b.w : '';
    const cut = w.lastIndexOf('.');
    if (cut > 0) out[d.id] = { dev: w.slice(0, cut), at: Number(b?.at) || 0 };
  }
  return out;
}
/** One document of the account as read: its write time, its edit time, its data and the hash of its text. */
type Remote = { at: number; et: number; data: unknown; h: string; rt: Record<string, number> | null };

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
        h: hashStr(b.json),
        rt: timesIn(b.rt)
      };
    } catch (e) {
      log('sync-parse', e);
    }
  }
  return remote;
}
function mergeFirstLink(mine: State, rState: State, rids: readonly string[], remote: Record<string, Remote>): boolean {
  const { joined, keptDraft } = firstJoin(mine, rState);
  setState(joined);
  // The cloud copy becomes the agreed base, so the merged result is what
  // the flush writes, rather than being merged a second time.
  const minePart = chunksOf(mine),
    joinedPart = chunksOf(joined);
  for (const id of rids) {
    cloud.meta[id] = { h: remote[id].h, at: remote[id].at, b: baseOf(id, remote[id].data) };
    cloud.editAt[id] = Date.now();
    // Each record's time: the account's where the joined log holds its copy, this phone's where it holds its own.
    recordTimesAfter(id, minePart[id], remote[id].data, joinedPart[id], remote[id].rt);
  }
  return keptDraft;
}

/* One session or cardio entry in two half-month documents after a merge: one phone moved it to another half-month
   while the other edited it where it was, neither seeing the other's change (the move takes it out of one document, a
   change the edit keeps there, and puts it in the other). The copy edited later is kept, by each copy's own record
   time, and the other is put aside in Recently deleted and counted as a clash, as a record edited on two devices is
   decided and said (S-11). Where a copy's time is not known (sent by a build that keeps none), reading the log decides,
   as before (normalize.ts dedupe). Weigh-ins and tape measurements keep the day they were taken, so they never move. */
/** Takes out of `parts` each copy of a session or cardio entry held twice that a later edit of its other copy outranks (above); returns them, to be put aside. */
function laterCopiesKept(
  parts: Record<string, Rec | null>,
  stat: { conflicts: number; byTime?: number }
): { kind: 'session' | 'cardio'; x: Rec & { id: string; date: string } }[] {
  const copies = new Map<string, { doc: string; k: string; id: string; t: number | undefined }[]>();
  for (const doc in parts)
    if (doc.startsWith('s-'))
      for (const k of movingLists(doc))
        for (const id of idsIn(parts[doc], k)) {
          const key = recordKey(k, id);
          copies.set(key, [...(copies.get(key) || []), { doc, k, id, t: knownTime((cloud.recAt[doc] || {})[key]) }]);
        }
  const out: { kind: 'session' | 'cardio'; x: Rec & { id: string; date: string } }[] = [];
  for (const cs of copies.values()) {
    if (cs.length < 2 || cs.some(c => c.t === undefined)) continue;
    const top = Math.max(...cs.map(c => c.t || 0));
    if (cs.filter(c => c.t === top).length !== 1) continue;
    for (const c of cs) {
      if (c.t === top) continue;
      const part = rec(parts[c.doc]) || {};
      const list = arr(part[c.k]) || [];
      const x = list.map(y => rec(y)).find(R => !!R && R.id === c.id);
      parts[c.doc] = { ...part, [c.k]: list.filter(y => !x || rec(y) !== x) };
      // Its time goes with it: a copy no longer held there has none to send or weigh.
      const times = cloud.recAt[c.doc];
      if (times) delete times[recordKey(c.k, c.id)];
      if (x && typeof x.date === 'string')
        out.push({ kind: c.k === 'sessions' ? 'session' : 'cardio', x: { ...x, id: c.id, date: x.date } });
      stat.conflicts++;
      if (stat.byTime !== undefined) stat.byTime++;
    }
  }
  return out;
}
/** Each session and cardio entry the log holds, by its record key: its copy, its document and its time there. */
type Held = Map<string, { list: 'sessions' | 'cardio'; x: Rec & { id: string }; doc: string; t: number | undefined }>;
/** What the log holds now, for keepLastCopies to read after a merge. */
function heldNow(): Held {
  const out: Held = new Map();
  const parts = chunksOf(state);
  for (const doc in parts)
    if (doc.startsWith('s-'))
      for (const list of ['sessions', 'cardio'] as const)
        for (const y of arr((rec(parts[doc]) || {})[list]) || []) {
          const x = rec(y);
          if (!x || typeof x.id !== 'string') continue;
          const key = recordKey(list, x.id);
          out.set(key, { list, x: { ...x, id: x.id }, doc, t: (cloud.recAt[doc] || {})[key] });
        }
  return out;
}
/* A session or cardio entry held twice is decided on each device by itself, which writes out the copy it did not
   keep: here by the later edit (laterCopiesKept), on a build before this rule by the log's (normalize.ts dedupe: more
   sets, then the later date). Two devices that decide differently at the same moment write out both copies, and the
   record is in no document, both copies in Recently deleted as put aside. A device that finds a record it held gone
   that way, with no deletion of it in Recently deleted, puts its own copy back, with its time, so the account holds it
   once again and every device takes it from there. */
/** Puts back each record `before` held that a merge left in no document, only copies put aside of it in Recently deleted (above). */
function keepLastCopies(before: Held): void {
  const now = new Set([
    ...state.sessions.map(x => recordKey('sessions', x.id)),
    ...state.cardio.map(x => recordKey('cardio', x.id))
  ]);
  const back = [...before.entries()].filter(([k, h]) => {
    if (now.has(k)) return false;
    const kind = h.list === 'sessions' ? 'session' : 'cardio';
    const of = (t: Trashed): boolean => t.kind === kind && t.id.startsWith(h.x.id + '-dup') && !!t.clash;
    return state.trash.some(of) && !state.trash.some(t => t.kind === kind && t.id === h.x.id);
  });
  if (!back.length) return;
  const put = (list: 'sessions' | 'cardio'): Rec[] => back.filter(([, h]) => h.list === list).map(([, h]) => h.x);
  setState(
    normalize({
      ...state,
      sessions: [...state.sessions, ...put('sessions')],
      cardio: [...state.cardio, ...put('cardio')]
    })
  );
  for (const [k, h] of back) {
    const t = knownTime(h.t);
    if (t !== undefined) (cloud.recAt[h.doc] = cloud.recAt[h.doc] || {})[k] = t;
  }
  log('sync-kept', { back: back.map(([k]) => k) });
}
/** Puts the copies `laterCopiesKept` took out in Recently deleted, as copies put aside beside the ones the log keeps. */
function putCopiesAside(aside: readonly { kind: 'session' | 'cardio'; x: { id: string; date: string } }[]): void {
  if (!aside.length) return;
  for (const a of aside) putAside(state.trash, a.x, a.kind);
  setState(normalize(state));
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
    const lJson = storedJson(local[id] || emptyChunk(id));
    const localDirty = !m || hashStr(lJson) !== m.h;
    if (!localDirty) {
      parts[id] = rec(r.data);
      recordTimesAfter(id, local[id], r.data, parts[id], r.rt);
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
      clashRule(id, r.rt, r.et > (cloud.editAt[id] || 0)),
      stat
    );
    recordTimesAfter(id, local[id], r.data, parts[id], r.rt);
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
  // Never called with an argument: the queue (cq) hands each step what the step before it returned.
  return pullAll(0);
}
/** The pull: `said`, the clashes a send counted in the documents it took in before it handed over to this pull (cloudFlush), said with the pull's own. */
async function pullAll(said: number): Promise<void> {
  if (!cloud.on || !cloud.db) return;
  if (rowsDecideHere()) return rowSync();
  if (editsPending()) trackEdits();
  if (offline()) {
    conflictNote({ conflicts: said });
    setCloud('offline');
    return;
  }
  if (rowsStop()) return;
  setCloud('connecting');
  const began = Date.now();
  // The account's layout is asked for beside its documents: what it says stops this sync below, or its send (cloudFlush).
  const gate = rowsGate();
  /* A phone that has never synced this account waits for the answer first: an account whose rows decide is read from
     its rows, never from documents frozen at its switch. */
  if (!Object.keys(cloud.meta).length) {
    await gate;
    if (rowsDecideHere()) return rowSync();
  }
  let snap: Awaited<ReturnType<ReturnType<CloudDb['collection']>['get']>>;
  try {
    snap = await withTimeout(cloud.db.collection(`data/users/${cloud.uid}`).get(), SYNC_MS.net, 'sync-pull');
  } catch (e) {
    log('sync-pull', e);
    conflictNote({ conflicts: said });
    cloudFail(e);
    return;
  }
  cloud.lastPull = Date.now();
  pulled = true;
  if (rowsStop()) {
    conflictNote({ conflicts: said });
    return;
  }
  // The account switched to its rows while its documents were read: they are left unread, and the rows' sync runs.
  if (rowsDecideHere()) {
    conflictNote({ conflicts: said });
    return rowSync();
  }
  // What the other tab synced while this one waited for the account is read before this tab's notes are.
  notesCatchUp();
  writers = writersOf(snap.docs);
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
    readBegan = began;
    await cloudFlush();
    return;
  }
  /* An edit made while the account was read is noted now, with its time, before the log is taken as seen below
     (resyncLocalH): read back within the 800 ms the tracker waits, it was merged with the time of the document's last
     noted edit, and an older edit to the same record on another phone outranked it. Nothing but the lifter changes the
     log here between the last time it was taken as seen and this line (the pull takes nothing in before it). */
  trackEdits();
  const local = chunksOf(state);
  const held = heldNow();
  const first = !Object.keys(cloud.meta).length;
  // For a workout merged below: the copy both agreed on, read before the notes take the account's copy, and whether the account's edit is later.
  const agreedDraft = cloud.meta.draft && cloud.meta.draft.b ? cloud.meta.draft.b.draft : null;
  let draftMerged = false,
    draftRemoteWins = false;
  let parts: Record<string, Rec | null> | null = null,
    merged = false,
    draftIn = false,
    keptDraft = false;
  const stat: { conflicts: number; lost: Lost[] } = { conflicts: said, lost: [] };
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
      // Each record's time as the account sent it (recordTimesAfter), so a later edit on another phone is still the later one.
      for (const k of rids) recordTimesAfter(k, null, remote[k].data, remote[k].data, remote[k].rt);
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
    const aside = laterCopiesKept(parts, stat);
    const before = rowsLogKeys();
    setState(assemble(parts));
    rowsRemoved(before);
    undoKeeps(stat.lost);
    putCopiesAside(aside);
    keepLastCopies(held);
    absorbLegacy(leg);
    // A workout merged with the account's copy: the copy that lost keeps its sets (this device's, which held changes the account did not have, or the account's, which a later edit here replaced).
    if (draftMerged) {
      const remoteDraft = remote.draft ? draftOf(rec(remote.draft.data)) : null;
      if (changedSince(dr0, agreedDraft)) kept = keepLost(dr0, state.draft, agreedDraft, draftRemoteWins);
      if (changedSince(remoteDraft, agreedDraft))
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
      // Its edit time is the copy's: a change the app makes to it later (normalize's) is sent with that time, no later.
      cloud.editAt[id] = Math.max(cloud.editAt[id] || 0, remote[id].et);
    }
    saveMeta();
    resyncLocalH();
    // Ready-made routines from earlier builds' Recently deleted leave here too,
    // and the cleared list goes back to the cloud.
    {
      const n0 = state.trash.length;
      state.trash = state.trash.filter(t => !(t.kind === 'routine' && plainTemplate(t.data)));
      if (state.trash.length !== n0) {
        // The app's own bookkeeping, no edit: taken as seen before its save, which with another tab open notes
        // edits at once (saveNow), and after it.
        seenAsIs();
        saveNow();
        seenAsIs();
      }
    }
    if (!ui.modal) fx.rerenderKeepScroll();
    else fx.render();
    if (merged)
      fx.toast(
        keptDraft
          ? "Your account now holds this phone's log too. Your other phone's workout is in **History**."
          : "Your account now holds this phone's log too"
      );
    conflictNote(stat);
    if (draftIn) draftNote(dr0, kept);
    lostNote(lost);
  } else {
    if (first) for (const id of rids) cloud.meta[id] = { h: 'x', at: remote[id].at, b: null };
    // Nothing taken in here: what a send took in before handing over is still said.
    conflictNote(stat);
  }
  readBegan = began;
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
    rows: raw.rows,
    errors: raw.errors,
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
/** When the last whole read of the account that this tab took in was asked for: a document written before then is in the log (what rows.ts waits for before it sends the log over a row). */
let readBegan = 0;
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
    if (epOf(m) === notesEpNow() && text !== notesSeenNow()) joinNotes(m, text);
    notesAt(epOf(m));
    return;
  }
  notesAt(epOf(m));
  notesRead(text);
  const n = notesIn(m, 'tabs');
  cloud.meta = n.meta || {};
  cloud.sent = {};
  cloud.editAt = n.editAt || {};
  cloud.recAt = n.recAt || {};
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
/** Keeps the log here aside for its account, with its notes, as it stands once written (a set ticked while the copy is written makes a second copy): 'room' when the phone has no room for it. */
async function keepHere(from: string): Promise<'kept' | 'room' | 'busy'> {
  const notes = { meta: cloud.meta, editAt: cloud.editAt, last: cloud.last };
  for (let i = 0; i < KEEP_TRIES; i++) {
    const text = storedJson(state);
    if (!(await keepAside(from, text, notes))) return 'room';
    if (storedJson(state) === text) return 'kept';
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
    cloud.recAt = {};
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
      "Add it to this account, or use this account's log?\n\nUsing this account's log keeps the other one on this phone until that account signs in here again.",
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
  const before = {
    state,
    meta: cloud.meta,
    editAt: cloud.editAt,
    recAt: cloud.recAt,
    last: cloud.last,
    acct: cloud.acct,
    ep: notesEpNow()
  };
  if (use && from) {
    const k = await keepHere(from);
    if (k !== 'kept') {
      if (k === 'room') fx.toast('No room on this phone for the other log. Export a backup of it first.');
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
  // A log kept aside keeps no record times: its records are decided by their documents' times until edited again.
  cloud.recAt = (n && n.recAt) || {};
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
    cloud.recAt = before.recAt;
    cloud.last = before.last;
    cloud.acct = before.acct;
    notesAt(before.ep);
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
  if (both) fx.toast("This phone's workout stays open. The account's is saved in **History**.");
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
    cloud.recAt = {};
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
  if (ev.key === KEY || ev.key === SYNC_KEY) tabsHeard = true;
  if (ev.key === SYNC_KEY && ev.newValue) {
    try {
      const m = rec(parseJson(ev.newValue));
      if (m && epOf(m) < notesEpNow()) {
        // Written by a tab that had not yet heard these notes (saveMeta, above): these stand, written back.
        log('tabs', new Error('older sync notes from another tab; this tab wrote its own back'));
        saveMeta();
      } else if (m && epOf(m) === notesEpNow() && (typeof m.acct === 'string' ? m.acct : null) === cloud.acct) {
        // The same log and account: joined (joinNotes), and written back when this tab held something they lacked.
        if (joinNotes(m, ev.newValue)) saveMeta();
      } else if (m) {
        const { meta, editAt, recAt, last } = notesIn(m, 'tabs');
        if (meta) cloud.meta = meta;
        cloud.sent = sentIn(m.sent);
        if (editAt) cloud.editAt = editAt;
        cloud.recAt = recAt || {};
        cloud.last = last;
        // The notes' account with them: a tab that kept the account it read before acted for it on another's log.
        cloud.acct = typeof m.acct === 'string' ? m.acct : null;
        notesAt(epOf(m));
        notesRead(ev.newValue);
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
/** Whether another tab has written the log or the notes while this one was open: then each save notes its records'
    times at once (saveNow), for the other tab to merge it by. */
let tabsHeard = false;
/** The record times in the notes another tab last wrote, where they are its and not yet taken in here; else null. */
function otherTabTimes(): Record<string, Record<string, number>> | null {
  try {
    const text = localStorage.getItem(SYNC_KEY);
    if (text == null || text === notesSeenNow()) return null;
    const m = rec(parseJson(text));
    if (!m || epOf(m) !== notesEpNow() || (typeof m.acct === 'string' ? m.acct : null) !== cloud.acct) return null;
    return notesIn(m, 'tabs').recAt;
  } catch (e) {
    // Notes unreadable now: the other tab's copy is kept where both changed one record, as with no times.
    log('tabs', e);
    return null;
  }
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
  // The other tab's record times, as it wrote them with this save, read before this tab writes its own notes.
  const other = otherTabTimes();
  // This tab's edits not yet noted keep their own time: noted before the other tab's save is merged in (the rule
  // above resyncLocalH).
  trackEdits();
  const held = heldNow();
  const stat: { conflicts: number; byTime: number; lost: Lost[] } = { conflicts: 0, byTime: 0, lost: [] };
  // The workout here before the merge: the copy that may lose it (below), and what is then said.
  const dr0 = state.draft;
  let kept: Kept = null;
  if (!base || canon(state) === canon(base)) setState(incoming);
  else {
    const L = chunksOf(state),
      Rr = chunksOf(incoming),
      B = chunksOf(base),
      parts: Record<string, Rec | null> = {};
    /* A record changed in both tabs keeps the later edit, by each record's time, as on two phones: the other tab
       writes its records' times with its save (saveNow), and this tab has just noted its own. Where either is unknown
       (a tab on a build that keeps none, or one whose times were not yet written), the other tab's copy: letting this
       tab's own copy win on its own save loses what the other tab logged: a tab behind takes away the other's new
       workout and its sets, a change typed loses to a later tick, and Undo takes back the other tab's edit
       (tests/storage-sync.js S-6). A tab shown again takes in the other's saves first (onVisibility), so a clash needs
       both tabs changing one item before either hears the other, a moment; the words then say whose copy was kept
       (conflictNote). */
    for (const id of new Set([...Object.keys(L), ...Object.keys(Rr), ...Object.keys(B)]))
      parts[id] = mergeChunk(
        id,
        baseOf(id, B[id] || emptyChunk(id)),
        L[id] || emptyChunk(id),
        Rr[id] || emptyChunk(id),
        clashRule(id, other ? other[id] || null : null, true),
        stat
      );
    for (const id in parts) recordTimesAfter(id, L[id], Rr[id], parts[id], other ? other[id] || null : null);
    const aside = laterCopiesKept(parts, stat);
    setState(assemble(parts));
    // Undo of a change kept here over the other tab's copy goes back to that copy (undoKeeps).
    undoKeeps(stat.lost);
    putCopiesAside(aside);
    /* The copy of the workout that lost the merge keeps its sets, as on two phones (keepLost): this tab's when it held
       something logged the other tab's save lacked, the other tab's when it did and this tab's copy stood. Logged means
       a set ticked or changed once ticked, or cardio entered: a load being typed or a question answered is no reason to
       keep a workout the other tab discarded (else Discard in one tab while a load is typed in the other brings the
       workout back in History). Without this, a set ticked in a tab behind, in a workout the other tab had finished,
       would be dropped without a word. */
    const agreed = base.draft;
    if (changedSince(dr0, agreed)) kept = keepLost(dr0, state.draft, agreed, true, true);
    if (changedSince(incoming.draft, agreed)) keepLost(incoming.draft, state.draft, agreed, true, true);
  }
  keepLastCopies(held);
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
  if (editsPending()) trackEdits();
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
    notesRead(text);
    if (m) {
      const { meta, editAt, recAt, last } = notesIn(m, 'sync-meta');
      cloud.meta = meta || {};
      cloud.last = last || null;
      cloud.editAt = editAt || {};
      cloud.recAt = recAt || {};
      cloud.devId = typeof m.devId === 'string' ? m.devId : null;
      cloud.acct = typeof m.acct === 'string' ? m.acct : null;
      cloud.sent = sentIn(m.sent);
      notesAt(epOf(m));
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
    // Writes sent from a log no longer here are not this log's: forgotten with the notes, and the rows' notes with them.
    rowsForget();
    cloud.meta = {};
    cloud.sent = {};
    cloud.editAt = {};
    cloud.recAt = {};
  }
  resyncLocalH();
  rowsStart({
    ep: () => notesEpNow(),
    unsent: hasUnsent,
    pulledAt: () => readBegan,
    stop: rowsStop,
    writers: () => writers
  });
  rowsyncStart({ status: setCloud, fail: cloudFail, mergeStored: t => mergeIn(t, false), writeBack, crossBack });
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
}
