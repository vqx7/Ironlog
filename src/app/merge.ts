/* Record fingerprints and the three-way merge (phase 3a, r51; moved
   unchanged from the legacy script). Each synced document remembers the per-record hashes of the
   version both sides last agreed on, its base; on a conflict every record is
   judged on its own: changed on one side only, that side wins; changed on
   both, the newer side does (remoteWins), and the conflict is counted.
   Undo's merge of a session in progress is the same idea per exercise.
   Merging whole documents (mergeChunk) moves with sync in phase 4. */

import { hashStr } from './util';
import { arr, rec } from './records';
import type { Rec } from './records';
import type { Session } from './types';
import type { DraftLike } from './session';

/** The conflicts a merge counted. */
type Stat = { conflicts: number };

/** A plain object read by its own keys. */
type Fields = Record<string, unknown>;

/* Record fingerprint that ignores key order. A record saved straight from the
   logger and the same record after normalize() list their fields in a
   different order; a plain JSON hash called that an edit, and a deleted
   session could come back. A field holding undefined is left out, as JSON
   leaves it out. By here x is an object and not an array; the casts let
   TypeScript read it by key. */
export function canon(x: unknown): string {
  if (x === undefined) return 'null';
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  // Array.isArray turns x, an object here, into any[]; the cast keeps each entry unknown for canon.
  if (Array.isArray(x)) return '[' + (x as unknown[]).map(canon).join(',') + ']';
  return (
    '{' +
    Object.keys(x)
      .filter(k => (x as Fields)[k] !== undefined)
      .sort()
      .map(k => JSON.stringify(k) + ':' + canon((x as Fields)[k]))
      .join(',') +
    '}'
  );
}

/** A record's fingerprint. */
export const Hx = (x: unknown): string => hashStr(canon(x));

/** Merges two versions of a list of records with ids against their base (id
    to fingerprint), record by record as described at the top. With no base
    (as on a first sync) nothing reads as deleted. Local records keep their
    order, then remote ones local lacks; a record with no string id is left
    out. The lists come straight from the documents (sync.ts, r56), so each
    is read as it is: a list field that is no list reads as empty. */
export function merge3List(
  base: Record<string, string> | null | undefined,
  l: unknown,
  r: unknown,
  remoteWins: boolean,
  stat: Stat
): Rec[] {
  const known = !!base;
  base = base || {};
  const L = new Map<string, Rec>(),
    Rm = new Map<string, Rec>();
  for (const x of arr(l) || []) {
    const R = rec(x);
    if (R && typeof R.id === 'string') L.set(R.id, R);
  }
  for (const x of arr(r) || []) {
    const R = rec(x);
    if (R && typeof R.id === 'string') Rm.set(R.id, R);
  }
  const out: Rec[] = [];
  for (const id of [...L.keys(), ...[...Rm.keys()].filter(k => !L.has(k))]) {
    const a = L.get(id),
      b = Rm.get(id),
      bh = known ? base[id] : '?';
    const ah = a ? Hx(a) : undefined,
      rh = b ? Hx(b) : undefined;
    // Every id came from one side or the other, so at least one of a and b
    // is there, and equal fingerprints mean both are (the ! on a).
    if (ah === rh) {
      out.push(a!);
      continue;
    }
    if (!a || !b) {
      // Present on one side only (so a || b is there, the !). Deleted by the other
      // side if the present copy is exactly the base; otherwise it is new or
      // edited there, so keep it.
      const p = (a || b)!,
        ph = a ? ah : rh;
      if (known && ph === bh) continue;
      out.push(p);
      continue;
    }
    if (ah === bh) {
      out.push(b);
      continue;
    }
    if (rh === bh) {
      out.push(a);
      continue;
    }
    stat.conflicts++;
    out.push(remoteWins ? b : a);
  }
  return out;
}

/** Merges two versions of one value against its base fingerprint: the side
    that changed wins, and when both did, remoteWins decides and the conflict
    is counted. */
export function merge3Val<V>(bh: string | undefined, a: V, b: V, remoteWins: boolean, stat: Stat): V {
  const ah = Hx(a),
    rh = Hx(b);
  if (ah === rh || rh === bh) return a;
  if (ah === bh) return b;
  stat.conflicts++;
  return remoteWins ? b : a;
}

/* ---------- one workout open on two phones (r56.1, PENDING 328 a and c) ---------- */

