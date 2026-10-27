/* The account's sheets (r63, from the legacy script's 14-account.js): the
   menu, the account sheet in each of its pages, a problem report and the
   owner's inbox of them. Drawn by lit-html, so the account sheet redrawn
   while someone types in it (an error said, Signing in) keeps its fields,
   their focus and the keyboard, which r54 kept by putting the new markup
   into the old sheet (morphOne, sheets.ts) while it was still markup. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { APP_NAME, DISPLAY_VERSION, PREVIEW_NAME, TICKETS_AT } from './config';
import { FB_ASK, FB_CATS, FB_HINT, FB_IMG_MB, FB_MAX, FB_SHOT_RE, FB_TITLE, FB_WHAT } from './feedback';
import { ENV, backupDue, saveStateNow } from './storage';
import { acct, cloud } from './store';
import type { AccountModal, AcctMode, FeedbackModal, FbItem } from './modals';
import { AUTH, FB } from './providers';
import { tipButton } from './view';
import { closeX } from './sheetsmisc';

/** The account service the menu offers: none inside Claude (retired), where the artifact keeps the log. */
const menuAuth = () => (AUTH() && !(window.claude && typeof window.claude.use === 'function') ? AUTH() : null);

/* The menu (r27): one tap from every tab for the things people look for
   outside a workout: who is signed in, signing in or out, the save state,
   Report a problem and the Guide. Since r28 Settings has a Help group near
   the bottom with the same Guide and reports (V asked for both places). */
/** The menu. */
export function menuSheet(): TemplateResult {
  const A = menuAuth();
  const u = A && acct.user;
  const st = saveStateNow();
  const dot = st.cls ? html`<span class=${'mdot ' + st.cls} aria-hidden="true"></span>` : nothing;
  const acc = u
    ? html`<div class="row spread" style="flex-wrap:nowrap;gap:10px"><div style="min-width:0"><p class="small muted" style="margin:0">Signed in as</p><p style="margin:2px 0 0;overflow-wrap:anywhere"><b>${u.email}</b></p></div><button class="btn sm" data-act="acctSignOut">Sign out</button></div>
    <p class="small" style="margin:8px 0 0">${dot}${cloud.on ? st.txt : 'Not syncing right now.'}${cloud.on ? nothing : html` <button class="linkbtn" data-act="acctRetry">Try again</button>`}</p>`
    : A
      ? html`<p style="margin:0"><b>Not signed in.</b> Your log is on this phone only.</p><div class="row" style="margin-top:10px"><button class="btn primary" data-act="acctOpen" data-mode="signin">Sign in</button><button class="btn" data-act="acctOpen" data-mode="signup">Create account</button></div>`
      : html`<p class="small" style="margin:0">${dot}${st.txt}</p>`;
  const due = backupDue()
    ? html`<div class="callout yellow row spread" style="margin:10px 0 0"><span class="small"><b>Backup due.</b></span><button class="btn sm" data-act="export">Export backup</button></div>`
    : nothing;
  const item = (act: string, label: string, cat?: string) =>
    html`<button type="button" class="mnu" data-act=${act} data-cat=${cat || nothing}><span>${label}</span><span aria-hidden="true">›</span></button>`;
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="menuH"><div class="sheet-h"><h3 id="menuH">${ENV === 'preview' ? PREVIEW_NAME : APP_NAME}</h3>${closeX()}</div>
  <div class="panel" id="menuAcct">${acc}</div>${due}
  <div class="mnus">${item('fbOpen', 'Report a problem', 'bug')}${acct.reader && FB() ? item('fbInbox', 'Reports inbox') : nothing}${item('guideOpen', 'Guide')}${item('goLayout', 'Show, hide, or reorder sections')}${item('goBackup', 'Your data and backups')}</div>
  <p class="small muted" style="margin:12px 0 0">Version ${DISPLAY_VERSION}</p></div>`;
}

/* ---------- problem reports (PENDING 58, reworked in r25) ----------
   The menu (top right) and an exercise's ⋯ menu open one sheet. Report a
   problem comes first; a question or a suggestion is the same sheet with
   another kind chosen at its top (stored as bug, question, idea). One text
   box, an optional screenshot, and what a report needs to be acted on
   without asking the person anything technical (report.ts, fbContext).
   Signed in only (V's choice, r25), to keep spam out. Signed out, the sheet
   asks to sign in, and can still copy the details for a message. Without a
   report service at all (the plain source file) it copies the report as
   text. */
/** A problem report, a question or a suggestion. */
export function fbSheet(m: FeedbackModal): TemplateResult {
  const head = (t: string) => html`<div class="sheet-h"><h3 id="fbH">${t}</h3>${closeX()}</div>`;
  const u = acct.user;
  if (m.sent)
    return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fbH">${head(m.copied ? 'Copied' : 'Sent')}<p style="margin:0">${m.copied ? 'Paste it in a message to the app owner.' : u ? `Thanks. Any reply goes to ${u.email}.` : 'Thanks.'}</p><button type="button" class="btn primary block" style="margin-top:14px" data-act="mClose">Done</button></div>`;
  const F = FB();
  const cat = FB_TITLE[m.cat] ? m.cat : 'bug';
  const kinds = html`<div class="fbkind" role="group" aria-label="Kind">${FB_CATS.map(([k, l]) => html`<button type="button" class=${cat === k ? 'on' : ''} data-act="fbCat" data-v=${k} aria-pressed=${String(cat === k)}>${l}</button>`)}</div>`;
  // Signed out where reports exist: sign in first (the copy stays for a message).
  if (F && !u)
    return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fbH">${head(FB_TITLE[cat] || '')}
    <p style="margin:0 0 12px">Sign in to send a report, so a reply can reach you.</p>
    <div class="stack"><button type="button" class="btn primary block" data-act="acctOpen" data-mode="signin">Sign in</button><button type="button" class="btn block" data-act="acctOpen" data-mode="signup">Create account</button></div>
    <p class="small muted" style="margin:12px 0 0">No account? <button type="button" class="linkbtn" data-act="fbCopy">Copy the details</button> and send them to the app owner.</p></div>`;
  // The count is the span's text, set whole (reportInput sets it as each letter is typed), so no part of it is lit-html's to keep.
  const n = String(m.msg || '').length;
  // Only the app's own JPEG data URL is ever shown (r44 security review): m.shot comes from fbShrink's canvas, and the check keeps it so if that changes.
  const shot =
    m.shot && FB_SHOT_RE.test(m.shot)
      ? html`<div class="fbshot"><img src=${m.shot} alt="Screenshot to send"><button type="button" class="btn sm" data-act="fbShotDel">Remove</button></div>`
      : html`<label class="btn sm fbpick">Add a screenshot<input type="file" accept="image/png,image/jpeg,image/heic,image/heif,image/webp" id="fbShot" hidden></label>`;
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fbH">${head(FB_TITLE[cat] || '')}<div class="stack">
  ${kinds}
  <label class="field">${FB_ASK[cat]}<textarea data-fbind="msg" maxlength=${FB_MAX} rows="5" placeholder=${FB_HINT[cat] || ''}>${m.msg || ''}</textarea><span class="fbcount small muted" id="fbCount" aria-live="polite" .textContent=${`${n} / ${FB_MAX}`}></span></label>
  <div><p class="small muted" style="margin:0 0 6px">Screenshot, optional. One image, up to ${FB_IMG_MB} MB.</p><div class="row">${shot}</div></div>
  <p class="small muted" style="margin:0">${u ? `Replies go to ${u.email}. ` : ''}Device details are added, never your workouts. ${tipButton(FB_WHAT, 'What is attached')}</p>
  ${m.err ? html`<p class="small" role="alert" style="color:var(--red);margin:0">${m.err}</p>` : nothing}
  <button type="button" class="btn primary block" data-act="fbSend" ?disabled=${!!m.busy}>${m.busy ? 'Sending' : F ? 'Send' : 'Copy report'}</button></div></div>`;
}

