// First link of a device that already has local data (never synced): sessions are
// unioned but exercises/routines/settings come wholesale from the side with more
// real sessions. A custom exercise that only the smaller side has is dropped, and
// its sessions render as "Deleted exercise".
const {open}=require(require('path').join(__dirname,'..','h.js'));const {chromium}=require('playwright');
const {cloudSetup,wait}=require('./cloud.js');const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{const browser=await chromium.launch();
const A=await open(P,{browser,clock:'2026-09-20T10:00:00',setup:cloudSetup});await wait(800);
await A.page.evaluate(()=>{const L=window.__ironlog;const R=L.state.routines[0];for(const id of ['a1','a2'])L.state.sessions.push({id,date:'2026-09-1'+id[1],dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.invalidate();});
await A.page.evaluate(()=>window.__ironlog.flush());await wait(400);
// Device B: local-only data from before sync (seeded localStorage, no sync meta)
const tmp=await open(P,{browser,clock:'2026-09-20T10:00:00'});
const st=await tmp.page.evaluate(()=>{const L=window.__ironlog;const s=JSON.parse(JSON.stringify(L.state));s.exercises.push({id:'myEx',name:'My Landmine Thing',primary:'chest',secondary:[],equip:'landmine',custom:true});const R=s.routines[0];s.sessions.push({id:'b1',date:'2026-09-15',dayIdx:0,dayId:R.days[0].id,dayName:'Custom',routineId:R.id,notes:'',ex:[{exId:'myEx',sets:[{w:60,r:10,rir:1}]}]});return s;});await tmp.ctx.close();
const B=await open(P,{browser,clock:'2026-09-20T10:00:00',setup:cloudSetup,state:st,stateOnce:false});await wait(1500);
console.log('B sessions:',await B.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id)));
console.log('B has myEx:',await B.page.evaluate(()=>window.__ironlog.state.exercises.some(e=>e.id==='myEx')),'b1 renders as:',await B.page.evaluate(()=>{const L=window.__ironlog;return L.state.exercises.find(e=>e.id==='myEx')?'ok':'Deleted exercise';}));
await browser.close();})();
