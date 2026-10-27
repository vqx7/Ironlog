/* The app's own taps (r63, from the legacy script's 25-helpers.js and
   27-actions.js): the menu and the Guide, installing, a section shown again
   or reached, the crash screen's Try again, Undo, the help lines, the rest
   timer's buttons, a question's answers, and the backup and spreadsheet
   exports. Each change to the log goes through `act`. */

import { APP_NAME, APP_VERSION, FILE_PREFIX, STORAGE_ID } from './config';
import { today } from './util';
import { CARDIOL, CWHENL, MK, ML, noE1 } from './library';
import { DSEC_ALIAS, HIDEABLE, HIDEABLE_KEYS } from './layout';
import { loadWords } from './loads';
import { log } from './storage';
import { plainTemplate } from './normalize';
import { EX, U, fmtW, loadOf, rirEst, sortedSessions } from './live';
import { e1 } from './formulas';
import { state, ui } from './store';
import { act, undoStep } from './act';
import { isStandalone, installKind } from './env';
import { distShow, distU } from './display';
import { closeModal, openModal, render, rerenderKeepScroll } from './page';
import { stopTimer, timerAdd } from './timer';
import { toast, toastHide } from './toast';
import type { Tap } from './workstate';

/** Clears what earlier builds put in Recently deleted: a ready-made routine removed unchanged is not kept (r34.1). Once, at start. */
export function trashTidy(): void {
  const tr = state.trash || [];
  const keep = tr.filter(t => !(t.kind === 'routine' && plainTemplate(t.data)));
  if (keep.length !== tr.length)
    act(() => {
      state.trash = keep;
    });
}
/** Notes that a backup was made today (the Backup due reminder counts from it). */
export function markExported(): void {
  act(() => {
    state.settings.lastExport = today();
  });
}

/** The downloads service where the page runs inside Claude (retired), which says when a file is saved, else null. */
async function downloads(): Promise<{ save(o: { filename: string; data: string }): Promise<unknown> } | null> {
  const c = window.claude;
  if (!(c && typeof c.use === 'function')) return null;
  return (await c.use('downloads')) || null;
}
/** A code an error carries, else ''. */
const codeIs = (e: unknown, c: string): boolean => !!e && typeof e === 'object' && 'code' in e && e.code === c;
/** An error's name, else ''. */
const nameIs = (e: unknown, n: string): boolean => e instanceof Error && e.name === n;

/** How long after a download link is clicked its address is let go, in milliseconds. */
const LINK_MS = 1000;
/* Everything in this app lives in one browser, so "did the backup actually
   land" is the single question that matters. The downloads capability confirms
   the save, so that path marks the export itself. The anchor fallback confirms
   nothing: it can be blocked silently by a sandboxed frame, and the old code
   still cleared the "Backup due" nag. So that path asks. */
