/* ---------- CLOUD SYNC ----------
   localStorage alone is not durable on a phone: iOS deletes a site's storage
   after 7 days without a visit, clearing browser data wipes it, and a new
   phone starts empty. When the page runs inside Claude, the same data is also
   kept in this artifact's database under data/users/<you>/, which is private
   to your account (not even the artifact owner can read another viewer's).
   localStorage stays the instant, offline copy; the cloud is the durable one.

   Layout: one document for routines, exercises, settings and body data, one for
   the in-progress session, and one per half-month of sessions, so no document
   nears the 256 KB cap and logging a set rewrites only the small draft doc.
   Each document stores its chunk as a JSON string with a timestamp. Only chunks
   whose content changed are written, one at a time, in order. */
const cloud={on:false,db:null,uid:null,status:'local',last:null,meta:{},editAt:{},localH:{},devId:null,pendAt:null,chain:Promise.resolve(),t:null,retry:0,dirtyAt:0,lastPull:0,err:null};
const SYNC_KEY=KEY+'.sync';
try{const m=JSON.parse(localStorage.getItem(SYNC_KEY)||'null');if(m&&typeof m==='object'){cloud.meta=m.meta&&typeof m.meta==='object'?m.meta:{};cloud.last=m.last||null;cloud.editAt=m.editAt&&typeof m.editAt==='object'?m.editAt:{};cloud.devId=typeof m.devId==='string'?m.devId:null;cloud.acct=typeof m.acct==='string'?m.acct:null;}}catch(e){log('sync-meta',e);}
if(!cloud.devId)cloud.devId='dev-'+uid();
/* No readable local data at startup (unreadable save, or storage cleared but
   the sync notes survived): the fresh state here is not an edit. Forget what
   was last agreed with the cloud, so the first pull adopts the cloud copy
   instead of the first flush writing an empty state over it. */
if(!bootHadLocal){cloud.meta={};cloud.editAt={};}
function saveMeta(){try{localStorage.setItem(SYNC_KEY,JSON.stringify({meta:cloud.meta,last:cloud.last,editAt:cloud.editAt,devId:cloud.devId,acct:cloud.acct||undefined}));}catch(e){log('sync-meta',e);}}
function hashStr(str){let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return (h2>>>0).toString(36)+(h1>>>0).toString(36);}
const chunkOf=date=>`s-${date.slice(0,7)}-${+date.slice(8,10)<=15?1:2}`;
const bySess=sessCmp;
/* Body data (item 19): bodyweights and tape measurements sync in one document
   per year, b-YYYY, instead of inside core, where years of daily weigh-ins
   would have passed the size cap and stopped core (routines, settings) from
   syncing. Builds before r22 read only core, draft and s- documents and never
   touch a b- document, so they cannot delete one; they still write weigh-ins
   into core, and those are picked up (legacyBody) and moved on the next sync. */
