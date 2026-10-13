/* ---------- progression suggestion ---------- */
/* Double progression. Returns text (the full sentence, used on the Today
   preview), plus last/target (the same thing split into two lines for the
   logger) and tgt, a small object the logger uses to score the session live:
   {kind:'reps', w, total} means beat `total` reps at load w;
   {kind:'load', w, repMin} means hit repMin+ reps in every set at the new load w. */
/* A lighter day or a deload is worked out from the normal day's
   prescription (r32, from the third review): 90% of the load the normal day
   would ask for (or of last time's working load, if lower), in whole steps,
   with grey reps at the bottom of the range.
   It used to take 90% of last time's top load and keep last time's reps, so
   after 140 x 4, 3, 3 (normal day: drop to 122.5) the lighter day asked about
   125, and after 100 x 15 one tap logged 90 x 15 on a "3 or more in reserve"
   day. Injury, a first session and timed holds keep their own lines. */
/* Loads logged in the other unit (r32, second check: after kg to lb,
   100 kg read 220.5 lb and the next was "225.5", 16 kg dumbbells "35.3 per
   dumbbell"): when the last working load is off the step in the unit on
   screen, the suggestion is put on the nearest step (down for a lighter
   day), and the words follow. Loads already on the step are untouched, so
   a stack with odd pins keeps its whole steps. */
function snapUnit(ex,plan,res,down){
  if(!res||res.w==null||res.top==null||ex.timed)return res;if(gymRack(ex,plan))return rackSnap(ex,plan,res);const st=toD(incOf(ex,plan));if(!(st>0))return res;
  /* Off the step and not a number anyone types (220.462 from 100 kg): a
     custom step (185 lb on a 10 lb step) or microplates (101.25) are left as
     they are. */
  const off=v=>Math.abs(toD(v)/st-Math.round(toD(v)/st))>0.02;const typed=v=>Math.abs(toD(v)/0.05-Math.round(toD(v)/0.05))<0.1;
  if(!off(res.top)||!off(res.w)||typed(res.top))return res;
  const nw=fromD((down?Math.floor(toD(res.w)/st+1e-9):Math.round(toD(res.w)/st))*st);if(Math.abs(nw-res.w)<1e-9)return res;
  return swapW(ex,res,nw);
}
/* Days since a lift was last done, by its newest session of any kind up to
   the date being logged. */
function daysOff(exId,opts){
  const T=opts&&opts.before&&isDate(opts.before)?opts.before:today();
  const xs=(IDX().byEx[exId]||[]).filter(x=>x.date<=T);if(!xs.length)return 0;
  return daysBetween(xs[xs.length-1].date,T);
}
/* Back after more than 4 weeks off a lift (a convention, r34.2, from the
   review: after 6 weeks away the app asked for the next load up, as if no
   time had passed). Strength holds for about 4 weeks without training and
   falls faster after (Bosquet 2013, a meta-analysis of training cessation),
   so the first session back is about 90% of the last working load, in whole
   steps, like a Lighter day but with the usual sets; the session after it
   picks up from the last full session. */
const BACK_DAYS=28;
function suggest(exId,plan,opts){
  opts=opts||{};const ex=EX(exId);
  const off=!(opts.deload||opts.light)&&!ex.timed?daysOff(exId,opts):0;const back=off>BACK_DAYS;
  if(!(opts.deload||opts.light||back)||ex.timed)return snapUnit(ex,plan,suggestCore(exId,plan,opts));
  const base=suggestCore(exId,plan,{...opts,deload:false,light:false});
  /* A close variation's first session on a Lighter day or deload (r32.1): 90% of the start, like any lighter day. */
  if(base.kin&&base.w>0){const ks=!gymRack(ex,plan)&&rackKind(ex)&&rackKind(EX(base.kin))?rackStep(EX(base.kin)):null;const lw=ks?fromD(Math.floor(toD(base.w*0.9)/toD(ks)+1e-9)*toD(ks)):lighterLoad(ex,plan,base.w,base.w*0.9);
    return {...base,w:lw,lastR:Array(Math.max(1,+plan.sets||1)).fill(+plan.repMin),text:`First time, ${opts.deload?'deload':'Lighter day'}. About ${loadLabel(ex,lw)} ${U()}${loadNote(ex)} for ${repSpan(plan.repMin,plan.repMax,'-')} with 3 or more reps in reserve, from your ${EX(base.kin).name}. Half the usual sets, nothing to beat.`};}
  if(base.inj||!base.last||base.w==null)return base;
  const T=opts.before&&isDate(opts.before)?opts.before:today();
  // Never above last time's working load either: after 25 lb x 12 the normal day may ask 30, and a deload at 25 is not lighter.
  const word=opts.deload?'Deload':opts.light?'Lighter day':`Back after ${Math.round(off/7)} weeks`;const step=incOf(ex,plan);const w0=base.top!=null?Math.min(base.w,base.top):base.w;const bl=bwRefLoad(ex);
  const lbl=w=>`${loadLabel(ex,w)}${ex.bw?'':' '+U()}${loadNote(ex)}`;
  // Assisted: 90% of the lifted load means more help, rounded up to the machine's step so it never lands back on the full load.
  const hs=step>0?toD(step):U()==='lb'?5:2.5;
  const dw=ex.assist?-fromD(Math.ceil(toD(bl>0?bl-(w0+bl)*0.9:-w0*1.1)/hs-1e-9)*hs):ex.bw?((w0+bl)*0.9-bl>0?lighterLoad(ex,plan,w0,(w0+bl)*0.9-bl):0):lighterLoad(ex,plan,w0,w0*0.9);
  const w=w0>0||ex.assist?dw:w0;
  // Grey reps at the bottom of the range: at about 90% of the load that is 3 or more in reserve for anyone in the range last time.
  const n=Math.max(1,(base.lastR||[]).length||+plan.sets||1);
  if(back)return snapUnit(ex,plan,{top:base.top,prev:base.prev,w,text:`${base.last} ${word}: about ${lbl(w)} for ${repSpan(plan.repMin,plan.repMax,'-')} with 2 or more reps in reserve. Next time picks up from here.`,lastR:Array(n).fill(+plan.repMin),basis:base.basis,last:base.last,target:'',tgt:null,easier:null,back:Math.round(off/7)},true);
  return snapUnit(ex,plan,{top:base.top,prev:base.prev,w,text:`${base.last} ${word}: about ${lbl(w)} for ${repSpan(plan.repMin,plan.repMax,'-')} with 3 or more reps in reserve. Half the usual sets, nothing to beat.`,lastR:Array(n).fill(+plan.repMin),basis:base.basis,last:base.last,target:'',tgt:null,easier:null},true);
}
/* The load engine's prescription for one lift (r36: the 250-line function cut
   into its cases, each below and tried in order, with no change to what comes
   out; tests/r36.js compares it with r35 on random histories). */
