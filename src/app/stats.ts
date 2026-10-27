/* Stats (r58, phase 5): what the log says, drawn by lit-html as
   src/22-plan-stats.js drew it, with the actions and fields that change what
   it shows. Every number is read from the analytics the other screens read
   (IDX, the weekly averages, the coach), so a headline and the section under
   it cannot disagree; this module only decides what to say and draws it. The
   charts are drawn after the screen, from graphs.ts. What Stats opens
   elsewhere is reached by the button's data-act through events.ts's table
   (r63): a day of the calendar, a goal's sheet, Layout. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { MEAS, MK, ML, MUSCLES, injLabel, isCompound, loadMode, noE1, BWF } from './library';
import { DAYS, sessDayIdx, trainDaysOf, weekFactor } from './routines';
import {
  GROW_PCT,
  TREND_MIN,
  TREND_WEEKS,
  FLAT_PCT_WEEK,
  BEST_WEEKS,
  STALL,
  DAY_SWING_PCT,
  RECENT_DAYS,
  TAPE_WEEKS,
  RECENT_WEEKS,
  HELPER_CREDIT,
  HARD_RIR,
  BRZYCKI_TOP,
  E1_MAX_REPS,
  E1_MAX_RIR,
  MUSCLE_TREND_MIN
} from './formulas';
import { estMin, fmtDate, repSpan } from './format';
import { DSECS, DSEC_KEYS, REGION_WKS, VOL_MODES, orderKeys, REGION_WK_DEFAULT } from './layout';
import { RANGES, firstDate, weeksSpan, CHART_WEEKS, HALF_YEAR_WEEKS } from './charts';
import { belowMin } from './volume';
import { goalGap, goalOk } from './goals';
import { trendEnds, trendScope, trendW, ENDS_PAIRED_FROM } from './trend';
import { estInLoad, loadNote } from './loads';
import { prName, BAND_RANGES } from './prs';
import { sessionWord, RIR_USUAL_MIN, CAL_WEEKS } from './analytics';
import { BACK_WEEK_WHY, FIRST_WEEK_WHY, LIGHTER_WEEK_TIP, ON_PLAN_TIP, avgWeeksTxt, AVG_WEEKS } from './weeks';
import { FALL_WHY, STALL_WHY, chkWord, musTrend, FATIGUE_STALLS, READINESS_MIN } from './coach';
import { whyTarget } from './session';
import { ENV, REGION_KEY, prefSet } from './storage';
import {
  addDays,
  andList,
  daysBetween,
  r1,
  today,
  weekStart,
  EPS_SAME,
  WEEK_DAYS,
  SUNDAY,
  PERCENT,
  HUNDREDTHS,
  dayOfWeek,
  pctOf
} from './util';
import {
  EX,
  IDX,
  liftRead,
  U,
  activeRoutine,
  actualAvg4,
  allTimeBests,
  atRangeTop,
  avgWait,
  bwAt,
  bwRef,
  coach,
  dateIndex,
  easierText,
  exName,
  fatigueStalls,
  firstFullWeek,
  fmtW,
  freeMode,
  hasTarget,
  injuredSet,
  isDeloadWeek,
  isRestWeek,
  lastLighterWeek,
  loadLabel,
  movers,
  muscleStatus,
  pace,
  planFor,
  plannedSets,
  readiness,
  regionBalance,
  sortedSessions,
  stallWords,
  stalledIds,
  suggest,
  weekNeed,
  weekSessions,
  weekStats,
  weekStreak,
  cycleState
} from './live';
import { state, ui } from './store';
import {
  LU,
  bestSet,
  bwRate,
  bwWeekTxt,
  fmtBig,
  fmtDateLong,
  fmtE,
  goalState,
  goalWords,
  heightTxt,
  lenD,
  loadHead,
  measAt,
  noLog,
  nz,
  prSet,
  recent4w,
  regionSrc,
  sessionLength,
  setShort,
  sizeRows,
  tonnageNow,
  topSetPt
} from './display';
import { volumeRows } from './plan';
import { pageTitle, helpButton, howText, section, slotted, subsection, tabFoot, tipButton } from './view';
import type { Field } from './view';
import type { Part } from './view';
import type { Routine } from './types';
import { rangeKey, weekWindow } from './graphs';
import { rerenderKeepScroll } from './page';

/** The smallest change the percentages show (one decimal): a likely range narrower than it is not said. */
const PCT_SHOWN = 0.1;
/** A change and a weekly rate pointing different ways are explained once the change is past DISAGREE_PCT percent and the rate past flat. */
const DISAGREE_PCT = 0.5;
/** The lifts or muscles a summary line names before "and N more", and the muscles the line on ones rising at their volume names. */
const NAMES_SHOWN = 3,
  RISING_SHOWN = 4;
/** The bests listed before All, the PRs listed, and the sessions in a lift's table. */
const BESTS_SHOWN = 6,
  PRS_SHOWN = 15,
  EX_ROWS = 8;
/** A tape change under this many centimetres is within what a tape repeats to (typical minimum detectable change 5 to 15 mm): about 1 cm on a limb or the neck, 1.5 on the chest. */
const TAPE_NOISE_CM = { chest: 1.5, other: 1 } as const;
/** A bodyweight rate within this many points of its goal a week is on track. */
const BW_GOAL_TOL = 0.15;
/** Waist to height: under WHTR[0] healthy, under WHTR[1] increased risk, else high (NICE 2022). */
const WHTR = [0.5, 0.6] as const;
/** The waist to height bands as copy says them, each band's edge written by `f`, after `under` (its first word, as the sentence needs it); the top of the middle band is the last ratio shown under WHTR[1], at the two decimals shown. */
export function whtrBands(f: (x: number) => string, under = 'under'): string {
  return `${under} ${f(WHTR[0])} healthy, ${f(WHTR[0])} to ${(WHTR[1] - 1 / HUNDREDTHS).toFixed(2)} increased, ${f(WHTR[1])} or more high`;
}
/** Under this share of recent sets with an RIR, Muscles says how much is assumed. */
const RIR_COVER_PCT = 70;
/** A flat muscle is told to try FLAT_TRY.sets more sets a week for FLAT_TRY.weeks weeks (a convention). */
const FLAT_TRY = { sets: 2, weeks: 3 } as const;
/** The weeks the consistency squares and the cardio minutes show. */
const HEAT_WEEKS = 12,
  CARDIO_WEEKS = 8;

/* ---------- the parts more than one section, or another screen, reads ---------- */

/** A muscle's weekly target, by its key as the analytics give it. */
function bandOf(m: string): readonly [number, number] {
  const k = MK.find(x => x === m);
  return k ? state.settings.bands[k] : [0, 0];
}

/* This used to print under all five charts at once. It is one fact about the
   page, so it is shown once a draw and the later calls draw nothing. */
let chartNoticeUsed = false;
function chartFallback(): Part {
  if ((window.__libs && window.__libs.chart) || chartNoticeUsed) return nothing;
  chartNoticeUsed = true;
  return html`<p class="small muted">Charts are still loading. If they never appear, your connection blocked the chart library. Every number on this page works without them.</p>`;
}

/* Range chips, shown only once there is more history than the first window. */
function rangeChips(id: string, n: number, base?: number, def?: string): Part {
  const b = base || CHART_WEEKS;
  if (n <= b) return nothing;
  const cur = rangeKey(id, def);
  const opts: [string, string][] = [['base', `${b} wk`]];
  if (n > HALF_YEAR_WEEKS && b < HALF_YEAR_WEEKS) opts.push(['6m', '6 mo']);
  opts.push(['all', 'All']);
  return html`<div class="chips rng" role="group" aria-label="Range">${opts.map(
    ([k, l]) =>
      html`<button class=${cur === k ? 'chip on' : 'chip '} data-act="chartRange" data-id=${id} data-v=${k} aria-pressed=${String(cur === k)}>${l}</button>`
  )}</div>`;
}

/** One Stats section, built on the shared section part: its fold and move key, the id goDash and the jump chips find, and its explanation. */
function dashSection(key: string, title: string, explain: string, body: Part, subTxt?: Part): TemplateResult {
  return section({
    sk: 'dash:' + key,
    key,
    id: 'sec-' + key,
    title,
    sub: subTxt || '',
    help: explain ? 'sec-' + key : undefined,
    helpBody: explain,
    body
  });
}
/* A fold inside a section: not kept, opened by goDash when a tile or row
   points at it (its id, sub-key, is how it is found). */
function dashSub(key: string, title: string, body: Part, subTxt?: Part): TemplateResult {
  return subsection('dash:sub:' + key, title, body, subTxt, 'sub-' + key);
}

/* A lift's change said in what was lifted, from the two sessions its trend
   compares (trendEnds). On an estInLoad lift whose two sessions both have a
   1RM estimate it is the change in that estimate, the number its chart and
   table show; otherwise the top set at each end. A number is shown only when
   it points the same way as the word: the word follows the trend, which
   averages every working set, while one top set or one best estimate can go
   the other way (review of r41: "Up over 4 weeks: 35×13 to 35×12"). Sets past
   12 reps to failure have no 1RM estimate (Epley reads them only for
   direction), so such a lift shows its top sets (review of r41: a leg press
   at 16 reps read "up about 47 lb" for 30 lb more on the sled). */
function liftChange(exId: string, dir: string, ow: string): string {
  const I = IDX();
  const ex = EX(exId);
  const w = trendW(trendScope(I.byEx[exId] || [], I.anchor));
  if (w.length < TREND_MIN.sessions) return `${dir} ${ow}`;
  const { first, last } = trendEnds(w);
  const up = /up/i.test(dir);
  const agrees = (d: number): boolean => (up ? d > 0 : d < 0);
  if (estInLoad(ex) && first.best != null && last.best != null) {
    const d = last.best - first.best;
    const t = fmtE(Math.abs(d));
    return agrees(d) && +t > 0 ? `Est. 1RM ${dir.toLowerCase()} about ${t} ${U()} ${ow}` : `${dir} ${ow}`;
  }
  const a = topSetPt(ex, first),
    b = topSetPt(ex, last);
  return agrees(b.v - a.v) && a.txt !== b.txt ? `${dir} ${ow}: ${a.txt} to ${b.txt}` : `${dir} ${ow}`;
}

