/* ---------- the load engine ----------
   suggest and everything it calls are in src/app/engine.ts since r52 (phase
   3b, ARCHITECTURE.md). What stays here reads the session in progress or the
   page (a swapped-in exercise's plan, plates, grey loads and reps, the reason
   behind a target) and moves with the session screen (phase 5). */
/* What a swapped-in exercise is done for (r27). It keeps the slot's set
   count and superset. Its range, RIR, rest and step come from where it
   already sits in the routine, or from its own default when it is the other
   kind (a timed hold for reps, or reps for a hold: a plank swapped in for
   bench used to hold for 6 to 10 seconds); otherwise it fills the slot as
   planned. */
function swapPlan(p,fromId,toId,R,dayId){
  R=R||activeRoutine();
  const inR=R.days.some(d=>d.items.some(it=>it.exId===toId));
  if(!inR&&!!EX(fromId).timed===!!EX(toId).timed)return {...p};
  const q=inR?planFor(toId,R,dayId):defPlan(toId);
  const o={...p,repMin:q.repMin,repMax:q.repMax,rir:q.rir,rest:q.rest,inc:q.inc};
  if(q.jump!=null)o.jump=q.jump;else delete o.jump;
  return o;
}
/* Small change plates (r29, item 98) add 1.25 lb or 0.5 kg, for gyms that
   have them; the load step is still set per exercise. */
function plateList(u){u=u||U();const g=gymOf();const own=g&&(g.u||U())===u&&Array.isArray(g.plates)&&g.plates.length?g.plates.slice().sort((a,b)=>b-a):null;const b=own||(u==='lb'?PLATES_LB:PLATES_KG);return state.settings.smallPlates?[...b,u==='lb'?1.25:0.5]:b;}
/* Plates per side for a barbell load, greedy from the biggest plate down. */
function plateText(kg,mode,ex){
  mode=mode||'bar';if(mode==='none')return '';
  /* The plates are counted in the unit the gym's plates are labelled in,
     and said in it (r34.2, from the review: a kg gym with the app in lb was
     told "35, 5, 2.5, 1.14 lb not loadable" for one 20 kg plate a side). */
  const g=gymOf();const pu=g&&g.u&&g.u!==U()?g.u:U();const inU=v=>pu==='lb'?v/LB:v;
  const load=inU(kg),bar=mode==='bar'?inU(exBarKg(ex)):0;
  if(!(load>0))return '';
  if(load<bar-1e-6)return `${fmtW(kg)} ${U()} is below the ${r1(bar)} ${pu} bar`;
  let side=mode==='sleeve'?load:(load-bar)/2;const out=[];
  for(const pl of plateList(pu))while(side>=pl-1e-6){out.push(pl);side-=pl;}
  // Within a rounding of the shown load, not a plate short (a 60 kg load shown as 132.3 lb).
  const rest=Math.round(side*100)/100;const tiny=pu!==U()&&rest<(pu==='kg'?0.1:0.25);
  const lead=mode==='sleeve'?`On the sleeve at ${fmtW(kg)}`:mode==='side'?`Per side at ${fmtW(kg)} (no bar)`:`Per side at ${fmtW(kg)}`;
  const tag=pu!==U()?` ${pu}`:'';
  return `${lead}: ${out.length?out.join(', ')+tag:'bar only'}${rest>0&&!tiny?` (${rest} ${pu} not loadable)`:''}`;
}
/* Which load to show: the set just edited, else the next set not yet done,
   else the heaviest set in the block. */
function plateLine(b,si){
  // Grey loads count: the plates are for the load the row is going to be.
  let at=si!=null&&b.sets[si]?si:-1;
  if(at<0)at=b.sets.findIndex((x,i)=>!x.done&&!x.warm&&+effW(b,i)>0);
  const kg=at>=0?+effW(b,at)||0:Math.max(0,...b.sets.map((x,i)=>x.warm?0:+effW(b,i)||0));
  const ex=EX(b.exId);const pm=platesMode(ex);
  // Logged per side: the helper works from the total that makes.
  if(loadMode(ex)==='side')return plateText(kg*2+(pm==='bar'?exBarKg(ex):0),pm,ex).replace(/^Per side at [^:]+:/,'Plates a side:');
  return plateText(kg,pm,ex);
}
/* A load typed on a working set fills the empty load fields of the working
   sets after it, so an exercise with no history (nothing to prefill from) is
   not typed out once per set. Only blanks are filled: a prefilled target, a
   changed row, a done set, a warm-up or a drop set is never touched. Rows it
   filled follow a correction (100 typed as 10, then fixed) until the lifter
   edits them; that memory is in-page only, so after a reload they are plain
   typed rows. */
const carried=new WeakSet();
/* A row that holds nothing of the lifter's: not ticked, no reps, no RIR, and
   a load that is empty or only the app's (the suggestion, or carried down).
   Everything that removes or rebuilds rows (− Set, Short on time, a swap)
   takes only these, so typed work is never dropped as a side effect (r25). */
