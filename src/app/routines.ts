/* Routines as data: the weekday names, the default plan for an exercise, and
   the ready-made routines with the function that copies one (phase 2, r50;
   moved unchanged from the legacy script); a lift's plan in a routine, and
   a routine's planned sets. Which routine a lifter starts on stays with the
   app's state, and what reads the analytics, a lift's plan from its own
   sessions and Finish's offer to change the routine, is in plans.ts (r54). */

import type { Day, Plan, PlanItem, Profile, Routine } from './types';
import type { ExerciseLike, Model } from './model';
import { uid, EPS, WEEK_DAYS, LETTERS, numWord } from './util';
import { STEP_LB } from './units';
import { EXIn, activeRoutineIn, profIn, rirHalfOnIn } from './model';
import { isCompound, libExercises, profHeavy } from './library';
import { SESSION_CAP, HARD_RIR, RIR_CALL_TOP, HALF_SET, HELPER_CREDIT, lighterSets } from './formulas';

/** A plan item as a routine is first made: normalize() adds its superset
    link (null) when the routine is saved. */
type NewItem = Omit<PlanItem, 'ss' | 'jump'>;

/** A routine as first made, before normalize() completes its items. */
export type NewRoutine = Omit<Routine, 'days'> & { days: (Omit<Day, 'items'> & { items: NewItem[] })[] };

/** A ready-made routine's exercise: the plan without ids, which a copy gets. */
type TemplateItem = Pick<PlanItem, 'exId' | 'sets' | 'repMin' | 'repMax' | 'rir' | 'rest'>;
interface TemplateDay {
  name: string;
  items: TemplateItem[];
  rest?: boolean;
}

/** A ready-made routine: its name, its lines, and its days. */
type Template = { key: string; name: string; who: string; meta: string; hidden?: boolean; days: TemplateDay[] };

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
export const DEFAULT_PLAN: Readonly<Plan> = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: STEP_LB };

/** The routine installs started with before r29 (the template keyed legacy): each day's name, its lifts as [exercise, sets, rep range low and high, RIR, rest in seconds], and whether it is a rest day. */
// A table, one day a line, so a day's exercises can be read and checked whole; the formatter would spread each set over its own line.
// prettier-ignore
const LEGACY_DAYS: readonly (readonly [string, readonly (readonly [string, number, number, number, number, number])[], boolean?])[] = [
  ['Chest',[['incBench',4,6,10,1,180],['bench',3,6,10,1,180],['dips',3,8,12,1,120],['lowHighFly',3,10,15,0,90],['pecDeck',2,12,15,0,75],['deficitPushup',2,10,25,0,75],['cableCrunch',3,10,15,1,60]]],
  ['Back',[['pullup',4,6,10,1,150],['landmineRow',3,8,12,1,120],['cableRow',3,8,12,1,120],['dbPullover',3,10,15,1,90],['kelsoShrug',3,10,15,1,90],['rackPull',3,5,8,2,180]]],
  ['Legs A: quads',[['hackSquat',4,6,12,1,180],['legPress',3,10,15,1,150],['bss',3,8,12,1,120],['legExt',3,10,15,0,90],['sissy',2,8,15,1,90],['adductor',3,10,15,1,75],['standCalf',4,8,12,0,60],['tibRaise',2,15,25,1,45]]],
  ['Shoulders',[['seatedDbPress',3,6,10,1,150],['cableLateral',4,10,20,0,60],['leanAwayLat',3,10,15,0,60],['cableY',2,12,20,0,60],['reversePecDeck',4,12,20,0,60],['facePull',2,12,20,0,60],['dbShrug',3,8,12,1,75],['hangingLegRaise',3,10,15,1,60],['neckCurl',2,15,20,2,45],['neckExt',2,15,20,2,45]]],
  ['Legs B: posterior',[['sldl',4,6,10,2,180],['seatedCurl',4,8,12,0,90],['nordic',3,3,8,1,120],['hyperext',3,10,15,1,75],['abductor',4,12,20,0,60],['seatedCalf',4,10,15,0,60],['abWheel',3,8,15,1,60]]],
  ['Arms',[['ohCableExt',4,8,12,0,75],['jmPress',3,6,10,1,120],['pressdown',3,10,15,0,60],['inclineCurl',4,8,12,0,75],['bayesianCurl',3,10,15,0,60],['preacher',3,8,12,0,60],['hammer',2,10,12,1,60],['wristCurl',2,12,20,0,45],['revWristCurl',2,12,20,0,45],['woodchop',3,10,15,1,45]]],
  ['Rest',[],true],
];

/* The routine installs started with before r29, as a hidden template (kept
   for the suites written on it, tests/h.js, and to recognise it; never
   offered), its days in the shape the other templates' are. */
