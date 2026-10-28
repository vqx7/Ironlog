/* History (r57, phase 5): the sessions by week, cardio and mobility, and
   Recently deleted, drawn by lit-html as src/23-history-settings.js drew
   them, and the actions that change what it shows, each change to the log
   through `act`. Starting a workout from a session (Edit, Do again) and the
   sheets it opens (the calendar, a past workout, an import) are the session
   and sheet modules' actions (actsstart.ts, the sheets*.ts modules),
   reached by the button's data-act through events.ts's table (r63). */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { act, toTrash } from './act';
import { CARDIOL, CWHENL } from './library';
import { fmtDate, fmtDateRow, sessTm } from './format';
import { isWork } from './formulas';
import { TRASH_DAYS, TRASH_MAX, sessCmp } from './records';
import { CHK_Q, chkWord } from './coach';
import { addDays, today, weekStart, WEEK_DAYS } from './util';
import { EX, IDX, U, exName, sessionWords, toD } from './live';
import { loadNote } from './loads';
import { normalize } from './normalize';
import { HIST_PAGE, setState, state, ui } from './store';
import { distShow, distU, fmtK, noLog, setStr } from './display';
import { pageTitle, placed, section, tabFoot } from './view';
import type { Field } from './view';
import type { CardioEntry, Session } from './types';
import type { ExerciseLike } from './model';
import { UNDO_DAYS } from './storage';
import { confirmBox, render, rerenderKeepScroll } from './page';
import { toast } from './toast';

/** The cardio entries History lists; older ones are in the CSV export. */
const CARDIO_SHOWN = 40;

/** After a list of sets: what the load and reps mean, when not a plain total. */
function histUnits(ex: ExerciseLike): TemplateResult | typeof nothing {
  const bits: string[] = [];
  const n = loadNote(ex).trim();
  if (n) bits.push(n);
  if (ex.perSide) bits.push(ex.timed ? 'seconds per side' : 'reps per side');
  return bits.length ? html` <span class="muted">(${bits.join(', ')})</span>` : nothing;
}

const IMPORT_TIP = 'From notes, a spreadsheet, or an export from another app. You check it before anything is saved.';

/** History, as a template of the log and `ui`. */
export function viewHistory(): TemplateResult {
  const ss = [...state.sessions].sort((a, b) => sessCmp(b, a));
  // Rows that share a date show their start time, or two sessions on one day look the same.
  const perDay: Record<string, number> = {};
  for (const x of ss) perDay[x.date] = (perDay[x.date] || 0) + 1;
  const real = ss.filter(x => !x.demo).length;
  const head = pageTitle(
    '',
    'History',
    noLog()
      ? 'Nothing logged yet'
      : `${ss.length} session${ss.length === 1 ? '' : 's'}${ss.length && real !== ss.length ? ` (${ss.length - real} demo)` : ''}`,
    html`<button class="btn sm" data-act="calOpen">Calendar</button><button class="btn sm" data-act="pastOpen">Log a past workout</button>`
  );
  const keyed: [string, TemplateResult][] = [];
  const cs = [...state.cardio].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  if (cs.length) keyed.push(['cardio', cardioSec(cs)]);
  const tr = state.trash;
  if (tr.length) keyed.push(['trash', trashSec()]);
  const impLine = html`<p class="small u-m14-0-0"><button class="linkbtn u-minh44" data-act="impOpen" data-tip=${IMPORT_TIP}>Import workouts</button></p>
`;
  const sections = (list: readonly (readonly [string, TemplateResult])[]): TemplateResult =>
    html`${repeat(
      placed('history', list),
      x => x[0],
      x => x[1]
    )}`;
  if (!ss.length)
    return html`${head}${sections(keyed)}
<div class="card">
<p class="u-m0">No sessions yet. Start one on Today, or log one you did without the app with Log a past workout.</p>
</div>
${impLine}${tabFoot('history')}`;
  keyed.push(['sessions', sessionsSec(ss, perDay)]);
  return html`${head}${sections(keyed)}${impLine}${tabFoot('history')}`;
}

