/* The shapes of the log's records, as normalize() writes them (src/12-storage.js
   until phase 4 moves it). Types only: nothing here exists at run time. A
   function takes the narrowest shape it reads (isWork reads a set's warm and
   reps, nothing else), so a draft row, a saved set and a test's literal all
   fit, and the types claim no more about the data than the code does. */

/** A muscle's key, in MUSCLES order. */
export type MuscleKey =
  | 'chest' | 'serratus' | 'lats' | 'upperBack' | 'traps' | 'lowerBack'
  | 'frontDelts' | 'sideDelts' | 'rearDelts' | 'rotatorCuff' | 'biceps' | 'triceps'
  | 'forearms' | 'abs' | 'obliques' | 'neck' | 'quads' | 'hamstrings' | 'glutes'
  | 'adductors' | 'abductors' | 'calves' | 'tibialis';

/** How the load number on an exercise reads (loadMode). */
export type LoadMode = 'each' | 'total' | 'side' | 'stack' | 'bw';

/** An exercise as the log keeps it: the library's built-ins and the lifter's own.
    Optional fields are absent unless set (normalize), so records keep their hash. */
export interface Exercise {
  id: string;
  name: string;
  primary: string;
  secondary: string[];
  equip: string;
  bw: boolean;
  rare: boolean;
  perSide: boolean;
  note: string;
  custom: boolean;
  archived: boolean;
  inc?: number | null;
  plates?: 'bar' | 'side' | 'sleeve' | 'none' | null;
  load?: 'each' | 'total' | 'side' | 'stack';
  timed?: true;
  kind?: 'compound' | 'iso';
  assist?: true;
  bwf?: number;
  maxLoad?: number;
  barKg?: number;
  goal?: { w: number; r: number };
}

/** A routine day's exercise: the plan for it. */
export interface PlanItem {
  uid: string;
  exId: string;
  sets: number;
  repMin: number;
  repMax: number;
  rir: number;
  rest: number;
  inc: number;
  ss: string | null;
  jump?: number;
}

/** The parts of a plan the engine reads (an item, or DEFAULT_PLAN with no ids). */
export type Plan = Omit<PlanItem, 'uid' | 'exId' | 'ss'> & Partial<Pick<PlanItem, 'uid' | 'exId' | 'ss'>>;

export interface Day {
  id: string;
  name: string;
  rest: boolean;
  items: PlanItem[];
}

export interface Routine {
  id: string;
  name: string;
  schedule: 'weekly' | 'cycle';
  days: Day[];
}

/** One logged set. `w` is the number as typed (below 0 only on an assisted lift),
    `rir` what was called, null when left blank. */
export interface LoggedSet {
  w: number;
  r: number;
  rir: number | null;
  warm: boolean;
  drop: boolean;
  cal?: unknown;
}

/** One exercise in a saved session. */
export interface LoggedBlock {
  exId: string;
  note: string;
  rr: [number, number] | null;
  cut?: true;
  light?: true;
  sets: LoggedSet[];
}

/** A saved session. */
export interface Session {
  id: string;
  date: string;
  dayIdx: number;
  dayId: string | null;
  durMin: number | null;
  dayName: string;
  routineId: string;
  notes: string;
  demo: boolean;
  deload: boolean;
  light: boolean;
  free?: true;
  chk?: unknown;
  ex: LoggedBlock[];
  t?: number;
}

/** One set as the analytics read it (a point in IDX's byEx): the load as typed,
    the reps, and `load`, the total moved where it differs (a bodyweight share added). */
export interface Point {
  w: number;
  r: number;
  load?: number | null;
}

/** The library's row for one exercise: id, name, primary muscle, helper muscles
    (space separated), equipment, flags (b bodyweight, r less common, s per side,
    t timed, a assisted) and a note. */
export type LibRow = readonly [id: string, name: string, primary: MuscleKey, secondary: string, equip: string, flags: string, note: string];
