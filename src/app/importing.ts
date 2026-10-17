/* Importing workouts (r23, PENDING 65): the parsers that turn a file or
   pasted text into rows, dates, exercise names and sets, before anything is
   matched to the library or saved (phase 3a, r51; moved unchanged from the
   legacy script, tests/moved.js holds them to r50's code). The preview and
   the save, which read the log, stay with the import screen. */

import { today, isDate } from './util';

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
type ImpItem = { name: string; sets: ImpSet[]; note: string };
/** An imported session: a date and a workout name, its exercises, and whether it was a deload. */
type ImpSession = { date: string; name: string; items: Map<string, ImpItem>; note: string; deload?: boolean };
/** Cardio read from a table, per date and kind, time and distance added up. */
type ImpCardio = { date: string; kind: string; secs: number; dist: number; name: string };

/** Rows read from a table at most; past this the preview says the file was cut. */
export const IMP_MAX_ROWS = 50000;

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

/* A date written any common way. Without a year it is the latest such day not
   after today. Numbers are month first unless the first is over 12. */
export function impDate(str: unknown, ref?: string): string | null {
  const s = String(str || '')
    .toLowerCase()
    .replace(/(\d)(st|nd|rd|th)\b/g, '$1')
    .trim();
  if (!s) return null;
  const t = ref || today();
  const ty = +t.slice(0, 4);
  const mk = (y: number, m: number, d: number): string | null => {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return isDate(iso) && new Date(y, m - 1, d).getDate() === d ? iso : null;
  };
  const noYear = (m: number, d: number): string | null => {
    let x = mk(ty, m, d);
    if (x && x > t) x = mk(ty - 1, m, d);
    return x;
  };
  const yy = (y: number) => (y < 100 ? 2000 + y : y);
  let g = s.match(/(?<!\d)(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (g) return mk(+g[1], +g[2], +g[3]);
  g = s.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  // A date more than 20 years back is not a training log (10/10/10 is three sets of 10).
  if (g) {
    let a = +g[1],
      b = +g[2];
    let m = a,
      d = b;
    if (a > 12 && b <= 12) {
      m = b;
      d = a;
    }
    const x = g[3] ? mk(yy(+g[3]), m, d) : noYear(m, d);
    return x && +x.slice(0, 4) >= ty - 20 ? x : null;
  }
  g = s.match(/\b(\d{1,2})\s+([a-z]{3,9})\.?,?\s*(\d{4})?\b/);
  if ((g && MON[g[2].slice(0, 4)]) || (g && MON[g[2].slice(0, 3)])) {
    const m = MON[g[2].slice(0, 4)] || MON[g[2].slice(0, 3)];
    return g[3] ? mk(+g[3], m, +g[1]) : noYear(m, +g[1]);
  }
  g = s.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?\b/);
  if (g && (MON[g[1].slice(0, 4)] || MON[g[1].slice(0, 3)])) {
    const m = MON[g[1].slice(0, 4)] || MON[g[1].slice(0, 3)];
    return g[3] ? mk(+g[3], m, +g[2]) : noYear(m, +g[2]);
  }
  return null;
}

/* Spreadsheet day numbers (days since 30 Dec 1899). */
export function impSerial(n: number | null): string | null {
  if (!((n as number) > 20000 && (n as number) < 80000)) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n as number) * 864e5);
  return d.toISOString().slice(0, 10);
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
    ] as [string, number][]
  ).sort((a, b) => b[1] - a[1])[0] as [string, number];
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

/* An .xlsx file is a zip of XML. Read the first sheet with the browser's own
   decompressor (Safari 16.4 and later), so no library is needed. */
