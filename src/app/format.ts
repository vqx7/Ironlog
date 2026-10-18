/* Words and numbers as the screens and the engine's sentences say them:
   dates, times, durations, rep ranges and counts (phase 3a, r51, and the
   date words the engine uses in 3b, r52; moved unchanged from the legacy
   script, tests/moved.js holds each to the code of the build its phase
   started from). Durations are worded only by estMin, which
   tests/hygiene.js enforces. Layer 2 since r52, beside the engine whose
   sentences use it; a few words here read the clock (fmtDateRow, todayEye,
   greeting) and so may never be reached from the engine (tests/hygiene.js). */

import { parse, today } from './util';

/* ---------- dates and times ---------- */

// History rows sit under a week header, so the year only shows when it is not this one.
export const fmtDateRow = (s: string): string =>
  parse(s).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(s.slice(0, 4) === today().slice(0, 4) ? {} : { year: 'numeric' })
  });

/* Today's date without the comma (V, r42): "Mon Oct 12". Built from two
   parts so every locale keeps its own day and month words. */
export function todayEye(): string {
  const d = new Date();
  return (
    d.toLocaleDateString(undefined, { weekday: 'short' }) +
    ' ' +
    d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  );
}

/* A session's start time, for telling two sessions on one day apart. */
export function sessTm(x: { t?: number | null }): string {
  try {
    return x.t ? new Date(x.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  } catch (e) {
    // A guard only: with these options a number does not make it throw (a time
    // out of range gives "Invalid Date" instead, PENDING 308); if an engine
    // did throw, the session shows no time rather than breaking History.
    return '';
  }
}

/* The greeting on Today, when a name is set in Settings > General. */
export function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Evening' : h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
}

/** How long ago, in days: today, yesterday, or "N days ago". */
export function agoTxt(k: number): string {
  return k === 0 ? 'today' : k === 1 ? 'yesterday' : `${k} days ago`;
}

/** The week bar's day labels, Monday first. */
export const WD2: readonly string[] = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** The month names, for the month calendar. */
export const MONTHS: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
];

/* ---------- durations ---------- */

/* Rounded to 5 minutes, as in the routine picker (r32, from the third review:
   the picker said 55 to 75 min and Today "about 77 min" for the same day),
   and so is the time left in a session; under 10 minutes, to the minute.
   The budget is compared before rounding. */
export const min5 = (m: number): number => (m >= 10 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m)));

/* Every estimated duration on screen is written here and nowhere else (V,
   r42: "~75 min", never "about"). Callers round first, as each did before;
   this only words the number. tests/hygiene.js fails on the wording typed
   anywhere else in the source. */
export const estMin = (n: number): string => `~${n} min`;

/* ---------- numbers and ranges ---------- */

/* Nothing logged yet (r34, V): a dash, not a row of zeros. A count of 0
   once there is a log is real and stays a number. */
export const NIL = '–';

/** A number to at most three decimals, without trailing zeros. */
export const fmtG = (v: number): string => String(Math.round(v * 1000) / 1000);

// A rep range in words and labels: "5" when both ends are the same (r31: "5-5", "5×5-5").
export const repSpan = (lo: number | string, hi: number | string, sep = ' to '): string =>
  +lo === +hi ? `${+lo}` : `${+lo}${sep}${+hi}`;

/** A plan's reps as a phrase: "target of 5" or "8-12 range". */
export const rangeWords = (p: { repMin: number | string; repMax: number | string }): string =>
  +p.repMin === +p.repMax ? `target of ${+p.repMin}` : `${+p.repMin}-${+p.repMax} range`;

/* ---------- dates as the engine's sentences say them (phase 3b, r52; moved unchanged from the legacy script, tests/moved.js holds them to r51's code) ---------- */

/* One Intl formatter per format, made once: toLocaleDateString builds a new
   one on every call, about a fifth of a Stats render (r46). Same output. */
export const DTF: Record<string, Intl.DateTimeFormat> = {};

/** The kept formatter for a format, made on first use. */
export const dtf = (k: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  DTF[k] || (DTF[k] = new Intl.DateTimeFormat(undefined, o));

/** A date (YYYY-MM-DD) in a kept format; empty for a date that does not parse. */
export const fmtWith = (k: string, o: Intl.DateTimeFormatOptions, s: string): string => {
  const d = parse(s);
  return isNaN(+d) ? '' : dtf(k, o).format(d);
};

/** A date as "Oct 17". */
export const fmtDate = (s: string): string => fmtWith('d', { month: 'short', day: 'numeric' }, s);
