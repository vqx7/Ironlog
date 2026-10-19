/* Routines as data: the weekday names, the default plan for an exercise, and
   the ready-made routines with the function that copies one (phase 2, r50;
   moved unchanged from the legacy script, tests/moved.js holds them to r49's
   code). Which routine a lifter starts on, and anything that reads the log,
   stays with the app's state. */

import type { Day, Plan, PlanItem, Profile, Routine, Session, SessionEx } from './types';
import type { ExerciseLike, Model } from './model';
import { andList, uid } from './util';
import { LB } from './units';
import { EXIn, activeRoutineIn, exNameIn, profIn, rirHalfOnIn } from './model';
import { isCompound, profHeavy } from './library';
import { isWork } from './formulas';
import { sessCmp } from './records';

/** A plan item as a routine is first made: normalize() adds its superset
    link (null) when the routine is saved. */
export type NewItem = Omit<PlanItem, 'ss' | 'jump'>;

/** A routine as first made, before normalize() completes its items. */
export type NewRoutine = Omit<Routine, 'days'> & { days: (Omit<Day, 'items'> & { items: NewItem[] })[] };

/** A ready-made routine's exercise: the plan without ids, which a copy gets. */
export type TemplateItem = Pick<PlanItem, 'exId' | 'sets' | 'repMin' | 'repMax' | 'rir' | 'rest'>;
export interface TemplateDay {
  name: string;
  items: TemplateItem[];
  rest?: boolean;
}

/** A ready-made routine: its days, or (the hidden legacy one) a function that builds it. */
export type Template = { key: string; name: string; who: string; meta: string; hidden?: boolean } & (
  | { days: TemplateDay[]; build?: undefined }
  | { build: () => NewRoutine; days?: undefined }
);

/** The weekday names, Monday first, in the order a weekly routine's days are kept. */
export const DAYS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The most days a routine can have. */
export const MAX_DAYS = 14;

/** A routine day's label: the weekday on a weekly schedule, else its place in the cycle. */
export function dayLabel(R: Pick<Routine, 'schedule'> | null | undefined, i: number): string {
  return R && R.schedule === 'weekly' ? DAYS[i] : `Day ${i + 1}`;
}

/** The plan an exercise gets when nothing else sets one: 3 sets of 8 to 12 at
    1 in reserve (a convention: CLAUDE.md, Evidence base, Target RIR of 1),
    90 s rest (Singer 2024 found no difference in growth past 90 s), and the
    default load step (5 lb, read as 2.5 kg by a lifter in kg; STEP_LB). */
export const DEFAULT_PLAN: Readonly<Plan> = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * LB };

/** The routine installs started with before r29 (the template marked legacy). */
// A table, one day a line, so a day's exercises can be read and checked whole; the formatter would spread each set over its own line.
// prettier-ignore
export function defaultRoutine(): NewRoutine {
  const I = (exId: string, sets: number, repMin: number, repMax: number, rir: number, rest: number): NewItem => ({ uid: uid(), exId, sets, repMin, repMax, rir, rest, inc: 5 * LB });
  const D = (name: string, items: NewItem[], rest?: boolean) => ({ id: uid(), name, rest: !!rest, items });
  return {id:uid(),name:'One muscle a day, high volume',schedule:'cycle',days:[
    D('Chest',[I('incBench',4,6,10,1,180),I('bench',3,6,10,1,180),I('dips',3,8,12,1,120),I('lowHighFly',3,10,15,0,90),I('pecDeck',2,12,15,0,75),I('deficitPushup',2,10,25,0,75),I('cableCrunch',3,10,15,1,60)]),
    D('Back',[I('pullup',4,6,10,1,150),I('landmineRow',3,8,12,1,120),I('cableRow',3,8,12,1,120),I('dbPullover',3,10,15,1,90),I('kelsoShrug',3,10,15,1,90),I('rackPull',3,5,8,2,180)]),
    D('Legs A: quads',[I('hackSquat',4,6,12,1,180),I('legPress',3,10,15,1,150),I('bss',3,8,12,1,120),I('legExt',3,10,15,0,90),I('sissy',2,8,15,1,90),I('adductor',3,10,15,1,75),I('standCalf',4,8,12,0,60),I('tibRaise',2,15,25,1,45)]),
    D('Shoulders',[I('seatedDbPress',3,6,10,1,150),I('cableLateral',4,10,20,0,60),I('leanAwayLat',3,10,15,0,60),I('cableY',2,12,20,0,60),I('reversePecDeck',4,12,20,0,60),I('facePull',2,12,20,0,60),I('dbShrug',3,8,12,1,75),I('hangingLegRaise',3,10,15,1,60),I('neckCurl',2,15,20,2,45),I('neckExt',2,15,20,2,45)]),
    D('Legs B: posterior',[I('sldl',4,6,10,2,180),I('seatedCurl',4,8,12,0,90),I('nordic',3,3,8,1,120),I('hyperext',3,10,15,1,75),I('abductor',4,12,20,0,60),I('seatedCalf',4,10,15,0,60),I('abWheel',3,8,15,1,60)]),
    D('Arms',[I('ohCableExt',4,8,12,0,75),I('jmPress',3,6,10,1,120),I('pressdown',3,10,15,0,60),I('inclineCurl',4,8,12,0,75),I('bayesianCurl',3,10,15,0,60),I('preacher',3,8,12,0,60),I('hammer',2,10,12,1,60),I('wristCurl',2,12,20,0,45),I('revWristCurl',2,12,20,0,45),I('woodchop',3,10,15,1,45)]),
    D('Rest',[],true)
  ]};
}

