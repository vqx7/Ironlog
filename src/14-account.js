/* ---------- account (standalone app) ---------- */
const ACCT_LATER=KEY+'.acctLater';
function cloudStop(forget){ // forget: the log or the account is gone; else the sync notes stay with the copy kept, so signing back in to that account merges against them, as a sync does (r55, the audit: a first link let the kept copy undo edits and bring back deletions made since on other phones)
  clearTimeout(cloud.t);cloud.on=false;cloud.db=null;cloud.uid=null;if(forget){cloud.acct=null;cloud.meta={};cloud.editAt={};cloud.last=null;}
  cloud.retry=0;saveMeta();setCloud('local');
}
function acctRerender(){if((ui.tab==='settings'||ui.tab==='today')&&!ui.modal)rerenderKeepScroll();else{const el=document.getElementById('syncInfo');if(el)el.innerHTML=syncInfo();}}
/* ---------- problem reports (PENDING 58, reworked in r25) ----------
   The menu (top right) and an exercise's ⋯ menu open one sheet. Report a problem
   comes first; a question or a suggestion is the same sheet with another kind
   chosen at its top (stored as bug, question, idea). One text box, an optional
   screenshot, and what a report needs to be acted on without asking the
   person anything technical: build, device, screen size, which screen they
   came from, whether a session was open, sync status and the last 10 logged
   errors. Never the workouts. Replies go to the account's email.
   Signed in only (V's choice, r25), to keep spam out, with limits the
   database enforces too: 10 to 1,000 characters, one image, 5 reports a
   day per account. Signed out, the sheet asks to sign in, and can still copy
   the details for a message. Without a report service at all (the plain
   source file) it copies the report as text. */
const FB_SENT=KEY+'.fbSent';
// Reports sent from this device in the last 24 hours (the database keeps the real count).
function fbRecent(){try{const a=JSON.parse(localStorage.getItem(FB_SENT)||'[]');const cut=Date.now()-864e5;return Array.isArray(a)?a.filter(t=>+t>cut):[];}catch(e){return [];}}
async function fbCheckReader(){
  const F=FB();const was=!!acct.reader;
  try{acct.reader=!!(F&&acct.user&&typeof F.isReader==='function'&&await F.isReader());}catch(e){acct.reader=false;}
  if(was!==acct.reader&&ui.tab==='settings'&&!ui.modal)rerenderKeepScroll();
}
function fbContext(m){
  // A report about a crash must survive the crash (r47): each field that reads the log is guarded, so a save that cannot be read still sends what the rest knows.
  const safe=(f,alt)=>{try{return f();}catch(e){return alt;}};
  const d=safe(()=>state.draft,null);
  const ctx={build:APP_VERSION,version:DISPLAY_VERSION,env:ENV,at:new Date().toISOString(),device:String(navigator.userAgent||'').slice(0,300),
    screen:`${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio||1}x`,installed:isStandalone(),
    theme:state.settings.theme,accent:state.settings.accent||ACCENT0,unit:U(),from:m.from||ui.tab,exercise:m.ex||undefined,
    session:d?{past:!!d.past,free:!!d.free,editing:!!d.editingId,exercises:d.ex.length}:null,
    signedIn:!!acct.user,sync:cloud.on?cloud.status:'off',crash:m.crash||undefined,
    counts:safe(()=>({sessions:state.sessions.filter(x=>!x.demo).length,routines:state.routines.length}),null),
    errors:logBuf.slice(-10)};
  /* The feedback table refuses a context over 20,000 bytes (SUPABASE.md, Part 4),
     and that would refuse the whole report. Ten errors with their stacks fit in
     plain text, but not if a message is in a script of 3 or 4 bytes a
     character, so the oldest errors go first until it fits with room to spare. */
  const bytes=()=>safe(()=>new TextEncoder().encode(JSON.stringify(ctx)).length,0);
  while(ctx.errors.length>1&&bytes()>FB_CTX_MAX)ctx.errors.shift();
  if(bytes()>FB_CTX_MAX)ctx.errors=ctx.errors.map(({s,...x})=>({...x,m:String(x.m).slice(0,100)}));
  return ctx;
}
/* The menu (r27): one tap from every tab for the things people look for
   outside a workout: who is signed in, signing in or out, the save state,
   Report a problem and the Guide. Since r28 Settings has a Help group near
   the bottom with the same Guide and reports (V asked for both places). */
