/* A session in progress: the grey and effective load of a row, the live
   target, the Last column, a lift done twice, the rest after an exercise, a
   blank session, the fingerprint an edit is compared by, and hints said once
   (phase 3a, r51; moved unchanged from the legacy script). What reads the log or the settings to fill a
   session (suggestions, adjustments) moves with the engine in 3b. */

import type { DraftBlock, DraftSet, Session, SessionEx, Target } from './types';
import { uid, today, PERCENT, pctOf, shareWords } from './util';
import { isMissed, isWork, LIGHTER_SET_SHARE, LIGHT_SHARE, RIR_CALL_TOP } from './formulas';
import { fmtDate, LIGHT_RIR } from './format';
import { cleanChk } from './records';

/* ---------- loads and targets ---------- */

/* The load a row shows in grey while its load field is empty (r25), and the
   load settleLoad writes in when the set is ticked or saved at Finish: the
   load of the nearest working set above that has one, else the block's
   suggestion; none on a warm-up or a drop set. A missed set's load (r55, a
   lift tried and not made) is passed over, so the row under it shows the
   last load done. A row that exists means the block does, which the ! on
   each b below says to TypeScript. */
export function greyW(b: DraftBlock | null | undefined, si: number): number | null {
  const s = b && b.sets[si];
  if (!s || s.warm || s.drop) return null;
  // After a set the app adjusted from (b.adj, r34), the rows under it carry the adjusted load.
  for (let i = si - 1; i >= 0; i--) {
    const x = b!.sets[i];
    if (!x.warm && !x.drop && x.w != null && !isMissed(x)) return b!.adj && b!.adj.at === i ? b!.adj.w : x.w;
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
   cleanTgt lets a target's n be absent or null: Number reads null as 0 and
   an absent n as NaN, which no count reaches. */
export function effTarget(b: DraftBlock): Target | null | undefined {
  const t = b.tgt;
  if (!t || t.kind !== 'reps') return t;
  const nw = b.sets.filter(x => !x.warm && !x.drop).length;
  if (!Array.isArray(t.rs) || !(nw > 0) || nw >= Number(t.n)) return t;
  return { ...t, n: nw, total: t.rs.slice(0, nw).reduce((a, v) => a + v, 0) };
}

/** What a target's reason is read from: a block in the session (its hint)
    or a suggestion (its text), with its Last line and the date of the full
    session the target came from when that was not the last. */
interface TargetReason {
  hint?: string | undefined;
  text?: string | undefined;
  last?: string | undefined;
  basis?: string | null | undefined;
}

/** The reason behind a target, in the engine's own words (r47). b.hint is the
    whole sentence the case wrote, and it opens with the Last line (b.last),
    which the screen shows on its own line already, so that prefix comes off
    rather than being said twice. Nothing is recomputed here: a second account
    of the rules would be a second thing to keep right. The note says what
    does not set a target, by V's one rule for every session (r54, PENDING
    312 E): a session of the lift with fewer sets or reps than its usual, or
    done lighter, whatever the day (r53 named trimmed sessions, and fewer
    reps or sets on lighter days only; until r53 lighter and deload sessions
    as a whole). */
export function whyTarget(b: TargetReason | null | undefined): string {
  if (!b) return '';
  // A session block renames the suggestion's text to hint, so take either.
  const h = (b.hint || b.text || '').trim(),
    l = (b.last || '').trim();
  const reason = l && h.startsWith(l) ? h.slice(l.length).trim() : h;
  const basis = b.basis
    ? ` The target comes from your last full session, ${fmtDate(b.basis)}; one with fewer sets or reps than usual, or done lighter, does not set one.`
    : '';
  return (reason + basis).trim();
}

/** The target as worded on the block, with the sets it counts brought down to today's (effTarget).
    effTarget gives back a target whenever the block has one, and with none
    the function returns before e is read, as the ! says. cleanTgt lets total
    be null, which Number reads as 0, as JavaScript would add it. */
export function targetText(b: DraftBlock): string | undefined {
  const t = b.tgt,
    e = effTarget(b)!;
  if (!t || t === e || !b.target) return b.target;
  const m = b.target.match(
    /^(\d+)(s?)\+ (reps )?(?:in one set|over (?:your first )?\d+ sets|in one hold|over (?:your first )?\d+ holds)( at .*)$/
  );
  if (!m) return b.target;
  const [, , s, reps, at] = m;
  const hold = s === 's';
  const over = e.n === 1 ? (hold ? 'in one hold' : 'in one set') : `over ${e.n} ${hold ? 'holds' : 'sets'}`;
  return `${Number(e.total) + 1}${s}+ ${reps || ''}${over}${at}`;
}

/* "Over your first 3 sets" only when the plan has more sets than that, so
   the extra ones are clearly not counted; "over 4 sets" when 4 is all there
   are (r34.2, from the review). With no plan or no count, Number reads 0 or
   NaN, neither more than n. */
export function overSets(n: number, plan: { sets?: number | undefined } | null | undefined, kind?: string): string {
  const w = kind === 'hold' ? 'hold' : 'set';
  if (n === 1) return `in one ${w}`;
  return Number(plan && plan.sets) > n ? `over your first ${n} ${w}s` : `over ${n} ${w}s`;
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
  return { n, k, pct: n ? (k / n) * PERCENT : 0 };
}

/** The rest after an exercise: none before the next one of the same superset, else its plan's.
    A plan with no rest reads as 0. */
export function blockRest(d: { ex: DraftBlock[] }, bi: number): number {
  const b = d.ex[bi],
    nx = d.ex[bi + 1];
  return b.plan.ss && nx && nx.plan.ss === b.plan.ss ? 0 : +b.plan.rest || 0;
}

/* ---------- the Last column ---------- */

/* The Last column (r44, V: "what I did last time next to what I'm about to
   do"). b.prev is the sets at the working load of the session the Last line
   names, the same sets the grey reps repeat; row n of the working sets sits
   beside set n of them. The line above the sets then names only the session
   ("Last (Oct 10, fewer sets)"), unless a top single or a pyramid's other
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
  nw?: true | undefined;
  sets: DraftSet[];
  note?: string | undefined;
  rr?: [number, number] | null | undefined;
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

/* A block as Finish saves it (r55: one source for Finish and for a first
   link keeping another device's workout): its ticked sets as typed, a blank
   load 0, the range it was planned at (or, in an edit, the range it was
   saved with), and its marks, the keys in the order Finish always wrote. */
/** An exercise in the session in progress as Finish saves it; an exercise with no set ticked comes back with no sets. */
export function savedEx(b: DraftBlock): SessionEx {
  const rr: [number, number] | null =
    b.keepRR !== undefined
      ? b.keepRR
      : b.plan && Number(b.plan.repMin) > 0 && Number(b.plan.repMax) > 0
        ? [Number(b.plan.repMin), Number(b.plan.repMax)]
        : null;
  return {
    exId: b.exId,
    note: b.note || '',
    rr,
    light: b.light ? true : undefined,
    ...(b.inj ? { inj: b.inj } : {}),
    sets: b.sets
      .filter(s => s.done)
      .map(s => ({
        w: s.w == null ? 0 : s.w,
        r: Number(s.r),
        rir: s.rir == null || s.rir === '' ? null : Number(s.rir),
        warm: !!s.warm,
        drop: !!s.drop && !s.warm,
        cal: s.cal && !s.warm ? s.cal : undefined,
        // The row's own id (r56.1), last, where a build before it keeps the unknown field.
        ...(typeof s.rid === 'string' ? { rid: s.rid } : {})
      }))
  };
}

/* A block in the session over time (r46). Neither handle on its own
   survives: a place changes whenever exercises move, and the object is
   replaced by normalize, which runs on every sync, Undo, cross-tab write and
   restore. The id made with the exercise survives both, so it leads, with
   the object and then the place behind it for a session started on a build
   before r46, which has no id. */
/** A block of the session, held so a move or a redraw finds it again. */
export interface BlkRef {
  bid: string | null;
  b: DraftBlock;
  i: number;
}

/** The parts of a session in progress a saved session is made from. */
export interface DraftLike {
  id: string;
  date: string;
  dayIdx: number;
  dayId: string | null;
  dayName?: string | undefined;
  routineId: string;
  notes?: string | undefined;
  deload?: boolean | undefined;
  light?: boolean | undefined;
  free?: boolean | undefined;
  editingId?: string | null | undefined;
  startedAt?: number | null | undefined;
  chk?: Session['chk'] | null;
  cardio?: DraftCardio[] | undefined;
  ex: DraftBlock[];
  /** A past workout typed in afterwards: no rest timer, no clock, no check-in. */
  past?: boolean | undefined;
  /** The notes the app wrote when it started, so Discard can tell them from the lifter's. */
  note0?: string | undefined;
  /** Started with Limited equipment. */
  limited?: boolean | undefined;
  /** An edit's measured minutes, kept as the saved session had them. */
  durMin?: number | null | undefined;
  /** Finish has asked about the sets left, or the ramp-up sets, once (this visit). */
  _leftAsked?: boolean | undefined;
  _rampAsked?: boolean | undefined;
}

/** A cardio row inside a workout in progress: what `draftCardio` reads of it, and what its card shows. */
interface DraftCardio {
  id?: string | undefined;
  min?: number | null | undefined;
  kind?: string | undefined;
  hr?: number | null | undefined;
  dist?: number | undefined;
  when?: string | undefined;
  note?: string | undefined;
}

/* Another device's workout in progress, kept as a session when a first link
   keeps this device's own (r55, from the review: the merge kept one of the
   two and the other's ticked sets were lost on every device). Only what was
   ticked, as Finish would save it, with its check-in and the time it started
   (the second review of r55: both were dropped), untimed; its cardio rows are
   kept beside it through draftCardio, as Finish keeps them. An edit of a
   saved session is not one (that session is already kept). Null when
   nothing is ticked. */
/** A workout in progress as a saved session of its ticked sets, or null when none is ticked or it is an edit. */
export function draftSession(d: DraftLike, empty?: boolean): Session | null {
  if (d.editingId) return null;
  const ex = withNew(joinAdjacent(d.ex.map(savedEx).filter(b => b.sets.length)), d);
  // A copy with nothing ticked is no session, unless asked for as the agreed copy of a join (keepLost), where it is the base with no sets.
  if (!ex.length && !empty) return null;
  const chk = cleanChk(d.chk);
  return {
    id: d.id,
    date: d.date,
    dayIdx: d.dayIdx,
    dayId: d.dayId || null,
    dayName: (d.dayName || '').trim() || 'Session',
    routineId: d.routineId,
    ex,
    notes: d.notes || '',
    durMin: null,
    deload: !!d.deload,
    light: !!d.light,
    free: d.free ? true : undefined,
    demo: false,
    ...(chk ? { chk } : {}),
    ...(d.startedAt && d.startedAt > 0 ? { t: d.startedAt } : {})
  };
}

/* The cardio rows of a workout in progress that Finish saves: those with
   minutes, dated the session's day. Finish and a first link's kept workout
   read them here, so the two save the same entries under the same ids
   (normalize then cleans each, as Finish's cleanCardio does). */
/** A workout in progress's cardio rows with minutes, each dated the session's day. */
export function draftCardio<C extends DraftCardio>(d: {
  date: string;
  cardio?: readonly C[] | undefined;
}): (C & { date: string })[] {
  return (d.cardio || []).filter(c => (c.min || 0) > 0).map(c => ({ ...c, date: d.date }));
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
    // A new machine or gym marks the lift in the session, so its one exposure carries the mark when any block does (r61).
    if (b.nw) a.nw = true;
    if (wb > wa && b.rr) a.rr = b.rr;
    else if (!a.rr && b.rr) a.rr = b.rr;
  }
  return out;
}

/* ---------- a new machine or gym (r61, PENDING 343 7) ---------- */

/* "New machine or gym" in an exercise's menu marks the lift in the session
   in progress: every block of it then carries nw, and the rules read the
   lift as starting over from this session (liftReadIn), so a block of it
   added after the mark reads so too. Finish saves the mark on each of the
   lift's exercises, last, after the sets its plan gave it (withPlanSets),
   where normalize writes it. */
/** Whether the session in progress marks a lift as done at a new machine or gym. */
export function markedNew(d: { ex: readonly { exId: string; nw?: true | undefined }[] }, exId: string): boolean {
  return d.ex.some(b => b.exId === exId && !!b.nw);
}

/** Saved exercises with the mark on each lift the session marks, last. */
export function withNew<B extends { exId: string }>(ex: readonly B[], d: Parameters<typeof markedNew>[0]): B[] {
  return ex.map(b => (markedNew(d, b.exId) ? { ...b, nw: true as const } : b));
}

/* ---------- a session as a whole ---------- */

/** A new row of a workout in progress: blank, or with the fields given, and its own id (r56.1), kept when one is given (a saved set opened for editing keeps its row). */
export function newRow(over?: Partial<DraftSet>): DraftSet {
  return {
    w: null,
    r: null,
    rir: null,
    warm: false,
    drop: false,
    done: false,
    ...over,
    rid: over && typeof over.rid === 'string' ? over.rid : uid()
  };
}

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
  notes?: string | null | undefined;
  ex: DraftBlock[];
  cardio?: { kind?: string | undefined; min?: unknown; hr?: unknown; dist?: unknown }[] | null | undefined;
}): string {
  return JSON.stringify({
    date: d.date,
    notes: (d.notes || '').trim(),
    ex: d.ex.map(b => [
      b.exId,
      (b.note || '').trim(),
      // A new machine or gym marked or taken off is an edit too (r61).
      !!b.nw,
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
/* The note a deload or a lighter session starts with, saved in its notes as
   the rules stood when it began: the share of the sets, the load and the
   reserve its lifts are given (lighterSets, LIGHT_SHARE, LIGHT_RIR). */
/** A deload session's opening note. */
export const DELOAD_NOTE = `Deload: ${shareWords(LIGHTER_SET_SHARE)} sets, about ${pctOf(LIGHT_SHARE)}% loads, ${LIGHT_RIR}+ RIR.`;
/** A lighter session's opening note. */
export const LIGHTER_NOTE = `Lighter session: ${shareWords(LIGHTER_SET_SHARE)} sets, about ${pctOf(LIGHT_SHARE)}% loads, ${LIGHT_RIR}+ RIR.`;

/* RIR is picked from a strip of 0 to RIR_CALL_TOP instead of the phone's
   dropdown wheel (open, spin, confirm on every set). The cell shows the
   value; tapping it opens the strip under that set, and ticking a set done
   with no RIR yet opens it by itself, so logging effort is one tap. */
/** The effort strip's choices in whole reps: 0 to RIR_CALL_TOP. */
export const RIR_OPTS: readonly string[] = Array.from({ length: RIR_CALL_TOP + 1 }, (_, i) => String(i));
/** The effort strip's choices in half reps (Settings, Effort): every half from 0 to RIR_CALL_TOP. */
export const RIR_HALF_OPTS: readonly string[] = Array.from({ length: 2 * RIR_CALL_TOP + 1 }, (_, i) => String(i / 2));

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
