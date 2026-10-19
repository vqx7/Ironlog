/* ---------- movable, foldable sections ----------
   Every section a tab shows carries data-mkey and a ⠿ handle in its header.
   Dragging the handle reorders sections; the order is saved per tab in
   settings.secOrder and applied after each render by moving the keyed
   elements into the slots the keyed elements occupied, so unkeyed elements
   (page titles, the Start card, notices) never move. Keys a tab does not
   show right now (Injuries with none flagged) keep their saved place.
   On the handle, the arrow keys do the same as dragging. */
/* After a list of sets in History: what the load and reps mean, when it is
   not a plain total. */
function histUnits(ex){const bits=[];const n=loadNote(ex).trim();if(n)bits.push(n);if(ex.perSide)bits.push(ex.timed?'seconds per side':'reps per side');return bits.length?` <span class="muted">(${bits.join(', ')})</span>`:'';}
/* A session's exercises move by dragging this handle too (V, r29), alongside
   the ⋯ menu's Move up and Move down, which do the same thing (bUp, bDown). */
function bgrip(bi,name){return `<span class="bgrip" role="button" tabindex="0" data-b="${bi}" aria-label="Move ${esc(name)}: drag, or use the arrow keys" title="Drag to move">⠿</span>`;}
/* One way to move an exercise in a session: the drag, the arrow keys on its
   handle and the ⋯ menu's Move up and Move down all come here. A superset
   split by the move is undone (its members are no longer next to each
   other, so the rest timer would never start), and a pending fold is dropped
   because the lifter is rearranging and should not have an exercise fold
   under them (r29). Nothing here goes stale any more: since r46 the fold,
   the confirm window and the pending auto-mark hold the exercise itself. */
function moveBlock(a,b){
  const d=state.draft;if(!d||b<0||b>=d.ex.length||a===b)return false;
  clearTimeout(foldT);foldT=null;
  keepOpen(()=>{move(d.ex,a,b);fixSupersets(d.ex.map(x=>x.plan).filter(Boolean));});
  saveNow();return true;
}
/* Starting an exercise ahead of ones not yet touched moves it up, to just
   after the last one touched (V, 2026-10-13: a lift done out of order stayed
   below empty ones). It waits until no field is being typed in, no effort
   strip or sheet is open, and a pending fold has run, so a rebuild never
   takes a field from under the thumb; the moved exercise stays where it is
   on the screen, and the untouched ones go below it. The block itself is
   remembered, not its place. Never in a superset, a past workout, or an
   edit from History, and never past the same lift (Last and grey reps read
   repeats of a lift by order). */
