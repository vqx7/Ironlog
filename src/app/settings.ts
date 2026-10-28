/* Settings (r57, phase 5): every group, the account and sync lines of Your
   data, drawn by lit-html as src/23-history-settings.js and the account part
   of src/14-account.js drew them, and the actions and fields that change
   what it shows, each change to the log through `act`. What Settings opens
   or starts elsewhere is reached by the button's data-act through events.ts's
   table (r63; actsapp.ts, account.ts, importflow.ts, demo.ts, actslift.ts): the sheets (backup text, the save kept
   aside, diagnostics, the guide, reports, import), the backup files, Install,
   Undo, demo data's Load, the account's own actions (sign in, sign out,
   delete) and the fill-in choice for the session's rows (loadAsk). */

import { html, nothing } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { live } from 'lit-html/directives/live.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { APP_NAME, PREVIEW_NAME, VERSION_LINE } from './config';
import { act } from './act';
import { MK, ML, MUSCLES, TARGETED, TRACK_ONLY } from './library';
import {
  ACCENT0,
  ACCENTS,
  BW_EVERY,
  DEFAULT_HIDDEN,
  HIDEABLE,
  HIDEABLE_KEYS,
  HIDE_TABS,
  defaultOrder,
  BW_EVERY_DEFAULT,
  bwEveryKept
} from './layout';
import {
  FOCUS_MAX,
  PROF_DAYS,
  PROF_EXP,
  PROF_EXP_TIP,
  PROF_FOCUS_TIP,
  PROF_GOALS,
  PROF_GOAL_TIP,
  profClean
} from './profile';
import { dbListOf, gymClean, gymPlates } from './gym';
import { fmtDate, fmtG, stampShort } from './format';
import { CAL_WEEKS, CAL_MIN } from './analytics';
import { TRASH_DAYS, rec, LIMITS } from './records';
import { iso, numIn, numWord, r1, upFirst, MINUTE_S, SECOND_MS, HOUR_MIN, DAY_MIN } from './util';
import { stripDemo } from './chunks';
import { normalize } from './normalize';
import {
  ENV,
  asideClear,
  asideList,
  backupDue,
  demoRestore,
  device,
  logBuf,
  logClear,
  undoStack,
  unreadableForget,
  unreadableRaw,
  UNDO_DAYS
} from './storage';
import { cloudPull, cloudStop, cq, setCloud } from './sync';
import { AUTH, FB } from './providers';
import {
  EX,
  U,
  activeRoutine,
  appBand,
  barKg,
  calStats,
  defBand,
  fmtW,
  fromD,
  gymOf,
  hasTarget,
  invalidate,
  prof,
  profRule
} from './live';
import { acct, cloud, setState, state, ui } from './store';
import { effName, effShow, halfLbl, rirScale } from './effort';
import { canInstallHere, coarse, installKind, isStandalone } from './env';
import { drawScreen, fieldValue, howText, labelTip, pageTitle, placed, section, tabFoot, tipButton } from './view';
import type { Field } from './view';
import type { DbRack, Gym, MuscleKey, PlanItem, Profile, Routine } from './types';

/** The example dumbbell rack Your gym's fields show, per unit: from, to, a step, and a finer step up to a weight. */
const DB_EXAMPLE = {
  lb: { lo: 5, hi: 120, st: 5, fine: 2.5, fineTo: 25 },
  kg: { lo: 2, hi: 50, st: 2, fine: 1, fineTo: 10 }
} as const;
/** A dumbbell rack's weights listed in full up to RACK_LIST.whole, else the first RACK_LIST.head, an ellipsis and the last RACK_LIST.tail. */
const RACK_LIST = { whole: 9, head: 5, tail: 2 } as const;
/** The newest errors Settings lists. */
const LOG_SHOWN = 5;
/** How long the toast saying a focus kept a typed target stays, in milliseconds: long enough to read its two sentences. */
const KEPT_TOAST_MS = 8000;
import { HARD_RIR } from './formulas';
import { PROFILE_PLAN } from './routines';
import { SMALL_PLATE, DEFAULT_STEP } from './units';
import { DEMO_WEEKS } from './importing';
import { adjOn, refreshEx, syncDraftPlan, unitWords } from './worksets';
import { confirmBox, render, rerenderKeepScroll } from './page';
import { toast } from './toast';
import { primeAudio, stopTimer, timerRefresh, wakeOff, wakeOn } from './timer';

/* ---------- settings other screens read ---------- */

/** How often the weigh-in reminder asks, in days (0 never; BW_EVERY_DEFAULT when unset). */
export function bwEvery(): 0 | 7 | 14 | 30 {
  const v = bwEveryKept(state.settings.bwEvery);
  return v === undefined ? BW_EVERY_DEFAULT : v;
}

/** What the suggestions are and are not, in full: the tip on Your data's line, and the first page's. */
export const SAFETY_TXT = `${APP_NAME} works out suggested loads and reps from your own log with published formulas and the conventions stated in the Guide. They are estimates, not medical, physical therapy, or coaching advice, and they can be wrong. Use good technique, and safety bars or a spotter on heavy lifts. Stop on pain. Check with a doctor before starting or changing training, especially with an injury, a health condition, or a pregnancy. You train at your own risk.`;

/* ---------- Your training (r44) ---------- */

/** One routine item a profile's rules would change: its day, the item and the fields with their new values. */
interface ProfApply {
  di: number;
  it: PlanItem;
  ch: Partial<Pick<PlanItem, 'repMin' | 'repMax' | 'rir' | 'rest'>>;
}
/* Apply (V's answer 1): the profile's rules on the routine in use, only the
   fields a rule sets, on items where they differ. Rest is only raised, and a
   rest of 0 (no timer, on purpose) is left alone. Under a year, Apply only
   raises reps in reserve and keeps the routine's ranges: a ready-made
   routine's 5 x 5 or 10 to 15 was chosen on purpose, and 8 to 12 is where new
   exercises start (the r44 review). */
/** What Apply would change in a routine, item by item. */
export function profApplyList(R: Routine | null | undefined): ProfApply[] {
  const out: ProfApply[] = [];
  if (!R) return out;
  const nw = prof().exp === 'new';
  R.days.forEach((d, di) =>
    d.items.forEach(it => {
      const r = profRule(EX(it.exId));
      if (!r) return;
      const ch: ProfApply['ch'] = {};
      if (r.rest != null && +it.rest !== 0 && !(+it.rest >= r.rest)) ch.rest = r.rest;
      if (nw) {
        if (!(+it.rir >= r.rir)) ch.rir = r.rir;
      } else {
        if (it.repMin !== r.repMin) ch.repMin = r.repMin;
        if (it.repMax !== r.repMax) ch.repMax = r.repMax;
        if (it.rir !== r.rir) ch.rir = r.rir;
      }
      if (Object.keys(ch).length) out.push({ di, it, ch });
    })
  );
  return out;
}
/** What Apply changes, said in its question. */
function profApplyWhat(): string {
  const p = prof();
  const P = PROFILE_PLAN;
  const heavy = p.goal === 'both' ? P.both : P.strength;
  return p.exp === 'new'
    ? `Reps in reserve go up to ${P.first.rirCompound} on compounds and ${P.first.rirIsolation} on isolation; rep ranges stay.`
    : `Heavy compounds go to ${heavy.repMin} to ${heavy.repMax} reps, ${heavy.rir} in reserve, and at least ${heavy.rest / MINUTE_S} minutes' rest.`;
}
/** Moves the app's own weekly targets from the old profile's to the new one's, leaving a target the lifter typed; returns what moved, as copies. */
export function profMoveBands(
  oldP: Profile,
  newP: Profile
): Partial<Record<MuscleKey, [[number, number], [number, number]]>> {
  const b = state.settings.bands;
  const moved: Partial<Record<MuscleKey, [[number, number], [number, number]]>> = {};
  for (const m of MK) {
    if (TRACK_ONLY.has(m)) continue;
    const o = appBand(m, oldP);
    if (b[m][0] !== o[0] || b[m][1] !== o[1]) continue;
    const to = appBand(m, newP);
    if (b[m][0] === to[0] && b[m][1] === to[1]) continue;
    moved[m] = [
      [b[m][0], b[m][1]],
      [to[0], to[1]]
    ];
    b[m] = [to[0], to[1]];
  }
  return moved;
}

