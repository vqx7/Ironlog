// Data flow: storage, reload, draft recovery, backup round trip, CSV, trash,
// undo, and two devices syncing through a shared (mock) cloud store.
const {open}=require('./h');const { engine } = require('./h');
const fails=[];const ok=(c,m,x)=>{if(!c){fails.push(m);console.log('FAIL',m,x!==undefined?JSON.stringify(x):'');}else console.log('ok  ',m,x!==undefined?JSON.stringify(x).slice(0,160):'');};
const store=new Map();
const cloudSetup=async(ctx,page)=>{
  await page.exposeFunction('__dbGet',p=>store.has(p)?store.get(p):null);
  await page.exposeFunction('__dbSet',(p,v)=>{store.set(p,v);return true;});
  await page.exposeFunction('__dbList',p=>JSON.stringify([...store.entries()].filter(([k])=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/')).map(([k,v])=>[k.slice(p.length+1),v])));
  await page.addInitScript(()=>{window.claude={use:async k=>{
    if(k==='user')return {id:async()=>'u1'};
    if(k==='db')return {doc:p=>({get:async()=>{const v=await window.__dbGet(p);return v==null?{exists:false,data:()=>null}:{exists:true,data:()=>JSON.parse(v)};},set:async o=>{await window.__dbSet(p,JSON.stringify(o));return true;}}),collection:p=>({get:async()=>{const l=JSON.parse(await window.__dbList(p));return {docs:l.map(([id,v])=>({id,exists:true,data:()=>JSON.parse(v)}))};}})};
    return null;}};});
};
(async()=>{const browser=await engine.launch();
// ---- 1. log a session through the UI, reload, it is there; draft survives reload
{
const {page,errors,ctx}=await open('index.html',{browser,clock:'2026-09-26T10:00:00'});
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.render();});
await page.click('.hero [data-act="startSession"]:not([data-light])');
await page.fill('[data-f="w"][data-b="0"][data-s="0"]','185');await page.fill('[data-f="r"][data-b="0"][data-s="0"]','8');
await page.click('.rirb[data-b="0"][data-s="0"]');await page.click('.rirstrip [data-v="2"]');
await page.click('[data-act="sDone"][data-b="0"][data-s="0"]');
await page.waitForTimeout(600);
await page.reload();await page.waitForFunction(()=>window.__ironlog);
const dr=await ev(()=>{const d=window.__ironlog.state.draft;return d&&{w:d.ex[0].sets[0].w,r:d.ex[0].sets[0].r,rir:d.ex[0].sets[0].rir,done:d.ex[0].sets[0].done};});
ok(dr&&Math.abs(dr.w-185*0.45359237)<1e-6&&dr.r===8&&dr.rir===2&&dr.done,'draft survives a reload with every field',dr);
await ev(()=>{window.__ironlog.state.draft._rampAsked=true;window.__ironlog.ACT.finishNow();});await page.waitForTimeout(200);
await page.reload();await page.waitForFunction(()=>window.__ironlog);
const sv=await ev(()=>{const s=window.__ironlog.state.sessions;return {n:s.length,sets:s[0]&&s[0].ex.length,w:s[0]&&s[0].ex[0].sets[0].w,draft:window.__ironlog.state.draft};});
ok(sv.n===1&&sv.sets===1&&sv.draft===null,'finished session persists; draft cleared',sv);
// ---- 2. backup text round trip into a fresh device
const txt=await ev(()=>JSON.stringify({app:'ironlog',state:window.__ironlog.state}));
const b=await open('index.html',{browser,clock:'2026-09-26T10:00:00'});
await b.page.evaluate(t=>window.__ironlog.importData(t),txt);await b.page.waitForTimeout(100);
await b.page.click('[data-act="mOk"]');await b.page.waitForTimeout(200);
const same=await b.page.evaluate(()=>JSON.stringify(window.__ironlog.state.sessions));
const orig=await ev(()=>JSON.stringify(window.__ironlog.state.sessions));
ok(same===orig,'backup import restores sessions exactly');
const bad=await b.page.evaluate(()=>{window.__ironlog.importData('{"state":{"exercises":[],"routines":[],"sessions":[{}]}}');return document.getElementById('toast').innerText;});
ok(/No readable sessions/.test(bad),'damaged backup refused with a message',bad);
await b.ctx.close();
// ---- 3. CSV export: columns and load meaning
const [dl]=await Promise.all([page.waitForEvent('download'),ev(()=>window.__ironlog.exportCSV())]);
const csv=require('fs').readFileSync(await dl.path(),'utf8').split('\r\n');
await page.waitForTimeout(100);ok(await ev(()=>window.__ironlog.ui.modal&&window.__ironlog.ui.modal.kind==='confirm'),'asks whether the file downloaded');await page.click('[data-act="mClose"]');
ok(csv[0].includes('load_entry')&&csv[1].includes('total, bar included'),'CSV carries the load meaning',csv.slice(0,2));
// Each row says its load as typed and its unit (390's Release B): a set typed in kg in an lb app, bench marked kg, comes
// back from the CSV as typed, 100 kg, not the 220.5 lb its load column rounds to.
{
await ev(()=>{const L=window.__ironlog;const s=L.state.sessions[0];const b=s.ex[0];L.state.exercises.find(e=>e.id===b.exId).unit='kg';b.sets=[{...b.sets[0],w:100,u:'kg'},{...b.sets[0],w:135*0.45359237,u:'lb'}];s.ex.push({exId:'assistPullup',rr:[6,10],ps:1,sets:[{w:-20,r:8,rir:2,done:true,u:'kg'}]});L.invalidate();L.saveNow();});
const [dl2]=await Promise.all([page.waitForEvent('download'),ev(()=>window.__ironlog.exportCSV())]);
const text=require('fs').readFileSync(await dl2.path(),'utf8');
await page.waitForTimeout(100);await page.click('[data-act="mClose"]');
const back=await ev(text=>{const L=window.__ironlog;const rows=L.impRows(text);const h=rows[0];const i=h.indexOf('typed_load'),j=h.indexOf('typed_unit'),k=h.indexOf('load_lb');const r=L.impFromTable(rows,L.impHeader(rows[0]));const sets=[...r.sessions[0].items.values()][0].sets;
  const help=[...r.sessions[0].items.values()].flatMap(it=>it.sets).find(x=>x.w<0)||null;
  return {cells:rows.slice(1,3).map(x=>[x[k],x[i],x[j]]),first:{w:sets[0].w,u:sets[0].u},second:{w:sets[1].w,u:sets[1].u},help:help&&{w:help.w,u:help.u}};},text);
ok(JSON.stringify(back.cells[0])==='["220.5","100","kg"]'&&back.cells[1][2]==='lb'&&back.cells[1][0]===back.cells[1][1]&&back.first.w===100&&back.first.u==='kg'&&back.second.u==='lb',
  'CSV: each row gives its load as typed and its unit (100 kg beside 220.5 in load_lb; 135 lb typed in lb on the same lift), and reads back as typed',back);
ok(back.help&&back.help.w===-20&&back.help.u==='kg','CSV: an assisted lift\'s help typed in kg (-20 kg) reads back as typed, never -20.003 kg from the lb column',back.help);
}
// A machine lift done on two machines (390 C): each row names its machine, and a file read back into an empty log keeps
// each machine's sessions together, so the lift reads the same from it; a lift on one machine names none. On pages of
// its own, so the log the sections below read is left as it is.
{
const LB=0.45359237;
const P1=await open('index.html',{browser,clock:'2026-10-20T10:00:00'});
await P1.page.evaluate(LB=>{const L=window.__ironlog;L.state.settings.onboarded=true;const mk=(id,date,w,more)=>({id,date,dayIdx:0,dayId:null,dayName:'Push',routineId:'',free:true,notes:'',ex:[{exId:'machPress',note:'',rr:[8,12],sets:[11,11,10].map(r=>({w:w*LB,r,rir:2,done:true})),...more},{exId:'bench',note:'',rr:[6,10],sets:[{w:185*LB,r:8,rir:2,done:true}]}]});
  L.state.sessions=[mk('a1','2026-10-01',200,{}),mk('a2','2026-10-08',140,{nw:true}),mk('a3','2026-10-15',200,{mc:'0'})];L.state=L.normalize(L.state);L.invalidate();L.saveNow();},LB);
const [dl3]=await Promise.all([P1.page.waitForEvent('download'),P1.page.evaluate(()=>window.__ironlog.exportCSV())]);
const text3=require('fs').readFileSync(await dl3.path(),'utf8');
await P1.ctx.close();
const P2=await open('index.html',{browser,clock:'2026-10-20T10:00:00',realStarter:true});
const got=await P2.page.evaluate(async t=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.saveNow();L.impStart({text:t});await new Promise(r=>setTimeout(r,300));L.ACT.impGo();await new Promise(r=>setTimeout(r,300));
  const rows=L.impRows(t);const m=rows[0].indexOf('machine'),e=rows[0].indexOf('exercise');
  const by=L.state.sessions.slice().sort((a,b)=>a.date<b.date?-1:1).map(s=>s.ex.find(b=>b.exId==='machPress')).map(b=>b&&b.mc||null);
  const mks=(L.IDX().byEx.machPress||[]).map(x=>x.mk);
  return {col:[...new Set(rows.slice(1).filter(r=>r[e]==='Machine Chest Press').map(r=>r[m]))],bench:[...new Set(rows.slice(1).filter(r=>r[e]==='Barbell Bench Press').map(r=>r[m]))],by,mks};},text3);
ok(JSON.stringify(got.col)==='["2026-10-01","2026-10-08"]'&&JSON.stringify(got.bench)==='[""]','CSV: each chest press row names its machine by the day it was first used; the bench, on one, names none',got);
ok(got.by[0]&&got.by[0]===got.by[2]&&got.by[1]&&got.by[1]!==got.by[0]&&got.mks.length===3&&got.mks[0]===got.mks[2]&&got.mks[1]!==got.mks[0],'CSV read back into an empty log: the two 200 lb sessions on one machine, the 140 lb one on the other',got);
await P2.ctx.close();
}
/* The machine column names each machine by the name the lifter gave it, a machine with none by the day it was first
   used, and a lift on one named machine by that name (2.74, the full review's L4-14). Read back into an empty log, the
   names come with the machines; into a log whose lift has machines of those names, each session joins its machine. */
{
const LB=0.45359237;
const seedQ=LB=>{const L=window.__ironlog;L.state.settings.onboarded=true;const mk=(id,date,exId,w,more)=>({id,date,dayIdx:0,dayId:null,dayName:'Push',routineId:'',free:true,notes:'',ex:[{exId,note:'',rr:[8,12],sets:[11,11,10].map(r=>({w:w*LB,r,rir:2,done:true})),...more}]});
  L.state.sessions=[mk('a1','2026-10-01','machPress',200,{}),mk('a2','2026-10-08','machPress',140,{nw:true,mc:'a2'}),mk('a3','2026-10-15','machPress',200,{mc:'0'}),mk('a4','2026-10-17','machPress',90,{nw:true,mc:'a4'}),mk('p1','2026-10-02','pecDeck',120,{}),mk('p2','2026-10-09','pecDeck',125,{})];
  const nm=(id,m)=>{L.state.exercises.find(e=>e.id===id).machines=m;};nm('machPress',{0:'Cybex',a2:'Hammer'});nm('pecDeck',{0:'Life Fitness'});
  L.state=L.normalize(L.state);L.invalidate();L.saveNow();};
const P1=await open('index.html',{browser,clock:'2026-10-20T10:00:00'});
await P1.page.evaluate(seedQ,LB);
const [dl4]=await Promise.all([P1.page.waitForEvent('download'),P1.page.evaluate(()=>window.__ironlog.exportCSV())]);
const text4=require('fs').readFileSync(await dl4.path(),'utf8');
await P1.ctx.close();
const cols=await (async()=>{const P=await open('index.html',{browser,clock:'2026-10-20T10:00:00'});const c=await P.page.evaluate(t=>{const L=window.__ironlog;const rows=L.impRows(t);const m=rows[0].indexOf('machine'),e=rows[0].indexOf('exercise'),d=rows[0].indexOf('date');const of=n=>[...new Set(rows.slice(1).filter(r=>r[e]===n).map(r=>r[d]+' '+r[m]))];return {press:of('Machine Chest Press'),pec:of('Pec Deck Fly')};},text4);await P.ctx.close();return c;})();
ok(JSON.stringify(cols.press)==='["2026-10-01 Cybex","2026-10-08 Hammer","2026-10-15 Cybex","2026-10-17 2026-10-17"]'&&JSON.stringify(cols.pec)==='["2026-10-02 Life Fitness","2026-10-09 Life Fitness"]','CSV: each machine named by the name given it (Cybex, Hammer), one with none by the day it was first used, and a lift on its one named machine by that name (L4-14)',cols);
// Read back into an empty log: the machines come with their names, each machine's sessions together.
const P2=await open('index.html',{browser,clock:'2026-10-20T10:00:00',realStarter:true});
const named=async P=>P.page.evaluate(()=>{const L=window.__ironlog;const out={};for(const id of ['machPress','pecDeck']){const e=L.state.exercises.find(x=>x.id===id);const nm=(e&&e.machines)||{};out[id]=(L.IDX().byEx[id]||[]).map(x=>x.date+' '+(nm[x.mk]||'-'));}return out;});
await P2.page.evaluate(async t=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.saveNow();L.impStart({text:t});await new Promise(r=>setTimeout(r,300));L.ACT.impGo();await new Promise(r=>setTimeout(r,300));if(L.ui.modal)L.ACT.mClose();},text4);
const empty=await named(P2);
ok(JSON.stringify(empty.machPress)==='["2026-10-01 Cybex","2026-10-08 Hammer","2026-10-15 Cybex","2026-10-17 -"]'&&JSON.stringify(empty.pecDeck)==='["2026-10-02 Life Fitness","2026-10-09 Life Fitness"]','CSV read back into an empty log: each session on its machine, by the name the file gives it; the machine with none has none',empty);
await P2.ctx.close();
// Read back into a log whose chest press has a Cybex and a Hammer of its own (other keys) and whose pec deck has its Life Fitness.
const P3=await open('index.html',{browser,clock:'2026-10-20T10:00:00',realStarter:true});
await P3.page.evaluate(LB=>{const L=window.__ironlog;L.state.settings.onboarded=true;const mk=(id,date,exId,w,more)=>({id,date,dayIdx:0,dayId:null,dayName:'Push',routineId:'',free:true,notes:'',ex:[{exId,note:'',rr:[8,12],sets:[11,11,10].map(r=>({w:w*LB,r,rir:2,done:true})),...more}]});
  L.state.sessions=[mk('r1','2026-09-20','machPress',190,{}),mk('r2','2026-09-25','machPress',130,{nw:true,mc:'r2'}),mk('q1','2026-09-21','pecDeck',110,{})];
  const nm=(id,m)=>{L.state.exercises.find(e=>e.id===id).machines=m;};nm('machPress',{0:'Hammer',r2:'Cybex'});nm('pecDeck',{0:'Life Fitness'});
  L.state=L.normalize(L.state);L.invalidate();L.saveNow();},LB);
await P3.page.evaluate(async t=>{const L=window.__ironlog;L.impStart({text:t});await new Promise(r=>setTimeout(r,300));L.ACT.impGo();await new Promise(r=>setTimeout(r,300));if(L.ui.modal)L.ACT.mClose();},text4);
const joined=await P3.page.evaluate(()=>{const L=window.__ironlog;const out={};for(const id of ['machPress','pecDeck'])out[id]=(L.IDX().byEx[id]||[]).map(x=>x.date+' '+x.mk);out.names=JSON.parse(JSON.stringify(L.state.exercises.find(x=>x.id==='machPress').machines));return out;});
const keyOf=d=>(joined.machPress.find(x=>x.startsWith(d))||'').split(' ')[1];
ok(keyOf('2026-10-01')==='r2'&&keyOf('2026-10-15')==='r2'&&keyOf('2026-10-08')==='0'&&keyOf('2026-10-17')&&!['0','r2'].includes(keyOf('2026-10-17'))&&JSON.stringify(joined.pecDeck)==='["2026-09-21 0","2026-10-02 0","2026-10-09 0"]'&&Object.keys(joined.names).length===2,'CSV read into a log whose lift has machines of those names: Cybex\'s sessions join its Cybex, Hammer\'s its Hammer, the pec deck\'s its Life Fitness; the machine with no name is one of its own, and no name is added (L4-14)',joined);
await P3.ctx.close();
}
// Every set's unit through the CSV (2.73): written as stored, never read back from the number, and read back by an
// import into an empty log as it was entered: a load and its unit, on a lift in the app's unit and on one marked in
// the other, a load typed to the hundredth included. And import's check for a session already in the log compares
// each load as written, in its own unit: a second session on the same day with the same lifts and reps and other loads
// is added (the full review's L2-8), the same file imported again adds nothing, and so does the same file read with
// the other unit choice.
{
const LB=0.45359237;
const P1=await open('index.html',{browser,clock:'2026-10-20T10:00:00'});
await P1.page.evaluate(LB=>{const L=window.__ironlog;const S=L.state;S.settings.onboarded=true;S.settings.unit='lb';S.exercises.find(e=>e.id==='bench').unit='kg';
  const set=(w,u,r)=>({w,u,r,rir:2,done:true});
  const mk=(id,date,bench,curl)=>({id,date,dayIdx:0,dayId:null,dayName:'Push',routineId:'',free:true,notes:'',ex:[{exId:'bench',note:'',rr:[6,10],sets:bench},{exId:'dbCurl',note:'',rr:[8,12],sets:curl}]});
  // And every load of the sweep, 0.05 to 1,000, in each unit on each lift.
  const SW=[0.05,0.25,1.25,2.35,12.5,61.25,102.5,225,999.95,1000],all=[...SW.map(v=>set(v,'kg',5)),...SW.map(v=>set(v*LB,'lb',5))];
  S.sessions=[mk('a1','2026-10-01',[set(83.75,'kg',8),set(185*LB,'lb',6)],[set(25*LB,'lb',12),set(12.5,'kg',10)]),mk('a2','2026-10-08',[set(85,'kg',8),set(85,'kg',8)],[set(27.5*LB,'lb',10)]),mk('a3','2026-10-15',all,all)];
  L.state=L.normalize(S);L.invalidate();L.saveNow();},LB);
const sets1=await P1.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.ex.map(b=>b.sets.map(q=>[q.w,q.u]))));
const [d1]=await Promise.all([P1.page.waitForEvent('download'),P1.page.evaluate(()=>window.__ironlog.exportCSV())]);
const t1=require('fs').readFileSync(await d1.path(),'utf8');
await P1.ctx.close();
const imp=async(P,t,unit)=>P.page.evaluate(async([t,unit])=>{const L=window.__ironlog;L.impStart({text:t});await new Promise(r=>setTimeout(r,300));if(unit&&L.ui.modal&&L.ui.modal.unit!==unit)L.ACT.impUnit({dataset:{v:unit}});await new Promise(r=>setTimeout(r,100));L.ACT.impGo();await new Promise(r=>setTimeout(r,400));if(L.ui.modal)L.ACT.mClose();return L.state.sessions.length;},[t,unit]);
const P2=await open('index.html',{browser,clock:'2026-10-20T10:00:00',realStarter:true});
await P2.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.settings.unit='lb';L.saveNow();});
await imp(P2,t1);
const sets2=await P2.page.evaluate(()=>window.__ironlog.state.sessions.slice().sort((a,b)=>a.date<b.date?-1:1).map(s=>s.ex.map(b=>b.sets.map(q=>[q.w,q.u]))));
const near=(a,b)=>JSON.stringify(a.map(s=>s.map(b=>b.map(([w,u])=>[Math.round(w*1e6),u]))))===JSON.stringify(b.map(s=>s.map(b=>b.map(([w,u])=>[Math.round(w*1e6),u]))));
ok(near(sets2,sets1)&&sets1[0][0][0][1]==='kg'&&sets1[0][0][1][1]==='lb'&&sets1[2][0].length===20,'CSV read back into an empty log: every set\'s load and unit as entered (83.75 kg and 185 lb on the bench marked kg, 25 lb and 12.5 kg on the curls in lb, and every load from 0.05 to 1,000 in each unit on each)',{sets1:sets1.slice(0,2),sets2:sets2.slice(0,2),diff:sets2[2]&&sets2[2].map((b,i)=>b.filter((q,j)=>!sets1[2][i][j]||Math.round(q[0]*1e6)!==Math.round(sets1[2][i][j][0]*1e6)||q[1]!==sets1[2][i][j][1]))});
const again=await imp(P2,t1);
ok(again===3,'the same file imported again adds nothing',again);
const other=await imp(P2,t1,'kg');
ok(other===3,'and read with the other unit choice, nothing either: the same numbers in another unit are the same sessions',other);
await P2.ctx.close();
// A log holding Oct 1's session with other loads: the file's Oct 1 is a second session that day, not the first again.
const P3=await open('index.html',{browser,clock:'2026-10-20T10:00:00',realStarter:true});
await P3.page.evaluate(LB=>{const L=window.__ironlog;const S=L.state;S.settings.onboarded=true;S.settings.unit='lb';S.exercises.find(e=>e.id==='bench').unit='kg';
  const set=(w,u,r)=>({w,u,r,rir:2,done:true});
  S.sessions=[{id:'x1',date:'2026-10-01',dayIdx:0,dayId:null,dayName:'Push',routineId:'',free:true,notes:'',ex:[{exId:'bench',note:'',rr:[6,10],sets:[set(60,'kg',8),set(135*LB,'lb',6)]},{exId:'dbCurl',note:'',rr:[8,12],sets:[set(15*LB,'lb',12),set(7.5,'kg',10)]}]}];
  L.state=L.normalize(S);L.invalidate();L.saveNow();},LB);