const blockUntouched=b=>!!b&&!b.sets.some(x=>x.done)&&b.sets.every(x=>rowBlank(b,x));
function orderAt(b){
  const d=state.draft;if(!d||d.editingId||d.past||!b||b.plan&&b.plan.ss)return -1;
  const bi=d.ex.indexOf(b);if(bi<1||!b.sets.some(x=>x.done))return -1;
  let j=bi;while(j>0&&blockUntouched(d.ex[j-1])&&d.ex[j-1].exId!==b.exId)j--;
  // Never between two halves of a superset.
  while(j<bi&&j>0&&d.ex[j].plan&&d.ex[j].plan.ss&&d.ex[j-1].plan&&d.ex[j-1].plan.ss===d.ex[j].plan.ss)j++;
  return j<bi?j:-1;
}
// Blocks waiting to move, in the order their first set was ticked (two ticked inside the wait both move, r45 review).
let orderT=null;const orderQ=[];
function orderSoon(b){if(!orderQ.includes(b))orderQ.push(b);clearTimeout(orderT);orderT=setTimeout(orderRun,900);}
function orderRun(){
  orderT=null;const d=state.draft;if(!d){orderQ.length=0;return;}
  const ae=document.activeElement;const typing=!!ae&&(/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)||ae.isContentEditable);
  if(ui.tab==='today'&&(typing||blockDrag||rebuilding||ui.modal||foldT!=null||document.querySelector('.rirstrip'))){orderT=setTimeout(orderRun,1500);return;}
  const q=orderQ.splice(0).filter(b=>d.ex.includes(b));if(!q.length)return;
  // The last one ticked stays where it is on the screen.
  const anchor=q[q.length-1];const el0=document.getElementById('blk-'+d.ex.indexOf(anchor));const top0=ui.tab==='today'&&el0?el0.getBoundingClientRect().top:null;
  let moved=false;
  for(const b of q){
    const bi=d.ex.indexOf(b),j=orderAt(b);if(j<0)continue;
    /* Only the focused field still carries a number, since it is markup; the
       set waiting to be confirmed, the pending auto-mark and the fold timer
       all hold the exercise itself now (r46), so the move leaves them alone. */
    const mi=i=>i===bi?j:(i>=j&&i<bi?i+1:i);
    if(ae&&ae.dataset&&/^\d+$/.test(ae.dataset.b||''))ae.dataset.b=String(mi(+ae.dataset.b));
    if(!moveBlock(bi,j))continue;
    moved=true;
  }
  if(!moved||ui.tab!=='today')return;
  rerenderKeepScroll();
  const el1=document.getElementById('blk-'+d.ex.indexOf(anchor));if(el1&&top0!=null)window.scrollBy(0,el1.getBoundingClientRect().top-top0);
}
/* While an exercise is dragged, a finger near the top or bottom of the space
   between the header and the tab bar (or the rest timer) scrolls the page,
   faster the closer it is. Sortable's own scrolling did not run for a touch
   drag on the window. Sortable re-reads the target every 50 ms on its own, so
   a finger held still keeps moving the exercise as the page scrolls.
   A var, so killDynamic (which can run before this line on the first render)
   reads it as undefined instead of throwing. */
var edgeScroll=(()=>{let y=null,raf=0;
  const mv=e=>{const t=e.touches?e.touches[0]:e;if(t)y=t.clientY;};
  // Both bars are position:fixed, whose offsetParent is always null, so
  // getClientRects is what tells a shown bar from a hidden one.
  const zone=()=>{const h=document.querySelector('header.top');const top=h?h.getBoundingClientRect().bottom:0;let bot=window.innerHeight;
    for(const el of [document.getElementById('tabs'),document.getElementById('timer')]){if(el&&!el.hidden&&el.getClientRects().length){const r=el.getBoundingClientRect();if(r.height)bot=Math.min(bot,r.top);}}return [top,bot];};
  const step=()=>{raf=0;if(!blockDrag)return;if(y!=null){const [top,bot]=zone();const edge=56;let v=0;
      if(y<top+edge)v=-Math.ceil((top+edge-y)/edge*14);else if(y>bot-edge)v=Math.ceil((y-(bot-edge))/edge*14);
      if(v)window.scrollBy(0,Math.max(-20,Math.min(20,v)));}
    raf=requestAnimationFrame(step);};
  return {start(){y=null;document.addEventListener('touchmove',mv,{passive:true});document.addEventListener('pointermove',mv,{passive:true});if(!raf)raf=requestAnimationFrame(step);},
    stop(){document.removeEventListener('touchmove',mv);document.removeEventListener('pointermove',mv);if(raf)cancelAnimationFrame(raf);raf=0;y=null;}};})();
/* The exercises open again at the drop. The scroll is moved with them, so
   the one just dropped stays where the finger left it instead of the page
   going back to a position measured on the one-line list (r29 review). */
