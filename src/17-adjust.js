/* ---------- Adjusting the next sets (r34, V) ----------
   Coaches who program by effort move the next set from how the last one
   went. After a ticked working set, when it was clearly off, the rows below
   that are still the app's (nothing typed) take a new load:
   - lighter than planned: 2 or more reps in reserve over the target with the
     reps in the range, or 2 or more reps past the top of the range (the
     same 2 that moves the next session's load from the estimate, r27;
     3 until r45, V: 14 reps on a 10 to 12 range left the load alone);
   - heavier than planned: 2 or more reps under both the bottom of the range
     and what this session expected of the set (last time's reps at this
     load, or the target's minimum after a new load), not stopped early (no
     reserve over the target). A lift building reps up from under the range
     (a large step, r31) is expected there and is left alone.
   The new load is what the set's own estimate says allows the middle of the
   range (up) or the bottom of it (down) at the target RIR with one rep more
   in reserve for fatigue, at most 10% up (15% on light isolation lifts,
   jumpCap), in whole steps or on the rack. Conventions, meant to err light.
   A rep or two lost per set is normal fatigue and changes nothing. Off for
   warm-ups, drops, timed holds, assisted lifts, a fixed load, an injury, a
   lighter day or deload, past workouts and edits, and when turned off in
   Settings. "Keep" undoes it for that exercise for the rest of the session. */
function heavierLoad(ex,plan,from,to){
  const L=gymRack(ex,plan);
  if(L){const tl=rackTol(),tf=rackTol(L,from);const c=L.filter(x=>x>from+tf&&x<=to+tl);return c.length?c[c.length-1]:null;}
  const step=incOf(ex,plan,from);if(!(step>0))return null;const k=Math.floor((to-from)/step+1e-6);return k>=1?from+k*step:null;
}
function adjOn(){return state.settings.autoAdj!==false;}
/* A bodyweight lift never done with added load (r34.2, from the review:
   push-ups at BW x 20 were moved to BW+10 mid-session, a load the lifter
   never had, and one tap logged it). It progresses by reps until the lifter
   types a load. */