const n3=await imp(P3,t1);
const oct1=await P3.page.evaluate(()=>window.__ironlog.state.sessions.filter(s=>s.date==='2026-10-01').length);
ok(n3===4&&oct1===2,'a log with a lighter session on Oct 1, same lifts and reps: the file\'s Oct 1 is added beside it, two sessions that day',{n3,oct1});
await P3.ctx.close();
}
// ---- 4. delete, trash, restore, undo
await ev(()=>{const L=window.__ironlog;L.ui.tab='history';L.ui.histOpen=L.state.sessions[0].id;L.render();});
await page.click('[data-act="histDel"]');await page.click('[data-act="mOk"]');await page.waitForTimeout(100);
let st=await ev(()=>({n:window.__ironlog.state.sessions.length,trash:window.__ironlog.state.trash.length}));
ok(st.n===0&&st.trash===1,'delete moves the session to Recently deleted',st);
await ev(()=>{document.querySelector('[data-sk="history:trash"]').open=true;});await page.click('[data-act="restore"]');await page.waitForTimeout(100);
st=await ev(()=>({n:window.__ironlog.state.sessions.length,trash:window.__ironlog.state.trash.length}));
ok(st.n===1&&st.trash===0,'restore brings it back',st);
ok(!errors.length,'no console errors',errors);
await ctx.close();
}
// ---- 5. two devices through the cloud
{
const A=await open('index.html',{browser,clock:'2026-09-26T10:00:00',setup:cloudSetup});
const B=await open('index.html',{browser,clock:'2026-09-26T10:00:00',setup:cloudSetup});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
await wait(800);
const logOn=async(P,id,w)=>P.page.evaluate(([id,w])=>{const L=window.__ironlog;const R=L.state.routines[0];L.state.settings.onboarded=true;L.state.sessions.push({id,date:'2026-09-25',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w,r:8,rir:2}]}]});L.invalidate();},[id,w]);
await logOn(A,'sA',100);await A.page.evaluate(()=>window.__ironlog.flush());await wait(300);
await B.page.evaluate(()=>window.__ironlog.sync());await wait(500);
let bs=await B.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id));
ok(bs.includes('sA'),'device B receives A\'s session',bs);
await logOn(B,'sB',110);await B.page.evaluate(()=>window.__ironlog.flush());await wait(300);
await A.page.evaluate(()=>window.__ironlog.sync());await wait(500);
let as=await A.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id).sort());
ok(as.join()==='sA,sB','device A receives B\'s session',as);
// delete on A reaches B
await A.page.evaluate(()=>{const L=window.__ironlog;L.state.sessions=L.state.sessions.filter(s=>s.id!=='sA');L.invalidate();});await A.page.evaluate(()=>window.__ironlog.flush());await wait(300);
await B.page.evaluate(()=>window.__ironlog.sync());await wait(500);
bs=await B.page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id));
ok(!bs.includes('sA')&&bs.includes('sB'),'a delete on A reaches B',bs);
// exercise load setting syncs
await A.page.evaluate(()=>{const L=window.__ironlog;L.state.exercises.find(e=>e.id==='legPress').load='side';L.invalidate();});await A.page.evaluate(()=>window.__ironlog.flush());await wait(300);
await B.page.evaluate(()=>window.__ironlog.sync());await wait(500);
ok(await B.page.evaluate(()=>window.__ironlog.state.exercises.find(e=>e.id==='legPress').load==='side'),'load setting syncs');
const cs=[...store.keys()].sort();ok(cs.includes('data/users/u1/core')&&cs.some(k=>/s-2026-09-2/.test(k)),'cloud documents: core plus half-month chunks',cs);
ok(!A.errors.length&&!B.errors.length,'no console errors on either device',[...A.errors,...B.errors]);
await A.ctx.close();await B.ctx.close();
}
console.log(fails.length?'FAILURES '+fails.length:'ALL PASS');await browser.close();})();
