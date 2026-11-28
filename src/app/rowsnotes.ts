/* What this phone knows of the account's rows: their notes, kept under a key of their own, the layout as last read,
   and whether the rows are off for this visit. The account's answers are taken into the notes here alone (takeIn,
   send), so every part of the rows reads a row one way. The notes can be made again from the account at any time,
   and are forgotten wherever the document sync's notes stop describing the log on this phone (rowsForget). */

import { NET_MS } from './config';
import { arr, parseJson, rec } from './records';
import type { Rec } from './records';
import { md5 } from './md5';
import { cloud } from './store';
import type { CloudRows, RowIn } from './store';
import { KEY, device, log, prefDel, prefGet, prefSet } from './storage';

/** The key the rows' notes are saved under, and the name of the lock one pass at a time across a phone's tabs holds. */
export const ROWS_KEY = KEY + '.rows';
/** The key the account's layout is kept under, so a build that must not sync knows it when the app is opened. */
const LAYOUT_KEY = ROWS_KEY + '.layout';
/** The level of sync a build has: 1 writes the rows beside the documents, which decide. An account whose layout asks for more is one this build cannot sync. */
export const LEVEL = 1;
/** The characters of the account's checksum the notes keep of each copy. */
const SUM_LEN = 12;
/** The rows of one read, and of one write; a write also stays under WRITE_BYTES of copies. */
const PAGE = 500,
  WRITE_ROWS = 200,
  WRITE_BYTES = 400000;
/** The findings kept for Diagnostics. */
const FIND_MAX = 20;
/** A change number above any the account can hold: a read from it answers with the account's last number and layout alone. */
const PAST_ALL = Number.MAX_SAFE_INTEGER;
/** The base a time is written in, in the notes and in a finding. */
export const B36 = 36;
/** The words of a row's line in the notes: one with a deletion mark, and one whose device or count of app writes is not the usual none. */
const WORDS_MARKED = 9,
  WORDS_NAMED = 4;
/** Why the rows are off on an account whose rows' SQL was never run: nothing is asked of it again this visit, and nothing is shown. */
export const NO_TABLE = 'not set up';

/** The lists of the log whose records are rows, each with its rows' kind. */
export const KIND: Readonly<Record<string, string>> = {
  sessions: 'session',
  cardio: 'cardio',
  bodyweights: 'bodyweight',
  measurements: 'measurement',
  routines: 'routine',
  exercises: 'exercise',
  injuries: 'injury'
};
/** The kinds this build writes rows of from the log's records: a row of any other kind is left as it is. */
export const MIRRORED = new Set([...Object.values(KIND), 'setting', 'core', 'photo']);

/** The account's row as this phone last knew it: the copy's version, the first characters of the account's checksum of the copy ('' when it holds none), and its deletion mark, when it has one: the copy the mark names, whether it is for good, the day Recently deleted shows and whether it is a copy put aside. */
export interface Held {
  t: number;
  dev: string;
  a: number;
  s: string;
  saw: number | null;
  sawDev: string;
  good: boolean;
  day: string;
  clash: boolean;
}
/** Something the daily check or a write found, kept for Diagnostics: when, the record, what happened, and both sides as text. */
export interface Finding {
  at: string;
  key: string;
  why: string;
  mine: string;
  theirs: string;
}
/** The rows' notes: whose account and which log they describe (the document notes' epoch), the id of the account's layout, the last change number read, each row as held, the records left alone since a time, the daily check, the findings, the day the device's own row was last written, and the profile photo's checksum with the edit time and length it was worked out for. */
export interface Notes {
  acct: string;
  ep: number;
  made: string | null;
  n: number;
  rows: Record<string, Held>;
  wait: Record<string, number>;
  chk: { day: string | null; clean: number; diffs: number; removed: number };
  find: Finding[];
  devDay: string | null;
  ph: { at: number; len: number; s: string } | null;
}

