/* Saving the log, and the account's copy of it (phase 4, r56; moved from the
   legacy script's storage, sync and account parts, changing nothing they do).
   A save goes to this device at once (saveNow) and on to the account after
   it (cloudSoon): localStorage alone is not durable on a phone (iOS deletes a
   site's storage after 7 days without a visit, clearing browser data wipes
   it, a new phone starts empty), so localStorage stays the instant, offline
   copy and the account is the durable one. Inside Claude the artifact's own
   database stood in for the account, and the sync suites still use it so.

   Layout: one document for routines, exercises, settings and body data, one
   for the in-progress session, one per half-month of sessions, and one per
   year of body data, so no document nears the 256 KB cap and logging a set
   rewrites only the small draft doc. Each document stores its chunk as a JSON
   string with a timestamp. Only chunks whose content changed are written, one
   at a time, in order. The three-way merge of a document edited on two
   devices, the sync notes each device keeps, and the merge of another tab's
   save are here too. Nothing runs on import: syncStart() runs what the parts
   ran as the page loaded, from the start of the legacy script. */

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
import { acct, cloud, fx, setState, state, ui } from './store';
import type { Base, CloudDb, CloudRef, CloudStatus, State, SyncNote } from './store';
import {
  KEY,
  capturePost,
  demoRestore,
  device,
  log,
  clearTimer,
  keepAside,
  asideOf,
  dropAside,
  load,
  undoForget
} from './storage';

/** Sync's timings, in milliseconds: a save and the edit notes once the taps
    pause, a flush once they pause (and again when another device holds the
    lease), the lease and the wait for it, the wait for any answer from the
    account, an account error's toast, and how long after the last pull a
    return to the app pulls again. */
/** How long a request to the account may go without an answer before it is given up, in milliseconds: the sync's, the sign-in's and a problem report's (r63, PENDING 306 and 309). */
export const NET_MS = 20000;
const SYNC_MS = {
  save: 400,
  track: 800,
  flush: 1200,
  leaseBusy: 2500,
  lease: 30000,
  leaseWait: 10000,
  net: NET_MS,
  errToast: 8000,
  pullAfter: 20000
} as const;
/** The waits between tries after a sync fails, in seconds, the last repeated. */
const RETRY_S: readonly number[] = [5, 15, 60, 180];
/** A sync document over this many characters of JSON is left unwritten (the account's size cap), so it cannot stop the others. */
const DOC_MAX = 250000;
/** Tries at keeping the log aside before giving up (a set ticked while the copy is written makes another). */
const KEEP_TRIES = 10;

declare global {
  interface Window {
    /** Claude's artifact services, where the page runs inside Claude (retired; the sync suites inject a stand-in db through it). */
    claude?: { use?: ClaudeUse | undefined } | undefined;
    /** The account backend's handle for the sync (scripts/cloud-supabase.js): the document store and who is signed in. */
    ironlogCloud?:
      | (() => Promise<{ db?: CloudDb | null | undefined; userId?: unknown } | null | undefined>)
      | undefined;
  }
}
/** `window.claude.use`: the artifact's database, and the viewer. */
interface ClaudeUse {
  (what: 'db'): Promise<CloudDb | null | undefined>;
  (what: 'user'): Promise<{ id(): Promise<unknown> } | null | undefined>;
}

/* ---------- the save on this device ---------- */

