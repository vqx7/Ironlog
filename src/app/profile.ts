/* Your training (r44, item 271, with items 43 and 44): the profile's choices,
   its focus numbers, how a saved profile is cleaned, and its tips (phase 3a,
   r51; moved unchanged from the legacy script). The rules that apply a profile to a plan move with the
   engine. Since r54 the app's own weekly targets too: a muscle's default with
   the profile, the floors a first-run routine pick records, and the refit of
   floors recorded by the reading of a cycle's plan before r54. */

import type { MuscleKey, Profile, Routine } from './types';
import type { Model } from './model';
import { activeRoutineIn, profIn } from './model';
import { BANDS, MK, TARGETED, TRACK_ONLY } from './library';
import { plannedSetsIn, weekFactor } from './routines';

/* The profile (r44): its choices, read by normalize while the save loads. */

/** The goals a profile can name, each with its label on screen. */
export const PROF_GOALS: readonly (readonly [string, string])[] = [
  ['size', 'Size'],
  ['strength', 'Strength'],
  ['both', 'Both']
];

/** Years lifting, as the profile's choices and their labels on screen. */
export const PROF_EXP: readonly (readonly [string, string])[] = [
  ['new', 'Under 1'],
  ['mid', '1 to 3'],
  ['adv', 'Over 3']
];

/** The training days a week a profile can name. */
export const PROF_DAYS: readonly number[] = [2, 3, 4, 5, 6];

/** The most focus muscles a profile can name. */
export const FOCUS_MAX = 2;

/* Focus muscles (item 43): weekly targets about 30% higher, the other major
   muscles at maintenance, a third of the usual minimum. More weekly sets
   grow a muscle more (Pelland 2025, the dose-response meta-regression the
   targets rest on); 30% is a convention, not a measured dose. Size and
   strength were kept for months on a third of the volume when load stayed
   up (Bickel 2011; Spiering 2021 review). */
export const FOCUS_UP = 1.3,
  MAINT_SHARE = 1 / 3;

/* A saved profile cleaned for normalize(): each choice kept only when it is
   one of the choices above, and focus muscles only when they are muscles
   with a target (not tracked-only), once each and at most FOCUS_MAX; null
   when nothing is left. The choices are checked by membership, which
   TypeScript cannot follow; the casts stand for those checks.

   Built in one key order, absent keys left out, so a save hashes the same
   every time and a phone without the profile syncs nothing new. (Until r51
   the choices above sat in an earlier part than this function, because
   normalize read them while the save loaded; in a module they are defined
   before any of the app runs.) */
export function profClean(p: Partial<Record<string, unknown>> | null | undefined): Profile | null {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const o: Profile = {};
  if (PROF_GOALS.some(g => g[0] === p.goal)) o.goal = p.goal as string;
  if (PROF_EXP.some(g => g[0] === p.exp)) o.exp = p.exp as string;
  if (PROF_DAYS.includes(p.days as number)) o.days = p.days as number;
  const f = Array.isArray(p.focus)
    ? [
        ...new Set(
          // Array.isArray turns an unknown into any[]; the cast keeps each entry unknown for the test below.
          (p.focus as unknown[]).filter(
            // The type predicate is a cast, and true: typeof says m is a string.
            (m: unknown): m is string =>
              typeof m === 'string' && (MK as readonly string[]).includes(m) && !TRACK_ONLY.has(m)
          )
        )
      ].slice(0, FOCUS_MAX)
    : [];
  if (f.length) o.focus = f;
  return Object.keys(o).length ? o : null;
}

/* Strength focus in Pick for me (item 44): with Strength as the goal, a
   barbell or machine compound you have logged, not trained for 5 days or
   more and recovered, is favoured when it is stalled or near its best
   (within 3%, the app's threshold for a real change). The ranking without
   a Strength goal is unchanged. */
export const STR_REST = 5,
  STR_NEAR = 0.97;