/* Ready-made routines, so nobody has to build one from scratch. Most land
   near 10 to 20 hard sets a week for the major muscles (the beginner,
   two-day, strength and dumbbell ones are lighter on purpose), trains most of them
   twice a week where the days allow it (with weekly volume matched, how often
   a muscle is trained made no detectable difference to growth: Schoenfeld,
   Grgic and Krieger 2019, in CLAUDE.md's Evidence base; so frequency matters
   mainly as a way to spread volume), and keeps sessions
   near an hour. Rep ranges and RIR follow the same conventions as the rest of
   the app. They are starting points: everything is editable in Plan. */
// A table, one day a line, as defaultRoutine above.
// prettier-ignore
export const TEMPLATES: readonly Template[] = (() => {
  const I = (exId: string, sets: number, repMin: number, repMax: number, rir: number, rest: number): TemplateItem => ({ exId, sets, repMin, repMax, rir, rest });
  const D = (name: string, items: TemplateItem[]): TemplateDay => ({ name, items }), R = (): TemplateDay => ({ name: 'Rest', items: [], rest: true });
  return [
    /* New to lifting (r30, from the review: 7 exercises, about 19 sets and
       over an hour, with incline curls and hack squats, was not a first
       routine). Five exercises a day on machines and dumbbells, 2 to 3 sets,
       3 reps in reserve (easy to judge: stop when a rep slows down), about
       45 minutes. Weekly sets sit under the usual 10 on purpose; add a set as
       it gets easy. */
    {key:'full3',name:'Full body, 3 days',who:'New to lifting: five exercises a day, machines and dumbbells, stopping well short of failure. Add a set once it feels easy',meta:'3 days a week',days:[
      D('Full body A',[I('legPress',3,8,12,3,120),I('machPress',3,8,12,3,120),I('latPulldown',3,8,12,3,120),I('seatedCurl',2,10,15,2,75),I('dbLateral',2,10,15,2,60)]),R(),
      D('Full body B',[I('goblet',3,8,12,3,120),I('incDb',3,8,12,3,120),I('cableRow',3,8,12,3,120),I('dbRdl',3,8,12,3,120),I('pressdown',2,10,15,2,60)]),R(),
      D('Full body C',[I('legPress',3,8,12,3,120),I('dbBench',3,8,12,3,120),I('machRow',3,8,12,3,120),I('lyingCurl',2,10,15,2,75),I('dbCurl',2,10,15,2,60)]),R(),R()]},
    /* Past the first year, three days a week (r45, V): the full3 days are a
       first routine (machines, 3 in reserve, under 10 sets a muscle), so a
       trained lifter with three days had only Strength or the dumbbell
       routine. The main barbell lifts at 6 to 10 and 2 in reserve, the
       rest at 1, 6 to 9 hard sets a week for each major muscle (a helper
       muscle counting half), about an hour a day. Conventions, as everywhere here. */
    {key:'full3t',name:'Full body, 3 days, trained',who:'Past your first year: the main lifts and their accessories, the whole body three times a week',meta:'3 days a week',days:[
      D('Full body A',[I('backSquat',3,6,10,2,180),I('bench',3,6,10,2,150),I('cableRow',3,8,12,1,120),I('seatedCurl',3,10,15,1,75),I('dbLateral',3,10,20,1,60),I('inclineCurl',2,10,15,1,60)]),R(),
      D('Full body B',[I('rdl',3,6,10,2,150),I('ohp',3,6,10,2,150),I('pullup',3,6,10,2,150),I('legPress',3,10,15,1,120),I('cableFly',3,10,15,1,75),I('standCalf',3,10,15,1,60)]),R(),
      D('Full body C',[I('hackSquat',3,8,12,1,150),I('incDb',3,8,12,1,120),I('latPulldown',3,8,12,1,120),I('lyingCurl',3,10,15,1,75),I('cableLateral',3,10,20,1,60),I('ohCableExt',3,10,15,1,60),I('seatedCalf',3,10,15,1,60)]),R(),R()]},
    /* Two days a week (r30): the whole body each day, about an hour. */
    {key:'full2',name:'Full body, 2 days',who:'Two sessions a week: the whole body each time',meta:'2 days a week',days:[
      D('Full body A',[I('backSquat',3,6,10,2,180),I('bench',3,6,10,2,150),I('cableRow',3,8,12,2,120),I('seatedCurl',3,10,15,1,75),I('dbLateral',3,10,20,1,60),I('inclineCurl',2,10,15,1,60)]),R(),R(),
      D('Full body B',[I('rdl',3,6,10,2,150),I('incDb',3,8,12,2,120),I('latPulldown',3,8,12,2,120),I('legPress',3,10,15,1,120),I('cableLateral',3,10,20,1,60),I('ohCableExt',2,10,15,1,60),I('standCalf',3,10,15,1,60)]),R(),R(),R()]},
    {key:'ul4',name:'Upper / lower, 4 days',who:'The common all-round choice',meta:'4 days a week',days:[
      D('Upper A',[I('bench',4,6,10,2,150),I('bbRow',3,6,10,2,150),I('latPulldown',4,8,12,1,120),I('cableFly',2,10,15,1,75),I('dbLateral',5,10,20,1,60),I('facePull',2,12,20,1,60),I('pressdown',3,10,15,1,60),I('inclineCurl',3,10,15,1,60)]),
      D('Lower A',[I('backSquat',3,6,10,2,180),I('rdl',3,6,10,2,150),I('legExt',3,10,15,1,75),I('seatedCurl',3,10,15,1,75),I('standCalf',4,10,15,1,60),I('cableCrunch',3,10,15,1,60)]),R(),
      D('Upper B',[I('incDb',4,8,12,2,120),I('cableRow',4,8,12,1,120),I('pullup',3,6,10,2,150),I('cableLateral',5,10,20,1,60),I('reversePecDeck',3,12,20,1,60),I('ohCableExt',3,10,15,1,60),I('hammer',3,10,15,1,60)]),
      D('Lower B',[I('hackSquat',3,8,12,1,150),I('hipThrust',3,8,12,1,120),I('lyingCurl',3,10,15,1,75),I('bss',2,8,12,1,90),I('seatedCalf',4,10,15,1,60),I('hangingLegRaise',3,10,15,1,60)]),R(),R()]},
    {key:'ppl6',name:'Push / pull / legs, 6 days',who:'Training most days, wants more volume',meta:'6 days a week',days:[
      D('Push A',[I('bench',3,6,10,2,150),I('seatedDbPress',3,8,12,1,120),I('cableFly',3,10,15,1,75),I('cableLateral',4,10,20,1,60),I('ohCableExt',3,10,15,1,60)]),
      D('Pull A',[I('pullup',4,6,10,1,150),I('bbRow',3,6,10,2,150),I('facePull',3,12,20,1,60),I('inclineCurl',3,10,15,1,60),I('hammer',2,10,15,1,60)]),
      D('Legs A',[I('backSquat',3,6,10,2,180),I('rdl',3,6,10,2,150),I('legExt',3,10,15,1,75),I('seatedCurl',3,10,15,1,75),I('standCalf',4,10,15,1,60),I('cableCrunch',3,10,15,1,60)]),
      D('Push B',[I('incBench',3,6,10,2,150),I('machShoulder',3,8,12,1,120),I('pecDeck',3,10,15,0,75),I('dbLateral',4,12,20,0,60),I('pressdown',3,10,15,1,60)]),
      D('Pull B',[I('latPulldown',4,8,12,1,120),I('machRow',3,8,12,1,120),I('reversePecDeck',3,12,20,0,60),I('bayesianCurl',3,10,15,0,60),I('reverseCurl',2,10,15,1,60)]),
      D('Legs B',[I('hackSquat',3,8,12,1,150),I('hipThrust',3,8,12,1,120),I('lyingCurl',3,10,15,1,75),I('bss',2,8,12,1,90),I('seatedCalf',4,10,15,1,60),I('hangingLegRaise',3,10,15,1,60)]),R()]},
    {key:'split5',name:'Body-part split, 5 days',who:'The classic gym split, one or two muscles a day',meta:'5 days a week',days:[
      D('Chest',[I('bench',3,6,10,2,150),I('incDb',3,8,12,1,120),I('cableFly',3,10,15,1,75),I('dips',2,8,12,1,120),I('cableCrunch',3,10,15,1,60)]),
      D('Back',[I('pullup',4,6,10,1,150),I('bbRow',3,6,10,2,150),I('cableRow',3,8,12,1,120),I('latPulldown',3,8,12,1,120),I('reversePecDeck',3,12,20,0,60)]),
      D('Legs',[I('backSquat',3,6,10,2,180),I('rdl',3,6,10,2,150),I('legPress',3,10,15,1,120),I('legExt',3,10,15,1,75),I('seatedCurl',4,10,15,1,75),I('hipThrust',3,8,12,1,120),I('standCalf',4,10,15,1,60)]),
      // Lateral raises split over two days (r30): nine sets in one session added little past the first five or six.
      D('Shoulders',[I('ohp',3,6,10,2,150),I('cableLateral',5,10,20,1,60),I('facePull',3,12,20,1,60),I('dbShrug',3,10,15,1,60),I('seatedCalf',4,10,15,1,60),I('hangingLegRaise',3,10,15,1,60)]),
      D('Arms and legs',[I('inclineCurl',4,8,12,1,75),I('ohCableExt',4,8,12,1,75),I('hammer',3,10,12,1,60),I('pressdown',3,10,15,1,60),I('dbLateral',4,12,20,1,60),I('bss',3,8,12,1,90),I('lyingCurl',3,10,15,1,75)]),R(),R()]},
    /* Strength (r30, from the review: nothing for someone after a stronger
       squat, bench and deadlift). The classic five sets of five, alternating
       two days: when all five sets reach 5, the load goes up a step; two
       sessions short of 5 bring it down to what the estimate says fits.
       Fewer sets per muscle than the weekly targets, on purpose. */
    {key:'str5',name:'Strength, 5 x 5',who:'Stronger squat, bench, press, row, and deadlift: five sets of five, a step more each time all five reach 5',meta:'every other day',days:[
      D('Strength A',[I('backSquat',5,5,5,2,180),I('bench',5,5,5,2,180),I('bbRow',5,5,5,2,150)]),R(),
      D('Strength B',[I('backSquat',5,5,5,2,180),I('ohp',5,5,5,2,180),I('deadlift',1,5,5,2,240)]),R()]},
    {key:'db3',name:'Dumbbells only, 3 days',who:'Home or hotel gym: dumbbells and a bench. A lighter start, like full body: fewer sets a week than the targets, so add a set as it gets easy',meta:'3 days a week',days:[
      D('Dumbbell A',[I('goblet',3,8,15,2,120),I('dbBench',3,8,12,2,120),I('dbRow',3,8,12,2,90),I('dbLateral',3,12,20,1,60),I('dbRearFly',3,12,20,1,60),I('dbCurl',3,10,15,1,60),I('slCalf',3,10,15,1,45)]),R(),
      D('Dumbbell B',[I('dbRdl',3,8,12,2,120),I('seatedDbPress',3,8,12,2,120),I('csDbRow',3,8,12,1,90),I('revLunge',3,8,12,2,90),I('dbLateral',3,12,20,1,60),I('ohDbExt',3,10,15,1,60),I('reverseCrunch',2,10,15,1,60)]),R(),
      D('Dumbbell C',[I('bss',3,8,12,2,90),I('incDb',3,8,12,2,120),I('dbPullover',3,10,15,1,75),I('slRdl',3,8,12,1,75),I('dbRearFly',2,12,20,1,60),I('hammer',3,10,15,1,60),I('slCalf',3,10,15,1,45)]),R(),R()]},
    /* High volume, trimmed (r30, from the review: 17 chest sets in one
       session, mostly to failure, and a neck circuit on shoulder day). At
       most 11 sets for one muscle in a session (the app's per-session line),
       isolation lifts at 1 RIR with a few at 0, no neck work (tracked only).
       Installs before r30 keep their copy; Plan changes it. */
    {key:'onemuscle',name:'One muscle a day, high volume',who:'Experienced, six days a week. Long sessions with many sets for one muscle, up to 11',meta:'6 days a week',days:[
      D('Chest',[I('incBench',4,6,10,1,180),I('bench',3,6,10,1,180),I('lowHighFly',2,10,15,1,90),I('pecDeck',2,12,15,0,75),I('cableCrunch',3,10,15,1,60)]),
      D('Back',[I('pullup',4,6,10,1,150),I('landmineRow',3,8,12,1,120),I('cableRow',2,8,12,1,120),I('dbPullover',3,10,15,1,90),I('kelsoShrug',2,10,15,1,90),I('rackPull',2,5,8,2,180)]),
      D('Legs A: quads',[I('hackSquat',4,6,12,1,180),I('legPress',3,10,15,1,150),I('legExt',2,10,15,0,90),I('bss',2,8,12,1,120),I('adductor',3,10,15,1,75),I('standCalf',4,8,12,1,60),I('tibRaise',2,15,25,1,45)]),
      D('Shoulders',[I('seatedDbPress',3,6,10,1,150),I('cableLateral',5,10,20,1,60),I('leanAwayLat',4,10,15,1,60),I('reversePecDeck',4,12,20,1,60),I('facePull',2,12,20,1,60),I('dbShrug',3,8,12,1,75),I('hangingLegRaise',3,10,15,1,60)]),
      D('Legs B: posterior',[I('sldl',4,6,10,2,180),I('seatedCurl',3,8,12,1,90),I('nordic',2,3,8,1,120),I('hyperext',3,10,15,1,75),I('abductor',4,12,20,1,60),I('seatedCalf',4,10,15,0,60),I('abWheel',3,8,15,1,60)]),
      D('Arms',[I('ohCableExt',4,8,12,1,75),I('jmPress',3,6,10,1,120),I('pressdown',3,10,15,0,60),I('inclineCurl',4,8,12,1,75),I('bayesianCurl',3,10,15,1,60),I('preacher',3,8,12,0,60),I('wristCurl',2,12,20,1,45),I('revWristCurl',2,12,20,1,45),I('woodchop',3,10,15,1,45)]),
      R()]},
    // The routine installs started with before r29, kept for the suites written on it (tests/h.js) and to recognise it; never offered.
    {key:'legacy',hidden:true,name:'One muscle a day, high volume',who:'',meta:'',build:()=>defaultRoutine()}
  ];
})();

