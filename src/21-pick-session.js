/* ---------- PICK FOR ME ----------
   Two questions, one set of rules. Before a session: which of your routine's
   days fits today. Inside one: which exercise to add next. Both read the same
   numbers the rest of the app shows, and every pick says why.
   - Need: hard sets each muscle got in the last 7 days against the bottom of
     its weekly band. A rolling week, so a Monday is not told everything is
     behind.
   - Recovery: days since the muscle last got a real dose (2+ hard sets)
     against what that dose usually needs: about 1 day after under 4 sets, 2
     after 4 to 7, 3 after 8 or more. Muscle damage and strength loss after
     hard, high-volume work mostly resolve within 48 to 72 hours.
   - Past about 10 sets for one muscle in one workout, extra sets add little
     (the same cap the Plan tab flags).
   - Injured muscles are avoided; priority and lagging muscles count more;
     your cycle order and lifts you already know and progress on get a nudge.
   None of this is a fixed rule of physiology: it is a transparent ranking. */
function rolling7(m,extra,at){
  const dm=IDX().dayMus;const t=at||today();let v=0;
  for(let k=0;k<PICK_DAYS;k++){const x=dm[addDays(t,-k)];if(x&&x[m])v+=x[m];}
  return v+(extra&&extra[m]||0);
}
/* Days a muscle needs after a dose: 1 under 4 hard sets, 2 for 4 to 7, 3 for
   8 or more; plus 1 if 2+ sets went to failure or a lift was new to you, plus
   half a day after heavy hinges, Nordics or walking lunges, minus 1 (never
   under 1) if every set stopped at 3+ RIR. Performance after non-failure work
   is mostly back within 24 h, after failure work 24 to 48 h or more
   (Moran-Navarro 2017, Pareja-Blanco 2020). These tiers are a rule of thumb
   built on that, used only to rank, never to block. */
/* Every qualifying day in the window is checked, not just the latest: 2 easy
   sets yesterday must not hide 12 sets to failure the day before. r and need
   come from whichever dose leaves the muscle least recovered; days and sets
   describe the most recent one, which is what "last trained" reports. */
function recovery(m,at){
  const I=IDX();const dm=I.dayMus;const t=at||today();
  let recent=null,worst=null;
  for(let k=0;k<=21;k++){const d=addDays(t,-k);const v=dm[d]&&dm[d][m];if(v>=2){
    const o=(I.dayMeta[d]||{})[m]||{};let need=v>=8?3:v>=4?2:1;
    if((o.fail||0)>=2||o.novel)need+=1;if(o.slow)need+=0.5;if(o.hard>0&&o.easy===o.hard)need=Math.max(1,need-1);
    const x={r:Math.min(1,k/need),days:k,sets:v,need};
    if(!recent)recent=x;
    if(!worst||x.r<worst.r)worst=x;
    // Nothing older can need more than 3.5 days, so stop once past that.
    if(k>4)break;}}
  if(!recent)return {r:1,days:null,sets:0,need:0};
  return {r:worst.r,days:recent.days,sets:recent.sets,need:worst.need};
}
function lastHitTxt(m){const rc=recovery(m);return rc.days==null?'not trained hard in 3 weeks':`last hard ${agoTxt(rc.days)}`;}
/* Hard sets per muscle a routine day plans, direct only (for the headline
   muscles) and direct plus half for secondaries (for the scoring). */
