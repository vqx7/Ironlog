/* Plan (r58, phase 5): the routine, its days and exercises, the library to
   add from and the routine's weekly volume, and the exercise library page,
   drawn by lit-html as src/22-plan-stats.js drew them, with the actions and
   fields that change what they show, each change to the log through `act`.
   What Plan opens elsewhere stays with that code in the legacy script, by the
   button's data-act as before: the pickers (Add exercise, Swap), the sheets
   (a new routine, a template, the exercise editor) and the guide. A drag of
   an exercise, a day or a library card ends here (`dropItem`, `dropDay`,
   `dropLib`), the dragged element put back where lit-html drew it first. */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { act, toTrash } from './act';
import {
  BANDS,
  COMMON_TIP,
  EQL,
  EQUIP,
  MK,
  ML,
  MUSCLES,
  commonFirst,
  isCommon,
  isCompound,
  USUAL_RANGE,
  MAJOR_MIN
} from './library';
import {
  MAX_DAYS,
  RIR_TGT_TIP,
  dayLabel,
  dayShare,
  daySets,
  fixSupersets,
  move,
  plannedPerWeek,
  ssLetters,
  trainDaysOf,
  trainOn,
  linkToggle,
  routineEmpty
} from './routines';
import { JUMP_TIP, SESSION_CAP, HELPER_CREDIT } from './formulas';
import { repSpan } from './format';
import { belowMin } from './volume';
import { ON_PLAN_TIP } from './weeks';
import { loadWords } from './loads';
import { TRASH_DAYS, LIMITS, EFFORT_TOP } from './records';
import { andList, numIn, r1, uid, PERCENT, WEEK_DAYS } from './util';
import { plainTemplate } from './normalize';
import { effIn, effName, effShow } from './effort';
import {
  EX,
  U,
  defBand,
  dayMinutes,
  exName,
  fmtW,
  fromD,
  hasTarget,
  incOf,
  invalidate,
  muscleStatus,
  plannedSets
} from './live';
import { fx, state, ui } from './store';
import {
  curRoutineB,
  effTgt,
  findItem,
  libFiltered,
  nameTaken,
  newItem,
  rirShow,
  routineClutter,
  sessionMuscleSets
} from './display';
import {
  dragDrop,
  fieldValue,
  helpButton,
  howText,
  minPart,
  pageTitle,
  section,
  slotted,
  tabFoot,
  tipButton
} from './view';
import type { Part } from './view';
import type { Day, Exercise, PlanItem, Routine } from './types';

/** The fewest sets the volume bars' scale shows, so a light week's bars are not stretched. */
const BAR_SCALE_MIN = 24;

/* ---------- small parts ---------- */

/** What a muscle with no weekly target says where its target would be (r58: any muscle may be given one). */
export const TRACKED_TIP = 'Tracked only: counted, with no target. Give it one in Settings, Weekly set targets.';

/** An exercise's library tags (exTags): Most common and Less common, but not the one the list is filtered to. */
export function exTagParts(e: Exercise, skip?: string): Part {
  return html`${isCommon(e) && skip !== 'common' ? html`<span class="tag common">Most common</span>` : nothing}${e.rare && skip !== 'rare' ? html`<span class="tag rare">Less common</span>` : nothing}`;
}

/* A day's flag when it plans more than SESSION_CAP sets for one muscle
   (Remmert 2025, a preprint: a convention, said in its tip). */
/** A day's flag for a muscle planned past SESSION_CAP sets in one workout, or nothing. */
export function sessionCapNote(day: Day): Part {
  if (day.rest || !day.items.length) return nothing;
  const ms = sessionMuscleSets(day);
  const over = Object.entries(ms)
    .filter(([, v]) => v > SESSION_CAP)
    .sort((a, b) => b[1] - a[1]);
  if (!over.length) return nothing;
  const who = andList(over.map(([m, v]) => `${ML[m]} ${r1(v)}`));
  return html`<p class="small" style="margin:4px 12px 0"><span class="flag hastip" data-tip=${`More than ${SESSION_CAP} sets for one muscle in one workout. That line is a convention from one study not yet peer reviewed (Remmert 2025), which found no extra growth past it. Consider moving some to another day. Helper-muscle sets count as half.`}>Heavy for one workout: ${who} sets</span></p>`;
}

/* Plan against the usual ranges (r30, V's choice). Picking a routine on a
   first run brings the weekly minimums down to what it plans, so following
   it reads as on target (r29); measured against those, the plan always
   passes. This one quiet line, on Plan only, names the muscles the plan
   puts under the usual range where the target was brought down to meet it.
   No colour and no flag anywhere else: the targets stay the lifter's. */
/** Plan's note naming the muscles it plans under the usual weekly range, or nothing. */
export function planEvidenceNote(pv: Readonly<Record<string, number>>): Part {
  const b = state.settings.bands;
  // Major muscles only (a default minimum of MAJOR_MIN or more): the usual range is about them; smaller ones have lower, softer defaults.
  // Brought down below the profile's own default too (r44): a focus's maintenance targets were not lowered to meet the plan.
  const low = MK.filter(
    m =>
      hasTarget(m) &&
      BANDS[m][0] >= MAJOR_MIN &&
      b[m][0] < Math.min(BANDS[m][0], defBand(m)[0]) &&
      belowMin(pv[m] || 0, BANDS[m][0])
  );
  if (!low.length) return nothing;
  // Every one named: only major muscles can be on it, never so many that the line needs cutting.
  return html`<p class="small muted" id="planUsual" style="margin:8px 0 0">Under the usual range in this plan: ${andList(
    low.map(m => `${ML[m]} ${r1(pv[m] || 0)} of ${BANDS[m][0]}`)
  )}. ${tipButton(`The usual weekly range is ${USUAL_RANGE[0]} to ${USUAL_RANGE[1]} hard sets for most major muscles (typical in studies, not a ceiling); smaller muscles have lower ones. Your targets were set to this plan when you picked it, so Stats measures you against the plan. Fewer sets still build muscle, more slowly; add a set at a time when it feels easy.`, 'About the usual range')}</p>`;
}

