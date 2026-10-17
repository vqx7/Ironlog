/* Routines as data: the weekday names, the default plan for an exercise, and
   the ready-made routines with the function that copies one (phase 2, r50;
   moved unchanged from the legacy script, tests/moved.js holds them to r49's
   code). Which routine a lifter starts on, and anything that reads the log,
   stays with the app's state. */

import type { Day, Plan, PlanItem, Routine } from './types';
import { uid } from './util';
import { LB } from './units';

/** A plan item as a routine is first made: normalize() adds its superset
    link (null) when the routine is saved. */
export type NewItem = Omit<PlanItem, 'ss' | 'jump'>;

/** A routine as first made, before normalize() completes its items. */
export type NewRoutine = Omit<Routine, 'days'> & { days: (Omit<Day, 'items'> & { items: NewItem[] })[] };

/** A ready-made routine's exercise: the plan without ids, which a copy gets. */
export type TemplateItem = Pick<PlanItem, 'exId' | 'sets' | 'repMin' | 'repMax' | 'rir' | 'rest'>;
export interface TemplateDay { name: string; items: TemplateItem[]; rest?: boolean }

/** A ready-made routine: its days, or (the hidden legacy one) a function that builds it. */
export type Template = { key: string; name: string; who: string; meta: string; hidden?: boolean } & (
  | { days: TemplateDay[]; build?: undefined }
  | { build: () => NewRoutine; days?: undefined }
);

export const DAYS: readonly string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** The most days a routine can have. */
export const MAX_DAYS = 14;

/** A routine day's label: the weekday on a weekly schedule, else its place in the cycle. */
export function dayLabel(R: Pick<Routine, 'schedule'> | null | undefined, i: number): string {
  return R && R.schedule === 'weekly' ? (DAYS[i] as string) : `Day ${i + 1}`;
}

/** The plan an exercise gets when nothing else sets one: 3 sets of 8 to 12 at
    1 in reserve (a convention: CLAUDE.md, Evidence base, Target RIR of 1),
    90 s rest (Singer 2024 found no difference in growth past 90 s), and the
    default load step (5 lb, read as 2.5 kg by a lifter in kg; STEP_LB). */
export const DEFAULT_PLAN: Readonly<Plan> = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * LB };

/** The routine installs started with before r29 (the template marked legacy). */
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
  return { id: uid(), name: t.name, schedule: 'cycle', days: t.days.map(d => ({ id: uid(), name: d.name, rest: !!d.rest, items: d.items.map(it => ({ uid: uid(), ...it, inc: 5 * LB })) })) };
}
