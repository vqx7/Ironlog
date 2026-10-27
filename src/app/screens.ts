/* The page's draw (r63, from the legacy script's 10-start.js, 18-ui.js and
   29-sections.js): every tab by its screen, what goes before a draw (the
   drags, the charts and the tour taken down) and after it (each mounted
   again), the drags and the arrow keys that move a tab's sections and a
   routine's days and exercises, and the table of every sheet by its kind
   with what closing each does. It knows every screen, so the page (page.ts)
   is given its draw and its sheets at start instead of importing them. */

import type { TemplateResult } from 'lit-html';
import { state, ui } from './store';
import { act } from './act';
import { drawScreen, drawing, dragDrop, dragStart } from './view';
import { applyTheme, render, renderModal, rerenderKeepScroll, setSaveState } from './page';
import type { Sheets } from './page';
import { toast } from './toast';
import { stopTimer, wakeOff } from './timer';
import { killCharts, mountCharts } from './graphs';
import { drawWeekBar } from './week';
import { B3, mount3D } from './map';
import { mountObTour, obActive, obTourStop, viewToday } from './today';
import { viewHistory } from './history';
import { viewSettings } from './settings';
import { dayKey, dropDay, dropItem, dropLib, viewLibrary, viewProgram } from './plan';
import { viewDash } from './stats';
import { viewWorkout, workoutFullDraw } from './workout';
import { blockDragStop, mountBlockDrag } from './workdrag';
import { curRoutineB } from './display';
import { calSheet } from './calendar';
import { acctSheet, fbInboxSheet, fbSheet, menuSheet } from './sheetsaccount';
import { acctClosed } from './account';
import { guideSheet } from './guide';
import { impSheet } from './sheetsimport';
import { cardioSheet, confirmSheet, dayPickSheet, restWeekSheet, textSheet } from './sheetsmisc';
import { exEditSheet, exHistSheet, exMusSheet } from './sheetsexercise';
import { iconSheet, installSheet, pastSheet } from './sheetsapp';
import { eqSheet, pickExSheet, pickTodaySheet, pickerSheet, shortSheet } from './sheetspicker';
import { recapSheet, routineNewSheet, startAltSheet, templatesSheet } from './sheetsplan';
import {
  bmenuSheet,
  calibrationSheet,
  goalSheet,
  incSheet,
  injurySheet,
  maxSheet,
  noteSheet,
  quickSheet
} from './sheetslift';

/** How long a dragged list's items take to slide into place, in milliseconds (as the session's exercises do). */
const DRAG_MS = 150;

/** The drag lists on the page now, taken down before each draw. */
let sortables: { destroy(): void }[] = [];

/** Takes down what a draw would leave behind: the tour, the drags (and a drag's floating copy, should a sync draw mid-drag), and the charts. */
function killDynamic(): void {
  obTourStop();
  // A re-render in the middle of a drag (a cloud refresh) would leave Sortable's
  // floating copy of the block on the page; it goes with the old list.
  blockDragStop();
  document.querySelectorAll('.sortable-fallback,.sortable-ghost').forEach(e => {
    if (!e.closest('#view')) e.remove();
  });
  killCharts();
  dragDrop();
  sortables.forEach(s => {
    try {
      s.destroy();
    } catch (e) {
      // The list is already gone.
    }
  });
  sortables = [];
}

/** The tabs drawn by their modules (phase 5, r57 to r60): each a template of the log and ui. Today with a session in progress is the session screen (workout.ts, r60). */
const TABS: Readonly<Record<string, () => TemplateResult>> = {
  today: () => (state.draft ? viewWorkout(state.draft) : viewToday()),
  history: viewHistory,
  settings: viewSettings,
  program: () => (ui.planView === 'library' ? viewLibrary() : viewProgram()),
  dash: viewDash
};

