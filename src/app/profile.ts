/* Your training (r44, item 271, with items 43 and 44): the profile's choices,
   its focus numbers, how a saved profile is cleaned, and its tips (phase 3a,
   r51; moved unchanged from the legacy script, tests/moved.js holds them to
   r50's code). The rules that apply a profile to a plan move with the
   engine. */

import { MK, TRACK_ONLY } from './library';

/* The profile (r44): its choices, read by normalize while the save loads. */
export const PROF_GOALS: readonly (readonly [string, string])[] = [
  ['size', 'Size'],
  ['strength', 'Strength'],
  ['both', 'Both']
];

export const PROF_EXP: readonly (readonly [string, string])[] = [
  ['new', 'Under 1'],
  ['mid', '1 to 3'],
  ['adv', 'Over 3']
];

export const PROF_DAYS: readonly number[] = [2, 3, 4, 5, 6];

/** Focus muscles a profile can name. */
export const FOCUS_MAX = 2;

/* Focus muscles (item 43): weekly targets about 30% higher, the other major
   muscles at maintenance, a third of the usual minimum. More weekly sets
   grow a muscle more (Pelland 2025, the dose-response meta-regression the
   targets rest on); 30% is a convention, not a measured dose. Size and
   strength were kept for months on a third of the volume when load stayed
   up (Bickel 2011; Spiering 2021 review). */
export const FOCUS_UP = 1.3,
  MAINT_SHARE = 1 / 3;

/** A saved profile as normalize() keeps it. */
export interface Profile {
  goal?: string;
  exp?: string;
  days?: number;
  focus?: string[];
}

/* Built in one key order, absent keys left out, so a save hashes the same
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
          (p.focus as unknown[]).filter(
            (m): m is string => typeof m === 'string' && MK.includes(m as never) && !TRACK_ONLY.has(m)
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

export const PROF_GOAL_TIP =
  "Size keeps the app's defaults. Strength: new barbell, Smith, and machine compounds start at 3 to 6 reps, 2 in reserve, 3 minutes' rest. Heavier loads gave more strength for similar growth (Schoenfeld 2017; ACSM 2009), and 3 minutes' rest beat 1 (Schoenfeld 2016). Both starts them at 5 to 8; that and the 2 in reserve are conventions. Strength also favours stalled or near-best compounds in Pick for me. Your routine changes only with Apply.";

export const PROF_EXP_TIP =
  'Under 1 year, whatever the goal: new exercises start at 8 to 12 reps (ACSM 2009). Compounds stop 3 reps short and isolation lifts 2, as in the beginner plan, a convention: easier to judge, further from failure. Apply raises reps in reserve to that and keeps your ranges.';

export const PROF_FOCUS_TIP =
  'Up to two. Their weekly targets go up about 30% and the other major muscles drop to maintenance, a third of the usual minimum (size and strength held on a third of the volume: Bickel 2011, Spiering 2021). Only targets you have not typed move, and taking a focus off puts them back. Pick for me favours them.';
