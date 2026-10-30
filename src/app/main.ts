/* The page's start (r63, from the legacy script's 10-start.js to
   29-sections.js, deleted with it): the bundle's entry. Every module runs
   nothing on import, so the page starts here, in the order it always did:
   the page given its draw and its sheets, storage and sync's effects, the
   saved log read and the sync started, the fields and the update bar, the
   account's listeners, the page's own, the tips', every screen's taps and
   fields, the session screen's, the sections' handles; then the one-time
   fixes of an older build's log, the suites' hook, the first draw, the
   screen kept on, the rest timer resumed, the account, and Undo's steps. */

import { ACT, eventListeners, pageListeners } from './events';
import { afterSheet, renderInner, sectionsStart, SHEETS } from './screens';
import { THREE_URLS } from './config';
import { addDays, andList, today, weekStart } from './util';
import {
  BANDS,
  COMMON,
  COMMON_TIP,
  EQUIP,
  exJoints,
  HARD_EX,
  isCommon,
  isCompound,
  libExercises,
  loadMode,
  MK,
  ML,
  nameMatch,
  noE1,
  patternOf,
  profHeavy,
  TRACK_ONLY
} from './library';
import {
  dayLabel,
  daySets,
  dropStarter,
  planItemOf,
  plannedPerWeek,
  planSetsOf,
  pwOf,
  routineFromTemplate,
  routineSig,
  ssLetters,
  templateBefore,
  templateRest,
  templateSigsBefore,
  TEMPLATES,
  tplCountLine,
  trainOn,
  withPlanSets
} from './routines';
import {
  BACK_DAYS,
  e1,
  e1inv,
  fitE,
  jumpCap,
  lighter,
  offTarget,
  PACE_DAYS,
  PACE_MIN,
  PACE_N,
  repFloor,
  rtfAt,
  rtfBand,
  rtfOf,
  sameRR,
  setCredit,
  setSecs,
  setupSecs,
  workLoad
} from './formulas';
import { EXTRA_MAX, sessCmp } from './records';
import { dbListOf, gymClean, platesMode, platesPerSide } from './gym';
import { FOCUS_MAX, PROF_DAYS, profClean } from './profile';
import { REGION_WKS, VOL_MODES } from './layout';
import { editFp, effW, greyW, hintOnce, joinAdjacent, overSets, sameExOnce, savedEx, whyTarget } from './session';
import { estInLoad, loadNote, loadWords } from './loads';
import { prName } from './prs';
import { aboveMax, belowMin } from './volume';
import { impDate, impFromTable, impFromText, impHeader, impNorm, impRows, impTextSets, impXlsx } from './importing';
import { fmtDate, rangeWords, repSpan, sessTm } from './format';
import { sessionWord } from './analytics';
import { avgWeeksTxt } from './weeks';
import { musTrend } from './coach';
import { chunksOf } from './chunks';
import { Hx } from './merge';
import { acct, cloud, setFx, setState, state, ui } from './store';
import {
  activeRoutine,
  actualAvg4,
  allTimeBests,
  appBand,
  atRangeTop,
  avgFirstWeek,
  avgWait,
  avgWeeks,
  bandOf,
  barKg,
  bwAt,
  bwLoad,
  bwNoLoad,
  bwRef,
  bwRefLoad,
  calStats,
  capOf,
  coach,
  cycleState,
  dateIndex,
  dayMinutes,
  dayReasons,
  daysOff,
  defBand,
  defPlan,
  dropOnlyLift,
  easierText,
  eqPlan,
  EX,
  exBarKg,
  exInjury,
  exName,
  exReasons,
  fatigueStalls,
  firstFullWeek,
  fitFloors,
  fmtW,
  freeMode,
  fromD,
  gymOf,
  gymRack,
  hardCredit,
  hasTarget,
  heavierLoad,
  IDX,
  incOf,
  injuredSet,
  invalidate,
  isDeloadWeek,
  isHard,
  isRestWeek,
  lastLighterWeek,
  liftRead,
  lighterLoad,
  lightZero,
  loadLabel,
  loadOf,
  logBack,
  logStart,
  movers,
  muscleStatus,
  nextSets,
  oddLoad,
  pace,
  paceRatios,
  planCredit,
  planFor,
  plannedSets,
  planSetsPerWeek,
  prFrame,
  prLoad,
  prof,
  profPlan,
  profRule,
  progStep,
  rackStep,
  rackTol,
  rankDays,
  rankExercises,
  readiness,
  recentExIds,
  recentLighter,
  recovery,
  refit,
  regionBalance,
  rirEff,
  rirEst,
  rirHalfOn,
  rirUsual,
  rolling7,
  routineUpdates,
  sessionMuscles,
  sessionMuscleSets,
  sessionWords,
  sessModelMin,
  sortedSessions,
  stalledIds,
  stallWeeks,
  stallWords,
  statsUpTo,
  stepRead,
  strengthPick,
  suggest,
  suggestCore,
  swapCands,
  toD,
  tonnage,
  trimPlan,
  U,
  weekNeed,
  weekRoutine,
  weeksAvg,
  weekSessions,
  weekStats,
  weekStreak
} from './live';
import { keepExtra, normalize, plainTemplate, starterRoutine, starterSigs } from './normalize';
import {
  asideList,
  backupDue,
  ENV,
  KEY,
  log,
  logBuf,
  logCut,
  snapshot,
  storageStart,
  undoForget,
  undoRestore,
  undoStack
} from './storage';
import {
  assemble,
  baseOf,
  cloudFlush,
  cloudInit,
  cloudPull,
  cloudStop,
  cq,
  mergeChunk,
  saveNow,
  syncStart,
  withTimeout
} from './sync';
import { act } from './act';
import { fitTargets, oldFloors } from './targets';
import { FB_CTX_MAX } from './feedback';
import { effShow, rirScale } from './effort';
import { toast, undoToastHide } from './toast';
import { timer, timerResume, wakeOn } from './timer';
import { tipsStart } from './tips';
import { howToUrl } from './sheetslift';
import { liftTrend } from './sheetsexercise';
import { installSheet, siteHost } from './sheetsapp';
import {
  bestLine,
  cycleProjection,
  effTgt,
  fmtDateLong,
  goalState,
  libFiltered,
  noLog,
  prsWithin,
  recent4w,
  regionSrc,
  regionWk,
  routineClutter,
  sessionLength,
  sessionsOn,
  setStr,
  sizeRows,
  tonnageNow,
  weekPlan
} from './display';
import { markupOf, viewStart } from './view';
import { ask, openModal, render, rerenderKeepScroll, setRoot, setSaveState, setSheets } from './page';
import { updateStart } from './update';
import { bwEvery, profApplyList, profMoveBands, SAFETY_TXT } from './settings';
import { planEvidenceNote, sessionCapNote } from './plan';
import { bestsBoard, exHeadline, goalLine, whtrLine } from './stats';
import { B3, B3_PARTS, exMusParts, map3dColors, map3dPick } from './map';
import { bwDueCard, obActive, obGate, obTour, parseHeight } from './today';
import {
  adjOn,
  blockProgress,
  calDueIdx,
  draftPlanMin,
  fillSets,
  greyR,
  lastNoteOf,
  lastRFor,
  livePR,
  loadIn,
  mixCheck,
  moveBlock,
  newBlock,
  orderAt,
  orderRun,
  parseSets,
  plateList,
  plateText,
  prBeat,
  refreshEx,
  remainMin,
  rowBlank,
  shortPlan
} from './worksets';
import { readyCard, workoutStart } from './workout';
import { fbContext, fbShrink } from './report';
import { accountStart, acctInit, syncLine, waiting } from './account';
import { impBuild, impMatch, importData, impStart, liveLogFetch, routineFromLog } from './importflow';
import { makeDemo } from './demo';
import { exportCSV, trashTidy } from './actsapp';
import { applyPick, swapPlan } from './actspick';
import type { State } from './store';

