/* The toast: one message at the foot of the page, with Undo when the
   change it reports can be undone. Undo's steps are kept in storage.ts, not
   in the toast, which only offers the newest.

   One rule for every message (V 2026-11-10, after a note about pull-ups
   over "is ready": "Should there not be a general system architect level
   rule"): one tap, one message, and nothing lost.
     - What one tap says is joined into one message, never one over another:
       a message raised before the lifter's next touch, click or key, in the
       same task as the last or one it set off (a setTimeout of 0 after it,
       as Discard's "is back"), is added to it. Read by tasks, not by time,
       so it holds on a slow phone and under a test's fixed clock. Each
       replacing the one before, of two messages from one tap only the last
       would be seen ("Pull-up added to Day 1" under the bodyweight note,
       "Band Face Pull added to Day 1" under "created and added", and of a
       sync's notes only the last).
     - News about the log from storage and sync (kind 'notice', which
       main.ts gives every message storage and sync raise), and a note the
       app says once on its own, are never lost: one raised while a tap's
       message, other news not yet read, or a sheet shows waits its turn, and
       one covered by a tap's message or a sheet before NOTICE_READ_MS comes
       back once that has gone. A sheet is the lifter busy with something
       else, so news never shows over it. A tap's message is never held back:
       it answers what the lifter just did, a tap in a sheet included.
     - A note the app says once on its own (noteOnce) waits for a calm
       moment: no message and no sheet showing. A sheet opening over it
       sends it away, and a note gone before it could be read is said
       another time rather than counted as said. */

import { nameLastStep } from './act';

/** How long a toast stays, in milliseconds: one that offers Undo, one that does not, and at the least for each word it
    says, so a long one is read to its end (a convention, docs/EVIDENCE.md). */
const TOAST_MS = { undo: 6000, plain: 2600, word: 300 } as const;
/** How long a message stays: the time it is given, and never less than its words take to read. */
function stayMs(msg: string, ms: number): number {
  return Math.max(ms, msg.split(/\s+/).filter(Boolean).length * TOAST_MS.word);
}
/** How long news about the log must have shown before a tap's message may cover it for good (milliseconds). */
const NOTICE_READ_MS = 4000;

/** The message showing: its parts, whether one offers Undo, whether one marks a record, is news or a note said once, when it showed, and how long it stays. */
interface Showing {
  parts: string[];
  undo: boolean;
  pr: boolean;
  notice: boolean;
  once: boolean;
  at: number;
  ms: number;
}
/** How often a note said once looks again for a calm moment, in milliseconds. */
const CALM_MS = 500;
/** A message waiting its turn: news about the log, held while a tap's message shows. */
interface Waiting {
  msg: string;
  ms: number;
}

let toastT: ReturnType<typeof setTimeout> | undefined;
let cur: Showing | null = null;
let waiting: Waiting[] = [];
let tapSince = true;
let watching = false;
/* Whether the task that showed the message showing, or one it set off, is still running: closed by a timer of 0,
   which runs after the timers that task set before it, so their messages join. */
let sameTask = false;
let taskT: ReturnType<typeof setTimeout> | undefined;
/** Marks the message just shown or joined as this task's, until the task and what it set off are done. */
function openTask(): void {
  sameTask = true;
  clearTimeout(taskT);
  taskT = setTimeout(() => {
    sameTask = false;
  }, 0);
}
const box = (): HTMLElement | null => document.getElementById('toast');
// A sheet open over the page.
const sheetOpen = (): boolean => {
  const m = document.getElementById('modal');
  return !!m && !m.hidden;
};
const now = (): number => performance.now();

/* A touch, click or key is the lifter moving on: the next message starts its own, rather than joining the last.
   Listened for from the first message, in the capture phase, so no handler's stopPropagation hides it. */
function watchTaps(): void {
  if (watching) return;
  watching = true;
  const moved = (): void => {
    tapSince = true;
  };
  for (const t of ['pointerdown', 'keydown', 'touchstart'])
    document.addEventListener(t, moved, { capture: true, passive: true });
  // A sheet opening sends news showing back to wait; one closing lets the news waiting show.
  const m = document.getElementById('modal');
  if (m) new MutationObserver(sheetMoved).observe(m, { attributes: true, attributeFilter: ['hidden'] });
}

/* News showing when a sheet opens goes, and comes back after it unless it was read; when the sheet closes, the news
   waiting shows. */
function sheetMoved(): void {
  const el = box();
  if (!el) return;
  if (!sheetOpen()) {
    if (el.hidden) next(el);
    return;
  }
  if (el.hidden || !cur || cur.undo || !(cur.notice || cur.once)) return;
  if (cur.notice && now() - cur.at < NOTICE_READ_MS) backToWait(cur);
  clearTimeout(toastT);
  el.hidden = true;
  cur = null;
}

// News covered before it was read waits again, first in line, for the time it had left.
function backToWait(c: Showing): void {
  const left = joined(c.parts);
  if (!waiting.some(w => w.msg === left))
    waiting.unshift({ msg: left, ms: Math.max(TOAST_MS.plain, c.ms - (now() - c.at)) });
}

/* A part ends with a full stop when another follows it, so a message joined from two or more parts reads as
   sentences. */
const joined = (parts: readonly string[]): string =>
  parts.map((p, i) => (i < parts.length - 1 && !/[.!?:]$/.test(p) ? p + '.' : p)).join(' ');

