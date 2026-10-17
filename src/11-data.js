/* ---------- reference data ---------- */
/* The profile (r44): its choices, read by normalize while the save loads. */
const PROF_GOALS=[['size','Size'],['strength','Strength'],['both','Both']];
const PROF_EXP=[['new','Under 1'],['mid','1 to 3'],['adv','Over 3']];
const PROF_DAYS=[2,3,4,5,6];
const FOCUS_MAX=2;
/* Focus muscles (item 43): weekly targets about 30% higher, the other major
   muscles at maintenance, a third of the usual minimum. More weekly sets
   grow a muscle more (Pelland 2025, the dose-response meta-regression the
   targets rest on); 30% is a convention, not a measured dose. Size and
   strength were kept for months on a third of the volume when load stayed
   up (Bickel 2011; Spiering 2021 review). */
const FOCUS_UP=1.3,MAINT_SHARE=1/3;
// Dashboard sections, in display order. Keys are what the jump strip targets.
const DSECS=[['volume','Volume'],['exercise','Lifts'],['weak','Muscles'],['consistency','Consistency'],['body','Body']];
const DSEC_KEYS=DSECS.map(x=>x[0]);
const SEC_TABS=['today','program','dash','history','settings'];
// Legacy: older builds saved folds here. Kept only so old saves normalize; unused.
const DSEC_FOLDED=['consistency','body'];
// Old section keys still arrive from tiles, summary rows and the coach. They
// land on the section that absorbed them, opening the matching fold inside it.
const DSEC_ALIAS={stalls:'exercise',prs:'exercise',bests:'exercise',rank:'weak',svol:'volume'};
/* Deleted sessions, cardio entries and routines are kept for 30 days so a
   mistaken delete can be restored after the tab is closed. Their ids also act
   as tombstones: a second device that still holds a deleted session cannot
   merge it back in while the entry is here. Capped so the core cloud document
   never approaches its size limit. */
const TRASH_DAYS=30,TRASH_MAX=20,TRASH_BYTES=60000;
/* What Volume on Stats can show. Planned left Stats in r29 (V: Stats is what
   you did); the plan against the targets is Weekly volume on Plan. */
const VOL_MODES=[['region','By region'],['week','This week'],['avg','Recent average'],['trend','Weekly trend'],['load','Load']];
const PLATE_MODES=[['auto','Automatic'],['bar','Barbell: bar plus plates per side'],['side','Plates per side, no bar'],['sleeve','One sleeve (landmine)'],['none','None']];
/* Sections that can be hidden from Settings > Layout, as tab:key. Hidden
   sections are simply not shown; nothing stops being tracked. The routine
   days, the session list and Settings itself are never hideable, so there is
   always a way back. */
const HIDEABLE=[
  ['today','week','This week'],['today','tiles','At a glance'],['today','coach','Coach'],['today','injuries','Injuries'],['today','map','Muscle map'],['today','session','Workout preview'],['today','body','Body'],
  ['program','library','Add exercises'],['program','schedule','Schedule'],['program','pvol','Weekly volume'],
  ['dash','volume','Volume'],['dash','exercise','Lifts'],['dash','weak','Muscles'],['dash','consistency','Consistency'],['dash','body','Body'],
  ['history','cardio','Cardio and mobility'],['history','trash','Recently deleted'],
  ['settings','timer','Rest timer and logging'],['settings','rir','Effort (RIR)'],['settings','prio','Priority muscles'],['settings','bands','Weekly set targets'],['settings','more','More']
];
const HIDEABLE_KEYS=new Set(HIDEABLE.map(([t,k])=>t+':'+k));
const HIDE_TABS=[['today','Today'],['program','Plan'],['dash','Stats'],['history','History'],['settings','Settings']];
/* The layout a new install starts with (V, r28): every section folded,
   the extras hidden, and a line at the bottom of each tab that adds them
   back in one tap. Existing logs keep their own layout: these only seed a
   fresh state, and Settings > Layout's "Default layout" and "Reset section
   order" go back to them. Today leads with what a session needs (the
   workout, then the muscle map, then the week); Stats leads with Lifts. */
