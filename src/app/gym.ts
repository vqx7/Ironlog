/* Your gym: the plates on hand, the dumbbell rack, the
   stack step, and how a saved gym is cleaned; and how plates load on an
   exercise (phase 3a, r51; moved unchanged from the legacy script). The steps the engine reads from
   them move with the engine. */

import type { DbRack, Exercise, Gym, Plan } from './types';
import type { ExerciseLike, Model } from './model';
import { isNum, r3, EPS_SAME } from './util';
import { LB, STEP_LB, stepReadIn, unitStepIn, BAR, TYPED_STEP } from './units';
import { ONE_DB, PLATE_SIDE_IDS, isCompound, loadMode, rackKind } from './library';
import { UIn, gymOfIn } from './model';
import { arr } from './records';

/** How plates load on an exercise, as chosen in the exercise editor. */
export const PLATE_MODES: readonly (readonly [string, string])[] = [
  ['auto', 'Automatic'],
  ['bar', 'Barbell: bar plus plates per side'],
  ['side', 'Plates per side, no bar'],
  ['sleeve', 'One sleeve (landmine)'],
  ['none', 'None']
];

/* A load typed as shown is the load it shows: within tol of a
   plate, the side takes that plate. 110.2 lb typed is 49.986 kg, the 50 kg of
   15 kg a side, where a strict count gave 10, 2.5 and 1.25 kg with 1.24 kg
   not loadable. The caller's tol is half the last shown digit, split across
   the two sides. */
/* Greedy, heaviest plate first, is how lifters load a bar and gives the line every lifter knows (45, 10, 5 for 60
   a side), so it stays whenever it loads the side. It misses only with plates that are not all whole multiples of the
   smallest (NEW-76, 2.34: 2.5 and 1 kg make 3 kg a side as 1, 1, 1, where greedy takes 2.5 and leaves 0.5), and
   then the side takes the closest load the plates do make, by the same order: as many of each plate, heaviest first,
   as still leave a load the lighter plates can finish. */
/** The plates one side takes, heaviest first from list (sorted heaviest first), and the weight left over. */
export function platesPerSide(list: readonly number[], side: number, tol: number): { plates: number[]; rest: number } {
  const plates: number[] = [];
  let rest = side;
  for (const pl of list)
    while (rest >= pl - tol) {
      plates.push(pl);
      rest -= pl;
    }
  if (rest <= tol || !list.length) return { plates, rest };
  const exact = sidePlates(list, side, tol);
  return exact && exact.rest < rest - EPS_SAME ? exact : { plates, rest };
}

/** A hair under the shown digit's edge, so floating error never moves a load onto a total greedy would not take it to. */
const EDGE = 1e-6;
/** Floating error on a whole count of plate units. */
const COUNT_EPS = 1e-9;
/** Plates' weights counted in hundredths of their unit, so sums are exact (a plate is a whole number of hundredths, gymClean). */
const PLATE_CENTS = 100;
/** The greatest common divisor of two whole numbers. */
function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/* Which per-side loads a set of plates makes, any number of each: the sums, counted in units of the plates' greatest
   common divisor up to `most` (both in the plates' unit), as a list of which unit counts are reachable. Each list is
   at most `most` over that divisor long, and gymClean keeps plates to whole hundredths, so it stays a few thousand
   entries for any gym. */
function sideSums(list: readonly number[], most: number): { unit: number; ok: boolean[]; ps: number[] } | null {
  const cents = list.map(x => Math.round(x * PLATE_CENTS)).filter(x => x > 0);
  if (!cents.length) return null;
  const g = cents.reduce(gcd);
  const ps = cents.map(x => x / g);
  // Exact counts come out of the division a hair off a whole number; far less than EDGE is, so EDGE still holds.
  const n = Math.floor((most * PLATE_CENTS) / g + COUNT_EPS);
  const ok = new Array<boolean>(n + 1).fill(false);
  ok[0] = true;
  for (const p of ps) for (let i = p; i <= n; i++) if (!ok[i] && ok[i - p]) ok[i] = true;
  return { unit: g / PLATE_CENTS, ok, ps };
}

