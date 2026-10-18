/* The shapes of the log's records that the modules read, as normalize()
   writes them (src/12-storage.js until phase 4 moves it). Types only: nothing
   here exists at run time. A function takes the narrowest shape it reads
   (isWork reads a set's warm and reps, nothing else), so a draft row, a saved
   set and a test's literal all fit, and the types claim no more about the data
   than the code does. An optional field may also hold undefined: normalize
   writes some as keys with no value, which JSON then drops. A shape is added
   here when code that reads it moves, so that something checks it. */

/** A muscle's key, in MUSCLES order. */
export type MuscleKey =
  | 'chest'
  | 'serratus'
  | 'lats'
  | 'upperBack'
  | 'traps'
  | 'lowerBack'
  | 'frontDelts'
  | 'sideDelts'
  | 'rearDelts'
  | 'rotatorCuff'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'abs'
  | 'obliques'
  | 'neck'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'abductors'
  | 'calves'
  | 'tibialis';

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
  inc?: number | null | undefined;
  plates?: 'bar' | 'side' | 'sleeve' | 'none' | null | undefined;
  load?: 'each' | 'total' | 'side' | 'stack' | undefined;
  timed?: true | undefined;
  kind?: 'compound' | 'iso' | undefined;
  assist?: true | undefined;
  bwf?: number | undefined;
  maxLoad?: number | undefined;
  barKg?: number | undefined;
  goal?: { w: number; r: number } | undefined;
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
  jump?: number | undefined;
}

/** The parts of a plan the engine reads (an item, or DEFAULT_PLAN with no ids). */
export type Plan = Omit<PlanItem, 'uid' | 'exId' | 'ss'> & Partial<Pick<PlanItem, 'uid' | 'exId' | 'ss'>>;

/** A routine's day: the plan for each of its exercises, in order, and whether it is a rest day. */
export interface Day {
  id: string;
  name: string;
  rest: boolean;
  items: PlanItem[];
}

/** A routine: its days, one per weekday (weekly) or repeating in order (cycle). */
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

/** One set as the analytics read it (a point in IDX's byEx): the load as typed,
    the reps, and `load`, the total moved where it differs (a bodyweight share added). */
export interface Point {
  w: number;
  r: number;
  load?: number | null | undefined;
}

/** The library's row for one exercise: id, name, primary muscle, helper muscles
    (space separated), equipment, flags (b bodyweight, r less common, s per side,
    t timed, a assisted) and a note. */
export type LibRow = readonly [
  id: string,
  name: string,
  primary: MuscleKey,
  secondary: string,
  equip: string,
  flags: string,
  note: string
];

/** A set in the session in progress: the load as typed (null until typed or
    taken from the grey load), the reps as typed (text while being typed),
    what was called, and its marks. */
export interface DraftSet {
  w: number | null;
  r: number | string | null;
  rir?: number | string | null | undefined;
  done?: boolean | undefined;
  warm?: boolean | undefined;
  drop?: boolean | undefined;
}

/** The target a block was given when the session started (cleanTgt keeps its numbers). */
export interface Target {
  kind: 'load' | 'reps';
  w?: number | null | undefined;
  repMin?: number | null | undefined;
  total?: number | null | undefined;
  n?: number | null | undefined;
  rs?: number[] | undefined;
  prevBest?: number | null | undefined;
}

/** One exercise in the session in progress: its plan, its rows, the target
    and suggestion it started with, an adjustment made mid-session (r34), and
    last time's sets for the Last column (r44). */
export interface DraftBlock {
  exId: string;
  plan: { sets?: number | undefined; rest?: number | string | undefined; ss?: string | null | undefined };
  sets: DraftSet[];
  light?: boolean | undefined;
  note?: string | undefined;
  rr?: [number, number] | null | undefined;
  cut?: boolean | undefined;
  tgt?: Target | null | undefined;
  target?: string | undefined;
  adj?: { at: number; w: number } | null | undefined;
  sw?: number | null | undefined;
  prev?: string[] | undefined;
  prevOff?: boolean | undefined;
  last?: string | undefined;
}