function bwNoLoad(ex,b){if(!ex||!ex.bw||ex.assist)return false;if(b&&b.sets.some(x=>+x.w>1e-6))return false;return !((IDX().byEx[ex.id]||[]).some(x=>x.pts.some(p=>p.w>1e-6)));}
// The set an adjustment came from, by object, so a row added or removed above it cannot move it onto another set (r34.2).
const adjSrc=new WeakMap();
function adjSync(b){
  if(!b||!b.adj)return;const src=adjSrc.get(b);if(!src)return;const i=b.sets.indexOf(src);
  if(i<0||src.warm||src.drop||!src.done){const prev={...b.adj};delete b.adj;adjSrc.delete(b);adjRows(b,prev,null);return;}
  b.adj.at=i;
}
function assessSet(bi,si){
  const d=state.draft;const b=d&&d.ex[bi];const s=b&&b.sets[si];if(!s)return false;const had=JSON.stringify(b.adj||null);const prev=b.adj?{...b.adj}:null;
  /* Which rows are still the app's is read before the old adjustment goes:
     with "Fill in suggested loads" on they hold its load, and reading them
     after it was dropped put them back at once (r34.2, from the review). */
  const appL=x=>appLoad(b,x)||(!!prev&&x.w!=null&&Math.abs(x.w-prev.w)<1e-9);
  const rest=b.sets.some((x,i)=>i>si&&!x.done&&!x.warm&&!x.drop&&appL(x));
  if(b.adj&&b.adj.at>=si){delete b.adj;adjSrc.delete(b);}
  const ex=EX(b.exId);const p=b.plan||{};
  const off=!adjOn()||b.adjOff||!s.done||s.warm||s.drop||!(+s.r>0)||s.w==null||!rest||d.past||d.editingId||d.deload||d.light||b.light||ex.timed||ex.assist||noE1(ex)||exInjury(ex)||!(+p.repMin>0)||!(incOf(ex,p,s.w)>0)||bwNoLoad(ex,b);
  if(!off){
    /* A blank effort is read as the lift's usual effort, as everywhere else
       (r34.2: a blank set was read as failure here only, and dropped further). */
    const tgt=+p.rir||0,lo=+p.repMin,hi=+p.repMax,r=+s.r;const q=s.rir==null||s.rir===''?null:+s.rir;const qe=q!=null?q:rirEst(s,ex);
    const bw=bwRefLoad(ex),Lt=s.w+bw;
    const expR=b.tgt&&b.tgt.kind==='load'&&+b.tgt.repMin>0?+b.tgt.repMin:(lastRFor(b,si)!=null?+lastRFor(b,si):lo);
    const light=(q!=null&&q>=tgt+2&&r>=lo)||r>=hi+2,heavy=r<=Math.min(lo,expR)-2&&(q==null||q<=tgt);
    if(Lt>0&&(light||heavy)){
      const est=fitE(Lt,r,qe==null?0:Math.min(qe,E1_MAX_RIR));
      if(est){
        let nw=null;
        if(light){const want=Math.min(e1inv(est,Math.round((lo+hi)/2)+Math.min(tgt,E1_MAX_RIR)+1),Lt*jumpCap(ex,Lt,false))-bw;const cap=capOf(ex,p,s.w);nw=heavierLoad(ex,p,s.w,cap!=null?Math.min(want,cap):want);
          /* Rated 5 or more in reserve, the top of the scale, the estimate is
             only a floor, so one real step is always right even where it is
             more than the cap allows (r34.2, from the review: 20 lb curls at
             5+ in reserve never moved, a 5 lb step being 25% of the load). */
          if(nw==null&&q!=null&&q>=5){const one=s.w+incOf(ex,p,s.w);nw=heavierLoad(ex,p,s.w,cap!=null?Math.min(one,cap):one);}}
        else{const want=e1inv(est,lo+Math.min(tgt,E1_MAX_RIR)+1)-bw;const w=lighterLoad(ex,p,s.w,Math.max(0,want));nw=w<s.w-1e-6?w:null;if(nw!=null&&ex.bw&&nw<0)nw=0;}
        if(nw!=null){
          const f=rtfAt(est,nw+bw);const er=f==null?lo:Math.max(lo,Math.min(hi,Math.floor(f-Math.min(tgt,E1_MAX_RIR)-1+1e-9)));
          const n=b.sets.slice(0,si+1).filter(x=>!x.warm&&!x.drop).length;
          const why=light?(q!=null&&q>=tgt+2?(rirScale()==='rpe'?`set ${n} was RPE ${effShow(q)}, against a target of RPE ${effShow(tgt)}`:`set ${n} had ${effShow(q)} in reserve, against a target of ${effShow(tgt)}`):`set ${n} went ${r} reps, past your ${hi}`):`set ${n} stopped at ${r}, under your ${rangeWords(p)}`;
          b.adj={at:si,w:nw,from:s.w,r:er,up:!!light,why};adjSrc.set(b,s);
        }else if(light&&q!=null&&q>=tgt+2&&r<hi){
          /* No heavier load fits (the next step is more than the estimate
             allows): the same load for more reps, so a set this easy is not
             met with silence (r35, V). Reps the estimate gives at the target
             effort, up to the top of the range. */
          const f=rtfAt(est,Lt);const er=f==null?null:Math.min(hi,Math.floor(f-Math.min(tgt,E1_MAX_RIR)+1e-9));
          const n=b.sets.slice(0,si+1).filter(x=>!x.warm&&!x.drop).length;
          if(er!=null&&er>r){b.adj={at:si,w:s.w,from:s.w,r:er,up:true,why:rirScale()==='rpe'?`set ${n} was RPE ${effShow(q)}, against a target of RPE ${effShow(tgt)}`:`set ${n} had ${effShow(q)} in reserve, against a target of ${effShow(tgt)}`};adjSrc.set(b,s);}
        }
      }
    }
  }
  adjRows(b,prev,b.adj||null);
  return JSON.stringify(b.adj||null)!==had;
}
/* With "Fill in suggested loads" on, the rows hold the app's numbers rather
   than grey ones: those still on the old load (not done, not typed) take the
   new one, and go back when the adjustment is undone, Kept, or replaced. */
