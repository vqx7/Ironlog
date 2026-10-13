/* ---------- units ---------- */
const U=()=>state.settings.unit;
const LU=()=>U()==='lb'?'in':'cm';
const toD=kg=>kg==null?null:(U()==='lb'?kg/LB:kg);
const fromD=v=>v==null?null:(U()==='lb'?v*LB:v);
const r1=n=>Math.round(n*10)/10;
const fmtW=kg=>kg==null||isNaN(kg)?'':String(r1(toD(kg)));
/* Estimates (1RM, PR toasts, the bests board) are good to a few percent at best, so they
   show whole pounds or half kilos (r34): 293.8 next to 294 and 301 read as
   precision the numbers do not have. Loads keep their decimals. */
const fmtE=kg=>{if(kg==null||isNaN(kg))return '';const v=toD(kg);return String(U()==='lb'?Math.round(v):Math.round(v*2)/2);};
const lenD=cm=>cm==null?'':String(r1(U()==='lb'?cm/IN:cm));
const lenFrom=v=>U()==='lb'?v*IN:v;
function numIn(v){if(v===''||v==null)return null;const n=parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n;}

/* ---------- lookups ---------- */
let EXMAP=null;
// No prototype: an exercise id such as "constructor" must not find Object's.
function EX(id){if(!EXMAP){EXMAP=Object.create(null);for(const e of state.exercises)EXMAP[e.id]=e;}return EXMAP[id]||{id,name:'Deleted exercise',primary:'chest',secondary:[],equip:'other',bw:false,archived:true};}
const exName=id=>EX(id).name;
function activeRoutine(){return state.routines.find(r=>r.id===state.activeRoutineId)||state.routines[0];}
function loadLabel(ex,kg){if(ex.bw){return kg>0?`BW+${fmtW(kg)}`:kg<0?`BW−${fmtW(-kg)}`:'BW';}return fmtW(kg);}
/* An assisted lift keeps its sets as bodyweight minus the help, below 0, so
   every estimate, target and record works unchanged; the field shows and
   takes the help as a plain number, since phone number pads have no minus. */
const loadIn=(ex,w)=>w==null?'':fmtW(ex&&ex.assist?-w:w);

/* ---------- analytics ---------- */
let _idx=null,_cal=null,_bwRef,_pace=null;
function invalidate(){_idx=null;EXMAP=null;_cal=null;_rirUse=null;_bwRef=undefined;_pace=null;}
function bwKnownAt(date){let best=null;for(const b of state.bodyweights)if(b.date<=date&&(!best||b.date>=best.date))best=b;return best?best.kg:null;}
function bwAt(date){
  let best=null,earliest=null;
  for(const b of state.bodyweights){if(b.date<=date&&(!best||b.date>=best.date))best=b;if(!earliest||b.date<earliest.date)earliest=b;}
  return (best||earliest)?(best||earliest).kg:null;
}
const isWork=s=>!s.warm&&+s.r>0;
/* RIR as the analytics read it. Off: ignored everywhere, so every working set
   counts as hard and estimates use reps alone. On: as logged. Corrected: as
   logged, shifted by the median error of your recent calibration sets once
   there are at least two. The log itself is never changed, so switching modes
   is fully reversible. A calibration set is logged to failure and is never
   shifted. */
/* The correction is only applied to sets called at RIR 4 or less, because
   calibration sets measure the error close to failure, and a compound lift
   uses compound calibration sets when there are two or more (isolation
   likewise), else all of them. */
function rirEff(s,ex){
  const m=state.settings.rirMode;if(m==='off')return null;
  if(s.rir==null||s.rir==='')return null;const v=+s.rir;if(!isFinite(v))return null;
  if(m==='cal'&&!s.cal&&v<=4){const c=calStats();const k=ex?(isCompound(ex)?'c':'i'):null;const src=k&&c.cls[k].recent>=2?c.cls[k]:c;
    if(src.recent>=2&&src.bias)return Math.min(10,Math.max(0,v+src.bias));}
  return v;
}
const rirShow=ex=>state.settings.rirMode!=='off'&&!(ex&&ex.timed);
/* Calibration sets across your real sessions. err is reps actually left at the
   stopping point minus reps you called: positive means you stop with more in
   the tank than you think. People mostly under-call it by about a rep
   (Halperin 2022). The correction is the median of the last 8 from the past
   12 weeks, shrunk toward zero while there are few (x n/(n+3): 40% at 2 sets,
   73% at 8), rounded to half a rep and capped at 2 reps either way. */
const CAL_WEEKS=12;
function calSummary(list){
  const last=list.slice(-8);const n=last.length;const med=n?median(last.map(p=>p.err)):null;
  const shr=med==null?0:med*n/(n+3);
  // Rounded to the nearest half rep symmetrically: Math.round sends x.5 up,
  // which made +1.5 and -1.5 shrink to +1 and -0.5.
  return {recent:n,raw:med,bias:Math.max(-2,Math.min(2,Math.sign(shr)*Math.round(Math.abs(shr)*2)/2)),mae:n?last.reduce((a,p)=>a+Math.abs(p.err),0)/n:null};
}
function calStats(){
  if(_cal)return _cal;
  const pts=[];
  for(const s of state.sessions){if(s.demo)continue;for(const b of s.ex){const c=isCompound(EX(b.exId))?'c':'i';for(const x of b.sets)if(x.cal&&+x.r>=x.cal.at)pts.push({date:s.date,err:(+x.r-x.cal.at)-x.cal.pred,c});}}
  pts.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const cut=addDays(today(),-7*CAL_WEEKS);const rec=pts.filter(p=>p.date>=cut);
  _cal={...calSummary(rec),n:pts.length,lastDate:pts.length?pts[pts.length-1].date:null,
    cls:{c:calSummary(rec.filter(p=>p.c==='c')),i:calSummary(rec.filter(p=>p.c==='i'))}};
  return _cal;
}
/* A blank RIR, for estimates and the hard-set count. RIR is optional and
   opened with a tap, so most logs mix rated and blank sets. Reading every
   blank as 0 made the same 100 x 8 estimate lower when left blank than when
   rated 2, so trends dipped, stalls were flagged and PRs appeared just from
   whether RIR was tapped. A blank is instead read as your usual RIR on that
   lift: the median of your rated working sets of it (not warm-ups, drop sets
   or RIR checks) in the last 12 weeks, once there are at least 3. That is a
   convention, not a study figure. With fewer, a blank counts as hard and as 0
   for estimates, which errs low and never inflates a PR. Recovery and the
   "that load was light" step read only the RIR you entered, since both act on
   what you said about effort. RIR off: no ratings are read at all. */
let _rirUse=null;
function rirUsual(exId){
  if(state.settings.rirMode==='off')return null;
  if(!_rirUse){_rirUse=Object.create(null);const cut=addDays(today(),-7*CAL_WEEKS);const by=Object.create(null);
    for(const ss of state.sessions){if(ss.date<cut)continue;for(const b of ss.ex){const ex=EX(b.exId);if(ex.timed)continue;for(const x of b.sets){if(!isWork(x)||x.drop||x.cal)continue;const q=rirEff(x,ex);if(q!=null)(by[b.exId]||(by[b.exId]=[])).push(q);}}}
    for(const k in by)if(by[k].length>=3)_rirUse[k]=median(by[k]);}
  const v=_rirUse[exId];return v==null?null:v;
}
const rirEst=(s,ex)=>{const q=rirEff(s,ex);return q!=null?q:ex?rirUsual(ex.id):null;};
/* Hard set: RIR 3 or less (Robinson 2024, Refalo 2023: growth rises as sets
   end closer to failure; the exact cut-off is a convention). A blank RIR is
   read as above and shown as assumed. A drop set is half a set: one heavy
   set with three drops is not four sets of work. */
const isHard=(s,ex)=>{if(!isWork(s))return false;const q=rirEst(s,ex);return q==null||q<=3;};
const setCredit=s=>s.drop?0.5:1;
/* Count RIR 4 to 5 as half a set (r40, item 41; a setting, off by default).
   Any working set past RIR 3 counts half: calls top out at 5, but Corrected
   RIR can read a call of 4 as 5.5 or 6, and that set is no less hard than a
   call of 5 (the independent review of r40).
   Growth rises as sets end closer to failure (Robinson 2024), so sets a long
   way short still do something; half is a convention, not a measured dose.
   It moves the weekly hard sets, the bands they are read against and the
   plan's weekly sets, and nothing else: estimates, PRs, recovery and the
   per-session flag keep counting hard sets only. With RIR off every working
   set is hard already, so the setting has nothing to do. */
// The range in the lifter's own effort scale: a half-rep scale allows 3.5, RPE reads 5 to 6.5.
const halfLbl=()=>{const k=rirScale();return k==='rpe'?'RPE 5 to 6.5':k==='half'?'RIR 3.5 to 5':'RIR 4 to 5';};
const rirHalfOn=()=>state.settings.rirHalf===true&&state.settings.rirMode!=='off';
function hardCredit(s,ex){if(isHard(s,ex))return setCredit(s);if(!rirHalfOn()||!isWork(s))return 0;const q=rirEst(s,ex);return q!=null&&q>3?setCredit(s)*0.5:0;}
/* One set as text, for history, tables and the coach: 225×5, or 45 s for a timed hold. */
function setShort(ex,w,r){return ex.timed?`${loadLabel(ex,+w||0)} for ${r}s`:`${loadLabel(ex,+w||0)}×${r}`;}
function setStr(ex,x){return `${x.warm?'(W) ':x.drop?'(D) ':''}${setShort(ex,x.w,x.r)}${!ex.timed&&x.rir!=null&&x.rir!==''?(rirScale()==='rpe'?' @RPE '+effShow(x.rir):' @'+effShow(x.rir)):''}${x.cal?' (RIR check)':''}`;}
/* Share of bodyweight an exercise actually moves. Only push-ups are measured
   (force plates, Ebben 2011: 64% on the floor, about 70% feet on a 30 cm
   box). A deficit adds depth, not load, so it stays at 64%. Pull-ups and dips
   use the whole body (the hands and forearms barely move; about 95% by
   segment tables). The rest are estimates from segment masses (de Leva 1996)
   and are editable per exercise. Only a user edit is stored. */