function menuSheet(){
  const A=AUTH()&&!(window.claude&&typeof window.claude.use==='function')?AUTH():null;const u=A&&acct.user;const st=saveStateNow();
  const dot=st.cls?`<span class="mdot ${st.cls}" aria-hidden="true"></span>`:'';
  let acc;
  if(u)acc=`<div class="row spread" style="flex-wrap:nowrap;gap:10px"><div style="min-width:0"><p class="small muted" style="margin:0">Signed in as</p><p style="margin:2px 0 0;overflow-wrap:anywhere"><b>${esc(u.email)}</b></p></div><button class="btn sm" data-act="acctSignOut">Sign out</button></div>
    <p class="small" style="margin:8px 0 0">${dot}${cloud.on?esc(st.txt):'Not syncing right now.'}${cloud.on?'':' <button class="linkbtn" data-act="acctRetry">Try again</button>'}</p>`;
  else if(A)acc=`<p style="margin:0"><b>Not signed in.</b> Your log is on this phone only.</p><div class="row" style="margin-top:10px"><button class="btn primary" data-act="acctOpen" data-mode="signin">Sign in</button><button class="btn" data-act="acctOpen" data-mode="signup">Create account</button></div>`;
  else acc=`<p class="small" style="margin:0">${dot}${esc(st.txt)}</p>`;
  const due=backupDue()?`<div class="callout yellow row spread" style="margin:10px 0 0"><span class="small"><b>Backup due.</b></span><button class="btn sm" data-act="export">Export backup</button></div>`:'';
  const item=(act,label,extra)=>`<button type="button" class="mnu" data-act="${act}"${extra||''}><span>${label}</span><span aria-hidden="true">›</span></button>`;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="menuH"><div class="sheet-h"><h3 id="menuH">${ENV==='preview'?PREVIEW_NAME:APP_NAME}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
  <div class="panel" id="menuAcct">${acc}</div>${due}
  <div class="mnus">${item('fbOpen','Report a problem',' data-cat="bug"')}${acct.reader&&FB()?item('fbInbox','Reports inbox'):''}${item('guideOpen','Guide')}${item('goLayout','Show, hide, or reorder sections')}${item('goBackup','Your data and backups')}</div>
  <p class="small muted" style="margin:12px 0 0">Version ${esc(DISPLAY_VERSION)}</p></div>`;
}
function fbSheet(m){
  const head=t=>`<div class="sheet-h"><h3 id="fbH">${t}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>`;
  if(m.sent)return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fbH">${head(m.copied?'Copied':'Sent')}<p style="margin:0">${m.copied?'Paste it in a message to the app owner.':acct.user?`Thanks. Any reply goes to ${esc(acct.user.email)}.`:'Thanks.'}</p><button type="button" class="btn primary block" style="margin-top:14px" data-act="mClose">Done</button></div>`;
  const F=FB();const cat=FB_TITLE[m.cat]?m.cat:'bug';
  const kinds=`<div class="fbkind" role="group" aria-label="Kind">${FB_CATS.map(([k,l])=>`<button type="button" class="${cat===k?'on':''}" data-act="fbCat" data-v="${k}" aria-pressed="${cat===k}">${l}</button>`).join('')}</div>`;
  // Signed out where reports exist: sign in first (the copy stays for a message).
  if(F&&!acct.user)return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fbH">${head(FB_TITLE[cat])}
    <p style="margin:0 0 12px">Sign in to send a report, so a reply can reach you.</p>
    <div class="stack"><button type="button" class="btn primary block" data-act="acctOpen" data-mode="signin">Sign in</button><button type="button" class="btn block" data-act="acctOpen" data-mode="signup">Create account</button></div>
    <p class="small muted" style="margin:12px 0 0">No account? <button type="button" class="linkbtn" data-act="fbCopy">Copy the details</button> and send them to the app owner.</p></div>`;
  const n=String(m.msg||'').length;
  /* \x3cimg, not the tag itself (r29): the browser's look-ahead scanner can
     read this script as page markup and fetch "${m.shot}" as an image, a
     stray 404 seen in tests. The string is the same once it runs. */
  // Only the app's own JPEG data URL is ever written in (r44 security review): m.shot comes from fbShrink's canvas, and the check keeps it so if that changes.
  const shot=m.shot&&FB_SHOT_RE.test(m.shot)?`<div class="fbshot">\x3cimg src="${m.shot}" alt="Screenshot to send"><button type="button" class="btn sm" data-act="fbShotDel">Remove</button></div>`
    :`<label class="btn sm fbpick">Add a screenshot<input type="file" accept="image/png,image/jpeg,image/heic,image/heif,image/webp" id="fbShot" hidden></label>`;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fbH">${head(FB_TITLE[cat])}<div class="stack">
  ${kinds}
  <label class="field">${FB_ASK[cat]}<textarea data-fbind="msg" maxlength="${FB_MAX}" rows="5" placeholder="${esc(FB_HINT[cat])}">${esc(m.msg||'')}</textarea><span class="fbcount small muted" id="fbCount" aria-live="polite">${n} / ${FB_MAX}</span></label>
  <div><p class="small muted" style="margin:0 0 6px">Screenshot, optional. One image, up to ${FB_IMG_MB} MB.</p><div class="row">${shot}</div></div>
  <p class="small muted" style="margin:0">${acct.user?`Replies go to ${esc(acct.user.email)}. `:''}Device details are added, never your workouts. ${tipi(FB_WHAT,'What is attached')}</p>
  ${m.err?`<p class="small" role="alert" style="color:var(--red);margin:0">${esc(m.err)}</p>`:''}
  <button type="button" class="btn primary block" data-act="fbSend" ${m.busy?'disabled':''}>${m.busy?'Sending':F?'Send':'Copy report'}</button></div></div>`;
}
/* The owner's inbox: the reports, newest first, read-only. */
function fbInboxSheet(m){
  const it=m.items;
  const body=m.err?`<p class="small" role="alert" style="color:var(--red)">${esc(m.err)}</p>`:!it?'<p class="muted">Loading</p>':!it.length?'<p class="muted">No feedback yet.</p>':`<ul class="clist fbinbox">${it.map(x=>`<li><div style="min-width:0;flex:1"><p class="small" style="margin:0"><span class="tag ${x.category==='bug'?'red':x.category==='idea'?'green':'blue'}">${esc(x.category)}</span> <span class="muted">${esc(String(x.created_at||'').slice(0,16).replace('T',' '))}${x.reply_to?` · ${esc(x.reply_to)}`:''}</span></p><p style="margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere">${esc(x.message)}</p>${x.screenshot&&FB_SHOT_RE.test(x.screenshot)?`\x3cimg class="fbthumb" src="${esc(x.screenshot)}" alt="Screenshot">`:''}${x.issue_url&&/^https:\/\/github\.com\//.test(x.issue_url)?`<p class="small" style="margin:4px 0 0"><a href="${esc(x.issue_url)}" target="_blank" rel="noopener">GitHub issue</a></p>`:''}<details class="small muted"><summary>Attached by the app</summary><pre class="fbctx">${esc(JSON.stringify(x.context||{},null,1))}</pre></details></div></li>`).join('')}</ul>`;
  return `<div class="sheet fixed" role="dialog" aria-modal="true" aria-labelledby="fbiH"><div class="sheet-h"><h3 id="fbiH">Feedback inbox</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div><div class="sheet-scroll">${body}</div></div>`;
}
/* A picked photo, shrunk to 1280 px on its long side as JPEG, so a report
   stays small enough to store (the table caps it). */
function fbShrink(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file);const img=new Image();
    /* At most 500,000 characters (about 370 KB): each screenshot is kept in
       the tickets repository's history for good, so it is kept small (r45,
       audit item 287; 1.4 MB before). Smaller sides before blurrier text. */
    img.onload=()=>{try{const L=500000;let d=null;
      for(const side of [1280,960,720]){const k=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*k));c.height=Math.max(1,Math.round(img.naturalHeight*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        for(let q=0.72;q>0.3;q-=0.14){d=c.toDataURL('image/jpeg',q);if(d.length<=L)break;}
        if(d.length<=L)break;}
      URL.revokeObjectURL(url);res(d&&d.length<=L?d:null);}catch(e){URL.revokeObjectURL(url);rej(e);}};
    img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('Not an image'));};img.src=url;
  });
}
/* ---------- waiting for the confirmation email (item 61) ----------
   On an iPhone the link in the email opens the browser, never the
   home-screen app, so the app cannot be told the account was confirmed.
   Instead, while its "Check your email" sheet is open, it tries to sign in
   with the email and password just typed: when the app comes back to the
   front, when "I have confirmed" is tapped, and every 20 seconds while it is
   on screen (every minute after 5 minutes; Supabase allows about 30 sign-in
   attempts per 5 minutes). The password is held in memory only, and is
   forgotten once signed in, when the sheet closes, or after 30 minutes.
   A marker without the password is kept in storage while waiting: a browser
   that shares this storage (the same browser, or Android's installed app)
   can then tell that the link was opened where Ironlog lives. */
