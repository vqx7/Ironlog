/* The log as every build reads it: normalize() rebuilds a
   whole save from what it can trust, field by field, so a backup, a cloud
   document or a half-written save never reaches the screens in a shape they
   cannot draw. Sync rests on it writing the same bytes for the same data on
   every phone and every build: tests/r56.js holds it to the build before the
   move, key order included, and tests/seams.js and tests/migration.js to
   every build since r11. The routine a new install starts with, and the
   signatures that tell a ready-made routine from one of the lifter's own,
   live here too, since the log's fresh state is made from them. */

import type {
  Asked,
  Bodyweight,
  CardioEntry,
  Day,
  DraftBlock,
  DraftSet,
  Exercise,
  Injury,
  LoggedSet,
  Measurement,
  MuscleKey,
  Plan,
  PlanItem,
  Routine,
  Session,
  SessionEx,
  Settings
} from './types';
import type { DraftLike } from './session';
import type { State } from './store';
import { clampN, hashStr, isDate, isNum, numOr, today, r1, r3, HUNDREDTHS, WEEK_DAYS, SUNDAY } from './util';
import { LB } from './units';
import {
  BANDS,
  CARDIO,
  CWHEN,
  EQUIP,
  JK,
  MEAS,
  MK,
  NEW_MUSCLES_V5,
  TARGETED,
  TRACK_ONLY,
  LIB_NAMES_BEFORE,
  LIB_NOTES_BEFORE,
  libExercises
} from './library';
import {
  DAYS,
  MAX_DAYS,
  TEMPLATES,
  defaultRoutine,
  fixSupersets,
  routineFromTemplate,
  routineSig,
  templateSigsBefore,
  DEFAULT_PLAN
} from './routines';
import type { NewRoutine } from './routines';
import {
  BW_MAX_KG,
  EXTRA_KEYS,
  EXTRA_MAX,
  KNOWN_CARDIO,
  KNOWN_ITEM,
  KNOWN_MEAS,
  KNOWN_BLOCK,
  KNOWN_SEX,
  KNOWN_SESS,
  KNOWN_DAY,
  MEAS_MAX_CM,
  STATE_VERSION,
  TRASH_BYTES,
  TRASH_MAX,
  cleanCal,
  cleanChk,
  cleanTgt,
  did,
  fixId,
  okExtraKey,
  okSess,
  picIds,
  safeKey,
  arr,
  trashKind,
  parseJson,
  rec,
  LIMITS,
  EFFORT_TOP,
  V_PER_SIDE,
  V_NEW_MUSCLES
} from './records';
import type { Rec, Trashed } from './records';
import { gymClean } from './gym';
import { profClean } from './profile';
import { canon } from './merge';
import {
  DEFAULT_HIDDEN,
  DSEC_FOLDED,
  DSEC_KEYS,
  HIDEABLE_KEYS,
  SEC_TABS,
  defaultOrder,
  bwEveryKept,
  blockWeeksKept
} from './layout';

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
   field that arrives as the wrong type is read as every build reads it.
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
/** A cardio kind, and when it sat against the lifting: one of the lists' keys (not any key an Object has, nor a list). */
const CARDIO_KINDS: ReadonlySet<string> = new Set(CARDIO.map(c => c[0]));
const CARDIO_WHENS: ReadonlySet<string> = new Set(CWHEN.map(c => c[0]));
/** A time a Date can hold: a whole number of milliseconds after 1970, within what Date represents. */
const isTime = (t: number): boolean => Number.isInteger(t) && t > 0 && t <= MAX_TIME;
/** The latest time a Date can hold, in milliseconds after 1970 (ECMAScript: 10^8 days). */
const MAX_TIME = 8.64e15;
/** The heaviest load and the most help on an assisted lift, in kilograms as loads are kept; a load typed is kept within them too. */
export const LOAD_MAX = LIMITS.loadLb * LB,
  LOAD_MIN = -LIMITS.assistKg;
/** What a kept unknown field adds to the saved text beside its key and value: two quotes, a colon and a comma. */
const EXTRA_KEY_COST = 4;
/** The characters of a content hash that tell a duplicate's id apart. */
const DUP_HASH = 6;

/** A plan's numbers, routine item or a workout's block alike: each within its
    bound, the default plan's where it is missing or not a number, in the one
    key order both have always been written in. */
function planNums(p: Rec): Pick<Plan, 'sets' | 'repMin' | 'repMax' | 'rir' | 'rest' | 'inc'> {
  const D = DEFAULT_PLAN;
  return {
    sets: clampN(p.sets, 1, LIMITS.sets, D.sets),
    repMin: clampN(p.repMin, 1, LIMITS.repRange, D.repMin),
    repMax: clampN(p.repMax, 1, LIMITS.repRange, D.repMax),
    rir: clampN(p.rir, 0, EFFORT_TOP, D.rir),
    rest: clampN(p.rest, 0, LIMITS.restS, D.rest),
    inc: clampN(p.inc, 0, LIMITS.step, D.inc)
  };
}

/** A plan's load jump in percent, within its bound, absent unless set, so older plans keep their hash. */
function jumpOf(p: Rec): { jump?: number } {
  const jump = Number(p.jump);
  return p.jump != null && p.jump !== '' && isNum(jump) ? { jump: Math.min(Math.max(jump, 0), LIMITS.jumpPct) } : {};
}

/* ---------- fields a newer build added ---------- */

/* Fields a newer build adds to a record, kept as they came. Every record
   is rebuilt from the fields this build knows, so a phone on an older build
   would drop anything newer whenever it loaded or synced the log (an r37
   phone wiped a lift goal set on r38). A field this build does not know is
   kept, untouched and never read. Only plain JSON data passes, under a name
   that cannot reach Object's prototype, at most EXTRA_KEYS fields and
   EXTRA_MAX characters of them (names included) per record, so a hostile
   backup or cloud row can neither run anything nor grow the log past what a
   sync document holds. `known` names fields this build writes only when valid
   (a load jump, a distance): an invalid one is dropped, not kept as if new.
   With anything kept, the record takes the key order it came in: sync
   documents are compared as written, key order included, so a newer build
   that puts its field mid-record and this one that put it last would rewrite
   each other's copy on every pull, as settings once did. A record with
   nothing unknown comes out as if none of this were here, so its fingerprint
   and the sync are unchanged. */
/** A record with the unknown fields its source carried kept (above); `keepExtra.n` counts the fields kept, for the suites. */
export function keepExtra<O extends object>(src: unknown, out: O, known?: ReadonlySet<string>): O {
  keepExtra.n += extraInto(src, out, known);
  return out;
}
keepExtra.n = 0;
/** The work of keepExtra, counted for its caller: the unknown fields of `src` written into `out` within the limits,
    and how many were kept. The workout in progress and the log itself use it uncounted: the count the suites read is of records' fields. */
function extraInto(src: unknown, out: object, known?: ReadonlySet<string>): number {
  const S = rec(src);
  if (!S || Array.isArray(src)) return 0;
  let room = EXTRA_MAX,
    n = 0;
  for (const k of Object.keys(S)) {
    if (n >= EXTRA_KEYS) break;
    if (k in out || (known && known.has(k)) || !okExtraKey(k)) continue;
    const v = S[k];
    if (v === undefined || typeof v === 'function') continue;
    let j: string | undefined;
    try {
      j = JSON.stringify(v);
    } catch (e) {
      // A value JSON cannot write (a cycle, a BigInt) is not plain data, so it is not kept.
      continue;
    }
    const cost = j === undefined ? 0 : k.length + j.length + EXTRA_KEY_COST;
    if (j === undefined || cost > room) continue;
    room -= cost;
    n++;
    // Written as an assignment writes it, under a name okExtraKey allowed.
    Object.assign(out, { [k]: parseJson(j) });
  }
  if (n) orderLike(S, out);
  return n;
}
/** Puts a rebuilt record's fields in the order its source had them, the rest after in their own order: the record's
    fields read once, then each taken out and written back, those the source has first (a field written again stays
    where it stood, so taking it out first is what moves it). */
