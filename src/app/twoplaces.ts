/* One workout in two places: what becomes of the copy that loses a merge (its ticked sets joined to the session
   the other copy became, or saved as a session of their own), and what is said of it. Between phones and between
   tabs alike. */

import { fmtDate } from './format';
import { rec } from './records';
import { unionById } from './chunks';
import { Hx, canon, merge3List, mergeSession, recordKey } from './merge';
import { draftCardio, draftSession } from './session';
import type { DraftLike } from './session';
import type { CardioEntry } from './types';
import { chunkOf } from './chunks';
import { cleanCardio, normalize } from './normalize';
import { cloud, fx, setState, state } from './store';
import { log } from './storage';
import { laterThanSeen } from './edits';
import { saveMeta } from './syncnotes';
/* The session in progress is one record, so another device finishing or
   discarding it replaces this one's (the later edit wins). Said in its own
   words rather than the generic note. */
export function draftNote(prev: unknown, kept?: Kept, where = 'on another device'): void {
  const P = rec(prev);
  const d = state.draft;
  if (!P || (d && d.id === P.id)) return;
  /* Only called when the draft document itself came from the cloud, so a
     Finish or Discard made here during a sync is never put on another device.
     It says what it can see, and no more: the session it became, the workout
     that took its place, or just that it is closed. Whether a workout we
     cannot see was finished or discarded is not recorded anywhere, and the
     other phone's session document may simply not have arrived (a weak
     signal, a failed write), so "discarded" was a guess that came out wrong
     on a save that did not upload. The draft goes up last, so in the
     ordinary case the session is already here and this says saved. */
  if (P.editingId) {
    if (!d) fx.toast('The edit in progress was closed on another device.');
    else if (d.editingId) {
      const s = state.sessions.find(x => x.id === d.editingId);
      fx.toast(
        s
          ? `Now editing ${s.dayName || 'a session'}, ${fmtDate(s.date)}, opened on another device.`
          : 'A different saved session was opened for editing on another device.'
      );
    } else fx.toast('The edit in progress was replaced by the workout on another device.');
    return;
  }
  // What became of the sets ticked here (keepLost) is said with it: joined to the session the other phone
  // saved, or saved as a session of their own. A session of the workout's id with another workout now open was
  // either finished there or kept there from this copy; either way its sets are in History, and that is what is said.
  // Where it happened: another device, or another tab of this phone for a tab's merge (mergeIn).
  const saved = state.sessions.some(s => s.id === P.id);
  fx.toast(
    kept === 'joined' || kept === 'cardioJoined'
      ? `Your workout was saved ${where}. Sets done here since were added to it.`
      : kept === 'changed'
        ? `Your workout was saved ${where}. Your changes here were added to it.`
        : kept === 'saved' || kept === 'cardio'
          ? `Your workout was ${state.draft ? 'replaced by the one' : 'closed'} ${where}. Your ${kept === 'saved' ? 'sets are' : 'cardio is'} in **History**.`
          : state.draft
            ? saved
              ? `Your workout was replaced by the one ${where}. Your sets are in **History**.`
              : `Your workout was replaced by the one ${where}.`
            : saved
              ? `Your workout was saved ${where}.`
              : `Your workout was closed ${where}.`
  );
}
/* The copy of the workout in progress that loses a merge is never dropped:
   its ticked sets go into the log as a session,
   with its cardio rows and check-in, as a first link keeps another phone's
   workout (draftSession); when the same workout was finished on another
   phone (a session of its id is in the log), the sets join that session row
   by row against the copy both agreed on, and its cardio rows join the log's
   cardio, as Finish saves them (joining the sets alone would
   drop a copy with cardio and no ticked set whole). A copy
   that lost nothing (the same workout, still open), an edit of a saved
   session, or one with nothing ticked and no cardio is left alone. Only a
   copy that carried changes the account did not have is kept: the callers
   pass the local copy when it was dirty, and the account's copy a later edit
   here replaced. */