function dayDirect(day){const out={};for(const it of day.items){const ex=EX(it.exId);out[ex.primary]=(out[ex.primary]||0)+(+it.sets||0);}return out;}
function rankDays(){
  const R=activeRoutine();const t=today();const I=IDX();const bands=state.settings.bands;const inj=injuredSet();
  const pri=new Set(state.settings.priorities);const lag=new Set(I.scores.filter(x=>x.label==='lagging').map(x=>x.m));
  const deload=isDeloadWeek();const f=deload?LIGHTER_SET_SHARE:1;
  const weekly=R.schedule==='weekly';const cs=weekly?null:cycleState(R);
  const planIdx=weekly?(new Date().getDay()+6)%7:cs.next;
  const lastDone={};for(const x of state.sessions)if(x.routineId===R.id&&x.dayId&&(!lastDone[x.dayId]||x.date>lastDone[x.dayId]))lastDone[x.dayId]=x.date;
  const r7={};for(const m of MK)r7[m]=rolling7(m);
  const rows=[];
  R.days.forEach((day,i)=>{
    if(day.rest||!day.items.length)return;
    const ms=sessionMuscleSets(day);const dir=dayDirect(day);
    let fill=0,fat=0,over=0,injS=0,wR=0,wT=0;
    for(const [m,w0] of Object.entries(ms)){
      const w=w0*f;const rc=recovery(m);
      if(inj.has(m)){injS+=w;continue;}
      const def=!hasTarget(m)?0:Math.max(0,bands[m][0]-r7[m]);fill+=Math.min(w,def)*(pri.has(m)||lag.has(m)?1.5:1);
      fat+=w*(1-rc.r);if(hasTarget(m))over+=Math.max(0,r7[m]+w-bands[m][1]);
    }
    for(const [m,w] of Object.entries(dir)){if(inj.has(m))continue;wR+=w*recovery(m).r;wT+=w;}
    /* A flagged joint counts like a flagged muscle (r30): each set of an
       exercise that loads it weighs against the day. */
    const jHit=JK.some(j=>inj.has(j))?day.items.filter(it=>{const j=exInjury(EX(it.exId));return j&&JL[j];}):[];
    for(const it of jHit)injS+=(+it.sets||0)*f;
    const since=lastDone[day.id]?daysBetween(lastDone[day.id],t):null;
    const score=fill-1.5*fat-injS-0.3*over+(i===planIdx?3:0)+Math.min(since==null?14:since,14)*0.15;
    rows.push({i,day,score,fill,fat,injS,since,plan:i===planIdx,ready:wT?wR/wT:1,dir,joints:[...new Set(jHit.map(it=>exInjury(EX(it.exId))))]});
  });
  rows.sort((a,b)=>b.score-a.score||(b.plan-a.plan)||a.i-b.i);
  return {R,rows,planIdx,r7,deload};
}
function dayReasons(x,r7){
  const bands=state.settings.bands;const inj=injuredSet();const out=[];
  const main=Object.entries(x.dir).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([m])=>m);
  if(x.plan)out.push(activeRoutine().schedule==='weekly'?'Planned for today.':'Next in your cycle.');
  if(x.joints&&x.joints.length)out.push(`Loads your ${andList(x.joints.map(j=>JL[j].toLowerCase()))}, which you flagged.`);
  for(const m of main){
    if(inj.has(m)){out.push(`Loads ${ML[m]}, which you flagged as injured.`);continue;}
    const rc=recovery(m);const [lo,hi]=bands[m];
    const tired=rc.r<1?` Likely still recovering (about ${rc.need} day${rc.need===1?'':'s'}).`:'';
    out.push(`${ML[m]}: ${r1(r7[m])} of ${lo}-${hi} hard sets in 7 days, ${lastHitTxt(m)}.${tired}`);
  }
  if(x.since!=null&&x.since>=8)out.push(`Last done ${x.since} days ago.`);
  else if(x.since==null)out.push('Not logged yet.');
  return out;
}
/* In-session: every exercise not already in the session, scored for this
   moment. The best one per muscle is kept, then the top three muscles. */
