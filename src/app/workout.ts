/* The session screen (r60, phase 5's last screen; ARCHITECTURE.md, Phase 5
   design): Today with a workout open, drawn by lit-html as src/21-pick-session.js
   drew it (viewLogger): the sets, the grey reps, the effort strip, minus and
   plus, the folds, the check-in and the cardio cards. Its taps are worktaps.ts
   and its fields workfields.ts (CL-1); what a set and a tick change is
   worksets.ts. Every change to the session in progress goes through `act`,
   which leaves the caches for a change to the session alone (nothing they hold
   is read from it). The screen is drawn again after each change and lit-html
   changes only what differs, where the legacy code patched the page by hand
   (afterSet, the checkmark's classes, the progress bar, the grey numbers, the
   PR mark, the effort strip put in after a row); the
   numbers a row shows are read from the session each draw, so the screen
   cannot say what the log does not. */

import { bwWarn } from './bwnudge';
import { picStrip } from './notepics';
import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';

import { parkedHeld } from './park';
import { loadMode, CARDIO, CWHEN, ML, injLabel } from './library';
import { ssLetters } from './routines';
import { missedTag, repSpan, effLeastShort, LIGHT_RIR, fmtDate, estMin } from './format';
import { isMissed, DROP_START, LIGHT_SHARE } from './formulas';
import { today, EPS, pctOf, iso, addDays } from './util';
import { loadWords, loadNote, emptyLoad } from './loads';
import { CHK_Q, chkWord } from './coach';
import { rirScale, effShow, effName } from './effort';
import { prefGet, BWASK_KEY } from './storage';
import { EX, loadLabel, U, exName, stepLoad } from './live';
import { sessionShown, state } from './store';
import {
  effW,
  RIR_OPTS,
  RIR_HALF_OPTS,
  lastCell,
  greyW,
  lastDup,
  blockDone,
  whyTarget,
  targetText,
  lastHead,
  hintOnce,
  sessProgress,
  markedNew
} from './session';
import type { DraftBlock, DraftSet } from './types';
import type { ExerciseLike } from './model';
import { distU, distShow, rirShow, setShort, bestLine, effTgt, loadHead, fmtDateLong } from './display';

import { section, tipButton, fieldValue, helpButton, howText, drawing, drawScreen } from './view';

import type { Part } from './view';
import { W, blkIdx, blkIsOpen, blkIsShut, needHere } from './workstate';
import type { Draft } from './workstate';
import {
  blockProgress,
  calDueIdx,
  greyR,
  lastRFor,
  leftMin,
  loadIn,
  remainMin,
  rowBlank,
  rowPR,
  liftsOn,
  stepAt
} from './worksets';
import { LIMITS } from './records';
import { PICK_DAYS } from './analytics';
import { closeX } from './sheetsmisc';

/** What the New machine tag on an exercise says, tapped (r61). */
const NEW_TIP =
  'A new machine or gym: its targets, trend, stalls, PRs and bests start over from this session. Earlier sessions stay in History. Take it off in the ⋯ menu.';
/** The gap above the cardio buttons when there are entries, in pixels. */
const CARDIO_ADD_GAP_PX = 10;
/* lit-html moves an exercise's nodes, or a row's, with it when the order
   changes (a reorder, a warm-up added above), so the field being typed in
   stays on its set: each is drawn under its own id (the block's bid, the
   row's rid, r46 and r56.1), or, for one made before those ids, under one
   given it for this visit. A repeated id (none is made twice) falls back to
   the place, which is what lit-html would use without ids. */
const visitKeys = new WeakMap<object, string>();

// A list drawn by repeat under those ids: the items, their ids, and the part each draws, in order.
function repeatKeyed<X extends object>(
  xs: readonly X[],
  id: (x: X) => string | undefined,
  part: (x: X, i: number) => TemplateResult
): unknown {
  const ks = keysOf(xs, id);
  return repeat(xs, (_, i) => ks[i], part);
}

let visitN = 0;

function keysOf<X extends object>(xs: readonly X[], id: (x: X) => string | undefined): string[] {
  const seen = new Set<string>();
  return xs.map((x, i) => {
    let k = id(x);
    if (!k) {
      k = visitKeys.get(x);
      if (!k) visitKeys.set(x, (k = 'v' + ++visitN));
    }
    if (seen.has(k)) k = k + '#' + i;
    seen.add(k);
    return k;
  });
}

/* What the load number means. Every set stores the number you typed, as
   you typed it. What it means is a property of the exercise, said above the
   load column:
   - each:  per dumbbell, two dumbbells (DB bench, curls, lunges)
   - total: everything on one implement (a barbell with its bar, one dumbbell,
            plates on a landmine or a plate-loaded machine)
   - side:  plates on one side of a plate-loaded machine
   - stack: the pin setting on a cable or selectorized machine
   - bw:    added to bodyweight (pull-ups, dips)
   Estimated 1RM and targets stay in that same frame (per dumbbell, per side),
   so progress compares like with like. Weight lifted counts what actually
   moved: both dumbbells, both sides of the plates, both limbs when reps are
   logged per side. Changing an exercise's setting does not convert past
   sets. The column's heading says it short (LB each, +LB, Stack, Help LB),
   and the reps column says /side when reps are per side. Each heading shows
   the words in full on a tap (r69, V, 2026-11-03: the line of chips under
   the exercise said again what the headings say, on every exercise). */