function cardioSec(cs: readonly CardioEntry[]): TemplateResult {
  return section({
    sk: 'history:cardio',
    key: 'cardio',
    title: 'Cardio and mobility',
    sub: `${cs.length} entr${cs.length === 1 ? 'y' : 'ies'}`,
    body: html`<ul class="clist">${cs.slice(0, CARDIO_SHOWN).map(
      c =>
        html`<li><span><b>${CARDIOL[c.kind]}</b> <span class="small muted">${fmtDate(c.date)} · ${c.min} min${c.dist ? ` · ${distShow(c.dist)} ${distU()}` : ''}${c.hr ? ` · ${c.hr} bpm` : ''}${
          c.when !== 'solo' ? ' · ' + (CWHENL[c.when] || '').toLowerCase() : ''
        }${c.note ? ' · ' + c.note : ''}</span></span><button class="ib sm" data-act="cardioDel" data-id=${c.id} aria-label=${`Delete ${fmtDate(c.date)} cardio`}>✕</button></li>
`
    )}</ul>
${
  cs.length > CARDIO_SHOWN
    ? html`<p class="small muted">${cs.length - CARDIO_SHOWN} older entries are in the CSV export.</p>
`
    : nothing
}`
  });
}

/** What a copy in Recently deleted is called. */
function trashName(x: (typeof state.trash)[number]): string {
  const d = x.data;
  const date = typeof d.date === 'string' ? d.date : '';
  if (x.kind === 'session') return `${(typeof d.dayName === 'string' && d.dayName) || 'Session'}, ${fmtDate(date)}`;
  if (x.kind === 'cardio') return `${(typeof d.kind === 'string' && CARDIOL[d.kind]) || 'Cardio'}, ${fmtDate(date)}`;
  return `Routine: ${(typeof d.name === 'string' && d.name) || 'Routine'}`;
}

function trashSec(): TemplateResult {
  const tr = state.trash;
  return section({
    sk: 'history:trash',
    key: 'trash',
    title: 'Recently deleted',
    sub: html`<span class="hastip" data-tip=${`The ${TRASH_MAX} most recent deletions, each kept ${TRASH_DAYS} days`}>${tr.length}</span>`,
    body: html`<ul class="clist">${tr.map(x => {
      const nm = trashName(x);
      return html`<li><span>${nm} <span class="small muted">deleted ${fmtDate(x.date)}</span></span><span class="row u-g6_fnone"><button class="btn sm" data-act="restore" data-id=${x.id} data-k=${x.kind}>Restore</button><button class="ib sm" data-act="trashDel" data-id=${x.id} data-k=${x.kind} aria-label=${`Delete ${nm} for good`}>✕</button></span></li>
`;
    })}</ul>
<p class="small u-m10-0-0"><button class="linkbtn u-minh44" data-act="trashEmpty">Delete all for good</button></p>
`
  });
}

function sessionsSec(ss: readonly Session[], perDay: Record<string, number>): TemplateResult {
  const I = IDX();
  const withData = Object.keys(I.byEx).sort((a, b) => exName(a).localeCompare(exName(b)));
  if (ui.histEx && !I.byEx[ui.histEx]) ui.histEx = '';
  const shown = ui.histEx ? ss.filter(x => x.ex.some(b => b.exId === ui.histEx)) : ss;
  // Only the rows on the page are drawn: past a few hundred logs, drawing every one stalls a phone.
  const page = shown.slice(0, ui.histLimit);
  const wd = sessionWords(page.map(s => s.id));
  const wTag = (s: Session, exId: string): TemplateResult | typeof nothing => {
    const w = (wd[s.id] || {})[exId];
    return w && !(w === 'deload' && s.deload) && !(w === 'lighter' && s.light)
      ? html` <span class="tag">${w}</span>`
      : nothing;
  };
  const vol = new Map(I.sessVol.map(v => [v.id, v.vol]));
  const nWork = (s: Session): number => s.ex.reduce((a, b) => a + b.sets.filter(isWork).length, 0);
  /* Sessions sit under their week (Monday start), with the week's totals on
     the header; the totals cover every session of that week in the filter,
     not only the rows drawn so far. */
  const wkTot: Record<string, { n: number; sets: number; vol: number }> = {};
  for (const s of shown) {
    const w = weekStart(s.date);
    const o = wkTot[w] || (wkTot[w] = { n: 0, sets: 0, vol: 0 });
    o.n++;
    o.sets += nWork(s);
    o.vol += vol.get(s.id) || 0;
  }
  const thisWk = weekStart(today());
  const rows: TemplateResult[] = [];
  let lastWk: string | null = null;
  for (const s of page) {
    const wk = weekStart(s.date);
    if (wk !== lastWk) {
      lastWk = wk;
      const o = wkTot[wk] || { n: 0, sets: 0, vol: 0 };
      const lbl =
        wk === thisWk ? 'This week' : wk === addDays(thisWk, -WEEK_DAYS) ? 'Last week' : `Week of ${fmtDate(wk)}`;
      rows.push(
        html`<div class="hweek"><span class="hw-t">${lbl}</span><span class="hw-s" data-tip=${`${o.n} session${o.n === 1 ? '' : 's'}, ${o.sets} working sets, ${Math.round(toD(o.vol) ?? 0).toLocaleString()} ${U()} lifted`}>${o.sets} sets · ${fmtK(o.vol)} ${U()}</span></div>
`
      );
    }
    rows.push(sessionRow(s, perDay, nWork(s), vol.get(s.id) || 0, wd, wTag));
  }
  const more =
    shown.length > page.length
      ? html`<button class="btn block u-mt10" data-act="histMore">Show ${Math.min(HIST_PAGE, shown.length - page.length)} more (${page.length} of ${shown.length})</button>`
      : nothing;
  const body = html`<label class="field">Show sessions with<select data-bind="histEx">
<option value="" .selected=${!ui.histEx}>Any exercise</option>
${withData.map(
  id => html`<option value=${id} .selected=${ui.histEx === id}>${exName(id)}</option>
`
)}</select></label>
<div class="u-mt6">${
    shown.length
      ? nothing
      : html`<p class="muted">No sessions with that exercise.</p>
`
  }${rows}</div>
${more}`;
  const last = ss[ss.length - 1];
  return section({
    sk: 'history:sessions',
    key: 'sessions',
    title: 'Sessions',
    sub: ui.histEx ? `${shown.length} with ${exName(ui.histEx)}` : `since ${last ? fmtDate(last.date) : ''}`,
    body,
    def: true
  });
}

