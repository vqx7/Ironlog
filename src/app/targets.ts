/* The weekly set targets fitted to a routine on a first run (r29, V:
   "targets that can actually be met"; moved from the legacy script's
   15-analytics.js in r63). When a new person picks a ready-made routine,
   imports their log or loads the demo, and the weekly targets are still the
   defaults, each muscle's minimum comes down to what the routine plans
   (whole sets), so following it is on target. The maximums and the
   evidence-based defaults stay as they are for everyone else; Settings,
   Weekly set targets raises them as sets are added. These change the log:
   each is called inside a change given to `act`, or once at start on this
   device's own state. */

import { BANDS, MK, TRACK_ONLY } from './library';
import { defaultRoutine } from './routines';
import type { NewRoutine } from './routines';
import type { Routine } from './types';
import { starterRoutine } from './normalize';
import { activeRoutine, defBand, fitFloors, plannedSets, prof } from './live';
import { state } from './store';

/* Targets fitted before r44 recorded no floors (r44 review): once, on this
   device's state at start, when every target is exactly what a first-run
   pick of the routine in use, the starter or the old default gives, record
   those floors. Any target that differs (typed) leaves it alone. Not in
   normalize, which also runs inside the sync comparison and Undo. */
/** Records the floors of a fit made before r44; whether it did. */
export function fitRecordOld(): boolean {
  const s = state.settings;
  if (s.bandsFit || s.profile) return false;
  const b = s.bands;
  for (const R of [activeRoutine(), starterRoutine(), defaultRoutine()]) {
    if (!R) continue;
    const p = plannedSets(R);
    const fit: Record<string, number> = {};
    let ok = true;
    for (const m of MK) {
      const d = BANDS[m];
      const lo = TRACK_ONLY.has(m) ? d[0] : Math.min(d[0], Math.floor(p[m] || 0));
      if (b[m][0] !== lo || b[m][1] !== d[1]) {
        ok = false;
        break;
      }
      if (lo < d[0]) fit[m] = lo;
    }
    if (ok && Object.keys(fit).length) {
      s.bandsFit = fit;
      return true;
    }
  }
  return false;
}

/** Fits the weekly targets to a routine on a first run (with what the log averaged, for a routine made from an import); whether a target changed. */
export function fitTargets(
  R: Routine | NewRoutine | null | undefined,
  actual?: Readonly<Record<string, number>> | null
): boolean {
  if (!R) return false;
  const b = state.settings.bands;
  /* Still the defaults, or the defaults fitted to the starter routine (r31:
     Log a workout now fits them to the starter, and an import or a pick
     after that left targets measured against a routine no longer used). */
  const same = (x: Readonly<Record<string, readonly number[]>>) =>
    MK.every(m => b[m] && b[m][0] === x[m][0] && b[m][1] === x[m][1]);
  /* The defaults are the profile's (r44): with focus muscles set, those
     targets are where a first-run pick starts. With no profile they are BANDS. */
  const D: Record<string, readonly number[]> = {};
  for (const m of MK) D[m] = defBand(m);
  const foc = new Set(prof().focus || []);
  const fitOf = (r: Routine | NewRoutine): Record<string, readonly number[]> => {
    const p = plannedSets(r);
    const o: Record<string, readonly number[]> = {};
    for (const m of MK)
      o[m] = TRACK_ONLY.has(m) || foc.has(m) ? D[m] : [Math.min(D[m][0], Math.floor(p[m] || 0)), D[m][1]];
    return o;
  };
  if (!same(D) && ![starterRoutine(), defaultRoutine()].some(r => same(fitOf(r)))) return false;
  const was = JSON.stringify(MK.map(m => b[m]));
  for (const m of MK) b[m] = [D[m][0], D[m][1]];
  /* actual (a routine made from an import, r31): no minimum above what the
     log itself averaged on a muscle the routine trains. A cycle's planned
     sets a week and the weeks as trained never match exactly (2 days
     alternating, 3 sessions a week, plans 2.8), and the review saw "Abs
     below target, add a set to Plank" measured against the lifter's own
     program. A focus muscle keeps its raised target (r44): raising it is
     the point of the focus. Each floor is recorded (settings.bandsFit), so a
     later focus change knows which targets are the app's; a focus muscle's
     floor is recorded too, though not applied while it is a focus, so
     taking the focus off later brings it to the plan (the r44 review). The
     floors are fitFloors' (profile.ts, r54), the one rule the refit of an
     older fit reads too. */
  const fit = fitFloors(R, actual);
  for (const m of MK) {
    const lo = fit[m];
    if (lo != null && !foc.has(m)) b[m] = [lo, b[m][1]];
  }
  if (Object.keys(fit).length) state.settings.bandsFit = fit;
  else delete state.settings.bandsFit;
  return JSON.stringify(MK.map(m => b[m])) !== was;
}
