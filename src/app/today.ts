/* Today (r59, phase 5): the first pages of a new install (the account, Set
   up), the lines above the start card (demo data, Set up sync, Get the app,
   the new icon), the start card for the plan's day or a blank session, and
   everything under it (This week, At a glance, the coach, injuries, the
   muscle map, the workout preview, the body), drawn by lit-html as
   src/19-today.js and src/21-pick-session.js drew them, with the actions
   and fields that change what they show, each change to the log through
   `act`. What Today opens or starts elsewhere is reached by the button's
   data-act through events.ts's table (r63): the sheets (Change, Pick for
   me, Short on time, Install, the new icon's steps, a past workout, an
   injury, cardio, a rest week, Limited equipment, the routine picker,
   import), the account's actions, demo data's Load, and every start of a
   session (actsstart.ts; the session screen is workout.ts since r60). */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import type { DirectiveResult } from 'lit-html/directive.js';
import { act } from './act';
import { APP_NAME } from './config';
import { LOCKUP } from './icons';
import { MEAS, injLabel } from './library';
import { DAYS, dayLabel, daySets, dropStarter, sessDayIdx, ssLetters, tplCountLine } from './routines';
import { starterSigs } from './normalize';
import { fmtDate, greeting, repSpan, todayEye, LIGHT_RIR } from './format';
import { BW_MAX_KG, BW_MIN_KG, MEAS_MAX_CM, LIMITS } from './records';
import {
  addDays,
  daysBetween,
  numIn,
  r1,
  today,
  uid,
  weekStart,
  monthOf,
  WEEK_DAYS,
  SUNDAY,
  dayOfWeek,
  pctOf,
  shareWords
} from './util';
import { IN, FT_IN } from './units';
import {
  EX,
  IDX,
  U,
  activeRoutine,
  coach,
  dayMinutes,
  exName,
  fmtW,
  freeMode,
  fromD,
  isDeloadWeek,
  isRestWeek,
  suggest,
  weekStats,
  weekStreak,
  cycleState
} from './live';
import { acct, cloud, state, ui } from './store';
import {
  ACCT_LATER,
  BWSNOOZE_KEY,
  ENV,
  ICON_NOTE,
  INSTALL_LATER,
  WKVIEW_KEY,
  OB_ACCT,
  OB_OUT,
  demoRestore,
  device,
  prefDel,
  prefGet,
  prefSet,
  undoStack
} from './storage';
import { cloudChecked, cloudFirstPull } from './sync';
import { AUTH } from './providers';
import { canInstallHere, installKind, isStandalone } from './env';
import { SAFETY_TXT, bwEvery } from './settings';
import { whtrLine } from './stats';
import {
  bwRate,
  bwWeekTxt,
  effTgt,
  fmtDateYr,
  heightTxt,
  lenD,
  lenFrom,
  LU,
  measAt,
  noLog,
  nz,
  recent4w,
  rirShow
} from './display';
import {
  fieldValue,
  helpButton,
  howText,
  markup,
  minPart,
  section,
  slotted,
  subsection,
  tabFoot,
  tipButton
} from './view';
import type { Field } from './view';
import type { Part } from './view';
import { heroRing, weekCard } from './week';
import { mapCard } from './map';
import type { Day } from './types';

/** The first-run tour's sample numbers (r34), chosen to follow the app's own
    rules: last time, this time and the next sets' loads per unit (65 for 10,
    10 and 10 at the top of 8 to 10 means 70 next; a first set with 4 in
    reserve moves the next ones up), a best estimate going from one number to
    the other, and its chart: the line's heights, where it starts and its
    spacing, and the grid, in the drawing's units; then how long a swipe
    settles before the slide is read, and how long a slide shows. */
const TOUR = {
  loads: { kg: [30, 32.5, 35], lb: [65, 70, 75] },
  e1: { kg: [102, 110], lb: [225, 242] },
  line: [70, 64, 66, 57, 54, 48, 43, 34, 31, 22],
  x0: 8,
  dx: 30,
  grid: [24, 48, 72],
  settleMs: 90,
  advanceMs: 4000
} as const;
/** A height typed as one number up to HEIGHT_READ.feet in lb is feet, and under HEIGHT_READ.metres in kg is metres. */
const HEIGHT_READ = { feet: 8, metres: 3 } as const;
/** Centimetres in a metre. */
const CM_M = 100;
/** The body card lists the newest BODY_SHOWN.weights weigh-ins and BODY_SHOWN.tape tape entries. */
const BODY_SHOWN = { weights: 5, tape: 3 } as const;
/** How long the deload week's toast and the build-your-own toast stay, in milliseconds: long enough for their two sentences. */
const DELOAD_TOAST_MS = 6000,
  BUILD_TOAST_MS = 7000;
import { LIGHTER_SET_SHARE, LIGHT_SHARE, RECENT_WEEKS } from './formulas';
import { PICK_DAYS } from './analytics';
import { DEMO_WEEKS } from './importing';
import { closeModal, confirmBox, render, rerenderKeepScroll } from './page';
import { toast } from './toast';

declare global {
  interface Window {
    /** A suite's switch that lets the first page's tour move on by itself in a test browser (tests/r33.js). */
    IRONLOG_TOUR_AUTO?: boolean | undefined;
  }
}

/* ---------- the first pages ---------- */

/* First run (r22). A new install opens on its own pages instead of Today:
   first the account (Create account, I have an account, Not now), then an
   optional name and the units above the ways to start. Nothing is required:
   Not now and the start choices skip everything. The account comes first
   because a log kept only on one phone is the biggest risk to it, and signing
   in is also how an existing log arrives on a new phone. Any session, demo
   data or a session in progress ends it, and so does a sign-in that brings a
   log with it. Whether the account page was passed is kept per device.
   Signing out goes back to the first page (r33, V: "sign out should go to
   the main page"), with or without a copy of the log kept on the phone.
   Continue without an account then opens that copy, and signing in brings
   the account's log. Kept per device; a sign-in clears it. The flag is
   cleared by a sign-in the lifter makes here (obOutClear), not by any
   signed-in moment: a confirmation link opened in this browser signs it in
   only until it is told where Ironlog is used (review of r33). A session in
   progress always shows, signed out or not (review: signing out mid-session
   with a copy kept hid the tabs around it). */
/** Whether the first page is held open on this device after a sign-out. */
export function obGate(): boolean {
  if (!AUTH() || window.claude || acct.user) return false;
  return prefGet(OB_OUT) === '1';
}
/** Lets the first page go after a sign-in made here. */
export function obOutClear(): void {
  prefDel(OB_OUT);
}
/** Whether Today shows the first pages: no session in progress, and held open after a sign-out, or a new install with nothing logged. */
export function obActive(): boolean {
  return !state.draft && (obGate() || (!state.settings.onboarded && !state.sessions.length));
}
function obAcctOffered(): boolean {
  if (!AUTH() || window.claude || acct.user) return false;
  return prefGet(OB_ACCT) !== 'later';
}

/* The first page's tour (r33, V: the tiles read as an About box; make it
   informational and swipeable: logging each session, the plan, progress,
   history, and the picture by muscle). Each slide shows a small piece of
   the screen it describes, with sample numbers in the unit chosen. Which
   slide shows, whether it moves on by itself, and the timers. */
