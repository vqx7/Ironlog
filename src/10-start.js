(function(){
'use strict';
const $=(s,r=document)=>r.querySelector(s);
/* Update prompt (standalone app only). The build's boot script registers the
   service worker and calls ironlogUpdateReady() once a new version has been
   downloaded and is waiting. Nothing reloads by itself, because a reload in
   the middle of a set is jarring: the lifter picks the moment, and the
   session in progress is saved first, so it comes back as it was. "Later"
   hides the bar until the next launch. */
const upd={ready:false,later:false};
function updRender(){
  const el=document.getElementById('updbar');if(!el)return;
  const show=upd.ready&&!upd.later;el.hidden=!show;
  if(show&&!el.firstChild)el.innerHTML='<span class="ut">New version ready</span><button type="button" class="btn sm primary" data-act="appUpdate">Reload</button><button type="button" class="btn sm" data-act="appUpdateLater">Later</button>';
}
window.ironlogUpdateReady=()=>{upd.ready=true;updRender();};
/* Weekly numbers (planned volume, adherence, the week bar) assume one cycle day
   per calendar day. A 7-day cycle is therefore exactly 1x; a 4-day cycle runs
   1.75 times a week. */
function weekFactor(R){return R.schedule==='weekly'?1:7/Math.max(1,R.days.length);}
function trainDaysOf(R){return R.days.filter(d=>!d.rest&&d.items.length>0).length;}
/* Sessions store the id of the day they were logged against, so reordering or
   removing cycle days never relinks history to the wrong workout. Sessions from
   before v3 have only a position, which is still correct because migration
   kept every day where it was. */
function sessDayIdx(R,s){
  if(s.dayId){const i=R.days.findIndex(d=>d.id===s.dayId);return i;}
  return s.dayIdx>=0&&s.dayIdx<R.days.length?s.dayIdx:-1;
}
/* Where you are in the cycle. Next up is the first training day after the last
   one you logged, so a missed day moves with you instead of being skipped.
   A rest day right after your last session counts as scheduled only while the
   calendar says you are inside it. */
/* asOf: read the cycle as it stood on a past date (sessions up to that day),
   which is what a past workout entered late was due to be. */
function cycleState(R,asOf){
  const n=R.days.length;const T=asOf||today();
  const isTrain=i=>!R.days[i].rest&&R.days[i].items.length>0;
  let first=0;for(let i=0;i<n;i++)if(isTrain(i)){first=i;break;}
  const mine=state.sessions.filter(x=>x.routineId===R.id&&(!asOf||x.date<=asOf)).map(x=>({s:x,i:sessDayIdx(R,x)})).filter(x=>x.i>=0)
    .sort((a,b)=>sessCmp(a.s,b.s));
  if(!mine.length)return {last:-1,lastDate:null,next:first,done:new Set(),restToday:false,restIdx:-1};
  const L=mine[mine.length-1];
  let next=-1;for(let k=1;k<=n;k++){const j=(L.i+k)%n;if(isTrain(j)){next=j;break;}}
  if(next<0)next=L.i;
  const done=new Set();
  if(next>L.i){done.add(L.i);let prev=L.i;for(let k=mine.length-2;k>=0;k--){const i=mine[k].i;if(i<prev){done.add(i);prev=i;}else break;}}
  let run=0;for(let k=1;k<n;k++){if(R.days[(L.i+k)%n].rest)run++;else break;}
  const since=daysBetween(L.s.date,T);
  const restToday=since>=1&&since<=run;
  return {last:L.i,lastDate:L.s.date,next,done,restToday,restIdx:restToday?(L.i+since)%n:-1};
}

/* ---------- supersets, deload, injuries ---------- */
/* A superset is consecutive items sharing an id. Groups of one are not
   supersets, so a reorder or delete that leaves a stray tag clears it. */
function fixSupersets(items){
  let i=0;
  while(i<items.length){
    const id=items[i].ss;
    if(!id){i++;continue;}
    let j=i;while(j<items.length&&items[j].ss===id)j++;
    if(j-i<2)items[i].ss=null;
    i=j;
  }
  // The same id reappearing later in the day would read as one group; give it its own.
  const seen=new Set();let prev=null;
  items.forEach((it,k)=>{if(it.ss&&it.ss!==prev&&seen.has(it.ss))it.ss=it.ss+'-g'+k;if(it.ss)seen.add(it.ss);prev=it.ss;});
}
/* Letter per superset group, in order of first appearance, for labels. */
function ssLetters(items){const m={};let n=0;for(const it of items)if(it.ss&&!(it.ss in m))m[it.ss]=String.fromCharCode(65+(n++%26));return m;}
function isDeloadWeek(){return !!state.deloadWeek&&state.deloadWeek===weekStart(today());}
/* Rest weeks (r34, V): a week off on purpose (a holiday, a break) is marked,
   this week or last, from More options on Today. It is not a missed week:
   the weekly average reaches past it (like a lighter week), the streak and
   adherence skip it, and the coach reads it as recovery. Kept in settings,
   so it syncs, as week-start dates. */
/* Freestyle mode (r34): Today starts blank, so no routine is being
   followed. The week is then measured against the lifter's own training,
   not a plan's days: the streak counts weeks trained in a row, This week says
   sessions and hard sets without "of planned", and adherence has no plan to
   measure. Muscle targets, suggestions and trends are the same either way. */
function freeMode(){return state.settings.todayStart==='free';}
function isRestWeek(ws){const r=state.settings.restWeeks;return Array.isArray(r)&&r.includes(ws);}
function injuredSet(){return new Set((state.injuries||[]).map(x=>x.m));}
function exInjury(ex){const s=injuredSet();if(!s.size)return null;if(s.has(ex.primary))return ex.primary;for(const m of ex.secondary)if(s.has(m))return m;for(const j of exJoints(ex))if(s.has(j))return j;return null;}

/* ---------- dates (local) ---------- */
/* One Intl formatter per format, made once: toLocaleDateString builds a new
   one on every call, about a fifth of a Stats render (r46). Same output. */
const DTF={};const dtf=(k,o)=>DTF[k]||(DTF[k]=new Intl.DateTimeFormat(undefined,o));
const fmtWith=(k,o,s)=>{const d=parse(s);return isNaN(+d)?'':dtf(k,o).format(d);};
const fmtDate=s=>fmtWith('d',{month:'short',day:'numeric'},s);
const fmtDateLong=s=>fmtWith('l',{weekday:'short',month:'short',day:'numeric',year:'numeric'},s);
// History rows sit under a week header, so the year only shows when it is not this one.
const fmtDateRow=s=>parse(s).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',...(s.slice(0,4)===today().slice(0,4)?{}:{year:'numeric'})});

