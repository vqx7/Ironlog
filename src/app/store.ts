/* The app's shared state, owned here (phase 3a, r51): the log (state), what
   the screens are showing (ui), the sync's progress (cloud), and the account
   (acct; the wait for a new account's email is account.ts's own since r63).
   The legacy script imports them under the same names, so every
   reader is as it was. An import cannot be assigned to, so the log is
   replaced only through setState, which returns the value as the
   assignment did; the properties of ui and the log are still written from
   many places, and giving those writes one path is the work of phase 5
   (ARCHITECTURE.md); since 3b the engine and the analytics read the log
   through live.ts's model instead of importing it, and since r56 cloud is
   typed field by field, written by sync.ts and a few account actions. The
   four objects moved unchanged. */

import type { DbRack, EngineState, Measurement, Settings } from './types';
import type { BlkRef, DraftLike } from './session';
import type { Trashed } from './records';
import type { Modal } from './modals';

/** The whole log as normalize() returns it: the fields the engine and the
    analytics read, typed field by field since 3b (EngineState), the settings
    as normalize() keeps every one of them, the tape entries and the session
    in progress as the sync reads them (r56), Recently deleted as History
    reads it (r57), and the rest still open until they are typed with the
    screens that read them (phase 5). */
export type State = Omit<EngineState, 'settings' | 'draft'> & {
  version: number;
  settings: Settings;
  measurements: Measurement[];
  draft: DraftLike | null;
  trash: Trashed[];
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
  /** The tab shown before this one (Back's entry, and where a report from Settings says it came from). */
  prevTab?: string | null | undefined;
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
  modal: Modal | null;
  folds: Record<string, unknown>;
  rng: Record<string, unknown>;
  eqLast: unknown;
  /** Your gym's dumbbell fields as typed, until they make a rack (r33). */
  gymDb?: Partial<DbRack> | null | undefined;
  /** The unit Your gym is labelled in, chosen before anything is saved there. */
  gymU?: 'lb' | 'kg' | undefined;
  /** A ticked set unticked to ask about a load far off, to tick again once Fix it's load is in (r55): its block, through blkRef, and its row. */
  refix: { b: BlkRef | null; s: number } | null;
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
  eqLast: null,
  refix: null
};

/* ---------- the account's documents ---------- */

/** A snapshot of a document in the account: whether it exists, and its content, of no known shape until read. */
export interface CloudSnap {
  exists: boolean;
  data(): unknown;
}
/** One document in the account, by path: read whole, written whole, and (where the backend offers it) leased. */
export interface CloudRef {
  get(): Promise<CloudSnap>;
  set(doc: Record<string, unknown>): Promise<unknown>;
  acquire?(lease: { holder: string; ttlMs: number }): Promise<unknown>;
}
/** The account's document store, as scripts/cloud-supabase.js provides it (and the suites' stand-in): documents by path, and a listing of a collection's documents. */
export interface CloudDb {
  doc(path: string): CloudRef;
  collection(path: string): { get(): Promise<{ docs: (CloudSnap & { id: string })[] }> };
}

/** The merge base a sync note keeps for a document (baseOf, sync.ts): per
    record fingerprints by list (a), per field (f) and per setting (s) for
    core, or the session in progress's fingerprint (d) and, since r56.1, the
    copy itself (draft), so two phones' copies of one workout are merged set
    by set against it; a note an older build saved has the fingerprint alone. */
export interface Base {
  a?: Record<string, Record<string, string>>;
  f?: Record<string, string>;
  s?: Record<string, string>;
  d?: string;
  draft?: DraftLike | null | undefined;
}

/** Where the sync stands: off (local), reading the account (connecting), writing to it (saving), everything agreed (synced), or waiting for the network (offline). One function moves it (setCloud, sync.ts). */
export type CloudStatus = 'local' | 'connecting' | 'saving' | 'synced' | 'offline';
/** A sync note for one document: the fingerprint of the copy last agreed
    with the account, when that copy was written, and the merge base, absent
    on a note an older build saved (it is filled in on the next sync). */
export interface SyncNote {
  h: string;
  at: number;
  b?: Base | null | undefined;
}

/* Where the sync is: on or not, the provider (db, uid), its status, each
   document's last sync note (meta: its hash, when, and the merge base) and
   this device's hashes (localH), when each document was last edited here
   (editAt) and sent, the queue of writes (chain), and the last error. Typed
   field by field since r56, when its writers moved into sync.ts. The status
   becomes one set of states in r56.1 (PENDING 307). */
export interface Cloud {
  on: boolean;
  db: CloudDb | null;
  uid: string | null;
  status: CloudStatus;
  last: number | null;
  meta: Record<string, SyncNote>;
  editAt: Record<string, number>;
  localH: Record<string, string>;
  devId: string | null;
  /** The account the notes belong to, or null for notes saved before accounts existed. */
  acct: string | null;
  pendAt: number | null;
  chain: Promise<unknown>;
  t: number | null;
  retry: number;
  dirtyAt: number;
  lastPull: number;
  err: string | null;
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
  acct: null,
  pendAt: null,
  chain: Promise.resolve(),
  t: null,
  retry: 0,
  dirtyAt: 0,
  lastPull: 0,
  err: null
};

/* ---------- the page, as the storage and sync code reaches it ---------- */

/* The storage and sync modules (layer 3) redraw the page, ask, show a toast
   and read the first page's state through this one object, filled once at
   start with the page's own functions, since a module of layer 3 may not
   import a screen. The screens themselves (layer 4) import the page's
   functions from page.ts, toast.ts and timer.ts (r63; until r63 every effect
   came through here, filled by the legacy script). */
/** The page's effects the storage and sync code calls. */
export interface Fx {
  /** Redraws the page. */
  render(): void;
  /** Asks a question with two answers and Cancel (the confirm sheet): the answer, 'cancel' when the sheet is closed without one. */
  ask(title: string, body: string, ok: string, alt: string): Promise<'ok' | 'alt' | 'cancel'>;
  /** Redraws the page keeping the scroll position. */
  rerenderKeepScroll(): void;
  /** Shows a toast: the message, whether it offers Undo, for how long, and its kind. */
  toast(msg: string, undo?: boolean | null, ms?: number | null, kind?: string): void;
  /** Draws the save state's button (the menu button's dot and words). */
  setSaveState(): void;
  /** Redraws the sync line on Settings, when it is on screen. */
  syncLine(): void;
  /** Whether the first page is held open on this device after a sign-out (Today's obGate). */
  obGate(): boolean;
}
/* Set once at start, before anything that could call an effect runs (the !
   says so), as state is set by load(). */
export let fx!: Fx;

/** Gives the storage and sync code the screens' effects, once, at start. */
export function setFx(f: Fx): void {
  fx = f;
}

/** The account on this device: the user signed in, whether the check has run, and whether they read reports. */
export interface Acct {
  user: AcctUser | null;
  checked: boolean;
  reader: boolean;
}
/** A signed-in account, as the account service gives it (scripts/cloud-supabase.js, who()): its id and email. */
export interface AcctUser {
  id: string;
  email: string;
}
export const acct: Acct = { user: null, checked: false, reader: false };
