/* ---------- importing workouts (r23, PENDING 65 and V's 2026-09-28 ask) ----------
   Moved from the legacy script's 26-import.js and 27-actions.js in r63.
   Any log a person already keeps comes in the same way: text pasted from
   Notes (or copied from a photo of a handwritten log with the iPhone's Live
   Text), a spreadsheet (a CSV or .xlsx file, or cells copied and pasted),
   and the CSV exports of Strong and Hevy. An Ironlog backup still restores
   the whole log (importData). Nothing is saved until the preview is
   confirmed: it shows what was understood, the unit, which library exercise
   each name was matched to (changeable, or a new custom exercise), lines that
   were not understood, and sessions already in the log, which are skipped so
   importing the same file twice adds nothing. Imported sessions are
   freestyle sessions, so they never move a routine's "next up". Undo
   reverses the whole import. Numbers stay in the file's unit until the
   preview. The readers (rows, dates, names, sets, notes) are importing.ts's;
   the preview's sheet is sheetsimport.ts's. */

import { APP_NAME, STORAGE_ID } from './config';
import { addDays, andList, daysBetween, isDate, median, today, uid, WEEK_DAYS } from './util';
import { KM_MI, LB } from './units';
import { ML } from './library';
import { dropStarter, routineSig } from './routines';
import { offTarget } from './formulas';
import { fmtDate } from './format';
import {
  GENERIC_WORKOUT,
  IMPORT_DAYS,
  IMPORT_REPEATS,
  IMP_ALIAS,
  impFromTable,
  impFromText,
  impGuess,
  impHeader,
  impNorm,
  impRows,
  impTextSets,
  impXlsx
} from './importing';
import type { ImpRead } from './importing';
import { cleanCardio, normalize, starterSigs } from './normalize';
import { ENV, log, prefGet, unreadableForget, unreadableRaw } from './storage';
import { arr, parseJson, rec } from './records';
import { assemble, cloudStop } from './sync';
import { isChunkId, realCount } from './chunks';
import type { Rec } from './records';
import { EX, IDX, U, activeRoutine, actualAvg4, fmtW, invalidate } from './live';
import { acct, cloud, setState, state, ui } from './store';
import type { ImpPreviewModal, ImpTable } from './modals';
import type { CardioEntry, Exercise } from './types';
import type { State } from './store';
import { AUTH } from './providers';
import { act } from './act';
import { newItem } from './display';
import { closeModal, confirmBox, openModal, render, renderModal } from './page';
import { toast } from './toast';
import { fitTargets } from './targets';
import type { Tap } from './workstate';

declare global {
  interface Window {
    /** The preview only: the live app's documents of this account, read-only (scripts/cloud-supabase.js). */
    ironlogLiveDocs?: (() => Promise<{ id: string; data: unknown }[]>) | undefined;
  }
}

/** A name's match to the library: the share of words in common it needs to be picked, and what a word of equipment or of a variant that differs costs (r30). */
const MATCH = { pickAt: 0.6, eqOff: 0.5, modOff: 0.7, shown: 8 } as const;
/** The characters of a new exercise's name and of an imported session's name. */
const NAME_CHARS = 60;
/** Loads and reps that read as misread (r30, from the review): a weighted lift under 5 lb (2.3 kg), or a set past 30 reps. */
const ODD = { kg: 2.3, reps: 30 } as const;
/** The seconds in a minute. */
const MINUTE_S = 60;
/** How long the import's toasts stay, in milliseconds: a routine made from the import, the routine picker opened after it, and a preview log that could not be found; and the days of a made routine its toast names. */
const SAID = { made: 9000, pick: 8000, notFound: 6000, days: 4 } as const;

/* Equipment words a name may carry, and the equipment each means. */
const EQW: Readonly<Record<string, string>> = {
  db: 'dumbbell',
  bb: 'barbell',
  cable: 'cable',
  machine: 'machine',
  smith: 'smith'
};
/* Words that make a different exercise: one side having it and the other not costs a lot. */
const MOD = [
  'incline',
  'decline',
  'reverse',
  'seated',
  'standing',
  'lying',
  'single',
  'one',
  'close',
  'wide',
  'front',
  'rear',
  'hammer',
  'preacher',
  'sumo',
  'rdl',
  'hack',
  'split',
  'bulgarian',
  'goblet',
  'overhead',
  'assisted',
  'weighted',
  'deficit',
  'pause',
  'spider',
  'concentration',
  'upright',
  'face'
] as const;
/** The library's exercises a name may be, best first, with how well each matches (1 for an alias). */
export function impMatch(name: unknown): { id: string; sc: number }[] {
  const a = new Set(impNorm(name));
  if (!a.size) return [];
  const out: { id: string; sc: number }[] = [];
  // An alias by the name alone, or by the name without its equipment word when the equipment agrees ("Deadlift (Barbell)").
  let al: string | null = IMP_ALIAS[[...a].join(' ')] || null;
  if (!al) {
    const eq = [...a].filter(w => EQW[w]);
    const bare = [...a].filter(w => !EQW[w]).join(' ');
    const c = IMP_ALIAS[bare];
    const e0 = eq[0];
    if (c && eq.length === 1 && e0 && state.exercises.some(e => e.id === c && e.equip === EQW[e0])) al = c;
  }
  if (!(al && state.exercises.some(e => e.id === al && !e.archived))) al = null;
  else out.push({ id: al, sc: 1 });
  for (const e of state.exercises) {
    if (e.archived) continue;
    const b = new Set(impNorm(e.name));
    if (!b.size) continue;
    let hit = 0;
    for (const w of a) if (b.has(w)) hit++;
    if (!hit) continue;
    const union = new Set([...a, ...b]).size;
    let sc = hit / union;
    // Equipment named on one side and a different one on the other is a different exercise.
    const eq = ['db', 'bb', 'cable', 'machine', 'smith'];
    const ea = eq.filter(w => a.has(w)),
      eb = eq.filter(w => b.has(w));
    if (ea.length && eb.length && !ea.some(w => eb.includes(w))) sc *= MATCH.eqOff;
    for (const w of MOD) if (a.has(w) !== b.has(w)) sc *= MATCH.modOff;
    if (e.id !== al) out.push({ id: e.id, sc });
  }
  return out.sort((x, y) => y.sc - x.sc).slice(0, MATCH.shown);
}

