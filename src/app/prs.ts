/* What a PR is called and the rep bands estimates are judged in (phase 3a,
   r51; moved unchanged from the legacy script, tests/moved.js holds them to
   r50's code). Finding the PRs moves with the analytics. */

// The bands in words, counted as reps to failure (reps plus RIR).
/* Bands count reps to failure (reps plus reps in reserve), so they say so (r34.2, from the review:
   "sets of 11 to 12 reps" named the band of a set of 8 at 3 in reserve). */
export const BAND_WORDS: Readonly<Record<number, string>> = {
  1: '1 to 5 reps to failure',
  2: '6 to 10 reps to failure',
  3: '11 to 12 reps to failure'
};

/* What an estimate PR is called (r34.2, from the review: a best for 6 to 8
   reps was shown as "Best estimate 30 kg (was 29)" beside an all-time best
   estimate of 30 kg from a set of 11): Best estimate only when it beats every
   earlier set's estimate, else the best for its band of reps, the band
   worded here. */
export const BAND_SHORT: Readonly<Record<number, string>> = {
  1: '1 to 5 reps to failure',
  2: '6 to 10 reps to failure',
  3: '11 to 12 reps to failure'
};

/** An estimate PR (type e1RM, the only kind these are given): its value, the
    best before it of any band, and its band. The analytics record a band with
    every estimate, so an estimate PR always has one. */
type PrMark = { value?: number | null; prevAll?: number | null; bb: number };

/** Whether an estimate PR beats every earlier estimate, not only its band's. */
export function prOverall(p: Pick<PrMark, 'value' | 'prevAll'>): boolean {
  return p.prevAll == null || (p.value != null && p.value > p.prevAll + 1e-6);
}

/** An estimate PR's name: Best estimate, or the best for its band of reps. */
export function prName(p: PrMark): string {
  return prOverall(p) ? 'Best estimate' : `Best for ${BAND_SHORT[p.bb] || 'its reps'}`;
}
