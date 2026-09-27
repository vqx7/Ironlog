// A backup (or cloud draft doc) whose draft block carries lastR strings: normalize()
// keeps lastR unvalidated and the logger interpolates it raw into placeholder="".
const {open}=require(require('path').join(__dirname,'..','h.js'));const P=require('path').join(__dirname,'..','..','index.html');
(async()=>{
const {browser,page}=await open(P,{clock:'2026-09-20T10:00:00'});
const txt=await page.evaluate(()=>{const L=window.__ironlog;const s=JSON.parse(JSON.stringify(L.state));s.settings.onboarded=true;
 s.draft={date:'2026-09-20',dayName:'D',ex:[{exId:'bench',plan:{},lastR:['"><img src=x data-xss=lastR onerror="window.__x=1">'],sets:[{w:null,r:null}]}]};
 return JSON.stringify({state:s});});
await page.evaluate(t=>window.__ironlog.importData(t),txt);await page.waitForTimeout(100);await page.click('[data-act="mOk"]');await page.waitForTimeout(300);
console.log(await page.evaluate(()=>({node:!!document.querySelector('[data-xss=lastR]'),fired:window.__x||0})));
await browser.close();})();
