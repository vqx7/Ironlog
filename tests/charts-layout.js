// Charts, migration, week bar, height, layout overflow.
const {open}=require('./h');const fs=require('fs');
const fails=[];const ok=(c,m)=>{if(!c){fails.push(m);console.log('FAIL',m);}else console.log('ok  ',m);};
(async()=>{
const {chromium}=require('playwright');const browser=await chromium.launch();
// ---- A: young log (sessions only last week and this week), weekly routine
{
const {page,errors,ctx}=await open('index.html',{browser,clock:'2026-09-26T10:00:00'});
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{const L=window.__ironlog;const s=L.state;s.settings.onboarded=true;
  const R=s.routines[0];R.schedule='weekly';
  // Weekly: Mon..Sun = the 7 days (Rest on Sun)
  const mk=(date,di,exId,w,r)=>({id:'s'+date+di,date,dayIdx:di,dayId:R.days[di].id,dayName:R.days[di].name,routineId:R.id,notes:'',ex:[{exId,sets:[{w,r,rir:1},{w,r,rir:1},{w,r:r-1,rir:1}]}]});
  s.sessions.push(mk('2026-09-15',1,'pullup',20,8),mk('2026-09-21',0,'bench',100,8),mk('2026-09-22',1,'pullup',22,8),mk('2026-09-24',3,'seatedDbPress',40,8));
  s.bodyweights.push({id:'b1',date:'2026-09-20',kg:84},{id:'b2',date:'2026-09-25',kg:84.4});
  L.normalize.dropped=0;window.__ironlog.invalidate();L.ui.tab='today';L.render();});
await page.waitForTimeout(100);
const wk=await ev(()=>[...document.querySelectorAll('#wkbar .w')].map(c=>c.className.replace('w ','')+'|'+c.getAttribute('aria-label')));
wk.forEach(x=>console.log('   ',x));
ok(/on/.test(wk[0])&&/on/.test(wk[1])&&/miss/.test(wk[2])&&/on/.test(wk[3])&&/miss/.test(wk[4])&&/today/.test(wk[5])&&/plan/.test(wk[5])&&/rest/.test(wk[6]),'weekly bar states: trained, missed, today planned, rest');
// tap Sunday (rest, future) -> Today preview of day 6
await page.click('#wkbar .w:nth-child(7)');await page.waitForTimeout(50);
ok(await ev(()=>window.__ironlog.ui.todayDay===6&&/Viewing Sun/i.test(document.querySelector('.hero .eyebrow').innerText)),'tap future day previews it on Today');
// tap trained Tue -> History open
await page.click('#wkbar .w:nth-child(2)');await page.waitForTimeout(50);
ok(await ev(()=>window.__ironlog.ui.tab==='history'&&!!window.__ironlog.ui.histOpen),'tap trained day opens History');
// Stats charts
await ev(()=>{const L=window.__ironlog;L.ui.tab='dash';L.ui.volMode='trend';L.ui.dashMuscle='lats';L.ui.folds['dash:volume']=true;L.ui.folds['dash:exercise']=true;L.ui.folds['dash:body']=true;L.ui.dashEx='pullup';L.render();});
await page.waitForTimeout(200);
const ch=await ev(()=>{const g=id=>{const c=document.getElementById(id);const ch=c&&Chart.getChart(c);return ch;};
  const m=g('chMuscle'),e=g('chEx'),b=g('chBW');
  return {m:m&&m.data.labels,mData:m&&m.data.datasets[0].data,e:e&&{min:e.scales.x.min,max:e.scales.x.max,ticks:e.scales.x.ticks.map(t=>t.label)},b:b&&{min:b.scales.x.min,max:b.scales.x.max,ticks:b.scales.x.ticks.map(t=>t.label)}};});
console.log(JSON.stringify(ch));
ok(ch.m&&ch.m.length===8&&ch.m[0]==='Sep 14','muscle trend starts at first logged week (Sep 14)');
ok(ch.mData[2]===null&&ch.mData.slice(2).every(v=>v===null),'weeks ahead are empty, not zero');
ok(ch.e&&ch.e.min===0&&ch.e.max>=42,'e1RM chart starts at first session with room ahead');
ok(ch.b&&ch.b.min===0&&ch.b.max>=28,'bodyweight chart starts at first weigh-in');
// load chart
await ev(()=>{const L=window.__ironlog;L.ui.volMode='load';L.render();});await page.waitForTimeout(100);
const vl=await ev(()=>{const c=Chart.getChart(document.getElementById('chVol'));return c&&c.data.labels;});
ok(vl&&vl[0]==='Sep 14'&&vl[1]==='This wk','load chart starts at first week: '+JSON.stringify(vl));
// heat
const heat=await ev(()=>({n:document.querySelectorAll('.heat div').length,fut:document.querySelectorAll('.heat div.fut').length,first:document.querySelector('.heat div').getAttribute('data-tip')}));
ok(heat.n===84&&heat.first.startsWith('Mon, Sep 14'),'consistency grid starts at first week: '+JSON.stringify(heat));
ok(!(await ev(()=>!!document.querySelector('.chips.rng'))),'no range chips with young data');
await page.screenshot({path:'screenshots/n_stats_young.png',fullPage:true});
ok(!errors.length,'A: no console errors '+errors.join('|'));
await ctx.close();
}
// ---- B: long log (demo + older sessions) -> range chips
{
const {page,errors,ctx}=await open('index.html',{browser,clock:'2026-09-26T10:00:00'});
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.makeDemo();const R=L.state.routines[0];
  for(let k=0;k<30;k++){const d=new Date(2026,0,5+k*5);const iso=d.toISOString().slice(0,10);L.state.sessions.push({id:'old'+k,date:iso,dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:90+k*0.3,r:8,rir:1}]}]});}
  L.invalidate();L.ui.tab='dash';L.ui.volMode='trend';L.ui.dashMuscle='chest';L.ui.dashEx='bench';['volume','exercise','consistency'].forEach(k=>L.ui.folds['dash:'+k]=true);L.render();});