/** Draws the page: the tabs' bar, the week bar and the tab open, then mounts what the tab needs once drawn. */
export function renderInner(): void {
  // Asked for mid-draw: once this draw is done (below).
  if (drawing()) {
    queueMicrotask(render);
    return;
  }
  killDynamic();
  applyTheme();
  setSaveState();
  document.querySelectorAll('#tabs button').forEach(b => {
    if (b instanceof HTMLElement && b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  {
    const tb = document.querySelector('#tabs button[data-tab="today"]');
    if (tb) {
      const d = state.draft;
      tb.classList.toggle('live', !!d);
      const sp = tb.querySelector('span');
      if (sp) sp.textContent = d ? 'Session' : 'Today';
      tb.setAttribute('aria-label', d ? (d.editingId ? 'Session being edited' : 'Session in progress') : 'Today');
    }
  }
  drawWeekBar();
  if (ui.tab === 'library') ui.tab = 'program';
  // The setup pages stand alone: no tabs or week bar until a way to start is picked.
  if (obActive() && ui.tab !== 'today') ui.tab = 'today';
  document.body.classList.toggle('obmode', obActive());
  /* One host draws every tab (r57; every tab a module's screen since r60): a
     template, updated in place, which places its sections itself. A draw
     asked for while lit-html is drawing (an event a removed field fires
     mid-draw) runs once this one is done: lit-html takes nodes away one by
     one, and a draw inside that would find them gone. The session screen
     puts back first what the legacy page's fresh markup reset (the effort
     strip, the plates line, a fold waiting its moment). */
  if (ui.tab === 'today' && state.draft) workoutFullDraw();
  const v = document.getElementById('view');
  const tab = TABS[ui.tab] || TABS['today'];
  if (v && tab) drawScreen(v, tab());
  if (!(ui.tab === 'today' && state.draft) && !(ui.tab === 'program' && ui.planView === 'library')) mountSecSortable();
  if (ui.tab === 'today' && state.draft) {
    const s = mountBlockDrag();
    if (s) sortables.push(s);
  }
  if (ui.tab === 'program' && ui.planView !== 'library') mountSortable();
  if (ui.tab === 'dash') mountCharts();
  if (ui.tab === 'today' && !state.draft) mount3D();
  if (obActive()) mountObTour();
  if (ui.modal) renderModal();
}

/* ---------- movable, foldable sections ----------
   Every section a tab shows carries data-mkey and a ⠿ handle in its header.
   Dragging the handle reorders sections; the order is saved per tab in
   settings.secOrder, and each screen draws its sections in it (view.ts,
   placed and slotted), into the places keyed sections hold, so unkeyed
   elements (page titles, the Start card, notices) never move. Keys a tab
   does not show right now (Injuries with none flagged) keep their saved
   place. On the handle, the arrow keys do the same as dragging. A session's
   exercises are dragged by workout.ts (r60). */
/** The tab's sections, in the order they are on the page. */
function keyedKids(): HTMLElement[] {
  const v = document.getElementById('view');
  return v ? [...v.children].flatMap(e => (e instanceof HTMLElement && e.dataset.mkey ? [e] : [])) : [];
}
/* keys: the shown sections in their new order; a section not shown keeps its
   place after the one it followed. */
/** Saves the tab's sections in a new order. */
function saveSecOrder(keys0: string[]): void {
  const keys = [...new Set(keys0)];
  const old = state.settings.secOrder[ui.tab] || [];
  const out = keys.slice();
  old.forEach((k, i) => {
    if (out.includes(k)) return;
    const prev = old
      .slice(0, i)
      .reverse()
      .find(q => out.includes(q));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k);
  });
  act(
    () => {
      state.settings.secOrder[ui.tab] = out;
    },
    { soon: true }
  );
}
/* A screen places its sections from the saved order itself (every tab is a
   module's screen since r60), and its drawn nodes may not be moved under it:
   a drag or an arrow key reads the new order, puts the section back where it
   was drawn, saves the order and draws the screen again, which moves it. */
/** Makes the tab's sections draggable by their handles. */
function mountSecSortable(): void {
  const S = window.Sortable;
  const v = document.getElementById('view');
  if (!S || !v || keyedKids().length < 2) return;
  // Its own group, closed both ways: a section can only move among sections,
  // and no exercise or day can be dropped among them.
  sortables.push(
    S.create(v, {
      group: { name: 'sections', pull: false, put: false },
      handle: '.sgrip',
      draggable: '[data-mkey]',
      animation: DRAG_MS,
      fallbackOnBody: true,
      onStart: e => dragStart(e.item),
      onEnd: e => {
        if (e.oldIndex === e.newIndex) {
          dragDrop();
          return;
        }
        // After Sortable has finished with the drop, and in one task, so the old order is never painted.
        const keys = keyedKids().map(x => x.dataset.mkey || '');
        setTimeout(() => {
          dragDrop();
          saveSecOrder(keys);
          rerenderKeepScroll();
        }, 0);
      }
    })
  );
}
/** Moves a section one place up or down from its handle (the arrow keys). */
function moveSecKey(g: Element, dir: number): void {
  const el = g.closest('[data-mkey]');
  if (!(el instanceof HTMLElement) || el.parentElement !== document.getElementById('view')) return;
  const kids = keyedKids();
  const i = kids.indexOf(el);
  const j = i + dir;
  if (j < 0 || j >= kids.length) return;
  const k = el.dataset.mkey || '';
  const keys = kids.map(x => x.dataset.mkey || '');
  keys.splice(i, 1);
  keys.splice(j, 0, k);
  saveSecOrder(keys);
  rerenderKeepScroll();
  const n = document.querySelector(`#view > [data-mkey="${k}"]`);
  const ng = n && n.querySelector('.sgrip');
  if (ng instanceof HTMLElement) ng.focus();
  if (n) n.scrollIntoView({ block: 'nearest' });
  toast(`Moved ${dir < 0 ? 'up' : 'down'}`);
}

/** Makes Plan's lists draggable: a day's exercises, the days of a numbered cycle, and the library to copy from. */
function mountSortable(): void {
  const S = window.Sortable;
  if (!S) return;
  // Plan is drawn by lit-html (r58): each drag ends in src/app/plan.ts, which puts the element back where it was drawn and changes the log.
  const onStart = (e: { item: HTMLElement }): void => dragStart(e.item);
  document.querySelectorAll('ul.items').forEach(el =>
    sortables.push(
      S.create(el, {
        animation: DRAG_MS,
        fallbackOnBody: true,
        onStart,
        group: { name: 'days', pull: true, put: ['days'] },
        handle: '.grip',
        onEnd: dropItem
      })
    )
  );
  // Days reorder by their ⠿ handle in a numbered cycle; labels come from position, so they renumber as the ↑/↓ Day buttons do.
  const dl = document.getElementById('dayList');
  if (dl && curRoutineB().schedule !== 'weekly')
    sortables.push(
      S.create(dl, {
        animation: DRAG_MS,
        fallbackOnBody: true,
        onStart,
        group: { name: 'dayorder', pull: false, put: false },
        handle: '.dgrip',
        draggable: 'section.day',
        onEnd: dropDay
      })
    );
  const lib = document.getElementById('bLib');
  if (lib)
    sortables.push(
      S.create(lib, {
        animation: DRAG_MS,
        fallbackOnBody: true,
        onStart,
        group: { name: 'days', pull: 'clone', put: false },
        sort: false,
        handle: '.grip',
        onEnd: dropLib
      })
    );
}

/** A tap or a key on a section's or a day's handle: the arrow keys move it, and a tap never folds the section or presses a button under it. */
export function sectionsStart(): void {
  // A tap on the handle must never fold the section or fire a button under it.
  document.addEventListener(
    'click',
    e => {
      const t = e.target;
      if (t instanceof Element && t.closest('.sgrip,.bgrip')) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );
  document.addEventListener(
    'keydown',
    e => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const dg = t.closest('.dgrip');
      if (dg instanceof HTMLElement && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        dayKey(dg, e.key === 'ArrowUp');
        return;
      }
      const g = t.closest('.sgrip');
      if (!g) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        moveSecKey(g, e.key === 'ArrowUp' ? -1 : 1);
      } else if (e.key === ' ' || e.key === 'Enter') e.preventDefault();
    },
    true
  );
}

/* ---------- the sheets ----------
   Each sheet by its kind: its draw, and what closing it does beyond hiding
   it. The page (page.ts) opens, closes and draws them from this table. */
/** Every sheet by its kind, as the page draws and closes it. */
export const SHEETS: Sheets = {
  account: { draw: acctSheet, closed: acctClosed },
  install: { draw: installSheet },
  icon: { draw: iconSheet },
  menu: { draw: menuSheet },
  guide: { draw: guideSheet },
  calendar: { draw: calSheet },
  past: { draw: pastSheet },
  feedback: { draw: fbSheet },
  fbInbox: { draw: fbInboxSheet },
  restwk: { draw: restWeekSheet },
  daypick: { draw: dayPickSheet },
  confirm: { draw: confirmSheet },
  picker: { draw: pickerSheet },
  exEdit: { draw: exEditSheet },
  exhist: { draw: exHistSheet },
  bmenu: { draw: bmenuSheet },
  injury: { draw: injurySheet },
  recap: { draw: recapSheet },
  imp: { draw: impSheet },
  templates: { draw: templatesSheet },
  routineNew: { draw: routineNewSheet },
  // The 3D body goes back to Today's map, coloured by the week again, facing the way it was, a turn still running stopped first (r54: it went on, on Today's body).
  exMus: {
    draw: exMusSheet,
    closed: () => {
      cancelAnimationFrame(B3.anim);
      B3.ex = null;
      if (B3.yawKeep != null) {
        B3.yaw = B3.yawKeep;
        B3.yawKeep = null;
      }
      if (document.getElementById('bm3d')) mount3D();
    }
  },
  goal: { draw: goalSheet },
  inc: { draw: incSheet },
  cardio: { draw: cardioSheet },
  quick: { draw: quickSheet },
  max: { draw: maxSheet },
  cal: { draw: calibrationSheet },
  // Short on time's trial session (startShort) goes again when the sheet closes without its trim and nothing was logged: only a question was asked.
  short: {
    draw: shortSheet,
    closed: m => {
      const d = state.draft;
      if (m.temp && !m.applied && d && d.id === m.temp && !d.ex.some(b => b.sets.some(x => x.done))) {
        act(
          () => {
            state.draft = null;
          },
          { inProgress: true }
        );
        stopTimer();
        wakeOff();
        setTimeout(render, 0);
      }
    }
  },
  note: { draw: noteSheet },
  startAlt: { draw: startAltSheet },
  pickToday: { draw: pickTodaySheet },
  pickEx: { draw: pickExSheet },
  eq: { draw: eqSheet },
  text: { draw: textSheet }
};
/** What a sheet mounts once drawn: the 3D body of an exercise's muscles. */
export function afterSheet(): void {
  if (document.getElementById('bm3dx')) mount3D();
}