const BWF={assistPullup:1,assistDip:1,pullup:1,chinup:1,dips:1,triDips:1,pushup:.64,deficitPushup:.64,declinePushup:.7,invertedRow:.6,hyperext:.6,hangingLegRaise:.35,abWheel:.5,dragonFlag:.7,neckBridge:.3,sissy:.85,revNordic:.85,nordic:.85,ghr:.85,plank:.65,sidePlank:.6,deadHang:1,neckBridgeHold:.3,wallSit:.7,pushupPlus:.64,kneeRaise:.3,reverseCrunch:.3,crunch:.3,russianTwist:.4,copenhagen:.5};
function bwShare(ex){return ex&&ex.bwf!=null?ex.bwf:(ex&&BWF[ex.id]!=null?BWF[ex.id]:1);}
function bwLoad(ex,date){return ex&&ex.bw?(bwAt(date)||0)*bwShare(ex):0;}
function loadOf(ex,s,date){return bwLoad(ex,date)+(+s.w||0);}
/* PRs on a bodyweight lift are judged at one bodyweight (r32.1): the latest
   weigh-in, the same for every session. Each set's load includes the
   bodyweight of its day, so a weigh-in 0.4 kg up made the same 8 pull-ups or
   12 leg raises a new PR every week (8 identical weeks, 10 PRs counted), and
   the bests board dated a record to the heaviest day, not the first. A PR on
   these lifts is now more reps or more added load than before, as lifters
   count them. Since r34 estimates, trends, charts and the load engine are
   read at the latest weigh-in too (see IDX's pts); weight lifted keeps each
   day's. */
const bwRef=()=>_bwRef!==undefined?_bwRef:(_bwRef=bwAt('9999-12-31')||0);
// The bodyweight part of a bodyweight lift's load at the latest weigh-in: what the engine and every reading use (r34).
const bwRefLoad=ex=>ex&&ex.bw?bwRef()*bwShare(ex):0;
function prLoad(ex,s,date){return ex&&ex.bw?bwRef()*bwShare(ex)+(+s.w||0):loadOf(ex,s,date);}
/* ---------- what the load number means ----------
   Every set stores the number you typed, as you typed it. What it means is a
   property of the exercise, shown on the exercise and above the load column:
   - each:  per dumbbell, two dumbbells (DB bench, curls, lunges)
   - total: everything on one implement (a barbell with its bar, one dumbbell,
            plates on a landmine or a plate-loaded machine)
   - side:  plates on one side of a plate-loaded machine
   - stack: the pin setting on a cable or selectorized machine
   - bw:    added to bodyweight (pull-ups, dips)
   Estimated 1RM and targets stay in that same frame (per dumbbell, per side),
   so progress compares like with like. Weight lifted counts what actually
   moved: both dumbbells, both sides of the plates, both limbs when reps are
   logged per side. Changing an exercise's setting does not convert past sets. */
const LOAD_MODES=[['each','Per dumbbell (two dumbbells)'],['total','Total on the implement'],['side','Plates on one side'],['stack','Stack setting']];
const ONE_DB=new Set(['dbRow','krocRow','dbPullover','ohDbExt','concCurl','sideBend','goblet','slCalf','leanAwayLat','sideLyingER','slRdl']);
function loadMode(ex){
  if(!ex)return 'total';if(ex.bw)return 'bw';
  if(['each','total','side','stack'].includes(ex.load))return ex.load;
  if(ex.equip==='dumbbell')return ONE_DB.has(ex.id)?'total':'each';
  if(ex.equip==='cable'||(ex.equip==='machine'&&!PLATE_SIDE_IDS.includes(ex.id)))return 'stack';
  return 'total';
}
/* Short words for the load: shown next to numbers and on the exercise. */
function loadWords(ex){
  const m=loadMode(ex);
  if(ex&&ex.assist)return 'machine help';
  if(m==='each')return 'per dumbbell';
  if(m==='side')return 'plates per side';
  if(m==='stack')return 'stack setting';
  if(m==='bw')return 'added to bodyweight';
  if(ex.equip==='dumbbell')return 'one dumbbell';
  if(ex.equip==='barbell')return 'total, bar included';
  if(ex.equip==='landmine')return 'plates on the sleeve';
  if(ex.equip==='smith')return 'total on the bar';
  if(PLATE_SIDE_IDS.includes(ex.id)||ex.equip==='machine')return 'total plates';
  return 'total';
}
/* After a number in running text: "80 lb per dumbbell", "90 lb per side". */
function loadNote(ex){const m=loadMode(ex);return m==='each'?' per dumbbell':m==='side'?' per side':'';}
/* Load column heading in the logger. */
function loadHead(ex){const m=loadMode(ex),u=U().toUpperCase();if(ex&&ex.assist)return 'Help '+u;return m==='each'?u+' each':m==='side'?u+'/side':m==='stack'?'Stack':m==='bw'?'+'+u:u;}
/* On the exercise, always visible: what the load number is, and reps per
   side when that applies. Tap or hold for the longer version. */
function lmChips(ex){
  if(ex.timed&&!ex.bw&&loadMode(ex)!=='each')return ex.perSide?'<p class="lmrow"><span class="lm">seconds per side</span></p>':'';
  const m=loadMode(ex);
  if(ex.assist)return `<p class="lmrow"><span class="lm" data-tip="Enter the help the machine gives, as on its pin. Less help is progress; your logged bodyweight minus the help is what counts.">machine help</span></p>`;
  const long={each:'Enter the weight of one dumbbell. Weight lifted counts both.',side:'Enter the plates on one side. Weight lifted counts both sides.',stack:'Enter the pin setting. It is not comparable across machines.',bw:'Enter only what you add (belt, vest, dumbbell); 0 for bodyweight. Your logged bodyweight is added for estimates.'}[m]||(ex.equip==='barbell'?'Enter everything on the bar, the bar included.':ex.equip==='dumbbell'?'Enter the weight of the one dumbbell you hold.':'Enter the total load.');
  return `<p class="lmrow"><span class="lm" data-tip="${esc(long)}">${esc(loadWords(ex))}</span>${ex.perSide?`<span class="lm" data-tip="${esc(ex.timed?'Seconds for one side; do the same on the other.':'Reps for one side; do the same on the other. One set still counts as one set.')}">${ex.timed?'seconds':'reps'} per side</span>`:''}</p>`;
}
/* Weight actually moved by one set, for weekly totals. */
function tonnage(ex,s,date){
  const m=loadMode(ex);const w=+s.w||0;
  // Assisted with no bodyweight logged would go below 0; weight lifted is then 0.
  /* Bodyweight known on or before the date only (r30): a first weigh-in
     logged today used to be applied to every earlier session, so weight
     lifted in past weeks changed after the fact (4,420 to 6,634 kg). */
  const known=bwKnownAt(date||today());const bl=ex&&ex.bw&&known!=null?known*bwShare(ex):0;
  const load=m==='bw'?Math.max(0,bl+w):(m==='each'||m==='side')?w*2:w;
  return load*(+s.r||0)*(ex.perSide?2:1);
}
/* The one 1RM estimate used everywhere: trends, PRs, live badges, targets,
   load suggestions and the CSV. It works on reps to failure (RTF): reps plus
   logged RIR, a blank RIR counting as 0 (so the estimate errs low).
   - Brzycki up to 10 RTF: load x 36/(37 - RTF). Exactly the load at 1 RTF.
   - Epley for 11 and 12 RTF: load x (1 + RTF/30). The two meet at 10 RTF, so
     the curve has no jump. Epley alone read a double as 6.7% above a single.
   - Nothing past 12 RTF: the spread between people and in RIR calls grows
     too wide there (Nuzzo 2024, Halperin 2022).
   - A set called at more than 4 RIR is left out rather than read as 4.
   Estimates run low on deadlifts and high on leg-press-type machines. */
const E1_MAX_RIR=4;
function rtfOf(r,rir){const q=rir==null||rir===''||!isFinite(+rir)?0:Math.max(+rir,0);return q>E1_MAX_RIR?null:+r+q;}
function e1(load,r,rir){
  if(!(load>0&&r>0))return null;
  const rtf=rtfOf(r,rir);if(rtf==null||rtf>E1_MAX_REPS)return null;
  return rtf<=10?load*36/(37-rtf):load*(1+rtf/30);
}
/* The reading a lift's trend is drawn from (r30): e1() up to 12 reps to
   failure, then Epley up to 20. Past 12 the formulas spread too far to state
   a 1RM, but one lift compared with itself at similar reps still shows which
   way it is going, so a leg press done for 15 is not left without a trend.
   Never shown as a 1RM. */
function trendE(load,r,rir){
  if(!(load>0&&r>0))return null;const rtf=rtfOf(r,rir);if(rtf==null)return null;
  return rtf<=E1_MAX_REPS?e1(load,r,rir):rtf<=20?load*(1+rtf/30):null;
}
/* A rep PR counts at 90% or more of the strongest set before it (r30, a convention). */
const REP_PR_SHARE=0.9;
/* The load that leaves a given number of reps to failure at an estimated 1RM:
   the inverse of e1(). Past 12 RTF it keeps using Epley, only to pick loads. */
function e1inv(est,rtf){return rtf<=10?est*(37-rtf)/36:est/(1+rtf/30);}
/* Reps to failure a load allows at an estimated 1RM, the inverse the other way. */
function rtfAt(est,load){if(!(est>0&&load>0))return null;const b=37-36*load/est;return b<=10?b:30*(est/load-1);}
/* Rep band for PR comparisons: estimates from triples and from sets of 12 are
   not interchangeable, so a best is judged within its own band. */
const rtfBand=rtf=>rtf<=5?1:rtf<=10?2:3;
// The bands in words, counted as reps to failure (reps plus RIR).
/* Bands count reps to failure (reps plus reps in reserve), so they say so (r34.2, from the review:
   "sets of 11 to 12 reps" named the band of a set of 8 at 3 in reserve). */
const BAND_WORDS={1:'1 to 5 reps to failure',2:'6 to 10 reps to failure',3:'11 to 12 reps to failure'};
/* What an estimate PR is called (r34.2, from the review: a best for 6 to 8
   reps was shown as "Best estimate 30 kg (was 29)" beside an all-time best
   estimate of 30 kg from a set of 11): Best estimate only when it beats every
   earlier set's estimate, else the best for its band of reps. */
const BAND_SHORT={1:'1 to 5 reps to failure',2:'6 to 10 reps to failure',3:'11 to 12 reps to failure'};
function prOverall(p){return p.prevAll==null||(p.value!=null&&p.value>p.prevAll+1e-6);}
function prName(p){return prOverall(p)?'Best estimate':`Best for ${BAND_SHORT[p.bb]||'its reps'}`;}
/* The working load of one session of a lift (r31): the load done for the
   most sets, the heavier on a tie, among loads at 60% or more of the
   session's heaviest (unmarked warm-ups sit lower). A heavy top set, or a
   pair of them, before back-off sets is a top set: it counts for bests and
   PRs, while the next target, the grey reps and the trend build on the
   back-off sets the session was made of. The review tried each rule in
   turn: "heaviest done twice" read two singles at 405 before 335 x 5 x 5 as
   the work, and "heaviest near the range" read one 365 x 4 before 335 x 5 x 5
   as five sets due at 365. Straight sets, ramps to a load, and pyramids
   (one set at each load, so the heaviest) read as before. repMin is kept
   for callers; the rule does not need it. Assisted lifts store less help as
   a higher number, so the heaviest is still the hardest. */
