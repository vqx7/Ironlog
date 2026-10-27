/* The page's listeners and its actions by data-act (r63, from the legacy
   script's 18-ui.js, 27-actions.js and 28-events.js). Every screen's and
   sheet's taps are in their modules' tables, joined here into one; two
   choices name another action to run, so they read the whole table and live
   with it. The listeners are added by main.ts, in the order the page always
   added them: each document listener runs in the order it was added, so the
   order is part of what a tap does. */

import { isDate, today } from './util';
import { bwShare } from './library';
import { DIRTY_SAID } from './format';
import { FORM_SHEETS } from './layout';
import { ui } from './store';
import type { ExEdit } from './modals';
import { drawnBeforeToday, fieldOf } from './view';
import { closeModal, modalFocusables, pageBack, render, renderModal, rerenderKeepScroll } from './page';
import { toast } from './toast';
import { tick, wakeOn } from './timer';
import { chartsResize } from './graphs';
import type { Tap } from './workstate';
import { HISTORY_ACTS, HISTORY_BINDS } from './history';
import { SETTINGS_ACTS, SETTINGS_BINDS, bandChange, bandInput, gymField } from './settings';
import { PLAN_ACTS, PLAN_BINDS, planChange, planInput } from './plan';
import { DASH_ACTS, DASH_BINDS } from './stats';
import { TODAY_ACTS, TODAY_BINDS, todayChange } from './today';
import { MAP_ACTS } from './map';
import { WORKOUT_ACTS, workoutChange, workoutInput, workoutKey } from './workout';
import { UPDATE_ACTS } from './update';
import { ACCOUNT_ACTS, accountInput, accountSubmit } from './account';
import { REPORT_ACTS, reportChange, reportInput } from './report';
import { IMPORT_ACTS, importChange } from './importflow';
import { DEMO_ACTS } from './demo';
import { APP_ACTS } from './actsapp';
import { ROUTINE_ACTS } from './actsroutine';
import { PICK_ACTS } from './actspick';
import { START_ACTS } from './actsstart';
import { LIFT_ACTS } from './actslift';

/** How often a page on the screen checks whether the day has turned, in milliseconds. */
const NEW_DAY_MS = 30000;
/** Percent, as the editor's bodyweight share is typed. */
const PERCENT = 100;

/** An action: what a tap on an element with its data-act does. */
type Act = (t: Tap) => void;

/** Every action by data-act: the moved screens' and sheets' (each change to the log through act), and the two that run another by name. */
export const ACT: Readonly<Record<string, Act>> = {
  ...HISTORY_ACTS,
  ...SETTINGS_ACTS,
  ...PLAN_ACTS,
  ...DASH_ACTS,
  ...TODAY_ACTS,
  ...MAP_ACTS,
  ...WORKOUT_ACTS,
  ...UPDATE_ACTS,
  ...ACCOUNT_ACTS,
  ...REPORT_ACTS,
  ...IMPORT_ACTS,
  ...DEMO_ACTS,
  ...APP_ACTS,
  ...ROUTINE_ACTS,
  ...PICK_ACTS,
  ...START_ACTS,
  ...LIFT_ACTS,
  // A choice in the exercise menu: the sheet closes, then the session screen's action it names runs (workout.ts).
  bMenuDo(t) {
    const f = ACT[t.dataset.op || ''];
    closeModal();
    if (f) f(t);
  },
  // A choice in Change: the sheet closes first, then the start it names runs as the card's button did.
  altGo(t) {
    const f = ACT[t.dataset.go || ''];
    closeModal();
    if (f) f(t);
  }
};

/** Runs an action by name, as a tap on an element with that data-act and these data fields would. */
function run(name: string, dataset: Record<string, string> = {}): void {
  const f = ACT[name];
  if (f) f({ dataset });
}

/* ---------- the exercise editor's and the picker's fields ---------- */

/* An editor field written into the exercise being edited, as typed: a text
   field's text, a box's tick, a select's option (its default option, '' for
   the kind, 'auto' for the load and the plates, reads as the default; the
   plates' default is no field at all). Save reads them (actspick.ts). */