const DEFAULT_HIDDEN=['today:tiles','today:coach','today:body','program:schedule','program:pvol'];
const DEFAULT_ORDER={today:['session','map','week','injuries','coach','tiles','body'],dash:['exercise','volume','weak','consistency','body']};
const defaultOrder=()=>JSON.parse(JSON.stringify(DEFAULT_ORDER));
// Only History opens a section by itself: Sessions is that tab's content.
const MAIN_FIXED={history:'sessions'};

const JUMP_TIP='When every set reaches the top of the rep range, the load goes up by about this share, in whole load steps and at least one step. Blank: 2.5% on compound lifts, 5% on isolation lifts, a convention. 0: one step every time. Until then the target is to beat last time\'s total reps at the same load. When the step is large for the load, a few more reps come first, so the new load starts inside the range.';
const RIR_TGT_TIP='Target RIR is 1 unless you change it, a convention: muscle growth improves as sets end closer to failure (Robinson 2024), but going all the way to failure grew muscle no more than stopping 1 to 2 reps short (Refalo 2024) and costs more fatigue. Some lifts in the ready-made routines use 0 or 2.';
const COMMON_TIP='Most common: the lifts in the top 25 by sets logged, overall, for men, or for women, among over 700,000 StrengthLog users (2025). Less common: useful lifts many gyms or programs skip, a judgment.';
// skip: the filter in use, so a list filtered to Most common does not say it on every row.
const exTags=(e,skip)=>`${isCommon(e)&&skip!=='common'?'<span class="tag common">Most common</span>':''}${e.rare&&skip!=='rare'?'<span class="tag rare">Less common</span>':''}`;
/* The routine a new install starts with (V, decision 114, r29): Upper /
   lower, 4 days, the all-round choice, so someone who taps Log a workout now
   or Import instead of picking is not dropped into the six-day high-volume
   split. Saves that already have routines keep theirs. */
// The suites built on the routine installs started with before r29 run with
// IRONLOG_STARTER set to it (tests/h.js); nothing else sets it.
/* "Eight plans, 2 to 6 days a week", counted from the list (r30: the line
   said six after two were added). Every other day counts as about 3.5. */
function tplCountLine(){const T=TEMPLATES.filter(t=>!t.hidden);const n=T.map(t=>{const r=routineFromTemplate(t.key);return r.days.filter(d=>!d.rest).length*7/r.days.length;});
  const W=['No','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve'];return `${W[T.length]||T.length} plans, ${Math.floor(Math.min(...n))} to ${Math.round(Math.max(...n))} days a week`;}
function starterRoutine(){const k=window.IRONLOG_STARTER;return routineFromTemplate(k&&TEMPLATES.some(t=>t.key===k)?k:'ul4');}
/* An untouched starter, the current one or the one installs began with
   before r29, is replaced when a ready-made routine is picked on a first run. */
function starterSigs(){return [routineSig(starterRoutine()),routineSig(defaultRoutine())];}
function freshState(){
  const r=starterRoutine();
  return {version:STATE_VERSION,settings:{unit:'lb',theme:'dark',bands:JSON.parse(JSON.stringify(BANDS)),priorities:[],dashFolded:DSEC_FOLDED.slice(),lastExport:null,barKg:null,bwGoalPct:null,removedLib:[],timerMode:'auto',timerSound:true,timerCompact:false,autoDone:true,homeFolded:[],wakeLock:false,timeBudget:null,rirMode:'on',hidden:DEFAULT_HIDDEN.slice(),onboarded:false,calSnooze:null},
    exercises:libExercises(),routines:[r],activeRoutineId:r.id,sessions:[],bodyweights:[],measurements:[],draft:null,deloadWeek:null,injuries:[],cardio:[],trash:[]};
}

