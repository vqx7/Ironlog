/* One row per record of the log in the account (SUPABASE.md, Part 8), first phase: the account's documents (sync.ts)
   decide what the log is, and this module makes the account's rows say what the log says, record by record, after
   each sync of the documents, and checks once a day that they do. It never changes the log. It reads the document
   sync's notes and writes none of them; its own notes are under a key of their own and can be made again from the
   account at any time. Its requests run outside the document sync's queue, so a slow one never holds a send. A
   failure turns it off until the app is opened again and is said in Diagnostics.

   A row is a copy of one record with its version (when the lifter last edited it, on which device, and how many
   times the app has written it since) and, once deleted, a mark that names the copy it deleted. The account joins
   every write itself: the later version of the copy, the mark that names the later copy. So the same writes in any
   order end as the same row, and a phone can send what it holds again at any time. */

import { APP_VERSION, NET_MS } from './config';
import { hashStr, today, uid } from './util';
import { arr, parseJson, rec } from './records';
import type { Rec } from './records';
import { chunksOf, CORE_FIELDS } from './chunks';
import { canon, recordKey, storedJson } from './merge';
import { md5 } from './md5';
import { cloud, state } from './store';
import type { CloudRows, RowIn } from './store';
import { KEY, device, log, prefDel, prefGet, prefSet } from './storage';
import { photoHeld, photoNote, photoPending } from './photo';
import { codeOf } from './providers';

/** The key the rows' notes are saved under. */
const ROWS_KEY = KEY + '.rows';
/** The key the account's layout is kept under, so a build that must not sync knows it when the app is opened. */
const LAYOUT_KEY = ROWS_KEY + '.layout';
/** The level of sync a build has: 1 writes the rows beside the documents, which decide. An account whose layout asks for more is one this build cannot sync. */
const LEVEL = 1;
/** What a phone on a build that cannot sync its account says. */
export const ROWS_UPDATE = 'Update the app to keep saving to your account. Your log stays on this phone.';
/** The characters of the account's checksum the notes keep of each copy. */
const SUM_LEN = 12;
/** The rows of one read, and of one write; a write also stays under WRITE_BYTES of copies. */
const PAGE = 500,
  WRITE_ROWS = 200,
  WRITE_BYTES = 400000;
/** How long a record the account holds differently is left alone before the log's copy is sent over it (below), in milliseconds. */
const WAIT_MS = 60000;
/** The findings kept for Diagnostics. */
const FIND_MAX = 20;
/** A change number above any the account can hold: a read from it answers with the account's last number and layout alone. */
const PAST_ALL = Number.MAX_SAFE_INTEGER;
/** The base a time is written in, in the notes and in a finding. */
const B36 = 36;
/** The words of a row's line in the notes: one with a deletion mark, and one whose device or count of app writes is not the usual none. */
const WORDS_MARKED = 9,
  WORDS_NAMED = 4;
/** Why the rows are off on an account whose rows' SQL was never run: nothing is asked of it again this visit, and nothing is shown. */
const NO_TABLE = 'not set up';
/** The characters of an error kept as the reason the rows are off. */
const WHY_MAX = 120;
/** The last character a single UTF-16 unit holds. */
const UNIT_TOP = 0xffff;

/** The lists of the log whose records are rows, each with its rows' kind. */
const KIND: Readonly<Record<string, string>> = {
  sessions: 'session',
  cardio: 'cardio',
  bodyweights: 'bodyweight',
  measurements: 'measurement',
  routines: 'routine',
  exercises: 'exercise',
  injuries: 'injury'
};
/** The kinds this build writes rows of from the log's records: a row of any other kind is left as it is. */
const MIRRORED = new Set([...Object.values(KIND), 'setting', 'core', 'photo']);
/** The kinds Recently deleted holds. */
const TRASHED = new Set(['session', 'cardio', 'routine']);