/** The tips beside the profile's Goal and Years lifting (in Settings and in
    the routine picker on a first run) and Focus muscles (in Settings). */
export const PROF_GOAL_TIP =
  "Size keeps the app's defaults. Strength: new barbell, Smith, and machine compounds start at 3 to 6 reps, 2 in reserve, 3 minutes' rest. Heavier loads gave more strength for similar growth (Schoenfeld 2017; ACSM 2009), and 3 minutes' rest beat 1 (Schoenfeld 2016). Both starts them at 5 to 8; that and the 2 in reserve are conventions. Strength also favours stalled or near-best compounds in Pick for me. Your routine changes only with Apply.";
export const PROF_EXP_TIP =
  'Under 1 year, whatever the goal: new exercises start at 8 to 12 reps (ACSM 2009). Compounds stop 3 reps short and isolation lifts 2, as in the beginner plan, a convention: easier to judge, further from failure. Apply raises reps in reserve to that and keeps your ranges.';
export const PROF_FOCUS_TIP =
  'Up to two. Their weekly targets go up about 30% and the other major muscles drop to maintenance, a third of the usual minimum (size and strength held on a third of the volume: Bickel 2011, Spiering 2021). Only targets you have not typed move, and taking a focus off puts them back. Pick for me favours them.';

/* ---------- The app's own weekly targets (r44; moved from the legacy script in r54) ---------- */

/** A muscle's weekly target with a profile (the current one unless given; the defaults with no focus). */
export function defBandIn(M: Model, m: MuscleKey, p?: Profile | null): [number, number] {
  const b = BANDS[m];
  const f = (p || profIn(M)).focus || [];
  if (!f.length || TRACK_ONLY.has(m)) return [b[0], b[1]];
  if (f.includes(m)) return [Math.round(b[0] * FOCUS_UP), Math.round(b[1] * FOCUS_UP)];
  return [Math.ceil(b[0] * MAINT_SHARE), b[1]];
}

/* The app's own target for a muscle (r44): the profile's default, brought
   down to the floor a first-run routine pick recorded (settings.bandsFit,
   or the floors given), except on a focus muscle, whose raised target is
   the point. A target that reads anything else was typed and never moves;
   typed back to this number, it is the app's again. Nothing is guessed: the
   floors are the one fact that cannot be worked out later, so fitTargets
   stores them (the r44 review found four bugs in inferring them). */
/** A muscle's target as the app sets it, with a profile (the current one unless given) and floors (the recorded ones unless given). */
export function appBandIn(
  M: Model,
  m: MuscleKey,
  p?: Profile | null,
  fit?: Partial<Record<MuscleKey, number>> | null
): [number, number] {
  const q = p || profIn(M);
  const d = defBandIn(M, m, q);
  const f = (fit === undefined ? M.s.settings.bandsFit : fit) || {};
  const lo = f[m];
  return lo == null || TRACK_ONLY.has(m) || (q.focus || []).includes(m) ? d : [Math.min(d[0], lo), d[1]];
}

/* Whether a muscle has a weekly target (339 e, V 2026-10-24, r58): one of
   TARGETED, which lifters train directly for size, or one the lifter gave a
   target: with Set a target in Weekly set targets (settings.ownTargets), by
   naming it a focus in Your training, or by a target typed before r58 (one
   other than the app's own, appBandIn: r44's reading of a typed target, so
   it counts as it did). Before r58 a target typed on one of TRACK_ONLY's
   four never counted, so it does not now either. A muscle with none is
   counted and shown, and never reads under or over. The one rule every
   screen reads. */
/** Whether a muscle has a weekly target, by its key; false for a key that is no muscle. */
export function hasTargetIn(M: Model, m: string): boolean {
  const k = MK.find(x => x === m);
  if (!k) return false;
  if (TARGETED.has(k)) return true;
  const s = M.s.settings;
  if ((s.ownTargets || []).includes(k) || (profIn(M).focus || []).includes(k)) return true;
  if (TRACK_ONLY.has(k)) return false;
  const a = appBandIn(M, k),
    b = s.bands[k];
  return b[0] !== a[0] || b[1] !== a[1];
}