function profChips(
  k: string,
  opts: readonly (readonly [string | number, string])[],
  cur: string | number | undefined,
  label: string
): TemplateResult {
  return html`<div class="ob-units" role="group" aria-label=${label}>${opts.map(
    ([v, l]) =>
      html`<button class=${cur === v ? 'chip on' : 'chip'} data-act="profSet" data-k=${k} data-v=${String(v)} aria-pressed=${String(cur === v)}>${l}</button>`
  )}</div>
`;
}
/** Your training's three questions (goal, years lifting, days a week), in Settings and on a first run's routine templates. */
export function profFields(): TemplateResult {
  const p = prof();
  return html`<div>
<p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip=${PROF_GOAL_TIP}>Goal</span></p>
${profChips('goal', PROF_GOALS, p.goal, 'Goal')}</div>
<div>
<p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip=${PROF_EXP_TIP}>Years lifting</span></p>
${profChips('exp', PROF_EXP, p.exp, 'Years lifting')}</div>
<div>
<p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip="Ready-made routines that fit are marked when you pick one. Every other day fits 3 or 4.">Days a week</span></p>
${profChips(
  'days',
  PROF_DAYS.map(d => [d, String(d)] as const),
  p.days,
  'Days a week'
)}</div>
`;
}
function profSub(): string {
  const p = prof();
  const a: string[] = [];
  const goal = p.goal ? PROF_GOALS.find(g => g[0] === p.goal) : undefined;
  if (goal) a.push(goal[1]);
  if (p.days) a.push(`${p.days} days`);
  if (p.focus) a.push(p.focus.map(m => ML[m]).join(', '));
  if (state.settings.timeBudget) a.push(`${state.settings.timeBudget} min`);
  return a.join(' · ') || 'optional';
}
function profSettings(): TemplateResult {
  const s = state.settings;
  const f = prof().focus || [];
  const R = activeRoutine();
  const ap = profApplyList(R);
  return html`${profFields()} <label class="field">${labelTip(
    'lt-timeBudget',
    'Lifting time budget (minutes)',
    'Planned days whose time estimate runs over it are flagged. Rest per exercise is set in Plan; 0 s means no timer.'
  )}<input type="text" inputmode="numeric" data-bind="timeBudget" aria-labelledby="lt-timeBudget" .value=${fieldValue(s.timeBudget == null ? '' : String(s.timeBudget))} placeholder="e.g. 70"/></label>
<div>
<p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip=${PROF_FOCUS_TIP}>Focus muscles</span> <span class="muted" style="font-weight:400">${f.length} of ${FOCUS_MAX}</span></p>
<div class="chips" role="group" aria-label="Focus muscles">${MUSCLES.filter(([k]) => !TRACK_ONLY.has(k)).map(
    ([k, l]) =>
      html`<button class=${f.includes(k) ? 'chip on' : 'chip'} data-act="profSet" data-k="focus" data-v=${k} aria-pressed=${String(f.includes(k))}>${l}</button>`
  )}</div>
</div>
${
  ap.length
    ? html`<div class="panel row spread" id="profApply">
<p class="small" style="margin:0;flex:1 1 180px"><b>${ap.length} exercise${ap.length === 1 ? '' : 's'}</b> in ${R.name} differ from your profile.</p>
<button class="btn sm" data-act="profApply">Apply</button></div>
`
    : nothing
}`;
}

/* ---------- Your gym (r33, item 207) ---------- */

/** The dumbbell fields as typed, kept on screen (ui.gymDb) until From, To and Step make a rack, so a half-filled form is never thrown away or saved. */
type DbTyped = Partial<DbRack>;
const dbTyped = (): DbTyped | null => ui.gymDb ?? null;
const asRack = (d: DbTyped | null | undefined): DbRack | null =>
  d && d.lo != null && d.hi != null && d.st != null ? { ...d, lo: d.lo, hi: d.hi, st: d.st } : null;

function gymSub(): string {
  const g = gymOf();
  if (!g) return 'usual steps';
  const L = dbListOf(g.db);
  const parts: string[] = [];
  if (L) parts.push(`dumbbells ${fmtG(L[0] ?? 0)} to ${fmtG(L[L.length - 1] ?? 0)} ${g.u}`);
  if (g.kb) parts.push(`${g.kb.length} kettlebell${g.kb.length === 1 ? '' : 's'}`);
  if (g.plates) parts.push('plates');
  if (g.stack) parts.push(`stacks by ${fmtG(g.stack)}`);
  return parts.join(', ') || 'usual steps';
}
/** The unit Your gym's weights are labelled in: chosen there (until anything is saved), else the app's. */
function gymUnit(): 'lb' | 'kg' {
  const g = gymOf();
  return g ? g.u : ui.gymU || U();
}
/** The gym to change: a copy of the saved one, or a new one in the unit chosen. */
function gymNext(): Gym {
  const g = gymOf();
  return g
    ? {
        ...g,
        ...(g.db ? { db: { ...g.db } } : {}),
        ...(g.kb ? { kb: g.kb.slice() } : {}),
        ...(g.plates ? { plates: g.plates.slice() } : {})
      }
    : { u: gymUnit() };
}
function gymSettings(): TemplateResult {
  const g = gymOf();
  const u = gymUnit();
  const typed = dbTyped();
  const d: DbTyped = typed || (g && g.db) || {};
  const v = (k: keyof DbRack): string => {
    const x = d[k];
    return x == null || !isFinite(x) ? '' : fmtG(x);
  };
  const lb = u === 'lb';
  const L = dbListOf(g && g.db);
  const plates = gymPlates(u);
  const on = g && g.plates ? g.plates : plates;
  const listTxt = (a: number[]): string =>
    a.length > RACK_LIST.whole
      ? `${a.slice(0, RACK_LIST.head).map(fmtG).join(', ')} … ${a.slice(-RACK_LIST.tail).map(fmtG).join(', ')}`
      : a.map(fmtG).join(', ');
  const half = !!typed && !dbListOf(asRack(typed));
  const pair = !!typed && !half && (typed.fine == null) !== (typed.fineTo == null);
  const su = (gymOf() || { u: U() }).u === 'kg' ? 'kg' : 'lb';
  const small = `${SMALL_PLATE[su]} ${su}`;
  return html`${howText(
    'gym',
    `What your gym has, so suggested loads are ones you can pick up. Blank keeps the usual steps (${DEFAULT_STEP.lb} lb or ${DEFAULT_STEP.kg} kg, and dumbbells read from what you log). A step set on an exercise or in your plan still wins for that lift.`
  )}
<div>
<p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip="Type the weights as they are labelled in your gym. Suggestions show in the app's unit and land on these weights.">Labelled in</span></p>
<div class="ob-units" role="group" aria-label="Your gym's weights are labelled in">${(['lb', 'kg'] as const).map(
    k =>
      html`<button class=${u === k ? 'chip on' : 'chip'} data-act="gymUnit" data-v=${k} aria-pressed=${String(u === k)}>${k}</button>`
  )}</div>
</div>
${
  u !== U()
    ? html`<p class="small" style="margin:0">Suggestions show in ${U()}, on the ${u} weights below.</p>
`
    : nothing
} <label class="field">${labelTip('lt-barKg', `Bar weight (${U()})`, 'Used by the plates-per-side line in the logger.')}<input type="text" inputmode="decimal" data-bind="barKg" aria-labelledby="lt-barKg" .value=${fieldValue(fmtW(barKg()))}/></label>
<div>
<p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip="A barbell or a plate-loaded machine steps by two of the smallest plate you have, one a side; a landmine by one. Tap a plate your gym does not have.">Plates on hand (${u})</span></p>
<div class="chips" role="group" aria-label="Plates on hand">${plates.map(
    p =>
      html`<button class=${on.includes(p) ? 'chip on' : 'chip'} data-act="gymPlate" data-v=${String(p)} aria-pressed=${String(on.includes(p))}>${fmtG(p)}</button>`
  )}</div>
</div>
<label class="check-inline"><input type="checkbox" data-bind="smallPlates" aria-labelledby="lt-smallPlates" .checked=${live(!!state.settings.smallPlates)}/>${labelTip(
    'lt-smallPlates',
    `Small plates (${small})`,
    "Adds them to the plates-per-side line. A lift's own bar, such as a trap or EZ bar, is set in its exercise editor."
  )}</label>
<div>
<p class="small muted" style="margin:0 0 6px;font-weight:600">Dumbbells (${u})</p>
<div class="grid3">
<label class="field">From<input type="text" inputmode="decimal" data-gym="db.lo" .value=${fieldValue(v('lo'))} placeholder=${String(DB_EXAMPLE[u].lo)} /></label>
<label class="field">To<input type="text" inputmode="decimal" data-gym="db.hi" .value=${fieldValue(v('hi'))} placeholder=${String(DB_EXAMPLE[u].hi)} /></label>
<label class="field">Step<input type="text" inputmode="decimal" data-gym="db.st" .value=${fieldValue(v('st'))} placeholder=${String(DB_EXAMPLE[u].st)}/></label>
</div>
<div class="grid2" style="margin-top:6px;align-items:end">
<label class="field">${labelTip(
    'lt-dbFine',
    'Lighter end steps by',
    `Many racks go up in smaller steps at the light end, such as ${DB_EXAMPLE.lb.fine} lb up to ${DB_EXAMPLE.lb.fineTo}, or ${DB_EXAMPLE.kg.fine} kg up to ${DB_EXAMPLE.kg.fineTo}. Leave blank if yours does not.`
  )}<input type="text" inputmode="decimal" data-gym="db.fine" aria-labelledby="lt-dbFine" .value=${fieldValue(v('fine'))} placeholder=${String(DB_EXAMPLE[u].fine)} /></label>
<label class="field">Up to<input type="text" inputmode="decimal" data-gym="db.fineTo" .value=${fieldValue(v('fineTo'))} placeholder=${String(DB_EXAMPLE[u].fineTo)}/></label>
</div>
<p class=${half ? 'small' : 'small muted'} id="gymDbList" style="margin:6px 0 0">${
    half
      ? 'Add From, To, and Step to use these.'
      : L
        ? `${L.length} pairs: ${listTxt(L)} ${u}${pair ? '. Add both smaller-step fields to use them.' : ''}`
        : 'Not set: dumbbell steps are read from what you log.'
  }</p>
</div>
<label class="field">${labelTip('lt-kb', `Kettlebells (${u})`, 'The weights you have, any order, separated by commas.')}<input type="text" inputmode="decimal" data-gym="kb" aria-labelledby="lt-kb" .value=${fieldValue(g && g.kb ? g.kb.map(fmtG).join(', ') : '')} placeholder=${lb ? '18, 26, 35, 44, 53' : '8, 12, 16, 20, 24'}/></label> <label class="field">${labelTip(
    'lt-stack',
    `Cable and machine stacks step by (${u})`,
    'The usual step between pins on your cable and machine stacks. A machine that differs gets its own step in its exercise.'
  )}<input type="text" inputmode="decimal" data-gym="stack" aria-labelledby="lt-stack" .value=${fieldValue(g && g.stack ? fmtG(g.stack) : '')} placeholder=${lb ? '5' : '2.5'}/></label> ${g ? html`<button class="btn sm" data-act="gymClear">Clear my gym</button>` : nothing}`;
}
/* A session in progress takes the new loads on exercises with nothing ticked
   yet; typed loads are never touched (refreshEx, the session's). */