/* soFar: this week while it is still going, so short of the minimum is
   under way (pale green), not amber (r29). Each row's status is the one
   every screen reads (muscleStatus, r54): no sets is none, as on the map,
   never green, and not yet this week rather than under way; on an average
   with a minimum it is below, unless on plan. */
/** Hard sets per muscle against the weekly targets, a bar a muscle; `conf` the sets with RIR logged, shaded apart. */
export function volumeRows(
  sets: Readonly<Record<string, number>> & { readonly _mix?: Readonly<Record<string, boolean>> },
  conf?: Readonly<Record<string, number>> | null,
  soFar?: boolean
): TemplateResult {
  const bands = state.settings.bands;
  const maxScale = Math.max(BAR_SCALE_MIN, ...MK.map(m => Math.max(sets[m] || 0, bands[m][1] + 2)));
  const hasConf = !!conf;
  const st = muscleStatus(sets, soFar);
  const plates: Record<string, string> = {
    track: 'none',
    none: 'none',
    part: 'part',
    plan: 'plan',
    under: 'yellow',
    over: 'blue',
    in: 'green'
  };
  const head = hasConf
    ? html`<div class="legend"><span><i style="background:var(--ink);opacity:.55"></i>RIR logged</span><span><i style="background:var(--green);opacity:.34"></i>assumed hard (RIR blank)</span></div>`
    : nothing;
  return html`${head}${MK.map(m => {
    const v = sets[m] || 0;
    const [lo, hi] = bands[m];
    const cls = st[m].st;
    // No target (hasTargetIn, r58): counted, with no zone and no target said.
    const tr = cls === 'track';
    const plate = plates[cls];
    const c = hasConf && conf ? Math.min(conf[m] || 0, v) : 0;
    const tip = `${ML[m]}: ${r1(v)} hard sets${hasConf ? `, ${r1(c)} with RIR logged, ${r1(v - c)} assumed` : ''}. ${tr ? TRACKED_TIP : `Target ${lo} to ${hi}; the upper number is typical, not a ceiling.${cls === 'plan' ? ` On plan: ${ON_PLAN_TIP}` : ''}`}`;
    return html`<div class="mrow"><span class=${`plate ${plate}`}></span><span>${ML[m]}</span><div class="band" data-tip=${tip}>${tr ? nothing : html`<div class="zone" style=${`left:${(lo / maxScale) * PERCENT}%;width:${((hi - lo) / maxScale) * PERCENT}%`}></div>`}<div class=${`fill ${cls}${hasConf ? ' ghost' : ''}`} style=${`width:${Math.min(PERCENT, (v / maxScale) * PERCENT)}%`}></div>${hasConf && c > 0 ? html`<div class="fill conf" style=${`width:${Math.min(PERCENT, (c / maxScale) * PERCENT)}%`}></div>` : nothing}</div><span class="r num">${r1(v)}<span class="muted small">${tr ? ' tracked' : ` /${lo}-${hi}`}</span></span></div>`;
  })}`;
}

/* ---------- Plan ---------- */

/* The open day: the one picked last, else the day + adds to, else the first
   training day. An empty string means the lifter closed them all. */
/** The id of the day Plan has open. */
export function dayFocusId(R: Routine): string {
  const f = ui.dayFocus;
  if (typeof f === 'string' && (f === '' || R.days.some(d => d.id === f))) return f;
  const t = R.days[ui.bTarget];
  if (t) return t.id;
  const first = R.days.find(d => !d.rest) || R.days[0];
  return first ? first.id : '';
}

function itemPart(R: Routine, di: number, it: PlanItem, ii: number): TemplateResult {
  const ex = EX(it.exId);
  const open = ui.openItem === it.uid;
  const day = R.days[di];
  const items = day ? day.items : [];
  const nx = items[ii + 1];
  const letters = ssLetters(items);
  const linked = !!(it.ss && nx && nx.ss === it.ss);
  const editor = open
    ? html`<div class="ied"><div class="grid3">
    <label class="field">Sets<input type="text" inputmode="numeric" data-it="sets" data-uid=${it.uid} .value=${fieldValue(String(it.sets))}></label>
    <label class="field">${ex.timed ? 'Min seconds' : 'Rep min'}<input type="text" inputmode="numeric" data-it="repMin" data-uid=${it.uid} .value=${fieldValue(String(it.repMin))}></label>
    <label class="field">${ex.timed ? 'Max seconds' : 'Rep max'}<input type="text" inputmode="numeric" data-it="repMax" data-uid=${it.uid} .value=${fieldValue(String(it.repMax))}></label>
    <label class="field"><span class="hastip" data-tip=${RIR_TGT_TIP}>Target ${effName()}</span><input type="text" inputmode="decimal" data-it="rir" data-uid=${it.uid} .value=${fieldValue(effShow(it.rir))}></label>
    <label class="field">Rest (s)<input type="text" inputmode="numeric" data-it="rest" data-uid=${it.uid} .value=${fieldValue(String(it.rest))}></label>
    <label class="field">Load step (${U()})<input type="text" inputmode="decimal" data-it="inc" data-uid=${it.uid} .value=${fieldValue(fmtW(incOf(ex, it)))} data-tip="Applies to this exercise on every day and routine"></label>
    ${ex.timed ? nothing : html`<label class="field"><span class="hastip" data-tip=${JUMP_TIP}>Load jump %</span><input type="text" inputmode="decimal" data-it="jump" data-uid=${it.uid} .value=${fieldValue(it.jump != null ? String(it.jump) : '')} placeholder=${`auto ${isCompound(ex) ? '2.5' : '5'}`}></label>`}</div>
    <div class="row" style="margin-top:8px"><label class="field" style="flex:1">Move to<select data-moveto=${it.uid} data-day=${String(di)}>${R.days.map((d, i) => html`<option value=${String(i)} .selected=${live(i === di)}>${dayLabel(R, i)}: ${d.name}</option>`)}</select></label>
    <button class="btn sm" data-act="iSwap" data-uid=${it.uid} style="align-self:flex-end">Swap</button><button class="btn sm danger" data-act="iDel" data-day=${String(di)} data-i=${String(ii)} style="align-self:flex-end">Remove</button></div>
    ${nx ? html`<div class="row" style="margin-top:8px"><button class=${linked ? 'btn sm noted' : 'btn sm '} data-act="ssToggle" data-uid=${it.uid}>${linked ? 'Unlink superset' : 'Superset with next'}</button>${linked ? html`<span class="small muted">Paired with ${exName(nx.exId)}: alternate sets, rest once after the pair.</span>` : nothing}</div>` : nothing}
    ${ex.note ? html`<p class="small muted">${ex.note}</p>` : nothing}</div>`
    : nothing;
  const letter = it.ss ? letters[it.ss] : undefined;
  return html`<li class=${it.ss ? 'it ss' : 'it'} data-uid=${it.uid}><div class="ir"><span class="grip" aria-hidden="true">⠿</span><button class="imain" data-act="toggleItem" data-uid=${it.uid}><b>${ex.name}</b><span>${it.sets} × ${repSpan(it.repMin, it.repMax, '-')}${ex.timed ? 's' : ''}, ${rirShow(ex) ? `${effTgt(it.rir)}, ` : ''}rest ${it.rest}s${it.ss ? ` · superset ${letter}` : ''}</span></button><button class="ib" aria-label=${`Move ${ex.name} up`} data-act="iUp" data-day=${String(di)} data-i=${String(ii)} ?disabled=${ii === 0}>↑</button><button class="ib" aria-label=${`Move ${ex.name} down`} data-act="iDown" data-day=${String(di)} data-i=${String(ii)} ?disabled=${ii === items.length - 1}>↓</button></div>
  ${editor}</li>`;
}