function rowBlank(b,x){return !x.done&&x.r==null&&x.rir==null&&appLoad(b,x);}
/* A row's load is the app's, not the lifter's: empty (grey), the suggestion,
   carried down from a typed load above, or put there by the adjustment (r34). */
function appLoad(b,x){return x.w==null||(b&&x.w===b.sw)||carried.has(x)||!!(b&&b.adj&&Math.abs(x.w-b.adj.w)<1e-9);}
function carryLoad(bi,si){
  const b=state.draft&&state.draft.ex[bi];const s=b&&b.sets[si];if(!s||s.warm||s.drop||s.w==null)return;
  for(let j=si+1;j<b.sets.length;j++){const x=b.sets[j];if(x.warm||x.drop||x.done||!(x.w==null||carried.has(x)))continue;
    x.w=s.w;carried.add(x);const inp=document.querySelector(`.sg input[data-f="w"][data-b="${bi}"][data-s="${j}"]`);if(inp)inp.value=loadIn(EX(b.exId),x.w);}
  updateProgress(bi);
}
function updatePlates(bi,si){const el=document.getElementById('pl-'+bi);if(!el||!state.draft||!state.draft.ex[bi])return;el.textContent=plateLine(state.draft.ex[bi],si);}
/* Live score for one logger block against its target. Only sets marked done,
   not warm-up, with reps, at or above the target load count. */
/* The old version counted every done set at or above the target load, then
   summed reps across all of them. Reps at 225 and reps at 275 are not the same
   currency, so going heavier for fewer reps read as "not beaten" and a single
   heavy set could read as beaten without the comparison meaning anything.
   Reps are now compared only at the target load; anything heavier is judged on
   estimated 1RM against your previous best, which is the comparable number. */
function blockProgress(b){
  const t0=b.tgt;if(!t0)return null;const t=effTarget(b);
  const ex=EX(b.exId);const bw=bwRefLoad(ex);
  const done=b.sets.filter(s=>s.done&&!s.warm&&!s.drop&&+s.r>0);
  if(!done.length)return {text:'',beat:false};
  const at=done.filter(s=>Math.abs((+s.w||0)-t.w)<1e-6);
  const heavier=done.filter(s=>(+s.w||0)>t.w+1e-6);
  let heavyBeat=false,heavyTxt='';
  if(heavier.length&&t.prevBest!=null&&!ex.timed){
    let best=null,bs=null;const seen=new Set();for(const x of IDX().byEx[b.exId]||[])for(const p of x.pts)seen.add(p.w); /* each set at the load it stands for, as PRs are judged (prSameLoad): the same load in the other unit beats nothing (r55.1, the audit of r55: 220.5 lb after 100 kg read as beaten by load) */for(const s of heavier){const v=e1(bw+prSameLoad(+s.w||0,seen),+s.r,rirEst(s,ex));if(v!=null&&(best==null||v>best)){best=v;bs=s;}}
    if(best!=null){
      heavyBeat=best>t.prevBest+1e-6;
      /* Estimates in whole pounds, and on an isolation lift the set itself,
         never a 1RM (r34.2: "20.6 kg estimated" on a curl). */
      const iso=!isCompound(ex);const setW=bs?setShort(ex,+bs.w||0,+bs.r):'';
      heavyTxt=iso?(heavyBeat?`Beaten by load: ${setW}, your best yet`:`Heavier than target: ${setW}`)
        :heavyBeat?`Beaten by load: ${fmtE(best)} ${U()} estimated, previous best ${fmtE(t.prevBest)}`
        :`Heavier than target, ${fmtE(best)} ${U()} estimated against a best of ${fmtE(t.prevBest)}`;
    }
  }
  if(t.kind==='reps'){
    if(!at.length)return {text:heavyTxt||`Nothing logged at ${loadLabel(ex,t.w)} yet`,beat:heavyBeat};
    // Only the first n sets at the target load count, n being last time's set count.
    const cnt=t.n>0?at.slice(0,t.n):at;
    const hi=+(b.plan||{}).repMax,cap=hi>0&&t.total<hi*(t.n>0?t.n:cnt.length)?hi:Infinity;const n=cnt.reduce((a,s)=>a+Math.min(+s.r,cap),0); // reps past the top count as the top, as the target counted them (r55; not for a target set past the range on purpose)
    const sx=ex.timed?'s':'',u=ex.timed?'s':' reps';
    const fewer=t!==t0,base=fewer&&n>t.total?`${n}${u} over ${t.n} set${t.n===1?'':'s'}, last time ${t.total}${sx} over those. Fewer sets than usual: the target stays for next time`:n>t.total?`Beaten: ${n}${u} at that load, last time ${t.total}${sx}`:`${n}${sx} of ${t.total+1}${u} so far at that load`; // with fewer sets than last time, nothing is beaten: the one rule repeats the target (r55, the audit: the recap said beaten, then the target repeated)
    return {text:heavyTxt?`${base}. ${heavyTxt}`:base,beat:!fewer&&(n>t.total||heavyBeat)};
  }
  // Drop sets are extra work after the working sets, never part of the target; nor a set past the plan's count, as the engine reads it (r55).
  const rows=b.sets.filter(s=>!s.warm&&!s.drop),planned=Math.min(rows.length,+(b.plan||{}).sets||rows.length);
  const hit=rows.slice(0,planned).filter(s=>s.done&&+s.r>0&&(+s.w||0)>=t.w-1e-6&&+s.r>=t.repMin).length;const base=`${hit} of ${planned} sets hit ${t.repMin}${ex.timed?'s':''}+ at that load`;
  return {text:heavyTxt?`${base}. ${heavyTxt}`:base,beat:(planned>0&&hit>=planned)||heavyBeat};
}
function progressLine(b,bi){const p=blockProgress(b);return p?`<span class="tp${p.beat?' beat':''}" id="tp-${bi}">${esc(p.text)}</span>`:'';}
/* A finished exercise: it has working sets and every one is done. In a live
   session it folds to one line (tap to reopen), so the page gets shorter as
   the workout goes and the next exercise is always near the top. Editing a
   saved session never folds, since everything there is already done. */