function sessionMuscles(d){
  const out={};
  for(const b of d.ex){const ex=EX(b.exId);const n=b.sets.filter(x=>!x.warm&&(x.done?isHard(x,ex):true)).reduce((a,x)=>a+setCredit(x),0);if(!n)continue;
    out[ex.primary]=(out[ex.primary]||0)+n;for(const m of ex.secondary)out[m]=(out[m]||0)+0.5*n;}
  return out;
}
function rankExercises(d){
  const I=IDX();const bands=state.settings.bands;
  // Focus muscles in the profile (r44) count as priorities here.
  const pri=new Set([...state.settings.priorities,...(prof().focus||[])]);const lag=new Set(I.scores.filter(x=>x.label==='lagging').map(x=>x.m));
  const sess=sessionMuscles(d);const inS=new Set(d.ex.map(b=>b.exId));
  const inR=new Set();for(const dd of activeRoutine().days)for(const it of dd.items)inR.add(it.exId);
  const doneEx=d.ex.map(b=>EX(b.exId));
  // Anchored on the session's own date, so logging a past day reads that week.
  const at=d.date||today();
  const r7={};for(const m of MK)r7[m]=rolling7(m,sess,at);
  const rec={};for(const m of MK)rec[m]=recovery(m,at);
  const best={};
  for(const e of state.exercises){
    if(e.archived||inS.has(e.id)||exInjury(e))continue;
    const m=e.primary;const [lo,hi]=bands[m];const def=!hasTarget(m)?0:Math.max(0,lo-r7[m]);const inSess=sess[m]||0;
    let s=Math.min(def,6)*0.6;
    // At target already: optional, and better where the week has room left.
    // Tracked-only muscles have no target, so no "already at target" penalty either (r29).
    if(def<=0&&hasTarget(m))s-=r7[m]>=hi?3:1-Math.min(hi-r7[m],4)*0.15;
    if(inSess>=SESSION_CAP)s-=6;else if(inSess>=7)s-=1.5;
    // The session itself is not fatigue to recover from; earlier days are.
    s-=(1-rec[m].r)*3;
    if(inSess>0&&inSess<6&&def>0)s+=1;
    // A second exercise for a muscle should come at it differently.
    const same=doneEx.filter(x=>x.primary===m);const pe=patternOf(e);
    if(same.length)s+=same.some(x=>(pe&&patternOf(x)===pe)||x.equip===e.equip)?-0.8:0.3;
    // Helper muscles count a little, capped, so a lift is not picked just for
    // touching many muscles; tired or maxed helpers still count against it.
    {let sb=0;for(const m2 of e.secondary){const d2=!hasTarget(m2)?0:Math.max(0,bands[m2][0]-r7[m2]);sb+=Math.min(d2,3)*0.15;s-=(1-rec[m2].r)*0.5;if((sess[m2]||0)>=SESSION_CAP)s-=0.5;}s+=Math.min(sb,0.6);}
    const st=I.exStats[e.id];const n=(I.byEx[e.id]||[]).length;
    if(n){s+=0.8;if(st&&st.moving&&!st.stalled)s+=0.4;if(st&&st.stalled)s-=0.8;}else{if(e.rare)s-=0.4;if(!inR.has(e.id))s-=0.3;}
    if(inR.has(e.id))s+=0.5;
    if(LONG_IDS.has(e.id))s+=0.4;
    if(pri.has(m)||lag.has(m))s+=def>0?1.2:0.3;
    // Strength focus (r44, item 44): stalled lifts lose 0.8 above, so they net +0.8; near-best ones gain 1.2.
    const sp=strengthPick(e,st,rec[m],at);if(sp)s+=sp==='stalled'?1.6:1.2;
    if(!best[m]||s>best[m].s||(s===best[m].s&&e.name<best[m].e.name))best[m]={e,s,m,def,inSess,st,n,rec:rec[m],r7:r7[m],sp};
  }
  return Object.values(best).sort((a,b)=>b.s-a.s).slice(0,3).map(x=>{
    const plan=planFor(x.e.id,null,d.dayId,false,d.date);const cap=Math.max(1,SESSION_CAP-x.inSess);
    let sets=Math.max(1,Math.min(cap,x.def>0?Math.min(+plan.sets||3,Math.max(2,Math.ceil(x.def))):2));
    // A deload or lighter session halves its sets; what Pick for me adds to it does too (r27). full: the count before, for Finish's offer to the routine (r54).
    const full=sets;if(d.deload||d.light)sets=Math.max(1,Math.ceil(sets/2));
    return {...x,plan:{...plan,sets},full};
  });
}
function exReasons(x){
  const [lo,hi]=state.settings.bands[x.m];const out=[];
  out.push(!hasTarget(x.m)?`${ML[x.m]}: ${r1(x.r7)} hard sets in the last 7 days, counting this session (tracked only, no target).`:`${ML[x.m]}: ${r1(x.r7)} of ${lo}-${hi} hard sets in the last 7 days, counting this session${x.def>0?`, ${r1(x.def)} short of target`:', at or above target'}.`);
  out.push(x.rec.days==null?'Not trained hard in the last 3 weeks.':x.rec.r<1?`Last trained hard ${agoTxt(x.rec.days)} (${r1(x.rec.sets)} sets), so it may still be recovering.`:`Last trained hard ${agoTxt(x.rec.days)}, recovered.`);
  if(x.inSess>0)out.push(`${r1(x.inSess)} set${r1(x.inSess)===1?'':'s'} for it already in this session${x.inSess>=SESSION_CAP?`, past the ${SESSION_CAP}-set line for one workout`:''}.`);
  if(x.n){const p=x.st&&x.st.pct!=null?`, ${x.st.pct>=0?'+':''}${r1(x.st.pct)}% over ${x.st.spanW||6} weeks`:'';out.push(`You have logged it ${x.n} time${x.n===1?'':'s'}${p}${x.st&&x.st.stalled?', stalled lately':''}.`);}
  else out.push('New to you: the first session sets its baseline.');
  if(LONG_IDS.has(x.e.id))out.push(LONG_TRIAL.has(x.e.id)?'Trains a two-joint muscle at a long length, which beat the shorter-length version in trials.':'Puts a two-joint muscle at a long length (a mechanical case, not trial-tested).');
  if(state.settings.priorities.includes(x.m))out.push('One of your priority muscles.');
  else if((prof().focus||[]).includes(x.m))out.push('One of your focus muscles.');
  if(x.sp)out.push(x.sp==='stalled'?`Strength focus: stalled lately, and ${STR_REST} days or more since you did it.`:`Strength focus: within 3% of your best, and ${STR_REST} days or more since you did it.`);
  return out;
}
/* Closest same-muscle replacements, used by Swap and Limited equipment.
   Same main muscle and same kind of set (timed or reps) are required; then
   shared helper muscles, lifts you already log, and like-for-like setup. */
