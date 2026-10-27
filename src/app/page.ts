/* The page (r63, from the legacy script's 18-ui.js and 24-sheets.js): the
   screen drawn into #view, the sheet over it in #modal, Back through both,
   the menu button's save state, and the theme. The screens and the sheets
   import what they need from here; this module imports no screen and no
   sheet, since they import it (a circle, which the bundle would turn into a
   value read as undefined). The module that starts the app hands it the two
   tables that do: the draw of the tabs (setRoot) and every sheet by its kind
   (setSheets). */

import { html, render as draw } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { APP_VERSION, STORAGE_ID, VERSION_LINE } from './config';
import { ACCENT0 } from './layout';
import { DIRTY_SAID } from './format';
import { numIn } from './util';
import { MENU_ICON } from './icons';
import { log, saveStateNow } from './storage';
import { acct, state, ui } from './store';
import type { Modal, ModalKind, ModalOf } from './modals';
import { coarse } from './env';
import { sheetClear, sheetDraw } from './sheets';
import { drawScreen, drawnBeforeToday, markup } from './view';
import { stopTimer, wakeOff } from './timer';
import { toast } from './toast';
import { tipLabels } from './tips';

/* ---------- the tabs ---------- */

let root: () => void = () => {
  // Nothing draws before the app's start hands over its tabs.
};
/** Gives the page the draw of the current tab (the start's, which knows every screen), once, at start. */
export function setRoot(draw: () => void): void {
  root = draw;
}

/* A code bug inside a view used to leave a blank screen. Now the error is
   logged and a recovery screen offers your data and a way back. */
function renderCrash(e: unknown): void {
  let txt = '';
  try {
    txt = JSON.stringify({ app: STORAGE_ID, version: APP_VERSION, exported: new Date().toISOString(), state });
  } catch (e2) {
    // A log that cannot be written out (a cycle) is said in its place, so the screen still shows.
    txt = '(could not serialise data: ' + (e2 instanceof Error ? e2.message : String(e2)) + ')';
  }
  const v = document.getElementById('view');
  if (!v) return;
  const said = (e && typeof e === 'object' && 'message' in e && e.message) || String(e);
  drawScreen(
    v,
    html`<div class="card"><h2>Something broke on this screen</h2><p class="small">Your data is saved and was not changed. Tap Try again to go back to Today. Report this sends the error to the app owner. If it keeps happening, copy the backup text below and keep it somewhere safe.</p>
  <p class="small muted">Error: ${String(said)} · version ${VERSION_LINE}</p>
  <div class="row"><button class="btn primary" data-act="crashRetry">Try again</button><button class="btn" data-act="fbOpen" data-cat="bug" data-crash="1">Report this</button></div>
  <label class="field" style="margin-top:10px">Backup text<textarea readonly style="min-height:160px;font-size:12px">${txt}</textarea></label></div>`
  );
}

/** Draws the page: the current tab, and the open sheet over it. */
export function render(): void {
  // No session, no rest timer or screen kept on: a session erased, restored over or finished on another phone left both running (r55, the audit).
  if (!state.draft) {
    const t = document.getElementById('timer');
    if (t && !t.hidden) stopTimer();
    wakeOff();
  }
  try {
    root();
  } catch (e) {
    log('render', e);
    renderCrash(e);
  }
  navSync();
}

/* Re-rendering used to replace #view wholesale, which blew away whatever the
   user was typing in. A selector for the focused control is made first, then
   focus and the caret are put back where they were. */
/** A selector for an element: its id, or its tag with its data- attributes; null when it has neither. */
function focusKey(el: Element | null): string | null {
  if (!el || !el.tagName || el === document.body) return null;
  if (el.id) return '#' + el.id.replace(/([^\w-])/g, '\\$1');
  const at: string[] = [];
  for (const a of Array.from(el.attributes))
    if (a.name.indexOf('data-') === 0) at.push(`[${a.name}="${String(a.value).replace(/(["\\])/g, '\\$1')}"]`);
  return at.length ? el.tagName.toLowerCase() + at.join('') : null;
}
/** Draws the page again keeping the scroll, the focused field, its caret, and the text typed in it. */
export function rerenderKeepScroll(): void {
  const y = window.scrollY,
    el = document.activeElement,
    key = focusKey(el);
  // The text as typed: "152." is 152 stored, and redrawn from the log it lost its point (r55, the audit).
  const txt = el instanceof HTMLInputElement && el.type === 'text' ? el.value : null;
  const sel = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null;
  const ss = sel && typeof sel.selectionStart === 'number' ? sel.selectionStart : null;
  const se = sel && typeof sel.selectionEnd === 'number' ? sel.selectionEnd : null;
  render();
  window.scrollTo(0, y);
  if (!key) return;
  let next: Element | null = null;
  try {
    next = document.querySelector(key);
  } catch (e) {
    // A selector from a stale element finds nothing.
  }
  if (!(next instanceof HTMLElement)) return;
  try {
    next.focus({ preventScroll: true });
    if (txt != null && next instanceof HTMLInputElement && next.value !== txt && numIn(next.value) === numIn(txt))
      next.value = txt;
    if (ss != null && (next instanceof HTMLInputElement || next instanceof HTMLTextAreaElement))
      next.setSelectionRange(ss, se);
  } catch (e) {
    // Putting the caret back is best effort.
  }
  window.scrollTo(0, y);
}