/** What the document sync tells this module at start: its notes' epoch (which log they describe), whether it holds anything unsent, when the last whole read of the account it took in was asked for, and how it is told that the account needs a newer build. */
export interface Ctx {
  ep(): number;
  unsent(): boolean;
  pulledAt(): number;
  stop(): void;
}
let ctx: Ctx | null = null;
/** The notes in memory, for the account and log they were read for. */
let notes: Notes | null = null;
/** Why the rows are off until the app is opened again; null while they are on. */
let off: string | null = null;
/** Whether the account's layout asks for a build newer than this one. */
let blocked = false;
/** The account `blocked` was last worked out for, and the layout as kept on the phone (LAYOUT_KEY) when this page last read or wrote it. */
let layoutFor: string | null = null;
let layoutText: string | null = null;
/** The read of the layout under way (rowsGate), which a send of the documents waits for; null when none is. */
let asked: Promise<boolean> | null = null;
/** The layout reads under way (rowsGate). */
let asking = 0;
/** The notes' text as last written, so a pass that changed nothing writes nothing. */
let written: string | null = null;
/** Notes what an answer's layout says of this build, and tells the document sync when it must stop. */
function heed(L: { decides: string; level: number } | null): void {
  const was = blocked;
  blocked = needsNewer(L);
  layoutFor = cloud.uid;
  /* Kept on the phone for the account: the next time the app is opened it knows before its first request that it
     must not sync, and does not read the documents into the log or send what it holds while the layout is asked for. */
  if (cloud.uid) {
    const text = JSON.stringify({ acct: cloud.uid, decides: L ? L.decides : 'docs', level: L ? L.level : 1 });
    if (text !== layoutText && (blocked || layoutText !== null)) prefSet(LAYOUT_KEY, text);
    layoutText = text;
  }
  if (blocked && !was && ctx) ctx.stop();
}

/** An error's words. */
export const said = (e: unknown): string => {
  const m = rec(e)?.['message'];
  return typeof m === 'string' ? m : String(e);
};
/** A row's key in the notes: its kind and id. */
export const keyOf = (kind: string, id: string): string => kind + '/' + id;
/** A request that gives up after the sync's wait for an answer. */
export function soon<T>(p: Promise<T>): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p.finally(() => {
      clearTimeout(t);
    }),
    new Promise<never>((_, rej) => {
      t = setTimeout(() => {
        rej(new Error('rows: no answer in time'));
      }, NET_MS);
    })
  ]);
}
/** A number an answer of the account holds; 0 where it holds none. */
export const ansNum = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
/** A text an answer of the account holds; '' where it holds none. */
export const ansText = (v: unknown): string => (typeof v === 'string' ? v : '');
/** The first characters of a copy's checksum, as the notes keep it. */
export const sumOf = (body: string): string => md5(body).slice(0, SUM_LEN);

/** A row as the account answers with it, as the notes keep it. */
function heldOf(x: Rec): Held {
  return {
    t: ansNum(x['t']),
    dev: ansText(x['dev']),
    a: ansNum(x['a']),
    s: ansText(x['sum']).slice(0, SUM_LEN),
    saw: x['gone_saw'] == null ? null : ansNum(x['gone_saw']),
    sawDev: ansText(x['gone_saw_dev']),
    good: x['gone_good'] === true,
    day: ansText(x['gone_day']),
    clash: x['gone_clash'] === true
  };
}
/** Where a row says its record is: in the log, in Recently deleted, or deleted for good. */
export function placeOf(h: Held): 'log' | 'trash' | 'good' {
  if (h.saw === null || h.saw !== h.t || h.sawDev !== h.dev) return 'log';
  return h.good ? 'good' : 'trash';
}
const sameHeld = (a: Held | undefined, b: Held): boolean =>
  !!a &&
  a.t === b.t &&
  a.dev === b.dev &&
  a.a === b.a &&
  a.s === b.s &&
  a.saw === b.saw &&
  a.sawDev === b.sawDev &&
  a.good === b.good &&
  a.day === b.day &&
  a.clash === b.clash;
/** A device's name as one word of a line (a name may hold a space). */
const word = (dev: string): string => encodeURIComponent(dev);
/** A row held, as one line of text: for the notes as saved, and for a finding. Most rows are a copy no device is named
    on, never written by the app and never deleted, and are kept as their time and checksum alone. */
