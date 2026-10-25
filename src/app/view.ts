/* How the screens draw (phase 5, r57; ARCHITECTURE.md, Phase 5 design, item
   1). lit-html, bundled into the page from its pinned package (no address to
   load, so offline and the Content Security Policy need nothing new), draws
   every tab into #view, and owns it: a moved screen is a template of the
   state and `ui`, updated in place on each draw, so its elements, the field
   being typed in and its focus stay; a screen still in the legacy script is
   its markup string, drawn fresh on every draw as innerHTML drew it, so the
   moves that follow its draw (the saved order, the hidden sections, the drag
   lists) work on it as before. The parts every moved screen shares are here,
   drawing the markup the legacy script's helpers of the same names drew (the
   legacy copies went with the last screen drawn from it, r60; tests/r57.js
   compares the two screens with r56.2's). */

import { html, nothing, render, noChange } from 'lit-html';
import type { TemplateResult, AttributePart } from 'lit-html';
import { Directive, directive, PartType } from 'lit-html/directive.js';
import type { DirectiveResult, PartInfo } from 'lit-html/directive.js';
import { setCommittedValue } from 'lit-html/directive-helpers.js';
import { keyed } from 'lit-html/directives/keyed.js';
import { live } from 'lit-html/directives/live.js';
import { unsafeHTML } from 'lit-html/directives/unsafe-html.js';
import { moreList, orderKeys } from './layout';
import { estMin, min5 } from './format';
import { numIn, today } from './util';
import { state, ui } from './store';

declare global {
  interface Window {
    /** Which of the page's two outside libraries loaded (03-body.html): the drag lists and the charts. */
    __libs?: { sortable: boolean; chart: boolean } | undefined;
    /** SortableJS, loaded by script tag: the copy a drag out of a list that copies (Plan's library) leaves in it, and the lists a moved screen makes (the session's exercises, r60). */
    Sortable?:
      | {
          clone?: Element | null | undefined;
          create(el: Element, o: SortableOptions): { destroy(): void };
        }
      | undefined;
  }
}

/** The options a moved screen gives SortableJS for a list it drags (the session's exercises, r60). */
export interface SortableOptions {
  group: { name: string; pull: boolean; put: boolean };
  handle: string;
  draggable: string;
  animation: number;
  fallbackOnBody: boolean;
  onStart(e: { item: HTMLElement }): void;
  onEnd(e: {
    item: HTMLElement;
    oldDraggableIndex?: number | null | undefined;
    newDraggableIndex?: number | null | undefined;
  }): void;
}

/** What a screen's template may hold where a part goes: a template, text, several of them, or nothing. */
export type Part = TemplateResult | DirectiveResult | string | number | typeof nothing | readonly Part[];

/* ---------- the host ---------- */

let legacyDraws = 0;
/* The day the screen was last drawn for (r59). A phone keeps the app open
   overnight, and nothing draws it again when it comes back to the screen
   without an account, so the next morning Today was yesterday's: its date
   line, the week bar, and Body's date, which a weigh-in typed at once was
   saved on, over the evening's (the second review of r59; r58 too). */
let drawnFor = '';
/** Whether the screen was last drawn on an earlier day than today, as when the app is brought back the next morning. */
export function drawnBeforeToday(): boolean {
  return drawnFor !== '' && drawnFor !== today();
}
/** Draws a legacy screen's markup into the page's view: fresh nodes each time, as innerHTML made them (its markup was escaped by hand, `esc`, as before r57). */
export function drawLegacy(view: HTMLElement, markup: string): void {
  drawnFor = today();
  render(keyed(++legacyDraws, unsafeHTML(markup)), view);
}
/* While lit-html is drawing a screen: a field it takes away fires its
   change and blur as if the lifter had left it, which must not tick a set or
   draw the screen again inside the draw (the legacy host's `rebuilding`). */
let inDraw = 0;
/** Whether a screen is being drawn this moment. */
export const drawing = (): boolean => inDraw > 0;
/** Draws a moved screen into the page's view, updating what is there in place. */
export function drawScreen(view: HTMLElement, screen: TemplateResult): void {
  drawnFor = today();
  inDraw++;
  try {
    render(screen, view);
  } finally {
    inDraw--;
  }
}
/* The suites read some parts as the markup the legacy script made of them
   (tests/r44.js reads Plan's usual-range note): the part drawn into an
   element of its own, lit-html's markers taken out. */
/** A part as markup, for window.__ironlog. */
export function markupOf(part: Part): string {
  const box = document.createElement('div');
  render(part, box);
  return box.innerHTML.replace(/<!--[^]*?-->/g, '');
}

