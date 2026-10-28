/* General helpers with no knowledge of training: text, ids, dates, numbers
   and a string hash (phase 2, r50; moved unchanged from the legacy script). */

/* ---------- the numbers everything else is measured in ---------- */

/** The slack a comparison of two computed numbers allows for floating-point rounding. */
export const EPS = 1e-9;
/** Two loads, estimates or steps within a millionth of each other (of a
    kilogram, for a load) are the same: loads are kept in kilograms from
    numbers typed in either unit, so one load can differ in its last digits. */
export const EPS_SAME = 1e-6;
/** A share written as a percent. */
export const PERCENT = 100;
/** The scales of rounding to one decimal, to two, to three and to six. */
export const TENTHS = 10,
  HUNDREDTHS = 100,
  THOUSANDTHS = 1000,
  MILLIONTHS = 1e6;
/** Time: a second in milliseconds, a minute and an hour in seconds, a day in milliseconds, a week in days. */
export const SECOND_MS = 1000,
  MINUTE_S = 60,
  HOUR_S = 3600,
  HOUR_MIN = 60,
  DAY_MIN = 1440,
  DAY_MS = 24 * HOUR_S * SECOND_MS,
  WEEK_DAYS = 7;
/** Sunday's place in a week counted from Monday at 0, the last day. */
export const SUNDAY = WEEK_DAYS - 1;
/** The letters A to Z, as superset groups and spreadsheet columns are named. */
export const LETTERS = 26;
/** Ids and hashes are written in base 36: digits and lowercase letters. */
const ID_RADIX = 36;

/* ---------- text ---------- */

/** A list in a sentence (V, r29): "a and b", "a, b, and c", with the
    serial comma; max shows that many and then "and N more". */
export function andList(a?: readonly (string | number | null | undefined)[] | null, max?: number): string {
  a = (a || []).filter(x => x != null && x !== '');
  if (max && a.length > max) {
    const rest = a.length - max;
    a = [...a.slice(0, max), `${rest} more`];
  }
  return a.length <= 2 ? a.join(' and ') : a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
}

/** Choices joined as copy says them: "2 or 8", "2, 4, or 8" (the serial comma). */
export function orList(a: readonly (string | number)[]): string {
  return a.length <= 2 ? a.join(' or ') : a.slice(0, -1).join(', ') + ', or ' + a[a.length - 1];
}

/** A new record id: up to UID_RANDOM random base-36 characters, then the last UID_TIME of the time. */
const UID_RANDOM = 7,
  UID_TIME = 4;
/** A new record id, by UID_RANDOM and UID_TIME (a random number's text starts "0.", which is skipped). */
export const uid = (): string =>
  Math.random()
    .toString(ID_RADIX)
    .slice(2, 2 + UID_RANDOM) + Date.now().toString(ID_RADIX).slice(-UID_TIME);

/* ---------- dates (local) ----------
   A date is a "YYYY-MM-DD" string in the phone's own time zone, never a UTC
   instant, so a session logged at 11 pm stays on its day. */

/** A number as two digits, with a leading zero: a date's month and day, and the rest timer's seconds. */
export const pad = (n: number): string => String(n).padStart(2, '0');

/** A Date as a date in the log's form, read in the phone's time zone. */
export const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Where a date in the log's form, YYYY-MM-DD, ends its year and its month and starts its day. */
const ISO_YEAR_END = 4,
  ISO_MONTH_END = 7,
  ISO_DAY_AT = 8,
  ISO_END = 10;
/** A date's year, YYYY. */
export const yearOf = (s: string): string => s.slice(0, ISO_YEAR_END);
/** A date's month, YYYY-MM. */
export const monthOf = (s: string): string => s.slice(0, ISO_MONTH_END);
/** The date of an ISO time (YYYY-MM-DDTHH:MM:SSZ), YYYY-MM-DD. */
export const isoDateOf = (s: string): string => s.slice(0, ISO_END);
/** A date's day of the month, as a number. */
export const dayOfMonth = (s: string): number => +s.slice(ISO_DAY_AT, ISO_END);

/** A date in the log's form as a Date at midnight in the phone's time zone. */
export const parse = (s: string): Date => {
  const [a, b, c] = s.split('-').map(Number);
  return new Date(a, b - 1, c);
};

/** The date n days after s (before it, when n is negative), by the calendar. */
export const addDays = (s: string, n: number): string => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return iso(d);
};

/** A date's day of the week, from Monday at 0 to Sunday at SUNDAY (getDay counts from Sunday at 0). */
export const dayOfWeek = (s: string): number => (parse(s).getDay() + WEEK_DAYS - 1) % WEEK_DAYS;

/** The Monday of a date's week. */
export const weekStart = (s: string): string => addDays(s, -dayOfWeek(s));

/** Whole days from a to b (subtracting two dates subtracts their time values;
    the casts tell TypeScript so, and are not code). */
export const daysBetween = (a: string, b: string): number =>
  Math.round(((parse(b) as unknown as number) - (parse(a) as unknown as number)) / DAY_MS);

/** Today's date on the phone's clock, in the log's form. */
export const today = (): string => iso(new Date());

/* ---------- numbers ---------- */

/** A finite number. Not a type guard: false also means NaN or Infinity, so a
    false answer says nothing about the type. */
export const isNum = (v: unknown): boolean => typeof v === 'number' && isFinite(v);