/** The tour's slide, whether the lifter has taken it over, and its timers. */
export const obTour: {
  i: number;
  auto: ReturnType<typeof setInterval> | null;
  user: boolean;
  t: ReturnType<typeof setTimeout> | null;
} = {
  i: 0,
  auto: null,
  user: false,
  t: null
};
function obTourSlides(): (readonly [TemplateResult, string])[] {
  /* Five slides naming what the app does for a lifter (r34, V: say the
     promises plainly, no line under each title): logging, the next weights
     worked out (progressive overload), the next sets adjusting as you lift,
     a plan or freestyle, and progress. Sample numbers in the unit chosen,
     following the app's own rules: 65 for 10, 10 and 10 at the top of 8 to 10
     means 70 next; a first set with 4 in reserve moves the next ones up. */
  const kg = U() === 'kg';
  const u = U();
  const w = TOUR.loads[kg ? 'kg' : 'lb'];
  const f = (v: number | undefined): string => fmtW(fromD(v || 0));
  const log = html`<div class="obv" aria-hidden="true"><div class="row spread"><b>Incline DB Press</b><span class="mu">Last ${f(w[0])} × 10, 10, 10</span></div>
<div class="obv-row"><b class="mu">1</b><span>${f(w[1])}</span><span>10</span><i class="on"></i></div>
<div class="obv-row"><b class="mu">2</b><span>${f(w[1])}</span><span>9</span><i class="on"></i></div>
<div class="obv-row"><b class="mu">3</b><span class="g fill">${f(w[1])}</span><span class="g fill">9</span><i class="on tick"></i></div></div>`;
  const next = html`<div class="obv" aria-hidden="true"><b>Incline DB Press</b>
<div class="obv-next"><span class="mu">Last</span><b>${f(w[0])} ${u}</b><span class="mu">10, 10, 10</span></div>
<div class="obv-next now"><span>Next</span><b>${f(w[1])} ${u}</b><span>8 or more</span></div></div>`;
  const adjust = html`<div class="obv" aria-hidden="true"><b>Incline DB Press</b>
<div class="obv-row"><b class="mu">1</b><span>${f(w[1])}</span><span>13</span><i class="on"></i></div>
<div class="obv-adj">Next sets: ${f(w[2])} ${u}, up</div>
<div class="obv-row"><b class="mu">2</b><span class="g">${f(w[2])}</span><span class="g">10</span><i></i></div></div>`;
  const days: [string, number][] = [
    ['M', 1],
    ['T', 1],
    ['W', 0],
    ['T', 1],
    ['F', 1],
    ['S', 0],
    ['S', 0]
  ];
  const plan = html`<div class="obv" aria-hidden="true"><div class="obv-week">${days.map(([d, t]) => html`<div class=${t ? 't' : nothing}><b></b>${d}</div>`)}</div>
<div class="obv-plan"><div><b>Bench Press</b><span class="mu">3 × 6-10</span></div><div><b>Chest-Supported Row</b><span class="mu">3 × 8-12</span></div><div class="free"><b>Freestyle</b><span class="mu">add as you go</span></div></div></div>`;
  const pts = TOUR.line.map((y, i): [number, number] => [TOUR.x0 + i * TOUR.dx, y]);
  const e1 = TOUR.e1[kg ? 'kg' : 'lb'];
  const end = pts[pts.length - 1] || [0, 0];
  const prog = html`<div class="obv" aria-hidden="true"><b>Bench Press</b> <span class="mu">est. 1RM ${e1[0]} to ${e1[1]} ${u}</span><span class="obv-chip">PR</span>
<svg viewBox="0 0 290 80" style="margin-top:6px">${TOUR.grid.map(y => html`<line class="gl" x1="0" x2="290" y1=${y} y2=${y}></line>`)}
<polyline class="ln" points=${pts.map(p => p.join(',')).join(' ')}></polyline>${pts.slice(0, -1).map(([x, y]) => html`<circle class="pt" cx=${x} cy=${y} r="3.2"></circle>`)}<circle class="pr" cx=${end[0]} cy=${end[1]} r="5.5"></circle></svg></div>`;
  return [
    [log, 'Log a set in one tap'],
    [next, 'Next weights, worked out'],
    [adjust, 'Adjusts as you lift'],
    [plan, 'Your plan, or freestyle'],
    [prog, 'See every lift progress']
  ];
}
function obTourPart(): TemplateResult {
  const sl = obTourSlides();
  const n = sl.length;
  const i = Math.min(obTour.i, n - 1);
  return html`<section class="ob-tour" aria-roledescription="carousel" aria-label=${`What ${APP_NAME} does`}>
<div class="ob-track" id="obTrack">${sl.map(
    ([v, t], k) =>
      html`<article class=${k === i ? 'ob-slide on' : 'ob-slide'} role="group" aria-roledescription="slide" aria-label=${`${k + 1} of ${n}: ${t}`} data-i=${k}>${v}<h2>${t}</h2></article>`
  )}</div>
<div class="ob-pips" role="group" aria-label="Slides">${sl.map(
    ([, t], k) =>
      html`<button type="button" data-act="obTourPick" data-i=${k} aria-label=${`Show ${t}`} aria-current=${k === i ? 'true' : nothing}></button>`
  )}</div></section>`;
}
/** Stops the tour moving on by itself. */
export function obTourStop(): void {
  if (obTour.auto) clearInterval(obTour.auto);
  obTour.auto = null;
}
function obTourSet(i: number): void {
  const tr = document.getElementById('obTrack');
  if (!tr) return;
  obTour.i = i;
  tr.querySelectorAll<HTMLElement>('.ob-slide').forEach(el => el.classList.toggle('on', +(el.dataset['i'] || 0) === i));
  document.querySelectorAll<HTMLElement>('.ob-pips button').forEach(b => {
    if (+(b.dataset['i'] || 0) === i) b.setAttribute('aria-current', 'true');
    else b.removeAttribute('aria-current');
  });
}
function obTourGo(i: number, smooth: boolean): void {
  const tr = document.getElementById('obTrack');
  if (!tr) return;
  const el = tr.children[i];
  const first = tr.firstElementChild;
  if (!(el instanceof HTMLElement) || !(first instanceof HTMLElement)) return;
  tr.scrollTo({ left: el.offsetLeft - first.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
  obTourSet(i);
}
/* The track is drawn once and kept between draws (lit-html), so its
   listeners are added once: a fresh page drew a new track on every draw. */
const tourWired = new WeakSet<Element>();
/** Starts the tour after a draw: its slide in place, the swipe followed, and (in a browser, not reduced, not taken over) the slides moving on every 4 seconds. */
export function mountObTour(): void {
  obTourStop();
  const tr = document.getElementById('obTrack');
  if (!tr) return;
  if (obTour.i) obTourGo(obTour.i, false);
  if (!tourWired.has(tr)) {
    tourWired.add(tr);
    tr.addEventListener(
      'scroll',
      () => {
        if (obTour.t) clearTimeout(obTour.t);
        obTour.t = setTimeout(() => {
          const kids: HTMLElement[] = [];
          for (const e of tr.children) if (e instanceof HTMLElement) kids.push(e);
          const x0 = kids[0] ? kids[0].offsetLeft : 0;
          const x = tr.scrollLeft;
          let best = 0;
          kids.forEach((el, k) => {
            const b = kids[best];
            if (b && Math.abs(el.offsetLeft - x0 - x) < Math.abs(b.offsetLeft - x0 - x)) best = k;
          });
          if (best !== obTour.i) obTourSet(best);
        }, TOUR.settleMs);
      },
      { passive: true }
    );
    // Any touch, key or focus inside stops it moving on its own, for good.
    const mine = (): void => {
      obTour.user = true;
      obTourStop();
    };
    const box = tr.parentNode;
    if (box)
      for (const ev of ['pointerdown', 'touchstart', 'keydown', 'focusin', 'wheel'])
        box.addEventListener(ev, mine, { passive: true });
  }
  let reduce = false;
  try {
    reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    // No media queries here: the tour animates.
  }
  // Test browsers run it only when asked, so screenshots and suites stay still.
  if (reduce || obTour.user || (navigator.webdriver && !window.IRONLOG_TOUR_AUTO)) return;
  // Every 4 seconds (r37, V): a slide is a title and a small picture, read in about 2; at 5.5 a pass took 22 seconds.
  obTour.auto = setInterval(() => {
    const t2 = document.getElementById('obTrack');
    if (!t2) {
      obTourStop();
      return;
    }
    if (document.hidden) return;
    // One pass through, then it stays on the last slide (r34, V: less moving while reading the page).
    if (obTour.i >= t2.children.length - 1) {
      obTour.user = true;
      obTourStop();
      return;
    }
    obTourGo(obTour.i + 1, true);
  }, TOUR.advanceMs);
}
function obView(): TemplateResult {
  // Still finding out whether this device is signed in, or pulling its log: show nothing that could flash away. A first pull that failed shows the page (r64, F3: with no answer it waited for ever).
  if (!cloudChecked || (AUTH() && !window.claude && !acct.checked) || cloudFirstPull())
    return html`<div class="ob"><div class="ob-splash"><p class="ob-logo">${markup(LOCKUP)}</p></div></div>`;
  const acctStep = !!AUTH() && !window.claude;
  const undo = undoStack.length
    ? html`<button class="linkbtn ob-skip" data-act="undo">Undo last delete or reset</button>`
    : nothing;
  /* The first page (r31.2, V): what the app does, in three lines, before
     anything is asked; then the account, said to be optional and what it is
     for, and Continue without an account as a plain, clearly worded link. A
     page that opened on an account request alone lost a friend at the first
     screen. After Erase everything these pages are all there is, so its Undo
     is here too (r55, the audit). The header and its menu are hidden on these
     pages, so the Set up page ends with Help, the menu (Report a problem, the
     Guide), for someone stuck before the app opens (r64, the r63 audit's P-S4-6). */
  if (obAcctOffered())
    return html`<div class="ob" id="obPage" data-step="acct">
<div class="ob-top"><h1 class="ob-logo">${markup(LOCKUP)}</h1></div>
${obTourPart()}
<div class="ob-card"><h2>Save your log</h2>
<p class="ob-why">Back up your log and use it on any device</p>
<button class="btn primary block" data-act="acctOpen" data-mode="signup">Create account</button>
<button class="btn block" data-act="acctOpen" data-mode="signin">I have an account</button></div>
${ENV === 'preview' ? html`<button class="btn block" data-act="previewCopy">Copy my log in</button>` : nothing}
<button class="linkbtn ob-later" data-act="obAcctLater">Continue without an account</button>${undo}</div>`;
  const todayBw = state.bodyweights.find(x => x.date === today());
  return html`<div class="ob welcome" id="obPage" data-step="start">
${acctStep && !acct.user ? html`<button class="linkbtn ob-back" data-act="obAcctBack">‹ Account</button>` : nothing}
<p class="ob-logo sm">${markup(LOCKUP)}</p>
<h2 class="ob-h">Set up</h2>
<label class="field">Name <span class="muted">(optional)</span><input type="text" data-bind="userName" maxlength="40" autocomplete="given-name" .value=${fieldValue(state.settings.userName || '')}></label>
<div><p class="small muted" style="margin:0 0 6px;font-weight:600">Units</p><div class="ob-units" role="group" aria-label="Units">${(
    [
      ['lb', 'lb and inches'],
      ['kg', 'kg and cm']
    ] as const
  ).map(
    ([k, l]) =>
      html`<button class=${`chip ${U() === k ? 'on' : ''}`} data-act="obUnit" data-v=${k} aria-pressed=${String(U() === k)}>${l}</button>`
  )}</div></div>
<label class="field">Bodyweight <span class="muted">(optional)</span><input type="text" inputmode="decimal" id="obBw" .value=${fieldValue(todayBw ? fmtW(todayBw.kg) : '')} placeholder=${`${U()}, for pull-ups, dips, and push-ups`} enterkeyhint="done"></label>
<h3 style="font:700 20px var(--display);margin:6px 0 0">How do you want to start?</h3>
<div class="ob-opts">
<button class="ob-opt primary" data-act="obSample"><b>Pick a ready-made routine</b><span>${tplCountLine()}</span></button>
<button class="ob-opt" data-act="obFree"><b>Log a workout now</b><span>Add exercises as you go</span></button>
<button class="ob-opt" data-act="obOwn"><b>Build my own routine</b><span>Your days, your exercises</span></button>
<button class="ob-opt" data-act="impOpen"><b>Import my workouts</b><span>Notes, a spreadsheet, another app, a backup</span></button>${
    ENV === 'preview'
      ? html`<button class="ob-opt" data-act="previewCopy"><b>Copy my log in</b><span>Try this test version on your own log</span></button>`
      : nothing
  }</div>
<button class="linkbtn ob-skip" data-act="demoLoad">Look around with sample data first</button>${undo}
<p class="small muted" id="obSafety" style="margin:10px 0 0;text-align:center"><span class="hastip" data-tip=${SAFETY_TXT}>Suggestions are estimates, not advice.</span></p>
<button class="linkbtn ob-skip" data-act="menuOpen">Help</button></div>`;
}

/* ---------- the lines above the start card ---------- */

/* First run with no sessions: three ways in. Shown only after the cloud check,
   so a device about to load your data never flashes it. Demo data loaded
   before choosing how to start: a short note instead of the setup pages, and
   one tap back to them. The setup itself is obView. */
function welcomeCard(): Part {
  if (state.settings.onboarded || !cloudChecked || state.draft || state.sessions.some(s => !s.demo)) return nothing;
  if (state.sessions.some(s => s.demo))
    return html`<div class="card welcome" id="demoNote"><p class="small" style="margin:0 0 8px"><b>You are looking at demo data.</b> ${DEMO_WEEKS} weeks of generated sessions to look around; none of it is yours.</p><button class="btn sm primary" data-act="demoStart">Clear demo and set up</button></div>`;
  return nothing;
}
/* Signed out: one slim line on Today, because a log that lives only on the
   phone is the biggest risk to it. It comes before the Install line in a
   browser (item 55). "Not now" hides it on this device until an account is
   used. Never shown inside Claude, during a first run (the welcome card
   offers it there), or before the sign-in check. Someone who just chose
   Continue without an account is not asked again on the next screen (r32,
   from the third review: two bars and a toast on the first Today); the line
   comes back once a session is saved. */
function acctBar(): Part {
  if (!AUTH() || window.claude || !acct.checked || acct.user || cloud.on || !state.settings.onboarded) return nothing;
  if (prefGet(ACCT_LATER)) return nothing;
  if (prefGet(OB_ACCT) === 'later' && !state.sessions.some(x => !x.demo)) return nothing;
  return html`<div class="acctbar" id="acctBar"><span class="small"><b>Only on this phone.</b><span class="ab-more"> Sync it with an account.</span></span><button class="btn sm primary" data-act="acctOpen" data-mode="signup">Set up sync</button><button class="ib" aria-label="Not now" data-act="acctLater">✕</button></div>`;
}
/* The new icon (r25). iPhone keeps a home-screen icon exactly as it was when
   added and never refreshes it, so an app installed before r25 shows the old
   barbell until it is removed and added again, and removing it also removes
   the log kept on the phone. So an existing iPhone install is told once, with
   the safe order of steps; a new install already has the new icon, and
   Android refreshes it by itself. */
function iconNoteDue(): boolean {
  if (prefGet(ICON_NOTE)) return false;
  const ios = /^ios/.test(installKind());
  if (!device.hadLog || !isStandalone() || !ios) {
    // Not due here: noted, so it is never asked again (refused storage asks again next time, which is harmless).
    prefSet(ICON_NOTE, '1');
    return false;
  }
  return true;
}
function iconBar(): Part {
  if (!window.IRONLOG_APP || !iconNoteDue()) return nothing;
  return html`<div class="acctbar" id="iconBar"><span class="small"><b>New app icon.</b><span class="ab-more"> Your home screen keeps the old one until ${APP_NAME} is added again.</span></span><button class="btn sm" data-act="iconHow">How</button><button class="ib" aria-label="Not now" data-act="iconLater">✕</button></div>`;
}
/* The installable build opened in a browser. Android and desktop Chrome
   offer a real install: the build catches that offer and Install uses it. An
   iPhone has no install button for websites (Apple allows only Share > Add
   to Home Screen), so there Install opens a short picture guide for the
   browser in use (installSheet). Nothing shows once installed, inside
   Claude, or in the plain source file. An iPhone's button says Add to Home
   Screen (item 56). */
function installBar(): Part {
  if (!canInstallHere()) return nothing;
  if (prefGet(INSTALL_LATER)) return nothing;
  const ios = /^ios/.test(installKind());
  return html`<div class="acctbar" id="installBar"><span class="small"><b>Get the app.</b>${
    ios ? nothing : html`<span class="ab-more"> Install ${APP_NAME} on your home screen.</span>`
  }</span><button class="btn sm primary" data-act="install">${ios ? 'Add to Home Screen' : 'Install'}</button><button class="ib" aria-label="Not now" data-act="installLater">✕</button></div>`;
}
/* A field for a new weigh-in or tape measurement, made again when the unit
   changes: these fields keep what is typed through a draw (r59), and a number
   typed in pounds or inches left in place under kilograms or centimetres
   would be saved as that (180 lb as 180 kg). Typed in the unit shown, it goes
   with it (the review of r59's keeping of fields). */
const inUnit = (u: string, field: TemplateResult): DirectiveResult => keyed(u, field);
/* Body's weigh-in date (bodyCard) is keyed by the day, for the same reason:
   a date field the lifter or a save has set no longer follows its value
   attribute, so kept from one day into the next it said yesterday, and a
   morning weigh-in went over the evening's (the second review of r59). Within
   a day it keeps the date chosen through a draw. */

/* A weigh-in due (Settings > General, how often): the last one and Save,
   or Later for two days. Never weighed in: only for someone who logs
   bodyweight lifts, where it changes the numbers (r34.2, from the review: it
   asked every 2 days of a lifter who skipped the optional weigh-in and does
   none). */
/** The weigh-in due card, or nothing. */
export function bwDueCard(): Part {
  const n = bwEvery();
  if (!n || noLog()) return nothing;
  let last: (typeof state.bodyweights)[number] | null = null;
  for (const x of state.bodyweights) if (!last || x.date > last.date) last = x;
  const t = today();
  const ago = last ? daysBetween(last.date, t) : null;
  if (last && ago != null && ago < n) return nothing;
  if (
    !last &&
    !state.sessions.some(
      x =>
        !x.demo &&
        x.ex.some(b => {
          const e = EX(b.exId);
          return e && e.bw;
        })
    )
  )
    return nothing;
  const z = prefGet(BWSNOOZE_KEY);
  if (z && z > t) return nothing;
  return html`<div class="card" id="bwDue"><p class="small" style="margin:0 0 8px"><b>Weigh-in due.</b> ${
    last ? `Last ${fmtW(last.kg)} ${U()}, ${ago} days ago.` : 'Pull-ups, dips, and push-ups count it.'
  } ${tipButton('Bodyweight lifts use your latest weigh-in for weight lifted and estimates. How often to ask is in Settings > General.', 'About weigh-ins')}</p>
<div class="row"><label class="field" style="flex:1;margin:0"><span class="vh">Bodyweight (${U()})</span>${inUnit(
    U(),
    html`<input type="text" inputmode="decimal" id="bwDueVal" placeholder=${last ? fmtW(last.kg) : `Weight (${U()})`} data-grey=${last ? fmtW(last.kg) : nothing} aria-label=${`Bodyweight (${U()})`} enterkeyhint="done">`
  )}</label><button class="btn sm primary" data-act="addBW" data-in="bwDueVal">Save</button><button class="btn sm" data-act="bwLater">Later</button></div></div>`;
}

/* ---------- the start card ---------- */

function changeBtn(di: number, free: boolean): TemplateResult {
  return html`<button class="btn sm" data-act="startAltOpen" data-day=${di} data-free=${free ? '1' : nothing}>Change</button>`;
}
/* More options on either card (r34.2, from the review: the blank-session
   card had none, so a freestyler could not mark a rest week, a deload, an
   injury, or cardio from Today). */
function moreBtn(deload: boolean): Part {
  return html`<button class="btn sm" data-act="heroMore" aria-expanded=${String(!!ui.heroMore)}>${ui.heroMore ? 'Fewer options' : 'More options'}</button>${
    deload && !ui.heroMore ? html`<span class="tag blue">Deload week on</span>` : nothing
  }`;
}
function moreRow(deload: boolean, playable: boolean, di: number): Part {
  if (!ui.heroMore) return nothing;
  const t = today();
  const rw = isRestWeek(weekStart(t)) || isRestWeek(addDays(weekStart(t), -WEEK_DAYS));
  return html`<div class="row" style="margin-top:8px"><button class=${`btn sm ${deload ? 'noted' : ''}`} data-act="deloadToggle" aria-pressed=${String(deload)}>${
    deload ? 'Deload week: on' : 'Deload week'
  }</button>${playable ? html`<button class="btn sm" data-act="eqOpen" data-day=${di}>Limited equipment</button>` : nothing}<button class=${`btn sm ${rw ? 'noted' : ''}`} data-act="restWkOpen">Rest week</button><button class="btn sm" data-act="injAdd">Flag an injury</button><button class="btn sm" data-act="cardioNew">Log cardio</button></div>`;
}
const STARTS_HELP = html`In <b>Change</b>: <b>Lighter day</b>: every exercise on the day, half the sets (rounded up), about ${pctOf(LIGHT_SHARE)}% of the loads, ${LIGHT_RIR} or more reps in reserve, and no target to beat: a one-day deload. For a day you are run down or sore, or slept badly. It does not count against your trends. <b>Short on time</b>: tell it your minutes; it keeps priority and lagging muscles and your main lifts at full effort and trims the rest. <b>Pick for me</b>: ranks your routine's days for today from what each muscle got in the last ${PICK_DAYS} days, how recently it was trained hard, injuries, and where you are in the cycle, then says why. <b>Blank session</b>: log anything; your cycle stays put. <b>Deload week</b> (More options): a whole week of half sets at about ${pctOf(LIGHT_SHARE)}% loads. <b>Limited equipment</b> (More options): today's workout with each exercise your gym cannot do swapped for the closest match it can.`;

/** Today, with no session in progress: the first pages of a new install, or the start card and everything under it. */
export function viewToday(): TemplateResult {
  if (obActive()) return obView();
  const R = activeRoutine();
  const wd = dayOfWeek(today());
  const weekly = R.schedule === 'weekly';
  const cs = weekly ? null : cycleState(R);
  if (typeof ui.todayDay === 'number' && ui.todayDay >= R.days.length) ui.todayDay = null;
  const chosen = typeof ui.todayDay === 'number' ? ui.todayDay : null;
  const di = chosen == null ? (weekly ? wd : cs ? cs.next : 0) : chosen;
  const day: Day = R.days[di] || { id: '', name: '', rest: true, items: [] };
  const t = today();
  // "Next up" is said once, in Change day below (r28): on the card it made the
  // date line wrap and leave "UP" on a line of its own on a phone.
  // On a scheduled rest day the card shows the next training day, and says so (r30: "Day 1 of 7" beside "rest today, Day 7").
  /* A day opened from a date past this week (the calendar's days ahead, 329)
     says that date, so a Wednesday weeks ahead does not read as this one. */
  const at = ui.todayAt;
  const ahead =
    chosen != null &&
    at &&
    typeof at === 'object' &&
    'd' in at &&
    'di' in at &&
    at.di === chosen &&
    typeof at.d === 'string' &&
    at.d > addDays(weekStart(t), SUNDAY)
      ? at.d
      : null;
  const eyebrow = ahead
    ? weekly
      ? `Viewing ${DAYS[di]}, ${fmtDateYr(ahead)}`
      : `Viewing ${fmtDateYr(ahead)} · ${dayLabel(R, di)}`
    : weekly
      ? di === wd
        ? 'Today'
        : `Viewing ${DAYS[di]}`
      : `${cs && cs.restToday && chosen == null ? 'Next: ' : ''}${dayLabel(R, di)}`;
  let note: Part = nothing;
  if (cs && chosen == null) {
    if (cs.lastDate === t) note = `${dayLabel(R, cs.last)} done today.`;
    else if (cs.restToday)
      note = html`<b>Scheduled rest today</b> (${dayLabel(R, cs.restIdx)} of your cycle). ${(R.days[cs.next] || { name: '' }).name} is ready whenever you want it.`;
  } else if (
    weekly &&
    chosen == null &&
    state.sessions.some(x => x.date === t && x.routineId === R.id && sessDayIdx(R, x) === wd)
  )
    /* A weekly routine offers today's day again once it is done (the day is
       the weekday), so it says so, as a cycle's card does (r64, the r63
       audit's P-S4-4). */
    note = `${day.name || dayLabel(R, wd)} done today.`;
  const playable = !day.rest && day.items.length > 0;
  const deload = isDeloadWeek();
  /* Freestyle by default (r34, V): for a lifter who never follows a plan,
     Today opens on a blank session (Settings > Rest timer and logging). The
     plan's day stays one tap away, and Change day shows it as before. */
  const free = state.settings.todayStart === 'free' && chosen == null;
  const hello = state.settings.userName
    ? html`<p class="hello">${greeting()}, ${state.settings.userName}</p>`
    : nothing;
  const above = html`${welcomeCard()}${acctBar()}${installBar()}${iconBar()}`;
  if (free) {
    const w = noLog()
      ? 'Add exercises as you go.'
      : ((): string => {
          const s = weekStats();
          return s.doneDays
            ? `${s.doneDays} session${s.doneDays === 1 ? '' : 's'}, ${r1(s.got)} hard sets this week`
            : 'Nothing yet this week.';
        })();
    return html`${above}<section class="hero" data-day="free"><div class="hero-top"><div class="hero-t">${hello}<p class="eyebrow">${todayEye()} · Freestyle${deload ? ' · deload week' : ''}</p><h2>Blank session</h2>
<p class="muted small" style="margin:0">${w}</p></div></div>
<button class="btn primary block big" data-act="startFree">Start session</button>
<div class="row" style="margin-top:8px">${changeBtn(di, true)}${moreBtn(deload)}</div>${moreRow(deload, false, di)}</section>${bwDueCard()}${todayRest({ playable: false, di, day, deload, cs })}`;
  }
  const sets = deload
    ? `${day.items.reduce((a, it) => a + Math.max(1, Math.ceil(it.sets / 2)), 0)} sets (deload)`
    : `${daySets(day)} sets`;
  /* One way to start (r35, V): Start, and Change for everything else (a
     lighter day, short on time, a blank session, Pick for me, another day of
     the plan), so the card is not five buttons and a list deep. Lighter and
     Short on time answer different problems: Lighter is for a body that
     needs less today (every exercise, half the sets, about 90% loads); Short
     on time is for a clock that allows less (full effort on what matters
     most, the rest trimmed to your minutes). Deload, equipment, injury and
     cardio are occasional, so they sit behind More. An active deload still
     shows in the eyebrow and on its button. */
  return html`${above}<section class="hero" data-day=${di}><div class="hero-top"><div class="hero-t">${hello}<p class="eyebrow">${todayEye()} · ${eyebrow}${
    deload ? ' · deload week' : isRestWeek(weekStart(t)) ? ' · rest week' : ''
  }</p><h2>${day.name}</h2>
<p class="muted small" style="margin:0" data-tip=${'Routine: ' + R.name}>${
    playable
      ? html`${day.items.length} exercises · ${sets} · ${minPart(dayMinutes(day, deload))}`
      : day.rest
        ? 'Rest day'
        : 'No exercises planned'
  }</p></div>${heroRing(weekStats())}</div>
${note !== nothing ? html`<p class="hero-note small">${note}</p>` : nothing}${
    playable
      ? html`<button class="btn primary block big" data-act="startSession" data-day=${di}>${deload ? 'Start deload session' : 'Start session'}</button>`
      : html`<p class="small" style="margin:10px 0 0">${day.rest ? 'Rest day.' : 'Nothing planned for this day.'}</p>`
  }<div class="row" style="margin-top:8px">${changeBtn(di, false)}${moreBtn(deload)}<span style="margin-left:auto"></span>${helpButton('starts')}</div>
${howText('starts', STARTS_HELP)}${moreRow(deload, playable, di)}</section>${bwDueCard()}${todayRest({ playable, di, day, deload, cs })}`;
}

/* ---------- under the start card ---------- */

/* Counted PRs only (r32): the latest of the last 4 weeks, and the streak. */
function homeTiles(): TemplateResult {
  const sk = weekStreak();
  const pr = recent4w().prs;
  const last = pr[0];
  const ago = last ? daysBetween(last.date, today()) : null;
  return html`<div class="tiles">
<button class="tile" data-act="goDash" data-sec="consistency" aria-label=${`${noLog() ? 'No streak yet' : sk.weeks + ' week streak'}. Open consistency`}><div class="tv">${nz(sk.weeks)}</div><div class="tl">week streak</div><div class="ts">${
    freeMode()
      ? 'Weeks trained in a row'
      : sk.thisWeek >= sk.need
        ? 'This week done'
        : `Weeks with ${sk.need}+ sessions`
  }${sk.best > sk.weeks ? ` · best ${sk.best}` : ''}</div></button>
<button class="tile" data-act="goDash" data-sec="bests" aria-label=${`${noLog() ? 'No PRs yet' : `${pr.length} PRs in the last ${RECENT_WEEKS} weeks`}. Open all-time bests`}><div class="tv">${nz(pr.length)}</div><div class="tl">PRs, last ${RECENT_WEEKS} weeks</div><div class="ts">${
    last
      ? `Latest: ${exName(last.exId)}, ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago + ' days ago'}`
      : 'None yet'
  }</div></button>
</div>`;
}
/* The coach's one action: a deload week, or the section of Stats it is about.
   (The coach names no lighter day of its own: CoachLine has no such action.) */
function coachButton(c: ReturnType<typeof coach>): Part {
  if (!c.act) return nothing;
  if (c.act.deload)
    return html`<button class="btn sm" style="margin-top:8px" data-act="deloadToggle">${c.act.label}</button>`;
  return html`<button class="btn sm" style="margin-top:8px" data-act="goDash" data-sec=${c.act.sec ?? nothing} data-m=${c.act.m || nothing} data-ex=${c.act.ex || nothing}>${c.act.label}</button>`;
}
/* Injuries: one line per flagged muscle or joint. Exercises that load it are
   marked in every session, their progression target is paused, and the
   muscle is left out of "below target" reads until the flag is cleared. */
function injuryCard(): TemplateResult | null {
  const inj = state.injuries || [];
  if (!inj.length) return null;
  return section({
    sk: 'today:injuries',
    key: 'injuries',
    title: 'Injuries',
    sub: html`<span class="pill red">${inj.length} flagged</span>`,
    body: html`<ul class="inj-list" style="list-style:none;margin:0;padding:0">${inj.map(
      x =>
        html`<li><span><b>${injLabel(x.m)}</b> <span class="muted small">since ${fmtDate(x.date)}${x.note ? ' · ' + x.note : ''}</span></span><button class="btn sm" data-act="injClear" data-id=${x.id}>Cleared</button></li>`
    )}</ul>
<p class="small muted hastip" style="margin:8px 0 0" data-tip="Exercises that load these are marked in each session, their targets are paused, and the muscle is left out of below-target advice. Tap Cleared when it has settled.">What a flag does</p>`
  });
}
/* Quick answers before a session starts: is this lift moving, and what to
   do. A PR as Recent PRs counts it (r58). */
function liftTags(exId: string): Part {
  const I = IDX();
  const st = I.exStats[exId];
  if (!st) return nothing;
  const t: TemplateResult[] = [];
  if (st.last && st.fresh && I.prs.some(p => p.big && p.sid === st.last.sid && p.exId === exId))
    t.push(html`<span class="tag green">PR last time</span>`);
  if (st.easier) t.push(html`<span class="tag blue">Load due</span>`);
  if (st.stalled) t.push(html`<span class="tag yellow">Stalled</span>`);
  if (st.capped) t.push(html`<span class="tag blue">At max load</span>`);
  return t.length ? html`<span class="chips">${t}</span>` : nothing;
}
/* The day's workout before it starts. The target alone; the full reasoning
   is a hold or hover away. A lift with no history says so once for the whole
   day, not on every row. Its trend lives on Stats (r41, V: guidance before a
   session, not history). Only a stall is worth a word in the title; a PR
   last time or a load due is good news (r28: "5 flagged" was five green PR
   tags). */
function previewCard(day: Day, deload: boolean): TemplateResult {
  const I = IDX();
  const flagged = day.items.filter(it => {
    const st = I.exStats[it.exId];
    return st && st.stalled;
  }).length;
  const letters = ssLetters(day.items);
  let fresh = 0;
  const rows = day.items.map((it, k) => {
    const ex = EX(it.exId);
    const sg = suggest(it.exId, it, { deload });
    const none = !sg.last && !sg.inj && !sg.target;
    if (none) fresh++;
    const text = String(sg.text || '');
    const short = none
      ? ''
      : sg.target
        ? `Today: ${sg.target}`
        : sg.inj
          ? 'Injury flagged: start light, stop on pain.'
          : sg.last && text.startsWith(sg.last)
            ? text.slice(sg.last.length).trim()
            : text;
    return html`<div class="pvi" style=${k ? 'border-top:1px solid var(--line-soft);padding-top:10px;margin-top:10px' : nothing}><div class="row spread"><span><b>${ex.name}</b> <span class="muted small">${it.sets} × ${repSpan(it.repMin, it.repMax, '-')}${ex.timed ? 's' : ''}${ex.perSide ? ' per side' : ''}${
      rirShow(ex) ? `, ${effTgt(it.rir)}` : ''
    }</span>${it.ss ? html` <span class="tag blue">Superset ${letters[it.ss]}</span>` : nothing}${sg.inj ? html` <span class="tag red">Injury: ${injLabel(sg.inj)}</span>` : nothing}</span>${liftTags(
      it.exId
    )}</div>${short ? html`<p class="small muted hastip" style="margin-bottom:0" data-tip=${text}>${short}</p>` : nothing}</div>`;
  });
  const first = fresh
    ? html`<p class="small muted" style="margin:0 0 10px">${fresh === day.items.length ? 'First time' : `${fresh} new`}: start lighter than you think and stop while the reps still move well. Warm up on the first big lift. ${tipButton(
        'No history yet, so there is no target. Pick a load you think you could lift for the top of the rep range plus the reps in reserve shown, erring light, and stop when the reps start to slow. On a barbell or other big lift, do 1 or 2 lighter sets of 5 first. From the next session the app works the load out, catching up quickly over the first few.',
        'About first sessions'
      )}</p>`
    : nothing;
  return section({
    sk: 'today:session',
    key: 'session',
    title: 'Workout preview',
    sub: flagged ? html`<span class="pill yellow">${flagged} stalled</span>` : `${day.items.length} exercises`,
    body: html`${first}${rows}`
  });
}
/* Height parses 5'10, 5 10, 70 (inches) or 5.9 (feet) in lb mode, and cm or
   metres in kg mode. Stored in cm. */
/** A height as typed, in cm (within LIMITS.heightCm), or null when it reads as none. */
export function parseHeight(v: string): number | null {
  const t = String(v || '')
    .trim()
    .toLowerCase()
    .replace(/["”]|in(ches)?|cm/g, '')
    .trim();
  if (!t) return null;
  let cm: number | null = null;
  if (U() === 'lb') {
    const m = t.match(/^(\d+(?:\.\d+)?)\s*(?:'|’|ft|feet|\s)\s*(\d+(?:\.\d+)?)?$/);
    if (m) cm = (+(m[1] || 0) * FT_IN + (m[2] ? +m[2] : 0)) * IN;
    else {
      const n = numIn(t);
      if (n != null) cm = (n <= HEIGHT_READ.feet ? n * FT_IN : n) * IN;
    }
  } else {
    const n = numIn(t);
    if (n != null) cm = n < HEIGHT_READ.metres ? n * CM_M : n;
  }
  return cm != null && cm >= LIMITS.heightCm[0] && cm <= LIMITS.heightCm[1] ? r1(cm) : null;
}
function heightField(): TemplateResult {
  return html`<label class="field"><span class="hastip" data-tip="Set once. With a waist measurement it gives waist to height.">Height</span><input type="text" data-bind="height" .value=${fieldValue(
    heightTxt(state.settings.heightCm)
  )} placeholder=${U() === 'lb' ? "e.g. 5'10" : 'e.g. 178'} autocomplete="off"></label>`;
}
/* The body on Today: the latest weigh-in and the weekly change, a weigh-in
   to log for a date, the last five, and the tape measurements. "−0 vs
   previous" read as a loss; a change that rounds to nothing says so (r41). */
function bodyCard(): TemplateResult {
  const bws = [...state.bodyweights].sort((a, b) => (a.date < b.date ? 1 : -1));
  const ms = [...state.measurements].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, BODY_SHOWN.tape);
  const last = bws[0];
  const prev = bws[1];
  const r = bwRate();
  const t = today();
  const loggedToday = !!last && last.date === t;
  const sub = last ? `${fmtW(last.kg)} ${U()}${r ? ` · ${bwWeekTxt(r)}` : ''}` : 'Not logged yet';
  const chg = last && prev ? last.kg - prev.kg : null;
  const chgTxt =
    chg == null
      ? ''
      : +fmtW(Math.abs(chg)) === 0
        ? ', same as previous'
        : `, ${chg > 0 ? '+' : '−'}${fmtW(Math.abs(chg))} vs previous`;
  const m0 = ms[0];
  return section({
    sk: 'today:body',
    key: 'body',
    title: 'Body',
    sub,
    body: html`${
      last
        ? html`<div class="body-sum"><div><div class="v">${fmtW(last.kg)}<span class="small"> ${U()}</span></div><div class="l">Latest, ${fmtDate(last.date)}${chgTxt}</div></div>${
            r
              ? html`<div><div class="v">${bwWeekTxt(r).replace(' a week', '')}</div><div class="l">weekly change, from 7-day averages</div></div>`
              : nothing
          }</div>`
        : nothing
    }
<div class="bw-entry"><label class="field">Date${keyed(t, html`<input type="date" id="bwDate" value=${t} max=${t}>`)}</label><label class="field">Weight (${U()})${inUnit(
      U(),
      html`<input type="text" inputmode="decimal" id="bwVal" placeholder=${last ? fmtW(last.kg) : ''} enterkeyhint="done">`
    )}</label><button class="btn primary" data-act="addBW" data-tip="Also used for pull-ups, dips, and other bodyweight lifts.">${loggedToday ? 'Update' : 'Log'}</button></div>
${
  bws.length
    ? html`<ul class="bw-list" aria-label="Recent bodyweights">${bws
        .slice(0, BODY_SHOWN.weights)
        .map(
          b =>
            html`<li><span class="d">${fmtDate(b.date)}</span><span class="num">${fmtW(b.kg)} ${U()}</span><button class="ib sm" data-act="delBW" data-id=${b.id} aria-label=${`Delete ${fmtDate(b.date)} entry`}>✕</button></li>`
        )}</ul>${bws.length > BODY_SHOWN.weights ? html`<p class="small muted" style="margin:4px 0 0">${bws.length - BODY_SHOWN.weights} older on Stats.</p>` : nothing}`
    : nothing
}
${subsection(
  'today:tape',
  `Tape measurements (${LU()})`,
  html`<div class="grid2" style="align-items:end">${heightField()}<span></span></div>
<div class="grid3" style="margin-top:10px">${MEAS.map(([k, l]) => html`<label class="field">${l}${inUnit(LU(), html`<input type="text" inputmode="decimal" id=${'ms_' + k}>`)}</label>`)}</div>
${whtrLine(true)}
<button class="btn" style="margin-top:8px" data-act="addMeas">Save measurements for ${fmtDate(t)}</button>
${
  ms.length
    ? html`<div class="scroll-x" style="margin-top:10px"><table class="t"><tr><th>Date</th>${MEAS.map(m => html`<th class="r">${m[1]}</th>`)}<th class="stick-r"><span class="vh">Delete</span></th></tr>${ms.map(
        m =>
          html`<tr><td>${fmtDate(m.date)}</td>${MEAS.map(([k]) => html`<td class="r">${lenD(measAt(m, k))}</td>`)}<td class="stick-r"><button class="ib sm" data-act="delMeas" data-id=${m.id} aria-label=${`Delete ${fmtDate(m.date)} measurements`}>✕</button></td></tr>`
      )}</table></div>`
    : nothing
}`,
  m0 ? `last ${fmtDate(m0.date)}` : ''
)}`
  });
}
/* Whether a hidden section of Today has something to show, for the line at
   its foot: the workout preview with a plan's day on the card, Injuries
   with one flagged. */
const TODAY_OFFER: Readonly<Record<string, () => boolean>> = {
  'today:session': () => {
    const R = activeRoutine();
    const di =
      typeof ui.todayDay === 'number' && ui.todayDay < R.days.length
        ? ui.todayDay
        : R.schedule === 'weekly'
          ? dayOfWeek(today())
          : cycleState(R).next;
    const d = R.days[di];
    return !!d && !d.rest && d.items.length > 0;
  },
  'today:injuries': () => (state.injuries || []).length > 0
};
/** The coach's tone in words, beside its title. */
const TONE_WORDS: Readonly<Record<string, string>> = {
  red: 'Act now',
  yellow: 'One change',
  green: 'On track',
  blue: 'Note'
};
/* Everything on Today below the Start card, the same for both kinds of card;
   the Workout preview only with a plan's day on the card. Each section moves
   by its ⠿ handle into any order; a new install starts in DEFAULT_ORDER. */
function todayRest(o: {
  playable: boolean;
  di: number;
  day: Day;
  deload: boolean;
  cs: ReturnType<typeof cycleState> | null;
}): Part {
  /* Nothing logged yet: say where lifts done before this app go, since that
     is how a new lifter's bests and targets start from what they can already
     do (r48, V). History's empty state says the same; Today said nothing. */
  const pre =
    noLog() && !state.draft
      ? html`<p class="small muted" id="preApp" style="margin:0 0 10px">Lifted before this app? <button class="linkbtn" data-act="pastOpen">Log a past workout</button> to bring your bests in; targets then start from them.</p>`
      : nothing;
  // Item 62: a section's subtitle states a number, not what the section is about.
  const tiles = section({
    sk: 'today:tiles',
    key: 'tiles',
    title: 'At a glance',
    sub: noLog() ? 'Nothing logged yet' : `${weekStreak().weeks}-week streak`,
    body: homeTiles()
  });
  const c = coach();
  const toneWord = TONE_WORDS[c.tone] || 'Note';
  const coachSec = section({
    sk: 'today:coach',
    key: 'coach',
    title: 'Coach',
    sub: html`<span class=${`pill ${c.tone}`}>${toneWord}</span>`,
    body: html`<p style="margin:0">${c.text}${c.why ? html` ${tipButton(c.why, 'Why')}` : nothing}</p>${coachButton(c)}`
  });
  const inj = injuryCard();
  const parts: (readonly [string | null, Part])[] = [
    [null, pre],
    ['week', weekCard()],
    ['tiles', tiles],
    ['coach', coachSec],
    ...(inj ? [['injuries', inj] as const] : []),
    ['map', mapCard()],
    ...(o.playable ? [['session', previewCard(o.day, o.deload)] as const] : []),
    ['body', bodyCard()],
    [null, tabFoot('today', TODAY_OFFER)]
  ];
  return slotted('today', parts);
}

/* ---------- Today's taps and fields ---------- */

type Tap = { dataset: DOMStringMap };
/** The field a tap's data-in names, or the one given. */
function field(id: string): HTMLInputElement | null {
  const el = document.getElementById(id);
  return el instanceof HTMLInputElement ? el : null;
}
/** Today's taps that change the log, each through `act`, and those that change only what Today shows or what this device remembers. */
export const TODAY_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  heroMore() {
    ui.heroMore = !ui.heroMore;
    rerenderKeepScroll();
  },
  deloadToggle() {
    if (isDeloadWeek()) {
      act(() => {
        state.deloadWeek = null;
      });
      render();
      toast('Deload week off');
      return;
    }
    act(() => {
      state.deloadWeek = weekStart(today());
    });
    ui.tab = 'today';
    window.scrollTo(0, 0);
    render();
    toast(
      `Deload week on until Sunday: ${shareWords(LIGHTER_SET_SHARE)} sets, about ${pctOf(LIGHT_SHARE)}% loads. It clears fatigue; it does not add growth.`,
      false,
      DELOAD_TOAST_MS
    );
  },
  /* Every tile, summary row and map detail lands on its section, opened even if it was folded. */
  goWeek() {
    ui.folds['today:week'] = true;
    render();
    const el = document.querySelector('[data-sk="today:week"]');
    if (el instanceof HTMLDetailsElement) {
      el.open = true;
      // Scrolling is best effort: a browser without scrollIntoView's options still opens the section.
      if (el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  },
  // This week on Today: the week, or the month (remembered on this device).
  wkView(t) {
    const v = t.dataset['v'] === 'month' ? 'month' : 'week';
    ui.wkView = v;
    if (v === 'month') ui.calYm = monthOf(today());
    prefSet(WKVIEW_KEY, v);
    rerenderKeepScroll();
  },
  /* A weigh-in for the date given (Today's Body), or for today (the weigh-in
     due card, data-in). A grey number in the field is what Save takes, as
     everywhere in the app (r34.2: the weigh-in card showed the last weight
     and refused it). One weigh-in a date: a second replaces it. */
  addBW(t) {
    const own = t && t.dataset && t.dataset['in'];
    const inp = field(own || 'bwVal');
    const v = numIn(inp ? inp.value || inp.dataset['grey'] || '' : '');
    const de = own ? null : field('bwDate');
    const date = (de && de.value) || today();
    if (v == null || v <= 0) {
      toast('Enter a bodyweight');
      return;
    }
    const kg = fromD(v);
    if (kg == null || kg < BW_MIN_KG || kg > BW_MAX_KG) {
      toast(`Bodyweight must be between ${fmtW(BW_MIN_KG)} and ${fmtW(BW_MAX_KG)} ${U()}`);
      return;
    }
    act(() => {
      state.bodyweights = state.bodyweights.filter(b => b.date !== date);
      state.bodyweights.push({ id: uid(), date, kg, demo: false });
    });
    // The fields are kept between draws now (lit-html): the weigh-in logged leaves them as a fresh card shows them.
    if (inp) inp.value = '';
    if (de) de.value = today();
    rerenderKeepScroll();
    toast('Bodyweight logged');
  },
  bwLater() {
    prefSet(BWSNOOZE_KEY, addDays(today(), 2));
    rerenderKeepScroll();
  },
  delBW(t) {
    const id = t.dataset['id'];
    const x = state.bodyweights.find(b => b.id === id);
    if (!x) return;
    confirmBox(
      'Delete weigh-in?',
      `${fmtDate(x.date)}: ${fmtW(x.kg)} ${U()}. Undo is offered right after.`,
      'Delete',
      () => {
        act(
          () => {
            state.bodyweights = state.bodyweights.filter(b => b.id !== id);
          },
          { undo: true }
        );
        rerenderKeepScroll();
        toast('Entry deleted', true);
      },
      true
    );
  },
  /* A second save the same day adds to it, keeping what it does not retype,
     with Undo (r55, the audit: it replaced the day's entry). */
  addMeas() {
    const m: Record<string, number> = {};
    let any = false;
    for (const [k, lab] of MEAS) {
      const inp = field('ms_' + k);
      const v = numIn(inp ? inp.value : '');
      if (v != null && v > 0) {
        const cm = lenFrom(v);
        if (!(cm <= MEAS_MAX_CM)) {
          toast(`${lab} looks too large. Check the number.`);
          return;
        }
        m[k] = cm;
        any = true;
      }
    }
    if (!any) {
      toast('Enter at least one measurement');
      return;
    }
    const date = today();
    act(
      () => {
        const was = state.measurements.find(x => x.date === date);
        if (was) Object.assign(was, m);
        else state.measurements.push({ id: uid(), date, demo: false, ...m });
      },
      { undo: true }
    );
    for (const [k] of MEAS) {
      const inp = field('ms_' + k);
      if (inp) inp.value = '';
    }
    rerenderKeepScroll();
    toast('Measurements saved', true);
  },
  delMeas(t) {
    const id = t.dataset['id'];
    const x = state.measurements.find(m => m.id === id);
    if (!x) return;
    confirmBox(
      'Delete measurements?',
      `The tape entry from ${fmtDate(x.date)}. Undo is offered right after.`,
      'Delete',
      () => {
        act(
          () => {
            state.measurements = state.measurements.filter(m => m.id !== id);
          },
          { undo: true }
        );
        rerenderKeepScroll();
        toast('Entry deleted', true);
      },
      true
    );
  },
  injClear(t) {
    const id = t.dataset['id'];
    const x = (state.injuries || []).find(i => i.id === id);
    act(
      () => {
        state.injuries = (state.injuries || []).filter(i => i.id !== id);
      },
      { undo: true }
    );
    render();
    toast(`${x ? injLabel(x.m) : 'Injury'} cleared`, true);
  },
  acctLater() {
    prefSet(ACCT_LATER, '1');
    rerenderKeepScroll();
    toast('Hidden. Settings > Your data has it.');
  },
  installLater() {
    prefSet(INSTALL_LATER, '1');
    rerenderKeepScroll();
    toast('Hidden. Settings > Your data has it.');
  },
  iconLater() {
    prefSet(ICON_NOTE, '1');
    if (ui.modal && ui.modal.kind === 'icon') closeModal();
    rerenderKeepScroll();
  },
  obAcctLater() {
    prefSet(OB_ACCT, 'later');
    obOutClear();
    window.scrollTo(0, 0);
    render();
  },
  obAcctBack() {
    prefDel(OB_ACCT);
    window.scrollTo(0, 0);
    render();
  },
  obTourPick(t) {
    obTour.user = true;
    obTourStop();
    obTourGo(+(t.dataset['i'] || 0), true);
  },
  obUnit(t) {
    const v = t.dataset['v'];
    if (v !== 'lb' && v !== 'kg') return;
    act(() => {
      state.settings.unit = v;
    });
    render();
  },
  /* Build my own routine: three training days with rest days between, as the
     ready-made 3-day routines are laid out (r54, the audit: three days and no
     rest planned 7 sessions a week), replacing the untouched starter, as a
     ready-made pick does (r55, the audit). */
  obOwn() {
    const r = {
      id: uid(),
      name: 'My routine',
      schedule: 'cycle' as const,
      days: [0, 1, 0, 1, 0, 1, 1].map(x => ({ id: uid(), name: x ? 'Rest' : 'Training day', rest: !!x, items: [] }))
    };
    act(() => {
      state.settings.onboarded = true;
      state.routines = dropStarter(state.routines, state.sessions, starterSigs());
      state.routines.push(r);
      state.activeRoutineId = r.id;
    });
    ui.bRoutine = r.id;
    ui.bTarget = 0;
    ui.folds['program:library'] = true;
    ui.folds['program:days'] = true;
    ui.todayDay = null;
    ui.tab = 'program';
    ui.planView = 'routine';
    window.scrollTo(0, 0);
    render();
    toast('Name your days, then add exercises with + or by dragging.', false, BUILD_TOAST_MS);
  },
  // Clear demo and set up: the demo goes, and the settings it changed come back.
  demoStart() {
    act(() => {
      state.sessions = state.sessions.filter(s => !s.demo);
      state.bodyweights = state.bodyweights.filter(b => !b.demo);
      state.measurements = state.measurements.filter(m => !m.demo);
      demoRestore();
    });
    ui.tab = 'today';
    ui.folds = {};
    window.scrollTo(0, 0);
    render();
  }
};
/** Today's fields kept by data-bind: the height (Tape measurements). */
export const TODAY_BINDS: Readonly<Record<string, (t: Field) => void>> = {
  height(t) {
    const v = t.value.trim();
    if (!v) {
      act(() => {
        state.settings.heightCm = null;
      });
      rerenderKeepScroll();
      return;
    }
    const cm = parseHeight(v);
    if (cm == null) {
      toast(U() === 'lb' ? "Enter height like 5'10 or 70 (inches)" : 'Enter height in cm, like 178');
      return;
    }
    act(() => {
      state.settings.heightCm = cm;
    });
    rerenderKeepScroll();
    toast(`Height ${heightTxt(cm)}`);
  }
};
/** A field of Today changed (on change): the Set up page's bodyweight, today's weigh-in, replaced if typed again and removed if cleared (r34); whether it was Today's. */
export function todayChange(t: Field): boolean {
  if (t.id !== 'obBw') return false;
  const v = numIn(t.value);
  const kg = v == null ? null : fromD(v);
  const okKg = kg != null && kg >= BW_MIN_KG && kg <= BW_MAX_KG ? kg : null;
  if (kg != null && okKg == null) {
    toast(`Bodyweight must be between ${fmtW(BW_MIN_KG)} and ${fmtW(BW_MAX_KG)} ${U()}`);
    t.value = '';
  }
  const date = today();
  act(() => {
    state.bodyweights = state.bodyweights.filter(b => b.date !== date);
    if (okKg != null) state.bodyweights.push({ id: uid(), date, kg: okKg, demo: false });
  });
  return true;
}
