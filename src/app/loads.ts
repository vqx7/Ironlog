/* What a load number means, in words (phase 3a, r51; moved unchanged from
   the legacy script, tests/moved.js holds them to r50's code). Every set
   stores the number as typed; its meaning is a property of the exercise
   (loadMode, in library.ts). */

import type { Exercise } from './types';
import { loadMode, PLATE_SIDE_IDS, isCompound, noE1 } from './library';

/** The load meanings a lifter can choose in the exercise editor. */
export const LOAD_MODES: readonly (readonly [string, string])[] = [
  ['each', 'Per dumbbell (two dumbbells)'],
  ['total', 'Total on the implement'],
  ['side', 'Plates on one side'],
  ['stack', 'Stack setting']
];

/* Short words for the load: shown next to numbers and on the exercise. */
export function loadWords(ex: Exercise) {
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
export function loadNote(ex: Exercise | null | undefined): string {
  const m = loadMode(ex);
  return m === 'each' ? ' per dumbbell' : m === 'side' ? ' per side' : '';
}

// An estimate is said as a load only where it is a load someone could put on the bar (a 1RM is shown for these lifts).
export function estInLoad(ex: Exercise): boolean {
  return isCompound(ex) && !ex.bw && !noE1(ex) && loadMode(ex) === 'total';
}
