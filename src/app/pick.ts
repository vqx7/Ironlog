/* Pick for me, Limited equipment, Swap's closest matches and Short on time
   (r62, moved from the legacy script as functions of the model). Two
   questions, one set of rules. Before a session: which of the routine's days
   fits today. Inside one: which exercise to add next. Both read the same
   numbers the rest of the app shows, and every pick says why.
   - Need: hard sets each muscle got in the last 7 days against the bottom of
     its weekly band. A rolling week, so a Monday is not told everything is
     behind.
   - Recovery: days since the muscle last got a real dose (2+ hard sets)
     against what that dose usually needs: about 1 day after under 4 sets, 2
     after 4 to 7, 3 after 8 or more. Muscle damage and strength loss after
     hard, high-volume work mostly resolve within 48 to 72 hours.
   - Past SESSION_CAP sets for one muscle in one workout, extra sets add
     little (the line the Plan tab flags).
   - Injured muscles are avoided; priority and lagging muscles count more;
     the cycle order and lifts already known and progressing get a nudge.
   None of this is a fixed rule of physiology: it is a transparent ranking,
   and its weights are conventions (docs/EVIDENCE.md, Pick for me). The
   routine's cycle and a day's planned sets, which the screens read too, are
   here as well, as the ranking reads them. */

import type { Model, ExerciseLike, ExStat } from './model';
import { EXIn, activeRoutineIn, exInjuryIn, injuredSetIn, isDeloadWeekIn, profIn, sortedSessionsIn } from './model';
import type { Day, DraftBlock, Exercise, Plan, Routine } from './types';
import type { DraftLike } from './session';
import { blockRest } from './session';
import { IDXIn, PICK_DAYS, isHardIn } from './analytics';
import { daysOffIn } from './engine';
import { planForIn } from './plans';
import { paceIn } from './time';
import { hasTargetIn } from './profile';
import { STR_NEAR, STR_REST } from './profile';
import { HARD_EX, JK, JL, LONG_IDS, LONG_TRIAL, MK, ML, isCompound, patternOf, profHeavy } from './library';
import {
  HELPER_CREDIT,
  LIGHTER_SET_SHARE,
  SESSION_CAP,
  SHORT_MIN_SETS,
  setCredit,
  setSecs,
  setupSecs
} from './formulas';
import { nextTrainIdx, sessDayIdx } from './routines';
import { sessCmp } from './records';
import { addDays, andList, daysBetween, r1, MINUTE_S, PERCENT, WEEK_DAYS } from './util';
import { agoTxt } from './format';

/** Recovery after a dose (Recovery tiers, docs/EVIDENCE.md): the hard sets a
    dose needs, the days each tier needs, what adds to them, and how far back
    the window reaches. A rule of thumb, used only to rank, never to block. */
const RECOVERY = {
  /** Hard sets on one day that count as a dose. */
  dose: 2,
  /** 8 or more hard sets need 3 days, 4 or more 2, fewer 1. */
  bigSets: 8,
  bigDays: 3,
  midSets: 4,
  midDays: 2,
  /** Two sets or more to failure, or a lift new to the lifter, add a day. */
  failSets: 2,
  /** Heavy hinges, Nordics and walking lunges add half a day. */
  slowDays: 0.5,
  /** The days looked back for a dose, and past which nothing older can need more (3.5 days at most). */
  window: 21,
  stopAfter: 4
} as const;

/** How a routine's day is ranked for today (Pick for me before a session):
    priority and lagging muscles' need counts this much more, fatigue and
    sets past the band weigh against it, the plan's next day gets a nudge, and
    the days since a day was done add a little, up to two weeks. */
const DAY_RANK = { focus: 1.5, fatigue: 1.5, over: 0.3, plan: 3, sinceCap: 14, sinceStep: 0.15, sayAfter: 8 } as const;

/** How an exercise is ranked to add to a session (Pick for me inside one). */
const EX_RANK = {
  /** A muscle's need below its band counts up to 6 sets, at 0.6 each. */
  needCap: 6,
  needStep: 0.6,
  /** At target already: 3 off past the top of the band, else 1 less 0.15 for each set of room left, up to 4. */
  pastTop: 3,
  atTarget: 1,
  roomCap: 4,
  roomStep: 0.15,
  /** Sets for the muscle already in this session: 6 off at the session line, 1.5 from 7, and 1 on while under 6 and short of target. */
  fullOff: 6,
  heavy: 7,
  heavyOff: 1.5,
  build: 6,
  buildOn: 1,
  /** Fatigue from earlier days, at 3 a full day short. */
  tired: 3,
  /** A second exercise for a muscle: 0.8 off for the same pattern or equipment, 0.3 on for a different one. */
  sameOff: 0.8,
  otherOn: 0.3,
  /** Helper muscles: their need counts up to 3 sets at 0.15 each, 0.6 at most, with 0.5 off for a tired or full one. */
  helpCap: 3,
  helpStep: 0.15,
  helpMax: 0.6,
  helpOff: 0.5,
  /** Lifts already logged, progressing or stalled; less common ones and lifts outside the routine. */
  known: 0.8,
  moving: 0.4,
  stalled: 0.8,
  rare: 0.4,
  outside: 0.3,
  inRoutine: 0.5,
  long: 0.4,
  /** Priority, lagging and focus muscles: 1.2 on while short of target, 0.3 once at it. */
  focusShort: 1.2,
  focusMet: 0.3,
  /** Strength focus (r44, item 44): stalled lifts lose 0.8 above, so 1.6 nets 0.8; near-best ones gain 1.2. */
  strStalled: 1.6,
  strNear: 1.2,
  /** The picks shown, and the sets one takes when its plan has none. */
  picks: 3,
  sets: 3
} as const;

