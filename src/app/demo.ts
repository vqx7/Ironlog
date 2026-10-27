/* Demo data (reworked in r29, V: the old demo "feels shitty and demotivates
   users"; moved from the legacy script's 26-import.js and 27-actions.js in
   r63). It is a lifter who follows the active routine and the app's own
   double progression: every set adds a rep each session until all reach the
   top of the range, then the load goes up one real step (progStep) and the
   reps start again near the bottom. Every planned session is done, RIR sits
   at the plan's, so Stats shows steady PRs, lifts moving, and volume on
   target, which is what following the routine looks like. Today is left
   open, so the next workout is ready to start. Seeded, so the same routine
   always gives the same demo.

   Looked at before setting up (V, r28): whatever is changed while looking
   around is put back once the demo is cleared (storage.ts, demoKeep and
   demoRestore), so a real start begins on the default layout. */

import { addDays, isNum, mulberry, today, uid, weekStart, WEEK_DAYS } from './util';
import { IN, LB } from './units';
import { isCompound, loadMode } from './library';
import { platesMode } from './gym';
import { DEMO_WEEKS } from './importing';
import { DELOAD_NOTE } from './session';
import { cleanSess } from './normalize';
import { demoFirstRun, demoKeep } from './storage';
import { cloudStop } from './sync';
import { EX, activeRoutine, exBarKg, lighterLoad, progStep } from './live';
import { acct, cloud, state, ui } from './store';
import type { PlanItem } from './types';
import { act } from './act';
import { confirmBox, render } from './page';
import { toast } from './toast';
import { fitTargets } from './targets';
import type { Tap } from './workstate';

/* Working loads in lb near the end of the 8 weeks, for an intermediate
   lifter of 185 lb. Dumbbells are per dumbbell; bodyweight lifts are added load. */
// A table read as one, a few muscles' lifts a line; the formatter would put each of its 70 lifts on a line of its own.
// prettier-ignore
const BASE_LB: Readonly<Record<string, number>> = {bench:225,incBench:185,ohp:135,backSquat:275,frontSquat:205,rdl:245,sldl:225,rackPull:365,hackSquat:315,legPress:540,bss:40,hipThrust:275,goblet:70,revLunge:40,dbRdl:70,slRdl:40,
  bbRow:185,cableRow:180,machRow:180,landmineRow:180,latPulldown:160,leanAwayLat:35,pullup:25,dips:45,dbRow:80,csDbRow:55,dbPullover:65,
  seatedDbPress:60,machPress:180,machShoulder:130,incDb:65,dbBench:70,cableFly:35,lowHighFly:35,pecDeck:150,
  cableLateral:20,dbLateral:25,cableY:15,facePull:50,reversePecDeck:100,dbRearFly:20,kelsoShrug:155,dbShrug:70,
  inclineCurl:30,bayesianCurl:30,preacher:80,hammer:35,dbCurl:35,reverseCurl:60,wristCurl:85,revWristCurl:45,ohCableExt:70,jmPress:135,pressdown:80,ohDbExt:50,
  woodchop:50,cableCrunch:120,legExt:180,adductor:200,abductor:200,standCalf:250,seatedCalf:160,slCalf:25,seatedCurl:130,lyingCurl:110,tibRaise:35,neckCurl:25,neckExt:45,hyperext:35};
