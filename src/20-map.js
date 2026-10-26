/* ---------- SHORT ON TIME ----------
   The muscle map, flat and 3D, is drawn by src/app/map.ts since r59, and the
   session's live PR, check-in and minutes left by src/app/workout.ts since
   r60. What stays here is Short on time's trim, which its sheet reads, and
   moves with the sheets. */
/* Trim to fit. Lowest priority first: sets come off down to 2 per exercise,
   then whole exercises not started yet drop out, then exercises in progress
   finish with what is done. An exercise whose muscle another kept exercise
   already trains goes before one that is the only work for its muscle, so
   every muscle keeps at least one movement for as long as possible. Priority
   and lagging muscles are kept longest, then the earlier exercise, since a
   routine usually puts its main lifts first. Done sets are never touched. */
function shortPlan(d,mins){
  const pri=new Set(state.settings.priorities);const lag=new Set(IDX().scores.filter(x=>x.label==='lagging').map(x=>x.m));
  let cN=0;
  // Typed but not ticked counts as done here: trimming takes only blank rows (rowBlank).
  const bl=d.ex.map((b,bi)=>{const ex=EX(b.exId);const undone=b.sets.filter(x=>!x.warm&&rowBlank(b,x)).length;const done=b.sets.filter(x=>!x.warm&&!rowBlank(b,x)).length;const started=b.sets.some(x=>!rowBlank(b,x));
    const su=setupSecs(ex,cN);if(isCompound(ex))cN++;
    // Main (compound) lifts rank above isolation work, as the Short on time
    // help promises; priority and lagging muscles above both.
    return {bi,ex,undone,done,started,keep:undone,rest:blockRest(d,bi),per:setSecs(ex,b.plan),su,score:(pri.has(ex.primary)?4:0)+(lag.has(ex.primary)?2:0)+(isCompound(ex)?1:0)-bi*0.01};});
  const pc=pace();
  const cost=()=>bl.reduce((a,x)=>a+(x.keep?x.keep*(x.per+x.rest)+(x.started?0:x.su):0),0)*pc/60;
  const byLow=arr=>arr.slice().sort((a,b)=>a.score-b.score);
  let guard=0;
  while(cost()>mins&&guard++<500){const c=byLow(bl.filter(x=>x.keep>0&&x.done+x.keep>2));if(!c.length)break;c[0].keep--;}
  const kept=x=>x.keep>0||x.done>0;
  // A fly does not cover a bench press: only a compound covers a compound.
  const covered=x=>bl.some(y=>y!==x&&kept(y)&&y.ex.primary===x.ex.primary&&(isCompound(y.ex)||!isCompound(x.ex)));
  while(cost()>mins&&guard++<1000){const c=bl.filter(x=>x.keep>0&&!x.started);if(!c.length)break;const red=c.filter(covered);byLow(red.length?red:c)[0].keep=0;}
  while(cost()>mins&&guard++<1500){const c=byLow(bl.filter(x=>x.keep>0&&x.started));if(!c.length)break;c[0].keep--;}
  const changes=[];
  for(const x of bl){if(x.keep===x.undone)continue;
    if(x.keep===0&&!x.started)changes.push(`Skip ${x.ex.name}`);
    else changes.push(`${x.ex.name}: ${x.done+x.undone} → ${x.done+x.keep} set${x.done+x.keep===1?'':'s'}${x.done?` (${x.done} done)`:''}`);}
  return {bl,changes,est:Math.round(cost()),over:cost()>mins};
}