/** How a replacement is ranked (Swap's closest matches and Limited equipment). */
const SWAP_RANK = {
  /** A much harder bodyweight lift the lifter does not already do. */
  tooHard: 4,
  pattern: 1.5,
  /** Logged before: 1, and 0.1 a session up to 6. */
  logged: 1,
  loggedStep: 0.1,
  loggedCap: 6,
  bw: 0.5,
  side: 0.3,
  common: 0.3,
  equip: 0.4,
  stalled: 0.5,
  injured: 5
} as const;

/** Short on time's order (Short on time, docs/EVIDENCE.md): priority muscles first, then lagging ones, then compound lifts, then the earlier exercise; and the steps taken by the end of each of its three passes, past which it stops (a guard against a loop). */
const TRIM = { priority: 4, lagging: 2, compound: 1, order: 0.01, stops: [500, 1000, 1500] } as const;

/** A muscle with no band of its own (none the log can hold: every muscle key has one). */
const NO_BAND: readonly [number, number] = [0, 0];

/** A muscle's weekly band, found by its key among the muscles (an index's keys are typed as any string). */
function bandOf(M: Model, m: string): readonly [number, number] {
  for (const k of MK) if (k === m) return M.s.settings.bands[k];
  return NO_BAND;
}

/** What the trend fallback says when a lift's trend has no span yet, in weeks. */
const TREND_WEEKS_SAID = 6;

/* ---------- the routine's cycle and a day's sets ---------- */

/* Where the lifter is in the cycle. Next up is the first training day after
   the last one logged, so a missed day moves with them instead of being
   skipped. A rest day right after the last session counts as scheduled only
   while the calendar says they are inside it. asOf reads the cycle as it
   stood on a past date (sessions up to that day), which is what a past
   workout entered late was due to be. */
/** A routine's cycle: the day last logged and its date, the next day due, the days done this time round, and a rest day due today. */
export function cycleStateIn(
  M: Model,
  R: Routine,
  asOf?: string | null
): { last: number; lastDate: string | null; next: number; done: Set<number>; restToday: boolean; restIdx: number } {
  const n = R.days.length;
  const T = asOf || M.today();
  const mine = M.s.sessions
    .filter(x => x.routineId === R.id && (!asOf || x.date <= asOf))
    .map(x => ({ s: x, i: sessDayIdx(R, x) }))
    .filter(x => x.i >= 0)
    .sort((a, b) => sessCmp(a.s, b.s));
  const L = mine[mine.length - 1];
  if (!L)
    return { last: -1, lastDate: null, next: nextTrainIdx(R, -1), done: new Set(), restToday: false, restIdx: -1 };
  const next = nextTrainIdx(R, L.i);
  const done = new Set<number>();
  if (next > L.i) {
    done.add(L.i);
    let prev = L.i;
    for (let k = mine.length - 2; k >= 0; k--) {
      const m = mine[k];
      if (!m) break;
      if (m.i < prev) {
        done.add(m.i);
        prev = m.i;
      } else break;
    }
  }
  let run = 0;
  for (let k = 1; k < n; k++) {
    const d = R.days[(L.i + k) % n];
    if (d && d.rest) run++;
    else break;
  }
  const since = daysBetween(L.s.date, T);
  const restToday = since >= 1 && since <= run;
  return { last: L.i, lastDate: L.s.date, next, done, restToday, restIdx: restToday ? (L.i + since) % n : -1 };
}

/** The hard sets a routine day plans per muscle: a lift's main muscle in full, each helper at HELPER_CREDIT. */
export function sessionMuscleSetsIn(
  M: Model,
  day: { items: readonly { exId: string; sets: number | string }[] }
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of day.items) {
    const ex = EXIn(M, it.exId);
    const n = +it.sets || 0;
    out[ex.primary] = (out[ex.primary] || 0) + n;
    for (const m of ex.secondary) out[m] = (out[m] || 0) + HELPER_CREDIT * n;
  }
  return out;
}

