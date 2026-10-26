/* The app's own sheets (r62, PENDING 355): installing it from a browser,
   getting the new icon, and logging a past workout. Each is drawn by
   lit-html as the legacy script drew it (tests/r62.js holds them to r61's),
   and answered by its actions by their data-act until those move (r63).

   Install: Android and desktop Chrome offer a real install, which the build
   catches and Install uses. An iPhone has no install button for websites
   (Apple allows only Share > Add to Home Screen), so there Install opens a
   short picture guide for the browser in use. Nothing shows once installed,
   inside Claude, or in the plain source file. */

import { html, svg } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { APP_NAME, SITE_DIR_FALLBACK, SITE_HOST } from './config';
import { ADD_ICON, SHARE_ICON } from './icons';
import { activeRoutine, cycleState } from './live';
import { sessionsOn } from './display';
import { dayLabel } from './routines';
import { parse, today, WEEK_DAYS } from './util';
import { acct, cloud, state } from './store';
import { AUTH } from './providers';
import { markup, tipButton } from './view';
import { closeX } from './sheetsmisc';
import type { Routine } from './types';

/* Where this copy of the app lives, for the install pictures and steps, so
   they stay right when the app moves to its own domain (r27). */
/** The host this copy of the app is served from, or the site's own from a file. */
export function siteHost(): string {
  return location.host && /^https?:$/.test(location.protocol) ? location.host : SITE_HOST;
}
/** The folder this copy of the app is served from, or the site's own from a file. */
function siteDir(): string {
  const p = location.pathname.replace(/[^/]*$/, '').replace(/\/$/, '');
  return /^https?:$/.test(location.protocol) ? p : SITE_DIR_FALLBACK;
}

/** The new icon's steps: remove the old one, add the app again from Safari, and keep the log first when it is only on this phone. */
export function iconSheet(): TemplateResult {
  const safe = !!acct.user && cloud.on;
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="icH"><div class="sheet-h"><h3 id="icH">Get the new icon</h3>${closeX()}</div>
  ${
    safe
      ? html`<p class="small" style="margin:0 0 10px">Your log is in your account, so nothing is lost.</p>`
      : html`<p class="small callout yellow" style="margin:0 0 10px"><b>Removing ${APP_NAME} from the home screen also removes the log on this phone.</b> Sign in first so it is kept in your account, or save a backup.</p><div class="row" style="margin-bottom:10px">${AUTH() ? html`<button class="btn sm primary" data-act="acctOpen" data-mode="signin">Sign in</button>` : ''}<button class="btn sm" data-act="export">Save a backup</button></div>`
  }
  <ol class="steps"><li>Press and hold ${APP_NAME} on your home screen and remove it.</li><li>Open ${location.host + location.pathname.replace(/index\.html$/, '')} in Safari, tap Share, then Add to Home Screen.</li><li>Open the new icon${safe ? ' and sign in' : ''}.</li></ol>
  <button class="btn block" style="margin-top:12px" data-act="iconLater">Done</button></div>`;
}

/* Where the button is, drawn: Safari 26's compact bar (⋯ beside the
   address), older Safari's bottom toolbar (Share in the middle), Chrome's
   address bar (Share at its right). The ring marks the one to tap. Each
   picture is written out whole, its address the host this copy is on. */
const SHARE_GLYPH = svg`<path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/>`;
function installPic(how: string): TemplateResult | string {
  const host = siteHost();
  let g: TemplateResult, lbl: string;
  if (how === 'ios-safari26') {
    lbl = "Safari's bar at the bottom of the screen. The ⋯ button is to the right of the address.";
    g = svg`<circle cx="36" cy="48" r="20" class="ip-b"/><path class="ip-i" d="M40 40l-8 8 8 8"/><rect x="64" y="28" width="190" height="40" rx="20" class="ip-b"/><text x="159" y="53" text-anchor="middle" class="ip-t">${host}</text><circle cx="284" cy="48" r="20" class="ip-b"/><circle cx="276" cy="48" r="2.6" class="ip-d"/><circle cx="284" cy="48" r="2.6" class="ip-d"/><circle cx="292" cy="48" r="2.6" class="ip-d"/><circle cx="284" cy="48" r="25" class="ip-hl"/>`;
  } else if (how === 'ios-safari') {
    lbl = "Safari's toolbar at the bottom of the screen. Share is the middle button.";
    g = svg`<rect x="40" y="4" width="240" height="40" rx="20" class="ip-b"/><text x="160" y="29" text-anchor="middle" class="ip-t">${host}</text><path class="ip-i" d="M36 62l-8 8 8 8"/><path class="ip-i ip-dim" d="M96 62l8 8-8 8"/><g class="ip-i" transform="translate(148 58)">${SHARE_GLYPH}</g><path class="ip-i ip-dim" d="M214 63c5-2 11-2 17 1v16c-6-3-12-3-17-1zM248 63c-5-2-11-2-17 1v16c6-3 12-3 17-1z"/><rect x="276" y="66" width="15" height="15" rx="3" class="ip-i ip-dim"/><path class="ip-i ip-dim" d="M281 62h11a3 3 0 0 1 3 3v11"/><circle cx="160" cy="70" r="25" class="ip-hl"/>`;
  } else if (how === 'ios-chrome') {
    lbl = "Chrome's address bar at the top of the screen. Share is at its right end.";
    g = svg`<rect x="16" y="24" width="288" height="44" rx="22" class="ip-b"/><text x="140" y="51" text-anchor="middle" class="ip-t">${host}</text><g class="ip-i" transform="translate(262 33)">${SHARE_GLYPH}</g><circle cx="274" cy="46" r="25" class="ip-hl"/>`;
  } else return '';
  return html`<svg class="ipic" viewBox="0 0 320 96" role="img" aria-label=${lbl}>${g}</svg>`;
}

/** The install sheet for the browser in use (`how`): its picture, its two steps, and a line when a log here would not follow. */
export function installSheet(m: { how?: string | undefined }): TemplateResult {
  const how = m.how || '';
  const step = (n: number, body: TemplateResult): TemplateResult =>
    html`<li><span class="stepn">${n}</span><span>${body}</span></li>`;
  const ios = /^ios/.test(how);
  const add = step(2, html`Tap <b>Add to Home Screen</b> ${markup(ADD_ICON)}, then <b>Add</b>.`);
  let body: TemplateResult;
  if (how === 'ios-safari26')
    body = html`<ol class="isteps">${step(1, html`Tap <b>⋯</b> right of the address, then <b>Share</b> ${markup(SHARE_ICON)}.`)}${add}</ol>`;
  else if (how === 'ios-safari')
    body = html`<ol class="isteps">${step(1, html`Tap <b>Share</b> ${markup(SHARE_ICON)} in the bar at the bottom.`)}${add}</ol>`;
  else if (how === 'ios-chrome')
    body = html`<ol class="isteps">${step(1, html`Tap <b>Share</b> ${markup(SHARE_ICON)} at the right of the address bar.`)}${add}</ol>`;
  else if (how === 'ios-other')
    body = html`<ol class="isteps">${step(1, html`Open <b>${siteHost() + siteDir()}</b> in Safari.`)}${step(2, html`Tap <b>⋯</b>, then <b>Share</b>, then <b>Add to Home Screen</b>.`)}</ol>`;
  else
    body = html`<ol class="isteps">${step(1, html`Open your browser's menu (⋮ or ⋯).`)}${step(2, html`Choose <b>Install app</b> or <b>Add to Home screen</b>, then confirm.`)}</ol>`;
  /* The reasons go in a tip (item 56). One line stays on screen only when it
     matters: a log already kept in this browser does not follow the app. */
  const tip =
    (ios
      ? 'An iPhone installs web apps only from the Share menu; Apple allows no install button. If Add to Home Screen is not in the list, scroll down or tap More. Keep Open as Web App on if it is shown. '
      : '') +
    `Then open ${APP_NAME} from your home screen: it starts full screen and works offline. A log kept in this browser does not move by itself: sign in inside the app, or export a backup here and import it there.`;
  const hasLog = state.sessions.some(x => !x.demo) && !acct.user;
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="instH"><div class="sheet-h"><h3 id="instH">${ios ? 'Add to Home Screen' : `Install ${APP_NAME}`}</h3>${tipButton(tip, 'About installing')}<button class="ib" aria-label="Close" data-act="mClose" style="margin-left:auto">✕</button></div>${installPic(how)}${body}${hasLog ? html`<p class="small" style="margin:10px 0 0">Your log here does not move by itself. Sign in in the app, or use a backup.</p>` : ''}<button type="button" class="btn primary block" style="margin-top:14px" data-act="mClose">Done</button></div>`;
}