function gymRefresh(): void {
  invalidate();
  const d = state.draft;
  if (d) for (const id of new Set(d.ex.map(b => b.exId))) refreshEx(id);
}
function gymSave(g: Gym): void {
  const c = gymClean({ ...g });
  if (JSON.stringify(c || null) === JSON.stringify(gymOf() || null)) {
    rerenderKeepScroll();
    return;
  }
  act(
    () => {
      if (c) state.settings.gym = c;
      else delete state.settings.gym;
      gymRefresh();
    },
    { undo: true }
  );
  rerenderKeepScroll();
}
function gymInput(t: HTMLInputElement): void {
  const k = t.dataset.gym || '';
  const v = t.value.trim();
  const g = gymNext();
  if (k === 'kb') {
    g.kb = v ? v.split(/[;,\s]+/).flatMap(x => (numIn(x) == null ? [] : [numIn(x) ?? 0])) : [];
    gymSave(g);
    return;
  }
  if (k === 'stack') {
    const n = numIn(v);
    if (n == null) delete g.stack;
    else g.stack = n;
    gymSave(g);
    return;
  }
  // A dumbbell field's key after its db. (data-gym="db.lo").
  const f = k.slice('db.'.length);
  if (f !== 'lo' && f !== 'hi' && f !== 'st' && f !== 'fine' && f !== 'fineTo') return;
  const d: DbTyped = { ...(dbTyped() || g.db || {}) };
  const n = numIn(v);
  if (n == null) delete d[f];
  else d[f] = n;
  if (!Object.keys(d).length) {
    ui.gymDb = null;
    delete g.db;
    gymSave(g);
    return;
  }
  // A rack: saved. The smaller step needs both its fields; until then the rack is used without it and the typed one stays on screen.
  const rack = asRack(d);
  if (rack && dbListOf(rack)) {
    g.db = rack;
    ui.gymDb = (d.fine == null) !== (d.fineTo == null) ? d : null;
    gymSave(g);
    return;
  }
  // Not a rack yet: keep what was typed on screen only, and take the old rack out of use.
  ui.gymDb = d;
  if (g.db) {
    delete g.db;
    gymSave(g);
  } else rerenderKeepScroll();
}

/* ---------- Effort and Layout ---------- */

function rirSettings(): TemplateResult {
  const s = state.settings;
  const c = calStats();
  // A median miss exists once there is a recent set, the only case it is read in.
  const raw = c.raw ?? 0;
  const sum = !c.n
    ? "No calibration sets yet. Start one from a machine or cable exercise's ⋯ menu."
    : !c.recent
      ? `${c.n} calibration set${c.n === 1 ? '' : 's'}, none in the last ${CAL_WEEKS} weeks.`
      : `${c.recent} recent calibration set${c.recent === 1 ? '' : 's'}: median miss ${raw > 0 ? '+' : ''}${r1(raw)} reps (${raw > 0 ? 'you stop with more left than you call' : raw < 0 ? 'closer to failure than you call' : 'accurate'}). Correction applied: ${c.bias > 0 ? '+' : ''}${c.bias}.`;
  const sc = rirScale();
  // What RIR is stays on screen here (V, r27): this is where it is decided whether to use it.
  return html`<p class="small" style="margin:0"><b>RIR, reps in reserve:</b> reps you could still have done. RIR 3 or less is a hard set.</p>
<label class="field">Reps in reserve<select data-bind="rirMode">
<option value="on" .selected=${live(s.rirMode === 'on')}>On: log RIR and use it as logged</option>
<option value="cal" .selected=${live(s.rirMode === 'cal')}>On, corrected by my calibration sets</option>
<option value="off" .selected=${live(s.rirMode === 'off')}>Off: don't ask, count every working set as hard</option>
</select></label> ${
    s.rirMode === 'off'
      ? nothing
      : html`<label class="field">${labelTip(
          'lt-rirScale',
          'Enter effort as',
          'How you enter and read effort. Stored as RIR either way (RPE 8 is RIR 2, RPE 8.5 is RIR 1.5), so switching changes nothing logged.'
        )}<select data-bind="rirScale" aria-labelledby="lt-rirScale">
<option value="whole" .selected=${live(sc === 'whole')}>RIR, whole reps (0 to 5)</option>
<option value="half" .selected=${live(sc === 'half')}>RIR, half reps (0, 0.5, 1 … 5)</option>
<option value="rpe" .selected=${live(sc === 'rpe')}>RPE (5 to 10, in halves)</option>
</select></label>
`
  }${
    s.rirMode === 'off'
      ? nothing
      : html`<label class="check-inline"><input type="checkbox" data-bind="rirAsk" aria-labelledby="lt-rirAsk" .checked=${live(s.rirAsk === true)}/>${labelTip(
          'lt-rirAsk',
          `Open the ${effName()} picker after each set`,
          "Off: tap a set's RIR box when you want to rate it. On: the picker opens by itself after each set you tick."
        )}</label> <label class="check-inline"><input type="checkbox" data-bind="rirHalf" aria-labelledby="lt-rirHalf" .checked=${live(s.rirHalf === true)}/>${labelTip(
          'lt-rirHalf',
          `Count ${halfLbl()} as half a set`,
          "Off: a set counts toward your weekly sets at RIR 3 or less. On: a set past RIR 3 counts as half a set too, in your weekly sets, targets, and the plan's weekly sets. Growth rises as sets end closer to failure (Robinson 2024), so sets further away still do something; half is a convention. Estimates, PRs, and recovery are unchanged."
        )}</label>
<p class="small muted hastip" style="margin:4px 0 0" data-tip="A blank RIR is read as your usual RIR on that lift: the middle value of the sets of it you rated in the last 12 weeks, once there are 3. That is a convention, so rating a set only sometimes cannot make it look stronger or weaker. Until there are 3, a blank set counts as hard and as 0 reps left for 1RM estimates, which errs low and never inflates a PR. Recovery, calibration, and the light-load check use only the RIR you entered.">Skipping RIR on some sets is fine.</p>
`
  }${
    s.rirMode === 'cal' && c.recent < 2
      ? html`<p class="small" style="margin:0"><b>Needs ${CAL_MIN} calibration sets from the last ${CAL_WEEKS} weeks before any correction applies.</b></p>
`
      : nothing
  }
<p class="small hastip" style="margin:4px 0 0" data-tip="Off hides the RIR picker: every working set counts as hard and estimates use reps alone. Corrected shifts RIR you called at 4 or less by your typical error, shrunk toward zero while you have few calibration sets and capped at 2 reps; compound and isolation lifts use their own sets once each has 2. A set called at 0 is shifted too: unless a rep actually failed, 0 is still a call, and people under-call reps left by about 1 on average, only slightly less near failure (Halperin 2022). Your log never changes, so switching is reversible.">${sum}</p>
`;
}