/** Writes one of the editor's fields (data-ebind) into the exercise being edited. */
function editorSet(e: ExEdit, k: string, v: string | boolean): void {
  if (typeof v === 'boolean') {
    if (k === 'bw') e.bw = v;
    else if (k === 'rare') e.rare = v;
    else if (k === 'perSide') e.perSide = v;
    else if (k === 'timed') e.timed = v;
    else if (k === 'assist') e.assist = v;
    return;
  }
  if (k === 'name') e.name = v;
  else if (k === 'note') e.note = v;
  else if (k === 'primary') e.primary = v;
  else if (k === 'equip') e.equip = v;
  else if (k === 'incRaw') e.incRaw = v;
  else if (k === 'maxRaw') e.maxRaw = v;
  else if (k === 'barRaw') e.barRaw = v;
  else if (k === 'bwfRaw') e.bwfRaw = v;
  else if (k === 'kind') e.kind = v === 'compound' || v === 'iso' ? v : '';
  else if (k === 'load') e.load = v === 'each' || v === 'total' || v === 'side' || v === 'stack' ? v : 'auto';
  else if (k === 'plates') {
    if (v === 'bar' || v === 'side' || v === 'sleeve' || v === 'none') e.plates = v;
    else delete e.plates;
  }
}

/* ---------- the listeners ---------- */

/** The page's own listeners, the first it adds: Back, the return to the front, a new day while on the screen, and the rest timer read again. */
export function pageListeners(): void {
  window.addEventListener('popstate', pageBack);
  // Back on a new day, or on the screen as one begins, the screen is drawn again for it (drawnBeforeToday, r59).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    wakeOn();
    if (!ui.modal && drawnBeforeToday()) rerenderKeepScroll();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible' && !ui.modal && drawnBeforeToday()) rerenderKeepScroll();
  }, NEW_DAY_MS);
  // Intervals are throttled in a hidden tab, so re-sync on return rather than
  // showing whatever the clock last managed to paint.
  document.addEventListener('visibilitychange', () => {
    const tm = document.getElementById('timer');
    if (document.visibilityState === 'visible' && tm && !tm.hidden) tick();
  });
}

