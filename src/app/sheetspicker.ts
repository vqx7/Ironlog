/* The sheets that choose (r62, PENDING 355): Pick for me before a session
   and inside one, Limited equipment, Short on time, and the exercise
   picker. The picker adds to a session or a routine's
   day, or swap one in, with a search and a muscle to narrow it. With
   neither, the list leads with the rest of today's plan and the lifts
   logged last, then the most common lifts and all the others; with them,
   the matches, common ones first, and a swap's closest matches above its
   muscle's list. Drawn by lit-html as src/24-sheets.js drew it (tests/r62.js
   holds it to r61's), and answered by the legacy script's actions by their
   data-act until those move (r63). A search typed redraws the list in
   place, so the field keeps the focus and the keyboard. */

import { html } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { EQL, EQUIP, ML, MUSCLES, commonFirst, isCommon } from './library';
import {
  EX,
  activeRoutine,
  dayReasons,
  eqPlan,
  exName,
  exReasons,
  pace,
  rankDays,
  rankExercises,
  recentExIds,
  swapCands
} from './live';
import { dayLabel } from './routines';
import { estMin, min5, repSpan } from './format';
import { setSecs, setupSecs } from './formulas';
import { MINUTE_S, today } from './util';
import { remainMin, shortPlan } from './worksets';
import { tipButton } from './view';
import { curRoutineB, findItem, libFiltered, sessionsOn } from './display';
import { exTagParts } from './plan';
import type { ExerciseLike } from './model';
import { state } from './store';
import { closeX } from './sheetsmisc';
import type { PickerSheet } from './modals';

/** The lifts logged last the picker lists, newest first. */
const RECENT_PICKS = 8;
/** The closest matches a swap's muscle list leads with. */
const SWAP_PICKS = 3;
/** The days of the routine Pick for me shows, best first. */
const DAY_PICKS = 3;
/** How ready a day's main muscles are, from 0 to 1 (rankDays' ready): under 0.5 Pick for me says a rest day is the better call, and under 0.85 it offers Start lighter. Conventions (docs/EVIDENCE.md). */
const READY = { rest: 0.5, lighter: 0.85 } as const;
/** The minutes Short on time offers. */
const SHORT_CHOICES = [15, 20, 30, 45, 60, 75] as const;

/** The lifts already where the picker adds, and the tag that says so. */
function pickerUsed(m: PickerSheet): { set: Set<string>; label: string } {
  if (m.mode === 'addBlock' || m.mode === 'swapBlock')
    return { set: new Set(state.draft ? state.draft.ex.map(b => b.exId) : []), label: 'In session' };
  if (m.mode === 'addDay') {
    const R = curRoutineB();
    const d = m.day != null ? R.days[m.day] : undefined;
    return { set: new Set(d ? d.items.map(i => i.exId) : []), label: 'In this day' };
  }
  if (m.mode === 'swapItem') {
    const f = findItem(m.uid);
    const day = f && f.r.days[f.di];
    return { set: new Set(day ? day.items.map(i => i.exId) : []), label: 'In this day' };
  }
  return { set: new Set(), label: '' };
}

/* One lift in the list: its name, muscle and equipment, and its tags: where
   it is already, and Most common and Less common (under the Most common
   heading the tag on every row would only repeat it, so only Less common). */
function pickRow(e: ExerciseLike, used: { set: Set<string>; label: string }, grouped?: boolean): TemplateResult {
  return html`<button class="pick" data-act="pickDo" data-ex=${e.id}><span style="min-width:0"><b>${e.name}</b><br><span class="small muted">${ML[e.primary]}, ${EQL[e.equip] || e.equip}</span></span><span class="tags">${used.set.has(e.id) ? html`<span class="tag blue">${used.label}</span>` : ''}${grouped ? (e.rare ? html`<span class="tag rare">Less common</span>` : '') : exTagParts(e)}</span></button>`;
}

