/* The logo and the small icons drawn in markup (phase 3a, r51; moved
   unchanged from the legacy script, tests/moved.js holds them to r50's code). */

import { APP_NAME, WORDMARK } from './config';

/* The logo (r25): an upright dumbbell that is also the I of Ironlog. Same
   numbers as scripts/icons.py, which draws the app icons. */
export const MARK_SVG =
  '<svg class="mark" viewBox="-242 -378 484 756" aria-hidden="true" focusable="false"><rect class="mk-h" x="-30" y="-300" width="60" height="600" rx="14"/><rect class="mk-h" x="-80" y="-192" width="160" height="32" rx="12"/><rect class="mk-h" x="-80" y="160" width="160" height="32" rx="12"/><rect class="mk-p" x="-240" y="-376" width="480" height="92" rx="30"/><rect class="mk-p" x="-190" y="-270" width="380" height="66" rx="26"/><rect class="mk-p" x="-190" y="204" width="380" height="66" rx="26"/><rect class="mk-p" x="-240" y="284" width="480" height="92" rx="30"/></svg>';

/** The logo with the name beside it: the mark is the first letter, the rest is set as text. */
export const LOCKUP = `<span class="vh">${APP_NAME}</span>${MARK_SVG}<span class="rn" aria-hidden="true">${WORDMARK.strong}</span><span aria-hidden="true">${WORDMARK.light}</span>`;

/** The header's menu button: a person. */
export const MENU_ICON =
  '<svg class="mi" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8.4" r="3.7"/><path d="M4.8 19.6c1.3-3.7 4.1-5.4 7.2-5.4s5.9 1.7 7.2 5.4"/></svg>';

/** The iPhone share symbol and the add-to-home-screen square, for the install steps. */
export const SHARE_ICON =
  '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
export const ADD_ICON =
  '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
