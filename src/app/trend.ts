/* The sessions a lift's trend reads, and its two ends, shared by the
   trend itself and by the screens that say its change, so the two cannot
   disagree (phase 3a; moved unchanged from the legacy script). The trend's reading of each
   session (tv) is set by the analytics (analytics.ts, idxLift), whose
   exposures these read (model.ts). */

import type { Exposure, ExerciseLike, Model } from './model';
import { sinceNew, activeRoutineIn } from './model';
import { addDays, daysBetween, EPS_SAME, WEEK_DAYS, PERCENT } from './util';
import { afterBreak, lighter, sameRR, TREND_DAYS, GROW_PCT, t90, TREND_MIN, STALL } from './formulas';

import { bwRefIn } from './setread';

/** An exposure that has a trend reading. */
type Read = { tv: number };

/* The sessions a lift's trend reads, shared by the trend itself and by the
   screens that say its change in loads, so the two cannot disagree.
   Sessions not done lighter (a session short of its usual counts since r54,
   V's one rule); the current rep range only, since changing the range
   restarts the baseline instead of drawing one line across two scales; the
   sessions since the lift's last break only (afterBreak), for the same
   reason, as strength falls over a break (a five-week break read as a fall,
   "look at recovery", while every session back was heavier than the one
   before); and the 6 weeks up to the lift's own last session (r30: it ended
   at the newest session of any kind, so logging an upper day moved a split
   squat's trend from +14% to +9% without a new split squat set). A new
   machine or gym starts the lift over (sinceNew): its sessions before
   it are another machine's, read by none of these. The stall test reads
   the same sessions (inRange). */
export function trendScope<X extends Exposure>(every: readonly X[], anchor: string) {
  const exps = sinceNew(every);
  const real = exps.filter(x => !lighter(x));
  const curRR = real.length ? real[real.length - 1].rr : null;
  let from = '';
  for (let i = 1; i < exps.length; i++) if (afterBreak(exps[i - 1], exps[i].date)) from = exps[i].date;
  const inRange = real.filter(x => sameRR(x.rr, curRR) && x.date >= from);
  const lastReal = real.length ? real[real.length - 1] : null;
  /* Its last session of any kind, a lighter one too: whether the lift is on a break today is read from it, as the
     engine reads a break (backDaysIn), since a deload is training. */
  const lastAny = exps.length ? exps[exps.length - 1] : null;
  const exWin = addDays(lastReal ? lastReal.date : anchor, -TREND_DAYS);
  return { real, curRR, inRange, lastReal, lastAny, exWin, from };
}

/* The sessions in that scope with a trend reading. Separate from trendScope
   because idxLift sets each session's reading (tv) only after deciding
   whether RIR enters the trend, which needs the scope first. The filter's
   type predicate is a cast: a session it keeps has a reading (tv), which is
   what the test beside it checks. */
export function trendW(sc: { inRange: readonly Exposure[]; exWin: string }): (Exposure & Read)[] {
  return sc.inRange.filter((x): x is Exposure & Read => x.date >= sc.exWin && x.tv != null);
}

/** From this many sessions a trend's two ends are each the better of two; under it, single sessions (three would count the middle one twice). */
export const ENDS_PAIRED_FROM = 4;

/* Both ends of the trend are the better of two sessions, to damp a single
   fluky one. With exactly three, best-of-two at each end counts the middle
   one twice (100, 120, 110 came out as 0% instead of +10%), so three use
   single ends. It returns the sessions, not only their readings, so a screen
   can show what was lifted. The first of equal readings wins, as before.
   Both callers pass trendW's sessions, three or more, so every one has a
   reading. */
export function trendEnds<X extends Read>(w: readonly X[]): { first: X; last: X } {
  const k = w.length >= ENDS_PAIRED_FROM ? 2 : 1;
  const best = (a: readonly X[]): X => a.reduce((m, x) => (x.tv > m.tv ? x : m));
  return { first: best(w.slice(0, k)), last: best(w.slice(w.length - k)) };
}

/* The sessions the stall test reads a lift with a strength reading over:
   its last 6 in the range, widened to cover 21 days when 6 do
   not, at least 4; none when they still do not reach 21 days. One rule for
   the test (idxLiftIn) and the coach's words about it (from the audit V
   asked for: "for 3 weeks" was said of a lift flat for ten). */
/** The stretch of sessions a stall is read over, or null when there is none. */
export function stallStretch<X extends { date: string }>(wE: readonly X[]): X[] | null {
  if (wE.length < STALL.min) return null;
  const lastE = wE[wE.length - 1].date;
  let i0 = wE.length - 1;
  while (i0 > 0 && (wE.length - i0 < STALL.sessions || daysBetween(wE[i0].date, lastE) < STALL.days)) i0--;
  const l = wE.slice(i0);
  return daysBetween(l[0].date, lastE) >= STALL.days ? l : null;
}

/* The sessions in a range the stall test reads a strength reading over: those
   with one, not held for an injury. One list for the
   test (idxLiftIn) and for the span it says it read (stallSpans): from the
   independent review of r54, the span still counted the held sessions. */
export const stallReads = (inR: readonly Exposure[]): Exposure[] => inR.filter(x => !x.held && x.tv != null);

/* The rep ranges a lift's stall is read in (V 2026-10-18: "stalled only
   if every range is"): its newest session's, as the trend's, and each other
   the routine plans it at, a heavy day and a light day say, while the lift
   has a session in it within 42 days of its newest (as targets read a range
   in use), each with its sessions not done lighter since the lift's
   last break. Until r54 only the newest session's range was read, so a lift
   could read stalled midweek and not at the weekend. */