function bLibItems(): TemplateResult[] {
  return commonFirst(libFiltered(ui.bLibQ, ui.bLibM, '', false)).map(
    e =>
      html`<li class="it" data-ex=${e.id}><div class="ir"><span class="grip" aria-hidden="true">⠿</span><div class="imain"><b>${e.name}</b><span>${ML[e.primary]}, ${EQL[e.equip] || e.equip}${isCommon(e) ? ', common' : e.rare ? ', less common' : ''}</span></div><button class="ib" aria-label=${`Add ${e.name}`} data-act="libAdd" data-ex=${e.id}>+</button></div></li>`
  );
}

function dayPart(R: Routine, d: Day, di: number, weekly: boolean, dnd: boolean, focus: string): TemplateResult {
  fixSupersets(d.items);
  const dOpen = d.id === focus;
  const label = dayLabel(R, di);
  return html`<section class=${`day ${d.rest ? 'rest' : ''}`} data-did=${d.id}><div class="dh">${weekly ? nothing : html`<span class="dgrip" role="button" tabindex="0" data-di=${String(di)} aria-label=${`Move ${label}: drag, or use the arrow keys`} data-tip="Drag to reorder days">⠿</span>`}<span class="dlabel">${label}</span><input type="text" aria-label="Day name" data-dayname=${String(di)} .value=${fieldValue(d.name)}><button class="ib dfold" data-act="dFold" data-id=${d.id} aria-expanded=${String(dOpen)} aria-label=${`${dOpen ? 'Fold' : 'Unfold'} ${label}`}></button></div>
    <div class="dmeta row spread"><span>${d.rest ? '' : html`${d.items.length} exercises, ${daySets(d)} sets, ${minPart(dayMinutes(d))}`}</span><label class="check-inline"><input type="checkbox" data-dayrest=${String(di)} .checked=${live(d.rest)}>Rest day</label></div><div class="dbody" ?hidden=${!dOpen}>${sessionCapNote(d)}
    <ul class="items" data-day=${String(di)}>${d.items.map((it, ii) => itemPart(R, di, it, ii))}</ul>
    <div class="row" style="padding:0 10px 12px"><button class="btn sm" data-act="pickDay" data-day=${String(di)}>Add exercise</button>${weekly ? nothing : html`${dnd ? nothing : html`<button class="btn sm" data-act="dUp" data-day=${String(di)} ?disabled=${di === 0} aria-label=${`Move ${label} earlier`}>↑ Day</button><button class="btn sm" data-act="dDown" data-day=${String(di)} ?disabled=${di === R.days.length - 1} aria-label=${`Move ${label} later`}>↓ Day</button>`}<button class="btn sm danger" data-act="dDel" data-day=${String(di)} ?disabled=${R.days.length < 2}>Remove day</button>`}</div></div></section>`;
}