function sessionRow(
  s: Session,
  perDay: Record<string, number>,
  nSets: number,
  vol: number,
  wd: Record<string, Record<string, string>>,
  wTag: (s: Session, exId: string) => TemplateResult | typeof nothing
): TemplateResult {
  const open = ui.histOpen === s.id;
  // A deload's name ends " (deload)", so beside its tag it read "(deload) deload" (r54, the audit): the tag says it once.
  const name = s.deload ? String(s.dayName || 'Session').replace(/ \(deload\)$/, '') : s.dayName || 'Session';
  const tm = (perDay[s.date] || 0) > 1 && sessTm(s) ? `, ${sessTm(s)}` : '';
  const filtered = ui.histEx && !open ? s.ex.find(x => x.exId === ui.histEx) : undefined;
  const fex = filtered ? EX(filtered.exId) : null;
  return html`<div class=${open ? 'hitem open' : 'hitem'}><button class="pick u-b0_p0" data-act="histToggle" data-id=${s.id} aria-expanded=${String(open)}><span class="u-minw0"><b>${name}</b>${s.deload ? html` <span class="tag blue">deload</span>` : nothing}${
    s.free && !/freestyle/i.test(s.dayName || '') ? html` <span class="tag">freestyle</span>` : nothing
  }${
    Object.values(wd[s.id] || {}).includes('fewer sets') ? html` <span class="tag">fewer sets</span>` : nothing
  }${s.demo ? html` <span class="tag">demo</span>` : nothing}<br /><span class="small muted">${fmtDateRow(s.date)}${tm}</span></span><span class="num small u-taright_fnone">${nSets} sets<br /><span class="muted">${Math.round(toD(vol) ?? 0).toLocaleString()} ${U()}${s.durMin ? ` · ${s.durMin} min` : ''}</span></span></button>${
    filtered && fex
      ? html`<p class="small u-m6-0-0">${filtered.sets.map(x => setStr(fex, x)).join(', ')}${histUnits(fex)}</p>
`
      : nothing
  }${open ? sessionPanel(s, wTag) : nothing}</div>
`;
}

function sessionPanel(s: Session, wTag: (s: Session, exId: string) => TemplateResult | typeof nothing): TemplateResult {
  const chk = s.chk;
  return html`<div class="panel u-mt10">${
    chk
      ? html`<p class="small muted u-m0-0-6">Check-in: ${CHK_Q.filter(([k]) => chk[k])
          .map(([k, l, n]) => `${l.toLowerCase()} ${chkWord(n[(chk[k] || 1) - 1] || '')}`)
          .join(', ')}</p>
`
      : nothing
  }${s.ex.map(b => {
    const ex = EX(b.exId);
    return html`<p class="small u-m0-0-6"><b>${ex.name}</b>${wTag(s, b.exId)}: ${b.sets.map(x => setStr(ex, x)).join(', ')}${histUnits(ex)}${
      b.note ? html`<br /><span class="muted">${b.note}</span>` : nothing
    }</p>
`;
  })}${
    s.notes
      ? html`<p class="small muted u-m0-0-6">${s.notes}</p>
`
      : nothing
  }
<div class="row u-mt8"><button class="btn sm" data-act="histEdit" data-id=${s.id}>Edit</button><button class="btn sm" data-act="histRepeat" data-id=${s.id} data-tip="Start a new session today with these exercises">Do again</button><button class="btn sm danger" data-act="histDel" data-id=${s.id}>Delete</button></div>
</div>
`;
}

