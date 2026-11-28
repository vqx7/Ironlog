/* The account's rows decide its log (the second phase). Once an account switches, its log is its rows: one per
   record, each with its version, which the account joins itself. A sync here looks at what this phone changed since
   its notes, worked out from the log's content against the rows as last agreed; reads what changed in the account
   since; takes back as its own the writes it sent whose answer was lost; decides each record changed on both sides
   by one rule; puts what it takes into the log in one change; and sends what is left. The documents are read and
   written no more, but by "Switch back".

   It runs in the sync's own queue, as the documents' sync did, so the scheduler, its statuses and retries, offline, a
   refused sign-in and a deleted account are handled by the code that handled them (sync.ts tells it how, at start).
   Its notes are in two keys: the rows as agreed (the rows' notes of the first phase), written when a row changes, and
   a small one written at each tick: the writes with no answer yet, the workout as agreed, and a workout kept here. */

import { arr, parseJson, rec } from './records';
import type { Rec } from './records';
import { CORE_FIELDS, chunksOf, isChunkId } from './chunks';
import { Hx, canon, mergeSession, mergeWorkout, recordKey, storedJson } from './merge';
import { hashStr, today } from './util';
import { draftSession } from './session';
import type { DraftLike } from './session';
import { normalize } from './normalize';
import { cloud, fx, setState, state } from './store';
import type { CloudRows, CloudStatus, RowIn, State } from './store';
import { device, log, prefDel, prefGet, prefSet } from './storage';
import { normChunk, timesIn } from './syncnotes';
import { photoHeld, photoNote, photoPending, photoSent, photoTake } from './photo';
import { storedElsewhere, writeTakenIn } from './save';
import { editsPending, laterThanSeen, seenAsIs, trackEdits } from './edits';
import { saveMeta } from './syncnotes';
import { conflictNote, draftNote, keepLost, lostNote } from './twoplaces';
import type { Kept } from './twoplaces';
import { firstJoin } from './firstjoin';
import {
  KIND,
  MIRRORED,
  NO_TABLE,
  ROWS_KEY,
  ansNum,
  ansText,
  ctxNow,
  found,
  blockedNow,
  heldAfter,
  keyOf,
  layoutTaken,
  notesDigest,
  notesFor,
  notesOut,
  placeOf,
  rowsDecide,
  rowsOnForget,
  sameHeld,
  soon,
  sumOf,
  turnOff
} from './rowsnotes';
import type { Held, Notes } from './rowsnotes';
import { bodyOf, recsOf, timeOf } from './rowslog';
import type { Mine } from './rowslog';
import { ORDER_ID, bare, orderIn, orderOf, withTaken } from './rowsapply';
import type { Taken } from './rowsapply';

/** What the document sync gives the rows' sync at start: how a sync's status is said, how a failure is handled (a refused sign-in, a deleted account, a retry), and how another tab's save is merged in. */
interface SyncCtx {
  status(st: CloudStatus, err?: string): void;
  fail(e: unknown): void;
  mergeStored(text: string): void;
  /** Switch back: every document written over with the log, marked so the guard lets it through (sync.ts). */
  writeBack(): Promise<boolean>;
  /** The documents taken as agreed once another phone switched the account back, then a send (sync.ts). */
  crossBack(): Promise<void>;
}
let ctx: SyncCtx | null = null;
/** Starts the rows' sync with what the document sync tells it. */
export function rowsyncStart(c: SyncCtx): void {
  ctx = c;
  rowsOnForget(syncForget);
}

/** The small key: what changes at every tick. */
const NOW_KEY = ROWS_KEY + '.now';
/** The rows of one read and of one write (the first phase's limits), the tries of a refused write of the workout, and how long a tab waits for another tab's sync. */
const PAGE = 500,
  WRITE_ROWS = 200,
  WRITE_BYTES = 400000,
  DRAFT_TRIES = 3,
  LOCK_MS = 10000;
/** A version of a row: when the lifter last edited its record, on which device, and how many times the app wrote it since. */
interface Ver {
  t: number;
  dev: string;
  a: number;
}
/** A write sent with no answer yet: its version, and where and what it said the record is, so a row read later with it is known as this phone's own. */
interface Out extends Ver {
  place: 'log' | 'trash' | 'good';
  s: string;
  copy?: DraftLike | null | undefined;
}
/** The small key: whose account and which log, the change number read, the writes with no answer yet, the workout's row as agreed (its version and its copy), the workouts last agreed before they closed (the base a session two phones made of one is joined by), a workout kept on this phone while the account holds another, and whether this phone has crossed from the documents. */
interface Now {
  acct: string;
  ep: number;
  n: number;
  out: Record<string, Out>;
  draft: { v: Ver; copy: DraftLike | null } | null;
  done: DraftLike[];
  held: { id: string; copy: DraftLike | null } | null;
  crossed: boolean;
}
let now: Now | null = null;
/** The small key's text as last written or read here, so a sync that changed nothing writes nothing. */
let nowText: string | null = null;
/** Whether the workout kept here was said once this visit. */
let heldSaid = false;

const fresh = (acct: string, ep: number): Now => ({
  acct,
  ep,
  n: 0,
  out: {},
  draft: null,
  done: [],
  held: null,
  crossed: false
});
/** A workout as a copy of its own, read as every build reads one. The log's workout is never one of the notes' copies:
    the logger edits it in place as the lifter ticks, and a copy kept as agreed would move with it. */
const draftCopy = (v: unknown): DraftLike | null => {
  const d = normalize({ draft: v ?? null }).draft;
  return d ? normalize({ draft: parseJson(JSON.stringify(d)) }).draft : null;
};
const verOfRec = (R: Rec | null): Ver => ({
  t: ansNum(R?.['t']),
  dev: ansText(R?.['dev']),
  a: ansNum(R?.['a'])
});
/** The small key as stored, for this account and log; a fresh one otherwise. */
function nowIn(acct: string, ep: number): Now {
  const text = prefGet(NOW_KEY);
  let m: Rec | null = null;
  try {
    m = rec(parseJson(text || 'null'));
  } catch (e) {
    // A small key that cannot be read is made again: the writes it listed are read as another phone's, and joined by time.
    log('rows-now', e);
  }
  nowText = text;
  if (!m || m['acct'] !== acct || m['ep'] !== ep) return fresh(acct, ep);
  const out: Record<string, Out> = {};
  const O = rec(m['out']) || {};
  for (const k in O) {
    const o = rec(O[k]);
    const place = o?.['place'];
    if (o && (place === 'log' || place === 'trash' || place === 'good'))
      out[k] = { ...verOfRec(o), place, s: ansText(o['s']), ...('copy' in o ? { copy: draftCopy(o['copy']) } : {}) };
  }
  const D = rec(m['draft']);
  const H = rec(m['held']);
  return {
    acct,
    ep,
    n: ansNum(m['n']),
    out,
    draft: D ? { v: verOfRec(rec(D['v'])), copy: draftCopy(D['copy']) } : null,
    done: (arr(m['done']) || []).flatMap(x => {
      const d = draftCopy(x);
      return d ? [d] : [];
    }),
    held: H && typeof H['id'] === 'string' ? { id: H['id'], copy: draftCopy(H['copy']) } : null,
    crossed: m['crossed'] === true
  };
}
/** Writes the small key, only while the log's own save succeeds, and only what changed. */
function nowOut(W: Now): void {
  if (!device.ok) return;
  const text = JSON.stringify(W);
  if (text === nowText) return;
  if (prefSet(NOW_KEY, text)) nowText = text;
}
/** The small key for this account and log, as stored now (another tab may have written it since). */
function nowFor(acct: string, ep: number): Now {
  const stored = prefGet(NOW_KEY);
  if (now && now.acct === acct && now.ep === ep && stored === nowText) return now;
  const was = now && now.acct === acct && now.ep === ep ? now : null;
  now = nowIn(acct, ep);
  // The writes with no answer of two tabs are joined, never replaced: each tab's are kept until answered.
  if (was)
    for (const k in was.out) {
      const o = was.out[k];
      if (o && !(k in now.out)) now.out[k] = o;
    }
  return now;
}
/** The workouts whose agreed copy is kept after they close: enough for a session two phones made of one to meet its other copy. */
const DONE_MAX = 2;
/** Takes `copy` as the account's workout agreed at version `v`; a workout it replaces is kept as the base of its session. */
function agree(W: Now, v: Ver, copy: DraftLike | null): void {
  const was = W.draft ? W.draft.copy : null;
  if (was && (!copy || copy.id !== was.id)) W.done = [was, ...W.done.filter(d => d.id !== was.id)].slice(0, DONE_MAX);
  W.draft = { v, copy };
}
/** The workout a session of id `id` was made of, as last agreed: open still, or closed lately. */
function baseFor(W: Now, id: string): DraftLike | null {
  if (W.draft && W.draft.copy && W.draft.copy.id === id) return W.draft.copy;
  return W.done.find(d => d.id === id) || null;
}
/** Forgets the small key with the rows' notes (rowsOnForget). */
function syncForget(): void {
  now = null;
  nowText = null;
  heldSaid = false;
  lookSeen.clear();
  prefDel(NOW_KEY);
}

