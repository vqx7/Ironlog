/* The model the engine and the analytics read (phase 3b, r52;
   ARCHITECTURE.md): the log, the date the engine takes as today, and the
   values built from the log once per change. Every function that reads any
   of it takes the model as its first parameter, `M`, so it reads nothing
   else: a test hands it a log and a date, and the app hands it the one live
   model (live.ts). The accessors here moved unchanged from the legacy script
   but for that parameter; tests/moved.js reads them back to r51's code. */

import type { EngineState, Exercise, Gym, Profile, Routine, Session, Target } from './types';
import { weekStart } from './util';
import { exJoints } from './library';
import { sessCmp } from './records';

/** One working set as the analytics read it: the load as typed (`w`), the
    total moved (`load`, a bodyweight share added on a bodyweight lift), the
    load PRs are judged at (`pl`), the reps, and the RIR as read (`rir`) and
    as estimated where it was left blank (`rq`). */
export interface ExPoint {
  load: number;
  pl: number;
  r: number;
  w: number;
  rir: number | null;
  rq: number | null;
}

/** One session of a lift (an exposure), with what IDX reads from it: its
    working sets, best estimates and their rep bands, the working load and the
    reps and RIR at it, the trend readings, and the marks the later steps set
    (`auto` and `keep` for a session read as lighter, `tv` the trend's
    reading, `progress` a PR or a heavier load). */
export interface Exposure {
  date: string;
  sid: string;
  pts: ExPoint[];
  best: number | null;
  bb: number | null;
  pb: number | null;
  pbb: number | null;
  vol: number;
  n: number;
  topW: number;
  topRir: number | null;
  topReps: number;
  drop: number | null;
  deload: boolean;
  light: boolean;
  rr: [number, number] | null;
  topN: number;
  cut: boolean;
  tAdj: number | null;
  tRaw: number | null;
  topL: number;
  rated: number;
  auto?: boolean;
  keep?: boolean;
  tv?: number | null;
  progress?: boolean;
}

/** A change seen over a lift's last three sessions in range: the load it was
    at and where the number went from and to. */
export interface Drift {
  w: number;
  from: number;
  to: number;
}

/** One lift's reading (idxLift): its trend, stall, signals and bests. */
export interface ExStat {
  n: number;
  stalled: boolean;
  pct: number | null;
  slope: number | null;
  slopeSe: number | null;
  moving: boolean;
  falling: boolean;
  pLo: number | null;
  pHi: number | null;
  spanW: number | null;
  loadUp: boolean;
  useAdj: boolean;
  fresh: boolean;
  byBand: Record<number, number>;
  wN: number;
  wSpan: number;
  last: Exposure;
  best: number | null;
  bestAll: number | null;
  rr: [number, number] | null;
  easier: Drift | null;
  fade: Drift | null;
  capped: boolean;
}

/** What every PR keeps: its day and session, its lift, and whether it is
    counted and announced (`big`, r32). */
interface PrBase {
  date: string;
  sid: string;
  exId: string;
  big: boolean;
}

/** A PR (idxPRs): a heavier set than any before, a best estimate, or more
    reps at a load than any heavier set did, with what it beat. */
export type Pr =
  | (PrBase & {
      type: 'Weight PR';
      w: number;
      r: number;
      prevW: number;
      value: number | null;
      prev: number | null;
      prevAll: number | null;
      bb: number | null;
    })
  | (PrBase & { type: 'e1RM'; value: number | null; prev: number | null; prevAll: number | null; bb: number | null })
  | (PrBase & { type: 'Rep PR'; w: number; r: number; prevR: number });

/** A muscle's strength reading from its lifts' trends (idxScores). */
export interface Score {
  m: string;
  score: number;
  clear: boolean;
  n: number;
  indirect: boolean;
  stall: boolean;
  wk: number | null;
  label?: string;
}

/** What changes a muscle's recovery on one day: sets to failure, sets left
    at 3 or more in reserve, hard sets, a slow-recovery lift, a first exposure. */
export interface DayMeta {
  fail: number;
  easy: number;
  hard: number;
  slow: boolean;
  novel: boolean;
}

/** Everything IDX() builds once per change. Two values are added after it is
    built, by the readers that need them: rack steps (`_rack`, rackStep) and
    the routine each past week was trained on (`weekRid`, weekRoutine). */
