/* Importing workouts (r23, PENDING 65): the parsers that turn a file or
   pasted text into rows, dates, exercise names and sets, before anything is
   matched to the library or saved (phase 3a, r51; moved unchanged from the
   legacy script). The preview and
   the save, which read the log, stay with the import screen. */

import { today, isDate, yearOf, DAY_MS, isoDateOf, HOUR_MIN, MINUTE_S, SECOND_MS, LETTERS, WEEK_DAYS } from './util';
import { CARDIO, CWHEN } from './library';
import { KM_MI, LB } from './units';
import { EFFORT_TOP, LIMITS } from './records';

/** One set read from a table row, in the row's unit (u) when the row says it. */
type ImpSet = {
  w: number;
  r: number;
  rir: number | null;
  warm: boolean;
  drop: boolean;
  timed: boolean;
  u: 'kg' | 'lb' | null;
};
/** An exercise of an imported session, in order of first appearance. */
type ImpItem = { name: string; sets: ImpSet[]; note: string; ss?: string };
/** An imported session: a date and a workout name, its exercises, whether it was a deload, and its note and minutes, from the app's own file (r55) and from Strong and Hevy (r55.1). */
type ImpSession = {
  date: string;
  name: string;
  items: Map<string, ImpItem>;
  note: string;
  deload?: boolean;
  durMin?: number;
};
/** Cardio read from a table, per date and kind, time and distance added up; from the app's own file its exact minutes, heart rate, when, note and distance in km (r55). */
type ImpCardio = {
  date: string;
  kind: string;
  secs: number;
  dist: number;
  name: string;
  min?: number;
  hr?: number;
  when?: string;
  note?: string;
  km?: number;
};

/** An exercise as the reader found it: its sets from a table, or the text of its sets from notes, read once the exercise is known (the import screen's impTextSets). */
export interface ImpReadItem {
  name: string;
  sets?: ImpSet[] | undefined;
  setsText?: string[] | undefined;
  note?: string | undefined;
  ss?: string | undefined;
}
/** A session as the reader found it: no date when the notes gave none (the preview asks for one). */
export interface ImpReadSession {
  date: string | null;
  name: string;
  items: ImpReadItem[];
  deload?: boolean | undefined;
  note?: string | undefined;
  durMin?: number | undefined;
}
/** What a file or pasted text was read as, before the preview: the sessions, the unit when it says one, what was skipped or not understood, cardio from a table, and whether it came from notes or still needs its columns named. */
export interface ImpRead {
  sessions: ImpReadSession[];
  unit: 'kg' | 'lb' | null;
  skipped: number;
  cardio: number;
  cardioRows?: ImpCardio[] | undefined;
  unread?: string[] | undefined;
  unreadN?: number | undefined;
  cut?: boolean | undefined;
  text?: boolean | undefined;
  needMap?: boolean | undefined;
}
/** A table's columns as read or as chosen in the preview: the column index of each field. */
export type ImpMap = Record<string, number | undefined>;

/** The weeks of sessions the demo log makes (Settings, Load demo data). */
export const DEMO_WEEKS = 8;

/** A first run's import makes the routine (routineFromLog, in the import screen) from its last
    IMPORT_WEEKS weeks, counted back from its newest workout, when its workouts repeat: each day kept
    is a workout done IMPORT_REPEATS times or more there (a convention). */
export const IMPORT_WEEKS = 8,
  IMPORT_REPEATS = 2;
/** The days those weeks span, the newest workout's day among them. */
export const IMPORT_DAYS = IMPORT_WEEKS * WEEK_DAYS;

/** Rows read from a table at most; past this the preview says the file was cut. */
export const IMP_MAX_ROWS = 50000;
/** The rows a file's preview lists as not read, and the characters of each. */
const BAD_ROWS = { shown: 8, chars: 80 } as const;
/** The sets one row of a table may stand for (its Sets column). */
const ROW_SETS = 20;
/** The most sets a written line like 3x8 is read as standing for; with more, the line is read as written. */
const TEXT_SETS = 10;
/** An RPE is read from RPE_LOW to EFFORT_TOP; a lower number is left out. */
const RPE_LOW = 5;

/** Month names and their numbers, for dates written in words. */
export const MON: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12
};
/** The lengths of MON's keys: three letters, and four for Sept. */
const MON_SHORT = 3,
  MON_LONG = 4;
/** A month word's number, by its first four letters (Sept) or else its first three, or undefined. */
const monthNum = (w: string): number | undefined => MON[w.slice(0, MON_LONG)] || MON[w.slice(0, MON_SHORT)];

/** Dates: the months, the most days a month has, two-digit years read as 2000 and on, and how far back a date counts (a date more than IMPORT_YEARS back is not a training log: 10/10/10 is three sets of 10). */
const MONTHS = 12,
  MONTH_DAYS = 31,
  CENTURY = 100,
  Y2K = 2000,
  IMPORT_YEARS = 20;
/** Spreadsheet day numbers count days since 30 Dec 1899 (day 0 in Excel and Sheets), read only between SERIAL.min (1954) and SERIAL.max (2119). */
const SERIAL = { epoch: Date.UTC(1899, 11, 30), min: 20000, max: 80000 } as const;

/* A date written any common way. Without a year it is the latest such day not
   after today. Numbers are month first unless the first is over 12. */