/* ---------- the look: what this phone changed ---------- */

/** Each document's records as last read, by the hash of the document's text: read again only when its text changed. */
const lookSeen = new Map<string, { h: string; recs: Mine[] }>();
/** The order row, the profile photo and the workout, which no document's records are. */
const ORDER_KEY = keyOf('core', ORDER_ID),
  PHOTO_KEY = keyOf('photo', 'photo'),
  DRAFT_KEY = keyOf('draft', 'draft');
/** Every record of the log as a row, by key: its documents' records, the order of its lists, and the photo. */
function mineNow(): Map<string, Mine> {
  const ch = chunksOf(state);
  const out = new Map<string, Mine>();
  for (const id of [...lookSeen.keys()]) if (!(id in ch)) lookSeen.delete(id);
  for (const id in ch) {
    if (id === 'draft') continue;
    const doc = ch[id] || {};
    const h = hashStr(storedJson(doc));
    let seen = lookSeen.get(id);
    if (!seen || seen.h !== h) {
      seen = { h, recs: recsOf(id, doc) };
      lookSeen.set(id, seen);
    }
    for (const m of seen.recs) out.set(keyOf(m.kind, m.id), m);
  }
  out.set(ORDER_KEY, {
    kind: 'core',
    id: ORDER_ID,
    doc: 'core',
    rk: '',
    s: sumOf(bodyOf(orderOf(state))),
    place: 'log',
    at: 0
  });
  const ph = photoHeld();
  const pn = photoNote();
  if (ph !== null || photoPending())
    out.set(PHOTO_KEY, {
      kind: 'photo',
      id: 'photo',
      doc: 'photo',
      rk: '',
      s: sumOf(JSON.stringify(ph)),
      place: 'log',
      photo: true,
      at: pn ? pn.et : 0
    });
  return out;
}
/** The copy of record `m` as the text its row holds; null when the log no longer holds it. */
function copyNow(m: Mine): string | null {
  if (m.photo) return JSON.stringify(photoHeld());
  if (m.kind === 'core' && m.id === ORDER_ID) return bodyOf(orderOf(state));
  const ch = chunksOf(state);
  const D = ch[m.doc];
  if (!D) return null;
  if (m.kind === 'core') return bodyOf(D[m.id] ?? null);
  if (m.kind === 'setting') {
    const set = rec(D['settings']) || {};
    return m.id in set ? bodyOf(set[m.id]) : null;
  }
  if (m.place === 'trash') {
    for (const x of arr(D['trash']) || []) {
      const R = rec(x);
      if (R && R['id'] === m.id && R['kind'] === m.kind && rec(R['data'])) return bodyOf(R['data']);
    }
    return null;
  }
  const list = Object.keys(KIND).find(k => KIND[k] === m.kind);
  for (const x of (list && arr(D[list])) || []) {
    const R = rec(x);
    if (R && R['id'] === m.id) return bodyOf(R);
  }
  return null;
}
/** Whether the log holds record `m` as the row the notes hold says: where it is, its copy, and in Recently deleted its day. */
function inStep(m: Mine | undefined, h: Held | undefined): boolean {
  if (!m) return !h || placeOf(h) === 'good';
  if (!h || placeOf(h) !== m.place || h.s !== m.s) return false;
  return m.place === 'log' || (h.day === (m.day || '') && h.clash === (m.clash === true));
}
/** Whether record `m` is a copy only put back (a restore, an Undo, a backup): the copy a deletion of its row named. */
function putBack(m: Mine | undefined, h: Held | undefined): boolean {
  if (!m || !h) return false;
  const p = placeOf(h);
  return (p === 'good' || (p === 'trash' && m.place === 'log')) && (m.s === h.s || m.s === h.gs);
}
/** Whether this phone's difference from the note is the lifter's change, and its time: a change the tracker timed later than the note's, a copy put back, a record new here, or a deletion. What is left is the app's own write. */
function lifterOf(m: Mine | undefined, h: Held | undefined): { lifter: boolean; t: number } {
  if (!m) return { lifter: true, t: 0 };
  const t = timeOf(m);
  if (!h) return { lifter: true, t };
  if (putBack(m, h)) return { lifter: true, t: Math.max(t, h.t + 1) };
  return { lifter: t > h.t, t };
}
/** The order of two versions, as the account orders them. */
const later = (a: Ver, b: Ver): boolean =>
  a.t > b.t || (a.t === b.t && (a.dev > b.dev || (a.dev === b.dev && a.a > b.a)));
/** The version a change of record `m` is sent with, over note `h`; `over`: later than a copy the rule kept this one against. */
function versionOf(m: Mine | undefined, h: Held | undefined, over: Ver | undefined): Ver {
  const dev = cloud.devId || '';
  const L = lifterOf(m, h);
  if (over) return { t: Math.max(L.t, over.t + 1), dev, a: 0 };
  if (!h) return { t: L.t, dev, a: 0 };
  if (L.lifter && L.t > h.t) return { t: L.t, dev, a: 0 };
  return { t: h.t, dev: h.dev, a: h.a + 1 };
}
/** The row that makes the account say what the log says of the record keyed `k`; null when there is nothing to send. */
function rowOut(k: string, m: Mine | undefined, h: Held | undefined, over: Ver | undefined): RowIn | null {
  const made = h ? { over_t: h.t, over_dev: h.dev } : {};
  const dev = cloud.devId || '';
  const cut = k.indexOf('/');
  if (!m) {
    if (!h || placeOf(h) === 'good') return null;
    // Gone from the log and from Recently deleted: deleted for good, the mark naming the copy the account holds.
    return {
      kind: k.slice(0, cut),
      id: k.slice(cut + 1),
      body: null,
      t: h.t,
      dev: h.dev,
      a: h.a,
      gone_saw: h.t,
      gone_saw_dev: h.dev,
      gone_good: true,
      gone_t: laterThanSeen(Date.now()),
      gone_dev: dev,
      ...made
    };
  }
  const body = copyNow(m);
  if (body === null) return null;
  if (m.place === 'log') return { kind: m.kind, id: m.id, body, ...versionOf(m, h, over), ...made };
  // In Recently deleted: a copy the account holds keeps its version, and the mark names it.
  const v = h && h.s === m.s && !over ? { t: h.t, dev: h.dev, a: h.a } : versionOf(m, h, over);
  return {
    kind: m.kind,
    id: m.id,
    body,
    ...v,
    gone_saw: v.t,
    gone_saw_dev: v.dev,
    gone_good: false,
    gone_t: laterThanSeen(Date.now()),
    gone_dev: dev,
    gone_day: m.day || null,
    gone_clash: m.clash === true,
    ...made
  };
}

/* ---------- rows read from the account ---------- */