const bodyChunkOf=date=>'b-'+String(date||'').slice(0,4);
function chunksOf(st){
  /* Core still carries the two keys, always empty, in the place r21 wrote
     them. An older build then reads a core shaped like its own and writes it
     back unchanged, instead of both builds rewriting core on every sync. */
  const out={core:{version:st.version,settings:st.settings,exercises:st.exercises,routines:st.routines,activeRoutineId:st.activeRoutineId,bodyweights:[],measurements:[],deloadWeek:st.deloadWeek||null,injuries:st.injuries||[],trash:st.trash||[]},draft:{draft:st.draft||null}};
  for(const k of ['bodyweights','measurements'])for(const x of (st[k]||[])){const c=out[bodyChunkOf(x.date)]||(out[bodyChunkOf(x.date)]={});(c[k]||(c[k]=[])).push(x);}
  for(const id in out)if(id.startsWith('b-'))for(const k in out[id])out[id][k].sort(bySess);
  for(const x of st.sessions){const k=chunkOf(x.date);(out[k]||(out[k]={sessions:[]})).sessions.push(x);}
  // Cardio shares the half-month documents. The key is only written when a
  // chunk has cardio, so documents without any are byte-identical to before.
  for(const x of (st.cardio||[])){const k=chunkOf(x.date);const c=out[k]||(out[k]={sessions:[]});(c.cardio||(c.cardio=[])).push(x);}
  for(const k in out){if(out[k].sessions)out[k].sessions.sort(bySess);if(out[k].cardio)out[k].cardio.sort(bySess);}
  return out;
}
const emptyChunk=id=>id==='core'?null:id==='draft'?{draft:null}:id.startsWith('b-')?{}:{sessions:[]};
function assemble(parts){
  const core=parts.core||{};const sessions=[],cardio=[],bw=[],ms=[];
  for(const k in parts)if(k.startsWith('s-')&&parts[k]){if(Array.isArray(parts[k].sessions))sessions.push(...parts[k].sessions);if(Array.isArray(parts[k].cardio))cardio.push(...parts[k].cardio);}
  for(const k in parts)if(k.startsWith('b-')&&parts[k]){if(Array.isArray(parts[k].bodyweights))bw.push(...parts[k].bodyweights);if(Array.isArray(parts[k].measurements))ms.push(...parts[k].measurements);}
  // A body document wins over a copy of the same record still in an older core.
  const L=legacyBody(core);
  return normalize({...core,bodyweights:unionById(bw,L.bodyweights),measurements:unionById(ms,L.measurements),sessions,cardio,draft:parts.draft?parts.draft.draft:null});
}
/* Weigh-ins and measurements that a build before r22 wrote into core. */
/* The first time a device sees a body document it has no base for it. Its
   core base from before r22 already records which weigh-ins both sides had
   agreed on, by id, so that serves as the base: a weigh-in deleted on a
   device that updated first stays deleted when this one updates. Read before
   any document is processed, since syncing core replaces that base. */
function legacyBodyBase(){const a=cloud.meta.core&&cloud.meta.core.b&&cloud.meta.core.b.a;if(!a||!(a.bodyweights||a.measurements))return null;return {a:{bodyweights:a.bodyweights||{},measurements:a.measurements||{}}};}
const baseFor=(id,m,legB)=>m&&m.b?m.b:id.startsWith('b-')?legB:null;
function legacyBody(raw){return {bodyweights:raw&&Array.isArray(raw.bodyweights)?raw.bodyweights:[],measurements:raw&&Array.isArray(raw.measurements)?raw.measurements:[]};}
/* Adds them to the log without replacing anything already here; the next
   sync writes them into their body documents. Returns whether any were new. */
function absorbLegacy(L){
  const add=k=>{const have=new Set((state[k]||[]).map(x=>x&&x.id));return (L[k]||[]).filter(x=>x&&typeof x.id==='string'&&!have.has(x.id));};
  const bw=add('bodyweights'),ms=add('measurements');if(!bw.length&&!ms.length)return false;
  state=normalize({...state,bodyweights:state.bodyweights.concat(bw),measurements:state.measurements.concat(ms)});return true;
}
function unionById(a,b){const m=new Map();for(const x of b||[])if(x&&x.id)m.set(x.id,x);for(const x of a||[])if(x&&x.id)m.set(x.id,x);return [...m.values()];}
const realCount=st=>st.sessions.filter(x=>!x.demo).length;
const cq=fn=>(cloud.chain=cloud.chain.then(fn,fn));
function withTimeout(pr,ms){return Promise.race([pr,new Promise((_,rej)=>setTimeout(()=>rej({code:'timeout'}),ms))]);}
function setCloud(st,err){cloud.status=st;cloud.err=err||null;setSaveState();const el=document.getElementById('syncInfo');if(el)el.innerHTML=syncInfo();}
function ref(id){return cloud.db.doc(`data/users/${cloud.uid}/${id}`);}
function cloudFail(e){
  const c=e&&e.code;
  if(c==='revoked'||c==='not_granted'||c==='capability_disabled'||c==='capability_removed'){cloud.on=false;setCloud('local');render();return;}
  if(c==='quota_exceeded'){setCloud('offline','The cloud copy is full. Export a backup and delete old demo data.');return;}
  setCloud('offline',c==='denied'?e.message:undefined);
  const wait=[5,15,60,180][Math.min(cloud.retry++,3)]*1000;clearTimeout(cloud.t);cloud.t=setTimeout(()=>cq(cloudFlush),wait);
}
/* ---------- three-way merge ----------
   Each synced document remembers the per-record hashes of the version both
   sides last agreed on (its base). On a conflict every record is judged on
   its own: changed on one side only, that side wins, deletions included; changed
   on both, the side edited later wins and the conflict is counted and shown.
   A record changed on one side and deleted on the other is kept, because
   keeping data is the recoverable mistake. Without a base (a document last
   synced by an older build) nothing can be judged deleted, so both sides'
   records are kept, which is how sync behaved before. */