// The longer words for a load mode; a mode not listed falls to the equipment's words.
const LOAD_TIPS: Readonly<Record<string, string>> = {
  each: 'Enter the weight of one dumbbell. Weight lifted counts both.',
  side: 'Enter the plates on one side. Weight lifted counts both sides.',
  stack: 'Enter the pin setting. It is not comparable across machines.',
  bw: 'Enter only what you add (belt, vest, dumbbell); 0 for bodyweight. Your logged bodyweight is added for estimates.'
};

/** The load column heading's tip: what the number is, short and in full. */
function loadTip(ex: ExerciseLike): string {
  if (ex.assist)
    return 'Load: machine help. Enter the help the machine gives, as on its pin. Less help is progress; your logged bodyweight minus the help is what counts.';
  const long =
    LOAD_TIPS[loadMode(ex)] ||
    (ex.equip === 'barbell'
      ? 'Enter everything on the bar, the bar included.'
      : ex.equip === 'dumbbell'
        ? 'Enter the weight of the one dumbbell you hold.'
        : 'Enter the total load.');
  return `Load: ${loadWords(ex)}. ${long}`;
}

/** The reps column heading's tip on a lift done one side at a time, or null on any other. */
function sideTip(ex: ExerciseLike): string | null {
  if (!ex.perSide) return null;
  return ex.timed
    ? 'Seconds per side: seconds for one side; do the same on the other.'
    : 'Reps per side: reps for one side; do the same on the other. One set still counts as one set.';
}

// Effort as the lifter reads it: RIR, or RPE when effort is entered as RPE. Same load, more reps: said as reps (r35).
function adjLine(b: DraftBlock, bi: number): Part {
  const a = b.adj;
  if (!a || !b.sets.some((x, i) => i > a.at && !x.done && !x.warm && !x.drop)) return '';
  const ex = EX(b.exId);
  const lb = (w: number): string => `${loadLabel(ex, w)}${ex.bw ? '' : ' ' + U()}${loadNote(ex)}`;
  if (Math.abs(a.w - a.from) < EPS)
    return html`<p class="adjline small" id=${`adj-${bi}`}><span><b>Next sets: ${a.r} reps at ${lb(a.w)}</b>, because ${a.why}.</span><button class="linkbtn" data-act="adjKeep" data-b=${bi}>Keep as it was</button></p>`;
  return html`<p class="adjline small" id=${`adj-${bi}`}><span><b>Next sets: ${lb(a.w)}</b>, ${a.up ? 'up' : 'down'} because ${a.why}.</span><button class="linkbtn" data-act="adjKeep" data-b=${bi}>Keep ${lb(a.from)}</button></p>`;
}

/* ---------- the screen ---------- */

/* RIR used to be a free-text field, then a native picker; it is picked from a
   strip of 0 to 5 under the set (r30): the cell shows the value, a tap on it
   opens the strip, and ticking a set with no RIR opens it by itself when
   asked for in Settings > Effort. Whole RIR is one row of 0 to 5. Half points
   and RPE are a grid under the label: whole numbers on top, each half between
   the two it sits between, every button 44 px tall and at least 40 px wide at
   320 px. The buttons carry RIR; RPE only changes what they say. */
function effOpts(): string[] {
  const sc = rirScale();
  return (sc === 'whole' ? RIR_OPTS : RIR_HALF_OPTS).slice();
}

const effAria = (si: number): string =>
  rirScale() === 'rpe' ? `RPE for set ${si + 1}` : `Reps in reserve for set ${si + 1}`;

/** Whether the effort strip is open under set si of exercise bi. */
export function stripIs(bi: number, si: number): boolean {
  return !!W.stripAt && W.stripAt.s === si && blkIdx(W.stripAt.b) === bi;
}

function rirButton(val: DraftSet['rir'], bi: number, si: number, target: unknown): TemplateResult {
  const cur = effShow(val);
  return html`<button type="button" class=${'rirb' + (cur === '' ? ' unset' : '')} data-act="rirOpen" data-f="rir" data-b=${bi} data-s=${si} aria-haspopup="true" aria-expanded=${String(stripIs(bi, si))} aria-label=${`${effAria(si)}: ${cur === '' ? 'not set' : cur}`}>${cur === '' ? (target != null ? '–' : effName()) : cur}</button>`;
}

function rirStrip(bi: number, si: number, cur: string): TemplateResult {
  const sc = rirScale();
  const two = sc !== 'whole';
  // A stored value off the grid (0.25 from an import) shows in the set's box; the grid keeps its 11 places.
  const opts = effOpts();
  if (!two && cur !== '' && !opts.includes(cur)) {
    opts.push(cur);
    opts.sort((a, b) => +a - +b);
  }
  const btn = (o: string): TemplateResult =>
    html`<button type="button" data-act="rirPick" data-b=${bi} data-s=${si} data-v=${o} aria-pressed=${String(cur === o)} class=${cur === o ? 'on' : nothing}>${sc === 'rpe' ? effShow(o) : o}</button>`;
  // RPE reads up from 5 to 10, as RPE charts do; RIR from 0 up.
  const ord = sc === 'rpe' ? opts.slice().reverse() : opts;
  const body = two
    ? html`<div class="rs-g">${ord.filter(o => Number.isInteger(+o)).map(btn)}${ord.filter(o => !Number.isInteger(+o)).map(btn)}</div>`
    : opts.map(btn);
  return html`<div class=${'rirstrip' + (two ? ' two' : '')} role="group" aria-label=${effAria(si)} data-b=${bi} data-s=${si}><span class="rs-l">${effName()}</span>${body}<button type="button" class="rs-x" data-act="rirPick" data-b=${bi} data-s=${si} data-v="" aria-label=${`Clear ${effName()}`}>✕</button></div>`;
}

