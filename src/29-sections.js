/* ---------- movable, foldable sections ----------
   Every section a tab shows carries data-mkey and a ⠿ handle in its header.
   Dragging the handle reorders sections; the order is saved per tab in
   settings.secOrder and applied after each render by moving the keyed
   elements into the slots the keyed elements occupied, so unkeyed elements
   (page titles, the Start card, notices) never move. Keys a tab does not
   show right now (Injuries with none flagged) keep their saved place.
   On the handle, the arrow keys do the same as dragging. */
/* After a list of sets in History: what the load and reps mean, when it is
   not a plain total. */
function histUnits(ex){const bits=[];const n=loadNote(ex).trim();if(n)bits.push(n);if(ex.perSide)bits.push(ex.timed?'seconds per side':'reps per side');return bits.length?` <span class="muted">(${bits.join(', ')})</span>`:'';}
/* A session's exercises move by dragging this handle too (V, r29), alongside
   the ⋯ menu's Move up and Move down, which do the same thing (bUp, bDown). */
function bgrip(bi,name){return `<span class="bgrip" role="button" tabindex="0" data-b="${bi}" aria-label="Move ${esc(name)}: drag, or use the arrow keys" title="Drag to move">⠿</span>`;}
/* One way to move an exercise in a session: the drag, the arrow keys on its
   handle and the ⋯ menu's Move up and Move down all come here. A superset
   split by the move is undone (its members are no longer next to each
   other, so the rest timer would never start), and timers that point at a
   block by its position are dropped, since the position changed (r29). */
function moveBlock(a,b){
  const d=state.draft;if(!d||b<0||b>=d.ex.length||a===b)return false;
  clearTimeout(foldT);foldT=null;lastAuto=null;
  keepOpen(()=>{move(d.ex,a,b);fixSupersets(d.ex.map(x=>x.plan).filter(Boolean));});
  saveNow();return true;
}
/* While an exercise is dragged, a finger near the top or bottom of the space
   between the header and the tab bar (or the rest timer) scrolls the page,
   faster the closer it is. Sortable's own scrolling did not run for a touch
   drag on the window. Sortable re-reads the target every 50 ms on its own, so
   a finger held still keeps moving the exercise as the page scrolls.
   A var, so killDynamic (which can run before this line on the first render)
   reads it as undefined instead of throwing. */
var edgeScroll=(()=>{let y=null,raf=0;
  const mv=e=>{const t=e.touches?e.touches[0]:e;if(t)y=t.clientY;};
  // Both bars are position:fixed, whose offsetParent is always null, so
  // getClientRects is what tells a shown bar from a hidden one.
  const zone=()=>{const h=document.querySelector('header.top');const top=h?h.getBoundingClientRect().bottom:0;let bot=window.innerHeight;
    for(const el of [document.getElementById('tabs'),document.getElementById('timer')]){if(el&&!el.hidden&&el.getClientRects().length){const r=el.getBoundingClientRect();if(r.height)bot=Math.min(bot,r.top);}}return [top,bot];};
  const step=()=>{raf=0;if(!blockDrag)return;if(y!=null){const [top,bot]=zone();const edge=56;let v=0;
      if(y<top+edge)v=-Math.ceil((top+edge-y)/edge*14);else if(y>bot-edge)v=Math.ceil((y-(bot-edge))/edge*14);
      if(v)window.scrollBy(0,Math.max(-20,Math.min(20,v)));}
    raf=requestAnimationFrame(step);};
  return {start(){y=null;document.addEventListener('touchmove',mv,{passive:true});document.addEventListener('pointermove',mv,{passive:true});if(!raf)raf=requestAnimationFrame(step);},
    stop(){document.removeEventListener('touchmove',mv);document.removeEventListener('pointermove',mv);if(raf)cancelAnimationFrame(raf);raf=0;y=null;}};})();
/* The exercises open again at the drop. The scroll is moved with them, so
   the one just dropped stays where the finger left it instead of the page
   going back to a position measured on the one-line list (r29 review). */
