/* ---------- modal rendering ---------- */
/* Re-rendering a sheet used to rebuild it from the top: a tap on a muscle chip
   halfway down the exercise editor threw the sheet back to its first line and
   dropped the cursor. When the same sheet is redrawn, its scroll positions and
   the focused field (with the caret) are put back. */
function renderModal(){
  const el=$('#modal');const m=ui.modal;
  const same=!!m&&renderModal.last===m&&!el.hidden;
  const old=same?el.querySelector('.sheet'):null,oldIn=same?el.querySelector('.sheet-scroll'):null;
  const st=old?old.scrollTop:0,ist=oldIn?oldIn.scrollTop:0;
  const ae=document.activeElement;const fk=same&&ae&&el.contains(ae)?focusKey(ae):null;
  const ss=fk&&typeof ae.selectionStart==='number'?ae.selectionStart:null,se=fk&&typeof ae.selectionEnd==='number'?ae.selectionEnd:null;
  renderModalBody(same);tipLabels(el); // The labels' i buttons now, not when the page's watcher adds them after this task: they change the sheet's height, so a scroll put back before them slipped (r54; at the bottom, 4 px).
  if(el.hidden||!ui.modal){document.body.classList.remove('modal-open');renderModal.last=null;return;}
  if(document.getElementById('bm3dx'))mount3D();
  document.body.classList.add('modal-open');renderModal.last=ui.modal;
  if(!same)return;
  const sh=el.querySelector('.sheet'),inn=el.querySelector('.sheet-scroll');
  if(sh)sh.scrollTop=st;if(inn)inn.scrollTop=ist;
  if(fk){let n=null;try{n=el.querySelector(fk);}catch(e){/* stale selector */}
    if(n&&typeof n.focus==='function')try{n.focus({preventScroll:true});if(ss!=null&&typeof n.setSelectionRange==='function')n.setSelectionRange(ss,se);}catch(e){/* caret restore is best effort */}}
}
renderModal.last=null;
function renderModalBody(keep){
  const m=ui.modal;const el=$('#modal');if(!m){el.hidden=true;return;}
  let h='';
  if(m.kind==='account'){h=acctSheet(m);}
  else if(m.kind==='install'){h=installSheet(m);}
  else if(m.kind==='icon'){h=iconSheet(m);}
  else if(m.kind==='menu'){h=menuSheet();}
  else if(m.kind==='guide'){h=guideSheet(m);}
  else if(m.kind==='calendar'){h=calSheet(m);}
  else if(m.kind==='past'){h=pastSheet(m);}
  else if(m.kind==='feedback'){h=fbSheet(m);}
  else if(m.kind==='fbInbox'){h=fbInboxSheet(m);}
  else if(m.kind==='restwk'){h=restWeekSheet();
  }else if(m.kind==='daypick'){h=dayPickSheet(m);
  }else if(m.kind==='confirm'){h=confirmSheet(m);
  }else if(m.kind==='picker'){h=pickerSheet(m);
  }else if(m.kind==='exEdit'){h=exEditSheet(m);
  }else if(m.kind==='exhist'){
    h=exHistSheet(m);
  }else if(m.kind==='bmenu'){
    h=bmenuSheet(m);if(!h){ui.modal=null;el.hidden=true;return;}
  }else if(m.kind==='injury'){h=injurySheet();
  }else if(m.kind==='recap'){h=recapSheet(m);
  }else if(m.kind==='imp'){h=impSheet(m);
  }else if(m.kind==='templates'){h=templatesSheet(m);
  }else if(m.kind==='routineNew'){h=routineNewSheet();
  }else if(m.kind==='exMus'){h=exMusSheet(m);
  }else if(m.kind==='goal'){h=goalSheet(m);
  }else if(m.kind==='inc'){h=incSheet(m);
  }else if(m.kind==='cardio'){h=cardioSheet();
  }else if(m.kind==='quick'){
    h=quickSheet(m);if(!h){ui.modal=null;el.hidden=true;return;}
  }else if(m.kind==='max'){h=maxSheet(m);
  }else if(m.kind==='cal'){
    h=calibrationSheet(m);if(!h){ui.modal=null;el.hidden=true;return;}
  }else if(m.kind==='short'){
    h=shortSheet(m);if(!h){ui.modal=null;el.hidden=true;return;}
  }else if(m.kind==='note'){h=noteSheet(m);
  }else if(m.kind==='startAlt'){h=startAltSheet(m);
  }else if(m.kind==='pickToday'){h=pickTodaySheet();
  }else if(m.kind==='pickEx'){
    h=pickExSheet();if(!h){ui.modal=null;el.hidden=true;return;}
  }else if(m.kind==='eq'){
    h=eqSheet(m);if(!h){ui.modal=null;el.hidden=true;return;}
  }else if(m.kind==='text'){h=textSheet(m);
  }
  // A moved sheet is its template, kept in place when the open sheet is drawn again; the account sheet redrawn while signing in keeps its fields, so the one in use stays under the keyboard (r54, src/app/sheets.ts).
  sheetDraw(el,h,keep,m.kind==='account');const sh=el.querySelector('.sheet');
  if(sh){
    if(!sh.hasAttribute('tabindex'))sh.setAttribute('tabindex','-1');
    const hd=sh.querySelector('h3');
    if(hd&&!sh.hasAttribute('aria-label'))sh.setAttribute('aria-label',hd.textContent||'Dialog');
  }
}
/* One place that applies a choice from the exercise picker, or an exercise
   just created from it, for every mode the picker opens in. Adding to a
   session scrolls to the new exercise and marks it, instead of leaving it
   somewhere below the fold. */
