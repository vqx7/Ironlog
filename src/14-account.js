/* ---------- account (standalone app) ----------
   The build's cloud script defines window.ironlogAuth when a backend is
   configured; inside Claude and in the plain source file there is none, and
   nothing below shows. An account is optional: without one the app keeps
   working on this device exactly as before. */
const AUTH=()=>window.ironlogAuth&&typeof window.ironlogAuth.user==='function'?window.ironlogAuth:null;
const ACCT_LATER=KEY+'.acctLater';
function cloudStop(){
  clearTimeout(cloud.t);cloud.on=false;cloud.db=null;cloud.uid=null;cloud.acct=null;
  cloud.meta={};cloud.editAt={};cloud.last=null;cloud.retry=0;saveMeta();setCloud('local');
}
function acctRerender(){if((ui.tab==='settings'||ui.tab==='today')&&!ui.modal)rerenderKeepScroll();else{const el=document.getElementById('syncInfo');if(el)el.innerHTML=syncInfo();}}
/* ---------- problem reports (PENDING 58, reworked in r25) ----------
   The menu (top right) and an exercise's ⋯ menu open one sheet. Report a problem
   comes first; a question or a suggestion is the same sheet with another kind
   chosen at its top (stored as bug, question, idea). One text box, an optional
   screenshot, and what a report needs to be acted on without asking the
   person anything technical: build, device, screen size, which screen they
   came from, whether a session was open, sync status and the last 10 logged
   errors. Never the workouts. Replies go to the account's email.
   Signed in only (V's choice, r25), to keep spam out, with limits the
   database enforces too: 10 to 1,000 characters, one image, 5 reports a
   day per account. Signed out, the sheet asks to sign in, and can still copy
   the details for a message. Without a report service at all (the plain
   source file) it copies the report as text. */
const FB=()=>window.ironlogFeedback&&typeof window.ironlogFeedback.send==='function'?window.ironlogFeedback:null;
const FB_SENT=KEY+'.fbSent';
// Reports sent from this device in the last 24 hours (the database keeps the real count).
function fbRecent(){try{const a=JSON.parse(localStorage.getItem(FB_SENT)||'[]');const cut=Date.now()-864e5;return Array.isArray(a)?a.filter(t=>+t>cut):[];}catch(e){return [];}}
async function fbCheckReader(){
  const F=FB();const was=!!acct.reader;
  try{acct.reader=!!(F&&acct.user&&typeof F.isReader==='function'&&await F.isReader());}catch(e){acct.reader=false;}
  if(was!==acct.reader&&ui.tab==='settings'&&!ui.modal)rerenderKeepScroll();
}
function fbContext(m){
  // A report about a crash must survive the crash (r47): each field that reads the log is guarded, so a save that cannot be read still sends what the rest knows.
  const safe=(f,alt)=>{try{return f();}catch(e){return alt;}};
  const d=safe(()=>state.draft,null);
  const ctx={build:APP_VERSION,version:DISPLAY_VERSION,env:ENV,at:new Date().toISOString(),device:String(navigator.userAgent||'').slice(0,300),
    screen:`${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio||1}x`,installed:isStandalone(),
    theme:state.settings.theme,accent:state.settings.accent||ACCENT0,unit:U(),from:m.from||ui.tab,exercise:m.ex||undefined,
    session:d?{past:!!d.past,free:!!d.free,editing:!!d.editingId,exercises:d.ex.length}:null,
    signedIn:!!acct.user,sync:cloud.on?cloud.status:'off',crash:m.crash||undefined,
    counts:safe(()=>({sessions:state.sessions.filter(x=>!x.demo).length,routines:state.routines.length}),null),
    errors:logBuf.slice(-10)};
  /* The feedback table refuses a context over 20,000 bytes (SUPABASE.md, Part 4),
     and that would refuse the whole report. Ten errors with their stacks fit in
     plain text, but not if a message is in a script of 3 or 4 bytes a
     character, so the oldest errors go first until it fits with room to spare. */
  const bytes=()=>safe(()=>new TextEncoder().encode(JSON.stringify(ctx)).length,0);
  while(ctx.errors.length>1&&bytes()>FB_CTX_MAX)ctx.errors.shift();
  if(bytes()>FB_CTX_MAX)ctx.errors=ctx.errors.map(({s,...x})=>({...x,m:String(x.m).slice(0,100)}));
  return ctx;
}
/* The Guide (r27): how Ironlog works and the rules behind its numbers, in
   one place, opened from the menu. Screens keep the number and the action;
   the reasoning lives here, so it is findable on a phone where nothing can
   be hovered. Each topic folds. Keep it in step with the code: the rules
   here are the ones suggest(), IDX() and shortPlan() apply. */