/** A row as an answer gives it, with its copy where the answer carries one. */
interface Got {
  k: string;
  kind: string;
  id: string;
  X: Rec;
  body: string | null | undefined;
  seq: number;
}
const gotOf = (x: unknown): Got | null => {
  const X = rec(x);
  if (!X || typeof X['kind'] !== 'string' || typeof X['id'] !== 'string') return null;
  const b = X['body'];
  return {
    k: keyOf(X['kind'], X['id']),
    kind: X['kind'],
    id: X['id'],
    X,
    body: typeof b === 'string' ? b : b === null ? null : undefined,
    seq: ansNum(X['seq'])
  };
};
/** The rows changed since change number `n`, read in pages, the last copy of each; null when the account has no rows table. */
async function pullSince(
  R: CloudRows,
  n: number
): Promise<{ rows: Map<string, Got>; top: number; layout: unknown } | null> {
  const rows = new Map<string, Got>();
  let at = n,
    top = n,
    layout: unknown = null;
  for (;;) {
    const p = rec(await soon(R.pull(at, PAGE)));
    if (!p) return null;
    layout = p['layout'];
    // Every answer carries the layout: a phone whose account asks for a newer build, or no longer lets its rows decide, learns it here.
    layoutTaken(layout);
    top = Math.max(top, ansNum(p['top']));
    const page = arr(p['rows']) || [];
    let last = at;
    for (const x of page) {
      const g = gotOf(x);
      if (!g) continue;
      rows.set(g.k, g);
      last = Math.max(last, g.seq);
    }
    const moved = last > at;
    at = last;
    if (page.length < PAGE || !moved) break;
  }
  return { rows, top: Math.max(top, at), layout };
}
/** The record a row gives the log: where it is, its copy, and its day in Recently deleted. */
function takenOf(g: Got): Taken | null {
  const h = heldAfter(g.X, undefined);
  const place = placeOf(h);
  let data: unknown = null;
  if (g.body != null) {
    try {
      data = parseJson(g.body);
    } catch (e) {
      // A copy that is not JSON is taken as no copy: the record stays as the log holds it.
      log('rows-copy', e);
      return null;
    }
  } else if (place !== 'good') return null;
  return { kind: g.kind, id: g.id, place, data, day: h.day, clash: h.clash };
}

/* ---------- the rule, where this phone's change meets a copy it had not seen ---------- */

/** What the rule decides for one record: take the account's copy, keep this phone's (sent later than the account's), or join two copies of one workout's session. */
type Verdict = { v: 'take' | 'keep' | 'same'; clash: boolean } | { v: 'join'; clash: false };
/** Decides record `k`: this phone's copy `m` against the account's row `g`, both read against the note `h`. */
function rule(m: Mine | undefined, h: Held | undefined, g: Got, W: Now): Verdict {
  const X = heldAfter(g.X, h);
  const theirs = placeOf(X);
  const same =
    (!m && theirs === 'good') ||
    (!!m &&
      m.place === theirs &&
      m.s === X.s &&
      (m.place === 'log' || (X.day === (m.day || '') && X.clash === !!m.clash)));
  if (same) return { v: 'same', clash: false };
  // Changed here only as the app writes on its own (a name it keeps), or not at all: the account's copy is taken.
  if (inStep(m, h)) return { v: 'take', clash: false };
  const L = lifterOf(m, h);
  if (!L.lifter) return { v: 'take', clash: false };
  /* The account's row holds the copy the note holds, in the same place, under another version (deleted and put back
     elsewhere, or written again by the app): it changed nothing of the record, and this phone's change stands. */
  if (h && placeOf(h) === theirs && h.s === X.s && (theirs === 'log' || (X.day === h.day && X.clash === h.clash)))
    return { v: 'keep', clash: false };
  const mineLive = !!m && m.place === 'log',
    theirsLive = theirs === 'log';
  // Two copies of the session one workout became (Finish on two phones, or the session edited while the other ticks): two sets of ticks, joined.
  if (mineLive && theirsLive && m.kind === 'session' && baseFor(W, m.id) && g.body) return { v: 'join', clash: false };
  // A copy only put back never beats an edit made elsewhere, whichever arrives first.
  const theirsBack = theirsLive && !!h && placeOf(h) !== 'log' && (X.s === h.s || X.s === h.gs);
  if (putBack(m, h) && theirsLive && !theirsBack) return { v: 'take', clash: false };
  if (theirsBack && mineLive && !putBack(m, h)) return { v: 'keep', clash: false };
  // Changed on one side and deleted on the other: kept, the recoverable mistake.
  if (mineLive && !theirsLive) return { v: 'keep', clash: false };
  if (theirsLive && !mineLive) return { v: 'take', clash: false };
  // Changed on both: the later edit, said.
  const mine: Ver = { t: L.t, dev: cloud.devId || '', a: 0 };
  return later({ t: X.t, dev: X.dev, a: X.a }, mine) ? { v: 'take', clash: true } : { v: 'keep', clash: true };
}

/* ---------- the workout (the row draft/draft) ---------- */

/** What becomes of the workout when the account's copy `T` meets this phone's `M`, against the copy agreed `A`. */
interface DraftWay {
  draft: DraftLike | null;
  push: boolean;
  held: { id: string; copy: DraftLike | null } | null;
  join: { copy: DraftLike; agreed: DraftLike | null } | null;
  lost: { copy: DraftLike; now: DraftLike | null; agreed: DraftLike | null } | null;
}
/** A workout as it was before any set of it was ticked: the base two copies are joined against when no copy was agreed. */
function unticked(d: DraftLike): DraftLike {
  const c = draftCopy(d) || d;
  return { ...c, ex: c.ex.map(b => ({ ...b, sets: b.sets.map(x => ({ ...x, done: false })) })) };
}
const sameDraft = (a: DraftLike | null | undefined, b: DraftLike | null | undefined): boolean =>
  canon(a || null) === canon(b || null);
/** The table of design 3.6: one workout open on two phones joins set by set; closed stays closed; a workout closed
    and saved elsewhere takes this copy's changes into its session; a workout that follows the other opens; a
    different workout, neither following the other, is kept on this phone (held). */
function draftWay(A: DraftLike | null, M: DraftLike | null, T: DraftLike | null, W: Now): DraftWay {
  const way = (d: DraftLike | null, push: boolean, more: Partial<DraftWay> = {}): DraftWay => ({
    draft: d,
    push,
    held: W.held,
    join: null,
    lost: null,
    ...more
  });
  // This phone's workout was finished elsewhere (a session of its id is in the log): every change this copy holds joins that session, and the account's workout opens here.
  if (M && !M.editingId && state.sessions.some(s => s.id === M.id) && (!T || T.id !== M.id)) {
    const agreed = W.held && W.held.id === M.id ? W.held.copy : A && A.id === M.id ? A : null;
    return way(T, false, { held: null, join: { copy: M, agreed } });
  }
  // A workout kept here while the account holds another.
  if (W.held && M && W.held.id === M.id) {
    if (T && T.id === M.id)
      return way(W.held.copy ? mergeWorkout(W.held.copy, M, T, false, { conflicts: 0 }) : M, true, { held: null });
    return way(M, false);
  }
  if (sameDraft(M, A)) return way(T, false, { held: null });
  if (!M) {
    // Closed here (Finish or Discard) while the same workout was ticked on elsewhere: closed stays closed, its late sets kept.
    if (A && T && T.id === A.id && !T.editingId) return way(null, true, { lost: { copy: T, now: null, agreed: A } });
    return way(T, false);
  }
  if (!T) {
    // Closed elsewhere: this copy joins the session saved there, every change it holds, or its sets are saved alone.
    if (A && M.id === A.id) return way(null, false, { join: { copy: M, agreed: A } });
    return way(M, true);
  }
  if (M.id === T.id) {
    if (M.editingId || T.editingId) return way(M, true);
    /* One workout open on both, joined set by set against the copy agreed; with none agreed (this phone's first write
       of it got no answer), against the workout with nothing ticked, so every set ticked on either phone stays. */
    if (A && A.id === M.id) return way(mergeWorkout(A, M, T, false, { conflicts: 0 }), true);
    // With no copy agreed, the workout's own fields are this phone's, which writes over the account's.
    return way({ ...M, ex: mergeWorkout(unticked(M), M, T, false, { conflicts: 0 }).ex }, true);
  }
  if (A && M.id === A.id && T.follows === A.id) return way(T, false, { lost: { copy: M, now: T, agreed: A } });
  // The account's workout is one this phone finished (it follows that one, or its session is here): this phone's
  // stays, and the account's late sets join the session it became.
  if (T.follows !== M.id && (M.follows === T.id || (!T.editingId && state.sessions.some(x => x.id === T.id))))
    return way(M, true, { lost: { copy: T, now: M, agreed: A && A.id === T.id ? A : null } });
  return way(M, false, { held: { id: M.id, copy: A && A.id === M.id ? A : null } });
}
/** Joins a workout closed elsewhere into the session it became, every change the copy holds against the copy agreed (a set, the date, a note), or, with no such session (it was discarded there), saves its ticked sets as a session of their own (keepLost). What it did, for the message. */
const joinClosed = (copy: DraftLike, agreed: DraftLike | null): Kept => keepLost(copy, null, agreed, false);

/* ---------- one sync ---------- */