function adjRows(b,prev,next){
  const rows=(at,f)=>b.sets.forEach((x,i)=>{if(i>at&&!x.done&&!x.warm&&!x.drop&&x.w!=null)f(x);});
  if(prev&&(!next||next.at!==prev.at||next.w!==prev.w))rows(prev.at,x=>{if(Math.abs(x.w-prev.w)<1e-9)x.w=prev.from;});
  if(next)rows(next.at,x=>{if(Math.abs(x.w-next.from)<1e-9&&(x.w===b.sw||carried.has(x)))x.w=next.w;});
}
// Effort as the lifter reads it: RIR, or RPE when effort is entered as RPE.
function adjLine(b,bi){
  const a=b.adj;if(!a||!b.sets.some((x,i)=>i>a.at&&!x.done&&!x.warm&&!x.drop))return '';const ex=EX(b.exId);
  const lb=w=>`${loadLabel(ex,w)}${ex.bw?'':' '+U()}${loadNote(ex)}`;
  // Same load, more reps: said as reps (r35).
  if(Math.abs(a.w-a.from)<1e-9)return `<p class="adjline small" id="adj-${bi}"><span><b>Next sets: ${a.r} reps at ${esc(lb(a.w))}</b>, because ${esc(a.why)}.</span><button class="linkbtn" data-act="adjKeep" data-b="${bi}">Keep as it was</button></p>`;
  return `<p class="adjline small" id="adj-${bi}"><span><b>Next sets: ${esc(lb(a.w))}</b>, ${a.up?'up':'down'} because ${esc(a.why)}.</span><button class="linkbtn" data-act="adjKeep" data-b="${bi}">Keep ${esc(lb(a.from))}</button></p>`;
}
// After a set is ticked, unticked or changed: re-judge it, and redraw only this exercise's grey numbers and line.
function afterSet(bi,si){
  const changed=assessSet(bi,si);const b=state.draft.ex[bi];
  // The line goes once no set is left for it, even when nothing else changed (r34.2).
  if(!changed){const old=document.getElementById('adj-'+bi);if(old&&!adjLine(b,bi))old.remove();return;}
  const ex=EX(b.exId);
  b.sets.forEach((x,i)=>{if(i>si&&!x.done&&x.w!=null){const el=document.querySelector(`.sg input[data-f="w"][data-b="${bi}"][data-s="${i}"]`);if(el&&document.activeElement!==el)el.value=loadIn(ex,x.w);}});
  refreshGreyW(bi);refreshGrey(bi);
  const old=document.getElementById('adj-'+bi);const html=adjLine(b,bi);
  if(old){if(html)old.outerHTML=html;else old.remove();}
  else if(html){const last=[...document.querySelectorAll(`#blk-${bi} .sg`)].pop();if(last)last.insertAdjacentHTML('afterend',html);}
}
/* A set being ticked takes its grey load, so a saved set never has an empty
   load that would be stored as 0. */
function settleLoad(b,si){
  const s=b&&b.sets[si];if(!s||s.w!=null)return;const g=greyW(b,si);if(g==null)return;
  s.w=g;const bi=state.draft?state.draft.ex.indexOf(b):-1;
  const el=bi>=0?document.querySelector(`.sg input[data-f="w"][data-b="${bi}"][data-s="${si}"]`):null;if(el)el.value=loadIn(EX(b.exId),g);
}
/* A typed load changes the grey loads of the empty rows under it. */
function refreshGreyW(bi){
  const b=state.draft&&state.draft.ex[bi];if(!b)return;const ex=EX(b.exId);
  b.sets.forEach((x,si)=>{if(x.w!=null)return;const el=document.querySelector(`.sg input[data-f="w"][data-b="${bi}"][data-s="${si}"]`);if(!el)return;const g=greyW(b,si);const v=g==null?(ex.bw?'0':''):String(loadIn(ex,g));if(el.placeholder!==v)el.placeholder=v;});
}
// Keyed by session too, so a block opened in one session is not open in the next.
const blkKey=(bi,b)=>((state.draft&&state.draft.id)||'')+':'+bi+':'+b.exId;
/* An exercise opened again after it folded stays open when exercises around
   it move (r25): the block itself is remembered as well as its place. */
