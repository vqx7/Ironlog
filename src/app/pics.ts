/* ---------- pictures on notes (r66, PENDING 373) ----------
   A picture added to an exercise's note or the workout's notes lives on this
   phone only (V, 2026-11-01: "Phone only for now"): its bytes in IndexedDB,
   its id in the log (`pics` on the session and on each exercise), so a move,
   a swap, Finish and an edit from History carry it with no bookkeeping, Undo
   takes a picture off and puts it back, and a later release can sync the
   bytes by the ids already saved (373 b). A phone that does not hold a
   picture's bytes (another phone on the account, a backup restored) shows
   nothing for it.

   Every picture is decoded and drawn again as a JPEG before it is kept
   (V's security ask, PENDING 378): what is kept is pixels and nothing else,
   so a photo's location and camera data, and anything hidden in the file,
   never reach storage. SVG is refused (it can carry script), as is anything
   the browser cannot decode as an image. Nothing here sends a picture
   anywhere.

   Bytes no longer named by the log (a picture taken off, a session deleted)
   are kept PIC_KEEP_DAYS after they were last named, longer than Undo and
   Recently deleted reach, then dropped; Erase everything drops them at once. */

import { STORAGE_ID } from './config';
import { arr, isPicId, rec } from './records';
import { ENV, log } from './storage';
import { state } from './store';
import { uid, DAY_MS } from './util';

/** The longest side a kept picture is drawn at, in pixels: sharp on a phone, a few hundred kilobytes as a JPEG. */
const PIC_EDGE = 1600;
/** The JPEG quality a picture is kept at. */
const PIC_QUALITY = 0.82;
/** The largest file accepted before decoding, in bytes: a phone photo is a few megabytes; more is not a photo. */
const PIC_IN_MAX = 40 * 1024 * 1024;
/** Days a picture's bytes are kept after the log last named it: past Undo's 7 days and Recently deleted's 30. */
const PIC_KEEP_DAYS = 45;

interface PicRow {
  id: string;
  blob: Blob;
  w: number;
  h: number;
  t: number;
  seen: number;
}

const PIC_DB = ENV === 'preview' ? `${STORAGE_ID}-preview-pics` : `${STORAGE_ID}-pics`;
let dbP: Promise<IDBDatabase | null> | null = null;
const rows = new Map<string, PicRow>();
const urls = new Map<string, string>();
let ready = false;

