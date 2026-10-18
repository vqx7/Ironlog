/* A session in progress: the grey and effective load of a row, the live
   target, the Last column, a lift done twice, the rest after an exercise, a
   blank session, the fingerprint an edit is compared by, and hints said once
   (phase 3a, r51; moved unchanged from the legacy script, tests/moved.js
   holds them to r50's code). What reads the log or the settings to fill a
   session (suggestions, adjustments) moves with the engine in 3b. */

import type { DraftBlock, DraftSet, Target } from './types';
import { uid, today } from './util';
import { isWork } from './formulas';

/* ---------- loads and targets ---------- */

/* The load a row shows in grey while its load field is empty (r25), and the
   load settleLoad writes in when the set is ticked or saved at Finish: the
   load of the nearest working set above that has one, else the block's
   suggestion; none on a warm-up or a drop set. A row that exists means the
   block does, which the ! on each b below says to TypeScript. */
export function greyW(b: DraftBlock | null | undefined, si: number): number | null {
  const s = b && b.sets[si];
  if (!s || s.warm || s.drop) return null;
  // After a set the app adjusted from (b.adj, r34), the rows under it carry the adjusted load.
  for (let i = si - 1; i >= 0; i--) {
    const x = b!.sets[i];
    if (!x.warm && !x.drop && x.w != null) return b!.adj && b!.adj.at === i ? b!.adj.w : x.w;
  }
  return b!.sw == null ? null : b!.sw;
}

// What a row's load is or will be: typed, else its grey load.
export function effW(b: DraftBlock | null | undefined, si: number): number | null {
  const s = b && b.sets[si];
  if (!s) return null;
  return s.w != null ? s.w : greyW(b, si);
}

/* A reps target compares today's first n sets at the load with last time's
   first n. When today has fewer working sets (removed, or trimmed by Short on
   time), the target shrinks to those sets, since the old total could no
   longer be reached. Targets saved before rs existed keep the old numbers.
   cleanTgt lets a target's n be absent or null, which the comparison reads
   as JavaScript does; the cast only lets TypeScript accept that. */
export function effTarget(b: DraftBlock): Target | null | undefined {
  const t = b.tgt;
  if (!t || t.kind !== 'reps') return t;
  const nw = b.sets.filter(x => !x.warm && !x.drop).length;
  if (!Array.isArray(t.rs) || !(nw > 0) || nw >= (t.n as number)) return t;
  return { ...t, n: nw, total: t.rs.slice(0, nw).reduce((a, v) => a + v, 0) };
}

/** The target as worded on the block, with the sets it counts brought down to today's (effTarget).
    effTarget gives back a target whenever the block has one, and with none
    the function returns before e is read, as the ! says. cleanTgt lets total
    be null, and the cast lets TypeScript add 1 to it as JavaScript does. */
export function targetText(b: DraftBlock): string | undefined {
  const t = b.tgt,
    e = effTarget(b)!;
  if (!t || t === e || !b.target) return b.target;
  const m = b.target.match(
    /^(\d+)(s?)\+ (reps )?(?:in one set|over (?:your first )?\d+ sets|in one hold|over (?:your first )?\d+ holds)( at .*)$/
  );
  if (!m) return b.target;
  const hold = m[2] === 's';
  const over = e.n === 1 ? (hold ? 'in one hold' : 'in one set') : `over ${e.n} ${hold ? 'holds' : 'sets'}`;
  return `${(e.total as number) + 1}${m[2]}+ ${m[3] || ''}${over}${m[4]}`;
}

/* "Over your first 3 sets" only when the plan has more sets than that, so
   the extra ones are clearly not counted; "over 4 sets" when 4 is all there
   are (r34.2, from the review). With no plan or no count, + reads 0 or NaN,
   neither more than n; the cast only lets TypeScript accept the +. */
export function overSets(n: number, plan: { sets?: number | undefined } | null | undefined, kind?: string): string {
  const w = kind === 'hold' ? 'hold' : 'set';
  if (n === 1) return `in one ${w}`;
  return +((plan && plan.sets) as number) > n ? `over your first ${n} ${w}s` : `over ${n} ${w}s`;
}

/* ---------- progress ---------- */

/** An exercise is done when it has sets other than warm-ups and every one of them is ticked. */
export function blockDone(b: DraftBlock): boolean {
  const w = b.sets.filter(x => !x.warm);
  return w.length > 0 && w.every(x => x.done);
}