export function heldText(h: Held): string {
  if (h.saw !== null)
    return [
      h.t.toString(B36),
      word(h.dev),
      h.a,
      h.s,
      h.saw.toString(B36),
      word(h.sawDev),
      h.good ? 1 : 0,
      h.day,
      h.clash ? 1 : 0
    ].join(' ');
  return h.dev === '' && h.a === 0
    ? h.t.toString(B36) + ' ' + h.s
    : [h.t.toString(B36), word(h.dev), h.a, h.s].join(' ');
}
/** A row held read back from its line; null when it is not one. */
function heldIn(v: unknown): Held | null {
  if (typeof v !== 'string') return null;
  const p = v.split(' ');
  const plain = p.length === 2;
  if (!plain && p.length !== WORDS_NAMED && p.length !== WORDS_MARKED) return null;
  const [t36 = '', w1 = '', w2 = '', w3 = '', saw36 = '', sawWord = '', good = '', day = '', clash = ''] = p;
  const t = parseInt(t36, B36),
    a = plain ? 0 : Number(w2);
  if (!Number.isFinite(t) || !Number.isFinite(a)) return null;
  const saw = p.length === WORDS_MARKED ? parseInt(saw36, B36) : null;
  if (saw !== null && !Number.isFinite(saw)) return null;
  let dev: string, sawDev: string;
  try {
    dev = plain ? '' : decodeURIComponent(w1);
    sawDev = decodeURIComponent(sawWord);
  } catch (e) {
    // A name that does not decode is a line this module did not write: the notes are made again from the account.
    log('rows-notes', e);
    return null;
  }
  return { t, dev, a, s: plain ? w1 : w3, saw, sawDev, good: good === '1', day, clash: clash === '1' };
}

/* ---------- the notes ---------- */

const fresh = (acct: string, ep: number): Notes => ({
  acct,
  ep,
  made: null,
  n: 0,
  rows: {},
  wait: {},
  chk: { day: null, clean: 0, diffs: 0, removed: 0 },
  find: [],
  devDay: null,
  ph: null
});
/** The notes as saved, when they are for this account and this log; else none. Notes for another account or an
    earlier log describe rows this phone must not act on: a record they hold that the log lacks would read as deleted. */
