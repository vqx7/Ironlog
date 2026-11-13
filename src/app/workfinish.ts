/* Finish and save (from workout.ts): the questions Finish asks first
   (sets not done, ramp-up sets, reps with no checkmark, loads or help
   missing), the session saved as the log keeps it, and the recap. */

import { act } from './act';
import { unpark } from './park';
import { isCompound, noE1 } from './library';
import { withPlanSets, pwOf } from './routines';
import { estMin } from './format';
import { rtfAt, isMissed, isWork, longBreak, RIR_CALL_TOP, PACE_LO } from './formulas';
import { putById, andList, today, iso, r1, EPS_SAME, MINUTE_S, SECOND_MS } from './util';
import { cleanCardio, keepExtra } from './normalize';
import { KNOWN_BLOCK, KNOWN_SESS, cleanChk } from './records';
import type { Rec } from './records';
import { loadNote } from './loads';
import { prName, prOverall } from './prs';
import { stripDemo } from './chunks';
import { demoRestore } from './storage';
import {
  EX,
  bwLoad,
  IDX,
  rirEff,
  loadLabel,
  oddLoad,
  lightZero,
  routineUpdates,
  invalidate,
  hardCredit,
  rirHalfOn,
  U,
  fmtW,
  sessModelMin,
  activeRoutine,
  freeMode,
  sinceBack
} from './live';
import { state, ui } from './store';
import { joinAdjacent, savedEx, draftCardio, effTarget, withNew, picsLast, typedMin } from './session';
import type { DraftSet, CardioEntry, SessionEx, Session } from './types';
import { setShort, fmtDateLong, fmtE, prSet, wasE } from './display';
import { W, blkOpen, blkRef, redraw } from './workstate';
import type { Draft } from './workstate';
import type { Pr } from './model';
import { blockProgress, calDueIdx, draftPlanMin, noteAsked, oddReps, rowBlank, setDone, settleLoad } from './worksets';
import { confirmBox, openModal, render } from './page';
import { stopTimer, wakeOff } from './timer';
import { toast, undoToastHide } from './toast';
import type { RoutineUpdate } from './plans';

/** An unmarked set lighter than a session's first top set reads as a warm-up at Finish under this share of the top load, when neither its RIR nor the best estimate says (a convention). */
const WARM_SHARE = { compound: 0.75, isolation: 0.8 } as const;
/** A session open longer than this many minutes was left open, so it is not timed. */
const TIMED_MAX_MIN = 360;
/** Said when a workout set aside for an edit or a past workout comes back. */
export const BACK_SAID = ' Your workout in progress is back: Resume it on Today.';

/* A lift back after a long break whose session beat every set since it came back, under its older best (V 2026-11-10: the lifter knows when they hit new numbers; an old best is never the goal). Said in the recap as
   Heaviest yet is, not counted as a PR: the heaviest set since if this session made it, else the set behind the best
   estimate since. The first session back has nothing since to beat; a lift with a PR or Heaviest yet this session
   is named there already. Read by the session, not its date, so a second session the same day never claims the
   first's set. */
/** The recap's Best since you came back: each lift of the session that beat its sets since it came back, as "Bench 255×3". */
function backBests(ex: readonly { exId: string }[], prAll: readonly Pr[], sid: string): string[] {
  const out: string[] = [];
  for (const id of new Set(ex.map(b => b.exId))) {
    if (prAll.some(p => p.exId === id && (p.big || p.type === 'Weight PR'))) continue;
    const r = sinceBack(id);
    if (!r || r.first) continue;
    const set = r.heavy && r.heavy.sid === sid ? r.heavy.p : r.est && r.est.sid === sid ? r.est.p : null;
    if (set) out.push(`${EX(id).name} ${setShort(EX(id), set.w, set.r)}`);
  }
  return out;
}

/** The lifts the recap's Heaviest yet line names before "and N more". */
const HEAVIEST_SHOWN = 4;

/* ---------- Finish ---------- */

/** Asks about sets left untouched when something was done (finish says when); true when it asked, and Finish waits on the answer. */
function askSetsLeft(d: Draft): boolean {
  let n = 0,
    left = 0;
  for (const b of d.ex)
    for (const x of b.sets) {
      if (x.warm) continue;
      n++;
      if (!x.done && rowBlank(b, x)) left++;
    }
  const any = d.ex.some(b => b.sets.some(x => x.done && !x.warm));
  if (any && left > 0) {
    confirmBox(
      `${left} of ${n} sets not done`,
      `Finish now and they are left out. An exercise with fewer sets than usual does not set your next target, and still counts toward its trend.`,
      'Finish now',
      () => {
        const dd = state.draft;
        if (!dd) return;
        dd._leftAsked = true;
        finish();
      },
      false,
      { label: 'Keep going', fn: () => {} }
    );
    return true;
  }
  return false;
}

