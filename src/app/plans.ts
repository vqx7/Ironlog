/* The plan a lift is done at, read with the analytics, and Finish's offer
   to change the routine (r54, from routines.ts: under the analytics, it
   could read a lift's own sessions only from the records, by their labels,
   so a session the analytics read as done lighter, or short of its usual,
   set a lift's plan there; PENDING 313). */

import type { Plan, Routine } from './types';
import type { Model } from './model';
import { EXIn, exNameIn } from './model';
import { andList, isDate } from './util';
import { offTarget } from './formulas';
import { IDXIn } from './analytics';
import { defPlanIn, profRuleIn, routinePlanIn, DEFAULT_PLAN } from './routines';

/* An exercise added mid-session borrows its settings from wherever it
   already sits in the routine (the active one unless given), the day being
   trained first, instead of a generic 3 x 8-12. A lift on no day of it
   starts from its own last full session (r53, V 2026-10-18: "tied at
   exercise level"), read as the analytics read it, by V's one rule (r54):
   the newest of its sessions up to the date being logged (`before`, a past
   workout's; today else) not done lighter nor short of its usual, and not
   a sample. Its working sets, and the range it was done at where the
   training profile sets none for the lift. Until r54 it was read from the
   records by the day's label, at any date (PENDING 313): a deload logged
   without its button set the plan, a lift done at its usual level on a
   lighter day did not, a session stopped at half its sets did, and an
   exercise added to a past workout read sessions after it. Never done in
   full, the default as before. plain (the pace model) reads past sessions
   without this, as without the profile. */
/** The plan a lift is done at: the routine's, else its own last full session's sets and range, else its default. */
export function planForIn(
  M: Model,
  exId: string,
  R?: Routine | null,
  dayId?: string | null,
  plain?: boolean,
  before?: string | null
): Plan {
  const inR = routinePlanIn(M, exId, R, dayId);
  if (inR) return inR;
  const base = defPlanIn(M, exId, plain);
  if (plain) return base;
  const T = before && isDate(before) ? before : M.today();
  const demo = new Set(M.s.sessions.filter(s => s.demo).map(s => s.id));
  const xs = (IDXIn(M).byEx[exId] || []).filter(x => x.date <= T && !offTarget(x) && !demo.has(x.sid));
  const x = xs[xs.length - 1];
  if (!x) return base;
  const range = x.rr && !profRuleIn(M, EXIn(M, exId)) ? { repMin: x.rr[0], repMax: x.rr[1] } : {};
  return { ...base, ...range, sets: x.pts.length };
}

/** The parts of a finished session that Finish's offer reads: the routine day
    it was logged against, its marks, and each exercise's plan and sets. */
interface FinishedDraft {
  routineId: string;
  dayId: string | null;
  date?: string | undefined;
  limited?: boolean | undefined;
  deload?: boolean | undefined;
  light?: boolean | undefined;
  ex: {
    exId: string;
    swappedFrom?: string | null | undefined;
    full?: number | undefined;
    plan: Partial<Plan> & { ss?: string | null | undefined };
    sets: { done?: boolean | undefined; warm?: boolean | undefined }[];
  }[];
}

/** Finish's offer to update the routine day: exercises to add, swaps, supersets, and the words for them. */
export interface RoutineUpdate {
  rid: string;
  dayId: string;
  dayName: string;
  add: { exId: string; plan: Partial<Plan> & { sets: number } }[];
  swap: {
    from: string;
    to: string;
    plan: Partial<Pick<Plan, 'repMin' | 'repMax' | 'rir' | 'rest' | 'inc' | 'jump'>>;
  }[];
  ss: string[][];
  text: string;
}

/* Exercises added or swapped in a session, relative to the routine day it was
   logged against, so Finish can offer to make the change permanent. An
   exercise added on a lighter day or in a deload had half its sets (r30), so
   the day gets the sets it would have on a normal day, the count that was
   halved (r53, V 2026-10-18: added after a lighter day, it came back with
   half its sets every time after): the block's own (`full`, kept when its
   sets were halved, r54: Pick for me's count, or Do again's), else the
   lift's plan. Until r54 that was the lift's plan whatever was chosen, so
   Pick for me's 2 sets on a normal day went in as 2 and on a lighter day
   as 3 (PENDING 313 g). */
export function routineUpdatesIn(M: Model, d: FinishedDraft): RoutineUpdate | null {
  const R = M.s.routines.find(r => r.id === d.routineId);
  if (!R) return null;
  const day = R.days.find(x => x.id === d.dayId);
  if (!day) return null;
  const have = new Set(day.items.map(i => i.exId));
  const add: RoutineUpdate['add'] = [],
    swap: RoutineUpdate['swap'] = [];
  const seen = new Set<string>();
  for (const b of d.ex) {
    if (have.has(b.exId) || seen.has(b.exId) || !b.sets.some(s => s.done && !s.warm)) continue;
    seen.add(b.exId);
    // Limited-equipment swaps are for that session only.
    if (d.limited && b.swappedFrom) continue;
    /* A swap takes the range, effort, rest and step it was done at into the
       day, its sets staying the slot's (r55, from the audit: the day kept the
       old lift's plan, so the next session asked other reps than this one). */
    if (b.swappedFrom && have.has(b.swappedFrom)) {
      const plan: RoutineUpdate['swap'][number]['plan'] = {};
      for (const k of ['repMin', 'repMax', 'rir', 'rest', 'inc', 'jump'] as const) {
        const v = b.plan[k];
        if (v != null) plan[k] = v;
      }
      swap.push({ from: b.swappedFrom, to: b.exId, plan });
    } else {
      const { ss: _s, ...p } = b.plan;
      const sets = d.deload || d.light ? (b.full ?? planForIn(M, b.exId, R, d.dayId, false, d.date).sets) : p.sets;
      add.push({ exId: b.exId, plan: { ...p, sets: Math.max(1, +(sets || 0) || DEFAULT_PLAN.sets) } });
    }
  }
  /* A superset made in the session (r35, V, as Strong and Hevy ask): pairs
     of exercises done linked that the day has, or will have after the
     change, but not linked there. */
  const after = new Set([
    ...day.items
      .map(i => i.exId)
      .map(id => {
        const sw = swap.find(x => x.from === id);
        return sw ? sw.to : id;
      }),
    ...add.map(x => x.exId)
  ]);
  const ss: string[][] = [];
  const groups = new Map<string, string[]>();
  for (const b of d.ex) {
    const g = b.plan && b.plan.ss;
    if (!g || !b.sets.some(x => x.done && !x.warm)) continue;
    let list = groups.get(g);
    if (!list) groups.set(g, (list = []));
    list.push(b.exId);
  }
  for (const ids of groups.values()) {
    const u = [...new Set(ids)].filter(id => after.has(id));
    if (u.length < 2) continue;
    const its = u.map(id => day.items.find(i => i.exId === id));
    const first = its[0];
    if (first && first.ss && its.every(i => !!i && i.ss === first.ss)) continue;
    ss.push(u);
  }
  if (!add.length && !swap.length && !ss.length) return null;
  const bits = [
    ...swap.map(x => `${exNameIn(M, x.from)} → ${exNameIn(M, x.to)}`),
    ...add.map(x => `add ${exNameIn(M, x.exId)}`),
    ...ss.map(u => `superset ${andList(u.map(id => exNameIn(M, id)))}`)
  ];
  return { rid: R.id, dayId: day.id, dayName: day.name, add, swap, ss, text: bits.join(', ') };
}