function suggestCore(exId,plan,opts){
  opts=opts||{};
  /* opts.before: the date of a past session being logged. Only what was
     logged up to that date counts, so a workout entered after later ones
     gets the target and "Last" it would have had on the day. */
  const T=opts.before&&isDate(opts.before)?opts.before:today();
  const every=IDX().byEx[exId];const all=every?every.filter(x=>x.date<=T):every;const ex=EX(exId);const injM=exInjury(ex);
  // Deload and lighter sessions are short or light on purpose, so the last
  // full session sets the target. If there is nothing else, use them.
  const full=all?all.filter(x=>!offSession(x)):[];
  /* The same lift can sit on two days with different rep ranges (heavy 4-6,
     light 10-12). Each day progresses from its own sessions in its own range
     (r27). That holds while the range is in use: the newest session in it
     within the trend window (42 days) of the newest full session. A range not
     used lately (a lift back on 8-12 after months on 5-8) or never logged
     reads every full session, so the newest load is the starting point.
     Sessions with no range on record (from before r13, imported or demo) go
     along with the range when it is in use. */
  const want=[+plan.repMin,+plan.repMax];
  const exact=x=>!!x.rr&&x.rr[0]===want[0]&&x.rr[1]===want[1];
  const lastEx=full.filter(exact).pop();
  const inRR=!!lastEx&&lastEx.date>=addDays(full[full.length-1].date,-42);
  const fullRR=inRR?full.filter(x=>sameRR(x.rr,want)):[];
  const exps=all&&all.length?(fullRR.length?fullRR:full.length?full:all):all;
  const seen=inRR?all.filter(x=>sameRR(x.rr,want)):all;
  if(ex.timed)return suggestTimed(ex,plan,exps,opts,injM,seen);
  if(!exps||!exps.length)return sgFirst(ex,plan,T,injM);
  const last=exps[exps.length-1],ws=last.pts;const stx=all.length<every.length?statsUpTo(exId,all):(IDX().exStats[exId]||{});
  const top=workLoad(ws,+plan.repMin);
  const step=incOf(ex,plan,top);
  /* Ab work on bodyweight with no load ever added (a hanging leg raise, a
     crunch) progresses by reps, then harder reps (r32, from the third
     review: a leg raise at 15 reps was told "BW+2.5 for 10+"). Once a load
     has been logged, it progresses like any loaded lift. */
  /* Since r34.2 every bodyweight lift never done with added load, not only
     ab work (from the review: push-ups done on bodyweight for 6 weeks were
     asked for BW+10 every session and counted as missed targets). A load
     typed once makes it a loaded lift. */
  const noAdd=!!ex.bw&&!ex.assist&&!all.some(x=>x.pts.some(p=>p.w>1e-6));const abW=['abs','obliques'].includes(ex.primary);
  // Heaviest available load (top of the stack or rack), if set.
  const cap=capOf(ex,plan,top);const atCap=atCapOf(ex,plan,top,cap);const capW=w=>cap!=null?Math.min(w,cap):w;
  // Only the sets at the top load decide progression. Ramp-up sets at lighter
  // loads used to block every load increase unless they also reached repMax.
  const topPts=ws.filter(p=>Math.abs(p.w-top)<1e-6);
  const L0=lastOf(seen,last,p=>`${loadLabel(ex,p.w)}×${p.r}`,+plan.repMin);
  const lastR=L0.lastR,lastS=L0.line,basis=L0.basis;
  const lbl=w=>`${loadLabel(ex,w)}${ex.bw?'':' '+U()}${loadNote(ex)}`;
  const prevBest=stx.best==null?null:stx.best;
  /* Injured area: no target to chase, load capped at last time, and a reminder
     to stop short. No target is set, so nothing in this session reads as
     "beaten" or "missed". */
  if(injM)return {top,prev:L0.prev,w:top,text:`${lastS} Injury flagged (${injLabel(injM)}): stay at or below ${lbl(top)}, keep 3 or more reps in reserve, stop on pain.`,lastR,basis,last:lastS,target:'',tgt:null,easier:null,inj:injM};
  /* A lighter day (r30) is a one-day deload: lighter loads, 3 or more in
     reserve, half the sets, no target. suggest() works it out from this
     function's normal prescription (r32). */
  /* Recalibrate when every top set was logged with RIR at least 2 above the
     target. It uses the same e1() estimate as everything else,
     and the new load is what leaves the middle of the rep range at the target
     RIR. It moves in whole steps from the last load, so machine stacks with odd
     offsets stay on real pin positions, and never jumps more than 10% (see
     jumpCap). A set called past 4 RIR is read as 4 here only, which errs low. */
  const tgtRir=+plan.rir||0;
  /* The first 3 sessions of a lift find its load (a convention, r31): the
     cap on a jump is 25% there, so a first guess well under what the lifter
     can do is corrected in a session or two, not a step at a time. */
  const early=exps.length<=3;
  const fl=repFloor(topPts,plan.repMin);
  const tp=topPts.slice(0,Math.max(1,+plan.sets||topPts.length)).map(p=>({...p,r:fl(p.r)}));
  const C={ex,exId,plan,opts,T,all,every,exps,seen,inRR,injM,last,ws,stx,top,step,noAdd,abW,cap,atCap,capW,topPts,lastR,lastS,basis,lbl,prevBest,tgtRir,early,fl,tp};
  // The sets of the session shown as Last, for the Last column in the session (r44): each case's result carries them.
  const res=sgEasy(C)||sgPastRange(C)||sgBelowRange(C)||sgNoStep(C)||sgTopOfRange(C)||sgBadDay(C)||sgReps(C);
  return res&&res.last?{...res,prev:L0.prev}:res;
}
/* No history yet: an injury note, a start from a close variation, or the first-time line. */
function sgFirst(ex,plan,T,injM){
  if(injM)return {w:ex.bw?0:null,text:`Injury flagged (${injLabel(injM)}). Start light, keep 3 or more reps in reserve, and stop on pain.`,lastR:[],last:'',target:'',tgt:null,inj:injM};
  /* A first session (r30, from the review: "pick a load you can take to
     6-10 at 2 RIR" is no help to a beginner). Start light, in words a new
     lifter can act on. The next session's load comes from this one. */
  const rr=+plan.rir||0;
  // One line per exercise; the warm-up is said once, in the workout preview.
  /* r31: the load and the reps agree. "A load you could lift about 17
     times, do 8 to 12 with 3 still in you" asked for two different loads,
     and it was said for push-ups and Nordics, which have no load to pick.
     Erring light is fine: the next session's load is worked out from this
     one, by up to 25% in the first sessions (jumpCap). */
  const can=+plan.repMax+Math.round(rr);const reps=`${repSpan(plan.repMin,plan.repMax)} rep${+plan.repMax===1?'':'s'}`;const stop=rr>=1?`stopping with about ${rr} still in you`:'to the last rep you can do well';
  const kin=!ex.bw?kinStart(ex,plan,T):null;
  if(kin)return {w:kin.w,text:`First time. About ${loadLabel(ex,kin.w)} ${U()}${loadNote(ex)} for ${reps}, from your ${kin.ex.name} (${kin.set}, ${fmtDate(kin.date)}), ${stop}. If the first set is off, change the load.`,lastR:[],last:'',target:'',tgt:null,kin:kin.ex.id};
  const text=ex.assist?`First time: set the help so you could do about ${can} reps. Do ${reps}, ${stop}. Next time the help is set from this.`
    :ex.bw?`First time: your bodyweight only. Do ${reps}, ${stop}. If ${plan.repMin} is out of reach, use an easier version; if it is easy past ${plan.repMax}, the next target says so.`
    :`First time: pick a load you think you could lift about ${can} times, erring light. Do ${reps}, ${stop}. Next time's load is worked out from this.`;
  return {w:ex.bw?0:null,text,lastR:[],last:'',target:'',tgt:null};
}
/* Every top set 2 or more over the target reserve: the load from the estimate. */
function sgEasy(C){
  const {ex,exId,plan,opts,T,all,every,exps,seen,inRR,injM,last,ws,stx,top,step,noAdd,abW,cap,atCap,capW,topPts,lastR,lastS,basis,lbl,prevBest,tgtRir,early,fl,tp}=C;
  if(step>0&&!atCap&&!noAdd&&!noE1(ex)&&topPts.length&&topPts.every(p=>p.rir!=null&&p.rir>=tgtRir+2&&p.r>=plan.repMin)){
    let est=null;for(const p of topPts){const v=fitE(p.load,p.r,Math.min(p.rir,E1_MAX_RIR));if(v!=null&&(est==null||v>est))est=v;}
    const bwNow=bwRefLoad(ex);const topLoad=top+bwNow;
    if(est!=null&&topLoad>0){
      const want=Math.min(e1inv(est,Math.round((+plan.repMin+ +plan.repMax)/2)+Math.min(tgtRir,E1_MAX_RIR)),topLoad*jumpCap(ex,topLoad,early))-bwNow;
      let k=Math.floor((want-top)/step+1e-6);
      /* Every set at 5 or more in reserve, the top of the scale: the estimate
         is a floor, so at least one real step, even past the cap (r34.2, from
         the review: 20 lb curls at 5+ in reserve asked to build reps for
         weeks, a 5 lb dumbbell step being more than the cap allows). */
      if(k<1&&topPts.every(p=>p.rir>=5))k=1;
      if(k>=1){
        const nw=ex.assist&&top<0?Math.min(0,top+k*step):capW(top+k*step);const rr=r1(topPts.reduce((a,p)=>a+p.rir,0)/topPts.length);
        return {top,w:nw,text:`${lastS} RIR ${rr} at ${lbl(top)} against a target of ${tgtRir}, so that load was light. Try ${lbl(nw)} for ${repSpan(plan.repMin,plan.repMax,'-')} reps.`,lastR,basis,
          last:lastS,target:`${lbl(nw)} for ${plan.repMin}+ reps in every set`,tgt:{kind:'load',w:nw,repMin:+plan.repMin,prevBest},easier:null};
      }
    }
  }
  return null;
}
/* Every top set 2 or more reps over the top of the range. */
function sgPastRange(C){
  const {ex,exId,plan,opts,T,all,every,exps,seen,inRR,injM,last,ws,stx,top,step,noAdd,abW,cap,atCap,capW,topPts,lastR,lastS,basis,lbl,prevBest,tgtRir,early,fl,tp}=C;
  /* Well past the range: every top set at least 2 reps over repMax, which is
     what happens when the range is moved down (12s, then a 4 to 6 plan). One
     step a session would take weeks to reach a load that fits, so the same
     e1RM estimate the drop below the range uses sets the load for the middle
     of the new range at the target RIR, capped like a recalibration (jumpCap)
     and in whole steps (r27). Above 12 reps there is no estimate, so the usual
     one step applies. */
  if(step>0&&!atCap&&!noAdd&&!noE1(ex)&&topPts.length&&topPts.every(p=>p.r>=+plan.repMax+2)){
    let est=null;for(const p of topPts){const v=fitE(p.load,p.r,p.rq);if(v!=null&&(est==null||v>est))est=v;}
    const bwNow=bwRefLoad(ex);const topLoad=top+bwNow;
    if(est!=null&&topLoad>0){
      const want=Math.min(e1inv(est,Math.round((+plan.repMin+ +plan.repMax)/2)+Math.min(tgtRir,E1_MAX_RIR)),topLoad*jumpCap(ex,topLoad,early))-bwNow;
      const k=Math.floor((want-top)/step+1e-6);const one=progStep(ex,plan,topLoad,top);
      if(k>=1&&k*step>one+1e-6){
        const nw=ex.assist&&top<0?Math.min(0,top+k*step):capW(top+k*step);const minR=Math.min(...topPts.map(p=>p.r));
        return {top,w:nw,text:`${lastS} Every set at ${lbl(top)} reached ${minR}+ reps, well past your ${rangeWords(plan)}. Try ${lbl(nw)} for ${repSpan(plan.repMin,plan.repMax,'-')} reps.`,lastR,basis,
          last:lastS,target:`${lbl(nw)} for ${plan.repMin}+ reps in every set`,tgt:{kind:'load',w:nw,repMin:+plan.repMin,prevBest},easier:null};
      }
    }
  }
  return null;
}
/* Every top set under the range: drop to a load that fits it. */
function sgBelowRange(C){
  const {ex,exId,plan,opts,T,all,every,exps,seen,inRR,injM,last,ws,stx,top,step,noAdd,abW,cap,atCap,capW,topPts,lastR,lastS,basis,lbl,prevBest,tgtRir,early,fl,tp}=C;
  /* Below the rep range. Every top set fell short of repMin, either by 2 or
     more reps, or by any amount two sessions running at the same load. Adding
     one rep a week from there never reaches the range, so drop the load to
     what the same e1RM estimate says leaves repMin at the target RIR. Whole
     steps down from the last load, so stacks stay on real pins. */
  if(step>0&&!noAdd&&topPts.length&&topPts.every(p=>p.r<+plan.repMin)){
    const gap=+plan.repMin-Math.max(...topPts.map(p=>p.r));
    const prev=exps.length>=2?exps[exps.length-2]:null;
    /* Not a drop while the reps are coming up after a step up (r31): a big
       step for the load (a dumbbell, a small stack) starts below the range
       on purpose, and dropping back made the load swing between two
       numbers. Just after one step up, short by up to 3 is that; two
       sessions short at one load drop only when the reps did not rise. */
    const prevAt=prev?prev.pts.filter(p=>Math.abs(p.w-top)<1e-6):[];const sumR=a=>a.reduce((x,p)=>x+p.r,0);
    const rising=prevAt.length>0&&sumR(topPts.slice(0,prevAt.length))>sumR(prevAt);
    const justUp=!!prev&&prev.topW<top-1e-6&&top-prev.topW<=step*1.5+1e-6;
    const repeat=!!prev&&Math.abs(prev.topW-top)<1e-6&&prevAt.every(p=>p.r<+plan.repMin)&&!rising;
    /* A range not yet trained (r30): history at 5 x 5 under a 6 to 10 plan
       asked for 122.5 x 16 reps over 3 sets, under the plan's minimum. The
       first session in a new range sets its load from the estimate at once,
       as a range moved down does. */
    /* Four sessions in a row under the range at one load drop it, rising or
       not (r32, second check: 5, 5, 4, 4 then 5, 5, 5, 4 then 5, 5, 5, 5
       kept the load for weeks, each "rising"). */
    let shortRun=0;for(let k=exps.length-1;k>=0;k--){const x=exps[k];if(Math.abs(x.topW-top)>1e-6)break;const at=atLoad(x.pts,x.topW);if(!at.length||!at.every(p=>p.r<+plan.repMin))break;shortRun++;}
    if((gap>=2&&!(justUp&&gap<=3))||repeat||!inRR||shortRun>=4){
      let est=null;for(const p of topPts){const v=e1(p.load,p.r,p.rq);if(v!=null&&(est==null||v>est))est=v;}
      const bwNow=bwRefLoad(ex);
      if(est!=null){
        const want=e1inv(est,+plan.repMin+Math.min(tgtRir,E1_MAX_RIR))-bwNow;
        /* Whole steps down to the estimated load. None needed means the
           estimate already puts this load at repMin for the target RIR: the
           sets were stopped early, not too heavy, so the usual rep target
           below applies instead of a forced drop. */
        const k=Math.ceil((top-want)/step-1e-6);
        const nw=top-k*step;
        if(k>=1&&(nw>0||(ex.bw&&(nw>=0||ex.assist)))){
          const bestR=Math.max(...topPts.map(p=>p.r));
          return {top,w:nw,text:`${lastS} Top sets at ${lbl(top)} stopped at ${bestR} rep${bestR===1?'':'s'}, below your ${rangeWords(plan)}. Drop to ${lbl(nw)} and build back up.`,lastR,basis,
            last:lastS,target:`${lbl(nw)} for ${plan.repMin}+ reps in every set`,tgt:{kind:'load',w:nw,repMin:+plan.repMin,prevBest},easier:null,down:true};
        }
      }
    }
  }
  return null;
}
/* At the heaviest load available, a fixed load, or bodyweight never loaded: reps. */
function sgNoStep(C){
  const {ex,exId,plan,opts,T,all,every,exps,seen,inRR,injM,last,ws,stx,top,step,noAdd,abW,cap,atCap,capW,topPts,lastR,lastS,basis,lbl,prevBest,tgtRir,early,fl,tp}=C;
  /* At the heaviest load available: keep adding reps past the top of the range.
     Once every set reaches about 40% past it, the next step is harder reps
     rather than more load. A load step of 0 means the load never changes (a
     fixed dumbbell, say), so it reads the same way instead of "add 0 lb" (r27). */
  /* The rep target counts as many sets as the plan has (r30): five sets of
     history under a three-set plan read "26+ reps over your first 5 sets". */
  if(atCap||!(step>0)||noAdd){
    const where=atCap?'the heaviest load available':noAdd?'your bodyweight':'a fixed load (load step 0)';
    const below=topPts.every(p=>p.r<+plan.repMin);
    const total=tp.reduce((a,p)=>a+p.r,0);const nT=tp.length;
    const over=overSets(nT,plan);
    const ext=+plan.repMax+Math.max(3,Math.round(+plan.repMax*0.4));
    const maxed=topPts.every(p=>p.r>=ext);
    const tip=maxed?(noAdd&&!abW?` Every set reached ${ext}+ on bodyweight alone. Add a little load (a belt or a vest) by typing it, or make each rep harder: a 3 to 4 second lowering, a pause, or a harder version.`:` Every set reached ${ext}+ at ${where}, so make each rep harder instead: lower for 3 to 4 seconds and pause at the stretch, go one arm or one leg at a time, or finish with a drop set. Add a note when you change it so the numbers stay comparable.`)
      :below?` That is ${where}, so build the reps up to ${plan.repMin} or more.`:` That is ${where}, so keep adding reps past ${plan.repMax}.`;
    return {top,w:top,text:`${lastS} Beat ${total} reps ${over} at ${lbl(top)}.${tip}`,lastR,basis,
      last:lastS,target:`${total+1}+ reps ${over} at ${lbl(top)}${atCap?', the heaviest available':''}`,tgt:{kind:'reps',w:top,total,n:nT,rs:tp.map(p=>p.r),prevBest},
      easier:maxed?`Past ${ext} reps at ${atCap?'the heaviest load':'this load'}: slow the lowering to 3 to 4 seconds with a pause at the stretch, go one side at a time, or add a drop set.`:null,capped:atCap};
  }
  return null;
}
/* Every top set at the top of the range: the next load (or more reps first when the step is large). */
function sgTopOfRange(C){
  const {ex,exId,plan,opts,T,all,every,exps,seen,inRR,injM,last,ws,stx,top,step,noAdd,abW,cap,atCap,capW,topPts,lastR,lastS,basis,lbl,prevBest,tgtRir,early,fl,tp}=C;
  if(topPts.every(p=>p.r>=plan.repMax)){
    const nw=capW(top+progStep(ex,plan,top+bwRefLoad(ex),top));
    if(ex.assist){const aw=top<0?Math.min(0,nw):nw;return {top,w:aw,text:`${lastS} Every set at ${lbl(top)} hit ${plan.repMax}: ${aw===0?'try it without help':`take ${fmtW(aw-top)} ${U()} of help off`} and aim for ${plan.repMin}+ reps.`,lastR,basis,
      last:lastS,target:`${lbl(aw)} for ${plan.repMin}+ reps in every set`,tgt:{kind:'load',w:aw,repMin:+plan.repMin,prevBest},easier:null};}
    /* A step that is large for the load (5 lb on a 35 lb dumbbell is 14%)
       costs more reps than the range has room for (r31, found by a
       simulated lifter following the app: 35 x 12 asked 40 for 8+, and 7
       was all there was). The target at the new load is then what the
       estimate says that load allows at the planned RIR, said as such, and
       the reps build back up from there. */
    /* A range under 3 reps wide (5 x 5, 3 x 3-5) is a fixed-rep plan: the
       load goes up a step and the reps are repeated, as those programs say,
       whatever the step costs (r32, second check: 5 x 5 at 50 kg asked for
       reps past 5 instead of 52.5). A miss is caught by the drop below the
       range. */
    const wide=+plan.repMax-+plan.repMin>=3;
    let aim=+plan.repMin;const q=Math.min(tgtRir,E1_MAX_RIR);const bwT=bwRefLoad(ex);
    if(!noE1(ex)){let est=null;for(const p of topPts){const v=fitE(p.load,p.r,p.rq);if(v!=null&&(est==null||v>est))est=v;}
      /* Only a step that costs 1.5 reps or more is large for the load (about
         5% or more, r32): a 5 lb step on a 5 x 5 at 225 costs under one, and
         a fixed-rep plan goes up and repeats the reps, the drop below the
         range catching a miss. Read against the planned RIR alone, a 5 x 5
         at 335 with no RIR rated (read as 0) made 5 lb (1.5%) look like two
         reps. */
      const f=est?rtfAt(est,nw+bwT):null;const cost=f!=null?rtfAt(est,top+bwT)-f:0;if(f!=null&&cost>=1.5&&wide){const can=Math.floor(f-q+1e-9);if(can<aim)aim=Math.max(1,can);}}
    // Not when every set was rated 5 or more in reserve: the estimate is only a floor there (r34.2).
    if(topPts.every(p=>p.rir!=null&&p.rir>=5))aim=+plan.repMin;
    const big=aim<+plan.repMin;
    /* Before such a step, a few more reps at this load first (r32, from the
       third review: a cable fly asked "20 kg for 9+" on a 10-15 plan, the
       app aiming under its own range). The reps to build to are those that
       make the new load reachable for the bottom of the range at the planned
       RIR, by the same estimate, and at most a quarter of the top of the
       range past it (at least 2). Once there, the step is taken, with the
       lower aim if the estimate still says so (a plan of curls for 5 on 5 lb
       dumbbell steps asked "aim for 1+" without this cap). */
    if(big&&nw+bwT>0&&top+bwT>0){
      const rn=+plan.repMin+q;const need=rn<=10?(nw+bwT)*36/(37-rn):(nw+bwT)*(1+rn/30);
      const ext2=+plan.repMax+Math.max(2,Math.round(+plan.repMax*0.25));const Z=Math.min(ext2,Math.ceil(rtfAt(need,top+bwT)-q-1e-9));
      const minR=Math.min(...topPts.map(p=>p.r));
      if(Z>minR){
        const total=tp.reduce((a,p)=>a+p.r,0);const nT=tp.length;const over=overSets(nT,plan);
        return {top,w:top,text:`${lastS} Every set at ${lbl(top)} hit ${plan.repMax}. The next step, ${fmtW(nw-top)} ${U()}, is large for this load, so build every set to ${Z} here first; then the new load starts inside your range.`,lastR,basis,
          last:lastS,target:`${total+1}+ reps ${over} at ${lbl(top)}, building to ${Z} each`,tgt:{kind:'reps',w:top,total,n:nT,rs:tp.map(p=>p.r),prevBest},easier:null,buildTo:Z};
      }
    }
    return {top,w:nw,text:`${lastS} Every set at ${lbl(top)} hit ${plan.repMax}: add ${fmtW(nw-top)} ${U()}${cap!=null&&nw>=cap-1e-6?', which is the heaviest available,':''} and aim for ${aim}+ reps${big?`, then build back to ${plan.repMax}. That step is large for this load, so fewer reps than the range is expected at first`:''}.`,lastR,basis,
      last:lastS,target:`${lbl(nw)} for ${aim}+ reps in every set`,tgt:{kind:'load',w:nw,repMin:aim,prevBest},easier:null};
  }
  return null;
}
/* A bad day under the range at a load done in it before: the bottom of the range again. */
function sgBadDay(C){
  const {ex,exId,plan,opts,T,all,every,exps,seen,inRR,injM,last,ws,stx,top,step,noAdd,abW,cap,atCap,capW,topPts,lastR,lastS,basis,lbl,prevBest,tgtRir,early,fl,tp}=C;
  /* A bad day at a load already done in the range (r32, second check: 7,
     7, 6, 6 then 5, 5, 4, 4 asked "19+ reps" and greyed 5, 5, 4, 4): every set
     under the range, the session before at this load in it. The target is
     the bottom of the range in every set again, not one rep more than the
     bad day. */
  {const prv=exps.length>=2?exps[exps.length-2]:null;const pAt=prv&&Math.abs(prv.topW-top)<1e-6?atLoad(prv.pts,top):[];
    if(topPts.length&&topPts.every(p=>p.r<+plan.repMin)&&pAt.length&&pAt.every(p=>p.r>=+plan.repMin))
      return {top,w:top,text:`${lastS} Every set fell under ${plan.repMin} at ${lbl(top)}, where you did ${plan.repMin}+ the time before. Stay at ${lbl(top)} and get back to ${plan.repMin}+ in every set.`,lastR,basis,
        last:lastS,target:`${lbl(top)} for ${plan.repMin}+ reps in every set`,tgt:{kind:'load',w:top,repMin:+plan.repMin,prevBest},easier:null};}
  return null;
}
/* Otherwise: beat last time's reps at the same load. */
function sgReps(C){
  const {ex,exId,plan,opts,T,all,every,exps,seen,inRR,injM,last,ws,stx,top,step,noAdd,abW,cap,atCap,capW,topPts,lastR,lastS,basis,lbl,prevBest,tgtRir,early,fl,tp}=C;
  /* The rep target covers the same number of sets as last time, so an extra
     set can never count as progress on its own. A set under the range that
     counts as the bottom of it (repFloor) is said. */
  const total=tp.reduce((a,p)=>a+p.r,0);const nT=tp.length;
  const over=overSets(nT,plan);
  const floored=tp.some((p,i)=>topPts[i]&&topPts[i].r<p.r)?` (a set under ${plan.repMin} counts as ${plan.repMin})`:'';
  return {top,w:top,text:`${lastS} Beat ${total} reps ${over} at ${lbl(top)}${floored}. When every set at that load reaches ${plan.repMax}, ${ex.assist?'take some help off':'add load'}.`,lastR,basis,
    last:lastS,target:`${total+1}+ reps ${over} at ${lbl(top)}`,tgt:{kind:'reps',w:top,total,n:nT,rs:tp.map(p=>p.r),prevBest},easier:stx.easier?easierText(ex,stx.easier):null};
}
/* Timed holds: double progression on seconds. Beat the total time at the same
   load; when every hold reaches the top of the range, add the load step. */
