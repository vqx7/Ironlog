/* What a load number means, in words (phase 3a, r51; moved unchanged from
   the legacy script). Every set
   stores the number as typed; its meaning is a property of the exercise
   (loadMode, in library.ts). */

import type { Exercise } from './types';
import type { ExerciseLike, Model, Suggestion } from './model';
import { loadMode, PLATE_SIDE_IDS, isCompound, noE1 } from './library';
import { r1, EPS } from './util';
import { UIn } from './model';
import { DEFAULT_STEP, fromDIn, toDIn } from './units';

/** The load meanings a lifter can choose in the exercise editor. */
export const LOAD_MODES: readonly (readonly [string, string])[] = [
  ['each', 'Per dumbbell (two dumbbells)'],
  ['total', 'Total on the implement'],
  ['side', 'Plates on one side'],
  ['stack', 'Stack setting']
];

/* Short words for the load: shown next to numbers and on the exercise. */
export function loadWords(ex: ExerciseLike) {
  const m = loadMode(ex);
  if (ex && ex.assist) return 'machine help';
  if (m === 'each') return 'per dumbbell';
  if (m === 'side') return 'plates per side';
  if (m === 'stack') return 'stack setting';
  if (m === 'bw') return 'added to bodyweight';
  if (ex.equip === 'dumbbell') return 'one dumbbell';
  if (ex.equip === 'barbell') return 'total, bar included';
  if (ex.equip === 'landmine') return 'plates on the sleeve';
  if (ex.equip === 'smith') return 'total on the bar';
  if (PLATE_SIDE_IDS.includes(ex.id) || ex.equip === 'machine') return 'total plates';
  return 'total';
}

/* After a number in running text: "80 lb per dumbbell", "90 lb per side". */
export function loadNote(ex: Parameters<typeof loadMode>[0]): string {
  const m = loadMode(ex);
  return m === 'each' ? ' per dumbbell' : m === 'side' ? ' per side' : '';
}

// An estimate is said as a load only where it is a load someone could put on the bar (a 1RM is shown for these lifts).
export function estInLoad(ex: ExerciseLike): boolean {
  return isCompound(ex) && !ex.bw && !noE1(ex) && loadMode(ex) === 'total';
}

/* What an empty load field shows when nothing is suggested: 0 on a
   bodyweight lift, nothing added, and nothing on a loaded lift or an
   assisted one, whose help is not known until it is typed (r54, PENDING
   315 i: a first session showed 0 help, and ticked past it was saved at
   full bodyweight, so the next normal session read lighter). */
/** The grey text of an empty load field with no suggestion. */
export const emptyLoad = (ex: Pick<Exercise, 'bw' | 'assist'>): string => (ex.bw && !ex.assist ? '0' : '');

/* ---------- loads in words, in the unit on screen (phase 3b, r52; moved from the legacy script) ---------- */

/** A load in kilograms as shown, rounded to a tenth; empty for none. toD of a number is a number, as the ! says. */
export const fmtWIn = (M: Model, kg: number | null | undefined): string =>
  kg == null || isNaN(kg) ? '' : String(r1(toDIn(M, kg)!));

/** A load as shown on an exercise: BW+10 or BW−40 on a bodyweight lift, else the number. */
export function loadLabelIn(M: Model, ex: Pick<Exercise, 'bw'>, kg: number): string {
  if (ex.bw) {
    return kg > 0 ? `BW+${fmtWIn(M, kg)}` : kg < 0 ? `BW−${fmtWIn(M, -kg)}` : 'BW';
  }
  return fmtWIn(M, kg);
}

// Puts a new load into a suggestion, its words included.
export function swapWIn(M: Model, ex: Pick<Exercise, 'bw'>, res: Suggestion, nw: number): Suggestion {
  // The load the words were written with; a suggestion is swapped only when it has one, as the ! says.
  const a = loadLabelIn(M, ex, res.w!),
    b = loadLabelIn(M, ex, nw);
  const fix = (t: string): string => (t ? t.split(a).join(b) : t);
  const out: Suggestion = { ...res, w: nw, target: fix(res.target) };
  out.text =
    res.last && res.text.startsWith(res.last) ? res.last + fix(res.text.slice(res.last.length)) : fix(res.text);
  if (res.tgt && res.tgt.w != null) out.tgt = { ...res.tgt, w: nw };
  return out;
}

/* Round a load to something you can actually put on a bar or pick off a rack:
   nearest 5 lb, or nearest 2.5 kg. Used for suggested warm-up loads only;
   anything the user types is left exactly as typed. */
/* down: round toward lighter. A deload rounded to nearest could land back on
   the full load (90% of 25 lb is 22.5, which rounded up to 25). toD of a
   number is a number, and so is fromD's, as the two ! say. */
export function roundLoadIn(M: Model, kg: number, down?: boolean): number {
  const step = DEFAULT_STEP[UIn(M)];
  const d = toDIn(M, kg)!;
  return fromDIn(M, Math.max(step, (down ? Math.floor(d / step + EPS) : Math.round(d / step)) * step))!;
}