/** The import sheet's first step, with what went wrong. */
const inputStep = (err: string): void => openModal({ kind: 'imp', step: 'input', text: '', err });

/** Reads a file or pasted text and opens the preview (a backup restores the log instead). */
export async function impStart(input: { file?: File | undefined; text?: string | undefined } | null): Promise<void> {
  try {
    let rows: string[][] | null = null,
      text: string | null = null;
    if (input && input.file) {
      const f = input.file;
      const nm = (f.name || '').toLowerCase();
      if (/\.json$/.test(nm) || f.type === 'application/json') {
        importData(await f.text());
        return;
      }
      if (/\.xlsx$/.test(nm)) {
        try {
          rows = await impXlsx(await f.arrayBuffer());
        } catch (e) {
          // Said on the sheet: a phone that cannot open .xlsx, or a sheet that cannot be read.
          inputStep(
            e instanceof Error && e.message === 'old'
              ? 'This phone cannot open .xlsx files. Save the sheet as CSV and try again.'
              : 'That spreadsheet could not be read. Save it as CSV and try again.'
          );
          return;
        }
      } else if (/\.(xls|numbers|pdf|docx?)$/.test(nm)) {
        inputStep('Save it as CSV (or copy the cells and paste them here) and try again.');
        return;
      } else text = await f.text();
    } else text = String((input && input.text) || '');
    if (text != null) {
      const t = text.trim();
      if (!t) {
        inputStep('Paste your log or choose a file.');
        return;
      }
      if (/^\s*\{/.test(t) && /"sessions"/.test(t)) {
        importData(t);
        return;
      }
      rows = impRows(t);
      // A table only when its first row names real columns, or cells were pasted (tabs); notes with commas stay notes.
      const head = rows && rows[0];
      if (
        head &&
        Object.keys(impHeader(head)).filter(k => ['date', 'ex', 'r', 'w'].includes(k)).length < 2 &&
        !/\t/.test(t.split(/\r?\n/)[0] || '')
      )
        rows = null;
      if (!rows) {
        openPreview(impFromText(t), null);
        return;
      }
    }
    if (!rows || !rows[0]) {
      inputStep('That could not be read.');
      return;
    }
    const map = impHeader(rows[0]);
    // Without a weight column every load would read 0, so that also asks which column is which.
    openPreview(
      map['ex'] != null && (map['r'] != null || map['secs'] != null) && map['w'] != null && map['date'] != null
        ? impFromTable(rows, map)
        : { sessions: [], needMap: true },
      { rows, map }
    );
  } catch (e) {
    log('import', e);
    inputStep('That could not be read.');
  }
}

/** The machine-help versions of the lifts a minus weight is written on. */
const ASSISTED: Readonly<Record<string, string>> = {
  pullup: 'assistPullup',
  chinup: 'assistPullup',
  dips: 'assistDip',
  triDips: 'assistDip'
};
/** Opens the preview of what was read: each name matched to the library (a new exercise when nothing matches well), the unit, and today for sessions with no date. */
function openPreview(res: ImpRead, tab: ImpTable | null): void {
  const names = [...new Set(res.sessions.flatMap(x => x.items.map(i => i.name)))];
  /* Built from pairs: a name from a lifter's file becomes an own key whatever
     it is ("__proto__" or "constructor" included), as the records with no
     prototype the legacy script made for them kept it. */
  const pickE: [string, string][] = [],
    guessE: [string, ImpPreviewModal['guess'][string]][] = [];
  for (const n of names) {
    const c = impMatch(n);
    const c0 = c[0];
    let id = c0 && c0.sc >= MATCH.pickAt ? c0.id : 'new';
    // Help written as a minus weight means the assisted machine.
    const neg = res.sessions.some(x => x.items.some(i => i.name === n && i.sets && i.sets.some(q => q.w < 0)));
    if (neg && id !== 'new' && !EX(id).assist) {
      const as = ASSISTED[id];
      id = as && state.exercises.some(e => e.id === as) ? as : 'new';
    }
    pickE.push([n, id]);
    const g = impGuess(n);
    guessE.push([n, neg && id === 'new' ? { ...g, assist: true, equip: 'machine' } : g]);
  }
  const pick = Object.fromEntries(pickE),
    guess = Object.fromEntries(guessE);
  openModal({
    kind: 'imp',
    step: 'preview',
    res,
    tab,
    pick,
    guess,
    unit: res.unit || U(),
    unitKnown: !!res.unit,
    date: today(),
    showAll: false
  });
}

/** A new exercise an import makes, as the legacy script made it: normalize completes it (one side at a time, false) when the log takes it in. */
type NewExercise = Omit<Exercise, 'perSide'> & { perSide?: boolean };
/** One set as it would be saved: load in kilograms, reps, effort, and whether it was a warm-up or a drop set. */
interface BuiltSet {
  w: number;
  r: number;
  rir: number | null | undefined;
  warm: boolean;
  drop: boolean;
}
/** A session as an import would save it (normalize completes it). */
interface BuiltSession {
  id: string;
  date: string;
  dayIdx: number;
  dayId: string | null;
  dayName: string;
  routineId: string;
  free: true;
  ex: { exId: string; note: string; rr: null; sets: BuiltSet[] }[];
  notes: string;
  durMin: number | null;
  deload: boolean;
  light: false;
}
/** What the preview would save: the sessions not in the log yet, each session's supersets from the file, the cardio, and what was left out and why. */
interface ImpBuilt {
  sessions: BuiltSession[];
  ssOf: Record<string, Record<string, string>>;
  cardio: CardioEntry[];
  cardioNoTime: number;
  dup: number;
  bad: string[];
  odd: string[];
  timedOff: number;
  newEx: NewExercise[];
}
/** Sessions as they would be saved, and which are already in the log. */
export function impBuild(m: ImpPreviewModal): ImpBuilt {
  const conv = m.unit === 'kg' ? (v: number) => v : (v: number) => v * LB;
  const out: BuiltSession[] = [];
  /* Each session's supersets from the file (Hevy's superset_id), by lift, for
     the routine an import makes; sessions keep none (r55.1). */
  const ssOf: Record<string, Record<string, string>> = {};
  const bad: string[] = [];
  const odd: string[] = [];
  let timedOff = 0;
  const allTimed = (n: string) =>
    m.res.sessions.every(x =>
      x.items.every(i => i.name !== n || (i.sets && i.sets.length && i.sets.every(q => q.timed)))
    );
  const newExE: [string, NewExercise][] = [];
  for (const n in m.pick)
    if (m.pick[n] === 'new') {
      const g = m.guess[n] || impGuess(n);
      const e: NewExercise = {
        id: 'c_' + uid(),
        name: n.slice(0, NAME_CHARS),
        primary: g.primary,
        secondary: [],
        equip: g.equip,
        bw: g.equip === 'bodyweight' || !!g.assist,
        rare: false,
        note: '',
        custom: true,
        archived: false
      };
      if (g.assist) e.assist = true;
      if (!m.res.text && allTimed(n)) e.timed = true;
      newExE.push([n, e]);
    }
  // From pairs, as the picks are (openPreview): a name from the file is an own key whatever it is.
  const newEx = Object.fromEntries(newExE);
  for (const x of m.res.sessions) {
    const date = x.date || m.date;
    const ex: BuiltSession['ex'] = [];
    const sid = uid(),
      grp: Record<string, string> = {};
    for (const it of x.items) {
      const exo: ReturnType<typeof EX> =
        m.pick[it.name] === 'new' ? newEx[it.name] || EX('') : EX(m.pick[it.name] || '');
      const fileSets = it.sets || [];
      // A set timed in seconds on a lift that counts reps would turn seconds into reps: left out and counted.
      if (!it.setsText && !exo.timed && fileSets.some(q => q.timed)) timedOff += fileSets.filter(q => q.timed).length;
      const sets: BuiltSet[] | null = it.setsText
        ? impTextSets(it, exo, conv)
        : fileSets
            .filter(q => exo.timed || !q.timed)
            .map(s => ({
              w: s.u ? (s.u === 'kg' ? s.w : s.w * LB) : conv(s.w),
              r: s.r,
              rir: s.rir,
              warm: s.warm,
              drop: s.drop && !s.warm
            }));
      if (!sets || !sets.length) {
        if (!bad.includes(it.name)) bad.push(it.name);
        continue;
      }
      // Assisted: files write the help as a plus or a minus number; it is help either way. Other lifts never go below 0.
      for (const q of sets) {
        if (exo.assist) q.w = -Math.abs(q.w);
        else if (q.w < 0) q.w = 0;
      }
      /* Reads that are probably wrong (r30, from the review: a misread line
         went in without a word): a weighted lift under 5 lb (2.3 kg) or a set
         past 30 reps. Shown in the preview to check; nothing is changed. */
      if (!exo.bw && !exo.timed)
        for (const q of sets)
          if ((q.w > 0 && q.w < ODD.kg) || q.r > ODD.reps) {
            odd.push(`${exo.name} ${fmtW(q.w)} ${U()} x ${q.r}${x.date ? `, ${fmtDate(x.date)}` : ''}`);
            break;
          }
      // A lift's sets across rows of the same exercise stay together.
      const prev = ex.find(b => b.exId === exo.id);
      if (prev) prev.sets.push(...sets);
      else ex.push({ exId: exo.id, note: it.note || '', rr: null, sets });
      if (it.ss) grp[exo.id] = it.ss;
    }
    if (ex.length && Object.keys(grp).length) ssOf[sid] = grp;
    // The note and minutes the app's own file carries (r55).
    if (ex.length)
      out.push({
        id: sid,
        date,
        dayIdx: 0,
        dayId: null,
        dayName: (x.name || '').slice(0, NAME_CHARS) || 'Imported',
        routineId: '',
        free: true,
        ex,
        notes: x.note || '',
        durMin: x.durMin || null,
        deload: !!x.deload,
        light: false
      });
  }
  /* Date, lifts and reps, not loads (r31): the same file imported again with
     the other unit choice converted every load differently and added every
     session a second time. */
  const fp = (ss: { date: string; ex: { exId: string; sets: { r: number | null }[] }[] }) =>
    ss.date +
    '|' +
    ss.ex
      .map(b => b.exId + ':' + b.sets.map(q => q.r).join(','))
      .sort()
      .join(';');
  const have = new Set(state.sessions.map(fp));
  const seen = new Set<string>();
  const fresh: BuiltSession[] = [];
  let dup = 0;
  for (const ss of out) {
    const k = fp(ss);
    if (have.has(k) || seen.has(k)) {
      dup++;
      continue;
    }
    seen.add(k);
    fresh.push(ss);
  }
  /* Cardio from the file (r30): minutes from its time, distance in the file's
     unit (km beside kg, miles beside lb, as Strong writes it). An entry with
     no time cannot be saved (minutes are required) and is counted instead.
     One already in the log (same date, kind and minutes) is skipped. The app's
     own file says the minutes, heart rate, when, note and km (r55). */
  const cardio: CardioEntry[] = [];
  let cardioNoTime = 0;
  for (const c of m.res.cardioRows || []) {
    const min = c.min || Math.round(c.secs / MINUTE_S);
    if (!(min > 0)) {
      cardioNoTime++;
      continue;
    }
    if (state.cardio.some(x => x.date === c.date && x.kind === c.kind && x.min === min)) {
      dup++;
      continue;
    }
    cardio.push(
      cleanCardio({
        id: uid(),
        date: c.date,
        kind: c.kind,
        min,
        hr: c.hr || null,
        when: c.when || 'solo',
        note: c.note || '',
        dist: c.km != null ? c.km : c.dist > 0 ? (m.unit === 'kg' ? c.dist : c.dist * KM_MI) : null
      })
    );
  }
  return {
    sessions: fresh,
    ssOf,
    cardio,
    cardioNoTime,
    dup,
    bad,
    odd,
    timedOff,
    newEx: Object.values(newEx).filter(e => fresh.some(ss => ss.ex.some(b => b.exId === e.id)))
  };
}

/** How a routine is made from an import: the sessions that make a day, the days at most, the share of sessions the days must hold, the latest sessions a day's lifts are read from, the most sets an item takes, the highest RIR, the longest cycle in days, and the most rounds a week the days come round. */
const FROM_LOG = {
  sameAt: 0.5,
  days: 7,
  cover: 0.8,
  latest: 3,
  sets: 10,
  rir: 4,
  cycle: 14,
  rounds: 3,
  name: 40
} as const;
/** An order after any lift of the latest session, for a lift last done in an older one, and for one in none. */
const ORDER = { older: 100, none: 999 } as const;
/** The nearest common rep range to a lift's usual reps (a convention): each range by the most reps it takes. */
const USUAL_RANGES: readonly (readonly [number, readonly [number, number]])[] = [
  [3, [1, 3]],
  [5, [3, 5]],
  [8, [6, 8]],
  [10, [8, 10]],
  [12, [10, 12]],
  [15, [12, 15]]
];
/** The rep range past the last of those. */
const HIGH_RANGE: readonly [number, number] = [15, 20];
/** The letter A's code, for days named Day A, Day B. */
const LETTER_A = 65;
type Sess = State['sessions'][number];
type RoutineOut = State['routines'][number];
/* A routine from an import, on a first run (r31). Someone who brings their
   Strong or Hevy history has a routine already; measuring them against the
   starter they never picked read as 69% adherence, 15 muscles below target
   and "add sets to Lat Pulldown" for someone who had never done one. The
   days are the workouts' own names (the most recent 8 weeks), or, when the
   names cannot tell them apart (Strong calls every untitled workout
   "Morning Workout"), the sessions grouped by the lifts in them (Day A, B).
   Days come in the order they last came round, with rest days so the cycle
   runs about as many days a week as they trained. What each day holds comes
   from its latest 3 full sessions, so a program changed a few weeks ago is
   the program now (the review saw a bench moved from 5 x 5 to 3 x 8-10
   brought back as 3 x 3-5): the lifts done in at least half of them, in the
   latest order, and each lift's working sets, a rep range around its reps
   (the nearest common range, a convention) and its RIR from its latest full
   session there. Deload and lighter sessions are left out of that. Returns
   null when nothing repeats; the routine picker opens instead. */
/** A routine made from an imported log, how many days a week it runs, and which day a session was; null when nothing repeats. */
export function routineFromLog(
  sessions: readonly Sess[],
  ssOf: Readonly<Record<string, Readonly<Record<string, string>>>>
): { routine: RoutineOut; perWeek: number; dayFor: (x: Sess) => RoutineOut['days'][number] | null } | null {
  const all = sessions.filter(x => !x.demo && x.ex && x.ex.length);
  const first = all[0];
  if (!first) return null;
  const byDate = (a: Sess, b: Sess) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const newest = all.reduce((m, x) => (x.date > m ? x.date : m), first.date);
  const rec = all.filter(x => x.date >= addDays(newest, 1 - IMPORT_DAYS)).sort(byDate);
  // A session is off (a deload, a lighter day) when it was tagged, or when most of its lifts read lighter or short of their usual (r54, the one rule).
  const I = IDX();
  const tot: Record<string, number> = {},
    off: Record<string, number> = {};
  for (const id in I.byEx)
    for (const x of I.byEx[id] || []) {
      tot[x.sid] = (tot[x.sid] || 0) + 1;
      if (offTarget(x)) off[x.sid] = (off[x.sid] || 0) + 1;
    }
  const offS = (x: Sess) => x.deload || x.light || ((tot[x.id] || 0) > 0 && (off[x.id] || 0) * 2 >= (tot[x.id] || 0));
  const lifts = (x: Sess) => new Set(x.ex.filter(b => b.sets.some(q => !q.warm)).map(b => b.exId));
  const jac = (a: Set<string>, b: Set<string>) => {
    let n = 0;
    for (const v of a) if (b.has(v)) n++;
    const u = a.size + b.size - n;
    return u ? n / u : 0;
  };
  const nm = (x: Sess) => String(x.dayName || '').trim();
  const named = !rec.some(x => GENERIC_WORKOUT.test(nm(x)));
  type Group = { name: string; list: Sess[]; ids: Set<string> };
  let groups: Group[] = [];
  let pop: Sess[];
  if (named) {
    pop = rec;
    const by = new Map<string, Group>();
    for (const x of rec) {
      const k = nm(x).slice(0, FROM_LOG.name).toLowerCase();
      let g = by.get(k);
      if (!g) {
        g = { name: nm(x).slice(0, FROM_LOG.name), list: [], ids: new Set() };
        by.set(k, g);
        groups.push(g);
      }
      g.list.push(x);
    }
  } else {
    pop = rec.filter(x => !offS(x));
    for (const x of pop) {
      const L = lifts(x);
      let g: Group | null = null,
        bj = 0;
      for (const q of groups) {
        const j = jac(L, q.ids);
        if (j >= FROM_LOG.sameAt && j > bj) {
          g = q;
          bj = j;
        }
      }
      if (!g) {
        g = { name: '', list: [], ids: L };
        groups.push(g);
      }
      g.list.push(x);
      g.ids = L;
    }
  }
  groups = groups.filter(g => g.list.length >= IMPORT_REPEATS);
  if (
    !groups.length ||
    groups.length > FROM_LOG.days ||
    groups.reduce((a, g) => a + g.list.length, 0) < pop.length * FROM_LOG.cover
  )
    return null;
  const lastOf = (g: Group): Sess => g.list[g.list.length - 1] || first;
  groups.sort((a, b) => byDate(lastOf(a), lastOf(b)));
  if (!named)
    groups.forEach((g, i) => {
      g.name = 'Day ' + String.fromCharCode(LETTER_A + i);
    });
  const med = (a: number[]) => median(a.filter(v => v != null && isFinite(v)));
  const band = (r: number): readonly [number, number] => {
    for (const [top, range] of USUAL_RANGES) if (r <= top) return range;
    return HIGH_RANGE;
  };
  const work = (b: Sess['ex'][number]) => b.sets.filter(q => !q.warm && !q.drop);
  const days = groups
    .map(g => {
      const full = g.list.filter(x => !offS(x));
      const recent = (full.length ? full : g.list).slice(-FROM_LOG.latest);
      const latest = recent[recent.length - 1] || first;
      const cnt = new Map<string, number>();
      for (const x of recent) for (const id of lifts(x)) cnt.set(id, (cnt.get(id) || 0) + 1);
      const order = (id: string) => {
        for (let k = recent.length - 1; k >= 0; k--) {
          const s = recent[k];
          const i = s ? s.ex.findIndex(b => b.exId === id) : -1;
          if (i >= 0) return k === recent.length - 1 ? i : ORDER.older + i;
        }
        return ORDER.none;
      };
      const ids = [...cnt.keys()]
        .filter(id => (cnt.get(id) || 0) * 2 >= recent.length && state.exercises.some(e => e.id === id && !e.archived))
        .sort((a, b) => order(a) - order(b));
      const items = ids.map(id => {
        const ex = EX(id);
        const it = newItem(id);
        let b: Sess['ex'][number] | null = null;
        for (let k = recent.length - 1; k >= 0 && !b; k--) {
          const s = recent[k];
          b = (s && s.ex.find(q => q.exId === id && work(q).length)) || null;
        }
        if (!b) return it;
        const ws = work(b);
        it.sets = Math.min(FROM_LOG.sets, Math.max(1, ws.length));
        if (!ex.timed) {
          const r = med(ws.map(q => Number(q.r)));
          if (r != null && r > 0) [it.repMin, it.repMax] = band(r);
        }
        // RIR only when most of the sets were rated: one failure set in a file (Strong's F) is not a plan to fail every set.
        const rt = ws.filter(x => x.rir != null);
        const q = rt.length * 2 > ws.length ? med(rt.map(x => Number(x.rir))) : null;
        if (q != null) it.rir = Math.min(FROM_LOG.rir, Math.max(0, Math.round(q)));
        return it;
      });
      /* The file's supersets, from the day's latest session (r55.1). */
      {
        const sg = (ssOf && ssOf[latest.id]) || {};
        const gid: Record<string, string> = {};
        for (const it of items) {
          const k = sg[it.exId];
          if (k && items.filter(o => sg[o.exId] === k).length > 1) it.ss = gid[k] || (gid[k] = uid());
        }
      }
      return { g, day: { id: uid(), name: g.name, rest: false, items }, ids: lifts(latest) };
    })
    .filter(d => d.day.items.length);
  const r0 = rec[0];
  if (!days.length || !r0) return null;
  const span = Math.max(WEEK_DAYS, daysBetween(r0.date, newest) + 1);
  const perWeek = Math.min(WEEK_DAYS, Math.max(1, Math.round(rec.length / (span / WEEK_DAYS))));
  /* Workouts that come round more than once a week repeat in the cycle (r32,
     from the third review: push, pull, legs twice a week became "3 training
     days in a 4-day cycle", about 5 a week for someone doing 6). The second
     round is a copy of the same days, under the same names. */
  const reps = perWeek >= days.length * 2 ? Math.min(FROM_LOG.rounds, Math.floor(perWeek / days.length)) : 1;
  const seq: RoutineOut['days'] = [];
  for (let r = 0; r < reps; r++)
    days.forEach(d =>
      seq.push(r ? { ...d.day, id: uid(), items: d.day.items.map(it => ({ ...it, uid: uid() })) } : d.day)
    );
  const K = seq.length;
  const L = Math.min(FROM_LOG.cycle, Math.max(K, Math.round((WEEK_DAYS * K) / perWeek)));
  let rest = L - K;
  // Rest days spread after the training days, or after each round when the days repeat (upper, lower, rest, upper, lower, rest, rest).
  const cyc: RoutineOut['days'] = [];
  const restDay = () => ({ id: uid(), name: 'Rest', rest: true, items: [] });
  const K0 = days.length;
  seq.forEach((day, i) => {
    cyc.push(day);
    let k = 0;
    if (reps > 1) {
      if ((i + 1) % K0 === 0) {
        const roundsLeft = reps - (i + 1) / K0 + 1;
        k = Math.floor(rest / roundsLeft);
      }
    } else {
      const left = K - i - 1;
      k = left ? Math.floor(rest / (left + 1)) : rest;
    }
    for (let j = 0; j < k; j++) cyc.push(restDay());
    rest -= k;
  });
  /* Which day a session was: by name, or by the lifts in it (most in
     common, at least half), for sessions older than the 8 weeks too. */
  const dayFor = (x: Sess): RoutineOut['days'][number] | null => {
    if (named) {
      const k = nm(x).slice(0, FROM_LOG.name).toLowerCase();
      const d = days.find(q => q.g.name.toLowerCase() === k);
      return d ? d.day : null;
    }
    const L2 = lifts(x);
    let best: RoutineOut['days'][number] | null = null,
      bj = 0;
    for (const d of days) {
      const j = jac(L2, d.ids);
      if (j >= FROM_LOG.sameAt && j > bj) {
        best = d.day;
        bj = j;
      }
    }
    return best;
  };
  return { routine: { id: uid(), name: 'From your log', schedule: 'cycle', days: cyc }, perWeek, dayFor };
}

/* The preview only (r29, V): the preview keeps its own log so nothing tried
   there reaches the real one, which left its Stats empty. This copies the
   real log in, read-only: the live app's copy on this phone when there is one
   (Android, or both opened in the same browser tab), else the account's cloud
   copy (an iPhone keeps each home-screen app's storage apart). The one with
   more sessions wins. The live app and its table are never written. */
/** The live app's log for the preview to copy, the one with more sessions of this phone's and the account's, and why the account's could not be read. */
export async function liveLogFetch(): Promise<{ st: State | null; err: unknown }> {
  let local: State | null = null;
  try {
    const raw = prefGet(`${STORAGE_ID}.v1`);
    if (raw) local = normalize(parseJson(raw));
  } catch (e) {
    log('preview-copy', e);
    local = null;
  }
  let remote: State | null = null,
    err: unknown = null;
  if (typeof window.ironlogLiveDocs === 'function' && acct.user) {
    try {
      const parts: Record<string, Rec | null> = {};
      for (const d of await window.ironlogLiveDocs()) {
        const data = d.data && typeof d.data === 'object' && 'json' in d.data ? d.data.json : null;
        if (!isChunkId(d.id) || typeof data !== 'string') continue;
        try {
          parts[d.id] = rec(parseJson(data));
        } catch (e) {
          log('preview-copy', {
            message: `${d.id} could not be read and is left out`,
            stack: e instanceof Error ? e.stack : undefined
          });
        }
      }
      if (Object.keys(parts).length) remote = assemble(parts);
    } catch (e) {
      // Said by the caller: the copy could not be read from the account.
      err = e;
    }
  }
  const both: State[] = [];
  for (const x of [local, remote]) if (x) both.push(x);
  const best = both.sort((a, b) => realCount(b) - realCount(a))[0] || null;
  return { st: best && realCount(best) ? best : null, err };
}

/** A backup's text checked and, once confirmed, put in place of the whole log (Undo steps it back); `after` runs once it is in. */
export function importData(text: string, after?: () => void): void {
  let obj: unknown;
  try {
    obj = parseJson(text);
  } catch (e) {
    // Text that is not JSON: said, nothing changed.
    toast('That is not valid backup text');
    return;
  }
  const o = obj && typeof obj === 'object' ? obj : null;
  const s0 = o && 'state' in o && o.state ? o.state : o;
  const s = s0 && typeof s0 === 'object' ? s0 : null;
  const sessions = arr(s && 'sessions' in s ? s.sessions : undefined);
  if (
    !s ||
    !('exercises' in s && Array.isArray(s.exercises)) ||
    !('routines' in s && Array.isArray(s.routines)) ||
    !sessions
  ) {
    toast(`That file is not a backup from ${APP_NAME}`);
    return;
  }
  // Validate first and report honestly, rather than importing something that renders once and then throws.
  let clean: State;
  try {
    clean = normalize(s);
  } catch (e) {
    // A backup normalize cannot read: said, nothing changed.
    toast('That backup could not be read');
    return;
  }
  const dropped = normalize.dropped;
  if (!clean.sessions.length && sessions.length) {
    toast('No readable sessions in that backup');
    return;
  }
  const body =
    `This backup has ${clean.sessions.length} session${clean.sessions.length === 1 ? '' : 's'} and ${clean.routines.length} routine${clean.routines.length === 1 ? '' : 's'}.` +
    (dropped ? ` ${dropped} damaged record${dropped === 1 ? ' was' : 's were'} skipped.` : '') +
    ' It will replace everything currently in the app. You can step this back with Undo.';
  confirmBox(
    'Replace all data?',
    body,
    'Replace my data',
    () => {
      act(
        () => {
          setState(clean);
          if (!cloud.on) cloudStop(true);
        },
        { undo: true }
      );
      closeModal();
      ui.tab = 'today';
      render();
      toast('Backup imported', true);
      if (after) after();
    },
    true
  );
}

/** The import sheet open in its preview, or null. */
const preview = (): ImpPreviewModal | null => {
  const m = ui.modal;
  return m && m.kind === 'imp' && m.step === 'preview' ? m : null;
};

/** Import's taps, by data-act. */
export const IMPORT_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  impOpen() {
    inputStep('');
  },
  impRead() {
    const el = document.getElementById('impText');
    const text = el instanceof HTMLTextAreaElement ? el.value : '';
    const m = ui.modal;
    if (m && m.kind === 'imp' && m.step === 'input') m.text = text;
    impStart({ text });
  },
  impUnit(t) {
    const m = preview();
    const v = t.dataset.v;
    if (!m || (v !== 'lb' && v !== 'kg')) return;
    m.unit = v;
    renderModal();
  },
  impBack() {
    inputStep('');
  },
  impMapDone() {
    const m = preview();
    if (!m || !m.tab) return;
    const mp = m.tab.map;
    if (mp['date'] == null || mp['ex'] == null || mp['r'] == null) {
      toast('Choose the date, exercise, and reps columns');
      return;
    }
    // A column set back to None is no column: the reader reads a field without one as absent.
    const cols: Record<string, number> = {};
    for (const k in mp) {
      const v = mp[k];
      if (v != null) cols[k] = v;
    }
    openPreview(impFromTable(m.tab.rows, cols), m.tab);
  },
  impGo() {
    const m = preview();
    if (!m) return;
    const b = impBuild(m);
    if (!b.sessions.length && !b.cardio.length) return;
    /* A first run (no log of their own yet, the starter routine untouched):
       the routine comes from the import (r31), or the picker opens. */
    const AR = activeRoutine();
    const first =
      !realCount(state) &&
      !!AR &&
      starterSigs().includes(routineSig(AR)) &&
      !state.sessions.some(q => q.routineId === AR.id);
    const msg = `Imported ${b.sessions.length} session${b.sessions.length === 1 ? '' : 's'}${b.cardio.length ? `, ${b.cardio.length} cardio entr${b.cardio.length === 1 ? 'y' : 'ies'}` : ''}${b.newEx.length ? `, ${b.newEx.length} new exercise${b.newEx.length === 1 ? '' : 's'}` : ''}`;
    const made: { v: ReturnType<typeof routineFromLog> } = { v: null };
    act(
      () => {
        setState(
          normalize({
            ...state,
            exercises: [...state.exercises, ...b.newEx],
            sessions: [...state.sessions, ...b.sessions],
            cardio: [...state.cardio, ...b.cardio],
            settings: { ...state.settings, onboarded: true }
          })
        );
        invalidate();
        const inf = first && b.sessions.length ? routineFromLog(state.sessions, b.ssOf) : null;
        made.v = inf;
        if (inf) {
          const R = inf.routine;
          state.routines = dropStarter(state.routines, state.sessions, starterSigs());
          state.routines.push(R);
          state.activeRoutineId = R.id;
          // Imported sessions join their day (by name, or by their lifts), so the cycle, the streak and adherence read them.
          for (const x of state.sessions) {
            if (x.demo) continue;
            const d = inf.dayFor(x);
            if (!d) continue;
            x.routineId = R.id;
            x.dayId = d.id;
            x.dayIdx = R.days.indexOf(d);
            x.free = undefined;
          }
          invalidate();
          fitTargets(R, actualAvg4());
        }
      },
      { undo: true }
    );
    const inf = made.v;
    if (inf) {
      const R = inf.routine;
      closeModal();
      ui.tab = 'today';
      ui.todayDay = null;
      window.scrollTo(0, 0);
      render();
      toast(
        `${msg}. Your routine is made from them: ${andList(
          R.days.filter(d => !d.rest).map(d => d.name),
          SAID.days
        )}, about ${inf.perWeek} day${inf.perWeek === 1 ? '' : 's'} a week. Change it in Plan.`,
        true,
        SAID.made
      );
      return;
    }
    closeModal();
    ui.tab = 'history';
    window.scrollTo(0, 0);
    render();
    if (first && b.sessions.length) {
      openModal({ kind: 'templates', from: 'welcome', imported: true });
      toast(`${msg}. Now pick the routine you follow, or the closest one.`, true, SAID.pick);
      return;
    }
    toast(msg, true);
  },
  async previewCopy() {
    if (ENV !== 'preview') return;
    toast(`Looking for your ${APP_NAME} log`);
    const { st, err } = await liveLogFetch();
    if (!st) {
      if (!acct.user && AUTH()) {
        confirmBox(
          'Sign in first',
          `This test version keeps a separate log. Sign in with your ${APP_NAME} account to copy your log in. Your log in ${APP_NAME} stays as it is.`,
          'Sign in',
          () => openModal({ kind: 'account', mode: 'signin', email: '', pw: '' })
        );
        return;
      }
      toast(
        err
          ? `Could not read your ${APP_NAME} log: ${err instanceof Error ? err.message : String(err)}`
          : `No ${APP_NAME} log found for this account or on this phone.`,
        null,
        SAID.notFound
      );
      return;
    }
    const n = realCount(st);
    st.draft = null;
    const go = () => {
      act(
        () => {
          setState(st);
          if (!cloud.on) cloudStop(true);
        },
        { undo: true }
      );
      closeModal();
      ui.tab = 'today';
      render();
      toast(`Copied ${n} session${n === 1 ? '' : 's'} from ${APP_NAME}. ${APP_NAME} is unchanged.`, true);
    };
    if (realCount(state) || state.draft)
      confirmBox(
        'Replace the preview log?',
        `Your ${APP_NAME} log has ${n} session${n === 1 ? '' : 's'}. Copying replaces everything in this test version; your log in ${APP_NAME} stays as it is. Undo can step this back.`,
        'Copy my log',
        go
      );
    else go();
  },
  // The save kept aside at start (r45): restored through the import's checks, or shown as text (Forget it is Settings', settings.ts).
  unreadRestore() {
    const raw = unreadableRaw();
    if (!raw) return;
    importData(raw, unreadableForget);
  },
  unreadShow() {
    const raw = unreadableRaw();
    if (raw)
      openModal({
        kind: 'text',
        title: 'Save kept aside',
        help: 'Select all and copy it somewhere safe.',
        text: raw,
        readonly: true
      });
  },
  importText() {
    const el = document.getElementById('mText');
    importData(el instanceof HTMLTextAreaElement ? el.value : '');
  },
  pasteImport() {
    openModal({
      kind: 'text',
      title: 'Import backup text',
      help: 'Paste the full backup text here.',
      text: '',
      readonly: false
    });
  }
};