/* Whether a copy of a workout holds something logged that the copy both sides agreed on lacks: a set ticked or changed
   once ticked, or cardio entered. Only such a copy is kept when it loses a merge, between tabs and between phones alike:
   a load being typed, a question answered, or the same workout written back in another phone's form (fields it fills
   in, its sets as they were, by a phone that only opened the app) is no reason to bring back a workout discarded on
   the phone it was done on. With no agreed copy every set ticked counts. */
/** Whether copy `d` holds a set ticked or cardio entered that the agreed copy lacks (above). */
function loggedSince(d: DraftLike | null | undefined, agreed: DraftLike | null | undefined): boolean {
  if (!d) return false;
  const was = agreed && agreed.id === d.id ? agreed : null;
  const rows = new Set(was ? was.ex.flatMap(b => b.sets.filter(x => x.done).map(x => canon(x))) : []);
  const cards = new Set(was ? (was.cardio || []).map(c => canon(c)) : []);
  return (
    d.ex.some(b => b.sets.some(x => x.done && !rows.has(canon(x)))) ||
    (d.cardio || []).some(c => !!c.min && !cards.has(canon(c)))
  );
}

/** What became of a losing copy (keepLost): its sets saved as a session, joined to the one saved elsewhere, its cardio alone saved, its other changes (a date, a note) joined, or nothing. */
export type Kept = 'saved' | 'joined' | 'cardio' | 'cardioJoined' | 'changed' | null;
/* A copy of a workout finished elsewhere joins the session it became with every change the lifter made to it, not
   only its ticked sets: its date and its notes too, against the copy agreed (mergeSession is three-way, so what this
   copy did not change does not move). A copy discarded elsewhere is kept only for what was logged in it
   (loggedSince): a date or a note alone never brings back a discarded workout. */