function dragOpenUp(it){
  const t0=it&&it.isConnected?it.getBoundingClientRect().top:null;
  document.body.classList.remove('blkdrag');const v=$('#view');if(v)v.style.paddingBottom='';
  if(t0!=null){const t1=it.getBoundingClientRect().top;if(t1!==t0)window.scrollBy(0,t1-t0);}
}
function mountBlockSortable(){
  if(!window.Sortable||!state.draft)return;const v=$('#view');if(!v||v.querySelectorAll('section.block').length<2)return;
  sortables.push(window.Sortable.create(v,{group:{name:'blocks',pull:false,put:false},handle:'.bgrip',draggable:'section.block',animation:150,fallbackOnBody:true,
    // A field still focused when the drag starts would get its focus back by
    // position after the move, on whichever exercise landed there.
    onStart:e=>{blockDrag=true;clearTimeout(foldT);foldT=null;const f=document.activeElement;if(f&&f.matches&&f.matches('#view input,#view textarea')){try{f.blur();}catch(x){/* focus is best effort */}}
      // An open exercise is taller than the screen, so the next one started
      // off-screen and a drag could only move one place (r29 review). While
      // dragging, every exercise shows only its title line; the page is
      // scrolled so the one held stays under the finger.
      // When the shorter page cannot scroll that far, room is added below the
      // list for the drag, or the held one would leave the finger.
      const it=e.item,t0=it.getBoundingClientRect().top;document.body.classList.add('blkdrag');
      const want=window.scrollY+it.getBoundingClientRect().top-t0,se=document.scrollingElement,room=want-(se.scrollHeight-window.innerHeight);
      if(room>0){const v=$('#view');if(v)v.style.paddingBottom=Math.ceil(room)+'px';}
      window.scrollTo(0,want);edgeScroll.start();},
    onEnd:e=>{blockDrag=false;edgeScroll.stop();dragOpenUp(e.item);const a=e.oldDraggableIndex,b=e.newDraggableIndex;if(a==null||b==null||a===b||!state.draft){rerenderKeepScroll();return;}
      moveBlock(a,b);rerenderKeepScroll();toast(`Moved to position ${b+1}`);}}));
}
function sgrip(label){return `<span class="sgrip" role="button" tabindex="0" aria-label="Move ${esc(label)}: drag, or use the arrow keys" title="Drag to move">⠿</span>`;}
function keyedKids(){const v=$('#view');return v?[...v.children].filter(e=>e.dataset&&e.dataset.mkey):[];}
function applySecOrder(){
  const saved=state.settings.secOrder[ui.tab];if(!saved||!saved.length)return;
  const kids=keyedKids();if(kids.length<2)return;
  const order=orderKeys(saved,kids.map(e=>e.dataset.mkey));
  const byK={};kids.forEach(e=>{byK[e.dataset.mkey]=e;});
  const marks=kids.map(e=>{const c=document.createComment('slot');e.replaceWith(c);return c;});
  marks.forEach((c,i)=>c.replaceWith(byK[order[i]]));
}
/* The bottom of each tab (r28): what this tab can also show, one tap each,
   and the way to Settings > Layout for the rest. This is how a new person
   finds the hidden sections without reading anything first. A tab with
   nothing hidden shows no line. A section that would show nothing right now (Injuries with none flagged, an empty
   Recently deleted) is not offered. */
const MORE_LIVE={'today:session':()=>{const R=activeRoutine();const di=ui.todayDay!=null&&ui.todayDay<R.days.length?ui.todayDay:R.schedule==='weekly'?(new Date().getDay()+6)%7:cycleState(R).next;const d=R.days[di];return !!d&&!d.rest&&d.items.length>0;},'today:injuries':()=>(state.injuries||[]).length>0,'history:cardio':()=>state.cardio.length>0,'history:trash':()=>(state.trash||[]).length>0};
function moreLine(tab){
  const h=state.settings.hidden;
  const list=HIDEABLE.filter(([t,k])=>t===tab&&h.includes(t+':'+k)&&(!MORE_LIVE[t+':'+k]||MORE_LIVE[t+':'+k]()));
  // Nothing to add: nothing shown. Layout stays one tap away in the menu.
  if(!list.length)return '';
  return `<div class="moreline" id="moreLine"><p class="small muted ml-h">Add to this tab</p><div class="chips">${list.map(([t,k,l])=>`<button type="button" class="chip add" data-act="secShow" data-k="${t}:${k}">+ ${esc(l)}</button>`).join('')}</div><button type="button" class="linkbtn ml-c" data-act="goLayout">Show, hide, or reorder sections</button></div>`;
}
/* Sections hidden in Settings > Layout are taken out after rendering. Their
   saved position is kept, so showing one again puts it back where it was. */