export function impDate(str: unknown, ref?: string): string | null {
  const s = String(str || '')
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .trim();
  if (!s) return null;
  const t = ref || today();
  const ty = +yearOf(t);
  const mk = (y: number, m: number, d: number): string | null => {
    if (!(m >= 1 && m <= MONTHS && d >= 1 && d <= MONTH_DAYS)) return null;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return isDate(iso) && new Date(y, m - 1, d).getDate() === d ? iso : null;
  };
  const noYear = (m: number, d: number): string | null => {
    let x = mk(ty, m, d);
    if (x && x > t) x = mk(ty - 1, m, d);
    return x;
  };
  const yy = (y: number) => (y < CENTURY ? Y2K + y : y);
  let g = s.match(/(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (g) {
    const [, y, mo, d] = g;
    return mk(+y, +mo, +d);
  }
  g = s.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  // A date more than IMPORT_YEARS back is not a training log (10/10/10 is three sets of 10).
  if (g) {
    const [, ga, gb, gy] = g;
    let a = +ga,
      b = +gb;
    let m = a,
      d = b;
    if (a > MONTHS && b <= MONTHS) {
      m = b;
      d = a;
    }
    const x = gy ? mk(yy(+gy), m, d) : noYear(m, d);
    return x && +yearOf(x) >= ty - IMPORT_YEARS ? x : null;
  }
  g = s.match(/\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s*(\d{4})?\b/);
  let mw = g ? monthNum(g[2]) : undefined;
  if (g && mw) {
    const [, d, , y] = g;
    return y ? mk(+y, mw, +d) : noYear(mw, +d);
  }
  g = s.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/);
  mw = g ? monthNum(g[1]) : undefined;
  if (g && mw) {
    const [, , d, y] = g;
    return y ? mk(+y, mw, +d) : noYear(mw, +d);
  }
  return null;
}

/* Spreadsheet day numbers (days since 30 Dec 1899). A blank cell is null,
   which compares as 0 and so fails the range check; the casts say that to
   TypeScript, and past the check the number is real, as the ! says. */
export function impSerial(n: number | null): string | null {
  if (!((n as number) > SERIAL.min && (n as number) < SERIAL.max)) return null;
  const d = new Date(SERIAL.epoch + Math.floor(n!) * DAY_MS);
  return isoDateOf(d.toISOString());
}

/* Rows from CSV or tab-separated text, quotes respected. The separator is the
   one most used on the first line: comma, semicolon (Strong in some regions)
   or tab (cells pasted from a spreadsheet). */
export function impRows(text: string): string[][] | null {
  const first = text.split(/\r?\n/)[0] || '';
  const cnt = (c: string) => first.split(c).length - 1;
  const sep = (
    [
      ['\t', cnt('\t')],
      [';', cnt(';')],
      [',', cnt(',')]
    ] satisfies [string, number][]
  ).sort((a, b) => b[1] - a[1])[0];
  if (!sep[1]) return null;
  const d = sep[0];
  const rows: string[][] = [];
  let row: string[] = [],
    f = '',
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
      continue;
    }
    if (c === '"' && f === '') q = true;
    else if (c === d) {
      row.push(f);
      f = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f);
      f = '';
      if (row.some(x => x.trim())) rows.push(row);
      row = [];
      if (rows.length > IMP_MAX_ROWS) break;
    } else f += c;
  }
  row.push(f);
  if (row.some(x => x.trim())) rows.push(row);
  return rows.length >= 2 ? rows : null;
}

/** The fixed parts of a zip file the reader uses (PKWARE's APPNOTE): the end
    record's signature, its least size, how far from the end it can sit (its
    comment is at most 65535 bytes), and where its entry count and directory
    offset are; in each directory entry, where its method, compressed size,
    name, extra and comment lengths and local header offset are, and its
    size before the name; in each local header, where its name and extra
    lengths are, and its size before the name. */
const ZIP = {
  endSig: 0x06054b50,
  endSize: 22,
  endScan: 70000,
  endCount: 10,
  endDir: 16,
  dirMethod: 10,
  dirSize: 20,
  dirName: 28,
  dirExtra: 30,
  dirComment: 32,
  dirLocal: 42,
  dirHead: 46,
  localName: 26,
  localExtra: 28,
  localHead: 30
} as const;

/* An .xlsx file is a zip of XML. Read the first sheet with the browser's own
   decompressor (Safari 16.4 and later), so no library is needed. */
export async function impXlsx(buf: ArrayBuffer): Promise<string[][]> {
  if (typeof DecompressionStream !== 'function') throw new Error('old');
  const u = new Uint8Array(buf),
    dv = new DataView(buf);
  let eo = -1;
  for (let i = u.length - ZIP.endSize; i >= 0 && i > u.length - ZIP.endScan; i--)
    if (dv.getUint32(i, true) === ZIP.endSig) {
      eo = i;
      break;
    }
  if (eo < 0) throw new Error('zip');
  const n = dv.getUint16(eo + ZIP.endCount, true);
  let p = dv.getUint32(eo + ZIP.endDir, true);
  const files: Record<string, { meth: number; cs: number; lo: number }> = {};
  for (let k = 0; k < n; k++) {
    const meth = dv.getUint16(p + ZIP.dirMethod, true),
      cs = dv.getUint32(p + ZIP.dirSize, true),
      nl = dv.getUint16(p + ZIP.dirName, true),
      el = dv.getUint16(p + ZIP.dirExtra, true),
      cl = dv.getUint16(p + ZIP.dirComment, true),
      lo = dv.getUint32(p + ZIP.dirLocal, true);
    const name = new TextDecoder().decode(u.subarray(p + ZIP.dirHead, p + ZIP.dirHead + nl));
    files[name] = { meth, cs, lo };
    p += ZIP.dirHead + nl + el + cl;
  }
  const read = async (name: string): Promise<string | null> => {
    const f = files[name];
    if (!f) return null;
    const ln = dv.getUint16(f.lo + ZIP.localName, true),
      le = dv.getUint16(f.lo + ZIP.localExtra, true);
    const at = f.lo + ZIP.localHead + ln + le;
    const data = u.subarray(at, at + f.cs);
    if (f.meth === 0) return new TextDecoder().decode(data);
    const out = await new Response(
      new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
    ).arrayBuffer();
    return new TextDecoder().decode(out);
  };
  const X = (t: string) => new DOMParser().parseFromString(t, 'application/xml');
  const ss: string[] = [];
  const sst = await read('xl/sharedStrings.xml');
  if (sst)
    for (const si of X(sst).getElementsByTagName('si'))
      ss.push([...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
  // The sheets by number, so the first sheet is the one read. Each name matched
  // the pattern with a number in it, so match finds one (the two !).
  const sheet = Object.keys(files)
    .filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => parseInt(a.match(/\d+/)![0]) - parseInt(b.match(/\d+/)![0]))[0];
  if (!sheet) throw new Error('sheet');
  const rows: string[][] = [];
  const col = (r: string) => {
    let c = 0;
    // A is 1: its code less the code before it.
    for (const ch of r.replace(/\d+/g, '')) c = c * LETTERS + (ch.charCodeAt(0) - ('A'.charCodeAt(0) - 1));
    return c - 1;
  };
  // The sheet's name came from the zip's own list of files, so read finds it (the !).
  for (const rw of X((await read(sheet))!).getElementsByTagName('row')) {
    const row: string[] = [];
    for (const c of rw.getElementsByTagName('c')) {
      const i = col(c.getAttribute('r') || 'A');
      const t = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0];
      let val = '';
      if (t === 's') val = ss[+(v && v.textContent)] || '';
      else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
      else val = v ? v.textContent : '';
      row[i] = val;
    }
    for (let i = 0; i < row.length; i++) if (row[i] == null) row[i] = '';
    if (row.some(x => String(x).trim())) rows.push(row);
    if (rows.length > IMP_MAX_ROWS) break;
  }
  return rows;
}

/* Exercise names from other apps and from people: "Bench Press (Barbell)",
   "DB curls", "lat pull down". Words are reduced to one spelling, then the
   closest library exercise is found by shared words. */