/* One line with the verdict and what to do; the numbers behind it (rates,
   ranges, sessions, how it was read) sit behind an i (r34, V: no walls of
   text). The tiles under it already show the best, the change and the rate. */
/** A lift's headline on Stats: what its trend says and what to do, the numbers behind an i. */
export function exHeadline(exId: string): Part {
  const I = IDX();
  const st = I.exStats[exId];
  if (!st) return '';
  const ex = EX(exId);
  const be = (allTimeBests(exId) || { est: null }).est;
  const line = (t: string, tip?: string): TemplateResult =>
    html`<p class="headline">${t}${tip ? html` ${tipButton(tip, 'About this')}` : nothing}</p>`;
  // A lift weeks off says so instead of a trend from before the break (r34.2).
  if (!st.fresh && st.last && st.last.date) {
    const wk = Math.max(1, Math.round(daysBetween(st.last.date, today()) / WEEK_DAYS));
    return line(
      `Last done ${fmtDate(st.last.date)}, ${wk} week${wk === 1 ? '' : 's'} ago. Its trend picks up again after a few sessions.`
    );
  }
  if (ex.timed) {
    let best: { pl: number; r: number; w: number } | null = null;
    for (const x of liftRead(exId))
      for (const p of x.pts)
        if (!best || p.pl > best.pl + EPS_SAME || (Math.abs(p.pl - best.pl) < EPS_SAME && p.r > best.r)) best = p;
    return line(
      `${best ? `Best hold ${setShort(ex, best.w, best.r)}. ` : ''}${st.stalled ? `No longer hold or more load in ${STALL.noProgress} sessions: try a harder variation or add load.` : 'Progress is longer holds or more load.'}`
    );
  }
  if (noE1(ex)) {
    let best: { r: number; w: number } | null = null;
    for (const x of liftRead(exId))
      for (const p of x.pts)
        if (!best || p.w > best.w + EPS_SAME || (Math.abs(p.w - best.w) < EPS_SAME && p.r > best.r)) best = p;
    return line(
      `${best ? `Best set ${setShort(ex, best.w, best.r)}. ` : ''}${st.stalled ? `No rep or load PR in the last ${STALL.noProgress} sessions.` : 'Progress is reps and added load.'}`,
      'No 1RM is estimated for a lift that turns about a joint.'
    );
  }
  const bw = state.bodyweights.length ? bwAt(today()) : null;
  const parts: string[] = [];
  const more: string[] = [];
  const sg = (v: number): string => (v >= 0 ? '+' : '') + r1(v) + '%';
  const ns = `${st.wN} session${st.wN === 1 ? '' : 's'}`;
  // The range named when it trains in more than one (r55).
  const ow = `over ${st.spanW || TREND_WEEKS} weeks${st.rrIn ? ` in the ${repSpan(st.rrIn[0], st.rrIn[1])} range` : ''}`;
  /* The percentages are behind the i (r41, V asked whether they help: a lifter
     acts on loads and reps, so the line says those and the i keeps the
     change and the rate for anyone who wants them). A range only when it says
     something: perfectly steady numbers give one of zero width. */
  if (st.pct != null) more.push(`Change ${sg(st.pct)} ${ow}.`);
  if (st.slope != null)
    more.push(
      st.pLo != null && st.pHi != null && st.pHi - st.pLo >= PCT_SHOWN
        ? `About ${sg(st.slope)} a week (likely ${sg(st.pLo)} to ${sg(st.pHi)}), from ${ns}.`
        : `About ${sg(st.slope)} a week, from ${ns}.`
    );
  if (!st.useAdj) more.push('Read from loads and reps; RIR is left out of the trend until it is rated on most sets.');
  /* The change compares the ends; the rate fits every session. When they point
     different ways the reason sits behind the i, not as a line on screen (r40,
     V: the old note "Change and trend disagree" was confusing on its own). */
  if (
    st.pct != null &&
    st.slope != null &&
    st.pct > 0 !== st.slope > 0 &&
    Math.abs(st.pct) > DISAGREE_PCT &&
    Math.abs(st.slope) > FLAT_PCT_WEEK
  )
    more.push(
      `The change (${sg(st.pct)}) compares ${st.wN >= ENDS_PAIRED_FROM ? 'the better of your first two sessions with the better of your last two' : 'your first and last sessions'}; the weekly rate fits a line through all of them. They point different ways when one unusual session sits at an end, so the rate is the better guide.`
    );
  const atTopR = atRangeTop(exId);
  if (st.stalled) {
    // At the top of the range, the advice is load, as on the Coach (r32).
    /* The span the stall test read, and its rule in the coach's words (r54, from the audit V asked for: "Stalled for 3 weeks" was fixed text, said of a lift flat for ten). */
    parts.push(
      atTopR
        ? "Stalled at the top of the range: due a step up. The session's target says how."
        : `Stalled ${stallWords(exId)}. Try another rep range or a variation.`
    );
    more.push(STALL_WHY);
  } else if (st.pct == null)
    // (r55, the audit: said of pull-ups with 8 sessions and no weigh-in)
    parts.push(
      ex.bw && !((bwRef() ?? 0) > 0)
        ? 'A trend needs a weigh-in: a bodyweight lift is read at your bodyweight.'
        : `A trend needs ${TREND_MIN.sessions} sessions spread over ${TREND_MIN.days / WEEK_DAYS} weeks.`
    );
  else if (st.moving) parts.push(`${liftChange(exId, 'Up', ow)}.`);
  else if (st.falling) parts.push(`${liftChange(exId, 'Down', ow)}. Look at recovery before adding work.`);
  else if (st.holdRR.length || st.quietRR.length) {
    // One range down, another not (r55, V).
    const rs = (a: readonly [number, number][]): string =>
      `the ${andList(a.map(r => repSpan(r[0], r[1])))} range${a.length > 1 ? 's' : ''}`;
    parts.push(
      `${liftChange(exId, 'Down', ow)}${st.holdRR.length ? `; not in ${rs(st.holdRR)}` : ''}${st.quietRR.length ? `; too few sessions in ${rs(st.quietRR)} to tell` : ''}.`
    );
    more.push(FALL_WHY);
  } else if (st.pLo != null && st.pHi != null && (st.pLo > 0 || st.pHi < 0)) {
    /* A small change the interval still puts on one side of zero is said as
       slow, not as "no clear change" next to a range that excludes 0 (r31). */
    parts.push(
      st.pct > 0 === st.pLo > 0
        ? `${liftChange(exId, st.pLo > 0 ? 'Slowly up' : 'Slowly down', ow)}.`
        : `Slowly ${st.pLo > 0 ? 'up' : 'down'} ${ow}.`
    );
    more.push(`Under the ${GROW_PCT}% that counts as ${st.pLo > 0 ? 'moving' : 'falling'}.`);
  } else if (st.loadUp) {
    parts.push('Heavier load, reps still in your range.');
    more.push(
      'At different reps the 1RM formulas disagree by more than this change, so a dip in the estimate is not read as a fall.'
    );
  } else {
    parts.push('No clear change yet.');
    more.push(`Day to day swings of ${DAY_SWING_PCT[0]} to ${DAY_SWING_PCT[1]}% hide small changes.`);
  }
  if (st.capped) parts.push('At the heaviest load available: progress counts in reps.');
  /* A 1RM is stated for compound lifts only (r30): a "42 lb 1RM" on a
     lateral raise means nothing anyone would lift. */
  if (be && isCompound(ex) && bw && !ex.bw && loadMode(ex) === 'total')
    parts.push(`${(be.v / bw).toFixed(2)}× bodyweight.`);
  if (!(be && isCompound(ex))) {
    const bs = bestSet(exId);
    if (bs) parts.unshift(`Best set ${setShort(ex, bs.w, bs.r)}.`);
  }
  return line(parts.join(' '), more.join(' '));
}

/** A muscle's headline in Volume's Weekly trend: its hard sets a week against its target, and its strength trend. */
function muscleHeadline(m: string): TemplateResult {
  const I = IDX();
  const avg = actualAvg4();
  const [lo, hi] = bandOf(m);
  const sc = I.scores.find(x => x.m === m);
  const parts: string[] = [];
  // A muscle with no target has none to be above or below (r29; the one rule since r58, hasTargetIn).
  const tr = !hasTarget(m);
  // The status every screen reads (muscleStatus): on plan is said, with why behind an i (r54).
  const st = avg ? (muscleStatus(avg)[m] || { st: null }).st : null;
  if (avg) {
    const v = avg[m] || 0;
    parts.push(
      tr
        ? `${r1(v)} hard sets a week over ${avgWeeksTxt(avg)}. Tracked only: no target.`
        : `${r1(v)} hard sets a week over ${avgWeeksTxt(avg)}, ${st === 'under' || st === 'plan' ? `${r1(lo - v)} below` : st === 'over' ? `${r1(v - hi)} above` : 'inside'} your ${lo} to ${hi} target${st === 'plan' ? ', on plan' : ''}.`
    );
  } else {
    // With no average yet, what brings one, as the coach says it (avgWait, r54).
    const w = avgWait();
    parts.push(
      tr
        ? 'Tracked only: counted and shown, with no target.'
        : `Target ${lo} to ${hi} hard sets a week. ${w.lead}Compare against it after ${w.after}.`
    );
  }
  if (sc)
    parts.push(
      `${musTrend(sc)}${sc.indirect ? ', read from exercises that train it indirectly' : ''}${sc.label === 'lagging' ? ', flagged as lagging' : ''}.`
    );
  return html`<p class="headline"><b>${ML[m]}.</b> ${parts.join(' ')}${st === 'plan' ? html` ${tipButton(ON_PLAN_TIP, 'On plan')}` : nothing}</p>`;
}

/* A percentage against zero is noise: on a Monday before you train it read
   "100% behind", which is true and useless. Say the numbers instead, with no
   ahead or behind (r30): heavier loads for fewer reps lower it. */