function dragOpenUp(it){
  const t0=it&&it.isConnected?it.getBoundingClientRect().top:null;
  document.body.classList.remove('blkdrag');const v=$('#view');if(v)v.style.paddingBottom='';
  if(t0!=null){const t1=it.getBoundingClientRect().top;if(t1!==t0)window.scrollBy(0,t1-t0);}
}
function mountBlockSortable(){
  if(!window.Sortable||!state.draft)return;const v=$('#view');if(!v||v.querySelectorAll('section.block').length<2)return;
  sortables.push(window.Sortable.create(v,{group:{name:'blocks',pull:false,put:false},handle:'.bgrip',draggable:'section.block',animation:150,fallbackOnBody:true,
    // A field still focused when the drag starts would get its focus back by
    // position after the move, on whichever exercise landed there.
    onStart:e=>{blockDrag=true;clearTimeout(foldT);foldT=null;const f=document.activeElement;if(f&&f.matches&&f.matches('#view input,#view textarea')){try{f.blur();}catch(x){/* focus is best effort */}}
      // An open exercise is taller than the screen, so the next one started
      // off-screen and a drag could only move one place (r29 review). While
      // dragging, every exercise shows only its title line; the page is
      // scrolled so the one held stays under the finger.
      // When the shorter page cannot scroll that far, room is added below the
      // list for the drag, or the held one would leave the finger.
      const it=e.item,t0=it.getBoundingClientRect().top;document.body.classList.add('blkdrag');
      const want=window.scrollY+it.getBoundingClientRect().top-t0,se=document.scrollingElement,room=want-(se.scrollHeight-window.innerHeight);
      if(room>0){const v=$('#view');if(v)v.style.paddingBottom=Math.ceil(room)+'px';}
      window.scrollTo(0,want);edgeScroll.start();},
    onEnd:e=>{blockDrag=false;edgeScroll.stop();dragOpenUp(e.item);const a=e.oldDraggableIndex,b=e.newDraggableIndex;if(a==null||b==null||a===b||!state.draft){rerenderKeepScroll();return;}
      moveBlock(a,b);rerenderKeepScroll();toast(`Moved to position ${b+1}`);}}));
}
function sgrip(label){return `<span class="sgrip" role="button" tabindex="0" aria-label="Move ${esc(label)}: drag, or use the arrow keys" title="Drag to move">⠿</span>`;}
function keyedKids(){const v=$('#view');return v?[...v.children].filter(e=>e.dataset&&e.dataset.mkey):[];}
function orderKeys(saved,present){
  const order=saved.filter(k=>present.includes(k));
  present.forEach((k,i)=>{if(order.includes(k))return;const prev=present.slice(0,i).reverse().find(q=>order.includes(q));order.splice(prev?order.indexOf(prev)+1:0,0,k);});
  return order;
}
function applySecOrder(){
  const saved=state.settings.secOrder[ui.tab];if(!saved||!saved.length)return;
  const kids=keyedKids();if(kids.length<2)return;
  const order=orderKeys(saved,kids.map(e=>e.dataset.mkey));
  const byK={};kids.forEach(e=>{byK[e.dataset.mkey]=e;});
  const marks=kids.map(e=>{const c=document.createComment('slot');e.replaceWith(c);return c;});
  marks.forEach((c,i)=>c.replaceWith(byK[order[i]]));
}
/* The bottom of each tab (r28): what this tab can also show, one tap each,
   and the way to Settings > Layout for the rest. This is how a new person
   finds the hidden sections without reading anything first. A tab with
   nothing hidden shows no line. A section that would show nothing right now (Injuries with none flagged, an empty
   Recently deleted) is not offered. */
const MORE_LIVE={'today:session':()=>{const R=activeRoutine();const di=ui.todayDay!=null&&ui.todayDay<R.days.length?ui.todayDay:R.schedule==='weekly'?(new Date().getDay()+6)%7:cycleState(R).next;const d=R.days[di];return !!d&&!d.rest&&d.items.length>0;},'today:injuries':()=>(state.injuries||[]).length>0,'history:cardio':()=>state.cardio.length>0,'history:trash':()=>(state.trash||[]).length>0};
function moreLine(tab){
  const h=state.settings.hidden;
  const list=HIDEABLE.filter(([t,k])=>t===tab&&h.includes(t+':'+k)&&(!MORE_LIVE[t+':'+k]||MORE_LIVE[t+':'+k]()));
  // Nothing to add: nothing shown. Layout stays one tap away in the menu.
  if(!list.length)return '';
  return `<div class="moreline" id="moreLine"><p class="small muted ml-h">Add to this tab</p><div class="chips">${list.map(([t,k,l])=>`<button type="button" class="chip add" data-act="secShow" data-k="${t}:${k}">+ ${esc(l)}</button>`).join('')}</div><button type="button" class="linkbtn ml-c" data-act="goLayout">Show, hide, or reorder sections</button></div>`;
}
/* Sections hidden in Settings > Layout are taken out after rendering. Their
   saved position is kept, so showing one again puts it back where it was. */