/** The account's row as this phone last knew it: the copy's version, the first characters of the account's checksum of the copy ('' when it holds none), and its deletion mark, when it has one: the copy the mark names, whether it is for good, the day Recently deleted shows and whether it is a copy put aside. */
interface Held {
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
/** A record as the log holds it: its row's kind and id, where its time is kept (its document and its key there), the first characters of its copy's checksum, and where it is: in the log, or in Recently deleted with the day shown and whether it is a copy put aside. The profile photo, which is in no document, carries its copy and its time itself. */
interface Mine {
  kind: string;
  id: string;
  doc: string;
  rk: string;
  s: string;
  place: 'log' | 'trash';
  day?: string;
  clash?: boolean;
  photo?: boolean;
  at?: number;
}
/** Something the daily check or a write found, kept for Diagnostics: when, the record, what happened, and both sides as text. */
interface Finding {
  at: string;
  key: string;
  why: string;
  mine: string;
  theirs: string;
}
/** The rows' notes: whose account and which log they describe (the document notes' epoch), the id of the account's layout, the last change number read, each row as held, the records left alone since a time, the daily check, the findings, the day the device's own row was last written, and the profile photo's checksum with the edit time and length it was worked out for. */
interface Notes {
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
interface Ctx {
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
let running: Promise<void> | null = null;
let again = false;
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
const said = (e: unknown): string => {
  const m = rec(e)?.['message'];
  return typeof m === 'string' ? m : String(e);
};
/** A row's key in the notes: its kind and id. */
const keyOf = (kind: string, id: string): string => kind + '/' + id;
/** A request that gives up after the sync's wait for an answer. */
function soon<T>(p: Promise<T>): Promise<T> {
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
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** The first characters of a copy's checksum, as the notes keep it. */
const sumOf = (body: string): string => md5(body).slice(0, SUM_LEN);

/** A row as the account answers with it, as the notes keep it. */
function heldOf(x: Rec): Held {
  return {
    t: num(x['t']),
    dev: str(x['dev']),
    a: num(x['a']),
    s: str(x['sum']).slice(0, SUM_LEN),
    saw: x['gone_saw'] == null ? null : num(x['gone_saw']),
    sawDev: str(x['gone_saw_dev']),
    good: x['gone_good'] === true,
    day: str(x['gone_day']),
    clash: x['gone_clash'] === true
  };
}
/** Where a row says its record is: in the log, in Recently deleted, or deleted for good. */
function placeOf(h: Held): 'log' | 'trash' | 'good' {
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
function heldText(h: Held): string {
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
  out.n = num(m['n']);
  const rows = rec(m['rows']) || {};
  for (const k in rows) {
    const h = heldIn(rows[k]);
    // One row's note unreadable: none of them is trusted, and they are made again from the account.
    if (!h) return null;
    out.rows[k] = h;
  }
  const wait = rec(m['wait']) || {};
  for (const k in wait) if (typeof wait[k] === 'number') out.wait[k] = num(wait[k]);
  const c = rec(m['chk']) || {};
  out.chk = {
    day: typeof c['day'] === 'string' ? c['day'] : null,
    clean: num(c['clean']),
    diffs: num(c['diffs']),
    removed: num(c['removed'])
  };
  for (const f of arr(m['find']) || []) {
    const F = rec(f);
    if (F)
      out.find.push({
        at: str(F['at']),
        key: str(F['key']),
        why: str(F['why']),
        mine: str(F['mine']),
        theirs: str(F['theirs'])
      });
  }
  out.devDay = typeof m['devDay'] === 'string' ? m['devDay'] : null;
  const ph = rec(m['ph']);
  if (ph && typeof ph['s'] === 'string') out.ph = { at: num(ph['at']), len: num(ph['len']), s: ph['s'] };
  return out;
}
/** Writes the notes, only while the log's own save succeeds: notes saved ahead of the log would describe a log the phone does not hold. Notes not written (the phone is full) are made again from the account at the next start. */
function notesOut(N: Notes, own = true): void {
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
/** Forgets the rows' notes and what was learnt of the account: wherever the document sync's notes stop describing the log on this phone (a sign-out, another account's log taken, the log replaced). A record the notes held and the new log lacks is then no deletion. */
export function rowsForget(): void {
  notes = null;
  written = null;
  // What was learnt of the account before is not known of the one the notes will next describe (its layout, kept on the phone by account, is read again).
  off = null;
  blocked = false;
  layoutFor = null;
  asked = null;
  docSeen.clear();
  tried.clear();
  // Notes storage would not forget name the log they were for, and are not read for another.
  prefDel(ROWS_KEY);
}
/** Notes a finding for Diagnostics, the newest kept. */
function found(N: Notes, key: string, why: string, mine: string, theirs: string): void {
  N.find.push({ at: new Date().toISOString(), key, why, mine, theirs });
  while (N.find.length > FIND_MAX) N.find.shift();
  N.chk.diffs++;
  N.chk.clean = 0;
}

/* ---------- the log, record by record ---------- */

/** A document's records as last read, with the fingerprint of the document the account held then (the document sync's note): read again only when that changed. A pass compares only while the log's documents are the account's (pass), so the fingerprint names the log's own document. */
const docSeen = new Map<string, { h: string | undefined; recs: Mine[] }>();
/** A record's copy as the text its row holds: one text for one record whatever order its fields came in, so two phones holding the same record send the same bytes. */
const bodyOf = (x: unknown): string => canon(x);

/** One document's records, as rows. */
function recsOf(doc: string, D: Rec): Mine[] {
  const out: Mine[] = [];
  const live = new Set<string>();
  for (const list in KIND) {
    const kind = KIND[list];
    if (!kind) continue;
    for (const x of arr(D[list]) || []) {
      const R = rec(x);
      if (!R || typeof R['id'] !== 'string') continue;
      live.add(keyOf(kind, R['id']));
      out.push({ kind, id: R['id'], doc, rk: recordKey(list, R['id']), s: sumOf(bodyOf(R)), place: 'log' });
    }
  }
  if (doc !== 'core') return out;
  for (const x of arr(D['trash']) || []) {
    const R = rec(x);
    const kind = R ? str(R['kind']) : '';
    const data = R ? rec(R['data']) : null;
    // An entry for a record the log holds too is that record's own, read as in the log.
    if (!R || !data || typeof R['id'] !== 'string' || !TRASHED.has(kind) || live.has(keyOf(kind, R['id']))) continue;
    out.push({
      kind,
      id: R['id'],
      doc,
      rk: recordKey('trash', R['id']),
      s: sumOf(bodyOf(data)),
      place: 'trash',
      day: str(R['date']),
      clash: R['clash'] === true
    });
  }
  for (const k of CORE_FIELDS)
    if (k !== 'version')
      out.push({ kind: 'core', id: k, doc, rk: recordKey('', k), s: sumOf(bodyOf(D[k] ?? null)), place: 'log' });
  const set = rec(D['settings']) || {};
  for (const k in set)
    out.push({ kind: 'setting', id: k, doc, rk: recordKey('settings', k), s: sumOf(bodyOf(set[k])), place: 'log' });
  return out;
}
/** A turn of the page's event loop, between two stretches of work, so that reading a long log never holds a tap. */
const pause = (): Promise<void> =>
  new Promise(r => {
    setTimeout(r, 0);
  });
/** Reads the documents not yet read at their fingerprint, one a turn of the event loop: a visit's first pass reads
    the whole log (each record's text and its checksum), which in one stretch would be felt on a phone. A document is
    read only while its text is the one the account holds (its fingerprint is the sync note's), so what is kept under
    a fingerprint is that document's records and no later edit's. */
async function warm(): Promise<void> {
  const ch = chunksOf(state);
  for (const id in ch) {
    if (id === 'draft') continue;
    const h = cloud.meta[id]?.h;
    if (!h || docSeen.get(id)?.h === h) continue;
    // Read from the log as it is in this turn: an edit made during an earlier turn is in it, and then the fingerprint differs.
    const doc = chunksOf(state)[id];
    if (!doc || hashStr(storedJson(doc)) !== h) continue;
    docSeen.set(id, { h, recs: recsOf(id, doc) });
    await pause();
  }
}
/** Every record of the log (its documents `ch`) as a row, by key. Called only while each document is the one the account holds (pass), so a document read at its sync note's fingerprint is not read again. */
function mineNow(ch: Record<string, Rec>): Map<string, Mine> {
  const out = new Map<string, Mine>();
  for (const id of [...docSeen.keys()]) if (!(id in ch)) docSeen.delete(id);
  for (const id in ch) {
    if (id === 'draft') continue;
    const h = cloud.meta[id]?.h;
    let seen = docSeen.get(id);
    if (!seen || !h || seen.h !== h) {
      seen = { h, recs: recsOf(id, ch[id] || {}) };
      docSeen.set(id, seen);
    }
    for (const m of seen.recs) out.set(keyOf(m.kind, m.id), m);
  }
  return out;
}
/** The copy of record `m` as it is in the log's documents `ch` now; null when the log no longer holds it there. */
function copyOf(ch: Record<string, Rec>, m: Mine): string | null {
  if (m.photo) return JSON.stringify(photoHeld());
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
/** The time the documents hold for record `m`, 0 when they know none. */
function timeOf(m: Mine): number {
  if (m.at !== undefined) return m.at;
  const t = cloud.recAt[m.doc]?.[m.rk];
  return t !== undefined && t > 0 ? t : 0;
}
/** The keys of the records the lifter's log holds, in its lists or in Recently deleted: read before and after the document sync takes a copy in, to count what that took away (rowsRemoved). */
export function rowsLogKeys(): Set<string> {
  const out = new Set<string>();
  const S: Rec = state;
  for (const list of ['sessions', 'cardio', 'bodyweights', 'measurements', 'routines']) {
    const kind = KIND[list];
    for (const x of arr(S[list]) || []) {
      const R = rec(x);
      if (kind && R && typeof R['id'] === 'string') out.add(keyOf(kind, R['id']));
    }
  }
  for (const t of state.trash) out.add(keyOf(t.kind, t.id));
  return out;
}
/** Counts the records the document sync just took out of the log (in `before`, in neither the log nor Recently deleted now): on an account used on one phone there should be none. Not counted on a phone that has not yet mirrored this account: its first sync takes the account's log in place of what it held (a new phone's starter routine). */
export function rowsRemoved(before: Set<string>): void {
  if (!ctx || !cloud.uid || !cloud.db || !cloud.db.rows || off) return;
  const now = rowsLogKeys();
  let n = 0;
  for (const k of before) if (!now.has(k)) n++;
  if (!n) return;
  // Counted in the notes as stored (another tab's pass may have written them since this tab read them); a pass under way in this tab keeps the count when it writes (notesOut).
  const stored = prefGet(ROWS_KEY);
  const N = notesIn(cloud.uid, ctx.ep(), stored);
  if (!N || !N.n) return;
  N.chk.removed += n;
  if (!running) {
    notes = N;
    written = stored;
  }
  notesOut(N, !running);
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
async function takeIn(R: CloudRows, N: Notes): Promise<boolean> {
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
    return num(X['seq']);
  };
  const none = (): boolean => N.n === 0 && !Object.keys(N.rows).length;
  let p = rec(await soon(none() ? R.pull(PAST_ALL, 1) : R.pull(N.n, PAGE)));
  if (!p) return false;
  const L = layoutOf(p['layout']);
  heed(L);
  // The account restored from a copy, or its rows begun again: every row is read again.
  if (!none() && (num(p['top']) < N.n || (N.made !== null && (!L || L.made !== N.made)))) {
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
async function send(R: CloudRows, N: Notes, rows: RowIn[], sums?: Map<string, string>): Promise<boolean> {
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
      if (X['took'] === true && num(X['seq']) > N.n) own++;
      // The account's checksum of a copy it took as sent is the checksum of the text sent, or the copy did not arrive whole.
      const sentRow = part.find(r => r.kind === X['kind'] && r.id === X['id']);
      if (X['took'] === true && X['body'] === undefined && sentRow && sentRow.body !== null && h.s) {
        const s = sums?.get(k) ?? sumOf(sentRow.body);
        if (s !== h.s && h.t === sentRow.t && h.dev === sentRow.dev && h.a === sentRow.a)
          found(N, k, 'the account holds another checksum than the copy sent', s, h.s);
      }
    }
    // Every change the account numbered since the notes' number is one of this write's: the notes are at its last number, and the next read starts there, not at these rows again.
    const top = num(ans['top']);
    if (top - N.n === own) N.n = top;
  }
  return true;
}

/* ---------- one pass ---------- */

/** Whether the account's row says what the log says of a record: where it is, its copy, and its time or the day it was deleted. */
function inStep(m: Mine | undefined, h: Held | undefined): boolean {
  if (!m) return !h || placeOf(h) === 'good';
  if (!h || placeOf(h) !== m.place || h.s !== m.s) return false;
  // In the log: the same copy, and no later time for it in the documents than the row's (two phones that made the same edit: the row takes the later time, as the documents did).
  if (m.place === 'log') return timeOf(m) <= h.t;
  return h.day === (m.day || '') && h.clash === (m.clash === true);
}
/** The version a copy is sent with: the time the documents hold for it, the app's own write counted where that time has not moved; `over`: later than everything the account holds, for a copy the documents kept against the order of the times. */
function versionOf(t: number, h: Held | undefined, over: boolean): { t: number; dev: string; a: number } {
  if (over && h) return { t: Math.max(Date.now(), h.t + 1), dev: cloud.devId || '', a: 0 };
  if (h && t === h.t) return { t: h.t, dev: h.dev, a: h.a + 1 };
  return { t, dev: '', a: 0 };
}
/** Whether the account would take the log's copy of a record as it is sent, with the time the documents hold for it: the account holds none, an earlier one, or the same one. */
function takes(m: Mine | undefined, h: Held | undefined): boolean {
  if (!m || !h) return true;
  const t = timeOf(m);
  if (m.place === 'trash') return h.s === m.s || t >= h.t;
  return t > h.t || (t === h.t && placeOf(h) === 'log');
}
/** The row that makes the account say what the log (its documents `ch`) says of the record keyed `k`; null when there is nothing to send. */
function rowFor(
  ch: Record<string, Rec>,
  k: string,
  m: Mine | undefined,
  h: Held | undefined,
  over: boolean
): RowIn | null {
  const made = h ? { over_t: h.t, over_dev: h.dev } : {};
  if (!m) {
    // The log no longer holds it, in its lists or in Recently deleted: deleted for good, the mark naming the copy the account holds.
    if (!h) return null;
    const cut = k.indexOf('/');
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
      gone_t: Date.now(),
      gone_dev: cloud.devId || '',
      ...made
    };
  }
  const body = copyOf(ch, m);
  if (body === null) return null;
  const t = timeOf(m);
  if (m.place === 'log') {
    return { kind: m.kind, id: m.id, body, ...versionOf(t, h, over), ...made };
  }
  // In Recently deleted: the copy the account already holds keeps its version, and the mark names it.
  const v = h && h.s === m.s ? { t: h.t, dev: h.dev, a: h.a } : versionOf(t, h, over);
  return {
    kind: m.kind,
    id: m.id,
    body,
    ...v,
    gone_saw: v.t,
    gone_saw_dev: v.dev,
    gone_good: false,
    gone_t: over ? Date.now() : t || Date.now(),
    gone_dev: cloud.devId || '',
    gone_day: m.day || null,
    gone_clash: m.clash === true,
    ...made
  };
}
/** The profile photo as a record, when the phone holds no change to it still to send. Its checksum is kept in the notes with the photo's own edit time and length, and its text made and its checksum worked out again only when one of them moved: the photo is the one long copy. */
function photoMine(N: Notes): Mine | null {
  if (photoPending()) return null;
  const n = photoNote();
  const held = photoHeld();
  const at = n ? n.et : 0,
    len = held === null ? -1 : held.length;
  if (!N.ph || N.ph.at !== at || N.ph.len !== len) N.ph = { at, len, s: sumOf(JSON.stringify(held)) };
  return { kind: 'photo', id: 'photo', doc: 'photo', rk: '', s: N.ph.s, place: 'log', photo: true, at };
}
/** The log as rows now: its documents, each record of them by key, and whether the profile photo is among them. */
function logNow(N: Notes): { ch: Record<string, Rec>; mine: Map<string, Mine>; photo: boolean } {
  const ch = chunksOf(state);
  const mine = mineNow(ch);
  const photo = photoMine(N);
  // A phone with no photo, on an account with no photo row, has nothing to say of it.
  if (photo && (photoHeld() !== null || N.rows['photo/photo'])) mine.set('photo/photo', photo);
  return { ch, mine, photo: !!photo };
}
/** The keys to compare: every record of the log, and every row of a kind this build mirrors. */
function keysOf(N: Notes, L: { mine: Map<string, Mine>; photo: boolean }): Set<string> {
  const keys = new Set<string>(L.mine.keys());
  for (const k in N.rows) if (MIRRORED.has(k.slice(0, k.indexOf('/'))) && (L.photo || k !== 'photo/photo')) keys.add(k);
  return keys;
}

/** What was last sent as it stood for a record the account then did not take, by key: the same is not sent as it stands again (it waits, then goes over the account's). */
const tried = new Map<string, string>();
/** A record of the log as one line: where it is, its checksum, its time and its day. */
const mineText = (m: Mine | undefined): string =>
  m
    ? `${m.place} ${m.s} ${timeOf(m).toString(B36)}${m.place === 'trash' ? ' ' + (m.day || '') : ''}`
    : 'not in the log';

/** One pass: the log's records compared with the rows as the notes hold them and, where any differs, the account's
    rows read, compared again, and what still differs sent. A pass that finds nothing to do asks the account nothing. */
async function pass(): Promise<void> {
  const R = cloud.db && cloud.db.rows;
  const C = ctx;
  const acct = cloud.uid;
  if (!R || !C || !acct || !cloud.on || off || blocked || !device.ok) return;
  // Not in the stretch of work that ended the sync (this is called from there): the screen is drawn first.
  await pause();
  await warm();
  if (!cloud.on || cloud.uid !== acct) return;
  const ep = C.ep();
  const still = (): boolean => cloud.on && cloud.uid === acct && C.ep() === ep && !off && !blocked;
  // The documents are in step with the account: only then is the log what the rows should say.
  const quiet = (): boolean => cloud.status === 'synced' && !C.unsent();
  if (!quiet()) return;
  // The notes are one phone's, shared by its tabs: a tab acts on them as stored now, not as it read them before another tab's pass.
  const stored = prefGet(ROWS_KEY);
  if (!notes || notes.acct !== acct || notes.ep !== ep || stored !== written) {
    notes = notesIn(acct, ep, stored) || fresh(acct, ep);
    written = stored;
    tried.clear();
  }
  const N = notes;
  const day = today();
  let L = logNow(N);
  // A record that waited and now reads as its row does (the documents caught up) waits no longer.
  for (const k in N.wait)
    if (inStep(L.mine.get(k), N.rows[k])) {
      delete N.wait[k];
      tried.delete(k);
    }
  const differs = (): boolean => {
    for (const k of keysOf(N, L)) if (!inStep(L.mine.get(k), N.rows[k])) return true;
    return false;
  };
  const daily = N.chk.day !== day || N.devDay !== day;
  if (!N.made || daily || differs()) {
    if (!(await takeIn(R, N))) {
      off = NO_TABLE;
      return;
    }
    if (!still()) return;
    if (!N.made) {
      // The account's first rows: its layout, with an id of its own, so a copy restored later is known as one.
      const layout = JSON.stringify({ made: uid(), decides: 'docs', level: LEVEL, gen: 1, at: 0 });
      const row: RowIn = { kind: 'meta', id: 'layout', body: layout, t: Date.now(), dev: cloud.devId || '', a: 0 };
      if (!(await send(R, N, [row]))) {
        off = NO_TABLE;
        return;
      }
      if (!still()) return;
    }
    // The log may have moved while the account answered: it is read again, and compared only if still in step.
    if (!quiet()) {
      notesOut(N);
      return;
    }
    L = logNow(N);
    const now = Date.now();
    const out: RowIn[] = [];
    const sums = new Map<string, string>();
    const forced = new Set<string>();
    for (const k of keysOf(N, L)) {
      const m = L.mine.get(k),
        h = N.rows[k];
      if (inStep(m, h)) {
        delete N.wait[k];
        tried.delete(k);
        continue;
      }
      /* A row the account changed since this phone last agreed with it waits from the read that brought it in
         (takeIn): it may be ahead of the documents this phone holds (another phone writes the document first, then
         the row). So does one the account would not take as the log holds it (the account's copy is the later one).
         If it still differs a minute on, and after a whole read of the documents since, the documents did decide
         otherwise, and the log's state is sent over the account's. */
      const since = N.wait[k];
      const ripe = since !== undefined && now - since >= WAIT_MS && C.pulledAt() > since;
      /* Sent as it stands: a row this phone has not seen change since it last agreed with the log, which the account
         will take (the log moved, not the account); or, of a row that waits, only a copy the documents time later
         than the account's, once (the lifter changed it here since: the account is behind, not ahead). A record gone
         from the log, or one whose time is not later, is never sent over a row that waits before the wait is over. */
      const plain = since === undefined ? takes(m, h) : !!m && (!h || timeOf(m) > h.t) && tried.get(k) !== mineText(m);
      if (!plain && !ripe) {
        N.wait[k] ??= now;
        continue;
      }
      const r = rowFor(L.ch, k, m, h, !plain);
      if (!r) continue;
      out.push(r);
      if (m) sums.set(k, m.s);
      if (!plain) {
        forced.add(k);
        found(
          N,
          k,
          m
            ? 'the documents kept a copy the rows held a later version of; the log was sent over it'
            : 'the rows held a record the documents do not; it was marked deleted',
          mineText(m),
          h ? `${placeOf(h)} ${heldText(h)}` : 'no row'
        );
      }
    }
    if (out.length && !(await send(R, N, out, sums))) {
      off = NO_TABLE;
      return;
    }
    if (!still()) return;
    // What the account did not take as sent waits, as a row it changed does (above).
    for (const r of out) {
      const k = keyOf(r.kind, r.id);
      const m = L.mine.get(k);
      if (inStep(m, N.rows[k])) {
        delete N.wait[k];
        tried.delete(k);
        continue;
      }
      if (forced.has(k)) {
        const h = N.rows[k];
        found(N, k, 'the account did not take the copy sent over it', mineText(m), h ? heldText(h) : 'no row');
        N.wait[k] = Date.now();
      } else {
        tried.set(k, mineText(m));
        N.wait[k] ??= Date.now();
      }
    }
  }
  await draftRow(R, N);
  if (!still()) return;
  if (daily) {
    if (!Object.keys(N.wait).length && N.chk.day !== day) await check(R, N);
    if (!still()) return;
    await deviceRow(R, N);
  }
  if (still()) notesOut(N);
}
/** The workout in progress as its row: written over whatever the row holds (it changes with every tick, and the documents decide it). */
async function draftRow(R: CloudRows, N: Notes): Promise<void> {
  for (let n = 0; n < 2; n++) {
    const body = state.draft ? bodyOf(state.draft) : 'null';
    const h = N.rows['draft/draft'];
    if (h ? h.s === sumOf(body) : !state.draft) return;
    const row: RowIn = {
      kind: 'draft',
      id: 'draft',
      body,
      t: Math.max(cloud.editAt['draft'] || 0, h ? h.t + 1 : 1),
      dev: cloud.devId || '',
      a: 0,
      ...(h ? { over_t: h.t, over_dev: h.dev } : {})
    };
    try {
      await send(R, N, [row]);
      return;
    } catch (e) {
      // Another phone wrote the workout's row since this phone read it: its row is read, and this copy written over that.
      if (n || !/rows_draft_(stale|time)/.test(said(e))) throw e;
      if (!(await takeIn(R, N))) return;
    }
  }
}
/** Two texts in the order of their bytes, as the account orders them: by code point, which a comparison of UTF-16 units is not for characters past U+FFFF. */
function bytesCmp(a: string, b: string): number {
  if (a === b) return 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.codePointAt(i) ?? 0,
      y = b.codePointAt(i) ?? 0;
    if (x !== y) return x < y ? -1 : 1;
    if (x > UNIT_TOP) i++;
  }
  return a.length < b.length ? -1 : 1;
}
/** The daily check: the account's one checksum over all its rows against the same worked out from the notes. A difference means the notes are not the account's rows: they are made again, and it is said. */
async function check(R: CloudRows, N: Notes): Promise<void> {
  const d = rec(await soon(R.digest()));
  if (!d) return;
  // Rows changed since this pass read them: checked at the next pass.
  if (num(d['top']) !== N.n) return;
  const keys = Object.keys(N.rows).sort((a, b) => {
    const ca = a.indexOf('/'),
      cb = b.indexOf('/');
    return bytesCmp(a.slice(0, ca), b.slice(0, cb)) || bytesCmp(a.slice(ca + 1), b.slice(cb + 1));
  });
  const text = keys
    .map(k => {
      const h = N.rows[k];
      const cut = k.indexOf('/');
      return h
        ? [
            k.slice(0, cut),
            k.slice(cut + 1),
            h.t,
            h.dev,
            h.a,
            h.s,
            h.saw === null ? '' : h.saw,
            h.saw === null ? '' : h.sawDev,
            h.good ? 1 : 0
          ].join('\x1f')
        : '';
    })
    .join('\x1e');
  if (num(d['n']) === keys.length && str(d['sum']) === md5(text)) {
    if (N.chk.day !== today()) N.chk.clean++;
    N.chk.day = today();
    return;
  }
  found(
    N,
    '',
    'the notes were not what the account holds; they were made again',
    `${keys.length} rows`,
    `${num(d['n'])} rows`
  );
  N.chk.day = today();
  N.rows = {};
  N.n = 0;
  if (!(await takeIn(R, N))) off = NO_TABLE;
}
/** This phone's own row: its build, the level it syncs at, the day it was last here and how its checks stand. Written once a day at most. */
async function deviceRow(R: CloudRows, N: Notes): Promise<void> {
  const id = cloud.devId;
  if (!id || N.devDay === today()) return;
  const body = JSON.stringify({
    build: APP_VERSION,
    level: LEVEL,
    seen: today(),
    checked: N.chk.day,
    clean: N.chk.clean,
    diffs: N.chk.diffs,
    removed: N.chk.removed
  });
  if (await send(R, N, [{ kind: 'device', id, body, t: Date.now(), dev: id, a: 0 }])) N.devDay = today();
}

/* ---------- what the document sync calls ---------- */

/** Runs a pass in one tab of this phone at a time (Web Locks): two tabs hold one log and one set of notes, and two passes at once would each write the notes the other read. A tab that finds another's pass under way does nothing: that pass is mirroring the same log. Where the browser has no Web Locks the pass runs at once, as before them. */
async function oneTab(fn: () => Promise<void>): Promise<void> {
  const L = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!L || typeof L.request !== 'function') return fn();
  await L.request(ROWS_KEY, { ifAvailable: true }, async lock => {
    if (lock) await fn();
  });
}
/** Starts the rows: what the document sync tells them (Ctx). */
export function rowsStart(c: Ctx): void {
  ctx = c;
}
/** Runs a pass once the documents are in step with the account; one at a time, and again when asked while one runs. Never throws: a failure is logged and turns the rows off until the app is opened again. */
export function rowsSoon(): void {
  if (off || !cloud.on || !cloud.db || !cloud.db.rows) return;
  if (running) {
    again = true;
    return;
  }
  running = oneTab(pass)
    .catch((e: unknown) => {
      log('rows', e);
      // No answer, or a sign-in the sync itself will say is lost, is no fault of the rows: the next sync tries again. Anything else stops them for this visit.
      const c = codeOf(e);
      if (
        navigator.onLine !== false &&
        c !== 'timeout' &&
        c !== 'revoked' &&
        c !== 'gone' &&
        !/no answer in time|unavailable|offline|Failed to fetch|NetworkError|Load failed/i.test(said(e))
      )
        off = said(e).slice(0, WHY_MAX);
    })
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        rowsSoon();
      }
    });
}
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
/** The rows' state for Diagnostics: one line, and the findings kept. */
export function rowsDiag(): { line: string; findings: Finding[] } | null {
  if (!cloud.on || !cloud.db || !cloud.db.rows) return null;
  if (off === NO_TABLE) return null;
  if (off) return { line: `Rows check: off (${off})`, findings: notes ? notes.find : [] };
  if (blocked) return { line: 'Rows check: this account needs a newer version of the app', findings: [] };
  if (!notes) return { line: 'Rows check: not run yet', findings: [] };
  const c = notes.chk;
  const n = (k: number, one: string, many: string): string => `${k} ${k === 1 ? one : many}`;
  return {
    line: `Rows check: ${n(c.clean, 'clean day', 'clean days')}, ${n(c.diffs, 'difference', 'differences')}, ${c.removed} removed by a sync${Object.keys(notes.wait).length ? `, ${Object.keys(notes.wait).length} waiting` : ''}`,
    findings: notes.find
  };
}
/** Whether a pass is running or asked for: what the suites wait on. */
export const rowsBusy = (): boolean => !!running || again || asking > 0;
