/* How the screens draw (phase 5, r57; ARCHITECTURE.md, Phase 5 design, item
   1). lit-html, bundled into the page from its pinned package (no address to
   load, so offline and the Content Security Policy need nothing new), draws
   every tab into #view, and owns it: a moved screen is a template of the
   state and `ui`, updated in place on each draw, so its elements, the field
   being typed in and its focus stay; a screen still in the legacy script is
   its markup string, drawn fresh on every draw as innerHTML drew it, so the
   moves that follow its draw (the saved order, the hidden sections, the drag
   lists) work on it as before. The parts every moved screen shares are here,
   drawing the markup the legacy script's helpers of the same names draw (the
   legacy copies stay for the screens not moved yet, and go with the last of
   them, r60; tests/r57.js compares the two screens with r56.2's). */

import { html, nothing, render, noChange } from 'lit-html';
import type { TemplateResult, AttributePart } from 'lit-html';
import { Directive, directive, PartType } from 'lit-html/directive.js';
import type { PartInfo } from 'lit-html/directive.js';
import { setCommittedValue } from 'lit-html/directive-helpers.js';
import { keyed } from 'lit-html/directives/keyed.js';
import { live } from 'lit-html/directives/live.js';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { moreList, orderKeys } from './layout';
import { state, ui } from './store';

/** What a screen's template may hold where a part goes: a template, text, several of them, or nothing. */
export type Part = TemplateResult | string | number | typeof nothing | readonly Part[];

/* ---------- the host ---------- */

let legacyDraws = 0;
/** Draws a legacy screen's markup into the page's view: fresh nodes each time, as innerHTML made them (its markup was escaped by hand, `esc`, as before r57). */
export function drawLegacy(view: HTMLElement, markup: string): void {
  render(keyed(++legacyDraws, unsafeHTML(markup)), view);
}
/** Draws a moved screen into the page's view, updating what is there in place. */
export function drawScreen(view: HTMLElement, screen: TemplateResult): void {
  render(screen, view);
}

/* ---------- a field's value ---------- */

/* A field shows the value the log holds, except while it is being typed in:
   then the text under the lifter's fingers is never replaced, and the saved
   value shows once the field is left. Before r57 a draw replaced the field
   and with it the text (rerenderKeepScroll put back only a number it could
   read the same). The part is told its value is stale each time, as lit's
   `live` does, so a value typed over and left is put back even when the log
   still holds the value drawn last. */
class FieldValue extends Directive {
  constructor(info: PartInfo) {
    super(info);
    if (info.type !== PartType.PROPERTY) throw new Error('fieldValue is a .value binding');
  }
  render(v: string): string {
    return v;
  }
  override update(part: AttributePart, [v]: [string]): string | typeof noChange {
    const el = part.element;
    if (el === document.activeElement) return noChange;
    const now = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : null;
    if (now === v) return noChange;
    setCommittedValue(part);
    return v;
  }
}
/** A field's `.value`: the log's value, never over the text of a field being typed in. */
export const fieldValue = directive(FieldValue);

/* ---------- the shared parts ---------- */

/** Whether a section is open: what was chosen on this visit, else its default (r28: folded unless it is the tab's content). */
export function isOpen(sk: string, def?: boolean): boolean {
  return Object.prototype.hasOwnProperty.call(ui.folds, sk) ? !!ui.folds[sk] : !!def;
}

/** The ⠿ handle a section moves by. */
export function grip(label: string): TemplateResult {
  return html`<span class="sgrip" role="button" tabindex="0" aria-label=${`Move ${label}: drag, or use the arrow keys`} title="Drag to move">⠿</span>`;
}

/** The i button that shows a tip on a tap. */
export function tipButton(text: string, label?: string): TemplateResult {
  return html`<button type="button" class="tipi" data-tip=${text} aria-label=${label || 'More'}>i</button>`;
}

/** A section's "How this works" line, which shows its explanation. */
export function howLink(key: string): TemplateResult {
  const on = ui.help.has(key);
  return html`<div class="sec-help"><button type="button" class="hlink" data-act="help" data-h=${key} aria-expanded=${live(String(on))} aria-controls=${`help-${key}`}><span class="hi" aria-hidden="true">i</span>How this works</button></div>`;
}

