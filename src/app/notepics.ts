/* ---------- pictures on a workout's notes (r66, PENDING 373) ----------
   The strip of pictures under an exercise's note and under the workout's
   notes, the Add picture button beside it, and a picture shown large with
   Remove. A picture is added the moment it is picked (one Undo step), as a
   photo in a gallery is; taking one off asks first and can be undone. The
   bytes stay on this phone (pics.ts), so the words say so where a lifter
   adds one. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { PIC_MAX } from './records';
import { picAdd, picUrl, picsShown } from './pics';
import { log } from './storage';
import { state, ui } from './store';
import { act } from './act';
import { closeX } from './sheetsmisc';
import { closeModal, confirmBox, openModal, renderModal, rerenderKeepScroll } from './page';
import { toast } from './toast';
import type { Tap } from './workstate';
import { exName } from './live';

/** Where a picture belongs: an exercise of the session in progress by its place, or the workout's notes (null). */
type At = number | null;

/** The pictures of an exercise or of the workout's notes, as the log holds them. */
function idsAt(at: At): string[] {
  const d = state.draft;
  if (!d) return [];
  if (at == null) return d.pics || [];
  const b = d.ex[at];
  return b ? b.pics || [] : [];
}

/** Writes the pictures of an exercise or of the workout's notes, leaving the field absent when none are left. */
function setAt(at: At, ids: string[]): void {
  const d = state.draft;
  if (!d) return;
  const o = at == null ? d : d.ex[at];
  if (!o) return;
  if (ids.length) o.pics = ids;
  else delete o.pics;
}

const atOf = (v: string | undefined): At => (v === undefined || v === 'n' || v === 'h' ? null : Number(v));
const atKey = (at: At): string => (at == null ? 'n' : String(at));

/** The pictures of an exercise or of the workout's notes as small buttons that open each large, with Add picture after them while there is room. */
export function picStrip(at: At, add = true): TemplateResult | typeof nothing {
  const ids = picsShown(idsAt(at));
  const room = add && idsAt(at).length < PIC_MAX;
  if (!ids.length && !room) return nothing;
  return html`<div class="pstrip">${ids.map(
    (id, i) =>
      html`<button class="pthumb" data-act="picOpen" data-id=${id} data-at=${atKey(at)} aria-label=${`Picture ${i + 1}: open`}>\x3cimg src=${picUrl(id) || ''} alt="" loading="lazy" decoding="async"></button>`
  )}${
    room
      ? html`<label class="btn sm padd" data-tip="Kept on this phone only: not in backups or your account yet.">+ Picture<input type="file" accept="image/*" data-pic=${atKey(at)} hidden></label>`
      : nothing
  }</div>`;
}

/** A saved session's pictures, to look at only (History): each opens large, with nothing to change. */
export function picStripSaved(ids: readonly string[] | undefined): TemplateResult | typeof nothing {
  const shown = picsShown(ids ? [...ids] : []);
  if (!shown.length) return nothing;
  return html`<div class="pstrip">${shown.map(
    (id, i) =>
      html`<button class="pthumb" data-act="picOpen" data-id=${id} data-at="h" aria-label=${`Picture ${i + 1}: open`}><img src=${picUrl(id) || ''} alt="" loading="lazy" decoding="async"></button>`
  )}</div>`;
}

/** A picture picked in an Add picture field: kept, then added to its note; true when the field was one. */
export function picChange(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLInputElement) || t.type !== 'file' || t.dataset.pic === undefined) return false;
  const f = t.files && t.files[0];
  const at = atOf(t.dataset.pic);
  const d0 = state.draft;
  t.value = '';
  if (!f || !d0) return true;
  if (idsAt(at).length >= PIC_MAX) {
    toast(`A note holds ${PIC_MAX} pictures`);
    return true;
  }
  const bid = at == null ? null : (d0.ex[at] && d0.ex[at].bid) || null;
  picAdd(f).then(
    r => {
      if ('why' in r) {
        toast(r.why);
        return;
      }
      const d = state.draft;
      // The session or the exercise may have moved while the photo was prepared: it goes where it was added, or nowhere.
      if (!d || d.id !== d0.id) return;
      const at2 = at == null ? null : bid ? d.ex.findIndex(b => b.bid === bid) : at;
      if (at2 != null && at2 < 0) return;
      act(
        () => {
          setAt(at2, [...idsAt(at2), r.id]);
        },
        { inProgress: true }
      );
      if (ui.modal && ui.modal.kind === 'note') renderModal();
      else rerenderKeepScroll();
    },
    (e: unknown) => {
      log('pics-add', e);
      toast('That photo could not be added');
    }
  );
  return true;
}

/** A picture shown large, with Remove while it is on the session open (none from History's saved copy). */
export function picSheet(m: { id: string; at: At; ro?: boolean | undefined }): TemplateResult {
  const u = picUrl(m.id);
  const b = !m.ro && m.at != null && state.draft ? state.draft.ex[m.at] : null;
  const title = m.ro ? 'Picture' : b ? exName(b.exId) : 'Workout notes';
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${title}</h3>${closeX()}</div>
    ${u ? html`\x3cimg class="pbig" src=${u} alt=${`Picture on ${title}`}>` : html`<p class="small muted">This picture is not on this phone.</p>`}
    <div class="row u-mt10">${state.draft && !m.ro ? html`<button class="btn danger" data-act="picRemove" data-id=${m.id} data-at=${atKey(m.at)}>Remove picture</button>` : nothing}<button class="btn" data-act="mClose">Close</button></div></div>`;
}

/** The taps on pictures: open one large, take one off. */
export const PIC_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  picOpen(t) {
    const id = t.dataset.id;
    if (!id) return;
    openModal({ kind: 'pic', id, at: atOf(t.dataset.at), ...(t.dataset.at === 'h' ? { ro: true } : {}) });
  },
  picRemove(t) {
    const id = t.dataset.id;
    const at = atOf(t.dataset.at);
    if (!id) return;
    confirmBox(
      'Remove this picture?',
      'It comes off this note. Undo brings it back.',
      'Remove',
      () => {
        act(
          () => {
            setAt(
              at,
              idsAt(at).filter(x => x !== id)
            );
          },
          { inProgress: true, undo: true }
        );
        closeModal();
        rerenderKeepScroll();
        toast('Picture removed', true);
      },
      true
    );
  }
};
