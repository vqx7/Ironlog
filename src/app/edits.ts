/* What changed on this phone, and when: the tracker. It reads the log a moment after the taps pause, notes each
   document's and each record's edit time for the lifter's own changes, and takes what the app wrote on its own,
   or took in from the account or another tab, as seen, so no time moves for it. */

import { hashStr } from './util';
import { parseJson, rec, arr } from './records';
import { CORE_ARR, CORE_FIELDS, chunksOf, emptyChunk } from './chunks';
import { recordKey, storedJson } from './merge';
import { cloud, state } from './store';
import { clearTimer, log } from './storage';
import { saveMeta } from './syncnotes';

/** How long after the taps pause the tracker looks, in milliseconds. */
const TRACK_MS = 800;

/** The keyed records of document `id` (above), each with the hash `hash` gives it. */
export function recordKeys(id: string, chunk: unknown, hash: (x: unknown) => string): Record<string, string> {
  const c = rec(chunk) || {};
  const out: Record<string, string> = {};
  if (id === 'draft') return out;
  const lists =
    id === 'core' ? CORE_ARR : id.startsWith('b-') ? ['bodyweights', 'measurements'] : ['sessions', 'cardio'];
  for (const k of lists)
    for (const x of arr(c[k]) || []) {
      const R = rec(x);
      if (R && typeof R.id === 'string') out[recordKey(k, R.id)] = hash(R);
    }
  if (id === 'core') {
    for (const k of CORE_FIELDS) if (c[k] !== undefined) out[recordKey('', k)] = hash(c[k]);
    const set = rec(c.settings) || {};
    for (const k in set) out[recordKey('settings', k)] = hash(set[k]);
  }
  return out;
}
/** A record's fingerprint as this device's tracker compares it (the fast hash of its text as saved). */
const savedHash = (x: unknown): string => hashStr(storedJson(x));
/** The latest edit time this device holds, a document's or a record's, its own or taken in. */
function latestSeen(): number {
  let t = 0;
  for (const k in cloud.editAt) t = Math.max(t, cloud.editAt[k]);
  for (const d in cloud.recAt) for (const k in cloud.recAt[d]) t = Math.max(t, Math.abs(cloud.recAt[d][k]));
  return t;
}
/** An edit time to write now: `t`, or just after the latest one seen when this device's clock is behind it (above). */
export const laterThanSeen = (t: number): number => Math.max(t, latestSeen() + 1);
/** Notes the records of document `id` the lifter changed since its text `was` (trackEdits): each changed or added at `at`; one gone is forgotten. */
function noteRecords(id: string, was: string | undefined, now: unknown, at: number): void {
  if (was === undefined) return;
  let before: Record<string, string>;
  try {
    before = recordKeys(id, parseJson(was), savedHash);
  } catch (e) {
    log('sync-track', e);
    return;
  }
  const after = recordKeys(id, now, savedHash);
  const times = (cloud.recAt[id] = cloud.recAt[id] || {});
  for (const k in after) if (before[k] !== after[k]) times[k] = at;
  for (const k in times) if (!(k in after)) delete times[k];
}
/* ---------- what changed on this device ---------- */

/* When each document last changed on this device. It decides conflicts, so it
   is tracked per document: an edit to a session never makes an older
   routine edit look new. Kept across reloads. */
/* Called on every save, so it only notes the time; the hashing runs once the
   taps pause, and again before any sync, so logging a set stays instant. */
let trackT: number | null = null;
/** Whether edits are waiting to be noted: the look is due, or a change was saved since the last one. */
export const editsPending = (): boolean => !!trackT || !!cloud.pendAt;
/** Each document's text as saved when this device last looked (trackEdits, resyncLocalH): what its records are read against. */
let seenText: Record<string, string> = {};
/** Whether the log has been taken as seen on this page yet (resyncLocalH): a document the look finds no hash for is then new since. */
let seenOnce = false;
/** Notes that the log changed now, and looks for the lifter's edits once the taps pause. */
export function markEdit(): void {
  if (!cloud.pendAt) cloud.pendAt = Date.now();
  clearTimer(trackT);
  trackT = setTimeout(trackEdits, TRACK_MS);
}
/** Notes which documents changed since the last look, and when (editAt). */
export function trackEdits(): void {
  clearTimer(trackT);
  trackT = null;
  try {
    const ch = chunksOf(state);
    const now = cloud.pendAt || Date.now();
    cloud.pendAt = null;
    // The time written: read once, before any is written here (laterThanSeen).
    let at: number | null = null;
    const stamp = (): number => (at ??= laterThanSeen(now));
    let moved = false;
    for (const id of new Set([...Object.keys(ch), ...Object.keys(cloud.localH)])) {
      // Same-device change detection: key order is stable here, so the fast hash is enough.
      const doc = ch[id] || emptyChunk(id);
      const text = storedJson(doc);
      const h = hashStr(text);
      if (cloud.localH[id] !== h) {
        if (cloud.localH[id] !== undefined) {
          cloud.editAt[id] = stamp();
          noteRecords(id, seenText[id], doc, stamp());
          moved = true;
        } else if (seenOnce) {
          /* A document new since the log was last taken as seen (a half-month's first session, or one moved into it):
             each record in it is an edit made here now, so its clash with another phone's edit of the same record is
             decided by the record's time (clashRule, laterCopiesKept), as an edit in a document already here is. */
          noteRecords(id, storedJson(emptyChunk(id)), doc, stamp());
          moved = true;
        }
        cloud.localH[id] = h;
        seenText[id] = text;
      }
    }
    if (moved) saveMeta();
  } catch (e) {
    log('sync-track', e);
  }
}
/* After adopting or merging, record the new content as seen without marking
   it as a local edit. The rule that keeps the lifter's edit times right: the tracker notes edits
   only after the taps pause, so before the sync or another tab's save changes the log, the lifter's edits are noted
   (trackEdits), and right after, the log is taken as seen (here). Between the two only what was taken in changes the
   log, so nothing the lifter did is taken as seen unnoted, and nothing taken in is noted as an edit made here. */
/** Takes the log as it is now as this device's last-seen content. */
export function resyncLocalH(): void {
  try {
    const ch = chunksOf(state);
    cloud.localH = {};
    seenText = {};
    seenOnce = true;
    for (const id in ch) {
      seenText[id] = storedJson(ch[id]);
      cloud.localH[id] = hashStr(seenText[id]);
    }
    for (const id in cloud.meta)
      if (!(id in cloud.localH)) {
        seenText[id] = storedJson(emptyChunk(id));
        cloud.localH[id] = hashStr(seenText[id]);
      }
  } catch (e) {
    log('sync-track', e);
  }
}
/* A change the app makes on its own (a fix of a log an older build saved, made once at start; its own bookkeeping) is
   sent as any change is, but is no edit: the edit time it set was the moment the app made it, which outranked a
   lifter's edit made before it on another phone wherever the two clashed, and lost that edit. The lifter's
   edits made before it are noted first, with their own times; once it is saved, the log is taken as seen, so it moves
   no document's edit time. A document it changed then differs from the copy last agreed, so the flush still sends it,
   with the edit time the document had (cloudFlush). */
/** Notes the lifter's edits made so far, with their times: before a change the app makes on its own (act's `app`). */
export function editsNoted(): void {
  trackEdits();
}
/** Takes the log as it is now as seen, no edit time moved: once a change the app made on its own is saved (act's `app`). */
export function seenAsIs(): void {
  clearTimer(trackT);
  trackT = null;
  cloud.pendAt = null;
  resyncLocalH();
}
