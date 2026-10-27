/* The exercise picker's choice and the exercise editor (r63, from the legacy
   script's 16-engine.js, 24-sheets.js and 27-actions.js): an exercise added
   to a session or a routine day, a swap in either, Pick for me's addition,
   and a new or saved exercise. Each change to the log goes through `act`;
   a change to the session in progress alone leaves the caches as they are
   (inProgress), as the legacy script's save of the session did. */

import { uid, numIn } from './util';
import { BWF, MK, bwShare } from './library';
import { dayLabel, fixSupersets, trainOn } from './routines';
import type { DraftBlock, Exercise, Plan, Routine } from './types';
import { joinRows, joinable } from './session';
import { platesMode } from './gym';
import { LIMITS } from './records';
import { EX, U, activeRoutine, defPlan, exName, fmtW, fromD, planFor, stepRead } from './live';
import { state, ui } from './store';
import type { ExEdit, ExEditSheet, Modal, PickerModal } from './modals';
import { act } from './act';
import { curRoutineB, findItem, newItem } from './display';
import { closeModal, confirmBox, openModal, renderModal, rerenderKeepScroll } from './page';
import { toast } from './toast';
import { keepOpen } from './workstate';
import type { Tap } from './workstate';
import { newBlock, refreshEx, rowBlank } from './worksets';

/** The most sets an exercise added by Pick for me may take. */
const MAX_SETS = 30;
/** The heaviest load a lift's limit may be, by the unit typed in. */
const MAX_LOAD = { lb: 4000, kg: 2000 } as const;
/** A share of bodyweight typed, as a percent: the most, and how far from the lift's own it must be to be kept. */
const BWF_PCT = { most: 150, off: 0.005, whole: 100 } as const;

/* What a swapped-in exercise is done for (r27). It keeps the slot's set
   count and superset. Its range, RIR, rest and step come from where it
   already sits in the routine, or from its own default when it is the other
   kind (a timed hold for reps, or reps for a hold: a plank swapped in for
   bench used to hold for 6 to 10 seconds); otherwise it fills the slot as
   planned. */
/** The plan an exercise swapped in for another takes in a slot. */
export function swapPlan<P extends Partial<Plan>>(
  p: P,
  fromId: string,
  toId: string,
  R0?: Routine | null,
  dayId?: string | null
): P & Partial<Plan> {
  const R = R0 || activeRoutine();
  const inR = R.days.some(d => d.items.some(it => it.exId === toId));
  if (!inR && !!EX(fromId).timed === !!EX(toId).timed) return { ...p };
  const q = inR ? planFor(toId, R, dayId) : defPlan(toId);
  const o: P & Partial<Plan> = { ...p, repMin: q.repMin, repMax: q.repMax, rir: q.rir, rest: q.rest, inc: q.inc };
  if (q.jump != null) o.jump = q.jump;
  else delete o.jump;
  return o;
}

/** Scrolls to an exercise just added to the session and marks it, instead of leaving it somewhere below the fold. */
function afterAdd(bi: number): void {
  rerenderKeepScroll();
  const el = document.getElementById('blk-' + bi);
  if (!el) return;
  let calm = false;
  try {
    calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    // A browser without media queries moves as it can.
  }
  try {
    el.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  } catch (e) {
    // An old browser takes no options.
    el.scrollIntoView();
  }
  // The screen keeps the block between draws (r60), so the mark goes when the flash ends.
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  el.addEventListener('animationend', () => el.classList.remove('flash'), { once: true });
}

/* One place that applies a choice from the exercise picker, or an exercise
   just created from it, for every mode the picker opens in. Adding to a
   session scrolls to the new exercise and marks it. */