/** Import's fields changed: a file chosen, a backup file, and the preview's choices (an exercise, a new one's muscle, the date, a column). True when it was one of them. */
export function importChange(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return false;
  if (t instanceof HTMLInputElement && t.id === 'impFile' && t.files && t.files[0]) {
    const f = t.files[0];
    t.value = '';
    impStart({ file: f });
    return true;
  }
  if (t instanceof HTMLInputElement && t.id === 'importFile' && t.files && t.files[0]) {
    const fr = new FileReader();
    fr.onload = () => importData(String(fr.result));
    fr.onerror = () => toast('Could not read that file');
    fr.readAsText(t.files[0]);
    t.value = '';
    return true;
  }
  const m = ui.modal;
  if (!m || m.kind !== 'imp') return false;
  if (m.step === 'preview') {
    if (t.dataset.imppick != null) {
      m.pick[t.dataset.imppick] = t.value;
      renderModal();
      return true;
    }
    if (t.dataset.impmus != null) {
      const g = m.guess[t.dataset.impmus];
      if (ML[t.value] && g) g.primary = t.value;
      return true;
    }
    if (t.dataset.impdate != null) {
      if (isDate(t.value) && t.value <= today()) m.date = t.value;
      else t.value = m.date;
      renderModal();
      return true;
    }
    if (t.dataset.mapf != null && m.tab) {
      m.tab.map[t.dataset.mapf] = t.value === '' ? undefined : +t.value;
      return true;
    }
  }
  return false;
}
