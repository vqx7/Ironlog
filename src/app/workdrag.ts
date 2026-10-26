/* An exercise of the session dragged by its handle (r60, from workout.ts):
   the page scrolled near the edges, a folded exercise opened under the
   finger, and the order kept through act (moveBlock). */

import { state, fx } from './store';
import { dragStart, dragDrop } from './view';
import { W } from './workstate';
import { moveBlock } from './worksets';

/** Dragging an exercise: the band at the top and bottom of the screen that scrolls it, how fast at the edge, the fastest step, in pixels a frame, and the slide of the others. */
const DRAG = { edgePx: 56, speedPx: 14, maxPx: 20, animMs: 150 } as const;

/* ---------- an exercise dragged ---------- */

/* While an exercise is dragged, a finger near the top or bottom of the space
   between the header and the tab bar (or the rest timer) scrolls the page,
   faster the closer it is. Sortable's own scrolling did not run for a touch
   drag on the window. Sortable re-reads the target every 50 ms on its own, so
   a finger held still keeps moving the exercise as the page scrolls. Both
   bars are position:fixed, whose offsetParent is always null, so
   getClientRects is what tells a shown bar from a hidden one. */
const edgeScroll = ((): { start(): void; stop(): void } => {
  let y: number | null = null,
    raf = 0;
  const mv = (e: Event): void => {
    const p = e instanceof TouchEvent ? e.touches[0] : e instanceof PointerEvent ? e : null;
    if (p) y = p.clientY;
  };
  const zone = (): [number, number] => {
    const h = document.querySelector('header.top');
    const top = h ? h.getBoundingClientRect().bottom : 0;
    let bot = window.innerHeight;
    for (const el of [document.getElementById('tabs'), document.getElementById('timer')]) {
      if (el && !el.hidden && el.getClientRects().length) {
        const r = el.getBoundingClientRect();
        if (r.height) bot = Math.min(bot, r.top);
      }
    }
    return [top, bot];
  };
  const step = (): void => {
    raf = 0;
    if (!W.blockDrag) return;
    if (y != null) {
      const [top, bot] = zone();
      const edge = DRAG.edgePx;
      let v = 0;
      if (y < top + edge) v = -Math.ceil(((top + edge - y) / edge) * DRAG.speedPx);
      else if (y > bot - edge) v = Math.ceil(((y - (bot - edge)) / edge) * DRAG.speedPx);
      if (v) window.scrollBy(0, Math.max(-DRAG.maxPx, Math.min(DRAG.maxPx, v)));
    }
    raf = requestAnimationFrame(step);
  };
  return {
    start(): void {
      y = null;
      document.addEventListener('touchmove', mv, { passive: true });
      document.addEventListener('pointermove', mv, { passive: true });
      if (!raf) raf = requestAnimationFrame(step);
    },
    stop(): void {
      document.removeEventListener('touchmove', mv);
      document.removeEventListener('pointermove', mv);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      y = null;
    }
  };
})();

/** Ends an exercise drag the page is drawn under (a full draw mid-drag): the drag marks off, the room added for it taken away. */
export function blockDragStop(): void {
  W.blockDrag = false;
  if (document.body.classList.contains('blkdrag')) {
    document.body.classList.remove('blkdrag');
    const v = document.getElementById('view');
    if (v) v.style.paddingBottom = '';
  }
  edgeScroll.stop();
}

/* The exercises open again at the drop. The scroll is moved with them, so
   the one just dropped stays where the finger left it instead of the page
   going back to a position measured on the one-line list (r29 review). */
function dragOpenUp(it: Element): void {
  const t0 = it.isConnected ? it.getBoundingClientRect().top : null;
  document.body.classList.remove('blkdrag');
  const v = document.getElementById('view');
  if (v) v.style.paddingBottom = '';
  if (t0 != null) {
    const t1 = it.getBoundingClientRect().top;
    if (t1 !== t0) window.scrollBy(0, t1 - t0);
  }
}

/* The session's exercises are dragged by their ⠿ handle (r29). lit-html owns
   their nodes (r60), so the exercise dragged goes back where it was drawn
   (view.ts, dragDrop) before the session changes and the screen is drawn in
   the new order, as a drag on Plan or a section does since r57 and r58. An
   open exercise is taller than the screen, so the next one started
   off-screen and a drag could only move one place (r29 review): while
   dragging, every exercise shows only its title line, the page scrolled so
   the one held stays under the finger, with room added below the list when
   the shorter page cannot scroll that far. A field still focused when the
   drag starts would get its focus back by place after the move, on whichever
   exercise landed there, so it is left first. */
/** Makes the session's exercises draggable, when the drag library is loaded and there are two or more; its teardown, or null. */
export function mountBlockDrag(): { destroy(): void } | null {
  const S = window.Sortable;
  const v = document.getElementById('view');
  if (!S || !state.draft || !v || v.querySelectorAll('section.block').length < 2) return null;
  return S.create(v, {
    group: { name: 'blocks', pull: false, put: false },
    handle: '.bgrip',
    draggable: 'section.block',
    animation: DRAG.animMs,
    fallbackOnBody: true,
    onStart: (e: { item: HTMLElement }) => {
      dragStart(e.item);
      W.blockDrag = true;
      if (W.foldT) clearTimeout(W.foldT);
      W.foldT = null;
      const f = document.activeElement;
      if (f instanceof HTMLElement && f.matches('#view input,#view textarea'))
        try {
          f.blur();
        } catch (x) {
          // Focus is best effort; the drag goes on either way.
        }
      const it = e.item,
        t0 = it.getBoundingClientRect().top;
      document.body.classList.add('blkdrag');
      const se = document.scrollingElement;
      const want = window.scrollY + it.getBoundingClientRect().top - t0,
        room = want - ((se ? se.scrollHeight : 0) - window.innerHeight);
      if (room > 0) v.style.paddingBottom = Math.ceil(room) + 'px';
      window.scrollTo(0, want);
      edgeScroll.start();
    },
    onEnd: (e: { item: HTMLElement; oldDraggableIndex?: number | null; newDraggableIndex?: number | null }) => {
      W.blockDrag = false;
      edgeScroll.stop();
      dragOpenUp(e.item);
      const a = e.oldDraggableIndex,
        b = e.newDraggableIndex;
      dragDrop();
      if (a == null || b == null || a === b || !state.draft) {
        fx.rerenderKeepScroll();
        return;
      }
      moveBlock(a, b);
      fx.rerenderKeepScroll();
      fx.toast(`Moved to position ${b + 1}`);
    }
  });
}
