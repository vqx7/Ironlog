/* The screen frame: the page scrolls inside #page and the document never does (the style sheet's frame rules say
   why). Every scroll the app makes goes through here, so no module scrolls the document by mistake, and the document
   is put back wherever iOS has moved it.

   The keyboard is the frame's too. An iPhone does not shorten the page for its keyboard: it moves the whole screen
   up, and only when the field would end up under the keyboard, so for a field low on the screen (and not for one high
   on it) the bars along the bottom rose above the keyboard and the page's top slid under the status bar. While a
   keyboard is up for a field in the page, the page ends where the keyboard begins, the bars along the bottom step
   aside, and the page's own scroll shows the field above the keyboard, so iOS has nothing left to move. The
   keyboard's height is learned the first time it shows on a phone; from then on the page is fitted as the field
   takes focus, before the keyboard comes. */

import { KEY, prefGet, prefSet } from './storage';

/** How long after a field loses focus the document is looked at: iOS moves it back itself as the keyboard goes, and
    the look comes after, so it corrects only what iOS left (milliseconds). */
const SETTLE_MS = 250;
/** How far from 1 the visible area's zoom may be and still count as not zoomed: a lifter zoomed in moves the visible
    area on purpose, and it is left where it is. */
const ZOOM_SLACK = 0.01;
/** The least the visible area may fall short of the screen and count as a keyboard: a Safari tab's address bar
    changing size, or the slim bar an iPad shows with a keyboard attached, falls short by less (pixels). */
const KEYS_MIN = 120;
/** The room left between a field and the keyboard, or the page's top, when the field is brought into view (pixels). */
const KEYS_GAP = 16;
/** How long after a field takes focus the keyboard, fitted for at its learned height, has to show: a keyboard attached
    to the phone shows none on the screen, and the page and the bars are then given back (milliseconds). */
const KEYS_WAIT_MS = 900;
/** Where the keyboard's height is kept on this phone, for a number field or another, held upright or on its side:
    the number pad is shorter than the letters, and each is taller upright. */
const keysKey = (num: boolean, side: boolean): string => `${KEY}.keysH${num ? 'Num' : ''}${side ? 'Side' : ''}`;

/** The element the page scrolls in: #page, or the document's own where a page has no frame. */
export function pageEl(): HTMLElement {
  const el = document.getElementById('page');
  if (el) return el;
  const se = document.scrollingElement;
  return se instanceof HTMLElement ? se : document.documentElement;
}

/** How far the page is scrolled, in pixels. */
export function pageY(): number {
  return pageEl().scrollTop;
}

/** The furthest the page can scroll, in pixels. */
export function pageMost(): number {
  const el = pageEl();
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/** Scrolls the page to `y`, smoothly when asked. */
export function pageTo(y: number, smooth?: boolean): void {
  const el = pageEl();
  if (smooth) el.scrollTo({ top: y, behavior: 'smooth' });
  else el.scrollTop = y;
}

/** Scrolls the page by `dy`, smoothly when asked. */
export function pageBy(dy: number, smooth?: boolean): void {
  const el = pageEl();
  if (smooth) el.scrollBy({ top: dy, behavior: 'smooth' });
  else el.scrollTop += dy;
}

// A field being typed in: while one has focus the keyboard may be up, and iOS may hold the document where the field shows.
function typing(): boolean {
  const a = document.activeElement;
  if (a instanceof HTMLTextAreaElement) return true;
  if (a instanceof HTMLElement && a.isContentEditable) return true;
  return a instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'range', 'file', 'submit'].includes(a.type);
}

/** Puts the document back at its top when nothing is being typed and iOS has left it moved. */
export function frameSettle(): void {
  if (typing()) return;
  const vv = window.visualViewport;
  if (vv && Math.abs(vv.scale - 1) > ZOOM_SLACK) return;
  const moved = window.scrollY !== 0 || window.scrollX !== 0 || (!!vv && vv.offsetTop !== 0);
  if (moved) window.scrollTo(0, 0);
}

// The control in the page a keyboard or a picker is up for: a field typed in, or a select. A sheet's fields are left
// to the sheet, built so iOS has nothing to move (the style sheet's sheet rules).
function pageField(): HTMLElement | null {
  const a = document.activeElement;
  const pg = document.getElementById('page');
  if (!pg || !(a instanceof HTMLElement) || a === pg || !pg.contains(a)) return null;
  return typing() || a instanceof HTMLSelectElement ? a : null;
}

// The screen's height, which a keyboard does not change (the visible area's it does).
function screenH(): number {
  return document.documentElement.clientHeight || window.innerHeight;
}