/** Plan, as a template of the log and `ui`: the routine shown (ui.bRoutine), its days and its weekly volume. */
export function viewProgram(): TemplateResult {
  if (!ui.bRoutine || !state.routines.find(r => r.id === ui.bRoutine)) ui.bRoutine = state.activeRoutineId;
  const R = curRoutineB();
  const isActive = R.id === state.activeRoutineId;
  if (ui.bTarget >= R.days.length) ui.bTarget = 0;
  const totSets = R.days.reduce((a, d) => a + (d.rest ? 0 : daySets(d)), 0);
  const weekly = R.schedule === 'weekly';
  const tdays = trainDaysOf(R);
  const meta = tdays
    ? html`<b>${R.name}</b> · ${tdays} training days${weekly ? ' a week' : ` in a ${R.days.length}-day cycle`} · ${Math.round(totSets * dayShare(R))} planned sets a week`
    : html`<b>${R.name}</b> · ${weekly ? 'fixed weekdays' : `${R.days.length}-day cycle`} · no exercises yet`;
  const head = html`${pageTitle(isActive ? 'Active routine' : 'Not active', 'Plan', meta, helpButton('plan'), true)}${howText('plan', 'Drag the ⠿ handle to reorder or move exercises between days; the arrows and "Move to" do the same. Tap an exercise to edit sets, reps, RIR, rest, and load increment, or to superset it with the next exercise. The library button manages every exercise, including your own. In a numbered cycle, drag a day by the ⠿ beside its number to reorder days (or focus the ⠿ and use the arrow keys); they renumber from their new position. On every tab, the ⠿ beside a section title moves that section, and the order is remembered.')}`;
  /* The library is one of the app's best parts (V, r28), so it gets a full
     width button of its own instead of a small one beside the ?. */
  const libBtn = html`<button type="button" class="libbtn" data-act="planLib"><span class="lb-i" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="10" width="3" height="4" rx="1"/><rect x="6" y="7" width="3" height="10" rx="1.2"/><rect x="15" y="7" width="3" height="10" rx="1.2"/><rect x="18" y="10" width="3" height="4" rx="1"/><rect x="9" y="11" width="6" height="2"/></svg></span><span class="lb-t"><b>Exercise library</b></span><span class="lb-c" aria-hidden="true">›</span></button>`;
  const routineSec = section({
    sk: 'program:routine',
    key: 'routine',
    title: 'Routine',
    sub: R.name,
    body: html`<div class="stack">
    <label class="field">Routine<select data-bind="bRoutine">${state.routines.map(r => html`<option value=${r.id} .selected=${live(r.id === R.id)}>${r.name}${r.id === state.activeRoutineId ? ' (active)' : ''}${routineEmpty(r) ? ' (empty)' : ''}</option>`)}</select></label>
    <label class="field">Name<input type="text" data-bind="routineName" .value=${fieldValue(R.name)}></label>
    <div class="row">${isActive ? html`<span class="pill green">Active routine</span>` : html`<button class="btn sm primary" data-act="rActive">Make active</button>`}
      <button class="btn sm" data-act="rNew">New blank</button><button class="btn sm" data-act="rTemplate">New from a template</button><button class="btn sm" data-act="rDup">Duplicate</button><button class="btn sm danger" data-act="rDel" ?disabled=${state.routines.length < 2}>Delete</button></div></div>`
  });
  const c = routineClutter();
  const clutter = c.length
    ? html`<div class="callout yellow" style="margin:10px 0"><p style="margin:0 0 8px">${c.length} routine${c.length > 1 ? 's are' : ' is'} empty or an exact duplicate, with no logged sessions: ${c.map(r => r.name + (routineEmpty(r) ? ' (empty)' : ' (duplicate)')).join(', ')}.</p><button class="btn sm" data-act="rClean">Remove ${c.length > 1 ? 'them' : 'it'}</button></div>`
    : nothing;
  const libSec = section({
    sk: 'program:library',
    key: 'library',
    title: 'Add exercises',
    sub: '',
    body: html`<div class="grid2"><input type="search" placeholder="Search" aria-label="Search exercises" data-bind="bLibQ" .value=${fieldValue(ui.bLibQ)}><select data-bind="bLibM" aria-label="Muscle"><option value="" .selected=${live(!ui.bLibM)}>All muscles</option>${MUSCLES.map(([k, l]) => html`<option value=${k} .selected=${live(ui.bLibM === k)}>${l}</option>`)}</select></div>
    <label class="field" style="margin-top:8px">+ adds to<select data-bind="bTarget">${R.days.map((d, i) => html`<option value=${String(i)} .selected=${live(i === ui.bTarget)}>${dayLabel(R, i)}: ${d.name}</option>`)}</select></label>
    <div class="lib-panel"><ul class="lib" id="bLib">${bLibItems()}</ul></div>`
  });
  const schedSec = section({
    sk: 'program:schedule',
    key: 'schedule',
    title: 'Schedule',
    sub: weekly ? 'Fixed weekdays' : 'Numbered cycle',
    body: html`<div class="stack"><label class="field">Schedule<select data-bind="rSchedule">
    <option value="cycle" .selected=${live(!weekly)}>Numbered cycle: Day 1, 2, 3… in order</option>
    <option value="weekly" .selected=${live(weekly)}>Fixed weekdays: Monday to Sunday</option></select></label>
    <p class="small muted hastip" style="margin:0" data-tip=${weekly ? 'Each day is pinned to a weekday and Today opens on the calendar day.' : `The cycle runs in order whatever the calendar says. Today opens on the day after your last session, so a missed workout waits instead of being skipped. A week plans the whole sessions the cycle brings round in 7 days, ${plannedPerWeek(R)} here. 1 to ${MAX_DAYS} days.`}>How this works</p></div>`
  });
  // The weekly count is in the header; a cycle of other than a week's days says its own count here (r34.2).
  const dnd = !!(window.__libs && window.__libs.sortable);
  const focus = dayFocusId(R);
  const daysBody = html`${!weekly && R.days.length !== WEEK_DAYS ? html`<p class="muted small" style="margin:0 0 4px">${totSets} sets a ${R.days.length}-day cycle ${tipButton('Drag the ⠿ beside a day number to reorder days; they renumber from their new position.', 'About days')}</p>` : nothing}<div id="dayList">${R.days.map((d, di) => dayPart(R, d, di, weekly, dnd, focus))}</div>${weekly ? nothing : html`<div class="row" style="margin-top:10px"><button class="btn sm" data-act="dAdd" ?disabled=${R.days.length >= MAX_DAYS}>+ Training day</button><button class="btn sm" data-act="dAddRest" ?disabled=${R.days.length >= MAX_DAYS}>+ Rest day</button></div>`}`;
  const daysSec = section({
    sk: 'program:days',
    key: 'days',
    title: 'Days',
    sub: `${R.days.length} day${R.days.length === 1 ? '' : 's'}`,
    body: daysBody
  });
  const pv = plannedSets(R);
  const bands = state.settings.bands;
  const pUnder = MK.filter(m => hasTarget(m) && belowMin(pv[m], bands[m][0])).length;
  const pvolSec = section({
    sk: 'program:pvol',
    key: 'pvol',
    title: 'Weekly volume',
    sub: pUnder
      ? html`<span class="pill yellow">${pUnder} under target</span>`
      : html`<span class="pill green">all on target</span>`,
    help: 'pvol',
    helpBody: `Hard sets per muscle this routine plans for a week${weekly ? '' : `: ${plannedPerWeek(R)} sessions a week from its ${trainDaysOf(R)} training days`}. Direct work counts 1 set, secondary involvement counts ${HELPER_CREDIT}. The shaded zone is your weekly target (editable in Settings).`,
    body: html`${volumeRows(pv)}${planEvidenceNote(pv)}`
  });
  return html`${slotted('program', [
    [null, head],
    [null, libBtn],
    ['routine', routineSec],
    [null, clutter],
    ['library', libSec],
    ['schedule', schedSec],
    ['days', daysSec],
    ['pvol', pvolSec]
  ])}${tabFoot('program')}`;
}

/* ---------- the library page ---------- */

