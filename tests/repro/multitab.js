// Two tabs of the app in one browser (same localStorage). Tab A logs a session;
// tab B, opened earlier, then changes any setting. Reload: A's session is gone.
const {open}=require(require('path').join(__dirname,'..','h.js'));const path=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const A=await open(path,{clock:'2026-09-20T10:00:00'});
const B=await A.ctx.newPage();await B.goto('file://'+path);await B.waitForFunction(()=>window.__ironlog);
await A.page.evaluate(()=>{const L=window.__ironlog;const R=L.state.routines[0];L.state.sessions.push({id:'sA',date:'2026-09-20',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.ACT.undo&&0;});
await A.page.evaluate(()=>{window.__ironlog.invalidate();});
// commit via a real action path: toggle deload twice is heavy; use the ACT that commits
await A.page.evaluate(()=>{const L=window.__ironlog;L.ACT.deloadToggle();L.ACT.deloadToggle();});
console.log('A sessions in localStorage after A save:',await A.page.evaluate(()=>JSON.parse(localStorage.getItem('ironlog.v1')).sessions.map(s=>s.id)));
// Tab B does an ordinary edit (deload toggle -> commit)
await B.evaluate(()=>{const L=window.__ironlog;L.ACT.deloadToggle();});
console.log('localStorage after B edit:',await B.evaluate(()=>JSON.parse(localStorage.getItem('ironlog.v1')).sessions.map(s=>s.id)));
await A.page.close();
const C=await A.ctx.newPage();await C.goto('file://'+path);await C.waitForFunction(()=>window.__ironlog);
console.log('fresh tab after A closed, sessions:',await C.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id)));
await A.browser.close();})();