/** Asks about done sets that look like ramp-ups (finish says which); true when it asked. */
function askRamps(d: Draft): boolean {
  const ramps: { bi: number; si: number; name: string; txt: string }[] = [];
  for (const b of d.ex) {
    const e = EX(b.exId);
    const wk = b.sets.filter(x => x.done && !x.warm && !x.drop && +(x.r ?? 0) > 0);
    if (wk.length < 2) continue;
    const L = (x: DraftSet): number => bwLoad(e, d.date) + (+(x.w ?? 0) || 0);
    const top = Math.max(...wk.map(L));
    if (!(top > 0)) continue;
    const firstTop = b.sets.findIndex(
      x => x.done && !x.warm && !x.drop && +(x.r ?? 0) > 0 && Math.abs(L(x) - top) < EPS_SAME
    );
    const bi = d.ex.indexOf(b);
    const st = IDX().exStats[b.exId];
    /* The lift's strength as its targets read it: after a long break it starts fresh, so its best from before
       is no measure of how easy today's lighter sets were; with sessions since, their best is (sinceBack). */
    const back = sinceBack(b.exId);
    const est = st && longBreak(st.last, d.date) ? undefined : back ? back.est?.v : st ? st.bestAll : undefined;
    const thr = isCompound(e) ? WARM_SHARE.compound : WARM_SHARE.isolation;
    const easy = (x: DraftSet): boolean => {
      if (!(L(x) < top - EPS_SAME)) return false;
      const q = rirEff(x, e, d);
      if (q != null) return q >= RIR_CALL_TOP;
      if (est && !noE1(e)) {
        const rtf = rtfAt(est, L(x));
        if (rtf != null) return rtf - +(x.r ?? 0) >= RIR_CALL_TOP;
      }
      return L(x) < top * thr;
    };
    const appSet = (x: DraftSet, si: number): boolean =>
      (b.sw != null && Math.abs((+(x.w ?? 0) || 0) - b.sw) < EPS_SAME) || (!!b.adj && b.adj.up && si <= b.adj.at);
    b.sets.forEach((x, si) => {
      if (
        si < firstTop &&
        x.done &&
        !x.warm &&
        !x.drop &&
        +(x.r ?? 0) > 0 &&
        (e.bw || +(x.w ?? 0) > 0) &&
        !appSet(x, si) &&
        easy(x)
      )
        ramps.push({ bi, si, name: e.name, txt: `${loadLabel(e, +(x.w ?? 0) || 0)}×${x.r}` });
    });
  }
  if (ramps.length) {
    const done = (): void => {
      const dd = state.draft;
      if (!dd) return;
      act(
        () => {
          dd._rampAsked = true;
        },
        { inProgress: true }
      );
      finish();
    };
    confirmBox(
      'These look like ramp-up sets',
      `${[...new Set(ramps.map(r => r.bi))]
        .map(bi => {
          const rs = ramps.filter(r => r.bi === bi);
          return `${rs[0].name}: ${rs.map(r => r.txt).join(', ')}`;
        })
        .join(
          '; '
        )}. Lighter and easy, before your top set. Mark ${ramps.length > 1 ? 'them' : 'it'} as warm-up${ramps.length > 1 ? 's' : ''}?`,
      `Mark as warm-up${ramps.length > 1 ? 's' : ''}`,
      () => {
        const dd = state.draft;
        if (!dd) return;
        act(
          () => {
            for (const r of ramps) {
              const x = dd.ex[r.bi] && dd.ex[r.bi].sets[r.si];
              if (x) {
                x.warm = true;
                x.drop = false;
              }
            }
          },
          { inProgress: true }
        );
        done();
      },
      false,
      { label: 'Keep as working sets', fn: done }
    );
    return true;
  }
  return false;
}

