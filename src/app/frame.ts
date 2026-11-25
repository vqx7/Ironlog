/* The screen frame: the page scrolls inside #page and the document never does (the style sheet's frame rules say
   why). Every scroll the app makes goes through here, so no module scrolls the document by mistake, and the document
   is put back wherever iOS has moved it. */

/** How long after a field loses focus the document is looked at: iOS moves it back itself as the keyboard goes, and
    the look comes after, so it corrects only what iOS left (milliseconds). */
const SETTLE_MS = 250;
/** How far from 1 the visible area's zoom may be and still count as not zoomed: a lifter zoomed in moves the visible
    area on purpose, and it is left where it is. */
const ZOOM_SLACK = 0.01;

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

/** Starts the frame's watch: after a field or a picker loses focus, and whenever the visible area changes or the
    document scrolls, the document is put back. Called once at start. */
export function frameStart(): void {
  document.addEventListener('focusout', () => setTimeout(frameSettle, SETTLE_MS));
  window.addEventListener('scroll', frameSettle, { passive: true });
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', frameSettle);
    vv.addEventListener('scroll', frameSettle);
  }
}
