/* The legacy script's imports from the typed modules in src/app/ (r49).
   scripts/join.js puts this part first, outside the legacy wrapper, and the
   legacy parts (10 to 29) read these names as they read their own. Each phase
   of ARCHITECTURE.md moves more code into src/app/ and out of those parts. */
import { STORAGE_ID, APP_NAME, FILE_PREFIX, PREVIEW_NAME, WORDMARK, DISPLAY_VERSION, APP_VERSION, VERSION_LINE, SITE_HOST, SITE_DIR_FALLBACK, THREE_URLS } from './app/config';
import { esc, uid, pad, iso, parse, addDays, weekStart, daysBetween, today, isNum, numOr, clampN, isDate, median, r1, r3, andList, hashStr, numIn } from './app/util';
import { LB, IN, KM_MI, STEP_LB, PLATES_LB, PLATES_KG } from './app/units';
import { MUSCLES, MK, ML, NEW_MUSCLES_V5, TRACK_ONLY, BANDS, REGIONS, EQUIP, EQL, CARDIO, CARDIOL, CWHEN, CWHENL, MEAS, JOINTS, JK, JL, injLabel, exJoints, libExercises, COMMON, isCommon, patternOf, autoCompound, isCompound, noE1, SLOW_RECOVERY, BWF, bwShare, ONE_DB, PLATE_SIDE_IDS, loadMode, KIN_UNI, RACK, rackKind, HARD_EX, LONG_TRIAL, LONG_IDS, profHeavy } from './app/library';
import { DAYS, MAX_DAYS, dayLabel, DEFAULT_PLAN, defaultRoutine, TEMPLATES, routineFromTemplate } from './app/routines';
import { E1_MAX_RIR, rtfOf, e1, e1inv, rtfAt, trendE, fitE, rtfBand, REP_PR_SHARE, t90, jumpPct, jumpCap, workLoad, atLoad, repFloor, isWork, setCredit, tagged, offSession, sameRR, setSecs, setupSecs, GROW_PCT, BACK_DAYS, SESSION_CAP, PACE_N, PACE_DAYS, PACE_MIN, PACE_LO, PACE_HI } from './app/formulas';