/* Two phones' copies of one workout in progress, merged against the copy
   both last agreed with the account, exercise by exercise and set by set:
   a set changed on one side alone takes that side; changed on both, the
   later edit (remoteWins), counted as a conflict; a row removed on one side
   alone goes, unless the other side changed it, since keeping data is the
   recoverable mistake; a row added on one side is kept after the base's
   rows, local's additions first. Rows are matched by their own ids (`rid`,
   given since r56.1); rows without one (an older build's) by their place
   among the rows without one. Exercises are keyed by exercise and
   occurrence, as Undo keys them; the order of exercises follows the side that
   changed it, both when neither did, and the later edit when both did; an
   exercise's own fields, and the workout's, are merged value by value, and
   the workout's cardio rows record by record, since they have ids. */

/** A row a merge reads: its own id, if it has one. */
type Rowed = { rid?: string | undefined };
/** An exercise a merge reads: which lift, and its rows. */
type Exercised<R extends Rowed> = { exId: string; sets: R[] };

/** Each row by its key: its id, or its place among the rows without one ("#n"). */
function rowKeys<R extends Rowed>(sets: readonly R[]): [string, R][] {
  let n = 0;
  return sets.map(r => [typeof r.rid === 'string' ? r.rid : '#' + n++, r]);
}
/** The rows of two copies of one exercise merged against the base's rows (above). */
function mergeRows<R extends Rowed>(
  base: readonly R[],
  l: readonly R[],
  r: readonly R[],
  remoteWins: boolean,
  stat: Stat
): R[] {
  const B = new Map(rowKeys(base)),
    L = new Map(rowKeys(l)),
    R = new Map(rowKeys(r));
  const out: R[] = [];
  // Every key the three copies hold, in order: the base's rows, then local's own, then remote's own.
  for (const k of new Set([...B.keys(), ...L.keys(), ...R.keys()])) {
    const b = B.get(k),
      a = L.get(k),
      c = R.get(k);
    const bh = b ? canon(b) : null,
      ah = a ? canon(a) : null,
      ch = c ? canon(c) : null;
    if (a && c) {
      if (ah === ch || ch === bh) out.push(a);
      else if (ah === bh) out.push(c);
      else {
        stat.conflicts++;
        out.push(remoteWins ? c : a);
      }
    } else if (a) {
      // Gone on remote: removed there, unless it changed here since the base (or was added here).
      if (!(b && ah === bh)) out.push(a);
    } else if (c) {
      if (!(b && ch === bh)) out.push(c);
    }
  }
  return out;
}
/** Every other field of two copies of a record merged value by value against the base, written into out. */
function mergeFields(
  out: Fields,
  base: Fields | null,
  l: Fields,
  r: Fields,
  skip: readonly string[],
  remoteWins: boolean,
  stat: Stat
): void {
  for (const f of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (skip.includes(f)) continue;
    const v = merge3Val(base ? Hx(base[f]) : '?', l[f], r[f], remoteWins, stat);
    if (v === undefined) delete out[f];
    else out[f] = v;
  }
}
/** Each exercise by its key: the exercise and its occurrence ("bench#1"), as Undo keys them. */
function blockKeys<X extends { exId: string }>(list: readonly X[]): [string, X][] {
  const seen: Record<string, number> = {};
  return list.map(b => [b.exId + '#' + (seen[b.exId] = (seen[b.exId] || 0) + 1), b]);
}
/** Two copies of a list of exercises (a workout's, or a session's) merged: exercises by key, rows by id, every other field value by value. */
function mergeExercises<R extends Rowed, X extends Exercised<R>>(
  base: readonly X[],
  local: readonly X[],
  remote: readonly X[],
  remoteWins: boolean,
  stat: Stat
): X[] {
  const B = new Map(blockKeys(base)),
    L = new Map(blockKeys(local)),
    R = new Map(blockKeys(remote));
  const bo = [...B.keys()].join('|'),
    lo = [...L.keys()].join('|'),
    ro = [...R.keys()].join('|');
  let order: string[];
  if (lo === ro || ro === bo) order = [...L.keys()];
  else if (lo === bo) order = [...R.keys()];
  else {
    stat.conflicts++;
    order = remoteWins ? [...R.keys()] : [...L.keys()];
  }
  for (const k of [...L.keys(), ...R.keys()]) if (!order.includes(k)) order.push(k);
  const out: X[] = [];
  for (const k of order) {
    const b = B.get(k),
      a = L.get(k),
      c = R.get(k);
    if (a && c) {
      const x: X = { ...a, sets: mergeRows(b ? b.sets : [], a.sets, c.sets, remoteWins, stat) };
      // An exercise's fields read by name; the copies are records, so the readers always find them.
      mergeFields(rec(x) || {}, b ? rec(b) : null, rec(a) || {}, rec(c) || {}, ['sets'], remoteWins, stat);
      out.push(x);
    } else if (a) {
      if (!(b && canon(a) === canon(b))) out.push(a);
    } else if (c) {
      if (!(b && canon(c) === canon(b))) out.push(c);
    }
  }
  return out;
}
/** The cardio rows of a workout in progress by id, for merge3List. */
function cardioBase(list: unknown): Record<string, string> {
  const o: Record<string, string> = {};
  for (const x of arr(list) || []) {
    const R = rec(x);
    if (R && typeof R.id === 'string') o[R.id] = Hx(x);
  }
  return o;
}
/** Two phones' copies of one workout in progress merged against the copy both agreed on (above). */
export function mergeWorkout(
  base: DraftLike,
  local: DraftLike,
  remote: DraftLike,
  remoteWins: boolean,
  stat: Stat
): DraftLike {
  const out: DraftLike = { ...local, ex: mergeExercises(base.ex, local.ex, remote.ex, remoteWins, stat) };
  const O = rec(out) || {},
    Bf = rec(base) || {},
    Lf = rec(local) || {},
    Rf = rec(remote) || {};
  mergeFields(O, Bf, Lf, Rf, ['ex', 'id', 'cardio'], remoteWins, stat);
  // The cardio rows have ids, so they merge record by record.
  const cardio = merge3List(cardioBase(Bf.cardio), Lf.cardio, Rf.cardio, remoteWins, stat);
  if (cardio.length || Lf.cardio !== undefined || Rf.cardio !== undefined) O.cardio = cardio;
  return out;
}
/** A workout finished on one phone and ticked further on another, joined: the saved session's exercises merged row by row with the ticked sets, against the copy both agreed on as Finish would have saved it (base), every other field value by value. */
export function mergeSession(
  base: Session | null,
  local: Session,
  remote: Session,
  remoteWins: boolean,
  stat: Stat
): Session {
  const out: Session = { ...local, ex: mergeExercises(base ? base.ex : [], local.ex, remote.ex, remoteWins, stat) };
  mergeFields(
    rec(out) || {},
    base ? rec(base) : null,
    rec(local) || {},
    rec(remote) || {},
    ['ex', 'id'],
    remoteWins,
    stat
  );
  return out;
}

