/* The import sheet (r63, from the legacy script's 26-import.js): the first
   step (a file or pasted text), the columns of a table that does not name
   them, and the preview of what would be saved. It is drawn fresh on every
   draw, as it was while it was markup: its lists of choices are rebuilt as
   each name's exercise changes (a name moves between "Check these" and
   "matched"), and a select kept from one draw to the next could keep a
   choice made for another name. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { keyed } from 'lit-html/directives/keyed.js';
import { APP_NAME } from './config';
import { andList, today } from './util';
import { CARDIOL, MUSCLES } from './library';
import { IMP_MAX_ROWS } from './importing';
import { fmtDate } from './format';
import { EX, exName } from './live';
import { state } from './store';
import type { ImpInputModal, ImpPreviewModal } from './modals';
import { distShow, distU, setShort } from './display';
import { closeX } from './sheetsmisc';
import { impBuild, impMatch } from './importflow';

/** A name matched this well or better, to the exercise picked, is listed under "matched" rather than "Check these". */
const SURE_AT = 0.85;
/** Sessions "What was read" lists, and the cardio entries the preview names. */
const SHOWN = { sessions: 40, cardio: 3, bad: 8, odd: 4 } as const;
/** The characters of a column's name in the column picker. */
const COL_CHARS = 30;

let draws = 0;

/** The sheet's frame: its title and close, around a scrolling body. */
const frame = (t: string, body: TemplateResult) =>
  html`<div class="sheet fixed" role="dialog" aria-modal="true" aria-labelledby="impH"><div class="sheet-h"><h3 id="impH">${t}</h3>${closeX()}</div><div class="sheet-scroll">${body}</div></div>`;

/** What the first step's tip says can be imported. */
const WHAT_TIP = `Notes: a date on its own line, then one exercise per line with its sets (185x8, 185x7, or 3x10 @ 120). A spreadsheet: a file, or copy the cells and paste them, with columns such as date, exercise, weight, and reps. Another app: export your workouts as a CSV file from its settings, then choose that file here. Handwritten: photograph the page, open it in Photos, press and hold the writing, tap Copy, and paste it here. A backup file from ${APP_NAME} restores your whole log instead.`;

function inputStep(m: ImpInputModal): TemplateResult {
  return frame(
    'Import workouts',
    html`<p class="small muted" style="margin:0 0 8px">Notes, a spreadsheet, or an export from another app. Nothing is saved until you check it.</p>
    <label class="btn primary block" style="position:relative">Choose a file<input type="file" id="impFile" accept=".csv,.tsv,.txt,.xlsx,.json,text/csv,text/plain,application/json" style="position:absolute;width:1px;height:1px;opacity:0"></label>
    <p class="small muted" style="margin:10px 0 4px">or paste it</p>
    <textarea id="impText" aria-label="Paste your log" style="min-height:160px;font-size:14px" placeholder=${'Sep 20\nBench press 185x8, 185x7, 185x6\nLat pulldown 3x10 @ 120'}>${m.text || ''}</textarea>
    ${m.err ? html`<p class="small" style="color:var(--red);margin:8px 0 0">${m.err}</p>` : nothing}
    <button class="btn block" style="margin-top:10px" data-act="impRead">Read it</button>
    <p class="small muted hastip" style="margin:10px 0 0" data-tip=${WHAT_TIP}>What can I import?</p>`
  );
}

function mapStep(m: ImpPreviewModal): TemplateResult {
  const tab = m.tab;
  const head = (tab && tab.rows[0]) || [];
  const opt = (f: string, label: string, need?: boolean) =>
    html`<label class="field">${label}${need ? '' : html` <span class="muted">(optional)</span>`}<select data-mapf=${f}><option value="">None</option>${head.map(
      (h, i) =>
        html`<option value=${String(i)} ?selected=${!!tab && tab.map[f] === i}>${String(h || 'Column ' + (i + 1)).slice(0, COL_CHARS)}</option>`
    )}</select></label>`;
  return frame(
    'Which column is which?',
    html`<p class="small muted" style="margin:0 0 8px">The first row is read as column names.</p>${opt('date', 'Date', true)}${opt('ex', 'Exercise', true)}${opt('w', 'Weight, none if bodyweight only')}${opt('r', 'Reps', true)}${opt('sets', 'Sets')}${opt('rir', 'RIR')}${opt('name', 'Workout name')}
      <button class="btn primary block" style="margin-top:10px" data-act="impMapDone">Continue</button>`
  );
}

