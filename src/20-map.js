/* ---------- LIVE PR ----------
   The muscle map, flat and 3D, is drawn by src/app/map.ts since r59. What
   stays here is the session's: a set's PR as it is logged, the check-in,
   and Short on time (r60 moves them with the session screen). */
/* A set is a PR live if its estimate beats your best, or no earlier set matched
   it on both load and reps: the same two tests the PR list uses. Only sets
   logged up to the session's date count, so a past session entered late is
   judged against what came before it, at its load as the list judges it (prFrame, r54: changing units or gyms is not a PR). */
function livePR(exId,s,date){
  if(!s||s.warm||s.drop||!(+s.r>0))return null;
  const f=prFrame(exId,s,date);if(!f)return null;const {ex,exps,st,load}=f;const q0=rirEst(s,ex);const v=noE1(ex)?null:e1(load,+s.r,q0);
  /* Announced only when stronger than ever (r32, as the list's big): by the
     same score as the rep PR floor, against every earlier set. A lift with
     no estimate (timed, joint rotation) or no load known keeps every kind,
     a bodyweight lift before any weigh-in by its reps alone (r54). */
  const scq=(l,r,q)=>e1(l,r,q)||l*(1+r/30);let top=0,dom=false;
  for(const x of exps)for(const q of x.pts){if(q.pl>=load-1e-6&&q.r>=+s.r)dom=true;top=Math.max(top,scq(q.pl,q.r,q.rq));}
  const judge=!noE1(ex)&&!ex.timed&&load>0;const stronger=!judge||scq(load,+s.r,q0)>top+1e-9;
  // More weight than any earlier working set comes first (r29), as in the PR
  // list, and before the load check: an assisted set with no bodyweight
  // logged has no load to estimate from, but less help is still a PR.
  if(!ex.timed&&s.w!==''&&s.w!=null&&isNum(+s.w)&&f.w>f.heaviest+1e-6&&stronger)return 'Weight PR';
  if(!(load>0)&&!ex.timed&&!ex.bw)return null;
  // A new best is judged within the set's own band of reps to failure, and is a PR only when stronger than ever, as every PR is (r58, 343 6).
  if(v!=null&&st&&stronger){const bd=st.byBand&&st.byBand[rtfBand(rtfOf(+s.r,q0))];if(bd!=null&&v>bd+1e-6)return 'Best';}
  if(dom||!stronger)return null;
  // At 90% or more of the strongest set before it, as in the PR list (r30).
  if(!ex.timed&&scq(load,+s.r,q0)<top*REP_PR_SHARE-1e-9)return null;
  return ex.timed?'Time PR':'Rep PR';
}
function refreshPR(bi,si,announce){
  const d=state.draft;if(!d)return;const b=d.ex[bi];const s=b&&b.sets[si];if(!s)return;
  const btn=document.querySelector(`[data-act="sDone"][data-b="${bi}"][data-s="${si}"]`);const row=btn&&btn.closest('.sg');if(!row)return;
  const was=row.classList.contains('pr');let pr=s.done?livePR(b.exId,s,d.date):null;
  /* Not a PR when an earlier set in this session was as strong (r32, second
     check: 100 x 10, then 100 x 9 announced as a new best). On any day since
     r54, as the list counts it since r53 (PENDING 311 a). */
  if(pr){const ex=EX(b.exId);const scq=x=>{const l=prLoad(ex,x,d.date);return e1(l,+x.r,rirEst(x,ex))||l*(1+(+x.r)/30);};const me=scq(s);
    if(b.sets.some((x,i)=>i<si&&x.done&&!x.warm&&!x.drop&&+x.r>0&&scq(x)>=me-1e-9))pr=null;}
  row.classList.toggle('pr',!!pr);
  if(pr)row.setAttribute('data-pr',pr);else row.removeAttribute('data-pr');
  if(announce&&pr&&!was){
    toast(`${pr==='Best'?(isCompound(EX(b.exId))?'New best estimate':'PR'):pr}: ${exName(b.exId)}, ${setShort(EX(b.exId),+s.w||0,s.r)}${prBeat(b.exId,s,d.date,pr)}`,false,4200,'pr');
    /* The PR moment (item 28): a short gold pulse on the row, and a buzz where
       the phone allows it (Android; iPhones give web apps no vibration). */
    row.classList.remove('prflash');void row.offsetWidth;row.classList.add('prflash');
    try{if(navigator.vibrate)navigator.vibrate([30,50,30]);}catch(e){/* optional */}
  }
}
/* What a live PR beat, as a short tail for the toast: the old best estimate in
   the set's band, or the most reps done at this load or heavier, judged as livePR judges it and shown as logged, as the PR list shows it (r54). */
