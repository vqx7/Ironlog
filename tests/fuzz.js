// Edge-case fuzz: odd but valid logs must never break a screen or a number.
const {open}=require('./h');
(async()=>{const {browser,page,errors}=await open('index.html',{clock:'2026-09-26T10:00:00'});
const r=await page.evaluate(()=>{
  const L=window.__ironlog;
  // Every section shown (a new install hides a few since r28), so every screen is checked.
  L.state.settings.hidden=[];let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  const ids=L.state.exercises.map(e=>e.id);const bad=[];
  // A stray quote in a template (r26 had one in This week's bar) leaves the
  // page readable but turns words into attribute names. Every attribute
  // outside SVG must be a data-, aria- or known HTML one.
  const STD=new Set('accept autocomplete checked class disabled enterkeyhint height hidden id inputmode max maxlength min step open placeholder role selected style tabindex title type value width for name href target rel src alt readonly multiple pattern autofocus capture download draggable lang dir spellcheck autocapitalize autocorrect rows cols label'.split(' '));
  const attrs=(where)=>{for(const e of document.querySelectorAll('body *')){if(e.closest('svg'))continue;for(const a of e.attributes)if(!/^(data|aria)-[a-z0-9-]+$/.test(a.name)&&!STD.has(a.name)){bad.push('odd attribute "'+a.name+'" on '+e.tagName+' in '+where);return;}}};
  for(let round=0;round<25;round++){
    const ss=[];const n=5+Math.floor(rnd()*40);
    for(let i=0;i<n;i++){const d=new Date(2026,8,26-Math.floor(rnd()*200));const date=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const ex=Array.from({length:1+Math.floor(rnd()*4)},()=>({exId:ids[Math.floor(rnd()*ids.length)],rr:rnd()<.3?null:[Math.ceil(rnd()*10),10+Math.ceil(rnd()*15)],cut:rnd()<.1||undefined,sets:Array.from({length:1+Math.floor(rnd()*5)},()=>({w:rnd()<.1?0:rnd()*200,r:rnd()<.05?0:Math.ceil(rnd()*30),rir:rnd()<.3?null:Math.floor(rnd()*8),warm:rnd()<.1,drop:rnd()<.1,cal:rnd()<.05?{at:5,pred:2}:undefined}))}));
      ss.push({id:'f'+round+'_'+i,date,dayIdx:0,dayName:'F',routineId:'',notes:'',deload:rnd()<.1,light:rnd()<.1,ex});}
    L.state=L.normalize({...JSON.parse(JSON.stringify(L.state)),sessions:ss,bodyweights:rnd()<.5?[{id:'b',date:'2026-06-01',kg:70+rnd()*30}]:[],settings:{...L.state.settings,rirMode:['on','off','cal'][round%3],unit:round%2?'kg':'lb'}});
    L.invalidate();
    try{const I=L.IDX();for(const [id,st] of Object.entries(I.exStats)){for(const k of ['pct','slope','best']){const v=st[k];if(v!=null&&!isFinite(v))bad.push(round+' '+id+' '+k+' '+v);}}
      for(const x of I.sessVol)if(!isFinite(x.vol)||x.vol<0)bad.push('vol '+x.vol);
      for(const wk in I.weekHard)if(!isFinite(I.weekHard[wk]))bad.push('wh');
      L.rankDays();L.coach();
      L.ui.wkView=round%2?'month':'week';
      for(const t of ['today','program','dash','history','settings']){L.ui.tab=t;L.ui.volMode=['planned','week','avg','trend','region','load'][round%6];L.render();document.querySelectorAll('details').forEach(d=>d.open=true);if(document.body.innerText.includes('Something broke'))bad.push('crash '+t+' round '+round);attrs(t+' round '+round);if(/NaN|undefined|Infinity/.test(document.getElementById('view').innerText))bad.push('bad text '+t+' round '+round+': '+(document.getElementById('view').innerText.match(/.{0,40}(NaN|undefined|Infinity).{0,40}/)||[''])[0]);}
      L.ui.tab='today';L.state.draft=null;L.render();const b=document.querySelector('.hero [data-act="startSession"]');if(b){b.click();attrs('logger round '+round);if(/NaN|undefined|Infinity/.test(document.getElementById('view').innerText))bad.push('logger text round '+round);L.rankExercises(L.state.draft);}
      L.state.draft=null;
    }catch(e){bad.push('throw '+round+' '+e.message);}
  }
  return bad;});
console.log(r.length?r.slice(0,20):'fuzz clean');console.log(errors);await browser.close();})();
