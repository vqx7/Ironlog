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
   recoverable mistake; a row added on one side is kept, after the row it
   follows on that side, so a warm-up added at the top stays at the top
   (PENDING 333, F10). Rows are matched by their own ids (`rid`, given since
   r56.1). A row without one (a build before r56.1 made it) is matched by its
   place among the rows without one in a workout in progress, whose rows all
   stay in place, ticked or not, as long as rows are added at the end (an
   older build's warm-up added at the top moves every place: PENDING 333,
   F8); in a saved session (a join, below) the rows left unticked are gone,
   so a place means nothing there, and such a row is matched by what it
   holds instead. Exercises are keyed by their own ids (`bid`), or, on an
   exercise an older build made without one, by exercise and occurrence, as
   Undo keys them, so the same lift twice is two exercises however either
   phone changes the other (F9); the order of exercises follows the side
   that changed it, both when neither did, and the later edit when both did;
   an exercise's own fields, and the workout's, are merged value by value,
   and the workout's cardio rows record by record, since they have ids. */

/** A row a merge reads: its own id, if it has one. */
type Rowed = { rid?: string | undefined };
/** An exercise a merge reads: its own id if it has one, which lift, and its rows. */
type Exercised<R extends Rowed> = { bid?: string | undefined; exId: string; sets: R[] };
/** How rows without an id are matched: by their place (a workout in progress), or by what they hold (a saved session). */
type RowMatch = 'place' | 'content';

/** What a row holds, its id left out. */
const held = (r: Rowed): string => canon({ ...r, rid: undefined });
/** Each row by its key: its id, or its place among the rows without one ("#n"). */
function rowKeys<R extends Rowed>(sets: readonly R[]): [string, R][] {
  let n = 0;
  return sets.map(r => [typeof r.rid === 'string' ? r.rid : '#' + n++, r]);
}
/* By content (a join): a row without an id takes the key of a row it is
   matched to that holds the same and that no other row of its side has
   taken: a row of the agreed copy, so a set both phones kept as it was is
   one set, and any other row is its own side's ("l#n", "r#n"), so two sets
   typed alike on the two phones stay two; with no agreed copy (a note from a
   build before r56.1), a row of the other side's, one to one, so the sets
   both phones had are one each and only what one side has besides is added
   (PENDING 333, F5: matched to nothing, every set both had was saved twice). */