/* The floors a first-run pick of a routine records (fitTargets, r29 and
   r44): each muscle's planned hard sets a week in whole sets, where under
   both its default minimum and the profile's, never on a tracked-only
   muscle. With `actual` (a routine made from an import, r31), no floor above
   what the log itself averaged on a muscle the routine trains. `share` reads
   the plan another way, as plannedSetsIn does. Built in muscle order, as
   normalize keeps them. */
/** The floors a first-run pick of a routine records as settings.bandsFit. */
export function fitFloorsIn(
  M: Model,
  R: Routine,
  actual?: Readonly<Record<string, number>> | null,
  share?: number
): Partial<Record<MuscleKey, number>> {
  const plan = plannedSetsIn(M, R, share);
  const fit: Partial<Record<MuscleKey, number>> = {};
  for (const m of MK) {
    if (TRACK_ONLY.has(m)) continue;
    let lo = Math.floor(plan[m] || 0);
    if (actual && (plan[m] || 0) > 0) lo = Math.min(lo, Math.floor(actual[m] || 0));
    if (lo < BANDS[m][0] && lo < defBandIn(M, m)[0]) fit[m] = lo;
  }
  return fit;
}

/* Two sets of floors, or two targets, alike. */
const sameFloors = (a: Partial<Record<MuscleKey, number>>, b: Partial<Record<MuscleKey, number>>): boolean =>
  MK.every(m => a[m] === b[m]);
const sameBand = (a: readonly number[], b: readonly number[]): boolean => a[0] === b[0] && a[1] === b[1];

/* Targets a first-run pick fitted to a cycle before r54 follow the plan as
   r54 reads it (the review of r54). Until r54 each day of a cycle not 7 days
   long came round 7 divided by its length times a week (weekFactor), so
   Strength 5 x 5 planned three and a half sessions' worth, and a first-run
   pick fitted chest, triceps and upper back to 8 and four muscles to 4.
   Since r54 it plans the three whole sessions a week counts as on plan
   (dayShare): 7.5 and 3.75, so a lifter doing every planned set read below
   targets the app had set and was told to add sets. When the floors
   recorded are exactly that reading's for the routine in use, each target
   still at the app's own number (appBandIn) moves to the number r54's
   floors give, and r54's floors are recorded; a target typed since stays.
   With no floors recorded (a pick before r44 on a phone that has not run
   r44 to r53 since), every target must read that fit, as fitRecordOld asks
   of r54's own. Once: afterwards the floors recorded are r54's. Read at
   start on the device's own state, never in normalize, which also runs
   inside the sync comparison and Undo. */
/** The targets and floors that move from a fit by the plan's reading before r54 to r54's, or null when nothing does. */
export function refitIn(
  M: Model
): { bands: Partial<Record<MuscleKey, [number, number]>>; fit: Partial<Record<MuscleKey, number>> } | null {
  const R = activeRoutineIn(M);
  if (R.schedule === 'weekly') return null;
  const s = M.s.settings;
  const was = fitFloorsIn(M, R, null, weekFactor(R)),
    now = fitFloorsIn(M, R);
  if (sameFloors(was, now)) return null;
  if (
    s.bandsFit
      ? !sameFloors(s.bandsFit, was)
      : !!s.profile || !MK.every(m => sameBand(s.bands[m], appBandIn(M, m, null, was)))
  )
    return null;
  const bands: Partial<Record<MuscleKey, [number, number]>> = {};
  for (const m of MK) {
    if (TRACK_ONLY.has(m)) continue;
    const o = appBandIn(M, m, null, was);
    if (!sameBand(s.bands[m], o)) continue;
    const n = appBandIn(M, m, null, now);
    if (!sameBand(n, o)) bands[m] = n;
  }
  return { bands, fit: now };
}