/* ---------- need and recovery ---------- */

/** The hard sets a muscle got in the PICK_DAYS days to a date (today by default), with a session's own sets added. */
export function rolling7In(M: Model, m: string, extra?: Readonly<Record<string, number>> | null, at?: string): number {
  const dm = IDXIn(M).dayMus;
  const t = at || M.today();
  let v = 0;
  for (let k = 0; k < PICK_DAYS; k++) {
    const x = dm[addDays(t, -k)];
    if (x && x[m]) v += x[m] || 0;
  }
  return v + ((extra && extra[m]) || 0);
}

/** How recovered a muscle is: r from 0 to 1, the days needed, and the latest dose's days ago and sets. */
export interface Recovery {
  r: number;
  days: number | null;
  sets: number;
  need: number;
}

/* Days a muscle needs after a dose: 1 under 4 hard sets, 2 for 4 to 7, 3 for
   8 or more; plus 1 if 2+ sets went to failure or a lift was new to the
   lifter, plus half a day after heavy hinges, Nordics or walking lunges,
   minus 1 (never under 1) if every set stopped at 3+ RIR. Performance after
   non-failure work is mostly back within 24 h, after failure work 24 to 48 h
   or more (Moran-Navarro 2017, Pareja-Blanco 2020). Every qualifying day in
   the window is checked, not just the latest: 2 easy sets yesterday must not
   hide 12 sets to failure the day before. r and need come from whichever
   dose leaves the muscle least recovered; days and sets describe the most
   recent one, which is what "last trained" reports. */
/** A muscle's recovery on a date (today by default). */
export function recoveryIn(M: Model, m: string, at?: string): Recovery {
  const I = IDXIn(M);
  const dm = I.dayMus;
  const t = at || M.today();
  let recent: Recovery | null = null,
    worst: Recovery | null = null;
  for (let k = 0; k <= RECOVERY.window; k++) {
    const d = addDays(t, -k);
    const day = dm[d];
    const v = (day && day[m]) || 0;
    if (v >= RECOVERY.dose) {
      const meta = I.dayMeta[d];
      const o = meta && meta[m];
      let need: number = v >= RECOVERY.bigSets ? RECOVERY.bigDays : v >= RECOVERY.midSets ? RECOVERY.midDays : 1;
      if (o && (o.fail >= RECOVERY.failSets || o.novel)) need += 1;
      if (o && o.slow) need += RECOVERY.slowDays;
      if (o && o.hard > 0 && o.easy === o.hard) need = Math.max(1, need - 1);
      const x = { r: Math.min(1, k / need), days: k, sets: v, need };
      if (!recent) recent = x;
      if (!worst || x.r < worst.r) worst = x;
      if (k > RECOVERY.stopAfter) break;
    }
  }
  if (!recent || !worst) return { r: 1, days: null, sets: 0, need: 0 };
  return { r: worst.r, days: recent.days, sets: recent.sets, need: worst.need };
}

/** When a muscle was last trained hard, in words. */
function lastHitTxtIn(M: Model, m: string): string {
  const rc = recoveryIn(M, m);
  return rc.days == null ? `not trained hard in ${RECOVERY.window / WEEK_DAYS} weeks` : `last hard ${agoTxt(rc.days)}`;
}

/* ---------- Pick for me, before a session ---------- */

/** Hard sets per main muscle a routine day plans, direct only (the muscles a day's reasons name). */
function dayDirectIn(M: Model, day: Day): Record<string, number> {
  const out: Record<string, number> = {};
  for (const it of day.items) {
    const ex = EXIn(M, it.exId);
    out[ex.primary] = (out[ex.primary] || 0) + (+it.sets || 0);
  }
  return out;
}

/** A routine day as Pick for me ranks it. */
interface DayRow {
  i: number;
  day: Day;
  score: number;
  fill: number;
  fat: number;
  injS: number;
  since: number | null;
  plan: boolean;
  ready: number;
  dir: Record<string, number>;
  joints: string[];
}

