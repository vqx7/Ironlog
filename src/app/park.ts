/* A workout in progress set aside (V, 2026-11-08: "go back and
   retroactively fix a prior workout first"). Editing a saved session or
   logging a past one opens it as the session in progress, and there is one,
   so rather than throw the open workout away, it is kept on this phone, with
   the account it was for, and comes back when the edit or past workout ends
   (saved, discarded or emptied), Today offering it as after Save for later.
   It is the phone's own and never synced, so no older build meets it and
   nothing in the log changes shape; one is held at a time, and a second edit
   with one held asks first. A copy that cannot come
   back at once (another account signed in, or the app closed halfway) is
   offered on Today until it does (`parkedHere`). */
import { act } from './act';
import { fmtDate } from './format';
import { normalize } from './normalize';
import { parseJson, rec } from './records';
import { PARKED_KEY, log, prefDel, prefGet, prefSet } from './storage';
import { onSaved } from './sync';
import { cloud, fx, state, ui } from './store';
import { addDays, iso, today } from './util';

/* The account whose log this phone holds, as the sync notes name it (cloud.acct): known from the start, before the
   sync is on (tagged by the sync, a workout set aside in the seconds before it started would be no account's and never
   come back), and kept by a sign-out that keeps a copy, as the log is. A sign-in that
   takes the phone's log into an account takes the set-aside workout with it (parkedRetag, in takeAccount). */
/** The account a set-aside workout belongs to: the one whose log this phone holds, '' for a log of no account. */
const who = (): string => cloud.acct || '';

/** The set-aside workout's record, if one is held: the account it was for, the workout as saved, and when it was set aside (null on a copy set aside by a build before 2.57, not yet seen by this one). */
function held(): { uid: string; draft: unknown; at: number | null } | null {
  const r = rec(parseJson(prefGet(PARKED_KEY) || 'null'));
  return r && typeof r['uid'] === 'string'
    ? { uid: r['uid'], draft: r['draft'], at: typeof r['at'] === 'number' ? r['at'] : null }
    : null;
}

/* A workout set aside and never brought back is kept PARK_KEEP_DAYS days from the day it was set aside, then removed
   when the app next opens (V 2026-11-09 08:11: "is it possible to delete it after 30 days?"; 30 is V's
   choice, a convention). It is the only copy of what was typed in it, so it never goes unannounced: Today's card says
   until when it is kept, and the removal is said as it happens, by that day. A copy set aside by a build before 2.57 carries no date;
   its days count from the first time this build opens with it, so none goes sooner than a card could have said. Only a copy
   this account can bring back is removed: one kept for another account waits for it. */
/** Days a set-aside workout is kept (above). */
const PARK_KEEP_DAYS = 30;
/** The day a set-aside workout was set aside and the last day it is kept, for Today's card; null when none is offered here. */
function parkedDates(): { set: string; until: string } | null {
  const h = parkedHere() ? waiting() : null;
  if (!h || h.at == null) return null;
  const set = iso(new Date(h.at));
  return { set, until: addDays(set, PARK_KEEP_DAYS) };
}
/** The words that say until when the workout set aside is kept (" Kept until Dec 11."), for Today's card, the one
    screen that shows it waiting with no workout open: while the edit or past workout it waits for is open, nothing is
    removed (parkTidy), so no date stands there. Empty when no date is known. */
export function keptUntil(): string {
  const d = parkedDates();
  return d ? ` Kept until ${fmtDate(d.until)}.` : '';
}
/** At start: dates a copy set aside by a build before 2.57, and removes one of this account kept past its last day, saying so (above). */
export function parkTidy(): void {
  const h = held();
  if (!h) return;
  if (h.at == null) {
    prefSet(PARKED_KEY, JSON.stringify({ uid: h.uid, draft: h.draft, at: Date.now() }));
    return;
  }
  /* The 30 days stand still while the edit or past workout the copy waits for is open (V, 2026-11-13): the lifter is
     in the middle of it, and saving or discarding it brings the copy back. Removed meanwhile, the copy of a lifter who
     left the app a month with the edit open was gone when he came back, though no screen he saw had given a date. */
  if (state.draft) return;
  const d = parkedDates();
  if (!d || today() <= d.until) return;
  prefDel(PARKED_KEY);
  fx.toast(`The workout set aside was removed: it was kept until ${fmtDate(d.until)}.`);
}
/** The id of a held record's workout, or null when it has none. */
const heldId = (h: { draft: unknown } | null): string | null => {
  const id = h ? rec(h.draft)?.['id'] : null;
  return typeof id === 'string' ? id : null;
};

