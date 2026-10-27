/* The account flow (r63, from the legacy script's 14-account.js and
   27-actions.js): signing in, creating an account and confirming its email,
   a reset link and a new password, signing out, deleting the account, and
   the retries when the phone comes back online or to the front. The sheet is
   sheetsaccount.ts's; the account service is the build's
   (scripts/cloud-supabase.js, window.ironlogAuth).

   r63: every request the account sheet makes has the time limit the sync
   has (NET_MS, PENDING 309), so one that never answers leaves Signing in
   with words that say so; and the wait for the confirmation email is one
   typed state (PENDING 307): `wait` holds the email and the password while
   a new account waits, or is null, and `flight` says which request is out,
   a check of the wait or the code, in place of the email, password, busy,
   coding and timer kept side by side, which could say two things at once. */

import { APP_NAME } from './config';
import { ACCT_LATER, OB_ACCT, OB_OUT, KEY, log, prefDel, prefGet, prefSet, undoForget } from './storage';
import { parseJson, rec } from './records';
import { NET_MS, cloudFlush, cloudInit, cloudStop, cq, hasUnsent, withTimeout } from './sync';
import { normalize } from './normalize';
import { acct, cloud, setState, state, ui } from './store';
import type { AccountModal, AcctMode } from './modals';
import { AUTH, codeOf, said } from './providers';
import { isStandalone } from './env';
import { act } from './act';
import { closeModal, confirmBox, openModal, render, renderModal, rerenderKeepScroll } from './page';
import { toast } from './toast';
import { settingsSyncLine } from './settings';
import { obOutClear } from './today';
import { NO_ANSWER, fbCheckReader } from './report';
import type { Tap } from './workstate';

/** The confirmation's wait, in milliseconds: how long it tries at most, when it slows, how often it tries before and after, the least gap between two tries, and how long a browser that opened the link reads the marker as this one's. */
const WAIT_MS = {
  most: 30 * 60000,
  slowAfter: 5 * 60000,
  every: 20000,
  slowEvery: 60000,
  gap: 3000,
  marker: 60 * 60000
} as const;
/** The code waits for a check of the wait already out (the app just came back to the front): tries, a tenth of a second apart. */
const CODE_WAIT = { tries: 50, stepMs: 100 } as const;
/** How long signing out waits for the changes not yet in the account, in milliseconds (r34.2). */
const OUT_FLUSH_MS = 15000;
/** The shortest password an account takes. */
const PW_MIN = 8;

/** An email address as typed: something, an @, something, a dot, something. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The sync line on Settings, drawn again in place (the sync calls it through fx). */
export function syncLine(): void {
  settingsSyncLine();
}
/** After a change to the account: the tabs that show it drawn again, or only Settings' sync line under a sheet. */
function acctRerender(): void {
  if ((ui.tab === 'settings' || ui.tab === 'today') && !ui.modal) rerenderKeepScroll();
  else syncLine();
}

/* ---------- waiting for the confirmation email (item 61) ----------
   On an iPhone the link in the email opens the browser, never the
   home-screen app, so the app cannot be told the account was confirmed.
   Instead, while its "Check your email" sheet is open, it tries to sign in
   with the email and password just typed: when the app comes back to the
   front, when "I have confirmed" is tapped, and every 20 seconds while it is
   on screen (every minute after 5 minutes; Supabase allows about 30 sign-in
   attempts per 5 minutes). The password is held in memory only, and is
   forgotten once signed in, when the sheet closes, or after 30 minutes.
   A marker without the password is kept in storage while waiting: a browser
   that shares this storage (the same browser, or Android's installed app)
   can then tell that the link was opened where Ironlog lives. */
const ACCT_WAIT = KEY + '.acctWait';
/** A new account waiting for its email: the email and password typed (memory only, r21), when it began, and the next try. */
let wait: { email: string; pw: string; since: number; timer: ReturnType<typeof setTimeout> | null } | null = null;
/** The request out: a try of the wait's sign-in, the code, or none. */
let flight: 'poll' | 'code' | null = null;
/** When the wait last tried. */
let lastTry = 0;

/** Whether a new account waits for its email (window.__ironlog). */
export const waiting = (): boolean => !!wait;

