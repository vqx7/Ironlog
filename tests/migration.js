// Migration: saves made by the previous builds load with nothing lost.
const {open}=require('./h');const { engine } = require('./h');
const fails=[];const ok=(c,m,x)=>{if(!c){fails.push(m);console.log('FAIL',m,JSON.stringify(x));}else console.log('ok  ',m,x!==undefined?JSON.stringify(x).slice(0,200):'');};
// A log's sessions as saved, with each set's unit taken out (2.73 gives every set with a load the unit it was entered
// in, once, at load: the one change it makes to a saved session), and whether every unit given is the one the set's
// number lies on, last among its fields.
const LBK=0.45359237,onStep=(v,s)=>Math.abs(v/s-Math.round(v/s))<1e-6;
const gridU=w=>{const a=Math.abs(w);if(!(a>0))return null;const k=onStep(a,0.05),l=onStep(a/LBK,0.05);return k===l?null:k?'kg':'lb';};
const noU=ss=>JSON.stringify(ss.map(x=>({...x,ex:x.ex.map(b=>({...b,sets:b.sets.map(q=>{const {u,...rest}=q;return rest;})}))})));
const unitsRight=ss=>ss.every(x=>x.ex.every(b=>b.sets.every(q=>(q.u===undefined?gridU(+q.w)===null:q.u===gridU(+q.w)&&Object.keys(q).pop()==='u'))));
// Every number a lifter reads from a log, as one build reads it (2.73): each load, the PR list, All-time bests, the
// weekly sets of six muscles, every routine lift's next target (load and words) and History's sets.
const READ=()=>{const L=window.__ironlog;const S=L.state;const r6=v=>v==null?null:Math.round(v*1e6)/1e6;
    const ids=[...new Set(S.sessions.flatMap(x=>x.ex.map(b=>b.exId)))].sort();
    const bests={};for(const id of ids){const b=L.allTimeBests(id);bests[id]=b?{heavy:b.heavy?[r6(b.heavy.p.w),b.heavy.p.r,b.heavy.date]:null,est:b.est?r6(b.est.v):null,front:b.front.map(f=>[r6(f.p.w),f.p.r])}:null;}
    const next={};const R=L.activeRoutine();for(const d of R.days)for(const it of d.items){const g=L.suggest(it.exId,it);next[it.exId+'|'+it.uid]=g?[r6(g.w),g.text,g.target]:null;}
    L.ui.tab='history';L.render();document.querySelectorAll('#view details').forEach(d=>d.open=true);L.render();
    return {w:S.sessions.map(x=>x.ex.map(b=>b.sets.map(q=>r6(q.w)))),
      prs:L.IDX().prs.map(p=>[p.exId,p.sid,p.type,r6(p.w),p.r,!!p.big,r6(p.value)]),bests,
      rolling:Object.fromEntries(['chest','triceps','biceps','quads','upperBack','lats'].map(m=>[m,L.rolling7(m)])),
      next,history:document.getElementById('view').innerText};};