/** Applies the picker's choice: added to a routine day or the session, or swapped in for an item or the session's exercise. */
export function applyPick(m: PickerModal | null | undefined, id: string | undefined): void {
  if (!m || !id) return;
  if (m.mode === 'addDay') {
    const R = curRoutineB();
    const di = m.day ?? -1;
    const d = R.days[di];
    closeModal();
    if (!d) {
      rerenderKeepScroll();
      return;
    }
    act(() => {
      d.items.push(newItem(id));
      Object.assign(d, trainOn(d));
    });
    rerenderKeepScroll();
    toast(`${exName(id)} added to ${dayLabel(R, di)}`);
    return;
  }
  if (m.mode === 'swapItem') {
    const f = findItem(m.uid);
    if (f) {
      const day = f.r.days[f.di];
      const q = swapPlan(f.it, f.it.exId, id, f.r, day ? day.id : undefined);
      act(() => {
        Object.assign(f.it, { repMin: q.repMin, repMax: q.repMax, rir: q.rir, rest: q.rest, inc: q.inc });
        if (q.jump != null) f.it.jump = q.jump;
        else delete f.it.jump;
        f.it.exId = id;
      });
    }
    closeModal();
    rerenderKeepScroll();
    return;
  }
  const d = state.draft;
  closeModal();
  if (!d) {
    rerenderKeepScroll();
    return;
  }
  // A plan's superset is null unless a routine item gave one (DEFAULT_PLAN's), as a session's block holds it.
  const half = (p: Plan): DraftBlock['plan'] => ({
    ...p,
    ss: p.ss ?? null,
    ...(d.deload || d.light ? { sets: Math.max(1, Math.ceil(p.sets / 2)) } : {})
  });
  if (m.mode === 'addBlock') {
    const p0 = planFor(id, null, d.dayId, false, d.date);
    const nb = newBlock(id, half(p0), { deload: !!d.deload, light: !!d.light, before: d.date });
    if (d.deload || d.light) nb.full = +p0.sets;
    const li = d.ex.length - 1;
    const last = d.ex[li];
    if (last && joinable(last, nb)) {
      const had = last.sets.length;
      const plan = { ...last.plan },
        did = d.id;
      let added: ReturnType<typeof joinRows> = [];
      act(
        () => {
          added = joinRows(last, nb);
        },
        {
          inProgress: true,
          undo: () => {
            const dd = state.draft;
            if (!dd || dd.id !== did) return false;
            const y = dd.ex.find(x => x === last);
            if (!y || added.some(x => x.done)) return false;
            y.sets = y.sets.filter(x => !added.includes(x));
            y.plan = plan;
            return y.sets.length === had;
          }
        }
      );
      afterAdd(li);
      toast(`${EX(id).name}: ${added.length} more set${added.length === 1 ? '' : 's'}, with the ones above`, true);
      return;
    }
    act(() => d.ex.push(nb), { inProgress: true });
    afterAdd(d.ex.length - 1);
    return;
  }
  /* Swapping used to replace the whole block, so sets already logged on the
     old exercise vanished. Now logged sets stay with the exercise they were
     done on, and the new one takes over the sets still to do. The count comes
     from the rows the exercise has now, not the routine's plan: the plan's
     count undid Short on time, + Set and − Set (r24). Since r54 nothing is
     marked: the replacement is read by its own usual, as every lift is. */
  if (m.mode === 'swapBlock') {
    const bi = m.b ?? -1;
    const b = d.ex[bi];
    if (!b) {
      rerenderKeepScroll();
      return;
    }
    const orig: DraftBlock = structuredClone(b);
    const did = d.id;
    // Sets ticked or typed stay with the exercise they were done on (r25: typed, not ticked, used to vanish).
    const done = b.sets.filter(x => !rowBlank(b, x));
    const left = b.sets.filter(x => !x.warm && !x.drop && rowBlank(b, x)).length;
    const rows = b.sets.filter(x => !x.warm && !x.drop).length;
    // r55, the audit: it added the new lift with one set "for the sets left", none being left.
    if (done.length && !left && !m.all) {
      const nn = EX(id).name;
      confirmBox(
        `Every set of ${EX(b.exId).name} is logged`,
        `Logged on the wrong exercise? Move the sets to ${nn}. Or add ${nn} after it.`,
        'Move the sets',
        () => applyPick({ ...m, all: 'move' }, id),
        false,
        { label: `Add ${nn}`, fn: () => applyPick({ ...m, all: 'add' }, id) }
      );
      return;
    }
    const nb = newBlock(
      id,
      {
        ...swapPlan(b.plan, b.exId, id, null, d.dayId),
        sets: done.length && left ? left : Math.max(1, rows || +b.plan.sets || 1)
      },
      { deload: !!d.deload, light: !!d.light, before: d.date }
    );
    if (m.all === 'move') {
      nb.sets = b.sets;
      if (b.bid) nb.bid = b.bid;
      act(
        () => {
          d.ex[bi] = nb;
          fixSupersets(d.ex.map(x => x.plan));
        },
        {
          inProgress: true,
          undo: () => {
            const dd = state.draft;
            if (!dd || dd.id !== did) return false;
            const i = dd.ex.indexOf(nb);
            if (i < 0) return false;
            dd.ex[i] = orig;
            return true;
          }
        }
      );
      rerenderKeepScroll();
      toast(`Your sets are on ${EX(id).name} now`, true);
      return;
    }
    nb.swappedFrom = b.swappedFrom || b.exId;
    if (nb.swappedFrom === id) nb.swappedFrom = null;
    /* Swapped to the exercise just after it (or just before it, when nothing
       stays behind): the sets go to that one, so the lift is one exercise. */
    const ni = done.length
      ? joinable(d.ex[bi + 1], nb)
        ? bi + 1
        : -1
      : joinable(d.ex[bi - 1], nb)
        ? bi - 1
        : joinable(d.ex[bi + 1], nb)
          ? bi + 1
          : -1;
    const y = ni >= 0 ? d.ex[ni] : undefined;
    if (y) {
      const plan = { ...y.plan };
      let added: ReturnType<typeof joinRows> = [];
      act(
        () => {
          added = joinRows(y, nb);
          if (done.length) {
            b.sets = done;
            b.plan = { ...b.plan, sets: done.filter(x => !x.warm && !x.drop).length || 1 };
          } else keepOpen(() => d.ex.splice(bi, 1));
          fixSupersets(d.ex.map(x => x.plan));
        },
        {
          inProgress: true,
          undo: () => {
            const dd = state.draft;
            if (!dd || dd.id !== did) return false;
            const yy = dd.ex.find(x => x === y);
            if (!yy || added.some(x => x.done)) return false;
            yy.sets = yy.sets.filter(x => !added.includes(x));
            yy.plan = plan;
            if (done.length) {
              const i = dd.ex.findIndex(x => x === b);
              if (i < 0) return false;
              dd.ex[i] = orig;
            } else dd.ex.splice(dd.ex.indexOf(yy) + (ni < bi ? 1 : 0), 0, orig);
            return true;
          }
        }
      );
      rerenderKeepScroll();
      toast(
        done.length
          ? `${EX(id).name}: the sets left join the ones below. Your sets so far stay with ${EX(orig.exId).name}.`
          : `Swapped to ${EX(id).name}: its sets are together now`,
        true
      );
      return;
    }
    act(
      () => {
        if (done.length) {
          b.sets = done;
          b.plan = { ...b.plan, sets: done.filter(x => !x.warm && !x.drop).length || 1 };
          keepOpen(() => d.ex.splice(bi + 1, 0, nb));
        } else d.ex[bi] = nb;
        fixSupersets(d.ex.map(x => x.plan));
      },
      {
        inProgress: true,
        undo: () => {
          const dd = state.draft;
          if (!dd || dd.id !== did) return false;
          const at = dd.ex.findIndex(x => x === nb);
          if (at < 0 || nb.sets.some(x => x.done)) return false;
          if (done.length) {
            dd.ex.splice(at, 1);
            const i = dd.ex.findIndex(x => x === b);
            if (i >= 0) dd.ex[i] = orig;
            else return false;
          } else dd.ex[at] = orig;
          return true;
        }
      }
    );
    rerenderKeepScroll();
    toast(
      done.length && left
        ? `${EX(id).name} added for the sets left. Your sets so far stay with ${EX(orig.exId).name}.`
        : done.length
          ? `${EX(id).name} added after ${EX(orig.exId).name}`
          : `Swapped to ${EX(id).name}`,
      true
    );
    return;
  }
  rerenderKeepScroll();
}

