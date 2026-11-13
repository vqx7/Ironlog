/* The week: the bar at the top of every tab, Today's This
   week card (the week, or the month, the cycle's row and the hard sets
   against the plan) and the ring on Today's start card, drawn by lit-html. What a day of the bar opens (History, a past workout,
   Today on that day) is reached by the button's data-act. And what the
   routine plans on a date ahead, which the calendar shows. */

import { html, nothing, render } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { DAYS, dayLabel, weekFactor } from './routines';
import { NIL, WD2, fmtDate, fmtDateFrom } from './format';
import { addDays, r1, today, weekStart, monthOf, dayOfMonth, dayOfWeek, WEEK_DAYS } from './util';
import { firstDate } from './charts';
import {
  IDX,
  U,
  activeRoutine,
  dateIndex,
  freeMode,
  isRestWeek,
  weekRecorded,
  weekSessions,
  weekStats,
  cycleState
} from './live';
import { state, ui } from './store';
import { WKVIEW_KEY, log, prefGet } from './storage';
import {
  doneElsewhere,
  fmtBig,
  fmtDateLong,
  noLog,
  planAhead,
  sessionsOn,
  tonnageNow,
  weekPlan,
  weekSlots,
  weekVolume
} from './display';
import { closeModal, openModal } from './page';
import { helpButton, howText, section } from './view';
import type { Part } from './view';
import { calBody, calNow, monthPlanned, planWords } from './calendar';
import type { Routine } from './types';

/* ---------- the bar ----------
   Week at a glance, in the bar at the top of every tab. Each cell is a day of
   this calendar week: filled green when you lifted, a green outline for
   cardio only, dashed for a planned workout still ahead, dashed red for a
   fixed-weekday workout that was missed. A trained day opens that session in
   History; today or a day ahead opens Today on the workout planned for it.
   Numbered cycles are projected forward from where you are in the rotation,
   the same rule Today uses, so the week shows what is coming. */