/* A routine from a template, with its own ids so it is independent of the template. */
export function routineFromTemplate(key: string): NewRoutine | null {
  const t = TEMPLATES.find(x => x.key === key);
  if (!t) return null;
  if (t.build) return t.build();
  return {
    id: uid(),
    name: t.name,
    schedule: 'cycle',
    days: t.days.map(d => ({
      id: uid(),
      name: d.name,
      rest: !!d.rest,
      items: d.items.map(it => ({ uid: uid(), ...it, inc: 5 * LB }))
    }))
  };
}

/* ---------- routine helpers (phase 3a, r51; moved unchanged, tests/moved.js holds them to r50's code) ---------- */

/** The parts of a routine these helpers read. */
type RoutineLike = {
  schedule: string;
  days: { id?: string; rest?: boolean; items: { ss?: string | null; sets?: number | string }[] }[];
};

/* Weekly numbers (planned volume, adherence, the week bar) assume one cycle day
   per calendar day. A 7-day cycle is therefore exactly 1x; a 4-day cycle runs
   1.75 times a week. */
export function weekFactor(R: RoutineLike): number {
  return R.schedule === 'weekly' ? 1 : 7 / Math.max(1, R.days.length);
}

/** The days of a routine with something to train. */
export function trainDaysOf(R: RoutineLike): number {
  return R.days.filter(d => !d.rest && d.items.length > 0).length;
}