function applyHidden(){
  const h=state.settings.hidden;if(!h||!h.length)return;
  keyedKids().forEach(e=>{if(h.includes(ui.tab+':'+e.dataset.mkey))e.remove();});
}
function saveSecOrder(){
  const keys=keyedKids().map(e=>e.dataset.mkey);
  const old=state.settings.secOrder[ui.tab]||[];const out=keys.slice();
  old.forEach((k,i)=>{if(out.includes(k))return;const prev=old.slice(0,i).reverse().find(q=>out.includes(q));out.splice(prev?out.indexOf(prev)+1:0,0,k);});
  state.settings.secOrder[ui.tab]=out;saveSoon();
}
function mountSecSortable(){
  if(!window.Sortable)return;const v=$('#view');if(keyedKids().length<2)return;
  // Its own group, closed both ways: a section can only move among sections,
  // and no exercise or day can be dropped among them.
  sortables.push(window.Sortable.create(v,{group:{name:'sections',pull:false,put:false},handle:'.sgrip',draggable:'[data-mkey]',animation:150,fallbackOnBody:true,
    onEnd:e=>{if(e.oldIndex!==e.newIndex)saveSecOrder();}}));
}
function moveSecKey(g,dir){
  const el=g.closest('[data-mkey]');if(!el||el.parentElement!==$('#view'))return;
  const kids=keyedKids();const i=kids.indexOf(el);const j=i+dir;if(j<0||j>=kids.length)return;
  if(dir<0)kids[j].before(el);else kids[j].after(el);
  saveSecOrder();g.focus();el.scrollIntoView({block:'nearest'});
  toast(`Moved ${dir<0?'up':'down'}`);
}
// A tap on the handle must never fold the section or fire a button under it.
document.addEventListener('click',e=>{if(e.target&&e.target.closest&&e.target.closest('.sgrip,.bgrip')){e.preventDefault();e.stopPropagation();}},true);
document.addEventListener('keydown',e=>{
  const dg=e.target&&e.target.closest&&e.target.closest('.dgrip');
  if(dg&&(e.key==='ArrowUp'||e.key==='ArrowDown')){
    e.preventDefault();const R=curRoutineB();const i=+dg.dataset.di;const j=i+(e.key==='ArrowUp'?-1:1);
    if(R.schedule==='weekly'||!R.days[i]||j<0||j>=R.days.length)return;
    move(R.days,i,j);ui.todayDay=null;ui.bTarget=0;commit();rerenderKeepScroll();
    const n=document.querySelector(`.dgrip[data-di="${j}"]`);if(n)n.focus();
    toast(`${R.days[j].name||'Day'} is now ${dayLabel(R,j)}`);return;
  }
  const bg=e.target&&e.target.closest&&e.target.closest('.bgrip');
  if(bg&&(e.key==='ArrowUp'||e.key==='ArrowDown')&&state.draft){
    e.preventDefault();const i=+bg.dataset.b;const j=i+(e.key==='ArrowUp'?-1:1);if(j<0||j>=state.draft.ex.length)return;
    moveBlock(i,j);rerenderKeepScroll();const n=document.querySelector(`.bgrip[data-b="${j}"]`);if(n)n.focus();toast(`Moved to position ${j+1}`);return;
  }
  const g=e.target&&e.target.closest&&e.target.closest('.sgrip');if(!g)return;
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();moveSecKey(g,e.key==='ArrowUp'?-1:1);}
  else if(e.key===' '||e.key==='Enter')e.preventDefault();
},true);
/* ---------- drag and drop ---------- */
function mountSortable(){
  if(!window.Sortable)return;
  document.querySelectorAll('ul.items').forEach(el=>{
    sortables.push(window.Sortable.create(el,{group:{name:'days',pull:true,put:['days']},handle:'.grip',animation:150,fallbackOnBody:true,
      onEnd:evt=>{
        const from=+evt.from.dataset.day,to=+evt.to.dataset.day;
        if(evt.to.id==='bLib'||isNaN(to)){setTimeout(rerenderKeepScroll,0);return;}
        if(from===to&&evt.oldIndex===evt.newIndex)return;
        const R=curRoutineB();if(!R.days[from]||!R.days[to]){setTimeout(rerenderKeepScroll,0);return;}
        const [it]=R.days[from].items.splice(evt.oldIndex,1);
        if(it){R.days[to].items.splice(evt.newIndex,0,it);if(R.days[to].rest)R.days[to].rest=false;}
        commit();setTimeout(rerenderKeepScroll,0);
      }}));
  });
  // Days reorder by their ⠿ handle in a numbered cycle. Labels come from
  // position, so the renumbering is automatic; same effect as the ↑/↓ Day buttons.
  const dl=$('#dayList');
  if(dl&&curRoutineB().schedule!=='weekly')sortables.push(window.Sortable.create(dl,{group:{name:'dayorder',pull:false,put:false},handle:'.dgrip',draggable:'section.day',animation:150,fallbackOnBody:true,
    onEnd:evt=>{
      if(evt.oldIndex===evt.newIndex)return;
      const R=curRoutineB();if(!R.days[evt.oldIndex]||evt.newIndex<0||evt.newIndex>=R.days.length){setTimeout(rerenderKeepScroll,0);return;}
      move(R.days,evt.oldIndex,evt.newIndex);ui.todayDay=null;ui.bTarget=0;commit();setTimeout(rerenderKeepScroll,0);
      toast(`${R.days[evt.newIndex].name||'Day'} is now ${dayLabel(R,evt.newIndex)}`);
    }}));
  const lib=$('#bLib');
  if(lib)sortables.push(window.Sortable.create(lib,{group:{name:'days',pull:'clone',put:false},sort:false,handle:'.grip',animation:150,fallbackOnBody:true,
    onEnd:evt=>{
      if(evt.to===evt.from)return;
      const to=+evt.to.dataset.day;const exId=evt.item.dataset.ex;const R=curRoutineB();
      if(!isNaN(to)&&exId&&R.days[to]){R.days[to].items.splice(evt.newIndex,0,newItem(exId));if(R.days[to].rest)R.days[to].rest=false;commit();toast(`${exName(exId)} added to ${dayLabel(R,to)}`);}
      setTimeout(rerenderKeepScroll,0);
    }}));
}