export const IMP_SYN: readonly (readonly [RegExp, string])[] = [
  [/\bdumb ?bells?\b|\bdbs?\b/g, 'db'],
  [/\bbar ?bells?\b|\bbb\b/g, 'bb'],
  [/\bpull[ -]?downs?\b/g, 'pulldown'],
  [/\bpull[ -]?ups?\b/g, 'pullup'],
  [/\bchin[ -]?ups?\b|\bchins\b/g, 'chinup'],
  [/\bpush[ -]?ups?\b/g, 'pushup'],
  [/\bsit[ -]?ups?\b/g, 'situp'],
  [/\b(push|press)[ -]?downs?\b/g, 'pushdown'],
  [/\bdead[ -]?lifts?\b/g, 'deadlift'],
  [/\bromanian deadlift\b|\brdls?\b/g, 'rdl'],
  [/\bover ?head press\b|\bohp\b/g, 'ohp'],
  [/\bskull ?crushers?\b/g, 'skullcrusher'],
  [/\btriceps?\b/g, 'tricep'],
  [/\bbiceps?\b/g, 'bicep'],
  [/\bext\b|\bextensions?\b/g, 'extension'],
  [/\braises?\b/g, 'raise'],
  [/\bflyes?\b|\bflies\b|\bflys?\b/g, 'fly'],
  [/\bmachine\b/g, 'machine'],
  [/\bsmith machine\b/g, 'smith'],
  [/\bcurls\b/g, 'curl'],
  [/\brows\b/g, 'row'],
  [/\bsquats\b/g, 'squat'],
  [/\blunges\b/g, 'lunge'],
  [/\bdips\b/g, 'dip'],
  [/\bshrugs\b/g, 'shrug'],
  [/\bpresses\b/g, 'press'],
  [/\bcrunches\b/g, 'crunch'],
  [/\bcalves\b|\bcalfs\b/g, 'calf'],
  [/\bhamstrings?\b/g, 'ham'],
  [/\bdeg(rees?)?\b|°/g, ''],
  [/\bpaused\b/g, 'pause'],
  [/\bkettle ?bells?\b|\bkb\b/g, 'kettlebell']
];

/** A name as its words, lower case, each in the one spelling IMP_SYN gives it, with filler words left out. */
export function impNorm(name: unknown): string[] {
  let s = String(name || '')
    .toLowerCase()
    .replace(/[()\[\],.&/+_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, v] of IMP_SYN) s = s.replace(re, v);
  return s.split(' ').filter(w => w && !['the', 'a', 'with', 'of', 'and', 'on', 'exercise'].includes(w));
}

/* Bare everyday names mean the classic lift. */
export const IMP_ALIAS: Readonly<Record<string, string>> = {
  'calf raise': 'standCalf',
  'standing calf raise': 'standCalf',
  'seated calf raise': 'seatedCalf',
  'db shoulder press': 'seatedDbPress',
  'shoulder press db': 'seatedDbPress',
  'overhead press': 'ohp',
  'skullcrusher': 'skull',
  'assisted pullup': 'assistPullup',
  'assisted chinup': 'assistPullup',
  'chinup assisted': 'assistPullup',
  'assisted dip': 'assistDip',
  'tricep dip assisted': 'assistDip',
  'pullup assisted': 'assistPullup',
  // @ts-expect-error: this key is written twice with the same value; kept so the move changes no code.
  'assisted dip': 'assistDip',
  'dip assisted': 'assistDip',
  'squat': 'backSquat',
  'bb squat': 'backSquat',
  'back squat': 'backSquat',
  'bench': 'bench',
  'bench press': 'bench',
  'bb bench': 'bench',
  'flat bench': 'bench',
  'deadlift': 'deadlift',
  'ohp': 'ohp',
  'shoulder press': 'ohp',
  'military press': 'ohp',
  'pullup': 'pullup',
  'chinup': 'chinup',
  'row': 'bbRow',
  'bb row': 'bbRow',
  'bent over row': 'bbRow',
  'leg press': 'legPress',
  'lat pulldown': 'latPulldown',
  'pulldown': 'latPulldown',
  'dip': 'dips',
  'rdl': 'rdl',
  'hip thrust': 'hipThrust',
  'pushdown': 'pressdown',
  'tricep pushdown': 'pressdown',
  'tricep pushdown straight bar': 'pressdown',
  'pushdown straight bar': 'pressdown',
  'tricep pushdown rope': 'ropePressdown',
  'pushdown rope': 'ropePressdown',
  'rope pushdown': 'ropePressdown',
  'pushup': 'pushup',
  'curl': 'dbCurl',
  'db curl': 'dbCurl',
  'bicep curl': 'dbCurl',
  'bb curl': 'bbCurl',
  'lat raise': 'dbLateral',
  'lateral raise': 'dbLateral',
  'lateral': 'dbLateral',
  'side raise': 'dbLateral',
  'lateral raise db': 'dbLateral',
  'db lateral raise': 'dbLateral'
};

/* For a new custom exercise: a first guess at the muscle and equipment,
   shown in the preview to change. */
export function impGuess(name: unknown): { primary: string; equip: string; assist?: true } {
  const w = impNorm(name).join(' ');
  const has = (re: RegExp) => re.test(w);
  const primary = has(/tricep|pushdown|skullcrusher|kickback/)
    ? 'triceps'
    : has(/curl/) && !has(/leg|ham/)
      ? 'biceps'
      : has(/leg curl|ham|rdl|good morning/)
        ? 'hamstrings'
        : has(/calf/)
          ? 'calves'
          : has(/lateral|side raise/)
            ? 'sideDelts'
            : has(/rear|face pull|reverse fly/)
              ? 'rearDelts'
              : has(/ohp|shoulder press|military|front raise/)
                ? 'frontDelts'
                : has(/shrug/)
                  ? 'traps'
                  : has(/pulldown|pullup|chinup|pullover/)
                    ? 'lats'
                    : has(/row/)
                      ? 'upperBack'
                      : has(/squat|leg press|lunge|leg extension|hack|split/)
                        ? 'quads'
                        : has(/deadlift|hip thrust|glute|bridge/)
                          ? 'glutes'
                          : has(/crunch|situp|plank|ab |abs|leg raise/)
                            ? 'abs'
                            : 'chest';
  if (has(/assist/)) return { primary: has(/dip/) ? 'chest' : 'lats', equip: 'machine', assist: true };
  const equip = has(/\bdb\b/)
    ? 'dumbbell'
    : has(/\bbb\b/)
      ? 'barbell'
      : has(/cable/)
        ? 'cable'
        : has(/smith/)
          ? 'smith'
          : has(/machine/)
            ? 'machine'
            : has(/pullup|chinup|pushup|dip|plank|situp/)
              ? 'bodyweight'
              : 'other';
  return { primary, equip };
}

/* The minutes a workout took, as Strong and Hevy write it (r55.1, V
   2026-10-19: imports dropped them): Strong's duration as "1h 5m", "50m" or
   "1h"; Hevy's start and end times, each a date and an "hh:mm" ("14 Sep 2026,
   17:29"), across midnight too. A bare number says no unit, so it is left
   out rather than guessed. Null when nothing reads. */
