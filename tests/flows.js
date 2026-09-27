// Session flows: picker, create-from-picker, pick for me, discard at the top, limited equipment.
const {open}=require('./h');
const fails=[];const ok=(c,m)=>{if(!c){fails.push(m);console.log('FAIL',m);}else console.log('ok  ',m);};
(async()=>{
const {browser,page,errors}=await open('index.html',{touch:true,w:390,h:844});
const ev=(f,a)=>page.evaluate(f,a);
await ev(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.makeDemo();L.ui.tab='today';L.render();});
await page.waitForTimeout(100);
// hero
const hero=await ev(()=>[...document.querySelectorAll('.hero-alt .btn')].map(b=>b.innerText.replace(/\n/g,' | ')));
ok(hero.length===4,'hero has 4 start variants: '+hero.join(' ; '));
// start session
await page.click('.hero [data-act="startSession"]:not([data-light])');
await page.waitForTimeout(100);
const top=await ev(()=>{const ph=document.querySelector('.ph');return {topDiscard:!!ph.querySelector('[data-act="discard"]'),all:document.querySelectorAll('[data-act="discard"]').length,tab:document.querySelector('#tabs button[data-tab="today"]').innerText,live:document.querySelector('#tabs button[data-tab="today"]').classList.contains('live'),wlive:!!document.querySelector('#wkbar .w.live')};});
ok(top.topDiscard&&top.all===2,'discard at the top and beside Finish (item 60)');
ok(top.tab.trim().toLowerCase()==='session'&&top.live,'today tab reads Session with dot');
ok(top.wlive,'week bar marks live session today');
// picker
await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
await page.click('[data-act="pickSession"]');
await page.waitForTimeout(100);
const p1=await ev(()=>{const sh=document.querySelector('.sheet.fixed');const ae=document.activeElement;return {fixed:!!sh,h:sh&&sh.getBoundingClientRect().height,groups:[...document.querySelectorAll('.pick-grp')].map(x=>x.innerText),focusIsInput:ae&&ae.tagName==='INPUT',bodyLock:document.body.classList.contains('modal-open')};});
ok(p1.fixed,'picker sheet is fixed height');ok(!p1.focusIsInput,'no keyboard autofocus on touch');ok(p1.bodyLock,'body scroll locked');
ok(p1.groups.some(g=>/Recent/i.test(g))&&p1.groups.some(g=>/All exercises/i.test(g)),'picker groups: '+p1.groups.join(', '));
await page.fill('#pickQ','curl');await page.waitForTimeout(50);
const p2=await ev(()=>({h:document.querySelector('.sheet.fixed').getBoundingClientRect().height,n:document.querySelectorAll('#pickList .pick').length,names:[...document.querySelectorAll('#pickList .pick b')].map(b=>b.innerText)}));
ok(Math.abs(p2.h-p1.h)<1,'sheet height stable while filtering ('+p1.h+' vs '+p2.h+')');
ok(p2.names.includes('DB Curl')&&p2.names.includes('EZ-Bar Curl'),'DB Curl and EZ-Bar Curl in library');
const nBefore=await ev(()=>window.__ironlog.state.draft.ex.length);
await page.click('#pickList .pick[data-ex="dbCurl"]');await page.waitForTimeout(700);
const a1=await ev(()=>{const d=window.__ironlog.state.draft;const bi=d.ex.length-1;const el=document.getElementById('blk-'+bi);const r=el.getBoundingClientRect();return {n:d.ex.length,last:d.ex[bi].exId,top:r.top,flash:el.classList.contains('flash'),modal:!document.getElementById('modal').hidden};});
ok(a1.n===nBefore+1&&a1.last==='dbCurl','DB Curl added');ok(a1.top>=40&&a1.top<140,'scrolled to new block (top '+a1.top+')');ok(a1.flash,'new block flashed');ok(!a1.modal,'picker closed');
// create new from picker
await page.click('[data-act="pickSession"]');await page.waitForTimeout(80);
await page.fill('#pickQ','Zercher Carry');await page.waitForTimeout(50);
const cr=await ev(()=>!!document.querySelector('#pickList .pick.new'));ok(cr,'create row offered for unmatched search');
await page.click('#pickList .pick.new');await page.waitForTimeout(80);
const e1=await ev(()=>({kind:window.__ironlog.ui.modal.kind,name:document.querySelector('[data-ebind="name"]').value,moreOpen:document.querySelector('details.more').open,btn:document.querySelector('[data-act="exSave"]').innerText,focus:document.activeElement&&document.activeElement.dataset.ebind}));
ok(e1.kind==='exEdit'&&e1.name==='Zercher Carry','editor opened with name');ok(!e1.moreOpen,'more options folded in quick create');ok(/add to session/i.test(e1.btn),'save button says add to session: '+e1.btn);
// scroll sheet then toggle a chip: scroll must be kept
await ev(()=>{document.querySelector('.sheet').scrollTop=200;});
const st0=await ev(()=>document.querySelector('.sheet').scrollTop);
await page.click('[data-act="secToggle"][data-m="traps"]');await page.waitForTimeout(50);
const st1=await ev(()=>({st:document.querySelector('.sheet').scrollTop,on:document.querySelector('[data-act="secToggle"][data-m="traps"]').classList.contains('on')}));
ok(st1.on,'chip toggled');ok(Math.abs(st1.st-st0)<2,'sheet scroll kept on re-render ('+st0+' -> '+st1.st+')');
await page.selectOption('[data-ebind="primary"]','forearms');await page.selectOption('[data-ebind="equip"]','other');
await page.click('[data-act="exSave"]');await page.waitForTimeout(700);
const c1=await ev(()=>{const L=window.__ironlog;const d=L.state.draft;const b=d.ex[d.ex.length-1];const e=L.state.exercises.find(x=>x.name==='Zercher Carry');return {modal:!document.getElementById('modal').hidden,exId:b.exId,eid:e&&e.id,prim:e&&e.primary,sec:e&&e.secondary};});
ok(!c1.modal&&c1.exId===c1.eid,'created exercise added straight to session');ok(c1.prim==='forearms'&&c1.sec.includes('traps'),'created with chosen muscles');
// Back button from editor returns to picker
await page.click('[data-act="pickSession"]');await page.waitForTimeout(50);await page.click('[data-act="exNewFromPicker"]');await page.waitForTimeout(50);
await page.click('[data-act="exBack"]');await page.waitForTimeout(50);
ok(await ev(()=>window.__ironlog.ui.modal&&window.__ironlog.ui.modal.kind==='picker'),'Back returns to picker');
await page.click('#modal [data-act="mClose"]');
// pick for me in session
await page.click('[data-act="pickEx"]');await page.waitForTimeout(80);
const pk=await ev(()=>({cards:[...document.querySelectorAll('.pcard')].map(c=>c.innerText.split('\n')[0]),reasons:document.querySelector('.pcard ul')&&document.querySelector('.pcard ul').innerText}));
ok(pk.cards.length>=1&&pk.cards.length<=3,'pick for me cards: '+pk.cards.join(' | '));console.log(pk.reasons);
const n2=await ev(()=>window.__ironlog.state.draft.ex.length);
await page.click('.pcard [data-act="pickExAdd"]');await page.waitForTimeout(600);
ok(await ev(()=>window.__ironlog.state.draft.ex.length)===n2+1,'pick added exercise');
// swap picker shows closest matches
await ev(()=>{document.querySelector('[data-act="bMenu"][data-b="0"]').click();});await page.waitForTimeout(50);
await page.click('[data-op="bSwap"]');await page.waitForTimeout(80);
const sw=await ev(()=>[...document.querySelectorAll('.pick-grp')].map(x=>x.innerText));
ok(sw.some(x=>/Closest matches/i.test(x)),'swap shows closest matches: '+sw.join(', '));
await page.click('#modal [data-act="mClose"]');
// discard at top
await ev(()=>window.scrollTo(0,0));
// Reps typed in a set: Discard asks first (a blank session would go at once, see r21.js).
await page.fill('.sg input[data-f="r"][data-b="0"][data-s="0"]','8');await page.waitForTimeout(30);
await page.click('.ph [data-act="discard"]');await page.waitForTimeout(50);await page.click('[data-act="mOk"]');await page.waitForTimeout(80);
ok(await ev(()=>window.__ironlog.state.draft===null),'discard from top works');
ok(await ev(()=>document.querySelector('#tabs button[data-tab="today"]').innerText.trim().toLowerCase()==='today'),'tab back to Today');
// pick for me: day
await page.click('.hero [data-act="pickToday"]');await page.waitForTimeout(80);
const pd=await ev(()=>({cards:[...document.querySelectorAll('.pcard')].map(c=>c.innerText.replace(/\n/g,' / ').slice(0,200)),lead:document.querySelector('.sheet p').innerText}));
ok(pd.cards.length>=1,'pick day cards');console.log(pd.lead);pd.cards.forEach(c=>console.log('  ',c));
const di=await ev(()=>+document.querySelector('.pcard [data-act="startSession"]').dataset.day);
await page.click('.pcard [data-act="startSession"]');await page.waitForTimeout(80);
ok(await ev(()=>window.__ironlog.state.draft&&window.__ironlog.state.draft.dayIdx)===di&&await ev(()=>document.getElementById('modal').hidden),'start from pick works and closes sheet');
await ev(()=>{window.__ironlog.state.draft=null;window.__ironlog.render();});
// limited equipment
await page.click('[data-act="heroMore"]');await page.click('[data-act="eqOpen"]');await page.waitForTimeout(50);
for(const k of ['machine','cable','smith'])await page.click(`[data-act="eqToggle"][data-k="${k}"]`);
const eqp=await ev(()=>[...document.querySelectorAll('.eqsw li')].map(l=>l.innerText));console.log(eqp);
ok(eqp.length>0,'limited equipment previews swaps');
await page.click('[data-act="eqStart"]');await page.waitForTimeout(80);
const ld=await ev(()=>{const L=window.__ironlog;const d=L.state.draft;return {limited:d.limited,eq:d.ex.map(b=>L.state.exercises.find(e=>e.id===b.exId).equip),note:d.notes};});
ok(ld.limited&&ld.eq.every(e=>!['machine','cable','smith'].includes(e)),'limited session uses only allowed equipment: '+ld.eq.join(','));
// finish: mark all sets done quickly and ensure no routine-update offer
await ev(()=>{const L=window.__ironlog;for(const b of L.state.draft.ex)for(const s of b.sets){s.w=s.w||20;s.r=8;s.done=true;}L.state.draft._rampAsked=true;L.ACT.finish();});
await page.waitForTimeout(100);
const rc=await ev(()=>{const m=window.__ironlog.ui.modal;return m&&m.kind==='confirm'?'confirm:'+m.title:m&&m.kind+':'+(!!m.upd);});
console.log('after finish',rc);
if(rc&&rc.startsWith('confirm')){await page.click('[data-act="mOk"]');await page.waitForTimeout(100);}
ok(await ev(()=>{const m=window.__ironlog.ui.modal;return m&&m.kind==='recap'&&!m.upd;}),'recap without routine swap offer');
console.log('errors',errors);ok(!errors.length,'no console errors');
// First run with demo data: a short note, not the full welcome on top of the demo; one tap back to a clean start.
{const F=await open('index.html',{browser,touch:true,w:390,h:844});const fe=(f,a)=>F.page.evaluate(f,a);await F.page.waitForTimeout(400);
ok(await fe(()=>!!document.querySelector('.welcome h3')),'first run: the welcome card shows');
await fe(()=>{const L=window.__ironlog;L.makeDemo();L.ui.tab='today';L.render();});
ok(await fe(()=>!!document.getElementById('demoNote')&&!document.querySelector('.welcome h3')),'demo loaded before setup: a short demo note instead of the full welcome');
await F.page.click('#demoNote [data-act="demoStart"]');await F.page.waitForTimeout(150);
const cl=await fe(()=>{const s=window.__ironlog.state;return {d:s.sessions.filter(x=>x.demo).length+s.bodyweights.filter(x=>x.demo).length+s.measurements.filter(x=>x.demo).length,w:!!document.querySelector('.welcome h3')};});
ok(cl.d===0&&cl.w,'Clear demo and set up: no demo data left and the welcome is back');
ok(!F.errors.length,'no console errors on first run');await F.ctx.close();}
console.log(fails.length?'FAILURES '+fails.length:'ALL PASS');await browser.close();})();