function libCards(): TemplateResult {
  const list = libFiltered(ui.libQ, ui.libM, ui.libE, ui.libKind);
  if (!list.length)
    return html`<div class="card"><p style="margin:0">No exercises match. Clear the filters or create a new exercise.</p></div>`;
  return html`<div class="card">${list.map(
    e => html`<div class="hitem"><div class="row spread" style="align-items:flex-start;flex-wrap:nowrap"><div style="min-width:0"><b>${e.name}</b>${e.note ? html` ${tipButton(e.note, 'About ' + e.name)}` : nothing}<p class="small muted" style="margin:2px 0 0">${ML[e.primary]}${e.secondary.length ? ', plus ' + e.secondary.map(m => ML[m]).join(', ') : ''}</p></div><div class="row" style="flex:none;gap:4px"><button class="btn sm" data-act="exEdit" data-ex=${e.id}>Edit</button><button class="ib sm" data-act="exDel" data-ex=${e.id} aria-label=${`Delete ${e.name}`}>✕</button></div></div>
    <p class="small" style="margin:6px 0 0;display:flex;flex-wrap:wrap;gap:4px">${exTagParts(e, ui.libKind)}<span class="tag">${EQL[e.equip] || e.equip}</span>${e.custom ? html`<span class="tag blue">Custom</span>` : nothing}${e.bw ? html`<span class="tag">Bodyweight + load</span>` : nothing}<span class="tag">${loadWords(e)}</span>${e.perSide ? html`<span class="tag">Reps per side</span>` : nothing}${e.timed ? html`<span class="tag">Timed</span>` : nothing}${e.maxLoad != null ? html`<span class="tag">Max ${fmtW(e.maxLoad)} ${U()}</span>` : nothing}</p></div>`
  )}</div>`;
}

/** The exercise library, a page of Plan: every exercise, searchable and filtered, each editable. */
export function viewLibrary(): TemplateResult {
  return html`${pageTitle('Plan', 'Exercise library', `${state.exercises.filter(e => !e.archived).length} exercises, all editable`, html`<button class="btn sm" data-act="planBack">← Plan</button><button class="btn sm primary" data-act="exNew">New exercise</button>`)}
  <div class="card stack"><input type="search" placeholder="Search exercises" aria-label="Search exercises" data-bind="libQ" .value=${fieldValue(ui.libQ)}>
  <div class="grid2"><select data-bind="libM" aria-label="Filter by muscle"><option value="" .selected=${live(!ui.libM)}>All muscles</option>${MUSCLES.map(([k, l]) => html`<option value=${k} .selected=${live(ui.libM === k)}>${l}</option>`)}</select>
  <select data-bind="libE" aria-label="Filter by equipment"><option value="" .selected=${live(!ui.libE)}>All equipment</option>${EQUIP.map(([k, l]) => html`<option value=${k} .selected=${live(ui.libE === k)}>${l}</option>`)}</select></div>
  <div class="row" style="gap:6px;align-items:center"><div class="chips" role="group" aria-label="Show">${(
    [
      ['', 'All'],
      ['common', 'Most common'],
      ['rare', 'Less common']
    ] as const
  ).map(
    ([k, l]) =>
      html`<button class=${ui.libKind === k ? 'chip on' : 'chip '} data-act="libKind" data-v=${k} aria-pressed=${String(ui.libKind === k)}>${l}</button>`
  )}</div>${tipButton(COMMON_TIP, 'About Most common and Less common')}</div></div>
  <div id="libList">${libCards()}</div>`;
}

/* ---------- what Plan does ---------- */

/** The element a tap came from, as the page's dispatch hands it (data-act). */
type Tap = { dataset: DOMStringMap };
const num = (v: string | undefined): number => +(v ?? NaN);