/** The taps, keys and fields of every screen and sheet, added after the tips' listeners. */
export function eventListeners(): void {
  /* The sign-in sheet is a real form so the phone offers to save and fill the
     password; it never navigates (accountSubmit, src/app/account.ts). */
  document.addEventListener('submit', accountSubmit);
  document.addEventListener('click', e => {
    const el = e.target;
    if (!(el instanceof Element)) return;
    const tab = el.closest('#tabs button');
    if (tab instanceof HTMLElement) {
      ui.tab = tab.dataset.tab || '';
      if (ui.tab === 'program') ui.planView = 'routine';
      window.scrollTo(0, 0);
      render();
      return;
    }
    /* A tap outside a sheet closes it, unless something was typed there: a
       half-filled new exercise or note is not thrown away by a stray tap. */
    if (el.id === 'modal') {
      if (ui.modal && ui.modal.dirty) {
        toast(DIRTY_SAID);
        return;
      }
      closeModal();
      return;
    }
    const t = el.closest('[data-act]');
    if (!(t instanceof HTMLElement || t instanceof SVGElement)) return;
    // getAttribute rather than dataset: the muscle map's targets are SVG groups.
    const fn = ACT[t.getAttribute('data-act') || ''];
    if (fn) {
      e.preventDefault();
      fn(t);
    }
  });
  // Muscle-map groups are focusable; Enter or Space activates them like a button.
  document.addEventListener('keydown', e => {
    const el = e.target;
    // Enter fills the sets in Type or dictate sets (r30), as the button does.
    if (e.key === 'Enter' && el instanceof Element && el.id === 'qTxt') {
      e.preventDefault();
      run('qFill');
      return;
    }
    const g = el instanceof Element ? el.closest('g[data-act]') : null;
    if (g && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      g.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
  });
  document.addEventListener('input', e => {
    const t = fieldOf(e.target);
    if (!t) return;
    const m = ui.modal;
    if (m && FORM_SHEETS.has(m.kind) && t.closest('#modal')) m.dirty = true;
    if (t.id === 'incVal' && m && m.kind === 'inc') m.typed = true;
    // The session screen's (r60): a set's load and reps, cardio, the name, the notes.
    if (workoutInput(t)) return;
    // Plan's fields (r58): an exercise's numbers, a day's name, the routine's name, the searches.
    if (planInput(t)) return;
    if (t.dataset.band) {
      bandInput(t);
      return;
    }
    // A problem report's text (src/app/report.ts).
    if (reportInput(t)) return;
    // The account sheet's fields (src/app/account.ts).
    if (accountInput(t)) return;
    if (t.dataset.ebind && m && m.kind === 'exEdit') {
      if (t instanceof HTMLInputElement && t.type === 'checkbox') return;
      editorSet(m.e, t.dataset.ebind, t.value);
      return;
    }
    // The picker's list drawn again in place (src/app/sheetspicker.ts), so the search field keeps the focus and the keyboard; the list goes back to its top.
    const mb = t.dataset.mbind;
    if (mb && m && m.kind === 'picker') {
      if (mb === 'q') m.q = t.value;
      else if (mb === 'm') m.m = t.value;
      renderModal();
      const pl = document.getElementById('pickList');
      if (pl) pl.scrollTop = 0;
      return;
    }
  });
  document.addEventListener('change', e => {
    const t = fieldOf(e.target);
    if (!t) return;
    const m = ui.modal;
    if (m && FORM_SHEETS.has(m.kind) && t.closest('#modal')) m.dirty = true;
    // A problem report's screenshot (src/app/report.ts).
    if (reportChange(t)) return;
    // A file to import or restore, and the import preview's choices (src/app/importflow.ts).
    if (importChange(t)) return;
    // Plan's fields (r58): an exercise's numbers, a day's name and rest day, Move to.
    if (planChange(t)) return;
    if (t.dataset.gym) {
      gymField(t);
      return;
    }
    // Today's (r59): the Set up page's bodyweight.
    if (todayChange(t)) return;
    if (t.dataset.band) {
      bandChange(t);
      return;
    }
    const k = t.dataset.ebind;
    if (k && m && m.kind === 'exEdit') {
      const ed = m.e;
      const box = t instanceof HTMLInputElement && t.type === 'checkbox';
      editorSet(ed, k, box ? t.checked : t.value);
      if (k === 'primary') {
        ed.secondary = ed.secondary.filter(x => x !== t.value);
        renderModal();
      }
      if (k === 'bw') {
        if (box && t.checked && !ed.bwfRaw) ed.bwfRaw = String(Math.round(bwShare(ed) * PERCENT));
        renderModal();
      }
      if (k === 'timed' || k === 'equip' || k === 'plates') renderModal();
      return;
    }
    if (t.dataset.mbind) return;
    if (t.dataset.pbind === 'date' && m && m.kind === 'past') {
      if (isDate(t.value) && t.value <= today()) m.date = t.value;
      else toast('Pick today or an earlier date');
      renderModal();
      return;
    }
    // The session screen's (r60): a set's reps and load, cardio, the date.
    if (workoutChange(t)) return;
    const b = t.dataset.bind;
    if (!b) return;
    // The moved screens' fields (History and Settings, r57; Plan and Stats, r58; Today, r59): each change through act.
    const own = HISTORY_BINDS[b] || SETTINGS_BINDS[b] || PLAN_BINDS[b] || DASH_BINDS[b] || TODAY_BINDS[b];
    if (own) {
      own(t);
      return;
    }
    if (b === 'loadFill') run('loadAsk', { v: t instanceof HTMLInputElement && t.checked ? 'fill' : 'grey' });
  });
  document.addEventListener(
    'toggle',
    e => {
      const el = e.target;
      if (!(el instanceof HTMLElement)) return;
      if (el.classList.contains('more') && el instanceof HTMLDetailsElement && ui.modal) {
        ui.modal.moreOpen = el.open;
        return;
      }
      if (!(el instanceof HTMLDetailsElement) || !el.dataset.sk) return;
      // A main section opened by openMain() stays a default, not a choice.
      if (el.dataset.auto) delete el.dataset.auto;
      else ui.folds[el.dataset.sk] = el.open;
      // A chart created inside a closed <details> has no size; give it one now.
      if (el.open) chartsResize(el);
    },
    true
  );
  document.addEventListener('keydown', e => {
    const el = e.target;
    if (e.key === 'Enter' && el instanceof Element && el.id === 'bwVal') {
      e.preventDefault();
      run('addBW');
      return;
    }
    // The session screen's (r60): Next through a set's fields, Escape on the effort strip, the arrows on an exercise's handle.
    if (workoutKey(e)) return;
    if (e.key === 'Escape' && ui.modal) {
      closeModal();
      return;
    }
    if (e.key !== 'Tab' || !ui.modal) return;
    const f = modalFocusables();
    const first = f[0],
      last = f[f.length - 1];
    if (!first || !last) return;
    const a = document.activeElement;
    const box = document.getElementById('modal');
    const outside = !box || !box.contains(a);
    if (e.shiftKey && (a === first || outside)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (a === last || outside)) {
      e.preventDefault();
      first.focus();
    }
  });
}