/* A first session of a close variation (r32.1, from r32's second check: a
   swap from DB curl to hammer curl started from nothing). A lift with no
   history borrows a start from a related lift trained in the last 120 days:
   same equipment, load meaning (per dumbbell, total, stack), one side or two,
   main muscle and movement, neither on bodyweight, timed or without an
   estimate. Machines and cables are left out: two machines' numbers do not
   compare. The newest such lift's last full session gives an estimate from
   its working sets; the start is 90% of it (80% on a compound lift, where
   variations differ more: a front squat is well under a back squat), for the
   middle of the range with one more rep in reserve than planned, rounded
   down to the step (the related lift's rack for dumbbells). Conventions,
   meant to err light; the next session works out from what was done. */
// One leg or arm at a time, by name: a lunge is not a squat at 90% of its load.
const KIN_UNI=/lunge|split squat|step-up|single[- ]|one[- ]arm|1-arm|pistol|bulgarian|cossack|unilateral/i;
function kinOf(ex,T){
  if(!ex||ex.bw||ex.assist||ex.timed||noE1(ex)||!['barbell','dumbbell','kettlebell','landmine','other'].includes(ex.equip))return null;
  const pat=patternOf(ex);if(!pat)return null;const I=IDX();let best=null;const from=addDays(T,-120);
  for(const id of Object.keys(I.byEx)){if(id===ex.id)continue;const e=EX(id);
    if(!e||e.archived||e.bw||e.assist||e.timed||noE1(e)||e.equip!==ex.equip||loadMode(e)!==loadMode(ex)||!!e.perSide!==!!ex.perSide||KIN_UNI.test(e.name)!==KIN_UNI.test(ex.name)||e.primary!==ex.primary||patternOf(e)!==pat)continue;
    const xs=I.byEx[id].filter(x=>x.date<=T&&!offSession(x)&&!x.cut);const x=xs[xs.length-1];if(!x||x.date<from)continue;
    if(!best||x.date>best.x.date)best={ex:e,x};}
  return best;
}
function kinStart(ex,plan,T){
  const k=kinOf(ex,T);if(!k)return null;const x=k.x;const wl=workLoad(x.pts,+plan.repMin||0);const at=atLoad(x.pts,wl);
  let est=null,set=null;for(const p of at){const v=fitE(p.load,p.r,p.rq);if(v!=null&&(est==null||v>est)){est=v;set=p;}}
  if(est==null)return null;
  const mid=Math.round((+plan.repMin+ +plan.repMax)/2);const q=Math.min((+plan.rir||0)+1,E1_MAX_RIR);
  const want=e1inv(est*(isCompound(ex)?0.8:0.9),mid+q);
  const L=gymRack(ex,plan);let w;
  if(L){const c=L.filter(x=>x<=want+1e-6);if(!c.length)return null;w=c[c.length-1];}
  else{const rs=rackKind(ex)&&rackKind(k.ex)?rackStep(k.ex):null;const st=toD(rs||incOf(ex,plan));if(!(st>0))return null;
  w=fromD(Math.floor(toD(want)/st+1e-9)*st);}if(!(w>0))return null;
  return {ex:k.ex,date:x.date,w,set:`${loadLabel(k.ex,set.w)}×${set.r}`};
}
function suggestTimed(ex,plan,exps,opts,injM,all){
  opts=opts||{};
  const side=ex.perSide?' per side':'';
  if(!exps||!exps.length){
    if(injM)return {w:ex.bw?0:null,text:`Injury flagged (${injLabel(injM)}). Keep holds short and easy, and stop on pain.`,lastR:[],last:'',target:'',tgt:null,inj:injM};
    return {w:ex.bw?0:null,text:`No history yet. Hold for ${repSpan(plan.repMin,plan.repMax,'-')} seconds${side} each set.`,lastR:[],last:'',target:'',tgt:null};
  }
  const last=exps[exps.length-1],ws=last.pts;
  const top=Math.max(...ws.map(p=>p.w));const topPts=ws.filter(p=>Math.abs(p.w-top)<1e-6);
  const lbl=w=>`${loadLabel(ex,w)}${ex.bw?'':' '+U()}${loadNote(ex)}`;
  const L0=lastOf(all,last,p=>`${loadLabel(ex,p.w)} for ${p.r}s`);
  const lastR=L0.lastR,lastS=L0.line,basis=L0.basis;
  if(injM)return {prev:L0.prev,w:top,text:`${lastS} Injury flagged (${injLabel(injM)}): stay at or below ${lbl(top)}, keep it easy, and stop on pain.`,lastR,basis,last:lastS,target:'',tgt:null,easier:null,inj:injM};
  if(opts.deload||opts.light)return {prev:L0.prev,w:top,text:`${lastS} ${opts.deload?'Deload':'Lighter day'}: same load, hold about two thirds as long, and stop well before shaking.`,lastR,basis,last:lastS,target:'',tgt:null,easier:null};
  const step=incOf(ex,plan,top);const cap=capOf(ex,plan,top);
  if(step>0&&topPts.every(p=>p.r>=plan.repMax)&&!atCapOf(ex,plan,top,cap)){
    const nw=cap!=null?Math.min(top+step,cap):top+step;
    return {prev:L0.prev,w:nw,text:`${lastS} Every hold at ${lbl(top)} reached ${plan.repMax}s: add ${fmtW(nw-top)} ${U()}${ex.bw?' (a plate or a vest)':''} and aim for ${plan.repMin}s+.`,lastR,basis,
      last:lastS,target:`${lbl(nw)} for ${plan.repMin}s+ in every set`,tgt:{kind:'load',w:nw,repMin:+plan.repMin,prevBest:null},easier:null};
  }
  const total=topPts.reduce((a,p)=>a+p.r,0);const nT=topPts.length;
  const over=overSets(nT,plan,'hold');
  return {prev:L0.prev,w:top,text:`${lastS} Beat ${total}s ${over} at ${lbl(top)}. When every hold reaches ${plan.repMax}s, add load.`,lastR,basis,
    last:lastS,target:`${total+1}s+ ${over} at ${lbl(top)}`,tgt:{kind:'reps',w:top,total,n:nT,rs:topPts.map(p=>p.r),prevBest:null},easier:null};
}
/* Default plan for an exercise that is not in the routine yet. Timed holds
   start at 30 to 60 seconds rather than 8 to 12. */
