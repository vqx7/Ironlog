/* A lift's sheets inside a session and the log's smaller entries: loads filled in or grey, a calibration
   set, the heaviest available, a goal, the load step, a note, typed sets,
   cardio, a rest week, and an injury. Each change to the log goes through
   `act`; one to the session in progress alone leaves the caches as they are
   (inProgress). */

import type { DraftSet, Exercise } from './types';
import { isDate, isNum, numIn, today, uid } from './util';
import { JK, MK, injLabel, onMachines } from './library';
import { LIMITS, within } from './records';
import { cleanCardio } from './normalize';
import { effU, effW, greyU, greyW, setLoad } from './session';
import { rirScale } from './effort';
import {
  appU,
  draftMachine,
  EX,
  exName,
  fmtWOf,
  fromDOf,
  incOf,
  liftMachines,
  liftMax,
  liftU,
  listLabel,
  loadReadOf,
  typedBoundOf
} from './live';
import { NEW_MACHINE } from './analytics';
import { fmtDate } from './format';
import { state, ui } from './store';
import { act } from './act';
import { goalWords, machineName, machineSetup, newMachineKey, pendingMachine } from './display';
import { closeModal, openModal, render, renderModal, rerenderKeepScroll } from './page';
import { toast } from './toast';
import { carried } from './workstate';
import type { Tap } from './workstate';
import { blockWords, distIn, fillSets, parseSets, refreshBlock, refreshEx } from './worksets';
import { pickName, unname } from './machines';
import { stepOnPlans } from './routines';

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

/* A machine picked for a lift in a session (390 C): every block of it is on that machine, read from that machine's
   sessions alone. In a workout its target is read again, the sets done kept (a target from another machine is no
   target here), and a machine done on before brings its own kg or lb (as its weights were typed); New machine marks
   the lift's session new (nw), so it starts there, under the name given it if any (V, 2026-11-15). In an edit from
   History the pick names this session's machine and nothing else, never the sessions after it or the lift's unit: a
   machine done on before by its key, a new one by the session's own; its mark, which later sessions may follow, and
   the lift's unit stay as they are, and the readings follow once it is saved. One Undo step. */
/** Puts block `bi`'s lift on machine `k` (NEW_MACHINE: a new one, named `name` when given), as above. */
function pickMachine(bi: number, k: string | undefined, name: string, setup = ''): void {
  const d = state.draft;
  const b0 = d && d.ex[bi];
  const e = b0 && state.exercises.find(x => x.id === b0.exId);
  if (!d || !b0 || !e || !k || k === draftMachine(b0.exId)) return;
  const was = k === NEW_MACHINE ? null : liftMachines(b0.exId).find(x => x.key === k);
  if (k !== NEW_MACHINE && !was) return;
  const ed = d.editingId;
  // A new machine in an edit is named by the session's own key, which is the machine it is on already when it began one.
  if (ed && k === NEW_MACHINE && draftMachine(b0.exId) === ed) return;
  // The machine's unit: the one picked for the lift while on it, else the one its last session's heaviest set was entered in.
  const u = was && !ed ? was.mu : null;
  const key = k === NEW_MACHINE ? newMachineKey() : k;
  act(
    () => {
      // Marked in it, the app's unit too (liftUnit).
      if (u) e.unit = u;
      for (const b of d.ex)
        if (b.exId === b0.exId) {
          if (ed) pickName(b, k === NEW_MACHINE ? ed : k);
          else if (k === NEW_MACHINE) {
            b.nw = true;
            unname(b);
          } else {
            pickName(b, k);
            delete b.nw;
          }
        }
      // A machine added is named and set as its fields were left: cleared, it has neither.
      if (k === NEW_MACHINE && key) {
        nameMachine(e, key, name);
        setMachine(e, key, setup);
      }
      if (!ed) for (const b of d.ex) if (b.exId === b0.exId) refreshBlock(b);
    },
    { undo: true }
  );
  rerenderKeepScroll();
  const named = k === NEW_MACHINE ? name : machineName(e.id, k);
  toast(
    // The machine's label is one thing to read, so it is kept on one line (no-break spaces) when the message wraps.
    named
      ? `${e.name}: ${named.replace(/ /g, '\u00a0')}`
      : was
        ? `${e.name}: ${`${fmtDate(was.date)} · ${listLabel(e, was.w, was.u, true)} × ${was.r}`.replace(/ /g, '\u00a0')}`
        : `${e.name}: new machine`,
    true
  );
}

/* A lift's machine named, inside a change: the name under the machine's key, in its place among the others (none
   takes it away), and every other name kept as it is, whether or not its machine is in the log now: a workout set aside,
   a session in Recently deleted or a workout discarded and brought back by Undo brings its machine back, and with it its
   name. A name whose machine is gone is never offered or said (machineNamesOf). Absent once none is left, as on a lift
   never named. */
