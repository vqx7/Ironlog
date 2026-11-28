/* Record fingerprints and the three-way merge. Each synced document remembers the per-record hashes of the
   version both sides last agreed on, its base; on a conflict every record is
   judged on its own: changed on one side only, that side wins; changed on
   both, the newer side does (remoteWins), and the conflict is counted. A
   machine name the app kept is no edit (machines.ts): read as absent, and
   kept on whichever copy wins where it names none.
   Undo's merge of a session in progress is the same idea per exercise.
   Merging whole documents (mergeChunk) is sync.ts's. */

import { hashStr } from './util';
import { unitOnGrid } from './units';
import { arr, rec } from './records';
import { keptOn, keptOnSession, unkept } from './machines';
import { equipAsSaved } from './library';
import type { Rec } from './records';
import type { Session } from './types';
import type { DraftLike } from './session';

/** The conflicts a merge counted, and how many of them each record's own edit times decided (byTime). */
/** A copy that lost a clash to this side's: its key (recordKey), the fingerprint of the copy both sides had agreed on, and the copy itself. */
export type Lost = { key: string; base: string | undefined; copy: unknown };
/** What a merge counts: its clashes, those decided by the records' own times, and, when the caller keeps them (`lost`), the other side's copies that lost one. */
type Stat = { conflicts: number; byTime?: number; lost?: Lost[] };

/* Which copy a clash keeps (a record changed on both sides since the copy both agreed): the later edit. Where the sync
   knows when each side last edited that record (sync.ts recAt, sent beside a document as `rt`), the record's own times
   decide; else the document's (`doc`), as for a copy from a build that kept no record times. A boolean is a document's
   rule alone (Undo, the workout open on two phones). */
/** The rule a merge keeps a clashed record by: the other side's copy when true (above). */
export type Wins = boolean | { doc: boolean; rec: (key: string) => boolean | null };
/** Whether the other side's copy of the record keyed `key` wins its clash, counted in `stat` when its times decided. */
function winsFor(w: Wins, key: string, stat: Stat): boolean {
  if (typeof w === 'boolean') return w;
  const r = w.rec(key);
  if (r === null) return w.doc;
  stat.byTime = (stat.byTime || 0) + 1;
  return r;
}
/** The document's own rule of a clash rule (Wins), for a merge that has no record times. */
export const docWins = (w: Wins): boolean => (typeof w === 'boolean' ? w : w.doc);

/** A plain object read by its own keys. */
type Fields = Record<string, unknown>;

/* A unit field and the number it is the unit of: a set's load (`w`, `u`), a lift's step, heaviest load, bar and goal,
   and the bar in settings (normalize.ts unitField). */
/** Each unit field, by the field of the number it is the unit of (the goal's is its load, `w`). */
const UNIT_FIELD: Readonly<Record<string, string>> = {
  u: 'w',
  incU: 'inc',
  maxLoadU: 'maxLoad',
  barU: 'barKg',
  goalU: 'goal'
};
/* A unit that is the one its number lies on the 0.05 steps of says nothing the number does not: it is the unit a save
   from before units were stored is given once, at load, from its number (unitField). Read as absent wherever two copies
   are compared, as a key's order is, so a copy given its units is the same record as the copy an older build holds,
   which has none: a delete, a correction or a machine picked there stands against it, and no clash is said. A unit its
   number does not lie on (a number on neither unit's steps) is the lifter's alone, and is compared. */
/** Whether field `k` of record `f` is a unit its number lies on the steps of (above). */
function givenUnit(f: Readonly<Fields>, k: string): boolean {
  const of = UNIT_FIELD[k];
  if (!of) return false;
  const v = f[k],
    n0 = f[of];
  const n = of === 'goal' ? rec(n0)?.w : n0;
  return (v === 'kg' || v === 'lb') && typeof n === 'number' && unitOnGrid(n) === v;
}