/** The account sheet open, or null. */
const acctOpen = (): AccountModal | null => {
  const m = ui.modal;
  return m && m.kind === 'account' ? m : null;
};
/** The waiting sheet open, or null. */
const waitSheet = (): AccountModal | null => {
  const m = acctOpen();
  return m && m.mode === 'wait' ? m : null;
};
/** Back to the sheet the account sheet was opened from (a problem report, r55), else closed. */
function back(): void {
  const m = acctOpen();
  if (m && m.back) openModal(m.back);
  else closeModal();
}
/** A request to the account service with the time limit (PENDING 309). */
const limited = <T>(pr: Promise<T>): Promise<T> => withTimeout(pr, NET_MS, 'auth-late');
/** What the sheet says of a failed request: no answer, or the service's own words. */
const failed = (e: unknown, or: string): string => (codeOf(e) === 'timeout' ? NO_ANSWER : said(e, or));

function waitStart(email: string, pw: string): void {
  wait = { email, pw, since: Date.now(), timer: null };
  // Storage that refuses the marker leaves the app waiting all the same.
  prefSet(ACCT_WAIT, JSON.stringify({ t: Date.now() }));
  waitSchedule();
}
/** Stops waiting for the confirmation: the password forgotten, the marker gone. */
function waitStop(): void {
  if (wait && wait.timer) clearTimeout(wait.timer);
  wait = null;
  prefDel(ACCT_WAIT);
}
function waitSchedule(): void {
  if (!wait) return;
  if (wait.timer) clearTimeout(wait.timer);
  wait.timer = null;
  const age = Date.now() - wait.since;
  if (age > WAIT_MS.most) {
    waitStop();
    const m = waitSheet();
    if (m) {
      m.mode = 'signin';
      m.needCode = true;
      m.err = 'Still not confirmed. Type the code from the email, or open its link and sign in here.';
      renderModal();
    }
    return;
  }
  wait.timer = setTimeout(() => waitTry(false), age < WAIT_MS.slowAfter ? WAIT_MS.every : WAIT_MS.slowEvery);
}
/** Unconfirmed: the service's code, or its words for it. */
const unconfirmed = (e: unknown): boolean =>
  codeOf(e) === 'email_not_confirmed' || /Confirm your email/i.test(said(e, ''));
async function waitTry(manual: boolean): Promise<void> {
  const A = AUTH();
  const w = wait;
  if (!A || !w || flight) return;
  if (!manual && (document.visibilityState !== 'visible' || Date.now() - lastTry < WAIT_MS.gap)) {
    waitSchedule();
    return;
  }
  flight = 'poll';
  lastTry = Date.now();
  const m0 = waitSheet();
  if (manual && m0) {
    m0.busy = true;
    m0.err = '';
    renderModal();
  }
  try {
    acct.user = await limited(A.signIn(w.email, w.pw));
    waitStop();
    obOutClear();
    prefDel(ACCT_LATER);
    if (waitSheet()) back();
    toast('Email confirmed. Signed in and syncing.');
    await cloudInit();
    acctRerender();
  } catch (e) {
    // Not confirmed yet is what a try finds while the email waits, so only other errors are logged.
    const m = waitSheet();
    const un = unconfirmed(e);
    if (!un && /Wrong email or password/.test(said(e, ''))) {
      waitStop();
      if (m) {
        m.mode = 'signin';
        m.err = 'That password did not work. Sign in with the one you chose.';
      }
    } else if (m && manual)
      m.err = un ? 'Not confirmed yet. Type the code from the email, or open its link.' : failed(e, 'Try again.');
    if (!un) log('auth', e);
  } finally {
    flight = null;
    const m = waitSheet();
    if (m) {
      m.busy = false;
      renderModal();
    }
    waitSchedule();
  }
}