/** The closest load one side can take at or under `side` (within `tol`), as plates heaviest first, and the weight left over; null with no plates. */
function sidePlates(list: readonly number[], side: number, tol: number): { plates: number[]; rest: number } | null {
  // No more lenient than greedy at the edge of the shown digit: a load exactly that far off a total stays off it.
  const S = sideSums(list, Math.max(0, side + tol - EDGE));
  if (!S) return null;
  let i = S.ok.length - 1;
  while (i > 0 && !S.ok[i]) i--;
  // Heaviest first: as many of each plate as still leave a remainder the lighter plates make (with `ok` built over
  // every plate, a remainder reachable at all is reachable by the plates after it, since each is taken in turn).
  const order = S.ps.map((p, k) => ({ p, w: list[k] ?? 0 })).sort((a, b) => b.p - a.p);
  const plates: number[] = [];
  let left = i;
  order.forEach((o, k) => {
    const rest = order.slice(k + 1).map(x => x.p);
    const can = (x: number): boolean => {
      if (x === 0) return true;
      if (!rest.length) return false;
      const ok = new Array<boolean>(x + 1).fill(false);
      ok[0] = true;
      for (const p of rest) for (let j = p; j <= x; j++) if (!ok[j] && ok[j - p]) ok[j] = true;
      return ok[x] === true;
    };
    let c = Math.floor(left / o.p);
    while (c > 0 && !can(left - c * o.p)) c--;
    for (let j = 0; j < c; j++) plates.push(o.w);
    left -= c * o.p;
  });
  return { plates, rest: side - i * S.unit };
}

/** A gym or a rack as it arrives, from a save, a backup, another device, or
    the Settings form: any field may hold anything, so each is checked. */
type Raw = Partial<Record<string, unknown>> | null | undefined;

/** The bounds Your gym's numbers are kept within, in its unit: a dumbbell and its step, a kettlebell, how many bells, a stack's step, and how many weights a dumbbell rack may make. Past them a number is a typo. */
const GYM_LIMITS = {
  dumbbell: 500,
  dumbbellStep: 50,
  bell: 300,
  bells: 40,
  stackStep: 100,
  rack: 300,
  plates: 15
} as const;

/** The heaviest plate made, in each unit (50 kg and 100 lb plates exist; past them a number is a typo). */
export const PLATE_MAX: Readonly<Record<'kg' | 'lb', number>> = { kg: 50, lb: 100 };
/** How many plates Your gym can list (the usual sets have 6 and 7; past this a list is a mistake). */
export const PLATES_MOST = GYM_LIMITS.plates;
/** Whether a number is a plate a gym can list in its unit: above 0, at most the heaviest made, in whole hundredths. */
export function plateOk(u: 'kg' | 'lb', x: number): boolean {
  return x > 0 && x <= PLATE_MAX[u] && Math.abs(x * PLATE_CENTS - Math.round(x * PLATE_CENTS)) < EPS_SAME * PLATE_CENTS;
}

/* A gym cleaned for normalize() and the Settings form. Every field checked;
   anything out of range is dropped, never guessed. A gym with nothing left
   but its unit is null, so it is not stored. */
export function gymClean(g: Raw): Gym | null {
  if (!g || typeof g !== 'object' || (g.u !== 'lb' && g.u !== 'kg')) return null;
  const out: Gym = { u: g.u };
  // Number turns whatever is there into a number or NaN.
  const n = (v: unknown): number => {
    const x = Number(v);
    return isFinite(x) ? r3(x) : NaN;
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
    if (lo > 0 && hi >= lo && hi <= GYM_LIMITS.dumbbell && st > 0 && st <= GYM_LIMITS.dumbbellStep) {
      const db: DbRack = { lo, hi, st };
      if (fine > 0 && fine < st && fineTo > lo) {
        db.fine = fine;
        db.fineTo = Math.min(fineTo, hi);
      }
      if (dbListOf(db)) out.db = db;
    }
  }
  const kbs = arr(g.kb);
  if (kbs) {
    const kb = [...new Set(kbs.map(n).filter(x => x > 0 && x <= GYM_LIMITS.bell))]
      .sort((a, b) => a - b)
      .slice(0, GYM_LIMITS.bells);
    if (kb.length) out.kb = kb;
  }
  /* Any plate the gym has, not only the usual ones (Settings' chips, settings.ts usualPlates): a weight above 0, no heavier than the
     heaviest plate made, in whole hundredths of the unit (every plate label is), heaviest first, each once. A saved
     list of usual plates comes out as it went in, so its hash is unchanged. */
  const plates = arr(g.plates);
  if (plates) {
    const pl = [...new Set(plates.map(n).filter(x => plateOk(g.u === 'kg' ? 'kg' : 'lb', x)))]
      .sort((a, b) => b - a)
      .slice(0, GYM_LIMITS.plates);
    if (pl.length) out.plates = pl;
  }
  {
    const st = n(g.stack);
    if (st > 0 && st <= GYM_LIMITS.stackStep) out.stack = st;
  }
  return Object.keys(out).length > 1 ? out : null;
}

