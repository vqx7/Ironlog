/* A lift's sheets inside a session and the log's smaller entries: loads filled in or grey, a calibration
   set, the heaviest available, a goal, the load step, a note, typed sets,
   cardio, a rest week, and an injury. Each change to the log goes through
   `act`; one to the session in progress alone leaves the caches as they are
   (inProgress). */

import type { Exercise } from './types';
import { isDate, isNum, numIn, today, uid } from './util';
import { JK, MK, injLabel } from './library';
import { LIMITS, within } from './records';
import { cleanCardio } from './normalize';
import { effW, greyW } from './session';
import { refreshBlock } from './worksets';
import { rirScale } from './effort';
import { appU, EX, exName, fmtWOf, fromDOf, incOf, liftMax, liftU, loadReadOf, typedBoundOf } from './live';
import { state, ui } from './store';
import { act } from './act';
import { goalWords } from './display';
import { closeModal, openModal, render, renderModal, rerenderKeepScroll } from './page';
import { toast } from './toast';
import { carried } from './workstate';
import type { Tap } from './workstate';
import { distIn, fillSets, parseSets, refreshEx } from './worksets';

/** The heaviest load a lift's limit may be, by the unit typed in. */
const MAX_LOAD = { lb: 4000, kg: 2000 } as const;
/** The most reps a calibration set to failure may be. */
const CAL_MOST = 100;
/** The highest reps in reserve a calibration set's call opens on. */
const CAL_PRED_MOST = 5;
/** How long the calibration set's answer stays, in milliseconds. */
const CAL_SAID = 7000;

/** A field's value on the open sheet, by id, or '' when the sheet has none. */
function fieldText(id: string): string {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement
    ? el.value
    : '';
}
/** A load typed, as kilograms. */
// A load typed for a lift, in its unit, in kilograms.
const kg = (ex: Pick<Exercise, 'unit'> | null | undefined, n: number): number => fromDOf(ex, n) ?? 0;

