/* ---------- reference data ---------- */
const SEC_TABS=['today','program','dash','history','settings'];
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
// Only History opens a section by itself: Sessions is that tab's content.
const MAIN_FIXED={history:'sessions'};

// skip: the filter in use, so a list filtered to Most common does not say it on every row.
const exTags=(e,skip)=>`${isCommon(e)&&skip!=='common'?'<span class="tag common">Most common</span>':''}${e.rare&&skip!=='rare'?'<span class="tag rare">Less common</span>':''}`;
/* The routine a new install starts with (V, decision 114, r29): Upper /
   lower, 4 days, the all-round choice, so someone who taps Log a workout now
   or Import instead of picking is not dropped into the six-day high-volume
   split. Saves that already have routines keep theirs. */
// The suites built on the routine installs started with before r29 run with
// IRONLOG_STARTER set to it (tests/h.js); nothing else sets it.
function starterRoutine(){const k=window.IRONLOG_STARTER;return routineFromTemplate(k&&TEMPLATES.some(t=>t.key===k)?k:'ul4');}
/* An untouched starter, the current one or the one installs began with
   before r29, is replaced when a ready-made routine is picked on a first run. */
function starterSigs(){return [routineSig(starterRoutine()),routineSig(defaultRoutine())];}
function freshState(){
  const r=starterRoutine();
  return {version:STATE_VERSION,settings:{unit:'lb',theme:'dark',bands:JSON.parse(JSON.stringify(BANDS)),priorities:[],dashFolded:DSEC_FOLDED.slice(),lastExport:null,barKg:null,bwGoalPct:null,removedLib:[],timerMode:'auto',timerSound:true,timerCompact:false,autoDone:true,homeFolded:[],wakeLock:false,timeBudget:null,rirMode:'on',hidden:DEFAULT_HIDDEN.slice(),onboarded:false,calSnooze:null},
    exercises:libExercises(),routines:[r],activeRoutineId:r.id,sessions:[],bodyweights:[],measurements:[],draft:null,deloadWeek:null,injuries:[],cardio:[],trash:[]};
}