function guideSheet(m){
  const off=state.settings.rirMode==='off';const kg=U()==='kg';
  const inClaude=!!(window.claude&&typeof window.claude.use==='function');const accts=!inClaude&&!!AUTH();
  const where=inClaude?`<p><b>Your log</b> is saved with your Claude account and in this browser.</p>`
    :accts?`<p><b>Without an account</b> your log is on this phone only: deleting the app deletes it. Export a backup in Settings, Your data, and keep it in Files.</p>
   <p><b>With an account</b> it syncs, and signing in on any device brings it back. Only you and the app owner can see it. Your email is used only to sign in and reset your password; nothing is shared or sold. Continue without an account on the first page keeps everything on the phone, and the account can be added any time from the menu.</p>`
    :`<p><b>Your log</b> is saved in this browser only: clearing its data deletes it. Export a backup in Settings, Your data.</p>`;
  const report=FB()?'<p><b>Report a problem</b> is in the menu at the top right and in Settings, Help. It needs an account, and never includes your workouts.</p>'
    :'<p><b>Report a problem</b> is in the menu at the top right and in Settings, Help. Here it copies the details for a message instead of sending them, and never includes your workouts.</p>';
  const T=[
  ['today','Today',`<p><b>The card at the top</b> is the next day of your routine. Start begins it; <b>Change</b> has everything else: a lighter day, short on time, a blank session, Pick for me, and another day of your plan. With Settings, Rest timer and logging, <b>Today starts with</b> a blank session, the card starts an empty session instead, the plan's day in Change; your week is then measured by sessions and hard sets, not a plan.</p>
   <p><b>Lighter day</b>: every exercise, half the sets (rounded up), about 90% of the loads, 3 or more reps in reserve, and nothing to beat. For a day you are run down. It does not count against your trends or set your next targets.</p>
   <p><b>Short on time</b>: give your minutes. Sets come off down to 2 per exercise, then exercises not started drop out. Priority and lagging muscles, exercises you have started, and at least one exercise per muscle are kept longest. Done sets are never touched. Trimmed work does not count against trends. Undo puts it back.</p>
   <p><b>Minutes</b> (~75 min) are worked out from your sets, reps, and rest. Once you have finished 3 sessions in the app in the last 12 weeks, they follow how long yours take against that estimate: the typical one of your newest 8, so one long day does not move it, and a clock left running is left out.</p>
   <p><b>Pick for me</b> ranks your routine's days by what each muscle got in the last 7 days against your targets, how recently it was trained hard, injuries, and your cycle. Starting one moves your cycle on from there.</p>
   <p><b>Blank session</b>: any exercises, not tied to a routine day, so your cycle stays put.</p>
   <p><b>More options</b>: Deload week, Limited equipment (each exercise your gym cannot do swapped for the closest match), Rest week (a week off on purpose: averages, the streak, and adherence skip it), Flag an injury, and Log cardio.</p>
   <p><b>Two sessions in a day</b> are kept in the order you started them; the next targets come from the later one, and a calendar day with two asks which to open.</p>
   <p><b>Weigh-in</b>: a card asks for your bodyweight every 2 weeks once you have weighed in or log bodyweight lifts (Settings, General, Weigh-in reminder: every week, 2 weeks, month, or off). Pull-ups, dips, and push-ups are read at your latest weigh-in.</p>
   <p><b>This week</b> counts hard sets logged against hard sets planned; Month shows the calendar instead, and the title becomes This month. The bar at the top of every tab is this week: filled is a day you lifted, a coloured outline is cardio only, a grey ring is a workout planned ahead, and with fixed weekdays a red ring is one missed. Tap an empty past day to log a workout for it.</p>`],
  ['log','Logging a session',`<p><b>Grey numbers are suggestions.</b> Tick a set to log it as shown, or type over the load or reps first. Nothing you type is ever changed by the app.</p>
   <p><b>Grey reps</b> are last time's reps for that set, at today's load, and one set under the bottom of the range among the others shows the bottom of the range. When today's target is a new load, last time's reps were at the old load, so they are the reps of the set above instead, or the bottom of the range. On a lighter day or in a deload, they are the bottom of the range.</p>
   <p><b>Grey loads</b> are the set above, or today's suggested load. To have loads typed in for you: Settings, Rest timer and logging, Fill in suggested loads.</p>
   <p><b>Auto-mark</b> (Settings): a set ticks itself when you leave its reps field.</p>
   <p><b>RIR</b>, reps in reserve: how many more reps you could have done. Tap a set's RIR box for 0 to 5 (Settings can switch it to half reps or RPE; RPE 8 is RIR 2). ${off?'RIR is off in Settings, so every working set counts as hard.':'It is optional: a blank reads as your usual RIR on that lift once you have rated 3 of its sets in 12 weeks, and until then as hard.'}</p>
   <p><b>RIR check</b>: once you have 3 sessions, one machine or cable exercise may ask for one set to failure, to see how far your RIR calls are off. Not now, or finishing without it, waits 3 weeks.</p>
   <p><b>Last</b>, beside each set, is what you did on that set last time at your working load, from the session named above the sets; a top single or lighter sets stay in that line. <b>W and D</b>: tap a set's number once for a warm-up (kept, never analysed), twice for a drop set (counts half a set of volume, never as a PR or target). <b>+ Drop</b> beside + Set adds one at about 75% once a set is done; warm-ups are in the exercise's ⋯ menu.</p>
   <p><b>Supersets</b>: an exercise's ⋯ menu, Superset with the next one (Finish then offers to keep it in your plan), or Plan's Superset with next. The rest timer waits until the partners are done, and session minutes leave out the rest between them.</p>
   <p><b>The next sets adjust</b> after a set that was clearly off plan, on the sets whose load is still the app's (never one you typed). Up: 2 or more reps in reserve over your target with the reps in your range, or 2 or more reps past the top. Down: 2 or more reps under both the range and what today asked for, without reserve to spare. The new load is what that set says you can do in the middle of the range (up) or at its bottom (down), with one more rep in reserve, in real steps, at most 10% up (15% on light isolation lifts), and at least one step when a set was rated 5 or more in reserve. When no heavier load fits, the same load for more reps. A blank effort reads as your usual. Keep stays on your load. Not on a lighter day, a deload, a past workout, an injured area, an assisted lift, or a bodyweight lift never done with added load. Settings, Rest timer and logging turns it off.</p>
   <p><b>+ Set and − Set</b>: − Set takes an empty row first and asks before a filled one. Removing anything you entered asks first, and Undo follows.</p>
   <p><b>Muscles worked</b>, in an exercise's ⋯ menu, shows what it trains on the body: the main muscle in your accent colour, helpers lighter (they count half a set). Flat or 3D, as on Today's map. The exercise editor shows the same as you pick the muscles.</p>
   <p><b>Order</b>: drag an exercise by its ⠿ to move it, or use the arrow keys on the ⠿, or Move up and Move down in its ⋯ menu. A superset split by a move becomes two single exercises. An exercise you start ahead of ones not yet touched moves up, to just after the last one you started.</p>
   <p><b>Swap</b>: sets you did stay with the old exercise; the new one takes the sets left, with its own rep range and rest when it has them in your routine.</p>
   <p><b>Finish</b> saves the ticked sets and asks about any with reps but no tick. <b>Discard</b> asks only when something was entered.</p>
   <p><b>A past workout</b>: tap an empty past day in the bar, or History, Log a past workout. Targets and PRs read as of that date.</p>`],
  ['rules','How targets are set',`<p class="muted">These are estimates from your log, not medical or coaching advice. Adjust them to how you feel on the day, and stop on pain.</p>
   <p><b>In short.</b> Before a session, from your last full session: every set at the top of the range, or 2 or more in reserve over your target, more load; well short of the range, less load; anything else, the same load for more total reps. During a session, the next sets change only after a set that was clearly off: 2 or more reps past the top, or 2 or more in reserve over your target with the reps in the range, heavier; 2 or more reps under the range and under what was asked, lighter; anything else, the same load, with last time's reps in grey. Loads show in grey, taken when you tick the set, or typed in for you with Settings, Rest timer and logging, Fill in suggested loads. A load you type is never changed. Every target on the session screen has an i beside it, Why this target, which gives the reason for that exact number and what makes the load go up next. The details follow.</p>
   <p><b>A target is not a record.</b> The target is what to beat in today's session, worked out from your last full session of that lift. A record is the best you have ever done: the heaviest set of a lift shows while you train it, and every record is under Stats, Lifts, All-time bests. A PR is the moment you set one, and it is announced as you log the set. Lifts you did before this app count the same way once they are in: History, Log a past workout.</p>
   <p>Each exercise progresses from its <b>last full session in the rep range you plan for it that day</b>, so the same lift on a heavy day and a light day progresses on each separately. A range not used within 6 weeks of your latest session of the lift starts from that latest session instead.</p>
   <p><b>The working load</b> is the load you did the most sets with (the heavier on a tie), leaving out loads under 60% of your heaviest. A heavy top set, or two, before your back-off sets counts for bests and PRs, while targets, grey reps, and trends build on the back-off sets.</p>
   <p><b>Every set at the top of the range</b>: add load, in whole steps of the exercise's load step, about 2.5% of the load on compound lifts and 5% on isolation lifts, at least one step. Plan, Load jump % sets a different share for one exercise (0: one step every time). When one step is large for the load (it costs 1.5 reps or more, as 5 lb on a 35 lb dumbbell does), on a range 3 or more reps wide, you first build a few reps past the top at this load, up to a quarter of the top of the range more, until your estimate says the new load allows the bottom of the range; then the load goes up. Past a quarter, the load goes up anyway, with the reps your estimate allows there as the target. A fixed-rep plan (5 x 5, 3 x 3-5) goes up a step every time all its sets are done.</p>
   <p><b>Dumbbells and kettlebells</b> step by what your rack has: with no load step set on the exercise, the step fits every load you logged on it (12, 14, and 16 kg is a rack in 2 kg steps; 12.5 and 15, one in 2.5).</p>
   <p><b>Otherwise</b>: the same load; beat last time's total reps over the same number of sets. One set under the range among the others counts as the bottom of the range, so one bad set does not set the next target. A bad day, every set under the range at a load you did in it the time before, asks for the bottom of the range in every set again.</p>
   <p><b>Well past the range</b> (every set 2 or more reps over the top, as after moving the range down): the load your estimated 1RM gives for the middle of the range, at most 10% more (15% on isolation lifts under ${kg?'20 kg':'about 45 lb'}), in whole steps.</p>
   <p><b>Below the range</b> (every set 2 or more reps short, or short two sessions running at the same load, or four running even with the reps creeping up, or the first time in a range you have not trained, as after an import): down to what your estimate says fits the range, in whole steps. Not just after one step up while you are 3 or fewer reps short, and not while your reps at that load are rising. The rep target counts as many sets as the plan has.</p>
   <p><b>Too easy</b> (every top set logged 2 or more RIR above the target): the same estimate sets a heavier load, at most 10% more (15% on isolation lifts under ${kg?'20 kg':'about 45 lb'}), and at least one step when every set was rated 5 or more in reserve, where the estimate is only a floor.</p>
   <p><b>The first 3 sessions</b> of a lift find its load: there the most these two can add is 25%, so a cautious first guess is put right in a session or two. For picking a load only, sets past 12 reps to failure are read with Epley up to 30, so a set of 25 still moves the load the right amount (never shown as a 1RM). A convention.</p>
   <p><b>The first session of a close variation</b> (a hammer curl after DB curls, a front squat after back squats) starts from the related lift's last full session in the last 120 days, when both use the same equipment, load, main muscle, and movement, with both arms or both legs at once. About 90% of its estimate (80% on a compound lift), for the middle of the range with one more rep in reserve, rounded down. Machines and cables start fresh, since two machines' numbers do not compare.</p>
   <p><b>At the heaviest load available</b> (set on the exercise), or with a load step of 0: more reps, then harder reps.</p>
   <p><b>Assisted machines</b>: less help is progress. <b>Timed holds</b>: add seconds, then load. <b>Bodyweight lifts never done with added load</b> (push-ups, pull-ups, a hanging leg raise): more reps, then harder reps or a little added load when you type it; the app never adds load you did not use.</p>
   <p><b>Back after more than 4 weeks off a lift</b>: about 90% of its last working load, with 2 or more reps in reserve, then the session after picks up from your last full session (a convention: strength holds for about 4 weeks without training and falls faster after, Bosquet 2013). Its trend waits until you are back.</p>
   <p><b>Your gym</b> (Settings): the dumbbells, kettlebells, plates, and stack steps you have. Suggestions stay on them, and a weight you type for a dumbbell counts as the nearest one.</p>
   <p><b>Last</b> is the most recent session of the lift in that day's rep range (the most recent of all when the range is new), labelled trimmed, lighter, or deload when it was. Those sessions count as what you did, but they never set a target: the next target comes from the last full session, and the i beside the target names its date.</p>
   <p><b>Deload week</b>: half the sets (rounded up), about 90% of the load the normal day would ask for (or of last time's, if lower), in whole steps down (never under the empty bar on a full-bar lift), the bottom of the range, 3 or more reps in reserve. It stays out of trends, and out of the weekly volume average. A <b>lighter day</b> is the same for one day.</p>
   <p><b>Lighter sessions nobody marked</b> (an imported deload, say) are read from the numbers: a lift's heaviest load at least 10% under its previous three sessions and its strength reading at least 7% under. A week where most lifts read lighter is a lighter week. They are kept in history and treated like a deload. Lighter sessions in a row for 2 weeks or more are a new level, not a deload, and count again. A convention.</p>
   <p><b>An exercise stopped early</b>, with fewer than half its sets done, is saved as trimmed. Finish asks first when sets are left.</p>
   <p><b>Make it lighter</b>, after a low check-in, changes only the exercises not started yet. What you already did at full effort still sets next time's target.</p>
   <p><b>An injury</b> flagged on a muscle or a joint (knee, hip, shoulder, elbow, wrist) pauses targets for exercises that load it and caps their load at last time.</p>
   <p><b>Changes apply at once</b>: a new load step, rep range, or heaviest load reaches the exercises in your session that you have not started yet.</p>`],
  ['stats','Volume and Stats',`<p><b>A hard set</b> is a working set at RIR 3 or less${off?' (with RIR off, every working set)':''}. Helper muscles count half a set (Pelland 2025); which muscles are helpers on each lift is the library's own call, a convention. With Settings, Count ${halfLbl()} as half a set on, a working set past RIR 3 counts half toward your weekly sets and targets, planned ones too (a convention); estimates, PRs, recovery, and the per-workout flag still count hard sets only.</p>
   <p><b>Weekly targets</b> are per muscle in Settings, Weekly set targets. 10 to 20 hard sets a week for major muscles is typical, not a ceiling. Serratus, rotator cuff, neck, and tibialis are tracked only: counted and shown, with no target, since no study sets a dose for them and most routines leave them to indirect work. A target starting at 0 is met with no sets. A muscle is below target when its weekly average, to one decimal as shown, is under the minimum. The radar on Stats measures each region against its minimum, so on or past the ring is on target. It averages your last 4 full weeks; the chips above it switch to 2 or 8 weeks, for the radar only. During the week, short of the minimum shows as under way, not below.</p>
   <p><b>Lagging strength</b> is a muscle whose lifts are falling, or flat with one of them stalled (a convention); with no clear trend, a stalled lift reads <b>A lift stalled</b>. A muscle whose lifts are all within day-to-day noise reads <b>unclear</b>, never 0%.</p>
   <p><b>Your target and the usual range</b>: picking a ready-made routine sets your minimums to what it plans, so Stats measures you against your plan. Plan, Weekly volume names the muscles that plan puts under the usual range.</p>
   <p><b>Planned sets</b> count the same way: a set planned at RIR 4 or more is not a planned hard set, and in a deload week the target is halved.</p>
   <p><b>More than ${SESSION_CAP} sets</b> for one muscle in one workout is flagged. That line is a convention from one study not yet peer reviewed (Remmert 2025), which found no extra growth past it.</p>
   <p><b>Three different numbers.</b> The <b>suggested</b> load and reps (grey in a session) are today's target, from your last full session by the rules above. The <b>estimated 1RM</b> (best estimate) is what one all-out rep would be. It comes from a set's load and reps to failure: Brzycki up to 10 reps, Epley at 11 to 12, and no estimate above 12 reps or above RIR 4. It is a gauge of strength that varies 2 to 8% day to day, never a load to try. It is shown for compound lifts only; isolation lifts show their best set.</p>
   <p><b>Trends</b> read each session's working sets the same way, averaged, up to 20 reps to failure (so high-rep work has a trend too, never shown as a 1RM). RIR is used in a trend only when it is rated on 80% or more of the lift's sets; otherwise loads and reps alone, so tapping RIR on some days and not others cannot bend it. The 6 weeks are counted back from the lift's own last session, and a trend needs 3 sessions spread over 2 weeks or more; it says how many weeks it covers. A muscle's trend counts a lift once it has 4 sessions over 3 weeks or more, and says the weeks too. A trend shows how many sessions it rests on and its weekly rate with the range an 80% interval allows (about +1.5% a week, likely +1.2% to +1.8%). <b>Weight lifted</b> is load times reps; it falls when the load goes up and reps come down, so it is shown as a number, not as progress.</p>
   <p><b>A lift on Stats</b> says its change in what was lifted: the change in its estimated 1RM on a compound lift you load as a total (a barbell, a plate-loaded machine), the top set at each end on anything else. A number shows only when it points the same way as the trend. The percentages are behind its i. <b>Next session</b> is the target its next workout will show; there are no predictions of where a lift will be.</p>
   <p><b>Goals</b>: on Stats, Lifts, set a goal for a lift as a load for a number of reps (100 x 5). It is reached when a working set matches it, that load or more for those reps or more. Until then it shows how close your best estimate from the last 12 weeks is to what the goal takes done to failure, and, on a compound lift you load as a total, about how much load is left for those reps. It gives no date: your session targets are the steps toward it. On a bodyweight lift the load is the added load.</p>
   <p><b>PRs</b>: a <b>weight PR</b> is more weight than any earlier set of the lift (less help on an assisted one); a <b>best estimate</b> beats every earlier estimate of the lift; a <b>best for its reps</b> beats the earlier best in the same band of reps to failure (1 to 5, 6 to 10, 11 to 12); a <b>rep PR</b> is more reps at a load than ever before, counted only when the set is at least 90% as strong as your strongest before it (a convention: 40 x 10 after 95 x 5 is not a PR). A set that is more than one shows the first of these. Only a PR with a new best estimate is announced and counted (on a lift with no estimate, any of them); a heavier set or more reps without one is kept in the list and named in the recap as heaviest yet. Counting them all made each load step a PR. On a bodyweight lift, PRs, estimates, trends, and charts are all read at your latest weigh-in for every session, so progress is more reps or more added load, never a change on the scale. Weight lifted uses each day's weigh-in, the work actually done.</p>
   <p><b>Moving</b>: up 3% or more with a trend clearly above zero. <b>Stalled</b>: flat or falling over the last 6 sessions (by the middle of the changes between every pair of them, so one good or bad day does not decide it) in the current range, or 3 weeks if that covers more (at least 4 sessions), with no PR in the last 3 of them, the load no heavier than at the start of that stretch, and no more reps at that load than any session before it in the stretch, and only while you still train the lift. Adding load and dropping reps for a while, or adding reps to later sets, as double progression does, is not a stall. A deload is suggested when 3 or more main lifts (compound lifts with an estimate) stall together, and not within 4 weeks of a lighter week; isolation and core lifts are listed but not counted for it.</p>
   <p><b>Weekly averages</b> are over the weeks you trained of the last 4 (a lighter week or a rest week is swapped for an earlier one). A week with no training is left out rather than counted as zero, and when 2 or more of the 4 were missed the Coach says so first.</p>
   <p><b>Consistency</b>: weeks with at least as many sessions as the routine you trained that week plans (one session, when Today starts with a blank session). Rest weeks are skipped.</p>
   <p><b>Bodyweight</b> trends use 7-day averages. <b>Waist to height</b>: under 0.5 healthy, 0.5 to 0.59 increased, 0.6 or more high (NICE 2022).</p>`],
  ['plan','Plan and your own exercises',`<p>A routine has days, and each exercise has sets, a rep range, a target RIR, rest, and a load step. The <b>target RIR</b> is 1 unless you change it, a convention: muscle growth improves as sets end closer to failure (Robinson 2024), but going all the way to failure grew muscle no more than stopping 1 to 2 reps short (Refalo 2024) and costs more fatigue. Some lifts in the ready-made routines use 0 or 2. A <b>numbered cycle</b> runs Day 1, 2, 3 in order, so a missed day waits; <b>fixed weekdays</b> pin each day to a weekday.</p>
   <p><b>Your own exercise</b>: Plan, Exercise library, New exercise, or + New exercise when adding one. Set the primary and helper muscles, the equipment, what the number you type means (per dumbbell, total, per side, or stack), bodyweight or assisted, one side at a time, timed, Movement (compound or isolation), the load step, and the heaviest load available. Every number above uses them.</p>
   <p><b>Your training</b> (Settings, and the routine picker on a first run) is optional. Strength starts new barbell, Smith, and machine compounds at 3 to 6 reps, 2 in reserve, 3 minutes' rest: heavier loads gave more strength for similar growth (Schoenfeld 2017; ACSM 2009), and 3 minutes' rest beat 1 (Schoenfeld 2016). Both starts them at 5 to 8; that and the 2 in reserve are conventions. Under 1 year, whatever the goal, new exercises start at 8 to 12 reps (ACSM 2009); compounds stop 3 reps short and isolation lifts 2, a convention. Size keeps the defaults. Your routine changes only when you tap Apply, which raises rest but never turns a timer of 0 on; under 1 year it raises reps in reserve and keeps your ranges. Focus muscles, up to two, get weekly targets about 30% higher and the others drop to maintenance, a third of the usual minimum (Bickel 2011, Spiering 2021); 30% is a convention, and targets you typed stay. With Strength, Pick for me favours a heavy compound that is stalled or within 3% of your best, rested, and not done for 5 days (both numbers conventions). Days a week marks the ready-made routines that fit; every other day fits 3 or 4.</p>
   <p>Drag ⠿ to reorder exercises or move them between days, and to reorder days.</p>`],
  ['sections','Sections',`<p>Tap a section's title to fold or open it. Drag its ⠿ to move it; the order is kept. Each time the app opens, every section starts folded, except Sessions on History.</p>
   <p><b>More sections</b>: when a tab has sections hidden, its bottom lists them; tap one to add it. The menu at the top right has Show, hide, or reorder sections. Settings, Layout shows or hides any section (nothing stops being tracked), and Default layout goes back to how a new install starts.</p>
   <p><b>Your settings</b>: Settings has your training (goal, days, minutes, and focus), the rest timer, auto-mark, RIR, units, theme and accent, weekly set targets, and priority muscles.</p>`],
  ['data','Your data',`${where}
   <p><b>Deleted</b> sessions, cardio, and routines wait in History, Recently deleted: the ${TRASH_MAX} most recent, for ${TRASH_DAYS} days, or until you delete them for good there. A ready-made routine removed unchanged is not kept, since New from a template adds it again. Undo in Settings covers deletes, resets, and imports from the last 7 days.</p>
   <p><b>Import workouts</b> reads notes, a spreadsheet, or an export from another app; you check everything before it is saved. On a first run, the import also makes your routine. Its days come from the workouts' names (or from the lifts in them when the names are all alike) and keep each day's latest sets and rep range. Your weekly targets then fit that routine.</p>
   ${window.IRONLOG_APP?'<p><b>Updates</b>: when "New version ready" shows, tap Reload.</p>':''}
   ${report}`]];
  const open=m.open||'';
  return `<div class="sheet guide" role="dialog" aria-modal="true" aria-labelledby="guideH"><div class="sheet-h"><h3 id="guideH">Guide</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
  ${T.map(([k,t,b])=>`<details class="gsec" data-g="${k}" ${open===k?'open':''}><summary>${esc(t)}</summary><div class="gbody">${b}</div></details>`).join('')}</div>`;
}
/* The menu (r27): one tap from every tab for the things people look for
   outside a workout: who is signed in, signing in or out, the save state,
   Report a problem and the Guide. Since r28 Settings has a Help group near
   the bottom with the same Guide and reports (V asked for both places). */
