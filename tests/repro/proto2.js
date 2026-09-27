// Isolate: (a) only session exId "constructor" (no __proto__ exercise); (b) only a "__proto__" exercise id.
const {open}=require(require('path').join(__dirname,'..','h.js'));const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
for(const mode of ['ctorOnly','protoOnly','ctorViaUI']){
const {browser,page}=await open(P,{clock:'2026-09-20T10:00:00'});
const txt=await page.evaluate(mode=>{const L=window.__ironlog;const s=JSON.parse(JSON.stringify(L.state));s.settings.onboarded=true;const R=s.routines[0];
 if(mode==='protoOnly')s.exercises.push({id:'__proto__',name:'Proto lift',primary:'chest',custom:true});
 s.sessions.push({id:'s1',date:'2026-09-18',dayIdx:0,dayId:R.days[0].id,dayName:'D',routineId:R.id,ex:[{exId:mode==='protoOnly'?'bench':'constructor',sets:[{w:100,r:8,rir:1}]}]});
 return JSON.stringify({state:s});},mode);
await page.evaluate(t=>window.__ironlog.importData(t),txt);await page.waitForTimeout(100);await page.click('[data-act="mOk"]');await page.waitForTimeout(200);
const out=[];
for(const tab of ['today','dash','history']){await page.evaluate(t=>{const L=window.__ironlog;L.ui.tab=t;L.render();},tab);await page.waitForTimeout(200);out.push(tab+':'+(await page.evaluate(()=>!!document.querySelector('[data-act="crashRetry"]'))));}
const log=await page.evaluate(()=>JSON.parse(localStorage.getItem('ironlog.v1.log')||'[]').map(x=>x.a+': '+x.m).slice(-2));
console.log(mode,out.join(' '),JSON.stringify(log));
await browser.close();}
})();