// The profile's rules for a lift (r44); with no profile, or Size, exactly the defaults as before.
// plain: without the profile, for reading sessions already logged (the pace model, r44 review).
function defPlan(exId,plain){const ex=EX(exId);return ex.timed?{...DEFAULT_PLAN,repMin:30,repMax:60,rest:60}:profPlan(ex,plain);}
/* Load step: the exercise's own setting wins, so one change applies on every
   day and routine the lift appears in. */
/* The default step is stored as 5 lb, from before units were chosen, so a
   kg user saw "add 2.3 kg". Either unit's default (5 lb or 2.5 kg) now reads
   as the current unit's, so steps follow a change of units; any other step is
   used exactly as typed (r27). */
const STEP_LB=5*LB;
function unitStep(){return U()==='kg'?2.5:STEP_LB;}
function stepRead(v){return Math.abs(v-STEP_LB)<1e-6||Math.abs(v-2.5)<1e-6?unitStep():v;}
/* `at`: the load the step is taken from. Only a rack from Your gym needs it
   (r33): its spacing can change along the rack (2.5 lb steps to 25, then 5). */
function incOf(ex,plan,at){
  const v=stepRead(ex&&ex.inc!=null?ex.inc:(plan&&isNum(+plan.inc)?+plan.inc:STEP_LB));
  if(ex&&ex.inc==null&&Math.abs(v-unitStep())<1e-6){
    const L=gymRack(ex,plan);if(L)return rackGap(L,at);
    if(rackKind(ex)){const g=rackStep(ex);if(g)return g;}
    const gs=gymStep(ex);if(gs)return gs;
  }
  return v;
}
/* ---------- Your gym (r33, item 207) ----------
   What the gym has: its dumbbells and kettlebells, the plates on hand, and
   the step of its cable and machine stacks. Kept in the unit the gym is
   labelled in (a rack in lb stays in lb after a switch to kg). Nothing set
   means nothing changes: every default below is the step used before.
   Precedence: a step set on the exercise or in the plan, then Your gym, then
   the rack read from logged loads (r32), then 5 lb or 2.5 kg. */