declare global {
  interface Window {
    /** The suites' way in (CLAUDE.md, Code): the log, the engine and the screens' parts, by name. */
    __ironlog?: unknown;
    /** Called by the page's library loader (03-body.html) once SortableJS or Chart.js has loaded or failed. */
    __onLib?: ((which: string) => void) | undefined;
    /** Called by the installed app's install listener (scripts/build.js) when the browser makes or withdraws its offer. */
    ironlogInstallReady?: (() => void) | undefined;
    /** Called by the installed app's start script (scripts/build.js) with an error of its own, to keep in the error log. */
    ironlogLog?: ((area: string, e: unknown) => void) | undefined;
  }
}

/* The page (page.ts) draws the tabs and the sheets from these two tables,
   which know every screen and sheet; given first, before anything can
   draw. */
setRoot(renderInner);
setSheets(SHEETS, afterSheet);
/* The storage and sync modules (phase 4, r56) reach the page through this
   one object (fx, store.ts): filled before anything that could call an
   effect runs. Then what the storage and sync parts ran as the page loaded,
   in their order: the save read into the store, the sync notes, the device
   id, the listeners. */
setFx({ render, rerenderKeepScroll, toast, undoToastHide, setSaveState, syncLine, obGate, ask });
storageStart();
syncStart();
// Fields typed in, and the update bar (r60): started before the page's handlers are added below.
viewStart();
updateStart();
/* The account's listeners (a return to the front or online tries the wait
   for a new account's email, or the sync, again), before the page's own. */