function volHeadline(): Part {
  if (!IDX().sessVol.length) return '';
  const tn = tonnageNow();
  const cmp = `. By this point last week: ${fmtBig(tn.prev)} ${U()}`;
  return html`<p class="headline">${tn.now ? `${fmtBig(tn.now)} ${U()} lifted this week so far` : 'Nothing lifted yet this week'}${cmp}. Last week finished at ${fmtBig(tn.prevFull)} ${U()}. ${tipButton('Weight lifted is load times reps. It drops when the load goes up and reps come down, which is progress, so it is not a measure of progress on its own.', 'About weight lifted')}</p>`;
}

/* Weight lifted this week is on Today's This week, and stalls are the Stuck
   line below, so neither repeats here as a tile (r41). Once estimates follow
   your own pace (r43) the planned figure is your average again, so it goes. */
function extraKpis(): Part {
  const sd = sessionLength();
  if (!sd) return '';
  return html`<div class="kpi"><div class="v">${sd.avg}<span class="small"> min</span></div><div class="l">Average session, last ${RECENT_DAYS / WEEK_DAYS} weeks (${sd.n} timed)${sd.plan && pace() === 1 ? `, planned ${estMin(sd.plan)}` : ''}</div></div>`;
}

/* Up to four lines, each landing on the section that holds the detail. */
function dashSummary(): TemplateResult {
  const mvAll = movers(),
    mv = mvAll.slice(0, 2);
  const stalled = stalledIds();
  const avg = actualAvg4();
  const inj = injuredSet();
  // Each muscle's status as every screen reads it (muscleStatus): a muscle on plan is not below target (r54).
  const st = avg ? muscleStatus(avg) : null;
  const stOf = (m: string): string | null => (st && st[m] ? st[m].st : null);
  const under = st ? MK.filter(m => !inj.has(m) && stOf(m) === 'under') : null,
    over = st ? MK.filter(m => stOf(m) === 'over') : null;
  const onPlan = st ? MK.filter(m => !inj.has(m) && stOf(m) === 'plan') : [];
  const c = coach();
  const row = (
    tone: string,
    label: string,
    text: string,
    attrs: { sec: string; ex?: string | undefined }
  ): TemplateResult =>
    html`<button class="srow" data-act="goDash" data-sec=${attrs.sec} data-ex=${attrs.ex ?? nothing}><i class=${`dot ${tone}`}></i><span class="sl">${label}</span><span class="st">${text}</span><span class="chev2" aria-hidden="true">›</span></button>`;
  /* The reason given is the true one (r30): with enough sessions the changes
     are inside day-to-day noise; "needs 3 sessions" was said to someone with 6. */
  const nTr = Object.values(IDX().exStats).filter(x => x && x.pct != null && x.fresh).length;
  /* Each lift's change is over the weeks its trend covers (r32, from the
     third review: "+7.5% over 6 weeks" on a log 19 days old). One span is
     said once when the two share it. Names, not percentages (r41): "Incline
     DB Curl +14.6%" is a change in an estimate nobody lifts; the lift's own
     section says it in loads. */
  const m0 = mv[0];
  const one = !!m0 && mv.every(x => x.wk === m0.wk);
  const moving = m0
    ? andList(
        mv
          .map(x => `${exName(x.id)}${one ? '' : ` over ${x.wk} weeks`}`)
          .concat(mvAll.length > 2 ? [`${mvAll.length - 2} more`] : [])
      ) + (one ? `, over ${m0.wk} weeks` : '')
    : nTr
      ? `No lift clearly rising yet: ${nTr} with a trend, each within day-to-day noise.`
      : `A trend needs ${TREND_MIN.sessions} sessions of a lift over ${TREND_MIN.days / WEEK_DAYS} weeks or more, within ${TREND_WEEKS} weeks.`;
  // When the coach's one change is the volume shortfall, the Volume line says it with the action and Change is not repeated (r41);
  // so too when the coach says why no average shows yet (r54: the two said different weeks), which the Volume line says otherwise.
  const cm = c.act && c.act.sec === 'volume' ? c.act.m : null;
  const same = !!(cm && under && under.some(m => m === cm)) || !!c.wait;
  const w = under == null ? avgWait() : null;
  const above =
    over && over.length
      ? ` Above: ${andList(
          over.map(m => ML[m] || m),
          2
        )}.`
      : '';
  const vt =
    (same
      ? c.text
      : w
        ? `${w.lead}A volume read comes${w.kind === 'back' ? ' back' : ''} after ${w.after}.`
        : under && under.length
          ? `Below target: ${andList(
              under.map(m => ML[m] || m),
              NAMES_SHOWN
            )}.`
          : onPlan.length
            ? 'Every muscle on plan.'
            : 'Every muscle at or above target.') + above;
  return html`<div class="card summary" id="dashSummary">${row(mv.length ? 'green' : '', 'Moving', moving, { sec: 'exercise', ex: m0 ? m0.id : undefined })}${row(
    stalled.length ? (fatigueStalls(stalled).length >= FATIGUE_STALLS ? 'red' : 'yellow') : 'green',
    'Stuck',
    stalled.length ? andList(stalled.map(exName), NAMES_SHOWN) : 'Nothing stalled',
    { sec: 'stalls' }
  )}${row(under == null ? '' : under.length ? 'yellow' : 'green', 'Volume', vt, { sec: 'volume' })}${same ? nothing : html`<div class="srow static"><i class=${`dot ${c.tone}`}></i><span class="sl">Change</span><span class="st">${c.text}</span></div>`}</div>`;
}

/* ---------- Volume ---------- */

/* Volume section, "By region" mode: the radar (graphs.ts) and its table,
   from regionSrc, the one source both read. */
function regionBody(): TemplateResult {
  const rs = regionSrc();
  if (rs.empty)
    return html`<div class="card"><p class="headline">Nothing logged yet.</p><p class="small muted" style="margin:0 0 4px">Each region fills in with your own hard sets as you log them. The dashed ring is your weekly minimum.</p>${ENV === 'preview' ? html`<p class="small" style="margin:6px 0">This test version keeps a separate log. <button class="btn sm primary" data-act="previewCopy">Copy my log in</button></p>` : nothing}<div class="chartbox tall"><canvas id="chRadar"></canvas></div>${chartFallback()}</div>`;
  const regs = regionBalance(rs.src);
  const low = regs.filter(x => x.low),
    high = regs.filter(x => x.high),
    plan = regs.filter(x => x.plan);
  // A region on plan is short of its minimum only by which days of a cycle fell in the weeks (r54): not low, and not counted on target.
  const on = regs.length - low.length - plan.length;
  // The furthest short is the lowest share of its minimum, said in sets.
  const worst = [...low].sort((a, b) => a.pct - b.pct)[0];
  // One count of sets on the section: regions share sets, so their sum read as a second, larger total (r34.2).
  const rh = rs.week
    ? html`<p class="headline">This week so far: ${on} of ${regs.length} regions at their minimum.</p>`
    : !worst
      ? plan.length
        ? html`<p class="headline">Every region on plan.</p>`
        : html`<p class="headline">Every region at or above its minimum${high.length ? '' : ', inside its target'}.</p>`
      : html`<p class="headline">${on} of ${regs.length} regions on target. Furthest short: ${worst.label}, ${r1(worst.got)} of ${r1(worst.lo)} sets.</p>`;
  const note =
    (rs.old ? `Nothing logged in the last ${rs.n || REGION_WK_DEFAULT} weeks, so this shows ${rs.label}. ` : '') +
    (rs.noFull ? 'No full week to average yet, so this is this week so far. ' : '') +
    (rs.week && low.length ? 'The week is still going, so this fills in as you train.' : '');
  const chips = html`<div class="wkpick"><span class="small muted" id="wkpickL">Average of the last</span><div class="chips" role="group" aria-labelledby="wkpickL">${REGION_WKS.map(
    ([k, l]) =>
      html`<button class=${rs.n === k ? 'chip on' : 'chip '} data-act="regionWk" data-v=${String(k)} aria-pressed=${String(rs.n === k)}>${l}</button>`
  )}</div></div>`;
  return html`<div class="card">${rs.week ? nothing : chips}${rh}<p class="small muted" style="margin:0 0 4px">Using ${rs.label}. ${tipButton(
    `Hard sets per region against the minimum of your weekly targets. On or past the dashed ring is on target.${plan.length ? ' On plan: ' + ON_PLAN_TIP : ''}${rs.first || rs.src._ff ? ' ' + (rs.back ? BACK_WEEK_WHY : FIRST_WEEK_WHY) : ''}`,
    'Reading the chart'
  )}</p><div class="chartbox tall"><canvas id="chRadar"></canvas></div>${chartFallback()}
  <table class="t" style="margin-top:8px"><tr><th>Region</th><th class="r">Sets</th><th class="r">Minimum</th><th class="r">Of minimum</th></tr>
  ${regs.map(rg => {
    const c = rg.low ? (rs.week ? 'part' : 'yellow') : rg.plan ? 'plan' : rg.high ? 'blue' : 'green';
    return html`<tr><td><span class=${`plate ${c}`} style="height:12px;vertical-align:-1px"></span> ${rg.label}</td><td class="r num">${r1(rg.got)}</td><td class="r muted small">${r1(rg.lo)}</td><td class="r num">${rg.lo > 0 ? Math.round(rg.pct) + '%' : html`<span class="muted small">no minimum</span>`}</td></tr>`;
  })}</table>
  ${note ? html`<p class="small muted" style="margin-top:6px">${note}</p>` : nothing}</div>`;
}

/* Volume section, "Weekly trend" mode: one muscle over time against its band. */
function trendBody(): TemplateResult {
  const f = firstDate(state.sessions);
  return html`<div class="card"><p class="small muted" style="margin:0 0 4px">Hard sets a week for one muscle, from your first logged week. Solid is sets with RIR logged; faded is sets counted as hard because RIR was blank. Weeks ahead are empty until you get there.</p><select data-bind="dashMuscle">${MUSCLES.map(
    ([k, l]) => html`<option value=${k} .selected=${live(ui.dashMuscle === k)}>${l}</option>`
  )}</select>${muscleHeadline(ui.dashMuscle)}${f ? html`${rangeChips('muscle', weeksSpan(f), CHART_WEEKS)}<div class="chartbox"><canvas id="chMuscle"></canvas></div>${chartFallback()}` : html`<p class="small muted">Log a session to start this chart.</p>`}</div>`;
}

