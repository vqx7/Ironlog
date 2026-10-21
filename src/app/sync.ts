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

import { uid, hashStr } from './util';
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
import { routineEmpty } from './routines';
import { normalize, plainTemplate } from './normalize';
import { invalidate } from './live';
import { AUTH } from './providers';
import { acct, cloud, fx, setState, state, ui } from './store';
import type { Base, CloudDb, CloudRef, CloudStatus, State, SyncNote } from './store';
import { KEY, capturePost, demoRestore, device, log, clearTimer, keepAside, takeAside, undoForget } from './storage';

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
/** Writes the log to this device now, notes the edit for the sync and schedules the flush. */
export function saveNow(): void {
  clearTimer(saveT);
  saveT = null;
  capturePost();
  /* Storage that failed its check at startup stays off: its old contents were
     never read, so writing now could overwrite them. A write that fails later
     (storage full) is tried again on every save, and saving resumes as soon
     as one succeeds, rather than stopping for the rest of the visit. */
  if (device.boot) {
    try {
      const j = JSON.stringify(state);
      localStorage.setItem(KEY, j);
      device.lastSaved = j;
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
/** Writes the log once the taps pause (400 ms). */
export function saveSoon(): void {
  clearTimer(saveT);
  saveT = setTimeout(saveNow, 400);
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
/** Writes the sync notes to this device. */
export function saveMeta(): void {
  try {
    localStorage.setItem(
      SYNC_KEY,
      JSON.stringify({
        meta: cloud.meta,
        last: cloud.last,
        editAt: cloud.editAt,
        devId: cloud.devId,
        acct: cloud.acct || undefined
      })
    );
  } catch (e) {
    log('sync-meta', e);
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
/** A promise, or a timeout error after ms. */
export function withTimeout<T>(pr: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    pr,
    new Promise<never>((_, rej) =>
      setTimeout(() => {
        rej({ code: 'timeout' });
      }, ms)
    )
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
  const c = E && E.code;
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
    fx.toast(String(E && E.message), null, 8000);
    return;
  }
  if (c === 'quota_exceeded') {
    setCloud('offline', 'The cloud copy is full. Export a backup and delete old demo data.');
    return;
  }
  setCloud('offline', c === 'denied' && E && typeof E.message === 'string' ? E.message : undefined);
  const wait = [5, 15, 60, 180][Math.min(cloud.retry++, 3)] * 1000;
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
  trackT = setTimeout(trackEdits, 800);
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
function draftNote(prev: unknown, kept?: 'saved' | 'joined' | null): void {
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
    kept === 'joined'
      ? 'The workout in progress was saved on another device. What was done here since was added to it.'
      : kept === 'saved'
        ? state.draft
          ? 'The workout in progress was replaced by the one on another device. Its ticked sets are saved in History.'
          : 'The workout in progress was closed on another device. Its ticked sets are saved in History.'
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
   by row against the copy both agreed on. A copy that lost nothing (the same
   workout, still open), an edit of a saved session, or one with nothing
   ticked is left alone. Only a copy that carried changes the account did not
   have is kept: the callers pass the local copy when it was dirty, and the
   account's copy a later edit here replaced. */
/** Keeps a losing copy's ticked sets (above); says what was done, for the toast. */
function keepLost(
  lost: DraftLike | null | undefined,
  now: DraftLike | null,
  agreed: DraftLike | null | undefined,
  remoteWins: boolean
): 'saved' | 'joined' | null {
  if (!lost || lost.editingId || (now && now.id === lost.id)) return null;
  const kept = draftSession(lost);
  if (!kept) return null;
  const have = state.sessions.find(q => q.id === lost.id);
  if (have) {
    const base = agreed && agreed.id === lost.id ? draftSession(agreed) : null;
    const stat = { conflicts: 0 };
    // With no agreed copy (a note from a build before r56.1) the saved session's values stand where the two differ,
    // and only the rows this copy has and it lacks are added: Finish's duration and plan are not this copy's to undo.
    const joined = mergeSession(base, kept, have, base ? remoteWins : true, stat);
    if (canon(joined) === canon(have)) return null;
    setState(normalize({ ...state, sessions: state.sessions.map(q => (q.id === lost.id ? joined : q)) }));
    edited(joined.date);
    conflictNote(stat);
    return 'joined';
  }
  setState(
    normalize({
      ...state,
      sessions: [...state.sessions, kept],
      cardio: unionById(state.cardio, draftCardio(lost))
    })
  );
  edited(kept.date);
  return 'saved';
}
/** Notes an edit of the half-month document of a date made here now (keepLost), so a later merge of it reads this device's change as the later one; the flush that follows carries it. */
function edited(date: string): void {
  cloud.editAt[chunkOf(date)] = Date.now();
  saveMeta();
}
/** Says what became of the account's copy of a workout that lost a merge here (keepLost): the sets ticked on the other phone were saved, or joined to the session saved here. */
function lostNote(kept: 'saved' | 'joined' | null): void {
  if (kept === 'saved') fx.toast('Sets ticked on another device were saved in History.');
  else if (kept === 'joined') fx.toast('Sets ticked on another device were added to the session saved here.');
}
/** The half-month document of a workout read from the account and taken in as a pull takes it (adopted, or merged with this device's changes to it), when this device has not pulled it since the workout was finished elsewhere (keepLost): the session is then here to join. */
async function sessionFromCloud(d: DraftLike, legB: Base | null): Promise<void> {
  if (d.editingId || state.sessions.some(q => q.id === d.id)) return;
  const id = chunkOf(d.date);
  const sn = await withTimeout(ref(id).get(), 20000);
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
    const res = await withTimeout(r.acquire({ holder: cloud.devId!, ttlMs: 30000 }), 10000);
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
/** Schedules a flush once the taps pause (1.2 s). */
export function cloudSoon(): void {
  if (!cloud.on) return;
  cloud.dirtyAt = Date.now();
  clearTimer(cloud.t);
  cloud.t = setTimeout(() => cq(cloudFlush), 1200);
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
      cloud.t = setTimeout(() => cq(cloudFlush), 2500);
      return;
    }
    let adopted = false,
      moreBody = false,
      again = false;
    const stat = { conflicts: 0 };
    let dn: {
      prev: DraftLike | null;
      sessions0: unknown;
      kept: 'saved' | 'joined' | null;
      lost: 'saved' | 'joined' | null;
    } | null = null;
    const tooBig: string[] = [];
    const legB = legacyBodyBase();
    for (const x of todo) {
      /* Read before write. If another device changed this document since we
         last agreed on it, merge record by record instead of overwriting. */
      const m = cloud.meta[x.id];
      const snap = await withTimeout(ref(x.id).get(), 20000);
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
      if (json.length > 250000) {
        tooBig.push(x.id);
        log('sync-flush', { code: 'too_big', id: x.id, len: json.length });
        continue;
      }
      const at = Date.now();
      await withTimeout(ref(x.id).set({ v: 1, at, et: cloud.editAt[x.id] || at, json }), 20000);
      cloud.meta[x.id] = { h: hashStr(json), at, b: baseOf(x.id, parseJson(json)) };
      saveMeta();
    }
    if (adopted) {
      invalidate();
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
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
    snap = await withTimeout(cloud.db.collection(`data/users/${cloud.uid}`).get(), 20000);
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
  let kept: 'saved' | 'joined' | null = null,
    lost: 'saved' | 'joined' | null = null;
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
      localStorage.setItem(KEY, JSON.stringify(state));
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
      const tr = arr(state.trash) || [];
      const n0 = tr.length;
      state.trash = tr.filter(t => {
        const T = rec(t);
        return !(T && T.kind === 'routine' && plainTemplate(T.data));
      });
      if ((arr(state.trash) || []).length !== n0) saveNow();
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
/** Two logs joined as a first link joins them: every record of both by id (the first log's copy winning a clash), the first log's settings, its workout in progress or else the other's, whose ticked sets are then saved. */
function joinLogs(base: State, other: State): State {
  const aside = base.draft && other.draft && other.draft.id !== base.draft.id ? other.draft : null;
  const kept = aside ? draftSession(aside) : null;
  return normalize({
    ...base,
    exercises: unionById(base.exercises, other.exercises),
    routines: unionById(base.routines, other.routines),
    sessions: unionById(base.sessions, kept ? [...other.sessions, kept] : other.sessions),
    bodyweights: unionById(base.bodyweights, other.bodyweights),
    measurements: unionById(base.measurements, other.measurements),
    cardio: unionById(base.cardio, aside ? [...other.cardio, ...draftCardio(aside)] : other.cardio),
    trash: unionById(arr(base.trash) || [], arr(other.trash) || []),
    draft: base.draft || other.draft
  });
}
/* A phone holding another account's log (r56.1, PENDING 328 b; V's call of
   2026-10-20): the sync notes belong to one account, and signing in to a
   different one on this device used to merge the first account's log into
   the second as a first link, so a deletion made in the second reached the
   first at its next sign-in. Now, with a log of the lifter's here, nothing
   merges until the lifter answers: Add it to this account (a first link, the
   merge as it is), or Use this account's log (the log here is kept aside for
   the account it belongs to, Undo is cleared, since a step held that log, and
   the sync starts on this account's own log: the one kept aside for it, if
   any, with its notes, else a new log the first pull fills from the account).
   Cancel leaves the notes as they were and undoes the sign-in through the
   account service alone. A device with nothing of the lifter's on it is not
   asked, nor one whose notes were forgotten (a restore, Copy my log in, demo
   data, Erase everything): those have no account to ask about. */
/** Starts the sync for the account signed in, if there is one: the first pull, then every save flushes. */
export async function cloudInit(): Promise<void> {
  if (cloud.on || cloudStarting) return;
  cloudStarting = true;
  try {
    const pv = await cloudProvider();
    if (!pv) return;
    const db = pv.db,
      id = pv.userId;
    /* Sync notes belong to one account. Signing in to a different account on
       this device starts over (above), never as a continuation that could
       judge the other account's records deleted. Notes saved before accounts
       existed have no owner and are kept. */
    if (cloud.acct && cloud.acct !== id) {
      const from = cloud.acct;
      let use = false;
      // The sign-in undone through the account service alone: the notes and the log stay as they were.
      const undo = (): void => {
        const A = AUTH();
        if (A)
          A.signOut().catch((x: unknown) => {
            log('auth', x);
          });
      };
      if (holdsLog()) {
        const a = await fx.ask(
          'A log from another account is on this phone',
          "Add it to this account, or use this account's log? Using this account's log keeps the other one on this phone until that account signs in here again.",
          'Add it to this account',
          "Use this account's log"
        );
        if (a === 'cancel') {
          // Nothing merges without an answer.
          undo();
          return;
        }
        use = a === 'alt';
      }
      if (use) {
        // The log here is replaced only once it is kept: a phone with no room for the copy keeps what it has.
        if (!keepAside(from, { meta: cloud.meta, editAt: cloud.editAt, last: cloud.last })) {
          fx.toast('There is not enough room on this phone to keep the other log aside. Export a backup of it first.');
          undo();
          return;
        }
        undoForget();
      }
      cloud.meta = {};
      cloud.editAt = {};
      cloud.last = null;
      const aside = takeAside(id);
      if (use) {
        setState(aside ? aside.state : normalize(null));
        if (aside) {
          const n = notesIn({ meta: aside.meta, editAt: aside.editAt, last: aside.last }, 'aside');
          cloud.meta = n.meta || {};
          cloud.editAt = n.editAt || {};
          cloud.last = n.last;
        }
      } else if (aside) setState(joinLogs(state, aside.state));
      if (use || aside) {
        commit();
        resyncLocalH();
        fx.render();
      }
    }
    cloud.acct = id;
    saveMeta();
    cloud.db = db;
    cloud.uid = id;
    cloud.on = true;
    setCloud('connecting');
    if (ui.tab === 'settings') fx.render();
    await cq(cloudPull);
  } catch (e) {
    // The backend could not be reached or refused the sign-in: the app stays on this device alone, and the account panel offers a retry.
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
      if (m) {
        const { meta, editAt, last } = notesIn(m, 'tabs');
        if (meta) cloud.meta = meta;
        if (editAt) cloud.editAt = editAt;
        if (last) cloud.last = last;
      }
    } catch (e) {
      log('tabs', e);
    }
    return;
  }
  if (ev.key !== KEY || ev.newValue == null || ev.newValue === device.lastSaved) return;
  let incoming: State,
    base: State | null = null;
  try {
    incoming = normalize(parseJson(ev.newValue));
  } catch (e) {
    log('tabs', e);
    return;
  }
  try {
    base = device.lastSaved ? normalize(parseJson(device.lastSaved)) : null;
  } catch (e) {
    // This tab's own last save cannot be read back: the other tab's copy is taken whole, as with no base.
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
  device.lastSaved = ev.newValue;
  clearTimer(saveT);
  saveT = null;
  invalidate();
  resyncLocalH();
  // Anything that was only here goes back out, so the other tab has it too.
  if (canon(state) !== canon(incoming)) saveNow();
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
  } else if (cloud.on && Date.now() - cloud.lastPull > 20000) cq(cloudPull);
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