/** The bar's seven days: each one a button that opens it, the session in progress marked. */
function weekBar(): TemplateResult[] {
  const R = activeRoutine();
  const cur = weekStart(today()),
    t = today();
  const weekly = R.schedule === 'weekly';
  const cByDate: Record<string, { min: number }[]> = {};
  for (const c of state.cardio) (cByDate[c.date] = cByDate[c.date] || []).push(c);
  // A rest week plans nothing, so no day in it reads planned or missed (not "Upper A, missed" under "Rest week. Nothing planned.").
  const rw = isRestWeek(cur);
  const plan = rw ? {} : weekPlan(R);
  // Which planned workouts were done, and on which date, wherever in the week.
  const slots = weekly && !rw ? weekSlots(R) : [];
  // The + on empty past days appears once there is a log to add to; a brand-new week bar stays clean (the days still open the sheet).
  const hasLog = state.sessions.length > 0;
  const out: TemplateResult[] = [];
  for (let i = 0; i < WEEK_DAYS; i++) {
    const d = addDays(cur, i),
      ss = sessionsOn(d),
      trained = ss.length > 0,
      cd = cByDate[d] || [];
    const p = plan[d];
    const pd = p ? p.day : null;
    const isPlan = !!pd && !pd.rest && pd.items.length > 0;
    const isRest = !!pd && pd.rest;
    // The session in progress sits on its own date, which for a past workout is not today.
    const live = !!state.draft && !state.draft.editingId && d === state.draft.date;
    /* A planned day whose every workout was done on another day this week: not missed, nor still planned when it
       was done early (Tuesday's Pull done Monday is not planned on Tuesday). */
    const mine = slots.filter(x => x.di === i);
    const movedTo = !trained && weekly && isPlan && mine.length && mine.every(x => x.doneOn) ? mine : null;
    const cls = [
      'w',
      trained ? 'on' : '',
      !trained && cd.length ? 'cardio' : '',
      !trained && !cd.length && isPlan && d >= t && !movedTo ? 'plan' : '',
      !trained && weekly && isPlan && d < t && !movedTo ? 'miss' : '',
      movedTo ? 'moved' : '',
      !trained && !cd.length && isRest && d >= t ? 'rest' : '',
      d === t ? 'today' : '',
      live ? 'live' : ''
    ]
      .filter(Boolean)
      .join(' ');
    const first = ss[0];
    const name = first
      ? first.dayName + (ss.length > 1 ? ` +${ss.length - 1}` : '')
      : cd.length
        ? 'Cardio'
        : pd && d >= t
          ? isRest
            ? 'Rest'
            : pd.name
          : pd && weekly && isPlan && d < t
            ? pd.name
            : '';
    const what = trained
      ? `${ss.map(x => x.dayName).join(', ')}, logged`
      : live
        ? 'session in progress'
        : pd && isPlan && weekly && mine.length
          ? /* Each of the day's workouts in its own words: done on another day, missed, or planned (not "Push,
               missed" for Monday's Push done Tuesday and its second workout missed). */
            mine
              .map(
                x => `${x.day.name}, ${x.doneOn ? `done ${DAYS[dayOfWeek(x.doneOn)]}` : d < t ? 'missed' : 'planned'}`
              )
              .join('; ')
          : pd && isPlan
            ? d < t
              ? weekly
                ? `${pd.name}, missed`
                : 'nothing logged'
              : `${pd.name}, planned`
            : isRest && d >= t
              ? 'rest day'
              : rw
                ? 'rest week'
                : 'nothing logged';
    const label = `${DAYS[i]} ${fmtDate(d)}: ${what}${cd.length ? `, cardio ${cd.reduce((a, c) => a + c.min, 0)} min` : ''}`;
    const inner = html`<span class="wd">${WD2[i]}</span><span class="dn">${dayOfMonth(d)}</span><span class="nm">${name || ' '}</span>`;
    if (live && d < t)
      out.push(
        html`<button type="button" class=${cls} data-act="wkGo" data-date=${d} data-tip=${label} aria-label=${`${label}. Open the session`}>${inner}</button>`
      );
    // A day with two sessions asks which, as the calendar does: both go through calDay. Until r47 the bar opened one of them without asking.
    else if (first && ss.length > 1)
      out.push(
        html`<button type="button" class=${cls} data-act="calDay" data-date=${d} data-tip=${label} aria-label=${`${label}. Choose one to open`}>${inner}</button>`
      );
    else if (first)
      out.push(
        html`<button type="button" class=${cls} data-act="wkOpen" data-id=${first.id} data-tip=${label} aria-label=${`${label}. Open in History`}>${inner}</button>`
      );
    else if (d >= t)
      out.push(
        html`<button type="button" class=${cls} data-act="wkGo" data-date=${d} data-day=${p ? String(p.di) : nothing} data-tip=${label} aria-label=${`${label}. Open on Today`}>${inner}</button>`
      );
    // An empty past day logs a workout for that date: every day in the bar does something.
    else
      out.push(
        html`<button type="button" class=${hasLog ? `${cls} add` : cls} data-act="pastOpen" data-date=${d} data-tip=${`${label}. Tap to log it`} aria-label=${`${label}. Log a workout for this day`}>${inner}</button>`
      );
  }
  return out;
}
/** Draws the bar into the page's #wkbar; a failure is logged and leaves it empty. */
export function drawWeekBar(): void {
  const el = document.getElementById('wkbar');
  if (!el) return;
  try {
    render(weekBar(), el);
  } catch (e) {
    log('weekbar', e);
    render(nothing, el);
  }
}

/* ---------- the ring on Today's card ---------- */

/** What weekStats says of the week, as the ring and the card read it. */
type WeekNow = ReturnType<typeof weekStats>;

/** The week ring's radius, in the units of its 64 by 64 drawing. */
const RING_R = 26;

/* The week at a glance, beside the day's name: sessions done against the
   sessions the routine plans this week, the same two numbers as This week's
   title. V (2026-10-13): the headline counts what was done, not planned
   sets; hard sets against the plan stay inside This week. A ring fills,
   which reads faster than a sentence. Tapping it opens This week. */
