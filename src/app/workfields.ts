/* The session screen's fields (CL-1, split from workout.ts): a load, reps, effort or note typed, auto-mark when a
   field is left, the keys, a load field made ready to be typed over, and the listeners the screen starts with
   (workoutStart). Each change to the session in progress goes through act. */

import { act } from './act';
import { CARDIOL, CWHENL } from './library';
import { isMissed } from './formulas';
import { today, numIn, isDate, EPS } from './util';
import { LOAD_MAX, LOAD_MIN } from './normalize';

import { log } from './storage';
import { EX, fromD } from './live';
import { state, ui } from './store';

import { drawing, fieldShown } from './view';
import type { Field } from './view';

import {
  W,
  blkIdx,
  blkRef,
  setRef,
  carried,
  draftSet,
  greyIn,
  needHere,
  onRedraw,
  redraw,
  unloaded
} from './workstate';
import {
  acceptGrey,
  autoPending,
  carryLoad,
  distIn,
  fillLoads,
  mixCheck,
  moveBlock,
  refreshBlock,
  rirClose,
  setDone,
  liftsOn,
  stepAt,
  doneChanged,
  onLiftDraw
} from './worksets';
import { LIMITS, within } from './records';

import { rerenderKeepScroll } from './page';

import { toast } from './toast';
import { drawNow } from './workout';
/** A touch this many milliseconds ago is where the lifter went (an iPhone's buttons never take focus). */
const TOUCH_MS = 700;
/** With the effort strip about to open, an auto-mark waits this long for it before it marks the set. */
const STRIP_WAIT_MS = 2000;

/* Where the last touch landed, for the routes auto-mark reads and for a load
   field's selection (the page's pointerdown, capture phase). A tap on a load
   field that already has focus places the caret, as any tap does, so the next
   key no longer replaces the number. */
function noteDown(e: Event): void {
  W.lastDown = { el: e.target instanceof Element ? e.target : null, t: Date.now() };
  W.selAgain = null;
  if (W.replaceNext && e.target === W.replaceNext && document.activeElement === W.replaceNext) W.replaceNext = null;
}

/* What a field of the session screen typed changes, on every keystroke:
   clamped as stored (the field keeps what was typed so the lifter is not
   fought mid-keystroke, but history can never take a negative load or an
   impossible rep count), saved once the typing pauses. Whole reps: 8.5 is 8,
   a partial rep not a rep (r55). On an assisted lift the number is the help.
   A load typed is the lifter's, no longer carried. The grey numbers, the
   progress line and the plates follow at once, as the legacy patches had
   them; a name or notes are drawn at the next draw, as before. */
/** A keystroke in one of the session screen's fields; whether it was one. */
export function workoutInput(t: Field): boolean {
  const d = state.draft;
  if (!d) return false;
  if (t.dataset.cf && d.cardio) {
    const c = d.cardio[Number(t.dataset.c)];
    if (!c) return true;
    const k = t.dataset.cf;
    act(
      () => {
        if (k === 'min') {
          const n = numIn(t.value);
          c.min = n == null || n <= 0 ? null : Math.min(Math.round(n), LIMITS.minutes);
        } else if (k === 'hr') {
          const n = numIn(t.value);
          c.hr = n != null && n >= LIMITS.hr[0] && n <= LIMITS.hr[1] ? Math.round(n) : null;
        } else if (k === 'dist') {
          const v = distIn(t.value);
          if (v == null) delete c.dist;
          else c.dist = v;
        } else if (k === 'kind' && CARDIOL[t.value]) c.kind = t.value;
        else if (k === 'when' && CWHENL[t.value]) c.when = t.value;
      },
      { inProgress: true, soon: true }
    );
    return true;
  }
  if (t.dataset.f === 'w' || t.dataset.f === 'r') {
    // A set's load and reps are text inputs.
    if (!(t instanceof HTMLInputElement)) return true;
    const s = draftSet(t);
    if (!s) return true;
    greyTyped(t);
    if (W.selAgain === t) W.selAgain = null;
    if (W.replaceNext === t) W.replaceNext = null;
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const n = numIn(t.value);
    act(
      () => {
        if (t.dataset.f === 'w') {
          const bx = d.ex[bi];
          const as = !!bx && !!EX(bx.exId).assist;
          /* fromD of a number is a number (null only for no number), so 0 never
             stands in. Within the bounds a save keeps, in kilograms (r61; until
             then 660 of help and 20000 in the unit typed). */
          s.w =
            n == null
              ? null
              : as
                ? -Math.min(fromD(Math.abs(n)) ?? 0, -LOAD_MIN)
                : Math.min(fromD(Math.max(n, 0)) ?? 0, LOAD_MAX);
          if (s.w === 0) s.w = 0;
          carried.delete(s);
        } else s.r = n == null ? null : Math.min(Math.max(Math.floor(n + EPS), 0), LIMITS.reps);
      },
      { inProgress: true, soon: true }
    );
    if (t.dataset.f === 'w') W.platesAt = { b: blkRef(bi), s: si };
    W.onSet = setRef(bi, si);
    onLiftDraw(bi, redraw);
    return true;
  }
  const b = t.dataset.bind;
  if (b === 'draftNotes') {
    act(
      () => {
        d.notes = within(t.value, d.notes || '', LIMITS.note);
      },
      { inProgress: true, soon: true }
    );
    return true;
  }
  if (b === 'draftName') {
    act(
      () => {
        d.dayName = t.value.trim() ? t.value.slice(0, LIMITS.name) : 'Freestyle';
      },
      { inProgress: true, soon: true }
    );
    return true;
  }
  return false;
}