/** The picker's list for its search and muscle. */
function pickerBody(m: PickerSheet): TemplateResult {
  const used = pickerUsed(m);
  const row = (e: ExerciseLike): TemplateResult => pickRow(e, used);
  const grp = (t: string): TemplateResult => html`<p class="pick-grp">${t}</p>`;
  const q = (m.q || '').trim();
  const d = state.draft;
  const sb = m.mode === 'swapBlock' && d && m.b != null ? d.ex[m.b] : undefined;
  const fi = m.mode === 'swapItem' ? findItem(m.uid) : null;
  const swapId = sb ? sb.exId : fi ? fi.it.exId : null;
  if (q || m.m) {
    const list = commonFirst(libFiltered(m.q, m.m || '', '', false));
    const parts: (TemplateResult | TemplateResult[])[] = [];
    if (!q && swapId && m.m === EX(swapId).primary) {
      const best = swapCands(swapId, null, used.set)
        .slice(0, SWAP_PICKS)
        .map(x => x.e);
      if (best.length) parts.push(grp('Closest matches'), best.map(row), grp(`All ${ML[m.m]}`));
    }
    parts.push(list.length ? list.map(row) : html`<p class="muted">No matches.</p>`);
    if (q && !list.some(e => e.name.trim().toLowerCase() === q.toLowerCase()))
      parts.push(
        html`<button class="pick new" data-act="exNewFromPicker"><span><b>+ Create “${q}”</b><br><span class="small muted">A new exercise with this name${m.mode === 'addBlock' ? ', added to this session' : m.mode === 'addDay' ? ', added to this day' : ''}</span></span></button>`
      );
    return html`${parts}`;
  }
  const all = libFiltered('', '', '', false);
  const parts: (TemplateResult | TemplateResult[])[] = [];
  if (m.mode === 'addBlock' && d && d.dayId) {
    const R = state.routines.find(r => r.id === d.routineId);
    const day = R && R.days.find(x => x.id === d.dayId);
    const left = day ? day.items.map(i => EX(i.exId)).filter(e => !e.archived && !used.set.has(e.id)) : [];
    if (left.length) parts.push(grp("From today's plan"), left.map(row));
  }
  const rec = recentExIds(RECENT_PICKS).map(id => EX(id));
  if (rec.length) parts.push(grp('Recent'), rec.map(row));
  const com = all.filter(isCommon),
    rest = all.filter(e => !isCommon(e));
  if (com.length)
    parts.push(
      grp(`Most common (${com.length})`),
      com.map(e => pickRow(e, used, true))
    );
  parts.push(grp(com.length ? `All other exercises (${rest.length})` : `All exercises (${all.length})`), rest.map(row));
  return html`${parts}`;
}

/** The exercise picker sheet: its search, its muscle, New exercise and Pick for me, and the list. */
export function pickerSheet(m: PickerSheet): TemplateResult {
  const d = state.draft;
  return html`<div class="sheet fixed" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${m.title}</h3>${closeX()}</div>
    <div class="grid2"><input type="search" placeholder="Search" data-mbind="q" value=${m.q || ''} id="pickQ" enterkeyhint="search" autocomplete="off"><select data-mbind="m" aria-label="Muscle"><option value="">All muscles</option>${MUSCLES.map(([k, l]) => html`<option value=${k} ?selected=${m.m === k}>${l}</option>`)}</select></div>
    <div class="row" style="margin-top:8px"><button class="btn sm" data-act="exNewFromPicker">+ New exercise</button>${m.mode === 'addBlock' && d && !d.editingId ? html`<button class="btn sm" data-act="pickEx">Pick for me</button>` : ''}</div>
    <div class="sheet-scroll" id="pickList">${pickerBody(m)}</div></div>`;
}

/* ---------- Pick for me, before a session ---------- */