function layoutSettings(): TemplateResult {
  const h = state.settings.hidden;
  const dflt = DEFAULT_HIDDEN.length === h.length && DEFAULT_HIDDEN.every(k => h.includes(k));
  return html`<p class="small muted" style="margin:0">Tap to show or hide. ${tipButton(
    `Hidden sections are still tracked, and come back where they were. Each time ${APP_NAME} opens, every section starts folded except Sessions on History. Drag a section by its ⠿ to move it; each tab keeps its order.`,
    'About layout'
  )}</p>
<div class="row"><button class=${dflt ? 'btn sm noted' : 'btn sm'} data-act="layoutDefault" aria-pressed=${String(dflt)} data-tip="The layout a new install starts with: At a glance, Coach, and Body hidden on Today, Schedule and Weekly volume hidden on Plan, and the default order.">Default layout</button><button class="btn sm" data-act="layoutAll" ?disabled=${!h.length}>Show everything</button><button class="btn sm" data-act="layoutReset" data-tip="Puts the sections on every tab back in their default order. Shown or hidden stays as it is.">Reset section order</button></div>
${HIDE_TABS.map(
  ([t, l]) =>
    html`<div class="hide-grp">
<p class="small"><b>${l}</b></p>
<div class="chips">${HIDEABLE.filter(x => x[0] === t).map(([, k, lab]) => {
      const on = !h.includes(t + ':' + k);
      return html`<button class=${on ? 'chip on' : 'chip'} data-act="hideToggle" data-k=${`${t}:${k}`} aria-pressed=${String(on)}>${lab}</button>`;
    })}</div>
</div>
`
)}`;
}

/* ---------- Your data: the account, the sync and the lines about them ---------- */

const inClaude = (): boolean => !!(window.claude && typeof window.claude.use === 'function');

/** The account line: who is signed in, with Sign out and Delete my account, or where the log is and what an account adds. */
function acctPanel(): TemplateResult | typeof nothing {
  const A = AUTH();
  if (!A || inClaude()) return nothing;
  const u = rec(acct.user);
  // Signed in but not syncing: the sign-in could not be used (offline at launch, or refused). Said, with a retry, rather than looking fine.
  const stuck =
    u && !cloud.on
      ? html`<div class="row spread" style="margin-top:6px">
<p class="small" style="margin:0;color:var(--yellow)">Not syncing right now.</p>
<button class="btn sm" data-act="acctRetry">Try again</button></div>
`
      : nothing;
  /* Signed out, this one line says where the log is and what an account adds (r34.2): Your data
     used to say it four times (this panel, the storage line, the privacy line, Backup due). */
  return u
    ? html`<div class="panel" id="acctPanel">
<div class="row spread">
<p class="small" style="margin:0;min-width:0;overflow-wrap:anywhere">Signed in as <b>${typeof u.email === 'string' ? u.email : ''}</b></p>
<button class="btn sm" data-act="acctSignOut">Sign out</button></div>
${stuck}${
        typeof A.deleteAccount === 'function'
          ? html`<button type="button" class="linkbtn" style="margin-top:8px;color:var(--red)" data-act="acctDelete">Delete my account</button>`
          : nothing
      }</div>
`
    : html`<div class="panel" id="acctPanel">
<p class="small hastip" style="margin:0 0 8px" data-tip=${
        isStandalone()
          ? 'Deleting the app from the home screen deletes the log on this phone. An account keeps it, or save a backup file below.'
          : "Clearing this browser's data deletes the log here. An account keeps it, or save a backup file below."
      }><b>Saved on this ${isStandalone() || coarse() ? 'phone' : 'device'} only.</b> Create an account to back it up and use it on any device.</p>
<div class="row"><button class="btn sm primary" data-act="acctOpen" data-mode="signup">Create account</button><button class="btn sm" data-act="acctOpen" data-mode="signin">Sign in</button></div>
</div>
`;
}

/** Where the log is saved and how the sync stands, with Sync now. */
function syncInfo(): TemplateResult {
  if (!cloud.on)
    return isStandalone()
      ? html`<p class="small hastip" style="margin:0" data-tip="Without an account this app keeps your data on this phone only. Deleting the app from the home screen deletes it too. Sign in to keep a copy in your account, or save a backup file to Files or iCloud Drive; Import brings it back on any device."><b>Saved on this phone.</b> ${
          AUTH() ? 'Sign in to sync, or export a backup weekly.' : 'Export a backup weekly.'
        }</p>
`
      : AUTH()
        ? html`<p class="small hastip" style="margin:0" data-tip="Everything is saved in this browser only. Clearing its data deletes it. Sign in below to keep a copy in your account, or export a backup."><b>Saved in this browser only.</b> Sign in to sync, or export a backup.</p>
`
        : html`<p class="small hastip" style="margin:0" data-tip="Sync turns on by itself when this page is opened inside Claude while signed in. Until then everything is saved in this browser only."><b>Cloud sync off in this view.</b> Saved in this browser only.</p>
`;
  const ago = cloud.last ? Math.round((Date.now() - cloud.last) / (MINUTE_S * SECOND_MS)) : null;
  const when =
    ago == null
      ? 'not yet'
      : ago < 1
        ? 'just now'
        : ago < HOUR_MIN
          ? `${ago} min ago`
          : ago < DAY_MIN
            ? `${Math.round(ago / HOUR_MIN)} h ago`
            : fmtDate(iso(new Date(cloud.last ?? 0)));
  const st =
    cloud.status === 'synced'
      ? html`<span class="tag green">Synced</span>`
      : cloud.status === 'offline'
        ? html`<span class="tag yellow">Waiting to sync</span>`
        : html`<span class="tag blue">Syncing</span>`;
  return html`<div class="sync-row">${st}<span class="small muted">Last synced ${when}</span><button class="btn sm" data-act="syncNow">Sync now</button></div>
<p class="small hastip" style="margin:6px 0 0" data-tip=${`A new phone or a cleared browser loses nothing: sign in and your log comes back. Deleted items wait in History, Recently deleted, for ${TRASH_DAYS} days, and Undo in Settings covers the last ${UNDO_DAYS} days.`}>${
    cloud.status !== 'synced'
      ? 'Saved on this device. It reaches your account when you are back online.'
      : window.claude
        ? 'Saved to your Claude account and this device.'
        : 'Saved to your account and this device.'
  }${cloud.err ? html` <b style="color:var(--red)">${cloud.err}</b>` : nothing}</p>
`;
}

/** What the suggestions are, said once where people look (r31.1, V: a subtle notice). */
function safetyLine(): TemplateResult {
  return html`<p class="small muted" id="safety" style="margin:8px 0 0"><b>Suggestions:</b> estimates from your log, not medical or coaching advice. Train within your limits and stop on pain. ${tipButton(SAFETY_TXT, 'About suggestions')}</p>
`;
}

/** Where the data lives and what leaves the device, plainly. */
function privacyLine(): TemplateResult {
  const claude = inClaude();
  if (!claude && AUTH() && acct.user)
    return html`<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no ads, no tracking. Your log syncs to your ${APP_NAME} account. Only you and the app's owner can see it. Reports you send go to the app owner. ${tipButton(
      'It is stored in a Supabase database. Database rules let each account read and write only its own data. The person who runs that database, the app owner, can see stored data and your email address, as with any app without end-to-end encryption. Your email is used only to sign in and reset your password, and nothing is shared or sold. A new password is checked against known breaches with only the first 5 characters of its hash; the password never leaves the phone. Backup files go only where you save them.',
      'About privacy'
    )}</p>
`;
  if (!claude && AUTH())
    return html`<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no ads, no tracking, and nothing sent without an account. Reports you send go to the app owner. ${tipButton(
      "Opening or updating the app downloads it from GitHub Pages, which, like any website host, sees your IP address; after that it works offline. With an account, your log and email are stored in a Supabase database, readable by your account and by the app owner; the email is used only to sign in and reset your password. A new password is checked against known breaches with only the first 5 characters of its hash. Deleting the app or this site's data deletes the copy on this device, so keep a backup file or an account.",
      'About privacy'
    )}</p>
`;
  return claude
    ? html`<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no ads, no tracking. Your log is stored with your Claude account. ${tipButton('Export and CSV files go only where you save them.', 'About privacy')}</p>
`
    : html`<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no account, no ads, no tracking. Your log stays on this device and is sent nowhere. Reports you send go to the app owner. ${tipButton(
        `${APP_NAME} has no server. Opening or updating the app downloads it from GitHub Pages, which, like any website host, sees your IP address; after that it works offline. Backup files go only where you save them. Deleting the app or this site's data deletes your log, so keep a backup file.`,
        'About privacy'
      )}</p>