function orderLike(S: Rec, out: object): void {
  const was: Rec = { ...rec(out) };
  const ks = Object.keys(S).filter(k => Object.prototype.hasOwnProperty.call(was, k));
  for (const k of [...ks, ...Object.keys(was).filter(k => !ks.includes(k))]) {
    Reflect.deleteProperty(out, k);
    Object.assign(out, { [k]: was[k] });
  }
}

/* ---------- records ---------- */

/** A cardio row of a workout in progress: a saved entry's fields, its minutes blank until typed. */
type CardioRow = Omit<CardioEntry, 'min'> & { min: number | null };

/* One cardio or mobility entry, cleaned, its minutes the one field a saved
   entry and a workout's row read differently: a saved one's are 1 at the
   least (`none` 1), a row's may still be blank (`none` null). */
function cardioOf<M extends number | null>(
  c: unknown,
  none: M,
  i?: number
): Omit<CardioEntry, 'min'> & { min: number | M } {
  const C = rec(c) || {};
  const m = numOr(C.min, NaN),
    hr = numOr(C.hr, NaN),
    dk = numOr(C.dist, NaN);
  return keepExtra(
    c,
    {
      id: typeof C.id === 'string' ? fixId(C.id) : did('c', c, i),
      date: typeof C.date === 'string' && isDate(C.date) ? C.date : today(),
      kind: typeof C.kind === 'string' && CARDIO_KINDS.has(C.kind) ? C.kind : 'other',
      min: isNum(m) && m > 0 ? Math.min(Math.round(m), LIMITS.minutes) : none,
      hr: isNum(hr) && hr >= LIMITS.hr[0] && hr <= LIMITS.hr[1] ? Math.round(hr) : null,
      when: typeof C.when === 'string' && CARDIO_WHENS.has(C.when) ? C.when : 'solo',
      note: typeof C.note === 'string' ? C.note.slice(0, LIMITS.cardioNote) : '',
      demo: !!C.demo,
      ...(isNum(dk) && dk > 0 ? { dist: Math.min(r3(dk), LIMITS.distKm) } : {})
    },
    KNOWN_CARDIO
  );
}
/** One saved cardio or mobility entry, cleaned. */
export const cleanCardio = (c: unknown, i?: number): CardioEntry => cardioOf(c, 1, i);
/** One cardio row of a workout in progress, cleaned: its minutes may still be blank. */
export const cleanDraftCardio = (c: unknown, i?: number): CardioRow => cardioOf(c, null, i);

/** A record's pictures as a field to spread last: { pics } when it has any, nothing otherwise. */
const picsField = (v: unknown): { pics?: string[] } => {
  const p = picIds(v);
  return p ? { pics: p } : {};
};

/** A pair of numbers, as a rep range is kept. */
const pair = (a: number, b: number): [number, number] => [a, b];

/* A saved session, cleaned: called only on one okSess accepted (a record with
   a date and a list of exercises), which the reader of its exercises relies
   on; so its date is that string (the '' after it is never reached). */
/** A saved session, cleaned field by field. */
export function cleanSess(raw: unknown, si: number): Session {
  const ss = rec(raw) || {};
  const durMin = Number(ss.durMin),
    t = Number(ss.t);
  return keepExtra(
    raw,
    {
      id: typeof ss.id === 'string' ? fixId(ss.id) : did('s', raw, si),
      date: typeof ss.date === 'string' ? ss.date : '',
      dayIdx: clampN(ss.dayIdx, 0, MAX_DAYS - 1, 0),
      dayId: typeof ss.dayId === 'string' ? fixId(ss.dayId) : null,
      durMin: Number.isFinite(durMin) && durMin >= 1 && durMin <= LIMITS.minutes ? Math.round(durMin) : null,
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
        .flatMap((b0): SessionEx[] => {
          const b = rec(b0);
          if (!b || typeof b.exId !== 'string' || !arr(b.sets)) return [];
          const rr = arr(b.rr);
          return [
            keepExtra(
              b0,
              {
                exId: fixId(b.exId),
                note: typeof b.note === 'string' ? b.note : '',
                // Planned rep range at the time, [min,max]. Older sessions have none.
                rr:
                  rr && rr.length === 2 && rr.every(v => Number.isFinite(Number(v)) && Number(v) > 0)
                    ? pair(Math.round(Number(rr[0])), Math.round(Number(rr[1])))
                    : null,
                // Marked trimmed (Short on time, under half its sets) by builds up to r53, and no longer written or read (V's one rule reads the log); kept, here and in drafts, so a record saved with it keeps its shape and hash.
                cut: b.cut === true ? true : undefined,
                // One exercise made lighter mid-session (Make it lighter): out of trends and targets, the rest of the session counts.
                light: b.light === true ? true : undefined,
                // Held for a flagged injury, its key: left out of the stall test. Absent unless held, so earlier records keep their hash.
                ...(typeof b.inj === 'string' && isMuscleOrJoint(b.inj) ? { inj: b.inj } : {}),
                sets: (arr(b.sets) || []).flatMap((x0): LoggedSet[] => {
                  const x = rec(x0);
                  if (!x) return [];
                  const sg = askedOf(x);
                  return [
                    keepExtra(
                      x0,
                      {
                        // Below 0 only for assisted sets (bodyweight minus the machine's help).
                        w: clampN(x.w, LOAD_MIN, LOAD_MAX, 0),
                        r: Math.round(clampN(x.r, 0, LIMITS.reps, 0)),
                        rir: x.rir == null || x.rir === '' ? null : clampN(x.rir, 0, EFFORT_TOP, null),
                        warm: !!x.warm,
                        drop: !!x.drop && !x.warm,
                        cal: x.warm ? undefined : cleanCal(rec(x.cal)) || undefined,
                        // The row's own id, last, where a build before it kept the unknown field.
                        ...(typeof x.rid === 'string' ? { rid: fixId(x.rid) } : {}),
                        // What the app asked of it, after the id, where a build before 2.61 keeps it.
                        ...(sg ? { sg } : {})
                      },
                      KNOWN_SETF
                    )
                  ];
                }),
                // The sets its routine's plan gave it when saved, last, as Finish writes it; absent unless recorded, so older records keep their hash.
                ...(typeof b.ps === 'number' && Number.isInteger(b.ps) && b.ps >= 1 && b.ps <= LIMITS.sets
                  ? { ps: b.ps }
                  : {}),
                // Done at a new machine or gym, last, as Finish writes it; absent unless marked, so older records keep their hash.
                ...(b.nw === true ? { nw: true as const } : {}),
                // The pictures on its note, by id, last; absent unless there are any, so older records keep their hash.
                ...picsField(b.pics)
              },
              KNOWN_SEX
            )
          ];
        })
        .filter(b => b.sets.length),
      // When the session started: orders two sessions on one day. Absent on older ones, so their records hash as before; kept only as a time a Date can hold.
      t: isTime(Math.round(t)) ? Math.round(t) : undefined,
      // The sessions a week its routine planned when saved (pwOf); absent unless recorded, so older records keep their hash.
      // At most seven, as every build before reads it: a week of more is not recorded (pwOf).
      pw: typeof ss.pw === 'number' && Number.isInteger(ss.pw) && ss.pw >= 1 && ss.pw <= WEEK_DAYS ? ss.pw : undefined,
      // The pictures on the workout's notes, by id; absent unless there are any, so older records keep their shape and hash.
      ...picsField(ss.pics),
      // Its day's second workout: 2 or absent, last, where a build before r68 keeps it among its extras.
      ...(ss.part === 2 ? { part: 2 as const } : {})
    },
    KNOWN_SESS
  );
}

