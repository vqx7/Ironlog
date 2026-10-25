/* ---------- help ---------- */
/* One ? button per explanation. The paragraph is in the page but hidden until
   tapped, so nothing has to be read twice and nothing has to be scrolled past. */
function helpBtn(key){return `<button type="button" class="hb" data-act="help" data-h="${key}" aria-expanded="${ui.help.has(key)}" aria-controls="help-${key}" aria-label="What this shows">?</button>`;}
/* Inside a section (r28): a ? in the header sat beside the fold arrow, so a
   tap meant for the arrow opened the explanation instead. Headers now hold
   only the title, the number and the arrow; the explanation is the first
   line inside the section. */
function helpLink(key){return `<div class="sec-help"><button type="button" class="hlink" data-act="help" data-h="${key}" aria-expanded="${ui.help.has(key)}" aria-controls="help-${key}"><span class="hi" aria-hidden="true">i</span>How this works</button></div>`;}
function helpText(key,text){return `<p class="ht" id="help-${key}" ${ui.help.has(key)?'':'hidden'}>${text}</p>`;}

/* ---------- sections ----------
   One component for every foldable block on every tab. Fold state lives in
   memory for this visit only (ui.folds). Each time Ironlog opens, every
   section starts folded (V, r28: the titles say what is inside), except
   Sessions on History, which is that tab's content. Every fold inside a
   section starts closed too. Folds used to be saved to the synced
   settings, where one tap (or another device) could leave a section open or
   closed for good. */
/* o: {sk, key (movable id, optional), title, sub (HTML), help, helpBody, body, def, id} */
function sec(o){
  const mk=o.key?` data-mkey="${o.key}"`:'';
  return `<details class="sec" data-sk="${o.sk}"${mk}${o.id?` id="${o.id}"`:''} ${isOpen(o.sk,o.def)?'open':''}><summary>${o.key?sgrip(o.title):''}<span class="sec-t">${esc(o.title)}</span><span class="sec-s">${o.sub||''}</span><span class="chev" aria-hidden="true"></span></summary><div class="sec-b">${o.help&&o.helpBody?helpLink(o.help)+helpText(o.help,o.helpBody):''}${o.body}</div></details>`;
}
function subsec(sk,title,body,sub){
  return `<details class="subsec" data-sk="${sk}" ${isOpen(sk,false)?'open':''}><summary><span class="subsec-t">${esc(title)}</span><span class="sec-s">${sub||''}</span><span class="chev" aria-hidden="true"></span></summary><div class="sec-b">${body}</div></details>`;
}
/* Open the tab's main section (only History has one) when this visit has
   not decided about it yet. */
function openMain(){
  if(ui.tab==='today'&&state.draft)return;
  if(ui.tab==='program'&&ui.planView==='library')return;
  const fixed=MAIN_FIXED[ui.tab];if(!fixed)return;
  const el=keyedKids().find(e=>e.dataset.mkey===fixed);
  if(el&&el.tagName==='DETAILS'&&el.dataset.sk&&!Object.prototype.hasOwnProperty.call(ui.folds,el.dataset.sk)&&!el.open){el.dataset.auto='1';el.open=true;}
}
/* A page whose only action is its ? keeps it at the top right instead of
   wrapping it onto a line of its own under a long subtitle (r28, Plan). */
function pageHead(kick,title,meta,actions){const q=!!actions&&actions.lastIndexOf('<button')===0&&actions.includes('class="hb"');return `<div class="ph${q?' q':''}"><div>${kick?`<p class="kick">${kick}</p>`:''}<h2>${esc(title)}</h2>${meta?`<p class="meta">${meta}</p>`:''}</div>${actions?`<div class="ph-a">${actions}</div>`:''}</div>`;}


/* ---------- toast / modal ---------- */
/* Undo used to be one snapshot that the toast timer nulled out after six
   seconds. Destructive actions deserve better than that, so keep a bounded
   stack for the life of the tab and expose it in Settings as well. */