function notesIn(acct: string, ep: number, text: string | null = prefGet(ROWS_KEY)): Notes | null {
  let m: Rec | null = null;
  try {
    m = rec(parseJson(text || 'null'));
  } catch (e) {
    // Notes that cannot be read are made again from the account.
    log('rows-notes', e);
    return null;
  }
  if (!m || m['acct'] !== acct || m['ep'] !== ep) return null;
  const out = fresh(acct, ep);
  out.made = typeof m['made'] === 'string' ? m['made'] : null;
  out.n = ansNum(m['n']);
  const rows = rec(m['rows']) || {};
  for (const k in rows) {
    const h = heldIn(rows[k]);
    // One row's note unreadable: none of them is trusted, and they are made again from the account.
    if (!h) return null;
    out.rows[k] = h;
  }
  const wait = rec(m['wait']) || {};
  for (const k in wait) if (typeof wait[k] === 'number') out.wait[k] = ansNum(wait[k]);
  const c = rec(m['chk']) || {};
  out.chk = {
    day: typeof c['day'] === 'string' ? c['day'] : null,
    clean: ansNum(c['clean']),
    diffs: ansNum(c['diffs']),
    removed: ansNum(c['removed'])
  };
  for (const f of arr(m['find']) || []) {
    const F = rec(f);
    if (F)
      out.find.push({
        at: ansText(F['at']),
        key: ansText(F['key']),
        why: ansText(F['why']),
        mine: ansText(F['mine']),
        theirs: ansText(F['theirs'])
      });
  }
  out.devDay = typeof m['devDay'] === 'string' ? m['devDay'] : null;
  const ph = rec(m['ph']);
  if (ph && typeof ph['s'] === 'string') out.ph = { at: ansNum(ph['at']), len: ansNum(ph['len']), s: ph['s'] };
  return out;
}
/** Writes the notes, only while the log's own save succeeds: notes saved ahead of the log would describe a log the phone does not hold. Notes not written (the phone is full) are made again from the account at the next start. */
export function notesOut(N: Notes, own = true): void {
  if (!device.ok) return;
  /* The notes were written since this pass read them, by another tab of this phone or by this tab's own count of a
     record a sync removed (rowsRemoved; a pass never runs in two tabs at once, oneTab): what was recorded is kept,
     never written over. */
  const stored = prefGet(ROWS_KEY);
  if (stored !== null && stored !== written) {
    const other = notesIn(N.acct, N.ep, stored);
    if (other) {
      N.chk.removed = Math.max(N.chk.removed, other.chk.removed);
      for (const f of other.find)
        if (!N.find.some(x => x.at === f.at && x.key === f.key && x.why === f.why)) {
          N.find.push(f);
          N.chk.diffs++;
          N.chk.clean = 0;
        }
      N.find.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
      while (N.find.length > FIND_MAX) N.find.shift();
    }
  }
  const rows: Record<string, string> = {};
  for (const k in N.rows) {
    const h = N.rows[k];
    if (h) rows[k] = heldText(h);
  }
  const text = JSON.stringify({ ...N, rows });
  // `own` false: written from outside a pass while one is under way (rowsRemoved). The pass must then find the stored notes are not the ones it read, and keep what this write recorded.
  if (text === stored) {
    if (own) written = text;
    return;
  }
  if (prefSet(ROWS_KEY, text) && own) written = text;
}
/** What the other parts of the rows forget with the notes: what they kept of the log and of the account. */
const forgets = new Set<() => void>();
/** Has `f` run wherever the notes are forgotten (rowsForget): a part of the rows above the notes forgets there what it kept of the log or the account. */
export function rowsOnForget(f: () => void): void {
  forgets.add(f);
}
/** Forgets the rows' notes and what was learnt of the account: wherever the document sync's notes stop describing the log on this phone (a sign-out, another account's log taken, the log replaced). A record the notes held and the new log lacks is then no deletion. */
export function rowsForget(): void {
  notes = null;
  written = null;
  // What was learnt of the account before is not known of the one the notes will next describe (its layout, kept on the phone by account, is read again).
  off = null;
  blocked = false;
  layoutFor = null;
  asked = null;
  for (const f of forgets) f();
  // Notes storage would not forget name the log they were for, and are not read for another.
  prefDel(ROWS_KEY);
}
/** Notes a finding for Diagnostics, the newest kept. */
export function found(N: Notes, key: string, why: string, mine: string, theirs: string): void {
  N.find.push({ at: new Date().toISOString(), key, why, mine, theirs });
  while (N.find.length > FIND_MAX) N.find.shift();
  N.chk.diffs++;
  N.chk.clean = 0;
}

/* ---------- the account's answers ---------- */

/** The layout an answer carries: the id made when the account's rows began, which layer decides, and the level of build it asks for. */
function layoutOf(v: unknown): { made: string | null; decides: string; level: number } | null {
  if (typeof v !== 'string') return null;
  let L: Rec | null = null;
  try {
    L = rec(parseJson(v));
  } catch (e) {
    // A layout that is not JSON is read as none; the next write makes it.
    log('rows-layout', e);
  }
  if (!L) return null;
  // What cannot be read is read as more than this build knows, never as nothing asked: the phone stops and says to update.
  const lv = L['level'];
  return {
    made: typeof L['made'] === 'string' ? L['made'] : null,
    decides: L['decides'] === undefined ? 'docs' : typeof L['decides'] === 'string' ? L['decides'] : '?',
    level: lv === undefined ? 1 : typeof lv === 'number' && Number.isFinite(lv) && lv >= 1 ? lv : Infinity
  };
}
/** Whether a layout is one this build cannot sync by: the rows decide, or it asks for a newer build. */
const needsNewer = (L: { decides: string; level: number } | null): boolean =>
  !!L && (L.decides !== 'docs' || L.level > LEVEL);

