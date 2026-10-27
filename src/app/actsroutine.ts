/* Routines' taps (r63, from the legacy script's 27-actions.js): a ready-made
   routine picked (on a first run, in place of the starter), a new routine,
   and the update a finished session offers its routine day. Each change to
   the log goes through `act`. */

import { uid } from './util';
import {
  DEFAULT_PLAN,
  dropStarter,
  fixSupersets,
  routineEmpty,
  routineFromTemplate,
  routineSig,
  trainOn
} from './routines';
import type { Routine } from './types';
import type { NewRoutine } from './routines';
import { starterSigs } from './normalize';
import { activeRoutine } from './live';
import { state, ui } from './store';
import { act } from './act';
import { nameTaken } from './display';
import { profApplyList } from './settings';
import { closeModal, openModal, render, rerenderKeepScroll } from './page';
import { toast } from './toast';
import { fitTargets } from './targets';
import type { Tap } from './workstate';

/** How long a first run's routine note stays when it says more (Your training applied, the targets fitted), in milliseconds. */
const READY_SAID = 6000;
/** A new routine's days, laid out as Build my own's (r55, the audit: three training days and no rest planned 7 sessions a week): 1 is a rest day. */
const NEW_DAYS = [0, 1, 0, 1, 0, 1, 1] as const;

/* A ready-made routine as first made has no superset links; it is given the
   empty one normalize() gives every item, so it joins the log whole (beside
   its only use, so the engine's coverage of routines.ts counts only what the
   engine runs). */
/** A routine as first made, its items given the empty superset link, so it can join the log. */
const fullRoutine = (r: NewRoutine): Routine => ({
  ...r,
  days: r.days.map(d => ({ ...d, items: d.items.map(it => ({ ...it, ss: null })) }))
});

/** Makes a new routine named nm, or names an existing empty one (other than the one in use), rather than stacking another blank one. */
export function rNewDo(nm: string): void {
  const blank = state.routines.find(r => routineEmpty(r) && r.id !== state.activeRoutineId);
  if (blank) {
    act(() => {
      blank.name = nm || blank.name;
    });
    ui.bRoutine = blank.id;
    render();
    toast('Reused your empty routine');
    return;
  }
  const r: Routine = {
    id: uid(),
    name: nm || 'New routine',
    schedule: 'cycle',
    days: NEW_DAYS.map(x => ({ id: uid(), name: x ? 'Rest' : 'Training day', rest: !!x, items: [] }))
  };
  act(() => {
    state.routines.push(r);
  });
  ui.bRoutine = r.id;
  render();
}

/** Routines' taps, by data-act. */
export const ROUTINE_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  obSample() {
    openModal({ kind: 'templates', from: 'welcome' });
  },
  // The fold in the first-run routine picker (r44): its own state, so a re-render keeps it open.
  obProfTog() {
    ui.obProf = !ui.obProf;
    rerenderKeepScroll();
  },
  tplPick(t) {
    const m = ui.modal;
    const from = m && m.kind === 'templates' ? m.from : 'plan';
    const k = t.dataset.k || '';
    const r0 = routineFromTemplate(k);
    if (!r0) return;
    const r = fullRoutine(r0);
    closeModal();
    // The same template added again, unchanged, is opened rather than duplicated.
    const same = state.routines.find(x => routineSig(x) === routineSig(r));
    if (from === 'welcome') {
      let fit = false;
      let pa: ReturnType<typeof profApplyList> = [];
      act(() => {
        // First run: the untouched starter routine is replaced by the pick, not
        // kept beside it. A routine with sessions logged against it always stays.
        if (same) state.activeRoutineId = same.id;
        else {
          state.routines = dropStarter(state.routines, state.sessions, starterSigs());
          state.routines.push(r);
          state.activeRoutineId = r.id;
        }
        fit = fitTargets(state.routines.find(x => x.id === state.activeRoutineId));
        // Your training, set in this sheet, applied as its Apply does (r55, the audit: Strength set here left the pick's plans as they were, and Settings then offered to apply it).
        pa = profApplyList(activeRoutine());
        for (const x of pa) Object.assign(x.it, x.ch);
        state.settings.onboarded = true;
      });
      ui.todayDay = null;
      ui.tab = 'today';
      window.scrollTo(0, 0);
      render();
      toast(
        `${r.name} is ready${pa.length ? ', set to Your training' : ''}${fit ? '. Weekly set targets now match it; change them in Settings.' : ''}`,
        null,
        fit || pa.length ? READY_SAID : 0
      );
      return;
    }
    if (same) {
      ui.bRoutine = same.id;
      render();
      toast('You already have this routine unchanged. Opened it instead.');
      return;
    }
    act(() => {
      state.routines.push(r);
    });
    ui.bRoutine = r.id;
    render();
    toast(`${r.name} added. Tap Make active to use it.`);
  },
  rNew() {
    openModal({ kind: 'routineNew' });
  },
  rNewSave() {
    const el = document.getElementById('rNewName');
    const nm = (el instanceof HTMLInputElement ? el.value : '').trim();
    if (!nm) {
      toast('Give the routine a name');
      return;
    }
    if (nameTaken(nm)) {
      toast('A routine already has that name. Pick another.');
      return;
    }
    closeModal();
    rNewDo(nm);
  },
  rTemplate() {
    openModal({ kind: 'templates', from: 'plan' });
  },
  applyUpd() {
    const m = ui.modal;
    const u = m && m.kind === 'recap' ? m.upd : null;
    closeModal();
    if (!u) return;
    const R = state.routines.find(r => r.id === u.rid);
    const day = R && R.days.find(x => x.id === u.dayId);
    if (!day) {
      toast('That routine day no longer exists');
      return;
    }
    act(
      () => {
        // At the plan it was done at (r55).
        for (const x of u.swap) {
          const it = day.items.find(i => i.exId === x.from);
          if (it) {
            it.exId = x.to;
            if (x.plan) {
              Object.assign(it, x.plan);
              if (x.plan.jump == null) delete it.jump;
            }
          }
        }
        // A session's plan is whole; the default under it only fills what the type allows to be missing, as normalize would.
        for (const x of u.add)
          if (!day.items.some(i => i.exId === x.exId))
            day.items.push({ ...DEFAULT_PLAN, ...x.plan, uid: uid(), exId: x.exId, ss: null });
        // Each superset kept: its exercises side by side, in the order done, under one link.
        for (const ids of u.ss || []) {
          const its = ids.flatMap(id => day.items.filter(i => i.exId === id).slice(0, 1));
          if (its.length < 2) continue;
          const at = Math.min(...its.map(i => day.items.indexOf(i)));
          day.items = day.items.filter(i => !its.includes(i));
          day.items.splice(at, 0, ...its);
          const g = uid();
          for (const i of its) i.ss = g;
        }
        fixSupersets(day.items);
        if (day.items.length) Object.assign(day, trainOn(day));
      },
      { undo: true }
    );
    render();
    toast(`${day.name} updated`, true);
  }
};