let toastT=null;
/* A note with nothing to undo goes when a session starts (r31): the
   routine-ready note sat over the session title and Discard. */
function toastQuiet(){const el=$('#toast');if(el&&!el.hidden&&!el.querySelector('[data-act="undo"]')){clearTimeout(toastT);el.hidden=true;}}
function toast(msg,undo,ms,kind){
  const el=$('#toast');el.classList.toggle('pr',kind==='pr');el.innerHTML=`<span>${esc(msg)}</span>${undo?'<button data-act="undo">Undo</button>':''}`;el.hidden=false;
  clearTimeout(toastT);toastT=setTimeout(()=>{el.hidden=true;},ms||(undo?6000:2600));
}
/* The menu button's dot and words (r27; the reading is saveStateNow, in
   src/app/storage.ts): drawn in place on every save and sync change. */
function setSaveState(){const el=$('#saveState');if(!el)return;
  const {cls,txt}=saveStateNow();
  el.className='ssb'+(cls?' '+cls:'');
  el.innerHTML=`${MENU_ICON}<span class="sd" aria-hidden="true"></span><span class="sst">${esc(txt)}</span>`;
  el.setAttribute('aria-label','Menu. '+txt);el.setAttribute('data-tip',txt);
  // An open menu follows the state, but is only redrawn when it changed, so a tap is never lost to a redraw.
  let who='';try{who=acct.user?acct.user.email:'';}catch(e){/* before accounts are set up */}const key=cls+'|'+txt+'|'+who;
  if(setSaveState.last!==key){setSaveState.last=key;if(ui.modal&&ui.modal.kind==='menu'&&!$('#modal').hidden)renderModal();}}
/* Focus used to stay behind the overlay, so keyboard and screen-reader users
   could tab through the page underneath a supposedly modal sheet. */
let modalReturn=null;
function modalFocusables(){
  const el=$('#modal');if(!el||el.hidden)return [];
  return Array.prototype.slice.call(el.querySelectorAll('button,input,select,textarea,[href],[tabindex]:not([tabindex="-1"])'))
    .filter(e=>!e.disabled&&e.getAttribute('aria-hidden')!=='true');
}
/* On a phone, focusing a search box the moment a picker opens throws up the
   keyboard over the list you came to scroll. Touch screens get the sheet
   focused instead; a tap on the search box brings the keyboard when wanted. */
/* The phone's Back gesture used to leave the app with a sheet open. Opening a
   sheet adds one history entry, and Back closes the sheet instead. Closing
   a sheet with its own buttons leaves that entry in place and the next sheet
   reuses it, rather than calling history.back(), whose delayed event could
   land on a sheet opened a moment later. */
function modalPush(){try{if(!(history.state&&history.state.ilModal))history.pushState({ilModal:1,ilTab:ui.tab},'');}catch(e){/* history is best effort in a frame */}}
/* Back also steps back through tabs, like a native app: each tab change adds
   one history entry holding the tab, and Back shows the tab of the entry it
   lands on. From the first tab you opened, Back leaves the app as before.
   A sheet's entry left behind by closing it with its own buttons is replaced
   by the next tab change instead of stacking up, so Back never needs an
   extra press to get past it. Tabs changed from inside the app (a tile that
   opens Stats) count the same as the tab bar. */