function workLoad(pts,repMin){
  if(!pts.length)return 0;
  /* The 60% is of the total moved (load, which adds the bodyweight share on
     a pull-up or dip), not of the number typed: +25 on a 180 lb pull-up is
     89% of +50, not half (the review saw +50 prescribed for every set). */
  const T=p=>p.load!=null?p.load:p.w;const top=Math.max(...pts.map(T));const floor=top>0?top*0.6:-Infinity;
  const ok=p=>T(p)>=floor-1e-9;const k=v=>Math.round(v*1000);const n=new Map();for(const p of pts)if(ok(p))n.set(k(p.w),(n.get(k(p.w))||0)+1);
  let w=null,best=-1;for(const p of pts){if(!ok(p))continue;const c=n.get(k(p.w));if(c>best||(c===best&&p.w>w)){best=c;w=p.w;}}
  return w==null?Math.max(...pts.map(p=>p.w)):w;
}
const atLoad=(pts,w)=>pts.filter(p=>Math.abs(p.w-w)<1e-6);
// A rep range in words and labels: "5" when both ends are the same (r31: "5-5", "5×5-5").
const repSpan=(lo,hi,sep=' to ')=>+lo===+hi?`${+lo}`:`${+lo}${sep}${+hi}`;
const rangeWords=p=>+p.repMin===+p.repMax?`target of ${+p.repMin}`:`${+p.repMin}-${+p.repMax} range`;
function median(a){if(!a.length)return null;const s=[...a].sort((x,y)=>x-y);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;}
function sortedSessions(){return [...state.sessions].sort(sessCmp);}
/* IDX() is everything the screens read, built once per change (r36: the
   one 420-line function split into its steps, each below, with no change to
   what comes out; tests/r36.js compares every number with r35 on random
   histories). */
function IDX(){
  if(_idx)return _idx;
  const sessions=sortedSessions();
  const V=idxSessions(sessions);const byEx=V.byEx;
  const anchor=sessions.length?sessions[sessions.length-1].date:today();
  const winStart=addDays(anchor,-42);
  const wkAuto=idxAutoLighter(byEx);
  const lightWk=idxLightWeeks(sessions,wkAuto);
  const prs=[];const exStats={};
  for(const id of Object.keys(byEx)){const maxBest=idxPRs(id,byEx[id],prs);exStats[id]=idxLift(id,byEx[id],maxBest,anchor,winStart);}
  const scores=idxScores(exStats);
  prs.sort((a,b)=>a.date<b.date?1:a.date>b.date?-1:0);
  _idx={byEx,exStats,scores,prs,sessVol:V.sessVol,weekSets:V.weekSets,weekConf:V.weekConf,weekHard:V.weekHard,dayMus:V.dayMus,dayMeta:V.dayMeta,anchor,lightWk,rirCov:{logged:V.rirLogged,total:V.rirTotal}};
  return _idx;
}
/* Step 1: every session in date order. Hard sets per week, per day and per
   muscle, and each lift's exposure (its working sets read as loads, the
   working load, the best estimate, the trend readings, weight lifted). */
function idxSessions(sessions){
  // weekSets counts every hard set (and, with rirHalf on, half of each set
  // past RIR 3: hardCredit, r40). weekConf counts only those whose RIR was
  // actually logged. A set with a blank RIR still counts as hard, because
  // most working sets are, but guessing a value would be inventing data -- so
  // the two are tracked apart and the dashboard shows how much of your volume
  // is assumption rather than measurement.
  // dayMus: hard sets per muscle per date, counted like weekSets. Pick for me
  // reads recovery and the last 7 days from it.
  // dayMeta: per date and muscle, what changes recovery time: sets taken to
  // failure, sets all left at 3+ RIR, slow-recovery lifts, a first exposure.
  const byEx={},sessVol=[],weekSets={},weekConf={},dayMus={},dayMeta={},weekHard={};
  const recentFrom=addDays(today(),-28);const seenEx=new Set();
  let rirLogged=0,rirTotal=0;
  for(const ss of sessions){
    let vol=0;const wk=weekStart(ss.date);
    const ws=weekSets[wk]||(weekSets[wk]={});
    const wc=weekConf[wk]||(weekConf[wk]={});
    const dm=dayMus[ss.date]||(dayMus[ss.date]={});
    const dx=dayMeta[ss.date]||(dayMeta[ss.date]={});
    for(const b of sameExOnce(ss.ex)){
      const ex=EX(b.exId);const novel=!seenEx.has(b.exId);
      const mus=[[ex.primary,1],...ex.secondary.map(m=>[m,0.5])];
      for(const s of b.sets){
        if(!isWork(s))continue;
        const logged=state.settings.rirMode==='off'||!(s.rir==null||s.rir==='');
        if(ss.date>=recentFrom){rirTotal++;if(logged)rirLogged++;}
        const hard=isHard(s,ex);const cr=hard?setCredit(s):hardCredit(s,ex);if(!cr)continue;
        const q=rirEff(s,ex);weekHard[wk]=(weekHard[wk]||0)+cr;
        for(const [m,f] of mus){
          ws[m]=(ws[m]||0)+f*cr;
          if(logged)wc[m]=(wc[m]||0)+f*cr;
          // A half set from RIR 4 to 5 counts toward the week only; recovery and Pick for me read hard sets.
          if(!hard)continue;
          dm[m]=(dm[m]||0)+f*cr;
          const o=dx[m]||(dx[m]={fail:0,easy:0,hard:0,slow:false,novel:false});
          o.hard++;if(q===0)o.fail++;if(q!=null&&q>=3)o.easy++;if(SLOW_RECOVERY.has(ex.id))o.slow=true;if(novel)o.novel=true;
        }
      }
      seenEx.add(b.exId);
      const work=b.sets.filter(isWork);if(!work.length)continue;
      /* Drop sets are real work (they count toward hard sets and tonnage) but
         they are done fatigued at a reduced load, so they never feed e1RM,
         PRs, or next session's target. If a block is nothing but drop sets,
         use them rather than have no exposure at all. */
      const main=work.filter(s=>!s.drop);const ptsSrc=main.length?main:work;
      /* On a bodyweight lift every reading is at the latest weigh-in (r34,
         V: the right bodyweight pulled through everywhere): estimates, trends,
         charts, stalls, the lighter-week check and the load engine, as PRs
         already were (r32.1, prLoad). Read at each day's weigh-in, 8 kg lost
         on the scale read as unchanged push-ups being 10% weaker, with
         "look at recovery". Weight lifted (tonnage) keeps each day's weigh-in:
         that is the work actually done. */
      const pts=ptsSrc.map(s=>{const pl=prLoad(ex,s,ss.date);return {load:ex.bw?pl:loadOf(ex,s,ss.date),pl,r:+s.r,w:+s.w||0,rir:rirEff(s,ex),rq:rirEst(s,ex)};});
      // Mean logged RIR on the sets at this session's top load, or null if none was logged.
      // The working load (r31): a heavy top single is not where reps are built.
      const topW=workLoad(pts,b.rr?b.rr[0]:0);const tr=pts.filter(p=>Math.abs(p.w-topW)<1e-6&&p.rir!=null);
      const atTop=atLoad(pts,topW);
      const topRir=tr.length?tr.reduce((a,p)=>a+p.rir,0)/tr.length:null;const topReps=atTop.reduce((a,p)=>a+p.r,0);
      // Reps lost from the first to the last set at the top load, in set order.
      const drop=atTop.length>=2?atTop[0].r-atTop[atTop.length-1].r:null;
      // Timed holds and joint-rotation bodyweight lifts have no 1RM, and
      // seconds times load is not tonnage. bb: rep band of the best set.
      let best=null,bb=null;if(!noE1(ex))for(const p of pts){const v=e1(p.load,p.r,p.rq);if(v!=null&&(best==null||v>best)){best=v;bb=rtfBand(rtfOf(p.r,p.rq));}}
      // The same at the PR load (prLoad): identical to best except on a bodyweight lift.
      let pb=best,pbb=bb;if(ex.bw){pb=null;pbb=null;if(!noE1(ex))for(const p of pts){const v=e1(p.pl,p.r,p.rq);if(v!=null&&(pb==null||v>pb)){pb=v;pbb=rtfBand(rtfOf(p.r,p.rq));}}}
      /* r30: the trend reads its own value per session, two ways. tAdj uses
         RIR as read everywhere else; tRaw ignores RIR (reps alone). Which one
         a lift's trend uses is decided per lift once its sessions are known
         (trendUse): RIR rated on most sets, or reps alone. Both reach 20 reps
         to failure (trendE), so a leg press done for 15 still has a trend. */
      /* r31: the reading is the average over the working sets, not the best
         one set. With the best set alone, a lifter on double progression who
         had set 1 at the top of the range and kept adding reps to sets 2 to
         4 read as flat, then stalled (the review: bench 36 to 39 total reps
         at 185, called stalled). A top single is left out, as above. */
      let tAdj=null,tRaw=null,topL=0,rated=0;
      if(!noE1(ex)){const avg=f=>{const v=atTop.map(f).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;};
        tAdj=avg(p=>trendE(p.load,p.r,p.rq));tRaw=avg(p=>trendE(p.load,p.r,0));}
      for(const p of pts){if(p.load>topL)topL=p.load;if(p.rir!=null)rated++;}
      /* Timed holds count no weight lifted (their reps are seconds). Lifts with
         no 1RM estimate but real reps (leg raises, Nordics, sissy squats) count
         at their bodyweight share, as push-ups do (r34.2: they were left out
         without a word, so a calisthenics day read 3,500 lb light). */
      const v=ex&&ex.timed?0:work.reduce((a,s)=>a+tonnage(ex,s,ss.date),0);vol+=v;
      (byEx[b.exId]||(byEx[b.exId]=[])).push({date:ss.date,sid:ss.id,pts,best,bb,pb,pbb,vol:v,n:work.length,topW,topRir,topReps,drop,deload:!!ss.deload,light:!!ss.light||!!b.light,rr:b.rr||null,topN:atTop.length,cut:!!b.cut,tAdj,tRaw,topL,rated});
    }
    sessVol.push({date:ss.date,vol,id:ss.id,day:ss.dayName});
  }
  return {byEx,sessVol,weekSets,weekConf,dayMus,dayMeta,weekHard,rirLogged,rirTotal};
}
/* Step 2: sessions lighter than their lift's usual that nobody tagged. Marks
   each such exposure (auto, or keep for a new level) and returns the count per
   week. */