/** A workout's minutes from a duration cell, or from its start and end cells, or null. */
export function impSpan(dur: string, start: string, end: string): number | null {
  const d = String(dur || '').toLowerCase();
  const h = d.match(/(\d+(?:\.\d+)?)\s*h/),
    m = d.match(/(\d+)\s*m(?!s)/);
  if (h || m) return (h ? +h[1] * HOUR_MIN : 0) + (m ? +m[1] : 0);
  const at = (x: string): number | null => {
    const day = impDate(x),
      t = String(x || '').match(/(\d{1,2}):(\d{2})(?!.*\d:\d)/);
    if (!day || !t) return null;
    const [, hh, mm] = t;
    return Date.parse(`${day}T00:00:00Z`) / (MINUTE_S * SECOND_MS) + +hh * HOUR_MIN + +mm;
  };
  const a = at(start),
    b = at(end);
  return a != null && b != null && b > a ? b - a : null;
}

/* Header words for each field, across Strong, Hevy and hand-made sheets. */
/* Each field lists header names best first, so a sheet with both Date and Day
   takes Date, and a total-load column never passes for the weight. */
export const IMP_COLS: Readonly<Record<string, readonly RegExp[]>> = {
  date: [/^date$/, /^(workout date|start_?time|date ?time|when)$/, /^day$/],
  name: [/^(workout name|workout|title|session|routine)$/],
  ex: [/^(exercise( name)?|exercise_title|movement|lift)$/, /^name$/],
  w: [
    /^(weight|load)$/,
    /^load_(lb|kg)$/,
    /^(weight|load)[ _]?\(?(kgs?|lbs?|pounds?|kilos?)\)?$/,
    /^(kgs?|lbs?)$/,
    /^(?!total).*\b(weight|load)\b.*$/
  ],
  r: [/^(reps?|repetitions|rep count)$/],
  sets: [/^sets$/],
  rir: [/^rir$/],
  rpe: [/^rpe$/],
  type: [/^(set order|set_type|set type|type)$/],
  warm: [/^(warm ?up|warmup)$/],
  drop: [/^(drop ?set|dropset)$/],
  secs: [/^(seconds|duration_seconds|time \(s\)|secs)$/],
  note: [/^(notes?|exercise_notes|exercise_note|comment)$/],
  unit: [/^(weight unit|unit|units)$/],
  deload: [/^deload$/],
  dist: [/^(distance|distance_km|distance_miles)$/],
  snote: [/^(workout notes?|description)$/],
  dur: [/^(workout )?duration$/],
  end: [/^end_?time$/],
  ss: [/^superset(_id)?$/]
};

/* The column each field is in, read from the header row: for each field in
   turn, the first of its patterns that matches a column no earlier field
   took. A field with no column is left out. */