/** Plan's actions, by the data-act their buttons carry; the page's action table takes them in. */
export const PLAN_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  toggleItem(t) {
    ui.openItem = ui.openItem === t.dataset.uid ? null : t.dataset.uid;
    fx.rerenderKeepScroll();
  },
  iUp(t) {
    const d = curRoutineB().days[num(t.dataset.day)];
    if (!d) return;
    act(() => move(d.items, num(t.dataset.i), num(t.dataset.i) - 1));
    fx.rerenderKeepScroll();
  },
  iDown(t) {
    const d = curRoutineB().days[num(t.dataset.day)];
    if (!d) return;
    act(() => move(d.items, num(t.dataset.i), num(t.dataset.i) + 1));
    fx.rerenderKeepScroll();
  },
  iDel(t) {
    const d = curRoutineB().days[num(t.dataset.day)];
    if (!d) return;
    let gone: PlanItem | undefined;
    act(
      () => {
        [gone] = d.items.splice(num(t.dataset.i), 1);
      },
      { undo: true }
    );
    fx.rerenderKeepScroll();
    if (gone) fx.toast(`${exName(gone.exId)} removed`, true);
  },
  libAdd(t) {
    const R = curRoutineB();
    const d = R.days[ui.bTarget];
    const exId = t.dataset.ex;
    if (!d || !exId) return;
    act(() => {
      d.items.push(newItem(exId));
      Object.assign(d, trainOn(d));
    });
    fx.rerenderKeepScroll();
    fx.toast(`Added to ${dayLabel(R, ui.bTarget)}`);
  },
  rActive() {
    const id = ui.bRoutine;
    if (typeof id !== 'string') return;
    act(() => {
      state.activeRoutineId = id;
    });
    ui.todayDay = null;
    fx.render();
    fx.toast('Active routine changed');
  },
  rClean() {
    const c = routineClutter();
    if (!c.length) return;
    fx.confirm(
      `Remove ${c.length} routine${c.length > 1 ? 's' : ''}?`,
      `${c.map(r => r.name).join(', ')}. ${c.every(plainTemplate) ? 'Ready-made ones can be added again from New from a template.' : `Any you changed stay under Recently deleted in History for ${TRASH_DAYS} days.`}`,
      'Remove',
      () => {
        let n = 0;
        const done = act(
          () => {
            const cc = routineClutter();
            n = cc.length;
            const ids = new Set(cc.map(r => r.id));
            for (const r of cc) toTrash('routine', r);
            state.routines = state.routines.filter(r => !ids.has(r.id));
          },
          { check: () => routineClutter().length > 0, undo: true }
        );
        if (!done) return;
        if (!state.routines.find(r => r.id === ui.bRoutine)) ui.bRoutine = state.activeRoutineId;
        fx.render();
        fx.toast(`${n} routine${n > 1 ? 's' : ''} removed`, true);
      },
      true
    );
  },
  rDup() {
    const src = curRoutineB();
    // A deep copy, fields this build does not know included, with new ids throughout.
    const r = structuredClone(src);
    r.id = uid();
    r.name = src.name + ' (copy)';
    for (const d of r.days) {
      d.id = uid();
      for (const it of d.items) it.uid = uid();
    }
    act(() => {
      state.routines.push(r);
    });
    ui.bRoutine = r.id;
    fx.render();
  },
  rDel() {
    const R = curRoutineB();
    if (state.routines.length < 2) return;
    fx.confirm(
      'Delete routine?',
      `"${R.name}" will be removed. Logged sessions are kept${plainTemplate(R) ? '; it can be added again from New from a template.' : `, and the routine stays under Recently deleted in History for ${TRASH_DAYS} days.`}`,
      'Delete routine',
      () => {
        const done = act(
          () => {
            const Rn = state.routines.find(r => r.id === R.id);
            if (Rn) toTrash('routine', Rn);
            state.routines = state.routines.filter(r => r.id !== R.id);
            const first = state.routines[0];
            if (state.activeRoutineId === R.id && first) state.activeRoutineId = first.id;
          },
          { check: () => !!state.routines.find(r => r.id === R.id) && state.routines.length >= 2, undo: true }
        );
        if (!done) {
          fx.rerenderKeepScroll();
          return;
        }
        ui.bRoutine = state.activeRoutineId;
        fx.render();
        fx.toast('Routine deleted', true);
      },
      true
    );
  },
  dAdd() {
    const R = curRoutineB();
    if (R.schedule === 'weekly' || R.days.length >= MAX_DAYS) return;
    act(() => {
      R.days.push({ id: uid(), name: 'Training day', rest: false, items: [] });
    });
    ui.bTarget = R.days.length - 1;
    ui.dayFocus = undefined;
    fx.rerenderKeepScroll();
    fx.toast(`Day ${R.days.length} added`);
  },
  dAddRest() {
    const R = curRoutineB();
    if (R.schedule === 'weekly' || R.days.length >= MAX_DAYS) return;
    act(() => {
      R.days.push({ id: uid(), name: 'Rest', rest: true, items: [] });
    });
    fx.rerenderKeepScroll();
    fx.toast(`Day ${R.days.length} added as rest`);
  },
  dFold(t) {
    const R = curRoutineB();
    const id = t.dataset.id || '';
    const open = dayFocusId(R) === id;
    ui.dayFocus = open ? '' : id;
    if (!open) {
      const i = R.days.findIndex(d => d.id === id);
      if (i >= 0) ui.bTarget = i;
    }
    fx.rerenderKeepScroll();
    if (!open) {
      const el = document.querySelector(`.day[data-did="${CSS.escape(id)}"]`);
      if (el)
        try {
          el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        } catch (e) {
          // Scrolling is best effort: an old browser without the options object leaves the page where it is.
        }
    }
  },
  dUp(t) {
    const R = curRoutineB();
    const i = num(t.dataset.day);
    if (!(i >= 1)) return;
    act(() => move(R.days, i, i - 1));
    ui.todayDay = null;
    fx.rerenderKeepScroll();
  },
  dDown(t) {
    const R = curRoutineB();
    const i = num(t.dataset.day);
    if (!(i < R.days.length - 1)) return;
    act(() => move(R.days, i, i + 1));
    ui.todayDay = null;
    fx.rerenderKeepScroll();
  },
  dDel(t) {
    const R = curRoutineB();
    const i = num(t.dataset.day);
    if (R.schedule === 'weekly') return;
    if (R.days.length < 2) {
      fx.toast('A cycle needs at least one day');
      return;
    }
    const d = R.days[i];
    if (!d) return;
    const rid = R.id,
      did = d.id;
    /* Read again by id when confirmed: a sync while the question is open
       replaces the log, and changing the old objects would be lost. */
    const go = (): void => {
      const R2 = state.routines.find(r => r.id === rid);
      const j = R2 ? R2.days.findIndex(x => x.id === did) : -1;
      if (!R2 || j < 0 || R2.days.length < 2) {
        fx.toast('That day changed on another device. Nothing was removed.');
        fx.rerenderKeepScroll();
        return;
      }
      act(() => R2.days.splice(j, 1), { undo: true });
      if (ui.bTarget >= R2.days.length) ui.bTarget = R2.days.length - 1;
      ui.todayDay = null;
      fx.rerenderKeepScroll();
      fx.toast(`${d.name} removed`, true);
    };
    if (d.items.length)
      fx.confirm(
        'Remove this day?',
        `${dayLabel(R, i)}: ${d.name} and its ${d.items.length} exercise${d.items.length > 1 ? 's' : ''} will be removed from the routine. Sessions you already logged are not affected.`,
        'Remove day',
        go,
        true
      );
    else go();
  },
  ssToggle(t) {
    const f = findItem(t.dataset.uid);
    if (!f) return;
    const day = f.r.days[f.di];
    if (!day) return;
    // linkToggle changes the items only when a link can be made or undone, so the change is checked for first.
    let changed = false;
    act(() => {
      changed = linkToggle(day.items, f.i, x => x);
    });
    if (changed) fx.rerenderKeepScroll();
  },
  exDel(t) {
    const id = t.dataset.ex || '';
    const e = EX(id);
    const used =
      state.routines.some(r => r.days.some(d => d.items.some(i => i.exId === id))) ||
      state.sessions.some(s => s.ex.some(b => b.exId === id)) ||
      (!!state.draft && state.draft.ex.some(b => b.exId === id));
    fx.confirm(
      'Delete exercise?',
      used
        ? `${e.name} is used in your routines or history. It will be hidden from the library, and past data stays intact.`
        : `${e.name} will be removed.`,
      'Delete',
      () => {
        const done = act(
          () => {
            const cur = state.exercises.find(x => x.id === id);
            if (!cur) return;
            if (used) cur.archived = true;
            else {
              state.exercises = state.exercises.filter(x => x.id !== id);
              // Built-ins are added again from the library on every load, so without this the deletion reversed itself on the next reload.
              if (!e.custom && !state.settings.removedLib.includes(id)) state.settings.removedLib.push(id);
            }
          },
          { check: () => state.exercises.some(x => x.id === id), undo: true }
        );
        fx.rerenderKeepScroll();
        if (done) fx.toast('Exercise deleted', true);
      },
      true
    );
  },
  libKind(t) {
    const v = t.dataset.v || '';
    if (!['', 'common', 'rare'].includes(v)) return;
    ui.libKind = v;
    fx.rerenderKeepScroll();
  },
  planLib() {
    ui.planView = 'library';
    window.scrollTo(0, 0);
    fx.render();
  },
  planBack() {
    ui.planView = 'routine';
    window.scrollTo(0, 0);
    fx.render();
  }
};