/* ---------- a past workout, date first ----------
   The phone was left at home, so the sets are on paper or in memory. The
   date comes first and everything is read as of that day: which routine day
   was due, last time's numbers and targets, and PRs. */
/** The routine's day due on a past date (its weekday, or the cycle as it stood then), or -1 when that is a rest day or an empty one. */
export function pastDue(R: Routine, date: string): number {
  const ok = (i: number): boolean => {
    const d = R.days[i];
    return !!d && !d.rest && d.items.length > 0;
  };
  if (R.schedule === 'weekly') {
    const i = (parse(date).getDay() + WEEK_DAYS - 1) % WEEK_DAYS;
    return ok(i) ? i : -1;
  }
  const cs = cycleState(R, date);
  return ok(cs.next) ? cs.next : -1;
}

/** Log a past workout: its date, the sessions already on it, and the routine's days with the one due then first, or Freestyle. */
export function pastSheet(m: { date: string }): TemplateResult {
  const R = activeRoutine();
  const due = pastDue(R, m.date);
  const on = sessionsOn(m.date).map(x => x.dayName || 'Session');
  const opts = R.days
    .map((d, i) => ({ d, i }))
    .filter(x => !x.d.rest && x.d.items.length > 0)
    .sort((a, b) => +(b.i === due) - +(a.i === due));
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pastH"><div class="sheet-h"><h3 id="pastH">Log a past workout</h3>${closeX()}</div>
  <label class="field">Date<input type="date" data-pbind="date" value=${m.date} max=${today()}></label>
  ${on.length ? html`<p class="small muted" style="margin:6px 0 0">Already logged that day: ${on.join(', ')}.</p>` : ''}
  <div class="stack" style="margin-top:12px">${opts.map(({ d, i }) => html`<button class=${'btn block' + (i === due ? ' primary' : '') + ' pastday'} data-act="pastGo" data-day=${String(i)}><span>${dayLabel(R, i)}: ${d.name}</span>${i === due ? html`<small>due then</small>` : html`<small>${d.items.length} exercises</small>`}</button>`)}<button class="btn block pastday" data-act="pastGo" data-day="free"><span>Freestyle</span><small>any exercises</small></button></div>
  <p class="small muted" style="margin:10px 0 0">Quick entry: type each set. ${tipButton('No rest timer or clock. A set counts as done once its reps are typed. Last time, targets, and PRs are read as of that date.', 'About quick entry')}</p></div>`;
}