export async function impXlsx(buf: ArrayBuffer): Promise<string[][]> {
  if (typeof DecompressionStream !== 'function') throw new Error('old');
  const u = new Uint8Array(buf),
    dv = new DataView(buf);
  let eo = -1;
  for (let i = u.length - 22; i >= 0 && i > u.length - 70000; i--)
    if (dv.getUint32(i, true) === 0x06054b50) {
      eo = i;
      break;
    }
  if (eo < 0) throw new Error('zip');
  const n = dv.getUint16(eo + 10, true);
  let p = dv.getUint32(eo + 16, true);
  const files: Record<string, { meth: number; cs: number; lo: number }> = {};
  for (let k = 0; k < n; k++) {
    const meth = dv.getUint16(p + 10, true),
      cs = dv.getUint32(p + 20, true),
      nl = dv.getUint16(p + 28, true),
      el = dv.getUint16(p + 30, true),
      cl = dv.getUint16(p + 32, true),
      lo = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
    files[name] = { meth, cs, lo };
    p += 46 + nl + el + cl;
  }
  const read = async (name: string): Promise<string | null> => {
    const f = files[name];
    if (!f) return null;
    const ln = dv.getUint16(f.lo + 26, true),
      le = dv.getUint16(f.lo + 28, true);
    const data = u.subarray(f.lo + 30 + ln + le, f.lo + 30 + ln + le + f.cs);
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
  const sheet = Object.keys(files)
    .filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort(
      (a, b) => parseInt((a.match(/\d+/) as RegExpMatchArray)[0]) - parseInt((b.match(/\d+/) as RegExpMatchArray)[0])
    )[0];
  if (!sheet) throw new Error('sheet');
  const rows: string[][] = [];
  const col = (r: string) => {
    let c = 0;
    for (const ch of r.replace(/\d+/g, '')) c = c * 26 + (ch.charCodeAt(0) - 64);
    return c - 1;
  };
  for (const rw of X((await read(sheet)) as string).getElementsByTagName('row')) {
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
  dist: [/^(distance|distance_km|distance_miles)$/]
};

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

export function impUnitOf(headers: readonly unknown[], map: Record<string, number>): 'kg' | 'lb' | null {
  const h = map.w != null ? String(headers[map.w]).toLowerCase() : '';
  return /kg|kilo/.test(h) ? 'kg' : /lb|pound/.test(h) ? 'lb' : null;
}

/* Table rows to sessions: grouped by date and workout name, exercises in
   order of first appearance. A row with no date or exercise continues the
   one above (sheets often write the date once). Rows without reps or
   seconds (Strong's rest timer, cardio distance rows) are skipped and counted. */
/* Cardio by name, for imported rows that carry a time or distance and no
   reps (r30: Strong's treadmill rows were dropped). Carries and lunges that
   say "walk" are lifting. */
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

export function impFromTable(rows: readonly (readonly unknown[])[], map: Record<string, number>) {
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
      if (bad.length < 8) bad.push(r.join(', ').slice(0, 80));
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
    /* A distance, or a time with no reps on a cardio name, is cardio: kept
       as a cardio entry per date and kind, time and distance added up. */
    const ck = impCardioKind(ex);
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
    if (!(reps > 0) && !(secs > 0)) {
      skipped++;
      continue;
    }
    const ty = cell('type').toLowerCase();
    const yes = (v: string) => /^(1|true|yes|y|x)$/i.test(v);
    const rpe = num(cell('rpe'));
    let rir = num(cell('rir'));
    // RPE 10 is no reps left, so RIR is taken as 10 minus RPE (the usual RIR-based RPE scale).
    if (rir == null && rpe != null && rpe >= 5 && rpe <= 10) rir = Math.max(0, 10 - rpe);
    const code = numTypes ? ty : '';
    if (ty === 'f' || ty === 'failure' || code === '4') rir = 0;
    const set = {
      w,
      r: reps > 0 ? Math.round(reps) : Math.round(secs),
      rir: rir != null && rir >= 0 && rir <= 10 ? rir : null,
      warm: ty === 'w' || ty === 'warmup' || ty === 'warm-up' || code === '2' || yes(cell('warm')),
      drop: ty === 'd' || ty === 'dropset' || ty === 'drop' || code === '3' || yes(cell('drop')),
      timed: !(reps > 0),
      u: rowUnit(r)
    };
    const k = date + '|' + name;
    if (!S.has(k)) S.set(k, { date, name, items: new Map(), note: '' });
    const ss = S.get(k) as ImpSession;
    if (/^(yes|true|1|y)$/i.test(String(cell('deload') || '').trim())) ss.deload = true;
    if (!ss.items.has(ex)) ss.items.set(ex, { name: ex, sets: [], note: cell('note') });
    const n = Math.min(Math.max(Math.round(num(cell('sets')) || 1), 1), 20);
    for (let j = 0; j < n; j++) (ss.items.get(ex) as ImpItem).sets.push({ ...set });
  }
  return {
    sessions: [...S.values()].map(x => ({
      date: x.date,
      name: x.name,
      items: [...x.items.values()],
      deload: x.deload || undefined
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
   and units written next to numbers. */
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
    s = s.replace(/@\s*((?:6|7|8|9)(?:\.5)?|10)(?![\d.x×*])/g, (_m, v) => ` rpe ${v} `);
  {
    let rpe = null;
    s = s.replace(/@?\s*\brpe\s*(\d+(?:\.\d+)?)|@\s*(\d+(?:\.\d+)?)\s*rpe\b/g, (_m, a, b) => {
      const v = +(a || b);
      if (v >= 5 && v <= 10) rpe = v;
      return ' ';
    });
    if (rpe != null) s = s.trim() + ' rir ' + (10 - rpe) + ' ';
  }
  s = s.replace(/(^|\s)(?:bw\s*)?\+\s*(\d+(?:\.\d+)?)\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})(?=\s|,|$)/g, (m, p, w, a, r) =>
    +a <= 10 ? p + Array(+a).fill(`bw+${w}x${r}`).join(' ') : m
  );
  s = s.replace(
    /(^|\s)(?:bw\s*)?\+\s*(\d+(?:\.\d+)?)\s*[x×*]\s*(\d{1,3})(?=\s|,|$)/g,
    (_m, p, w, r) => `${p}bw+${w}x${r}`
  );
  s = s.replace(/(^|\s)bw\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})(?=\s|,|$)/g, (m, p, a, r) =>
    +a <= 10 ? p + Array(+a).fill(`bwx${r}`).join(' ') : m
  );
  // sets x reps @ load, and "3 sets of 10 at 60"
  s = s.replace(/\b(\d{1,2})\s*(?:x|×|\*|sets? of)\s*(\d{1,3})\s*(?:@|at)\s*(\d+(?:\.\d+)?)\b/g, (m, a, b, c) =>
    +a <= 10 && +c > +a ? Array(+a).fill(`${c}x${b}`).join(' ') : m
  );
  /* sets x reps then a load at the end: "OHP 3x8 40" is 3 sets of 8 at 40
     (r30, from the review: it read as 3 x 8 and 3 x 40). Only up to 10 sets,
     and only a last number larger than the set count, so "185x8 8" (a load
     for 8, then 8 more reps) still reads as before. */
  s = s.replace(/(^|\s)(\d{1,2})\s*[x×*]\s*(\d{1,3})\s+(\d+(?:\.\d+)?)\s*$/, (m, p, a, b, c) =>
    +a <= 10 && +c > +b && +c > +a ? p + Array(+a).fill(`${c}x${b}`).join(' ') : m
  );
  // load x reps x sets
  s = s.replace(/\b(\d+(?:\.\d+)?)\s*[x×*]\s*(\d{1,3})\s*[x×*]\s*(\d{1,2})\b/g, (m, a, b, c) =>
    +c <= 10 ? Array(+c).fill(`${a}x${b}`).join(' ') : m
  );
  // A load then a list of reps: "185: 10/8/8" or "185 - 10, 8, 8" is each rep count at 185.
  s = s.replace(
    /(^|\s)(\d{2,}(?:\.\d+)?)(?:\s*[:\-–]\s*|\s+)(\d{1,2}(?:\s*[/,]\s*\d{1,2})+)(?=\s*$)/g,
    (_m, p, a, l) =>
      p +
      l
        .split(/\s*[/,]\s*/)
        .map((r: string) => `${a}x${r}`)
        .join(' ')
  );
  // load then sets x reps: "225 5x5"
  s = s.replace(/(^|\s)(\d{2,}(?:\.\d+)?)\s+(\d{1,2})\s*[x×*]\s*(\d{1,3})(?=\s|,|$)/g, (m, p, a, b, c) =>
    +b <= 10 ? p + Array(+b).fill(`${a}x${c}`).join(' ') : m
  );
  return s.trim();
}

export const GENERIC_WORKOUT =
  /^\s*((early|late)\s+)?(morning|afternoon|evening|night|midday|lunch|weekend)?\s*(workout|session|training|lifting|lift|gym)?\s*$|^imported$/i;