/* The app's own fixed markup (icons.ts: the logo, the icons drawn in its
   sheets), written once in the source as markup, so it is drawn as such.
   Never anything from the log or typed by a lifter: those are text, which
   lit-html escapes. */
/** A piece of the app's own fixed markup, drawn. */
export function markup(fixed: string): Part {
  return unsafeHTML(fixed);
}

/* ---------- a field's value ---------- */

/* A field shows the value the log holds. While it is being typed in, the text
   under the lifter's fingers stays when it reads as the value saved ("152."
   for 152, a name with its spaces, half a number not saved yet), as
   rerenderKeepScroll kept it before r57; text the log saved as something else
   (150 typed as a maximum of 100, confirmed with Enter) is replaced by what
   was saved at once (the review of r57: it showed 150 until the page drew
   again). The part is told its value is stale each time, as lit's `live`
   does, so a value typed over and left is put back even when the log still
   holds the value drawn last. */
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
    const now = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.value : null;
    if (now === v) return noChange;
    if (el === document.activeElement && now != null && numIn(now) === numIn(v)) return noChange;
    setCommittedValue(part);
    return v;
  }
}
/** A field's `.value`: the log's value, never over the text of a field being typed in. */
export const fieldValue = directive(FieldValue);

/* ---------- a drag on a drawn screen ---------- */

/* Sortable moves the element being dragged among its neighbours. On a moved
   screen lit-html owns those nodes, so the element goes back where it was
   drawn before the screen draws the new order (or, when the page draws in the
   middle of the drag, a sync bringing another phone's change, the drag is
   dropped, as r56.2's fresh page dropped it); left where the finger had it,
   it sat outside what lit-html drew, and the next taps saved its section
   several times (the review of r57). */
interface Home {
  el: Element;
  parent: Node;
  next: Node | null;
}
let home: Home | null = null;
/** Notes where the element a drag picked up was drawn. */
export function dragStart(el: Element): void {
  home = el.parentNode ? { el, parent: el.parentNode, next: el.nextSibling } : null;
}
/** Forgets the drag: it ended where the page keeps it (a legacy screen, drawn fresh). */
export function dragDone(): void {
  home = null;
}
/** Puts the dragged element back where it was drawn, its drag marks taken off; whether a drag was under way. */
export function dragDrop(): boolean {
  const h = home;
  home = null;
  if (!h) return false;
  // A drag out of a list that copies (Plan's library) leaves Sortable's copy where the element was: it goes, and the element comes back.
  const copy = window.Sortable && window.Sortable.clone;
  if (copy && copy !== h.el && copy.parentNode) copy.remove();
  h.el.classList.remove('sortable-ghost', 'sortable-chosen', 'sortable-drag');
  if (h.el.parentNode !== h.parent || h.el.nextSibling !== h.next) {
    if (h.next && h.next.parentNode !== h.parent) h.parent.appendChild(h.el);
    else h.parent.insertBefore(h.el, h.next);
  }
  return true;
}

/* ---------- the shared parts ---------- */

/* One component for every foldable block on every tab. Fold state lives in
   memory for this visit only (ui.folds). Each time Ironlog opens, every
   section starts folded (V, r28: the titles say what is inside), except
   Sessions on History, which is that tab's content. Every fold inside a
   section starts closed too. Folds used to be saved to the synced settings,
   where one tap (or another device) could leave a section open or closed
   for good. One ? button per explanation: the paragraph is in the page but
   hidden until tapped, so nothing has to be read twice and nothing has to be
   scrolled past; inside a section (r28) the explanation is the first line,
   How this works, since a ? in the header sat beside the fold arrow. The
   legacy script's string copies of these parts went with the last screen
   drawn from it (r60). */
/** Whether a section is open: what was chosen on this visit, else its default (r28: folded unless it is the tab's content). */
export function isOpen(sk: string, def?: boolean): boolean {
  return Object.prototype.hasOwnProperty.call(ui.folds, sk) ? !!ui.folds[sk] : !!def;
}

/** "~82 min", flagged when it runs past the lifting budget in Settings (minTxt in the legacy script). */
export function minPart(m: number): Part {
  const b = state.settings.timeBudget;
  const r = min5(m);
  return b && m > b ? html`<span class="overb">${estMin(r)}, over your ${b} min budget</span>` : estMin(r);
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
  return html`<div class="sec-help"><button type="button" class="hlink" data-act="help" data-h=${key} aria-expanded=${live(String(on))} aria-controls=${`help-${key}`}><span class="hi" aria-hidden="true">i</span>How this works</button></div>
`;
}

