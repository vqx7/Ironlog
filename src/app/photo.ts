/* ---------- the profile photo (2.33, V 2026-11-07) ----------
   A photo of the lifter shown in the menu button at the top right, kept on
   this phone only: it is not part of the log, so it never goes into a
   backup, an export or the account, and a phone without it shows the menu
   icon as before. It is drawn again as a small square JPEG through the same
   redraw as a note's picture (pics.ts, jpegOf), so a photo's location and
   camera data never reach storage and SVG is refused. At PHOTO_EDGE pixels
   it is a few tens of kilobytes, small enough to keep beside the log in
   localStorage, and is read back only as a JPEG data address, so a value
   changed by hand in storage can never become an outside address or markup.
   Erase everything removes it (settings.ts), as it removes a note's
   pictures. */

import { jpegOf } from './pics';
import { PHOTO_KEY, log, prefDel, prefGet, prefSet } from './storage';

/** The side of the kept photo in pixels: sharp at the button's size on a phone screen. */
const PHOTO_EDGE = 256;
/** The JPEG quality the photo is kept at. */
const PHOTO_QUALITY = 0.85;
/** What a kept photo must look like: a JPEG data address and nothing else. */
const PHOTO_SHAPE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

/** The profile photo kept on this phone, as an address an image can show, or null when there is none. */
export function photoUrl(): string | null {
  const v = prefGet(PHOTO_KEY);
  return v && PHOTO_SHAPE.test(v) ? v : null;
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

/** Keeps a picked photo as the profile photo: null when kept, or why it was not, in the words the toast says. */
export async function photoSet(f: Blob): Promise<string | null> {
  const j = await jpegOf(f, PHOTO_EDGE, PHOTO_QUALITY, true);
  if ('why' in j) return j.why;
  const u = await dataUrl(j.blob);
  if (!u || !PHOTO_SHAPE.test(u)) return 'This phone could not prepare the photo.';
  if (!prefSet(PHOTO_KEY, u)) return 'The photo could not be kept on this phone (storage full or blocked).';
  return null;
}

/** Removes the profile photo from this phone. */
export function photoClear(): void {
  prefDel(PHOTO_KEY);
}
