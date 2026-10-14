/* ---------- a past workout, date first ----------
   The phone was left at home, so the sets are on paper or in memory. The
   date comes first and everything is read as of that day: which routine day
   was due, last time's numbers and targets, and PRs. The logger then runs in
   quick entry (draft.past): no rest timer, no clock, no check-in, and a set
   ticks itself once its reps are typed, so a whole workout goes in one pass.
   The session is saved under its date, so next up, targets and PRs after it
   read correctly even when it is entered after later sessions. */
function pastDue(R,date){
  const ok=i=>!!R.days[i]&&!R.days[i].rest&&R.days[i].items.length>0;
  if(R.schedule==='weekly'){const i=(parse(date).getDay()+6)%7;return ok(i)?i:-1;}
  const cs=cycleState(R,date);return ok(cs.next)?cs.next:-1;
}
function pastDraft(date,di){
  const R=activeRoutine();const deload=!!state.deloadWeek&&state.deloadWeek===weekStart(date);
  const day=di==null?null:R.days[di];
  if(!day){const d=freeDraft('Freestyle');return {...d,date,startedAt:null,past:true};}
  const items=day.items.map(it=>deload?{...it,sets:Math.max(1,Math.ceil(it.sets/2))}:it);
  const note=deload?'Deload: half sets, about 90% loads, 3+ RIR.':'';
  return {id:uid(),startedAt:null,date,dayIdx:di,dayId:day.id,dayName:day.name+(deload?' (deload)':''),routineId:R.id,deload,light:false,past:true,cardio:[],notes:note,note0:note,editingId:null,ex:items.map(it=>newBlock(it.exId,it,{deload,before:date}))};
}
/* Anything the lifter put into a session: a ticked set, typed reps or a
   typed load, an RIR, cardio minutes, a note on an exercise, or session notes other than the text the
   app wrote itself. The grey numbers and prefilled loads are the app's. */
/* What an edit of a saved session holds, to tell whether anything changed
   (r30: Cancel on an untouched edit asked "Discard this session?"). Kept in
   memory per draft; after a reload the edit asks as before. */
const editFp0=new Map();
function editFp(d){return JSON.stringify({date:d.date,notes:(d.notes||'').trim(),ex:d.ex.map(b=>[b.exId,(b.note||'').trim(),b.sets.map(x=>[x.w==null?null:+x.w,x.r==null||x.r===''?null:+x.r,x.rir==null||x.rir===''?null:+x.rir,!!x.done,!!x.warm,!!x.drop])]),c:(d.cardio||[]).map(c=>[c.kind,c.min,c.hr,c.dist||null])});}
function draftEntered(d){
  if(!d)return false;
  // A typed load counts too (r25): with grey loads, a load in the row is the lifter's.
  if(d.ex.some(b=>(b.note&&b.note.trim())||b.sets.some(x=>x.done||+x.r>0||!rowBlank(b,x))))return true;
  if((d.cardio||[]).some(c=>c.min>0))return true;
  const n=(d.notes||'').trim();if(!n)return false;
  return typeof d.note0==='string'?n!==d.note0.trim():true;
}
/* The month calendar: any date one tap away. A day with a session opens it
   in History; an empty past day logs a workout for it (as in the week bar);
   today opens Today. It sits inline in This week on Today (Week or Month,
   r26), and opens as a sheet from History's Calendar button and a
   Consistency square. The pull-down on the week bar (r25) is gone: the
   calendar rose from the bottom of the screen while the finger pulled down
   from the top. */
const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
function calBounds(){
  const t=today().slice(0,7);const f=firstDate([...state.sessions,...state.cardio]);
  return {min:f&&f.slice(0,7)<t?f.slice(0,7):t,max:t};
}
// The month header and grid, for the sheet (inline false) and This week (inline true).
function calBody(ym,inline){
  const [y,mo]=ym.split('-').map(Number);const dim=new Date(y,mo,0).getDate();const lead=(new Date(y,mo-1,1).getDay()+6)%7;
  const t=today();const bd={};for(const x of state.sessions)(bd[x.date]=bd[x.date]||[]).push(x);
  const cd={};for(const c of state.cardio)cd[c.date]=(cd[c.date]||0)+c.min;
  const {min,max}=calBounds();
  let g=DAYS.map(d=>`<span class="wd">${d.slice(0,2)}</span>`).join('')+'<span></span>'.repeat(lead);let n=0;
  for(let i=1;i<=dim;i++){
    const d=`${ym}-${String(i).padStart(2,'0')}`;const ss=bd[d]||[];const c=cd[d]||0;if(ss.length)n+=ss.length;
    const cls=['cd',ss.length?'on':'',!ss.length&&c?'cardio':'',d===t?'today':'',d>t?'fut':''].filter(Boolean).join(' ');
    const what=ss.length?ss.map(x=>x.dayName||'Session').join(', '):c?`cardio ${c} min`:d>t?'':'nothing logged';
    const inner=`<span class="n">${i}</span><span class="x">${ss.length>1?'×'+ss.length:''}</span>`;
    g+=d>t?`<span class="${cls}" aria-hidden="true">${inner}</span>`
      :`<button type="button" class="${cls}" data-act="calDay" data-date="${d}" aria-label="${esc(fmtDateLong(d)+': '+what)}"${what&&what!=='nothing logged'?` data-tip="${esc(what)}"`:''}>${inner}</button>`;
  }
  const nav=v=>`data-act="calMonth" data-v="${v}"${inline?' data-inline="1"':''}`;
  return `<div class="cal-h"><button class="ib" ${nav(-1)} aria-label="Previous month" ${ym<=min?'disabled':''}>‹</button><${inline?'h4':'h3'} id="calH${inline?'i':''}">${MONTHS[mo-1]} ${y}</${inline?'h4':'h3'}><button class="ib" ${nav(1)} aria-label="Next month" ${ym>=max?'disabled':''}>›</button>${inline?'':'<button class="ib" aria-label="Close" data-act="mClose">✕</button>'}</div>
  <div class="cal-g">${g}</div>
  <div class="row spread" style="margin-top:10px"><p class="small muted" style="margin:0">${n?`${n} session${n===1?'':'s'}`:'No sessions'}${ym===max?' so far':''}</p>${ym!==max?`<button class="btn sm" ${nav('now')}>This month</button>`:''}</div>`;
}
function calSheet(m){return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="calH">${calBody(m.ym,false)}</div>`;}
function pastSheet(m){
  const R=activeRoutine();const due=pastDue(R,m.date);
  const on=state.sessions.filter(x=>x.date===m.date).map(x=>x.dayName||'Session');
  const opts=R.days.map((d,i)=>({d,i})).filter(x=>!x.d.rest&&x.d.items.length>0).sort((a,b)=>(b.i===due)-(a.i===due));
  const btn=({d,i})=>`<button class="btn block${i===due?' primary':''} pastday" data-act="pastGo" data-day="${i}"><span>${esc(dayLabel(R,i))}: ${esc(d.name)}</span>${i===due?'<small>due then</small>':`<small>${d.items.length} exercises</small>`}</button>`;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pastH"><div class="sheet-h"><h3 id="pastH">Log a past workout</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
  <label class="field">Date<input type="date" data-pbind="date" value="${m.date}" max="${today()}"></label>
  ${on.length?`<p class="small muted" style="margin:6px 0 0">Already logged that day: ${esc(on.join(', '))}.</p>`:''}
  <div class="stack" style="margin-top:12px">${opts.map(btn).join('')}<button class="btn block pastday" data-act="pastGo" data-day="free"><span>Freestyle</span><small>any exercises</small></button></div>
  <p class="small muted" style="margin:10px 0 0">Quick entry: type each set. ${tipi('No rest timer or clock. A set counts as done once its reps are typed. Last time, targets, and PRs are read as of that date.','About quick entry')}</p></div>`;
}
/* Re-run the suggestion for one block, for example after its heaviest
   available load changes. Only untouched sets take the new load. A row is
   untouched when it still holds the load the app suggested (b.sw, null when
   there was none). Drafts from before r24 have no b.sw and fall back to the
   old test, the first undone row's load; that test took a load typed on the
   first row for the app's, and replaced it. */
/* A change to an exercise or its plan reaches the session in progress (r27):
   an exercise not started yet re-reads its target, so a new load step, rep
   range or heaviest load shows at once instead of next session. Exercises with
   a set done keep what they started with, and typed loads are never touched. */
