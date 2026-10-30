/* Problem reports (PENDING 58, reworked in r25; moved from the legacy
   script's 14-account.js and 27-actions.js in r63). The menu and an
   exercise's ⋯ menu open one sheet (sheetsaccount.ts): a problem, a
   question or a suggestion, one text box, an optional screenshot, and what a
   report needs to be acted on without asking the person anything technical:
   build, device, screen size, which screen they came from, whether a
   session was open, sync status and the last 10 logged errors. Never the
   workouts. Replies go to the account's email. Signed in only (V's choice,
   r25), to keep spam out, with limits the database enforces too: 10 to
   1,000 characters, one image, 5 reports a day per account. Without a report
   service at all (the plain source file) the report is copied as text.

   r63 (PENDING 306): a send gets the time limit the sync has (NET_MS), so
   a request that never answers no longer leaves the sheet on Sending; and
   each report carries a key made on the phone (client_id), so a report sent
   again after its reply was lost is refused by the table as a repeat and
   read as sent, rather than made twice (and ticketed twice). */

import { APP_NAME, APP_VERSION, DISPLAY_VERSION, NET_MS } from './config';
import { andList, uid } from './util';
import { ACCENT0 } from './layout';
import { FB_CATS, FB_CTX_MAX, FB_DAY, FB_IMG_MB, FB_MAX, FB_MIN, FB_TITLE } from './feedback';
import { ENV, KEY, log, logBuf, prefGet, prefSet } from './storage';
import type { LogEntry } from './types';
import { arr, parseJson } from './records';
import { withTimeout } from './sync';
import { U, exName } from './live';
import { acct, cloud, state, ui } from './store';
import type { FeedbackModal, Modal } from './modals';
import { FB, codeOf, said } from './providers';
import type { Report } from './providers';
import { isStandalone } from './env';
import { closeModal, openModal, renderModal, rerenderKeepScroll } from './page';
import { toast } from './toast';
import { ML, EQL } from './library';
import type { Tap } from './workstate';

/** What a request with no answer within the time limit says, on the sheet that sent it. */
export const NO_ANSWER = 'No answer. Check your connection and try again.';

/** What a report past the day's limit is told, whether this phone or the database counted it (r65, the r63 audit's A-9: the account script said its own 5). */
const LIMIT_SAID = `You have sent ${FB_DAY} reports today. Try again tomorrow.`;

/** What a report says of the device and the log, at most: the browser's own name, the errors kept, and an error's words once the context is too large. */
const CTX = { device: 300, errors: 10, words: 100 } as const;
/** A day, in milliseconds (the reports sent in the last one). */
const DAY_MS = 864e5;
/** A screenshot as kept: its long side tried at each of these, in pixels, at each JPEG quality from the first down by the step to the last, until it fits in the characters allowed (r45, audit item 287, when each was also committed to the tickets repository for good; since r64 it is kept only with its report in the table and shown in the Inbox). */
const SHOT = { sides: [1280, 960, 720], q0: 0.72, qStep: 0.14, qMin: 0.3, chars: 500000 } as const;
/** A megabyte, in bytes. */
const MB = 1048576;
/** The reports the owner's inbox shows, newest first. */
const INBOX_N = 50;

/* Reports sent from this device in the last 24 hours (the database keeps
   the real count). */
const FB_SENT = KEY + '.fbSent';
/** The times of the reports sent from this device in the last day. */
function fbRecent(): number[] {
  const raw = prefGet(FB_SENT);
  let a: unknown = [];
  try {
    a = parseJson(raw || '[]');
  } catch (e) {
    // A damaged list counts nothing: the database keeps the real count.
    return [];
  }
  const cut = Date.now() - DAY_MS;
  return (arr(a) || []).map(t => Number(t)).filter(t => t > cut);
}

/** Whether the account signed in reads reports (the owner), checked again on each sign-in change; Settings shows the inbox when it does. */
export async function fbCheckReader(): Promise<void> {
  const F = FB();
  const was = !!acct.reader;
  try {
    acct.reader = !!(F && acct.user && typeof F.isReader === 'function' && (await F.isReader()));
  } catch (e) {
    log('feedback', e);
    acct.reader = false;
  }
  if (was !== acct.reader && ui.tab === 'settings' && !ui.modal) rerenderKeepScroll();
}

