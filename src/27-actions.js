/* ---------- a past workout, date first ----------
   The phone was left at home, so the sets are on paper or in memory. The
   date comes first and everything is read as of that day: which routine day
   was due, last time's numbers and targets, and PRs. The logger then runs in
   quick entry (draft.past): no rest timer, no clock, no check-in, and a set
   ticks itself once its reps are typed, so a whole workout goes in one pass.
   The session is saved under its date, so next up, targets and PRs after it
   read correctly even when it is entered after later sessions. Its sheet
   and the day due then are src/app/sheetsapp.ts's since r62. */
/* Never a deload (r54, from the audit V asked for): the week's mark does not
   say which day Deload week was tapped, so a workout logged for a day before
   it opened and saved as one. It is logged as what was done, and a lift done
   lighter reads lighter from its numbers. */
function pastDraft(date,di){
  const R=activeRoutine();const day=di==null?null:R.days[di];
  if(!day){const d=freeDraft('Freestyle');return {...d,date,startedAt:null,past:true};}
  return {id:uid(),startedAt:null,date,dayIdx:di,dayId:day.id,dayName:day.name,routineId:R.id,deload:false,light:false,past:true,cardio:[],notes:'',note0:'',editingId:null,ex:day.items.map(it=>newBlock(it.exId,it,{before:date}))};
}
/* The page's actions by data-act: the moved screens' (History and Settings,
   r57; Plan and Stats, r58; Today, r59; the session screen, r60; each change
   to the log through act) and the legacy script's own, the sheets'. */
