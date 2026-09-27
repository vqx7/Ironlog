// If the local save cannot be read at boot, load() starts fresh but keeps the
// sync metadata. The flush then treats the empty fresh state as local edits and
// overwrites every cloud document: the durable copy is wiped too.
const {open}=require(require('path').join(__dirname,'..','h.js'));
const {cloudSetup,wait,store}=require('./cloud.js');const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const A=await open(P,{clock:'2026-09-20T10:00:00',setup:cloudSetup});await wait(800);
await A.page.evaluate(()=>{const L=window.__ironlog;const R=L.state.routines[0];for(const id of ['s1','s2'])L.state.sessions.push({id,date:'2026-09-18',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.state.routines[0].name='My routine';L.invalidate();});
await A.page.evaluate(()=>window.__ironlog.flush());await wait(400);
const cl=()=>({sessions:JSON.parse(JSON.parse(store.get('data/users/u1/s-2026-09-2')).json).sessions.map(s=>s.id),routine:JSON.parse(JSON.parse(store.get('data/users/u1/core')).json).routines[0].name});
console.log('cloud before:',JSON.stringify(cl()));
await A.page.evaluate(()=>localStorage.setItem('ironlog.v1','{"version":5,"sessions":[{"id"'));// truncated save
await A.page.reload();await A.page.waitForFunction(()=>window.__ironlog);await wait(2500);
console.log('local after reload:',await A.page.evaluate(()=>window.__ironlog.state.sessions.length));
console.log('cloud after:',JSON.stringify(cl()));
await A.browser.close();})();