const TABS_OK=new Set(['today','program','dash','history','settings']);
let navTab=null,navFromPop=false;
function navSync(){
  if(navTab===ui.tab)return;
  const first=navTab===null;if(!first)ui.prevTab=navTab;navTab=ui.tab;
  if(navFromPop){navFromPop=false;return;}
  try{
    const st=history.state;
    if(first||(!ui.modal&&st&&st.ilModal))history.replaceState({ilTab:ui.tab},'');
    else history.pushState({ilTab:ui.tab},'');
  }catch(e){/* history is best effort in a frame */}
}
window.addEventListener('popstate',()=>{
  if(ui.modal){if(ui.modal.dirty){modalPush();toast(DIRTY_SAID);return;}closeModal();return;} // Back is a tap outside too: a sheet with something typed stays (r55, the audit)
  const st=history.state;const t=st&&st.ilTab;
  if(t&&t!==ui.tab&&TABS_OK.has(t)){navFromPop=true;ui.tab=t;if(t==='program')ui.planView='routine';window.scrollTo(0,0);render();}
});
function openModal(m){
  const fresh=!ui.modal;
  if(fresh){modalReturn=document.activeElement;modalPush();}
  const was=ui.modal;ui.modal=m;if(was&&was.kind==='confirm'&&was.onClose&&!was.answered)was.onClose();renderModal(); // a question replaced unanswered (r56.1) reads as Cancel, as closeModal reads it: the sync waiting on it must not wait forever
  const el=$('#modal');if(!el)return;
  // A new name field (creating an exercise) is always focused, since typing
  // is the first thing to do there, even when it replaces another sheet.
  const nm=m.kind==='exEdit'&&m.isNew&&!m.e.name?el.querySelector('[data-ebind="name"]'):null;
  if(nm){try{nm.focus({preventScroll:true});}catch(e){/* focus is best effort */}return;}
  if(!fresh)return;
  // Prefer a text field. Never auto-focus the confirm button of a destructive
  // dialog, or a stray Enter would carry out the deletion.
  const noKb=(m.kind==='picker'||m.kind==='past')&&coarse();
  const target=(!noKb&&el.querySelector('input,select,textarea'))||el.querySelector('.sheet');
  if(target)try{target.focus({preventScroll:true});}catch(e){/* focus is best effort */}
}
function closeModal(){
  if(AI.ctl){try{AI.ctl.abort();}catch(e){/* already finished */}AI.ctl=null;}
  const was=ui.modal;
  ui.modal=null;if(was&&was.kind==='confirm'&&was.onClose&&!was.answered)was.onClose();
  if(was&&was.kind==='account'){
    if(was.mode==='wait')waitStop();
    // No answer to "Where do you use Ironlog?": the safe choice, as before item 61.
    if(was.mode==='where'&&!was.answered){const A=AUTH();acct.user=null;if(A)A.signOut().catch(e=>log('auth',e)).then(()=>acctRerender());}
  }
  if(was&&was.kind==='short'&&was.temp&&!was.applied&&state.draft&&state.draft.id===was.temp&&!state.draft.ex.some(b=>b.sets.some(x=>x.done))){
    state.draft=null;stopTimer();wakeOff();saveNow();setTimeout(render,0);}$('#modal').hidden=true;$('#modal').innerHTML='';document.body.classList.remove('modal-open');renderModal.last=null;
  // The 3D body goes back to Today's map, coloured by the week again.
  // Turned in the sheet, the body goes back to Today facing the way it was, a turn still running stopped first (r54: it went on, on Today's body).
  if(was&&was.kind==='exMus'){cancelAnimationFrame(B3.anim);B3.ex=null;if(B3.yawKeep!=null){B3.yaw=B3.yawKeep;B3.yawKeep=null;}if(document.getElementById('bm3d'))mount3D();}
  const r=modalReturn;modalReturn=null;
  if(r&&document.contains(r)&&typeof r.focus==='function')try{r.focus({preventScroll:true});}catch(e){/* focus is best effort */}
}
/* alt is an optional second action, {label, fn}. Some choices are genuinely
   three-way ("keep them", "drop them", "go back") and collapsing that into
   OK/Cancel is how data gets thrown away by accident. */
function confirmBox(title,body,okLabel,fn,danger,alt,onClose){openModal({kind:'confirm',title,body,okLabel,fn,danger,alt,onClose});} // onClose (r56.1): the sheet closed without an answer, so a question the sync asked (fx.ask) can read it as Cancel.

