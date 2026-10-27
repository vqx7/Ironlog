(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
/* The page (src/app/page.ts, r63) draws the tabs and the sheets from these
   two tables, which know every screen and sheet; given first, before
   anything can draw. Each sheet by its kind: its draw, and what closing it
   does beyond hiding it. */
setRoot(renderInner);
setSheets({
  account:{draw:acctSheet,closed:acctClosed},
  install:{draw:installSheet},icon:{draw:iconSheet},menu:{draw:menuSheet},guide:{draw:guideSheet},calendar:{draw:calSheet},past:{draw:pastSheet},
  feedback:{draw:fbSheet},fbInbox:{draw:fbInboxSheet},restwk:{draw:restWeekSheet},daypick:{draw:dayPickSheet},confirm:{draw:confirmSheet},
  picker:{draw:pickerSheet},exEdit:{draw:exEditSheet},exhist:{draw:exHistSheet},bmenu:{draw:bmenuSheet},injury:{draw:injurySheet},
  recap:{draw:recapSheet},imp:{draw:impSheet},templates:{draw:templatesSheet},routineNew:{draw:routineNewSheet},
  // The 3D body goes back to Today's map, coloured by the week again, facing the way it was, a turn still running stopped first (r54: it went on, on Today's body).
  exMus:{draw:exMusSheet,closed:()=>{cancelAnimationFrame(B3.anim);B3.ex=null;if(B3.yawKeep!=null){B3.yaw=B3.yawKeep;B3.yawKeep=null;}if(document.getElementById('bm3d'))mount3D();}},
  goal:{draw:goalSheet},inc:{draw:incSheet},cardio:{draw:cardioSheet},quick:{draw:quickSheet},max:{draw:maxSheet},cal:{draw:calibrationSheet},
  // Short on time's trial session (startShort) goes again when the sheet closes without its trim and nothing was logged: only a question was asked.
  short:{draw:shortSheet,closed:m=>{if(m.temp&&!m.applied&&state.draft&&state.draft.id===m.temp&&!state.draft.ex.some(b=>b.sets.some(x=>x.done))){state.draft=null;stopTimer();wakeOff();saveNow();setTimeout(render,0);}}},
  note:{draw:noteSheet},startAlt:{draw:startAltSheet},pickToday:{draw:pickTodaySheet},pickEx:{draw:pickExSheet},eq:{draw:eqSheet},text:{draw:textSheet}
},()=>{if(document.getElementById('bm3dx'))mount3D();});
/* The storage and sync modules (phase 4, r56) reach the page through this
   one object (fx, store.ts): filled before anything that could call an
   effect runs. Then what the storage and sync parts ran as the page loaded,
   in their order: the save read into the store, the sync notes, the device
   id, the listeners. */
setFx({render,rerenderKeepScroll,toast,setSaveState,syncLine,obGate,ask});
storageStart();
syncStart();
// Fields typed in, and the update bar (r60): started before the page's handlers are added below.
viewStart();
updateStart();
