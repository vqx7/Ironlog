// A save the app cannot read is kept aside before anything is written over it
// (r45). When keeping it aside fails too (a full store refuses the copy), the
// next change saved a fresh log over the only copy (the r63 audit, A-2). The
// app must stop saving instead and say so.
const {open}=require(require('path').join(__dirname,'..','h.js'));const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const {browser,page}=await open(P,{clock:'2026-09-20T10:00:00'});
const KEY=await page.evaluate(()=>window.__ironlog.KEY);
const bad='{"version":5,"sessions":[{"id":"s1","date":"2026-09-18","ex":[{"exId":"bench","sets":[{"w":100,"r":8';// a save cut short
await page.evaluate(([k,v])=>localStorage.setItem(k,v),[KEY,bad]);
// From the next start, the store refuses the copy kept aside, as a full one does; the log's own key, already holding the save, takes a write.
await page.addInitScript(k=>{const o=Storage.prototype.setItem;Storage.prototype.setItem=function(key,v){if(key===k+'.unreadable')throw new DOMException('The quota has been exceeded.','QuotaExceededError');return o.call(this,key,v);};},KEY);
await page.reload();await page.waitForFunction(()=>window.__ironlog);await page.waitForTimeout(800);
await page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.state.settings.timeBudget=70;L.saveNow();L.render();});await page.waitForTimeout(600);
const stored=await page.evaluate(k=>localStorage.getItem(k),KEY);
console.log('stored unchanged:',stored===bad);
console.log('menu:',await page.evaluate(()=>{const el=document.getElementById('saveState');return el?el.getAttribute('aria-label'):'';}));
await browser.close();})();
