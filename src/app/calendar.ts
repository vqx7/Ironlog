/* The month calendar (r59, phase 5): any date one tap away. A day with a
   session opens it in History, a day with two asks which, an empty past day
   logs a workout for it (as in the week bar), and today opens Today (calDay,
   in actsstart.ts with what it opens, r63). A day ahead shows the workout
   the routine plans on it and opens Today on that workout, for a year ahead
   (329, r59: until then days ahead were blank and the months stopped at
   this one). It sits inline in This week on
   Today (Week or Month, r26), and opens as a sheet from History's Calendar
   button and a Consistency square; drawn by lit-html as src/27-actions.js
   drew it. The pull-down on the week bar (r25) is gone: the calendar rose
   from the bottom of the screen while the finger pulled down from the top. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { DAYS } from './routines';
import { MONTHS } from './format';
import { today, monthOf, dayOfWeek } from './util';
import { firstDate } from './charts';
import { state, ui } from './store';
import { fmtDateLong, planAhead, sessionsOn } from './display';
import type { PlannedDay } from './display';

/* How far ahead the calendar goes (329, r59): a year, as far as a lifter
   plans; until r59 it stopped at this month. */
const AHEAD_MONTHS = 12;
/** The month `k` months after a month (YYYY-MM). */
function monthPlus(ym: string, k: number): string {
  const [y = 0, mo = 1] = ym.split('-').map(Number);
  const d = new Date(y, mo - 1 + k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** The months the calendar moves between: from the first month with a session or cardio, to a year ahead. */
export function calBounds(): { min: string; max: string } {
  const t = monthOf(today());
  const f = firstDate([...state.sessions, ...state.cardio]);
  return { min: f && monthOf(f) < t ? monthOf(f) : t, max: monthPlus(t, AHEAD_MONTHS) };
}

/** The month This week shows: the one moved to, while it is within the calendar's months, else this month. */
export function calNow(): string {
  const ym = ui.calYm;
  const { min, max } = calBounds();
  return typeof ym === 'string' && ym >= min && ym <= max ? ym : monthOf(today());
}

/** The month's last date (YYYY-MM-DD). */
function monthEnd(ym: string): string {
  const [y = 0, mo = 1] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, mo, 0).getDate()).padStart(2, '0')}`;
}
/** The training days the routine plans in a month after today (a rest day, or a day with nothing in it, is none). */
function plannedIn(ym: string): Record<string, PlannedDay> {
  const out: Record<string, PlannedDay> = {};
  for (const [d, p] of Object.entries(planAhead(monthEnd(ym))))
    if (d.startsWith(ym) && !p.day.rest && p.day.items.length) out[d] = p;
  return out;
}
/** How many training days the routine plans in a month after today. */
export function monthPlanned(ym: string): number {
  return Object.keys(plannedIn(ym)).length;
}

/** The month's header and grid, for the sheet (inline false) and This week (inline true). */
export function calBody(ym: string, inline: boolean): TemplateResult {
  const [y = 0, mo = 1] = ym.split('-').map(Number);
  const dim = new Date(y, mo, 0).getDate();
  const lead = dayOfWeek(`${ym}-01`);
  const t = today();
  const cd: Record<string, number> = {};
  for (const c of state.cardio) cd[c.date] = (cd[c.date] || 0) + c.min;
  const { min, max } = calBounds();
  const cur = monthOf(t);
  // The days ahead show the workout planned on them, a tap away on Today (wkGo, as the week bar's days ahead).
  const plan = ym >= cur ? plannedIn(ym) : {};
  const cells: TemplateResult[] = [];
  let n = 0;
  for (let i = 1; i <= dim; i++) {
    const d = `${ym}-${String(i).padStart(2, '0')}`;
    const ss = sessionsOn(d);
    const c = cd[d] || 0;
    if (ss.length) n += ss.length;
    const cls = [
      'cd',
      ss.length ? 'on' : '',
      !ss.length && c ? 'cardio' : '',
      d === t ? 'today' : '',
      d > t ? 'fut' : ''
    ]
      .filter(Boolean)
      .join(' ');
    const what = ss.length
      ? ss.map(x => x.dayName || 'Session').join(', ')
      : c
        ? `cardio ${c} min`
        : d > t
          ? ''
          : 'nothing logged';
    const inner = html`<span class="n">${i}</span><span class="x">${ss.length > 1 ? '×' + ss.length : ''}</span>`;
    const p = d > t ? plan[d] : undefined;
    cells.push(
      p
        ? html`<button type="button" class=${cls + ' plan'} data-act="wkGo" data-date=${d} data-day=${p.di} aria-label=${`${fmtDateLong(d)}: ${p.day.name}, planned. Open on Today`} data-tip=${p.day.name}>${inner}</button>`
        : d > t
          ? html`<span class=${cls} aria-hidden="true">${inner}</span>`
          : html`<button type="button" class=${cls} data-act="calDay" data-date=${d} aria-label=${fmtDateLong(d) + ': ' + what} data-tip=${what && what !== 'nothing logged' ? what : nothing}>${inner}</button>`
    );
  }
  const inl = inline ? '1' : nothing;
  const title = `${MONTHS[mo - 1]} ${y}`;
  return html`<div class="cal-h"><button class="ib" data-act="calMonth" data-v="-1" data-inline=${inl} aria-label="Previous month" ?disabled=${ym <= min}>‹</button>${
    inline ? html`<h4 id="calHi">${title}</h4>` : html`<h3 id="calH">${title}</h3>`
  }<button class="ib" data-act="calMonth" data-v="1" data-inline=${inl} aria-label="Next month" ?disabled=${ym >= max}>›</button>${
    inline ? '' : html`<button class="ib" aria-label="Close" data-act="mClose">✕</button>`
  }</div>
<div class="cal-g">${DAYS.map(d => html`<span class="wd">${d.slice(0, 2)}</span>`)}${Array.from({ length: lead }, () => html`<span></span>`)}${cells}</div>
<div class="row spread u-mt10"><p class="small muted u-m0">${
    ym > cur
      ? planWords(Object.keys(plan).length)
      : `${n ? `${n} session${n === 1 ? '' : 's'}` : 'No sessions'}${ym === cur ? ' so far' : ''}`
  }</p>${
    ym !== cur
      ? html`<button class="btn sm" data-act="calMonth" data-v="now" data-inline=${inl}>This month</button>`
      : ''
  }</div>`;
}

/** A month ahead's line: its planned training days. */
export function planWords(k: number): string {
  return k ? `${k} planned` : 'Nothing planned';
}

/** The calendar as a sheet, opened at a month. */
export function calSheet(m: { ym: string }): TemplateResult {
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="calH">${calBody(m.ym, false)}</div>`;
}
