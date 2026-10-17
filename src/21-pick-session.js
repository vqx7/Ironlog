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
  for(let k=0;k<7;k++){const x=dm[addDays(t,-k)];if(x&&x[m])v+=x[m];}
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
  const deload=isDeloadWeek();const f=deload?0.5:1;
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
      const def=TRACK_ONLY.has(m)?0:Math.max(0,bands[m][0]-r7[m]);fill+=Math.min(w,def)*(pri.has(m)||lag.has(m)?1.5:1);
      fat+=w*(1-rc.r);if(!TRACK_ONLY.has(m))over+=Math.max(0,r7[m]+w-bands[m][1]);
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
    const m=e.primary;const [lo,hi]=bands[m];const def=TRACK_ONLY.has(m)?0:Math.max(0,lo-r7[m]);const inSess=sess[m]||0;
    let s=Math.min(def,6)*0.6;
    // At target already: optional, and better where the week has room left.
    // Tracked-only muscles have no target, so no "already at target" penalty either (r29).
    if(def<=0&&!TRACK_ONLY.has(m))s-=r7[m]>=hi?3:1-Math.min(hi-r7[m],4)*0.15;
    if(inSess>=SESSION_CAP)s-=6;else if(inSess>=7)s-=1.5;
    // The session itself is not fatigue to recover from; earlier days are.
    s-=(1-rec[m].r)*3;
    if(inSess>0&&inSess<6&&def>0)s+=1;
    // A second exercise for a muscle should come at it differently.
    const same=doneEx.filter(x=>x.primary===m);const pe=patternOf(e);
    if(same.length)s+=same.some(x=>(pe&&patternOf(x)===pe)||x.equip===e.equip)?-0.8:0.3;
    // Helper muscles count a little, capped, so a lift is not picked just for
    // touching many muscles; tired or maxed helpers still count against it.
    {let sb=0;for(const m2 of e.secondary){const d2=TRACK_ONLY.has(m2)?0:Math.max(0,bands[m2][0]-r7[m2]);sb+=Math.min(d2,3)*0.15;s-=(1-rec[m2].r)*0.5;if((sess[m2]||0)>=SESSION_CAP)s-=0.5;}s+=Math.min(sb,0.6);}
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
    const plan=planFor(x.e.id,null,d.dayId);const cap=Math.max(1,SESSION_CAP-x.inSess);
    let sets=Math.max(1,Math.min(cap,x.def>0?Math.min(+plan.sets||3,Math.max(2,Math.ceil(x.def))):2));
    // A deload or lighter session halves its sets; what Pick for me adds to it does too (r27).
    if(d.deload||d.light)sets=Math.max(1,Math.ceil(sets/2));
    return {...x,plan:{...plan,sets}};
  });
}
function exReasons(x){
  const [lo,hi]=state.settings.bands[x.m];const out=[];
  out.push(TRACK_ONLY.has(x.m)?`${ML[x.m]}: ${r1(x.r7)} hard sets in the last 7 days, counting this session (tracked only, no target).`:`${ML[x.m]}: ${r1(x.r7)} of ${lo}-${hi} hard sets in the last 7 days, counting this session${x.def>0?`, ${r1(x.def)} short of target`:', at or above target'}.`);
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
/* Week at a glance, in the bar at the top of every tab. Each cell is a day of
   this calendar week: filled green when you lifted, a green outline for
   cardio only, dashed for a planned workout still ahead, dashed red for a
   fixed-weekday workout that was missed. A trained day opens that session in
   History; today or a day ahead opens Today on the workout planned for it.
   Numbered cycles are projected forward from where you are in the rotation,
   the same rule Today uses, so the week shows what is coming. */
/* The cycle day that falls on each date from today on. After a session the
   calendar walks the cycle one day per day, rest days included; a missed day
   waits (Today offers the next training day, whatever the date). */
function cycleProjection(R,days){
  const n=R.days.length;const t=today();const cs=cycleState(R);const out={};
  let idx,start;
  if(cs.lastDate===t){idx=(cs.last+1)%n;start=addDays(t,1);}
  else if(cs.restToday){idx=cs.restIdx;start=t;}
  else{idx=cs.next;start=t;}
  for(let k=0;k<(days||7);k++){out[addDays(start,k)]=idx;idx=(idx+1)%n;}
  return out;
}
/* What is planned on each date of this week: {di, day} or null. */
function weekPlan(R){
  const cur=weekStart(today());const out={};
  if(R.schedule==='weekly'){for(let i=0;i<7;i++)out[addDays(cur,i)]={di:i,day:R.days[i]};return out;}
  const pj=cycleProjection(R,8);
  for(let i=0;i<7;i++){const d=addDays(cur,i);if(d in pj)out[d]={di:pj[d],day:R.days[pj[d]]};}
  return out;
}
function weekBar(){
  const R=activeRoutine();const cur=weekStart(today()),t=today();const weekly=R.schedule==='weekly';
  const cByDate={};for(const c of state.cardio)(cByDate[c.date]=cByDate[c.date]||[]).push(c);
  const plan=weekPlan(R);let h='';
  // The + on empty past days appears once there is a log to add to; a brand-new week bar stays clean (the days still open the sheet).
  const hasLog=state.sessions.length>0;
  for(let i=0;i<7;i++){
    const d=addDays(cur,i),ss=sessionsOn(d),trained=ss.length>0,cd=cByDate[d]||[];
    const p=plan[d];const pd=p?p.day:null;const isPlan=!!pd&&!pd.rest&&pd.items.length>0;const isRest=!!pd&&pd.rest;
    // The session in progress sits on its own date, which for a past workout is not today.
    const live=!!state.draft&&!state.draft.editingId&&d===state.draft.date;
    const cls=['w',trained?'on':'',!trained&&cd.length?'cardio':'',!trained&&!cd.length&&isPlan&&d>=t?'plan':'',!trained&&weekly&&isPlan&&d<t?'miss':'',!trained&&!cd.length&&isRest&&d>=t?'rest':'',d===t?'today':'',live?'live':''].filter(Boolean).join(' ');
    const name=trained?ss[0].dayName+(ss.length>1?` +${ss.length-1}`:''):cd.length?'Cardio':p&&d>=t?(isRest?'Rest':pd.name):(weekly&&isPlan&&d<t?pd.name:'');
    const what=trained?`${ss.map(x=>x.dayName).join(', ')}, logged`:live?'session in progress':isPlan?(d<t?(weekly?`${pd.name}, missed`:'nothing logged'):`${pd.name}, planned`):isRest&&d>=t?'rest day':'nothing logged';
    const label=`${DAYS[i]} ${fmtDate(d)}: ${what}${cd.length?`, cardio ${cd.reduce((a,c)=>a+c.min,0)} min`:''}`;
    const inner=`<span class="wd">${WD2[i]}</span><span class="dn">${+d.slice(8)}</span><span class="nm">${name?esc(name):'&nbsp;'}</span>`;
    if(live&&d<t)h+=`<button type="button" class="${cls}" data-act="wkGo" data-date="${d}" data-tip="${esc(label)}" aria-label="${esc(label)}. Open the session">${inner}</button>`;
    // A day with two sessions asks which, as the calendar does (r47): both go through calDay. Until r47 the bar opened one of them without asking.
    else if(trained&&ss.length>1)h+=`<button type="button" class="${cls}" data-act="calDay" data-date="${d}" data-tip="${esc(label)}" aria-label="${esc(label)}. Choose one to open">${inner}</button>`;
    else if(trained)h+=`<button type="button" class="${cls}" data-act="wkOpen" data-id="${ss[0].id}" data-tip="${esc(label)}" aria-label="${esc(label)}. Open in History">${inner}</button>`;
    else if(d>=t)h+=`<button type="button" class="${cls}" data-act="wkGo" data-date="${d}"${p?` data-day="${p.di}"`:''} data-tip="${esc(label)}" aria-label="${esc(label)}. Open on Today">${inner}</button>`;
    // An empty past day logs a workout for that date (item 53): every day in the bar does something.
    else h+=`<button type="button" class="${cls}${hasLog?' add':''}" data-act="pastOpen" data-date="${d}" data-tip="${esc(label+'. Tap to log it')}" aria-label="${esc(label)}. Log a workout for this day">${inner}</button>`;
  }
  return h;
}
function renderWeekBar(){const el=document.getElementById('wkbar');if(!el)return;try{el.innerHTML=weekBar();}catch(e){log('weekbar',e);el.innerHTML='';}}
function noLog(){return !state.sessions.length;}
const nz=v=>noLog()?NIL:v;
/* The week at a glance, beside the day's name: sessions done against the
   sessions the routine plans this week, the same two numbers as This week's
   title. V (2026-10-13): the headline counts what was done, not planned
   sets; hard sets against the plan stay inside This week. A ring fills,
   which reads faster than a sentence. Tapping it opens This week. */
function heroRing(w){
  if(!(w.planDays>0))return '';
  const r=26,c=2*Math.PI*r,p=Math.max(0,Math.min(1,w.doneDays/w.planDays));
  const pd=`${w.weekly||weekFactor(w.R)===1?'':'about '}${w.planDays}`;
  const lbl=noLog()?`No sessions logged yet; ${pd} planned this week`:`${w.doneDays} of ${pd} sessions this week`;
  return `<button type="button" class="ring" data-act="goWeek" aria-label="${esc(lbl)}. Open This week" data-tip="${esc(lbl)}"><svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" class="rt"/><circle cx="32" cy="32" r="${r}" class="rp" stroke-dasharray="${(c*p).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 32 32)"/></svg><span class="rv">${noLog()?NIL:`${w.doneDays}<small>/${w.planDays}</small>`}</span><span class="rl">week</span></button>`;
}
function weekStats(){
  const R=activeRoutine();
  const cur=weekStart(today());const weekly=R.schedule==='weekly';
  let cardioMin=0,cardioN=0;
  for(const c of state.cardio)if(c.date>=cur&&c.date<=addDays(cur,6)){cardioMin+=c.min;cardioN++;}
  const doneDays=weekSessions(cur);
  const planDays=weekly?trainDaysOf(R):Math.round(trainDaysOf(R)*weekFactor(R));
  /* Sets are counted once each here, the same way the Plan tab counts them.
     Per-muscle volume (direct 1, secondary half) stays in the muscle views,
     where the split matters; summed across muscles it double-counts. The
     numerator is hard sets only, so a set left at RIR 4 or more does not
     count toward the week, unless Count RIR 4 to 5 as half a set is on
     (r40, hardCredit). Read from IDX's weekHard (r47), the same table the
     recap, Volume and the muscle views count from; until r47 this walked the
     log with its own copy of the rule. */
  const got=IDX().weekHard[cur]||0;
  const tgt=planSetsPerWeek(R,isDeloadWeek());
  /* A rest week is said once, here, so the ring, the card and its body all
     follow (r46: the ring and the title were given their own test for it and
     the body kept saying "0 hard sets logged of 145 planned" underneath). */
  const rest=isRestWeek(cur);
  return {R,weekly,planDays:rest?0:planDays,doneDays,got,tgt:rest?0:tgt,pct:!rest&&tgt>0?Math.min(100,got/tgt*100):0,cardioMin,cardioN,rest};
}
function cycleStrip(R){
  const cs=cycleState(R);
  return `<div class="cyc" role="list" aria-label="Your cycle">${R.days.map((d,i)=>{
    const st=d.rest?'rest':i===cs.next?'next':cs.done.has(i)?'done':'';
    const what=st==='next'?', next up':st==='done'?', done this round':d.rest?', rest':'';
    return `<span role="listitem" class="c ${st}" data-tip="${esc(dayLabel(R,i)+': '+d.name+what)}"><b>${i+1}</b>${esc(d.rest?'Rest':d.name)}</span>`;
  }).join('')}</div>`;
}
/* Weight lifted this week, against last week to this point. It moved here from
   At a glance in r23 (item 32): This week owns everything about this week,
   At a glance the longer view. */
function liftedLine(){
  const tn=tonnageNow();if(!tn.now&&!tn.prevFull)return '';
  /* No percentage against last week (r30): weight lifted falls when loads
     go up and reps come down, so as a headline it read progress as decline
     ("−5%" on a week of PRs). The number stays; the detail is in Stats. */
  return `<button class="linkbtn wklift" data-act="goDash" data-sec="svol" style="margin:6px 0 0;text-decoration:none;text-align:left"><b>${tn.now?fmtBig(tn.now):0} ${U()}</b> lifted</button>`;
}
function weekBody(w){
  /* The two numbers are counted differently on purpose and the label has to
     say so: the denominator is every hard set the routine plans (RIR 3 or
     less, halved in a deload week; r27), the numerator is
     only the sets that counted as hard. You cannot reach 100% on a week where
     you left RIR at 4 or above. The day-by-day week is the bar at the top. */
  if(ui.wkView===undefined){try{ui.wkView=localStorage.getItem(WKVIEW_KEY)==='month'?'month':'week';}catch(e){ui.wkView='week';}}
  const month=ui.wkView==='month';
  const tog=`<div class="wkview" role="group" aria-label="Show"><button type="button" data-act="wkView" data-v="week" aria-pressed="${!month}"${month?'':' class="on"'}>Week</button><button type="button" data-act="wkView" data-v="month" aria-pressed="${month}"${month?' class="on"':''}>Month</button></div>`;
  if(month)return tog+`<div class="cal-inline">${calBody(ui.calYm&&ui.calYm<=today().slice(0,7)?ui.calYm:today().slice(0,7),true)}</div>`;
  if(freeMode())return `${tog}<div class="hrow" style="margin:5px 0 0"><p class="small muted" style="margin:0" id="wkSets">${noLog()?'Nothing logged yet.':`${r1(w.got)} hard sets this week.`}</p>${helpBtn('wk')}</div>
  ${w.cardioMin?`<p class="small" style="margin:5px 0 0">Cardio and mobility: ${w.cardioMin} min in ${w.cardioN} entr${w.cardioN===1?'y':'ies'}</p>`:''}${liftedLine()}
  ${helpText('wk','Each set counts once; a set at RIR 4 or more is not hard and does not count. Muscle targets are on the Muscle map and in Stats.')}`;
  if(w.rest)return `${tog}<div class="hrow" style="margin:5px 0 0"><p class="small muted" style="margin:0" id="wkSets">Rest week. ${w.got?`${r1(w.got)} hard sets logged.`:'Nothing planned.'}</p>${helpBtn('wk')}</div>
  ${w.cardioMin?`<p class="small" style="margin:5px 0 0">Cardio and mobility: ${w.cardioMin} min in ${w.cardioN} entr${w.cardioN===1?'y':'ies'}</p>`:''}${liftedLine()}
  ${helpText('wk','A rest week you marked in Settings. It does not count as missed: your averages, streak, and adherence skip it.')}`;
  return `${tog}${w.weekly?'':cycleStrip(w.R)}
  <div class="band" data-tip="${noLog()?`${w.tgt} hard sets planned`:`${w.got} hard sets logged of ${w.tgt} planned`}"><div class="fill prog" style="width:${w.pct}%"></div></div>
  ${w.cardioMin?`<p class="small" style="margin:5px 0 0">Cardio and mobility: ${w.cardioMin} min in ${w.cardioN} entr${w.cardioN===1?'y':'ies'}</p>`:''}
  <div class="hrow" style="margin:5px 0 0"><p class="small muted" style="margin:0" id="wkSets">${noLog()?`${w.tgt} hard sets planned this week.`:`${w.got} hard sets logged of ${w.tgt} planned${w.tgt>0?` (${Math.round(w.pct)}%)`:''}.`}</p>${helpBtn('wk')}</div>
  ${liftedLine()}
  ${helpText('wk',`Each set counts once; a set at RIR 4 or more is not hard and does not count. The bar at the top of every tab is this calendar week: filled is a day you lifted, a coloured outline is cardio only, a grey ring is a workout planned ahead${w.weekly?', a red ring is a planned workout that was missed':''}. Tap a filled day to open it in History; tap today or a day ahead to see its workout here; tap an empty past day (marked +) to log a workout for it.${w.weekly?'':' The row above the bar is your cycle: green is done this round, outlined is next.'}`)}`;
}
function weekCard(){
  const w=weekStats();const body=weekBody(w);
  /* The title follows the view (V, r28): This week, or This month (the
     month's name for an earlier one) with that month's session count. */
  if(ui.wkView==='month'){
    const cur=today().slice(0,7);const ym=ui.calYm&&ui.calYm<=cur?ui.calYm:cur;
    const n=Object.keys(dateIndex().byDate).filter(d=>d.slice(0,7)===ym).reduce((a,d)=>a+sessionsOn(d).length,0);
    const title=ym===cur?'This month':new Date(ym+'-15T12:00:00').toLocaleDateString(undefined,{month:'long',year:'numeric'});
    return sec({sk:'today:week',key:'week',title,sub:`${n} session${n===1?'':'s'}`,body});
  }
  if(freeMode())return sec({sk:'today:week',key:'week',title:'This week',sub:w.rest?`Rest week${w.doneDays?`, ${w.doneDays} session${w.doneDays===1?'':'s'}`:''}`:noLog()?'Nothing logged yet':`${w.doneDays} session${w.doneDays===1?'':'s'}`,body});
  if(w.rest)return sec({sk:'today:week',key:'week',title:'This week',sub:`Rest week${w.doneDays?`, ${w.doneDays} session${w.doneDays===1?'':'s'}`:''}`,body});
  return sec({sk:'today:week',key:'week',title:'This week',sub:noLog()?`${w.weekly||weekFactor(w.R)===1?'':'~'}${w.planDays} sessions planned`:`${w.doneDays} of ${w.weekly||weekFactor(w.R)===1?'':'~'}${w.planDays} sessions`,body});
}
/* Quick answers before a session starts: is this lift moving, and what to do. */
function liftTags(exId){
  const st=IDX().exStats[exId];if(!st)return '';const t=[];
  if(st.last&&st.last.progress&&st.fresh)t.push('<span class="tag green">PR last time</span>');
  if(st.easier)t.push('<span class="tag blue">Load due</span>');
  if(st.stalled)t.push('<span class="tag yellow">Stalled</span>');
  if(st.capped)t.push('<span class="tag blue">At max load</span>');
  return t.length?`<span class="chips">${t.join('')}</span>`:'';
}
function liftTrend(exId){
  /* The last three full sessions only (r30): a deload or lighter day in the
     list read as a drop. The word follows the numbers shown: within 1% is
     flat, so "301 → 300.7 · up" cannot happen. Isolation lifts show their top
     sets, not a 1RM. */
  const ex=EX(exId);const st=IDX().exStats[exId];
  const exps=(IDX().byEx[exId]||[]).filter(x=>x.tv!=null&&!offSession(x)).slice(-3);
  if(exps.length<2)return '';
  /* The word follows the lift's trend when it has one (r32, from the third
     review: a press flat for 7 weeks read "67.5 → 69.7 → 69.7 · up" from its
     last three sessions). */
  // With no trend yet (under 3 sessions over 2 weeks), no word at all (r32, second check: "· up" from three sessions in a week).
  /* The word covers the trend's weeks, not just the three numbers shown (r34.2: "252 → 249 → 252 · up"), and says nothing for a lift weeks off. */
  const ow=st&&st.spanW?` over ${st.spanW} weeks`:'';
  const dir=st&&st.fresh&&st.pct!=null?(st.moving?`up${ow}`:st.falling?`down${ow}`:st.pLo!=null&&st.pLo>0?`slowly up${ow}`:st.pHi!=null&&st.pHi<0?`slowly down${ow}`:`no clear change over ${st.spanW||2} weeks`):'';
  if(isCompound(ex)&&exps.every(x=>x.best!=null)){
    const v=exps.map(x=>fmtE(x.best));const d2=dir;
    return `<p class="small muted" style="margin:2px 0">Est. 1RM <span class="trend">${v.join(' → ')} ${U()}</span>${d2?' · '+d2:''}${st&&!st.useAdj?' '+tipi('Read from loads and reps alone: RIR is rated on too few of its sets to compare sessions fairly.','About this trend'):''}</p>`;
  }
  return `<p class="small muted" style="margin:2px 0">Top sets <span class="trend">${exps.map(x=>topSetOf(ex,x)).join(' → ')}</span>${dir?' · '+dir:''}</p>`;
}
// A session's strongest set by reps alone (v, its score) and as typed (txt).
function topSetPt(ex,x){let q=null;for(const p of x.pts){const v=trendE(p.load,p.r,0)||0;if(!q||v>q.v)q={v,p};}return {v:q.v,txt:setShort(ex,q.p.w,q.p.r)};}
function topSetOf(ex,x){return topSetPt(ex,x).txt;}
function bodyCard(){
  const bws=[...state.bodyweights].sort((a,b)=>a.date<b.date?1:-1);
  const ms=[...state.measurements].sort((a,b)=>a.date<b.date?1:-1).slice(0,3);
  const last=bws[0];const r=bwRate();const loggedToday=last&&last.date===today();
  const sub=last?`${fmtW(last.kg)} ${U()}${r?` · ${bwWeekTxt(r)}`:''}`:'Not logged yet';
  // "−0 vs previous" read as a loss; a change that rounds to nothing says so (r41).
  const chg=bws.length>1?last.kg-bws[1].kg:null;const chgTxt=chg==null?'':+fmtW(Math.abs(chg))===0?', same as previous':`, ${chg>0?'+':'−'}${fmtW(Math.abs(chg))} vs previous`;
  return sec({sk:'today:body',key:'body',title:'Body',sub:esc(sub),body:`${last?`<div class="body-sum"><div><div class="v">${fmtW(last.kg)}<span class="small"> ${U()}</span></div><div class="l">Latest, ${fmtDate(last.date)}${chgTxt}</div></div>${r?`<div><div class="v">${esc(bwWeekTxt(r).replace(' a week',''))}</div><div class="l">weekly change, from 7-day averages</div></div>`:''}</div>`:''}
  <div class="bw-entry"><label class="field">Date<input type="date" id="bwDate" value="${today()}" max="${today()}"></label><label class="field">Weight (${U()})<input type="text" inputmode="decimal" id="bwVal" placeholder="${last?fmtW(last.kg):''}" enterkeyhint="done"></label><button class="btn primary" data-act="addBW" data-tip="Also used for pull-ups, dips, and other bodyweight lifts.">${loggedToday?'Update':'Log'}</button></div>
  ${bws.length?`<ul class="bw-list" aria-label="Recent bodyweights">${bws.slice(0,5).map(b=>`<li><span class="d">${fmtDate(b.date)}</span><span class="num">${fmtW(b.kg)} ${U()}</span><button class="ib sm" data-act="delBW" data-id="${b.id}" aria-label="Delete ${fmtDate(b.date)} entry">✕</button></li>`).join('')}</ul>${bws.length>5?`<p class="small muted" style="margin:4px 0 0">${bws.length-5} older on Stats.</p>`:''}`:''}
  ${subsec('today:tape',`Tape measurements (${LU()})`,`<div class="grid2" style="align-items:end">${heightField()}<span></span></div>
    <div class="grid3" style="margin-top:10px">${MEAS.map(([k,l])=>`<label class="field">${l}<input type="text" inputmode="decimal" id="ms_${k}"></label>`).join('')}</div>
    ${whtrLine(true)}
    <button class="btn" style="margin-top:8px" data-act="addMeas">Save measurements for ${fmtDate(today())}</button>
    ${ms.length?`<div class="scroll-x" style="margin-top:10px"><table class="t"><tr><th>Date</th>${MEAS.map(m=>`<th class="r">${m[1]}</th>`).join('')}<th class="stick-r"><span class="vh">Delete</span></th></tr>${ms.map(m=>`<tr><td>${fmtDate(m.date)}</td>${MEAS.map(([k])=>`<td class="r">${lenD(m[k])}</td>`).join('')}<td class="stick-r"><button class="ib sm" data-act="delMeas" data-id="${m.id}" aria-label="Delete ${fmtDate(m.date)} measurements">✕</button></td></tr>`).join('')}</table></div>`:''}`,ms.length?`last ${fmtDate(ms[0].date)}`:'')}`});
}
/* The most recent non-empty note you left on this exercise in a saved session:
   seat height, pin, grip, which station. Shown when the exercise comes up again. */
function lastNoteOf(exId,before){
  let best=null;
  for(const ss of state.sessions)if(!before||ss.date<=before)for(const b of ss.ex)if(b.exId===exId&&b.note&&b.note.trim()&&(!best||ss.date>best.date))best={date:ss.date,text:b.note.trim()};
  return best;
}
function newBlock(exId,plan,opts){
  const sg=suggest(exId,plan,opts);
  // sw is the load the app suggested, kept so a later refresh can tell a row
  // still on the suggestion from one the lifter typed (refreshBlock).
  return {bid:uid(),exId,plan:{...plan},note:'',lastNote:lastNoteOf(exId,opts&&opts.before),inj:sg.inj||null,hint:sg.text,last:sg.last,prev:sg.prev||undefined,prevOff:sg.prevOff||undefined,target:sg.target,tgt:sg.tgt,easier:sg.easier||null,lastR:sg.lastR,basis:sg.basis||undefined,sw:sg.w==null?null:sg.w,sets:Array.from({length:+plan.sets||3},()=>({w:fillLoads()?sg.w:null,r:null,rir:null,warm:false,drop:false,done:false}))};
}
/* ---------- PROFILE (r44, item 271, with 43 and 44) ----------
   An optional short profile: goal, experience, days a week and up to two
   focus muscles. V's answers (2026-10-13): it sets defaults and new plan
   items only; the routine in use changes only through Apply; targets the
   lifter typed stay as typed, and only the app's own targets move. With no
   profile, or with Size, every number is exactly what it was before r44,
   because the app's defaults were already set for size. */
function prof(){return state.settings.profile||{};}
/* What a profile changes in a plan item (the rules Apply and new items share):
   - Strength or Both, past the first year: heavy compounds (`profHeavy`) at
     3 to 6 or 5 to 8 reps, 2 in reserve, 3 minutes' rest.
     Heavier loads gave more strength for similar growth (Schoenfeld 2017
     meta-analysis of low vs high loads; ACSM 2009 position stand: 1 to 6 RM
     for strength past the novice stage); 3 minutes' rest beat 1 for strength
     and size (Schoenfeld 2016). 5 to 8 for Both is a convention between the
     two, and 2 in reserve on heavy compounds is the app's own (templates).
   - Under a year: 8 to 12 reps for everything (ACSM 2009: novices gain
     strength and size there), 3 in reserve on compounds and 2 on isolation,
     as the beginner plan (a convention: easier to judge, further from failure).
   Isolation lifts past the first year, timed holds and Size keep the defaults. */
function profRule(ex,p){
  p=p||prof();if(!ex||ex.timed)return null;
  if(p.exp==='new')return {repMin:8,repMax:12,rir:isCompound(ex)?3:2};
  if((p.goal==='strength'||p.goal==='both')&&profHeavy(ex))return p.goal==='strength'?{repMin:3,repMax:6,rir:2,rest:180}:{repMin:5,repMax:8,rir:2,rest:180};
  return null;
}
function profPlan(ex,plain){const r=plain?null:profRule(ex);return r?{...DEFAULT_PLAN,...r}:{...DEFAULT_PLAN};}
/* A muscle's weekly target with this profile (the defaults with no focus). */
function defBand(m,p){
  const b=BANDS[m];const f=(p||prof()).focus||[];
  if(!f.length||TRACK_ONLY.has(m))return [b[0],b[1]];
  if(f.includes(m))return [Math.round(b[0]*FOCUS_UP),Math.round(b[1]*FOCUS_UP)];
  return [Math.ceil(b[0]*MAINT_SHARE),b[1]];
}
/* The app's own target for a muscle (r44): the profile's default, brought
   down to the floor a first-run routine pick recorded (settings.bandsFit),
   except on a focus muscle, whose raised target is the point. A target that
   reads anything else was typed and never moves; typed back to this number,
   it is the app's again. Nothing is guessed: the floors are the one fact
   that cannot be worked out later, so fitTargets stores them (the r44
   review found four bugs in inferring them). */
function appBand(m,p){
  p=p||prof();const d=defBand(m,p);const f=(state.settings.bandsFit||{})[m];
  return f==null||TRACK_ONLY.has(m)||(p.focus||[]).includes(m)?d:[Math.min(d[0],f),d[1]];
}
/* Moves the app's own targets from the old profile's to the new one's.
   Returns {muscle: [from, to]} for what moved, as copies, since Weekly set
   targets edits the arrays in place. */
function profMoveBands(oldP,newP){
  const b=state.settings.bands;const moved={};
  for(const m of MK){if(TRACK_ONLY.has(m))continue;const o=appBand(m,oldP);if(b[m][0]!==o[0]||b[m][1]!==o[1])continue;
    const to=appBand(m,newP);if(b[m][0]===to[0]&&b[m][1]===to[1])continue;moved[m]=[b[m].slice(),to.slice()];b[m]=to.slice();}
  return moved;
}
/* Apply (V's answer 1): the profile's rules on the routine in use, only the
   fields a rule sets, on items where they differ. Rest is only raised, and a
   rest of 0 (no timer, on purpose) is left alone. Under a year, Apply only
   raises reps in reserve and keeps the routine's ranges: a ready-made
   routine's 5 x 5 or 10 to 15 was chosen on purpose, and 8 to 12 is where new
   exercises start (the r44 review). Returns what would change. */
function profApplyList(R){
  const out=[];if(!R)return out;const nw=prof().exp==='new';
  R.days.forEach((d,di)=>d.items.forEach(it=>{const r=profRule(EX(it.exId));if(!r)return;
    const ch={};for(const k in r){
      if(k==='rest'){if(+it.rest!==0&&!(+it.rest>=r.rest))ch.rest=r.rest;}
      else if(nw){if(k==='rir'&&!(+it.rir>=r.rir))ch.rir=r.rir;}
      else if(it[k]!==r[k])ch[k]=r[k];}
    if(Object.keys(ch).length)out.push({di,it,ch});}));
  return out;
}
// What Apply changes, said in its question.
function profApplyWhat(){const p=prof();return p.exp==='new'?'Reps in reserve go up to 3 on compounds and 2 on isolation; rep ranges stay.':p.goal==='both'?'Heavy compounds go to 5 to 8 reps, 2 in reserve, and at least 3 minutes\' rest.':'Heavy compounds go to 3 to 6 reps, 2 in reserve, and at least 3 minutes\' rest.';}
function strengthPick(e,st,rec,at){
  if(prof().goal!=='strength'||!profHeavy(e)||!st||!st.last||rec.r<1)return null;
  if(!(daysOff(e.id,{before:at})>=STR_REST))return null;
  const near=st.bestAll>0&&st.last.best>=st.bestAll*STR_NEAR;
  return st.stalled?'stalled':near?'near':null;
}
/* Round a load to something you can actually put on a bar or pick off a rack:
   nearest 5 lb, or nearest 2.5 kg. Used for suggested warm-up loads only;
   anything the user types is left exactly as typed. */
/* down: round toward lighter. A deload rounded to nearest could land back on
   the full load (90% of 25 lb is 22.5, which rounded up to 25). */
function roundLoad(kg,down){
  const step=U()==='lb'?5:2.5;const d=toD(kg);
  return fromD(Math.max(step,(down?Math.floor(d/step+1e-9):Math.round(d/step))*step));
}
/* RIR used to be a free-text field, which on a phone means opening the keyboard
   mid-set. Almost nobody does that, so almost every set came through blank and
   the volume bands silently counted it as hard anyway. A native picker is one
   tap, which is the difference between measuring and assuming. */
/* RIR is picked from a strip of 0 to 5 instead of the phone's dropdown wheel
   (open, spin, confirm on every set). The cell shows the value; tapping it
   opens the strip under that set, and ticking a set done with no RIR yet
   opens it by itself, so logging effort is one tap. */
/* Effort in half points or as RPE (r33, item 206): a setting for how effort
   is entered and shown. What is stored is always RIR (RPE 8 is RIR 2, RPE
   8.5 is RIR 1.5), so every estimate, hard-set count and target reads it
   unchanged, and switching back and forth loses nothing. Unset is whole RIR. */
const rirScale=()=>state.settings.rirScale==='half'||state.settings.rirScale==='rpe'?state.settings.rirScale:'whole';
const effWord=()=>rirScale()==='rpe'?'RPE':'RIR';
/* A plan's target effort as the lifter enters effort: "1 RIR", or "RPE 9" in RPE mode. */
function effTgt(rir){return rirScale()==='rpe'?`RPE ${effShow(rir)}`:`${effShow(rir)} RIR`;}
function effShow(v){if(v==null||v==='')return '';const n=+v;if(!isFinite(n))return '';return rirScale()==='rpe'?String(Math.round((10-n)*10)/10):String(Math.round(n*10)/10);}
function effOpts(){const sc=rirScale();return sc==='whole'?RIR_OPTS.slice():['0','0.5','1','1.5','2','2.5','3','3.5','4','4.5','5'];}
const effAria=si=>rirScale()==='rpe'?`RPE for set ${si+1}`:`Reps in reserve for set ${si+1}`;
function rirSelect(val,bi,si,target){
  const cur=effShow(val);
  return `<button type="button" class="rirb${cur===''?' unset':''}" data-act="rirOpen" data-f="rir" data-b="${bi}" data-s="${si}" aria-haspopup="true" aria-expanded="false" aria-label="${effAria(si)}: ${cur===''?'not set':cur}">${cur===''?(target!=null?'–':effWord()):esc(cur)}</button>`;
}
/* Whole RIR is one row of 0 to 5. Half points and RPE are a grid under the
   label: whole numbers on top, each half between the two it sits between,
   every button 44 px tall and at least 40 px wide at 320 px. The buttons
   carry RIR; RPE only changes what they say. */
function rirStripHTML(bi,si,cur){
  const sc=rirScale();const two=sc!=='whole';
  // A stored value off the grid (0.25 from an import) shows in the set's box; the grid keeps its 11 places.
  const opts=effOpts();if(!two&&cur!==''&&!opts.includes(cur)){opts.push(cur);opts.sort((a,b)=>a-b);}
  const btn=o=>`<button type="button" data-act="rirPick" data-b="${bi}" data-s="${si}" data-v="${o}" aria-pressed="${cur===o}"${cur===o?' class="on"':''}>${sc==='rpe'?effShow(o):o}</button>`;
  // RPE reads up from 5 to 10, as RPE charts do; RIR from 0 up.
  const ord=sc==='rpe'?opts.slice().reverse():opts;
  const body=two?`<div class="rs-g">${ord.filter(o=>Number.isInteger(+o)).map(btn).join('')}${ord.filter(o=>!Number.isInteger(+o)).map(btn).join('')}</div>`:opts.map(btn).join('');
  return `<div class="rirstrip${two?' two':''}" role="group" aria-label="${effAria(si)}" data-b="${bi}" data-s="${si}"><span class="rs-l">${effWord()}</span>${body}<button type="button" class="rs-x" data-act="rirPick" data-b="${bi}" data-s="${si}" data-v="" aria-label="Clear ${effWord()}">✕</button></div>`;
}
function rirClose(){const el=document.querySelector('.rirstrip');if(!el)return;const b=document.querySelector(`.rirb[data-b="${el.dataset.b}"][data-s="${el.dataset.s}"]`);if(b)b.setAttribute('aria-expanded','false');el.remove();autoPending();}
/* Typed reps, then a tap on the same row's RIR box (r30): auto-mark waits
   until the RIR strip closes, picked or not. Ticking at once started the
   rest timer, whose bar rose under the finger near the bottom of the
   screen, so the tap landed on the timer and the strip never opened. */
let pendAuto=null;
function autoPending(){
  const p=pendAuto;pendAuto=null;if(!p||!state.draft||!state.settings.autoDone)return;
  const bi=blkIdx(p.b);if(bi<0)return;
  const s=state.draft.ex[bi].sets[p.s];if(!s||s.done||!(+s.r>0))return;
  lastAuto={b:blkRef(bi),s:p.s,t:Date.now()};setDone(bi,p.s,true);
}
function rirShowStrip(bi,si){
  rirClose();const btn=document.querySelector(`.rirb[data-b="${bi}"][data-s="${si}"]`);const s=state.draft&&state.draft.ex[bi]&&state.draft.ex[bi].sets[si];
  if(!btn||!s)return;const row=btn.closest('.sg');if(!row)return;
  row.insertAdjacentHTML('afterend',rirStripHTML(bi,si,s.rir==null?'':String(s.rir)));btn.setAttribute('aria-expanded','true');
  // The rest bar appears on the same tap and can cover the strip; lift it
  // into view above the bar and the tabs.
  requestAnimationFrame(()=>{const st=row.nextElementSibling;if(!st||!st.classList.contains('rirstrip'))return;
    let lim=window.innerHeight;for(const id of ['timer','tabs']){const el=document.getElementById(id);if(el&&!el.hidden){const t=el.getBoundingClientRect().top;if(t>0)lim=Math.min(lim,t);}}
    const r=st.getBoundingClientRect();if(r.bottom>lim-8)window.scrollBy({top:r.bottom-lim+16,behavior:'smooth'});});
}
/* Cardio and mobility inside a session: saved as their own entries on Finish,
   never counted as lifting sets. */
function cardioDraftCard(d){
  const rows=(d.cardio||[]).map((c,ci)=>`<div class="cgrid"><label class="field">Type<select data-cf="kind" data-c="${ci}">${CARDIO.map(([k,l])=>`<option value="${k}" ${c.kind===k?'selected':''}>${l}</option>`).join('')}</select></label>
    <label class="field">Minutes<input type="text" inputmode="numeric" data-cf="min" data-c="${ci}" value="${c.min==null?'':c.min}"></label>
    <label class="field">Avg HR<input type="text" inputmode="numeric" data-cf="hr" data-c="${ci}" value="${c.hr==null?'':c.hr}" placeholder="optional"></label></div>
    <label class="field" style="margin-top:6px">Distance (${distU()})<input type="text" inputmode="decimal" data-cf="dist" data-c="${ci}" value="${c.dist?distShow(c.dist):''}" placeholder="optional"></label>
    <div class="row" style="margin-top:6px"><select data-cf="when" data-c="${ci}" style="flex:1" aria-label="When">${CWHEN.map(([k,l])=>`<option value="${k}" ${c.when===k?'selected':''}>${l}</option>`).join('')}</select><button class="btn sm danger" data-act="cDraftDel" data-c="${ci}">Remove</button></div>`).join('');
  const n=(d.cardio||[]).length;const mins=(d.cardio||[]).reduce((a,c)=>a+(c.min||0),0);
  return sec({sk:'logger:cardio',title:'Cardio and mobility',sub:n?`${n} entr${n===1?'y':'ies'}${mins?`, ${mins} min`:''}`:'optional',body:`${rows}
  <div class="row" style="margin-top:${n?10:0}px"><button class="btn sm" data-act="cDraftAdd" data-when="pre">+ Before lifting</button><button class="btn sm" data-act="cDraftAdd" data-when="post">+ After lifting</button></div>`});
}
function viewLogger(){
  // Warm-ups are not counted, the same as the progress bar under it.
  const d=state.draft;const hintSeen=new Set();const doneN=d.ex.reduce((a,b)=>a+b.sets.filter(s=>s.done&&!s.warm).length,0);
  const left=leftMin(d);
  let h=`<div class="ph"><div style="min-width:0;flex:1 1 auto"><p class="kick">${d.editingId?'Editing a saved session':d.past?'Past workout':'Session in progress'}</p><div class="hrow"><h2 style="overflow-wrap:anywhere;min-width:0">${esc(d.dayName)}</h2>${helpBtn('log')}<button class="btn sm danger" style="margin-left:auto;flex:none" data-act="discard">${d.editingId?'Cancel edit':'Discard'}</button></div><p class="meta"><span id="doneCount">${doneN}</span> <span id="doneWord">${doneN===1?'set':'sets'}</span> done${d.past?`, for ${esc(fmtDateLong(d.date))}`:''}${d.startedAt&&!d.past?`, started ${new Date(d.startedAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}`:''}<span id="sessLeft">${left>0?`, ${estMin(left)} left`:''}</span></p>${(()=>{const sp=sessProgress(d);return sp.n?`<div class="sprog" aria-hidden="true"><div class="band"><div class="fill prog" id="sessBar" style="width:${sp.pct}%"></div></div><span id="sessOf">${sp.k} of ${sp.n}</span></div>`:'';})()}
  <div class="row lh-row"><input type="date" data-bind="draftDate" value="${d.date}" max="${today()}" aria-label="Session date" data-tip="Change to log a past session">${left>0?'<button class="btn sm" data-act="shortOpen">Short on time</button>':''}</div></div></div>
  ${helpText('log',(state.settings.rirMode==='off'?'RIR is switched off in Settings, so every working set counts as hard. ':'RIR is reps left in the tank: 3 or less counts the set as hard for weekly volume, 4 or more stays in history only. RIR is optional: a blank is read as your usual RIR on that lift, or as hard until you have rated a few of its sets. ')+'W marks a warm-up (kept, never analysed); tap it again for D, a drop set (counts as work and volume, never as a PR or target). To add a new warm-up or drop set row, use the ⋯ menu on the exercise. Drag an exercise by its ⠿ to change the order. In a superset the rest timer starts after the last exercise of the pair. Timed holds log seconds in the Sec column. The date can be changed to log a past session.'+(d.past?' Quick entry: no rest timer, and a set counts as done once its reps are typed.':state.settings.autoDone?' Auto-mark is on: sets tick themselves when you leave the reps field.':''))}
  ${d.free?`<label class="field" style="margin-top:8px">Name<input type="text" data-bind="draftName" maxlength="40" value="${esc(d.dayName)}"></label><p class="small muted" style="margin:4px 0 0">Not tied to a routine day, so your cycle stays put.</p>`:''}
  ${d.past?'':checkinCard(d)}${bwAskCard(d)}`;
  if(!d.ex.length)h+=`<div class="card"><p class="small" style="margin:0">No exercises yet. Tap + Add exercise below${d.editingId?'':', or Pick for me for a suggestion based on your last 7 days,'} and log as you go.</p></div>`;
  const calIdx=d.editingId?-1:calDueIdx(d);
  const letters=ssLetters(d.ex.map(b=>b.plan));
  d.ex.forEach((b,bi)=>{
    const ex=EX(b.exId);const p=b.plan;const ss=p.ss?letters[p.ss]:null;const nr=!rirShow(ex);const dupB=lastDup(d,bi);
    if(!d.editingId&&blockDone(b)&&!blkIsOpen(bi,b)){
      const ws=b.sets.filter(x=>!x.warm);const prs=ws.filter(x=>livePR(b.exId,x,d.date)).length;
      h+=`<section class="block folded" id="blk-${bi}" data-bi="${bi}">${bgrip(bi,ex.name)}<button class="bfold" data-act="bOpen" data-b="${bi}" aria-expanded="false" aria-label="${esc(ex.name)}, done. Open to edit"><span class="bf-ck" aria-hidden="true">✓</span><span class="bf-t"><b>${esc(ex.name)}</b><span>${esc(ws.map(x=>setShort(ex,x.w,x.r)).join(', '))}</span></span>${prs?`<span class="bf-pr">PR</span>`:''}<span class="chev" aria-hidden="true"></span></button></section>`;
      return;
    }
    const partner=ss?d.ex.filter(x=>x!==b&&x.plan.ss===p.ss).map(x=>exName(x.exId)).join(' + '):'';
    h+=`<section class="block${ss?' ss':''}" id="blk-${bi}" data-bi="${bi}"><div class="bh">${bgrip(bi,ex.name)}<div class="bh-m"><h3 ${ex.note?`aria-labelledby="bhn-${bi}"`:''}><span id="bhn-${bi}">${esc(ex.name)}</span>${ex.note?` ${tipi(ex.note,'About '+ex.name)}`:''}</h3><p class="small muted">${esc(ML[ex.primary])} · ${b.sets.filter(x=>!x.warm&&!x.drop).length||p.sets}×${repSpan(p.repMin,p.repMax,'-')}${ex.timed?'s':''}${ex.perSide?'/side':''}${nr?'':` @${effTgt(p.rir)}`} · ${p.rest}s${ss?` · <span class="tag blue">Superset ${ss}</span>`:''}${b.inj?` · <span class="tag red">Injury: ${injLabel(b.inj)}</span>`:''}</p>${lmChips(ex)}</div>
      <div class="bh-acts">${!d.editingId&&blockDone(b)?`<button class="ib" aria-label="Fold ${esc(ex.name)}" data-act="bFold" data-b="${bi}">▴</button>`:''}<button class="ib" aria-label="Exercise options" data-act="bMenu" data-b="${bi}">⋯</button></div></div>
      ${b.target?`<p class="hint"><b>Today: ${esc(targetText(b))}</b>${whyTarget(b)?` ${tipi(whyTarget(b),'Why this target')}`:''}<span class="tp muted" style="display:block">${esc(lastHead(b,dupB))}</span>${(()=>{const bl=bestLine(b.exId);return bl?`<span class="tp muted" style="display:block">${esc(bl)}</span>`:'';})()}${b.easier?`<span class="tp ez">${esc(b.easier)}</span>`:''}${progressLine(b,bi)}</p>`:`<p class="hint">${esc(hintOnce(b.hint||'',hintSeen))}</p>`}${bi===calIdx?`<p class="small caldue">Due for an RIR check: take one set here to failure. <button class="linkbtn tall" data-act="bCal" data-b="${bi}">Calibration set</button> <button class="linkbtn tall" data-act="calSnooze">Not now</button></p>`:''}
      ${ss&&partner?`<p class="small muted" style="margin:2px 0 0">Superset with ${esc(partner)}; rest after the pair.</p>`:''}
      ${b.lastNote&&!b.note?`<p class="small lnote">Your note, ${esc(fmtDate(b.lastNote.date))}: ${esc(b.lastNote.text)} <button class="linkbtn" data-act="noteReuse" data-b="${bi}">Use again</button></p>`:''}
      ${b.note?`<p class="small bnote" id="bn-${bi}">${esc(b.note)}</p>`:`<p class="small bnote" id="bn-${bi}" hidden></p>`}
      <div class="sg head${nr?' norir':''}"><span data-tip="Tap a set's number to mark it a warm-up or a drop set.">#</span><span class="lsh">Last</span><span class="lh" data-tip="${esc('Load: '+loadWords(ex))}">${loadHead(ex)}</span><span>${ex.timed?(ex.perSide?'Sec/side':'Sec'):ex.perSide?'Reps/side':'Reps'}</span>${nr?'':`<span>${effWord()}</span>`}<span>Done</span></div>`;
    b.sets.forEach((s,si)=>{
      const g=greyR(b,si);const ph=g==null?'':g;
      const pr=s.done?livePR(b.exId,s,d.date):null;
      const wn=b.sets.slice(0,si+1).filter(x=>!x.warm&&!x.drop).length;
      // Last time's set for this row, beside this time's (r44, V): working sets only, by their order.
      const lt=s.warm||s.drop?'':lastCell(b,wn-1,dupB);
      h+=`<div class="sg${nr?' norir':''} ${s.done?'done':''}${pr?' pr':''}"${pr?` data-pr="${pr}"`:''}><button class="n wbtn${s.drop?' drop':s.warm?' warm':''}" aria-label="Set ${si+1} type: ${s.warm?'warm-up':s.drop?'drop set':'working set'}. Tap to change" data-act="sWarm" data-b="${bi}" data-s="${si}">${s.drop?'↓':s.warm?'W':wn}</button><span class="ls" aria-label="${lt?esc('Last time '+lt):'No set last time'}">${lt?esc(lt).replace('×','<wbr>×'):'–'}</span>
        <input type="text" inputmode="decimal" enterkeyhint="next" aria-label="${esc(ex.name)}, set ${si+1} load" data-f="w" data-b="${bi}" data-s="${si}" value="${loadIn(ex,s.w)}" placeholder="${(()=>{const g=s.w==null?greyW(b,si):null;return g!=null?loadIn(ex,g):ex.bw?'0':'';})()}">
        <input type="text" inputmode="numeric" enterkeyhint="next" aria-label="${esc(ex.name)}, set ${si+1} ${ex.timed?'seconds':'reps'}${ex.perSide?' per side':''}" data-f="r" data-b="${bi}" data-s="${si}" value="${s.r==null?'':s.r}" placeholder="${ph}">
        ${nr?'':rirSelect(s.rir,bi,si,p.rir)}
        <button class="cbtn ${s.done?'on':''}" aria-label="Set ${si+1} done" aria-pressed="${s.done?'true':'false'}" data-act="sDone" data-b="${bi}" data-s="${si}">✓</button></div>`;
    });
    h+=adjLine(b,bi);
    if(platesMode(ex)!=='none')h+=`<p class="small muted" id="pl-${bi}" style="margin:6px 0 0">${esc(plateLine(b))}</p>`;
    // Copy last reps used to be hidden whenever the suggestion was "add load",
    // which is exactly the session where prefilled reps save the most typing.
    const canFill=b.lastR&&b.lastR.some(r=>r!=null)&&b.sets.some((s,i)=>!s.done&&!s.warm&&!s.drop&&s.r==null&&lastRFor(b,i)!=null);
    h+=`<div class="row" style="margin-top:8px">${canFill?`<button class="btn sm" data-act="fillLast" data-b="${bi}" aria-label="Copy last session's reps" data-tip="Fill empty rows with last session's reps.">Copy last</button>`:''}<button class="btn sm" data-act="sAdd" data-b="${bi}" aria-label="Add a set" data-tip="Add a working set at the last load.">+ Set</button><button class="btn sm" data-act="sDel" data-b="${bi}" aria-label="Remove a set" data-tip="Removes the last set not yet done." ${b.sets.length?'':'disabled'}>− Set</button>${!ex.timed&&b.sets.some(x=>x.done&&!x.warm&&!x.drop)?`<button class="btn sm" data-act="dropAdd" data-b="${bi}" aria-label="Add a drop set" data-tip="About 75% of the last working load, in your steps. Counts as half a set and never sets a target.">+ Drop</button>`:''}${state.settings.timerMode!=='off'&&+p.rest>0&&!d.past?`<button class="btn sm rest" data-act="tStart" data-b="${bi}" aria-label="Start a ${p.rest} second rest" data-tip="Start the rest timer.">⏱ ${p.rest}s</button>`:''}</div></section>`;
  });
  h+=`<div class="row"><button class="btn" style="flex:1" data-act="pickSession">+ Add exercise</button>${d.editingId?'':'<button class="btn" data-act="pickEx">Pick for me</button>'}</div>`;
  if(!d.editingId)h+=cardioDraftCard(d);
  h+=`<label class="field" style="margin-top:12px">Notes<textarea data-bind="draftNotes">${esc(d.notes||'')}</textarea></label>
  <div class="row fin-row" style="margin-top:12px"><button class="btn danger" data-act="discard">${d.editingId?'Cancel edit':'Discard'}</button><button class="btn primary" style="flex:1" data-act="finish" data-tip="Only sets marked done are saved; you are asked about any with reps but no checkmark.">${d.editingId?'Save changes':'Finish and save'}</button></div>`;
  return h;
}

/* Bodyweight, asked once in the first session with a bodyweight lift when
   none is logged (r32, from the third review: pull-ups and leg raises added
   nothing to weight lifted, and had no estimate, with no weigh-in). Saved
   like a weigh-in on Today; Not now is kept per device. */
const BWASK_KEY=KEY+'.bwAsk';
const BWSNOOZE_KEY=KEY+'.bwSnooze';
function bwEvery(){const v=state.settings.bwEvery;return v===0||v===7||v===30?v:14;}
function bwLast(){let b=null;for(const x of state.bodyweights)if(!b||x.date>b.date)b=x;return b;}
function bwDueCard(){
  const n=bwEvery();if(!n||noLog())return '';const last=bwLast();const ago=last?daysBetween(last.date,today()):null;
  if(last&&ago<n)return '';
  /* Never weighed in: only for someone who logs bodyweight lifts, where it
     changes the numbers (r34.2, from the review: it asked every 2 days of a
     lifter who skipped the optional weigh-in and does none). */
  if(!last&&!state.sessions.some(x=>!x.demo&&x.ex.some(b=>{const e=EX(b.exId);return e&&e.bw;})))return '';
  try{const z=localStorage.getItem(BWSNOOZE_KEY);if(z&&z>today())return '';}catch(e){/* show it */}
  return `<div class="card" id="bwDue"><p class="small" style="margin:0 0 8px"><b>Weigh-in due.</b> ${last?`Last ${fmtW(last.kg)} ${U()}, ${ago} days ago.`:'Pull-ups, dips, and push-ups count it.'} ${tipi('Bodyweight lifts use your latest weigh-in for weight lifted and estimates. How often to ask is in Settings > General.','About weigh-ins')}</p>
  <div class="row"><label class="field" style="flex:1;margin:0"><span class="vh">Bodyweight (${U()})</span><input type="text" inputmode="decimal" id="bwDueVal" placeholder="${last?fmtW(last.kg):`Weight (${U()})`}"${last?` data-grey="${fmtW(last.kg)}"`:''} aria-label="Bodyweight (${U()})" enterkeyhint="done"></label><button class="btn sm primary" data-act="addBW" data-in="bwDueVal">Save</button><button class="btn sm" data-act="bwLater">Later</button></div></div>`;
}
function bwAskCard(d){
  if(d.editingId||d.past||state.bodyweights.length||!d.ex.some(b=>EX(b.exId).bw))return '';
  try{if(localStorage.getItem(BWASK_KEY))return '';}catch(e){return '';}
  return `<div class="card" id="bwAsk"><p class="small" style="margin:0 0 8px"><b>Your bodyweight</b> counts in bodyweight lifts, for weight lifted and estimates. ${tipi('Logged as a weigh-in for today. Add more on Today, under Body.','About bodyweight')}</p>
  <div class="row"><label class="field" style="flex:1;margin:0"><span class="vh">Bodyweight (${U()})</span><input type="text" inputmode="decimal" id="bwVal" placeholder="Weight (${U()})" aria-label="Bodyweight (${U()})"></label><button class="btn sm primary" data-act="addBW">Save</button><button class="btn sm" data-act="bwAskNo">Not now</button></div></div>`;
}
/* The first session no longer asks grey or filled in (r35, V: two systems for
   one thing, and a card asking which). Loads are grey; Settings > Rest timer
   and logging > Fill in suggested loads still fills them for anyone who wants. */
/* The first machine, cable or Smith exercise in a session is offered a
   calibration set when none was done in the last 3 weeks, RIR is on, and
   you have at least 3 real sessions. Not now waits another 3 weeks. */
function calDueIdx(d){
  if(state.settings.rirMode==='off')return -1;
  if(state.sessions.filter(s=>!s.demo).length<3)return -1;
  const cut=addDays(today(),-21);
  if(state.settings.calSnooze&&state.settings.calSnooze>cut)return -1;
  const c=calStats();if(c.lastDate&&c.lastDate>cut)return -1;
  if(d.ex.some(b=>b.sets.some(x=>x.cal)))return -1;
  // Not on a day meant to be easy (r31): a deload, a lighter day, or two or more low check-in answers.
  if(d.deload||d.light||d.past||(d.chk&&['sleep','energy','joints'].filter(k=>d.chk[k]===1).length>=2))return -1;
  // Nor on a lift's first session back after weeks off (r34.2): a set to failure is the last thing it needs.
  return d.ex.findIndex(b=>{const ex=EX(b.exId);return !ex.timed&&['machine','cable','smith'].includes(ex.equip)&&!b.inj&&!b.light&&daysOff(b.exId)<=BACK_DAYS;});
}