/** Training days a week, for a weekly schedule or a cycle. */
export function plannedPerWeek(R: RoutineLike): number {
  return R.schedule === 'weekly' ? trainDaysOf(R) : Math.round(trainDaysOf(R) * weekFactor(R));
}

/* Sessions store the id of the day they were logged against, so reordering or
   removing cycle days never relinks history to the wrong workout. Sessions from
   before v3 have only a position, which is still correct because migration
   kept every day where it was. */
export function sessDayIdx(R: RoutineLike, s: { dayId?: string | null; dayIdx: number }): number {
  if (s.dayId) {
    const i = R.days.findIndex(d => d.id === s.dayId);
    return i;
  }
  return s.dayIdx >= 0 && s.dayIdx < R.days.length ? s.dayIdx : -1;
}

/** The sets a day plans. */
export function daySets(day: { items: { sets: number | string }[] }): number {
  return day.items.reduce((a, it) => a + +it.sets, 0);
}

/* A superset is consecutive items sharing an id. Groups of one are not
   supersets, so a reorder or delete that leaves a stray tag clears it. */
export function fixSupersets(items: { ss?: string | null }[]): void {
  let i = 0;
  while (i < items.length) {
    const id = items[i].ss;
    if (!id) {
      i++;
      continue;
    }
    let j = i;
    while (j < items.length && items[j].ss === id) j++;
    if (j - i < 2) items[i].ss = null;
    i = j;
  }
  // The same id reappearing later in the day would read as one group; give it its own.
  const seen = new Set<string>();
  let prev: string | null | undefined = null;
  items.forEach((it, k) => {
    if (it.ss && it.ss !== prev && seen.has(it.ss)) it.ss = it.ss + '-g' + k;
    if (it.ss) seen.add(it.ss);
    prev = it.ss;
  });
}

