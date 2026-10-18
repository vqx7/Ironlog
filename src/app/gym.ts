/* Your gym (r33, item 207): the plates on hand, the dumbbell rack, the
   stack step, and how a saved gym is cleaned; and how plates load on an
   exercise (phase 3a, r51; moved unchanged from the legacy script,
   tests/moved.js holds them to r50's code). The steps the engine reads from
   them move with the engine. */

import type { Exercise } from './types';
import { r3 } from './util';
import { LB } from './units';
import { PLATE_SIDE_IDS } from './library';

/** A dumbbell rack as typed in Settings, in the gym's unit. */
export interface DbRack {
  lo: number;
  hi: number;
  st: number;
  fine?: number;
  fineTo?: number;
}

/** A saved gym, in the unit it is labelled in. */
export interface Gym {
  u: 'lb' | 'kg';
  db?: DbRack;
  kb?: number[];
  plates?: number[];
  stack?: number;
}

/** How plates load on an exercise, as chosen in the exercise editor. */
export const PLATE_MODES: readonly (readonly [string, string])[] = [
  ['auto', 'Automatic'],
  ['bar', 'Barbell: bar plus plates per side'],
  ['side', 'Plates per side, no bar'],
  ['sleeve', 'One sleeve (landmine)'],
  ['none', 'None']
];

/* The plates a gym may have, heaviest first, in its unit. A function, as it
   has been since r33, when normalize() ran on the first load before the
   constants of this part existed; in a module that no longer matters, and
   the form is kept so the move changes no code. */
export function gymPlates(u: string): number[] {
  return u === 'kg' ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
}

/** A gym or a rack as it arrives, from a save, a backup, another device, or
    the Settings form: any field may hold anything, so each is checked. */
type Raw = Partial<Record<string, unknown>> | null | undefined;

/* A gym cleaned for normalize() and the Settings form. Every field checked;
   anything out of range is dropped, never guessed. A gym with nothing left
   but its unit is null, so it is not stored. */
export function gymClean(g: Raw): Gym | null {
  if (!g || typeof g !== 'object' || (g.u !== 'lb' && g.u !== 'kg')) return null;
  const out: Gym = { u: g.u };
  // Unary plus turns whatever is there into a number or NaN; TypeScript
  // refuses it on an unknown value, hence the cast.
  const n = (v: unknown): number => {
    const x = +(v as number);
    return isFinite(x) ? Math.round(x * 1000) / 1000 : NaN;
  };
  // g.db is whatever was stored or typed in Settings; the cast lets the lines
  // below test its fields, each of which is read through n().
  const d = g.db as Raw;
  if (d && typeof d === 'object') {
    const lo = n(d.lo),
      hi = n(d.hi),
      st = n(d.st),
      fine = n(d.fine),
      fineTo = n(d.fineTo);
    if (lo > 0 && hi >= lo && hi <= 500 && st > 0 && st <= 50) {
      const db: DbRack = { lo, hi, st };
      if (fine > 0 && fine < st && fineTo > lo) {
        db.fine = fine;
        db.fineTo = Math.min(fineTo, hi);
      }
      if (dbListOf(db)) out.db = db;
    }
  }
  if (Array.isArray(g.kb)) {
    // Array.isArray turns an unknown into any[]; the cast keeps each entry unknown until n() reads it.
    const kb = [...new Set((g.kb as unknown[]).map(n).filter(x => x > 0 && x <= 300))]
      .sort((a, b) => a - b)
      .slice(0, 40);
    if (kb.length) out.kb = kb;
  }
  if (Array.isArray(g.plates)) {
    const all = gymPlates(g.u);
    // Inside the callback TypeScript no longer knows g.plates is an array, hence the cast.
    const pl = all.filter(x => (g.plates as unknown[]).map(n).includes(x));
    if (pl.length) out.plates = pl;
  }
  {
    const st = n(g.stack);
    if (st > 0 && st <= 100) out.stack = st;
  }
  return Object.keys(out).length > 1 ? out : null;
}

/** A gym number in kilograms. */
export const gymK = (g: Pick<Gym, 'u'>, v: number): number => (g.u === 'kg' ? v : v * LB);

/* Dumbbells as typed in Settings: from, to, a step, and optionally a
   smaller step up to some weight (5 to 25 by 2.5, then 5s to 120). Returns
   the weights, lightest first, or null when the fields do not make a rack.
   The form also passes a rack still being typed, with fields missing: a
   comparison with a missing field is false, so the first line refuses it.
   The smaller step's two fields are optional and read the same way, which
   is what the two casts say, and the two ! after them: each field is used
   only once it is above 0. */
// More than 300 weights is a typo (0.5 to 200 by 0.5), refused rather than cut short.
export function dbListOf(d: DbRack | null | undefined): number[] | null {
  if (!d || !(d.lo > 0) || !(d.hi >= d.lo) || !(d.st > 0)) return null;
  const out: number[] = [];
  let v = d.lo;
  while (v <= d.hi + 1e-6) {
    if (out.length >= 300) return null;
    out.push(r3(v));
    v = r3(v + ((d.fine as number) > 0 && (d.fineTo as number) > 0 && v < d.fineTo! - 1e-6 ? d.fine! : d.st));
  }
  return out;
}

/** How plates load on an exercise: its own choice, else by its equipment. */
export function platesMode(ex: Pick<Exercise, 'id' | 'bw' | 'equip' | 'plates'>): string {
  if (ex.plates) return ex.plates;
  if (ex.bw) return 'none';
  if (ex.equip === 'barbell') return 'bar';
  if (ex.equip === 'landmine') return 'sleeve';
  if (PLATE_SIDE_IDS.includes(ex.id)) return 'side';
  return 'none';
}