/** Takes what the account's rows changed since the notes' number into the notes, each changed row of a kind this
    build mirrors noted as waiting from now; false when the account has no rows table. A phone with no notes reads
    the list, without the copies, so a second phone does not read the whole log to find it already there. */
export async function takeIn(R: CloudRows, N: Notes): Promise<boolean> {
  /** Notes one row of an answer; its change number. */
  const note = (x: unknown): number => {
    const X = rec(x);
    if (!X || typeof X['kind'] !== 'string' || typeof X['id'] !== 'string') return 0;
    const k = keyOf(X['kind'], X['id']),
      h = heldOf(X);
    if (!sameHeld(N.rows[k], h)) {
      /* Noted here, wherever a read brings a changed row in, and not by the pass that asked: a pass that ends before
         it compares (the lifter changed something meanwhile), the workout row's second try and the daily check's
         remake all read rows too, and the next pass must still leave those rows alone. */
      if (MIRRORED.has(X['kind'])) N.wait[k] ??= Date.now();
    }
    N.rows[k] = h;
    return ansNum(X['seq']);
  };
  const none = (): boolean => N.n === 0 && !Object.keys(N.rows).length;
  let p = rec(await soon(none() ? R.pull(PAST_ALL, 1) : R.pull(N.n, PAGE)));
  if (!p) return false;
  const L = layoutOf(p['layout']);
  heed(L);
  // The account restored from a copy, or its rows begun again: every row is read again.
  if (!none() && (ansNum(p['top']) < N.n || (N.made !== null && (!L || L.made !== N.made)))) {
    N.rows = {};
    N.wait = {};
    N.n = 0;
  }
  N.made = L ? L.made : null;
  if (none()) {
    let at = 0;
    for (;;) {
      const page: unknown[] | null = arr(await soon(R.list(at, PAGE)));
      if (!page) return false;
      let last = at;
      for (const x of page) last = Math.max(last, note(x));
      // A full page that does not move the number on is not the account's list: read no further.
      const moved = last > at;
      at = last;
      if (page.length < PAGE || !moved) break;
    }
    N.n = at;
    return true;
  }
  for (;;) {
    const rows = arr(p['rows']) || [];
    let last = N.n;
    for (const x of rows) last = Math.max(last, note(x));
    if (rows.length < PAGE || last === N.n) {
      N.n = last;
      break;
    }
    N.n = last;
    p = rec(await soon(R.pull(N.n, PAGE)));
    if (!p) return false;
  }
  return true;
}
/** Sends rows, in writes of WRITE_ROWS and WRITE_BYTES at most, and takes each answer into the notes: false when the account has no rows table. `sums`: the checksum already worked out for a row's copy, by key, so a long log is not read twice. */
export async function send(R: CloudRows, N: Notes, rows: RowIn[], sums?: Map<string, string>): Promise<boolean> {
  let at = 0;
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
    const ans = rec(await soon(R.push(part)));
    if (!ans) return false;
    const L = layoutOf(ans['layout']);
    heed(L);
    if (L && L.made && !N.made) N.made = L.made;
    let own = 0;
    for (const x of arr(ans['rows']) || []) {
      const X = rec(x);
      if (!X || typeof X['kind'] !== 'string' || typeof X['id'] !== 'string') continue;
      const k = keyOf(X['kind'], X['id']);
      const h = heldOf(X);
      N.rows[k] = h;
      if (X['took'] === true && ansNum(X['seq']) > N.n) own++;
      // The account's checksum of a copy it took as sent is the checksum of the text sent, or the copy did not arrive whole.
      const sentRow = part.find(r => r.kind === X['kind'] && r.id === X['id']);
      if (X['took'] === true && X['body'] === undefined && sentRow && sentRow.body !== null && h.s) {
        const s = sums?.get(k) ?? sumOf(sentRow.body);
        if (s !== h.s && h.t === sentRow.t && h.dev === sentRow.dev && h.a === sentRow.a)
          found(N, k, 'the account holds another checksum than the copy sent', s, h.s);
      }
    }
    // Every change the account numbered since the notes' number is one of this write's: the notes are at its last number, and the next read starts there, not at these rows again.
    const top = ansNum(ans['top']);
    if (top - N.n === own) N.n = top;
  }
  return true;
}

