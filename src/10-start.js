(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
/* The storage and sync modules (phase 4, r56) reach the screens through
   this one object: filled first, before anything that could call an effect
   runs (every function named here is declared below, hoisted). Then what the
   storage and sync parts ran as the page loaded, in their order: the save
   read into the store, the sync notes, the device id, the listeners. */
setFx({render,rerenderKeepScroll,closeModal,toast,setSaveState,syncLine,obGate,confirm:(title,body,okLabel,fn,danger)=>confirmBox(title,body,okLabel,fn,danger),refreshEx,syncDraftPlan,unitWords,stopTimer,primeAudio,timerRefresh:()=>{if(!$('#timer').hidden)tick();},wakeOn,wakeOff,ask:(title,body,ok,alt)=>new Promise(res=>confirmBox(title,body,ok,()=>res('ok'),false,{label:alt,fn:()=>res('alt')},()=>res('cancel')))});
storageStart();
syncStart();
/* Update prompt (standalone app only). The build's boot script registers the
   service worker and calls ironlogUpdateReady() once a new version has been
   downloaded and is waiting. Nothing reloads by itself, because a reload in
   the middle of a set is jarring: the lifter picks the moment, and the
   session in progress is saved first, so it comes back as it was. "Later"
   hides the bar until the next launch. */
const upd={ready:false,later:false};
function updRender(){
  const el=document.getElementById('updbar');if(!el)return;
  const show=upd.ready&&!upd.later;el.hidden=!show;
  if(show&&!el.firstChild)el.innerHTML='<span class="ut">New version ready</span><button type="button" class="btn sm primary" data-act="appUpdate">Reload</button><button type="button" class="btn sm" data-act="appUpdateLater">Later</button>';
}
window.ironlogUpdateReady=()=>{upd.ready=true;updRender();};