/* The check-in: three taps; how they line up with the sessions is Stats'
   Readiness and performance (stats.ts). It sat at the top of the session as
   a fold until r69, when it moved behind the Check-in button beside the date
   (V, 2026-11-03: the top of the session was text before the first
   exercise); answered the same way and saved on the session the same way.
   What it offers (r30) stays at the top of the session, with the two changes
   that answer it: two or more low answers, a lighter session first; one, a
   note to keep a rep more in reserve. Already made lighter: said instead of
   offered again. */
/** The check-in's answers in words ("sleep good, energy low"), or empty when none is given. */
function chkSum(d: Draft): string {
  const c = d.chk || {};
  return CHK_Q.filter(([k]) => c[k])
    .map(([k, l, n]) => `${l.toLowerCase()} ${chkWord(n[(c[k] || 1) - 1])}`)
    .join(', ');
}

/** The low answers of a session's check-in. */
const chkLow = (d: Draft): number => CHK_Q.filter(([k]) => (d.chk || {})[k] === 1).length;

/** The check-in sheet: the three questions of the session in progress, each one tap. */
export function checkinSheet(): TemplateResult {
  const d = state.draft;
  const c = (d && d.chk) || {};
  return html`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="chkH"><div class="sheet-h"><h3 id="chkH">Check-in</h3>${closeX()}</div>${
    d
      ? CHK_Q.map(
          ([k, l, names]) =>
            html`<div class="ci-row"><span class="small">${l}</span><div class="seg" role="group" aria-label=${l}>${names.map(
              (n, i) =>
                html`<button class=${'chip ' + (c[k] === i + 1 ? 'on' : '')} data-act="chk" data-k=${k} data-v=${i + 1} aria-pressed=${String(c[k] === i + 1)}>${n}</button>`
            )}</div></div>`
        )
      : nothing
  }</div>`;
}

/** What the check-in offers under it, or nothing (above). */
export function readyCard(d: Draft, low: number): Part {
  if (!low || d.light || d.deload || d.editingId || d.past) return '';
  const open = d.ex.some(b => !b.light && !b.sets.some(x => !x.warm && !rowBlank(b, x)));
  const left = remainMin(d);
  if (low >= 2 && !open && d.ex.some(b => b.light))
    return html`<p class="callout u-m8-0-0" id="readyCard">Made lighter: the exercises not started are half the sets at about ${pctOf(LIGHT_SHARE)}% loads.</p>`;
  if (low < 2)
    return html`<p class="callout u-m8-0-0" id="readyCard">Keep the loads. Leave an extra rep in reserve if it feels heavy.</p>`;
  return html`<div class="callout yellow u-m8-0-0" id="readyCard"><p class="u-m0">Low readiness today. ${tipButton(`A lighter or shorter session fits a low day better than pushing. Make it lighter changes only the exercises not started: half the sets, about ${pctOf(LIGHT_SHARE)}% loads, nothing to beat.`)}</p><div class="row u-mt8">${open ? html`<button class="btn sm" data-act="makeLight">Make it lighter</button>` : ''}${left > 0 ? html`<button class="btn sm" data-act="shortOpen">Short on time</button>` : ''}</div></div>`;
}

/* Bodyweight, asked once in the first session with a bodyweight lift when
   none is logged (r32, from the third review: pull-ups and leg raises added
   nothing to weight lifted, and had no estimate, with no weigh-in). Saved
   like a weigh-in on Today; Not now is kept per device. */
function bwAskCard(d: Draft): Part {
  if (d.editingId || d.past || state.bodyweights.length || !d.ex.some(b => EX(b.exId).bw)) return '';
  if (prefGet(BWASK_KEY)) return '';
  return html`<div class="card" id="bwAsk"><p class="small u-m0-0-8"><b>Your bodyweight</b> counts in bodyweight lifts, for weight lifted and estimates. ${tipButton('Logged as a weigh-in for today. Add more on Today, under Body.', 'About bodyweight')}</p>
  <div class="row"><label class="field u-f1_m0"><span class="vh">Bodyweight (${U()})</span><input type="text" inputmode="decimal" id="bwVal" placeholder=${`Weight (${U()})`} aria-label=${`Bodyweight (${U()})`}></label><button class="btn sm primary" data-act="addBW">Save</button><button class="btn sm" data-act="bwAskNo">Not now</button></div></div>`;
}

/* Cardio and mobility inside a session: saved as their own entries on Finish,
   never counted as lifting sets. */
