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

/** A RIR as typed: a number, a numeric string, or blank. */
export type Rir = number | string | null | undefined;

/** A RIR check (a calibration set): taken to failure from `at` reps, with
    `pred` the reps in reserve the lifter called there (cleanCal). */
interface RirCheck {
  at: number;
  pred: number;
}

/** One logged set. `w` is the number as typed (below 0 only on an assisted lift),
    `rir` what was called, null when left blank; `rid` the row's own id, kept
    from the workout in progress since r56.1 (absent on sets saved before), so
    a workout finished on one phone and ticked further on another joins row by row. */
export interface LoggedSet {
  w: number;
  r: number;
  rir: number | null;
  warm: boolean;
  drop: boolean;
  cal?: RirCheck | undefined;
  rid?: string | undefined;
}

/** One exercise in a saved session: its sets, the planned range at the time
    (null on sessions logged before ranges were kept), and whether it was made
    lighter mid-session (r31), and the injury it was held for (`inj`, a muscle
    or a joint, r54: its load capped and no target while that was flagged).
    `cut` marked it trimmed from r24 to r53; since r54 it is neither written
    nor read (V's one rule reads the log), and sessions saved before keep it.
    `ps` is the sets its routine's plan gave it when saved (r58, 339 h): on
    a session saved on a day of a routine with the lift in it, absent on the
    rest, on an edit's new exercises and on sessions saved before r58.
    `nw` marks it done at a new machine or gym (r61, 343 7): the lift starts
    over from this session (sinceNew), absent unless marked. */
export interface SessionEx {
  exId: string;
  note: string;
  rr: [number, number] | null;
  cut?: true | undefined;
  light?: true | undefined;
  inj?: string | undefined;
  sets: LoggedSet[];
  ps?: number | undefined;
  nw?: true | undefined;
}

/** A saved session (cleanSess in the storage part). `t` is when it started,
    which orders two sessions on one day (r34); `chk` the check-in's answers;
    `pw` the sessions a week its routine planned when it was saved (r55, pwOf). */
export interface Session {
  id: string;
  date: string;
  dayIdx: number;
  dayId: string | null;
  durMin: number | null;
  dayName: string;
  routineId: string;
  notes: string;
  /** Made by Load demo data. normalize writes it on every session; one just saved by Finish carries it only when it is an edit of a saved session (the new one is read as false until the next load, as before r60). */
  demo?: boolean;
  deload: boolean;
  light: boolean;
  free?: true | undefined;
  chk?: Record<string, number> | undefined;
  ex: SessionEx[];
  t?: number | undefined;
  pw?: number | undefined;
}

/** A weigh-in, in kg. */
export interface Bodyweight {
  id: string;
  date: string;
  kg: number;
  demo: boolean;
}

/** A cardio or mobility entry (cleanCardio): its minutes, and where it sat
    against the lifting (`when`: before, after, or alone). */
export interface CardioEntry {
  id: string;
  date: string;
  kind: string;
  min: number;
  hr: number | null;
  when: string;
  note: string;
  demo: boolean;
  dist?: number | undefined;
}

/** A tape entry, in cm: the sites MEAS lists (library.ts), each absent unless measured. */
export interface Measurement {
  id: string;
  date: string;
  demo: boolean;
  arm?: number | undefined;
  forearm?: number | undefined;
  chest?: number | undefined;
  waist?: number | undefined;
  thigh?: number | undefined;
  calf?: number | undefined;
  neck?: number | undefined;
}

/** An injury the lifter flagged: a muscle or a joint (`m`), since `date`. */
export interface Injury {
  id: string;
  m: string;
  note: string;
  date: string;
}

/** A dumbbell rack as typed in Settings, in the gym's unit. */
export interface DbRack {
  lo: number;
  hi: number;
  st: number;
  fine?: number;
  fineTo?: number;
}

/** A saved gym, in the unit it is labelled in. */
export interface Gym {
  u: 'lb' | 'kg';
  db?: DbRack;
  kb?: number[];
  plates?: number[];
  stack?: number;
}

/** A saved profile as normalize() keeps it. */
export interface Profile {
  goal?: string;
  exp?: string;
  days?: number;
  focus?: string[];
}

/** The settings the engine and the analytics read, as normalize() keeps them:
    a field absent unless set is optional. */
interface EngineSettings {
  unit: 'lb' | 'kg';
  rirMode: 'on' | 'off' | 'cal';
  rirHalf?: true | undefined;
  // The effort scale the engine's sentences are worded in (r54).
  rirScale?: 'half' | 'rpe' | undefined;
  gym?: Gym | undefined;
  barKg: number | null;
  profile?: Profile | undefined;
  bands: Record<MuscleKey, [number, number]>;
  // The floors a first-run routine pick recorded (r44), whole sets per muscle.
  bandsFit?: Partial<Record<MuscleKey, number>> | undefined;
  // The muscles outside TARGETED the lifter gave a target with Set a target (r58), in muscle order; absent when none.
  ownTargets?: MuscleKey[] | undefined;
  priorities: MuscleKey[];
  restWeeks?: string[] | undefined;
  todayStart?: 'free' | undefined;
}

/** Every setting as normalize() keeps it (r56): the engine's, and the rest
    the screens and the storage read. A field absent unless set is optional;
    the rest are always written. A setting a newer build saved is kept beside
    these at run time (keepExtra does not run on the settings; normalize
    spreads them), unread by this build. */
