/* ---------- the sheets ----------
   Drawn, opened and closed by src/app/page.ts since r63, from the table of
   every kind of sheet given to it at start (src/10-start.js). */
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