/** The page's colours: the theme, the accent, and the installed app's status bar, which follows the theme. */
export function applyTheme(): void {
  const t = state.settings.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  document.documentElement.dataset.accent = state.settings.accent || ACCENT0;
  const m = document.querySelector('meta[name="theme-color"]');
  if (m)
    try {
      m.setAttribute('content', getComputedStyle(document.body).backgroundColor || '#08090b');
    } catch (e) {
      // The status bar's colour is cosmetic.
    }
}

/* ---------- Back ---------- */

/** The history entry the page is on, as the page wrote it (the browser types it any). */
// cast: history.state is any in the browser's types; it is read as unknown and checked where it is used.
const histState = (): unknown => history.state as unknown;

/* The phone's Back gesture used to leave the app with a sheet open. Opening a
   sheet adds one history entry, and Back closes the sheet instead. Closing
   a sheet with its own buttons leaves that entry in place and the next sheet
   reuses it, rather than calling history.back(), whose delayed event could
   land on a sheet opened a moment later. */
function modalPush(): void {
  try {
    const st = histState();
    if (!(st && typeof st === 'object' && 'ilModal' in st && st.ilModal))
      history.pushState({ ilModal: 1, ilTab: ui.tab }, '');
  } catch (e) {
    // History is best effort in a frame.
  }
}
/* Back also steps back through tabs, like a native app: each tab change adds
   one history entry holding the tab, and Back shows the tab of the entry it
   lands on. From the first tab you opened, Back leaves the app as before.
   A sheet's entry left behind by closing it with its own buttons is replaced
   by the next tab change instead of stacking up, so Back never needs an
   extra press to get past it. Tabs changed from inside the app (a tile that
   opens Stats) count the same as the tab bar. */
const TABS_OK: ReadonlySet<string> = new Set(['today', 'program', 'dash', 'history', 'settings']);
let navTab: string | null = null,
  navFromPop = false;
function navSync(): void {
  if (navTab === ui.tab) return;
  const first = navTab === null;
  if (!first) ui.prevTab = navTab;
  navTab = ui.tab;
  if (navFromPop) {
    navFromPop = false;
    return;
  }
  try {
    const st = histState();
    const onSheet = !!(st && typeof st === 'object' && 'ilModal' in st && st.ilModal);
    if (first || (!ui.modal && onSheet)) history.replaceState({ ilTab: ui.tab }, '');
    else history.pushState({ ilTab: ui.tab }, '');
  } catch (e) {
    // History is best effort in a frame.
  }
}
/** Back: closes the open sheet (one with something typed in it stays, as a tap outside it does, r55), or shows the tab of the entry it lands on. */
export function pageBack(): void {
  if (ui.modal) {
    if (ui.modal.dirty) {
      modalPush();
      toast(DIRTY_SAID);
      return;
    }
    closeModal();
    return;
  }
  const st = histState();
  const t = st && typeof st === 'object' && 'ilTab' in st && typeof st.ilTab === 'string' ? st.ilTab : null;
  if (t && t !== ui.tab && TABS_OK.has(t)) {
    navFromPop = true;
    ui.tab = t;
    if (t === 'program') ui.planView = 'routine';
    window.scrollTo(0, 0);
    render();
  }
}

/* ---------- the sheets ---------- */

/** One kind of sheet: its draw (null when what it shows is gone, which closes it) and what closing it does beyond hiding it. */
interface SheetKind<K extends ModalKind> {
  draw(m: ModalOf<K>): TemplateResult | null;
  closed?: ((m: ModalOf<K>) => void) | undefined;
}
/** Every kind of sheet. */
export type Sheets = { [K in ModalKind]: SheetKind<K> };