/* ---------- Lifts ---------- */

/* What to do next on this lift, the same target its next session shows
   (r41, V: guide how to progress rather than predict where it lands). */
function nextLine(exId: string): Part {
  // EX() reads a deleted exercise as archived, so this covers both.
  if (EX(exId).archived) return '';
  // The plan of the next day due that has this lift: one lift on a heavy and a light day has two targets (review of r41).
  const R = activeRoutine();
  const d = nextDayWith(exId, R);
  const sg = suggest(exId, d ? planFor(exId, R, d.id) : planFor(exId, R), { deload: isDeloadWeek() });
  const why = whyTarget(sg);
  return sg && sg.target
    ? html`<p class="small" id="nextLine" style="margin:6px 0 0"><b>Next session</b>: ${sg.target}${why ? html` ${tipButton(why, 'Why this target')}` : nothing}</p>`
    : '';
}
/* The next training day due that has the lift, or null: on a weekly plan
   today's weekday, or tomorrow's once today's day is logged (review of r41:
   a Monday heavy day done still showed Monday's target over Thursday's);
   on a cycle the cycle's next day, which already counts what is logged. */
function nextDayWith(exId: string, R: Routine): Routine['days'][number] | null {
  const n = R.days.length;
  if (!n) return null;
  let start: number;
  if (R.schedule === 'weekly') {
    const wd = dayOfWeek(today());
    start = state.sessions.some(x => x.date === today() && x.routineId === R.id && sessDayIdx(R, x) === wd)
      ? (wd + 1) % n
      : wd;
  } else start = cycleState(R).next;
  for (let k = 0; k < n; k++) {
    const d = R.days[(start + k) % n];
    if (d && !d.rest && d.items.some(it => it.exId === exId)) return d;
  }
  return null;
}

/** A lift's goal on Stats: where it stands and a way to change it, or a way to set one. */
export function goalLine(exId: string): Part {
  const ex = EX(exId);
  if (!goalOk(ex)) return '';
  if (!ex.goal)
    return html`<p class="small" style="margin:6px 0 0"><button class="linkbtn tall" data-act="goalOpen" data-ex=${exId}>Set a goal</button></p>`;
  const s = goalState(exId);
  if (!s) return '';
  const gw = goalWords(ex, ex.goal);
  const gap = s.cur != null ? fmtE(goalGap({ g: s.g, cur: s.cur })) : '';
  const what = s.hit
    ? `reached ${fmtDate(s.hit)}`
    : s.noBw
      ? 'add a weigh-in to see how close'
      : s.pct == null
        ? `no sets in the last ${BEST_WEEKS} weeks`
        : s.pct >= PERCENT
          ? 'within reach'
          : `${Math.floor(s.pct)}% there${estInLoad(ex) && +gap > 0 ? `, about ${gap} ${U()} to go` : ''}`;
  const tip = s.hit
    ? 'Reached: a working set at that load or more, for those reps or more.'
    : s.pct != null && s.pct >= PERCENT
      ? `Your best estimate from the last ${BEST_WEEKS} weeks says ${gw} done to failure is in you now. It counts as reached once a working set matches it.`
      : `Your best estimate from the last ${BEST_WEEKS} weeks against what ${gw} takes done to failure. Your session targets are the steps toward it.`;
  return html`<p class="small" id="goalLine" style="margin:6px 0 0"><b>Goal ${gw}</b>: ${what} ${tipButton(tip, 'About this goal')} <button class="linkbtn tall" data-act="goalOpen" data-ex=${exId}>Change</button></p>`;
}

/* bwAt() falls back to the earliest logged bodyweight for any date before that
   entry, because dropping those sets would erase the trend entirely. That is a
   defensible estimate but it is still a number from the future, so say so
   rather than letting it pass as measured. */
function bwBackfillNote(exId: string): Part {
  const ex = EX(exId);
  if (!ex.bw || !state.bodyweights.length) return '';
  let first: string | null = null;
  for (const b of state.bodyweights) if (!first || b.date < first) first = b.date;
  if (!first) return '';
  const f = first;
  const n = (IDX().byEx[exId] || []).filter(x => x.date < f).length;
  if (!n) return '';
  return html`<p class="small" style="color:var(--yellow);margin-top:6px">${n} session${n === 1 ? '' : 's'} here predate your first bodyweight entry (${fmtDate(f)}), so ${n === 1 ? 'it uses' : 'they use'} that weight as an estimate rather than a measurement.</p>`;
}

/** All-time bests: each lift's best estimate and heaviest set, its rep bests a tap away, and how many lifts it lists. */
export function bestsBoard(): { n: number; html: TemplateResult } {
  const I = IDX();
  const rows = Object.keys(I.byEx)
    .map(id => allTimeBests(id))
    .flatMap(r => (r ? [r] : []))
    // Newest record first, then by name (a lift with no dated record compares equal, as before).
    .sort((a, b) => {
      const x = a.last,
        y = b.last;
      return x != null && y != null && x !== y ? (x < y ? 1 : -1) : a.ex.name.localeCompare(b.ex.name);
    });
  if (!rows.length) return { n: 0, html: html`<p class="muted">Your bests appear here after your first session.</p>` };
  // A bodyweight lift's estimate includes the body, so it says total; its sets read BW+x.
  const u = (ex: { bw?: boolean | undefined }): string => ' ' + U() + (ex.bw ? ' total' : '');
  // The newest BESTS_SHOWN first; the rest one tap away, so the list stays short on a phone.
  const shown = ui.bestsAll ? rows : rows.slice(0, BESTS_SHOWN);
  return {
    n: rows.length,
    html: html`<div class="bests">${shown.map(r => {
      const ex = r.ex;
      /* Each best carries its own date (r30): one date at the end, the newest
         record of any kind, read as the date of the heaviest set. A 1RM is shown
         for compound lifts only. */
      const est = r.est && isCompound(ex) ? r.est : null;
      const top = [
        est ? `best est ${fmtE(est.v)}${u(ex)}${loadNote(ex)}, ${fmtDate(est.date)}` : '',
        r.heavy ? `heaviest ${setShort(ex, r.heavy.p.w, r.heavy.p.r)}${loadNote(ex)}, ${fmtDate(r.heavy.date)}` : ''
      ]
        .filter(Boolean)
        .join(' · ');
      return html`<details class="bx" data-ex=${ex.id}><summary><span class="bn">${ex.name}</span><span class="bs">${top}</span></summary>
    ${est ? html`<p class="small" style="margin:0 0 6px">Best estimate from ${setShort(ex, est.p.w, est.p.r)}.</p>` : nothing}
    <table class="t"><tr><th>${ex.assist ? 'Load' : loadHead(ex)}</th><th class="r">${ex.timed ? 'Seconds' : 'Reps'}</th><th class="r">First done</th></tr>${r.front.map(
      f =>
        html`<tr><td class="num">${loadLabel(ex, f.p.w)}</td><td class="r num">${f.p.r}</td><td class="r">${fmtDate(f.date)}</td></tr>`
    )}</table></details>`;
    })}</div>${rows.length > shown.length ? html`<button class="btn sm" style="margin-top:8px" data-act="bestsAll">Show all ${rows.length} lifts</button>` : nothing}<p class="small muted hastip" style="margin:8px 0 0" data-tip="For each load, the most reps you have done, where no heavier set did as many. Beating a line at 90% or more of your strongest set is a rep PR. The best estimate (compound lifts) is the highest estimated 1RM from any set, in the frame you log in. Warm-ups and drop sets are left out.">How to read this</p>`
  };
}

/* ---------- Muscles: readiness and size ---------- */

/* The check-in against how sessions went: readiness and its words are in
   coach.ts since r52; this draws them. */
function readinessBody(): TemplateResult {
  const r = readiness();
  if (r.n < READINESS_MIN)
    return html`<p class="small muted hastip" style="margin:0" data-tip=${`Answer the three check-in taps at the start of a session (sleep, energy, aches). After ${READINESS_MIN} sessions with answers, this shows whether they line up with how your lifts go.`}>Needs ${READINESS_MIN} sessions with a check-in${r.n ? `; ${r.n} so far` : ''}.</p>`;
  return html`${r.rows.map(
    q =>
      html`<p class="small" style="margin:6px 0"><b>${q.l}.</b> ${q.groups
        .map(g =>
          g.sessions >= 2 && g.rate != null
            ? `${chkWord(g.name)}: ${Math.round(g.rate)}% of lifts set a PR (${g.sessions} sessions)`
            : `${chkWord(g.name)}: ${g.sessions ? `${g.sessions} session${g.sessions === 1 ? '' : 's'}, too few` : 'none yet'}`
        )
        .join('; ')}.</p>`
  )}<p class="small muted hastip" style="margin:6px 0 0" data-tip="A pattern in your own log, not proof of cause. A gap of a few points is noise.">From ${r.n} sessions</p>`;
}