/** Names machine `key` of lift `e` (an empty name takes the name away), as above. */
function nameMachine(e: Exercise, key: string, name: string): void {
  const next: Record<string, string> = { ...(e.machines || {}) };
  if (name) next[key] = name;
  else delete next[key];
  if (Object.keys(next).length) e.machines = next;
  else delete e.machines;
}
/** How machine `key` of lift `e` is set (an empty text takes it away), kept as names are (nameMachine). */
function setMachine(e: Exercise, key: string, setup: string): void {
  const next: Record<string, string> = { ...(e.machineSet || {}) };
  if (setup) next[key] = setup;
  else delete next[key];
  if (Object.keys(next).length) e.machineSet = next;
  else delete e.machineSet;
}
/** A field's text in one line within `max` characters ('' when the field is not there). */
function lineOf(id: string, max: number): string {
  const f = document.getElementById(id);
  return f instanceof HTMLInputElement ? f.value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

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
                setLoad(x, g, greyU(b, i));
                if (g !== b.sw) carried.add(x);
              }
            } else if (!fill && (x.w === b.sw || carried.has(x))) {
              setLoad(x, null, null);
              carried.delete(x);
            }
          });
    });
    rerenderKeepScroll();
    toast(fill ? 'Loads filled in' : 'Loads in grey');
  },
  // A machine lift's Machine sheet, from its card or its ⋯ menu.
  machineOpen(t) {
    const b = Number(t.dataset.b);
    if (state.draft && state.draft.ex[b]) openModal({ kind: 'machine', b });
  },
  // A machine in the Machine sheet, tapped: the lift on it (pickMachine).
  machinePick(t) {
    if (ui.modal && ui.modal.kind === 'machine') closeModal();
    pickMachine(Number(t.dataset.b), t.dataset.k, '');
  },
  // A machine's pencil, or Add a machine: its name to type, in the same sheet.
  machineNaming(t) {
    const b = Number(t.dataset.b);
    if (state.draft && state.draft.ex[b] && t.dataset.k) openModal({ kind: 'machine', b, naming: t.dataset.k });
  },
  // A name given on another lift, tapped: typed into the field, to add or change before saving.
  machineChip(t) {
    const f = document.getElementById('mcName');
    if (f instanceof HTMLInputElement && t.dataset.v) {
      f.value = t.dataset.v;
      f.focus();
    }
  },
  /* A machine's name saved. Adding, a new machine is picked under it, as Add a machine's sheet says, in one Undo step;
     a machine already listed, or the new one already picked, is named and the list shown again. */
  machineNameSave(t) {
    const d = state.draft;
    const b = Number(t.dataset.b);
    const b0 = d && d.ex[b];
    const e = b0 && state.exercises.find(x => x.id === b0.exId);
    const k = t.dataset.k;
    if (!d || !b0 || !e || !k) return;
    const name = lineOf('mcName', LIMITS.name);
    const setup = lineOf('mcSet', LIMITS.machineSet);
    if (k === NEW_MACHINE && !pendingMachine(b0.exId)) {
      closeModal();
      pickMachine(b, k, name, setup);
      return;
    }
    const key = k === NEW_MACHINE ? newMachineKey() : k;
    const renamed = (machineName(e.id, key || '') || '') !== name,
      reset = (machineSetup(e.id, key || '') || '') !== setup;
    if (!key || (!renamed && !reset)) {
      openModal({ kind: 'machine', b });
      return;
    }
    act(
      () => {
        if (renamed) nameMachine(e, key, name);
        if (reset) setMachine(e, key, setup);
      },
      { undo: true }
    );
    openModal({ kind: 'machine', b });
    rerenderKeepScroll();
    toast(
      renamed ? (name ? `Named ${name}` : 'Machine name taken off') : setup ? 'Setup saved' : 'Setup taken off',
      true
    );
  },
  /* The unit beside a lift's loads, picked: the lift's equipment is marked in it and kept on the lift, so every screen
     and the next session read it; the lift's blocks in the workout read their targets again in it, and a load already
     typed keeps the unit it was typed in. A mark is kept in the app's unit too, so the lift is on that unit's own
     weights whatever the app's or Your gym's unit (liftModelIn): a kg machine in a gym in lb is marked kg with the app
     in kg. Taken off when it matched the app's unit, the mark put the lift back on Your gym's lb plates, and no pick
     put it on kg's. */
  unitOpen(t) {
    const b = Number(t.dataset.b);
    if (state.draft && state.draft.ex[b]) openModal({ kind: 'unit', b });
  },
  liftUnit(t) {
    const d = state.draft;
    const b = d && d.ex[Number(t.dataset.b)];
    const e = b && state.exercises.find(x => x.id === b.exId);
    if (ui.modal && ui.modal.kind === 'unit') closeModal();
    if (!d || !b || !e) return;
    // The unit picked in the exercise's sheet. One the lift's weights are in already changes nothing: the unit it is
    // marked in, or the app's for a lift following it, with Your gym in that unit or none set.
    const to: 'kg' | 'lb' =
      t.dataset.v === 'kg' || t.dataset.v === 'lb' ? t.dataset.v : liftU(e) === 'kg' ? 'lb' : 'kg';
    const g = state.settings.gym;
    if (to === e.unit || (!e.unit && to === appU() && (!g || g.u === to))) return;
    /* On a machine, cable or Smith lift the unit is that machine's too, so picking the machine again brings it
       (pickMachine): kept beside those of the lift's other machines, a machine no session is on any more left out. */
    const on = onMachines(e) ? draftMachine(b.exId) : null;
    const key = on === NEW_MACHINE ? newMachineKey() : on;
    const has = new Set(liftMachines(b.exId).map(x => x.key));
    act(
      () => {
        e.unit = to;
        if (key)
          e.machineU = {
            ...Object.fromEntries(Object.entries(e.machineU || {}).filter(([k]) => has.has(k) && k !== key)),
            [key]: to
          };
        /* A block not started reads its target again in the new unit; one with a set done keeps what it started
           with, as for a change of the app's unit, its words said again in the new unit, so the sets done at the
           load asked still count; an edit of a saved session reads nothing again of today's. */
        for (const x of d.ex)
          if (x.exId === b.exId) {
            if (!d.editingId && !x.sets.some(s => s.done)) refreshBlock(x);
            else blockWords(x);
          }
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
    const set: DraftSet = {
      w: null,
      r: tot,
      rir: 0,
      warm: false,
      drop: false,
      done: true,
      cal: { at, pred }
    };
    // Typed in the lift's unit, which the sheet asks it in, and kept with it.
    setLoad(set, kg(ex, Math.max(0, w || 0)), liftU(ex));
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
    /* Saved as it was shown, it is kept as set, with its unit: one set in the other unit is shown as its match on this
       unit's equipment (liftMax), and saved as that match it would move with every switch of units. */
    if (e.maxLoad != null && n != null && String(numIn(fmtWOf(e, liftMax(e) ?? 0))) === String(n)) {
      closeModal();
      return;
    }
    if (n != null && n < 0) {
      toast('Enter a load of 0 or more, or leave it blank');
      return;
    }
    closeModal();
    // Kept as entered, in the lift's unit, which the field shows it in.
    act(() => {
      if (n != null && n > 0) {
        e.maxLoad = kg(e, Math.min(n, liftU(e) === 'lb' ? MAX_LOAD.lb : MAX_LOAD.kg));
        e.maxLoadU = liftU(e);
      } else {
        delete e.maxLoad;
        delete e.maxLoadU;
      }
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
    /* A load saved as it was shown is kept as set, with its unit: one set in the other unit is shown as its match on
       this unit's equipment. Any other is kept as entered, in the lift's unit, which the field shows it in. */
    const was = e.goal;
    const same = !!was && w != null && String(numIn(fmtWOf(e, loadReadOf(e, was.w, e.goalU)))) === String(w);
    const goal = { w: same && was ? was.w : kg(e, w || 0), r };
    const gu = same ? e.goalU : liftU(e);
    act(
      () => {
        e.goal = goal;
        if (goal.w > 0 && gu) e.goalU = gu;
        else delete e.goalU;
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
        delete e.goalU;
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
    if (n == null || n < 0) {
      toast('Enter a step, or 0 to keep the load');
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
    // Kept as entered, in the lift's unit, which the field shows it in; on every day of its plans (stepOnPlans).
    act(() => {
      e.inc = inc;
      if (inc > 0) e.incU = liftU(e);
      else delete e.incU;
      stepOnPlans(state.routines, e.id, inc);
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
    const got = parseSets(txt, EX(b.exId), defW, null, rirScale() === 'rpe', fi >= 0 ? effU(b, fi) : null);
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
    // Read before the sheet closes: the machine's fields, on a machine lift's note.
    const named = document.getElementById('mcName') ? lineOf('mcName', LIMITS.name) : null;
    const setup = lineOf('mcSet', LIMITS.machineSet);
    act(
      () => {
        if (b) b.note = within(ta.value, b.note || '', LIMITS.note).trim();
      },
      { inProgress: true }
    );
    closeModal();
    // The machine named or set here is kept with the machine, an Undo step of its own, as the Machine sheet keeps it.
    const e = b && state.exercises.find(x => x.id === b.exId);
    const k = b && named != null ? draftMachine(b.exId) : null;
    const key = k === NEW_MACHINE ? newMachineKey() : k;
    if (e && key && named != null) {
      const renamed = ((e.machines && e.machines[key]) || '') !== named,
        reset = ((e.machineSet && e.machineSet[key]) || '') !== setup;
      if (renamed || reset) {
        act(
          () => {
            if (renamed) nameMachine(e, key, named);
            if (reset) setMachine(e, key, setup);
          },
          { undo: true }
        );
        rerenderKeepScroll();
        toast(named ? `Machine: ${named}` : 'Machine name taken off', true);
        return;
      }
    }
    rerenderKeepScroll();
  }
};
