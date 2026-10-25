/* The legacy script's imports from the typed modules in src/app/ (r49).
   scripts/join.js puts this part first, outside the legacy wrapper, and the
   legacy parts (10 to 29) read these names as they read their own. Each phase
   of ARCHITECTURE.md moves more code into src/app/ and out of those parts. */
import { STORAGE_ID, APP_NAME, FILE_PREFIX, PREVIEW_NAME, DISPLAY_VERSION, APP_VERSION, VERSION_LINE, SITE_HOST, SITE_DIR_FALLBACK, THREE_URLS } from './app/config';
import { esc, uid, pad, parse, addDays, weekStart, daysBetween, today, isNum, isDate, median, r1, andList, numIn, mulberry, putById } from './app/util';
import { LB, IN, KM_MI, PLATES_LB, PLATES_KG } from './app/units';
import { MUSCLES, MK, ML, TRACK_ONLY, BANDS, EQUIP, EQL, CARDIO, CARDIOL, CWHEN, CWHENL, JOINTS, JK, JL, injLabel, exJoints, libExercises, COMMON, isCommon, patternOf, autoCompound, isCompound, noE1, BWF, bwShare, loadMode, rackKind, HARD_EX, LONG_TRIAL, LONG_IDS, profHeavy, COMMON_TIP, commonFirst, nameMatch } from './app/library';
import { dayLabel, defaultRoutine, TEMPLATES, routineFromTemplate, daySets, fixSupersets, linkToggle, move, plannedPerWeek, dropStarter, planItemOf, pwOf, planSetsOf, withPlanSets, trainOn, routineEmpty, routineSig, sessDayIdx, ssLetters, tplCountLine } from './app/routines';
import { keepExtra, cleanCardio, normalize, starterRoutine, starterSigs, plainTemplate } from './app/normalize';
import { ENV, KEY, ACCT_LATER, OB_ACCT, OB_OUT, BWASK_KEY, logBuf, logCut, log, unreadableRaw, unreadableForget, undoStack, undoPersist, undoRestore, undoForget, snapshot, demoFirstRun, demoKeep, demoRestore, backupDue, saveStateNow, storageStart, asideList } from './app/storage';
import { saveNow, saveSoon, commit, assemble, cq, withTimeout, baseOf, mergeChunk, hasUnsent, cloudFlush, cloudPull, cloudInit, cloudStop, syncStart } from './app/sync';
import { E1_MAX_RIR, rtfOf, e1, e1inv, rtfAt, fitE, rtfBand, REP_PR_SHARE, jumpCap, workLoad, repFloor, isWork, isMissed, prSameLoad, setCredit, lighter, offTarget, sameRR, setSecs, setupSecs, BACK_DAYS, SESSION_CAP, PACE_N, PACE_DAYS, PACE_MIN } from './app/formulas';
import { DIRTY_SAID, LIGHT_RIR, MISSED_SAID, effLeastShort, agoTxt, estMin, fmtDate, min5, rangeWords, repSpan, sessTm, missedTag } from './app/format';
import { ACCENT0, DSEC_ALIAS, FORM_SHEETS, REGION_WKS, VOL_MODES, HIDEABLE, HIDEABLE_KEYS, MAIN_FIXED, orderKeys } from './app/layout';
import { ADD_ICON, MENU_ICON, SHARE_ICON } from './app/icons';
import { FOCUS_MAX, PROF_DAYS, PROF_EXP, PROF_EXP_TIP, PROF_GOALS, PROF_GOAL_TIP, STR_NEAR, STR_REST, profClean } from './app/profile';
import { EXTRA_MAX, cleanChk, sessCmp } from './app/records';
import { PLATE_MODES, dbListOf, gymClean, platesMode, platesPerSide } from './app/gym';
import { chunksOf, emptyChunk, isChunkId, realCount, stripDemo } from './app/chunks';
import { Hx, canon, mergeDraft } from './app/merge';
import { RIR_OPTS, blockDone, blockRest, editFp, effTarget, effW, draftCardio, freeDraft, greyW, hintOnce, joinAdjacent, joinRows, joinable, lastCell, lastDup, lastHead, newRow, overSets, sameExOnce, savedEx, sessProgress, targetText, whyTarget } from './app/session';
import { LOAD_MODES, emptyLoad, estInLoad, loadNote, loadWords } from './app/loads';
import { BAND_WORDS, prName, prOverall } from './app/prs';
import { aboveMax, belowMin } from './app/volume';
import { GENERIC_WORKOUT, IMP_ALIAS, IMP_MAX_ROWS, impDate, impFromTable, impGuess, impHeader, impNorm, impRows, impSetsText, impXlsx } from './app/importing';
import { FB_ASK, FB_CATS, FB_CTX_MAX, FB_DAY, FB_HINT, FB_IMG_MB, FB_MAX, FB_MIN, FB_SHOT_RE, FB_TITLE, FB_WHAT } from './app/feedback';
import { state, setState, ui, cloud, acct, acctWait, HIST_PAGE, setFx } from './app/store';
import { sessionWord } from './app/analytics';
import { avgWeeksTxt } from './app/weeks';
import { CHK_Q, chkWord, musTrend } from './app/coach';
import { EX, U, activeRoutine, exInjury, exName, freeMode, gymOf, injuredSet, invalidate, isDeloadWeek, isRestWeek, prof, rirHalfOn, sortedSessions, fromD, stepRead, toD, defPlan, planCredit, planFor, planSetsPerWeek, profPlan, profRule, routineUpdates, appBand, defBand, fitFloors, refit, plannedSets, stallWeeks, stallWords, barKg, capOf, exBarKg, gymRack, rackTol, fmtW, loadLabel, IDX, allTimeBests, sessionWords, bwAt, bwLoad, bwRef, bwRefLoad, calStats, dateIndex, hardCredit, isHard, loadOf, prFrame, prLoad, rirEff, rirEst, rirUsual, statsUpTo, tonnage, weekSessions, dayMinutes, pace, paceRatios, sessModelMin, actualAvg4, avgFirstWeek, avgWait, avgWeeks, firstFullWeek, lastLighterWeek, logBack, logStart, muscleStatus, recentLighter, regionBalance, weekNeed, weekRoutine, weekStats, weekStreak, weeksAvg, atRangeTop, coach, dropOnlyLift, fatigueStalls, movers, readiness, stalledIds, daysOff, easierText, heavierLoad, oddLoad, lightZero, incOf, lighterLoad, progStep, rackStep, suggestCore, suggest, hasTarget } from './app/live';
import { AUTH, FB } from './app/providers';
import { effName, effShow, rirScale } from './app/effort';
import { morphInto } from './app/sheets';
import { guideSheet } from './app/guide';
import { act } from './app/act';
import { drawLegacy, drawScreen, drawnBeforeToday, isOpen, dragStart, dragDrop, dragDone, markupOf } from './app/view';
import { noLog, weekPlan, cycleProjection, sessionsOn, distU, distShow, setShort, setStr, curRoutineB, findItem, newItem, nameTaken, routineClutter, sessionMuscleSets, libFiltered, rirShow, effTgt, fmtE, loadHead, fmtDateLong, topSetPt, bestSet, prSet, recent4w, tonnageNow, cycleState, sessionLength, bestLine, goalState, goalWords, regionWk, regionSrc, sizeRows } from './app/display';
import { isStandalone, coarse, installKind } from './app/env';
import { viewHistory, HISTORY_ACTS, HISTORY_BINDS } from './app/history';
import { viewSettings, SETTINGS_ACTS, SETTINGS_BINDS, bandInput, bandChange, gymField, settingsSyncLine, bwEvery, adjOn, profApplyList, profMoveBands, SAFETY_TXT } from './app/settings';
import { viewProgram, viewLibrary, PLAN_ACTS, PLAN_BINDS, planInput, planChange, dropItem, dropDay, dropLib, dayKey, sessionCapNote, planEvidenceNote } from './app/plan';
import { viewDash, DASH_ACTS, DASH_BINDS, exHeadline, goalLine, bestsBoard, whtrLine } from './app/stats';
import { mountCharts, killCharts } from './app/graphs';
import { viewToday, TODAY_ACTS, TODAY_BINDS, todayChange, obActive, obGate, obOutClear, obTour, obTourStop, mountObTour, bwDueCard, parseHeight } from './app/today';
import { drawWeekBar } from './app/week';
import { MAP_ACTS, B3, B3_PARTS, mapView, mount3D, map3dPick, map3dColors, exMusParts, exBodyFlat, exMusWords, exMusLegend } from './app/map';
import { calBounds, calSheet } from './app/calendar';
