// Unit tests for the math, run in the page against the real functions.
const {open}=require('./h');
(async()=>{const {browser,page,errors}=await open('index.html',{clock:'2026-09-26T10:00:00'});
const res=await page.evaluate(()=>{
  const L=window.__ironlog;const out=[];const ok=(c,m,extra)=>out.push([!!c,m+(extra!==undefined?' → '+JSON.stringify(extra):'')]);
  const near=(a,b,t=1e-6)=>a!=null&&b!=null&&Math.abs(a-b)<=t;
  const {e1}=L;
  // ---- e1RM
  ok(e1(100,1,0)===100,'single at RIR 0 returns the load');
  ok(e1(100,1,null)===100,'single with blank RIR returns the load');
  ok(near(e1(100,2,0),100*36/35),'double uses Brzycki (102.86), not Epley 106.67',e1(100,2,0));
  ok(near(e1(100,10,0),133.3333,1e-3)&&near(e1(100,10,0),100*(1+10/30)),'Brzycki and Epley meet at 10 RTF');
  ok(near(e1(100,5,5),null)||e1(100,5,5)===null,'RIR 5 is excluded, not capped',e1(100,5,5));
  ok(near(e1(100,8,4),140),'8 reps @4 RIR = 12 RTF, Epley 140');
  ok(near(e1(100,11,0),100*(1+11/30)),'11 RTF uses Epley');
  ok(e1(100,13,0)===null&&e1(100,10,3)===null,'past 12 RTF gives no estimate');
  ok(e1(0,5,0)===null&&e1(100,0,0)===null&&e1(-5,5,0)===null,'zero or negative inputs give null');
  let mono=true,prev=0;for(let r=1;r<=12;r++){const v=e1(100,r,0);if(!(v>prev))mono=false;prev=v;}ok(mono,'estimate rises with every added rep, 1 to 12');
  let inv=true;for(let r=1;r<=12;r++){const est=e1(87.5,r,0);if(!near(L.e1inv(est,r),87.5,1e-9))inv=false;if(!near(L.rtfAt(est,87.5),r,1e-9))inv=false;}ok(inv,'inverse functions round-trip for 1 to 12 RTF');
  ok(L.rtfBand(5)===1&&L.rtfBand(6)===2&&L.rtfBand(10)===2&&L.rtfBand(11)===3&&L.rtfBand(12)===3,'rep bands 1-5, 6-10, 11-12');
  // ---- hard sets and credit
  ok(L.isHard({r:8,rir:3})&&!L.isHard({r:8,rir:4})&&L.isHard({r:8,rir:null})&&!L.isHard({r:8,rir:1,warm:true})&&!L.isHard({r:0,rir:1}),'hard set: RIR ≤3 or blank; warm-ups and zero reps never');
  ok(L.setCredit({drop:true})===0.5&&L.setCredit({})===1,'drop set = half a set');
  // ---- load modes and tonnage
  const EX=id=>L.state.exercises.find(e=>e.id===id);
  const lm={dbBench:'each',dbRow:'total',latPulldown:'stack',legPress:'total',pullup:'bw',bench:'total',landmineRow:'total',bss:'each',goblet:'total',cableCurl:'stack'};
  ok(Object.entries(lm).every(([k,v])=>L.loadMode(EX(k))===v),'default load modes',Object.fromEntries(Object.keys(lm).map(k=>[k,L.loadMode(EX(k))])));
  ok(L.loadWords(EX('dbBench'))==='per dumbbell'&&L.loadWords(EX('bench'))==='total, bar included'&&L.loadWords(EX('dbRow'))==='one dumbbell'&&L.loadWords(EX('pullup'))==='added to bodyweight','load words');
  ok(L.tonnage(EX('dbBench'),{w:50,r:10})===1000,'two dumbbells count twice');
  ok(L.tonnage(EX('dbRow'),{w:100,r:10})===2000,'one-arm row: reps per side count both sides');
  ok(L.tonnage(EX('bss'),{w:40,r:8})===40*2*8*2,'split squat: two dumbbells, both legs');
  ok(L.tonnage(EX('bench'),{w:225,r:5})===1125,'barbell total counts once');
  ok(L.tonnage({...EX('legPress'),load:'side'},{w:90,r:10})===1800,'plates per side count both sides');
  L.state.bodyweights=[{id:'b',date:'2026-09-01',kg:80}];L.invalidate();
  ok(near(L.tonnage(EX('pullup'),{w:20,r:5}),(80+20)*5),'pull-up tonnage adds bodyweight');
  ok(near(L.tonnage(EX('pushup'),{w:0,r:10}),80*0.64*10),'push-up uses 64% of bodyweight');
  ok(near(L.tonnage(EX('deficitPushup'),{w:0,r:10}),80*0.64*10)&&!!EX('declinePushup'),'deficit push-up 64%, decline push-up added');
  ok(L.noE1(EX('hangingLegRaise'))&&L.noE1(EX('nordic'))&&L.noE1(EX('plank'))&&!L.noE1(EX('pullup')),'joint-rotation and timed lifts get no estimate');
  // ---- progression steps
  const inc=5*0.45359237;
  ok(near(L.progStep(EX('bench'),{inc},100),inc),'bench at 100 kg: one 5 lb step (2.5% = 2.5 kg)');
  ok(near(L.progStep(EX('legPress'),{inc},250),inc*2),'leg press at 250 kg: two steps (6.25 kg)',L.progStep(EX('legPress'),{inc},250)/inc);
  ok(near(L.progStep(EX('dbLateral'),{inc},11),inc),'lateral raise: never below one step');
  ok(L.jumpCap(EX('dbLateral'),10)===1.15&&L.jumpCap(EX('bench'),10)===1.10&&L.jumpCap(EX('dbLateral'),30)===1.10,'jump caps 15% light isolation, else 10%');
  ok(L.isCompound(EX('bench'))&&L.isCompound(EX('rackPull'))&&L.isCompound(EX('hackSquat'))&&!L.isCompound(EX('dbLateral'))&&!L.isCompound(EX('pallof'))&&!L.isCompound(EX('cableCurl')),'compound classification');
  // ---- time model
  ok(L.setSecs(EX('bench'),{repMin:8,repMax:12})===40&&near(L.setSecs(EX('legExt'),{repMin:15,repMax:20}),40+3*5.5)&&L.setSecs(EX('dbRow'),{repMin:8,repMax:12})===95&&L.setSecs(EX('plank'),{repMin:30,repMax:60})===65,'per-set seconds');
  ok(L.setupSecs(EX('bench'),0)===300&&L.setupSecs(EX('bench'),2)===180&&L.setupSecs(EX('dbLateral'),0)===60,'setup seconds');
  return out;});
let f=0;for(const [p,m] of res){console.log((p?'ok  ':'FAIL')+' '+m);if(!p)f++;}
console.log(errors.length?errors:'no errors');console.log(f?'FAILURES '+f:'ALL PASS');await browser.close();})();