/** Pick for me before a session: the routine's days that fit today best, each with why, to start, start lighter or preview. */
export function pickTodaySheet(): TemplateResult {
  const rk = rankDays();
  const top = rk.rows.slice(0, DAY_PICKS);
  const plan = rk.rows.find(x => x.plan);
  const best = top[0];
  let lead: TemplateResult | string = '';
  if (!best)
    lead = html`<p class="small">Your active routine has no training days with exercises. Start a freestyle session and use Pick for me inside it.</p>`;
  else if (best.ready < READY.rest)
    lead = html`<p class="callout yellow" style="margin:0">Everything your routine has left leans on muscles still recovering from the last few days. A rest day, or easy cardio and mobility, is the better call. If you train anyway, the first option is the least fatigued.</p>`;
  else if (best.plan)
    lead = html`<p class="small" style="margin:0">Stick with the plan: it is also the best fit for today.</p>`;
  else if (plan)
    lead = html`<p class="small" style="margin:0">${best.day.name} fits today better than ${plan.day.name}, next in your plan: ${plan.ready < 1 ? `${plan.day.name} leans on muscles that may still be recovering.` : 'it trains what is furthest behind this week.'} ${tipButton('Starting it moves your cycle on from there, the same as choosing it under Change day.', 'About the cycle')}</p>`;
  const sameDay = sessionsOn(today()).length > 0;
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Pick for me</h3>${closeX()}</div>
    ${lead}${sameDay ? html`<p class="small muted" style="margin:8px 0 0">Includes the session you logged today.</p>` : ''}${rk.deload ? html`<p class="small muted" style="margin:8px 0 0">Deload week: counted at half the sets.</p>` : ''}
    ${top.map(
      (
        x,
        k
      ) => html`<div class=${'pcard' + (k === 0 ? ' best' : '')}><div class="row spread"><b>${dayLabel(rk.R, x.i)}: ${x.day.name}</b>${k === 0 ? html`<span class="tag green">Best fit</span>` : ''}</div>
      <ul>${dayReasons(x, rk.r7).map(r => html`<li>${r}</li>`)}</ul>
      <div class="row" style="margin-top:8px"><button class=${'btn sm ' + (k === 0 ? 'primary' : '')} data-act="startSession" data-day=${String(x.i)}>Start</button>${!rk.deload && x.ready < READY.lighter ? html`<button class="btn sm" data-act="startSession" data-day=${String(x.i)} data-light="1">Start lighter</button>` : ''}<button class="btn sm" data-act="pickView" data-day=${String(x.i)}>Preview</button></div></div>`
    )}
    <p class="small muted hastip" style="margin:10px 0 0" data-tip="Ranked by what each muscle got in the last 7 days against your targets, how recently it was trained hard (about 1 to 3 days, more after failure sets, new lifts, or heavy hinges), injuries, and your cycle order. A ranking, not a rule: how you feel wins.">How this is ranked</p></div>`;
}

/* ---------- Pick for me, inside a session ---------- */

/** Pick for me inside a session: the exercises to add next, each with its sets, minutes and why; null once the session is gone. */
export function pickExSheet(): TemplateResult | null {
  const d = state.draft;
  if (!d) return null;
  const picks = rankExercises(d);
  const allMet = picks.length && picks.every(x => x.def <= 0);
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Pick for me</h3>${closeX()}</div>
    <p class="small muted hastip" style="margin:0" data-tip="From this session so far, your last 7 days against your targets, recovery, injuries, and your trends.">What to add next.</p>
    ${allMet ? html`<p class="callout green" style="margin:8px 0 0">Every muscle is at or above target for the last 7 days. Anything more is optional.</p>` : ''}
    ${
      picks.length
        ? picks.map((x, k) => {
            const p = x.plan;
            const ex = x.e;
            const mins = Math.round(
              ((p.sets * (setSecs(ex, p) + (+p.rest || 0)) + setupSecs(ex, 2)) * pace()) / MINUTE_S
            );
            return html`<div class=${'pcard' + (k === 0 ? ' best' : '')}><div class="row spread" style="flex-wrap:nowrap;align-items:flex-start"><span style="min-width:0"><b>${ex.name}</b><br><span class="small muted">${p.sets} × ${repSpan(p.repMin, p.repMax, '-')}${ex.timed ? 's' : ''}${ex.perSide ? ' per side' : ''} · ${estMin(mins)}</span></span>${k === 0 ? html`<span class="tag green">Best fit</span>` : ''}</div>
      <ul>${exReasons(x).map(r => html`<li>${r}</li>`)}</ul>
      <div class="row" style="margin-top:8px"><button class=${'btn sm ' + (k === 0 ? 'primary' : '')} data-act="pickExAdd" data-ex=${ex.id} data-sets=${String(p.sets)} data-full=${String(x.full)}>Add to session</button></div></div>`;
          })
        : html`<p class="small">Nothing in your library fits: every exercise is already in this session or loads an injury.</p>`
    }
    <div class="row" style="margin-top:10px"><button class="btn sm" data-act="pickSession">Browse all exercises</button></div></div>`;
}