/** Asks about sets with reps and no tick (finish says how); true when it asked. */
function askUnchecked(d: Draft): boolean {
  const unchecked: { n: number; name: string }[] = [];
  for (const b of d.ex) {
    const n = b.sets.filter(s => !s.done && (+(s.r ?? 0) > 0 || isMissed(s))).length;
    if (n) unchecked.push({ n, name: EX(b.exId).name });
  }
  if (unchecked.length) {
    const list = unchecked.map(u => `${u.name} (${u.n} set${u.n > 1 ? 's' : ''})`).join(', ');
    const total = unchecked.reduce((a, u) => a + u.n, 0);
    confirmBox(
      'Some sets are not marked done',
      `${total} set${total > 1 ? 's have' : ' has'} reps entered but no checkmark, so ${total > 1 ? 'they' : 'it'} will not be saved: ${list}.`,
      `Mark ${total > 1 ? 'them' : 'it'} done and save`,
      /* Each set is ticked in turn; one far off asks first, and once it is logged the rest are ticked and the
         session saved, with no second tap on Finish. Fix it leaves the workout open there. */
      function markAll(): void {
        const dd = state.draft;
        if (!dd) return;
        for (const [bi, b] of dd.ex.entries())
          for (const [si, s] of b.sets.entries())
            if (!s.done && (+(s.r ?? 0) > 0 || isMissed(s))) {
              if (oddReps(b, s) || oddLoad(b, si, dd.date) || lightZero(b, si, dd.date)) {
                setDone(bi, si, true, false, markAll);
                if (!s.done) return;
              } else
                act(
                  () => {
                    settleLoad(b, si);
                    noteAsked(dd, b, si);
                    s.done = true;
                  },
                  { inProgress: true }
                );
            }
        finishNow();
      },
      false,
      { label: 'Save without them', fn: () => finishNow() }
    );
    return true;
  }
  return false;
}

/* Sets left: finishing with half the planned sets untouched used to
   save without a word. Asked once, only when something was done, and not for
   an edit or a past workout typed in afterwards. Ramp-up sets logged as work
   count as hard sets and inflate weekly volume: a done working set before
   the first set at the exercise's top load is a likely warm-up when it was
   easy (logged at 5+ RIR, or with no RIR 5+ reps short of what the best
   estimate says that load allows; with neither, under 75% of the top load on
   a compound lift or 80% on isolation work), never one logged at 4 RIR or
   less (hard pyramid sets stay working sets), never a weighted set with no
   load (asked about below as a missing load), and never a set at the
   load the app suggested or one the app itself raised the load after.
   Asked once per session; either answer moves on. Only sets marked
   done are saved, but sets with reps and no tick are counted first and the
   lifter may keep them, a typed 0 (a missed set) among them, warm-ups
   too (the audit); reps or a load far off ask first, as when ticked
   (the audit: 110 reps put off once was saved here). */
export function finish(): void {
  const d = state.draft;
  if (!d) return;
  if (!d._leftAsked && !d.editingId && !d.past && askSetsLeft(d)) return;
  if (!d._rampAsked && askRamps(d)) return;
  if (askUnchecked(d)) return;
  finishNow();
}

/* Nothing is marked trimmed since r54 (V's one rule, PENDING 312 E): an
   exercise with fewer sets than usual, stopped early, Short on time, typed
   in afterwards or edited, is read so from the log (analytics.ts, idxShort),
   so it sets no target and still counts toward its trend. savedEx
   (session.ts) is one source with a first link keeping another device's
   workout; side by side, the same lift is saved as one exercise
   (V), apart each stays where it was done; on a day of a routine each
   lift keeps the sets its plan gave it (withPlanSets). A blank load on
   a weighted lift used to save silently as a real 0 set, which drags down
   volume load and still counts toward your weekly sets: asked as "add them"
   first, Add loads going back to the first one, opened, its
   load field focused. */