/** The ring: sessions done of those planned this week; nothing when none is planned. */
export function heroRing(w: WeekNow): TemplateResult | typeof nothing {
  if (!(w.planDays > 0)) return nothing;
  const r = RING_R,
    c = 2 * Math.PI * r,
    p = Math.max(0, Math.min(1, w.doneDays / w.planDays));
  const pd = `${w.weekly || weekFactor(w.R) === 1 ? '' : 'about '}${w.planDays}`;
  const lbl = noLog() ? `No sessions logged yet; ${pd} planned this week` : `${w.doneDays} of ${pd} sessions this week`;
  return html`<button type="button" class="ring" data-act="goWeek" aria-label=${`${lbl}. Open This week`} data-tip=${lbl}><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r=${r} class="rt"></circle><circle cx="32" cy="32" r=${r} class="rp" stroke-dasharray=${`${(c * p).toFixed(2)} ${c.toFixed(2)}`} transform="rotate(-90 32 32)"></circle></svg><span class="rv">${noLog() ? NIL : html`${w.doneDays}<small>/${w.planDays}</small>`}</span><span class="rl">week</span></button>`;
}

/* ---------- This week ---------- */

/** The cycle's row of days: done this round, next, and rest. */
function cycleStrip(R: Routine): TemplateResult {
  const cs = cycleState(R);
  return html`<div class="cyc" role="list" aria-label="Your cycle">${R.days.map((d, i) => {
    const st = d.rest ? 'rest' : i === cs.next ? 'next' : cs.done.has(i) ? 'done' : '';
    const what = st === 'next' ? ', next up' : st === 'done' ? ', done this round' : d.rest ? ', rest' : '';
    return html`<span role="listitem" class=${`c ${st}`} data-tip=${`${dayLabel(R, i)}: ${d.name}${what}`}><b>${i + 1}</b>${d.rest ? 'Rest' : d.name}</span>`;
  })}</div>`;
}

/* Weight lifted this week, against last week to this point: This week owns
   everything about this week, At a glance the longer view. */
function liftedLine(): Part {
  const tn = tonnageNow();
  if (!tn.now && !tn.prevFull) return nothing;
  /* No percentage against last week: weight lifted falls when loads
     go up and reps come down, so as a headline it read progress as decline
     ("−5%" on a week of PRs). The number stays; the detail is in Stats. */
  return html`<button class="linkbtn wklift u-m6-0-0_tdnone_taleft" data-act="goDash" data-sec="svol"><b>${tn.now ? fmtBig(tn.now) : 0} ${U()}</b> lifted</button>`;
}

/** Whether This week shows the month, remembered on this device (Week or Month). */
function monthView(): boolean {
  if (ui.wkView === undefined) ui.wkView = prefGet(WKVIEW_KEY) === 'month' ? 'month' : 'week';
  return ui.wkView === 'month';
}

function cardioLine(w: WeekNow): Part {
  return w.cardioMin
    ? html`<p class="small u-m5-0-0">Cardio and mobility: ${w.cardioMin} min in ${w.cardioN} entr${w.cardioN === 1 ? 'y' : 'ies'}</p>`
    : nothing;
}

/* Any week (V 2026-11-10: "what is this week doing?" Month steps through months and opens its days; Week
   showed only this week, with its days only in the bar at the top). ‹ and › step a week at a time, as Month steps,
   from the first week with a session or cardio to a year ahead, and every day of the week shown is listed with what
   it holds; a tap does what the same day does in the month calendar (calDay, wkGo). A week before this one is read
   against what was planned then (weekNeed, from the sessions' own record), never the routine as it is now. */
