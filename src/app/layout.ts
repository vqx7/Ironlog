/* Which sections each tab has, in what order, and the choices that shape
   the screens: the accent, the volume views, the weeks the radar averages,
   the weigh-in cadence, the sheets that hold typed fields (phase 3a, r51;
   moved unchanged from the legacy script). */

import { parseJson } from './records';

// Dashboard sections, in display order. Keys are what the jump strip targets.
export const DSECS: readonly (readonly [string, string])[] = [
  ['volume', 'Volume'],
  ['exercise', 'Lifts'],
  ['weak', 'Muscles'],
  ['consistency', 'Consistency'],
  ['body', 'Body']
];

/** The keys alone, in the same order: a saved fold list keeps only these, and the jump strip orders them. */
export const DSEC_KEYS = DSECS.map(x => x[0]);

// Legacy: older builds saved folds here. A fresh state still starts with these and normalize keeps the
// list, so a save keeps its shape; nothing reads it.
export const DSEC_FOLDED: readonly string[] = ['consistency', 'body'];

// Old section keys still arrive from tiles, summary rows and the coach. They
// land on the section that absorbed them, opening the matching fold inside it.
export const DSEC_ALIAS: Readonly<Record<string, string>> = {
  stalls: 'exercise',
  prs: 'exercise',
  bests: 'exercise',
  rank: 'weak',
  svol: 'volume'
};

/* What Volume on Stats can show. Planned left Stats in r29 (V: Stats is what
   you did); the plan against the targets is Weekly volume on Plan. */
export const VOL_MODES: readonly (readonly [string, string])[] = [
  ['region', 'By region'],
  ['week', 'This week'],
  ['avg', 'Recent average'],
  ['trend', 'Weekly trend'],
  ['load', 'Load']
];

/* The layout a new install starts with (V, r28): every section folded,
   the extras hidden, and a line at the bottom of each tab that adds them
   back in one tap. Existing logs keep their own layout: these only seed a
   fresh state, and Settings > Layout's "Default layout" and "Reset section
   order" go back to them. Today leads with what a session needs (the
   workout, then the muscle map, then the week); Stats leads with Lifts. */
export const DEFAULT_HIDDEN: readonly string[] = [
  'today:tiles',
  'today:coach',
  'today:body',
  'program:schedule',
  'program:pvol'
];
export const DEFAULT_ORDER: Readonly<Record<string, readonly string[]>> = {
  today: ['session', 'map', 'week', 'injuries', 'coach', 'tiles', 'body'],
  dash: ['exercise', 'volume', 'weak', 'consistency', 'body']
};

/** A fresh copy of the default order, to store and edit. parseJson gives an unknown value;
    any, which would let anything through unchecked; the cast says what the
    copy is: DEFAULT_ORDER's shape, written out and read back. */
export const defaultOrder = (): Record<string, string[]> =>
  parseJson(JSON.stringify(DEFAULT_ORDER)) as Record<string, string[]>;

/** A saved order kept for the sections still present, each missing one placed after the one it follows. */
export function orderKeys(saved: readonly string[], present: readonly string[]): string[] {
  // Each key once, at its first place: r57 as first built could save one twice (its review).
  const order = saved.filter((k, i) => present.includes(k) && saved.indexOf(k) === i);
  present.forEach((k, i) => {
    if (order.includes(k)) return;
    const prev = present
      .slice(0, i)
      .reverse()
      .find(q => order.includes(q));
    order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, k);
  });
  return order;
}

// Sheets whose fields hold something typed. Search boxes in pickers do not count.
export const FORM_SHEETS: ReadonlySet<string> = new Set([
  'imp',
  'feedback',
  'account',
  'exEdit',
  'injury',
  'cardio',
  'quick',
  'note',
  'text',
  'routineNew',
  'inc',
  'max',
  'load',
  'reps',
  'cal',
  'walk'
]);

/* The accents Settings > General offers, as a key and a label.
   Ember is the default since r37 (V: "default to the orange ember one for now"): no accent stored reads as Ember. */
export const ACCENTS: readonly (readonly [string, string])[] = [
  ['ember', 'Ember'],
  ['blue', 'Blue'],
  ['volt', 'Volt'],
  ['pink', 'Pink']
];

/** The default accent, read when none is stored; choosing it again removes the stored one. */
export const ACCENT0 = 'ember';