/** A gym number in kilograms. */
const gymK = (g: Pick<Gym, 'u'>, v: number): number => (g.u === 'kg' ? v : v * LB);

/* Dumbbells as typed in Settings: from, to, a step, and optionally a
   smaller step up to some weight (5 to 25 by 2.5, then 5s to 120). Returns
   the weights, lightest first, or null when the fields do not make a rack.
   The form also passes a rack still being typed, with fields missing: a
   comparison with a missing field is false, so the first line refuses it.
   The smaller step's two fields are optional and read the same way, which
   is what the two casts say, and the two ! after them: each field is used
   only once it is above 0. */
// More than GYM_LIMITS.rack weights is a typo (0.5 to 200 by 0.5), refused rather than cut short.
export function dbListOf(d: DbRack | null | undefined): number[] | null {
  if (!d || !(d.lo > 0) || !(d.hi >= d.lo) || !(d.st > 0)) return null;
  const out: number[] = [];
  let v = d.lo;
  while (v <= d.hi + EPS_SAME) {
    if (out.length >= GYM_LIMITS.rack) return null;
    out.push(r3(v));
    v = r3(v + (Number(d.fine) > 0 && Number(d.fineTo) > 0 && v < Number(d.fineTo) - EPS_SAME ? Number(d.fine) : d.st));
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
  if (plan && isNum(+plan.inc) && Math.abs(stepReadIn(M, +plan.inc) - unitStepIn(M)) > EPS_SAME) return null;
  const k = rackKind(ex);
  if (!k) return null;
  const m = loadMode(ex);
  if (!(m === 'each' || (m === 'total' && (ex.load == null || ONE_DB.has(ex.id))))) return null;
  const L = k === 'dumbbell' ? dbListOf(g.db) : Array.isArray(g.kb) && g.kb.length ? g.kb : null;
  return L && L.length ? L.map(v => gymK(g, v)) : null;
}

/** A load is the bell it is nearer than this share of the gap to its neighbours (r34.2, a convention). */
const BELL_TOL = 0.45;

/* A load typed as shown on screen is within half the last shown digit of
   the bell it means: an 8 kg dumbbell is shown as 17.6 lb, which is 7.983 kg
   (review of r33). Rack comparisons use this, so a bell typed as shown is
   that bell, never "0.02 kg under the next one". */
/* A load typed for a bell is that bell when it is nearer to it than to
   its neighbours (r34.2, from the review: a 16 kg dumbbell typed as 35 lb,
   15.88 kg, read as just under itself, and the "step up" was the same bell,
   "add 0.3 lb"). Within BELL_TOL of the gap around the bell; never less than half
   the last shown digit. Bounds a load must not pass (the target, the cap)
   keep the narrow tolerance. The filter keeps only gaps above 0, which
   TypeScript cannot follow into Math.min, hence the cast to numbers. */
export function rackTolIn(M: Model, L?: readonly number[] | null, at?: number | null): number {
  const base = UIn(M) === 'lb' ? TYPED_STEP * LB : TYPED_STEP;
  if (!L || !L.length || at == null || !isNum(at)) return base;
  let i = 0;
  for (let k = 1; k < L.length; k++) if (Math.abs(L[k] - at) < Math.abs(L[i] - at)) i = k;
  const gs = [i > 0 ? L[i] - L[i - 1] : null, i < L.length - 1 ? L[i + 1] - L[i] : null].flatMap(g =>
    g != null && g > 0 ? [g] : []
  );
  const gap = gs.length ? Math.min(...gs) : 0;
  return Math.abs(L[i] - at) <= Math.max(base, BELL_TOL * gap) ? Math.max(base, Math.abs(L[i] - at) + EPS_SAME) : base;
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
  if (m === 'stack' && g.stack !== undefined && g.stack > 0) return gymK(g, g.stack);
  return null;
}

/* The lightest load a lift can be given: the empty bar on a lift on the
   full bar (bench, squat, rows) typed as the total. Curls and skull crushers
   are often on an EZ or fixed bar lighter than the bar weight setting, and a
   per-side number has no bar in it, so neither has one. An exercise with no
   bar of its own set reads as none. */
/** The lightest load a lift can be given: the empty bar where one applies, else 0. */
export function loadFloorIn(M: Model, ex: ExerciseLike): number {
  return platesMode(ex) === 'bar' && loadMode(ex) === 'total' && (isCompound(ex) || (ex.barKg ?? 0) > 0)
    ? exBarKgIn(M, ex)
    : 0;
}

/* Your gym's plates on a bar lift (r55.1, from the audit of r55: with no 2.5
   lb plates, bench logged at 230 lb was asked for 240, 230 or 200 and warmed
   up at 90 and 140, none of them loadable, beside a plate line saying 2.5 lb
   was not). A lift on the full bar typed as the total (loadFloorIn, so not a
   curl on a lighter bar) with no step of its own is loaded at the bar plus a
   pair of each side's load, and its suggestions, steps, lighter and heavier
   loads and warm-ups land on those loads. Before 2.34 this was the bar and every pair of the smallest plate, which
   holds only when every plate is a whole multiple of the smallest; any other gym (10 and 25 lb without 5s, or 1 kg
   plates beside 1.25 and 2.5) kept the lift's step, off the plates. The list is now every load the plates
   make, any number of each, up to PLATE_SIDE_MAX a side: with plates that are whole multiples of the smallest it is
   the same as before, the bar and every pair of the smallest. */
/** Per side, the most a bar's plates are counted to, in each unit: past any lift's load (a convention: 250 kg a side is a 520 kg bar). */
const PLATE_SIDE_MAX: Readonly<Record<'kg' | 'lb', number>> = { kg: 250, lb: 550 };
/** A bar lift's loads as Your gym's plates make them, in kg: the bar, and the bar with every pair the plates make, lightest first; or null. */
export function plateGridIn(
  M: Model,
  ex: ExerciseLike | null | undefined,
  plan?: Pick<Plan, 'inc'> | null
): { bar: number; loads: readonly number[] } | null {
  const g = gymOfIn(M);
  if (!ex || ex.inc != null || ex.timed || !g || !Array.isArray(g.plates) || !g.plates.length) return null;
  if (platesMode(ex) !== 'bar' || loadMode(ex) !== 'total') return null;
  if (Math.abs(stepReadIn(M, plan && isNum(+plan.inc) ? +plan.inc : STEP_LB) - unitStepIn(M)) > EPS_SAME) return null;
  const bar = loadFloorIn(M, ex);
  if (!(bar > 0)) return null;
  const key = `${g.u}|${g.plates.join(',')}|${bar}`;
  const memo = M.c._plates || (M.c._plates = new Map<string, readonly number[]>());
  let loads = memo.get(key);
  if (!loads) {
    const S = sideSums(g.plates, PLATE_SIDE_MAX[g.u]);
    const out: number[] = [];
    if (S) S.ok.forEach((y, i) => y && out.push(bar + gymK(g, 2 * i * S.unit)));
    loads = out.length ? out : [bar];
    memo.set(key, loads);
  }
  return { bar, loads };
}

/** The index of the heaviest load on a list (lightest first) not past `w`, or -1 when every load is past it. */
export function loadsFloorAt(L: readonly number[], w: number): number {
  let lo = 0,
    hi = L.length - 1,
    k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((L[mid] ?? Infinity) <= w) {
      k = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return k;
}

/* The heaviest available: the exercise's own, else the top of the rack, on Your gym's plates the heaviest they make
   under it. A
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
  const c = ex.maxLoad != null ? (r != null ? Math.min(ex.maxLoad, r) : ex.maxLoad) : r;
  /* With Your gym's plates, the heaviest the lift can be given is the heaviest load the plates make not past it (2.31,
     R77-2): with 102 kg set and plates that make 100 and 105, the engine aimed at 102, the plates brought it back to
     100, and the step read "add 0 kg, which is the heaviest available". Read here, every rule and screen sees 100. */
  const G = c != null ? plateGridIn(M, ex, plan) : null;
  if (G && c != null && c > G.bar) return G.loads[Math.max(0, loadsFloorAt(G.loads, c + EPS_SAME))] ?? c;
  return c;
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
    cap != null &&
    top >= cap - (L && (ex.maxLoad == null || cap < ex.maxLoad - EPS_SAME) ? rackTolIn(M, L, top) : EPS_SAME)
  );
}

/* The bar an exercise is loaded on: its own (a trap bar, an EZ bar) when set
   in the exercise editor, else the bar in Settings. An exercise without its
   own bar has none. */
export function exBarKgIn(M: Model, ex: ExerciseLike | null | undefined): number {
  return ex && ex.barKg !== undefined && ex.barKg > 0 ? ex.barKg : barKgIn(M);
}

/* The default bar is the gym's: a 20 kg bar in a gym labelled in kg, 45 lb in one in lb,
   whatever unit the app shows (r34.2: a kg gym with the app in lb was given a 45 lb bar). */
export function barKgIn(M: Model): number {
  const b = M.s.settings.barKg;
  if (b != null) return b;
  const g = gymOfIn(M);
  const u = (g && g.u) || UIn(M);
  return u === 'lb' ? BAR.lb * LB : BAR.kg;
}