// Done before at the rep range asked for, or close: then it is not too hard for this lifter.
function canDo(e,repMin){const xs=IDX().byEx[e.id]||[];return xs.some(x=>x.pts.some(p=>p.r>=Math.max(1,(+repMin||1)-2)));}
function swapScore(o,e,repMin){
  const I=IDX();let s=e.secondary.filter(x=>o.secondary.includes(x)).length;
  // A much harder bodyweight lift never wins over an easier match unless you already do it.
  if(HARD_EX.has(e.id)&&!HARD_EX.has(o.id)&&!canDo(e,repMin))s-=4;
  const po=patternOf(o);if(po&&po===patternOf(e))s+=1.5;
  const n=(I.byEx[e.id]||[]).length;if(n)s+=1+Math.min(n,6)*0.1;
  if(!!e.bw===!!o.bw)s+=0.5;if(!!e.perSide===!!o.perSide)s+=0.3;if(!e.rare)s+=0.3;if(e.equip===o.equip)s+=0.4;
  const st=I.exStats[e.id];if(st&&st.stalled)s-=0.5;if(exInjury(e))s-=5;
  return s;
}
function swapCands(origId,equip,exclude,repMin){
  const o=EX(origId);
  return state.exercises.filter(e=>!e.archived&&e.id!==origId&&e.primary===o.primary&&!!e.timed===!!o.timed&&(!equip||equip.has(e.equip))&&!(exclude&&exclude.has(e.id)))
    .map(e=>({e,s:swapScore(o,e,repMin)})).sort((a,b)=>b.s-a.s||a.e.name.localeCompare(b.e.name));
}
/* Limited equipment: the day's plan with each exercise whose equipment is off
   swapped for its closest match that is on, or left out when none is. */