/** How far ahead This week steps, in weeks: a year, as the calendar. */
const AHEAD_WEEKS = 52;
/** The weeks This week steps between: from the first week with a session or cardio, to a year ahead. */
export function weekBounds(): { min: string; max: string } {
  const cur = weekStart(today());
  const f = firstDate([...state.sessions, ...state.cardio]);
  return { min: f && weekStart(f) < cur ? weekStart(f) : cur, max: addDays(cur, WEEK_DAYS * AHEAD_WEEKS) };
}
/** The Monday of the week This week shows: the one stepped to, while it is within its weeks, else this week's. */
export function weekShown(): string {
  const ws = ui.wkWs;
  const { min, max } = weekBounds();
  return typeof ws === 'string' && ws >= min && ws <= max ? ws : weekStart(today());
}
/** A week's dates in words, "Nov 3 to Nov 9", each with its year when it is not this one. */
function weekWords(ws: string): string {
  const t = today();
  return `${fmtDateFrom(ws, t)} to ${fmtDateFrom(addDays(ws, WEEK_DAYS - 1), t)}`;
}
/** ‹ the week's dates ›, as the month's header. */
function weekNav(ws: string): TemplateResult {
  const { min, max } = weekBounds();
  return html`<div class="cal-h"><button class="ib" data-act="wkStep" data-v="-1" aria-label="Previous week" ?disabled=${ws <= min}>‹</button><h4>${weekWords(ws)}</h4><button class="ib" data-act="wkStep" data-v="1" aria-label="Next week" ?disabled=${ws >= max}>›</button></div>`;
}
/** The week's seven days, each with its sessions, its cardio, or the workout planned on it; a tap does what the calendar's day does. */
function weekDays(ws: string): TemplateResult {
  const t = today();
  const plan = planAhead(addDays(ws, WEEK_DAYS - 1));
  const moved = doneElsewhere();
  const rows: TemplateResult[] = [];
  for (let i = 0; i < WEEK_DAYS; i++) {
    const d = addDays(ws, i);
    const ss = sessionsOn(d);
    const c = state.cardio.filter(x => x.date === d).reduce((a, x) => a + x.min, 0);
    const ahead = d > t ? plan[d] : undefined;
    // A training day ahead is a tap to it on Today; a rest day ahead says so; the calendar reads days ahead the same way.
    // Done on another day this week, as the bar says: said so, and not offered again.
    const done = moved[d];
    const p = ahead && !ahead.day.rest && ahead.day.items.length && !done ? ahead : undefined;
    const rest = !!ahead && ahead.day.rest;
    const what = ss.length
      ? ss.map(x => x.dayName || 'Session').join(', ') + (c ? `, cardio ${c} min` : '')
      : c
        ? `Cardio ${c} min`
        : done
          ? done.map(x => `${x.name}, done ${DAYS[dayOfWeek(x.on)]}`).join('; ')
          : p
            ? `${p.day.name}, planned`
            : rest
              ? 'Rest'
              : d === t
                ? 'Nothing logged yet'
                : d > t
                  ? ''
                  : 'Nothing logged';
    const cls = ['wkday', ss.length ? 'on' : '', !ss.length && !c ? 'none' : '', d === t ? 'today' : '']
      .filter(Boolean)
      .join(' ');
    const inner = html`<span class="wkday-d">${DAYS[i]} ${dayOfMonth(d)}</span><span class="wkday-n">${what || NIL}</span>`;
    const lbl = `${fmtDateLong(d)}: ${what || 'nothing planned'}`;
    rows.push(
      html`<li>${
        p
          ? html`<button type="button" class=${cls} data-act="wkGo" data-date=${d} data-day=${String(p.di)} aria-label=${`${lbl}. Open on Today`}>${inner}</button>`
          : d > t
            ? html`<span class=${cls} data-date=${d}>${inner}</span>`
            : html`<button type="button" class=${cls} data-act="calDay" data-date=${d} aria-label=${lbl}>${inner}</button>`
      }</li>`
    );
  }
  return html`<ul class="wkdays">${rows}</ul>`;
}
/** A week other than this one: its days, its hard sets, its cardio and its weight lifted; ahead, its days alone. */
function otherWeek(ws: string): TemplateResult {
  const cur = weekStart(today());
  if (ws > cur) return html`${weekNav(ws)}${weekDays(ws)}`;
  const got = IDX().weekHard[ws] || 0;
  const cardio = state.cardio.filter(c => c.date >= ws && c.date <= addDays(ws, WEEK_DAYS - 1));
  const cmin = cardio.reduce((a, c) => a + c.min, 0);
  const vol = weekVolume(ws);
  return html`${weekNav(ws)}${weekDays(ws)}
<p class="small muted u-m5-0-0">${isRestWeek(ws) ? 'Rest week. ' : ''}${r1(got)} hard set${r1(got) === 1 ? '' : 's'} logged.</p>${
    cmin
      ? html`<p class="small u-m5-0-0">Cardio and mobility: ${cmin} min in ${cardio.length} entr${cardio.length === 1 ? 'y' : 'ies'}</p>`
      : nothing
  }${vol ? html`<p class="small u-m5-0-0"><b>${fmtBig(vol)} ${U()}</b> lifted</p>` : nothing}`;
}

