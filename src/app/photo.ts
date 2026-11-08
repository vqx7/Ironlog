/* ---------- the profile photo (2.33; the account's since 2.34) ----------
   A photo of the lifter shown in the menu button at the top right. Since 2.34
   it belongs to the account, as a profile photo does in other apps (V,
   2026-11-08: "we should be treating it like an account"): it shows on every
   phone signed in to the account, goes from a phone that signs out (R79-1),
   and is deleted with the account, whose documents all go with it
   (SUPABASE.md, on delete cascade). With no account there is no photo. It is
   not part of the log: it is one document of its own beside the log's
   (`photo`, sync.ts), which no build before 2.34 reads (they read only the
   log's ids, chunks.ts isChunkId), and it never goes into a backup, an export
   or a problem report.
   The phone keeps a copy so the button shows it offline (PHOTO_KEY), with a
   note of where that copy stands against the account (PHOTO_SYNC): whose
   account it is, when it was last changed, and whether a change made here is
   still to be sent. Of the phone's change and the account's, the later one is
   kept (sync.ts, photoReconcile).
   It is drawn again as a small square JPEG through the same redraw as a
   note's picture (pics.ts, jpegOf), so a photo's location and camera data
   never reach storage and SVG is refused. At PHOTO_EDGE pixels it is a few
   tens of kilobytes. It is read back, from the phone or the account, only as a
   JPEG data address, so a value changed by hand can never become an outside
   address or markup. */

import { jpegOf } from './pics';
import { parseJson, rec } from './records';
import { PHOTO_KEY, PHOTO_SYNC, PHOTO_ASKED, log, prefDel, prefGet, prefSet } from './storage';
import { acct, cloud } from './store';

/** The side of the kept photo in pixels: sharp at the button's size on a phone screen. */
const PHOTO_EDGE = 256;
/** The JPEG quality the photo is kept at. */
const PHOTO_QUALITY = 0.85;
/** What a kept photo must look like: a JPEG data address and nothing else. */
const PHOTO_SHAPE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

/** Where the phone's copy of the photo stands against the account: the account's id (empty when the change was made
    before the sync knew the account), when the copy was last changed (ms, the changing phone's clock), and whether
    that change is still to be sent. */
interface PhotoNote {
  uid: string;
  et: number;
  up: boolean;
}

/** A value as a photo: the JPEG data address, or null when it is anything else. */
export function photoOf(v: unknown): string | null {
  return typeof v === 'string' && PHOTO_SHAPE.test(v) ? v : null;
}

/** The photo the phone holds, signed in or not: what the sync sends and compares. */
export function photoHeld(): string | null {
  return photoOf(prefGet(PHOTO_KEY));
}

/** The profile photo to show, as an address an image can show, or null: none without an account (V, 2026-11-08). */
export function photoUrl(): string | null {
  return acct.user ? photoHeld() : null;
}

/** Where the phone's copy stands against the account, or null when nothing was noted (no photo, or one 2.33 kept). */
export function photoNote(): PhotoNote | null {
  const t = prefGet(PHOTO_SYNC);
  if (!t) return null;
  try {
    const r = rec(parseJson(t));
    if (
      !r ||
      typeof r.uid !== 'string' ||
      typeof r.et !== 'number' ||
      !Number.isFinite(r.et) ||
      typeof r.up !== 'boolean'
    )
      return null;
    return { uid: r.uid, et: r.et, up: r.up };
  } catch (e) {
    // A note cut short or changed by hand reads as none: the account's photo is then taken as it is.
    log('photo-note', e);
    return null;
  }
}

/** Notes where the phone's copy stands against the account. */
function noteSet(n: PhotoNote): void {
  prefSet(PHOTO_SYNC, JSON.stringify(n));
}

/** A change made on this phone, to be sent: the account it belongs to and when it was made. */
function changedHere(): void {
  noteSet({ uid: cloud.uid || '', et: Date.now(), up: true });
}

/** Whether a change to the photo made here has not reached the signed-in account yet (sync.ts, hasUnsent). */
export function photoPending(): boolean {
  const n = photoNote();
  return !!n && n.up && (n.uid === '' || n.uid === cloud.uid);
}

/** A blob read as a data address, or null when the browser could not read it. */
function dataUrl(b: Blob): Promise<string | null> {
  return new Promise(res => {
    const r = new FileReader();
    r.onload = () => res(typeof r.result === 'string' ? r.result : null);
    r.onerror = () => {
      log('photo-read', r.error);
      res(null);
    };
    r.readAsDataURL(b);
  });
}

/** Keeps a picked photo as the profile photo, to be sent to the account: null when kept, or why it was not, in the words the toast says. */
export async function photoSet(f: Blob): Promise<string | null> {
  const j = await jpegOf(f, PHOTO_EDGE, PHOTO_QUALITY, true);
  if ('why' in j) return j.why;
  const u = photoOf(await dataUrl(j.blob));
  if (!u) return 'This phone could not prepare the photo.';
  if (!prefSet(PHOTO_KEY, u)) return 'The photo could not be kept on this phone (storage full or blocked).';
  changedHere();
  return null;
}

/** Removes the profile photo here, and from the account once the change is sent. */
export function photoRemove(): void {
  prefDel(PHOTO_KEY);
  changedHere();
}

/** Takes the account's photo (or its having none), changed at `et`, as the phone's copy. */
export function photoTake(url: string | null, et: number, uid: string): void {
  if (url) prefSet(PHOTO_KEY, url);
  else prefDel(PHOTO_KEY);
  noteSet({ uid, et, up: false });
}

/** Notes that the phone's copy, changed at `et`, is now the account's. */
export function photoSent(et: number, uid: string): void {
  const n = photoNote();
  // A change made while this one was on its way is newer, and is still to be sent.
  if (n && n.et !== et) return;
  noteSet({ uid, et, up: false });
}

/** Signing out: the photo goes from the phone (R79-1), unless it holds a change the account has not taken and the
    lifter chose to keep this phone's copy (the review of 2.34, F2). That change stays, with its note of the account,
    and is sent when that account signs in here again; another account signed in here takes its own instead
    (photoReconcile). Signed out, the menu shows no photo (photoUrl), and Today's line is offered again either way. */
export function photoSignOut(keepUnsent: boolean): void {
  if (keepUnsent) prefDel(PHOTO_ASKED);
  else photoForget();
}

/** Takes the photo off this phone, with its line on Today answered, as signing out and deleting the account do
    (R79-1): the account keeps its photo, and the next account signed in here shows its own or is offered the line. */
export function photoForget(): void {
  prefDel(PHOTO_KEY);
  prefDel(PHOTO_SYNC);
  prefDel(PHOTO_ASKED);
}
