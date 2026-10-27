/* The update bar (standalone app only), moved from the legacy start-up in
   r60. The build's boot script registers the service worker and calls
   ironlogUpdateReady() once a new version has been downloaded and is
   waiting. Nothing reloads by itself, because a reload in the middle of a
   set is jarring: the lifter picks the moment, and the session in progress
   is saved first, so it comes back as it was. "Later" hides the bar until
   the next launch. The words say what the button does (V, 2026-10-25,
   PENDING 335): "Update ready" and Update, where it said "New version ready"
   and Reload. */

import { html, nothing, render } from 'lit-html';
import { ui } from './store';
import { saveNow } from './sync';
import { toast } from './toast';

declare global {
  interface Window {
    /** Called by the boot script when a new version is waiting. */
    ironlogUpdateReady?: (() => void) | undefined;
    /** Set by the boot script: lets the waiting version take over, and the page reloads once it has. */
    ironlogApplyUpdate?: (() => void) | undefined;
  }
}

const upd = { ready: false, later: false };

// The bar drawn as it stands: shown while a version waits and Later was not tapped.
function updRender(): void {
  const el = document.getElementById('updbar');
  if (!el) return;
  const show = upd.ready && !upd.later;
  el.hidden = !show;
  render(
    show
      ? html`<span class="ut">Update ready</span><button type="button" class="btn sm primary" data-act="appUpdate">Update</button><button type="button" class="btn sm" data-act="appUpdateLater">Later</button>`
      : nothing,
    el
  );
}

/** Lets the boot script say a new version is waiting. Called once at start. */
export function updateStart(): void {
  window.ironlogUpdateReady = () => {
    upd.ready = true;
    updRender();
  };
}

/** The bar's two buttons, by data-act. A sheet with unsaved changes keeps the page until it is saved or cancelled. */
export const UPDATE_ACTS = {
  appUpdate(): void {
    if (ui.modal && ui.modal.dirty) {
      toast('Save or cancel first. Your changes are still here.');
      return;
    }
    saveNow();
    upd.ready = false;
    updRender();
    if (typeof window.ironlogApplyUpdate === 'function') window.ironlogApplyUpdate();
    else location.reload();
  },
  appUpdateLater(): void {
    upd.later = true;
    updRender();
  }
};