/*ai{*//* ---------- Claude features (sample capability) ----------
   Everything here runs on the viewer's own Claude plan and only on a tap.
   The page works fully without it: when the viewer cannot use Claude, the
   buttons are hidden. The set parser below needs no Claude at all; Claude is
   asked only when the parser cannot read what was typed. */
const AI={fn:null,ready:false,off:false,ctl:null};
async function aiInit(){
  try{
    if(!window.claude||typeof window.claude.use!=='function')return;
    const f=await window.claude.use('sample');
    if(typeof f==='function'){AI.fn=f;AI.ready=true;if(ui.modal)renderModal();else if(ui.tab==='dash'||state.draft)rerenderKeepScroll();}
  }catch(e){log('ai',e);}
}
const aiOn=()=>AI.ready&&!AI.off;
function aiErr(e){
  const c=e&&e.code;
  if(['not_granted','sampling_disabled','not_declared','capability_disabled','capability_removed','tools_unavailable','images_unavailable'].includes(c)){AI.off=true;return 'Claude is not available in this view.';}
  if(c==='cancelled')return '';
  if(c==='rate_limited')return 'Claude is busy or your usage limit was reached. Try again later.';
  if(c==='session_expired')return 'Sign in to Claude again, then try again.';
  if(c==='prompt_too_large')return 'That is too much history to send at once. Ask about something narrower.';
  if(c==='refused')return 'Claude declined this request. Rephrase it and try again.';
  if(c==='invalid_json')return 'The reply could not be read. Try again.';
  if(c==='empty_completion')return 'Claude returned nothing. Try again with a shorter request.';
  return 'The connection to Claude failed. Try again.';
}
const setTxt=(ex,s)=>`${s.warm?'warm-up ':''}${s.drop?'drop ':''}${loadLabel(ex,+s.w||0)}${ex.bw?'':' '+U()} ${ex.timed?`held ${s.r} s`:`x ${s.r}`}${!ex.timed&&s.rir!=null&&s.rir!==''?` @ RIR ${s.rir}`:''}${s.cal?` (calibration set: predicted ${s.cal.pred} left at rep ${s.cal.at})`:''}`;
function sessTxt(ss){
  const tag=ss.deload?' (deload)':ss.light?' (lighter)':'';
  const body=ss.ex.map(b=>{const ex=EX(b.exId);return `  ${ex.name} (load ${loadWords(ex)}${ex.perSide?', reps per side':''})${b.rr?` [planned ${repSpan(b.rr[0],b.rr[1],'-')} reps]`:''}: ${b.sets.map(s=>setTxt(ex,s)).join(', ')}${b.note?` (note: ${b.note})`:''}`;}).join('\n');
  const ck=ss.chk?`, check-in ${CHK_Q.filter(([k])=>ss.chk[k]).map(([k,l,n])=>`${l.toLowerCase()} ${chkWord(n[ss.chk[k]-1])}`).join(', ')}`:'';
  return `${ss.date} ${ss.dayName.replace(/ \((lighter|deload)\)$/,'')}${tag}${ss.free?' (freestyle)':''}${ss.durMin?`, ${ss.durMin} min`:''}${ck}\n${body}${ss.notes?`\n  Session note: ${ss.notes}`:''}`;
}
/* A plain-text picture of the training: routine, weekly volume against the
   bands, strength trends, stalls, body data, then sessions newest first,
   trimmed from the oldest end to stay well under the 64 KB input cap. */
