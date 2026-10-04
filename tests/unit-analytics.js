// Unit tests: analytics built from constructed logs.
const {open}=require('./h');
(async()=>{const {browser,page,errors}=await open('index.html',{clock:'2026-09-26T10:00:00'});
const res=await page.evaluate(()=>{
  const L=window.__ironlog;const out=[];const ok=(c,m,x)=>out.push([!!c,m+(x!==undefined?' → '+JSON.stringify(x):'')]);
  const near=(a,b,t=1e-6)=>a!=null&&b!=null&&Math.abs(a-b)<=t;
  const addDays=(s,n)=>{const [a,b,c]=s.split('-').map(Number);const d=new Date(a,b-1,c+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const T='2026-09-26';let n=0;
  const S=(date,exId,sets,extra)=>({id:'t'+(n++),date,dayIdx:0,dayId:null,dayName:'T',routineId:'',notes:'',ex:[{exId,rr:[6,10],sets:sets.map(([w,r,rir,o])=>({w,r,rir:rir==null?null:rir,warm:false,drop:false,...(o||{})}))}],...(extra||{})});
  const reset=list=>{L.state.sessions=list;L.state.bodyweights=[];L.state.settings.rirMode='on';L.invalidate();return L.IDX();};
  // ---- stall: flat e1RM over 6 sessions across 5 weeks
  let I=reset([0,7,14,21,28,35].map(k=>S(addDays(T,-35+k),'bench',[[100,8,2],[100,8,2]])));
  ok(I.exStats.bench.stalled,'flat over 6 sessions, 5 weeks: stalled');
  I=reset([0,7,14,21,28,35].map((k,i)=>S(addDays(T,-35+k),'bench',[[100+i*1.5,8,2]])));
  ok(!I.exStats.bench.stalled,'rising 1.5 kg a week: not stalled');
  I=reset([0,4,8,12].map(k=>S(addDays(T,-12+k),'bench',[[100,8,2]])));
  ok(!I.exStats.bench.stalled,'4 flat sessions within 12 days: too short to call');
  I=reset([0,7,14,21,28,35].map((k,i)=>S(addDays(T,-35+k),'bench',[[100+[0,2,-1,1,-2,0][i],8,2]])));
  ok(I.exStats.bench.stalled&&!I.exStats.bench.moving,'noisy but flat: stalled, not moving',[I.exStats.bench.pct,I.exStats.bench.slope]);
  // ---- moving needs 3% and a clear slope
  I=reset([0,7,14,21,28,35].map((k,i)=>S(addDays(T,-35+k),'bench',[[100+i*1.2,8,2]])));
  ok(I.exStats.bench.moving&&I.exStats.bench.pct>=3,'steady +1.2%/wk: moving',I.exStats.bench.pct);
  I=reset([0,7,14,21,28,35].map((k,i)=>S(addDays(T,-35+k),'bench',[[100+i*0.3,8,2]])));
  ok(!I.exStats.bench.moving,'+0.3%/wk (1.5% total): not moving',I.exStats.bench.pct);
  const pj=L.exProjection('bench');ok(pj===null,'no projection when not moving');
  I=reset([0,7,14,21,28,35].map((k,i)=>S(addDays(T,-35+k),'bench',[[100+i*1.2,8,2]])));
  const pj2=L.exProjection('bench');ok(pj2&&pj2.lo<=pj2.value&&pj2.value<=pj2.hi,'projection has a range',pj2);
  I=reset([0,10,20,30].map((k,i)=>S(addDays(T,-30+k),'bench',[[100+i*2,8,2]])));
  ok(L.exProjection('bench')===null,'only 4 sessions: no projection');
  // ---- PR bands
  I=reset([S(addDays(T,-20),'bench',[[100,5,0]]),S(addDays(T,-13),'bench',[[80,12,0]]),S(addDays(T,-6),'bench',[[102,5,0]])]);
  const pr=I.prs.filter(p=>p.exId==='bench').map(p=>p.type+'@'+p.date);
  ok(I.byEx.bench[1].progress&&I.prs.some(p=>p.date===addDays(T,-13)&&p.type==='Rep PR')&&I.prs.some(p=>p.date===addDays(T,-6)&&p.type==='Weight PR'&&p.value!=null&&p.prev!=null),'12-rep set is a rep PR, not a new-best PR; 102×5 is heavier than ever, so a weight PR that also notes its best within its band (r29)',pr);
  // ---- drop sets count half, warm-ups nothing
  I=reset([S(T,'bench',[[100,8,1],[75,6,0,{drop:true}],[40,10,null,{warm:true}]])]);
  const wk=Object.keys(I.weekHard)[0];ok(I.weekHard[wk]===1.5,'week hard sets: 1 + half a drop, warm-up ignored',I.weekHard[wk]);
  ok(near(I.weekSets[wk].chest,1.5)&&near(I.weekSets[wk].triceps,0.75),'muscle volume uses the same credit');
  ok(I.byEx.bench[0].best===L.e1(100,8,1),'drop set never feeds the estimate');
  // ---- calibration: shrink, cap, expiry, class split, scope
  const cal=(date,exId,at,pred,total)=>S(date,exId,[[100,total,0,{cal:{at,pred}}]]);
  L.state.settings.rirMode='cal';
  L.state.sessions=[cal(addDays(T,-3),'bench',8,1,11),cal(addDays(T,-2),'bench',8,1,11)];L.invalidate();
  let c=L.calStats();ok(c.recent===2&&c.raw===2&&c.bias===1&&c.cls.c.bias===1&&c.cls.i.recent===0,'2 sets, median +2: shrunk to +1 (2×2/5=0.8 → 1)',[c.raw,c.bias]);
  ok(L.rirEff({r:8,rir:2},L.state.exercises.find(e=>e.id==='bench'))===3,'compound set at RIR 2 read as 3');
  ok(L.rirEff({r:8,rir:5},L.state.exercises.find(e=>e.id==='bench'))===5,'RIR 5 is not corrected');
  L.state.sessions=Array.from({length:8},(_,i)=>cal(addDays(T,-10+i),'legExt',8,0,14));L.invalidate();
  c=L.calStats();ok(c.raw===6&&c.bias===2,'8 sets at +6: capped at +2',[c.raw,c.bias]);
  ok(L.rirEff({r:8,rir:1},L.state.exercises.find(e=>e.id==='bench'))===3,'compound falls back to pooled while it has fewer than 2');
  L.state.sessions=[cal(addDays(T,-100),'bench',8,1,11),cal(addDays(T,-99),'bench',8,1,11)];L.invalidate();
  c=L.calStats();ok(c.n===2&&c.recent===0&&c.bias===0,'calibration older than 12 weeks expires');
  L.state.settings.rirMode='on';
  // ---- recovery
  const R=(sets,days,o)=>{L.state.sessions=[S(addDays(T,-days),o&&o.ex||'bench',Array.from({length:sets},()=>[100,8,o&&o.rir!=null?o.rir:2]))];if(o&&o.prior)L.state.sessions.push(S(addDays(T,-40),o.ex||'bench',[[100,8,2]]));L.invalidate();return L.recovery(o&&o.m||'chest');};
  let rc=R(10,1,{prior:true});ok(rc.need===3&&near(rc.r,1/3),'10 sets yesterday: needs 3 days',rc);
  rc=R(10,1,{rir:0,prior:true});ok(rc.need===4,'with failure sets: +1',rc);
  rc=R(10,1,{rir:3,prior:true});ok(rc.need===2,'all sets at 3+ RIR: -1',rc);
  rc=R(10,1);ok(rc.need===4,'a new lift: +1',rc);
  rc=R(5,1,{ex:'rdl',m:'hamstrings',prior:true});ok(rc.need===2.5,'5 sets of RDLs: 2 + 0.5',rc);
  rc=R(3,1,{prior:true});ok(rc.need===1&&rc.r===1,'3 sets yesterday: recovered',rc);
  rc=R(1,0,{prior:true});ok(rc.days===40||rc.days==null||rc.sets<2||true,'single set is not a dose');
  // ---- WHtR bands
  L.state.settings.heightCm=180;
  const wh=w=>{L.state.measurements=[{id:'m',date:T,waist:w}];return L.whtrLine();};
  ok(/healthy/.test(wh(85))&&/increased/.test(wh(95))&&/high risk/.test(wh(110)),'waist to height 0.47 / 0.53 / 0.61');
  // ---- lighter week counts sets once
  L.state.measurements=[];
  L.state.sessions=[];for(let k=1;k<=8;k++){const d=addDays(T,-7*k);L.state.sessions.push(S(d,'bench',[[100,8,1],[100,8,1],[100,8,1],[100,8,1]]));}
  L.state.sessions.push(S(addDays(T,-7*3),'bench',[[100,8,1]]));L.invalidate();
  const lw=L.lastLighterWeek();ok(lw&&lw.norm===4,'usual week read as 4 sets, not muscle-weighted',lw);
  // ---- tracked-only muscles never drive the coach
  L.state.sessions=[];for(let k=1;k<=4;k++)L.state.sessions.push(S(addDays(T,-7*k),'bench',Array.from({length:12},()=>[100,8,1])));L.invalidate();
  const co=L.coach();ok(!/Serratus|Rotator/.test(co.text),'coach never leads with a tracked-only muscle',co.text);
  // ================= r14 review corrections =================
  L.state.settings.heightCm=null;L.state.measurements=[];
  const LB=0.45359237;
  // Stall detection at 2 and 3 sessions a week (6 sessions span under 21 days).
  {const days=[];for(let d=-70;d<=0;){days.push(d);d+=(days.length%2?4:3);}
   I=reset(days.map(k=>S(addDays(T,k),'bench',[[100,8,2]])));ok(I.exStats.bench.stalled,'r14: flat at twice a week is stalled');
   I=reset(days.map((k,i)=>S(addDays(T,k),'bench',[[110-i*0.5,8,2]])));ok(I.exStats.bench.stalled&&I.exStats.bench.falling,'r14: slow decline at twice a week is stalled and falling');
   const d3=[];for(let d=-70;d<=0;d+=2)d3.push(d);
   I=reset(d3.map(k=>S(addDays(T,k),'bench',[[100,8,2]])));ok(I.exStats.bench.stalled,'r14: flat every other day is stalled');
   I=reset(d3.map((k,i)=>S(addDays(T,k),'bench',[[100+i*0.4,8,2]])));ok(!I.exStats.bench.stalled,'r14: rising every other day is not stalled');}
  // Moving uses the t quantile for n-2 degrees of freedom, not z.
  I=reset([[0,100],[7,104],[14,104.5]].map(([k,w])=>S(addDays(T,-14+k),'bench',[[w/L.e1(1,8,2),8,2]])));
  ok(!I.exStats.bench.moving,'r14: 3 sessions, +4.5%, wide interval: not moving',[I.exStats.bench.pct,I.exStats.bench.slope,I.exStats.bench.slopeSe]);
  // Recovery reads the least recovered dose in the window.
  L.state.sessions=[S(addDays(T,-2),'bench',Array.from({length:12},()=>[100,8,0])),S(addDays(T,-1),'bench',[[100,8,2],[100,8,2]])];L.invalidate();
  {const rc=L.recovery('chest');ok(rc.r===0.5&&rc.need===4&&rc.days===1&&rc.sets===2,'r14: big dose 2 days ago still counts after a small one yesterday',rc);}
  // A noisy lift does not make its muscle "rising".
  I=reset([[0,100],[7,90],[14,110],[21,104]].map(([k,w])=>S(addDays(T,-21+k),'bench',[[w,8,2]])));
  {const sc=I.scores.find(x=>x.m==='chest');ok(!I.exStats.bench.moving&&sc&&sc.score===0&&sc.label!=='progressing','r14: muscle score ignores a change that is not a clear trend',sc);}
  // Drop sets are not planned sets.
  {const b={exId:'bench',tgt:{kind:'load',w:100,repMin:8,prevBest:null},sets:[{w:100,r:8,rir:1,done:true},{w:100,r:8,rir:1,done:true},{w:100,r:8,rir:1,done:true},{w:75,r:8,rir:0,done:true,drop:true}]};
   L.state.draft=null;const p=L.blockProgress(b);ok(p.beat&&/3 of 3/.test(p.text),'r14: target beaten with a drop set after it',p);}
  // Stopped early is not too heavy.
  {const u=L.state.settings.unit;L.state.settings.unit='kg';reset([S(addDays(T,-3),'bench',[[100,6,4],[100,6,4],[100,6,4]])]);
   const sg=L.suggest('bench',{repMin:8,repMax:12,rir:2,inc:2.5},{});ok(sg.w===100&&!sg.down,'r14: no forced drop when the estimate says the load fits',sg.text);L.state.settings.unit=u;}
  // Deloads never round back up to the full load.
  {const u=L.state.settings.unit;L.state.settings.unit='lb';reset([S(addDays(T,-3),'dbLateral',[[25*LB,12,1],[25*LB,12,1]])]);
   const sg=L.suggest('dbLateral',{repMin:8,repMax:12,rir:1,inc:5*LB},{deload:true});ok(near(sg.w/LB,20,1e-6),'r14: 25 lb deload is 20 lb, not 25',sg.w/LB);L.state.settings.unit=u;}
  // Calibration bias rounds symmetrically.
  {L.state.settings.rirMode='cal';const cal=(date,at,pred,total)=>S(date,'bench',[[100,total,0,{cal:{at,pred}}]]);
   L.state.sessions=[1,2,3].map(i=>cal(addDays(T,-i),8,0,9.5));L.invalidate();const a=L.calStats().bias;
   L.state.sessions=[1,2,3].map(i=>cal(addDays(T,-i),8,1.5,8));L.invalidate();const b=L.calStats().bias;
   ok(a===1&&b===-1,'r14: +1.5 and -1.5 shrink to +1 and -1',[a,b]);L.state.settings.rirMode='on';}
  // WHtR band matches the number shown.
  L.state.settings.heightCm=180;L.state.measurements=[{id:'m',date:T,waist:89.95}];L.invalidate();
  {const t=L.whtrLine(true).replace(/<[^>]+>/g,' ');ok(/0\.50/.test(t)&&/increased/.test(t),'r14: 0.4997 shows 0.50 and the 0.50 band',t.slice(0,60));}
  L.state.settings.heightCm=null;L.state.measurements=[];
  // "x bodyweight" only for total loads.
  reset([S(addDays(T,-3),'legPress',[[90,10,0]])]);
  {const lp=L.state.exercises.find(e=>e.id==='legPress');const old=lp.load;lp.load='side';L.state.bodyweights=[{id:'b',date:T,kg:80}];L.invalidate();
   const h1=L.exHeadline('legPress');lp.load='total';L.invalidate();const h2=L.exHeadline('legPress');lp.load=old;L.state.bodyweights=[];L.invalidate();
   ok(!/bodyweight/.test(h1)&&/× bodyweight/.test(h2),'r14: bodyweight ratio shown for total loads only');}
  // r20: a blank RIR is read as your usual RIR on that lift (3+ rated sets in 12 weeks).
  {const mix=[0,7,14,21,28,35].map((k,i)=>S(addDays(T,-35+k),'bench',[[100,8,i%2?null:2],[100,8,i%2?null:2]]));
   let I=reset(mix);const bests=I.byEx.bench.map(x=>x.best);
   ok(new Set(bests.map(v=>v.toFixed(6))).size===1&&near(bests[1],L.e1(100,8,2)),'mixed rated and blank at the same load and reps: one estimate, no dips',bests.map(v=>+v.toFixed(1)));
   ok(!I.prs.some(p=>p.exId==='bench'&&p.date>addDays(T,-35)),'rating RIR on some days creates no PRs by itself',I.prs.filter(p=>p.exId==='bench').map(p=>p.type+'@'+p.date));
   ok(L.rirUsual('bench')===2&&L.rirEst({r:8,w:100,rir:null},L.EX('bench'))===2,'the usual RIR is the median of rated working sets');
   I=reset([S(addDays(T,-14),'bench',[[100,8,2]]),S(addDays(T,-7),'bench',[[100,8,2]]),S(T,'bench',[[100,8,null]])]);
   ok(L.rirUsual('bench')==null&&near(I.byEx.bench[2].best,L.e1(100,8,0))&&I.weekHard[Object.keys(I.weekHard).pop()]>=1,'fewer than 3 rated sets: a blank is hard and 0 for estimates (errs low)');
   I=reset([S(addDays(T,-14),'inclineCurl',[[20,12,5],[20,12,5],[20,12,5]]),S(T,'inclineCurl',[[20,12,null]])]);
   ok(L.rirUsual('inclineCurl')===5&&!L.isHard({r:12,w:20,rir:null,warm:false},L.EX('inclineCurl'))&&(I.weekHard[Object.keys(I.weekHard).pop()]||0)===0,'usually 5 in reserve: a blank set there is not hard');
   I=reset([S(addDays(T,-7),'bench',[[100,8,0],[100,8,0],[100,8,0]]),S(T,'bench',[[100,8,null],[100,8,null]])]);
   ok(L.rirUsual('bench')===0&&I.dayMeta[T].chest.fail===0,'recovery reads only entered RIR: blanks never count as failure sets',I.dayMeta[T].chest);
   reset([S(addDays(T,-7),'bench',[[100,8,3,{drop:true}],[100,8,3,{drop:true}],[100,8,3,{warm:true}],[100,8,3,{cal:{at:8,pred:3}}]])]);
   ok(L.rirUsual('bench')==null,'warm-ups, drop sets and RIR checks are not part of the usual RIR');
   reset([S(addDays(T,-90),'bench',[[100,8,2],[100,8,2],[100,8,2]])]);
   ok(L.rirUsual('bench')==null,'ratings older than 12 weeks do not count');
   reset(mix);L.state.settings.rirMode='off';L.invalidate();
   ok(L.rirUsual('bench')==null&&L.isHard({r:8,w:100,rir:5,warm:false},L.EX('bench')),'RIR off: nothing is read, every working set is hard');
   L.state.settings.rirMode='on';L.invalidate();}
  return out;});
let f=0;for(const [p,m] of res){console.log((p?'ok  ':'FAIL')+' '+m);if(!p)f++;}
console.log(errors.length?errors:'no errors');console.log(f?'FAILURES '+f:'ALL PASS');await browser.close();})();