function sizeBody(): TemplateResult {
  const rows = sizeRows();
  const ML2: Record<string, string> = Object.fromEntries(MEAS);
  if (!rows.length)
    return html`<p class="muted">Log tape measurements at least ${TAPE_WEEKS.from} weeks apart on the Today tab, under Body, then Tape measurements. Arm, chest, thigh, and calf are read against the hard sets their muscles got in between.</p>`;
  const ms = [...state.measurements].sort((a, b) => (a.date < b.date ? -1 : 1));
  const ctx = (r: { from: string; to: string }): string => {
    const w = ms.filter(m => (m.waist ?? 0) > 0 && m.date >= r.from && m.date <= r.to);
    const w0 = w[0],
      w1 = w[w.length - 1];
    const wd = w.length >= 2 && w0 && w1 ? (w1.waist ?? 0) - (w0.waist ?? 0) : null;
    const b0 = bwAt(r.from),
      b1 = bwAt(r.to);
    const bd = b0 != null && b1 != null && state.bodyweights.length >= 2 ? b1 - b0 : null;
    const bits: string[] = [];
    if (wd != null) bits.push(`waist ${wd >= 0 ? '+' : ''}${lenD(wd)} ${LU()}`);
    if (bd != null) bits.push(`bodyweight ${bd >= 0 ? '+' : ''}${fmtW(bd)} ${U()}`);
    return bits.length ? ` Same stretch: ${bits.join(', ')}.` : '';
  };
  const sgn = (v: number): string => (v >= 0 ? '+' : '') + lenD(v);
  // Under TAPE_NOISE_CM is within what a tape repeats to.
  const mdc = (k: string): number => (k === 'chest' ? TAPE_NOISE_CM.chest : TAPE_NOISE_CM.other);
  /* Rows measured on the same days share their stretch, waist, and
     bodyweight, so those are said once above them (r34, V: the same sentence
     under every row). */
  const span = (r: { from: string; to: string }): string => `${fmtDate(r.from)} to ${fmtDate(r.to)}`;
  const r0 = rows[0];
  const one = !!r0 && rows.every(r => span(r) === span(r0) && ctx(r) === ctx(r0));
  const c0 = r0 ? ctx(r0) : '';
  const top =
    one && r0
      ? html`<p class="small muted" style="margin:0 0 4px">${span(r0)}${c0 ? c0.replace(/^ Same stretch: /, ': ') : '.'}</p>`
      : nothing;
  const what = (r: { weeks: number; sets: number; mus: readonly string[] }): string =>
    r.weeks
      ? `${r1(r.sets)} hard sets a week for ${andList(r.mus.map(m => ML[m] || m))}`
      : 'no logged training in between';
  return html`${top}${rows.map(
    r =>
      html`<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row spread"><b>${ML2[r.k]}</b><span class="num">${Math.abs(r.d) < mdc(r.k) ? html`<span class="tag">within tape error</span> ` : nothing}${sgn(r.d)} ${LU()}</span></div><p class="small muted" style="margin:2px 0 0">${one ? '' : `${span(r)}, `}${what(r)}.${one ? '' : ctx(r)}</p></div>`
  )}<p class="small muted hastip" style="margin-top:8px" data-tip="Same spot, same time of day, before training, relaxed or flexed the same way each time. Under about 1 cm on arms, thighs, calves, and neck (1.5 cm on the chest) is within what a tape repeats to.">How to measure</p>`;
}

/* ---------- Body ---------- */

function bwRateText(): TemplateResult {
  const r = bwRate();
  const g = state.settings.bwGoalPct;
  if (!r)
    return html`<p class="small muted" style="margin-top:6px">Log bodyweight for at least two weeks to see your weekly rate of change.</p>`;
  const sign = (v: number): string => (v >= 0 ? '+' : '') + r1(v);
  // The dates it covers, not "the last N days", which read as up to today (r34.2: said 43 days after the last weigh-in).
  const goal =
    g != null
      ? (() => {
          const d = r.pct - g;
          return (
            ` Goal ${sign(g)}%: ` +
            (Math.abs(d) <= BW_GOAL_TOL
              ? 'on track.'
              : d > 0
                ? `running ${r1(d)} points above it.`
                : `running ${r1(-d)} points below it.`)
          );
        })()
      : '';
  return html`<p class="small" style=${`margin-top:6px;${g != null && Math.abs(r.pct - g) > BW_GOAL_TOL ? 'color:var(--yellow)' : ''}`}><b>${bwWeekTxt(r)}</b>${g != null ? ` (${sign(r.pct)}%)` : ''}, ${fmtDate(r.from)} to ${fmtDate(r.to)}. ${tipButton(
    `From 7-day averages, so a single heavy or light day does not swing it. ${sign(r.pct)}% of your bodyweight a week.`,
    'How this is worked out'
  )}${goal}</p>`;
}

/* Waist to height: a waist under half your height is the usual cut-off for
   healthy central fat, and unlike BMI it does not penalise muscle. NICE 2022:
   under 0.5 healthy, 0.5 to 0.59 increased, 0.6 or more high central-fat
   risk. A screening number, not a diagnosis; measured midway between the
   lowest rib and the top of the hip bone. `prompt` asks for the height when
   it is missing (Today's tape measurements). */
/** The waist to height line, from the last waist measured and the height, or nothing. */
export function whtrLine(prompt?: boolean): Part {
  const hc = state.settings.heightCm;
  const w = [...state.measurements].filter(m => (m.waist ?? 0) > 0).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (!w || w.waist == null) return '';
  if (!hc) return prompt ? html`<p class="small muted whtr">Add your height above to see waist to height.</p>` : '';
  // Banded on the number shown, so 0.4997 cannot read "0.50 · healthy range".
  const r = Math.round((w.waist / hc) * HUNDREDTHS) / HUNDREDTHS;
  const band =
    r < WHTR[0] ? ['green', 'healthy range'] : r < WHTR[1] ? ['yellow', 'increased risk'] : ['red', 'high risk'];
  return html`<p class="small whtr"><b>Waist to height ${r.toFixed(2)}</b> <span class=${`tag ${band[0]}`}>${band[1]}</span> <span class="muted hastip" data-tip=${`Waist ${lenD(w.waist)} ${LU()} on ${fmtDate(w.date)}, height ${heightTxt(hc)}. ${whtrBands(x => x.toFixed(2), 'Under')} (NICE 2022). A screening number: measure midway between the lowest rib and the top of the hip bone. Unlike BMI it does not count muscle against you.`}>how it reads</span></p>`;
}

function measTable(): TemplateResult {
  const ms = [...state.measurements].sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = ms[0],
    last = ms[ms.length - 1];
  if (!first || !last) return html`<p class="small muted">No tape measurements yet.</p>`;
  // A site read by its key; one not measured is blank.
  const at = measAt;
  return html`${whtrLine()}<div class="scroll-x"><table class="t" style="margin-top:8px"><tr><th>Site (${LU()})</th><th class="r">${fmtDate(first.date)}</th><th class="r">${fmtDate(last.date)}</th><th class="r">Change</th></tr>${MEAS.map(
    ([k, l]) => {
      const a = at(first, k),
        b = at(last, k);
      return html`<tr><td>${l}</td><td class="r">${lenD(a)}</td><td class="r">${lenD(b)}</td><td class="r">${a != null && b != null && ms.length > 1 ? (b - a >= 0 ? '+' : '') + lenD(b - a) : ''}</td></tr>`;
    }
  )}</table></div>`;
}

const k0 = (ws: string): string => (ws === weekStart(today()) ? 'This wk' : fmtDate(ws));

/* ---------- Stats ---------- */

const VOL_HELP =
  `Hard sets per muscle. Direct work counts 1, secondary counts ${HELPER_CREDIT}. A set counts as hard when you logged RIR ${HARD_RIR} or less. A blank RIR is read as your usual RIR on that lift once you have rated ${RIR_USUAL_MIN} of its sets in the last ${CAL_WEEKS} weeks, and until then counts as hard, because most working sets are. Blank sets are shaded lighter so you can see how much of the bar is measured and how much is assumed. Amber is under your weekly target, green is inside it, blue is over. In This week, pale green is short of the minimum while the week is still going. Below and above are judged at the one decimal shown. By region measures each region against its minimum, so ${PERCENT}% is on target; it averages your last ${REGION_WK_DEFAULT} full weeks unless you pick ${REGION_WKS.map(
    ([n]) => n
  )
    .filter(n => n !== REGION_WK_DEFAULT)
    .join(' or ')} above the chart (the radar only: flags and the coach always use ${AVG_WEEKS}). ` +
  FIRST_WEEK_WHY +
  ' Load is total weight × reps per week, comparable week to week but not session to session.';
const LIFTS_HELP = `Estimated 1RM uses reps to failure, which is reps plus RIR: Brzycki up to ${BRZYCKI_TOP}, Epley at ${BRZYCKI_TOP + 1} and ${E1_MAX_REPS}, none above ${E1_MAX_REPS} or for a set called above RIR ${E1_MAX_RIR}. A blank RIR reads as your usual RIR on that lift once you have rated ${RIR_USUAL_MIN} of its sets in ${CAL_WEEKS} weeks; until then it counts as 0, so the estimate errs low. Numbers stay in the frame you log in, per dumbbell or per side where that applies. Bodyweight lifts add the share of your bodyweight they move: all of it for pull-ups and dips, ${pctOf(BWF.pushup)}% for push-ups. Lifts that turn about one joint (leg raises, crunches, Nordics) get no estimate; their progress is reps and load. Trends read the average of each session's working sets and need ${TREND_MIN.sessions} sessions over ${TREND_MIN.days / WEEK_DAYS} weeks or more within ${TREND_WEEKS} weeks. A heavy single before back-off sets counts toward bests only. Moving or falling means past ${GROW_PCT}% with a clear trend, since estimates swing ${DAY_SWING_PCT[0]} to ${DAY_SWING_PCT[1]}% day to day. A PR is a weight PR (more weight than any earlier set), a new best estimate within its range of reps to failure (${BAND_RANGES.join(', ')}), or a rep PR (more reps at a load than any earlier set); a set that is more than one shows the first. Stalled: flat or falling over your last ${STALL.sessions} sessions, or ${STALL.days / WEEK_DAYS} weeks if that covers more (at least ${STALL.min} sessions), with no PR in the last ${STALL.noProgress}, no heavier load, and no more reps at the same load, not counting sessions done lighter; a lift on two rep ranges is stalled only when it is in both.`;
const MUSCLES_HELP = `Muscles are flagged because the trend is falling, or flat with one of its lifts stalled, or the hard sets you logged average below your target, or you named it a priority, or you flagged an injury. A muscle is never flagged for what the routine plans, only for what you log. A muscle whose strength is rising is never flagged. Strength return on volume: the median change in estimated 1RM across a muscle's main exercises over up to ${TREND_WEEKS} weeks (each lift with ${MUSCLE_TREND_MIN.sessions} sessions over ${MUSCLE_TREND_MIN.days / WEEK_DAYS} weeks or more), in the current rep range, next to the hard sets a week that produced it. This measures strength, not size: early gains are largely neural, and high-rep estimates are noisy. Size check reads your tape measurements, which are the closer signal for size.`;
const CONSISTENCY_HELP = `${HEAT_WEEKS} weeks from your first logged session; once you have more, the latest ${HEAT_WEEKS}, with All for the rest. Faded squares are days still ahead. Filled squares are days with a logged lifting session. The streak counts weeks that hit the sessions your routine plans. Cardio minutes are shown under the grid and never count as lifting sessions. Adherence is the planned sessions done over the previous ${AVG_WEEKS} full weeks, each week counted up to its plan.`;