export interface Idx {
  byEx: Record<string, Exposure[]>;
  exStats: Record<string, ExStat>;
  scores: Score[];
  prs: Pr[];
  sessVol: { date: string; vol: number; id: string; day: string }[];
  weekSets: Record<string, Record<string, number>>;
  weekConf: Record<string, Record<string, number>>;
  weekHard: Record<string, number>;
  dayMus: Record<string, Record<string, number>>;
  dayMeta: Record<string, Record<string, DayMeta>>;
  anchor: string;
  lightWk: Record<string, boolean>;
  rirCov: { logged: number; total: number };
  _rack?: Record<string, number | null>;
  weekRid?: Record<string, string | null>;
}

/** The sessions on each date, in sessCmp order, and the count per week (dateIndex). */
export interface DateIndex {
  byDate: Record<string, Session[]>;
  weekN: Record<string, number>;
}

/** RIR checks summed up (calSummary): how many, their median error, the
    correction made of it, and the mean error. */
export interface CalSummary {
  recent: number;
  raw: number | null;
  bias: number;
  mae: number | null;
}

/** All RIR checks, and each kind of lift's (calStats). */
export interface CalStats extends CalSummary {
  n: number;
  lastDate: string | null;
  cls: { c: CalSummary; i: CalSummary };
}

/** What the load engine prescribes for one lift (suggest): the load (null
    with none to give), the sentence saying why, and its two lines for the
    session screen (`last`, `target`), the reps to grey in (`lastR`) and the
    target the session is scored against (`tgt`). The rest say how it came
    about: last time's working load (`top`) and sets (`prev`, `prevOff` when
    some were left out of the column), the date of the full session it came
    from when not the last (`basis`), a note on reps getting easier, an
    injury, a close variation started from (`kin`), a drop below the range
    (`down`), the heaviest load available (`capped`), reps to build to before
    a large step (`buildTo`), and the weeks off for a lift back after a break. */
export interface Suggestion {
  w: number | null;
  text: string;
  lastR: number[];
  last: string;
  target: string;
  tgt: Target | null;
  top?: number | undefined;
  prev?: string[] | undefined;
  prevOff?: true | undefined;
  basis?: string | null | undefined;
  easier?: string | null | undefined;
  inj?: string | undefined;
  kin?: string | undefined;
  down?: boolean | undefined;
  capped?: boolean | undefined;
  buildTo?: number | undefined;
  back?: number | undefined;
}

/** An exercise as EX() gives it: the log's own record, or, for an id the log
    no longer has, a stand-in with the fields every reader needs and the
    rest absent. */
export type ExerciseLike = Pick<Exercise, 'id' | 'name' | 'primary' | 'secondary' | 'equip' | 'bw' | 'archived'> &
  Partial<Exercise>;

/** The values built from the log once per change, under their r51 names,
    each null (or undefined) until first read and again after invalidate. */
export interface Caches {
  EXMAP: Record<string, Exercise> | null;
  _idx: Idx | null;
  _dix: DateIndex | null;
  _cal: CalStats | null;
  _rirUse: Record<string, number> | null;
  _bwRef: number | undefined;
  _pace: number | null;
}

/** The model: the log, the date the engine reads as today, and the caches. */
export interface Model {
  s: EngineState;
  today: () => string;
  c: Caches;
}

/** The caches as r51 started them: every one null except _bwRef, which
    bwRef tests for undefined (a null there would leave every bodyweight lift
    without its bodyweight). */
export function freshCaches(): Caches {
  return { EXMAP: null, _idx: null, _dix: null, _cal: null, _rirUse: null, _bwRef: undefined, _pace: null };
}

/** A model of a given log and date, for a test or any use outside the app. */
export function modelOf(s: EngineState, today: () => string): Model {
  return { s, today, c: freshCaches() };
}

/** Whether the deload marked on Today is this week's. */
export function isDeloadWeekIn(M: Model): boolean {
  return !!M.s.deloadWeek && M.s.deloadWeek === weekStart(M.today());
}

/* Freestyle mode (r34): Today starts blank, so no routine is being
   followed. The week is then measured against the lifter's own training,
   not a plan's days: the streak counts weeks trained in a row, This week says
   sessions and hard sets without "of planned", and adherence has no plan to
   measure. Muscle targets, suggestions and trends are the same either way. */
