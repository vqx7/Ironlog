/* ---------- pictures on notes ----------
   A picture added to an exercise's note or the workout's notes lives on this
   phone only (V, 2026-11-01: "Phone only for now"): its bytes in IndexedDB,
   its id in the log (`pics` on the session and on each exercise), so a move,
   a swap, Finish and an edit from History carry it with no bookkeeping, Undo
   takes a picture off and puts it back, and a later release can sync the
   bytes by the ids already saved. A phone that does not hold a
   picture's bytes (another phone on the account, a backup restored) shows
   nothing for it.

   Every picture is decoded and drawn again as a JPEG before it is kept
   (V's security ask): what is kept is pixels and nothing else,
   so a photo's location and camera data, and anything hidden in the file,
   never reach storage. SVG is refused (it can carry script), as is anything
   the browser cannot decode as an image. Nothing here sends a picture
   anywhere.

   Bytes no longer named by the log (a picture taken off, a session deleted)
   are kept PIC_KEEP_DAYS after they were last named, longer than Undo and
   Recently deleted reach, then dropped; Erase everything drops them at once.
   Each picture belongs to the log it was last named by: the account's log
   (cloud.acct) or the phone's own (''). Only that log can let it go, so a
   picture whose log has gone to the account at a sign-out, or been kept
   aside for another account, stays until that log is back on the phone
   (the review of r66: fifty days after a sign-out the picture was gone). */

import { arr, isPicId, rec } from './records';
import { log, picRowsRead, picRowsWrite } from './storage';
import { cloud, state } from './store';
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
  /** The log it belongs to: the account's id, or '' for the phone's own. */
  own: string;
  /** Its bytes, when it is kept as bytes because this browser's store refused the picture itself. */
  bytes?: ArrayBuffer;
}

/* A browser whose IndexedDB refuses a Blob keeps the picture's bytes
   instead, with its type (GitHub's WebKit run of r66, whose pages open in
   private contexts, could add no picture). Once a Blob is refused, the rest
   of the visit keeps bytes, so the refusal is logged once. A Blob is kept
   wherever the browser takes one: the browser then holds it on disk, not in
   the page's memory. */
let asBytes = false;
/** A row as it is written to the store: the picture itself, or its bytes and type where the store refused it. */
function storedForm(r: PicRow): object {
  const { blob, bytes, ...rest } = r;
  return bytes ? { ...rest, bytes, type: blob.type || 'image/jpeg' } : { ...rest, blob };
}

/** The log on the phone now: the account it belongs to, or '' when it is the phone's own. */
const owner = (): string => cloud.acct || '';

const rows = new Map<string, PicRow>();
const urls = new Map<string, string>();
let ready = false;

/** A row read back from the store, checked field by field, or null. */
function rowOf(v: unknown): PicRow | null {
  const r = rec(v);
  if (!r || typeof r.id !== 'string' || !isPicId(r.id)) return null;
  const bytes = r.bytes instanceof ArrayBuffer ? r.bytes : undefined;
  const blob =
    r.blob instanceof Blob
      ? r.blob
      : bytes
        ? new Blob([bytes], { type: typeof r.type === 'string' && r.type ? r.type : 'image/jpeg' })
        : null;
  if (!blob) return null;
  const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
  return {
    id: r.id,
    blob,
    ...(bytes ? { bytes } : {}),
    w: n(r.w),
    h: n(r.h),
    t: n(r.t),
    seen: n(r.seen) || n(r.t),
    own: typeof r.own === 'string' ? r.own : ''
  };
}

/** Reads the pictures kept on this phone, once at start; the page draws them when they are in. */
export async function picsStart(): Promise<void> {
  for (const v of await picRowsRead()) {
    const r = rowOf(v);
    if (r) rows.set(r.id, r);
  }
  ready = true;
  picsTidy().catch((e: unknown) => {
    log('pics-tidy', e);
  });
}

/* Another tab of the app on this phone adds pictures to the same store, and
   this tab read it at start: so it is read again before a note's room is
   counted for a picture added here, and when the other tab's change arrives
   or the page comes back to the front (events.ts). Only pictures found are
   added: one dropped by the other tab stays drawn here until a reload, and a
   read that began before this tab's own write cannot drop that write. */