/** Stats, as a template of the log and `ui`; its charts are drawn after it (graphs.ts, mountCharts). */
export function viewDash(): TemplateResult {
  chartNoticeUsed = false;
  const I = IDX();
  const R = activeRoutine();
  /* Adherence counts only days the routine actually plans work on: a non-rest
     day with no exercises in it used to inflate the denominator. Each week is
     capped at its own planned days, so training seven days against a six-day
     routine no longer reports 117%. The window is the four completed weeks
     before this one, which the label now says out loud. */
  const planned = freeMode() ? 0 : trainDaysOf(R) * weekFactor(R);
  const cur = weekStart(today());
  const sessDates = new Set(Object.keys(dateIndex().byDate));
  /* Only weeks since your first session count. Before that there was nothing
     to adhere to, and counting those weeks read 0% on day one. */
  const firstWk = firstFullWeek();
  let done4 = 0,
    wks4 = 0,
    need4 = 0;
  for (let k = 1; k <= AVG_WEEKS; k++) {
    const ws = addDays(cur, -WEEK_DAYS * k);
    if (!firstWk || ws < firstWk) break;
    if (isRestWeek(ws)) continue;
    wks4++;
    // Sessions, as the ring, This week, and the streak count them (r46: distinct days read a two-a-day as one).
    const n = weekSessions(ws);
    // What the week asked for, as the streak reads it (r55: the routine as recorded by its sessions).
    const nw = weekNeed(ws);
    done4 += Math.min(n, nw);
    need4 += nw;
  }
  const adher = planned && wks4 && need4 > 0 ? Math.round((done4 / need4) * PERCENT) : null;
  const thisWeek = I.weekSets[cur] || {};
  const thisWeekConf = I.weekConf[cur] || {};
  // Each set once, as on Today. Summing the per-muscle counts double counts
  // secondary work (a bench set is 1 chest + 0.5 triceps + 0.5 delts).
  const wkHard = weekStats().got;
  const stalled = Object.entries(I.exStats).flatMap(([id, s]) => (s && s.stalled ? [[id, s] as const] : []));
  // How much of the last 4 weeks of volume is measured rather than assumed.
  const rc = I.rirCov;
  const covPct = rc.total && state.settings.rirMode !== 'off' ? Math.round((rc.logged / rc.total) * PERCENT) : null;
  // Only said when it matters: under RIR_COVER_PCT of recent sets carry an RIR.
  const cov =
    covPct == null || covPct >= RIR_COVER_PCT
      ? ''
      : html`<p class="small muted hastip" style="margin:0 0 12px" data-tip="A blank RIR is read as your usual RIR on that lift once you have rated 3 of its sets in 12 weeks, else the set counts as hard. The lighter shading shows those sets.">RIR on ${covPct}% of recent sets. The lighter part of each bar is assumed.</p>`;
  const nS = state.sessions.length;
  const first = sortedSessions()[0];
  const head = html`${pageTitle('', 'Stats', noLog() ? 'Nothing logged yet' : `${nS} session${nS === 1 ? '' : 's'} logged${first ? `, since ${fmtDate(first.date)}` : ''}`, helpButton('stats'), true)}${howText(
    'stats',
    'Everything here is calculated from your logged sets: performance trends, not direct measurements of muscle size. Tap a section title to open or fold it. Inside each section, How this works says what its numbers mean.'
  )}
  <nav class="jump" aria-label="Stats sections">${orderKeys(state.settings.secOrder.dash || [], DSEC_KEYS)
    .filter(k => !state.settings.hidden.includes('dash:' + k))
    .flatMap(k => DSECS.filter(x => x[0] === k))
    .map(([k, l]) => html`<button class="chip" data-act="dashJump" data-sec=${k}>${l}</button>`)}</nav>`;
  const none = !nS
    ? html`<div class="card"><p style="margin:0"><b>No sessions yet.</b> Trends start after a few sessions. ${tipButton('Trends, stall detection, and rankings need a few sessions of each exercise. To preview the full Stats page, load demo data in Settings.', 'About Stats')}</p></div>`
    : nothing;
  /* The tiles count what was done (V, 2026-10-13: less anchoring on the
     plan): sessions and PRs in the last 28 days, with the 28 before when the
     log reaches back that far, so month on month reads at a glance.
     Adherence stays in Consistency, hard sets against the plan in Volume and
     This week. PRs are the ones Recent PRs lists (big). */
  const R4 = recent4w();
  const prs4 = R4.prs.length;
  const was = (n: number): string => (R4.back ? ` (${n} in the ${RECENT_WEEKS} weeks before)` : '');
  const kpis = html`<div class="kpis"><div class="kpi"><div class="v">${nz(R4.sess)}</div><div class="l">Sessions, last ${RECENT_WEEKS} weeks${was(R4.sessP)}</div></div>
  <div class="kpi"><div class="v">${nz(prs4)}</div><div class="l">PRs, last ${RECENT_WEEKS} weeks${was(R4.prsP)}</div></div>
${extraKpis()}</div>${nS ? dashSummary() : nothing}`;

  const avg = actualAvg4();
  const plan = plannedSets(R);
  const avgSt = avg ? muscleStatus(avg) : null;
  const confOff = state.settings.rirMode === 'off';

  // volume: five ways to read the same hard-set counts, plus tonnage
  const volCard = (): TemplateResult => {
    if (ui.volMode === 'region') return regionBody();
    if (ui.volMode === 'trend') return trendBody();
    if (ui.volMode === 'load')
      return html`<div class="card">${volHeadline()}${nS ? html`${rangeChips('vol', weeksSpan(firstDate(state.sessions)), CHART_WEEKS)}<div class="chartbox"><canvas id="chVol"></canvas></div>${chartFallback()}` : html`<p class="small muted">Log a session to start this chart.</p>`}</div>`;
    if (ui.volMode === 'week')
      return html`<div class="card">${MK.some(m => (thisWeek[m] || 0) > 0) ? volumeRows(thisWeek, confOff ? null : thisWeekConf, true) : html`<p class="muted" style="margin:0">Nothing logged this week yet.</p>`}</div>`;
    if (avg)
      return html`<div class="card"><p class="small muted" style="margin:0 0 6px">Averaged over ${avgWeeksTxt(avg)}. Weeks with no sessions are left out rather than counted as zero.</p>${volumeRows(avg, confOff ? null : avg._conf)}</div>`;
    const w = avgWait();
    return html`<div class="card"><p class="muted">${w.lead}An average ${w.kind === 'back' ? 'comes back' : 'starts'} after ${w.after}.${w.kind === 'second' ? html` ${tipButton(w.why, 'Your first week')}` : nothing}</p></div>`;
  };
  const volSec = dashSection(
    'volume',
    'Volume',
    VOL_HELP,
    html`${cov}
  <div class="chips">${VOL_MODES.map(([k, l]) => html`<button class=${ui.volMode === k ? 'chip on' : 'chip '} data-act="volMode" data-v=${k}>${l}</button>`)}</div>
  ${volCard()}`,
    noLog() ? 'Nothing logged yet' : `${wkHard} hard sets this week`
  );

  // muscles: weak points, then return on volume folded beneath
  const inj = injuredSet();
  const reasons: Record<string, [string, string][]> = {};
  const add = (m: string, t: string, c: string): void => {
    (reasons[m] || (reasons[m] = [])).push([t, c]);
  };
  for (const m of inj) add(m, 'Injured, targets paused', 'red');
  // A falling trend is lagging strength; a stalled lift with no clear trend says just that (r32: "Lagging strength" beside "unclear").
  for (const s of I.scores)
    if (s.label === 'lagging' && !inj.has(s.m))
      add(s.m, s.clear ? (s.indirect ? 'Lagging strength (indirect)' : 'Lagging strength') : 'A lift stalled', 'red');
  // Plan and actual being under band is one fact about one muscle, not two.
  // Counting it twice also pushed it up a sort that ranks by flag count.
  // A shortfall in the plan alone is not a weak point (r28): a new person
  // who picked a ready-made routine saw "18 flagged" in amber before
  // logging a set. Plan's Weekly volume shows the plan against the targets.
  for (const m of MK) {
    if (inj.has(m)) continue;
    if (!hasTarget(m)) continue;
    // One tag since r29; the routine's plan, when it is the reason, is in the line below.
    // The status every screen reads (muscleStatus): a muscle on plan is not flagged (r54).
    if (avgSt && avgSt[m] && avgSt[m].st === 'under') add(m, 'Below target', 'yellow');
  }
  for (const m of state.settings.priorities) add(m, 'Your priority', 'blue');
  const wp = Object.entries(reasons).sort((a, b) => b[1].length - a[1].length);
  const weakBody = html`<div class="card">${
    wp.length
      ? wp.map(([m, rs]) => {
          const tags = rs.map(([t, c]) => html`<span class=${`tag ${c}`}>${t}</span>`);
          /* A flagged joint (the injury sheet lists joints first) has no sets
             or target to show: its name and its tag. r57 and before read it as
             a muscle and the whole screen failed to draw (r58). */
          if (!MK.some(x => x === m))
            return html`<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row spread"><b>${injLabel(m)}</b><div class="chips">${tags}</div></div></div>`;
          const [lo, hi] = bandOf(m);
          /* The number a flag is judged on comes first (r29): the line led with
             this week, so "this week 10.5 of 10-20" sat beside Below target,
             which comes from the average. */
          const hs = (v: number): string => `${r1(v)} hard set${r1(v) === 1 ? '' : 's'}`;
          const bits = avg
            ? [`${hs(avg[m] || 0)} a week on average, target ${lo}-${hi}`, `this week ${r1(thisWeek[m] || 0)}`]
            : [`this week ${hs(thisWeek[m] || 0)} of ${lo}-${hi}`];
          if (belowMin(plan[m], lo)) bits.push(`your routine plans ${r1(plan[m] || 0)}`);
          return html`<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row spread"><b>${ML[m]}</b><div class="chips">${tags}</div></div><p class="small muted" style="margin:2px 0 0">${bits.join(' · ')}</p></div>`;
        })
      : html`<p class="muted" style="margin:0">${nS ? 'Nothing flagged.' : 'Flags start once you have logged a few sessions.'}</p>`
  }</div>`;

  // stalls (folded inside Lifts, after Recent PRs and All-time bests since r28)
  const bigN = stalled.length ? fatigueStalls(stalled.map(([id]) => id)).length : 0;
  const lw = lastLighterWeek();
  const stl = html`${
    stalled.length
      ? html`${stalled.map(
          ([id, s]) =>
            html`<div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--line)"><span><span class="plate yellow" style="height:14px;vertical-align:-2px"></span> ${exName(id)}</span><span class="muted small">last ${fmtDate(s.last.date)}</span></div>`
        )}${bigN >= FATIGUE_STALLS ? html`<p class="small hastip" style="color:var(--red);margin-top:8px" data-tip="Several main lifts flat together often points to fatigue. Check sleep, food, and stress; Deload week is under More options on Today (half the sets, about 90% loads, kept out of your trends). Isolation and core lifts are not counted here.">${bigN} main lifts stalled at once: likely fatigue</p>` : nothing}`
      : html`<p class="muted">No stalls detected.</p>`
  }${
    lw
      ? html`<p class="small muted" style="margin-top:8px">${lw.weeks == null ? 'No lighter week in the last 12.' : `Last lighter week: ${lw.weeks} week${lw.weeks === 1 ? '' : 's'} ago${lw.kind === 'rest' ? ' (a rest week)' : lw.kind === 'off' ? ' (a week off)' : ''}.`} ${tipButton(LIGHTER_WEEK_TIP, 'Lighter week')}</p>`
      : nothing
  }`;

  // exercise trend
  const withData = Object.keys(I.byEx)
    .filter(id => (I.byEx[id] || []).length)
    .sort((a, b) => exName(a).localeCompare(exName(b)));
  const nOf = (id: string): number => (I.byEx[id] || []).length;
  // Opens on the lift logged most often (r28), not the first in the alphabet; the list stays alphabetical.
  if (!ui.dashEx || typeof ui.dashEx !== 'string' || !I.byEx[ui.dashEx])
    ui.dashEx = withData.length
      ? [...withData].sort((a, b) => nOf(b) - nOf(a) || exName(a).localeCompare(exName(b)))[0]
      : null;
  const exId = typeof ui.dashEx === 'string' ? ui.dashEx : null;
  const exh = html`<div class="card">${exId ? liftCard(exId, withData) : html`<p class="muted">Log a session to see exercise trends.</p>`}</div>`;
  const bests = bestsBoard();
  // Counted PRs only (r32), the same ones as the count beside the title.
  const bigPR = I.prs.filter(p => p.big);
  const prBody = bigPR.length
    ? html`${bigPR.slice(0, PRS_SHOWN).map(p => {
        const ex = EX(p.exId);
        const iso = p.type === 'e1RM' && !isCompound(ex);
        const ps = iso ? prSet(p.exId, p.date) : null;
        const tag = ex.timed && p.type === 'Rep PR' ? 'Time PR' : p.type === 'e1RM' ? (iso ? 'PR' : prName(p)) : p.type;
        const val =
          p.type === 'e1RM'
            ? iso
              ? ps
                ? setShort(ex, ps.w, ps.r)
                : ''
              : fmtE(p.value) + ' ' + U()
            : setShort(ex, p.w, p.r);
        return html`<div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${ex.name} <span class=${`tag ${p.type === 'Rep PR' ? 'blue' : 'green'}`}>${tag}</span></span><span class="num">${val} <span class="muted small">${fmtDate(p.date)}</span></span></div>`;
      })}`
    : html`<p class="muted">No PRs yet. Your first session of an exercise sets the baseline.</p>`;
  const nLifts = Object.keys(I.byEx).length;
  const firstPR = bigPR[0];
  const liftsSec = dashSection(
    'exercise',
    'Lifts',
    LIFTS_HELP,
    html`${exh}${dashSub('prs', 'Recent PRs', prBody, noLog() ? 'none yet' : prs4 || !firstPR ? `${prs4} in ${RECENT_WEEKS} weeks` : `latest ${fmtDate(firstPR.date)}`)}${dashSub(
      'bests',
      'All-time bests',
      bests.html,
      bests.n ? `${bests.n} lift${bests.n === 1 ? '' : 's'}` : 'none yet'
    )}${dashSub('stalls', 'Stalls', stl, stalled.length ? html`<span class=${`pill ${bigN >= FATIGUE_STALLS ? 'red' : 'yellow'}`}>${stalled.length} stalled</span>` : 'none')}`,
    noLog() ? 'Nothing logged yet' : `${nLifts} lift${nLifts === 1 ? '' : 's'} tracked`
  );

  // consistency heat map
  // Starts at your first logged week; weeks ahead fill a young log.
  const hFirst = firstDate(state.sessions);
  const hWin = weekWindow(hFirst, 'heat', HEAT_WEEKS);
  const hN = weeksSpan(hFirst);
  const t = today();
  // r25: each past day is a button, so a square opens that date (calDay).
  const squares = hWin.flatMap(w =>
    Array.from({ length: WEEK_DAYS }, (_, i) => i).map(i => {
      const d = addDays(w.wk, i);
      const c = `${sessDates.has(d) ? 'on' : ''} ${d > t ? 'fut' : ''} ${d === t ? 'today' : ''}`;
      const tip = `${fmtDateLong(d)}${sessDates.has(d) ? ': lifted' : ''}`;
      return d > t
        ? html`<div class=${c} data-tip=${tip}></div>`
        : html`<button type="button" class=${c} data-act="calDay" data-date=${d} data-tip=${tip} aria-label=${`${tip}. Open`}></button>`;
    })
  );
  const heatGrid = hWin.length
    ? html`<div class="heat">${squares}</div>`
    : html`<div class="heat"></div><p class="small muted" style="margin:6px 0 0">Your first logged session starts this grid.</p><div></div>`;
  // Cardio and mobility minutes a week, from your first cardio week only: no rows of zero before it.
  const cf = firstDate(state.cardio);
  const cn = Math.min(CARDIO_WEEKS, weeksSpan(cf));
  const crows: { ws: string; min: number }[] = [];
  for (let k = cn - 1; k >= 0; k--) {
    const ws = addDays(cur, -WEEK_DAYS * k),
      we = addDays(ws, SUNDAY);
    crows.push({ ws, min: state.cardio.filter(c => c.date >= ws && c.date <= we).reduce((a, c) => a + c.min, 0) });
  }
  const cmx = Math.max(1, ...crows.map(r => r.min));
  const cw = state.cardio.length
    ? html`<div class="card"><b>Cardio and mobility, minutes per week</b>${crows.map(
        r =>
          html`<div class="mrow"><span></span><span>${k0(r.ws)}</span><div class="band"><div class="fill in" style=${`width:${(r.min / cmx) * PERCENT}%`}></div></div><span class="r num">${r.min}<span class="muted small"> min</span></span></div>`
      )}</div>`
    : nothing;
  // Only once a check-in has been answered: for anyone who skips it, the fold only said it needs 6 (r41).
  const ready = readiness().n ? dashSub('ready', 'Readiness and performance', readinessBody()) : nothing;
  const heat = html`<div class="card">${rangeChips('heat', hN, HEAT_WEEKS)}<div class="heat-h">${DAYS.map(d => html`<span>${d[0]}</span>`)}</div>${heatGrid}</div>${cw}${ready}`;
  const sk = weekStreak();
  const adhLine = html`<p class="small muted" style="margin:0 0 8px" id="adhLine">${
    freeMode()
      ? 'Adherence: freestyle, no plan to follow'
      : !planned
        ? 'Adherence: no planned days'
        : adher == null
          ? 'Adherence: appears after your first full week'
          : `Adherence, previous ${wks4} full week${wks4 === 1 ? '' : 's'}: ${adher}% of planned sessions (${Math.round(done4)}/${Math.round(need4)})`
  }</p>`;
  const consSec = dashSection(
    'consistency',
    'Consistency',
    CONSISTENCY_HELP,
    noLog() ? heat : html`${adhLine}${heat}`,
    noLog() ? 'Nothing logged yet' : `${sk.weeks}-week streak${adher != null ? ` · ${adher}% adherence` : ''}`
  );

  // ranking (folded inside Muscles)
  const rank = html`<div class="card">${rankBody(avg || thisWeek)}</div>`;
  const musSec = dashSection(
    'weak',
    'Muscles',
    MUSCLES_HELP,
    html`${weakBody}${dashSub('rank', 'Strength return on volume', rank)}${dashSub('size', 'Size check', sizeBody())}`,
    wp.length
      ? html`<span class="pill yellow">${wp.length} flagged</span>`
      : nS
        ? html`<span class="pill green">none flagged</span>`
        : 'after a few sessions'
  );

  // body: chart, entry, tape, muscle map
  const nBw = state.bodyweights.length;
  const bodySec = dashSection(
    'body',
    'Body',
    'Daily bodyweight with a 7-day average. Tape changes help cross-check which muscles are actually growing.',
    html`<div class="card">${
      nBw
        ? html`${rangeChips('bw', weeksSpan(firstDate(state.bodyweights)), CHART_WEEKS, 'all')}<div class="chartbox"><canvas id="chBW"></canvas></div>${chartFallback()}`
        : html`<p class="small muted" style="margin:0">Log your bodyweight in Body on Today to start this chart.</p>${state.settings.hidden.includes('today:body') ? html`<button class="btn sm" style="margin-top:8px" data-act="secShow" data-k="today:body">Show Body on Today</button>` : nothing}`
    }${nBw ? bwRateText() : nothing}${nBw || state.measurements.length ? measTable() : nothing}</div>`,
    nBw ? `${nBw} weigh-in${nBw === 1 ? '' : 's'}` : 'not logged yet'
  );

  return html`${slotted('dash', [
    [null, head],
    [null, none],
    [null, kpis],
    ['volume', volSec],
    ['exercise', liftsSec],
    ['weak', musSec],
    ['consistency', consSec],
    ['body', bodySec]
  ])}${tabFoot('dash')}`;
}