/** Draws the message showing, and sets when it goes. */
function draw(el: HTMLElement): void {
  if (!cur) return;
  const c = cur;
  el.classList.toggle('pr', c.pr);
  /* Made as nodes, its words as text, rather than drawn by lit-html: what
     shows here is replaced whole each time, and a toast emptied by anything
     else (a suite clears it between checks) must not stop the next one. */
  const say = document.createElement('span');
  say.textContent = joined(c.parts);
  const parts: Node[] = [say];
  if (c.undo) {
    const b = document.createElement('button');
    b.dataset.act = 'undo';
    b.textContent = 'Undo';
    parts.push(b);
  }
  el.replaceChildren(...parts);
  // Whose message it is, read by the suites: the lifter's tap, news about the log, or a note the app says once.
  el.dataset.by = c.notice ? 'news' : c.once ? 'note' : 'tap';
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => gone(el), Math.max(0, c.at + c.ms - now()));
}

/** The message showing has had its time: it goes, and news waiting its turn shows. */
function gone(el: HTMLElement): void {
  el.hidden = true;
  cur = null;
  next(el);
}

/** Shows the next news waiting, if any and no sheet is open. */
function next(el: HTMLElement): void {
  if (sheetOpen()) return;
  const w = waiting.shift();
  if (!w) return;
  cur = { parts: [w.msg], undo: false, pr: false, notice: true, once: false, at: now(), ms: w.ms };
  tapSince = false;
  draw(el);
}

/** Shows a toast: the message, whether it offers Undo, for how long (its default when not given), and its kind ('pr' marks a record, 'notice' is news about the log from storage or sync). */
export function toast(msg: string, undo?: boolean | null, ms?: number | null, kind?: string): void {
  const el = box();
  if (!el) return;
  watchTaps();
  // The message names the change's Undo step, so Undo can later say what it took back.
  if (undo) nameLastStep(msg);
  const notice = kind === 'notice';
  const t = now();
  const len = stayMs(msg, ms || (undo ? TOAST_MS.undo : TOAST_MS.plain));
  const showing = !el.hidden && cur ? cur : null;
  // Part of the same tap: added to the message showing, which stays for the longer of the two.
  if (showing && !tapSince && sameTask) {
    if (!showing.parts.includes(msg)) showing.parts.push(msg);
    showing.undo = showing.undo || !!undo;
    showing.pr = showing.pr || kind === 'pr';
    showing.notice = showing.notice || notice;
    // Long enough to read all it now says, from when it first showed.
    showing.ms = Math.max(showing.ms, t - showing.at + len, stayMs(joined(showing.parts), 0));
    openTask();
    draw(el);
    return;
  }
  // News while a tap's message, news not yet read, or a sheet shows: it waits for its turn.
  if (notice && (sheetOpen() || (showing && (!showing.notice || t - showing.at < NOTICE_READ_MS)))) {
    if (!waiting.some(w => w.msg === msg)) waiting.push({ msg, ms: len });
    return;
  }
  // A tap's message over news not yet read: the news comes back after it.
  if (!notice && showing && showing.notice && t - showing.at < NOTICE_READ_MS) backToWait(showing);
  cur = { parts: [msg], undo: !!undo, pr: kind === 'pr', notice, once: kind === 'once', at: t, ms: len };
  tapSince = false;
  openTask();
  draw(el);
}

/** Says a note the app tells once, at a calm moment (no message and no sheet showing), for `ms`; `read` hears, once it
    could have been read, whether it was still showing then, so a note covered early is said another time. */
export function noteOnce(msg: string, ms: number, read: (seen: boolean) => void): void {
  const el = box();
  if (!el) return;
  if (!el.hidden || sheetOpen()) {
    setTimeout(() => noteOnce(msg, ms, read), CALM_MS);
    return;
  }
  toast(msg, false, ms, 'once');
  setTimeout(() => read(!el.hidden && !!cur && cur.parts.includes(msg)), NOTICE_READ_MS);
}

/** The message showing and the news waiting its turn, in the order they show: what the lifter sees now and is still
    to be told, read by the suites (news is never lost, so a check reads it wherever it falls in line). */
export function toastPending(): string[] {
  const el = box();
  const now = el && !el.hidden && cur ? [joined(cur.parts)] : [];
  return [...now, ...waiting.map(w => w.msg)];
}

/* A note with nothing to undo goes when a session starts: the
   routine-ready note sat over the session title and Discard. News about
   the log stays: it is never lost (above). */
/** Hides the toast when it offers no Undo and is not news about the log. */
export function toastQuiet(): void {
  const el = box();
  if (el && !el.hidden && !el.querySelector('[data-act="undo"]') && !(cur && cur.notice)) {
    clearTimeout(toastT);
    gone(el);
  }
}

/** Hides the toast when it offers an Undo: a session saved has nothing left to undo from its own steps. */
export function undoToastHide(): void {
  const el = box();
  if (el && el.querySelector('[data-act="undo"]')) {
    clearTimeout(toastT);
    gone(el);
  }
}

/** Takes `msg` out of the message showing, the message going when nothing else is left in it (a PR said and no longer one). */
export function toastTakeBack(msg: string): void {
  const el = box();
  if (!el || el.hidden || !cur || !cur.parts.includes(msg)) return;
  cur.parts = cur.parts.filter(p => p !== msg);
  if (!cur.parts.length) {
    clearTimeout(toastT);
    gone(el);
  } else draw(el);
}

/** Hides the toast whatever it says (Undo done); news waiting its turn then shows. */
export function toastHide(): void {
  const el = box();
  if (!el) return;
  clearTimeout(toastT);
  gone(el);
}
