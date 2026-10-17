/* Record fingerprints and the three-way merge (phase 3a, r51; moved
   unchanged from the legacy script, tests/moved.js holds them to r50's
   code). Each synced document remembers the per-record hashes of the
   version both sides last agreed on, its base; on a conflict every record is
   judged on its own: changed on one side only, that side wins; changed on
   both, the newer side does (remoteWins), and the conflict is counted.
   Undo's merge of a session in progress is the same idea per exercise.
   Merging whole documents (mergeChunk) moves with sync in phase 4. */

import { hashStr } from './util';

/** The conflicts a merge counted. */
type Stat = { conflicts: number };

/* Record fingerprint that ignores key order. A record saved straight from the
   logger and the same record after normalize() list their fields in a
   different order; a plain JSON hash called that an edit, and a deleted
   session could come back. */
export function canon(x: unknown): string {
  if (x === undefined) return 'null';
  if (x === null || typeof x !== 'object') return JSON.stringify(x);
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  return (
    '{' +
    Object.keys(x)
      .filter(k => (x as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map(k => JSON.stringify(k) + ':' + canon((x as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

/** A record's fingerprint. */
export const Hx = (x: unknown): string => hashStr(canon(x));

/** Two versions of a list of records with ids against their base (id to fingerprint). */
export function merge3List<X extends { id?: unknown }>(
  base: Record<string, string> | null | undefined,
  l: readonly X[] | null | undefined,
  r: readonly X[] | null | undefined,
  remoteWins: boolean,
  stat: Stat
): X[] {
  const known = !!base;
  base = base || {};
  const L = new Map<string, X>(),
    Rm = new Map<string, X>();
  for (const x of l || []) if (x && typeof x.id === 'string') L.set(x.id, x);
  for (const x of r || []) if (x && typeof x.id === 'string') Rm.set(x.id, x);
  const out: X[] = [];
  for (const id of [...L.keys(), ...[...Rm.keys()].filter(k => !L.has(k))]) {
    const a = L.get(id),
      b = Rm.get(id),
      bh = known ? base[id] : '?';
    const ah = a ? Hx(a) : undefined,
      rh = b ? Hx(b) : undefined;
    if (ah === rh) {
      out.push(a as X);
      continue;
    }
    if (!a || !b) {
      // Present on one side only. Deleted by the other side if the present copy
      // is exactly the base; otherwise it is new or edited there, so keep it.
      const p = (a || b) as X,
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

/** Two versions of one value against its base fingerprint. */
export function merge3Val<V>(bh: string | undefined, a: V, b: V, remoteWins: boolean, stat: Stat): V {
  const ah = Hx(a),
    rh = Hx(b);
  if (ah === rh || rh === bh) return a;
  if (ah === bh) return b;
  stat.conflicts++;
  return remoteWins ? b : a;
}

/** A session in progress as Undo merges it: its id, its exercises and the fields merged whole. */
type DraftLike = { id: string; ex: { exId: string }[] } & Record<string, unknown>;

/* Undo inside a session: the session in progress merged exercise by
   exercise (keyed by exercise and its occurrence), base = right after the
   action, local = now, other = before it. Exercises changed only by the
   action go back; ones changed since keep the newer version. As a whole
   record, any set logged after the action used to block the undo. */
export function mergeDraft<D extends DraftLike>(
  base: D | null | undefined,
  cur: D | null | undefined,
  pre: D | null | undefined
): D | null {
  if (!pre || !cur || !base || pre.id !== cur.id || base.id !== cur.id) return cur === undefined ? null : cur;
  type B = D['ex'][number];
  const keyed = (list: readonly B[] | null | undefined): [string, B][] => {
    const seen: Record<string, number> = {};
    return (list || []).map(b => {
      const k = b.exId + '#' + (seen[b.exId] = (seen[b.exId] || 0) + 1);
      return [k, b] as [string, B];
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
  const res = { ...cur, ex: out } as D;
  for (const f of ['notes', 'dayName', 'deload', 'light', 'limited', 'cardio', 'chk']) {
    if (canon(cur[f]) === canon(base[f])) (res as Record<string, unknown>)[f] = pre[f];
  }
  return res;
}
