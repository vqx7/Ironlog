/* The sheets of one lift (r62, PENDING 355): its menu in a session, and
   what the menu opens there (typed sets, a note, a calibration set, its load
   step, the heaviest load the gym has); its goal; an injury flagged; and the
   how-to link. Each is drawn by lit-html as src/24-sheets.js drew it
   (tests/r62.js holds them to r61's), and answered by the legacy script's
   actions by their data-act until those move (r63). A sheet of a session's
   lift is null once that lift or the session is gone, and the legacy host
   then closes it. */

import { html } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { JOINTS, MUSCLES, rackKind } from './library';
import { EX, U, exName, fmtW, gymRack, incOf } from './live';
import { rirShow } from './display';
import { markedNew } from './session';
import type { DraftBlock } from './types';
import { loadNote } from './loads';
import { effName, rirScale } from './effort';
import { state } from './store';
import { closeX } from './sheetsmisc';
import { HOWTO_SEARCH } from './config';

/** The reps in reserve a calibration set's call can be: the whole points 0 to 5 (the action that opens it caps the plan's effort at 5). */
const CAL_CALLS = [0, 1, 2, 3, 4, 5] as const;

/** A YouTube search for the lift's form, the only thing it sends being the lift's name. */
export const howToUrl = (e: { name: string }): string => HOWTO_SEARCH + encodeURIComponent(`${e.name} exercise form`);

/** The How-to videos link of a lift's menu and its edit sheet. */
export function howToLink(e: { name?: string | undefined } | null | undefined): TemplateResult | string {
  const name = e && e.name;
  return name
    ? html`<a class="btn block" style="margin-top:6px" href=${howToUrl({ name })} target="_blank" rel="noopener noreferrer" data-tip=${`Opens a YouTube search for ${name} in your browser. Only the exercise name is sent.`}>How-to videos</a>`
    : '';
}

/** The lift at this place in the session in progress, if it is still there. */
const blockAt = (i: number): DraftBlock | null => {
  const d = state.draft;
  return (d && d.ex[i]) || null;
};

/** The exercise menu of a lift in a session. */
export function bmenuSheet(m: { b: number }): TemplateResult | null {
  const d = state.draft;
  const b = blockAt(m.b);
  if (!d || !b) return null;
  const nx = blockAt(m.b + 1);
  const linked = !!(nx && b.plan.ss && nx.plan.ss === b.plan.ss);
  const e = EX(b.exId);
  const op = (o: string, l: string, dis?: boolean, cls?: string): TemplateResult =>
    html`<button class=${'btn block ' + (cls || '')} style="margin-top:6px" data-act="bMenuDo" data-op=${o} data-b=${String(m.b)} ?disabled=${!!dis}>${l}</button>`;
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${exName(b.exId)}</h3>${closeX()}</div>
    ${op('bHist', 'History and chart')}${op('bMus', 'Muscles worked')}${op('wAdd', 'Add a warm-up set')}${op('dropAdd', 'Add a drop set (about 75% load)')}${op('bQuick', 'Type or dictate sets')}${op('bNote', b.note ? 'Edit note' : 'Add note')}${op('bSwap', 'Swap exercise')}${op('bNew', markedNew(d, b.exId) ? 'Same machine as before' : 'New machine or gym')}${howToLink(e)}${op('bInc', `Load step: ${fmtW(incOf(e, b.plan))} ${U()}`)}${op('bMax', `Heaviest available: ${e.maxLoad != null ? fmtW(e.maxLoad) + ' ' + U() : 'no limit'}`)}${rirShow(e) ? op('bCal', 'Calibration set (RIR check)') : ''}${nx ? op('bSs', linked ? 'Unlink superset' : `Superset with ${exName(nx.exId)}`) : ''}${op('bUp', 'Move up', m.b === 0)}${op('bDown', 'Move down', !nx)}${op('fbOpen', 'Report a problem')}${op('bDel', 'Remove from session', false, 'danger')}</div>`;
}

/** Flag an injury: a joint or a muscle, and a note. */
export function injurySheet(): TemplateResult {
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Flag an injury</h3>${closeX()}</div>
    <p class="small muted hastip" data-tip="Every exercise that loads this muscle (directly or as a helper) or this joint is marked in your sessions: its target pauses, loads cap at last time, and it is left out of below-target advice until cleared.">Training aid, not medical advice: sharp, worsening, or lasting pain needs a clinician.</p>
    <div class="stack"><label class="field">Area<select id="injM"><optgroup label="Joints">${JOINTS.map(([k, l]) => html`<option value=${k}>${l}</option>`)}</optgroup><optgroup label="Muscles">${MUSCLES.map(([k, l]) => html`<option value=${k}>${l}</option>`)}</optgroup></select></label>
    <p class="small muted hastip" style="margin:0" data-tip="Knee: squats, lunges, leg press, leg extensions, and curls. Hip: squats, hinges, hip thrusts, adductors, and abductors. Shoulder: presses, flyes, raises, pull-downs, pull-ups, dips. Elbow: curls, extensions, rows, pull-downs, dips. Wrist: curls, barbell and dumbbell presses, push-ups, front squats. A judgment from the movement, not a measurement.">Which exercises a joint flag marks</p>
    <label class="field">Note (optional)<input type="text" id="injNote" placeholder="e.g. left elbow, pressing only"></label>
    <div class="row"><button class="btn primary" data-act="injSave">Flag it</button><button class="btn" data-act="mClose">Cancel</button></div></div></div>`;
}