function weekBody(w: WeekNow): Part {
  /* The two numbers are counted differently on purpose and the label has to
     say so: the denominator is every hard set the routine plans (RIR 3 or
     less, halved in a deload week), the numerator is
     only the sets that counted as hard. You cannot reach 100% on a week where
     you left RIR at 4 or above. The day-by-day week is the bar at the top. */
  const month = monthView();
  const tog = html`<div class="wkview" role="group" aria-label="Show"><button type="button" data-act="wkView" data-v="week" aria-pressed=${String(!month)} class=${month ? nothing : 'on'}>Week</button><button type="button" data-act="wkView" data-v="month" aria-pressed=${String(month)} class=${month ? 'on' : nothing}>Month</button></div>`;
  if (month) return html`${tog}<div class="cal-inline">${calBody(calNow(), true)}</div>`;
  const ws = weekShown();
  if (ws !== weekStart(today())) return html`${tog}${otherWeek(ws)}`;
  const head = html`${weekNav(ws)}${weekDays(ws)}`;
  if (freeMode())
    return html`${tog}${head}<div class="hrow u-m5-0-0"><p class="small muted u-m0" id="wkSets">${noLog() ? 'Nothing logged yet.' : `${r1(w.got)} hard sets this week.`}</p>${helpButton('wk')}</div>
${cardioLine(w)}${liftedLine()}
${howText('wk', 'Each set counts once; a set at RIR 4 or more is not hard and does not count. Muscle targets are on the Muscle map and in Stats.')}`;
  if (w.rest)
    return html`${tog}${head}<div class="hrow u-m5-0-0"><p class="small muted u-m0" id="wkSets">Rest week. ${w.got ? `${r1(w.got)} hard sets logged.` : 'Nothing planned.'}</p>${helpButton('wk')}</div>
${cardioLine(w)}${liftedLine()}
${howText('wk', 'A rest week you marked under More options on Today. It does not count as missed: your averages, streak, and adherence skip it.')}`;
  return html`${tog}${head}${w.weekly ? nothing : cycleStrip(w.R)}
<div class="band" data-tip=${noLog() ? `${w.tgt} hard sets planned` : `${w.got} hard sets logged of ${w.tgt} planned`}><div class="fill prog" style=${`width:${w.pct}%;--pct:${w.pct}`}></div></div>
${cardioLine(w)}
<div class="hrow u-m5-0-0"><p class="small muted u-m0" id="wkSets">${noLog() ? `${w.tgt} hard sets planned this week.` : `${w.got} hard sets logged of ${w.tgt} planned${w.tgt > 0 ? ` (${Math.round(w.pct)}%)` : ''}.`}</p>${helpButton('wk')}</div>
${liftedLine()}
${howText('wk', `Each set counts once; a set at RIR 4 or more is not hard and does not count. The bar at the top of every tab is this calendar week: filled is a day you lifted, a coloured outline is cardio only, a grey ring is a workout planned ahead${w.weekly ? ', a red ring is a planned workout that was missed, and a plain day is one done on another day' : ''}. Tap a filled day to open it in History; tap today or a day ahead to see its workout here; tap an empty past day (marked +) to log a workout for it.${w.weekly ? '' : ' The row above the bar is your cycle: green is done this round, outlined is next.'}`)}`;
}