const LEGACY: Template = {
  key: 'legacy',
  hidden: true,
  name: 'One muscle a day, high volume',
  who: '',
  meta: '',
  days: LEGACY_DAYS.map(([name, items, rest]) =>
    rest
      ? { name, items: [], rest: true }
      : {
          name,
          items: items.map(([exId, sets, repMin, repMax, rir, r]) => ({ exId, sets, repMin, repMax, rir, rest: r }))
        }
  )
};

/* The routine installs started with before r29, with ids of its own, built
   as every template's routine is (r61: by a copy of that code of its own
   until then), so its key order is theirs. */
/** The routine installs started with before r29. */
export function defaultRoutine(): NewRoutine {
  return routineOf(LEGACY, true);
}

/* An isolation lift's rest in the ready-made routines (r64, PENDING 302; V,
   2026-10-25: "go with 90 then but easy to change"). Singer 2024 found a
   small benefit to growth from resting more than 60 s and no difference
   detected past 90 s (docs/EVIDENCE.md, Rest between sets). The table below
   keeps the rests the routines shipped with up to r63; an isolation item
   resting less rests this long, so a change is this one number, and a copy
   made before, untouched, is still known as ready-made (templateSigsBefore).
   The routine installs started with before r29 is kept as it shipped. */
/** The least rest, in seconds, of an isolation lift in a ready-made routine. */
const ISO_REST = 90;