/* Letter per superset group, in order of first appearance, for labels. */
export function ssLetters(items: readonly { ss?: string | null }[]): Record<string, string> {
  const m: Record<string, string> = {};
  let n = 0;
  for (const it of items) if (it.ss && !(it.ss in m)) m[it.ss] = String.fromCharCode(65 + (n++ % 26));
  return m;
}

/* Toggle the link between entry i and i+1. get(x) returns the object holding ss. */
export function linkToggle<X>(arr: X[], i: number, get: (x: X) => { ss?: string | null }): boolean {
  const a = get(arr[i]),
    b = arr[i + 1] && get(arr[i + 1]);
  if (!a || !b) return false;
  if (a.ss && a.ss === b.ss) {
    const g = uid(),
      old = a.ss;
    for (let k = i + 1; k < arr.length && get(arr[k]).ss === old; k++) get(arr[k]).ss = g;
  } else {
    const id = a.ss || b.ss || uid();
    const olds = [a.ss, b.ss].filter(Boolean);
    for (const x of arr) {
      const o = get(x);
      if (o.ss && olds.includes(o.ss)) o.ss = id;
    }
    a.ss = id;
    b.ss = id;
  }
  const tmp = arr.map(get);
  fixSupersets(tmp);
  return true;
}

/** Moves an entry of a list from i to j, in place; out of range does nothing. */
export function move<X>(arr: X[], i: number, j: number): void {
  if (j < 0 || j >= arr.length) return;
  const [x] = arr.splice(i, 1);
  arr.splice(j, 0, x);
}