/* A lift the library refiled (LIB_EQUIP_BEFORE) reads on its new equipment in memory (normalize.ts), and is saved, sent
   and compared with the old one, as every build before the refile wrote it, unless the lifter picked the old one since
   (equipOwn): so the refile rewrites no log, and the copy a build before it holds is the same record, never a second
   edit that clashes with the lifter's own. */
/** The equipment field `k` of record `f` is saved and compared as: the library's old one where `f` holds the new one
    unpicked (above), else undefined (as it is). */
function savedEquip(f: Readonly<Fields>, k: string): string | undefined {
  if (k !== 'equip' || typeof f.id !== 'string' || typeof f.equip !== 'string') return undefined;
  const was = equipAsSaved({
    id: f.id,
    equip: f.equip,
    custom: f.custom === true,
    equipOwn: f.equipOwn === true ? true : undefined
  });
  return was !== f.equip ? was : undefined;
}

/* The log as it is saved and sent: as it is, with each unit its number gives left out (givenUnit). Read back, every build
   that stores units gives a set its unit again from its number (normalize.ts unitField), so nothing is lost; a document that
   only gained the units its numbers give is the same document, written and sent as before, so a phone still on an
   older build never takes such a copy for an edit that beats its own delete or correction; and a unit its number does
   not give is kept and sent. */
/** A log, or any part of it, as JSON for the phone's storage and the account: each unit its number gives left out, a refiled lift's equipment as before (savedEquip). */
export function storedJson(x: unknown): string {
  return JSON.stringify(x, function (this: unknown, k: string, v: unknown): unknown {
    const f = rec(this);
    if (!f) return v;
    return givenUnit(f, k) ? undefined : (savedEquip(f, k) ?? v);
  });
}

/* Record fingerprint that ignores key order. A record saved straight from the
   logger and the same record after normalize() list their fields in a
   different order; a plain JSON hash called that an edit, and a deleted
   session could come back. A field holding undefined is left out, as JSON
   leaves it out, and so is a unit its number gives (givenUnit). By here x is an object and not an array; the casts let
   TypeScript read it by key. */
export function canon(x: unknown): string {
  if (x === undefined) return 'null';
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  const list = arr(x);
  if (list) return '[' + list.map(canon).join(',') + ']';
  // x is an object here, so rec gives its fields (the empty fallback is never used).
  const f = rec(x) || {};
  return (
    '{' +
    Object.keys(f)
      .filter(k => f[k] !== undefined && !givenUnit(f, k))
      .sort()
      .map(k => JSON.stringify(k) + ':' + canon(savedEquip(f, k) ?? f[k]))
      .join(',') +
    '}'
  );
}

/** A record's fingerprint, as a merge compares it: the machine names the app kept read as absent (machines.ts). */
export const Hx = (x: unknown): string => hashStr(canon(unkept(x)));

/** Whether two copies of one record are the same record, the machine names the app kept read as absent (machines.ts). */
export const sameRecord = (a: unknown, b: unknown): boolean => canon(unkept(a)) === canon(unkept(b));

/* Two copies of one record that differ only in the machine names the app kept are one: the same copy on every device,
   the one first by its fingerprint, given the other's kept names where it names none (machines.ts). */
/** Two copies of a stored record, as a merge reads them, as one (above). */
function oneCopy(a: Rec, b: Rec): Rec {
  return canon(a) <= canon(b) ? keptOn(a, b) : keptOn(b, a);
}
/** Two copies of a session as one (above). */
export function oneSession(a: Session, b: Session): Session {
  return canon(a) <= canon(b) ? keptOnSession(a, b) : keptOnSession(b, a);
}

/** Merges two versions of a list of records with ids against their base (id
    to fingerprint), record by record as described at the top. With no base
    (as on a first sync) nothing reads as deleted. Local records keep their
    order, then remote ones local lacks; a record with no string id is left
    out. The lists come straight from the documents (sync.ts), so each
    is read as it is: a list field that is no list reads as empty. */