/* Record fingerprint that ignores key order. A record saved straight from the
   logger and the same record after normalize() list their fields in a
   different order; a plain JSON hash called that an edit, and a deleted
   session could come back. */
function canon(x){
  if(x===undefined)return 'null';
  if(x===null||typeof x!=='object')return JSON.stringify(x);
  if(Array.isArray(x))return '['+x.map(canon).join(',')+']';
  return '{'+Object.keys(x).filter(k=>x[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canon(x[k])).join(',')+'}';
}
const Hx=x=>hashStr(canon(x));
const CORE_ARR=['routines','exercises','injuries','trash'];
const CORE_FIELDS=['version','activeRoutineId','deloadWeek'];
/* Every comparison runs on the normalized form of a document. A record saved
   straight from the logger lacks defaults that normalize() adds later (demo,
   light), so without this the same session read as edited and a deletion on
   the other device was undone. */
function normChunk(id,data){
  if(!data)return data;
  try{
    if(id==='core')return chunksOf(normalize({...data,sessions:[],cardio:[],draft:null})).core;
    if(id==='draft')return {draft:normalize({draft:data.draft||null}).draft};
    if(id.startsWith('b-'))return chunksOf(normalize({bodyweights:data.bodyweights||[],measurements:data.measurements||[]}))[id]||{};
    return chunksOf(normalize({sessions:data.sessions||[],cardio:data.cardio||[]}))[id]||{sessions:[]};
  }catch(e){log('sync-norm',e);return data;}
}
function baseOf(id,data){
  if(!data)return null;data=normChunk(id,data);
  const hl=list=>{const o={};for(const x of list||[])if(x&&typeof x.id==='string')o[x.id]=Hx(x);return o;};
  if(id==='core'){const b={a:{},f:{},s:{}};for(const k of CORE_ARR)b.a[k]=hl(data[k]);for(const k of CORE_FIELDS)b.f[k]=Hx(data[k]);for(const k in (data.settings||{}))b.s[k]=Hx(data.settings[k]);return b;}
  if(id==='draft')return {d:Hx(data.draft)};
  if(id.startsWith('b-'))return {a:{bodyweights:hl(data.bodyweights),measurements:hl(data.measurements)}};
  return {a:{sessions:hl(data.sessions),cardio:hl(data.cardio)}};
}
function merge3List(base,l,r,remoteWins,stat){
  const known=!!base;base=base||{};
  const L=new Map(),Rm=new Map();
  for(const x of l||[])if(x&&typeof x.id==='string')L.set(x.id,x);
  for(const x of r||[])if(x&&typeof x.id==='string')Rm.set(x.id,x);
  const out=[];
  for(const id of [...L.keys(),...[...Rm.keys()].filter(k=>!L.has(k))]){
    const a=L.get(id),b=Rm.get(id),bh=known?base[id]:'?';
    const ah=a?Hx(a):undefined,rh=b?Hx(b):undefined;
    if(ah===rh){out.push(a);continue;}
    if(!a||!b){
      // Present on one side only. Deleted by the other side if the present copy
      // is exactly the base; otherwise it is new or edited there, so keep it.
      const p=a||b,ph=a?ah:rh;
      if(known&&ph===bh)continue;
      out.push(p);continue;
    }
    if(ah===bh){out.push(b);continue;}
    if(rh===bh){out.push(a);continue;}
    stat.conflicts++;out.push(remoteWins?b:a);
  }
  return out;
}
function merge3Val(bh,a,b,remoteWins,stat){
  const ah=Hx(a),rh=Hx(b);
  if(ah===rh||rh===bh)return a;
  if(ah===bh)return b;
  stat.conflicts++;return remoteWins?b:a;
}
function mergeChunk(id,base,local,remote,remoteWins,stat){
  local=normChunk(id,local||emptyChunk(id))||{};remote=normChunk(id,remote||emptyChunk(id))||{};
  if(id==='core'){
    const out={...local};const ba=base&&base.a||null,bf=base&&base.f||{},bs=base&&base.s||{};
    for(const k of CORE_ARR)out[k]=merge3List(ba?ba[k]||{}:null,local[k],remote[k],remoteWins,stat);
    for(const k of CORE_FIELDS){const v=merge3Val(base?bf[k]:'?',local[k],remote[k],remoteWins,stat);if(v===undefined)delete out[k];else out[k]=v;}
    const ls=local.settings||{},rs=remote.settings||{};out.settings={};
    /* A setting absent from the base was absent, not unknown (r33): a key one
       side added (Your gym, an accent) or brought back by Undo is a change on
       that side, not a conflict the other side's absence could win. */
    for(const k of new Set([...Object.keys(ls),...Object.keys(rs)])){const v=merge3Val(base?(k in bs?bs[k]:Hx(undefined)):'?',ls[k],rs[k],remoteWins,stat);if(v!==undefined)out.settings[k]=v;}
    return out;
  }
  if(id==='draft'){
    // One session in progress is one record: it is not merged set by set.
    const v=merge3Val(base?base.d:'?',local.draft||null,remote.draft||null,remoteWins,stat);return {draft:v===undefined?null:v};
  }
  if(id.startsWith('b-')){
    const ba=base&&base.a||null;const out={};
    for(const k of ['bodyweights','measurements']){const v=merge3List(ba?ba[k]||{}:null,local[k],remote[k],remoteWins,stat);if(v.length)out[k]=v;}
    return out;
  }
  const ba=base&&base.a||null;const out={sessions:merge3List(ba?ba.sessions||{}:null,local.sessions,remote.sessions,remoteWins,stat)};
  const c=merge3List(ba?ba.cardio||{}:null,local.cardio,remote.cardio,remoteWins,stat);if(c.length)out.cardio=c;
  return out;
}
/* Put one merged document back into state. */
function applyChunk(id,data){
  if(id==='core'){const c=data||{};state=normalize({...state,version:c.version,settings:c.settings,exercises:c.exercises,routines:c.routines,activeRoutineId:c.activeRoutineId,deloadWeek:c.deloadWeek,injuries:c.injuries,trash:c.trash});}
  else if(id.startsWith('b-')){const c=data||{};state=normalize({...state,bodyweights:state.bodyweights.filter(q=>bodyChunkOf(q.date)!==id).concat(c.bodyweights||[]),measurements:state.measurements.filter(q=>bodyChunkOf(q.date)!==id).concat(c.measurements||[])});}
  else if(id==='draft')state=normalize({...state,draft:data?data.draft:null});
  else state=normalize({...state,sessions:state.sessions.filter(q=>chunkOf(q.date)!==id).concat((data&&data.sessions)||[]),cardio:(state.cardio||[]).filter(q=>chunkOf(q.date)!==id).concat((data&&data.cardio)||[])});
}
const isChunkId=id=>id==='core'||id==='draft'||/^s-\d{4}-\d{2}-[12]$/.test(id)||/^b-\d{4}$/.test(id);
/* When each document last changed on this device. It decides conflicts, so it
   is tracked per document: an edit to a session no longer makes an older
   routine edit look new. Kept across reloads. */
/* Called on every save, so it only notes the time; the hashing runs once the
   taps pause, and again before any sync, so logging a set stays instant. */
let trackT=null;
function markEdit(){if(!cloud.pendAt)cloud.pendAt=Date.now();clearTimeout(trackT);trackT=setTimeout(trackEdits,800);}
function trackEdits(){
  clearTimeout(trackT);trackT=null;
  try{
    const ch=chunksOf(state);const now=cloud.pendAt||Date.now();cloud.pendAt=null;let moved=false;
    for(const id of new Set([...Object.keys(ch),...Object.keys(cloud.localH)])){
      // Same-device change detection: key order is stable here, so the fast hash is enough.
      const h=hashStr(JSON.stringify(ch[id]||emptyChunk(id)));
      if(cloud.localH[id]!==h){if(cloud.localH[id]!==undefined){cloud.editAt[id]=now;moved=true;}cloud.localH[id]=h;}
    }
    if(moved)saveMeta();
  }catch(e){log('sync-track',e);}
}
/* After adopting or merging, record the new content as seen without marking
   it as a local edit. */
function resyncLocalH(){try{const ch=chunksOf(state);cloud.localH={};for(const id in ch)cloud.localH[id]=hashStr(JSON.stringify(ch[id]));for(const id in cloud.meta)if(!(id in cloud.localH))cloud.localH[id]=hashStr(JSON.stringify(emptyChunk(id)));}catch(e){log('sync-track',e);}}
/* The session in progress is one record, so another device finishing or
   discarding it replaces this one's (the later edit wins). Said in its own
   words rather than the generic note (r45, audit item 288). */
function draftNote(prev){
  if(!prev||state.draft&&state.draft.id===prev.id)return;
  /* Only called when the draft document itself came from the cloud, so a
     Finish or Discard made here during a sync is never put on another device. */
  if(prev.editingId){toast(state.draft?'The edit in progress was replaced by the workout on another device.':'The edit in progress was closed on another device.');return;}
  const sid=prev.id;
  toast(state.sessions.some(s=>s.id===sid)?'The workout in progress was saved on another device.':state.draft?'The workout in progress was replaced by the one on another device.':'The workout in progress was discarded on another device.');
}
function conflictNote(stat){if(stat.conflicts){log('sync-conflict',`${stat.conflicts} record(s) edited on two devices; kept the later edit`);toast(`${stat.conflicts} item${stat.conflicts===1?' was':'s were'} edited on two devices. The later edit was kept.`);}}
/* A short lease on a lock document so two devices do not interleave their
   read-then-write of the same documents. If the lease is unavailable the
   write goes ahead, exactly as before; if another device holds it, this one
   waits and retries. */
async function takeLease(){
  try{
    const r=ref('lock');if(typeof r.acquire!=='function')return true;
    const res=await withTimeout(r.acquire({holder:cloud.devId,ttlMs:30000}),10000);
    return !(res&&res.acquired===false);
  }catch(e){log('sync-lease',e);return true;}
}
/* Whether this device holds a change the account does not have yet, by the
   same test a sync uses, without sending anything: the status still reads
   synced for the second or so before the next sync starts (r34.2). */
function hasUnsent(){
  if(!cloud.on)return false;if(cloud.status!=='synced')return true;
  try{const ch=chunksOf(state);for(const id of new Set([...Object.keys(ch),...Object.keys(cloud.meta)])){if(!isChunkId(id))continue;const data=ch[id]||emptyChunk(id);if(!data)continue;const m=cloud.meta[id];if(!m||m.h!==hashStr(JSON.stringify(data)))return true;}}catch(e){log('sync-unsent',e);return true;}
  return false;
}
function cloudSoon(){if(!cloud.on)return;cloud.dirtyAt=Date.now();clearTimeout(cloud.t);cloud.t=setTimeout(()=>cq(cloudFlush),1200);}
async function cloudFlush(){
  if(!cloud.on)return;
  if(trackT||cloud.pendAt)trackEdits();
  const ch=chunksOf(state);const ids=new Set([...Object.keys(ch),...Object.keys(cloud.meta)]);
  const todo=[];
  let backfilled=false;
  for(const id of ids){if(!isChunkId(id))continue;const data=ch[id]||emptyChunk(id);if(!data)continue;const json=JSON.stringify(data);const h=hashStr(json);
    const m=cloud.meta[id];
    // Synced by an older build: identical to the cloud copy, so it is its own base.
    if(m&&!m.b&&m.h===h){m.b=baseOf(id,data);backfilled=true;}
    if(!m||m.h!==h)todo.push({id,json,h});}
  if(backfilled)saveMeta();
  /* The draft goes up last (r46, the r45 QC): Finish empties it and adds the
     session, and written first, a device pulling in between saw the workout
     gone and no session, and said it was discarded. */
  todo.sort((a,b)=>(a.id==='draft')-(b.id==='draft'));
  if(!todo.length){if(cloud.status!=='synced'){cloud.last=Date.now();saveMeta();setCloud('synced');}return;}
  setCloud('saving');
  try{
    if(!(await takeLease())){clearTimeout(cloud.t);cloud.t=setTimeout(()=>cq(cloudFlush),2500);return;}
    let adopted=false,moreBody=false;const stat={conflicts:0};let dn=null;const tooBig=[];const legB=legacyBodyBase();
    for(const x of todo){
      /* Read before write. If another device changed this document since we
         last agreed on it, merge record by record instead of overwriting. */
      const m=cloud.meta[x.id];
      const snap=await withTimeout(ref(x.id).get(),20000);
      /* Sets logged while that read was in flight are in state, not in the
         copy taken before it. Work from the current document, or the merge
         below would write the older copy back and lose them. */
      let json=JSON.stringify(chunksOf(state)[x.id]||emptyChunk(x.id));
      const b=snap&&snap.exists?snap.data():null;
      /* Changed in the cloud means its content differs from what we last
         agreed on. Timestamps are not compared: they come from each device's
         own clock, and one running behind made a newer write look older. */
      if(b&&typeof b.json==='string'&&(!m||hashStr(b.json)!==m.h)){
        let rd=null;try{rd=JSON.parse(b.json);}catch(e){log('sync-parse',e);}
        if(rd){
          const ret=+b.et||+b.at;const merged=mergeChunk(x.id,baseFor(x.id,m,legB),JSON.parse(json),rd,ret>(cloud.editAt[x.id]||0),stat);
          cloud.editAt[x.id]=Math.max(cloud.editAt[x.id]||0,ret);
          if(x.id==='draft')dn={prev:state.draft};
          applyChunk(x.id,merged);adopted=true;
          if(x.id==='core'&&absorbLegacy(legacyBody(rd)))moreBody=true;
          json=JSON.stringify(chunksOf(state)[x.id]||emptyChunk(x.id));
          if(hashStr(json)===hashStr(b.json)){cloud.meta[x.id]={h:hashStr(b.json),at:+b.at,b:baseOf(x.id,rd)};saveMeta();continue;}
        }
      }
      // One document over the size cap must not stop the others from syncing.
      if(json.length>250000){tooBig.push(x.id);log('sync-flush',{code:'too_big',id:x.id,len:json.length});continue;}
      const at=Date.now();
      await withTimeout(ref(x.id).set({v:1,at,et:cloud.editAt[x.id]||at,json}),20000);
      cloud.meta[x.id]={h:hashStr(json),at,b:baseOf(x.id,JSON.parse(json))};saveMeta();
    }
    if(adopted){invalidate();try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){log('storage',e);}resyncLocalH();if(!ui.modal)rerenderKeepScroll();conflictNote(stat);if(dn)draftNote(dn.prev);}
    cloud.retry=0;
    // Weigh-ins found in an older core go to their body documents on the next pass.
    if(moreBody)cloudSoon();
    if(tooBig.length){saveMeta();setCloud('offline',tooBig.includes('core')?'Routines and settings are too large to sync. Export a backup.':tooBig.some(i=>i.startsWith('b-'))?'A year of body data is too large to sync. Export a backup.':'One month of sessions is too large to sync. Export a backup.');return;}
    cloud.last=Date.now();saveMeta();setCloud('synced');
  }catch(e){log('sync-flush',e);cloudFail(e);}
}
/* Pull what other devices wrote. Per document:
   - changed in the cloud only: take the cloud copy.
   - changed on both: merge record by record (see mergeChunk).
   - first link of a device that already had its own data: merge sessions,
     cardio and body logs from both, keep the side with more real sessions
     for routines and settings, and offer Undo. */
