/* ---------- account (standalone app) ---------- */
/* The sync line on Settings, redrawn in place when the sync's status changes (setCloud, through fx) and after an account change. */
function syncLine(){settingsSyncLine();}
function acctRerender(){if((ui.tab==='settings'||ui.tab==='today')&&!ui.modal)rerenderKeepScroll();else syncLine();}
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
  try{acct.reader=!!(F&&acct.user&&typeof F.isReader==='function'&&await F.isReader());}catch(e){log('feedback',e);acct.reader=false;}
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
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* The menu, the account sheet, a problem report and its inbox are drawn by
   src/app/sheetsaccount.ts since r63. */