/** The active routine's training days ranked for today, with the plan's next day, the week's hard sets per muscle, and a deload week. */
export function rankDaysIn(M: Model): {
  R: Routine;
  rows: DayRow[];
  planIdx: number;
  r7: Record<string, number>;
  deload: boolean;
} {
  const R = activeRoutineIn(M);
  const t = M.today();
  const I = IDXIn(M);
  const inj = injuredSetIn(M);
  const pri = new Set<string>(M.s.settings.priorities);
  const lag = new Set(I.scores.filter(x => x.label === 'lagging').map(x => x.m));
  const deload = isDeloadWeekIn(M);
  const f = deload ? LIGHTER_SET_SHARE : 1;
  const weekly = R.schedule === 'weekly';
  // Today's place in a weekly routine, Monday first (Date counts from Sunday).
  const planIdx = weekly ? (new Date(t + 'T12:00:00').getDay() + WEEK_DAYS - 1) % WEEK_DAYS : cycleStateIn(M, R).next;
  const lastDone: Record<string, string> = {};
  for (const x of M.s.sessions) {
    const was = x.dayId ? lastDone[x.dayId] : undefined;
    if (x.routineId === R.id && x.dayId && (!was || x.date > was)) lastDone[x.dayId] = x.date;
  }
  const r7: Record<string, number> = {};
  for (const m of MK) r7[m] = rolling7In(M, m);
  const rows: DayRow[] = [];
  R.days.forEach((day, i) => {
    if (day.rest || !day.items.length) return;
    const ms = sessionMuscleSetsIn(M, day);
    const dir = dayDirectIn(M, day);
    let fill = 0,
      fat = 0,
      over = 0,
      injS = 0,
      wR = 0,
      wT = 0;
    for (const [m, w0] of Object.entries(ms)) {
      const w = w0 * f;
      const rc = recoveryIn(M, m);
      if (inj.has(m)) {
        injS += w;
        continue;
      }
      const has = hasTargetIn(M, m);
      const def = !has ? 0 : Math.max(0, bandOf(M, m)[0] - (r7[m] || 0));
      fill += Math.min(w, def) * (pri.has(m) || lag.has(m) ? DAY_RANK.focus : 1);
      fat += w * (1 - rc.r);
      if (has) over += Math.max(0, (r7[m] || 0) + w - bandOf(M, m)[1]);
    }
    for (const [m, w] of Object.entries(dir)) {
      if (inj.has(m)) continue;
      wR += w * recoveryIn(M, m).r;
      wT += w;
    }
    /* A flagged joint counts like a flagged muscle (r30): each set of an
       exercise that loads it weighs against the day. */
    const jointOf = (exId: string): string | null => exInjuryIn(M, EXIn(M, exId));
    const jHit = JK.some(j => inj.has(j))
      ? day.items.filter(it => {
          const j = jointOf(it.exId);
          return !!j && !!JL[j];
        })
      : [];
    for (const it of jHit) injS += (+it.sets || 0) * f;
    const last = lastDone[day.id];
    const since = last ? daysBetween(last, t) : null;
    const score =
      fill -
      DAY_RANK.fatigue * fat -
      injS -
      DAY_RANK.over * over +
      (i === planIdx ? DAY_RANK.plan : 0) +
      Math.min(since == null ? DAY_RANK.sinceCap : since, DAY_RANK.sinceCap) * DAY_RANK.sinceStep;
    const joints: string[] = [];
    for (const it of jHit) {
      const j = jointOf(it.exId);
      if (j && !joints.includes(j)) joints.push(j);
    }
    rows.push({ i, day, score, fill, fat, injS, since, plan: i === planIdx, ready: wT ? wR / wT : 1, dir, joints });
  });
  rows.sort((a, b) => b.score - a.score || +b.plan - +a.plan || a.i - b.i);
  return { R, rows, planIdx, r7, deload };
}

/** Why a day ranks where it does: the plan, a flagged joint, its two main muscles' week and recovery, and when it was last done. */
export function dayReasonsIn(M: Model, x: DayRow, r7: Readonly<Record<string, number>>): string[] {
  const inj = injuredSetIn(M);
  const out: string[] = [];
  const main = Object.entries(x.dir)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([m]) => m);
  if (x.plan) out.push(activeRoutineIn(M).schedule === 'weekly' ? 'Planned for today.' : 'Next in your cycle.');
  if (x.joints && x.joints.length)
    out.push(`Loads your ${andList(x.joints.map(j => (JL[j] || j).toLowerCase()))}, which you flagged.`);
  for (const m of main) {
    if (inj.has(m)) {
      out.push(`Loads ${ML[m]}, which you flagged as injured.`);
      continue;
    }
    const rc = recoveryIn(M, m);
    const [lo, hi] = bandOf(M, m);
    const tired = rc.r < 1 ? ` Likely still recovering (about ${rc.need} day${rc.need === 1 ? '' : 's'}).` : '';
    out.push(`${ML[m]}: ${r1(r7[m] || 0)} of ${lo}-${hi} hard sets in 7 days, ${lastHitTxtIn(M, m)}.${tired}`);
  }
  if (x.since != null && x.since >= DAY_RANK.sayAfter) out.push(`Last done ${x.since} days ago.`);
  else if (x.since == null) out.push('Not logged yet.');
  return out;
}

/* ---------- Pick for me, inside a session ---------- */