/* Last time's reps for row si. lastR lists last session's working sets in
   order (no warm-ups, no drop sets), so a row's number is found by counting
   the working rows above it. Indexing by row put a warm-up added at the top
   on last time's first set, and shifted every set below it by one. */
function lastRFor(b,si){
  const s=b.sets[si];if(!s||s.warm||s.drop||!Array.isArray(b.lastR))return null;
  /* A later block of the same lift (r45): last time's reps are one merged
     list and the split is not recorded, so none is offered; the grey reps
     fall back to the set above or the bottom of the range, as the Last column
     shows dashes (the r45 review). */
  {const d=state.draft;const bi=d&&d.ex?d.ex.indexOf(b):-1;if(bi>0&&lastDup(d,bi))return null;}
  let k=0;for(let i=0;i<si;i++){const x=b.sets[i];if(!x.warm&&!x.drop)k++;}
  const v=b.lastR[k];return v!=null&&v>0?v:null;
}
/* The grey number in an empty reps field, which the checkmark, auto-mark and
   the keyboard's Done take as the set's reps: last time's reps for that set;
   with none (a new or just-swapped exercise, or more sets than last time),
   the reps of the working set above it in this session; else the bottom of
   the planned range. Warm-ups and drop sets have none.
   When the target is a new load (up a step, down after missing the range,
   or a range change), last time's reps were at the old load, so a tick
   without typing would log reps never done there (r27). Then the grey number
   is the set above, else the target's minimum. */
function greyR(b,si){
  const s=b&&b.sets[si];if(!s||s.warm||s.drop)return null;
  // Under an adjusted set (r34): reps done since at the new load, else what the estimate expects there.
  if(b.adj&&si>b.adj.at){for(let i=si-1;i>b.adj.at;i--){const x=b.sets[i];if(!x.warm&&!x.drop&&+x.r>0)return +x.r;}return b.adj.r;}
  const loadT=!!(b.tgt&&b.tgt.kind==='load');
  const lr=loadT?null:lastRFor(b,si);if(lr!=null)return lr;
  for(let i=si-1;i>=0;i--){const x=b.sets[i];if(!x.warm&&!x.drop&&+x.r>0)return +x.r;}
  const m=+(loadT&&b.tgt.repMin>0?b.tgt.repMin:b.plan&&b.plan.repMin);return m>0?m:null;
}
/* Typed reps change the grey number of the empty rows under them. */
function refreshGrey(bi){
  const b=state.draft&&state.draft.ex[bi];if(!b)return;
  b.sets.forEach((x,si)=>{if(+x.r>0)return;const el=document.querySelector(`.sg input[data-f="r"][data-b="${bi}"][data-s="${si}"]`);if(!el)return;const g=greyR(b,si);const v=g==null?'':String(g);if(el.placeholder!==v)el.placeholder=v;});
}
/* Loads (r25). Filled-in loads made every row look already decided, and a
   row the lifter had not touched could not be told from one they had. So by
   default a working set's load stays empty and shows, in grey, the load of
   the working set above it (typed, or taken when that set was ticked), else
   the app's suggestion. Ticking the set, auto-mark and quick entry take the
   grey load; typing replaces it and is never overwritten. Settings > Logging
   > "Fill in suggested loads" (settings.loadFill 'fill') puts them in the
   rows as before. Warm-up and drop rows get their loads when added. */
const fillLoads=()=>state.settings.loadFill==='fill';