export function impHeader(row: readonly unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  const k = row.map(h =>
    String(h || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
  );
  for (const f in IMP_COLS)
    for (const re of IMP_COLS[f]) {
      const i = k.findIndex((h, j) => re.test(h) && !Object.values(map).includes(j));
      if (i >= 0) {
        map[f] = i;
        break;
      }
    }
  // Ironlog's own CSV names the load load_lb or load_kg (and total_load_* for both sides, which is not it).
  if (map.w == null) {
    const i = k.findIndex(h => /^load_(lb|kg)$/.test(h));
    if (i >= 0) map.w = i;
  }
  /* Ironlog's own CSV (r31.2): its day column is the workout's name, and
     its unit column says reps or seconds, not lb or kg. In other sheets a
     Day column can be a date or a weekday, so this is only for ours. */
  if (k.some(h => /^load_(lb|kg)$/.test(h)) && k.includes('exercise_note')) {
    const d = k.indexOf('day');
    if (map.name == null && d >= 0 && d !== map.date) map.name = d;
    if (map.unit != null && k[map.unit] === 'unit') delete map.unit;
  }
  return map;
}

/** The unit the weight column's header names ("Weight (kg)", "lbs"), or null when it names none. */
export function impUnitOf(headers: readonly unknown[], map: Record<string, number>): 'kg' | 'lb' | null {
  const h = map.w != null ? String(headers[map.w]).toLowerCase() : '';
  return /kg|kilo/.test(h) ? 'kg' : /lb|pound/.test(h) ? 'lb' : null;
}

/* Cardio by name, or null: an imported row with a distance, or with a
   cardio name and no reps, is cardio (r30: Strong's treadmill rows were
   dropped). Carries and lunges that say "walk" are lifting. */
export function impCardioKind(name: unknown): string | null {
  const n = String(name || '').toLowerCase();
  if (/farmer|carry|lunge|suitcase/.test(n)) return null;
  return /treadmill.*incline|incline.*walk/.test(n)
    ? 'incline'
    : /elliptical|cross ?trainer/.test(n)
      ? 'elliptical'
      : /stair|stepper|step ?mill/.test(n)
        ? 'stairs'
        : /rowing|rower|\berg\b|concept ?2/.test(n)
          ? 'rower'
          : /cycl|bike|spin/.test(n)
            ? 'bike'
            : /\b(run|running|jog|jogging|sprint)/.test(n)
              ? 'run'
              : /treadmill|\bwalk|walking|hike|hiking/.test(n)
                ? 'walk'
                : /hiit|interval/.test(n)
                  ? 'hiit'
                  : /cardio|swim/.test(n)
                    ? 'other'
                    : null;
}

/* Table rows to sessions: grouped by date and workout name, exercises in
   order of first appearance. A row with no date or exercise continues the
   one above (sheets often write the date once). Rest timer rows, and rows
   with neither reps nor seconds that are not cardio, are skipped and
   counted; cardio rows become cardio entries (r30). */
export function impFromTable(rows: readonly (readonly unknown[])[], map: Record<string, number>): ImpRead {
  const head = rows[0];
  let unit = impUnitOf(head, map);
  // Strong's Set Order is the set's number (W, D and F mark types); only Hevy's set_type uses numbers as types.
  const numTypes = map.type != null && /set_type/i.test(String(head[map.type]));
  const rowUnit = (r: readonly unknown[]): 'kg' | 'lb' | null => {
    if (map.unit == null) return null;
    const v = String(r[map.unit] || '').toLowerCase();
    return /kg|kilo/.test(v) ? 'kg' : /lb|pound/.test(v) ? 'lb' : null;
  };
  if (!unit && map.unit != null) for (let i = 1; i < rows.length && !unit; i++) unit = rowUnit(rows[i]);
  const S = new Map<string, ImpSession>();
  /* The app's own file (r55, the audit: read back, it lost cardio, session
     notes and the minutes a session took, and a missed set): its columns
     past the ones every table has, by their names. */
  const heads = head.map(h =>
    String(h == null ? '' : h)
      .trim()
      .toLowerCase()
  );
  const ours = heads.some(h => /^load_(lb|kg)$/.test(h)) && heads.includes('exercise_note');
  /* Strong's file, by its own columns: its Duration is the workout's ("1h
     5m"), where a hand-made sheet's Duration may be a set's (r55.1, the spec
     review), so only Strong's is read as the session's minutes. */
  const strong = heads.includes('workout name') && heads.includes('set order');
  const col = (n: string): number | null => (ours && heads.includes(n) ? heads.indexOf(n) : null);
  const cNote = col('session_note'),
    cMin = col('session_minutes'),
    cHr = col('avg_hr'),
    cUnit = col('unit');
  const at = (r: readonly unknown[], i: number | null): string =>
    i == null ? '' : String(r[i] == null ? '' : r[i]).trim();
  let lastDate: string | null = null,
    lastEx: string | null = null,
    lastName = '';
  let skipped = 0,
    cardio = 0;
  const bad: string[] = [];
  const C = new Map<string, ImpCardio>();
  const num = (v: unknown): number | null => {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const cell = (f: string) => (map[f] == null ? '' : String(r[map[f]] == null ? '' : r[map[f]]).trim());
    let date: string | null = cell('date');
    date = date ? impDate(date) || impSerial(num(date)) : lastDate;
    const ex: string | null = cell('ex') || lastEx;
    if (!date || !ex) {
      skipped++;
      if (bad.length < BAD_ROWS.shown) bad.push(r.join(', ').slice(0, BAD_ROWS.chars));
      continue;
    }
    lastDate = date;
    lastEx = ex;
    const name = cell('name') || (cell('date') ? '' : lastName);
    lastName = name;
    // A blank reads as null, and null as 0 in every test and in Math.round below, which the code relies on; the casts say so to TypeScript.
    const reps = num(cell('r')) as number,
      secs = num(cell('secs')) as number;
    const w = num(cell('w')) || 0;
    // Strong's rest timer rows, and cardio (a distance), are not lifting sets.
    if (/^rest timer$/i.test(ex) || /rest/i.test(cell('type'))) {
      skipped++;
      continue;
    }
    /* A distance, or a cardio name with no reps, is cardio: kept as a
       cardio entry per date and kind, time and distance added up. A blank
       distance is null and reads as 0, as reps and seconds do above. */
    /* The app's own cardio rows say minutes in their unit column, with the
       kind's name, the minutes and heart rate in the session's columns, and
       when, the distance and the note in the exercise note. */
    if (ours && at(r, cUnit) === 'minutes') {
      cardio++;
      const kind = (CARDIO.find(([, l]) => l === ex) || ['other'])[0];
      const min = num(at(r, cMin)),
        hr = num(at(r, cHr));
      const o: ImpCardio = { date, kind, secs: min != null && min > 0 ? min * MINUTE_S : 0, dist: 0, name: ex };
      if (min != null && min > 0) o.min = Math.round(min);
      if (hr != null && hr > 0) o.hr = Math.round(hr);
      const rest: string[] = [];
      for (const part of cell('note').split('; ').filter(Boolean)) {
        const wh = CWHEN.find(([, l]) => l === part);
        const d = /^(\d+(?:\.\d+)?) (km|mi)$/.exec(part);
        if (wh) o.when = wh[0];
        else if (d) o.km = d[2] === 'km' ? +d[1] : +d[1] * KM_MI;
        else rest.push(part);
      }
      if (rest.length) o.note = rest.join('; ');
      C.set(date + '|' + kind + '|' + C.size, o);
      continue;
    }
    const ck = impCardioKind(ex);
    // The cast lets TypeScript compare it: null > 0 is false, as for reps.
    const dist = num(cell('dist')) as number;
    if (dist > 0 || (ck && !(reps > 0))) {
      cardio++;
      const k = date + '|' + (ck || 'other');
      const o = C.get(k) || { date, kind: ck || 'other', secs: 0, dist: 0, name: ex };
      o.secs += secs > 0 ? secs : 0;
      o.dist += dist > 0 ? dist : 0;
      C.set(k, o);
      continue;
    }
    // A set of 0 reps in the app's own file is a missed set (r55), kept as one; elsewhere, a row with nothing done.
    const missed = ours && cell('r') !== '' && reps === 0;
    if (!(reps > 0) && !(secs > 0) && !missed) {
      skipped++;
      continue;
    }
    const ty = cell('type').toLowerCase();
    const yes = (v: string) => /^(1|true|yes|y|x)$/i.test(v);
    const rpe = num(cell('rpe'));
    let rir = num(cell('rir'));
    // RPE 10 is no reps left, so RIR is taken as EFFORT_TOP minus RPE (the usual RIR-based RPE scale).
    if (rir == null && rpe != null && rpe >= RPE_LOW && rpe <= EFFORT_TOP) rir = Math.max(0, EFFORT_TOP - rpe);
    const code = numTypes ? ty : '';
    if (ty === 'f' || ty === 'failure' || code === '4') rir = 0;
    const set = {
      w,
      r: reps > 0 ? Math.round(reps) : Math.round(secs),
      rir: rir != null && rir >= 0 && rir <= EFFORT_TOP ? rir : null,
      warm: ty === 'w' || ty === 'warmup' || ty === 'warm-up' || code === '2' || yes(cell('warm')),
      drop: ty === 'd' || ty === 'dropset' || ty === 'drop' || code === '3' || yes(cell('drop')),
      timed: !(reps > 0) && !missed,
      u: rowUnit(r)
    };
    const k = date + '|' + name;
    if (!S.has(k)) S.set(k, { date, name, items: new Map<string, ImpItem>(), note: '' });
    // Made just above when it was missing, so it is there (the !).
    const ss = S.get(k)!;
    const sn = ours ? at(r, cNote) : cell('snote');
    if (!ss.note && sn) ss.note = sn;
    const dm = ours ? num(at(r, cMin)) : impSpan(strong ? cell('dur') : '', cell('date'), cell('end'));
    if (ss.durMin == null && dm != null && dm >= 1 && dm <= LIMITS.minutes) ss.durMin = Math.round(dm);
    if (/^(yes|true|1|y)$/i.test(String(cell('deload') || '').trim())) ss.deload = true;
    if (!ss.items.has(ex))
      ss.items.set(ex, { name: ex, sets: [], note: cell('note'), ...(cell('ss') ? { ss: cell('ss') } : {}) });
    const n = Math.min(Math.max(Math.round(num(cell('sets')) || 1), 1), ROW_SETS);
    // The item was added above when it was missing (the !).
    for (let j = 0; j < n; j++) ss.items.get(ex)!.sets.push({ ...set });
  }
  return {
    sessions: [...S.values()].map(x => ({
      date: x.date,
      name: x.name,
      items: [...x.items.values()],
      deload: x.deload || undefined,
      note: x.note || undefined,
      durMin: x.durMin
    })),
    unit,
    skipped,
    cardio,
    cardioRows: [...C.values()],
    unread: bad,
    cut: rows.length > IMP_MAX_ROWS
  };
}

/* Sets typed as free text, read the way Type or dictate sets reads them
   (parseSets), plus "3x10 @ 60" and "60x10x3" for sets of reps at a load,
   and units written next to numbers. The group parameters of the replace
   callbacks below are typed by hand, which makes each a cast, since
   String.replace types them any: every group typed string is one its
   pattern must match ((^|\s) matches empty text at worst), and the RPE
   pattern's two groups are alternatives, so each is string | undefined. */
export function impSetsText(t: unknown): string {
  let s = ' ' + String(t).toLowerCase() + ' ';
  s = s.replace(/(\d),(\d{1,2})(?=\s*(?:lbs?|kgs?)?\s*[x×*])/g, '$1.$2');
  s = s.replace(/(\d)\s*(lbs?|kgs?|#)(?=[\s,x×*@;/]|$)/g, '$1 ');
  s = s.replace(/(\d)\s*(?:s|sec|secs|seconds)\b/g, '$1');
  /* Notation lifters write (r32, from the third review): RPE ("180x5
     @RPE8", "rpe 8.5", "@8 rpe") becomes RIR, 10 minus RPE, for the line's
     sets; "+10" before sets is load added to bodyweight ("Chins +10 3x8");
     "BW" before sets is bodyweight ("Pull-ups BW 3x10"). */
  /* A bare "@8" after sets on a line that already has a load ("Bench 100
     3x8 @9", "140x5x5 @8") is RPE as lifters write it, not a load of 9
     (r32, second check: that line saved nine sets at 100 and two at 9). Only
     6 to 10; "@2" stays RIR. */
  if (/(^|\s)\d{2,}(\.\d+)?\s*(x|×|\*|\s\d)/.test(s))
    s = s.replace(/@\s*((?:6|7|8|9)(?:\.5)?|10)(?![\d.x×*])/g, (_m: string, v: string) => ` rpe ${v} `);
  {
    let rpe: number | null = null;
    s = s.replace(
      /@?\s*\brpe\s*(\d+(?:\.\d+)?)|@\s*(\d+(?:\.\d+)?)\s*rpe\b/g,
      (_m: string, a: string | undefined, b: string | undefined) => {
        // One of the two groups matched, digits and all, so a || b is a number's
        // text; the cast says so, since TypeScript refuses + on undefined.
        const v = +((a || b) as string);
        if (v >= RPE_LOW && v <= EFFORT_TOP) rpe = v;
        return ' ';
      }
    );
    if (rpe != null) s = s.trim() + ' rir ' + (EFFORT_TOP - rpe) + ' ';
  }
  s = s.replace(
    /(^|\s)(?:bw\s*)?\+\s*(\d+(?:\.\d+)?)\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})(?=\s|,|$)/g,
    (m: string, p: string, w: string, a: string, r: string) =>
      +a <= TEXT_SETS ? p + Array<string>(+a).fill(`bw+${w}x${r}`).join(' ') : m
  );
  s = s.replace(
    /(^|\s)(?:bw\s*)?\+\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d{1,3})(?=\s|,|$)/g,
    (_m: string, p: string, w: string, r: string) => `${p}bw+${w}x${r}`
  );
  s = s.replace(/(^|\s)bw\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})(?=\s|,|$)/g, (m: string, p: string, a: string, r: string) =>
    +a <= TEXT_SETS ? p + Array<string>(+a).fill(`bwx${r}`).join(' ') : m
  );
  // sets x reps @ load, and "3 sets of 10 at 60"
  s = s.replace(
    /\b(\d{1,2})\s*(?:x|×|\*|sets? of)\s*(\d{1,3})\s*(?:@|at)\s*(\d+(?:\.\d+)?)\b/g,
    (m: string, a: string, b: string, c: string) =>
      +a <= TEXT_SETS && +c > +a ? Array<string>(+a).fill(`${c}x${b}`).join(' ') : m
  );
  /* sets x reps then a load at the end: "OHP 3x8 40" is 3 sets of 8 at 40
     (r30, from the review: it read as 3 x 8 and 3 x 40). Only up to TEXT_SETS sets,
     and only a last number larger than the set count, so "185x8 8" (a load
     for 8, then 8 more reps) still reads as before. */
  s = s.replace(
    /(^|\s)(\d{1,2})\s*[x×*]\s*(\d{1,3})\s+(\d+(?:\.\d+)?)\s*$/,
    (m: string, p: string, a: string, b: string, c: string) =>
      +a <= TEXT_SETS && +c > +b && +c > +a ? p + Array<string>(+a).fill(`${c}x${b}`).join(' ') : m
  );
  // load x reps x sets
  s = s.replace(
    /\b(\d+(?:\.\d+)?)\s*[x×*]\s*(\d{1,3})\s*[x×*]\s*(\d{1,2})\b/g,
    (m: string, a: string, b: string, c: string) =>
      +c <= TEXT_SETS ? Array<string>(+c).fill(`${a}x${b}`).join(' ') : m
  );
  // A load then a list of reps: "185: 10/8/8" or "185 - 10, 8, 8" is each rep count at 185.
  s = s.replace(
    /(^|\s)(\d{2,}(?:\.\d+)?)(?:\s*[:\-–]\s*|\s+)(\d{1,2}(?:\s*[/,]\s*\d{1,2})+)(?=\s*$)/g,
    (_m: string, p: string, a: string, l: string) =>
      p +
      l
        .split(/\s*[/,]\s*/)
        .map((r: string) => `${a}x${r}`)
        .join(' ')
  );
  // load then sets x reps: "225 5x5"
  s = s.replace(
    /(^|\s)(\d{2,}(?:\.\d+)?)\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})(?=\s|,|$)/g,
    (m: string, p: string, a: string, b: string, c: string) =>
      +b <= TEXT_SETS ? p + Array<string>(+b).fill(`${a}x${c}`).join(' ') : m
  );
  return s.trim();
}

