/* ---------- PROGRAM ---------- */
function viewProgram(){
  if(!ui.bRoutine||!state.routines.find(r=>r.id===ui.bRoutine))ui.bRoutine=state.activeRoutineId;
  const R=state.routines.find(r=>r.id===ui.bRoutine);const isActive=R.id===state.activeRoutineId;
  if(ui.bTarget>=R.days.length)ui.bTarget=0;
  const totSets=R.days.reduce((a,d)=>a+(d.rest?0:daySets(d)),0);const weekly=R.schedule==='weekly';
  let h=pageHead(isActive?'Active routine':'Not active',`Plan`,(trainDaysOf(R)?`<b>${esc(R.name)}</b> · ${trainDaysOf(R)} training days${weekly?' a week':` in a ${R.days.length}-day cycle`} · ${weekly?totSets:Math.round(totSets*weekFactor(R))} planned sets a week`:`<b>${esc(R.name)}</b> · ${weekly?'fixed weekdays':`${R.days.length}-day cycle`} · no exercises yet`),helpBtn('plan'))
  +helpText('plan','Drag the ⠿ handle to reorder or move exercises between days; the arrows and "Move to" do the same. Tap an exercise to edit sets, reps, RIR, rest, and load increment, or to superset it with the next exercise. The library button manages every exercise, including your own. In a numbered cycle, drag a day by the ⠿ beside its number to reorder days (or focus the ⠿ and use the arrow keys); they renumber from their new position. On every tab, the ⠿ beside a section title moves that section, and the order is remembered.');
  /* The library is one of the app's best parts (V, r28), so it gets a full
     width button of its own instead of a small one beside the ?. */
  h+=`<button type="button" class="libbtn" data-act="planLib"><span class="lb-i" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="10" width="3" height="4" rx="1"/><rect x="6" y="7" width="3" height="10" rx="1.2"/><rect x="15" y="7" width="3" height="10" rx="1.2"/><rect x="18" y="10" width="3" height="4" rx="1"/><rect x="9" y="11" width="6" height="2"/></svg></span><span class="lb-t"><b>Exercise library</b></span><span class="lb-c" aria-hidden="true">›</span></button>`;

  h+=sec({sk:'program:routine',key:'routine',title:'Routine',sub:esc(R.name),body:`<div class="stack">
    <label class="field">Routine<select data-bind="bRoutine">${state.routines.map(r=>`<option value="${r.id}" ${r.id===R.id?'selected':''}>${esc(r.name)}${r.id===state.activeRoutineId?' (active)':''}${r.days.every(d=>!d.items.length)?' (empty)':''}</option>`).join('')}</select></label>
    <label class="field">Name<input type="text" data-bind="routineName" value="${esc(R.name)}"></label>
    <div class="row">${isActive?'<span class="pill green">Active routine</span>':'<button class="btn sm primary" data-act="rActive">Make active</button>'}
      <button class="btn sm" data-act="rNew">New blank</button><button class="btn sm" data-act="rTemplate">New from a template</button><button class="btn sm" data-act="rDup">Duplicate</button><button class="btn sm danger" data-act="rDel" ${state.routines.length<2?'disabled':''}>Delete</button></div></div>`});
  h+=(()=>{const c=routineClutter();return c.length?`<div class="callout yellow" style="margin:10px 0"><p style="margin:0 0 8px">${c.length} routine${c.length>1?'s are':' is'} empty or an exact duplicate, with no logged sessions: ${c.map(r=>esc(r.name)+(routineEmpty(r)?' (empty)':' (duplicate)')).join(', ')}.</p><button class="btn sm" data-act="rClean">Remove ${c.length>1?'them':'it'}</button></div>`:'';})();
  h+=sec({sk:'program:library',key:'library',title:'Add exercises',sub:'',body:`<div class="grid2"><input type="search" placeholder="Search" aria-label="Search exercises" data-bind="bLibQ" value="${esc(ui.bLibQ)}"><select data-bind="bLibM" aria-label="Muscle"><option value="">All muscles</option>${MUSCLES.map(([k,l])=>`<option value="${k}" ${ui.bLibM===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <label class="field" style="margin-top:8px">+ adds to<select data-bind="bTarget">${R.days.map((d,i)=>`<option value="${i}" ${i===ui.bTarget?'selected':''}>${dayLabel(R,i)}: ${esc(d.name)}</option>`).join('')}</select></label>
    <div class="lib-panel"><ul class="lib" id="bLib">${bLibItems()}</ul></div>`});
  h+=sec({sk:'program:schedule',key:'schedule',title:'Schedule',sub:weekly?'Fixed weekdays':'Numbered cycle',body:`<div class="stack"><label class="field">Schedule<select data-bind="rSchedule">
    <option value="cycle" ${!weekly?'selected':''}>Numbered cycle: Day 1, 2, 3… in order</option>
    <option value="weekly" ${weekly?'selected':''}>Fixed weekdays: Monday to Sunday</option></select></label>
    <p class="small muted hastip" style="margin:0" data-tip="${esc(weekly?'Each day is pinned to a weekday and Today opens on the calendar day.':`The cycle runs in order whatever the calendar says. Today opens on the day after your last session, so a missed workout waits instead of being skipped. Weekly numbers count each cycle day, rest days included, as one calendar day. 1 to ${MAX_DAYS} days.`)}">How this works</p></div>`});
  /* Days: inside it each day folds on its own chevron
     and, in a numbered cycle, drags by its ⠿ handle; labels renumber from
     position, so a day dragged to second place becomes Day 2. */
  // The weekly count is in the header; a cycle of other than 7 days says its own count here (r34.2: 88 sets said three times).
  let db=`${!weekly&&R.days.length!==7?`<p class="muted small" style="margin:0 0 4px">${totSets} sets a ${R.days.length}-day cycle ${tipi('Drag the ⠿ beside a day number to reorder days; they renumber from their new position.','About days')}</p>`:''}<div id="dayList">`;
  const dnd=!!(window.__libs&&window.__libs.sortable);
  /* One day open at a time. With every day open the tab ran to several
     screens of exercises; now each closed day is one line with its totals,
     and opening a day closes the others and makes it where + adds to. */
  const focus=dayFocusId(R);
  R.days.forEach((d,di)=>{
    fixSupersets(d.items);
    const dOpen=d.id===focus;
    db+=`<section class="day ${d.rest?'rest':''}" data-did="${esc(d.id)}"><div class="dh">${weekly?'':`<span class="dgrip" role="button" tabindex="0" data-di="${di}" aria-label="Move ${esc(dayLabel(R,di))}: drag, or use the arrow keys" data-tip="Drag to reorder days">⠿</span>`}<span class="dlabel">${dayLabel(R,di)}</span><input type="text" aria-label="Day name" data-dayname="${di}" value="${esc(d.name)}"><button class="ib dfold" data-act="dFold" data-id="${esc(d.id)}" aria-expanded="${dOpen}" aria-label="${dOpen?'Fold':'Unfold'} ${esc(dayLabel(R,di))}"></button></div>
    <div class="dmeta row spread"><span>${d.rest?'':`${d.items.length} exercises, ${daySets(d)} sets, ${minTxt(dayMinutes(d))}`}</span><label class="check-inline"><input type="checkbox" data-dayrest="${di}" ${d.rest?'checked':''}>Rest day</label></div><div class="dbody" ${dOpen?'':'hidden'}>${sessionCapNote(d)}
    <ul class="items" data-day="${di}">${d.items.map((it,ii)=>itemHTML(R,di,it,ii)).join('')}</ul>
    <div class="row" style="padding:0 10px 12px"><button class="btn sm" data-act="pickDay" data-day="${di}">Add exercise</button>${weekly?'':`${dnd?'':`<button class="btn sm" data-act="dUp" data-day="${di}" ${di===0?'disabled':''} aria-label="Move ${dayLabel(R,di)} earlier">↑ Day</button><button class="btn sm" data-act="dDown" data-day="${di}" ${di===R.days.length-1?'disabled':''} aria-label="Move ${dayLabel(R,di)} later">↓ Day</button>`}<button class="btn sm danger" data-act="dDel" data-day="${di}" ${R.days.length<2?'disabled':''}>Remove day</button>`}</div></div></section>`;
  });
  db+='</div>';
  if(!weekly)db+=`<div class="row" style="margin-top:10px"><button class="btn sm" data-act="dAdd" ${R.days.length>=MAX_DAYS?'disabled':''}>+ Training day</button><button class="btn sm" data-act="dAddRest" ${R.days.length>=MAX_DAYS?'disabled':''}>+ Rest day</button></div>`;
  h+=sec({sk:'program:days',key:'days',title:'Days',sub:`${R.days.length} day${R.days.length===1?'':'s'}`,body:db});
  const pv=plannedSets(R);const bands=state.settings.bands;const pUnder=MK.filter(m=>!TRACK_ONLY.has(m)&&belowMin(pv[m],bands[m][0])).length;
  h+=sec({sk:'program:pvol',key:'pvol',title:'Weekly volume',sub:pUnder?`<span class="pill yellow">${pUnder} under target</span>`:'<span class="pill green">all on target</span>',help:'pvol',helpBody:`Hard sets per muscle this routine plans for a week${weekly?'':`, scaled from a ${R.days.length}-day cycle to 7 days`}. Direct work counts 1 set, secondary involvement counts 0.5. The shaded zone is your weekly target (editable in Settings).`,body:volumeRows(pv)+planEvidenceNote(pv)});
  h+=moreLine('program');
  return h;
}
/* The open day: the one picked last, else the day + adds to, else the first
   training day. An empty string means the user closed them all. */
function dayFocusId(R){
  if(typeof ui.dayFocus==='string'&&(ui.dayFocus===''||R.days.some(d=>d.id===ui.dayFocus)))return ui.dayFocus;
  const t=R.days[ui.bTarget];if(t)return t.id;
  const f=R.days.find(d=>!d.rest)||R.days[0];return f?f.id:'';
}
function itemHTML(R,di,it,ii){
  const ex=EX(it.exId);const open=ui.openItem===it.uid;
  const items=R.days[di].items;const nx=items[ii+1];const letters=ssLetters(items);
  const linked=!!(it.ss&&nx&&nx.ss===it.ss);
  return `<li class="it${it.ss?' ss':''}" data-uid="${it.uid}"><div class="ir"><span class="grip" aria-hidden="true">⠿</span><button class="imain" data-act="toggleItem" data-uid="${it.uid}"><b>${esc(ex.name)}</b><span>${it.sets} × ${repSpan(it.repMin,it.repMax,'-')}${ex.timed?'s':''}, ${rirShow(ex)?`${effTgt(it.rir)}, `:''}rest ${it.rest}s${it.ss?` · superset ${letters[it.ss]}`:''}</span></button><button class="ib" aria-label="Move ${esc(ex.name)} up" data-act="iUp" data-day="${di}" data-i="${ii}"${ii===0?' disabled':''}>↑</button><button class="ib" aria-label="Move ${esc(ex.name)} down" data-act="iDown" data-day="${di}" data-i="${ii}"${ii===items.length-1?' disabled':''}>↓</button></div>
  ${open?`<div class="ied"><div class="grid3">
    <label class="field">Sets<input type="text" inputmode="numeric" data-it="sets" data-uid="${it.uid}" value="${it.sets}"></label>
    <label class="field">${ex.timed?'Min seconds':'Rep min'}<input type="text" inputmode="numeric" data-it="repMin" data-uid="${it.uid}" value="${it.repMin}"></label>
    <label class="field">${ex.timed?'Max seconds':'Rep max'}<input type="text" inputmode="numeric" data-it="repMax" data-uid="${it.uid}" value="${it.repMax}"></label>
    <label class="field"><span class="hastip" data-tip="${esc(RIR_TGT_TIP)}">Target RIR</span><input type="text" inputmode="decimal" data-it="rir" data-uid="${it.uid}" value="${it.rir}"></label>
    <label class="field">Rest (s)<input type="text" inputmode="numeric" data-it="rest" data-uid="${it.uid}" value="${it.rest}"></label>
    <label class="field">Load step (${U()})<input type="text" inputmode="decimal" data-it="inc" data-uid="${it.uid}" value="${fmtW(incOf(ex,it))}" data-tip="Applies to this exercise on every day and routine"></label>
    ${ex.timed?'':`<label class="field"><span class="hastip" data-tip="${esc(JUMP_TIP)}">Load jump %</span><input type="text" inputmode="decimal" data-it="jump" data-uid="${it.uid}" value="${it.jump!=null?it.jump:''}" placeholder="auto ${isCompound(ex)?'2.5':'5'}"></label>`}</div>
    <div class="row" style="margin-top:8px"><label class="field" style="flex:1">Move to<select data-moveto="${it.uid}" data-day="${di}">${R.days.map((d,i)=>`<option value="${i}" ${i===di?'selected':''}>${dayLabel(R,i)}: ${esc(d.name)}</option>`).join('')}</select></label>
    <button class="btn sm" data-act="iSwap" data-uid="${it.uid}" style="align-self:flex-end">Swap</button><button class="btn sm danger" data-act="iDel" data-day="${di}" data-i="${ii}" style="align-self:flex-end">Remove</button></div>
    ${nx?`<div class="row" style="margin-top:8px"><button class="btn sm ${linked?'noted':''}" data-act="ssToggle" data-uid="${it.uid}">${linked?'Unlink superset':'Superset with next'}</button>${linked?`<span class="small muted">Paired with ${esc(exName(nx.exId))}: alternate sets, rest once after the pair.</span>`:''}</div>`:''}
    ${ex.note?`<p class="small muted">${esc(ex.note)}</p>`:''}</div>`:''}</li>`;
}
function bLibItems(){return commonFirst(libFiltered(ui.bLibQ,ui.bLibM,'',false)).map(e=>`<li class="it" data-ex="${e.id}"><div class="ir"><span class="grip" aria-hidden="true">⠿</span><div class="imain"><b>${esc(e.name)}</b><span>${esc(ML[e.primary])}, ${esc(EQL[e.equip]||e.equip)}${isCommon(e)?', common':e.rare?', less common':''}</span></div><button class="ib" aria-label="Add ${esc(e.name)}" data-act="libAdd" data-ex="${e.id}">+</button></div></li>`).join('');}
const commonFirst=list=>[...list.filter(isCommon),...list.filter(e=>!isCommon(e))];
/* Search by words, ignoring hyphens, spaces and case (r31): "t bar row" and
   "tbar" did not find Landmine T-Bar Row, so it looked missing. */
function nameMatch(name,q){const ws=String(q||'').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);if(!ws.length)return true;const n=String(name||'').toLowerCase().replace(/[^a-z0-9]/g,'');return ws.every(w=>n.includes(w));}
function libFiltered(q,m,e,kind){
  q=(q||'').toLowerCase().trim();
  return state.exercises.filter(x=>!x.archived&&(!q||nameMatch(x.name,q))&&(!m||x.primary===m||x.secondary.includes(m))&&(!e||x.equip===e)&&(!kind||(kind==='rare'?x.rare:isCommon(x)))).sort((a,b)=>a.name.localeCompare(b.name));
}
/* soFar: this week while it is still going, so short of the minimum is
   under way (pale green), not amber (r29). */
function volumeRows(sets,conf,soFar){
  const bands=state.settings.bands;
  const maxScale=Math.max(24,...MK.map(m=>Math.max(sets[m]||0,bands[m][1]+2)));
  const hasConf=!!conf;
  const head=hasConf?`<div class="legend"><span><i style="background:var(--ink);opacity:.55"></i>RIR logged</span><span><i style="background:var(--green);opacity:.34"></i>assumed hard (RIR blank)</span></div>`:'';
  return head+MK.map(m=>{
    const v=sets[m]||0;const[lo,hi]=bands[m];const tr=TRACK_ONLY.has(m);const lowV=belowMin(v,lo);const zero=!tr&&v<=0&&(soFar||lo<=0);
    // No sets is none, as on the map (r29): never green, and not yet this
    // week rather than under way. On an average with a minimum it is below.
    const cls=tr?'track':zero?'none':lowV?(soFar?'part':'under'):aboveMax(v,hi)?'over':'in';
    const plate=tr||zero?'none':lowV?(soFar?'part':'yellow'):aboveMax(v,hi)?'blue':'green';
    const c=hasConf?Math.min(conf[m]||0,v):0;
    const tip=` data-tip="${esc(ML[m])}: ${r1(v)} hard sets${hasConf?`, ${r1(c)} with RIR logged, ${r1(v-c)} assumed`:''}. ${tr?'Tracked only: no study sets a weekly dose for it.':`Target ${lo} to ${hi}; the upper number is typical, not a ceiling.`}"`;
    return `<div class="mrow"><span class="plate ${plate}"></span><span>${ML[m]}</span><div class="band"${tip}>${tr?'':`<div class="zone" style="left:${lo/maxScale*100}%;width:${(hi-lo)/maxScale*100}%"></div>`}<div class="fill ${cls}${hasConf?' ghost':''}" style="width:${Math.min(100,v/maxScale*100)}%"></div>${hasConf&&c>0?`<div class="fill conf" style="width:${Math.min(100,c/maxScale*100)}%"></div>`:''}</div><span class="r num">${r1(v)}<span class="muted small">${tr?' tracked':` /${lo}-${hi}`}</span></span></div>`;
  }).join('');
}

/* ---------- LIBRARY ---------- */
function viewLibrary(){
  return pageHead('Plan','Exercise library',`${state.exercises.filter(e=>!e.archived).length} exercises, all editable`,`<button class="btn sm" data-act="planBack">← Plan</button><button class="btn sm primary" data-act="exNew">New exercise</button>`)+`
  <div class="card stack"><input type="search" placeholder="Search exercises" aria-label="Search exercises" data-bind="libQ" value="${esc(ui.libQ)}">
  <div class="grid2"><select data-bind="libM" aria-label="Filter by muscle"><option value="">All muscles</option>${MUSCLES.map(([k,l])=>`<option value="${k}" ${ui.libM===k?'selected':''}>${l}</option>`).join('')}</select>
  <select data-bind="libE" aria-label="Filter by equipment"><option value="">All equipment</option>${EQUIP.map(([k,l])=>`<option value="${k}" ${ui.libE===k?'selected':''}>${l}</option>`).join('')}</select></div>
  <div class="row" style="gap:6px;align-items:center"><div class="chips" role="group" aria-label="Show">${[['','All'],['common','Most common'],['rare','Less common']].map(([k,l])=>`<button class="chip ${ui.libKind===k?'on':''}" data-act="libKind" data-v="${k}" aria-pressed="${ui.libKind===k}">${l}</button>`).join('')}</div>${tipi(COMMON_TIP,'About Most common and Less common')}</div></div>
  <div id="libList">${libCards()}</div>`;
}
function libCards(){
  const list=libFiltered(ui.libQ,ui.libM,ui.libE,ui.libKind);
  if(!list.length)return '<div class="card"><p style="margin:0">No exercises match. Clear the filters or create a new exercise.</p></div>';
  return `<div class="card">${list.map(e=>`<div class="hitem"><div class="row spread" style="align-items:flex-start;flex-wrap:nowrap"><div style="min-width:0"><b>${esc(e.name)}</b>${e.note?` ${tipi(e.note,'About '+e.name)}`:''}<p class="small muted" style="margin:2px 0 0">${esc(ML[e.primary])}${e.secondary.length?', plus '+e.secondary.map(m=>ML[m]).join(', '):''}</p></div><div class="row" style="flex:none;gap:4px"><button class="btn sm" data-act="exEdit" data-ex="${e.id}">Edit</button><button class="ib sm" data-act="exDel" data-ex="${e.id}" aria-label="Delete ${esc(e.name)}">✕</button></div></div>
    <p class="small" style="margin:6px 0 0;display:flex;flex-wrap:wrap;gap:4px">${exTags(e,ui.libKind)}<span class="tag">${esc(EQL[e.equip]||e.equip)}</span>${e.custom?'<span class="tag blue">Custom</span>':''}${e.bw?'<span class="tag">Bodyweight + load</span>':''}<span class="tag">${esc(loadWords(e))}</span>${e.perSide?'<span class="tag">Reps per side</span>':''}${e.timed?'<span class="tag">Timed</span>':''}${e.maxLoad!=null?`<span class="tag">Max ${fmtW(e.maxLoad)} ${U()}</span>`:''}</p></div>`).join('')}</div>`;
}

/* ---------- LIFT GOALS (r38, item 188) ----------
   A goal is a load for a number of reps (225 x 5), as lifters say it. Where it
   stands: reached when a working set matched it (that load or more, those reps
   or more); otherwise the best estimate from the last 12 weeks against what the
   goal takes done to failure, by the same estimate the targets use (fitE), so
   a goal at any reps compares with sets at any reps. No date to reach it
   (r41, V: guide, do not predict); on a lift whose estimate is a load
   anyone lifts, the gap is said as a load as well. */
/* What to do next on this lift, the same target its next session shows
   (r41, V: guide how to progress rather than predict where it lands). */
function nextLine(exId){
  // EX() reads a deleted exercise as archived, so this covers both.
  if(EX(exId).archived)return '';
  // The plan of the next day due that has this lift: one lift on a heavy and a light day has two targets (review of r41).
  const R=activeRoutine();const d=nextDayWith(exId,R);
  const sg=suggest(exId,d?planFor(exId,R,d.id):planFor(exId,R),{deload:isDeloadWeek()});
  return sg&&sg.target?`<p class="small" id="nextLine" style="margin:6px 0 0"><b>Next session</b>: ${esc(sg.target)}</p>`:'';
}
/* The next training day due that has the lift, or null: on a weekly plan
   today's weekday, or tomorrow's once today's day is logged (review of r41:
   a Monday heavy day done still showed Monday's target over Thursday's);
   on a cycle the cycle's next day, which already counts what is logged. */
function nextDayWith(exId,R){
  const n=R.days.length;if(!n)return null;
  let start;
  if(R.schedule==='weekly'){const wd=(new Date().getDay()+6)%7;start=state.sessions.some(x=>x.date===today()&&x.routineId===R.id&&sessDayIdx(R,x)===wd)?(wd+1)%n:wd;}
  else start=cycleState(R).next;
  for(let k=0;k<n;k++){const d=R.days[(start+k)%n];if(d&&!d.rest&&d.items.some(it=>it.exId===exId))return d;}
  return null;
}
function goalOk(ex){return !!ex&&!ex.timed&&!ex.assist;}
function goalState(exId){
  const ex=EX(exId);const g=ex&&ex.goal;if(!g||!goalOk(ex))return null;
  const I=IDX();const exps=I.byEx[exId]||[];const bw=bwRefLoad(ex);
  // With no weigh-in a bodyweight lift has no load to compare: say so rather than a number read from the added load alone (the review of r40).
  const noBw=!!ex.bw&&!(bwRef()>0);
  let hit=null;for(const x of exps){if(x.pts.some(p=>p.w>=g.w-1e-6&&p.r>=g.r)){hit=x.date;break;}}
  const need=fitE(g.w+bw,g.r,0);const from=addDays(today(),-84);
  let cur=null;for(const x of exps){if(x.date<from||x.deload||x.light)continue;for(const p of x.pts){const v=fitE(p.load,p.r,p.rq);if(v!=null&&(cur==null||v>cur))cur=v;}}
  const pct=!noBw&&need&&cur?Math.min(100,cur/need*100):null;
  return {g,hit,pct,cur,need,noBw};
}
/* The load still to add for the goal's reps: the goal's load less what the
   best estimate says is possible for those reps now (e1inv, the inverse of
   the estimate). The gap between the two estimates themselves overstated it
   by up to two thirds (review of r41: 35 lb shown for a 26 lb gap). */
function goalGap(s){return s.g.w-e1inv(s.cur,s.g.r);}
function goalWords(ex,g){return `${loadLabel(ex,g.w)}${ex.bw?'':' '+U()}${loadNote(ex)} × ${g.r}`;}
function goalLine(exId){
  const ex=EX(exId);if(!goalOk(ex))return '';
  if(!ex.goal)return `<p class="small" style="margin:6px 0 0"><button class="linkbtn tall" data-act="goalOpen" data-ex="${esc(exId)}">Set a goal</button></p>`;
  const s=goalState(exId);const gw=goalWords(ex,ex.goal);
  const what=s.hit?`reached ${fmtDate(s.hit)}`:s.noBw?'add a weigh-in to see how close':s.pct==null?'no sets in the last 12 weeks':s.pct>=100?'within reach':`${Math.floor(s.pct)}% there${estInLoad(ex)&&+fmtE(goalGap(s))>0?`, about ${fmtE(goalGap(s))} ${U()} to go`:''}`;
  const tip=s.hit?'Reached: a working set at that load or more, for those reps or more.':s.pct!=null&&s.pct>=100?`Your best estimate from the last 12 weeks says ${gw} done to failure is in you now. It counts as reached once a working set matches it.`:`Your best estimate from the last 12 weeks against what ${gw} takes done to failure. Your session targets are the steps toward it.`;
  return `<p class="small" id="goalLine" style="margin:6px 0 0"><b>Goal ${esc(gw)}</b>: ${esc(what)} ${tipi(tip,'About this goal')} <button class="linkbtn tall" data-act="goalOpen" data-ex="${esc(exId)}">Change</button></p>`;
}
/* ---------- DASHBOARD ---------- */
function viewDash(){
  const I=IDX();const R=activeRoutine();
  /* Adherence counts only days the routine actually plans work on: a non-rest
     day with no exercises in it used to inflate the denominator. Each week is
     capped at its own planned days, so training seven days against a six-day
     routine no longer reports 117%. The window is the four completed weeks
     before this one, which the label now says out loud. */
  const planned=freeMode()?0:trainDaysOf(R)*weekFactor(R);
  const cur=weekStart(today());
  const sessDates=new Set(state.sessions.map(s=>s.date));
  /* Only weeks since your first session count. Before that there was nothing
     to adhere to, and counting those weeks read 0% on day one. */
  const firstWk=firstFullWeek();
  let done4=0,wks4=0,need4=0;
  for(let k=1;k<=4;k++){
    const ws=addDays(cur,-7*k);if(!firstWk||ws<firstWk)break;if(isRestWeek(ws))continue;let n=0;wks4++;
    // Sessions, as the ring, This week, and the streak count them (r46: distinct days read a two-a-day as one).
    n=weekSessions(ws);
    const wr=weekRoutine(ws);const nw=trainDaysOf(wr)*weekFactor(wr);done4+=Math.min(n,nw);need4+=nw;
  }
  const adher=planned&&wks4&&need4>0?Math.round(done4/need4*100):null;
  const thisWeek=I.weekSets[cur]||{};
  const thisWeekConf=I.weekConf[cur]||{};
  // Each set once, as on Today. Summing the per-muscle counts double counts
  // secondary work (a bench set is 1 chest + 0.5 triceps + 0.5 delts).
  const wkHard=weekStats().got;
  const stalled=Object.entries(I.exStats).filter(([,s])=>s.stalled);
  // How much of the last 4 weeks of volume is measured rather than assumed.
  const rc=I.rirCov;const covPct=rc.total&&state.settings.rirMode!=='off'?Math.round(rc.logged/rc.total*100):null;
  // Only said when it matters: under 70% of recent sets carry an RIR.
  const cov=covPct==null||covPct>=70?'':`<p class="small muted hastip" style="margin:0 0 12px" data-tip="A blank RIR is read as your usual RIR on that lift once you have rated 3 of its sets in 12 weeks, else the set counts as hard. The lighter shading shows those sets.">RIR on ${covPct}% of recent sets. The lighter part of each bar is assumed.</p>`;
  let h=pageHead('','Stats',noLog()?'Nothing logged yet':`${state.sessions.length} session${state.sessions.length===1?'':'s'} logged${state.sessions.length?`, since ${fmtDate(sortedSessions()[0].date)}`:''}`,helpBtn('stats'))+`${helpText('stats','Everything here is calculated from your logged sets: performance trends, not direct measurements of muscle size. Tap a section title to open or fold it. Inside each section, How this works says what its numbers mean.')}
  <nav class="jump" aria-label="Stats sections">${orderKeys(state.settings.secOrder.dash||[],DSEC_KEYS).filter(k=>!state.settings.hidden.includes('dash:'+k)).map(k=>DSECS.find(x=>x[0]===k)).map(([k,l])=>`<button class="chip" data-act="dashJump" data-sec="${k}">${l}</button>`).join('')}</nav>`;
  if(!state.sessions.length){
    h+=`<div class="card"><p style="margin:0"><b>No sessions yet.</b> Trends start after a few sessions. ${tipi('Trends, stall detection, and rankings need a few sessions of each exercise. To preview the full Stats page, load demo data in Settings.','About Stats')}</p></div>`;
  }
  /* The tiles count what was done (V, 2026-10-13: less anchoring on the
     plan): sessions and PRs in the last 28 days, with the 28 before when the
     log reaches back that far, so month on month reads at a glance.
     Adherence stays in Consistency, hard sets against the plan in Volume and
     This week. PRs are the ones Recent PRs lists (big). */
  const R4=recent4w();const sess4=R4.sess,sessP=R4.sessP,prs4=R4.prs.length,prsP=R4.prsP;
  const was=n=>R4.back?` (${n} in the 4 weeks before)`:'';
  h+=`<div class="kpis"><div class="kpi"><div class="v">${nz(sess4)}</div><div class="l">Sessions, last 4 weeks${was(sessP)}</div></div>
  <div class="kpi"><div class="v">${nz(prs4)}</div><div class="l">PRs, last 4 weeks${was(prsP)}</div></div>
${extraKpis()}</div>`;
  if(state.sessions.length)h+=dashSummary();
/*ai{*/  if(aiOn()&&state.sessions.some(x=>!x.demo))h+=`<div class="card row spread"><span class="small">Ask Claude a question about your own log: a stall, a split, a weak point.</span><button class="btn sm primary" data-act="aiReview">Ask Claude</button></div>`;/*}ai=*/

  const avg=actualAvg4();const plan=plannedSets(R);const bands=state.settings.bands;

  // volume: five ways to read the same hard-set counts, plus tonnage
  h+=dsec('volume','Volume','Hard sets per muscle. Direct work counts 1, secondary counts 0.5. A set counts as hard when you logged RIR 3 or less. A blank RIR is read as your usual RIR on that lift once you have rated 3 of its sets in the last 12 weeks, and until then counts as hard, because most working sets are. Blank sets are shaded lighter so you can see how much of the bar is measured and how much is assumed. Amber is under your weekly target, green is inside it, blue is over. In This week, pale green is short of the minimum while the week is still going. Below and above are judged at the one decimal shown. By region measures each region against its minimum, so 100% is on target; it averages your last 4 full weeks unless you pick 2 or 8 above the chart (the radar only: flags and the coach always use 4). Load is total weight × reps per week, comparable week to week but not session to session.',
    `${cov}
  <div class="chips">${VOL_MODES.map(([k,l])=>`<button class="chip ${ui.volMode===k?'on':''}" data-act="volMode" data-v="${k}">${l}</button>`).join('')}</div>
  ${ui.volMode==='region'?regionBody():ui.volMode==='trend'?trendBody():ui.volMode==='load'?`<div class="card">${volHeadline()}${state.sessions.length?`${rangeChips('vol',weeksSpan(firstDate(state.sessions)),8)}<div class="chartbox"><canvas id="chVol"></canvas></div>${chartFallback()}`:'<p class="small muted">Log a session to start this chart.</p>'}</div>`:`<div class="card">${ui.volMode==='week'?(MK.some(m=>(thisWeek[m]||0)>0)?volumeRows(thisWeek,state.settings.rirMode==='off'?null:thisWeekConf,true):'<p class="muted" style="margin:0">Nothing logged this week yet.</p>'):(avg?`<p class="small muted" style="margin:0 0 6px">Averaged over the ${avg._weeks} week${avg._weeks===1?'':'s'} with training in the last 4. Weeks with no sessions are excluded rather than counted as zero.</p>${volumeRows(avg,state.settings.rirMode==='off'?null:avg._conf)}`:'<p class="muted">No sessions in the previous 4 full weeks.</p>')}</div>`}`,noLog()?'Nothing logged yet':`${wkHard} hard sets this week`);

  // muscles: weak points, then return on volume folded beneath
  const inj=injuredSet();
  const reasons={};const add=(m,t,c)=>{(reasons[m]||(reasons[m]=[])).push([t,c]);};
  for(const m of inj)add(m,'Injured, targets paused','red');
  // A falling trend is lagging strength; a stalled lift with no clear trend says just that (r32: "Lagging strength" beside "unclear").
  for(const s of I.scores)if(s.label==='lagging'&&!inj.has(s.m))add(s.m,s.clear?(s.indirect?'Lagging strength (indirect)':'Lagging strength'):'A lift stalled','red');
  // Plan and actual being under band is one fact about one muscle, not two.
  // Counting it twice also pushed it up a sort that ranks by flag count.
  // A shortfall in the plan alone is not a weak point (r28): a new person
  // who picked a ready-made routine saw "18 flagged" in amber before
  // logging a set. Plan's Weekly volume shows the plan against the targets.
  for(const m of MK){
    if(inj.has(m))continue;
    if(TRACK_ONLY.has(m))continue;
    // One tag since r29; the routine's plan, when it is the reason, is in the line below.
    if(avg&&belowMin(avg[m],bands[m][0]))add(m,'Below target','yellow');
  }
  for(const m of state.settings.priorities)add(m,'Your priority','blue');
  const wp=Object.entries(reasons).sort((a,b)=>b[1].length-a[1].length);
  const weakBody=`<div class="card">${wp.length?wp.map(([m,rs])=>{const [lo,hi]=bands[m];
      /* The number a flag is judged on comes first (r29): the line led with
         this week, so "this week 10.5 of 10-20" sat beside Below target,
         which comes from the average. */
      const hs=v=>`${r1(v)} hard set${r1(v)===1?'':'s'}`;
      const bits=avg?[`${hs(avg[m]||0)} a week on average, target ${lo}-${hi}`,`this week ${r1(thisWeek[m]||0)}`]:[`this week ${hs(thisWeek[m]||0)} of ${lo}-${hi}`];if(belowMin(plan[m],lo))bits.push(`your routine plans ${r1(plan[m]||0)}`);
      return `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row spread"><b>${ML[m]}</b><div class="chips">${rs.map(([t,c])=>`<span class="tag ${c}">${t}</span>`).join('')}</div></div><p class="small muted" style="margin:2px 0 0">${bits.join(' · ')}</p></div>`;}).join(''):`<p class="muted" style="margin:0">${state.sessions.length?'Nothing flagged.':'Flags start once you have logged a few sessions.'}</p>`}</div>`;

  // stalls (folded inside Lifts, after Recent PRs and All-time bests since r28)
  let stl='';
  if(stalled.length){
    stl+=stalled.map(([id,s])=>`<div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--line)"><span><span class="plate yellow" style="height:14px;vertical-align:-2px"></span> ${esc(exName(id))}</span><span class="muted small">last ${fmtDate(s.last.date)}</span></div>`).join('');
    const bigN=fatigueStalls(stalled.map(([id])=>id)).length;
    if(bigN>=3)stl+=`<p class="small hastip" style="color:var(--red);margin-top:8px" data-tip="Several main lifts flat together often points to fatigue. Check sleep, food, and stress; Deload week is under More options on Today (half the sets, about 90% loads, kept out of your trends). Isolation and core lifts are not counted here.">${bigN} main lifts stalled at once: likely fatigue</p>`;
  }else stl+='<p class="muted">No stalls detected.</p>';
  const lw=lastLighterWeek();
  if(lw)stl+=`<p class="small muted" style="margin-top:8px">${lw.weeks==null?`No lighter week in the last 12. ${tipi(`Your usual week is ${lw.norm} hard sets. A lighter week is one well under that.`,'Lighter week')}`:`Last lighter week: ${lw.weeks} week${lw.weeks===1?'':'s'} ago (${lw.loads?'lighter loads':lw.sets>0?`${lw.sets} hard sets against your usual ${lw.norm}`:'a week off'}).`}</p>`;

  // exercise trend
  const withData=Object.keys(I.byEx).filter(id=>I.byEx[id].length).sort((a,b)=>exName(a).localeCompare(exName(b)));
  // Opens on the lift logged most often (r28), not the first in the alphabet; the list stays alphabetical.
  if(!ui.dashEx||!I.byEx[ui.dashEx])ui.dashEx=withData.length?[...withData].sort((a,b)=>I.byEx[b].length-I.byEx[a].length||exName(a).localeCompare(exName(b)))[0]:null;
  let exh='<div class="card">';
  if(ui.dashEx){
    const st=I.exStats[ui.dashEx];const ex=EX(ui.dashEx);const exps=I.byEx[ui.dashEx];
    /* 1RM figures only where a 1RM is stated (r30): a compound lift with sets
       of 12 reps to failure or fewer. Isolation lifts, and compound lifts done
       only for higher reps (a leg press for 15), show their best set and plot
       the top-set load, so the tiles, table and chart agree with the headline. */
    const e1Mode=isCompound(ex)&&exps.some(x=>x.best!=null);const bs=e1Mode?null:bestSet(ui.dashEx);
    const tagOf=x=>x.deload?'deload':x.light||x.auto?'lighter':x.cut?'trimmed':'';
    exh+=`<select data-bind="dashEx" aria-label="Exercise">${withData.map(id=>`<option value="${id}" ${id===ui.dashEx?'selected':''}>${esc(exName(id))}</option>`).join('')}</select>
    <div style="margin-top:8px">${exHeadline(ui.dashEx)}</div>${nextLine(ui.dashEx)}${goalLine(ui.dashEx)}${noE1(ex)?`<div class="kpis" style="margin-top:8px"><div class="kpi"><div class="v">${st.n}</div><div class="l">Sessions logged</div></div><div class="kpi"><div class="v">${st.stalled?'Yes':'No'}</div><div class="l">Stalled</div></div></div>`:''}<div class="kpis" style="margin-top:8px${noE1(ex)?';display:none':''}">${e1Mode?`<div class="kpi"><div class="v">${st.best?(ex.bw?'≈':'')+fmtE(st.best):'n/a'}</div><div class="l">Best e1RM (${U()}${loadNote(ex)})</div></div>`:`<div class="kpi"><div class="v">${bs?esc(setShort(ex,bs.w,bs.r)):'n/a'}</div><div class="l">Best set${loadNote(ex)}</div></div>`}<div class="kpi"><div class="v">${st.n}</div><div class="l">Sessions logged</div></div></div>
    ${noE1(ex)?'':`${rangeChips('ex',weeksSpan(exps[0].date),8,'all')}<div class="chartbox"><canvas id="chEx"></canvas></div>${chartFallback()}
    <p class="small muted hastip" style="margin:4px 0 0" data-tip="Filled diamond: a new best estimate (a weight PR that also set one is filled too). Hollow diamond: a rep PR or a weight PR that did not raise the estimate, which can sit below an earlier best. The thin dotted line is your RIR at the working load.">Reading the chart</p>`}
    ${st.easier?`<p class="small" style="color:var(--blue);margin-top:6px"><b>${esc(easierText(ex,st.easier))}</b></p>`:''}
    ${st.fade?`<p class="small" style="color:var(--yellow);margin-top:6px"><b>Set-to-set drop-off is widening at ${esc(loadLabel(ex,st.fade.w))}${ex.bw?'':' '+U()}: ${st.fade.from} → ${st.fade.to} reps lost from first set to last across your last three sessions.</b> That usually means fatigue or shorter rest rather than lost strength.</p>`:''}
    ${ex.bw&&!state.bodyweights.length?'<p class="small" style="color:var(--yellow)">Log your bodyweight on the Today tab so this bodyweight exercise can be trended.</p>':bwBackfillNote(ui.dashEx)}
    <div class="scroll-x"><table class="t" style="margin-top:8px"><tr><th>Date</th><th>Sets</th>${e1Mode?'<th class="r">e1RM</th>':''}</tr>${exps.slice(-8).reverse().map(x=>`<tr><td>${fmtDate(x.date)}${x.progress?' <span class="tag green">PR</span>':''}${tagOf(x)?` <span class="tag">${tagOf(x)}</span>`:''}</td><td>${x.pts.map(p=>setShort(ex,p.w,p.r)).join(', ')}</td>${e1Mode?`<td class="r num">${x.best?(ex.bw?'≈':'')+fmtE(x.best):''}</td>`:''}</tr>`).join('')}</table></div>`;
  }else exh+='<p class="muted">Log a session to see exercise trends.</p>';
  exh+='</div>';
  const bestsBody=bestsBoard();
  // Counted PRs only (r32), the same ones as the count beside the title.
  const bigPR=I.prs.filter(p=>p.big);
  const prBody=bigPR.length?bigPR.slice(0,15).map(p=>{const ex=EX(p.exId);const iso=p.type==='e1RM'&&!isCompound(ex);const ps=iso?prSet(p.exId,p.date):null;return `<div class="row spread" style="padding:6px 0;border-bottom:1px solid var(--line)"><span>${esc(ex.name)} <span class="tag ${p.type==='Rep PR'?'blue':'green'}">${ex.timed&&p.type==='Rep PR'?'Time PR':p.type==='e1RM'?(iso?'PR':prName(p)):p.type}</span></span><span class="num">${p.type==='e1RM'?(iso?(ps?setShort(ex,ps.w,ps.r):''):fmtE(p.value)+' '+U()):setShort(ex,p.w,p.r)} <span class="muted small">${fmtDate(p.date)}</span></span></div>`;}).join(''):'<p class="muted">No PRs yet. Your first session of an exercise sets the baseline.</p>';
  h+=dsec('exercise','Lifts',`Estimated 1RM uses reps to failure, which is reps plus RIR: Brzycki up to 10, Epley at 11 and 12, none above 12 or for a set called above RIR 4. A blank RIR reads as your usual RIR on that lift once you have rated 3 of its sets in 12 weeks; until then it counts as 0, so the estimate errs low. Numbers stay in the frame you log in, per dumbbell or per side where that applies. Bodyweight lifts add the share of your bodyweight they move: all of it for pull-ups and dips, 64% for push-ups. Lifts that turn about one joint (leg raises, crunches, Nordics) get no estimate; their progress is reps and load. Trends read the average of each session's working sets and need 3 sessions over 2 weeks or more within 6 weeks. A heavy single before back-off sets counts toward bests only. Moving or falling means past 3% with a clear trend, since estimates swing 2 to 8% day to day. A PR is a weight PR (more weight than any earlier set), a new best estimate within its range of reps to failure (1 to 5, 6 to 10, 11 to 12), or a rep PR (more reps at a load than any earlier set); a set that is more than one shows the first. Stalled: flat or falling over your last 6 sessions, or 3 weeks if that covers more (at least 4 sessions), with no PR in the last 3, no heavier load, and no more reps at the same load, not counting deload, lighter, and trimmed sessions.`,
    exh+sub('prs','Recent PRs',prBody,noLog()?'none yet':prs4||!bigPR.length?`${prs4} in 4 weeks`:`latest ${fmtDate(bigPR[0].date)}`)+sub('bests','All-time bests',bestsBody.html,bestsBody.n?`${bestsBody.n} lift${bestsBody.n===1?'':'s'}`:'none yet')+sub('stalls','Stalls',stl,stalled.length?`<span class="pill ${fatigueStalls(stalled.map(([id])=>id)).length>=3?'red':'yellow'}">${stalled.length} stalled</span>`:'none'),noLog()?'Nothing logged yet':`${Object.keys(I.byEx).length} lift${Object.keys(I.byEx).length===1?'':'s'} tracked`);

  // consistency heat map
  // Starts at your first logged week; weeks ahead fill a young log.
  const hFirst=firstDate(state.sessions);const hWin=weekWindow(hFirst,'heat',12);const hN=weeksSpan(hFirst);
  let heat=`<div class="card">${rangeChips('heat',hN,12)}<div class="heat-h">${DAYS.map(d=>`<span>${d[0]}</span>`).join('')}</div><div class="heat">`;
  const t=today();
  if(!hWin.length)heat+='</div><p class="small muted" style="margin:6px 0 0">Your first logged session starts this grid.</p><div>';
  // r25: each past day is a button, so a square opens that date (calDay).
  for(const w of hWin)for(let i=0;i<7;i++){const d=addDays(w.wk,i);const c=`${sessDates.has(d)?'on':''} ${d>t?'fut':''} ${d===t?'today':''}`;const tip=`${fmtDateLong(d)}${sessDates.has(d)?': lifted':''}`;
    heat+=d>t?`<div class="${c}" data-tip="${tip}"></div>`:`<button type="button" class="${c}" data-act="calDay" data-date="${d}" data-tip="${tip}" aria-label="${tip}. Open"></button>`;}
  heat+='</div></div>';

  // ranking (folded inside Muscles)
  let rank='<div class="card">';
  if(I.scores.length){
    const maxAbs=Math.max(1,...I.scores.filter(s=>s.clear).map(s=>Math.abs(s.score)));
    const src=avg||thisWeek;
    // A muscle with no sets lately has an old trend, not a return on volume (r34.2: "Quads +7.6% · 0 sets a week" after a break).
    const trained=I.scores.filter(s=>(src[s.m]||0)>0);
    /* Rising at or above its target needs nothing done, so those muscles share
       one line and each row left is one to act on (r41, V: clutter; it was
       16 rows of "+8%" with nothing to do). */
    const fine=trained.filter(s=>s.clear&&s.score>=GROW_PCT&&(src[s.m]||0)>=bands[s.m][0]);
    rank+=trained.filter(s=>!fine.includes(s)).map(s=>{const c=s.label==='progressing'?'green':s.label==='lagging'?'red':'none';
      const sets=src[s.m]||0;const [lo,hi]=bands[s.m];
      /* Advice only where the trend is clear (r30). "Flat: try 2 more sets"
         was given to every muscle whose lifts were inside the noise, a causal
         call from no signal; a stalled lift is the one flat case stated. */
      /* Rising at its volume needs nothing done, so it says nothing (r34, V:
         "Rising: hold this volume" on every row read as filler). */
      const read=!s.clear?(s.stall?'A lift has stalled: see Stalls under Lifts.':'Too early to tell: keep logging.'):s.score>=GROW_PCT?(sets<lo?'Rising, on fewer sets than your target.':'')
        :s.score<=-GROW_PCT?'Falling: check recovery first.'
        :(sets>=hi?'Flat at high volume: change exercises or effort, not sets.':'Flat: try 2 more sets a week for 3 weeks.');
      return `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="mrow" style="border:0;padding:0"><span class="plate ${c}"></span><span>${ML[s.m]}${s.indirect?' <span class="tag" data-tip="No direct exercise for this muscle. Trend inferred from lifts where it assists.">indirect</span>':''}</span><div class="band"><div class="fill ${s.score>=0?'in':'down'}" style="width:${s.clear?Math.abs(s.score)/maxAbs*100:0}%"></div></div><span class="r small">${!s.clear?'unclear':s.score>=GROW_PCT?'rising':s.score<=-GROW_PCT?'falling':'flat'}</span></div><p class="small muted" style="margin:2px 0 0">${r1(sets)} sets a week${read?` · ${read}`:''}</p></div>`;}).join('');
    if(fine.length)rank+=`<p class="small muted" style="margin-top:8px">Rising at ${fine.length===1?'its':'their'} volume: ${esc(andList(fine.map(s=>ML[s.m]),4))}. Keep the sets as they are.</p>`;
    const missing=MK.filter(m=>!I.scores.find(s=>s.m===m));
    if(missing.length)rank+=`<p class="small muted" style="margin-top:8px">Not enough data yet: ${missing.map(m=>ML[m]).join(', ')}.</p>`;
  }else rank+='<p class="muted">Not enough data yet. Log at least 3 sessions of an exercise over 2 weeks or more, within 6 weeks.</p>';
  rank+='</div>';
  h+=dsec('weak','Muscles','Muscles are flagged because the trend is falling, or flat with one of its lifts stalled, or the hard sets you logged average below your target, or you named it a priority, or you flagged an injury. A muscle is never flagged for what the routine plans, only for what you log. A muscle whose strength is rising is never flagged. Strength return on volume: the median change in estimated 1RM across a muscle\'s main exercises over up to 6 weeks (each lift with 4 sessions over 3 weeks or more), in the current rep range, next to the hard sets a week that produced it. This measures strength, not size: early gains are largely neural, and high-rep estimates are noisy. Size check reads your tape measurements, which are the closer signal for size.',
    weakBody+sub('rank','Strength return on volume',rank)+sub('size','Size check',sizeBody()),wp.length?`<span class="pill yellow">${wp.length} flagged</span>`:state.sessions.length?'<span class="pill green">none flagged</span>':'after a few sessions');

  {let cw='';const rows=[];const cf=firstDate(state.cardio);const cn=Math.min(8,weeksSpan(cf));
   // From your first cardio week only: no rows of zero before it.
   for(let k=cn-1;k>=0;k--){const ws=addDays(cur,-7*k),we=addDays(ws,6);const es=state.cardio.filter(c=>c.date>=ws&&c.date<=we);rows.push({ws,min:es.reduce((a,c)=>a+c.min,0),n:es.length});}
   if(state.cardio.length){const mx=Math.max(1,...rows.map(r=>r.min));cw=`<div class="card"><b>Cardio and mobility, minutes per week</b>${rows.map(r=>`<div class="mrow"><span></span><span>${k0(r.ws)}</span><div class="band"><div class="fill in" style="width:${r.min/mx*100}%"></div></div><span class="r num">${r.min}<span class="muted small"> min</span></span></div>`).join('')}</div>`;}
   heat+=cw;}
  // Only once a check-in has been answered: for anyone who skips it, the fold only said it needs 6 (r41).
  if(readiness().n)heat+=sub('ready','Readiness and performance',readinessBody());
  {const sk=weekStreak();const adhLine=`<p class="small muted" style="margin:0 0 8px" id="adhLine">${freeMode()?'Adherence: freestyle, no plan to follow':!planned?'Adherence: no planned days':adher==null?'Adherence: appears after your first full week':`Adherence, previous ${wks4} full week${wks4===1?'':'s'}: ${adher}% of planned sessions (${Math.round(done4)}/${Math.round(need4)})`}</p>`;h+=dsec('consistency','Consistency','12 weeks from your first logged session; once you have more, the latest 12, with All for the rest. Faded squares are days still ahead. Filled squares are days with a logged lifting session. The streak counts weeks that hit the sessions your routine plans. Cardio minutes are shown under the grid and never count as lifting sessions. Adherence is the planned sessions done over the previous 4 full weeks, each week counted up to its plan.',noLog()?heat:adhLine+heat,noLog()?'Nothing logged yet':`${sk.weeks}-week streak${adher!=null?` · ${adher}% adherence`:''}`);}

  // body: chart, entry, tape, muscle map
  h+=dsec('body','Body','Daily bodyweight with a 7-day average. Tape changes help cross-check which muscles are actually growing.',
    `<div class="card">${state.bodyweights.length?`${rangeChips('bw',weeksSpan(firstDate(state.bodyweights)),8,'all')}<div class="chartbox"><canvas id="chBW"></canvas></div>${chartFallback()}`:`<p class="small muted" style="margin:0">Log your bodyweight in Body on Today to start this chart.</p>${state.settings.hidden.includes('today:body')?'<button class="btn sm" style="margin-top:8px" data-act="secShow" data-k="today:body">Show Body on Today</button>':''}`}${state.bodyweights.length?bwRateText():''}${state.bodyweights.length||state.measurements.length?measTable():''}</div>`,state.bodyweights.length?`${state.bodyweights.length} weigh-in${state.bodyweights.length===1?'':'s'}`:'not logged yet');

  h+=moreLine('dash');
  return h;
}
const k0=ws=>ws===weekStart(today())?'This wk':fmtDate(ws);
/* ---------- chart windows ----------
   Charts start where your data starts. A weekly chart used to open eight
   weeks back whatever you had logged, so a new log sat on a row of empty
   weeks. Now the first logged week is the left edge; while there is less
   than a full window of data, the weeks ahead fill the rest, empty and
   marked as upcoming, and each new week lands in the next slot. Once there
   is more history than the window, it follows the current week, and the
   range chips (8 weeks, 6 months, all) bring the past back into view.
   Line charts (a lift's strength, bodyweight) use real dates on the x axis,
   so gaps between sessions look like gaps, and they leave room ahead in
   the same way until the data fills it. */
/* 'base' is the chart's own first window (8 weeks, 12 for the grid). */
const RANGES=[['base',0],['6m',26],['all',Infinity]];
function firstDate(list){let f=null;for(const x of list)if(x&&isDate(x.date)&&(!f||x.date<f))f=x.date;return f;}
function weeksSpan(first){return first?Math.round(daysBetween(weekStart(first),weekStart(today()))/7)+1:0;}
function rangeKey(id,def){const k=(ui.rng||{})[id];return RANGES.some(r=>r[0]===k)?k:(def||'base');}
function rangeWeeks(k,base){return k==='all'?Infinity:k==='6m'?26:base;}
function weekWindow(first,id,base){
  base=base||8;const cur=weekStart(today());if(!first)return [];
  const fw=weekStart(first);const n=weeksSpan(first);
  if(n<=base)return Array.from({length:base},(_,k)=>{const wk=addDays(fw,7*k);return {wk,fut:wk>cur};});
  const span=Math.min(n,Math.max(base,rangeWeeks(rangeKey(id),base)));
  return Array.from({length:span},(_,k)=>({wk:addDays(cur,-7*(span-1-k)),fut:false}));
}
/* Range chips, shown only once there is more history than the first window. */
function rangeChips(id,n,base,def){
  base=base||8;if(n<=base)return '';const cur=rangeKey(id,def);
  const opts=[['base',`${base} wk`]];if(n>26&&base<26)opts.push(['6m','6 mo']);opts.push(['all','All']);
  return `<div class="chips rng" role="group" aria-label="Range">${opts.map(([k,l])=>`<button class="chip ${cur===k?'on':''}" data-act="chartRange" data-id="${id}" data-v="${k}" aria-pressed="${cur===k}">${l}</button>`).join('')}</div>`;
}
/* Linear date axis: day numbers from a base date, labelled as dates. The
   window follows the same rule as the weekly one, and minSpan days of room
   stay ahead of the first point until the data fills them. */
function dayWindow(base,lastDay,id,minSpan,def){
  const todayN=daysBetween(base,today());let right=Math.max(lastDay,todayN);
  const w=rangeWeeks(rangeKey(id,def),8);
  let left=w===Infinity?0:Math.max(0,right-w*7+1);
  if(right-left<minSpan)right=left+minSpan;
  return {min:left,max:right};
}
function dayAxis(base,win){
  const span=win.max-win.min;const step=Math.max(7,Math.ceil(span/6/7)*7);
  return {type:'linear',min:win.min,max:win.max,ticks:{stepSize:step,includeBounds:false,maxRotation:0,autoSkip:false,callback:v=>fmtDate(addDays(base,Math.round(v)))}};
}
/* Volume section, "By region" mode: the balance radar and its table, the
   first view of Volume since r28 (V). It reads what you logged and nothing
   else (V, r29: in r28 it read the routine's plan until a full week was
   logged, which made every new person look behind): your recent average,
   else this week so far, else your last trained weeks however long ago, so
   the chart is always drawn from real sets (V, r29: a blank card read as the
   chart being gone). With no sessions at all it still draws, empty, with the
   target ring. The chart and the table use this one source. */
/* The weeks the radar averages (r31.2, V: one week says little about
   balance): the last 2, 4 or 8 full weeks, 4 unless changed, kept per
   device. Fewer full weeks logged than chosen: those, said so; none yet:
   this week so far, said so. This week on its own is Volume's This week. */
const REGION_WKS=[[2,'2 wk'],[4,'4 wk'],[8,'8 wk']];
const REGION_KEY=KEY+'.regionWk';
function regionWk(){let v=ui.regionWk!=null?ui.regionWk:null;if(v==null)try{v=localStorage.getItem(REGION_KEY);}catch(e){/* private mode: the default */}const n=v==null?4:+v;return REGION_WKS.some(x=>x[0]===n)?n:4;}
function regionSrc(){
  const n=regionWk();
  const avg=avgWeeks(n);
  if(avg)return {src:avg,n,label:avg._missed||avg._light||avg._rest?`your average over ${avgWeeksTxt(avg)}`:avg._weeks<n&&avg._ff?`your ${avg._weeks} full week${avg._weeks===1?'':'s'} logged so far`:`your ${avg._weeks}-week average`};
  const I=IDX(),cur=weekStart(today());
  const wk=I.weekSets[cur]||{};
  if(MK.some(m=>(wk[m]||0)>0))return {src:wk,n,label:'this week so far',week:true,noFull:true};
  const has=w=>{const x=I.weekSets[w];return !!x&&MK.some(m=>(x[m]||0)>0);};
  const ff=firstFullWeek();const all=Object.keys(I.weekSets).filter(w=>w<cur&&has(w)).sort();
  const full=all.filter(w=>!ff||w>=ff);const wks=(full.length?full:all).slice(-n);
  if(wks.length){const out={};for(const w of wks)for(const m in I.weekSets[w])out[m]=(out[m]||0)+I.weekSets[w][m]/wks.length;
    const end=addDays(wks[wks.length-1],6);
    return {src:out,n,label:`your last ${wks.length===1?'trained week':wks.length+' trained weeks'}, to ${fmtDate(end)}`,old:true,end};}
  return {src:{},label:'',empty:true};
}
function regionBody(){
  const rs=regionSrc();
  if(rs.empty)return `<div class="card"><p class="headline">Nothing logged yet.</p><p class="small muted" style="margin:0 0 4px">Each region fills in with your own hard sets as you log them. The dashed ring is your weekly minimum.</p>${ENV==='preview'?`<p class="small" style="margin:6px 0">This test version keeps a separate log. ${previewCopyBtn('sm primary')}</p>`:''}<div class="chartbox tall"><canvas id="chRadar"></canvas></div>${chartFallback()}</div>`;
  const balLabel=rs.label;
  const regs=regionBalance(rs.src);
  const low=regs.filter(x=>x.low),high=regs.filter(x=>x.high);
  const on=regs.length-low.length;
  // The furthest short is the lowest share of its minimum, said in sets.
  const worst=[...low].sort((a,b)=>a.pct-b.pct)[0];
  // One count of sets on the section: regions share sets, so their sum read as a second, larger total (r34.2).
  const rh=rs.week?`<p class="headline">This week so far: ${on} of ${regs.length} regions at their minimum.</p>`
    :!low.length?`<p class="headline">Every region at or above its minimum${high.length?'':', inside its target'}.</p>`
    :`<p class="headline">${on} of ${regs.length} regions on target. Furthest short: ${worst.label}, ${r1(worst.got)} of ${r1(worst.lo)} sets.</p>`;
  const note=(rs.old?`Nothing logged in the last ${rs.n||4} weeks, so this shows ${esc(balLabel)}. `:'')+(rs.noFull?'No full week is logged yet, so this is this week so far. ':'')+(rs.week&&low.length?'The week is still going, so this fills in as you train.':'');
  const chips=`<div class="wkpick"><span class="small muted" id="wkpickL">Average of the last</span><div class="chips" role="group" aria-labelledby="wkpickL">${REGION_WKS.map(([k,l])=>`<button class="chip ${rs.n===k?'on':''}" data-act="regionWk" data-v="${k}" aria-pressed="${rs.n===k}">${l}</button>`).join('')}</div></div>`;
  return `<div class="card">${rs.week?'':chips}${rh}<p class="small muted" style="margin:0 0 4px">Using ${esc(balLabel)}. ${tipi('Hard sets per region against the minimum of your weekly targets. On or past the dashed ring is on target.','Reading the chart')}</p><div class="chartbox tall"><canvas id="chRadar"></canvas></div>${chartFallback()}
  <table class="t" style="margin-top:8px"><tr><th>Region</th><th class="r">Sets</th><th class="r">Minimum</th><th class="r">Of minimum</th></tr>
  ${regs.map(rg=>{const c=rg.low?(rs.week?'part':'yellow'):rg.high?'blue':'green';return `<tr><td><span class="plate ${c}" style="height:12px;vertical-align:-1px"></span> ${rg.label}</td><td class="r num">${r1(rg.got)}</td><td class="r muted small">${r1(rg.lo)}</td><td class="r num">${rg.lo>0?Math.round(rg.pct)+'%':'<span class="muted small">no minimum</span>'}</td></tr>`;}).join('')}</table>
  ${note?`<p class="small muted" style="margin-top:6px">${note}</p>`:''}</div>`;
}
/* Volume section, "Weekly trend" mode: one muscle over time against its band. */
function trendBody(){
  const f=firstDate(state.sessions);
  return `<div class="card"><p class="small muted" style="margin:0 0 4px">Hard sets a week for one muscle, from your first logged week. Solid is sets with RIR logged; faded is sets counted as hard because RIR was blank. Weeks ahead are empty until you get there.</p><select data-bind="dashMuscle">${MUSCLES.map(([k,l])=>`<option value="${k}" ${ui.dashMuscle===k?'selected':''}>${l}</option>`).join('')}</select>${muscleHeadline(ui.dashMuscle)}${f?`${rangeChips('muscle',weeksSpan(f),8)}<div class="chartbox"><canvas id="chMuscle"></canvas></div>${chartFallback()}`:'<p class="small muted">Log a session to start this chart.</p>'}</div>`;
}
/* One Stats section, built on the shared sec() component. */
function dsec(key,title,explain,body,subTxt){
  return sec({sk:'dash:'+key,key,id:'sec-'+key,title,sub:subTxt||'',help:explain?'sec-'+key:null,helpBody:explain,body});
}
/* A fold inside a section: not persisted, opened by goDash when a tile or row
   points at it. */
/* All-time bests (item 27): per lift, the best estimate and the heaviest set,
   and inside, the rep records: for every load, the most reps, where no heavier
   set did as many. The same rule makes a rep PR, so the board and the PR feed
   agree. Each record carries the date it was first reached. Newest record
   first, so the lifts that are moving sit at the top. */
function allTimeBests(id){
  const exps=IDX().byEx[id];if(!exps||!exps.length)return null;const ex=EX(id);
  let est=null,heavy=null;const front=[];
  for(const x of exps){
    const fresh=[];
    for(const p of x.pts){
      const v=noE1(ex)?null:e1(p.load,p.r,p.rq);
      if(v!=null&&(!est||v>est.v+1e-6))est={v,p,date:x.date};
      // Heaviest and rep records at the PR load (prLoad, r32.1): on a bodyweight lift, by added load and reps, dated when first done.
      if(!heavy||p.pl>heavy.p.pl+1e-6||(Math.abs(p.pl-heavy.p.pl)<1e-6&&p.r>heavy.p.r))heavy={p,date:x.date};
      if(!front.some(q=>q.p.pl>=p.pl-1e-6&&q.p.r>=p.r))fresh.push(p);
    }
    for(const p of fresh){
      if(front.some(q=>q.p.pl>=p.pl-1e-6&&q.p.r>=p.r))continue;
      for(let k=front.length-1;k>=0;k--)if(p.pl>=front[k].p.pl-1e-6&&p.r>=front[k].p.r)front.splice(k,1);
      front.push({p,date:x.date});
    }
  }
  front.sort((a,b)=>b.p.pl-a.p.pl);
  const last=[est&&est.date,heavy&&heavy.date,...front.map(f=>f.date)].filter(Boolean).sort().pop();
  return {ex,est,heavy,front,last};
}
function bestsBoard(){
  const I=IDX();const rows=Object.keys(I.byEx).map(allTimeBests).filter(Boolean).sort((a,b)=>a.last<b.last?1:a.last>b.last?-1:a.ex.name.localeCompare(b.ex.name));
  if(!rows.length)return {n:0,html:'<p class="muted">Your bests appear here after your first session.</p>'};
  // A bodyweight lift's estimate includes the body, so it says total; its sets read BW+x.
  const u=ex=>' '+U()+(ex.bw?' total':'');
  // The newest six first; the rest one tap away, so the list stays short on a phone.
  const shown=ui.bestsAll?rows:rows.slice(0,6);
  return {n:rows.length,html:`<div class="bests">${shown.map(r=>{const ex=r.ex;
    /* Each best carries its own date (r30): one date at the end, the newest
       record of any kind, read as the date of the heaviest set. A 1RM is shown
       for compound lifts only. */
    const showEst=r.est&&isCompound(ex);
    const top=[showEst?`best est ${fmtE(r.est.v)}${u(ex)}${loadNote(ex)}, ${fmtDate(r.est.date)}`:'',r.heavy?`heaviest ${setShort(ex,r.heavy.p.w,r.heavy.p.r)}${loadNote(ex)}, ${fmtDate(r.heavy.date)}`:''].filter(Boolean).join(' · ');
    return `<details class="bx" data-ex="${ex.id}"><summary><span class="bn">${esc(ex.name)}</span><span class="bs">${top}</span></summary>
    ${showEst?`<p class="small" style="margin:0 0 6px">Best estimate from ${setShort(ex,r.est.p.w,r.est.p.r)}.</p>`:''}
    <table class="t"><tr><th>${esc(ex.assist?'Load':loadHead(ex))}</th><th class="r">${ex.timed?'Seconds':'Reps'}</th><th class="r">First done</th></tr>${r.front.map(f=>`<tr><td class="num">${esc(loadLabel(ex,f.p.w))}</td><td class="r num">${f.p.r}</td><td class="r">${fmtDate(f.date)}</td></tr>`).join('')}</table></details>`;}).join('')}</div>${rows.length>shown.length?`<button class="btn sm" style="margin-top:8px" data-act="bestsAll">Show all ${rows.length} lifts</button>`:''}<p class="small muted hastip" style="margin:8px 0 0" data-tip="For each load, the most reps you have done, where no heavier set did as many. Beating a line at 90% or more of your strongest set is a rep PR. The best estimate (compound lifts) is the highest estimated 1RM from any set, in the frame you log in. Warm-ups and drop sets are left out.">How to read this</p>`};
}
function sub(key,title,body,subTxt){return subsec('dash:sub:'+key,title,body,subTxt).replace('<details class="subsec"',`<details class="subsec" id="sub-${key}"`);}
/* This used to print under all five charts at once. It is one fact about the
   page, so it is shown once per render and the later calls return nothing. */
let chartNoticeUsed=false;
function chartFallback(){
  if(window.__libs.chart||chartNoticeUsed)return '';
  chartNoticeUsed=true;
  return '<p class="small muted">Charts are still loading. If they never appear, your connection blocked the chart library. Every number on this page works without them.</p>';
}
/* Bodyweight rate: 7-day average now against the 7-day average 2 to 6 weeks
   earlier, expressed per week. Needs entries at least 14 days apart. */
function bwRate(){
  const bw=[...state.bodyweights].sort((a,b)=>a.date<b.date?-1:1);if(bw.length<2)return null;
  const last=bw[bw.length-1];
  const avgAt=d=>{const from=addDays(d,-6);const w=bw.filter(x=>x.date>=from&&x.date<=d);return w.reduce((a,x)=>a+x.kg,0)/w.length;};
  const first=bw.find(x=>daysBetween(x.date,last.date)<=42&&daysBetween(x.date,last.date)>=14);
  if(!first)return null;
  const days=daysBetween(first.date,last.date);const a=avgAt(first.date),b=avgAt(last.date);
  return {pct:(b/a-1)*100/days*7,wk:(b-a)/days*7,days,from:first.date,to:last.date};
}
/* The weekly rate in the lifter's unit (r41): "+0.4 lb a week" is what a
   scale shows; the percentage stays beside it only where a goal is set in
   percent. Under 0.05 of a unit a week reads flat. */
function bwWeekTxt(r){const v=toD(r.wk);return Math.abs(v)<0.05?'Flat':`${v>0?'+':'−'}${Math.abs(v).toFixed(1)} ${U()} a week`;}
function bwRateText(){
  const r=bwRate();const g=state.settings.bwGoalPct;
  if(!r)return '<p class="small muted" style="margin-top:6px">Log bodyweight for at least two weeks to see your weekly rate of change.</p>';
  const sign=v=>(v>=0?'+':'')+r1(v);
  // The dates it covers, not "the last N days", which read as up to today (r34.2: said 43 days after the last weigh-in).
  let t=`<b>${bwWeekTxt(r)}</b>${g!=null?` (${sign(r.pct)}%)`:''}, ${fmtDate(r.from)} to ${fmtDate(r.to)}. ${tipi(`From 7-day averages, so a single heavy or light day does not swing it. ${sign(r.pct)}% of your bodyweight a week.`,'How this is worked out')}`;
  if(g!=null){const d=r.pct-g;t+=` Goal ${sign(g)}%: `+(Math.abs(d)<=0.15?'on track.':d>0?`running ${r1(d)} points above it.`:`running ${r1(-d)} points below it.`);}
  return `<p class="small" style="margin-top:6px;${g!=null&&Math.abs(r.pct-g)>0.15?'color:var(--yellow)':''}">${t}</p>`;
}
/* Height parses 5'10, 5 10, 70 (inches) or 5.9 (feet) in lb mode, and cm or
   metres in kg mode. Stored in cm. */
function parseHeight(v){
  const t=String(v||'').trim().toLowerCase().replace(/["”]|in(ches)?|cm/g,'').trim();if(!t)return null;
  let cm=null;
  if(U()==='lb'){
    const m=t.match(/^(\d+(?:\.\d+)?)\s*(?:'|’|ft|feet|\s)\s*(\d+(?:\.\d+)?)?$/);
    if(m)cm=(+m[1]*12+(m[2]?+m[2]:0))*IN;else{const n=numIn(t);if(n!=null)cm=(n<=8?n*12:n)*IN;}
  }else{const n=numIn(t);if(n!=null)cm=n<3?n*100:n;}
  return cm!=null&&cm>=100&&cm<=250?Math.round(cm*10)/10:null;
}
function heightTxt(cm){if(cm==null)return '';if(U()==='kg')return `${Math.round(cm)} cm`;const i=Math.round(cm/IN);return `${Math.floor(i/12)}'${i%12}"`;}
/* Waist to height: a waist under half your height is the usual cut-off for
   healthy central fat, and unlike BMI it does not penalise muscle. */
function whtrLine(prompt){
  const hc=state.settings.heightCm;
  const w=[...state.measurements].filter(m=>m.waist>0).sort((a,b)=>a.date<b.date?1:-1)[0];if(!w)return '';
  if(!hc)return prompt?'<p class="small muted whtr">Add your height above to see waist to height.</p>':'';
  /* NICE 2022: under 0.5 healthy, 0.5 to 0.59 increased, 0.6 or more high
     central-fat risk. A screening number, not a diagnosis; measured midway
     between the lowest rib and the top of the hip bone. */
  // Banded on the number shown, so 0.4997 cannot read "0.50 · healthy range".
  const r=Math.round(w.waist/hc*100)/100;const band=r<0.5?['green','healthy range']:r<0.6?['yellow','increased risk']:['red','high risk'];
  return `<p class="small whtr"><b>Waist to height ${r.toFixed(2)}</b> <span class="tag ${band[0]}">${band[1]}</span> <span class="muted hastip" data-tip="Waist ${lenD(w.waist)} ${LU()} on ${fmtDate(w.date)}, height ${heightTxt(hc)}. Under 0.50 healthy, 0.50 to 0.59 increased, 0.60 or more high (NICE 2022). A screening number: measure midway between the lowest rib and the top of the hip bone. Unlike BMI it does not count muscle against you.">how it reads</span></p>`;
}
function heightField(){return `<label class="field"><span class="hastip" data-tip="Set once. With a waist measurement it gives waist to height.">Height</span><input type="text" data-bind="height" value="${esc(heightTxt(state.settings.heightCm))}" placeholder="${U()==='lb'?'e.g. 5\'10':'e.g. 178'}" autocomplete="off"></label>`;}
function measTable(){
  const ms=[...state.measurements].sort((a,b)=>a.date<b.date?-1:1);
  if(ms.length<1)return '<p class="small muted">No tape measurements yet.</p>';
  const first=ms[0],last=ms[ms.length-1];
  return `${whtrLine()}<div class="scroll-x"><table class="t" style="margin-top:8px"><tr><th>Site (${LU()})</th><th class="r">${fmtDate(first.date)}</th><th class="r">${fmtDate(last.date)}</th><th class="r">Change</th></tr>${MEAS.map(([k,l])=>{const a=first[k],b=last[k];return `<tr><td>${l}</td><td class="r">${lenD(a)}</td><td class="r">${lenD(b)}</td><td class="r">${a!=null&&b!=null&&ms.length>1?((b-a>=0?'+':'')+lenD(b-a)):''}</td></tr>`;}).join('')}</table></div>`;
}
/* bwAt() falls back to the earliest logged bodyweight for any date before that
   entry, because dropping those sets would erase the trend entirely. That is a
   defensible estimate but it is still a number from the future, so say so
   rather than letting it pass as measured. */
function bwBackfillNote(exId){
  const ex=EX(exId);if(!ex.bw||!state.bodyweights.length)return '';
  let first=null;for(const b of state.bodyweights)if(!first||b.date<first)first=b.date;
  const exps=IDX().byEx[exId]||[];
  const n=exps.filter(x=>x.date<first).length;
  if(!n)return '';
  return `<p class="small" style="color:var(--yellow);margin-top:6px">${n} session${n===1?'':'s'} here predate your first bodyweight entry (${fmtDate(first)}), so ${n===1?'it uses':'they use'} that weight as an estimate rather than a measurement.</p>`;
}
function cssv(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}
function baseOpts(){
  const ink=cssv('--muted'),line=cssv('--line');
  // Vertical gridlines removed and the y axis line dropped: the data carries the
  // chart, not the frame. Legend sits under the plot so it never squeezes it.
  return {responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'index',intersect:false},
    plugins:{legend:{position:'bottom',labels:{color:ink,boxWidth:10,boxHeight:10,padding:12}}},
    scales:{x:{ticks:{color:ink,maxRotation:0,autoSkip:true,maxTicksLimit:7},grid:{display:false},border:{color:line}},
      y:{ticks:{color:ink,maxTicksLimit:6},grid:{color:line+'99'},border:{display:false}}}};
}
function mkChart(id,cfg){const c=document.getElementById(id);if(!c||!window.Chart)return;try{charts.push(new window.Chart(c,cfg));}catch(e){log('chart',e);}}
/* Radar uses a polar scale (r), not x/y, so it needs its own options rather
   than baseOpts(). */
function radarOpts(max){
  const ink=cssv('--muted'),line=cssv('--line'),surf=cssv('--surface');
  return {responsive:true,maintainAspectRatio:false,animation:false,
    plugins:{legend:{labels:{color:ink,boxWidth:12}},
      tooltip:{callbacks:{label:it=>`${it.dataset.label}: ${it.dataset.real?it.dataset.real[it.dataIndex]:it.formattedValue}%`}}},
    scales:{r:{min:0,max,beginAtZero:true,
      // z:1 draws the tick labels above the datasets, so the 100% ring no longer
      // runs through the "100" label.
      ticks:{color:ink,stepSize:50,showLabelBackdrop:true,backdropColor:surf,backdropPadding:2,font:{size:10},z:1},
      grid:{color:line},angleLines:{color:line},
      pointLabels:{color:ink,font:{size:11}}}}};
}
function mountCharts(){
  if(!window.Chart)return;
  const I=IDX();const blue=cssv('--blue'),green=cssv('--green'),muted=cssv('--muted'),yellow=cssv('--yellow');
  try{
    const D=window.Chart.defaults;
    D.font.family=getComputedStyle(document.body).fontFamily||'system-ui, sans-serif';D.font.size=11;D.color=muted;
    const tt=D.plugins.tooltip;tt.backgroundColor=cssv('--ink');tt.titleColor=cssv('--surface');tt.bodyColor=cssv('--surface');
    tt.padding=9;tt.cornerRadius=8;tt.displayColors=false;tt.titleFont={weight:'600'};
    D.elements.bar.borderRadius=4;D.elements.bar.borderSkipped=false;D.elements.line.borderWidth=2.5;D.elements.point.hoverRadius=6;
  }catch(e){log('chart',e);}
  const cur=weekStart(today());const sFirst=firstDate(state.sessions);
  /* Weekly bar charts share one x axis: the window from weekWindow(), weeks
     ahead drawn empty with a fainter label. */
  const weekAxis=(win,o)=>{
    const ink=cssv('--muted');const faded=ink+'80';
    o.scales.x.ticks={...o.scales.x.ticks,autoSkip:win.length>8,maxTicksLimit:win.length>8?7:undefined,font:{size:10},color:c=>{const w=win[c.tick?c.tick.value:c.index];return w&&w.fut?faded:ink;}};
    return win.map(w=>w.wk===cur?'This wk':fmtDate(w.wk));
  };
  // muscle weekly
  {const win=weekWindow(sFirst,'muscle',8);
  if(win.length){
  const confV=[],assumV=[];
  for(const w of win){
    if(w.fut){confV.push(null);assumV.push(null);continue;}
    const tot=(I.weekSets[w.wk]||{})[ui.dashMuscle]||0;
    const c=Math.min((I.weekConf[w.wk]||{})[ui.dashMuscle]||0,tot);
    confV.push(r1(c));assumV.push(r1(tot-c));
  }
  const [lo,hi]=state.settings.bands[ui.dashMuscle];
  // The band lines sit on a second, hidden axis so that turning on stacking
  // for the bars cannot stack them on top of each other. Both axes are pinned
  // to the same explicit range so the lines land where they should.
  const yMax=Math.ceil(Math.max(hi+2,...confV.map((v,i)=>(v||0)+(assumV[i]||0)))*1.1/5)*5;
  const mOpts=baseOpts();
  mOpts.scales.x.stacked=true;mOpts.scales.y.stacked=true;
  mOpts.scales.y.min=0;mOpts.scales.y.max=yMax;
  mOpts.scales.y1={display:false,stacked:false,min:0,max:yMax,position:'right',grid:{drawOnChartArea:false}};
  mOpts.plugins.legend.labels.filter=it=>it.text!=='_bandLo';
  mOpts.plugins.tooltip={filter:it=>!win[it.dataIndex].fut||it.datasetIndex>1,callbacks:{title:its=>{const w=win[its[0].dataIndex];return w?`Week of ${fmtDate(w.wk)}${w.fut?' (ahead)':''}`:'';}}};
  const labels=weekAxis(win,mOpts);
  mkChart('chMuscle',{type:'bar',data:{labels,datasets:[
    {label:state.settings.rirMode==='off'?'Hard sets':'RIR logged',data:confV,backgroundColor:blue,yAxisID:'y'},
    {label:'Assumed hard',data:assumV,backgroundColor:blue+'55',yAxisID:'y'},
    // No target lines for a tracked-only muscle (r29).
    ...(TRACK_ONLY.has(ui.dashMuscle)?[]:[{type:'line',label:'_bandLo',data:labels.map(()=>lo),borderColor:green+'aa',borderWidth:1,borderDash:[3,3],pointRadius:0,yAxisID:'y1',fill:false},
    {type:'line',label:`Target ${lo} to ${hi}`,data:labels.map(()=>hi),borderColor:green+'aa',borderWidth:1,borderDash:[3,3],backgroundColor:green+'22',pointRadius:0,yAxisID:'y1',fill:'-1'}])
  ]},options:mOpts});
  }}
  // balance radar, built from the same source the table on screen uses
  const rsrc=regionSrc();const bal=rsrc.src;
  const regs=regionBalance(bal);
  /* Drawn up to 200% (r29): a minimum brought down to 2 sets read 8 sets as
     400%, and the ring and every other spoke shrank to a quarter. The real
     share is in the table and the tooltip. */
  const RCAP=200;const rMax=Math.min(RCAP,Math.max(150,Math.ceil(Math.max(...regs.map(x=>x.pct))/50)*50));
  const realPct=regs.map(x=>Math.round(x.pct));
  mkChart('chRadar',{type:'radar',data:{labels:regs.map(x=>x.label),datasets:[
    {label:'Your volume',real:realPct,data:realPct.map(v=>Math.min(v,RCAP)),borderColor:blue,backgroundColor:blue+'33',pointBackgroundColor:blue,pointRadius:3,borderWidth:2},
    {label:'Minimum (100%)',data:regs.map(()=>100),borderColor:green,borderDash:[5,4],pointRadius:0,borderWidth:2,fill:false}
  ]},options:radarOpts(rMax)});

  if(ui.dashEx&&I.byEx[ui.dashEx]&&!noE1(EX(ui.dashEx))&&I.byEx[ui.dashEx].length){
    // The same choice as the section above: the 1RM estimate, or the top-set load.
    const exE=EX(ui.dashEx);const e1Mode=isCompound(exE)&&I.byEx[ui.dashEx].some(x=>x.best!=null);
    const exps=I.byEx[ui.dashEx].filter(x=>e1Mode?x.best!=null:x.topW!=null);
    // Real dates on the x axis, counted in days from the first session.
    const base=exps[0].date;const xs=exps.map(x=>daysBetween(base,x.date));const lastX=xs[xs.length-1];
    /* The line plots the same estimate as the tile, the table and All-time
       bests, so their numbers agree; the headline says when the trend itself
       is read from loads and reps alone. */
    const vals=exps.map(x=>e1Mode?+fmtE(x.best):r1(toD(x.topW)));const isPR=exps.map(x=>!!x.progress);
    // A rep PR can land below an earlier best estimate, which read as a mistake
    // when every PR looked the same. New-best sessions are filled, rep PRs hollow.
    const prType=exps.map(x=>{if(!x.progress)return null;const p=I.prs.find(q=>q.exId===ui.dashEx&&q.date===x.date);return p?(p.type==='Weight PR'&&p.value!=null?'WeightE1':p.type):'Rep PR';});
    const surf=cssv('--surface');
    // Monotone interpolation: a smoothed curve must never draw a value above or
    // below what was actually logged between two sessions.
    const ds=[{label:e1Mode?`Best e1RM (${U()})`:`Top set load (${U()}${loadNote(exE)})`,data:vals.map((v,i)=>({x:xs[i],y:v})),borderColor:blue,backgroundColor:blue+'1f',fill:'start',cubicInterpolationMode:'monotone',yAxisID:'y',
      pointRadius:isPR.map(x=>x?5.5:2.5),pointStyle:isPR.map(x=>x?'rectRot':'circle'),pointBorderWidth:isPR.map(x=>x?2:1),
      pointBackgroundColor:prType.map(t=>t==='e1RM'||t==='WeightE1'?green:t?surf:blue),pointBorderColor:isPR.map(x=>x?green:blue)}];
    const eo=baseOpts();
    const win=dayWindow(base,lastX,'ex',42,'all');
    eo.scales.x={...eo.scales.x,...dayAxis(base,win),ticks:{...eo.scales.x.ticks,...dayAxis(base,win).ticks}};
    eo.interaction={mode:'nearest',axis:'x',intersect:false};
    eo.plugins.tooltip={callbacks:{
      title:its=>its.length?fmtDateLong(addDays(base,Math.round(its[0].parsed.x))):'',
      afterLabel:it=>it.datasetIndex===0&&prType[it.dataIndex]?({e1RM:e1Mode?'New best estimate':'PR',WeightE1:e1Mode?'Weight PR and a new best estimate':'Weight PR: more weight than ever before','Weight PR':'Weight PR: more weight than ever before'}[prType[it.dataIndex]]||'Rep PR: more reps at a load than ever before'):''}};
    if(exps.some(x=>x.topRir!=null)){
      ds.push({label:'RIR at top load',data:exps.map((x,i)=>({x:xs[i],y:x.topRir==null?null:r1(x.topRir)})),borderColor:yellow,backgroundColor:yellow,borderDash:[2,3],borderWidth:1.5,pointRadius:2,spanGaps:true,fill:false,yAxisID:'y1'});
      eo.scales.y1={position:'right',min:0,max:5,ticks:{color:cssv('--muted'),stepSize:1},grid:{drawOnChartArea:false},border:{display:false},title:{display:true,text:'RIR',color:cssv('--muted')}};
    }
    mkChart('chEx',{type:'line',data:{datasets:ds},options:eo});
  }
  /* One bar per week, split by the session it came from. Session-by-session
     bars alternated chest days with leg days, which are not comparable; weeks
     are. The unfinished current week is labelled as such. */
  {
    const win=weekWindow(sFirst,'vol',8);const wks=win.map(w=>w.wk);
    if(win.length){
    const base=n=>String(n||'Session').replace(/ \((lighter|deload)\)$/,'');
    const types=[];const byT={};
    for(const x of I.sessVol){const wk=weekStart(x.date);const i=wks.indexOf(wk);if(i<0)continue;const t=base(x.day);
      if(!byT[t]){byT[t]=wks.map((_,j)=>win[j].fut?null:0);types.push(t);}byT[t][i]+=x.vol;}
    const pal=[blue,green,yellow,cssv('--red'),'#8b5cf6','#14b8a6','#f97316',muted];
    const vo=baseOpts();vo.scales.x.stacked=true;vo.scales.y.stacked=true;
    const labels=weekAxis(win,vo);
    vo.plugins.tooltip={filter:it=>it.raw!=null,callbacks:{title:its=>its.length?`Week of ${fmtDate(wks[its[0].dataIndex])}`:'',label:it=>`${it.dataset.label}: ${Math.round(it.raw).toLocaleString()} ${U()}`,
      footer:its=>{if(!its.length)return '';const i=its[0].dataIndex;const tot=types.reduce((a,t)=>a+toD(byT[t][i]||0),0);return `Week total: ${Math.round(tot).toLocaleString()} ${U()}`;}}};
    mkChart('chVol',{type:'bar',data:{labels,
      datasets:types.map((t,i)=>({label:t,data:byT[t].map(v=>v==null?null:Math.round(toD(v))),backgroundColor:pal[i%pal.length]+(i<pal.length?'':'99'),borderRadius:2,stack:'v'}))},options:vo});
    }
  }
  const bw=[...state.bodyweights].sort((a,b)=>a.date<b.date?-1:1);
  if(bw.length){
    const avg=bw.map(b=>{const from=addDays(b.date,-6);const w=bw.filter(x=>x.date>=from&&x.date<=b.date);return r1(toD(w.reduce((a,x)=>a+x.kg,0)/w.length));});
    const base=bw[0].date;const xs=bw.map(b=>daysBetween(base,b.date));
    const win=dayWindow(base,xs[xs.length-1],'bw',28,'all');const ax=dayAxis(base,win);
    const bo=baseOpts();bo.scales.x={...bo.scales.x,...ax,ticks:{...bo.scales.x.ticks,...ax.ticks}};
    bo.interaction={mode:'nearest',axis:'x',intersect:false};
    bo.plugins.tooltip={callbacks:{title:its=>its.length?fmtDateLong(addDays(base,Math.round(its[0].parsed.x))):''}};
    mkChart('chBW',{type:'line',data:{datasets:[{label:`Bodyweight (${U()})`,data:bw.map((b,i)=>({x:xs[i],y:r1(toD(b.kg))})),borderColor:muted,backgroundColor:muted,pointRadius:2,showLine:false},{label:'7-day average',data:avg.map((v,i)=>({x:xs[i],y:v})),borderColor:blue,pointRadius:0,tension:.3,borderWidth:2}]},options:bo});
  }
}