/** Whether each library exercise is an isolation lift, by id, read once. */
let isoIds: ReadonlySet<string> | null = null;
function isIso(exId: string): boolean {
  if (!isoIds)
    isoIds = new Set(
      libExercises()
        .filter(e => !isCompound(e))
        .map(e => e.id)
    );
  return isoIds.has(exId);
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
  // A routine's line under its name, unless it gives its own: its training days a week, read from its days (a week long, every one of them).
  const tpl = (t: { key: string; name: string; who: string; meta?: string; days: TemplateDay[] }): Template => ({ ...t, meta: t.meta ?? `${t.days.filter(d => !d.rest).length} days a week` });
  return [
    /* New to lifting (r30, from the review: 7 exercises, about 19 sets and
       over an hour, with incline curls and hack squats, was not a first
       routine). Five exercises a day on machines and dumbbells, 2 to 3 sets,
       3 reps in reserve (easy to judge: stop when a rep slows down), about
       45 minutes. Weekly sets sit under the usual 10 on purpose; add a set as
       it gets easy. */
    tpl({key:'full3',name:'Full body, 3 days',who:'New to lifting: five exercises a day, machines and dumbbells, stopping well short of failure. Add a set once it feels easy',days:[
      D('Full body A',[I('legPress',3,8,12,3,120),I('machPress',3,8,12,3,120),I('latPulldown',3,8,12,3,120),I('seatedCurl',2,10,15,2,75),I('dbLateral',2,10,15,2,60)]),R(),
      D('Full body B',[I('goblet',3,8,12,3,120),I('incDb',3,8,12,3,120),I('cableRow',3,8,12,3,120),I('dbRdl',3,8,12,3,120),I('pressdown',2,10,15,2,60)]),R(),
      D('Full body C',[I('legPress',3,8,12,3,120),I('dbBench',3,8,12,3,120),I('machRow',3,8,12,3,120),I('lyingCurl',2,10,15,2,75),I('dbCurl',2,10,15,2,60)]),R(),R()]}),
    /* Past the first year, three days a week (r45, V): the full3 days are a
       first routine (machines, 3 in reserve, under 10 sets a muscle), so a
       trained lifter with three days had only Strength or the dumbbell
       routine. The main barbell lifts at 6 to 10 and 2 in reserve, the
       rest at 1, 6 to 9 hard sets a week for each major muscle (a helper
       muscle counting half), about an hour a day. Conventions, as everywhere here. */
    tpl({key:'full3t',name:'Full body, 3 days, trained',who:'Past your first year: the main lifts and their accessories, the whole body three times a week',days:[
      D('Full body A',[I('backSquat',3,6,10,2,180),I('bench',3,6,10,2,150),I('cableRow',3,8,12,1,120),I('seatedCurl',3,10,15,1,75),I('dbLateral',3,10,20,1,60),I('inclineCurl',2,10,15,1,60)]),R(),
      D('Full body B',[I('rdl',3,6,10,2,150),I('ohp',3,6,10,2,150),I('pullup',3,6,10,2,150),I('legPress',3,10,15,1,120),I('cableFly',3,10,15,1,75),I('standCalf',3,10,15,1,60)]),R(),
      D('Full body C',[I('hackSquat',3,8,12,1,150),I('incDb',3,8,12,1,120),I('latPulldown',3,8,12,1,120),I('lyingCurl',3,10,15,1,75),I('cableLateral',3,10,20,1,60),I('ohCableExt',3,10,15,1,60),I('seatedCalf',3,10,15,1,60)]),R(),R()]}),
    /* Two days a week (r30): the whole body each day, about an hour. */
    tpl({key:'full2',name:'Full body, 2 days',who:'Two sessions a week: the whole body each time',days:[
      D('Full body A',[I('backSquat',3,6,10,2,180),I('bench',3,6,10,2,150),I('cableRow',3,8,12,2,120),I('seatedCurl',3,10,15,1,75),I('dbLateral',3,10,20,1,60),I('inclineCurl',2,10,15,1,60)]),R(),R(),
      D('Full body B',[I('rdl',3,6,10,2,150),I('incDb',3,8,12,2,120),I('latPulldown',3,8,12,2,120),I('legPress',3,10,15,1,120),I('cableLateral',3,10,20,1,60),I('ohCableExt',2,10,15,1,60),I('standCalf',3,10,15,1,60)]),R(),R(),R()]}),
    tpl({key:'ul4',name:'Upper / lower, 4 days',who:'The common all-round choice',days:[
      D('Upper A',[I('bench',4,6,10,2,150),I('bbRow',3,6,10,2,150),I('latPulldown',4,8,12,1,120),I('cableFly',2,10,15,1,75),I('dbLateral',5,10,20,1,60),I('facePull',2,12,20,1,60),I('pressdown',3,10,15,1,60),I('inclineCurl',3,10,15,1,60)]),
      D('Lower A',[I('backSquat',3,6,10,2,180),I('rdl',3,6,10,2,150),I('legExt',3,10,15,1,75),I('seatedCurl',3,10,15,1,75),I('standCalf',4,10,15,1,60),I('cableCrunch',3,10,15,1,60)]),R(),
      D('Upper B',[I('incDb',4,8,12,2,120),I('cableRow',4,8,12,1,120),I('pullup',3,6,10,2,150),I('cableLateral',5,10,20,1,60),I('reversePecDeck',3,12,20,1,60),I('ohCableExt',3,10,15,1,60),I('hammer',3,10,15,1,60)]),
      D('Lower B',[I('hackSquat',3,8,12,1,150),I('hipThrust',3,8,12,1,120),I('lyingCurl',3,10,15,1,75),I('bss',2,8,12,1,90),I('seatedCalf',4,10,15,1,60),I('hangingLegRaise',3,10,15,1,60)]),R(),R()]}),
    tpl({key:'ppl6',name:'Push / pull / legs, 6 days',who:'Training most days, wants more volume',days:[
      D('Push A',[I('bench',3,6,10,2,150),I('seatedDbPress',3,8,12,1,120),I('cableFly',3,10,15,1,75),I('cableLateral',4,10,20,1,60),I('ohCableExt',3,10,15,1,60)]),
      D('Pull A',[I('pullup',4,6,10,1,150),I('bbRow',3,6,10,2,150),I('facePull',3,12,20,1,60),I('inclineCurl',3,10,15,1,60),I('hammer',2,10,15,1,60)]),
      D('Legs A',[I('backSquat',3,6,10,2,180),I('rdl',3,6,10,2,150),I('legExt',3,10,15,1,75),I('seatedCurl',3,10,15,1,75),I('standCalf',4,10,15,1,60),I('cableCrunch',3,10,15,1,60)]),
      D('Push B',[I('incBench',3,6,10,2,150),I('machShoulder',3,8,12,1,120),I('pecDeck',3,10,15,0,75),I('dbLateral',4,12,20,0,60),I('pressdown',3,10,15,1,60)]),
      D('Pull B',[I('latPulldown',4,8,12,1,120),I('machRow',3,8,12,1,120),I('reversePecDeck',3,12,20,0,60),I('bayesianCurl',3,10,15,0,60),I('reverseCurl',2,10,15,1,60)]),
      D('Legs B',[I('hackSquat',3,8,12,1,150),I('hipThrust',3,8,12,1,120),I('lyingCurl',3,10,15,1,75),I('bss',2,8,12,1,90),I('seatedCalf',4,10,15,1,60),I('hangingLegRaise',3,10,15,1,60)]),R()]}),
    tpl({key:'split5',name:'Body-part split, 5 days',who:'The classic gym split, one or two muscles a day',days:[
      D('Chest',[I('bench',3,6,10,2,150),I('incDb',3,8,12,1,120),I('cableFly',3,10,15,1,75),I('dips',2,8,12,1,120),I('cableCrunch',3,10,15,1,60)]),
      D('Back',[I('pullup',4,6,10,1,150),I('bbRow',3,6,10,2,150),I('cableRow',3,8,12,1,120),I('latPulldown',3,8,12,1,120),I('reversePecDeck',3,12,20,0,60)]),
      D('Legs',[I('backSquat',3,6,10,2,180),I('rdl',3,6,10,2,150),I('legPress',3,10,15,1,120),I('legExt',3,10,15,1,75),I('seatedCurl',4,10,15,1,75),I('hipThrust',3,8,12,1,120),I('standCalf',4,10,15,1,60)]),
      // Lateral raises split over two days (r30): nine sets in one session added little past the first five or six.
      D('Shoulders',[I('ohp',3,6,10,2,150),I('cableLateral',5,10,20,1,60),I('facePull',3,12,20,1,60),I('dbShrug',3,10,15,1,60),I('seatedCalf',4,10,15,1,60),I('hangingLegRaise',3,10,15,1,60)]),
      D('Arms and legs',[I('inclineCurl',4,8,12,1,75),I('ohCableExt',4,8,12,1,75),I('hammer',3,10,12,1,60),I('pressdown',3,10,15,1,60),I('dbLateral',4,12,20,1,60),I('bss',3,8,12,1,90),I('lyingCurl',3,10,15,1,75)]),R(),R()]}),
    /* Strength (r30, from the review: nothing for someone after a stronger
       squat, bench and deadlift). The classic five sets of five, alternating
       two days: when all five sets reach 5, the load goes up a step; two
       sessions short of 5 bring it down to what the estimate says fits.
       Fewer sets per muscle than the weekly targets, on purpose. */
    tpl({key:'str5',name:'Strength, 5 x 5',who:'Stronger squat, bench, press, row, and deadlift: five sets of five, a step more each time all five reach 5',meta:'every other day',days:[
      D('Strength A',[I('backSquat',5,5,5,2,180),I('bench',5,5,5,2,180),I('bbRow',5,5,5,2,150)]),R(),
      D('Strength B',[I('backSquat',5,5,5,2,180),I('ohp',5,5,5,2,180),I('deadlift',1,5,5,2,240)]),R()]}),
    tpl({key:'db3',name:'Dumbbells only, 3 days',who:'Home or hotel gym: dumbbells and a bench. A lighter start, like full body: fewer sets a week than the targets, so add a set as it gets easy',days:[
      D('Dumbbell A',[I('goblet',3,8,15,2,120),I('dbBench',3,8,12,2,120),I('dbRow',3,8,12,2,90),I('dbLateral',3,12,20,1,60),I('dbRearFly',3,12,20,1,60),I('dbCurl',3,10,15,1,60),I('slCalf',3,10,15,1,45)]),R(),
      D('Dumbbell B',[I('dbRdl',3,8,12,2,120),I('seatedDbPress',3,8,12,2,120),I('csDbRow',3,8,12,1,90),I('revLunge',3,8,12,2,90),I('dbLateral',3,12,20,1,60),I('ohDbExt',3,10,15,1,60),I('reverseCrunch',2,10,15,1,60)]),R(),
      D('Dumbbell C',[I('bss',3,8,12,2,90),I('incDb',3,8,12,2,120),I('dbPullover',3,10,15,1,75),I('slRdl',3,8,12,1,75),I('dbRearFly',2,12,20,1,60),I('hammer',3,10,15,1,60),I('slCalf',3,10,15,1,45)]),R(),R()]}),
    /* High volume, trimmed (r30, from the review: 17 chest sets in one
       session, mostly to failure, and a neck circuit on shoulder day). At
       most 11 sets for one muscle in a session (the app's per-session line),
       isolation lifts at 1 RIR with a few at 0, no neck work (tracked only).
       Installs before r30 keep their copy; Plan changes it. */
    tpl({key:'onemuscle',name:'One muscle a day, high volume',who:`Experienced, six days a week. Long sessions with many sets for one muscle, up to ${SESSION_CAP}`,days:[
      D('Chest',[I('incBench',4,6,10,1,180),I('bench',3,6,10,1,180),I('lowHighFly',2,10,15,1,90),I('pecDeck',2,12,15,0,75),I('cableCrunch',3,10,15,1,60)]),
      D('Back',[I('pullup',4,6,10,1,150),I('landmineRow',3,8,12,1,120),I('cableRow',2,8,12,1,120),I('dbPullover',3,10,15,1,90),I('kelsoShrug',2,10,15,1,90),I('rackPull',2,5,8,2,180)]),
      D('Legs A: quads',[I('hackSquat',4,6,12,1,180),I('legPress',3,10,15,1,150),I('legExt',2,10,15,0,90),I('bss',2,8,12,1,120),I('adductor',3,10,15,1,75),I('standCalf',4,8,12,1,60),I('tibRaise',2,15,25,1,45)]),
      D('Shoulders',[I('seatedDbPress',3,6,10,1,150),I('cableLateral',5,10,20,1,60),I('leanAwayLat',4,10,15,1,60),I('reversePecDeck',4,12,20,1,60),I('facePull',2,12,20,1,60),I('dbShrug',3,8,12,1,75),I('hangingLegRaise',3,10,15,1,60)]),
      D('Legs B: posterior',[I('sldl',4,6,10,2,180),I('seatedCurl',3,8,12,1,90),I('nordic',2,3,8,1,120),I('hyperext',3,10,15,1,75),I('abductor',4,12,20,1,60),I('seatedCalf',4,10,15,0,60),I('abWheel',3,8,15,1,60)]),
      D('Arms',[I('ohCableExt',4,8,12,1,75),I('jmPress',3,6,10,1,120),I('pressdown',3,10,15,0,60),I('inclineCurl',4,8,12,1,75),I('bayesianCurl',3,10,15,1,60),I('preacher',3,8,12,0,60),I('wristCurl',2,12,20,1,45),I('revWristCurl',2,12,20,1,45),I('woodchop',3,10,15,1,45)]),
      R()]}),
    LEGACY
  ];
})();

