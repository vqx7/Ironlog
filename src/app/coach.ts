/* What the analytics tell the lifter (phase 3b, r52; moved from the legacy
   script, tests/moved.js reads each back to r51's code): the lifts moving and
   stalled, the stalls that point to fatigue, the coach's one line, a muscle's
   trend in words, the size check's sites, and the check-in against how
   sessions went (readiness). */

import type { Model, Score } from './model';
import {
  EXIn,
  UIn,
  activeRoutineIn,
  exNameIn,
  freeModeIn,
  injuredSetIn,
  isDeloadWeekIn,
  isRestWeekIn,
  sortedSessionsIn
} from './model';
import { IDXIn, stallWeeksIn } from './analytics';
import { actualAvg4In, recentLighterIn } from './weeks';
import { GROW_PCT, atLoad, isWork, offSession } from './formulas';
import { MK, ML, TRACK_ONLY, isCompound, noE1 } from './library';
import { addDays, andList, r1, weekStart } from './util';
import { belowMin } from './volume';
import { planForIn, plannedSetsIn } from './routines';
import { loadLabelIn } from './loads';

/** The coach's one line: its colour, the advice, the reason behind an i, and the action it offers. */
export interface CoachLine {
  tone: string;
  text: string;
  why?: string;
  act: { label: string; deload?: boolean; sec?: string; m?: string; ex?: string } | null;
}

/* Size check: tape change per site against the hard sets a week its muscles
   got over the same stretch. Needs two measurements of a site at least 21
   days apart; the baseline is the earliest one within 12 weeks of the latest.
   Waist and bodyweight over the same stretch are shown alongside, because a
   limb that grew while the waist grew too is partly fat. */
export const SIZE_MAP: readonly (readonly [string, readonly string[]])[] = [
  ['arm', ['biceps', 'triceps']],
  ['forearm', ['forearms']],
  ['chest', ['chest']],
  ['thigh', ['quads', 'hamstrings', 'adductors']],
  ['calf', ['calves']],
  ['neck', ['neck']]
];

/* The lifts moving up, fastest first, with the weeks their trend covers.
   Every entry of IDX's exStats is a lift's stats (it holds no empty ones),
   and a moving lift has a change, as the ! say. */
export function moversIn(M: Model): { id: string; pct: number | null; wk: number }[] {
  return Object.entries(IDXIn(M).exStats)
    .filter(([, x]) => x!.moving && !x!.stalled && x!.fresh)
    .sort((a, b) => b[1]!.pct! - a[1]!.pct!)
    .map(([id, x]) => ({ id, pct: x!.pct, wk: x!.spanW || 2 }));
}

/* The ids of the lifts that have stalled. Every entry of IDX's exStats is a
   lift's stats, as the ! says. */
export function stalledIdsIn(M: Model): string[] {
  return Object.entries(IDXIn(M).exStats)
    .filter(([, x]) => x!.stalled)
    .map(([id]) => id);
}

/* A lift whose last 6 sessions logged drop sets and no main sets is read
   from drop sets alone (IDX uses them when there is nothing else); it can
   show as stalled, but it says nothing about fatigue, so it never counts
   toward "stalled at once" (r45, audit item 289). Read from the log here,
   so IDX keeps its shape. */
export function dropOnlyLiftIn(M: Model, id: string): boolean {
  const ss = sortedSessionsIn(M);
  let n = 0;
  for (let i = ss.length - 1; i >= 0 && n < 6; i--) {
    const bs = ss[i].ex.filter(b => b.exId === id);
    if (!bs.length) continue;
    n++;
    if (bs.some(b => b.sets.some(s => isWork(s) && !s.drop))) return false;
  }
  return n > 0;
}

/* Stalls that can point to whole-body fatigue (r31): compound lifts with a
   strength estimate. A plank held at 60 s or curls stuck at one dumbbell say
   little about recovery, and they used to count toward "3 lifts stalled at
   once, a deload week may help". They are still listed as stalled. */
export function fatigueStallsIn(M: Model, ids: readonly string[]): string[] {
  return ids.filter(id => {
    const e = EXIn(M, id);
    return e && !e.timed && !noE1(e) && isCompound(e) && !dropOnlyLiftIn(M, id);
  });
}