/* Routine housekeeping. Empty: no exercise on any day. Duplicate: same name
   and same days and exercises as an earlier routine. Only routines that are
   not active and have no logged sessions are offered for cleanup; logged
   sessions are kept either way. */
export const routineEmpty = (r: { days: { items: unknown[] }[] }): boolean => r.days.every(d => !d.items.length);

/** What makes two routines the same: the name, schedule, days and every item's plan. */
export const routineSig = (
  r: Pick<Routine, 'name' | 'schedule'> & {
    days: {
      name: string;
      rest?: boolean;
      items: {
        exId: string;
        sets: number | string;
        repMin: number | string;
        repMax: number | string;
        rir: number | string;
        rest: number | string;
      }[];
    }[];
  }
): string =>
  JSON.stringify([
    r.name.trim().toLowerCase(),
    r.schedule,
    r.days.map(d => [d.name, !!d.rest, d.items.map(i => [i.exId, +i.sets, +i.repMin, +i.repMax, +i.rir, +i.rest])])
  ]);

/* "Eight plans, 2 to 6 days a week", counted from the list (r30: the line
   said six after two were added). Every other day counts as about 3.5.
   Each key comes from TEMPLATES itself, so each copy is found (the !). */
export function tplCountLine(): string {
  const T = TEMPLATES.filter(t => !t.hidden);
  const n = T.map(t => {
    const r = routineFromTemplate(t.key)!;
    return (r.days.filter(d => !d.rest).length * 7) / r.days.length;
  });
  const W = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
  return `${W[T.length] || T.length} plans, ${Math.floor(Math.min(...n))} to ${Math.round(Math.max(...n))} days a week`;
}

/** The Plan editor's tip on target RIR (r29.5): why the default is 1, a convention. */
export const RIR_TGT_TIP =
  'Target RIR is 1 unless you change it, a convention: muscle growth improves as sets end closer to failure (Robinson 2024), but going all the way to failure grew muscle no more than stopping 1 to 2 reps short (Refalo 2024) and costs more fatigue. Some lifts in the ready-made routines use 0 or 2.';

/* ---------- the plan a lift is trained at (phase 3b, r52; moved from the legacy script, tests/moved.js reads them back to r51's code) ---------- */

/** What a profile changes in a plan item: the range and reserve, and on a heavy compound the rest. */
type ProfChange = { repMin: number; repMax: number; rir: number; rest?: number };

/* What a profile changes in a plan item (the rules Apply and new items share):
   - Strength or Both, past the first year: heavy compounds (`profHeavy`) at
     3 to 6 or 5 to 8 reps, 2 in reserve, 3 minutes' rest.
     Heavier loads gave more strength for similar growth (Schoenfeld 2017
     meta-analysis of low vs high loads; ACSM 2009 position stand: 1 to 6 RM
     for strength past the novice stage); 3 minutes' rest beat 1 for strength
     and size (Schoenfeld 2016). 5 to 8 for Both is a convention between the
     two, and 2 in reserve on heavy compounds is the app's own (templates).
   - Under a year: 8 to 12 reps for everything (ACSM 2009: novices gain
     strength and size there), 3 in reserve on compounds and 2 on isolation,
     as the beginner plan (a convention: easier to judge, further from failure).
   Isolation lifts past the first year, timed holds and Size keep the defaults. */