/* The weeks the radar averages (r31.2, V: one week says little about
   balance): the last 2, 4 or 8 full weeks, 4 unless changed, kept per
   device. Fewer full weeks logged than chosen: those, said so; none yet:
   this week so far, said so. This week on its own is Volume's This week. */
export const REGION_WKS: readonly (readonly [number, string])[] = [2, 4, 8].map(n => [n, `${n} wk`] as const);
/** The weeks the radar averages until another is picked. */
export const REGION_WK_DEFAULT = 4;

/* Weigh-ins on a cadence (r34, V: at the start, then every two weeks or so,
   the time frame the lifter's to set). Bodyweight lifts use the latest
   weigh-in, so an old one keeps counting until a new one comes in. Every 7,
   14 (the default) or 30 days, or off (Settings > General); Later waits 2
   days on this device. A new install is asked on the Set up page instead. */
/** The weigh-in reminder's choices, in days, with their names; the default, BW_EVERY_DEFAULT, is kept absent, so saves from before r34 hash as before. */
export const BW_EVERY: readonly (readonly [0 | 7 | 14 | 30, string])[] = [
  [7, 'Every week'],
  [14, 'Every 2 weeks'],
  [30, 'Every month'],
  [0, 'Off']
];
/** How often the weigh-in reminder asks when it is unset, in days. */
export const BW_EVERY_DEFAULT = 14;
/** The choice a stored or chosen number of days names, kept only when it is not the default; undefined for the default or anything else. */
export function bwEveryKept(v: unknown): 0 | 7 | 30 | undefined {
  const c = BW_EVERY.find(([d]) => d === v);
  const d = c ? c[0] : undefined;
  return d === BW_EVERY_DEFAULT ? undefined : d;
}

/** The tabs whose sections keep an order and folds (phase 4, r56; moved from the legacy script). */
export const SEC_TABS: readonly string[] = ['today', 'program', 'dash', 'history', 'settings'];

/* Sections that can be hidden from Settings > Layout, as tab:key. Hidden
   sections are simply not shown; nothing stops being tracked. The routine
   days, the session list and Settings itself are never hideable, so there is
   always a way back. */
/** Each hideable section: its tab, its key and its name in Settings > Layout. */
export const HIDEABLE: readonly (readonly [string, string, string])[] = [
  ['today', 'week', 'This week'],
  ['today', 'tiles', 'At a glance'],
  ['today', 'coach', 'Coach'],
  ['today', 'injuries', 'Injuries'],
  ['today', 'map', 'Muscle map'],
  ['today', 'session', 'Workout preview'],
  ['today', 'body', 'Body'],
  ['program', 'library', 'Add exercises'],
  ['program', 'schedule', 'Schedule'],
  ['program', 'pvol', 'Weekly volume'],
  ['dash', 'volume', 'Volume'],
  ['dash', 'exercise', 'Lifts'],
  ['dash', 'weak', 'Muscles'],
  ['dash', 'consistency', 'Consistency'],
  ['dash', 'body', 'Body'],
  ['history', 'cardio', 'Cardio and mobility'],
  ['history', 'trash', 'Recently deleted'],
  ['settings', 'timer', 'Rest timer and logging'],
  ['settings', 'rir', 'Effort (RIR)'],
  ['settings', 'prio', 'Priority muscles'],
  ['settings', 'bands', 'Weekly set targets'],
  ['settings', 'more', 'More']
];
/** The hidden sections a tab's foot offers (r28): its hideable ones that are hidden, each that would show nothing now left out (`live` says which have something to show). */
export function moreList(
  tab: string,
  hidden: readonly string[],
  live: Readonly<Record<string, () => boolean>>
): (readonly [string, string, string])[] {
  return HIDEABLE.filter(([t, k]) => {
    const has = live[t + ':' + k];
    return t === tab && hidden.includes(t + ':' + k) && (!has || has());
  });
}
/** The hideable sections as tab:key. */
export const HIDEABLE_KEYS: ReadonlySet<string> = new Set(HIDEABLE.map(([t, k]) => t + ':' + k));
/** The tabs in Settings > Layout, with their names. */
export const HIDE_TABS: readonly (readonly [string, string])[] = [
  ['today', 'Today'],
  ['program', 'Plan'],
  ['dash', 'Stats'],
  ['history', 'History'],
  ['settings', 'Settings']
];