/** One side's rows by key, matched by content to the rows given (above). */
function contentKeys<R extends Rowed>(to: readonly [string, R][], sets: readonly R[], side: string): [string, R][] {
  // A row this side still holds by its id is taken by it, so no row without an id can take its key as well.
  const ids = new Set(sets.map(r => r.rid));
  const free = to.map(([k, r]) => ({ k, h: held(r), taken: ids.has(k) }));
  let n = 0;
  return sets.map(r => {
    if (typeof r.rid === 'string') return [r.rid, r];
    const h = held(r);
    const b = free.find(x => !x.taken && x.h === h);
    if (b) {
      b.taken = true;
      return [b.k, r];
    }
    return [side + '#' + n++, r];
  });
}
/** The keys of a merged list in order: the base's, then each side's own, each after the key it follows on its side (the side given first placed first). */
function weave(base: readonly string[], sides: readonly (readonly string[])[]): string[] {
  const out = [...base];
  for (const keys of sides) {
    let at = -1;
    for (const k of keys) {
      const i = out.indexOf(k);
      if (i >= 0) at = i;
      else out.splice(++at, 0, k);
    }
  }
  return out;
}
/** The rows of two copies of one exercise merged against the base's rows (above); base null when there is no agreed copy. */
function mergeRows<R extends Rowed>(
  base: readonly R[] | null,
  l: readonly R[],
  r: readonly R[],
  remoteWins: boolean,
  stat: Stat,
  match: RowMatch
): R[] {
  const bk = rowKeys(base || []);
  let lk: [string, R][], rk: [string, R][];
  if (match === 'place') {
    lk = rowKeys(l);
    rk = rowKeys(r);
  } else if (base) {
    lk = contentKeys(bk, l, 'l');
    rk = contentKeys(bk, r, 'r');
  } else {
    rk = contentKeys([], r, 'r');
    lk = contentKeys(rk, l, 'l');
  }
  const B = new Map(bk),
    L = new Map(lk),
    R = new Map(rk);
  // Rows matched by content may differ in their ids alone, so rows are compared by what they hold; of two that hold the same, the one with an id is kept.
  const same = (x: R, y: R): boolean => held(x) === held(y);
  const either = (x: R, y: R): R => (typeof x.rid === 'string' || typeof y.rid !== 'string' ? x : y);
  const out: R[] = [];
  /* Every key the three copies hold, in order. In a workout in progress each
     side's own rows go after the row they follow on that side (weave). In a
     join the rows left unticked are gone, so where a row sat is not known:
     the session saved on the other phone (remote) keeps its order, a warm-up
     it added at the top included (PENDING 333, the review of the fix), and
     what was done here since is added after it, as the lifter is told. */
  const order =
    match === 'place'
      ? weave([...B.keys()], [[...L.keys()], [...R.keys()]])
      : [...new Set([...R.keys(), ...B.keys(), ...L.keys()])];
  for (const k of order) {
    const b = B.get(k),
      a = L.get(k),
      c = R.get(k);
    if (a && c) {
      if (same(a, c)) out.push(either(a, c));
      else if (b && same(c, b)) out.push(a);
      else if (b && same(a, b)) out.push(c);
      else {
        stat.conflicts++;
        out.push(remoteWins ? c : a);
      }
    } else if (a) {
      // Gone on remote: removed there, unless it changed here since the base (or was added here).
      if (!(b && same(a, b))) out.push(a);
    } else if (c) {
      if (!(b && same(c, b))) out.push(c);
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
/** Each exercise by its key: its own id, or, made without one, the exercise and its occurrence among those ("bench#1"), as Undo keys them. */
function blockKeys<X extends { bid?: string | undefined; exId: string }>(list: readonly X[]): [string, X][] {
  const seen: Record<string, number> = {};
  return list.map(b => [
    typeof b.bid === 'string' && b.bid ? 'b:' + b.bid : b.exId + '#' + (seen[b.exId] = (seen[b.exId] || 0) + 1),
    b
  ]);
}
/** Two copies of a list of exercises (a workout's, or a session's) merged: exercises by key, rows by id, every other field value by value; base null when there is no agreed copy. */
function mergeExercises<R extends Rowed, X extends Exercised<R>>(
  base: readonly X[] | null,
  local: readonly X[],
  remote: readonly X[],
  remoteWins: boolean,
  stat: Stat,
  match: RowMatch
): X[] {
  const B = new Map(blockKeys(base || [])),
    L = new Map(blockKeys(local)),
    R = new Map(blockKeys(remote));
  const bo = [...B.keys()].join('|'),
    lo = [...L.keys()].join('|'),
    ro = [...R.keys()].join('|');
  let order: string[];
  // With no agreed copy nothing tells which side changed the order: the other side's stands, as its values do (keepLost).
  if (!base) order = [...R.keys()];
  else if (lo === ro || ro === bo) order = [...L.keys()];
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
      const x: X = { ...a, sets: mergeRows(base ? (b ? b.sets : []) : null, a.sets, c.sets, remoteWins, stat, match) };
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
  const out: DraftLike = { ...local, ex: mergeExercises(base.ex, local.ex, remote.ex, remoteWins, stat, 'place') };
  // The next sets adjusted from a set stay on the rows under it when rows were added above it (PENDING 333): its place follows its row.
  for (const b of out.ex) {
    const a = b.adj;
    const i = a && typeof a.rid === 'string' ? b.sets.findIndex(x => x.rid === a.rid) : -1;
    if (a && i >= 0 && i !== a.at) b.adj = { ...a, at: i };
  }
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
  const out: Session = {
    ...local,
    ex: mergeExercises(base ? base.ex : null, local.ex, remote.ex, remoteWins, stat, 'content')
  };
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
