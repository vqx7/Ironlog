/* The app's shared state, owned here (phase 3a, r51): the log (state), what
   the screens are showing (ui), the sync's progress (cloud), and the account
   (acct, and acctWait while a new account waits for its email to be
   confirmed). The legacy script imports them under the same names, so every
   reader is as it was. An import cannot be assigned to, so the log is
   replaced only through setState, which returns the value as the
   assignment did; the properties of ui, cloud and the log are still written
   from many places, and giving those writes one path is the work of phases
   4 and 5 (ARCHITECTURE.md); since 3b the engine and the analytics read the
   log through live.ts's model instead of importing it. The four objects are moved unchanged, and
   tests/moved.js holds them to r50's code. */

import type { EngineSettings, EngineState } from './types';

/** The whole log as normalize() returns it: the fields the engine and the
    analytics read, typed field by field since 3b (EngineState), and the rest
    still open until normalize() moves (phase 4). The settings are the
    engine's, typed, and since r53 the effort scale effort.ts reads, which
    the engine does not (normalize() keeps it 'half', 'rpe' or absent). */
export type State = Omit<EngineState, 'settings'> & {
  settings: EngineSettings & { rirScale?: 'half' | 'rpe' | undefined };
} & { [field: string]: unknown };

/* First set at start, from the save on this device (setState(load()) in the
   storage part), before anything reads it, which is what the ! says; after
   that it is replaced only through setState (a restore, a sync, Undo, and
   others). */
export let state!: State;

/** Replaces the whole log and returns it, as `state = next` did. */
export function setState(next: State): State {
  return (state = next);
}

/** Sessions History shows at a time, and adds with Show more: ui's first
    page (kept here, so the state layer imports no screen module). */
export const HIST_PAGE = 25;

/** What the screens are showing. Fields the legacy script adds later (the
    calendar's month, the bests list opened, and others) are allowed by the
    index signature; a field named here holds what its first value says. */
export interface Ui {
  blkOpen: Set<unknown>;
  help: Set<unknown>;
  tab: string;
  todayDay: unknown;
  mapSel: unknown;
  mapSrc: unknown;
  prevOpen: boolean;
  planView: string;
  histEx: string;
  histLimit: number;
  wkOpen: boolean;
  libQ: string;
  libM: string;
  libE: string;
  libKind: string;
  bRoutine: unknown;
  bLibOpen: boolean;
  bLibQ: string;
  bLibM: string;
  bTarget: number;
  openItem: unknown;
  dashEx: unknown;
  dashMuscle: string;
  volMode: string;
  histOpen: unknown;
  modal: unknown;
  folds: Record<string, unknown>;
  rng: Record<string, unknown>;
  eqLast: unknown;
  [field: string]: unknown;
}
export const ui: Ui = {
  blkOpen: new Set(),
  tab: 'today',
  todayDay: null,
  mapSel: null,
  mapSrc: null,
  prevOpen: false,
  help: new Set(),
  planView: 'routine',
  histEx: '',
  histLimit: HIST_PAGE,
  wkOpen: false,
  libQ: '',
  libM: '',
  libE: '',
  libKind: '',
  bRoutine: null,
  bLibOpen: false,
  bLibQ: '',
  bLibM: '',
  bTarget: 0,
  openItem: null,
  dashEx: null,
  dashMuscle: 'chest',
  volMode: 'region',
  histOpen: null,
  modal: null,
  folds: {},
  rng: {},
  eqLast: null
};

/* Where the sync is: on or not, the provider (db, uid), its status, each
   document's last sync record (meta: its hash, when, and the merge base) and
   this device's hashes (localH), when the log was last edited and sent, the
   queue of writes (chain), and the last error. */
export interface Cloud {
  on: boolean;
  db: unknown;
  uid: unknown;
  status: string;
  last: unknown;
  meta: Record<string, unknown>;
  editAt: Record<string, unknown>;
  localH: Record<string, unknown>;
  devId: unknown;
  pendAt: unknown;
  chain: Promise<unknown>;
  t: unknown;
  retry: number;
  dirtyAt: number;
  lastPull: number;
  err: unknown;
  [field: string]: unknown;
}
export const cloud: Cloud = {
  on: false,
  db: null,
  uid: null,
  status: 'local',
  last: null,
  meta: {},
  editAt: {},
  localH: {},
  devId: null,
  pendAt: null,
  chain: Promise.resolve(),
  t: null,
  retry: 0,
  dirtyAt: 0,
  lastPull: 0,
  err: null
};

/** The account on this device: the user signed in, whether the check has run, and whether they read reports. */
export interface Acct {
  user: unknown;
  checked: boolean;
  reader: boolean;
  [field: string]: unknown;
}
export const acct: Acct = { user: null, checked: false, reader: false };

/** A new account waiting for its email to be confirmed: kept in memory only (r21), the password never stored. */
export interface AcctWait {
  email: string;
  pw: string;
  t: number;
  timer: unknown;
  busy: boolean;
  last: number;
  [field: string]: unknown;
}
export const acctWait: AcctWait = { email: '', pw: '', t: 0, timer: null, busy: false, last: 0 };