const ACCT_WAIT=KEY+'.acctWait';
function waitStart(email,pw){
  acctWait.email=email;acctWait.pw=pw;acctWait.t=Date.now();
  try{localStorage.setItem(ACCT_WAIT,JSON.stringify({t:Date.now()}));}catch(e){/* storage blocked: the app still waits */}
  waitSchedule();
}
function waitStop(){
  clearTimeout(acctWait.timer);acctWait.timer=null;acctWait.pw='';acctWait.email='';acctWait.t=0;
  try{localStorage.removeItem(ACCT_WAIT);}catch(e){/* nothing to clear */}
}
function waitSchedule(){
  clearTimeout(acctWait.timer);acctWait.timer=null;if(!acctWait.pw)return;
  const age=Date.now()-acctWait.t;
  if(age>30*60000){waitStop();const m=ui.modal;if(m&&m.kind==='account'&&m.mode==='wait'){m.mode='signin';m.needCode=true;m.err='Still not confirmed. Type the code from the email, or open its link and sign in here.';renderModal();}return;}
  acctWait.timer=setTimeout(()=>waitTry(false),age<5*60000?20000:60000);
}
async function waitTry(manual){
  const A=AUTH();if(!A||!acctWait.pw||acctWait.busy)return;
  if(!manual&&(document.visibilityState!=='visible'||Date.now()-acctWait.last<3000)){waitSchedule();return;}
  acctWait.busy=true;acctWait.last=Date.now();const m0=ui.modal;
  const sheet=()=>{const m=ui.modal;return m&&m.kind==='account'&&m.mode==='wait'?m:null;};
  if(manual&&sheet()){m0.busy=true;m0.err='';renderModal();}
  try{
    acct.user=await A.signIn(acctWait.email,acctWait.pw);waitStop();obOutClear();
    try{localStorage.removeItem(ACCT_LATER);}catch(e){/* nothing to clear */}
    if(sheet())ACT.exBack();
    toast('Email confirmed. Signed in and syncing.');await cloudInit();acctRerender();
  }catch(e){
    const m=sheet();
    const unconfirmed=e&&(e.code==='email_not_confirmed'||/Confirm your email/i.test(e.message||''));
    if(!unconfirmed&&/Wrong email or password/.test((e&&e.message)||'')){waitStop();if(m){m.mode='signin';m.err='That password did not work. Sign in with the one you chose.';}}
    else if(m&&manual)m.err=unconfirmed?'Not confirmed yet. Type the code from the email, or open its link.':((e&&e.message)||'Try again.');
    if(!unconfirmed)log('auth',e);
  }finally{acctWait.busy=false;const m=sheet();if(m){m.busy=false;renderModal();}waitSchedule();}
}
window.addEventListener('focus',()=>{if(acctWait.pw)waitTry(false);});
window.addEventListener('pageshow',()=>{if(acctWait.pw)waitTry(false);});
async function acctInit(){
  const A=AUTH();if(!A)return;
  A.onChange((ev,user)=>{
    acct.user=user;
    if(ev==='PASSWORD_RECOVERY'&&!(ui.modal&&ui.modal.kind==='account'))openModal({kind:'account',mode:'newpw',pw:''});
    // Signed in some other way while waiting for the confirmation (another tab sharing this storage): stop waiting.
    if(ev==='SIGNED_IN'&&user&&acctWait.pw&&!acctWait.coding){waitStop();const m=ui.modal;if(m&&m.kind==='account'&&m.mode==='wait'){ACT.exBack();toast('Email confirmed. Signed in and syncing.');}}
    if(ev==='SIGNED_IN'&&!cloud.on)cloudInit();
    if(ev==='SIGNED_OUT'&&cloud.on&&!window.claude)cloudStop();
    if(ev==='SIGNED_IN'||ev==='SIGNED_OUT')fbCheckReader();
    acctRerender();
  });
  acct.user=await A.user();acct.checked=true;fbCheckReader();
  const L=A.landing;
  if(L&&L.error){openModal({kind:'account',mode:'sent',title:'Link did not work',msg:/expired|invalid/i.test(L.error)?'That link has expired or was already used. Ask for a new one.':L.error});}
  else if(L&&L.type==='recovery'){if(!(ui.modal&&ui.modal.kind==='account'))openModal({kind:'account',mode:'newpw',pw:''});}
  else if(L&&L.type&&!isStandalone()){
    /* A confirmation link opened in the browser, not the installed app. It
       signed this browser in, but nothing syncs here until we know this is
       where Ironlog is used (cloud-supabase.js holds it). If this storage
       is the one waiting for the confirmation (the same browser, or an
       Android app sharing it), this is the place: stay signed in. Otherwise
       ask (item 61): here, or the home-screen app, which on an iPhone keeps
       separate storage and signs itself in when it comes back to the front. */
    let mine=null;try{mine=JSON.parse(localStorage.getItem(ACCT_WAIT)||'null');}catch(e){/* no marker */}
    if(mine&&Date.now()-(+mine.t||0)<60*60000){
      try{localStorage.removeItem(ACCT_WAIT);}catch(e){/* nothing to clear */}
      if(typeof A.release==='function')A.release();
      openModal({kind:'account',mode:'sent',title:'Email confirmed',msg:'You are signed in. Your log syncs to your account.'});
      cloudInit();
    }else openModal({kind:'account',mode:'where',title:'Email confirmed'});
  }
  acctRerender();
}
/* Retry when the phone comes back online or the app returns to the
   foreground: a sign-in that could not refresh offline starts syncing then. */
