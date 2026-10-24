/* Lines of Settings' Your data section that the modules write, until the
   section moves whole (phase 5): a log kept aside for another account
   (r56.1, PENDING 328 b). */

import { esc } from './util';
import { asideList } from './storage';

/** The line that says a log kept aside for another account is on this phone, or nothing. */
export function asideLine(): string {
  const kept = asideList();
  if (!kept.length) return '';
  const words = kept.map(a => `${a.sessions} session${a.sessions === 1 ? '' : 's'}`).join(', ');
  return `<p class="small" id="asideLine" style="margin:8px 0 0"><b>A log from another account is kept on this phone</b> (${esc(words)}). It is used again when that account signs in here. Erase everything removes it.</p>`;
}
