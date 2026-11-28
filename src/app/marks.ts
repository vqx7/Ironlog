/* The names of buttons and screens inside the app's own words are bold, so "Tap **Finish**" reads as the button and
   not as a word (V, 2026-11-25: bold, over quotes). Text written for a message, a tip or a question marks a name with
   two stars each side; the text that has no other markup is drawn here, the stars gone and the name bold, so a screen
   reader reads the words alone. */

import { html } from 'lit-html';
import type { TemplateResult } from 'lit-html';

/** A name marked bold: two stars, the name, two stars. */
const MARK = /\*\*([^*]+)\*\*/g;

/** The text in pieces: plain words, and names to draw bold. */
function pieces(text: string): { t: string; b: boolean }[] {
  const out: { t: string; b: boolean }[] = [];
  let at = 0;
  for (const m of text.matchAll(MARK)) {
    const i = m.index ?? 0;
    if (i > at) out.push({ t: text.slice(at, i), b: false });
    out.push({ t: m[1] ?? '', b: true });
    at = i + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at), b: false });
  return out;
}

/** The text as nodes, each name it marks in bold (a message, a tip). */
export function markedNodes(text: string): Node[] {
  return pieces(text).map(p => {
    if (!p.b) return document.createTextNode(p.t);
    const b = document.createElement('b');
    b.textContent = p.t;
    return b;
  });
}

/** The text drawn in a screen, each name it marks in bold (a question's words). */
export function marked(text: string): TemplateResult {
  return html`${pieces(text).map(p => (p.b ? html`<b>${p.t}</b>` : p.t))}`;
}

/** The text with its marks taken out, as a screen reader or a copied line reads it. */
export function unmarked(text: string): string {
  return text.replace(MARK, '$1');
}