/* What a stall is, in the words the coach's tip and a lift's headline on
   Stats both use (r54: the headline's own words, "flat for 3 weeks or more,
   with no PR in the last 3 sessions", fell behind the rule in r53). */
/** The stall rule, as a lifter reads it. */
export const STALL_WHY =
  'Flat or down over its last 6 sessions in this rep range (or 3 weeks), leaving out ones where it was trimmed or done lighter than usual, and, on a lighter day, in a deload, or on an exercise made lighter, ones with fewer reps or sets than usual; with no PR in the last 3 of them, nor a set stronger than any before it in a session left out since the third-last, no heavier load, and no more reps at the same load.';

/* The single most useful thing to change this week, in priority order. Each
   branch states the number it is based on, so the advice can be checked. */
export function coachIn(M: Model): CoachLine {
  const I = IDXIn(M);
  const R = activeRoutineIn(M);
  if (!M.s.sessions.length)
    return { tone: 'blue', text: 'Log your first session. Advice starts after a few sessions.', act: null };
  if (isRestWeekIn(M, weekStart(M.today())))
    return {
      tone: 'blue',
      text: 'Rest week. Nothing to hit this week.',
      why: 'It does not count as missed: your averages, streak, and adherence skip it, and your targets pick up where they were.',
      act: null
    };
  if (isDeloadWeekIn(M))
    return {
      tone: 'blue',
      text: `Deload week. It ends Sunday.`,
      why: 'Half the sets, about 90% loads, 3 or more reps in reserve. Your targets pick up where they were.',
      act: null
    };
  const stalled = stalledIdsIn(M);
  /* A deload is not suggested within 4 weeks of a lighter week (r30): the
     review saw "6 lifts stalled, a deload week may help" three weeks after
     one. Since r53 the week is read from what the lifts did, not the labels,
     and a week marked as a deload with nothing trained in it counts too, as
     a rest week has since r34 (recentLighterIn). */
  const rl = recentLighterIn(M, 28);
  const big = fatigueStallsIn(M, stalled);
  if (big.length >= 3 && !rl)
    return {
      tone: 'red',
      text: `${big.length} main lifts stalled at once: ${andList(
        big.map(id => exNameIn(M, id)),
        3
      )}. A deload week may help.`,
      why: 'Several main lifts flat together often points to fatigue. Check sleep, food, and stress. A deload week is half the sets at about 90% loads. Isolation and core lifts are not counted.',
      act: { label: 'Start a deload week', deload: true }
    };
  const inj = injuredSetIn(M);
  const avg = actualAvg4In(M);
  const bands = M.s.settings.bands;
  /* Two or more of the last 4 weeks with no training (r31): the averages are
     per week trained, so they can look fine while most weeks are missed.
     Turning up comes before any set count. */
  if (avg && avg._missed >= 2) {
    const w = avg._weeks,
      n = Math.min(4, w + avg._missed);
    return {
      tone: 'yellow',
      text: `You trained in ${w} of the last ${n} weeks. Getting the weeks in matters more than adding sets.`,
      why: 'Set counts are per week you trained: weeks with no training are left out of the averages rather than counted as zero, so a short break does not read as below target everywhere.',
      act: null
    };
  }
  if (avg) {
    const lagSet = new Set(I.scores.filter(x => x.label === 'lagging').map(x => x.m));
    /* Largest shortfall in sets first. Sorting by the fraction of target put
       a small muscle at 0 of 2 sets ahead of a major one at 5 of 10, which is
       backwards for a hypertrophy-first plan. The fraction still breaks ties. */
    const under = MK.filter(m => !inj.has(m) && !TRACK_ONLY.has(m) && belowMin(avg[m], bands[m][0]))
      .map(m => ({
        m,
        got: avg[m] || 0,
        lo: bands[m][0],
        hi: bands[m][1],
        pri: M.s.settings.priorities.includes(m) ? 1 : 0,
        lag: lagSet.has(m) ? 1 : 0
      }))
      .sort((a, b) => b.pri - a.pri || b.lag - a.lag || b.lo - b.got - (a.lo - a.got) || a.got / a.lo - b.got / b.lo);
    if (under.length) {
      const u = under[0];
      const gap = Math.max(1, Math.ceil(u.lo - u.got));
      /* An exercise the lifter actually does (r31): one in the routine that
         has been logged first, then any logged lift for the muscle, then the
         routine's. The review saw "Add 5 sets to Lat Pulldown" for someone
         who had never done one. */
      const done = (id: string): boolean => (I.byEx[id] || []).length > 0;
      const forM = (id: string): boolean => {
        const e = EXIn(M, id);
        return !!e && e.primary === u.m;
      };
      const inR: string[] = [];
      for (const d of R.days) for (const it of d.items) if (forM(it.exId) && !inR.includes(it.exId)) inR.push(it.exId);
      // The ids come from byEx's own keys, so each is there, as the ! say.
      const logged = Object.keys(I.byEx)
        .filter(id => forM(id) && M.s.exercises.some(e => e.id === id && !e.archived))
        .sort((x, y) => I.byEx[y]![I.byEx[y]!.length - 1].date.localeCompare(I.byEx[x]![I.byEx[x]!.length - 1].date));
      const exId = inR.find(done) || logged[0] || inR[0] || null;
      /* The plan already reaches the target (r53, from the audit V asked
         for: a lifter doing every planned set was told for weeks to add
         sets). The shortfall is then sets skipped, or ended 4 or more in
         reserve, as a lift's first sessions are while its load is found, so
         adding sets is not the fix. Not in Freestyle mode, where the plan is
         not what the lifter follows. */
      const planned = plannedSetsIn(M, R)[u.m] || 0;
      if (!freeModeIn(M) && !belowMin(planned, u.lo))
        return {
          tone: 'yellow',
          text: `${ML[u.m]}: ${r1(u.got)} hard set${r1(u.got) === 1 ? '' : 's'} a week, target ${u.lo}-${u.hi}. Your plan has ${r1(planned)}: do every planned set${M.s.settings.rirMode === 'off' ? '' : ', to 3 or fewer reps in reserve'}.${under.length > 1 ? ` ${under.length - 1} more below target.` : ''}`,
          why: `Your average of hard sets per week over your recent full weeks. Your plan already reaches the target, so the gap is in how the sets are done, not how many are planned: ${M.s.settings.rirMode === 'off' ? 'a planned set skipped does not count.' : "a set counts as hard at 3 or fewer reps in reserve, so a planned set skipped, or ended with 4 or more in reserve (as a lift's first sessions are while its load is found), does not."}`,
          act: { label: `See ${ML[u.m]}`, sec: 'volume', m: u.m }
        };
      const how = exId
        ? `Add ${gap} set${gap > 1 ? 's' : ''} a week to ${exNameIn(M, exId)}.`
        : 'Add an exercise for it.';
      return {
        tone: 'yellow',
        text: `${ML[u.m]}: ${r1(u.got)} hard set${r1(u.got) === 1 ? '' : 's'} a week, target ${u.lo}-${u.hi}. ${how}${under.length > 1 ? ` ${under.length - 1} more below target.` : ''}`,
        why: `Your average of hard sets per week over your recent full weeks. The largest shortfall comes first, and priority muscles before the rest.${exId ? '' : ' Nothing in your routine trains it directly.'}`,
        act: { label: `See ${ML[u.m]}`, sec: 'volume', m: u.m }
      };
    }
  }
  /* A lift stuck at the top of its range has not run out of progress; the
     load has not gone up (r32, from the third review: lateral raises at 15
     of 12-15 for weeks were told to change the range). */
  if (stalled.length) {
    const id = stalled[0];
    const st = I.exStats[id];
    const p = planForIn(M, id);
    const lw = st && st.last ? atLoad(st.last.pts, st.last.topW) : [];
    /* How long it has stalled, the span the stall test read (r54, from the
       audit V asked for: "for 3 weeks" was said of a lift flat for ten, and
       of its whole stretch at the top of the range, which nothing checks). */
    const w = stallWeeksIn(M, id);
    const flat = w != null ? `over the last ${w} weeks` : 'over its last 3 sessions';
    // A set at the top of the range means st was there to read it from, as the ! says.
    if (lw.length && lw.every(q => q.r >= +p.repMax))
      return {
        tone: 'yellow',
        text: `${exNameIn(M, id)} is at the top of its range at ${loadLabelIn(M, EXIn(M, id), st!.last.topW)}${EXIn(M, id).bw ? '' : ' ' + UIn(M)} and has stalled ${flat}: it is due a step up, not a new range. The session's target says how.`,
        why: 'Every set reached the top of the range. The next step is more load, or, when one step is large for the load, a few more reps first.',
        act: { label: 'See the lift', sec: 'exercise', ex: id }
      };
    return {
      tone: 'yellow',
      text: `${exNameIn(M, id)} has stalled. Try another rep range or a close variation for a few weeks.`,
      why: STALL_WHY,
      act: { label: 'See the lift', sec: 'exercise', ex: id }
    };
  }
  // Missing RIR is not coached: it is optional by design and blanks are read as your usual RIR.
  // Scores are sorted high to low, so the steepest fall is the last one.
  const lag = I.scores.filter(x => x.clear && x.score <= -GROW_PCT);
  if (lag.length) {
    const x = lag[lag.length - 1];
    return {
      tone: 'yellow',
      text: `${ML[x.m]} strength is falling over ${x.wk || 6} weeks. Check sleep and recovery before adding sets.`,
      act: { label: `See ${ML[x.m]}`, sec: 'rank', m: x.m }
    };
  }
  // Someone back from a break (nothing since before the last 4 weeks) has
  // history but no recent weeks; "first full week" was wrong for them.
  if (!avg)
    return {
      tone: 'blue',
      text:
        M.s.sessions.some(x => x.date < addDays(weekStart(M.today()), -28)) &&
        !M.s.sessions.some(x => x.date >= addDays(weekStart(M.today()), -28))
          ? 'Nothing logged in the last 4 weeks. Volume advice comes back after a full week of training.'
          : 'Volume advice appears here after your first full week.',
      act: null
    };
  return { tone: 'green', text: 'Every muscle at target, nothing stalled.', act: null };
}

