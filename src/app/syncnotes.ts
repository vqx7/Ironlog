/* The sync notes on this phone: what was last agreed with the account, each record's and document's edit time,
   the writes sent and not yet answered, and the rules under which two tabs keep one set of them. The tracker
   (edits.ts) writes the times into them; both ways the account is kept read them. */

import { parseJson, rec } from './records';
import type { Rec } from './records';
import { isChunkId } from './chunks';
import { normalize } from './normalize';
import type { DraftLike } from './session';
import { cloud } from './store';
import type { Base, CloudSent, SyncNote } from './store';
import { KEY, device, log } from './storage';
import { storedElsewhere } from './save';
import { rowsForget } from './rowsnotes';

/* ---------- the sync notes ---------- */

/** The key the sync notes are saved under: each document's last agreed copy, the device id and the account. */
export const SYNC_KEY = KEY + '.sync';
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
export function sentIn(v: unknown): Record<string, CloudSent> {
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
export const notesIn = (
  m: Rec,
  from: string
): {
  meta: Record<string, SyncNote> | null;
  editAt: Record<string, number> | null;
  recAt: Record<string, Record<string, number>> | null;
  last: number | null;
} => {
  const M = rec(m.meta),
    E = rec(m.editAt),
    T = rec(m.recAt);
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
  let recAt: Record<string, Record<string, number>> | null = null;
  if (T) {
    recAt = {};
    for (const k in T) {
      const t = timesIn(T[k]);
      if (t) recAt[k] = t;
    }
  }
  return { meta, editAt, recAt, last: typeof m.last === 'number' ? m.last : null };
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
/** When the notes in this tab last stopped describing the log before them (above). */
export const notesEpNow = (): number => notesEp;
/** Takes another moment as the one the notes in this tab last stopped describing the log before them: the notes another tab or an earlier visit stored. */
export function notesAt(ep: number): void {
  notesEp = ep;
}
/** The notes in this tab now describe a new log (above): forgotten, or another account's. */
export const newEp = (): void => {
  notesEp = Math.max(Date.now(), notesEp + 1);
  // The rows' notes describe the log the notes before did: forgotten with them.
  rowsForget();
};
/** The moment stored notes last stopped describing the log before them; 0 when they say none. */
export const epOf = (m: Rec | null): number => (m && typeof m.ep === 'number' ? m.ep : 0);
/* Two tabs keep one set of notes for one log and account, and each changes them as it syncs. A tab takes in the
   other's by joining them into its own, never by taking or writing either whole. Each document's note is
   read against the notes this tab last saw: the one changed since, here or there, is kept; changed in both (both tabs
   synced it), the later agreement, by the account's time for the copy agreed. An agreement older than this tab's is
   never taken as a change there: it is the other tab writing back notes from before it caught up, their writes having
   crossed, and the next sync, merging against it, would put back a set removed since. Edit times and the last sync are this
   phone's clock, so the later of each; a write sent from either tab is kept until it is answered. A tab that had not
   heard the other's notes wrote its own over them, so a session the other tab had synced lost its agreed copy, and
   the next sync read the tab's copy against the account's as an edit on two devices. Notes for another log (a later
   `ep`) or another account still replace these whole (onStorage, readStored). */
/** The notes' text as this tab last wrote or took it in: stored text unlike it was written by another tab and not yet taken in. */
let notesSeen: string | null = null;
/** The notes' text as this tab last wrote or took it in (above). */
export const notesSeenNow = (): string | null => notesSeen;
/** Notes the notes' text this tab has taken in, written by another tab or read at start. */
export function notesRead(text: string | null): void {
  notesSeen = text;
}
/** Whether two notes for a document are one agreement (or both absent). */
const sameNote = (a: SyncNote | undefined, b: SyncNote | undefined): boolean =>
  a === b || (!!a && !!b && a.h === b.h && a.at === b.at);
/** Joins notes another tab wrote for the same log and account into this tab's (above): whether this tab's held something theirs did not. */
export function joinNotes(m: Rec, text: string | null): boolean {
  const { meta, editAt, recAt, last } = notesIn(m, 'tabs');
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
            ? there.at >= here.at
              ? there
              : here
            : there.at > here.at
              ? there
              : here;
    if (keep) cloud.meta[k] = keep;
    if (!sameNote(keep, there)) mine = true;
  }
  const te = editAt || {};
  for (const k in cloud.editAt) if (!(k in te) || cloud.editAt[k] > te[k]) mine = true;
  for (const k in te) cloud.editAt[k] = Math.max(cloud.editAt[k] || 0, te[k]);
  /* Each record's edit time: the later news of the two (laterEntry), a time that stopped being known included, so a
     time one tab dropped when it took in a copy with none never comes back from the other tab. */
  const tr = recAt || {};
  for (const d of new Set([...Object.keys(cloud.recAt), ...Object.keys(tr)])) {
    const here = cloud.recAt[d] || {},
      there = tr[d] || {};
    const out: Record<string, number> = {};
    for (const k of new Set([...Object.keys(here), ...Object.keys(there)])) {
      const h = here[k],
        t = there[k];
      out[k] = h === undefined ? (t ?? 0) : t === undefined ? h : laterEntry(t, h);
      if (h !== undefined && out[k] !== t) mine = true;
    }
    cloud.recAt[d] = out;
  }
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
export function notesCatchUp(): boolean {
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
export function saveMeta(): boolean {
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
      recAt: cloud.recAt,
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
/** The workout in progress a draft document holds, as normalize() keeps it, or null. */
export const draftOf = (D: Rec | null): DraftLike | null => normalize({ draft: (D && D.draft) || null }).draft;
/** Record times as stored or sent: each a number, by its key; null when there are none. */
export function timesIn(v: unknown): Record<string, number> | null {
  const r = rec(v);
  if (!r) return null;
  const out: Record<string, number> = {};
  for (const k in r) {
    const t = r[k];
    if (typeof t === 'number' && Number.isFinite(t)) out[k] = t;
  }
  return Object.keys(out).length ? out : null;
}
/* A record whose copy was taken in with no time (from a build that keeps none) has no known time from then on. That is
   kept as the moment it stopped being known, below 0 (`unknownSince`), not as no entry: the notes of two tabs are
   joined by the later of each record's entries (joinNotes), so an old time the other tab still held would come back
   and outrank the later edit the copy taken in held. A time below 0 decides no clash and is never sent. */
/** Which of two entries of one record's time is the later news: the one of the later moment, known or not. */
export const laterEntry = (a: number, b: number): number => (Math.abs(b) > Math.abs(a) ? b : a);
/** A record's time as known: undefined for none or one that stopped being known (above). */
export const knownTime = (t: number | undefined): number | undefined => (t !== undefined && t > 0 ? t : undefined);
