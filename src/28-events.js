/* ---------- tips ---------- */
// The tips' listeners (src/app/tips.ts since r63), added here as they always were, before the page's own.
tipsStart();

/* ---------- events ---------- */
/* The sign-in sheet is a real form so the phone offers to save and fill the
   password; it never navigates (accountSubmit, src/app/account.ts). */
document.addEventListener('submit',accountSubmit);
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
  if(reportInput(t))return; // a problem report's text (src/app/report.ts)
  if(accountInput(t))return; // the account sheet's fields (src/app/account.ts)
  if(t.dataset.ebind&&ui.modal&&ui.modal.kind==='exEdit'){const k=t.dataset.ebind;if(t.type==='checkbox')return;ui.modal.e[k]=t.value;return;}
  // The picker's list drawn again in place (src/app/sheetspicker.ts), so the search field keeps the focus and the keyboard; the list goes back to its top.
  if(t.dataset.mbind&&ui.modal&&ui.modal.kind==='picker'){ui.modal[t.dataset.mbind]=t.value;renderModal();const pl=$('#pickList');if(pl)pl.scrollTop=0;return;}
});
document.addEventListener('change',e=>{
  const t=e.target;
  if(ui.modal&&FORM_SHEETS.has(ui.modal.kind)&&t&&t.closest&&t.closest('#modal'))ui.modal.dirty=true;
  if(reportChange(t))return; // a problem report's screenshot (src/app/report.ts)
  if(importChange(t))return; // a file to import or restore, and the import preview's choices (src/app/importflow.ts)
  if(planChange(t))return; // Plan's fields (r58): an exercise's numbers, a day's name and rest day, Move to
  if(t.dataset.gym){gymField(t);return;}
  if(todayChange(t))return; // Today's (r59): the Set up page's bodyweight
  if(t.dataset.band){bandChange(t);return;}
  if(t.dataset.ebind&&ui.modal&&ui.modal.kind==='exEdit'){const k=t.dataset.ebind;ui.modal.e[k]=t.type==='checkbox'?t.checked:t.value;if(k==='primary'){ui.modal.e.secondary=ui.modal.e.secondary.filter(x=>x!==t.value);renderModal();}if(k==='bw'){if(t.checked&&!ui.modal.e.bwfRaw)ui.modal.e.bwfRaw=String(Math.round(bwShare(ui.modal.e)*100));renderModal();}if(k==='plates'&&t.value==='auto')delete ui.modal.e.plates;if(k==='timed'||k==='equip'||k==='plates')renderModal();return;}
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