function cardioDraftCard(d: Draft): TemplateResult {
  const list = d.cardio || [];
  const rows = list.map(
    (
      c,
      ci
    ) => html`<div class="cgrid"><label class="field">Type<select data-cf="kind" data-c=${ci}>${CARDIO.map(([k, l]) => html`<option value=${k} .selected=${c.kind === k}>${l}</option>`)}</select></label>
    <label class="field">Minutes<input type="text" inputmode="numeric" data-cf="min" data-c=${ci} .value=${fieldValue(c.min == null ? '' : String(c.min))}></label>
    <label class="field">Avg HR<input type="text" inputmode="numeric" data-cf="hr" data-c=${ci} .value=${fieldValue(c.hr == null ? '' : String(c.hr))} placeholder="optional"></label></div>
    <label class="field u-mt6">Distance (${distU()})<input type="text" inputmode="decimal" data-cf="dist" data-c=${ci} .value=${fieldValue(c.dist ? String(distShow(c.dist)) : '')} placeholder="optional"></label>
    <div class="row u-mt6"><select data-cf="when" data-c=${ci} class="u-f1" aria-label="When">${CWHEN.map(([k, l]) => html`<option value=${k} .selected=${c.when === k}>${l}</option>`)}</select><button class="btn sm danger" data-act="cDraftDel" data-c=${ci}>Remove</button></div>`
  );
  const n = list.length;
  const mins = list.reduce((a, c) => a + (c.min || 0), 0);
  return section({
    sk: 'logger:cardio',
    title: 'Cardio and mobility',
    sub: n ? `${n} entr${n === 1 ? 'y' : 'ies'}${mins ? `, ${mins} min` : ''}` : 'optional',
    body: html`${rows}
  <div class="row" style=${`margin-top:${n ? CARDIO_ADD_GAP_PX : 0}px`}><button class="btn sm" data-act="cDraftAdd" data-when="pre">+ Before lifting</button><button class="btn sm" data-act="cDraftAdd" data-when="post">+ After lifting</button></div>`
  });
}

/* A session's exercises move by dragging this handle too (V, r29), alongside
   the ⋯ menu's Move up and Move down, which do the same thing (bUp, bDown). */
/** The drag handle of exercise bi, named for its lift. */
export function bgrip(bi: number, name: string): TemplateResult {
  return html`<span class="bgrip" role="button" tabindex="0" data-b=${bi} aria-label=${`Move ${name}: drag, or use the arrow keys`} title="Drag to move">⠿</span>`;
}

// Last time's set beside this row (r44): "100×8" with a break allowed before the ×, as the column is narrow.
function lastText(lt: string): Part {
  const k = lt.indexOf('×');
  return k < 0 ? lt : html`${lt.slice(0, k)}<wbr>${lt.slice(k)}`;
}

function setRow(
  d: Draft,
  b: DraftBlock,
  bi: number,
  si: number,
  ex: ExerciseLike,
  nr: boolean,
  dupB: boolean
): TemplateResult {
  const s = b.sets[si];
  const p = b.plan;
  const g = greyR(b, si);
  const ph = g == null ? '' : String(g);
  const pr = rowPR(b, si, d.date);
  const wn = b.sets.slice(0, si + 1).filter(x => !x.warm && !x.drop).length;
  // Last time's set for this row, beside this time's (r44, V): working sets only, by their order.
  const lt = s.warm || s.drop ? '' : lastCell(b, wn - 1, dupB);
  const gw = s.w == null ? greyW(b, si) : null;
  /* A drop set sits under the set it drops from (r66, 375): set in, marked ↳
     and named in the Last column, where it has no set of its own last time. */
  return html`<div class=${`sg${nr ? ' norir' : ''} ${s.done ? 'done' : ''}${pr ? ' pr' : ''}${s.drop ? ' sgdrop' : ''}`} data-pr=${pr || nothing}><button class=${'n wbtn' + (s.drop ? ' drop' : s.warm ? ' warm' : '')} aria-label=${`Set ${si + 1} type: ${s.warm ? 'warm-up' : s.drop ? 'drop set' : 'working set'}. Tap to change`} data-act="sWarm" data-b=${bi} data-s=${si}>${s.drop ? '↳' : s.warm ? 'W' : wn}</button><span class="ls" aria-label=${lt ? 'Last time ' + lt : s.drop ? 'Drop set' : 'No set last time'}>${lt ? lastText(lt) : s.drop ? 'Drop' : '–'}</span>
        <input type="text" inputmode="decimal" enterkeyhint="next" aria-label=${`${ex.name}, set ${si + 1} load`} data-f="w" data-b=${bi} data-s=${si} class=${needHere(bi, si) ? 'need' : nothing} .value=${fieldValue(loadIn(ex, s.w))} placeholder=${gw != null ? loadIn(ex, gw) : emptyLoad(ex)}>
        <input type="text" inputmode="numeric" enterkeyhint="next" aria-label=${`${ex.name}, set ${si + 1} ${ex.timed ? 'seconds' : 'reps'}${ex.perSide ? ' per side' : ''}`} data-f="r" data-b=${bi} data-s=${si} .value=${fieldValue(s.r == null ? '' : String(s.r))} placeholder=${ph}>
        ${nr ? '' : rirButton(s.rir, bi, si, p.rir)}
        <button class=${'cbtn ' + (s.done ? 'on' : '')} aria-label=${`Set ${si + 1} ${s.done && isMissed(s) ? 'missed' : 'done'}`} aria-pressed=${s.done ? 'true' : 'false'} data-act="sDone" data-b=${bi} data-s=${si}>✓</button></div>${stripIs(bi, si) ? rirStrip(bi, si, s.rir == null ? '' : String(s.rir)) : nothing}`;
}