function menuSheet(){
  const A=AUTH()&&!(window.claude&&typeof window.claude.use==='function')?AUTH():null;const u=A&&acct.user;const st=saveStateNow();
  const dot=st.cls?`<span class="mdot ${st.cls}" aria-hidden="true"></span>`:'';
  let acc;
  if(u)acc=`<div class="row spread" style="flex-wrap:nowrap;gap:10px"><div style="min-width:0"><p class="small muted" style="margin:0">Signed in as</p><p style="margin:2px 0 0;overflow-wrap:anywhere"><b>${esc(u.email)}</b></p></div><button class="btn sm" data-act="acctSignOut">Sign out</button></div>
    <p class="small" style="margin:8px 0 0">${dot}${cloud.on?esc(st.txt):'Not syncing right now.'}${cloud.on?'':' <button class="linkbtn" data-act="acctRetry">Try again</button>'}</p>`;
  else if(A)acc=`<p style="margin:0"><b>Not signed in.</b> Your log is on this phone only.</p><div class="row" style="margin-top:10px"><button class="btn primary" data-act="acctOpen" data-mode="signin">Sign in</button><button class="btn" data-act="acctOpen" data-mode="signup">Create account</button></div>`;
  else acc=`<p class="small" style="margin:0">${dot}${esc(st.txt)}</p>`;
  const due=backupDue()?`<div class="callout yellow row spread" style="margin:10px 0 0"><span class="small"><b>Backup due.</b></span><button class="btn sm" data-act="export">Export backup</button></div>`:'';
  const item=(act,label,extra)=>`<button type="button" class="mnu" data-act="${act}"${extra||''}><span>${label}</span><span aria-hidden="true">›</span></button>`;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="menuH"><div class="sheet-h"><h3 id="menuH">${ENV==='preview'?PREVIEW_NAME:APP_NAME}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
  <div class="panel" id="menuAcct">${acc}</div>${due}
  <div class="mnus">${item('fbOpen','Report a problem',' data-cat="bug"')}${acct.reader&&FB()?item('fbInbox','Reports inbox'):''}${item('guideOpen','Guide')}${item('goLayout','Show, hide, or reorder sections')}${item('goBackup','Your data and backups')}</div>
  <p class="small muted" style="margin:12px 0 0">Version ${esc(DISPLAY_VERSION)}</p></div>`;
}
function fbSheet(m){
  const head=t=>`<div class="sheet-h"><h3 id="fbH">${t}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>`;
  if(m.sent)return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fbH">${head(m.copied?'Copied':'Sent')}<p style="margin:0">${m.copied?'Paste it in a message to the app owner.':acct.user?`Thanks. Any reply goes to ${esc(acct.user.email)}.`:'Thanks.'}</p><button type="button" class="btn primary block" style="margin-top:14px" data-act="mClose">Done</button></div>`;
  const F=FB();const cat=FB_TITLE[m.cat]?m.cat:'bug';
  const kinds=`<div class="fbkind" role="group" aria-label="Kind">${FB_CATS.map(([k,l])=>`<button type="button" class="${cat===k?'on':''}" data-act="fbCat" data-v="${k}" aria-pressed="${cat===k}">${l}</button>`).join('')}</div>`;
  // Signed out where reports exist: sign in first (the copy stays for a message).
  if(F&&!acct.user)return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fbH">${head(FB_TITLE[cat])}
    <p style="margin:0 0 12px">Sign in to send a report, so a reply can reach you.</p>
    <div class="stack"><button type="button" class="btn primary block" data-act="acctOpen" data-mode="signin">Sign in</button><button type="button" class="btn block" data-act="acctOpen" data-mode="signup">Create account</button></div>
    <p class="small muted" style="margin:12px 0 0">No account? <button type="button" class="linkbtn" data-act="fbCopy">Copy the details</button> and send them to the app owner.</p></div>`;
  const n=String(m.msg||'').length;
  /* \x3cimg, not the tag itself (r29): the browser's look-ahead scanner can
     read this script as page markup and fetch "${m.shot}" as an image, a
     stray 404 seen in tests. The string is the same once it runs. */
  // Only the app's own JPEG data URL is ever written in (r44 security review): m.shot comes from fbShrink's canvas, and the check keeps it so if that changes.
  const shot=m.shot&&FB_SHOT_RE.test(m.shot)?`<div class="fbshot">\x3cimg src="${m.shot}" alt="Screenshot to send"><button type="button" class="btn sm" data-act="fbShotDel">Remove</button></div>`
    :`<label class="btn sm fbpick">Add a screenshot<input type="file" accept="image/png,image/jpeg,image/heic,image/heif,image/webp" id="fbShot" hidden></label>`;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="fbH">${head(FB_TITLE[cat])}<div class="stack">
  ${kinds}
  <label class="field">${FB_ASK[cat]}<textarea data-fbind="msg" maxlength="${FB_MAX}" rows="5" placeholder="${esc(FB_HINT[cat])}">${esc(m.msg||'')}</textarea><span class="fbcount small muted" id="fbCount" aria-live="polite">${n} / ${FB_MAX}</span></label>
  <div><p class="small muted" style="margin:0 0 6px">Screenshot, optional. One image, up to ${FB_IMG_MB} MB.</p><div class="row">${shot}</div></div>
  <p class="small muted" style="margin:0">${acct.user?`Replies go to ${esc(acct.user.email)}. `:''}Device details are added, never your workouts. ${tipi(FB_WHAT,'What is attached')}</p>
  ${m.err?`<p class="small" role="alert" style="color:var(--red);margin:0">${esc(m.err)}</p>`:''}
  <button type="button" class="btn primary block" data-act="fbSend" ${m.busy?'disabled':''}>${m.busy?'Sending':F?'Send':'Copy report'}</button></div></div>`;
}
/* The owner's inbox: the reports, newest first, read-only. */
function fbInboxSheet(m){
  const it=m.items;
  const body=m.err?`<p class="small" role="alert" style="color:var(--red)">${esc(m.err)}</p>`:!it?'<p class="muted">Loading</p>':!it.length?'<p class="muted">No feedback yet.</p>':`<ul class="clist fbinbox">${it.map(x=>`<li><div style="min-width:0;flex:1"><p class="small" style="margin:0"><span class="tag ${x.category==='bug'?'red':x.category==='idea'?'green':'blue'}">${esc(x.category)}</span> <span class="muted">${esc(String(x.created_at||'').slice(0,16).replace('T',' '))}${x.reply_to?` · ${esc(x.reply_to)}`:''}</span></p><p style="margin:4px 0 0;white-space:pre-wrap;overflow-wrap:anywhere">${esc(x.message)}</p>${x.screenshot&&FB_SHOT_RE.test(x.screenshot)?`\x3cimg class="fbthumb" src="${esc(x.screenshot)}" alt="Screenshot">`:''}${x.issue_url&&/^https:\/\/github\.com\//.test(x.issue_url)?`<p class="small" style="margin:4px 0 0"><a href="${esc(x.issue_url)}" target="_blank" rel="noopener">GitHub issue</a></p>`:''}<details class="small muted"><summary>Attached by the app</summary><pre class="fbctx">${esc(JSON.stringify(x.context||{},null,1))}</pre></details></div></li>`).join('')}</ul>`;
  return `<div class="sheet fixed" role="dialog" aria-modal="true" aria-labelledby="fbiH"><div class="sheet-h"><h3 id="fbiH">Feedback inbox</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div><div class="sheet-scroll">${body}</div></div>`;
}
/* A picked photo, shrunk to 1280 px on its long side as JPEG, so a report
   stays small enough to store (the table caps it). */
function fbShrink(file){
  return new Promise((res,rej)=>{
    const url=URL.createObjectURL(file);const img=new Image();
    /* At most 500,000 characters (about 370 KB): each screenshot is kept in
       the tickets repository's history for good, so it is kept small (r45,
       audit item 287; 1.4 MB before). Smaller sides before blurrier text. */
    img.onload=()=>{try{const L=500000;let d=null;
      for(const side of [1280,960,720]){const k=Math.min(1,side/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*k));c.height=Math.max(1,Math.round(img.naturalHeight*k));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        for(let q=0.72;q>0.3;q-=0.14){d=c.toDataURL('image/jpeg',q);if(d.length<=L)break;}
        if(d.length<=L)break;}
      URL.revokeObjectURL(url);res(d&&d.length<=L?d:null);}catch(e){URL.revokeObjectURL(url);rej(e);}};
    img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('Not an image'));};img.src=url;
  });
}
/* ---------- waiting for the confirmation email (item 61) ----------
   On an iPhone the link in the email opens the browser, never the
   home-screen app, so the app cannot be told the account was confirmed.
   Instead, while its "Check your email" sheet is open, it tries to sign in
   with the email and password just typed: when the app comes back to the
   front, when "I have confirmed" is tapped, and every 20 seconds while it is
   on screen (every minute after 5 minutes; Supabase allows about 30 sign-in
   attempts per 5 minutes). The password is held in memory only, and is
   forgotten once signed in, when the sheet closes, or after 30 minutes.
   A marker without the password is kept in storage while waiting: a browser
   that shares this storage (the same browser, or Android's installed app)
   can then tell that the link was opened where Ironlog lives. */
