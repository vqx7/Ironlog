// Unbounded numeric fields survive normalize(): bodyweight kg and tape measurements.
const {open}=require(require('path').join(__dirname,'..','h.js'));const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const {browser,page}=await open(P,{clock:'2026-09-20T10:00:00'});
const txt=await page.evaluate(()=>{const L=window.__ironlog;const s=JSON.parse(JSON.stringify(L.state));s.settings.onboarded=true;const R=s.routines[0];
 s.bodyweights=[{date:'2026-09-10',kg:80},{date:'2026-09-18',kg:1e308}];s.measurements=[{date:'2026-09-10',waist:80},{date:'2026-09-18',waist:1e308,arm:1e308}];
 s.settings.heightCm=180;
 for(let i=0;i<4;i++)s.sessions.push({id:'s'+i,date:'2026-09-1'+(2*i+1),dayIdx:0,dayId:R.days[0].id,dayName:'D',routineId:R.id,ex:[{exId:'pullup',sets:[{w:10,r:8,rir:1}]},{exId:'bench',sets:[{w:100,r:8,rir:1}]}]});
 return JSON.stringify({state:s});});
await page.evaluate(t=>window.__ironlog.importData(t),txt);await page.waitForTimeout(100);await page.click('[data-act="mOk"]');await page.waitForTimeout(200);
console.log('stored bw:',await page.evaluate(()=>window.__ironlog.state.bodyweights.map(b=>b.kg)));
for(const tab of ['today','dash','history','settings']){await page.evaluate(t=>{const L=window.__ironlog;L.ui.tab=t;L.render();document.querySelectorAll('details').forEach(d=>d.open=true);},tab);await page.waitForTimeout(300);
 const r=await page.evaluate(()=>({crash:!!document.querySelector('[data-act="crashRetry"]'),bad:[...new Set(document.getElementById('view').innerText.match(/[^\n]{0,30}(NaN|Infinity|e\+\d+|\d{12,})[^\n]{0,20}/g)||[])].slice(0,4)}));console.log(tab,JSON.stringify(r));}
await browser.close();})();