/** What one sync said, for one message at its end: the clashes, what became of another device's copy of a workout
    kept here, this phone's workout closed elsewhere (and whether sets done here joined it), and a workout held here. */
interface Said {
  clashes: number;
  kept: Kept;
  mine: { prev: DraftLike; sets: Kept } | null;
  held: boolean;
}
/** The copies the rule kept against the account's this sync, by key: sent with a version later than the account's. */
const overs = new Map<string, Ver>();

/** Runs one sync of an account whose rows decide, in the sync's own queue. A failure is handled as the documents' sync handles one. */
export async function rowSync(): Promise<void> {
  const R = cloud.db && cloud.db.rows;
  const C = ctxNow();
  const S = ctx;
  const acct = cloud.uid;
  if (!R || !C || !S || !acct || !cloud.on) return;
  if (navigator.onLine === false) {
    S.status('offline');
    return;
  }
  if (editsPending()) trackEdits();
  S.status('connecting');
  try {
    await oneTab(() => syncOnce(R, acct, C.ep()));
  } catch (e) {
    log('rows-sync', e);
    overs.clear();
    if (/rows_limit/.test(said(e)))
      S.status('offline', 'Your account is full. Export a backup and delete old demo data.');
    else S.fail(e);
  }
}
/** An error's words. */
const said = (e: unknown): string => {
  const m = rec(e)?.['message'];
  return typeof m === 'string' ? m : String(e);
};
/** Runs `fn` while this tab holds the rows' lock, waiting at most LOCK_MS for another tab's: a tab frozen in the
    background with the lock never stops this one from saving, which is safe because the notes and the log are read
    as stored, and another tab's save is merged in before the log is written. */
async function oneTab(fn: () => Promise<void>): Promise<void> {
  const L = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!L || typeof L.request !== 'function' || typeof AbortController === 'undefined') return fn();
  const stop = new AbortController();
  const t = setTimeout(() => {
    stop.abort();
  }, LOCK_MS);
  let ran = false;
  try {
    await L.request(ROWS_KEY + '.sync', { signal: stop.signal }, async () => {
      clearTimeout(t);
      ran = true;
      await fn();
    });
  } catch (e) {
    clearTimeout(t);
    if (ran || rec(e)?.['name'] !== 'AbortError') throw e;
    // Waited long enough for another tab: this one syncs without the lock.
    log('rows-lock', e);
    await fn();
  }
}
/** Merges in a save another tab made since this one read the log, with that tab's edit time of each record it took
    in, so a pass decides on the log as stored. What keeps that save is this tab's own save, which merges it in again
    before it writes (saveNow): a pass that decided without it only takes one more round to send it. */
function otherTab(): void {
  const other = storedElsewhere();
  if (other && ctx) ctx.mergeStored(other);
}
/** Switch back's write of the log over every document, through the document sync (writeBack, sync.ts): true once every one is written. */
export async function writeDocsBack(): Promise<boolean> {
  return ctx ? ctx.writeBack() : false;
}
/** One sync, on the notes and the log as stored. */
async function syncOnce(R: CloudRows, acct: string, ep: number): Promise<void> {
  const S = ctx;
  if (!S) return;
  otherTab();
  const { N } = notesFor(acct, ep);
  const W = nowFor(acct, ep);
  // A table not written after a read reads those rows again.
  if (W.n < N.n) N.n = W.n;
  const sd: Said = { clashes: 0, kept: null, mine: null, held: false };
  if (!W.crossed && !(await cross(R, N, W, sd))) return;
  for (let round = 0; round < DRAFT_TRIES; round++) {
    // A workout kept here and closed since is let go first, so the account's workout is decided as the one open here.
    releaseHeld(W);
    const got = await pullSince(R, N.n);
    if (!got) {
      turnOff(NO_TABLE);
      return;
    }
    /* The account asks for a newer build: this phone has stopped and says so, and nothing read is taken or sent. */
    if (blockedNow()) return;
    if (editsPending()) trackEdits();
    takeRows(N, W, got.rows, sd);
    N.n = Math.max(N.n, got.top);
    W.n = N.n;
    // Another phone switched the account back to its documents: what was read is taken, nothing more sent here, and this
    // phone crosses back to the documents (5.2), whose send then writes what it holds beyond them.
    if (!rowsDecide()) {
      W.crossed = false;
      writeAll(N, W);
      await S.crossBack();
      return;
    }
    writeAll(N, W);
    const again = await sendOut(R, N, W, sd);
    writeAll(N, W);
    if (!again) break;
  }
  await dailyCheck(R, N);
  writeAll(N, W);
  conflictNote({ conflicts: sd.clashes });
  if (sd.kept) lostNote(sd.kept);
  if (sd.mine) draftNote(sd.mine.prev, sd.mine.sets ?? undefined);
  if (sd.held && !heldSaid) {
    heldSaid = true;
    fx.toast('A workout is open on another device. This one saves when you finish.');
  }
  cloud.last = Date.now();
  S.status('synced');
}
/** Lets go of a workout kept here once it is no longer open (finished, its session sent alone, or discarded): the
    account's workout is then taken as on any second phone, and the account's row is never written over by its close. */
function releaseHeld(W: Now): void {
  if (!W.held) return;
  const M = state.draft;
  if (M && M.id === W.held.id) return;
  W.held = null;
  const T = W.draft ? W.draft.copy : null;
  if (M || !T) return;
  setState(normalize({ ...state, draft: draftCopy(T) }));
  if (writeTakenIn()) seenAsIs();
  fx.rerenderKeepScroll();
}
/** Writes the table, then the small key, only while the log's own save succeeds (the log is written before either). */
function writeAll(N: Notes, W: Now): void {
  if (!device.ok) return;
  notesOut(N);
  nowOut(W);
}
/** Takes the rows read in: this phone's own writes first, then each other row decided by the rule against what this
    phone changed, all of it put into the log in one change, decided against the log as it is then. */