function idxAutoLighter(byEx){
  /* Lighter sessions nobody tagged (r30, from an independent review): an
     imported deload week, or one logged without the Deload or Lighter
     buttons, sat in every trend as a dip and made rising lifts read flat or
     stalled. A lift's session is read as lighter when its heaviest load is at
     least 10% under the heaviest of its previous three full sessions and its
     strength reading, reps alone, is at least 7% under theirs (both, so a
     lighter load for more reps, a rep range change, is not caught). A week in
     which at least half the lifts trained, and two or more, read lighter is
     read as a lighter week, all of it. These are conventions: a deload is
     usually 10% or more off the load (the app's own is about 90%), and day to
     day swings in estimated strength run 2 to 8% (Sigvaldsen 2023). Lighter
     sessions read this way are treated exactly like tagged ones: kept in
     history and charts, left out of trends, stalls and targets. */
  const wkAuto={};
  for(const id of Object.keys(byEx)){
    const exps=byEx[id];const prev=[];let run=[];
    for(const x of exps){
      if(tagged(x))continue;
      const k=weekStart(x.date);const o=wkAuto[k]||(wkAuto[k]={n:0,l:0});o.n++;
      const ref=prev.filter(q=>sameRR(q.rr,x.rr)).slice(-3);
      if(ref.length>=2){
        const mL=Math.max(...ref.map(q=>q.topL)),mT=Math.max(...ref.map(q=>q.tRaw==null?-Infinity:q.tRaw));
        if(mL>0&&x.topL<=mL*0.9+1e-9&&(x.tRaw==null||!isFinite(mT)||x.tRaw<=mT*0.93+1e-9)){
          x.auto=true;o.l++;run.push(x);
          /* Lighter sessions in a row for two weeks or more is a new level
             (a layoff, an injury, a new technique), not a deload: they count
             again, and what follows is compared with them. Counting sessions
             alone (three in a row) read a deload week on a lift trained three
             times a week as a new level, then as a 16% fall and a stall
             (r31, from the review). */
          if(run.length>=3&&daysBetween(run[0].date,run[run.length-1].date)>=14){for(const q of run){q.auto=false;q.keep=true;wkAuto[weekStart(q.date)].l--;}prev.length=0;prev.push(...run);run=[];}
          continue;
        }
      }
      run=[];prev.push(x);
    }
  }
  /* In a lighter week, a lift that was also lighter, by less than the
     thresholds above, is read as lighter too (a deload of 8%, say). A lift
     done at its usual load that week is not (r30 audit: a pushdown at its
     normal 50 x 12 was labelled lighter because the rest of the week was). */
  for(const id of Object.keys(byEx)){const prev=[];for(const x of byEx[id]){if(tagged(x))continue;if(x.auto||x.keep){if(x.keep)prev.push(x);continue;}
    const o=wkAuto[weekStart(x.date)];const ref=prev.filter(q=>sameRR(q.rr,x.rr)).slice(-3);
    if(o&&o.l>=2&&o.l*2>=o.n&&ref.length){const mL=Math.max(...ref.map(q=>q.topL)),mT=Math.max(...ref.map(q=>q.tRaw==null?-Infinity:q.tRaw));
      if(x.topL<mL-1e-6||(x.tRaw!=null&&isFinite(mT)&&x.tRaw<mT*0.97)){x.auto=true;continue;}}
    prev.push(x);}}
  return wkAuto;
}
/* Step 3: lighter weeks, tagged or read as lighter. */
function idxLightWeeks(sessions,wkAuto){
  /* Lighter weeks (r30): every session in the week tagged deload or lighter,
     or the week read as lighter above. Weekly volume averages skip them: a
     deload halves the sets on purpose, and averaging it in read as "below
     target" for a month after every deload. */
  const lightWk={};{const tag={};for(const ss of sessions){const k=weekStart(ss.date);const o=tag[k]||(tag[k]={n:0,l:0});o.n++;if(ss.deload||ss.light)o.l++;}
    for(const k in tag)if(tag[k].n&&tag[k].l===tag[k].n)lightWk[k]=true;
    for(const k in wkAuto){const o=wkAuto[k];if(o.l>=2&&o.l*2>=o.n)lightWk[k]=true;}}
  return lightWk;
}
/* Step 4: one lift's PRs, in order, into prs (and each exposure's progress
   mark, which the stall test reads). Returns the lift's best estimate ever. */
function idxPRs(id,exps,prs){
  /* A rep PR is a set no earlier set matched on both load and reps. Keeping
     every earlier set to test that was O(exposures^2 x sets^2) and became
     seconds of work after a couple of years of logs. Only the non-dominated
     points can ever dominate anything, so keep just those. Same answers,
     and the frontier stays small. */
  const front=[];let maxBest=null,maxPb=null;const ex=EX(id);let prevMaxW=-Infinity,topSc=0;
  /* Estimates drift with reps, so the same strength reads differently from a
     triple and from a set of 12. An e1RM PR is judged only against earlier
     bests from the same band of reps to failure (1-5, 6-10, 11-12), taken
     from the set itself, so a set that overshoots its planned range is
     judged where it landed. Rep PRs compare actual load and reps, which mean
     the same in any range, so they stay global. */
  const bestIn=(i)=>{let m=null;for(let k=0;k<i;k++){const q=exps[k];if(q.pb!=null&&q.pbb===exps[i].pbb)m=m==null?q.pb:Math.max(m,q.pb);}return m;};
  const dominated=p=>front.some(q=>q.pl>=p.pl-1e-6&&q.r>=p.r);
  const addFront=p=>{
    if(dominated(p))return;
    for(let k=front.length-1;k>=0;k--)if(p.pl>=front[k].pl-1e-6&&p.r>=front[k].r)front.splice(k,1);
    front.push(p);
  };
  exps.forEach((x,i)=>{
    let repPR=null;
    // Every set in this exposure is judged against the frontier as it stood
    // before the exposure, so sets within one session cannot cancel each other.
    const sc=q=>e1(q.pl,q.r,q.rq)||q.pl*(1+q.r/30);
    /* r30: a rep PR counts only when the set is at least 90% of the
       strongest set logged before (by the same estimate), a convention.
       Any new load and rep pairing used to count, so 40 kg x 10 after
       95 kg x 5 was a PR and the demo showed 54 PRs in 14 days. */
    const floor=front.reduce((a,q)=>Math.max(a,sc(q)),0)*REP_PR_SHARE;
    if(i>0){for(const p of x.pts){if(!dominated(p)&&sc(p)>=floor-1e-9&&(!repPR||sc(p)>sc(repPR)))repPR=p;}}
    const pb=bestIn(i);const e1PR=i>0&&x.pb!=null&&pb!=null&&x.pb>pb+1e-6;
    /* A weight PR (r29): more weight than any earlier working set of the
       lift, as logged (added load on a bodyweight lift, less help on an
       assisted one). It is also a rep PR by definition, so it used to show
       as one (V: "a new weight and rep PR in the same set marks it as a
       rep PR"). One label per lift and session, the biggest news first:
       weight PR, then best estimate, then rep PR. */
    const wPR=i>0&&!ex.timed?x.pts.filter(p=>p.r>0&&p.w>prevMaxW+1e-6).sort((a,b)=>b.w-a.w||b.r-a.r)[0]:null;
    x.progress=i>0&&(!!repPR||e1PR||!!wPR);
    // What it beat, for the recap: the old heaviest, the old best in the same band, or the most reps at this load or heavier (0: never this heavy).
    /* big: a PR that is counted and announced (r32, from the third review:
       "8 new PRs" in a fifth session, 34 in 30 days after an import, since
       every load step was a weight PR and every added rep a rep PR). On a
       lift with a strength estimate that is a new best estimate; a heavier
       set or more reps without one stays in the list. Lifts with no
       estimate (timed, joint rotation) keep every kind. Stronger than
       ever is judged against every earlier set by the same score as the
       rep PR floor, so 100 x 9 after 100 x 8 counts though it moved into a
       new band of reps. */
    /* r34.2: a new best in a band alone no longer makes it big (from the
       review: triceps 80 x 10 after 75 x 15 was announced as a PR though the
       set was weaker; sets past 12 reps have no estimate, so it was the
       band's first). Only stronger than ever, as the r32 rule says. */
    const big=noE1(ex)||!!ex.timed||x.pts.some(q=>sc(q)>topSc+1e-9);
    // A deload or lighter day is lighter on purpose: its sets are never PRs (r32, second check: 90 x 12 on a Lighter day listed as one).
    const offPR=x.deload||x.light;
    // Each PR keeps its session (sid), so two sessions on one day never share one (r34.2), and the overall best before it (prevAll) beside the band's (prev).
    if(!offPR){if(wPR)prs.push({date:x.date,sid:x.sid,exId:id,type:'Weight PR',w:wPR.w,r:wPR.r,prevW:prevMaxW,value:e1PR?x.pb:null,prev:e1PR?pb:null,prevAll:maxPb,bb:x.pbb,big});
    else if(e1PR)prs.push({date:x.date,sid:x.sid,exId:id,type:'e1RM',value:x.pb,prev:pb,prevAll:maxPb,bb:x.pbb,big});
    else if(repPR)prs.push({date:x.date,sid:x.sid,exId:id,type:'Rep PR',w:repPR.w,r:repPR.r,prevR:front.filter(q=>q.pl>=repPR.pl-1e-6).reduce((a,q)=>Math.max(a,q.r),0),big});}
    if(x.pb!=null)maxPb=maxPb==null?x.pb:Math.max(maxPb,x.pb);
    for(const p of x.pts)if(p.r>0)prevMaxW=Math.max(prevMaxW,p.w);
    for(const p of x.pts)topSc=Math.max(topSc,sc(p));
    for(const p of x.pts)addFront(p);
    if(x.best!=null)maxBest=maxBest==null?x.best:Math.max(maxBest,x.best);
  });
  return maxBest;
}
/* The sessions a lift's trend reads, shared by the trend itself and by the
   screens that say its change in loads (r41), so the two cannot disagree.
   Full sessions only; the current rep range only, since changing the range
   restarts the baseline instead of drawing one line across two scales; and
   the 6 weeks up to the lift's own last session (r30: it ended at the newest
   session of any kind, so logging an upper day moved a split squat's trend
   from +14% to +9% without a new split squat set). */
