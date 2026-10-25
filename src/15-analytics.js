/* An assisted lift keeps its sets as bodyweight minus the help, below 0, so
   every estimate, target and record works unchanged; the field shows and
   takes the help as a plain number, since phone number pads have no minus. */
const loadIn=(ex,w)=>w==null?'':fmtW(ex&&ex.assist?-w:w);

/* ---------- analytics ----------
   The index (IDX), its readers and the RIR reading are in src/app/ since r52
   (analytics.ts, weeks.ts, time.ts, coach.ts); what stays here moves with the
   screens that call it (ARCHITECTURE.md, phase 5). */
/* ---------- what the load number means ----------
   Every set stores the number you typed, as you typed it. What it means is a
   property of the exercise, shown on the exercise and above the load column:
   - each:  per dumbbell, two dumbbells (DB bench, curls, lunges)
   - total: everything on one implement (a barbell with its bar, one dumbbell,
            plates on a landmine or a plate-loaded machine)
   - side:  plates on one side of a plate-loaded machine
   - stack: the pin setting on a cable or selectorized machine
   - bw:    added to bodyweight (pull-ups, dips)
   Estimated 1RM and targets stay in that same frame (per dumbbell, per side),
   so progress compares like with like. Weight lifted counts what actually
   moved: both dumbbells, both sides of the plates, both limbs when reps are
   logged per side. Changing an exercise's setting does not convert past sets. */
/* On the exercise, always visible: what the load number is, and reps per
   side when that applies. Tap or hold for the longer version. */
function lmChips(ex){
  if(ex.timed&&!ex.bw&&loadMode(ex)!=='each')return ex.perSide?'<p class="lmrow"><span class="lm">seconds per side</span></p>':'';
  const m=loadMode(ex);
  if(ex.assist)return `<p class="lmrow"><span class="lm" data-tip="Enter the help the machine gives, as on its pin. Less help is progress; your logged bodyweight minus the help is what counts.">machine help</span></p>`;
  const long={each:'Enter the weight of one dumbbell. Weight lifted counts both.',side:'Enter the plates on one side. Weight lifted counts both sides.',stack:'Enter the pin setting. It is not comparable across machines.',bw:'Enter only what you add (belt, vest, dumbbell); 0 for bodyweight. Your logged bodyweight is added for estimates.'}[m]||(ex.equip==='barbell'?'Enter everything on the bar, the bar included.':ex.equip==='dumbbell'?'Enter the weight of the one dumbbell you hold.':'Enter the total load.');
  return `<p class="lmrow"><span class="lm" data-tip="${esc(long)}">${esc(loadWords(ex))}</span>${ex.perSide?`<span class="lm" data-tip="${esc(ex.timed?'Seconds for one side; do the same on the other.':'Reps for one side; do the same on the other. One set still counts as one set.')}">${ex.timed?'seconds':'reps'} per side</span>`:''}</p>`;
}
/* First run only (r29, V: "targets that can actually be met"): when a new
   person picks a ready-made routine and the weekly targets are still the
   defaults, each muscle's minimum comes down to what the routine plans
   (whole sets), so following it is on target. The maximums and the
   evidence-based defaults stay as they are for everyone else; Settings,
   Weekly set targets raises them as sets are added. Returns whether anything
   changed. */
/* Targets fitted before r44 recorded no floors (r44 review): once, on this
   device's state at start, when every target is exactly what a first-run
   pick of the routine in use, the starter or the old default gives, record
   those floors. Any target that differs (typed) leaves it alone. Not in
   normalize, which also runs inside the sync comparison and Undo. */
function fitRecordOld(){
  const s=state.settings;if(s.bandsFit||s.profile)return false;const b=s.bands;
  for(const R of [activeRoutine(),starterRoutine(),defaultRoutine()]){if(!R)continue;const p=plannedSets(R);const fit={};let ok=true;
    for(const m of MK){const d=BANDS[m];const lo=TRACK_ONLY.has(m)?d[0]:Math.min(d[0],Math.floor(p[m]||0));if(b[m][0]!==lo||b[m][1]!==d[1]){ok=false;break;}if(lo<d[0])fit[m]=lo;}
    if(ok&&Object.keys(fit).length){s.bandsFit=fit;return true;}}
  return false;
}
function fitTargets(R,actual){
  if(!R)return false;const b=state.settings.bands;
  /* Still the defaults, or the defaults fitted to the starter routine (r31:
     Log a workout now fits them to the starter, and an import or a pick
     after that left targets measured against a routine no longer used). */
  const same=x=>MK.every(m=>b[m]&&b[m][0]===x[m][0]&&b[m][1]===x[m][1]);
  /* The defaults are the profile's (r44): with focus muscles set, those
     targets are where a first-run pick starts. With no profile they are BANDS. */
  const D={};for(const m of MK)D[m]=defBand(m);
  const foc=new Set(prof().focus||[]);
  const fitOf=r=>{const p=plannedSets(r);const o={};for(const m of MK)o[m]=TRACK_ONLY.has(m)||foc.has(m)?D[m]:[Math.min(D[m][0],Math.floor(p[m]||0)),D[m][1]];return o;};
  if(!same(D)&&![starterRoutine(),defaultRoutine()].some(r=>same(fitOf(r))))return false;
  const was=JSON.stringify(MK.map(m=>b[m]));
  for(const m of MK)b[m]=[D[m][0],D[m][1]];
  /* actual (a routine made from an import, r31): no minimum above what the
     log itself averaged on a muscle the routine trains. A cycle's planned
     sets a week and the weeks as trained never match exactly (2 days
     alternating, 3 sessions a week, plans 2.8), and the review saw "Abs
     below target, add a set to Plank" measured against the lifter's own
     program. */
  // A focus muscle keeps its raised target (r44): raising it is the point of the focus.
  // Each floor is recorded (settings.bandsFit), so a later focus change knows which targets are the app's.
  /* A focus muscle's floor is recorded too, though not applied while it is a
     focus, so taking the focus off later brings it to the plan (the r44 review). */
  // The floors are fitFloors' (src/app/profile.ts, r54), the one rule the refit of an older fit reads too.
  const fit=fitFloors(R,actual);
  for(const m in fit)if(!foc.has(m))b[m]=[fit[m],b[m][1]];
  if(Object.keys(fit).length)state.settings.bandsFit=fit;else delete state.settings.bandsFit;
  return JSON.stringify(MK.map(m=>b[m]))!==was;
}
/* How to do it (r30, from the review: no exercise videos). A search on
   YouTube for the exercise's name, opened in the browser: no list of videos
   to keep current, and nothing leaves the app until it is tapped (then only
   the name). A custom exercise's name is searched as typed. */
function howToUrl(e){return 'https://www.youtube.com/results?search_query='+encodeURIComponent(`${e.name} exercise form`);}
function howToLink(e){return e&&e.name?`<a class="btn block" style="margin-top:6px" href="${esc(howToUrl(e))}" target="_blank" rel="noopener noreferrer" data-tip="Opens a YouTube search for ${esc(e.name)} in your browser. Only the exercise name is sent.">How-to videos</a>`:'';}