// Function declarations, not constants: normalize() runs on the first load, before the constants below exist.
function gymPlates(u){return u==='kg'?[25,20,15,10,5,2.5,1.25]:[45,35,25,10,5,2.5];}
/* Every field checked; anything out of range is dropped, never guessed. */
function gymClean(g){
  if(!g||typeof g!=='object'||(g.u!=='lb'&&g.u!=='kg'))return null;const out={u:g.u};const n=v=>{const x=+v;return isFinite(x)?Math.round(x*1000)/1000:NaN;};
  const d=g.db;if(d&&typeof d==='object'){const lo=n(d.lo),hi=n(d.hi),st=n(d.st),fine=n(d.fine),fineTo=n(d.fineTo);
    if(lo>0&&hi>=lo&&hi<=500&&st>0&&st<=50){const db={lo,hi,st};if(fine>0&&fine<st&&fineTo>lo){db.fine=fine;db.fineTo=Math.min(fineTo,hi);}if(dbListOf(db))out.db=db;}}
  if(Array.isArray(g.kb)){const kb=[...new Set(g.kb.map(n).filter(x=>x>0&&x<=300))].sort((a,b)=>a-b).slice(0,40);if(kb.length)out.kb=kb;}
  if(Array.isArray(g.plates)){const all=gymPlates(g.u);const pl=all.filter(x=>g.plates.map(n).includes(x));if(pl.length)out.plates=pl;}
  {const st=n(g.stack);if(st>0&&st<=100)out.stack=st;}
  return Object.keys(out).length>1?out:null;
}
function gymOf(){const g=state.settings.gym;return g&&typeof g==='object'?g:null;}
const gymK=(g,v)=>g.u==='kg'?v:v*LB;
function r3(v){return Math.round(v*1000)/1000;}
/* Dumbbells as typed in Settings: from, to, a step, and optionally a
   smaller step up to some weight (5 to 25 by 2.5, then 5s to 120). */