/* A muscle's strength trend in words (r30): unclear when none of its lifts
   has a trend outside day-to-day noise, never "+0%". */
export function musTrend(sc: Pick<Score, 'clear' | 'n' | 'score' | 'wk'>): string {
  if (!sc.clear)
    return `Strength trend unclear: ${sc.n ? `${sc.n} lift${sc.n === 1 ? '' : 's'} measured, changes within day-to-day noise` : 'not enough sessions'}`;
  return Math.abs(sc.score) < GROW_PCT
    ? `No clear strength change over ${sc.wk || 6} weeks`
    : `Strength ${sc.score >= 0 ? 'rising' : 'falling'} over ${sc.wk || 6} weeks`;
}

/* ---------- READINESS ----------
   The three check-in taps against how the session went: the share of lifts
   that set a PR (a new best estimate or a rep PR), per answer. First sessions
   of a lift, and deload, lighter and trimmed work, are left out because they
   cannot show progress. */
/** A check-in answer in a sentence: lower case, except OK. */
export const chkWord = (n: string): string => (n === 'OK' ? 'OK' : n.toLowerCase());

/** The check-in's three questions: the key it is kept under, its label, and its answers from worst to best. */
export const CHK_Q: readonly (readonly [string, string, readonly string[]])[] = [
  ['sleep', 'Sleep', ['Poor', 'OK', 'Good']],
  ['energy', 'Energy', ['Low', 'OK', 'High']],
  ['joints', 'Aches', ['Sore', 'A little', 'None']]
];

/* For each check-in answer, the sessions given it and the share of their
   lifts that progressed. The sessions read are those with a check-in, and
   each id read from IDX's byEx comes from its own keys, as the ! say. */
export function readinessIn(M: Model) {
  const I = IDXIn(M);
  const bySid: Record<string, { n: number; p: number }> = {};
  for (const id in I.byEx)
    I.byEx[id]!.forEach((x, i) => {
      if (i === 0 || offSession(x)) return;
      const o = bySid[x.sid] || (bySid[x.sid] = { n: 0, p: 0 });
      o.n++;
      if (x.progress) o.p++;
    });
  const sess = M.s.sessions.filter(s => !s.demo && s.chk && bySid[s.id]);
  const rows = CHK_Q.map(([k, l, names]) => ({
    k,
    l,
    groups: [3, 2, 1].map(v => {
      const g = sess.filter(s => s.chk![k] === v);
      const n = g.reduce((a, s) => a + bySid[s.id].n, 0),
        p = g.reduce((a, s) => a + bySid[s.id].p, 0);
      return { v, name: names[v - 1], sessions: g.length, rate: n ? (p / n) * 100 : null };
    })
  }));
  return { n: sess.length, rows };
}
