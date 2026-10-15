/* ---------- storage ---------- */
/* The preview build (r24) is served from the same site as the live app, so
   the two would otherwise share this browser's storage: a preview could
   rewrite the live log, or migrate it forward to a shape the live build
   cannot read. Every stored key here is derived from KEY, so a different KEY
   (and undo database) keeps the preview's log apart. Only scripts/build.js
   --preview sets IRONLOG_ENV. */
const ENV=window.IRONLOG_ENV==='preview'?'preview':'live';
const KEY=ENV==='preview'?'ironlog-preview.v1':'ironlog.v1';
if(ENV==='preview')document.documentElement.dataset.env='preview';
/* Whether this device had a log before this page first ran. Read before any
   save, for the new-icon note (r25): only an existing install still has the
   old icon on its home screen. */
const HAD_LOG=(()=>{try{return localStorage.getItem(KEY)!=null;}catch(e){return false;}})();
/* Shown in Settings, in diagnostics and in backups, so a bug report can be
   matched to the exact build. */
const APP_VERSION='2026.10.15-r47';
/* The logo (r25): an upright dumbbell that is also the I of Ironlog. Same
   numbers as scripts/icons.py, which draws the app icons. */
const MARK_SVG='<svg class="mark" viewBox="-242 -378 484 756" aria-hidden="true" focusable="false"><rect class="mk-h" x="-30" y="-300" width="60" height="600" rx="14"/><rect class="mk-h" x="-80" y="-192" width="160" height="32" rx="12"/><rect class="mk-h" x="-80" y="160" width="160" height="32" rx="12"/><rect class="mk-p" x="-240" y="-376" width="480" height="92" rx="30"/><rect class="mk-p" x="-190" y="-270" width="380" height="66" rx="26"/><rect class="mk-p" x="-190" y="204" width="380" height="66" rx="26"/><rect class="mk-p" x="-240" y="284" width="480" height="92" rx="30"/></svg>';
const LOCKUP=`<span class="vh">Ironlog</span>${MARK_SVG}<span class="rn" aria-hidden="true">ron</span><span aria-hidden="true">log</span>`;
/* Diagnostics log: the last 60 errors, kept in this browser only. Errors that
   used to be swallowed silently land here, and Settings can copy them. */
const LOGK=KEY+'.log';
// Week or Month in This week on Today (r26), per device.
const WKVIEW_KEY=KEY+'.wkView';
const logBuf=(()=>{try{const a=JSON.parse(localStorage.getItem(LOGK)||'[]');return Array.isArray(a)?a:[];}catch(e){return [];}})();
/* A URL's query and fragment, cut from what the log keeps (r47). The log
   goes out with a problem report, and the page's own URL holds a reset
   link's token in its fragment for a moment after the link is opened; a stack
   frame carries that URL, and an error message can. Only the part after ? or #
   of a URL goes, up to the frame's :line:column, so the file and line stay and
   ordinary words with a ? or # in them are left alone. */
const logCut=t=>String(t).replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#)]*)[?#](?:[^\s):]|:(?!\d))*/gi,'$1');
function log(area,err){
  try{
    const m=err&&err.message?err.message:err&&typeof err==='object'?JSON.stringify(err):String(err);
    // Where it broke, not only what it said (r47): the first lines of the stack travel with a problem report, so a crash can be found in the code without the phone.
    const st=err&&typeof err.stack==='string'?logCut(err.stack.split('\n').slice(0,4).join('\n')).slice(0,400):'';
    logBuf.push({t:new Date().toISOString(),a:area,m:logCut(m).slice(0,300),v:APP_VERSION,...(st?{s:st}:{})});
    while(logBuf.length>60)logBuf.shift();
    localStorage.setItem(LOGK,JSON.stringify(logBuf));
  }catch(e){/* logging must never throw */}
}
window.addEventListener('error',e=>log('uncaught',e.error||e.message));
window.addEventListener('unhandledrejection',e=>log('promise',e.reason));
/* Bumped to 2 when per-side exercises and deleted-built-in tracking arrived.
   normalize() migrates v1 saves in place; nothing the user edited is touched. */
/* v4: cardio entries, the Recently deleted list, per-exercise load step and
   plate helper, and the lighter-session flag. Every v4 field has a default in
   normalize(), so v3 data loads unchanged. */
/* v5: two new muscles (serratus, rotator cuff). Built-in exercises that train
   them secondarily get the new muscle added; nothing else a user set is
   touched, because those keys could not exist before v5. */
const STATE_VERSION=5;
/* v3: routines became numbered cycles of 1 to 14 days. Older routines keep the
   same days in the same order and only change label, so no session loses its
   link to the day it was logged against. Fixed weekdays remain as an option. */
let storageOk=true;let bootHadLocal=false;let storageBoot=true;
/* The text this tab last wrote or adopted. Another tab's change is merged
   against it (see the storage listener). */
let lastSaved=null;
/* Undo steps: the state before a destructive action, and the state right
   after it (captured at the next save). See snapshot() and ACT.undo. */
const undoStack=[],UNDO_MAX=20;
/* Undo history survives a reload and a closed app (item 20). It holds whole
   copies of the log, so it lives in IndexedDB, whose quota is separate from
   and much larger than localStorage's: it can never crowd out the main save.
   Entries older than a week are dropped. The reversal functions some
   in-session entries carry cannot be stored; after a reload those entries
   undo through the three-way merge, which gives the same result. Best
   effort: without IndexedDB, Undo works as before, for this visit only. */