/* ---------- timer ---------- */
const timer={end:0,iv:null,fired:false};
/* navigator.vibrate does not exist on iOS Safari, so the timer used to finish
   in total silence on an iPhone. The audio context is created on the tap that
   starts the timer, which is a user gesture, so the beep is allowed to play
   later. A backgrounded tab can still suppress it, which is why the bar also
   changes state and the elapsed time is computed from an absolute end stamp
   rather than counted down. */
let actx=null;
function beep(){
  try{
    const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
    if(!actx)actx=new C();
    if(actx.state==='suspended')actx.resume();
    const t0=actx.currentTime;
    [0,0.22].forEach((off,i)=>{
      const o=actx.createOscillator(),g=actx.createGain();
      o.type='sine';o.frequency.value=i?1046:784;
      g.gain.setValueAtTime(0.0001,t0+off);
      g.gain.exponentialRampToValueAtTime(0.25,t0+off+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001,t0+off+0.18);
      o.connect(g);g.connect(actx.destination);o.start(t0+off);o.stop(t0+off+0.2);
    });
  }catch(e){log('audio',e);}
}
function primeAudio(){
  try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;if(!actx)actx=new C();if(actx.state==='suspended')actx.resume();}catch(e){log('audio',e);}
}
/* A locked phone suspends the page, so the timer cannot sound or vibrate
   until you unlock it. Said once per device, the first time a rest starts
   with the keep-awake setting off, once no other message shows (r54: a PR's). */
function wakeTip(){
  if(state.settings.wakeLock)return;
  try{if(localStorage.getItem(KEY+'.tipWake'))return;localStorage.setItem(KEY+'.tipWake','1');}catch(e){return;}
  const say=()=>{const el=$('#toast');if(el&&!el.hidden){setTimeout(say,500);return;}toast('A locked screen holds the rest alert until you unlock. Settings can keep the screen on.',false,6000);};setTimeout(say,600);
}
/* The end time is kept on this device, so a phone that reloads a backgrounded
   tab mid-rest comes back to the same countdown. */
const TIMER_KEY=KEY+'.timer';
// The rest's full length is kept beside it (r29), so the bar along the top
// still empties from the right place after a reload.
function timerSave(){try{if(timer.end&&!$('#timer').hidden){localStorage.setItem(TIMER_KEY,String(timer.end));localStorage.setItem(TIMER_KEY+'Len',String(timer.total||0));}else{localStorage.removeItem(TIMER_KEY);localStorage.removeItem(TIMER_KEY+'Len');}}catch(e){log('timer',e);}}
function startTimer(sec){wakeTip();timer.end=Date.now()+sec*1000;timer.total=sec;timer.fired=false;primeAudio();$('#timer').hidden=false;timerBuild();timerSave();if(!timer.iv)timer.iv=setInterval(tick,250);tick();}
function timerResume(){
  let end=0;try{end=+localStorage.getItem(TIMER_KEY)||0;}catch(e){return;}
  if(!state.draft||!(end>Date.now())){try{localStorage.removeItem(TIMER_KEY);}catch(e){/* nothing to clear */}return;}
  let len=0;try{len=+localStorage.getItem(TIMER_KEY+'Len')||0;}catch(e){/* the bar then starts full */}
  timer.end=end;timer.total=len>0?len:Math.round((end-Date.now())/1000);timer.fired=false;$('#timer').hidden=false;timerBuild();if(!timer.iv)timer.iv=setInterval(tick,250);tick();
}
/* One place that marks a set done or not done, so the checkmark and auto-done
   paths cannot drift apart. The rest timer starts here only in Auto mode. */
// The set waiting to be confirmed, held through blkRef, so neither a move nor a rebuild points it at another exercise (r46).
let lastAuto=null;
/* Reps far past anything logged on the lift and its range (a typo: 105 for
   10) are asked about before they count (r32, second check: 100 x 105 was
   saved with a gold "Rep PR" and next time asked to beat 124 reps). */