// More than 300 weights is a typo (0.5 to 200 by 0.5), refused rather than cut short.
function dbListOf(d){
  if(!d||!(d.lo>0)||!(d.hi>=d.lo)||!(d.st>0))return null;const out=[];let v=d.lo;
  while(v<=d.hi+1e-6){if(out.length>=300)return null;out.push(r3(v));v=r3(v+(d.fine>0&&d.fineTo>0&&v<d.fineTo-1e-6?d.fine:d.st));}
  return out;
}
/* The loads this lift can be done at, in kg, lightest first, or null: only
   dumbbell and kettlebell lifts, with no step of their own, logged as the
   weight of one bell (per dumbbell, or one dumbbell held). */
function gymRack(ex,plan){
  const g=gymOf();if(!g||!ex||ex.bw||ex.assist||ex.timed||ex.inc!=null)return null;
  if(plan&&isNum(+plan.inc)&&Math.abs(stepRead(+plan.inc)-unitStep())>1e-6)return null;
  const k=rackKind(ex);if(!k)return null;
  const m=loadMode(ex);if(!(m==='each'||(m==='total'&&(ex.load==null||ONE_DB.has(ex.id)))))return null;
  const L=k==='dumbbell'?dbListOf(g.db):Array.isArray(g.kb)&&g.kb.length?g.kb:null;
  return L&&L.length?L.map(v=>gymK(g,v)):null;
}
/* A load typed as shown on screen is within half the last shown digit of
   the bell it means: an 8 kg dumbbell is shown as 17.6 lb, which is 7.983 kg
   (review of r33). Rack comparisons use this, so a bell typed as shown is
   that bell, never "0.02 kg under the next one". */
/* A load typed for a bell is that bell when it is nearer to it than to
   its neighbours (r34.2, from the review: a 16 kg dumbbell typed as 35 lb,
   15.88 kg, read as just under itself, and the "step up" was the same bell,
   "add 0.3 lb"). Within 45% of the gap around the bell; never less than half
   the last shown digit. Bounds a load must not pass (the target, the cap)
   keep the narrow tolerance. */
function rackTol(L,at){const base=U()==='lb'?0.05*LB:0.05;if(!L||!L.length||at==null||!isNum(at))return base;
  let i=0;for(let k=1;k<L.length;k++)if(Math.abs(L[k]-at)<Math.abs(L[i]-at))i=k;
  const gs=[i>0?L[i]-L[i-1]:null,i<L.length-1?L[i+1]-L[i]:null].filter(g=>g!=null&&g>0);const gap=gs.length?Math.min(...gs):0;
  return Math.abs(L[i]-at)<=Math.max(base,0.45*gap)?Math.max(base,Math.abs(L[i]-at)+1e-6):base;}