function prBeat(exId,s,date,pr){
  const f=prFrame(exId,s,date);if(!f)return '';const {ex,exps,st,load}=f;const q=rirEst(s,ex);const bd=st&&st.byBand&&st.byBand[rtfBand(rtfOf(+s.r,q))];const v=noE1(ex)?null:e1(load,+s.r,q),shown=noE1(ex)?null:e1(f.own,+s.r,q);
  /* The estimate a set beats is the best from sets of a similar number of
     reps (its band), so the toast names the band (r30): "new best estimate
     279" read as wrong beside an overall best of 301 from heavier sets. */
  const bandW=BAND_WORDS[rtfBand(rtfOf(+s.r,q))]||'';
  if(pr==='Best'){if(bd==null||v==null)return '';
    // The overall best before this set, so "was" never names a band's best that reads as lower than the bests board (r34.2).
    let all=null;for(const x of exps)if(x.pb!=null&&!(date&&x.date===date))all=all==null?x.pb:Math.max(all,x.pb);
    if(!isCompound(ex))return ` (your best for ${bandW})`;
    return all==null||shown>all+1e-6?` (estimated 1RM ${fmtE(shown)} ${U()}${all!=null?`; was ${fmtE(all)}`:''})`:` (your best for ${bandW}, ${fmtE(shown)} ${U()})`;}
  if(pr==='Weight PR'){const mw=f.heaviest;
    const was=ex.assist?`less help than ever`:`heaviest before ${ex.bw?loadLabel(ex,mw):fmtW(mw)+' '+U()}`;
    return ` (${was}${isCompound(ex)&&bd!=null&&v!=null&&v>bd+1e-6?`; best estimate for ${bandW} now ${fmtE(shown)}`:''})`;}
  let m=0;for(const x of exps)for(const p of x.pts)if(p.pl>=load-1e-6)m=Math.max(m,p.r);
  return m?` (was ${m} ${ex.timed?'s':'reps'})`:' (heaviest yet)';
}
/* ---------- CHECK-IN ----------
   The three taps at the start of a session; how they line up with the
   sessions is Stats' Readiness and performance (src/app/stats.ts). */
function checkinCard(d){
  const c=d.chk||{};
  const sum=CHK_Q.filter(([k])=>c[k]).map(([k,l,n])=>`${l.toLowerCase()} ${chkWord(n[c[k]-1])}`).join(', ');
  const low=CHK_Q.filter(([k])=>c[k]===1).length;
  return sec({sk:'logger:checkin',title:'Check-in',sub:sum?esc(sum):'optional',body:`${CHK_Q.map(([k,l,names])=>`<div class="ci-row"><span class="small">${l}</span><div class="seg" role="group" aria-label="${l}">${names.map((n,i)=>`<button class="chip ${c[k]===i+1?'on':''}" data-act="chk" data-k="${k}" data-v="${i+1}" aria-pressed="${c[k]===i+1}">${n}</button>`).join('')}</div></div>`).join('')}
  `})+readyCard(d,low);
}
/* What the check-in offers (r30). Answering it changed nothing, and the
   advice sat inside the check-in, which folds itself once all three are
   answered, so nobody saw it. It now sits below the check-in with the two
   changes that answer it. Two or more low answers: a lighter session is
   offered first; one: a note to keep a rep more in reserve. */
function readyCard(d,low){
  if(!low||d.light||d.deload||d.editingId||d.past)return '';
  const open=d.ex.some(b=>!b.light&&!b.sets.some(x=>!x.warm&&!rowBlank(b,x)));const left=remainMin(d);
  // Already made lighter: say so instead of offering it again.
  if(low>=2&&!open&&d.ex.some(b=>b.light))return `<p class="callout" style="margin:8px 0 0" id="readyCard">Made lighter: the exercises not started are half the sets at about 90% loads.</p>`;
  if(low<2)return `<p class="callout" style="margin:8px 0 0" id="readyCard">One low answer: keep the loads and leave a rep more in reserve than planned if it feels heavy.</p>`;
  return `<div class="callout yellow" style="margin:8px 0 0" id="readyCard"><p style="margin:0">Low readiness today. ${tipi('A lighter or shorter session fits a low day better than pushing. Make it lighter changes only the exercises not started: half the sets, about 90% loads, nothing to beat.')}</p><div class="row" style="margin-top:8px">${open?'<button class="btn sm" data-act="makeLight">Make it lighter</button>':''}${left>0?'<button class="btn sm" data-act="shortOpen">Short on time</button>':''}</div></div>`;
}
/* ---------- SHORT ON TIME ----------
   Minutes of lifting left in the session, counted like the plan estimate:
   40 seconds a set plus its rest (none inside a superset), and 3 minutes of
   setup for an exercise not started yet. */
/* Minutes left for the header: none once every set is done (min5 shows at least 1, so 0 left read "about 1 min left"). */
function leftMin(d){if(!d||d.editingId||d.free||d.past)return 0;const m=remainMin(d);return m>0?min5(m):0;}
function remainMin(d){
  // No rest is taken after the very last set, the same as the plan's estimate.
  let s=0,cN=0,lastRest=0;
  d.ex.forEach((b,bi)=>{const ex=EX(b.exId);const su=setupSecs(ex,cN);if(isCompound(ex))cN++;const n=b.sets.filter(x=>!x.done&&!x.warm).length;if(!n)return;const r=blockRest(d,bi);s+=n*(setSecs(ex,b.plan)+r)+(b.sets.some(x=>x.done)?0:su);lastRest=r;});
  return Math.round(Math.max(0,s-lastRest)*pace()/60);
}
/* The whole session's planned minutes as it stands, with every set it has
   now (r30): after Short on time the recap compared the time taken with the
   untrimmed routine day ("planned about 77" after trimming to 45). */
function draftPlanMin(d){
  if(!d||!d.ex.length)return 0;
  return dayMinutes({items:d.ex.map(b=>({...b.plan,exId:b.exId,sets:b.sets.filter(x=>!x.warm).length,rest:+b.plan.rest||0}))},false);
}
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