function previewStep(m: ImpPreviewModal): TemplateResult {
  const r = m.res;
  const b = impBuild(m);
  const nSets = b.sessions.reduce((a, x) => a + x.ex.reduce((c, e) => c + e.sets.length, 0), 0);
  const dates = b.sessions.map(x => x.date).sort();
  const names = Object.keys(m.pick);
  const lib = state.exercises.filter(e => !e.archived).sort((x, y) => x.name.localeCompare(y.name));
  const row = (n: string) => {
    const c = impMatch(n);
    const top = new Set(c.map(x => x.id));
    const v = m.pick[n];
    const g = m.guess[n];
    return html`<div class="imp-ex"><div class="imp-n">${n}</div><select data-imppick=${n} aria-label=${`${n} is`}><option value="new" ?selected=${v === 'new'}>New exercise</option>${c.map(
      x => html`<option value=${x.id} ?selected=${v === x.id}>${exName(x.id)}</option>`
    )}<option disabled>──────</option>${lib
      .filter(e => !top.has(e.id))
      .map(e => html`<option value=${e.id} ?selected=${v === e.id}>${e.name}</option>`)}</select>
    ${v === 'new' ? html`<select data-impmus=${n} aria-label=${`Main muscle for ${n}`}>${MUSCLES.map(([k, l]) => html`<option value=${k} ?selected=${!!g && g.primary === k}>${l}</option>`)}</select>` : nothing}</div>`;
  };
  const unsure = names.filter(n => {
    const c0 = impMatch(n)[0];
    return m.pick[n] === 'new' || !c0 || c0.id !== m.pick[n] || c0.sc < SURE_AT;
  });
  const sure = names.filter(n => !unsure.includes(n));
  const noDate = r.sessions.some(x => !x.date);
  const nUnread = r.unreadN || (r.unread && r.unread.length) || 0;
  const date0 = dates[0],
    dateN = dates[dates.length - 1];
  return frame(
    'Check the import',
    html`<div class="kpis"><div class="kpi"><div class="v">${b.sessions.length}</div><div class="l">sessions</div></div><div class="kpi"><div class="v">${nSets}</div><div class="l">sets</div></div><div class="kpi"><div class="v">${names.length}</div><div class="l">exercises</div></div></div>
  ${date0 ? html`<p class="small muted" style="margin:6px 0 0">${fmtDate(date0)}${dates.length > 1 && dateN ? ' to ' + fmtDate(dateN) : ''}</p>` : nothing}
  ${b.dup ? html`<p class="small" style="margin:6px 0 0">${b.dup} already in your log, skipped.</p>` : nothing}
  <div style="margin-top:10px"><p class="small muted" style="margin:0 0 6px;font-weight:600">Weights in the file are</p><div class="ob-units">${(
    ['lb', 'kg'] as const
  ).map(
    k =>
      html`<button class=${'chip ' + (m.unit === k ? 'on' : '')} data-act="impUnit" data-v=${k} aria-pressed=${String(m.unit === k)}>${k}</button>`
  )}</div>${m.unitKnown ? nothing : html`<p class="small muted" style="margin:4px 0 0">It does not say which; check this.</p>`}</div>
  ${noDate ? html`<label class="field" style="margin-top:10px">No date found. Log it on<input type="date" data-impdate value=${m.date} max=${today()}></label>` : nothing}
  ${unsure.length ? html`<p class="small" style="margin:12px 0 4px;font-weight:650">Check these exercises</p>${unsure.map(row)}` : nothing}
  ${sure.length ? html`<details class="subsec" style="margin-top:8px"><summary>${sure.length} matched</summary>${sure.map(row)}</details>` : nothing}
  ${nUnread ? html`<details class="subsec" style="margin-top:8px"><summary>${nUnread} line${nUnread === 1 ? '' : 's'} not understood</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">${(r.unread || []).map(l => html`<li>${l}</li>`)}</ul></details>` : nothing}
  ${r.skipped ? html`<p class="small muted" style="margin:6px 0 0">${r.skipped} row${r.skipped === 1 ? '' : 's'} without an exercise, date, or reps were skipped.</p>` : nothing}${
    b.cardio.length
      ? html`<p class="small" style="margin:6px 0 0">Cardio: ${b.cardio.length} entr${b.cardio.length === 1 ? 'y' : 'ies'} (${andList(
          b.cardio
            .slice(0, SHOWN.cardio)
            .map(
              c =>
                `${String(CARDIOL[c.kind]).toLowerCase()} ${fmtDate(c.date)}, ${c.min} min${c.dist ? `, ${distShow(c.dist)} ${distU()}` : ''}`
            ),
          SHOWN.cardio
        )}${b.cardio.length > SHOWN.cardio ? ', and more' : ''}). Distances are read in ${m.unit === 'kg' ? 'km' : 'miles'}, with the unit above.</p>`
      : nothing
  }${b.cardioNoTime ? html`<p class="small muted" style="margin:6px 0 0">${b.cardioNoTime} cardio entr${b.cardioNoTime === 1 ? 'y' : 'ies'} without a time left out: minutes are needed.</p>` : nothing}
  ${b.bad.length ? html`<p class="small" style="margin:6px 0 0;color:var(--yellow)">Not imported, no weight given: ${andList(b.bad, SHOWN.bad)}. Write the load in, like 3x10 @ 60, and read it again.</p>` : nothing}
  ${b.odd.length ? html`<p class="small" id="impOdd" style="margin:6px 0 0;color:var(--yellow)">Check these, they look misread: ${andList(b.odd, SHOWN.odd)}. Fix the line and read it again if they are wrong.</p>` : nothing}
  ${b.timedOff ? html`<p class="small" style="margin:6px 0 0;color:var(--yellow)">${b.timedOff} timed set${b.timedOff === 1 ? ' was' : 's were'} left out: the exercise chosen counts reps. Pick a timed one to keep them.</p>` : nothing}
  ${r.cut ? html`<p class="small" style="margin:6px 0 0;color:var(--yellow)">Only the first ${IMP_MAX_ROWS.toLocaleString()} rows were read. Split the file to import the rest.</p>` : nothing}
  ${
    b.sessions.length
      ? html`<details class="subsec" style="margin-top:8px" id="impRead"><summary>What was read</summary>${b.sessions
          .slice(0, SHOWN.sessions)
          .map(
            x =>
              html`<p class="small" style="margin:8px 0 2px;font-weight:650">${fmtDate(x.date)}${x.dayName && x.dayName !== 'Imported' ? ' · ' + x.dayName : ''}</p>${x.ex.map(
                e => {
                  const known = EX(e.exId);
                  const exo =
                    known.id === e.exId && !known.archived ? known : b.newEx.find(n => n.id === e.exId) || known;
                  return html`<p class="small muted" style="margin:0">${exo.name}: ${e.sets.map(q => (q.warm ? 'W ' : q.drop ? 'D ' : '') + setShort(exo, q.w, q.r)).join(', ')}</p>`;
                }
              )}`
          )}${b.sessions.length > SHOWN.sessions ? html`<p class="small muted">and ${b.sessions.length - SHOWN.sessions} more</p>` : nothing}</details>`
      : nothing
  }
  <button class="btn primary block" style="margin-top:12px" data-act="impGo" ?disabled=${!(b.sessions.length || b.cardio.length)}>Import ${b.sessions.length} session${b.sessions.length === 1 ? '' : 's'}${b.cardio.length ? ` and ${b.cardio.length} cardio` : ''}</button>
  <button class="btn block" style="margin-top:6px" data-act="impBack">Back</button>`
  );
}

/** The import sheet, drawn fresh. */
export function impSheet(m: ImpInputModal | ImpPreviewModal): TemplateResult {
  const body = m.step === 'input' ? inputStep(m) : m.res.needMap ? mapStep(m) : previewStep(m);
  return html`${keyed(++draws, body)}`;
}
