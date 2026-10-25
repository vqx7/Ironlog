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
// Fields typed in, and the update bar (r60): started before the page's handlers are added below.
viewStart();
updateStart();