const ACCT_WAIT=KEY+'.acctWait';
function waitStart(email,pw){
  acctWait.email=email;acctWait.pw=pw;acctWait.t=Date.now();
  try{localStorage.setItem(ACCT_WAIT,JSON.stringify({t:Date.now()}));}catch(e){/* storage blocked: the app still waits */}
  waitSchedule();
}
function waitStop(){
  clearTimeout(acctWait.timer);acctWait.timer=null;acctWait.pw='';acctWait.email='';acctWait.t=0;
  try{localStorage.removeItem(ACCT_WAIT);}catch(e){/* nothing to clear */}
}
function waitSchedule(){
  clearTimeout(acctWait.timer);acctWait.timer=null;if(!acctWait.pw)return;
  const age=Date.now()-acctWait.t;
  if(age>30*60000){waitStop();const m=ui.modal;if(m&&m.kind==='account'&&m.mode==='wait'){m.mode='signin';m.needCode=true;m.err='Still not confirmed. Type the code from the email, or open its link and sign in here.';renderModal();}return;}
  acctWait.timer=setTimeout(()=>waitTry(false),age<5*60000?20000:60000);
}
async function waitTry(manual){
  const A=AUTH();if(!A||!acctWait.pw||acctWait.busy)return;
  if(!manual&&(document.visibilityState!=='visible'||Date.now()-acctWait.last<3000)){waitSchedule();return;}
  acctWait.busy=true;acctWait.last=Date.now();const m0=ui.modal;
  const sheet=()=>{const m=ui.modal;return m&&m.kind==='account'&&m.mode==='wait'?m:null;};
  if(manual&&sheet()){m0.busy=true;m0.err='';renderModal();}
  try{
    acct.user=await A.signIn(acctWait.email,acctWait.pw);waitStop();obOutClear();
    try{localStorage.removeItem(ACCT_LATER);}catch(e){/* nothing to clear */}
    if(sheet())closeModal();
    toast('Email confirmed. Signed in and syncing.');await cloudInit();acctRerender();
  }catch(e){
    const m=sheet();
    const unconfirmed=e&&(e.code==='email_not_confirmed'||/Confirm your email/i.test(e.message||''));
    if(!unconfirmed&&/Wrong email or password/.test((e&&e.message)||'')){waitStop();if(m){m.mode='signin';m.err='That password did not work. Sign in with the one you chose.';}}
    else if(m&&manual)m.err=unconfirmed?'Not confirmed yet. Type the code from the email, or open its link.':((e&&e.message)||'Try again.');
    if(!unconfirmed)log('auth',e);
  }finally{acctWait.busy=false;const m=sheet();if(m){m.busy=false;renderModal();}waitSchedule();}
}
window.addEventListener('focus',()=>{if(acctWait.pw)waitTry(false);});
window.addEventListener('pageshow',()=>{if(acctWait.pw)waitTry(false);});
async function acctInit(){
  const A=AUTH();if(!A)return;
  A.onChange((ev,user)=>{
    acct.user=user;
    if(ev==='PASSWORD_RECOVERY'&&!(ui.modal&&ui.modal.kind==='account'))openModal({kind:'account',mode:'newpw',pw:''});
    // Signed in some other way while waiting for the confirmation (another tab sharing this storage): stop waiting.
    if(ev==='SIGNED_IN'&&user&&acctWait.pw&&!acctWait.coding){waitStop();const m=ui.modal;if(m&&m.kind==='account'&&m.mode==='wait'){closeModal();toast('Email confirmed. Signed in and syncing.');}}
    if(ev==='SIGNED_IN'&&!cloud.on)cloudInit();
    if(ev==='SIGNED_OUT'&&cloud.on&&!window.claude)cloudStop();
    if(ev==='SIGNED_IN'||ev==='SIGNED_OUT')fbCheckReader();
    acctRerender();
  });
  acct.user=await A.user();acct.checked=true;fbCheckReader();
  const L=A.landing;
  if(L&&L.error){openModal({kind:'account',mode:'sent',title:'Link did not work',msg:/expired|invalid/i.test(L.error)?'That link has expired or was already used. Ask for a new one.':L.error});}
  else if(L&&L.type==='recovery'){if(!(ui.modal&&ui.modal.kind==='account'))openModal({kind:'account',mode:'newpw',pw:''});}
  else if(L&&L.type&&!isStandalone()){
    /* A confirmation link opened in the browser, not the installed app. It
       signed this browser in, but nothing syncs here until we know this is
       where Ironlog is used (cloud-supabase.js holds it). If this storage
       is the one waiting for the confirmation (the same browser, or an
       Android app sharing it), this is the place: stay signed in. Otherwise
       ask (item 61): here, or the home-screen app, which on an iPhone keeps
       separate storage and signs itself in when it comes back to the front. */
    let mine=null;try{mine=JSON.parse(localStorage.getItem(ACCT_WAIT)||'null');}catch(e){/* no marker */}
    if(mine&&Date.now()-(+mine.t||0)<60*60000){
      try{localStorage.removeItem(ACCT_WAIT);}catch(e){/* nothing to clear */}
      if(typeof A.release==='function')A.release();
      openModal({kind:'account',mode:'sent',title:'Email confirmed',msg:'You are signed in. Your log syncs to your account.'});
      cloudInit();
    }else openModal({kind:'account',mode:'where',title:'Email confirmed'});
  }
  acctRerender();
}
/* Retry when the phone comes back online or the app returns to the
   foreground: a sign-in that could not refresh offline starts syncing then. */