/* Minus and plus (2.37, ST-6; V, 2026-11-08: "stepping by the lift's load step and one rep"). The set row has no room
   for four more 44 px buttons (254 px wide at 320, its load field 48), so they sit in one strip under the sets, where a
   tick moves nothing above them, and change the set you are on (stepAt, NEW-100), which the strip names, on the lift
   you are on only (liftsOn, NEW-98), not under every lift. Drawn as two accent pills side by side, each with the number
   it changes (V, 2026-11-09, after the Stitch drafts' steppers: the whole pill in the one accent, ends included),
   compact beside the set's name (NEW-104). An assisted lift's field takes the help, so only its reps step. Not in an
   edit, where every set is done. */
function stepStrip(d: Draft, b: DraftBlock, bi: number, ex: ExerciseLike): Part {
  const si = stepAt(b, bi);
  const s = b.sets[si];
  if (!s || d.editingId || !liftsOn(d).has(b)) return '';
  const wn = b.sets.slice(0, si + 1).filter(x => !x.warm && !x.drop).length;
  const name = s.warm ? 'Warm-up' : s.drop ? 'Drop set' : `Set ${wn}`;
  /* The set's name only: its row's tick already says it is done (V, 2026-11-09 21:41, NEW-105: no ", done"). It is the
     one mark of the set minus and plus change; its number is not also drawn in the accent (V, 22:32, NEW-106). */
  const said = name;
  const w = effW(b, si) ?? 0;
  const r = +(s.r ?? greyR(b, si) ?? 0) || 0;
  const btn = (f: 'w' | 'r', dir: '1' | '-1', off: boolean, label: string, txt: string): TemplateResult =>
    html`<button type="button" class="stepr-b" data-act="sStep" data-b=${bi} data-s=${si} data-sf=${f} data-d=${dir} aria-label=${`${name}: ${label}`} ?disabled=${off}>${txt}</button>`;
  // The value the set will save, as its row shows it (typed, else grey), so the pill reads as the set's own number.
  const lw = s.w != null ? s.w : effW(b, si);
  const pill = (
    f: 'w' | 'r',
    v: string,
    unit: string,
    dn: boolean,
    up: boolean,
    less: string,
    more: string
  ): TemplateResult =>
    html`<span class="stepr-g">${btn(f, '-1', dn, less, '−')}<span class="stepr-v" aria-hidden="true"><b>${v}</b><small>${unit}</small></span>${btn(f, '1', up, more, '+')}</span>`;
  return html`<div class="stepr" role="group" aria-label=${`${name}: load and ${ex.timed ? 'seconds' : 'reps'}`}><div class="stepr-h"><span class="stepr-l">${said}</span></div><div class="stepr-row">${
    ex.assist
      ? ''
      : pill(
          'w',
          lw == null ? '–' : loadIn(ex, lw),
          U(),
          stepLoad(ex, b.plan, w, -1) == null,
          stepLoad(ex, b.plan, w, 1) == null,
          'lighter',
          'heavier'
        )
  }${pill('r', r ? String(r) : '–', ex.timed ? 'sec' : 'reps', r <= 0, r >= LIMITS.reps, ex.timed ? 'fewer seconds' : 'one rep fewer', ex.timed ? 'more seconds' : 'one rep more')}</div></div>`;
}

/* Before the first tick the line keeps its space, blank (NEW-64, picture A of 2026-11-06): it appeared on that tick and
   pushed the sets 23 px down under the finger, so the next tap could land on the row above the one meant. */
function progressLine(b: DraftBlock, bi: number): Part {
  const p = blockProgress(b);
  return p
    ? html`<span class=${'tp' + (p.beat ? ' beat' : '')} id=${`tp-${bi}`} aria-hidden=${p.text ? nothing : 'true'}>${p.text || '\u00a0'}</span>`
    : '';
}

/** Whether an exercise is drawn folded: folded by hand, or, in a session, done and not opened again with no fold waiting for its moment. */
const isFolded = (d: Draft, b: DraftBlock, bi: number): boolean =>
  blkIsShut(bi, b) || (!d.editingId && blockDone(b) && !blkIsOpen(bi, b) && !W.foldWait.has(b));