/* A routine from a template, with its own ids so it is independent of the template. */
export function routineFromTemplate(key: string): NewRoutine | null {
  const t = TEMPLATES.find(x => x.key === key);
  return t ? routineOf(t) : null;
}

/** A ready-made routine as it was made before r64 (the rests as the table writes them), with ids of its own, as routineFromTemplate makes one: the suites compare earlier builds' screens with it. */
export function templateBefore(key: string): NewRoutine | null {
  const t = TEMPLATES.find(x => x.key === key);
  return t ? routineOf(t, true) : null;
}

/** The signature of each ready-made routine as made up to r63, in the table's order: a copy made then, untouched, is still ready-made (302). Read from the table, so no ids are made and no random number is drawn. */
export function templateSigsBefore(): string[] {
  return TEMPLATES.map(t =>
    routineSig({
      name: t.name,
      schedule: 'cycle',
      days: t.days.map(d => ({ name: d.name, rest: !!d.rest, items: d.items }))
    })
  );
}

/** A template's routine, with ids of its own: as shipped up to r63 (shipped, and the hidden one always), or with an isolation lift's rest at ISO_REST at least. */
function routineOf(t: Template, shipped?: boolean): NewRoutine {
  const asShipped = shipped || !!t.hidden;
  return {
    id: uid(),
    name: t.name,
    schedule: 'cycle',
    days: t.days.map(d => ({
      id: uid(),
      name: d.name,
      rest: !!d.rest,
      items: d.items.map(it => ({
        uid: uid(),
        ...it,
        ...(!asShipped && isIso(it.exId) && it.rest < ISO_REST ? { rest: ISO_REST } : {}),
        inc: STEP_LB
      }))
    }))
  };
}