function takeRows(N: Notes, W: Now, rows: ReadonlyMap<string, Got>, sd: Said): void {
  if (!rows.size) return;
  otherTab();
  const mine = mineNow();
  const takes: Taken[] = [];
  const times: { k: string; m: Mine | undefined; t: number }[] = [];
  let order: Record<string, string[]> | null = null;
  let draftRow: Got | null = null;
  let photo: Got | null = null;
  for (const g of rows.values()) {
    const h = N.rows[g.k];
    const X = heldAfter(g.X, h);
    const o = W.out[g.k];
    // This phone's own write, its answer lost: the note it makes, before anything is decided.
    if (o && o.t === X.t && o.dev === X.dev && o.a === X.a && o.place === placeOf(X) && o.s === X.s) {
      N.rows[g.k] = X;
      delete W.out[g.k];
      if (g.k === DRAFT_KEY) agree(W, { t: o.t, dev: o.dev, a: o.a }, o.copy ?? null);
      continue;
    }
    if (h && sameHeld(h, X)) continue;
    if (g.k === DRAFT_KEY) {
      draftRow = g;
      continue;
    }
    if (g.k === PHOTO_KEY) {
      photo = g;
      continue;
    }
    if (!MIRRORED.has(g.kind)) {
      N.rows[g.k] = X;
      continue;
    }
    const m = mine.get(g.k);
    const d = rule(m, h, g, W);
    N.rows[g.k] = X;
    if (d.v === 'join') {
      const joined = joinSession(g, baseFor(W, g.id));
      if (joined) {
        takes.push(joined);
        times.push({ k: g.k, m, t: laterThanSeen(Date.now()) });
      }
      continue;
    }
    if (d.clash) sd.clashes++;
    if (d.v === 'keep') overs.set(g.k, { t: X.t, dev: X.dev, a: X.a });
    // The same copy here and in the account: its time is the row's, as on every phone that takes it.
    if (d.v === 'same') times.push({ k: g.k, m, t: X.t });
    if (d.v !== 'take') continue;
    if (g.k === ORDER_KEY) {
      order = orderIn(g.body ? parseJson(g.body) : null);
      continue;
    }
    const t = takenOf(g);
    if (t) {
      takes.push(t);
      times.push({ k: g.k, m, t: X.t });
    }
  }
  if (takes.length || order) {
    setState(withTaken(state, takes, order));
    noteTimes(times);
  }
  if (photo) takePhoto(N, photo);
  if (draftRow) takeDraft(N, W, draftRow, sd);
  if (!writeTakenIn()) return;
  seenAsIs();
  saveMeta();
  fx.rerenderKeepScroll();
}
/** The session two phones made of one workout, joined: every set ticked on either, the agreed workout its base. */
function joinSession(g: Got, last: DraftLike | null): Taken | null {
  const have = state.sessions.find(s => s.id === g.id);
  if (!have || g.body == null) return null;
  let theirs: unknown;
  try {
    theirs = parseJson(g.body);
  } catch (e) {
    // The account's copy cannot be read: this phone's stands, and is sent.
    log('rows-copy', e);
    return null;
  }
  const T = normalize({ sessions: [theirs] }).sessions[0];
  if (!T) return null;
  const base = last && last.id === g.id ? draftSession(last, true) : null;
  const joined = mergeSession(base, have, T, false, { conflicts: 0 });
  return { kind: 'session', id: g.id, place: 'log', data: joined, day: '', clash: false };
}
/** Notes the time of each record taken: the row's, so an edit made here after it is later (laterThanSeen); a copy joined here, the time it was joined. */
function noteTimes(times: readonly { k: string; m: Mine | undefined; t: number }[]): void {
  const where = new Map<string, Mine>();
  const ch = chunksOf(state);
  for (const id in ch) if (id !== 'draft') for (const m of recsOf(id, ch[id] || {})) where.set(keyOf(m.kind, m.id), m);
  for (const x of times) {
    const m = where.get(x.k) || x.m;
    if (!m || !m.rk || x.t <= 0) continue;
    (cloud.recAt[m.doc] ??= {})[m.rk] = x.t;
  }
}
/** The profile photo the account holds, taken where this phone holds no change of it still to send, or where the account's is later. */
function takePhoto(N: Notes, g: Got): void {
  const X = heldAfter(g.X, N.rows[g.k]);
  N.rows[g.k] = X;
  const pn = photoNote();
  if (photoPending() && pn && pn.et > X.t) return;
  let url: unknown = null;
  try {
    url = g.body ? parseJson(g.body) : null;
  } catch (e) {
    // A copy that is not JSON: the photo here stands.
    log('rows-copy', e);
    return;
  }
  photoTake(typeof url === 'string' ? url : null, X.t, cloud.uid || '');
}
/** The account's workout, through the table of design 3.6. */
function takeDraft(N: Notes, W: Now, g: Got, sd: Said): void {
  const X = heldAfter(g.X, N.rows[g.k]);
  let T: DraftLike | null = null;
  try {
    T = draftCopy(g.body ? parseJson(g.body) : null);
  } catch (e) {
    // A copy that is not JSON is read as no workout open on the account; this phone's stands and is written over it.
    log('rows-copy', e);
  }
  const A = W.draft ? W.draft.copy : null;
  N.rows[g.k] = X;
  goWay(A, T, W, sd);
  agree(W, { t: X.t, dev: X.dev, a: X.a }, T);
}
/** Puts what the table decides for the workout into the log, and notes what is to be said of it. */
function goWay(A: DraftLike | null, T: DraftLike | null, W: Now, sd: Said): void {
  const M = draftCopy(state.draft);
  const d = draftWay(A, M, T, W);
  if (d.held && !W.held) sd.held = true;
  W.held = d.held;
  if (!sameDraft(d.draft, M)) setState(normalize({ ...state, draft: draftCopy(d.draft) }));
  if (d.join) {
    const k = joinClosed(d.join.copy, d.join.agreed);
    sd.mine = { prev: d.join.copy, sets: k };
  } else if (M && !d.held && (!d.draft || d.draft.id !== M.id) && !d.lost) sd.mine = { prev: M, sets: null };
  if (d.lost) sd.kept = keepLost(d.lost.copy, d.lost.now, d.lost.agreed, false) || sd.kept;
}

/* ---------- sending ---------- */

/** Every difference between the log and the notes, as rows to send: a closed workout's session and the workout's row
    first, so Finish's two rows go in one write the account takes whole, then the rest. */
function rowsToSend(N: Notes, W: Now): RowIn[] {
  const mine = mineNow();
  const keys = new Set<string>(mine.keys());
  for (const k in N.rows) if (MIRRORED.has(k.slice(0, k.indexOf('/')))) keys.add(k);
  const out: RowIn[] = [];
  for (const k of keys) {
    const m = mine.get(k),
      h = N.rows[k];
    if (inStep(m, h) && !overs.has(k)) continue;
    // The photo goes while this phone holds a change of it to send, or where the account holds none.
    if (k === PHOTO_KEY && !photoPending() && h) continue;
    const r = rowOut(k, m, h, overs.get(k));
    if (r) out.push(r);
  }
  const d = draftOut(N, W);
  if (!d) return out;
  const closed = d.body === 'null' && W.draft && W.draft.copy ? keyOf('session', W.draft.copy.id) : '';
  const first = out.filter(r => keyOf(r.kind, r.id) === closed);
  return [...first, d, ...out.filter(r => keyOf(r.kind, r.id) !== closed)];
}
/** The workout's row, when the log's workout differs from the copy agreed and this phone keeps none of its own apart: written over the copy read. */
function draftOut(N: Notes, W: Now): RowIn | null {
  const M = draftCopy(state.draft);
  if (W.held && M && W.held.id === M.id) return null;
  const A = W.draft ? W.draft.copy : null;
  const h = N.rows[DRAFT_KEY];
  if (sameDraft(M, A) && (h || !M)) return null;
  return {
    kind: 'draft',
    id: 'draft',
    body: M ? bodyOf(M) : 'null',
    t: Math.max(cloud.editAt['draft'] || 0, h ? h.t + 1 : 1, laterThanSeen(0)),
    dev: cloud.devId || '',
    a: 0,
    ...(h ? { over_t: h.t, over_dev: h.dev } : {})
  };
}
/** Sends what is left, in writes of WRITE_ROWS and WRITE_BYTES at most, and takes each answer in; true when another
    round is needed: a copy the account kept against this phone's, or the workout written elsewhere first. */
async function sendOut(R: CloudRows, N: Notes, W: Now, sd: Said): Promise<boolean> {
  const rows = rowsToSend(N, W);
  overs.clear();
  if (!rows.length) return false;
  if (ctx) ctx.status('saving');
  let at = 0,
    again = false;
  while (at < rows.length) {
    const part: RowIn[] = [];
    let bytes = 0;
    while (at < rows.length && part.length < WRITE_ROWS) {
      const r = rows[at];
      if (!r) break;
      const size = r.body ? r.body.length : 0;
      if (part.length && bytes + size > WRITE_BYTES) break;
      part.push(r);
      bytes += size;
      at++;
    }
    // Each write's version is kept before it goes, so a row read later with it is known as this phone's own.
    for (const r of part) W.out[keyOf(r.kind, r.id)] = outOf(r);
    nowOut(W);
    let ans: Rec | null;
    try {
      ans = rec(await soon(R.push(part)));
    } catch (e) {
      // The workout's row was written elsewhere first, and the write refused whole: read again, merged, written again.
      if (!/rows_draft_(stale|time)/.test(said(e))) throw e;
      for (const r of part) delete W.out[keyOf(r.kind, r.id)];
      return true;
    }
    if (!ans) {
      turnOff(NO_TABLE);
      return false;
    }
    layoutTaken(ans['layout']);
    if (!rowsDecide()) {
      nowOut(W);
      return false;
    }
    again = answers(N, W, part, ans, sd) || again;
  }
  return again;
}
/** A write as it is kept until its answer comes: its version, where it says the record is, its copy's checksum, and for the workout its copy. */
function outOf(r: RowIn): Out {
  const place =
    r.gone_saw != null && r.gone_saw === r.t && r.gone_saw_dev === r.dev ? (r.gone_good ? 'good' : 'trash') : 'log';
  const o: Out = { t: r.t, dev: r.dev, a: r.a, place, s: r.body == null ? '' : sumOf(r.body) };
  if (r.kind === 'draft') o.copy = draftCopy(r.body ? parseJson(r.body) : null);
  return o;
}
/** Takes a push's answer in. A row taken as sent is in step; where it replaced a copy this phone had not seen and
    this phone's was only put back (a restore, an Undo), the replaced copy is the edit and wins: it is taken and sent
    again as the later one, else the clash is said here. A row the account kept as its own goes through the rule, as
    a row read in does. True when another round is needed. */