function applyHidden(){
  const h=state.settings.hidden;if(!h||!h.length)return;
  keyedKids().forEach(e=>{if(h.includes(ui.tab+':'+e.dataset.mkey))e.remove();});
}
function saveSecOrder(){
  const keys=keyedKids().map(e=>e.dataset.mkey);
  const old=state.settings.secOrder[ui.tab]||[];const out=keys.slice();
  old.forEach((k,i)=>{if(out.includes(k))return;const prev=old.slice(0,i).reverse().find(q=>out.includes(q));out.splice(prev?out.indexOf(prev)+1:0,0,k);});
  state.settings.secOrder[ui.tab]=out;saveSoon();
}
function mountSecSortable(){
  if(!window.Sortable)return;const v=$('#view');if(keyedKids().length<2)return;
  // Its own group, closed both ways: a section can only move among sections,
  // and no exercise or day can be dropped among them.
  sortables.push(window.Sortable.create(v,{group:{name:'sections',pull:false,put:false},handle:'.sgrip',draggable:'[data-mkey]',animation:150,fallbackOnBody:true,
    onEnd:e=>{if(e.oldIndex!==e.newIndex)saveSecOrder();}}));
}
function moveSecKey(g,dir){
  const el=g.closest('[data-mkey]');if(!el||el.parentElement!==$('#view'))return;
  const kids=keyedKids();const i=kids.indexOf(el);const j=i+dir;if(j<0||j>=kids.length)return;
  if(dir<0)kids[j].before(el);else kids[j].after(el);
  saveSecOrder();g.focus();el.scrollIntoView({block:'nearest'});
  toast(`Moved ${dir<0?'up':'down'}`);
}
// A tap on the handle must never fold the section or fire a button under it.
document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('.sgrip,.bgrip')){e.preventDefault();e.stopPropagation();}},true);
document.addEventListener('keydown',e=>{
  const dg=e.target&&e.target.closest&&e.target.closest('.dgrip');
  if(dg&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
    e.preventDefault();const R=curRoutineB();const i=+dg.dataset.di;const j=i+(e.key==='ArrowUp'?-1:1);
    if(R.schedule==='weekly'||!R.days[i]||j<0||j>=R.days.length)return;
    move(R.days,i,j);ui.todayDay=null;ui.bTarget=0;commit();rerenderKeepScroll();
    const n=document.querySelector(`.dgrip[data-di="${j}"]`);if(n)n.focus();
    toast(`${R.days[j].name||'Day'} is now ${dayLabel(R,j)}`);return;
  }
  const bg=e.target&&e.target.closest&&e.target.closest('.bgrip');
  if(bg&&(e.key==='ArrowUp'||e.key==='ArrowDown')&&state.draft){
    e.preventDefault();const i=+bg.dataset.b;const j=i+(e.key==='ArrowUp'?-1:1);if(j<0||j>=state.draft.ex.length)return;
    moveBlock(i,j);rerenderKeepScroll();const n=document.querySelector(`.bgrip[data-b="${j}"]`);if(n)n.focus();toast(`Moved to position ${j+1}`);return;
  }
  const g=e.target&&e.target.closest&&e.target.closest('.sgrip');if(!g)return;
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();moveSecKey(g,e.key==='ArrowUp'?-1:1);}
  else if(e.key===' '||e.key==='Enter')e.preventDefault();
},true);
/* ---------- drag and drop ---------- */
function mountSortable(){
  if(!window.Sortable)return;
  document.querySelectorAll('ul.items').forEach(el=>{
    sortables.push(window.Sortable.create(el,{group:{name:'days',pull:true,put:['days']},handle:'.grip',animation:150,fallbackOnBody:true,
      onEnd:evt=>{
        const from=+evt.from.dataset.day,to=+evt.to.dataset.day;
        if(evt.to.id==='bLib'||isNaN(to)){setTimeout(rerenderKeepScroll,0);return;}
        if(from===to&&evt.oldIndex===evt.newIndex)return;
        const R=curRoutineB();if(!R.days[from]||!R.days[to]){setTimeout(rerenderKeepScroll,0);return;}
        const [it]=R.days[from].items.splice(evt.oldIndex,1);
        if(it){R.days[to].items.splice(evt.newIndex,0,it);if(R.days[to].rest)R.days[to].rest=false;}
        commit();setTimeout(rerenderKeepScroll,0);
      }}));
  });
  // Days reorder by their ⠿ handle in a numbered cycle. Labels come from
  // position, so the renumbering is automatic; same effect as the ↑/↓ Day buttons.
  const dl=$('#dayList');
  if(dl&&curRoutineB().schedule!=='weekly')sortables.push(window.Sortable.create(dl,{group:{name:'dayorder',pull:false,put:false},handle:'.dgrip',draggable:'section.day',animation:150,fallbackOnBody:true,
    onEnd:evt=>{
      if(evt.oldIndex===evt.newIndex)return;
      const R=curRoutineB();if(!R.days[evt.oldIndex]||evt.newIndex<0||evt.newIndex>=R.days.length){setTimeout(rerenderKeepScroll,0);return;}
      move(R.days,evt.oldIndex,evt.newIndex);ui.todayDay=null;ui.bTarget=0;commit();setTimeout(rerenderKeepScroll,0);
      toast(`${R.days[evt.newIndex].name||'Day'} is now ${dayLabel(R,evt.newIndex)}`);
    }}));
  const lib=$('#bLib');
  if(lib)sortables.push(window.Sortable.create(lib,{group:{name:'days',pull:'clone',put:false},sort:false,handle:'.grip',animation:150,fallbackOnBody:true,
    onEnd:evt=>{
      if(evt.to===evt.from)return;
      const to=+evt.to.dataset.day;const exId=evt.item.dataset.ex;const R=curRoutineB();
      if(!isNaN(to)&&exId&&R.days[to]){R.days[to].items.splice(evt.newIndex,0,newItem(exId));if(R.days[to].rest)R.days[to].rest=false;commit();toast(`${exName(exId)} added to ${dayLabel(R,to)}`);}
      setTimeout(rerenderKeepScroll,0);
    }}));
}


