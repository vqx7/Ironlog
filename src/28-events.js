/* ---------- tips ----------
   An i button's markup for the legacy sheets still written as markup (the
   problem report's, until it moves in r63). */
function tipi(text,label){return `<button type="button" class="tipi" data-tip="${esc(text)}" aria-label="${esc(label||'More')}">i</button>`;}
// The tips' listeners (src/app/tips.ts since r63), added here as they always were, before the page's own.
tipsStart();

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
  // The picker's list drawn again in place (src/app/sheetspicker.ts), so the search field keeps the focus and the keyboard; the list goes back to its top.
  if(t.dataset.mbind&&ui.modal&&ui.modal.kind==='picker'){ui.modal[t.dataset.mbind]=t.value;renderModal();const pl=$('#pickList');if(pl)pl.scrollTop=0;return;}
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

// The session screen's own listeners (workout.ts, r60): added here, after the page's, in the order they ran before.
workoutStart();