accountStart();
pageListeners();
// The build's install offer, once the browser makes one, redraws the tab that shows Install.
window.ironlogInstallReady = () => {
  if (ui.tab === 'today' || ui.tab === 'settings') rerenderKeepScroll();
};
// The installed app's start script keeps its errors in the error log (r65, the r63 audit's A-12: it dropped them).
window.ironlogLog = (area, e) => log(area, e);
// The tips' listeners, before the page's own.
tipsStart();
eventListeners();
// The session screen's own listeners (workout.ts, r60): after the page's, in the order they ran before.
workoutStart();
sectionsStart();
window.__onLib = which => {
  if ((which === 'chart' && ui.tab === 'dash') || (which === 'sortable' && ui.tab === 'program')) rerenderKeepScroll();
};
trashTidy();
/** Records the floors of a fit made before r44 that are not recorded yet, inside `act`; whether it did (the suites' fitRecordOld). */
function recordOldFloors(): boolean {
  const fit = oldFloors();
  if (fit)
    act(() => {
      state.settings.bandsFit = fit;
    });
  return !!fit;
}
/* Fixes of a log an older build saved, once, on this device's state, each
   made only when it changes something (a save is also a sync, so one at
   every start would send the log each time), and inside `act`, as every
   change to the log is (r65, the r63 audit's A-5: they were written and
   saved by hand). */