window.addEventListener('online',()=>{
  if(AUTH()&&!cloud.on)cloudInit();
  // Back from a dead zone: sync now instead of waiting out the retry timer.
  else if(cloud.on&&cloud.status==='offline'){cloud.retry=0;clearTimeout(cloud.t);cq(cloudPull);}
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  if(acctWait.pw){waitTry(false);return;}
  if(AUTH()&&!cloud.on)cloudInit();
});
function acctPanel(){
  if(!AUTH()||(window.claude&&typeof window.claude.use==='function'))return '';
  const u=acct.user;
  // Signed in but not syncing: the sign-in could not be used (offline at
  // launch, or refused). Say so and offer a retry rather than looking fine.
  const stuck=u&&!cloud.on?`<div class="row spread" style="margin-top:6px"><p class="small" style="margin:0;color:var(--yellow)">Not syncing right now.</p><button class="btn sm" data-act="acctRetry">Try again</button></div>`:'';
  return u
    ?`<div class="panel" id="acctPanel"><div class="row spread"><p class="small" style="margin:0;min-width:0;overflow-wrap:anywhere">Signed in as <b>${esc(u.email)}</b></p><button class="btn sm" data-act="acctSignOut">Sign out</button></div>${stuck}${typeof AUTH().deleteAccount==='function'?`<button type="button" class="linkbtn" style="margin-top:8px;color:var(--red)" data-act="acctDelete">Delete my account</button>`:''}</div>`
    /* Signed out, this one line says where the log is and what an account adds (r34.2): Your data
       used to say it four times (this panel, the storage line, the privacy line, Backup due). */
    :`<div class="panel" id="acctPanel"><p class="small hastip" style="margin:0 0 8px" data-tip="${esc(isStandalone()?'Deleting the app from the home screen deletes the log on this phone. An account keeps it, or save a backup file below.':'Clearing this browser\'s data deletes the log here. An account keeps it, or save a backup file below.')}"><b>Saved on this ${isStandalone()||coarse()?'phone':'device'} only.</b> Create an account to back it up and use it on any device.</p><div class="row"><button class="btn sm primary" data-act="acctOpen" data-mode="signup">Create account</button><button class="btn sm" data-act="acctOpen" data-mode="signin">Sign in</button></div></div>`;
}
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* The code from the confirmation email (r45), on the waiting sheet and, after
   "Confirm your email first", on sign-in: the code needs only the email, so
   it still works after the wait gives up or the app was closed. Digits only
   are sent; the length is the project's (6 by default), so none is forced. */
