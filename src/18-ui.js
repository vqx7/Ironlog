/* ---------- the page ----------
   The toast is src/app/toast.ts's since r63, the sheets' opening, closing and
   drawing, Back, render and the save state src/app/page.ts's, and the rest
   timer and the screen kept on src/app/timer.ts's. What stays here until the
   start moves (r63) is the draw of the tabs, which knows every screen, and
   the page's listeners, added here in the order they always were. */
window.addEventListener('popstate',pageBack);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')return;wakeOn();if(!ui.modal&&drawnBeforeToday())rerenderKeepScroll();});setInterval(()=>{if(document.visibilityState==='visible'&&!ui.modal&&drawnBeforeToday())rerenderKeepScroll();},30000); // Back on a new day, or on the screen as one begins, the screen is drawn again for it (drawnBeforeToday, r59).
// Intervals are throttled in a hidden tab, so re-sync on return rather than
// showing whatever the clock last managed to paint.
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&!$('#timer').hidden)tick();});

/* ---------- render ---------- */
let sortables=[];
function killDynamic(){
  obTourStop();
  // A re-render in the middle of a drag (a cloud refresh) would leave Sortable's
  // floating copy of the block on the page; it goes with the old list.
  blockDragStop();document.querySelectorAll('.sortable-fallback,.sortable-ghost').forEach(e=>{if(!e.closest('#view'))e.remove();});
  killCharts();dragDrop();sortables.forEach(s=>{try{s.destroy();}catch(e){/* list already gone */}});sortables=[];}
// The tabs drawn by their modules (phase 5, r57 to r60): each a template of the log and ui. Today with a session in progress is the session screen (workout.ts, r60).
const LIT_TABS={today:()=>state.draft?viewWorkout(state.draft):viewToday(),history:viewHistory,settings:viewSettings,program:()=>ui.planView==='library'?viewLibrary():viewProgram(),dash:viewDash};
function renderInner(){
  if(drawing()){queueMicrotask(render);return;} // asked for mid-draw: once this draw is done (below)
  killDynamic();applyTheme();setSaveState();
  document.querySelectorAll('#tabs button').forEach(b=>{if(b.dataset.tab===ui.tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  {const tb=document.querySelector('#tabs button[data-tab="today"]');if(tb){const live=!!state.draft;tb.classList.toggle('live',live);const sp=tb.querySelector('span');if(sp)sp.textContent=live?'Session':'Today';tb.setAttribute('aria-label',live?(state.draft.editingId?'Session being edited':'Session in progress'):'Today');}}
  drawWeekBar();
  if(ui.tab==='library')ui.tab='program';
  // The setup pages stand alone: no tabs or week bar until a way to start is picked.
  if(obActive()&&ui.tab!=='today')ui.tab='today';
  document.body.classList.toggle('obmode',obActive());
  /* One host draws every tab (r57; every tab a module's screen since r60): a
     template, updated in place, which places its sections itself. A draw
     asked for while lit-html is drawing (an event a removed field fires
     mid-draw) runs once this one is done: lit-html takes nodes away one by
     one, and a draw inside that would find them gone. The session screen
     puts back first what the legacy page's fresh markup reset (the effort
     strip, the plates line, a fold waiting its moment). */
  if(ui.tab==='today'&&state.draft)workoutFullDraw();
  drawScreen($('#view'),(LIT_TABS[ui.tab]||LIT_TABS.today)());
  if(!(ui.tab==='today'&&state.draft)&&!(ui.tab==='program'&&ui.planView==='library'))mountSecSortable();
  if(ui.tab==='today'&&state.draft){const s=mountBlockDrag();if(s)sortables.push(s);}
  if(ui.tab==='program'&&ui.planView!=='library')mountSortable();
  if(ui.tab==='dash')mountCharts();
  if(ui.tab==='today'&&!state.draft)mount3D();
  if(obActive())mountObTour();
  if(ui.modal)renderModal();
}
