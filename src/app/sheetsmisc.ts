/* The sheets that ask one thing (r62, PENDING 355): a question with its
   answers, a block of text to copy or paste, a rest week, the sessions of a
   day with two, and cardio logged on its own. Each is drawn by lit-html as
   src/24-sheets.js drew it (tests/r62.js holds them to r61's), and opened and
   answered by the legacy script's actions by their data-act until those move
   (r63). */

import { html } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { addDays, today, weekStart, WEEK_DAYS } from './util';
import { fmtDate, sessTm } from './format';
import { CARDIO } from './library';
import { isRestWeek } from './live';
import { distU, sessionsOn } from './display';

/** The close button every sheet has in its header. */
export const closeX = (): TemplateResult => html`<button class="ib" aria-label="Close" data-act="mClose">✕</button>`;

/** A question: what it asks, its answer, and a second answer when it has one. */
export interface ConfirmSheet {
  title: string;
  body: string;
  okLabel: string;
  danger?: boolean | undefined;
  alt?: { label: string; quiet?: boolean | undefined; only?: boolean | undefined } | null | undefined;
}

/* A question (confirmBox). A second answer is a button beside the first, or
   a quiet link under them; Cancel goes unless the second answer is the only
   other one. */
/** The question sheet. */
export function confirmSheet(m: ConfirmSheet): TemplateResult {
  const alt = m.alt;
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${m.title}</h3></div><p>${m.body}</p><div class="row" style="margin-top:12px"><button class=${'btn ' + (m.danger ? 'danger' : 'primary')} data-act="mOk">${m.okLabel}</button>${alt && !alt.quiet ? html`<button class="btn" data-act="mAlt">${alt.label}</button>` : ''}${alt && alt.only ? '' : html`<button class="btn" data-act="mClose">Cancel</button>`}</div>${alt && alt.quiet ? html`<button class="linkbtn alt-quiet" data-act="mAlt">${alt.label}</button>` : ''}</div>`;
}

/** A block of text to copy (a backup, a report) or to paste (an import). */
export interface TextSheet {
  title: string;
  help: string;
  text?: string | undefined;
  readonly?: boolean | undefined;
}

/** The text sheet: read-only text with Copy, or a field to paste into with Import. */
export function textSheet(m: TextSheet): TemplateResult {
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${m.title}</h3>${closeX()}</div>
    <p class="small muted">${m.help}</p><textarea id="mText" aria-label=${m.title || 'Text'} style="min-height:220px;font-size:13px" ?readonly=${!!m.readonly}>${m.text || ''}</textarea>
    <div class="row" style="margin-top:10px">${m.readonly ? html`<button class="btn primary" data-act="copyText">Copy</button>` : html`<button class="btn primary" data-act="importText">Import</button>`}<button class="btn" data-act="mClose">Close</button></div></div>`;
}

/** The rest week sheet: this week or last marked as a week off on purpose, or taken off again. */
export function restWeekSheet(): TemplateResult {
  const cur = weekStart(today());
  const weeks: [string, string][] = [
    [cur, 'This week'],
    [addDays(cur, -WEEK_DAYS), 'Last week']
  ];
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="rwH"><div class="sheet-h"><h3 id="rwH">Rest week</h3>${closeX()}</div>
    <p class="small muted" style="margin:0 0 10px">A week off on purpose. It is not counted as missed: averages, streak, and adherence skip it.</p>
    <div class="stack">${weeks.map(([w, l]) => {
      const on = isRestWeek(w);
      return html`<button class=${'btn block ' + (on ? 'primary' : '')} data-act="restWk" data-w=${w} aria-pressed=${String(on)}>${l}, ${fmtDate(w)} to ${fmtDate(addDays(w, WEEK_DAYS - 1))}${on ? ': rest week' : ''}</button>`;
    })}</div></div>`;
}

/** The sheet of a day with more than one session: each opens in History. */
export function dayPickSheet(m: { date: string }): TemplateResult {
  const ss = sessionsOn(m.date);
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dpH"><div class="sheet-h"><h3 id="dpH">${fmtDate(m.date)}: ${ss.length} sessions</h3>${closeX()}</div>
    <div class="stack">${ss.map(
      x =>
        html`<button class="btn block pastday" data-act="wkOpen" data-id=${x.id}><span>${x.dayName}</span><small>${[sessTm(x), `${x.ex.length} exercise${x.ex.length === 1 ? '' : 's'}`].filter(Boolean).join(', ')}</small></button>`
    )}</div></div>`;
}

/** Cardio or mobility logged on its own, outside a session. */
export function cardioSheet(): TemplateResult {
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Log cardio or mobility</h3>${closeX()}</div>
    <div class="grid2"><label class="field">Date<input type="date" id="cDate" .value=${today()} max=${today()}></label><label class="field">Type<select id="cKind">${CARDIO.map(([k, l]) => html`<option value=${k}>${l}</option>`)}</select></label></div>
    <div class="grid2" style="margin-top:8px"><label class="field">Minutes<input type="text" inputmode="numeric" id="cMin"></label><label class="field">Avg heart rate<input type="text" inputmode="numeric" id="cHr" placeholder="optional"></label></div>
    <label class="field" style="margin-top:8px">Distance (${distU()})<input type="text" inputmode="decimal" id="cDist" placeholder="optional"></label>
    <label class="field" style="margin-top:8px">Note<input type="text" id="cNote" placeholder="e.g. 3.2 mph, 12% incline"></label>
    <p class="small muted hastip" data-tip="For cardio before or after lifting, add it inside the session. Cardio never counts as a lifting session or toward your streak.">Logged on its own.</p>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="cardioSave">Save</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
}