/* A field of the session screen left with a new value. Reps: the field shows
   the reps stored (r55); a done set whose reps were cleared is undone, once
   the new rows are in place (a field taken away mid-draw fires its change as
   if left); one typed as 0 is a missed set, ticked as typed (r55, V), and a
   ticked set changed to 0 asks, as a tick does, when its load is light
   (r55.1, the spec review); cleared, it is marked, so leaving the field does
   not tick it again at the grey reps (r55, the audit). Heading for this
   row's load: ticked when the load is left, so the load is never written
   into the field being typed in (r55, the audit: 105 typed there became
   101050); heading for this row's RIR box: ticked when its strip closes (or
   after 2 s if it never opened), by identity, so a later tick cannot run this
   one (r45). A load: a ticked set's load changed to one far off asks too,
   unticked until answered; Log it, or the load fixed after Fix it, ticks it
   again, its rest not started over (r55; the second review). The date: last
   time and the targets are read as of the session's date, so a new date
   reads them again; typed and ticked sets are left alone. */
/** A change in one of the session screen's fields; whether it was one. */
export function workoutChange(t: Field): boolean {
  const d = state.draft;
  if (!d) return false;
  if (t.dataset.cf && d.cardio) {
    const c = d.cardio[Number(t.dataset.c)];
    if (c) {
      const k = t.dataset.cf;
      act(
        () => {
          if (k === 'kind' && CARDIOL[t.value]) c.kind = t.value;
          else if (k === 'when' && CWHENL[t.value]) c.when = t.value;
        },
        { inProgress: true }
      );
    }
    return true;
  }
  if (t.dataset.f === 'r') {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const s = draftSet(t);
    if (!s) return true;
    if (drawing()) {
      if (s.done && s.r == null)
        queueMicrotask(() => {
          const b2 = state.draft && state.draft.ex[bi];
          const s2 = b2 && b2.sets[si];
          if (s2 && s2.done && s2.r == null) setDone(bi, si, false);
        });
      return true;
    }
    const near = (sel: string): boolean =>
      !d.past && !!W.lastDown.el && Date.now() - W.lastDown.t < TOUCH_MS && !!W.lastDown.el.closest(sel);
    if (s.done && s.r == null) {
      setDone(bi, si, false);
      t.dataset.cleared = '1';
    } else if ((state.settings.autoDone || d.past) && !s.done && (+(s.r ?? 0) > 0 || isMissed(s))) {
      const toRir = near(`.rirb[data-b="${bi}"][data-s="${si}"]`);
      const toW = !toRir && near(`.sg input[data-f="w"][data-b="${bi}"][data-s="${si}"]`);
      // The set's own minus and plus are not leaving it: they change it, unticked (the review of 2.38, REV7-5).
      const toStep = !toRir && !toW && near(`.stepr-b[data-b="${bi}"][data-s="${si}"]`);
      if (toStep) W.pendAuto = null;
      else if (toW) W.pendAuto = { b: blkRef(bi), s: si };
      else if (toRir) {
        const p = { b: blkRef(bi), s: si };
        W.pendAuto = p;
        setTimeout(() => {
          if (W.pendAuto === p && !document.querySelector('.rirstrip')) autoPending();
        }, STRIP_WAIT_MS);
      } else {
        W.lastAuto = { b: blkRef(bi), s: si, t: Date.now() };
        setDone(bi, si, true);
      }
    } else if (s.done) doneChanged(bi, si, 'r');
    redraw();
    return true;
  }
  if (t.dataset.f === 'w') {
    const s = draftSet(t);
    if (!s) return true;
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    /* A ticked set's load cleared is unticked, as a ticked set's reps
       cleared are (V on r61's preview, 2026-10-26: set 2 ticked on its grey
       225, its load then cleared, stayed ticked with no weight, and the
       recap read it as 0 x 8). It then waits for its weight, as a tick made
       before one is typed does (344): a load typed ticks it again (the
       independent review of r62: typing 230 left it unticked, and Finish
       offered to save without it), and so does the checkmark on its grey
       load, as the same set, its rest not started over (unloaded, setDone).
       So a ticked set of a lift that takes a load always has one. A
       bodyweight lift's added load and a timed hold's may be none, as
       noLoadYet says. */
    const lift = EX(d.ex[bi] ? d.ex[bi].exId : '');
    if (s.done && s.w == null && !lift.bw && !lift.timed) {
      setDone(bi, si, false);
      unloaded.add(s);
      W.needAt = { b: blkRef(bi), s: si };
      redraw();
      return true;
    }
    const refix = ui.refix;
    const rf = !!refix && refix.s === si && blkIdx(refix.b) === bi;
    if (rf) ui.refix = null;
    /* A tick that waited for its weight (344) is made once one is typed; the
       checkmark tapped next keeps it, as after auto-mark. Only while the set
       still has its reps (or a 0 typed, a missed set): reps cleared since,
       the tick has nothing to log and is dropped (the independent review of
       r60: 135 x 0 was saved as a missed set the lifter never logged). */
    const typed = needHere(bi, si) && s.w != null;
    if (typed) W.needAt = null;
    const need = typed && (+(s.r ?? 0) > 0 || isMissed(s));
    if (s.done) {
      if (doneChanged(bi, si, 'w')) return true;
    } else if (rf) setDone(bi, si, true, true);
    else if (need) {
      W.lastAuto = { b: blkRef(bi), s: si, t: Date.now() };
      setDone(bi, si, true);
    }
    mixCheck(bi, si);
    if (fillLoads()) act(() => carryLoad(d.ex[bi], si), { inProgress: true });
    redraw();
    return true;
  }
  /* The minutes a past workout or an edited session took, typed (r67, NEW-39):
     empty is none, and a number past what a workout takes is refused. */
  if (t.dataset.bind === 'draftMin') {
    const v = t.value.trim();
    const n = Number(v);
    if (v === '' || (Number.isInteger(n) && n >= 1 && n <= LIMITS.minutes))
      act(
        () => {
          d.durMin = v === '' ? null : n;
        },
        { inProgress: true }
      );
    else {
      t.value = d.durMin ? String(d.durMin) : '';
      toast(`Minutes from 1 to ${LIMITS.minutes}`);
    }
    return true;
  }
  if (t.dataset.bind === 'draftDate') {
    if (isDate(t.value) && t.value <= today()) {
      const moved = d.date !== t.value;
      act(
        () => {
          d.date = t.value;
          if (moved && !d.editingId) for (const b of d.ex) refreshBlock(b);
        },
        { inProgress: true }
      );
      if (moved && !d.editingId) rerenderKeepScroll();
    } else {
      t.value = d.date;
      toast('A session cannot be dated in the future');
    }
    return true;
  }
  return false;
}