function trendScope(exps,anchor){
  const real=exps.filter(x=>!offSession(x));
  const curRR=real.length?real[real.length-1].rr:null;
  const inRange=real.filter(x=>sameRR(x.rr,curRR));
  const lastReal=real.length?real[real.length-1]:null;
  const exWin=addDays(lastReal?lastReal.date:anchor,-42);
  return {real,curRR,inRange,lastReal,exWin};
}
/* The sessions in that scope with a trend reading. Separate from trendScope
   because idxLift sets each session's reading (tv) only after deciding
   whether RIR enters the trend, which needs the scope first. */
function trendW(sc){return sc.inRange.filter(x=>x.date>=sc.exWin&&x.tv!=null);}
/* Both ends of the trend are the better of two sessions, to damp a single
   fluky one. With exactly three, best-of-two at each end counts the middle
   one twice (100, 120, 110 came out as 0% instead of +10%), so three use
   single ends. It returns the sessions, not only their readings, so a screen
   can show what was lifted. The first of equal readings wins, as before. */
function trendEnds(w){
  const k=w.length>=4?2:1;
  const best=a=>a.reduce((m,x)=>x.tv>m.tv?x:m);
  return {first:best(w.slice(0,k)),last:best(w.slice(w.length-k))};
}
/* Step 5: one lift's trend, stall, signals and bests. */
function idxLift(id,exps,maxBest,anchor,winStart){
  /* A deload session is lighter by design. It is charted and counted in
     volume, but it cannot stall a lift, bend its trend, or count as one of
     the three exposures that RIR drift and drop-off are read from. */
  /* Lighter sessions (half the sets, about 90% loads since r30) are left out for the same
     reason: fewer sets always look like less, and a session run short on
     purpose is not evidence of a stall. */
  const sc=trendScope(exps,anchor);const {real,curRR,inRange,lastReal,exWin}=sc;
  /* At the heaviest load the machine or rack has, progress moves to reps and
     then to harder reps (tempo, pauses, one side), which the load-based PR
     tests cannot see. Such a lift is marked capped rather than stalled. */
  const exI=EX(id);
  // r33: the top of the rack in Your gym is a cap too (review: a lift at the heaviest dumbbell read as stalled).
  const plC=planFor(id);const capL=lastReal?capOf(exI,plC,lastReal.topW):null;const capped=!!lastReal&&atCapOf(exI,plC,lastReal.topW,capL);
  /* RIR in the trend only where it is logged consistently (r30): on at
     least 80% of the lift's working sets in its last 8 sessions in range, a
     convention. Rated on some sets and blank on others, a 255 x 5 called
     RIR 3 read as strong as 270 x 5 called RIR 1, so the load going up
     15 lb showed as a stall. Otherwise the trend reads reps alone, the same
     way for every session. Bests, PRs and targets keep RIR as before. */
  const recent=inRange.slice(-8);const nPts=recent.reduce((a,x)=>a+x.pts.length,0),nRated=recent.reduce((a,x)=>a+x.rated,0);
  const useAdj=state.settings.rirMode!=='off'&&nPts>0&&nRated/nPts>=0.8;
  for(const x of exps)x.tv=useAdj?x.tAdj:x.tRaw;
  /* Stalled: the fitted strength line over the last 6 real sessions (4 at
     least, widened to cover 21 days when 6 do not) in the current rep range,
     spanning 3 weeks or more, is flat or falling, and none of the last 3 of
     them set a PR or lifted more than the first session of that stretch
     (r30: double progression adds load and loses reps for a while, which a
     line through estimates reads as flat). A lift with no reading at all
     (timed, joint-rotation) keeps a count-based test: 4 or more sessions
     and no PR of any kind in the last 3. */
  const slopeOf=list=>{const xs=list.map(x=>daysBetween(list[0].date,x.date)),ys=list.map(x=>x.tv);const n=xs.length;
    const mx=xs.reduce((a,b)=>a+b,0)/n,my=ys.reduce((a,b)=>a+b,0)/n;let sxy=0,sxx=0;xs.forEach((xv,k)=>{sxy+=(xv-mx)*(ys[k]-my);sxx+=(xv-mx)**2;});
    if(!(sxx>0))return null;const b=sxy/sxx;let rss=0;xs.forEach((xv,k)=>{const e=ys[k]-(my+b*(xv-mx));rss+=e*e;});
    const se=n>2?Math.sqrt(rss/(n-2)/sxx):null;return {b,se,my,n};};
  const withE1=inRange.filter(x=>x.tv!=null);
  let stalled=false;
  /* Only a lift still being trained can be stalled: one not done in the
     last 42 days (counted from today and from the last session), or deleted
     or archived, used to stay stalled forever and kept the Coach calling
     for a deload (r27). */
  const current=!!lastReal&&lastReal.date>=winStart&&lastReal.date>=addDays(today(),-42)&&!exI.archived&&state.exercises.some(e=>e.id===id);
  if(!capped&&current){
    const wE=withE1;
    if(wE.length>=4){
      const lastE=wE[wE.length-1].date;let i0=wE.length-1;
      while(i0>0&&(wE.length-i0<6||daysBetween(wE[i0].date,lastE)<21))i0--;
      const l=wE.slice(i0);
      if(daysBetween(l[0].date,lastE)>=21){
        /* More reps at the same working load over no more sets is progress
           too (r31): double progression adds reps to sets 2 to 4 once set 1
           is at the top of the range, and that is not a stall. Since r32
           it has to beat every earlier session at that load in the
           stretch, not only the first: a press alternating 6, 6, 6 and 5,
           5, 4 at one load for 7 weeks "moved" every other week. */
        const z=l[l.length-1],a0=l[0];
        const same=l.slice(0,-1).filter(x=>Math.abs(x.topW-z.topW)<1e-6&&x.topN>=z.topN);
        const moved=l.slice(-3).some(x=>x.progress)||z.topL>a0.topL+1e-6||z.topW>a0.topW+1e-6||(same.length>0&&z.topReps>Math.max(...same.map(x=>x.topReps)));
        /* Flat is under 0.1% a week (r31): averaging working sets leaves
           rounding dust, and identical sessions came out at +1e-32 a
           week, so a perfectly flat lift was not called stalled. */
        /* Since r32 the line is the median of the slopes between every
           pair of sessions (Theil and Sen), so one good or bad day does
           not set it: a squat at 20, 20, 30, 22, 24, 24 working reps read
           stalled from its one good day, and a press alternating 6s and
           5s read up from its last two. */
        const sen=(()=>{const a=[];for(let i=0;i<l.length;i++)for(let j=i+1;j<l.length;j++){const dd=daysBetween(l[i].date,l[j].date);if(dd>0)a.push((l[j].tv-l[i].tv)/dd);}return a.length?median(a):null;})();
        const my=l.reduce((a,x)=>a+x.tv,0)/l.length;
        stalled=sen!=null&&my>0&&sen*7/my*100<0.1&&!moved;}}
    else if(withE1.length<2)stalled=inRange.length>=4&&inRange.slice(-3).every(x=>!x.progress);
  }
  const w=trendW(sc);
  let pct=null,slope=null,slopeSe=null,moving=false,falling=false,pLo=null,pHi=null,spanW=null,loadUp=false;
  /* A trend needs 3 sessions spread over 2 weeks or more (r31): three
     sessions in nine days read as "+6.6% a week" from what was mostly one
     good day. The text gives the weeks it really covers (spanW). */
  const spanD=w.length?daysBetween(w[0].date,w[w.length-1].date):0;
  if(w.length>=3&&spanD>=14){
    spanW=Math.max(2,Math.round(spanD/7));
    const ends=trendEnds(w);
    pct=(ends.last.tv/ends.first.tv-1)*100;
    // Slope in % of the mean per week, with its standard error. Moving or
    // falling needs 3% or more and the slope's 80% interval clear of zero.
    const f=slopeOf(w);
    if(f){slope=f.b*7/f.my*100;slopeSe=f.se!=null?f.se*7/f.my*100:null;
      const tq=t90(f.n-2);const lo=slopeSe!=null?slope-tq*slopeSe:slope,hi=slopeSe!=null?slope+tq*slopeSe:slope;
      moving=pct>=GROW_PCT&&lo>0;falling=pct<=-GROW_PCT&&hi<0;
      // The weekly rate the 80% interval allows (r30): "about 1.5% a week,
      // likely 1.2 to 1.8" rather than one number stated as fact. It is
      // given on the weekly rate the line measures; a range on the 6-week
      // change beside an endpoint percentage could leave that percentage
      // outside its own range.
      if(slopeSe!=null){pLo=lo;pHi=hi;}}
    /* A heavier working load with the reps still in the range is progress
       that rep-max formulas disagree on, never a fall (r34.2, from the
       review: a lat pulldown from 90 x 14 to 95 x 10, on plan, read "down
       4%, look at recovery"; Brzycki says -10%, Lombardi +2%, all inside
       the 2 to 8% day-to-day noise). */
    const z=w[w.length-1],a0=w[0];
    const zr=z.pts.filter(p=>Math.abs(p.w-z.topW)<1e-6).map(p=>p.r);
    if(z.topW>a0.topW+1e-6&&zr.length&&Math.min(...zr)>=(z.rr?+z.rr[0]:1)&&pct<0){loadUp=true;falling=false;if(pHi!=null&&pHi<0){pLo=null;pHi=null;}}
  }
  /* RIR drift: the same load and at least the same reps across the last three
     exposures while logged RIR climbed by a full rep or more. e1RM cannot see
     this, but it is the clearest sign that the load is due to go up. */
  let easier=null;
  if(inRange.length>=3){
    const l3=inRange.slice(-3);
    const sameW=l3.every(x=>Math.abs(x.topW-l3[0].topW)<1e-6);
    const allRir=l3.every(x=>x.topRir!=null);
    const repsHeld=l3.every(x=>x.topReps>=l3[0].topReps);
    const climbing=l3[1].topRir>=l3[0].topRir&&l3[2].topRir>=l3[1].topRir&&l3[2].topRir-l3[0].topRir>=1;
    if(sameW&&allRir&&repsHeld&&climbing)easier={w:l3[0].topW,from:r1(l3[0].topRir),to:r1(l3[2].topRir)};
  }
  /* Widening set-to-set drop-off at an unchanged load: the top set still goes
     up but the back sets fall away. That is a fatigue or rest-length signal,
     not lost strength, and no other number here shows it. */
  let fade=null;
  if(inRange.length>=3){
    const l3=inRange.slice(-3);
    if(l3.every(x=>Math.abs(x.topW-l3[0].topW)<1e-6)&&l3.every(x=>x.drop!=null)&&l3[2].drop-l3[0].drop>=2)fade={w:l3[0].topW,from:l3[0].drop,to:l3[2].drop};
  }
  // best: the top e1RM in the current rep range, which is what targets and
  // the live PR badge compare against. bestAll ignores rep range.
  let bestCur=null;const byBand={};for(const x of exps){if(x.best==null)continue;if(sameRR(x.rr,curRR))bestCur=bestCur==null?x.best:Math.max(bestCur,x.best);}
  for(const x of exps)if(x.pb!=null)byBand[x.pbb]=Math.max(byBand[x.pbb]||0,x.pb);
  // fresh: trained in the last 42 days, so its trend still says something about the muscle now.
  // Done within the last 4 weeks (r34.2: 42 days let a lift 6 weeks off still read "up" and project ahead after a break).
  const fresh=!!lastReal&&lastReal.date>=addDays(today(),-BACK_DAYS);
  return {n:exps.length,stalled,pct,slope,slopeSe,moving,falling,pLo,pHi,spanW,loadUp,useAdj,fresh,byBand,wN:w.length,wSpan:w.length?daysBetween(w[0].date,w[w.length-1].date):0,last:real.length?real[real.length-1]:exps[exps.length-1],best:bestCur,bestAll:maxBest,rr:curRR,easier,fade,capped};
}
/* Step 6: muscle scores from the lifts' trends. */
function idxScores(exStats){
  // muscle scores
  // Direct work is authoritative. Secondary involvement is used only as a
  // fallback, so muscles trained indirectly (front delts, forearms, traps)
  // get a trend instead of sitting at "not enough data" forever. Rows scored
  // this way are flagged so the dashboard can say so.
  /* Each lift contributes its change only when that change is a clear trend
     (moving or falling). Since r30 a lift with a trend inside the noise is
     left out instead of counted as 0, and a muscle whose lifts are all
     inside the noise has no score (clear:false), shown as unclear. Counting
     them as 0 put "Chest +0%" beside a bench press up 10%, and "+0%, try 2
     more sets" on every muscle: not enough signal is not a measurement of
     zero. Lifts not trained in the last 42 days are left out. */
  const byMuscle={},bySecondary={},stallP={},stallS={},seenP={},seenS={},spanP={},spanS={};
  for(const [id,st] of Object.entries(exStats)){
    const ex=EX(id);
    // A stall counts even on a lift with no estimate (its count-based test).
    if(st.stalled){stallP[ex.primary]=true;for(const m of ex.secondary)stallS[m]=true;}
    if(st.pct==null||!st.fresh)continue;
    /* A muscle's trend needs a little more than a lift's (r32, from the third
       review: "Chest +4%, rising: hold this volume" after 3 sessions, off one
       extra rep): its lifts count once they have 4 sessions over 3 weeks or
       more in the window. */
    if(st.wN<4||st.wSpan<21)continue;
    seenP[ex.primary]=(seenP[ex.primary]||0)+1;for(const m of ex.secondary)seenS[m]=(seenS[m]||0)+1;
    if(!(st.moving||st.falling))continue;
    (byMuscle[ex.primary]||(byMuscle[ex.primary]=[])).push(st.pct);
    for(const m of ex.secondary)(bySecondary[m]||(bySecondary[m]=[])).push(st.pct);
    // The weeks a muscle's trend covers, said in its line: the longest of its lifts'.
    spanP[ex.primary]=Math.max(spanP[ex.primary]||0,st.spanW||0);for(const m of ex.secondary)spanS[m]=Math.max(spanS[m]||0,st.spanW||0);
  }
  const scoreMuscles={};
  for(const m of MK){
    if(seenP[m])scoreMuscles[m]={arr:byMuscle[m]||[],n:seenP[m],indirect:false};
    else if((seenS[m]||0)>=2)scoreMuscles[m]={arr:bySecondary[m]||[],n:seenS[m],indirect:true};
    else if(stallP[m])scoreMuscles[m]={arr:[],n:0,indirect:false};
  }
  const scores=Object.entries(scoreMuscles).map(([m,o])=>({m,score:o.arr.length?median(o.arr):0,clear:o.arr.length>0,n:o.n,indirect:o.indirect,stall:!!(o.indirect?stallS[m]:stallP[m]),wk:(o.indirect?spanS[m]:spanP[m])||null})).sort((a,b)=>b.score-a.score);
  /* The label used to be purely positional: bottom third of the list was
     "lagging" whatever the number said. So a muscle gaining 3% got a red
     "Lagging trend" flag in Weak points while Return on volume, which reads
     the same score against an absolute threshold, said "Growing. Hold this
     volume." on the same screen. Rank still breaks ties, but a muscle that is
     actually growing is never called lagging, and one that is actually going
     backwards is always called lagging even if the rest of the list is worse. */
  scores.forEach(s=>{
    // The same 3% boundary, inclusive, that marks a lift as moving or falling.
    const growing=s.clear&&s.score>=GROW_PCT,declining=s.clear&&s.score<=-GROW_PCT;
    // Going backwards is an absolute fact and does not need a ranking to be
    // worth saying, so it is checked before the too-few-muscles-to-rank guard.
    if(declining)s.label='lagging';
    /* A rising muscle is progressing (r30): ranked third or higher used to
       be needed too, so with eight muscles rising five read steady. */
    else if(growing)s.label='progressing';
    /* A flat muscle is lagging only when one of its lifts has stalled (r29, a
       convention). By rank alone, the bottom third read "Lagging strength" in
       red while its lifts were gaining reps every session: sets above 12
       reps to failure have no 1RM estimate, so high-rep isolation work shows
       no trend however well it is going (V: demotivating and not true). */
    else s.label=s.stall?'lagging':'steady';
  });
  return scores;
}
/* How long since a week that was clearly lighter than your norm, counting a
   week off as lighter. Only completed weeks are considered. */