/** A lift not in that table: a load by its equipment, a compound's and an isolation lift's, in lb. */
const EQ_LB: Readonly<Record<string, readonly [number, number]>> = {
  barbell: [185, 65],
  dumbbell: [60, 25],
  cable: [150, 45],
  machine: [180, 100],
  smith: [185, 95],
  landmine: [150, 60],
  other: [50, 50],
  bodyweight: [0, 0]
};
/** The demo lifter: bodyweight in lb, an assisted lift's help to start, the share of the end load to start at, a fallback step in lb, how often a last set falls a rep short, the RIR planned when none is, the highest RIR logged, and the percent of load a rep is worth (about a rep for each 2.5% added). */
const LIFTER = {
  bw: 185,
  help: 40,
  near: 0.9,
  step: 5,
  short: 0.15,
  rir: 1,
  rirTop: 3,
  repPct: 2.5,
  seed: 11
} as const;
/** The marked deload week, and the week with one day missed, in days back from this week (r30, V's choice). */
const BACK = { deload: 21, missed: 42 } as const;
/** A deload's sessions: the reps in reserve. */
const DELOAD_RIR = 3;
/** The demo's weigh-ins: every other day for the last 56, starting 1.5 lb under, gaining 0.03 a day, with up to 0.6 either way. */
const WEIGH = { days: 56, every: 2, under: 1.5, perDay: 0.03, spread: 1.2, centre: 0.5 } as const;
/** How far under the bar a load may be and still read as the bar (rounding). */
const BAR_EPS = 1e-6;
/** The demo's two sets of measurements in inches, 8 weeks back and yesterday. */
const MEASURE = {
  before: { arm: 16.0, forearm: 13.1, chest: 44.0, waist: 33.5, thigh: 24.0, calf: 15.0, neck: 16.0 },
  after: { arm: 16.3, forearm: 13.2, chest: 44.4, waist: 33.4, thigh: 24.4, calf: 15.1, neck: 16.2 }
} as const;
/** A percent. */
const PCT = 100;
/** The reps when a plan gives none. */
const REPS_DEF = 8;
/** Measurements in inches, as stored (centimetres). */
const inches = (o: Readonly<Record<string, number>>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * IN]));

/** A lift as the demo reads it. */
type Lift = ReturnType<typeof EX>;
/** A lift's progression in the demo: its load, its reps level, the sessions of a bodyweight lift, and the reps of its last session. */
interface Prog {
  w: number;
  reps: number[] | null;
  lv: number;
  n: number;
}