(async()=>{const browser=await engine.launch();
for(const [file,label] of [['baselines/r120.html','r120'],['baselines/r119.html','r119'],['baselines/r118.html','r118'],['baselines/r117.html','r117'],['baselines/r116.html','r116'],['baselines/r115.html','r115'],['baselines/r114.html','r114'],['baselines/r113.html','r113'],['baselines/r112.html','r112'],['baselines/r111.html','r111'],['baselines/r110.html','r110'],['baselines/r109.html','r109'],['baselines/r108.html','r108'],['baselines/r107.html','r107'],['baselines/r106.html','r106'],['baselines/r105.html','r105'],['baselines/r104.html','r104'],['baselines/r103.html','r103'],['baselines/r102.html','r102'],['baselines/r101.html','r101'],['baselines/r100.html','r100'],['baselines/r99.html','r99'],['baselines/r98.html','r98'],['baselines/r97.html','r97'],['baselines/r96.html','r96'],['baselines/r95.html','r95'],['baselines/r94.html','r94'],['baselines/r93.html','r93'],['baselines/r92.html','r92'],['baselines/r91.html','r91'],['baselines/r90.html','r90'],['baselines/r89.html','r89'],['baselines/r88.html','r88'],['baselines/r87.html','r87'],['baselines/r86.html','r86'],['baselines/r85.html','r85'],['baselines/r84.html','r84'],['baselines/r83.html','r83'],['baselines/r82.html','r82'],['baselines/r81.html','r81'],['baselines/r80.html','r80'],['baselines/r79.html','r79'],['baselines/r78.html','r78'],['baselines/r77.html','r77'],['baselines/r76.html','r76'],['baselines/r75.html','r75'],['baselines/r74.html','r74'],['baselines/r73.html','r73'],['baselines/r72.html','r72'],['baselines/r71.html','r71'],['baselines/r70.html','r70'],['baselines/r69.html','r69'],['baselines/r68.html','r68'],['baselines/r67.html','r67'],['baselines/r66.html','r66'],['baselines/r65-2.html','r65.2'],['baselines/r65.html','r65'],['baselines/r64.html','r64'],['baselines/r63.html','r63'],['baselines/r62.html','r62'],['baselines/r61.html','r61'],['baselines/r60.html','r60'],['baselines/r59.html','r59'],['baselines/r58.html','r58'],['baselines/r57.html','r57'],['baselines/r56-2.html','r56.2'],['baselines/r56-1.html','r56.1'],['baselines/r56.html','r56'],['baselines/r55.html','r55'],['baselines/r54.html','r54'],['baselines/r53.html','r53'],['baselines/r52.html','r52'],['baselines/r51.html','r51'],['baselines/r50.html','r50'],['baselines/r49.html','r49'],['baselines/r48.html','r48'],['baselines/r47.html','r47'],['baselines/r46.html','r46'],['baselines/r45.html','r45'],['baselines/r44.html','r44'],['baselines/r43.html','r43'],['baselines/r42.html','r42'],['baselines/r41.html','r41'],['baselines/r40.html','r40'],['baselines/r39.html','r39'],['baselines/r38.html','r38'],['baselines/r37.html','r37'],['baselines/r36.html','r36'],['baselines/r35.html','r35'],['baselines/r34-2.html','r34.2'],['baselines/r34-1.html','r34.1'],['baselines/r34.html','r34'],['baselines/r32-1.html','r32.1'],['baselines/r32.html','r32'],['baselines/r31-3.html','r31.3'],['baselines/r31-2.html','r31.2'],['baselines/r31-1.html','r31.1'],['baselines/r31.html','r31'],['baselines/r30-2.html','r30.2'],['baselines/r30.html','r30'],['baselines/r29-5.html','r29.5'],['baselines/r29.html','r29.4'],['baselines/r28.html','r28'],['baselines/r27.html','r27'],['baselines/r26.html','r26'],['baselines/r25.html','r25'],['baselines/r24.html','r24'],['baselines/r23.html','r23'],['baselines/r22.html','r22'],['baselines/r21.html','r21'],['baselines/r20.html','r20'],['baselines/r19.html','r19'],['baselines/r18.html','r18'],['baselines/r17.html','r17'],['baselines/r16.html','r16'],['baselines/r15.html','r15'],['baselines/r14.html','r14'],['baselines/r13.html','r13'],['baselines/r12.html','r12'],['baselines/r11.html','r11']]){
  const P=await open(file,{browser,clock:'2026-09-26T10:00:00'});
  await P.page.evaluate(()=>{const L=window.__ironlog;const s=L.state;s.settings.onboarded=true;s.settings.priorities=['chest','biceps'];s.settings.heightCm=178;s.settings.bands.biceps=[12,22];
    s.exercises.push({id:'c_x',name:'My Curl',primary:'biceps',secondary:['forearms'],equip:'dumbbell',bw:false,custom:true,archived:false,note:'x'});
    s.priors=[{id:'p1',exId:'bench',w:140,r:5,note:''},{id:'p2',exId:'dbCurl',w:20,r:15,note:''}].filter(p=>s.exercises.some(e=>e.id===p.exId));
    s.injuries=[{id:'j',m:'triceps',note:'',date:'2026-09-20'}];L.makeDemo();
    s.draft=null;L.render();});
  await P.page.waitForTimeout(500);
  const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  const old=JSON.parse(raw);
  const N=await open('index.html',{browser,state:old,clock:'2026-09-26T10:00:00'});
  const r=await N.page.evaluate(()=>{const s=window.__ironlog.state;return {v:s.version,n:s.sessions.length,sets:s.sessions.reduce((a,x)=>a+x.ex.reduce((b,e)=>b+e.sets.length,0),0),ex:s.exercises.length,cx:!!s.exercises.find(e=>e.id==='c_x'),pri:s.settings.priorities,h:s.settings.heightCm,band:s.settings.bands.biceps,priors:s.priors===undefined?0:(s.priors||[]).length,priorsRaw:JSON.parse(localStorage.getItem('ironlog.v1')||'{}').priors,inj:s.injuries.length,crash:document.body.innerText.includes('Something broke')};});
  const oldSets=old.sessions.reduce((a,x)=>a+x.ex.reduce((b,e)=>b+e.sets.length,0),0);
  ok(r.v===5&&r.n===old.sessions.length&&r.sets===oldSets,`${label}: every session and set kept`,[r.n,r.sets,oldSets]);
  ok(r.cx&&r.pri.join()==='chest,biceps'&&r.h===178&&r.band.join()==='12,22'&&r.inj===1,`${label}: custom exercise, settings, bands, injuries kept`,r);
  ok(old.priors.length>0&&r.priors===0,`${label}: saved former bests (retired Comeback) are dropped on load`,[old.priors.length,r.priors]);
  ok(!r.crash,`${label}: renders`);
  for(const t of ['today','program','dash','history','settings']){const c=await N.page.evaluate(t=>{const L=window.__ironlog;L.ui.tab=t;L.render();document.querySelectorAll('details').forEach(d=>d.open=true);return document.body.innerText.includes('Something broke');},t);if(c)ok(false,`${label}: ${t} crashed`);}
  ok(!N.errors.length,`${label}: no console errors`,N.errors);
  // Read here as 2.74 reads the same save (which read it as 2.72 did: the units 2.73 gives a log change no number in it).
  const here=await N.page.evaluate(READ);
  await N.ctx.close();
  const W=await open('baselines/r120.html',{browser,state:old,clock:'2026-09-26T10:00:00'});
  const was=await W.page.evaluate(READ);await W.ctx.close();
  const diff=Object.keys(here).filter(k=>JSON.stringify(here[k])!==JSON.stringify(was[k]));
  ok(!diff.length,`${label}: every load, PR, All-time best, weekly number, next target and History line as 2.74 reads them`,diff.map(k=>[k,JSON.stringify(here[k]).slice(0,200),JSON.stringify(was[k]).slice(0,200)]));
}
// Targets a first-run pick of Strength 5 x 5 fitted by the plan's reading before r54 (three and a half sessions a week) follow r54's
// (three), once, at start: picked on r53 with its floors recorded, the same with chest typed to 9 since, and picked on r43, before
// floors were recorded. Five weeks of Monday, Wednesday and Friday, every set as planned, are logged with each.
{
  const WANT={chest:[7,20],triceps:[7,20],upperBack:[7,20],lats:[3,20],biceps:[3,20],rearDelts:[3,16],sideDelts:[3,20],hamstrings:[0,20],traps:[0,16],forearms:[0,12]};
  const FLOORS={chest:7,triceps:7,upperBack:7,lats:3,biceps:3,rearDelts:3,sideDelts:3,hamstrings:0,traps:0,forearms:0,abs:0,obliques:0,abductors:0,calves:0};
  for(const [file,label,typed] of [['baselines/r53.html','r53',false],['baselines/r53.html','r53, chest typed to 9',true],['baselines/r43.html','r43',false]]){
    const P=await open(file,{browser,clock:'2026-10-15T10:00:00',realStarter:true});
    const before=await P.page.evaluate((typed)=>{const L=window.__ironlog;const S=L.state;S.settings.onboarded=true;
      const R=L.routineFromTemplate('str5');S.routines.push(R);S.activeRoutineId=R.id;
      S.settings.bands=Object.fromEntries(Object.entries(L.BANDS).map(([m,b])=>[m,b.slice()]));L.fitTargets(R);if(typed)S.settings.bands.chest=[9,20];
      const tr=R.days.map((d,i)=>i).filter(i=>!R.days[i].rest);S.sessions=[];let k=0;
      for(let t=Date.parse('2026-09-14T12:00:00Z');;t+=864e5){const date=new Date(t).toISOString().slice(0,10);if(date>='2026-10-15')break;if(![1,3,5].includes(new Date(t).getUTCDay()))continue;
        const di=tr[k%tr.length],day=R.days[di];S.sessions.push({id:'m'+k,date,dayIdx:di,dayId:day.id,dayName:day.name,routineId:R.id,notes:'',ex:day.items.map(it=>({exId:it.exId,rr:[+it.repMin,+it.repMax],sets:Array.from({length:+it.sets},()=>({w:60+2.5*k,r:+it.repMin,rir:+it.rir,done:true}))}))});k++;}
      S.draft=null;L.saveNow();return {chest:S.settings.bands.chest.slice(),fit:S.settings.bandsFit||null};},typed);
    const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
    const N=await open('index.html',{browser,state:JSON.parse(raw),clock:'2026-10-15T10:00:00',realStarter:true});
    const r=await N.page.evaluate(()=>{const L=window.__ironlog;const S=L.state;const saved=JSON.parse(localStorage.getItem('ironlog.v1'));return {bands:S.settings.bands,fit:S.settings.bandsFit||null,saved:saved.settings.bands.chest,coach:L.coach().text};});
    const want={...WANT,...(typed?{chest:[9,20]}:{})};
    ok(before.chest[0]===(typed?9:8)&&(label==='r43'?before.fit===null:before.fit&&before.fit.chest===8),`${label}: the pick fitted chest to 8 with that reading${label==='r43'?', and recorded no floors':', and recorded the floors'}`,before);
    ok(Object.entries(want).every(([m,b])=>r.bands[m][0]===b[0]&&r.bands[m][1]===b[1])&&r.bands.quads.join()==='10,20'&&r.fit&&Object.keys(r.fit).length===Object.keys(FLOORS).length&&Object.entries(FLOORS).every(([m,v])=>r.fit[m]===v)&&r.saved.join()===want.chest.join(),`${label}: on this build the app's own targets follow r54's plan (chest, triceps and upper back 7, four muscles 3)${typed?', chest as typed stays at 9':''}, r54's floors are recorded, and it is saved`,r);
    // The three weeks averaged hold four A days, so chest is on plan; a target typed above the plan is the lifter's, and the plan is short of it.
    ok(typed?/^Chest: 6\.7 hard sets a week, target 9-20\. Add /.test(r.coach):/^Every muscle (at target|on plan), nothing stalled\./.test(r.coach),typed?`${label}: chest typed above what the plan has is short of the lifter's own target, so the coach says to add sets`:`${label}: following the plan reads at target or on plan, not "add a set"`,r.coach);
    const raw2=await N.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await N.ctx.close();
    const N2=await open('index.html',{browser,state:JSON.parse(raw2),clock:'2026-10-15T10:00:00',realStarter:true});
    const again=await N2.page.evaluate(()=>{const S=window.__ironlog.state;return {bands:S.settings.bands,fit:S.settings.bandsFit||null};});
    ok(JSON.stringify(again)===JSON.stringify({bands:r.bands,fit:r.fit}),`${label}: opened again, nothing moves: the refit is once`,again);
    ok(!N.errors.length&&!N2.errors.length,`${label}: no console errors after the refit`,[...N.errors,...N2.errors]);
    await N2.ctx.close();
  }
}
// A session r53 saved with an exercise Short on time trimmed (marked cut), and one in progress with a trimmed exercise: since r54
// nothing writes or reads the mark (V's one rule reads the log), so both keep it as saved, the saved record byte for byte (so its
// sync hash is unchanged), and the trimmed exercise is read by the one rule: three sets after four is short of its usual sets.
{
  const P=await open('baselines/r53.html',{browser,clock:'2026-10-15T10:00:00',realStarter:true});
  const made=await P.page.evaluate(()=>{const L=window.__ironlog;const s=L.state;s.settings.onboarded=true;s.settings.unit='kg';const R=L.activeRoutine();const day=R.days[0];
    const set=(w,r)=>({w,r,rir:1,warm:false,drop:false});
    s.sessions=['2026-09-24','2026-10-01','2026-10-08'].map((d,i)=>({id:'m'+i,date:d,dayIdx:0,dayId:day.id,dayName:day.name,routineId:R.id,notes:'',ex:[{exId:'bench',rr:[6,10],sets:[set(100,8),set(100,8),set(100,8),set(100,8)]}]}));
    L.invalidate();L.saveNow();
    // Upper A today, every exercise but the bench taken out, Short on time trimming it (15 minutes: four sets to three; at 10 or less r53 takes the bench out), three sets done, Finish.
    L.ACT.startSession({dataset:{day:'0',light:'0'}});const d=L.state.draft;d.ex=d.ex.filter(b=>b.exId==='bench');L.ACT.shortOpen();L.ui.modal.mins=15;L.ACT.shortApply();
    const b=L.state.draft.ex[0];const cut=!!b.cut;b.sets.forEach(x=>{x.w=100;x.r=8;x.done=true;});L.state.draft._leftAsked=true;L.state.draft._rampAsked=true;L.saveNow();L.ACT.finishNow();
    const saved=L.state.sessions[L.state.sessions.length-1];
    // Then a session in progress, trimmed the same way.
    L.ACT.startSession({dataset:{day:'0',light:'0'}});const d2=L.state.draft;d2.ex=d2.ex.filter(x=>x.exId==='bench');L.ACT.shortOpen();L.ui.modal.mins=15;L.ACT.shortApply();L.saveNow();
    // The record as r53 reads it back from the phone (its normalize, the form its sync hash is taken from), not the object Finish left in memory, whose keys are in another order.
    const back=L.normalize(JSON.parse(localStorage.getItem('ironlog.v1'))).sessions.find(x=>x.id===saved.id);
    return {cut,saved:JSON.stringify(back),n:back.ex[0].sets.length,draftCut:!!L.state.draft.ex[0].cut};});
  const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  ok(made.cut&&made.draftCut&&JSON.parse(made.saved).ex[0].cut===true&&made.n<4,'set up: r53 marked the trimmed bench press, saved and in progress',made);
  const N=await open('index.html',{browser,state:JSON.parse(raw),clock:'2026-10-15T10:00:00',realStarter:true});
  const r=await N.page.evaluate((sid)=>{const L=window.__ironlog;const s=L.state;const ss=s.sessions.find(x=>x.id===sid);const x=(L.IDX().byEx.bench||[]).find(q=>q.sid===sid);
    return {same:JSON.stringify(ss),draftCut:!!(s.draft&&s.draft.ex[0].cut),full:s.draft&&s.draft.ex[0].full,short:x&&x.short||null,light:x&&x.light};},JSON.parse(made.saved).id);
  ok(noU([JSON.parse(r.same)])===noU([JSON.parse(made.saved)])&&unitsRight([JSON.parse(r.same)]),'r53\'s saved session with its trimmed bench press loads as saved, mark and all, each set given the unit its load lies on, last',[r.same.slice(0,160),made.saved.slice(0,160)]);
  ok(r.draftCut&&r.full===undefined,'the session in progress keeps its trimmed mark as saved, with no count added',r);
  ok(r.short==='sets'&&r.light===false,'and the one rule reads the trimmed bench press: fewer sets than its usual four, so its target repeats while its trend counts',r);
  ok(!N.errors.length,'no console errors loading r53\'s trimmed sessions',N.errors);
  await N.ctx.close();
}
// r55 records on each session the sessions a week its routine planned (pw), read for that week after the routine changes. A valid
// one is kept and an invalid one dropped on load (at most 7: a week of more is not recorded, r68); a phone still on r54 keeps it when it saves (keepExtra), in its place, so after
// that phone's save this build still reads the weeks by it; and a save from r54, which has none, reads as r54 read it.
{
  const N=await open('index.html',{browser,clock:'2026-10-15T10:00:00',realStarter:true});
  const mk=await N.page.evaluate(()=>{const L=window.__ironlog;const s=L.state;s.settings.onboarded=true;const R=L.activeRoutine();const days=R.days.filter(d=>!d.rest);
    const dates=['2026-09-21','2026-09-22','2026-09-24','2026-09-25','2026-09-28','2026-09-29','2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-08','2026-10-09'];
    s.sessions=dates.map((date,i)=>{const d=days[i%days.length];return {id:'pw'+i,date,dayIdx:R.days.indexOf(d),dayId:d.id,dayName:d.name,routineId:R.id,notes:'',pw:i===0?9:i===1?'4':4,ex:[{exId:'bench',rr:[6,10],sets:[{w:60,r:8,rir:2,warm:false,drop:false}]}]};});
    L.state=L.normalize(s);L.invalidate();L.saveNow();
    // A fifth training day, so the routine as it is now plans 5.
    const di=R.days.findIndex(d=>d.rest);const R2=L.activeRoutine();R2.days[di].items.push({...R2.days[0].items[0],uid:'zz'});R2.days[di].rest=false;L.invalidate();L.saveNow();
    return {pw:L.state.sessions.slice(0,3).map(x=>x.pw===undefined?'none':x.pw),streak:L.weekStreak().weeks};});
  ok(JSON.stringify(mk.pw)==='["none","none",4]'&&mk.streak===3,'this build keeps a valid pw and drops 9 and "4"; three weeks of four read as a 3-week streak with a fifth day added since',mk);
  const raw=await N.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await N.ctx.close();
  const O=await open('baselines/r54.html',{browser,state:JSON.parse(raw),clock:'2026-10-15T10:00:00',realStarter:true});
  const o=await O.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.userName='Phone two';L.saveNow();const ss=JSON.parse(localStorage.getItem('ironlog.v1')).sessions;return {pw:ss.map(x=>x.pw===undefined?'none':x.pw).join(),last:Object.keys(ss[5]).slice(-2).join()};});
  const raw2=await O.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await O.ctx.close();
  ok(o.pw==='none,none,4,4,4,4,4,4,4,4,4,4'&&o.last==='ex,pw','r54 loads it and saves it with every pw kept, after the fields r54 knows',o);
  const B=await open('index.html',{browser,state:JSON.parse(raw2),clock:'2026-10-15T10:00:00',realStarter:true});
  const b=await B.page.evaluate(()=>{const L=window.__ironlog;return {name:L.state.settings.userName,streak:L.weekStreak().weeks,pw:L.state.sessions.filter(x=>x.pw===4).length};});
  ok(b.name==='Phone two'&&b.pw===10&&b.streak===3,'and back on this build the weeks still read by it: a 3-week streak',b);
  ok(!B.errors.length,'no console errors loading the pw records',B.errors);
  await B.ctx.close();
}
// What the app asked of each set across 2.60 and 2.61 (391): 2.61 keeps it on each ticked working set (sg), last among the
// set's fields. A valid one is kept; one that is not two numbers or nulls, both null, or on a warm-up, is dropped on load and
// not kept as a field this build does not know. 2.60 keeps it when it saves (an unknown field kept where it came), so it comes
// back here; a save from 2.60 has none and reads as it did.
{
  const N=await open('index.html',{browser,clock:'2026-11-12T10:00:00',realStarter:true});
  const mk=await N.page.evaluate(()=>{const L=window.__ironlog;const s=L.state;s.settings.onboarded=true;const R=L.activeRoutine();
    const set=(w,r,o)=>({w,r,rir:null,warm:false,drop:false,...o});
    s.sessions=[{id:'sg1',date:'2026-11-10',dayIdx:0,dayName:'A',routineId:R.id,notes:'',ex:[{exId:'bench',rr:[6,10],sets:[
      set(60,8,{rid:'a',sg:[60,8]}),set(62.5,8,{rid:'b',sg:[null,8]}),set(40,10,{warm:true,rid:'c',sg:[40,10]}),
      set(60,7,{rid:'d',sg:['x',8]}),set(60,7,{rid:'e',sg:[60]}),set(60,7,{rid:'f',sg:[null,null]})]}]}];
    L.state=L.normalize(s);L.invalidate();L.saveNow();
    // Last but the unit its load was entered in (2.73), which goes last.
    return L.state.sessions[0].ex[0].sets.map(x=>x.sg===undefined?('sg' in x?'kept':'none'):JSON.stringify(x.sg)+(Object.keys(x).slice(-2).join()==='sg,u'?' last':''));});
  ok(JSON.stringify(mk)===JSON.stringify(['[60,8] last','[null,8] last','none','none','none','none']),'this build keeps a set\'s asked load and reps (or reps alone) last but its load\'s unit, and drops one on a warm-up, one that is not two numbers, and one with neither',mk);
  const raw=await N.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await N.ctx.close();
  const O=await open('baselines/r106.html',{browser,state:JSON.parse(raw),clock:'2026-11-12T10:00:00',realStarter:true});
  const o=await O.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.userName='Phone two';L.saveNow();return JSON.parse(localStorage.getItem('ironlog.v1')).sessions[0].ex[0].sets.map(x=>x.sg===undefined?'none':JSON.stringify(x.sg));});
  const raw2=await O.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await O.ctx.close();
  ok(JSON.stringify(o.slice(0,2))==='["[60,8]","[null,8]"]','2.60 loads it and saves it with each set\'s asked load and reps kept',o);
  const B=await open('index.html',{browser,state:JSON.parse(raw2),clock:'2026-11-12T10:00:00',realStarter:true});
  const b=await B.page.evaluate(()=>{const L=window.__ironlog;return {name:L.state.settings.userName,sg:L.state.sessions[0].ex[0].sets.slice(0,2).map(x=>JSON.stringify(x.sg))};});
  ok(b.name==='Phone two'&&JSON.stringify(b.sg)==='["[60,8]","[null,8]"]','and back on this build it reads as it was saved here',b);
  ok(!B.errors.length,'no console errors loading the asked sets',B.errors);
  await B.ctx.close();
}
// A workout in progress across 2.48 and 2.49 (NEW-109): 2.49's blocks carry the engine's short first-time line (hintAgain).
// Started on 2.48 it has none and loads with its hints; started here it keeps the line through a save, and 2.48 keeps it
// too (an unknown field kept where it came, keepExtra), so a phone a build behind loses nothing.
{
  const day={id:'A',name:'New',rest:false,items:['legExt','legCurl'].map((exId,k)=>({uid:'A'+k,exId,sets:3,repMin:8,repMax:12,rir:2,rest:90,ss:null}))};
  const start=async(file,state)=>{const P=await open(file,{browser,state,clock:'2026-11-11T10:00:00',realStarter:true});
    await P.page.evaluate(d=>{const L=window.__ironlog;const S=L.state;S.settings.onboarded=true;if(!S.draft){S.routines=[{id:'R1',name:'Mine',schedule:'cycle',days:[d]}];S.activeRoutineId='R1';S.sessions=[];L.state=L.normalize(S);L.invalidate();L.ACT.startSession({dataset:{day:'0',light:'0'}});}L.saveNow();},day);
    return P;};
  const read=P=>P.page.evaluate(()=>{const d=window.__ironlog.state.draft;return d?d.ex.map(b=>({hint:(b.hint||'').slice(0,20),again:b.hintAgain===undefined?'none':b.hintAgain})):null;});
  let P=await start('baselines/r94.html');const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  P=await open('index.html',{browser,state:JSON.parse(raw),clock:'2026-11-11T10:00:00',realStarter:true});let a=await read(P);
  ok(a&&a.length===2&&a.every(b=>b.again==='none'&&/^First time/.test(b.hint))&&!P.errors.length,'a workout started on 2.48 loads here with its hints and no short line, which it never had',a);await P.ctx.close();
  P=await start('index.html');a=await read(P);const raw2=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  ok(a&&a.every(b=>/^First time: pick a load for 8 to 12 reps, about \d+ to spare\.$/.test(b.again)),'started here, each new lift carries the engine\'s short line',a);
  const O=await open('baselines/r94.html',{browser,state:JSON.parse(raw2),clock:'2026-11-11T10:00:00',realStarter:true});
  await O.page.evaluate(()=>window.__ironlog.saveNow());const kept=JSON.parse(await O.page.evaluate(()=>localStorage.getItem('ironlog.v1'))).draft.ex.map(b=>b.hintAgain||'none');await O.ctx.close();
  ok(kept.length===a.length&&kept.every((x,i)=>x===a[i].again),'2.48 keeps the short line when it saves the workout, word for word, so it comes back here',{kept,a});
}
// A workout in progress across 2.51 and 2.52 (NEW-129, the review of 2.52's REV13-7): 2.52 notes when the lifting began
// (begunAt) beside when the workout was opened (startedAt, as before). Begun here, 2.51 keeps the start when it saves
// the workout (an unknown field kept where it came), so it comes back; begun on 2.51, which keeps no start, it reads
// here as begun when it was opened, as 2.51 reads it.
{
  const day={id:'A',name:'Push',rest:false,items:['bench'].map((exId,k)=>({uid:'A'+k,exId,sets:3,repMin:6,repMax:10,rir:2,rest:120,ss:null}))};
  const begin=async file=>{const P=await open(file,{browser,clock:'2026-11-11T10:00:00',realStarter:true});
    await P.page.evaluate(d=>{const L=window.__ironlog;const S=L.state;S.settings.onboarded=true;S.routines=[{id:'R1',name:'Mine',schedule:'cycle',days:[d]}];S.activeRoutineId='R1';S.sessions=[];L.state=L.normalize(S);L.invalidate();L.ACT.startSession({dataset:{day:'0',light:'0'}});
      const go=()=>{const s=L.state.draft.ex[0].sets[0];s.w=60;s.r=8;s.done=true;};if(L.act)L.act(go,{inProgress:true});else{go();L.saveNow();}},day);
    const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();return raw;};
  const raw=await begin('index.html');const here=JSON.parse(raw).draft;
  ok(here&&typeof here.begunAt==='number'&&typeof here.startedAt==='number','a workout begun here keeps when it was opened and when it began',here&&{startedAt:here.startedAt,begunAt:here.begunAt});
  const O=await open('baselines/r97.html',{browser,state:JSON.parse(raw),clock:'2026-11-11T10:30:00',realStarter:true});
  await O.page.evaluate(()=>window.__ironlog.saveNow());const back=JSON.parse(await O.page.evaluate(()=>localStorage.getItem('ironlog.v1'))).draft;await O.ctx.close();
  ok(back&&back.begunAt===here.begunAt&&back.startedAt===here.startedAt,'2.51 keeps both when it saves the workout, so the start comes back here',back&&{startedAt:back.startedAt,begunAt:back.begunAt});
  const old=JSON.parse(await begin('baselines/r97.html')).draft;
  const P=await open('index.html',{browser,state:{...JSON.parse(await begin('baselines/r97.html')),draft:old},clock:'2026-11-11T10:30:00',realStarter:true});
  const line=await P.page.evaluate(()=>{const L=window.__ironlog;L.ui.tab='today';L.render();const m=document.querySelector('#view .ph .meta');return {meta:m?m.innerText.trim():null,begunAt:L.state.draft.begunAt};});await P.ctx.close();
  ok(old&&old.begunAt===undefined&&/^Started 10:00 AM/.test(line.meta||'')&&line.begunAt===undefined,'a workout begun on 2.51 reads here as begun when it was opened, and is given no start of its own',{old:old&&old.begunAt,line});
}
// A lift's unit and the scale's (2.66, 390's Release B): a save from 2.65 has neither, and loads here with neither, its saved
// record byte for byte (so its sync hash is unchanged); one carrying them keeps each valid one and drops a value no build writes.
{
  const P=await open('baselines/r111.html',{browser,clock:'2026-11-14T10:00:00'});
  await P.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.makeDemo();L.state.draft=null;L.saveNow();});
  await P.page.waitForTimeout(300);
  const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  const N=await open('index.html',{browser,state:JSON.parse(raw),clock:'2026-11-14T10:00:00'});
  const r=await N.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();const saved=JSON.parse(localStorage.getItem('ironlog.v1'));return {units:saved.exercises.filter(e=>'unit' in e).length,bw:'bwUnit' in saved.settings,ex:JSON.stringify(saved.exercises),set:JSON.stringify(saved.settings)};});
  const o=JSON.parse(raw);
  ok(r.units===0&&!r.bw&&r.ex===JSON.stringify(o.exercises)&&r.set===JSON.stringify(o.settings),'r111: saved again here, no lift or scale given a unit, exercises and settings byte for byte',{units:r.units,bw:r.bw});
  await N.ctx.close();
  const S=JSON.parse(raw);
  S.exercises=S.exercises.map(e=>e.id==='bench'?{...e,unit:'kg'}:e.id==='dbCurl'?{...e,unit:'stone'}:e);S.settings.bwUnit='kg';
  const M=await open('index.html',{browser,state:S,clock:'2026-11-14T10:00:00'});
  const k=await M.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();const saved=JSON.parse(localStorage.getItem('ironlog.v1'));const ex=id=>saved.exercises.find(e=>e.id===id);return {bench:ex('bench').unit,curl:'unit' in ex('dbCurl'),bw:saved.settings.bwUnit};});
  ok(k.bench==='kg'&&!k.curl&&k.bw==='kg','a lift marked kg and the scale in kg are kept, saved again; a unit no build writes is dropped',k);
  ok(!M.errors.length&&!N.errors.length,'no console errors with units set',[...M.errors,...N.errors]);
  await M.ctx.close();
}
// The machine a session's lift was done on (2.67, 390 C): a save from 2.66 has none, and loads here with its sessions byte
// for byte (so their sync hashes are unchanged); one naming machines keeps each valid name, here and on 2.66 (which keeps a
// field it does not know, in its place), and drops one that is no name.
{
  const P=await open('baselines/r112.html',{browser,clock:'2026-11-14T10:00:00'});
  await P.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.makeDemo();L.state.draft=null;L.saveNow();});
  await P.page.waitForTimeout(300);
  const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  const N=await open('index.html',{browser,state:JSON.parse(raw),clock:'2026-11-14T10:00:00'});
  const r=await N.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();const saved=JSON.parse(localStorage.getItem('ironlog.v1'));return {mc:saved.sessions.reduce((a,s)=>a+s.ex.filter(b=>'mc' in b).length,0),ss:JSON.stringify(saved.sessions)};});
  const o=JSON.parse(raw);
  ok(r.mc===0&&r.ss===JSON.stringify(o.sessions),'r112: saved again here, no session given a machine, sessions byte for byte',{mc:r.mc});
  await N.ctx.close();
  const S=JSON.parse(raw);
  const s0=S.sessions[0],s1=S.sessions[1];
  s0.ex[0]={...s0.ex[0],mc:'0'};s1.ex[0]={...s1.ex[0],mc:{bad:1}};
  const M=await open('index.html',{browser,state:S,clock:'2026-11-14T10:00:00'});
  const k=await M.page.evaluate(([a,b])=>{const L=window.__ironlog;L.saveNow();const saved=JSON.parse(localStorage.getItem('ironlog.v1'));const f=id=>saved.sessions.find(s=>s.id===id).ex[0];return {a:f(a).mc,b:'mc' in f(b),keys:Object.keys(f(a))};},[s0.id,s1.id]);
  ok(k.a==='0'&&!k.b,'a machine named on a session is kept, saved again; one that is no name is dropped',k);
  const O=await open('baselines/r112.html',{browser,state:S,clock:'2026-11-14T10:00:00'});
  const old=await O.page.evaluate(a=>{const L=window.__ironlog;L.saveNow();const saved=JSON.parse(localStorage.getItem('ironlog.v1'));const e=saved.sessions.find(s=>s.id===a).ex[0];return {mc:e.mc,keys:Object.keys(e)};},s0.id);
  ok(old.mc==='0'&&JSON.stringify(old.keys)===JSON.stringify(k.keys),'2.66 keeps a session\'s machine when it saves, in the same place as here',{old,here:k.keys});
  ok(!M.errors.length&&!N.errors.length&&!O.errors.length,'no console errors with machines named',[...M.errors,...N.errors,...O.errors]);
  await M.ctx.close();await O.ctx.close();
}
// A lift's machines by name (2.70, NEW-168): a save from 2.69 names none, and loads here with its exercises byte for byte
// (their sync hashes unchanged); one naming machines keeps each name, trimmed, with its machine's key, and drops a name
// that is empty or no text, and a key no machine could have, as other names cutting one past 40 characters; 2.69 keeps the names, a field it does not know,
// in their place.
{
  const P=await open('baselines/r115.html',{browser,clock:'2026-11-15T10:00:00'});
  await P.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.onboarded=true;L.makeDemo();L.state.draft=null;L.saveNow();});
  await P.page.waitForTimeout(300);
  const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  const N=await open('index.html',{browser,state:JSON.parse(raw),clock:'2026-11-15T10:00:00'});
  const r=await N.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();const saved=JSON.parse(localStorage.getItem('ironlog.v1'));return {named:saved.exercises.filter(e=>'machines' in e).length,ex:JSON.stringify(saved.exercises)};});
  const o=JSON.parse(raw);
  ok(r.named===0&&r.ex===JSON.stringify(o.exercises),'r115: saved again here, no lift given machine names, exercises byte for byte',{named:r.named});
  await N.ctx.close();
  const S=JSON.parse(raw);
  const long='x'.repeat(41);
  S.exercises=S.exercises.map(e=>e.id==='machPress'?{...e,machines:{'0':'  Hammer   Strength ',s123:'Newtech','':'Nameless key',bad:7,blank:'  ',big:long}}:e.id==='legPress'?{...e,machines:'Booty Builder'}:e);
  const M=await open('index.html',{browser,state:S,clock:'2026-11-15T10:00:00'});
  const k=await M.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();const saved=JSON.parse(localStorage.getItem('ironlog.v1'));const ex=id=>saved.exercises.find(e=>e.id===id);return {press:ex('machPress').machines,leg:'machines' in ex('legPress'),keys:Object.keys(ex('machPress'))};});
  ok(JSON.stringify(k.press)===JSON.stringify({'0':'Hammer Strength',s123:'Newtech',big:'x'.repeat(40)})&&!k.leg,'a lift\'s machine names are kept, each in one line, a long one cut to 40 as other names are, saved again; an empty or non-text name, an empty key and names that are no list are dropped',k);
  const O=await open('baselines/r115.html',{browser,state:S,clock:'2026-11-15T10:00:00'});
  const old=await O.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();const saved=JSON.parse(localStorage.getItem('ironlog.v1'));const e=saved.exercises.find(x=>x.id==='machPress');return {has:'machines' in e,keys:Object.keys(e)};});
  ok(old.has&&JSON.stringify(old.keys)===JSON.stringify(k.keys),'2.69 keeps a lift\'s machine names when it saves, in the same place as here',{old,here:k.keys});
  ok(!M.errors.length&&!N.errors.length&&!O.errors.length,'no console errors with machines named by name',[...M.errors,...N.errors,...O.errors]);
  await M.ctx.close();await O.ctx.close();
}
// A 2.69 save whose sessions name no machine (a first machine, a second begun by a session marked new, and a free
// weight marked new at another gym) loads and saves here as it was, every session byte for byte, each lift read on the
// machines 2.69 read it on; 2.69 opens the log saved here on the same machines.
{
  const READ=()=>{const by=window.__ironlog.IDX().byEx;const read={};for(const id of ['machPress','legPress','latPulldown','bench'])read[id]=(by[id]||[]).map(x=>[x.sid,x.mk]);return read;};
  const P=await open('baselines/r115.html',{browser,clock:'2026-11-15T10:00:00'});
  const base=await P.page.evaluate(READ=>{const L=window.__ironlog;L.state.settings.onboarded=true;const LB=0.45359237;const mk=(id,date,blocks)=>({id,date,dayIdx:0,dayId:null,dayName:'Session',routineId:'',notes:'',free:true,ex:blocks.map(([exId,w,more])=>({exId,rr:[8,12],sets:[11,11,10].map(r=>({w:w*LB,r,rir:2,done:true})),...(more||{})}))});
    L.state.sessions=[mk('a1','2026-10-03',[['machPress',200],['bench',185]]),mk('a2','2026-10-10',[['machPress',205],['legPress',300]]),mk('a3','2026-10-17',[['machPress',120,{nw:true}],['bench',165,{nw:true}]]),mk('a4','2026-10-24',[['machPress',125],['legPress',310],['bench',170]]),mk('a5','2026-10-31',[['machPress',130],['latPulldown',140]])];
    L.state=L.normalize(L.state);L.invalidate();L.saveNow();return {raw:localStorage.getItem('ironlog.v1'),read:new Function('return ('+READ+')')()()};},READ.toString());
  await P.ctx.close();
  const N=await open('index.html',{browser,state:JSON.parse(base.raw),clock:'2026-11-15T10:00:00'});
  const here=await N.page.evaluate(READ=>{const L=window.__ironlog;L.saveNow();return {saved:JSON.parse(localStorage.getItem('ironlog.v1')),read:new Function('return ('+READ+')')()()};},READ.toString());
  const o=JSON.parse(base.raw);
  const brief=xs=>xs.map(q=>q.id+' '+q.ex.map(b=>b.exId+':'+(b.mc||'-')).join(' '));
  ok(JSON.stringify(here.saved.sessions)===JSON.stringify(o.sessions),'a 2.69 save loads and saves here as it was, every session byte for byte, none given a machine',{here:brief(here.saved.sessions),r115:brief(o.sessions)});
  ok(JSON.stringify(here.read)===JSON.stringify(base.read),'and reads every lift on the machines 2.69 read it on',{here:here.read,r115:base.read});
  ok(JSON.stringify(here.saved.exercises)===JSON.stringify(o.exercises)&&JSON.stringify(here.saved.settings)===JSON.stringify(o.settings),'its exercises and settings byte for byte');
  await N.ctx.close();
  const O=await open('baselines/r115.html',{browser,state:here.saved,clock:'2026-11-15T10:00:00'});
  const back=await O.page.evaluate(READ=>{const L=window.__ironlog;L.saveNow();return {read:new Function('return ('+READ+')')()(),sessions:JSON.parse(localStorage.getItem('ironlog.v1')).sessions};},READ.toString());
  ok(JSON.stringify(back.read)===JSON.stringify(base.read)&&JSON.stringify(back.sessions)===JSON.stringify(here.saved.sessions),'2.69 opens the log saved here on the same machines and saves its sessions as they are',{back:back.read});
  ok(!N.errors.length&&!O.errors.length,'no console errors reading machines in a 2.69 log',[...N.errors,...O.errors]);
  await O.ctx.close();
}
// Every load's unit (2.73): a save from 2.72 holds each load in kilograms alone, its unit read back from the number at
// every read. Opened here, each set and each number set on a lift (its step, heaviest load, goal and bar) and the bar in
// settings has the unit its number lies on the 0.05 steps of, last among its fields; saved, a unit its number gives is
// left out (merge.ts storedJson), so the save is the one 2.72 made, byte for byte, and nothing is sent again. A unit
// its number does not give (a load typed as 61.37 kg, on neither unit's steps) is saved, and 2.72 keeps it in its
// place. Every load stays as it was, and so does every number read from the log: the PR list, All-time bests, the
// weekly sets, each lift's next target and History's sets.
{
  const SEED=LB=>{const L=window.__ironlog;const S=L.state;S.settings.onboarded=true;S.settings.unit='lb';L.makeDemo();S.draft=null;
    // A bench marked kg in the lb app, with sets typed in kg and one in lb, one on neither unit's steps with its unit, and a dumbbell lift with its own numbers.
    const set=(w,r,more)=>({w,r,rir:2,warm:false,drop:false,...(more||{})});
    const day=(id,date,ex)=>({id,date,dayIdx:0,dayName:'Mine',routineId:'',free:true,notes:'',ex});
    S.sessions.push(day('k1','2026-09-15',[{exId:'bench',rr:[6,10],sets:[set(100,8),set(100,8),set(102.5,6)]},{exId:'dbCurl',rr:[8,12],sets:[set(25*LB,12),set(27.5*LB,10)]}]),
      day('k2','2026-09-22',[{exId:'bench',rr:[6,10],sets:[set(102.5,8),set(225*LB,5),set(61.37,8,{u:'kg'})]},{exId:'dbCurl',rr:[8,12],sets:[set(30*LB,10)]}]));
    const e=id=>S.exercises.find(x=>x.id===id);
    Object.assign(e('bench'),{unit:'kg',inc:2.5,maxLoad:180,goal:{w:120,r:5},barKg:15});
    Object.assign(e('dbCurl'),{inc:5*LB,maxLoad:60*LB,goal:{w:40*LB,r:8}});
    S.settings.barKg=45*LB;
    L.state=L.normalize(S);L.invalidate();L.saveNow();};
  const P=await open('baselines/r118.html',{browser,clock:'2026-09-26T10:00:00'});
  await P.page.evaluate(SEED,LBK);await P.page.waitForTimeout(300);
  const was=await P.page.evaluate(READ);
  const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  const N=await open('index.html',{browser,state:JSON.parse(raw),clock:'2026-09-26T10:00:00'});
  const now=await N.page.evaluate(READ);
  const mem=await N.page.evaluate(()=>{const S=window.__ironlog.state;return {sessions:S.sessions.filter(x=>/^k/.test(x.id)).map(x=>({id:x.id,u:x.ex.map(b=>b.sets.map(q=>q.u||null)),last:x.ex.map(b=>b.sets.map(q=>Object.keys(q).pop()))})),ex:['bench','dbCurl'].map(id=>{const e=S.exercises.find(x=>x.id===id);return {u:[e.incU||null,e.maxLoadU||null,e.goalU||null,e.barU||null],last:Object.keys(e).slice(-6).join()};}),bar:S.settings.barU||null};});
  const saved=await N.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();return localStorage.getItem('ironlog.v1');});
  const o=JSON.parse(raw);
  const k=id=>mem.sessions.find(x=>x.id===id);
  ok(JSON.stringify(k('k1').u)==='[["kg","kg","kg"],["lb","lb"]]'&&JSON.stringify(k('k2').u)==='[["kg","lb","kg"],["lb"]]'&&k('k2').last.flat().every(x=>x==='u'),'r118: opened here, each set has the unit its load lies on (100 and 102.5 in kg, 225 lb in lb on the same bench, the curls in lb) and 61.37 its own kg, last among its fields',mem.sessions);
  ok(JSON.stringify(mem.ex[0].u)==='["kg","kg","kg","kg"]'&&JSON.stringify(mem.ex[1].u)==='["lb","lb","lb",null]'&&mem.ex[0].last==='incU,maxLoadU,barU,goalU,machineU,equipOwn'&&mem.bar==='lb','r118: a lift\'s step, heaviest load, goal and bar each have the unit its number lies on, last among the lift\'s fields but its machines\' units (2.74) and the lifter\'s pick of a refiled lift\'s equipment (2.75); the bar in settings too',mem);
  ok(saved===raw,'r118: saved again here, the log is 2.72\'s save byte for byte: each unit its number gives left out, the one it does not give (61.37 kg) kept, nothing to send again',{same:saved===raw});
  ok(JSON.parse(saved).sessions.find(x=>x.id==='k2').ex[0].sets[2].u==='kg','r118: the unit a number does not give is in the save',{});
  ok(JSON.stringify(now.w)===JSON.stringify(was.w),'r118: every load read here is the load 2.72 read',{});
  ok(JSON.stringify(now.prs)===JSON.stringify(was.prs),'r118: the PR list is the one 2.72 read, set for set',{now:now.prs.length,was:was.prs.length});
  ok(JSON.stringify(now.bests)===JSON.stringify(was.bests),'r118: All-time bests are 2.72\'s, every heaviest set, estimate and rep record',{now:now.bests.bench,was:was.bests.bench});
  ok(JSON.stringify(now.rolling)===JSON.stringify(was.rolling),'r118: the weekly sets are 2.72\'s',{now:now.rolling,was:was.rolling});
  ok(JSON.stringify(now.next)===JSON.stringify(was.next),'r118: every lift\'s next target is 2.72\'s, load and words',Object.keys(now.next).filter(k=>JSON.stringify(now.next[k])!==JSON.stringify(was.next[k])).map(k=>[k,now.next[k],was.next[k]]));
  ok(now.history===was.history,'r118: History lists every set as 2.72 did',{now:now.history.slice(0,300),was:was.history.slice(0,300)});
  await N.ctx.close();
  // A log made here with a set typed off every unit's steps (61.37 kg on a bench in lb), opened on 2.72 and saved
  // there: the unit is kept in its place, and back here it reads as typed.
  const M=await open('index.html',{browser,state:JSON.parse(raw),clock:'2026-09-26T10:00:00'});
  const made=await M.page.evaluate(()=>{const L=window.__ironlog;L.act(()=>{const s=L.state.sessions.find(x=>x.id==='k1');s.ex[0].sets.push({w:61.37,r:6,rir:2,warm:false,drop:false,u:'kg'});});L.saveNow();return localStorage.getItem('ironlog.v1');});
  await M.ctx.close();
  const O=await open('baselines/r118.html',{browser,state:JSON.parse(made),clock:'2026-09-26T10:00:00'});
  const back=await O.page.evaluate(()=>{const L=window.__ironlog;L.state.settings.userName='Phone two';L.saveNow();return JSON.parse(localStorage.getItem('ironlog.v1'));});
  await O.ctx.close();
  const madeS=JSON.parse(made).sessions;
  ok(JSON.stringify(back.sessions)===JSON.stringify(madeS)&&back.sessions.find(x=>x.id==='k1').ex[0].sets[3].u==='kg','2.72 keeps the unit a number does not give when it saves, in its place: every session byte for byte',{});
  const B=await open('index.html',{browser,state:back,clock:'2026-09-26T10:00:00'});
  const again=await B.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();const s=L.state.sessions.find(x=>x.id==='k1');return {saved:JSON.parse(localStorage.getItem('ironlog.v1')),line:L.setStr(L.EX('bench'),s.ex[0].sets[3])};});
  ok(JSON.stringify(again.saved.sessions)===JSON.stringify(back.sessions)&&JSON.stringify(again.saved.exercises)===JSON.stringify(back.exercises)&&/^61\.4 kg×6/.test(again.line),
    'and back here the log saves as 2.72 left it, and 61.37 reads in kg, as typed (to a tenth: on no unit\'s steps)',{line:again.line});
  ok(!N.errors.length&&!M.errors.length&&!O.errors.length&&!B.errors.length,'no console errors reading a save from 2.72 with its units',[...N.errors,...M.errors,...O.errors,...B.errors]);
  await B.ctx.close();
}
// A weekly target typed before r58 (2.73, the full review's L01-5): stored as its numbers alone, it is the lifter's when
// it differs from the app's own on a muscle outside the ones with a target by default, as every build read it, at every
// read. Opened here it is recorded as the lifter's once, at start, beside the targets Set a target records: so a later
// change of the app's own number (a focus set in Your training brings forearms' own from 4 to 12 down to 2 to 12) leaves
// it the lifter's. Read from its number, the 2 to 12 typed became the app's and stopped counting. Opened again, nothing
// moves; a target typed on one of the four tracked since r29, which never counted, is not recorded.
{
  const P=await open('baselines/r57.html',{browser,clock:'2026-10-24T10:00:00'});
  await P.page.evaluate(()=>{const L=window.__ironlog;const S=L.state;S.settings.onboarded=true;S.settings.bands.forearms=[2,12];S.settings.bands.serratus=[3,6];L.saveNow();});
  const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
  const N=await open('index.html',{browser,state:JSON.parse(raw),clock:'2026-10-24T10:00:00'});
  const r=await N.page.evaluate(()=>{const L=window.__ironlog;const S=L.state;const own=(S.settings.ownTargets||[]).slice(),before={forearms:L.hasTarget('forearms'),serratus:L.hasTarget('serratus')};
    S.settings.profile={...(S.settings.profile||{}),focus:['traps']};L.invalidate();
    return {own,before,app:L.appBand('forearms').join('-'),after:L.hasTarget('forearms'),band:S.settings.bands.forearms.join('-'),saved:(JSON.parse(localStorage.getItem('ironlog.v1')).settings.ownTargets||[]).slice()};});
  ok(r.own.join()==='forearms'&&r.saved.join()==='forearms'&&r.before.forearms&&!r.before.serratus,'r57: forearms typed as 2 to 12 is recorded as the lifter\'s target at start, and saved; serratus typed as 3 to 6, which never counted, is not',r);
  ok(r.app==='2-12'&&r.band==='2-12'&&r.after,'r57: with a focus set, the app\'s own forearms target is 2 to 12 too, and the one typed still counts as the lifter\'s',r);
  const raw2=await N.page.evaluate(()=>{const L=window.__ironlog;delete L.state.settings.profile;L.invalidate();L.saveNow();return localStorage.getItem('ironlog.v1');});await N.ctx.close();
  const B=await open('index.html',{browser,state:JSON.parse(raw2),clock:'2026-10-24T10:00:00'});
  const b=await B.page.evaluate(()=>{const L=window.__ironlog;return {own:(L.state.settings.ownTargets||[]).join(),saved:localStorage.getItem('ironlog.v1')};});
  ok(b.own==='forearms'&&b.saved===raw2,'opened again, nothing moves: the target is recorded once',{own:b.own,same:b.saved===raw2});
  ok(!N.errors.length&&!B.errors.length,'no console errors recording a target typed before r58',[...N.errors,...B.errors]);
  await B.ctx.close();
}
// The Preacher Curl refiled with the barbells (2.75, V's decision 4 of 2026-11-17, the full review's L01-6): done on an
// EZ bar more often than on a machine. A save from 2.74 holds the library's old equipment (machine) on the lift: opened
// here it reads as a barbell lift, so it has no Machine sheet, and its sessions stay as saved; one the lifter refiled
// in the exercise editor (dumbbells) stays as set. Saved again, the log is 2.74's byte for byte (merge.ts savedEquip:
// the refile rewrites no log, so it never clashes with an edit an older phone made, the review's REV27-1).
{
  const SEED=({LB,equip})=>{const L=window.__ironlog;const S=L.state;S.settings.onboarded=true;S.settings.unit='lb';
    const day=(id,date,w)=>({id,date,dayIdx:0,dayName:'Arms',routineId:'',free:true,notes:'',ex:[{exId:'preacher',rr:[8,12],sets:[10,10,9].map(r=>({w:w*LB,r,rir:2,warm:false,drop:false}))}]});
    S.sessions.push(day('pc1','2026-09-15',60),day('pc2','2026-09-22',65));
    if(equip)S.exercises.find(x=>x.id==='preacher').equip=equip;
    L.state=L.normalize(S);L.invalidate();L.saveNow();};
  for(const equip of [null,'dumbbell']){
    const P=await open('baselines/r120.html',{browser,clock:'2026-09-26T10:00:00'});
    await P.page.evaluate(SEED,{LB:LBK,equip});await P.page.waitForTimeout(300);
    const raw=await P.page.evaluate(()=>localStorage.getItem('ironlog.v1'));await P.ctx.close();
    const o=JSON.parse(raw);
    const N=await open('index.html',{browser,state:o,clock:'2026-09-26T10:00:00'});
    const got=await N.page.evaluate(()=>{const L=window.__ironlog;const e=L.state.exercises.find(x=>x.id==='preacher');L.saveNow();const saved=JSON.parse(localStorage.getItem('ironlog.v1'));
      return {equip:e.equip,saved,ids:L.state.sessions.filter(x=>/^pc/.test(x.id)).map(x=>x.id).join()};});
    const before=o.exercises.find(x=>x.id==='preacher'),after=got.saved.exercises.find(x=>x.id==='preacher');
    const rest=a=>JSON.stringify({...a,exercises:a.exercises.filter(x=>x.id!=='preacher')});
    const want=equip||'barbell';
    ok(got.equip===want&&JSON.stringify(after)===JSON.stringify(before),`r120 (${equip?'set to dumbbells by the lifter':'as the library gave it'}): the Preacher Curl reads on ${want} here, and is saved as 2.74 saved it`,{equip:got.equip,before,after});
    ok(got.ids==='pc1,pc2'&&JSON.stringify(got.saved.sessions)===JSON.stringify(o.sessions)&&rest(got.saved)===rest(o),`r120 (${equip||'library'}): every session, and everything else in the log, saved as 2.74 saved it`,{});
    const M=await open('index.html',{browser,state:got.saved,clock:'2026-09-26T10:00:00'});
    const again=await M.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();return localStorage.getItem('ironlog.v1');});
    ok(again===JSON.stringify(got.saved)||JSON.stringify(JSON.parse(again))===JSON.stringify(got.saved),`r120 (${equip||'library'}): opened again, nothing moves`,{});
    ok(!N.errors.length&&!M.errors.length,'no console errors reading the refiled Preacher Curl',[...N.errors,...M.errors]);
    await N.ctx.close();await M.ctx.close();
  }
}
// The refiled Preacher Curl's machines (the review's REV27-5 and REV27-6). A lifter on 2.74 who did it on two machines
// (the first at 80 lb, a second begun Oct 27 at 50 lb, back on the first since Nov 3): after the update a workout on
// the first machine, and an edit of the Nov 3 session, are saved on the first machine, so nothing is read on the second
// and 80 x 10 again is no PR. Machine picked for it in the exercise editor stays picked when the app is opened again.
{
  const SEED=({LB})=>{const L=window.__ironlog;const S=L.state;S.settings.onboarded=true;S.settings.unit='lb';S.settings.autoDone=false;S.settings.rirMode='off';
    const mk=(id,date,lb,reps,more)=>({id,date,dayIdx:0,dayName:'Arms',routineId:'',free:true,notes:'',ex:[{exId:'preacher',rr:[8,12],sets:[reps,reps,reps].map(r=>({w:lb*LB,r,rir:2,warm:false,drop:false})),...more}]});
    S.sessions.push(mk('pm1','2026-10-20',80,10,{mc:'0'}),mk('pm2','2026-10-23',80,10,{mc:'0'}),mk('pm3','2026-10-27',50,12,{nw:true,mc:'pm3'}),
      mk('pm4','2026-10-30',50,12,{mc:'pm3'}),mk('pm5','2026-11-03',80,10,{mc:'0'}),mk('pm6','2026-11-06',80,10,{mc:'0'}));
    L.state=L.normalize(S);L.invalidate();L.saveNow();};
  const P=await open('baselines/r120.html',{browser,clock:'2026-11-10T10:00:00'});
  await P.page.evaluate(SEED,{LB:LBK});await P.page.waitForTimeout(300);
  const o=JSON.parse(await P.page.evaluate(()=>localStorage.getItem('ironlog.v1')));await P.ctx.close();
  const READ_PC=()=>{const L=window.__ironlog;const I=L.IDX();
    return {equip:L.EX('preacher').equip,on:(I.byEx.preacher||[]).map(x=>x.sid+':'+x.mk).join(' '),
      named:L.state.sessions.filter(s=>s.ex.some(b=>b.exId==='preacher')).map(s=>s.id+':'+(s.ex[0].mc||'-')).join(' '),
      prs:I.prs.filter(p=>p.exId==='preacher').map(p=>p.sid+' '+p.type).join()};};
  const closeAll=async page=>{for(let k=0;k<8;k++){const m=await page.evaluate(()=>{const m=window.__ironlog.ui.modal;return m?m.kind:null;});if(!m)break;
    if(m==='confirm')await page.click('#modal [data-act="mOk"]');else await page.evaluate(()=>window.__ironlog.ACT.mClose());await page.waitForTimeout(250);}};
  // A workout on the first machine: the Preacher Curl added to a blank session, 80 lb x 10 ticked once, Finish.
  const N=await open('index.html',{browser,state:o,clock:'2026-11-10T10:00:00'});
  const was=await N.page.evaluate(READ_PC);
  await N.page.evaluate(()=>window.__ironlog.ACT.startFree({dataset:{}}));await N.page.waitForTimeout(300);
  await N.page.evaluate(()=>{const L=window.__ironlog;if(L.ui.modal)L.ACT.mClose();L.openModal({kind:'picker',mode:'addBlock',title:'Add exercise to session',q:'',m:''});});await N.page.waitForTimeout(250);
  await N.page.click('#modal [data-act="pickDo"][data-ex="preacher"]');await N.page.waitForTimeout(350);
  const on=await N.page.evaluate(()=>({shown:window.__ironlog.draftMachine('preacher'),saved:window.__ironlog.machineToSave('preacher')}));
  const f=k=>`#view input[data-f="${k}"][data-b="0"][data-s="0"]`;
  await N.page.fill(f('w'),'80');await N.page.fill(f('r'),'10');await N.page.waitForTimeout(500);
  await N.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]');await N.page.waitForTimeout(400);
  await N.page.click('#view [data-act="finish"]');await N.page.waitForTimeout(400);await closeAll(N.page);
  const done=await N.page.evaluate(READ_PC);
  const sid=await N.page.evaluate(()=>{const s=window.__ironlog.state.sessions.find(x=>!/^pm/.test(x.id)&&x.ex.some(b=>b.exId==='preacher'));return s?s.id:null;});
  ok(was.equip==='barbell'&&was.on==='pm1:0 pm2:0 pm3:pm3 pm4:pm3 pm5:0 pm6:0','r120 (two machines): the Preacher Curl reads as a barbell lift, its sessions on the machines they name',was);
  ok(on.shown==='0'&&on.saved==='0','r120 (two machines): the workout is on the first machine, and the first machine is the one it is saved on',on);
  ok(!!sid&&done.named.endsWith(sid+':0')&&done.on.endsWith(sid+':0')&&!done.prs.includes(sid),'r120 (two machines): 80 lb x 10 on the first machine is saved and read on it, and is no PR',{sid,done});
  // The Nov 3 session opened from History, one set's reps corrected (10 to 9), saved.
  await N.page.evaluate(()=>{const L=window.__ironlog;L.ui.tab='history';L.ui.histOpen='pm5';L.render();});await N.page.waitForTimeout(250);
  await N.page.click('#view [data-act="histEdit"][data-id="pm5"]');await N.page.waitForTimeout(400);
  const edOn=await N.page.evaluate(()=>window.__ironlog.draftMachine('preacher'));
  await N.page.fill(f('r'),'9');await N.page.waitForTimeout(600);
  await N.page.click('#view [data-act="finish"]');await N.page.waitForTimeout(400);await closeAll(N.page);
  const ed=await N.page.evaluate(()=>{const s=window.__ironlog.state.sessions.find(x=>x.id==='pm5');return {mc:s.ex[0].mc||null,reps:s.ex[0].sets.map(q=>q.r).join()};});
  const edRead=await N.page.evaluate(READ_PC);
  ok(edOn==='0'&&ed.mc==='0'&&ed.reps==='9,10,10'&&edRead.on.includes('pm5:0')&&!edRead.prs.includes('pm5'),'r120 (two machines): the Nov 3 session edited stays on the first machine, and is no PR',{edOn,ed,edRead});
  ok(!N.errors.length,'no console errors on the refiled Preacher Curl\'s machines',N.errors);
  // Machine picked for it in the exercise editor: saved as the lifter's, and read as a machine lift when opened again.
  await N.page.evaluate(()=>{const A=window.__ironlog;A.ACT.exEdit({dataset:{ex:'preacher'}});const sel=document.querySelector('[data-ebind="equip"]');
    sel.value='machine';sel.dispatchEvent(new Event('change',{bubbles:true}));A.ACT.exSave();});await N.page.waitForTimeout(300);
  const picked=await N.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();const st=JSON.parse(localStorage.getItem('ironlog.v1'));const e=st.exercises.find(x=>x.id==='preacher');
    return {now:L.EX('preacher').equip,saved:e.equip,own:e.equipOwn===true,st};});
  await N.ctx.close();
  const M=await open('index.html',{browser,state:picked.st,clock:'2026-11-10T10:00:00'});
  const back=await M.page.evaluate(()=>window.__ironlog.EX('preacher').equip);
  ok(picked.now==='machine'&&picked.saved==='machine'&&picked.own&&back==='machine','Machine picked for the refiled Preacher Curl in the editor stays picked when the app is opened again',{now:picked.now,saved:picked.saved,own:picked.own,back});
  await M.page.evaluate(()=>{const A=window.__ironlog;A.ACT.exEdit({dataset:{ex:'preacher'}});const sel=document.querySelector('[data-ebind="equip"]');
    sel.value='barbell';sel.dispatchEvent(new Event('change',{bubbles:true}));A.ACT.exSave();});await M.page.waitForTimeout(300);
  const unpicked=await M.page.evaluate(()=>{const L=window.__ironlog;L.saveNow();const e=JSON.parse(localStorage.getItem('ironlog.v1')).exercises.find(x=>x.id==='preacher');return {now:L.EX('preacher').equip,saved:e.equip,own:'equipOwn' in e};});
  ok(unpicked.now==='barbell'&&unpicked.saved==='machine'&&!unpicked.own,'Barbell picked back is the library\'s again: saved as 2.74 saves the library\'s, with no mark',unpicked);
  ok(!M.errors.length,'no console errors picking the Preacher Curl\'s equipment',M.errors);
  await M.ctx.close();
}
console.log(fails.length?'FAILURES '+fails.length:'ALL PASS');await browser.close();})();