window.addEventListener('online',()=>{
  if(AUTH()&&!cloud.on)cloudInit();
  // Back from a dead zone: sync now instead of waiting out the retry timer.
  else if(cloud.on&&cloud.status==='offline'){cloud.retry=0;clearTimeout(cloud.t);cq(cloudPull);}
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  if(acctWait.pw){waitTry(false);return;}
  if(AUTH()&&!cloud.on)cloudInit();
});
function acctPanel(){
  if(!AUTH()||(window.claude&&typeof window.claude.use==='function'))return '';
  const u=acct.user;
  // Signed in but not syncing: the sign-in could not be used (offline at
  // launch, or refused). Say so and offer a retry rather than looking fine.
  const stuck=u&&!cloud.on?`<div class="row spread" style="margin-top:6px"><p class="small" style="margin:0;color:var(--yellow)">Not syncing right now.</p><button class="btn sm" data-act="acctRetry">Try again</button></div>`:'';
  return u
    ?`<div class="panel" id="acctPanel"><div class="row spread"><p class="small" style="margin:0;min-width:0;overflow-wrap:anywhere">Signed in as <b>${esc(u.email)}</b></p><button class="btn sm" data-act="acctSignOut">Sign out</button></div>${stuck}${typeof AUTH().deleteAccount==='function'?`<button type="button" class="linkbtn" style="margin-top:8px;color:var(--red)" data-act="acctDelete">Delete my account</button>`:''}</div>`
    /* Signed out, this one line says where the log is and what an account adds (r34.2): Your data
       used to say it four times (this panel, the storage line, the privacy line, Backup due). */
    :`<div class="panel" id="acctPanel"><p class="small hastip" style="margin:0 0 8px" data-tip="${esc(isStandalone()?'Deleting the app from the home screen deletes the log on this phone. An account keeps it, or save a backup file below.':'Clearing this browser\'s data deletes the log here. An account keeps it, or save a backup file below.')}"><b>Saved on this ${isStandalone()||coarse()?'phone':'device'} only.</b> Create an account to back it up and use it on any device.</p><div class="row"><button class="btn sm primary" data-act="acctOpen" data-mode="signup">Create account</button><button class="btn sm" data-act="acctOpen" data-mode="signin">Sign in</button></div></div>`;
}
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* The code from the confirmation email (r45), on the waiting sheet and, after
   "Confirm your email first", on sign-in: the code needs only the email, so
   it still works after the wait gives up or the app was closed. Digits only
   are sent; the length is the project's (6 by default), so none is forced. */
