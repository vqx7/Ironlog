/* The sheets of the plan (r62, PENDING 355): the routine templates (on a
   first run with Your training folded above them), a new routine, and the
   recap after Finish, which offers the routine the session's changes. Each
   is drawn by lit-html as src/24-sheets.js drew it (tests/r62.js holds them
   to r61's), and answered by the legacy script's actions by their data-act
   until those move (r63). */

import { html } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { TEMPLATES, routineFromTemplate } from './routines';
import { dayMinutes, prof } from './live';
import { estMin, min5 } from './format';
import { WEEK_DAYS } from './util';
import { ui } from './store';
import { profFields } from './settings';
import { closeX } from './sheetsmisc';

/** How far a routine's training days a week may be from Your training's and still fit (every other day counts as about 3.5). */
const FIT_DAYS = 0.5;

/* Minutes come from the same time model as Plan, so the list and the plan
   agree; a range (r28), as an average read as a promise and Today then
   showed a longer first day. The days a week in Your training (r44) mark
   the routines that fit. */
/** The routine templates, a first run's (with Your training folded above them, r44) or Plan's. */
export function templatesSheet(m: { from?: string | undefined; imported?: boolean | undefined }): TemplateResult {
  const pd = prof().days;
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Pick a routine</h3>${closeX()}</div>
    
    ${m.from === 'welcome' ? html`<div class="ob-prof" id="obProf"><button class="ob-prof-h" data-act="obProfTog" aria-expanded=${String(!!ui.obProf)}>Your training <span class="muted">(optional)</span></button>${ui.obProf ? html`<div class="stack">${profFields()}</div>` : ''}</div>` : ''}
    <p class="small muted" style="margin:0 0 8px">${m.imported ? 'Your workouts are in. The names in the file did not say which days they were, so pick the routine you follow, or the closest; your targets and the next workout come from it. Change anything later in Plan.' : 'A starting point with sets, reps, and rest worked out. Change anything later in Plan.'}</p>
    <div class="tpl-list">${TEMPLATES.filter(t => !t.hidden).map(t => {
      const r = routineFromTemplate(t.key);
      if (!r) return '';
      const tr = r.days.filter(d => !d.rest);
      const mins = tr.map(d => min5(dayMinutes(d)));
      const lo = Math.min(...mins),
        hi = Math.max(...mins);
      const min = lo === hi ? estMin(lo) : `${lo} to ${hi} min`;
      const fits = !!pd && Math.abs((tr.length * WEEK_DAYS) / r.days.length - pd) <= FIT_DAYS;
      return html`<button class="tpl" data-act="tplPick" data-k=${t.key}><span class="tpl-t">${t.name}${fits ? html` <span class="pill">Fits your days</span>` : ''}</span><span class="tpl-w">${t.who}</span><span class="tpl-m">${t.meta} · ${min} · ${tr.map(d => d.name).join(', ')}</span></button>`;
    })}</div></div>`;
}

/** A new routine: its name, three empty training days with rest days between. */
export function routineNewSheet(): TemplateResult {
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>New routine</h3>${closeX()}</div>
    <label class="field">Name<input type="text" id="rNewName" placeholder="e.g. Upper focus, 6 days"></label>
    <p class="small muted">Three empty training days with rest days between. It is not active until you tap Make active.</p>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="rNewSave">Create</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
}

/** What the recap after Finish shows: its lines, the PRs, a note, and the routine's update when the session changed the day. */
export interface RecapSheet {
  title: string;
  lines: readonly string[];
  prs?: readonly { name: string; what: string; was?: string | undefined }[] | undefined;
  note?: string | undefined;
  upd?: { dayName: string; text: string } | null | undefined;
}

/** The recap after Finish. */
export function recapSheet(m: RecapSheet): TemplateResult {
  const u = m.upd;
  const prs = m.prs || [];
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${m.title}</h3>${closeX()}</div>${prs.length ? html`<div class="prblk" id="recapPR"><h4>${prs.length === 1 ? 'New PR' : `${prs.length} new PRs`}</h4><ul>${prs.map(p => html`<li><b>${p.name}</b>: ${p.what}${p.was ? html` <span class="was">(${p.was})</span>` : ''}</li>`)}</ul></div>` : ''}<ul class="recap">${m.lines.map(l => html`<li>${l}</li>`)}</ul>${m.note ? html`<p class="small muted">${m.note}</p>` : ''}
    ${u ? html`<div class="hint"><b>Update ${u.dayName} in your routine?</b><br>${u.text}. Next time this day starts with the change.</div><button class="btn block" data-act="applyUpd">Update ${u.dayName}</button>` : ''}
    <button class="btn primary block" style="margin-top:10px" data-act="mClose">${u ? 'Not now' : 'Done'}</button></div>`;
}
