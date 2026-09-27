// cloudFlush snapshots chunks before awaiting the lease and the remote read.
// If the remote chunk changed (other device), the merge is built from the stale
// snapshot and applyChunk() overwrites the chunk in state, erasing any edit made
// to that chunk while the read was in flight.
const {open}=require(require('path').join(__dirname,'..','h.js'));const {chromium}=require('playwright');
const {cloudSetup,wait,delay}=require('./cloud.js');const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{const browser=await chromium.launch();
const A=await open(P,{browser,clock:'2026-09-20T10:00:00',setup:cloudSetup});
const B=await open(P,{browser,clock:'2026-09-20T10:00:00',setup:cloudSetup});await wait(800);
const add=(X,id)=>X.page.evaluate(id=>{const L=window.__ironlog;const R=L.state.routines[0];L.state.sessions.push({id,date:'2026-09-18',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.invalidate();L.ACT.deloadToggle();L.ACT.deloadToggle();},id);
await add(A,'s0');await A.page.evaluate(()=>window.__ironlog.flush());await wait(300);
await B.page.evaluate(()=>window.__ironlog.sync());await wait(500);
await add(B,'sB');await B.page.evaluate(()=>window.__ironlog.flush());await wait(400);
// A: new session s1, flush starts with a slow network read
delay.get=2000;// slow network from here
await add(A,'s1');// commit schedules the auto flush in 1.2 s
await wait(1700);// flush is now awaiting the remote read
await add(A,'s2');// logged while the read is in flight
console.log('A during flight:',await A.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id).sort()));
await wait(2500);delay.get=0;
console.log('A after flush:',await A.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id).sort()));
console.log('A localStorage:',await A.page.evaluate(()=>JSON.parse(localStorage.getItem('ironlog.v1')).sessions.map(s=>s.id).sort()));
await wait(3000);
const doc=JSON.parse(JSON.parse(require('./cloud.js').store.get('data/users/u1/s-2026-09-2')).json);
console.log('cloud chunk:',doc.sessions.map(s=>s.id).sort());
await browser.close();})();
