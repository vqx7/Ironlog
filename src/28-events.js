/* ---------- tips ----------
   Any element with data-tip shows it: after a short hover with a mouse, on
   keyboard focus, or when held for about half a second on a touch screen.
   A hold never also fires the tap underneath. The small i buttons show their
   tip on a plain tap too. */
function tipi(text,label){return `<button type="button" class="tipi" data-tip="${esc(text)}" aria-label="${esc(label||'More')}">i</button>`;}
const TIP={el:null,t:null,hold:null,x:0,y:0,swallow:false};
function tipShow(el){
  const box=$('#tip');const txt=el&&el.getAttribute('data-tip');if(!box||!txt)return;
  TIP.el=el;box.textContent=txt;box.hidden=false;
  const r=el.getBoundingClientRect(),b=box.getBoundingClientRect(),vw=window.innerWidth,vh=window.innerHeight;
  let top=r.top-b.height-8;if(top<8)top=r.bottom+8;if(top+b.height>vh-8)top=Math.max(8,vh-b.height-8);
  let left=r.left+r.width/2-b.width/2;left=Math.max(12,Math.min(left,vw-b.width-12));
  box.style.top=top+'px';box.style.left=left+'px';
  el.setAttribute('aria-describedby','tip');
}
function tipHide(){clearTimeout(TIP.t);clearTimeout(TIP.hold);TIP.hold=null;const box=$('#tip');if(box)box.hidden=true;if(TIP.el){TIP.el.removeAttribute('aria-describedby');TIP.el=null;}}
document.addEventListener('pointerover',e=>{if(e.pointerType!=='mouse')return;const el=e.target.closest&&e.target.closest('[data-tip]');if(!el||el===TIP.el)return;clearTimeout(TIP.t);TIP.t=setTimeout(()=>tipShow(el),350);});
document.addEventListener('pointerout',e=>{if(e.pointerType!=='mouse')return;const el=e.target.closest&&e.target.closest('[data-tip]');if(el&&(!e.relatedTarget||!el.contains(e.relatedTarget)))tipHide();});
document.addEventListener('pointerdown',e=>{
  TIP.swallow=false;
  if(TIP.el&&!(e.target.closest&&(e.target.closest('.tipi')===TIP.el||e.target.closest('.hastip')===TIP.el)))tipHide();
  if(e.pointerType==='mouse')return;
  const el=e.target.closest&&e.target.closest('[data-tip]');if(!el)return;
  TIP.x=e.clientX;TIP.y=e.clientY;clearTimeout(TIP.hold);
  TIP.hold=setTimeout(()=>{TIP.hold=null;TIP.swallow=true;tipShow(el);try{navigator.vibrate&&navigator.vibrate(8);}catch(err){/* optional */}},480);
},true);
document.addEventListener('pointermove',e=>{if(TIP.hold&&(Math.abs(e.clientX-TIP.x)>10||Math.abs(e.clientY-TIP.y)>10)){clearTimeout(TIP.hold);TIP.hold=null;}},true);
document.addEventListener('pointerup',()=>{if(TIP.hold){clearTimeout(TIP.hold);TIP.hold=null;}},true);
document.addEventListener('pointercancel',()=>{clearTimeout(TIP.hold);TIP.hold=null;},true);
document.addEventListener('contextmenu',e=>{if(e.target.closest&&e.target.closest('[data-tip]'))e.preventDefault();});
/* On a phone nothing can be hovered, and a press and hold is not something
   anyone finds (r27). An explanation on a control's label gets a visible i
   button beside the label instead (a tap on the label still works the
   control), and dotted-underlined text shows its explanation on a tap. */