/* ---------- routine helpers (phase 3a, r51; moved unchanged) ---------- */

/** The parts of a routine these helpers read. */
type RoutineLike = {
  schedule: string;
  days: { id?: string; rest?: boolean; items: { ss?: string | null; sets?: number | string }[] }[];
};

/* Weekly numbers (planned volume, adherence, the week bar) assume one cycle day
   per calendar day. A 7-day cycle is therefore exactly 1x; a 4-day cycle runs
   1.75 times a week. */
export function weekFactor(R: RoutineLike): number {
  return R.schedule === 'weekly' ? 1 : WEEK_DAYS / Math.max(1, R.days.length);
}

/** Whether a routine day has something to train. */
function isTrainDay(d: RoutineLike['days'][number]): boolean {
  return !d.rest && d.items.length > 0;
}

/** The days of a routine with something to train. */
export function trainDaysOf(R: RoutineLike): number {
  return R.days.filter(isTrainDay).length;
}

/* Where a cycle goes next (cycleState, on Today): the first training day
   after the one last trained, so a missed day moves with the lifter instead
   of being skipped, and the routine's first training day before any. The
   weeks a cycle's days fell in are read by the same rule (weeks.ts,
   cycleMixIn), so the two cannot disagree on which day was due. */
/** A cycle's training day after day i (i below 0: before any), or i itself when it is the only one. */
export function nextTrainIdx(R: RoutineLike, i: number): number {
  const n = R.days.length;
  if (i < 0) {
    for (let k = 0; k < n; k++) if (isTrainDay(R.days[k])) return k;
    return 0;
  }
  for (let k = 1; k <= n; k++) {
    const j = (i + k) % n;
    if (isTrainDay(R.days[j])) return j;
  }
  return i;
}