export interface Settings extends EngineSettings {
  theme: 'system' | 'dark' | 'light';
  timerMode: 'auto' | 'manual' | 'off';
  timerSound: boolean;
  timerCompact: boolean;
  autoDone: boolean;
  accent?: 'blue' | 'volt' | 'ember' | 'pink' | 'violet' | 'cyan' | 'red' | undefined;
  rirAsk?: true | undefined;
  autoAdj?: false | undefined;
  bwEvery?: 0 | 7 | 30 | undefined;
  loadFill?: 'fill' | undefined;
  userName?: string | undefined;
  homeFolded: string[];
  secOrder: Record<string, string[]>;
  folds: string[];
  wakeLock: boolean;
  smallPlates?: true | undefined;
  hidden: string[];
  onboarded: boolean;
  calSnooze: string | null;
  tidyV: 0 | 1;
  heightCm: number | null;
  timeBudget: number | null;
  dashFolded: string[];
  lastExport: string | null;
  removedLib: string[];
  bwGoalPct: number | null;
}

/** The log as the engine and the analytics read it: these fields and no
    others, so the type checker refuses a read of any other (phase 3b). */
export interface EngineState {
  sessions: Session[];
  exercises: Exercise[];
  routines: Routine[];
  activeRoutineId: string;
  bodyweights: Bodyweight[];
  cardio: CardioEntry[];
  injuries: Injury[];
  deloadWeek: string | null;
  settings: EngineSettings;
  /** The session in progress as the rules read it: its day, and the lifts it marks as done at a new machine or gym (r61, liftReadIn); absent or null with none. */
  draft?: { date: string; ex: readonly { exId: string; nw?: true | undefined }[] } | null | undefined;
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
    what was called, its marks, and since r56.1 its own id (`rid`), so two
    phones' copies of one workout are merged row by row; a row an older build
    made has none and is matched by its place. */
export interface DraftSet {
  w: number | null;
  r: number | string | null;
  rir?: number | string | null | undefined;
  done?: boolean | undefined;
  warm?: boolean | undefined;
  drop?: boolean | undefined;
  cal?: RirCheck | null | undefined;
  rid?: string | undefined;
}

/** One entry of the error log Settings can copy: when, the area, the message, the build, and the first lines of the stack. */
export interface LogEntry {
  t: string;
  a: string;
  m: string;
  v: string;
  s?: string | undefined;
  /** How many times it came in a row, when more than once (r59); the time is the last one's. */
  n?: number | undefined;
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
    and suggestion it started with, an adjustment made mid-session (r34),
    last time's sets for the Last column (r44), and, for one added on a
    lighter day or in a deload with its sets halved, the count before
    (`full`, r54), for Finish's offer to the routine. `cut` marked it
    trimmed until r53, and is neither written nor read since r54. An edit
    from History keeps the saved range (`keepRR`); an exercise held for an
    injury carries its key (`inj`, r54). */
export interface DraftBlock {
  /** The exercise's own id in this session (r46), which a move or a merge keeps; absent on a session begun before r46. */
  bid?: string | undefined;
  exId: string;
  /** What it is done for: the sets, rest, superset, range, effort and load step a routine item or the lift's default gave it; normalize writes every one but the jump (a superset's letter key, or null). */
  plan: {
    sets: number;
    rest: number;
    ss: string | null;
    repMin: number;
    repMax: number;
    rir: number;
    inc: number;
    jump?: number | undefined;
  };
  sets: DraftSet[];
  light?: boolean | undefined;
  keepRR?: [number, number] | null | undefined;
  inj?: string | null | undefined;
  note?: string | undefined;
  rr?: [number, number] | null | undefined;
  cut?: boolean | undefined;
  full?: number | undefined;
  tgt?: Target | null | undefined;
  target?: string | undefined;
  /** The next sets adjusted from a set (r34): at the row it came from, whose id (`rid`, since PENDING 333) keeps it on that row when rows are added above; the load they take and the one they had, the reps the estimate expects there, up or down, and why. */
  adj?: NextSetsAdj | null | undefined;
  /** Keep as it was: no adjustment for this exercise for the rest of the session (r34). */
  adjOff?: boolean | undefined;
  sw?: number | null | undefined;
  prev?: string[] | undefined;
  prevOff?: boolean | undefined;
  last?: string | undefined;
  /** The suggestion's words, shown under the exercise when it has no target. */
  hint?: string | undefined;
  /** Last time's reps per working set, the grey reps. */
  lastR?: (number | null)[] | undefined;
  /** The easier way the suggestion offers, when it offers one. */
  easier?: string | null | undefined;
  /** The date of the full session the target came from, when the last was not one (r26). */
  basis?: string | undefined;
  /** The note left on this lift last time, shown until one is written today. */
  lastNote?: { date: string; text: string } | null | undefined;
  /** The exercise it was swapped from, for Finish's offer to the routine. */
  swappedFrom?: string | null | undefined;
  /** Done at a new machine or gym (r61, 343 7): every block of the lift in the session carries it, its suggestion read as a first session's; absent unless marked. */
  nw?: true | undefined;
}

/** The next sets adjusted from a ticked set (r34): see DraftBlock's `adj`. */
export interface NextSetsAdj {
  at: number;
  w: number;
  from: number;
  r: number;
  up: boolean;
  why: string;
  rid?: string | undefined;
}