function tipLabels(root){
  if(!root||!root.querySelectorAll)return;
  const list=root.matches&&root.matches('label .hastip')?[root]:root.querySelectorAll('label .hastip');
  for(const sp of list){const t=sp.getAttribute('data-tip');if(!t)continue;
    const b=document.createElement('button');b.type='button';b.className='tipi';b.setAttribute('data-tip',t);b.setAttribute('aria-label','About '+(sp.textContent||'this').trim());b.textContent='i';
    sp.classList.remove('hastip');sp.removeAttribute('data-tip');sp.after(' ',b);}
  // A button inside a label spoils the control's spoken name (it read "About
  // Auto-mark..." twice, or fell back to the placeholder), so the control is
  // named by its label text alone.
  const labs=root.matches&&root.matches('label')?[root]:root.querySelectorAll('label');
  for(const lb of labs){if(!lb.querySelector(':scope > .tipi, :scope > span + .tipi'))continue;const c=lb.querySelector('input,select,textarea');if(!c||c.hasAttribute('aria-labelledby')||c.hasAttribute('aria-label'))continue;
    const sp=[...lb.children].find(x=>x.tagName==='SPAN'&&!x.classList.contains('tipi')&&x.textContent.trim());if(!sp)continue;
    if(!sp.id)sp.id='lt'+(++tipLabels.n);c.setAttribute('aria-labelledby',sp.id);}
}
tipLabels.n=0;
new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)tipLabels(n);}).observe(document.body,{childList:true,subtree:true});
tipLabels(document.body);
document.addEventListener('click',e=>{
  if(TIP.swallow){TIP.swallow=false;e.preventDefault();e.stopPropagation();return;}
  const i=e.target.closest&&(e.target.closest('.tipi')||((e.target.closest('.hastip')&&!e.target.closest('label,button,a,summary,[data-act]'))?e.target.closest('.hastip'):null));
  if(i){e.preventDefault();e.stopPropagation();if(TIP.el===i)tipHide();else tipShow(i);}
},true);
document.addEventListener('focusin',e=>{const el=e.target;if(el&&el.matches&&el.matches('[data-tip]')){try{if(el.matches(':focus-visible'))tipShow(el);}catch(err){/* old browsers */}}});
document.addEventListener('focusout',()=>tipHide());
window.addEventListener('scroll',()=>{if(TIP.el)tipHide();},{passive:true});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&TIP.el)tipHide();});

/* ---------- events ---------- */
/* The sign-in sheet is a real form so the phone offers to save and fill the
   password; it never navigates. Enter submits it through its button. */
document.addEventListener('submit',e=>{if(e.target&&e.target.id==='acctForm'){e.preventDefault();const b=e.target.querySelector('[data-act="acctSubmit"]');
  // Go on the keyboard in the code field confirms with the code (r45); elsewhere it submits as before.
  if(document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.abind==='code'){ACT.acctCode();return;}
  if(b&&!b.disabled&&!(e.submitter===b))ACT.acctSubmit();}});
