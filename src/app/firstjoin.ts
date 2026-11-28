/* The join of two logs a first sign-in makes, and of a log kept aside for an account with the log here: every
   record of both kept, a lift both hold joined field by field, two workouts in progress settled. The account's
   bookkeeping around it is the sync's (sync.ts). */

import { arr, sessCmp } from './records';
import type { Trashed } from './records';
import { realCount, stripDemo, unionById } from './chunks';
import { sameRecord } from './merge';
import { keptOnSession, unname } from './machines';
import { draftCardio, draftSession } from './session';
import type { Session } from './types';
import { joinExercises, machineReadings, nameSessions, normalize, plainTemplate, putAside } from './normalize';
import { routineEmpty } from './routines';
import { FIRST_MACHINE } from './model';
import { state } from './store';
import type { State } from './store';

/* Each log names a lift's first machine "0", its own first machine. Joined with another log that has the lift too, the
   sessions only this phone holds that it named "0" are left unnamed, so they read on the machine the joined log has
   them on by their dates, as the two logs read before sessions named their machines. One of them that then reads on a
   machine this phone added (a session back on its first machine after another was added) is named where the earliest
   of them reads, so the phone's first machine never becomes one it added. When the phone's earliest session of the lift
   is one the other log holds too (the same log, restored from a backup), both logs' first machine is the same one and
   every name stays. */
/** The sessions `ss` with the first machine's name taken off those `other` lacks (above); which ids lost it, by lift; and the ids of the sessions only `ss` holds, the keys of the machines it added. */
function firstUnnamed(
  ss: readonly Session[],
  other: readonly Session[]
): { sessions: Session[]; unnamed: Map<string, Set<string>>; own: Set<string> } {
  const there = new Set(other.map(q => q.id)),
    lifts = new Set(other.flatMap(q => q.ex.map(b => b.exId)));
  // A lift whose earliest session here is in the other log too: both logs' "0" is one machine. Read by date, as a past workout is put last.
  const shared = new Set<string>(),
    seen = new Set<string>();
  for (const q of [...ss].sort(sessCmp))
    for (const b of q.ex)
      if (!seen.has(b.exId)) {
        seen.add(b.exId);
        if (there.has(q.id)) shared.add(b.exId);
      }
  const strip = (b: Session['ex'][number]): boolean =>
    b.mc === FIRST_MACHINE && lifts.has(b.exId) && !shared.has(b.exId);
  const unnamed = new Map<string, Set<string>>();
  const sessions = ss.map(q => {
    if (there.has(q.id) || !q.ex.some(strip)) return q;
    return {
      ...q,
      ex: q.ex.map(b => {
        if (!strip(b)) return b;
        const ids = unnamed.get(b.exId) || new Set<string>();
        unnamed.set(b.exId, ids.add(q.id));
        const c = { ...b };
        unname(c);
        return c;
      })
    };
  });
  return { sessions, unnamed, own: new Set(ss.filter(q => !there.has(q.id)).map(q => q.id)) };
}
/** In the joined log `st` (above), names each session of `unnamed` that reads on a machine of `own` where the earliest of its lift's reads. */
function nameJoined(st: State, unnamed: ReadonlyMap<string, ReadonlySet<string>>, own: ReadonlySet<string>): void {
  const rd = machineReadings(st);
  const named = new Map<Session, Map<number, string>>();
  for (const [exId, ids] of unnamed)
    for (const light of [0, 1]) {
      let to: string | undefined;
      // Read by date, so the first met is the earliest, wherever a past workout put it in the log.
      for (const q of [...st.sessions].sort(sessCmp)) {
        const r = ids.has(q.id) ? rd.get(`${q.id}|${exId}|${light}`) : undefined;
        if (!r) continue;
        if (to === undefined) to = r.key;
        else if (own.has(r.key) && !own.has(to)) {
          const at = named.get(q) || new Map<number, string>();
          for (const i of r.at) at.set(i, to);
          named.set(q, at);
        }
      }
    }
  nameSessions(st, named);
}

/** A first sign-in on a phone that holds a log of its own: the two combined (below), the account's copy made the agreed base; true when the other phone's workout in progress was saved as a session. */

/** Whether log `S` holds anything the lifter made, as a first sign-in reads it, whichever layer decides the account:
    never demo data; a session, a weigh-in, a measurement, cardio, a workout, a routine the lifter built or a custom
    exercise. With none, the account's log is taken as it is. */