// How much of the screen a keyboard or a picker covers now, read from the visible area; 0 when none, or zoomed in.
function keysNow(): number {
  const vv = window.visualViewport;
  if (!vv || Math.abs(vv.scale - 1) > ZOOM_SLACK) return 0;
  const h = Math.round(screenH() - vv.height);
  return h >= KEYS_MIN ? h : 0;
}

// Where the height of the keyboard for field f is kept, the phone held as it is now.
function keysAt(f: HTMLElement): string {
  const num =
    f instanceof HTMLInputElement &&
    (['numeric', 'decimal'].includes(f.inputMode) || ['number', 'tel'].includes(f.type));
  return keysKey(num, window.innerWidth > screenH());
}

// The height of the keyboard for field f as last seen on this phone, or 0 before it has shown.
function keysLearned(f: HTMLElement): number {
  const h = Number(prefGet(keysAt(f)));
  return h >= KEYS_MIN ? h : 0;
}

let keysOn = false;
// The field fitted for before its keyboard showed, and until when (performance.now()) the keyboard has to show.
let keysFor: HTMLElement | null = null;
let keysBy = 0;

// The page given its full height back, and the bars along the bottom back.
function keysOff(): void {
  if (!keysOn) return;
  keysOn = false;
  document.body.classList.remove('keys');
  const pg = document.getElementById('page');
  if (pg) pg.style.removeProperty('height');
}

/** Fits the page to the keyboard (the head of this file says why): while a keyboard is up for a field in the page,
    the page ends at the keyboard's top, the bars along the bottom step aside (the class keys on the body), and the
    field shows above the keyboard, where it showed if it fits there, with the document at its top. With no keyboard
    up the page and the bars are given back, and the document put back as frameSettle does. Run on every change that
    can bring, move or take away a keyboard. */
function frameFit(): void {
  const f = pageField();
  let kh = f ? keysNow() : 0;
  if (f && kh) {
    if (keysLearned(f) !== kh) prefSet(keysAt(f), String(kh));
    keysFor = null;
  } else if (f && f === keysFor && performance.now() < keysBy) kh = keysLearned(f);
  const pg = document.getElementById('page');
  if (!f || !kh || !pg) {
    keysOff();
    frameSettle();
    return;
  }
  const vv = window.visualViewport;
  // How far iOS has moved the screen to show the field: made the page's own scroll, so the field stays where it shows.
  const moved = window.scrollY + (vv ? vv.offsetTop : 0);
  const top = parseFloat(getComputedStyle(document.documentElement).paddingTop) || 0;
  const tall = Math.max(0, screenH() - kh - top);
  keysOn = true;
  document.body.classList.add('keys');
  pg.style.height = `${tall}px`;
  // Below the update bar when it shows: it sticks at the page's top.
  const ub = document.getElementById('updbar');
  const head = KEYS_GAP + (ub && !ub.hidden ? ub.getBoundingClientRect().height : 0);
  const fr = f.getBoundingClientRect();
  const at = fr.top - pg.getBoundingClientRect().top;
  const want = Math.max(head, Math.min(at - moved, tall - KEYS_GAP - fr.height));
  if (at !== want) pageBy(at - want);
  if (window.scrollY !== 0 || window.scrollX !== 0 || (!!vv && vv.offsetTop !== 0)) window.scrollTo(0, 0);
}

// A field in the page taking focus: with the keyboard's height known, the page is fitted at once for the keyboard
// about to show, so the screen never moves, and looked at again once the keyboard has had time to show.
function keysFocus(): void {
  const f = pageField();
  if (f && typing() && !keysNow() && keysLearned(f)) {
    keysFor = f;
    keysBy = performance.now() + KEYS_WAIT_MS;
    setTimeout(frameFit, KEYS_WAIT_MS + SETTLE_MS);
  }
  frameFit();
}

/** Starts the frame's watch: as a field takes or loses focus, and whenever the visible area changes or the document
    scrolls, the page is fitted to the keyboard, or given back and the document put back. Called once at start. */
export function frameStart(): void {
  document.addEventListener('focusin', keysFocus);
  // The bars come back as the keyboard goes, unless focus went on to the next field (the keyboard's arrows); the
  // document is looked at once iOS has moved it back itself.
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!pageField()) keysOff();
    }, 0);
    setTimeout(frameFit, SETTLE_MS);
  });
  window.addEventListener('scroll', frameFit, { passive: true });
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', frameFit);
    vv.addEventListener('scroll', frameFit);
  }
}
