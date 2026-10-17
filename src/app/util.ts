/* General helpers with no knowledge of training: text, ids, dates, numbers
   and a string hash (phase 2, r50; moved unchanged from the legacy script,
   tests/moved.js holds them to r49's code). */

/* ---------- text ---------- */

/** A list in a sentence (V, r29): "a and b", "a, b, and c", with the
    serial comma; max shows that many and then "and N more". */
export function andList(a?: readonly (string | number | null | undefined)[] | null, max?: number): string {
  a = (a || []).filter(x => x != null && x !== '');
  if (max && a.length > max) {
    const rest = a.length - max;
    a = [...a.slice(0, max), `${rest} more`];
  }
  return a.length < 3 ? a.join(' and ') : a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
}

/** Text made safe to put into markup: the five characters HTML treats as syntax.
    The cast lets TypeScript look a character up in the table by any string. */
export const esc = (s: unknown): string =>
  String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);

/** A new record id: up to seven random base-36 characters, then the last four of the time. */
export const uid = (): string => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

/* ---------- dates (local) ----------
   A date is a "YYYY-MM-DD" string in the phone's own time zone, never a UTC
   instant, so a session logged at 11 pm stays on its day. */

/** A number as two digits, with a leading zero: a date's month and day, and the rest timer's seconds. */
export const pad = (n: number): string => String(n).padStart(2, '0');

/** A Date as a date in the log's form, read in the phone's time zone. */
export const iso = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

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

/** The Monday of a date's week. */
export const weekStart = (s: string): string => {
  const d = parse(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return iso(d);
};

/** Whole days from a to b (subtracting two dates subtracts their time values;
    the casts tell TypeScript so, and are not code). */
export const daysBetween = (a: string, b: string): number =>
  Math.round(((parse(b) as unknown as number) - (parse(a) as unknown as number)) / 86400000);

/** Today's date on the phone's clock, in the log's form. */
export const today = (): string => iso(new Date());

/* ---------- numbers ---------- */

/** A finite number. Not a type guard: false also means NaN or Infinity, so a
    false answer says nothing about the type. */
export const isNum = (v: unknown): boolean => typeof v === 'number' && isFinite(v);

/** A number from a number or a numeric string, else the default. */
export const numOr = <T>(v: unknown, d: T): number | T => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
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

/** A date in the log's form, YYYY-MM-DD (the shape, not whether the day exists). */
export const isDate = (v: unknown): boolean => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Rounded to one decimal. */
export const r1 = (n: number): number => Math.round(n * 10) / 10;

/** Rounded to three decimals. */
export function r3(v: number): number {
  return Math.round(v * 1000) / 1000;
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

/** A short, stable hash of a string: ids made from a record's content, and
    whether a sync document changed. The mixing is cyrb53's; both 32-bit
    halves are written in base 36. */
export function hashStr(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

/* ---------- seeded random numbers (phase 3a, r51; moved unchanged, tests/moved.js holds it to r50's code) ---------- */

/** Mulberry32: random numbers from a seed, the same series every time for the same seed (the demo log). */
export function mulberry(a: number): () => number {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