/* ---------- what History does ---------- */

/** The element a tap came from, as the page's dispatch hands it (data-act). */
type Tap = { dataset: DOMStringMap };

/** History's actions, by the data-act their buttons carry; the page's action table takes them in. */
export const HISTORY_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  histToggle(t) {
    ui.histOpen = ui.histOpen === t.dataset.id ? null : t.dataset.id;
    rerenderKeepScroll();
  },
  histMore() {
    ui.histLimit += HIST_PAGE;
    rerenderKeepScroll();
  },
  cardioDel(t) {
    const c = state.cardio.find(x => x.id === t.dataset.id);
    if (!c) return;
    const id = c.id;
    confirmBox(
      'Delete cardio entry?',
      `${CARDIOL[c.kind] || 'Cardio'}, ${fmtDate(c.date)}, ${c.min} min. It stays under Recently deleted for ${TRASH_DAYS} days.`,
      'Delete',
      () => {
        const done = act(
          () => {
            const c2 = state.cardio.find(x => x.id === id);
            if (c2) toTrash('cardio', c2);
            state.cardio = state.cardio.filter(x => x.id !== id);
          },
          { check: () => state.cardio.some(x => x.id === id) }
        );
        if (!done) return;
        rerenderKeepScroll();
        toast('Cardio entry moved to Recently deleted');
      },
      true
    );
  },
  /* Recently deleted is already deleted, so one item goes on a tap with Undo;
     all of them ask first (r34.1, V: no way to clear it). */
  trashDel(t) {
    const x = state.trash.find(y => y.id === t.dataset.id && y.kind === t.dataset.k);
    if (!x) return;
    act(
      () => {
        state.trash = state.trash.filter(y => y !== x);
      },
      { undo: true }
    );
    rerenderKeepScroll();
    toast('Deleted for good', true);
  },
  trashEmpty() {
    const n = state.trash.length;
    if (!n) return;
    confirmBox(
      `Empty Recently deleted (${n} item${n > 1 ? 's' : ''})?`,
      `Undo in Settings can still bring ${n > 1 ? 'them' : 'it'} back for ${UNDO_DAYS} days.`,
      'Delete all',
      () => {
        act(
          () => {
            state.trash = [];
          },
          { undo: true }
        );
        render();
        toast('Recently deleted cleared', true);
      },
      true
    );
  },
  restore(t) {
    const x = state.trash.find(y => y.id === t.dataset.id && y.kind === t.dataset.k);
    if (!x) return;
    act(() => {
      /* The copy goes back as it was saved, into a log normalize reads as it
         reads any log that comes in, so it is checked as an import is. */
      const id = x.id;
      const base = { ...state, trash: state.trash.filter(y => y !== x) };
      const next =
        x.kind === 'session' && !state.sessions.some(s => s.id === id)
          ? { ...base, sessions: [...state.sessions, x.data] }
          : x.kind === 'cardio' && !state.cardio.some(c => c.id === id)
            ? { ...base, cardio: [...state.cardio, x.data] }
            : x.kind === 'routine' && !state.routines.some(r => r.id === id)
              ? { ...base, routines: [...state.routines, x.data] }
              : base;
      setState(normalize(next));
    });
    render();
    toast('Restored');
  },
  histDel(t) {
    const id = t.dataset.id;
    confirmBox(
      'Delete session?',
      `This removes it from history and all analytics. It stays under Recently deleted for ${TRASH_DAYS} days (the ${TRASH_MAX} most recent items are kept).`,
      'Delete session',
      () => {
        act(
          () => {
            const s = state.sessions.find(x => x.id === id);
            if (s && !s.demo) toTrash('session', s);
            state.sessions = state.sessions.filter(x => x.id !== id);
          },
          { undo: true }
        );
        render();
        toast('Session deleted', true);
      },
      true
    );
  }
};

/** History's fields, by the data-bind they carry: what was picked, read on change. */
export const HISTORY_BINDS: Readonly<Record<string, (t: Field) => void>> = {
  histEx(t) {
    ui.histEx = t.value;
    ui.histLimit = HIST_PAGE;
    rerenderKeepScroll();
  }
};
