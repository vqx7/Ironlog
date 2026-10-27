/* Starting a session, and the ways to one (r63, from the legacy script's
   27-actions.js): a routine day, lighter or in a deload week, a blank
   session, Short on time, Limited equipment, Do again, an edit of a saved
   session, a past workout date first, and the days of the top bar and the
   calendar that lead to them. A new session in progress changes nothing the
   caches read (inProgress); the first run's choice of a blank session is a
   change to the log. */

import { addDays, isDate, monthOf, today, uid } from './util';
import { EQUIP } from './library';
import { fixSupersets, sessDayIdx } from './routines';
import { isWork } from './formulas';
import { sessCmp } from './records';
import type { DraftBlock, Plan } from './types';
import { DELOAD_NOTE, LIGHTER_NOTE, editFp, freeDraft, newRow } from './session';
import type { DraftLike } from './session';
import { estMin, min5 } from './format';
import { activeRoutine, eqPlan, exName, isDeloadWeek, planFor } from './live';
import { HIST_PAGE, state, ui } from './store';
import { act } from './act';
import { sessionsOn } from './display';
import { calBounds } from './calendar';
import { closeModal, confirmBox, openModal, render, renderModal, rerenderKeepScroll } from './page';
import { toast, toastQuiet } from './toast';
import { stopTimer, wakeOff, wakeOn } from './timer';
import { editFp0 } from './workstate';
import type { Tap } from './workstate';
import { draftEntered, newBlock, rowBlank, shortPlan } from './worksets';
import { swapPlan } from './actspick';

/** The most sets a lift done again in a deload records as its full count. */
const MAX_FULL = 30;
/** A swap in Limited equipment much harder than the lift it replaces is done for these (r30). */
const HARD_SWAP = { repMin: 3, repMax: 6, rir: 2 } as const;
/** The longest name Do again gives a blank session. */
const AGAIN_CHARS = 40;
/** A month as the calendar keys it (YYYY-MM). */
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Half the sets, at least one, as a lighter day and a deload week do. */
const halfSets = (n: number): number => Math.max(1, Math.ceil(n / 2));
/** A plan as a session's block holds it: its superset null unless a routine item gave one. */
const blockPlan = (p: Plan): DraftBlock['plan'] => ({ ...p, ss: p.ss ?? null });

/* The session in progress replaced by another. One started now notes the
   notes the app wrote, so Discard can tell them from the lifter's, and keeps
   the screen on; a past workout typed in and an edit of a saved session do
   neither, as before r63. */
/** Opens the session screen on a new session in progress: one started now (live), or a past workout or an edit. */
function begin(d: DraftLike, live: boolean): void {
  act(
    () => {
      state.draft = d;
      if (live) d.note0 = d.notes || '';
    },
    { inProgress: true }
  );
  window.scrollTo(0, 0);
  render();
  if (live) wakeOn();
}

/* ---------- a past workout, date first ----------
   The phone was left at home, so the sets are on paper or in memory. The
   date comes first and everything is read as of that day: which routine day
   was due, last time's numbers and targets, and PRs. The logger then runs in
   quick entry (draft.past): no rest timer, no clock, no check-in, and a set
   ticks itself once its reps are typed, so a whole workout goes in one pass.
   The session is saved under its date, so next up, targets and PRs after it
   read correctly even when it is entered after later sessions. Its sheet
   and the day due then are src/app/sheetsapp.ts's since r62. */
/* Never a deload (r54, from the audit V asked for): the week's mark does not
   say which day Deload week was tapped, so a workout logged for a day before
   it opened and saved as one. It is logged as what was done, and a lift done
   lighter reads lighter from its numbers. */
/** A past workout's session: the routine day given, or a blank one, on its date. */
export function pastDraft(date: string, di: number | null): DraftLike {
  const R = activeRoutine();
  const day = di == null ? null : R.days[di];
  if (!day || di == null) return { ...freeDraft('Freestyle'), date, startedAt: null, past: true };
  return {
    id: uid(),
    startedAt: null,
    date,
    dayIdx: di,
    dayId: day.id,
    dayName: day.name,
    routineId: R.id,
    deload: false,
    light: false,
    past: true,
    cardio: [],
    notes: '',
    note0: '',
    editingId: null,
    ex: day.items.map(it => newBlock(it.exId, it, { before: date }))
  };
}