/* ---------- Plan's fields ---------- */

/** What a field holds: a box's tick, or the text or option picked. */
type Field = HTMLInputElement | HTMLSelectElement;
const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

/* An exercise's numbers, typed (data-it): each keystroke that reads as a
   number is kept, within what the engine reads (1 to 30 sets, reps or
   seconds 1 to 600, rest up to 30 minutes, a load step up to 500, a jump up
   to 20%), and saved when the typing pauses. A load step is the exercise's
   own, on every day and routine. An empty jump goes back to automatic. */
function itemInput(t: Field): void {
  const f = findItem(t.dataset.uid);
  if (!f) return;
  const k = t.dataset.it;
  if (k === 'jump' && !String(t.value).trim()) {
    act(
      () => {
        delete f.it.jump;
      },
      { soon: true }
    );
    return;
  }
  const n = numIn(t.value);
  if (n == null) return;
  act(
    () => {
      if (k === 'jump') f.it.jump = r1(clamp(n, 0, LIMITS.jumpPct));
      else if (k === 'inc') {
        const e = state.exercises.find(x => x.id === f.it.exId);
        // fromD gives null only for no number, and n is one. Within the step's bound in kilograms, the one a save keeps (r61; until then 500 in the unit typed).
        const v = Math.min(fromD(Math.max(n, 0)) ?? 0, LIMITS.step);
        f.it.inc = v;
        if (e) e.inc = v > 0 ? v : null;
      } else if (k === 'rir') f.it.rir = clamp(effIn(n), 0, EFFORT_TOP);
      else if (k === 'sets') f.it.sets = clamp(Math.round(n), 1, LIMITS.sets);
      else if (k === 'rest') f.it.rest = clamp(Math.round(n), 0, LIMITS.restS);
      else if (k === 'repMin') f.it.repMin = clamp(Math.round(n), 1, LIMITS.repRange);
      else if (k === 'repMax') f.it.repMax = clamp(Math.round(n), 1, LIMITS.repRange);
    },
    { soon: true }
  );
}

/* Left (on change): never a minimum above the maximum (r30: the editor saved
   "1 x 12-10", which nothing can read). The field just changed wins: a
   minimum typed above the maximum raises it, a maximum typed below the
   minimum lowers it, so typing 12 then 15 into a 6 to 10 range gives 12 to
   15. A change other than the sets is carried into a workout in progress
   (syncDraftPlan), and a load step into the session's loads (refreshEx). */
function itemChange(t: Field): void {
  const f = findItem(t.dataset.uid);
  const k = t.dataset.it;
  let range = '';
  act(() => {
    if (!f) return;
    if ((k === 'repMin' || k === 'repMax') && +f.it.repMin > +f.it.repMax) {
      if (k === 'repMin') f.it.repMax = f.it.repMin;
      else f.it.repMin = f.it.repMax;
      range = repSpan(f.it.repMin, f.it.repMax, '-');
    }
    if (k !== 'sets') {
      // The caches go first, so the workout in progress reads the plan as it now is.
      invalidate();
      fx.syncDraftPlan(f);
      if (k === 'inc') fx.refreshEx(f.it.exId);
    }
  });
  if (range) fx.toast(`Range set to ${range}`);
  fx.rerenderKeepScroll();
}

/** A field on Plan typed in (the input event): whether it was one of Plan's. */
export function planInput(t: Field): boolean {
  if (t.dataset.it) {
    itemInput(t);
    return true;
  }
  if (t.dataset.dayname != null) {
    const d = curRoutineB().days[num(t.dataset.dayname)];
    if (d)
      act(
        () => {
          d.name = t.value;
        },
        { soon: true }
      );
    return true;
  }
  const b = t.dataset.bind;
  if (b === 'routineName') {
    const R = curRoutineB();
    act(
      () => {
        R.name = t.value;
      },
      { soon: true }
    );
    return true;
  }
  // The searches draw the lists again as each letter is typed; the field, drawn in place, keeps its text and focus.
  if (b === 'libQ' || b === 'bLibQ') {
    ui[b] = t.value;
    fx.rerenderKeepScroll();
    return true;
  }
  return false;
}

/** A field on Plan left or picked (the change event), other than by data-bind: whether it was one of Plan's. */
export function planChange(t: Field): boolean {
  if (t.dataset.it) {
    itemChange(t);
    return true;
  }
  if (t.dataset.dayname != null) {
    const d = curRoutineB().days[num(t.dataset.dayname)];
    if (d)
      act(() => {
        d.name = t.value;
      });
    fx.rerenderKeepScroll();
    return true;
  }
  if (t.dataset.dayrest != null) {
    const d = curRoutineB().days[num(t.dataset.dayrest)];
    if (!d) return true;
    const on = t instanceof HTMLInputElement && t.checked;
    act(
      () => {
        d.rest = on;
      },
      { undo: true }
    );
    fx.rerenderKeepScroll();
    fx.toast(
      on
        ? `${d.name || 'Day'} is now a rest day. Its exercises are kept.`
        : `${d.name || 'Day'} is a training day again`,
      true
    );
    return true;
  }
  if (t.dataset.moveto) {
    const f = findItem(t.dataset.moveto);
    if (!f) return true;
    const to = +t.value;
    const from = f.r.days[f.di];
    const dest = f.r.days[to];
    if (to === f.di || !from || !dest) return true;
    act(() => {
      from.items.splice(f.i, 1);
      dest.items.push(f.it);
      Object.assign(dest, trainOn(dest));
    });
    fx.rerenderKeepScroll();
    fx.toast(`Moved to ${dayLabel(f.r, to)}`);
    return true;
  }
  return false;
}