function answers(N: Notes, W: Now, sent: readonly RowIn[], ans: Rec, sd: Said): boolean {
  let again = false;
  const kept = new Map<string, Got>();
  const back: Taken[] = [];
  const mine = mineNow();
  for (const x of arr(ans['rows']) || []) {
    const g = gotOf(x);
    if (!g) continue;
    const r = sent.find(q => q.kind === g.kind && q.id === g.id);
    const was = N.rows[g.k];
    delete W.out[g.k];
    if (g.X['took'] !== true) {
      // The account holds a later copy: decided by the rule against this phone's change, which the note still names.
      if (g.body !== undefined) kept.set(g.k, g);
      else N.rows[g.k] = heldAfter(g.X, was);
      again = true;
      continue;
    }
    const X = heldAfter(g.X, was);
    N.rows[g.k] = X;
    if (r && r.body !== null && X.s && sumOf(r.body) !== X.s && X.t === r.t && X.dev === r.dev && X.a === r.a)
      found(N, g.k, 'the account holds another checksum than the copy sent', sumOf(r.body), X.s);
    if (g.k === DRAFT_KEY && r) {
      agree(W, { t: r.t, dev: r.dev, a: r.a }, draftCopy(r.body ? parseJson(r.body) : null));
    }
    if (g.k === PHOTO_KEY && r) photoSent(r.t, cloud.uid || '');
    const wb = g.X['was_body'];
    if (typeof wb !== 'string' || !r) continue;
    if (putBack(mine.get(g.k), was)) {
      const t = takenOf({ ...g, body: wb, X: { ...g.X, gone_saw: null, gone_saw_dev: null } });
      if (t) {
        back.push(t);
        overs.set(g.k, { t: X.t, dev: X.dev, a: X.a });
        again = true;
      }
    } else sd.clashes++;
  }
  if (back.length) {
    setState(withTaken(state, back, null));
    if (writeTakenIn()) seenAsIs();
  }
  if (kept.size) takeRows(N, W, kept, sd);
  return again;
}

/* ---------- crossing from the documents, and a first read ---------- */

/** The fingerprint of a record's copy, as a document's base keeps it. */
const fp = (x: unknown): string => Hx(x);
/** A record as a side of a crossing reads it: where it is and its copy's fingerprint. */
interface Side {
  place: 'log' | 'trash' | 'good';
  f: string;
  t: number;
}
/** The document notes' base of every record: what this phone and the account last agreed by the documents. */
function baseSides(): Map<string, Side> {
  const out = new Map<string, Side>();
  for (const id in cloud.meta) {
    const b = cloud.meta[id]?.b;
    if (!b) continue;
    for (const l in b.a || {}) {
      const kind = KIND[l];
      const ids = (b.a || {})[l] || {};
      if (kind) for (const x in ids) out.set(keyOf(kind, x), { place: 'log', f: ids[x] || '', t: 0 });
    }
    for (const k in b.s || {}) out.set(keyOf('setting', k), { place: 'log', f: (b.s || {})[k] || '', t: 0 });
    for (const k in b.f || {})
      if (k !== 'version') out.set(keyOf('core', k), { place: 'log', f: (b.f || {})[k] || '', t: 0 });
  }
  // Recently deleted's entries by the entry's own fingerprint, as the core document's base keeps them.
  const tr = cloud.meta['core']?.b?.a?.['trash'] || {};
  const kinds = new Map(state.trash.map(e => [e.id, e.kind]));
  for (const id in tr) {
    const kind = kinds.get(id);
    for (const k of kind ? [kind] : TRASH_KINDS)
      if (!out.has(keyOf(k, id))) out.set(keyOf(k, id), { place: 'trash', f: tr[id] || '', t: 0 });
  }
  return out;
}
/** The kinds an entry of Recently deleted can be. */
const TRASH_KINDS: readonly string[] = ['session', 'cardio', 'routine'];
/** This phone's log as sides of a crossing, each record with its time. */
function copySides(): Map<string, Side> {
  const out = new Map<string, Side>();
  const S: Rec = state;
  for (const l of Object.keys(KIND)) {
    const kind = KIND[l];
    for (const x of arr(S[l]) || []) {
      const R = rec(x);
      if (R && kind && typeof R['id'] === 'string') out.set(keyOf(kind, R['id']), { place: 'log', f: fp(R), t: 0 });
    }
  }
  for (const e of state.trash) {
    const k = keyOf(e.kind, e.id);
    if (!out.has(k)) out.set(k, { place: 'trash', f: fp(e), t: 0 });
  }
  const set = rec(state.settings) || {};
  for (const k in set) out.set(keyOf('setting', k), { place: 'log', f: fp(set[k]), t: 0 });
  for (const k of ['activeRoutineId', 'deloadWeek']) out.set(keyOf('core', k), { place: 'log', f: fp(S[k]), t: 0 });
  const ch = chunksOf(state);
  for (const id in ch)
    if (id !== 'draft')
      for (const m of recsOf(id, ch[id] || {})) {
        const s = out.get(keyOf(m.kind, m.id));
        if (s) s.t = timeOf(m);
      }
  return out;
}
/** A row as a side of a crossing: where it is and its copy's fingerprint (a copy in Recently deleted by its entry, as a document keeps it). */
function rowSide(g: Got): Side | null {
  const t = takenOf(g);
  if (!t) return null;
  const at = ansNum(g.X['t']);
  if (t.place === 'good') return { place: 'good', f: '', t: at };
  if (t.place === 'trash')
    return {
      place: 'trash',
      f: fp({ id: t.id, kind: t.kind, date: t.day, data: t.data, ...(t.clash ? { clash: true } : {}) }),
      t: at
    };
  return { place: 'log', f: fp(t.data), t: at };
}
/** Whether two sides say the same of a record: both nowhere, or the same place and copy. */
const sameSide = (x: Side | undefined, y: Side | undefined): boolean => {
  const xn = !x || x.place === 'good',
    yn = !y || y.place === 'good';
  if (xn || yn) return xn === yn;
  return !!x && !!y && x.place === y.place && x.f === y.f;
};
/** Crosses once from the documents to the rows (design 4.4, use 1): every row read, and each record decided by its
    place and copy against the document notes' base, never a document at a time. Unchanged here: the rows stand.
    Changed here only: this phone's change is sent. Changed on both: the later edit, said; one side deleted, kept;
    the same on both, nothing. A record this phone shows nowhere that it held at the base goes to Recently deleted,
    never deleted for good; one the account holds no row of is sent. A phone with no document notes for the account
    (a first sign-in) joins its own log with the account's by a first sign-in's rules; an empty phone takes the
    account's. False when the account has no rows table. */
async function cross(R: CloudRows, N: Notes, W: Now, sd: Said): Promise<boolean> {
  let got = await pullSince(R, 0);
  if (!got) {
    turnOff(NO_TABLE);
    return false;
  }
  // First what reached the documents just before the switch without reaching the rows: it crosses before anything is taken from them.
  if (await oneLook(R, got.rows)) got = await pullSince(R, 0);
  if (!got) return false;
  if (editsPending()) trackEdits();
  otherTab();
  N.rows = {};
  N.wait = {};
  const takes: Taken[] = [];
  let order: Record<string, string[]> | null = null;
  let T: DraftLike | null = null;
  let photo: Got | null = null;
  for (const g of got.rows.values()) {
    N.rows[g.k] = heldAfter(g.X, undefined);
    if (g.k === ORDER_KEY) order = orderIn(g.body ? parseJson(g.body) : null);
    else if (g.k === DRAFT_KEY) T = draftCopy(g.body ? parseJson(g.body) : null);
    else if (g.k === PHOTO_KEY) photo = g;
    else if (MIRRORED.has(g.kind)) {
      const t = takenOf(g);
      if (t) takes.push(t);
    }
  }
  const dv = N.rows[DRAFT_KEY];
  W.draft = null;
  if (dv) agree(W, { t: dv.t, dev: dv.dev, a: dv.a }, T);
  if (!Object.keys(cloud.meta).length) firstRead(takes, order, T, W, sd);
  else crossBy(got.rows, takes, order, T, W, sd);
  noteTimes(
    [...got.rows.values()].filter(g => MIRRORED.has(g.kind)).map(g => ({ k: g.k, m: undefined, t: ansNum(g.X['t']) }))
  );
  if (photo) takePhoto(N, photo);
  N.n = got.top;
  W.n = got.top;
  W.crossed = true;
  if (!writeTakenIn()) return false;
  seenAsIs();
  saveMeta();
  writeAll(N, W);
  fx.render();
  return true;
}
/** A first read of an account on a phone that holds no notes of it: the account's log made from its rows and taken;
    on a phone with a log of its own, joined with it by a first sign-in's rules, every record the account does not
    hold as the same copy then the lifter's change made now. Two different workouts each stay on their own phone. */
