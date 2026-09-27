// Device B's clock runs 5 minutes behind A. Change detection compares the
// remote writer's Date.now() ("at") with this device's own last write time, so
// A ignores B's newer write on pull and then overwrites it on flush.
const {open}=require(require('path').join(__dirname,'..','h.js'));const {chromium}=require('playwright');
const {cloudSetup,wait,store}=require('./cloud.js');const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{const browser=await chromium.launch();
const A=await open(P,{browser,clock:'2026-09-20T10:00:00',setup:cloudSetup});
const B=await open(P,{browser,clock:'2026-09-20T09:55:00',setup:cloudSetup});await wait(800);
const add=(X,id)=>X.page.evaluate(id=>{const L=window.__ironlog;const R=L.state.routines[0];L.state.sessions.push({id,date:'2026-09-18',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.invalidate();},id);
await add(A,'sA');await A.page.evaluate(()=>window.__ironlog.flush());await wait(300);
await B.page.evaluate(()=>window.__ironlog.sync());await wait(500);
await add(B,'sB');await B.page.evaluate(()=>window.__ironlog.flush());await wait(400);
console.log('cloud after B writes:',JSON.parse(JSON.parse(store.get('data/users/u1/s-2026-09-2')).json).sessions.map(s=>s.id));
await A.page.evaluate(()=>window.__ironlog.sync());await wait(500);
console.log('A after pull:',await A.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id)));
await add(A,'sA2');await A.page.evaluate(()=>window.__ironlog.flush());await wait(400);
console.log('cloud after A writes:',JSON.parse(JSON.parse(store.get('data/users/u1/s-2026-09-2')).json).sessions.map(s=>s.id));
await B.page.evaluate(()=>window.__ironlog.sync());await wait(500);
console.log('B after pull:',await B.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id)));
await browser.close();})();
