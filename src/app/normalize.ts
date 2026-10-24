/* The log as every build reads it (phase 4, r56; moved from the legacy
   script's storage part, changing nothing it does): normalize() rebuilds a
   whole save from what it can trust, field by field, so a backup, a cloud
   document or a half-written save never reaches the screens in a shape they
   cannot draw. Sync rests on it writing the same bytes for the same data on
   every phone and every build: tests/r56.js holds it to the build before the
   move, key order included, and tests/seams.js and tests/migration.js to
   every build since r11. The routine a new install starts with, and the
   signatures that tell a ready-made routine from one of the lifter's own,
   live here too, since the log's fresh state is made from them. */

import type { Exercise } from './types';
import type { State } from './store';
import { addDays, clampN, hashStr, isDate, isNum, numOr, today } from './util';
import { LB } from './units';
import { BANDS, CARDIO, CWHEN, JK, MEAS, MK, NEW_MUSCLES_V5, TRACK_ONLY, libExercises } from './library';
import { DAYS, MAX_DAYS, TEMPLATES, defaultRoutine, fixSupersets, routineFromTemplate, routineSig } from './routines';
import type { NewRoutine } from './routines';
import {
  BW_MAX_KG,
  EXTRA_KEYS,
  EXTRA_MAX,
  KNOWN_CARDIO,
  KNOWN_ITEM,
  KNOWN_MEAS,
  KNOWN_SEX,
  MEAS_MAX_CM,
  STATE_VERSION,
  TRASH_BYTES,
  TRASH_DAYS,
  TRASH_MAX,
  cleanCal,
  cleanChk,
  cleanTgt,
  did,
  fixId,
  okExtraKey,
  okSess,
  safeKey,
  arr,
  parseJson,
  rec
} from './records';
import type { Rec } from './records';
import { gymClean } from './gym';
import { profClean } from './profile';
import { canon } from './merge';
import { DEFAULT_HIDDEN, DSEC_FOLDED, DSEC_KEYS, HIDEABLE_KEYS, SEC_TABS, defaultOrder } from './layout';

declare global {
  interface Window {
    /** The routine a suite starts a new install with (tests/h.js); nothing else sets it. */
    IRONLOG_STARTER?: string | undefined;
  }
}

/* ---------- reading what came in ---------- */

/* Raw input is read through the readers in records.ts (rec, arr) and the
   one below, so the casts an unknown value needs are in those alone. */

/* An object's own fields, spread as `{...v}` spreads any value (a string's
   letters, an array's entries, nothing for a number, a boolean or null), so a
   field that arrives as the wrong type is read as it was before the move.
   Spreading is defined for every value; TypeScript asks for an object, hence
   the cast. */
const spread = (v: unknown): Rec => ({ ...(v as Rec) });

/** Whether a value is one of a list of words (`list.includes(v)` before the move: a non-string never matches). */
const oneOf = (v: unknown, list: readonly string[]): boolean => typeof v === 'string' && list.includes(v);

/** A muscle or a joint key: `MK.includes(v)` and `JK.includes(v)` before the move, which match a string alone. */
const MK_SET: ReadonlySet<string> = new Set(MK);
const JK_SET: ReadonlySet<string> = new Set(JK);
const isMuscle = (v: unknown): boolean => typeof v === 'string' && MK_SET.has(v);
const isMuscleOrJoint = (v: unknown): boolean => typeof v === 'string' && (MK_SET.has(v) || JK_SET.has(v));
const NEW_V5: ReadonlySet<string> = new Set(NEW_MUSCLES_V5);
/** A cardio kind, and when it sat against the lifting: one of the lists' keys (r56.1; until then any key Object has, and a list, passed). */
const CARDIO_KINDS: ReadonlySet<string> = new Set(CARDIO.map(c => c[0]));
const CARDIO_WHENS: ReadonlySet<string> = new Set(CWHEN.map(c => c[0]));
/** A time a Date can hold (r56.1, PENDING 308): a whole number of milliseconds after 1970, within what Date represents. */
const isTime = (t: number): boolean => Number.isInteger(t) && t > 0 && t <= 8.64e15;

/* ---------- fields a newer build added ---------- */

/* Fields a newer build adds to a record, kept as they came (r43). Every record
   is rebuilt from the fields this build knows, so a phone on an older build
   used to drop anything newer whenever it loaded or synced the log: an r37
   phone wiped a lift goal set on r38. A field this build does not know is now
   kept, untouched and never read. Only plain JSON data passes, under a name
   that cannot reach Object's prototype, at most EXTRA_KEYS fields and
   EXTRA_MAX characters of them (names included) per record, so a hostile
   backup or cloud row can neither run anything nor grow the log past what a
   sync document holds. `known` names fields this build writes only when valid
   (a load jump, a distance): an invalid one is dropped, not kept as if new.
   With anything kept, the record takes the key order it came in: sync
   documents are compared as written, key order included, so a newer build
   that puts its field mid-record and this one that put it last would rewrite
   each other's copy on every pull (found by the r43 review, the same loop as
   r21 and r28's settings). A record with nothing unknown comes out exactly as
   before, so its fingerprint and the sync are unchanged. */
/** A record with the unknown fields its source carried kept (above); `keepExtra.n` counts the fields kept, for the suites. */
export function keepExtra<O extends Rec>(src: unknown, out: O, known?: ReadonlySet<string>): O {
  const S = rec(src);
  if (!S || Array.isArray(src)) return out;
  // The record being built, its fields written by name; out is that record, typed as the caller made it.
  const o: Rec = out;
  let room = EXTRA_MAX,
    n = 0;
  for (const k of Object.keys(S)) {
    if (n >= EXTRA_KEYS) break;
    if (k in o || (known && known.has(k)) || !okExtraKey(k)) continue;
    const v = S[k];
    if (v === undefined || typeof v === 'function') continue;
    let j: string | undefined;
    try {
      j = JSON.stringify(v);
    } catch (e) {
      // A value JSON cannot write (a cycle, a BigInt) is not plain data, so it is not kept.
      continue;
    }
    const cost = j === undefined ? 0 : k.length + j.length + 4;
    if (j === undefined || cost > room) continue;
    room -= cost;
    n++;
    o[k] = parseJson(j);
    keepExtra.n++;
  }
  if (n) {
    const own = (k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);
    const ks = Object.keys(S).filter(own);
    for (const k of [...ks, ...Object.keys(o).filter(k => !ks.includes(k))]) {
      const v = o[k];
      delete o[k];
      o[k] = v;
    }
  }
  return out;
}
keepExtra.n = 0;

