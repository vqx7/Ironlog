/* ---------- bodyweight, asked for where it matters ----------
   Bodyweight is never required (V, 2026-11-01), but a bodyweight lift reads
   it: with no weigh-in, a pull-up counts only the weight added (bodyweight
   read as 0), so it moves nothing and gives no estimate. So the app asks
   where a lifter meets such a lift, signed in or not, and warns on the lift
   until a weigh-in exists:
     - Today's bodyweight card from the first day a bodyweight lift is in the
       routine in use (today.ts, bwDueCard), with Later;
     - a line under the first bodyweight lift of the day open on Plan, as
       in a session, until a weigh-in exists: never in a message,
       which would say it over what was added (the message rule in
       toast.ts);
     - a quiet line on the first bodyweight lift still open in a session
       (not on each one, which V found a wall of text), until one is logged, whose Add bodyweight opens a small sheet;
     - a field in Settings, always there, beside the weigh-in reminder.
   A weigh-in saved here is the same weigh-in as Today's. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { state } from './store';
import { EX, bodyU, fmtBody } from './live';
import { closeX } from './sheetsmisc';
import { openModal } from './page';
import { fmtDate } from './format';
import { isDate, today } from './util';

/** The weigh-ins that count: a demo's are not the lifter's. */
const own = (): number => state.bodyweights.filter(b => !b.demo).length;

/** Whether a lift reads bodyweight while none is logged: the case this module asks about. */
const bwMissing = (exId: string): boolean => own() === 0 && !!EX(exId).bw;

/** The line on the first bodyweight lift in a session still open, or of the day open on Plan, while no weigh-in is logged: what it counts, and a way to set it, dated the session's day when given (as the session's Bodyweight button is). */
export function bwWarn(exId: string, date?: string): TemplateResult | typeof nothing {
  if (!bwMissing(exId)) return nothing;
  return html`<p class="small bwwarn">No bodyweight set: counts only the weight you add. <button class="linkbtn tall" data-act="bwOpen" data-ex=${exId} data-date=${date || nothing}>Add bodyweight</button></p>`;
}

/* The scale's unit beside a weigh-in field, as a tap that switches it (390's Release B: the scale is equipment too, as
   a lift's unit is): `field` is the id of the field whose typed number the switch converts (bodyUnit, in today.ts). In a
   field's label it is the unit in the words, its touch area rising over them; in a row of buttons, a button of the row. */
/** The unit of weigh-ins as a tap beside a weigh-in field: in its label, or as a button of its row. */
export function bodyUnitTap(field: string, row?: boolean): TemplateResult {
  const u = bodyU();
  return html`<button type="button" class=${row ? 'btn sm' : 'lunit'} data-act="bodyUnit" data-in=${field} aria-label=${`Bodyweight in ${u}. Switch to ${u === 'kg' ? 'lb' : 'kg'}`}>${u}</button>`;
}

/** The latest weigh-in the lifter logged, if any. */
const latestBw = (): { date: string; kg: number } | undefined =>
  state.bodyweights.filter(b => !b.demo).sort((a, b) => (a.date < b.date ? 1 : -1))[0];

/** The bodyweight sheet: what it is for, the latest weigh-in, the field, Save and Not now; from a session, dated the session's day. */
export function bwSheet(m: { ex?: string | undefined; date?: string | undefined }): TemplateResult {
  const last = latestBw();
  const on = m.date && m.date !== today() ? `the weigh-in for ${fmtDate(m.date)}` : "today's weigh-in";
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Your bodyweight</h3>${closeX()}</div>
    <p class="small">${m.ex ? `${m.ex} counts` : 'Pull-ups, dips, and push-ups count'} your bodyweight, plus any weight you add on a belt or vest; you type only what you add. Without a bodyweight, they count only the added load.</p>
    <label class="field"><span>Bodyweight (${bodyUnitTap('bwSheetVal')})</span><input type="text" inputmode="decimal" id="bwSheetVal" placeholder=${last ? fmtBody(last.kg) : `Weight (${bodyU()})`} enterkeyhint="done"></label>
    <p class="small muted">Optional. ${last ? `Latest ${fmtBody(last.kg)} ${bodyU()}, ${fmtDate(last.date)}. ` : ''}Saved as ${on}.</p>
    <div class="row u-mt10"><button class="btn primary" data-act="addBW" data-in="bwSheetVal" data-date=${m.date || nothing}>Save</button><button class="btn" data-act="mClose">Not now</button></div></div>`;
}

/** Settings' bodyweight line: the latest weigh-in or none, and a field to log one. */
export function bwSettings(): TemplateResult {
  const last = latestBw();
  return html`<div class="row u-mt8" id="bwSet"><label class="field u-f1_m0"><span>Bodyweight (${bodyUnitTap('bwSetVal')})</span><input type="text" inputmode="decimal" id="bwSetVal" placeholder=${last ? fmtBody(last.kg) : 'Not set'} data-grey=${last ? fmtBody(last.kg) : nothing} enterkeyhint="done"></label><button class="btn sm primary" data-act="addBW" data-in="bwSetVal">${last ? 'Log' : 'Set'}</button></div><p class="small muted u-m4-0-0">${last ? `Latest ${fmtBody(last.kg)} ${bodyU()}. ` : 'Not set: bodyweight lifts count only the weight you add. '}Optional.</p>`;
}

/** The taps: open the bodyweight sheet from a lift's line. */
export const BW_ACTS: Readonly<Record<string, (t: { dataset: DOMStringMap }) => void>> = {
  // From a session's header the sheet carries the session's date, so a past workout's weigh-in is dated that day.
  bwOpen(t) {
    const id = t.dataset.ex;
    const d = t.dataset.date;
    openModal({ kind: 'bw', ex: id ? EX(id).name : undefined, date: d && isDate(d) && d <= today() ? d : undefined });
  }
};