function refreshEx(exId){if(state.draft&&!state.draft.editingId)for(const b of state.draft.ex)if(b.exId===exId&&!b.sets.some(x=>x.done))refreshBlock(b);}
function syncDraftPlan(f){
  const d=state.draft;if(!d||!f||d.editingId||d.routineId!==f.r.id||d.dayId!==f.r.days[f.di].id)return;
  for(const b of d.ex)if(b.exId===f.it.exId&&!b.sets.some(x=>x.done)){for(const k of ['repMin','repMax','rir','rest','inc'])b.plan[k]=f.it[k];if(f.it.jump!=null)b.plan.jump=f.it.jump;else delete b.plan.jump;refreshBlock(b);}
}
function refreshBlock(b){
  const d=state.draft;if(!d||!b)return;const old=b.sets.find(x=>!x.done&&!x.warm);const oldW=b.sw!==undefined?b.sw:old?old.w:null;
  const sg=suggest(b.exId,b.plan,{deload:!!d.deload,light:!!d.light||!!b.light,before:d.date});
  Object.assign(b,{inj:sg.inj||null,hint:sg.text,last:sg.last,prev:sg.prev||undefined,prevOff:sg.prevOff||undefined,target:sg.target,tgt:sg.tgt,easier:sg.easier||null,lastR:sg.lastR,basis:sg.basis||undefined,lastNote:lastNoteOf(b.exId,d.date),sw:sg.w==null?null:sg.w});
  for(const x of b.sets)if(!x.done&&!x.warm&&!x.drop&&x.r==null&&x.w===oldW&&!carried.has(x))x.w=sg.w;
}
const ACT={
  appUpdate(){
    if(ui.modal&&ui.modal.dirty){toast('Save or cancel first. Your changes are still here.');return;}
    saveNow();upd.ready=false;updRender();
    if(typeof window.ironlogApplyUpdate==='function')window.ironlogApplyUpdate();else location.reload();
  },
  appUpdateLater(){upd.later=true;updRender();},
  async acctRetry(){await cloudInit();acctRerender();if(!cloud.on)toast('Still not syncing. Check your connection, or sign out and in again.');},
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
  calOpen(t){const ym=t&&t.dataset&&/^\d{4}-\d{2}$/.test(t.dataset.ym||'')?t.dataset.ym:today().slice(0,7);if(ui.modal)closeModal();openModal({kind:'cal',ym});},
  calMonth(t){
    const inline=t.dataset.inline==='1';const m=ui.modal;
    if(!inline&&(!m||m.kind!=='cal'))return;
    const cur=inline?(ui.calYm||today().slice(0,7)):m.ym;const {min,max}=calBounds();let ym;
    if(t.dataset.v==='now')ym=max;
    else{const [y,mo]=cur.split('-').map(Number);const d=new Date(y,mo-1+(+t.dataset.v||0),1);ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
    if(ym<min||ym>max)return;
    if(inline){ui.calYm=ym;rerenderKeepScroll();}else{m.ym=ym;renderModal();}},
  // This week on Today: the week, or the month (remembered on this device).
  wkView(t){const v=t.dataset.v==='month'?'month':'week';ui.wkView=v;if(v==='month')ui.calYm=today().slice(0,7);try{localStorage.setItem(WKVIEW_KEY,v);}catch(e){/* this visit only */}rerenderKeepScroll();},
  calDay(t){
    const d=t.dataset.date;if(!isDate(d)||d>today())return;
    if(ui.modal)closeModal();
    const ss=state.sessions.filter(x=>x.date===d);
    if(ss.length===1){ACT.wkOpen({dataset:{id:ss[0].id}});return;}
    // Two-a-days (r34): a day with more than one session asks which.
    if(ss.length>1){openModal({kind:'daypick',date:d});return;}
    if(d===today()){ACT.wkGo({dataset:{date:d}});return;}
    ACT.pastOpen({dataset:{date:d}});
  },
  iconLater(){try{localStorage.setItem(ICON_NOTE,'1');}catch(e){log('storage',e);}if(ui.modal&&ui.modal.kind==='icon')closeModal();rerenderKeepScroll();},
  install(){
    const how=installKind();
    if(how==='prompt'){
      const e=window.__installEvt;window.__installEvt=null;
      try{e.prompt();Promise.resolve(e.userChoice).then(r=>{if(r&&r.outcome==='accepted')toast('Installing Ironlog. Open it from your home screen.');rerenderKeepScroll();},()=>{});}
      catch(err){log('install',err);openModal({kind:'install',how:'menu'});}
      return;
    }
    openModal({kind:'install',how});
  },
  installLater(){try{localStorage.setItem(INSTALL_LATER,'1');}catch(e){log('storage',e);}rerenderKeepScroll();toast('Hidden. Settings > Your data has it.');},
  acctLater(){try{localStorage.setItem(ACCT_LATER,'1');}catch(e){log('storage',e);}rerenderKeepScroll();toast('Hidden. Settings > Your data has it.');},
  acctOpen(t){openModal({kind:'account',mode:t.dataset.mode==='signup'?'signup':'signin',email:'',pw:''});},
  acctMode(t){const m=ui.modal;if(!m||m.kind!=='account')return;if(m.mode==='wait')waitStop();m.mode=t.dataset.mode;m.err='';m.pw='';renderModal();},
  acctWaitNow(){waitTry(true);},
  /* Confirm sign-up with the emailed code (r45). This action owns success:
     the poll is held off while it runs, and the sign-in event's own wait
     branch stands aside (acctWait.coding), so nothing toasts or syncs twice.
     A code fails when the emailed link was opened first (it used the code up),
     so the password is tried once before the error is shown. */
  async acctCode(){
    const m=ui.modal,A=AUTH();if(!m||m.kind!=='account'||m.busy||!A||!A.verifyCode)return;
    for(const el of document.querySelectorAll('#modal [data-abind]'))m[el.dataset.abind]=el.value;
    // A poll already signing in (the app just came back to the front): let it finish first, and stop if it signed in (r45 review).
    if(acctWait.busy){m.busy=true;renderModal();for(let i=0;i<50&&acctWait.busy;i++)await new Promise(r=>setTimeout(r,100));m.busy=false;if(acct.user||ui.modal!==m)return;
      if(acctWait.busy){m.err='Still checking. Try again in a moment.';renderModal();return;}}
    const email=String(m.email||acctWait.email||'').trim().toLowerCase();const pw=acctWait.pw||String(m.pw||'');
    if(!EMAIL_RE.test(email)){m.err='Enter your email address.';renderModal();return;}
    clearTimeout(acctWait.timer);acctWait.timer=null;acctWait.busy=true;acctWait.coding=true;m.busy=true;m.err='';renderModal();
    const ok=user=>{acct.user=user;waitStop();obOutClear();try{localStorage.removeItem(ACCT_LATER);}catch(e){/* nothing to clear */}if(ui.modal===m)closeModal();toast('Email confirmed. Signed in and syncing.');if(!cloud.on)cloudInit();acctRerender();};
    try{ok(await A.verifyCode(email,m.code));}
    catch(e){
      let done=false;
      if(pw&&e&&e.code!=='no_code'){try{ok(await A.signIn(email,pw));done=true;}catch(e2){/* still not confirmed: show the code's error */}}
      if(!done){log('auth',e);if(ui.modal===m)m.err=(e&&e.message)||'Something went wrong. Try again.';}
    }finally{acctWait.busy=false;acctWait.coding=false;if(ui.modal===m){m.busy=false;renderModal();}waitSchedule();}
  },
  async acctResend(){
    const m=ui.modal,A=AUTH();if(!m||m.kind!=='account'||m.busy||!A||!A.resendCode)return;
    for(const el of document.querySelectorAll('#modal [data-abind]'))m[el.dataset.abind]=el.value;
    const email=String(m.email||acctWait.email||'').trim().toLowerCase();if(!EMAIL_RE.test(email)){m.err='Enter your email address.';renderModal();return;}
    m.busy=true;m.err='';renderModal();
    try{await A.resendCode(email);m.code='';toast('A new email is on its way. Use its code.');}
    catch(e){log('auth',e);m.err=(e&&e.message)||'Something went wrong. Try again.';}
    finally{if(ui.modal===m){m.busy=false;renderModal();}}
  },
  /* The answer on a browser that opened the confirmation link (item 61b). */
  async acctWhere(t){
    const m=ui.modal,A=AUTH();if(!m||m.kind!=='account'||m.mode!=='where'||!A)return;m.answered=true;
    if(t.dataset.v==='here'){
      if(typeof A.release==='function')A.release();
      closeModal();toast('Signed in here. Syncing your log.');await cloudInit();acctRerender();return;
    }
    try{await A.signOut();}catch(e){log('auth',e);}
    acct.user=null;
    ui.modal={kind:'account',mode:'sent',title:'Switch back to the app',msg:'Open Ironlog from your home screen. If it still shows Check your email, it signs in by itself; otherwise sign in there.'};renderModal();acctRerender();
  },
  async acctSubmit(){
    const m=ui.modal,A=AUTH();if(!m||m.kind!=='account'||m.busy||!A)return;
    // Go in the code field: the browser clicks the form's first button (Sign in), so route it to the code (r45).
    if(document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.abind==='code')return ACT.acctCode();
    // Read the fields as they are now: autofill does not always fire input events.
    for(const el of document.querySelectorAll('#modal [data-abind]'))m[el.dataset.abind]=el.value;
    const email=String(m.email||'').trim().toLowerCase(),pw=String(m.pw||'');
    const need=(ok,msg)=>{if(!ok){m.err=msg;renderModal();}return ok;};
    if(m.mode!=='newpw'&&!need(EMAIL_RE.test(email),'Enter your email address.'))return;
    if((m.mode==='signup'||m.mode==='newpw')&&!need(pw.length>=8,'Use 8 or more characters.'))return;
    if(m.mode==='signin'&&!need(pw.length>0,'Enter your password.'))return;
    m.busy=true;m.err='';renderModal();
    const done=next=>{if(ui.modal!==m)return;if(next){ui.modal={kind:'account',...next};renderModal();}else closeModal();};
    try{
      if(m.mode==='signin'){
        acct.user=await A.signIn(email,pw);obOutClear();try{localStorage.removeItem(ACCT_LATER);}catch(e){/* nothing to clear */}done(null);
        toast('Signed in. Syncing your log.');await cloudInit();acctRerender();
      }else if(m.mode==='signup'){
        const r=await A.signUp(email,pw);
        if(r.confirm){done({mode:'wait',email});waitStart(email,pw);}
        else{acct.user=r.user;obOutClear();done(null);toast('Account created. Syncing your log.');await cloudInit();acctRerender();}
      }else if(m.mode==='forgot'){
        await A.resetPassword(email);
        done({mode:'sent',title:'Check your email',msg:`If there is an account for ${email}, a reset link is on its way. It opens in your browser: set the new password there, then sign in here.`});
      }else if(m.mode==='newpw'){
        await A.updatePassword(pw);
        if(!isStandalone()){
          // Same reason as a confirmation link: this browser was signed in by
          // the emailed link only. The installed app signs in with the new password.
          try{await A.signOut();}catch(e){log('auth',e);}acct.user=null;
          done({mode:'sent',title:'Password changed',msg:'Open Ironlog from your home screen and sign in with the new password. If you use Ironlog in this browser instead, sign in here.'});
        }else{done(null);toast('Password changed');}
      }
    }catch(e){log('auth',e);if(ui.modal===m){m.err=(e&&e.message)||'Something went wrong. Try again.';
      // Not confirmed yet: the code works from here too (r45), whatever happened to the waiting sheet.
      if(m.mode==='signin'&&e&&e.code==='email_not_confirmed')m.needCode=true;}}
    finally{if(ui.modal===m){m.busy=false;renderModal();}}
  },
  acctDelete(){
    const A=AUTH();if(!A||typeof A.deleteAccount!=='function')return;
    confirmBox('Delete your account?','Your account and the synced copy of your log are deleted for good. The copy on this phone stays; export a backup first if you want one elsewhere.','Delete account',async()=>{
      toast('Deleting your account');
      try{await A.deleteAccount();}catch(e){log('auth',e);toast(e.message||'Could not delete the account. Try again.');acctRerender();return;}
      acct.user=null;cloudStop();rerenderKeepScroll();toast('Account deleted. Your log is still on this phone.');
    },true);
  },
  /* Sign out works like any app with an account (r33, V): the log lives in
     the account and comes back on sign-in, so the phone's copy goes with the
     sign-out. Keeping a copy on the phone is offered, quietly, second. Either
     way the app opens on the first page. Nothing is removed until every
     change has reached the account. */
  acctSignOut(){
    const A=AUTH();if(!A)return;
    const out=async remove=>{
      // Send anything not yet synced first, so signing out never loses work.
      // Offline there is nothing to wait for (r34.2: 15 s with no sign of anything happening).
      if(cloud.on&&navigator.onLine!==false){try{clearTimeout(cloud.t);await withTimeout(cq(cloudFlush),15000);}catch(e){log('auth',e);}}
      if(remove&&!(cloud.on&&cloud.status==='synced')){
        confirmBox('Not in your account yet','Some changes have not reached your account. Connect to the internet and sign out again, or sign out and keep them on this phone.','Keep on this phone and sign out',()=>out(false));return;}
      try{await A.signOut();}catch(e){log('auth',e);toast(e.message||'Could not sign out');return;}
      acct.user=null;cloudStop();
      /* A session in progress kept on the phone carries on where it was, and
         the app stays as it is after it: sending someone mid-workout to the
         first page would read as the session lost. */
      const mid=!remove&&!!state.draft;
      if(!mid)try{localStorage.setItem(OB_OUT,'1');localStorage.removeItem(OB_ACCT);}catch(e){/* per device only */}
      if(remove){undoForget();state=normalize(null);saveNow();invalidate();}
      if(!mid){ui.tab='today';window.scrollTo(0,0);}render();toast(remove?'Signed out':'Signed out. A copy stays on this phone.');
    };
    // With changes not yet in the account, say so first rather than "saved in your account" (r34.2).
    if(navigator.onLine===false&&hasUnsent()){confirmBox('Not in your account yet','Some changes have not reached your account. Connect to the internet and sign out again, or sign out and keep them on this phone.','Keep on this phone and sign out',()=>out(false));return;}
    confirmBox('Sign out?','Your log is saved in your account. Sign in on any phone to pick it up again.','Sign out',()=>out(true),false,{label:'Sign out, keep a copy on this phone',fn:()=>out(false),quiet:true});
  },
  startFree(){
    if(state.draft){ui.tab='today';render();return;}
    state.draft=freeDraft('Freestyle');ui.tab='today';
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
    const drop=new Set();const removed=new Map(),wasCut=new Map(),order=d.ex.slice(),did=d.id;
    /* Undo puts back exactly what the trim took (r25): the blank rows, at the
       end of their exercise, the skipped exercises in their places, and the
       trimmed mark as it was. Sets logged since stay. The merge Undo used
       before brought back skipped exercises but not removed rows. */
    snapshot(()=>{const dd=state.draft;if(!dd||dd.id!==did)return false;
      for(const [b,rows] of removed)if(dd.ex.includes(b))b.sets.push(...rows);
      for(const [b,c] of wasCut)if(dd.ex.includes(b)){if(c)b.cut=true;else delete b.cut;}
      order.forEach((b,i)=>{if(drop.has(i)&&!dd.ex.includes(b))dd.ex.splice(Math.min(i,dd.ex.length),0,b);});
      fixSupersets(dd.ex.map(b=>b.plan));return true;});
    for(const x of pl.bl){
      if(x.keep===x.undone)continue;const b=d.ex[x.bi];
      if(x.keep===0&&!x.started){drop.add(x.bi);continue;}
      // Only blank rows go, from the end; typed and ticked sets always stay.
      let n=x.undone-x.keep;const gone=[];
      for(let i=b.sets.length-1;i>=0&&n>0;i--){const s=b.sets[i];if(!s.warm&&rowBlank(b,s)){gone.unshift(...b.sets.splice(i,1));n--;}}
      removed.set(b,gone);wasCut.set(b,!!b.cut);b.cut=true;
    }
    d.ex=d.ex.filter((b,bi)=>!drop.has(bi));
    fixSupersets(d.ex.map(b=>b.plan));
    closeModal();saveNow();rerenderKeepScroll();
    toast(`Trimmed to ${estMin(min5(pl.est))}`,true);
  },
  chk(t){
    const d=state.draft;if(!d)return;const k=t.dataset.k,v=+t.dataset.v;
    const c=Object.assign({},d.chk||{});const was=CHK_Q.every(([q])=>c[q]);if(c[k]===v)delete c[k];else c[k]=v;
    d.chk=Object.keys(c).length?c:undefined;
    // Answering the last of the three folds the check-in away.
    if(!was&&CHK_Q.every(([q])=>c[q]))ui.folds['logger:checkin']=false;
    saveNow();rerenderKeepScroll();
  },
  /* The check-in's lighter session (r30): exercises not started become a
     lighter day's (half their sets, about 90% loads, 3+ RIR, no target);
     anything already logged or typed stays exactly as it is. Undo puts it
     back. */
  /* r31: only the exercises not started become lighter (b.light); the
     session itself is not marked, so work already done at full effort still
     sets next time's target and counts in trends (the review: a bench done
     4 x 10 before the tap was then ignored, and next week asked for it again). */
  makeLight(){
    const d=state.draft;if(!d||d.light||d.deload)return;
    const todo=d.ex.filter(b=>!b.light&&!b.sets.some(x=>!x.warm&&!rowBlank(b,x)));if(!todo.length){toast('Every exercise is started, so nothing changed');return;}
    snapshot();
    if((d.notes||'')===(d.note0||''))d.notes=d.note0='Made lighter after the check-in: exercises not started, half sets at about 90% loads.';
    let n=0;
    for(const b of todo){
      b.light=true;
      const work=b.sets.filter(x=>!x.warm);const keep=Math.max(1,Math.ceil(work.length/2));let cut=work.length-keep;
      for(let i=b.sets.length-1;i>=0&&cut>0;i--)if(!b.sets[i].warm){b.sets.splice(i,1);cut--;}
      refreshBlock(b);n++;
    }
    saveNow();rerenderKeepScroll();toast(n?`Lighter: ${n} exercise${n===1?'':'s'} not started now half the sets at about 90% loads`:'Every exercise is started, so nothing changed',true);
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
  calSnooze(){state.settings.calSnooze=today();saveNow();rerenderKeepScroll();toast('The RIR check will come back in 3 weeks');},
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
  hideToggle(t){
    const k=t.dataset.k;if(!HIDEABLE_KEYS.has(k))return;const h=state.settings.hidden;
    state.settings.hidden=h.includes(k)?h.filter(x=>x!==k):[...h,k];commit();rerenderKeepScroll();
  },
  layoutDefault(){snapshot();state.settings.hidden=DEFAULT_HIDDEN.slice();state.settings.secOrder=defaultOrder();commit();rerenderKeepScroll();toast('Default layout on every tab',true);},
  secShow(t){
    const k=t.dataset.k;if(!HIDEABLE_KEYS.has(k))return;
    state.settings.hidden=state.settings.hidden.filter(x=>x!==k);ui.folds[k]=true;commit();rerenderKeepScroll();
    const el=document.querySelector(`#view > [data-sk="${k}"]`);if(el)el.scrollIntoView({block:'nearest'});
    const lab=(HIDEABLE.find(x=>x[0]+':'+x[1]===k)||[])[2]||'Section';
    toast(`${lab} added. Hide it again in Settings, Layout.`);
  },
  goLayout(){if(ui.modal)closeModal();ui.tab='settings';ui.folds['settings:layout']=true;window.scrollTo(0,0);render();const el=document.querySelector('#view > [data-mkey="layout"]');if(el)el.scrollIntoView({block:'start'});},
  layoutAll(){state.settings.hidden=[];commit();rerenderKeepScroll();toast('Every section shown');},
  impOpen(){openModal({kind:'imp',step:'input',text:'',err:''});},
  impRead(){const el=$('#impText');const text=el?el.value:'';if(ui.modal)ui.modal.text=text;impStart({text});},
  impUnit(t){const m=ui.modal;if(!m||m.kind!=='imp'||!['lb','kg'].includes(t.dataset.v))return;m.unit=t.dataset.v;renderModal();},
  impBack(){openModal({kind:'imp',step:'input',text:'',err:''});},
  impMapDone(){const m=ui.modal;if(!m||!m.tab)return;const mp=m.tab.map;if(mp.date==null||mp.ex==null||mp.r==null){toast('Choose the date, exercise, and reps columns');return;}openPreview(impFromTable(m.tab.rows,mp),m.tab);},
  impGo(){
    const m=ui.modal;if(!m||m.kind!=='imp'||m.step!=='preview')return;const b=impBuild(m);if(!b.sessions.length&&!b.cardio.length)return;
    /* A first run (no log of their own yet, the starter routine untouched):
       the routine comes from the import (r31), or the picker opens. */
    const AR=activeRoutine();const first=!realCount(state)&&!!AR&&starterSigs().includes(routineSig(AR))&&!state.sessions.some(q=>q.routineId===AR.id);
    snapshot();state=normalize({...state,exercises:state.exercises.concat(b.newEx),sessions:state.sessions.concat(b.sessions),cardio:state.cardio.concat(b.cardio),settings:{...state.settings,onboarded:true}});invalidate();
    const msg=`Imported ${b.sessions.length} session${b.sessions.length===1?'':'s'}${b.cardio.length?`, ${b.cardio.length} cardio entr${b.cardio.length===1?'y':'ies'}`:''}${b.newEx.length?`, ${b.newEx.length} new exercise${b.newEx.length===1?'':'s'}`:''}`;
    const inf=first&&b.sessions.length?routineFromLog(state.sessions):null;
    if(inf){
      const R=inf.routine;const starter=starterSigs();state.routines=state.routines.filter(x=>!starter.includes(routineSig(x))||state.sessions.some(q=>q.routineId===x.id));state.routines.push(R);state.activeRoutineId=R.id;
      // Imported sessions join their day (by name, or by their lifts), so the cycle, the streak and adherence read them.
      for(const x of state.sessions){if(x.demo)continue;const d=inf.dayFor(x);if(!d)continue;x.routineId=R.id;x.dayId=d.id;x.dayIdx=R.days.indexOf(d);x.free=undefined;}
      invalidate();fitTargets(R,actualAvg4());invalidate();
      commit();closeModal();ui.tab='today';ui.todayDay=null;window.scrollTo(0,0);render();
      toast(`${msg}. Your routine is made from them: ${andList(R.days.filter(d=>!d.rest).map(d=>d.name),4)}, about ${inf.perWeek} day${inf.perWeek===1?'':'s'} a week. Change it in Plan.`,true,9000);
      return;
    }
    commit();closeModal();ui.tab='history';window.scrollTo(0,0);render();
    if(first&&b.sessions.length){openModal({kind:'templates',from:'welcome',imported:true});toast(`${msg}. Now pick the routine you follow, or the closest one.`,true,8000);return;}
    toast(msg,true);
  },
  bestsAll(){ui.bestsAll=true;rerenderKeepScroll();},
  async previewCopy(){
    if(ENV!=='preview')return;
    toast('Looking for your Ironlog log');
    const {st,err}=await liveLogFetch();
    if(!st){
      if(!acct.user&&AUTH()){confirmBox('Sign in first','This test version keeps a separate log. Sign in with your Ironlog account to copy your log in. Your log in Ironlog stays as it is.','Sign in',()=>ACT.acctOpen({dataset:{mode:'signin'}}));return;}
      toast(err?`Could not read your Ironlog log: ${err.message}`:'No Ironlog log found for this account or on this phone.',null,6000);return;}
    const n=realCount(st);st.draft=null;
    const go=()=>{snapshot();state=st;commit();closeModal();ui.tab='today';render();toast(`Copied ${n} session${n===1?'':'s'} from Ironlog. Ironlog is unchanged.`,true);};
    if(realCount(state)||state.draft)confirmBox('Replace the preview log?',`Your Ironlog log has ${n} session${n===1?'':'s'}. Copying replaces everything in this test version; your log in Ironlog stays as it is. Undo can step this back.`,'Copy my log',go);
    else go();
  },
  obSample(){openModal({kind:'templates',from:'welcome'});},
  gymUnit(t){
    const v=t.dataset.v==='kg'?'kg':'lb';if(v===gymUnit())return;
    const go=()=>{ui.gymDb=null;ui.gymU=v;if(gymOf()){snapshot();delete state.settings.gym;gymRefresh();commit();}rerenderKeepScroll();};
    // Weights typed in one unit mean nothing in the other, so they are cleared, with Undo, rather than converted to odd numbers.
    if(gymOf()||ui.gymDb)confirmBox(`Switch to ${v}?`,`The weights typed here are in ${gymUnit()} and are cleared. Type them again in ${v}.`,`Switch to ${v}`,()=>{go();toast(`Your gym in ${v}`,true);});else go();},
  gymPlate(t){const g=gymNext();const all=gymPlates(g.u);const v=+t.dataset.v;let on=Array.isArray(g.plates)?g.plates.slice():all.slice();
    on=on.includes(v)?on.filter(x=>x!==v):[...on,v];if(!on.length){toast('Keep at least one plate');return;}
    if(on.length===all.length)delete g.plates;else g.plates=all.filter(x=>on.includes(x));gymSave(g);},
  gymClear(){ui.gymDb=null;snapshot();delete state.settings.gym;gymRefresh();commit();rerenderKeepScroll();toast('Your gym cleared: the usual steps apply',true);},
  obTourPick(t){obTour.user=true;obTourStop();obTourGo(+t.dataset.i,true);},
  obAcctLater(){try{localStorage.setItem(OB_ACCT,'later');}catch(e){/* per device only */}obOutClear();window.scrollTo(0,0);render();},
  obAcctBack(){try{localStorage.removeItem(OB_ACCT);}catch(e){/* nothing to clear */}window.scrollTo(0,0);render();},
  /* Your training (r44): a tap on a choice sets it, a tap on the one set
     clears it. Focus moves only the app's own weekly targets, with Undo. */
  profSet(t){
    const k=t.dataset.k;const raw=t.dataset.v;const v=k==='days'?+raw:raw;
    const old=prof();const p={...old,focus:(old.focus||[]).slice()};
    if(k==='focus'){const i=p.focus.indexOf(v);if(i>=0)p.focus.splice(i,1);else{if(p.focus.length>=FOCUS_MAX){toast('Two at most. Tap one to take it off.');return;}p.focus.push(v);}}
    else if(k==='goal'||k==='exp'||k==='days')p[k]=p[k]===v?undefined:v;else return;
    const np=profClean(p);const was=state.settings.profile?JSON.parse(JSON.stringify(state.settings.profile)):null;let moved={};
    /* Undo puts the profile back and each target this moved that still reads
       what it was moved to (the r44 review: the merge lost them when a target
       was typed in between). */
    snapshot(()=>{if(was)state.settings.profile=was;else delete state.settings.profile;const b=state.settings.bands;
      for(const m in moved)if(b[m]&&b[m][0]===moved[m][1][0]&&b[m][1]===moved[m][1][1])b[m]=moved[m][0].slice();return true;});
    if(np)state.settings.profile=np;else delete state.settings.profile;
    if(k==='focus')moved=profMoveBands(old,np||{});
    commit();rerenderKeepScroll();
    const n=Object.keys(moved).length;
    // A focus whose own target was typed does nothing to it; say so rather than nothing (the r44 review).
    const kept=k==='focus'&&np&&(np.focus||[]).includes(v)&&!moved[v];
    if(kept)toast(`Your ${ML[v]} target is one you set, so it stays. Default targets in Weekly set targets puts the app's back.`,n>0,8000);
    else if(n)toast(`Weekly targets moved for ${n} muscle${n===1?'':'s'}. Ones you typed stay.`,true);
  },
  // The save kept aside at start (r45): restored through the import's checks, shown as text, or let go.
  unreadRestore(){const raw=unreadableRaw();if(!raw)return;importData(raw,()=>{try{localStorage.removeItem(KEY+'.unreadable');}catch(e){/* nothing to clear */}});},
  unreadShow(){const raw=unreadableRaw();if(raw)openModal({kind:'text',title:'Save kept aside',help:'Select all and copy it somewhere safe.',text:raw});},
  unreadForget(){confirmBox('Forget the save kept aside?','It is deleted for good. Export or copy it first if you might want it.','Forget it',()=>{try{localStorage.removeItem(KEY+'.unreadable');}catch(e){/* nothing to clear */}rerenderKeepScroll();toast('Forgotten');},true);},
  // Weekly set targets back to the defaults (r44), with Your training's focus; typed ones and a first-run fit go.
  bandsDefault(){
    const b=state.settings.bands;const fit=state.settings.bandsFit?{...state.settings.bandsFit}:null;const moved={};
    for(const m of MK){const d=defBand(m);if(b[m][0]!==d[0]||b[m][1]!==d[1])moved[m]=[b[m].slice(),d.slice()];}
    // Undo puts back the floors and each target that still reads the default it was set to (the r44 review: the merge kept the floors and lost the targets).
    snapshot(()=>{if(fit)state.settings.bandsFit=fit;else delete state.settings.bandsFit;for(const m in moved)if(b[m][0]===moved[m][1][0]&&b[m][1]===moved[m][1][1])b[m]=moved[m][0].slice();return true;});
    for(const m in moved)b[m]=moved[m][1].slice();delete state.settings.bandsFit;commit();rerenderKeepScroll();toast('Weekly set targets back to the defaults',true);},
  // The fold in the first-run routine picker (r44): its own state, so a re-render keeps it open.
  obProfTog(){ui.obProf=!ui.obProf;rerenderKeepScroll();},
  profApply(){
    const R=activeRoutine();const list=profApplyList(R);if(!list.length)return;
    confirmBox(`Apply to ${R.name}?`,`${list.length} exercise${list.length===1?'':'s'}. ${profApplyWhat()} Sets and exercises stay as they are.`,'Apply',()=>{
      const live=activeRoutine();if(!live||live.id!==R.id)return;
      snapshot();const L=profApplyList(live);
      for(const x of L){Object.assign(x.it,x.ch);syncDraftPlan({r:live,di:x.di,it:x.it});}
      commit();rerenderKeepScroll();toast(`${live.name}: ${L.length} exercise${L.length===1?'':'s'} updated`,true);
    });
  },
  obUnit(t){const v=t.dataset.v;if(v!=='lb'&&v!=='kg')return;state.settings.unit=v;commit();render();},
  tplPick(t){
    const m=ui.modal;const from=m&&m.kind==='templates'?m.from:'plan';const k=t.getAttribute('data-k');
    const r=routineFromTemplate(k);if(!r)return;closeModal();
    // The same template added again, unchanged, is opened rather than duplicated.
    const same=state.routines.find(x=>routineSig(x)===routineSig(r));
    if(from==='welcome'){
      // First run: the untouched starter routine is replaced by the pick, not
      // kept beside it. A routine with sessions logged against it always stays.
      if(same)state.activeRoutineId=same.id;
      else{const starter=starterSigs();state.routines=state.routines.filter(x=>!starter.includes(routineSig(x))||state.sessions.some(q=>q.routineId===x.id));state.routines.push(r);state.activeRoutineId=r.id;}
      const fit=fitTargets(state.routines.find(x=>x.id===state.activeRoutineId));
      state.settings.onboarded=true;ui.todayDay=null;ui.tab='today';commit();window.scrollTo(0,0);render();
      toast(fit?`${r.name} is ready. Weekly set targets now match it; change them in Settings.`:`${r.name} is ready`,null,fit?6000:0);return;
    }
    if(same){ui.bRoutine=same.id;render();toast('You already have this routine unchanged. Opened it instead.');return;}
    state.routines.push(r);ui.bRoutine=r.id;commit();render();toast(`${r.name} added. Tap Make active to use it.`);
  },
  obOwn(){
    state.settings.onboarded=true;
    const r={id:uid(),name:'My routine',schedule:'cycle',days:[1,2,3].map(()=>({id:uid(),name:'Training day',rest:false,items:[]}))};
    state.routines.push(r);state.activeRoutineId=r.id;ui.bRoutine=r.id;ui.bTarget=0;ui.folds['program:library']=true;ui.folds['program:days']=true;ui.todayDay=null;
    ui.tab='program';ui.planView='routine';commit();window.scrollTo(0,0);render();
    toast('Name your days, then add exercises with + or by dragging.',false,7000);
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
      const ex=s.ex.map(b=>newBlock(b.exId,plan(b),{deload}));
      state.draft=day?{id:uid(),startedAt:Date.now(),date:today(),dayIdx:R.days.indexOf(day),dayId:day.id,dayName:day.name+(deload?' (deload)':''),routineId:R.id,deload,light:false,cardio:[],notes:deload?'Deload: half sets, about 90% loads, 3+ RIR.':'',editingId:null,ex}
        :{...freeDraft(s.free?s.dayName:`Again: ${s.dayName}`.slice(0,40),ex),deload};
      if(state.draft)state.draft.note0=state.draft.notes||'';ui.tab='today';saveNow();window.scrollTo(0,0);render();wakeOn();
      toast(day?`${day.name} started with the same exercises`:'Started as a freestyle session');
    };
    if(state.draft)confirmBox('Replace the session in progress?','You have an unsaved session open. Starting this one discards it.','Discard and start',go,true);else go();
  },
  crashRetry(){ui.tab='today';ui.modal=null;ui.planView='routine';try{closeModal();}catch(e){log('render',e);}window.scrollTo(0,0);render();},
  fbOpen(t){
    const d=state.draft;const bi=t&&t.dataset&&t.dataset.b!=null?+t.dataset.b:null;const b=bi!=null&&d?d.ex[bi]:null;
    const from=ui.tab==='settings'?(ui.prevTab||'settings'):ui.tab;
    const cat=t&&t.dataset&&FB_TITLE[t.dataset.cat]?t.dataset.cat:'bug';
    openModal({kind:'feedback',cat,msg:'',shot:null,from:ui.tab==='today'&&d?'session':from,ex:b?exName(b.exId):null});
  },
  /* A lifter's own exercise stays in their log (r34). Suggesting it sends
     it to the owner as a report; the library changes only when the owner
     adds it in a build. */
  exSuggest(){
    const m=ui.modal;const e=m&&m.kind==='exEdit'?state.exercises.find(x=>x.id===m.e.id):null;if(!e)return;
    const sec=(e.secondary||[]).map(k=>ML[k]).filter(Boolean);
    const msg=`Add to the library: ${e.name}. Main muscle: ${ML[e.primary]||e.primary}${sec.length?`; also ${andList(sec)}`:''}. Equipment: ${EQL[e.equip]||e.equip}${e.perSide?', one side at a time':''}${e.bw?', bodyweight':''}${e.timed?', timed':''}.${e.note?` Note: ${e.note}`:''}`.slice(0,FB_MAX);
    openModal({kind:'feedback',cat:'idea',msg,shot:null,from:'library',ex:e.name});
  },
  // Signed out: the report as text for a message, without sending anything.
  async fbCopy(){
    const m=ui.modal;if(!m||m.kind!=='feedback')return;
    const txt=`Ironlog: ${FB_TITLE[m.cat]||FB_TITLE.bug}\n\n(Write it here)\n\n${JSON.stringify(fbContext(m),null,1)}`;
    let ok=false;try{if(navigator.clipboard){await navigator.clipboard.writeText(txt);ok=true;}}catch(e){ok=false;}
    if(!ok){closeModal();openModal({kind:'text',title:'Report details',help:'Copy this into a message to the app owner, with what happened.',text:txt,readonly:true});return;}
    m.sent=true;m.copied=true;renderModal();
  },
  fbCat(t){const m=ui.modal;if(!m||m.kind!=='feedback')return;for(const el of document.querySelectorAll('#modal [data-fbind]'))m[el.dataset.fbind]=el.value;m.cat=t.dataset.v;renderModal();},
  fbShotDel(){const m=ui.modal;if(!m||m.kind!=='feedback')return;m.shot=null;renderModal();},
  async fbSend(){
    const m=ui.modal;if(!m||m.kind!=='feedback'||m.busy)return;
    for(const el of document.querySelectorAll('#modal [data-fbind]'))m[el.dataset.fbind]=el.value;
    const msg=String(m.msg||'').trim().slice(0,FB_MAX);const reply=acct.user&&acct.user.email||'';
    if(msg.length<FB_MIN){m.err=`A few more words, please (${FB_MIN} characters or more).`;renderModal();return;}
    const F=FB();
    if(F&&fbRecent().length>=FB_DAY){m.err=`You have sent ${FB_DAY} reports today. Try again tomorrow.`;renderModal();return;}
    const fb={category:FB_CATS.some(([k])=>k===m.cat)?m.cat:'bug',message:msg,reply_to:reply||null,screenshot:m.shot||null,context:fbContext(m)};
    if(!F){
      // No feedback service here: the report as text, to paste into a message.
      const txt=`Ironlog: ${FB_TITLE[fb.category]}\n\n${msg}\n\n${JSON.stringify(fb.context,null,1)}`;
      let ok=false;try{if(navigator.clipboard){await navigator.clipboard.writeText(txt);ok=true;}}catch(e){ok=false;}
      if(!ok){closeModal();openModal({kind:'text',title:'Feedback',help:'Copy this and send it to the app owner.',text:txt,readonly:true});return;}
      m.sent=true;m.copied=true;m.dirty=false;renderModal();return;
    }
    m.busy=true;m.err='';renderModal();
    try{await F.send(fb);try{localStorage.setItem(FB_SENT,JSON.stringify([...fbRecent(),Date.now()]));}catch(e2){/* the database still counts */}if(ui.modal===m){m.sent=true;m.dirty=false;}}
    catch(e){log('feedback',e);if(ui.modal===m)m.err=(e&&e.message)||'Could not send. Try again.';}
    finally{if(ui.modal===m){m.busy=false;renderModal();}}
  },
  async fbInbox(){
    const F=FB();if(!F||typeof F.inbox!=='function')return;const m={kind:'fbInbox',items:null};openModal(m);
    try{const it=await F.inbox(50);if(ui.modal===m){m.items=it;renderModal();}}catch(e){log('feedback',e);if(ui.modal===m){m.err=(e&&e.message)||'Could not load feedback.';renderModal();}}
  },
  diagCopy(){const t=JSON.stringify({version:APP_VERSION,cloud:{on:cloud.on,status:cloud.status,err:cloud.err,last:cloud.last},log:logBuf},null,1);openModal({kind:'text',title:'Diagnostics',help:'Copy this and paste it into a bug report. It holds errors and sync status, not your workouts.',text:t,readonly:true});},
  diagClear(){logBuf.length=0;try{localStorage.removeItem(LOGK);}catch(e){log('diag',e);}rerenderKeepScroll();toast('Log cleared');},
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
    if(e.inv){try{done=e.inv()===true;}catch(x){log('undo',x);done=false;}if(done)state=normalize(state);}
    if(!done)try{
      const pre=normalize(JSON.parse(e.pre));const post=e.post?normalize(JSON.parse(e.post)):state;
      const P=chunksOf(pre),Q=chunksOf(post),C=chunksOf(state);const stat={conflicts:0};const parts={};
      for(const id of new Set([...Object.keys(P),...Object.keys(Q),...Object.keys(C)])){
        const q=Q[id]||emptyChunk(id);
        parts[id]=id==='draft'?{draft:mergeDraft(Q.draft&&Q.draft.draft,C.draft&&C.draft.draft,P.draft&&P.draft.draft)}
          :mergeChunk(id,q?baseOf(id,q):null,C[id]||emptyChunk(id),P[id]||emptyChunk(id),false,stat);
      }
      state=assemble(parts);
    }catch(x){log('undo',x);toast('Could not undo that');return;}
    if(canon(state)===before){toast('Nothing to undo there: it has changed since.');const below0=undoStack[undoStack.length-1];if(below0&&below0.post==null)below0.post=e.pre;return;}
    // If the step below never saw a save of its own, its result is the state
    // before the step just undone, not what this undo is about to save.
    const below=undoStack[undoStack.length-1];if(below&&below.post==null)below.post=e.pre;
    commit();$('#toast').hidden=true;render();
    toast(`Undone. ${undoStack.length} step${undoStack.length===1?'':'s'} left`);
  },
  help(t){const k=t.dataset.h;const on=!ui.help.has(k);if(on)ui.help.add(k);else ui.help.delete(k);
    const el=document.getElementById('help-'+k);if(el){el.hidden=!on;
      // A ? outside a section (the Start card, a page title) may point into a closed section, so open it.
      const d=on&&el.closest('details');if(d&&!d.open)d.open=true;}
    document.querySelectorAll(`[data-act="help"][data-h="${k}"]`).forEach(b=>b.setAttribute('aria-expanded',String(on)));},
  planLib(){ui.planView='library';window.scrollTo(0,0);render();},
  planBack(){ui.planView='routine';window.scrollTo(0,0);render();},
  applyUpd(){
    const u=ui.modal&&ui.modal.upd;closeModal();if(!u)return;
    const R=state.routines.find(r=>r.id===u.rid);const day=R&&R.days.find(x=>x.id===u.dayId);if(!day){toast('That routine day no longer exists');return;}
    snapshot();
    for(const x of u.swap){const it=day.items.find(i=>i.exId===x.from);if(it)it.exId=x.to;}
    for(const x of u.add)if(!day.items.some(i=>i.exId===x.exId))day.items.push({...x.plan,uid:uid(),exId:x.exId,ss:null});
    // Each superset kept: its exercises side by side, in the order done, under one link.
    for(const ids of u.ss||[]){const its=ids.map(id=>day.items.find(i=>i.exId===id)).filter(Boolean);if(its.length<2)continue;
      const at=Math.min(...its.map(i=>day.items.indexOf(i)));day.items=day.items.filter(i=>!its.includes(i));day.items.splice(at,0,...its);
      const g=uid();for(const i of its)i.ss=g;}
    fixSupersets(day.items);
    if(day.rest&&day.items.length)day.rest=false;
    commit();render();toast(`${day.name} updated`,true);
  },
  goalOpen(t){openModal({kind:'goal',exId:t.dataset.ex});},
  goalSave(){const m=ui.modal;const e=state.exercises.find(x=>x.id===m.exId);if(!e){closeModal();return;}
    const w=numIn(($('#goalW')||{}).value),r=Math.round(numIn(($('#goalR')||{}).value));
    if(!(r>=1&&r<=30)){toast('Reps from 1 to 30');return;}
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
    e.inc=fromD(Math.min(n,U()==='lb'?1100:500));closeModal();commit();refreshEx(e.id);saveNow();rerenderKeepScroll();toast(`Load step for ${e.name}: ${fmtW(e.inc)} ${U()}`);
  },
  cardioNew(){openModal({kind:'cardio'});},
  cardioSave(){
    const min=numIn($('#cMin').value);if(min==null||min<=0){toast('Enter the minutes');return;}
    const date=$('#cDate').value||today();
    state.cardio.push(cleanCardio({id:uid(),date:isDate(date)?date:today(),kind:$('#cKind').value,min,hr:numIn($('#cHr').value),when:'solo',note:($('#cNote').value||'').trim(),dist:distIn($('#cDist').value)}));
    closeModal();commit();rerenderKeepScroll();toast('Cardio logged');
  },
  cardioDel(t){const c=state.cardio.find(x=>x.id===t.dataset.id);if(!c)return;const id=c.id;
    confirmBox('Delete cardio entry?',`${CARDIOL[c.kind]||'Cardio'}, ${fmtDate(c.date)}, ${c.min} min. It stays under Recently deleted for ${TRASH_DAYS} days.`,'Delete',()=>{const c2=state.cardio.find(x=>x.id===id);if(!c2)return;toTrash('cardio',c2);state.cardio=state.cardio.filter(x=>x.id!==id);commit();rerenderKeepScroll();toast('Cardio entry moved to Recently deleted');},true);},
  cDraftAdd(t){const d=state.draft;(d.cardio||(d.cardio=[])).push(cleanCardio({id:uid(),kind:'walk',when:t.dataset.when},true));saveNow();rerenderKeepScroll();},
  /* A filled cardio entry goes with an Undo, like a set with reps; an empty one goes quietly. */
  cDraftDel(t){const d=state.draft;const list=d&&d.cardio;const i=+t.dataset.c;const c=list&&list[i];if(!c)return;
    if(+c.min>0||+c.hr>0||(c.note||'').trim()){const did=d.id;
      confirmBox(`Remove ${(CARDIOL[c.kind]||'entry').toLowerCase()}?`,`${c.min?c.min+' min':'An entry with your notes'}. Undo is offered right after.`,'Remove',()=>{const dd=state.draft;const l2=dd&&dd.id===did?dd.cardio:null;const j=l2?l2.indexOf(c):-1;if(j<0){toast('That entry changed. Nothing was removed.');rerenderKeepScroll();return;}
        snapshot(()=>{const d3=state.draft;if(!d3||d3.id!==did)return false;(d3.cardio||(d3.cardio=[])).splice(Math.min(j,d3.cardio.length),0,c);return true;});
        l2.splice(j,1);saveNow();rerenderKeepScroll();toast(`${CARDIOL[c.kind]||'Entry'} removed`,true);},true);return;}
    list.splice(i,1);saveNow();rerenderKeepScroll();},
  /* Recently deleted is already deleted, so one item goes on a tap with Undo;
     all of them ask first (r34.1, V: no way to clear it). */
  trashDel(t){const x=(state.trash||[]).find(y=>y.id===t.dataset.id&&y.kind===t.dataset.k);if(!x)return;snapshot();state.trash=state.trash.filter(y=>y!==x);commit();rerenderKeepScroll();toast('Deleted for good',true);},
  trashEmpty(){const n=(state.trash||[]).length;if(!n)return;confirmBox(`Empty Recently deleted (${n} item${n>1?'s':''})?`,`Undo in Settings can still bring ${n>1?'them':'it'} back for 7 days.`,'Delete all',()=>{snapshot();state.trash=[];commit();render();toast('Recently deleted cleared',true);},true);},
  restore(t){
    const x=state.trash.find(y=>y.id===t.dataset.id&&y.kind===t.dataset.k);if(!x)return;
    state.trash=state.trash.filter(y=>y!==x);
    if(x.kind==='session'&&!state.sessions.some(s=>s.id===x.id))state.sessions.push(x.data);
    else if(x.kind==='cardio'&&!state.cardio.some(c=>c.id===x.id))state.cardio.push(x.data);
    else if(x.kind==='routine'&&!state.routines.some(r=>r.id===x.id))state.routines.push(x.data);
    state=normalize(state);commit();render();toast('Restored');
  },
  restWkOpen(){openModal({kind:'restwk'});},
  restWk(t){const ws=t.dataset.w;if(!isDate(ws))return;snapshot();const r=(state.settings.restWeeks||[]).slice();const on=r.includes(ws);
    state.settings.restWeeks=on?r.filter(x=>x!==ws):[...r,ws].sort();if(!state.settings.restWeeks.length)delete state.settings.restWeeks;
    invalidate();commit();renderModal();rerenderKeepScroll();toast(on?'Rest week cleared':'Rest week marked',true);},
  deloadToggle(){
    if(isDeloadWeek()){state.deloadWeek=null;commit();render();toast('Deload week off');return;}
    state.deloadWeek=weekStart(today());commit();ui.tab='today';window.scrollTo(0,0);render();
    toast('Deload week on until Sunday: half sets, about 90% loads. It clears fatigue; it does not add growth.',false,6000);
  },
  injAdd(){openModal({kind:'injury'});},
  injSave(){const m=$('#injM').value;const note=($('#injNote').value||'').trim();
    if(!MK.includes(m)&&!JK.includes(m))return;state.injuries=(state.injuries||[]).filter(x=>x.m!==m);state.injuries.push({id:uid(),m,note,date:today()});
    closeModal();commit();render();toast(`${injLabel(m)} flagged`);},
  injClear(t){snapshot();const x=(state.injuries||[]).find(i=>i.id===t.dataset.id);state.injuries=(state.injuries||[]).filter(i=>i.id!==t.dataset.id);commit();render();toast(`${x?injLabel(x.m):'Injury'} cleared`,true);},
  bMenu(t){openModal({kind:'bmenu',b:+t.dataset.b});},
  rirOpen(t){const bi=+t.dataset.b,si=+t.dataset.s;const open=document.querySelector(`.rirstrip[data-b="${bi}"][data-s="${si}"]`);if(open){rirClose();return;}rirShowStrip(bi,si);
    const f=document.querySelector('.rirstrip button.on')||document.querySelector('.rirstrip button');if(f&&!coarse())try{f.focus({preventScroll:true});}catch(e){/* focus is best effort */}},
  rirPick(t){
    const bi=+t.dataset.b,si=+t.dataset.s;const d=state.draft;const b=d&&d.ex[bi];const s=b&&b.sets[si];if(!s)return;
    const n=numIn(t.dataset.v);s.rir=n==null?null:Math.min(Math.max(n,0),10);
    const btn=document.querySelector(`.rirb[data-b="${bi}"][data-s="${si}"]`);
    if(btn){const cur=effShow(s.rir);btn.textContent=cur===''?(b.plan&&b.plan.rir!=null?'–':effWord()):cur;btn.classList.toggle('unset',cur==='');btn.setAttribute('aria-label',`${effAria(si)}: ${cur===''?'not set':cur}`);}
    rirClose();if(btn)try{btn.focus({preventScroll:true});}catch(e){/* focus is best effort */}
    if(s.done){refreshPR(bi,si,false);afterSet(bi,si);}updateProgress(bi);
    // The fold waits for the effort of the last set, then goes.
    if(!d.editingId&&blockDone(b)){clearTimeout(foldT);foldT=setTimeout(()=>autoFold(bi),900);}
    saveSoon();},
  bOpen(t){const bi=+t.dataset.b;const b=state.draft&&state.draft.ex[bi];if(!b)return;ui.blkOpen.add(blkKey(bi,b));blkOpenObj.add(b);rerenderKeepScroll();
    const el=document.getElementById('blk-'+bi);if(el)try{el.scrollIntoView({block:'nearest'});}catch(e){/* scroll is best effort */}},
  bFold(t){const bi=+t.dataset.b;const b=state.draft&&state.draft.ex[bi];if(!b)return;
    // Every place this exercise was opened at, so a move and a fold leave nothing behind.
    const pre=((state.draft&&state.draft.id)||'')+':';for(const k of [...ui.blkOpen])if(k.startsWith(pre)&&k.endsWith(':'+b.exId))ui.blkOpen.delete(k);
    blkOpenObj.delete(b);rerenderKeepScroll();},
  bMenuDo(t){const op=t.dataset.op;closeModal();
    if(op==='bSs'){const bi=+t.dataset.b;if(linkToggle(state.draft.ex,bi,x=>x.plan)){saveNow();rerenderKeepScroll();
      // A superset made here is this session's; Plan keeps one (r34.2, from the review: it was gone next time without a word).
      const b=state.draft.ex[bi];if(b&&b.plan.ss)toast(state.draft.dayId?'Superset. Finish offers to keep it in your plan.':'Superset for this session.');}return;}
    const f=ACT[op];if(f)f(t);},
  ssToggle(t){const f=findItem(t.dataset.uid);if(!f)return;const items=f.r.days[f.di].items;
    if(linkToggle(items,f.i,x=>x)){commit();rerenderKeepScroll();}},
  dropAdd(t){
    const b=state.draft.ex[+t.dataset.b];
    // The load the last working set was, or will be (a grey load counts).
    let base=0;for(let i=b.sets.length-1;i>=0;i--){const s=b.sets[i];if(s.warm||s.drop)continue;const w=+effW(b,i)||0;if(w>0){base=w;break;}}
    b.sets.push({w:base>0?lighterLoad(EX(b.exId),b.plan,base,base*0.75):null,r:null,rir:null,warm:false,drop:true,done:false});
    saveNow();rerenderKeepScroll();toast('Drop set added');
  },
  // Once the rest is over, +15 counts from now (not from the old end, which
  // left it at 0:00) and the alert is armed again.
  tAdd(){const was=Math.max(0,(timer.end-Date.now())/1000);timer.total=was>0?Math.max(timer.total||0,was)+15:15;timer.end=Math.max(timer.end,Date.now())+15000;timer.fired=false;timerSave();if(!timer.iv)timer.iv=setInterval(tick,250);tick();},
  tStop(){stopTimer();},
  mClose(){closeModal();},
  mOk(){const fn=ui.modal&&ui.modal.fn;closeModal();fn&&fn();},
  mAlt(){const a=ui.modal&&ui.modal.alt;closeModal();a&&a.fn&&a.fn();},
  startSession(t){
    if(ui.modal)closeModal();toastQuiet();
    const R=activeRoutine();const di=+t.dataset.day;const d=R.days[di];if(!d)return;
    const light=t.dataset.light==='1';const deload=!light&&isDeloadWeek();
    // Lighter: half the sets at about 90% loads (one easy day, r30). Deload: half the sets
    // at about 90% loads for a whole week, and flagged so it never counts
    // against a lift's trend or stall read.
    const items=d.rest?[]:d.items.map(it=>(light||deload)?{...it,sets:Math.max(1,Math.ceil(it.sets/2))}:it);
    state.draft={id:uid(),startedAt:Date.now(),date:today(),dayIdx:di,dayId:d.id,dayName:d.name+(light?' (lighter)':deload?' (deload)':''),routineId:R.id,deload,light,cardio:[],notes:light?'Lighter session: half sets, about 90% loads, 3+ RIR.':deload?'Deload: half sets, about 90% loads, 3+ RIR.':'',editingId:null,ex:items.map(it=>newBlock(it.exId,it,{deload,light}))};
    state.draft.note0=state.draft.notes||'';saveNow();window.scrollTo(0,0);render();wakeOn();
  },
  /* These two used to call rerenderKeepScroll(), which rebuilt every set row in
     the session on a single tap. On a long day that is well over a hundred
     elements per checkmark. Patch the one row instead. */
  adjKeep(t){const bi=+t.dataset.b;const b=state.draft&&state.draft.ex[bi];if(!b||!b.adj)return;const prev=b.adj;delete b.adj;b.adjOff=true;adjRows(b,prev,null);
    const ex=EX(b.exId);b.sets.forEach((x,i)=>{if(i>prev.at&&!x.done&&x.w!=null){const el=document.querySelector(`.sg input[data-f="w"][data-b="${bi}"][data-s="${i}"]`);if(el)el.value=loadIn(ex,x.w);}});
    refreshGreyW(bi);refreshGrey(bi);const el=document.getElementById('adj-'+bi);if(el)el.remove();saveNow();},
  sDone(t){
    const bi=+t.dataset.b,si=+t.dataset.s;const s=draftSet(t);if(!s)return;
    /* With auto-done on, leaving the reps field marks the set done, and on a
       phone that blur happens a moment before the tap on the checkmark lands.
       Without this guard the tap would immediately undo the auto-mark. Since
       r28 (auto-mark on for new installs) the first tap on that set's
       checkmark confirms it for 15 s, until another set is touched: typing
       reps, picking RIR and then tapping the checkmark is the natural order,
       and it used to untick the set. A second tap undoes it. */
    if(lastAuto&&(lastAuto.b!==bi||lastAuto.s!==si))lastAuto=null;
    if(lastAuto&&Date.now()-lastAuto.t<15000&&s.done){lastAuto=null;return;}
    /* Tapping done on an empty reps field logs the grey number in it (see
       greyR), like the paper log you copy from. Warm-ups have none, so
       those still ask. */
    if(!s.done&&!(+s.r>0)){
      const b=state.draft.ex[bi];const lr=b?greyR(b,si):null;
      if(!(lr>0)){toast('Enter reps first');return;}
      s.r=Math.round(lr);const inp=document.querySelector(`.sg input[data-f="r"][data-b="${bi}"][data-s="${si}"]`);if(inp)inp.value=String(s.r);
    }
    setDone(bi,si,!s.done);
  },
  tStart(t){const b=state.draft&&state.draft.ex[+t.dataset.b];if(b&&+b.plan.rest>0)startTimer(+b.plan.rest);},
  sWarm(t){
    const s=draftSet(t);const bi=+t.dataset.b,si=+t.dataset.s;if(!s)return;
    if(!s.warm&&!s.drop)s.warm=true;else if(s.warm){s.warm=false;s.drop=true;}else s.drop=false;
    adjSync(state.draft.ex[bi]);
    // Numbers, placeholders and the progress bar all depend on which rows are
    // working sets, so redraw the block rather than patch one row.
    refreshPR(bi,si,false);updateProgress(bi);updateSessBar();saveNow();rerenderKeepScroll();
  },
  fillLast(t){
    const b=state.draft.ex[+t.dataset.b];let n=0;
    b.sets.forEach((s,i)=>{const lr=lastRFor(b,i);if(!s.done&&!s.warm&&!s.drop&&s.r==null&&lr!=null){s.r=lr;n++;}});
    if(!n){toast('Nothing to fill');return;}
    saveNow();rerenderKeepScroll();toast(`${n} set${n===1?'':'s'} filled with last time's reps`);
  },
  dashJump(t){
    const el=document.getElementById('sec-'+t.dataset.sec);if(!el)return;
    if(!el.open)el.open=true;
    el.scrollIntoView({block:'start',behavior:'smooth'});
  },
  goBackup(){if(ui.modal)closeModal();ui.tab='settings';ui.folds['settings:data']=true;window.scrollTo(0,0);render();const el=document.getElementById('dataSec');if(el)el.scrollIntoView({block:'start'});},
  // The new working set copies the last working set's load, not a drop set's
  // (75%) or a warm-up's.
  sAdd(t){const b=state.draft.ex[+t.dataset.b];let li=-1;for(let i=b.sets.length-1;i>=0;i--)if(!b.sets[i].drop&&!b.sets[i].warm){li=i;break;}if(li<0)li=b.sets.length-1;
    // Grey by default: the new row shows the load above it. Filled in, it copies that load (typed or grey).
    b.sets.push({w:fillLoads()&&li>=0?effW(b,li):null,r:null,rir:null,warm:false,drop:false,done:false});saveNow();rerenderKeepScroll();},
  /* Warm-ups were missing entirely, which is also why the planned time estimate
     was optimistic. New warm-ups go in at the top, already flagged, so they
     stay out of every analytic, and are seeded from the working load. */
  wAdd(t){
    const b=state.draft.ex[+t.dataset.b];
    let base=0;for(let i=0;i<b.sets.length;i++){const s=b.sets[i];if(s.warm||s.drop)continue;const w=+effW(b,i)||0;if(w>0){base=w;break;}}
    if(!base)base=Math.max(0,...b.sets.map((s,i)=>+effW(b,i)||0));
    const n=b.sets.filter(s=>s.warm).length;
    const frac=[0.4,0.6,0.75,0.85][Math.min(n,3)];
    // Each new warm-up goes after the ones already there, so they climb to the working load (r27; they used to stack heaviest first).
    let at=0;while(at<b.sets.length&&b.sets[at].warm)at++;
    b.sets.splice(at,0,{w:base>0?lighterLoad(EX(b.exId),b.plan,base,base*frac):null,r:null,rir:null,warm:true,drop:false,done:false});
    adjSync(b);saveNow();rerenderKeepScroll();toast('Warm-up set added');
  },
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
    const finish=list=>{const n=fillSets(m.b,list);closeModal();rerenderKeepScroll();toast(`${n} set${n===1?'':'s'} filled and marked done`);};
    if(got){finish(got);return;}
/*ai{*/    if(!aiOn()){m.err=`Could not read that. Try the pattern 225x5, 5, 4 ${rirScale()==='rpe'?'rpe 9':'rir 1'}.`;renderModal();return;}
    const ctl=new AbortController();AI.ctl=ctl;m.busy=true;m.err='';renderModal();
    AI.fn.json(`Convert this gym log for the exercise "${ex.name}" into sets. Loads are in ${U()}.${ex.bw?' This is a bodyweight exercise: the load is weight added to bodyweight, and "bodyweight" or "bw" alone means 0.':''} When a set has no load, it uses the previous set's load; if no load is given anywhere, use null. ${rirScale()==='rpe'?'Effort is written as RPE (10 means no reps left): convert each to rir = 10 minus the RPE. ':''}RIR means reps in reserve; use null when it is not stated for a set, and apply a value stated for "all" or "each" to every set. Reply with only a JSON array, one object per set in order, like [{"w":225,"r":5,"rir":1}].\n\nLog: ${txt}`,{signal:ctl.signal,modelTier:'quick'})
      .then(a=>{if(ui.modal!==m)return;const v=aiSetsValid(a);if(!v){m.err='Claude could not turn that into sets. Try the pattern 225x5, 5, 4 rir 1.';return;}
        if(v.some(x=>!x.w)&&!ex.bw&&defW!=null)v.forEach(x=>{if(!x.w)x.w=defW;});finish(v);})
      .catch(e=>{if(ui.modal!==m)return;m.err=aiErr(e)||'';})
      .finally(()=>{if(AI.ctl===ctl)AI.ctl=null;if(ui.modal===m){m.busy=false;renderModal();}});
/*}ai=m.err=`Could not read that. Try the pattern 225x5, 5, 4 ${rirScale()==='rpe'?'rpe 9':'rir 1'}.`;renderModal();*/  },
  aiStop(){if(AI.ctl){try{AI.ctl.abort();}catch(e){/* already finished */}}},