/* "e1RM" is a lifter's word few new lifters know, so Stats says "Best
   estimate" and the tip names it (339 i, r58). */
const BEST_EST_TIP =
  'Your best estimated one-rep max (e1RM): the most that one of your sets says you could lift for a single rep, worked out from its load, its reps, and its RIR. An estimate, not a tested max.';

/* The lift picked in Lifts: its headline, next target, goal, tiles, chart,
   notes and its last sessions. 1RM figures only where a 1RM is stated (r30):
   a compound lift with sets of 12 reps to failure or fewer. Isolation lifts,
   and compound lifts done only for higher reps (a leg press for 15), show
   their best set and plot the top-set load, so the tiles, table and chart
   agree with the headline. */
function liftCard(exId: string, withData: readonly string[]): TemplateResult {
  const I = IDX();
  const st = I.exStats[exId];
  const ex = EX(exId);
  const exps = I.byEx[exId] || [];
  // One best estimate, All-time bests' (PENDING 338 1).
  const be = (allTimeBests(exId) || { est: null }).est;
  const e1Mode = isCompound(ex) && exps.some(x => x.best != null);
  const bs = e1Mode ? null : bestSet(exId);
  const n0 = noE1(ex);
  const nSess = st ? st.n : 0;
  const f0 = exps[0];
  return html`<select data-bind="dashEx" aria-label="Exercise">${withData.map(id => html`<option value=${id} .selected=${live(id === exId)}>${exName(id)}</option>`)}</select>
    <div style="margin-top:8px">${exHeadline(exId)}</div>${nextLine(exId)}${goalLine(exId)}${
      n0
        ? html`<div class="kpis" style="margin-top:8px"><div class="kpi"><div class="v">${nSess}</div><div class="l">Sessions logged</div></div><div class="kpi"><div class="v">${st && st.stalled ? 'Yes' : 'No'}</div><div class="l">Stalled</div></div></div>`
        : nothing
    }<div class="kpis" style=${`margin-top:8px${n0 ? ';display:none' : ''}`}>${
      e1Mode
        ? html`<div class="kpi"><div class="v">${be ? (ex.bw ? '≈' : '') + fmtE(be.v) : 'n/a'}</div><div class="l">Best estimate (${U()}${loadNote(ex)}) ${tipButton(BEST_EST_TIP, 'About the best estimate')}</div></div>`
        : html`<div class="kpi"><div class="v">${bs ? setShort(ex, bs.w, bs.r) : 'n/a'}</div><div class="l">Best set${loadNote(ex)}</div></div>`
    }<div class="kpi"><div class="v">${nSess}</div><div class="l">Sessions logged</div></div></div>
    ${
      n0 || !f0
        ? ''
        : html`${rangeChips('ex', weeksSpan(f0.date), CHART_WEEKS, 'all')}<div class="chartbox"><canvas id="chEx"></canvas></div>${chartFallback()}
    <p class="small muted hastip" style="margin:4px 0 0" data-tip="Filled diamond: a new best estimate (a weight PR that also set one is filled too). Hollow diamond: a rep PR or a weight PR that did not raise the estimate, which can sit below an earlier best. The thin dotted line is your RIR at the working load.">Reading the chart</p>`
    }
    ${st && st.easier ? html`<p class="small" style="color:var(--blue);margin-top:6px"><b>${easierText(ex, st.easier)}</b></p>` : ''}
    ${
      st && st.fade
        ? html`<p class="small" style="color:var(--yellow);margin-top:6px"><b>Set-to-set drop-off is widening at ${loadLabel(ex, st.fade.w)}${ex.bw ? '' : ' ' + U()}: ${st.fade.from} → ${st.fade.to} reps lost from first set to last across your last three sessions.</b> That usually means fatigue or shorter rest rather than lost strength.</p>`
        : ''
    }
    ${ex.bw && !state.bodyweights.length ? html`<p class="small" style="color:var(--yellow)">Log your bodyweight on the Today tab so this bodyweight exercise can be trended.</p>` : bwBackfillNote(exId)}
    <div class="scroll-x"><table class="t" style="margin-top:8px"><tr><th>Date</th><th>Sets</th>${e1Mode ? html`<th class="r">Best estimate</th>` : nothing}</tr>${exps
      .slice(-EX_ROWS)
      .reverse()
      .map(x => {
        const tag = sessionWord(x);
        return html`<tr><td>${fmtDate(x.date)}${I.prs.some(p => p.big && p.sid === x.sid && p.exId === exId) ? html` <span class="tag green">PR</span>` : nothing}${tag ? html` <span class="tag">${tag}</span>` : nothing}</td><td>${x.pts.map(p => setShort(ex, p.w, p.r)).join(', ')}</td>${e1Mode ? html`<td class="r num">${x.best ? (ex.bw ? '≈' : '') + fmtE(x.best) : ''}</td>` : nothing}</tr>`;
      })}</table></div>`;
}

