// Hostile backup: every free-text and id field carries an HTML/attribute breakout.
// Import it, visit every tab, open sessions, a draft, modals; look for injected nodes.
const {open}=require(require('path').join(__dirname,'..','h.js'));const P=require('path').join(__dirname,'..','..','index.html');
const X=t=>`${t}"'><img src=x data-xss="${t}" onerror="window.__x=(window.__x||[]).concat('${t}')">`;
(async()=>{
const {browser,page,errors}=await open(P,{clock:'2026-09-20T10:00:00'});
const txt=await page.evaluate(X=>{const X2=t=>eval('('+X+')')(t);const L=window.__ironlog;const s=JSON.parse(JSON.stringify(L.state));
  s.settings.onboarded=true;
  s.exercises.push({id:X2('exid'),name:X2('exname'),primary:'chest',secondary:[],equip:X2('equip'),note:X2('exnote'),custom:true});
  const eid=X2('exid');
  const R=s.routines[0];R.name=X2('rname');R.id=X2('rid');s.activeRoutineId=R.id;R.days[0].name=X2('dname');R.days[0].id=X2('did');R.days[0].items.unshift({uid:X2('uid'),exId:eid,sets:3,repMin:8,repMax:12,rir:1,rest:90,inc:2.27,ss:X2('ss')});
  for(let i=0;i<6;i++)s.sessions.push({id:X2('sid'+i),date:'2026-09-'+(10+i),dayIdx:0,dayId:R.days[0].id,dayName:X2('sdn'),routineId:R.id,notes:X2('snotes'),ex:[{exId:eid,note:X2('bnote'),sets:[{w:100,r:8,rir:2},{w:100+i*3,r:8,rir:1}]},{exId:'bench',note:X2('bnote2'),sets:[{w:80+i,r:8,rir:1}]}]});
  s.cardio=[{id:X2('cid'),date:'2026-09-15',kind:'walk',min:20,note:X2('cnote')}];
  s.injuries=[{id:X2('jid'),m:'chest',note:X2('jnote'),date:'2026-09-15'}];
  s.priors=[{id:X2('pid'),exId:eid,w:120,r:5,note:X2('pnote')}];
  s.bodyweights=[{id:X2('bwid'),date:'2026-09-15',kg:80}];
  s.measurements=[{id:X2('mid'),date:'2026-09-15',waist:80}];
  s.trash=[{id:X2('tid'),kind:'session',date:'2026-09-19',data:{id:X2('tid'),date:'2026-09-01',dayName:X2('tdn'),ex:[]}},{id:X2('trid'),kind:'routine',date:'2026-09-19',data:{name:X2('trname'),days:[]}}];
  s.settings.secOrder={today:[X2('so')]};s.settings.folds=[X2('fold')];
  return JSON.stringify({app:'ironlog',state:s});},X.toString());
await page.evaluate(t=>window.__ironlog.importData(t),txt);await page.waitForTimeout(100);await page.click('[data-act="mOk"]');await page.waitForTimeout(200);
const check=async lab=>{const r=await page.evaluate(()=>({nodes:[...document.querySelectorAll('[data-xss]')].map(n=>n.getAttribute('data-xss')),fired:window.__x||[]}));console.log(lab.padEnd(14),JSON.stringify(r));};
for(const tab of ['today','program','dash','history','settings']){await page.evaluate(t=>{const L=window.__ironlog;L.ui.tab=t;L.render();document.querySelectorAll('details').forEach(d=>d.open=true);},tab);await page.waitForTimeout(300);await check(tab);}
// open each history session
const ids=await page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id));
for(const id of ids.slice(0,2)){await page.evaluate(id=>{const L=window.__ironlog;L.ui.tab='history';L.ui.histOpen=id;L.render();document.querySelectorAll('details').forEach(d=>d.open=true);},id);await page.waitForTimeout(200);}
await check('history-open');
// start the payload day and open modals
await page.evaluate(()=>{const L=window.__ironlog;L.ui.tab='today';L.ui.todayDay=0;L.render();});
await page.click('.hero [data-act="startSession"]:not([data-light])').catch(e=>console.log('start fail',e.message.slice(0,80)));await page.waitForTimeout(300);await check('logger');
await page.evaluate(()=>{const L=window.__ironlog;L.ACT.bMenu({dataset:{b:0}});});await page.waitForTimeout(150);await check('bmenu');
await page.evaluate(()=>{const L=window.__ironlog;L.ACT.bMenuDo({dataset:{op:'bSwap',b:0}});});await page.waitForTimeout(250);await check('swap');
await page.evaluate(()=>{const L=window.__ironlog;L.ui.modal=null;L.render();const d=L.state.draft;d.ex[0].sets[0]={...d.ex[0].sets[0],w:50,r:8,done:true};d._rampAsked=true;L.ACT.finishNow();});await page.waitForTimeout(300);await check('recap');
await page.evaluate(()=>{const L=window.__ironlog;L.ui.modal=null;L.ui.tab='program';L.render();const e=L.state.exercises.find(x=>x.custom);L.ACT.exEdit({dataset:{ex:e.id}});});await page.waitForTimeout(250);await check('exEdit');
console.log('errors',errors.slice(0,5));
await browser.close();})();
