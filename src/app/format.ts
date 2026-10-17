/* Words and numbers as the screens say them: dates, times, durations, rep
   ranges and counts (phase 3a, r51; moved unchanged from the legacy script,
   tests/moved.js holds them to r50's code). Durations are worded only by
   estMin, which tests/hygiene.js enforces. */

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
    // Formatting a time throws a RangeError where the browser cannot use the
    // locale or the options; the session then shows no time rather than failing.
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