// The step up from `at` on the rack; with no load to step from, its most common spacing.
function rackGap(L,at){
  if(L.length<2)return L[0]||0;
  if(at!=null){const t=rackTol(L,at);const nx=L.find(x=>x>at+t);if(nx!=null)return nx-at;return L[L.length-1]-L[L.length-2];}
  const gs=L.slice(1).map((x,i)=>r3(x-L[i]));const c={};let best=gs[0];for(const v of gs){c[v]=(c[v]||0)+1;if(c[v]>c[best])best=v;}return best;
}
/* Gym-wide steps for other lifts: two of the smallest plate on hand for a
   bar or a two-sleeve machine logged as the total (leg press, hack squat),
   one for a landmine's single sleeve or a lift logged per side, a stack its
   own step. */
function gymStep(ex){
  const g=gymOf();if(!g||!ex||ex.bw||ex.timed)return null;
  const pm=platesMode(ex),m=loadMode(ex);
  if(Array.isArray(g.plates)&&g.plates.length&&pm!=='none'){const mn=Math.min(...g.plates);return gymK(g,m==='side'||pm==='sleeve'?mn:2*mn);}
  if(m==='stack'&&g.stack>0)return gymK(g,g.stack);
  return null;
}
/* The heaviest available: the exercise's own, else the top of the rack. A
   lift logged above the top of the rack is on bells the rack does not list
   (another gym, a rack set wrong), so the rack is no cap for it (review). */
function capOf(ex,plan,top){const L=gymRack(ex,plan);let r=L?L[L.length-1]:null;if(r!=null&&top!=null&&top>r+rackTol(L,top))r=null;return ex.maxLoad!=null?(r!=null?Math.min(ex.maxLoad,r):ex.maxLoad):r;}
// At the cap: within the rack's tolerance when the cap is the rack's.
function atCapOf(ex,plan,top,cap){const L=gymRack(ex,plan);return cap!=null&&top>=cap-(L&&(ex.maxLoad==null||cap<ex.maxLoad-1e-6)?rackTol(L,top):1e-6);}
/* A suggestion that is not on the rack moves onto it: up, to the heaviest
   rack weight not past it that is still above last time; down, to the
   heaviest not past it. A load equal to last time's is left, since it was
   lifted. Engine steps are taken from the rack already, so this is the net
   for multi-step jumps on a rack whose spacing changes. */
function rackSnap(ex,plan,res){
  const L=gymRack(ex,plan);if(!L||!res||res.w==null||ex.timed)return res;
  const w=res.w,top=res.top,tl=rackTol(),tt=rackTol(L,top);if(L.some(x=>Math.abs(x-w)<1e-6)||(top!=null&&Math.abs(w-top)<1e-6))return res;
  const dn=L.filter(x=>x<=w+tl);let nw;
  if(top!=null&&w>top){const c=dn.filter(x=>x>top+tt);nw=c.length?c[c.length-1]:L.find(x=>x>top+tt);}
  else nw=dn.length?dn[dn.length-1]:L[0];
  return nw==null||Math.abs(nw-w)<1e-9?res:swapW(ex,res,nw);
}
// Puts a new load into a suggestion, its words included.
function swapW(ex,res,nw){
  const a=loadLabel(ex,res.w),b=loadLabel(ex,nw);const fix=t=>t?t.split(a).join(b):t;
  const out={...res,w:nw,target:fix(res.target)};
  out.text=res.last&&res.text.startsWith(res.last)?res.last+fix(res.text.slice(res.last.length)):fix(res.text);
  if(res.tgt&&res.tgt.w!=null)out.tgt={...res.tgt,w:nw};
  return out;
}
/* Dumbbells and kettlebells come in fixed weights (r32, from the third
   review: 12 kg dumbbells went to 14.5, which no rack has). With no step set
   on the exercise, the step is the largest common rack spacing that every
   load logged on it fits: 12, 14 and 16 kg is a rack in 2 kg steps, 12.5 and
   15 one in 2.5. Loads that fit both (10, 20) keep the default. Steps are
   read in the unit on screen, since that is what the rack is labelled in. */
const RACK={dumbbell:{kg:[2.5,2,1,0.5],lb:[5,2.5,1]},kettlebell:{kg:[4,2,1],lb:[5,2.5]}};
// The library files kettlebell lifts under Other equipment, so they are found by name.
function rackKind(ex){return ex.equip==='dumbbell'?'dumbbell':ex.equip==='kettlebell'||/kettlebell/i.test(ex.name||'')?'kettlebell':null;}
function rackStep(ex){
  const I=IDX();I._rack=I._rack||{};const key=U()+ex.id;if(I._rack[key]!==undefined)return I._rack[key];
  const xs=(I.byEx[ex.id]||[]).slice(-12);const ws=[];for(const x of xs)for(const p of x.pts)if(p.w>0)ws.push(toD(p.w));
  const fits=g=>ws.every(w=>Math.abs(w/g-Math.round(w/g))<0.01);
  const g=ws.length?RACK[rackKind(ex)][U()].find(fits):null;
  return I._rack[key]=g?fromD(g):null;
}
/* When every set reaches the top of the range, the load goes up by whole
   multiples of the smallest step you can add, sized to about 2.5% of the
   load on compound lifts and 5% on isolation lifts. A fixed 5 lb was 20% on a
   25 lb raise and 1% on a 500 lb leg press. */
/* The jump can be set per exercise in a routine (plan.jump, r30, V: "the
   progression should be overridable in the planner"): a percent of the load,
   rounded down to whole load steps and never less than one step; 0 means
   always one step. Unset, it is the 2.5% or 5% above. */
function jumpPct(ex,plan){return plan&&plan.jump!=null&&isNum(+plan.jump)?Math.max(0,+plan.jump)/100:isCompound(ex)?0.025:0.05;}
function progStep(ex,plan,loadKg,at){
  const L=at!=null?gymRack(ex,plan):null;
  /* On a rack: the heaviest rack weight within the jump, at least the next one up. */
  if(L){const ta=rackTol(L,at);const up=L.filter(x=>x>at+ta);if(!up.length)return rackGap(L,at);const want=at+jumpPct(ex,plan)*Math.max(0,loadKg);let nw=up[0];for(const x of up)if(x<=want+1e-6)nw=x;return nw-at;}
  const inc=incOf(ex,plan,at);if(!(inc>0))return inc;const pct=jumpPct(ex,plan);return inc*Math.max(1,Math.floor(pct*Math.max(0,loadKg)/inc+1e-9));}
/* Most a single session's easy RIR may raise the load: 10%, or 15% on an
   isolation lift under 20 kg, where one plate or dumbbell step is a large
   fraction. One rep of RIR error is normal, so bigger jumps overshoot. */
function jumpCap(ex,loadKg,early){return early?1.25:!isCompound(ex)&&loadKg<20?1.15:1.10;}
/* For picking a load only, never shown (r31): the estimate up to 12 reps to
   failure, then Epley to 30. With the 12-rep limit, a set of 25 or a set of
   12 with 5 in reserve had no estimate, so a beginner who started light got
   one 5 lb step a session for months. Past 12 it is rough, which is why the
   jump stays capped. */
function fitE(load,r,rir){const v=e1(load,r,rir);if(v!=null)return v;if(!(load>0&&r>0))return null;const q=rir==null||rir===''?0:Math.min(Math.max(+rir,0),E1_MAX_RIR);const t=+r+q;return t<=30?load*(1+t/30):null;}
/* An exercise added mid-session borrows its settings from wherever it already
   sits in the active routine instead of a generic 3 x 8-12. */