/** The characters of a report's time shown in the inbox: its date and its time to the minute. */
const STAMP_CHARS = 16;
/** A report's tag colour by its kind. */
const TAG: Readonly<Record<string, string>> = { bug: 'red', idea: 'green' };
/** One report in the owner's inbox: its kind, when, who to reply to, the text, the screenshot, its ticket, and what the app attached. */
function fbItem(x: FbItem): TemplateResult {
  const shot =
    x.screenshot && FB_SHOT_RE.test(x.screenshot)
      ? html`<img class="fbthumb" src=${x.screenshot} alt="Screenshot">`
      : nothing;
  const ticket =
    x.issue_url && x.issue_url.startsWith(TICKETS_AT)
      ? html`<p class="small" style="margin:4px 0 0"><a href=${x.issue_url} target="_blank" rel="noopener">GitHub issue</a></p>`
      : nothing;
  return html`<li><div style="min-width:0;flex:1"><p class="small" style="margin:0"><span class=${'tag ' + (TAG[String(x.category)] || 'blue')}>${String(x.category)}</span> <span class="muted">${String(
    x.created_at || ''
  )
    .slice(0, STAMP_CHARS)
    .replace(
      'T',
      ' '
    )}${x.reply_to ? ` · ${x.reply_to}` : ''}</span></p><p style="margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere">${String(x.message)}</p>${shot}${ticket}<details class="small muted"><summary>Attached by the app</summary><pre class="fbctx">${JSON.stringify(x.context || {}, null, 1)}</pre></details></div></li>`;
}
/** The owner's inbox: the reports, newest first, read-only. */
export function fbInboxSheet(m: { items: FbItem[] | null; err?: string | undefined }): TemplateResult {
  const it = m.items;
  const body = m.err
    ? html`<p class="small" role="alert" style="color:var(--red)">${m.err}</p>`
    : !it
      ? html`<p class="muted">Loading</p>`
      : !it.length
        ? html`<p class="muted">No feedback yet.</p>`
        : html`<ul class="clist fbinbox">${it.map(fbItem)}</ul>`;
  return html`<div class="sheet fixed" role="dialog" aria-modal="true" aria-labelledby="fbiH"><div class="sheet-h"><h3 id="fbiH">Feedback inbox</h3>${closeX()}</div><div class="sheet-scroll">${body}</div></div>`;
}

