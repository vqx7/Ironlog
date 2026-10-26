/* The page's sheet layer (r62): every sheet is drawn here, by lit-html.

   A sheet redrawn while someone types in it (r54, PENDING 311 f and 309; V
   on the r52 preview: after Wrong email or password the email field could
   not be tapped to change it) was rebuilt from its markup, the field they
   were in replaced by a new one under the keyboard. A moved sheet is now
   updated in place by its template; the account sheet, still markup until
   r63, is put into the old sheet in place (morphOne) when nothing but
   attributes and words differ, so the fields themselves, and the focus, the
   caret and the keyboard with them, stay as they are. It sits with the
   screens' layer.

   Until r54's preview this module also sized the sheets by the part of the
   screen that shows, to sit above the keyboard; on V's iPhone that showed
   the page under the sheet, then moved the page as the keyboard came, and
   it was taken out (PENDING 322). */

import { nothing, render } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';

/* A node with no elements in it, only words or nothing: its words may
   change in a redraw (an error said, a button's label while it works). */
const wordsOnly = (n: Node): boolean => !Array.from(n.childNodes).some(c => c instanceof Element);

/* Whether the new markup has the old one's shape: the same elements in the
   same order, of the same tags, words aside, and every field showing what it
   shows now (a field's live value or tick against what the markup would give
   it). A field the redraw would change, or a list of choices, is a
   different sheet to draw, so the redraw rebuilds it as before. */
function sameShape(a: Node, b: Node): boolean {
  if (wordsOnly(a) && wordsOnly(b)) return true;
  if (a.childNodes.length !== b.childNodes.length) return false;
  for (let i = 0; i < a.childNodes.length; i++) {
    const x = a.childNodes[i],
      y = b.childNodes[i];
    if (x.nodeType !== y.nodeType) return false;
    if (x instanceof Element && y instanceof Element) {
      if (x.tagName !== y.tagName || x instanceof HTMLSelectElement) return false;
      if (x instanceof HTMLInputElement && y instanceof HTMLInputElement)
        if (x.type !== y.type || x.value !== y.value || x.checked !== y.checked) return false;
      if (x instanceof HTMLTextAreaElement && y instanceof HTMLTextAreaElement && x.value !== y.value) return false;
      if (!sameShape(x, y)) return false;
    }
  }
  return true;
}

/* The new markup's attributes and words into the old nodes, which stay. */
function copyInto(a: Node, b: Node): void {
  if (wordsOnly(a) && wordsOnly(b)) {
    if (a.textContent !== b.textContent) a.textContent = b.textContent;
    return;
  }
  for (let i = 0; i < a.childNodes.length; i++) {
    const x = a.childNodes[i],
      y = b.childNodes[i];
    if (x instanceof Element && y instanceof Element) {
      for (const at of Array.from(x.attributes)) if (!y.hasAttribute(at.name)) x.removeAttribute(at.name);
      for (const at of Array.from(y.attributes))
        if (x.getAttribute(at.name) !== at.value) x.setAttribute(at.name, at.value);
      copyInto(x, y);
    } else if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue;
  }
}

/* ---------- the host (r62) ---------- */

let draws = 0;
/* A sheet into the page's sheet layer (#modal), drawn by lit-html. A sheet
   opened is drawn fresh, as innerHTML drew every sheet, so a sheet replacing
   one of its own kind (one lift's goal after another's) starts from its own
   fields. The open sheet drawn again (an error said, a choice made) is
   updated in place when it is a moved sheet's template, so its fields, focus
   and scroll stay; a sheet still written as markup by the legacy script is
   drawn fresh, unless it is the account sheet redrawn with the same shape
   while someone types in it (r54), which keeps its fields. */
/** Draws the open sheet into the sheet layer: a moved sheet's template, or a legacy sheet's markup; `same` when it is the open sheet drawn again, `morph` for the account sheet. */
export function sheetDraw(el: HTMLElement, sheet: TemplateResult | string, same: boolean, morph: boolean): void {
  if (typeof sheet !== 'string') {
    // A sheet opened starts from nothing, so lit-html makes it anew rather than updating the one before.
    if (!same) render(nothing, el);
    render(sheet, el);
  } else {
    const old = same && morph ? el.querySelector('.sheet') : null;
    const t = el.ownerDocument.createElement('template');
    t.innerHTML = sheet;
    const now = t.content.firstElementChild;
    // The account sheet's fields kept: its own element compared with the new one, lit-html's markers beside it left alone.
    if (!(old && now && morphOne(old, now))) render(keyed(++draws, unsafeHTML(sheet)), el);
  }
  el.hidden = false;
}
/** Empties the sheet layer, through lit-html so its next draw finds what it drew. */
export function sheetClear(el: HTMLElement): void {
  render(nothing, el);
}
/* One element put into another of the same tag and shape in place: its
   attributes, then its contents. */
function morphOne(a: Element, b: Element): boolean {
  if (a.tagName !== b.tagName || !sameShape(a, b)) return false;
  for (const at of Array.from(a.attributes)) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
  for (const at of Array.from(b.attributes))
    if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  copyInto(a, b);
  return true;
}
