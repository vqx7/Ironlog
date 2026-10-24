// Migration: saves made by the previous builds load with nothing lost.
const {open}=require('./h');const { engine } = require('./h');
const fails=[];const ok=(c,m,x)=>{if(!c){fails.push(m);console.log('FAIL',m,JSON.stringify(x));}else console.log('ok  ',m,x!==undefined?JSON.stringify(x).slice(0,200):'');};
(async()=>{const browser=await engine.launch();
for(const [file,label] of [['baselines/r56-1.html','r56.1'],['baselines/r56.html','r56'],['baselines/r55.html','r55'],['baselines/r54.html','r54'],['baselines/r53.html','r53'],['baselines/r52.html','r52'],['baselines/r51.html','r51'],['baselines/r50.html','r50'],['baselines/r49.html','r49'],['baselines/r48.html','r48'],['baselines/r47.html','r47'],['baselines/r46.html','r46'],['baselines/r45.html','r45'],['baselines/r44.html','r44'],['baselines/r43.html','r43'],['baselines/r42.html','r42'],['baselines/r41.html','r41'],['baselines/r40.html','r40'],['baselines/r39.html','r39'],['baselines/r38.html','r38'],['baselines/r37.html','r37'],['baselines/r36.html','r36'],['baselines/r35.html','r35'],['baselines/r34-2.html','r34.2'],['baselines/r34-1.html','r34.1'],['baselines/r34.html','r34'],['baselines/r32-1.html','r32.1'],['baselines/r32.html','r32'],['baselines/r31-3.html','r31.3'],['baselines/r31-2.html','r31.2'],['baselines/r31-1.html','r31.1'],['baselines/r31.html','r31'],['baselines/r30-2.html','r30.2'],['baselines/r30.html','r30'],['baselines/r29-5.html','r29.5'],['baselines/r29.html','r29.4'],['baselines/r28.html','r28'],['baselines/r27.html','r27'],['baselines/r26.html','r26'],['baselines/r25.html','r25'],['baselines/r24.html','r24'],['baselines/r23.html','r23'],['baselines/r22.html','r22'],['baselines/r21.html','r21'],['baselines/r20.html','r20'],['baselines/r19.html','r19'],['baselines/r18.html','r18'],['baselines/r17.html','r17'],['baselines/r16.html','r16'],['baselines/r15.html','r15'],['baselines/r14.html','r14'],['baselines/r13.html','r13'],['baselines/r12.html','r12'],['baselines/r11.html','r11']]){
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
  await N.ctx.close();
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
  ok(r.same===made.saved,'r53\'s saved session with its trimmed bench press loads byte for byte, mark and all (its sync hash unchanged)',[r.same.slice(0,160),made.saved.slice(0,160)]);
  ok(r.draftCut&&r.full===undefined,'the session in progress keeps its trimmed mark as saved, with no count added',r);
  ok(r.short==='sets'&&r.light===false,'and the one rule reads the trimmed bench press: fewer sets than its usual four, so its target repeats while its trend counts',r);
  ok(!N.errors.length,'no console errors loading r53\'s trimmed sessions',N.errors);
  await N.ctx.close();
}
// r55 records on each session the sessions a week its routine planned (pw), read for that week after the routine changes. A valid
// one is kept and an invalid one dropped on load; a phone still on r54 keeps it when it saves (keepExtra), in its place, so after
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
console.log(fails.length?'FAILURES '+fails.length:'ALL PASS');await browser.close();})();