const blkOpenObj=new WeakSet();
const blkIsOpen=(bi,b)=>ui.blkOpen.has(blkKey(bi,b))||blkOpenObj.has(b);
// Runs a change to the session's exercise order and carries each block's open state to its new place.
function keepOpen(fn){
  const d=state.draft;if(!d)return fn();const was=new Set(d.ex.filter((b,i)=>blkIsOpen(i,b)));const r=fn();
  const dd=state.draft;if(dd)dd.ex.forEach((b,i)=>{const k=blkKey(i,b);if(was.has(b)){ui.blkOpen.add(k);blkOpenObj.add(b);}else ui.blkOpen.delete(k);});
  return r;
}
function updateSessBar(){const d=state.draft;
  // Minutes left follow each tick, not just the next redraw (r34.2: "about 75 min left" with every set done).
  const lf=document.getElementById('sessLeft');if(d&&lf){const left=leftMin(d);lf.textContent=left>0?`, ${estMin(left)} left`:'';}
  const el=document.getElementById('sessBar');if(!d||!el)return;const p=sessProgress(d);el.style.width=p.pct+'%';const t=document.getElementById('sessOf');if(t)t.textContent=`${p.k} of ${p.n}`;}
let foldT=null;
// True while an exercise is being dragged in a session (r29): renders and
// automatic folds wait, so the drag is not torn out from under the finger.
let blockDrag=false;
/* Pointing at an exercise in the session over time (r46). Neither handle on
   its own survives: a place changes whenever exercises move, and the object
   is replaced by normalize, which runs on every sync, Undo, cross-tab write
   and restore. The id made with the exercise survives both, so it leads, with
   the object and then the place behind it for a session started on a build
   before this one, which has no id. */
function blkRef(bi){const d=state.draft;const b=d&&d.ex[bi];return b?{bid:b.bid||null,b,i:bi}:null;}
function blkIdx(r){
  const d=state.draft;if(!d||!r||!r.b)return -1;
  if(r.bid)return d.ex.findIndex(x=>x.bid===r.bid);
  const j=d.ex.indexOf(r.b);if(j>=0)return j;
  const k=d.ex[r.i];return k&&k.exId===r.b.exId?r.i:-1;
}
function autoFold(ref){
  foldT=null;if(blockDrag)return;const d=state.draft;
  if(!d||d.editingId||ui.modal||ui.tab!=='today')return;
  const bi=blkIdx(ref);const b=bi<0?null:d.ex[bi];
  if(!b||!blockDone(b)||blkIsOpen(bi,b))return;
  // Any open effort strip waits the fold, not only this exercise's (r34.2: the rebuild closed a strip just opened on the next one).
  if(document.querySelector('.rirstrip')){foldT=setTimeout(()=>autoFold(ref),1500);return;}
  let nx=d.ex.findIndex((x,i)=>i>bi&&!blockDone(x));if(nx<0)nx=d.ex.findIndex(x=>!blockDone(x));
  const a0=nx>=0?document.getElementById('blk-'+nx):null;const top0=a0?a0.getBoundingClientRect().top:null;
  rerenderKeepScroll();
  const a1=nx>=0?document.getElementById('blk-'+nx):null;
  if(a1&&top0!=null){window.scrollBy(0,a1.getBoundingClientRect().top-top0);
    // Then bring the next exercise up, unless the thumb is already in it.
    const ae=document.activeElement;if(!(ae&&a1.contains(ae)))try{a1.scrollIntoView({block:'start',behavior:'smooth'});}catch(e){/* scroll is best effort */}}
}
function updateProgress(bi){const el=document.getElementById('tp-'+bi);if(!el||!state.draft||!state.draft.ex[bi])return;const p=blockProgress(state.draft.ex[bi]);if(!p)return;el.textContent=p.text;el.classList.toggle('beat',p.beat);}

