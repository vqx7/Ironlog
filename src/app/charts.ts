/* Chart windows (phase 3a, r51; moved unchanged from the legacy script). Charts start where the data
   starts; the window chips widen them. */

import { isDate, daysBetween, weekStart, today, WEEK_DAYS } from './util';

/* The windows a chart's chips can pick, with their weeks. A saved choice is
   checked against these keys; rangeWeeks gives the weeks.
   'base' is the chart's own first window (8 weeks, 12 for the grid). */
export const RANGES: readonly (readonly [string, number])[] = [
  ['base', 0],
  ['6m', 26],
  ['all', Infinity]
];

/** The earliest date in a list of dated records (sessions, cardio, weigh-ins), or null. */
export function firstDate(list: readonly ({ date?: string | undefined } | null | undefined)[]): string | null {
  let f: string | null = null;
  // isDate has just checked x.date is a date string; it is not a type guard
  // (util.ts says why), so the two ! say so to TypeScript.
  for (const x of list) if (x && isDate(x.date) && (!f || x.date! < f)) f = x.date!;
  return f;
}

/** Weeks from the week of `first` to this week, both counted; 0 with no date. */
export function weeksSpan(first: string | null | undefined): number {
  return first ? Math.round(daysBetween(weekStart(first), weekStart(today())) / WEEK_DAYS) + 1 : 0;
}

/** The weeks the 6m chip shows, and the weeks a chart shows until a chip says otherwise. */
export const HALF_YEAR_WEEKS = 26,
  CHART_WEEKS = 8;

/** The weeks a window chip shows. */
export function rangeWeeks(k: string, base: number): number {
  return k === 'all' ? Infinity : k === '6m' ? HALF_YEAR_WEEKS : base;
}