let oddOk=null;
function oddReps(b,s){
  const r=+s.r;if(!(r>30))return false;let best=0;for(const x of IDX().byEx[b.exId]||[])for(const p of x.pts)best=Math.max(best,p.r);
  return r>2*Math.max(+b.plan.repMax||0,best);
}
function setDone(bi,si,val,again){ /* again: the set was ticked before, and is ticked again after the far-off question, so its rest is not started over (r55, the second review) */
  const b=state.draft.ex[bi];const s=b&&b.sets[si];if(!s)return;const okKey=`${bi}:${si}:${s.r}:${effW(b,si)}`;const far=val&&oddOk!==okKey&&!oddReps(b,s)?oddLoad(b,si,state.draft.date):null;const lz=val&&oddOk!==okKey&&!far&&lightZero(b,si,state.draft.date); /* a 0 at a light weight asks too (r55.1, V 2026-10-19) */
  if(val&&oddOk!==okKey&&(far||oddReps(b,s)||lz)){const ex=EX(b.exId);const fix=far?'w':'r'; // a load far off asks too (r55, V), and Fix it goes back to the field
    confirmBox(`${setShort(ex,effW(b,si),s.r)}${ex.bw?'':' '+U()}?`,lz?`0 ${ex.timed?'seconds':'reps'} at a weight well under today's working load. Log it as missed, or go back and fix it.`:`${far||`${s.r} ${ex.timed?'seconds':'reps'} is far past your ${rangeWords(b.plan)} and anything logged on this exercise.`} Log it as typed, or go back and fix it.`,lz?'Log it as missed':'Log it',()=>{oddOk=okKey;setDone(bi,si,true,again);saveNow();rerenderKeepScroll();},false,{label:'Fix it',only:true,fn:()=>{if(again)ui.refix={b:blkRef(bi),s:si};const f=document.querySelector(`.sg input[data-f="${fix}"][data-b="${bi}"][data-s="${si}"]`);if(f){f.focus();if(f.select)f.select();}}});
    return;}
  if(val)settleLoad(b,si);
  s.done=val;if(val&&isMissed(s)&&!s.warm&&!s.drop)toast(MISSED_SAID); // a typed 0 (r55, V)
  afterSet(bi,si);
  const btn=document.querySelector(`[data-act="sDone"][data-b="${bi}"][data-s="${si}"]`);
  if(btn){btn.classList.toggle('on',val);btn.setAttribute('aria-pressed',String(val));btn.setAttribute('aria-label',`Set ${si+1} ${val&&isMissed(s)?'missed':'done'}`);const row=btn.closest('.sg');if(row)row.classList.toggle('done',val);}
  refreshPR(bi,si,true);
  const c=$('#doneCount');
  if(c){const n=state.draft.ex.reduce((a,x)=>a+x.sets.filter(y=>y.done&&!y.warm).length,0);c.textContent=String(n);const w=$('#doneWord');if(w)w.textContent=n===1?'set':'sets';}
  let autoRest=val&&!again&&!s.warm&&!state.draft.editingId&&!state.draft.past&&+b.plan.rest>0&&state.settings.timerMode==='auto';
  // In a superset the rest is taken after the last exercise of the group.
  /* No rest while a partner after this one still has a set to do; once the
     partners are through (a pair of 5 and 3 sets), every set rests (r34.2). */
  if(autoRest&&b.plan.ss){const grp=state.draft.ex.filter(x=>x.plan&&x.plan.ss===b.plan.ss);const k=grp.indexOf(b);
    if(grp.slice(k+1).some(x=>x.sets.some(y=>!y.done&&!y.warm&&!y.drop)))autoRest=false;}
  if(autoRest)startTimer(+b.plan.rest);
  updateProgress(bi);updatePlates(bi);updateSessBar();
  clearTimeout(foldT);foldT=null;
  // RIR opens by itself only if asked for in Settings > Effort; otherwise a tap
  // on the set's RIR box opens it. A blank RIR is fine: see rirSettings().
  const askRir=val&&state.settings.rirAsk===true&&!s.warm&&s.rir==null&&rirShow(EX(b.exId))&&!!document.querySelector(`.rirb[data-b="${bi}"][data-s="${si}"]`);
  if(askRir)rirShowStrip(bi,si);else if(!val)rirClose();
  if(val&&!askRir&&!state.draft.editingId&&blockDone(b)){const rf=blkRef(bi);foldT=setTimeout(()=>autoFold(rf),1200);}
  // The first set ticked on an exercise below untouched ones moves it up (r45).
  if(val&&b.sets.filter(x=>x.done).length===1&&orderAt(b)>=0)orderSoon(b);
  saveNow();
}
/* Screen wake lock, optional. A locked phone suspends the page and with it the
   rest alert, so keeping the screen on is the only way a web page can
   guarantee the beep. Unsupported or refused requests fail quietly. */
