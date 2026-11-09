/* ---------- bodyweight, asked for where it matters (r66, PENDING 372) ----------
   Bodyweight is never required (V, 2026-11-01), but a bodyweight lift reads
   it: with no weigh-in, a pull-up counts only the weight added (bodyweight
   read as 0), so it moves nothing and gives no estimate. So the app asks
   where a lifter meets such a lift, signed in or not, and warns on the lift
   until a weigh-in exists:
     - Today's bodyweight card from the first day a bodyweight lift is in the
       routine in use (today.ts, bwDueCard), with Later;
     - a short note when a bodyweight lift is added to a plan or a session,
       or comes in a ready-made routine picked, once a visit, never blocking;
     - a quiet line on the first bodyweight lift still open in a session
       (on each one until r69, when V found it a wall of text), until one
       is logged, whose Set it opens a small sheet;
     - a field in Settings, always there, beside the weigh-in reminder.
   A weigh-in saved here is the same weigh-in as Today's. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { state } from './store';
import { EX, U, fmtW } from './live';
import { closeX } from './sheetsmisc';
import { openModal } from './page';
import { toast } from './toast';
import { fmtDate } from './format';
import { isDate, today } from './util';

/** How long the bodyweight note stays up, in milliseconds: long enough to read two short sentences. */
const NUDGE_MS = 6000;

/** The weigh-ins that count: a demo's are not the lifter's. */
const own = (): number => state.bodyweights.filter(b => !b.demo).length;

/** Whether a lift reads bodyweight while none is logged: the case this module asks about. */
const bwMissing = (exId: string): boolean => own() === 0 && !!EX(exId).bw;

let saidThisVisit = false;

/** Says once a visit, without blocking, that a lift just added counts bodyweight and none is logged: where to set it. */
export function bwNudge(exIds: readonly string[]): void {
  if (saidThisVisit) return;
  const id = exIds.find(bwMissing);
  if (!id) return;
  saidThisVisit = true;
  toast(
    `${EX(id).name} counts your bodyweight, plus any weight you add. Set it on Today or in Settings; it is optional.`,
    null,
    NUDGE_MS
  );
}

/** The line on a session's first bodyweight lift still open while no weigh-in is logged: what it counts, and a way to set it. */
export function bwWarn(exId: string): TemplateResult | typeof nothing {
  if (!bwMissing(exId)) return nothing;
  return html`<p class="small bwwarn">No bodyweight set, so this counts only the weight you add. <button class="linkbtn tall" data-act="bwOpen" data-ex=${exId}>Set it</button></p>`;
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
    <label class="field">Bodyweight (${U()})<input type="text" inputmode="decimal" id="bwSheetVal" placeholder=${last ? fmtW(last.kg) : `Weight (${U()})`} enterkeyhint="done"></label>
    <p class="small muted">${last ? `Latest ${fmtW(last.kg)} ${U()}, ${fmtDate(last.date)}. ` : ''}Saved as ${on}.</p>
    <div class="row u-mt10"><button class="btn primary" data-act="addBW" data-in="bwSheetVal" data-date=${m.date || nothing}>Save</button><button class="btn" data-act="mClose">Not now</button></div></div>`;
}

/** Settings' bodyweight line: the latest weigh-in or none, and a field to log one. */
export function bwSettings(): TemplateResult {
  const last = latestBw();
  return html`<div class="row u-mt8" id="bwSet"><label class="field u-f1_m0">Bodyweight (${U()})<input type="text" inputmode="decimal" id="bwSetVal" placeholder=${last ? fmtW(last.kg) : 'Not set'} data-grey=${last ? fmtW(last.kg) : nothing} enterkeyhint="done"></label><button class="btn sm primary" data-act="addBW" data-in="bwSetVal">${last ? 'Log' : 'Set'}</button></div><p class="small muted u-m4-0-0">${last ? `Latest ${fmtW(last.kg)} ${U()}. ` : 'Not set: bodyweight lifts count only the weight you add. '}Optional.</p>`;
}

/** The taps: open the bodyweight sheet from a lift's line. */
export const BW_ACTS: Readonly<Record<string, (t: { dataset: DOMStringMap }) => void>> = {
  // From a session's header (NEW-90) the sheet carries the session's date, so a past workout's weigh-in is dated that day.
  bwOpen(t) {
    const id = t.dataset.ex;
    const d = t.dataset.date;
    openModal({ kind: 'bw', ex: id ? EX(id).name : undefined, date: d && isDate(d) && d <= today() ? d : undefined });
  }
};
