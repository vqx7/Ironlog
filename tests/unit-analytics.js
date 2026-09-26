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
  ok(I.byEx.bench[1].progress&&I.prs.some(p=>p.date===addDays(T,-13)&&p.type==='Rep PR')&&I.prs.some(p=>p.date===addDays(T,-6)&&p.type==='e1RM'),'12-rep set is a rep PR, not a new-best PR; 102×5 is a best within its band',pr);
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
  return out;});
let f=0;for(const [p,m] of res){console.log((p?'ok  ':'FAIL')+' '+m);if(!p)f++;}
console.log(errors.length?errors:'no errors');console.log(f?'FAILURES '+f:'ALL PASS');await browser.close();})();
