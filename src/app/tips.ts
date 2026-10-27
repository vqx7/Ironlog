/* The tips (r63, from the legacy script's 28-events.js). Any element with
   data-tip shows it: after a short hover with a mouse, on keyboard focus, or
   when held for about half a second on a touch screen. A hold never also
   fires the tap underneath. The small i buttons show their tip on a plain
   tap too. */

/** The tips' timings and distances: the hover before a tip shows, a touch held, how far a finger may move and still hold, the vibration on a hold, and the tip's gap from its element and the screen's edge, in milliseconds and pixels. */
const TIP_AT = { hoverMs: 350, holdMs: 480, movePx: 10, buzzMs: 8, gapPx: 8, edgePx: 12 } as const;

/** The tip showing (its element), the hover and hold waits, where a touch began, and whether the tap after a hold is swallowed. */
const TIP: {
  el: Element | null;
  t: ReturnType<typeof setTimeout> | undefined;
  hold: ReturnType<typeof setTimeout> | null;
  x: number;
  y: number;
  swallow: boolean;
} = { el: null, t: undefined, hold: null, x: 0, y: 0, swallow: false };

/** The element under an event, as an element (a text node's parent; null for the document or a window). */
const at = (e: Event): Element | null => {
  const t = e.target;
  return t instanceof Element ? t : t instanceof Node ? t.parentElement : null;
};

function tipShow(el: Element): void {
  const box = document.getElementById('tip');
  const txt = el.getAttribute('data-tip');
  if (!box || !txt) return;
  TIP.el = el;
  box.textContent = txt;
  box.hidden = false;
  const r = el.getBoundingClientRect(),
    b = box.getBoundingClientRect(),
    vw = window.innerWidth,
    vh = window.innerHeight;
  let top = r.top - b.height - TIP_AT.gapPx;
  if (top < TIP_AT.gapPx) top = r.bottom + TIP_AT.gapPx;
  if (top + b.height > vh - TIP_AT.gapPx) top = Math.max(TIP_AT.gapPx, vh - b.height - TIP_AT.gapPx);
  let left = r.left + r.width / 2 - b.width / 2;
  left = Math.max(TIP_AT.edgePx, Math.min(left, vw - b.width - TIP_AT.edgePx));
  box.style.top = top + 'px';
  box.style.left = left + 'px';
  el.setAttribute('aria-describedby', 'tip');
}
function tipHide(): void {
  clearTimeout(TIP.t);
  if (TIP.hold) clearTimeout(TIP.hold);
  TIP.hold = null;
  const box = document.getElementById('tip');
  if (box) box.hidden = true;
  if (TIP.el) {
    TIP.el.removeAttribute('aria-describedby');
    TIP.el = null;
  }
}

/* On a phone nothing can be hovered, and a press and hold is not something
   anyone finds (r27). An explanation on a control's label gets a visible i
   button beside the label instead (a tap on the label still works the
   control), and dotted-underlined text shows its explanation on a tap. */
let labelIds = 0;
/** Gives each label's explained words under root an i button, and names the label's control by its words alone. */
export function tipLabels(root: Node): void {
  if (!(root instanceof Element) && !(root instanceof Document)) return;
  const list =
    root instanceof Element && root.matches('label .hastip') ? [root] : [...root.querySelectorAll('label .hastip')];
  for (const sp of list) {
    const t = sp.getAttribute('data-tip');
    if (!t) continue;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tipi';
    b.setAttribute('data-tip', t);
    b.setAttribute('aria-label', 'About ' + (sp.textContent || 'this').trim());
    b.textContent = 'i';
    sp.classList.remove('hastip');
    sp.removeAttribute('data-tip');
    sp.after(' ', b);
  }
  // A button inside a label spoils the control's spoken name (it read "About
  // Auto-mark..." twice, or fell back to the placeholder), so the control is
  // named by its label text alone.
  const labs = root instanceof Element && root.matches('label') ? [root] : [...root.querySelectorAll('label')];
  for (const lb of labs) {
    if (!lb.querySelector(':scope > .tipi, :scope > span + .tipi')) continue;
    const c = lb.querySelector('input,select,textarea');
    if (!c || c.hasAttribute('aria-labelledby') || c.hasAttribute('aria-label')) continue;
    const sp = [...lb.children].find(
      x => x.tagName === 'SPAN' && !x.classList.contains('tipi') && (x.textContent || '').trim()
    );
    if (!sp) continue;
    if (!sp.id) sp.id = 'lt' + ++labelIds;
    c.setAttribute('aria-labelledby', sp.id);
  }
}

