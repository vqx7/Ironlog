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
/* Never a deload (r54, from the audit V asked for): the week's mark does not
   say which day Deload week was tapped, so a workout logged for a day before
   it opened and saved as one. It is logged as what was done, and a lift done
   lighter reads lighter from its numbers. */
function pastDraft(date,di){
  const R=activeRoutine();const day=di==null?null:R.days[di];
  if(!day){const d=freeDraft('Freestyle');return {...d,date,startedAt:null,past:true};}
  return {id:uid(),startedAt:null,date,dayIdx:di,dayId:day.id,dayName:day.name,routineId:R.id,deload:false,light:false,past:true,cardio:[],notes:'',note0:'',editingId:null,ex:day.items.map(it=>newBlock(it.exId,it,{before:date}))};
}
function pastSheet(m){
  const R=activeRoutine();const due=pastDue(R,m.date);
  const on=sessionsOn(m.date).map(x=>x.dayName||'Session');
  const opts=R.days.map((d,i)=>({d,i})).filter(x=>!x.d.rest&&x.d.items.length>0).sort((a,b)=>(b.i===due)-(a.i===due));
  const btn=({d,i})=>`<button class="btn block${i===due?' primary':''} pastday" data-act="pastGo" data-day="${i}"><span>${esc(dayLabel(R,i))}: ${esc(d.name)}</span>${i===due?'<small>due then</small>':`<small>${d.items.length} exercises</small>`}</button>`;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pastH"><div class="sheet-h"><h3 id="pastH">Log a past workout</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
  <label class="field">Date<input type="date" data-pbind="date" value="${m.date}" max="${today()}"></label>
  ${on.length?`<p class="small muted" style="margin:6px 0 0">Already logged that day: ${esc(on.join(', '))}.</p>`:''}
  <div class="stack" style="margin-top:12px">${opts.map(btn).join('')}<button class="btn block pastday" data-act="pastGo" data-day="free"><span>Freestyle</span><small>any exercises</small></button></div>
  <p class="small muted" style="margin:10px 0 0">Quick entry: type each set. ${tipi('No rest timer or clock. A set counts as done once its reps are typed. Last time, targets, and PRs are read as of that date.','About quick entry')}</p></div>`;
}
/* The page's actions by data-act: the moved screens' (History and Settings,
   r57; Plan and Stats, r58; Today, r59; the session screen, r60; each change
   to the log through act) and the legacy script's own, the sheets'. */
const ACT={...HISTORY_ACTS,...SETTINGS_ACTS,...PLAN_ACTS,...DASH_ACTS,...TODAY_ACTS,...MAP_ACTS,...WORKOUT_ACTS,...UPDATE_ACTS,
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
  calOpen(t){const ym=t&&t.dataset&&/^\d{4}-\d{2}$/.test(t.dataset.ym||'')?t.dataset.ym:today().slice(0,7);if(ui.modal)closeModal();openModal({kind:'calendar',ym});}, // 'calendar', not 'cal', the calibration set's sheet (r59: from r25 a calibration set opened the calendar and threw)
  calMonth(t){
    const inline=t.dataset.inline==='1';const m=ui.modal;
    if(!inline&&(!m||m.kind!=='calendar'))return;
    const cur=inline?(ui.calYm||today().slice(0,7)):m.ym;const {min,max}=calBounds();let ym;
    if(t.dataset.v==='now')ym=today().slice(0,7); // this month, now the calendar goes a year ahead (329, r59)
    else{const [y,mo]=cur.split('-').map(Number);const d=new Date(y,mo-1+(+t.dataset.v||0),1);ym=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
    if(ym<min||ym>max)return;
    if(inline){ui.calYm=ym;rerenderKeepScroll();}else{m.ym=ym;renderModal();}},
  calDay(t){
    const d=t.dataset.date;if(!isDate(d)||d>today())return;
    if(ui.modal)closeModal();
    const ss=sessionsOn(d);
    if(ss.length===1){ACT.wkOpen({dataset:{id:ss[0].id}});return;}
    // Two-a-days (r34): a day with more than one session asks which.
    if(ss.length>1){openModal({kind:'daypick',date:d});return;}
    if(d===today()){ACT.wkGo({dataset:{date:d}});return;}
    ACT.pastOpen({dataset:{date:d}});
  },
  install(){
    const how=installKind();
    if(how==='prompt'){
      const e=window.__installEvt;window.__installEvt=null;
      try{e.prompt();Promise.resolve(e.userChoice).then(r=>{if(r&&r.outcome==='accepted')toast(`Installing ${APP_NAME}. Open it from your home screen.`);rerenderKeepScroll();},()=>{});}
      catch(err){log('install',err);openModal({kind:'install',how:'menu'});}
      return;
    }
    openModal({kind:'install',how});
  },
  acctOpen(t){openModal({kind:'account',mode:t.dataset.mode==='signup'?'signup':'signin',email:'',pw:'',back:ui.modal&&ui.modal.kind==='feedback'?ui.modal:undefined});}, // from a problem report, signing in goes back to it (r55, the audit: the report and what was typed in it were gone)
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
    const ok=user=>{acct.user=user;waitStop();obOutClear();try{localStorage.removeItem(ACCT_LATER);}catch(e){/* nothing to clear */}if(ui.modal===m)ACT.exBack();toast('Email confirmed. Signed in and syncing.');if(!cloud.on)cloudInit();acctRerender();};
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
    ui.modal={kind:'account',mode:'sent',title:'Switch back to the app',msg:`Open ${APP_NAME} from your home screen. If it still shows Check your email, it signs in by itself; otherwise sign in there.`};renderModal();acctRerender();
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
    const done=next=>{if(ui.modal!==m)return;if(next){ui.modal={kind:'account',back:m.back,...next};renderModal();}else ACT.exBack();};
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
          done({mode:'sent',title:'Password changed',msg:`Open ${APP_NAME} from your home screen and sign in with the new password. If you use ${APP_NAME} in this browser instead, sign in here.`});
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
      acct.user=null;cloudStop(true);rerenderKeepScroll();toast('Account deleted. Your log is still on this phone.');
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
      acct.user=null;cloudStop(remove);
      /* A session in progress kept on the phone carries on where it was, and
         the app stays as it is after it: sending someone mid-workout to the
         first page would read as the session lost. */
      const mid=!remove&&!!state.draft;
      if(!mid)try{localStorage.setItem(OB_OUT,'1');localStorage.removeItem(OB_ACCT);}catch(e){/* per device only */}
      if(remove){undoForget();setState(normalize(null));saveNow();invalidate();}
      if(!mid){ui.tab='today';window.scrollTo(0,0);}render();toast(remove?'Signed out':'Signed out. A copy stays on this phone.');
    };
    // With changes not yet in the account, say so first rather than "saved in your account" (r34.2).
    if(navigator.onLine===false&&hasUnsent()){confirmBox('Not in your account yet','Some changes have not reached your account. Connect to the internet and sign out again, or sign out and keep them on this phone.','Keep on this phone and sign out',()=>out(false));return;}
    confirmBox('Sign out?','Your log is saved in your account. Sign in on any phone to pick it up again.','Sign out',()=>out(true),false,{label:'Sign out, keep a copy on this phone',fn:()=>out(false),quiet:true});
  },
  startFree(){
    if(state.draft){ui.tab='today';render();return;}
    // In a week marked as a deload, a blank session is one too, as a routine day and Do again are (r54, PENDING 311 c: it started at full sets).
    const dl=isDeloadWeek();state.draft={...freeDraft(dl?'Freestyle (deload)':'Freestyle'),deload:dl,notes:dl?DELOAD_NOTE:''};ui.tab='today';
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
    const drop=new Set();const removed=new Map(),order=d.ex.slice(),did=d.id;
    /* Undo puts back exactly what the trim took (r25): the blank rows, at the
       end of their exercise, and the skipped exercises in their places. Sets
       logged since stay (the merge Undo used before brought back skipped
       exercises but not removed rows). Nothing is marked since r54. */
    snapshot(()=>{const dd=state.draft;if(!dd||dd.id!==did)return false;
      for(const [b,rows] of removed)if(dd.ex.includes(b))b.sets.push(...rows);
      order.forEach((b,i)=>{if(drop.has(i)&&!dd.ex.includes(b))dd.ex.splice(Math.min(i,dd.ex.length),0,b);});
      fixSupersets(dd.ex.map(b=>b.plan));return true;});
    for(const x of pl.bl){
      if(x.keep===x.undone)continue;const b=d.ex[x.bi];
      if(x.keep===0&&!x.started){drop.add(x.bi);continue;}
      // Only blank rows go, from the end; typed and ticked sets always stay.
      let n=x.undone-x.keep;const gone=[];
      for(let i=b.sets.length-1;i>=0&&n>0;i--){const s=b.sets[i];if(!s.warm&&rowBlank(b,s)){gone.unshift(...b.sets.splice(i,1));n--;}}
      removed.set(b,gone);
    }
    d.ex=d.ex.filter((b,bi)=>!drop.has(bi));
    fixSupersets(d.ex.map(b=>b.plan));
    closeModal();saveNow();rerenderKeepScroll();
    toast(`Trimmed to ${estMin(min5(pl.est))}`,true);
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
  secShow(t){
    const k=t.dataset.k;if(!HIDEABLE_KEYS.has(k))return;
    state.settings.hidden=state.settings.hidden.filter(x=>x!==k);ui.folds[k]=true;commit();rerenderKeepScroll();
    const el=document.querySelector(`#view > [data-sk="${k}"]`);if(el)el.scrollIntoView({block:'nearest'});
    const lab=(HIDEABLE.find(x=>x[0]+':'+x[1]===k)||[])[2]||'Section';
    toast(`${lab} added. Hide it again in Settings, Layout.`);
  },
  goLayout(){if(ui.modal)closeModal();ui.tab='settings';ui.folds['settings:layout']=true;window.scrollTo(0,0);render();const el=document.querySelector('#view > [data-mkey="layout"]');if(el)el.scrollIntoView({block:'start'});},
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
    snapshot();setState(normalize({...state,exercises:state.exercises.concat(b.newEx),sessions:state.sessions.concat(b.sessions),cardio:state.cardio.concat(b.cardio),settings:{...state.settings,onboarded:true}}));invalidate();
    const msg=`Imported ${b.sessions.length} session${b.sessions.length===1?'':'s'}${b.cardio.length?`, ${b.cardio.length} cardio entr${b.cardio.length===1?'y':'ies'}`:''}${b.newEx.length?`, ${b.newEx.length} new exercise${b.newEx.length===1?'':'s'}`:''}`;
    const inf=first&&b.sessions.length?routineFromLog(state.sessions,b.ssOf):null;
    if(inf){
      const R=inf.routine;state.routines=dropStarter(state.routines,state.sessions,starterSigs());state.routines.push(R);state.activeRoutineId=R.id;
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
  async previewCopy(){
    if(ENV!=='preview')return;
    toast(`Looking for your ${APP_NAME} log`);
    const {st,err}=await liveLogFetch();
    if(!st){
      if(!acct.user&&AUTH()){confirmBox('Sign in first',`This test version keeps a separate log. Sign in with your ${APP_NAME} account to copy your log in. Your log in ${APP_NAME} stays as it is.`,'Sign in',()=>ACT.acctOpen({dataset:{mode:'signin'}}));return;}
      toast(err?`Could not read your ${APP_NAME} log: ${err.message}`:`No ${APP_NAME} log found for this account or on this phone.`,null,6000);return;}
    const n=realCount(st);st.draft=null;
    const go=()=>{snapshot();setState(st);if(!cloud.on)cloudStop(true);commit();closeModal();ui.tab='today';render();toast(`Copied ${n} session${n===1?'':'s'} from ${APP_NAME}. ${APP_NAME} is unchanged.`,true);};
    if(realCount(state)||state.draft)confirmBox('Replace the preview log?',`Your ${APP_NAME} log has ${n} session${n===1?'':'s'}. Copying replaces everything in this test version; your log in ${APP_NAME} stays as it is. Undo can step this back.`,'Copy my log',go);
    else go();
  },
  obSample(){openModal({kind:'templates',from:'welcome'});},
  // The save kept aside at start (r45): restored through the import's checks, or shown as text (Forget it is Settings', src/app/settings.ts).
  unreadRestore(){const raw=unreadableRaw();if(!raw)return;importData(raw,unreadableForget);},
  unreadShow(){const raw=unreadableRaw();if(raw)openModal({kind:'text',title:'Save kept aside',help:'Select all and copy it somewhere safe.',text:raw,readonly:true});},
  // The fold in the first-run routine picker (r44): its own state, so a re-render keeps it open.
  obProfTog(){ui.obProf=!ui.obProf;rerenderKeepScroll();},
  tplPick(t){
    const m=ui.modal;const from=m&&m.kind==='templates'?m.from:'plan';const k=t.getAttribute('data-k');
    const r=routineFromTemplate(k);if(!r)return;closeModal();
    // The same template added again, unchanged, is opened rather than duplicated.
    const same=state.routines.find(x=>routineSig(x)===routineSig(r));
    if(from==='welcome'){
      // First run: the untouched starter routine is replaced by the pick, not
      // kept beside it. A routine with sessions logged against it always stays.
      if(same)state.activeRoutineId=same.id;
      else{state.routines=dropStarter(state.routines,state.sessions,starterSigs());state.routines.push(r);state.activeRoutineId=r.id;}
      const fit=fitTargets(state.routines.find(x=>x.id===state.activeRoutineId));const pa=profApplyList(activeRoutine());for(const x of pa)Object.assign(x.it,x.ch); // Your training, set in this sheet, applied as its Apply does (r55, the audit: Strength set here left the pick's plans as they were, and Settings then offered to apply it)
      state.settings.onboarded=true;ui.todayDay=null;ui.tab='today';commit();window.scrollTo(0,0);render();
      toast(`${r.name} is ready${pa.length?', set to Your training':''}${fit?'. Weekly set targets now match it; change them in Settings.':''}`,null,fit||pa.length?6000:0);return;
    }
    if(same){ui.bRoutine=same.id;render();toast('You already have this routine unchanged. Opened it instead.');return;}
    state.routines.push(r);ui.bRoutine=r.id;commit();render();toast(`${r.name} added. Tap Make active to use it.`);
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
      const ex=s.ex.map(b=>{const nb=newBlock(b.exId,plan(b),{deload});const n=b.sets.filter(isWork).length;if(deload&&n&&!(day&&day.items.some(i=>i.exId===b.exId)))nb.full=Math.min(n,30);return nb;});
      state.draft=day?{id:uid(),startedAt:Date.now(),date:today(),dayIdx:R.days.indexOf(day),dayId:day.id,dayName:day.name+(deload?' (deload)':''),routineId:R.id,deload,light:false,cardio:[],notes:deload?DELOAD_NOTE:'',editingId:null,ex}
        :{...freeDraft(s.free?s.dayName:`Again: ${s.dayName}`.slice(0,40),ex),deload};
      if(state.draft)state.draft.note0=state.draft.notes||'';ui.tab='today';saveNow();window.scrollTo(0,0);render();wakeOn();
      toast(day?`${day.name} started with the same exercises`:'Started as a freestyle session');
    };
    if(state.draft)confirmBox('Replace the session in progress?','You have an unsaved session open. Starting this one discards it.','Discard and start',go,true);else go();
  },
  crashRetry(){ui.tab='today';ui.planView='routine';try{closeModal();}catch(e){log('render',e);}ui.modal=null;window.scrollTo(0,0);render();}, // the sheet closed first (r56.1): a question left open reads as Cancel, so the sync waiting on it does not wait forever
  fbOpen(t){
    const d=state.draft;const bi=t&&t.dataset&&t.dataset.b!=null?+t.dataset.b:null;const b=bi!=null&&d?d.ex[bi]:null;
    const from=ui.tab==='settings'?(ui.prevTab||'settings'):ui.tab;
    const cat=t&&t.dataset&&FB_TITLE[t.dataset.cat]?t.dataset.cat:'bug';
    /* From the crash screen (r47): the report opens written, with the error the
       screen shows, so one tap sends it; the context marks it a crash and
       carries the stack the log kept. Until r47 a crash reached the owner only
       if the lifter wrote it up by hand. */
    const crash=!!(t&&t.dataset&&t.dataset.crash);const last=crash?logBuf.filter(x=>x.a==='render').slice(-1)[0]:null;
    const tabName={today:state.draft?'Session':'Today',program:'Plan',dash:'Stats',history:'History',settings:'Settings'}[ui.tab]||ui.tab;
    const msg=crash?`The app broke on the ${tabName} screen.${last?` Error: ${last.m}`:''}`:'';
    openModal({kind:'feedback',cat,msg,shot:null,from:crash?'crash':ui.tab==='today'&&d?'session':from,ex:b?exName(b.exId):null,crash:crash||undefined});
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
    // A report opened from the crash screen is already written (r47), so the copy carries it.
    const txt=`${APP_NAME}: ${FB_TITLE[m.cat]||FB_TITLE.bug}\n\n${m.msg&&m.msg.trim()?m.msg.trim():'(Write it here)'}\n\n${JSON.stringify(fbContext(m),null,1)}`;
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
      const txt=`${APP_NAME}: ${FB_TITLE[fb.category]}\n\n${msg}\n\n${JSON.stringify(fb.context,null,1)}`;
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
  diagCopy(){const t=JSON.stringify({build:APP_VERSION,version:DISPLAY_VERSION,cloud:{on:cloud.on,status:cloud.status,err:cloud.err,last:cloud.last},log:logBuf},null,1);openModal({kind:'text',title:'Diagnostics',help:'Copy this and paste it into a bug report. It holds errors and sync status, not your workouts.',text:t,readonly:true});},
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
    if(e.inv){try{done=e.inv()===true;}catch(x){log('undo',x);done=false;}if(done)setState(normalize(state));}
    if(!done)try{
      const pre=normalize(JSON.parse(e.pre));const post=e.post?normalize(JSON.parse(e.post)):state;
      const P=chunksOf(pre),Q=chunksOf(post),C=chunksOf(state);const stat={conflicts:0};const parts={};
      for(const id of new Set([...Object.keys(P),...Object.keys(Q),...Object.keys(C)])){
        const q=Q[id]||emptyChunk(id);
        parts[id]=id==='draft'?{draft:mergeDraft(Q.draft&&Q.draft.draft,normalize(JSON.parse(JSON.stringify(state))).draft,P.draft&&P.draft.draft)} /* the session in progress compared in one form, all three normalized, as a reload leaves it: the live one compared raw read every exercise as changed since and nothing went back (r55.1, the audit of r55: Undo after Make it lighter) */
          :mergeChunk(id,q?baseOf(id,q):null,C[id]||emptyChunk(id),P[id]||emptyChunk(id),false,stat);
      }
      setState(assemble(parts));
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
  applyUpd(){
    const u=ui.modal&&ui.modal.upd;closeModal();if(!u)return;
    const R=state.routines.find(r=>r.id===u.rid);const day=R&&R.days.find(x=>x.id===u.dayId);if(!day){toast('That routine day no longer exists');return;}
    snapshot();
    for(const x of u.swap){const it=day.items.find(i=>i.exId===x.from);if(it){it.exId=x.to;if(x.plan){Object.assign(it,x.plan);if(x.plan.jump==null)delete it.jump;}}} // at the plan it was done at (r55)
    for(const x of u.add)if(!day.items.some(i=>i.exId===x.exId))day.items.push({...x.plan,uid:uid(),exId:x.exId,ss:null});
    // Each superset kept: its exercises side by side, in the order done, under one link.
    for(const ids of u.ss||[]){const its=ids.map(id=>day.items.find(i=>i.exId===id)).filter(Boolean);if(its.length<2)continue;
      const at=Math.min(...its.map(i=>day.items.indexOf(i)));day.items=day.items.filter(i=>!its.includes(i));day.items.splice(at,0,...its);
      const g=uid();for(const i of its)i.ss=g;}
    fixSupersets(day.items);
    if(day.items.length)Object.assign(day,trainOn(day));
    commit();render();toast(`${day.name} updated`,true);
  },
  goalOpen(t){openModal({kind:'goal',exId:t.dataset.ex});},
  goalSave(){const m=ui.modal;const e=state.exercises.find(x=>x.id===m.exId);if(!e){closeModal();return;}
    const w=numIn(($('#goalW')||{}).value),r=Math.round(numIn(($('#goalR')||{}).value));
    if(!(r>=1&&r<=LIMITS.goalReps)){toast(`Reps from 1 to ${LIMITS.goalReps}`);return;}
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
    e.inc=Math.min(fromD(n),LIMITS.step);closeModal();commit();refreshEx(e.id);saveNow();rerenderKeepScroll();toast(`Load step for ${e.name}: ${fmtW(e.inc)} ${U()}`);
  },
  cardioNew(){openModal({kind:'cardio'});},
  cardioSave(){
    const min=numIn($('#cMin').value);if(min==null||min<=0){toast('Enter the minutes');return;}
    const date=$('#cDate').value||today();
    state.cardio.push(cleanCardio({id:uid(),date:isDate(date)?date:today(),kind:$('#cKind').value,min,hr:numIn($('#cHr').value),when:'solo',note:($('#cNote').value||'').trim(),dist:distIn($('#cDist').value)}));
    closeModal();commit();rerenderKeepScroll();toast('Cardio logged');
  },
  restWkOpen(){openModal({kind:'restwk'});},
  restWk(t){const ws=t.dataset.w;if(!isDate(ws))return;snapshot();const r=(state.settings.restWeeks||[]).slice();const on=r.includes(ws);
    state.settings.restWeeks=on?r.filter(x=>x!==ws):[...r,ws].sort();if(!state.settings.restWeeks.length)delete state.settings.restWeeks;
    invalidate();commit();renderModal();rerenderKeepScroll();toast(on?'Rest week cleared':'Rest week marked',true);},
  injAdd(){openModal({kind:'injury'});},
  injSave(){const m=$('#injM').value;const note=($('#injNote').value||'').trim();
    if(!MK.includes(m)&&!JK.includes(m))return;state.injuries=(state.injuries||[]).filter(x=>x.m!==m);state.injuries.push({id:uid(),m,note,date:today()});
    closeModal();commit();render();toast(`${injLabel(m)} flagged`);},
  bMenu(t){openModal({kind:'bmenu',b:+t.dataset.b});},
  // A choice in the exercise menu: the sheet closes, then the session screen's action it names runs (workout.ts).
  bMenuDo(t){const op=t.dataset.op;closeModal();const f=ACT[op];if(f)f(t);},
  // Once the rest is over, +15 counts from now (not from the old end, which
  // left it at 0:00) and the alert is armed again.
  tAdd(){const was=Math.max(0,(timer.end-Date.now())/1000);timer.total=was>0?Math.max(timer.total||0,was)+15:15;timer.end=Math.max(timer.end,Date.now())+15000;timer.fired=false;timerSave();if(!timer.iv)timer.iv=setInterval(tick,250);tick();},
  tStop(){stopTimer();},
  mClose(){closeModal();},
  mOk(){const m=ui.modal;const fn=m&&m.fn;if(m)m.answered=true;closeModal();fn&&fn();},
  mAlt(){const m=ui.modal;const a=m&&m.alt;if(m)m.answered=true;closeModal();a&&a.fn&&a.fn();},
  startSession(t){
    if(ui.modal)closeModal();toastQuiet();
    const R=activeRoutine();const di=+t.dataset.day;const d=R.days[di];if(!d)return;
    const light=t.dataset.light==='1';const deload=!light&&isDeloadWeek();
    // Lighter: half the sets at about 90% loads (one easy day, r30). Deload: half the sets
    // at about 90% loads for a whole week, and flagged so it never counts
    // against a lift's trend or stall read.
    const items=d.rest?[]:d.items.map(it=>(light||deload)?{...it,sets:Math.max(1,Math.ceil(it.sets/2))}:it);
    state.draft={id:uid(),startedAt:Date.now(),date:today(),dayIdx:di,dayId:d.id,dayName:d.name+(light?' (lighter)':deload?' (deload)':''),routineId:R.id,deload,light,cardio:[],notes:light?LIGHTER_NOTE:deload?DELOAD_NOTE:'',editingId:null,ex:items.map(it=>newBlock(it.exId,it,{deload,light}))};
    state.draft.note0=state.draft.notes||'';saveNow();window.scrollTo(0,0);render();wakeOn();
  },
  goBackup(){if(ui.modal)closeModal();ui.tab='settings';ui.folds['settings:data']=true;window.scrollTo(0,0);render();const el=document.getElementById('dataSec');if(el)el.scrollIntoView({block:'start'});},
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
    const finish=list=>{const n=fillSets(m.b,list);if(!(ui.modal&&ui.modal.kind==='confirm')){closeModal();rerenderKeepScroll();toast(`${n} set${n===1?'':'s'} filled and marked done`);}};
    if(got){finish(got);return;}
m.err=`Could not read that. Try the pattern 225x5, 5, 4 ${rirScale()==='rpe'?'rpe 9':'rir 1'}.`;renderModal();  },
  startAltOpen(t){openModal({kind:'startAlt',di:+t.dataset.day,free:t.dataset.free==='1'});},
  // A choice in Change: the sheet closes first, then the start it names runs as the card's button did.
  altGo(t){const go=t.dataset.go;closeModal();if(ACT[go])ACT[go](t);},
  // Another day of the plan on the card (the old Change day list); in a blank-session Today it shows that day's card.
  dayPick(t){const i=+t.dataset.i;closeModal();ui.todayDay=i;ui.todayAt=null;window.scrollTo(0,0);render();},
  bNote(t){const bi=+t.dataset.b;openModal({kind:'note',bi,title:`Note: ${exName(state.draft.ex[bi].exId)}`,text:state.draft.ex[bi].note||''});},
  noteSave(){
    const m=ui.modal;const ta=$('#mNote');if(!m||!ta||!state.draft)return;
    const b=state.draft.ex[m.bi];if(b)b.note=ta.value.trim();
    closeModal();saveNow();rerenderKeepScroll();
  },
  bSwap(t){openModal({kind:'picker',mode:'swapBlock',b:+t.dataset.b,title:'Swap exercise',q:'',m:EX(state.draft.ex[+t.dataset.b].exId).primary});},
  pickSession(){openModal({kind:'picker',mode:'addBlock',title:'Add exercise to session',q:'',m:''});},
  pickDay(t){openModal({kind:'picker',mode:'addDay',day:+t.dataset.day,title:`Add to ${dayLabel(curRoutineB(),+t.dataset.day)}`,q:'',m:''});},
  iSwap(t){const f=findItem(t.dataset.uid);openModal({kind:'picker',mode:'swapItem',uid:t.dataset.uid,title:'Swap exercise',q:'',m:f?EX(f.it.exId).primary:''});},
  pickDo(t){applyPick(ui.modal,t.dataset.ex);},
  /* Pick for me, before a session: rank the routine's days for today. */
  pickToday(){openModal({kind:'pickToday'});},
  pickView(t){closeModal();ui.todayDay=+t.dataset.day;ui.todayAt=null;ui.tab='today';window.scrollTo(0,0);render();},
  /* Pick for me, inside a session: what to add next. */
  pickEx(){if(!state.draft)return;openModal({kind:'pickEx'});},
  pickExAdd(t){
    const d=state.draft;if(!d)return;const id=t.dataset.ex;if(!state.exercises.some(e=>e.id===id)){closeModal();return;}
    const p=planFor(id,null,d.dayId,false,d.date);const n=Math.round(+t.dataset.sets),full=Math.round(+t.dataset.full);if(n>=1&&n<=30)p.sets=n;
    const nb=newBlock(id,p,{deload:!!d.deload,light:!!d.light,before:d.date});if((d.deload||d.light)&&full>=1&&full<=30)nb.full=full;d.ex.push(nb);saveNow();closeModal();afterAdd(d.ex.length-1);
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
    state.draft={id:uid(),startedAt:Date.now(),date:today(),dayIdx:m.day,dayId:day.id,dayName:day.name+(deload?' (deload)':''),routineId:R.id,deload,light:false,limited:true,cardio:[],notes:[deload?DELOAD_NOTE:'',note].filter(Boolean).join(' '),editingId:null,ex};
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
    if(!state.draft){const R=activeRoutine();const di=t.dataset.day!=null?+t.dataset.day:null;ui.todayDay=d===today()||di==null||!R.days[di]?null:di;ui.todayAt=ui.todayDay==null?null:{d,di};} // the date it was opened for, said on the card when past this week (329, r59)
    if(ui.modal)closeModal();window.scrollTo(0,0);render();
  },
  rNew(){openModal({kind:'routineNew'});},
  rNewSave(){const nm=(($('#rNewName')||{}).value||'').trim();if(!nm){toast('Give the routine a name');return;}if(nameTaken(nm)){toast('A routine already has that name. Pick another.');return;}closeModal();ACT.rNewDo(nm);},
  rNewDo(nm){
    // An existing empty routine is reused rather than stacking another blank one.
    const blank=state.routines.find(r=>routineEmpty(r)&&r.id!==state.activeRoutineId);
    if(blank){blank.name=nm||blank.name;ui.bRoutine=blank.id;commit();render();toast('Reused your empty routine');return;}const r={id:uid(),name:nm||'New routine',schedule:'cycle',days:[0,1,0,1,0,1,1].map(x=>({id:uid(),name:x?'Rest':'Training day',rest:!!x,items:[]}))};state.routines.push(r);ui.bRoutine=r.id;commit();render();}, // Laid out as Build my own's (r55, the audit: three training days and no rest planned 7 sessions a week).
  rTemplate(){openModal({kind:'templates',from:'plan'});},
  exNew(){openModal({kind:'exEdit',isNew:true,e:{id:'c_'+uid(),name:'',primary:'chest',secondary:[],equip:'cable',bw:false,rare:false,note:'',custom:true,archived:false}});},
  exNewFromPicker(){const back=ui.modal;if(!back||back.kind!=='picker')return;openModal({kind:'exEdit',isNew:true,back,e:{id:'c_'+uid(),name:(back.q||'').trim(),primary:back.m||'',secondary:[],equip:'cable',bw:false,rare:false,note:'',custom:true,archived:false,incRaw:''}});},
  exBack(){const m=ui.modal;if(m&&m.back)openModal(m.back);else closeModal();}, // back to the sheet this one was opened from, else closed: the exercise editor's, and an account sheet's opened from a problem report (r55)
  exEdit(t){ui.exBody=false;const e=JSON.parse(JSON.stringify(EX(t.dataset.ex)));e.incRaw=e.inc!=null?fmtW(stepRead(e.inc)):'';e.bwfRaw=String(Math.round(bwShare(e)*100));e.maxRaw=e.maxLoad!=null?fmtW(e.maxLoad):'';e.barRaw=e.barKg!=null?fmtW(e.barKg):'';
    openModal({kind:'exEdit',isNew:false,e});},
  secToggle(t){const e=ui.modal.e;const k=t.dataset.m;e.secondary=e.secondary.includes(k)?e.secondary.filter(x=>x!==k):[...e.secondary,k];renderModal();},
  exSave(){
    const m=ui.modal;const e=m.e;e.name=(e.name||'').trim();if(!e.name){toast('Give the exercise a name');return;}
    // A quick create from search used to default to Chest, so a curl made in a
    // hurry was counted as chest work from then on.
    if(!MK.includes(e.primary)){toast('Pick the main muscle it trains');const el=document.querySelector('[data-ebind="primary"]');if(el)try{el.focus();}catch(x){/* focus is best effort */}return;}
    e.secondary=e.secondary.filter(k=>k!==e.primary);
    {const n=numIn(e.incRaw);e.inc=n!=null&&n>0?Math.min(fromD(n),LIMITS.step):null;delete e.incRaw;}
    {const n=numIn(e.maxRaw);if(n!=null&&n>0)e.maxLoad=fromD(Math.min(n,U()==='lb'?4000:2000));else delete e.maxLoad;delete e.maxRaw;}
    {const n=numIn(e.barRaw);if(n!=null&&n>0&&platesMode(e)==='bar')e.barKg=Math.min(fromD(n),LIMITS.barKg);else delete e.barKg;delete e.barRaw;}
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
  /* Every tile, summary row and map detail lands on the matching dashboard
     section, opened even if you had folded it, with the relevant muscle or
     exercise already selected. */
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
  histEdit(t){
    const s=state.sessions.find(x=>x.id===t.dataset.id);if(!s)return;
    const go=()=>{const R=state.routines.find(r=>r.id===s.routineId)||activeRoutine();
      const dayItems=s.free?[]:((R.days[sessDayIdx(R,s)]||{items:[]}).items);
      state.draft={id:uid(),editingId:s.id,deload:!!s.deload,light:!!s.light,free:s.free?true:undefined,chk:s.chk?{...s.chk}:undefined,startedAt:null,durMin:s.durMin||null,date:s.date,dayIdx:s.dayIdx,dayId:s.dayId||null,dayName:s.dayName,routineId:s.routineId,notes:s.notes||'',ex:s.ex.map(b=>{const it=dayItems.find(i=>i.exId===b.exId);const plan=it?{...it}:planFor(b.exId,null,null,false,s.date);return {bid:uid(),exId:b.exId,plan,note:b.note||'',keepRR:b.rr||null,light:b.light?true:undefined,hint:'Editing saved sets.',lastR:[],sets:b.sets.map(x=>newRow({w:x.w,r:x.r,rir:x.rir,warm:!!x.warm,drop:!!x.drop,done:true,cal:x.cal?{...x.cal}:undefined,rid:x.rid})),...(b.nw?{nw:true}:{})};})};
      editFp0.set(state.draft.id,editFp(state.draft));
      saveNow();ui.tab='today';window.scrollTo(0,0);render();};
    if(state.draft)confirmBox('Replace the session in progress?','You have an unsaved session open. Editing this one will discard it.','Discard and edit',go,true);else go();
  },
  export(){exportBackup();},
  exportCsv(){exportCSV();},
  showBackup(){openModal({kind:'text',title:'Backup text',help:'Select all and copy. Paste it into Import on any device to restore.',text:JSON.stringify({app:STORAGE_ID,exported:new Date().toISOString(),state}),readonly:true});},
  copyText(){const ta=$('#mText');ta.select();let ok=false;try{if(navigator.clipboard){navigator.clipboard.writeText(ta.value).then(()=>{markExported();toast('Copied');},()=>toast('Select the text and copy it manually'));return;}ok=document.execCommand('copy');}catch(e){log('copy',e);}if(ok)markExported();toast(ok?'Copied':'Select the text and copy it manually');},
  pasteImport(){openModal({kind:'text',title:'Import backup text',help:'Paste the full backup text here.',text:'',readonly:false});},
  importText(){importData($('#mText').value);},
  demoLoad(){if(acct.user){toast('Demo data is for looking around before you sign in, so it stays off your account.',null,6000);return;} /* signed in, it would sync into the account (r55.1, the second review of r55); signing out to load it would make the next sign-in a first link, which brings back what other phones deleted meanwhile, so it is not offered */confirmBox('Load demo data?','Adds 8 weeks of generated sessions tagged as demo, based on your active routine. Your own logs are not changed.','Load demo data',()=>{const first=demoFirstRun();demoKeep();
    // On a first run the targets fit the routine, as picking it would (r29);
    // demoRestore puts the settings back when the demo is cleared.
    if(first)fitTargets(activeRoutine());if(!cloud.on)cloudStop(true);makeDemo();ui.tab='dash';window.scrollTo(0,0);render();toast('Demo data loaded');});},
};