`;
}

/** The line that says a log kept aside for another account is on this phone (r56.1, PENDING 328 b). */
function asideLine(): TemplateResult | typeof nothing {
  const kept = asideList();
  if (!kept.length) return nothing;
  const words = kept.map(a => `${a.sessions} session${a.sessions === 1 ? '' : 's'}`).join(', ');
  return html`<p class="small" id="asideLine" style="margin:8px 0 0"><b>A log from another account is kept on this phone</b> (${words}). It is used again when that account signs in here. Erase everything removes it.</p>
`;
}

function dataBody(): TemplateResult {
  const s = state.settings;
  const ap = acctPanel();
  const one = ap !== nothing && !acct.user;
  return html`${ap}${
    one
      ? nothing
      : html`<div class="panel" id="syncInfo" style=${ap !== nothing ? 'margin-top:8px' : nothing}>${syncInfo()}</div>
`
  }${
    canInstallHere()
      ? html`<div class="panel row spread" id="installPanel" style="margin-top:8px">
<p class="small" style="margin:0;flex:1 1 180px"><b>Install the app.</b> Full screen, offline, one tap from your home screen.</p>
<button class="btn sm primary" data-act="install">${/^ios/.test(installKind()) ? 'Add to Home Screen' : 'Install'}</button></div>
`
      : nothing
  }${
    ENV === 'preview'
      ? html`<div class="panel row spread" style="margin-top:8px">
<p class="small" style="margin:0;flex:1 1 180px"><b>Test version.</b> It keeps a separate log. Copy yours in to try it; your log in ${APP_NAME} stays as it is.</p>
<button class="btn sm primary" data-act="previewCopy">Copy my log in</button></div>
`
      : nothing
  }${asideLine()}${privacyLine()}${safetyLine()}${
    backupDue()
      ? html`<p class="callout yellow" style="margin:10px 0 0"><b>Backup due.</b> ${s.lastExport ? `Last backup file ${fmtDate(s.lastExport)}.` : 'No backup file yet.'}${cloud.on ? 'Your account has not synced this week. Export one below.' : ''}</p>
`
      : nothing
  }${
    device.ok
      ? nothing
      : html`<p class="small" style="color:var(--red)">This browser is blocking local storage, so this device keeps nothing between reloads without cloud sync.</p>
`
  }${
    unreadableRaw()
      ? html`<div class="panel" id="unreadPanel" style="margin-top:8px">
<p class="small" style="margin:0 0 6px"><b>A save on this device could not be read</b> by this build, and was kept aside. Restore tries it again, which a later build may read; Show its text to copy it out.</p>
<div class="row"><button class="btn sm primary" data-act="unreadRestore">Restore it</button><button class="btn sm" data-act="unreadShow">Show its text</button><button class="btn sm" data-act="unreadForget">Forget it</button></div>
</div>
`
      : nothing
  }
<div class="card stack">
<div class="row"><button class="btn primary" data-act="export" data-tip="The backup: restores everything, on any device.">Export backup (.json)</button><button class="btn" data-act="showBackup" data-tip="The same backup as text, to copy somewhere safe.">Show backup text</button><button class="btn" data-act="exportCsv" data-tip="One row per set for spreadsheets. Import workouts reads it back, but it is not a full backup: routines and settings are not in it.">Export sets (.csv)</button></div>
<button class="btn" data-act="impOpen" data-tip="Adds sessions from notes, a spreadsheet, or an export from another app. You check everything before it is saved.">Import workouts</button> <label class="field">Restore a backup file (replaces everything)<input type="file" accept=".json,application/json" id="importFile"/></label> <button class="btn" data-act="pasteImport">Paste backup text instead</button>
<div class="row"><button class="btn" data-act="undo" ?disabled=${!undoStack.length} data-tip=${`Deletes, resets, and imports from the last ${UNDO_DAYS} days, kept after the app is closed. Edits are not undoable. Deleted sessions, cardio, and routines also wait in History for ${TRASH_DAYS} days.`}>Undo last delete or reset${undoStack.length ? ` (${undoStack.length} available)` : ''}</button></div>
</div>
`;
}

/* ---------- the screen ---------- */

/** Settings, as a template of the log and `ui`. */
export function viewSettings(): TemplateResult {
  const s = state.settings;
  const hasDemo = state.sessions.some(x => x.demo) || state.bodyweights.some(x => x.demo);
  // Each group folds (for this visit) and moves (its order is saved).
  const G = (
    k: string,
    title: string,
    sub: string,
    body: TemplateResult,
    help?: string,
    id?: string
  ): readonly [string, TemplateResult] =>
    [k, section({ sk: 'settings:' + k, key: k, title, sub, help, body, id })] as const;
  const kick = ENV === 'preview' ? `${PREVIEW_NAME} ${VERSION_LINE}` : '';
  const meta = cloud.on
    ? window.claude
      ? 'Saved to your Claude account and this device'
      : 'Synced to your account and saved on this device'
    : 'Saved on this device';
  const list = [
    G(
      'profile',
      'Your training',
      profSub(),
      html`<div class="card stack">${profSettings()}</div>
`
    ),
    G(
      'general',
      'General',
      `${s.unit === 'kg' ? 'kg, cm' : 'lb, in'} · ${s.theme === 'system' ? 'device theme' : s.theme}`,
      html`<div class="card stack">
<div class="grid2">
<label class="field">Units<select data-bind="unit">
<option value="lb" .selected=${live(s.unit === 'lb')}>lb and inches</option>
<option value="kg" .selected=${live(s.unit === 'kg')}>kg and cm</option>
</select></label> <label class="field">Theme<select data-bind="theme">
<option value="system" .selected=${live(s.theme === 'system')}>Match device</option>
<option value="dark" .selected=${live(s.theme === 'dark')}>Dark</option>
<option value="light" .selected=${live(s.theme === 'light')}>Light</option>
</select></label>
</div>
<label class="field">Name (optional)<input type="text" data-bind="userName" .value=${fieldValue(s.userName || '')} maxlength="40" autocomplete="given-name"/></label>
<div>
<p class="small muted" style="margin:0 0 6px;font-weight:600">Accent colour</p>
<div class="chips" role="group" aria-label="Accent colour">${ACCENTS.map(
        ([k, l]) =>
          html`<button class=${(s.accent || ACCENT0) === k ? 'chip acc on' : 'chip acc'} data-act="accent" data-v=${k} aria-pressed=${String((s.accent || ACCENT0) === k)}><i class=${`sw sw-${k}`} aria-hidden="true"></i>${l}</button>`
      )}</div>
</div>
<div class="grid2 one-narrow">
<label class="field">${labelTip(
        'lt-bwGoalPct',
        'Bodyweight goal (%/wk)',
        'Compared with your 7-day-average bodyweight trend on Stats. Leave blank to track without a target.'
      )}<input type="text" inputmode="decimal" data-bind="bwGoalPct" aria-labelledby="lt-bwGoalPct" .value=${fieldValue(s.bwGoalPct == null ? '' : String(s.bwGoalPct))} placeholder="e.g. 0.3 or -0.5"/></label> <label class="field">${labelTip(
        'lt-bwEvery',
        'Weigh-in reminder',
        'A card on Today asks for your bodyweight when the last weigh-in is this old. Pull-ups, dips, and other bodyweight lifts use your latest weigh-in.'
      )}<select data-bind="bwEvery" aria-labelledby="lt-bwEvery">${BW_EVERY.map(
        ([v, l]) => html`<option value=${String(v)} .selected=${live(bwEvery() === v)}>${l}</option>
`
      )}</select></label>
</div>
</div>
`
    ),
    G(
      'gym',
      'Your gym',
      gymSub(),
      html`<div class="card stack">${gymSettings()}</div>
`,
      'gym'
    ),
    G(
      'timer',
      'Rest timer and logging',
      s.timerMode === 'off' ? 'timer off' : s.timerMode + ' timer',
      html` <div class="card stack">
<label class="field">${labelTip(
        'lt-timerMode',
        'Rest timer',
        'Auto starts the timer when a set is marked done. Manual starts it from Rest on the exercise.'
      )}<select data-bind="timerMode" aria-labelledby="lt-timerMode">