let wakeSentinel=null;
async function wakeOn(){
  if(!state.settings.wakeLock||!state.draft||wakeSentinel)return;
  try{if(navigator.wakeLock&&navigator.wakeLock.request){wakeSentinel=await navigator.wakeLock.request('screen');wakeSentinel.addEventListener&&wakeSentinel.addEventListener('release',()=>{wakeSentinel=null;});}}
  catch(e){wakeSentinel=null;if(!wakeOn.warned){wakeOn.warned=true;toast('This browser would not keep the screen on');}}
}
function wakeOff(){try{if(wakeSentinel)wakeSentinel.release();}catch(e){/* already released */}wakeSentinel=null;}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')wakeOn();});
function stopTimer(){clearInterval(timer.iv);timer.iv=null;timer.fired=false;$('#timer').hidden=true;document.body.classList.remove('timer-on');timerSave();}
/* The bar is built once per start (or when its style setting changes) and
   each tick only rewrites the time. Rebuilding its buttons four times a
   second made clicks land on a button that no longer existed and threw
   keyboard focus back to the page. */
function timerBuild(){
  const el=$('#timer');const compact=!!state.settings.timerCompact;
  if(el.dataset.mode===(compact?'c':'f')&&el.firstChild)return;
  el.dataset.mode=compact?'c':'f';el.classList.toggle('compact',compact);
  el.innerHTML=compact
    ?`<span class="tv" data-t="v"></span><button data-act="tAdd" aria-label="Add 15 seconds">+15</button><button data-act="tStop" aria-label="Dismiss timer">✕</button>`
    :`<span data-t="l"></span><span class="tv" data-t="v"></span><span class="row"><button data-act="tAdd">+15s</button><button data-act="tStop">Dismiss</button></span>`;
}
function tick(){
  const left=Math.max(0,Math.round((timer.end-Date.now())/1000));
  const el=$('#timer');
  timerBuild();
  document.body.classList.toggle('timer-on',!el.hidden);
  const v=el.querySelector('[data-t="v"]'),l=el.querySelector('[data-t="l"]');
  const txt=Math.floor(left/60)+':'+pad(left%60);
  if(el.dataset.mode==='c'){const t=left?txt:'Go';if(v.textContent!==t)v.textContent=t;v.setAttribute('aria-label',left?'Rest remaining':'Rest done');}
  else{if(v.textContent!==txt)v.textContent=txt;const lt=left?'Rest':'Rest done';if(l.textContent!==lt)l.textContent=lt;}
  el.classList.toggle('done',!left);
  // The bar along the top empties as the rest runs down; +15s lengthens it.
  const tot=Math.max(timer.total||0,left,1);el.style.setProperty('--tp',String(Math.max(0,Math.min(1,left/tot))));
  if(!left){
    clearInterval(timer.iv);timer.iv=null;
    if(!timer.fired){timer.fired=true;if(state.settings.timerSound){beep();try{navigator.vibrate&&navigator.vibrate([200,100,200]);}catch(e){/* vibration is optional */}}}
  }
}
// Intervals are throttled in a hidden tab, so re-sync on return rather than
// showing whatever the clock last managed to paint.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!$('#timer').hidden)tick();});