/** A session in progress as Undo merges it: its id, its exercises and the fields merged whole. */
type UndoDraft = { id: string; ex: { exId: string }[] } & Record<string, unknown>;

/* Undo inside a session: the session in progress merged exercise by
   exercise (keyed by exercise and its occurrence), base = right after the
   action, local = now, other = before it. Exercises changed only by the
   action go back; ones changed since keep the newer version. As a whole
   record, any set logged after the action used to block the undo. */
export function mergeDraft(
  base: UndoDraft | null | undefined,
  cur: UndoDraft | null | undefined,
  pre: UndoDraft | null | undefined
): UndoDraft | null {
  if (!pre || !cur || !base || pre.id !== cur.id || base.id !== cur.id) return cur === undefined ? null : cur;
  type B = UndoDraft['ex'][number];
  const keyed = (list: readonly B[] | null | undefined): [string, B][] => {
    const seen: Record<string, number> = {};
    return (list || []).map((b): [string, B] => {
      const k = b.exId + '#' + (seen[b.exId] = (seen[b.exId] || 0) + 1);
      return [k, b];
    });
  };
  const B = new Map(keyed(base.ex)),
    C = keyed(cur.ex),
    P = keyed(pre.ex);
  const Cm = new Map(C);
  const pick = (k: string): B | undefined => {
    const b = B.get(k),
      c = Cm.get(k),
      p = P.find(x => x[0] === k);
    const pv = p ? p[1] : undefined;
    const bh = b ? canon(b) : null,
      ch = c ? canon(c) : null,
      ph = pv ? canon(pv) : null;
    if (ch === bh) return pv;
    if (ph === bh) return c;
    return c;
  };
  const out: B[] = [];
  // An action that left the exercises' order alone (a Settings change, a
  // layout reset) must not undo a reorder made after it, so the order now is
  // kept (r29: dragging exercises made that common). An action that changed
  // the order or the list puts back the order from before it.
  const ord = (l: [string, B][]): string => l.map(x => x[0]).join('|');
  const keep = ord(keyed(base.ex)) === ord(P);
  // Keep the order of the version before the action, then anything added since.
  for (const [k] of keep ? C : P) {
    const v = pick(k);
    if (v) out.push(v);
  }
  for (const [k, _c] of C) {
    if (!P.some(x => x[0] === k)) {
      const v = pick(k);
      if (v && !out.includes(v)) out.push(v);
    }
  }
  const res: UndoDraft = { ...cur, ex: out };
  for (const f of ['notes', 'dayName', 'deload', 'light', 'limited', 'cardio', 'chk']) {
    if (canon(cur[f]) === canon(base[f])) res[f] = pre[f];
  }
  // The same session with each exercise and field taken from one of its versions.
  return res;
}