function codeField(m){return `<label class="field">Code from the email<input type="text" inputmode="numeric" autocomplete="one-time-code" data-abind="code" value="${esc(m.code||'')}" enterkeyhint="go"></label><button type="button" class="btn primary block" data-act="acctCode" ${m.busy?'disabled':''}>Confirm with the code</button><div class="row"><button type="button" class="linkbtn tall" data-act="acctResend" ${m.busy?'disabled':''}>Send a new code</button></div>`;}
function acctSheet(m){
  const f=(label,k,type,ac,extra)=>`<label class="field">${label}<input type="${type}" data-abind="${k}" value="${esc(m[k]||'')}" autocomplete="${ac}" ${extra||''}></label>`;
  const email=f('Email','email','email','email','autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="email" enterkeyhint="next"');
  const err=`<p class="small" role="alert" style="color:var(--red);margin:0"${m.err?'':' hidden'}>${esc(m.err||'')}</p>`;
  // What it is doing while busy, not "Working" (r34.2).
  const busyW={signin:'Signing in',signup:'Creating your account',forgot:'Sending the link',newpw:'Saving'}[m.mode]||'One moment';
  const go=(label)=>`<button type="submit" class="btn primary block" data-act="acctSubmit" ${m.busy?'disabled':''}>${m.busy?busyW:esc(label)}</button>`;
  const link=(mode,label)=>`<button type="button" class="linkbtn tall" data-act="acctMode" data-mode="${mode}">${label}</button>`;
  const T={signin:'Sign in',signup:'Create account',forgot:'Reset password',newpw:'New password',sent:m.title||'Check your email',wait:'Check your email',where:m.title||'Email confirmed'};
  let b='';
  if(m.mode==='signin')b=`${email}${f('Password','pw','password','current-password','enterkeyhint="go"')}${err}${m.needCode?codeField(m):''}${go('Sign in')}<div class="row spread">${link('forgot','Forgot password?')}${link('signup','Create an account')}</div>`;
  else if(m.mode==='signup')b=`${email}${f('Password (8 or more characters)','pw','password','new-password','minlength="8" enterkeyhint="go"')}${err}${go('Create account')}<p class="small muted" style="margin:0">We email you a link and a code to confirm the address. Your email is only for signing in and never shared.</p><div class="row">${link('signin','I have an account')}</div>`;
  else if(m.mode==='forgot')b=`${email}${err}${go('Email me a reset link')}<p class="small muted" style="margin:0">The link opens in your browser. Set the new password there, then sign in here.</p><div class="row">${link('signin','Back to sign in')}</div>`;
  else if(m.mode==='newpw')b=`${f('New password (8 or more characters)','pw','password','new-password','minlength="8" enterkeyhint="go"')}${err}${go('Save new password')}`;
  else if(m.mode==='wait')b=`<p style="margin:0">We sent a confirmation email to <b>${esc(m.email||'')}</b>. Type its code here, or tap its link and come back: ${APP_NAME} signs you in by itself.</p>${codeField(m)}<p class="small muted waitline" style="margin:0" aria-live="polite">${m.busy?'Checking':'Waiting for the confirmation'}</p>${err}<button type="button" class="btn block" data-act="acctWaitNow" ${m.busy?'disabled':''}>I have confirmed</button><div class="row">${link('signup','Use a different email')}</div>`;
  else if(m.mode==='where')b=`<p style="margin:0">Where do you use ${APP_NAME}?</p><button type="button" class="btn primary block" data-act="acctWhere" data-v="app">The home-screen app</button><button type="button" class="btn block" data-act="acctWhere" data-v="here">Here in this browser</button>`;
  else b=`<p style="margin:0">${esc(m.msg||'')}</p><button type="button" class="btn primary block" data-act="mClose">OK</button>`;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(T[m.mode]||'Account')}"><div class="sheet-h"><h3>${esc(T[m.mode]||'Account')}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div><form class="stack" id="acctForm" novalidate>${b}</form></div>`;
}
/* Says plainly where the data lives and what leaves the device. Inside Claude
   the log is stored with the Claude account; anywhere else there is no server
   at all. This must change when cloud sync for the standalone app arrives. */