let sheets: Sheets | null = null;
let afterSheet: (el: HTMLElement) => void = () => {
  // Nothing to mount until the start hands one over.
};
/** Gives the page every sheet by its kind, and what to mount in a sheet once it is drawn (the 3D body), once, at start. */
export function setSheets(t: Sheets, after: (el: HTMLElement) => void): void {
  sheets = t;
  afterSheet = after;
}
/* Each kind's own entry, read for the kind the sheet has: the table holds one
   per kind, so the entry read for a sheet's kind is the one for its type. */
function kindOf<K extends ModalKind>(t: Sheets, m: ModalOf<K>): SheetKind<K> {
  const k: K = m.kind;
  return t[k];
}

/* Focus used to stay behind the overlay, so keyboard and screen-reader users
   could tab through the page underneath a supposedly modal sheet. */
let modalReturn: Element | null = null;
/** The open sheet's controls a Tab can reach, in order. */
export function modalFocusables(): HTMLElement[] {
  const el = document.getElementById('modal');
  if (!el || el.hidden) return [];
  return Array.from(
    el.querySelectorAll<HTMLElement>('button,input,select,textarea,[href],[tabindex]:not([tabindex="-1"])')
  ).filter(e => !('disabled' in e && e.disabled) && e.getAttribute('aria-hidden') !== 'true');
}

let lastDrawn: Modal | null = null;
function renderModalBody(keep: boolean): void {
  const m = ui.modal;
  const el = document.getElementById('modal');
  if (!el) return;
  if (!m) {
    el.hidden = true;
    return;
  }
  // No sheet can open before the start gives the table (main.ts gives it first).
  const h = sheets ? kindOf(sheets, m).draw(m) : null;
  if (h === null) {
    ui.modal = null;
    el.hidden = true;
    return;
  }
  // Every sheet is its template, kept in place when the open sheet is drawn again, so the field in use stays under the keyboard (r54, sheets.ts).
  sheetDraw(el, h, keep);
  const sh = el.querySelector('.sheet');
  if (sh) {
    if (!sh.hasAttribute('tabindex')) sh.setAttribute('tabindex', '-1');
    const hd = sh.querySelector('h3');
    if (hd && !sh.hasAttribute('aria-label')) sh.setAttribute('aria-label', hd.textContent || 'Dialog');
  }
}
/* Re-rendering a sheet used to rebuild it from the top: a tap on a muscle chip
   halfway down the exercise editor threw the sheet back to its first line and
   dropped the cursor. When the same sheet is redrawn, its scroll positions and
   the focused field (with the caret) are put back. */
/** Draws the open sheet, or hides the sheet layer when none is open. */
export function renderModal(): void {
  const el = document.getElementById('modal');
  if (!el) return;
  const m = ui.modal;
  const same = !!m && lastDrawn === m && !el.hidden;
  const old = same ? el.querySelector('.sheet') : null,
    oldIn = same ? el.querySelector('.sheet-scroll') : null;
  const st = old ? old.scrollTop : 0,
    ist = oldIn ? oldIn.scrollTop : 0;
  const ae = document.activeElement;
  const fk = same && ae && el.contains(ae) ? focusKey(ae) : null;
  const sel = fk && (ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement) ? ae : null;
  const ss = sel && typeof sel.selectionStart === 'number' ? sel.selectionStart : null,
    se = sel && typeof sel.selectionEnd === 'number' ? sel.selectionEnd : null;
  renderModalBody(same);
  // The labels' i buttons now, not when the page's watcher adds them after this task: they change the sheet's height, so a scroll put back before them slipped (r54; at the bottom, 4 px).
  tipLabels(el);
  if (el.hidden || !ui.modal) {
    document.body.classList.remove('modal-open');
    lastDrawn = null;
    return;
  }
  afterSheet(el);
  document.body.classList.add('modal-open');
  lastDrawn = ui.modal;
  if (!same) return;
  const sh = el.querySelector('.sheet'),
    inn = el.querySelector('.sheet-scroll');
  if (sh) sh.scrollTop = st;
  if (inn) inn.scrollTop = ist;
  if (fk) {
    let n: Element | null = null;
    try {
      n = el.querySelector(fk);
    } catch (e) {
      // A selector from a stale element finds nothing.
    }
    if (n instanceof HTMLElement)
      try {
        n.focus({ preventScroll: true });
        if (ss != null && (n instanceof HTMLInputElement || n instanceof HTMLTextAreaElement))
          n.setSelectionRange(ss, se);
      } catch (e) {
        // Putting the caret back is best effort.
      }
  }
}

