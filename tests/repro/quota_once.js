// One transient QuotaExceededError on the main key turns saving off for the rest
// of the tab's life; later sets are never written even though storage works again.
const {open}=require(require('path').join(__dirname,'..','h.js'));const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const {browser,page}=await open(P,{clock:'2026-09-20T10:00:00'});
await page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.render();});
await page.click('.hero [data-act="startSession"]:not([data-light])');
await page.evaluate(()=>{const o=Storage.prototype.setItem;let n=0;Storage.prototype.setItem=function(k,v){if(k==='ironlog.v1'&&n++===0){const e=new DOMException('full','QuotaExceededError');throw e;}return o.call(this,k,v);};});
await page.fill('[data-f="w"][data-b="0"][data-s="0"]','185');await page.fill('[data-f="r"][data-b="0"][data-s="0"]','8');
await page.click('[data-act="sDone"][data-b="0"][data-s="0"]');await page.waitForTimeout(600);
await page.fill('[data-f="w"][data-b="0"][data-s="1"]','185');await page.fill('[data-f="r"][data-b="0"][data-s="1"]','8');
await page.click('[data-act="sDone"][data-b="0"][data-s="1"]');await page.waitForTimeout(600);
console.log('in memory done sets:',await page.evaluate(()=>window.__ironlog.state.draft.ex[0].sets.filter(s=>s.done).length));
console.log('stored done sets:',await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('ironlog.v1')).draft;return d?d.ex[0].sets.filter(s=>s.done).length:null;}));
await browser.close();})();