/* ---------- records ---------- */

/** One cardio or mobility entry, cleaned. In a draft the minutes may still be blank. */
export function cleanCardio(c: unknown, draft?: boolean, i?: number): Rec {
  const C = rec(c) || {};
  const m = numOr(C.min, NaN),
    hr = numOr(C.hr, NaN),
    dk = numOr(C.dist, NaN);
  return keepExtra(
    c,
    {
      id: typeof C.id === 'string' ? fixId(C.id) : did('c', c, i),
      date: isDate(C.date) ? C.date : today(),
      kind: typeof C.kind === 'string' && CARDIO_KINDS.has(C.kind) ? C.kind : 'other',
      min: isNum(m) && m > 0 ? Math.min(Math.round(m), 600) : draft ? null : 1,
      hr: isNum(hr) && hr >= 30 && hr <= 230 ? Math.round(hr) : null,
      when: typeof C.when === 'string' && CARDIO_WHENS.has(C.when) ? C.when : 'solo',
      note: typeof C.note === 'string' ? C.note.slice(0, 200) : '',
      demo: !!C.demo,
      ...(isNum(dk) && dk > 0 ? { dist: Math.min(Math.round(dk * 1000) / 1000, 1000) } : {})
    },
    KNOWN_CARDIO
  );
}

/* A saved session, cleaned: called only on one okSess accepted (a record with
   a date and a list of exercises), which the reader of its exercises relies on. */
export function cleanSess(raw: unknown, si: number): Rec {
  const ss = rec(raw) || {};
  const durMin = Number(ss.durMin),
    t = Number(ss.t);
  return keepExtra(raw, {
    id: typeof ss.id === 'string' ? fixId(ss.id) : did('s', raw, si),
    date: ss.date,
    dayIdx: clampN(ss.dayIdx, 0, MAX_DAYS - 1, 0),
    dayId: typeof ss.dayId === 'string' ? fixId(ss.dayId) : null,
    durMin: Number.isFinite(durMin) && durMin >= 1 && durMin <= 600 ? Math.round(durMin) : null,
    dayName: typeof ss.dayName === 'string' ? ss.dayName : 'Session',
    routineId: typeof ss.routineId === 'string' && ss.routineId ? fixId(ss.routineId) : '',
    notes: typeof ss.notes === 'string' ? ss.notes : '',
    demo: !!ss.demo,
    deload: !!ss.deload,
    light:
      ss.light === true || (ss.light == null && typeof ss.dayName === 'string' && / \(lighter\)$/.test(ss.dayName)),
    // Freestyle: not tied to a routine day. Check-in: the three pre-session taps.
    free: ss.free === true ? true : undefined,
    chk: cleanChk(rec(ss.chk)) || undefined,
    ex: (arr(ss.ex) || [])
      .filter(b => {
        const B = rec(b);
        return !!B && typeof B.exId === 'string' && Array.isArray(B.sets);
      })
      .map(b0 => {
        const b = rec(b0) || {};
        const rr = arr(b.rr);
        return keepExtra(
          b0,
          {
            exId: fixId(b.exId),
            note: typeof b.note === 'string' ? b.note : '',
            // Planned rep range at the time, [min,max]. Older sessions have none.
            rr:
              rr && rr.length === 2 && rr.every(v => Number.isFinite(Number(v)) && Number(v) > 0)
                ? [Math.round(Number(rr[0])), Math.round(Number(rr[1]))]
                : null,
            // Marked trimmed (Short on time, under half its sets) until r53. Neither written nor read since r54 (V's one rule reads the log); kept, here and in drafts, so a record saved before keeps its shape and hash.
            cut: b.cut === true ? true : undefined,
            // One exercise made lighter mid-session (r31, Make it lighter): out of trends and targets, the rest of the session counts.
            light: b.light === true ? true : undefined,
            // Held for a flagged injury, its key (r54): left out of the stall test. Absent unless held, so earlier records keep their hash.
            ...(isMuscleOrJoint(b.inj) ? { inj: b.inj } : {}),
            sets: (arr(b.sets) || [])
              .filter(x => !!x && typeof x === 'object')
              .map(x0 => {
                const x = rec(x0) || {};
                return keepExtra(x0, {
                  // Below 0 only for assisted sets (bodyweight minus the machine's help).
                  w: clampN(x.w, -300, 20000 * LB, 0),
                  r: Math.round(clampN(x.r, 0, 1000, 0)),
                  rir: x.rir == null || x.rir === '' ? null : clampN(x.rir, 0, 10, null),
                  warm: !!x.warm,
                  drop: !!x.drop && !x.warm,
                  cal: x.warm ? undefined : cleanCal(rec(x.cal)) || undefined,
                  // The row's own id (r56.1), last, where a build before it kept the unknown field.
                  ...(typeof x.rid === 'string' ? { rid: fixId(x.rid) } : {})
                });
              })
          },
          KNOWN_SEX
        );
      })
      .filter(b => b.sets.length),
    // When the session started (r34): orders two sessions on one day. Absent on older ones, so their records hash as before; kept only as a time a Date can hold (r56.1).
    t: isTime(Math.round(t)) ? Math.round(t) : undefined,
    // The sessions a week its routine planned when saved (r55, pwOf); absent unless recorded, so older records keep their hash.
    pw: typeof ss.pw === 'number' && Number.isInteger(ss.pw) && ss.pw >= 1 && ss.pw <= 7 ? ss.pw : undefined
  });
}

/* ---------- the routine a new install starts with ---------- */

