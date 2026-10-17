/* How the log splits into sync documents: core (settings, exercises,
   routines and the rest), the session in progress, a session document per
   half month (s-YYYY-MM-1 or -2) and a body document per year (b-YYYY)
   (phase 3a, r51; moved unchanged from the legacy script, tests/moved.js
   holds them to r50's code). Sending, pulling and merging them moves with
   sync in phase 4. */

import { sessCmp } from './records';

/** A dated record a document holds: a session, a cardio entry, a weigh-in or a tape entry. */
type Dated = { date: string; t?: number | null; id: string };

/** The parts of a save the documents are made from. */
type Save = {
  version: unknown;
  settings: unknown;
  exercises: unknown;
  routines: unknown;
  activeRoutineId: unknown;
  deloadWeek?: unknown;
  injuries?: unknown[];
  trash?: unknown[];
  draft?: unknown;
  sessions: Dated[];
  cardio?: Dated[];
  bodyweights?: Dated[];
  measurements?: Dated[];
};

/** The session document a date belongs to: s-YYYY-MM-1 for days 1 to 15, -2 after. */
export const chunkOf = (date: string): string => `s-${date.slice(0, 7)}-${+date.slice(8, 10) <= 15 ? 1 : 2}`;

/** Records in a document are kept in the one session order. */
export const bySess = sessCmp;

/* Body data (item 19): bodyweights and tape measurements sync in one document
   per year, b-YYYY, instead of inside core, where years of daily weigh-ins
   would have passed the size cap and stopped core (routines, settings) from
   syncing. Builds before r22 read only core, draft and s- documents and never
   touch a b- document, so they cannot delete one; they still write weigh-ins
   into core, and those are picked up (legacyBody) and moved on the next sync. */
export const bodyChunkOf = (date: string | null | undefined): string => 'b-' + String(date || '').slice(0, 4);

/** One sync document: core's fields, the draft, or the lists of dated
    records a session or body document holds. */
type Doc = {
  sessions?: Dated[];
  cardio?: Dated[];
  bodyweights?: Dated[];
  measurements?: Dated[];
  [field: string]: unknown;
};

/** Every document of a save, by id, with the dated records in each kept in
    the one session order (bySess). A session or body document exists only
    when it has something in it. */
export function chunksOf(st: Save): Record<string, Doc> {
  /* Core still carries the two keys, always empty, in the place r21 wrote
     them. An older build then reads a core shaped like its own and writes it
     back unchanged, instead of both builds rewriting core on every sync. */
  const out: Record<string, Doc> = {
    core: {
      version: st.version,
      settings: st.settings,
      exercises: st.exercises,
      routines: st.routines,
      activeRoutineId: st.activeRoutineId,
      bodyweights: [],
      measurements: [],
      deloadWeek: st.deloadWeek || null,
      injuries: st.injuries || [],
      trash: st.trash || []
    },
    draft: { draft: st.draft || null }
  };
  for (const k of ['bodyweights', 'measurements'] as const)
    for (const x of st[k] || []) {
      const c = out[bodyChunkOf(x.date)] || (out[bodyChunkOf(x.date)] = {});
      (c[k] || (c[k] = [])).push(x);
    }
  // A body document holds only the two lists filled just above, as the cast says.
  for (const id in out) if (id.startsWith('b-')) for (const k in out[id]) (out[id][k] as Dated[]).sort(bySess);
  // Every session document is made with its sessions list, here or below, which
  // the ! after `.sessions` says to TypeScript.
  for (const x of st.sessions) {
    const k = chunkOf(x.date);
    (out[k] || (out[k] = { sessions: [] })).sessions!.push(x);
  }
  // Cardio shares the half-month documents. The key is only written when a
  // chunk has cardio, so documents without any are byte-identical to before.
  for (const x of st.cardio || []) {
    const k = chunkOf(x.date);
    const c = out[k] || (out[k] = { sessions: [] });
    (c.cardio || (c.cardio = [])).push(x);
  }
  for (const k in out) {
    if (out[k].sessions) out[k].sessions.sort(bySess);
    if (out[k].cardio) out[k].cardio.sort(bySess);
  }
  return out;
}

/** A document with nothing in it: core has no empty form, so null. */
export const emptyChunk = (id: string): object | null =>
  id === 'core' ? null : id === 'draft' ? { draft: null } : id.startsWith('b-') ? {} : { sessions: [] };

/** A document's merge base: the one it recorded, or for a body document never seen, the base core had before r22. */
export const baseFor = <B>(id: string, m: { b?: B } | null | undefined, legB: B | null): B | null =>
  m && m.b ? m.b : id.startsWith('b-') ? legB : null;

/* Weigh-ins and measurements that a build before r22 wrote into core. */
export function legacyBody(raw: { bodyweights?: unknown; measurements?: unknown } | null | undefined): {
  bodyweights: unknown[];
  measurements: unknown[];
} {
  return {
    bodyweights: raw && Array.isArray(raw.bodyweights) ? raw.bodyweights : [],
    measurements: raw && Array.isArray(raw.measurements) ? raw.measurements : []
  };
}

/** Two lists of records by id, the first list's record winning where both have one. A record with no id is left out. */
export function unionById<X extends { id?: unknown }>(
  a: readonly X[] | null | undefined,
  b: readonly X[] | null | undefined
): X[] {
  const m = new Map<unknown, X>();
  for (const x of b || []) if (x && x.id) m.set(x.id, x);
  for (const x of a || []) if (x && x.id) m.set(x.id, x);
  return [...m.values()];
}

/** Sessions in a save that are not demo data. */
export const realCount = (st: { sessions: { demo?: boolean }[] }): number => st.sessions.filter(x => !x.demo).length;

/** Core's list fields and single fields, merged record by record or value by value. */
export const CORE_ARR: readonly string[] = ['routines', 'exercises', 'injuries', 'trash'];
export const CORE_FIELDS: readonly string[] = ['version', 'activeRoutineId', 'deloadWeek'];

/** A document id the app writes: core, draft, a half-month session document or a year's body document. */
export const isChunkId = (id: string): boolean =>
  id === 'core' || id === 'draft' || /^s-\d{4}-\d{2}-[12]$/.test(id) || /^b-\d{4}$/.test(id);
