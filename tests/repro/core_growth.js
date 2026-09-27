// Daily bodyweights all live in the single core document. Past ~250 KB the flush
// throws too_big, which is retried forever as "offline"; nothing syncs again.
const {open}=require(require('path').join(__dirname,'..','h.js'));
const {cloudSetup,wait,store}=require('./cloud.js');const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const A=await open(P,{clock:'2026-09-20T10:00:00',setup:cloudSetup});await wait(800);
const r=await A.page.evaluate(()=>{const L=window.__ironlog;const d0=new Date(2019,0,1);
 for(let i=0;i<2800;i++){const d=new Date(d0);d.setDate(d.getDate()+i);const iso=d.toISOString().slice(0,10);L.state.bodyweights.push({id:Math.random().toString(36).slice(2,9)+'abcd',date:iso,kg:80+Math.random()*5,demo:false});}
 L.invalidate();return JSON.stringify(L.chunksOf(L.state).core).length;});
console.log('core bytes with 2800 daily weigh-ins (~7.7 years):',r);
await A.page.evaluate(()=>{const L=window.__ironlog;const R=L.state.routines[0];L.state.sessions.push({id:'new',date:'2026-09-18',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.invalidate();});
await A.page.evaluate(()=>window.__ironlog.flush());await wait(500);
console.log('status:',await A.page.evaluate(()=>({st:window.__ironlog.cloud.status,err:window.__ironlog.cloud.err,log:JSON.parse(localStorage.getItem('ironlog.v1.log')||'[]').slice(-1)})),'session chunk in cloud:',store.has('data/users/u1/s-2026-09-2'));
await A.browser.close();})();
