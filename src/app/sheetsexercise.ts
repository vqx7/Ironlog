/* The sheets of an exercise in the library (r62, PENDING 355): the editor,
   new or saved, and the muscles it works, flat or in 3D. Each is drawn by
   lit-html as src/24-sheets.js drew it (tests/r62.js holds them to r61's),
   and answered by the legacy script's actions and listeners by their
   data-act and data-ebind until those move (r63). The editor is drawn again
   in place as its fields change (a helper muscle, bodyweight, timed, the
   equipment), so what is typed stays; so its labels' tips are drawn with
   the labels (labelTip), not added by the page's tip pass, which would
   leave a redrawn label's tip as it first was. */

import { html } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { EQUIP, ML, MUSCLES, autoCompound } from './library';
import { EX, U, barKg, fmtW } from './live';
import { LOAD_MODES, loadWords } from './loads';
import { PLATE_MODES, platesMode } from './gym';
import { B3, exBodyFlat, exMusLegend, exMusParts, exMusWords, mapView } from './map';
import type { Exercise } from './types';
import { state, ui } from './store';
import { labelTip, tipButton } from './view';
import { closeX } from './sheetsmisc';
import { howToLink } from './sheetslift';

/** The exercise being edited: its saved fields, and what the sheet's fields
    hold as typed (a select writes its option's value, '' or 'auto' for the
    default; a checkbox writes true or false). */
export interface ExEdit extends Omit<Exercise, 'kind' | 'load' | 'timed' | 'assist'> {
  kind?: Exercise['kind'] | '' | undefined;
  load?: Exercise['load'] | 'auto' | undefined;
  timed?: boolean | undefined;
  assist?: boolean | undefined;
  incRaw: string;
  maxRaw?: string | undefined;
  barRaw?: string | undefined;
  bwfRaw?: string | undefined;
}

/** The editor sheet: new from the library or a picker, or a saved exercise. */
export interface ExEditSheet {
  isNew: boolean;
  e: ExEdit;
  /** The picker it was opened from, which Back returns to and Save adds to. */
  back?: { kind: string; mode?: string | undefined } | null | undefined;
  /** More options opened or closed by hand. */
  moreOpen?: boolean | undefined;
}

/** What Save says when a new exercise goes straight into what the picker was adding to. */
const SAVE_INTO: Readonly<Record<string, string>> = {
  addBlock: 'Create and add to session',
  addDay: 'Create and add to day',
  swapBlock: 'Create and swap in',
  swapItem: 'Create and swap in'
};

/** Whether a saved exercise has sets in the log (a change to how its numbers read would reread them). */
const logged = (m: ExEditSheet): boolean => !m.isNew && state.sessions.some(s => s.ex.some(b => b.exId === m.e.id));

