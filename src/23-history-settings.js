/* ---------- HISTORY ---------- */
/* A session's start time, for telling two sessions on one day apart. */
function sessTm(x){try{return x.t?new Date(x.t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'';}catch(e){return '';}}
function viewHistory(){
  const ss=[...state.sessions].sort((a,b)=>sessCmp(b,a));
  // Rows that share a date show their start time, or two sessions on one day look the same.
  const perDay={};for(const x of ss)perDay[x.date]=(perDay[x.date]||0)+1;
  const I=IDX();
  const real=ss.filter(x=>!x.demo).length;
  let h=pageHead('','History',noLog()?'Nothing logged yet':`${ss.length} session${ss.length===1?'':'s'}${ss.length&&real!==ss.length?` (${ss.length-real} demo)`:''}`,'<button class="btn sm" data-act="calOpen">Calendar</button><button class="btn sm" data-act="pastOpen">Log a past workout</button>');
  const cs=[...state.cardio].sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  if(cs.length)h+=sec({sk:'history:cardio',key:'cardio',title:'Cardio and mobility',sub:`${cs.length} entr${cs.length===1?'y':'ies'}`,body:`<ul class="clist">${cs.slice(0,40).map(c=>`<li><span><b>${esc(CARDIOL[c.kind])}</b> <span class="small muted">${fmtDate(c.date)} · ${c.min} min${c.dist?` · ${distShow(c.dist)} ${distU()}`:''}${c.hr?` · ${c.hr} bpm`:''}${c.when!=='solo'?' · '+CWHENL[c.when].toLowerCase():''}${c.note?' · '+esc(c.note):''}</span></span><button class="ib sm" data-act="cardioDel" data-id="${c.id}" aria-label="Delete ${fmtDate(c.date)} cardio">✕</button></li>`).join('')}</ul>${cs.length>40?`<p class="small muted">${cs.length-40} older entries are in the CSV export.</p>`:''}`});
  const tr=state.trash||[];
  if(tr.length)h+=sec({sk:'history:trash',key:'trash',title:'Recently deleted',sub:`<span class="hastip" data-tip="${esc(`The ${TRASH_MAX} most recent deletions, each kept ${TRASH_DAYS} days`)}">${tr.length}</span>`,body:`<ul class="clist">${tr.map(x=>{const nm=x.kind==='session'?`${x.data.dayName||'Session'}, ${fmtDate(x.data.date)}`:x.kind==='cardio'?`${CARDIOL[x.data.kind]||'Cardio'}, ${fmtDate(x.data.date)}`:`Routine: ${x.data.name||'Routine'}`;return `<li><span>${esc(nm)} <span class="small muted">deleted ${fmtDate(x.date)}</span></span><span class="row" style="gap:6px;flex:none"><button class="btn sm" data-act="restore" data-id="${x.id}" data-k="${x.kind}">Restore</button><button class="ib sm" data-act="trashDel" data-id="${x.id}" data-k="${x.kind}" aria-label="Delete ${esc(nm)} for good">✕</button></span></li>`;}).join('')}</ul><p class="small" style="margin:10px 0 0"><button class="linkbtn" style="min-height:44px" data-act="trashEmpty">Delete all for good</button></p>`});
  const impLine='<p class="small" style="margin:14px 0 0"><button class="linkbtn" style="min-height:44px" data-act="impOpen" data-tip="From notes, a spreadsheet, or an export from another app. You check it before anything is saved.">Import workouts</button></p>';
  if(!ss.length)return h+'<div class="card"><p style="margin:0">No sessions yet. Start one on Today, or log one you did without the app with Log a past workout.</p></div>'+impLine+moreLine('history');
  const withData=Object.keys(I.byEx).sort((a,b)=>exName(a).localeCompare(exName(b)));
  if(ui.histEx&&!I.byEx[ui.histEx])ui.histEx='';
  let body=`<label class="field">Show sessions with<select data-bind="histEx"><option value="">Any exercise</option>${withData.map(id=>`<option value="${id}" ${ui.histEx===id?'selected':''}>${esc(exName(id))}</option>`).join('')}</select></label><div style="margin-top:6px">`;
  const shown=ui.histEx?ss.filter(x=>x.ex.some(b=>b.exId===ui.histEx)):ss;
  if(!shown.length)body+='<p class="muted">No sessions with that exercise.</p>';
  // Every session used to be rebuilt into one string on every render. Past a
  // few hundred logs that is a visible stall on a phone for rows nobody has
  // scrolled to yet.
  const page=shown.slice(0,ui.histLimit);
  /* Sessions sit under their week (Monday start), with the week's totals on
     the header, so a light or missed week shows without counting rows. The
     totals cover every session of that week in the current filter, not only
     the rows loaded so far. */
  const wkTot={};
  for(const s of shown){const w=weekStart(s.date);const o=wkTot[w]||(wkTot[w]={n:0,sets:0,vol:0});o.n++;o.sets+=s.ex.reduce((a,b)=>a+b.sets.filter(isWork).length,0);o.vol+=(I.sessVol.find(v=>v.id===s.id)||{}).vol||0;}
  const thisWk=weekStart(today());let lastWk=null;
  for(const s of page){
    const wk=weekStart(s.date);
    if(wk!==lastWk){lastWk=wk;const o=wkTot[wk];const lbl=wk===thisWk?'This week':wk===addDays(thisWk,-7)?'Last week':`Week of ${fmtDate(wk)}`;
      body+=`<div class="hweek"><span class="hw-t">${lbl}</span><span class="hw-s" data-tip="${esc(`${o.n} session${o.n===1?'':'s'}, ${o.sets} working sets, ${Math.round(toD(o.vol)).toLocaleString()} ${U()} lifted`)}">${o.sets} sets · ${fmtK(o.vol)} ${U()}</span></div>`;}
    const nSets=s.ex.reduce((a,b)=>a+b.sets.filter(isWork).length,0);const vol=(I.sessVol.find(v=>v.id===s.id)||{}).vol||0;const open=ui.histOpen===s.id;
    body+=`<div class="hitem${open?' open':''}"><button class="pick" style="border:0;padding:0" data-act="histToggle" data-id="${s.id}" aria-expanded="${open}"><span style="min-width:0"><b>${esc(s.dayName||'Session')}</b>${s.deload?' <span class="tag blue">deload</span>':''}${s.free&&!/freestyle/i.test(s.dayName||'')?' <span class="tag">freestyle</span>':''}${s.ex.some(b=>b.cut)?' <span class="tag">trimmed</span>':''}${s.demo?' <span class="tag">demo</span>':''}<br><span class="small muted">${fmtDateRow(s.date)}${perDay[s.date]>1&&sessTm(s)?`, ${sessTm(s)}`:''}</span></span><span class="num small" style="text-align:right;flex:none">${nSets} sets<br><span class="muted">${Math.round(toD(vol)).toLocaleString()} ${U()}${s.durMin?` · ${s.durMin} min`:''}</span></span></button>`;
    if(ui.histEx&&!open){const b=s.ex.find(x=>x.exId===ui.histEx);const ex=EX(ui.histEx);if(b)body+=`<p class="small" style="margin:6px 0 0">${b.sets.map(x=>setStr(ex,x)).join(', ')}${histUnits(ex)}</p>`;}
    if(open){
      body+='<div class="panel" style="margin-top:10px">';
      if(s.chk)body+=`<p class="small muted" style="margin:0 0 6px">Check-in: ${CHK_Q.filter(([k])=>s.chk[k]).map(([k,l,n])=>`${l.toLowerCase()} ${chkWord(n[s.chk[k]-1])}`).join(', ')}</p>`;
      body+=s.ex.map(b=>{const ex=EX(b.exId);return `<p class="small" style="margin:0 0 6px"><b>${esc(ex.name)}</b>: ${b.sets.map(x=>setStr(ex,x)).join(', ')}${histUnits(ex)}${b.note?`<br><span class="muted">${esc(b.note)}</span>`:''}</p>`;}).join('');
      if(s.notes)body+=`<p class="small muted" style="margin:0 0 6px">${esc(s.notes)}</p>`;
      body+=`<div class="row" style="margin-top:8px"><button class="btn sm" data-act="histEdit" data-id="${s.id}">Edit</button><button class="btn sm" data-act="histRepeat" data-id="${s.id}" data-tip="Start a new session today with these exercises">Do again</button><button class="btn sm danger" data-act="histDel" data-id="${s.id}">Delete</button></div></div>`;
    }
    body+='</div>';
  }
  body+='</div>';
  if(shown.length>page.length)body+=`<button class="btn block" style="margin-top:10px" data-act="histMore">Show ${Math.min(HIST_PAGE,shown.length-page.length)} more (${page.length} of ${shown.length})</button>`;
  h+=sec({sk:'history:sessions',key:'sessions',title:'Sessions',sub:ui.histEx?`${shown.length} with ${esc(exName(ui.histEx))}`:`since ${fmtDate(ss[ss.length-1].date)}`,body,def:true});
  h+=impLine;
  h+=moreLine('history');
  return h;
}

/* ---------- SETTINGS ---------- */
/* Your gym (r33, item 207). Dumbbell fields are kept as typed (ui.gymDb)
   until From, To, and Step make a rack, so a half-filled form is never
   thrown away or saved. */
function gymSub(){const g=gymOf();if(!g)return 'usual steps';const L=dbListOf(g.db);const parts=[];if(L)parts.push(`dumbbells ${fmtG(L[0])} to ${fmtG(L[L.length-1])} ${g.u}`);if(g.kb)parts.push(`${g.kb.length} kettlebell${g.kb.length===1?'':'s'}`);if(g.plates)parts.push('plates');if(g.stack)parts.push(`stacks by ${fmtG(g.stack)}`);return parts.join(', ')||'usual steps';}
const fmtG=v=>String(Math.round(v*1000)/1000);
function gymSettings(){
  const g=gymOf();const u=gymUnit();const d=ui.gymDb||(g&&g.db)||{};const v=k=>d[k]==null||!isFinite(d[k])?'':fmtG(d[k]);
  const lb=u==='lb';const L=dbListOf(g&&g.db);const plates=gymPlates(u);const on=g&&g.plates?g.plates:plates;
  const listTxt=a=>a.length>9?`${a.slice(0,5).map(fmtG).join(', ')} … ${a.slice(-2).map(fmtG).join(', ')}`:a.map(fmtG).join(', ');
  const half=ui.gymDb&&!dbListOf(ui.gymDb);const pair=ui.gymDb&&!half&&(ui.gymDb.fine==null)!==(ui.gymDb.fineTo==null);
  return `${helpText('gym','What your gym has, so suggested loads are ones you can pick up. Blank keeps the usual steps (5 lb or 2.5 kg, and dumbbells read from what you log). A step set on an exercise or in your plan still wins for that lift.')}
  <div><p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip="Type the weights as they are labelled in your gym. Suggestions show in the app's unit and land on these weights.">Labelled in</span></p><div class="ob-units" role="group" aria-label="Your gym's weights are labelled in">${['lb','kg'].map(k=>`<button class="chip ${u===k?'on':''}" data-act="gymUnit" data-v="${k}" aria-pressed="${u===k}">${k}</button>`).join('')}</div></div>
  ${u!==U()?`<p class="small" style="margin:0">Suggestions show in ${U()}, on the ${u} weights below.</p>`:''}
  <label class="field"><span class="hastip" data-tip="Used by the plates-per-side line in the logger.">Bar weight (${U()})</span><input type="text" inputmode="decimal" data-bind="barKg" value="${fmtW(barKg())}"></label>
  <div><p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip="A barbell or a plate-loaded machine steps by two of the smallest plate you have, one a side; a landmine by one. Tap a plate your gym does not have.">Plates on hand (${u})</span></p>
  <div class="chips" role="group" aria-label="Plates on hand">${plates.map(p=>`<button class="chip ${on.includes(p)?'on':''}" data-act="gymPlate" data-v="${p}" aria-pressed="${on.includes(p)}">${fmtG(p)}</button>`).join('')}</div></div>
  <label class="check-inline"><input type="checkbox" data-bind="smallPlates" ${state.settings.smallPlates?'checked':''}><span class="hastip" data-tip="Adds them to the plates-per-side line. A lift's own bar, such as a trap or EZ bar, is set in its exercise editor.">Small plates (${((gymOf()||{}).u||U())==='kg'?'0.5 kg':'1.25 lb'})</span></label>
  <div><p class="small muted" style="margin:0 0 6px;font-weight:600">Dumbbells (${u})</p>
  <div class="grid3"><label class="field">From<input type="text" inputmode="decimal" data-gym="db.lo" value="${v('lo')}" placeholder="${lb?5:2}"></label><label class="field">To<input type="text" inputmode="decimal" data-gym="db.hi" value="${v('hi')}" placeholder="${lb?120:50}"></label><label class="field">Step<input type="text" inputmode="decimal" data-gym="db.st" value="${v('st')}" placeholder="${lb?5:2}"></label></div>
  <div class="grid2" style="margin-top:6px;align-items:end"><label class="field"><span class="hastip" data-tip="Many racks go up in smaller steps at the light end, such as 2.5 lb up to 25, or 1 kg up to 10. Leave blank if yours does not.">Lighter end steps by</span><input type="text" inputmode="decimal" data-gym="db.fine" value="${v('fine')}" placeholder="${lb?2.5:1}"></label><label class="field">Up to<input type="text" inputmode="decimal" data-gym="db.fineTo" value="${v('fineTo')}" placeholder="${lb?25:10}"></label></div>
  <p class="small ${half?'':'muted'}" id="gymDbList" style="margin:6px 0 0">${half?'Add From, To, and Step to use these.':L?`${L.length} pairs: ${listTxt(L)} ${u}${pair?'. Add both smaller-step fields to use them.':''}`:'Not set: dumbbell steps are read from what you log.'}</p></div>
  <label class="field"><span class="hastip" data-tip="The weights you have, any order, separated by commas.">Kettlebells (${u})</span><input type="text" inputmode="decimal" data-gym="kb" value="${g&&g.kb?g.kb.map(fmtG).join(', '):''}" placeholder="${lb?'18, 26, 35, 44, 53':'8, 12, 16, 20, 24'}"></label>
  <label class="field"><span class="hastip" data-tip="The usual step between pins on your cable and machine stacks. A machine that differs gets its own step in its exercise.">Cable and machine stacks step by (${u})</span><input type="text" inputmode="decimal" data-gym="stack" value="${g&&g.stack?fmtG(g.stack):''}" placeholder="${lb?5:2.5}"></label>
  ${g?'<button class="btn sm" data-act="gymClear">Clear my gym</button>':''}`;
}
// The unit the gym's weights are labelled in: chosen in Your gym (ui.gymU until anything is saved), else the app's.
function gymUnit(){const g=gymOf();return g?g.u:ui.gymU||U();}
function gymNext(){const g=gymOf();return g?JSON.parse(JSON.stringify(g)):{u:gymUnit()};}
// A session in progress takes the new loads on exercises with nothing ticked yet; typed loads are never touched.
/* After a unit change, a session in progress says its targets and last time
   in the new unit (r34.2, from the review: "at 60 kg" beside fields in lb).
   Only the words: the loads are stored in kg and stay as they are, and a
   suggestion is re-read without the unit's rounding so it names the same
   load the rows hold. */
function unitWords(){
  const d=state.draft;if(!d)return;invalidate();
  for(const b of d.ex){if(d.deload||d.light||b.light||b.inj)continue;const sg=suggestCore(b.exId,b.plan,{before:d.date});
    if(b.sw!=null&&sg.w!=null&&Math.abs(sg.w-b.sw)>1e-6)continue;Object.assign(b,{hint:sg.text,last:sg.last,prev:sg.prev||undefined,prevOff:sg.prevOff||undefined,target:sg.target,easier:sg.easier||null});}
  saveNow();
}
function gymRefresh(){invalidate();if(state.draft)for(const id of new Set(state.draft.ex.map(b=>b.exId)))refreshEx(id);}
function gymSave(g){const c=gymClean(g);if(JSON.stringify(c||null)===JSON.stringify(gymOf()||null)){rerenderKeepScroll();return;}snapshot();if(c)state.settings.gym=c;else delete state.settings.gym;gymRefresh();commit();rerenderKeepScroll();}
function gymInput(t){
  const k=t.dataset.gym,v=t.value.trim();const g=gymNext();
  if(k==='kb'){g.kb=v?v.split(/[;,\s]+/).map(numIn).filter(x=>x!=null):[];gymSave(g);return;}
  if(k==='stack'){g.stack=numIn(v);gymSave(g);return;}
  const f=k.slice(3);const d={...(ui.gymDb||g.db||{})};const n=numIn(v);if(n==null)delete d[f];else d[f]=n;
  if(!Object.keys(d).length){ui.gymDb=null;delete g.db;gymSave(g);return;}
  // A rack: saved. The smaller step needs both its fields; until then the rack is used without it and the typed one stays on screen.
  if(dbListOf(d)){g.db=d;ui.gymDb=(d.fine==null)!==(d.fineTo==null)?d:null;gymSave(g);return;}
  // Not a rack yet: keep what was typed on screen only, and take the old rack out of use.
  ui.gymDb=d;if(g.db){delete g.db;gymSave(g);}else rerenderKeepScroll();
}
/* Your training (r44, item 271). Each choice taps on and off; nothing here
   is needed, and with nothing set the app is as before. */
function profChips(k,opts,cur,label){return `<div class="ob-units" role="group" aria-label="${label}">${opts.map(([v,l])=>`<button class="chip ${cur===v?'on':''}" data-act="profSet" data-k="${k}" data-v="${v}" aria-pressed="${cur===v}">${l}</button>`).join('')}</div>`;}
function profFields(){
  const p=prof();
  return `<div><p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip="${esc(PROF_GOAL_TIP)}">Goal</span></p>${profChips('goal',PROF_GOALS,p.goal,'Goal')}</div>
  <div><p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip="${esc(PROF_EXP_TIP)}">Years lifting</span></p>${profChips('exp',PROF_EXP,p.exp,'Years lifting')}</div>
  <div><p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip="Ready-made routines that fit are marked when you pick one. Every other day fits 3 or 4.">Days a week</span></p>${profChips('days',PROF_DAYS.map(d=>[d,String(d)]),p.days,'Days a week')}</div>`;
}
const PROF_GOAL_TIP='Size keeps the app\'s defaults. Strength: new barbell, Smith, and machine compounds start at 3 to 6 reps, 2 in reserve, 3 minutes\' rest. Heavier loads gave more strength for similar growth (Schoenfeld 2017; ACSM 2009), and 3 minutes\' rest beat 1 (Schoenfeld 2016). Both starts them at 5 to 8; that and the 2 in reserve are conventions. Strength also favours stalled or near-best compounds in Pick for me. Your routine changes only with Apply.';
const PROF_EXP_TIP='Under 1 year, whatever the goal: new exercises start at 8 to 12 reps (ACSM 2009). Compounds stop 3 reps short and isolation lifts 2, as in the beginner plan, a convention: easier to judge, further from failure. Apply raises reps in reserve to that and keeps your ranges.';
const PROF_FOCUS_TIP='Up to two. Their weekly targets go up about 30% and the other major muscles drop to maintenance, a third of the usual minimum (size and strength held on a third of the volume: Bickel 2011, Spiering 2021). Only targets you have not typed move, and taking a focus off puts them back. Pick for me favours them.';
function profSub(){const p=prof();const a=[];if(p.goal)a.push(PROF_GOALS.find(g=>g[0]===p.goal)[1]);if(p.days)a.push(`${p.days} days`);if(p.focus)a.push(p.focus.map(m=>ML[m]).join(', '));if(state.settings.timeBudget)a.push(`${state.settings.timeBudget} min`);return a.join(' · ')||'optional';}
function profSettings(){
  const s=state.settings;const p=prof();const f=p.focus||[];const R=activeRoutine();const ap=profApplyList(R);
  return `${profFields()}
  <label class="field"><span class="hastip" data-tip="Planned days whose time estimate runs over it are flagged. Rest per exercise is set in Plan; 0 s means no timer.">Lifting time budget (minutes)</span><input type="text" inputmode="numeric" data-bind="timeBudget" value="${s.timeBudget==null?'':s.timeBudget}" placeholder="e.g. 70"></label>
  <div><p class="small muted" style="margin:0 0 6px;font-weight:600"><span class="hastip" data-tip="${esc(PROF_FOCUS_TIP)}">Focus muscles</span> <span class="muted" style="font-weight:400">${f.length} of ${FOCUS_MAX}</span></p>
  <div class="chips" role="group" aria-label="Focus muscles">${MUSCLES.filter(([k])=>!TRACK_ONLY.has(k)).map(([k,l])=>`<button class="chip ${f.includes(k)?'on':''}" data-act="profSet" data-k="focus" data-v="${k}" aria-pressed="${f.includes(k)}">${l}</button>`).join('')}</div></div>
  ${ap.length?`<div class="panel row spread" id="profApply"><p class="small" style="margin:0;flex:1 1 180px"><b>${ap.length} exercise${ap.length===1?'':'s'}</b> in ${esc(R.name)} differ from your profile.</p><button class="btn sm" data-act="profApply">Apply</button></div>`:''}`;
}
/* The save this build could not read at start (load() keeps its text aside, r45 review: before, it sat there with nothing offering it back). */
function unreadableRaw(){try{return localStorage.getItem(KEY+'.unreadable')||'';}catch(e){return '';}}
function viewSettings(){
  const s=state.settings;const hasDemo=state.sessions.some(x=>x.demo)||state.bodyweights.some(x=>x.demo);
  // Each group folds (for this visit) and moves (order is saved).
  const SUB={help:'Guide, report a problem',gym:gymSub(),general:`${s.unit==='kg'?'kg, cm':'lb, in'} · ${s.theme==='system'?'device theme':s.theme}`,profile:profSub(),timer:s.timerMode==='off'?'timer off':s.timerMode+' timer',rir:{on:'on',cal:'corrected',off:'off'}[s.rirMode],layout:s.hidden.length?`${s.hidden.length} hidden`:'everything shown',prio:s.priorities.length?s.priorities.map(m=>ML[m]).join(', '):'none',bands:'',data:cloud.on?(cloud.status==='synced'?'synced':'syncing'):'this device only',more:hasDemo?'demo data loaded':'demo data, diagnostics, erase'};
  const G=(k,title,help,id)=>`<details class="sec" ${id?`id="${id}"`:''} data-sk="settings:${k}" data-mkey="${k}" ${isOpen('settings:'+k,false)?'open':''}><summary>${sgrip(title)}<span class="sec-t">${esc(title)}</span><span class="sec-s">${esc(SUB[k]||'')}</span><span class="chev" aria-hidden="true"></span></summary><div class="sec-b">${help?helpLink(help):''}`;
  // The build number lives in Diagnostics; only the preview says what it is up top.
  return `${pageHead(ENV==='preview'?`${PREVIEW_NAME} ${VERSION_LINE}`:'','Settings',cloud.on?(window.claude?'Saved to your Claude account and this device':'Synced to your account and saved on this device'):'Saved on this device')}
  ${G('profile','Your training')}<div class="card stack">${profSettings()}</div></div></details>
  ${G('general','General')}<div class="card stack"><div class="grid2"><label class="field">Units<select data-bind="unit"><option value="lb" ${s.unit==='lb'?'selected':''}>lb and inches</option><option value="kg" ${s.unit==='kg'?'selected':''}>kg and cm</option></select></label>
  <label class="field">Theme<select data-bind="theme"><option value="system" ${s.theme==='system'?'selected':''}>Match device</option><option value="dark" ${s.theme==='dark'?'selected':''}>Dark</option><option value="light" ${s.theme==='light'?'selected':''}>Light</option></select></label></div>
  <label class="field">Name (optional)<input type="text" data-bind="userName" value="${esc(s.userName||'')}" maxlength="40" autocomplete="given-name"></label>
  <div><p class="small muted" style="margin:0 0 6px;font-weight:600">Accent colour</p><div class="chips" role="group" aria-label="Accent colour">${ACCENTS.map(([k,l])=>`<button class="chip acc ${(s.accent||ACCENT0)===k?'on':''}" data-act="accent" data-v="${k}" aria-pressed="${(s.accent||ACCENT0)===k}"><i class="sw sw-${k}" aria-hidden="true"></i>${l}</button>`).join('')}</div></div>
  <div class="grid2 one-narrow"><label class="field"><span class="hastip" data-tip="Compared with your 7-day-average bodyweight trend on Stats. Leave blank to track without a target.">Bodyweight goal (%/wk)</span><input type="text" inputmode="decimal" data-bind="bwGoalPct" value="${s.bwGoalPct==null?'':s.bwGoalPct}" placeholder="e.g. 0.3 or -0.5"></label>
  <label class="field"><span class="hastip" data-tip="A card on Today asks for your bodyweight when the last weigh-in is this old. Pull-ups, dips, and other bodyweight lifts use your latest weigh-in.">Weigh-in reminder</span><select data-bind="bwEvery">${BW_EVERY.map(([v,l])=>`<option value="${v}" ${bwEvery()===v?'selected':''}>${l}</option>`).join('')}</select></label></div>
</div></div></details>
  ${G('gym','Your gym','gym')}<div class="card stack">${gymSettings()}</div></div></details>
  ${G('timer','Rest timer and logging')}
  <div class="card stack"><label class="field"><span class="hastip" data-tip="Auto starts the timer when a set is marked done. Manual starts it from Rest on the exercise.">Rest timer</span><select data-bind="timerMode">
    <option value="auto" ${s.timerMode==='auto'?'selected':''}>Auto, after each set</option>
    <option value="manual" ${s.timerMode==='manual'?'selected':''}>Manual, from Rest</option>
    <option value="off" ${s.timerMode==='off'?'selected':''}>Off</option></select></label>
  <label class="check-inline"><input type="checkbox" data-bind="timerSound" ${s.timerSound?'checked':''} ${s.timerMode==='off'?'disabled':''}>Sound and vibration when rest ends</label>
  <label class="check-inline"><input type="checkbox" data-bind="timerCompact" ${s.timerCompact?'checked':''} ${s.timerMode==='off'?'disabled':''}><span class="hastip" data-tip="A small pill in the corner instead of a bar across the screen.">Compact timer</span></label>
  <label class="check-inline"><input type="checkbox" data-bind="autoDone" ${s.autoDone?'checked':''}><span class="hastip" data-tip="A mistyped rep count is then saved without a tap to confirm, so check the row. A tap on the checkmark right after only confirms it; tap again to undo.">Auto-mark a set done after its reps</span></label>
  <label class="check-inline"><input type="checkbox" data-bind="loadFill" ${s.loadFill==='fill'?'checked':''}><span class="hastip" data-tip="Off: a set's load shows in grey until you type one, and ticking the set takes it. On: the suggested load is typed into every row for you. Either way, a load you type is never changed.">Fill in suggested loads</span></label>
  <label class="field"><span class="hastip" data-tip="Blank: Today opens on an empty session, and you add exercises as you go; your plan's day is still one tap away. Each exercise still gets its suggested weight from your history.">Today starts with</span><select data-bind="todayStart"><option value="plan" ${state.settings.todayStart!=='free'?'selected':''}>My plan's day</option><option value="free" ${state.settings.todayStart==='free'?'selected':''}>A blank session (freestyle)</option></select></label>
  <label class="check-inline"><input type="checkbox" data-bind="autoAdj" ${adjOn()?'checked':''}><span class="hastip" data-tip="After a set that was clearly easier or harder than planned, the sets after it that you have not typed a load for move up or down. A line says why, with Keep to undo it. Two reps or more in reserve over your target, or two past the top of the range, moves up; two or more under the range moves down. A rep or two lost per set is normal and changes nothing.">Adjust the next sets from the last one</span></label>
  <label class="check-inline"><input type="checkbox" data-bind="wakeLock" ${s.wakeLock?'checked':''}><span class="hastip" data-tip="A locked phone pauses this page, so the rest alert cannot sound until you unlock. Keeping the screen on avoids that, at some battery cost.">Keep the screen on during a session</span></label>
</div></div></details>
  ${G('rir','Effort (RIR)')}<div class="card stack">${rirSettings()}</div></div></details>
  ${G('layout','Layout')}<div class="card stack">${layoutSettings()}</div></div></details>
  ${G('prio','Priority muscles','prio')}${helpText('prio','Flagged as Your priority under Muscles in Stats, and favoured by Pick for me.')}
  <div class="card chips">${MUSCLES.map(([k,l])=>`<button class="chip ${s.priorities.includes(k)?'on':''}" data-act="prio" data-m="${k}">${l}</button>`).join('')}</div></div></details>
  ${G('bands','Weekly set targets','bands')}${helpText('bands','Fractional hard sets per week: direct work 1, helper muscles 0.5 (Pelland 2025). 10 to 20 for major muscles fits the dose-response data; the upper number is typical, not a ceiling, and more still helps a little at more cost. Smaller muscles are set lower because compound lifts hit them indirectly, and their numbers are convention: no study has tested a dose for them. Serratus, rotator cuff, neck, and tibialis are tracked only. Raise one or two muscles for a specialisation block, or set focus muscles in Your training. Default targets puts every one back.')}
  <div class="card"><table class="t"><tr><th>Muscle</th><th class="r">Min</th><th class="r">Max</th></tr>${MUSCLES.map(([k,l])=>`<tr><td>${l}</td><td class="r"><input style="width:70px" type="text" inputmode="numeric" aria-label="${l} minimum hard sets a week" data-band="${k}" data-bi="0" value="${s.bands[k][0]}"></td><td class="r"><input style="width:70px" type="text" inputmode="numeric" aria-label="${l} maximum hard sets a week" data-band="${k}" data-bi="1" value="${s.bands[k][1]}"></td></tr>`).join('')}</table>
  ${/* Back to the app's numbers (r44): the defaults, with Your training's focus, and no first-run fit. */''}<div class="row" style="margin-top:8px"><button class="btn sm" data-act="bandsDefault" ${MK.every(m=>{const d=defBand(m);return s.bands[m][0]===d[0]&&s.bands[m][1]===d[1];})&&!s.bandsFit?'disabled':''}>Default targets</button></div></div></div></details>
  ${G('data','Your data','','dataSec')}
  ${(()=>{const ap=acctPanel();const one=ap&&!acct.user;return `${ap}${one?'':`<div class="panel" id="syncInfo"${ap?' style="margin-top:8px"':''}>${syncInfo()}</div>`}`;})()}
  ${canInstallHere()?`<div class="panel row spread" id="installPanel" style="margin-top:8px"><p class="small" style="margin:0;flex:1 1 180px"><b>Install the app.</b> Full screen, offline, one tap from your home screen.</p><button class="btn sm primary" data-act="install">${/^ios/.test(installKind())?'Add to Home Screen':'Install'}</button></div>`:''}
  ${ENV==='preview'?`<div class="panel row spread" style="margin-top:8px"><p class="small" style="margin:0;flex:1 1 180px"><b>Test version.</b> It keeps a separate log. Copy yours in to try it; your log in ${APP_NAME} stays as it is.</p>${previewCopyBtn('sm primary')}</div>`:''}
  ${privacyLine()}${safetyLine()}
  ${backupDue()?`<p class="callout yellow" style="margin:10px 0 0"><b>Backup due.</b> ${s.lastExport?`Last backup file ${fmtDate(s.lastExport)}.`:'No backup file yet.'} ${cloud.on?'Your account has not synced this week. Export one below.':''}</p>`:''}
  ${storageOk?'':'<p class="small" style="color:var(--red)">This browser is blocking local storage, so this device keeps nothing between reloads without cloud sync.</p>'}
  ${unreadableRaw()?`<div class="panel" id="unreadPanel" style="margin-top:8px"><p class="small" style="margin:0 0 6px"><b>A save on this device could not be read</b> by this build, and was kept aside. Restore tries it again, which a later build may read; Show its text to copy it out.</p><div class="row"><button class="btn sm primary" data-act="unreadRestore">Restore it</button><button class="btn sm" data-act="unreadShow">Show its text</button><button class="btn sm" data-act="unreadForget">Forget it</button></div></div>`:''}
  <div class="card stack"><div class="row"><button class="btn primary" data-act="export" data-tip="The backup: restores everything, on any device.">Export backup (.json)</button><button class="btn" data-act="showBackup" data-tip="The same backup as text, to copy somewhere safe.">Show backup text</button><button class="btn" data-act="exportCsv" data-tip="One row per set for spreadsheets. Import workouts reads it back, but it is not a full backup: routines and settings are not in it.">Export sets (.csv)</button></div>
  <button class="btn" data-act="impOpen" data-tip="Adds sessions from notes, a spreadsheet, or an export from another app. You check everything before it is saved.">Import workouts</button>
  <label class="field">Restore a backup file (replaces everything)<input type="file" accept=".json,application/json" id="importFile"></label>
  <button class="btn" data-act="pasteImport">Paste backup text instead</button>
  <div class="row"><button class="btn" data-act="undo" ${undoStack.length?'':'disabled'} data-tip="Deletes, resets, and imports from the last 7 days, kept after the app is closed. Edits are not undoable. Deleted sessions, cardio, and routines also wait in History for ${TRASH_DAYS} days.">Undo last delete or reset${undoStack.length?` (${undoStack.length} available)`:''}</button></div></div></div></details>
  ${G('help','Help')}<div class="card stack"><div class="row"><button class="btn" data-act="guideOpen">Guide</button><button class="btn" data-act="fbOpen" data-cat="bug" data-tip="Also for a question or a suggestion: the sheet asks which.">Report a problem</button>${acct.reader&&FB()?'<button class="btn" data-act="fbInbox">Reports inbox</button>':''}</div></div></div></details>
  ${/* Demo data, Diagnostics and Erase everything (r35, V): one group at the bottom, not three in front of everyday settings. */''}
  ${G('more','More')}<div class="card stack">
  <div><p class="small" style="margin:0 0 6px"><b>Demo data</b> ${tipi('8 weeks of generated sessions to preview Today and Stats. Everything demo is tagged and removed in one tap; your real logs are untouched.','About demo data')}</p>
  <div class="row"><button class="btn" data-act="demoLoad">Load demo data</button><button class="btn" data-act="demoClear" ${hasDemo?'':'disabled'}>Clear demo data</button></div></div>
  <div><p class="small" style="margin:0 0 6px"><b>Diagnostics</b> <span class="muted">Version ${VERSION_LINE} · cloud ${cloud.on?esc(cloud.status):'off'} · ${logBuf.length} logged error${logBuf.length===1?'':'s'}</span></p>
  ${logBuf.length?`<ul class="clist">${logBuf.slice(-5).reverse().map(x=>`<li><span class="small"><b>${esc(x.a)}</b> ${esc(x.m)}</span><span class="small muted">${esc(x.t.slice(5,16).replace('T',' '))}</span></li>`).join('')}</ul>`:''}
  <div class="row"><button class="btn sm" data-act="diagCopy">Copy diagnostics</button><button class="btn sm" data-act="diagClear" ${logBuf.length?'':'disabled'}>Clear log</button></div>${window.IRONLOG_APP?'<p class="small" style="margin:8px 0 0"><a href="LICENSES.txt" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;min-height:44px">Open-source licenses</a></p>':''}</div>
  <div><button class="btn danger" data-act="resetAll">Erase everything</button></div></div></div></details>${moreLine('settings')}`;
}

function rirSettings(){
  const s=state.settings;const c=calStats();
  const sum=!c.n?'No calibration sets yet. Start one from a machine or cable exercise\'s ⋯ menu.'
    :!c.recent?`${c.n} calibration set${c.n===1?'':'s'}, none in the last ${CAL_WEEKS} weeks.`
    :`${c.recent} recent calibration set${c.recent===1?'':'s'}: median miss ${c.raw>0?'+':''}${r1(c.raw)} reps (${c.raw>0?'you stop with more left than you call':c.raw<0?'closer to failure than you call':'accurate'}). Correction applied: ${c.bias>0?'+':''}${c.bias}.`;
  // What RIR is stays on screen here (V, r27): this is where it is decided whether to use it.
  return `<p class="small" style="margin:0"><b>RIR, reps in reserve:</b> reps you could still have done. RIR 3 or less is a hard set.</p>
  <label class="field">Reps in reserve<select data-bind="rirMode">
    <option value="on" ${s.rirMode==='on'?'selected':''}>On: log RIR and use it as logged</option>
    <option value="cal" ${s.rirMode==='cal'?'selected':''}>On, corrected by my calibration sets</option>
    <option value="off" ${s.rirMode==='off'?'selected':''}>Off: don't ask, count every working set as hard</option></select></label>
  ${s.rirMode==='off'?'':`<label class="field"><span class="hastip" data-tip="How you enter and read effort. Stored as RIR either way (RPE 8 is RIR 2, RPE 8.5 is RIR 1.5), so switching changes nothing logged.">Enter effort as</span><select data-bind="rirScale">
    <option value="whole" ${rirScale()==='whole'?'selected':''}>RIR, whole reps (0 to 5)</option>
    <option value="half" ${rirScale()==='half'?'selected':''}>RIR, half reps (0, 0.5, 1 … 5)</option>
    <option value="rpe" ${rirScale()==='rpe'?'selected':''}>RPE (5 to 10, in halves)</option></select></label>`}
  ${s.rirMode==='off'?'':`<label class="check-inline"><input type="checkbox" data-bind="rirAsk" ${s.rirAsk===true?'checked':''}><span class="hastip" data-tip="Off: tap a set's RIR box when you want to rate it. On: the picker opens by itself after each set you tick.">Open the ${effWord()} picker after each set</span></label>
  <label class="check-inline"><input type="checkbox" data-bind="rirHalf" ${s.rirHalf===true?'checked':''}><span class="hastip" data-tip="Off: a set counts toward your weekly sets at RIR 3 or less. On: a set past RIR 3 counts as half a set too, in your weekly sets, targets, and the plan's weekly sets. Growth rises as sets end closer to failure (Robinson 2024), so sets further away still do something; half is a convention. Estimates, PRs, and recovery are unchanged.">Count ${halfLbl()} as half a set</span></label>
  <p class="small muted hastip" style="margin:4px 0 0" data-tip="A blank RIR is read as your usual RIR on that lift: the middle value of the sets of it you rated in the last 12 weeks, once there are 3. That is a convention, so rating a set only sometimes cannot make it look stronger or weaker. Until there are 3, a blank set counts as hard and as 0 reps left for 1RM estimates, which errs low and never inflates a PR. Recovery, calibration, and the light-load check use only the RIR you entered.">Skipping RIR on some sets is fine.</p>`}
  ${s.rirMode==='cal'&&c.recent<2?'<p class="small" style="margin:0"><b>Needs 2 calibration sets from the last 12 weeks before any correction applies.</b></p>':''}
  <p class="small hastip" style="margin:4px 0 0" data-tip="Off hides the RIR picker: every working set counts as hard and estimates use reps alone. Corrected shifts RIR you called at 4 or less by your typical error, shrunk toward zero while you have few calibration sets and capped at 2 reps; compound and isolation lifts use their own sets once each has 2. A set called at 0 is shifted too: unless a rep actually failed, 0 is still a call, and people under-call reps left by about 1 on average, only slightly less near failure (Halperin 2022). Your log never changes, so switching is reversible.">${esc(sum)}</p>`;
}
function layoutSettings(){
  const h=state.settings.hidden;
  const dflt=DEFAULT_HIDDEN.length===h.length&&DEFAULT_HIDDEN.every(k=>h.includes(k));
  return `<p class="small muted" style="margin:0">Tap to show or hide. ${tipi(`Hidden sections are still tracked, and come back where they were. Each time ${APP_NAME} opens, every section starts folded except Sessions on History. Drag a section by its ⠿ to move it; each tab keeps its order.`,'About layout')}</p>
  <div class="row"><button class="btn sm ${dflt?'noted':''}" data-act="layoutDefault" aria-pressed="${dflt}" data-tip="The layout a new install starts with: At a glance, Coach, and Body hidden on Today, Schedule and Weekly volume hidden on Plan, and the default order.">Default layout</button><button class="btn sm" data-act="layoutAll" ${h.length?'':'disabled'}>Show everything</button><button class="btn sm" data-act="layoutReset" data-tip="Puts the sections on every tab back in their default order. Shown or hidden stays as it is.">Reset section order</button></div>
  ${HIDE_TABS.map(([t,l])=>`<div class="hide-grp"><p class="small"><b>${l}</b></p><div class="chips">${HIDEABLE.filter(x=>x[0]===t).map(([,k,lab])=>{const on=!h.includes(t+':'+k);return `<button class="chip ${on?'on':''}" data-act="hideToggle" data-k="${t}:${k}" aria-pressed="${on}">${esc(lab)}</button>`;}).join('')}</div></div>`).join('')}`;
}