/* ---------- the routine a new install starts with ---------- */

/* The routine a new install starts with (V, decision 114): Upper /
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
  return [routineSig(starterRoutine()), starterSigBefore(), routineSig(defaultRoutine())];
}
/* The starter as installs made it up to r63, before an isolation lift's
   rest became ISO_REST at least: a phone set up then and never
   changed still has it. */
function starterSigBefore(): string {
  const k = window.IRONLOG_STARTER;
  const key = k && TEMPLATES.some(t => t.key === k) ? k : 'ul4';
  // templateSigsBefore lists every template in TEMPLATES' order, so the key's place finds it.
  return templateSigsBefore()[TEMPLATES.findIndex(t => t.key === key)] ?? routineSig(starterRoutine());
}

/* A ready-made routine removed exactly as shipped can be added again from
   New from a template, so it is not kept in Recently deleted (V: the
   same templates sat there for every new user with no way to clear them). */
let tplCache: Set<string> | null = null;
/** The signatures of every ready-made routine, made once. */
function tplSigs(): Set<string> {
  if (!tplCache)
    tplCache = new Set(
      [...TEMPLATES.map(t => routineFromTemplate(t.key)), starterRoutine(), defaultRoutine()]
        .filter(r => !!r)
        .map(r => routineSig(r))
        .concat(templateSigsBefore())
    );
  return tplCache;
}
/** Whether a routine (from the log, or a copy in Recently deleted) is a ready-made one exactly as shipped. */
export function plainTemplate(r: unknown): boolean {
  try {
    // routineSig reads the fields a routine has; a record that lacks them throws into the catch (the cast).
    return !!r && tplSigs().has(routineSig(r as Parameters<typeof routineSig>[0]));
  } catch (e) {
    // Not a routine at all, so not a ready-made one.
    return false;
  }
}

/* ---------- the whole log ---------- */