/** Reads the pictures kept on this phone again, adding any another tab kept: true when one was found. */
export async function picsRefresh(): Promise<boolean> {
  if (!ready) return false;
  let found = false;
  for (const v of await picRowsRead()) {
    const r = rowOf(v);
    if (r && !rows.has(r.id)) {
      rows.set(r.id, r);
      found = true;
    }
  }
  return found;
}

/** Whether this phone holds a picture's bytes. */
const picHere = (id: string): boolean => rows.has(id);

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
function picRefusal(f: Blob): string | null {
  const type = (f.type || '').toLowerCase();
  if (type === 'image/svg+xml' || !type.startsWith('image/'))
    return 'Only photos can be added (JPEG, PNG, HEIC or WebP).';
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

/* Every photo the app keeps, a note's picture or the profile photo,
   goes through this one redraw, so the refusals and the stripping of a
   photo's hidden data are the same for both. `square` crops the middle of
   the photo to a square first, as a profile photo is shown in a circle. */
/** A photo decoded and drawn again as a JPEG whose longest side is at most `edge`, or why it could not be. */
export async function jpegOf(
  f: Blob,
  edge: number,
  quality: number,
  square = false
): Promise<{ blob: Blob; w: number; h: number } | { why: string }> {
  const no = picRefusal(f);
  if (no) return { why: no };
  const d = await decode(f);
  if (!d || !(d.w > 0 && d.h > 0)) return { why: 'That file could not be read as a photo.' };
  const side = Math.min(d.w, d.h);
  const sw = square ? side : d.w,
    sh = square ? side : d.h;
  const k = Math.min(1, edge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * k)),
    h = Math.max(1, Math.round(sh * k));
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const cx = cv.getContext('2d');
  if (!cx) {
    d.done();
    return { why: 'This phone could not prepare the photo.' };
  }
  cx.drawImage(d.img, (d.w - sw) / 2, (d.h - sh) / 2, sw, sh, 0, 0, w, h);
  d.done();
  const blob = await new Promise<Blob | null>(res => cv.toBlob(res, 'image/jpeg', quality));
  if (!blob) return { why: 'This phone could not prepare the photo.' };
  return { blob, w, h };
}

/** Keeps a photo on this phone, drawn again as a JPEG no larger than PIC_EDGE: its new id, or why it was not kept. */
export async function picAdd(f: Blob): Promise<{ id: string } | { why: string }> {
  const j = await jpegOf(f, PIC_EDGE, PIC_QUALITY);
  if ('why' in j) return j;
  const { blob, w, h } = j;
  const now = Date.now();
  const row: PicRow = { id: 'p' + uid(), blob, w, h, t: now, seen: now, own: owner() };
  if (asBytes) row.bytes = await blob.arrayBuffer();
  let kept = await picRowsWrite([storedForm(row)], []);
  if (!kept && !asBytes) {
    asBytes = true;
    row.bytes = await blob.arrayBuffer();
    kept = await picRowsWrite([storedForm(row)], []);
  }
  if (!kept) return { why: 'The photo could not be kept on this phone (storage full or blocked).' };
  rows.set(row.id, row);
  await picsRefresh();
  return { id: row.id };
}

/** Every picture the log names: the sessions', a workout in progress's, and those in Recently deleted. */
function named(): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown): void => {
    for (const x of arr(v) || []) if (typeof x === 'string' && isPicId(x)) out.add(x);
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

/** Marks the pictures the log names as seen and its own, and drops its own it has not named for PIC_KEEP_DAYS (at start; the suites call it by the hook). */
export async function picsTidy(now = Date.now()): Promise<void> {
  if (!ready) return;
  const live = named();
  const me = owner();
  const seen: PicRow[] = [],
    gone: string[] = [];
  for (const r of rows.values()) {
    if (live.has(r.id)) {
      if (now - r.seen > DAY_MS || r.own !== me) seen.push({ ...r, seen: now, own: me });
    } else if (r.own === me && now - r.seen > PIC_KEEP_DAYS * DAY_MS) gone.push(r.id);
  }
  if (!seen.length && !gone.length) return;
  if (!(await picRowsWrite(seen.map(storedForm), gone))) return;
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
  await picRowsWrite([], [], true);
  for (const id of ids) drop(id);
}