function lastLighterWeek(){
  const I=IDX();const cur=weekStart(today());
  // Each set once, as on Today; summing per-muscle counts double counts.
  const tot=wk=>I.weekHard[wk]||0;
  const first=state.sessions.length?weekStart(sortedSessions()[0].date):null;
  if(!first)return null;
  const vals=[];for(let k=1;k<=12;k++){const wk=addDays(cur,-7*k);if(wk<first)break;vals.push(tot(wk));}
  const trained=vals.filter(v=>v>0);
  if(trained.length<4)return null;
  // Two empty weeks just gone are a break, not a lighter week (r34.2: "Last lighter week: 1 week ago (a week off)" after 6 weeks away).
  if(vals.length>=2&&vals[0]===0&&vals[1]===0)return null;
  const norm=median(trained);
  /* A week of lighter loads counts too (r30 audit): a deload marked, or read
     from the loads (I.lightWk), keeps the sets and drops the weight, so by
     sets alone this said "No lighter week" about a week the trends had just
     set aside as one. */
  for(let k=0;k<vals.length;k++){const wk=addDays(cur,-7*(k+1));if(vals[k]<=norm*0.65)return {weeks:k+1,sets:r1(vals[k]),norm:r1(norm)};if(I.lightWk[wk])return {weeks:k+1,sets:r1(vals[k]),norm:r1(norm),loads:true};}
  return {weeks:null,norm:r1(norm)};
}
/* First run only (r29, V: "targets that can actually be met"): when a new
   person picks a ready-made routine and the weekly targets are still the
   defaults, each muscle's minimum comes down to what the routine plans
   (whole sets), so following it is on target. The maximums and the
   evidence-based defaults stay as they are for everyone else; Settings,
   Weekly set targets raises them as sets are added. Returns whether anything
   changed. */
/* Targets fitted before r44 recorded no floors (r44 review): once, on this
   device's state at start, when every target is exactly what a first-run
   pick of the routine in use, the starter or the old default gives, record
   those floors. Any target that differs (typed) leaves it alone. Not in
   normalize, which also runs inside the sync comparison and Undo. */
function fitRecordOld(){
  const s=state.settings;if(s.bandsFit||s.profile)return false;const b=s.bands;
  for(const R of [activeRoutine(),starterRoutine(),defaultRoutine()]){if(!R)continue;const p=plannedSets(R);const fit={};let ok=true;
    for(const m of MK){const d=BANDS[m];const lo=TRACK_ONLY.has(m)?d[0]:Math.min(d[0],Math.floor(p[m]||0));if(b[m][0]!==lo||b[m][1]!==d[1]){ok=false;break;}if(lo<d[0])fit[m]=lo;}
    if(ok&&Object.keys(fit).length){s.bandsFit=fit;return true;}}
  return false;
}
function fitTargets(R,actual){
  if(!R)return false;const b=state.settings.bands;
  /* Still the defaults, or the defaults fitted to the starter routine (r31:
     Log a workout now fits them to the starter, and an import or a pick
     after that left targets measured against a routine no longer used). */
  const same=x=>MK.every(m=>b[m]&&b[m][0]===x[m][0]&&b[m][1]===x[m][1]);
  /* The defaults are the profile's (r44): with focus muscles set, those
     targets are where a first-run pick starts. With no profile they are BANDS. */
  const D={};for(const m of MK)D[m]=defBand(m);
  const foc=new Set(prof().focus||[]);
  const fitOf=r=>{const p=plannedSets(r);const o={};for(const m of MK)o[m]=TRACK_ONLY.has(m)||foc.has(m)?D[m]:[Math.min(D[m][0],Math.floor(p[m]||0)),D[m][1]];return o;};
  if(!same(D)&&![starterRoutine(),defaultRoutine()].some(r=>same(fitOf(r))))return false;
  const was=JSON.stringify(MK.map(m=>b[m]));
  for(const m of MK)b[m]=[D[m][0],D[m][1]];
  const plan=plannedSets(R);
  /* actual (a routine made from an import, r31): no minimum above what the
     log itself averaged on a muscle the routine trains. A cycle's planned
     sets a week and the weeks as trained never match exactly (2 days
     alternating, 3 sessions a week, plans 2.8), and the review saw "Abs
     below target, add a set to Plank" measured against the lifter's own
     program. */
  // A focus muscle keeps its raised target (r44): raising it is the point of the focus.
  // Each floor is recorded (settings.bandsFit), so a later focus change knows which targets are the app's.
  /* A focus muscle's floor is recorded too, though not applied while it is a
     focus, so taking the focus off later brings it to the plan (the r44 review). */
  const fit={};
  for(const m of MK){if(TRACK_ONLY.has(m))continue;let lo=Math.floor(plan[m]||0);if(actual&&(plan[m]||0)>0)lo=Math.min(lo,Math.floor(actual[m]||0));
    if(lo<BANDS[m][0]&&lo<b[m][0])fit[m]=lo;if(foc.has(m))continue;lo=Math.min(b[m][0],lo);if(lo!==b[m][0])b[m]=[lo,b[m][1]];}
  if(Object.keys(fit).length)state.settings.bandsFit=fit;else delete state.settings.bandsFit;
  return JSON.stringify(MK.map(m=>b[m]))!==was;
}
/* Plan against the usual ranges (r30, V's choice). Picking a routine on a
   first run brings the weekly minimums down to what it plans, so following
   it reads as on target (r29); measured against those, the plan always
   passes. This one quiet line, on Plan only, names the muscles the plan
   puts under the usual range where the target was brought down to meet it.
   No colour and no flag anywhere else: the targets stay the lifter's. */