/** Plan's fields with a data-bind, read on change; each change to the log through `act`. */
export const PLAN_BINDS: Readonly<Record<string, (t: Field) => void>> = {
  bRoutine(t) {
    ui.bRoutine = t.value;
    ui.openItem = null;
    fx.render();
  },
  routineName(t) {
    const R = curRoutineB();
    act(() => {
      R.name = t.value;
      if (!R.name.trim()) R.name = 'Routine';
    });
    if (nameTaken(R.name, R.id)) fx.toast('Another routine has the same name');
    fx.render();
  },
  rSchedule(t) {
    const R = curRoutineB();
    const v = t.value === 'weekly' ? 'weekly' : 'cycle';
    if (v === R.schedule) return;
    if (v === 'weekly' && R.days.length > WEEK_DAYS) {
      fx.toast(`Fixed weekdays needs exactly ${WEEK_DAYS} days. Remove ${R.days.length - WEEK_DAYS} first.`);
      fx.rerenderKeepScroll();
      return;
    }
    act(
      () => {
        if (v === 'weekly')
          while (R.days.length < WEEK_DAYS) R.days.push({ id: uid(), name: 'Rest', rest: true, items: [] });
        R.schedule = v;
      },
      { undo: true }
    );
    ui.todayDay = null;
    fx.rerenderKeepScroll();
    fx.toast(v === 'weekly' ? 'Days are now pinned to Monday to Sunday' : 'Days are now a numbered cycle', true);
  },
  bLibM(t) {
    ui.bLibM = t.value;
    fx.rerenderKeepScroll();
  },
  bTarget(t) {
    ui.bTarget = +t.value;
    ui.dayFocus = undefined;
    fx.rerenderKeepScroll();
  },
  libM(t) {
    ui.libM = t.value;
    fx.rerenderKeepScroll();
  },
  libE(t) {
    ui.libE = t.value;
    fx.rerenderKeepScroll();
  }
};

/* ---------- drags ---------- */

/** What Sortable says when a drag ends: the lists it left and reached, the element, the copy a copying list keeps, and the places. */
export interface DragEnd {
  from: HTMLElement;
  to: HTMLElement;
  item: HTMLElement;
  clone?: HTMLElement | null | undefined;
  oldIndex?: number | undefined;
  newIndex?: number | undefined;
}

/* Each drag puts the element back where lit-html drew it (dragDrop, after
   Sortable has finished with the drop and in one task, so the old order is
   never painted), then changes the log and draws Plan, which moves it. */
const after = (f: () => void): void => {
  setTimeout(() => {
    dragDrop();
    f();
    fx.rerenderKeepScroll();
  }, 0);
};

/** An exercise dragged by its ⠿, within a day or to another (a ul.items list). */
export function dropItem(evt: DragEnd): void {
  const from = num(evt.from.dataset.day),
    to = num(evt.to.dataset.day);
  const oi = evt.oldIndex ?? -1,
    ni = evt.newIndex ?? -1;
  if (from === to && oi === ni) {
    dragDrop();
    return;
  }
  after(() => {
    if (evt.to.id === 'bLib' || isNaN(to)) return;
    const R = curRoutineB();
    const a = R.days[from],
      b = R.days[to];
    if (!a || !b || !a.items[oi]) return;
    act(() => {
      const [it] = a.items.splice(oi, 1);
      if (it) {
        b.items.splice(ni, 0, it);
        Object.assign(b, trainOn(b));
      }
    });
  });
}

/** A day dragged by the ⠿ beside its number, in a numbered cycle (#dayList). */
export function dropDay(evt: DragEnd): void {
  const oi = evt.oldIndex ?? -1,
    ni = evt.newIndex ?? -1;
  if (oi === ni) {
    dragDrop();
    return;
  }
  after(() => {
    const R = curRoutineB();
    if (!R.days[oi] || ni < 0 || ni >= R.days.length) return;
    act(() => move(R.days, oi, ni));
    ui.todayDay = null;
    ui.bTarget = 0;
    const d = R.days[ni];
    fx.toast(`${(d && d.name) || 'Day'} is now ${dayLabel(R, ni)}`);
  });
}

/** An exercise dragged from Add exercises' list into a day: a new item there, the list left as it was. */
export function dropLib(evt: DragEnd): void {
  if (evt.to === evt.from) {
    dragDrop();
    return;
  }
  // The copy Sortable leaves in the library list is not one lit-html drew.
  if (evt.clone && evt.clone !== evt.item) evt.clone.remove();
  const to = num(evt.to.dataset.day);
  const exId = evt.item.dataset.ex;
  const ni = evt.newIndex ?? 0;
  after(() => {
    const R = curRoutineB();
    const d = R.days[to];
    if (isNaN(to) || !exId || !d) return;
    act(() => {
      d.items.splice(ni, 0, newItem(exId));
      Object.assign(d, trainOn(d));
    });
    fx.toast(`${exName(exId)} added to ${dayLabel(R, to)}`);
  });
}

/** A day moved by the arrow keys on its ⠿ (a numbered cycle); the ⠿ keeps the focus in the day's new place. */
export function dayKey(dg: HTMLElement, up: boolean): void {
  const R = curRoutineB();
  const i = num(dg.dataset.di);
  const j = i + (up ? -1 : 1);
  if (R.schedule === 'weekly' || !R.days[i] || j < 0 || j >= R.days.length) return;
  act(() => move(R.days, i, j));
  ui.todayDay = null;
  ui.bTarget = 0;
  fx.rerenderKeepScroll();
  const n = document.querySelector<HTMLElement>(`.dgrip[data-di="${j}"]`);
  if (n) n.focus();
  const d = R.days[j];
  fx.toast(`${(d && d.name) || 'Day'} is now ${dayLabel(R, j)}`);
}