/** The account at start: who is signed in, the sign-in changes followed, and what an emailed link opened the page with. */
export async function acctInit(): Promise<void> {
  const A = AUTH();
  if (!A) return;
  A.onChange((ev, user) => {
    acct.user = user;
    if (ev === 'PASSWORD_RECOVERY' && !acctOpen()) openModal({ kind: 'account', mode: 'newpw', pw: '' });
    // Signed in some other way while waiting for the confirmation (another tab sharing this storage): stop waiting.
    if (ev === 'SIGNED_IN' && user && wait && flight !== 'code') {
      waitStop();
      if (waitSheet()) {
        back();
        toast('Email confirmed. Signed in and syncing.');
      }
    }
    if (ev === 'SIGNED_IN' && !cloud.on) cloudInit();
    if (ev === 'SIGNED_OUT' && cloud.on && !window.claude) cloudStop();
    if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') fbCheckReader();
    acctRerender();
  });
  acct.user = await A.user();
  acct.checked = true;
  fbCheckReader();
  const L = A.landing;
  if (L && L.error) {
    openModal({
      kind: 'account',
      mode: 'sent',
      title: 'Link did not work',
      msg: /expired|invalid/i.test(L.error) ? 'That link has expired or was already used. Ask for a new one.' : L.error
    });
  } else if (L && L.type === 'recovery') {
    if (!acctOpen()) openModal({ kind: 'account', mode: 'newpw', pw: '' });
  } else if (L && L.type && !isStandalone()) {
    /* A confirmation link opened in the browser, not the installed app. It
       signed this browser in, but nothing syncs here until we know this is
       where Ironlog is used (cloud-supabase.js holds it). If this storage
       is the one waiting for the confirmation (the same browser, or an
       Android app sharing it), this is the place: stay signed in. Otherwise
       ask (item 61): here, or the home-screen app, which on an iPhone keeps
       separate storage and signs itself in when it comes back to the front. */
    let mine: unknown = null;
    try {
      mine = parseJson(prefGet(ACCT_WAIT) || 'null');
    } catch (e) {
      // A damaged marker is no marker: the page asks where Ironlog is used.
    }
    const t = rec(mine);
    if (t && Date.now() - (+(t['t'] || 0) || 0) < WAIT_MS.marker) {
      prefDel(ACCT_WAIT);
      if (typeof A.release === 'function') A.release();
      openModal({
        kind: 'account',
        mode: 'sent',
        title: 'Email confirmed',
        msg: 'You are signed in. Your log syncs to your account.'
      });
      cloudInit();
    } else openModal({ kind: 'account', mode: 'where', title: 'Email confirmed' });
  }
  acctRerender();
}