function blockPart(
  d: Draft,
  b: DraftBlock,
  bi: number,
  letters: Readonly<Record<string, string>>,
  hintSeen: Set<string>,
  calIdx: number,
  bwAt: number
): TemplateResult {
  const ex = EX(b.exId);
  const p = b.plan;
  const ss = p.ss ? letters[p.ss] : null;
  const nr = !rirShow(ex);
  const side = sideTip(ex);
  const dupB = lastDup(d, bi);
  /* A superset is drawn as one group (r66, PENDING 375; V picked "Grouped and
     attached"): its exercises side by side in one box, A1 and A2 on their
     names, the group's letter and its rest said once at the top. */
  const grp = ss ? d.ex.filter(x => x.plan.ss === p.ss) : [];
  const gk = grp.indexOf(b);
  const ssCls = ss ? ` ss${gk === 0 ? ' ss-first' : ''}${gk === grp.length - 1 ? ' ss-last' : ''}` : '';
  const ssLbl = ss ? html`<span class="sslbl">${ss}${gk + 1}</span> ` : '';
  if (isFolded(d, b, bi)) {
    const ws = b.sets.filter(x => !x.warm);
    const prs = b.sets.filter((x, si) => !x.warm && rowPR(b, si, d.date)).length;
    const done = blockDone(b);
    // Not done (folded by hand, NEW-101): the sets it has done of its sets, and an empty ring where the tick goes.
    const work = b.sets.filter(x => !x.warm && !x.drop);
    const line = done
      ? ws.map(x => setShort(ex, x.w, x.r) + missedTag(x)).join(', ')
      : `${work.filter(x => x.done).length} of ${work.length} sets`;
    return html`<section class=${'block folded' + ssCls} id=${`blk-${bi}`} data-bi=${bi}>${bgrip(bi, ex.name)}<button class="bfold" data-act="bOpen" data-b=${bi} aria-expanded="false" aria-label=${done ? `${ex.name}, done. Open to edit` : `${ex.name}, ${line} done. Open`}><span class=${done ? 'bf-ck' : 'bf-ck bf-todo'} aria-hidden="true">${done ? '✓' : ''}</span><span class="bf-t"><b>${ssLbl}${ex.name}</b><span>${line}</span></span>${prs ? html`<span class="bf-pr">PR</span>` : ''}<span class="chev" aria-hidden="true"></span></button></section>`;
  }
  const partner = ss
    ? d.ex
        .filter(x => x !== b && x.plan.ss === p.ss)
        .map(x => exName(x.exId))
        .join(' + ')
    : '';
  const why = whyTarget(b);
  const bl = b.target ? bestLine(b.exId, d.past ? d.date : '') : '';
  const work = b.sets.filter(x => !x.warm && !x.drop).length;
  const canFill =
    !!b.lastR &&
    b.lastR.some(r => r != null) &&
    b.sets.some((s, i) => !s.done && !s.warm && !s.drop && s.r == null && lastRFor(b, i) != null);
  return html`<section class=${'block' + ssCls} id=${`blk-${bi}`} data-bi=${bi}>${ss && gk === 0 ? html`<p class="ssh">Superset ${ss}</p>` : ''}<div class="bh">${bgrip(bi, ex.name)}<div class="bh-m"><h3 aria-labelledby=${ex.note ? `bhn-${bi}` : nothing}><span id=${`bhn-${bi}`}>${ex.name}</span>${ex.note ? html` ${tipButton(ex.note, 'About ' + ex.name)}` : ''}</h3><p class="small muted">${ssLbl}<button type="button" class="linkbtn bmus" data-act="bMus" data-b=${String(bi)} aria-label=${`${ML[ex.primary]}: show the muscles worked on the body`}>${ML[ex.primary]}</button> · ${work || p.sets}×${repSpan(p.repMin, p.repMax, '-')}${ex.timed ? 's' : ''}${ex.perSide ? '/side' : ''}${nr ? '' : ` @${b.inj || ((d.light || d.deload || b.light) && b.last) ? effLeastShort(rirScale(), LIGHT_RIR) : effTgt(p.rir)}`} · ${p.rest}s${b.inj ? html` · <span class="tag red">Injury: ${injLabel(b.inj)}</span>` : ''}${markedNew(d, b.exId) ? html` · <span class="tag" data-tip=${NEW_TIP}>New machine</span>` : ''}</p></div>
      <div class="bh-acts"><button class="ib" aria-label=${`Fold ${ex.name}`} data-act="bFold" data-b=${bi}>▴</button><button class=${'ib' + (b.note || (b.pics && b.pics.length) ? ' noted' : '')} aria-label=${b.note || (b.pics && b.pics.length) ? `Note on ${ex.name}: edit` : `Add a note to ${ex.name}`} data-act="bNote" data-b=${bi} data-tip="A note or a picture: a cue, a seat setting, a niggle.">✎</button><button class="ib" aria-label="Exercise options" data-act="bMenu" data-b=${bi}>⋯</button></div></div>
      ${
        b.target
          ? html`<p class="hint"><b>Today: ${targetText(b)}</b>${why ? html` ${tipButton(why, 'Why this target')}` : ''}<span class="tp muted u-dblock">${lastHead(b, dupB)}</span>${bl ? html`<span class="tp muted u-dblock">${bl}</span>` : ''}${b.easier ? html`<span class="tp ez">${b.easier}</span>` : ''}${progressLine(b, bi)}</p>`
          : html`<p class="hint">${hintOnce(b.hint || '', hintSeen)}</p>`
      }${bi === bwAt ? bwWarn(b.exId) : ''}${bi === calIdx ? html`<p class="small caldue">Due for an RIR check: take one set here to failure. <button class="linkbtn tall" data-act="bCal" data-b=${bi}>Calibration set</button> <button class="linkbtn tall" data-act="calSnooze">Not now</button></p>` : ''}
      ${ss && partner && gk === 0 ? html`<p class="small muted u-m2-0-0">Superset with ${partner}; rest after the ${grp.length === 2 ? 'pair' : 'group'}.</p>` : ''}
      ${b.lastNote && !b.note ? html`<p class="small lnote">Your note, ${fmtDate(b.lastNote.date)}: ${b.lastNote.text} <button class="linkbtn" data-act="noteReuse" data-b=${bi}>Use again</button></p>` : ''}
      ${b.note ? html`<p class="small bnote" id=${`bn-${bi}`}>${b.note}</p>` : html`<p class="small bnote" id=${`bn-${bi}`} hidden></p>`}${picStrip(bi, false)}
      <div class=${'sg head' + (nr ? ' norir' : '')}><span data-tip="Tap a set's number to mark it a warm-up or a drop set.">#</span><span class="lsh">Last</span><span class="lh hastip" data-tip=${loadTip(ex)}>${loadHead(ex)}</span><span class=${side ? 'hastip' : nothing} data-tip=${side ?? nothing}>${ex.timed ? (ex.perSide ? 'Sec/side' : 'Sec') : ex.perSide ? 'Reps/side' : 'Reps'}</span>${nr ? '' : html`<span>${effName()}</span>`}<span>Done</span></div>${repeatKeyed(
        b.sets,
        x => x.rid,
        (_, si) => setRow(d, b, bi, si, ex, nr, dupB)
      )}${stepStrip(d, b, bi, ex)}${adjLine(b, bi)}<div class="row u-mt8">${canFill ? html`<button class="btn sm" data-act="fillLast" data-b=${bi} aria-label="Copy last session's reps" data-tip="Fill empty rows with last session's reps.">Copy last</button>` : ''}<button class="btn sm" data-act="sAdd" data-b=${bi} aria-label="Add a set" data-tip="Add a working set at the last load.">+ Set</button><button class="btn sm" data-act="sDel" data-b=${bi} aria-label="Remove a set" data-tip="Removes the last set not yet done." ?disabled=${!b.sets.length}>− Set</button>${
        !ex.timed && b.sets.some(x => x.done && !x.warm && !x.drop)
          ? html`<button class="btn sm" data-act="dropAdd" data-b=${bi} aria-label="Add a drop set" data-tip=${`About ${pctOf(DROP_START)}% of the last working weight, in your steps. Counts as half a set and never sets a target.`}>+ Drop</button>`
          : ''
      }${
        !d.editingId && b.sets.some(x => x.done && !x.warm) && b.sets.some(x => !x.done)
          ? html`<button class="btn sm bdone" data-act="bDoneAll" data-b=${bi} aria-label=${`Done with ${ex.name}`} data-tip="Log the sets left as shown, or skip them.">✓ Done</button>`
          : ''
      }${
        state.settings.timerMode !== 'off' && +p.rest > 0 && !d.past
          ? html`<button class="btn sm rest" data-act="tStart" data-b=${bi} aria-label=${`Start a ${p.rest} second rest`} data-tip="Start the rest timer.">⏱ ${p.rest}s</button>`
          : ''
      }</div></section>`;
}

