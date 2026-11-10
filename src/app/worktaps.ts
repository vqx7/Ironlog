/* The session screen's taps (CL-1, split from workout.ts): every button on it by its data-act (WORKOUT_ACTS, reached
   through events.ts's table), a set ticked, stepped, added or removed, an exercise removed, a warm-up added, and the
   sheets they open. Each change to the session in progress goes through act. What the screen opens is reached by the
   button's data-act through events.ts's table (the sheets moved in r62, the actions in r63): the exercise menu, the
   picker, Short on time, the calibration set, the heaviest load, the load step, the note, Type or dictate sets, a
   lift's history and muscles, Pick for me, and the recap. */

import { act } from './act';
import { unpark } from './park';
import { CARDIOL } from './library';
import { fixSupersets, linkToggle } from './routines';
import { isMissed, isWork, DROP_START, WARM_RAMP, LIGHT_SHARE } from './formulas';
import { today, numIn, uid, EPS, pctOf, HUNDREDTHS } from './util';
import { cleanDraftCardio, LOAD_MAX } from './normalize';

import { CHK_Q } from './coach';
import { BWASK_KEY, prefSet } from './storage';
import { EX, loadLabel, U, exName, lighterLoad, heavierLoad, fromD, oddLoad, lightZero, stepLoad, toD } from './live';
import { state, ui } from './store';
import { effW, greyW, blockDone, newRow, editFp, markedNew } from './session';
import type { DraftBlock } from './types';

import { setShort } from './display';
import { coarse } from './env';

import {
  W,
  blkIdx,
  blkOpen,
  blkShut,
  blkRef,
  setRef,
  carried,
  draftSet,
  editFp0,
  keepOpen,
  ordBack,
  redraw,
  FOLD_MS
} from './workstate';
import type { Tap } from './workstate';
import {
  adjRows,
  adjSync,
  assessSet,
  autoFold,
  carryLoad,
  draftEntered,
  fillLoads,
  greyR,
  lastRFor,
  mixCheck,
  moveBlock,
  refreshBlock,
  rirClose,
  rirShowStrip,
  rowBlank,
  setDone,
  oddReps,
  restNext,
  CAL_OFFER,
  doneChanged,
  onLiftDraw
} from './worksets';
import { BACK_SAID, finish, finishNow } from './workfinish';
import { LIMITS, EFFORT_TOP } from './records';

import { closeModal, confirmBox, openModal, render, renderModal, rerenderKeepScroll } from './page';

import { toast } from './toast';
import { startTimer, stopTimer, wakeOff } from './timer';
import { stripIs } from './workout';
/** After an auto-mark, a tap on that set's checkmark within this many milliseconds confirms it rather than undoing it (r28). */
const AUTO_CONFIRM_MS = 15000;
/** An exercise a tick moved up goes back when its sets are all unticked within this many milliseconds (r55). */
const REORDER_BACK_MS = 30000;
/** Seconds a timed hold's minus and plus step by (ST-6): one second is too fine a step to tap toward a 30 to 60 s hold. */
const STEP_SECONDS = 5;

// The block a tap names by its data-b, or null.
const tapBlock = (t: Tap): DraftBlock | null => (state.draft && state.draft.ex[Number(t.dataset.b)]) || null;

/* − Set (r25 guardrail). It takes the last row that holds nothing of the
   lifter's (no tick, no reps, no RIR, and a load that is only the app's
   suggestion), quietly. When every row holds something, it no longer
   removes the last one on a single tap: it asks first, naming the set, and
   Undo still follows; the last row not ticked goes first, a logged set only
   after. Found again when confirmed: a cloud refresh may have replaced the
   session while the question was open. */
