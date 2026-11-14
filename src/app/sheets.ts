/* The page's sheet layer: every sheet is drawn here, by lit-html.

   Every sheet is a template, updated in place when it is drawn again, so
   the fields themselves, and the focus, the caret and the keyboard with
   them, stay as they are while someone types in it (V: after Wrong email
   or password, a sheet rebuilt from its markup left an email field that
   could not be tapped to change it). It sits with the screens' layer.

   Nothing here sizes a sheet by the part of the screen that shows, to sit
   above the keyboard: on V's iPhone that showed the page under the sheet,
   then moved the page as the keyboard came (CLAUDE.md, Phone). */

import { nothing, render } from 'lit-html';
import type { TemplateResult } from 'lit-html';

/* A sheet into the page's sheet layer (#modal), drawn by lit-html. A sheet
   opened is drawn fresh, as innerHTML drew every sheet, so a sheet replacing
   one of its own kind (one lift's goal after another's) starts from its own
   fields. The open sheet drawn again (an error said, a choice made) is
   updated in place, so its fields, focus and scroll stay. */
/** Draws the open sheet into the sheet layer; `same` when it is the open sheet drawn again. */
export function sheetDraw(el: HTMLElement, sheet: TemplateResult, same: boolean): void {
  // A sheet opened starts from nothing, so lit-html makes it anew rather than updating the one before.
  if (!same) render(nothing, el);
  render(sheet, el);
  el.hidden = false;
}
/** Empties the sheet layer, through lit-html so its next draw finds what it drew. */
export function sheetClear(el: HTMLElement): void {
  render(nothing, el);
}