export function finishNow(): void {
  const d = state.draft;
  if (!d) return;
  const ex = picsLast(
    withNew(
      withPlanSets(joinAdjacent(d.ex.map(savedEx).filter(b => b.sets.length)), d, state.routines, {
        routineId: activeRoutine().id,
        freestyle: freeMode()
      }),
      d
    )
  );
  const cardio = draftCardio(d).map(c => cleanCardio(c));
  if (!ex.length) {
    if (cardio.length && !d.editingId) {
      act(() => {
        putById(state.cardio, cardio);
        state.draft = null;
      });
      stopTimer();
      wakeOff();
      const back = unpark();
      ui.todayDay = null;
      window.scrollTo(0, 0);
      render();
      toast(`Cardio saved. No lifting session was recorded.${back ? BACK_SAID : ''}`);
      return;
    }
    toast('Mark at least one set done');
    return;
  }
  const blanks: string[] = [];
  for (const b of ex) {
    const e = EX(b.exId);
    if (e.bw) continue;
    const n = b.sets.filter(s => !(+s.w > 0) && isWork(s)).length;
    if (n) blanks.push(`${e.name} (${n} set${n > 1 ? 's' : ''})`);
  }
  const help: string[] = [];
  for (const b of d.ex) {
    const e = EX(b.exId);
    if (!e.assist) continue;
    const n = b.sets.filter(s => s.done && !s.warm && s.w == null).length;
    if (n) help.push(`${e.name} (${n} set${n > 1 ? 's' : ''})`);
  }
  const save = (): void => saveSession(d, ex, cardio);
  if (blanks.length || help.length)
    confirmBox(
      blanks.length ? 'Add the missing loads?' : 'Add the help you used?',
      [
        blanks.length
          ? `${andList(blanks)} ${blanks.length > 1 ? 'have' : 'has'} reps but no weight. Saved like this, they count as hard sets but give no estimate, PR, or weight lifted.`
          : '',
        help.length
          ? `${andList(help)} ${help.length > 1 ? 'have' : 'has'} no help typed, so saved like this ${help.length > 1 ? 'they read' : 'it reads'} as no help, your full bodyweight.`
          : ''
      ]
        .filter(Boolean)
        .join(' '),
      blanks.length ? 'Add loads' : 'Add the help',
      () => {
        const dr = state.draft;
        if (!dr) return;
        for (let bi = 0; bi < dr.ex.length; bi++) {
          const b = dr.ex[bi];
          const e = EX(b.exId);
          if (e.bw && !e.assist) continue;
          const si = b.sets.findIndex(x => x.done && (e.assist ? x.w == null : !(+(x.w ?? 0) > 0)));
          if (si < 0) continue;
          blkOpen(bi, b);
          render();
          W.needAt = { b: blkRef(bi), s: si };
          redraw();
          const f = document.querySelector<HTMLElement>(`[data-f="w"][data-b="${bi}"][data-s="${si}"]`);
          if (f) {
            f.scrollIntoView({ block: 'center' });
            f.focus();
          }
          return;
        }
      },
      false,
      { label: 'Save anyway', fn: save }
    );
  else save();
}

/** The recap's counts: working sets, missed sets and hard sets as the week counts them. */
function setCounts(ex: ReturnType<typeof savedEx>[], date: string): { work: number; miss: number; hard: number } {
  const work = ex.reduce((a, b) => a + b.sets.filter(isWork).length, 0),
    miss = ex.reduce((a, b) => a + b.sets.filter(q => !q.warm && !q.drop && isMissed(q)).length, 0),
    hard = r1(
      ex.reduce((a, b) => {
        const e = EX(b.exId);
        return a + b.sets.reduce((c, q) => c + hardCredit(q, e, date), 0);
      }, 0)
    );
  return { work, miss, hard };
}

/** A PR as the recap says it: the lift, what was done, and what it beat. */
function recapPr(pr: Pr): { name: string; what: string; was: string } {
  const e = EX(pr.exId);
  if (pr.type === 'Weight PR')
    return {
      name: e.name,
      what: `Weight PR, ${setShort(e, pr.w, pr.r)}${pr.value != null && isCompound(e) ? `, best estimate ${fmtE(pr.value)} ${U()}${loadNote(e)}` : ''}`,
      was: e.assist
        ? 'less help than ever'
        : isFinite(pr.prevW ?? NaN)
          ? `heaviest before ${e.bw ? loadLabel(e, pr.prevW ?? 0) : fmtW(pr.prevW) + ' ' + U()}`
          : ''
    };
  const ps = pr.type === 'e1RM' && !isCompound(e) ? prSet(pr.exId, pr.date) : null;
  if (ps) return { name: e.name, what: `PR, ${setShort(e, ps.w, ps.r)}`, was: 'your best for that number of reps' };
  return pr.type === 'e1RM'
    ? {
        name: e.name,
        what: `${prName(pr)} ${fmtE(pr.value)} ${U()}${loadNote(e)}`,
        was: prOverall(pr)
          ? wasE(pr.value, pr.prevAll)
            ? `was ${wasE(pr.value, pr.prevAll)}`
            : ''
          : wasE(pr.value, pr.prev)
            ? `was ${wasE(pr.value, pr.prev)} at those reps`
            : ''
      }
    : {
        name: e.name,
        what: `${e.timed ? 'Time' : 'Rep'} PR, ${setShort(e, pr.w, pr.r)}`,
        was: pr.prevR ? `was ${pr.prevR} ${e.timed ? 's' : 'reps'} at this load or heavier` : 'heaviest yet'
      };
}