async function cloudPull(){
  if(!cloud.on)return;
  if(trackT||cloud.pendAt)trackEdits();
  setCloud('connecting');
  let snap;try{snap=await withTimeout(cloud.db.collection(`data/users/${cloud.uid}`).get(),20000);}catch(e){log('sync-pull',e);cloudFail(e);return;}
  cloud.lastPull=Date.now();
  const remote={};
  for(const d of snap.docs){if(!d.exists||!isChunkId(d.id))continue;const b=d.data();if(!b||typeof b.json!=='string')continue;try{remote[d.id]={at:+b.at||0,et:+b.et||+b.at||0,data:JSON.parse(b.json),h:hashStr(b.json)};}catch(e){log('sync-parse',e);}}
  const rids=Object.keys(remote);
  if(!rids.length){await cloudFlush();return;}
  const local=chunksOf(state);const first=!Object.keys(cloud.meta).length;
  let parts=null,merged=false,draftIn=false;const stat={conflicts:0};const adoptedIds=new Set();const leg={bodyweights:[],measurements:[]};const legB=legacyBodyBase();
  if(first){
    const rState=assemble(Object.fromEntries(rids.map(k=>[k,remote[k].data])));
    if(!bootHadLocal||(!realCount(state)&&!state.bodyweights.some(b=>!b.demo)&&!state.measurements.some(x=>!x.demo)&&!state.draft&&!(state.cardio||[]).length)){
      parts=Object.fromEntries(rids.map(k=>[k,remote[k].data]));rids.forEach(k=>adoptedIds.add(k));
    }else{
      snapshot();merged=true;
      const base=realCount(state)>realCount(rState)?state:rState,other=base===state?rState:state;
      /* Settings come from the side with more sessions, but exercises and
         routines are combined by id (that side's copy wins a clash), so a
         custom exercise or routine made on the other device is not lost and
         its logged sets keep their name. */
      state=normalize({...base,exercises:unionById(base.exercises,other.exercises),routines:unionById(base.routines,other.routines),sessions:unionById(state.sessions,rState.sessions),bodyweights:unionById(state.bodyweights,rState.bodyweights),measurements:unionById(state.measurements,rState.measurements),cardio:unionById(state.cardio,rState.cardio),trash:unionById(state.trash,rState.trash),draft:state.draft||rState.draft});
      // The cloud copy becomes the agreed base, so the merged result is what
      // the flush writes, rather than being merged a second time.
      for(const id of rids){cloud.meta[id]={h:remote[id].h,at:remote[id].at,b:baseOf(id,remote[id].data)};cloud.editAt[id]=Date.now();}
    }
  }else{
    parts={...local};let any=false;
    for(const id of rids){
      const r=remote[id],m=cloud.meta[id];
      // Unchanged in the cloud since we last agreed. Content, not clocks, decides.
      if(m&&r.h===m.h)continue;
      if(id==='draft')draftIn=true;
      const lJson=JSON.stringify(local[id]||emptyChunk(id));const localDirty=!m||hashStr(lJson)!==m.h;
      if(!localDirty){parts[id]=r.data;adoptedIds.add(id);any=true;continue;}
      if(id==='core'){const L=legacyBody(r.data);leg.bodyweights.push(...L.bodyweights);leg.measurements.push(...L.measurements);}
      parts[id]=mergeChunk(id,baseFor(id,m,legB),local[id]||emptyChunk(id),r.data,r.et>(cloud.editAt[id]||0),stat);
      cloud.editAt[id]=Math.max(cloud.editAt[id]||0,r.et);
      // The cloud copy is now the agreed base; the merge result is written by the flush below.
      cloud.meta[id]={h:r.h,at:r.at,b:baseOf(id,r.data)};any=true;
    }
    if(!any)parts=null;
  }
  const dr0=state.draft;
  if(parts){state=assemble(parts);absorbLegacy(leg);}
  if(parts||merged){
    invalidate();try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){log('storage',e);}
    for(const id of adoptedIds){
      // Mark adopted documents as agreed with the cloud copy. Normalizing can
      // change a document (a newer build adds defaults); it then differs from
      // the agreed hash, so the flush below writes the normalized form back.
      cloud.meta[id]={h:remote[id].h,at:remote[id].at,b:baseOf(id,remote[id].data)};}
    saveMeta();resyncLocalH();
    // Ready-made routines from earlier builds' Recently deleted leave here too,
    // and the cleared list goes back to the cloud (r34.1).
    {const n0=(state.trash||[]).length;state.trash=(state.trash||[]).filter(t=>!(t.kind==='routine'&&plainTemplate(t.data)));if(state.trash.length!==n0)saveNow();}
    if(!ui.modal)rerenderKeepScroll();else render();
    if(merged)toast('Merged this device with your cloud copy',true);
    conflictNote(stat);if(draftIn)draftNote(dr0);
  }else if(first){
    for(const id of rids)cloud.meta[id]={h:'x',at:remote[id].at,b:null};
  }
  await cloudFlush();
}
resyncLocalH();
/* Set once the first cloud check has finished either way, so the welcome
   card never flashes on a device that is about to load your cloud copy. */
