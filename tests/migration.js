// Migration: saves made by the two previous builds load with nothing lost.
const {open}=require('./h');const {chromium}=require('playwright');
const fails=[];const ok=(c,m,x)=>{if(!c){fails.push(m);console.log('FAIL',m,JSON.stringify(x));}else console.log('ok  ',m,x!==undefined?JSON.stringify(x).slice(0,200):'');};
(async()=>{const browser=await chromium.launch();
for(const [file,label] of [['baselines/r29-5.html','r29.5 (current live)'],['baselines/r29.html','r29.4'],['baselines/r28.html','r28'],['baselines/r27.html','r27'],['baselines/r26.html','r26'],['baselines/r25.html','r25'],['baselines/r24.html','r24'],['baselines/r23.html','r23'],['baselines/r22.html','r22'],['baselines/r21.html','r21'],['baselines/r20.html','r20'],['baselines/r19.html','r19'],['baselines/r18.html','r18'],['baselines/r17.html','r17'],['baselines/r16.html','r16'],['baselines/r15.html','r15'],['baselines/r14.html','r14'],['baselines/r13.html','r13'],['baselines/r12.html','r12'],['baselines/r11.html','r11']]){
  const P=await open(file,{browser,clock:'2026-09-26T10:00:00'});
  await P.page.evaluate(()=>{const L=window.__ironlog;const s=L.state;s.settings.onboarded=true;s.settings.priorities=['chest','biceps'];s.settings.heightCm=178;s.settings.bands.biceps=[12,22];
    s.exercises.push({id:'c_x',name:'My Curl',primary:'biceps',secondary:['forearms'],equip:'dumbbell',bw:false,custom:true,archived:false,note:'x'});
    s.priors=[{id:'p1',exId:'bench',w:140,r:5,note:''},{id:'p2',exId:'dbCurl',w:20,r:15,note:''}].filter(p=>s.exercises.some(e=>e.id===p.exId));
    s.injuries=[{id:'j',m:'triceps',note:'',date:'2026-09-20'}];L.makeDemo();
    s.draft=null;L.render();});
  await P.page.waitForTimeout(500);
  const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  const old=JSON.parse(raw);
  const N=await open('index.html',{browser,state:old,clock:'2026-09-26T10:00:00'});
  const r=await N.page.evaluate(()=>{const s=window.__ironlog.state;return {v:s.version,n:s.sessions.length,sets:s.sessions.reduce((a,x)=>a+x.ex.reduce((b,e)=>b+e.sets.length,0),0),ex:s.exercises.length,cx:!!s.exercises.find(e=>e.id==='c_x'),pri:s.settings.priorities,h:s.settings.heightCm,band:s.settings.bands.biceps,priors:s.priors===undefined?0:(s.priors||[]).length,priorsRaw:JSON.parse(localStorage.getItem('ironlog.v1')||'{}').priors,inj:s.injuries.length,crash:document.body.innerText.includes('Something broke')};});
  const oldSets=old.sessions.reduce((a,x)=>a+x.ex.reduce((b,e)=>b+e.sets.length,0),0);
  ok(r.v===5&&r.n===old.sessions.length&&r.sets===oldSets,`${label}: every session and set kept`,[r.n,r.sets,oldSets]);
  ok(r.cx&&r.pri.join()==='chest,biceps'&&r.h===178&&r.band.join()==='12,22'&&r.inj===1,`${label}: custom exercise, settings, bands, injuries kept`,r);
  ok(old.priors.length>0&&r.priors===0,`${label}: saved former bests (retired Comeback) are dropped on load`,[old.priors.length,r.priors]);
  ok(!r.crash,`${label}: renders`);
  for(const t of ['today','program','dash','history','settings']){const c=await N.page.evaluate(t=>{const L=window.__ironlog;L.ui.tab=t;L.render();document.querySelectorAll('details').forEach(d=>d.open=true);return document.body.innerText.includes('Something broke');},t);if(c)ok(false,`${label}: ${t} crashed`);}
  ok(!N.errors.length,`${label}: no console errors`,N.errors);
  await N.ctx.close();
}
console.log(fails.length?'FAILURES '+fails.length:'ALL PASS');await browser.close();})();
