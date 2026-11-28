/* The app's own error log in the account (SUPABASE.md Part 9): what broke, on which build and screen, so the app's
   owner sees a fault no one reported. Only faults go: an uncaught error, a rejected promise, or an error thrown with a
   stack that is not the network's (netFault). Never anything of the log, the notes, a field's contents, a name or an
   email: the message and the stack are cut to a fixed shape first (shapeOf). Each error goes once a visit, at most
   MAX_VISIT a visit, only signed in and online, outside the sync's queue and never waited for; an error met before the
   account is known is held until it is, up to MAX_HELD. A failed send, or an account with no table for it, stops the
   sends for the visit, and that failure is kept on the phone under an area that is never sent. */

import { APP_VERSION, DISPLAY_VERSION, NET_MS } from './config';
import { rec } from './records';
import { acct, cloud, ui } from './store';
import { log, logCut, onLog } from './storage';
import { netFault } from './providers';

/** The area this module's own failures are kept under on the phone: never sent. */
const OWN = 'errlog';
/** The errors sent in one visit, and held before the account is known. */
const MAX_VISIT = 10,
  MAX_HELD = 10;
/** The longest message, the stack's lines and characters in all, the browser's description, the screen's name and the
    area's, in characters, as the table takes them. */
const MSG_MAX = 200,
  STACK_LINES = 4,
  STACK_MAX = 400,
  BROWSER_MAX = 160,
  SCREEN_MAX = 40,
  AREA_MAX = 24;
/** How much of the message a stack's first line is matched by, to tell one that repeats it. */
const REPEAT_LEN = 40;

/** One error as the account's table takes it. */
interface ErrRow {
  version: string;
  build: string;
  screen: string;
  area: string;
  message: string;
  stack: string;
  browser: string;
}

/** What was sent this visit, by the error's area, message and first stack line. */
const sent = new Set<string>();
/** Errors met before the account was known. */
const held: ErrRow[] = [];
/** Whether the sends stopped for this visit (a failure, or no table). */
let stopped = false;

/** A text cut to `n` characters, whole characters only (an emoji is two units, and half of one is no text). */
const cut = (t: string, n: number): string => Array.from(t).slice(0, n).join('');
/* Everything from the first quote mark of any kind to the last is the text an error quotes, and an engine parsing what
   the lifter typed quotes the lifter's own marks too: the span goes as one. */
const QUOTES = /['"`‘’“”«»]/;
/** A text with what it quotes taken out, any address cut to its path and any email address replaced. */
function scrub(t: string): string {
  let s = logCut(t);
  const first = s.search(QUOTES);
  if (first >= 0) {
    let last = -1;
    for (let i = s.length - 1; i > first; i--)
      if (QUOTES.test(s.charAt(i))) {
        last = i;
        break;
      }
    s = last > first ? s.slice(0, first) + '"..."' + s.slice(last + 1) : s.slice(0, first) + '"..."';
  }
  return s.replace(/[^\s@"]+@[^\s@"]+\.[^\s@"]+/g, '(email)');
}
/** The error as the table takes it (above), or null when it is not one the log sends. */
function shapeOf(area: string, err: unknown): ErrRow | null {
  if (area === OWN) return null;
  const E = rec(err);
  const stackText = E && typeof E['stack'] === 'string' ? E['stack'] : '';
  const fault = area === 'uncaught' || area === 'promise' || !!stackText;
  if (!fault || netFault(err)) return null;
  const raw = E && typeof E['message'] === 'string' ? E['message'] : typeof err === 'string' ? err : String(err);
  const message = cut(scrub(raw).trim(), MSG_MAX);
  if (!message) return null;
  // Chrome and Android repeat the error's name and its whole message on the stack's first line: it goes.
  let lines = stackText.split('\n').filter(l => l.trim());
  if (lines.length && raw && lines[0]?.includes(raw.slice(0, REPEAT_LEN))) lines = lines.slice(1);
  const stack = cut(
    lines
      .slice(0, STACK_LINES)
      .map(l => scrub(l.trim()))
      .join('\n'),
    STACK_MAX
  );
  const screen = cut([ui.tab, ui.modal ? ui.modal.kind : ''].filter(Boolean).join(' '), SCREEN_MAX) || 'start';
  const browser = typeof navigator !== 'undefined' ? cut(String(navigator.userAgent || ''), BROWSER_MAX) : '';
  return {
    version: DISPLAY_VERSION,
    build: APP_VERSION,
    screen,
    area: cut(area, AREA_MAX) || '?',
    message,
    stack,
    browser
  };
}
/** The account's error log where the phone is signed in and online; null where it is not, or the backend has none. */
function target(): { add(row: ErrRow): Promise<unknown> } | null {
  if (stopped || !cloud.on || !cloud.uid || !cloud.db) return null;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null;
  const E = cloud.db.errors;
  return E && typeof E.add === 'function' ? E : null;
}
/** Sends one error, never waited for: a failure stops the sends for this visit and is kept on the phone. */
function send(row: ErrRow): void {
  const T = target();
  if (!T || sent.size >= MAX_VISIT) return;
  const key = row.area + '\n' + row.message + '\n' + (row.stack.split('\n')[0] || '');
  if (sent.has(key)) return;
  sent.add(key);
  let t: ReturnType<typeof setTimeout> | undefined;
  void Promise.race([
    T.add(row),
    new Promise<never>((_, rej) => {
      t = setTimeout(() => {
        rej(new Error('errlog: no answer in time'));
      }, NET_MS);
    })
  ])
    .then(ans => {
      clearTimeout(t);
      // No table for it on this account (its SQL not run): nothing more is sent this visit.
      if (ans === null) stopped = true;
    })
    .catch((e: unknown) => {
      clearTimeout(t);
      stopped = true;
      log(OWN, e);
    });
}
/** Sends what was held until the account was known, once it is: called once the sync has the account in step. Held
    errors are dropped where the phone is signed out. */
export function errlogFlush(): void {
  if (acct.checked && !cloud.on) held.length = 0;
  if (!target()) return;
  while (held.length) {
    const row = held.shift();
    if (row) send(row);
  }
}
/** Starts the error log: every error the app records from now is looked at (above). Called once, at start. */
export function errlogStart(): void {
  onLog((area, err) => {
    const row = shapeOf(area, err);
    if (!row) return;
    if (target()) send(row);
    // Held only while the app does not yet know whether it is signed in; an error met signed out is never sent.
    else if (!stopped && !acct.checked && held.length < MAX_HELD) held.push(row);
  });
}