/** What a report says of the app, the device and the log, never the workouts: the build, the device and screen, the look, where it was sent from, the session open, the account and sync, the counts, and the last errors logged. */
interface FbContext {
  build: string;
  version: string;
  env: string;
  at: string;
  device: string;
  screen: string;
  installed: boolean;
  theme: string;
  accent: string;
  unit: string;
  from: string;
  exercise: string | undefined;
  session: { past: boolean; free: boolean; editing: boolean; exercises: number } | null;
  signedIn: boolean;
  sync: string;
  crash: boolean | undefined;
  counts: { sessions: number; routines: number } | null;
  errors: (Omit<LogEntry, 's'> & { s?: string | undefined })[];
}
/** What a report says of the app, the device and the log. */
export function fbContext(m: {
  from?: string | undefined;
  ex?: string | null | undefined;
  crash?: boolean | undefined;
}): FbContext {
  // A report about a crash must survive the crash (r47): each field that reads the log is guarded, so a save that cannot be read still sends what the rest knows.
  const safe = <T>(f: () => T, alt: T): T => {
    try {
      return f();
    } catch (e) {
      // The field reads as its stand-in, and the rest of the report goes.
      return alt;
    }
  };
  const d = safe(() => state.draft, null);
  const ctx: FbContext = {
    build: APP_VERSION,
    version: DISPLAY_VERSION,
    env: ENV,
    at: new Date().toISOString(),
    device: String(navigator.userAgent || '').slice(0, CTX.device),
    screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio || 1}x`,
    installed: isStandalone(),
    theme: state.settings.theme,
    accent: state.settings.accent || ACCENT0,
    unit: U(),
    from: m.from || ui.tab,
    exercise: m.ex || undefined,
    session: d ? { past: !!d.past, free: !!d.free, editing: !!d.editingId, exercises: d.ex.length } : null,
    signedIn: !!acct.user,
    sync: cloud.on ? cloud.status : 'off',
    crash: m.crash || undefined,
    counts: safe(
      () => ({ sessions: state.sessions.filter(x => !x.demo).length, routines: state.routines.length }),
      null
    ),
    errors: logBuf.slice(-CTX.errors)
  };
  /* The feedback table refuses a context over 20,000 bytes (SUPABASE.md, Part 4),
     and that would refuse the whole report. Ten errors with their stacks fit in
     plain text, but not if a message is in a script of 3 or 4 bytes a
     character, so the oldest errors go first until it fits with room to spare. */
  const bytes = () => safe(() => new TextEncoder().encode(JSON.stringify(ctx)).length, 0);
  while (ctx.errors.length > 1 && bytes() > FB_CTX_MAX) ctx.errors.shift();
  if (bytes() > FB_CTX_MAX)
    ctx.errors = ctx.errors.map(({ s, ...x }) => ({ ...x, m: String(x.m).slice(0, CTX.words) }));
  return ctx;
}

/* A picked photo, shrunk to 1280 px on its long side as JPEG, so a report
   stays small enough to store (the table caps it): at most 500,000
   characters (about 370 KB), smaller sides before blurrier text. */
/** A picked image as a small JPEG data URL, or null when none fits. */
export function fbShrink(file: Blob): Promise<string | null> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let d: string | null = null;
        for (const side of SHOT.sides) {
          const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * k));
          c.height = Math.max(1, Math.round(img.naturalHeight * k));
          const g = c.getContext('2d');
          if (g) g.drawImage(img, 0, 0, c.width, c.height);
          for (let q: number = SHOT.q0; q > SHOT.qMin; q -= SHOT.qStep) {
            d = c.toDataURL('image/jpeg', q);
            if (d.length <= SHOT.chars) break;
          }
          if (d && d.length <= SHOT.chars) break;
        }
        URL.revokeObjectURL(url);
        res(d && d.length <= SHOT.chars ? d : null);
      } catch (e) {
        // Handed to the caller, which logs it and says the image could not be read.
        URL.revokeObjectURL(url);
        rej(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error('Not an image'));
    };
    img.src = url;
  });
}

/** The report sheet open, or null. */
const reportOpen = (): FeedbackModal | null => {
  const m = ui.modal;
  return m && m.kind === 'feedback' ? m : null;
};
/** The report's text field into the sheet, as typed (autofill and a paste do not always fire input events). */
function readText(m: FeedbackModal): void {
  for (const el of document.querySelectorAll('#modal [data-fbind]'))
    if (el instanceof HTMLTextAreaElement && el.dataset.fbind === 'msg') m.msg = el.value;
}
/** A report as text, for a message to the app owner: its title, the text, and what the app attaches. */
const asText = (cat: string, msg: string, ctx: unknown) =>
  `${APP_NAME}: ${FB_TITLE[cat] || FB_TITLE['bug']}\n\n${msg}\n\n${JSON.stringify(ctx, null, 1)}`;
/** Puts text on the clipboard; false when the browser refuses. */
async function copied(txt: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(txt);
      return true;
    }
  } catch (e) {
    // The browser refused the clipboard (no permission, not a tap): the text is shown to copy by hand.
  }
  return false;
}

/** The report sheet's taps, by data-act. */
export const REPORT_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  fbOpen(t) {
    const d = state.draft;
    const bi = t && t.dataset && t.dataset.b != null ? +t.dataset.b : null;
    const b = bi != null && d ? d.ex[bi] : null;
    const from = ui.tab === 'settings' ? ui.prevTab || 'settings' : ui.tab;
    const c = t && t.dataset ? t.dataset.cat : undefined;
    const cat = c && FB_TITLE[c] ? c : 'bug';
    /* From the crash screen (r47): the report opens written, with the error the
       screen shows, so one tap sends it; the context marks it a crash and
       carries the stack the log kept. Until r47 a crash reached the owner only
       if the lifter wrote it up by hand. */
    const crash = !!(t && t.dataset && t.dataset.crash);
    const last = crash ? logBuf.filter(x => x.a === 'render').slice(-1)[0] : null;
    const TABS: Record<string, string> = {
      today: state.draft ? 'Session' : 'Today',
      program: 'Plan',
      dash: 'Stats',
      history: 'History',
      settings: 'Settings'
    };
    const tabName = TABS[ui.tab] || ui.tab;
    const msg = crash ? `The app broke on the ${tabName} screen.${last ? ` Error: ${last.m}` : ''}` : '';
    openModal({
      kind: 'feedback',
      cat,
      msg,
      shot: null,
      from: crash ? 'crash' : ui.tab === 'today' && d ? 'session' : from,
      ex: b ? exName(b.exId) : null,
      crash: crash || undefined
    });
  },
  /* A lifter's own exercise stays in their log (r34). Suggesting it sends
     it to the owner as a report; the library changes only when the owner
     adds it in a build. */
  exSuggest() {
    const m = ui.modal;
    const e = m && m.kind === 'exEdit' ? state.exercises.find(x => x.id === m.e.id) : null;
    if (!e) return;
    const sec = (e.secondary || []).map(k => ML[k]).filter(Boolean);
    const msg =
      `Add to the library: ${e.name}. Main muscle: ${ML[e.primary] || e.primary}${sec.length ? `; also ${andList(sec)}` : ''}. Equipment: ${EQL[e.equip] || e.equip}${e.perSide ? ', one side at a time' : ''}${e.bw ? ', bodyweight' : ''}${e.timed ? ', timed' : ''}.${e.note ? ` Note: ${e.note}` : ''}`.slice(
        0,
        FB_MAX
      );
    openModal({ kind: 'feedback', cat: 'idea', msg, shot: null, from: 'library', ex: e.name });
  },
  // Signed out: the report as text for a message, without sending anything.
  async fbCopy() {
    const m = reportOpen();
    if (!m) return;
    // A report opened from the crash screen is already written (r47), so the copy carries it.
    const txt = asText(m.cat, m.msg && m.msg.trim() ? m.msg.trim() : '(Write it here)', fbContext(m));
    if (!(await copied(txt))) {
      closeModal();
      openModal({
        kind: 'text',
        title: 'Report details',
        help: 'Copy this into a message to the app owner, with what happened.',
        text: txt,
        readonly: true
      });
      return;
    }
    m.sent = true;
    m.copied = true;
    renderModal();
  },
  fbCat(t) {
    const m = reportOpen();
    if (!m) return;
    readText(m);
    m.cat = t.dataset.v || 'bug';
    renderModal();
  },
  fbShotDel() {
    const m = reportOpen();
    if (!m) return;
    m.shot = null;
    renderModal();
  },
  async fbSend() {
    const m = reportOpen();
    if (!m || m.busy) return;
    readText(m);
    const msg = String(m.msg || '')
      .trim()
      .slice(0, FB_MAX);
    const reply = (acct.user && acct.user.email) || '';
    if (msg.length < FB_MIN) {
      m.err = `A few more words, please (${FB_MIN} characters or more).`;
      renderModal();
      return;
    }
    const F = FB();
    if (F && fbRecent().length >= FB_DAY) {
      m.err = LIMIT_SAID;
      renderModal();
      return;
    }
    // The key is made once per sheet, so the same report sent again carries the same key (PENDING 306).
    if (!m.cid) m.cid = uid();
    const fb: Report = {
      category: FB_CATS.some(([k]) => k === m.cat) ? m.cat : 'bug',
      message: msg,
      reply_to: reply || null,
      screenshot: m.shot || null,
      context: fbContext(m),
      client_id: m.cid
    };
    if (!F) {
      // No report service here: the report as text, to paste into a message.
      const txt = asText(fb.category, msg, fb.context);
      if (!(await copied(txt))) {
        closeModal();
        openModal({
          kind: 'text',
          title: 'Feedback',
          help: 'Copy this and send it to the app owner.',
          text: txt,
          readonly: true
        });
        return;
      }
      m.sent = true;
      m.copied = true;
      m.dirty = false;
      renderModal();
      return;
    }
    m.busy = true;
    m.err = '';
    renderModal();
    try {
      await withTimeout(F.send(fb), NET_MS, 'feedback-late');
      // The database still counts when this device cannot keep the time.
      prefSet(FB_SENT, JSON.stringify([...fbRecent(), Date.now()]));
      if (ui.modal === m) {
        m.sent = true;
        m.dirty = false;
      }
    } catch (e) {
      log('feedback', e);
      if (ui.modal === m)
        m.err =
          codeOf(e) === 'timeout'
            ? NO_ANSWER
            : codeOf(e) === 'limit'
              ? LIMIT_SAID
              : said(e, 'Could not send. Try again.');
    } finally {
      if (ui.modal === m) {
        m.busy = false;
        renderModal();
      }
    }
  },
  async fbInbox() {
    const F = FB();
    if (!F || typeof F.inbox !== 'function') return;
    const m: Modal = { kind: 'fbInbox', items: null };
    openModal(m);
    try {
      const it = await withTimeout(F.inbox(INBOX_N), NET_MS, 'feedback-late');
      if (ui.modal === m) {
        m.items = it;
        renderModal();
      }
    } catch (e) {
      log('feedback', e);
      if (ui.modal === m) {
        m.err = codeOf(e) === 'timeout' ? NO_ANSWER : said(e, 'Could not load feedback.');
        renderModal();
      }
    }
  },
  diagCopy() {
    const t = JSON.stringify(
      {
        build: APP_VERSION,
        version: DISPLAY_VERSION,
        cloud: { on: cloud.on, status: cloud.status, err: cloud.err, last: cloud.last },
        log: logBuf
      },
      null,
      1
    );
    openModal({
      kind: 'text',
      title: 'Diagnostics',
      help: 'Copy this and paste it into a bug report. It holds errors and sync status, not your workouts.',
      text: t,
      readonly: true
    });
  }
};

/** The report's text typed: kept on the sheet, marked as typed (a tap outside keeps it), and counted. True when it was the report's field. */
export function reportInput(t: EventTarget | null): boolean {
  const m = reportOpen();
  if (!m || !(t instanceof HTMLTextAreaElement) || t.dataset.fbind !== 'msg') return false;
  m.msg = t.value;
  m.dirty = true;
  const c = document.getElementById('fbCount');
  if (c) c.textContent = `${t.value.length} / ${FB_MAX}`;
  return true;
}

/** A screenshot picked: refused when too large or not an image, else shrunk and put on the sheet. True when it was the report's picker. */
export function reportChange(t: EventTarget | null): boolean {
  const m = reportOpen();
  if (!(t instanceof HTMLInputElement) || t.id !== 'fbShot' || !t.files || !t.files[0] || !m) return false;
  const f0 = t.files[0];
  if (f0.size > FB_IMG_MB * MB) {
    toast(`That image is over ${FB_IMG_MB} MB. Try a screenshot instead.`);
    t.value = '';
    return true;
  }
  if (f0.type && !/^image\//.test(f0.type)) {
    toast('Only an image can be attached.');
    t.value = '';
    return true;
  }
  fbShrink(f0).then(
    d => {
      if (ui.modal !== m) return;
      if (!d) {
        toast('That picture is too large');
        return;
      }
      m.shot = d;
      m.dirty = true;
      renderModal();
    },
    (e: unknown) => {
      log('feedback', e);
      toast('Could not read that image. Try a screenshot (PNG or JPG).');
    }
  );
  t.value = '';
  return true;
}