/** Opens a sheet (over the one open, which it replaces). */
export function openModal(m: Modal): void {
  const fresh = !ui.modal;
  if (fresh) {
    modalReturn = document.activeElement;
    modalPush();
  }
  const was = ui.modal;
  ui.modal = m;
  // A question replaced unanswered (r56.1) reads as Cancel, as closeModal reads it: the sync waiting on it must not wait forever.
  if (was && was.kind === 'confirm' && was.onClose && !was.answered) was.onClose();
  renderModal();
  const el = document.getElementById('modal');
  if (!el) return;
  // A new name field (creating an exercise) is always focused, since typing
  // is the first thing to do there, even when it replaces another sheet.
  const nm = m.kind === 'exEdit' && m.isNew && !m.e.name ? el.querySelector('[data-ebind="name"]') : null;
  if (nm instanceof HTMLElement) {
    try {
      nm.focus({ preventScroll: true });
    } catch (e) {
      // Focus is best effort.
    }
    return;
  }
  if (!fresh) return;
  /* On a phone, focusing a search box the moment a picker opens throws up the
     keyboard over the list you came to scroll. Touch screens get the sheet
     focused instead; a tap on the search box brings the keyboard when wanted.
     A text field is preferred otherwise; never the confirm button of a
     destructive question, or a stray Enter would carry out the deletion. */
  const noKb = (m.kind === 'picker' || m.kind === 'past') && coarse();
  const target = (!noKb && el.querySelector('input,select,textarea')) || el.querySelector('.sheet');
  if (target instanceof HTMLElement)
    try {
      target.focus({ preventScroll: true });
    } catch (e) {
      // Focus is best effort.
    }
}

/** Closes the open sheet: what its kind does on closing, then the page drawn again if the day changed meanwhile, and the focus back where it was. */
export function closeModal(): void {
  const was = ui.modal;
  ui.modal = null;
  if (was && was.kind === 'confirm' && was.onClose && !was.answered) was.onClose();
  const el = document.getElementById('modal');
  if (el) {
    el.hidden = true;
    sheetClear(el);
  }
  document.body.classList.remove('modal-open');
  lastDrawn = null;
  if (was && sheets) {
    const k = kindOf(sheets, was);
    if (k.closed) k.closed(was);
  }
  // A sheet open since yesterday leaves today's screen when it closes (drawnBeforeToday, r59).
  if (drawnBeforeToday()) rerenderKeepScroll();
  const r = modalReturn;
  modalReturn = null;
  if (r instanceof HTMLElement && document.contains(r))
    try {
      r.focus({ preventScroll: true });
    } catch (e) {
      // Focus is best effort.
    }
}

/* alt is an optional second action, {label, fn}. Some choices are genuinely
   three-way ("keep them", "drop them", "go back") and collapsing that into
   OK/Cancel is how data gets thrown away by accident. onClose (r56.1): the
   sheet closed without an answer, so a question the sync asked can read it
   as Cancel. */
/** Asks before an action: the title, the question, the button's words, what it does, whether it deletes, a second answer, and what closing without an answer does. */
export function confirmBox(
  title: string,
  body: string,
  okLabel: string,
  fn: () => void,
  danger?: boolean | null,
  alt?: { label: string; fn: () => void; only?: boolean | undefined; quiet?: boolean | undefined } | null,
  onClose?: () => void
): void {
  openModal({ kind: 'confirm', title, body, okLabel, fn, danger: !!danger || undefined, alt, onClose });
}
/** Asks a question with two answers and Cancel: 'ok', 'alt', or 'cancel' when the sheet is closed without one. */
export function ask(title: string, body: string, ok: string, alt: string): Promise<'ok' | 'alt' | 'cancel'> {
  return new Promise(res =>
    confirmBox(
      title,
      body,
      ok,
      () => res('ok'),
      false,
      { label: alt, fn: () => res('alt') },
      () => res('cancel')
    )
  );
}

/* ---------- the menu button ---------- */

let saveShown = '';
/* The menu button's dot and words (r27; the reading is saveStateNow, in
   storage.ts): drawn in place on every save and sync change. */
/** Draws the menu button's save state; an open menu follows it, redrawn only when it changed, so a tap is never lost to a redraw. */
export function setSaveState(): void {
  const el = document.getElementById('saveState');
  if (!el) return;
  const { cls, txt } = saveStateNow();
  el.className = 'ssb' + (cls ? ' ' + cls : '');
  draw(html`${markup(MENU_ICON)}<span class="sd" aria-hidden="true"></span><span class="sst">${txt}</span>`, el);
  el.setAttribute('aria-label', 'Menu. ' + txt);
  el.setAttribute('data-tip', txt);
  const who = acct.user ? acct.user.email : '';
  const key = cls + '|' + txt + '|' + who;
  if (saveShown !== key) {
    saveShown = key;
    const modal = document.getElementById('modal');
    if (ui.modal && ui.modal.kind === 'menu' && modal && !modal.hidden) renderModal();
  }
}
