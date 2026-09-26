// Data flow: storage, reload, draft recovery, backup round trip, CSV, trash,
// undo, and two devices syncing through a shared (mock) cloud store.
const {open}=require('./h');const {chromium}=require('playwright');
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
(async()=>{const browser=await chromium.launch();
// ---- 1. log a session through the UI, reload, it is there; draft survives reload
{
const {page,errors,ctx}=await open('index.html',{browser,clock:'2026-09-26T10:00:00'});
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.render();});
await page.click('.hero [data-act="startSession"]:not([data-light])');
await page.fill('[data-f="w"][data-b="0"][data-s="0"]','185');await page.fill('[data-f="r"][data-b="0"][data-s="0"]','8');
await page.selectOption('select[data-f="rir"][data-b="0"][data-s="0"]','2');
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