/** The hard sets each muscle has in a session so far (rows not yet ticked count as planned), helpers at HELPER_CREDIT. */
export function sessionMusclesIn(M: Model, d: Pick<DraftLike, 'ex'>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of d.ex) {
    const ex = EXIn(M, b.exId);
    const n = b.sets.filter(x => !x.warm && (x.done ? isHardIn(M, x, ex) : true)).reduce((a, x) => a + setCredit(x), 0);
    if (!n) continue;
    out[ex.primary] = (out[ex.primary] || 0) + n;
    for (const m of ex.secondary) out[m] = (out[m] || 0) + HELPER_CREDIT * n;
  }
  return out;
}

/** Strength focus (r44, item 44): a heavy compound not done for STR_REST days that is stalled, or near its best. */
export function strengthPickIn(
  M: Model,
  e: ExerciseLike,
  st: ExStat | undefined,
  rec: Recovery,
  at?: string
): 'stalled' | 'near' | null {
  if (profIn(M).goal !== 'strength' || !profHeavy(e) || !st || !st.last || rec.r < 1) return null;
  if (!(daysOffIn(M, e.id, { before: at }) >= STR_REST)) return null;
  const top = st.bestAll || 0,
    last = st.last.best;
  const near = top > 0 && last != null && last >= top * STR_NEAR;
  return st.stalled ? 'stalled' : near ? 'near' : null;
}

/** An exercise as Pick for me ranks it inside a session, with the plan it would be added with. */
interface ExPick {
  e: Exercise;
  s: number;
  m: string;
  def: number;
  inSess: number;
  st: ExStat | undefined;
  n: number;
  rec: Recovery;
  r7: number;
  sp: 'stalled' | 'near' | null;
}

/* In a session: every exercise not already in it, scored for this moment.
   The best one per muscle is kept, then the top three muscles. Anchored on
   the session's own date, so logging a past day reads that week; the
   session itself is not fatigue to recover from, earlier days are. */
/** The exercises to add next to a session, best first, each with the plan and sets it would be added with (and `full`, the sets before a deload or lighter day halved them, for Finish's offer to the routine, r54). */
export function rankExercisesIn(
  M: Model,
  d: Pick<DraftLike, 'ex' | 'date' | 'dayId' | 'deload' | 'light'>
): (ExPick & { plan: Plan; full: number })[] {
  const I = IDXIn(M);
  // Focus muscles in the profile (r44) count as priorities here.
  const pri = new Set<string>([...M.s.settings.priorities, ...(profIn(M).focus || [])]);
  const lag = new Set(I.scores.filter(x => x.label === 'lagging').map(x => x.m));
  const sess = sessionMusclesIn(M, d);
  const inS = new Set(d.ex.map(b => b.exId));
  const inR = new Set<string>();
  for (const dd of activeRoutineIn(M).days) for (const it of dd.items) inR.add(it.exId);
  const doneEx = d.ex.map(b => EXIn(M, b.exId));
  const at = d.date || M.today();
  const r7: Record<string, number> = {};
  for (const m of MK) r7[m] = rolling7In(M, m, sess, at);
  const rec: Record<string, Recovery> = {};
  for (const m of MK) rec[m] = recoveryIn(M, m, at);
  const best: Record<string, ExPick> = {};
  const need = (m: string): number => (!hasTargetIn(M, m) ? 0 : Math.max(0, bandOf(M, m)[0] - (r7[m] || 0)));
  for (const e of M.s.exercises) {
    if (e.archived || inS.has(e.id) || exInjuryIn(M, e)) continue;
    const m = e.primary;
    const hi = bandOf(M, m)[1];
    const r7m = r7[m] || 0;
    const recM = rec[m] || { r: 1, days: null, sets: 0, need: 0 };
    const def = need(m);
    const inSess = sess[m] || 0;
    let s = Math.min(def, EX_RANK.needCap) * EX_RANK.needStep;
    // At target already: optional, and better where the week has room left. Tracked-only muscles have no target, so no penalty either (r29).
    if (def <= 0 && hasTargetIn(M, m))
      s -= r7m >= hi ? EX_RANK.pastTop : EX_RANK.atTarget - Math.min(hi - r7m, EX_RANK.roomCap) * EX_RANK.roomStep;
    if (inSess >= SESSION_CAP) s -= EX_RANK.fullOff;
    else if (inSess >= EX_RANK.heavy) s -= EX_RANK.heavyOff;
    s -= (1 - recM.r) * EX_RANK.tired;
    if (inSess > 0 && inSess < EX_RANK.build && def > 0) s += EX_RANK.buildOn;
    // A second exercise for a muscle should come at it differently.
    const same = doneEx.filter(x => x.primary === m);
    const pe = patternOf(e);
    if (same.length)
      s += same.some(x => (pe && patternOf(x) === pe) || x.equip === e.equip) ? -EX_RANK.sameOff : EX_RANK.otherOn;
    // Helper muscles count a little, capped, so a lift is not picked just for touching many muscles; tired or full helpers still count against it.
    {
      let sb = 0;
      for (const m2 of e.secondary) {
        sb += Math.min(need(m2), EX_RANK.helpCap) * EX_RANK.helpStep;
        s -= (1 - (rec[m2] || recM).r) * EX_RANK.helpOff;
        if ((sess[m2] || 0) >= SESSION_CAP) s -= EX_RANK.helpOff;
      }
      s += Math.min(sb, EX_RANK.helpMax);
    }
    const st = I.exStats[e.id];
    const n = (I.byEx[e.id] || []).length;
    if (n) {
      s += EX_RANK.known;
      if (st && st.moving && !st.stalled) s += EX_RANK.moving;
      if (st && st.stalled) s -= EX_RANK.stalled;
    } else {
      if (e.rare) s -= EX_RANK.rare;
      if (!inR.has(e.id)) s -= EX_RANK.outside;
    }
    if (inR.has(e.id)) s += EX_RANK.inRoutine;
    if (LONG_IDS.has(e.id)) s += EX_RANK.long;
    if (pri.has(m) || lag.has(m)) s += def > 0 ? EX_RANK.focusShort : EX_RANK.focusMet;
    const sp = strengthPickIn(M, e, st, recM, at);
    if (sp) s += sp === 'stalled' ? EX_RANK.strStalled : EX_RANK.strNear;
    const b = best[m];
    if (!b || s > b.s || (s === b.s && e.name < b.e.name))
      best[m] = { e, s, m, def, inSess, st, n, rec: recM, r7: r7m, sp };
  }
  return Object.values(best)
    .sort((a, b) => b.s - a.s)
    .slice(0, EX_RANK.picks)
    .map(x => {
      const plan = planForIn(M, x.e.id, null, d.dayId, false, d.date);
      const cap = Math.max(1, SESSION_CAP - x.inSess);
      let sets = Math.max(
        1,
        Math.min(cap, x.def > 0 ? Math.min(+plan.sets || EX_RANK.sets, Math.max(2, Math.ceil(x.def))) : 2)
      );
      // A deload or lighter session halves its sets; what Pick for me adds to it does too (r27).
      const full = sets;
      if (d.deload || d.light) sets = Math.max(1, Math.ceil(sets * LIGHTER_SET_SHARE));
      return { ...x, plan: { ...plan, sets }, full };
    });
}