function eqPlan(day,equip){
  const keep=new Set(day.items.filter(it=>equip.has(EX(it.exId).equip)).map(it=>it.exId));const used=new Set(keep);const out=[];
  for(const it of day.items){
    const ex=EX(it.exId);
    if(equip.has(ex.equip)){out.push({it,to:it.exId,from:null});continue;}
    const c=swapCands(it.exId,equip,used,it.repMin)[0];
    if(c){used.add(c.e.id);out.push({it,to:c.e.id,from:it.exId,hard:HARD_EX.has(c.e.id)&&!HARD_EX.has(it.exId)&&!canDo(c.e,it.repMin)});}else out.push({it,to:null,from:it.exId});
  }
  return out;
}
/* Exercises you logged most recently, newest first. */
function recentExIds(n){const out=[];const seen=new Set();const ss=sortedSessions();for(let i=ss.length-1;i>=0&&out.length<n;i--)for(const b of ss[i].ex)if(!seen.has(b.exId)){seen.add(b.exId);const e=EX(b.exId);if(!e.archived&&state.exercises.some(x=>x.id===b.exId))out.push(b.exId);if(out.length>=n)break;}return out;}
function pickerUsed(m){
  if(m.mode==='addBlock'||m.mode==='swapBlock')return {set:new Set(state.draft?state.draft.ex.map(b=>b.exId):[]),label:'In session'};
  if(m.mode==='addDay'){const R=curRoutineB();const d=R.days[m.day];return {set:new Set(d?d.items.map(i=>i.exId):[]),label:'In this day'};}
  if(m.mode==='swapItem'){const f=findItem(m.uid);return {set:new Set(f?f.r.days[f.di].items.map(i=>i.exId):[]),label:'In this day'};}
  return {set:new Set(),label:''};
}
function pickRow(e,used,grouped){
  return `<button class="pick" data-act="pickDo" data-ex="${e.id}"><span style="min-width:0"><b>${esc(e.name)}</b><br><span class="small muted">${esc(ML[e.primary])}, ${esc(EQL[e.equip]||e.equip)}</span></span><span class="tags">${used.set.has(e.id)?`<span class="tag blue">${used.label}</span>`:''}${grouped?(e.rare?'<span class="tag rare">Less common</span>':''):exTags(e)}</span></button>`;
}
function pickerBody(m){
  const used=pickerUsed(m);const row=e=>pickRow(e,used);const grp=t=>`<p class="pick-grp">${esc(t)}</p>`;
  const q=(m.q||'').trim();let h='';
  const swapId=m.mode==='swapBlock'&&state.draft&&state.draft.ex[m.b]?state.draft.ex[m.b].exId:m.mode==='swapItem'?((findItem(m.uid)||{}).it||{}).exId:null;
  if(q||m.m){
    const list=commonFirst(libFiltered(m.q,m.m,'',false));
    if(!q&&swapId&&m.m===EX(swapId).primary){
      const best=swapCands(swapId,null,used.set).slice(0,3).map(x=>x.e);
      if(best.length)h+=grp('Closest matches')+best.map(row).join('')+grp(`All ${ML[m.m]}`);
    }
    h+=list.length?list.map(row).join(''):'<p class="muted">No matches.</p>';
    if(q&&!list.some(e=>e.name.trim().toLowerCase()===q.toLowerCase()))h+=`<button class="pick new" data-act="exNewFromPicker"><span><b>+ Create “${esc(q)}”</b><br><span class="small muted">A new exercise with this name${m.mode==='addBlock'?', added to this session':m.mode==='addDay'?', added to this day':''}</span></span></button>`;
    return h;
  }
  const all=libFiltered('','','',false);
  if(m.mode==='addBlock'&&state.draft&&state.draft.dayId){
    const R=state.routines.find(r=>r.id===state.draft.routineId);const day=R&&R.days.find(x=>x.id===state.draft.dayId);
    const left=day?day.items.map(i=>EX(i.exId)).filter(e=>!e.archived&&!used.set.has(e.id)):[];
    if(left.length)h+=grp("From today's plan")+left.map(row).join('');
  }
  const rec=recentExIds(8).map(EX);
  if(rec.length)h+=grp('Recent')+rec.map(row).join('');
  const com=all.filter(isCommon),rest=all.filter(e=>!isCommon(e));
  // Under the Most common heading the tag on every row would only repeat it.
  const rowG=e=>pickRow(e,used,true);
  return h+(com.length?grp(`Most common (${com.length})`)+com.map(rowG).join(''):'')+grp(com.length?`All other exercises (${rest.length})`:`All exercises (${all.length})`)+rest.map(row).join('');
}
function liftTrend(exId){
  /* The sessions the trend reads (r30: a deload or lighter day in the list
     read as a drop; since r54 one short of its usual is in). The word
     follows the numbers shown: within 1% is flat, so "301 → 300.7 · up"
     cannot happen. Isolation lifts show their top sets, not a 1RM. */
  const ex=EX(exId);const st=IDX().exStats[exId];
  const exps=liftRead(exId).filter(x=>x.tv!=null&&!lighter(x)&&(!st||sameRR(x.rr,st.rr))).slice(-3); // in the trend's range, so a heavy and a light day are not read as one line (r55), and since a new machine or gym (liftRead, r61)
  if(exps.length<2)return '';
  /* The word follows the lift's trend when it has one (r32, from the third
     review: a press flat for 7 weeks read "67.5 → 69.7 → 69.7 · up" from its
     last three sessions). */
  // With no trend yet (under 3 sessions over 2 weeks), no word at all (r32, second check: "· up" from three sessions in a week).
  /* The word covers the trend's weeks, not just the three numbers shown (r34.2: "252 → 249 → 252 · up"), and says nothing for a lift weeks off. */
  const ow=st&&st.spanW?` over ${st.spanW} weeks${st.rrIn?` in the ${repSpan(st.rrIn[0],st.rrIn[1])} range`:''}`:'';
  const dir=st&&st.fresh&&st.pct!=null?(st.moving?`up${ow}`:st.falling?`down${ow}`:st.holdRR&&(st.holdRR.length||st.quietRR.length)?`down${ow}`:st.pLo!=null&&st.pLo>0?`slowly up${ow}`:st.pHi!=null&&st.pHi<0?`slowly down${ow}`:`no clear change over ${st.spanW||2} weeks`):'';
  if(isCompound(ex)&&exps.every(x=>x.best!=null)){
    const v=exps.map(x=>fmtE(x.best));const d2=dir;
    return `<p class="small muted" style="margin:2px 0">Est. 1RM <span class="trend">${v.join(' → ')} ${U()}</span>${d2?' · '+d2:''}${st&&!st.useAdj?' '+tipi('Read from loads and reps alone: RIR is rated on too few of its sets to compare sessions fairly.','About this trend'):''}</p>`;
  }
  return `<p class="small muted" style="margin:2px 0">Top sets <span class="trend">${exps.map(x=>topSetOf(ex,x)).join(' → ')}</span>${dir?' · '+dir:''}</p>`;
}
function topSetOf(ex,x){return topSetPt(ex,x).txt;}
/* A muscle's weekly target with a profile (defBand) and the app's own
   target (appBand) are in src/app/profile.ts since r54, beside the floors a
   first-run pick records (fitFloors) and their refit (refit). */
function strengthPick(e,st,rec,at){
  if(prof().goal!=='strength'||!profHeavy(e)||!st||!st.last||rec.r<1)return null;
  if(!(daysOff(e.id,{before:at})>=STR_REST))return null;
  const near=st.bestAll>0&&st.last.best>=st.bestAll*STR_NEAR;
  return st.stalled?'stalled':near?'near':null;
}