function codeField(m){return `<label class="field">Code from the email<input type="text" inputmode="numeric" autocomplete="one-time-code" data-abind="code" value="${esc(m.code||'')}" enterkeyhint="go"></label><button type="button" class="btn primary block" data-act="acctCode" ${m.busy?'disabled':''}>Confirm with the code</button><div class="row"><button type="button" class="linkbtn tall" data-act="acctResend" ${m.busy?'disabled':''}>Send a new code</button></div>`;}
function acctSheet(m){
  const f=(label,k,type,ac,extra)=>`<label class="field">${label}<input type="${type}" data-abind="${k}" value="${esc(m[k]||'')}" autocomplete="${ac}" ${extra||''}></label>`;
  const email=f('Email','email','email','email','autocapitalize="off" autocorrect="off" spellcheck="false" inputmode="email" enterkeyhint="next"');
  const err=m.err?`<p class="small" role="alert" style="color:var(--red);margin:0">${esc(m.err)}</p>`:'';
  // What it is doing while busy, not "Working" (r34.2).
  const busyW={signin:'Signing in',signup:'Creating your account',forgot:'Sending the link',newpw:'Saving'}[m.mode]||'One moment';
  const go=(label)=>`<button type="submit" class="btn primary block" data-act="acctSubmit" ${m.busy?'disabled':''}>${m.busy?busyW:esc(label)}</button>`;
  const link=(mode,label)=>`<button type="button" class="linkbtn tall" data-act="acctMode" data-mode="${mode}">${label}</button>`;
  const T={signin:'Sign in',signup:'Create account',forgot:'Reset password',newpw:'New password',sent:m.title||'Check your email',wait:'Check your email',where:m.title||'Email confirmed'};
  let b='';
  if(m.mode==='signin')b=`${email}${f('Password','pw','password','current-password','enterkeyhint="go"')}${err}${m.needCode?codeField(m):''}${go('Sign in')}<div class="row spread">${link('forgot','Forgot password?')}${link('signup','Create an account')}</div>`;
  else if(m.mode==='signup')b=`${email}${f('Password (8 or more characters)','pw','password','new-password','minlength="8" enterkeyhint="go"')}${err}${go('Create account')}<p class="small muted" style="margin:0">We email you a link and a code to confirm the address. Your email is only for signing in and never shared.</p><div class="row">${link('signin','I have an account')}</div>`;
  else if(m.mode==='forgot')b=`${email}${err}${go('Email me a reset link')}<p class="small muted" style="margin:0">The link opens in your browser. Set the new password there, then sign in here.</p><div class="row">${link('signin','Back to sign in')}</div>`;
  else if(m.mode==='newpw')b=`${f('New password (8 or more characters)','pw','password','new-password','minlength="8" enterkeyhint="go"')}${err}${go('Save new password')}`;
  else if(m.mode==='wait')b=`<p style="margin:0">We sent a confirmation email to <b>${esc(m.email||'')}</b>. Type its code here, or tap its link and come back: ${APP_NAME} signs you in by itself.</p>${codeField(m)}<p class="small muted waitline" style="margin:0" aria-live="polite">${m.busy?'Checking':'Waiting for the confirmation'}</p>${err}<button type="button" class="btn block" data-act="acctWaitNow" ${m.busy?'disabled':''}>I have confirmed</button><div class="row">${link('signup','Use a different email')}</div>`;
  else if(m.mode==='where')b=`<p style="margin:0">Where do you use ${APP_NAME}?</p><button type="button" class="btn primary block" data-act="acctWhere" data-v="app">The home-screen app</button><button type="button" class="btn block" data-act="acctWhere" data-v="here">Here in this browser</button>`;
  else b=`<p style="margin:0">${esc(m.msg||'')}</p><button type="button" class="btn primary block" data-act="mClose">OK</button>`;
  return `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(T[m.mode]||'Account')}"><div class="sheet-h"><h3>${esc(T[m.mode]||'Account')}</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div><form class="stack" id="acctForm" novalidate>${b}</form></div>`;
}
/* Says plainly where the data lives and what leaves the device. Inside Claude
   the log is stored with the Claude account; anywhere else there is no server
   at all. This must change when cloud sync for the standalone app arrives. */