/* The routine a new install starts with (V, decision 114, r29): Upper /
   lower, 4 days, the all-round choice, so someone who taps Log a workout now
   or Import instead of picking is not dropped into the six-day high-volume
   split. Saves that already have routines keep theirs. The suites built on
   the routine installs started with before r29 run with IRONLOG_STARTER set
   to it (tests/h.js); nothing else sets it. */
/** A new install's routine: Upper / lower, 4 days (or the template a suite names). */
export function starterRoutine(): NewRoutine {
  const k = window.IRONLOG_STARTER;
  // 'ul4' is a template's key, and a suite's name is checked to be one, so a routine always comes back (the !).
  return routineFromTemplate(k && TEMPLATES.some(t => t.key === k) ? k : 'ul4')!;
}

/* An untouched starter, the current one or the one installs began with
   before r29, is replaced when a ready-made routine is picked on a first run. */
/** The signatures of the two routines a new install has begun with. */
export function starterSigs(): string[] {
  return [routineSig(starterRoutine()), routineSig(defaultRoutine())];
}

/* A ready-made routine removed exactly as shipped can be added again from
   New from a template, so it is not kept in Recently deleted (r34.1, V: the
   same templates sat there for every new user with no way to clear them). */
let tplCache: Set<string> | null = null;
/** The signatures of every ready-made routine, made once. */
export function tplSigs(): Set<string> {
  if (!tplCache)
    tplCache = new Set(
      [...TEMPLATES.map(t => routineFromTemplate(t.key)), starterRoutine(), defaultRoutine()]
        .filter(r => !!r)
        .map(r => routineSig(r))
    );
  return tplCache;
}
/** Whether a routine (from the log, or a copy in Recently deleted) is a ready-made one exactly as shipped. */
export function plainTemplate(r: unknown): boolean {
  try {
    // routineSig reads the fields a routine has; a record that lacks them throws into the catch, as before the move (the cast).
    return !!r && tplSigs().has(routineSig(r as Parameters<typeof routineSig>[0]));
  } catch (e) {
    // Not a routine at all, so not a ready-made one.
    return false;
  }
}

/* ---------- the whole log ---------- */

/** The log of a new device, and of Erase everything, before normalize() fills it in. */
export type Fresh = {
  version: number;
  settings: Rec;
  exercises: Exercise[];
  routines: NewRoutine[];
  activeRoutineId: string;
  sessions: unknown[];
  bodyweights: unknown[];
  measurements: unknown[];
  draft: null;
  deloadWeek: null;
  injuries: unknown[];
  cardio: unknown[];
  trash: unknown[];
};
/** A new log: the starter routine, the library and the settings a new install begins with. */
export function freshState(): Fresh {
  const r = starterRoutine();
  return {
    version: STATE_VERSION,
    settings: {
      unit: 'lb',
      theme: 'dark',
      bands: parseJson(JSON.stringify(BANDS)),
      priorities: [],
      dashFolded: DSEC_FOLDED.slice(),
      lastExport: null,
      barKg: null,
      bwGoalPct: null,
      removedLib: [],
      timerMode: 'auto',
      timerSound: true,
      timerCompact: false,
      autoDone: true,
      homeFolded: [],
      wakeLock: false,
      timeBudget: null,
      rirMode: 'on',
      hidden: DEFAULT_HIDDEN.slice(),
      onboarded: false,
      calSnooze: null
    },
    exercises: libExercises(),
    routines: [r],
    activeRoutineId: r.id,
    sessions: [],
    bodyweights: [],
    measurements: [],
    draft: null,
    deloadWeek: null,
    injuries: [],
    cardio: [],
    trash: []
  };
}

/* Every field below is validated rather than trusted. The old version only
   checked that five keys were arrays, so a backup containing sessions:[{}]
   imported cleanly and then threw inside IDX() on the first render, leaving
   the app unusable with no obvious way back. normalize() runs on both load
   and import, so this also protects against a half-written localStorage
   record. Anything unusable is dropped; the count is reported to the caller
   via normalize.dropped. The log it returns is built field by field from
   those checks, which TypeScript cannot follow, so it is typed as the State
   once, at the end. */