export function merge3List(
  base: Record<string, string> | null | undefined,
  l: unknown,
  r: unknown,
  remoteWins: Wins,
  stat: Stat,
  list = ''
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
    // Every id came from one side or the other, so at least one of a and b is there.
    if (a && b && ah === rh) {
      out.push(oneCopy(a, b));
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
    // The copy kept takes the names the app kept on the other where it names none (machines.ts).
    if (ah === bh) {
      out.push(keptOn(b, a));
      continue;
    }
    if (rh === bh) {
      out.push(keptOn(a, b));
      continue;
    }
    stat.conflicts++;
    const theirs = winsFor(remoteWins, recordKey(list, id), stat);
    if (!theirs && known) stat.lost?.push({ key: recordKey(list, id), base: bh, copy: b });
    out.push(theirs ? keptOn(b, a) : keptOn(a, b));
  }
  return out;
}

/** Merges two versions of one value against its base fingerprint: the side
    that changed wins, and when both did, remoteWins decides and the conflict
    is counted. */
export function merge3Val<V>(bh: string | undefined, a: V, b: V, remoteWins: Wins, stat: Stat, key = ''): V {
  const ah = Hx(a),
    rh = Hx(b);
  if (ah === rh || rh === bh) return a;
  if (ah === bh) return b;
  stat.conflicts++;
  const theirs = winsFor(remoteWins, key, stat);
  if (!theirs && key) stat.lost?.push({ key, base: bh, copy: b });
  return theirs ? b : a;
}

/** A record's key in its document, as its edit time is kept by (sync.ts recordKeys): its list and its id, or a value's name. */
export const recordKey = (list: string, id: string): string => `${list}/${id}`;

/* ---------- one workout open on two phones ---------- */

/* Two phones' copies of one workout in progress, merged against the copy
   both last agreed with the account, exercise by exercise and set by set:
   a set changed on one side alone takes that side; changed on both, the
   later edit (remoteWins), counted as a conflict; a row removed on one side
   alone goes, unless the other side changed it, since keeping data is the
   recoverable mistake; a row added on one side is kept, after the row it
   follows on that side, so a warm-up added at the top stays at the top.
   Rows are matched by their own ids (`rid`, given since r56.1). A row without one (a build before r56.1 made it) is matched by its
   place among the rows without one in a workout in progress, whose rows all
   stay in place, ticked or not, as long as rows are added at the end (an
   older build's warm-up added at the top moves every place); in a saved session (a join, below) the rows left unticked are gone,
   so a place means nothing there, and such a row is matched by what it
   holds instead. Exercises are keyed by their own ids (`bid`), or, on an
   exercise an older build made without one, by exercise and occurrence, as
   Undo keys them, so the same lift twice is two exercises however either
   phone changes the other; the order of exercises follows the side
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
   (matched to nothing, every set both had would be saved twice). */
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
     it added at the top included, and
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
    /* With no copy both agreed on, a field one copy lacks is no clash: the copy that has it keeps it, as keeping data is
       the recoverable mistake (Finish's `ps` on a saved session, absent from the copy joined to it, is not an item
       edited on two devices). */
    if (!base && (l[f] === undefined) !== (r[f] === undefined)) {
      out[f] = l[f] === undefined ? r[f] : l[f];
      continue;
    }
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
  /* The workout's own fields (its date, its notes, its day) field by field against the copy agreed, as a session's
     are (mergeSession): a note typed on one phone while the other ticks sets is kept. */
  mergeFields(rec(out) || {}, rec(base), rec(local) || {}, rec(remote) || {}, ['ex', 'id'], remoteWins, stat);
  // The next sets adjusted from a set stay on the rows under it when rows were added above it: its place follows its row.
  for (const b of out.ex) {
    const a = b.adj;
    const i = a && typeof a.rid === 'string' ? b.sets.findIndex(x => x.rid === a.rid) : -1;
    if (a && i >= 0 && i !== a.at) b.adj = { ...a, at: i };
  }
  const O = rec(out) || {},
    Bf = rec(base) || {},
    Lf = rec(local) || {},
    Rf = rec(remote) || {};
  mergeFields(O, Bf, Lf, Rf, ['ex', 'id', 'cardio', 'begunAt'], remoteWins, stat);
  /* The workout began when either copy first began it: the earlier of the two. Each copy starts its clock
     at its own first set, so two starts are never a clash. */
  let first: number | null = null;
  for (const t of [local.begunAt, remote.begunAt])
    if (typeof t === 'number' && t > 0 && (first == null || t < first)) first = t;
  if (first != null) O.begunAt = first;
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
    ['ex', 'id', 't'],
    remoteWins,
    stat
  );
  /* The start is the saved session's, the one its minutes were timed from at Finish: the copy joined to it began on
     its own clock, which is no edit, and taken alone it would leave a start that did not match the minutes
     (and two starts would be said as an item edited on two devices). */
  const t = remote.t ?? local.t;
  if (t !== undefined) out.t = t;
  else delete out.t;
  return out;
}

