/* The log as the account's rows hold it, record by record: which list of the log each kind of row is, a record's copy
   as the text its row holds, and where the documents keep its time. Reading a long log is spread over turns of the
   page's event loop, and each document's records are kept under its fingerprint, so a tap is never held. */

import { hashStr } from './util';
import { arr, rec } from './records';
import type { Rec } from './records';
import { chunksOf, CORE_FIELDS } from './chunks';
import { canon, recordKey, storedJson } from './merge';
import { cloud, state } from './store';
import { photoHeld, photoNote, photoPending } from './photo';
import { B36, KIND, MIRRORED, ansText, keyOf, sumOf } from './rowsnotes';
import type { Notes } from './rowsnotes';

/** The kinds Recently deleted holds. */
export const TRASHED: ReadonlySet<string> = new Set(['session', 'cardio', 'routine']);

/** A record as the log holds it: its row's kind and id, where its time is kept (its document and its key there), the first characters of its copy's checksum, and where it is: in the log, or in Recently deleted with the day shown and whether it is a copy put aside. The profile photo, which is in no document, carries its copy and its time itself. */
export interface Mine {
  kind: string;
  id: string;
  doc: string;
  rk: string;
  s: string;
  place: 'log' | 'trash';
  day?: string;
  clash?: boolean;
  photo?: boolean;
  at?: number;
}

/* ---------- the log, record by record ---------- */

/** A document's records as last read, with the fingerprint of the document the account held then (the document sync's note): read again only when that changed. A pass compares only while the log's documents are the account's (pass), so the fingerprint names the log's own document. */
const docSeen = new Map<string, { h: string | undefined; recs: Mine[] }>();
/** A record's copy as the text its row holds: one text for one record whatever order its fields came in, so two phones holding the same record send the same bytes. */
export const bodyOf = (x: unknown): string => canon(x);

/** One document's records, as rows. */
export function recsOf(doc: string, D: Rec): Mine[] {
  const out: Mine[] = [];
  const live = new Set<string>();
  for (const list in KIND) {
    const kind = KIND[list];
    if (!kind) continue;
    for (const x of arr(D[list]) || []) {
      const R = rec(x);
      if (!R || typeof R['id'] !== 'string') continue;
      live.add(keyOf(kind, R['id']));
      out.push({ kind, id: R['id'], doc, rk: recordKey(list, R['id']), s: sumOf(bodyOf(R)), place: 'log' });
    }
  }
  if (doc !== 'core') return out;
  for (const x of arr(D['trash']) || []) {
    const R = rec(x);
    const kind = R ? ansText(R['kind']) : '';
    const data = R ? rec(R['data']) : null;
    // An entry for a record the log holds too is that record's own, read as in the log.
    if (!R || !data || typeof R['id'] !== 'string' || !TRASHED.has(kind) || live.has(keyOf(kind, R['id']))) continue;
    out.push({
      kind,
      id: R['id'],
      doc,
      rk: recordKey('trash', R['id']),
      s: sumOf(bodyOf(data)),
      place: 'trash',
      day: ansText(R['date']),
      clash: R['clash'] === true
    });
  }
  for (const k of CORE_FIELDS)
    if (k !== 'version')
      out.push({ kind: 'core', id: k, doc, rk: recordKey('', k), s: sumOf(bodyOf(D[k] ?? null)), place: 'log' });
  const set = rec(D['settings']) || {};
  for (const k in set)
    out.push({ kind: 'setting', id: k, doc, rk: recordKey('settings', k), s: sumOf(bodyOf(set[k])), place: 'log' });
  return out;
}
/** A turn of the page's event loop, between two stretches of work, so that reading a long log never holds a tap. */
export const pause = (): Promise<void> =>
  new Promise(r => {
    setTimeout(r, 0);
  });
/** Reads the documents not yet read at their fingerprint, one a turn of the event loop: a visit's first pass reads
    the whole log (each record's text and its checksum), which in one stretch would be felt on a phone. A document is
    read only while its text is the one the account holds (its fingerprint is the sync note's), so what is kept under
    a fingerprint is that document's records and no later edit's. */