/* Workout names that say nothing about the day: blank, "Morning workout",
   "Session", "Imported" and the like. When a recent session has one,
   routineFromLog (in the import screen) groups sessions into days by the
   lifts they share instead of by name. */
export const GENERIC_WORKOUT =
  /^\s*((early|late)\s+)?(morning|afternoon|evening|night|midday|lunch|weekend)?\s*(workout|session|training|lifting|lift|gym)?\s*$|^imported$/i;

/* ---------- typed sets and notes (r63, from the legacy script) ---------- */

/** What one line of typed sets may hold: the most reps in a set and the most sets. */
const TYPED = { reps: 100, sets: 20 } as const;
/** One decimal place, for a reading of RPE as RIR. */
const TENTHS = 10;
/** One set read from typed text: its load (in the unit the reader gives, 0 when none), reps and reps in reserve. */
export interface TypedSet {
  w: number;
  r: number;
  rir: number | null;
}
/* Typed or dictated sets. Examples it reads:
   "235x5, 5, 4 rir 1"   three sets at 235, RIR 1 on each
   "185x8@2 205x6@1"      load changes mid-exercise, RIR per set
   "225 for 5 5 4 at 1"   "for" and "at" work like x and @ (RIR 1 on the last set)
   "bw x 10, bw+25 x 6"   bodyweight exercises, added load after the plus
   A bare number after the first set repeats the last load. Anything it
   cannot read returns null. rpe: effort is entered as RPE (Settings, r33),
   so @8 is RPE 8, read as RIR 2; "rpe 8" at the end is RPE in either mode, as
   "rir 2" is RIR. conv turns a typed load into the stored one. */