/* What the suggestions are, said once where people look (r31.1, V: a
   subtle notice). The numbers come from published formulas and stated
   conventions applied to the lifter's own log; they can be wrong, and the
   app cannot see form, pain, or health. */
const SAFETY_TXT=`${APP_NAME} works out suggested loads and reps from your own log with published formulas and the conventions stated in the Guide. They are estimates, not medical, physical therapy, or coaching advice, and they can be wrong. Use good technique, and safety bars or a spotter on heavy lifts. Stop on pain. Check with a doctor before starting or changing training, especially with an injury, a health condition, or a pregnancy. You train at your own risk.`;
function safetyLine(){return `<p class="small muted" id="safety" style="margin:8px 0 0"><b>Suggestions:</b> estimates from your log, not medical or coaching advice. Train within your limits and stop on pain. ${tipi(SAFETY_TXT,'About suggestions')}</p>`;}
function privacyLine(){
  const inClaude=!!(window.claude&&typeof window.claude.use==='function');
  if(!inClaude&&AUTH()&&acct.user)return `<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no ads, no tracking. Your log syncs to your ${APP_NAME} account. Only you and the app's owner can see it. Reports you send go to the app owner. ${tipi('It is stored in a Supabase database. Database rules let each account read and write only its own data. The person who runs that database, the app owner, can see stored data and your email address, as with any app without end-to-end encryption. Your email is used only to sign in and reset your password, and nothing is shared or sold. A new password is checked against known breaches with only the first 5 characters of its hash; the password never leaves the phone. Backup files go only where you save them.','About privacy')}</p>`;
  if(!inClaude&&AUTH())return `<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no ads, no tracking, and nothing sent without an account. Reports you send go to the app owner. ${tipi('Opening or updating the app downloads it from GitHub Pages, which, like any website host, sees your IP address; after that it works offline. With an account, your log and email are stored in a Supabase database, readable by your account and by the app owner; the email is used only to sign in and reset your password. A new password is checked against known breaches with only the first 5 characters of its hash. Deleting the app or this site\'s data deletes the copy on this device, so keep a backup file or an account.','About privacy')}</p>`;
  return inClaude
    ?`<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no ads, no tracking. Your log is stored with your Claude account. ${tipi('Export and CSV files go only where you save them.','About privacy')}</p>`
    :`<p class="small muted" id="privacy" style="margin:8px 0 0"><b>Privacy:</b> no account, no ads, no tracking. Your log stays on this device and is sent nowhere. Reports you send go to the app owner. ${tipi(`${APP_NAME} has no server. Opening or updating the app downloads it from GitHub Pages, which, like any website host, sees your IP address; after that it works offline. Backup files go only where you save them. Deleting the app or this site's data deletes your log, so keep a backup file.`,'About privacy')}</p>`;
}
function syncInfo(){
  if(!cloud.on)return isStandalone()
    ?`<p class="small hastip" style="margin:0" data-tip="Without an account this app keeps your data on this phone only. Deleting the app from the home screen deletes it too. Sign in to keep a copy in your account, or save a backup file to Files or iCloud Drive; Import brings it back on any device."><b>Saved on this phone.</b> ${AUTH()?'Sign in to sync, or export a backup weekly.':'Export a backup weekly.'}</p>`
    :AUTH()
      ?`<p class="small hastip" style="margin:0" data-tip="Everything is saved in this browser only. Clearing its data deletes it. Sign in below to keep a copy in your account, or export a backup."><b>Saved in this browser only.</b> Sign in to sync, or export a backup.</p>`
      :`<p class="small hastip" style="margin:0" data-tip="Sync turns on by itself when this page is opened inside Claude while signed in. Until then everything is saved in this browser only."><b>Cloud sync off in this view.</b> Saved in this browser only.</p>`;
  const ago=cloud.last?Math.round((Date.now()-cloud.last)/60000):null;
  const when=ago==null?'not yet':ago<1?'just now':ago<60?`${ago} min ago`:ago<1440?`${Math.round(ago/60)} h ago`:fmtDate(iso(new Date(cloud.last)));
  const st=cloud.status==='synced'?'<span class="tag green">Synced</span>':cloud.status==='offline'?'<span class="tag yellow">Waiting to sync</span>':'<span class="tag blue">Syncing</span>';
  return `<div class="sync-row">${st}<span class="small muted">Last synced ${when}</span><button class="btn sm" data-act="syncNow">Sync now</button></div>
  <p class="small hastip" style="margin:6px 0 0" data-tip="A new phone or a cleared browser loses nothing: sign in and your log comes back. Deleted items wait in History, Recently deleted, for ${TRASH_DAYS} days, and Undo in Settings covers the last 7 days.">${cloud.status!=='synced'?'Saved on this device. It reaches your account when you are back online.':window.claude?'Saved to your Claude account and this device.':'Saved to your account and this device.'}${cloud.err?` <b style="color:var(--red)">${esc(cloud.err)}</b>`:''}</p>`;
}
/* Two tabs (or the app and a second window) used to overwrite each other: each
   wrote its whole state, so the one that saved last erased what the other had
   saved. Now each tab hears the other's save and merges it into its own
   state, record by record, with this tab's last save as the base: changes
   made only there are taken, changes made only here are kept. Content is
   compared with canon(), which ignores key order, so two tabs holding the
   same data never keep rewriting it back and forth. */