function setRemove(t: Tap): void {
  const d = state.draft;
  const bi = Number(t.dataset.b);
  const b = d && d.ex[bi];
  if (!d || !b || !b.sets.length) return;
  let i = -1;
  for (let k = b.sets.length - 1; k >= 0; k--)
    if (rowBlank(b, b.sets[k])) {
      i = k;
      break;
    }
  if (i >= 0) {
    const at = i;
    act(
      () => {
        b.sets.splice(at, 1);
        adjSync(b);
      },
      { inProgress: true }
    );
    rerenderKeepScroll();
    return;
  }
  for (let k = b.sets.length - 1; k >= 0; k--)
    if (!b.sets[k].done) {
      i = k;
      break;
    }
  if (i < 0) i = b.sets.length - 1;
  const x = b.sets[i],
    ex = EX(b.exId),
    did = d.id,
    exId = b.exId,
    n = b.sets.slice(0, i + 1).filter(y => !y.warm && !y.drop).length;
  const what = `${x.warm ? 'Warm-up' : x.drop ? 'Drop set' : 'Set ' + n}`;
  const val =
    +(x.r ?? 0) > 0
      ? setShort(ex, x.w == null ? 0 : x.w, x.r)
      : x.w != null
        ? loadLabel(ex, x.w) + (ex.bw ? '' : ' ' + U())
        : '';
  const at = i;
  confirmBox(
    `Remove ${what.toLowerCase()}?`,
    `${ex.name}${val ? `: ${val}` : ''}, ${x.done ? 'logged' : 'typed, not ticked'}. Undo is offered right after.`,
    'Remove set',
    () => {
      const dd = state.draft;
      const bb = dd && dd.id === did ? dd.ex[bi] : null;
      const xx = bb && bb.exId === exId ? bb.sets[at] : null;
      if (!bb || !xx || xx.done !== x.done || xx.r !== x.r || xx.w !== x.w) {
        toast('That set changed. Nothing was removed.');
        rerenderKeepScroll();
        return;
      }
      act(
        () => {
          bb.sets.splice(at, 1);
          adjSync(bb);
        },
        {
          inProgress: true,
          undo: () => {
            const d3 = state.draft;
            if (!d3 || d3.id !== did || !d3.ex.includes(bb)) return false;
            bb.sets.splice(Math.min(at, bb.sets.length), 0, xx);
            adjSync(bb);
            return true;
          }
        }
      );
      rerenderKeepScroll();
      toast(xx.done ? 'Logged set removed' : 'Set removed', true);
    },
    true
  );
}

/* Removing an exercise (r25 guardrail): one with logged or typed sets asks
   first, naming how many; an untouched one goes with an Undo as before. Back
   after the exercise it followed, which an automatic reorder may have moved
   (r45 review). */
function blockRemove(t: Tap): void {
  const d = state.draft;
  const bi = Number(t.dataset.b);
  const blk = d && d.ex[bi];
  if (!d || !blk) return;
  const did = d.id;
  const go = (): void => {
    const dd = state.draft;
    if (!dd || dd.id !== did || dd.ex[bi] !== blk) {
      if (ui.modal) closeModal();
      toast('That exercise changed. Nothing was removed.');
      rerenderKeepScroll();
      return;
    }
    const prevBlk = bi > 0 ? dd.ex[bi - 1] : null;
    act(() => keepOpen(() => dd.ex.splice(bi, 1)), {
      inProgress: true,
      undo: () => {
        const d3 = state.draft;
        if (!d3 || d3.id !== did) return false;
        const k = prevBlk ? d3.ex.indexOf(prevBlk) : -1;
        d3.ex.splice(prevBlk == null ? 0 : k >= 0 ? k + 1 : Math.min(bi, d3.ex.length), 0, blk);
        fixSupersets(d3.ex.map(x => x.plan));
        return true;
      }
    });
    rerenderKeepScroll();
    toast('Exercise removed', true);
  };
  const logged = blk.sets.filter(x => x.done).length,
    typed = blk.sets.filter(x => !x.done && (+(x.r ?? 0) > 0 || x.rir != null)).length;
  if (logged || typed) {
    if (ui.modal) closeModal();
    confirmBox(
      `Remove ${EX(blk.exId).name}?`,
      `${logged ? `${logged} logged set${logged === 1 ? '' : 's'}` : ''}${logged && typed ? ' and ' : ''}${typed ? `${typed} typed set${typed === 1 ? '' : 's'}` : ''} go with it. Undo is offered right after.`,
      'Remove exercise',
      go,
      true
    );
    return;
  }
  go();
}