// r44: floors from a first-run pick made before they were recorded (oldFloors).
try {
  recordOldFloors();
} catch (e) {
  log('fitRecordOld', e);
}
// r54: targets fitted to a cycle by the reading of its plan before r54 follow r54's (refit, src/app/profile.ts).
try {
  const rf = refit();
  if (rf)
    act(() => {
      const b = state.settings.bands;
      // In the muscles' order, the order refit gives them in.
      for (const m of MK) {
        const v = rf.bands[m];
        if (v) b[m] = [v[0], v[1]];
      }
      if (Object.keys(rf.fit).length) state.settings.bandsFit = rf.fit;
      else delete state.settings.bandsFit;
    });
} catch (e) {
  log('refit', e);
}
window.__ironlog = {
  act,
  liftRead,
  nextSets,
  bwNoLoad,
  withTimeout,
  B3_PARTS,
  THREE_URLS,
  platesPerSide,
  get state() {
    return state;
  },
  set state(v: State) {
    setState(v);
  },
  fbContext,
  FB_CTX_MAX,
  logCut,
  logBuf,
  log,
  dateIndex,
  sessionsOn,
  bestLine,
  whyTarget,
  recent4w,
  weekSessions,
  fmtDate,
  fmtDateLong,
  fbShrink,
  orderAt,
  orderRun,
  dropOnlyLift,
  profHeavy,
  appBand,
  fitRecordOld: recordOldFloors,
  prof,
  profClean,
  profRule,
  profPlan,
  defPlan,
  defBand,
  profMoveBands,
  profApplyList,
  strengthPick,
  PROF_DAYS,
  FOCUS_MAX,
  estInLoad,
  keepExtra,
  EXTRA_MAX,
  draftPlanMin,
  pace,
  paceRatios,
  sessModelMin,
  PACE_N,
  PACE_DAYS,
  PACE_MIN,
  plainTemplate,
  trashTidy,
  ENV,
  KEY,
  COMMON,
  COMMON_TIP,
  isCommon,
  bwEvery,
  isRestWeek,
  sessCmp,
  avgWeeks,
  weekStreak,
  coach,
  noLog,
  adjOn,
  bwAt,
  newBlock,
  cycleState,
  sortedSessions,
  addDays,
  loadIn,
  gymRack,
  gymClean,
  dbListOf,
  capOf,
  refreshEx,
  effShow,
  rirScale,
  setStr,
  libExercises,
  obGate,
  obTour,
  andList,
  belowMin,
  aboveMax,
  starterRoutine,
  starterSigs,
  plateList,
  exBarKg,
  VOL_MODES,
  liveLogFetch,
  regionSrc,
  fitTargets,
  firstFullWeek,
  moveBlock,
  BANDS,
  installSheet: (m: Parameters<typeof installSheet>[0]) => markupOf(installSheet(m)),
  siteHost,
  greyW,
  effW,
  greyR,
  lighterLoad,
  heavierLoad,
  incOf,
  swapPlan,
  planSetsPerWeek,
  weekNeed,
  stepRead,
  e1inv,
  rtfAt,
  rtfOf,
  rtfBand,
  calStats,
  rirEff,
  isHard,
  setCredit,
  tonnage,
  loadMode,
  loadWords,
  loadNote,
  progStep,
  jumpCap,
  setSecs,
  setupSecs,
  recovery,
  rolling7,
  rankDays,
  rankExercises,
  exReasons,
  recentExIds,
  trimPlan,
  isCompound,
  patternOf,
  noE1,
  whtrLine: (p: Parameters<typeof whtrLine>[0]) => markupOf(whtrLine(p)),
  exHeadline: (id: string) => markupOf(exHeadline(id)),
  remainMin,
  shortPlan,
  weekPlan,
  cycleProjection,
  lastLighterWeek,
  avgFirstWeek,
  avgWait,
  stallWeeks,
  weeksAvg,
  fitFloors,
  refit,
  regionBalance,
  parseHeight,
  mixCheck,
  swapCands,
  eqPlan,
  exportCSV,
  importData,
  chunksOf,
  assemble,
  sessionMuscles,
  TRACK_ONLY,
  hasTarget,
  cloud,
  Hx,
  mergeChunk,
  baseOf,
  sync: () => cq(cloudPull),
  TEMPLATES,
  lastRFor,
  impDate,
  impRows,
  impNorm,
  impMatch,
  impFromText,
  impFromTable,
  impHeader,
  impBuild,
  impStart,
  impXlsx,
  parseSets,
  undoStack,
  undoRestore,
  undoForget,
  allTimeBests,
  bestsBoard: () => {
    const b = bestsBoard();
    return { n: b.n, html: markupOf(b.html) };
  },
  obActive,
  fmtW,
  rirUsual,
  rirEst,
  routineFromTemplate,
  plannedSets,
  map3d: () => ({
    state: B3.state,
    fail: B3.fail,
    meshes: B3.meshes.length,
    yaw: B3.yaw,
    glow: Object.entries(B3.mats)
      .filter(([, mt]) => mt.emissiveIntensity > 0)
      .map(([m]) => m),
    canvas: !!document.querySelector('#bm3d canvas'),
    colors: Object.fromEntries(Object.entries(B3.mats).map(([m, mt]) => [m, '#' + mt.color.getHexString()])),
    pick: (x: number, y: number) => map3dPick(x, y),
    want: map3dColors()
  }),
  cloudState: () => ({ on: cloud.on, status: cloud.status, err: cloud.err, uid: cloud.uid, acct: cloud.acct }),
  acctUser: () => acct.user,
  acctWaiting: waiting,
  flush: () => cq(cloudFlush),
  cloudInit,
  cloudStop,
  asideList,
  backupDue,
  routineUpdates,
  planFor,
  platesMode,
  plateText,
  IDX,
  suggest,
  e1,
  render,
  ACT,
  ui,
  makeDemo,
  invalidate,
  normalize,
  snapshot,
  saveNow,
  timer,
  weekStats,
  weekStart,
  today,
  EX,
  blockProgress,
  dayMinutes,
  tonnageNow,
  livePR,
  movers,
  stalledIds,
  muscleStatus,
  actualAvg4,
  plannedPerWeek,
  fillSets,
  lastNoteOf,
  sizeRows,
  sessionMuscleSets,
  sessionCapNote: (d: Parameters<typeof sessionCapNote>[0]) => markupOf(sessionCapNote(d)),
  routineClutter,
  rowBlank,
  dayReasons,
  impTextSets,
  liftTrend: (id: string) => markupOf(liftTrend(id)),
  prsWithin,
  activeRoutine,
  rackStep,
  repFloor,
  sessionLength,
  prBeat,
  exInjury,
  exJoints,
  openModal,
  EQUIP,
  HARD_EX,
  recentLighter,
  planEvidenceNote: (pv: Parameters<typeof planEvidenceNote>[0]) => markupOf(planEvidenceNote(pv)),
  howToUrl,
  editFp,
  toast,
  regionWk,
  REGION_WKS,
  SAFETY_TXT,
  libFiltered,
  nameMatch,
  workLoad,
  fitE,
  lighter,
  offTarget,
  sessionWord,
  sessionWords,
  dayLabel,
  daySets,
  ssLetters,
  routineSig,
  tplCountLine,
  pwOf,
  planSetsOf,
  withPlanSets,
  dropStarter,
  trainOn,
  planItemOf,
  fatigueStalls,
  avgWeeksTxt,
  routineFromLog,
  repSpan,
  rangeWords,
  calDueIdx,
  readyCard,
  sameRR,
  hintOnce,
  overSets,
  rackTol,
  daysOff,
  BACK_DAYS,
  prName,
  sessTm,
  effTgt,
  bwDueCard: () => markupOf(bwDueCard()),
  applyPick,
  joinAdjacent,
  sameExOnce,
  savedEx,
  goalState,
  goalLine: (id: string) => markupOf(goalLine(id)),
  bwRefLoad,
  ML,
  exMusParts,
  musTrend,
  U,
  toD,
  fromD,
  loadLabel,
  exName,
  planCredit,
  gymOf,
  isDeloadWeek,
  freeMode,
  injuredSet,
  prLoad,
  statsUpTo,
  readiness,
  bwRef,
  weekRoutine,
  logBack,
  logStart,
  easierText,
  barKg,
  suggestCore,
  loadOf,
  bwLoad,
  hardCredit,
  rirHalfOn,
  prFrame,
  stallWords,
  atRangeTop,
  oddLoad,
  lightZero,
  // Names added since r63 go last, so the earlier builds' suites find theirs in their order (tests/r63.js section 4).
  templateBefore,
  templateRest,
  templateSigsBefore,
  bandOf
};
render();
wakeOn();
timerResume();
cloudInit();
acctInit().catch((e: unknown) => {
  log('auth', e);
});
undoRestore().catch((e: unknown) => {
  log('undo-load', e);
});