<option value="auto" .selected=${live(s.timerMode === 'auto')}>Auto, after each set</option>
<option value="manual" .selected=${live(s.timerMode === 'manual')}>Manual, from Rest</option>
<option value="off" .selected=${live(s.timerMode === 'off')}>Off</option>
</select></label> <label class="check-inline"><input type="checkbox" data-bind="timerSound" .checked=${live(!!s.timerSound)} ?disabled=${s.timerMode === 'off'}/>Sound and vibration when rest ends</label> <label class="check-inline"><input type="checkbox" data-bind="timerCompact" aria-labelledby="lt-timerCompact" .checked=${live(!!s.timerCompact)} ?disabled=${s.timerMode === 'off'}/>${labelTip(
        'lt-timerCompact',
        'Compact timer',
        'A small pill in the corner instead of a bar across the screen.'
      )}</label> <label class="check-inline"><input type="checkbox" data-bind="autoDone" aria-labelledby="lt-autoDone" .checked=${live(!!s.autoDone)}/>${labelTip(
        'lt-autoDone',
        'Auto-mark a set done after its reps',
        'A mistyped rep count is then saved without a tap to confirm, so check the row. A tap on the checkmark right after only confirms it; tap again to undo.'
      )}</label> <label class="check-inline"><input type="checkbox" data-bind="loadFill" aria-labelledby="lt-loadFill" .checked=${live(s.loadFill === 'fill')}/>${labelTip(
        'lt-loadFill',
        'Fill in suggested loads',
        "Off: a set's load shows in grey until you type one, and ticking the set takes it. On: the suggested load is typed into every row for you. Either way, a load you type is never changed."
      )}</label> <label class="field">${labelTip(
        'lt-todayStart',
        'Today starts with',
        "Blank: Today opens on an empty session, and you add exercises as you go; your plan's day is still one tap away. Each exercise still gets its suggested weight from your history."
      )}<select data-bind="todayStart" aria-labelledby="lt-todayStart">
<option value="plan" .selected=${live(s.todayStart !== 'free')}>My plan's day</option>
<option value="free" .selected=${live(s.todayStart === 'free')}>A blank session (freestyle)</option>
</select></label> <label class="check-inline"><input type="checkbox" data-bind="autoAdj" aria-labelledby="lt-autoAdj" .checked=${live(adjOn())}/>${labelTip(
        'lt-autoAdj',
        'Adjust the next sets from the last one',
        'After a set that was clearly easier or harder than planned, the sets after it that you have not typed a load for move up or down. A line says why, with Keep to undo it. Two reps or more in reserve over your target, or two past the top of the range, moves up; two or more under the range moves down. A rep or two lost per set is normal and changes nothing.'
      )}</label> <label class="check-inline"><input type="checkbox" data-bind="wakeLock" aria-labelledby="lt-wakeLock" .checked=${live(!!s.wakeLock)}/>${labelTip(
        'lt-wakeLock',
        'Keep the screen on during a session',
        'A locked phone pauses this page, so the rest alert cannot sound until you unlock. Keeping the screen on avoids that, at some battery cost.'
      )}</label>
</div>
`
    ),
    G(
      'rir',
      'Effort (RIR)',
      { on: 'on', cal: 'corrected', off: 'off' }[s.rirMode],
      html`<div class="card stack">${rirSettings()}</div>
`
    ),
    G(
      'layout',
      'Layout',
      s.hidden.length ? `${s.hidden.length} hidden` : 'everything shown',
      html`<div class="card stack">${layoutSettings()}</div>
`
    ),
    G(
      'prio',
      'Priority muscles',
      s.priorities.length ? s.priorities.map(m => ML[m]).join(', ') : 'none',
      html`${howText('prio', 'Flagged as Your priority under Muscles in Stats, and favoured by Pick for me.')}
<div class="card chips">${MUSCLES.map(
        ([k, l]) =>
          html`<button class=${s.priorities.includes(k) ? 'chip on' : 'chip'} data-act="prio" data-m=${k}>${l}</button>`
      )}</div>
`,
      'prio'
    ),
    G(
      'bands',
      'Weekly set targets',
      '',
      html`${howText(
        'bands',
        'Fractional hard sets per week: direct work 1, helper muscles 0.5 (Pelland 2025). 10 to 20 for major muscles fits the dose-response data; the upper number is typical, not a ceiling, and more still helps a little at more cost. The muscles lifters train directly for size have a target to start; glutes, rear delts, calves, and abs start lower, a convention, as compound lifts work them too. Every other muscle is tracked only, counted with no target, until you give it one with Set a target or name it a focus (any but serratus, rotator cuff, neck, and tibialis). Raise one or two muscles for a specialisation block, or set focus muscles in Your training. Default targets puts every one back.'
      )}
<div class="card">
<table class="t">
<tbody>
<tr>
<th>Muscle</th>
<th class="r">Min</th>
<th class="r">Max</th>
</tr>
${MUSCLES.map(([k, l]) =>
  /* A muscle with no target (339 e, r58) offers one; one the lifter gave a
     target (not by default and not a focus, which Your training sets) can go
     back to tracked only. */
  !hasTarget(k)
    ? html`<tr>
<td>${l}</td>
<td class="r" colspan="2"><span class="small muted">Tracked only</span> <button type="button" class="btn sm" data-act="tgtSet" data-m=${k}>Set a target</button></td>
</tr>
`
    : html`<tr>
<td>${l}${TARGETED.has(k) || (prof().focus || []).includes(k) ? nothing : html`<br><button type="button" class="linkbtn tall" data-act="tgtOff" data-m=${k}>Track only</button>`}</td>
<td class="r"><input style="width:70px" type="text" inputmode="numeric" aria-label=${`${l} minimum hard sets a week`} data-band=${k} data-bi="0" .value=${fieldValue(String(s.bands[k][0]))}/></td>
<td class="r"><input style="width:70px" type="text" inputmode="numeric" aria-label=${`${l} maximum hard sets a week`} data-band=${k} data-bi="1" .value=${fieldValue(String(s.bands[k][1]))}/></td>
</tr>
`
)}</tbody>
</table>
<div class="row" style="margin-top:8px"><button class="btn sm" data-act="bandsDefault" ?disabled=${
        MK.every(m => {
          const d = defBand(m);
          return s.bands[m][0] === d[0] && s.bands[m][1] === d[1];
        }) &&
        !s.bandsFit &&
        !s.ownTargets
      }>Default targets</button></div>
</div>
`,
      'bands'
    ),
    G(
      'data',
      'Your data',
      cloud.on ? (cloud.status === 'synced' ? 'synced' : 'syncing') : 'this device only',
      dataBody(),
      '',
      'dataSec'
    ),
    G(
      'help',
      'Help',
      'Guide, report a problem',
      html`<div class="card stack">
<div class="row"><button class="btn" data-act="guideOpen">Guide</button><button class="btn" data-act="fbOpen" data-cat="bug" data-tip="Also for a question or a suggestion: the sheet asks which.">Report a problem</button>${acct.reader && FB() ? html`<button class="btn" data-act="fbInbox">Reports inbox</button>` : nothing}</div>
</div>
`
    ),
    // Demo data, Diagnostics and Erase everything (r35, V): one group at the bottom, not three in front of everyday settings.
    G(
      'more',
      'More',
      hasDemo ? 'demo data loaded' : 'demo data, version, erase',
      html`<div class="card stack">
<div>
<p class="small" style="margin:0 0 6px"><b>Demo data</b> ${tipButton(
        `${DEMO_WEEKS} weeks of generated sessions to preview Today and Stats. Everything demo is tagged and removed in one tap; your real logs are untouched.`,
        'About demo data'
      )}</p>
<div class="row">${
        hasDemo
          ? html`<button class="btn" data-act="demoClear">Clear demo data</button>`
          : html`<button class="btn" data-act="demoLoad">Load demo data</button>`
      }</div>
</div>
<div>
<p class="small" style="margin:0 0 6px"><b>Version</b> ${VERSION_LINE}${
        logBuf.length
          ? html` <span class="muted">· cloud ${cloud.on ? cloud.status : 'off'} · ${logBuf.length} logged error${logBuf.length === 1 ? '' : 's'}</span>`
          : nothing
      }</p>
${
  logBuf.length
    ? html`<ul class="clist">${logBuf
        .slice(-LOG_SHOWN)
        .reverse()
        .map(
          x =>
            html`<li><span class="small"><b>${x.a}</b> ${x.m}${x.n ? ` (${x.n} times)` : ''}</span><span class="small muted">${stampShort(x.t)}</span></li>
`
        )}</ul>
`
    : nothing
}${
        logBuf.length
          ? html`<div class="row"><button class="btn sm" data-act="diagCopy">Copy diagnostics</button><button class="btn sm" data-act="diagClear">Clear log</button></div>
`
          : nothing
      }${
        window.IRONLOG_APP
          ? html`<p class="small" style="margin:8px 0 0"><a href="LICENSES.txt" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;min-height:44px">Open-source licenses</a></p>
`
          : nothing
      }</div>