/** The account's listeners, added at start where the legacy script added them: a return to the front or online tries the wait or the sync again. */
export function accountStart(): void {
  window.addEventListener('focus', () => {
    if (wait) waitTry(false);
  });
  window.addEventListener('pageshow', () => {
    if (wait) waitTry(false);
  });
  /* Retry when the phone comes back online or the app returns to the
     foreground: a sign-in that could not refresh offline starts syncing then. */
  window.addEventListener('online', () => {
    if (AUTH() && !cloud.on) cloudInit();
    // Back from a dead zone: sync now instead of waiting out the retry timer.
    else if (cloud.on && cloud.status === 'offline') {
      cloud.retry = 0;
      if (cloud.t) clearTimeout(cloud.t);
      cq(cloudFlush);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (wait) {
      waitTry(false);
      return;
    }
    if (AUTH() && !cloud.on) cloudInit();
  });
}

/** What the account sheet closing does: the wait stopped, and Where do you use Ironlog? left unanswered signs this browser out, the safe choice, as before item 61. */
export function acctClosed(m: AccountModal): void {
  if (m.mode === 'wait') waitStop();
  if (m.mode === 'where' && !m.answered) {
    const A = AUTH();
    acct.user = null;
    if (A)
      A.signOut()
        .catch((e: unknown) => {
          log('auth', e);
        })
        .then(() => acctRerender());
  }
}

/** The sheet's fields into it, as typed: autofill does not always fire input events. */
function readFields(m: AccountModal): void {
  for (const el of document.querySelectorAll('#modal [data-abind]')) {
    if (!(el instanceof HTMLInputElement)) continue;
    const k = el.dataset.abind;
    if (k === 'email' || k === 'pw' || k === 'code') m[k] = el.value;
  }
}
/** Whether the code field has the focus (Go on the keyboard there confirms with the code, r45). */
const inCode = (): boolean => {
  const a = document.activeElement;
  return a instanceof HTMLElement && a.dataset.abind === 'code';
};

/* Confirm sign-up with the emailed code (r45). This action owns success:
   the wait's tries are held off while it runs, and the sign-in event's own
   wait branch stands aside (flight 'code'), so nothing toasts or syncs
   twice. A code fails when the emailed link was opened first (it used the
   code up), so the password is tried once before the error is shown. */
async function acctCode(): Promise<void> {
  const m = acctOpen(),
    A = AUTH();
  if (!m || m.busy || !A || !A.verifyCode) return;
  const verify = A.verifyCode;
  readFields(m);
  // A try of the wait already signing in (the app just came back to the front): let it finish first, and stop if it signed in (r45 review).
  if (flight) {
    m.busy = true;
    renderModal();
    for (let i = 0; i < CODE_WAIT.tries && flight; i++) await new Promise(r => setTimeout(r, CODE_WAIT.stepMs));
    m.busy = false;
    if (acct.user || ui.modal !== m) return;
    if (flight) {
      m.err = 'Still checking. Try again in a moment.';
      renderModal();
      return;
    }
  }
  const email = String(m.email || (wait && wait.email) || '')
    .trim()
    .toLowerCase();
  const pw = (wait && wait.pw) || String(m.pw || '');
  if (!EMAIL_RE.test(email)) {
    m.err = 'Enter your email address.';
    renderModal();
    return;
  }
  if (wait && wait.timer) {
    clearTimeout(wait.timer);
    wait.timer = null;
  }
  flight = 'code';
  m.busy = true;
  m.err = '';
  renderModal();
  const ok = (user: Awaited<ReturnType<typeof verify>>): void => {
    acct.user = user;
    waitStop();
    obOutClear();
    prefDel(ACCT_LATER);
    if (ui.modal === m) back();
    toast('Email confirmed. Signed in and syncing.');
    if (!cloud.on) cloudInit();
    acctRerender();
  };
  try {
    ok(await limited(verify(email, m.code || '')));
  } catch (e) {
    let done = false;
    if (pw && codeOf(e) !== 'no_code') {
      try {
        ok(await limited(A.signIn(email, pw)));
        done = true;
      } catch (e2) {
        // Still not confirmed: the code's error is the one shown.
      }
    }
    if (!done) {
      log('auth', e);
      if (ui.modal === m) m.err = failed(e, 'Something went wrong. Try again.');
    }
  } finally {
    flight = null;
    if (ui.modal === m) {
      m.busy = false;
      renderModal();
    }
    waitSchedule();
  }
}

/** The account sheet's own submit: Go in the code field confirms with the code (r45), elsewhere it submits through the sheet's button. */
export function accountSubmit(e: SubmitEvent): void {
  const f = e.target;
  if (!(f instanceof HTMLFormElement) || f.id !== 'acctForm') return;
  e.preventDefault();
  const b = f.querySelector('[data-act="acctSubmit"]');
  if (inCode()) {
    acctCode();
    return;
  }
  if (b instanceof HTMLButtonElement && !b.disabled && e.submitter !== b) acctSubmit();
}

/** A field of the account sheet typed: kept on the sheet, its error cleared. True when it was one of the sheet's fields. */
export function accountInput(t: EventTarget | null): boolean {
  const m = acctOpen();
  if (!m || !(t instanceof HTMLInputElement)) return false;
  const k = t.dataset.abind;
  if (k !== 'email' && k !== 'pw' && k !== 'code') return false;
  m[k] = t.value;
  if (m.err) m.err = '';
  return true;
}

async function acctSubmit(): Promise<void> {
  const m = acctOpen(),
    A = AUTH();
  if (!m || m.busy || !A) return;
  // Go in the code field: the browser clicks the form's first button (Sign in), so route it to the code (r45).
  if (inCode()) return acctCode();
  readFields(m);
  const email = String(m.email || '')
      .trim()
      .toLowerCase(),
    pw = String(m.pw || '');
  const need = (ok: boolean, msg: string): boolean => {
    if (!ok) {
      m.err = msg;
      renderModal();
    }
    return ok;
  };
  if (m.mode !== 'newpw' && !need(EMAIL_RE.test(email), 'Enter your email address.')) return;
  if ((m.mode === 'signup' || m.mode === 'newpw') && !need(pw.length >= PW_MIN, `Use ${PW_MIN} or more characters.`))
    return;
  if (m.mode === 'signin' && !need(pw.length > 0, 'Enter your password.')) return;
  m.busy = true;
  m.err = '';
  renderModal();
  const done = (next: { mode: AcctMode; email?: string; title?: string; msg?: string } | null): void => {
    if (ui.modal !== m) return;
    if (next) {
      ui.modal = { kind: 'account', back: m.back, ...next };
      renderModal();
    } else back();
  };
  try {
    if (m.mode === 'signin') {
      acct.user = await limited(A.signIn(email, pw));
      obOutClear();
      prefDel(ACCT_LATER);
      done(null);
      toast('Signed in. Syncing your log.');
      await cloudInit();
      acctRerender();
    } else if (m.mode === 'signup') {
      const r = await limited(A.signUp(email, pw));
      if (r.confirm) {
        done({ mode: 'wait', email });
        waitStart(email, pw);
      } else {
        acct.user = r.user;
        obOutClear();
        done(null);
        toast('Account created. Syncing your log.');
        await cloudInit();
        acctRerender();
      }
    } else if (m.mode === 'forgot') {
      await limited(A.resetPassword(email));
      done({
        mode: 'sent',
        title: 'Check your email',
        msg: `If there is an account for ${email}, a reset link is on its way. It opens in your browser: set the new password there, then sign in here.`
      });
    } else if (m.mode === 'newpw') {
      await limited(A.updatePassword(pw));
      if (!isStandalone()) {
        // Same reason as a confirmation link: this browser was signed in by
        // the emailed link only. The installed app signs in with the new password.
        try {
          await A.signOut();
        } catch (e) {
          log('auth', e);
        }
        acct.user = null;
        done({
          mode: 'sent',
          title: 'Password changed',
          msg: `Open ${APP_NAME} from your home screen and sign in with the new password. If you use ${APP_NAME} in this browser instead, sign in here.`
        });
      } else {
        done(null);
        toast('Password changed');
      }
    }
  } catch (e) {
    log('auth', e);
    if (ui.modal === m) {
      m.err = failed(e, 'Something went wrong. Try again.');
      // Not confirmed yet: the code works from here too (r45), whatever happened to the waiting sheet.
      if (m.mode === 'signin' && codeOf(e) === 'email_not_confirmed') m.needCode = true;
    }
  } finally {
    if (ui.modal === m) {
      m.busy = false;
      renderModal();
    }
  }
}

/** The account's taps, by data-act. */
export const ACCOUNT_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  async acctRetry() {
    await cloudInit();
    acctRerender();
    if (!cloud.on) toast('Still not syncing. Check your connection, or sign out and in again.');
  },
  // From a problem report, signing in goes back to it (r55, the audit: the report and what was typed in it were gone).
  acctOpen(t) {
    const m = ui.modal;
    openModal({
      kind: 'account',
      mode: t.dataset.mode === 'signup' ? 'signup' : 'signin',
      email: '',
      pw: '',
      back: m && m.kind === 'feedback' ? m : undefined
    });
  },
  acctMode(t) {
    const m = acctOpen();
    if (!m) return;
    if (m.mode === 'wait') waitStop();
    const k = t.dataset.mode;
    m.mode = k === 'signin' || k === 'signup' || k === 'forgot' ? k : 'signin';
    m.err = '';
    m.pw = '';
    renderModal();
  },
  acctWaitNow() {
    waitTry(true);
  },
  acctCode() {
    acctCode();
  },
  async acctResend() {
    const m = acctOpen(),
      A = AUTH();
    if (!m || m.busy || !A || !A.resendCode) return;
    const resend = A.resendCode;
    readFields(m);
    const email = String(m.email || (wait && wait.email) || '')
      .trim()
      .toLowerCase();
    if (!EMAIL_RE.test(email)) {
      m.err = 'Enter your email address.';
      renderModal();
      return;
    }
    m.busy = true;
    m.err = '';
    renderModal();
    try {
      await limited(resend(email));
      m.code = '';
      toast('A new email is on its way. Use its code.');
    } catch (e) {
      log('auth', e);
      m.err = failed(e, 'Something went wrong. Try again.');
    } finally {
      if (ui.modal === m) {
        m.busy = false;
        renderModal();
      }
    }
  },
  /* The answer on a browser that opened the confirmation link (item 61b). */
  async acctWhere(t) {
    const m = acctOpen(),
      A = AUTH();
    if (!m || m.mode !== 'where' || !A) return;
    m.answered = true;
    if (t.dataset.v === 'here') {
      if (typeof A.release === 'function') A.release();
      closeModal();
      toast('Signed in here. Syncing your log.');
      await cloudInit();
      acctRerender();
      return;
    }
    try {
      await A.signOut();
    } catch (e) {
      log('auth', e);
    }
    acct.user = null;
    ui.modal = {
      kind: 'account',
      mode: 'sent',
      title: 'Switch back to the app',
      msg: `Open ${APP_NAME} from your home screen. If it still shows Check your email, it signs in by itself; otherwise sign in there.`
    };
    renderModal();
    acctRerender();
  },
  acctSubmit() {
    acctSubmit();
  },
  acctDelete() {
    const A = AUTH();
    if (!A || typeof A.deleteAccount !== 'function') return;
    const del = A.deleteAccount;
    confirmBox(
      'Delete your account?',
      'Your account and the synced copy of your log are deleted for good. The copy on this phone stays; export a backup first if you want one elsewhere.',
      'Delete account',
      async () => {
        toast('Deleting your account');
        try {
          await del();
        } catch (e) {
          log('auth', e);
          toast(said(e, 'Could not delete the account. Try again.'));
          acctRerender();
          return;
        }
        acct.user = null;
        cloudStop(true);
        rerenderKeepScroll();
        toast('Account deleted. Your log is still on this phone.');
      },
      true
    );
  },
  /* Sign out works like any app with an account (r33, V): the log lives in
     the account and comes back on sign-in, so the phone's copy goes with the
     sign-out. Keeping a copy on the phone is offered, quietly, second. Either
     way the app opens on the first page. Nothing is removed until every
     change has reached the account. */
  acctSignOut() {
    const A = AUTH();
    if (!A) return;
    const NOT_IN =
      'Some changes have not reached your account. Connect to the internet and sign out again, or sign out and keep them on this phone.';
    const out = async (remove: boolean): Promise<void> => {
      // Send anything not yet synced first, so signing out never loses work.
      // Offline there is nothing to wait for (r34.2: 15 s with no sign of anything happening).
      if (cloud.on && navigator.onLine !== false) {
        try {
          if (cloud.t) clearTimeout(cloud.t);
          await withTimeout(cq(cloudFlush), OUT_FLUSH_MS);
        } catch (e) {
          log('auth', e);
        }
      }
      if (remove && !(cloud.on && cloud.status === 'synced')) {
        confirmBox('Not in your account yet', NOT_IN, 'Keep on this phone and sign out', () => out(false));
        return;
      }
      try {
        await A.signOut();
      } catch (e) {
        log('auth', e);
        toast(said(e, 'Could not sign out'));
        return;
      }
      acct.user = null;
      cloudStop(remove);
      /* A session in progress kept on the phone carries on where it was, and
         the app stays as it is after it: sending someone mid-workout to the
         first page would read as the session lost. */
      const mid = !remove && !!state.draft;
      if (!mid) {
        // Per device only: storage that refuses it shows the first page as before.
        prefSet(OB_OUT, '1');
        prefDel(OB_ACCT);
      }
      // The phone's copy goes with the sign-out: an empty log, saved, and no Undo back into the account's (undoForget).
      if (remove)
        act(() => {
          undoForget();
          setState(normalize(null));
        });
      if (!mid) {
        ui.tab = 'today';
        window.scrollTo(0, 0);
      }
      render();
      toast(remove ? 'Signed out' : 'Signed out. A copy stays on this phone.');
    };
    // With changes not yet in the account, say so first rather than "saved in your account" (r34.2).
    if (navigator.onLine === false && hasUnsent()) {
      confirmBox('Not in your account yet', NOT_IN, 'Keep on this phone and sign out', () => out(false));
      return;
    }
    confirmBox(
      'Sign out?',
      'Your log is saved in your account. Sign in on any phone to pick it up again.',
      'Sign out',
      () => out(true),
      false,
      { label: 'Sign out, keep a copy on this phone', fn: () => out(false), quiet: true }
    );
  }
};