/** Sets other than warm-ups ticked out of all of them, and the share in percent. */
export function sessProgress(d: { ex: DraftBlock[] }): { n: number; k: number; pct: number } {
  let n = 0,
    k = 0;
  for (const b of d.ex)
    for (const x of b.sets)
      if (!x.warm) {
        n++;
        if (x.done) k++;
      }
  return { n, k, pct: n ? (k / n) * 100 : 0 };
}

/** The rest after an exercise: none before the next one of the same superset, else its plan's.
    A plan with no rest reads as 0; the cast only lets TypeScript accept the +. */
export function blockRest(d: { ex: DraftBlock[] }, bi: number): number {
  const b = d.ex[bi],
    nx = d.ex[bi + 1];
  return b.plan.ss && nx && nx.plan.ss === b.plan.ss ? 0 : +(b.plan.rest as number) || 0;
}

/* ---------- the Last column ---------- */

/* The Last column (r44, V: "what I did last time next to what I'm about to
   do"). b.prev is the sets at the working load of the session the Last line
   names, the same sets the grey reps repeat; row n of the working sets sits
   beside set n of them. The line above the sets then names only the session
   ("Last (Oct 10, trimmed)"), unless a top single or a pyramid's other
   loads were left out of the column (b.prevOff): then it keeps every set. A
   block from before r44 has no prev and keeps the whole line. */
/* The same lift again later in the session (r45): last time's sets are one
   merged list (sameExOnce), and how they were split between the blocks is
   not recorded, so the column cannot say which set this row repeats. The
   later block shows dashes and the whole Last line instead of a wrong row
   (the r45 spec review). Keyed like sameExOnce: the lift and a lighter block. */
export function lastDup(d: { ex: DraftBlock[] }, bi: number): boolean {
  const b = d.ex[bi];
  return !!b && d.ex.slice(0, bi).some(x => x.exId === b.exId && !!x.light === !!b.light);
}

/** The Last column beside working row i (counted from 0): set i of last time,
    blank past the end of last time's sets, with no prev, or on a repeat of the lift (dup). */
export function lastCell(b: DraftBlock, i: number, dup?: boolean): string {
  return !dup && Array.isArray(b.prev) && i >= 0 && i < b.prev.length ? b.prev[i] : '';
}

/** The Last line above the sets: shortened to the session's name and date (up
    to the closing bracket) while the column shows the sets, else whole. */
export function lastHead(b: DraftBlock, dup?: boolean): string {
  const t = b.last || '';
  if (dup || !Array.isArray(b.prev) || !b.prev.length || b.prevOff) return t;
  const k = t.indexOf('):');
  return k > 0 ? t.slice(0, k + 1) : t;
}

/* ---------- the same lift twice ---------- */

/** A block of a saved or running session, as the joins read it. */
type Joinable = {
  exId: string;
  light?: boolean | undefined;
  sets: DraftSet[];
  note?: string | undefined;
  rr?: [number, number] | null | undefined;
  cut?: boolean | undefined;
};

/* The same exercise twice in one session (r34.2, V): sets done on one lift
   are one exposure of it, whatever order they were logged in. Blocks side by
   side are joined into one (live when a swap or an add lands next to the
   same exercise, and at Finish); apart (2nd and 4th), they stay where they
   were done, and the numbers read them together (sameExOnce in IDX). A
   lighter block and a normal one are different work and never join. */
export function joinable(a: Joinable | null | undefined, b: Joinable | null | undefined): boolean {
  return !!a && !!b && a.exId === b.exId && !a.light === !b.light;
}

/* Rows of a block made for the same exercise, appended to the one already
   there: the working rows still to do, and the plan's count with them. */
export function joinRows(into: DraftBlock, from: DraftBlock): DraftSet[] {
  const rows = from.sets.filter(x => !x.warm && !x.drop && !x.done);
  into.sets.push(...rows);
  into.plan = { ...into.plan, sets: into.sets.filter(x => !x.warm && !x.drop).length };
  return rows;
}

/* Saved exercises side by side on the same lift become one, sets in order. */
export function joinAdjacent<X extends Joinable>(ex: readonly X[]): X[] {
  const out: X[] = [];
  for (const b of ex) {
    const a = out[out.length - 1];
    if (a && a.exId === b.exId && !a.light === !b.light) {
      a.sets = [...a.sets, ...b.sets];
      if (b.note && b.note.trim()) a.note = [a.note, b.note].filter(x => x && x.trim()).join(' ');
      if (!a.rr && b.rr) a.rr = b.rr;
      a.cut = a.cut && b.cut ? true : undefined;
      continue;
    }
    out.push({ ...b, sets: [...b.sets] });
  }
  return out;
}