<div><button class="btn danger" data-act="resetAll">Erase everything</button></div>
</div>
`
    )
  ];
  return html`${pageTitle(kick, 'Settings', meta)}${repeat(
    placed('settings', list),
    x => x[0],
    x => x[1]
  )}${tabFoot('settings')}`;
}

/** Draws Settings' sync line again where it is on screen (fx.syncLine, from the sync): Settings is drawn again in place, nothing else, so a sheet open over it and a field being typed in are left as they are, as the line alone was before r57. */
export function settingsSyncLine(): void {
  const v = document.getElementById('view');
  if (v && ui.tab === 'settings' && document.getElementById('syncInfo')) drawScreen(v, viewSettings());
}

/* ---------- what Settings does ---------- */

/** The element a tap came from, as the page's dispatch hands it (data-act). */
type Tap = { dataset: DOMStringMap };

/** Settings' actions, by the data-act their buttons carry; the page's action table takes them in. */
export const SETTINGS_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  accent(t) {
    const v = t.dataset.v;
    const a = v === 'blue' || v === 'volt' || v === 'ember' || v === 'pink' ? v : null;
    if (!a || !ACCENTS.some(([k]) => k === a)) return;
    act(() => {
      if (a === ACCENT0) delete state.settings.accent;
      else state.settings.accent = a;
    });
    rerenderKeepScroll();
  },
  prio(t) {
    const k = t.dataset.m;
    const m = MK.find(x => x === k);
    if (!m) return;
    act(() => {
      const p = state.settings.priorities;
      state.settings.priorities = p.includes(m) ? p.filter(x => x !== m) : [...p, m];
    });
    rerenderKeepScroll();
  },
  hideToggle(t) {
    const k = t.dataset.k || '';
    if (!HIDEABLE_KEYS.has(k)) return;
    act(() => {
      const h = state.settings.hidden;
      state.settings.hidden = h.includes(k) ? h.filter(x => x !== k) : [...h, k];
    });
    rerenderKeepScroll();
  },
  layoutDefault() {
    act(
      () => {
        state.settings.hidden = DEFAULT_HIDDEN.slice();
        state.settings.secOrder = defaultOrder();
      },
      { undo: true }
    );
    rerenderKeepScroll();
    toast('Default layout on every tab', true);
  },
  layoutAll() {
    act(() => {
      state.settings.hidden = [];
    });
    rerenderKeepScroll();
    toast('Every section shown');
  },
  layoutReset() {
    act(
      () => {
        state.settings.secOrder = defaultOrder();
      },
      { undo: true }
    );
    rerenderKeepScroll();
    toast('Section order reset on every tab', true);
  },
  gymUnit(t) {
    const v: 'lb' | 'kg' = t.dataset.v === 'kg' ? 'kg' : 'lb';
    if (v === gymUnit()) return;
    const go = (): void => {
      ui.gymDb = null;
      ui.gymU = v;
      if (gymOf())
        act(
          () => {
            delete state.settings.gym;
            gymRefresh();
          },
          { undo: true }
        );
      rerenderKeepScroll();
    };
    // Weights typed in one unit mean nothing in the other, so they are cleared, with Undo, rather than converted to odd numbers.
    if (gymOf() || ui.gymDb)
      confirmBox(
        `Switch to ${v}?`,
        `The weights typed here are in ${gymUnit()} and are cleared. Type them again in ${v}.`,
        `Switch to ${v}`,
        () => {
          go();
          toast(`Your gym in ${v}`, true);
        }
      );
    else go();
  },
  gymPlate(t) {
    const g = gymNext();
    const all = gymPlates(g.u);
    const v = +(t.dataset.v || '');
    let on = Array.isArray(g.plates) ? g.plates.slice() : all.slice();
    on = on.includes(v) ? on.filter(x => x !== v) : [...on, v];
    if (!on.length) {
      toast('Keep at least one plate');
      return;
    }
    if (on.length === all.length) delete g.plates;
    else g.plates = all.filter(x => on.includes(x));
    gymSave(g);
  },
  gymClear() {
    ui.gymDb = null;
    act(
      () => {
        delete state.settings.gym;
        gymRefresh();
      },
      { undo: true }
    );
    rerenderKeepScroll();
    toast('Your gym cleared: the usual steps apply', true);
  },
  /* Your training (r44): a tap on a choice sets it, a tap on the one set
     clears it. Focus moves only the app's own weekly targets, with Undo. */
  profSet(t) {
    const k = t.dataset.k;
    const raw = t.dataset.v || '';
    const old = prof();
    const p: Profile = { ...old, focus: (old.focus || []).slice() };
    const focus = p.focus || [];
    if (k === 'focus') {
      const i = focus.indexOf(raw);
      if (i >= 0) focus.splice(i, 1);
      else {
        if (focus.length >= FOCUS_MAX) {
          toast(`${upFirst(numWord(FOCUS_MAX))} at most. Tap one to take it off.`);
          return;
        }
        focus.push(raw);
      }
    } else if (k === 'goal' || k === 'exp') {
      if (p[k] === raw) delete p[k];
      else p[k] = raw;
    } else if (k === 'days') {
      if (p.days === +raw) delete p.days;
      else p.days = +raw;
    } else return;
    const np = profClean({ ...p });
    const cur = state.settings.profile;
    const was: Profile | null = cur ? { ...cur, ...(cur.focus ? { focus: cur.focus.slice() } : {}) } : null;
    let moved: ReturnType<typeof profMoveBands> = {};
    /* Undo puts the profile back and each target this moved that still reads
       what it was moved to (the r44 review: the merge lost them when a target
       was typed in between). */
    act(
      () => {
        if (np) state.settings.profile = np;
        else delete state.settings.profile;
        if (k === 'focus') moved = profMoveBands(old, np || {});
      },
      {
        undo: (): boolean => {
          if (was) state.settings.profile = was;
          else delete state.settings.profile;
          const b = state.settings.bands;
          for (const m of MK) {
            const x = moved[m];
            if (x && b[m][0] === x[1][0] && b[m][1] === x[1][1]) b[m] = [x[0][0], x[0][1]];
          }
          return true;
        }
      }
    );
    rerenderKeepScroll();
    const n = Object.keys(moved).length;
    // A focus whose own target was typed does nothing to it; say so rather than nothing (the r44 review).
    const fm = MK.find(m => m === raw);
    const kept = k === 'focus' && !!np && (np.focus || []).includes(raw) && !!fm && !moved[fm];
    if (kept)
      toast(
        `Your ${ML[raw]} target is one you set, so it stays. Default targets in Weekly set targets puts the app's back.`,
        n > 0,
        KEPT_TOAST_MS
      );
    else if (n) toast(`Weekly targets moved for ${n} muscle${n === 1 ? '' : 's'}. Ones you typed stay.`, true);
  },
  profApply() {
    const R = activeRoutine();
    const list = profApplyList(R);
    if (!list.length) return;
    confirmBox(
      `Apply to ${R.name}?`,
      `${list.length} exercise${list.length === 1 ? '' : 's'}. ${profApplyWhat()} Sets and exercises stay as they are.`,
      'Apply',
      () => {
        const now = activeRoutine();
        let n = 0;
        const done = act(
          () => {
            const L = profApplyList(now);
            n = L.length;
            for (const x of L) {
              Object.assign(x.it, x.ch);
              syncDraftPlan({ r: now, di: x.di, it: x.it });
            }
          },
          { check: () => !!now && now.id === R.id, undo: true }
        );
        if (!done) return;
        rerenderKeepScroll();
        toast(`${now.name}: ${n} exercise${n === 1 ? '' : 's'} updated`, true);
      }
    );
  },
  // Weekly set targets back to the defaults (r44), with Your training's focus; typed ones, those given with Set a target (r58) and a first-run fit go.
  bandsDefault() {
    const b = state.settings.bands;
    const fit = state.settings.bandsFit ? { ...state.settings.bandsFit } : null;
    const own = state.settings.ownTargets ? [...state.settings.ownTargets] : null;
    const moved: Partial<Record<MuscleKey, [[number, number], [number, number]]>> = {};
    for (const m of MK) {
      const d = defBand(m);
      if (b[m][0] !== d[0] || b[m][1] !== d[1])
        moved[m] = [
          [b[m][0], b[m][1]],
          [d[0], d[1]]
        ];
    }
    // Undo puts back the floors and each target that still reads the default it was set to (the r44 review: the merge kept the floors and lost the targets).
    act(
      () => {
        for (const m of MK) {
          const x = moved[m];
          if (x) b[m] = [x[1][0], x[1][1]];
        }
        delete state.settings.bandsFit;
        delete state.settings.ownTargets;
      },
      {
        undo: (): boolean => {
          if (fit) state.settings.bandsFit = fit;
          else delete state.settings.bandsFit;
          if (own) state.settings.ownTargets = own;
          for (const m of MK) {
            const x = moved[m];
            if (x && b[m][0] === x[1][0] && b[m][1] === x[1][1]) b[m] = [x[0][0], x[0][1]];
          }
          return true;
        }
      }
    );
    rerenderKeepScroll();
    toast('Weekly set targets back to the defaults', true);
  },
  // A muscle with no target given one (339 e, r58): its numbers as they stand, now counted.
  tgtSet(t) {
    const m = MK.find(x => x === t.dataset.m);
    if (!m || hasTarget(m)) return;
    act(() => {
      const o = state.settings.ownTargets || [];
      state.settings.ownTargets = MK.filter(x => x === m || o.includes(x));
    });
    rerenderKeepScroll();
  },
  // A target the lifter gave taken off: tracked only again, its numbers the app's, with an Undo step.
  tgtOff(t) {
    const m = MK.find(x => x === t.dataset.m);
    if (!m || TARGETED.has(m) || (prof().focus || []).includes(m)) return;
    act(
      () => {
        const o = (state.settings.ownTargets || []).filter(x => x !== m);
        if (o.length) state.settings.ownTargets = o;
        else delete state.settings.ownTargets;
        const a = appBand(m);
        state.settings.bands[m] = [a[0], a[1]];
      },
      { undo: true }
    );
    rerenderKeepScroll();
    toast(`${ML[m]} is tracked only`, true);
  },
  unreadForget() {
    confirmBox(
      'Forget the save kept aside?',
      'It is deleted for good. Export or copy it first if you might want it.',
      'Forget it',
      () => {
        unreadableForget();
        rerenderKeepScroll();
        toast('Forgotten');
      },
      true
    );
  },
  diagClear() {
    logClear();
    rerenderKeepScroll();
    toast('Log cleared');
  },
  syncNow() {
    if (!cloud.on) return;
    cloud.retry = 0;
    setCloud('connecting');
    void cq(cloudPull).then(() => {
      if (cloud.status === 'synced') toast('Synced');
    });
  },
  demoClear() {
    act(
      () => {
        stripDemo(state);
        demoRestore();
      },
      { undo: true }
    );
    render();
    toast('Demo data cleared', true);
  },
  resetAll() {
    confirmBox(
      'Erase everything?',
      `All routines, sessions, custom exercises, and body data will be deleted${cloud.on ? ' on this device and in your cloud copy' : ' on this device'}. Export a backup first if you might want it.`,
      'Erase everything',
      () => {
        act(
          () => {
            setState(normalize(null));
            if (!cloud.on) cloudStop(true);
            asideClear();
          },
          { undo: true }
        );
        ui.tab = 'today';
        render();
        toast('Everything erased', true);
      },
      true
    );
  }
};