/* ---------- the account sheet ---------- */

/* The code from the confirmation email (r45), on the waiting sheet and, after
   "Confirm your email first", on sign-in: the code needs only the email, so
   it still works after the wait gives up or the app was closed. Digits only
   are sent; the length is the project's (6 by default), so none is forced.
   A field's value follows the sheet's (live): a new code asked for empties
   the field even while it holds what was typed. */
function codeField(m: AccountModal): TemplateResult {
  return html`<label class="field">Code from the email<input type="text" inputmode="numeric" autocomplete="one-time-code" data-abind="code" .value=${live(m.code || '')} enterkeyhint="go"></label><button type="button" class="btn primary block" data-act="acctCode" ?disabled=${!!m.busy}>Confirm with the code</button><div class="row"><button type="button" class="linkbtn tall" data-act="acctResend" ?disabled=${!!m.busy}>Send a new code</button></div>`;
}
/** What the button says while a request is out, by the page it is on (r34.2: not "Working"). */
const BUSY: Partial<Record<AcctMode, string>> = {
  signin: 'Signing in',
  signup: 'Creating your account',
  forgot: 'Sending the link',
  newpw: 'Saving'
};
/** The account sheet: sign in, create an account, a reset link, a new password, waiting for the confirmation, where the app is used, or a message. */
export function acctSheet(m: AccountModal): TemplateResult {
  const email = html`<label class="field">Email<input type="email" data-abind="email" .value=${live(m.email || '')} autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="email" enterkeyhint="next"></label>`;
  const pw = (label: string, ac: string, min: boolean) =>
    html`<label class="field">${label}<input type="password" data-abind="pw" .value=${live(m.pw || '')} autocomplete=${ac} minlength=${min ? '8' : nothing} enterkeyhint="go"></label>`;
  // The error line is always there, hidden when empty, so the sheet keeps its shape when one is said (r54).
  const err = html`<p class="small" role="alert" style="color:var(--red);margin:0" ?hidden=${!m.err}>${m.err || ''}</p>`;
  const go = (label: string) =>
    html`<button type="submit" class="btn primary block" data-act="acctSubmit" ?disabled=${!!m.busy}>${m.busy ? BUSY[m.mode] || 'One moment' : label}</button>`;
  const link = (mode: AcctMode, label: string) =>
    html`<button type="button" class="linkbtn tall" data-act="acctMode" data-mode=${mode}>${label}</button>`;
  const T: Record<AcctMode, string> = {
    signin: 'Sign in',
    signup: 'Create account',
    forgot: 'Reset password',
    newpw: 'New password',
    sent: m.title || 'Check your email',
    wait: 'Check your email',
    where: m.title || 'Email confirmed'
  };
  const b =
    m.mode === 'signin'
      ? html`${email}${pw('Password', 'current-password', false)}${err}${m.needCode ? codeField(m) : nothing}${go('Sign in')}<div class="row spread">${link('forgot', 'Forgot password?')}${link('signup', 'Create an account')}</div>`
      : m.mode === 'signup'
        ? html`${email}${pw('Password (8 or more characters)', 'new-password', true)}${err}${go('Create account')}<p class="small muted" style="margin:0">We email you a link and a code to confirm the address. Your email is only for signing in and never shared.</p><div class="row">${link('signin', 'I have an account')}</div>`
        : m.mode === 'forgot'
          ? html`${email}${err}${go('Email me a reset link')}<p class="small muted" style="margin:0">The link opens in your browser. Set the new password there, then sign in here.</p><div class="row">${link('signin', 'Back to sign in')}</div>`
          : m.mode === 'newpw'
            ? html`${pw('New password (8 or more characters)', 'new-password', true)}${err}${go('Save new password')}`
            : m.mode === 'wait'
              ? html`<p style="margin:0">We sent a confirmation email to <b>${m.email || ''}</b>. Type its code here, or tap its link and come back: ${APP_NAME} signs you in by itself.</p>${codeField(m)}<p class="small muted waitline" style="margin:0" aria-live="polite">${m.busy ? 'Checking' : 'Waiting for the confirmation'}</p>${err}<button type="button" class="btn block" data-act="acctWaitNow" ?disabled=${!!m.busy}>I have confirmed</button><div class="row">${link('signup', 'Use a different email')}</div>`
              : m.mode === 'where'
                ? html`<p style="margin:0">Where do you use ${APP_NAME}?</p><button type="button" class="btn primary block" data-act="acctWhere" data-v="app">The home-screen app</button><button type="button" class="btn block" data-act="acctWhere" data-v="here">Here in this browser</button>`
                : html`<p style="margin:0">${m.msg || ''}</p><button type="button" class="btn primary block" data-act="mClose">OK</button>`;
  const title = T[m.mode] || 'Account';
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-label=${title}><div class="sheet-h"><h3>${title}</h3>${closeX()}</div><form class="stack" id="acctForm" novalidate>${b}</form></div>`;
}