/* A cycle that is not 7 days long plans a fraction a week: an every-other-day
   routine (5 x 5) 3.5, done in weeks of 4 and 3. The week counts as on plan at
   the whole number below (r54, V's call of 2026-10-18 after the audit V asked
   for: rounded to 4, a lifter doing exactly what the routine says never built a
   streak, and the ring read 3 of 4 every other week). One rule for the ring,
   This week, the streak and adherence. A routine that trains plans at least
   one a week, however long its cycle: rounded down alone, a cycle of one
   training day in nine would plan none and lose its ring. */
/** Training days a week, for a weekly schedule or a cycle. */
export function plannedPerWeek(R: RoutineLike): number {
  const n = trainDaysOf(R);
  return R.schedule === 'weekly' ? n : n ? Math.max(1, Math.floor(n * weekFactor(R) + EPS)) : 0;
}

/* What a session records at Finish of the routine it was logged against: the
   sessions a week it planned then (r55, from the audit: deleting the routine
   a month was trained on, or adding a day to it, rescored those weeks against
   the routine as it is now, and a 5-week streak read 0). Absent for a
   Freestyle session or a routine that plans none, and on sessions saved
   before r55, which read the routine as it is now. */
/** The sessions a week the routine with this id plans, for a session to record; undefined when it plans none or is gone. */
export function pwOf(routines: readonly (RoutineLike & { id: string })[], id: string): number | undefined {
  const R = routines.find(r => r.id === id);
  const n = R ? plannedPerWeek(R) : 0;
  return n > 0 ? n : undefined;
}

/* The sets a routine's plan gives a lift, for a session saved on one of its
   days to record with the lift (SessionEx.ps, r58, 339 h): the day's item
   first, else the routine's first day with it (planItemOf, the order every
   plan of a lift is read in). Undefined for a lift on no day of it, or a
   routine gone. A session keeps the plan it was done to, so a plan changed
   later never rereads the sessions before it (the r58 review: a plan raised
   from 3 sets to 4 read every session of 3 as short). */
/** The sets the routine with this id plans for a lift, the given day first; undefined when it plans none or is gone. */
export function planSetsOf(
  routines: readonly {
    id: string;
    days: readonly { id: string; items: readonly { exId: string; sets: number }[] }[];
  }[],
  id: string,
  dayId: string | null | undefined,
  exId: string
): number | undefined {
  const R = routines.find(r => r.id === id);
  const it = R ? planItemOf(R, exId, dayId) : null;
  return it && Number.isInteger(it.sets) && it.sets >= 1 ? it.sets : undefined;
}

/* A workout's exercises as Finish saves them, each lift on a day of a
   routine given the sets its plan gives it (planSetsOf), last, as normalize
   writes it. None in Freestyle or with no day, and none on an edit, which
   keeps the sets saved with the session (Finish carries them over with the
   fields it does not rebuild, keepExtra). */