/* In a set row, Enter (the keyboard's Next) goes load, reps, then the next
   set's load, which is the order sets are typed in; Next on an empty reps
   field accepts the grey number (acceptGrey). Escape closes the effort strip.
   The arrow keys on an exercise's handle move it, as a drag does. */
/** A key on the session screen; whether it was one it acts on. */
export function workoutKey(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof Element)) return false;
  // A key that moves the caret leaves it where it went: the next key goes there.
  if (W.replaceNext === t && /^(Arrow|Home$|End$)/.test(e.key)) W.replaceNext = null;
  if (e.key === 'Enter' && t instanceof HTMLInputElement && t.matches('.sg input[data-f]')) {
    e.preventDefault();
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    if (t.dataset.f === 'r' && !t.value.trim()) acceptGrey(bi, si);
    /* A set whose tick waits for its weight (344) keeps the focus on its
       load field, which setDone gave it (from the independent review of r60:
       Next moved on, and the weight typed next went to the set after). */
    if (needHere(bi, si)) return true;
    const all = [...document.querySelectorAll<HTMLInputElement>('.sg input[data-f]')];
    const nx = all[all.indexOf(t) + 1];
    if (nx)
      try {
        nx.focus();
        if (nx.dataset.f === 'w') armLoad(nx);
        else nx.select();
      } catch (x) {
        // Focus is best effort; the set is typed either way.
      }
    else t.blur();
    return true;
  }
  if (e.key === 'Escape' && W.stripAt) {
    rirClose();
    return true;
  }
  const bg = t.closest('.bgrip');
  const d = state.draft;
  if (bg instanceof HTMLElement && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && d) {
    e.preventDefault();
    const i = Number(bg.dataset.b);
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= d.ex.length) return true;
    moveBlock(i, j);
    rerenderKeepScroll();
    const n = document.querySelector<HTMLElement>(`.bgrip[data-b="${j}"]`);
    if (n) n.focus();
    toast(`Moved to position ${j + 1}`);
    return true;
  }
  return false;
}

