/* Your gym (r33, item 207): the plates on hand, the dumbbell rack, the
   stack step, and how a saved gym is cleaned; and how plates load on an
   exercise (phase 3a, r51; moved unchanged from the legacy script). The steps the engine reads from
   them move with the engine. */

import type { DbRack, Exercise, Gym, Plan } from './types';
import type { ExerciseLike, Model } from './model';
import { isNum, r3 } from './util';
import { LB, stepReadIn, unitStepIn } from './units';
import { ONE_DB, PLATE_SIDE_IDS, loadMode, rackKind } from './library';
import { UIn, gymOfIn } from './model';

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

/* ---------- the steps the engine reads from Your gym (phase 3b, r52; moved from the legacy script) ---------- */

/* The loads this lift can be done at, in kg, lightest first, or null: only
   dumbbell and kettlebell lifts, with no step of their own, logged as the
   weight of one bell (per dumbbell, or one dumbbell held). */
export function gymRackIn(
  M: Model,
  ex: ExerciseLike | null | undefined,
  plan?: Pick<Plan, 'inc'> | null
): number[] | null {
  const g = gymOfIn(M);
  if (!g || !ex || ex.bw || ex.assist || ex.timed || ex.inc != null) return null;
  if (plan && isNum(+plan.inc) && Math.abs(stepReadIn(M, +plan.inc) - unitStepIn(M)) > 1e-6) return null;
  const k = rackKind(ex);
  if (!k) return null;
  const m = loadMode(ex);
  if (!(m === 'each' || (m === 'total' && (ex.load == null || ONE_DB.has(ex.id))))) return null;
  const L = k === 'dumbbell' ? dbListOf(g.db) : Array.isArray(g.kb) && g.kb.length ? g.kb : null;
  return L && L.length ? L.map(v => gymK(g, v)) : null;
}

/* A load typed as shown on screen is within half the last shown digit of
   the bell it means: an 8 kg dumbbell is shown as 17.6 lb, which is 7.983 kg
   (review of r33). Rack comparisons use this, so a bell typed as shown is
   that bell, never "0.02 kg under the next one". */
/* A load typed for a bell is that bell when it is nearer to it than to
   its neighbours (r34.2, from the review: a 16 kg dumbbell typed as 35 lb,
   15.88 kg, read as just under itself, and the "step up" was the same bell,
   "add 0.3 lb"). Within 45% of the gap around the bell; never less than half
   the last shown digit. Bounds a load must not pass (the target, the cap)
   keep the narrow tolerance. The filter keeps only gaps above 0, which
   TypeScript cannot follow into Math.min, hence the cast to numbers. */
export function rackTolIn(M: Model, L?: readonly number[] | null, at?: number | null): number {
  const base = UIn(M) === 'lb' ? 0.05 * LB : 0.05;
  if (!L || !L.length || at == null || !isNum(at)) return base;
  let i = 0;
  for (let k = 1; k < L.length; k++) if (Math.abs(L[k] - at) < Math.abs(L[i] - at)) i = k;
  const gs = [i > 0 ? L[i] - L[i - 1] : null, i < L.length - 1 ? L[i + 1] - L[i] : null].filter(
    g => g != null && g > 0
  ) as number[];
  const gap = gs.length ? Math.min(...gs) : 0;
  return Math.abs(L[i] - at) <= Math.max(base, 0.45 * gap) ? Math.max(base, Math.abs(L[i] - at) + 1e-6) : base;
}

// The step up from `at` on the rack; with no load to step from, its most common spacing.
export function rackGapIn(M: Model, L: readonly number[], at?: number | null): number {
  if (L.length < 2) return L[0] || 0;
  if (at != null) {
    const t = rackTolIn(M, L, at);
    const nx = L.find(x => x > at + t);
    if (nx != null) return nx - at;
    return L[L.length - 1] - L[L.length - 2];
  }
  const gs = L.slice(1).map((x, i) => r3(x - L[i]));
  const c: Record<number, number> = {};
  let best = gs[0];
  for (const v of gs) {
    c[v] = (c[v] || 0) + 1;
    if (c[v] > c[best]) best = v;
  }
  return best;
}

/* Gym-wide steps for other lifts: two of the smallest plate on hand for a
   bar or a two-sleeve machine logged as the total (leg press, hack squat),
   one for a landmine's single sleeve or a lift logged per side, a stack its
   own step. A gym without a stack step has none, and an absent step compares
   false with 0, which the cast lets TypeScript accept; past that test the
   step is there, as the ! says. */
export function gymStepIn(M: Model, ex: ExerciseLike | null | undefined): number | null {
  const g = gymOfIn(M);
  if (!g || !ex || ex.bw || ex.timed) return null;
  const pm = platesMode(ex),
    m = loadMode(ex);
  if (Array.isArray(g.plates) && g.plates.length && pm !== 'none') {
    const mn = Math.min(...g.plates);
    return gymK(g, m === 'side' || pm === 'sleeve' ? mn : 2 * mn);
  }
  if (m === 'stack' && (g.stack as number) > 0) return gymK(g, g.stack!);
  return null;
}

/* The heaviest available: the exercise's own, else the top of the rack. A
   lift logged above the top of the rack is on bells the rack does not list
   (another gym, a rack set wrong), so the rack is no cap for it (review). */
export function capOfIn(
  M: Model,
  ex: ExerciseLike,
  plan?: Pick<Plan, 'inc'> | null,
  top?: number | null
): number | null {
  const L = gymRackIn(M, ex, plan);
  let r = L ? L[L.length - 1] : null;
  if (r != null && top != null && top > r + rackTolIn(M, L, top)) r = null;
  return ex.maxLoad != null ? (r != null ? Math.min(ex.maxLoad, r) : ex.maxLoad) : r;
}

// At the cap: within the rack's tolerance when the cap is the rack's.
export function atCapOfIn(
  M: Model,
  ex: ExerciseLike,
  plan: Pick<Plan, 'inc'> | null | undefined,
  top: number,
  cap: number | null
): boolean {
  const L = gymRackIn(M, ex, plan);
  return (
    cap != null && top >= cap - (L && (ex.maxLoad == null || cap < ex.maxLoad - 1e-6) ? rackTolIn(M, L, top) : 1e-6)
  );
}

/* The bar an exercise is loaded on: its own (a trap bar, an EZ bar) when set
   in the exercise editor, else the bar in Settings. An exercise without its
   own bar has none, and an absent bar compares false with 0, which the cast
   lets TypeScript accept; past that test the bar is there, as the ! says. */
export function exBarKgIn(M: Model, ex: ExerciseLike | null | undefined): number {
  return ex && (ex.barKg as number) > 0 ? ex.barKg! : barKgIn(M);
}

/* The default bar is the gym's: a 20 kg bar in a gym labelled in kg, 45 lb in one in lb,
   whatever unit the app shows (r34.2: a kg gym with the app in lb was given a 45 lb bar). */
export function barKgIn(M: Model): number {
  const b = M.s.settings.barKg;
  if (b != null) return b;
  const g = gymOfIn(M);
  const u = (g && g.u) || UIn(M);
  return u === 'lb' ? 45 * LB : 20;
}
