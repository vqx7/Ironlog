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
  else if(m.kind==='cal'){h=calSheet(m);}
  else if(m.kind==='past'){h=pastSheet(m);}
  else if(m.kind==='feedback'){h=fbSheet(m);}
  else if(m.kind==='fbInbox'){h=fbInboxSheet(m);}
  else if(m.kind==='restwk'){
    const cur=weekStart(today());const wk=[[cur,'This week'],[addDays(cur,-7),'Last week']];
    h=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="rwH"><div class="sheet-h"><h3 id="rwH">Rest week</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <p class="small muted" style="margin:0 0 10px">A week off on purpose. It is not counted as missed: averages, streak, and adherence skip it.</p>
    <div class="stack">${wk.map(([w,l])=>{const on=isRestWeek(w);return `<button class="btn block ${on?'primary':''}" data-act="restWk" data-w="${w}" aria-pressed="${on}">${l}, ${esc(fmtDate(w))} to ${esc(fmtDate(addDays(w,6)))}${on?': rest week':''}</button>`;}).join('')}</div></div>`;
  }else if(m.kind==='daypick'){
    const ss=sessionsOn(m.date);
    const tm=sessTm;
    h=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dpH"><div class="sheet-h"><h3 id="dpH">${esc(fmtDate(m.date))}: ${ss.length} sessions</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <div class="stack">${ss.map(x=>`<button class="btn block pastday" data-act="wkOpen" data-id="${x.id}"><span>${esc(x.dayName)}</span><small>${[tm(x),`${x.ex.length} exercise${x.ex.length===1?'':'s'}`].filter(Boolean).join(', ')}</small></button>`).join('')}</div></div>`;
  }else if(m.kind==='confirm'){
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${esc(m.title)}</h3></div><p>${esc(m.body)}</p><div class="row" style="margin-top:12px"><button class="btn ${m.danger?'danger':'primary'}" data-act="mOk">${esc(m.okLabel)}</button>${m.alt&&!m.alt.quiet?`<button class="btn" data-act="mAlt">${esc(m.alt.label)}</button>`:''}${m.alt&&m.alt.only?'':'<button class="btn" data-act="mClose">Cancel</button>'}</div>${m.alt&&m.alt.quiet?`<button class="linkbtn alt-quiet" data-act="mAlt">${esc(m.alt.label)}</button>`:''}</div>`;
  }else if(m.kind==='picker'){
    h=`<div class="sheet fixed" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${esc(m.title)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <div class="grid2"><input type="search" placeholder="Search" data-mbind="q" value="${esc(m.q)}" id="pickQ" enterkeyhint="search" autocomplete="off"><select data-mbind="m" aria-label="Muscle"><option value="">All muscles</option>${MUSCLES.map(([k,l])=>`<option value="${k}" ${m.m===k?'selected':''}>${l}</option>`).join('')}</select></div>
    <div class="row" style="margin-top:8px"><button class="btn sm" data-act="exNewFromPicker">+ New exercise</button>${m.mode==='addBlock'&&state.draft&&!state.draft.editingId?'<button class="btn sm" data-act="pickEx">Pick for me</button>':''}</div>
    <div class="sheet-scroll" id="pickList">${pickerBody(m)}</div></div>`;
  }else if(m.kind==='exEdit'){
    const e=m.e;
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${m.isNew?'New exercise':'Edit exercise'}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div><div class="stack">
    <label class="field">Name<input type="text" data-ebind="name" value="${esc(e.name)}"></label>
    <div class="grid2"><label class="field">Primary muscle<select data-ebind="primary">${e.primary?'':'<option value="" selected disabled>Pick one</option>'}${MUSCLES.map(([k,l])=>`<option value="${k}" ${e.primary===k?'selected':''}>${l}</option>`).join('')}</select></label>
    <label class="field">Equipment<select data-ebind="equip">${EQUIP.map(([k,l])=>`<option value="${k}" ${e.equip===k?'selected':''}>${l}</option>`).join('')}</select></label></div>
    <label class="field"><span>Movement</span> ${tipi('Compound: a press, row, pull-up, squat, or hinge. Isolation: one joint, like a curl or a raise. It sets the size of load increases (about 2.5% of the load on compound lifts, 5% on isolation), the setup time in estimates, which RIR calibration group the lift joins, and what Short on time keeps.','About movement')}<select data-ebind="kind"><option value="" ${e.kind?'':'selected'}>Automatic (${autoCompound({...e,kind:undefined})?'compound':'isolation'})</option><option value="compound" ${e.kind==='compound'?'selected':''}>Compound</option><option value="iso" ${e.kind==='iso'?'selected':''}>Isolation</option></select></label>
    ${e.bw?'':(()=>{const def=loadWords({...e,load:undefined});const has=!m.isNew&&state.sessions.some(s=>s.ex.some(b=>b.exId===e.id));
      return `<label class="field"><span class="hastip" data-tip="${esc('What the number you type means. Estimates and targets stay in this frame; weight lifted counts both dumbbells or both sides.'+(has?' Changing it does not convert sets already logged.':''))}">Weight is entered as</span><select data-ebind="load"><option value="auto" ${!e.load?'selected':''}>Default for this equipment: ${esc(def)}</option>${LOAD_MODES.map(([k,l])=>`<option value="${k}" ${e.load===k?'selected':''}>${l}</option>`).join('')}</select></label>`;})()}
    <div><p class="small muted">Helper muscles (count as half a set)</p><div class="chips">${MUSCLES.filter(([k])=>k!==e.primary).map(([k,l])=>`<button class="chip ${e.secondary.includes(k)?'on':''}" data-act="secToggle" data-m="${k}">${l}</button>`).join('')}</div></div>
    ${MK.includes(e.primary)?`<div class="exbody"><button type="button" class="linkbtn tall" data-act="exBodyTog" aria-expanded="${!!ui.exBody}">${ui.exBody?'Hide body':'Show on body'}</button>${ui.exBody?exBodyFlat(e,true)+exMusLegend(e):''}</div>`:''}
    <label class="check-inline"><input type="checkbox" data-ebind="bw" ${e.bw?'checked':''}><span class="hastip" data-tip="Log only what you add (0 for bodyweight). Your logged bodyweight is added for estimates and weight lifted.">Bodyweight exercise</span></label>
    ${e.bw?`<label class="check-inline"><input type="checkbox" data-ebind="assist" ${e.assist?'checked':''}><span class="hastip" data-tip="For an assisted machine: you type the help it gives, and less help is progress.">Assisted (a machine takes weight off)</span></label>`:''}
    ${e.bw?`<label class="field"><span class="hastip" data-tip="Measured only for push-ups (64%, force plates). Pull-ups and dips count all of it; the rest are segment-mass estimates.">Share of bodyweight moved (%)</span><input type="text" inputmode="numeric" data-ebind="bwfRaw" value="${esc(e.bwfRaw||'')}"></label>`:''}
    <label class="check-inline"><input type="checkbox" data-ebind="perSide" ${e.perSide?'checked':''}><span class="hastip" data-tip="Reps are logged for one side. One set still counts as one set; weight lifted counts both sides.">One side at a time (reps per side)</span></label>
    <label class="check-inline"><input type="checkbox" data-ebind="timed" ${e.timed?'checked':''}><span class="hastip" data-tip="${!m.isNew&&state.sessions.some(s=>s.ex.some(b=>b.exId===e.id))?'This exercise has logged sets: switching changes how those numbers read.':'The reps column holds seconds.'}">Timed hold (log seconds)</span></label>
    <details class="more" ${!m.back||m.moreOpen?'open':''}><summary>More options<span class="small muted">less common, load step, plates, heaviest, notes</span></summary><div class="stack">
    <label class="check-inline"><input type="checkbox" data-ebind="rare" ${e.rare?'checked':''}>Mark as less common</label>
    <div class="grid2"><label class="field"><span class="hastip" data-tip="The smallest jump you can make on this exercise, everywhere it appears. Earned increases are whole multiples of it, about 2.5% of the load on compound lifts and 5% on isolation work. Blank uses each routine's setting.">Load step (${U()})</span><input type="text" inputmode="decimal" data-ebind="incRaw" value="${esc(e.incRaw)}" placeholder="Routine setting"></label>
    <label class="field"><span class="hastip" data-tip="What to load, shown under the sets in a session.">Plate helper</span><select data-ebind="plates">${PLATE_MODES.map(([k,l])=>`<option value="${k}" ${(e.plates||'auto')===k?'selected':''}>${l}</option>`).join('')}</select></label></div>
    ${platesMode(e)==='bar'?`<label class="field"><span class="hastip" data-tip="A trap bar, EZ bar, or any bar other than the one in Settings. Used for the plates line and so a deload never goes under it.">Bar for this lift (${U()})</span><input type="text" inputmode="decimal" data-ebind="barRaw" value="${esc(e.barRaw||'')}" placeholder="Settings bar, ${fmtW(barKg())}"></label>`:''}
    <label class="field"><span class="hastip" data-tip="The top of the stack or the biggest dumbbell. At that load, targets move to more reps and then harder reps, and the lift is not called stalled.">Heaviest available (${U()}${e.bw?', added':''})</span><input type="text" inputmode="decimal" data-ebind="maxRaw" value="${esc(e.maxRaw||'')}" placeholder="No limit"></label>
    <label class="field">Notes and cues<textarea data-ebind="note">${esc(e.note||'')}</textarea></label></div></details>
    <div class="row"><button class="btn primary" data-act="exSave">${m.isNew&&m.back&&m.back.kind==='picker'?({addBlock:'Create and add to session',addDay:'Create and add to day',swapBlock:'Create and swap in',swapItem:'Create and swap in'}[m.back.mode]||'Save exercise'):'Save exercise'}</button><button class="btn" data-act="${m.back?'exBack':'mClose'}">${m.back?'Back':'Cancel'}</button></div>${m.isNew?'':howToLink(m.e)}${!m.isNew&&m.e.custom&&!window.claude?`<button class="linkbtn" style="min-height:44px" data-act="exSuggest" data-tip="Your exercises are only in your log. This sends it to the app's owner, who can add it to the library for everyone.">Suggest for the library</button>`:''}</div></div>`;
  }else if(m.kind==='exhist'){
    h=exHistSheet(m.exId);
  }else if(m.kind==='bmenu'){
    const d=state.draft;const b=d&&d.ex[m.b];if(!b){ui.modal=null;el.hidden=true;return;}
    const nx=d.ex[m.b+1];const linked=!!(nx&&b.plan.ss&&nx.plan.ss===b.plan.ss);
    const op=(o,l,dis,cls)=>`<button class="btn block ${cls||''}" style="margin-top:6px" data-act="bMenuDo" data-op="${o}" data-b="${m.b}" ${dis?'disabled':''}>${l}</button>`;
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${esc(exName(b.exId))}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    ${op('bHist','History and chart')}${op('bMus','Muscles worked')}${op('wAdd','Add a warm-up set')}${op('dropAdd','Add a drop set (about 75% load)')}${op('bQuick','Type or dictate sets')}${op('bNote',b.note?'Edit note':'Add note')}${op('bSwap','Swap exercise')}${howToLink(EX(b.exId))}${''}${op('bInc',`Load step: ${fmtW(incOf(EX(b.exId),b.plan))} ${U()}`)}${op('bMax',`Heaviest available: ${EX(b.exId).maxLoad!=null?fmtW(EX(b.exId).maxLoad)+' '+U():'no limit'}`)}${rirShow(EX(b.exId))?op('bCal','Calibration set (RIR check)'):''}${nx?op('bSs',linked?'Unlink superset':`Superset with ${esc(exName(nx.exId))}`):''}${op('bUp','Move up',m.b===0)}${op('bDown','Move down',!nx)}${op('fbOpen','Report a problem')}${op('bDel','Remove from session',false,'danger')}</div>`;
  }else if(m.kind==='injury'){
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Flag an injury</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <p class="small muted hastip" data-tip="Every exercise that loads this muscle (directly or as a helper) or this joint is marked in your sessions: its target pauses, loads cap at last time, and it is left out of below-target advice until cleared.">Training aid, not medical advice: sharp, worsening, or lasting pain needs a clinician.</p>
    <div class="stack"><label class="field">Area<select id="injM"><optgroup label="Joints">${JOINTS.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</optgroup><optgroup label="Muscles">${MUSCLES.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</optgroup></select></label>
    <p class="small muted hastip" style="margin:0" data-tip="Knee: squats, lunges, leg press, leg extensions, and curls. Hip: squats, hinges, hip thrusts, adductors, and abductors. Shoulder: presses, flyes, raises, pull-downs, pull-ups, dips. Elbow: curls, extensions, rows, pull-downs, dips. Wrist: curls, barbell and dumbbell presses, push-ups, front squats. A judgment from the movement, not a measurement.">Which exercises a joint flag marks</p>
    <label class="field">Note (optional)<input type="text" id="injNote" placeholder="e.g. left elbow, pressing only"></label>
    <div class="row"><button class="btn primary" data-act="injSave">Flag it</button><button class="btn" data-act="mClose">Cancel</button></div></div></div>`;
  }else if(m.kind==='recap'){
    const u=m.upd;
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${esc(m.title)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>${m.prs&&m.prs.length?`<div class="prblk" id="recapPR"><h4>${m.prs.length===1?'New PR':`${m.prs.length} new PRs`}</h4><ul>${m.prs.map(p=>`<li><b>${esc(p.name)}</b>: ${esc(p.what)}${p.was?` <span class="was">(${esc(p.was)})</span>`:''}</li>`).join('')}</ul></div>`:''}<ul class="recap">${m.lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>${m.note?`<p class="small muted">${esc(m.note)}</p>`:''}${''}
    ${u?`<div class="hint"><b>Update ${esc(u.dayName)} in your routine?</b><br>${esc(u.text)}. Next time this day starts with the change.</div><button class="btn block" data-act="applyUpd">Update ${esc(u.dayName)}</button>`:''}
    <button class="btn primary block" style="margin-top:10px" data-act="mClose">${u?'Not now':'Done'}</button></div>`;
  }else if(m.kind==='imp'){h=impSheet(m);
  }else if(m.kind==='templates'){
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Pick a routine</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    ${/* Your training on a first run (r44, V's answer 3): folded, optional, here rather than on Set up, which stays as short as r21 made it; the days mark the routines below. */''}
    ${m.from==='welcome'?`<div class="ob-prof" id="obProf"><button class="ob-prof-h" data-act="obProfTog" aria-expanded="${!!ui.obProf}">Your training <span class="muted">(optional)</span></button>${ui.obProf?`<div class="stack">${profFields()}</div>`:''}</div>`:''}
    <p class="small muted" style="margin:0 0 8px">${m.imported?'Your workouts are in. The names in the file did not say which days they were, so pick the routine you follow, or the closest; your targets and the next workout come from it. Change anything later in Plan.':'A starting point with sets, reps, and rest worked out. Change anything later in Plan.'}</p>
    <div class="tpl-list">${TEMPLATES.filter(t=>!t.hidden).map(t=>{
      // Minutes come from the same time model as Plan, so the list and the plan agree.
      // A range (r28): an average read as a promise, and Today then showed a longer first day.
      const r=routineFromTemplate(t.key);const tr=r.days.filter(d=>!d.rest);const mins=tr.map(d=>Math.round(dayMinutes(d)/5)*5);const lo=Math.min(...mins),hi=Math.max(...mins);const min=lo===hi?estMin(lo):`${lo} to ${hi} min`;
      // The days a week in Your training (r44) mark the routines that fit; every other day counts as about 3.5.
      const pd=prof().days;const fits=pd&&Math.abs(tr.length*7/r.days.length-pd)<=0.5;
      return `<button class="tpl" data-act="tplPick" data-k="${t.key}"><span class="tpl-t">${esc(t.name)}${fits?' <span class="pill">Fits your days</span>':''}</span><span class="tpl-w">${esc(t.who)}</span><span class="tpl-m">${esc(t.meta)} · ${min} · ${tr.map(d=>esc(d.name)).join(', ')}</span></button>`;}).join('')}</div></div>`;
  }else if(m.kind==='routineNew'){
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>New routine</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <label class="field">Name<input type="text" id="rNewName" placeholder="e.g. Upper focus, 6 days"></label>
    <p class="small muted">Three empty training days with rest days between. It is not active until you tap Make active.</p>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="rNewSave">Create</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
  }else if(m.kind==='exMus'){
    const e=EX(m.exId);const v3=mapView()==='3d';const pm=exMusParts(e);B3.ex={main:pm.main,help:pm.help};if(B3.yawKeep==null)B3.yawKeep=B3.yaw;
    h=`<div class="sheet exmus" role="dialog" aria-modal="true" aria-labelledby="exMusH"><div class="sheet-h"><h3 id="exMusH">Muscles: ${esc(e.name)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    ${exMusWords(e)}
    <div class="seg" role="group" aria-label="View" style="margin-top:8px"><button class="chip ${v3?'':'on'}" data-act="mapView" data-v="flat" aria-pressed="${!v3}">Flat</button><button class="chip ${v3?'on':''}" data-act="mapView" data-v="3d" aria-pressed="${v3}">3D</button></div>
    ${v3?`<div class="bm3d" id="bm3dx"><div class="bm3d-stage" role="img" aria-label="${esc(`3D body with ${ML[pm.main]||pm.main} lit${pm.help.length?', helpers lighter':''}. Drag sideways to turn it.`)}"></div><p class="bm3d-msg small muted" hidden></p><div class="seg bm3d-turn" role="group" aria-label="Turn the body"><button class="chip" data-act="map3dTurn" data-v="0">Front</button><button class="chip" data-act="map3dTurn" data-v="1">Side</button><button class="chip" data-act="map3dTurn" data-v="2">Back</button></div></div>`:exBodyFlat(e)}
    ${exMusLegend(e)}</div>`;
  }else if(m.kind==='goal'){
    const e=EX(m.exId);const g=e.goal;
    h=`<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="goalH"><div class="sheet-h"><h3 id="goalH">Goal: ${esc(e.name)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <div class="grid2"><label class="field">${e.bw?`Added load (${U()})`:`Load (${U()}${loadNote(e)})`}<input type="text" inputmode="decimal" id="goalW" value="${g?fmtW(g.w):''}" placeholder="${e.bw?'0':''}"></label>
    <label class="field">Reps<input type="text" inputmode="numeric" id="goalR" value="${g?g.r:''}"></label></div>
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="goalSave">Save</button>${g?'<button class="btn danger" data-act="goalClear">Remove goal</button>':''}<button class="btn" data-act="mClose">Cancel</button></div></div>`;
  }else if(m.kind==='inc'){
    const e=EX(m.exId);
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Load step: ${esc(e.name)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <label class="field">Step (${U()})<input type="text" inputmode="decimal" id="incVal" value="${fmtW(incOf(e,m.plan))}"></label>
    <p class="small muted">The smallest jump the machine or dumbbells allow. Earned increases are whole multiples of it.</p>
    ${e.inc==null&&gymRack(e,m.plan)?`<p class="small" style="margin:0">Following the ${rackKind(e)==='dumbbell'?'dumbbells':'kettlebells'} in Settings > Your gym. A step saved here replaces them for this lift.</p>`:''}
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="incSave">Save</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
  }else if(m.kind==='cardio'){
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Log cardio or mobility</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <div class="grid2"><label class="field">Date<input type="date" id="cDate" value="${today()}" max="${today()}"></label><label class="field">Type<select id="cKind">${CARDIO.map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></label></div>
    <div class="grid2" style="margin-top:8px"><label class="field">Minutes<input type="text" inputmode="numeric" id="cMin"></label><label class="field">Avg heart rate<input type="text" inputmode="numeric" id="cHr" placeholder="optional"></label></div>
    <label class="field" style="margin-top:8px">Distance (${distU()})<input type="text" inputmode="decimal" id="cDist" placeholder="optional"></label>
    <label class="field" style="margin-top:8px">Note<input type="text" id="cNote" placeholder="e.g. 3.2 mph, 12% incline"></label>
    <p class="small muted hastip" data-tip="For cardio before or after lifting, add it inside the session. Cardio never counts as a lifting session or toward your streak.">Logged on its own.</p>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="cardioSave">Save</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
  }else if(m.kind==='quick'){
    const d=state.draft;const b=d&&d.ex[m.b];if(!b){ui.modal=null;el.hidden=true;return;}const ex=EX(b.exId);
    // Examples in the unit in use (r30: the kg example still said 235x5).
    // RPE when effort is entered as RPE (r33): the examples and @ follow it.
    const kg=U()==='kg';const rp=rirScale()==='rpe';const tail=rp?'rpe 9':'rir 1';const eg1=kg?`100x5, 5, 4 ${tail}`:`235x5, 5, 4 ${tail}`,eg2=rp?(kg?'80x8@8 90x6@9':'185x8@8 205x6@9'):(kg?'80x8@2 90x6@1':'185x8@2 205x6@1'),ph=kg?`100x5, 5, 4 ${tail}`:`225x5, 5, 4 ${tail}`;
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${esc(ex.name)}: type sets</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    ${ex.timed?'<p class="small muted" style="margin:0">Timed hold: the number after x is seconds, for example <b>25x45, 40</b> or <b>bw x 60, 50</b>.</p>':''}
    <p class="small muted">Loads in ${U()}${loadNote(ex)}${ex.bw?', added to bodyweight (bw or bw+25)':''}. <b>${eg1}</b> or <b>${eg2}</b>. <span class="hastip" data-tip="Type or use the keyboard's dictation mic. ${rp?'rpe':'rir'} at the end applies to every set; @ gives ${effWord()} per set. A bare number repeats the last load. Sets fill from the first one not done and are marked done.${aiOn()?' Anything this cannot read is passed to Claude.':''}">More</span></p>
    <input type="text" id="qTxt" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(m.text||'')}" placeholder="${ex.bw?'bw x 10, 8, 7':ph}" enterkeyhint="done">
    ${m.err?`<p class="small" style="color:var(--red);margin:8px 0 0">${esc(m.err)}</p>`:''}${''}
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="qFill" ${m.busy?'disabled':''}>Fill sets</button>${m.busy?'<button class="btn" data-act="aiStop">Stop</button>':''}<button class="btn" data-act="mClose">Cancel</button></div></div>`;
  }else if(m.kind==='max'){
    const e=EX(m.exId);
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Heaviest available: ${esc(e.name)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <label class="field">Load (${U()}${e.bw?', added to bodyweight':''})<input type="text" inputmode="decimal" id="maxVal" value="${e.maxLoad!=null?fmtW(e.maxLoad):''}" placeholder="No limit"></label>
    <p class="small muted">Top of the stack or biggest dumbbell. Blank for no limit.</p>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="maxSave">Save</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
  }else if(m.kind==='cal'){
    const d=state.draft;const b=d&&d.ex[m.b];if(!b){ui.modal=null;el.hidden=true;return;}const ex=EX(b.exId);
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Calibration set: ${esc(ex.name)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <p class="small muted" style="margin:0">Checks how well you call reps in reserve. Only take a set to failure where it is safe: a machine or cable, or with a spotter.</p>
    <ol class="steps"><li>Use your normal working load.</li><li>At the rep where you would usually stop, note that rep and how many you think are left.</li><li>Keep going until you cannot complete a rep with good form.</li></ol>
    <div class="grid2"><label class="field">Load (${ex.bw?'+'+U():U()})<input type="text" inputmode="decimal" id="calW" value="${esc(m.w!=null?m.w:'')}"></label>
    <label class="field">Usual stop rep<input type="text" inputmode="numeric" id="calAt" value="${esc(m.at||'')}"></label>
    <label class="field">Reps left, your call<select id="calPred">${[0,1,2,3,4,5].map(v=>`<option value="${v}" ${+m.pred===v?'selected':''}>${v}</option>`).join('')}</select></label>
    <label class="field">Reps to failure<input type="text" inputmode="numeric" id="calTot" value="${esc(m.total||'')}"></label></div>
    ${m.err?`<p class="small" style="color:var(--red);margin:8px 0 0">${esc(m.err)}</p>`:''}
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="calSave">Save set</button><button class="btn" data-act="mClose">Cancel</button></div>
    <p class="small muted" style="margin:8px 0 0">It is saved as a done set at 0 RIR, marked as a check. With RIR set to Corrected in Settings, your typical miss is applied to the RIR you log.</p></div>`;
  }else if(m.kind==='short'){
    const d=state.draft;if(!d){ui.modal=null;el.hidden=true;return;}
    const left=remainMin(d);const pl=m.mins?shortPlan(d,m.mins):null;
    const body=!left?'<p class="small">Nothing is left to trim: every planned set is done.</p>'
      :!pl?''
      :pl.changes.length?`<ul class="short-list">${pl.changes.map(c=>`<li>${esc(c)}</li>`).join('')}</ul><p class="small muted" style="margin:6px 0 0">${estMin(min5(pl.est))} after the change.${pl.over?' Still over, because exercises you have started are kept.':''} Done sets are never touched.</p>`
      :`<p class="small">Everything left fits in ${m.mins} minutes as planned.</p>`;
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Short on time</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    ${left?`<p class="small muted" style="margin:0 0 8px">How long do you have? Planned: ${estMin(min5(left))}.</p>
    <div class="chips">${[15,20,30,45,60,75].map(v=>`<button class="chip ${m.mins===v?'on':''}" data-act="shortPick" data-v="${v}" aria-pressed="${m.mins===v}">${v} min</button>`).join('')}</div>`:''}
    ${body}
    <div class="row" style="margin-top:12px">${pl&&pl.changes.length?'<button class="btn primary" data-act="shortApply">Trim the session</button>':''}<button class="btn" data-act="mClose">${pl&&pl.changes.length?'Cancel':'Close'}</button></div>
    <p class="small muted hastip" style="margin:8px 0 0" data-tip="Kept longest: priority and lagging muscles, exercises you have started, and at least one exercise per muscle. The rest lose sets down to 2, then drop out, later exercises first. Trimmed work does not count against trends. Undo is in the message after.">What gets cut first</p></div>`;
  }else if(m.kind==='note'){
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${esc(m.title)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <p class="small muted">Saved with this session and shown next time: a cue, a niggle, which machine.</p>
    <textarea id="mNote" aria-label="Note" style="min-height:110px">${esc(m.text||'')}</textarea>
    <div class="row" style="margin-top:10px"><button class="btn primary" data-act="noteSave">Save note</button><button class="btn" data-act="mClose">Cancel</button></div></div>`;
  }else if(m.kind==='startAlt'){
    h=startAltSheet(m);
  }else if(m.kind==='pickToday'){
    const rk=rankDays();const top=rk.rows.slice(0,3);
    const plan=rk.rows.find(x=>x.plan);const best=top[0];
    let lead='';
    if(!best)lead='<p class="small">Your active routine has no training days with exercises. Start a freestyle session and use Pick for me inside it.</p>';
    else if(best.ready<0.5)lead=`<p class="callout yellow" style="margin:0">Everything your routine has left leans on muscles still recovering from the last few days. A rest day, or easy cardio and mobility, is the better call. If you train anyway, the first option is the least fatigued.</p>`;
    else if(best.plan)lead='<p class="small" style="margin:0">Stick with the plan: it is also the best fit for today.</p>';
    else if(plan)lead=`<p class="small" style="margin:0">${esc(best.day.name)} fits today better than ${esc(plan.day.name)}, next in your plan: ${plan.ready<1?`${esc(plan.day.name)} leans on muscles that may still be recovering.`:'it trains what is furthest behind this week.'} ${tipi('Starting it moves your cycle on from there, the same as choosing it under Change day.','About the cycle')}</p>`;
    const sameDay=sessionsOn(today()).length>0;
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Pick for me</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    ${lead}${sameDay?'<p class="small muted" style="margin:8px 0 0">Includes the session you logged today.</p>':''}${rk.deload?'<p class="small muted" style="margin:8px 0 0">Deload week: counted at half the sets.</p>':''}
    ${top.map((x,k)=>`<div class="pcard${k===0?' best':''}"><div class="row spread"><b>${esc(dayLabel(rk.R,x.i))}: ${esc(x.day.name)}</b>${k===0?'<span class="tag green">Best fit</span>':''}</div>
      <ul>${dayReasons(x,rk.r7).map(r=>`<li>${esc(r)}</li>`).join('')}</ul>
      <div class="row" style="margin-top:8px"><button class="btn sm ${k===0?'primary':''}" data-act="startSession" data-day="${x.i}">Start</button>${!rk.deload&&x.ready<0.85?`<button class="btn sm" data-act="startSession" data-day="${x.i}" data-light="1">Start lighter</button>`:''}<button class="btn sm" data-act="pickView" data-day="${x.i}">Preview</button></div></div>`).join('')}
    <p class="small muted hastip" style="margin:10px 0 0" data-tip="Ranked by what each muscle got in the last 7 days against your targets, how recently it was trained hard (about 1 to 3 days, more after failure sets, new lifts, or heavy hinges), injuries, and your cycle order. A ranking, not a rule: how you feel wins.">How this is ranked</p></div>`;
  }else if(m.kind==='pickEx'){
    const d=state.draft;if(!d){ui.modal=null;el.hidden=true;return;}
    const picks=rankExercises(d);
    const allMet=picks.length&&picks.every(x=>x.def<=0);
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Pick for me</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <p class="small muted hastip" style="margin:0" data-tip="From this session so far, your last 7 days against your targets, recovery, injuries, and your trends.">What to add next.</p>
    ${allMet?'<p class="callout green" style="margin:8px 0 0">Every muscle is at or above target for the last 7 days. Anything more is optional.</p>':''}
    ${picks.length?picks.map((x,k)=>{const p=x.plan;const ex=x.e;const mins=Math.round((p.sets*(setSecs(ex,p)+(+p.rest||0))+setupSecs(ex,2))*pace()/60);return `<div class="pcard${k===0?' best':''}"><div class="row spread" style="flex-wrap:nowrap;align-items:flex-start"><span style="min-width:0"><b>${esc(ex.name)}</b><br><span class="small muted">${p.sets} × ${repSpan(p.repMin,p.repMax,'-')}${ex.timed?'s':''}${ex.perSide?' per side':''} · ${estMin(mins)}</span></span>${k===0?'<span class="tag green">Best fit</span>':''}</div>
      <ul>${exReasons(x).map(r=>`<li>${esc(r)}</li>`).join('')}</ul>
      <div class="row" style="margin-top:8px"><button class="btn sm ${k===0?'primary':''}" data-act="pickExAdd" data-ex="${ex.id}" data-sets="${p.sets}" data-full="${x.full}">Add to session</button></div></div>`;}).join(''):'<p class="small">Nothing in your library fits: every exercise is already in this session or loads an injury.</p>'}
    <div class="row" style="margin-top:10px"><button class="btn sm" data-act="pickSession">Browse all exercises</button></div></div>`;
  }else if(m.kind==='eq'){
    const R=activeRoutine();const day=R.days[m.day];if(!day){ui.modal=null;el.hidden=true;return;}
    const eq=new Set(m.equip);const pl=eqPlan(day,eq);const sw=pl.filter(x=>x.from);
    /* A fixed-height sheet with the chips at the top (r30): the sheet grew
       upward as swaps were listed, so the chips moved under the finger and
       the next tap landed on the wrong one. */
    h=`<div class="sheet fixed" role="dialog" aria-modal="true"><div class="sheet-h"><h3>Limited equipment</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <p class="small muted" style="margin:0 0 8px">Turn off what this gym lacks. Each affected exercise is swapped for the closest same-muscle match.</p>
    <div class="chips">${EQUIP.map(([k,l])=>`<button class="chip ${eq.has(k)?'on':''}" data-act="eqToggle" data-k="${k}" aria-pressed="${eq.has(k)}">${l}</button>`).join('')}</div>
    <div class="sheet-scroll">${sw.length?`<ul class="eqsw">${sw.map(x=>`<li>${esc(exName(x.from))} → ${x.to?`<b>${esc(exName(x.to))}</b>${x.hard?'<br><span class="small" style="color:var(--yellow)">Much harder than what it replaces: aim for 3 to 6 reps, use a band or a shorter range, and stop 2 reps short.</span>':''}`:'<span class="muted">no match with this equipment, left out</span>'}</li>`).join('')}</ul>`:'<p class="small" style="margin:10px 0 0">Everything in this workout fits the equipment on.</p>'}
    <div class="row" style="margin-top:12px"><button class="btn primary" data-act="eqStart" ${pl.some(x=>x.to)?'':'disabled'}>Start ${esc(day.name)}</button><button class="btn" data-act="mClose">Cancel</button></div>
    <p class="small muted" style="margin:8px 0 0">Sets, reps, and rest as planned (a much harder swap gets 3 to 6 reps); swaps are for this session only.</p></div></div>`;
  }else if(m.kind==='text'){
    h=`<div class="sheet" role="dialog" aria-modal="true"><div class="sheet-h"><h3>${esc(m.title)}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
    <p class="small muted">${esc(m.help)}</p><textarea id="mText" aria-label="${esc(m.title||'Text')}" style="min-height:220px;font-size:13px" ${m.readonly?'readonly':''}>${esc(m.text||'')}</textarea>
    <div class="row" style="margin-top:10px">${m.readonly?'<button class="btn primary" data-act="copyText">Copy</button>':'<button class="btn primary" data-act="importText">Import</button>'}<button class="btn" data-act="mClose">Close</button></div></div>`;
  }
  // The account sheet redrawn while signing in keeps its fields, so the one in use stays under the keyboard (r54, src/app/sheets.ts).
  if(!(keep&&m.kind==='account'&&morphInto(el,h)))el.innerHTML=h;el.hidden=false;const sh=el.querySelector('.sheet');
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
  if(m.mode==='addDay'){const R=curRoutineB();const d=R.days[m.day];closeModal();if(!d){rerenderKeepScroll();return;}d.items.push(newItem(id));trainOn(d);commit();rerenderKeepScroll();toast(`${exName(id)} added to ${dayLabel(R,m.day)}`);return;}
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
  el.classList.remove('flash');void el.offsetWidth;el.classList.add('flash');
}