/* A tap on a load field shows its number selected (V, PENDING 341 a, from
   the live r56.1: a grey load was an empty field under a hint, so it could
   not be edited in place and backspace did nothing, while a filled one took
   the caret where tapped, 165 then 1 giving 1615). A grey load is put in the
   field to be typed over: a digit replaces it, backspace clears it, and left
   untouched it goes back to grey, so it still follows the next sets'
   adjustment and one tap on the checkmark still logs it. A filled load is
   selected the same way. The selection is made on focus, and made again when
   the tap that focused the field is released, whose default would place the
   caret where the finger landed (in WebKit, the engine of every iPhone
   browser, it did: GitHub's run of r60 typed 1135 over a selected 135, and
   152.5 over a grey 135 as 1152.535). The first key does what the selection
   says whatever the screen shows (workoutBeforeInput), so a release that
   still moves the caret cannot splice a digit into the number. A second tap
   on the focused field places the caret as any tap does, and so does an
   arrow key, Home or End. Only a tap or Next does this: a field focused
   again by a redraw keeps its caret and its text (from the independent
   review of r60: a field remade mid-number, its focus given back, took the
   next digit as a new number, 13 then 5 giving 5). iPhone selection
   behaviour is to be tried on V's phone before this ships. */
// A field of the session screen focused (focusin): on a tap, a load field's number selected, a grey one put in to be typed over.
function workoutFocus(e: FocusEvent): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (t.matches('.sg input[data-f]')) onSetFocus(t);
  if (!t.matches('.sg input[data-f="w"]')) return;
  // Focused by a touch on it just now (noteDown ran first): its release is still to come.
  if (W.lastDown.el !== t || Date.now() - W.lastDown.t > TOUCH_MS) return;
  armLoad(t);
  W.selAgain = t;
}

/* A set's field focused on the lift minus and plus are on makes it the set you are on (NEW-100), drawn at once so the
   strip and the mark follow; the strip stays where it is, so nothing moves. A field on another lift waits for a number
   typed, which moves the pills there (NEW-98), keeping the lift tapped in place. Drawn before the load field is made
   ready to be typed over (armLoad), whose grey number a draw would take back out. */
function onSetFocus(t: HTMLInputElement): void {
  const d = state.draft;
  const bi = Number(t.dataset.b),
    si = Number(t.dataset.s);
  const b = d && d.ex[bi];
  if (!d || !b || !b.sets[si] || d.editingId || !liftsOn(d).has(b) || stepAt(b, bi) === si) return;
  W.onSet = setRef(bi, si);
  redraw();
}

// A load field made ready to be typed over, on a tap or Next: a grey load put in, the number selected, and the first key replacing it.
function armLoad(t: HTMLInputElement): void {
  if (!t.value && /\d/.test(t.placeholder)) {
    t.value = t.placeholder;
    greyIn.add(t);
    fieldShown(t, true);
  }
  t.select();
  W.replaceNext = t;
}