function planEvidenceNote(pv){
  const b=state.settings.bands;
  // Major muscles only (a default minimum of 8 or more): the usual range is about them; smaller ones have lower, softer defaults.
  // Brought down below the profile's own default too (r44): a focus's maintenance targets were not lowered to meet the plan.
  const low=MK.filter(m=>!TRACK_ONLY.has(m)&&BANDS[m][0]>=8&&b[m][0]<Math.min(BANDS[m][0],defBand(m)[0])&&belowMin(pv[m]||0,BANDS[m][0]));
  if(!low.length)return '';
  return `<p class="small muted" id="planUsual" style="margin:8px 0 0">Under the usual range in this plan: ${esc(andList(low.map(m=>`${ML[m]} ${r1(pv[m]||0)} of ${BANDS[m][0]}`),12))}. ${tipi('The usual weekly range is 10 to 20 hard sets for most major muscles (typical in studies, not a ceiling); smaller muscles have lower ones. Your targets were set to this plan when you picked it, so Stats measures you against the plan. Fewer sets still build muscle, more slowly; add a set at a time when it feels easy.','About the usual range')}</p>`;
}
/* How to do it (r30, from the review: no exercise videos). A search on
   YouTube for the exercise's name, opened in the browser: no list of videos
   to keep current, and nothing leaves the app until it is tapped (then only
   the name). A custom exercise's name is searched as typed. */
function howToUrl(e){return 'https://www.youtube.com/results?search_query='+encodeURIComponent(`${e.name} exercise form`);}
function howToLink(e){return e&&e.name?`<a class="btn block" style="margin-top:6px" href="${esc(howToUrl(e))}" target="_blank" rel="noopener noreferrer" data-tip="Opens a YouTube search for ${esc(e.name)} in your browser. Only the exercise name is sent.">How-to videos</a>`:'';}
function plannedSets(routine){
  const out={};
  const f=weekFactor(routine);
  for(const d of routine.days){if(d.rest)continue;for(const it of d.items){const pc=planCredit(it);if(!pc)continue;const ex=EX(it.exId);out[ex.primary]=(out[ex.primary]||0)+it.sets*f*pc;for(const m of ex.secondary)out[m]=(out[m]||0)+0.5*it.sets*f*pc;}}
  return out;
}
/* The week the log started in counts only if it started on that week's
   first day (r29): someone who began on a Saturday with one session read as
   "19 flagged" and a "1-week average" the following Monday. */
function firstFullWeek(){const f=firstDate(state.sessions);if(!f)return null;const w=weekStart(f);return f>w?addDays(w,7):w;}
/* The weeks an average covers, in words: "your last 4 full weeks", or
   "the 1 week you trained of the last 4" when weeks were missed (r31). */
/* r31.2: says the span the weeks really came from, and a lighter week left
   out (the review saw "3 full weeks logged so far" for a deload and a
   missed week inside the window of a 9-week log). */
function avgWeeksTxt(avg){const w=avg._weeks,m=avg._missed||0,l=avg._light||0,r=avg._rest||0;if(!m&&!l&&!r)return `your last ${w} full week${w===1?'':'s'}`;
  const out=[l?`${l===1?'a lighter week':l+' lighter weeks'}`:'',r?`${r===1?'a rest week':r+' rest weeks'}`:''].filter(Boolean);
  return `the ${w} week${w===1?'':'s'} you trained of the last ${avg._span||Math.min(avg._n||4,w+m)}${out.length?`, ${out.join(' and ')} left out`:''}`;}
/* The 4-week average every flag, the coach and Muscles read. The radar on
   Stats can choose 2 or 8 weeks instead (avgWeeks, r31.2); nothing else does,
   so a flag never changes with that choice. */
function actualAvg4(lightToo){return avgWeeks(4,lightToo);}
function avgWeeks(n,lightToo){
  const I=IDX();const cur=weekStart(today());let weeks=0;const tot={},con={};const ff=firstFullWeek();
  /* The last n weeks, but a lighter week among them is skipped and the
     week before them takes its place (r30), up to twice as far back: a
     deload halves the sets on purpose, and averaging it in read as below
     target for a month after every deload. Weeks with no training are
     skipped without a replacement, so the average is per week trained; they
     are counted in _missed (r31) and said wherever the average is, so one
     week trained out of four never reads as on track without saying so. */
  let extra=0,missed=0,span=0,ffHit=false,rest=0,light=0;
  for(let k=1;k<=Math.min(2*n,n+extra);k++){
    const wk=addDays(cur,-7*k);if(ff&&wk<ff){ffHit=true;continue;}span=k;
    if(isRestWeek(wk)){extra++;rest++;continue;}
    const ws=I.weekSets[wk];if(!ws){if(k<=n)missed++;continue;}
    if(I.lightWk[wk]&&!lightToo){extra++;light++;continue;}
    weeks++;
    for(const m in ws)tot[m]=(tot[m]||0)+ws[m];
    const wc=I.weekConf[wk]||{};
    for(const m in wc)con[m]=(con[m]||0)+wc[m];
  }
  // Only lighter weeks in reach: those, rather than nothing.
  if(!weeks&&extra&&!lightToo)return avgWeeks(n,true);
  if(!weeks)return null;
  // average over the weeks that actually have training, not a flat 4.
  // dividing by 4 when only 2 weeks were logged halved every muscle and
  // produced false "under band" flags after any break.
  const out={},conf={};
  for(const m in tot)out[m]=tot[m]/weeks;
  for(const m in con)conf[m]=con[m]/weeks;
  Object.defineProperty(out,'_weeks',{value:weeks,enumerable:false});
  Object.defineProperty(out,'_missed',{value:missed,enumerable:false});
  Object.defineProperty(out,'_n',{value:n,enumerable:false});
  Object.defineProperty(out,'_span',{value:span,enumerable:false});
  // Rest weeks are said as rest weeks, not lighter weeks (r34.2, from the review).
  Object.defineProperty(out,'_light',{value:lightToo?0:light,enumerable:false});
  Object.defineProperty(out,'_rest',{value:rest,enumerable:false});
  Object.defineProperty(out,'_ff',{value:ffHit,enumerable:false});
  Object.defineProperty(out,'_conf',{value:conf,enumerable:false});
  return out;
}
/* Time estimate, worded by estMin ("~75 min") wherever it shows. Per set: 40 s up to 12
   reps and 3 s for each rep past that (middle of the planned range), twice
   that plus 15 s to switch for a lift done one side at a time, the hold plus
   20 s for a timed hold; then its rest (none between superset partners).
   Warm-up and setup: 5 min for each of the first two compound lifts, 3 for
   later compounds, 1 for isolation work. The rest after the final set is
   never taken, so it is dropped. */
function setSecs(ex,p){
  const mid=((+p.repMin||0)+(+p.repMax||0))/2;
  let t=ex.timed?mid+20:40+3*Math.max(0,mid-12);
  if(ex.perSide)t=t*2+15;
  return t;
}
function setupSecs(ex,compoundsBefore){return isCompound(ex)?(compoundsBefore<2?300:180):60;}
/* half: a lighter or deload session, which runs half the sets (rounded up).
   raw: the model alone, without your pace (pace() compares with it). */
function dayMinutes(day,half,raw){
  if(!day.items.length)return 0;
  let s=0,cN=0;
  day.items.forEach((it,i)=>{const ex=EX(it.exId);const nx=day.items[i+1];const rest=(it.ss&&nx&&nx.ss===it.ss)?0:+it.rest;const n=half?Math.max(1,Math.ceil(it.sets/2)):+it.sets;
    s+=n*(setSecs(ex,it)+rest)+setupSecs(ex,cN);if(isCompound(ex))cN++;});
  const lastRest=+day.items[day.items.length-1].rest||0;
  return Math.round(Math.max(0,s-lastRest)*(raw?1:pace())/60);
}
/* Your own pace (r43, V): how long your sessions take against the time model,
   so every estimate (Today, Plan, a session's minutes left, Short on time,
   Pick for me, the recap) follows what your sessions actually take. Each
   timed session in the last PACE_DAYS days is compared with the model for
   the sets it logged (its own rep ranges, the plan's rest), newest first, up
   to PACE_N of them; the median ratio is the pace, so one long or short day
   does not move it. A session at under a third or over three times its model
   is a clock left running or stopped early and is left out. Fewer than
   PACE_MIN usable sessions: the model as is (1). Conventions, not measured
   numbers: the model itself is one. Past workouts and imports have no time,
   so they never count. */
const PACE_N=8,PACE_DAYS=84,PACE_MIN=3,PACE_LO=1/3,PACE_HI=3;
function sessModelMin(ss){
  const R=state.routines.find(r=>r.id===ss.routineId)||activeRoutine();
  // Superset links come from the day's plan, so partners rest once, as every
  // estimate counts them (the r43 review: without it a lifter who supersets
  // read about 30% faster than the model and every estimate came out short).
  const day=ss.dayId?R.days.find(d=>d.id===ss.dayId):null;const link=id=>{const it=day&&day.items.find(i=>i.exId===id);return it&&it.ss||null;};
  // plain (r44 review): a goal set later must not change how long a past session is read to have taken.
  const items=ss.ex.map(b=>{const p=planFor(b.exId,R,ss.dayId,true);const rr=Array.isArray(b.rr)?b.rr:[p.repMin,p.repMax];
    return {...p,exId:b.exId,ss:link(b.exId),repMin:rr[0],repMax:rr[1],rest:+p.rest||0,sets:b.sets.filter(x=>!x.warm).length};}).filter(it=>it.sets>0);
  return items.length?dayMinutes({items},false,true):0;
}
function paceRatios(){
  const from=addDays(today(),-PACE_DAYS);const out=[];const sameDay={};for(const x of state.sessions)sameDay[x.date]=(sameDay[x.date]||0)+1;
  for(const ss of sortedSessions().slice().reverse()){
    if(out.length>=PACE_N||ss.date<from)break;
    if(ss.demo||!(ss.durMin>=1))continue;
    const m=sessModelMin(ss);if(m<1)continue;
    // Cardio done before or after lifting is timed with the session but is not
    // in the model (the r43 review); taken off when the day had one session.
    const cm=sameDay[ss.date]===1?state.cardio.filter(c=>c.date===ss.date&&(c.when==='pre'||c.when==='post')).reduce((a,c)=>a+(+c.min||0),0):0;
    const r=(ss.durMin-cm)/m;if(r>=PACE_LO&&r<=PACE_HI)out.push(r);
  }
  return out;
}
function pace(){
  if(_pace!=null)return _pace;
  const r=paceRatios().sort((a,b)=>a-b);
  if(r.length<PACE_MIN)return _pace=1;
  const k=r.length>>1;return _pace=r.length%2?r[k]:(r[k-1]+r[k])/2;
}
/* Per-session volume per muscle, counted the same way as weekly volume
   (direct 1, secondary 0.5). Weekly bands cannot see a once-a-week split
   putting 17 sets on one muscle in one session. The dose-response
   meta-regression by Pelland et al. (2024) found hypertrophy returns per
   session flattening beyond roughly 11 fractional sets, so anything above 10
   is flagged as a likely place to move sets to another day. */