/* What the suggestions are, said once where people look (r31.1, V: a
   subtle notice). The numbers come from published formulas and stated
   conventions applied to the lifter's own log; they can be wrong, and the
   app cannot see form, pain, or health. */
const SAFETY_TXT=`${APP_NAME} works out suggested loads and reps from your own log with published formulas and the conventions stated in the Guide. They are estimates, not medical, physical therapy, or coaching advice, and they can be wrong. Use good technique, and safety bars or a spotter on heavy lifts. Stop on pain. Check with a doctor before starting or changing training, especially with an injury, a health condition, or a pregnancy. You train at your own risk.`;
function safetyLine(){return `<p class="small muted" id="safety" style="margin:8px 0 0"><b>Suggestions:</b> estimates from your log, not medical or coaching advice. Train within your limits and stop on pain. ${tipi(SAFETY_TXT,'About suggestions')}</p>`;}
function privacyLine(){
  const inClaude=!!(window.claude&&typeof window.claude.use==='function');
  if(!inClaude&&AUTH()&&acct.user)return `<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no ads, no tracking. Your log syncs to your ${APP_NAME} account. Only you and the app's owner can see it. Reports you send go to the app owner. ${tipi('It is stored in a Supabase database. Database rules let each account read and write only its own data. The person who runs that database, the app owner, can see stored data and your email address, as with any app without end-to-end encryption. Your email is used only to sign in and reset your password, and nothing is shared or sold. A new password is checked against known breaches with only the first 5 characters of its hash; the password never leaves the phone. Backup files go only where you save them.','About privacy')}</p>`;
  if(!inClaude&&AUTH())return `<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no ads, no tracking, and nothing sent without an account. Reports you send go to the app owner. ${tipi('Opening or updating the app downloads it from GitHub Pages, which, like any website host, sees your IP address; after that it works offline. With an account, your log and email are stored in a Supabase database, readable by your account and by the app owner; the email is used only to sign in and reset your password. A new password is checked against known breaches with only the first 5 characters of its hash. Deleting the app or this site\'s data deletes the copy on this device, so keep a backup file or an account.','About privacy')}</p>`;
  return inClaude
    ?`<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no ads, no tracking. Your log is stored with your Claude account. ${tipi('Export and CSV files go only where you save them.','About privacy')}</p>`
    :`<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no account, no ads, no tracking. Your log stays on this device and is sent nowhere. Reports you send go to the app owner. ${tipi(`${APP_NAME} has no server. Opening or updating the app downloads it from GitHub Pages, which, like any website host, sees your IP address; after that it works offline. Backup files go only where you save them. Deleting the app or this site's data deletes your log, so keep a backup file.`,'About privacy')}</p>`;
}
function syncInfo(){
  if(!cloud.on)return isStandalone()
    ?`<p class="small hastip" style="margin:0" data-tip="Without an account this app keeps your data on this phone only. Deleting the app from the home screen deletes it too. Sign in to keep a copy in your account, or save a backup file to Files or iCloud Drive; Import brings it back on any device."><b>Saved on this phone.</b> ${AUTH()?'Sign in to sync, or export a backup weekly.':'Export a backup weekly.'}</p>`
    :AUTH()
      ?`<p class="small hastip" style="margin:0" data-tip="Everything is saved in this browser only. Clearing its data deletes it. Sign in below to keep a copy in your account, or export a backup."><b>Saved in this browser only.</b> Sign in to sync, or export a backup.</p>`
      :`<p class="small hastip" style="margin:0" data-tip="Sync turns on by itself when this page is opened inside Claude while signed in. Until then everything is saved in this browser only."><b>Cloud sync off in this view.</b> Saved in this browser only.</p>`;
  const ago=cloud.last?Math.round((Date.now()-cloud.last)/60000):null;
  const when=ago==null?'not yet':ago<1?'just now':ago<60?`${ago} min ago`:ago<1440?`${Math.round(ago/60)} h ago`:fmtDate(iso(new Date(cloud.last)));
  const st=cloud.status==='synced'?'<span class="tag green">Synced</span>':cloud.status==='offline'?'<span class="tag yellow">Waiting to sync</span>':'<span class="tag blue">Syncing</span>';
  return `<div class="sync-row">${st}<span class="small muted">Last synced ${when}</span><button class="btn sm" data-act="syncNow">Sync now</button></div>
  <p class="small hastip" style="margin:6px 0 0" data-tip="A new phone or a cleared browser loses nothing: sign in and your log comes back. Deleted items wait in History, Recently deleted, for ${TRASH_DAYS} days, and Undo in Settings covers the last 7 days.">${cloud.status!=='synced'?'Saved on this device. It reaches your account when you are back online.':window.claude?'Saved to your Claude account and this device.':'Saved to your account and this device.'}${cloud.err?` <b style="color:var(--red)">${esc(cloud.err)}</b>`:''}</p>`;
}
/* Two tabs (or the app and a second window) used to overwrite each other: each
   wrote its whole state, so the one that saved last erased what the other had
   saved. Now each tab hears the other's save and merges it into its own
   state, record by record, with this tab's last save as the base: changes
   made only there are taken, changes made only here are kept. Content is
   compared with canon(), which ignores key order, so two tabs holding the
   same data never keep rewriting it back and forth. */