/** Sets typed as text, or null when any part cannot be read: the loads through conv, bodyweight allowed when the lift is one. */
export function readSets(
  text: unknown,
  ex: { bw?: boolean | undefined },
  defW: number | null | undefined,
  conv: (v: number) => number,
  rpe?: boolean
): TypedSet[] | null {
  const fromRpe = (v: number) => (v >= 1 && v <= EFFORT_TOP ? Math.round((EFFORT_TOP - v) * TENTHS) / TENTHS : NaN);
  let s = String(text || '')
    .toLowerCase()
    .replace(/[×*]/g, 'x')
    .replace(/\bfor\b/g, 'x')
    .replace(/\bat\b/g, '@')
    .replace(/\breps?\b/g, '')
    .replace(/\blbs?\b|\bkgs?\b/g, '');
  let allRir: number | null = null;
  const m = s.match(/\b(rir|rpe)\s*(\d+(?:\.\d+)?)\s*$/);
  if (m) {
    allRir = m[1] === 'rpe' ? fromRpe(+(m[2] || '')) : +(m[2] || '');
    if (!isFinite(allRir)) return null;
    s = s.slice(0, m.index);
  }
  s = s
    .replace(/\s*x\s*/g, 'x')
    .replace(/\s*@\s*/g, '@')
    .replace(/\s*\+\s*/g, '+')
    .trim();
  if (!s) return null;
  const toks = s.split(/[\s,;/]+/).filter(Boolean);
  const re = /^(?:(bw)(?:\+(\d+(?:\.\d+)?))?x|(\d+(?:\.\d+)?)x)?(\d{1,3})(?:@(\d+(?:\.\d+)?))?$/;
  let w = defW == null ? null : defW;
  const out: TypedSet[] = [];
  for (const t of toks) {
    const g = t.match(re);
    if (!g) return null;
    const [, bw, added, load, reps, at] = g;
    if (bw) w = added ? conv(+added) : 0;
    else if (load != null) w = conv(+load);
    const r = +(reps || '');
    if (!(r >= 1 && r <= TYPED.reps)) return null;
    const rir = at != null ? (rpe ? fromRpe(+at) : +at) : allRir;
    if (rir != null && !(rir >= 0 && rir <= EFFORT_TOP)) return null;
    if (w == null && !ex.bw) return null;
    out.push({ w: w == null ? 0 : w, r, rir });
  }
  return out.length && out.length <= TYPED.sets ? out : null;
}

/** The lines of notes not understood that the preview lists. */
const UNREAD_SHOWN = 50;
/** A loose exercise of notes, its sets as text until the exercise is known. */
interface TextItem {
  name: string;
  sets: ImpSet[];
  setsText: string[];
}
/* Free text: a date line starts a day; each other line is an exercise name
   followed by its sets, or sets alone continuing the exercise above, or a
   name alone with its sets on the next lines (impSetsText reads the sets). */
