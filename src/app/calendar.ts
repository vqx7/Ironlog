/* The month calendar (r59, phase 5): any date one tap away. A day with a
   session opens it in History, a day with two asks which, an empty past day
   logs a workout for it (as in the week bar), and today opens Today (calDay,
   in the legacy script with what it opens). It sits inline in This week on
   Today (Week or Month, r26), and opens as a sheet from History's Calendar
   button and a Consistency square; drawn by lit-html as src/27-actions.js
   drew it. The pull-down on the week bar (r25) is gone: the calendar rose
   from the bottom of the screen while the finger pulled down from the top. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { DAYS } from './routines';
import { MONTHS } from './format';
import { today } from './util';
import { firstDate } from './charts';
import { state, ui } from './store';
import { fmtDateLong, sessionsOn } from './display';

/** The months the calendar moves between: from the first month with a session or cardio, to this month. */
export function calBounds(): { min: string; max: string } {
  const t = today().slice(0, 7);
  const f = firstDate([...state.sessions, ...state.cardio]);
  return { min: f && f.slice(0, 7) < t ? f.slice(0, 7) : t, max: t };
}

/** The month This week shows: the one moved to, while it is within the calendar's months, else this month. */
export function calNow(): string {
  const cur = today().slice(0, 7);
  const ym = ui['calYm'];
  return typeof ym === 'string' && ym <= cur ? ym : cur;
}

/** The month's header and grid, for the sheet (inline false) and This week (inline true). */
export function calBody(ym: string, inline: boolean): TemplateResult {
  const [y = 0, mo = 1] = ym.split('-').map(Number);
  const dim = new Date(y, mo, 0).getDate();
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7;
  const t = today();
  const cd: Record<string, number> = {};
  for (const c of state.cardio) cd[c.date] = (cd[c.date] || 0) + c.min;
  const { min, max } = calBounds();
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
    cells.push(
      d > t
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
<div class="row spread" style="margin-top:10px"><p class="small muted" style="margin:0">${n ? `${n} session${n === 1 ? '' : 's'}` : 'No sessions'}${ym === max ? ' so far' : ''}</p>${
    ym !== max
      ? html`<button class="btn sm" data-act="calMonth" data-v="now" data-inline=${inl}>This month</button>`
      : ''
  }</div>`;
}

/** The calendar as a sheet, opened at a month. */
export function calSheet(m: { ym: string }): TemplateResult {
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="calH">${calBody(m.ym, false)}</div>`;
}
