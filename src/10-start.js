(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
/* The storage and sync modules (phase 4, r56) reach the screens through
   this one object: filled first, before anything that could call an effect
   runs (every function named here is declared below, hoisted). Then what the
   storage and sync parts ran as the page loaded, in their order: the save
   read into the store, the sync notes, the device id, the listeners. */
setFx({render,rerenderKeepScroll,closeModal,toast,setSaveState,syncLine,obGate,confirm:(title,body,okLabel,fn,danger,alt)=>confirmBox(title,body,okLabel,fn,danger,alt),refreshEx,syncDraftPlan,unitWords,stopTimer,startTimer,recap:m=>openModal({kind:'recap',...m}),undoToastHide:()=>{const el=$('#toast');if(el&&el.querySelector('[data-act="undo"]')){clearTimeout(toastT);el.hidden=true;}},primeAudio,timerRefresh:()=>{if(!$('#timer').hidden)tick();},wakeOn,wakeOff,ask:(title,body,ok,alt)=>new Promise(res=>confirmBox(title,body,ok,()=>res('ok'),false,{label:alt,fn:()=>res('alt')},()=>res('cancel')))});
storageStart();
syncStart();
/* Update prompt (standalone app only). The build's boot script registers the
   service worker and calls ironlogUpdateReady() once a new version has been
   downloaded and is waiting. Nothing reloads by itself, because a reload in
   the middle of a set is jarring: the lifter picks the moment, and the
   session in progress is saved first, so it comes back as it was. "Later"
   hides the bar until the next launch. The words say what the button does
   (V, 2026-10-25, PENDING 335): "Update ready" and Update, where it said "New
   version ready" and Reload. */
const upd={ready:false,later:false};
function updRender(){
  const el=document.getElementById('updbar');if(!el)return;
  const show=upd.ready&&!upd.later;el.hidden=!show;
  if(show&&!el.firstChild)el.innerHTML='<span class="ut">Update ready</span><button type="button" class="btn sm primary" data-act="appUpdate">Update</button><button type="button" class="btn sm" data-act="appUpdateLater">Later</button>';
}
window.ironlogUpdateReady=()=>{upd.ready=true;updRender();};
