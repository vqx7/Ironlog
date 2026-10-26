/* ---------- movable, foldable sections ----------
   Every section a tab shows carries data-mkey and a ⠿ handle in its header.
   Dragging the handle reorders sections; the order is saved per tab in
   settings.secOrder, and each screen draws its sections in it (view.ts,
   placed and slotted), into the places keyed sections hold, so unkeyed
   elements (page titles, the Start card, notices) never move. Keys a tab
   does not show right now (Injuries with none flagged) keep their saved
   place. On the handle, the arrow keys do the same as dragging. A session's
   exercises are dragged by workout.ts (r60). */
function keyedKids(){const v=$('#view');return v?[...v.children].filter(e=>e.dataset&&e.dataset.mkey):[];}
/* keys: the shown sections in their new order; a section not shown keeps its
   place after the one it followed. */
function saveSecOrder(keys){
  keys=[...new Set(keys)];
  const old=state.settings.secOrder[ui.tab]||[];const out=keys.slice();
  old.forEach((k,i)=>{if(out.includes(k))return;const prev=old.slice(0,i).reverse().find(q=>out.includes(q));out.splice(prev?out.indexOf(prev)+1:0,0,k);});
  act(()=>{state.settings.secOrder[ui.tab]=out;},{soon:true});
}
/* A screen places its sections from the saved order itself (every tab is a
   module's screen since r60), and its drawn nodes may not be moved under it:
   a drag or an arrow key reads the new order, puts the section back where it
   was drawn, saves the order and draws the screen again, which moves it. */
function mountSecSortable(){
  if(!window.Sortable)return;const v=$('#view');if(keyedKids().length<2)return;
  // Its own group, closed both ways: a section can only move among sections,
  // and no exercise or day can be dropped among them.
  sortables.push(window.Sortable.create(v,{group:{name:'sections',pull:false,put:false},handle:'.sgrip',draggable:'[data-mkey]',animation:150,fallbackOnBody:true,
    onStart:e=>dragStart(e.item),
    onEnd:e=>{
      if(e.oldIndex===e.newIndex){dragDrop();return;}
      // After Sortable has finished with the drop, and in one task, so the old order is never painted.
      const keys=keyedKids().map(x=>x.dataset.mkey);
      setTimeout(()=>{dragDrop();saveSecOrder(keys);rerenderKeepScroll();},0);}}));
}
function moveSecKey(g,dir){
  const el=g.closest('[data-mkey]');if(!el||el.parentElement!==$('#view'))return;
  const kids=keyedKids();const i=kids.indexOf(el);const j=i+dir;if(j<0||j>=kids.length)return;
  const k=el.dataset.mkey;
  const keys=kids.map(x=>x.dataset.mkey);keys.splice(i,1);keys.splice(j,0,k);saveSecOrder(keys);rerenderKeepScroll();
  const n=document.querySelector(`#view > [data-mkey="${k}"]`);const ng=n&&n.querySelector('.sgrip');if(ng)ng.focus();if(n)n.scrollIntoView({block:'nearest'});
  toast(`Moved ${dir<0?'up':'down'}`);
}
// A tap on the handle must never fold the section or fire a button under it.
document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('.sgrip,.bgrip')){e.preventDefault();e.stopPropagation();}},true);
document.addEventListener('keydown',e=>{
  const dg=e.target&&e.target.closest&&e.target.closest('.dgrip');
  if(dg&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();dayKey(dg,e.key==='ArrowUp');return;}
  const g=e.target&&e.target.closest&&e.target.closest('.sgrip');if(!g)return;
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();moveSecKey(g,e.key==='ArrowUp'?-1:1);}
  else if(e.key===' '||e.key==='Enter')e.preventDefault();
},true);
/* ---------- drag and drop ---------- */
function mountSortable(){
  if(!window.Sortable)return;
  // Plan is drawn by lit-html (r58): each drag ends in src/app/plan.ts, which puts the element back where it was drawn and changes the log.
  const opts={animation:150,fallbackOnBody:true,onStart:e=>dragStart(e.item)};
  document.querySelectorAll('ul.items').forEach(el=>sortables.push(window.Sortable.create(el,{...opts,group:{name:'days',pull:true,put:['days']},handle:'.grip',onEnd:dropItem})));
  // Days reorder by their ⠿ handle in a numbered cycle; labels come from position, so they renumber as the ↑/↓ Day buttons do.
  const dl=$('#dayList');
  if(dl&&curRoutineB().schedule!=='weekly')sortables.push(window.Sortable.create(dl,{...opts,group:{name:'dayorder',pull:false,put:false},handle:'.dgrip',draggable:'section.day',onEnd:dropDay}));
  const lib=$('#bLib');
  if(lib)sortables.push(window.Sortable.create(lib,{...opts,group:{name:'days',pull:'clone',put:false},sort:false,handle:'.grip',onEnd:dropLib}));
}