function planFor(exId,R,dayId,plain){
  R=R||activeRoutine();
  // The day being trained first: the same lift can sit on two days with different ranges.
  const days=dayId?[...R.days.filter(d=>d.id===dayId),...R.days.filter(d=>d.id!==dayId)]:R.days;
  for(const d of days)for(const it of d.items)if(it.exId===exId){const {uid:_u,ss:_s,...p}=it;return {...DEFAULT_PLAN,...p,ss:null};}
  return defPlan(exId,plain);
}
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
function easierText(ex,e){return `Getting easier at ${loadLabel(ex,e.w)}${ex.bw?'':' '+U()}: RIR ${e.from} → ${e.to} at the same reps. Adding load today is reasonable.`;}
/* Plates per side for a barbell load, greedy from the biggest plate down. */
const PLATES_LB=[45,35,25,10,5,2.5],PLATES_KG=[25,20,15,10,5,2.5,1.25];
/* Small change plates (r29, item 98) add 1.25 lb or 0.5 kg, for gyms that
   have them; the load step is still set per exercise. */
function plateList(u){u=u||U();const g=gymOf();const own=g&&(g.u||U())===u&&Array.isArray(g.plates)&&g.plates.length?g.plates.slice().sort((a,b)=>b-a):null;const b=own||(u==='lb'?PLATES_LB:PLATES_KG);return state.settings.smallPlates?[...b,u==='lb'?1.25:0.5]:b;}
/* The bar an exercise is loaded on: its own (a trap bar, an EZ bar) when set
   in the exercise editor, else the bar in Settings. */
function exBarKg(ex){return ex&&ex.barKg>0?ex.barKg:barKg();}
/* The default bar is the gym's: a 20 kg bar in a gym labelled in kg, 45 lb in one in lb,
   whatever unit the app shows (r34.2: a kg gym with the app in lb was given a 45 lb bar). */
function barKg(){const b=state.settings.barKg;if(b!=null)return b;const g=gymOf();const u=g&&g.u||U();return u==='lb'?45*LB:20;}
/* A load at or below `to`, reached from `from` in whole steps of the
   exercise's own load step, so a stack stays on its pins and a dumbbell rack
   on its dumbbells, and never below the empty bar on a barbell lift (r27).
   It used to round to the nearest 5 lb or 2.5 kg whatever the equipment: a
   15 lb cable raise deloaded to 10, a 150 lb stack with 10 lb pins to 135, a
   95 lb bench warmed up at 40, under the bar. With no step set, it rounds
   down to 5 lb or 2.5 kg as before. May return `from` when nothing lighter
   exists (the bar itself). */
function lighterLoad(ex,plan,from,to){
  // On a rack from Your gym: the heaviest bell not past `to` and under `from`, else the lightest under `from`.
  const L=gymRack(ex,plan);
  if(L){const tl=rackTol(),tf=rackTol(L,from);const lo=L.filter(x=>x<from-tf);if(!lo.length)return Math.max(0,from);const c=lo.filter(x=>x<=to+tl);return c.length?c[c.length-1]:lo[0];}
  const step=incOf(ex,plan,from);let w;
  if(step>0){const k=Math.max(1,Math.ceil((from-to)/step-1e-6));w=from-k*step;}
  else w=roundLoad(to,true);
  /* The bar floor is for lifts on the full bar (bench, squat, rows), typed as
     the total. Curls and skull crushers are often on an EZ or fixed bar
     lighter than the bar weight setting, and a per-side number has no bar in
     it, so neither is floored. At the bar itself nothing lighter exists, so
     `from` comes back and a deload keeps the bar. */
  const floor=platesMode(ex)==='bar'&&loadMode(ex)==='total'&&(isCompound(ex)||ex.barKg>0)?exBarKg(ex):0;
  if(w<floor-1e-6)w=Math.min(floor,from);
  return Math.max(0,w);
}
function platesMode(ex){
  if(ex.plates)return ex.plates;
  if(ex.bw)return 'none';
  if(ex.equip==='barbell')return 'bar';
  if(ex.equip==='landmine')return 'sleeve';
  if(PLATE_SIDE_IDS.includes(ex.id))return 'side';
  return 'none';
}
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
/* A reps target compares today's first n sets at the load with last time's
   first n. When today has fewer working sets (removed, or trimmed by Short on
   time), the target shrinks to those sets, since the old total could no
   longer be reached. Targets saved before rs existed keep the old numbers. */
function effTarget(b){
  const t=b.tgt;if(!t||t.kind!=='reps')return t;
  const nw=b.sets.filter(x=>!x.warm&&!x.drop).length;
  if(!Array.isArray(t.rs)||!(nw>0)||nw>=t.n)return t;
  return {...t,n:nw,total:t.rs.slice(0,nw).reduce((a,v)=>a+v,0)};
}
/* "Over your first 3 sets" only when the plan has more sets than that, so
   the extra ones are clearly not counted; "over 4 sets" when 4 is all there
   are (r34.2, from the review). */
function overSets(n,plan,kind){const w=kind==='hold'?'hold':'set';if(n===1)return `in one ${w}`;return +(plan&&plan.sets)>n?`over your first ${n} ${w}s`:`over ${n} ${w}s`;}
function targetText(b){
  const t=b.tgt,e=effTarget(b);if(!t||t===e||!b.target)return b.target;
  const m=b.target.match(/^(\d+)(s?)\+ (reps )?(?:in one set|over (?:your first )?\d+ sets|in one hold|over (?:your first )?\d+ holds)( at .*)$/);if(!m)return b.target;
  const hold=m[2]==='s';const over=e.n===1?(hold?'in one hold':'in one set'):`over ${e.n} ${hold?'holds':'sets'}`;
  return `${e.total+1}${m[2]}+ ${m[3]||''}${over}${m[4]}`;
}
function blockProgress(b){
  const t0=b.tgt;if(!t0)return null;const t=effTarget(b);
  const ex=EX(b.exId);const bw=bwRefLoad(ex);
  const done=b.sets.filter(s=>s.done&&!s.warm&&!s.drop&&+s.r>0);
  if(!done.length)return {text:'',beat:false};
  const at=done.filter(s=>Math.abs((+s.w||0)-t.w)<1e-6);
  const heavier=done.filter(s=>(+s.w||0)>t.w+1e-6);
  let heavyBeat=false,heavyTxt='';
  if(heavier.length&&t.prevBest!=null&&!ex.timed){
    let best=null,bs=null;for(const s of heavier){const v=e1(bw+(+s.w||0),+s.r,rirEst(s,ex));if(v!=null&&(best==null||v>best)){best=v;bs=s;}}
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
    const n=cnt.reduce((a,s)=>a+ +s.r,0);
    const sx=ex.timed?'s':'',u=ex.timed?'s':' reps';
    const base=n>t.total?`Beaten: ${n}${u} at that load, last time ${t.total}${sx}`:`${n}${sx} of ${t.total+1}${u} so far at that load`;
    return {text:heavyTxt?`${base}. ${heavyTxt}`:base,beat:n>t.total||heavyBeat};
  }
  const hit=done.filter(s=>(+s.w||0)>=t.w-1e-6&&+s.r>=t.repMin).length;
  // Drop sets are extra work after the working sets, never part of the target.
  const planned=b.sets.filter(s=>!s.warm&&!s.drop).length;
  const base=`${hit} of ${planned} sets hit ${t.repMin}${ex.timed?'s':''}+ at the new load`;
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
function greyW(b,si){
  const s=b&&b.sets[si];if(!s||s.warm||s.drop)return null;
  // After a set the app adjusted from (b.adj, r34), the rows under it carry the adjusted load.
  for(let i=si-1;i>=0;i--){const x=b.sets[i];if(!x.warm&&!x.drop&&x.w!=null)return b.adj&&b.adj.at===i?b.adj.w:x.w;}
  return b.sw==null?null:b.sw;
}
