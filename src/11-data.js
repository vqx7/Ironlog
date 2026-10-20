/* ---------- reference data ---------- */
// skip: the filter in use, so a list filtered to Most common does not say it on every row.
const exTags=(e,skip)=>`${isCommon(e)&&skip!=='common'?'<span class="tag common">Most common</span>':''}${e.rare&&skip!=='rare'?'<span class="tag rare">Less common</span>':''}`;
function freshState(){
  const r=starterRoutine();
  return {version:STATE_VERSION,settings:{unit:'lb',theme:'dark',bands:JSON.parse(JSON.stringify(BANDS)),priorities:[],dashFolded:DSEC_FOLDED.slice(),lastExport:null,barKg:null,bwGoalPct:null,removedLib:[],timerMode:'auto',timerSound:true,timerCompact:false,autoDone:true,homeFolded:[],wakeLock:false,timeBudget:null,rirMode:'on',hidden:DEFAULT_HIDDEN.slice(),onboarded:false,calSnooze:null},
    exercises:libExercises(),routines:[r],activeRoutineId:r.id,sessions:[],bodyweights:[],measurements:[],draft:null,deloadWeek:null,injuries:[],cardio:[],trash:[]};
}