/** A save read as every build reads it (above); `normalize.dropped` counts the damaged records the last call left out. */
export function normalize(input: unknown): State {
  const f = freshState();
  normalize.dropped = 0;
  // A new device and Erase everything both start here, fully normalized:
  // the raw fresh state lacks fields (section order, folds) every view reads.
  const s: Rec = rec(input) || f;
  // drop() is one record; drop(n) is n, and drop(0) is none (it used to count 1).
  const drop = (n?: number): void => {
    normalize.dropped += n == null ? 1 : Math.max(0, n);
  };
  const out: Rec = { ...f, ...s };

  /* A save from before a setting existed reads it as the app behaved then,
     not as a new install starts (r28): auto-mark off, nothing hidden, the
     code's own section order. Only a new device or Erase everything (s is
     the fresh state itself) gets the new-install layout and auto-mark on. */
  const fresh = s === f;
  const base = fresh ? f.settings : { ...f.settings, autoDone: false, hidden: [] };
  const st: Rec = { ...base, ...spread(s.settings || {}) };
  out.settings = st;
  st.unit = st.unit === 'kg' ? 'kg' : 'lb';
  st.theme = oneOf(st.theme, ['system', 'dark', 'light']) ? st.theme : 'system';
  // Timer and logging preferences. Older saves have none of these, so each
  // falls back to exactly how the app behaved before they existed.
  st.timerMode = oneOf(st.timerMode, ['auto', 'manual', 'off']) ? st.timerMode : 'auto';
  st.timerSound = st.timerSound !== false;
  st.timerCompact = st.timerCompact === true;
  st.autoDone = st.autoDone === true;
  // Optional settings added in r20 stay undefined unless set, so older
  // records keep their fingerprints and sync does not see them as edited.
  if (!oneOf(st.accent, ['blue', 'volt', 'ember', 'pink'])) delete st.accent;
  if (st.rirAsk !== true) delete st.rirAsk;
  // Count RIR 4 to 5 as half a set (r40): absent unless on.
  if (st.rirHalf !== true) delete st.rirHalf;
  // r34: adjusting the next sets is on unless turned off; only false is stored, so older saves hash as before.
  if (st.autoAdj !== false) delete st.autoAdj;
  // r34: weigh-in reminder in days (0 off); absent is every 14 days.
  if (!(st.bwEvery === 0 || st.bwEvery === 7 || st.bwEvery === 30)) delete st.bwEvery;
  // r34: Today opens on a blank session; absent is the plan's day.
  if (st.todayStart !== 'free') delete st.todayStart;
  // r34: rest weeks, week-start dates; the last two years kept.
  {
    const rw = arr(st.restWeeks);
    const r = rw ? [...new Set(rw.filter(isDate))].sort().slice(-104) : [];
    if (r.length) st.restWeeks = r;
    else delete st.restWeeks;
  }
  // r33 (item 206): effort in half points or RPE; absent is whole RIR, so older saves hash as before.
  if (st.rirScale !== 'half' && st.rirScale !== 'rpe') delete st.rirScale;
  // r25: suggested loads show grey until typed; 'fill' puts them in the rows
  // as before. Unset means grey (V's choice), so older saves change nothing
  // stored.
  if (st.loadFill !== 'fill') delete st.loadFill;
  {
    const n = typeof st.userName === 'string' ? st.userName.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    if (n) st.userName = n;
    else delete st.userName;
  }
  {
    const hf = arr(st.homeFolded);
    st.homeFolded = hf ? hf.filter(k => oneOf(k, ['map', 'body', 'week', 'tiles', 'coach', 'injuries'])) : [];
  }
  // Section order per tab (drag the ⠿ in a section header) and the folded
  // state of sections that older builds had no fold for. Absent means the
  // default order with everything open, exactly as before.
  // A new install starts in the default order (r28). The key is added here,
  // after the others, as every build before r28 adds it, so the synced
  // settings keep one key order across builds and no build rewrites another's.
  {
    const so = st.secOrder === undefined && fresh ? defaultOrder() : st.secOrder;
    const clean: Record<string, string[]> = {};
    const O = rec(so);
    if (O)
      for (const t of SEC_TABS) {
        const l = arr(O[t]);
        if (l)
          clean[t] = l
            .filter(k => typeof k === 'string')
            .filter(k => safeKey(k) && k.length < 40)
            .slice(0, 40);
      }
    st.secOrder = clean;
  }
  {
    const fl = arr(st.folds);
    st.folds = fl ? fl.filter(k => typeof k === 'string' && safeKey(k) && k.length < 80).slice(0, 200) : [];
  }
  st.wakeLock = st.wakeLock === true;
  // Small change plates (r29, item 98): absent unless on, so saves without it hash as before.
  if (st.smallPlates !== true) delete st.smallPlates;
  // Your gym (r33, item 207): absent unless set; rebuilt in one key order so a save hashes the same every time.
  {
    const g = gymClean(rec(st.gym));
    if (g) st.gym = g;
    else delete st.gym;
  }
  // The profile (r44, item 271): absent unless set, rebuilt in one key order.
  {
    const p = profClean(rec(st.profile));
    if (p) st.profile = p;
    else delete st.profile;
  }
  // The floors a first-run routine pick set (r44): absent unless set, whole sets 0 to 100, in muscle order.
  {
    const F = rec(st.bandsFit);
    const o: Record<string, number> = {};
    if (F && !Array.isArray(F))
      for (const m of MK) {
        const v = F[m];
        if (!TRACK_ONLY.has(m) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100) o[m] = v;
      }
    if (Object.keys(o).length) st.bandsFit = o;
    else delete st.bandsFit;
  }
  // RIR: on (as logged), cal (on, shifted by your calibration sets), off.
  st.rirMode = oneOf(st.rirMode, ['on', 'off', 'cal']) ? st.rirMode : 'on';
  {
    const h = arr(st.hidden);
    st.hidden = h ? [...new Set(h.filter(k => typeof k === 'string' && HIDEABLE_KEYS.has(k)))] : [];
  }
  st.onboarded = st.onboarded === true;
  st.calSnooze = isDate(st.calSnooze) ? st.calSnooze : null;
  // Legacy fold flag from older builds; unused, kept so old saves round-trip.
  st.tidyV = numOr(st.tidyV, 0) >= 1 ? 1 : 0;
  // Height in cm for waist-to-height; the one body measure that does not change.
  {
    const hc = numOr(st.heightCm, NaN);
    st.heightCm = isNum(hc) && hc >= 100 && hc <= 250 ? Math.round(hc * 10) / 10 : null;
  }
  {
    const tb = numOr(st.timeBudget, NaN);
    st.timeBudget = isNum(tb) && tb >= 10 ? Math.min(Math.round(tb), 300) : null;
  }
  {
    const pr = arr(st.priorities);
    st.priorities = pr ? pr.filter(isMuscle) : [];
  }
  // The settings as they came, read beside the merged ones for the two fields
  // whose absence means something (the folds, the removed built-ins).
  const sIn = rec(s.settings) || {};
  // Absent (older saves) means the defaults apply once; after that the user's folds win.
  {
    const df = arr(sIn.dashFolded);
    st.dashFolded = df ? df.filter(k => oneOf(k, DSEC_KEYS)) : DSEC_FOLDED.slice();
  }
  st.lastExport = isDate(st.lastExport) ? st.lastExport : null;
  // Built-in exercises the user deleted. Without this the library list below
  // silently puts every one of them back on the next load.
  const removedLib: string[] = (arr(sIn.removedLib) || []).filter(x => typeof x === 'string').map(fixId);
  st.removedLib = removedLib;
  const bk = numOr(st.barKg, NaN);
  st.barKg = isNum(bk) && bk > 0 ? Math.min(bk, 50) : null;
  const bg = numOr(st.bwGoalPct, NaN);
  st.bwGoalPct = isNum(bg) ? Math.min(Math.max(bg, -2), 2) : null;
  const inBands = spread(sIn.bands || {});
  const bands: Record<string, [number, number]> = {};
  st.bands = bands;
  for (const m of MK) {
    const b = arr(inBands[m]);
    let lo = b ? clampN(b[0], 0, 100, BANDS[m][0]) : BANDS[m][0];
    let hi = b ? clampN(b[1], 0, 100, BANDS[m][1]) : BANDS[m][1];
    if (lo > hi) {
      const t = lo;
      lo = hi;
      hi = t;
    }
    bands[m] = [lo, hi];
  }

  for (const k of ['exercises', 'routines', 'sessions', 'bodyweights', 'measurements', 'cardio', 'trash'])
    if (!Array.isArray(out[k])) out[k] = [];
  // Each is a list from here on (the line above).
  const list = (k: string): unknown[] => arr(out[k]) || [];

  // The library's own records go in beside the lifter's (below), so the list holds both shapes.
  const exercises: (Rec | Exercise)[] = list('exercises')
    .filter(e0 => {
      const e = rec(e0);
      return !!e && typeof e.id === 'string' && typeof e.name === 'string';
    })
    .map(e0 => {
      const e = rec(e0) || {};
      const sc = arr(e.secondary);
      const g = rec(e.goal);
      const inc = numOr(e.inc, NaN),
        bwf = numOr(e.bwf, NaN),
        ml = numOr(e.maxLoad, NaN),
        bar = numOr(e.barKg, NaN);
      const gw = g ? numOr(g.w, NaN) : NaN,
        gr = g ? Math.round(numOr(g.r, NaN)) : NaN;
      return keepExtra(e0, {
        id: fixId(e.id),
        name: e.name,
        primary: isMuscle(e.primary) ? e.primary : 'chest',
        secondary: sc ? sc.filter(m => isMuscle(m) && m !== e.primary) : [],
        equip: typeof e.equip === 'string' ? e.equip : 'other',
        bw: !!e.bw,
        rare: !!e.rare,
        perSide: !!e.perSide,
        note: typeof e.note === 'string' ? e.note : '',
        custom: !!e.custom,
        archived: !!e.archived,
        // Load step for this exercise everywhere it appears; null falls back to the routine item.
        inc: isNum(inc) && inc > 0 ? Math.min(inc, 500) : null,
        plates: oneOf(e.plates, ['bar', 'side', 'sleeve', 'none']) ? e.plates : null,
        // How the load number reads; absent means the exercise's default.
        load: oneOf(e.load, ['each', 'total', 'side', 'stack']) ? e.load : undefined,
        // Timed: the reps column holds seconds. Heaviest available: the top of the
        // stack or rack, past which progression moves to reps. Absent when unset,
        // so records saved before these existed hash exactly as before.
        timed: e.timed === true ? true : undefined,
        // Compound or isolation, when set in the editor (r27); absent reads it from the name.
        kind: e.kind === 'compound' || e.kind === 'iso' ? e.kind : undefined,
        // Assisted (item 45): the load number is the machine's help, stored below 0.
        assist: e.assist === true && !!e.bw ? true : undefined,
        bwf: isNum(bwf) && bwf > 0 && bwf <= 1.5 ? Math.round(bwf * 100) / 100 : undefined,
        maxLoad: isNum(ml) && ml > 0 ? Math.min(ml, 20000 * LB) : undefined,
        // This lift's own bar (r29, item 98): a trap or EZ bar instead of the bar in Settings. Absent when unset.
        barKg: isNum(bar) && bar > 0 ? Math.min(bar, 50) : undefined,
        // A lift goal (r38, item 188): a load (added load on a bodyweight lift) for a number of reps. Absent when unset.
        goal:
          g && isNum(gw) && gw >= 0 && gw <= 20000 * LB && gr >= 1 && gr <= 30 && !e.timed && !e.assist
            ? { w: gw, r: gr }
            : undefined
      });
    });
  out.exercises = exercises;
  const have = new Set(exercises.map(e => e.id));
  const gone = new Set(removedLib);
  const lib = libExercises();
  for (const e of lib) if (!have.has(e.id) && !gone.has(e.id)) exercises.push(e);
  // v1 saves predate the per-side flag, so the built-ins in them all carry
  // perSide:false. Backfill it from the library by id, and only that one
  // field, so any other edit the user made to a built-in survives.
  if (numOr(s.version, 1) < 2) {
    const libMap: Record<string, Exercise> = {};
    for (const e of lib) libMap[e.id] = e;
    for (const e of exercises) {
      const L = !e.custom && libMap[String(e.id)];
      if (L) e.perSide = L.perSide;
    }
  }
  /* v5: add serratus and rotator cuff where the library now lists them as
     secondary. Only those two keys are added, so any other edit survives. A
     built-in whose primary is one of them and reads Chest here was reset by
     an older build that did not know the muscle (its fallback is Chest), so
     it goes back to the library's primary. */
  if (numOr(s.version, 1) < 5) {
    const libMap: Record<string, Exercise> = {};
    for (const e of lib) libMap[e.id] = e;
    for (const e of exercises) {
      const L = !e.custom && libMap[String(e.id)];
      if (!L) continue;
      // Every exercise's secondary is a list of muscle keys from the build above, or the library's own (the cast).
      let sec = (arr(e.secondary) || []) as string[];
      if (NEW_V5.has(L.primary) && e.primary === 'chest') {
        e.primary = L.primary;
        sec = sec.filter(m => m !== L.primary);
        e.secondary = sec;
        for (const m of L.secondary) if (!sec.includes(m)) sec.push(m);
      }
      for (const m of NEW_MUSCLES_V5) if (L.secondary.includes(m) && e.primary !== m && !sec.includes(m)) sec.push(m);
    }
  }

  out.routines = list('routines')
    .filter(r0 => {
      const r = rec(r0);
      return !!r && Array.isArray(r.days);
    })
    .map((r0, ri) => {
      const r = rec(r0) || {};
      const rid = typeof r.id === 'string' ? fixId(r.id) : did('r', r0, ri);
      // The days were checked to be a list just above.
      const rdays = arr(r.days) || [];
      // Anything that is not explicitly fixed-weekday becomes a cycle, which is
      // how every pre-v3 routine migrates. A "weekly" routine with more than 7
      // days cannot exist through the UI; if one arrives, keep all its days as a
      // cycle rather than silently cutting any off.
      const schedule = r.schedule === 'weekly' && rdays.length <= 7 ? 'weekly' : 'cycle';
      const src = rdays.slice(0, MAX_DAYS);
      const count = schedule === 'weekly' ? 7 : Math.max(1, src.length);
      const days: Rec[] = [];
      const seen = new Set<string>();
      for (let i = 0; i < count; i++) {
        const d0 = src[i];
        const d = rec(d0);
        if (!d) {
          days.push(
            schedule === 'weekly'
              ? { id: rid + '-w' + i, name: i === 6 ? 'Rest' : 'Training day', rest: i === 6, items: [] }
              : { id: rid + '-p' + i, name: 'Training day', rest: false, items: [] }
          );
          continue;
        }
        const dbase = typeof d.id === 'string' ? fixId(d.id) : rid + '-d' + i;
        const items = (arr(d.items) || [])
          .filter(it0 => {
            const it = rec(it0);
            return !!it && typeof it.exId === 'string';
          })
          .map((it0, ii) => {
            const it = rec(it0) || {};
            const jump = Number(it.jump);
            return keepExtra(
              it0,
              {
                uid: typeof it.uid === 'string' ? fixId(it.uid) : dbase + '-i' + ii,
                exId: fixId(it.exId),
                sets: clampN(it.sets, 1, 30, 3),
                repMin: clampN(it.repMin, 1, 600, 8),
                repMax: clampN(it.repMax, 1, 600, 12),
                rir: clampN(it.rir, 0, 10, 1),
                rest: clampN(it.rest, 0, 1800, 90),
                inc: clampN(it.inc, 0, 500, 5 * LB),
                ss: typeof it.ss === 'string' && it.ss ? fixId(it.ss) : null,
                // r30: the load jump in percent, absent unless set (so older items keep their hash).
                ...(it.jump != null && it.jump !== '' && isNum(jump) ? { jump: Math.min(Math.max(jump, 0), 20) } : {})
              },
              KNOWN_ITEM
            );
          })
          .map(it => (it.repMax < it.repMin ? { ...it, repMax: it.repMin } : it));
        fixSupersets(items);
        let id = dbase;
        if (seen.has(id)) id = id + '-' + i;
        seen.add(id);
        days.push(
          keepExtra(d0, {
            id,
            name: typeof d.name === 'string' ? d.name : schedule === 'weekly' ? DAYS[i] : `Day ${i + 1}`,
            rest: !!d.rest,
            items
          })
        );
      }
      return keepExtra(r0, { id: rid, name: typeof r.name === 'string' ? r.name : 'Routine', schedule, days });
    });

  const cutoff = addDays(today(), -TRASH_DAYS);
  /** A copy in Recently deleted: a session, a routine or a cardio entry, with the day it was deleted. */
  type Trashed = { id: string; kind: string; date: string; data: Rec };
  let trash: Trashed[] = list('trash')
    .flatMap(t0 => {
      const t = rec(t0);
      const data = t ? rec(t.data) : null;
      return t &&
        typeof t.id === 'string' &&
        oneOf(t.kind, ['session', 'routine', 'cardio']) &&
        typeof t.kind === 'string' &&
        typeof t.date === 'string' &&
        isDate(t.date) &&
        t.date >= cutoff &&
        data
        ? [{ id: fixId(t.id), kind: t.kind, date: t.date, data }]
        : [];
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, TRASH_MAX);
  while (trash.length > 1 && JSON.stringify(trash).length > TRASH_BYTES) trash.pop();
  const before = list('sessions').length;
  let sessions = list('sessions')
    .filter(x => okSess(rec(x)))
    .map((x, i) => cleanSess(x, i))
    .filter(ss => (arr(ss.ex) || []).length);
  drop(before - sessions.length);
  /* A trashed id is a tombstone, but only for the copy that was deleted. If
     the same session was edited afterwards (on another device, or in an edit
     that was open while it was deleted), the edit is newer than the delete:
     keep it and retire the tombstone, because keeping data is the mistake
     that can be undone. Sessions are compared in their cleaned form, so
     field order and defaults added by newer builds do not count as edits. */
  let cardio: Rec[];
  {
    const tS = new Map<string, Trashed>(),
      tC = new Map<string, Trashed>();
    for (const t of trash) {
      if (t.kind === 'session') tS.set(t.id, t);
      else if (t.kind === 'cardio') tC.set(t.id, t);
    }
    const revived = new Set<string>();
    const same = (cur: Rec, t: { data: Rec }, clean: (x: unknown, i: number) => Rec, ok: (x: unknown) => boolean) => {
      try {
        return !ok(t.data) || canon(clean(t.data, 0)) === canon(cur);
      } catch (e) {
        // A copy that cannot be cleaned is read as the same record, so the deletion stands, as before the move.
        return true;
      }
    };
    sessions = sessions.filter(ss => {
      const t = tS.get(String(ss.id));
      if (!t) return true;
      if (
        same(
          { ...ss, id: ss.id },
          { data: { ...t.data, id: ss.id } },
          (x, i) => cleanSess(x, i),
          x => okSess(rec(x))
        )
      )
        return false;
      revived.add(t.id);
      return true;
    });
    cardio = list('cardio')
      .filter(c0 => {
        const c = rec(c0);
        return !!c && isDate(c.date) && isNum(numOr(c.min, NaN)) && numOr(c.min, 0) > 0;
      })
      .map((c, ci) => cleanCardio(c, false, ci))
      .filter(c => {
        const t = tC.get(String(c.id));
        if (!t) return true;
        if (
          same(
            c,
            { data: { ...t.data, id: c.id } },
            (x, i) => cleanCardio(x, false, i),
            x => !!x && typeof x === 'object'
          )
        )
          return false;
        revived.add(t.id);
        return true;
      });
    if (revived.size) trash = trash.filter(t => t.kind === 'routine' || !revived.has(t.id));
  }
  /* One id, two different copies: a session moved to a date in another
     half-month on one device while it was edited on another. Both used to be
     kept and counted twice. Keep the copy with more logged sets (then the
     later date) and put the other in Recently deleted under its own id, so
     nothing is lost. Every device resolves it the same way. */
  for (const [key, kind] of [
    ['sessions', 'session'],
    ['cardio', 'cardio']
  ] as const) {
    const byId = new Map<unknown, Rec>(),
      extra: Rec[] = [];
    // A cleaned session's exercises and sets, and a cleaned cardio entry's minutes, are what cleanSess and cleanCardio made them.
    const size = (x: Rec): number =>
      kind === 'session'
        ? (arr(x.ex) || []).reduce<number>((a, b) => a + (arr((rec(b) || {}).sets) || []).length, 0)
        : Number(x.min);
    const date = (x: Rec): string => String(x.date);
    for (const x of key === 'sessions' ? sessions : cardio) {
      const o = byId.get(x.id);
      if (!o) {
        byId.set(x.id, x);
        continue;
      }
      if (canon(o) === canon(x)) continue;
      const keepNew =
        size(x) > size(o) || (size(x) === size(o) && (date(x) > date(o) || (x.date === o.date && canon(x) > canon(o))));
      byId.set(x.id, keepNew ? x : o);
      extra.push(keepNew ? o : x);
    }
    if (extra.length) {
      if (key === 'sessions') sessions = [...byId.values()];
      else cardio = [...byId.values()];
      for (const x of extra) {
        const id = fixId(x.id + '-dup' + hashStr(canon(x)).slice(0, 6));
        if (!trash.some(t => t.id === id)) trash.unshift({ id, kind, date: today(), data: { ...x, id } });
      }
    }
  }
  out.trash = trash;
  out.sessions = sessions;
  out.cardio = cardio;

  const bBefore = list('bodyweights').length;
  out.bodyweights = list('bodyweights')
    .filter(b0 => {
      const b = rec(b0);
      return !!b && isDate(b.date) && isNum(numOr(b.kg, NaN)) && numOr(b.kg, 0) > 0;
    })
    .map((b0, bi) => {
      const b = rec(b0) || {};
      return keepExtra(b0, {
        id: typeof b.id === 'string' ? fixId(b.id) : did('b', b0, bi),
        date: b.date,
        kg: Math.min(numOr(b.kg, 0), BW_MAX_KG),
        demo: !!b.demo
      });
    });
  drop(bBefore - list('bodyweights').length);

  const mBefore = list('measurements').length;
  out.measurements = list('measurements')
    .filter(m0 => {
      const m = rec(m0);
      return !!m && isDate(m.date);
    })
    .map((m0, mi) => {
      const m = rec(m0) || {};
      const o: Rec = { id: typeof m.id === 'string' ? fixId(m.id) : did('m', m0, mi), date: m.date, demo: !!m.demo };
      for (const [k] of MEAS) {
        const v = numOr(m[k], NaN);
        if (isNum(v) && v > 0) o[k] = Math.min(v, MEAS_MAX_CM);
      }
      return keepExtra(m0, o, KNOWN_MEAS);
    });
  drop(mBefore - list('measurements').length);

  /* The draft is rendered by the logger, which reads plan, lastR and every set
     field directly. The old check only confirmed that ex was an array, so an
     imported backup carrying a half-written draft threw on first paint with no
     way back. Rebuild it field by field instead. */
  const d = rec(out.draft);
  if (out.draft && (!d || !Array.isArray(d.ex) || !isDate(d.date))) out.draft = null;
  if (out.draft && d) {
    const startedAt = Number(d.startedAt),
      durMin = Number(d.durMin);
    d.id = typeof d.id === 'string' ? fixId(d.id) : did('x', { date: d.date, dayName: d.dayName }, 0);
    d.dayIdx = clampN(d.dayIdx, 0, MAX_DAYS - 1, 0);
    d.dayId = typeof d.dayId === 'string' ? fixId(d.dayId) : null;
    d.startedAt = isTime(startedAt) ? startedAt : null;
    d.durMin = Number.isFinite(durMin) && durMin >= 1 ? Math.round(durMin) : null;
    d.dayName = typeof d.dayName === 'string' ? d.dayName : 'Session';
    d.routineId = typeof d.routineId === 'string' && d.routineId ? fixId(d.routineId) : '';
    d.notes = typeof d.notes === 'string' ? d.notes : '';
    d.editingId = typeof d.editingId === 'string' ? fixId(d.editingId) : null;
    d.deload = !!d.deload;
    d.light = !!d.light;
    d.limited = d.limited === true ? true : undefined;
    d.free = d.free === true ? true : undefined;
    // A past workout typed in after the fact: no rest timer, no clock, no check-in.
    d.past = d.past === true ? true : undefined;
    // The notes the app wrote when the session started, so Discard can tell them from yours.
    d.note0 = typeof d.note0 === 'string' ? d.note0.slice(0, 2000) : undefined;
    d.chk = cleanChk(rec(d.chk)) || undefined;
    d.cardio = (arr(d.cardio) || []).filter(c => !!c && typeof c === 'object').map((c, ci) => cleanCardio(c, true, ci));
    d.ex = (arr(d.ex) || [])
      .filter(b0 => {
        const b = rec(b0);
        return !!b && typeof b.exId === 'string' && Array.isArray(b.sets);
      })
      .map(b0 => {
        const b = rec(b0) || {};
        const pl = rec(b.plan) || {};
        const jump = Number(pl.jump);
        const plan: Rec = {
          sets: clampN(pl.sets, 1, 30, 3),
          repMin: clampN(pl.repMin, 1, 600, 8),
          repMax: clampN(pl.repMax, 1, 600, 12),
          rir: clampN(pl.rir, 0, 10, 1),
          rest: clampN(pl.rest, 0, 1800, 90),
          inc: clampN(pl.inc, 0, 500, 5 * LB),
          ss: typeof pl.ss === 'string' && pl.ss ? fixId(pl.ss) : null,
          ...(pl.jump != null && pl.jump !== '' && isNum(jump) ? { jump: Math.min(Math.max(jump, 0), 20) } : {})
        };
        if (Number(plan.repMax) < Number(plan.repMin)) plan.repMax = plan.repMin;
        const adj = rec(b.adj);
        const adjW = adj ? Number(adj.w) : NaN,
          adjFrom = adj ? Number(adj.from) : NaN,
          sw = Number(b.sw);
        const prev = arr(b.prev),
          lastR = arr(b.lastR),
          keepRR = arr(b.keepRR),
          ln = rec(b.lastNote);
        return keepExtra(b0, {
          ...(typeof b.bid === 'string' && b.bid ? { bid: fixId(b.bid) } : {}),
          exId: fixId(b.exId),
          plan,
          note: typeof b.note === 'string' ? b.note : '',
          inj: isMuscleOrJoint(b.inj) ? b.inj : null,
          hint: typeof b.hint === 'string' ? b.hint : '',
          last: typeof b.last === 'string' ? b.last : '',
          // Last time's sets as shown in the Last column (r44): short strings, absent in older drafts.
          prev: prev
            ? prev
                .filter(x => typeof x === 'string')
                .slice(0, 30)
                .map(x => x.slice(0, 40))
            : undefined,
          prevOff: b.prevOff === true ? true : undefined,
          target: typeof b.target === 'string' ? b.target : '',
          easier: typeof b.easier === 'string' ? b.easier : null,
          tgt: cleanTgt(rec(b.tgt)),
          // Last time's reps per set: shown as placeholders, so numbers only.
          lastR: lastR
            ? lastR.slice(0, 30).map(v => {
                const n = numOr(v, NaN);
                return isNum(n) && n >= 0 ? Math.min(n, 1000) : null;
              })
            : [],
          swappedFrom: typeof b.swappedFrom === 'string' ? fixId(b.swappedFrom) : null,
          cut: b.cut === true ? true : undefined,
          // Added on a lighter day or in a deload, the sets before they were halved, for Finish's offer to the routine (r54); absent otherwise.
          full:
            typeof b.full === 'number' && Number.isInteger(b.full) && b.full >= 1 && b.full <= 30 ? b.full : undefined,
          light: b.light === true ? true : undefined,
          // The date the target came from, when "Last" is a newer session short of its usual, lighter, or a deload (r26).
          basis: isDate(b.basis) ? b.basis : undefined,
          // The suggested load the rows started from (r24); absent in older drafts.
          sw: b.sw === null ? null : b.sw === undefined || !isNum(sw) ? undefined : clampN(b.sw, -300, 20000 * LB, 0),
          // The next sets adjusted from a set (r34), and Keep for the rest of the session.
          adj:
            adj &&
            typeof adj.at === 'number' &&
            Number.isInteger(adj.at) &&
            adj.at >= 0 &&
            isNum(adjW) &&
            isNum(adjFrom)
              ? {
                  at: adj.at,
                  w: clampN(adj.w, 0, 20000 * LB, 0),
                  from: clampN(adj.from, 0, 20000 * LB, 0),
                  r: Math.round(clampN(adj.r, 1, 1000, 1)),
                  up: adj.up === true,
                  why: typeof adj.why === 'string' ? adj.why.slice(0, 160) : '',
                  // The row it came from (PENDING 333), last, where a build before it kept no such field.
                  ...(typeof adj.rid === 'string' ? { rid: fixId(adj.rid) } : {})
                }
              : undefined,
          adjOff: b.adjOff === true ? true : undefined,
          // Editing a saved session keeps the rep range it was logged under.
          keepRR:
            b.keepRR === undefined
              ? undefined
              : keepRR && keepRR.length === 2
                ? keepRR.map(v => Math.round(Number(v)) || 1)
                : null,
          lastNote: ln && typeof ln.text === 'string' && isDate(ln.date) ? { date: ln.date, text: ln.text } : null,
          sets: (arr(b.sets) || [])
            .filter(x => !!x && typeof x === 'object')
            .map(x0 => {
              const x = rec(x0) || {};
              return keepExtra(x0, {
                w: x.w == null ? null : clampN(x.w, -300, 20000 * LB, 0),
                r: x.r == null || x.r === '' ? null : Math.round(clampN(x.r, 0, 1000, 0)),
                rir: x.rir == null || x.rir === '' ? null : clampN(x.rir, 0, 10, null),
                warm: !!x.warm,
                drop: !!x.drop && !x.warm,
                done: !!x.done,
                cal: x.warm ? undefined : cleanCal(rec(x.cal)) || undefined,
                // The row's own id (r56.1), last, where a build before it kept the unknown field.
                ...(typeof x.rid === 'string' ? { rid: fixId(x.rid) } : {})
              });
            })
        });
      });
  }

  out.deloadWeek = isDate(out.deloadWeek) ? out.deloadWeek : null;
  out.injuries = (arr(out.injuries) || [])
    .filter(x0 => {
      const x = rec(x0);
      return !!x && isMuscleOrJoint(x.m);
    })
    .map((x0, xi) => {
      const x = rec(x0) || {};
      return keepExtra(x0, {
        id: typeof x.id === 'string' ? fixId(x.id) : did('j', x0, xi),
        m: x.m,
        note: typeof x.note === 'string' ? x.note : '',
        date: isDate(x.date) ? x.date : today()
      });
    });
  /* Former bests belonged to the Comeback tracker, removed at the owner's
     request in r19 together with any that were saved. Older saves, backups
     and cloud copies still carry them, so they are dropped here on every
     load, import and merge. */
  delete out.priors;
  const routines = arr(out.routines) || [];
  if (!routines.length) out.routines = [starterRoutine()];
  if (typeof out.activeRoutineId === 'string') out.activeRoutineId = fixId(out.activeRoutineId);
  const rs = (arr(out.routines) || []).map(r => rec(r) || {});
  if (!rs.find(r => r.id === out.activeRoutineId)) out.activeRoutineId = rs[0].id;
  out.version = STATE_VERSION;
  // Built field by field from the checks above, which TypeScript cannot follow (see above): the cast.
  return out as State;
}
normalize.dropped = 0;