const ACT={...HISTORY_ACTS,...SETTINGS_ACTS,...PLAN_ACTS,...DASH_ACTS,...TODAY_ACTS,...MAP_ACTS,...WORKOUT_ACTS,...UPDATE_ACTS,...ACCOUNT_ACTS,...REPORT_ACTS,...IMPORT_ACTS,...DEMO_ACTS,
  iconHow(){openModal({kind:'icon'});},
  guideOpen(t){const k=t&&t.dataset&&t.dataset.g;if(ui.modal)closeModal();openModal({kind:'guide',open:k||''});},
  menuOpen(){if(ui.modal&&ui.modal.kind==='menu'){closeModal();return;}if(ui.modal)closeModal();openModal({kind:'menu'});},
  /* The choice applies to the session in progress too: rows still on the
     suggestion switch between grey and filled, typed loads stay as typed. */
  loadAsk(t){
    const fill=t.dataset.v==='fill';if(fill)state.settings.loadFill='fill';else delete state.settings.loadFill;
    const d=state.draft;
    // Filled in, a row takes what it showed in grey (a load typed above it, else the suggestion), and follows a correction above like carried rows do.
    if(d)for(const b of d.ex)b.sets.forEach((x,i)=>{if(x.done||x.warm||x.drop||x.r!=null||x.rir!=null)return;
      if(fill&&x.w==null){const g=greyW(b,i);if(g!=null){x.w=g;if(g!==b.sw)carried.add(x);}}
      else if(!fill&&(x.w===b.sw||carried.has(x))){x.w=null;carried.delete(x);}});
    commit();rerenderKeepScroll();toast(fill?'Loads filled in':'Loads in grey');
  },
  calOpen(t){const ym=t&&t.dataset&&/^\d{4}-\d{2}$/.test(t.dataset.ym||'')?t.dataset.ym:today().slice(0,7);if(ui.modal)closeModal();openModal({kind:'calendar',ym});}, // 'calendar', not 'cal', the calibration set's sheet (r59: from r25 a calibration set opened the calendar and threw)
  calMonth(t){
    const inline=t.dataset.inline==='1';const m=ui.modal;
    if(!inline&&(!m||m.kind!=='calendar'))return;
    const cur=inline?(ui.calYm||today().slice(0,7)):m.ym;const {min,max}=calBounds();let ym;
    if(t.dataset.v==='now')ym=today().slice(0,7); // this month, now the calendar goes a year ahead (329, r59)
    else{const [y,mo]=cur.split('-').map(Number);const d=new Date(y,mo-1+(+t.dataset.v||0),1);ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
    if(ym<min||ym>max)return;
    if(inline){ui.calYm=ym;rerenderKeepScroll();}else{m.ym=ym;renderModal();}},
  calDay(t){
    const d=t.dataset.date;if(!isDate(d)||d>today())return;
    if(ui.modal)closeModal();
    const ss=sessionsOn(d);
    if(ss.length===1){ACT.wkOpen({dataset:{id:ss[0].id}});return;}
    // Two-a-days (r34): a day with more than one session asks which.
    if(ss.length>1){openModal({kind:'daypick',date:d});return;}
    if(d===today()){ACT.wkGo({dataset:{date:d}});return;}
    ACT.pastOpen({dataset:{date:d}});
  },
  install(){
    const how=installKind();
    if(how==='prompt'){
      const e=window.__installEvt;window.__installEvt=null;
      try{e.prompt();Promise.resolve(e.userChoice).then(r=>{if(r&&r.outcome==='accepted')toast(`Installing ${APP_NAME}. Open it from your home screen.`);rerenderKeepScroll();},()=>{});}
      catch(err){log('install',err);openModal({kind:'install',how:'menu'});}
      return;
    }
    openModal({kind:'install',how});
  },
  startFree(){
    if(state.draft){ui.tab='today';render();return;}
    // In a week marked as a deload, a blank session is one too, as a routine day and Do again are (r54, PENDING 311 c: it started at full sets).
    const dl=isDeloadWeek();state.draft={...freeDraft(dl?'Freestyle (deload)':'Freestyle'),deload:dl,notes:dl?DELOAD_NOTE:''};ui.tab='today';
    state.draft.note0=state.draft.notes||'';saveNow();window.scrollTo(0,0);render();wakeOn();
    openModal({kind:'picker',mode:'addBlock',title:'Add exercise to session',q:'',m:''});
  },
  /* The session is built first so the sheet can preview what gets trimmed. If
     the sheet is closed without applying and nothing was logged, the session
     is removed again, since the user only asked a question. */
  startShort(t){const had=!!state.draft;ACT.startSession(t);if(state.draft&&!had)openModal({kind:'short',mins:null,temp:state.draft.id});},
  shortOpen(){if(state.draft)openModal({kind:'short',mins:null});},
  shortPick(t){const m=ui.modal;if(!m||m.kind!=='short')return;m.mins=+t.dataset.v;renderModal();},
  shortApply(){
    const m=ui.modal;const d=state.draft;if(!m||!d||!m.mins){closeModal();return;}
    const pl=shortPlan(d,m.mins);m.applied=true;if(!pl.changes.length){closeModal();return;}
    const drop=new Set();const removed=new Map(),order=d.ex.slice(),did=d.id;
    /* Undo puts back exactly what the trim took (r25): the blank rows, at the
       end of their exercise, and the skipped exercises in their places. Sets
       logged since stay (the merge Undo used before brought back skipped
       exercises but not removed rows). Nothing is marked since r54. */
    snapshot(()=>{const dd=state.draft;if(!dd||dd.id!==did)return false;
      for(const [b,rows] of removed)if(dd.ex.includes(b))b.sets.push(...rows);
      order.forEach((b,i)=>{if(drop.has(i)&&!dd.ex.includes(b))dd.ex.splice(Math.min(i,dd.ex.length),0,b);});
      fixSupersets(dd.ex.map(b=>b.plan));return true;});
    for(const x of pl.bl){
      if(x.keep===x.undone)continue;const b=d.ex[x.bi];
      if(x.keep===0&&!x.started){drop.add(x.bi);continue;}
      // Only blank rows go, from the end; typed and ticked sets always stay.
      let n=x.undone-x.keep;const gone=[];
      for(let i=b.sets.length-1;i>=0&&n>0;i--){const s=b.sets[i];if(!s.warm&&rowBlank(b,s)){gone.unshift(...b.sets.splice(i,1));n--;}}
      removed.set(b,gone);
    }
    d.ex=d.ex.filter((b,bi)=>!drop.has(bi));
    fixSupersets(d.ex.map(b=>b.plan));
    closeModal();saveNow();rerenderKeepScroll();
    toast(`Trimmed to ${estMin(min5(pl.est))}`,true);
  },
  bCal(t){
    const bi=+t.dataset.b;const d=state.draft;const b=d&&d.ex[bi];if(!b)return;
    const nx=b.sets.find(x=>!x.done&&!x.warm);const w=nx&&nx.w!=null?nx.w:(b.sets.filter(x=>!x.warm&&+x.w>0).map(x=>+x.w).pop());
    openModal({kind:'cal',b:bi,w:w!=null?fmtW(w):'',at:'',pred:b.plan&&isNum(+b.plan.rir)?Math.min(5,Math.round(+b.plan.rir)):1,total:''});
  },
  calSave(){
    const m=ui.modal;const d=state.draft;const b=d&&m&&d.ex[m.b];if(!b){closeModal();return;}
    const ex=EX(b.exId);
    m.w=$('#calW').value;m.at=$('#calAt').value;m.pred=+$('#calPred').value;m.total=$('#calTot').value;
    const w=numIn(m.w),at=Math.round(numIn(m.at)),tot=Math.round(numIn(m.total));
    if(!ex.bw&&!(w>0)){m.err='Enter the load.';renderModal();return;}
    if(!(at>=1)){m.err='Enter the rep you would normally have stopped at.';renderModal();return;}
    if(!(tot>=at)){m.err='Total reps to failure should be at least the rep you would have stopped at.';renderModal();return;}
    if(tot>100){m.err='That is more than 100 reps. Check the number.';renderModal();return;}
    const set={w:fromD(Math.max(0,w||0)),r:tot,rir:0,warm:false,drop:false,done:true,cal:{at,pred:m.pred}};
    let si=b.sets.findIndex(x=>!x.done&&!x.warm&&x.r==null);if(si<0)si=b.sets.findIndex(x=>!x.done&&!x.warm);
    if(si>=0)b.sets[si]=set;else b.sets.push(set);
    closeModal();saveNow();rerenderKeepScroll();
    const left=tot-at,diff=left-m.pred;
    toast(`${left} rep${left===1?' was':'s were'} left where you called ${m.pred}. ${diff>0?'Your sets are easier than you log.':diff<0?'You were closer to failure than you thought.':'Spot on.'}`,false,7000);
  },
  bMax(t){const b=state.draft&&state.draft.ex[+t.dataset.b];if(!b)return;openModal({kind:'max',exId:b.exId,b:+t.dataset.b});},
  maxSave(){
    const m=ui.modal;const e=state.exercises.find(x=>x.id===m.exId);if(!e){closeModal();return;}
    const n=numIn(($('#maxVal')||{}).value);
    if(n!=null&&n<0){toast('Enter a load of 0 or more, or leave it blank');return;}
    if(n!=null&&n>0)e.maxLoad=fromD(Math.min(n,U()==='lb'?4000:2000));else delete e.maxLoad;
    closeModal();commit();
    refreshEx(e.id);
    saveNow();rerenderKeepScroll();toast(e.maxLoad!=null?`Heaviest available for ${e.name}: ${fmtW(e.maxLoad)} ${U()}`:`No limit for ${e.name}`);
  },
  secShow(t){
    const k=t.dataset.k;if(!HIDEABLE_KEYS.has(k))return;
    state.settings.hidden=state.settings.hidden.filter(x=>x!==k);ui.folds[k]=true;commit();rerenderKeepScroll();
    const el=document.querySelector(`#view > [data-sk="${k}"]`);if(el)el.scrollIntoView({block:'nearest'});
    const lab=(HIDEABLE.find(x=>x[0]+':'+x[1]===k)||[])[2]||'Section';
    toast(`${lab} added. Hide it again in Settings, Layout.`);
  },
  goLayout(){if(ui.modal)closeModal();ui.tab='settings';ui.folds['settings:layout']=true;window.scrollTo(0,0);render();const el=document.querySelector('#view > [data-mkey="layout"]');if(el)el.scrollIntoView({block:'start'});},
  obSample(){openModal({kind:'templates',from:'welcome'});},
  // The fold in the first-run routine picker (r44): its own state, so a re-render keeps it open.
  obProfTog(){ui.obProf=!ui.obProf;rerenderKeepScroll();},
  tplPick(t){
    const m=ui.modal;const from=m&&m.kind==='templates'?m.from:'plan';const k=t.getAttribute('data-k');
    const r=routineFromTemplate(k);if(!r)return;closeModal();
    // The same template added again, unchanged, is opened rather than duplicated.
    const same=state.routines.find(x=>routineSig(x)===routineSig(r));
    if(from==='welcome'){
      // First run: the untouched starter routine is replaced by the pick, not
      // kept beside it. A routine with sessions logged against it always stays.
      if(same)state.activeRoutineId=same.id;
      else{state.routines=dropStarter(state.routines,state.sessions,starterSigs());state.routines.push(r);state.activeRoutineId=r.id;}
      const fit=fitTargets(state.routines.find(x=>x.id===state.activeRoutineId));const pa=profApplyList(activeRoutine());for(const x of pa)Object.assign(x.it,x.ch); // Your training, set in this sheet, applied as its Apply does (r55, the audit: Strength set here left the pick's plans as they were, and Settings then offered to apply it)
      state.settings.onboarded=true;ui.todayDay=null;ui.tab='today';commit();window.scrollTo(0,0);render();
      toast(`${r.name} is ready${pa.length?', set to Your training':''}${fit?'. Weekly set targets now match it; change them in Settings.':''}`,null,fit||pa.length?6000:0);return;
    }
    if(same){ui.bRoutine=same.id;render();toast('You already have this routine unchanged. Opened it instead.');return;}
    state.routines.push(r);ui.bRoutine=r.id;commit();render();toast(`${r.name} added. Tap Make active to use it.`);
  },
  // Log a workout now keeps the starter routine, so its targets fit it the
  // same way a routine picked on this page does (decision 114, r29).
  /* Log a workout now is a freestyle choice (r34.2, from the review: the
     starter's 4 days a week became the bar for someone training 3 times as
     they liked, "0-week streak", "of 88 planned"). Today opens on a blank
     session, the starter stays one tap away as the plan, and the default
     targets stay, with nothing said over the exercise picker. */
  obFree(){state.settings.onboarded=true;state.settings.todayStart='free';commit();ACT.startFree();},
  histRepeat(t){
    const s=state.sessions.find(x=>x.id===t.dataset.id);if(!s)return;
    const go=()=>{
      const R=activeRoutine();const day=!s.free&&s.routineId===R.id&&s.dayId?R.days.find(x=>x.id===s.dayId):null;
      const deload=isDeloadWeek();
      const plan=b=>{
        const it=day&&day.items.find(i=>i.exId===b.exId);if(it)return deload?{...it,sets:Math.max(1,Math.ceil(it.sets/2))}:{...it};
        const p=planFor(b.exId);if(b.rr){p.repMin=b.rr[0];p.repMax=Math.max(b.rr[0],b.rr[1]);}
        const n=b.sets.filter(isWork).length;if(n)p.sets=deload?Math.max(1,Math.ceil(n/2)):n;return p;};
      const ex=s.ex.map(b=>{const nb=newBlock(b.exId,plan(b),{deload});const n=b.sets.filter(isWork).length;if(deload&&n&&!(day&&day.items.some(i=>i.exId===b.exId)))nb.full=Math.min(n,30);return nb;});
      state.draft=day?{id:uid(),startedAt:Date.now(),date:today(),dayIdx:R.days.indexOf(day),dayId:day.id,dayName:day.name+(deload?' (deload)':''),routineId:R.id,deload,light:false,cardio:[],notes:deload?DELOAD_NOTE:'',editingId:null,ex}
        :{...freeDraft(s.free?s.dayName:`Again: ${s.dayName}`.slice(0,40),ex),deload};
      if(state.draft)state.draft.note0=state.draft.notes||'';ui.tab='today';saveNow();window.scrollTo(0,0);render();wakeOn();
      toast(day?`${day.name} started with the same exercises`:'Started as a freestyle session');
    };
    if(state.draft)confirmBox('Replace the session in progress?','You have an unsaved session open. Starting this one discards it.','Discard and start',go,true);else go();
  },
  crashRetry(){ui.tab='today';ui.planView='routine';try{closeModal();}catch(e){log('render',e);}ui.modal=null;window.scrollTo(0,0);render();}, // the sheet closed first (r56.1): a question left open reads as Cancel, so the sync waiting on it does not wait forever
  undo(){
    if(!undoStack.length){toast('Nothing left to undo');return;}
    /* Undo used to put back the whole state from before the action, which
       also threw away every session, weigh-in or set logged since then. Now
       only the action is reversed: a three-way merge with the state right
       after the action as the base, what is here now as one side and the
       state before the action as the other. Records changed since the action
       keep their newer version. */
    const e=undoStack.pop();undoPersist();const before=canon(state);
    let done=false;
    if(e.inv){try{done=e.inv()===true;}catch(x){log('undo',x);done=false;}if(done)setState(normalize(state));}
    if(!done)try{
      const pre=normalize(JSON.parse(e.pre));const post=e.post?normalize(JSON.parse(e.post)):state;
      const P=chunksOf(pre),Q=chunksOf(post),C=chunksOf(state);const stat={conflicts:0};const parts={};
      for(const id of new Set([...Object.keys(P),...Object.keys(Q),...Object.keys(C)])){
        const q=Q[id]||emptyChunk(id);
        parts[id]=id==='draft'?{draft:mergeDraft(Q.draft&&Q.draft.draft,normalize(JSON.parse(JSON.stringify(state))).draft,P.draft&&P.draft.draft)} /* the session in progress compared in one form, all three normalized, as a reload leaves it: the live one compared raw read every exercise as changed since and nothing went back (r55.1, the audit of r55: Undo after Make it lighter) */
          :mergeChunk(id,q?baseOf(id,q):null,C[id]||emptyChunk(id),P[id]||emptyChunk(id),false,stat);
      }
      setState(assemble(parts));
    }catch(x){log('undo',x);toast('Could not undo that');return;}
    if(canon(state)===before){toast('Nothing to undo there: it has changed since.');const below0=undoStack[undoStack.length-1];if(below0&&below0.post==null)below0.post=e.pre;return;}
    // If the step below never saw a save of its own, its result is the state
    // before the step just undone, not what this undo is about to save.
    const below=undoStack[undoStack.length-1];if(below&&below.post==null)below.post=e.pre;
    commit();toastHide();render();
    toast(`Undone. ${undoStack.length} step${undoStack.length===1?'':'s'} left`);
  },
  help(t){const k=t.dataset.h;const on=!ui.help.has(k);if(on)ui.help.add(k);else ui.help.delete(k);
    const el=document.getElementById('help-'+k);if(el){el.hidden=!on;
      // A ? outside a section (the Start card, a page title) may point into a closed section, so open it.
      const d=on&&el.closest('details');if(d&&!d.open)d.open=true;}
    document.querySelectorAll(`[data-act="help"][data-h="${k}"]`).forEach(b=>b.setAttribute('aria-expanded',String(on)));},
  applyUpd(){
    const u=ui.modal&&ui.modal.upd;closeModal();if(!u)return;
    const R=state.routines.find(r=>r.id===u.rid);const day=R&&R.days.find(x=>x.id===u.dayId);if(!day){toast('That routine day no longer exists');return;}
    snapshot();
    for(const x of u.swap){const it=day.items.find(i=>i.exId===x.from);if(it){it.exId=x.to;if(x.plan){Object.assign(it,x.plan);if(x.plan.jump==null)delete it.jump;}}} // at the plan it was done at (r55)
    for(const x of u.add)if(!day.items.some(i=>i.exId===x.exId))day.items.push({...x.plan,uid:uid(),exId:x.exId,ss:null});
    // Each superset kept: its exercises side by side, in the order done, under one link.
    for(const ids of u.ss||[]){const its=ids.map(id=>day.items.find(i=>i.exId===id)).filter(Boolean);if(its.length<2)continue;
      const at=Math.min(...its.map(i=>day.items.indexOf(i)));day.items=day.items.filter(i=>!its.includes(i));day.items.splice(at,0,...its);
      const g=uid();for(const i of its)i.ss=g;}
    fixSupersets(day.items);
    if(day.items.length)Object.assign(day,trainOn(day));
    commit();render();toast(`${day.name} updated`,true);
  },
  goalOpen(t){openModal({kind:'goal',exId:t.dataset.ex});},
  goalSave(){const m=ui.modal;const e=state.exercises.find(x=>x.id===m.exId);if(!e){closeModal();return;}
    const w=numIn(($('#goalW')||{}).value),r=Math.round(numIn(($('#goalR')||{}).value));
    if(!(r>=1&&r<=LIMITS.goalReps)){toast(`Reps from 1 to ${LIMITS.goalReps}`);return;}
    if(w==null&&!e.bw){toast('Enter a load');return;}
    if(w!=null&&w<0){toast('Enter a load of 0 or more');return;}
    snapshot();e.goal={w:fromD(w||0),r};closeModal();commit();rerenderKeepScroll();toast(`Goal set: ${goalWords(e,e.goal)}`,true);},
  goalClear(){const m=ui.modal;const e=state.exercises.find(x=>x.id===m.exId);if(!e){closeModal();return;}snapshot();delete e.goal;closeModal();commit();rerenderKeepScroll();toast('Goal removed',true);},
  bInc(t){const b=state.draft.ex[+t.dataset.b];openModal({kind:'inc',exId:b.exId,plan:b.plan});},
  incSave(){
    const m=ui.modal;const n=numIn(($('#incVal')||{}).value);if(n==null||n<=0){toast('Enter a step above 0');return;}
    const e=state.exercises.find(x=>x.id===m.exId);if(!e){closeModal();return;}
    // Saved without typing, a lift with no step of its own keeps following its default (Your gym's rack, say) (r33).
    // A number typed is saved, even the one shown (review: typing 5 on a 5 and 2.5 rack did nothing); so is any other number.
    if(e.inc==null&&!m.typed&&String(numIn(fmtW(incOf(e,m.plan))))===String(n)){closeModal();return;}
    e.inc=Math.min(fromD(n),LIMITS.step);closeModal();commit();refreshEx(e.id);saveNow();rerenderKeepScroll();toast(`Load step for ${e.name}: ${fmtW(e.inc)} ${U()}`);
  },
  cardioNew(){openModal({kind:'cardio'});},
  cardioSave(){
    const min=numIn($('#cMin').value);if(min==null||min<=0){toast('Enter the minutes');return;}
    const date=$('#cDate').value||today();
    state.cardio.push(cleanCardio({id:uid(),date:isDate(date)?date:today(),kind:$('#cKind').value,min,hr:numIn($('#cHr').value),when:'solo',note:($('#cNote').value||'').trim(),dist:distIn($('#cDist').value)}));
    closeModal();commit();rerenderKeepScroll();toast('Cardio logged');
  },
  restWkOpen(){openModal({kind:'restwk'});},
  restWk(t){const ws=t.dataset.w;if(!isDate(ws))return;snapshot();const r=(state.settings.restWeeks||[]).slice();const on=r.includes(ws);
    state.settings.restWeeks=on?r.filter(x=>x!==ws):[...r,ws].sort();if(!state.settings.restWeeks.length)delete state.settings.restWeeks;
    invalidate();commit();renderModal();rerenderKeepScroll();toast(on?'Rest week cleared':'Rest week marked',true);},
  injAdd(){openModal({kind:'injury'});},
  injSave(){const m=$('#injM').value;const note=($('#injNote').value||'').trim();
    if(!MK.includes(m)&&!JK.includes(m))return;state.injuries=(state.injuries||[]).filter(x=>x.m!==m);state.injuries.push({id:uid(),m,note,date:today()});
    closeModal();commit();render();toast(`${injLabel(m)} flagged`);},
  bMenu(t){openModal({kind:'bmenu',b:+t.dataset.b});},
  // A choice in the exercise menu: the sheet closes, then the session screen's action it names runs (workout.ts).
  bMenuDo(t){const op=t.dataset.op;closeModal();const f=ACT[op];if(f)f(t);},
  tAdd(){timerAdd();},
  tStop(){stopTimer();},
  mClose(){closeModal();},
  mOk(){const m=ui.modal;const fn=m&&m.fn;if(m)m.answered=true;closeModal();fn&&fn();},
  mAlt(){const m=ui.modal;const a=m&&m.alt;if(m)m.answered=true;closeModal();a&&a.fn&&a.fn();},
  startSession(t){
    if(ui.modal)closeModal();toastQuiet();
    const R=activeRoutine();const di=+t.dataset.day;const d=R.days[di];if(!d)return;
    const light=t.dataset.light==='1';const deload=!light&&isDeloadWeek();
    // Lighter: half the sets at about 90% loads (one easy day, r30). Deload: half the sets
    // at about 90% loads for a whole week, and flagged so it never counts
    // against a lift's trend or stall read.
    const items=d.rest?[]:d.items.map(it=>(light||deload)?{...it,sets:Math.max(1,Math.ceil(it.sets/2))}:it);
    state.draft={id:uid(),startedAt:Date.now(),date:today(),dayIdx:di,dayId:d.id,dayName:d.name+(light?' (lighter)':deload?' (deload)':''),routineId:R.id,deload,light,cardio:[],notes:light?LIGHTER_NOTE:deload?DELOAD_NOTE:'',editingId:null,ex:items.map(it=>newBlock(it.exId,it,{deload,light}))};
    state.draft.note0=state.draft.notes||'';saveNow();window.scrollTo(0,0);render();wakeOn();
  },
  goBackup(){if(ui.modal)closeModal();ui.tab='settings';ui.folds['settings:data']=true;window.scrollTo(0,0);render();const el=document.getElementById('dataSec');if(el)el.scrollIntoView({block:'start'});},
  bQuick(t){openModal({kind:'quick',b:+t.dataset.b,text:''});},
  bHist(t){const b=state.draft&&state.draft.ex[+t.dataset.b];if(b)openModal({kind:'exhist',exId:b.exId});},
  // The editor's muscle pickers already name the muscles; the figure is there on request (r40, V: not both at once).
  exBodyTog(){ui.exBody=!ui.exBody;renderModal();},
  bMus(t){const b=state.draft&&state.draft.ex[+t.dataset.b];if(b)openModal({kind:'exMus',exId:b.exId});},
  qFill(){
    const m=ui.modal;if(!m||m.kind!=='quick')return;const d=state.draft;const b=d&&d.ex[m.b];if(!b)return;
    const txt=(($('#qTxt')||{}).value||'').trim();m.text=txt;if(!txt){m.err='Type at least one set.';renderModal();return;}
    const ex=EX(b.exId);const fi=b.sets.findIndex(x=>!x.done&&!x.warm);const fw=fi>=0?effW(b,fi):null;const defW=fw!=null?fw:null;
    const got=parseSets(txt,ex,defW,null,rirScale()==='rpe');
    const finish=list=>{const n=fillSets(m.b,list);if(!(ui.modal&&ui.modal.kind==='confirm')){closeModal();rerenderKeepScroll();toast(`${n} set${n===1?'':'s'} filled and marked done`);}};
    if(got){finish(got);return;}
m.err=`Could not read that. Try the pattern 225x5, 5, 4 ${rirScale()==='rpe'?'rpe 9':'rir 1'}.`;renderModal();  },
  startAltOpen(t){openModal({kind:'startAlt',di:+t.dataset.day,free:t.dataset.free==='1'});},
  // A choice in Change: the sheet closes first, then the start it names runs as the card's button did.
  altGo(t){const go=t.dataset.go;closeModal();if(ACT[go])ACT[go](t);},
  // Another day of the plan on the card (the old Change day list); in a blank-session Today it shows that day's card.
  dayPick(t){const i=+t.dataset.i;closeModal();ui.todayDay=i;ui.todayAt=null;window.scrollTo(0,0);render();},
  bNote(t){const bi=+t.dataset.b;openModal({kind:'note',bi,title:`Note: ${exName(state.draft.ex[bi].exId)}`,text:state.draft.ex[bi].note||''});},
  noteSave(){
    const m=ui.modal;const ta=$('#mNote');if(!m||!ta||!state.draft)return;
    const b=state.draft.ex[m.bi];if(b)b.note=ta.value.trim();
    closeModal();saveNow();rerenderKeepScroll();
  },
  bSwap(t){openModal({kind:'picker',mode:'swapBlock',b:+t.dataset.b,title:'Swap exercise',q:'',m:EX(state.draft.ex[+t.dataset.b].exId).primary});},
  pickSession(){openModal({kind:'picker',mode:'addBlock',title:'Add exercise to session',q:'',m:''});},
  pickDay(t){openModal({kind:'picker',mode:'addDay',day:+t.dataset.day,title:`Add to ${dayLabel(curRoutineB(),+t.dataset.day)}`,q:'',m:''});},
  iSwap(t){const f=findItem(t.dataset.uid);openModal({kind:'picker',mode:'swapItem',uid:t.dataset.uid,title:'Swap exercise',q:'',m:f?EX(f.it.exId).primary:''});},
  pickDo(t){applyPick(ui.modal,t.dataset.ex);},
  /* Pick for me, before a session: rank the routine's days for today. */
  pickToday(){openModal({kind:'pickToday'});},
  pickView(t){closeModal();ui.todayDay=+t.dataset.day;ui.todayAt=null;ui.tab='today';window.scrollTo(0,0);render();},
  /* Pick for me, inside a session: what to add next. */
  pickEx(){if(!state.draft)return;openModal({kind:'pickEx'});},
  pickExAdd(t){
    const d=state.draft;if(!d)return;const id=t.dataset.ex;if(!state.exercises.some(e=>e.id===id)){closeModal();return;}
    const p=planFor(id,null,d.dayId,false,d.date);const n=Math.round(+t.dataset.sets),full=Math.round(+t.dataset.full);if(n>=1&&n<=30)p.sets=n;
    const nb=newBlock(id,p,{deload:!!d.deload,light:!!d.light,before:d.date});if((d.deload||d.light)&&full>=1&&full<=30)nb.full=full;d.ex.push(nb);saveNow();closeModal();afterAdd(d.ex.length-1);
    toast(`${exName(id)} added: ${p.sets} set${p.sets===1?'':'s'}`);
  },
  /* Limited equipment: pick what is available, preview the swaps, start. */
  eqOpen(t){const di=+t.dataset.day;const R=activeRoutine();if(!R.days[di])return;openModal({kind:'eq',day:di,equip:(ui.eqLast||EQUIP.map(x=>x[0])).slice()});},
  eqToggle(t){const m=ui.modal;if(!m||m.kind!=='eq')return;const k=t.dataset.k;m.equip=m.equip.includes(k)?m.equip.filter(x=>x!==k):[...m.equip,k];renderModal();},
  eqStart(){
    const m=ui.modal;if(!m||m.kind!=='eq')return;const R=activeRoutine();const day=R.days[m.day];if(!day){closeModal();return;}
    const eq=new Set(m.equip);const pl=eqPlan(day,eq).filter(x=>x.to);if(!pl.length){toast('Nothing in this workout fits that equipment');return;}
    ui.eqLast=m.equip.slice();closeModal();
    const deload=isDeloadWeek();
    const ex=pl.map(x=>{const it=deload?{...x.it,sets:Math.max(1,Math.ceil(x.it.sets/2))}:x.it;// A much harder swap gets a range it can be done in (r30): 3 to 6 reps, 2 in reserve.
      const sp=x.from?swapPlan(it,x.from,x.to,R,day.id):{...it};if(x.hard)Object.assign(sp,{repMin:3,repMax:6,rir:2});
      const b=newBlock(x.to,sp,{deload});if(x.from)b.swappedFrom=x.from;return b;});
    const sw=eqPlan(day,eq).filter(x=>x.from);
    const note=sw.length?'Limited equipment: '+sw.map(x=>`${exName(x.from)} → ${x.to?exName(x.to):'left out'}`).join('; ')+'.':'';
    state.draft={id:uid(),startedAt:Date.now(),date:today(),dayIdx:m.day,dayId:day.id,dayName:day.name+(deload?' (deload)':''),routineId:R.id,deload,light:false,limited:true,cardio:[],notes:[deload?DELOAD_NOTE:'',note].filter(Boolean).join(' '),editingId:null,ex};
    state.draft.note0=state.draft.notes||'';saveNow();window.scrollTo(0,0);render();wakeOn();
  },
  /* Log a past workout: from an empty past day in the top bar (that date),
     or from History (yesterday, changeable in the sheet). */
  pastOpen(t){
    const d=t&&t.dataset&&isDate(t.dataset.date)&&t.dataset.date<=today()?t.dataset.date:addDays(today(),-1);
    openModal({kind:'past',date:d});
  },
  pastGo(t){
    const m=ui.modal;if(!m||m.kind!=='past')return;const date=m.date;
    const di=t.dataset.day==='free'?null:+t.dataset.day;
    const go=()=>{
      stopTimer();wakeOff();
      state.draft=pastDraft(date,di);ui.tab='today';ui.todayDay=null;
      saveNow();window.scrollTo(0,0);render();
      if(di==null)openModal({kind:'picker',mode:'addBlock',title:'Add exercise to session',q:'',m:''});
    };
    closeModal();
    if(state.draft&&(state.draft.editingId||draftEntered(state.draft)))confirmBox('Replace the session in progress?',state.draft.editingId?'You are editing a saved session. Your edits will be lost.':'You have an unsaved session open. Starting this one discards it.','Discard and start',go,true);
    else go();
  },
  /* A day in the top bar: today or ahead opens Today on it. */
  wkGo(t){
    const d=t.dataset.date;ui.tab='today';
    if(!state.draft){const R=activeRoutine();const di=t.dataset.day!=null?+t.dataset.day:null;ui.todayDay=d===today()||di==null||!R.days[di]?null:di;ui.todayAt=ui.todayDay==null?null:{d,di};} // the date it was opened for, said on the card when past this week (329, r59)
    if(ui.modal)closeModal();window.scrollTo(0,0);render();
  },
  rNew(){openModal({kind:'routineNew'});},
  rNewSave(){const nm=(($('#rNewName')||{}).value||'').trim();if(!nm){toast('Give the routine a name');return;}if(nameTaken(nm)){toast('A routine already has that name. Pick another.');return;}closeModal();ACT.rNewDo(nm);},
  rNewDo(nm){
    // An existing empty routine is reused rather than stacking another blank one.
    const blank=state.routines.find(r=>routineEmpty(r)&&r.id!==state.activeRoutineId);
    if(blank){blank.name=nm||blank.name;ui.bRoutine=blank.id;commit();render();toast('Reused your empty routine');return;}const r={id:uid(),name:nm||'New routine',schedule:'cycle',days:[0,1,0,1,0,1,1].map(x=>({id:uid(),name:x?'Rest':'Training day',rest:!!x,items:[]}))};state.routines.push(r);ui.bRoutine=r.id;commit();render();}, // Laid out as Build my own's (r55, the audit: three training days and no rest planned 7 sessions a week).
  rTemplate(){openModal({kind:'templates',from:'plan'});},
  exNew(){openModal({kind:'exEdit',isNew:true,e:{id:'c_'+uid(),name:'',primary:'chest',secondary:[],equip:'cable',bw:false,rare:false,note:'',custom:true,archived:false}});},
  exNewFromPicker(){const back=ui.modal;if(!back||back.kind!=='picker')return;openModal({kind:'exEdit',isNew:true,back,e:{id:'c_'+uid(),name:(back.q||'').trim(),primary:back.m||'',secondary:[],equip:'cable',bw:false,rare:false,note:'',custom:true,archived:false,incRaw:''}});},
  exBack(){const m=ui.modal;if(m&&m.back)openModal(m.back);else closeModal();}, // back to the sheet this one was opened from, else closed: the exercise editor's, and an account sheet's opened from a problem report (r55)
  exEdit(t){ui.exBody=false;const e=JSON.parse(JSON.stringify(EX(t.dataset.ex)));e.incRaw=e.inc!=null?fmtW(stepRead(e.inc)):'';e.bwfRaw=String(Math.round(bwShare(e)*100));e.maxRaw=e.maxLoad!=null?fmtW(e.maxLoad):'';e.barRaw=e.barKg!=null?fmtW(e.barKg):'';
    openModal({kind:'exEdit',isNew:false,e});},
  secToggle(t){const e=ui.modal.e;const k=t.dataset.m;e.secondary=e.secondary.includes(k)?e.secondary.filter(x=>x!==k):[...e.secondary,k];renderModal();},
  exSave(){
    const m=ui.modal;const e=m.e;e.name=(e.name||'').trim();if(!e.name){toast('Give the exercise a name');return;}
    // A quick create from search used to default to Chest, so a curl made in a
    // hurry was counted as chest work from then on.
    if(!MK.includes(e.primary)){toast('Pick the main muscle it trains');const el=document.querySelector('[data-ebind="primary"]');if(el)try{el.focus();}catch(x){/* focus is best effort */}return;}
    e.secondary=e.secondary.filter(k=>k!==e.primary);
    {const n=numIn(e.incRaw);e.inc=n!=null&&n>0?Math.min(fromD(n),LIMITS.step):null;delete e.incRaw;}
    {const n=numIn(e.maxRaw);if(n!=null&&n>0)e.maxLoad=fromD(Math.min(n,U()==='lb'?4000:2000));else delete e.maxLoad;delete e.maxRaw;}
    {const n=numIn(e.barRaw);if(n!=null&&n>0&&platesMode(e)==='bar')e.barKg=Math.min(fromD(n),LIMITS.barKg);else delete e.barKg;delete e.barRaw;}
    {const n=numIn(e.bwfRaw);delete e.bwfRaw;const def=BWF[e.id]!=null?BWF[e.id]:1;
     if(e.bw&&n!=null&&n>0&&n<=150&&Math.abs(n/100-def)>0.005)e.bwf=Math.round(n)/100;else delete e.bwf;}
    if(e.timed!==true)delete e.timed;
    if(e.kind!=='compound'&&e.kind!=='iso')delete e.kind;
    e.plates=['bar','side','sleeve','none'].includes(e.plates)?e.plates:null;
    if(['each','total','side','stack'].includes(e.load)&&!e.bw)e.load=e.load;else delete e.load;
    // Sets already logged with machine help are below 0; the exercise must stay assisted to read them right.
    if(!m.isNew&&!(e.bw&&e.assist)&&(state.sessions.some(x=>x.ex.some(b=>b.exId===e.id&&b.sets.some(q=>+q.w<0)))||(state.draft&&state.draft.ex.some(b=>b.exId===e.id&&b.sets.some(q=>+q.w<0))))){toast('This exercise has sets logged with machine help, so it stays assisted.');return;}
    // The reverse: sets with added weight would read as help once Assisted is on, so it goes on a separate exercise.
    const wasA=!m.isNew&&(state.exercises.find(x=>x.id===e.id)||{}).assist;
    if(!m.isNew&&e.bw&&e.assist&&!wasA&&(state.sessions.some(x=>x.ex.some(b=>b.exId===e.id&&b.sets.some(q=>+q.w>0)))||(state.draft&&state.draft.ex.some(b=>b.exId===e.id&&b.sets.some(q=>+q.w>0))))){toast('This exercise has sets with added weight. Use Assisted Pull-up or Assisted Dip, or a new exercise, for machine help.');return;}
    if(m.isNew)state.exercises.push(e);else{const i=state.exercises.findIndex(x=>x.id===e.id);if(i>=0)state.exercises[i]=e;}
    commit();if(!m.isNew){refreshEx(e.id);saveNow();}
    // Created from a picker: it goes straight where the picker was adding or
    // swapping, instead of back to the list for a second tap.
    if(m.isNew&&m.back&&m.back.kind==='picker'){const back=m.back;applyPick(back,e.id);toast(back.mode==='addBlock'||back.mode==='addDay'?`${e.name} created and added`:`${e.name} created and swapped in`);return;}
    if(m.back){const back=m.back;back.q=e.name;openModal(back);}else closeModal();
    rerenderKeepScroll();toast(m.isNew?'Exercise created':'Exercise saved');
  },
  /* Every tile, summary row and map detail lands on the matching dashboard
     section, opened even if you had folded it, with the relevant muscle or
     exercise already selected. */
  goDash(t){
    const raw=t.getAttribute('data-sec'),m=t.getAttribute('data-m'),ex=t.getAttribute('data-ex');
    const sec=raw&&DSEC_ALIAS[raw]?DSEC_ALIAS[raw]:raw;
    if(sec&&state.settings.hidden.includes('dash:'+sec)){toast('That section is hidden. Turn it back on in Settings under Layout.');return;}
    if(raw==='svol')ui.volMode='load';
    if(m&&MK.includes(m)){ui.dashMuscle=m;if(sec==='volume')ui.volMode='trend';}
    if(ex)ui.dashEx=ex;
    if(sec){ui.folds['dash:'+sec]=true;if(raw!==sec)ui.folds['dash:sub:'+raw]=true;}
    ui.tab='dash';window.scrollTo(0,0);render();
    if(sec){try{const el=document.getElementById('sec-'+sec);if(el){el.open=true;
      const inner=raw!==sec&&document.getElementById('sub-'+raw);if(inner)inner.open=true;
      const tgt=inner||el;if(tgt.scrollIntoView)tgt.scrollIntoView({block:'start'});}}catch(e){/* scroll is best effort */}}
  },
  wkOpen(t){
    if(ui.modal&&ui.modal.kind==='daypick')closeModal();
    const id=t.dataset.id;ui.tab='history';ui.histEx='';ui.histOpen=id;
    // An older session may be past the first page of History: load enough rows to reach it.
    const at=[...state.sessions].sort((a,b)=>sessCmp(b,a)).findIndex(x=>x.id===id);ui.histLimit=Math.max(HIST_PAGE,at+1);
    window.scrollTo(0,0);render();
    try{const el=document.querySelector(`[data-act="histToggle"][data-id="${id}"]`);if(el&&el.scrollIntoView)el.scrollIntoView({block:'start'});}catch(e){/* scroll is best effort */}
  },
  histEdit(t){
    const s=state.sessions.find(x=>x.id===t.dataset.id);if(!s)return;
    const go=()=>{const R=state.routines.find(r=>r.id===s.routineId)||activeRoutine();
      const dayItems=s.free?[]:((R.days[sessDayIdx(R,s)]||{items:[]}).items);
      state.draft={id:uid(),editingId:s.id,deload:!!s.deload,light:!!s.light,free:s.free?true:undefined,chk:s.chk?{...s.chk}:undefined,startedAt:null,durMin:s.durMin||null,date:s.date,dayIdx:s.dayIdx,dayId:s.dayId||null,dayName:s.dayName,routineId:s.routineId,notes:s.notes||'',ex:s.ex.map(b=>{const it=dayItems.find(i=>i.exId===b.exId);const plan=it?{...it}:planFor(b.exId,null,null,false,s.date);return {bid:uid(),exId:b.exId,plan,note:b.note||'',keepRR:b.rr||null,light:b.light?true:undefined,hint:'Editing saved sets.',lastR:[],sets:b.sets.map(x=>newRow({w:x.w,r:x.r,rir:x.rir,warm:!!x.warm,drop:!!x.drop,done:true,cal:x.cal?{...x.cal}:undefined,rid:x.rid})),...(b.nw?{nw:true}:{})};})};
      editFp0.set(state.draft.id,editFp(state.draft));
      saveNow();ui.tab='today';window.scrollTo(0,0);render();};
    if(state.draft)confirmBox('Replace the session in progress?','You have an unsaved session open. Editing this one will discard it.','Discard and edit',go,true);else go();
  },
  export(){exportBackup();},
  exportCsv(){exportCSV();},
  showBackup(){openModal({kind:'text',title:'Backup text',help:'Select all and copy. Paste it into Import on any device to restore.',text:JSON.stringify({app:STORAGE_ID,exported:new Date().toISOString(),state}),readonly:true});},
  copyText(){const ta=$('#mText');ta.select();let ok=false;try{if(navigator.clipboard){navigator.clipboard.writeText(ta.value).then(()=>{markExported();toast('Copied');},()=>toast('Select the text and copy it manually'));return;}ok=document.execCommand('copy');}catch(e){log('copy',e);}if(ok)markExported();toast(ok?'Copied':'Select the text and copy it manually');},
};