/* A filled cardio entry goes with an Undo, like a set with reps; an empty one goes quietly. */
function cardioRemove(t: Tap): void {
  const d = state.draft;
  const list = d && d.cardio;
  const i = Number(t.dataset.c);
  const c = list && list[i];
  if (!d || !list || !c) return;
  if ((c.min || 0) > 0 || (c.hr || 0) > 0 || (c.note || '').trim()) {
    const did = d.id;
    confirmBox(
      `Remove ${(CARDIOL[c.kind || ''] || 'entry').toLowerCase()}?`,
      `${c.min ? c.min + ' min' : 'An entry with your notes'}. Undo is offered right after.`,
      'Remove',
      () => {
        const dd = state.draft;
        const l2 = dd && dd.id === did ? dd.cardio : null;
        const j = l2 ? l2.indexOf(c) : -1;
        if (!l2 || j < 0) {
          toast('That entry changed. Nothing was removed.');
          rerenderKeepScroll();
          return;
        }
        act(
          () => {
            l2.splice(j, 1);
          },
          {
            inProgress: true,
            undo: () => {
              const d3 = state.draft;
              if (!d3 || d3.id !== did) return false;
              const l3 = d3.cardio || (d3.cardio = []);
              l3.splice(Math.min(j, l3.length), 0, c);
              return true;
            }
          }
        );
        rerenderKeepScroll();
        toast(`${CARDIOL[c.kind || ''] || 'Entry'} removed`, true);
      },
      true
    );
    return;
  }
  act(
    () => {
      list.splice(i, 1);
    },
    { inProgress: true }
  );
  rerenderKeepScroll();
}