/*ai{*/  aiDebrief(t){const sid=t.dataset.sid;const pr=debriefPrompt(sid);if(!pr){toast('That session is no longer saved');return;}const m={kind:'ai',title:'Session debrief'};openModal(m);aiRun(m,pr,'default');},
  aiReview(){openModal({kind:'ai',title:'Ask Claude about your training',ask:true,q:''});},
  aiAsk(){const m=ui.modal;if(!m||m.kind!=='ai')return;const q=(($('#aiQ')||{}).value||'').trim();m.q=q;if(!q){m.err='Type a question first.';renderModal();return;}if(!state.sessions.some(x=>!x.demo)){m.err='Log a session first so there is something to review.';renderModal();return;}aiRun(m,reviewPrompt(q),'default');},
  bAiSwap(t){openModal({kind:'aiSwap',mode:'swapBlock',b:+t.dataset.b,why:'',picks:null});},
  aiSwapAsk(){
    const m=ui.modal;if(!m||m.kind!=='aiSwap'||!aiOn())return;const b=state.draft&&state.draft.ex[m.b];if(!b)return;
    m.why=(($('#aiWhy')||{}).value||'').trim();const pr=swapPrompt(b,m.why);if(!pr){m.err='No other exercise in your library trains this muscle.';renderModal();return;}
    const ctl=new AbortController();AI.ctl=ctl;m.busy=true;m.err='';renderModal();
    AI.fn.json(pr.text,{signal:ctl.signal,modelTier:'default'})
      .then(r=>{if(ui.modal!==m)return;const ok=new Set(pr.cands.map(e=>e.id));const seen=new Set();
        const picks=(r&&Array.isArray(r.picks)?r.picks:[]).filter(p=>p&&typeof p.id==='string'&&ok.has(p.id)&&!seen.has(p.id)&&seen.add(p.id)).slice(0,3).map(p=>({id:p.id,why:typeof p.why==='string'?p.why.slice(0,200):''}));
        if(!picks.length)m.err='No usable suggestions came back. Try again or use Swap exercise.';m.picks=picks;})
      .catch(e=>{if(ui.modal!==m)return;m.err=aiErr(e);})
      .finally(()=>{if(AI.ctl===ctl)AI.ctl=null;if(ui.modal===m){m.busy=false;renderModal();}});
  },
