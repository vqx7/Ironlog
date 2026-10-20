/* What a stored record may hold: the schema version, the limits on body
   entries and kept unknown fields, the id checks, the cleaners for a
   calibration set, a check-in and a target, the order of sessions, and how
   long deleted things are kept (phase 3a, r51; moved unchanged from the
   legacy script). normalize(),
   which applies them to a whole save, moves with storage in phase 4. */

import { hashStr, numOr, isNum, isDate } from './util';
import { MEAS } from './library';

/* Bumped to 2 when per-side exercises and deleted-built-in tracking arrived.
   normalize() migrates v1 saves in place; nothing the user edited is touched. */
/* v3: routines became numbered cycles of 1 to 14 days. Older routines keep the
   same days in the same order and only change label, so no session loses its
   link to the day it was logged against. Fixed weekdays remain as an option. */
/* v4: cardio entries, the Recently deleted list, per-exercise load step and
   plate helper, and the lighter-session flag. Every v4 field has a default in
   normalize(), so v3 data loads unchanged. */
/* v5: two new muscles (serratus, rotator cuff). Built-in exercises that train
   them secondarily get the new muscle added; nothing else a user set is
   touched, because those keys could not exist before v5. */
export const STATE_VERSION = 5;

/* Deleted sessions, cardio entries and routines are kept for 30 days so a
   mistaken delete can be restored after the tab is closed. Their ids also act
   as tombstones: a second device that still holds a deleted session cannot
   merge it back in while the entry is here. Capped so the core cloud document
   never approaches its size limit. */
export const TRASH_DAYS = 30,
  TRASH_MAX = 20,
  TRASH_BYTES = 60000;

/* Upper limits for body entries. Past these a number is a typo, and an
   unbounded one showed as "Infinity lb" and broke waist-to-height. */
export const BW_MAX_KG = 400,
  BW_MIN_KG = 20,
  MEAS_MAX_CM = 300;

/* ---------- ids ---------- */

/* Stable id for a record that arrived without one. It used to be random, so two
   devices repairing the same record made two different ids and a merge kept
   both. The position is included so identical records stay distinct. */
export function did(tag: string, obj: unknown, i: number): string {
  let j = '';
  try {
    j = JSON.stringify(obj);
  } catch (e) {
    // JSON.stringify throws on a cycle, a BigInt, or nesting deeper than it can
    // write (JSON.parse reads deeper nesting than it writes, so a crafted save
    // can reach this); such a record is told apart by its position alone.
    j = String(i);
  }
  return tag + hashStr(j + '#' + i);
}

/* Ids go straight into HTML attributes and CSS selectors, so an imported
   backup or a cloud document must not be able to smuggle markup in through
   one. Every id the app makes itself fits this pattern. Anything else is
   replaced by a hash of itself, which is the same on every device, so a
   record and the references to it (an exercise and its logged sets) still
   match after the repair. */
// Names Object already has ("constructor", "__proto__") are out too: many
// lookups key plain objects by id, and those would find the built-in instead.
// Not a type guard: a false answer would tell TypeScript the value is no
// string, and a string that fails the pattern is still one.
export const okId = (v: unknown): boolean =>
  typeof v === 'string' && /^[\w.:-]{1,100}$/.test(v) && !(v in Object.prototype);

/** An id as normalize() keeps it: the value itself when okId accepts it,
    else "x" and a hash of it (see above). The cast stands for okId's check
    that v is a string, which TypeScript cannot follow. */
export function fixId(v: unknown): string {
  return okId(v) ? (v as string) : 'x' + hashStr(String(v));
}

