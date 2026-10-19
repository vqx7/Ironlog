/* How a sheet meets a phone's on-screen keyboard (r54, PENDING 311 f and
   309; V on the r52 preview: after Wrong email or password the email field
   could not be tapped, and sheets sit behind the keyboard). Two things, both
   about the screen, so this module sits with the screens' layer:

   - The sheets' layer (#modal) is fixed to the page, and on an iPhone the
     keyboard covers the page without making it shorter, so a sheet sat
     behind the keyboard. followViewport keeps two values on the page's root:
     the visual viewport's height (the part of the screen that shows) and the
     strip below it to the bottom of what a fixed element fills, which the
     style sheet lifts the sheet by and paints in the sheet's colour, so a
     sheet sits above the keyboard and nothing of the page shows under it. A
     sheet sized to the part that shows (r54's first version) left the page
     visible in that strip, where iOS 26 Safari draws it behind its glass
     address pill and the bar above the keyboard (V on the r54 preview: the
     page's own button and text under the sheet's, "showing twice").
   - A sheet redrawn while someone types in it was rebuilt from its markup,
     the field they were in replaced by a new one under the keyboard.
     morphInto puts the new markup into the old sheet in place when nothing
     but attributes and words differ, so the fields themselves, and the
     focus, the caret and the keyboard with them, stay as they are.

   Neither can be watched on a real keyboard here (Playwright's browsers have
   none): the suites stand in for the keyboard by moving the visual
   viewport, and V checks the real one on the phone. */

/** Keeps --vv-h on the page's root at the visual viewport's height, and
    --vv-under at the strip from its bottom to the bottom of what a fixed
    element fills (measured, by a fixed element of no width, since that is
    what the sheets' layer fills), now and as it moves (the keyboard opening
    or closing, the page scrolled to a field), and returns what stops it.
    Nothing where a browser has no visual viewport, so the style sheet's
    fallbacks, the whole page, hold. */
export function followViewport(win: Window): () => void {
  const vv = win.visualViewport;
  if (!vv) return () => undefined;
  const doc = win.document,
    root = doc.documentElement;
  const probe = doc.createElement('div');
  probe.className = 'vvprobe';
  probe.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(probe);
  const set = (): void => {
    const under = probe.getBoundingClientRect().height - vv.offsetTop - vv.height;
    root.style.setProperty('--vv-h', `${vv.height}px`);
    // Under a pixel is rounding, not a strip.
    root.style.setProperty('--vv-under', `${under >= 1 ? under : 0}px`);
  };
  vv.addEventListener('resize', set);
  vv.addEventListener('scroll', set);
  set();
  return () => {
    vv.removeEventListener('resize', set);
    vv.removeEventListener('scroll', set);
    probe.remove();
  };
}

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