/* ---------- the notes, for the other parts of the rows ---------- */

/** The notes for this account and log, as stored now: the notes are one phone's, shared by its tabs, and a tab acts on them as stored, not as it read them before another tab's pass. `read`: whether they were read again, so what a pass kept beside the notes it held is dropped with them. */
export function notesFor(acct: string, ep: number): { N: Notes; read: boolean } {
  const stored = prefGet(ROWS_KEY);
  let read = false;
  if (!notes || notes.acct !== acct || notes.ep !== ep || stored !== written) {
    notes = notesIn(acct, ep, stored) || fresh(acct, ep);
    written = stored;
    read = true;
  }
  return { N: notes, read };
}
/** Counts `n` records the document sync took out of the log, in the notes as stored (another tab's pass may have written them since this tab read them). `busy`: a pass is under way in this tab, and keeps the count when it writes (notesOut). */
export function notesRemoved(acct: string, ep: number, n: number, busy: boolean): void {
  const stored = prefGet(ROWS_KEY);
  const N = notesIn(acct, ep, stored);
  if (!N || !N.n) return;
  N.chk.removed += n;
  if (!busy) {
    notes = N;
    written = stored;
  }
  notesOut(N, !busy);
}
/** The notes in memory; null before a pass read them for this account and log. */
export const notesNow = (): Notes | null => notes;
/** Starts the rows' notes with what the document sync tells the rows (Ctx). */
export function ctxSet(c: Ctx): void {
  ctx = c;
}
/** What the document sync told the rows at start; null before it did. */
export const ctxNow = (): Ctx | null => ctx;
/** Why the rows are off until the app is opened again; null while they are on. */
export const offWhy = (): string | null => off;
/** Turns the rows off until the app is opened again, for the reason given. */
export function turnOff(why: string): void {
  off = why;
}
/** Whether the account's layout, as an answer last said, asks for a build newer than this one. */
export const blockedNow = (): boolean => blocked;
/** Whether a read of the layout is under way (rowsGate). */
export const gateBusy = (): boolean => asking > 0;

/** Reads the account's layout before the documents are synced: whether the account is one this build cannot sync (its rows decide, or it asks for a newer build). A read that fails says nothing, and the sync goes on as a build that knows no rows does. */
export function rowsGate(): Promise<boolean> {
  const p = gate();
  asked = p;
  void p.finally(() => {
    if (asked === p) asked = null;
  });
  return p;
}
async function gate(): Promise<boolean> {
  const R = cloud.db && cloud.db.rows;
  // Asked even while the rows are off after a failure: a build that must stop syncing must learn it whatever else failed.
  if (!R || off === NO_TABLE) return false;
  asking++;
  try {
    const p = rec(await soon(R.pull(PAST_ALL, 1)));
    if (!p) {
      off = NO_TABLE;
      return false;
    }
    heed(layoutOf(p['layout']));
  } catch (e) {
    log('rows-gate', e);
  } finally {
    asking--;
  }
  return blocked;
}
/** Whether the account's layout asks for a build newer than this one, as last read: this visit, or by an earlier one (kept on the phone for the account). */
export function rowsBlocked(): boolean {
  if (layoutFor !== cloud.uid && cloud.uid && cloud.db && cloud.db.rows) {
    layoutFor = cloud.uid;
    layoutText = prefGet(LAYOUT_KEY);
    let L: Rec | null = null;
    try {
      L = rec(parseJson(layoutText || 'null'));
    } catch (e) {
      // A kept layout that cannot be read is no layout: the account is asked.
      log('rows-layout', e);
    }
    blocked = !!L && L['acct'] === cloud.uid && needsNewer(layoutOf(layoutText));
  }
  return blocked;
}
/** The read of the layout under way, if one is: a send of the documents that follows a read of them waits for it, so a build the account asks more of sends nothing while the answer is on its way. Null when none is under way, and the send then goes on in the same stretch of work as before the rows. */
export const rowsAsked = (): Promise<unknown> | null => asked;