window.addEventListener('storage',ev=>{
  if(ev.storageArea&&ev.storageArea!==localStorage)return;
  if(ev.key===SYNC_KEY&&ev.newValue){
    try{const m=JSON.parse(ev.newValue);if(m&&typeof m==='object'){if(m.meta&&typeof m.meta==='object')cloud.meta=m.meta;if(m.editAt&&typeof m.editAt==='object')cloud.editAt=m.editAt;if(m.last)cloud.last=m.last;}}catch(e){log('tabs',e);}
    return;
  }
  if(ev.key!==KEY||ev.newValue==null||ev.newValue===lastSaved)return;
  let incoming,base=null;
  try{incoming=normalize(JSON.parse(ev.newValue));}catch(e){log('tabs',e);return;}
  try{base=lastSaved?normalize(JSON.parse(lastSaved)):null;}catch(e){base=null;}
  const stat={conflicts:0};
  if(!base||canon(state)===canon(base))setState(incoming);
  else{
    const L=chunksOf(state),Rr=chunksOf(incoming),B=chunksOf(base),parts={};
    for(const id of new Set([...Object.keys(L),...Object.keys(Rr),...Object.keys(B)]))
      parts[id]=mergeChunk(id,baseOf(id,B[id]||emptyChunk(id)),L[id]||emptyChunk(id),Rr[id]||emptyChunk(id),true,stat);
    setState(assemble(parts));
  }
  lastSaved=ev.newValue;clearTimeout(saveT);saveT=null;
  invalidate();resyncLocalH();
  // Anything that was only here goes back out, so the other tab has it too.
  if(canon(state)!==canon(incoming))saveNow();
  if(!ui.modal)rerenderKeepScroll();else render();
  conflictNote(stat);
});
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){if(saveT)saveNow();if(cloud.on){clearTimeout(cloud.t);cq(cloudFlush);}}
  else if(cloud.on&&Date.now()-cloud.lastPull>20000)cq(cloudPull);
});
window.addEventListener('pagehide',()=>{if(saveT)saveNow();if(trackT||cloud.pendAt)trackEdits();});