function applyPick(m,id){
  if(!m||!id)return;
  if(m.mode==='addDay'){const R=curRoutineB();const d=R.days[m.day];closeModal();if(!d){rerenderKeepScroll();return;}d.items.push(newItem(id));Object.assign(d,trainOn(d));commit();rerenderKeepScroll();toast(`${exName(id)} added to ${dayLabel(R,m.day)}`);return;}
  if(m.mode==='swapItem'){const f=findItem(m.uid);if(f){const q=swapPlan(f.it,f.it.exId,id,f.r,f.r.days[f.di].id);Object.assign(f.it,{repMin:q.repMin,repMax:q.repMax,rir:q.rir,rest:q.rest,inc:q.inc});if(q.jump!=null)f.it.jump=q.jump;else delete f.it.jump;f.it.exId=id;commit();}closeModal();rerenderKeepScroll();return;}
  const d=state.draft;closeModal();if(!d){rerenderKeepScroll();return;}
  const half=p=>(d.deload||d.light)?{...p,sets:Math.max(1,Math.ceil(p.sets/2))}:p;
  if(m.mode==='addBlock'){const p0=planFor(id,null,d.dayId,false,d.date);const nb=newBlock(id,half(p0),{deload:!!d.deload,light:!!d.light,before:d.date});if(d.deload||d.light)nb.full=+p0.sets;
    const li=d.ex.length-1;const last=d.ex[li];
    if(joinable(last,nb)){const before=JSON.parse(JSON.stringify(last.sets)),plan={...last.plan},did=d.id;const added=joinRows(last,nb);
      snapshot(()=>{const dd=state.draft;if(!dd||dd.id!==did)return false;const y=dd.ex.find(x=>x===last);if(!y||added.some(x=>x.done))return false;y.sets=y.sets.filter(x=>!added.includes(x));y.plan=plan;return y.sets.length===before.length;});
      saveNow();afterAdd(li);toast(`${EX(id).name}: ${added.length} more set${added.length===1?'':'s'}, with the ones above`,true);return;}
    d.ex.push(nb);saveNow();afterAdd(d.ex.length-1);return;}
  /* Swapping used to replace the whole block, so sets already logged on the
     old exercise vanished. Now logged sets stay with the exercise they were
     done on, and the new one takes over the sets still to do. The count comes
     from the rows the exercise has now, not the routine's plan: the plan's
     count undid Short on time, + Set and − Set (r24). Since r54 nothing is
     marked: the replacement is read by its own usual, as every lift is. */
  if(m.mode==='swapBlock'){const b=d.ex[m.b];if(!b){rerenderKeepScroll();return;}
    const orig=JSON.parse(JSON.stringify(b));const bi=m.b,did=d.id;
    // Sets ticked or typed stay with the exercise they were done on (r25: typed, not ticked, used to vanish).
    const done=b.sets.filter(x=>!rowBlank(b,x));const left=b.sets.filter(x=>!x.warm&&!x.drop&&rowBlank(b,x)).length;
    const rows=b.sets.filter(x=>!x.warm&&!x.drop).length;if(done.length&&!left&&!m.all){const nn=EX(id).name;confirmBox(`Every set of ${EX(b.exId).name} is logged`,`Logged on the wrong exercise? Move the sets to ${nn}. Or add ${nn} after it.`,'Move the sets',()=>applyPick({...m,all:'move'},id),false,{label:`Add ${nn}`,fn:()=>applyPick({...m,all:'add'},id)});return;} // r55, the audit: it added the new lift with one set "for the sets left", none being left
    const nb=newBlock(id,{...swapPlan(b.plan,b.exId,id,null,d.dayId),sets:done.length&&left?left:Math.max(1,rows||+b.plan.sets||1)},{deload:!!d.deload,light:!!d.light,before:d.date});if(m.all==='move'){nb.sets=b.sets;if(b.bid)nb.bid=b.bid;snapshot(()=>{const dd=state.draft;if(!dd||dd.id!==did)return false;const i=dd.ex.indexOf(nb);if(i<0)return false;dd.ex[i]=orig;return true;});d.ex[bi]=nb;fixSupersets(d.ex.map(x=>x.plan));saveNow();rerenderKeepScroll();toast(`Your sets are on ${EX(id).name} now`,true);return;}nb.swappedFrom=b.swappedFrom||b.exId;if(nb.swappedFrom===id)nb.swappedFrom=null;
    /* Swapped to the exercise just after it (or just before it, when nothing
       stays behind): the sets go to that one, so the lift is one exercise. */
    const ni=done.length?(joinable(d.ex[bi+1],nb)?bi+1:-1):joinable(d.ex[bi-1],nb)?bi-1:joinable(d.ex[bi+1],nb)?bi+1:-1;
    if(ni>=0){const y=d.ex[ni];const plan={...y.plan};
      const added=joinRows(y,nb);
      snapshot(()=>{const dd=state.draft;if(!dd||dd.id!==did)return false;const yy=dd.ex.find(x=>x===y);if(!yy||added.some(x=>x.done))return false;
        yy.sets=yy.sets.filter(x=>!added.includes(x));yy.plan=plan;
        if(done.length){const i=dd.ex.findIndex(x=>x===b);if(i<0)return false;dd.ex[i]=orig;}else dd.ex.splice(dd.ex.indexOf(yy)+(ni<bi?1:0),0,orig);
        return true;});
      if(done.length){b.sets=done;b.plan={...b.plan,sets:done.filter(x=>!x.warm&&!x.drop).length||1};}
      else keepOpen(()=>d.ex.splice(bi,1));
      fixSupersets(d.ex.map(x=>x.plan));saveNow();rerenderKeepScroll();
      toast(done.length?`${EX(id).name}: the sets left join the ones below. Your sets so far stay with ${EX(orig.exId).name}.`:`Swapped to ${EX(id).name}: its sets are together now`,true);return;}
    snapshot(()=>{const dd=state.draft;if(!dd||dd.id!==did)return false;
      const at=dd.ex.findIndex(x=>x===nb);if(at<0||nb.sets.some(x=>x.done))return false;
      if(done.length){dd.ex.splice(at,1);const i=dd.ex.findIndex(x=>x===b);if(i>=0)dd.ex[i]=orig;else return false;}else dd.ex[at]=orig;
      return true;});
    if(done.length){b.sets=done;b.plan={...b.plan,sets:done.filter(x=>!x.warm&&!x.drop).length||1};keepOpen(()=>d.ex.splice(bi+1,0,nb));}
    else d.ex[bi]=nb;
    fixSupersets(d.ex.map(x=>x.plan));saveNow();rerenderKeepScroll();
    toast(done.length&&left?`${EX(id).name} added for the sets left. Your sets so far stay with ${EX(orig.exId).name}.`:done.length?`${EX(id).name} added after ${EX(orig.exId).name}`:`Swapped to ${EX(id).name}`,true);return;}
  rerenderKeepScroll();
}
function afterAdd(bi){
  rerenderKeepScroll();
  const el=document.getElementById('blk-'+bi);if(!el)return;
  let calm=false;try{calm=window.matchMedia('(prefers-reduced-motion: reduce)').matches;}catch(e){/* no media queries */}
  try{el.scrollIntoView({block:'start',behavior:calm?'auto':'smooth'});}catch(e){el.scrollIntoView();}
  el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');el.addEventListener('animationend',()=>el.classList.remove('flash'),{once:true}); // the screen keeps the block between draws (r60), so the mark goes when the flash ends
}