/* The session saved, then the recap. Timed only when started and finished
   today in this app; an edit keeps whatever the original session measured.
   When it started: kept on an edit, else the start (or now, for a past
   workout entered later); and, new, what its routine planned a week.
   An RIR check offered and passed over waits 3 weeks, as Not now does,
   read before the session is saved, since the check counts sessions. An
   edit rebuilds the session from the screen, so fields a newer build stored
   on it, or on an exercise still in its place, are carried over (as
   normalize keeps them), each exercise matched by its lift in order. A new
   session goes in by id: the other phone's copy of this workout, kept at its
   first link, is replaced, never held twice. A real session saved
   while demo data is loaded takes the demo away, so stats never mix
   generated sessions with yours. Saving an edit of a session deleted while
   the edit was open brings it back: the save is the newer action. The recap
   is worked out before the session in progress is cleared, while its ticks
   exist: only exercises with a set done count toward targets, not one
   with fewer sets than its target's; heavier than ever without a new
   best estimate is said once, quietly, not counted as a PR; the PR
   moment is its own gold block, each with what it beat. */
function saveSession(d: Draft, ex: ReturnType<typeof savedEx>[], cardio: CardioEntry[]): void {
  /* Timed by the clock from when the lifting began (begunAt), or, begun on a build that keeps no begunAt, from
     when it was opened, as that build times it; kept when it began on the day it is saved on (one set up the
     day before is moved to the day it begins, session.ts clockStart), so one that runs past
     midnight keeps its minutes, while a past workout logged later, or one moved to another date by hand, is not timed
     by it. A past workout and an edit from History take the minutes typed beside the date. */
  const began = d.begunAt || d.startedAt || 0;
  const clockMin =
    d.editingId || d.past || !d.startedAt || !began || iso(new Date(began)) !== d.date
      ? null
      : ((): number | null => {
          const m = Math.round((Date.now() - began) / (MINUTE_S * SECOND_MS));
          return m >= 1 && m <= TIMED_MAX_MIN ? m : null;
        })();
  const durMin = d.editingId || d.past ? typedMin(d) : clockMin;
  // Records carrying fields a newer build stored (keepExtra) are plain objects of their fields, as normalize builds them.
  const exR: (SessionEx & Rec)[] = ex.map(b => ({ ...b }));
  const sess: Session & Rec = {
    id: d.editingId || d.id,
    date: d.date,
    dayIdx: d.dayIdx,
    dayId: d.dayId || null,
    dayName: (d.dayName || '').trim() || 'Session',
    routineId: d.routineId,
    ex: exR,
    notes: d.notes || '',
    durMin,
    deload: !!d.deload,
    light: !!d.light,
    free: d.free ? true : undefined,
    chk: cleanChk(d.chk) || undefined
  };
  /* A session whose sets went in far faster than they can be lifted was
     entered after the workout, so its clock timed the typing, not the
     workout (V, 2026-11-02: 5 minutes for a whole session). It is saved
     untimed, by the bound the pace already uses to leave out such a session
     (under PACE_LO of what the time model gives its sets), and the recap says
     how to add its minutes. */
  let untimed = false;
  if (clockMin != null) {
    const model = sessModelMin(sess);
    if (model >= 1 && clockMin < PACE_LO * model) {
      sess.durMin = null;
      untimed = true;
    }
  }
  // The workout's pictures go last, after the start time and the plan's week Finish adds below, as normalize writes them.
  const sessPics = d.pics && d.pics.length ? [...d.pics] : undefined;
  let upd: RoutineUpdate | null = null,
    demoGone = false,
    targets = 0,
    beaten = 0,
    pmDraft = 0;
  const editing = !!d.editingId;
  act(() => {
    const was = d.editingId ? state.sessions.find(x => x.id === d.editingId) : null;
    const t0 = was ? was.t : began || Date.now();
    if (t0) sess.t = t0;
    const pw = d.editingId || d.free ? undefined : pwOf(state.routines, d.routineId);
    if (pw) sess.pw = pw;
    if (sessPics) sess.pics = sessPics;
    // The day's second workout, last, as normalize writes it.
    if (d.part === 2) sess.part = 2;
    if (!d.editingId) putById(state.cardio, cardio);
    if (!d.editingId && calDueIdx(d) >= 0 && !d.ex.some(b => b.sets.some(x => x.cal && x.done)))
      state.settings.calSnooze = today();
    upd = d.editingId ? null : routineUpdates(d);
    if (d.editingId) {
      const i = state.sessions.findIndex(s => s.id === d.editingId);
      if (i >= 0) {
        const o = state.sessions[i];
        // demo is written by an edit from the session it replaces, and absent on a new one, as Finish always wrote it.
        if (o.demo !== undefined) sess.demo = o.demo;
        // Its pictures are the edit's to keep or take off, so they are not carried from the copy saved before.
        keepExtra(o, sess, KNOWN_SESS);
        const used = new Set<object>();
        exR.forEach(b => {
          const ob = o.ex.find(x => x.exId === b.exId && !used.has(x));
          if (ob) {
            used.add(ob);
            // Its own new-machine mark is the edit's to keep or take off, so it is not carried from the copy saved before.
            keepExtra(ob, b, KNOWN_BLOCK);
          }
        });
        state.sessions[i] = sess;
      } else state.sessions.push(sess);
    } else putById(state.sessions, [sess]);
    demoGone =
      !d.editingId &&
      (state.sessions.some(x => x.demo) || state.bodyweights.some(x => x.demo) || state.measurements.some(x => x.demo));
    if (demoGone) {
      stripDemo(state);
      demoRestore();
      invalidate();
    }
    state.trash = state.trash.filter(t => !(t.kind === 'session' && t.id === sess.id));
    const tried = d.ex.filter(b => b.tgt && b.sets.some(x => x.done && !x.warm) && effTarget(b) === b.tgt);
    targets = tried.length;
    beaten = tried.filter(b => {
      const pr = blockProgress(b);
      return pr && pr.beat;
    }).length;
    pmDraft = draftPlanMin(d);
    state.draft = null;
  });
  stopTimer();
  wakeOff();
  // An Undo offered during the session (a trim, a removed set) has nothing left to undo once it is saved.
  undoToastHide();
  // A workout set aside for this one comes back now, offered on Today.
  const back = unpark();
  const prAll = IDX().prs.filter(
    p => (p.sid ? p.sid === sess.id : p.date === sess.date) && ex.some(b => b.exId === p.exId)
  );
  const prs = prAll.filter(p => p.big);
  const heavier = prAll.flatMap(p => {
    if (p.big || p.type !== 'Weight PR') return [];
    const e = EX(p.exId);
    return [`${e.name} ${setShort(e, p.w, p.r)}`];
  });
  const backBest = backBests(ex, prAll, sess.id);
  // Read with the session saved, as of its day, as the week counts it.
  const { work, miss, hard } = setCounts(ex, sess.date);
  ui.todayDay = null;
  window.scrollTo(0, 0);
  render();
  if (editing) {
    toast(`Session updated.${back ? BACK_SAID : ''}`);
    return;
  }
  if (back) toast(BACK_SAID.trim());
  const lines = [
    `${work} working set${work === 1 ? '' : 's'}, ${hard} ${rirHalfOn() ? 'counted toward the week' : 'counted as hard'}${miss ? `, and ${miss} missed` : ''}`
  ];
  // A session dated in the past says where it went, since it is not at the top of History.
  if (sess.date !== today()) lines.unshift(`Saved under ${fmtDateLong(sess.date)}`);
  if (sess.durMin) lines.push(`${sess.durMin} minutes${pmDraft && !sess.free ? `, planned ${estMin(pmDraft)}` : ''}`);
  else if (untimed)
    lines.push('Not timed: the sets went in faster than they can be lifted. Add its minutes by editing it in History.');
  if (targets) lines.push(`${beaten} of ${targets} exercise target${targets === 1 ? '' : 's'} beaten`);
  if (heavier.length) lines.push(`Heaviest yet: ${andList(heavier, HEAVIEST_SHOWN)}`);
  if (backBest.length) lines.push(`Best since you came back: ${andList(backBest, HEAVIEST_SHOWN)}`);
  const prList = prs.map(recapPr);
  if (cardio.length) lines.push(`Cardio and mobility: ${cardio.reduce((a, c) => a + c.min, 0)} min`);
  if (demoGone) lines.push('Demo data removed, so your stats show only your own sessions');
  openModal({
    kind: 'recap',
    title: 'Session saved',
    lines,
    prs: prList,
    note: prs.length
      ? ''
      : state.sessions.filter(x => !x.demo).length <= 1
        ? 'Your first session: these are your starting numbers.'
        : 'No PRs this time.',
    upd,
    sid: sess.id
  });
}