/** The exercises given, each with its plan's sets where the workout is on a day of a routine, as new records (the ones given are not changed). */
export function withPlanSets<B extends { exId: string; ps?: number | undefined }>(
  ex: readonly B[],
  d: {
    editingId?: string | null | undefined;
    free?: boolean | undefined;
    dayId?: string | null | undefined;
    routineId: string;
  },
  routines: Parameters<typeof planSetsOf>[0]
): B[] {
  if (d.editingId || d.free || !d.dayId) return [...ex];
  return ex.map(b => {
    const n = planSetsOf(routines, d.routineId, d.dayId, b.exId);
    return n ? { ...b, ps: n } : b;
  });
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

/* A rest day an exercise is added to becomes a training day, and its name
   goes with it when it is the name rest days are given (r55, from the audit:
   a day of Build my own or New blank, given an exercise, read "Rest" on Today
   and in the week bar with its exercises planned). A name typed stays. */
/** What a day given an exercise becomes: a training day, named Training day when it was a rest day named Rest. */
export function trainOn(d: { rest: boolean; name: string }): { rest: false; name: string } {
  return { rest: false, name: d.rest && d.name === 'Rest' ? 'Training day' : d.name };
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
  for (const it of items)
    if (it.ss && !(it.ss in m)) m[it.ss] = String.fromCharCode('A'.charCodeAt(0) + (n++ % LETTERS));
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

/* A first-run choice (a ready-made routine, a routine from an import, or
   Build my own since r55) replaces the starter a new install was given, as
   long as it is untouched (its signature, `sigs`) and nothing was logged
   against it: the audit of r54 found Build my own kept it beside My routine. */
/** The routines less an untouched starter, by its signatures, that no session was logged against. */
export function dropStarter<R extends Parameters<typeof routineSig>[0] & { id: string }>(
  routines: readonly R[],
  sessions: readonly { routineId: string }[],
  sigs: readonly string[]
): R[] {
  return routines.filter(x => !sigs.includes(routineSig(x)) || sessions.some(q => q.routineId === x.id));
}

/* "Eight plans, 2 to 6 days a week", counted from the list (r30: the line
   said six after two were added). Every other day counts as about 3.5.
   Each key comes from TEMPLATES itself, so each copy is found (the !). */
export function tplCountLine(): string {
  const T = TEMPLATES.filter(t => !t.hidden);
  const n = T.map(t => {
    const r = routineFromTemplate(t.key)!;
    return (r.days.filter(d => !d.rest).length * WEEK_DAYS) / r.days.length;
  });
  const w = T.length ? numWord(T.length) : 'no';
  return `${w[0].toUpperCase()}${w.slice(1)} plans, ${Math.floor(Math.min(...n))} to ${Math.round(Math.max(...n))} days a week`;
}

/** The Plan editor's tip on target RIR (r29.5): why the default is 1, a convention. */
export const RIR_TGT_TIP = `Target RIR is ${DEFAULT_PLAN.rir} unless you change it, a convention: muscle growth improves as sets end closer to failure (Robinson 2024), but going all the way to failure grew muscle no more than stopping 1 to 2 reps short (Refalo 2024) and costs more fatigue. Some lifts in the ready-made routines use 0 or 2.`;

/* ---------- the plan a lift is trained at (phase 3b, r52; moved from the legacy script) ---------- */

/** What a profile changes in a plan item: the range and reserve, and on a heavy compound the rest. */
type ProfChange = { repMin: number; repMax: number; rir: number; rest?: number };

/** The profile's plans for a lift (r44, above): a first year's rep range and
    reserve on compound and isolation lifts, and heavy compounds' range,
    reserve and rest for Strength and for Both. */
export const PROFILE_PLAN = {
  first: { repMin: 8, repMax: 12, rirCompound: 3, rirIsolation: 2 },
  strength: { repMin: 3, repMax: 6, rir: 2, rest: 180 },
  both: { repMin: 5, repMax: 8, rir: 2, rest: 180 }
} as const;
/** A timed hold's plan until one is set: 30 to 60 seconds, 60 s rest. */
export const TIMED_PLAN = { repMin: 30, repMax: 60, rest: 60 } as const;

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
  const F = PROFILE_PLAN.first;
  if (p.exp === 'new')
    return { repMin: F.repMin, repMax: F.repMax, rir: isCompound(ex) ? F.rirCompound : F.rirIsolation };
  if ((p.goal === 'strength' || p.goal === 'both') && profHeavy(ex))
    return p.goal === 'strength' ? { ...PROFILE_PLAN.strength } : { ...PROFILE_PLAN.both };
  return null;
}

/** The default plan with the profile's rules for a lift; `plain` leaves the profile out. */
export function profPlanIn(M: Model, ex: ExerciseLike, plain?: boolean): Plan {
  const r = plain ? null : profRuleIn(M, ex);
  return r ? { ...DEFAULT_PLAN, ...r } : { ...DEFAULT_PLAN };
}

/* Default plan for an exercise that is not in the routine yet. Timed holds
   start at TIMED_PLAN's seconds rather than the default reps. */
// The profile's rules for a lift (r44); with no profile, or Size, exactly the defaults as before.
// plain: without the profile, for reading sessions already logged (the pace model, r44 review).
export function defPlanIn(M: Model, exId: string, plain?: boolean): Plan {
  const ex = EXIn(M, exId);
  return ex.timed ? { ...DEFAULT_PLAN, ...TIMED_PLAN } : profPlanIn(M, ex, plain);
}

/* Where a lift sits in a routine (the active one unless given): its plan
   there, the day being trained first, since the same lift can sit on two
   days with different ranges; null on no day of it. */
/** A lift's plan in a routine, the day given first, or null when it is on no day of it. */
export function routinePlanIn(M: Model, exId: string, R?: Routine | null, dayId?: string | null): Plan | null {
  const it = planItemOf(R || activeRoutineIn(M), exId, dayId);
  if (!it) return null;
  const { uid: _u, ss: _s, ...p } = it;
  return { ...DEFAULT_PLAN, ...p, ss: null };
}

/* The item itself, so a change to it in Plan reaches the exercises of a
   session that took their plan from it, by the one search order (r55, from
   the audit: a range changed in Plan never reached the same lift in a blank
   session, which took its plan from the first day with it). */
/** The item a lift's plan in a routine comes from: on the day given first, else the first day with it; null on no day. */
export function planItemOf<I extends { exId: string }>(
  R: { days: readonly { id: string; items: readonly I[] }[] },
  exId: string,
  dayId?: string | null
): I | null {
  const days = dayId ? [...R.days.filter(d => d.id === dayId), ...R.days.filter(d => d.id !== dayId)] : R.days;
  for (const d of days) for (const it of d.items) if (it.exId === exId) return it;
  return null;
}

/* A lift's plan as the routine has it, the day being trained first, else
   its default (the profile's, unless plain): what the time model and the
   analytics read, neither of which reads the lift's own sessions for it.
   An exercise added mid-session, or a lift on no day of the routine, takes
   the plan of plans.ts (planForIn), which adds the lift's own last full
   session; until r54 this read it here, from the records, where the
   analytics' reading of a session (done lighter, or short of its usual) is
   not known (PENDING 313). */
export function basePlanIn(M: Model, exId: string, R?: Routine | null, dayId?: string | null, plain?: boolean): Plan {
  return routinePlanIn(M, exId, R, dayId) || defPlanIn(M, exId, plain);
}

/* Planned hard sets (r27). A planned set counts only if its target RIR
   would make it hard (3 or less, or every set when RIR is off), the same test
   as a logged set; a plan at RIR 4 used to set a weekly target that logging
   it could never meet. In a deload week each exercise is half its sets,
   rounded up, as the sessions are. */
function planHardIn(M: Model, it: { rir: number | string }): boolean {
  return M.s.settings.rirMode === 'off' || !(+it.rir > HARD_RIR);
}

// A planned set at RIR 4 to 5 counts half with the setting on (r40), as logged ones do.
export function planCreditIn(M: Model, it: { rir: number | string }): number {
  return planHardIn(M, it) ? 1 : rirHalfOnIn(M) && +it.rir <= RIR_CALL_TOP ? HALF_SET : 0;
}

/* How many times a week each training day of a routine comes round: once on
   a weekly schedule; on a cycle, the whole sessions the week plans
   (plannedPerWeek) shared over its training days (r54, V 2026-10-18: the
   planned sets follow the sessions a week counts as on plan, so Strength
   5 x 5, every other day, plans three sessions' worth, 39 hard sets, where
   three and a half read 46 and a lifter on plan was told to do every
   planned set; the review of r54 found that). */
/** How many times a week each training day of a routine comes round. */
export function dayShare(R: RoutineLike): number {
  const n = trainDaysOf(R);
  return R.schedule === 'weekly' ? 1 : n ? plannedPerWeek(R) / n : 0;
}

/* Adds one day's planned hard sets per muscle into `out`, each counted f
   times: each planned set's credit (above), a helper muscle's at half. */
function addDayCredit(M: Model, d: Day | NewRoutine['days'][number], f: number, out: Record<string, number>): void {
  if (d.rest) return;
  for (const it of d.items) {
    const pc = planCreditIn(M, it);
    if (!pc) continue;
    const ex = EXIn(M, it.exId);
    out[ex.primary] = (out[ex.primary] || 0) + it.sets * f * pc;
    for (const m of ex.secondary) out[m] = (out[m] || 0) + HELPER_CREDIT * it.sets * f * pc;
  }
}

/* One day's planned hard sets per muscle, which the weeks a cycle's days
   fell in are read from (weeks.ts, cycleMixIn, r54). */
/** A routine day's planned hard sets per muscle. */
export function dayCreditIn(M: Model, d: Day): Record<string, number> {
  const out: Record<string, number> = {};
  addDayCredit(M, d, 1, out);
  return out;
}

/* A muscle's planned hard sets a week: each day's as often as it comes round
   (dayShare). Moved from the legacy script in r54 so the coach can tell a
   plan short of a muscle's target from one that already reaches it. `share`
   reads the plan another way: before r54 each day of a cycle came round 7
   divided by its length times a week (weekFactor), and the targets a
   first-run pick fitted by that reading are refitted from it (refitIn). */
/** Planned hard sets a week for each muscle, from a routine (each day `share` times a week, dayShare unless given). */
export function plannedSetsIn(M: Model, routine: Routine | NewRoutine, share?: number): Record<string, number> {
  const out: Record<string, number> = {};
  const f = share ?? dayShare(routine);
  for (const d of routine.days) addDayCredit(M, d, f, out);
  return out;
}

/** A routine's planned hard sets a week (a deload week's halved per exercise). */
export function planSetsPerWeekIn(M: Model, R: Routine, deload?: boolean): number {
  const n = R.days.reduce(
    (a, d) =>
      a +
      (d.rest
        ? 0
        : d.items.reduce((x, it) => x + planCreditIn(M, it) * (deload ? lighterSets(+it.sets) : +it.sets), 0)),
    0
  );
  return Math.round(n * dayShare(R));
}