/** Why an exercise is picked: its muscle's week against target, its recovery, the session so far, its history, a long-length lift, a priority or focus muscle, and the strength focus. */
export function exReasonsIn(M: Model, x: ExPick): string[] {
  const [lo, hi] = bandOf(M, x.m);
  const out: string[] = [];
  const name = ML[x.m];
  out.push(
    !hasTargetIn(M, x.m)
      ? `${name}: ${r1(x.r7)} hard sets in the last 7 days, counting this session (tracked only, no target).`
      : `${name}: ${r1(x.r7)} of ${lo}-${hi} hard sets in the last 7 days, counting this session${x.def > 0 ? `, ${r1(x.def)} short of target` : ', at or above target'}.`
  );
  out.push(
    x.rec.days == null
      ? `Not trained hard in the last ${RECOVERY.window / WEEK_DAYS} weeks.`
      : x.rec.r < 1
        ? `Last trained hard ${agoTxt(x.rec.days)} (${r1(x.rec.sets)} sets), so it may still be recovering.`
        : `Last trained hard ${agoTxt(x.rec.days)}, recovered.`
  );
  if (x.inSess > 0)
    out.push(
      `${r1(x.inSess)} set${r1(x.inSess) === 1 ? '' : 's'} for it already in this session${x.inSess >= SESSION_CAP ? `, past the ${SESSION_CAP}-set line for one workout` : ''}.`
    );
  if (x.n) {
    const p =
      x.st && x.st.pct != null
        ? `, ${x.st.pct >= 0 ? '+' : ''}${r1(x.st.pct)}% over ${x.st.spanW || TREND_WEEKS_SAID} weeks`
        : '';
    out.push(
      `You have logged it ${x.n} time${x.n === 1 ? '' : 's'}${p}${x.st && x.st.stalled ? ', stalled lately' : ''}.`
    );
  } else out.push('New to you: the first session sets its baseline.');
  if (LONG_IDS.has(x.e.id))
    out.push(
      LONG_TRIAL.has(x.e.id)
        ? 'Trains a two-joint muscle at a long length, which beat the shorter-length version in trials.'
        : 'Puts a two-joint muscle at a long length (a mechanical case, not trial-tested).'
    );
  if (M.s.settings.priorities.some(p => p === x.m)) out.push('One of your priority muscles.');
  else if ((profIn(M).focus || []).some(f => f === x.m)) out.push('One of your focus muscles.');
  if (x.sp)
    out.push(
      x.sp === 'stalled'
        ? `Strength focus: stalled lately, and ${STR_REST} days or more since you did it.`
        : `Strength focus: within ${Math.round((1 - STR_NEAR) * PERCENT)}% of your best, and ${STR_REST} days or more since you did it.`
    );
  return out;
}