/** A number from a number or a numeric string, else the default. */
export const numOr = <T>(v: unknown, d: T): number | T => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  // isNum is no type guard (above), so the cast says what it just checked.
  return isNum(n) ? (n as number) : d;
};

/** A number kept between lo and hi, else the default kept between them. A
    null default does not come out as null: Math.max reads it as 0, so an
    unusable value comes out as 0 kept between lo and hi, as it always has. The
    cast says so to TypeScript and is not code. */
export const clampN = (v: unknown, lo: number, hi: number, d: number | null): number => {
  const n = numOr(v, d);
  return Math.min(Math.max(n as number, lo), hi);
};

/** A date in the log's form, YYYY-MM-DD (the shape, not whether the day
    exists). Not a type guard either: a false answer would then tell
    TypeScript the value is no string, and most strings are not dates. */
export const isDate = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A small whole number as a word, for copy that spells it ("Up to two"); past the words, the number. */
export const numWord = (n: number): string =>
  ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'][n] ??
  String(n);
/** How many times, as copy says it ("more than twice"); past two, the number in words and "times". */
export const timesWord = (n: number): string => (n === 1 ? 'once' : n === 2 ? 'twice' : `${numWord(n)} times`);
/** The shares copy says in words. */
const SHARE_WORDS: readonly (readonly [number, string])[] = [
  [1 / 2, 'half'],
  [1 / 3, 'a third'],
  [1 / 4, 'a quarter'],
  [1 / TENTHS, 'a tenth']
];
/** A share in words where copy says it so (half, a third, a quarter, a tenth), else as a percent: 0.4 is 40%. */
export function shareWords(x: number): string {
  const f = SHARE_WORDS.find(([v]) => Math.abs(v - x) < EPS);
  return f ? f[1] : `${pctOf(x)}%`;
}
/** A share as a whole percent: 0.9 is 90. */
export const pctOf = (share: number): number => Math.round(share * PERCENT);

/** Rounded to one decimal. */
export const r1 = (n: number): number => Math.round(n * TENTHS) / TENTHS;
/** A share as a percent to one decimal, for the shares copy gives in tenths of a percent: 0.025 is 2.5. */
export const pct1 = (share: number): number => r1(share * PERCENT);

/** Rounded to three decimals. */
export function r3(v: number): number {
  return Math.round(v * THOUSANDTHS) / THOUSANDTHS;
}

/** A number typed into a field (a comma read as the decimal point), or null. */
export function numIn(v: unknown): number | null {
  if (v === '' || v == null) return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** The middle value of a list (the mean of the middle two when the count is even), or null for none. */
export function median(a: readonly number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ---------- hashing ---------- */

/** cyrb53's constants (bryc, public domain): the two seeds, the two
    multipliers of the loop, the two of the final mix and its two shifts. A
    stored hash depends on every one of them, so none may change. */
const CYRB53 = {
  seed1: 0xdeadbeef,
  seed2: 0x41c6ce57,
  mul1: 2654435761,
  mul2: 1597334677,
  mix1: 2246822507,
  mix2: 3266489909,
  shift1: 16,
  shift2: 13
} as const;

/** A short, stable hash of a string: ids made from a record's content, and
    whether a sync document changed. The mixing is cyrb53's; both 32-bit
    halves are written in base 36. */
export function hashStr(str: string): string {
  const C = CYRB53;
  let h1: number = C.seed1,
    h2: number = C.seed2;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, C.mul1);
    h2 = Math.imul(h2 ^ c, C.mul2);
  }
  h1 = Math.imul(h1 ^ (h1 >>> C.shift1), C.mix1) ^ Math.imul(h2 ^ (h2 >>> C.shift2), C.mix2);
  h2 = Math.imul(h2 ^ (h2 >>> C.shift1), C.mix1) ^ Math.imul(h1 ^ (h1 >>> C.shift2), C.mix2);
  return (h2 >>> 0).toString(ID_RADIX) + (h1 >>> 0).toString(ID_RADIX);
}

/* ---------- seeded random numbers (phase 3a, r51; moved unchanged) ---------- */

/** Mulberry32's constants (Tommy Ettinger, public domain): its step, its
    three shifts, the odd number of its second multiply, and 2^32, which
    scales a 32-bit result into [0, 1). The demo log depends on each. */
const MULBERRY32 = { step: 0x6d2b79f5, shift1: 15, shift2: 7, shift3: 14, odd: 61, span: 2 ** 32 } as const;

/** Mulberry32: random numbers from a seed, the same series every time for the same seed (the demo log). */
export function mulberry(a: number): () => number {
  const C = MULBERRY32;
  return function () {
    a |= 0;
    a = (a + C.step) | 0;
    let t = Math.imul(a ^ (a >>> C.shift1), 1 | a);
    t = (t + Math.imul(t ^ (t >>> C.shift2), C.odd | t)) ^ t;
    return ((t ^ (t >>> C.shift3)) >>> 0) / C.span;
  };
}

/* A record saved again under its id replaces the copy there, so one is never
   held twice: a workout in progress on another phone, kept in History at a
   first link, and then finished on its own phone under the same id (the
   second review of r55: History showed it twice until a reload). New ones go
   at the end, where a push puts them. */
/** Puts each item into the list by id, replacing one already there under that id. */
export function putById<T extends { id: string }>(list: T[], items: readonly T[]): void {
  for (const x of items) {
    const i = list.findIndex(y => y.id === x.id);
    if (i >= 0) list.splice(i, 1);
    list.push(x);
  }
}