function firstRead(
  takes: readonly Taken[],
  order: Record<string, string[]> | null,
  T: DraftLike | null,
  W: Now,
  sd: Said
): void {
  const theirs = withTaken(bare(), takes, order);
  if (!holdsRecords(state)) {
    setState(normalize({ ...theirs, draft: draftCopy(T) }));
    return;
  }
  const M = draftCopy(state.draft);
  const { joined } = firstJoin(normalize({ ...state, draft: null }), normalize({ ...theirs, draft: null }));
  setState(normalize({ ...joined, draft: draftCopy(M || T) }));
  if (M && T && M.id !== T.id) {
    W.held = { id: M.id, copy: null };
    sd.held = true;
  }
  stampAll();
}
/** The crossing of a phone that synced the account by its documents (above). */
function crossBy(
  rows: ReadonlyMap<string, Got>,
  takes: readonly Taken[],
  order: Record<string, string[]> | null,
  T: DraftLike | null,
  W: Now,
  sd: Said
): void {
  const base = baseSides();
  const copy = copySides();
  const theirs = new Map<string, Side>();
  for (const g of rows.values())
    if (MIRRORED.has(g.kind) && g.k !== ORDER_KEY) {
      const s = rowSide(g);
      if (s) theirs.set(g.k, s);
    }
  const keep = new Set<string>();
  const toTrash: Taken[] = [];
  for (const k of new Set([...base.keys(), ...copy.keys(), ...theirs.keys()])) {
    const b = base.get(k),
      c = copy.get(k),
      r = theirs.get(k);
    // A record the account holds no row of: this phone's copy is sent.
    if (!r) {
      if (c) keep.add(k);
      continue;
    }
    if (sameSide(c, b) || sameSide(c, r)) continue;
    if (sameSide(r, b)) {
      // Changed here only. Shown nowhere here, though the base held it: put in Recently deleted, never deleted for good.
      if ((!c || c.place === 'good') && r.place === 'log') {
        const g = rows.get(k);
        const t = g ? takenOf(g) : null;
        if (t && TRASH_KINDS.includes(t.kind)) toTrash.push({ ...t, place: 'trash', day: today(), clash: false });
        else if (t) keep.add(k);
        continue;
      }
      keep.add(k);
      continue;
    }
    // Changed on both. One side deleted: the other kept. Both live: the later edit, said.
    const cLive = !!c && c.place !== 'good',
      rLive = r.place !== 'good';
    if (cLive !== rLive) {
      if (cLive) keep.add(k);
      continue;
    }
    sd.clashes++;
    if (c && c.t > r.t) keep.add(k);
  }
  setState(withTaken(state, [...takes.filter(t => !keep.has(keyOf(t.kind, t.id))), ...toTrash], order));
  // A copy kept here whose time is not later than the account's is sent as the later one.
  for (const k of keep) {
    const c = copy.get(k),
      r = theirs.get(k);
    if (c && r && c.t <= r.t) stamp(k);
  }
  // The workout crosses by 3.6's table, the base's agreed workout as the agreed copy.
  goWay(cloud.meta['draft']?.b?.draft || null, T, W, sd);
}
/* ---------- the one look at the switch (design 4.2 and 4.4, use 2) ---------- */

/** A document's records as sides of a crossing, each with its copy, its key in the document's times, and its day in Recently deleted. */
function docSides(id: string, D: Rec): Map<string, Side & { x: unknown; rk: string; day: string; clash: boolean }> {
  const out = new Map<string, Side & { x: unknown; rk: string; day: string; clash: boolean }>();
  for (const l of Object.keys(KIND)) {
    const kind = KIND[l];
    for (const x of arr(D[l]) || []) {
      const R = rec(x);
      if (R && kind && typeof R['id'] === 'string')
        out.set(keyOf(kind, R['id']), {
          place: 'log',
          f: fp(R),
          t: 0,
          x: R,
          rk: recordKey(l, R['id']),
          day: '',
          clash: false
        });
    }
  }
  if (id !== 'core') return out;
  for (const x of arr(D['trash']) || []) {
    const E = rec(x);
    const kind = E ? E['kind'] : null;
    if (!E || typeof kind !== 'string' || typeof E['id'] !== 'string' || !TRASH_KINDS.includes(kind)) continue;
    const k = keyOf(kind, E['id']);
    if (!out.has(k))
      out.set(k, {
        place: 'trash',
        f: fp(E),
        t: 0,
        x: E['data'],
        rk: recordKey('trash', E['id']),
        day: typeof E['date'] === 'string' ? E['date'] : '',
        clash: E['clash'] === true
      });
  }
  const set = rec(D['settings']) || {};
  for (const k in set)
    out.set(keyOf('setting', k), {
      place: 'log',
      f: fp(set[k]),
      t: 0,
      x: set[k],
      rk: recordKey('settings', k),
      day: '',
      clash: false
    });
  for (const k of CORE_FIELDS)
    if (k !== 'version')
      out.set(keyOf('core', k), {
        place: 'log',
        f: fp(D[k]),
        t: 0,
        x: D[k] ?? null,
        rk: recordKey('', k),
        day: '',
        clash: false
      });
  return out;
}
/** A document's base as a frozen row keeps it, as sides of a crossing. */
function frozenSides(id: string, b: Rec | null): Map<string, Side> {
  const out = new Map<string, Side>();
  if (!b) return out;
  const A = rec(b['a']) || {};
  for (const l in A) {
    const ids = rec(A[l]) || {};
    const kind = KIND[l];
    if (kind) for (const x in ids) out.set(keyOf(kind, x), { place: 'log', f: ansText(ids[x]), t: 0 });
    if (l === 'trash' && id === 'core')
      for (const x in ids)
        for (const k of TRASH_KINDS) out.set(keyOf(k, x), { place: 'trash', f: ansText(ids[x]), t: 0 });
  }
  const set = rec(b['s']) || {};
  for (const k in set) out.set(keyOf('setting', k), { place: 'log', f: ansText(set[k]), t: 0 });
  const f = rec(b['f']) || {};
  for (const k in f) if (k !== 'version') out.set(keyOf('core', k), { place: 'log', f: ansText(f[k]), t: 0 });
  return out;
}
/** A document's base as a frozen row keeps it once the look has crossed it: its records' fingerprints, as its sync note's base keeps them. */
function baseOfDoc(sides: ReadonlyMap<string, Side>): Rec {
  const a: Record<string, Record<string, string>> = {},
    st: Record<string, string> = {},
    f: Record<string, string> = {};
  const listOf = Object.fromEntries(Object.entries(KIND).map(([l, k]) => [k, l]));
  for (const [k, sd] of sides) {
    const cut = k.indexOf('/'),
      kind = k.slice(0, cut),
      id = k.slice(cut + 1);
    if (kind === 'setting') st[id] = sd.f;
    else if (kind === 'core') f[id] = sd.f;
    else if (sd.place === 'trash') (a['trash'] ??= {})[id] = sd.f;
    else {
      const l = listOf[kind];
      if (l) (a[l] ??= {})[id] = sd.f;
    }
  }
  return { a, s: st, f };
}
/** The one look (design 4.2, use 2): every document of the account is read, and those changed since the switch's
    frozen copy of them (written by a phone still on the documents just before the switch, before its rows were made
    to say the same) cross to the rows together, record by record: a record the document changed and the rows did not
    is sent as the document holds it, with the document's own time for it and its writer; one the document shows
    nowhere goes to Recently deleted; with no frozen copy, copies are sent and nothing deleted. The account joins each
    by its version, so a later edit made on the rows stands. Then each document's frozen row is moved to the copy
    crossed, records first, so a look stopped half way looks again. True when it sent anything. */
