// Single device: start editing S, delete S from History while the edit is open,
// then Save changes. The saved session is in state, but its id is still in trash,
// so the next load's normalize() silently drops it.
const {open}=require(require('path').join(__dirname,'..','h.js'));const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const {browser,page}=await open(P,{clock:'2026-09-20T10:00:00'});
await page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;const R=L.state.routines[0];L.state.sessions.push({id:'S',date:'2026-09-18',dayIdx:0,dayId:R.days[0].id,dayName:'Chest',routineId:R.id,notes:'',ex:[{exId:'bench',sets:[{w:100,r:8,rir:2}]}]});L.invalidate();L.ACT.deloadToggle();L.ACT.deloadToggle();});
await page.evaluate(()=>window.__ironlog.ACT.histEdit({dataset:{id:'S'}}));await page.waitForTimeout(100);
if(await page.evaluate(()=>window.__ironlog.ui.modal&&window.__ironlog.ui.modal.kind==='confirm'))await page.click('[data-act="mOk"]');
console.log('draft editing:',await page.evaluate(()=>window.__ironlog.state.draft&&window.__ironlog.state.draft.editingId));
// go to History (UI), open S, delete it
await page.evaluate(()=>{const L=window.__ironlog;L.ui.tab='history';L.ui.histOpen='S';L.render();});
console.log('delete button visible during edit:',await page.isVisible('[data-act="histDel"]'));
await page.click('[data-act="histDel"]');await page.click('[data-act="mOk"]');await page.waitForTimeout(100);
await page.evaluate(()=>{const L=window.__ironlog;L.state.draft.ex[0].sets[0].r=12;L.state.draft.notes='edited';L.state.draft._rampAsked=true;L.ACT.finishNow();});await page.waitForTimeout(200);
console.log('in memory after save:',await page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id+':'+s.notes)),'trash:',await page.evaluate(()=>window.__ironlog.state.trash.map(t=>t.id)));
await page.reload();await page.waitForFunction(()=>window.__ironlog);
console.log('after reload:',await page.evaluate(()=>window.__ironlog.state.sessions.map(s=>s.id+':'+s.notes)));
await browser.close();})();
