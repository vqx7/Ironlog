/* A machine, cable or Smith lift's exercise in a session names the machine it was done on by a key (`mc`, read by
   machineKeys). The lifter gives the name: Finish names it, a pick names it, an import names it. The app keeps one only
   where a change would move a session it does not touch to another machine (normalize.ts keepMachines), and marks it so
   (`kp`). A name the app kept is no one's edit: every comparison of two copies of one record reads it as absent
   (unkept), and the copy kept takes the other's kept names where it names none (keptOn). So a kept name never beats a
   correction or a pick made elsewhere, and is never lost to one. A saved session opened to edit carries each name as
   it was (nameAsIs), and is saved so unless a machine is picked in the edit (savedName). This module is the only code
   that makes, changes or takes off a name (tests/hygiene.js), so that holds wherever a name is written. */

import { arr, fixId, rec } from './records';
import type { Rec } from './records';
import type { Session } from './types';

/** What an exercise holds of its machine's name: given by the lifter, or kept by the app (`kp`). */
type Named = { mc?: string | undefined; kp?: true | undefined };

/** A name the app kept, to spread into an exercise made with it. */
export function keptName(key: string): { mc: string; kp: true } {
  return { mc: key, kp: true };
}
/** Exercise `b`'s name as it is, given or kept, to spread into a copy of it (a saved session opened to edit): nothing for none. */
export function nameAsIs(b: Named): Named {
  return b.mc ? (b.kp ? keptName(b.mc) : { mc: b.mc }) : {};
}
/** The name to save on a lift's exercise, `key` (none for null): kept where one of the lift's blocks `from` holds it as a
    name the app kept (an edit in which no machine was picked), else the lifter's. */
export function savedName(key: string | null, from: readonly Named[]): Named {
  if (!key) return {};
  return from.some(b => b.mc === key && b.kp) ? keptName(key) : { mc: key };
}
/** Names exercise `b` with the machine the lifter picked: their name, no longer one the app kept. */
export function pickName(b: Named, key: string): void {
  b.mc = key;
  delete b.kp;
}
/** Takes exercise `b`'s name off. */
export function unname(b: Named): void {
  delete b.mc;
  delete b.kp;
}
/** Gives exercise `to` the name `from` has, of the same kind, when `from` has one. */
export function copyName(to: Named, from: Named): void {
  if (!from.mc) return;
  to.mc = from.mc;
  if (from.kp) to.kp = true;
  else delete to.kp;
}
/** A stored exercise's name as every build reads it: an id, marked kept only beside one. */
export function cleanName(b: Rec): Named {
  return typeof b.mc === 'string' && b.mc ? { mc: fixId(b.mc), ...(b.kp === true ? { kp: true } : {}) } : {};
}

/** The exercises of record `x` (a session, or one in Recently deleted, under `data`), and where they sit; null for any other record. */
function blocksOf(x: unknown): { R: Rec; inData: boolean; ex: unknown[] } | null {
  const R = rec(x);
  if (!R) return null;
  const ex = arr(R.ex);
  if (ex) return { R, inData: false, ex };
  const D = rec(R.data);
  const dx = D && arr(D.ex);
  return dx ? { R, inData: true, ex: dx } : null;
}
/** Record `R` with its exercises replaced, where blocksOf found them. */
function withBlocks(R: Rec, inData: boolean, ex: unknown[]): Rec {
  return inData ? { ...R, data: { ...rec(R.data), ex } } : { ...R, ex };
}
/** The unit a name is kept for: an exercise's lift and kind (light or not). */
const liftOf = (exId: unknown, light: unknown): string | null =>
  typeof exId === 'string' ? `${exId}|${light ? 1 : 0}` : null;

/** Record `x` as a comparison of two copies reads it: the names the app kept taken off (above); `x` itself when it has none. */
export function unkept(x: unknown): unknown {
  const at = blocksOf(x);
  if (!at || !at.ex.some(b => rec(b)?.kp === true)) return x;
  return withBlocks(
    at.R,
    at.inData,
    at.ex.map(b => {
      const B = rec(b);
      if (!B || B.kp !== true) return b;
      const o: Rec = {};
      for (const k of Object.keys(B)) if (k !== 'mc' && k !== 'kp') o[k] = B[k];
      return o;
    })
  );
}

/** The names the app kept on record `q`'s exercises, by lift and kind; the first where two differ. */
function keptOf(q: unknown): Map<string, string> {
  const kept = new Map<string, string>();
  for (const b of blocksOf(q)?.ex || []) {
    const B = rec(b);
    const k = B && B.kp === true && typeof B.mc === 'string' ? liftOf(B.exId, B.light) : null;
    if (B && k && typeof B.mc === 'string' && !kept.has(k)) kept.set(k, B.mc);
  }
  return kept;
}

/** Copy `p` of a stored record as a merge reads it, with the names the app kept on copy `q` put on its exercises of the same lift and kind that name none (above); `p` itself when none are put. */
export function keptOn(p: Rec, q: unknown): Rec {
  const P = blocksOf(p),
    kept = keptOf(q);
  if (!P || !kept.size) return p;
  let put = false;
  const ex = P.ex.map(b => {
    const B = rec(b);
    const k = B && !B.mc ? liftOf(B.exId, B.light) : null;
    const key = k ? kept.get(k) : undefined;
    if (!B || key === undefined) return b;
    put = true;
    return { ...B, ...keptName(key) };
  });
  return put ? withBlocks(P.R, P.inData, ex) : p;
}

/** Session `p` with the names the app kept on copy `q` put where it names none (above); `p` itself when none are. */
export function keptOnSession(p: Session, q: Session): Session {
  const kept = keptOf(q);
  let put = false;
  const ex = p.ex.map(b => {
    const k = b.mc ? null : liftOf(b.exId, b.light);
    const key = k ? kept.get(k) : undefined;
    if (key === undefined) return b;
    put = true;
    return { ...b, ...keptName(key) };
  });
  return put ? { ...p, ex } : p;
}