let saveT: number | null = null;
/** Writes the log's text to this device and notes it as the last saved, the base another tab's write is merged against (onStorage); throws as setItem does. */
function writeLocal(j: string): void {
  localStorage.setItem(KEY, j);
  device.lastSaved = j;
}
/* Whether another tab wrote the log since this one last saved or heard it:
   the save there is not yet heard here (a storage event comes a task later),
   so writing now would replace it (from the independent review of r60: a
   tick in one tab and a load typed in another, each tab saving what it had,
   lost one of them). A log never saved or read here has nothing to compare. */
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
export const SYNC_KEY = KEY + '.sync';
/* The notes as they were saved, each entry checked field by field (r56.1,
   PENDING 305): a note that fails is dropped, with a line in the error log,
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
/* The notes on the phone describe the log on the phone, always (PENDING
   333, the review of the fix). So they are not written while the log's own
   save is failing: a sync note saved ahead of the log made the log of the
   next start read as edited back, and the sync deleted the workouts it
   lacked from the account (r55 and since). Nor over newer notes from another
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
/** Writes the sync notes to this device: whether they were written (above). */
export function saveMeta(): boolean {
  if (device.boot && !device.ok) return false;
  try {
    if (epOf(rec(parseJson(localStorage.getItem(SYNC_KEY) || 'null'))) > notesEp) {
      log('tabs', new Error('newer sync notes from another tab; not written over'));
      return false;
    }
    localStorage.setItem(
      SYNC_KEY,
      JSON.stringify({
        meta: cloud.meta,
        last: cloud.last,
        editAt: cloud.editAt,
        devId: cloud.devId,
        acct: cloud.acct || undefined,
        ep: notesEp || undefined
      })
    );
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
    cloud.on = false;
    setCloud('local');
    fx.render();
    return;
  }
  if (c === 'gone') {
    /* the account was deleted elsewhere: signed out, the notes forgotten, the log kept (r55.1) */
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
  const wait = RETRY_S[Math.min(cloud.retry++, RETRY_S.length - 1)] * SECOND_MS;
  clearTimer(cloud.t);
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
    // A document normalize() cannot read is compared as it came, as before the move.
    log('sync-norm', e);
    return D;
  }
}
/** The workout in progress a draft document holds, as normalize() keeps it, or null. */
const draftOf = (D: Rec | null): DraftLike | null => normalize({ draft: (D && D.draft) || null }).draft;
/** A document's merge base: the fingerprint of every record (by list), field and setting it holds; for the draft, the copy itself too (r56.1). */
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
    /* A setting absent from the base was absent, not unknown (r33): a key one
       side added (Your gym, an accent) or brought back by Undo is a change on
       that side, not a conflict the other side's absence could win. */
    for (const k of new Set([...Object.keys(ls), ...Object.keys(rs)])) {
      const v = merge3Val(base ? (k in bs ? bs[k] : Hx(undefined)) : '?', ls[k], rs[k], remoteWins, stat);
      if (v !== undefined) settings[k] = v;
    }
    return out;
  }
  if (id === 'draft') {
    // One workout open on two phones (r56.1): the same workout on both sides and in the base, neither an edit of a
    // saved session, merges exercise by exercise and set by set against the copy both agreed on (mergeWorkout).
    const ld = draftOf(l),
      rd = draftOf(r),
      bd = base && base.draft && !base.draft.editingId ? base.draft : null;
    if (bd && ld && rd && ld.id === rd.id && bd.id === ld.id && !ld.editingId && !rd.editingId)
      return { draft: mergeWorkout(bd, ld, rd, remoteWins, stat) };
    // Closed on one side (finished or discarded) while the other ticked on: closed stays closed, whichever edit was
    // later, since closing is the lifter's call; the sets ticked since are kept by keepLost (joined to the saved session).
    if (bd && ((!rd && ld && ld.id === bd.id) || (!ld && rd && rd.id === bd.id))) return { draft: null };
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
   is tracked per document: an edit to a session no longer makes an older
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
export function trackEdits(): void {
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
export function resyncLocalH(): void {
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
   words rather than the generic note (r45, audit item 288). */
function draftNote(prev: unknown, kept?: Kept): void {
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
     on a save that did not upload (r46). The draft goes up last, so in the
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
  // What became of the sets ticked here (keepLost, r56.1) is said with it: joined to the session the other phone
  // saved, or saved as a session of their own. A session of the workout's id with another workout now open was
  // either finished there or kept there from this copy; either way its sets are in History, and that is what is said.
  const saved = state.sessions.some(s => s.id === P.id);
  fx.toast(
    kept === 'joined' || kept === 'cardioJoined'
      ? 'The workout in progress was saved on another device. What was done here since was added to it.'
      : kept === 'saved' || kept === 'cardio'
        ? `The workout in progress was ${state.draft ? 'replaced by the one on' : 'closed on'} another device. Its ${kept === 'saved' ? 'ticked sets are' : 'cardio is'} saved in History.`
        : state.draft
          ? saved
            ? 'The workout in progress was replaced by the one on another device. Its ticked sets are in History.'
            : 'The workout in progress was replaced by the one on another device.'
          : saved
            ? 'The workout in progress was saved on another device.'
            : 'The workout in progress was closed on another device.'
  );
}
/* The copy of the workout in progress that loses a merge is never dropped
   (r56.1, PENDING 328 a and c): its ticked sets go into the log as a session,
   with its cardio rows and check-in, as a first link keeps another phone's
   workout (draftSession, r55); when the same workout was finished on another
   phone (a session of its id is in the log), the sets join that session row
   by row against the copy both agreed on, and its cardio rows join the log's
   cardio, as Finish saves them (PENDING 333, F6: the join kept the sets
   alone, and a copy with cardio and no ticked set was dropped whole). A copy
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
  remoteWins: boolean
): Kept {
  if (!lost || lost.editingId || (now && now.id === lost.id)) return null;
  const kept = draftSession(lost),
    cardio = draftCardio(lost);
  if (!kept && !cardio.length) return null;
  const was = agreed && agreed.id === lost.id ? agreed : null;
  const have = state.sessions.find(q => q.id === lost.id);
  if (have) {
    /* The agreed copy is the base, an agreed copy with nothing ticked an
       empty one (PENDING 333, the review of the fix: read as none, two
       identical sets ticked one on each phone were matched as one). */
    const base = was ? draftSession(was, true) : null;
    const stat = { conflicts: 0 };
    // With no agreed copy (a note from a build before r56.1) the saved session's values stand where the two differ,
    // and only the rows this copy has and it lacks are added: Finish's duration and plan are not this copy's to undo.
    const joined = kept ? mergeSession(base, kept, have, base ? remoteWins : true, stat) : have;
    /* Its cardio rows merge against the agreed copy's, record by record, as
       its sets do: an edit made here is kept, a row the other phone deleted
       stays deleted (the review of the fix: a row in the log stood as it was,
       so an edit here was lost and a deletion there came back). */
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
    conflictNote(stat);
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
export function conflictNote(stat: { conflicts: number }): void {
  if (stat.conflicts) {
    log('sync-conflict', `${stat.conflicts} record(s) edited on two devices; kept the later edit`);
    fx.toast(
      `${stat.conflicts} item${stat.conflicts === 1 ? ' was' : 's were'} edited on two devices. The later edit was kept.`
    );
  }
}
/* A short lease on a lock document so two devices do not interleave their
   read-then-write of the same documents. If the lease is unavailable the
   write goes ahead, exactly as before; if another device holds it, this one
   waits and retries. */
async function takeLease(): Promise<boolean> {
  try {
    const r = ref('lock');
    if (typeof r.acquire !== 'function') return true;
    // The device id is set before any sync starts (syncStart), the !.
    const res = await withTimeout(
      r.acquire({ holder: cloud.devId!, ttlMs: SYNC_MS.lease }),
      SYNC_MS.leaseWait,
      'sync-lease'
    );
    const R = rec(res);
    return !(R && R.acquired === false);
  } catch (e) {
    log('sync-lease', e);
    return true;
  }
}
/* Whether this device holds a change the account does not have yet, by the
   same test a sync uses, without sending anything: the status still reads
   synced for the second or so before the next sync starts (r34.2). */
/** Whether anything here has not reached the account yet. */
export function hasUnsent(): boolean {
  if (!cloud.on) return false;
  if (cloud.status !== 'synced') return true;
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
export function cloudSoon(): void {
  if (!cloud.on) return;
  cloud.dirtyAt = Date.now();
  clearTimer(cloud.t);
  cloud.t = setTimeout(() => cq(cloudFlush), SYNC_MS.flush);
}

/* ---------- sending and pulling ---------- */

/** Writes every document that changed here to the account, merging each the account changed meanwhile. */
export async function cloudFlush(): Promise<void> {
  if (!cloud.on) return;
  if (trackT || cloud.pendAt) trackEdits();
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
  /* The draft goes up last (r46, the r45 QC): Finish empties it and adds the
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
  setCloud('saving');
  try {
    if (!(await takeLease())) {
      clearTimer(cloud.t);
      cloud.t = setTimeout(() => cq(cloudFlush), SYNC_MS.leaseBusy);
      return;
    }
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
    const legB = legacyBodyBase();
    for (const x of todo) {
      /* Read before write. If another device changed this document since we
         last agreed on it, merge record by record instead of overwriting. */
      const m = cloud.meta[x.id];
      const snap = await withTimeout(ref(x.id).get(), SYNC_MS.net, 'sync-read');
      /* Sets logged while that read was in flight are in state, not in the
         copy taken before it. Work from the current document, or the merge
         below would write the older copy back and lose them. */
      let json = JSON.stringify(chunksOf(state)[x.id] || emptyChunk(x.id));
      const b = snap && snap.exists ? rec(snap.data()) : null;
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
          if (x.id === 'draft') dn = { prev: state.draft, sessions0: state.sessions, kept: null, lost: null };
          const agreed = x.id === 'draft' && m && m.b ? m.b.draft : null;
          const mergedDraft = x.id === 'draft' ? draftOf(merged) : null;
          // This copy lost (closed or replaced): the session it may have become on the other phone is read first,
          // before anything here changes, so its sets join that session rather than making a second one of its id,
          // and a read that fails (the connection gone mid-flush) leaves the workout here as it was, for the retry.
          if (dn && dn.prev && (!mergedDraft || mergedDraft.id !== dn.prev.id)) await sessionFromCloud(dn.prev, legB);
          applyChunk(x.id, merged);
          adopted = true;
          if (x.id === 'draft' && dn) {
            // The copy that lost (this device's, dirty here, or the account's, which a later edit here replaced) keeps its sets.
            const prev = dn.prev,
              remoteDraft = draftOf(rec(rd));
            dn.kept = keepLost(prev, mergedDraft, agreed, remoteWins);
            dn.lost = keepLost(remoteDraft, mergedDraft, agreed, remoteWins);
            if (dn.kept || dn.lost || canon(state.sessions) !== canon(dn.sessions0)) again = true;
          }
          if (x.id === 'core' && absorbLegacy(legacyBody(rec(rd)))) moreBody = true;
          json = JSON.stringify(chunksOf(state)[x.id] || emptyChunk(x.id));
          if (hashStr(json) === hashStr(b.json)) {
            cloud.meta[x.id] = { h: hashStr(b.json), at: Number(b.at), b: baseOf(x.id, rd) };
            saveMeta();
            continue;
          }
        }
      }
      // One document over the size cap must not stop the others from syncing.
      if (json.length > DOC_MAX) {
        tooBig.push(x.id);
        log('sync-flush', { code: 'too_big', id: x.id, len: json.length });
        continue;
      }
      const at = Date.now();
      await withTimeout(ref(x.id).set({ v: 1, at, et: cloud.editAt[x.id] || at, json }), SYNC_MS.net, 'sync-write');
      cloud.meta[x.id] = { h: hashStr(json), at, b: baseOf(x.id, parseJson(json)) };
      saveMeta();
    }
    if (adopted) {
      invalidate();
      try {
        writeLocal(JSON.stringify(state));
      } catch (e) {
        log('storage', e);
      }
      resyncLocalH();
      if (!ui.modal) fx.rerenderKeepScroll();
      conflictNote(stat);
      if (dn) {
        draftNote(dn.prev, dn.kept);
        lostNote(dn.lost);
      }
    }
    cloud.retry = 0;
    // Weigh-ins found in an older core go to their body documents on the next pass, as do the sets a losing copy kept.
    if (moreBody || again) cloudSoon();
    if (tooBig.length) {
      saveMeta();
      setCloud(
        'offline',
        tooBig.includes('core')
          ? 'Routines and settings are too large to sync. Export a backup.'
          : tooBig.some(i => i.startsWith('b-'))
            ? 'A year of body data is too large to sync. Export a backup.'
            : 'One month of sessions is too large to sync. Export a backup.'
      );
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
/* Pull what other devices wrote. Per document:
   - changed in the cloud only: take the cloud copy.
   - changed on both: merge record by record (see mergeChunk).
   - first link of a device that already had its own data: merge sessions, cardio and body logs from both (never demo data), keep the side
     with more real sessions for settings, routines and exercises combined; no Undo since r55 (it put this device's copy back as the truth,
     which deleted the account's own records everywhere). */
/** Reads every document of the account and takes in what other devices wrote, then flushes. */
export async function cloudPull(): Promise<void> {
  if (!cloud.on || !cloud.db) return;
  if (trackT || cloud.pendAt) trackEdits();
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
  const remote: Record<string, { at: number; et: number; data: unknown; h: string }> = {};
  for (const d of snap.docs) {
    if (!d.exists || !isChunkId(d.id)) continue;
    const b = rec(d.data());
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
  const rids = Object.keys(remote);
  if (!rids.length) {
    // an empty account takes this device's log as it is, less its demo data, as a merge does (r55, the review: an empty account was given the demo's 27 sessions)
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
    stripDemo(mine); // demo data never goes into an account (r55, the audit: it was merged and uploaded)
    if (!holdsLog()) {
      // by what is here, not by whether a save was found at start: a first run's workout was wiped by a sign-in before a reopen (r55, the audit)
      parts = Object.fromEntries(rids.map(k => [k, rec(remote[k].data)]));
      rids.forEach(k => adoptedIds.add(k));
    } else {
      // a routine or exercise made here is the phone's own too (r55, the review: one built before a first sign-in was replaced)
      merged = true; // no Undo (r55, the audit): a merge only adds, and undoing it took the account's own sessions off every device
      const base = realCount(mine) > realCount(rState) ? mine : rState,
        other = base === mine ? rState : mine;
      /* Settings come from the side with more sessions, but exercises and
         routines are combined by id (that side's copy wins a clash), so a
         custom exercise or routine made on the other device is not lost and
         its logged sets keep their name. Of two workouts in progress, this device's stays in progress and the other's ticked sets and cardio are saved, as Finish saves them, never dropped (r55, the review: one was lost on every device; the second review: its cardio and check-in were). */
      const aside = state.draft && rState.draft && rState.draft.id !== state.draft.id ? rState.draft : null;
      const kept = aside ? draftSession(aside) : null;
      keptDraft = !!kept && ![...mine.sessions, ...rState.sessions].some(x => x.id === kept.id);
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
    }
  } else {
    parts = { ...local };
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
    try {
      writeLocal(JSON.stringify(state));
    } catch (e) {
      log('storage', e);
    }
    for (const id of adoptedIds) {
      // Mark adopted documents as agreed with the cloud copy. Normalizing can
      // change a document (a newer build adds defaults); it then differs from
      // the agreed hash, so the flush below writes the normalized form back.
      cloud.meta[id] = { h: remote[id].h, at: remote[id].at, b: baseOf(id, remote[id].data) };
    }
    saveMeta();
    resyncLocalH();
    // Ready-made routines from earlier builds' Recently deleted leave here too,
    // and the cleared list goes back to the cloud (r34.1).
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
/* Where the cloud copy lives. Inside Claude it is the artifact's database.
   The standalone app's backend (scripts/cloud-supabase.js) plugs in by
   defining window.ironlogCloud as an async function returning {db, userId},
   where db offers the same calls the code here uses: doc(path).get() /
   .set(obj) / optional .acquire(), and collection(path).get() listing {id,
   exists, data()}. Nothing else changes: merging, chunking and conflict
   handling stay as they are. */
async function cloudProvider(): Promise<{ db: CloudDb; userId: string } | null> {
  if (window.claude && typeof window.claude.use === 'function') {
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    if (!db || !user) return null;
    const id = await user.id();
    return id ? { db, userId: String(id) } : null;
  }
  if (typeof window.ironlogCloud === 'function') {
    const p = await window.ironlogCloud();
    return p && p.db && p.userId ? { db: p.db, userId: String(p.userId) } : null;
  }
  return null;
}
let cloudStarting = false;
/* ---------- signing in: which log the phone holds (r56.1, PENDING 328 b and 333) ---------- */

/* The sync notes belong to one account (cloud.acct), and the log on the
   phone is the one they describe. Signing in to another account on this
   phone (V's call of 2026-10-20) is settled here, before any sync, by one
   rule for every path:
   - The log kept aside for the account signed in to, if there is one, comes
     back with its own notes, so it syncs as a continuation: what that account
     changed or deleted meanwhile stands. Taken back without its notes it
     synced as a first link, undoing edits and bringing back deletions on
     every phone (PENDING 333, F4). It is looked for whenever the notes do not
     name this account, also when they name none (Sign out, a restore, Copy
     my log in, demo data and Erase everything forget them), which once left
     it aside for good (F3).
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
     log under the other's notes (F1). Undo is cleared once the log is
     another account's: a step held the log before, and undoing it would sync
     that log into this account.
   - One tab at a time: every tab hears a sign-in, and each would ask and act
     on the notes it read before (F2). The rule runs under a lock the browser
     gives one tab at a time (Web Locks), and a tab that waited reads the
     notes, and the log with them, as the other tab left them, so it finds the
     switch made. A browser without Web Locks (Safari before 15.4) runs it at
     once, as before. */
/** Runs fn in one tab of this app at a time (above); at once where the browser has no Web Locks. */
async function oneTab<T>(fn: () => Promise<T>): Promise<T> {
  const L = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (L && typeof L.request === 'function') return await L.request(KEY + '.account', () => fn());
  return fn();
}
/** The notes as stored now, and the log with them when another tab moved them to another account: a tab acts on what is stored, not on what it read before (above). */
function readStored(): void {
  let m: Rec | null = null;
  try {
    m = rec(parseJson(localStorage.getItem(SYNC_KEY) || 'null'));
  } catch (e) {
    log('tabs', e);
  }
  if (!m) return;
  const now = typeof m.acct === 'string' ? m.acct : null;
  notesEp = epOf(m);
  if (now === cloud.acct) return;
  const n = notesIn(m, 'tabs');
  cloud.meta = n.meta || {};
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
/** A log kept aside joined with the lifter's log here, as a first link joins them: every record of both by id (the log kept aside winning a clash), its settings, and the workout in progress here, which stays open as a first link keeps this device's, the other's ticked sets and cardio saved (the review of the fix: the one kept aside opened and the one here closed, unsaid). */
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
     make an empty log read as deletions (the review of the fix). */
  if (!from && !aside) {
    cloud.meta = {};
    cloud.editAt = {};
    cloud.last = null;
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
     data or a ready-made routine left as it came (the review of the fix: the
     join put demo sessions and a second starter routine into the account). */
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
  if (both)
    fx.toast('The workout in progress on this phone stays open. The one kept for this account is saved in History.');
  // The copy kept for this account is the log in use now, saved here with its notes.
  if (aside) await dropAside(id);
  return true;
}
/** Starts the sync for the account signed in, if there is one: the first pull, then every save flushes. */
export async function cloudInit(): Promise<void> {
  if (cloud.on || cloudStarting) return;
  cloudStarting = true;
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
    setCloud('connecting');
    if (ui.tab === 'settings') fx.render();
    await cq(cloudPull);
  } catch (e) {
    // The backend could not be reached or refused the sign-in: the app stays on this device alone, and the account panel offers a retry. Its reason is kept.
    log('auth', e);
    cloud.on = false;
    setCloud('local');
  } finally {
    cloudStarting = false;
    cloudChecked = true;
    // The first page waits for this check (a splash until then): after a sign-out too (r33).
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
    that account merges against them, as a sync does (r55, the audit: a first
    link let the kept copy undo edits and bring back deletions made since on
    other phones). A log replaced while signed out (Erase everything, a backup
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
    cloud.editAt = {};
    cloud.last = null;
    newEp();
  }
  cloud.retry = 0;
  saveMeta();
  setCloud('local');
}

/* ---------- another tab, and leaving the page ---------- */

/* Two tabs (or the app and a second window) used to overwrite each other: each
   wrote its whole state, so the one that saved last erased what the other had
   saved. Now each tab hears the other's save and merges it into its own
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
      } else if (m) {
        const { meta, editAt, last } = notesIn(m, 'tabs');
        if (meta) cloud.meta = meta;
        if (editAt) cloud.editAt = editAt;
        cloud.last = last;
        // The notes' account with them (PENDING 333, F2): a tab that kept the account it read before acted for it on another's log.
        cloud.acct = typeof m.acct === 'string' ? m.acct : null;
        notesEp = epOf(m);
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
    // Not merged. This tab's own save goes ahead over it, as every save did before r60.
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
  if (!base || canon(state) === canon(base)) setState(incoming);
  else {
    const L = chunksOf(state),
      Rr = chunksOf(incoming),
      B = chunksOf(base),
      parts: Record<string, Rec | null> = {};
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
  conflictNote(stat);
}
function onVisibility(): void {
  if (document.visibilityState === 'hidden') {
    if (saveT) saveNow();
    if (cloud.on) {
      clearTimer(cloud.t);
      cq(cloudFlush);
    }
  } else if (cloud.on && Date.now() - cloud.lastPull > SYNC_MS.pullAfter) cq(cloudPull);
}
function onPageHide(): void {
  if (saveT) saveNow();
  if (trackT || cloud.pendAt) trackEdits();
}

/** What the sync part ran as the page loaded, in its order: the sync notes
    read from this device, the device id, the notes forgotten when no save
    was readable, this device's hashes of the log, then the listeners for
    another tab's save and for the page being hidden or left. Called once,
    from the start of the legacy script, after storageStart(). */
export function syncStart(): void {
  try {
    const m = rec(parseJson(localStorage.getItem(SYNC_KEY) || 'null'));
    if (m) {
      const { meta, editAt, last } = notesIn(m, 'sync-meta');
      cloud.meta = meta || {};
      cloud.last = last || null;
      cloud.editAt = editAt || {};
      cloud.devId = typeof m.devId === 'string' ? m.devId : null;
      cloud.acct = typeof m.acct === 'string' ? m.acct : null;
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
    cloud.meta = {};
    cloud.editAt = {};
  }
  resyncLocalH();
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', onPageHide);
}