document.addEventListener('click',e=>{
  const tab=e.target.closest('#tabs button');
  if(tab){ui.tab=tab.dataset.tab;if(ui.tab==='program')ui.planView='routine';window.scrollTo(0,0);render();return;}
  /* A tap outside a sheet closes it, unless something was typed there: a
     half-filled new exercise or note is not thrown away by a stray tap. */
  if(e.target.id==='modal'){if(ui.modal&&ui.modal.dirty){toast(DIRTY_SAID);return;}closeModal();return;}
  const t=e.target.closest('[data-act]');if(!t)return;
  // getAttribute rather than dataset: the muscle map's targets are SVG groups.
  const fn=ACT[t.getAttribute('data-act')];if(fn){e.preventDefault();fn(t,e);}
});
// Muscle-map groups are focusable; Enter or Space activates them like a button.
document.addEventListener('keydown',e=>{
  // Enter fills the sets in Type or dictate sets (r30), as the button does.
  if(e.key==='Enter'&&e.target&&e.target.id==='qTxt'){e.preventDefault();ACT.qFill();return;}
  const g=e.target&&e.target.closest&&e.target.closest('g[data-act]');
  if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault();g.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(ui.modal&&FORM_SHEETS.has(ui.modal.kind)&&t&&t.closest&&t.closest('#modal'))ui.modal.dirty=true;
  if(t.id==='incVal'&&ui.modal&&ui.modal.kind==='inc')ui.modal.typed=true;
  if(t.dataset.cf&&state.draft&&state.draft.cardio){const c=state.draft.cardio[+t.dataset.c];if(!c)return;const k=t.dataset.cf;
    if(k==='min'){const n=numIn(t.value);c.min=n==null||n<=0?null:Math.min(Math.round(n),600);}
    else if(k==='hr'){const n=numIn(t.value);c.hr=n!=null&&n>=30&&n<=230?Math.round(n):null;}
    else if(k==='dist'){const v=distIn(t.value);if(v==null)delete c.dist;else c.dist=v;}
    else if(k==='kind'&&CARDIOL[t.value])c.kind=t.value;else if(k==='when'&&CWHENL[t.value])c.when=t.value;
    saveSoon();return;}
  if(t.dataset.f&&state.draft){const s=draftSet(t);if(!s)return;const v=t.value;
    // Clamp what gets stored. The field keeps whatever was typed so the user is
    // not fought mid-keystroke, but history can never take a negative load or
    // an impossible rep count, which used to push session volume negative.
    if(t.dataset.f==='w'){const n=numIn(v);const bx=state.draft.ex[+t.dataset.b];const as=bx&&EX(bx.exId).assist;s.w=n==null?null:as?-fromD(Math.min(Math.abs(n),660)):fromD(Math.min(Math.max(n,0),20000));if(s.w===0)s.w=0;carried.delete(s);}
    else if(t.dataset.f==='r'){const n=numIn(v);s.r=n==null?null:Math.min(Math.max(Math.floor(n+1e-9),0),1000);refreshGrey(+t.dataset.b);} // whole reps: 8.5 is 8, a partial rep not a rep (r55; r54 stored 9)
    else{const n=numIn(v);s.rir=n==null?null:Math.min(Math.max(n,0),10);if(t.tagName==='SELECT')t.classList.toggle('unset',v==='');}
    if(t.dataset.f!=='rir')updateProgress(+t.dataset.b);
    if(t.dataset.f==='w'){updatePlates(+t.dataset.b,+t.dataset.s);refreshGreyW(+t.dataset.b);}
    saveSoon();return;}
  if(t.dataset.it){const f=findItem(t.dataset.uid);if(!f)return;
    if(t.dataset.it==='jump'&&!String(t.value).trim()){delete f.it.jump;saveSoon();invalidate();return;}
    const n=numIn(t.value);if(n==null)return;
    const k=t.dataset.it;const cl=(x,lo,hi)=>Math.min(Math.max(x,lo),hi);
    if(k==='jump'){f.it.jump=Math.round(cl(n,0,20)*10)/10;saveSoon();invalidate();return;}
    if(k==='inc'){const e=state.exercises.find(x=>x.id===f.it.exId);const v=fromD(cl(n,0,500));f.it.inc=v;if(e)e.inc=v>0?v:null;saveSoon();invalidate();return;}
    f.it[k]=k==='rir'?cl(effIn(n),0,10):k==='sets'?cl(Math.round(n),1,30):k==='rest'?cl(Math.round(n),0,1800):cl(Math.round(n),1,600);
    saveSoon();invalidate();return;}
  if(t.dataset.band){const n=numIn(t.value);if(n==null)return;state.settings.bands[t.dataset.band][+t.dataset.bi]=Math.min(Math.max(Math.round(n*2)/2,0),100);saveSoon();return;}
  if(t.dataset.dayname!=null){curRoutineB().days[+t.dataset.dayname].name=t.value;saveSoon();return;}
  if(t.dataset.fbind&&ui.modal&&ui.modal.kind==='feedback'){ui.modal[t.dataset.fbind]=t.value;ui.modal.dirty=true;const c=document.getElementById('fbCount');if(c&&t.dataset.fbind==='msg')c.textContent=`${t.value.length} / ${FB_MAX}`;return;}
  if(t.dataset.abind&&ui.modal&&ui.modal.kind==='account'){ui.modal[t.dataset.abind]=t.value;if(ui.modal.err){ui.modal.err='';}return;}
  if(t.dataset.ebind&&ui.modal&&ui.modal.kind==='exEdit'){const k=t.dataset.ebind;if(t.type==='checkbox')return;ui.modal.e[k]=t.value;return;}
  if(t.dataset.mbind&&ui.modal&&ui.modal.kind==='picker'){ui.modal[t.dataset.mbind]=t.value;const pl=$('#pickList');if(pl){pl.innerHTML=pickerBody(ui.modal);pl.scrollTop=0;}return;}
  const b=t.dataset.bind;
  if(b==='routineName'){curRoutineB().name=t.value;saveSoon();return;}
  if(b==='draftNotes'){state.draft.notes=t.value;saveSoon();return;}
  if(b==='draftName'&&state.draft){state.draft.dayName=t.value.trim()?t.value.slice(0,40):'Freestyle';saveSoon();return;}
  if(b==='libQ'){ui.libQ=t.value;const el=$('#libList');if(el)el.innerHTML=libCards();return;}
  if(b==='bLibQ'){ui.bLibQ=t.value;const el=$('#bLib');if(el)el.innerHTML=bLibItems();return;}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(ui.modal&&FORM_SHEETS.has(ui.modal.kind)&&t&&t.closest&&t.closest('#modal'))ui.modal.dirty=true;
  if(t.id==='fbShot'&&t.files&&t.files[0]&&ui.modal&&ui.modal.kind==='feedback'){const m=ui.modal;const f0=t.files[0];
    if(f0.size>FB_IMG_MB*1048576){toast(`That image is over ${FB_IMG_MB} MB. Try a screenshot instead.`);t.value='';return;}
    if(f0.type&&!/^image\//.test(f0.type)){toast('Only an image can be attached.');t.value='';return;}
    fbShrink(f0).then(d=>{if(ui.modal!==m)return;if(!d){toast('That picture is too large');return;}m.shot=d;m.dirty=true;renderModal();},e=>{log('feedback',e);toast('Could not read that image. Try a screenshot (PNG or JPG).');});t.value='';return;}
  if(t.id==='impFile'&&t.files&&t.files[0]){const f=t.files[0];t.value='';impStart({file:f});return;}
  if(t.id==='importFile'&&t.files&&t.files[0]){const fr=new FileReader();fr.onload=()=>importData(String(fr.result));fr.onerror=()=>toast('Could not read that file');fr.readAsText(t.files[0]);t.value='';return;}
  if(t.dataset.it){const f=findItem(t.dataset.uid);
    /* Never a minimum above the maximum (r30: the editor saved "1 x 12-10",
       which nothing can read). The field just changed wins: a minimum typed
       above the maximum raises it, a maximum typed below the minimum lowers
       it, so typing 12 then 15 into a 6 to 10 range gives 12 to 15. */
    if(f&&(t.dataset.it==='repMin'||t.dataset.it==='repMax')&&+f.it.repMin>+f.it.repMax){if(t.dataset.it==='repMin')f.it.repMax=f.it.repMin;else f.it.repMin=f.it.repMax;toast(`Range set to ${repSpan(f.it.repMin,f.it.repMax,'-')}`);}
    if(f&&t.dataset.it!=='sets'){invalidate();syncDraftPlan(f);if(t.dataset.it==='inc')refreshEx(f.it.exId);}commit();rerenderKeepScroll();return;}
  if(t.dataset.gym){gymInput(t);return;}
  // The Set up page's bodyweight (r34): today's weigh-in, replaced if typed again, removed if cleared.
  if(t.id==='obBw'){const v=numIn(t.value);state.bodyweights=state.bodyweights.filter(b=>b.date!==today());
    if(v!=null){const kg=fromD(v);if(kg<BW_MIN_KG||kg>BW_MAX_KG){toast(`Bodyweight must be between ${fmtW(BW_MIN_KG)} and ${fmtW(BW_MAX_KG)} ${U()}`);t.value='';}else state.bodyweights.push({id:uid(),date:today(),kg});}
    commit();return;}
  if(t.dataset.band){const k=t.dataset.band;const b=state.settings.bands[k];if(b[0]>b[1])b.reverse();commit();rerenderKeepScroll();return;}
  if(t.dataset.dayname!=null){commit();rerenderKeepScroll();return;}
  if(t.dataset.dayrest!=null){const R=curRoutineB();const d=R.days[+t.dataset.dayrest];if(!d)return;snapshot();d.rest=t.checked;commit();rerenderKeepScroll();toast(t.checked?`${d.name||'Day'} is now a rest day. Its exercises are kept.`:`${d.name||'Day'} is a training day again`,true);return;}
  if(t.dataset.moveto){const f=findItem(t.dataset.moveto);if(!f)return;const to=+t.value;if(to===f.di)return;f.r.days[f.di].items.splice(f.i,1);f.r.days[to].items.push(f.it);Object.assign(f.r.days[to],trainOn(f.r.days[to]));commit();rerenderKeepScroll();toast(`Moved to ${dayLabel(f.r,to)}`);return;}
  if(t.dataset.ebind&&ui.modal&&ui.modal.kind==='exEdit'){const k=t.dataset.ebind;ui.modal.e[k]=t.type==='checkbox'?t.checked:t.value;if(k==='primary'){ui.modal.e.secondary=ui.modal.e.secondary.filter(x=>x!==t.value);renderModal();}if(k==='bw'){if(t.checked&&!ui.modal.e.bwfRaw)ui.modal.e.bwfRaw=String(Math.round(bwShare(ui.modal.e)*100));renderModal();}if(k==='plates'&&t.value==='auto')delete ui.modal.e.plates;if(k==='timed'||k==='equip'||k==='plates')renderModal();return;}
  if(ui.modal&&ui.modal.kind==='imp'){const m=ui.modal;
    if(t.dataset.imppick!=null){m.pick[t.dataset.imppick]=t.value;renderModal();return;}
    if(t.dataset.impmus!=null){if(ML[t.value])m.guess[t.dataset.impmus].primary=t.value;return;}
    if(t.dataset.impdate!=null){if(isDate(t.value)&&t.value<=today())m.date=t.value;else t.value=m.date;renderModal();return;}
    if(t.dataset.mapf!=null){m.tab.map[t.dataset.mapf]=t.value===''?undefined:+t.value;return;}}
  if(t.dataset.mbind)return;
  if(t.dataset.pbind==='date'&&ui.modal&&ui.modal.kind==='past'){if(isDate(t.value)&&t.value<=today())ui.modal.date=t.value;else toast('Pick today or an earlier date');renderModal();return;}
  if(t.dataset.cf&&state.draft&&state.draft.cardio){const c=state.draft.cardio[+t.dataset.c];if(c){const k=t.dataset.cf;if(k==='kind'&&CARDIOL[t.value])c.kind=t.value;else if(k==='when'&&CWHENL[t.value])c.when=t.value;saveNow();}return;}
  if(t.dataset.f==='r'&&state.draft){
    const bi=+t.dataset.b,si=+t.dataset.s;const s=draftSet(t);if(!s)return;if(s.r!=null&&t.value.trim()!==String(s.r))t.value=String(s.r); // the field shows the reps stored (r55)
    // The typed value is already stored (the input handler). A done set whose
    // reps were cleared is still undone, once the new rows are in place.
    if(rebuilding){if(s.done&&s.r==null)queueMicrotask(()=>{const b2=state.draft&&state.draft.ex[bi];const s2=b2&&b2.sets[si];if(s2&&s2.done&&s2.r==null)setDone(bi,si,false);});return;}
    // A set with no reps cannot be a done set; one typed as 0 is a missed set, ticked as typed (r55, V).
    if(s.done&&s.r==null){setDone(bi,si,false);t.dataset.cleared='1';} // marked, so leaving the field does not tick it again at the grey reps (r55, the audit)
    else if((state.settings.autoDone||state.draft.past)&&!s.done&&(+s.r>0||isMissed(s))){
      const toRir=!state.draft.past&&lastDown.el&&Date.now()-lastDown.t<700&&lastDown.el.closest&&lastDown.el.closest(`.rirb[data-b="${bi}"][data-s="${si}"]`);const toW=!toRir&&!state.draft.past&&lastDown.el&&Date.now()-lastDown.t<700&&lastDown.el.closest&&lastDown.el.closest(`.sg input[data-f="w"][data-b="${bi}"][data-s="${si}"]`); // heading for this row's load: tick when it is left, so the load is never written into the field being typed in (r55, the audit: 105 typed there became 101050)
      // Heading for this row's RIR box: tick when its strip closes (or after 2 s if it never opened).
      if(toW)pendAuto={b:blkRef(bi),s:si};else if(toRir){const p={b:blkRef(bi),s:si};pendAuto=p;setTimeout(()=>{if(pendAuto===p&&!document.querySelector('.rirstrip'))autoPending();},2000);} // by identity: a later tick must not run this one (r45)
      else{lastAuto={b:blkRef(bi),s:si,t:Date.now()};setDone(bi,si,true);}}
    else if(s.done&&isMissed(s)){setDone(bi,si,false);setDone(bi,si,true,true);} /* a ticked set changed to 0 asks, as a tick does, when its load is light (r55.1, the spec review) */else if(s.done){refreshPR(bi,si,false);afterSet(bi,si);}
    saveSoon();return;}
  if(t.dataset.f){
    if(t.dataset.f==='w'&&state.draft){const s=draftSet(t);if(!s)return;const bi=+t.dataset.b,si=+t.dataset.s;const rf=!!ui.refix&&ui.refix.s===si&&blkIdx(ui.refix.b)===bi;if(rf)ui.refix=null;if(s.done&&oddLoad(state.draft.ex[bi],si,state.draft.date)){setDone(bi,si,false);setDone(bi,si,true,true);return;}/* a ticked set's load changed to one far off asks too, unticked until it is answered; Log it, or the load fixed after Fix it, ticks it again, its rest not started over (r55; the second review: after Fix it it stayed unticked, and Log it restarted the rest) */if(rf&&!s.done)setDone(bi,si,true,true);else if(s.done){refreshPR(bi,si,false);afterSet(bi,si);}mixCheck(bi,si);if(fillLoads())carryLoad(bi,si);}
    if(t.tagName==='SELECT'&&state.draft){
      const s=draftSet(t);if(!s)return;const n=numIn(t.value);
      s.rir=n==null?null:Math.min(Math.max(n,0),10);
      t.classList.toggle('unset',t.value==='');
      // No invalidate() here. The draft is not part of IDX, so this only threw
      // away a cached index that every later read then had to rebuild, and
      // saveNow() stringified the entire state on every single tap.
      updateProgress(+t.dataset.b);
    }
    saveSoon();return;}
  const b=t.dataset.bind;if(!b)return;
  switch(b){
    case 'todayDay':ui.todayDay=+t.value;render();break;
    case 'draftDate':if(isDate(t.value)&&t.value<=today()){
      /* Last time and the targets are read as of the session's date, so a
         new date re-reads them; typed and ticked sets are left alone. */
      const d=state.draft;const moved=d.date!==t.value;d.date=t.value;
      if(moved&&!d.editingId){for(const b of d.ex)refreshBlock(b);saveNow();rerenderKeepScroll();}else saveNow();
    }else{t.value=state.draft.date;toast('A session cannot be dated in the future');}break;
    case 'bRoutine':ui.bRoutine=t.value;ui.openItem=null;render();break;
    case 'routineName':{const R=curRoutineB();if(!R.name.trim())R.name='Routine';if(nameTaken(R.name,R.id))toast('Another routine has the same name');commit();render();break;}
    case 'rSchedule':{
      const R=curRoutineB();const v=t.value==='weekly'?'weekly':'cycle';if(v===R.schedule)break;
      if(v==='weekly'&&R.days.length>7){toast(`Fixed weekdays needs exactly 7 days. Remove ${R.days.length-7} first.`);rerenderKeepScroll();break;}
      snapshot();
      if(v==='weekly')while(R.days.length<7)R.days.push({id:uid(),name:'Rest',rest:true,items:[]});
      R.schedule=v;ui.todayDay=null;commit();rerenderKeepScroll();
      toast(v==='weekly'?'Days are now pinned to Monday to Sunday':'Days are now a numbered cycle',true);break;}
    case 'bLibM':ui.bLibM=t.value;rerenderKeepScroll();break;
    case 'bTarget':ui.bTarget=+t.value;ui.dayFocus=undefined;rerenderKeepScroll();break;
    case 'libM':case 'libE':ui[b]=t.value;rerenderKeepScroll();break;
    case 'dashMuscle':ui.dashMuscle=t.value;rerenderKeepScroll();break;
    case 'dashEx':ui.dashEx=t.value;rerenderKeepScroll();break;
    case 'unit':state.settings.unit=t.value;commit();unitWords();render();break;
    case 'rirMode':state.settings.rirMode=['on','off','cal'].includes(t.value)?t.value:'on';commit();rerenderKeepScroll();toast(t.value==='off'?'RIR off: every working set counts as hard':t.value==='cal'?'RIR corrected by your calibration sets':'RIR on, used as logged');break;
    case 'theme':state.settings.theme=t.value;commit();render();break;
    case 'timerMode':state.settings.timerMode=t.value;if(t.value==='off')stopTimer();commit();rerenderKeepScroll();break;
    case 'timerSound':state.settings.timerSound=t.checked;if(t.checked)primeAudio();commit();break;
    case 'timerCompact':state.settings.timerCompact=t.checked;commit();if(!$('#timer').hidden)tick();break;
    case 'autoDone':state.settings.autoDone=t.checked;commit();rerenderKeepScroll();break;
    case 'loadFill':ACT.loadAsk({dataset:{v:t.checked?'fill':'grey'}});break;
    case 'rirScale':if(t.value==='half'||t.value==='rpe')state.settings.rirScale=t.value;else delete state.settings.rirScale;commit();rerenderKeepScroll();break;
    case 'rirAsk':if(t.checked)state.settings.rirAsk=true;else delete state.settings.rirAsk;commit();rerenderKeepScroll();break;
    case 'rirHalf':snapshot();if(t.checked)state.settings.rirHalf=true;else delete state.settings.rirHalf;invalidate();commit();rerenderKeepScroll();toast(t.checked?`${halfLbl()} now counts as half a set`:`Only ${effWord()} ${effShow(3)} ${rirScale()==='rpe'?'or more':'or less'} counts`,true);break;
    case 'smallPlates':if(t.checked)state.settings.smallPlates=true;else delete state.settings.smallPlates;commit();break;
    case 'bwEvery':{const v=+t.value;if(v===14||![0,7,30].includes(v))delete state.settings.bwEvery;else state.settings.bwEvery=v;commit();rerenderKeepScroll();break;}
    case 'todayStart':if(t.value==='free')state.settings.todayStart='free';else delete state.settings.todayStart;commit();rerenderKeepScroll();break;
    case 'autoAdj':if(t.checked)delete state.settings.autoAdj;else state.settings.autoAdj=false;commit();break;
    case 'wakeLock':state.settings.wakeLock=t.checked;commit();if(t.checked&&state.draft)wakeOn();else if(!t.checked)wakeOff();break;
    case 'timeBudget':{const n=numIn(t.value);state.settings.timeBudget=n==null||n<10?null:Math.min(Math.round(n),300);commit();break;}
    case 'height':{const v=t.value.trim();if(!v){state.settings.heightCm=null;commit();rerenderKeepScroll();break;}
      const cm=parseHeight(v);if(cm==null){toast(U()==='lb'?'Enter height like 5\'10 or 70 (inches)':'Enter height in cm, like 178');break;}
      state.settings.heightCm=cm;commit();rerenderKeepScroll();toast(`Height ${heightTxt(cm)}`);break;}
    case 'barKg':{const n=numIn(t.value);state.settings.barKg=n==null||n<=0?null:fromD(Math.min(n,U()==='lb'?110:50));commit();rerenderKeepScroll();break;}
    case 'userName':{const n=t.value.replace(/\s+/g,' ').trim().slice(0,40);if(n)state.settings.userName=n;else delete state.settings.userName;commit();break;}
    case 'bwGoalPct':{const n=numIn(t.value);state.settings.bwGoalPct=n==null?null:Math.min(Math.max(n,-2),2);commit();break;}
    case 'histEx':ui.histEx=t.value;ui.histLimit=HIST_PAGE;rerenderKeepScroll();break;
  }
});
document.addEventListener('toggle',e=>{
  const el=e.target;
  if(el&&el.classList&&el.classList.contains('more')&&ui.modal){ui.modal.moreOpen=el.open;return;}
  if(!el||!el.dataset||!el.dataset.sk)return;
  // A main section opened by openMain() stays a default, not a choice.
  if(el.dataset.auto){delete el.dataset.auto;}
  else ui.folds[el.dataset.sk]=el.open;
  // A chart created inside a closed <details> has no size; give it one now.
  if(el.open&&window.Chart)el.querySelectorAll('canvas').forEach(cv=>{const ch=window.Chart.getChart(cv);if(ch)try{ch.resize();}catch(err){/* chart gone */}});
},true);
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target&&e.target.id==='bwVal'){e.preventDefault();ACT.addBW();return;}
  // In a set row, Enter (the keyboard's Next) goes load, reps, then the next
  // set's load, which is the order sets are typed in.
  if(e.key==='Enter'&&e.target&&e.target.matches&&e.target.matches('.sg input[data-f]')){
    e.preventDefault();
    // Next on an empty reps field accepts the grey number (see acceptGrey).
    const t=e.target;
    if(t.dataset.f==='r'&&!t.value.trim())acceptGrey(+t.dataset.b,+t.dataset.s);
    const all=[...document.querySelectorAll('.sg input[data-f]')];const i=all.indexOf(e.target);
    const nx=all[i+1];if(nx){try{nx.focus();nx.select&&nx.select();}catch(x){/* focus is best effort */}}else e.target.blur();return;}
  if(e.key==='Escape'&&document.querySelector('.rirstrip')){rirClose();return;}
  if(e.key==='Escape'&&ui.modal){closeModal();return;}
  if(e.key!=='Tab'||!ui.modal)return;
  const f=modalFocusables();if(!f.length)return;
  const first=f[0],last=f[f.length-1],a=document.activeElement;
  if(e.shiftKey&&(a===first||!$('#modal').contains(a))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(a===last||!$('#modal').contains(a))){e.preventDefault();first.focus();}
});