window.addEventListener('storage',ev=>{
  if(ev.storageArea&&ev.storageArea!==localStorage)return;
  if(ev.key===SYNC_KEY&&ev.newValue){
    try{const m=JSON.parse(ev.newValue);if(m&&typeof m==='object'){if(m.meta&&typeof m.meta==='object')cloud.meta=m.meta;if(m.editAt&&typeof m.editAt==='object')cloud.editAt=m.editAt;if(m.last)cloud.last=m.last;}}catch(e){log('tabs',e);}
    return;
  }
  if(ev.key!==KEY||ev.newValue==null||ev.newValue===lastSaved)return;
  let incoming,base=null;
  try{incoming=normalize(JSON.parse(ev.newValue));}catch(e){log('tabs',e);return;}
  try{base=lastSaved?normalize(JSON.parse(lastSaved)):null;}catch(e){base=null;}
  const stat={conflicts:0};
  if(!base||canon(state)===canon(base))setState(incoming);
  else{
    const L=chunksOf(state),Rr=chunksOf(incoming),B=chunksOf(base),parts={};
    for(const id of new Set([...Object.keys(L),...Object.keys(Rr),...Object.keys(B)]))
      parts[id]=mergeChunk(id,baseOf(id,B[id]||emptyChunk(id)),L[id]||emptyChunk(id),Rr[id]||emptyChunk(id),true,stat);
    setState(assemble(parts));
  }
  lastSaved=ev.newValue;clearTimeout(saveT);saveT=null;
  invalidate();resyncLocalH();
  // Anything that was only here goes back out, so the other tab has it too.
  if(canon(state)!==canon(incoming))saveNow();
  if(!ui.modal)rerenderKeepScroll();else render();
  conflictNote(stat);
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){if(saveT)saveNow();if(cloud.on){clearTimeout(cloud.t);cq(cloudFlush);}}
  else if(cloud.on&&Date.now()-cloud.lastPull>20000)cq(cloudPull);
});
window.addEventListener('pagehide',()=>{if(saveT)saveNow();if(trackT||cloud.pendAt)trackEdits();});