const LOG_HELP_ON =
  'RIR is reps left in the tank: 3 or less counts the set as hard for weekly volume, 4 or more stays in history only. RIR is optional: a blank is read as your usual RIR on that lift, or as hard until you have rated a few of its sets. ';

const LOG_HELP =
  'W marks a warm-up (kept, never analysed); tap it again for ↳, a drop set (counts as work and volume, never as a PR or target). + Drop adds one under the last set ticked, with no rest before it; a warm-up is added from the ⋯ menu. Drag an exercise by its ⠿ to change the order. A superset is one box, A1 and A2: after a set of A1 the screen moves to A2, and the rest timer starts after the last exercise of the group. Timed holds log seconds in the Sec column. The date can be changed to log a past session.';

/* When a workout began, in the header: its time on the day it began, and
   "yesterday" or its date after that (r64, the r63 audit's P-S4-8: left open
   overnight, "started 9:00 AM" read as this morning). It is saved on the day
   it began either way. */
/** The header's words for when a workout began. */
function startedWords(t: number): string {
  const began = iso(new Date(t)),
    now = today();
  if (began === now) return new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return began === addDays(now, -1) ? 'yesterday' : fmtDate(began);
}

/** The session screen: Today with a workout open, drawn as a template of the session in progress and ui. */
export function viewWorkout(d: Draft): TemplateResult {
  const hintSeen = new Set<string>();
  // Warm-ups are not counted, the same as the progress bar under it.
  const doneN = d.ex.reduce((a, b) => a + b.sets.filter(s => s.done && !s.warm).length, 0);
  const left = leftMin(d);
  const sp = sessProgress(d);
  const calIdx = d.editingId ? -1 : calDueIdx(d);
  // The bodyweight line, once a session: on the first bodyweight lift still open (r69, V: on every one it read as a wall of text).
  const bwAt = d.editingId ? -1 : d.ex.findIndex((b, bi) => !!EX(b.exId).bw && !isFolded(d, b, bi));
  const letters = ssLetters(d.ex.map(b => b.plan));
  const when = d.past ? `for ${fmtDateLong(d.date)}` : d.startedAt ? `started ${startedWords(d.startedAt)}` : '';
  /* The sets done are the bar's to say once it shows (r69, V, 2026-11-03:
     "0 sets done" beside "0 of 19" said it twice), so the line keeps when the
     workout began and the minutes left; with no sets to count it says the
     count as before. The bar names itself to a screen reader, which read the
     count from this line until then. */
  const meta = sp.n
    ? html`${when ? when.charAt(0).toUpperCase() + when.slice(1) : ''}<span id="sessLeft">${left > 0 ? `${when ? ' · ' : ''}${estMin(left)} left` : ''}</span>`
    : html`<span id="doneCount">${doneN}</span> <span id="doneWord">${doneN === 1 ? 'set' : 'sets'}</span> done${when ? `, ${when}` : ''}<span id="sessLeft">${left > 0 ? `, ${estMin(left)} left` : ''}</span>`;
  return html`<div class="ph"><div class="u-minw0_f1n1-auto"><p class="kick">${d.editingId ? 'Editing a saved session' : d.past ? 'Past workout' : 'Session in progress'}</p><div class="hrow"><h2 class="u-owany_minw0">${d.dayName}</h2>${helpButton('log')}<button class="btn sm danger u-mlauto_fnone" data-act="discard">${d.editingId ? 'Cancel edit' : 'Discard'}</button></div><p class="meta">${meta}</p>${parkedHeld() ? html`<p class="small muted u-m4-0-0" id="parkedLine">Your workout in progress is set aside. It comes back when you save or discard this one.</p>` : ''}${
    sp.n
      ? html`<div class="sprog"><div class="band" role="progressbar" aria-label="Sets done" aria-valuemin="0" aria-valuemax=${sp.n} aria-valuenow=${sp.k} aria-valuetext=${`${sp.k} of ${sp.n} sets done`}><div class="fill prog" id="sessBar" style=${`width:${sp.pct}%;--pct:${sp.pct}`}></div></div><span id="sessOf" aria-hidden="true">${sp.k} of ${sp.n}</span></div>`
      : ''
  }
  <div class="row lh-row"><input type="date" data-bind="draftDate" .value=${fieldValue(d.date)} max=${today()} aria-label="Session date" data-tip="Change to log a past session">${d.past || d.editingId ? html`<input type="text" inputmode="numeric" class="minf" data-bind="draftMin" .value=${fieldValue(d.durMin ? String(d.durMin) : '')} placeholder="Minutes" aria-label="Minutes the workout took" data-tip="How long the workout took. Optional." enterkeyhint="done">` : nothing}${d.past ? '' : html`<button class="btn sm" data-act="chkOpen" aria-label=${chkSum(d) ? `Check-in: ${chkSum(d)}` : 'Check-in, optional'}>Check-in</button>`}${left > 0 ? html`<button class="btn sm" data-act="shortOpen">Short on time</button>` : ''}<button class="btn sm" data-act="bwOpen" data-date=${d.date} data-tip="Log or update your weigh-in without leaving the workout.">Bodyweight</button><button class="btn sm" data-act="wkAway" data-tip="Everything is saved as you go. Today shows the workout to resume.">Save and leave</button></div></div></div>
  ${howText('log', (state.settings.rirMode === 'off' ? 'RIR is switched off in Settings, so every working set counts as hard. ' : LOG_HELP_ON) + LOG_HELP + (d.past ? ' Quick entry: no rest timer, and a set counts as done once its reps are typed.' : state.settings.autoDone ? ' Auto-mark is on: sets tick themselves when you leave the reps field.' : ''))}
  ${
    d.free
      ? html`<label class="field u-mt8">Name<input type="text" data-bind="draftName" maxlength=${LIMITS.name} .value=${fieldValue(d.dayName || '')}></label><p class="small muted u-m4-0-0">Not tied to a routine day, so your cycle stays put.</p>`
      : ''
  }
  ${d.past ? '' : readyCard(d, chkLow(d))}${bwAskCard(d)}${
    !d.ex.length
      ? html`<div class="card"><p class="small u-m0">No exercises yet. Tap + Add exercise below${d.editingId ? '' : `, or Pick for me for a suggestion based on your last ${PICK_DAYS} days,`} and log as you go.</p></div>`
      : ''
  }${repeatKeyed(
    d.ex,
    b => b.bid,
    (b, bi) => blockPart(d, b, bi, letters, hintSeen, calIdx, bwAt)
  )}<div class="row"><button class="btn u-f1" data-act="pickSession">+ Add exercise</button>${d.editingId ? '' : html`<button class="btn" data-act="pickEx">Pick for me</button>`}</div>${d.editingId ? '' : cardioDraftCard(d)}<label class="field u-mt12">Notes<textarea data-bind="draftNotes" maxlength=${LIMITS.note} .defaultValue=${d.notes || ''} .value=${fieldValue(d.notes || '')}></textarea></label>${picStrip(null)}
  <div class="row fin-row u-mt12"><button class="btn danger" data-act="discard">${d.editingId ? 'Cancel edit' : 'Discard'}</button><button class="btn primary u-f1" data-act="finish" data-tip="Only sets marked done are saved; you are asked about any with reps but no checkmark.">${d.editingId ? 'Save changes' : 'Finish and save'}</button></div>`;
}

/* ---------- drawing it again ---------- */

/* What a full draw of the page puts back as the legacy page's fresh markup
   did (the host calls this before it draws the session): the effort strip
   closed and a fold waiting for its
   moment done now. A draw of the session in place (redraw, below) keeps
   them, as the legacy page's patches did. */
/** Puts back what a full draw of the page resets on the session screen. */
export function workoutFullDraw(): void {
  W.needAt = null;
  W.stripAt = null;
  W.foldWait = new WeakSet();
}

/** Draws the session screen again in place, where it is on screen: lit-html changes only what differs, so the field being typed in and its caret stay. */
export function drawNow(): void {
  const v = document.getElementById('view');
  const d = state.draft;
  if (!v || !d || !sessionShown()) return;
  if (drawing()) {
    queueMicrotask(drawNow);
    return;
  }
  drawScreen(v, viewWorkout(d));
}