/* ---------- render ---------- */
let sortables=[];
function killDynamic(){
  obTourStop();
  // A re-render in the middle of a drag (a cloud refresh) would leave Sortable's
  // floating copy of the block on the page; it goes with the old list.
  blockDrag=false;if(document.body.classList.contains('blkdrag')){document.body.classList.remove('blkdrag');const v=document.getElementById('view');if(v)v.style.paddingBottom='';}if(typeof edgeScroll!=='undefined')edgeScroll.stop();document.querySelectorAll('.sortable-fallback,.sortable-ghost').forEach(e=>{if(!e.closest('#view'))e.remove();});
  killCharts();dragDrop();sortables.forEach(s=>{try{s.destroy();}catch(e){/* list already gone */}});sortables=[];}
function applyTheme(){const t=state.settings.theme;if(t==='system')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t;
  document.documentElement.dataset.accent=state.settings.accent||ACCENT0;
  // The installed app's status bar takes this colour, so it follows the theme.
  const m=document.querySelector('meta[name="theme-color"]');if(m)try{m.setAttribute('content',getComputedStyle(document.body).backgroundColor||'#08090b');}catch(e){/* cosmetic */}}
/* A code bug inside a view used to leave a blank screen. Now the error is
   logged and a recovery screen offers your data and a way back. */
/* True while #view is being replaced. Replacing it removes a focused field,
   and the browser then fires that field's change as if the lifter had left it.
   They did not, so that change must not tick a set. */
