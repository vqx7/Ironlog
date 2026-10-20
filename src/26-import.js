/* ---------- importing workouts (r23, PENDING 65 and V's 2026-09-28 ask) ----------
   Any log a person already keeps comes in the same way: text pasted from
   Notes (or copied from a photo of a handwritten log with the iPhone's Live
   Text), a spreadsheet (a CSV or .xlsx file, or cells copied and pasted),
   and the CSV exports of Strong and Hevy. An Ironlog backup still restores
   the whole log (importData). Nothing is saved until the preview is
   confirmed: it shows what was understood, the unit, which library exercise
   each name was matched to (changeable, or a new custom exercise), lines that
   were not understood, and sessions already in the log, which are skipped so
   importing the same file twice adds nothing. Imported sessions are
   freestyle sessions, so they never move a routine's "next up". Undo reverses
   the whole import. Numbers stay in the file's unit until the preview. */
function impMatch(name){
  const a=new Set(impNorm(name));if(!a.size)return [];
  const out=[];const EQW={db:'dumbbell',bb:'barbell',cable:'cable',machine:'machine',smith:'smith'};
  // An alias by the name alone, or by the name without its equipment word when the equipment agrees ("Deadlift (Barbell)").
  let al=IMP_ALIAS[[...a].join(' ')];
  if(!al){const eq=[...a].filter(w=>EQW[w]);const bare=[...a].filter(w=>!EQW[w]).join(' ');const c=IMP_ALIAS[bare];if(c&&eq.length===1&&state.exercises.some(e=>e.id===c&&e.equip===EQW[eq[0]]))al=c;}
  if(!(al&&state.exercises.some(e=>e.id===al&&!e.archived)))al=null;else out.push({id:al,sc:1});
  // Words that make a different exercise: one side having it and the other not costs a lot.
  const MOD=['incline','decline','reverse','seated','standing','lying','single','one','close','wide','front','rear','hammer','preacher','sumo','rdl','hack','split','bulgarian','goblet','overhead','assisted','weighted','deficit','pause','spider','concentration','upright','face'];
  for(const e of state.exercises){if(e.archived)continue;const b=new Set(impNorm(e.name));if(!b.size)continue;let hit=0;for(const w of a)if(b.has(w))hit++;if(!hit)continue;
    const union=new Set([...a,...b]).size;let sc=hit/union;
    // Equipment named on one side and a different one on the other is a different exercise.
    const eq=['db','bb','cable','machine','smith'];const ea=eq.filter(w=>a.has(w)),eb=eq.filter(w=>b.has(w));if(ea.length&&eb.length&&!ea.some(w=>eb.includes(w)))sc*=0.5;
    for(const w of MOD)if(a.has(w)!==b.has(w))sc*=0.7;
    if(e.id!==al)out.push({id:e.id,sc});}
  return out.sort((x,y)=>y.sc-x.sc).slice(0,8);
}
/* Free text: a date line starts a day; each other line is an exercise name
   followed by its sets, or sets alone continuing the exercise above, or a
   name alone with its sets on the next lines (impSetsText reads the sets). */