/* The workout brought back in this visit whose set-aside copy is still held (V 2026-11-09 08:11: "if phone storage
   is full hold onto draft copy"): the copy is let go once a write of the log succeeds, which then holds the
   workout or what became of it (saved, discarded). Until then the log lives in memory alone, so the copy is the
   phone's only one: kept, and offered again only after the app is closed, when this visit's log is gone with it. */
let backHere: string | null = null;
/** Lets go of the copy of the workout brought back, once a write of the log succeeds (registered with onSaved at the first unpark). */
function letGo(): void {
  if (backHere == null) return;
  if (heldId(held()) === backHere) prefDel(PARKED_KEY);
  backHere = null;
}
let hooked = false;
/** The held record, unless it is the copy of the workout already brought back in this visit. */
const waiting = (): ReturnType<typeof held> => {
  const h = held();
  return h && backHere != null && heldId(h) === backHere ? null : h;
};

/** Whether a workout is set aside on this phone, for any account (not one already brought back whose copy waits for a save). */
export const parkedHeld = (): boolean => waiting() != null;

/** Whether a workout set aside on this phone is this account's, so it can come back here. */
export const parkedHere = (): boolean => {
  const h = waiting();
  return !!h && h.uid === who();
};

/* Only a workout, or a past workout being logged, is set aside: what is typed there is in the log nowhere else. An edit
   of a saved session is a copy of the log, stale the moment the log changes, so it is never set aside (set aside, an edit
   would come back after a newer edit of the same session was saved and write over it, and after its session was
   deleted, put it back). Opening another over an edit asks first. */
/** Sets the workout in progress aside; false when there is none, it is an edit of a saved session, one is held already, or the phone refused the write (the caller then asks). */
export function parkDraft(): boolean {
  const d = state.draft;
  // Any copy held, one waiting for a save included, is the only one of its workout: never written over.
  if (!d || d.editingId || held() != null) return false;
  return prefSet(PARKED_KEY, JSON.stringify({ uid: who(), draft: d, at: Date.now() }));
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
  // Its copy is let go by the save that holds it (letGo), not here: a phone that cannot save keeps it.
  if (!hooked) {
    onSaved(letGo);
    hooked = true;
  }
  backHere = d.id;
  try {
    act(
      () => {
        state.draft = d;
      },
      { inProgress: true }
    );
  } catch (e) {
    // Not brought back: the copy stays set aside, offered as before.
    backHere = null;
    throw e;
  }
  ui.away = d.id;
  return true;
}

/* The phone never lets go of a log while a workout is set aside for it: before an
   action that takes the log off the phone or replaces it (Sign out, either way; Delete my account; Erase everything;
   Load demo data; Replace my data; Copy my log in), a workout set aside for this log comes back into it, so it goes
   where the log goes and an Undo of the action brings it back with the rest, as any workout in progress. With another
   workout open (the edit), the action waits until that one is saved or discarded. Without this, a sign-out would take
   the only copy off the phone, an Undo after a reload could not bring it back, and a log replaced while
   signed out would leave it tagged for an account the phone no longer named. */
/** Whether the phone may let go of or replace its log now: a set-aside workout of this log brought back first; false, said, while another workout is open. */
export function parkSettle(): boolean {
  if (!parkedHere()) return true;
  if (state.draft) {
    fx.toast('Your workout in progress is set aside. Save or discard the one open first, and it comes back.');
    return false;
  }
  return unpark();
}