/* ---------- Swap's closest matches and Limited equipment ---------- */

/** Done before at the reps asked for, or within two of them: then a lift is not too hard for this lifter. */
function canDoIn(M: Model, e: Pick<Exercise, 'id'>, repMin: number | string | undefined): boolean {
  const xs = IDXIn(M).byEx[e.id] || [];
  return xs.some(x => x.pts.some(p => p.r >= Math.max(1, (+(repMin || 0) || 1) - 2)));
}

/* Closest same-muscle replacements, used by Swap and Limited equipment.
   Same main muscle and same kind of set (timed or reps) are required; then
   shared helper muscles, lifts already logged, and like-for-like setup. */
function swapScoreIn(M: Model, o: ExerciseLike, e: Exercise, repMin: number | string | undefined): number {
  const I = IDXIn(M);
  let s = e.secondary.filter(x => o.secondary.includes(x)).length;
  // A much harder bodyweight lift never wins over an easier match unless the lifter already does it.
  if (HARD_EX.has(e.id) && !HARD_EX.has(o.id) && !canDoIn(M, e, repMin)) s -= SWAP_RANK.tooHard;
  const po = patternOf(o);
  if (po && po === patternOf(e)) s += SWAP_RANK.pattern;
  const n = (I.byEx[e.id] || []).length;
  if (n) s += SWAP_RANK.logged + Math.min(n, SWAP_RANK.loggedCap) * SWAP_RANK.loggedStep;
  if (!!e.bw === !!o.bw) s += SWAP_RANK.bw;
  if (!!e.perSide === !!o.perSide) s += SWAP_RANK.side;
  if (!e.rare) s += SWAP_RANK.common;
  if (e.equip === o.equip) s += SWAP_RANK.equip;
  const st = I.exStats[e.id];
  if (st && st.stalled) s -= SWAP_RANK.stalled;
  if (exInjuryIn(M, e)) s -= SWAP_RANK.injured;
  return s;
}

/** The replacements for a lift, best first: same main muscle and kind of set, with this equipment only when given, and none of those excluded. */
export function swapCandsIn(
  M: Model,
  origId: string,
  equip?: ReadonlySet<string> | null,
  exclude?: ReadonlySet<string> | null,
  repMin?: number | string
): { e: Exercise; s: number }[] {
  const o = EXIn(M, origId);
  return M.s.exercises
    .filter(
      e =>
        !e.archived &&
        e.id !== origId &&
        e.primary === o.primary &&
        !!e.timed === !!o.timed &&
        (!equip || equip.has(e.equip)) &&
        !(exclude && exclude.has(e.id))
    )
    .map(e => ({ e, s: swapScoreIn(M, o, e, repMin) }))
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name));
}

/** One item of a day under Limited equipment: kept (`to` its own lift), swapped (`from` the lift it replaces, `hard` when much harder), or left out (`to` null). */
interface EqSwap {
  it: Day['items'][number];
  to: string | null;
  from: string | null;
  hard?: boolean;
}

/* Limited equipment: the day's plan with each exercise whose equipment is
   off swapped for its closest match that is on, or left out when none is. */
/** A day's plan with only this equipment. */
export function eqPlanIn(M: Model, day: Day, equip: ReadonlySet<string>): EqSwap[] {
  const keep = new Set(day.items.filter(it => equip.has(EXIn(M, it.exId).equip)).map(it => it.exId));
  const used = new Set(keep);
  const out: EqSwap[] = [];
  for (const it of day.items) {
    const ex = EXIn(M, it.exId);
    if (equip.has(ex.equip)) {
      out.push({ it, to: it.exId, from: null });
      continue;
    }
    const c = swapCandsIn(M, it.exId, equip, used, it.repMin)[0];
    if (c) {
      used.add(c.e.id);
      out.push({
        it,
        to: c.e.id,
        from: it.exId,
        hard: HARD_EX.has(c.e.id) && !HARD_EX.has(it.exId) && !canDoIn(M, c.e, it.repMin)
      });
    } else out.push({ it, to: null, from: it.exId });
  }
  return out;
}

/** The exercises logged most recently, newest first, up to n, leaving out archived ones and any not in the log's library. */
export function recentExIdsIn(M: Model, n: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const ss = sortedSessionsIn(M);
  for (let i = ss.length - 1; i >= 0 && out.length < n; i--) {
    const s = ss[i];
    if (!s) continue;
    for (const b of s.ex)
      if (!seen.has(b.exId)) {
        seen.add(b.exId);
        const e = EXIn(M, b.exId);
        if (!e.archived && M.s.exercises.some(x => x.id === b.exId)) out.push(b.exId);
        if (out.length >= n) break;
      }
  }
  return out;
}

