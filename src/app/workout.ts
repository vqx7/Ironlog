/* The session screen (r60, phase 5's last screen; ARCHITECTURE.md, Phase 5
   design): Today with a workout open, drawn by lit-html as src/21-pick-session.js
   drew it (viewLogger), with its taps and fields, auto-mark and the grey reps,
   the effort strip, the folds and the reorder after a first tick, the drag of
   an exercise, Finish and Discard, and the next sets adjusted after a ticked
   set (the decision is the engine's, nextSetsIn; what it does to the rows is
   here). Every change to the session in progress goes through `act`, which
   leaves the caches for a change to the session alone (nothing they hold is
   read from it). The screen is drawn again after each change and lit-html
   changes only what differs, where the legacy code patched the page by hand
   (afterSet, the checkmark's classes, the progress bar, the grey numbers, the
   PR mark, the plates line, the effort strip put in after a row); the
   numbers a row shows are read from the session each draw, so the screen
   cannot say what the log does not. What the screen opens stays with the
   sheet code in the legacy script, by the button's data-act, until the
   sheets move: the exercise menu, the picker, Short on time, the calibration
   set, the heaviest load, the load step, the note, Type or dictate sets, a
   lift's history and muscles, Pick for me, and the recap. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { repeat } from 'lit-html/directives/repeat.js';
import { act } from './act';
import { loadMode, CARDIO, CWHEN, ML, injLabel, CARDIOL, CWHENL } from './library';
import { ssLetters, fixSupersets, linkToggle } from './routines';
import { missedTag, repSpan, effLeastShort, LIGHT_RIR, fmtDate, estMin } from './format';
import { isMissed, isWork, DROP_START, WARM_RAMP, LIGHT_SHARE } from './formulas';
import { today, numIn, uid, isDate, EPS, pctOf } from './util';
import { cleanDraftCardio, LOAD_MAX, LOAD_MIN } from './normalize';
import { platesMode } from './gym';
import { loadWords, loadNote, emptyLoad } from './loads';
import { CHK_Q, chkWord } from './coach';
import { rirScale, effShow, effName } from './effort';
import { prefGet, BWASK_KEY, prefSet, log } from './storage';
import { EX, exBarKg, loadLabel, U, exName, lighterLoad, fromD, oddLoad } from './live';
import { state, ui, fx } from './store';
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
  newRow,
  editFp,
  markedNew
} from './session';
import type { DraftBlock, DraftSet } from './types';
import type { ExerciseLike } from './model';
import { distU, distShow, rirShow, setShort, bestLine, effTgt, loadHead, fmtDateLong } from './display';
import { coarse } from './env';
import { section, tipButton, fieldValue, helpButton, howText, drawing, drawScreen, fieldShown } from './view';
import type { Part } from './view';
import {
  W,
  blkIdx,
  blkIsOpen,
  blkOpen,
  blkOpenObj,
  blkRef,
  carried,
  draftSet,
  editFp0,
  greyIn,
  keepOpen,
  needHere,
  onRedraw,
  ordBack,
  redraw,
  FOLD_MS
} from './workstate';
import type { Draft, Tap } from './workstate';
import {
  acceptGrey,
  adjRows,
  adjSync,
  assessSet,
  autoFold,
  autoPending,
  blockProgress,
  calDueIdx,
  carryLoad,
  distIn,
  draftEntered,
  fillLoads,
  greyR,
  lastRFor,
  leftMin,
  loadIn,
  mixCheck,
  moveBlock,
  plateText,
  refreshBlock,
  remainMin,
  rirClose,
  rirShowStrip,
  rowBlank,
  rowPR,
  setDone,
  CAL_OFFER
} from './worksets';
import { finish, finishNow } from './workfinish';
import { LIMITS, EFFORT_TOP } from './records';
import { PICK_DAYS } from './analytics';

/** What the New machine tag on an exercise says, tapped (r61). */
const NEW_TIP =
  'A new machine or gym: its targets, trend, stalls, PRs and bests start over from this session. Earlier sessions stay in History. Take it off in the ⋯ menu.';
/** The gap above the cardio buttons when there are entries, in pixels. */
const CARDIO_ADD_GAP_PX = 10;
/** After an auto-mark, a tap on that set's checkmark within this many milliseconds confirms it rather than undoing it (r28). */
const AUTO_CONFIRM_MS = 15000;
/** An exercise a tick moved up goes back when its sets are all unticked within this many milliseconds (r55). */
const REORDER_BACK_MS = 30000;
/** A touch this many milliseconds ago is where the lifter went (an iPhone's buttons never take focus). */
const TOUCH_MS = 700;
/** With the effort strip about to open, an auto-mark waits this long for it before it marks the set. */
const STRIP_WAIT_MS = 2000;

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
   you typed it. What it means is a property of the exercise, shown on the
   exercise and above the load column:
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
   sets. On the exercise, always visible: what the load number is, and reps
   per side when that applies. Tap or hold for the longer version. */
// The longer words for a load mode; a mode not listed falls to the equipment's words.
const LOAD_TIPS: Readonly<Record<string, string>> = {
  each: 'Enter the weight of one dumbbell. Weight lifted counts both.',
  side: 'Enter the plates on one side. Weight lifted counts both sides.',
  stack: 'Enter the pin setting. It is not comparable across machines.',
  bw: 'Enter only what you add (belt, vest, dumbbell); 0 for bodyweight. Your logged bodyweight is added for estimates.'
};

function lmChips(ex: ExerciseLike): Part {
  if (ex.timed && !ex.bw && loadMode(ex) !== 'each')
    return ex.perSide ? html`<p class="lmrow"><span class="lm">seconds per side</span></p>` : '';
  const m = loadMode(ex);
  if (ex.assist)
    return html`<p class="lmrow"><span class="lm" data-tip="Enter the help the machine gives, as on its pin. Less help is progress; your logged bodyweight minus the help is what counts.">machine help</span></p>`;
  const long =
    LOAD_TIPS[m] ||
    (ex.equip === 'barbell'
      ? 'Enter everything on the bar, the bar included.'
      : ex.equip === 'dumbbell'
        ? 'Enter the weight of the one dumbbell you hold.'
        : 'Enter the total load.');
  return html`<p class="lmrow"><span class="lm" data-tip=${long}>${loadWords(ex)}</span>${
    ex.perSide
      ? html`<span class="lm" data-tip=${ex.timed ? 'Seconds for one side; do the same on the other.' : 'Reps for one side; do the same on the other. One set still counts as one set.'}>${ex.timed ? 'seconds' : 'reps'} per side</span>`
      : ''
  }</p>`;
}

/* Which load to show: the set just edited, else the next set not yet done,
   else the heaviest set in the block. Grey loads count: the plates are for
   the load the row is going to be. Logged per side: the helper works from
   the total that makes. */