/** Adds the tips' listeners and gives the page's labels their i buttons, once, at start, where the legacy script added them. */
export function tipsStart(): void {
  document.addEventListener('pointerover', e => {
    if (e.pointerType !== 'mouse') return;
    const el = at(e)?.closest('[data-tip]');
    if (!el || el === TIP.el) return;
    clearTimeout(TIP.t);
    TIP.t = setTimeout(() => tipShow(el), TIP_AT.hoverMs);
  });
  document.addEventListener('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    const el = at(e)?.closest('[data-tip]');
    const to = e.relatedTarget;
    if (el && (!to || !(to instanceof Node) || !el.contains(to))) tipHide();
  });
  document.addEventListener(
    'pointerdown',
    e => {
      TIP.swallow = false;
      const t = at(e);
      if (TIP.el && !(t && (t.closest('.tipi') === TIP.el || t.closest('.hastip') === TIP.el))) tipHide();
      if (e.pointerType === 'mouse') return;
      const el = t && t.closest('[data-tip]');
      if (!el) return;
      TIP.x = e.clientX;
      TIP.y = e.clientY;
      if (TIP.hold) clearTimeout(TIP.hold);
      TIP.hold = setTimeout(() => {
        TIP.hold = null;
        TIP.swallow = true;
        tipShow(el);
        try {
          if (navigator.vibrate) navigator.vibrate(TIP_AT.buzzMs);
        } catch (err) {
          // Vibration is optional.
        }
      }, TIP_AT.holdMs);
    },
    true
  );
  document.addEventListener(
    'pointermove',
    e => {
      if (TIP.hold && (Math.abs(e.clientX - TIP.x) > TIP_AT.movePx || Math.abs(e.clientY - TIP.y) > TIP_AT.movePx)) {
        clearTimeout(TIP.hold);
        TIP.hold = null;
      }
    },
    true
  );
  document.addEventListener(
    'pointerup',
    () => {
      if (TIP.hold) {
        clearTimeout(TIP.hold);
        TIP.hold = null;
      }
    },
    true
  );
  document.addEventListener(
    'pointercancel',
    () => {
      if (TIP.hold) clearTimeout(TIP.hold);
      TIP.hold = null;
    },
    true
  );
  document.addEventListener('contextmenu', e => {
    if (at(e)?.closest('[data-tip]')) e.preventDefault();
  });
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) tipLabels(n);
  }).observe(document.body, { childList: true, subtree: true });
  tipLabels(document.body);
  document.addEventListener(
    'click',
    e => {
      if (TIP.swallow) {
        TIP.swallow = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      const t = at(e);
      const hastip = t && t.closest('.hastip');
      const i =
        t && (t.closest('.tipi') || (hastip && !t.closest('label,button,a,summary,[data-act]') ? hastip : null));
      if (i) {
        e.preventDefault();
        e.stopPropagation();
        if (TIP.el === i) tipHide();
        else tipShow(i);
      }
    },
    true
  );
  document.addEventListener('focusin', e => {
    const el = e.target;
    if (el instanceof Element && el.matches('[data-tip]')) {
      try {
        if (el.matches(':focus-visible')) tipShow(el);
      } catch (err) {
        // A browser without :focus-visible shows no tip on focus.
      }
    }
  });
  document.addEventListener('focusout', () => tipHide());
  window.addEventListener(
    'scroll',
    () => {
      if (TIP.el) tipHide();
    },
    { passive: true }
  );
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && TIP.el) tipHide();
  });
}
