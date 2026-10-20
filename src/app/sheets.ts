/* A sheet redrawn while someone types in it (r54, PENDING 311 f and 309; V
   on the r52 preview: after Wrong email or password the email field could
   not be tapped to change it): it was rebuilt from its markup, the field
   they were in replaced by a new one under the keyboard. morphInto puts the
   new markup into the old sheet in place when nothing but attributes and
   words differ, so the fields themselves, and the focus, the caret and the
   keyboard with them, stay as they are. It sits with the screens' layer.

   Until r54's preview this module also sized the sheets by the part of the
   screen that shows, to sit above the keyboard; on V's iPhone that showed
   the page under the sheet, then moved the page as the keyboard came, and
   it was taken out (PENDING 322). */

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

/** Puts markup into an element in place of what it holds when the two have
    the same shape, changing only attributes and words, so its fields stay the
    same nodes; true when it did, false (and nothing changed) when the shapes
    differ, for the caller to rebuild the element as before. */
export function morphInto(el: Element, html: string): boolean {
  const t = el.ownerDocument.createElement('template');
  t.innerHTML = html;
  if (!sameShape(el, t.content)) return false;
  copyInto(el, t.content);
  return true;
}