/** A lift's sheets and the log's smaller entries, by data-act. */
export const LIFT_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  /* The choice applies to the session in progress too: rows still on the
     suggestion switch between grey and filled, typed loads stay as typed. */
  loadAsk(t) {
    const fill = t.dataset.v === 'fill';
    act(() => {
      if (fill) state.settings.loadFill = 'fill';
      else delete state.settings.loadFill;
      const d = state.draft;
      // Filled in, a row takes what it showed in grey (a load typed above it, else the suggestion), and follows a correction above like carried rows do.
      if (d)
        for (const b of d.ex)
          b.sets.forEach((x, i) => {
            if (x.done || x.warm || x.drop || x.r != null || x.rir != null) return;
            if (fill && x.w == null) {
              const g = greyW(b, i);
              if (g != null) {
                x.w = g;
                if (g !== b.sw) carried.add(x);
              }
            } else if (!fill && (x.w === b.sw || carried.has(x))) {
              x.w = null;
              carried.delete(x);
            }
          });
    });
    rerenderKeepScroll();
    toast(fill ? 'Loads filled in' : 'Loads in grey');
  },
  /* The unit beside a lift's loads, tapped: the lift's equipment is marked in the other unit. Kept on the lift (back in
     the app's unit it follows the app again, as one never switched does), so every screen and the next session read it;
     the lift's blocks in the workout read their targets again in it, and a load already typed is converted, never read
     as a number of the new unit. */
  liftUnit(t) {
    const d = state.draft;
    const b = d && d.ex[Number(t.dataset.b)];
    const e = b && state.exercises.find(x => x.id === b.exId);
    if (!d || !b || !e) return;
    const to: 'kg' | 'lb' = liftU(e) === 'kg' ? 'lb' : 'kg';
    act(
      () => {
        if (to === appU()) delete e.unit;
        else e.unit = to;
        for (const x of d.ex) if (x.exId === b.exId) refreshBlock(x);
      },
      { undo: true }
    );
    rerenderKeepScroll();
    toast(`${e.name} in ${to}`, true);
  },
  bCal(t) {
    const bi = Number(t.dataset.b);
    const d = state.draft;
    const b = d && d.ex[bi];
    if (!b) return;
    const nx = b.sets.find(x => !x.done && !x.warm);
    const w =
      nx && nx.w != null
        ? nx.w
        : b.sets
            .filter(x => !x.warm && +(x.w ?? 0) > 0)
            .map(x => +(x.w ?? 0))
            .pop();
    openModal({
      kind: 'cal',
      b: bi,
      w: w != null ? fmtWOf(EX(b.exId), w) : '',
      at: '',
      pred: b.plan && isNum(+b.plan.rir) ? Math.min(CAL_PRED_MOST, Math.round(+b.plan.rir)) : 1,
      total: ''
    });
  },
  calSave() {
    const m = ui.modal;
    const d = state.draft;
    const sheet = m && m.kind === 'cal' ? m : null;
    const b = d && sheet && d.ex[sheet.b];
    if (!sheet || !b) {
      closeModal();
      return;
    }
    const ex = EX(b.exId);
    sheet.w = fieldText('calW');
    sheet.at = fieldText('calAt');
    sheet.pred = Number(fieldText('calPred'));
    sheet.total = fieldText('calTot');
    const pred = sheet.pred;
    const w = numIn(sheet.w),
      at = Math.round(numIn(sheet.at) ?? 0),
      tot = Math.round(numIn(sheet.total) ?? 0);
    const no = (err: string): void => {
      sheet.err = err;
      renderModal();
    };
    if (!ex.bw && !(w != null && w > 0)) return no('Enter the load.');
    if (!(at >= 1)) return no('Enter the rep you would normally have stopped at.');
    if (!(tot >= at)) return no('Total reps to failure should be at least the rep you would have stopped at.');
    if (tot > CAL_MOST) return no('That is more than 100 reps. Check the number.');
    const set = {
      w: kg(ex, Math.max(0, w || 0)),
      r: tot,
      rir: 0,
      warm: false,
      drop: false,
      done: true,
      cal: { at, pred }
    };
    act(
      () => {
        let si = b.sets.findIndex(x => !x.done && !x.warm && x.r == null);
        if (si < 0) si = b.sets.findIndex(x => !x.done && !x.warm);
        if (si >= 0) b.sets[si] = set;
        else b.sets.push(set);
      },
      { inProgress: true }
    );
    closeModal();
    rerenderKeepScroll();
    const left = tot - at,
      diff = left - pred;
    toast(
      `${left} rep${left === 1 ? ' was' : 's were'} left where you called ${pred}. ${diff > 0 ? 'Your sets are easier than you log.' : diff < 0 ? 'You were closer to failure than you thought.' : 'Spot on.'}`,
      false,
      CAL_SAID
    );
  },
  bMax(t) {
    const bi = Number(t.dataset.b);
    const b = state.draft && state.draft.ex[bi];
    if (!b) return;
    openModal({ kind: 'max', exId: b.exId, b: bi });
  },
  maxSave() {
    const m = ui.modal;
    const e = m && m.kind === 'max' ? state.exercises.find(x => x.id === m.exId) : undefined;
    if (!e) {
      closeModal();
      return;
    }
    const n = numIn(fieldText('maxVal'));
    // Saved as it was shown, it is kept as set: one set in the other unit is shown on this unit's equipment (liftMax).
    if (e.maxLoad != null && n != null && String(numIn(fmtWOf(e, liftMax(e) ?? 0))) === String(n)) {
      closeModal();
      return;
    }
    if (n != null && n < 0) {
      toast('Enter a load of 0 or more, or leave it blank');
      return;
    }
    closeModal();
    act(() => {
      if (n != null && n > 0) e.maxLoad = kg(e, Math.min(n, liftU(e) === 'lb' ? MAX_LOAD.lb : MAX_LOAD.kg));
      else delete e.maxLoad;
    });
    refreshEx(e.id);
    rerenderKeepScroll();
    toast(
      e.maxLoad != null
        ? `Heaviest available for ${e.name}: ${fmtWOf(e, liftMax(e) ?? 0)} ${liftU(e)}`
        : `No limit for ${e.name}`
    );
  },
  goalOpen(t) {
    openModal({ kind: 'goal', exId: t.dataset.ex || '' });
  },
  goalSave() {
    const m = ui.modal;
    const e = m && m.kind === 'goal' ? state.exercises.find(x => x.id === m.exId) : undefined;
    if (!e) {
      closeModal();
      return;
    }
    const w = numIn(fieldText('goalW')),
      r = Math.round(numIn(fieldText('goalR')) ?? NaN);
    if (!(r >= 1 && r <= LIMITS.goalReps)) {
      toast(`Reps from 1 to ${LIMITS.goalReps}`);
      return;
    }
    if (w == null && !e.bw) {
      toast('Enter a load');
      return;
    }
    if (w != null && w < 0) {
      toast('Enter a load of 0 or more');
      return;
    }
    // A load saved as it was shown is kept as set: a goal set in the other unit is shown on this unit's equipment.
    const was = e.goal;
    const goal = {
      w: was && w != null && String(numIn(fmtWOf(e, loadReadOf(e, was.w)))) === String(w) ? was.w : kg(e, w || 0),
      r
    };
    act(
      () => {
        e.goal = goal;
      },
      { undo: true }
    );
    closeModal();
    rerenderKeepScroll();
    toast(`Goal set: ${goalWords(e, goal)}`, true);
  },
  goalClear() {
    const m = ui.modal;
    const e = m && m.kind === 'goal' ? state.exercises.find(x => x.id === m.exId) : undefined;
    if (!e) {
      closeModal();
      return;
    }
    act(
      () => {
        delete e.goal;
      },
      { undo: true }
    );
    closeModal();
    rerenderKeepScroll();
    toast('Goal removed', true);
  },
  bInc(t) {
    const b = state.draft && state.draft.ex[Number(t.dataset.b)];
    if (!b) return;
    openModal({ kind: 'inc', exId: b.exId, plan: b.plan });
  },
  incSave() {
    const m = ui.modal;
    const n = numIn(fieldText('incVal'));
    if (n == null || n <= 0) {
      toast('Enter a step above 0');
      return;
    }
    const sheet = m && m.kind === 'inc' ? m : null;
    const e = sheet && state.exercises.find(x => x.id === sheet.exId);
    if (!sheet || !e) {
      closeModal();
      return;
    }
    // Saved without typing, nothing changes: a lift with no step of its own keeps following its default (Your gym's rack,
    // say), and its own step stays as set, one set in the other unit too, shown as its match (stepReadIn). A number typed
    // is saved, even the one shown (review: typing 5 on a 5 and 2.5 rack did nothing); so is any other number.
    if (!sheet.typed && String(numIn(fmtWOf(e, incOf(e, sheet.plan)))) === String(n)) {
      closeModal();
      return;
    }
    const inc = typedBoundOf(e, n, LIMITS.step);
    closeModal();
    act(() => {
      e.inc = inc;
    });
    refreshEx(e.id);
    rerenderKeepScroll();
    toast(`Load step for ${e.name}: ${fmtWOf(e, inc)} ${liftU(e)}`);
  },
  cardioNew() {
    openModal({ kind: 'cardio' });
  },
  cardioSave() {
    const min = numIn(fieldText('cMin'));
    if (min == null || min <= 0) {
      toast('Enter the minutes');
      return;
    }
    const date = fieldText('cDate') || today();
    const c = cleanCardio({
      id: uid(),
      date: isDate(date) ? date : today(),
      kind: fieldText('cKind'),
      min,
      hr: numIn(fieldText('cHr')),
      when: 'solo',
      note: fieldText('cNote').slice(0, LIMITS.cardioNote).trim(),
      dist: distIn(fieldText('cDist'))
    });
    closeModal();
    act(() => {
      state.cardio.push(c);
    });
    rerenderKeepScroll();
    toast('Cardio logged');
  },
  restWkOpen() {
    openModal({ kind: 'restwk' });
  },
  restWk(t) {
    const ws = t.dataset.w;
    if (!ws || !isDate(ws)) return;
    const r = (state.settings.restWeeks || []).slice();
    const on = r.includes(ws);
    act(
      () => {
        const next = on ? r.filter(x => x !== ws) : [...r, ws].sort();
        if (next.length) state.settings.restWeeks = next;
        else delete state.settings.restWeeks;
      },
      { undo: true }
    );
    renderModal();
    rerenderKeepScroll();
    toast(on ? 'Rest week cleared' : 'Rest week marked', true);
  },
  injAdd() {
    openModal({ kind: 'injury' });
  },
  injSave() {
    const m = fieldText('injM');
    const note = fieldText('injNote').slice(0, LIMITS.note).trim();
    if (!MK.some(k => k === m) && !JK.some(k => k === m)) return;
    closeModal();
    act(() => {
      state.injuries = (state.injuries || []).filter(x => x.m !== m);
      state.injuries.push({ id: uid(), m, note, date: today() });
    });
    render();
    toast(`${injLabel(m)} flagged`);
  },
  bMenu(t) {
    openModal({ kind: 'bmenu', b: Number(t.dataset.b) });
  },
  bQuick(t) {
    openModal({ kind: 'quick', b: Number(t.dataset.b), text: '' });
  },
  bHist(t) {
    const b = state.draft && state.draft.ex[Number(t.dataset.b)];
    if (b) openModal({ kind: 'exhist', exId: b.exId });
  },
  // The editor's muscle pickers already name the muscles; the figure is there on request (V: not both at once).
  exBodyTog() {
    ui.exBody = !ui.exBody;
    renderModal();
  },
  bMus(t) {
    const b = state.draft && state.draft.ex[Number(t.dataset.b)];
    if (b) openModal({ kind: 'exMus', exId: b.exId });
  },
  qFill() {
    const m = ui.modal;
    if (!m || m.kind !== 'quick') return;
    const d = state.draft;
    const b = d && d.ex[m.b];
    if (!b) return;
    const txt = fieldText('qTxt').trim();
    m.text = txt;
    if (!txt) {
      m.err = 'Type at least one set.';
      renderModal();
      return;
    }
    const fi = b.sets.findIndex(x => !x.done && !x.warm);
    const defW = fi >= 0 ? effW(b, fi) : null;
    const got = parseSets(txt, EX(b.exId), defW, null, rirScale() === 'rpe');
    if (got) {
      const n = fillSets(m.b, got);
      const now = ui.modal;
      if (!(now && now.kind === 'confirm')) {
        closeModal();
        rerenderKeepScroll();
        toast(`${n} set${n === 1 ? '' : 's'} filled and marked done`);
      }
      return;
    }
    m.err = `Could not read that. Try the pattern 225x5, 5, 4 ${rirScale() === 'rpe' ? 'rpe 9' : 'rir 1'}.`;
    renderModal();
  },
  bNote(t) {
    const bi = Number(t.dataset.b);
    const b = state.draft && state.draft.ex[bi];
    if (!b) return;
    openModal({ kind: 'note', bi, title: `Note: ${exName(b.exId)}`, text: b.note || '' });
  },
  noteSave() {
    const m = ui.modal;
    const ta = document.getElementById('mNote');
    const d = state.draft;
    if (!m || m.kind !== 'note' || !(ta instanceof HTMLTextAreaElement) || !d) return;
    const b = d.ex[m.bi];
    act(
      () => {
        if (b) b.note = within(ta.value, b.note || '', LIMITS.note).trim();
      },
      { inProgress: true }
    );
    closeModal();
    rerenderKeepScroll();
  }
};