/* ---------- Settings' fields ---------- */

/** What a field holds on change: a box's tick, or the text or option picked. */
const checked = (t: Field): boolean => t instanceof HTMLInputElement && t.checked;

/** Settings' fields, by the data-bind they carry, read on change; each change to a setting goes through `act`, with no Undo step (an edit, as before r57) unless it says. */
export const SETTINGS_BINDS: Readonly<Record<string, (t: Field) => void>> = {
  unit(t) {
    const u = t.value === 'kg' ? 'kg' : 'lb';
    act(() => {
      state.settings.unit = u;
    });
    unitWords();
    render();
  },
  theme(t) {
    const v = t.value;
    if (v !== 'system' && v !== 'dark' && v !== 'light') return;
    act(() => {
      state.settings.theme = v;
    });
    render();
  },
  rirMode(t) {
    const v = t.value === 'off' || t.value === 'cal' ? t.value : 'on';
    act(() => {
      state.settings.rirMode = v;
    });
    rerenderKeepScroll();
    toast(
      v === 'off'
        ? 'RIR off: every working set counts as hard'
        : v === 'cal'
          ? 'RIR corrected by your calibration sets'
          : 'RIR on, used as logged'
    );
  },
  rirScale(t) {
    const v = t.value;
    act(() => {
      if (v === 'half' || v === 'rpe') state.settings.rirScale = v;
      else delete state.settings.rirScale;
    });
    rerenderKeepScroll();
  },
  rirAsk(t) {
    const on = checked(t);
    act(() => {
      if (on) state.settings.rirAsk = true;
      else delete state.settings.rirAsk;
    });
    rerenderKeepScroll();
  },
  rirHalf(t) {
    const on = checked(t);
    act(
      () => {
        if (on) state.settings.rirHalf = true;
        else delete state.settings.rirHalf;
      },
      { undo: true }
    );
    rerenderKeepScroll();
    toast(
      on
        ? `${halfLbl()} now counts as half a set`
        : `Only ${effName()} ${effShow(HARD_RIR)} ${rirScale() === 'rpe' ? 'or more' : 'or less'} counts`,
      true
    );
  },
  timerMode(t) {
    const v = t.value === 'manual' || t.value === 'off' ? t.value : 'auto';
    act(() => {
      state.settings.timerMode = v;
    });
    if (v === 'off') stopTimer();
    rerenderKeepScroll();
  },
  timerSound(t) {
    const on = checked(t);
    act(() => {
      state.settings.timerSound = on;
    });
    if (on) primeAudio();
  },
  timerCompact(t) {
    const on = checked(t);
    act(() => {
      state.settings.timerCompact = on;
    });
    timerRefresh();
  },
  autoDone(t) {
    const on = checked(t);
    act(() => {
      state.settings.autoDone = on;
    });
    rerenderKeepScroll();
  },
  smallPlates(t) {
    const on = checked(t);
    act(() => {
      if (on) state.settings.smallPlates = true;
      else delete state.settings.smallPlates;
    });
  },
  bwEvery(t) {
    const v = +t.value;
    act(() => {
      const k = bwEveryKept(v);
      if (k !== undefined) state.settings.bwEvery = k;
      else delete state.settings.bwEvery;
    });
    rerenderKeepScroll();
  },
  todayStart(t) {
    const free = t.value === 'free';
    act(() => {
      if (free) state.settings.todayStart = 'free';
      else delete state.settings.todayStart;
    });
    rerenderKeepScroll();
  },
  autoAdj(t) {
    const on = checked(t);
    act(() => {
      if (on) delete state.settings.autoAdj;
      else state.settings.autoAdj = false;
    });
  },
  wakeLock(t) {
    const on = checked(t);
    act(() => {
      state.settings.wakeLock = on;
    });
    if (on && state.draft) wakeOn();
    else if (!on) wakeOff();
  },
  timeBudget(t) {
    const n = numIn(t.value);
    act(() => {
      state.settings.timeBudget =
        n == null || n < LIMITS.budgetMin[0] ? null : Math.min(Math.round(n), LIMITS.budgetMin[1]);
    });
  },
  barKg(t) {
    const n = numIn(t.value);
    act(() => {
      // Within the bar's bound in kilograms, the one a save keeps (r61; until then 110 in lb and 50 in kg, typed).
      state.settings.barKg = n == null || n <= 0 ? null : Math.min(fromD(n) ?? 0, LIMITS.barKg);
    });
    rerenderKeepScroll();
  },
  userName(t) {
    const n = t.value.replace(/\s+/g, ' ').trim().slice(0, LIMITS.name);
    act(() => {
      if (n) state.settings.userName = n;
      else delete state.settings.userName;
    });
  },
  bwGoalPct(t) {
    const n = numIn(t.value);
    act(() => {
      state.settings.bwGoalPct = n == null ? null : Math.min(Math.max(n, -LIMITS.bwRatePct), LIMITS.bwRatePct);
    });
  }
};

/** A weekly set target typed (data-band, on input): the number, in halves from 0 to LIMITS.weeklySets, saved once the typing pauses. */
export function bandInput(t: Field): void {
  const m = MK.find(x => x === t.dataset.band);
  const n = numIn(t.value);
  if (!m || n == null) return;
  const i = t.dataset.bi === '1' ? 1 : 0;
  act(
    () => {
      state.settings.bands[m][i] = Math.min(Math.max(Math.round(n * 2) / 2, 0), LIMITS.weeklySets);
    },
    { soon: true }
  );
}
/** A weekly set target left (data-band, on change): never a minimum above the maximum. */
export function bandChange(t: Field): void {
  const m = MK.find(x => x === t.dataset.band);
  if (!m) return;
  act(() => {
    const b = state.settings.bands[m];
    if (b[0] > b[1]) b.reverse();
  });
  rerenderKeepScroll();
}
/** A Your gym field left (data-gym, on change). */
export function gymField(t: Field): void {
  // Every Your gym field is a text input.
  if (t instanceof HTMLInputElement) gymInput(t);
}
