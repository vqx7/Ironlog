/* The week (r59, phase 5): the bar at the top of every tab, Today's This
   week card (the week, or the month, the cycle's row and the hard sets
   against the plan) and the ring on Today's start card, drawn by lit-html as
   src/21-pick-session.js drew them. What a day of the bar opens (History, a
   past workout, Today on that day) stays with that code, by the button's
   data-act as before. And what the routine plans on a date ahead (329: the
   calendar shows it). */

import { html, nothing, render } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { DAYS, dayLabel, weekFactor } from './routines';
import { NIL, WD2, fmtDate } from './format';
import { addDays, r1, today, weekStart, monthOf, dayOfMonth, WEEK_DAYS } from './util';
import { U, activeRoutine, dateIndex, freeMode, isRestWeek, weekStats, cycleState } from './live';
import { state, ui } from './store';
import { WKVIEW_KEY, log, prefGet } from './storage';
import { fmtBig, noLog, sessionsOn, tonnageNow, weekPlan } from './display';
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
  // A rest week plans nothing, so no day in it reads planned or missed (r55, the audit: the bar said "Upper A, missed" under "Rest week. Nothing planned.").
  const rw = isRestWeek(cur);
  const plan = rw ? {} : weekPlan(R);
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
    const cls = [
      'w',
      trained ? 'on' : '',
      !trained && cd.length ? 'cardio' : '',
      !trained && !cd.length && isPlan && d >= t ? 'plan' : '',
      !trained && weekly && isPlan && d < t ? 'miss' : '',
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
    // A day with two sessions asks which, as the calendar does (r47): both go through calDay. Until r47 the bar opened one of them without asking.
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
    // An empty past day logs a workout for that date (item 53): every day in the bar does something.
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

/* Weight lifted this week, against last week to this point. It moved here from
   At a glance in r23 (item 32): This week owns everything about this week,
   At a glance the longer view. */
function liftedLine(): Part {
  const tn = tonnageNow();
  if (!tn.now && !tn.prevFull) return nothing;
  /* No percentage against last week (r30): weight lifted falls when loads
     go up and reps come down, so as a headline it read progress as decline
     ("−5%" on a week of PRs). The number stays; the detail is in Stats. */
  return html`<button class="linkbtn wklift" data-act="goDash" data-sec="svol" style="margin:6px 0 0;text-decoration:none;text-align:left"><b>${tn.now ? fmtBig(tn.now) : 0} ${U()}</b> lifted</button>`;
}

/** Whether This week shows the month, remembered on this device (Week or Month, r26). */
function monthView(): boolean {
  if (ui.wkView === undefined) ui.wkView = prefGet(WKVIEW_KEY) === 'month' ? 'month' : 'week';
  return ui.wkView === 'month';
}

function cardioLine(w: WeekNow): Part {
  return w.cardioMin
    ? html`<p class="small" style="margin:5px 0 0">Cardio and mobility: ${w.cardioMin} min in ${w.cardioN} entr${w.cardioN === 1 ? 'y' : 'ies'}</p>`
    : nothing;
}

function weekBody(w: WeekNow): Part {
  /* The two numbers are counted differently on purpose and the label has to
     say so: the denominator is every hard set the routine plans (RIR 3 or
     less, halved in a deload week; r27), the numerator is
     only the sets that counted as hard. You cannot reach 100% on a week where
     you left RIR at 4 or above. The day-by-day week is the bar at the top. */
  const month = monthView();
  const tog = html`<div class="wkview" role="group" aria-label="Show"><button type="button" data-act="wkView" data-v="week" aria-pressed=${String(!month)} class=${month ? nothing : 'on'}>Week</button><button type="button" data-act="wkView" data-v="month" aria-pressed=${String(month)} class=${month ? 'on' : nothing}>Month</button></div>`;
  if (month) return html`${tog}<div class="cal-inline">${calBody(calNow(), true)}</div>`;
  if (freeMode())
    return html`${tog}<div class="hrow" style="margin:5px 0 0"><p class="small muted" style="margin:0" id="wkSets">${noLog() ? 'Nothing logged yet.' : `${r1(w.got)} hard sets this week.`}</p>${helpButton('wk')}</div>
${cardioLine(w)}${liftedLine()}
${howText('wk', 'Each set counts once; a set at RIR 4 or more is not hard and does not count. Muscle targets are on the Muscle map and in Stats.')}`;
  if (w.rest)
    return html`${tog}<div class="hrow" style="margin:5px 0 0"><p class="small muted" style="margin:0" id="wkSets">Rest week. ${w.got ? `${r1(w.got)} hard sets logged.` : 'Nothing planned.'}</p>${helpButton('wk')}</div>
${cardioLine(w)}${liftedLine()}
${howText('wk', 'A rest week you marked under More options on Today. It does not count as missed: your averages, streak, and adherence skip it.')}`;
  return html`${tog}${w.weekly ? nothing : cycleStrip(w.R)}
<div class="band" data-tip=${noLog() ? `${w.tgt} hard sets planned` : `${w.got} hard sets logged of ${w.tgt} planned`}><div class="fill prog" style=${`width:${w.pct}%`}></div></div>
${cardioLine(w)}
<div class="hrow" style="margin:5px 0 0"><p class="small muted" style="margin:0" id="wkSets">${noLog() ? `${w.tgt} hard sets planned this week.` : `${w.got} hard sets logged of ${w.tgt} planned${w.tgt > 0 ? ` (${Math.round(w.pct)}%)` : ''}.`}</p>${helpButton('wk')}</div>
${liftedLine()}
${howText('wk', `Each set counts once; a set at RIR 4 or more is not hard and does not count. The bar at the top of every tab is this calendar week: filled is a day you lifted, a coloured outline is cardio only, a grey ring is a workout planned ahead${w.weekly ? ', a red ring is a planned workout that was missed' : ''}. Tap a filled day to open it in History; tap today or a day ahead to see its workout here; tap an empty past day (marked +) to log a workout for it.${w.weekly ? '' : ' The row above the bar is your cycle: green is done this round, outlined is next.'}`)}`;
}

/** This week on Today: the week (or the month) and what it holds. */
export function weekCard(): TemplateResult {
  const w = weekStats();
  const body = weekBody(w);
  /* The title follows the view (V, r28): This week, or This month (the
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
    // A month ahead counts what is planned in it (329, r59).
    const sub = ym > cur ? planWords(monthPlanned(ym)) : `${n} session${n === 1 ? '' : 's'}`;
    return section({ sk: 'today:week', key: 'week', title, sub, body });
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
