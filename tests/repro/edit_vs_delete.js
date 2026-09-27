// Device B edits session S while device A deletes it. The chunk merge keeps
// B's edited copy (documented: "changed on one side and deleted on the other is kept"),
// but the trash tombstone from core then drops it in normalize().
const {open}=require(require('path').join(__dirname,'..','h.js'));const {chromium}=require('playwright');
const {cloudSetup,wait}=require('./cloud.js');const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{const browser=await chromium.launch();
const A=await open(P,{browser,clock:'2026-09-20T10:00:00',setup:cloudSetup});
const B=await open(P,{browser,clock:'2026-09-20T10:00:00',setup:cloudSetup});await wait(800);
await A.page.evaluate(()=>{const L=window.__ironlog;const R=L.state.routines[0];L.state.sessions.push({id:'S',date:'2026-09-18',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.invalidate();});
await A.page.evaluate(()=>window.__ironlog.flush());await wait(300);
await B.page.evaluate(()=>window.__ironlog.sync());await wait(500);
// A deletes S through the real handler path (toTrash + filter + commit)
await A.page.evaluate(()=>{const L=window.__ironlog;L.ui.tab='history';L.ui.histOpen='S';L.render();});
await A.page.click('[data-act="histDel"]');await A.page.click('[data-act="mOk"]');await wait(100);
await A.page.evaluate(()=>window.__ironlog.flush());await wait(400);
// B edits S offline (changes reps 8 -> 10, note) and saves
await B.page.evaluate(()=>{const L=window.__ironlog;const s=L.state.sessions.find(x=>x.id==='S');s.ex[0].sets[0].r=10;s.notes='edited on B';L.invalidate();});
await B.page.evaluate(()=>window.__ironlog.sync());await wait(800);
const r=await B.page.evaluate(()=>({sessions:window.__ironlog.state.sessions.map(s=>s.id+':'+s.notes),trash:window.__ironlog.state.trash.map(t=>t.id+':'+t.data.notes)}));
console.log('B after sync:',JSON.stringify(r));
await browser.close();})();