function plateLine(b: DraftBlock, si?: number | null): string {
  let at = si != null && b.sets[si] ? si : -1;
  if (at < 0) at = b.sets.findIndex((x, i) => !x.done && !x.warm && +(effW(b, i) ?? 0) > 0);
  const kg =
    at >= 0 ? +(effW(b, at) ?? 0) || 0 : Math.max(0, ...b.sets.map((x, i) => (x.warm ? 0 : +(effW(b, i) ?? 0) || 0)));
  const ex = EX(b.exId);
  const pm = platesMode(ex);
  if (loadMode(ex) === 'side')
    return plateText(kg * 2 + (pm === 'bar' ? exBarKg(ex) : 0), pm, ex).replace(
      /^Per side at [^:]+:/,
      'Plates a side:'
    );
  return plateText(kg, pm, ex);
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

function stripIs(bi: number, si: number): boolean {
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

/* The three taps at the start of a session; how they line up with the
   sessions is Stats' Readiness and performance (stats.ts). What it offers
   (r30) sits below it with the two changes that answer it: two or more low
   answers, a lighter session first; one, a note to keep a rep more in
   reserve. Already made lighter: said instead of offered again. */
function checkinCard(d: Draft): TemplateResult {
  const c = d.chk || {};
  const sum = CHK_Q.filter(([k]) => c[k])
    .map(([k, l, n]) => `${l.toLowerCase()} ${chkWord(n[(c[k] || 1) - 1])}`)
    .join(', ');
  const low = CHK_Q.filter(([k]) => c[k] === 1).length;
  return html`${section({
    sk: 'logger:checkin',
    title: 'Check-in',
    sub: sum || 'optional',
    body: html`${CHK_Q.map(
      ([k, l, names]) =>
        html`<div class="ci-row"><span class="small">${l}</span><div class="seg" role="group" aria-label=${l}>${names.map(
          (n, i) =>
            html`<button class=${'chip ' + (c[k] === i + 1 ? 'on' : '')} data-act="chk" data-k=${k} data-v=${i + 1} aria-pressed=${String(c[k] === i + 1)}>${n}</button>`
        )}</div></div>`
    )}
  `
  })}${readyCard(d, low)}`;
}

/** What the check-in offers under it, or nothing (above). */
export function readyCard(d: Draft, low: number): Part {
  if (!low || d.light || d.deload || d.editingId || d.past) return '';
  const open = d.ex.some(b => !b.light && !b.sets.some(x => !x.warm && !rowBlank(b, x)));
  const left = remainMin(d);
  if (low >= 2 && !open && d.ex.some(b => b.light))
    return html`<p class="callout" style="margin:8px 0 0" id="readyCard">Made lighter: the exercises not started are half the sets at about ${pctOf(LIGHT_SHARE)}% loads.</p>`;
  if (low < 2)
    return html`<p class="callout" style="margin:8px 0 0" id="readyCard">One low answer: keep the loads and leave a rep more in reserve than planned if it feels heavy.</p>`;
  return html`<div class="callout yellow" style="margin:8px 0 0" id="readyCard"><p style="margin:0">Low readiness today. ${tipButton(`A lighter or shorter session fits a low day better than pushing. Make it lighter changes only the exercises not started: half the sets, about ${pctOf(LIGHT_SHARE)}% loads, nothing to beat.`)}</p><div class="row" style="margin-top:8px">${open ? html`<button class="btn sm" data-act="makeLight">Make it lighter</button>` : ''}${left > 0 ? html`<button class="btn sm" data-act="shortOpen">Short on time</button>` : ''}</div></div>`;
}

/* Bodyweight, asked once in the first session with a bodyweight lift when
   none is logged (r32, from the third review: pull-ups and leg raises added
   nothing to weight lifted, and had no estimate, with no weigh-in). Saved
   like a weigh-in on Today; Not now is kept per device. */
function bwAskCard(d: Draft): Part {
  if (d.editingId || d.past || state.bodyweights.length || !d.ex.some(b => EX(b.exId).bw)) return '';
  if (prefGet(BWASK_KEY)) return '';
  return html`<div class="card" id="bwAsk"><p class="small" style="margin:0 0 8px"><b>Your bodyweight</b> counts in bodyweight lifts, for weight lifted and estimates. ${tipButton('Logged as a weigh-in for today. Add more on Today, under Body.', 'About bodyweight')}</p>
  <div class="row"><label class="field" style="flex:1;margin:0"><span class="vh">Bodyweight (${U()})</span><input type="text" inputmode="decimal" id="bwVal" placeholder=${`Weight (${U()})`} aria-label=${`Bodyweight (${U()})`}></label><button class="btn sm primary" data-act="addBW">Save</button><button class="btn sm" data-act="bwAskNo">Not now</button></div></div>`;
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
    <label class="field" style="margin-top:6px">Distance (${distU()})<input type="text" inputmode="decimal" data-cf="dist" data-c=${ci} .value=${fieldValue(c.dist ? String(distShow(c.dist)) : '')} placeholder="optional"></label>
    <div class="row" style="margin-top:6px"><select data-cf="when" data-c=${ci} style="flex:1" aria-label="When">${CWHEN.map(([k, l]) => html`<option value=${k} .selected=${c.when === k}>${l}</option>`)}</select><button class="btn sm danger" data-act="cDraftDel" data-c=${ci}>Remove</button></div>`
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
function bgrip(bi: number, name: string): TemplateResult {
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
  return html`<div class=${`sg${nr ? ' norir' : ''} ${s.done ? 'done' : ''}${pr ? ' pr' : ''}`} data-pr=${pr || nothing}><button class=${'n wbtn' + (s.drop ? ' drop' : s.warm ? ' warm' : '')} aria-label=${`Set ${si + 1} type: ${s.warm ? 'warm-up' : s.drop ? 'drop set' : 'working set'}. Tap to change`} data-act="sWarm" data-b=${bi} data-s=${si}>${s.drop ? '↓' : s.warm ? 'W' : wn}</button><span class="ls" aria-label=${lt ? 'Last time ' + lt : 'No set last time'}>${lt ? lastText(lt) : '–'}</span>
        <input type="text" inputmode="decimal" enterkeyhint="next" aria-label=${`${ex.name}, set ${si + 1} load`} data-f="w" data-b=${bi} data-s=${si} class=${needHere(bi, si) ? 'need' : nothing} .value=${fieldValue(loadIn(ex, s.w))} placeholder=${gw != null ? loadIn(ex, gw) : emptyLoad(ex)}>
        <input type="text" inputmode="numeric" enterkeyhint="next" aria-label=${`${ex.name}, set ${si + 1} ${ex.timed ? 'seconds' : 'reps'}${ex.perSide ? ' per side' : ''}`} data-f="r" data-b=${bi} data-s=${si} .value=${fieldValue(s.r == null ? '' : String(s.r))} placeholder=${ph}>
        ${nr ? '' : rirButton(s.rir, bi, si, p.rir)}
        <button class=${'cbtn ' + (s.done ? 'on' : '')} aria-label=${`Set ${si + 1} ${s.done && isMissed(s) ? 'missed' : 'done'}`} aria-pressed=${s.done ? 'true' : 'false'} data-act="sDone" data-b=${bi} data-s=${si}>✓</button></div>${stripIs(bi, si) ? rirStrip(bi, si, s.rir == null ? '' : String(s.rir)) : nothing}`;
}

function progressLine(b: DraftBlock, bi: number): Part {
  const p = blockProgress(b);
  return p ? html`<span class=${'tp' + (p.beat ? ' beat' : '')} id=${`tp-${bi}`}>${p.text}</span>` : '';
}

function blockPart(
  d: Draft,
  b: DraftBlock,
  bi: number,
  letters: Readonly<Record<string, string>>,
  hintSeen: Set<string>,
  calIdx: number
): TemplateResult {
  const ex = EX(b.exId);
  const p = b.plan;
  const ss = p.ss ? letters[p.ss] : null;
  const nr = !rirShow(ex);
  const dupB = lastDup(d, bi);
  if (!d.editingId && blockDone(b) && !blkIsOpen(bi, b) && !W.foldWait.has(b)) {
    const ws = b.sets.filter(x => !x.warm);
    const prs = b.sets.filter((x, si) => !x.warm && rowPR(b, si, d.date)).length;
    return html`<section class="block folded" id=${`blk-${bi}`} data-bi=${bi}>${bgrip(bi, ex.name)}<button class="bfold" data-act="bOpen" data-b=${bi} aria-expanded="false" aria-label=${`${ex.name}, done. Open to edit`}><span class="bf-ck" aria-hidden="true">✓</span><span class="bf-t"><b>${ex.name}</b><span>${ws.map(x => setShort(ex, x.w, x.r) + missedTag(x)).join(', ')}</span></span>${prs ? html`<span class="bf-pr">PR</span>` : ''}<span class="chev" aria-hidden="true"></span></button></section>`;
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
  return html`<section class=${'block' + (ss ? ' ss' : '')} id=${`blk-${bi}`} data-bi=${bi}><div class="bh">${bgrip(bi, ex.name)}<div class="bh-m"><h3 aria-labelledby=${ex.note ? `bhn-${bi}` : nothing}><span id=${`bhn-${bi}`}>${ex.name}</span>${ex.note ? html` ${tipButton(ex.note, 'About ' + ex.name)}` : ''}</h3><p class="small muted">${ML[ex.primary]} · ${work || p.sets}×${repSpan(p.repMin, p.repMax, '-')}${ex.timed ? 's' : ''}${ex.perSide ? '/side' : ''}${nr ? '' : ` @${b.inj || ((d.light || d.deload || b.light) && b.last) ? effLeastShort(rirScale(), LIGHT_RIR) : effTgt(p.rir)}`} · ${p.rest}s${ss ? html` · <span class="tag blue">Superset ${ss}</span>` : ''}${b.inj ? html` · <span class="tag red">Injury: ${injLabel(b.inj)}</span>` : ''}${markedNew(d, b.exId) ? html` · <span class="tag" data-tip=${NEW_TIP}>New machine</span>` : ''}</p>${lmChips(ex)}</div>
      <div class="bh-acts">${!d.editingId && blockDone(b) ? html`<button class="ib" aria-label=${`Fold ${ex.name}`} data-act="bFold" data-b=${bi}>▴</button>` : ''}<button class="ib" aria-label="Exercise options" data-act="bMenu" data-b=${bi}>⋯</button></div></div>
      ${
        b.target
          ? html`<p class="hint"><b>Today: ${targetText(b)}</b>${why ? html` ${tipButton(why, 'Why this target')}` : ''}<span class="tp muted" style="display:block">${lastHead(b, dupB)}</span>${bl ? html`<span class="tp muted" style="display:block">${bl}</span>` : ''}${b.easier ? html`<span class="tp ez">${b.easier}</span>` : ''}${progressLine(b, bi)}</p>`
          : html`<p class="hint">${hintOnce(b.hint || '', hintSeen)}</p>`
      }${bi === calIdx ? html`<p class="small caldue">Due for an RIR check: take one set here to failure. <button class="linkbtn tall" data-act="bCal" data-b=${bi}>Calibration set</button> <button class="linkbtn tall" data-act="calSnooze">Not now</button></p>` : ''}
      ${ss && partner ? html`<p class="small muted" style="margin:2px 0 0">Superset with ${partner}; rest after the pair.</p>` : ''}
      ${b.lastNote && !b.note ? html`<p class="small lnote">Your note, ${fmtDate(b.lastNote.date)}: ${b.lastNote.text} <button class="linkbtn" data-act="noteReuse" data-b=${bi}>Use again</button></p>` : ''}
      ${b.note ? html`<p class="small bnote" id=${`bn-${bi}`}>${b.note}</p>` : html`<p class="small bnote" id=${`bn-${bi}`} hidden></p>`}
      <div class=${'sg head' + (nr ? ' norir' : '')}><span data-tip="Tap a set's number to mark it a warm-up or a drop set.">#</span><span class="lsh">Last</span><span class="lh" data-tip=${'Load: ' + loadWords(ex)}>${loadHead(ex)}</span><span>${ex.timed ? (ex.perSide ? 'Sec/side' : 'Sec') : ex.perSide ? 'Reps/side' : 'Reps'}</span>${nr ? '' : html`<span>${effName()}</span>`}<span>Done</span></div>${repeatKeyed(
        b.sets,
        x => x.rid,
        (_, si) => setRow(d, b, bi, si, ex, nr, dupB)
      )}${adjLine(b, bi)}${
        platesMode(ex) !== 'none'
          ? html`<p class="small muted" id=${`pl-${bi}`} style="margin:6px 0 0">${plateLine(b, W.platesAt && blkIdx(W.platesAt.b) === bi ? W.platesAt.s : null)}</p>`
          : ''
      }<div class="row" style="margin-top:8px">${canFill ? html`<button class="btn sm" data-act="fillLast" data-b=${bi} aria-label="Copy last session's reps" data-tip="Fill empty rows with last session's reps.">Copy last</button>` : ''}<button class="btn sm" data-act="sAdd" data-b=${bi} aria-label="Add a set" data-tip="Add a working set at the last load.">+ Set</button><button class="btn sm" data-act="sDel" data-b=${bi} aria-label="Remove a set" data-tip="Removes the last set not yet done." ?disabled=${!b.sets.length}>− Set</button>${
        !ex.timed && b.sets.some(x => x.done && !x.warm && !x.drop)
          ? html`<button class="btn sm" data-act="dropAdd" data-b=${bi} aria-label="Add a drop set" data-tip=${`About ${pctOf(DROP_START)}% of the last working load, in your steps. Counts as half a set and never sets a target.`}>+ Drop</button>`
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
  'W marks a warm-up (kept, never analysed); tap it again for D, a drop set (counts as work and volume, never as a PR or target). To add a new warm-up or drop set row, use the ⋯ menu on the exercise. Drag an exercise by its ⠿ to change the order. In a superset the rest timer starts after the last exercise of the pair. Timed holds log seconds in the Sec column. The date can be changed to log a past session.';

/** The session screen: Today with a workout open, drawn as a template of the session in progress and ui. */
export function viewWorkout(d: Draft): TemplateResult {
  const hintSeen = new Set<string>();
  // Warm-ups are not counted, the same as the progress bar under it.
  const doneN = d.ex.reduce((a, b) => a + b.sets.filter(s => s.done && !s.warm).length, 0);
  const left = leftMin(d);
  const sp = sessProgress(d);
  const calIdx = d.editingId ? -1 : calDueIdx(d);
  const letters = ssLetters(d.ex.map(b => b.plan));
  return html`<div class="ph"><div style="min-width:0;flex:1 1 auto"><p class="kick">${d.editingId ? 'Editing a saved session' : d.past ? 'Past workout' : 'Session in progress'}</p><div class="hrow"><h2 style="overflow-wrap:anywhere;min-width:0">${d.dayName}</h2>${helpButton('log')}<button class="btn sm danger" style="margin-left:auto;flex:none" data-act="discard">${d.editingId ? 'Cancel edit' : 'Discard'}</button></div><p class="meta"><span id="doneCount">${doneN}</span> <span id="doneWord">${doneN === 1 ? 'set' : 'sets'}</span> done${d.past ? `, for ${fmtDateLong(d.date)}` : ''}${d.startedAt && !d.past ? `, started ${new Date(d.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}<span id="sessLeft">${left > 0 ? `, ${estMin(left)} left` : ''}</span></p>${
    sp.n
      ? html`<div class="sprog" aria-hidden="true"><div class="band"><div class="fill prog" id="sessBar" style=${`width:${sp.pct}%`}></div></div><span id="sessOf">${sp.k} of ${sp.n}</span></div>`
      : ''
  }
  <div class="row lh-row"><input type="date" data-bind="draftDate" .value=${fieldValue(d.date)} max=${today()} aria-label="Session date" data-tip="Change to log a past session">${left > 0 ? html`<button class="btn sm" data-act="shortOpen">Short on time</button>` : ''}</div></div></div>
  ${howText('log', (state.settings.rirMode === 'off' ? 'RIR is switched off in Settings, so every working set counts as hard. ' : LOG_HELP_ON) + LOG_HELP + (d.past ? ' Quick entry: no rest timer, and a set counts as done once its reps are typed.' : state.settings.autoDone ? ' Auto-mark is on: sets tick themselves when you leave the reps field.' : ''))}
  ${
    d.free
      ? html`<label class="field" style="margin-top:8px">Name<input type="text" data-bind="draftName" maxlength="40" .value=${fieldValue(d.dayName || '')}></label><p class="small muted" style="margin:4px 0 0">Not tied to a routine day, so your cycle stays put.</p>`
      : ''
  }
  ${d.past ? '' : checkinCard(d)}${bwAskCard(d)}${
    !d.ex.length
      ? html`<div class="card"><p class="small" style="margin:0">No exercises yet. Tap + Add exercise below${d.editingId ? '' : `, or Pick for me for a suggestion based on your last ${PICK_DAYS} days,`} and log as you go.</p></div>`
      : ''
  }${repeatKeyed(
    d.ex,
    b => b.bid,
    (b, bi) => blockPart(d, b, bi, letters, hintSeen, calIdx)
  )}<div class="row"><button class="btn" style="flex:1" data-act="pickSession">+ Add exercise</button>${d.editingId ? '' : html`<button class="btn" data-act="pickEx">Pick for me</button>`}</div>${d.editingId ? '' : cardioDraftCard(d)}<label class="field" style="margin-top:12px">Notes<textarea data-bind="draftNotes" .defaultValue=${d.notes || ''} .value=${fieldValue(d.notes || '')}></textarea></label>
  <div class="row fin-row" style="margin-top:12px"><button class="btn danger" data-act="discard">${d.editingId ? 'Cancel edit' : 'Discard'}</button><button class="btn primary" style="flex:1" data-act="finish" data-tip="Only sets marked done are saved; you are asked about any with reps but no checkmark.">${d.editingId ? 'Save changes' : 'Finish and save'}</button></div>`;
}

/* ---------- drawing it again ---------- */

/* What a full draw of the page puts back as the legacy page's fresh markup
   did (the host calls this before it draws the session): the effort strip
   closed, the plates line on the next set again, and a fold waiting for its
   moment done now. A draw of the session in place (redraw, below) keeps
   them, as the legacy page's patches did. */
/** Puts back what a full draw of the page resets on the session screen. */
export function workoutFullDraw(): void {
  W.needAt = null;
  W.stripAt = null;
  W.platesAt = null;
  W.foldWait = new WeakSet();
}

// Draws the session screen again in place, where it is on screen: lit-html changes only what differs, so the field being typed in and its caret stay.
function drawNow(): void {
  const v = document.getElementById('view');
  if (!v || ui.tab !== 'today' || !state.draft) return;
  if (drawing()) {
    queueMicrotask(drawNow);
    return;
  }
  drawScreen(v, viewWorkout(state.draft));
}

// The block a tap names by its data-b, or null.
const tapBlock = (t: Tap): DraftBlock | null => (state.draft && state.draft.ex[Number(t.dataset.b)]) || null;

/* − Set (r25 guardrail). It takes the last row that holds nothing of the
   lifter's (no tick, no reps, no RIR, and a load that is only the app's
   suggestion), quietly. When every row holds something, it no longer
   removes the last one on a single tap: it asks first, naming the set, and
   Undo still follows; the last row not ticked goes first, a logged set only
   after. Found again when confirmed: a cloud refresh may have replaced the
   session while the question was open. */
function setRemove(t: Tap): void {
  const d = state.draft;
  const bi = Number(t.dataset.b);
  const b = d && d.ex[bi];
  if (!d || !b || !b.sets.length) return;
  let i = -1;
  for (let k = b.sets.length - 1; k >= 0; k--)
    if (rowBlank(b, b.sets[k])) {
      i = k;
      break;
    }
  if (i >= 0) {
    const at = i;
    act(
      () => {
        b.sets.splice(at, 1);
        adjSync(b);
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    return;
  }
  for (let k = b.sets.length - 1; k >= 0; k--)
    if (!b.sets[k].done) {
      i = k;
      break;
    }
  if (i < 0) i = b.sets.length - 1;
  const x = b.sets[i],
    ex = EX(b.exId),
    did = d.id,
    exId = b.exId,
    n = b.sets.slice(0, i + 1).filter(y => !y.warm && !y.drop).length;
  const what = `${x.warm ? 'Warm-up' : x.drop ? 'Drop set' : 'Set ' + n}`;
  const val =
    +(x.r ?? 0) > 0
      ? setShort(ex, x.w == null ? 0 : x.w, x.r)
      : x.w != null
        ? loadLabel(ex, x.w) + (ex.bw ? '' : ' ' + U())
        : '';
  const at = i;
  fx.confirm(
    `Remove ${what.toLowerCase()}?`,
    `${ex.name}${val ? `: ${val}` : ''}, ${x.done ? 'logged' : 'typed, not ticked'}. Undo is offered right after.`,
    'Remove set',
    () => {
      const dd = state.draft;
      const bb = dd && dd.id === did ? dd.ex[bi] : null;
      const xx = bb && bb.exId === exId ? bb.sets[at] : null;
      if (!bb || !xx || xx.done !== x.done || xx.r !== x.r || xx.w !== x.w) {
        fx.toast('That set changed. Nothing was removed.');
        fx.rerenderKeepScroll();
        return;
      }
      act(
        () => {
          bb.sets.splice(at, 1);
          adjSync(bb);
        },
        {
          inProgress: true,
          undo: () => {
            const d3 = state.draft;
            if (!d3 || d3.id !== did || !d3.ex.includes(bb)) return false;
            bb.sets.splice(Math.min(at, bb.sets.length), 0, xx);
            adjSync(bb);
            return true;
          }
        }
      );
      fx.rerenderKeepScroll();
      fx.toast(xx.done ? 'Logged set removed' : 'Set removed', true);
    },
    true
  );
}

/* Removing an exercise (r25 guardrail): one with logged or typed sets asks
   first, naming how many; an untouched one goes with an Undo as before. Back
   after the exercise it followed, which an automatic reorder may have moved
   (r45 review). */
function blockRemove(t: Tap): void {
  const d = state.draft;
  const bi = Number(t.dataset.b);
  const blk = d && d.ex[bi];
  if (!d || !blk) return;
  const did = d.id;
  const go = (): void => {
    const dd = state.draft;
    if (!dd || dd.id !== did || dd.ex[bi] !== blk) {
      if (ui.modal) fx.closeModal();
      fx.toast('That exercise changed. Nothing was removed.');
      fx.rerenderKeepScroll();
      return;
    }
    const prevBlk = bi > 0 ? dd.ex[bi - 1] : null;
    act(() => keepOpen(() => dd.ex.splice(bi, 1)), {
      inProgress: true,
      undo: () => {
        const d3 = state.draft;
        if (!d3 || d3.id !== did) return false;
        const k = prevBlk ? d3.ex.indexOf(prevBlk) : -1;
        d3.ex.splice(prevBlk == null ? 0 : k >= 0 ? k + 1 : Math.min(bi, d3.ex.length), 0, blk);
        fixSupersets(d3.ex.map(x => x.plan));
        return true;
      }
    });
    fx.rerenderKeepScroll();
    fx.toast('Exercise removed', true);
  };
  const logged = blk.sets.filter(x => x.done).length,
    typed = blk.sets.filter(x => !x.done && (+(x.r ?? 0) > 0 || x.rir != null)).length;
  if (logged || typed) {
    if (ui.modal) fx.closeModal();
    fx.confirm(
      `Remove ${EX(blk.exId).name}?`,
      `${logged ? `${logged} logged set${logged === 1 ? '' : 's'}` : ''}${logged && typed ? ' and ' : ''}${typed ? `${typed} typed set${typed === 1 ? '' : 's'}` : ''} go with it. Undo is offered right after.`,
      'Remove exercise',
      go,
      true
    );
    return;
  }
  go();
}

/* A filled cardio entry goes with an Undo, like a set with reps; an empty one goes quietly. */
function cardioRemove(t: Tap): void {
  const d = state.draft;
  const list = d && d.cardio;
  const i = Number(t.dataset.c);
  const c = list && list[i];
  if (!d || !list || !c) return;
  if ((c.min || 0) > 0 || (c.hr || 0) > 0 || (c.note || '').trim()) {
    const did = d.id;
    fx.confirm(
      `Remove ${(CARDIOL[c.kind || ''] || 'entry').toLowerCase()}?`,
      `${c.min ? c.min + ' min' : 'An entry with your notes'}. Undo is offered right after.`,
      'Remove',
      () => {
        const dd = state.draft;
        const l2 = dd && dd.id === did ? dd.cardio : null;
        const j = l2 ? l2.indexOf(c) : -1;
        if (!l2 || j < 0) {
          fx.toast('That entry changed. Nothing was removed.');
          fx.rerenderKeepScroll();
          return;
        }
        act(
          () => {
            l2.splice(j, 1);
          },
          {
            inProgress: true,
            undo: () => {
              const d3 = state.draft;
              if (!d3 || d3.id !== did) return false;
              const l3 = d3.cardio || (d3.cardio = []);
              l3.splice(Math.min(j, l3.length), 0, c);
              return true;
            }
          }
        );
        fx.rerenderKeepScroll();
        fx.toast(`${CARDIOL[c.kind || ''] || 'Entry'} removed`, true);
      },
      true
    );
    return;
  }
  act(
    () => {
      list.splice(i, 1);
    },
    { inProgress: true }
  );
  fx.rerenderKeepScroll();
}

/** The session screen's taps, by data-act: each change to the session in progress through act. */
export const WORKOUT_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  /* With auto-done on, leaving the reps field marks the set done, and on a
     phone that blur happens a moment before the tap on the checkmark lands.
     Without this guard the tap would immediately undo the auto-mark. Since
     r28 (auto-mark on for new installs) the first tap on that set's
     checkmark confirms it for AUTO_CONFIRM_MS, until another set is touched: typing
     reps, picking RIR and then tapping the checkmark is the natural order,
     and it used to untick the set. A second tap undoes it. Tapping done on
     an empty reps field logs the grey number in it (see greyR), like the
     paper log you copy from; warm-ups have none, so those still ask; a typed
     0 is a missed set (r55, V), ticked as typed. Unticked (r55, the audit):
     numbers that are what the row shows in grey go back to grey, so a tap by
     mistake leaves nothing typed for Finish to offer to save, and an
     exercise the tick moved up goes back if it has no set left ticked,
     within REORDER_BACK_MS. */
  sDone(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const s = draftSet(t);
    const d = state.draft;
    if (!s || !d) return;
    if (W.lastAuto && (blkIdx(W.lastAuto.b) !== bi || W.lastAuto.s !== si)) W.lastAuto = null;
    if (W.lastAuto && Date.now() - W.lastAuto.t < AUTO_CONFIRM_MS && s.done) {
      W.lastAuto = null;
      return;
    }
    const b = d.ex[bi];
    const noReps = !s.done && !(+(s.r ?? 0) > 0) && !isMissed(s);
    const lr = noReps && b ? greyR(b, si) : null;
    if (noReps && (lr == null || !(lr > 0))) {
      fx.toast('Enter reps first');
      return;
    }
    const was = !!s.done;
    /* The whole tap is one change, saved once (act runs the changes made
       inside it as its own): the grey reps taken, the tick, and on an untick
       the numbers put back to grey and the exercise moved back. From the
       independent review of r60: written in two saves, a second tab's merge
       of the first could lose the second, the tick. */
    act(
      () => {
        if (lr != null) s.r = Math.round(lr);
        setDone(bi, si, !was);
        if (!was || !b) return;
        if (s.r != null && +s.r === greyR(b, si)) s.r = null;
        const gw = greyW(b, si);
        if (!fillLoads() && s.w != null && gw != null && Math.abs(s.w - gw) < EPS) s.w = null;
        const o = ordBack.get(b);
        if (o && !b.sets.some(x => x.done) && Date.now() - o.t < REORDER_BACK_MS) {
          ordBack.delete(b);
          moveBlock(bi, Math.min(o.i, d.ex.length - 1));
        }
      },
      { inProgress: true }
    );
    if (was) fx.rerenderKeepScroll();
  },
  // Numbers, placeholders and the progress bar all depend on which rows are working sets, so the block is drawn again.
  sWarm(t) {
    const s = draftSet(t);
    const b = tapBlock(t);
    if (!s || !b) return;
    act(
      () => {
        if (!s.warm && !s.drop) s.warm = true;
        else if (s.warm) {
          s.warm = false;
          s.drop = true;
        } else s.drop = false;
        adjSync(b);
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
  },
  fillLast(t) {
    const b = tapBlock(t);
    if (!b) return;
    const todo = b.sets
      .map((s, i) => [s, lastRFor(b, i)] as const)
      .filter(([s, lr]) => !s.done && !s.warm && !s.drop && s.r == null && lr != null);
    if (!todo.length) {
      fx.toast('Nothing to fill');
      return;
    }
    act(
      () => {
        for (const [s, lr] of todo) s.r = lr;
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    fx.toast(`${todo.length} set${todo.length === 1 ? '' : 's'} filled with last time's reps`);
  },
  /* The new working set copies the last working set's load, not a drop set's
     (DROP_START) or a warm-up's. Grey by default: the new row shows the load above
     it, or what the last set ticked asks for, as a planned row under it would
     have (r55, V: after 300 x 1, + Set copied 300). Filled in, it takes that load. */
  sAdd(t) {
    const bi = Number(t.dataset.b);
    const b = tapBlock(t);
    if (!b) return;
    act(
      () => {
        const ld = b.sets.reduce((k, x, i) => (x.done && isWork(x) && !x.drop ? i : k), -1);
        const row = newRow();
        b.sets.push(row);
        if (ld >= 0) assessSet(bi, ld);
        if (fillLoads()) row.w = effW(b, b.sets.length - 1);
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
  },
  sDel: setRemove,
  /* Warm-ups go in at the top, already flagged, so they stay out of every
     analytic, and are seeded from the working load; each new one goes after
     the ones already there, so they climb to the working load (r27). */
  wAdd(t) {
    const b = tapBlock(t);
    if (!b) return;
    let base = 0;
    for (let i = 0; i < b.sets.length; i++) {
      const s = b.sets[i];
      if (s.warm || s.drop) continue;
      const w = +(effW(b, i) ?? 0) || 0;
      if (w > 0) {
        base = w;
        break;
      }
    }
    if (!base) base = Math.max(0, ...b.sets.map((_, i) => +(effW(b, i) ?? 0) || 0));
    const n = b.sets.filter(s => s.warm).length;
    const frac = WARM_RAMP[Math.min(n, WARM_RAMP.length - 1)];
    let at = 0;
    while (at < b.sets.length && b.sets[at].warm) at++;
    const w = base > 0 ? lighterLoad(EX(b.exId), b.plan, base, base * frac) : null;
    act(
      () => {
        b.sets.splice(at, 0, newRow({ w, warm: true }));
        adjSync(b);
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    fx.toast('Warm-up set added');
  },
  // The load the last working set was, or will be (a grey load counts); a missed set's is passed over (r55).
  dropAdd(t) {
    const b = tapBlock(t);
    if (!b) return;
    let base = 0;
    for (let i = b.sets.length - 1; i >= 0; i--) {
      const s = b.sets[i];
      if (s.warm || s.drop || isMissed(s)) continue;
      const w = +(effW(b, i) ?? 0) || 0;
      if (w > 0) {
        base = w;
        break;
      }
    }
    const w = base > 0 ? lighterLoad(EX(b.exId), b.plan, base, base * DROP_START) : null;
    act(
      () => {
        b.sets.push(newRow({ w, drop: true }));
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    fx.toast('Drop set added');
  },
  // Keep: no adjustment for this exercise for the rest of the session.
  adjKeep(t) {
    const b = tapBlock(t);
    if (!b || !b.adj) return;
    const prev = b.adj;
    act(
      () => {
        delete b.adj;
        b.adjOff = true;
        adjRows(b, prev, null);
      },
      { inProgress: true }
    );
    redraw();
  },
  rirOpen(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    if (stripIs(bi, si)) {
      rirClose();
      return;
    }
    rirShowStrip(bi, si);
    const f =
      document.querySelector<HTMLElement>('.rirstrip button.on') ||
      document.querySelector<HTMLElement>('.rirstrip button');
    if (f && !coarse())
      try {
        f.focus({ preventScroll: true });
      } catch (e) {
        // Focus is best effort; the strip is open either way.
      }
  },
  // The fold waits for the effort of the last set, then goes.
  rirPick(t) {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const d = state.draft;
    const b = d && d.ex[bi];
    const s = b && b.sets[si];
    if (!d || !b || !s) return;
    const n = numIn(t.dataset.v || '');
    act(
      () => {
        s.rir = n == null ? null : Math.min(Math.max(n, 0), EFFORT_TOP);
        if (s.done) assessSet(bi, si);
      },
      { inProgress: true, soon: true }
    );
    rirClose();
    redraw();
    const btn = document.querySelector<HTMLElement>(`.rirb[data-b="${bi}"][data-s="${si}"]`);
    if (btn)
      try {
        btn.focus({ preventScroll: true });
      } catch (e) {
        // Focus is best effort; the effort is saved either way.
      }
    if (!d.editingId && blockDone(b)) {
      if (W.foldT) clearTimeout(W.foldT);
      const rf = blkRef(bi);
      W.foldT = setTimeout(() => autoFold(rf), FOLD_MS.effort);
    }
  },
  bOpen(t) {
    const bi = Number(t.dataset.b);
    const b = tapBlock(t);
    if (!b) return;
    blkOpen(bi, b);
    fx.rerenderKeepScroll();
    const el = document.getElementById('blk-' + bi);
    if (el)
      try {
        el.scrollIntoView({ block: 'nearest' });
      } catch (e) {
        // Scrolling is best effort; the exercise is open either way.
      }
  },
  // Every place this exercise was opened at, so a move and a fold leave nothing behind.
  bFold(t) {
    const b = tapBlock(t);
    if (!b) return;
    const pre = ((state.draft && state.draft.id) || '') + ':';
    for (const k of [...ui.blkOpen])
      if (typeof k === 'string' && k.startsWith(pre) && k.endsWith(':' + b.exId)) ui.blkOpen.delete(k);
    blkOpenObj.delete(b);
    fx.rerenderKeepScroll();
  },
  bUp(t) {
    if (moveBlock(Number(t.dataset.b), Number(t.dataset.b) - 1)) fx.rerenderKeepScroll();
  },
  bDown(t) {
    if (moveBlock(Number(t.dataset.b), Number(t.dataset.b) + 1)) fx.rerenderKeepScroll();
  },
  bDel: blockRemove,
  /* New machine or gym (r61, PENDING 343 7, V's decision of 2026-10-24): the
     lift starts over from this session, every block of it marked and its
     suggestion read again as a first session's; tapped again, it reads its
     history again. Rows typed are kept; rows still on the suggestion take
     the new one (refreshBlock). In an edit from History it marks the saved
     session, or takes the mark off, when the edit is saved. */
  bNew(t) {
    const d = state.draft;
    const b0 = d && d.ex[Number(t.dataset.b)];
    if (!d || !b0) return;
    const on = !markedNew(d, b0.exId);
    act(
      () => {
        for (const b of d.ex)
          if (b.exId === b0.exId) {
            if (on) b.nw = true;
            else delete b.nw;
          }
        // An edit's sets are saved ones, its words "Editing saved sets.": nothing is suggested there to read again.
        if (!d.editingId) for (const b of d.ex) if (b.exId === b0.exId) refreshBlock(b);
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    fx.toast(
      on
        ? `${exName(b0.exId)} starts over from this session. Its history stays.`
        : `${exName(b0.exId)} reads its history again.`
    );
  },
  // A superset made here is this session's; Finish offers to keep it in the plan (r34.2, from the review: it was gone next time without a word).
  bSs(t) {
    const d = state.draft;
    const bi = Number(t.dataset.b);
    if (!d || !d.ex[bi]) return;
    // linkToggle changes nothing when there is no exercise after this one to pair with.
    if (
      !act(
        () => {
          linkToggle(d.ex, bi, x => x.plan);
        },
        { inProgress: true, check: () => !!d.ex[bi] && !!d.ex[bi + 1] }
      )
    )
      return;
    fx.rerenderKeepScroll();
    const b = d.ex[bi];
    if (b && b.plan.ss)
      fx.toast(d.dayId ? 'Superset. Finish offers to keep it in your plan.' : 'Superset for this session.');
  },
  noteReuse(t) {
    const b = tapBlock(t);
    const ln = b && b.lastNote;
    if (!b || !ln) return;
    act(
      () => {
        b.note = ln.text;
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
    fx.toast('Note carried into this session');
  },
  cDraftAdd(t) {
    const d = state.draft;
    if (!d) return;
    act(
      () => {
        (d.cardio || (d.cardio = [])).push(cleanDraftCardio({ id: uid(), kind: 'walk', when: t.dataset.when }));
      },
      { inProgress: true }
    );
    fx.rerenderKeepScroll();
  },
  cDraftDel: cardioRemove,
  /* The check-in: answering the last of the three folds it away. */
  chk(t) {
    const d = state.draft;
    if (!d) return;
    const k = t.dataset.k || '',
      v = Number(t.dataset.v);
    const c: Record<string, number> = Object.assign({}, d.chk || {});
    const was = CHK_Q.every(([q]) => c[q]);
    if (c[k] === v) delete c[k];
    else c[k] = v;
    act(
      () => {
        d.chk = Object.keys(c).length ? c : undefined;
      },
      { inProgress: true }
    );
    if (!was && CHK_Q.every(([q]) => c[q])) ui.folds['logger:checkin'] = false;
    fx.rerenderKeepScroll();
  },
  /* The check-in's lighter session (r30, r31): only the exercises not
     started become lighter (b.light: half their sets, about 90% loads, 3+
     RIR, no target); the session itself is not marked, so work already done
     at full effort still sets next time's target and counts in trends.
     Anything already logged or typed stays exactly as it is. Undo puts it back. */
  makeLight() {
    const d = state.draft;
    if (!d || d.light || d.deload) return;
    const todo = d.ex.filter(b => !b.light && !b.sets.some(x => !x.warm && !rowBlank(b, x)));
    if (!todo.length) {
      fx.toast('Every exercise is started, so nothing changed');
      return;
    }
    act(
      () => {
        if ((d.notes || '') === (d.note0 || ''))
          d.notes =
            d.note0 = `Made lighter after the check-in: exercises not started, half sets at about ${pctOf(LIGHT_SHARE)}% loads.`;
        for (const b of todo) {
          b.light = true;
          const work = b.sets.filter(x => !x.warm);
          const keep = Math.max(1, Math.ceil(work.length / 2));
          let cut = work.length - keep;
          for (let i = b.sets.length - 1; i >= 0 && cut > 0; i--)
            if (!b.sets[i].warm) {
              b.sets.splice(i, 1);
              cut--;
            }
          refreshBlock(b);
        }
      },
      { inProgress: true, undo: true }
    );
    fx.rerenderKeepScroll();
    fx.toast(
      `Lighter: ${todo.length} exercise${todo.length === 1 ? '' : 's'} not started now half the sets at about ${pctOf(LIGHT_SHARE)}% loads`,
      true
    );
  },
  calSnooze() {
    act(() => {
      state.settings.calSnooze = today();
    });
    fx.rerenderKeepScroll();
    fx.toast(`The RIR check will come back in ${CAL_OFFER.weeks} weeks`);
  },
  bwAskNo() {
    prefSet(BWASK_KEY, '1');
    fx.rerenderKeepScroll();
  },
  tStart(t) {
    const b = tapBlock(t);
    if (b && +b.plan.rest > 0) fx.startTimer(+b.plan.rest);
  },
  /* A session with nothing in it goes at once; one with anything entered
     (sets, reps, cardio, a note) asks first. An edit always asks, since the
     saved sets are already in it. */
  discard() {
    const d = state.draft;
    if (!d) return;
    const out = (): void => {
      act(
        () => {
          state.draft = null;
        },
        { inProgress: true }
      );
      fx.stopTimer();
      fx.wakeOff();
      window.scrollTo(0, 0);
      fx.render();
    };
    if (!d.editingId && !draftEntered(d)) {
      out();
      fx.toast('Session discarded');
      return;
    }
    if (d.editingId && editFp0.get(d.id) === editFp(d)) {
      out();
      fx.toast('No changes made');
      return;
    }
    fx.confirm(
      'Discard this session?',
      d.editingId
        ? 'Your edits will be lost. The saved session stays as it was.'
        : 'Sets and cardio logged in this session will not be saved.',
      'Discard',
      out,
      true
    );
  },
  finish: () => finish(),
  finishNow: () => finishNow()
};

/* ---------- the screen's fields ---------- */

/* Where the last touch landed, for the routes auto-mark reads and for a load
   field's selection (the page's pointerdown, capture phase). A tap on a load
   field that already has focus places the caret, as any tap does, so the next
   key no longer replaces the number. */
function noteDown(e: Event): void {
  W.lastDown = { el: e.target instanceof Element ? e.target : null, t: Date.now() };
  W.selAgain = null;
  if (W.replaceNext && e.target === W.replaceNext && document.activeElement === W.replaceNext) W.replaceNext = null;
}

/* What a field of the session screen typed changes, on every keystroke:
   clamped as stored (the field keeps what was typed so the lifter is not
   fought mid-keystroke, but history can never take a negative load or an
   impossible rep count), saved once the typing pauses. Whole reps: 8.5 is 8,
   a partial rep not a rep (r55). On an assisted lift the number is the help.
   A load typed is the lifter's, no longer carried. The grey numbers, the
   progress line and the plates follow at once, as the legacy patches had
   them; a name or notes are drawn at the next draw, as before. */
/** A keystroke in one of the session screen's fields; whether it was one. */
export function workoutInput(t: HTMLInputElement): boolean {
  const d = state.draft;
  if (!d) return false;
  if (t.dataset.cf && d.cardio) {
    const c = d.cardio[Number(t.dataset.c)];
    if (!c) return true;
    const k = t.dataset.cf;
    act(
      () => {
        if (k === 'min') {
          const n = numIn(t.value);
          c.min = n == null || n <= 0 ? null : Math.min(Math.round(n), LIMITS.minutes);
        } else if (k === 'hr') {
          const n = numIn(t.value);
          c.hr = n != null && n >= LIMITS.hr[0] && n <= LIMITS.hr[1] ? Math.round(n) : null;
        } else if (k === 'dist') {
          const v = distIn(t.value);
          if (v == null) delete c.dist;
          else c.dist = v;
        } else if (k === 'kind' && CARDIOL[t.value]) c.kind = t.value;
        else if (k === 'when' && CWHENL[t.value]) c.when = t.value;
      },
      { inProgress: true, soon: true }
    );
    return true;
  }
  if (t.dataset.f === 'w' || t.dataset.f === 'r') {
    const s = draftSet(t);
    if (!s) return true;
    greyTyped(t);
    if (W.selAgain === t) W.selAgain = null;
    if (W.replaceNext === t) W.replaceNext = null;
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const n = numIn(t.value);
    act(
      () => {
        if (t.dataset.f === 'w') {
          const bx = d.ex[bi];
          const as = !!bx && !!EX(bx.exId).assist;
          /* fromD of a number is a number (null only for no number), so 0 never
             stands in. Within the bounds a save keeps, in kilograms (r61; until
             then 660 of help and 20000 in the unit typed). */
          s.w =
            n == null
              ? null
              : as
                ? -Math.min(fromD(Math.abs(n)) ?? 0, -LOAD_MIN)
                : Math.min(fromD(Math.max(n, 0)) ?? 0, LOAD_MAX);
          if (s.w === 0) s.w = 0;
          carried.delete(s);
        } else s.r = n == null ? null : Math.min(Math.max(Math.floor(n + EPS), 0), LIMITS.reps);
      },
      { inProgress: true, soon: true }
    );
    if (t.dataset.f === 'w') W.platesAt = { b: blkRef(bi), s: si };
    redraw();
    return true;
  }
  const b = t.dataset.bind;
  if (b === 'draftNotes') {
    act(
      () => {
        d.notes = t.value;
      },
      { inProgress: true, soon: true }
    );
    return true;
  }
  if (b === 'draftName') {
    act(
      () => {
        d.dayName = t.value.trim() ? t.value.slice(0, LIMITS.name) : 'Freestyle';
      },
      { inProgress: true, soon: true }
    );
    return true;
  }
  return false;
}

/* A field of the session screen left with a new value. Reps: the field shows
   the reps stored (r55); a done set whose reps were cleared is undone, once
   the new rows are in place (a field taken away mid-draw fires its change as
   if left); one typed as 0 is a missed set, ticked as typed (r55, V), and a
   ticked set changed to 0 asks, as a tick does, when its load is light
   (r55.1, the spec review); cleared, it is marked, so leaving the field does
   not tick it again at the grey reps (r55, the audit). Heading for this
   row's load: ticked when the load is left, so the load is never written
   into the field being typed in (r55, the audit: 105 typed there became
   101050); heading for this row's RIR box: ticked when its strip closes (or
   after 2 s if it never opened), by identity, so a later tick cannot run this
   one (r45). A load: a ticked set's load changed to one far off asks too,
   unticked until answered; Log it, or the load fixed after Fix it, ticks it
   again, its rest not started over (r55; the second review). The date: last
   time and the targets are read as of the session's date, so a new date
   reads them again; typed and ticked sets are left alone. */
/** A change in one of the session screen's fields; whether it was one. */
export function workoutChange(t: HTMLInputElement): boolean {
  const d = state.draft;
  if (!d) return false;
  if (t.dataset.cf && d.cardio) {
    const c = d.cardio[Number(t.dataset.c)];
    if (c) {
      const k = t.dataset.cf;
      act(
        () => {
          if (k === 'kind' && CARDIOL[t.value]) c.kind = t.value;
          else if (k === 'when' && CWHENL[t.value]) c.when = t.value;
        },
        { inProgress: true }
      );
    }
    return true;
  }
  if (t.dataset.f === 'r') {
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    const s = draftSet(t);
    if (!s) return true;
    if (drawing()) {
      if (s.done && s.r == null)
        queueMicrotask(() => {
          const b2 = state.draft && state.draft.ex[bi];
          const s2 = b2 && b2.sets[si];
          if (s2 && s2.done && s2.r == null) setDone(bi, si, false);
        });
      return true;
    }
    const near = (sel: string): boolean =>
      !d.past && !!W.lastDown.el && Date.now() - W.lastDown.t < TOUCH_MS && !!W.lastDown.el.closest(sel);
    if (s.done && s.r == null) {
      setDone(bi, si, false);
      t.dataset.cleared = '1';
    } else if ((state.settings.autoDone || d.past) && !s.done && (+(s.r ?? 0) > 0 || isMissed(s))) {
      const toRir = near(`.rirb[data-b="${bi}"][data-s="${si}"]`);
      const toW = !toRir && near(`.sg input[data-f="w"][data-b="${bi}"][data-s="${si}"]`);
      if (toW) W.pendAuto = { b: blkRef(bi), s: si };
      else if (toRir) {
        const p = { b: blkRef(bi), s: si };
        W.pendAuto = p;
        setTimeout(() => {
          if (W.pendAuto === p && !document.querySelector('.rirstrip')) autoPending();
        }, STRIP_WAIT_MS);
      } else {
        W.lastAuto = { b: blkRef(bi), s: si, t: Date.now() };
        setDone(bi, si, true);
      }
    } else if (s.done && isMissed(s)) {
      setDone(bi, si, false);
      setDone(bi, si, true, true);
    } else if (s.done) {
      act(() => assessSet(bi, si), { inProgress: true });
    }
    redraw();
    return true;
  }
  if (t.dataset.f === 'w') {
    const s = draftSet(t);
    if (!s) return true;
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    /* A ticked set's load cleared is unticked, as a ticked set's reps
       cleared are (V on r61's preview, 2026-10-26: set 2 ticked on its grey
       225, its load then cleared, stayed ticked with no weight, and the
       recap read it as 0 x 8). Ticked again it takes its grey load or waits
       for one (setDone), so a ticked set of a lift that takes a load always
       has one. A bodyweight lift's added load and a timed hold's may be
       none, as noLoadYet says. */
    const lift = EX(d.ex[bi] ? d.ex[bi].exId : '');
    if (s.done && s.w == null && !lift.bw && !lift.timed) {
      setDone(bi, si, false);
      redraw();
      return true;
    }
    const refix = ui.refix;
    const rf = !!refix && refix.s === si && blkIdx(refix.b) === bi;
    if (rf) ui.refix = null;
    /* A tick that waited for its weight (344) is made once one is typed; the
       checkmark tapped next keeps it, as after auto-mark. Only while the set
       still has its reps (or a 0 typed, a missed set): reps cleared since,
       the tick has nothing to log and is dropped (the independent review of
       r60: 135 x 0 was saved as a missed set the lifter never logged). */
    const typed = needHere(bi, si) && s.w != null;
    if (typed) W.needAt = null;
    const need = typed && (+(s.r ?? 0) > 0 || isMissed(s));
    if (s.done && oddLoad(d.ex[bi], si, d.date)) {
      setDone(bi, si, false);
      setDone(bi, si, true, true);
      return true;
    }
    if (rf && !s.done) setDone(bi, si, true, true);
    else if (need && !s.done) {
      W.lastAuto = { b: blkRef(bi), s: si, t: Date.now() };
      setDone(bi, si, true);
    } else if (s.done) act(() => assessSet(bi, si), { inProgress: true });
    mixCheck(bi, si);
    if (fillLoads()) act(() => carryLoad(d.ex[bi], si), { inProgress: true });
    redraw();
    return true;
  }
  if (t.dataset.bind === 'draftDate') {
    if (isDate(t.value) && t.value <= today()) {
      const moved = d.date !== t.value;
      act(
        () => {
          d.date = t.value;
          if (moved && !d.editingId) for (const b of d.ex) refreshBlock(b);
        },
        { inProgress: true }
      );
      if (moved && !d.editingId) fx.rerenderKeepScroll();
    } else {
      t.value = d.date;
      fx.toast('A session cannot be dated in the future');
    }
    return true;
  }
  return false;
}

/* In a set row, Enter (the keyboard's Next) goes load, reps, then the next
   set's load, which is the order sets are typed in; Next on an empty reps
   field accepts the grey number (acceptGrey). Escape closes the effort strip.
   The arrow keys on an exercise's handle move it, as a drag does. */
/** A key on the session screen; whether it was one it acts on. */
export function workoutKey(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!(t instanceof Element)) return false;
  // A key that moves the caret leaves it where it went: the next key goes there.
  if (W.replaceNext === t && /^(Arrow|Home$|End$)/.test(e.key)) W.replaceNext = null;
  if (e.key === 'Enter' && t instanceof HTMLInputElement && t.matches('.sg input[data-f]')) {
    e.preventDefault();
    const bi = Number(t.dataset.b),
      si = Number(t.dataset.s);
    if (t.dataset.f === 'r' && !t.value.trim()) acceptGrey(bi, si);
    /* A set whose tick waits for its weight (344) keeps the focus on its
       load field, which setDone gave it (from the independent review of r60:
       Next moved on, and the weight typed next went to the set after). */
    if (needHere(bi, si)) return true;
    const all = [...document.querySelectorAll<HTMLInputElement>('.sg input[data-f]')];
    const nx = all[all.indexOf(t) + 1];
    if (nx)
      try {
        nx.focus();
        if (nx.dataset.f === 'w') armLoad(nx);
        else nx.select();
      } catch (x) {
        // Focus is best effort; the set is typed either way.
      }
    else t.blur();
    return true;
  }
  if (e.key === 'Escape' && W.stripAt) {
    rirClose();
    return true;
  }
  const bg = t.closest('.bgrip');
  const d = state.draft;
  if (bg instanceof HTMLElement && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && d) {
    e.preventDefault();
    const i = Number(bg.dataset.b);
    const j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= d.ex.length) return true;
    moveBlock(i, j);
    fx.rerenderKeepScroll();
    const n = document.querySelector<HTMLElement>(`.bgrip[data-b="${j}"]`);
    if (n) n.focus();
    fx.toast(`Moved to position ${j + 1}`);
    return true;
  }
  return false;
}

/* A tap on a load field shows its number selected (V, PENDING 341 a, from
   the live r56.1: a grey load was an empty field under a hint, so it could
   not be edited in place and backspace did nothing, while a filled one took
   the caret where tapped, 165 then 1 giving 1615). A grey load is put in the
   field to be typed over: a digit replaces it, backspace clears it, and left
   untouched it goes back to grey, so it still follows the next sets'
   adjustment and one tap on the checkmark still logs it. A filled load is
   selected the same way. The selection is made on focus, and made again when
   the tap that focused the field is released, whose default would place the
   caret where the finger landed (in WebKit, the engine of every iPhone
   browser, it did: GitHub's run of r60 typed 1135 over a selected 135, and
   152.5 over a grey 135 as 1152.535). The first key does what the selection
   says whatever the screen shows (workoutBeforeInput), so a release that
   still moves the caret cannot splice a digit into the number. A second tap
   on the focused field places the caret as any tap does, and so does an
   arrow key, Home or End. Only a tap or Next does this: a field focused
   again by a redraw keeps its caret and its text (from the independent
   review of r60: a field remade mid-number, its focus given back, took the
   next digit as a new number, 13 then 5 giving 5). iPhone selection
   behaviour is to be tried on V's phone before this ships. */
// A field of the session screen focused (focusin): on a tap, a load field's number selected, a grey one put in to be typed over.
function workoutFocus(e: FocusEvent): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || !t.matches('.sg input[data-f="w"]')) return;
  // Focused by a touch on it just now (noteDown ran first): its release is still to come.
  if (W.lastDown.el !== t || Date.now() - W.lastDown.t > TOUCH_MS) return;
  armLoad(t);
  W.selAgain = t;
}

// A load field made ready to be typed over, on a tap or Next: a grey load put in, the number selected, and the first key replacing it.
function armLoad(t: HTMLInputElement): void {
  if (!t.value && /\d/.test(t.placeholder)) {
    t.value = t.placeholder;
    greyIn.add(t);
    fieldShown(t, true);
  }
  t.select();
  W.replaceNext = t;
}

// A tap released (mouseup, capture phase): on the load field it just focused, the selection kept rather than the caret placed.
function workoutUp(e: MouseEvent): void {
  const t = W.selAgain;
  if (!t || e.target !== t) return;
  W.selAgain = null;
  if (document.activeElement !== t) return;
  e.preventDefault();
  t.select();
}

/* The first key in a load field just focused replaces its number, and a
   backspace or delete clears it, as the selection on it says (above). The
   whole number is selected and the key's edit made over it as the browser's
   own editing (execCommand), so the field's input, and its change when it is
   left, follow as for any key: a value set by code fires neither, and the
   change is what checks a load far from last time's (tests/acceptance.js).
   Any other edit (a paste) goes ahead as the browser does it. */
// A key about to change a field (beforeinput).
function workoutBeforeInput(e: InputEvent): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement) || W.replaceNext !== t) return;
  W.replaceNext = null;
  const put = e.inputType === 'insertText' ? (e.data ?? '') : e.inputType.startsWith('delete') ? '' : null;
  if (put === null) return;
  e.preventDefault();
  t.select();
  // The browser's editing commands; the edit made below fires this listener again, which replaceNext, now null, passes by.
  if (document.execCommand(put ? 'insertText' : 'delete', false, put)) return;
  log('workout', 'the browser refused an edit over a selected load; it was made by setting the value');
  t.value = put;
  t.dispatchEvent(new Event('input', { bubbles: true }));
}

// A grey load put in a field and typed over is the lifter's own from then on (workoutInput).
function greyTyped(t: HTMLInputElement): void {
  if (!greyIn.has(t)) return;
  greyIn.delete(t);
  fieldShown(t, false);
}

/* Leaving a set's reps field empty takes its grey reps (acceptGrey, worksets.ts),
   unless the lifter went to the same row's load or effort, a button or any
   other control (where the lifter went: the newly focused element, or on an
   iPhone, where buttons never take focus, whatever was just touched), or the
   phone blurred the field itself (locked, or the app sent to the
   background). Leaving the load field a waiting auto-mark was heading for
   runs it. */
// A field of the session screen left (focusout).
function workoutBlur(e: FocusEvent): void {
  const t = e.target;
  if (!(t instanceof HTMLInputElement)) return;
  if (W.replaceNext === t) W.replaceNext = null;
  if (W.selAgain === t) W.selAgain = null;
  // A grey load left untouched goes back to grey: nothing was typed.
  if (greyIn.has(t)) {
    greyTyped(t);
    t.value = '';
  }
  if (
    t.matches('.sg input[data-f="w"]') &&
    W.pendAuto &&
    W.pendAuto.s === Number(t.dataset.s) &&
    blkIdx(W.pendAuto.b) === Number(t.dataset.b)
  ) {
    setTimeout(autoPending, 0);
    return;
  }
  if (!t.matches('.sg input[data-f="r"]') || t.value.trim()) return;
  if (t.dataset.cleared) {
    delete t.dataset.cleared;
    return;
  }
  if (drawing() || !state.draft || !state.settings.autoDone) return;
  const bi = Number(t.dataset.b),
    si = Number(t.dataset.s);
  const to = e.relatedTarget;
  if (to instanceof HTMLElement && to.dataset.b === t.dataset.b && to.dataset.s === t.dataset.s) return;
  const dn = W.lastDown;
  const dest = to instanceof Element ? to : Date.now() - dn.t < TOUCH_MS && dn.el !== t ? dn.el : null;
  if (
    dest &&
    !dest.closest('.sg input[data-f]') &&
    dest.closest('button,a,select,label,input,textarea,summary,[data-act],[role="button"]')
  )
    return;
  setTimeout(() => {
    if (document.visibilityState !== 'visible' || !document.hasFocus()) return;
    acceptGrey(bi, si);
  }, 0);
}

/** Adds the session screen's listeners to the page: where a touch lands and is released (capture), a field left, a field focused, and a key about to change one. Called once at start, after the page's own. */
export function workoutStart(): void {
  onRedraw(drawNow);
  document.addEventListener('pointerdown', noteDown, true);
  document.addEventListener('mouseup', workoutUp, true);
  document.addEventListener('focusout', workoutBlur);
  document.addEventListener('focusin', workoutFocus);
  document.addEventListener('beforeinput', workoutBeforeInput);
}
