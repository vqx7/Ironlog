/* The toast (r63, from the legacy script's 18-ui.js): one message at the
   foot of the page, with Undo when the change it reports can be undone. Undo
   used to be one snapshot the toast's timer threw away after six seconds;
   the steps are kept in storage.ts since r30, and the toast only offers the
   newest. */

import { html, nothing, render } from 'lit-html';

/** How long a toast stays, in milliseconds: one that offers Undo, and one that does not. */
const TOAST_MS = { undo: 6000, plain: 2600 } as const;

let toastT: ReturnType<typeof setTimeout> | undefined;
const box = (): HTMLElement | null => document.getElementById('toast');

/** Shows a toast: the message, whether it offers Undo, for how long (its default when not given), and its kind ('pr' marks a record). */
export function toast(msg: string, undo?: boolean | null, ms?: number | null, kind?: string): void {
  const el = box();
  if (!el) return;
  el.classList.toggle('pr', kind === 'pr');
  render(html`<span>${msg}</span>${undo ? html`<button data-act="undo">Undo</button>` : nothing}`, el);
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(
    () => {
      el.hidden = true;
    },
    ms || (undo ? TOAST_MS.undo : TOAST_MS.plain)
  );
}

/* A note with nothing to undo goes when a session starts (r31): the
   routine-ready note sat over the session title and Discard. */
/** Hides the toast when it offers no Undo. */
export function toastQuiet(): void {
  const el = box();
  if (el && !el.hidden && !el.querySelector('[data-act="undo"]')) {
    clearTimeout(toastT);
    el.hidden = true;
  }
}

/** Hides the toast when it offers an Undo: a session saved has nothing left to undo from its own steps (r60). */
export function undoToastHide(): void {
  const el = box();
  if (el && el.querySelector('[data-act="undo"]')) {
    clearTimeout(toastT);
    el.hidden = true;
  }
}

/** Hides the toast whatever it says (Undo done). */
export function toastHide(): void {
  const el = box();
  if (el) el.hidden = true;
}
