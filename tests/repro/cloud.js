// Shared mock cloud (same shape as tests/dataflow.js), with optional get delay.
const store=new Map();let delay={get:0};
const cloudSetup=async(ctx,page)=>{
  await page.exposeFunction('__dbGet',async p=>{if(delay.get)await new Promise(r=>setTimeout(r,delay.get));return store.has(p)?store.get(p):null;});
  await page.exposeFunction('__dbSet',(p,v)=>{store.set(p,v);return true;});
  await page.exposeFunction('__dbList',p=>JSON.stringify([...store.entries()].filter(([k])=>k.startsWith(p+'/')&&!k.slice(p.length+1).includes('/')).map(([k,v])=>[k.slice(p.length+1),v])));
  await page.addInitScript(()=>{window.claude={use:async k=>{
    if(k==='user')return {id:async()=>'u1'};
    if(k==='db')return {doc:p=>({get:async()=>{const v=await window.__dbGet(p);return v==null?{exists:false,data:()=>null}:{exists:true,data:()=>JSON.parse(v)};},set:async o=>{await window.__dbSet(p,JSON.stringify(o));return true;}}),collection:p=>({get:async()=>{const l=JSON.parse(await window.__dbList(p));return {docs:l.map(([id,v])=>({id,exists:true,data:()=>JSON.parse(v)}))};}})};
    return null;}};});
};
module.exports={store,delay,cloudSetup,wait:ms=>new Promise(r=>setTimeout(r,ms))};