/* Auto-mark and the grey reps. With auto-mark on, typing reps and leaving the
   field ticks the set (the change handler). Leaving an empty field whose grey
   number is last time's reps is the same confirmation without the typing, so
   it ticks the set with that number, like tapping the checkmark. The iPhone
   number pad has no Next key; its keyboard Done or a tap elsewhere is how a
   field is left there, so both routes land here. Moving to the same row's load
   or RIR is not leaving the set, a tap on a button does that button's job
   instead (the row's own checkmark already takes the grey number), and a
   locked or backgrounded phone blurs fields without the lifter doing anything. */
function acceptGrey(bi,si){
  if(!state.draft||!state.settings.autoDone||rebuilding)return false;
  const b=state.draft.ex[bi];const x=b&&b.sets[si];
  if(!x||x.done||x.warm||x.drop||+x.r>0)return false;
  const lr=greyR(b,si);if(!(lr>0))return false;
  x.r=Math.round(lr);const inp=document.querySelector(`.sg input[data-f="r"][data-b="${bi}"][data-s="${si}"]`);if(inp)inp.value=String(x.r);
  lastAuto={b:blkRef(bi),s:si,t:Date.now()};setDone(bi,si,true);return true;
}
let lastDown={el:null,t:0};
document.addEventListener('pointerdown',e=>{lastDown={el:e.target,t:Date.now()};},true);
document.addEventListener('focusout',e=>{
  const t=e.target;if(t&&t.matches&&t.matches('.sg input[data-f="w"]')&&pendAuto&&pendAuto.s===+t.dataset.s&&blkIdx(pendAuto.b)===+t.dataset.b){setTimeout(autoPending,0);return;}if(!t||!t.matches||!t.matches('.sg input[data-f="r"]')||t.value.trim())return;if(t.dataset.cleared){delete t.dataset.cleared;return;}
  if(rebuilding||!state.draft||!state.settings.autoDone)return;
  const bi=+t.dataset.b,si=+t.dataset.s;const to=e.relatedTarget;
  if(to&&to.dataset&&to.dataset.b===t.dataset.b&&to.dataset.s===t.dataset.s)return;
  // Where the lifter went: the newly focused element, or on an iPhone (where
  // buttons never take focus) whatever was just touched.
  const d=lastDown;const dest=to||(Date.now()-d.t<700&&d.el!==t?d.el:null);
  if(dest&&dest.closest&&!dest.closest('.sg input[data-f]')&&dest.closest('button,a,select,label,input,textarea,summary,[data-act],[role="button"]'))return;
  setTimeout(()=>{if(document.visibilityState!=='visible'||!document.hasFocus())return;acceptGrey(bi,si);},0);
});