// A tap released (mouseup, capture phase): on the load field it just focused, the selection kept rather than the caret placed.
function workoutUp(e: MouseEvent): void {
  const t = W.selAgain;
  if (!t || e.target !== t) return;
  W.selAgain = null;
  if (document.activeElement !== t) return;
  e.preventDefault();
  t.select();
}

/* The first key in a load field just focused replaces its number, and a
   backspace or delete clears it, as the selection on it says (above). The
   whole number is selected and the key's edit made over it as the browser's
   own editing (execCommand), so the field's input, and its change when it is
   left, follow as for any key: a value set by code fires neither, and the
   change is what checks a load far from last time's (tests/acceptance.js).
   Any other edit (a paste) goes ahead as the browser does it. */
// A key about to change a field (beforeinput).
function workoutBeforeInput(e: InputEvent): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || W.replaceNext !== t) return;
  W.replaceNext = null;
  const put = e.inputType === 'insertText' ? (e.data ?? '') : e.inputType.startsWith('delete') ? '' : null;
  if (put === null) return;
  e.preventDefault();
  t.select();
  // The browser's editing commands; the edit made below fires this listener again, which replaceNext, now null, passes by.
  if (document.execCommand(put ? 'insertText' : 'delete', false, put)) return;
  log('workout', 'the browser refused an edit over a selected load; it was made by setting the value');
  t.value = put;
  t.dispatchEvent(new Event('input', { bubbles: true }));
}

// A grey load put in a field and typed over is the lifter's own from then on (workoutInput).
function greyTyped(t: HTMLInputElement): void {
  if (!greyIn.has(t)) return;
  greyIn.delete(t);
  fieldShown(t, false);
}

/* Leaving a set's reps field empty takes its grey reps (acceptGrey, worksets.ts),
   unless the lifter went to the same row's load or effort, a button or any
   other control (where the lifter went: the newly focused element, or on an
   iPhone, where buttons never take focus, whatever was just touched), or the
   phone blurred the field itself (locked, or the app sent to the
   background). Leaving the load field a waiting auto-mark was heading for
   runs it. */
// A field of the session screen left (focusout).
function workoutBlur(e: FocusEvent): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (W.replaceNext === t) W.replaceNext = null;
  if (W.selAgain === t) W.selAgain = null;
  // A grey load left untouched goes back to grey: nothing was typed.
  if (greyIn.has(t)) {
    greyTyped(t);
    t.value = '';
  }
  if (
    t.matches('.sg input[data-f="w"]') &&
    W.pendAuto &&
    W.pendAuto.s === Number(t.dataset.s) &&
    blkIdx(W.pendAuto.b) === Number(t.dataset.b)
  ) {
    setTimeout(autoPending, 0);
    return;
  }
  if (!t.matches('.sg input[data-f="r"]') || t.value.trim()) return;
  if (t.dataset.cleared) {
    delete t.dataset.cleared;
    return;
  }
  if (drawing() || !state.draft || !state.settings.autoDone) return;
  const bi = Number(t.dataset.b),
    si = Number(t.dataset.s);
  const to = e.relatedTarget;
  if (to instanceof HTMLElement && to.dataset.b === t.dataset.b && to.dataset.s === t.dataset.s) return;
  const dn = W.lastDown;
  const dest = to instanceof Element ? to : Date.now() - dn.t < TOUCH_MS && dn.el !== t ? dn.el : null;
  if (
    dest &&
    !dest.closest('.sg input[data-f]') &&
    dest.closest('button,a,select,label,input,textarea,summary,[data-act],[role="button"]')
  )
    return;
  setTimeout(() => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    acceptGrey(bi, si);
  }, 0);
}

/** Adds the session screen's listeners to the page: where a touch lands and is released (capture), a field left, a field focused, and a key about to change one. Called once at start, after the page's own. */
export function workoutStart(): void {
  onRedraw(drawNow);
  document.addEventListener('pointerdown', noteDown, true);
  document.addEventListener('mouseup', workoutUp, true);
  document.addEventListener('focusout', workoutBlur);
  document.addEventListener('focusin', workoutFocus);
  document.addEventListener('beforeinput', workoutBeforeInput);
}
