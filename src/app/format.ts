/* Words and numbers as the screens and the engine's sentences say them:
   dates, times, durations, rep ranges and counts (phase 3a, r51, and the
   date words the engine uses in 3b, r52; moved unchanged from the legacy
   script). Durations are worded only by estMin, which
   tests/hygiene.js enforces. Layer 2 since r52, beside the engine whose
   sentences use it; a few words here read the clock (fmtDateRow, todayEye,
   greeting) and so may never be reached from the engine (tests/hygiene.js). */

import { parse, today, yearOf, r1, r3 } from './util';
import { isMissed } from './formulas';
import { EFFORT_TOP } from './records';

/* ---------- dates and times ---------- */

// History rows sit under a week header, so the year only shows when it is not this one.
export const fmtDateRow = (s: string): string =>
  parse(s).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(yearOf(s) === yearOf(today()) ? {} : { year: 'numeric' })
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
export function sessTm(x: { t?: number | null | undefined }): string {
  try {
    return x.t ? new Date(x.t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  } catch (e) {
    // A guard only: with these options a number does not make it throw (a time
    // out of range gives "Invalid Date" instead, PENDING 308); if an engine
    // did throw, the session shows no time rather than breaking History.
    return '';
  }
}

/** The greeting on Today by the hour each part of the day ends at; past the last, and before the first, Evening. */
const GREETINGS: readonly { readonly until: number; readonly word: string }[] = [
  { until: 5, word: 'Evening' },
  { until: 12, word: 'Morning' },
  { until: 17, word: 'Afternoon' }
];

/* The greeting on Today, when a name is set in Settings > General. */
export function greeting(): string {
  const h = new Date().getHours();
  return (GREETINGS.find(g => h < g.until) || { word: 'Evening' }).word;
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

/* Rounded to MIN_STEP minutes, as in the routine picker (r32, from the third
   review: the picker said 55 to 75 min and Today "about 77 min" for the same
   day), and so is the time left in a session; under MIN_STEP_FROM minutes, to
   the minute. The budget is compared before rounding. */
/** The step estimated minutes are rounded to, and the minutes from which they are. */
const MIN_STEP = 5,
  MIN_STEP_FROM = 10;
/** Estimated minutes, rounded as above (at least 1). */
export const min5 = (m: number): number =>
  m >= MIN_STEP_FROM ? Math.round(m / MIN_STEP) * MIN_STEP : Math.max(1, Math.round(m));

/* Every estimated duration on screen is written here and nowhere else (V,
   r42: "~75 min", never "about"). Callers round first, as each did before;
   this only words the number. tests/hygiene.js fails on the wording typed
   anywhere else in the source. */
export const estMin = (n: number): string => `~${n} min`;

/** Where a time in ISO form (YYYY-MM-DDTHH:MM:SS) holds its month, day, hour and minute, MM-DDTHH:MM. */
const STAMP_FROM = 5,
  STAMP_TO = 16;
/** A time in ISO form as its date and time without the year: "10-25 18:44". */
export const stampShort = (t: string): string => t.slice(STAMP_FROM, STAMP_TO).replace('T', ' ');

/* ---------- numbers and ranges ---------- */

/* Nothing logged yet (r34, V): a dash, not a row of zeros. A count of 0
   once there is a log is real and stays a number. */
export const NIL = '–';

/** A missed set's mark after the set (r55, V: "300 × 0, missed"), in
    History, the Last line and wherever a saved set is listed. */
export const missedTag = (s: { r: number | string | null }): string => (isMissed(s) ? ' missed' : '');

/** Said when a sheet with something typed in it is asked to close by a tap outside it or by Back (r55: Back closed it unasked). */
export const DIRTY_SAID = 'Save or cancel first. Your changes are still here.';

/** Said once when a set is ticked as missed (r55). */
export const MISSED_SAID = 'Logged as missed. It counts toward no volume, PRs, or targets.';

/** A number to at most three decimals, without trailing zeros. */
export const fmtG = (v: number): string => String(r3(v));

// A rep range in words and labels: "5" when both ends are the same (r31: "5-5", "5×5-5").
export const repSpan = (lo: number | string, hi: number | string, sep = ' to '): string =>
  +lo === +hi ? `${+lo}` : `${+lo}${sep}${+hi}`;

/** A plan's reps as a phrase: "target of 5" or "8-12 range". */
export const rangeWords = (p: { repMin: number | string; repMax: number | string }): string =>
  +p.repMin === +p.repMax ? `target of ${+p.repMin}` : `${+p.repMin}-${+p.repMax} range`;

/* ---------- dates as the engine's sentences say them (phase 3b, r52; moved unchanged from the legacy script) ---------- */

/* One Intl formatter per format, made once: toLocaleDateString builds a new
   one on every call, about a fifth of a Stats render (r46). Same output. */
export const DTF: Record<string, Intl.DateTimeFormat> = {};

/** The kept formatter for a format, made on first use. */
const dtf = (k: string, o: Intl.DateTimeFormatOptions): Intl.DateTimeFormat =>
  DTF[k] || (DTF[k] = new Intl.DateTimeFormat(undefined, o));

/** A date (YYYY-MM-DD) in a kept format; empty for a date that does not parse. */
export const fmtWith = (k: string, o: Intl.DateTimeFormatOptions, s: string): string => {
  const d = parse(s);
  return isNaN(+d) ? '' : dtf(k, o).format(d);
};

/** A date as "Oct 17". */
export const fmtDate = (s: string): string => fmtWith('d', { month: 'short', day: 'numeric' }, s);

/* ---------- effort ---------- */

/* The effort scale a setting names: half points or RPE, else whole RIR
   (r33, item 206). One rule for the screens (rirScale, src/app/effort.ts)
   and the engine's sentences (r54, from the audit V asked for: on the RPE
   scale, the reason behind a target said "RIR 4 at 40 kg against a target of
   1" under a header reading @RPE 9). */
/** The effort scale a setting's value names. */
export function effScale(v: unknown): 'whole' | 'half' | 'rpe' {
  return v === 'half' || v === 'rpe' ? v : 'whole';
}

/* What is stored is always RIR; RPE is EFFORT_TOP less it. One decimal, so
   half points show as they were entered. */
/** An effort, stored as RIR, as shown in a scale. */
export function effAt(scale: 'whole' | 'half' | 'rpe', rir: number): string {
  return scale === 'rpe' ? String(r1(EFFORT_TOP - rir)) : String(r1(rir));
}

/* A lighter day, a deload and a flagged injury ask for 3 or more reps in
   reserve (r30, a convention), said here once and in the lifter's scale
   (r55, from the audit: on a lighter day the session header said the plan's
   1 RIR beside the engine's "3 or more reps in reserve"). */
/** The reps in reserve a lighter day, a deload or an injury hold asks for at least. */
export const LIGHT_RIR = 3;

/** That effort or easier in a sentence: "3 or more reps in reserve", or "RPE 7 or less". */
export const effLeast = (scale: 'whole' | 'half' | 'rpe', rir: number): string =>
  scale === 'rpe' ? `RPE ${effAt(scale, rir)} or less` : `${effAt(scale, rir)} or more reps in reserve`;

/** The same for a session header: "3+ RIR", or "RPE 7 or less". */
export const effLeastShort = (scale: 'whole' | 'half' | 'rpe', rir: number): string =>
  scale === 'rpe' ? `RPE ${effAt(scale, rir)} or less` : `${effAt(scale, rir)}+ RIR`;