/** Whether copy `d` holds something its session would keep that the agreed copy lacks: anything logged since (loggedSince), or, where a session of its id is saved to join, a change of the session's own fields (its date, its notes). */
export function changedSince(d: DraftLike | null | undefined, agreed: DraftLike | null | undefined): boolean {
  if (loggedSince(d, agreed)) return true;
  if (!d || !agreed || agreed.id !== d.id || d.editingId || !state.sessions.some(s => s.id === d.id)) return false;
  const a = draftSession(agreed, true),
    b = draftSession(d, true);
  return !!a && !!b && canon({ ...a, ex: [] }) !== canon({ ...b, ex: [] });
}
/** Keeps a losing copy's ticked sets and cardio (above); says what was done, for the toast. */
export function keepLost(
  lost: DraftLike | null | undefined,
  now: DraftLike | null,
  agreed: DraftLike | null | undefined,
  remoteWins: boolean,
  tabs = false
): Kept {
  if (!lost || lost.editingId || (now && now.id === lost.id)) return null;
  const have = state.sessions.find(q => q.id === lost.id);
  // Joined to a session saved elsewhere, every change counts (above); saved alone, only what was logged.
  const kept = have ? draftSession(lost, true) : draftSession(lost),
    cardio = draftCardio(lost);
  if (!kept && !cardio.length) return null;
  const was = agreed && agreed.id === lost.id ? agreed : null;
  if (have) {
    /* The agreed copy is the base, an agreed copy with nothing ticked an
       empty one (read as none, two identical sets ticked
       one on each phone would be matched as one). */
    const base = was ? draftSession(was, true) : null;
    const stat = { conflicts: 0 };
    // With no agreed copy (a note from a build before r56.1) the saved session's values stand where the two differ,
    // and only the rows this copy has and it lacks are added: Finish's duration and plan are not this copy's to undo.
    const joined = kept ? mergeSession(base, kept, have, base ? remoteWins : true, stat) : have;
    /* Its cardio rows merge against the agreed copy's, record by record, as
       its sets do: an edit made here is kept, a row the other phone deleted
       stays deleted (with the log's row standing as it was,
       an edit here would be lost and a deletion there come back). */
    const norm = (l: readonly unknown[]): CardioEntry[] => l.map(c => cleanCardio(c));
    const ids = new Set(
      [...(was ? draftCardio(was) : []), ...cardio].map(c => c.id).filter(x => typeof x === 'string')
    );
    const bh: Record<string, string> = {};
    for (const c of norm(was ? draftCardio(was) : [])) if (typeof c.id === 'string') bh[c.id] = Hx(c);
    const theirs = state.cardio.filter(c => ids.has(c.id));
    const merged = merge3List(was ? bh : null, norm(cardio), theirs, base ? remoteWins : true, stat);
    const cardioNow = [...state.cardio.filter(c => !ids.has(c.id)), ...merged];
    const sets = canon(joined) !== canon(have),
      rows = canon(normalize({ cardio: cardioNow }).cardio) !== canon(state.cardio);
    if (!sets && !rows) return null;
    setState(
      normalize({ ...state, sessions: state.sessions.map(q => (q.id === lost.id ? joined : q)), cardio: cardioNow })
    );
    edited(joined.date, lostKeys(lost.id, cardio));
    conflictNote(stat, tabs);
    if (!sets) return 'cardioJoined';
    return loggedSince(lost, was) ? 'joined' : 'changed';
  }
  // Closed on the other phone with no session of its id (discarded there): what was done here is kept, as its ticked sets are.
  setState(
    normalize({
      ...state,
      sessions: kept ? [...state.sessions, kept] : state.sessions,
      cardio: unionById(state.cardio, cardio)
    })
  );
  edited(lost.date, lostKeys(lost.id, cardio));
  return kept ? 'saved' : 'cardio';
}
/** The records keepLost writes: the session of a workout's id and its cardio rows, by their keys. */
const lostKeys = (id: string, cardio: readonly { id?: unknown }[]): string[] => [
  recordKey('sessions', id),
  ...cardio.flatMap(c => (typeof c.id === 'string' ? [recordKey('cardio', c.id)] : []))
];
/** Notes an edit of the half-month document of a date made here now (keepLost), and of its records `keys`, so a later merge of it reads this device's change as the later one; the flush that follows carries it. */
function edited(date: string, keys: readonly string[]): void {
  const id = chunkOf(date),
    at = laterThanSeen(Date.now());
  cloud.editAt[id] = at;
  const times = (cloud.recAt[id] = cloud.recAt[id] || {});
  for (const k of keys) times[k] = at;
  saveMeta();
}
/** Says what became of the account's copy of a workout that lost a merge here (keepLost): the sets ticked or the cardio logged on the other phone, saved, or added to the session saved here. */
export function lostNote(kept: Kept): void {
  if (kept === 'saved') fx.toast('Sets ticked on another device were saved in **History**.');
  else if (kept === 'joined') fx.toast('Sets ticked on another device were added to the session saved here.');
  else if (kept === 'cardio') fx.toast('Cardio logged on another device was saved in **History**.');
  else if (kept === 'cardioJoined') fx.toast('Cardio logged on another device was added to the session saved here.');
  else if (kept === 'changed') fx.toast('Changes made on another device were added to the session saved here.');
}
/** Says how many records were edited on two devices, if any (the later edit kept). */
/* What a clash kept, in words that are true of it. Between devices the later edit is kept, by each document's time
   of edit. Between two tabs of one phone the tab merging keeps the other tab's copy (mergeIn): when both changed one
   item before either heard the other, that copy may be the earlier change, so the words say whose was kept, not
   that it was later (not "The later edit was kept" of the earlier one). */
/** Says how many items were changed in two places at once, and which copy was kept: the later edit between devices (tabs false), the other tab's between tabs. */
export function conflictNote(stat: { conflicts: number; byTime?: number }, tabs = false): void {
  const n = stat.conflicts;
  if (!n) return;
  // Between tabs, the later change where every clash was decided by its records' times; else the other tab's.
  const later = !tabs || (stat.byTime || 0) === n;
  log(
    'sync-conflict',
    `${n} record(s) edited ${tabs ? `in two tabs; kept ${later ? 'the later change' : "the other tab's copy"}` : 'on two devices; kept the later edit'}`
  );
  const items = `${n} item${n === 1 ? ' was' : 's were'}`,
    was = n === 1 ? ' was' : 's were';
  fx.toast(
    tabs
      ? `${items} changed in two tabs at once. ${later ? `The later change${was}` : `The other tab's change${was}`} kept.`
      : `${items} edited on two devices. The later edit was kept.`
  );
}