/** A lift's goal: a load and reps, set or removed. */
export function goalSheet(m: { exId: string }): TemplateResult {
  const e = EX(m.exId);
  const g = e.goal;
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="goalH"><div class="sheet-h"><h3 id="goalH">Goal: ${e.name}</h3>${closeX()}</div>
    <div class="grid2"><label class="field">${e.bw ? `Added load (${U()})` : `Load (${U()}${loadNote(e)})`}<input type="text" inputmode="decimal" id="goalW" value=${g ? fmtW(g.w) : ''} placeholder=${e.bw ? '0' : ''}></label>
    <label class="field">Reps<input type="text" inputmode="numeric" id="goalR" value=${g ? String(g.r) : ''}></label></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="goalSave">Save</button>${g ? html`<button class="btn danger" data-act="goalClear">Remove goal</button>` : ''}<button class="btn" data-act="mClose">Cancel</button></div></div>`;
}

/** A lift's load step: the smallest jump its machine or dumbbells allow. */
export function incSheet(m: { exId: string; plan?: DraftBlock['plan'] | undefined }): TemplateResult {
  const e = EX(m.exId);
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Load step: ${e.name}</h3>${closeX()}</div>
    <label class="field">Step (${U()})<input type="text" inputmode="decimal" id="incVal" value=${fmtW(incOf(e, m.plan))}></label>
    <p class="small muted">The smallest jump the machine or dumbbells allow. Earned increases are whole multiples of it.</p>
    ${e.inc == null && gymRack(e, m.plan) ? html`<p class="small" style="margin:0">Following the ${rackKind(e) === 'dumbbell' ? 'dumbbells' : 'kettlebells'} in Settings > Your gym. A step saved here replaces them for this lift.</p>` : ''}
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="incSave">Save</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
}

/** The heaviest load the gym has for a lift, or none. */
export function maxSheet(m: { exId: string }): TemplateResult {
  const e = EX(m.exId);
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Heaviest available: ${e.name}</h3>${closeX()}</div>
    <label class="field">Load (${U()}${e.bw ? ', added to bodyweight' : ''})<input type="text" inputmode="decimal" id="maxVal" value=${e.maxLoad != null ? fmtW(e.maxLoad) : ''} placeholder="No limit"></label>
    <p class="small muted">Top of the stack or biggest dumbbell. Blank for no limit.</p>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="maxSave">Save</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
}

/** A note on a lift in a session, saved with it and shown next time. */
export function noteSheet(m: { title: string; text?: string | undefined }): TemplateResult {
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${m.title}</h3>${closeX()}</div>
    <p class="small muted">Saved with this session and shown next time: a cue, a niggle, which machine.</p>
    <textarea id="mNote" aria-label="Note" style="min-height:110px">${m.text || ''}</textarea>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="noteSave">Save note</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
}

/* Sets typed or dictated (r30: the examples in the unit in use; r33: RPE when
   effort is entered as RPE, the examples and @ following it). */
/** Type or dictate a lift's sets. */
export function quickSheet(m: {
  b: number;
  text?: string | undefined;
  err?: string | undefined;
}): TemplateResult | null {
  const b = blockAt(m.b);
  if (!b) return null;
  const ex = EX(b.exId);
  const kg = U() === 'kg';
  const rp = rirScale() === 'rpe';
  const tail = rp ? 'rpe 9' : 'rir 1';
  const eg1 = kg ? `100x5, 5, 4 ${tail}` : `235x5, 5, 4 ${tail}`;
  const eg2 = rp ? (kg ? '80x8@8 90x6@9' : '185x8@8 205x6@9') : kg ? '80x8@2 90x6@1' : '185x8@2 205x6@1';
  const ph = kg ? `100x5, 5, 4 ${tail}` : `225x5, 5, 4 ${tail}`;
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${ex.name}: type sets</h3>${closeX()}</div>
    ${ex.timed ? html`<p class="small muted" style="margin:0">Timed hold: the number after x is seconds, for example <b>25x45, 40</b> or <b>bw x 60, 50</b>.</p>` : ''}
    <p class="small muted">Loads in ${U()}${loadNote(ex)}${ex.bw ? ', added to bodyweight (bw or bw+25)' : ''}. <b>${eg1}</b> or <b>${eg2}</b>. <span class="hastip" data-tip=${`Type or use the keyboard's dictation mic. ${rp ? 'rpe' : 'rir'} at the end applies to every set; @ gives ${effName()} per set. A bare number repeats the last load. Sets fill from the first one not done and are marked done.`}>More</span></p>
    <input type="text" id="qTxt" autocomplete="off" autocapitalize="off" spellcheck="false" value=${m.text || ''} placeholder=${ex.bw ? 'bw x 10, 8, 7' : ph} enterkeyhint="done">
    ${m.err ? html`<p class="small" style="color:var(--red);margin:8px 0 0">${m.err}</p>` : ''}
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="qFill">Fill sets</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
}

