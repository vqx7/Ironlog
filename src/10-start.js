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

/* ---------- dates (local) ----------
   The long date, through format.ts's formatters (dtf), made once each. */
const fmtDateLong=s=>fmtWith('l',{weekday:'short',month:'short',day:'numeric',year:'numeric'},s);