const UNDO_DB=ENV==='preview'?'ironlog-preview-undo':'ironlog-undo',UNDO_TTL=7*864e5;let undoDbP=null,undoT=null;
function undoDb(){
  if(!undoDbP)undoDbP=new Promise(res=>{try{const r=indexedDB.open(UNDO_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>res(r.result);r.onerror=()=>res(null);}catch(e){res(null);}});
  return undoDbP;
}
function undoPersist(){clearTimeout(undoT);undoT=setTimeout(async()=>{
  const db=await undoDb();if(!db)return;
  try{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(undoStack.map(e=>({pre:e.pre,post:e.post,t:e.t||Date.now()})),'stack');}catch(e){log('undo-save',e);}
},400);}
async function undoRestore(){
  const db=await undoDb();if(!db)return;
  const list=await new Promise(res=>{try{const q=db.transaction('kv').objectStore('kv').get('stack');q.onsuccess=()=>res(q.result||[]);q.onerror=()=>res([]);}catch(e){res([]);}});
  if(undoStack.length)return;
  const now=Date.now();for(const e of list)if(e&&typeof e.pre==='string'&&now-(+e.t||0)<UNDO_TTL)undoStack.push({pre:e.pre,post:typeof e.post==='string'?e.post:null,inv:null,t:+e.t});
  if(undoStack.length&&ui.tab==='settings'&&!ui.modal)rerenderKeepScroll();
}
function undoForget(){undoStack.length=0;clearTimeout(undoT);undoDb().then(db=>{if(!db)return;try{db.transaction('kv','readwrite').objectStore('kv').delete('stack');}catch(e){log('undo-clear',e);}});}
function storageTest(){try{localStorage.setItem('__il','1');localStorage.removeItem('__il');return true;}catch(e){return false;}}
/* Every field below is validated rather than trusted. The old version only
   checked that five keys were arrays, so a backup containing sessions:[{}]
   imported cleanly and then threw inside IDX() on the first render, leaving
   the app unusable with no obvious way back. normalize() runs on both load
   and import, so this also protects against a half-written localStorage
   record. Anything unusable is dropped; the count is reported to the caller
   via normalize.dropped. */
const isNum=v=>typeof v==='number'&&isFinite(v);
const numOr=(v,d)=>{const n=typeof v==='string'?parseFloat(v):v;return isNum(n)?n:d;};
const clampN=(v,lo,hi,d)=>{const n=numOr(v,d);return Math.min(Math.max(n,lo),hi);};
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
/* Upper limits for body entries. Past these a number is a typo, and an
   unbounded one showed as "Infinity lb" and broke waist-to-height. */
const BW_MAX_KG=400,BW_MIN_KG=20,MEAS_MAX_CM=300;
/* One cardio or mobility entry. In a draft the minutes may still be blank. */
/* Stable id for a record that arrived without one. It used to be random, so two
   devices repairing the same record made two different ids and a merge kept
   both. The position is included so identical records stay distinct. */
function did(tag,obj,i){let j='';try{j=JSON.stringify(obj);}catch(e){j=String(i);}return tag+hashStr(j+'#'+i);}
/* Ids go straight into HTML attributes and CSS selectors, so an imported
   backup or a cloud document must not be able to smuggle markup in through
   one. Every id the app makes itself fits this pattern. Anything else is
   replaced by a hash of itself, which is the same on every device, so a
   record and the references to it (an exercise and its logged sets) still
   match after the repair. */
// Names Object already has ("constructor", "__proto__") are out too: many
// lookups key plain objects by id, and those would find the built-in instead.
const okId=v=>typeof v==='string'&&/^[\w.:-]{1,100}$/.test(v)&&!(v in Object.prototype);
function fixId(v){return okId(v)?v:'x'+hashStr(String(v));}
const safeKey=k=>typeof k==='string'&&!/["'<>&`]/.test(k);
/* Fields a newer build adds to a record, kept as they came (r43). Every record
   is rebuilt from the fields this build knows, so a phone on an older build
   used to drop anything newer whenever it loaded or synced the log: an r37
   phone wiped a lift goal set on r38. A field this build does not know is now
   kept, untouched and never read. Only plain JSON data passes, under a name
   that cannot reach Object's prototype, at most EXTRA_KEYS fields and
   EXTRA_MAX characters of them (names included) per record, so a hostile
   backup or cloud row can neither run anything nor grow the log past what a
   sync document holds. `known` names fields this build writes only when valid
   (a load jump, a distance): an invalid one is dropped, not kept as if new.
   With anything kept, the record takes the key order it came in: sync
   documents are compared as written, key order included, so a newer build
   that puts its field mid-record and this one that put it last would rewrite
   each other's copy on every pull (found by the r43 review, the same loop as
   r21 and r28's settings). A record with nothing unknown comes out exactly as
   before, so its fingerprint and the sync are unchanged. */
const EXTRA_MAX=2000,EXTRA_KEYS=20;
const okExtraKey=k=>/^[A-Za-z][\w]{0,39}$/.test(k)&&!(k in Object.prototype);
function keepExtra(src,out,known){
  if(!src||typeof src!=='object'||Array.isArray(src))return out;
  let room=EXTRA_MAX,n=0;
  for(const k of Object.keys(src)){
    if(n>=EXTRA_KEYS)break;
    if(k in out||(known&&known.has(k))||!okExtraKey(k))continue;
    const v=src[k];if(v===undefined||typeof v==='function')continue;
    let j;try{j=JSON.stringify(v);}catch(e){continue;}
    const cost=j===undefined?0:k.length+j.length+4;
    if(j===undefined||cost>room)continue;
    room-=cost;n++;out[k]=JSON.parse(j);keepExtra.n++;
  }
  if(n){const own=k=>Object.prototype.hasOwnProperty.call(out,k);const ks=Object.keys(src).filter(own);for(const k of [...ks,...Object.keys(out).filter(k=>!ks.includes(k))]){const v=out[k];delete out[k];out[k]=v;}}
  return out;
}
keepExtra.n=0;
const KNOWN_ITEM=new Set(['jump']),KNOWN_CARDIO=new Set(['dist']),KNOWN_MEAS=new Set(MEAS.map(x=>x[0]));
/* A calibration set: the rep you would normally have stopped at, and the reps
   you thought were left there. The set itself is logged to failure. */
function cleanCal(c){
  if(!c||typeof c!=='object')return null;
  const at=numOr(c.at,NaN),pred=numOr(c.pred,NaN);
  if(!isNum(at)||!isNum(pred)||at<1||pred<0)return null;
  return {at:Math.min(Math.round(at),1000),pred:Math.min(Math.round(pred*2)/2,10)};
}
/* Pre-session check-in: 1 poor, 2 OK, 3 good, per question. */
function cleanChk(c){
  if(!c||typeof c!=='object')return null;const o={};
  for(const k of ['sleep','energy','joints']){const v=Math.round(numOr(c[k],NaN));if(v>=1&&v<=3)o[k]=v;}
  return Object.keys(o).length?o:null;
}
/* Distance (r30) is stored in km, shown in miles to someone logging in lb.
   Optional and absent unless given, so older entries keep their hashes. */
const distU=()=>U()==='kg'?'km':'mi';
const KM_MI=1.609344;
const distShow=km=>Math.round((U()==='kg'?km:km/KM_MI)*100)/100;
const distIn=v=>{const n=numIn(v);return n!=null&&n>0?Math.min(Math.round((U()==='kg'?n:n*KM_MI)*1000)/1000,1000):null;};
function cleanCardio(c,draft,i){
  const m=numOr(c.min,NaN),hr=numOr(c.hr,NaN),dk=numOr(c.dist,NaN);
  return keepExtra(c,{id:typeof c.id==='string'?fixId(c.id):did('c',c,i),date:isDate(c.date)?c.date:today(),kind:CARDIOL[c.kind]?c.kind:'other',
    min:isNum(m)&&m>0?Math.min(Math.round(m),600):(draft?null:1),hr:isNum(hr)&&hr>=30&&hr<=230?Math.round(hr):null,
    when:CWHENL[c.when]?c.when:'solo',note:typeof c.note==='string'?c.note.slice(0,200):'',demo:!!c.demo,
    ...(isNum(dk)&&dk>0?{dist:Math.min(Math.round(dk*1000)/1000,1000)}:{})},KNOWN_CARDIO);
}
/* The load or reps target set when the session started. Only its numbers are
   read, so only numbers survive. */
function cleanTgt(t){
  if(!t||typeof t!=='object'||(t.kind!=='load'&&t.kind!=='reps'))return null;
  const o={kind:t.kind};
  for(const k of ['w','repMin','total','n','prevBest']){if(!(k in t))continue;const v=t[k];o[k]=v==null?null:(isNum(numOr(v,NaN))?numOr(v,0):null);}
  if(Array.isArray(t.rs))o.rs=t.rs.slice(0,30).map(v=>{const n=numOr(v,NaN);return isNum(n)&&n>=0?Math.min(n,1000):0;});
  return o;
}
/* One logged session, every field checked. Also used on the copies kept in
   Recently deleted, so a copy there can be compared with a live one. */
const okSess=ss=>!!ss&&typeof ss==='object'&&isDate(ss.date)&&Array.isArray(ss.ex);
function cleanSess(ss,si){
  return keepExtra(ss,{
    id:typeof ss.id==='string'?fixId(ss.id):did('s',ss,si),date:ss.date,
    dayIdx:clampN(ss.dayIdx,0,MAX_DAYS-1,0),
    dayId:typeof ss.dayId==='string'?fixId(ss.dayId):null,
    durMin:Number.isFinite(+ss.durMin)&&+ss.durMin>=1&&+ss.durMin<=600?Math.round(+ss.durMin):null,
    dayName:typeof ss.dayName==='string'?ss.dayName:'Session',
    routineId:typeof ss.routineId==='string'&&ss.routineId?fixId(ss.routineId):'',
    notes:typeof ss.notes==='string'?ss.notes:'',
    demo:!!ss.demo,deload:!!ss.deload,
    light:ss.light===true||(ss.light==null&&typeof ss.dayName==='string'&&/ \(lighter\)$/.test(ss.dayName)),
    // Freestyle: not tied to a routine day. Check-in: the three pre-session taps.
    free:ss.free===true?true:undefined,
    chk:cleanChk(ss.chk)||undefined,
    ex:ss.ex.filter(b=>b&&typeof b.exId==='string'&&Array.isArray(b.sets)).map(b=>keepExtra(b,{
      exId:fixId(b.exId),
      note:typeof b.note==='string'?b.note:'',
      // Planned rep range at the time, [min,max]. Older sessions have none.
      rr:Array.isArray(b.rr)&&b.rr.length===2&&b.rr.every(v=>Number.isFinite(+v)&&+v>0)?[Math.round(+b.rr[0]),Math.round(+b.rr[1])]:null,
      // Sets trimmed by Short on time: kept out of trends like a lighter session.
      cut:b.cut===true?true:undefined,
      // One exercise made lighter mid-session (r31, Make it lighter): out of trends and targets, the rest of the session counts.
      light:b.light===true?true:undefined,
      sets:b.sets.filter(x=>x&&typeof x==='object').map(x=>keepExtra(x,{
        // Below 0 only for assisted sets (bodyweight minus the machine's help).
        w:clampN(x.w,-300,20000*LB,0),
        r:Math.round(clampN(x.r,0,1000,0)),
        rir:x.rir==null||x.rir===''?null:clampN(x.rir,0,10,null),
        warm:!!x.warm,drop:!!x.drop&&!x.warm,
        cal:x.warm?undefined:(cleanCal(x.cal)||undefined)
      }))
    })).filter(b=>b.sets.length),
    // When the session started (r34): orders two sessions on one day. Absent on older ones, so their records hash as before.
    t:Number.isFinite(+ss.t)&&+ss.t>0?Math.round(+ss.t):undefined
  });
}
/* One order for sessions everywhere (r34, two-a-days): by date, then by the
   time each started, then by id. Ordered by date alone, a morning and an
   evening session on one day came out in whatever order the list held, and
   after a sync by their random ids, so "last time" could be the morning. */
const sessCmp=(a,b)=>a.date<b.date?-1:a.date>b.date?1:((a.t||0)-(b.t||0))||(a.id<b.id?-1:a.id>b.id?1:0);
function normalize(s){
  const f=freshState();
  normalize.dropped=0;
  // A new device and Erase everything both start here, fully normalized:
  // the raw fresh state lacks fields (section order, folds) every view reads.
  if(!s||typeof s!=='object')s=f;
  // drop() is one record; drop(n) is n, and drop(0) is none (it used to count 1).
  const drop=n=>{normalize.dropped+=n==null?1:Math.max(0,n);};
  const out={...f,...s};

  /* A save from before a setting existed reads it as the app behaved then,
     not as a new install starts (r28): auto-mark off, nothing hidden, the
     code's own section order. Only a new device or Erase everything (s is
     the fresh state itself) gets the new-install layout and auto-mark on. */
  const fresh=s===f;
  const base=fresh?f.settings:{...f.settings,autoDone:false,hidden:[]};
  out.settings={...base,...(s.settings||{})};
  out.settings.unit=out.settings.unit==='kg'?'kg':'lb';
  out.settings.theme=['system','dark','light'].includes(out.settings.theme)?out.settings.theme:'system';
  // Timer and logging preferences. Older saves have none of these, so each
  // falls back to exactly how the app behaved before they existed.
  out.settings.timerMode=['auto','manual','off'].includes(out.settings.timerMode)?out.settings.timerMode:'auto';
  out.settings.timerSound=out.settings.timerSound!==false;
  out.settings.timerCompact=out.settings.timerCompact===true;
  out.settings.autoDone=out.settings.autoDone===true;
  // Optional settings added in r20 stay undefined unless set, so older
  // records keep their fingerprints and sync does not see them as edited.
  if(!['blue','volt','ember','pink'].includes(out.settings.accent))delete out.settings.accent;
  if(out.settings.rirAsk!==true)delete out.settings.rirAsk;
  // Count RIR 4 to 5 as half a set (r40): absent unless on.
  if(out.settings.rirHalf!==true)delete out.settings.rirHalf;
  // r34: adjusting the next sets is on unless turned off; only false is stored, so older saves hash as before.
  if(out.settings.autoAdj!==false)delete out.settings.autoAdj;
  // r34: weigh-in reminder in days (0 off); absent is every 14 days.
  if(![0,7,30].includes(out.settings.bwEvery))delete out.settings.bwEvery;
  // r34: Today opens on a blank session; absent is the plan's day.
  if(out.settings.todayStart!=='free')delete out.settings.todayStart;
  // r34: rest weeks, week-start dates; the last two years kept.
  {const r=Array.isArray(out.settings.restWeeks)?[...new Set(out.settings.restWeeks.filter(isDate))].sort().slice(-104):[];if(r.length)out.settings.restWeeks=r;else delete out.settings.restWeeks;}
  // r33 (item 206): effort in half points or RPE; absent is whole RIR, so older saves hash as before.
  if(out.settings.rirScale!=='half'&&out.settings.rirScale!=='rpe')delete out.settings.rirScale;
  // r25: suggested loads show grey until typed; 'fill' puts them in the rows
  // as before. Unset means grey (V's choice), so older saves change nothing
  // stored.
  if(out.settings.loadFill!=='fill')delete out.settings.loadFill;
  {const n=typeof out.settings.userName==='string'?out.settings.userName.replace(/\s+/g,' ').trim().slice(0,40):'';if(n)out.settings.userName=n;else delete out.settings.userName;}
  out.settings.homeFolded=Array.isArray(out.settings.homeFolded)?out.settings.homeFolded.filter(k=>['map','body','week','tiles','coach','injuries'].includes(k)):[];
  // Section order per tab (drag the ⠿ in a section header) and the folded
  // state of sections that older builds had no fold for. Absent means the
  // default order with everything open, exactly as before.
  // A new install starts in the default order (r28). The key is added here,
  // after the others, as every build before r28 adds it, so the synced
  // settings keep one key order across builds and no build rewrites another's.
  {const so=out.settings.secOrder===undefined&&fresh?defaultOrder():out.settings.secOrder;const clean={};
   if(so&&typeof so==='object')for(const t of SEC_TABS)if(Array.isArray(so[t]))clean[t]=so[t].filter(k=>safeKey(k)&&k.length<40).slice(0,40);
   out.settings.secOrder=clean;}
  out.settings.folds=Array.isArray(out.settings.folds)?out.settings.folds.filter(k=>safeKey(k)&&k.length<80).slice(0,200):[];
  out.settings.wakeLock=out.settings.wakeLock===true;
  // Small change plates (r29, item 98): absent unless on, so saves without it hash as before.
  if(out.settings.smallPlates!==true)delete out.settings.smallPlates;
  // Your gym (r33, item 207): absent unless set; rebuilt in one key order so a save hashes the same every time.
  {const g=gymClean(out.settings.gym);if(g)out.settings.gym=g;else delete out.settings.gym;}
  // The profile (r44, item 271): absent unless set, rebuilt in one key order.
  {const p=profClean(out.settings.profile);if(p)out.settings.profile=p;else delete out.settings.profile;}
  // The floors a first-run routine pick set (r44): absent unless set, whole sets 0 to 100, in muscle order.
  {const f=out.settings.bandsFit;const o={};if(f&&typeof f==='object'&&!Array.isArray(f))for(const m of MK){const v=f[m];if(!TRACK_ONLY.has(m)&&Number.isInteger(v)&&v>=0&&v<=100)o[m]=v;}
   if(Object.keys(o).length)out.settings.bandsFit=o;else delete out.settings.bandsFit;}
  // RIR: on (as logged), cal (on, shifted by your calibration sets), off.
  out.settings.rirMode=['on','off','cal'].includes(out.settings.rirMode)?out.settings.rirMode:'on';
  out.settings.hidden=Array.isArray(out.settings.hidden)?[...new Set(out.settings.hidden.filter(k=>typeof k==='string'&&HIDEABLE_KEYS.has(k)))]:[];
  out.settings.onboarded=out.settings.onboarded===true;
  out.settings.calSnooze=isDate(out.settings.calSnooze)?out.settings.calSnooze:null;
  // Legacy fold flag from older builds; unused, kept so old saves round-trip.
  out.settings.tidyV=numOr(out.settings.tidyV,0)>=1?1:0;
  // Height in cm for waist-to-height; the one body measure that does not change.
  {const hc=numOr(out.settings.heightCm,NaN);out.settings.heightCm=isNum(hc)&&hc>=100&&hc<=250?Math.round(hc*10)/10:null;}
  {const tb=numOr(out.settings.timeBudget,NaN);out.settings.timeBudget=isNum(tb)&&tb>=10?Math.min(Math.round(tb),300):null;}
  out.settings.priorities=Array.isArray(out.settings.priorities)?out.settings.priorities.filter(k=>MK.includes(k)):[];
  // Absent (older saves) means the defaults apply once; after that the user's folds win.
  out.settings.dashFolded=Array.isArray((s.settings||{}).dashFolded)?s.settings.dashFolded.filter(k=>DSEC_KEYS.includes(k)):DSEC_FOLDED.slice();
  out.settings.lastExport=isDate(out.settings.lastExport)?out.settings.lastExport:null;
  // Built-in exercises the user deleted. Without this the library list below
  // silently puts every one of them back on the next load.
  out.settings.removedLib=Array.isArray((s.settings||{}).removedLib)?s.settings.removedLib.filter(x=>typeof x==='string').map(fixId):[];
  const bk=numOr(out.settings.barKg,NaN);out.settings.barKg=isNum(bk)&&bk>0?Math.min(bk,50):null;
  const bg=numOr(out.settings.bwGoalPct,NaN);out.settings.bwGoalPct=isNum(bg)?Math.min(Math.max(bg,-2),2):null;
  const inBands={...((s.settings||{}).bands||{})};
  out.settings.bands={};
  for(const m of MK){
    const b=inBands[m];
    let lo=Array.isArray(b)?clampN(b[0],0,100,BANDS[m][0]):BANDS[m][0];
    let hi=Array.isArray(b)?clampN(b[1],0,100,BANDS[m][1]):BANDS[m][1];
    if(lo>hi){const t=lo;lo=hi;hi=t;}
    out.settings.bands[m]=[lo,hi];
  }

  for(const k of ['exercises','routines','sessions','bodyweights','measurements','cardio','trash'])if(!Array.isArray(out[k]))out[k]=[];

  out.exercises=out.exercises.filter(e=>e&&typeof e==='object'&&typeof e.id==='string'&&typeof e.name==='string').map(e=>keepExtra(e,{
    id:fixId(e.id),name:e.name,
    primary:MK.includes(e.primary)?e.primary:'chest',
    secondary:Array.isArray(e.secondary)?e.secondary.filter(m=>MK.includes(m)&&m!==e.primary):[],
    equip:typeof e.equip==='string'?e.equip:'other',
    bw:!!e.bw,rare:!!e.rare,perSide:!!e.perSide,note:typeof e.note==='string'?e.note:'',
    custom:!!e.custom,archived:!!e.archived,
    // Load step for this exercise everywhere it appears; null falls back to the routine item.
    inc:isNum(numOr(e.inc,NaN))&&numOr(e.inc,0)>0?Math.min(numOr(e.inc,0),500):null,
    plates:['bar','side','sleeve','none'].includes(e.plates)?e.plates:null,
    // How the load number reads; absent means the exercise's default.
    load:['each','total','side','stack'].includes(e.load)?e.load:undefined,
    // Timed: the reps column holds seconds. Heaviest available: the top of the
    // stack or rack, past which progression moves to reps. Absent when unset,
    // so records saved before these existed hash exactly as before.
    timed:e.timed===true?true:undefined,
    // Compound or isolation, when set in the editor (r27); absent reads it from the name.
    kind:e.kind==='compound'||e.kind==='iso'?e.kind:undefined,
    // Assisted (item 45): the load number is the machine's help, stored below 0.
    assist:e.assist===true&&!!e.bw?true:undefined,
    bwf:(()=>{const f=numOr(e.bwf,NaN);return isNum(f)&&f>0&&f<=1.5?Math.round(f*100)/100:undefined;})(),
    maxLoad:(()=>{const ml=numOr(e.maxLoad,NaN);return isNum(ml)&&ml>0?Math.min(ml,20000*LB):undefined;})(),
    // This lift's own bar (r29, item 98): a trap or EZ bar instead of the bar in Settings. Absent when unset.
    barKg:(()=>{const b=numOr(e.barKg,NaN);return isNum(b)&&b>0?Math.min(b,50):undefined;})(),
    // A lift goal (r38, item 188): a load (added load on a bodyweight lift) for a number of reps. Absent when unset.
    goal:(()=>{const g=e.goal;if(!g||typeof g!=='object')return undefined;const w=numOr(g.w,NaN),r=Math.round(numOr(g.r,NaN));return isNum(w)&&w>=0&&w<=20000*LB&&r>=1&&r<=30&&!e.timed&&!e.assist?{w,r}:undefined;})()
  }));
  const have=new Set(out.exercises.map(e=>e.id));
  const gone=new Set(out.settings.removedLib);
  const lib=libExercises();
  for(const e of lib)if(!have.has(e.id)&&!gone.has(e.id))out.exercises.push(e);
  // v1 saves predate the per-side flag, so the built-ins in them all carry
  // perSide:false. Backfill it from the library by id, and only that one
  // field, so any other edit the user made to a built-in survives.
  if(numOr(s.version,1)<2){
    const libMap={};for(const e of lib)libMap[e.id]=e;
    for(const e of out.exercises)if(!e.custom&&libMap[e.id])e.perSide=libMap[e.id].perSide;
  }
  /* v5: add serratus and rotator cuff where the library now lists them as
     secondary. Only those two keys are added, so any other edit survives. A
     built-in whose primary is one of them and reads Chest here was reset by
     an older build that did not know the muscle (its fallback is Chest), so
     it goes back to the library's primary. */
  if(numOr(s.version,1)<5){
    const libMap={};for(const e of lib)libMap[e.id]=e;
    for(const e of out.exercises){
      const L=!e.custom&&libMap[e.id];if(!L)continue;
      if(NEW_MUSCLES_V5.includes(L.primary)&&e.primary==='chest'){e.primary=L.primary;e.secondary=e.secondary.filter(m=>m!==L.primary);for(const m of L.secondary)if(!e.secondary.includes(m))e.secondary.push(m);}
      for(const m of NEW_MUSCLES_V5)if(L.secondary.includes(m)&&e.primary!==m&&!e.secondary.includes(m))e.secondary.push(m);
    }
  }

  out.routines=out.routines.filter(r=>r&&typeof r==='object'&&Array.isArray(r.days)).map((r,ri)=>{
    const rid=typeof r.id==='string'?fixId(r.id):did('r',r,ri);
    // Anything that is not explicitly fixed-weekday becomes a cycle, which is
    // how every pre-v3 routine migrates. A "weekly" routine with more than 7
    // days cannot exist through the UI; if one arrives, keep all its days as a
    // cycle rather than silently cutting any off.
    let schedule=r.schedule==='weekly'&&r.days.length<=7?'weekly':'cycle';
    const src=r.days.slice(0,MAX_DAYS);
    const count=schedule==='weekly'?7:Math.max(1,src.length);
    const days=[];const seen=new Set();
    for(let i=0;i<count;i++){
      const d=src[i];
      if(!d||typeof d!=='object'){
        days.push(schedule==='weekly'?{id:rid+'-w'+i,name:i===6?'Rest':'Training day',rest:i===6,items:[]}:{id:rid+'-p'+i,name:'Training day',rest:false,items:[]});
        continue;
      }
      const dbase=typeof d.id==='string'?fixId(d.id):rid+'-d'+i;
      const items=(Array.isArray(d.items)?d.items:[]).filter(it=>it&&typeof it.exId==='string').map((it,ii)=>keepExtra(it,{
        uid:typeof it.uid==='string'?fixId(it.uid):dbase+'-i'+ii,exId:fixId(it.exId),
        sets:clampN(it.sets,1,30,3),
        repMin:clampN(it.repMin,1,600,8),
        repMax:clampN(it.repMax,1,600,12),
        rir:clampN(it.rir,0,10,1),
        rest:clampN(it.rest,0,1800,90),
        inc:clampN(it.inc,0,500,5*LB),
        ss:typeof it.ss==='string'&&it.ss?fixId(it.ss):null,
        // r30: the load jump in percent, absent unless set (so older items keep their hash).
        ...(it.jump!=null&&it.jump!==''&&isNum(+it.jump)?{jump:Math.min(Math.max(+it.jump,0),20)}:{})
      },KNOWN_ITEM)).map(it=>(it.repMax<it.repMin?{...it,repMax:it.repMin}:it));
      fixSupersets(items);
      let id=dbase;if(seen.has(id))id=id+'-'+i;seen.add(id);
      days.push(keepExtra(d,{id,name:typeof d.name==='string'?d.name:(schedule==='weekly'?DAYS[i]:`Day ${i+1}`),rest:!!d.rest,items}));
    }
    return keepExtra(r,{id:rid,name:typeof r.name==='string'?r.name:'Routine',schedule,days});
  });

  const cutoff=addDays(today(),-TRASH_DAYS);
  out.trash=out.trash.filter(t=>t&&typeof t==='object'&&typeof t.id==='string'&&['session','routine','cardio'].includes(t.kind)&&isDate(t.date)&&t.date>=cutoff&&t.data&&typeof t.data==='object')
    .map(t=>({id:fixId(t.id),kind:t.kind,date:t.date,data:t.data})).sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0).slice(0,TRASH_MAX);
  while(out.trash.length>1&&JSON.stringify(out.trash).length>TRASH_BYTES)out.trash.pop();
  const before=out.sessions.length;
  out.sessions=out.sessions.filter(okSess).map(cleanSess).filter(ss=>ss.ex.length);
  drop(before-out.sessions.length);
  /* A trashed id is a tombstone, but only for the copy that was deleted. If
     the same session was edited afterwards (on another device, or in an edit
     that was open while it was deleted), the edit is newer than the delete:
     keep it and retire the tombstone, because keeping data is the mistake
     that can be undone. Sessions are compared in their cleaned form, so
     field order and defaults added by newer builds do not count as edits. */
  {const tS=new Map(),tC=new Map();for(const t of out.trash){if(t.kind==='session')tS.set(t.id,t);else if(t.kind==='cardio')tC.set(t.id,t);}
   const revived=new Set();
   const same=(cur,t,clean,ok)=>{try{return !ok(t.data)||canon(clean(t.data,0))===canon(cur);}catch(e){return true;}};
   out.sessions=out.sessions.filter(ss=>{const t=tS.get(ss.id);if(!t)return true;if(same({...ss,id:ss.id},{data:{...t.data,id:ss.id}},(x,i)=>cleanSess(x,i),okSess))return false;revived.add(t.id);return true;});
   out.cardio=out.cardio.filter(c=>c&&typeof c==='object'&&isDate(c.date)&&isNum(numOr(c.min,NaN))&&numOr(c.min,0)>0).map((c,ci)=>cleanCardio(c,false,ci))
     .filter(c=>{const t=tC.get(c.id);if(!t)return true;if(same(c,{data:{...t.data,id:c.id}},(x,i)=>cleanCardio(x,false,i),x=>x&&typeof x==='object'))return false;revived.add(t.id);return true;});
   if(revived.size)out.trash=out.trash.filter(t=>t.kind==='routine'||!revived.has(t.id));}
  /* One id, two different copies: a session moved to a date in another
     half-month on one device while it was edited on another. Both used to be
     kept and counted twice. Keep the copy with more logged sets (then the
     later date) and put the other in Recently deleted under its own id, so
     nothing is lost. Every device resolves it the same way. */
  for(const [key,kind] of [['sessions','session'],['cardio','cardio']]){
    const byId=new Map(),extra=[];
    const size=x=>kind==='session'?x.ex.reduce((a,b)=>a+b.sets.length,0):x.min;
    for(const x of out[key]){const o=byId.get(x.id);if(!o){byId.set(x.id,x);continue;}
      if(canon(o)===canon(x))continue;
      const keepNew=size(x)>size(o)||(size(x)===size(o)&&(x.date>o.date||(x.date===o.date&&canon(x)>canon(o))));
      byId.set(x.id,keepNew?x:o);extra.push(keepNew?o:x);}
    if(extra.length){out[key]=[...byId.values()];
      for(const x of extra){const id=fixId(x.id+'-dup'+hashStr(canon(x)).slice(0,6));if(!out.trash.some(t=>t.id===id))out.trash.unshift({id,kind,date:today(),data:{...x,id}});}}
  }

  const bBefore=out.bodyweights.length;
  out.bodyweights=out.bodyweights.filter(b=>b&&isDate(b.date)&&isNum(numOr(b.kg,NaN))&&numOr(b.kg,0)>0)
    .map((b,bi)=>keepExtra(b,{id:typeof b.id==='string'?fixId(b.id):did('b',b,bi),date:b.date,kg:Math.min(numOr(b.kg,0),BW_MAX_KG),demo:!!b.demo}));
  drop(bBefore-out.bodyweights.length);

  const mBefore=out.measurements.length;
  out.measurements=out.measurements.filter(m=>m&&isDate(m.date)).map((m,mi)=>{
    const o={id:typeof m.id==='string'?fixId(m.id):did('m',m,mi),date:m.date,demo:!!m.demo};
    for(const [k] of MEAS){const v=numOr(m[k],NaN);if(isNum(v)&&v>0)o[k]=Math.min(v,MEAS_MAX_CM);}
    return keepExtra(m,o,KNOWN_MEAS);
  });
  drop(mBefore-out.measurements.length);

  /* The draft is rendered by the logger, which reads plan, lastR and every set
     field directly. The old check only confirmed that ex was an array, so an
     imported backup carrying a half-written draft threw on first paint with no
     way back. Rebuild it field by field instead. */
  if(out.draft&&(typeof out.draft!=='object'||!Array.isArray(out.draft.ex)||!isDate(out.draft.date)))out.draft=null;
  if(out.draft){
    const d=out.draft;
    d.id=typeof d.id==='string'?fixId(d.id):did('x',{date:d.date,dayName:d.dayName},0);
    d.dayIdx=clampN(d.dayIdx,0,MAX_DAYS-1,0);
    d.dayId=typeof d.dayId==='string'?fixId(d.dayId):null;
    d.startedAt=Number.isFinite(+d.startedAt)&&+d.startedAt>0?+d.startedAt:null;
    d.durMin=Number.isFinite(+d.durMin)&&+d.durMin>=1?Math.round(+d.durMin):null;
    d.dayName=typeof d.dayName==='string'?d.dayName:'Session';
    d.routineId=typeof d.routineId==='string'&&d.routineId?fixId(d.routineId):'';
    d.notes=typeof d.notes==='string'?d.notes:'';
    d.editingId=typeof d.editingId==='string'?fixId(d.editingId):null;
    d.deload=!!d.deload;
    d.light=!!d.light;
    d.limited=d.limited===true?true:undefined;
    d.free=d.free===true?true:undefined;
    // A past workout typed in after the fact: no rest timer, no clock, no check-in.
    d.past=d.past===true?true:undefined;
    // The notes the app wrote when the session started, so Discard can tell them from yours.
    d.note0=typeof d.note0==='string'?d.note0.slice(0,2000):undefined;
    d.chk=cleanChk(d.chk)||undefined;
    d.cardio=(Array.isArray(d.cardio)?d.cardio:[]).filter(c=>c&&typeof c==='object').map((c,ci)=>cleanCardio(c,true,ci));
    d.ex=d.ex.filter(b=>b&&typeof b.exId==='string'&&Array.isArray(b.sets)).map(b=>{
      const pl=b.plan&&typeof b.plan==='object'?b.plan:{};
      const plan={sets:clampN(pl.sets,1,30,3),repMin:clampN(pl.repMin,1,600,8),repMax:clampN(pl.repMax,1,600,12),
        rir:clampN(pl.rir,0,10,1),rest:clampN(pl.rest,0,1800,90),inc:clampN(pl.inc,0,500,5*LB),ss:typeof pl.ss==='string'&&pl.ss?fixId(pl.ss):null,
        ...(pl.jump!=null&&pl.jump!==''&&isNum(+pl.jump)?{jump:Math.min(Math.max(+pl.jump,0),20)}:{})};
      if(plan.repMax<plan.repMin)plan.repMax=plan.repMin;
      return keepExtra(b,{...(typeof b.bid==='string'&&b.bid?{bid:fixId(b.bid)}:{}),exId:fixId(b.exId),plan,
        note:typeof b.note==='string'?b.note:'',
        inj:typeof b.inj==='string'&&(MK.includes(b.inj)||JK.includes(b.inj))?b.inj:null,
        hint:typeof b.hint==='string'?b.hint:'',
        last:typeof b.last==='string'?b.last:'',
        // Last time's sets as shown in the Last column (r44): short strings, absent in older drafts.
        prev:Array.isArray(b.prev)?b.prev.filter(x=>typeof x==='string').slice(0,30).map(x=>x.slice(0,40)):undefined,
        prevOff:b.prevOff===true?true:undefined,
        target:typeof b.target==='string'?b.target:'',
        easier:typeof b.easier==='string'?b.easier:null,
        tgt:cleanTgt(b.tgt),
        // Last time's reps per set: shown as placeholders, so numbers only.
        lastR:Array.isArray(b.lastR)?b.lastR.slice(0,30).map(v=>{const n=numOr(v,NaN);return isNum(n)&&n>=0?Math.min(n,1000):null;}):[],
        swappedFrom:typeof b.swappedFrom==='string'?fixId(b.swappedFrom):null,
        cut:b.cut===true?true:undefined,
        light:b.light===true?true:undefined,
        // The date the target came from, when "Last" is a newer trimmed, lighter, or deload session (r26).
        basis:isDate(b.basis)?b.basis:undefined,
        // The suggested load the rows started from (r24); absent in older drafts.
        sw:b.sw===null?null:b.sw===undefined||!isNum(+b.sw)?undefined:clampN(b.sw,-300,20000*LB,0),
        // The next sets adjusted from a set (r34), and Keep for the rest of the session.
        adj:b.adj&&typeof b.adj==='object'&&Number.isInteger(b.adj.at)&&b.adj.at>=0&&isNum(+b.adj.w)&&isNum(+b.adj.from)?{at:b.adj.at,w:clampN(b.adj.w,0,20000*LB,0),from:clampN(b.adj.from,0,20000*LB,0),r:Math.round(clampN(b.adj.r,1,1000,1)),up:b.adj.up===true,why:typeof b.adj.why==='string'?b.adj.why.slice(0,160):''}:undefined,
        adjOff:b.adjOff===true?true:undefined,
        // Editing a saved session keeps the rep range it was logged under.
        keepRR:b.keepRR===undefined?undefined:(Array.isArray(b.keepRR)&&b.keepRR.length===2?b.keepRR.map(v=>Math.round(+v)||1):null),
        lastNote:b.lastNote&&typeof b.lastNote==='object'&&typeof b.lastNote.text==='string'&&isDate(b.lastNote.date)?{date:b.lastNote.date,text:b.lastNote.text}:null,
        sets:b.sets.filter(x=>x&&typeof x==='object').map(x=>keepExtra(x,{
          w:x.w==null?null:clampN(x.w,-300,20000*LB,0),
          r:x.r==null||x.r===''?null:Math.round(clampN(x.r,0,1000,0)),
          rir:x.rir==null||x.rir===''?null:clampN(x.rir,0,10,null),
          warm:!!x.warm,drop:!!x.drop&&!x.warm,done:!!x.done,
          cal:x.warm?undefined:(cleanCal(x.cal)||undefined)
        }))});
    });
  }

  out.deloadWeek=isDate(out.deloadWeek)?out.deloadWeek:null;
  out.injuries=(Array.isArray(out.injuries)?out.injuries:[]).filter(x=>x&&(MK.includes(x.m)||JK.includes(x.m))).map((x,xi)=>keepExtra(x,{id:typeof x.id==='string'?fixId(x.id):did('j',x,xi),m:x.m,note:typeof x.note==='string'?x.note:'',date:isDate(x.date)?x.date:today()}));
  /* Former bests belonged to the Comeback tracker, removed at the owner's
     request in r19 together with any that were saved. Older saves, backups
     and cloud copies still carry them, so they are dropped here on every
     load, import and merge. */
  delete out.priors;
  if(!out.routines.length)out.routines=[starterRoutine()];
  if(typeof out.activeRoutineId==='string')out.activeRoutineId=fixId(out.activeRoutineId);
  if(!out.routines.find(r=>r.id===out.activeRoutineId))out.activeRoutineId=out.routines[0].id;
  out.version=STATE_VERSION;
  return out;
}
normalize.dropped=0;
function load(){
  storageOk=storageBoot=storageTest();
  if(!storageOk)return normalize(null);
  let raw=null;
  try{raw=localStorage.getItem(KEY);if(raw){const st=normalize(JSON.parse(raw));bootHadLocal=true;lastSaved=raw;return st;}}
  catch(e){
    /* An unreadable save used to be replaced by a fresh state on the next
       save, destroying it. Keep the raw text aside so it can be recovered. */
    log('load',e);bootHadLocal=false;
    try{if(raw)localStorage.setItem(KEY+'.unreadable',raw);}catch(e2){log('load',e2);}
  }
  return normalize(null);
}
let state=load();
// Records the save held that this build could not read are gone at the next save (r45 review): say so in Diagnostics.
if(normalize.dropped)log('load',new Error(`${normalize.dropped} damaged record${normalize.dropped===1?' was':'s were'} skipped when the save was read`));
let saveT=null;
function saveNow(){
  clearTimeout(saveT);saveT=null;
  capturePost();
  /* Storage that failed its check at startup stays off: its old contents were
     never read, so writing now could overwrite them. A write that fails later
     (storage full) is tried again on every save, and saving resumes as soon
     as one succeeds, rather than stopping for the rest of the visit. */
  if(storageBoot){
    try{const j=JSON.stringify(state);localStorage.setItem(KEY,j);lastSaved=j;storageOk=true;}catch(e){storageOk=false;log('storage',e);}
  }
  markEdit();setSaveState();cloudSoon();
}
function saveSoon(){clearTimeout(saveT);saveT=setTimeout(saveNow,400);}
function commit(){invalidate();saveNow();}
/* Everything lives in this one browser, so a backup is the only thing that
   survives a cleared cache or a new phone. Once real sessions exist, the
   header says so until a backup has been exported or copied in the last week.
   Demo data does not count. */
function backupDue(){
  /* Signed in and synced, the account is where the log lives, as in any
     app; deletions are covered by Recently deleted (30 days) and Undo (7),
     so no reminder (r34.2, from the review: the menu said "Backup due" to a
     synced account while the first page says the account backs it up). */
  if(!state.sessions.some(s=>!s.demo))return false;
  const synced=cloud.on&&cloud.last&&Date.now()-cloud.last<7*864e5;
  if(synced)return false;
  if(!storageOk&&!synced)return false;
  const le=state.settings.lastExport;
  // Weekly when this device holds the only copy: a phone that is lost or wiped
  // loses everything since the last backup.
  return !le||daysBetween(le,today())>(synced?30:7);
}
/* The menu button (r27) ends the top bar on every tab: a person for the
   account, with a dot for the save state (green synced, blue syncing, amber
   when something wants attention, red when nothing is being saved; none when
   the log is simply saved on this device). Wider screens show the words too.
   A tap opens the menu: account, Report a problem, the Guide, your data. */
function saveStateNow(){
  let cls='',txt='Saved on this device';
  if(cloud.on&&cloud.status==='synced'){cls='ok';txt='Synced';}
  else if(cloud.on&&(cloud.status==='saving'||cloud.status==='connecting')){cls='busy';txt='Syncing';}
  else if(cloud.on&&cloud.status==='offline'){cls='warn';txt='Offline, saved on this device';}
  else if(!storageOk){cls='bad';txt='Not saving: export a backup';}
  // Synced means your data is already off this device; the backup reminder
  // then waits in Your data instead of up here.
  if(!cls&&backupDue()){cls='warn';txt='Saved · backup due';}
  return {cls,txt};
}
const MENU_ICON='<svg class="mi" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8.4" r="3.7"/><path d="M4.8 19.6c1.3-3.7 4.1-5.4 7.2-5.4s5.9 1.7 7.2 5.4"/></svg>';
function setSaveState(){const el=$('#saveState');if(!el)return;
  const {cls,txt}=saveStateNow();
  el.className='ssb'+(cls?' '+cls:'');
  el.innerHTML=`${MENU_ICON}<span class="sd" aria-hidden="true"></span><span class="sst">${esc(txt)}</span>`;
  el.setAttribute('aria-label','Menu. '+txt);el.setAttribute('data-tip',txt);
  // An open menu follows the state, but is only redrawn when it changed, so a tap is never lost to a redraw.
  let who='';try{who=acct.user?acct.user.email:'';}catch(e){/* before accounts are set up */}const key=cls+'|'+txt+'|'+who;
  if(setSaveState.last!==key){setSaveState.last=key;if(ui.modal&&ui.modal.kind==='menu'&&!$('#modal').hidden)renderModal();}}