async function oneLook(R: CloudRows, rows: ReadonlyMap<string, Got>): Promise<boolean> {
  const db = cloud.db;
  if (!db || !cloud.uid) return false;
  const snap = await soon(db.collection(`data/users/${cloud.uid}`).get());
  const frozen = new Map<string, Rec | null>();
  const frozenAt = new Map<string, string>();
  for (const g of rows.values())
    if (g.kind === 'frozen' && g.body) {
      try {
        const F = rec(parseJson(g.body));
        frozen.set(g.id, F ? rec(F['b']) : null);
        frozenAt.set(g.id, F ? ansText(F['h']) : '');
      } catch (e) {
        // A frozen row that cannot be read is no base: the document's copies are sent and nothing deleted.
        log('rows-look', e);
        frozen.set(g.id, null);
      }
    }
  if (!frozen.size) return false;
  const out: RowIn[] = [];
  const moved: RowIn[] = [];
  const now = laterThanSeen(Date.now());
  for (const d of snap.docs) {
    if (!d.exists || !isChunkId(d.id) || d.id === 'draft') continue;
    const b = rec(d.data());
    if (!b || typeof b['json'] !== 'string') continue;
    const h = hashStr(b['json']);
    if (frozen.has(d.id) && frozenAt.get(d.id) === h) continue;
    let D: Rec | null;
    try {
      // Read as the documents' base was made of it, so an unchanged record has the fingerprint its frozen copy holds.
      D = normChunk(d.id, parseJson(b['json']));
    } catch (e) {
      log('rows-look', e);
      continue;
    }
    if (!D) continue;
    const times = timesIn(b['rt']) || {};
    const writer = ansText(b['w']).split('.')[0] || 'docs';
    const at = ansNum(b['et']) || ansNum(b['at']);
    const base = frozen.has(d.id) ? frozenSides(d.id, frozen.get(d.id) ?? null) : null;
    const copy = docSides(d.id, D);
    for (const k of new Set([...copy.keys(), ...(base ? base.keys() : [])])) {
      const c = copy.get(k),
        bs = base ? base.get(k) : undefined,
        g = rows.get(k);
      const r = g ? rowSide(g) : null;
      if (base && sameSide(c, bs)) continue;
      if (r && sameSide(c, r)) continue;
      // Changed on the rows since the switch, and deleted in the document: kept.
      if (!c && bs && r && !sameSide(r, bs)) continue;
      const cut = k.indexOf('/');
      const kind = k.slice(0, cut),
        id = k.slice(cut + 1);
      const X = g ? heldAfter(g.X, undefined) : undefined;
      if (!c) {
        // Shown nowhere in the document, though its frozen copy held it: to Recently deleted, never for good.
        if (!base || !X || placeOf(X) !== 'log' || !TRASH_KINDS.includes(kind) || !g || g.body == null) continue;
        out.push({
          kind,
          id,
          body: g.body,
          t: X.t,
          dev: X.dev,
          a: X.a,
          gone_saw: X.t,
          gone_saw_dev: X.dev,
          gone_good: false,
          gone_t: now,
          gone_dev: cloud.devId || '',
          gone_day: today(),
          gone_clash: false
        });
        continue;
      }
      const t = times[c.rk] || at;
      const v = { t, dev: writer, a: 0 };
      const body = bodyOf(c.x);
      if (c.place === 'log') out.push({ kind, id, body, ...v });
      else
        out.push({
          kind,
          id,
          body,
          ...v,
          gone_saw: v.t,
          gone_saw_dev: v.dev,
          gone_good: false,
          gone_t: now,
          gone_dev: writer,
          gone_day: c.day || null,
          gone_clash: c.clash
        });
    }
    moved.push({
      kind: 'frozen',
      id: d.id,
      body: canon({ at, h, b: baseOfDoc(copy) }),
      t: now,
      dev: cloud.devId || '',
      a: 0
    });
  }
  for (let i = 0; i < out.length; i += WRITE_ROWS)
    if (!rec(await soon(R.push(out.slice(i, i + WRITE_ROWS))))) return false;
  for (let i = 0; i < moved.length; i += WRITE_ROWS)
    if (!rec(await soon(R.push(moved.slice(i, i + WRITE_ROWS))))) return false;
  return out.length > 0 || moved.length > 0;
}
/** The one look, for the switch just written by this phone: the frozen rows it wrote, read back, and the documents read. */
export async function lookAtSwitch(): Promise<void> {
  const R = cloud.db && cloud.db.rows;
  const C = ctxNow();
  if (!R || !C || !cloud.uid) return;
  try {
    const got = await pullSince(R, 0);
    if (got) await oneLook(R, got.rows);
    return;
  } catch (e) {
    // The switch is made; the look stopped (no answer): it is made again with the crossing at this phone's next sync.
    log('rows-look', e);
  }
  const W = nowFor(cloud.uid, C.ep());
  W.crossed = false;
  nowOut(W);
}

/** Whether a log holds anything the lifter made: a session, a cardio entry, a weigh-in, a measurement, an injury or a workout. */
const holdsRecords = (S: State): boolean =>
  !!(
    S.sessions.length ||
    S.cardio.length ||
    S.bodyweights.length ||
    S.measurements.length ||
    S.injuries.length ||
    S.draft
  );
/** Notes record `k` as edited here now, so the look sends it as the lifter's change, later than the account's copy. */
function stamp(k: string): void {
  const at = laterThanSeen(Date.now());
  const ch = chunksOf(state);
  for (const id in ch)
    if (id !== 'draft')
      for (const m of recsOf(id, ch[id] || {}))
        if (keyOf(m.kind, m.id) === k && m.rk) (cloud.recAt[m.doc] ??= {})[m.rk] = at;
}
/** Notes every record of the log as edited here now (a first sign-in's join): what the account holds as the same copy is in step and is not sent. */
function stampAll(): void {
  const at = laterThanSeen(Date.now());
  const ch = chunksOf(state);
  for (const id in ch)
    if (id !== 'draft') for (const m of recsOf(id, ch[id] || {})) if (m.rk) (cloud.recAt[m.doc] ??= {})[m.rk] = at;
}

/** Takes this phone as crossed at the switch it just wrote: its notes, log and documents were proven equal, so its
    notes are the agreed rows, its workout the one the account holds, and the change number the switch's own. */
export function rowsSwitched(N: Notes, top: number, draft: unknown): void {
  const C = ctxNow();
  if (!C || !cloud.uid) return;
  const W = nowFor(cloud.uid, C.ep());
  const h = N.rows[DRAFT_KEY];
  W.draft = null;
  if (h) agree(W, { t: h.t, dev: h.dev, a: h.a }, draftCopy(draft));
  W.crossed = true;
  N.n = top;
  W.n = top;
  nowOut(W);
}

/* ---------- what else asks the rows' sync ---------- */

/** Whether this phone holds something the account does not: a change not yet sent, a write with no answer, a workout kept here, or a photo to send. */
export function rowsUnsent(): boolean {
  if (!cloud.on || !cloud.uid) return false;
  if (cloud.status !== 'synced' || photoPending()) return true;
  const C = ctxNow();
  if (!C) return false;
  const { N } = notesFor(cloud.uid, C.ep());
  const W = nowFor(cloud.uid, C.ep());
  if (Object.keys(W.out).length || W.held) return true;
  if (!W.crossed) return true;
  return rowsToSendPeek(N, W);
}
/** Whether the look finds anything to send, without sending it. */
function rowsToSendPeek(N: Notes, W: Now): boolean {
  try {
    return rowsToSend(N, W).length > 0;
  } catch (e) {
    log('rows-unsent', e);
    return true;
  }
}

/* ---------- the daily check, rows deciding ---------- */

/** The day the daily check last ran here, this visit. */
let checkedOn: string | null = null;
/** Once a day: the account's one checksum against the table's. Equal, one small request. Different, a finding, and the
    table is made again from the account at the next read, its copies joined by time and nothing deleted. */
async function dailyCheck(R: CloudRows, N: Notes): Promise<void> {
  const day = today();
  if (checkedOn === day && N.chk.day === day) return;
  checkedOn = day;
  if (N.chk.day === day) return;
  const d = rec(await soon(R.digest()));
  if (!d) return;
  if (ansNum(d['top']) !== N.n) return;
  const mine = notesDigest(N);
  if (ansNum(d['n']) === mine.n && ansText(d['sum']) === mine.sum) {
    N.chk.clean++;
    N.chk.day = day;
    return;
  }
  found(
    N,
    '',
    'the notes were not what the account holds; they were made again',
    `${mine.n} rows`,
    `${ansNum(d['n'])} rows`
  );
  N.chk.day = day;
  N.rows = {};
  N.n = 0;
}