export async function warm(): Promise<void> {
  const ch = chunksOf(state);
  for (const id in ch) {
    if (id === 'draft') continue;
    const h = cloud.meta[id]?.h;
    if (!h || docSeen.get(id)?.h === h) continue;
    // Read from the log as it is in this turn: an edit made during an earlier turn is in it, and then the fingerprint differs.
    const doc = chunksOf(state)[id];
    if (!doc || hashStr(storedJson(doc)) !== h) continue;
    docSeen.set(id, { h, recs: recsOf(id, doc) });
    await pause();
  }
}
/** Every record of the log (its documents `ch`) as a row, by key. Called only while each document is the one the account holds (pass), so a document read at its sync note's fingerprint is not read again. */
function mineNow(ch: Record<string, Rec>): Map<string, Mine> {
  const out = new Map<string, Mine>();
  for (const id of [...docSeen.keys()]) if (!(id in ch)) docSeen.delete(id);
  for (const id in ch) {
    if (id === 'draft') continue;
    const h = cloud.meta[id]?.h;
    let seen = docSeen.get(id);
    if (!seen || !h || seen.h !== h) {
      seen = { h, recs: recsOf(id, ch[id] || {}) };
      docSeen.set(id, seen);
    }
    for (const m of seen.recs) out.set(keyOf(m.kind, m.id), m);
  }
  return out;
}
/** The copy of record `m` as it is in the log's documents `ch` now; null when the log no longer holds it there. */
export function copyOf(ch: Record<string, Rec>, m: Mine): string | null {
  if (m.photo) return JSON.stringify(photoHeld());
  const D = ch[m.doc];
  if (!D) return null;
  if (m.kind === 'core') return bodyOf(D[m.id] ?? null);
  if (m.kind === 'setting') {
    const set = rec(D['settings']) || {};
    return m.id in set ? bodyOf(set[m.id]) : null;
  }
  if (m.place === 'trash') {
    for (const x of arr(D['trash']) || []) {
      const R = rec(x);
      if (R && R['id'] === m.id && R['kind'] === m.kind && rec(R['data'])) return bodyOf(R['data']);
    }
    return null;
  }
  const list = Object.keys(KIND).find(k => KIND[k] === m.kind);
  for (const x of (list && arr(D[list])) || []) {
    const R = rec(x);
    if (R && R['id'] === m.id) return bodyOf(R);
  }
  return null;
}
/** The time the documents hold for record `m`, 0 when they know none. */
export function timeOf(m: Mine): number {
  if (m.at !== undefined) return m.at;
  const t = cloud.recAt[m.doc]?.[m.rk];
  return t !== undefined && t > 0 ? t : 0;
}
/** The keys of the records the lifter's log holds, in its lists or in Recently deleted: read before and after the document sync takes a copy in, to count what that took away (rowsRemoved). */
export function rowsLogKeys(): Set<string> {
  const out = new Set<string>();
  const S: Rec = state;
  for (const list of ['sessions', 'cardio', 'bodyweights', 'measurements', 'routines']) {
    const kind = KIND[list];
    for (const x of arr(S[list]) || []) {
      const R = rec(x);
      if (kind && R && typeof R['id'] === 'string') out.add(keyOf(kind, R['id']));
    }
  }
  for (const t of state.trash) out.add(keyOf(t.kind, t.id));
  return out;
}
/** The profile photo as a record, when the phone holds no change to it still to send. Its checksum is kept in the notes with the photo's own edit time and length, and its text made and its checksum worked out again only when one of them moved: the photo is the one long copy. */
function photoMine(N: Notes): Mine | null {
  if (photoPending()) return null;
  const n = photoNote();
  const held = photoHeld();
  const at = n ? n.et : 0,
    len = held === null ? -1 : held.length;
  if (!N.ph || N.ph.at !== at || N.ph.len !== len) N.ph = { at, len, s: sumOf(JSON.stringify(held)) };
  return { kind: 'photo', id: 'photo', doc: 'photo', rk: '', s: N.ph.s, place: 'log', photo: true, at };
}
/** The log as rows now: its documents, each record of them by key, and whether the profile photo is among them. */
export function logNow(N: Notes): { ch: Record<string, Rec>; mine: Map<string, Mine>; photo: boolean } {
  const ch = chunksOf(state);
  const mine = mineNow(ch);
  const photo = photoMine(N);
  // A phone with no photo, on an account with no photo row, has nothing to say of it.
  if (photo && (photoHeld() !== null || N.rows['photo/photo'])) mine.set('photo/photo', photo);
  return { ch, mine, photo: !!photo };
}
/** The keys to compare: every record of the log, and every row of a kind this build mirrors. */
export function keysOf(N: Notes, L: { mine: Map<string, Mine>; photo: boolean }): Set<string> {
  const keys = new Set<string>(L.mine.keys());
  for (const k in N.rows)
    if (MIRRORED.has(k.slice(0, k.indexOf('/'))) && (L.photo || k !== 'photo/photo') && k !== 'core/order') keys.add(k);
  return keys;
}

/** A record of the log as one line: where it is, its checksum, its time and its day. */
export const mineText = (m: Mine | undefined): string =>
  m
    ? `${m.place} ${m.s} ${timeOf(m).toString(B36)}${m.place === 'trash' ? ' ' + (m.day || '') : ''}`
    : 'not in the log';
/** Forgets the documents' records as last read: wherever the notes are forgotten (rowsOnForget). */
export function logForget(): void {
  docSeen.clear();
}
