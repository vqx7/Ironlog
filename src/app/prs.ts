/* What a PR is called and the rep bands estimates are judged in (phase 3a,
   r51; moved unchanged from the legacy script). Finding the PRs moves with the analytics. */

import { EPS_SAME } from './util';
import { PR_BANDS } from './formulas';

// The bands in words, counted as reps to failure (reps plus RIR).
/* Bands count reps to failure (reps plus reps in reserve), so they say so (r34.2, from the review:
   "sets of 11 to 12 reps" named the band of a set of 8 at 3 in reserve). */
/** Each band's reps to failure as a range, "1 to 5", in band order. */
export const BAND_RANGES: readonly string[] = PR_BANDS.map((b, i) => `${i ? PR_BANDS[i - 1].top + 1 : 1} to ${b.top}`);
/** Each band in words, by band. */
export const BAND_WORDS: Readonly<Record<number, string>> = Object.fromEntries(
  PR_BANDS.map((b, i) => [b.band, `${BAND_RANGES[i]} reps to failure`])
);

/** An estimate PR (type e1RM, the only kind these are given): its value, the
    best before it of any band, and its band. The analytics record a band with
    every estimate (the PR's type says it may be null, so one without reads as
    "its reps"). */
type PrMark = { value?: number | null; prevAll?: number | null; bb: number | null };

/** Whether an estimate PR beats every earlier estimate, not only its band's. */
export function prOverall(p: Pick<PrMark, 'value' | 'prevAll'>): boolean {
  return p.prevAll == null || (p.value != null && p.value > p.prevAll + EPS_SAME);
}

/* What an estimate PR is called (r34.2, from the review: a best for 6 to 8
   reps was shown as "Best estimate 30 kg (was 29)" beside an all-time best
   estimate of 30 kg from a set of 11): Best estimate only when it beats every
   earlier set's estimate, else the best for its band of reps, in the words
   the toast uses (until r54 a second table typed the same words). */
/** An estimate PR's name: Best estimate, or the best for its band of reps. */
export function prName(p: PrMark): string {
  return prOverall(p) ? 'Best estimate' : `Best for ${(p.bb != null && BAND_WORDS[p.bb]) || 'its reps'}`;
}