/** This week on Today: the week (or the month) and what it holds. */
export function weekCard(): TemplateResult {
  const w = weekStats();
  const body = weekBody(w);
  /* The title follows the view (V): This week, or This month (the
     month's name for an earlier one) with that month's session count. */
  if (monthView()) {
    const ym = calNow();
    const cur = monthOf(today());
    const n = Object.keys(dateIndex().byDate)
      .filter(d => monthOf(d) === ym)
      .reduce((a, d) => a + sessionsOn(d).length, 0);
    const title =
      ym === cur
        ? 'This month'
        : new Date(ym + '-15T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    // A month ahead counts what is planned in it.
    const sub = ym > cur ? planWords(monthPlanned(ym)) : `${n} session${n === 1 ? '' : 's'}`;
    return section({ sk: 'today:week', key: 'week', title, sub, body });
  }
  const ws = weekShown();
  if (ws !== weekStart(today())) {
    /* Another week: its dates, and its sessions against what was planned then, as its sessions recorded it; with no
       record, its sessions alone, never against the routine as it is now; or what is planned ahead. */
    const n = weekSessions(ws);
    const rec = weekRecorded(ws);
    const ahead = ws > weekStart(today());
    const planned = ahead
      ? Object.entries(planAhead(addDays(ws, WEEK_DAYS - 1))).filter(
          ([d, p]) => d >= ws && !p.day.rest && p.day.items.length
        ).length
      : 0;
    const sub = ahead
      ? planWords(planned)
      : isRestWeek(ws)
        ? `Rest week${n ? `, ${n} session${n === 1 ? '' : 's'}` : ''}`
        : freeMode() || rec == null
          ? `${n} session${n === 1 ? '' : 's'}`
          : `${n} of ${rec} sessions`;
    return section({ sk: 'today:week', key: 'week', title: weekWords(ws), sub, body });
  }
  const done = `${w.doneDays} session${w.doneDays === 1 ? '' : 's'}`;
  if (freeMode())
    return section({
      sk: 'today:week',
      key: 'week',
      title: 'This week',
      sub: w.rest ? `Rest week${w.doneDays ? `, ${done}` : ''}` : noLog() ? 'Nothing logged yet' : done,
      body
    });
  if (w.rest)
    return section({
      sk: 'today:week',
      key: 'week',
      title: 'This week',
      sub: `Rest week${w.doneDays ? `, ${done}` : ''}`,
      body
    });
  const about = w.weekly || weekFactor(w.R) === 1 ? '' : '~';
  return section({
    sk: 'today:week',
    key: 'week',
    title: 'This week',
    sub: noLog() ? `${about}${w.planDays} sessions planned` : `${w.doneDays} of ${about}${w.planDays} sessions`,
    body
  });
}

/* ---------- the pull-down ----------
   A finger drawn down from the week bar brings the month calendar out of the bar's bottom edge, its edge following
   the finger, with the bar in view above it and the page under it dimming as far as the pull has come (V,
   2026-11-12: it came down from the top of the screen over the bar, and that did not read as pulled from the bar).
   Let go past PULL.open and it stays open under the bar; short of it, it slides back into the bar and closes. Drawn
   back up, it slides into the bar and closes; a tap outside it, the bar included, closes it. It never opens from the
   bottom while the finger pulls down from the top (V had a pull like that removed on 2026-10-01). A tap on a day,
   and a sideways move, stay the bar's: the calendar comes only once the finger has gone PULL.start down and more
   down than sideways, and only with the page at its top: the bar scrolls with the page (V, 2026-11-12), so a drag
   down on it scrolled partly away is the page's scroll back up. */
/** The pull's distances in CSS pixels: how far down before it starts, and how far before letting go keeps it open. */
const PULL = { start: 12, open: 70 } as const;
/** The calendar sheet that came down from the top, if it is open. */
const topSheet = (): HTMLElement | null => {
  const el = document.querySelector('#modal .sheet.fromtop');
  return el instanceof HTMLElement ? el : null;
};
/** How long the sheet takes to slide into place or into the bar (the stylesheet's transition for .sheet.fromtop), and
    the time past that a sheet sliding into the bar waits for the slide's end before it closes all the same. */
const SLIDE = { ms: 220, spare: 60 } as const;
/** How far the sheet is out of the bar, 0 to 1, given to the layer it sits on, which dims the page by it. */
function pulled(sh: HTMLElement, p: number): void {
  const md = sh.parentElement;
  if (md) md.style.setProperty('--pull', String(Math.max(0, Math.min(1, p))));
}
/* The sheet sits just under the bar, and is moved up (y below 0) to be inside it: the part moved above the bar's
   bottom edge is cut off, so the calendar shows coming out of the bar, never over it. */
/** The sheet moved to follow the finger: out of the bar as it opens, or back into it as it closes. */
function follow(sh: HTMLElement, y: number): void {
  const h = sh.offsetHeight,
    up = Math.round(Math.max(-h, Math.min(0, y)));
  sh.classList.add('drag');
  sh.style.transform = `translateY(${up}px)`;
  sh.style.clipPath = `inset(${-up}px 0 0 0)`;
  pulled(sh, h ? 1 + up / h : 1);
}
/** The sheet let go: back to its place under the bar, or slid into the bar and closed. */
function settle(sh: HTMLElement, keep: boolean): void {
  sh.classList.remove('drag');
  if (keep) {
    sh.style.transform = '';
    sh.style.clipPath = '';
    pulled(sh, 1);
    return;
  }
  const h = sh.offsetHeight;
  sh.style.transform = `translateY(${-h}px)`;
  sh.style.clipPath = `inset(${h}px 0 0 0)`;
  pulled(sh, 0);
  // Closed once it is inside the bar; by the clock as well, since a phone set to reduce motion runs no transition.
  let gone = false;
  const close = (): void => {
    if (gone) return;
    gone = true;
    if (topSheet() === sh) closeModal();
  };
  sh.addEventListener('transitionend', close, { once: true });
  setTimeout(close, SLIDE.ms + SLIDE.spare);
}
/** Adds the pull-down's listeners to the week bar, and the push-up's to the calendar it opens; run once at start. */
export function pullStart(): void {
  const bar = document.getElementById('wkbar');
  if (!bar) return;
  let y0 = 0,
    x0 = 0,
    dy = 0,
    live = false,
    on = false;
  bar.addEventListener(
    'touchstart',
    e => {
      const t = e.touches[0];
      live = e.touches.length === 1 && !ui.modal && !!t && window.scrollY <= 0;
      on = false;
      dy = 0;
      if (t) {
        y0 = t.clientY;
        x0 = t.clientX;
      }
    },
    { passive: true }
  );
  bar.addEventListener(
    'touchmove',
    e => {
      const t = e.touches[0];
      if (!live || !t) return;
      dy = t.clientY - y0;
      const dx = t.clientX - x0;
      if (!on) {
        // Sideways, or up: the bar's own (a tap, the page's scroll); the pull is not started for this touch.
        if (Math.abs(dx) > PULL.start && Math.abs(dx) >= dy) live = false;
        /* Down, with the page at its top, is the pull's from the first move: a phone left to scroll it starts the
           page's own bounce under the finger and keeps it for the whole touch, the calendar moving over a page that
           moves too. Nothing is lost to the page, which has nothing above to scroll to. */
        if (live && dy > 0 && dy >= Math.abs(dx)) e.preventDefault();
        if (dy < PULL.start || Math.abs(dx) >= dy) return;
        on = true;
        // Where the bar ends, for the calendar to come out of it there.
        const md = document.getElementById('modal');
        const head = bar.closest('header');
        if (md && head) md.style.setProperty('--bar-b', `${Math.round(head.getBoundingClientRect().bottom)}px`);
        openModal({ kind: 'calendar', ym: monthOf(today()), top: true });
      }
      // The page must not scroll or bounce under the pull.
      e.preventDefault();
      const sh = topSheet();
      if (sh) follow(sh, dy - sh.offsetHeight);
    },
    { passive: false }
  );
  const end = (): void => {
    if (!live) return;
    live = false;
    if (!on) return;
    on = false;
    const sh = topSheet();
    if (sh) settle(sh, dy >= PULL.open);
  };
  bar.addEventListener('touchend', end);
  bar.addEventListener('touchcancel', end);
  // The calendar drawn back up closes it; a short push goes back. A tap on a day inside it is the calendar's own.
  let u0 = 0,
    up = 0,
    pushing = false;
  document.addEventListener(
    'touchstart',
    e => {
      const t = e.touches[0];
      const sh = topSheet();
      pushing = !!t && !!sh && e.touches.length === 1 && e.target instanceof Node && sh.contains(e.target);
      up = 0;
      if (t) u0 = t.clientY;
    },
    { passive: true }
  );
  document.addEventListener(
    'touchmove',
    e => {
      const t = e.touches[0];
      const sh = topSheet();
      if (!pushing || !t || !sh) return;
      up = t.clientY - u0;
      // Once moved, the sheet follows the finger both ways, never below its place.
      if (up < -PULL.start || sh.classList.contains('drag')) {
        e.preventDefault();
        follow(sh, Math.min(0, up));
      }
    },
    { passive: false }
  );
  // Let go anywhere, a sheet the push moved settles: closed when it ends PULL.open up, else back in place (brought back
  // down before letting go, it is not left moved up, its header off the screen).
  const done = (): void => {
    if (!pushing) return;
    pushing = false;
    const sh = topSheet();
    if (sh && sh.classList.contains('drag')) settle(sh, up > -PULL.open);
  };
  document.addEventListener('touchend', done);
  document.addEventListener('touchcancel', done);
}