/*}ai=*/  heroMore(){ui.heroMore=!ui.heroMore;rerenderKeepScroll();},
  startAltOpen(t){openModal({kind:'startAlt',di:+t.dataset.day,free:t.dataset.free==='1'});},
  // A choice in Change: the sheet closes first, then the start it names runs as the card's button did.
  altGo(t){const go=t.dataset.go;closeModal();if(ACT[go])ACT[go](t);},
  // Another day of the plan on the card (the old Change day list); in a blank-session Today it shows that day's card.
  dayPick(t){const i=+t.dataset.i;closeModal();ui.todayDay=i;window.scrollTo(0,0);render();},
  noteReuse(t){const b=state.draft&&state.draft.ex[+t.dataset.b];if(!b||!b.lastNote)return;b.note=b.lastNote.text;saveNow();rerenderKeepScroll();toast('Note carried into this session');},
  bNote(t){const bi=+t.dataset.b;openModal({kind:'note',bi,title:`Note: ${exName(state.draft.ex[bi].exId)}`,text:state.draft.ex[bi].note||''});},
  noteSave(){
    const m=ui.modal;const ta=$('#mNote');if(!m||!ta||!state.draft)return;
    const b=state.draft.ex[m.bi];if(b)b.note=ta.value.trim();
    closeModal();saveNow();rerenderKeepScroll();
  },
  /* Removes the last set not yet done. A logged set is only removed when
     every set is done, and then with Undo, since it holds real numbers. */
  /* − Set (r25 guardrail). It takes the last row that holds nothing of the
     lifter's (no tick, no reps, no RIR, and a load that is only the app's
     suggestion), quietly. When every row holds something, it no longer
     removes the last one on a single tap: it asks first, naming the set, and
     Undo still follows. A logged set used to go with only a toast. */
  sDel(t){const d=state.draft;const bi=+t.dataset.b;const b=d&&d.ex[bi];if(!b||!b.sets.length)return;
    const blank=x=>rowBlank(b,x);
    let i=-1;for(let k=b.sets.length-1;k>=0;k--)if(blank(b.sets[k])){i=k;break;}
    if(i>=0){b.sets.splice(i,1);adjSync(b);saveNow();rerenderKeepScroll();return;}
    // Every row holds something: the last row not ticked goes first, a logged set only after.
    for(let k=b.sets.length-1;k>=0;k--)if(!b.sets[k].done){i=k;break;}
    if(i<0)i=b.sets.length-1;
    const x=b.sets[i],ex=EX(b.exId),did=d.id,exId=b.exId,n=b.sets.slice(0,i+1).filter(y=>!y.warm&&!y.drop).length;
    const what=`${x.warm?'Warm-up':x.drop?'Drop set':'Set '+n}`;
    const val=+x.r>0?setShort(ex,x.w==null?0:x.w,x.r):x.w!=null?loadLabel(ex,x.w)+(ex.bw?'':' '+U()):'';
    confirmBox(`Remove ${what.toLowerCase()}?`,`${ex.name}${val?`: ${val}`:''}, ${x.done?'logged':'typed, not ticked'}. Undo is offered right after.`,'Remove set',()=>{
      // Found again when confirmed: a cloud refresh may have replaced the session while the dialog was open.
      const dd=state.draft;const bb=dd&&dd.id===did?dd.ex[bi]:null;const xx=bb&&bb.exId===exId?bb.sets[i]:null;
      if(!xx||xx.done!==x.done||xx.r!==x.r||xx.w!==x.w){toast('That set changed. Nothing was removed.');rerenderKeepScroll();return;}
      snapshot(()=>{const d3=state.draft;if(!d3||d3.id!==did||!d3.ex.includes(bb))return false;bb.sets.splice(Math.min(i,bb.sets.length),0,xx);adjSync(bb);return true;});
      bb.sets.splice(i,1);adjSync(bb);saveNow();rerenderKeepScroll();toast(xx.done?'Logged set removed':'Set removed',true);},true);
  },
  bUp(t){if(moveBlock(+t.dataset.b,+t.dataset.b-1))rerenderKeepScroll();},
  bDown(t){if(moveBlock(+t.dataset.b,+t.dataset.b+1))rerenderKeepScroll();},
  /* Removing an exercise (r25 guardrail): one with logged or typed sets asks
     first, naming how many; an untouched one goes with an Undo as before. */
  bDel(t){const d=state.draft;const bi=+t.dataset.b;const blk=d.ex[bi];if(!blk)return;const did=d.id;
    const go=()=>{const dd=state.draft;if(!dd||dd.id!==did||dd.ex[bi]!==blk){if(ui.modal)closeModal();toast('That exercise changed. Nothing was removed.');rerenderKeepScroll();return;}
      snapshot(()=>{const d3=state.draft;if(!d3||d3.id!==did)return false;d3.ex.splice(Math.min(bi,d3.ex.length),0,blk);fixSupersets(d3.ex.map(x=>x.plan));return true;});
      keepOpen(()=>dd.ex.splice(bi,1));saveNow();rerenderKeepScroll();toast('Exercise removed',true);};
    const logged=blk.sets.filter(x=>x.done).length,typed=blk.sets.filter(x=>!x.done&&(+x.r>0||x.rir!=null)).length;
    if(logged||typed){if(ui.modal)closeModal();confirmBox(`Remove ${EX(blk.exId).name}?`,`${logged?`${logged} logged set${logged===1?'':'s'}`:''}${logged&&typed?' and ':''}${typed?`${typed} typed set${typed===1?'':'s'}`:''} go with it. Undo is offered right after.`,'Remove exercise',go,true);return;}
    go();},
  bSwap(t){openModal({kind:'picker',mode:'swapBlock',b:+t.dataset.b,title:'Swap exercise',q:'',m:EX(state.draft.ex[+t.dataset.b].exId).primary});},
  pickSession(){openModal({kind:'picker',mode:'addBlock',title:'Add exercise to session',q:'',m:''});},
  pickDay(t){openModal({kind:'picker',mode:'addDay',day:+t.dataset.day,title:`Add to ${dayLabel(curRoutineB(),+t.dataset.day)}`,q:'',m:''});},
  iSwap(t){const f=findItem(t.dataset.uid);openModal({kind:'picker',mode:'swapItem',uid:t.dataset.uid,title:'Swap exercise',q:'',m:f?EX(f.it.exId).primary:''});},
  pickDo(t){applyPick(ui.modal,t.dataset.ex);},
  /* Pick for me, before a session: rank the routine's days for today. */
  pickToday(){openModal({kind:'pickToday'});},
  pickView(t){closeModal();ui.todayDay=+t.dataset.day;ui.tab='today';window.scrollTo(0,0);render();},
  /* Pick for me, inside a session: what to add next. */
  pickEx(){if(!state.draft)return;openModal({kind:'pickEx'});},
  pickExAdd(t){
    const d=state.draft;if(!d)return;const id=t.dataset.ex;if(!state.exercises.some(e=>e.id===id)){closeModal();return;}
    const p=planFor(id,null,d.dayId);const n=Math.round(+t.dataset.sets);if(n>=1&&n<=30)p.sets=n;
    d.ex.push(newBlock(id,p,{deload:!!d.deload,light:!!d.light,before:d.date}));saveNow();closeModal();afterAdd(d.ex.length-1);
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
    state.draft={id:uid(),startedAt:Date.now(),date:today(),dayIdx:m.day,dayId:day.id,dayName:day.name+(deload?' (deload)':''),routineId:R.id,deload,light:false,limited:true,cardio:[],notes:[deload?'Deload: half sets, about 90% loads, 3+ RIR.':'',note].filter(Boolean).join(' '),editingId:null,ex};
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
    if(!state.draft){const R=activeRoutine();const di=t.dataset.day!=null?+t.dataset.day:null;ui.todayDay=d===today()||di==null||!R.days[di]?null:di;}
    if(ui.modal)closeModal();window.scrollTo(0,0);render();
  },
  finish(){
    const d=state.draft;
    /* Sets left (r30): finishing with half the planned sets untouched used to
       save without a word. Asked once, only when something was done, and not
       for an edit or a past workout typed in afterwards. */
    if(!d._leftAsked&&!d.editingId&&!d.past){
      let n=0,left=0;for(const b of d.ex)for(const x of b.sets){if(x.warm)continue;n++;if(!x.done&&rowBlank(b,x))left++;}
      const any=d.ex.some(b=>b.sets.some(x=>x.done&&!x.warm));
      if(any&&left>0){
        confirmBox(`${left} of ${n} sets not done`,`Finish now and they are left out. An exercise you started and did not finish is saved as trimmed, so it does not set your next target.`,'Finish now',()=>{const dd=state.draft;if(!dd)return;dd._leftAsked=true;ACT.finish();},false,{label:'Keep going',fn:()=>{}});
        return;
      }
    }
    /* Ramp-up sets logged as work count as hard sets and inflate weekly volume.
       A done working set is treated as a likely ramp-up when it comes before
       the first set at that exercise's top load and is under 80% of it. Asked
       once per session; either answer moves on to the normal checks. */
    if(!d._rampAsked){
      const ramps=[];
      for(const b of d.ex){
        const e=EX(b.exId);const wk=b.sets.filter(x=>x.done&&!x.warm&&!x.drop&&+x.r>0);if(wk.length<2)continue;
        const L=x=>bwLoad(e,d.date)+(+x.w||0);
        const top=Math.max(...wk.map(L));if(!(top>0))continue;
        const firstTop=b.sets.findIndex(x=>x.done&&!x.warm&&!x.drop&&+x.r>0&&Math.abs(L(x)-top)<1e-6);
        const bi=d.ex.indexOf(b);
        /* A lighter set before the first top set is a likely warm-up when it
           was easy: logged at 5+ RIR, or, with no RIR, 5+ reps short of what
           your estimated 1RM says that load allows. With neither, under 75%
           of the top load on a compound lift or 80% on isolation work. A set
           logged at 4 RIR or less is never flagged, so hard pyramid sets
           stay working sets. */
        const est=(IDX().exStats[b.exId]||{}).bestAll;const thr=isCompound(e)?0.75:0.8;
        const easy=x=>{if(!(L(x)<top-1e-6))return false;const q=rirEff(x,e);if(q!=null)return q>=5;
          if(est&&!noE1(e)){const rtf=rtfAt(est,L(x));if(rtf!=null)return rtf-(+x.r)>=5;}return L(x)<top*thr;};
        /* A weighted set with no load is a forgotten load, asked about below
           ("Add the missing loads?"), never a ramp-up (r31: "0×8, lighter
           and easy" came first). */
        /* A set at the load the app suggested, or one the app itself raised
           the load after, is a working set by design (r34.2, from the review:
           Finish offered to make the app's own adjusted sets warm-ups). */
        const appSet=(x,si)=>(b.sw!=null&&Math.abs((+x.w||0)-b.sw)<1e-6)||(!!b.adj&&b.adj.up&&si<=b.adj.at);
        b.sets.forEach((x,si)=>{if(si<firstTop&&x.done&&!x.warm&&!x.drop&&+x.r>0&&(e.bw||+x.w>0)&&!appSet(x,si)&&easy(x))ramps.push({bi,si,name:e.name,txt:`${loadLabel(e,+x.w||0)}×${x.r}`});});
      }
      if(ramps.length){
        const done=()=>{const dd=state.draft;if(!dd)return;dd._rampAsked=true;saveNow();ACT.finish();};
        confirmBox('These look like ramp-up sets',
          `${[...new Set(ramps.map(r=>r.bi))].map(bi=>{const rs=ramps.filter(r=>r.bi===bi);return `${rs[0].name}: ${rs.map(r=>r.txt).join(', ')}`;}).join('; ')}. Lighter and easy, before your top set. Mark ${ramps.length>1?'them':'it'} as warm-up${ramps.length>1?'s':''}?`,
          `Mark as warm-up${ramps.length>1?'s':''}`,
          ()=>{const dd=state.draft;if(!dd)return;for(const r of ramps){const x=dd.ex[r.bi]&&dd.ex[r.bi].sets[r.si];if(x){x.warm=true;x.drop=false;}}done();},false,
          {label:'Keep as working sets',fn:done});
        return;
      }
    }
    /* Only sets marked done are saved. That is the rule, but silently obeying
       it is how a session of typed reps disappears: you fill five rows, tap the
       checkmark on one, and four sets are gone with no warning. Count them
       first and let the user keep them. */
    const unchecked=[];
    for(const b of d.ex){const n=b.sets.filter(s=>!s.done&&!s.warm&&+s.r>0).length;if(n)unchecked.push({b,n,name:EX(b.exId).name});}
    if(unchecked.length){
      const list=unchecked.map(u=>`${u.name} (${u.n} set${u.n>1?'s':''})`).join(', ');
      const total=unchecked.reduce((a,u)=>a+u.n,0);
      confirmBox('Some sets are not marked done',
        `${total} set${total>1?'s have':' has'} reps entered but no checkmark, so ${total>1?'they':'it'} will not be saved: ${list}.`,
        `Mark ${total>1?'them':'it'} done and save`,
        ()=>{const dd=state.draft;if(!dd)return;for(const b of dd.ex)b.sets.forEach((s,si)=>{if(!s.done&&!s.warm&&+s.r>0){settleLoad(b,si);s.done=true;}});saveNow();ACT.finishNow();},
        false,
        {label:'Save without them',fn:()=>ACT.finishNow()});
      return;
    }
    ACT.finishNow();
  },
  finishNow(){
    const d=state.draft;if(!d)return;
    /* Started and stopped with fewer than half its sets done (r30): saved as
       trimmed, like Short on time, so one set of three never sets the next
       target (a single set at the top of the range would add load). Half or
       more counts as a full session, so someone who often does 3 of 4 still
       has trends. A past workout or an edit keeps what it had. */
    const unfinished=b=>{if(d.editingId||d.past)return false;const dn=b.sets.filter(x=>x.done&&!x.warm).length;const left=b.sets.filter(x=>!x.warm&&!x.done&&rowBlank(b,x)).length;return dn>0&&left>0&&dn<Math.ceil((dn+left)/2);};
    const ex=d.ex.map(b=>({exId:b.exId,note:b.note||'',rr:b.keepRR!==undefined?b.keepRR:(b.plan&&+b.plan.repMin>0&&+b.plan.repMax>0?[+b.plan.repMin,+b.plan.repMax]:null),cut:b.cut||unfinished(b)?true:undefined,light:b.light?true:undefined,sets:b.sets.filter(s=>s.done).map(s=>({w:s.w==null?0:s.w,r:+s.r,rir:s.rir==null||s.rir===''?null:+s.rir,warm:!!s.warm,drop:!!s.drop&&!s.warm,cal:s.cal&&!s.warm?s.cal:undefined}))})).filter(b=>b.sets.length);
    // Side by side, the same lift is saved as one exercise (r34.2, V); apart, each stays where it was done.
    const exJ=joinAdjacent(ex);ex.length=0;ex.push(...exJ);
    const cardio=(d.cardio||[]).filter(c=>c.min>0).map(c=>cleanCardio({...c,date:d.date}));
    if(!ex.length){
      if(cardio.length&&!d.editingId){state.cardio.push(...cardio);state.draft=null;commit();stopTimer();wakeOff();ui.todayDay=null;window.scrollTo(0,0);render();toast('Cardio saved. No lifting session was recorded.');return;}
      toast('Mark at least one set done');return;}
    // A blank load on a weighted lift used to save silently as a real 0 set,
    // which drags down volume load and still counts toward your weekly sets.
    const blanks=[];
    for(const b of ex){const e=EX(b.exId);if(e.bw)continue;const n=b.sets.filter(s=>!(+s.w>0)).length;if(n)blanks.push(`${e.name} (${n} set${n>1?'s':''})`);}
    const save=()=>{
      // Timed only when started and finished today in this app; an edit keeps
      // whatever the original session measured.
      const durMin=d.editingId?(d.durMin||null):(d.startedAt&&d.date===today()?(()=>{const m=Math.round((Date.now()-d.startedAt)/60000);return m>=1&&m<=360?m:null;})():null);
      const sess={id:d.editingId||d.id,date:d.date,dayIdx:d.dayIdx,dayId:d.dayId||null,dayName:(d.dayName||'').trim()||'Session',routineId:d.routineId,ex,notes:d.notes||'',durMin,deload:!!d.deload,light:!!d.light,free:d.free?true:undefined,chk:cleanChk(d.chk)||undefined};
      // When it started: kept on an edit, else the start (or now, for a past workout entered later).
      {const was=d.editingId?state.sessions.find(x=>x.id===d.editingId):null;const t=was?was.t:(d.startedAt||Date.now());if(t)sess.t=t;}
      if(!d.editingId)state.cardio.push(...cardio);
      /* An RIR check offered and passed over waits 3 weeks, as Not now does
         (r32, from the third review: it was offered every session from the
         fourth to the twelfth). Read before the session is saved, since the
         check counts sessions. */
      if(!d.editingId&&calDueIdx(d)>=0&&!d.ex.some(b=>b.sets.some(x=>x.cal&&x.done)))state.settings.calSnooze=today();
      const upd=d.editingId?null:routineUpdates(d);
      /* An edit rebuilds the session from the screen, so fields a newer build
         stored on it, or on an exercise still in its place, are carried over
         (r43, as normalize keeps them), each exercise matched by its lift in
         order, so one moved during the edit keeps them; sets are what the edit changes. */
      if(d.editingId){const i=state.sessions.findIndex(s=>s.id===d.editingId);if(i>=0){const o=state.sessions[i];sess.demo=o.demo;
        keepExtra(o,sess);const used=new Set();sess.ex.forEach(b=>{const ob=o.ex.find(x=>x.exId===b.exId&&!used.has(x));if(ob){used.add(ob);keepExtra(ob,b);}});state.sessions[i]=sess;}else state.sessions.push(sess);}
      else state.sessions.push(sess);
      /* A real session saved while demo data is loaded (r30): the demo goes,
         so stats never mix generated sessions with yours (the review saw 33
         sessions, demo and real, in one set of numbers, and the demo note
         gone). Load demo data in Settings brings it back. */
      const demoGone=!d.editingId&&(state.sessions.some(x=>x.demo)||state.bodyweights.some(x=>x.demo)||state.measurements.some(x=>x.demo));
      if(demoGone){state.sessions=state.sessions.filter(x=>!x.demo);state.bodyweights=state.bodyweights.filter(x=>!x.demo);state.measurements=state.measurements.filter(x=>!x.demo);state.cardio=state.cardio.filter(x=>!x.demo);demoRestore();invalidate();}
      // Saving an edit of a session that was deleted while the edit was open
      // brings it back: the save is the newer action.
      state.trash=state.trash.filter(t=>!(t.kind==='session'&&t.id===sess.id));
      // Recap is computed before the draft is cleared, while the done flags exist.
      // Only exercises with a set done count toward targets (r30), and the
      // planned minutes are what this session planned after any trimming.
      const tried=d.ex.filter(b=>b.tgt&&b.sets.some(x=>x.done&&!x.warm));
      const targets=tried.length,beaten=tried.filter(b=>{const pr=blockProgress(b);return pr&&pr.beat;}).length;
      const pmDraft=draftPlanMin(d);
      const editing=!!d.editingId;
      state.draft=null;commit();stopTimer();wakeOff();
      // An Undo offered during the session (a trim, a removed set) has nothing left to undo once it is saved.
      {const tEl=$('#toast');if(tEl&&tEl.querySelector('[data-act="undo"]')){clearTimeout(toastT);tEl.hidden=true;}}
      const prAll=IDX().prs.filter(p=>(p.sid?p.sid===sess.id:p.date===sess.date)&&ex.some(b=>b.exId===p.exId));const prs=prAll.filter(p=>p.big);
      // Heavier than ever without a new best estimate: said once, quietly, not counted as a PR (r32).
      const heavier=prAll.filter(p=>!p.big&&p.type==='Weight PR').map(p=>{const e=EX(p.exId);return `${e.name} ${setShort(e,p.w,p.r)}`;});
      const work=ex.reduce((a,b)=>a+b.sets.filter(isWork).length,0),hard=r1(ex.reduce((a,b)=>{const e=EX(b.exId);return a+b.sets.reduce((c,q)=>c+hardCredit(q,e),0);},0));
      ui.todayDay=null;window.scrollTo(0,0);render();
      if(editing){toast('Session updated');return;}
      const lines=[`${work} working set${work===1?'':'s'}, ${hard} ${rirHalfOn()?'counted toward the week':'counted as hard'}`];
      // A session dated in the past says where it went, since it is not at the top of History.
      if(sess.date!==today())lines.unshift(`Saved under ${fmtDateLong(sess.date)}`);
      if(durMin){const pm=pmDraft;lines.push(`${durMin} minutes${pm&&!sess.free?`, planned ${estMin(pm)}`:''}`);}
      if(targets)lines.push(`${beaten} of ${targets} exercise target${targets===1?'':'s'} beaten`);
      if(heavier.length)lines.push(`Heaviest yet: ${andList(heavier,4)}`);
      // The PR moment in the recap (item 28): its own gold block, each with what it beat.
      const prList=prs.map(pr=>{const e=EX(pr.exId);if(pr.type==='Weight PR')return {name:e.name,what:`Weight PR, ${setShort(e,pr.w,pr.r)}${pr.value!=null&&isCompound(e)?`, best estimate ${fmtE(pr.value)} ${U()}${loadNote(e)}`:''}`,was:e.assist?'less help than ever':isFinite(pr.prevW)?`heaviest before ${e.bw?loadLabel(e,pr.prevW):fmtW(pr.prevW)+' '+U()}`:''};const ps=pr.type==='e1RM'&&!isCompound(e)?prSet(pr.exId,pr.date):null;if(ps)return {name:e.name,what:`PR, ${setShort(e,ps.w,ps.r)}`,was:'your best for that number of reps'};return pr.type==='e1RM'?{name:e.name,what:`${prName(pr)} ${fmtE(pr.value)} ${U()}${loadNote(e)}`,was:prOverall(pr)?(pr.prevAll!=null?`was ${fmtE(pr.prevAll)}`:''):(pr.prev!=null?`was ${fmtE(pr.prev)} at those reps`:'')}:{name:e.name,what:`${e.timed?'Time':'Rep'} PR, ${setShort(e,pr.w,pr.r)}`,was:pr.prevR?`was ${pr.prevR} ${e.timed?'s':'reps'} at this load or heavier`:'heaviest yet'};});
      if(cardio.length)lines.push(`Cardio and mobility: ${cardio.reduce((a,c)=>a+c.min,0)} min`);
      if(demoGone)lines.push('Demo data removed, so your stats show only your own sessions');
      openModal({kind:'recap',title:'Session saved',lines,prs:prList,note:prs.length?'':(state.sessions.filter(x=>!x.demo).length<=1?'Your first session: these are your starting numbers.':'No PRs this time.'),upd,sid:sess.id});
    };
    /* Asked as "add them" first (r29, item 116): saved as 0, such a set still
       counts as a hard set but gives no estimate, PR, or weight lifted. Add
       loads goes back to the first one, opened, with its load field focused. */
    if(blanks.length)confirmBox('Add the missing loads?',`${andList(blanks)} ${blanks.length>1?'have':'has'} reps but no weight. Saved like this, they count as hard sets but give no estimate, PR, or weight lifted.`,'Add loads',()=>{
      const dr=state.draft;if(!dr)return;
      for(let bi=0;bi<dr.ex.length;bi++){const b=dr.ex[bi];if(EX(b.exId).bw)continue;const si=b.sets.findIndex(x=>x.done&&!(+x.w>0));if(si<0)continue;
        ui.blkOpen.add(blkKey(bi,b));blkOpenObj.add(b);render();
        const f=document.querySelector(`[data-f="w"][data-b="${bi}"][data-s="${si}"]`);if(f){f.scrollIntoView({block:'center'});f.focus();f.classList.add('need');}return;}
    },false,{label:'Save anyway',fn:save});
    else save();
  },
  /* A session with nothing in it goes at once; one with anything entered
     (sets, reps, cardio, a note) asks first. An edit always asks, since the
     saved sets are already in it. */
  discard(){
    const d=state.draft;if(!d)return;
    const out=()=>{state.draft=null;saveNow();stopTimer();wakeOff();window.scrollTo(0,0);render();};
    if(!d.editingId&&!draftEntered(d)){out();toast('Session discarded');return;}
    if(d.editingId&&editFp0.get(d.id)===editFp(d)){out();toast('No changes made');return;}
    confirmBox('Discard this session?',d.editingId?'Your edits will be lost. The saved session stays as it was.':'Sets and cardio logged in this session will not be saved.','Discard',out,true);
  },
  // A grey number in the field is what Save takes, as everywhere in the app (r34.2: the weigh-in card showed the last weight and refused it).
  addBW(t){const inp=document.getElementById((t&&t.dataset&&t.dataset.in)||'bwVal');const v=numIn(inp?(inp.value||(inp.dataset.grey||'')):'');const de=t&&t.dataset&&t.dataset.in?null:$('#bwDate');const date=(de&&de.value)||today();if(v==null||v<=0){toast('Enter a bodyweight');return;}{const kg=fromD(v);if(kg<BW_MIN_KG||kg>BW_MAX_KG){toast(`Bodyweight must be between ${fmtW(BW_MIN_KG)} and ${fmtW(BW_MAX_KG)} ${U()}`);return;}}state.bodyweights=state.bodyweights.filter(b=>b.date!==date);state.bodyweights.push({id:uid(),date,kg:fromD(v)});commit();rerenderKeepScroll();toast('Bodyweight logged');},
  bwLater(){try{localStorage.setItem(BWSNOOZE_KEY,addDays(today(),2));}catch(e){/* per device only */}rerenderKeepScroll();},
  bwAskNo(){try{localStorage.setItem(BWASK_KEY,'1');}catch(e){/* per device only */}rerenderKeepScroll();},
  delBW(t){const id=t.dataset.id;const x=state.bodyweights.find(b=>b.id===id);if(!x)return;
    confirmBox('Delete weigh-in?',`${fmtDate(x.date)}: ${fmtW(x.kg)} ${U()}. Undo is offered right after.`,'Delete',()=>{snapshot();state.bodyweights=state.bodyweights.filter(b=>b.id!==id);commit();rerenderKeepScroll();toast('Entry deleted',true);},true);},
  addMeas(){const m={id:uid(),date:today()};let any=false;for(const [k,lab] of MEAS){const v=numIn($('#ms_'+k).value);if(v!=null&&v>0){const cm=lenFrom(v);if(!(cm<=MEAS_MAX_CM)){toast(`${lab} looks too large. Check the number.`);return;}m[k]=cm;any=true;}}if(!any){toast('Enter at least one measurement');return;}state.measurements=state.measurements.filter(x=>x.date!==m.date);state.measurements.push(m);commit();rerenderKeepScroll();toast('Measurements saved');},
  delMeas(t){const id=t.dataset.id;const x=state.measurements.find(m=>m.id===id);if(!x)return;
    confirmBox('Delete measurements?',`The tape entry from ${fmtDate(x.date)}. Undo is offered right after.`,'Delete',()=>{snapshot();state.measurements=state.measurements.filter(m=>m.id!==id);commit();rerenderKeepScroll();toast('Entry deleted',true);},true);},
  toggleItem(t){ui.openItem=ui.openItem===t.dataset.uid?null:t.dataset.uid;rerenderKeepScroll();},
  iUp(t){const R=curRoutineB();move(R.days[+t.dataset.day].items,+t.dataset.i,+t.dataset.i-1);commit();rerenderKeepScroll();},
  iDown(t){const R=curRoutineB();move(R.days[+t.dataset.day].items,+t.dataset.i,+t.dataset.i+1);commit();rerenderKeepScroll();},
  iDel(t){snapshot();const R=curRoutineB();const [x]=R.days[+t.dataset.day].items.splice(+t.dataset.i,1);commit();rerenderKeepScroll();toast(`${exName(x.exId)} removed`,true);},
  libAdd(t){const R=curRoutineB();const d=R.days[ui.bTarget];d.items.push(newItem(t.dataset.ex));if(d.rest)d.rest=false;commit();rerenderKeepScroll();toast(`Added to ${dayLabel(R,ui.bTarget)}`);},
  rActive(){state.activeRoutineId=ui.bRoutine;ui.todayDay=null;commit();render();toast('Active routine changed');},
  rNew(){openModal({kind:'routineNew'});},
  rNewSave(){const nm=(($('#rNewName')||{}).value||'').trim();if(!nm){toast('Give the routine a name');return;}if(nameTaken(nm)){toast('A routine already has that name. Pick another.');return;}closeModal();ACT.rNewDo(nm);},
  rClean(){const c=routineClutter();if(!c.length)return;confirmBox(`Remove ${c.length} routine${c.length>1?'s':''}?`,`${c.map(r=>r.name).join(', ')}. ${c.every(plainTemplate)?'Ready-made ones can be added again from New from a template.':`Any you changed stay under Recently deleted in History for ${TRASH_DAYS} days.`}`,'Remove',()=>{const cc=routineClutter();if(!cc.length)return;snapshot();const ids=new Set(cc.map(r=>r.id));for(const r of cc)toTrash('routine',r);state.routines=state.routines.filter(r=>!ids.has(r.id));if(!state.routines.find(r=>r.id===ui.bRoutine))ui.bRoutine=state.activeRoutineId;commit();render();toast(`${cc.length} routine${cc.length>1?'s':''} removed`,true);},true);},
  rNewDo(nm){
    // An existing empty routine is reused rather than stacking another blank one.
    const blank=state.routines.find(r=>routineEmpty(r)&&r.id!==state.activeRoutineId);
    if(blank){blank.name=nm||blank.name;ui.bRoutine=blank.id;commit();render();toast('Reused your empty routine');return;}const r={id:uid(),name:nm||'New routine',schedule:'cycle',days:[1,2,3].map(()=>({id:uid(),name:'Training day',rest:false,items:[]}))};state.routines.push(r);ui.bRoutine=r.id;commit();render();},
  rTemplate(){openModal({kind:'templates',from:'plan'});},
  rDup(){const src=curRoutineB();const r=JSON.parse(JSON.stringify(src));r.id=uid();r.name=src.name+' (copy)';r.days.forEach(d=>{d.id=uid();d.items.forEach(it=>it.uid=uid());});state.routines.push(r);ui.bRoutine=r.id;commit();render();},
  rDel(){const R=curRoutineB();if(state.routines.length<2)return;confirmBox('Delete routine?',`"${R.name}" will be removed. Logged sessions are kept${plainTemplate(R)?'; it can be added again from New from a template.':`, and the routine stays under Recently deleted in History for ${TRASH_DAYS} days.`}`,'Delete routine',()=>{const Rn=state.routines.find(r=>r.id===R.id);if(!Rn||state.routines.length<2){rerenderKeepScroll();return;}snapshot();toTrash('routine',Rn);state.routines=state.routines.filter(r=>r.id!==R.id);if(state.activeRoutineId===R.id)state.activeRoutineId=state.routines[0].id;ui.bRoutine=state.activeRoutineId;commit();render();toast('Routine deleted',true);},true);},
  exNew(){openModal({kind:'exEdit',isNew:true,e:{id:'c_'+uid(),name:'',primary:'chest',secondary:[],equip:'cable',bw:false,rare:false,note:'',custom:true,archived:false}});},
  exNewFromPicker(){const back=ui.modal;if(!back||back.kind!=='picker')return;openModal({kind:'exEdit',isNew:true,back,e:{id:'c_'+uid(),name:(back.q||'').trim(),primary:back.m||'',secondary:[],equip:'cable',bw:false,rare:false,note:'',custom:true,archived:false,incRaw:''}});},
  exBack(){const m=ui.modal;if(m&&m.back)openModal(m.back);else closeModal();},
  exEdit(t){ui.exBody=false;const e=JSON.parse(JSON.stringify(EX(t.dataset.ex)));e.incRaw=e.inc!=null?fmtW(stepRead(e.inc)):'';e.bwfRaw=String(Math.round(bwShare(e)*100));e.maxRaw=e.maxLoad!=null?fmtW(e.maxLoad):'';e.barRaw=e.barKg!=null?fmtW(e.barKg):'';
    openModal({kind:'exEdit',isNew:false,e});},
  secToggle(t){const e=ui.modal.e;const k=t.dataset.m;e.secondary=e.secondary.includes(k)?e.secondary.filter(x=>x!==k):[...e.secondary,k];renderModal();},
  exSave(){
    const m=ui.modal;const e=m.e;e.name=(e.name||'').trim();if(!e.name){toast('Give the exercise a name');return;}
    // A quick create from search used to default to Chest, so a curl made in a
    // hurry was counted as chest work from then on.
    if(!MK.includes(e.primary)){toast('Pick the main muscle it trains');const el=document.querySelector('[data-ebind="primary"]');if(el)try{el.focus();}catch(x){/* focus is best effort */}return;}
    e.secondary=e.secondary.filter(k=>k!==e.primary);
    {const n=numIn(e.incRaw);e.inc=n!=null&&n>0?fromD(Math.min(n,U()==='lb'?1100:500)):null;delete e.incRaw;}
    {const n=numIn(e.maxRaw);if(n!=null&&n>0)e.maxLoad=fromD(Math.min(n,U()==='lb'?4000:2000));else delete e.maxLoad;delete e.maxRaw;}
    {const n=numIn(e.barRaw);if(n!=null&&n>0&&platesMode(e)==='bar')e.barKg=fromD(Math.min(n,U()==='lb'?110:50));else delete e.barKg;delete e.barRaw;}
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
  exDel(t){
    const id=t.dataset.ex;const e=EX(id);
    const used=state.routines.some(r=>r.days.some(d=>d.items.some(i=>i.exId===id)))||state.sessions.some(s=>s.ex.some(b=>b.exId===id))||(state.draft&&state.draft.ex.some(b=>b.exId===id));
    confirmBox('Delete exercise?',used?`${e.name} is used in your routines or history. It will be hidden from the library, and past data stays intact.`:`${e.name} will be removed.`,'Delete',()=>{
      snapshot();
      const cur=state.exercises.find(x=>x.id===id);if(!cur){rerenderKeepScroll();return;}
      if(used)cur.archived=true;
      else{
        state.exercises=state.exercises.filter(x=>x.id!==id);
        // Built-ins are re-added from the library on every load, so without
        // this the deletion silently reversed itself on the next reload.
        if(!e.custom&&!state.settings.removedLib.includes(id))state.settings.removedLib.push(id);
      }
      commit();rerenderKeepScroll();toast('Exercise deleted',true);
    },true);
  },
  libKind(t){const v=t.dataset.v||'';if(!['','common','rare'].includes(v))return;ui.libKind=v;rerenderKeepScroll();},
  regionWk(t){const v=+t.dataset.v;if(!REGION_WKS.some(x=>x[0]===v))return;try{localStorage.setItem(REGION_KEY,String(v));}catch(e){/* kept for this visit only */}ui.regionWk=v;rerenderKeepScroll();},
  volMode(t){const v=t.dataset.v;if(!VOL_MODES.some(x=>x[0]===v))return;ui.volMode=v;rerenderKeepScroll();},
  chartRange(t){ui.rng=ui.rng||{};ui.rng[t.dataset.id]=t.dataset.v;rerenderKeepScroll();},
  histMore(){ui.histLimit+=HIST_PAGE;rerenderKeepScroll();},
  mapSel(t){const m=t.getAttribute('data-m');ui.mapSel=ui.mapSel===m?null:m;rerenderKeepScroll();},
  accent(t){const v=t.getAttribute('data-v');if(!ACCENTS.some(([k])=>k===v))return;if(v===ACCENT0)delete state.settings.accent;else state.settings.accent=v;commit();rerenderKeepScroll();},
  mapSrc(t){ui.mapSrc=t.getAttribute('data-v');rerenderKeepScroll();},
  mapView(t){try{localStorage.setItem(MAPVIEW_KEY,t.getAttribute('data-v')==='3d'?'3d':'flat');}catch(e){/* remembered for this visit only */}B3.viewMem=t.getAttribute('data-v')==='3d'?'3d':'flat';rerenderKeepScroll();},
  map3dTurn(t){map3dTurnTo([0,Math.PI/2,Math.PI][+t.getAttribute('data-v')]||0);},
  /* Every tile, summary row and map detail lands on the matching dashboard
     section, opened even if you had folded it, with the relevant muscle or
     exercise already selected. */
  goWeek(){ui.folds['today:week']=true;render();try{const el=document.querySelector('[data-sk="today:week"]');if(el){el.open=true;el.scrollIntoView({block:'start',behavior:'smooth'});}}catch(e){/* scroll is best effort */}},
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
  dAdd(){const R=curRoutineB();if(R.schedule==='weekly'||R.days.length>=MAX_DAYS)return;R.days.push({id:uid(),name:'Training day',rest:false,items:[]});ui.bTarget=R.days.length-1;ui.dayFocus=undefined;commit();rerenderKeepScroll();toast(`Day ${R.days.length} added`);},
  dAddRest(){const R=curRoutineB();if(R.schedule==='weekly'||R.days.length>=MAX_DAYS)return;R.days.push({id:uid(),name:'Rest',rest:true,items:[]});commit();rerenderKeepScroll();toast(`Day ${R.days.length} added as rest`);},
  dFold(t){const R=curRoutineB();const id=t.dataset.id;const open=dayFocusId(R)===id;
    ui.dayFocus=open?'':id;if(!open){const i=R.days.findIndex(d=>d.id===id);if(i>=0)ui.bTarget=i;}
    rerenderKeepScroll();
    if(!open){const el=document.querySelector(`.day[data-did="${CSS.escape(id)}"]`);if(el)try{el.scrollIntoView({block:'start',behavior:'smooth'});}catch(e){/* scroll is best effort */}}},
  layoutReset(){snapshot();state.settings.secOrder=defaultOrder();commit();rerenderKeepScroll();toast('Section order reset on every tab',true);},
  dUp(t){const R=curRoutineB();const i=+t.dataset.day;if(i<1)return;move(R.days,i,i-1);ui.todayDay=null;commit();rerenderKeepScroll();},
  dDown(t){const R=curRoutineB();const i=+t.dataset.day;if(i>=R.days.length-1)return;move(R.days,i,i+1);ui.todayDay=null;commit();rerenderKeepScroll();},
  dDel(t){
    const R=curRoutineB();const i=+t.dataset.day;
    if(R.schedule==='weekly')return;
    if(R.days.length<2){toast('A cycle needs at least one day');return;}
    const d=R.days[i];const rid=R.id,did=d.id;
    /* Resolved again by id when confirmed: a cloud refresh while the dialog is
       open replaces state, and editing the old objects would be lost. */
    const go=()=>{const R2=state.routines.find(r=>r.id===rid);const j=R2?R2.days.findIndex(x=>x.id===did):-1;if(j<0||R2.days.length<2){toast('That day changed on another device. Nothing was removed.');rerenderKeepScroll();return;}
      snapshot();R2.days.splice(j,1);if(ui.bTarget>=R2.days.length)ui.bTarget=R2.days.length-1;ui.todayDay=null;commit();rerenderKeepScroll();toast(`${d.name} removed`,true);};
    if(d.items.length)confirmBox('Remove this day?',`${dayLabel(R,i)}: ${d.name} and its ${d.items.length} exercise${d.items.length>1?'s':''} will be removed from the routine. Sessions you already logged are not affected.`,'Remove day',go,true);
    else go();
  },
  histToggle(t){ui.histOpen=ui.histOpen===t.dataset.id?null:t.dataset.id;rerenderKeepScroll();},
  histEdit(t){
    const s=state.sessions.find(x=>x.id===t.dataset.id);if(!s)return;
    const go=()=>{const R=state.routines.find(r=>r.id===s.routineId)||activeRoutine();
      const dayItems=s.free?[]:((R.days[sessDayIdx(R,s)]||{items:[]}).items);
      state.draft={id:uid(),editingId:s.id,deload:!!s.deload,light:!!s.light,free:s.free?true:undefined,chk:s.chk?{...s.chk}:undefined,startedAt:null,durMin:s.durMin||null,date:s.date,dayIdx:s.dayIdx,dayId:s.dayId||null,dayName:s.dayName,routineId:s.routineId,notes:s.notes||'',ex:s.ex.map(b=>{const it=dayItems.find(i=>i.exId===b.exId);const plan=it?{...it}:planFor(b.exId);return {exId:b.exId,plan,note:b.note||'',keepRR:b.rr||null,cut:b.cut?true:undefined,light:b.light?true:undefined,hint:'Editing saved sets.',lastR:[],sets:b.sets.map(x=>({w:x.w,r:x.r,rir:x.rir,warm:!!x.warm,drop:!!x.drop,done:true,cal:x.cal?{...x.cal}:undefined}))};})};
      editFp0.set(state.draft.id,editFp(state.draft));
      saveNow();ui.tab='today';window.scrollTo(0,0);render();};
    if(state.draft)confirmBox('Replace the session in progress?','You have an unsaved session open. Editing this one will discard it.','Discard and edit',go,true);else go();
  },
  histDel(t){confirmBox('Delete session?',`This removes it from history and all analytics. It stays under Recently deleted for ${TRASH_DAYS} days (the ${TRASH_MAX} most recent items are kept).`,'Delete session',()=>{snapshot();const s=state.sessions.find(x=>x.id===t.dataset.id);if(s&&!s.demo)toTrash('session',s);state.sessions=state.sessions.filter(x=>x.id!==t.dataset.id);commit();render();toast('Session deleted',true);},true);},
  prio(t){const p=state.settings.priorities;const k=t.dataset.m;state.settings.priorities=p.includes(k)?p.filter(x=>x!==k):[...p,k];commit();rerenderKeepScroll();},
  export(){exportBackup();},
  syncNow(){if(!cloud.on)return;cloud.retry=0;setCloud('connecting');cq(cloudPull).then(()=>{if(cloud.status==='synced')toast('Synced');});},
  exportCsv(){exportCSV();},
  showBackup(){openModal({kind:'text',title:'Backup text',help:'Select all and copy. Paste it into Import on any device to restore.',text:JSON.stringify({app:'ironlog',exported:new Date().toISOString(),state}),readonly:true});},
  copyText(){const ta=$('#mText');ta.select();let ok=false;try{if(navigator.clipboard){navigator.clipboard.writeText(ta.value).then(()=>{markExported();toast('Copied');},()=>toast('Select the text and copy it manually'));return;}ok=document.execCommand('copy');}catch(e){log('copy',e);}if(ok)markExported();toast(ok?'Copied':'Select the text and copy it manually');},
  pasteImport(){openModal({kind:'text',title:'Import backup text',help:'Paste the full backup text here.',text:'',readonly:false});},
  importText(){importData($('#mText').value);},
  demoLoad(){confirmBox('Load demo data?','Adds 8 weeks of generated sessions tagged as demo, based on your active routine. Your own logs are not changed.','Load demo data',()=>{const first=demoFirstRun();demoKeep();
    // On a first run the targets fit the routine, as picking it would (r29);
    // demoRestore puts the settings back when the demo is cleared.
    if(first)fitTargets(activeRoutine());makeDemo();ui.tab='dash';window.scrollTo(0,0);render();toast('Demo data loaded');});},
  demoStart(){state.sessions=state.sessions.filter(s=>!s.demo);state.bodyweights=state.bodyweights.filter(b=>!b.demo);state.measurements=state.measurements.filter(m=>!m.demo);demoRestore();commit();ui.tab='today';ui.folds={};window.scrollTo(0,0);render();},
  demoClear(){snapshot();state.sessions=state.sessions.filter(s=>!s.demo);state.bodyweights=state.bodyweights.filter(b=>!b.demo);state.measurements=state.measurements.filter(m=>!m.demo);demoRestore();commit();render();toast('Demo data cleared',true);},
  resetAll(){confirmBox('Erase everything?',`All routines, sessions, custom exercises, and body data will be deleted${cloud.on?' on this device and in your cloud copy':' on this device'}. Export a backup first if you might want it.`,'Erase everything',()=>{snapshot();state=normalize(null);commit();ui.tab='today';render();toast('Everything erased',true);},true);}
};

/* A load far from last time's (under 60% or over 140% of it) is the usual
   sign of a per-dumbbell or per-side mix-up. Said once per exercise per
   session, never blocking. Warm-ups and drop sets are expected to be lighter. */
const mixSeen=new Set();
function mixCheck(bi,si){
  const d=state.draft;const b=d&&d.ex[bi];const s=b&&b.sets[si];if(!s||s.warm||s.drop||!(+s.w>0))return;
  const ex=EX(b.exId);const st=IDX().exStats[b.exId];const last=st&&st.last?st.last.topW:0;if(!(last>0))return;
  const r=(+s.w)/last;if(r>=0.6&&r<=1.4)return;
  const key=d.id+':'+bi;if(mixSeen.has(key))return;mixSeen.add(key);
  toast(`${fmtW(+s.w)} ${U()} is ${r>1?'well above':'well below'} last time's ${fmtW(last)}. This one is logged as ${loadWords(ex)}.`,false,7000);
}
