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
import { cloud, fx, state, ui } from './store';

/* The account whose log this phone holds, as the sync notes name it (cloud.acct): known from the start, before the
   sync is on (the review of 2.36, REV6-3: tagged by the sync, a workout set aside in the seconds before it started was
   tagged as no account's and never came back), and kept by a sign-out that keeps a copy, as the log is. A sign-in that
   takes the phone's log into an account takes the set-aside workout with it (parkedRetag, in takeAccount). */
/** The account a set-aside workout belongs to: the one whose log this phone holds, '' for a log of no account. */
const who = (): string => cloud.acct || '';

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

/* Before the phone lets go of an account (Sign out, either way, or Delete my account), a workout set aside for its log
   comes back into that log, so it goes where the log goes, as any workout in progress does (the review of 2.36,
   REV6-1: a sign-out that took the log off the phone took the set-aside copy with it, the only one, and REV6-4: one
   kept with a copy was tagged as no account's). With another workout open (the edit), nothing signs out until that one
   is saved or discarded. */
/** Whether the phone may let go of the account now: a set-aside workout of this log brought back first; false, said, while another workout is open. */
export function parkSettle(): boolean {
  if (!parkedHere()) return true;
  if (state.draft) {
    fx.toast('Your workout in progress is set aside. Save or discard the one open first, and it comes back.');
    return false;
  }
  return unpark();
}

/** Takes a set-aside workout off the phone, as Erase everything does, and returns what was stored, so its Undo can put it back. */
export function parkTake(): string | null {
  const v = prefGet(PARKED_KEY);
  prefDel(PARKED_KEY);
  return v;
}

/** Puts back what parkTake took (the Undo of Erase everything), unless a workout was set aside since. */
export function parkPut(v: string | null): void {
  if (v && !prefGet(PARKED_KEY)) prefSet(PARKED_KEY, v);
}
