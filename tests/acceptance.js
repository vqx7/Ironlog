// User acceptance: load labels, mix-up warning, tips on hover and hold, less
// text on screen, a full logged session, unit and RIR switches.
const {open}=require('./h');const {chromium}=require('playwright');
const fails=[];const ok=(c,m,x)=>{if(!c){fails.push(m);console.log('FAIL',m,JSON.stringify(x));}else console.log('ok  ',m,x!==undefined?JSON.stringify(x).slice(0,220):'');};
const visText=async(page)=>page.evaluate(()=>{let n=0;const w=document.createTreeWalker(document.getElementById('view'),NodeFilter.SHOW_TEXT);while(w.nextNode()){const t=w.currentNode;const el=t.parentElement;if(!el||el.closest('[hidden]')||el.closest('select')||el.closest('details:not([open]) > :not(summary)'))continue;const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;n+=t.textContent.trim().length;}return n;});
(async()=>{const browser=await chromium.launch();
// ---- text volume: old build vs new, same data, same open sections
const sizes={};
// The same log in both: r12's demo, carried into the current build (since
// r29 the two builds' demos differ, so each making its own compared two logs).
let demoState=null;
for(const [file,tag] of [['baselines/r12.html','old'],['index.html','new']]){
  const P=await open(file,{browser,clock:'2026-09-26T10:00:00',state:tag==='new'?demoState:undefined});
  if(tag==='old')demoState=await P.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.makeDemo();L.render();return JSON.parse(JSON.stringify(L.state));});
  else await P.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.render();});
  for(const t of ['today','program','dash','history','settings','logger']){
    await P.page.evaluate(t=>{const L=window.__ironlog;if(t==='logger'){L.ui.tab='today';L.render();document.querySelector('.hero [data-act="startSession"]').click();}else{L.state.draft=null;L.ui.tab=t;L.render();}document.querySelectorAll('details').forEach(d=>d.open=true);},t);
    (sizes[t]=sizes[t]||{})[tag]=await visText(P.page);
  }
  await P.ctx.close();
}
for(const [t,v] of Object.entries(sizes)){const d=Math.round((1-v.new/v.old)*100);ok(v.new<=v.old,`${t}: visible text ${v.old} → ${v.new} characters (${d}% less)`);}
// ---- logger labels
{
const {page,errors,ctx}=await open('index.html',{browser,touch:true,clock:'2026-09-26T10:00:00'});
const ev=(f,a)=>page.evaluate(f,a);
// Auto-mark off: this suite ticks every set by hand (auto-mark is on for new installs since r28; essentials and journey cover it).
await ev(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.settings.autoDone=false;L.makeDemo();L.render();});
const startDay=async name=>{await ev(n=>{const L=window.__ironlog;L.state.draft=null;const R=L.state.routines[0];L.ui.todayDay=R.days.findIndex(d=>d.name===n);L.ui.tab='today';L.render();},name);await page.click('.hero [data-act="startSession"]:not([data-light])');};
const labels=async()=>ev(()=>[...document.querySelectorAll('section.block')].map(b=>({n:b.querySelector('h3').childNodes[0].textContent.trim(),head:b.querySelector('.sg.head span:nth-child(2)').innerText,chips:[...b.querySelectorAll('.lm')].map(x=>x.innerText)})));
await startDay('Arms');let lb=await labels();console.log(lb.map(x=>`${x.n}: [${x.head}] ${x.chips.join(' | ')}`).join('\n'));
const f=n=>lb.find(x=>x.n.toUpperCase()===n.toUpperCase());
ok(/each/i.test(f('Incline DB Curl').head)&&f('Incline DB Curl').chips[0]==='per dumbbell','DB curl: "LB each" column and per-dumbbell chip');
ok(/stack/i.test(f('Overhead Cable Triceps Extension').head),'cable: stack column');
ok(f('JM Press').chips[0]==='total, bar included','barbell: total, bar included');
ok(f('Cable Woodchop').chips.includes('reps per side'),'woodchop: reps per side');
await startDay('Back');lb=await labels();
ok(/\+lb/i.test(f('Pull-up').head)&&f('Pull-up').chips[0]==='added to bodyweight','pull-up: +LB and added to bodyweight');
// mix-up warning
const w0=await ev(()=>{const b=window.__ironlog.state.draft.ex[0];return window.__ironlog.IDX().exStats[b.exId].last.topW;});
await page.fill('[data-f="w"][data-b="1"][data-s="0"]','500');await page.locator('[data-f="w"][data-b="1"][data-s="0"]').blur();await page.waitForTimeout(150);
const toast=await ev(()=>document.getElementById('toast').hidden?'':document.getElementById('toast').innerText);
ok(/well above last time/.test(toast)&&/logged as/.test(toast),'far-off load prompts a units check',toast);
// long press on a tip button: tip shows, action does not fire
await ev(()=>window.scrollTo(0,0));
const lp=await ev(async()=>{const btn=document.querySelector('[data-act="sAdd"][data-b="0"]');const n0=window.__ironlog.state.draft.ex[0].sets.length;const r=btn.getBoundingClientRect();const o={bubbles:true,cancelable:true,pointerType:'touch',clientX:r.x+5,clientY:r.y+5,pointerId:7,isPrimary:true};
  btn.dispatchEvent(new PointerEvent('pointerdown',o));await new Promise(r=>setTimeout(r,650));const shown=!document.getElementById('tip').hidden&&document.getElementById('tip').innerText;
  btn.dispatchEvent(new PointerEvent('pointerup',o));btn.click();await new Promise(r=>setTimeout(r,50));
  const n1=window.__ironlog.state.draft.ex[0].sets.length;
  // a normal tap still works
  document.dispatchEvent(new PointerEvent('pointerdown',{...o,clientX:1,clientY:1}));document.querySelector('[data-act="sAdd"][data-b="0"]').click();await new Promise(r=>setTimeout(r,50));
  return {shown,n0,n1,n2:window.__ironlog.state.draft.ex[0].sets.length};});