/** Saves a file the best way this browser allows (the downloads service, the share sheet in the installed app, a download link), or shows its text to copy. */
export async function exportFile(
  data: string,
  filename: string,
  mime: string,
  okMsg: string,
  onSaved: (() => void) | null,
  fallbackTitle: string,
  fallbackHelp: string
): Promise<void> {
  try {
    const dl = await downloads();
    if (dl) {
      try {
        await dl.save({ filename, data });
        if (onSaved) onSaved();
        toast(okMsg);
        return;
      } catch (e) {
        if (codeIs(e, 'declined')) {
          toast('Save cancelled');
          return;
        }
        log('export', e);
      }
    }
  } catch (e) {
    log('export', e);
  }
  /* The installed app on a phone: the share sheet is how a file reaches Files
     or iCloud Drive (a download link inside a home-screen app on iOS opens a
     preview with nowhere to save). A completed share is taken as saved. */
  try {
    const file = typeof File === 'function' ? new File([data], filename, { type: mime }) : null;
    if (file && isStandalone() && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        if (onSaved) onSaved();
        toast(okMsg);
        return;
      } catch (e) {
        if (nameIs(e, 'AbortError')) {
          toast('Save cancelled');
          return;
        }
        log('export', e);
      }
    }
  } catch (e) {
    log('export', e);
  }
  let clicked = false;
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: mime }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, LINK_MS);
    clicked = true;
  } catch (e) {
    log('export', e);
  }
  if (!clicked) {
    openModal({ kind: 'text', title: fallbackTitle, help: fallbackHelp, text: data, readonly: true });
    return;
  }
  confirmSaved(filename, onSaved, fallbackTitle, fallbackHelp, data);
}
/** Asks whether the download landed (only the lifter can see it did). */
function confirmSaved(filename: string, onSaved: (() => void) | null, title: string, help: string, data: string): void {
  openModal({
    kind: 'confirm',
    title: 'Did the file download?',
    body: `Look for ${filename}. If nothing appeared, this browser blocked the download and you should copy the text instead.`,
    okLabel: 'Yes, I have the file',
    fn: () => {
      if (onSaved) onSaved();
      toast('Backup recorded');
    },
    alt: {
      label: 'Show the text instead',
      fn: () => openModal({ kind: 'text', title, help, text: data, readonly: true })
    }
  });
}
/** Exports the whole log as a backup file. */
export function exportBackup(): Promise<void> {
  const data = JSON.stringify(
    { app: STORAGE_ID, version: APP_VERSION, exported: new Date().toISOString(), state },
    null,
    1
  );
  return exportFile(
    data,
    `${FILE_PREFIX}-backup-${today()}.json`,
    'application/json',
    'Backup saved',
    markExported,
    'Backup text',
    'Copy all of this and keep it somewhere safe. Paste it into Import on any device to restore.'
  );
}
/* One row per set, in display units, for anyone who wants this in a spreadsheet.
   This is not a backup: it cannot be imported, and it carries no routines or
   settings. The JSON export remains the thing that restores the app. */
/** Exports every set as a spreadsheet's rows (CSV), and cardio after them. */
export function exportCSV(): Promise<void> | undefined {
  const q = (v: unknown) => {
    const s = String(v == null ? '' : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows: unknown[][] = [
    [
      'date',
      'day',
      'deload',
      'exercise',
      'primary',
      'set',
      'warmup',
      'dropset',
      'per_side',
      'load_entry',
      `load_${U()}`,
      `total_load_${U()}`,
      'reps',
      'rir',
      `e1rm_${U()}`,
      'exercise_note',
      'session_note',
      'session_minutes',
      'avg_hr',
      'unit',
      'calibration'
    ]
  ];
  for (const ss of sortedSessions()) {
    for (const b of ss.ex) {
      const ex = EX(b.exId);
      b.sets.forEach((s, i) => {
        const total = loadOf(ex, s, ss.date);
        const est = s.warm || s.drop || noE1(ex) ? null : e1(total, +s.r, rirEst(s, ex));
        rows.push([
          ss.date,
          ss.dayName,
          ss.deload ? 'yes' : 'no',
          ex.name,
          ML[ex.primary] || ex.primary,
          i + 1,
          s.warm ? 'yes' : 'no',
          s.drop ? 'yes' : 'no',
          ex.perSide ? 'yes' : 'no',
          loadWords(ex),
          fmtW(+s.w || 0),
          fmtW(total),
          s.r,
          s.rir == null ? '' : s.rir,
          est == null ? '' : fmtW(est),
          b.note || '',
          ss.notes || '',
          ss.durMin || '',
          '',
          ex.timed ? 'seconds' : 'reps',
          s.cal ? `stop at ${s.cal.at}, called ${s.cal.pred} left` : ''
        ]);
      });
    }
  }
  // A cardio entry's minutes under session_minutes, as the header says (r55; r54 wrote them a column early).
  for (const c of [...state.cardio].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)))
    rows.push([
      c.date,
      'Cardio',
      'no',
      CARDIOL[c.kind],
      '',
      1,
      'no',
      'no',
      'no',
      '',
      '',
      '',
      '',
      '',
      '',
      [CWHENL[c.when], c.dist ? `${distShow(c.dist)} ${distU()}` : '', c.note].filter(Boolean).join('; '),
      '',
      c.min,
      c.hr == null ? '' : c.hr,
      'minutes',
      ''
    ]);
  if (rows.length === 1) {
    toast('No sessions to export');
    return undefined;
  }
  const data = rows.map(r => r.map(q).join(',')).join('\r\n');
  return exportFile(
    data,
    `${FILE_PREFIX}-sets-${today()}.csv`,
    'text/csv',
    'CSV saved',
    null,
    'CSV text',
    'Copy all of this and paste it into a spreadsheet. This is not a backup.'
  );
}