/* Strength return on volume, a row a muscle. Rising at or above its target
   needs nothing done, so those muscles share one line and each row left is
   one to act on (r41, V: clutter; it was 16 rows of "+8%" with nothing to
   do). A muscle with no sets lately has an old trend, not a return on volume
   (r34.2: "Quads +7.6% · 0 sets a week" after a break). */
function rankBody(src: Readonly<Record<string, number>>): Part {
  const I = IDX();
  if (!I.scores.length)
    return html`<p class="muted">Not enough data yet. Log at least ${TREND_MIN.sessions} sessions of an exercise over ${TREND_MIN.days / WEEK_DAYS} weeks or more, within ${TREND_WEEKS} weeks.</p>`;
  const maxAbs = Math.max(1, ...I.scores.filter(s => s.clear).map(s => Math.abs(s.score)));
  const trained = I.scores.filter(s => (src[s.m] || 0) > 0);
  const fine = trained.filter(s => s.clear && s.score >= GROW_PCT && (src[s.m] || 0) >= bandOf(s.m)[0]);
  const missing = MK.filter(m => !I.scores.find(s => s.m === m));
  return html`${trained
    .filter(s => !fine.includes(s))
    .map(s => {
      const c = s.label === 'progressing' ? 'green' : s.label === 'lagging' ? 'red' : 'none';
      const sets = src[s.m] || 0;
      const [lo, hi] = bandOf(s.m);
      /* Advice only where the trend is clear (r30). "Flat: try 2 more sets"
         was given to every muscle whose lifts were inside the noise, a causal
         call from no signal; a stalled lift is the one flat case stated.
         Rising at its volume needs nothing done, so it says nothing (r34, V:
         "Rising: hold this volume" on every row read as filler). */
      const read = !s.clear
        ? s.stall
          ? 'A lift has stalled: see Stalls under Lifts.'
          : musTrend(s) + '.'
        : s.score >= GROW_PCT
          ? sets < lo
            ? 'Rising, on fewer sets than your target.'
            : ''
          : s.score <= -GROW_PCT
            ? 'Falling: check recovery first.'
            : sets >= hi
              ? 'Flat at high volume: change exercises or effort, not sets.'
              : `Flat: try ${FLAT_TRY.sets} more sets a week for ${FLAT_TRY.weeks} weeks.`;
      return html`<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="mrow" style="border:0;padding:0"><span class=${`plate ${c}`}></span><span>${ML[s.m]}${s.indirect ? html` <span class="tag" data-tip="No direct exercise for this muscle. Trend inferred from lifts where it assists.">indirect</span>` : nothing}</span><div class="band"><div class=${`fill ${s.score >= 0 ? 'in' : 'down'}`} style=${`width:${s.clear ? (Math.abs(s.score) / maxAbs) * PERCENT : 0}%`}></div></div><span class="r small">${!s.clear ? 'unclear' : s.score >= GROW_PCT ? 'rising' : s.score <= -GROW_PCT ? 'falling' : 'flat'}</span></div><p class="small muted" style="margin:2px 0 0">${r1(sets)} sets a week${read ? ` · ${read}` : ''}</p></div>`;
    })}${
    fine.length
      ? html`<p class="small muted" style="margin-top:8px">Rising at ${fine.length === 1 ? 'its' : 'their'} volume: ${andList(
          fine.map(s => ML[s.m] || s.m),
          RISING_SHOWN
        )}. Keep the sets as they are.</p>`
      : nothing
  }${
    missing.length
      ? html`<p class="small muted" style="margin-top:8px">Not enough data yet: ${missing.map(m => ML[m]).join(', ')}.</p>`
      : nothing
  }`;
}

/* ---------- what Stats does ---------- */

/** The element a tap came from, as the page's dispatch hands it (data-act). */
type Tap = { dataset: DOMStringMap };

/** Stats' actions, by the data-act their buttons carry: none changes the log. */
export const DASH_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  regionWk(t) {
    const v = +(t.dataset.v ?? NaN);
    if (!REGION_WKS.some(x => x[0] === v)) return;
    // Kept for this visit whether or not the phone could store it.
    prefSet(REGION_KEY, String(v));
    ui.regionWk = v;
    rerenderKeepScroll();
  },
  volMode(t) {
    const v = t.dataset.v;
    if (!VOL_MODES.some(x => x[0] === v) || v == null) return;
    ui.volMode = v;
    rerenderKeepScroll();
  },
  chartRange(t) {
    const id = t.dataset.id,
      v = t.dataset.v;
    if (!id || !v || !RANGES.some(r => r[0] === v)) return;
    ui.rng[id] = v;
    rerenderKeepScroll();
  },
  bestsAll() {
    ui.bestsAll = true;
    rerenderKeepScroll();
  },
  dashJump(t) {
    const el = document.getElementById('sec-' + (t.dataset.sec || ''));
    if (!(el instanceof HTMLDetailsElement)) return;
    if (!el.open) el.open = true;
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
};

/** Stats' fields with a data-bind, read on change: the lift and the muscle shown. */
export const DASH_BINDS: Readonly<Record<string, (t: Field) => void>> = {
  dashEx(t) {
    ui.dashEx = t.value;
    rerenderKeepScroll();
  },
  dashMuscle(t) {
    ui.dashMuscle = t.value;
    rerenderKeepScroll();
  }
};