/** Makes the demo log from the active routine: 8 weeks of sessions, a deload week, a missed day, weigh-ins and measurements, all tagged demo; the lifter's own log is never changed. */
export function makeDemo(): void {
  act(() => {
    state.sessions = state.sessions.filter(s => !s.demo);
    state.bodyweights = state.bodyweights.filter(b => !b.demo);
    state.measurements = state.measurements.filter(m => !m.demo);
    const R = activeRoutine();
    const rnd = mulberry(LIFTER.seed);
    const eqBase = (e: Lift) => {
      const c = isCompound(e);
      const t = EQ_LB[e.equip] || EQ_LB['other'] || [0, 0];
      return t[c ? 0 : 1];
    };
    const BW = LIFTER.bw;
    const cur = weekStart(today());
    const t = today();
    const realDates = new Set(state.sessions.map(x => x.date));
    const realBW = new Set(state.bodyweights.map(x => x.date)),
      realMeas = new Set(state.measurements.map(x => x.date));
    // Weekly routines land on their weekdays; cycles run in order, one cycle
    // day per calendar day, across the same eight weeks.
    const slots: { date: string; di: number }[] = [];
    if (R.schedule === 'weekly') {
      for (let k = 0; k < DEMO_WEEKS; k++) {
        const ws = addDays(cur, -WEEK_DAYS * (DEMO_WEEKS - 1 - k));
        R.days.forEach((_, di) => slots.push({ date: addDays(ws, di), di }));
      }
    } else {
      const start = addDays(cur, -WEEK_DAYS * (DEMO_WEEKS - 1));
      for (let p = 0; ; p++) {
        const date = addDays(start, p);
        if (date > t) break;
        slots.push({ date, di: p % R.days.length });
      }
    }
    // One progression per lift and rep range, like the app's own targets.
    const prog: Record<string, Prog> = {};
    const startOf = (e: Lift, it: PlanItem): { w: number; reps: null } => {
      const known = BASE_LB[it.exId];
      const lb = (known != null && known > 0) || (e.bw && known === 0) ? known || 0 : eqBase(e);
      // An assisted lift starts with 40 lb of help and earns its way down.
      if (e.assist) return { w: -LIFTER.help * LB, reps: null };
      const step = progStep(e, it, lb * LB) || LIFTER.step * LB;
      // About eight weeks of progress below the end load, in whole steps.
      let w = lb > 0 ? Math.max(step, Math.round((lb * LB * LIFTER.near) / step) * step) : 0;
      // Never under the bar on a lift loaded on one (a light wrist curl was).
      if (w > 0 && platesMode(e) === 'bar' && loadMode(e) === 'total') {
        const bar = exBarKg(e);
        if (w < bar - BAR_EPS) w = bar;
      }
      return { w, reps: null };
    };
    /* r30 (V's choice): one marked deload week, three weeks back, and one
       missed day, six weeks back, so the demo shows how a deload is handled
       (left out of trends, stalls, targets and the volume average) and a gap.
       The missed day sits outside the weeks the volume average reads, and the
       deload week is skipped by it, so nothing reads below target. */
    const dlw = addDays(weekStart(t), -BACK.deload),
      msw = addDays(weekStart(t), -BACK.missed);
    let msn = 0;
    for (const sl of slots) {
      const date = sl.date,
        di = sl.di,
        d = R.days[di];
      if (!d || d.rest || !d.items.length || date >= t) continue;
      // A demo session on a day with a real one stacked two sessions of the same
      // lift on one date, and the strength chart plunged between them.
      if (realDates.has(date)) continue;
      if (weekStart(date) === msw && msn++ === 1) continue;
      if (weekStart(date) === dlw) {
        // Half the sets (rounded up) at about 90% loads in real steps, the bottom of the range, 3 RIR. The progression waits.
        const ex = d.items.map(it => {
          const e = EX(it.exId);
          const key = it.exId + '|' + it.repMin + '-' + it.repMax;
          const g =
            prog[key] ||
            (prog[key] = Object.assign(startOf(e, it), {
              lv: Math.round(((+it.repMin || REPS_DEF) + Math.max(+it.repMin || REPS_DEF, +it.repMax || REPS_DEF)) / 2),
              n: 0
            }));
          const n = Math.max(1, Math.ceil(it.sets / 2));
          const lo = +it.repMin || REPS_DEF;
          const w = e.assist
            ? g.w - (progStep(e, it, BW * LB) || LIFTER.step * LB)
            : g.w > 0
              ? lighterLoad(e, it, g.w, g.w * LIFTER.near)
              : g.w;
          return { exId: it.exId, sets: Array.from({ length: n }, () => ({ w, r: lo, rir: DELOAD_RIR, warm: false })) };
        });
        state.sessions.push(
          cleanSess(
            {
              id: uid(),
              date,
              dayIdx: di,
              dayId: d.id,
              dayName: d.name + ' (deload)',
              routineId: R.id,
              ex,
              notes: DELOAD_NOTE,
              deload: true,
              demo: true
            },
            state.sessions.length
          )
        );
        continue;
      }
      const ex = d.items.map(it => {
        const e = EX(it.exId);
        const key = it.exId + '|' + it.repMin + '-' + it.repMax;
        let g = prog[key];
        const lo = +it.repMin || REPS_DEF,
          hi = Math.max(lo, +it.repMax || lo);
        /* One level per lift: the first two sets make it, later sets a rep
           fewer from fatigue until the level reaches the top of the range,
           every set capped there. The level climbs a rep each session; once
           every set made the top, the load goes up one real step, which costs
           about a rep (2.5% on a compound) or two (5% on an isolation lift),
           so the estimate keeps climbing. Resetting reps to the bottom after
           each step read as a stall. A wide range starts in its middle, where
           a 90% load lands. */
        const repsAt = (lv: number, n: number) =>
          Array.from({ length: n }, (_, j) => Math.max(lo, Math.min(hi, lv - (j >= 2 && lv < hi ? 1 : 0))));
        // A bodyweight lift with no load to add climbs a rep every other
        // session from the bottom: parked at the top it read as a stall.
        const known = BASE_LB[it.exId];
        const pureBw = e.bw && !e.assist && !(known != null && known > 0);
        if (!g) {
          g = prog[key] = Object.assign(startOf(e, it), { lv: pureBw ? lo : Math.round((lo + hi) / 2), n: 0 });
        } else if (pureBw) {
          g.n++;
          if (g.n % 2 === 1) g.lv = Math.min(hi, g.lv + 1);
        } else if (repsAt(g.lv, it.sets).every(r => r >= hi) && (e.assist || g.w > 0 || !e.bw)) {
          // Every set at the top: one real step more (less help on an assisted
          // lift). A pure bodyweight lift with no load to add stays at the top.
          const was = (e.bw ? BW * LB : 0) + g.w;
          const step = progStep(e, it, e.assist ? BW * LB : was) || LIFTER.step * LB;
          if (e.assist) g.w = Math.min(0, g.w + step);
          else g.w = g.w + step;
          // About a rep for each 2.5% added: 1 on a heavy compound, 2 on an
          // isolation lift, and back near the bottom on a light dumbbell where
          // one 5 lb step is 15%.
          g.lv = Math.max(lo, hi - Math.max(1, Math.round(((step / Math.max(was, step)) * PCT) / LIFTER.repPct)));
        } else g.lv++;
        const reps = repsAt(g.lv, it.sets);
        g.reps = reps;
        // Now and then the last set falls a rep short; the best set is unchanged.
        const lastR = reps[reps.length - 1];
        if (reps.length > 2 && lastR != null && rnd() < LIFTER.short) reps[reps.length - 1] = Math.max(lo, lastR - 1);
        const rir = Math.max(0, Math.min(LIFTER.rirTop, isNum(+it.rir) ? +it.rir : LIFTER.rir));
        const w = g.w;
        const sets = reps.map((r, j) => ({
          w,
          r,
          rir: j === reps.length - 1 ? Math.max(0, rir - 1) : rir,
          warm: false
        }));
        return { exId: it.exId, sets };
      });
      state.sessions.push(
        cleanSess(
          { id: uid(), date, dayIdx: di, dayId: d.id, dayName: d.name, routineId: R.id, ex, notes: '', demo: true },
          state.sessions.length
        )
      );
    }
    for (let i = WEIGH.days; i >= 1; i -= WEIGH.every) {
      const date = addDays(t, -i);
      if (realBW.has(date)) continue;
      state.bodyweights.push({
        id: uid(),
        date,
        kg: (BW - WEIGH.under + (WEIGH.days - i) * WEIGH.perDay + (rnd() - WEIGH.centre) * WEIGH.spread) * LB,
        demo: true
      });
    }
    const back = addDays(t, -WEEK_DAYS * DEMO_WEEKS);
    if (!realMeas.has(back)) state.measurements.push({ id: uid(), date: back, ...inches(MEASURE.before), demo: true });
    const yday = addDays(t, -1);
    if (!realMeas.has(yday)) state.measurements.push({ id: uid(), date: yday, ...inches(MEASURE.after), demo: true });
  });
}

/** How long the demo's refusal stays, in milliseconds. */
const DEMO_SAID = 6000;

/** The demo's tap, by data-act. */
export const DEMO_ACTS: Readonly<Record<string, (t: Tap) => void>> = {
  /* Signed in, the demo would sync into the account (r55.1, the second
     review of r55); signing out to load it would make the next sign-in a
     first link, which brings back what other phones deleted meanwhile, so it
     is not offered. */
  demoLoad() {
    if (acct.user) {
      toast('Demo data is for looking around before you sign in, so it stays off your account.', null, DEMO_SAID);
      return;
    }
    confirmBox(
      'Load demo data?',
      'Adds 8 weeks of generated sessions tagged as demo, based on your active routine. Your own logs are not changed.',
      'Load demo data',
      () => {
        const first = demoFirstRun();
        demoKeep();
        // On a first run the targets fit the routine, as picking it would (r29);
        // demoRestore puts the settings back when the demo is cleared.
        act(() => {
          if (first) fitTargets(activeRoutine());
          if (!cloud.on) cloudStop(true);
          makeDemo();
        });
        ui.tab = 'dash';
        window.scrollTo(0, 0);
        render();
        toast('Demo data loaded');
      }
    );
  }
};
