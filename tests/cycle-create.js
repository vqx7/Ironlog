const {open}=require('./h');
const fails=[];const ok=(c,m)=>{if(!c){fails.push(m);console.log('FAIL',m);}else console.log('ok  ',m);};
(async()=>{const {browser,page,errors}=await open('index.html',{clock:'2026-09-26T10:00:00'});
const ev=(f,a)=>page.evaluate(f,a);
// fresh cycle routine: projection from today
const wk=await ev(()=>[...document.querySelectorAll('#wkbar .w')].map(c=>c.getAttribute('aria-label')));
console.log(wk);ok(/Chest, planned/.test(wk[5])&&/Back, planned/.test(wk[6]),'cycle projected: today Chest, tomorrow Back');
// log Chest today via API -> tomorrow should be Back, today trained
await ev(()=>{const L=window.__ironlog;const R=L.state.routines[0];L.state.settings.onboarded=true;L.state.sessions.push({id:'x1',date:'2026-09-26',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:1}]}]});L.invalidate();L.render();});
const wk2=await ev(()=>[...document.querySelectorAll('#wkbar .w')].map(c=>c.className+'|'+c.getAttribute('aria-label')));
ok(/on/.test(wk2[5])&&/Back, planned/.test(wk2[6]),'after logging, tomorrow is next day: '+wk2[6]);
// freestyle + pick for me with almost no history
await page.click('.hero [data-act="startFree"]');await page.waitForTimeout(80);
await page.click('#modal [data-act="pickEx"]');await page.waitForTimeout(80);
const p=await ev(()=>[...document.querySelectorAll('.pcard')].map(c=>c.innerText.split('\n').slice(0,3).join(' / ')));
console.log(p);ok(p.length===3,'freestyle picks 3');
await page.click('.pcard [data-act="pickExAdd"]');await page.waitForTimeout(500);
ok(await ev(()=>window.__ironlog.state.draft.ex.length===1),'added in freestyle');
await ev(()=>{window.__ironlog.state.draft=null;window.__ironlog.render();});
// program: add to day via create
await page.click('#tabs button[data-tab="program"]');await page.waitForTimeout(80);
// Program shows one day at a time: open Day 2 first.
await ev(()=>document.querySelector('[data-act="pickDay"][data-day="1"]').closest('.day').querySelector('[data-act="dFold"]').click());await page.waitForTimeout(80);
ok(await ev(()=>document.querySelectorAll('.day .dbody:not([hidden])').length===1),'one day open at a time');
await page.click('[data-act="pickDay"][data-day="1"]');await page.waitForTimeout(50);
await page.fill('#pickQ','Band Face Pull');await page.click('#pickList .pick.new');await page.waitForTimeout(50);
ok(/add to day/i.test(await ev(()=>document.querySelector('[data-act="exSave"]').innerText)),'create button reads add to day');
// A quick create from search must name its main muscle before it saves.
await page.click('[data-act="exSave"]');await page.waitForTimeout(80);
ok(await ev(()=>!!window.__ironlog.ui.modal&&window.__ironlog.ui.modal.kind==='exEdit'&&/main muscle/.test(document.getElementById('toast').textContent)),'saving without a main muscle asks for one');
await page.selectOption('[data-ebind="primary"]','rearDelts');
await page.click('[data-act="exSave"]');await page.waitForTimeout(80);
ok(await ev(()=>{const e=window.__ironlog.state.exercises.find(x=>x.name==='Band Face Pull');return e&&e.primary==='rearDelts';}),'created with the chosen main muscle');
ok(await ev(()=>{const L=window.__ironlog;const d=L.state.routines[0].days[1];const e=L.state.exercises.find(x=>x.name==='Band Face Pull');return e&&d.items.some(i=>i.exId===e.id);}),'created exercise added to routine day');
// exEdit timed toggle rerenders former best fields
await ev(()=>{window.__ironlog.ui.planView='library';window.__ironlog.render();});
await page.click('[data-act="exEdit"]');await page.waitForTimeout(50);
// Comeback is switched off: the editor has no former-best fields at all.
ok(await ev(()=>!document.querySelector('[data-ebind="priorW"]')),'no former-best fields in the editor');
const before=await ev(()=>document.querySelector('[data-ebind="timed"]').checked);
await page.click('[data-ebind="timed"]');await page.waitForTimeout(50);
const after=await ev(()=>document.querySelector('[data-ebind="timed"]').checked);
ok(before!==after,'timed toggle updates editor');
ok(await ev(()=>document.querySelector('details.more').open),'library editor shows all options');
console.log(errors);ok(!errors.length,'no errors');
console.log(fails.length?'FAILURES':'ALL PASS');await browser.close();})();