export function profRuleIn(M: Model, ex: ExerciseLike | null | undefined, p?: Profile | null): ProfChange | null {
  p = p || profIn(M);
  if (!ex || ex.timed) return null;
  if (p.exp === 'new') return { repMin: 8, repMax: 12, rir: isCompound(ex) ? 3 : 2 };
  if ((p.goal === 'strength' || p.goal === 'both') && profHeavy(ex))
    return p.goal === 'strength'
      ? { repMin: 3, repMax: 6, rir: 2, rest: 180 }
      : { repMin: 5, repMax: 8, rir: 2, rest: 180 };
  return null;
}

/** The default plan with the profile's rules for a lift; `plain` leaves the profile out. */
export function profPlanIn(M: Model, ex: ExerciseLike, plain?: boolean): Plan {
  const r = plain ? null : profRuleIn(M, ex);
  return r ? { ...DEFAULT_PLAN, ...r } : { ...DEFAULT_PLAN };
}

/* Default plan for an exercise that is not in the routine yet. Timed holds
   start at 30 to 60 seconds rather than 8 to 12. */
// The profile's rules for a lift (r44); with no profile, or Size, exactly the defaults as before.
// plain: without the profile, for reading sessions already logged (the pace model, r44 review).
export function defPlanIn(M: Model, exId: string, plain?: boolean): Plan {
  const ex = EXIn(M, exId);
  return ex.timed ? { ...DEFAULT_PLAN, repMin: 30, repMax: 60, rest: 60 } : profPlanIn(M, ex, plain);
}

/* An exercise added mid-session borrows its settings from wherever it already
   sits in the active routine instead of a generic 3 x 8-12. */
export function planForIn(M: Model, exId: string, R?: Routine | null, dayId?: string | null, plain?: boolean): Plan {
  R = R || activeRoutineIn(M);
  // The day being trained first: the same lift can sit on two days with different ranges.
  const days = dayId ? [...R.days.filter(d => d.id === dayId), ...R.days.filter(d => d.id !== dayId)] : R.days;
  for (const d of days)
    for (const it of d.items)
      if (it.exId === exId) {
        const { uid: _u, ss: _s, ...p } = it;
        return { ...DEFAULT_PLAN, ...p, ss: null };
      }
  /* A lift on no day of the routine starts from its own last full session
     (r53, V 2026-10-18: "tied at exercise level"; not a deload, a lighter
     day, trimmed or sample): that session's number of working sets, and the
     range it was planned at then where the training profile sets none for
     the lift. Never logged, the default as before. plain (the pace model)
     reads past sessions without this, as without the profile. */
  const base = defPlanIn(M, exId, plain);
  if (plain) return base;
  const work = (q: { warm?: boolean; drop?: boolean; r: number | string | null }): boolean => isWork(q) && !q.drop;
  let last: Session | null = null,
    blk: SessionEx | null = null;
  for (const x of M.s.sessions) {
    if (x.demo || x.deload || x.light || (last && sessCmp(x, last) <= 0)) continue;
    const b = x.ex.find(q => q.exId === exId && !q.cut && !q.light && q.sets.some(work));
    if (b) [last, blk] = [x, b];
  }
  if (!blk) return base;
  const range = blk.rr && !profRuleIn(M, EXIn(M, exId)) ? { repMin: blk.rr[0], repMax: blk.rr[1] } : {};
  return { ...base, ...range, sets: blk.sets.filter(work).length };
}

/* Planned hard sets (r27). A planned set counts only if its target RIR
   would make it hard (3 or less, or every set when RIR is off), the same test
   as a logged set; a plan at RIR 4 used to set a weekly target that logging
   it could never meet. In a deload week each exercise is half its sets,
   rounded up, as the sessions are. */
export function planHardIn(M: Model, it: { rir: number | string }): boolean {
  return M.s.settings.rirMode === 'off' || !(+it.rir > 3);
}

// A planned set at RIR 4 to 5 counts half with the setting on (r40), as logged ones do.
export function planCreditIn(M: Model, it: { rir: number | string }): number {
  return planHardIn(M, it) ? 1 : rirHalfOnIn(M) && +it.rir <= 5 ? 0.5 : 0;
}

/* A muscle's planned hard sets a week: each planned set's credit (above),
   a helper muscle's at half, a cycle at its days a week (weekFactor). Moved
   from the legacy script in r53, unchanged, so the coach can tell a plan
   short of a muscle's target from one that already reaches it. */
/** Planned hard sets a week for each muscle, from a routine. */
export function plannedSetsIn(M: Model, routine: Routine): Record<string, number> {
  const out: Record<string, number> = {};
  const f = weekFactor(routine);
  for (const d of routine.days) {
    if (d.rest) continue;
    for (const it of d.items) {
      const pc = planCreditIn(M, it);
      if (!pc) continue;
      const ex = EXIn(M, it.exId);
      out[ex.primary] = (out[ex.primary] || 0) + it.sets * f * pc;
      for (const m of ex.secondary) out[m] = (out[m] || 0) + 0.5 * it.sets * f * pc;
    }
  }
  return out;
}