/** A new custom exercise as the editor opens it. */
const newEx = (name: string, primary: string): ExEdit => ({
  id: 'c_' + uid(),
  name,
  primary,
  secondary: [],
  equip: 'cable',
  bw: false,
  rare: false,
  note: '',
  custom: true,
  archived: false,
  perSide: false
});
/** The editor sheet open, or null. */
const editorOpen = (): (ExEditSheet & { kind: 'exEdit' }) | null => {
  const m = ui.modal;
  return m && m.kind === 'exEdit' ? m : null;
};
/** Whether a lift has sets in the log, or in the session open, whose load reads one way of the line: below 0 (machine help) or above it (added weight). */
const hasSets = (id: string, test: (w: number) => boolean): boolean =>
  state.sessions.some(x => x.ex.some(b => b.exId === id && b.sets.some(q => test(+q.w)))) ||
  !!(state.draft && state.draft.ex.some(b => b.exId === id && b.sets.some(q => test(+(q.w ?? 0)))));

/** The picker's and the exercise editor's taps, by data-act. */
export const PICK_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  bSwap(t) {
    const bi = Number(t.dataset.b);
    const b = state.draft && state.draft.ex[bi];
    if (!b) return;
    openModal({ kind: 'picker', mode: 'swapBlock', b: bi, title: 'Swap exercise', q: '', m: EX(b.exId).primary });
  },
  pickSession() {
    openModal({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' });
  },
  pickDay(t) {
    const di = Number(t.dataset.day);
    openModal({
      kind: 'picker',
      mode: 'addDay',
      day: di,
      title: `Add to ${dayLabel(curRoutineB(), di)}`,
      q: '',
      m: ''
    });
  },
  iSwap(t) {
    const f = findItem(t.dataset.uid);
    openModal({
      kind: 'picker',
      mode: 'swapItem',
      uid: t.dataset.uid,
      title: 'Swap exercise',
      q: '',
      m: f ? EX(f.it.exId).primary : ''
    });
  },
  pickDo(t) {
    const m = ui.modal;
    applyPick(m && m.kind === 'picker' ? m : null, t.dataset.ex);
  },
  /* Pick for me, inside a session: what to add next. */
  pickEx() {
    if (!state.draft) return;
    openModal({ kind: 'pickEx' });
  },
  pickExAdd(t) {
    const d = state.draft;
    if (!d) return;
    const id = t.dataset.ex || '';
    if (!state.exercises.some(e => e.id === id)) {
      closeModal();
      return;
    }
    const p = planFor(id, null, d.dayId, false, d.date);
    const n = Math.round(+(t.dataset.sets ?? NaN)),
      full = Math.round(+(t.dataset.full ?? NaN));
    if (n >= 1 && n <= MAX_SETS) p.sets = n;
    const nb = newBlock(id, { ...p, ss: p.ss ?? null }, { deload: !!d.deload, light: !!d.light, before: d.date });
    if ((d.deload || d.light) && full >= 1 && full <= MAX_SETS) nb.full = full;
    act(() => d.ex.push(nb), { inProgress: true });
    closeModal();
    afterAdd(d.ex.length - 1);
    toast(`${exName(id)} added: ${p.sets} set${p.sets === 1 ? '' : 's'}`);
  },
  exNew() {
    openModal({ kind: 'exEdit', isNew: true, e: newEx('', 'chest') });
  },
  exNewFromPicker() {
    const back = ui.modal;
    if (!back || back.kind !== 'picker') return;
    openModal({ kind: 'exEdit', isNew: true, back, e: { ...newEx((back.q || '').trim(), back.m || ''), incRaw: '' } });
  },
  // Back to the sheet this one was opened from, else closed: the exercise editor's, and an account sheet's opened from a problem report (r55).
  exBack() {
    const m = ui.modal;
    const back: Modal | null | undefined = m && (m.kind === 'exEdit' || m.kind === 'account') ? m.back : null;
    if (back) openModal(back);
    else closeModal();
  },
  exEdit(t) {
    ui.exBody = false;
    // The log's own exercise: a deleted one has nothing to edit.
    const src = state.exercises.find(x => x.id === t.dataset.ex);
    if (!src) return;
    const e: ExEdit = structuredClone(src);
    e.incRaw = e.inc != null ? fmtW(stepRead(e.inc)) : '';
    e.bwfRaw = String(Math.round(bwShare(e) * BWF_PCT.whole));
    e.maxRaw = e.maxLoad != null ? fmtW(e.maxLoad) : '';
    e.barRaw = e.barKg != null ? fmtW(e.barKg) : '';
    openModal({ kind: 'exEdit', isNew: false, e });
  },
  secToggle(t) {
    const m = editorOpen();
    if (!m) return;
    const e = m.e;
    const k = t.dataset.m || '';
    e.secondary = e.secondary.includes(k) ? e.secondary.filter(x => x !== k) : [...e.secondary, k];
    renderModal();
  },
  exSave() {
    const m = editorOpen();
    if (!m) return;
    const e = m.e;
    e.name = (e.name || '').trim();
    if (!e.name) {
      toast('Give the exercise a name');
      return;
    }
    // A quick create from search used to default to Chest, so a curl made in a hurry was counted as chest work from then on.
    if (!MK.some(k => k === e.primary)) {
      toast('Pick the main muscle it trains');
      const el = document.querySelector('[data-ebind="primary"]');
      if (el instanceof HTMLElement)
        try {
          el.focus();
        } catch (x) {
          // Focus is best effort.
        }
      return;
    }
    e.secondary = e.secondary.filter(k => k !== e.primary);
    {
      const n = numIn(e.incRaw);
      e.inc = n != null && n > 0 ? Math.min(Number(fromD(n)), LIMITS.step) : null;
      delete e.incRaw;
    }
    {
      const n = numIn(e.maxRaw);
      if (n != null && n > 0) e.maxLoad = Number(fromD(Math.min(n, U() === 'lb' ? MAX_LOAD.lb : MAX_LOAD.kg)));
      else delete e.maxLoad;
      delete e.maxRaw;
    }
    {
      const n = numIn(e.barRaw);
      if (n != null && n > 0 && platesMode(e) === 'bar') e.barKg = Math.min(Number(fromD(n)), LIMITS.barKg);
      else delete e.barKg;
      delete e.barRaw;
    }
    {
      const n = numIn(e.bwfRaw);
      delete e.bwfRaw;
      const def = BWF[e.id] != null ? BWF[e.id] : 1;
      if (e.bw && n != null && n > 0 && n <= BWF_PCT.most && Math.abs(n / BWF_PCT.whole - Number(def)) > BWF_PCT.off)
        e.bwf = Math.round(n) / BWF_PCT.whole;
      else delete e.bwf;
    }
    if (e.timed !== true) delete e.timed;
    if (e.kind !== 'compound' && e.kind !== 'iso') delete e.kind;
    const pl = e.plates;
    e.plates = pl === 'bar' || pl === 'side' || pl === 'sleeve' || pl === 'none' ? pl : null;
    const ld = e.load;
    if ((ld === 'each' || ld === 'total' || ld === 'side' || ld === 'stack') && !e.bw) e.load = ld;
    else delete e.load;
    // Sets already logged with machine help are below 0; the exercise must stay assisted to read them right.
    if (!m.isNew && !(e.bw && e.assist) && hasSets(e.id, w => w < 0)) {
      toast('This exercise has sets logged with machine help, so it stays assisted.');
      return;
    }
    // The reverse: sets with added weight would read as help once Assisted is on, so it goes on a separate exercise.
    const old = state.exercises.find(x => x.id === e.id);
    const wasA = !m.isNew && !!(old && old.assist);
    if (!m.isNew && e.bw && e.assist && !wasA && hasSets(e.id, w => w > 0)) {
      toast(
        'This exercise has sets with added weight. Use Assisted Pull-up or Assisted Dip, or a new exercise, for machine help.'
      );
      return;
    }
    const saved = savedExercise(e);
    act(() => {
      if (m.isNew) state.exercises.push(saved);
      else {
        const i = state.exercises.findIndex(x => x.id === e.id);
        if (i >= 0) state.exercises[i] = saved;
      }
    });
    // After the change, so the session's blocks read the exercise as saved.
    if (!m.isNew) refreshEx(e.id);
    // Created from a picker: it goes straight where the picker was adding or swapping, instead of back to the list for a second tap.
    const back = m.back;
    if (m.isNew && back && back.kind === 'picker') {
      applyPick(back, e.id);
      toast(
        back.mode === 'addBlock' || back.mode === 'addDay'
          ? `${e.name} created and added`
          : `${e.name} created and swapped in`
      );
      return;
    }
    if (back) {
      back.q = e.name;
      openModal(back);
    } else closeModal();
    rerenderKeepScroll();
    toast(m.isNew ? 'Exercise created' : 'Exercise saved');
  }
};

/* The editor's exercise as the log keeps it, once Save has read its fields
   above: the kind, load, timed and assisted fields kept only where they hold
   a saved value (an assisted box left unticked is absent, as normalize reads
   it), the rest as the editor holds them. */
function savedExercise(e: ExEdit): Exercise {
  const { kind, load, timed, assist, ...rest } = e;
  return {
    ...rest,
    ...(kind === 'compound' || kind === 'iso' ? { kind } : {}),
    ...(load === 'each' || load === 'total' || load === 'side' || load === 'stack' ? { load } : {}),
    ...(timed === true ? { timed } : {}),
    ...(assist === true ? { assist } : {})
  };
}