await page.waitForTimeout(200);
const r=await ev(()=>({chips:[...document.querySelectorAll('.chips.rng')].map(c=>c.innerText.replace(/\n/g,' ')),m:Chart.getChart(document.getElementById('chMuscle')).data.labels.length}));
console.log(JSON.stringify(r));
ok(r.chips.length>=3&&r.m===8,'range chips on long history, default 8 weeks');
await page.click('[data-act="chartRange"][data-id="muscle"][data-v="all"]');await page.waitForTimeout(100);
const all=await ev(()=>Chart.getChart(document.getElementById('chMuscle')).data.labels);
ok(all.length>30&&all[0]==='Jan 5','All shows from first week: '+all[0]+' ('+all.length+')');
const ex=await ev(()=>{const c=Chart.getChart(document.getElementById('chEx'));return {min:c.scales.x.min,max:c.scales.x.max,n:c.data.datasets[0].data.length,ticks:c.scales.x.ticks.length};});
ok(ex.min===0&&ex.ticks<=8,'e1RM All from first session, readable ticks '+JSON.stringify(ex));
await page.click('[data-act="chartRange"][data-id="ex"][data-v="base"]');await page.waitForTimeout(100);
const ex2=await ev(()=>{const c=Chart.getChart(document.getElementById('chEx'));return {min:c.scales.x.min,max:c.scales.x.max};});
ok(ex2.max-ex2.min<=8*7+28,'8 wk window on e1RM '+JSON.stringify(ex2));
await page.screenshot({path:'screenshots/n_stats_long.png',fullPage:true});
ok(!errors.length,'B: no console errors '+errors.join('|'));
await ctx.close();
}
// ---- C: migration from the previous build's saved state
{
const prev=await open('baselines/r11.html',{browser,clock:'2026-09-26T10:00:00'});
await prev.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.settings.priorities=['chest'];L.state.settings.heightCm=178;L.makeDemo();L.render();});
const saved=await prev.page.evaluate(()=>localStorage.getItem('ironlog.v1'));
await prev.ctx.close();
const v4=JSON.parse(saved);
ok(v4.version===4,'previous build saves v4');
const {page,errors,ctx}=await open('index.html',{browser,state:v4,clock:'2026-09-26T10:00:00'});
const ev=(f,a)=>page.evaluate(f,a);
const mg=await ev(()=>{const s=window.__ironlog.state;const e=id=>s.exercises.find(x=>x.id===id);return {v:s.version,n:s.sessions.length,push:e('deficitPushup').secondary,face:e('facePull').secondary,band:s.settings.bands.serratus,dbc:!!e('dbCurl'),pp:e('pushupPlus').primary,pri:s.settings.priorities,h:s.settings.heightCm};});
console.log(JSON.stringify(mg));
ok(mg.v===5&&mg.n===v4.sessions.length,'migrated to v5, sessions kept');
ok(mg.push.includes('serratus')&&mg.face.includes('rotatorCuff'),'secondaries gained new muscles');
ok(mg.band&&mg.band[0]===2,'new band defaults');ok(mg.dbc&&mg.pp==='serratus','new library entries present');ok(mg.pri[0]==='chest'&&mg.h===178,'settings kept');
// old-client corruption repair: pushupPlus reset to chest in a v4 doc
const bad=JSON.parse(JSON.stringify(v4));bad.exercises.push({id:'pushupPlus',name:'Push-up Plus',primary:'chest',secondary:['triceps'],equip:'bodyweight',bw:true,custom:false});
await ev(b=>{const s=window.__ironlog.normalize(b);window.__r=s.exercises.find(x=>x.id==='pushupPlus');},bad);
const rp=await ev(()=>window.__r);ok(rp.primary==='serratus'&&rp.secondary.includes('chest'),'repairs a built-in reset by an older build '+JSON.stringify(rp));
// idempotent: normalizing v5 again changes nothing
const same=await ev(()=>{const L=window.__ironlog;const a=JSON.stringify(L.normalize(JSON.parse(JSON.stringify(L.state))));const b=JSON.stringify(L.normalize(JSON.parse(a)));return a===b;});
ok(same,'normalize is idempotent on v5');
// height appears once
const hc=[];for(const t of ['today','program','dash','history','settings']){await ev(t=>{const L=window.__ironlog;L.ui.tab=t;Object.keys(L.ui.folds).forEach(k=>delete L.ui.folds[k]);L.ui.folds['today:body']=true;L.ui.folds['today:tape']=true;L.ui.folds['settings:general']=true;L.render();document.querySelectorAll('details').forEach(d=>d.open=true);},t);hc.push(await ev(()=>document.querySelectorAll('[data-bind="height"]').length));}
ok(hc.join(',')==='1,0,0,0,0','height field appears once (Today > Body > Tape): '+hc.join(','));
ok(!errors.length,'C: no console errors '+errors.join('|'));
await ctx.close();
}
// ---- D: layout at phone widths, every tab, light and dark
for(const w of [320,375,390,430,768]){
  const {page,errors,ctx}=await open('index.html',{browser,w,h:800,dark:w===375,clock:'2026-09-26T10:00:00'});
  const ev=(f,a)=>page.evaluate(f,a);
  await ev(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.makeDemo();L.render();});
  for(const t of ['today','program','dash','history','settings']){
    await ev(t=>{const L=window.__ironlog;L.ui.tab=t;L.render();document.querySelectorAll('details').forEach(d=>d.open=true);},t);await page.waitForTimeout(60);
    const o=await ev(()=>({sw:document.documentElement.scrollWidth,iw:window.innerWidth,hb:document.querySelector('.top').getBoundingClientRect().height,cells:[...document.querySelectorAll('#wkbar .w')].map(c=>c.getBoundingClientRect()).every(r=>r.width>=18),ss:document.querySelector('#saveState').getBoundingClientRect().right<=window.innerWidth}));
    const crash=await ev(()=>document.body.innerText.includes('Something broke'));ok(!crash,`${w}px ${t}: renders`);
    ok(o.sw<=o.iw&&o.cells&&o.ss,`${w}px ${t}: no overflow (${o.sw}/${o.iw}), header ${o.hb}px`);
  }
  // logger
  await ev(()=>{const L=window.__ironlog;L.ui.tab='today';L.render();document.querySelector('.hero [data-act="startSession"]').click();});
  await page.waitForTimeout(80);
  const o=await ev(()=>({sw:document.documentElement.scrollWidth,iw:window.innerWidth}));ok(o.sw<=o.iw,`${w}px logger no overflow`);
  if(w===320||w===375||w===768){await ev(()=>window.scrollTo(0,0));await page.screenshot({path:`screenshots/n_log_${w}.png`});}
  ok(!errors.length,`${w}: no console errors `+errors.join('|'));
  await ctx.close();
}
console.log(fails.length?'FAILURES '+fails.length:'ALL PASS');await browser.close();})();