/** The app's own taps, by data-act. */
export const APP_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  iconHow() {
    openModal({ kind: 'icon' });
  },
  guideOpen(t) {
    const k = t && t.dataset && t.dataset.g;
    if (ui.modal) closeModal();
    openModal({ kind: 'guide', open: k || '' });
  },
  menuOpen() {
    if (ui.modal && ui.modal.kind === 'menu') {
      closeModal();
      return;
    }
    if (ui.modal) closeModal();
    openModal({ kind: 'menu' });
  },
  install() {
    const how = installKind();
    if (how === 'prompt') {
      const e = window.__installEvt;
      window.__installEvt = null;
      try {
        if (!e) throw new Error('No install offer');
        e.prompt();
        Promise.resolve(e.userChoice).then(
          (r: unknown) => {
            if (r && typeof r === 'object' && 'outcome' in r && r.outcome === 'accepted')
              toast(`Installing ${APP_NAME}. Open it from your home screen.`);
            rerenderKeepScroll();
          },
          () => {
            // A choice the browser could not report: the tab is drawn again when the install happens (ironlogInstallReady).
          }
        );
      } catch (err) {
        log('install', err);
        openModal({ kind: 'install', how: 'menu' });
      }
      return;
    }
    openModal({ kind: 'install', how });
  },
  secShow(t) {
    const k = t.dataset.k;
    if (!k || !HIDEABLE_KEYS.has(k)) return;
    act(() => {
      state.settings.hidden = state.settings.hidden.filter(x => x !== k);
    });
    ui.folds[k] = true;
    rerenderKeepScroll();
    const el = document.querySelector(`#view > [data-sk="${k}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
    const lab = (HIDEABLE.find(x => x[0] + ':' + x[1] === k) || [])[2] || 'Section';
    toast(`${lab} added. Hide it again in Settings, Layout.`);
  },
  goLayout() {
    if (ui.modal) closeModal();
    ui.tab = 'settings';
    ui.folds['settings:layout'] = true;
    window.scrollTo(0, 0);
    render();
    const el = document.querySelector('#view > [data-mkey="layout"]');
    if (el) el.scrollIntoView({ block: 'start' });
  },
  goBackup() {
    if (ui.modal) closeModal();
    ui.tab = 'settings';
    ui.folds['settings:data'] = true;
    window.scrollTo(0, 0);
    render();
    const el = document.getElementById('dataSec');
    if (el) el.scrollIntoView({ block: 'start' });
  },
  /* Every tile, summary row and map detail lands on the matching dashboard
     section, opened even if you had folded it, with the relevant muscle or
     exercise already selected. */
  goDash(t) {
    const el0 = t instanceof Element ? t : null;
    const raw = el0 ? el0.getAttribute('data-sec') : t.dataset.sec || null,
      m = el0 ? el0.getAttribute('data-m') : t.dataset.m || null,
      ex = el0 ? el0.getAttribute('data-ex') : t.dataset.ex || null;
    const sec = raw && DSEC_ALIAS[raw] ? DSEC_ALIAS[raw] : raw;
    if (sec && state.settings.hidden.includes('dash:' + sec)) {
      toast('That section is hidden. Turn it back on in Settings under Layout.');
      return;
    }
    if (raw === 'svol') ui.volMode = 'load';
    if (m && MK.some(k => k === m)) {
      ui.dashMuscle = m;
      if (sec === 'volume') ui.volMode = 'trend';
    }
    if (ex) ui.dashEx = ex;
    if (sec) {
      ui.folds['dash:' + sec] = true;
      if (raw !== sec) ui.folds['dash:sub:' + raw] = true;
    }
    ui.tab = 'dash';
    window.scrollTo(0, 0);
    render();
    if (sec) {
      try {
        const el = document.getElementById('sec-' + sec);
        if (el) {
          if (el instanceof HTMLDetailsElement) el.open = true;
          const inner = raw !== sec ? document.getElementById('sub-' + raw) : null;
          if (inner instanceof HTMLDetailsElement) inner.open = true;
          const tgt = inner || el;
          if (tgt.scrollIntoView) tgt.scrollIntoView({ block: 'start' });
        }
      } catch (e) {
        // Scrolling there is best effort.
      }
    }
  },
  // The sheet closed first (r56.1): a question left open reads as Cancel, so the sync waiting on it does not wait forever.
  crashRetry() {
    ui.tab = 'today';
    ui.planView = 'routine';
    try {
      closeModal();
    } catch (e) {
      log('render', e);
    }
    ui.modal = null;
    window.scrollTo(0, 0);
    render();
  },
  undo() {
    const r = undoStep();
    if (r === 'none') toast('Nothing left to undo');
    else if (r === 'failed') toast('Could not undo that');
    else if (r === 'unchanged') toast('Nothing to undo there: it has changed since.');
    else {
      toastHide();
      render();
      toast(`Undone. ${r} step${r === 1 ? '' : 's'} left`);
    }
  },
  help(t) {
    const k = t.dataset.h || '';
    const on = !ui.help.has(k);
    if (on) ui.help.add(k);
    else ui.help.delete(k);
    const el = document.getElementById('help-' + k);
    if (el) {
      el.hidden = !on;
      // A ? outside a section (the Start card, a page title) may point into a closed section, so open it.
      const d = on ? el.closest('details') : null;
      if (d && !d.open) d.open = true;
    }
    document
      .querySelectorAll(`[data-act="help"][data-h="${k}"]`)
      .forEach(b => b.setAttribute('aria-expanded', String(on)));
  },
  tAdd() {
    timerAdd();
  },
  tStop() {
    stopTimer();
  },
  mClose() {
    closeModal();
  },
  mOk() {
    const m = ui.modal;
    const fn = m && m.kind === 'confirm' ? m.fn : null;
    if (m && m.kind === 'confirm') m.answered = true;
    closeModal();
    if (fn) fn();
  },
  mAlt() {
    const m = ui.modal;
    const a = m && m.kind === 'confirm' ? m.alt : null;
    if (m && m.kind === 'confirm') m.answered = true;
    closeModal();
    if (a && a.fn) a.fn();
  },
  export() {
    exportBackup();
  },
  exportCsv() {
    exportCSV();
  },
  showBackup() {
    openModal({
      kind: 'text',
      title: 'Backup text',
      help: 'Select all and copy. Paste it into Import on any device to restore.',
      text: JSON.stringify({ app: STORAGE_ID, exported: new Date().toISOString(), state }),
      readonly: true
    });
  },
  copyText() {
    const ta = document.getElementById('mText');
    if (!(ta instanceof HTMLTextAreaElement)) return;
    ta.select();
    let ok = false;
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(ta.value).then(
          () => {
            markExported();
            toast('Copied');
          },
          () => {
            // Refused (no permission, or the page not in focus): the lifter copies by hand, as the toast says.
            toast('Select the text and copy it manually');
          }
        );
        return;
      }
      ok = document.execCommand('copy');
    } catch (e) {
      log('copy', e);
    }
    if (ok) markExported();
    toast(ok ? 'Copied' : 'Select the text and copy it manually');
  }
};