/** The session screen's taps, by data-act: each change to the session in progress through act. */
export const WORKOUT_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  /* With auto-done on, leaving the reps field marks the set done, and on a
     phone that blur happens a moment before the tap on the checkmark lands.
     Without this guard the tap would immediately undo the auto-mark. Since
     r28 (auto-mark on for new installs) the first tap on that set's
     checkmark confirms it for AUTO_CONFIRM_MS, until another set is touched: typing
     reps, picking RIR and then tapping the checkmark is the natural order,
     and it used to untick the set. A second tap undoes it. Tapping done on
     an empty reps field logs the grey number in it (see greyR), like the
     paper log you copy from; warm-ups and drops have theirs since r64; a typed
     0 is a missed set (r55, V), ticked as typed. Unticked (r55, the audit):
     numbers that are what the row shows in grey go back to grey, so a tap by
     mistake leaves nothing typed for Finish to offer to save, and an
     exercise the tick moved up goes back if it has no set left ticked,
     within REORDER_BACK_MS. */
  sDone(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const s = draftSet(t);
    const d = state.draft;
    if (!s || !d) return;
    if (W.lastAuto && (blkIdx(W.lastAuto.b) !== bi || W.lastAuto.s !== si)) W.lastAuto = null;
    /* A tick of yours moves minus and plus on, to the first set not ticked; an untick keeps them on the set unticked
       (NEW-100). The checkmark tapped after auto-mark keeps the tick and is a tick of yours too. */
    if (W.lastAuto && Date.now() - W.lastAuto.t < AUTO_CONFIRM_MS && s.done) {
      W.lastAuto = null;
      W.onSet = null;
      onLiftDraw(bi, redraw);
      return;
    }
    const b = d.ex[bi];
    const noReps = !s.done && !(+(s.r ?? 0) > 0) && !isMissed(s);
    const lr = noReps && b ? greyR(b, si) : null;
    if (noReps && (lr == null || !(lr > 0))) {
      toast('Enter reps first');
      return;
    }
    const was = !!s.done;
    W.onSet = was ? setRef(bi, si) : null;
    /* The whole tap is one change, saved once (act runs the changes made
       inside it as its own): the grey reps taken, the tick, and on an untick
       the numbers put back to grey and the exercise moved back. From the
       independent review of r60: written in two saves, a second tab's merge
       of the first could lose the second, the tick. */
    act(
      () => {
        if (lr != null) s.r = Math.round(lr);
        setDone(bi, si, !was);
        if (!was || !b) return;
        if (s.r != null && +s.r === greyR(b, si)) s.r = null;
        const gw = greyW(b, si);
        if (!fillLoads() && s.w != null && gw != null && Math.abs(s.w - gw) < EPS) s.w = null;
        const o = ordBack.get(b);
        if (o && !b.sets.some(x => x.done) && Date.now() - o.t < REORDER_BACK_MS) {
          ordBack.delete(b);
          moveBlock(bi, Math.min(o.i, d.ex.length - 1));
        }
      },
      { inProgress: true }
    );
    if (was) rerenderKeepScroll();
  },
  // Numbers, placeholders and the progress bar all depend on which rows are working sets, so the block is drawn again.
  sWarm(t) {
    const s = draftSet(t);
    const b = tapBlock(t);
    if (!s || !b) return;
    act(
      () => {
        if (!s.warm && !s.drop) s.warm = true;
        else if (s.warm) {
          s.warm = false;
          s.drop = true;
        } else s.drop = false;
        adjSync(b);
      },
      { inProgress: true }
    );
    rerenderKeepScroll();
  },
  fillLast(t) {
    const b = tapBlock(t);
    if (!b) return;
    const todo = b.sets
      .map((s, i) => [s, lastRFor(b, i)] as const)
      .filter(([s, lr]) => !s.done && !s.warm && !s.drop && s.r == null && lr != null);
    if (!todo.length) {
      toast('Nothing to fill');
      return;
    }
    act(
      () => {
        for (const [s, lr] of todo) s.r = lr;
      },
      { inProgress: true }
    );
    rerenderKeepScroll();
    toast(`${todo.length} set${todo.length === 1 ? '' : 's'} filled with last time's reps`);
  },
  /* The new working set copies the last working set's load, not a drop set's
     (DROP_START) or a warm-up's. Grey by default: the new row shows the load above
     it, or what the last set ticked asks for, as a planned row under it would
     have (r55, V: after 300 x 1, + Set copied 300). Filled in, it takes that load. */
  sAdd(t) {
    const bi = Number(t.dataset.b);
    const b = tapBlock(t);
    if (!b) return;
    act(
      () => {
        const ld = b.sets.reduce((k, x, i) => (x.done && isWork(x) && !x.drop ? i : k), -1);
        const row = newRow();
        b.sets.push(row);
        if (ld >= 0) assessSet(bi, ld);
        if (fillLoads()) row.w = effW(b, b.sets.length - 1);
      },
      { inProgress: true }
    );
    rerenderKeepScroll();
  },
  /* Minus and plus (ST-6): from what the row holds, else what it shows in grey, to the next load on the lift's list
     or one rep (five seconds on a hold) either way, written as the number typed in the field would be: the same carry
     to the rows below, and on a set ticked the same checks as a number typed there (doneChanged). They never tick or
     untick a set, and the set stepped is the one you are on (NEW-100). One change, saved once. */
  sStep(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const b = tapBlock(t);
    const s = b && b.sets[si];
    if (!b || !s) return;
    const ex = EX(b.exId);
    const dir = t.dataset.d === '-1' ? -1 : 1;
    const f = t.dataset.sf === 'w' ? 'w' : 'r';
    let w: number | null = null,
      r: number | null = null;
    if (f === 'w') {
      if (ex.assist) return;
      const to = stepLoad(ex, b.plan, effW(b, si) ?? 0, dir);
      /* As the number typed in the unit on screen, to the hundredth a field takes: the field's own text is rounded to a
         tenth, and stored from it a 1.25 kg step went 41.3, 42.6, 43.9, off every load the lift has (the review, REV6-5). */
      const v = to == null ? null : toD(to);
      if (v == null) return;
      w = Math.min(fromD(Math.max(Math.round(v * HUNDREDTHS) / HUNDREDTHS, 0)) ?? 0, LOAD_MAX);
    } else {
      const was = +(s.r ?? greyR(b, si) ?? 0) || 0;
      r = Math.min(Math.max(was + dir * (ex.timed ? STEP_SECONDS : 1), 0), LIMITS.reps);
      if (r === s.r) return;
    }
    W.onSet = setRef(bi, si);
    act(
      () => {
        if (w != null) {
          s.w = w;
          carried.delete(s);
        } else s.r = r;
        if (s.done && doneChanged(bi, si, f)) return;
        if (f === 'w' && fillLoads()) carryLoad(b, si);
      },
      { inProgress: true }
    );
    if (f === 'w') {
      mixCheck(bi, si);
    }
    onLiftDraw(bi, redraw);
  },
  sDel: setRemove,
  /* Warm-ups go in at the top, already flagged, so they stay out of every
     analytic, and are seeded from the working load; each new one goes after
     the ones already there, so they climb to the working load (r27). */
  wAdd(t) {
    const b = tapBlock(t);
    if (!b) return;
    let base = 0;
    for (let i = 0; i < b.sets.length; i++) {
      const s = b.sets[i];
      if (s.warm || s.drop) continue;
      const w = +(effW(b, i) ?? 0) || 0;
      if (w > 0) {
        base = w;
        break;
      }
    }
    if (!base) base = Math.max(0, ...b.sets.map((_, i) => +(effW(b, i) ?? 0) || 0));
    const n = b.sets.filter(s => s.warm).length;
    const frac = WARM_RAMP[Math.min(n, WARM_RAMP.length - 1)];
    let at = 0;
    while (at < b.sets.length && b.sets[at].warm) at++;
    let w = base > 0 ? lighterLoad(EX(b.exId), b.plan, base, base * frac) : null;
    /* Each warm-up a step heavier than the one before where the loads allow (r68): on a 10 lb step a 50 lb curl's
       third warm-up came out at 30 again, the second's load; it takes the next load up, at most the ramp's top share
       of the working load, so a warm-up never reaches it. Where no load fits there, it repeats the one before, never
       a lighter one (the review of r68: a 30 kg bench on 5 kg steps warmed up at 20, 25, then 20). */
    const prev = at > 0 ? +(effW(b, at - 1) ?? 0) || 0 : 0;
    const top = WARM_RAMP[WARM_RAMP.length - 1] ?? frac;
    if (w != null && prev > 0 && w <= prev + EPS) {
      const up = base * top > prev ? heavierLoad(EX(b.exId), b.plan, prev, base * top) : null;
      w = up != null && up < base - EPS ? up : prev;
    }
    act(
      () => {
        b.sets.splice(at, 0, newRow({ w, warm: true }));
        adjSync(b);
      },
      { inProgress: true }
    );
    rerenderKeepScroll();
    toast('Warm-up set added');
  },
  // The load the last working set was, or will be (a grey load counts); a missed set's is passed over (r55).
  /* Done with an exercise that has sets left (r66, PENDING 374; V: "Ask:
     log or skip"): one question, then every set left ticked as it shows (its
     load and reps, typed or grey; a 0 typed is a missed set, as a tick logs
     it), or every set left taken off. Either is one change with one Undo. A
     warm-up or a drop set left is a set left like any other, logged as it
     is; the target repeats only when a working set is skipped (V's one
     rule), so the question says so only then (the review of r66: a warm-up alone was
     counted as a set whose skip repeats the target, and Log took it off).
     Logging stops before anything is ticked when a set left has no weight
     or reps to take, looks far off, or is a 0 at a weight well under the
     working load (each is ticked on its own, where it is asked about). */
  bDoneAll(t) {
    const bi = Number(t.dataset.b);
    const d = state.draft;
    const b = d && d.ex[bi];
    if (!d || !b) return;
    const left = b.sets.map((s, si) => ({ s, si })).filter(x => !x.s.done);
    if (!left.length) return;
    const ex = EX(b.exId);
    const n = left.length;
    const sets = `${n} set${n === 1 ? '' : 's'}`;
    // Only a working set skipped leaves the lift short of its usual sets; a warm-up or a drop set is not one.
    const repeats = left.some(x => !x.s.warm && !x.s.drop)
      ? ' Skipped sets are fewer than usual, so the target repeats next time.'
      : '';
    const blocked = left.find(
      ({ s, si }) =>
        (!ex.bw && !ex.timed && s.w == null && greyW(b, si) == null) ||
        (!(+(s.r ?? 0) > 0) && !isMissed(s) && !((greyR(b, si) ?? 0) > 0)) ||
        (isMissed(s) && !s.warm && !s.drop && lightZero(b, si, d.date)) ||
        (s.w != null && !s.warm && !s.drop && oddLoad(b, si, d.date)) ||
        oddReps(b, s)
    );
    const ref = blkRef(bi);
    const after = (): void => {
      rerenderKeepScroll();
      if (W.foldT) clearTimeout(W.foldT);
      W.foldT = setTimeout(() => autoFold(ref), FOLD_MS.tick);
    };
    const skip = (): void => {
      act(
        () => {
          b.sets = b.sets.filter(x => x.done);
        },
        { inProgress: true, undo: true }
      );
      after();
      toast(`${sets} skipped`, true);
    };
    const log = (): void => {
      /* What each set shows is read before any is ticked: a tick can adjust the
         grey numbers of the sets after it (a set far easier than planned moves
         the next ones), and the lifter did what was on the screen when Done was
         tapped, not what one tick would have changed it to. */
      const shown = left.map(({ s, si }) => ({
        s,
        si,
        w: s.w ?? greyW(b, si),
        r: isMissed(s) || +(s.r ?? 0) > 0 ? s.r : Math.round(greyR(b, si) ?? 0)
      }));
      act(
        () => {
          for (const x of shown) {
            x.s.w = x.w;
            x.s.r = x.r;
            x.s.done = true;
            assessSet(bi, x.si);
          }
          b.sets = b.sets.filter(x => x.done);
        },
        { inProgress: true, undo: true }
      );
      after();
      toast(`${sets} logged as shown`, true);
    };
    if (blocked)
      confirmBox(
        `${exName(b.exId)}: ${sets} left`,
        `Set ${blocked.si + 1} has no weight or reps to take, or looks far off, so tick it on its own. Or skip the sets left.${repeats}`,
        'Skip them',
        skip
      );
    else
      confirmBox(
        `${exName(b.exId)}: ${sets} left`,
        `Log them as shown, or skip them.${repeats}`,
        'Log them as shown',
        log,
        false,
        { label: 'Skip them', fn: skip }
      );
  },
  dropAdd(t) {
    const b = tapBlock(t);
    if (!b) return;
    let base = 0;
    for (let i = b.sets.length - 1; i >= 0; i--) {
      const s = b.sets[i];
      if (s.warm || s.drop || isMissed(s)) continue;
      const w = +(effW(b, i) ?? 0) || 0;
      if (w > 0) {
        base = w;
        break;
      }
    }
    const w = base > 0 ? lighterLoad(EX(b.exId), b.plan, base, base * DROP_START) : null;
    // Attached to the last working set ticked (r66, 375): after it and any drops already under it, not at the end of the exercise.
    let at = -1;
    b.sets.forEach((x, i) => {
      if (x.done && !x.warm && !x.drop) at = i;
    });
    if (at < 0) at = b.sets.length - 1;
    while (at + 1 < b.sets.length && b.sets[at + 1].drop) at++;
    act(
      () => {
        b.sets.splice(at + 1, 0, newRow({ w, drop: true }));
      },
      { inProgress: true }
    );
    rerenderKeepScroll();
    toast('Drop set added');
  },
  // Keep: no adjustment for this exercise for the rest of the session.
  adjKeep(t) {
    const b = tapBlock(t);
    if (!b || !b.adj) return;
    const prev = b.adj;
    act(
      () => {
        delete b.adj;
        b.adjOff = true;
        adjRows(b, prev, null);
      },
      { inProgress: true }
    );
    redraw();
  },
  rirOpen(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    if (stripIs(bi, si)) {
      rirClose();
      return;
    }
    rirShowStrip(bi, si);
    const f =
      document.querySelector<HTMLElement>('.rirstrip button.on') ||
      document.querySelector<HTMLElement>('.rirstrip button');
    if (f && !coarse())
      try {
        f.focus({ preventScroll: true });
      } catch (e) {
        // Focus is best effort; the strip is open either way.
      }
  },
  // The fold waits for the effort of the last set, then goes.
  rirPick(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const d = state.draft;
    const b = d && d.ex[bi];
    const s = b && b.sets[si];
    if (!d || !b || !s) return;
    const n = numIn(t.dataset.v || '');
    act(
      () => {
        s.rir = n == null ? null : Math.min(Math.max(n, 0), EFFORT_TOP);
        if (s.done) assessSet(bi, si);
      },
      { inProgress: true, soon: true }
    );
    rirClose();
    redraw();
    const btn = document.querySelector<HTMLElement>(`.rirb[data-b="${bi}"][data-s="${si}"]`);
    if (btn)
      try {
        btn.focus({ preventScroll: true });
      } catch (e) {
        // Focus is best effort; the effort is saved either way.
      }
    if (!d.editingId && blockDone(b)) {
      if (W.foldT) clearTimeout(W.foldT);
      const rf = blkRef(bi);
      W.foldT = setTimeout(() => autoFold(rf), FOLD_MS.effort);
    }
  },
  bOpen(t) {
    const bi = Number(t.dataset.b);
    const b = tapBlock(t);
    if (!b) return;
    blkOpen(bi, b);
    rerenderKeepScroll();
    const el = document.getElementById('blk-' + bi);
    if (el)
      try {
        el.scrollIntoView({ block: 'nearest' });
      } catch (e) {
        // Scrolling is best effort; the exercise is open either way.
      }
  },
  /* Save and leave (NEW-89): the workout is saved as it goes, so this only
     steps away to Today, which offers it back; the tab, Back and opening the
     app again all open the workout. */
  wkAway() {
    ui.away = state.draft ? state.draft.id : null;
    window.scrollTo(0, 0);
    render();
    toast('Saved. Resume it from Today.');
  },
  wkResume() {
    ui.away = null;
    ui.tab = 'today';
    window.scrollTo(0, 0);
    render();
  },
  // Today's card for a workout set aside that did not come back by itself (R81-2): it comes back and opens.
  parkBack() {
    if (!unpark()) return;
    ui.away = null;
    ui.tab = 'today';
    window.scrollTo(0, 0);
    render();
  },
  // Folded by hand, done or not (NEW-101), and every place it was opened at forgotten, so a move leaves nothing behind.
  bFold(t) {
    const b = tapBlock(t);
    if (!b) return;
    const pre = ((state.draft && state.draft.id) || '') + ':';
    for (const k of [...ui.blkOpen])
      if (typeof k === 'string' && k.startsWith(pre) && k.endsWith(':' + b.exId)) ui.blkOpen.delete(k);
    blkShut(Number(t.dataset.b), b);
    rerenderKeepScroll();
  },
  bUp(t) {
    if (moveBlock(Number(t.dataset.b), Number(t.dataset.b) - 1)) rerenderKeepScroll();
  },
  bDown(t) {
    if (moveBlock(Number(t.dataset.b), Number(t.dataset.b) + 1)) rerenderKeepScroll();
  },
  bDel: blockRemove,
  /* New machine or gym (r61, PENDING 343 7, V's decision of 2026-10-24): the
     lift starts over from this session, every block of it marked and its
     suggestion read again as a first session's; tapped again, it reads its
     history again. Rows typed are kept; rows still on the suggestion take
     the new one (refreshBlock). In an edit from History it marks the saved
     session, or takes the mark off, when the edit is saved. */
  bNew(t) {
    const d = state.draft;
    const b0 = d && d.ex[Number(t.dataset.b)];
    if (!d || !b0) return;
    const on = !markedNew(d, b0.exId);
    act(
      () => {
        for (const b of d.ex)
          if (b.exId === b0.exId) {
            if (on) b.nw = true;
            else delete b.nw;
          }
        // An edit's sets are saved ones, its words "Editing saved sets.": nothing is suggested there to read again.
        if (!d.editingId) for (const b of d.ex) if (b.exId === b0.exId) refreshBlock(b);
      },
      { inProgress: true }
    );
    rerenderKeepScroll();
    toast(
      on
        ? `${exName(b0.exId)} starts over from this session. Its history stays.`
        : `${exName(b0.exId)} reads its history again.`
    );
  },
  // A superset made here is this session's; Finish offers to keep it in the plan (r34.2, from the review: it was gone next time without a word).
  bSs(t) {
    const d = state.draft;
    const bi = Number(t.dataset.b);
    if (!d || !d.ex[bi]) return;
    // linkToggle changes nothing when there is no exercise after this one to pair with.
    if (
      !act(
        () => {
          linkToggle(d.ex, bi, x => x.plan);
        },
        { inProgress: true, check: () => !!d.ex[bi] && !!d.ex[bi + 1] }
      )
    )
      return;
    rerenderKeepScroll();
    const b = d.ex[bi];
    if (b && b.plan.ss)
      toast(d.dayId ? 'Superset. Finish offers to keep it in your plan.' : 'Superset for this session.');
  },
  noteReuse(t) {
    const b = tapBlock(t);
    const ln = b && b.lastNote;
    if (!b || !ln) return;
    act(
      () => {
        b.note = ln.text;
      },
      { inProgress: true }
    );
    rerenderKeepScroll();
    toast('Note carried into this session');
  },
  cDraftAdd(t) {
    const d = state.draft;
    if (!d) return;
    act(
      () => {
        (d.cardio || (d.cardio = [])).push(cleanDraftCardio({ id: uid(), kind: 'walk', when: t.dataset.when }));
      },
      { inProgress: true }
    );
    rerenderKeepScroll();
  },
  cDraftDel: cardioRemove,
  // The check-in's sheet, from its button beside the date.
  chkOpen() {
    if (state.draft) openModal({ kind: 'checkin' });
  },
  /* The check-in: answering the last of the three closes its sheet, as it
     folded the check-in away when it was on the session. */
  chk(t) {
    const d = state.draft;
    if (!d) return;
    const k = t.dataset.k || '',
      v = Number(t.dataset.v);
    const c: Record<string, number> = Object.assign({}, d.chk || {});
    const was = CHK_Q.every(([q]) => c[q]);
    if (c[k] === v) delete c[k];
    else c[k] = v;
    act(
      () => {
        d.chk = Object.keys(c).length ? c : undefined;
      },
      { inProgress: true }
    );
    if (ui.modal && ui.modal.kind === 'checkin') {
      if (!was && CHK_Q.every(([q]) => c[q])) closeModal();
      else renderModal();
    }
    rerenderKeepScroll();
  },
  /* The check-in's lighter session (r30, r31): only the exercises not
     started become lighter (b.light: half their sets, about 90% loads, 3+
     RIR, no target); the session itself is not marked, so work already done
     at full effort still sets next time's target and counts in trends.
     Anything already logged or typed stays exactly as it is. Undo puts it back. */
  makeLight() {
    const d = state.draft;
    if (!d || d.light || d.deload) return;
    const todo = d.ex.filter(b => !b.light && !b.sets.some(x => !x.warm && !rowBlank(b, x)));
    if (!todo.length) {
      toast('Every exercise is started, so nothing changed');
      return;
    }
    act(
      () => {
        if ((d.notes || '') === (d.note0 || ''))
          d.notes =
            d.note0 = `Made lighter after the check-in: exercises not started, half sets at about ${pctOf(LIGHT_SHARE)}% loads.`;
        for (const b of todo) {
          b.light = true;
          const work = b.sets.filter(x => !x.warm);
          const keep = Math.max(1, Math.ceil(work.length / 2));
          let cut = work.length - keep;
          for (let i = b.sets.length - 1; i >= 0 && cut > 0; i--)
            if (!b.sets[i].warm) {
              b.sets.splice(i, 1);
              cut--;
            }
          refreshBlock(b);
        }
      },
      { inProgress: true, undo: true }
    );
    rerenderKeepScroll();
    toast(
      `Lighter: ${todo.length} exercise${todo.length === 1 ? '' : 's'} not started now half the sets at about ${pctOf(LIGHT_SHARE)}% loads`,
      true
    );
  },
  calSnooze() {
    act(() => {
      state.settings.calSnooze = today();
    });
    rerenderKeepScroll();
    toast(`The RIR check will come back in ${CAL_OFFER.weeks} weeks`);
  },
  bwAskNo() {
    prefSet(BWASK_KEY, '1');
    rerenderKeepScroll();
  },
  tStart(t) {
    const b = tapBlock(t);
    const d = state.draft;
    if (b && d && +b.plan.rest > 0) startTimer(+b.plan.rest, restNext(d.ex.indexOf(b)));
  },
  /* A session with nothing in it goes at once; one with anything entered
     (sets, reps, cardio, a note) asks first. An edit always asks, since the
     saved sets are already in it. */
  discard() {
    const d = state.draft;
    if (!d) return;
    const out = (): void => {
      act(
        () => {
          state.draft = null;
        },
        { inProgress: true }
      );
      stopTimer();
      wakeOff();
      // A workout set aside for this one comes back, offered on Today (R81-2).
      if (unpark()) setTimeout(() => toast(BACK_SAID.trim()), 0);
      window.scrollTo(0, 0);
      render();
    };
    if (!d.editingId && !draftEntered(d)) {
      out();
      toast('Session discarded');
      return;
    }
    if (d.editingId && editFp0.get(d.id) === editFp(d)) {
      out();
      toast('No changes made');
      return;
    }
    confirmBox(
      'Discard this session?',
      d.editingId
        ? 'Your edits will be lost. The saved session stays as it was.'
        : 'Sets and cardio logged in this session will not be saved.',
      'Discard',
      out,
      true
    );
  },
  finish: () => finish(),
  finishNow: () => finishNow()
};