// Past about 11 fractional sets for one muscle in a session, studies cannot
// detect extra growth (Remmert 2025, preprint). Flagged above 11, advisory.
const SESSION_CAP=11;
function sessionMuscleSets(day){
  const out={};
  for(const it of day.items){const ex=EX(it.exId);const n=+it.sets||0;out[ex.primary]=(out[ex.primary]||0)+n;for(const m of ex.secondary)out[m]=(out[m]||0)+0.5*n;}
  return out;
}
function sessionCapNote(day){
  if(day.rest||!day.items.length)return '';
  const ms=sessionMuscleSets(day);
  const over=Object.entries(ms).filter(([,v])=>v>SESSION_CAP).sort((a,b)=>b[1]-a[1]);
  if(!over.length)return '';
  const list=over.map(([m,v])=>`${ML[m]} ${r1(v)}`);
  const who=andList(list);
  return `<p class="small" style="margin:4px 12px 0"><span class="flag hastip" data-tip="More than ${SESSION_CAP} sets for one muscle in one workout. That line is a convention from one study not yet peer reviewed (Remmert 2025), which found no extra growth past it. Consider moving some to another day. Helper-muscle sets count as half.">Heavy for one workout: ${who} sets</span></p>`;
}
function daySets(day){return day.items.reduce((a,it)=>a+ +it.sets,0);}
/* Size check: tape change per site against the hard sets a week its muscles
   got over the same stretch. Needs two measurements of a site at least 21
   days apart; the baseline is the earliest one within 12 weeks of the latest.
   Waist and bodyweight over the same stretch are shown alongside, because a
   limb that grew while the waist grew too is partly fat. */
const SIZE_MAP=[['arm',['biceps','triceps']],['forearm',['forearms']],['chest',['chest']],['thigh',['quads','hamstrings','adductors']],['calf',['calves']],['neck',['neck']]];
function sizeRows(){
  const ms=[...state.measurements].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  const I=IDX();const out=[];
  const pair=k=>{const has=ms.filter(m=>m[k]>0);if(has.length<2)return null;const L=has[has.length-1];
    const b=has.find(m=>daysBetween(m.date,L.date)>=21&&daysBetween(m.date,L.date)<=84);return b?{b,L}:null;};
  for(const [k,mus] of SIZE_MAP){
    const pr=pair(k);if(!pr)continue;const {b,L}=pr;
    let weeks=0,sum=0;
    for(let wk=weekStart(b.date);wk<=weekStart(L.date);wk=addDays(wk,7)){const ws=I.weekSets[wk];if(!ws)continue;const v=mus.reduce((a,m)=>a+(ws[m]||0),0);weeks++;sum+=v;}
    out.push({k,mus,from:b.date,to:L.date,d:L[k]-b[k],sets:weeks?sum/weeks:0,weeks});
  }
  return out;
}
function sizeBody(){
  const rows=sizeRows();const ML2=Object.fromEntries(MEAS);
  if(!rows.length)return '<p class="muted">Log tape measurements at least 3 weeks apart on the Today tab, under Body, then Tape measurements. Arm, chest, thigh, and calf are read against the hard sets their muscles got in between.</p>';
  const ms=[...state.measurements].sort((a,b)=>a.date<b.date?-1:1);
  const ctx=r=>{const w=ms.filter(m=>m.waist>0&&m.date>=r.from&&m.date<=r.to);const wd=w.length>=2?w[w.length-1].waist-w[0].waist:null;
    const b0=bwAt(r.from),b1=bwAt(r.to);const bd=b0!=null&&b1!=null&&state.bodyweights.length>=2?b1-b0:null;
    const bits=[];if(wd!=null)bits.push(`waist ${wd>=0?'+':''}${lenD(wd)} ${LU()}`);if(bd!=null)bits.push(`bodyweight ${bd>=0?'+':''}${fmtW(bd)} ${U()}`);return bits.length?` Same stretch: ${bits.join(', ')}.`:'';};
  const sgn=v=>(v>=0?'+':'')+lenD(v);
  // Under about 1 cm on a limb or the neck (1.5 cm on the chest) is within
  // what a tape repeats to (typical minimum detectable change 5 to 15 mm).
  const mdc=k=>k==='chest'?1.5:1;
  /* Rows measured on the same days share their stretch, waist, and
     bodyweight, so those are said once above them (r34, V: the same sentence
     under every row). */
  const span=r=>`${fmtDate(r.from)} to ${fmtDate(r.to)}`;
  const one=rows.every(r=>span(r)===span(rows[0])&&ctx(r)===ctx(rows[0]));
  const c0=ctx(rows[0]);const top=one?`<p class="small muted" style="margin:0 0 4px">${span(rows[0])}${c0?c0.replace(/^ Same stretch: /,': '):'.'}</p>`:'';
  const what=r=>r.weeks?`${r1(r.sets)} hard sets a week for ${andList(r.mus.map(m=>ML[m]))}`:'no logged training in between';
  return top+rows.map(r=>`<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row spread"><b>${esc(ML2[r.k])}</b><span class="num">${Math.abs(r.d)<mdc(r.k)?'<span class="tag">within tape error</span> ':''}${sgn(r.d)} ${LU()}</span></div><p class="small muted" style="margin:2px 0 0">${one?'':`${span(r)}, `}${what(r)}.${one?'':ctx(r)}</p></div>`).join('')
    +'<p class="small muted hastip" style="margin-top:8px" data-tip="Same spot, same time of day, before training, relaxed or flexed the same way each time. Under about 1 cm on arms, thighs, calves, and neck (1.5 cm on the chest) is within what a tape repeats to.">How to measure</p>';
}
/* Region balance: hard sets in a region against that region's combined
   minimum (r29; before, the midpoint of the band). 100 means the region has
   reached its target. This is relative to the bands you set, not an
   absolute standard. */
function regionBalance(sets){
  const bands=state.settings.bands;
  // Tracked-only muscles have no target, so they count toward neither side (r29).
  return REGIONS.map(([label,all])=>{
    const ms=all.filter(m=>!TRACK_ONLY.has(m));
    const got=ms.reduce((a,m)=>a+(sets[m]||0),0);
    const mid=ms.reduce((a,m)=>a+(bands[m][0]+bands[m][1])/2,0);
    const lo=ms.reduce((a,m)=>a+bands[m][0],0);
    const hi=ms.reduce((a,m)=>a+bands[m][1],0);
    /* Measured against the region's minimum since r29: 100% is on target.
       Against the middle of the range, a region at its minimum sat well
       inside the ring and read as behind (V). */
    return {label,ms,got,mid,lo,hi,pct:lo>0?got/lo*100:0,low:belowMin(got,lo),high:aboveMax(got,hi)};
  });
}

/* "Last" is the most recent session of a lift, whatever kind (r26, V's
   rule): a trimmed, lighter, or deload session is what you did last, so it is
   what you look back at, labelled for what it was. Targets still come from
   the last full session (base), so trimmed, lighter and deload work never
   sets one. Grey reps and Copy last follow "Last" when its loads are the ones
   you lift (trimmed and lighter sessions keep the loads); after a deload they
   come from the last full session, since deload reps were at lighter loads.
   basis is the date the target came from, when it is not the session in
   "Last", so the logger can say so. */
function lastOf(all,base,fmt,repMin){
  const rec=all&&all.length?all[all.length-1]:base;
  const kind=rec.cut?'trimmed':rec.light||rec.auto?'lighter':rec.deload?'deload':'';
  const line=`Last (${fmtDate(rec.date)}${kind?', '+kind:''}): ${rec.pts.map(fmt).join(', ')}.`;
  const repsFrom=rec!==base&&(rec.deload||rec.light||rec.auto)?base:rec;
  /* Grey reps are last time's reps at the working load only (r31): a top
     single before them is not a row to repeat, and in a pyramid the reps
     done at a lighter load are not reps due at this one (225 x 7, 205 x 8,
     185 x 10 asked 225 x 10). Rows past them take the set above, or the
     bottom of the range (greyR). */
  const wl=workLoad(repsFrom.pts,repMin||0);const wp=atLoad(repsFrom.pts,wl);
  /* One bad set is not next time's plan (r32, from the third review: squat
     140 x 3, 6, 6 on 6-10 greyed (3)(6)(6), and one tap logged 140 x 3
     again). With one set under the range among the rest, that set shows the
     bottom of the range instead. */
  const fl=repFloor(wp.length?wp:repsFrom.pts,repMin);
  return {line,lastR:(wp.length?wp:repsFrom.pts).map(p=>fl(p.r)),basis:rec!==base?base.date:null};
}
/* One test for a session that is lighter or shorter on purpose (tagged), or
   also read as lighter from its loads (offSession): neither sets a target, a
   trend or a stall (r31: written out by hand in six places, which could
   drift). IDX uses tagged() while it is still deciding which are read as
   lighter. */
/* The floor for reps that set targets and grey reps (r32): one set under
   the range among two or more is read at the bottom of the range. With more
   of them under it, the load was heavy that day or too heavy, and the drop
   below the range (or the way back to it) handles that. */
function repFloor(pts,repMin){const m=+repMin||0;const ok=m>0&&pts.length>=2&&pts.filter(p=>p.r<m).length===1;return r=>ok?Math.max(r,m):r;}
const tagged=x=>!!x&&!!(x.deload||x.light||x.cut);
const offSession=x=>tagged(x)||!!(x&&x.auto);