/* ---------- Short on time ---------- */

/** One exercise of a session as Short on time weighs it: its sets left and done, the sets it keeps, its seconds a set, its rest, its setup, and its rank. */
interface TrimRow {
  bi: number;
  ex: ExerciseLike;
  undone: number;
  done: number;
  started: boolean;
  keep: number;
  rest: number;
  per: number;
  su: number;
  score: number;
}

/* Trim to fit. Lowest priority first: sets come off down to SHORT_MIN_SETS
   per exercise, then whole exercises not started yet drop out, then
   exercises in progress finish with what is done. An exercise whose muscle
   another kept exercise already trains goes before one that is the only
   work for its muscle, so every muscle keeps at least one movement for as
   long as possible (a fly does not cover a bench press: only a compound
   covers a compound). Priority and lagging muscles are kept longest, then
   main lifts, as the Short on time help promises, then the earlier
   exercise, since a routine usually puts its main lifts first. Done sets are
   never touched; a row typed but not ticked counts as done here, since
   trimming takes only blank rows (`blank`, each block's rows as the session
   screen's rowBlank reads them, handed in as data). */
/** Short on time's trim of a session to so many minutes: each exercise's rows kept, the changes in words, the minutes after, and whether it is still over. */
export function trimPlanIn(
  M: Model,
  d: { ex: DraftBlock[] },
  mins: number,
  blank: readonly (readonly boolean[])[]
): { bl: TrimRow[]; changes: string[]; est: number; over: boolean } {
  const pri = new Set<string>(M.s.settings.priorities);
  const lag = new Set(
    IDXIn(M)
      .scores.filter(x => x.label === 'lagging')
      .map(x => x.m)
  );
  let cN = 0;
  const bl: TrimRow[] = d.ex.map((b, bi) => {
    const ex = EXIn(M, b.exId);
    const isBlank = (k: number): boolean => !!(blank[bi] && blank[bi][k]);
    const undone = b.sets.filter((x, k) => !x.warm && isBlank(k)).length;
    const done = b.sets.filter((x, k) => !x.warm && !isBlank(k)).length;
    // Any row of the lifter's, a warm-up included, means the exercise is under way.
    const started = b.sets.some((_, k) => !isBlank(k));
    const su = setupSecs(ex, cN);
    if (isCompound(ex)) cN++;
    const score =
      (pri.has(ex.primary) ? TRIM.priority : 0) +
      (lag.has(ex.primary) ? TRIM.lagging : 0) +
      (isCompound(ex) ? TRIM.compound : 0) -
      bi * TRIM.order;
    return { bi, ex, undone, done, started, keep: undone, rest: blockRest(d, bi), per: setSecs(ex, b.plan), su, score };
  });
  const pc = paceIn(M);
  const cost = (): number =>
    (bl.reduce((a, x) => a + (x.keep ? x.keep * (x.per + x.rest) + (x.started ? 0 : x.su) : 0), 0) * pc) / MINUTE_S;
  const byLow = (arr: TrimRow[]): TrimRow[] => arr.slice().sort((a, b) => a.score - b.score);
  let guard = 0;
  while (cost() > mins && guard++ < TRIM.stops[0]) {
    const c = byLow(bl.filter(x => x.keep > 0 && x.done + x.keep > SHORT_MIN_SETS))[0];
    if (!c) break;
    c.keep--;
  }
  const kept = (x: TrimRow): boolean => x.keep > 0 || x.done > 0;
  const covered = (x: TrimRow): boolean =>
    bl.some(y => y !== x && kept(y) && y.ex.primary === x.ex.primary && (isCompound(y.ex) || !isCompound(x.ex)));
  while (cost() > mins && guard++ < TRIM.stops[1]) {
    const c = bl.filter(x => x.keep > 0 && !x.started);
    if (!c.length) break;
    const red = c.filter(covered);
    const low = byLow(red.length ? red : c)[0];
    if (low) low.keep = 0;
  }
  while (cost() > mins && guard++ < TRIM.stops[2]) {
    const c = byLow(bl.filter(x => x.keep > 0 && x.started))[0];
    if (!c) break;
    c.keep--;
  }
  const changes: string[] = [];
  for (const x of bl) {
    if (x.keep === x.undone) continue;
    if (x.keep === 0 && !x.started) changes.push(`Skip ${x.ex.name}`);
    else
      changes.push(
        `${x.ex.name}: ${x.done + x.undone} → ${x.done + x.keep} set${x.done + x.keep === 1 ? '' : 's'}${x.done ? ` (${x.done} done)` : ''}`
      );
  }
  return { bl, changes, est: Math.round(cost()), over: cost() > mins };
}
