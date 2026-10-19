/* The legacy script's imports from the typed modules in src/app/ (r49).
   scripts/join.js puts this part first, outside the legacy wrapper, and the
   legacy parts (10 to 29) read these names as they read their own. Each phase
   of ARCHITECTURE.md moves more code into src/app/ and out of those parts. */
import { STORAGE_ID, APP_NAME, FILE_PREFIX, PREVIEW_NAME, DISPLAY_VERSION, APP_VERSION, VERSION_LINE, SITE_HOST, SITE_DIR_FALLBACK, THREE_URLS } from './app/config';
import { esc, uid, pad, iso, parse, addDays, weekStart, daysBetween, today, isNum, numOr, clampN, isDate, median, r1, andList, hashStr, numIn, mulberry } from './app/util';
import { LB, IN, KM_MI, PLATES_LB, PLATES_KG } from './app/units';
import { MUSCLES, MK, ML, NEW_MUSCLES_V5, TRACK_ONLY, BANDS, EQUIP, EQL, CARDIO, CARDIOL, CWHEN, CWHENL, MEAS, JOINTS, JK, JL, injLabel, exJoints, libExercises, COMMON, isCommon, patternOf, autoCompound, isCompound, noE1, BWF, bwShare, loadMode, rackKind, HARD_EX, LONG_TRIAL, LONG_IDS, profHeavy, COMMON_TIP, commonFirst, nameMatch } from './app/library';
import { DAYS, MAX_DAYS, dayLabel, defaultRoutine, TEMPLATES, routineFromTemplate, RIR_TGT_TIP, daySets, fixSupersets, linkToggle, move, nextTrainIdx, plannedPerWeek, routineEmpty, routineSig, sessDayIdx, ssLetters, tplCountLine, trainDaysOf, weekFactor } from './app/routines';
import { E1_MAX_RIR, rtfOf, e1, e1inv, rtfAt, trendE, fitE, rtfBand, REP_PR_SHARE, jumpCap, workLoad, atLoad, repFloor, isWork, setCredit, lighter, offTarget, sameRR, setSecs, setupSecs, GROW_PCT, BACK_DAYS, SESSION_CAP, PACE_N, PACE_DAYS, PACE_MIN, JUMP_TIP } from './app/formulas';
import { MONTHS, NIL, WD2, agoTxt, estMin, fmtDate, fmtDateRow, fmtG, fmtWith, greeting, min5, rangeWords, repSpan, sessTm, todayEye } from './app/format';
import { ACCENT0, ACCENTS, BW_EVERY, DEFAULT_HIDDEN, DSECS, DSEC_ALIAS, DSEC_FOLDED, DSEC_KEYS, FORM_SHEETS, REGION_WKS, VOL_MODES, defaultOrder, orderKeys } from './app/layout';
import { ADD_ICON, LOCKUP, MENU_ICON, SHARE_ICON } from './app/icons';
import { FOCUS_MAX, PROF_DAYS, PROF_EXP, PROF_EXP_TIP, PROF_FOCUS_TIP, PROF_GOALS, PROF_GOAL_TIP, STR_NEAR, STR_REST, profClean } from './app/profile';
import { BW_MAX_KG, BW_MIN_KG, EXTRA_KEYS, EXTRA_MAX, KNOWN_CARDIO, KNOWN_ITEM, KNOWN_MEAS, KNOWN_SEX, MEAS_MAX_CM, STATE_VERSION, TRASH_BYTES, TRASH_DAYS, TRASH_MAX, cleanCal, cleanChk, cleanTgt, did, fixId, okExtraKey, okSess, safeKey, sessCmp } from './app/records';
import { PLATE_MODES, dbListOf, gymClean, gymPlates, platesMode } from './app/gym';
import { CORE_ARR, CORE_FIELDS, baseFor, bodyChunkOf, chunkOf, chunksOf, emptyChunk, isChunkId, legacyBody, realCount, unionById } from './app/chunks';
import { Hx, canon, merge3List, merge3Val, mergeDraft } from './app/merge';
import { RIR_OPTS, blockDone, blockRest, editFp, effTarget, effW, freeDraft, greyW, hintOnce, joinAdjacent, joinRows, joinable, lastCell, lastDup, lastHead, overSets, sameExOnce, sessProgress, targetText, whyTarget } from './app/session';
import { LOAD_MODES, emptyLoad, estInLoad, loadNote, loadWords } from './app/loads';
import { BAND_WORDS, prName, prOverall } from './app/prs';
import { trendEnds, trendScope, trendW } from './app/trend';
import { aboveMax, belowMin, lowSt } from './app/volume';
import { goalGap, goalOk } from './app/goals';
import { RANGES, firstDate, rangeWeeks, weeksSpan } from './app/charts';
import { GENERIC_WORKOUT, IMP_ALIAS, IMP_MAX_ROWS, impDate, impFromTable, impGuess, impHeader, impNorm, impRows, impSetsText, impXlsx } from './app/importing';
import { FB_ASK, FB_CATS, FB_CTX_MAX, FB_DAY, FB_HINT, FB_IMG_MB, FB_MAX, FB_MIN, FB_SHOT_RE, FB_TITLE, FB_WHAT } from './app/feedback';
import { state, setState, ui, cloud, acct, acctWait, HIST_PAGE } from './app/store';
import { CAL_WEEKS, sessionWord } from './app/analytics';
import { avgWeeksTxt, FIRST_WEEK_WHY, LIGHTER_WEEK_TIP, ON_PLAN_TIP } from './app/weeks';
import { CHK_Q, SIZE_MAP, STALL_WHY, chkWord, musTrend } from './app/coach';
import { EX, U, activeRoutine, exInjury, exName, freeMode, gymOf, injuredSet, invalidate, isDeloadWeek, isRestWeek, prof, rirHalfOn, sortedSessions, fromD, stepRead, toD, defPlan, planCredit, planFor, planSetsPerWeek, profPlan, profRule, routineUpdates, appBand, defBand, fitFloors, refit, plannedSets, stallWeeks, barKg, capOf, exBarKg, gymRack, rackTol, fmtW, loadLabel, IDX, sessionWords, bwAt, bwLoad, bwRef, bwRefLoad, calStats, dateIndex, hardCredit, isHard, loadOf, prFrame, prLoad, rirEff, rirEst, rirUsual, statsUpTo, tonnage, weekSessions, dayMinutes, pace, paceRatios, sessModelMin, actualAvg4, avgFirstWeek, avgWait, avgWeeks, firstFullWeek, lastLighterWeek, muscleStatus, recentLighter, regionBalance, weekNeed, weekRoutine, weekStats, weekStreak, weeksAvg, coach, dropOnlyLift, fatigueStalls, movers, readiness, stalledIds, daysOff, easierText, heavierLoad, incOf, lighterLoad, progStep, rackStep, suggestCore, suggest } from './app/live';
import { AUTH, FB } from './app/providers';
import { effShow, halfLbl, rirScale } from './app/effort';
import { followViewport, morphInto } from './app/sheets';
import { guideSheet } from './app/guide';