/** A routine's planned hard sets a week (a deload week's halved per exercise). */
export function planSetsPerWeekIn(M: Model, R: Routine, deload?: boolean): number {
  const n = R.days.reduce(
    (a, d) =>
      a +
      (d.rest
        ? 0
        : d.items.reduce(
            (x, it) => x + planCreditIn(M, it) * (deload ? Math.max(1, Math.ceil(+it.sets / 2)) : +it.sets),
            0
          )),
    0
  );
  return R.schedule === 'weekly' ? n : Math.round(n * weekFactor(R));
}

/** The parts of a finished session that Finish's offer reads: the routine day
    it was logged against, its marks, and each exercise's plan and sets. */
export interface FinishedDraft {
  routineId: string;
  dayId: string | null;
  limited?: boolean | undefined;
  deload?: boolean | undefined;
  light?: boolean | undefined;
  ex: {
    exId: string;
    swappedFrom?: string | null | undefined;
    plan: Partial<Plan> & { ss?: string | null | undefined };
    sets: { done?: boolean | undefined; warm?: boolean | undefined }[];
  }[];
}

/** Finish's offer to update the routine day: exercises to add, swaps, supersets, and the words for them. */
export interface RoutineUpdate {
  rid: string;
  dayId: string;
  dayName: string;
  add: { exId: string; plan: Partial<Plan> & { sets: number } }[];
  swap: { from: string; to: string }[];
  ss: string[][];
  text: string;
}

/* Exercises added or swapped in a session, relative to the routine day it was
   logged against, so Finish can offer to make the change permanent. An
   exercise added on a lighter day or in a deload had half its sets (r30), so
   the day gets the sets it would have on a normal day, the count that was
   halved (r53, V 2026-10-18: added after a lighter day, it came back with
   half its sets every time after). */
export function routineUpdatesIn(M: Model, d: FinishedDraft): RoutineUpdate | null {
  const R = M.s.routines.find(r => r.id === d.routineId);
  if (!R) return null;
  const day = R.days.find(x => x.id === d.dayId);
  if (!day) return null;
  const have = new Set(day.items.map(i => i.exId));
  const add: RoutineUpdate['add'] = [],
    swap: RoutineUpdate['swap'] = [];
  const seen = new Set<string>();
  for (const b of d.ex) {
    if (have.has(b.exId) || seen.has(b.exId) || !b.sets.some(s => s.done && !s.warm)) continue;
    seen.add(b.exId);
    // Limited-equipment swaps are for that session only.
    if (d.limited && b.swappedFrom) continue;
    if (b.swappedFrom && have.has(b.swappedFrom)) swap.push({ from: b.swappedFrom, to: b.exId });
    else {
      const { ss: _s, ...p } = b.plan;
      const sets = d.deload || d.light ? planForIn(M, b.exId, R, d.dayId).sets : p.sets;
      add.push({ exId: b.exId, plan: { ...p, sets: Math.max(1, +(sets || 0) || 3) } });
    }
  }
  /* A superset made in the session (r35, V, as Strong and Hevy ask): pairs
     of exercises done linked that the day has, or will have after the
     change, but not linked there. */
  const after = new Set([
    ...day.items
      .map(i => i.exId)
      .map(id => {
        const sw = swap.find(x => x.from === id);
        return sw ? sw.to : id;
      }),
    ...add.map(x => x.exId)
  ]);
  const ss: string[][] = [];
  const groups = new Map<string, string[]>();
  for (const b of d.ex) {
    const g = b.plan && b.plan.ss;
    if (!g || !b.sets.some(x => x.done && !x.warm)) continue;
    let list = groups.get(g);
    if (!list) groups.set(g, (list = []));
    list.push(b.exId);
  }
  for (const ids of groups.values()) {
    const u = [...new Set(ids)].filter(id => after.has(id));
    if (u.length < 2) continue;
    const its = u.map(id => day.items.find(i => i.exId === id));
    const first = its[0];
    if (first && first.ss && its.every(i => !!i && i.ss === first.ss)) continue;
    ss.push(u);
  }
  if (!add.length && !swap.length && !ss.length) return null;
  const bits = [
    ...swap.map(x => `${exNameIn(M, x.from)} → ${exNameIn(M, x.to)}`),
    ...add.map(x => `add ${exNameIn(M, x.exId)}`),
    ...ss.map(u => `superset ${andList(u.map(id => exNameIn(M, id)))}`)
  ];
  return { rid: R.id, dayId: day.id, dayName: day.name, add, swap, ss, text: bits.join(', ') };
}
