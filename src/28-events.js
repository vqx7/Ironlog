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
  if(workoutInput(t))return; // the session screen's (r60): a set's load and reps, cardio, the name, the notes
  if(planInput(t))return; // Plan's fields (r58): an exercise's numbers, a day's name, the routine's name, the searches
  if(t.dataset.band){bandInput(t);return;}
  if(t.dataset.fbind&&ui.modal&&ui.modal.kind==='feedback'){ui.modal[t.dataset.fbind]=t.value;ui.modal.dirty=true;const c=document.getElementById('fbCount');if(c&&t.dataset.fbind==='msg')c.textContent=`${t.value.length} / ${FB_MAX}`;return;}
  if(t.dataset.abind&&ui.modal&&ui.modal.kind==='account'){ui.modal[t.dataset.abind]=t.value;if(ui.modal.err){ui.modal.err='';}return;}
  if(t.dataset.ebind&&ui.modal&&ui.modal.kind==='exEdit'){const k=t.dataset.ebind;if(t.type==='checkbox')return;ui.modal.e[k]=t.value;return;}
  if(t.dataset.mbind&&ui.modal&&ui.modal.kind==='picker'){ui.modal[t.dataset.mbind]=t.value;const pl=$('#pickList');if(pl){pl.innerHTML=pickerBody(ui.modal);pl.scrollTop=0;}return;}
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
  if(planChange(t))return; // Plan's fields (r58): an exercise's numbers, a day's name and rest day, Move to
  if(t.dataset.gym){gymField(t);return;}
  if(todayChange(t))return; // Today's (r59): the Set up page's bodyweight
  if(t.dataset.band){bandChange(t);return;}
  if(t.dataset.ebind&&ui.modal&&ui.modal.kind==='exEdit'){const k=t.dataset.ebind;ui.modal.e[k]=t.type==='checkbox'?t.checked:t.value;if(k==='primary'){ui.modal.e.secondary=ui.modal.e.secondary.filter(x=>x!==t.value);renderModal();}if(k==='bw'){if(t.checked&&!ui.modal.e.bwfRaw)ui.modal.e.bwfRaw=String(Math.round(bwShare(ui.modal.e)*100));renderModal();}if(k==='plates'&&t.value==='auto')delete ui.modal.e.plates;if(k==='timed'||k==='equip'||k==='plates')renderModal();return;}
  if(ui.modal&&ui.modal.kind==='imp'){const m=ui.modal;
    if(t.dataset.imppick!=null){m.pick[t.dataset.imppick]=t.value;renderModal();return;}
    if(t.dataset.impmus!=null){if(ML[t.value])m.guess[t.dataset.impmus].primary=t.value;return;}
    if(t.dataset.impdate!=null){if(isDate(t.value)&&t.value<=today())m.date=t.value;else t.value=m.date;renderModal();return;}
    if(t.dataset.mapf!=null){m.tab.map[t.dataset.mapf]=t.value===''?undefined:+t.value;return;}}
  if(t.dataset.mbind)return;
  if(t.dataset.pbind==='date'&&ui.modal&&ui.modal.kind==='past'){if(isDate(t.value)&&t.value<=today())ui.modal.date=t.value;else toast('Pick today or an earlier date');renderModal();return;}
  if(workoutChange(t))return; // the session screen's (r60): a set's reps and load, cardio, the date
  const b=t.dataset.bind;if(!b)return;
  // The moved screens' fields (History and Settings, r57; Plan and Stats, r58; Today, r59): each change through act.
  const own=HISTORY_BINDS[b]||SETTINGS_BINDS[b]||PLAN_BINDS[b]||DASH_BINDS[b]||TODAY_BINDS[b];if(own){own(t);return;}
  if(b==='loadFill')ACT.loadAsk({dataset:{v:t.checked?'fill':'grey'}});
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
  if(workoutKey(e))return; // the session screen's (r60): Next through a set's fields, Escape on the effort strip, the arrows on an exercise's handle
  if(e.key==='Escape'&&ui.modal){closeModal();return;}
  if(e.key!=='Tab'||!ui.modal)return;
  const f=modalFocusables();if(!f.length)return;
  const first=f[0],last=f[f.length-1],a=document.activeElement;
  if(e.shiftKey&&(a===first||!$('#modal').contains(a))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&(a===last||!$('#modal').contains(a))){e.preventDefault();first.focus();}
});

// Where a touch lands, and a field of the session screen left: auto-mark's routes (workout.ts, r60).
document.addEventListener('pointerdown',noteDown,true);
document.addEventListener('focusout',workoutBlur);