/* ---------- Limited equipment ---------- */

/* A fixed-height sheet with the chips at the top (r30): the sheet grew
   upward as swaps were listed, so the chips moved under the finger and the
   next tap landed on the wrong one. */
/** Limited equipment for a day: the equipment on, each exercise's swap, and Start; null when the day is gone. */
export function eqSheet(m: { day: number; equip: readonly string[] }): TemplateResult | null {
  const R = activeRoutine();
  const day = R.days[m.day];
  if (!day) return null;
  const eq = new Set(m.equip);
  const pl = eqPlan(day, eq);
  const sw = pl.filter(x => x.from);
  return html`<div class="sheet fixed" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Limited equipment</h3>${closeX()}</div>
    <p class="small muted" style="margin:0 0 8px">Turn off what this gym lacks. Each affected exercise is swapped for the closest same-muscle match.</p>
    <div class="chips">${EQUIP.map(([k, l]) => html`<button class=${'chip ' + (eq.has(k) ? 'on' : '')} data-act="eqToggle" data-k=${k} aria-pressed=${String(eq.has(k))}>${l}</button>`)}</div>
    <div class="sheet-scroll">${sw.length ? html`<ul class="eqsw">${sw.map(x => html`<li>${exName(x.from || '')} → ${x.to ? html`<b>${exName(x.to)}</b>${x.hard ? html`<br><span class="small" style="color:var(--yellow)">Much harder than what it replaces: aim for 3 to 6 reps, use a band or a shorter range, and stop 2 reps short.</span>` : ''}` : html`<span class="muted">no match with this equipment, left out</span>`}</li>`)}</ul>` : html`<p class="small" style="margin:10px 0 0">Everything in this workout fits the equipment on.</p>`}
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="eqStart" ?disabled=${!pl.some(x => x.to)}>Start ${day.name}</button><button class="btn" data-act="mClose">Cancel</button></div>
    <p class="small muted" style="margin:8px 0 0">Sets, reps, and rest as planned (a much harder swap gets 3 to 6 reps); swaps are for this session only.</p></div></div>`;
}

/* ---------- Short on time ---------- */

/** Short on time: the minutes there are, what the trim changes, and the minutes after; null once the session is gone. */
export function shortSheet(m: { mins?: number | null | undefined }): TemplateResult | null {
  const d = state.draft;
  if (!d) return null;
  const left = remainMin(d);
  const pl = m.mins ? shortPlan(d, m.mins) : null;
  const body = !left
    ? html`<p class="small">Nothing is left to trim: every planned set is done.</p>`
    : !pl
      ? ''
      : pl.changes.length
        ? html`<ul class="short-list">${pl.changes.map(c => html`<li>${c}</li>`)}</ul><p class="small muted" style="margin:6px 0 0">${estMin(min5(pl.est))} after the change.${pl.over ? ' Still over, because exercises you have started are kept.' : ''} Done sets are never touched.</p>`
        : html`<p class="small">Everything left fits in ${m.mins} minutes as planned.</p>`;
  const trims = !!pl && pl.changes.length > 0;
  return html`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Short on time</h3>${closeX()}</div>
    ${
      left
        ? html`<p class="small muted" style="margin:0 0 8px">How long do you have? Planned: ${estMin(min5(left))}.</p>
    <div class="chips">${SHORT_CHOICES.map(v => html`<button class=${'chip ' + (m.mins === v ? 'on' : '')} data-act="shortPick" data-v=${String(v)} aria-pressed=${String(m.mins === v)}>${v} min</button>`)}</div>`
        : ''
    }
    ${body}
    <div class="row" style="margin-top:12px">${trims ? html`<button class="btn primary" data-act="shortApply">Trim the session</button>` : ''}<button class="btn" data-act="mClose">${trims ? 'Cancel' : 'Close'}</button></div>
    <p class="small muted hastip" style="margin:8px 0 0" data-tip="Kept longest: priority and lagging muscles, exercises you have started, and at least one exercise per muscle. The rest lose sets down to 2, then drop out, later exercises first. Trimmed work does not count against trends. Undo is in the message after.">What gets cut first</p></div>`;
}
