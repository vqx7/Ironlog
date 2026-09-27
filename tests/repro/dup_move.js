// A moves session S to another half-month (date edit); B edits S's notes offline.
// Per-chunk merge keeps B's copy in the old chunk and A's copy in the new one;
// normalize() never dedupes by id, so S exists twice for good.
const {open}=require(require('path').join(__dirname,'..','h.js'));const {chromium}=require('playwright');
const {cloudSetup,wait}=require('./cloud.js');const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{const browser=await chromium.launch();
const A=await open(P,{browser,clock:'2026-09-20T10:00:00',setup:cloudSetup});
const B=await open(P,{browser,clock:'2026-09-20T10:00:00',setup:cloudSetup});await wait(800);
await A.page.evaluate(()=>{const L=window.__ironlog;const R=L.state.routines[0];L.state.sessions.push({id:'S',date:'2026-09-18',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.invalidate();});
await A.page.evaluate(()=>window.__ironlog.flush());await wait(300);
await B.page.evaluate(()=>window.__ironlog.sync());await wait(500);
await A.page.evaluate(()=>{const L=window.__ironlog;L.state.sessions.find(s=>s.id==='S').date='2026-09-12';L.invalidate();});
await A.page.evaluate(()=>window.__ironlog.flush());await wait(400);
await B.page.evaluate(()=>{const L=window.__ironlog;L.state.sessions.find(s=>s.id==='S').notes='B note';L.invalidate();});
await B.page.evaluate(()=>window.__ironlog.sync());await wait(800);
await A.page.evaluate(()=>window.__ironlog.sync());await wait(800);
for(const [n,X] of [['A',A],['B',B]])console.log(n,await X.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id+'@'+s.date+':'+s.notes)));
await B.page.reload();await B.page.waitForFunction(()=>window.__ironlog);await wait(1500);
console.log('B after reload',await B.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id+'@'+s.date+':'+s.notes)));
await browser.close();})();