/** A session in progress as Undo merges it: its id, its exercises and the fields merged whole. */
type UndoDraft = { id: string; ex: { exId: string }[] } & Record<string, unknown>;
/* A session in progress read for Undo (as the typed Undo reads the
   documents): an object with an id and a list of exercises, each an object
   with its exercise's id, else null. Each is read as a shallow copy; the
   merge picks among them by their contents, and what it returns is
   normalized when the log is put back together. */
function undoDraftOf(v: unknown): UndoDraft | null {
  const d = rec(v);
  const ex = d && arr(d['ex']);
  if (!d || typeof d['id'] !== 'string' || !ex) return null;
  const blocks: { exId: string }[] = [];
  for (const b0 of ex) {
    const b = rec(b0);
    if (!b || typeof b['exId'] !== 'string') return null;
    blocks.push({ ...b, exId: b['exId'] });
  }
  return { ...d, id: d['id'], ex: blocks };
}

/* Undo inside a session: the session in progress merged exercise by
   exercise (keyed by each card's own id, `bid`, as the merge between two
   phones keys them; a card of a build before card ids by its exercise and
   occurrence), base = right after the action, local = now, other = before it. Exercises changed only by the
   action go back; ones changed since keep the newer version. Merged as a
   whole record, any set logged after the action would block the undo. */
export function mergeDraft(base0: unknown, cur0: unknown, pre0: unknown, saved: (id: string) => boolean): unknown {
  const base = undoDraftOf(base0),
    cur = undoDraftOf(cur0),
    pre = undoDraftOf(pre0);
  /* A workout the step itself took away or put another in its place (Erase everything; a backup restored, with or
     without a workout of its own), the workout unchanged since the step and not saved since: it comes back, as
     everything else the step took does, also after a backup with a workout of its own, whose workout then goes. Saved
     since, it is a session in the log (Finish gives the session its id) and stays one: reopened, a second Finish
     would write it over an edit made to it. One changed since the step stays as it is. */
  if (pre && (!base || base.id !== pre.id) && canon(cur0) === canon(base0) && !saved(pre.id)) return pre0;
  if (!pre || !cur || !base || pre.id !== cur.id || base.id !== cur.id) return cur0 === undefined ? null : cur0;
  type B = UndoDraft['ex'][number];
  // The one keying of a workout's cards (blockKeys), the two phones' merge's.
  const keyed = (list: readonly B[] | null | undefined): [string, B][] => blockKeys(list || []);
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
  // kept (dragging exercises makes that common). An action that changed
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
  // The workout's pictures go back the same way, absent where they were, so one taken off comes back.
  if (canon(cur.pics) === canon(base.pics)) {
    if (pre.pics === undefined) delete res.pics;
    else res.pics = pre.pics;
  }
  // The same session with each exercise and field taken from one of its versions.
  return res;
}