/** Notes read as sessions: a date line starts a day, an exercise's sets kept as text until its exercise is known. */
export function impFromText(text: unknown): ImpRead {
  const lines = String(text).split(/\r?\n/);
  const S: { date: string | null; name: string; items: TextItem[] }[] = [];
  let cur: (typeof S)[number] | null = null,
    ex: TextItem | null = null,
    pend: { name: string; raw: string } | null = null,
    hint: 'kg' | 'lb' | null = null;
  const unread: string[] = [];
  const day = (date: string | null, name: string): { date: string | null; name: string; items: TextItem[] } => {
    if (pend) unread.push(pend.raw);
    const d = { date, name: name || '', items: [] };
    cur = d;
    S.push(d);
    ex = null;
    pend = null;
    return d;
  };
  const raw = (v: number) => v;
  const nextIsName = (i: number) => {
    for (let j = i + 1; j < lines.length; j++) {
      const t = (lines[j] || '').trim();
      if (t) return /^[\s\-•*–]*[a-z]{3,}/i.test(t) && !impDate(t);
    }
    return true;
  };
  const REPS = /^\d{1,2}(\s*[/,]\s*\d{1,2})+$/;
  for (let li = 0; li < lines.length; li++) {
    const L0 = lines[li] || '';
    const L = L0.replace(/^[\s\-•*–]+/, '').trim();
    if (!L) continue;
    const under = li > 0 && !!(lines[li - 1] || '').trim();
    if (/\bkgs?\b|\dkg/i.test(L)) hint = hint || 'kg';
    else if (/\blbs?\b|\dlb|#/i.test(L)) hint = hint || 'lb';
    const words = L.split(/\s+/);
    // A date line: a date and no sets on it; what is left may be the workout's name.
    let dt = impDate(L);
    // Only numbers and slashes after an exercise, with sets (not a new exercise) after: reps, not a date.
    if (dt && (ex || pend) && /^[\d\s/.,-]+$/.test(L) && !nextIsName(li)) dt = null;
    // "Bench press 185" then "10/10/10": the line under a lone load is its reps, even when it could be a date.
    const e0: TextItem | null = ex;
    const lone =
      !!e0 && e0.setsText.length > 0 && /^\d{2,}(\.\d+)?$/.test((e0.setsText[e0.setsText.length - 1] || '').trim());
    if (e0 && lone && REPS.test(L)) {
      e0.setsText[e0.setsText.length - 1] += ' ' + L;
      continue;
    }
    // Numbers directly under a lift still waiting for its sets (no blank line between) are its reps.
    if (dt && pend && under && REPS.test(L)) dt = null;
    if (dt) {
      const rest = L.replace(/\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b/gi, '')
        .replace(
          /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b|\b\d{1,2}(st|nd|rd|th)?\s+[a-z]{3,9}\.?,?(\s*\d{4})?\b|\b[a-z]{3,9}\.?\s+\d{1,2}(st|nd|rd|th)?(,?\s*\d{4})?\b/gi,
          ''
        )
        .replace(/[,:;\-–|]+/g, ' ')
        .trim();
      if (!/\d/.test(rest)) {
        day(dt, rest);
        continue;
      }
    }
    // Sets alone continue the exercise above, or the name waiting on the line before.
    const target: TextItem | { name: string; raw: string } | null = ex || pend;
    const alone = readSets(impSetsText(L), { bw: true }, null, raw);
    if (
      alone &&
      target &&
      !/[a-z]{3,}/i.test(L.replace(/\b(bw|x|at|for|rir|reps?|sets?|of|lbs?|kgs?|sec|secs|seconds)\b/gi, ''))
    ) {
      const p: { name: string; raw: string } | null = pend;
      // A first day made here takes no waiting name to the lines not understood: the name is the lift these sets are for.
      let into: (typeof S)[number] | null = cur;
      if (!into) {
        pend = null;
        into = day(null, '');
      }
      let e: TextItem | null = ex;
      if (p && target === p) {
        e = { name: p.name, sets: [], setsText: [] };
        into.items.push(e);
        ex = e;
        pend = null;
      }
      if (e) e.setsText.push(L);
      continue;
    }
    // Name then sets: the shortest name whose remainder reads as sets, so no set is read as part of the name.
    let done = false;
    for (let i = 1; i < words.length; i++) {
      const name = words
        .slice(0, i)
        .join(' ')
        .replace(/[:\-–]+$/, '')
        .trim();
      const rest = words.slice(i).join(' ');
      if (!/[a-z]/i.test(name)) continue;
      const got = readSets(impSetsText(rest), { bw: true }, null, raw);
      if (got) {
        const into = cur || day(null, '');
        const e: TextItem = { name, sets: [], setsText: [rest] };
        into.items.push(e);
        ex = e;
        pend = null;
        done = true;
        break;
      }
    }
    if (done) continue;
    // A name then a load, with the reps on the line right under it: "Bench press 185" then "10/10/10".
    {
      const g = L.match(/^(.*?[a-z].*?)\s+(\d{2,}(?:\.\d+)?\s*(?:lbs?|kgs?|#)?)$/i);
      const nx = (lines[li + 1] || '').replace(/^[\s\-•*–]+/, '').trim();
      if (g && REPS.test(nx)) {
        const into = cur || day(null, '');
        const pw: { name: string; raw: string } | null = pend;
        if (pw) unread.push(pw.raw);
        pend = null;
        const e: TextItem = {
          name: (g[1] || '').replace(/[:\-–]+$/, '').trim(),
          sets: [],
          setsText: [g[2] + ' ' + nx]
        };
        into.items.push(e);
        ex = e;
        li++;
        continue;
      }
    }
    // A name alone: its sets may follow on the next lines.
    if (/[a-z]{3,}/i.test(L) && !/\d{2,}\s*[x×*]/.test(L)) {
      const pw: { name: string; raw: string } | null = pend;
      if (pw) unread.push(pw.raw);
      pend = { name: L.replace(/[:\-–]+$/, '').trim(), raw: L0.trim() };
      ex = null;
      continue;
    }
    unread.push(L0.trim());
  }
  const last: { name: string; raw: string } | null = pend;
  if (last) unread.push(last.raw);
  return {
    sessions: S.filter(x => x.items.length).map(x => ({ date: x.date, name: x.name, items: x.items })),
    unit: hint,
    skipped: 0,
    cardio: 0,
    unread: unread.slice(0, UNREAD_SHOWN),
    unreadN: unread.length,
    text: true
  };
}

/** On a bodyweight lift, the most sets a line of sets of reps alone ("3x10") is read as. */
const BW_SETS_OF = 10;
/* Sets from text are read once the exercise is known, so a bodyweight lift
   may have reps alone. The unit is applied at the end. A unit written on
   the line is that line's, glued to the x or as # for pounds too (r55, the
   audit: 100kg under an earlier 30lb was read as 100 lb; the second review:
   100kgx8 and 225#). */
/** A notes exercise's sets, read as the exercise it was matched to, the loads through conv unless a line says its unit; null when a line cannot be read. */
export function impTextSets(
  it: { setsText?: readonly string[] | undefined },
  exo: { bw?: boolean | undefined; assist?: boolean | undefined; timed?: boolean | undefined },
  conv: (v: number) => number
): { w: number; r: number; rir: number | null | undefined; warm: boolean; drop: boolean }[] | null {
  const out: { w: number; r: number; rir: number | null | undefined; warm: boolean; drop: boolean }[] = [];
  let defW: number | null = null;
  for (const t of it.setsText || []) {
    let st = impSetsText(t);
    const lu = /(?:\b|\d)kgs?(?![a-wyz])/i.test(t) ? 'kg' : /(?:\b|\d)lbs?(?![a-wyz])|\d\s*#/i.test(t) ? 'lb' : null;
    const cv = lu === 'kg' ? (v: number) => v : lu === 'lb' ? (v: number) => v * LB : conv;
    // On a bodyweight lift a bare "3x10" is sets of reps (no load to read); on a weighted lift it stays load x reps.
    if (exo.bw && !exo.assist) {
      // The line as it was before the replace reads its @ (the replace reads the text it is given, not the result).
      const at = /@/.test(st);
      st = st.replace(/(^|[\s,])(\d{1,2})x(\d{1,3})(?=$|[\s,])/g, (m: unknown, p: unknown, a: unknown, b: unknown) =>
        Number(a) <= BW_SETS_OF && !at
          ? String(p) +
            Array<string>(Number(a))
              .fill('bwx' + String(b))
              .join(' ')
          : String(m)
      );
    }
    // On a weighted lift a bare "3x10" (up to 5 sets, no unit, no load anywhere on the line) is sets of reps with no load:
    // at the load carried from the line above, else asked for rather than read as 3 lb for 10 reps.
    else if (
      !exo.timed &&
      /^\s*[1-5]\s*[x×*]\s*\d{1,3}(\s*,?\s*[1-5]\s*[x×*]\s*\d{1,3})*\s*$/.test(String(t).toLowerCase())
    ) {
      if (defW == null) return null;
      for (const g of String(t)
        .toLowerCase()
        .matchAll(/([1-5])\s*[x×*]\s*(\d{1,3})/g))
        for (let k = 0; k < +(g[1] || 0); k++)
          out.push({ w: defW, r: +(g[2] || 0), rir: undefined, warm: false, drop: false });
      continue;
    }
    const g = readSets(st, { bw: !!exo.bw || !!exo.timed }, defW, cv);
    if (!g) return null;
    out.push(...g.map(x => ({ w: x.w, r: x.r, rir: x.rir, warm: false, drop: false })));
    const lastSet = g[g.length - 1];
    defW = lastSet ? lastSet.w : defW;
  }
  return out;
}