function picDb(): Promise<IDBDatabase | null> {
  if (!dbP)
    dbP = new Promise(res => {
      try {
        const r = indexedDB.open(PIC_DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('pics', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => {
          log('pics-open', r.error);
          res(null);
        };
      } catch (e) {
        // No IndexedDB (a private window, an old browser): pictures cannot be kept, and Add picture says so.
        log('pics-open', e);
        res(null);
      }
    });
  return dbP;
}

/** Runs one request on the pictures' store and resolves when its transaction is done; false when it could not be kept. */
async function store(fn: (s: IDBObjectStore) => void): Promise<boolean> {
  const db = await picDb();
  if (!db) return false;
  return new Promise(res => {
    try {
      const tx = db.transaction('pics', 'readwrite');
      fn(tx.objectStore('pics'));
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

/** A row read back from the store, checked field by field, or null. */
function rowOf(v: unknown): PicRow | null {
  const r = rec(v);
  if (!r || !isPicId(r.id) || !(r.blob instanceof Blob)) return null;
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return { id: r.id, blob: r.blob, w: n(r.w), h: n(r.h), t: n(r.t), seen: n(r.seen) || n(r.t) };
}

/** Reads the pictures kept on this phone, once at start; the page draws them when they are in. */
export async function picsStart(): Promise<void> {
  const db = await picDb();
  if (db) {
    const list = await new Promise<unknown[]>(res => {
      try {
        // A request's result is typed any; the cast reads it as the unknown list it is.
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
    for (const v of list) {
      const r = rowOf(v);
      if (r) rows.set(r.id, r);
    }
  }
  ready = true;
  picsTidy().catch((e: unknown) => log('pics-tidy', e));
}

/** Whether this phone holds a picture's bytes. */
export const picHere = (id: string): boolean => rows.has(id);
/** Whether the pictures kept on this phone have been read. */
export const picsReady = (): boolean => ready;

/** The address the page shows a picture by, made once per picture and visit, or null when this phone does not hold it. */
export function picUrl(id: string): string | null {
  const r = rows.get(id);
  if (!r) return null;
  let u = urls.get(id);
  if (!u) {
    u = URL.createObjectURL(r.blob);
    urls.set(id, u);
  }
  return u;
}

/** The ids of a note's pictures that this phone holds, in the order they were added. */
export const picsShown = (ids: readonly string[] | undefined): string[] => (ids || []).filter(picHere);

/** Why a file cannot be a picture, in the words Add picture says, or null. */
export function picRefusal(f: Blob): string | null {
  const type = (f.type || '').toLowerCase();
  if (type === 'image/svg+xml' || !type.startsWith('image/')) return 'Only photos can be added (JPEG, PNG, HEIC or WebP).';
  if (f.size > PIC_IN_MAX) return 'That file is too large to be a photo.';
  return null;
}

/** The picture decoded: an image the canvas can draw, with its size, or null when the browser cannot read it as one. */
async function decode(f: Blob): Promise<{ img: CanvasImageSource; w: number; h: number; done: () => void } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(f);
      return { img: b, w: b.width, h: b.height, done: () => b.close() };
    } catch (e) {
      // Some browsers decode a format through an image element that createImageBitmap refuses; that is tried next.
      log('pics-decode', e);
    }
  }
  const u = URL.createObjectURL(f);
  try {
    const im = new Image();
    im.decoding = 'async';
    im.src = u;
    await im.decode();
    return { img: im, w: im.naturalWidth, h: im.naturalHeight, done: () => URL.revokeObjectURL(u) };
  } catch (e) {
    // Not an image the browser can read: refused, with the reason kept.
    log('pics-decode', e);
    URL.revokeObjectURL(u);
    return null;
  }
}

/** Keeps a photo on this phone, drawn again as a JPEG no larger than PIC_EDGE: its new id, or why it was not kept. */
export async function picAdd(f: Blob): Promise<{ id: string } | { why: string }> {
  const no = picRefusal(f);
  if (no) return { why: no };
  const d = await decode(f);
  if (!d || !(d.w > 0 && d.h > 0)) return { why: 'That file could not be read as a photo.' };
  const k = Math.min(1, PIC_EDGE / Math.max(d.w, d.h));
  const w = Math.max(1, Math.round(d.w * k)),
    h = Math.max(1, Math.round(d.h * k));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d');
  if (!cx) {
    d.done();
    return { why: 'This phone could not prepare the photo.' };
  }
  cx.drawImage(d.img, 0, 0, w, h);
  d.done();
  const blob = await new Promise<Blob | null>(res => cv.toBlob(res, 'image/jpeg', PIC_QUALITY));
  if (!blob) return { why: 'This phone could not prepare the photo.' };
  const now = Date.now();
  const row: PicRow = { id: 'p' + uid(), blob, w, h, t: now, seen: now };
  if (!(await store(s => s.put(row)))) return { why: 'The photo could not be kept on this phone (storage full or blocked).' };
  rows.set(row.id, row);
  return { id: row.id };
}

/** Every picture the log names: the sessions', a workout in progress's, and those in Recently deleted. */
function named(): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown): void => {
    for (const x of arr(v) || []) if (isPicId(x)) out.add(x);
  };
  const sess = (s: unknown): void => {
    const r = rec(s);
    if (!r) return;
    add(r.pics);
    for (const b of arr(r.ex) || []) add(rec(b)?.pics);
  };
  for (const s of state.sessions) sess(s);
  if (state.draft) sess(state.draft);
  for (const t of state.trash) if (t.kind === 'session') sess(t.data);
  return out;
}

/** Marks the pictures the log names as seen today, and drops those not named for PIC_KEEP_DAYS. */
export async function picsTidy(now = Date.now()): Promise<void> {
  if (!ready) return;
  const live = named();
  const seen: PicRow[] = [],
    gone: string[] = [];
  for (const r of rows.values()) {
    if (live.has(r.id)) {
      if (now - r.seen > DAY_MS) seen.push({ ...r, seen: now });
    } else if (now - r.seen > PIC_KEEP_DAYS * DAY_MS) gone.push(r.id);
  }
  if (!seen.length && !gone.length) return;
  const ok = await store(s => {
    for (const r of seen) s.put(r);
    for (const id of gone) s.delete(id);
  });
  if (!ok) return;
  for (const r of seen) rows.set(r.id, r);
  for (const id of gone) drop(id);
}

function drop(id: string): void {
  rows.delete(id);
  const u = urls.get(id);
  if (u) URL.revokeObjectURL(u);
  urls.delete(id);
}

/** Drops every picture on this phone (Erase everything). */
export async function picsClear(): Promise<void> {
  const ids = [...rows.keys()];
  await store(s => s.clear());
  for (const id of ids) drop(id);
}