/* Typed or dictated sets. Examples it reads:
   "235x5, 5, 4 rir 1"   three sets at 235, RIR 1 on each
   "185x8@2 205x6@1"      load changes mid-exercise, RIR per set
   "225 for 5 5 4 at 1"   "for" and "at" work like x and @ (RIR 1 on the last set)
   "bw x 10, bw+25 x 6"   bodyweight exercises, added load after the plus
   A bare number after the first set repeats the last load. Anything it
   cannot read returns null, and Claude is asked instead. */
/* rpe: effort is entered as RPE (Settings, r33), so @8 is RPE 8, saved as
   RIR 2. "rpe 8" at the end is RPE in either mode, as "rir 2" is RIR. */
function parseSets(text,ex,defW,conv,rpe){
  conv=conv||fromD;
  const fromRpe=v=>v>=1&&v<=10?Math.round((10-v)*10)/10:NaN;
  let s=String(text||'').toLowerCase().replace(/[×*]/g,'x').replace(/\bfor\b/g,'x').replace(/\bat\b/g,'@').replace(/\breps?\b/g,'').replace(/\blbs?\b|\bkgs?\b/g,'');
  let allRir=null;const m=s.match(/\b(rir|rpe)\s*(\d+(?:\.\d+)?)\s*$/);if(m){allRir=m[1]==='rpe'?fromRpe(+m[2]):+m[2];if(!isFinite(allRir))return null;s=s.slice(0,m.index);}
  s=s.replace(/\s*x\s*/g,'x').replace(/\s*@\s*/g,'@').replace(/\s*\+\s*/g,'+').trim();
  if(!s)return null;
  const toks=s.split(/[\s,;/]+/).filter(Boolean);
  const re=/^(?:(bw)(?:\+(\d+(?:\.\d+)?))?x|(\d+(?:\.\d+)?)x)?(\d{1,3})(?:@(\d+(?:\.\d+)?))?$/;
  let w=defW==null?null:defW;const out=[];
  for(const t of toks){
    const g=t.match(re);if(!g)return null;
    if(g[1])w=g[2]?conv(+g[2]):0;else if(g[3]!=null)w=conv(+g[3]);
    const r=+g[4];if(!(r>=1&&r<=100))return null;
    const rir=g[5]!=null?(rpe?fromRpe(+g[5]):+g[5]):allRir;if(rir!=null&&!(rir>=0&&rir<=10))return null;
    if(w==null&&!ex.bw)return null;
    out.push({w:w==null?0:w,r,rir});
  }
  return out.length&&out.length<=20?out:null;
}
function fillSets(bi,list){
  const d=state.draft;const b=d&&d.ex[bi];if(!b)return 0;
  // On an assisted lift the numbers typed or said are the machine's help.
  if(EX(b.exId).assist)for(const p of list)if(p.w>0)p.w=-p.w;
  let si=b.sets.findIndex(x=>!x.done&&!x.warm);if(si<0)si=b.sets.length;let far=-1;
  for(const p of list){
    if(si>=b.sets.length)b.sets.push(newRow());
    const x=b.sets[si];x.w=p.w;x.r=p.r;x.rir=p.rir;x.warm=false;x.drop=false;x.done=!oddLoad(b,si,d.date)&&!oddReps(b,x);if(!x.done&&far<0)far=si;si++; /* a set far off is left for setDone's question, as a tick asks it (r55.1, the audit of r55: 1000x8 was saved as typed, a 1285 kg PR) */
  }
  saveNow();if(far>=0){rerenderKeepScroll();setDone(bi,far,true);}return list.length;
}