export function madeHere(S: State): boolean {
  const mine = { ...S };
  stripDemo(mine);
  return !!(
    realCount(mine) ||
    mine.bodyweights.length ||
    mine.measurements.length ||
    S.draft ||
    mine.cardio.length ||
    mine.routines.some(r => !plainTemplate(r) && !routineEmpty(r)) ||
    mine.exercises.some(e => e.custom)
  );
}
/** A first sign-in's join of the phone's log `mine` with the account's `rState`, as `mergeFirstLink` in sync.ts makes it and a log kept aside is joined (joinLogs): the joined log, its machines named, and whether the other phone's workout in progress was saved as a session. */
export function firstJoin(mine: State, rState: State): { joined: State; keptDraft: boolean } {
  // a routine or exercise made here is the phone's own too, never replaced by the account's
  const base = realCount(mine) > realCount(rState) ? mine : rState,
    other = base === mine ? rState : mine;
  /* Settings come from the side with more sessions, but exercises and routines are combined by id, so a custom
     exercise or routine made on the other device is not lost and its logged sets keep their name. A routine both hold
     is that side's copy; a lift both hold is that side's with each field set only on the other side taken from there
     (normalize.ts joinExercises), so neither phone's kg or lb, step, heaviest load, goal or bar for a lift is lost.
     Of two workouts in progress, this device's stays in progress and the other's ticked sets and cardio are saved, as
     Finish saves them, never dropped. */
  const aside = state.draft && rState.draft && rState.draft.id !== state.draft.id ? rState.draft : null;
  const kept = aside ? draftSession(aside) : null;
  const keptDraft = !!kept && ![...mine.sessions, ...rState.sessions].some(x => x.id === kept.id);
  const own = firstUnnamed(mine.sessions, rState.sessions);
  /* A session or cardio entry both logs hold with different contents (an old backup restored on the phone, say) keeps
     the account's copy, the one every other device has, and the phone's is put aside in Recently deleted, so nothing
     the account holds is taken back and nothing is lost. Copies that differ only in the machine names the phone kept
     are the same entry: the account's copy is kept with those names (machines.ts). */
  const trash: Trashed[] = unionById(state.trash, rState.trash);
  const acct = <T extends { id?: string | undefined; date: string }>(
    list: readonly T[],
    phone: readonly T[],
    kind: 'session' | 'cardio',
    keep: (y: T, x: T) => T
  ): T[] => {
    const by = new Map(phone.map(x => [x.id, x]));
    return list.map(y => {
      const x = y.id ? by.get(y.id) : undefined;
      if (!x || !x.id) return y;
      if (sameRecord(y, x)) return keep(y, x);
      putAside(trash, { ...x, id: x.id }, kind);
      return y;
    });
  };
  const acctSessions = acct(
      keptDraft && kept ? [...rState.sessions, kept] : rState.sessions,
      own.sessions,
      'session',
      keptOnSession
    ),
    acctCardio = acct(aside ? [...rState.cardio, ...draftCardio(aside)] : rState.cardio, mine.cardio, 'cardio', y => y);
  const joined = normalize({
    ...base,
    exercises: joinExercises(base.exercises, other.exercises),
    routines: unionById(base.routines, other.routines),
    sessions: unionById(acctSessions, own.sessions),
    bodyweights: unionById(mine.bodyweights, rState.bodyweights),
    measurements: unionById(mine.measurements, rState.measurements),
    cardio: unionById(acctCardio, mine.cardio),
    trash,
    draft: state.draft || rState.draft
  });
  nameJoined(joined, own.unnamed, own.own);
  return { joined, keptDraft };
}
/** A log kept aside joined with the lifter's log here, as a first link joins them: every record of both by id (the log kept aside winning a clash, a lift both hold joined field by field as a first link joins it), its settings, and the workout in progress here, which stays open as a first link keeps this device's, the other's ticked sets and cardio saved. */
export function joinLogs(base: State, here: State): State {
  const away = base.draft && here.draft && here.draft.id !== base.draft.id ? base.draft : null;
  const kept = away ? draftSession(away) : null;
  const own = firstUnnamed(kept ? [...here.sessions, kept] : here.sessions, base.sessions);
  const joined = normalize({
    ...base,
    exercises: joinExercises(base.exercises, here.exercises),
    routines: unionById(base.routines, here.routines),
    sessions: unionById(base.sessions, own.sessions),
    bodyweights: unionById(base.bodyweights, here.bodyweights),
    measurements: unionById(base.measurements, here.measurements),
    cardio: unionById(base.cardio, away ? [...here.cardio, ...draftCardio(away)] : here.cardio),
    trash: unionById(arr(base.trash) || [], arr(here.trash) || []),
    draft: here.draft || base.draft
  });
  nameJoined(joined, own.unnamed, own.own);
  return joined;
}