/** An explanation, hidden until its "How this works" is tapped. */
export function howText(key: string, text: string): TemplateResult {
  return html`<p class="ht" id=${`help-${key}`} ?hidden=${live(!ui.help.has(key))}>${text}</p>`;
}

/** The title at the top of a tab: a kicker, the title, a line under it and its buttons (a lone ? sits at the top right, r28). */
export function pageTitle(
  kick: string,
  title: string,
  meta: string,
  actions?: Part,
  onlyHelp?: boolean
): TemplateResult {
  return html`<div class=${onlyHelp ? 'ph q' : 'ph'}><div>${kick ? html`<p class="kick">${kick}</p>` : nothing}<h2>${title}</h2>${meta ? html`<p class="meta">${meta}</p>` : nothing}</div>${actions ? html`<div class="ph-a">${actions}</div>` : nothing}</div>`;
}

/** A section: its fold key, its movable key, title, the line beside it, its explanation (`help` alone gives the How this works line, the text placed in the body; with `helpBody`, the text follows the line), its body, whether it starts open, and its id. */
export interface SecOpts {
  sk: string;
  key?: string | undefined;
  title: string;
  sub?: Part | undefined;
  help?: string | undefined;
  helpBody?: string | undefined;
  body: Part;
  def?: boolean | undefined;
  id?: string | undefined;
}
/** One foldable section, the one component every tab's sections are drawn with (r28). */
export function section(o: SecOpts): TemplateResult {
  return html`<details class="sec" data-sk=${o.sk} data-mkey=${o.key ?? nothing} id=${o.id ?? nothing} .open=${live(isOpen(o.sk, o.def))}><summary>${o.key ? grip(o.title) : nothing}<span class="sec-t">${o.title}</span><span class="sec-s">${o.sub ?? ''}</span><span class="chev" aria-hidden="true"></span></summary><div class="sec-b">${o.help ? howLink(o.help) : nothing}${o.help && o.helpBody ? howText(o.help, o.helpBody) : nothing}${o.body}</div></details>`;
}

/** A label's words with the tip beside them: the i button and the field named by the words alone, as the page's tip pass makes a label it finds (tipLabels). */
export function labelTip(id: string, words: string, tip: string): TemplateResult {
  return html`<span id=${id}>${words}</span> <button type="button" class="tipi" data-tip=${tip} aria-label=${'About ' + words}>i</button>`;
}

/** A tab's movable sections in the order saved for it, the hidden ones left out: each [key, section] as the code lists them (applySecOrder, then applyHidden, for a drawn screen). */
export function placed(
  tab: string,
  list: readonly (readonly [string, TemplateResult])[]
): (readonly [string, TemplateResult])[] {
  const saved = state.settings.secOrder[tab];
  const keys = list.map(x => x[0]);
  const order = saved && saved.length && keys.length > 1 ? orderKeys(saved, keys) : keys;
  const hidden = state.settings.hidden;
  return order.flatMap(k => list.filter(x => x[0] === k && !hidden.includes(tab + ':' + k)));
}

/** Whether a hidden section of History has something to show (the legacy MORE_LIVE takes these): cardio logged, or something recently deleted. */
export const MORE_OFFER: Readonly<Record<string, () => boolean>> = {
  'history:cardio': () => state.cardio.length > 0,
  'history:trash': () => state.trash.length > 0
};

/** The foot of a tab: the hidden sections it can show, one tap each, and the way to Layout (r28). */
export function tabFoot(tab: string): TemplateResult | typeof nothing {
  const list = moreList(tab, state.settings.hidden, MORE_OFFER);
  if (!list.length) return nothing;
  return html`<div class="moreline" id="moreLine"><p class="small muted ml-h">Add to this tab</p><div class="chips">${list.map(
    ([t, k, l]) => html`<button type="button" class="chip add" data-act="secShow" data-k=${`${t}:${k}`}>+ ${l}</button>`
  )}</div><button type="button" class="linkbtn ml-c" data-act="goLayout">Show, hide, or reorder sections</button></div>`;
}