/* For the numbers, every block of one lift in a session reads as one: one
   exposure for targets, trends, stalls and PRs (two blocks used to count as
   two sessions on one day, and could each set a PR). */
export function sameExOnce<X extends Joinable>(ex: readonly X[]): X[] {
  const by = new Map<string, X>();
  const out: X[] = [];
  for (const b of ex) {
    const k = b.exId + (b.light ? '|l' : '');
    const a = by.get(k);
    if (!a) {
      const c = { ...b, sets: [...b.sets] };
      by.set(k, c);
      out.push(c);
      continue;
    }
    const wa = a.sets.filter(isWork).length,
      wb = b.sets.filter(isWork).length;
    a.sets.push(...b.sets);
    if (wb > wa && b.rr) a.rr = b.rr;
    else if (!a.rr && b.rr) a.rr = b.rr;
    a.cut = !!(a.cut && b.cut);
  }
  return out;
}

/* ---------- a session as a whole ---------- */

/* Freestyle and Do again build a session that is not tied to a routine day:
   no dayId and no routineId, so the cycle never advances on it. */
export function freeDraft(name: string, ex?: DraftBlock[] | null) {
  return {
    id: uid(),
    startedAt: Date.now(),
    date: today(),
    dayIdx: 0,
    dayId: null,
    dayName: name,
    routineId: '',
    free: true,
    deload: false,
    light: false,
    cardio: [],
    notes: '',
    editingId: null,
    ex: ex || []
  };
}

/** What an edit from History is compared by, to tell whether anything changed: the date, notes, sets and cardio. */
export function editFp(d: {
  date: string;
  notes?: string | null;
  ex: DraftBlock[];
  cardio?: { kind: string; min: unknown; hr: unknown; dist?: unknown }[] | null;
}): string {
  return JSON.stringify({
    date: d.date,
    notes: (d.notes || '').trim(),
    ex: d.ex.map(b => [
      b.exId,
      (b.note || '').trim(),
      b.sets.map(x => [
        x.w == null ? null : +x.w,
        x.r == null || x.r === '' ? null : +x.r,
        x.rir == null || x.rir === '' ? null : +x.rir,
        !!x.done,
        !!x.warm,
        !!x.drop
      ])
    ]),
    c: (d.cardio || []).map(c => [c.kind, c.min, c.hr, c.dist || null])
  });
}

/* RIR used to be a free-text field, which on a phone means opening the keyboard
   mid-set. Almost nobody does that, so almost every set came through blank and
   the volume bands silently counted it as hard anyway. A native picker is one
   tap, which is the difference between measuring and assuming. */
/* RIR is picked from a strip of 0 to 5 instead of the phone's dropdown wheel
   (open, spin, confirm on every set). The cell shows the value; tapping it
   opens the strip under that set, and ticking a set done with no RIR yet
   opens it by itself, so logging effort is one tap. */
export const RIR_OPTS: readonly string[] = ['0', '1', '2', '3', '4', '5'];

/* A line said on every exercise is said once (r34.2, from the review: the
   first-time paragraph on all 8 exercises, "Half the usual sets, nothing to
   beat." on each of a lighter day's). Later exercises keep what is theirs:
   the load and the reps. */
export const HINT_ONCE: readonly string[] = [
  'Half the usual sets, nothing to beat.',
  "Next time's load is worked out from this.",
  'If the first set is off, change the load.',
  'Next time picks up from here.'
];

/** A suggestion's hint as the session screen shows it: once a line has been
    said on an earlier exercise (recorded in seen, which the session screen
    makes anew each time it is drawn), the first-time paragraph is shortened
    and the HINT_ONCE lines are left out. */
export function hintOnce(t: string | null | undefined, seen: Set<string>): string {
  if (!t) return '';
  const m = t.match(
    /^First time: pick a load you think you could lift about (\d+) times, erring light\. Do (.+?), (?:stopping with about \d+ still in you|to the last rep you can do well)\. Next time's load is worked out from this\.$/
  );
  if (m) {
    if (seen.has('first')) return `First time: a load you could lift about ${m[1]} times; do ${m[2]}.`;
    seen.add('first');
    return t;
  }
  let out = t;
  for (const x of HINT_ONCE)
    if (out.includes(x)) {
      if (seen.has(x)) out = out.replace(' ' + x, '').replace(x, '');
      else seen.add(x);
    }
  return out.trim();
}