function impFromText(text){
  const lines=String(text).split(/\r?\n/);const S=[];let cur=null,ex=null,pend=null,hint=null;const unread=[];
  const day=(date,name)=>{if(pend)unread.push(pend.raw);cur={date,name:name||'',items:[]};S.push(cur);ex=null;pend=null;};
  const raw=v=>v;
  const nextIsName=i=>{for(let j=i+1;j<lines.length;j++){const t=lines[j].trim();if(t)return /^[\s\-•*–]*[a-z]{3,}/i.test(t)&&!impDate(t);}return true;};
  const REPS=/^\d{1,2}(\s*[/,]\s*\d{1,2})+$/;
  for(let li=0;li<lines.length;li++){const L0=lines[li];const L=L0.replace(/^[\s\-•*–]+/,'').trim();if(!L)continue;
    const under=li>0&&!!lines[li-1].trim();
    if(/\bkgs?\b|\dkg/i.test(L))hint=hint||'kg';else if(/\blbs?\b|\dlb|#/i.test(L))hint=hint||'lb';
    const words=L.split(/\s+/);
    // A date line: a date and no sets on it; what is left may be the workout's name.
    let dt=impDate(L);
    // Only numbers and slashes after an exercise, with sets (not a new exercise) after: reps, not a date.
    if(dt&&(ex||pend)&&/^[\d\s/.,-]+$/.test(L)&&!nextIsName(li))dt=null;
    // "Bench press 185" then "10/10/10": the line under a lone load is its reps, even when it could be a date.
    const lone=ex&&ex.setsText.length&&/^\d{2,}(\.\d+)?$/.test(ex.setsText[ex.setsText.length-1].trim());
    if(lone&&REPS.test(L)){ex.setsText[ex.setsText.length-1]+=' '+L;continue;}
    // Numbers directly under a lift still waiting for its sets (no blank line between) are its reps.
    if(dt&&pend&&under&&REPS.test(L))dt=null;
    if(dt){const rest=L.replace(/\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b/ig,'').replace(/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}([/.-]\d{2,4})?\b|\b\d{1,2}(st|nd|rd|th)?\s+[a-z]{3,9}\.?,?(\s*\d{4})?\b|\b[a-z]{3,9}\.?\s+\d{1,2}(st|nd|rd|th)?(,?\s*\d{4})?\b/ig,'').replace(/[,:;\-–|]+/g,' ').trim();
      if(!/\d/.test(rest)){day(dt,rest);continue;}}
    // Sets alone continue the exercise above, or the name waiting on the line before.
    const target=ex||pend;
    const alone=parseSets(impSetsText(L),{bw:true},null,raw);
    if(alone&&target&&!/[a-z]{3,}/i.test(L.replace(/\b(bw|x|at|for|rir|reps?|sets?|of|lbs?|kgs?|sec|secs|seconds)\b/ig,''))){
      const p=pend;if(!cur){pend=null;day(null,'');}if(p&&target===p){ex={name:p.name,sets:[],setsText:[]};cur.items.push(ex);pend=null;}
      ex.setsText.push(L);continue;}
    // Name then sets: the shortest name whose remainder reads as sets, so no set is read as part of the name.
    let done=false;
    for(let i=1;i<words.length;i++){const name=words.slice(0,i).join(' ').replace(/[:\-–]+$/,'').trim();const rest=words.slice(i).join(' ');
      if(!/[a-z]/i.test(name))continue;const got=parseSets(impSetsText(rest),{bw:true},null,raw);
      if(got){if(!cur)day(null,'');ex={name,sets:[],setsText:[rest]};cur.items.push(ex);pend=null;done=true;break;}}
    if(done)continue;
    // A name then a load, with the reps on the line right under it: "Bench press 185" then "10/10/10".
    {const g=L.match(/^(.*?[a-z].*?)\s+(\d{2,}(?:\.\d+)?\s*(?:lbs?|kgs?|#)?)$/i);const nx=(lines[li+1]||'').replace(/^[\s\-•*–]+/,'').trim();
      if(g&&REPS.test(nx)){if(!cur)day(null,'');if(pend)unread.push(pend.raw);pend=null;ex={name:g[1].replace(/[:\-–]+$/,'').trim(),sets:[],setsText:[g[2]+' '+nx]};cur.items.push(ex);li++;continue;}}
    // A name alone: its sets may follow on the next lines.
    if(/[a-z]{3,}/i.test(L)&&!/\d{2,}\s*[x×*]/.test(L)){if(pend)unread.push(pend.raw);pend={name:L.replace(/[:\-–]+$/,'').trim(),raw:L0.trim()};ex=null;continue;}
    unread.push(L0.trim());
  }
  if(pend)unread.push(pend.raw);
  return {sessions:S.filter(x=>x.items.length).map(x=>({date:x.date,name:x.name,items:x.items})),unit:hint,skipped:0,cardio:0,unread:unread.slice(0,50),unreadN:unread.length,text:true};
}
/* Sets from text are read once the exercise is known, so a bodyweight lift
   may have reps alone. The unit is applied at the end. */
function impTextSets(it,exo,conv){const out=[];let defW=null;
  for(const t of it.setsText){let st=impSetsText(t);const lu=/(?:\b|\d)kgs?(?![a-wyz])/i.test(t)?'kg':/(?:\b|\d)lbs?(?![a-wyz])|\d\s*#/i.test(t)?'lb':null;const cv=lu==='kg'?(v=>v):lu==='lb'?(v=>v*LB):conv; // a unit written on the line is that line's, glued to the x or as # for pounds too (r55, the audit: 100kg under an earlier 30lb was read as 100 lb; the second review: 100kgx8 and 225#)
    // On a bodyweight lift a bare "3x10" is sets of reps (no load to read); on a weighted lift it stays load x reps.
    if(exo.bw&&!exo.assist)st=st.replace(/(^|[\s,])(\d{1,2})x(\d{1,3})(?=$|[\s,])/g,(m,p,a,b)=>+a<=10&&!/@/.test(st)?p+Array(+a).fill('bwx'+b).join(' '):m);
    // On a weighted lift a bare "3x10" (up to 5 sets, no unit, no load anywhere on the line) is sets of reps with no load:
    // at the load carried from the line above, else asked for rather than read as 3 lb for 10 reps.
    else if(!exo.timed&&/^\s*[1-5]\s*[x×*]\s*\d{1,3}(\s*,?\s*[1-5]\s*[x×*]\s*\d{1,3})*\s*$/.test(String(t).toLowerCase())){if(defW==null)return null;
      for(const g of String(t).toLowerCase().matchAll(/([1-5])\s*[x×*]\s*(\d{1,3})/g))for(let k=0;k<+g[1];k++)out.push({w:defW,r:+g[2],rir:undefined,warm:false,drop:false});continue;}
    const g=parseSets(st,{bw:!!exo.bw||!!exo.timed},defW,cv);if(!g)return null;
    out.push(...g.map(x=>({w:x.w,r:x.r,rir:x.rir,warm:false,drop:false})));defW=g[g.length-1].w;}
  return out;}
/* Reads the input and opens the preview. */
async function impStart(input){
  const m={kind:'imp',step:'input',text:'',err:''};
  try{
    let rows=null,text=null;
    if(input&&input.file){const f=input.file;const nm=(f.name||'').toLowerCase();
      if(/\.json$/.test(nm)||f.type==='application/json'){importData(await f.text());return;}
      if(/\.xlsx$/.test(nm)){try{rows=await impXlsx(await f.arrayBuffer());}catch(e){openModal({...m,err:e&&e.message==='old'?'This phone cannot open .xlsx files. Save the sheet as CSV and try again.':'That spreadsheet could not be read. Save it as CSV and try again.'});return;}}
      else if(/\.(xls|numbers|pdf|docx?)$/.test(nm)){openModal({...m,err:'Save it as CSV (or copy the cells and paste them here) and try again.'});return;}
      else text=await f.text();}
    else text=String(input&&input.text||'');
    if(text!=null){const t=text.trim();if(!t){openModal({...m,err:'Paste your log or choose a file.'});return;}
      if(/^\s*\{/.test(t)&&/"sessions"/.test(t)){importData(t);return;}
      rows=impRows(t);
      // A table only when its first row names real columns, or cells were pasted (tabs); notes with commas stay notes.
      if(rows&&Object.keys(impHeader(rows[0])).filter(k=>['date','ex','r','w'].includes(k)).length<2&&!/\t/.test(t.split(/\r?\n/)[0]))rows=null;
      if(!rows){openPreview(impFromText(t),null);return;}}
    const map=impHeader(rows[0]);
    // Without a weight column every load would read 0, so that also asks which column is which.
    openPreview(map.ex!=null&&(map.r!=null||map.secs!=null)&&map.w!=null&&map.date!=null?impFromTable(rows,map):{sessions:[],needMap:true},{rows,map});
  }catch(e){log('import',e);openModal({...m,err:'That could not be read.'});}
}
function openPreview(res,tab){
  const names=[...new Set(res.sessions.flatMap(x=>x.items.map(i=>i.name)))];
  const pick=Object.create(null),guess=Object.create(null);
  const ASSISTED={pullup:'assistPullup',chinup:'assistPullup',dips:'assistDip',triDips:'assistDip'};
  for(const n of names){const c=impMatch(n);let id=c[0]&&c[0].sc>=0.6?c[0].id:'new';
    // Help written as a minus weight means the assisted machine.
    const neg=res.sessions.some(x=>x.items.some(i=>i.name===n&&i.sets&&i.sets.some(q=>q.w<0)));
    if(neg&&id!=='new'&&!EX(id).assist)id=ASSISTED[id]&&state.exercises.some(e=>e.id===ASSISTED[id])?ASSISTED[id]:'new';
    pick[n]=id;guess[n]=impGuess(n);if(neg&&id==='new')guess[n]={...guess[n],assist:true,equip:'machine'};}
  openModal({kind:'imp',step:'preview',res,tab,pick,guess,unit:res.unit||U(),unitKnown:!!res.unit,date:today(),showAll:false});
}
/* Sessions as they would be saved, and which are already in the log. */
function impBuild(m){
  const conv=m.unit==='kg'?(v=>v):(v=>v*LB);const newEx=Object.create(null);const out=[];const bad=[];const odd=[];let timedOff=0;
  const allTimed=n=>m.res.sessions.every(x=>x.items.every(i=>i.name!==n||(i.sets&&i.sets.length&&i.sets.every(q=>q.timed))));
  for(const n in m.pick)if(m.pick[n]==='new'){const g=m.guess[n];const e={id:'c_'+uid(),name:n.slice(0,60),primary:g.primary,secondary:[],equip:g.equip,bw:g.equip==='bodyweight'||!!g.assist,rare:false,note:'',custom:true,archived:false};if(g.assist)e.assist=true;if(!m.res.text&&allTimed(n))e.timed=true;newEx[n]=e;}
  for(const x of m.res.sessions){const date=x.date||m.date;const ex=[];
    for(const it of x.items){const exo=m.pick[it.name]==='new'?newEx[it.name]:EX(m.pick[it.name]);
      // A set timed in seconds on a lift that counts reps would turn seconds into reps: left out and counted.
      if(!it.setsText&&!exo.timed&&it.sets.some(q=>q.timed)){timedOff+=it.sets.filter(q=>q.timed).length;}
      let sets=it.setsText?impTextSets(it,exo,conv):it.sets.filter(q=>exo.timed||!q.timed).map(s=>({w:(s.u?(s.u==='kg'?s.w:s.w*LB):conv(s.w)),r:s.r,rir:s.rir,warm:s.warm,drop:s.drop&&!s.warm}));
      if(!sets||!sets.length){if(!bad.includes(it.name))bad.push(it.name);continue;}
      // Assisted: files write the help as a plus or a minus number; it is help either way. Other lifts never go below 0.
      for(const q of sets){if(exo.assist)q.w=-Math.abs(q.w);else if(q.w<0)q.w=0;}
      /* Reads that are probably wrong (r30, from the review: a misread line
         went in without a word): a weighted lift under 5 lb (2.3 kg) or a set
         past 30 reps. Shown in the preview to check; nothing is changed. */
      if(!exo.bw&&!exo.timed)for(const q of sets)if((q.w>0&&q.w<2.3)||q.r>30){odd.push(`${exo.name} ${fmtW(q.w)} ${U()} x ${q.r}${x.date?`, ${fmtDate(x.date)}`:''}`);break;}
      // A lift's sets across rows of the same exercise stay together.
      const prev=ex.find(b=>b.exId===exo.id);if(prev)prev.sets.push(...sets);else ex.push({exId:exo.id,note:it.note||'',rr:null,sets});}
    if(ex.length)out.push({id:uid(),date,dayIdx:0,dayId:null,dayName:(x.name||'').slice(0,60)||'Imported',routineId:'',free:true,ex,notes:x.note||'',durMin:x.durMin||null,deload:!!x.deload,light:false});} // the note and minutes the app's own file carries (r55)
  /* Date, lifts and reps, not loads (r31): the same file imported again with
     the other unit choice converted every load differently and added every
     session a second time. */
  const fp=ss=>ss.date+'|'+ss.ex.map(b=>b.exId+':'+b.sets.map(q=>q.r).join(',')).sort().join(';');
  const have=new Set(state.sessions.map(fp));const seen=new Set();const fresh=[];let dup=0;
  for(const ss of out){const k=fp(ss);if(have.has(k)||seen.has(k)){dup++;continue;}seen.add(k);fresh.push(ss);}
  /* Cardio from the file (r30): minutes from its time, distance in the file's
     unit (km beside kg, miles beside lb, as Strong writes it). An entry with
     no time cannot be saved (minutes are required) and is counted instead.
     One already in the log (same date, kind and minutes) is skipped. */
  const cardio=[];let cardioNoTime=0;
  for(const c of m.res.cardioRows||[]){const min=c.min||Math.round(c.secs/60);if(!(min>0)){cardioNoTime++;continue;}
    if(state.cardio.some(x=>x.date===c.date&&x.kind===c.kind&&x.min===min)){dup++;continue;}
    cardio.push(cleanCardio({id:uid(),date:c.date,kind:c.kind,min,hr:c.hr||null,when:c.when||'solo',note:c.note||'',dist:c.km!=null?c.km:c.dist>0?(m.unit==='kg'?c.dist:c.dist*KM_MI):null}));} // the app's own file says the minutes, heart rate, when, note and km (r55)
  return {sessions:fresh,cardio,cardioNoTime,dup,bad,odd,timedOff,newEx:Object.values(newEx).filter(e=>fresh.some(ss=>ss.ex.some(b=>b.exId===e.id)))};
}
/* A routine from an import, on a first run (r31). Someone who brings their
   Strong or Hevy history has a routine already; measuring them against the
   starter they never picked read as 69% adherence, 15 muscles below target
   and "add sets to Lat Pulldown" for someone who had never done one. The
   days are the workouts' own names (the most recent 8 weeks), or, when the
   names cannot tell them apart (Strong calls every untitled workout
   "Morning Workout"), the sessions grouped by the lifts in them (Day A, B).
   Days come in the order they last came round, with rest days so the cycle
   runs about as many days a week as they trained. What each day holds comes
   from its latest 3 full sessions, so a program changed a few weeks ago is
   the program now (the review saw a bench moved from 5 x 5 to 3 x 8-10
   brought back as 3 x 3-5): the lifts done in at least half of them, in the
   latest order, and each lift's working sets, a rep range around its reps
   (the nearest common range, a convention) and its RIR from its latest full
   session there. Deload and lighter sessions are left out of that. Returns
   null when nothing repeats; the routine picker opens instead. */
function routineFromLog(sessions){
  const all=sessions.filter(x=>!x.demo&&x.ex&&x.ex.length);if(!all.length)return null;
  const byDate=(a,b)=>a.date<b.date?-1:a.date>b.date?1:0;
  const newest=all.reduce((m,x)=>x.date>m?x.date:m,all[0].date);const rec=all.filter(x=>x.date>=addDays(newest,-55)).sort(byDate);
  // A session is off (a deload, a lighter day) when it was tagged, or when most of its lifts read lighter or short of their usual (r54, the one rule).
  const I=IDX();const tot={},off={};for(const id in I.byEx)for(const x of I.byEx[id]){tot[x.sid]=(tot[x.sid]||0)+1;if(offTarget(x))off[x.sid]=(off[x.sid]||0)+1;}
  const offS=x=>x.deload||x.light||(tot[x.id]>0&&(off[x.id]||0)*2>=tot[x.id]);
  const lifts=x=>new Set(x.ex.filter(b=>b.sets.some(q=>!q.warm)).map(b=>b.exId));
  const jac=(a,b)=>{let n=0;for(const v of a)if(b.has(v))n++;const u=a.size+b.size-n;return u?n/u:0;};
  const nm=x=>String(x.dayName||'').trim();
  const named=!rec.some(x=>GENERIC_WORKOUT.test(nm(x)));
  let groups=[],pop;
  if(named){pop=rec;const by=new Map();for(const x of rec){const k=nm(x).slice(0,40).toLowerCase();if(!by.has(k)){by.set(k,{name:nm(x).slice(0,40),list:[]});groups.push(by.get(k));}by.get(k).list.push(x);}}
  else{pop=rec.filter(x=>!offS(x));
    for(const x of pop){const L=lifts(x);let g=null,bj=0;for(const q of groups){const j=jac(L,q.ids);if(j>=0.5&&j>bj){g=q;bj=j;}}
      if(!g){g={list:[],ids:L};groups.push(g);}g.list.push(x);g.ids=L;}}
  groups=groups.filter(g=>g.list.length>=2);
  if(!groups.length||groups.length>7||groups.reduce((a,g)=>a+g.list.length,0)<pop.length*0.8)return null;
  groups.sort((a,b)=>byDate(a.list[a.list.length-1],b.list[b.list.length-1]));
  if(!named)groups.forEach((g,i)=>{g.name='Day '+String.fromCharCode(65+i);});
  const med=a=>median(a.filter(v=>v!=null&&isFinite(v)));
  const band=r=>r<=3?[1,3]:r<=5?[3,5]:r<=8?[6,8]:r<=10?[8,10]:r<=12?[10,12]:r<=15?[12,15]:[15,20];
  const work=b=>b.sets.filter(q=>!q.warm&&!q.drop);
  const days=groups.map(g=>{
    const full=g.list.filter(x=>!offS(x));const recent=(full.length?full:g.list).slice(-3);const latest=recent[recent.length-1];
    const cnt=new Map();for(const x of recent)for(const id of lifts(x))cnt.set(id,(cnt.get(id)||0)+1);
    const order=id=>{for(let k=recent.length-1;k>=0;k--){const i=recent[k].ex.findIndex(b=>b.exId===id);if(i>=0)return k===recent.length-1?i:100+i;}return 999;};
    const ids=[...cnt.keys()].filter(id=>cnt.get(id)*2>=recent.length&&state.exercises.some(e=>e.id===id&&!e.archived)).sort((a,b)=>order(a)-order(b));
    const items=ids.map(id=>{const ex=EX(id);const it=newItem(id);
      let b=null;for(let k=recent.length-1;k>=0&&!b;k--)b=recent[k].ex.find(q=>q.exId===id&&work(q).length)||null;
      if(!b)return it;const ws=work(b);
      it.sets=Math.min(10,Math.max(1,ws.length));
      if(!ex.timed){const r=med(ws.map(q=>+q.r));if(r>0)[it.repMin,it.repMax]=band(r);}
      // RIR only when most of the sets were rated: one failure set in a file (Strong's F) is not a plan to fail every set.
      const rt=ws.filter(x=>x.rir!=null);const q=rt.length*2>ws.length?med(rt.map(x=>+x.rir)):null;if(q!=null)it.rir=Math.min(4,Math.max(0,Math.round(q)));
      return it;});
    return {g,day:{id:uid(),name:g.name,rest:false,items},ids:lifts(latest)};
  }).filter(d=>d.day.items.length);
  if(!days.length)return null;
  const span=Math.max(7,daysBetween(rec[0].date,newest)+1);const perWeek=Math.min(7,Math.max(1,Math.round(rec.length/(span/7))));
  /* Workouts that come round more than once a week repeat in the cycle (r32,
     from the third review: push, pull, legs twice a week became "3 training
     days in a 4-day cycle", about 5 a week for someone doing 6). The second
     round is a copy of the same days, under the same names. */
  const reps=perWeek>=days.length*2?Math.min(3,Math.floor(perWeek/days.length)):1;
  const seq=[];for(let r=0;r<reps;r++)days.forEach(d=>seq.push(r?{...d.day,id:uid(),items:d.day.items.map(it=>({...it,uid:uid()}))}:d.day));
  const K=seq.length;const L=Math.min(14,Math.max(K,Math.round(7*K/perWeek)));let rest=L-K;
  // Rest days spread after the training days, or after each round when the days repeat (upper, lower, rest, upper, lower, rest, rest).
  const cyc=[];const restDay=()=>({id:uid(),name:'Rest',rest:true,items:[]});const K0=days.length;
  seq.forEach((day,i)=>{cyc.push(day);let k=0;
    if(reps>1){if((i+1)%K0===0){const roundsLeft=reps-(i+1)/K0+1;k=Math.floor(rest/roundsLeft);}}
    else{const left=K-i-1;k=left?Math.floor(rest/(left+1)):rest;}
    for(let j=0;j<k;j++)cyc.push(restDay());rest-=k;});
  /* Which day a session was: by name, or by the lifts in it (most in
     common, at least half), for sessions older than the 8 weeks too. */
  const dayFor=x=>{if(named){const k=nm(x).slice(0,40).toLowerCase();const d=days.find(q=>q.g.name.toLowerCase()===k);return d?d.day:null;}
    const L=lifts(x);let best=null,bj=0;for(const d of days){const j=jac(L,d.ids);if(j>=0.5&&j>bj){best=d.day;bj=j;}}return best;};
  return {routine:{id:uid(),name:'From your log',schedule:'cycle',days:cyc},perWeek,dayFor};
}
function impSheet(m){
  const H=(t)=>`<div class="sheet fixed" role="dialog" aria-modal="true" aria-labelledby="impH"><div class="sheet-h"><h3 id="impH">${t}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div><div class="sheet-scroll">`;
  if(m.step==='input')return H('Import workouts')+`<p class="small muted" style="margin:0 0 8px">Notes, a spreadsheet, or an export from another app. Nothing is saved until you check it.</p>
    <label class="btn primary block" style="position:relative">Choose a file<input type="file" id="impFile" accept=".csv,.tsv,.txt,.xlsx,.json,text/csv,text/plain,application/json" style="position:absolute;width:1px;height:1px;opacity:0"></label>
    <p class="small muted" style="margin:10px 0 4px">or paste it</p>
    <textarea id="impText" aria-label="Paste your log" style="min-height:160px;font-size:14px" placeholder="Sep 20&#10;Bench press 185x8, 185x7, 185x6&#10;Lat pulldown 3x10 @ 120">${esc(m.text||'')}</textarea>
    ${m.err?`<p class="small" style="color:var(--red);margin:8px 0 0">${esc(m.err)}</p>`:''}
    <button class="btn block" style="margin-top:10px" data-act="impRead">Read it</button>
    <p class="small muted hastip" style="margin:10px 0 0" data-tip="Notes: a date on its own line, then one exercise per line with its sets (185x8, 185x7, or 3x10 @ 120). A spreadsheet: a file, or copy the cells and paste them, with columns such as date, exercise, weight, and reps. Another app: export your workouts as a CSV file from its settings, then choose that file here. Handwritten: photograph the page, open it in Photos, press and hold the writing, tap Copy, and paste it here. A backup file from ${APP_NAME} restores your whole log instead.">What can I import?</p></div></div>`;
  const r=m.res;
  if(r.needMap){const head=m.tab.rows[0];const opt=(f,label,need)=>`<label class="field">${label}${need?'':' <span class="muted">(optional)</span>'}<select data-mapf="${f}"><option value="">None</option>${head.map((h,i)=>`<option value="${i}" ${m.tab.map[f]===i?'selected':''}>${esc(String(h||'Column '+(i+1)).slice(0,30))}</option>`).join('')}</select></label>`;
    return H('Which column is which?')+`<p class="small muted" style="margin:0 0 8px">The first row is read as column names.</p>${opt('date','Date',1)}${opt('ex','Exercise',1)}${opt('w','Weight, none if bodyweight only')}${opt('r','Reps',1)}${opt('sets','Sets')}${opt('rir','RIR')}${opt('name','Workout name')}
      <button class="btn primary block" style="margin-top:10px" data-act="impMapDone">Continue</button></div></div>`;}
  const b=impBuild(m);const nSets=b.sessions.reduce((a,x)=>a+x.ex.reduce((c,e)=>c+e.sets.length,0),0);const dates=b.sessions.map(x=>x.date).sort();
  const names=Object.keys(m.pick);const lib=state.exercises.filter(e=>!e.archived).sort((x,y)=>x.name.localeCompare(y.name));
  const row=n=>{const c=impMatch(n);const top=new Set(c.map(x=>x.id));const v=m.pick[n];
    return `<div class="imp-ex"><div class="imp-n">${esc(n)}</div><select data-imppick="${esc(n)}" aria-label="${esc(n)} is">${`<option value="new" ${v==='new'?'selected':''}>New exercise</option>`}${c.map(x=>`<option value="${x.id}" ${v===x.id?'selected':''}>${esc(exName(x.id))}</option>`).join('')}<option disabled>──────</option>${lib.filter(e=>!top.has(e.id)).map(e=>`<option value="${e.id}" ${v===e.id?'selected':''}>${esc(e.name)}</option>`).join('')}</select>
    ${v==='new'?`<select data-impmus="${esc(n)}" aria-label="Main muscle for ${esc(n)}">${MUSCLES.map(([k,l])=>`<option value="${k}" ${m.guess[n].primary===k?'selected':''}>${l}</option>`).join('')}</select>`:''}</div>`;};
  const unsure=names.filter(n=>{const c=impMatch(n);return m.pick[n]==='new'||!c[0]||c[0].id!==m.pick[n]||c[0].sc<0.85;});const sure=names.filter(n=>!unsure.includes(n));
  const noDate=r.sessions.some(x=>!x.date);
  return H('Check the import')+`<div class="kpis"><div class="kpi"><div class="v">${b.sessions.length}</div><div class="l">sessions</div></div><div class="kpi"><div class="v">${nSets}</div><div class="l">sets</div></div><div class="kpi"><div class="v">${names.length}</div><div class="l">exercises</div></div></div>
  ${dates.length?`<p class="small muted" style="margin:6px 0 0">${fmtDate(dates[0])}${dates.length>1?' to '+fmtDate(dates[dates.length-1]):''}</p>`:''}
  ${b.dup?`<p class="small" style="margin:6px 0 0">${b.dup} already in your log, skipped.</p>`:''}
  <div style="margin-top:10px"><p class="small muted" style="margin:0 0 6px;font-weight:600">Weights in the file are</p><div class="ob-units">${['lb','kg'].map(k=>`<button class="chip ${m.unit===k?'on':''}" data-act="impUnit" data-v="${k}" aria-pressed="${m.unit===k}">${k}</button>`).join('')}</div>${m.unitKnown?'':'<p class="small muted" style="margin:4px 0 0">It does not say which; check this.</p>'}</div>
  ${noDate?`<label class="field" style="margin-top:10px">No date found. Log it on<input type="date" data-impdate value="${m.date}" max="${today()}"></label>`:''}
  ${unsure.length?`<p class="small" style="margin:12px 0 4px;font-weight:650">Check these exercises</p>${unsure.map(row).join('')}`:''}
  ${sure.length?`<details class="subsec" style="margin-top:8px"><summary>${sure.length} matched</summary>${sure.map(row).join('')}</details>`:''}
  ${r.unreadN||r.unread&&r.unread.length?`<details class="subsec" style="margin-top:8px"><summary>${r.unreadN||r.unread.length} line${(r.unreadN||r.unread.length)===1?'':'s'} not understood</summary><ul class="small" style="margin:6px 0 0;padding-left:18px">${r.unread.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></details>`:''}
  ${r.skipped?`<p class="small muted" style="margin:6px 0 0">${r.skipped} row${r.skipped===1?'':'s'} without an exercise, date, or reps were skipped.</p>`:''}${b.cardio.length?`<p class="small" style="margin:6px 0 0">Cardio: ${b.cardio.length} entr${b.cardio.length===1?'y':'ies'} (${esc(andList(b.cardio.slice(0,3).map(c=>`${CARDIOL[c.kind].toLowerCase()} ${fmtDate(c.date)}, ${c.min} min${c.dist?`, ${distShow(c.dist)} ${distU()}`:''}`),3))}${b.cardio.length>3?', and more':''}). Distances are read in ${m.unit==='kg'?'km':'miles'}, with the unit above.</p>`:''}${b.cardioNoTime?`<p class="small muted" style="margin:6px 0 0">${b.cardioNoTime} cardio entr${b.cardioNoTime===1?'y':'ies'} without a time left out: minutes are needed.</p>`:''}
  ${b.bad.length?`<p class="small" style="margin:6px 0 0;color:var(--yellow)">Not imported, no weight given: ${esc(andList(b.bad,8))}. Write the load in, like 3x10 @ 60, and read it again.</p>`:''}
  ${b.odd.length?`<p class="small" id="impOdd" style="margin:6px 0 0;color:var(--yellow)">Check these, they look misread: ${esc(andList(b.odd,4))}. Fix the line and read it again if they are wrong.</p>`:''}
  ${b.timedOff?`<p class="small" style="margin:6px 0 0;color:var(--yellow)">${b.timedOff} timed set${b.timedOff===1?' was':'s were'} left out: the exercise chosen counts reps. Pick a timed one to keep them.</p>`:''}
  ${r.cut?`<p class="small" style="margin:6px 0 0;color:var(--yellow)">Only the first ${IMP_MAX_ROWS.toLocaleString()} rows were read. Split the file to import the rest.</p>`:''}
  ${b.sessions.length?`<details class="subsec" style="margin-top:8px" id="impRead"><summary>What was read</summary>${b.sessions.slice(0,40).map(x=>`<p class="small" style="margin:8px 0 2px;font-weight:650">${fmtDate(x.date)}${x.dayName&&x.dayName!=='Imported'?' · '+esc(x.dayName):''}</p>${x.ex.map(e=>{const exo=EX(e.exId).id===e.exId&&!EX(e.exId).archived?EX(e.exId):(b.newEx.find(n=>n.id===e.exId)||EX(e.exId));return `<p class="small muted" style="margin:0">${esc(exo.name)}: ${e.sets.map(q=>(q.warm?'W ':q.drop?'D ':'')+setShort(exo,q.w,q.r)).join(', ')}</p>`;}).join('')}`).join('')}${b.sessions.length>40?`<p class="small muted">and ${b.sessions.length-40} more</p>`:''}</details>`:''}
  <button class="btn primary block" style="margin-top:12px" data-act="impGo" ${b.sessions.length||b.cardio.length?'':'disabled'}>Import ${b.sessions.length} session${b.sessions.length===1?'':'s'}${b.cardio.length?` and ${b.cardio.length} cardio`:''}</button>
  <button class="btn block" style="margin-top:6px" data-act="impBack">Back</button></div></div>`;
}
/* The preview only (r29, V): the preview keeps its own log so nothing tried
   there reaches the real one, which left its Stats empty. This copies the
   real log in, read-only: the live app's copy on this phone when there is one
   (Android, or both opened in the same browser tab), else the account's cloud
   copy (an iPhone keeps each home-screen app's storage apart). The one with
   more sessions wins. The live app and its table are never written. */
async function liveLogFetch(){
  let local=null;
  try{const raw=localStorage.getItem(`${STORAGE_ID}.v1`);if(raw)local=normalize(JSON.parse(raw));}catch(e){local=null;}
  let remote=null,err=null;
  if(typeof window.ironlogLiveDocs==='function'&&acct.user){
    try{const parts={};for(const d of await window.ironlogLiveDocs()){if(!isChunkId(d.id)||!d.data||typeof d.data.json!=='string')continue;try{parts[d.id]=JSON.parse(d.data.json);}catch(e){/* an unreadable chunk is skipped */}}
      if(Object.keys(parts).length)remote=assemble(parts);}catch(e){err=e;}
  }
  const best=[local,remote].filter(Boolean).sort((a,b)=>realCount(b)-realCount(a))[0]||null;
  return {st:best&&realCount(best)?best:null,err};
}
function previewCopyBtn(cls){return ENV==='preview'?`<button class="btn ${cls||''}" data-act="previewCopy">Copy my log in</button>`:'';}
function importData(text,after){
  let obj;try{obj=JSON.parse(text);}catch(e){toast('That is not valid backup text');return;}
  const s=obj&&obj.state?obj.state:obj;
  if(!s||typeof s!=='object'||!Array.isArray(s.exercises)||!Array.isArray(s.routines)||!Array.isArray(s.sessions)){toast(`That file is not a backup from ${APP_NAME}`);return;}
  // Validate first and report honestly, rather than importing something that
  // renders once and then throws.
  let clean;try{clean=normalize(s);}catch(e){toast('That backup could not be read');return;}
  const dropped=normalize.dropped;
  if(!clean.sessions.length&&s.sessions.length){toast('No readable sessions in that backup');return;}
  const body=`This backup has ${clean.sessions.length} session${clean.sessions.length===1?'':'s'} and ${clean.routines.length} routine${clean.routines.length===1?'':'s'}.`
    +(dropped?` ${dropped} damaged record${dropped===1?' was':'s were'} skipped.`:'')
    +' It will replace everything currently in the app. You can step this back with Undo.';
  confirmBox('Replace all data?',body,'Replace my data',()=>{snapshot();setState(clean);if(!cloud.on)cloudStop(true);commit();closeModal();ui.tab='today';render();toast('Backup imported',true);if(after)after();},true);
}
/* Demo data looked at before setting up (V, r28): whatever is changed while
   looking around (sections shown or hidden, their order, the timer, RIR,
   auto-mark and the rest of Settings) is put back to how it was when the
   demo was loaded, once the demo is cleared, so a real start begins on the
   default layout. Only a first run keeps this; someone with their own log
   who loads the demo from Settings keeps every change. Kept on the device,
   so it survives the app being closed while looking around. */
const DEMOSET_KEY=KEY+'.demoSettings';
// The settings are taken when the demo goes in (not again while it is still
// loaded, which would keep what was changed while looking around), and are
// put back only while this is still a first run: once a routine is picked,
// a session is logged or an account brings a log, every setting is the
// person's own, and a snapshot left from earlier is thrown away unused.
const demoFirstRun=()=>!state.settings.onboarded&&!realCount(state)&&!state.draft;
function demoKeep(){
  if(!demoFirstRun()||state.sessions.some(x=>x.demo))return;
  try{localStorage.setItem(DEMOSET_KEY,JSON.stringify(state.settings));}catch(e){log('demo',e);}
}
function demoRestore(){
  let saved=null;try{const t=localStorage.getItem(DEMOSET_KEY);saved=t?JSON.parse(t):null;localStorage.removeItem(DEMOSET_KEY);}catch(e){log('demo',e);}
  if(!saved||typeof saved!=='object'||!demoFirstRun())return;
  // Facts about this device and its backups are not part of looking around.
  const keep={onboarded:state.settings.onboarded,lastExport:state.settings.lastExport,calSnooze:state.settings.calSnooze};
  state.settings=normalize({...state,settings:{...saved,...keep}}).settings;
}
/* Demo data (reworked in r29, V: the old demo "feels shitty and demotivates
   users"). It is a lifter who follows the active routine and the app's own
   double progression: every set adds a rep each session until all reach the
   top of the range, then the load goes up one real step (progStep) and the
   reps start again near the bottom. Every planned session is done, RIR sits
   at the plan's, so Stats shows steady PRs, lifts moving, and volume on
   target, which is what following the routine looks like. Today is left
   open, so the next workout is ready to start. Seeded, so the same routine
   always gives the same demo. */
function makeDemo(){
  state.sessions=state.sessions.filter(s=>!s.demo);state.bodyweights=state.bodyweights.filter(b=>!b.demo);state.measurements=state.measurements.filter(m=>!m.demo);
  const R=activeRoutine();const rnd=mulberry(11);
  // Working loads in lb near the end of the 8 weeks, for an intermediate
  // lifter of 185 lb. Dumbbells are per dumbbell; bodyweight lifts are added load.
  const base={bench:225,incBench:185,ohp:135,backSquat:275,frontSquat:205,rdl:245,sldl:225,rackPull:365,hackSquat:315,legPress:540,bss:40,hipThrust:275,goblet:70,revLunge:40,dbRdl:70,slRdl:40,
    bbRow:185,cableRow:180,machRow:180,landmineRow:180,latPulldown:160,leanAwayLat:35,pullup:25,dips:45,dbRow:80,csDbRow:55,dbPullover:65,
    seatedDbPress:60,machPress:180,machShoulder:130,incDb:65,dbBench:70,cableFly:35,lowHighFly:35,pecDeck:150,
    cableLateral:20,dbLateral:25,cableY:15,facePull:50,reversePecDeck:100,dbRearFly:20,kelsoShrug:155,dbShrug:70,
    inclineCurl:30,bayesianCurl:30,preacher:80,hammer:35,dbCurl:35,reverseCurl:60,wristCurl:85,revWristCurl:45,ohCableExt:70,jmPress:135,pressdown:80,ohDbExt:50,
    woodchop:50,cableCrunch:120,legExt:180,adductor:200,abductor:200,standCalf:250,seatedCalf:160,slCalf:25,seatedCurl:130,lyingCurl:110,tibRaise:35,neckCurl:25,neckExt:45,hyperext:35};
  const eqBase=e=>{const c=isCompound(e);return {barbell:c?185:65,dumbbell:c?60:25,cable:c?150:45,machine:c?180:100,smith:c?185:95,landmine:c?150:60,other:50,bodyweight:0}[e.equip]??50;};
  const BW=185;const cur=weekStart(today());const t=today();
  const realDates=new Set(state.sessions.map(x=>x.date));
  const realBW=new Set(state.bodyweights.map(x=>x.date)),realMeas=new Set(state.measurements.map(x=>x.date));
  // Weekly routines land on their weekdays; cycles run in order, one cycle
  // day per calendar day, across the same eight weeks.
  const slots=[];
  if(R.schedule==='weekly'){for(let k=0;k<8;k++){const ws=addDays(cur,-7*(7-k));R.days.forEach((d,di)=>slots.push({date:addDays(ws,di),di}));}}
  else{const start=addDays(cur,-49);for(let p=0;;p++){const date=addDays(start,p);if(date>t)break;slots.push({date,di:p%R.days.length});}}
  // One progression per lift and rep range, like the app's own targets.
  const prog={};
  const startOf=(e,it)=>{
    const lb=base[it.exId]>0||(e.bw&&base[it.exId]===0)?base[it.exId]:eqBase(e);
    // An assisted lift starts with 40 lb of help and earns its way down.
    if(e.assist)return {w:-40*LB,reps:null};
    const step=progStep(e,it,lb*LB)||5*LB;
    // About eight weeks of progress below the end load, in whole steps.
    let w=lb>0?Math.max(step,Math.round(lb*LB*0.9/step)*step):0;
    // Never under the bar on a lift loaded on one (a light wrist curl was).
    if(w>0&&platesMode(e)==='bar'&&loadMode(e)==='total'){const bar=exBarKg(e);if(w<bar-1e-6)w=bar;}
    return {w,reps:null};
  };
  /* r30 (V's choice): one marked deload week, three weeks back, and one
     missed day, six weeks back, so the demo shows how a deload is handled
     (left out of trends, stalls, targets and the volume average) and a gap.
     The missed day sits outside the weeks the volume average reads, and the
     deload week is skipped by it, so nothing reads below target. */
  const dlw=addDays(weekStart(t),-21),msw=addDays(weekStart(t),-42);let msn=0;
  for(const sl of slots){
    const date=sl.date,di=sl.di,d=R.days[di];
    if(d.rest||!d.items.length||date>=t)continue;
    // A demo session on a day with a real one stacked two sessions of the same
    // lift on one date, and the strength chart plunged between them.
    if(realDates.has(date))continue;
    if(weekStart(date)===msw&&msn++===1)continue;
    if(weekStart(date)===dlw){
      // Half the sets (rounded up) at about 90% loads in real steps, the bottom of the range, 3 RIR. The progression waits.
      const ex=d.items.map(it=>{const e=EX(it.exId);const key=it.exId+'|'+it.repMin+'-'+it.repMax;const g=prog[key]||(prog[key]=Object.assign(startOf(e,it),{lv:Math.round(((+it.repMin||8)+Math.max(+it.repMin||8,+it.repMax||8))/2),n:0}));
        const n=Math.max(1,Math.ceil(it.sets/2));const lo=+it.repMin||8;
        const w=e.assist?g.w-(progStep(e,it,BW*LB)||5*LB):g.w>0?lighterLoad(e,it,g.w,g.w*0.9):g.w;
        return {exId:it.exId,sets:Array.from({length:n},()=>({w,r:lo,rir:3,warm:false}))};});
      state.sessions.push({id:uid(),date,dayIdx:di,dayId:d.id,dayName:d.name+' (deload)',routineId:R.id,ex,notes:'Deload: half sets, about 90% loads, 3+ RIR.',deload:true,demo:true});
      continue;
    }
    const ex=d.items.map(it=>{
      const e=EX(it.exId);const key=it.exId+'|'+it.repMin+'-'+it.repMax;
      let g=prog[key];
      const lo=+it.repMin||8,hi=Math.max(lo,+it.repMax||lo);
      /* One level per lift: the first two sets make it, later sets a rep
         fewer from fatigue until the level reaches the top of the range,
         every set capped there. The
         level climbs a rep each session; once every set made the top, the
         load goes up one real step, which costs about a rep (2.5% on a
         compound) or two (5% on an isolation lift), so the estimate keeps
         climbing. Resetting reps to the bottom after each step read as a
         stall. A wide range starts in its middle, where a 90% load lands. */
      const repsAt=(lv,n)=>Array.from({length:n},(_,j)=>Math.max(lo,Math.min(hi,lv-(j>=2&&lv<hi?1:0))));
      // A bodyweight lift with no load to add climbs a rep every other
      // session from the bottom: parked at the top it read as a stall.
      const pureBw=e.bw&&!e.assist&&!(base[it.exId]>0);
      if(!g){g=prog[key]=startOf(e,it);g.lv=pureBw?lo:Math.round((lo+hi)/2);g.n=0;}
      else if(pureBw){g.n++;if(g.n%2===1)g.lv=Math.min(hi,g.lv+1);}
      else if(repsAt(g.lv,it.sets).every(r=>r>=hi)&&(e.assist||g.w>0||!e.bw)){
        // Every set at the top: one real step more (less help on an assisted
        // lift). A pure bodyweight lift with no load to add stays at the top.
        const was=(e.bw?BW*LB:0)+g.w;const step=progStep(e,it,e.assist?BW*LB:was)||5*LB;
        if(e.assist)g.w=Math.min(0,g.w+step);else g.w=g.w+step;
        // About a rep for each 2.5% added: 1 on a heavy compound, 2 on an
        // isolation lift, and back near the bottom on a light dumbbell where
        // one 5 lb step is 15%.
        g.lv=Math.max(lo,hi-Math.max(1,Math.round(step/Math.max(was,step)*100/2.5)));
      }else g.lv++;
      g.reps=repsAt(g.lv,it.sets);
      // Now and then the last set falls a rep short; the best set is unchanged.
      if(g.reps.length>2&&rnd()<0.15)g.reps[g.reps.length-1]=Math.max(lo,g.reps[g.reps.length-1]-1);
      const rir=Math.max(0,Math.min(3,isNum(+it.rir)?+it.rir:1));
      const sets=g.reps.map((r,j)=>({w:g.w,r,rir:j===g.reps.length-1?Math.max(0,rir-1):rir,warm:false}));
      return {exId:it.exId,sets};
    });
    state.sessions.push({id:uid(),date,dayIdx:di,dayId:d.id,dayName:d.name,routineId:R.id,ex,notes:'',demo:true});
  }
  for(let i=56;i>=1;i-=2){const date=addDays(t,-i);if(realBW.has(date))continue;state.bodyweights.push({id:uid(),date,kg:(BW-1.5+(56-i)*0.03+(rnd()-0.5)*1.2)*LB,demo:true});}
  if(!realMeas.has(addDays(t,-56)))state.measurements.push({id:uid(),date:addDays(t,-56),arm:16.0*IN,forearm:13.1*IN,chest:44.0*IN,waist:33.5*IN,thigh:24.0*IN,calf:15.0*IN,neck:16.0*IN,demo:true});
  if(!realMeas.has(addDays(t,-1)))state.measurements.push({id:uid(),date:addDays(t,-1),arm:16.3*IN,forearm:13.2*IN,chest:44.4*IN,waist:33.4*IN,thigh:24.4*IN,calf:15.1*IN,neck:16.2*IN,demo:true});
  commit();
}