/** The exercise editor. */
export function exEditSheet(m: ExEditSheet): TemplateResult {
  const e = m.e;
  const has = logged(m);
  const loadField = (): TemplateResult | string => {
    if (e.bw) return '';
    const def = loadWords({
      id: e.id,
      name: e.name,
      primary: e.primary,
      secondary: e.secondary,
      equip: e.equip,
      bw: e.bw,
      archived: e.archived,
      assist: e.assist || undefined
    });
    return html`<label class="field">${labelTip('lt-ex-load', 'Weight is entered as', 'What the number you type means. Estimates and targets stay in this frame; weight lifted counts both dumbbells or both sides.' + (has ? ' Changing it does not convert sets already logged.' : ''))}<select data-ebind="load" aria-labelledby="lt-ex-load"><option value="auto" ?selected=${!e.load}>Default for this equipment: ${def}</option>${LOAD_MODES.map(([k, l]) => html`<option value=${k} ?selected=${e.load === k}>${l}</option>`)}</select></label>`;
  };
  const save =
    m.isNew && m.back && m.back.kind === 'picker' ? SAVE_INTO[m.back.mode || ''] || 'Save exercise' : 'Save exercise';
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${m.isNew ? 'New exercise' : 'Edit exercise'}</h3>${closeX()}</div><div class="stack">
    <label class="field">Name<input type="text" data-ebind="name" value=${e.name}></label>
    <div class="grid2"><label class="field">Primary muscle<select data-ebind="primary">${e.primary ? '' : html`<option value="" selected disabled>Pick one</option>`}${MUSCLES.map(([k, l]) => html`<option value=${k} ?selected=${e.primary === k}>${l}</option>`)}</select></label>
    <label class="field">Equipment<select data-ebind="equip">${EQUIP.map(([k, l]) => html`<option value=${k} ?selected=${e.equip === k}>${l}</option>`)}</select></label></div>
    <label class="field"><span>Movement</span> ${tipButton('Compound: a press, row, pull-up, squat, or hinge. Isolation: one joint, like a curl or a raise. It sets the size of load increases (about 2.5% of the load on compound lifts, 5% on isolation), the setup time in estimates, which RIR calibration group the lift joins, and what Short on time keeps.', 'About movement')}<select data-ebind="kind"><option value="" ?selected=${!e.kind}>Automatic (${autoCompound({ name: e.name, primary: e.primary, timed: e.timed || undefined }) ? 'compound' : 'isolation'})</option><option value="compound" ?selected=${e.kind === 'compound'}>Compound</option><option value="iso" ?selected=${e.kind === 'iso'}>Isolation</option></select></label>
    ${loadField()}
    <div><p class="small muted">Helper muscles (count as half a set)</p><div class="chips">${MUSCLES.filter(([k]) => k !== e.primary).map(([k, l]) => html`<button class=${'chip ' + (e.secondary.includes(k) ? 'on' : '')} data-act="secToggle" data-m=${k}>${l}</button>`)}</div></div>
    ${MUSCLES.some(([k]) => k === e.primary) ? html`<div class="exbody"><button type="button" class="linkbtn tall" data-act="exBodyTog" aria-expanded=${String(!!ui.exBody)}>${ui.exBody ? 'Hide body' : 'Show on body'}</button>${ui.exBody ? html`${exBodyFlat(e, true)}${exMusLegend(e)}` : ''}</div>` : ''}
    <label class="check-inline"><input type="checkbox" data-ebind="bw" aria-labelledby="lt-ex-bw" ?checked=${!!e.bw}>${labelTip('lt-ex-bw', 'Bodyweight exercise', 'Log only what you add (0 for bodyweight). Your logged bodyweight is added for estimates and weight lifted.')}</label>
    ${e.bw ? html`<label class="check-inline"><input type="checkbox" data-ebind="assist" aria-labelledby="lt-ex-assist" ?checked=${!!e.assist}>${labelTip('lt-ex-assist', 'Assisted (a machine takes weight off)', 'For an assisted machine: you type the help it gives, and less help is progress.')}</label>` : ''}
    ${e.bw ? html`<label class="field">${labelTip('lt-ex-bwfRaw', 'Share of bodyweight moved (%)', 'Measured only for push-ups (64%, force plates). Pull-ups and dips count all of it; the rest are segment-mass estimates.')}<input type="text" inputmode="numeric" data-ebind="bwfRaw" aria-labelledby="lt-ex-bwfRaw" value=${e.bwfRaw || ''}></label>` : ''}
    <label class="check-inline"><input type="checkbox" data-ebind="perSide" aria-labelledby="lt-ex-perSide" ?checked=${!!e.perSide}>${labelTip('lt-ex-perSide', 'One side at a time (reps per side)', 'Reps are logged for one side. One set still counts as one set; weight lifted counts both sides.')}</label>
    <label class="check-inline"><input type="checkbox" data-ebind="timed" aria-labelledby="lt-ex-timed" ?checked=${!!e.timed}>${labelTip('lt-ex-timed', 'Timed hold (log seconds)', has ? 'This exercise has logged sets: switching changes how those numbers read.' : 'The reps column holds seconds.')}</label>
    <details class="more" ?open=${!m.back || !!m.moreOpen}><summary>More options<span class="small muted">less common, load step, plates, heaviest, notes</span></summary><div class="stack">
    <label class="check-inline"><input type="checkbox" data-ebind="rare" ?checked=${!!e.rare}>Mark as less common</label>
    <div class="grid2"><label class="field">${labelTip('lt-ex-incRaw', `Load step (${U()})`, "The smallest jump you can make on this exercise, everywhere it appears. Earned increases are whole multiples of it, about 2.5% of the load on compound lifts and 5% on isolation work. Blank uses each routine's setting.")}<input type="text" inputmode="decimal" data-ebind="incRaw" aria-labelledby="lt-ex-incRaw" value=${e.incRaw} placeholder="Routine setting"></label>
    <label class="field">${labelTip('lt-ex-plates', 'Plate helper', 'What to load, shown under the sets in a session.')}<select data-ebind="plates" aria-labelledby="lt-ex-plates">${PLATE_MODES.map(([k, l]) => html`<option value=${k} ?selected=${(e.plates || 'auto') === k}>${l}</option>`)}</select></label></div>
    ${platesMode(e) === 'bar' ? html`<label class="field">${labelTip('lt-ex-barRaw', `Bar for this lift (${U()})`, 'A trap bar, EZ bar, or any bar other than the one in Settings. Used for the plates line and so a deload never goes under it.')}<input type="text" inputmode="decimal" data-ebind="barRaw" aria-labelledby="lt-ex-barRaw" value=${e.barRaw || ''} placeholder=${`Settings bar, ${fmtW(barKg())}`}></label>` : ''}
    <label class="field">${labelTip('lt-ex-maxRaw', `Heaviest available (${U()}${e.bw ? ', added' : ''})`, 'The top of the stack or the biggest dumbbell. At that load, targets move to more reps and then harder reps, and the lift is not called stalled.')}<input type="text" inputmode="decimal" data-ebind="maxRaw" aria-labelledby="lt-ex-maxRaw" value=${e.maxRaw || ''} placeholder="No limit"></label>
    <label class="field">Notes and cues<textarea data-ebind="note">${e.note || ''}</textarea></label></div></details>
    <div class="row"><button class="btn primary" data-act="exSave">${save}</button><button class="btn" data-act=${m.back ? 'exBack' : 'mClose'}>${m.back ? 'Back' : 'Cancel'}</button></div>${m.isNew ? '' : howToLink(e)}${!m.isNew && e.custom && !window.claude ? html`<button class="linkbtn" style="min-height:44px" data-act="exSuggest" data-tip="Your exercises are only in your log. This sends it to the app's owner, who can add it to the library for everyone.">Suggest for the library</button>` : ''}</div></div>`;
}

/* The 3D body is mounted by the legacy host once the sheet is drawn (its
   #bm3dx); the lift's muscles are set for it here, and the turn it had on
   the map kept to restore when the sheet closes. */
/** The muscles a lift works: in words, on the flat figures or the 3D body, and the legend. */
export function exMusSheet(m: { exId: string }): TemplateResult {
  const e = EX(m.exId);
  const v3 = mapView() === '3d';
  const pm = exMusParts(e);
  B3.ex = { main: pm.main, help: pm.help };
  if (B3.yawKeep == null) B3.yawKeep = B3.yaw;
  return html`<div class="sheet exmus" role="dialog" aria-modal="true" aria-labelledby="exMusH"><div class="sheet-h"><h3 id="exMusH">Muscles: ${e.name}</h3>${closeX()}</div>
    ${exMusWords(e)}
    <div class="seg" role="group" aria-label="View" style="margin-top:8px"><button class=${'chip ' + (v3 ? '' : 'on')} data-act="mapView" data-v="flat" aria-pressed=${String(!v3)}>Flat</button><button class=${'chip ' + (v3 ? 'on' : '')} data-act="mapView" data-v="3d" aria-pressed=${String(v3)}>3D</button></div>
    ${v3 ? html`<div class="bm3d" id="bm3dx"><div class="bm3d-stage" role="img" aria-label=${`3D body with ${ML[pm.main] || pm.main} lit${pm.help.length ? ', helpers lighter' : ''}. Drag sideways to turn it.`}></div><p class="bm3d-msg small muted" hidden></p><div class="seg bm3d-turn" role="group" aria-label="Turn the body"><button class="chip" data-act="map3dTurn" data-v="0">Front</button><button class="chip" data-act="map3dTurn" data-v="1">Side</button><button class="chip" data-act="map3dTurn" data-v="2">Back</button></div></div>` : exBodyFlat(e)}
    ${exMusLegend(e)}</div>`;
}