/** A key safe to put in markup: a string with none of the characters HTML treats as syntax. */
export const safeKey = (k: unknown): boolean => typeof k === 'string' && !/["'<>&`]/.test(k);

/* ---------- fields a newer build added ---------- */

/** The most characters (names included) and fields of unknown data kept per record (keepExtra, r43). */
export const EXTRA_MAX = 2000,
  EXTRA_KEYS = 20;

/** Whether an unknown field's name may be kept: a letter, then up to 39
    letters, digits, or underscores, and no name Object already has. */
export const okExtraKey = (k: string): boolean => /^[A-Za-z][\w]{0,39}$/.test(k) && !(k in Object.prototype);

/** The fields of a plan item, a cardio entry, a tape entry and a saved session's exercise that are written only when valid. */
export const KNOWN_ITEM: ReadonlySet<string> = new Set(['jump']),
  KNOWN_CARDIO: ReadonlySet<string> = new Set(['dist']),
  KNOWN_MEAS: ReadonlySet<string> = new Set(MEAS.map(x => x[0])),
  // A saved session's exercise: the injury it was held for (r54).
  KNOWN_SEX: ReadonlySet<string> = new Set(['inj']);

/* ---------- cleaners ---------- */

/** What a cleaner is given: anything, from a save, a backup or another device. */
type Raw = Partial<Record<string, unknown>> | null | undefined;

/* A calibration set: the rep you would normally have stopped at, and the reps
   you thought were left there. The set itself is logged to failure. */
export function cleanCal(c: Raw): { at: number; pred: number } | null {
  if (!c || typeof c !== 'object') return null;
  const at = numOr(c.at, NaN),
    pred = numOr(c.pred, NaN);
  if (!isNum(at) || !isNum(pred) || at < 1 || pred < 0) return null;
  return { at: Math.min(Math.round(at), 1000), pred: Math.min(Math.round(pred * 2) / 2, 10) };
}

/* Pre-session check-in: 1 poor, 2 OK, 3 good, per question. */
export function cleanChk(c: Raw): Record<string, number> | null {
  if (!c || typeof c !== 'object') return null;
  const o: Record<string, number> = {};
  for (const k of ['sleep', 'energy', 'joints']) {
    const v = Math.round(numOr(c[k], NaN));
    if (v >= 1 && v <= 3) o[k] = v;
  }
  return Object.keys(o).length ? o : null;
}

/* The load or reps target set when the session started. Only its numbers are
   read, so only numbers survive. */
export function cleanTgt(t: Raw): Record<string, unknown> | null {
  if (!t || typeof t !== 'object' || (t.kind !== 'load' && t.kind !== 'reps')) return null;
  const o: Record<string, unknown> = { kind: t.kind };
  for (const k of ['w', 'repMin', 'total', 'n', 'prevBest']) {
    if (!(k in t)) continue;
    const v = t[k];
    o[k] = v == null ? null : isNum(numOr(v, NaN)) ? numOr(v, 0) : null;
  }
  // Array.isArray turns an unknown into any[]; the cast keeps each entry unknown, for the checks below.
  if (Array.isArray(t.rs))
    o.rs = (t.rs as unknown[]).slice(0, 30).map((v: unknown) => {
      const n = numOr(v, NaN);
      return isNum(n) && n >= 0 ? Math.min(n, 1000) : 0;
    });
  return o;
}

/* ---------- sessions ---------- */

/* Whether a record can be a logged session at all: an object with a date
   and a list of exercises. normalize() drops anything else before its
   cleaner checks every field, and uses both on the copies kept in Recently
   deleted, so a copy there can be compared with a live one. */
export const okSess = (ss: Raw): boolean => !!ss && typeof ss === 'object' && isDate(ss.date) && Array.isArray(ss.ex);

/* One order for sessions everywhere (r34, two-a-days): by date, then by the
   time each started, then by id. Ordered by date alone, a morning and an
   evening session on one day came out in whatever order the list held, and
   after a sync by their random ids, so "last time" could be the morning. */
export const sessCmp = (
  a: { date: string; t?: number | null | undefined; id: string },
  b: { date: string; t?: number | null | undefined; id: string }
): number =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : (a.t || 0) - (b.t || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
