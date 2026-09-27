// Settings > Undo restores a whole-state snapshot taken at the last delete, so
// every session logged after that delete is silently discarded.
const {open}=require(require('path').join(__dirname,'..','h.js'));const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const {browser,page}=await open(P,{clock:'2026-09-20T10:00:00'});
await page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;const R=L.state.routines[0];L.state.sessions.push({id:'old',date:'2026-09-18',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.invalidate();L.render();});
// delete 'old' through the UI
await page.evaluate(()=>{const L=window.__ironlog;L.ui.tab='history';L.ui.histOpen='old';L.render();});
await page.click('[data-act="histDel"]');await page.click('[data-act="mOk"]');await page.waitForTimeout(100);
// later: log and finish a new session through the UI
await page.evaluate(()=>{const L=window.__ironlog;L.ui.tab='today';L.render();});
await page.click('.hero [data-act="startSession"]:not([data-light])');
await page.fill('[data-f="w"][data-b="0"][data-s="0"]','185');await page.fill('[data-f="r"][data-b="0"][data-s="0"]','8');
await page.click('[data-act="sDone"][data-b="0"][data-s="0"]');
await page.evaluate(()=>{window.__ironlog.state.draft._rampAsked=true;window.__ironlog.ACT.finishNow();});await page.waitForTimeout(200);
console.log('before undo:',await page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id+'@'+s.date)));
// Settings > Undo (button in Your data)
await page.click('[data-act="mClose"]').catch(()=>{});await page.evaluate(()=>{const L=window.__ironlog;L.ui.tab='settings';L.render();document.querySelectorAll('details').forEach(d=>d.open=true);});
await page.click('#view [data-act="undo"]');await page.waitForTimeout(100);
console.log('after undo:',await page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id+'@'+s.date)));
await page.reload();await page.waitForFunction(()=>window.__ironlog);
console.log('after reload:',await page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id+'@'+s.date)));
await browser.close();})();