let cloudChecked=false;
/* Where the cloud copy lives. Inside Claude it is the artifact's database.
   The standalone app has none yet; a future backend (for example a hosted
   database with sign-in) plugs in by defining window.ironlogCloud as an async
   function returning {db, userId}, where db offers the same calls the code
   below uses: doc(path).get() / .set(obj) / optional .acquire(), and
   collection(path).get() listing {id, exists, data()}. Nothing else changes:
   merging, chunking and conflict handling stay as they are. */
async function cloudProvider(){
  if(window.claude&&typeof window.claude.use==='function'){
    const [db,user]=await Promise.all([window.claude.use('db'),window.claude.use('user')]);
    if(!db||!user)return null;const id=await user.id();return id?{db,userId:id}:null;
  }
  if(typeof window.ironlogCloud==='function'){const p=await window.ironlogCloud();return p&&p.db&&p.userId?{db:p.db,userId:String(p.userId)}:null;}
  return null;
}
let cloudStarting=false;
async function cloudInit(){
  if(cloud.on||cloudStarting)return;
  cloudStarting=true;
  try{
    const pv=await cloudProvider();if(!pv)return;
    const db=pv.db,id=pv.userId;
    /* Sync notes belong to one account. Signing in to a different account on
       this device starts over as a first link (a merge with Undo), never as a
       continuation that could judge the other account's records deleted.
       Notes saved before accounts existed have no owner and are kept. */
    if(cloud.acct&&cloud.acct!==id){cloud.meta={};cloud.editAt={};cloud.last=null;}
    cloud.acct=id;saveMeta();
    cloud.db=db;cloud.uid=id;cloud.on=true;setCloud('connecting');
    if(ui.tab==='settings')render();
    await cq(cloudPull);
  }catch(e){cloud.on=false;setCloud('local');}
  finally{
    cloudStarting=false;
    cloudChecked=true;
    // The first page waits for this check (a splash until then): after a sign-out too (r33).
    if(ui.tab==='today'&&!ui.modal&&(obGate()||(!state.settings.onboarded&&!state.draft&&!state.sessions.some(s=>!s.demo))))rerenderKeepScroll();
  }
}
