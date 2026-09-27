// Hostile ids that collide with Object.prototype keys: exercise id "__proto__",
// session exIds "constructor"/"toString". Check for crashes / NaN on screens.
const {open}=require(require('path').join(__dirname,'..','h.js'));const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const {browser,page,errors}=await open(P,{clock:'2026-09-20T10:00:00'});
const txt=await page.evaluate(()=>{const L=window.__ironlog;const s=JSON.parse(JSON.stringify(L.state));s.settings.onboarded=true;
 s.exercises.push({id:'__proto__',name:'Proto lift',primary:'chest',custom:true});
 const R=s.routines[0];
 for(const [i,x] of ['constructor','toString','hasOwnProperty','bench'].entries())s.sessions.push({id:'s'+i,date:'2026-09-1'+i,dayIdx:0,dayId:R.days[0].id,dayName:'D',routineId:R.id,ex:[{exId:x,sets:[{w:100,r:8,rir:1}]}]});
 return '{"state":'+JSON.stringify(s).replace('"id":"__proto__"','"id":"__proto__"')+'}';});
await page.evaluate(t=>window.__ironlog.importData(t),txt);await page.waitForTimeout(100);await page.click('[data-act="mOk"]');await page.waitForTimeout(200);
console.log('exercise ids kept:',await page.evaluate(()=>window.__ironlog.state.exercises.filter(e=>e.custom).map(e=>e.id)));
for(const tab of ['today','program','dash','history','settings']){await page.evaluate(t=>{const L=window.__ironlog;L.ui.tab=t;try{L.render();}catch(e){window.__err=(window.__err||[]).concat(t+': '+e.message);}document.querySelectorAll('details').forEach(d=>d.open=true);},tab);await page.waitForTimeout(250);
 const r=await page.evaluate(()=>({crash:!!document.querySelector('[data-act="crashRetry"]'),bad:(document.getElementById('view').innerText.match(/NaN|undefined|Infinity|function |\[object/g)||[]).slice(0,5),err:window.__err||[]}));console.log(tab,JSON.stringify(r));}
console.log('EX(toString).name:',await page.evaluate(()=>{window.__ironlog.invalidate();return String(window.__ironlog.state.sessions.length);}));
console.log('errors',errors.slice(0,6));
await browser.close();})();