/** The log of a new device, and of Erase everything, before normalize() fills it in. */
type Fresh = {
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
function freshState(): Fresh {
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

/** A word from a list, as the list holds it, or undefined when the value is none of them. */
const pick = <W extends string>(v: unknown, list: readonly W[]): W | undefined => list.find(w => w === v);
/** The strings of a list that pass a test, in their order. */
const strings = (l: readonly unknown[], ok: (s: string) => boolean): string[] =>
  l.flatMap(k => (typeof k === 'string' && ok(k) ? [k] : []));
/** The muscle keys of a list, in its order (a key twice is kept twice). */
const muscles = (l: readonly unknown[]): MuscleKey[] =>
  l.flatMap(k => {
    const m = MK.find(x => x === k);
    return m ? [m] : [];
  });

/* The settings, merged over the defaults (a save from before a setting
   existed reads it as the app behaved then, not as a new install starts:
   auto-mark off, nothing hidden, the code's own section order; only a
   new device or Erase everything, s the fresh state itself, gets the
   new-install layout and auto-mark on). Each field is worked out from the
   merged copy and written back into it, the copy's own order kept: a field
   it has stays where it stands, and the four a build added after the others
   (the section order, the folds, the fold flag and the height) go last when
   it lacks them, as every build since r28 has put them, so the synced
   settings keep one key order across builds and no build rewrites another's.
   A setting a newer build saved is kept beside these, unread. Optional
   settings stay absent unless set, so older records keep their fingerprints
   and sync does not see them as edited. */
/** The settings of a save, cleaned (above). */
function cleanSettings(s: Rec, f: Fresh): Settings {
  const fresh = s === f;
  const base = fresh ? f.settings : { ...f.settings, autoDone: false, hidden: [] };
  const st: Rec = { ...base, ...spread(s.settings || {}) };
  // The settings as they came, read beside the merged ones for the two fields whose absence means something (the folds, the removed built-ins).
  const sIn = rec(s.settings) || {};
  const accent = pick(st.accent, ['blue', 'volt', 'ember', 'pink', 'violet', 'cyan', 'red'] as const);
  const bwEvery = bwEveryKept(st.bwEvery);
  const blockWeeks = blockWeeksKept(st.blockWeeks);
  const restWeeks = (() => {
    const rw = arr(st.restWeeks);
    return rw ? [...new Set(strings(rw, isDate))].sort().slice(-LIMITS.restWeeks) : [];
  })();
  const rirScale = pick(st.rirScale, ['half', 'rpe'] as const);
  const userName = typeof st.userName === 'string' ? st.userName.replace(/\s+/g, ' ').trim().slice(0, LIMITS.name) : '';
  const secOrder = (() => {
    const so = st.secOrder === undefined && fresh ? defaultOrder() : st.secOrder;
    const clean: Record<string, string[]> = {};
    const O = rec(so);
    if (O)
      for (const t of SEC_TABS) {
        const l = arr(O[t]);
        if (l) clean[t] = strings(l, k => safeKey(k) && k.length < LIMITS.secKey).slice(0, LIMITS.secKey);
      }
    return clean;
  })();
  const gym = gymClean(rec(st.gym));
  const profile = profClean(rec(st.profile));
  // The floors a first-run routine pick set: whole sets 0 to 100, in muscle order.
  const bandsFit = (() => {
    const F = rec(st.bandsFit);
    const o: Partial<Record<MuscleKey, number>> = {};
    if (F && !Array.isArray(F))
      for (const m of MK) {
        const v = F[m];
        if (!TRACK_ONLY.has(m) && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= LIMITS.weeklySets)
          o[m] = v;
      }
    return o;
  })();
  // The muscles the lifter gave a target with Set a target: in muscle order, never one with a target by default.
  const ownTargets = (() => {
    const o = arr(st.ownTargets);
    return o ? MK.filter(m => !TARGETED.has(m) && o.includes(m)) : [];
  })();
  const hf = arr(st.homeFolded),
    fl = arr(st.folds),
    h = arr(st.hidden),
    pr = arr(st.priorities),
    df = arr(sIn.dashFolded);
  const hc = numOr(st.heightCm, NaN),
    tb = numOr(st.timeBudget, NaN),
    bk = numOr(st.barKg, NaN),
    bg = numOr(st.bwGoalPct, NaN);
  // Built-in exercises the user deleted. Without this the library list silently puts every one of them back on the next load.
  const removedLib = (arr(sIn.removedLib) || []).filter(x => typeof x === 'string').map(fixId);
  const inBands = spread(sIn.bands || {});
  const band = (m: MuscleKey): [number, number] => {
    const b = arr(inBands[m]);
    const lo = b ? clampN(b[0], 0, LIMITS.weeklySets, BANDS[m][0]) : BANDS[m][0];
    const hi = b ? clampN(b[1], 0, LIMITS.weeklySets, BANDS[m][1]) : BANDS[m][1];
    return lo > hi ? [hi, lo] : [lo, hi];
  };
  /* Every muscle's band, in muscle order. Built over an empty record of the
     bands' type and filled for every muscle key just after, which is what the
     cast says: MK is MUSCLES' keys, and MUSCLES names every MuscleKey. */
  const bands = {} as Record<MuscleKey, [number, number]>;
  for (const m of MK) bands[m] = band(m);
  // Each optional setting absent unless set (each kept below is one the merged copy has, so it stays where it stands).
  const vals: Settings = {
    unit: st.unit === 'kg' ? 'kg' : 'lb',
    theme: pick(st.theme, ['system', 'dark', 'light'] as const) ?? 'system',
    // Timer and logging preferences. Older saves have none of these, so each falls back to exactly how the app behaved before they existed.
    timerMode: pick(st.timerMode, ['auto', 'manual', 'off'] as const) ?? 'auto',
    timerSound: st.timerSound !== false,
    timerCompact: st.timerCompact === true,
    autoDone: st.autoDone === true,
    // Optional settings stay undefined unless set.
    ...(accent ? { accent } : {}),
    ...(st.rirAsk === true ? { rirAsk: true } : {}),
    // History lists what the app asked of each set; absent unless on.
    ...(st.askedShow === true ? { askedShow: true } : {}),
    // Count RIR 4 to 5 as half a set: absent unless on.
    ...(st.rirHalf === true ? { rirHalf: true } : {}),
    // Adjusting the next sets is on unless turned off; only false is stored, so older saves hash as before.
    ...(st.autoAdj === false ? { autoAdj: false } : {}),
    // The weigh-in reminder in days (0 off); absent is every BW_EVERY_DEFAULT days.
    ...(bwEvery !== undefined ? { bwEvery } : {}),
    // This block vs last's length; absent is BLOCK_WEEKS_DEFAULT, so saves without it hash as before.
    ...(blockWeeks !== undefined ? { blockWeeks } : {}),
    // Today opens on a blank session; absent is the plan's day.
    ...(st.todayStart === 'free' ? { todayStart: 'free' } : {}),
    // Rest weeks, week-start dates; the last two years kept.
    ...(restWeeks.length ? { restWeeks } : {}),
    // Effort in half points or RPE; absent is whole RIR, so older saves hash as before.
    ...(rirScale ? { rirScale } : {}),
    // Suggested loads show grey until typed; 'fill' puts them in the rows. Unset means grey (V's choice).
    ...(st.loadFill === 'fill' ? { loadFill: 'fill' } : {}),
    ...(userName ? { userName } : {}),
    homeFolded: hf ? strings(hf, k => oneOf(k, ['map', 'body', 'week', 'tiles', 'coach', 'injuries'])) : [],
    // Section order per tab (drag the ⠿ in a section header): a new install starts in the default order.
    secOrder,
    folds: fl ? strings(fl, k => safeKey(k) && k.length < LIMITS.foldKey).slice(0, LIMITS.folds) : [],
    wakeLock: st.wakeLock === true,
    // Small change plates: absent unless on, so saves without it hash as before. Nothing sets it now (its
    // toggle went with the plates line); a log that has it keeps it for builds before 2.42, which read it.
    ...(st.smallPlates === true ? { smallPlates: true } : {}),
    // Your gym and the profile: absent unless set, rebuilt in one key order.
    ...(gym ? { gym } : {}),
    ...(profile ? { profile } : {}),
    ...(Object.keys(bandsFit).length ? { bandsFit } : {}),
    ...(ownTargets.length ? { ownTargets } : {}),
    // The scale's unit: absent unless set apart from the app's, so saves without it hash as before.
    ...(st.bwUnit === 'kg' || st.bwUnit === 'lb' ? { bwUnit: st.bwUnit } : {}),
    // RIR: on (as logged), cal (on, shifted by your calibration sets), off.
    rirMode: pick(st.rirMode, ['on', 'off', 'cal'] as const) ?? 'on',
    hidden: h ? [...new Set(strings(h, k => HIDEABLE_KEYS.has(k)))] : [],
    onboarded: st.onboarded === true,
    calSnooze: typeof st.calSnooze === 'string' && isDate(st.calSnooze) ? st.calSnooze : null,
    // Legacy fold flag from older builds; unused, kept so old saves round-trip.
    tidyV: numOr(st.tidyV, 0) >= 1 ? 1 : 0,
    // Height in cm for waist-to-height; the one body measure that does not change.
    heightCm: isNum(hc) && hc >= LIMITS.heightCm[0] && hc <= LIMITS.heightCm[1] ? r1(hc) : null,
    timeBudget: isNum(tb) && tb >= LIMITS.budgetMin[0] ? Math.min(Math.round(tb), LIMITS.budgetMin[1]) : null,
    priorities: pr ? muscles(pr) : [],
    // Absent (older saves) means the defaults apply once; after that the user's folds win.
    dashFolded: df ? strings(df, k => oneOf(k, DSEC_KEYS)) : DSEC_FOLDED.slice(),
    lastExport: typeof st.lastExport === 'string' && isDate(st.lastExport) ? st.lastExport : null,
    removedLib,
    barKg: isNum(bk) && bk > 0 ? Math.min(bk, LIMITS.barKg) : null,
    bwGoalPct: isNum(bg) ? Math.min(Math.max(bg, -LIMITS.bwRatePct), LIMITS.bwRatePct) : null,
    bands
  };
  for (const k of OPTIONAL_SETTINGS) if (!(k in vals)) delete st[k];
  return Object.assign(st, vals);
}
/** The settings absent unless set: each is taken out of the merged copy when it is not (cleanSettings). */
const OPTIONAL_SETTINGS = [
  'accent',
  'rirAsk',
  'askedShow',
  'rirHalf',
  'autoAdj',
  'bwEvery',
  'blockWeeks',
  'todayStart',
  'restWeeks',
  'rirScale',
  'loadFill',
  'userName',
  'smallPlates',
  'gym',
  'profile',
  'bandsFit',
  'ownTargets',
  'bwUnit'
] as const satisfies readonly (keyof Settings)[];

/* An exercise, cleaned: called only on one whose id and name are strings
   (the reader above), so its name is given as read. */
/** One exercise of the log, cleaned field by field. */
function cleanExercise(e0: unknown, e: Rec, name: string): Exercise {
  const sc = arr(e.secondary);
  const g = rec(e.goal);
  const inc = numOr(e.inc, NaN),
    bwf = numOr(e.bwf, NaN),
    ml = numOr(e.maxLoad, NaN),
    bar = numOr(e.barKg, NaN);
  const gw = g ? numOr(g.w, NaN) : NaN,
    gr = g ? Math.round(numOr(g.r, NaN)) : NaN;
  // The main muscle as read (an unknown one as chest), and the helpers without it, so a second read changes nothing.
  const primary = typeof e.primary === 'string' && isMuscle(e.primary) ? e.primary : 'chest';
  return keepExtra(e0, {
    id: fixId(e.id),
    name,
    primary,
    secondary: sc ? strings(sc, m => isMuscle(m) && m !== primary) : [],
    equip: typeof e.equip === 'string' ? e.equip : 'other',
    bw: !!e.bw,
    rare: !!e.rare,
    perSide: !!e.perSide,
    note: typeof e.note === 'string' ? e.note : '',
    custom: !!e.custom,
    archived: !!e.archived,
    // Load step for this exercise everywhere it appears; null falls back to the routine item.
    inc: isNum(inc) && inc > 0 ? Math.min(inc, LIMITS.step) : null,
    plates: pick(e.plates, ['bar', 'side', 'sleeve', 'none'] as const) ?? null,
    // How the load number reads; absent means the exercise's default.
    load: pick(e.load, ['each', 'total', 'side', 'stack'] as const),
    // Timed: the reps column holds seconds. Heaviest available: the top of the
    // stack or rack, past which progression moves to reps. Absent when unset,
    // so records saved before these existed hash exactly as before.
    timed: e.timed === true ? true : undefined,
    // Compound or isolation, when set in the editor; absent reads it from the name.
    kind: e.kind === 'compound' || e.kind === 'iso' ? e.kind : undefined,
    // Assisted: the load number is the machine's help, stored below 0.
    assist: e.assist === true && !!e.bw ? true : undefined,
    bwf: isNum(bwf) && bwf > 0 && bwf <= LIMITS.bwShare ? Math.round(bwf * HUNDREDTHS) / HUNDREDTHS : undefined,
    maxLoad: isNum(ml) && ml > 0 ? Math.min(ml, LOAD_MAX) : undefined,
    // This lift's own bar: a trap or EZ bar instead of the bar in Settings. Absent when unset.
    barKg: isNum(bar) && bar > 0 ? Math.min(bar, LIMITS.barKg) : undefined,
    // A lift goal: a load (added load on a bodyweight lift) for a number of reps. Absent when unset.
    goal:
      g && isNum(gw) && gw >= 0 && gw <= LOAD_MAX && gr >= 1 && gr <= LIMITS.goalReps && !e.timed && !e.assist
        ? { w: gw, r: gr }
        : undefined,
    /* The unit the lift's equipment is marked in, set by a tap on the unit beside its load: kg or lb. Absent when unset,
       so the lift follows the app's unit and a record saved before this existed hashes as before; a build without it
       keeps it among the fields it does not know (keepExtra). */
    unit: e.unit === 'kg' || e.unit === 'lb' ? e.unit : undefined
  });
}

/* A routine, cleaned: called only on one whose days are a list (the reader
   above), numbered ri among those kept. Anything that is not explicitly
   fixed-weekday becomes a cycle, which is how every pre-v3 routine migrates.
   A "weekly" routine with more than 7 days cannot exist through the UI; if
   one arrives, all its days are kept as a cycle rather than any cut off. */
/** One routine of the log, cleaned field by field. */
function cleanRoutine(r0: unknown, ri: number): Routine {
  const r = rec(r0) || {};
  const rid = typeof r.id === 'string' ? fixId(r.id) : did('r', r0, ri);
  const rdays = arr(r.days) || [];
  const schedule = r.schedule === 'weekly' && rdays.length <= WEEK_DAYS ? 'weekly' : 'cycle';
  const src = rdays.slice(0, MAX_DAYS);
  const count = schedule === 'weekly' ? WEEK_DAYS : Math.max(1, src.length);
  const days: Day[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < count; i++) {
    const d0 = src[i];
    const d = rec(d0);
    if (!d) {
      days.push(
        schedule === 'weekly'
          ? { id: rid + '-w' + i, name: i === SUNDAY ? 'Rest' : 'Training day', rest: i === SUNDAY, items: [] }
          : { id: rid + '-p' + i, name: 'Training day', rest: false, items: [] }
      );
      continue;
    }
    const dbase = typeof d.id === 'string' ? fixId(d.id) : rid + '-d' + i;
    const items: PlanItem[] = (arr(d.items) || [])
      .filter(it0 => {
        const it = rec(it0);
        return !!it && typeof it.exId === 'string';
      })
      .map((it0, ii) => {
        const it = rec(it0) || {};
        return keepExtra(
          it0,
          {
            uid: typeof it.uid === 'string' ? fixId(it.uid) : dbase + '-i' + ii,
            exId: fixId(it.exId),
            ...planNums(it),
            ss: typeof it.ss === 'string' && it.ss ? fixId(it.ss) : null,
            ...jumpOf(it),
            // In the day's second workout: true or absent, last, so older items keep their hash.
            ...(it.pm === true && schedule === 'weekly' ? { pm: true as const } : {})
          },
          KNOWN_ITEM
        );
      })
      .map(it => (it.repMax < it.repMin ? { ...it, repMax: it.repMin } : it));
    fixSupersets(items);
    let id = dbase;
    if (seen.has(id)) id = id + '-' + i;
    seen.add(id);
    // The second workout's name, last and absent unless given, so older days keep their hash.
    const pmName = typeof d.pmName === 'string' ? d.pmName.trim().slice(0, LIMITS.name) : '';
    days.push(
      keepExtra(
        d0,
        {
          id,
          name: typeof d.name === 'string' ? d.name : schedule === 'weekly' ? DAYS[i] : `Day ${i + 1}`,
          rest: !!d.rest,
          items,
          ...(pmName && schedule === 'weekly' ? { pmName } : {})
        },
        KNOWN_DAY
      )
    );
  }
  return keepExtra(r0, { id: rid, name: typeof r.name === 'string' ? r.name : 'Routine', schedule, days });
}

/* What the app asked of a set (391): a load within the loads a set may have and whole reps within the reps it may
   have, each null when none was asked; nothing when neither was, when the value is anything else, or on a warm-up, a
   drop set or a RIR check, which are asked nothing. */
/** A set's asked load and reps as kept, or null. */
function askedOf(x: Rec): Asked | null {
  if (x.warm || x.drop || x.cal) return null;
  const a = arr(x.sg);
  if (!a || a.length !== 2) return null;
  const [w0, r0] = a;
  const w = w0 == null ? null : isNum(w0) ? clampN(w0, LOAD_MIN, LOAD_MAX, 0) : undefined;
  const r = r0 == null ? null : isNum(r0) ? Math.round(clampN(r0, 0, LIMITS.reps, 0)) : undefined;
  return w === undefined || r === undefined || (w == null && r == null) ? null : [w, r];
}
/** A set's fields this build reads, so one it drops as unreadable is not kept as a field it does not know. */
const KNOWN_SETF: ReadonlySet<string> = new Set(['sg']);

/** A set row of the workout in progress as normalize reads it, or none when it is not one. */
function cleanDraftSet(x0: unknown): DraftSet[] {
  const x = rec(x0);
  if (!x) return [];
  const sg = askedOf(x);
  return [
    keepExtra(
      x0,
      {
        w: x.w == null ? null : clampN(x.w, LOAD_MIN, LOAD_MAX, 0),
        r: x.r == null || x.r === '' ? null : Math.round(clampN(x.r, 0, LIMITS.reps, 0)),
        rir: x.rir == null || x.rir === '' ? null : clampN(x.rir, 0, EFFORT_TOP, null),
        warm: !!x.warm,
        drop: !!x.drop && !x.warm,
        done: !!x.done,
        cal: x.warm ? undefined : cleanCal(rec(x.cal)) || undefined,
        // The row's own id, last, where a build before it kept the unknown field.
        ...(typeof x.rid === 'string' ? { rid: fixId(x.rid) } : {}),
        // What the app asked of it once ticked (391), after the id.
        ...(sg ? { sg } : {})
      },
      KNOWN_SETF
    )
  ];
}

/** A block of the workout in progress as normalize reads it, or none when it is not one. */
function cleanDraftBlock(b0: unknown): DraftBlock[] {
  const b = rec(b0);
  if (!b || typeof b.exId !== 'string' || !arr(b.sets)) return [];
  const pl = rec(b.plan) || {};
  const plan: DraftBlock['plan'] = {
    ...planNums(pl),
    ss: typeof pl.ss === 'string' && pl.ss ? fixId(pl.ss) : null,
    ...jumpOf(pl)
  };
  if (plan.repMax < plan.repMin) plan.repMax = plan.repMin;
  const adj = rec(b.adj);
  const adjW = adj ? Number(adj.w) : NaN,
    adjFrom = adj ? Number(adj.from) : NaN,
    sw = Number(b.sw);
  const prev = arr(b.prev),
    lastR = arr(b.lastR),
    keepRR = arr(b.keepRR),
    ln = rec(b.lastNote);
  return [
    keepExtra(
      b0,
      {
        ...(typeof b.bid === 'string' && b.bid ? { bid: fixId(b.bid) } : {}),
        exId: fixId(b.exId),
        plan,
        note: typeof b.note === 'string' ? b.note : '',
        inj: typeof b.inj === 'string' && isMuscleOrJoint(b.inj) ? b.inj : null,
        hint: typeof b.hint === 'string' ? b.hint : '',
        ...(typeof b.hintAgain === 'string' && b.hintAgain ? { hintAgain: b.hintAgain } : {}),
        last: typeof b.last === 'string' ? b.last : '',
        // Last time's sets as shown in the Last column: short strings, absent in older drafts.
        prev: prev
          ? strings(prev, () => true)
              .slice(0, LIMITS.sets)
              .map(x => x.slice(0, LIMITS.lastText))
          : undefined,
        prevOff: b.prevOff === true ? true : undefined,
        target: typeof b.target === 'string' ? b.target : '',
        easier: typeof b.easier === 'string' ? b.easier : null,
        tgt: cleanTgt(rec(b.tgt)),
        // Last time's reps per set: shown as placeholders, so numbers only.
        lastR: lastR
          ? lastR.slice(0, LIMITS.sets).map(v => {
              const n = numOr(v, NaN);
              return isNum(n) && n >= 0 ? Math.min(n, LIMITS.reps) : null;
            })
          : [],
        swappedFrom: typeof b.swappedFrom === 'string' ? fixId(b.swappedFrom) : null,
        cut: b.cut === true ? true : undefined,
        // Added on a lighter day or in a deload, the sets before they were halved, for Finish's offer to the routine; absent otherwise.
        full:
          typeof b.full === 'number' && Number.isInteger(b.full) && b.full >= 1 && b.full <= LIMITS.sets
            ? b.full
            : undefined,
        light: b.light === true ? true : undefined,
        // The date the target came from, when "Last" is a newer session short of its usual, lighter, or a deload.
        basis: typeof b.basis === 'string' && isDate(b.basis) ? b.basis : undefined,
        // The suggested load the rows started from; absent in older drafts.
        sw: b.sw === null ? null : b.sw === undefined || !isNum(sw) ? undefined : clampN(b.sw, LOAD_MIN, LOAD_MAX, 0),
        // The next sets adjusted from a set, and Keep for the rest of the session.
        adj:
          adj && typeof adj.at === 'number' && Number.isInteger(adj.at) && adj.at >= 0 && isNum(adjW) && isNum(adjFrom)
            ? {
                at: adj.at,
                w: clampN(adj.w, 0, LOAD_MAX, 0),
                from: clampN(adj.from, 0, LOAD_MAX, 0),
                r: Math.round(clampN(adj.r, 1, LIMITS.reps, 1)),
                up: adj.up === true,
                why: typeof adj.why === 'string' ? adj.why.slice(0, LIMITS.why) : '',
                // The row it came from, last, where a build before it kept no such field.
                ...(typeof adj.rid === 'string' ? { rid: fixId(adj.rid) } : {})
              }
            : undefined,
        adjOff: b.adjOff === true ? true : undefined,
        // Editing a saved session keeps the rep range it was logged under.
        keepRR:
          b.keepRR === undefined
            ? undefined
            : keepRR && keepRR.length === 2
              ? pair(Math.round(Number(keepRR[0])) || 1, Math.round(Number(keepRR[1])) || 1)
              : null,
        lastNote:
          ln && typeof ln.text === 'string' && typeof ln.date === 'string' && isDate(ln.date)
            ? { date: ln.date, text: ln.text }
            : null,
        sets: (arr(b.sets) || []).flatMap(cleanDraftSet),
        // Done at a new machine or gym, last, where the menu adds it; absent unless marked.
        ...(b.nw === true ? { nw: true as const } : {}),
        // The pictures on its note, by id, last; absent unless there are any.
        ...picsField(b.pics)
      } satisfies DraftBlock,
      KNOWN_BLOCK
    )
  ];
}

/** A Limited equipment session's equipment: the library's kinds it names, in the library's order, or absent. */
function equipList(v: unknown): string[] | undefined {
  const a = arr(v);
  if (!a) return undefined;
  const out = EQUIP.map(([k]) => k).filter(k => a.includes(k));
  return out.length ? out : undefined;
}
/** The draft fields this build writes only when valid (its pictures, its equipment): an invalid one is dropped, not kept as unknown. */
const DRAFT_KNOWN: ReadonlySet<string> = new Set(['pics', 'equip', 'begunAt', 'follows']);

/* The workout in progress, cleaned: called only on one whose exercises are a
   list and whose date is a date (normalize), rebuilt field by field in place,
   as every build since r56 has rebuilt it. The logger reads plan, lastR and
   every set field directly, and a check that only confirmed that ex was a
   list let an imported backup carrying a half-written draft throw on first
   paint with no way back. The fields are written in the order the in-place rebuild
   wrote them, so a field the draft lacks is added where it always was, and
   one it has (a field a newer build saved among them) stays where it
   stands: the draft keeps the key order and the very object it came as. */
/** A workout in progress, cleaned field by field (above). */
function cleanDraft(d: Rec, date: string): DraftLike {
  const startedAt = Number(d.startedAt),
    begunAt = Number(d.begunAt),
    durMin = Number(d.durMin);
  // The workout's pictures: kept when valid, else the field goes, so a draft without any keeps its shape.
  const pics = picIds(d.pics);
  const equip = equipList(d.equip);
  /* The fields this build knows, worked out first; then the draft is cleaned in place (its own fields keep
     their order and the object stays the one given), but a field it does not know is kept only within a
     record's limits (kept at any size, a damaged backup's could fill the draft past what a sync document holds). An invalid pictures field goes, not kept as unknown. */
  const out = {
    date,
    id: typeof d.id === 'string' ? fixId(d.id) : did('x', { date: d.date, dayName: d.dayName }, 0),
    dayIdx: clampN(d.dayIdx, 0, MAX_DAYS - 1, 0),
    dayId: typeof d.dayId === 'string' ? fixId(d.dayId) : null,
    startedAt: isTime(startedAt) ? startedAt : null,
    // When the lifting began, once it has; absent before, so a workout's record is unchanged until then.
    ...(isTime(begunAt) ? { begunAt } : {}),
    // The workout closed on this phone just before this one was started here; absent otherwise.
    ...(typeof d.follows === 'string' && d.follows ? { follows: fixId(d.follows) } : {}),
    durMin: Number.isFinite(durMin) && durMin >= 1 ? Math.round(durMin) : null,
    dayName: typeof d.dayName === 'string' ? d.dayName : 'Session',
    routineId: typeof d.routineId === 'string' && d.routineId ? fixId(d.routineId) : '',
    notes: typeof d.notes === 'string' ? d.notes : '',
    editingId: typeof d.editingId === 'string' ? fixId(d.editingId) : null,
    deload: !!d.deload,
    light: !!d.light,
    limited: d.limited === true ? true : undefined,
    // The equipment a Limited equipment session keeps to, as the library names it; absent when there is none.
    ...(equip ? { equip } : {}),
    ...(pics ? { pics } : {}),
    free: d.free === true ? true : undefined,
    // Started as its day's second workout.
    part: d.part === 2 ? (2 as const) : undefined,
    // Finish's two questions once answered (sets left, ramp-ups), kept as they came: builds up to 2.27 passed them
    // through with every field of the draft and write them still, so every build keeps them alike (tests/storage-sync.js, S-12).
    _leftAsked: typeof d._leftAsked === 'boolean' ? d._leftAsked : undefined,
    _rampAsked: typeof d._rampAsked === 'boolean' ? d._rampAsked : undefined,
    // A past workout typed in after the fact: no rest timer, no clock, no check-in.
    past: d.past === true ? true : undefined,
    // The notes the app wrote when the session started, so Discard can tell them from yours.
    note0: typeof d.note0 === 'string' ? d.note0.slice(0, LIMITS.startNote) : undefined,
    chk: cleanChk(rec(d.chk)) || undefined,
    cardio: (arr(d.cardio) || []).filter(c => !!c && typeof c === 'object').map((c, ci) => cleanDraftCardio(c, ci)),
    ex: (arr(d.ex) || []).flatMap(cleanDraftBlock)
  };
  // The unknown fields kept: copied into the known ones, then every field of the draft not among them taken off it.
  extraInto(d, out, DRAFT_KNOWN);
  for (const k of Object.keys(d)) if (!(k in out)) Reflect.deleteProperty(d, k);
  return Object.assign(d, out);
}

/** The lifter's exercises and the library's beside them, cleaned, renamed and migrated as normalize reads a save. */
function cleanExercises(listed: unknown[], s: Rec, removedLib: readonly string[]): Exercise[] {
  const exercises: Exercise[] = listed.flatMap(e0 => {
    const e = rec(e0);
    return e && typeof e.id === 'string' && typeof e.name === 'string' ? [cleanExercise(e0, e, e.name)] : [];
  });
  const have = new Set(exercises.map(e => e.id));
  const gone = new Set(removedLib);
  const lib = libExercises();
  /* Through the same cleaning as every other record: appended as the library gives
     them, without inc and plates, the next load added both as null, so normalize twice differed from once and the
     record's sync hash changed on every phone when the library gained a lift. */
  for (const e of lib) {
    const r = rec(e);
    if (r && !have.has(e.id) && !gone.has(e.id)) exercises.push(cleanExercise(e, r, e.name));
  }
  // A built-in the library has renamed reads by its name now where the log holds one the library gave it before; a name the lifter gave it stays.
  const libName = new Map(lib.map(e => [e.id, e.name]));
  // The same for a note the library has reworded: the old text word for word reads as the library's now; an edited note stays.
  const libNote = new Map(lib.map(e => [e.id, e.note]));
  for (const e of exercises) {
    const now = libName.get(e.id);
    if (now && !e.custom && (LIB_NAMES_BEFORE[e.id] || []).includes(e.name)) e.name = now;
    const note = libNote.get(e.id);
    if (note !== undefined && !e.custom && (LIB_NOTES_BEFORE[e.id] || []).includes(e.note)) e.note = note;
  }
  // v1 saves predate the per-side flag, so the built-ins in them all carry
  // perSide:false. Backfill it from the library by id, and only that one
  // field, so any other edit the user made to a built-in survives.
  if (numOr(s.version, 1) < V_PER_SIDE) {
    const libMap = new Map(lib.map(e => [e.id, e]));
    for (const e of exercises) {
      const L = !e.custom && libMap.get(e.id);
      if (L) e.perSide = L.perSide;
    }
  }
  /* v5: add serratus and rotator cuff where the library now lists them as
     secondary. Only those two keys are added, so any other edit survives. A
     built-in whose primary is one of them and reads Chest here was reset by
     an older build that did not know the muscle (its fallback is Chest), so
     it goes back to the library's primary. */
  if (numOr(s.version, 1) < V_NEW_MUSCLES) {
    const libMap = new Map(lib.map(e => [e.id, e]));
    for (const e of exercises) {
      const L = !e.custom && libMap.get(e.id);
      if (!L) continue;
      let sec = e.secondary;
      if (NEW_V5.has(L.primary) && e.primary === 'chest') {
        e.primary = L.primary;
        sec = sec.filter(m => m !== L.primary);
        e.secondary = sec;
        for (const m of L.secondary) if (!sec.includes(m)) sec.push(m);
      }
      for (const m of NEW_MUSCLES_V5) if (L.secondary.includes(m) && e.primary !== m && !sec.includes(m)) sec.push(m);
    }
  }
  return exercises;
}

/* Entries past Recently deleted's days are hidden by this phone's date where they are shown and dropped when
   something is deleted (act.ts trashShown and toTrash), not here: normalize reads every log the same way on every
   phone (it runs in the sync's comparison too), and by the phone's own date one in Los Angeles kept a deletion that
   one in Tokyo, a day ahead at that instant, dropped. */
/** Recently deleted as a save holds it: each entry checked, the oldest past the limits dropped. */
function cleanTrash(listed: unknown[]): Trashed[] {
  const trash: Trashed[] = listed
    .flatMap(t0 => {
      const t = rec(t0);
      const data = t ? rec(t.data) : null;
      const kind = t ? trashKind(t.kind) : null;
      return t && typeof t.id === 'string' && kind && typeof t.date === 'string' && isDate(t.date) && data
        ? [{ id: fixId(t.id), kind, date: t.date, data, ...(t.clash === true ? { clash: true as const } : {}) }]
        : [];
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, TRASH_MAX);
  while (trash.length > 1 && JSON.stringify(trash).length > TRASH_BYTES) trash.pop();
  return trash;
}

/** The sessions and cardio a save holds, less the deleted ones, and Recently deleted less the ones edited since (below). */
function reviveEdited(
  sessions: Session[],
  listedCardio: unknown[],
  trash: Trashed[]
): { sessions: Session[]; cardio: CardioEntry[]; trash: Trashed[] } {
  /* A trashed id is a tombstone, but only for the copy that was deleted. If
     the same session was edited afterwards (on another device, or in an edit
     that was open while it was deleted), the edit is newer than the delete:
     keep it and retire the tombstone, because keeping data is the mistake
     that can be undone. Sessions are compared in their cleaned form, so
     field order and defaults added by newer builds do not count as edits. */
  const tS = new Map<string, Trashed>(),
    tC = new Map<string, Trashed>();
  for (const t of trash) {
    if (t.kind === 'session') tS.set(t.id, t);
    else if (t.kind === 'cardio') tC.set(t.id, t);
  }
  const revived = new Set<string>();
  const same = (cur: unknown, data: Rec, clean: (x: unknown, i: number) => unknown, ok: (x: unknown) => boolean) => {
    try {
      return !ok(data) || canon(clean(data, 0)) === canon(cur);
    } catch (e) {
      // A copy that cannot be cleaned is read as the same record, so the deletion stands.
      return true;
    }
  };
  const kept = sessions.filter(ss => {
    const t = tS.get(ss.id);
    if (!t) return true;
    if (
      same(
        { ...ss, id: ss.id },
        { ...t.data, id: ss.id },
        (x, i) => cleanSess(x, i),
        x => okSess(rec(x))
      )
    )
      return false;
    revived.add(t.id);
    return true;
  });
  const cardio = listedCardio
    .filter(c0 => {
      const c = rec(c0);
      return !!c && isDate(c.date) && isNum(numOr(c.min, NaN)) && numOr(c.min, 0) > 0;
    })
    .map((c, ci) => cleanCardio(c, ci))
    .filter(c => {
      const t = tC.get(c.id);
      if (!t) return true;
      if (
        same(
          c,
          { ...t.data, id: c.id },
          (x, i) => cleanCardio(x, i),
          x => !!x && typeof x === 'object'
        )
      )
        return false;
      revived.add(t.id);
      return true;
    });
  return {
    sessions: kept,
    cardio,
    trash: revived.size ? trash.filter(t => t.kind === 'routine' || !revived.has(t.id)) : trash
  };
}

/* One id, two different copies: a session moved to a date in another
   half-month on one device while it was edited on another. Both kept, they
   would be counted twice. Keep the copy with more logged sets (then the
   later date) and put the other in Recently deleted under its own id, so
   nothing is lost. Every device resolves it the same way. */
function dedupe<T extends { id: string; date: string }>(
  list0: T[],
  kind: 'session' | 'cardio',
  size: (x: T) => number,
  trash: Trashed[]
): T[] {
  const byId = new Map<string, T>(),
    extra: T[] = [];
  for (const x of list0) {
    const o = byId.get(x.id);
    if (!o) {
      byId.set(x.id, x);
      continue;
    }
    if (canon(o) === canon(x)) continue;
    const keepNew =
      size(x) > size(o) || (size(x) === size(o) && (x.date > o.date || (x.date === o.date && canon(x) > canon(o))));
    byId.set(x.id, keepNew ? x : o);
    extra.push(keepNew ? o : x);
  }
  if (!extra.length) return list0;
  for (const x of extra) {
    const id = fixId(x.id + '-dup' + hashStr(canon(x)).slice(0, DUP_HASH));
    /* Dated by the copy's own date, not the phone's: every phone puts the same entry in Recently deleted, so one log
       reads the same on each and the two copies never clash (by its own date, a phone in Los Angeles and one in
       Tokyo would date it a day apart). Marked as a copy put aside (`clash`), which Recently deleted keeps until the
       lifter restores or deletes it: by its own date alone, a session from weeks back would be hidden at once and
       dropped by the next deletion, its edit with it. Put where Recently deleted's order puts it, newest first, after
       the entries of its date, and the list held to its limits, so reading the log again gives the same list
       (cleanTrash). */
    if (trash.some(t => t.id === id)) continue;
    const at = trash.findIndex(t => t.date < x.date);
    trash.splice(at < 0 ? trash.length : at, 0, { id, kind, date: x.date, data: { ...rec(x), id }, clash: true });
  }
  trash.splice(TRASH_MAX);
  while (trash.length > 1 && JSON.stringify(trash).length > TRASH_BYTES) trash.pop();
  return [...byId.values()];
}

/** The weigh-ins a save holds, each checked. */
function cleanBodyweights(listed: unknown[]): Bodyweight[] {
  // Numbered among those kept, as one with no id is named by its place (did); each has a date (the filter), the '' never reached.
  return listed
    .filter(b0 => {
      const b = rec(b0);
      return !!b && isDate(b.date) && isNum(numOr(b.kg, NaN)) && numOr(b.kg, 0) > 0;
    })
    .map((b0, bi) => {
      const b = rec(b0) || {};
      return keepExtra(b0, {
        id: typeof b.id === 'string' ? fixId(b.id) : did('b', b0, bi),
        date: typeof b.date === 'string' ? b.date : '',
        kg: Math.min(numOr(b.kg, 0), BW_MAX_KG),
        demo: !!b.demo
      });
    });
}

/** The body measurements a save holds, each checked. */
function cleanMeasurements(listed: unknown[]): Measurement[] {
  // As the weigh-ins: numbered among those kept, each with a date.
  return listed
    .filter(m0 => {
      const m = rec(m0);
      return !!m && isDate(m.date);
    })
    .map((m0, mi) => {
      const m = rec(m0) || {};
      const o: Measurement = {
        id: typeof m.id === 'string' ? fixId(m.id) : did('m', m0, mi),
        date: typeof m.date === 'string' ? m.date : '',
        demo: !!m.demo
      };
      for (const [k] of MEAS) {
        const v = numOr(m[k], NaN);
        // A site MEAS lists, written as an assignment writes it, in MEAS order.
        if (isNum(v) && v > 0) Object.assign(o, { [k]: Math.min(v, MEAS_MAX_CM) });
      }
      return keepExtra(m0, o, KNOWN_MEAS);
    });
}

/** The injuries a save holds, each checked. */
function cleanInjuries(listed: unknown[]): Injury[] {
  // As the weigh-ins: numbered among those kept, each a muscle or a joint (the filter), the '' never reached.
  return listed
    .filter(x0 => {
      const x = rec(x0);
      return !!x && isMuscleOrJoint(x.m);
    })
    .map((x0, xi) => {
      const x = rec(x0) || {};
      return keepExtra(x0, {
        id: typeof x.id === 'string' ? fixId(x.id) : did('j', x0, xi),
        m: typeof x.m === 'string' ? x.m : '',
        note: typeof x.note === 'string' ? x.note : '',
        date: typeof x.date === 'string' && isDate(x.date) ? x.date : today()
      });
    });
}

/** The fields of a save this build does not know, within the limits a record's unknown fields have. */
function unknownFields(s: Rec, f: Fresh): Rec {
  /* The fields this build does not know, kept as they came and after its own,
     as a spread of the save over the fresh log puts them. Former bests
     belonged to the Comeback tracker, which V had removed, with any that were
     saved. Older saves, backups and cloud copies
     still carry them, so they are dropped here on every load, import and
     merge. */
  const rest: Rec = { ...s };
  for (const k of Object.keys(f)) delete rest[k];
  delete rest.priors;
  // Kept within the limits a record's unknown fields have.
  const extra: Rec = {};
  extraInto(rest, extra);
  return extra;
}

/* Every field below is validated rather than trusted. Checking only that five
   keys are arrays let a backup containing sessions:[{}] import cleanly and
   then throw inside IDX() on the first render, leaving the app unusable with
   no obvious way back. normalize() runs on both load
   and import, so this also protects against a half-written localStorage
   record. Anything unusable is dropped; the count is reported to the caller
   via normalize.dropped. Each record is built against its type, so the
   compiler checks every field a reader relies on, rather than one cast to the
   State at the end. */
/** A save read as every build reads it (above); `normalize.dropped` counts the damaged records the last call left out. */
export function normalize(input: unknown): State {
  const f = freshState();
  normalize.dropped = 0;
  // A new device and Erase everything both start here, fully normalized:
  // the raw fresh state lacks fields (section order, folds) every view reads.
  const s: Rec = rec(input) || f;
  // drop() is one record; drop(n) is n, and drop(0) is none, not 1.
  const drop = (n?: number): void => {
    normalize.dropped += n == null ? 1 : Math.max(0, n);
  };
  // The save as it came over the fresh log: each field read from here, and those this build does not know kept as they came.
  const raw: Rec = { ...f, ...s };
  const settings = cleanSettings(s, f);
  // Each list as it came, or none.
  const list = (k: string): unknown[] => arr(raw[k]) || [];

  const removedLib = settings.removedLib;
  // The library's own records go in beside the lifter's (cleanExercises).
  const exercises = cleanExercises(list('exercises'), s, removedLib);

  // Numbered among the routines kept, as each one with no id of its own is named by its place (did).
  const kept: Routine[] = list('routines')
    .filter(r0 => {
      const r = rec(r0);
      return !!r && Array.isArray(r.days);
    })
    .map((r0, ri) => cleanRoutine(r0, ri));
  /* A save with no routine left gets the one a new install starts with, read
     as any routine is (added as made, its items would lack the superset
     field the next load gives them). */
  const routines: Routine[] = kept.length ? kept : [cleanRoutine(starterRoutine(), 0)];

  let trash = cleanTrash(list('trash'));
  const before = list('sessions').length;
  let sessions: Session[] = list('sessions')
    .filter(x => okSess(rec(x)))
    .map((x, i) => cleanSess(x, i))
    .filter(ss => ss.ex.length);
  drop(before - sessions.length);
  let cardio: CardioEntry[];
  ({ sessions, cardio, trash } = reviveEdited(sessions, list('cardio'), trash));
  sessions = dedupe(sessions, 'session', x => x.ex.reduce((a, b) => a + b.sets.length, 0), trash);
  cardio = dedupe(cardio, 'cardio', x => x.min, trash);

  const bBefore = list('bodyweights').length;
  const bodyweights = cleanBodyweights(list('bodyweights'));
  drop(bBefore - bodyweights.length);

  const mBefore = list('measurements').length;
  const measurements = cleanMeasurements(list('measurements'));
  drop(mBefore - measurements.length);

  /* The draft is rendered by the logger, which reads plan, lastR and every set
     field directly. A check that only confirmed ex was an array let an imported
     backup carrying a half-written draft throw on first paint with no way
     back, so it is rebuilt field by field (cleanDraft); anything else is no
     workout in progress (a false, a 0 or an empty string, which no build
     writes, too). */
  const d = rec(raw.draft);
  const draft = d && Array.isArray(d.ex) && typeof d.date === 'string' && isDate(d.date) ? cleanDraft(d, d.date) : null;
  const dw = raw.deloadWeek;
  const injuries = cleanInjuries(arr(raw.injuries) || []);
  const ar = raw.activeRoutineId;
  const want = typeof ar === 'string' ? fixId(ar) : null;
  const activeRoutineId = want != null && routines.some(r => r.id === want) ? want : routines[0].id;
  const extra = unknownFields(s, f);
  return {
    version: STATE_VERSION,
    settings,
    exercises,
    routines,
    activeRoutineId,
    sessions,
    bodyweights,
    measurements,
    draft,
    deloadWeek: typeof dw === 'string' && isDate(dw) ? dw : null,
    injuries,
    cardio,
    trash,
    ...extra
  };
}
normalize.dropped = 0;