let rebuilding=false;
// True while lit-html is putting a tab into #view, and how many draws have begun (r57).
let drawing=false,drawN=0;
// The tabs drawn by their modules (phase 5): each a template of the log and ui. Today with a session in progress is the session screen, still the legacy script's markup (r60 moves it).
const LIT_TABS={today:viewToday,history:viewHistory,settings:viewSettings,program:()=>ui.planView==='library'?viewLibrary():viewProgram(),dash:viewDash};
function litTab(){return ui.tab==='today'&&state.draft?null:LIT_TABS[ui.tab]||null;}
function render(){if(!state.draft){if(!$('#timer').hidden)stopTimer();wakeOff();} // no session, no rest timer or screen kept on: a session erased, restored over or finished on another phone left both running (r55, the audit)
  try{renderInner();}
  catch(e){log('render',e);renderCrash(e);}
  navSync();
}
function renderCrash(e){
  let txt='';try{txt=JSON.stringify({app:STORAGE_ID,version:APP_VERSION,exported:new Date().toISOString(),state});}catch(e2){txt='(could not serialise data: '+e2.message+')';}
  const v=document.getElementById('view');if(!v)return;
  drawLegacy(v,`<div class="card"><h2>Something broke on this screen</h2><p class="small">Your data is saved and was not changed. Tap Try again to go back to Today. Report this sends the error to the app owner. If it keeps happening, copy the backup text below and keep it somewhere safe.</p>
  <p class="small muted">Error: ${esc(e&&e.message||String(e))} · version ${VERSION_LINE}</p>
  <div class="row"><button class="btn primary" data-act="crashRetry">Try again</button><button class="btn" data-act="fbOpen" data-cat="bug" data-crash="1">Report this</button></div>
  <label class="field" style="margin-top:10px">Backup text<textarea readonly style="min-height:160px;font-size:12px">${esc(txt)}</textarea></label></div>`);
}
function renderInner(){
  if(drawing){queueMicrotask(render);return;} // asked for mid-draw: once this draw is done (below)
  killDynamic();applyTheme();setSaveState();
  document.querySelectorAll('#tabs button').forEach(b=>{if(b.dataset.tab===ui.tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  {const tb=document.querySelector('#tabs button[data-tab="today"]');if(tb){const live=!!state.draft;tb.classList.toggle('live',live);const sp=tb.querySelector('span');if(sp)sp.textContent=live?'Session':'Today';tb.setAttribute('aria-label',live?(state.draft.editingId?'Session being edited':'Session in progress'):'Today');}}
  drawWeekBar();
  if(ui.tab==='library')ui.tab='program';
  // The setup pages stand alone: no tabs or week bar until a way to start is picked.
  if(obActive()&&ui.tab!=='today')ui.tab='today';
  document.body.classList.toggle('obmode',obActive());
  /* One host draws every tab (r57): a moved screen's template, updated in
     place, which places its sections itself; a legacy screen's markup, fresh
     each draw, whose sections are then put in their saved order, the hidden
     ones taken out and the tab's main section opened, as before. */
  const moved=litTab();
  /* A draw asked for while lit-html is drawing (an event a removed field fires
     mid-draw) runs once this one is done: lit-html takes nodes away one by one,
     and a draw inside that would find them gone. A legacy screen's field still
     focused is left before its markup is read, so the change it fires runs
     first, while rebuilding (so it ticks nothing), and the draw reads the log
     that change left; innerHTML fired it during its own replacement. */
  const was=rebuilding;rebuilding=true;
  try{
    // A change that drew the page itself (from the blur) has drawn it with the log as it now is: nothing more to draw.
    if(!moved){const n0=drawN,ae=document.activeElement,vw=$('#view');if(ae&&ae!==document.body&&vw&&vw.contains(ae)&&typeof ae.blur==='function')ae.blur();if(drawN!==n0)return;}
    drawing=true;drawN++;try{if(moved)drawScreen($('#view'),moved());else drawLegacy($('#view'),viewLogger());}finally{drawing=false;}
  }finally{rebuilding=was;}
  if(!moved){applySecOrder();applyHidden();openMain();}
  if(!(ui.tab==='today'&&state.draft)&&!(ui.tab==='program'&&ui.planView==='library'))mountSecSortable();
  if(ui.tab==='today'&&state.draft)mountBlockSortable();
  if(ui.tab==='program'&&ui.planView!=='library')mountSortable();
  if(ui.tab==='dash')mountCharts();
  if(ui.tab==='today'&&!state.draft)mount3D();
  if(obActive())mountObTour();
  if(ui.modal)renderModal();
}
/* Re-rendering replaces #view wholesale, which used to blow away whatever the
   user was typing in. Rebuild a selector for the focused control first, then
   put focus and the caret back where they were. */
function focusKey(el){
  if(!el||!el.tagName||el===document.body)return null;
  if(el.id)return '#'+el.id.replace(/([^\w-])/g,'\\$1');
  const at=[];
  for(const a of el.attributes)if(a.name.indexOf('data-')===0)at.push(`[${a.name}="${String(a.value).replace(/(["\\])/g,'\\$1')}"]`);
  return at.length?el.tagName.toLowerCase()+at.join(''):null;
}
function rerenderKeepScroll(){
  const y=window.scrollY,el=document.activeElement,key=focusKey(el),txt=el&&el.tagName==='INPUT'&&el.type==='text'?el.value:null; // the text as typed: "152." is 152 stored, and redrawn from the log it lost its point (r55, the audit)
  const ss=el&&typeof el.selectionStart==='number'?el.selectionStart:null;
  const se=el&&typeof el.selectionEnd==='number'?el.selectionEnd:null;
  render();
  window.scrollTo(0,y);
  if(!key)return;
  let next=null;try{next=document.querySelector(key);}catch(e){/* selector from a stale element */}
  if(!next||typeof next.focus!=='function')return;
  try{
    next.focus({preventScroll:true});if(txt!=null&&next.tagName==='INPUT'&&next.value!==txt&&numIn(next.value)===numIn(txt))next.value=txt;
    if(ss!=null&&typeof next.setSelectionRange==='function')next.setSelectionRange(ss,se);
  }catch(e){/* caret restore is best effort */}
  window.scrollTo(0,y);
}

