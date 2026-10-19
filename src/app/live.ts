/* The model the app runs on (phase 3b, r52; ARCHITECTURE.md). The engine and
   the analytics are pure functions of a model (model.ts); the app has one,
   LIVE, whose log is the store's, read at every use, so a log replaced by
   setState is the one read next; whose date is util's today, read at every
   call, so an app left open past midnight reads the new day as r51 did; and
   whose caches are built on first use and cleared by invalidate, as r51's
   were. The legacy script calls the engine through the adapters below, under
   r51's names, so not one of its calls changed. tests/moved.js holds LIVE and
   live to their exact code and the adapters to their one form. */

import type { Model } from './model';
import { freshCaches } from './model';
import { state } from './store';
import { today } from './util';
import {
  EXIn,
  UIn,
  activeRoutineIn,
  exInjuryIn,
  exNameIn,
  freeModeIn,
  gymOfIn,
  injuredSetIn,
  invalidateIn,
  isDeloadWeekIn,
  isRestWeekIn,
  profIn,
  rirHalfOnIn,
  sortedSessionsIn
} from './model';
import { fromDIn, stepReadIn, toDIn } from './units';
import {
  defPlanIn,
  planCreditIn,
  planForIn,
  planSetsPerWeekIn,
  plannedSetsIn,
  profPlanIn,
  profRuleIn,
  routineUpdatesIn
} from './routines';
import { barKgIn, capOfIn, exBarKgIn, gymRackIn, rackTolIn } from './gym';
import { fmtWIn, loadLabelIn } from './loads';
import {
  IDXIn,
  bwAtIn,
  bwLoadIn,
  bwRefIn,
  bwRefLoadIn,
  calStatsIn,
  dateIndexIn,
  hardCreditIn,
  isHardIn,
  loadOfIn,
  prLoadIn,
  rirEffIn,
  rirEstIn,
  rirUsualIn,
  stallWeeksIn,
  statsUpToIn,
  tonnageIn,
  weekSessionsIn
} from './analytics';
import { dayMinutesIn, paceIn, paceRatiosIn, sessModelMinIn } from './time';
import {
  actualAvg4In,
  avgWeeksIn,
  firstFullWeekIn,
  recentLighterIn,
  regionBalanceIn,
  weekNeedIn,
  weekRoutineIn,
  weekStatsIn,
  weekStreakIn
} from './weeks';
import { coachIn, dropOnlyLiftIn, fatigueStallsIn, moversIn, readinessIn, stalledIdsIn } from './coach';
import {
  daysOffIn,
  easierTextIn,
  incOfIn,
  lighterLoadIn,
  progStepIn,
  rackStepIn,
  suggestCoreIn,
  suggestIn
} from './engine';

/** The one model the app runs on: the store's log, the phone's date, and the caches. */
export const LIVE: Model = {
  get s() {
    return state;
  },
  today,
  c: freshCaches()
};

/** A function of the model as the app calls it: LIVE, then every argument as given. */
export function live<A extends unknown[], R>(f: (M: Model, ...args: A) => R): (...args: A) => R {
  return (...args) => f(LIVE, ...args);
}

/** The engine and the analytics under their r51 names, each on LIVE: one
    adapter per moved reader the legacy script calls, and invalidate, which
    clears LIVE's caches after every change to the log. */
export const EX = live(EXIn);
export const U = live(UIn);
export const activeRoutine = live(activeRoutineIn);
export const exInjury = live(exInjuryIn);
export const exName = live(exNameIn);
export const freeMode = live(freeModeIn);
export const gymOf = live(gymOfIn);
export const injuredSet = live(injuredSetIn);
export const invalidate = live(invalidateIn);
export const isDeloadWeek = live(isDeloadWeekIn);
export const isRestWeek = live(isRestWeekIn);
export const prof = live(profIn);
export const rirHalfOn = live(rirHalfOnIn);
export const sortedSessions = live(sortedSessionsIn);
export const fromD = live(fromDIn);
export const stepRead = live(stepReadIn);
export const toD = live(toDIn);
export const defPlan = live(defPlanIn);
export const planCredit = live(planCreditIn);
export const planFor = live(planForIn);
export const planSetsPerWeek = live(planSetsPerWeekIn);
export const plannedSets = live(plannedSetsIn);
export const profPlan = live(profPlanIn);
export const profRule = live(profRuleIn);
export const routineUpdates = live(routineUpdatesIn);
export const barKg = live(barKgIn);
export const capOf = live(capOfIn);
export const exBarKg = live(exBarKgIn);
export const gymRack = live(gymRackIn);
export const rackTol = live(rackTolIn);
export const fmtW = live(fmtWIn);
export const loadLabel = live(loadLabelIn);
export const IDX = live(IDXIn);
export const bwAt = live(bwAtIn);
export const bwLoad = live(bwLoadIn);
export const bwRef = live(bwRefIn);
export const bwRefLoad = live(bwRefLoadIn);
export const calStats = live(calStatsIn);
export const dateIndex = live(dateIndexIn);
export const hardCredit = live(hardCreditIn);
export const isHard = live(isHardIn);
export const loadOf = live(loadOfIn);
export const prLoad = live(prLoadIn);
export const rirEff = live(rirEffIn);
export const rirEst = live(rirEstIn);
export const rirUsual = live(rirUsualIn);
export const stallWeeks = live(stallWeeksIn);
export const statsUpTo = live(statsUpToIn);
export const tonnage = live(tonnageIn);
export const weekSessions = live(weekSessionsIn);
export const dayMinutes = live(dayMinutesIn);
export const pace = live(paceIn);
export const paceRatios = live(paceRatiosIn);
export const sessModelMin = live(sessModelMinIn);
export const actualAvg4 = live(actualAvg4In);
export const avgWeeks = live(avgWeeksIn);
export const firstFullWeek = live(firstFullWeekIn);
export const recentLighter = live(recentLighterIn);
export const regionBalance = live(regionBalanceIn);
export const weekNeed = live(weekNeedIn);
export const weekRoutine = live(weekRoutineIn);
export const weekStats = live(weekStatsIn);
export const weekStreak = live(weekStreakIn);
export const coach = live(coachIn);
export const dropOnlyLift = live(dropOnlyLiftIn);
export const fatigueStalls = live(fatigueStallsIn);
export const movers = live(moversIn);
export const readiness = live(readinessIn);
export const stalledIds = live(stalledIdsIn);
export const daysOff = live(daysOffIn);
export const easierText = live(easierTextIn);
export const incOf = live(incOfIn);
export const lighterLoad = live(lighterLoadIn);
export const progStep = live(progStepIn);
export const rackStep = live(rackStepIn);
export const suggestCore = live(suggestCoreIn);
export const suggest = live(suggestIn);