/** A blank session, with the picker open on it; in a week marked as a deload, a deload one. */
function startFree(): void {
  if (state.draft) {
    ui.tab = 'today';
    render();
    return;
  }
  // In a week marked as a deload, a blank session is one too, as a routine day and Do again are (r54, PENDING 311 c: it started at full sets).
  const dl = isDeloadWeek();
  ui.tab = 'today';
  begin({ ...freeDraft(dl ? 'Freestyle (deload)' : 'Freestyle'), deload: dl, notes: dl ? DELOAD_NOTE : '' }, true);
  openModal({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' });
}

/** A routine day started: lighter (half the sets at about 90% loads, one easy day, r30), or in a deload week (the same for the whole week, and flagged so it never counts against a lift's trend or stall read). */
function startSession(t: Tap): void {
  if (ui.modal) closeModal();
  toastQuiet();
  const R = activeRoutine();
  const di = Number(t.dataset.day);
  const d = R.days[di];
  if (!d) return;
  const light = t.dataset.light === '1';
  const deload = !light && isDeloadWeek();
  const items = d.rest ? [] : d.items.map(it => (light || deload ? { ...it, sets: halfSets(it.sets) } : it));
  begin(
    {
      id: uid(),
      startedAt: Date.now(),
      date: today(),
      dayIdx: di,
      dayId: d.id,
      dayName: d.name + (light ? ' (lighter)' : deload ? ' (deload)' : ''),
      routineId: R.id,
      deload,
      light,
      cardio: [],
      notes: light ? LIGHTER_NOTE : deload ? DELOAD_NOTE : '',
      editingId: null,
      ex: items.map(it => newBlock(it.exId, it, { deload, light }))
    },
    true
  );
}

/** A day in the top bar: today or ahead opens Today on it. */
function wkGo(t: Tap): void {
  const d = t.dataset.date;
  ui.tab = 'today';
  if (!state.draft) {
    const R = activeRoutine();
    const di = t.dataset.day != null ? Number(t.dataset.day) : null;
    ui.todayDay = d === today() || di == null || !R.days[di] ? null : di;
    // The date it was opened for, said on the card when past this week (329, r59).
    ui['todayAt'] = ui.todayDay == null ? null : { d, di };
  }
  if (ui.modal) closeModal();
  window.scrollTo(0, 0);
  render();
}

/** A saved session opened in History, with enough rows loaded to reach it. */
function wkOpen(t: Tap): void {
  if (ui.modal && ui.modal.kind === 'daypick') closeModal();
  const id = t.dataset.id;
  ui.tab = 'history';
  ui.histEx = '';
  ui.histOpen = id;
  // An older session may be past the first page of History: load enough rows to reach it.
  const at = [...state.sessions].sort((a, b) => sessCmp(b, a)).findIndex(x => x.id === id);
  ui.histLimit = Math.max(HIST_PAGE, at + 1);
  window.scrollTo(0, 0);
  render();
  try {
    const el = document.querySelector(`[data-act="histToggle"][data-id="${id}"]`);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
  } catch (e) {
    // Scrolling is best effort.
  }
}

/** Log a past workout: from an empty past day in the top bar (that date), or from History (yesterday, changeable in the sheet). */
function pastOpen(t: Tap | null | undefined): void {
  const v = t && t.dataset.date;
  const d = v && isDate(v) && v <= today() ? v : addDays(today(), -1);
  openModal({ kind: 'past', date: d });
}

/** Starting, and the days that lead to a start, by data-act. */
export const START_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  // 'calendar', not 'cal', the calibration set's sheet (r59: from r25 a calibration set opened the calendar and threw).
  calOpen(t) {
    const v = t && t.dataset ? t.dataset.ym : undefined;
    const ym = v && MONTH_RE.test(v) ? v : monthOf(today());
    if (ui.modal) closeModal();
    openModal({ kind: 'calendar', ym });
  },
  calMonth(t) {
    const inline = t.dataset.inline === '1';
    const m = ui.modal;
    const sheet = m && m.kind === 'calendar' ? m : null;
    if (!inline && !sheet) return;
    const kept = ui['calYm'];
    const cur = inline || !sheet ? (typeof kept === 'string' && kept) || monthOf(today()) : sheet.ym;
    const { min, max } = calBounds();
    let ym: string;
    // This month, now the calendar goes a year ahead (329, r59).
    if (t.dataset.v === 'now') ym = monthOf(today());
    else {
      const [y = 0, mo = 1] = cur.split('-').map(Number);
      const d = new Date(y, mo - 1 + (+(t.dataset.v ?? 0) || 0), 1);
      ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (ym < min || ym > max) return;
    if (inline || !sheet) {
      ui['calYm'] = ym;
      rerenderKeepScroll();
    } else {
      sheet.ym = ym;
      renderModal();
    }
  },
  calDay(t) {
    const d = t.dataset.date;
    if (!d || !isDate(d) || d > today()) return;
    if (ui.modal) closeModal();
    const ss = sessionsOn(d);
    const one = ss.length === 1 ? ss[0] : undefined;
    if (one) {
      wkOpen({ dataset: { id: one.id } });
      return;
    }
    // Two-a-days (r34): a day with more than one session asks which.
    if (ss.length > 1) {
      openModal({ kind: 'daypick', date: d });
      return;
    }
    if (d === today()) {
      wkGo({ dataset: { date: d } });
      return;
    }
    pastOpen({ dataset: { date: d } });
  },
  startFree,
  /* The session is built first so the sheet can preview what gets trimmed. If
     the sheet is closed without applying and nothing was logged, the session
     is removed again, since the user only asked a question. */
  startShort(t) {
    const had = !!state.draft;
    startSession(t);
    if (state.draft && !had) openModal({ kind: 'short', mins: null, temp: state.draft.id });
  },
  shortOpen() {
    if (state.draft) openModal({ kind: 'short', mins: null });
  },
  shortPick(t) {
    const m = ui.modal;
    if (!m || m.kind !== 'short') return;
    m.mins = Number(t.dataset.v);
    renderModal();
  },
  shortApply() {
    const m = ui.modal;
    const d = state.draft;
    if (!m || m.kind !== 'short' || !d || !m.mins) {
      closeModal();
      return;
    }
    const pl = shortPlan(d, m.mins);
    m.applied = true;
    if (!pl.changes.length) {
      closeModal();
      return;
    }
    const drop = new Set<number>();
    const removed = new Map<DraftBlock, DraftBlock['sets']>(),
      order = d.ex.slice(),
      did = d.id;
    act(
      () => {
        for (const x of pl.bl) {
          if (x.keep === x.undone) continue;
          const b = d.ex[x.bi];
          if (!b) continue;
          if (x.keep === 0 && !x.started) {
            drop.add(x.bi);
            continue;
          }
          // Only blank rows go, from the end; typed and ticked sets always stay.
          let n = x.undone - x.keep;
          const gone: DraftBlock['sets'] = [];
          for (let i = b.sets.length - 1; i >= 0 && n > 0; i--) {
            const s = b.sets[i];
            if (s && !s.warm && rowBlank(b, s)) {
              gone.unshift(...b.sets.splice(i, 1));
              n--;
            }
          }
          removed.set(b, gone);
        }
        d.ex = d.ex.filter((_b, bi) => !drop.has(bi));
        fixSupersets(d.ex.map(b => b.plan));
      },
      {
        inProgress: true,
        /* Undo puts back exactly what the trim took (r25): the blank rows, at
           the end of their exercise, and the skipped exercises in their
           places. Sets logged since stay (the merge Undo used before brought
           back skipped exercises but not removed rows). Nothing is marked
           since r54. */
        undo: () => {
          const dd = state.draft;
          if (!dd || dd.id !== did) return false;
          for (const [b, rows] of removed) if (dd.ex.includes(b)) b.sets.push(...rows);
          order.forEach((b, i) => {
            if (drop.has(i) && !dd.ex.includes(b)) dd.ex.splice(Math.min(i, dd.ex.length), 0, b);
          });
          fixSupersets(dd.ex.map(b => b.plan));
          return true;
        }
      }
    );
    closeModal();
    rerenderKeepScroll();
    toast(`Trimmed to ${estMin(min5(pl.est))}`, true);
  },
  /* Log a workout now is a freestyle choice (r34.2, from the review: the
     starter's 4 days a week became the bar for someone training 3 times as
     they liked, "0-week streak", "of 88 planned"). Today opens on a blank
     session, the starter stays one tap away as the plan, and the default
     targets stay, with nothing said over the exercise picker. */
  obFree() {
    act(() => {
      state.settings.onboarded = true;
      state.settings.todayStart = 'free';
    });
    startFree();
  },
  histRepeat(t) {
    const s = state.sessions.find(x => x.id === t.dataset.id);
    if (!s) return;
    const go = (): void => {
      const R = activeRoutine();
      const day = !s.free && s.routineId === R.id && s.dayId ? R.days.find(x => x.id === s.dayId) : undefined;
      const deload = isDeloadWeek();
      const plan = (b: (typeof s.ex)[number]): DraftBlock['plan'] => {
        const it = day && day.items.find(i => i.exId === b.exId);
        if (it) return deload ? { ...it, sets: halfSets(it.sets) } : { ...it };
        const p = planFor(b.exId);
        if (b.rr) {
          p.repMin = b.rr[0];
          p.repMax = Math.max(b.rr[0], b.rr[1]);
        }
        const n = b.sets.filter(isWork).length;
        if (n) p.sets = deload ? halfSets(n) : n;
        return blockPlan(p);
      };
      const ex = s.ex.map(b => {
        const nb = newBlock(b.exId, plan(b), { deload });
        const n = b.sets.filter(isWork).length;
        if (deload && n && !(day && day.items.some(i => i.exId === b.exId))) nb.full = Math.min(n, MAX_FULL);
        return nb;
      });
      ui.tab = 'today';
      begin(
        day
          ? {
              id: uid(),
              startedAt: Date.now(),
              date: today(),
              dayIdx: R.days.indexOf(day),
              dayId: day.id,
              dayName: day.name + (deload ? ' (deload)' : ''),
              routineId: R.id,
              deload,
              light: false,
              cardio: [],
              notes: deload ? DELOAD_NOTE : '',
              editingId: null,
              ex
            }
          : { ...freeDraft(s.free ? s.dayName : `Again: ${s.dayName}`.slice(0, AGAIN_CHARS), ex), deload },
        true
      );
      toast(day ? `${day.name} started with the same exercises` : 'Started as a freestyle session');
    };
    if (state.draft)
      confirmBox(
        'Replace the session in progress?',
        'You have an unsaved session open. Starting this one discards it.',
        'Discard and start',
        go,
        true
      );
    else go();
  },
  startSession,
  startAltOpen(t) {
    openModal({ kind: 'startAlt', di: Number(t.dataset.day), free: t.dataset.free === '1' });
  },
  // Another day of the plan on the card (the old Change day list); in a blank-session Today it shows that day's card.
  dayPick(t) {
    const i = Number(t.dataset.i);
    closeModal();
    ui.todayDay = i;
    ui['todayAt'] = null;
    window.scrollTo(0, 0);
    render();
  },
  /* Pick for me, before a session: rank the routine's days for today. */
  pickToday() {
    openModal({ kind: 'pickToday' });
  },
  pickView(t) {
    closeModal();
    ui.todayDay = Number(t.dataset.day);
    ui['todayAt'] = null;
    ui.tab = 'today';
    window.scrollTo(0, 0);
    render();
  },
  /* Limited equipment: pick what is available, preview the swaps, start. */
  eqOpen(t) {
    const di = Number(t.dataset.day);
    const R = activeRoutine();
    if (!R.days[di]) return;
    openModal({ kind: 'eq', day: di, equip: (ui.eqLast || EQUIP.map(x => x[0])).slice() });
  },
  eqToggle(t) {
    const m = ui.modal;
    if (!m || m.kind !== 'eq') return;
    const k = t.dataset.k || '';
    m.equip = m.equip.includes(k) ? m.equip.filter(x => x !== k) : [...m.equip, k];
    renderModal();
  },
  eqStart() {
    const m = ui.modal;
    if (!m || m.kind !== 'eq') return;
    const R = activeRoutine();
    const day = R.days[m.day];
    if (!day) {
      closeModal();
      return;
    }
    const eq = new Set(m.equip);
    const pl = eqPlan(day, eq).filter(x => x.to);
    if (!pl.length) {
      toast('Nothing in this workout fits that equipment');
      return;
    }
    ui.eqLast = m.equip.slice();
    closeModal();
    const deload = isDeloadWeek();
    const ex = pl.flatMap(x => {
      if (!x.to) return [];
      const it = deload ? { ...x.it, sets: halfSets(x.it.sets) } : x.it;
      // A much harder swap gets a range it can be done in (r30): 3 to 6 reps, 2 in reserve.
      const sp = x.from ? swapPlan(it, x.from, x.to, R, day.id) : { ...it };
      if (x.hard) Object.assign(sp, HARD_SWAP);
      const b = newBlock(x.to, sp, { deload });
      if (x.from) b.swappedFrom = x.from;
      return [b];
    });
    const sw = eqPlan(day, eq).filter(x => x.from);
    const note = sw.length
      ? 'Limited equipment: ' +
        sw.map(x => `${exName(x.from || '')} → ${x.to ? exName(x.to) : 'left out'}`).join('; ') +
        '.'
      : '';
    begin(
      {
        id: uid(),
        startedAt: Date.now(),
        date: today(),
        dayIdx: m.day,
        dayId: day.id,
        dayName: day.name + (deload ? ' (deload)' : ''),
        routineId: R.id,
        deload,
        light: false,
        limited: true,
        cardio: [],
        notes: [deload ? DELOAD_NOTE : '', note].filter(Boolean).join(' '),
        editingId: null,
        ex
      },
      true
    );
  },
  pastOpen,
  pastGo(t) {
    const m = ui.modal;
    if (!m || m.kind !== 'past') return;
    const date = m.date;
    const di = t.dataset.day === 'free' ? null : Number(t.dataset.day);
    const go = (): void => {
      stopTimer();
      wakeOff();
      ui.tab = 'today';
      ui.todayDay = null;
      begin(pastDraft(date, di), false);
      if (di == null) openModal({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' });
    };
    closeModal();
    const d = state.draft;
    if (d && (d.editingId || draftEntered(d)))
      confirmBox(
        'Replace the session in progress?',
        d.editingId
          ? 'You are editing a saved session. Your edits will be lost.'
          : 'You have an unsaved session open. Starting this one discards it.',
        'Discard and start',
        go,
        true
      );
    else go();
  },
  wkGo,
  wkOpen,
  histEdit(t) {
    const s = state.sessions.find(x => x.id === t.dataset.id);
    if (!s) return;
    const go = (): void => {
      const R = state.routines.find(r => r.id === s.routineId) || activeRoutine();
      const dayItems = s.free ? [] : (R.days[sessDayIdx(R, s)] || { items: [] }).items;
      const d: DraftLike = {
        id: uid(),
        editingId: s.id,
        deload: !!s.deload,
        light: !!s.light,
        free: s.free ? true : undefined,
        chk: s.chk ? { ...s.chk } : undefined,
        startedAt: null,
        durMin: s.durMin || null,
        date: s.date,
        dayIdx: s.dayIdx,
        dayId: s.dayId || null,
        dayName: s.dayName,
        routineId: s.routineId,
        notes: s.notes || '',
        ex: s.ex.map(b => {
          const it = dayItems.find(i => i.exId === b.exId);
          const plan = it ? { ...it } : blockPlan(planFor(b.exId, null, null, false, s.date));
          return {
            bid: uid(),
            exId: b.exId,
            plan,
            note: b.note || '',
            keepRR: b.rr || null,
            light: b.light ? true : undefined,
            hint: 'Editing saved sets.',
            lastR: [],
            sets: b.sets.map(x =>
              newRow({
                w: x.w,
                r: x.r,
                rir: x.rir,
                warm: !!x.warm,
                drop: !!x.drop,
                done: true,
                cal: x.cal ? { ...x.cal } : undefined,
                rid: x.rid
              })
            ),
            ...(b.nw ? { nw: true as const } : {})
          };
        })
      };
      editFp0.set(d.id, editFp(d));
      ui.tab = 'today';
      begin(d, false);
    };
    if (state.draft)
      confirmBox(
        'Replace the session in progress?',
        'You have an unsaved session open. Editing this one will discard it.',
        'Discard and edit',
        go,
        true
      );
    else go();
  }
};
