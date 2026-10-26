/* ---------- the load engine ----------
   suggest and everything it calls are in src/app/engine.ts since r52 (phase
   3b, ARCHITECTURE.md), and the session screen's plates, grey loads and reps
   and live score are in src/app/workout.ts since r60. What stays here is the
   swap's plan, which the picker and Limited equipment read, and moves with
   the sheets. */
/* What a swapped-in exercise is done for (r27). It keeps the slot's set
   count and superset. Its range, RIR, rest and step come from where it
   already sits in the routine, or from its own default when it is the other
   kind (a timed hold for reps, or reps for a hold: a plank swapped in for
   bench used to hold for 6 to 10 seconds); otherwise it fills the slot as
   planned. */
function swapPlan(p,fromId,toId,R,dayId){
  R=R||activeRoutine();
  const inR=R.days.some(d=>d.items.some(it=>it.exId===toId));
  if(!inR&&!!EX(fromId).timed===!!EX(toId).timed)return {...p};
  const q=inR?planFor(toId,R,dayId):defPlan(toId);
  const o={...p,repMin:q.repMin,repMax:q.repMax,rir:q.rir,rest:q.rest,inc:q.inc};
  if(q.jump!=null)o.jump=q.jump;else delete o.jump;
  return o;
}