/** A calibration set: one set taken to failure to check the reps in reserve called. */
export function calibrationSheet(m: {
  b: number;
  w?: string | number | null | undefined;
  at?: string | undefined;
  pred?: number | string | undefined;
  total?: string | undefined;
  err?: string | undefined;
}): TemplateResult | null {
  const b = blockAt(m.b);
  if (!b) return null;
  const ex = EX(b.exId);
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Calibration set: ${ex.name}</h3>${closeX()}</div>
    <p class="small muted" style="margin:0">Checks how well you call reps in reserve. Only take a set to failure where it is safe: a machine or cable, or with a spotter.</p>
    <ol class="steps"><li>Use your normal working load.</li><li>At the rep where you would usually stop, note that rep and how many you think are left.</li><li>Keep going until you cannot complete a rep with good form.</li></ol>
    <div class="grid2"><label class="field">Load (${ex.bw ? '+' + U() : U()})<input type="text" inputmode="decimal" id="calW" value=${m.w != null ? String(m.w) : ''}></label>
    <label class="field">Usual stop rep<input type="text" inputmode="numeric" id="calAt" value=${m.at || ''}></label>
    <label class="field">Reps left, your call<select id="calPred">${CAL_CALLS.map(v => html`<option value=${String(v)} ?selected=${Number(m.pred) === v}>${v}</option>`)}</select></label>
    <label class="field">Reps to failure<input type="text" inputmode="numeric" id="calTot" value=${m.total || ''}></label></div>
    ${m.err ? html`<p class="small" style="color:var(--red);margin:8px 0 0">${m.err}</p>` : ''}
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="calSave">Save set</button><button class="btn" data-act="mClose">Cancel</button></div>
    <p class="small muted" style="margin:8px 0 0">It is saved as a done set at 0 RIR, marked as a check. With RIR set to Corrected in Settings, your typical miss is applied to the RIR you log.</p></div>`;
}