export function freeModeIn(M: Model): boolean {
  return M.s.settings.todayStart === 'free';
}

/* Rest weeks (r34, V): a week off on purpose (a holiday, a break) is marked,
   this week or last, from More options on Today. It is not a missed week:
   the weekly average reaches past it (like a lighter week), the streak and
   adherence skip it, and the coach reads it as recovery. Kept in settings,
   so it syncs, as week-start dates. */
export function isRestWeekIn(M: Model, ws: string): boolean {
  const r = M.s.settings.restWeeks;
  return Array.isArray(r) && r.includes(ws);
}

/** The muscles and joints the lifter has flagged as injured. */
export function injuredSetIn(M: Model): Set<string> {
  return new Set((M.s.injuries || []).map(x => x.m));
}

/** The flagged injury an exercise loads (its main muscle, a helper or a joint), or null. */
export function exInjuryIn(M: Model, ex: Pick<Exercise, 'name' | 'primary' | 'secondary' | 'equip'>): string | null {
  const s = injuredSetIn(M);
  if (!s.size) return null;
  if (s.has(ex.primary)) return ex.primary;
  for (const m of ex.secondary) if (s.has(m)) return m;
  for (const j of exJoints(ex)) if (s.has(j)) return j;
  return null;
}

/** The unit loads are shown and typed in. */
export const UIn = (M: Model): 'lb' | 'kg' => M.s.settings.unit;

/* An exercise by id, from a map of the log's exercises built once per
   change. No prototype: an exercise id such as "constructor" must not find
   Object's. Object.create(null) is typed any, so the cast names the map it
   becomes. */
export function EXIn(M: Model, id: string): ExerciseLike {
  if (!M.c.EXMAP) {
    M.c.EXMAP = Object.create(null) as Record<string, Exercise>;
    for (const e of M.s.exercises) M.c.EXMAP[e.id] = e;
  }
  return (
    M.c.EXMAP[id] || {
      id,
      name: 'Deleted exercise',
      primary: 'chest',
      secondary: [],
      equip: 'other',
      bw: false,
      archived: true
    }
  );
}

/** An exercise's name by id. */
export const exNameIn = (M: Model, id: string): string => EXIn(M, id).name;

/** The routine in use: the one chosen, else the first. */
export function activeRoutineIn(M: Model): Routine {
  return M.s.routines.find(r => r.id === M.s.activeRoutineId) || M.s.routines[0];
}

/** Clears every value built from the log, so the next read builds it again. */
export function invalidateIn(M: Model): void {
  M.c._idx = null;
  M.c._dix = null;
  M.c.EXMAP = null;
  M.c._cal = null;
  M.c._rirUse = null;
  M.c._bwRef = undefined;
  M.c._pace = null;
}

/** Whether sets at RIR 4 to 5 count as half a set (r40): the setting, and RIR in use. */
export const rirHalfOnIn = (M: Model): boolean => M.s.settings.rirHalf === true && M.s.settings.rirMode !== 'off';

/** The log's sessions in sessCmp order (date, start time, id), a new list each call. */
export function sortedSessionsIn(M: Model): Session[] {
  return [...M.s.sessions].sort(sessCmp);
}

/* ---------- Your gym (r33, item 207) ----------
   What the gym has: its dumbbells and kettlebells, the plates on hand, and
   the step of its cable and machine stacks. Kept in the unit the gym is
   labelled in (a rack in lb stays in lb after a switch to kg). Nothing set
   means nothing changes: every default below is the step used before.
   Precedence: a step set on the exercise or in the plan, then Your gym, then
   the rack read from logged loads (r32), then 5 lb or 2.5 kg. */
/** The gym set in Settings, or null. */
export function gymOfIn(M: Model): Gym | null {
  const g = M.s.settings.gym;
  return g && typeof g === 'object' ? g : null;
}

/* ---------- PROFILE (r44, item 271, with 43 and 44) ----------
   An optional short profile: goal, experience, days a week and up to two
   focus muscles. V's answers (2026-10-13): it sets defaults and new plan
   items only; the routine in use changes only through Apply; targets the
   lifter typed stay as typed, and only the app's own targets move. With no
   profile, or with Size, every number is exactly what it was before r44,
   because the app's defaults were already set for size. */
/** The profile set in Settings, or an empty one. */
export function profIn(M: Model): Profile {
  return M.s.settings.profile || {};
}