function aiDigest(maxBytes){
  const I=IDX();const R=activeRoutine();const bands=state.settings.bands;const L=[];
  if(state.settings.heightCm)L.push(`Height: ${heightTxt(state.settings.heightCm)}.`);
  L.push(`Units: ${U()}. For bodyweight exercises the load shown is added weight (BW = bodyweight only). RIR = reps in reserve. Warm-up sets are excluded from analysis. Timed holds are logged in seconds.`);
  if(state.settings.rirMode==='off')L.push('RIR tracking is switched off in this app: every working set counts as hard and estimates use reps alone.');
  else if(state.settings.rirMode==='cal'){const c=calStats();if(c.recent>=2&&c.bias)L.push(`RIR correction is on: logged RIR is shifted by ${c.bias>0?'+':''}${c.bias} (median calibration error) before analysis.`);}
  {const c=calStats();if(c.n)L.push(`Calibration sets: ${c.n}; median error ${c.bias>0?'+':''}${c.bias} reps (positive means the lifter stops with more reps left than they call).`);}
  L.push(`Active routine "${R.name}", ${R.schedule==='weekly'?'fixed weekdays':`${R.days.length}-day cycle`}:`);
  R.days.forEach((d,i)=>L.push(`- ${dayLabel(R,i)} ${d.name}${d.rest?': rest':': '+d.items.map(it=>`${exName(it.exId)} ${it.sets}x${repSpan(it.repMin,it.repMax,'-')} @${it.rir} RIR, ${it.rest}s rest`).join('; ')}`));
  const avg=actualAvg4();
  if(avg)L.push(`Hard sets per week, average over the last ${avg._weeks} trained week(s), direct 1 and secondary 0.5, with target band: ${MK.filter(m=>(avg[m]||0)>0||(!TRACK_ONLY.has(m)&&bands[m][0]>0)).map(m=>`${ML[m]} ${r1(avg[m]||0)} (${TRACK_ONLY.has(m)?'tracked only, no target':`${bands[m][0]}-${bands[m][1]}`})`).join(', ')}.`);
  else L.push('No complete training week in the last 4 weeks yet, so weekly volume is not established.');
  if(I.scores.length)L.push(`Strength trend (median e1RM change over up to 6 weeks, current rep range): ${I.scores.map(s=>`${ML[s.m]} ${s.clear?`${s.score>=0?'+':''}${r1(s.score)}%`:'unclear'}`).join(', ')}.`);
  const st=stalledIds();if(st.length)L.push(`Stalled (flat 3 weeks or more, no PR in the last 3 sessions): ${st.map(exName).join(', ')}.`);
  const inj=state.injuries||[];if(inj.length)L.push(`Injury flags: ${inj.map(x=>injLabel(x.m)+(x.note?` (${x.note})`:'')).join(', ')}.`);
  if(isDeloadWeek())L.push('This week is a deload week.');
  const bws=[...state.bodyweights].sort((a,b)=>a.date<b.date?-1:1).slice(-6);
  if(bws.length)L.push(`Bodyweight: ${bws.map(b=>`${b.date} ${fmtW(b.kg)} ${U()}`).join(', ')}.`);
  const ms=[...state.measurements].sort((a,b)=>a.date<b.date?-1:1).slice(-4);
  if(ms.length)L.push(`Tape (${LU()}): ${ms.map(m=>`${m.date} `+MEAS.filter(([k])=>m[k]>0).map(([k,l])=>`${l} ${lenD(m[k])}`).join(', ')).join('; ')}.`);
  const head=L.join('\n');
  const ss=sortedSessions().filter(x=>!x.demo).reverse();
  const out=[];let size=head.length+200;
  for(const x of ss){const t=sessTxt(x);if(size+t.length>maxBytes)break;out.push(t);size+=t.length+1;}
  return `${head}\n\nSessions, newest first (${out.length} of ${ss.length}):\n${out.join('\n')||'none'}`;
}