/** The rep ranges a lift's stall is read in, each with its sessions. */
export function stallScopesIn(
  M: Model,
  id: string,
  sc: Pick<ReturnType<typeof trendScope>, 'real' | 'curRR' | 'inRange' | 'lastReal' | 'from'>
): { rr: [number, number] | null; inR: Exposure[] }[] {
  const out: { rr: [number, number] | null; inR: Exposure[] }[] = [{ rr: sc.curRR, inR: sc.inRange }];
  const last = sc.lastReal;
  if (!last) return out;
  const exact = (a: readonly number[] | null, b: readonly number[]): boolean => !!a && a[0] === b[0] && a[1] === b[1];
  for (const d of activeRoutineIn(M).days)
    for (const it of d.items) {
      if (it.exId !== id) continue;
      const rr: [number, number] = [+it.repMin, +it.repMax];
      if (out.some(q => q.rr && exact(q.rr, rr))) continue;
      const inR = sc.real.filter(x => sameRR(x.rr, rr) && x.date >= sc.from);
      if (inR.some(x => exact(x.rr, rr) && x.date >= addDays(last.date, -TREND_DAYS))) out.push({ rr, inR });
    }
  return out;
}

/** The least-squares line through a lift's readings by day: its slope, the slope's standard error (with 3 or more), the mean and the count; null when every reading is on one day. */
function slopeOf(
  list: readonly { date: string; tv: number }[]
): { b: number; se: number | null; my: number; n: number } | null {
  const xs = list.map(x => daysBetween(list[0].date, x.date)),
    ys = list.map(x => x.tv);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n,
    my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0,
    sxx = 0;
  xs.forEach((xv, k) => {
    sxy += (xv - mx) * (ys[k] - my);
    sxx += (xv - mx) ** 2;
  });
  if (!(sxx > 0)) return null;
  const b = sxy / sxx;
  let rss = 0;
  xs.forEach((xv, k) => {
    const e = ys[k] - (my + b * (xv - mx));
    rss += e * e;
  });
  const se = n > 2 ? Math.sqrt(rss / (n - 2) / sxx) : null;
  return { b, se, my, n };
}

/* The trend of a lift in one rep range, over its sessions with a reading in
   the window (trendW): the change and the weekly rate, moving or falling, and
   a heavier load read as no fall (out of idxLiftIn since r65, the r63 audit's A-7). */
export function liftTrendIn(M: Model, exI: Pick<ExerciseLike, 'bw'>, w: (Exposure & { tv: number })[]) {
  let pct: number | null = null,
    slope: number | null = null,
    slopeSe: number | null = null,
    moving = false,
    falling = false,
    pLo: number | null = null,
    pHi: number | null = null,
    spanW: number | null = null,
    loadUp = false;
  /* A trend needs 3 sessions spread over 2 weeks or more: three
       sessions in nine days read as "+6.6% a week" from what was mostly one
       good day. The text gives the weeks it really covers (spanW). A
       bodyweight lift needs a weigh-in too (found while fixing the
       audit's C10): with none its readings are the added load alone, so
       pull-ups from BW+10 to BW+17.5 read as 40% stronger, where at an 80 kg
       weigh-in they are 5%. Goals have said so since r40 (goalState). */
  const spanD = w.length ? daysBetween(w[0].date, w[w.length - 1].date) : 0;
  if (w.length >= TREND_MIN.sessions && spanD >= TREND_MIN.days && !(exI.bw && !(bwRefIn(M) > 0))) {
    spanW = Math.max(2, Math.round(spanD / WEEK_DAYS));
    const ends = trendEnds(w);
    pct = (ends.last.tv / ends.first.tv - 1) * PERCENT;
    // Slope in % of the mean per week, with its standard error. Moving or
    // falling needs 3% or more and the slope's 80% interval clear of zero.
    const f = slopeOf(w);
    if (f) {
      slope = ((f.b * WEEK_DAYS) / f.my) * PERCENT;
      slopeSe = f.se != null ? ((f.se * WEEK_DAYS) / f.my) * PERCENT : null;
      const tq = t90(f.n - 2);
      const lo = slopeSe != null ? slope - tq * slopeSe : slope,
        hi = slopeSe != null ? slope + tq * slopeSe : slope;
      moving = pct >= GROW_PCT && lo > 0;
      falling = pct <= -GROW_PCT && hi < 0;
      // The weekly rate the 80% interval allows: "about 1.5% a week,
      // likely 1.2 to 1.8" rather than one number stated as fact. It is
      // given on the weekly rate the line measures; a range on the 6-week
      // change beside an endpoint percentage could leave that percentage
      // outside its own range.
      if (slopeSe != null) {
        pLo = lo;
        pHi = hi;
      }
    }
    /* A heavier working load with the reps still in the range is progress
         that rep-max formulas disagree on, never a fall (from the
         review: a lat pulldown from 90 x 14 to 95 x 10, on plan, read "down
         4%, look at recovery"; Brzycki says -10%, Lombardi +2%, all inside
         the 2 to 8% day-to-day noise). */
    const z = w[w.length - 1],
      a0 = w[0];
    const zr = z.pts.filter(p => Math.abs(p.w - z.topW) < EPS_SAME).map(p => p.r);
    if (z.topW > a0.topW + EPS_SAME && zr.length && Math.min(...zr) >= (z.rr ? +z.rr[0] : 1) && pct < 0) {
      loadUp = true;
      falling = false;
      if (pHi != null && pHi < 0) {
        pLo = null;
        pHi = null;
      }
    }
  }
  return { pct, slope, slopeSe, moving, falling, pLo, pHi, spanW, loadUp };
}
