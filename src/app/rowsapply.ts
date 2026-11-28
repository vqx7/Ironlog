/* Rows back into the log: the records an account's rows hold, put into a log as the app keeps one. Every list takes
   each record by its id in place of the one it replaces, Recently deleted takes each copy put aside with its day,
   and the lists the lifter orders (routines, lifts and injuries) take the order the account keeps for them, so every
   phone shows one log from the same rows. The result goes through normalize, as every log the app reads does. */

import { STATE_VERSION, arr, rec, trashKind } from './records';
import { keptOn } from './machines';
import type { Rec, Trashed } from './records';
import { CORE_FIELDS } from './chunks';
import { normalize } from './normalize';
import type { State } from './store';
import { KIND } from './rowsnotes';

/** A record as a row gives it to the log: where the row says it is, its copy, and, in Recently deleted, its day and whether it is a copy put aside. */
export interface Taken {
  kind: string;
  id: string;
  place: 'log' | 'trash' | 'good';
  data: unknown;
  day: string;
  clash: boolean;
}
/** The lists of the log the lifter orders, whose order the row `core/order` keeps. */
export const ORDERED: readonly string[] = ['routines', 'exercises', 'injuries'];
/** The id of the row that keeps the order of the lists the lifter orders. */
export const ORDER_ID = 'order';
/** Each list's kind of row, by the list's name in the log. */
const LIST_OF: Readonly<Record<string, string>> = Object.fromEntries(Object.entries(KIND).map(([l, k]) => [k, l]));

/** The order of the lists the lifter orders in log `S`, as the row `core/order` keeps it: each list's ids. */
export function orderOf(S: State): Record<string, string[]> {
  const R: Rec = S;
  const out: Record<string, string[]> = {};
  for (const l of ORDERED)
    out[l] = (arr(R[l]) || []).flatMap(x => {
      const id = rec(x)?.['id'];
      return typeof id === 'string' ? [id] : [];
    });
  return out;
}
/** List `l` of a log in the order `ids` gives; a record it does not name after those it does, by id. */
function inOrder(list: readonly Rec[], ids: readonly string[] | undefined): Rec[] {
  if (!ids) return [...list];
  const at = new Map(ids.map((id, i) => [id, i]));
  const key = (x: Rec): string => (typeof x['id'] === 'string' ? x['id'] : '');
  return [...list].sort((a, b) => {
    const i = at.get(key(a)),
      j = at.get(key(b));
    if (i !== undefined && j !== undefined) return i - j;
    if (i !== undefined) return -1;
    if (j !== undefined) return 1;
    return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  });
}
/** The order a row `core/order` holds, read as a record of lists of ids; null when it holds none that can be read. */
export function orderIn(v: unknown): Record<string, string[]> | null {
  const R = rec(v);
  if (!R) return null;
  const out: Record<string, string[]> = {};
  for (const l of ORDERED) {
    const ids = arr(R[l]);
    if (ids) out[l] = ids.flatMap(x => (typeof x === 'string' ? [x] : []));
  }
  return out;
}
/** Log `S0` (a log, or `bare()` for a phone that holds none) with the records `takes` put in it, each in the place
    its row says, and its ordered lists in `order`'s order where one is given. */
export function withTaken(S0: Rec, takes: readonly Taken[], order: Record<string, string[]> | null): State {
  const S: Rec = { ...S0 };
  const lists: Record<string, Rec[]> = {};
  const listOf = (l: string): Rec[] =>
    (lists[l] ??= (arr(S[l]) || []).flatMap(x => {
      const R = rec(x);
      return R ? [R] : [];
    }));
  let trash: Trashed[] = (arr(S0['trash']) || []).flatMap(t0 => {
    const t = rec(t0);
    const kind = t ? trashKind(t['kind']) : null;
    const data = t ? rec(t['data']) : null;
    return t && kind && data && typeof t['id'] === 'string' && typeof t['date'] === 'string'
      ? [{ id: t['id'], kind, date: t['date'], data, ...(t['clash'] === true ? { clash: true as const } : {}) }]
      : [];
  });
  const settings: Rec = { ...(rec(S0['settings']) || {}) };
  for (const x of takes) {
    if (x.kind === 'setting') {
      if (x.place === 'log') settings[x.id] = x.data;
      else delete settings[x.id];
      continue;
    }
    if (x.kind === 'core') {
      if (CORE_FIELDS.includes(x.id) && x.id !== 'version') S[x.id] = x.data;
      continue;
    }
    const l = LIST_OF[x.kind];
    if (!l) continue;
    const L = listOf(l);
    const i = L.findIndex(r => r['id'] === x.id);
    const data = rec(x.data);
    trash = trash.filter(t => !(t.kind === x.kind && t.id === x.id));
    if (x.place === 'log' && data) {
      // The machine names the app kept on the log's copy stay where the copy taken names none: they are no one's edit.
      if (i >= 0) L[i] = keptOn(data, L[i]);
      else L.push(data);
      continue;
    }
    if (i >= 0) L.splice(i, 1);
    const kind = trashKind(x.kind);
    if (x.place === 'trash' && kind && data)
      trash.push({ id: x.id, kind, date: x.day, data, ...(x.clash ? { clash: true as const } : {}) });
  }
  for (const l in lists) S[l] = order ? inOrder(lists[l] || [], order[l]) : lists[l];
  if (order) for (const l of ORDERED) if (!(l in lists)) S[l] = inOrder(listOf(l), order[l]);
  S['trash'] = trash;
  S['settings'] = settings;
  return normalize(S);
}
/** A log of no records and no defaults, which an account's rows are put into to make the account's log: normalize
    fills in only what the rows leave out (a log of no routine gets the starter one, as a log of no documents does). */
export const bare = (): Rec => ({
  version: STATE_VERSION,
  sessions: [],
  cardio: [],
  bodyweights: [],
  measurements: [],
  routines: [],
  exercises: [],
  injuries: [],
  trash: [],
  settings: {},
  draft: null
});