const AI={fn:null,ready:false,off:true,ctl:null};function aiInit(){}const aiOn=()=>false;

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
  let si=b.sets.findIndex(x=>!x.done&&!x.warm);if(si<0)si=b.sets.length;
  for(const p of list){
    if(si>=b.sets.length)b.sets.push({w:null,r:null,rir:null,warm:false,drop:false,done:false});
    const x=b.sets[si];x.w=p.w;x.r=p.r;x.rir=p.rir;x.warm=false;x.drop=false;x.done=true;si++;
  }
  saveNow();return list.length;
}

window.__onLib=(which)=>{if((which==='chart'&&ui.tab==='dash')||(which==='sortable'&&ui.tab==='program'))rerenderKeepScroll();};
trashTidy();
// r44: floors from a first-run pick made before they were recorded (fitRecordOld), once, on this device's state.
try{if(fitRecordOld())saveNow();}catch(e){log('fitRecordOld',e);}
window.__ironlog={B3_PARTS,THREE_URLS,get state(){return state;},set state(v){setState(v);},fbContext,FB_CTX_MAX,logCut,logBuf,log,dateIndex,sessionsOn,bestLine,whyTarget,recent4w,weekSessions,fmtDate,fmtDateLong,fbShrink,orderAt,orderRun,dropOnlyLift,profHeavy,appBand,fitRecordOld,prof,profClean,profRule,profPlan,defPlan,defBand,profMoveBands,profApplyList,strengthPick,PROF_DAYS,FOCUS_MAX,estInLoad,keepExtra,EXTRA_MAX,draftPlanMin,pace,paceRatios,sessModelMin,PACE_N,PACE_DAYS,PACE_MIN,plainTemplate,trashTidy,ENV,KEY,COMMON,COMMON_TIP,isCommon,bwEvery,isRestWeek,sessCmp,avgWeeks,weekStreak,coach,noLog,afterSet,adjOn,bwAt,newBlock,cycleState,sortedSessions,addDays,loadIn,gymRack,gymClean,dbListOf,capOf,refreshEx,effShow,rirScale,setStr,libExercises,obGate,obTour,andList,belowMin,aboveMax,starterRoutine,starterSigs,plateList,exBarKg,VOL_MODES,liveLogFetch,regionSrc,fitTargets,firstFullWeek,moveBlock,BANDS,installSheet,siteHost,greyW,effW,greyR,lighterLoad,incOf,swapPlan,planSetsPerWeek,weekNeed,stepRead,e1inv,rtfAt,rtfOf,rtfBand,calStats,rirEff,isHard,setCredit,tonnage,loadMode,loadWords,loadNote,progStep,jumpCap,setSecs,setupSecs,recovery,rolling7,rankDays,rankExercises,isCompound,patternOf,noE1,whtrLine,exHeadline,remainMin,shortPlan,weekPlan,cycleProjection,lastLighterWeek,avgFirstWeek,stallWeeks,regionBalance,parseHeight,mixCheck,swapCands,eqPlan,exportCSV,importData,chunksOf,assemble,sessionMuscles,TRACK_ONLY,cloud,Hx,mergeChunk,baseOf,sync:()=>cq(cloudPull),TEMPLATES,lastRFor,impDate,impRows,impNorm,impMatch,impFromText,impFromTable,impHeader,impBuild,impStart,impXlsx,parseSets,undoStack,undoRestore,undoForget,allTimeBests,bestsBoard,obActive,fmtW,rirUsual,rirEst,routineFromTemplate,plannedSets,map3d:()=>({state:B3.state,fail:B3.fail,meshes:B3.meshes.length,yaw:B3.yaw,glow:Object.keys(B3.mats).filter(m=>B3.mats[m].emissiveIntensity>0),canvas:!!document.querySelector('#bm3d canvas'),colors:Object.fromEntries(Object.entries(B3.mats).map(([m,mt])=>[m,'#'+mt.color.getHexString()])),pick:(x,y)=>map3dPick(x,y),want:map3dColors()}),cloudState:()=>({on:cloud.on,status:cloud.status,err:cloud.err,uid:cloud.uid,acct:cloud.acct}),acctUser:()=>acct.user,acctWaiting:()=>!!acctWait.pw,flush:()=>cq(cloudFlush),backupDue,routineUpdates,planFor,platesMode,plateText,chunksOf,IDX,suggest,e1,render,ACT,ui,makeDemo,invalidate,normalize,snapshot,saveNow,timer,weekStats,weekStart,today,EX,blockProgress,dayMinutes,weekStreak,coach,tonnageNow,livePR,movers,stalledIds,muscleStatus,actualAvg4,plannedPerWeek,parseSets,fillSets,newBlock,lastNoteOf,sizeRows,sessionMuscleSets,sessionCapNote,routineClutter,rowBlank,dayReasons,impTextSets,liftTrend,prsWithin,activeRoutine,rackStep,repFloor,sessionLength,prBeat,exInjury,exJoints,openModal,EQUIP,HARD_EX,recentLighter,planEvidenceNote,howToUrl,editFp,toast,avgWeeks,regionWk,REGION_WKS,SAFETY_TXT,libFiltered,nameMatch,workLoad,fitE,offSession,tagged,fatigueStalls,avgWeeksTxt,routineFromLog,repSpan,rangeWords,calDueIdx,readyCard,sameRR,hintOnce,overSets,rackTol,daysOff,BACK_DAYS,prName,sessTm,effTgt,bwDueCard,bwNoLoad,applyPick,joinAdjacent,sameExOnce,goalState,goalLine,bwRefLoad,ML,exMusParts,musTrend,U,toD,fromD,loadLabel,exName,planCredit,gymOf,isDeloadWeek,freeMode,injuredSet,prLoad,statsUpTo,readiness,bwRef,weekRoutine,easierText,barKg,suggestCore,loadOf,bwLoad,hardCredit,rirHalfOn};
render();
wakeOn();
timerResume();
cloudInit();
acctInit().catch(e=>log('auth',e));
aiInit();
undoRestore().catch(e=>log('undo-load',e));
})();
