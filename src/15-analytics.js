/* ---------- units ---------- */
const LU=()=>U()==='lb'?'in':'cm';
/* Estimates (1RM, PR toasts, the bests board) are good to a few percent at best, so they
   show whole pounds or half kilos (r34): 293.8 next to 294 and 301 read as
   precision the numbers do not have. Loads keep their decimals. */
const fmtE=kg=>{if(kg==null||isNaN(kg))return '';const v=toD(kg);return String(U()==='lb'?Math.round(v):Math.round(v*2)/2);};
const lenD=cm=>cm==null?'':String(r1(U()==='lb'?cm/IN:cm));
const lenFrom=v=>U()==='lb'?v*IN:v;

/* An assisted lift keeps its sets as bodyweight minus the help, below 0, so
   every estimate, target and record works unchanged; the field shows and
   takes the help as a plain number, since phone number pads have no minus. */
const loadIn=(ex,w)=>w==null?'':fmtW(ex&&ex.assist?-w:w);

/* ---------- analytics ----------
   The index (IDX), its readers and the RIR reading are in src/app/ since r52
   (analytics.ts, weeks.ts, time.ts, coach.ts); what stays here moves with the
   screens that call it (ARCHITECTURE.md, phase 5). */
const rirShow=ex=>state.settings.rirMode!=='off'&&!(ex&&ex.timed);
/* One set as text, for history, tables and the coach: 225×5, or 45 s for a timed hold. */
function setShort(ex,w,r){return ex.timed?`${loadLabel(ex,+w||0)} for ${r}s`:`${loadLabel(ex,+w||0)}×${r}`;}
function setStr(ex,x){return `${x.warm?'(W) ':x.drop?'(D) ':''}${setShort(ex,x.w,x.r)}${!ex.timed&&x.rir!=null&&x.rir!==''?(rirScale()==='rpe'?' @RPE '+effShow(x.rir):' @'+effShow(x.rir)):''}${x.cal?' (RIR check)':''}`;}
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
const sessionsOn=d=>dateIndex().byDate[d]||[];
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