ok(lp.shown&&lp.n1===lp.n0&&lp.n2===lp.n0+1,'hold shows the tip without firing; a tap still acts',lp);
// i button tap
const hasI=await ev(()=>!!document.querySelector('.tipi'));
if(hasI){await page.tap('.tipi');await page.waitForTimeout(50);ok(await ev(()=>!document.getElementById('tip').hidden),'tapping i shows the exercise note');}
// full set entry and finish
await ev(()=>{window.__ironlog.state.draft=null;window.__ironlog.render();});
await startDay('Chest');
for(let si=0;si<2;si++){await page.fill(`[data-f="w"][data-b="0"][data-s="${si}"]`,'265');await page.fill(`[data-f="r"][data-b="0"][data-s="${si}"]`,'9');await page.tap(`.rirb[data-b="0"][data-s="${si}"]`);await page.tap(`.rirstrip [data-v="1"]`);await page.tap(`[data-act="sDone"][data-b="0"][data-s="${si}"]`);}
await page.waitForTimeout(200);
const pr=await ev(()=>!!document.querySelector('.sg.pr'));ok(pr,'a heavier set shows a live PR badge');
ok(await ev(()=>!document.getElementById('timer').hidden),'rest timer started on done');
await ev(()=>window.__ironlog.ACT.finish());await page.waitForTimeout(200);
const rc=await ev(()=>{const m=window.__ironlog.ui.modal;return m&&(m.kind==='recap'?m.lines:m.title);});
ok(Array.isArray(rc)&&rc.some(l=>/2 working sets, 2 counted as hard/.test(l)),'recap counts the sets',rc);
await ev(()=>window.__ironlog.ACT.mClose&&window.__ironlog.ACT.mClose());
// history shows units words for a DB lift
await ev(()=>{const L=window.__ironlog;const s=L.state.sessions.find(x=>x.ex.some(b=>b.exId==='inclineCurl'));L.ui.tab='history';L.ui.histEx='inclineCurl';L.ui.histOpen=s.id;L.render();});
const hs=await ev(()=>document.querySelector('.hitem.open .panel').innerText);ok(/per dumbbell/.test(hs),'History marks per-dumbbell loads');
// kg switch: loads display converted
await ev(()=>{const L=window.__ironlog;L.state.settings.unit='kg';L.ui.tab='today';L.render();});
await page.click('.hero [data-act="startSession"]:not([data-light])');
const kg=await ev(()=>({v:document.querySelector('[data-f="w"][data-b="0"][data-s="0"]').value,head:document.querySelector('.sg.head span:nth-child(2)').innerText}));
ok(/KG/i.test(kg.head),'kg mode labels the load column',kg);
// RIR off hides the picker
await ev(()=>{const L=window.__ironlog;L.state.settings.rirMode='off';L.render();});
ok(await ev(()=>!document.querySelector('[data-f="rir"]')),'RIR off hides the picker');
ok(!errors.length,'no console errors',errors);
await ctx.close();
}
// ---- desktop hover tip and per-side plate entry
{
const {page,errors,ctx}=await open('index.html',{browser,w:1100,h:900,clock:'2026-09-26T10:00:00'});
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.exercises.find(e=>e.id==='hackSquat').load='side';L.invalidate();const R=L.state.routines[0];L.ui.todayDay=2;L.render();});
await page.hover('.hero [data-act="pickToday"]');await page.waitForTimeout(500);
ok(await ev(()=>!document.getElementById('tip').hidden&&/Ranks your days/.test(document.getElementById('tip').innerText)),'hover shows the tip on desktop');
await page.mouse.move(1,1);await page.waitForTimeout(100);ok(await ev(()=>document.getElementById('tip').hidden),'tip hides when the pointer leaves');
await page.click('.hero [data-act="startSession"]:not([data-light])');
const hs=await ev(()=>{const i=window.__ironlog.state.draft.ex.findIndex(b=>b.exId==='hackSquat');const inp=document.querySelector(`[data-f="w"][data-b="${i}"][data-s="0"]`);return {i,head:document.querySelectorAll('.sg.head')[i].children[1].innerText};});
await page.fill(`[data-f="w"][data-b="${hs.i}"][data-s="0"]`,'90');await page.waitForTimeout(100);
const pl=await ev(i=>document.getElementById('pl-'+i).innerText,hs.i);
ok(/side/i.test(hs.head)&&/45, 45/.test(pl),'hack squat logged per side: plate line shows 45, 45 a side',{head:hs.head,pl});
ok(!errors.length,'no console errors',errors);
await ctx.close();
}
console.log(fails.length?'FAILURES '+fails.length:'ALL PASS');await browser.close();})();