window.__onLib=(which)=>{if((which==='chart'&&ui.tab==='dash')||(which==='sortable'&&ui.tab==='program'))rerenderKeepScroll();};
trashTidy();
// r44: floors from a first-run pick made before they were recorded (fitRecordOld), once, on this device's state.
try{if(fitRecordOld())saveNow();}catch(e){log('fitRecordOld',e);}
// r54: targets fitted to a cycle by the reading of its plan before r54 follow r54's (refit, src/app/profile.ts), once, on this device's state.
try{const rf=refit();if(rf){const b=state.settings.bands;for(const m in rf.bands)b[m]=rf.bands[m].slice();if(Object.keys(rf.fit).length)state.settings.bandsFit=rf.fit;else delete state.settings.bandsFit;saveNow();}}catch(e){log('refit',e);}
window.__ironlog={act,liftRead,nextSets,bwNoLoad,withTimeout,B3_PARTS,THREE_URLS,platesPerSide,get state(){return state;},set state(v){setState(v);},fbContext,FB_CTX_MAX,logCut,logBuf,log,dateIndex,sessionsOn,bestLine,whyTarget,recent4w,weekSessions,fmtDate,fmtDateLong,fbShrink,orderAt,orderRun,dropOnlyLift,profHeavy,appBand,fitRecordOld,prof,profClean,profRule,profPlan,defPlan,defBand,profMoveBands,profApplyList,strengthPick,PROF_DAYS,FOCUS_MAX,estInLoad,keepExtra,EXTRA_MAX,draftPlanMin,pace,paceRatios,sessModelMin,PACE_N,PACE_DAYS,PACE_MIN,plainTemplate,trashTidy,ENV,KEY,COMMON,COMMON_TIP,isCommon,bwEvery,isRestWeek,sessCmp,avgWeeks,weekStreak,coach,noLog,adjOn,bwAt,newBlock,cycleState,sortedSessions,addDays,loadIn,gymRack,gymClean,dbListOf,capOf,refreshEx,effShow,rirScale,setStr,libExercises,obGate,obTour,andList,belowMin,aboveMax,starterRoutine,starterSigs,plateList,exBarKg,VOL_MODES,liveLogFetch,regionSrc,fitTargets,firstFullWeek,moveBlock,BANDS,installSheet,siteHost,greyW,effW,greyR,lighterLoad,heavierLoad,incOf,swapPlan,planSetsPerWeek,weekNeed,stepRead,e1inv,rtfAt,rtfOf,rtfBand,calStats,rirEff,isHard,setCredit,tonnage,loadMode,loadWords,loadNote,progStep,jumpCap,setSecs,setupSecs,recovery,rolling7,rankDays,rankExercises,isCompound,patternOf,noE1,whtrLine:p=>markupOf(whtrLine(p)),exHeadline:id=>markupOf(exHeadline(id)),remainMin,shortPlan,weekPlan,cycleProjection,lastLighterWeek,avgFirstWeek,avgWait,stallWeeks,weeksAvg,fitFloors,refit,regionBalance,parseHeight,mixCheck,swapCands,eqPlan,exportCSV,importData,chunksOf,assemble,sessionMuscles,TRACK_ONLY,hasTarget,cloud,Hx,mergeChunk,baseOf,sync:()=>cq(cloudPull),TEMPLATES,lastRFor,impDate,impRows,impNorm,impMatch,impFromText,impFromTable,impHeader,impBuild,impStart,impXlsx,parseSets,undoStack,undoRestore,undoForget,allTimeBests,bestsBoard:()=>{const b=bestsBoard();return {n:b.n,html:markupOf(b.html)};},obActive,fmtW,rirUsual,rirEst,routineFromTemplate,plannedSets,map3d:()=>({state:B3.state,fail:B3.fail,meshes:B3.meshes.length,yaw:B3.yaw,glow:Object.keys(B3.mats).filter(m=>B3.mats[m].emissiveIntensity>0),canvas:!!document.querySelector('#bm3d canvas'),colors:Object.fromEntries(Object.entries(B3.mats).map(([m,mt])=>[m,'#'+mt.color.getHexString()])),pick:(x,y)=>map3dPick(x,y),want:map3dColors()}),cloudState:()=>({on:cloud.on,status:cloud.status,err:cloud.err,uid:cloud.uid,acct:cloud.acct}),acctUser:()=>acct.user,acctWaiting:()=>!!acctWait.pw,flush:()=>cq(cloudFlush),cloudInit,cloudStop,asideList,backupDue,routineUpdates,planFor,platesMode,plateText,chunksOf,IDX,suggest,e1,render,ACT,ui,makeDemo,invalidate,normalize,snapshot,saveNow,timer,weekStats,weekStart,today,EX,blockProgress,dayMinutes,weekStreak,coach,tonnageNow,livePR,movers,stalledIds,muscleStatus,actualAvg4,plannedPerWeek,parseSets,fillSets,newBlock,lastNoteOf,sizeRows,sessionMuscleSets,sessionCapNote:d=>markupOf(sessionCapNote(d)),routineClutter,rowBlank,dayReasons,impTextSets,liftTrend:id=>markupOf(liftTrend(id)),prsWithin,activeRoutine,rackStep,repFloor,sessionLength,prBeat,exInjury,exJoints,openModal,EQUIP,HARD_EX,recentLighter,planEvidenceNote:pv=>markupOf(planEvidenceNote(pv)),howToUrl,editFp,toast,avgWeeks,regionWk,REGION_WKS,SAFETY_TXT,libFiltered,nameMatch,workLoad,fitE,lighter,offTarget,sessionWord,sessionWords,dayLabel,daySets,ssLetters,routineSig,tplCountLine,pwOf,planSetsOf,withPlanSets,dropStarter,trainOn,planItemOf,fatigueStalls,avgWeeksTxt,routineFromLog,repSpan,rangeWords,calDueIdx,readyCard,sameRR,hintOnce,overSets,rackTol,daysOff,BACK_DAYS,prName,sessTm,effTgt,bwDueCard:()=>markupOf(bwDueCard()),bwNoLoad,applyPick,joinAdjacent,sameExOnce,savedEx,goalState,goalLine:id=>markupOf(goalLine(id)),bwRefLoad,ML,exMusParts,musTrend,U,toD,fromD,loadLabel,exName,planCredit,gymOf,isDeloadWeek,freeMode,injuredSet,prLoad,statsUpTo,readiness,bwRef,weekRoutine,logBack,logStart,easierText,barKg,suggestCore,loadOf,bwLoad,hardCredit,rirHalfOn,prFrame,stallWords,atRangeTop,oddLoad,lightZero};
render();
wakeOn();
timerResume();
cloudInit();
acctInit().catch(e=>log('auth',e));
undoRestore().catch(e=>log('undo-load',e));
})();