/** An explanation, hidden until its "How this works" is tapped: words, or a part with the words it marks bold. */
export function howText(key: string, text: Part): TemplateResult {
  return html`<p class="ht" id=${`help-${key}`} ?hidden=${live(!ui.help.has(key))}>${text}</p>
`;
}

/** The title at the top of a tab: a kicker, the title, a line under it and its buttons (a lone ? sits at the top right, r28). */
export function pageTitle(kick: string, title: string, meta: Part, actions?: Part, onlyHelp?: boolean): TemplateResult {
  return html`<div class=${onlyHelp ? 'ph q' : 'ph'}>
<div>${
    kick
      ? html`<p class="kick">${kick}</p>
`
      : nothing
  }
<h2>${title}</h2>
${
  meta
    ? html`<p class="meta">${meta}</p>
`
    : nothing
}</div>
${
  actions
    ? html`<div class="ph-a">${actions}</div>
`
    : nothing
}</div>
`;
}

/** The ? beside a tab's title that shows its explanation (helpBtn in the legacy script). */
export function helpButton(key: string): TemplateResult {
  return html`<button type="button" class="hb" data-act="help" data-h=${key} aria-expanded=${live(String(ui.help.has(key)))} aria-controls=${`help-${key}`} aria-label="What this shows">?</button>`;
}

/** A fold inside a section, its open state this visit's (subsec in the legacy script); `id` names it for a link that opens it. */
export function subsection(sk: string, title: string, body: Part, sub?: Part, id?: string): TemplateResult {
  return html`<details class="subsec" id=${id ?? nothing} data-sk=${sk} .open=${live(isOpen(sk, false))}><summary><span class="subsec-t">${title}</span><span class="sec-s">${sub ?? ''}</span><span class="chev" aria-hidden="true"></span></summary><div class="sec-b">${body}</div></details>`;
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
  return html`<details class="sec" data-sk=${o.sk} data-mkey=${o.key ?? nothing} id=${o.id ?? nothing} .open=${live(isOpen(o.sk, o.def))}>
<summary>${o.key ? grip(o.title) : nothing}<span class="sec-t">${o.title}</span><span class="sec-s">${o.sub ?? ''}</span><span class="chev" aria-hidden="true"></span></summary>
<div class="sec-b">${o.help ? howLink(o.help) : nothing}${o.help && o.helpBody ? howText(o.help, o.helpBody) : nothing}${o.body}</div>
</details>
`;
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

/* A tab whose movable sections have other elements between them (Plan's
   note about routines to remove sits between Routine and Add exercises):
   the sections take, in their saved order, the places sections hold in the
   code's order, and the elements between stay where they are, as the legacy
   applySecOrder moved them; then the hidden sections go (applyHidden). */
/** A tab's parts in order, each [its section's key, or null for a part that does not move, the part]. */
export function slotted(tab: string, parts: readonly (readonly [string | null, Part])[]): Part[] {
  const keyed = parts.flatMap(([key, part]) => (key == null ? [] : [[key, part] as const]));
  const saved = state.settings.secOrder[tab];
  const keys = keyed.map(x => x[0]);
  const order = saved && saved.length && keys.length > 1 ? orderKeys(saved, keys) : keys;
  const by = new Map(keyed);
  const hidden = state.settings.hidden;
  let k = 0;
  const out: Part[] = [];
  for (const [key, part] of parts) {
    if (key == null) {
      out.push(part);
      continue;
    }
    const at = order[k++] ?? key;
    if (!hidden.includes(tab + ':' + at)) out.push(by.get(at) ?? nothing);
  }
  return out;
}

/** Whether a hidden section of History has something to show (the legacy MORE_LIVE takes these): cardio logged, or something recently deleted. */
export const MORE_OFFER: Readonly<Record<string, () => boolean>> = {
  'history:cardio': () => state.cardio.length > 0,
  'history:trash': () => state.trash.length > 0
};

/** The foot of a tab: the hidden sections it can show, one tap each (with what the tab says of its own, `offer`), and the way to Layout (r28). */
export function tabFoot(tab: string, offer?: Readonly<Record<string, () => boolean>>): TemplateResult | typeof nothing {
  const list = moreList(tab, state.settings.hidden, offer ? { ...MORE_OFFER, ...offer } : MORE_OFFER);
  if (!list.length) return nothing;
  return html`<div class="moreline" id="moreLine">
<p class="small muted ml-h">Add to this tab</p>
<div class="chips">${list.map(
    ([t, k, l]) => html`<button type="button" class="chip add" data-act="secShow" data-k=${`${t}:${k}`}>+ ${l}</button>`
  )}</div>
<button type="button" class="linkbtn ml-c" data-act="goLayout">Show, hide, or reorder sections</button></div>
`;
}
