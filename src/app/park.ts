/* A workout in progress set aside (R81-2, the review of 2.35; V, 2026-11-08:
   "go back and retroactively fix a prior workout first"). Editing a saved
   session or logging a past one opens it as the session in progress, and
   there is one; before 2.36 the question offered only to throw the open
   workout away, with no Undo. Now the open one is kept on this phone, with
   the account it was for, and comes back when the edit or past workout ends
   (saved, discarded or emptied), Today offering it as after Save and leave.
   It is the phone's own and never synced, so no build before this one meets
   it and nothing in the log changes shape; one is held at a time, and a
   second edit with one held asks first, as before. A copy that cannot come
   back at once (another account signed in, or the app closed halfway) is
   offered on Today until it does (`parkedHere`). */
import { act } from './act';
import { normalize } from './normalize';
import { parseJson, rec } from './records';
import { PARKED_KEY, log, prefDel, prefGet, prefSet } from './storage';
import { cloud, state, ui } from './store';

/** The account a set-aside workout belongs to: its id when syncing, '' when not. */
const who = (): string => (cloud.on && cloud.uid) || '';

/** The set-aside workout's record, if one is held: the account it was for and the workout as saved. */
function held(): { uid: string; draft: unknown } | null {
  const r = rec(parseJson(prefGet(PARKED_KEY) || 'null'));
  return r && typeof r['uid'] === 'string' ? { uid: r['uid'], draft: r['draft'] } : null;
}

/** Whether a workout is set aside on this phone, for any account. */
export const parkedHeld = (): boolean => held() != null;

/** Whether a workout set aside on this phone is this account's, so it can come back here. */
export const parkedHere = (): boolean => {
  const h = held();
  return !!h && h.uid === who();
};

/** Sets the workout in progress aside; false when there is none, one is held already, or the phone refused the write (the caller then asks, as before 2.36). */
export function parkDraft(): boolean {
  const d = state.draft;
  if (!d || parkedHeld()) return false;
  return prefSet(PARKED_KEY, JSON.stringify({ uid: who(), draft: d }));
}

/** Brings a set-aside workout of this account back as the session in progress, offered on Today; false when there is none to bring or a workout is open. */
export function unpark(): boolean {
  if (state.draft || !parkedHere()) return false;
  const h = held();
  const d = h ? normalize({ draft: h.draft }).draft : null;
  if (!d) {
    // A copy this build cannot read as a workout (damaged storage): said in the error log, not kept to be offered forever.
    log('park', 'a set-aside workout could not be read');
    prefDel(PARKED_KEY);
    return false;
  }
  act(
    () => {
      state.draft = d;
    },
    { inProgress: true }
  );
  prefDel(PARKED_KEY);
  ui.away = d.id;
  return true;
}

/** Keeps a set-aside workout with the log left on this phone when the account goes from it (signed out keeping a copy, or the account deleted): it is then the phone's own, as that log is. */
export function parkKeepHere(): void {
  const h = held();
  if (h) prefSet(PARKED_KEY, JSON.stringify({ uid: who(), draft: h.draft }));
}

/** Forgets a set-aside workout, as Erase everything forgets the log and a sign-out that takes the log off the phone does. */
export function parkForget(): void {
  prefDel(PARKED_KEY);
}