/*}ai=
const AI={fn:null,ready:false,off:true,ctl:null};function aiInit(){}const aiOn=()=>false;

*//* Typed or dictated sets. Examples it reads:
   "235x5, 5, 4 rir 1"   three sets at 235, RIR 1 on each
   "185x8@2 205x6@1"      load changes mid-exercise, RIR per set
   "225 for 5 5 4 at 1"   "for" and "at" work like x and @ (RIR 1 on the last set)
   "bw x 10, bw+25 x 6"   bodyweight exercises, added load after the plus
   A bare number after the first set repeats the last load. Anything it
   cannot read returns null, and Claude is asked instead. */
/* rpe: effort is entered as RPE (Settings, r33), so @8 is RPE 8, saved as
   RIR 2. "rpe 8" at the end is RPE in either mode, as "rir 2" is RIR. */
function parseSets(text,ex,defW,conv,rpe){
  conv=conv||fromD;
  const fromRpe=v=>v>=1&&v<=10?Math.round((10-v)*10)/10:NaN;
  let s=String(text||'').toLowerCase().replace(/[×*]/g,'x').replace(/\bfor\b/g,'x').replace(/\bat\b/g,'@').replace(/\breps?\b/g,'').replace(/\blbs?\b|\bkgs?\b/g,'');
  let allRir=null;const m=s.match(/\b(rir|rpe)\s*(\d+(?:\.\d+)?)\s*$/);if(m){allRir=m[1]==='rpe'?fromRpe(+m[2]):+m[2];if(!isFinite(allRir))return null;s=s.slice(0,m.index);}
  s=s.replace(/\s*x\s*/g,'x').replace(/\s*@\s*/g,'@').replace(/\s*\+\s*/g,'+').trim();
  if(!s)return null;
  const toks=s.split(/[\s,;/]+/).filter(Boolean);
  const re=/^(?:(bw)(?:\+(\d+(?:\.\d+)?))?x|(\d+(?:\.\d+)?)x)?(\d{1,3})(?:@(\d+(?:\.\d+)?))?$/;
  let w=defW==null?null:defW;const out=[];
  for(const t of toks){
    const g=t.match(re);if(!g)return null;
    if(g[1])w=g[2]?conv(+g[2]):0;else if(g[3]!=null)w=conv(+g[3]);
    const r=+g[4];if(!(r>=1&&r<=100))return null;
    const rir=g[5]!=null?(rpe?fromRpe(+g[5]):+g[5]):allRir;if(rir!=null&&!(rir>=0&&rir<=10))return null;
    if(w==null&&!ex.bw)return null;
    out.push({w:w==null?0:w,r,rir});
  }
  return out.length&&out.length<=20?out:null;
}
/*ai{*/function aiSetsValid(a){
  if(!Array.isArray(a)||!a.length||a.length>20)return null;
  const out=[];let w=null;
  for(const x of a){if(!x||typeof x!=='object')return null;
    if(x.w!=null){if(!(isFinite(+x.w)&&+x.w>=0&&+x.w<=3000))return null;w=fromD(+x.w);}
    const r=Math.round(+x.r);if(!(r>=1&&r<=100))return null;
    const rir=x.rir==null||x.rir===''?null:+x.rir;if(rir!=null&&!(rir>=0&&rir<=10))return null;
    out.push({w:w==null?0:w,r,rir});}
  return out;
}
/*}ai=*/function fillSets(bi,list){
  const d=state.draft;const b=d&&d.ex[bi];if(!b)return 0;
  // On an assisted lift the numbers typed or said are the machine's help.
  if(EX(b.exId).assist)for(const p of list)if(p.w>0)p.w=-p.w;
  let si=b.sets.findIndex(x=>!x.done&&!x.warm);if(si<0)si=b.sets.length;
  for(const p of list){
    if(si>=b.sets.length)b.sets.push({w:null,r:null,rir:null,warm:false,drop:false,done:false});
    const x=b.sets[si];x.w=p.w;x.r=p.r;x.rir=p.rir;x.warm=false;x.drop=false;x.done=true;si++;
  }
  saveNow();return list.length;
}
/*ai{*/function aiRun(m,input,tier,onDone){
  if(!aiOn())return;
  const ctl=new AbortController();AI.ctl=ctl;m.busy=true;m.err='';m.out='';renderModal();
  AI.fn(input,{signal:ctl.signal,modelTier:tier||'default',onText:({text})=>{m.out=text;const o=document.getElementById('aiOut');if(o)o.textContent=text;}})
    .then(r=>{if(ui.modal!==m)return;m.out=r.text;m.done=true;onDone&&onDone(r);})
    .catch(e=>{if(ui.modal!==m)return;m.out=e&&typeof e.text==='string'?e.text:'';m.err=aiErr(e);})
    .finally(()=>{if(AI.ctl===ctl)AI.ctl=null;if(ui.modal!==m)return;m.busy=false;renderModal();});
}
const AI_STYLE='Write plain text only: no markdown, no headings, no bullet symbols, no bold. Short paragraphs. Be direct and specific, give numbers where they help, and never invent data that is not in what follows. If the data is too thin to support a conclusion, say so in one sentence.';
function debriefPrompt(sid){
  const ss=state.sessions.find(x=>x.id===sid);if(!ss)return null;
  const prev=ss.ex.map(b=>{const ex=EX(b.exId);const p=sortedSessions().filter(x=>x.date<ss.date||(x.date===ss.date&&x.id!==ss.id)).reverse().find(x=>x.ex.some(y=>y.exId===b.exId));
    if(!p)return `  ${ex.name}: first logged session.`;const pb=p.ex.find(y=>y.exId===b.exId);return `  ${ex.name}, ${p.date}: ${pb.sets.map(s=>setTxt(ex,s)).join(', ')}`;}).join('\n');
  return `You are an experienced strength and hypertrophy coach reviewing one training session for your client. ${AI_STYLE} Keep it under 170 words. Cover: what went well, the single most useful change for next time with specific loads or reps, and anything in the numbers that looks like fatigue, poor warm-up practice or a logging mistake.\n\nSESSION JUST LOGGED\n${sessTxt(ss)}\n\nPREVIOUS TIME FOR EACH EXERCISE\n${prev}\n\nCONTEXT\n${aiDigest(24000)}`;
}
function reviewPrompt(q){
  return `You are an experienced strength and hypertrophy coach with your client's complete training log in front of you. ${AI_STYLE} Keep it under 280 words. Answer this question from the client: "${q}"\n\nTRAINING LOG\n${aiDigest(52000)}`;
}
function swapPrompt(b,reason){
  const ex=EX(b.exId);const mus=new Set([ex.primary,...ex.secondary]);
  const cands=state.exercises.filter(e=>!e.archived&&e.id!==ex.id&&(e.primary===ex.primary||mus.has(e.primary))).sort((a,c)=>(c.primary===ex.primary)-(a.primary===ex.primary)).slice(0,70);
  if(!cands.length)return null;
  const inDay=new Set(state.draft.ex.map(x=>x.exId));
  return {cands,text:`A lifter needs to swap one exercise during a session. Pick up to 3 replacements from the list, best first, that train the same main muscle through a similar range and are practical right now. Avoid exercises already in today's session unless nothing else fits. ${reason?`Reason for the swap: "${reason}".`:'No reason given.'}\n\nExercise to replace: ${ex.name} (main: ${ML[ex.primary]}${ex.secondary.length?`, also ${ex.secondary.map(m=>ML[m]).join(', ')}`:''}; ${EQL[ex.equip]||ex.equip}). Planned ${b.plan.sets}x${repSpan(b.plan.repMin,b.plan.repMax,'-')}.\nAlready in today's session: ${[...inDay].map(exName).join(', ')}.\nInjury flags: ${(state.injuries||[]).map(x=>ML[x.m]).join(', ')||'none'}.\n\nCandidates (id | name | main muscle | equipment):\n${cands.map(e=>`${e.id} | ${e.name} | ${ML[e.primary]} | ${EQL[e.equip]||e.equip}`).join('\n')}\n\nReply with only JSON: {"picks":[{"id":"<id from the list>","why":"<one short sentence>"}]}`};
}
/*}ai=*/
window.__onLib=(which)=>{if((which==='chart'&&ui.tab==='dash')||(which==='sortable'&&ui.tab==='program'))rerenderKeepScroll();};
trashTidy();
window.__ironlog={get state(){return state;},set state(v){state=v;},plainTemplate,trashTidy,ENV,KEY,COMMON,COMMON_TIP,isCommon,bwEvery,isRestWeek,sessCmp,avgWeeks,weekStreak,coach,noLog,afterSet,adjOn,bwAt,newBlock,cycleState,sortedSessions,addDays,loadIn,gymRack,gymClean,dbListOf,capOf,refreshEx,effShow,rirScale,setStr,libExercises,obGate,obTour,andList,belowMin,aboveMax,starterRoutine,starterSigs,plateList,exBarKg,VOL_MODES,liveLogFetch,regionSrc,fitTargets,firstFullWeek,moveBlock,BANDS,installSheet,siteHost,greyW,effW,greyR,lighterLoad,incOf,swapPlan,planSetsPerWeek,weekNeed,stepRead,e1inv,rtfAt,rtfOf,rtfBand,calStats,rirEff,isHard,setCredit,tonnage,loadMode,loadWords,loadNote,progStep,jumpCap,setSecs,setupSecs,recovery,rolling7,rankDays,rankExercises,isCompound,patternOf,noE1,whtrLine,exHeadline,remainMin,shortPlan,weekPlan,cycleProjection,lastLighterWeek,regionBalance,parseHeight,mixCheck,swapCands,eqPlan,exportCSV,importData,chunksOf,assemble,sessionMuscles,TRACK_ONLY,cloud,Hx,mergeChunk,baseOf,sync:()=>cq(cloudPull),TEMPLATES,lastRFor,impDate,impRows,impNorm,impMatch,impFromText,impFromTable,impHeader,impBuild,impStart,impXlsx,parseSets,undoStack,undoRestore,undoForget,allTimeBests,bestsBoard,obActive,fmtW,rirUsual,rirEst,routineFromTemplate,plannedSets,map3d:()=>({state:B3.state,fail:B3.fail,meshes:B3.meshes.length,yaw:B3.yaw,glow:Object.keys(B3.mats).filter(m=>B3.mats[m].emissiveIntensity>0),canvas:!!document.querySelector('#bm3d canvas'),colors:Object.fromEntries(Object.entries(B3.mats).map(([m,mt])=>[m,'#'+mt.color.getHexString()])),pick:(x,y)=>map3dPick(x,y),want:map3dColors()}),cloudState:()=>({on:cloud.on,status:cloud.status,err:cloud.err,uid:cloud.uid,acct:cloud.acct}),acctUser:()=>acct.user,acctWaiting:()=>!!acctWait.pw,flush:()=>cq(cloudFlush),backupDue,routineUpdates,planFor,platesMode,plateText,chunksOf,IDX,suggest,e1,render,ACT,ui,makeDemo,invalidate,normalize,snapshot,saveNow,timer,weekStats,weekStart,today,EX,blockProgress,dayMinutes,weekStreak,coach,tonnageNow,livePR,movers,stalledIds,muscleStatus,actualAvg4,plannedPerWeek,parseSets,/*ai{*/aiSetsValid,fillSets,/*}ai=fillSets,*/newBlock,lastNoteOf,sizeRows,sessionMuscleSets,sessionCapNote,routineClutter,rowBlank,dayReasons,impTextSets,liftTrend,prsWithin,activeRoutine,rackStep,repFloor,sessionLength,prBeat,exInjury,exJoints,openModal,EQUIP,HARD_EX,recentLighter,planEvidenceNote,howToUrl,editFp,toast,avgWeeks,regionWk,REGION_WKS,SAFETY_TXT,libFiltered,nameMatch,workLoad,fitE,offSession,tagged,fatigueStalls,avgWeeksTxt,routineFromLog,repSpan,rangeWords,calDueIdx,readyCard,/*ai{*/aiDigest,debriefPrompt,reviewPrompt,swapPrompt,AI,/*}ai=*/sameRR,hintOnce,overSets,rackTol,daysOff,BACK_DAYS,prName,sessTm,effTgt,bwDueCard,bwNoLoad,applyPick,joinAdjacent,sameExOnce,goalState,goalLine,bwRefLoad,ML,exMusParts,musTrend};
render();
wakeOn();
timerResume();
cloudInit();
acctInit().catch(e=>log('auth',e));
aiInit();
undoRestore().catch(e=>log('undo-load',e));
})();
