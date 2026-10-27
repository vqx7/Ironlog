/* The Guide (phase 5's first screen code, moved in r53 so that its words
   could follow r53's rules: the Guide must say what the code does, and the
   legacy script it lived in then changed only by moving). Its words change
   with the rules they state. */

import { numWord, orList, pct1, pctOf, shareWords, timesWord, MINUTE_S, WEEK_DAYS } from './util';
import {
  BACK_DAYS,
  BACK_RIR,
  BEST_WEEKS,
  BRZYCKI_TOP,
  CLEARLY_OFF,
  DAY_SWING_PCT,
  DELOAD_GAP_DAYS,
  DROP_CREDIT,
  DROP_START,
  E1_MAX_REPS,
  E1_MAX_RIR,
  EARLY_SESSIONS,
  FATIGUE_RIR,
  FIT_MAX_RTF,
  GROW_PCT,
  HALF_SET,
  HARD_RIR,
  HELPER_CREDIT,
  JUMP_CAP,
  JUMP_CAP_EARLY,
  JUMP_CAP_LIGHT,
  JUMP_COMPOUND,
  JUMP_ISOLATION,
  LIGHTER_LOAD,
  LIGHTER_READING,
  LIGHTER_REF,
  LIGHTER_SET_SHARE,
  LIGHT_LIFT_KG,
  LIGHT_SHARE,
  MUSCLE_TREND_MIN,
  NEW_LEVEL,
  PACE_DAYS,
  PACE_MIN,
  PACE_N,
  REP_PR_SHARE,
  RIR_CALL_TOP,
  RIR_TREND,
  SESSION_CAP,
  SHORT_MIN_SETS,
  STALL,
  TREND_MAX_RTF,
  TREND_MIN,
  TREND_WEEKS,
  USUAL_BEFORE,
  WORK_FLOOR
} from './formulas';
import { DEFAULT_STEP, LB } from './units';
import { USUAL_RANGE } from './library';
import { DEFAULT_PLAN, PROFILE_PLAN } from './routines';
import { FOCUS_MAX, FOCUS_UP, MAINT_SHARE, STR_NEAR, STR_REST } from './profile';
import { BW_EVERY_DEFAULT, REGION_WKS, REGION_WK_DEFAULT } from './layout';
import { TRASH_DAYS, TRASH_MAX } from './records';
import { BAND_RANGES } from './prs';
import { IMPORT_REPEATS, IMPORT_WEEKS } from './importing';
import { LIGHT_RIR, effAt } from './format';
import { CAL_WEEKS, PICK_DAYS, RIR_USUAL_MIN, USUAL_SHARE } from './analytics';
import { FATIGUE_STALLS, MISSED_WEEKS_SAID } from './coach';
import { AVG_WEEKS, FIRST_WEEK_REASON, LIGHTER_WEEK_WORDS } from './weeks';
import { BIG_STEP_REPS, BUILD_PAST, FIXED_RANGE, JUST_UP, KIN, ODD_BEST, ODD_SESSION, SHORT_RUN } from './engine';
import { state } from './store';
import { U } from './live';
import { UNDO_DAYS } from './storage';
import { AUTH, FB } from './providers';
import { halfLbl } from './effort';
import { whtrBands } from './stats';
import { CAL_OFFER, ODD_REPS, ODD_REPS_TIMES } from './worksets';
import { html } from 'lit-html';
import type { TemplateResult } from 'lit-html';
import { markup } from './view';

/* The Guide's numbers, each the constant its rule applies (the numbers pass,
   r61), so a changed rule changes what the Guide says. The profile's plans
   are Strength's, Both's and a first year's. */
const S = PROFILE_PLAN.strength,
  B = PROFILE_PLAN.both,
  F = PROFILE_PLAN.first;
/** The most one session may raise a load, as percents: in general, on a light isolation lift, and in a lift's first sessions. */
const CAP = pctOf(JUMP_CAP - 1),
  CAP_LIGHT = pctOf(JUMP_CAP_LIGHT - 1),
  CAP_EARLY = pctOf(JUMP_CAP_EARLY - 1);
/** The load under which an isolation lift takes the larger cap, in the unit on screen: in pounds, about it, to the nearest default step. */
const lightLift = (kg: boolean): string =>
  kg ? `${LIGHT_LIFT_KG} kg` : `about ${Math.round(LIGHT_LIFT_KG / LB / DEFAULT_STEP.lb) * DEFAULT_STEP.lb} lb`;
/** The weeks the radar can average besides its default. */
const OTHER_WKS = orList(REGION_WKS.map(([n]) => n).filter(n => n !== REGION_WK_DEFAULT));

/* The Guide (r27): how Ironlog works and the rules behind its numbers, in
   one place, opened from the menu. Screens keep the number and the action;
   the reasoning lives here, so it is findable on a phone where nothing can
   be hovered. Each topic folds. Keep it in step with the code: the rules
   here are the ones suggest(), IDX() and shortPlan() apply. */
export function guideSheet(m: { open?: string | undefined }): TemplateResult {
  const off = state.settings.rirMode === 'off';
  const kg = U() === 'kg';
  const inClaude = !!(window.claude && typeof window.claude.use === 'function');
  const accts = !inClaude && !!AUTH();
  const where = inClaude
    ? `<p><b>Your log</b> is saved with your Claude account and in this browser.</p>`
    : accts
      ? `<p><b>Without an account</b> your log is on this phone only: deleting the app deletes it. Export a backup in Settings, Your data, and keep it in Files.</p>
   <p><b>With an account</b> it syncs, and signing in on any device brings it back. Only you and the app owner can see it. Your email is used only to sign in and reset your password; nothing is shared or sold. Continue without an account on the first page keeps everything on the phone, and the account can be added any time from the menu.</p>`
      : `<p><b>Your log</b> is saved in this browser only: clearing its data deletes it. Export a backup in Settings, Your data.</p>`;
  const report = FB()
    ? '<p><b>Report a problem</b> is in the menu at the top right and in Settings, Help. It needs an account, and never includes your workouts.</p>'
    : '<p><b>Report a problem</b> is in the menu at the top right and in Settings, Help. Here it copies the details for a message instead of sending them, and never includes your workouts.</p>';
  const T = [
    [
      'today',
      'Today',
      `<p><b>The card at the top</b> is the next day of your routine. Start begins it; <b>Change</b> has everything else: a lighter day, short on time, a blank session, Pick for me, and another day of your plan. With Settings, Rest timer and logging, <b>Today starts with</b> a blank session, the card starts an empty session instead, the plan's day in Change; your week is then measured by sessions and hard sets, not a plan.</p>
   <p><b>Lighter day</b>: every exercise, ${shareWords(LIGHTER_SET_SHARE)} the sets (rounded up), about ${pctOf(LIGHT_SHARE)}% of the loads, ${LIGHT_RIR} or more reps in reserve, and nothing to beat. For a day you are run down. A lift you still do at its usual load and reps, for as many sets, counts in full for that lift: its next target and its trend; a lift done lighter, or for fewer reps or sets, does not. A PR counts on any day.</p>
   <p><b>Short on time</b>: give your minutes. Sets come off down to ${SHORT_MIN_SETS} per exercise, then exercises not started drop out. Priority and lagging muscles, exercises you have started, and at least one exercise per muscle are kept longest. Done sets are never touched. Trimmed work does not count against trends. Undo puts it back.</p>
   <p><b>Minutes</b> (~75 min) are worked out from your sets, reps, and rest. Once you have finished ${PACE_MIN} sessions in the app in the last ${PACE_DAYS / WEEK_DAYS} weeks, they follow how long yours take against that estimate: the typical one of your newest ${PACE_N}, so one long day does not move it, and a clock left running is left out.</p>
   <p><b>Pick for me</b> ranks your routine's days by what each muscle got in the last ${PICK_DAYS} days against your targets, how recently it was trained hard, injuries, and your cycle. Starting one moves your cycle on from there.</p>
   <p><b>Blank session</b>: any exercises, not tied to a routine day, so your cycle stays put.</p>
   <p><b>More options</b>: Deload week, Limited equipment (each exercise your gym cannot do swapped for the closest match), Rest week (a week off on purpose: averages, the streak, and adherence skip it), Flag an injury, and Log cardio.</p>
   <p><b>Two sessions in a day</b> are kept in the order you started them; the next targets come from the later one, and a calendar day with two asks which to open.</p>
   <p><b>Weigh-in</b>: a card asks for your bodyweight every ${BW_EVERY_DEFAULT / WEEK_DAYS} weeks once you have weighed in or log bodyweight lifts (Settings, General, Weigh-in reminder: every week, 2 weeks, month, or off). Pull-ups, dips, and push-ups are read at your latest weigh-in.</p>
   <p><b>This week</b> counts hard sets logged against hard sets planned; Month shows the calendar instead, and the title becomes This month. The bar at the top of every tab is this week: filled is a day you lifted, a coloured outline is cardio only, a grey ring is a workout planned ahead, and with fixed weekdays a red ring is one missed. Tap an empty past day to log a workout for it. The calendar shows the workouts planned ahead the same way, for a year: tap one to see it on Today; a numbered cycle is counted on from where you are, one day at a time, and a rest week planned ahead plans nothing and holds the cycle where it is.</p>`
    ],
    [
      'log',
      'Logging a session',
      `<p><b>Grey numbers are suggestions.</b> Tick a set to log it as shown, or type over the load or reps first. Nothing you type is ever changed by the app.</p>
   <p><b>Grey reps</b> are last time's reps for that set, at today's load, and one set under the bottom of the range among the others shows the bottom of the range. When today's target is a new load, last time's reps were at the old load, so they are the reps of the set above instead, or the bottom of the range. On a lighter day or in a deload, they are the bottom of the range.</p>
   <p><b>Grey loads</b> are the set above, or today's suggested load. To have loads typed in for you: Settings, Rest timer and logging, Fill in suggested loads.</p>
   <p><b>Auto-mark</b> (Settings): a set ticks itself when you leave its reps field.</p>
   <p><b>A missed set</b>: type 0 reps and tick it (auto-mark ticks it too). It is kept and shown as missed, and counts toward no volume, PR, estimate, or target; the next set's grey numbers come from the last set you completed.</p>
   <p><b>A number far off</b> asks before the set is logged, Log it or Fix it: reps over ${ODD_REPS} and more than ${timesWord(ODD_REPS_TIMES)} the top of your range or your most ever, whichever is more, or a load more than ${timesWord(ODD_SESSION)}, or under ${shareWords(1 / ODD_SESSION)} of, the heaviest set you ticked today, or more than ${timesWord(ODD_BEST)} the heaviest you have logged on the exercise (conventions, to catch a slipped digit or the other unit). So does a load under the empty bar, on any set of a lift on the full bar typed as the total (the bar in Settings, or the exercise's own).</p>
   <p><b>RIR</b>, reps in reserve: how many more reps you could have done. Tap a set's RIR box for 0 to ${RIR_CALL_TOP} (Settings can switch it to half reps or RPE; RPE ${effAt('rpe', 2)} is RIR 2). ${off ? 'RIR is off in Settings, so every working set counts as hard.' : `It is optional: a blank reads as your usual RIR on that lift once you have rated ${RIR_USUAL_MIN} of its sets in ${CAL_WEEKS} weeks, and until then as hard.`}</p>
   <p><b>RIR check</b>: once you have ${CAL_OFFER.sessions} sessions, one machine or cable exercise may ask for one set to failure, to see how far your RIR calls are off. Not now, or finishing without it, waits ${CAL_OFFER.weeks} weeks.</p>
   <p><b>Last</b>, beside each set, is what you did on that set last time at your working load, from the session named above the sets; a top single or lighter sets stay in that line. <b>W and D</b>: tap a set's number once for a warm-up (kept, never analysed), twice for a drop set (counts ${shareWords(DROP_CREDIT)} a set of volume, never as a PR or target). <b>+ Drop</b> beside + Set adds one at about ${pctOf(DROP_START)}% once a set is done; warm-ups are in the exercise's ⋯ menu.</p>
   <p><b>Supersets</b>: an exercise's ⋯ menu, Superset with the next one (Finish then offers to keep it in your plan), or Plan's Superset with next. The rest timer waits until the partners are done, and session minutes leave out the rest between them.</p>
   <p><b>The next sets adjust</b> after a set that was clearly off plan, on the sets whose load is still the app's (never one you typed). Up: ${CLEARLY_OFF} or more reps in reserve over your target with the reps in your range, or ${CLEARLY_OFF} or more reps past the top. Down: ${CLEARLY_OFF} or more reps under both the range and what today asked for, without reserve to spare. The new load is what that set says you can do in the middle of the range (up) or at its bottom (down), with ${numWord(FATIGUE_RIR)} more rep in reserve, in real steps, at most ${CAP}% up (${CAP_LIGHT}% on light isolation lifts), and at least one step when a set was rated ${RIR_CALL_TOP} or more in reserve. When no heavier load fits, the same load for more reps. A blank effort reads as your usual. Keep stays on your load. Not on a lighter day, a deload, a past workout, an injured area, an assisted lift, or a bodyweight lift never done with added load. Settings, Rest timer and logging turns it off.</p>
   <p><b>+ Set and − Set</b>: − Set takes an empty row first and asks before a filled one. Removing anything you entered asks first, and Undo follows.</p>
   <p><b>Muscles worked</b>, in an exercise's ⋯ menu, shows what it trains on the body: the main muscle in your accent colour, helpers lighter (they count ${shareWords(HELPER_CREDIT)} a set). Flat or 3D, as on Today's map. The exercise editor shows the same as you pick the muscles.</p>
   <p><b>Order</b>: drag an exercise by its ⠿ to move it, or use the arrow keys on the ⠿, or Move up and Move down in its ⋯ menu. A superset split by a move becomes two single exercises. An exercise you start ahead of ones not yet touched moves up, to just after the last one you started.</p>
   <p><b>An exercise you add</b> takes its sets and rep range from your routine when it is on a day there; otherwise from its own last full session (the range from Your training when that sets one); otherwise the start for a new exercise. Finish offers to keep it in the day, with a normal day's sets.</p>
   <p><b>Swap</b>: sets you did stay with the old exercise; the new one takes the sets left, with its own rep range and rest when it has them in your routine.</p>
   <p><b>Finish</b> saves the ticked sets and asks about any with reps but no tick. <b>Discard</b> asks only when something was entered.</p>
   <p><b>A past workout</b>: tap an empty past day in the bar, or History, Log a past workout. Targets and PRs read as of that date. It is never set up as a deload, since the app does not know which day a deload week began: type what you did.</p>`
    ],
    [
      'rules',
      'How targets are set',
      `<p class="muted">These are estimates from your log, not medical or coaching advice. Adjust them to how you feel on the day, and stop on pain.</p>
   <p><b>In short.</b> Before a session, from your last full session: every set at the top of the range, or ${CLEARLY_OFF} or more in reserve over your target, more load; well short of the range, less load; anything else, the same load for more total reps. During a session, the next sets change only after a set that was clearly off: ${CLEARLY_OFF} or more reps past the top, or ${CLEARLY_OFF} or more in reserve over your target with the reps in the range, heavier; ${CLEARLY_OFF} or more reps under the range and under what was asked, lighter; anything else, the same load, with last time's reps in grey. Loads show in grey, taken when you tick the set, or typed in for you with Settings, Rest timer and logging, Fill in suggested loads. A load you type is never changed. Every target on the session screen has an i beside it, Why this target, which gives the reason for that exact number and what makes the load go up next. The details follow.</p>
   <p><b>A target is not a record.</b> The target is what to beat in today's session, worked out from your last full session of that lift. A record is the best you have ever done: the heaviest set of a lift shows while you train it, and every record is under Stats, Lifts, All-time bests. A PR is the moment you set one, and it is announced as you log the set, on any day. Lifts you did before this app count the same way once they are in: History, Log a past workout.</p>
   <p>Each exercise progresses from its <b>last full session in the rep range you plan for it that day</b>, so the same lift on a heavy day and a light day progresses on each separately. A range not used within ${TREND_WEEKS} weeks of your latest session of the lift starts from that latest session instead.</p>
   <p><b>The working load</b> is the load you did the most sets with (the heavier on a tie), leaving out loads under ${pctOf(WORK_FLOOR)}% of your heaviest. A heavy top set, or two, before your back-off sets counts for bests and PRs, while targets, grey reps, and trends build on the back-off sets.</p>
   <p><b>Every set at the top of the range</b>: add load, in whole steps of the exercise's load step, about ${pct1(JUMP_COMPOUND)}% of the load on compound lifts and ${pct1(JUMP_ISOLATION)}% on isolation lifts, at least one step. Plan, Load jump % sets a different share for one exercise (0: one step every time). When one step is large for the load (it costs ${BIG_STEP_REPS} reps or more, as 5 lb on a 35 lb dumbbell does), on a range ${FIXED_RANGE} or more reps wide, you first build a few reps past the top at this load, up to ${shareWords(BUILD_PAST.share)} of the top of the range more (${numWord(BUILD_PAST.min)} at least), until your estimate says the new load allows the bottom of the range; then the load goes up. Past that, the load goes up anyway, with the reps your estimate allows there as the target. A fixed-rep plan (5 x 5, 3 x 3-5) goes up a step every time all its sets are done.</p>
   <p><b>Dumbbells and kettlebells</b> step by what your rack has: with no load step set on the exercise, the step fits every load you logged on it (12, 14, and 16 kg is a rack in 2 kg steps; 12.5 and 15, one in 2.5).</p>
   <p><b>Otherwise</b>: the same load; beat last time's total reps over the same number of sets, a set past the top of the range counting as the top. One set under the range among the others counts as the bottom of the range, so one bad set does not set the next target. A session clearly below your usual repeats the last target (One rule for every session, below); a second in a row is your usual, and then every set under the range at a load you did in it the time before asks for the bottom of the range in every set again.</p>
   <p><b>Well past the range</b> (every set ${CLEARLY_OFF} or more reps over the top, as after moving the range down): the load your estimated 1RM gives for the middle of the range, at most ${CAP}% more (${CAP_LIGHT}% on isolation lifts under ${lightLift(kg)}), in whole steps.</p>
   <p><b>Below the range</b> (every set ${CLEARLY_OFF} or more reps short, or short two sessions running at the same load, or ${numWord(SHORT_RUN)} running even with the reps creeping up, or the first time in a range you have not trained, as after an import): down to what your estimate says fits the range, in whole steps. Not just after one step up while you are ${JUST_UP.short} or fewer reps short, and not while your reps at that load are rising. The rep target counts as many sets as the plan has. A single session clearly below your usual is not read this way: it repeats the last target, and a second in a row becomes your usual.</p>
   <p><b>Too easy</b> (every top set logged ${CLEARLY_OFF} or more RIR above the target): the same estimate sets a heavier load, at most ${CAP}% more (${CAP_LIGHT}% on isolation lifts under ${lightLift(kg)}), and at least one step when every set was rated ${RIR_CALL_TOP} or more in reserve, where the estimate is only a floor.</p>
   <p><b>The first ${EARLY_SESSIONS} sessions</b> of a lift find its load: there the most these two can add is ${CAP_EARLY}%, so a first guess well under what you can do moves up by what your reps and reps in reserve allow, not a step at a time. A set rated ${RIR_CALL_TOP} or more in reserve is read as ${E1_MAX_RIR}, so from such sets the load moves about a step a session: rate the reps left as closely as you can. For picking a load only, sets past ${E1_MAX_REPS} reps to failure are read with Epley up to ${FIT_MAX_RTF}, so a set of 25 still moves the load the right amount (never shown as a 1RM). A convention.</p>
   <p><b>The first session of a close variation</b> (a hammer curl after DB curls, a front squat after back squats) starts from the related lift's last full session in the last ${KIN.days} days, when both use the same equipment, load, main muscle, and movement, with both arms or both legs at once. About ${pctOf(KIN.isolation)}% of its estimate (${pctOf(KIN.compound)}% on a compound lift), for the middle of the range with ${numWord(FATIGUE_RIR)} more rep in reserve, rounded down. Machines and cables start fresh, since two machines' numbers do not compare.</p>
   <p><b>At the heaviest load available</b> (set on the exercise), or with a load step of 0: more reps, then harder reps.</p>
   <p><b>Assisted machines</b>: less help is progress. <b>Timed holds</b>: add seconds, then load. <b>Bodyweight lifts never done with added load</b> (push-ups, pull-ups, a hanging leg raise): more reps, then harder reps or a little added load when you type it; the app never adds load you did not use.</p>
   <p><b>Back after more than ${BACK_DAYS / WEEK_DAYS} weeks off a lift</b>: about ${pctOf(LIGHT_SHARE)}% of its last working load, with ${BACK_RIR} or more reps in reserve (a convention: strength holds for about 4 weeks without training and falls faster after, Bosquet 2013). That first session back is the lift's new start. The next target picks up from it; its trend and stall test start again from it too, never drawn across the break. A Lighter day or a deload as the first session back sets no target, so the session after it is still back. A timed hold comes back the same way, at its load, holding about ${pctOf(LIGHT_SHARE)}% as long.</p>
   <p><b>Your gym</b> (Settings): the dumbbells, kettlebells, plates, and stack steps you have. Suggestions stay on them, and a weight you type for a dumbbell counts as the nearest one.</p>
   <p><b>New machine or gym</b> (in an exercise's ⋯ menu during a session): the lift starts over from that session, as from a first one, so another machine's loads give no target, PR, or best. Its trend, stalls, and dumbbell steps read from that session on; earlier sessions stay in History and its chart. Tap it again before Finish to take it off.</p>
   <p><b>One rule for every session.</b> A session sets the lift's next target only at its usual load and reps for its usual sets. Its usual is the middle of that session and the ${numWord(USUAL_BEFORE)} before it in the range (not counting ones done lighter); its usual sets are never more than the plan asks, and in a session on a day of your routine they are the sets the plan gave the lift that day, once a session has done that many, so fewer sets than planned never become the usual there. Each session keeps the plan it was done to, so a plan changed later never rereads the sessions before it; sessions saved before version 2.12 read their own sets. A set counts toward them when its load is within ${shareWords(1 - LIGHTER_LOAD)} of the session's working load, or at the usual load (a convention): a last set tried a step up, or sets lowered after a hard first one, still count, and a back-off set ${shareWords(1 - LIGHTER_LOAD)} or more lighter does not. Sets past the usual count are left out when a session is compared with its usual. With fewer sets, or reps clearly under the usual at no heavier load (more than ${pctOf(1 - USUAL_SHARE)}% by the strength reading, a convention), the target repeats, and the session still counts for its trend and PRs; two such sessions in a row are the new usual, and the app follows, except that fewer sets than the plan asks stay short. A heavier load than the ${numWord(USUAL_BEFORE)} before is a step up, never short of the usual by its reps. A session done lighter sets no target and no trend. The same holds on a lighter day or in a deload: a lift done there at its usual load and reps is read as on any day, and its own sets were cut by the day, so they never become its usual.</p>
   <p><b>Last</b> is the most recent session of the lift in that day's rep range (the most recent of all when the range is new), labelled fewer sets, below usual, lighter, or deload when it was. When it did not set the target, the next target comes from the last full session, and the i beside the target names its date; grey reps come from that session too after one below usual or done lighter.</p>
   <p><b>Deload week</b>: ${shareWords(LIGHTER_SET_SHARE)} the sets (rounded up), about ${pctOf(LIGHT_SHARE)}% of the load the normal day would ask for (or of last time's, if lower), in whole steps down (never under the empty bar on a full-bar lift), the bottom of the range, ${LIGHT_RIR} or more reps in reserve. A week with ${LIGHTER_WEEK_WORDS}, stays out of the weekly volume average (a lift done there at its usual load with fewer sets than usual counts as done lighter for this, the sets cut on purpose); each lift done lighter stays out of its trend. A <b>lighter day</b> is the same for one day.</p>
   <p><b>Lighter sessions nobody marked</b> (an imported deload, say) are read from the numbers: a lift's heaviest load at least ${pctOf(1 - LIGHTER_LOAD)}% under its previous ${numWord(LIGHTER_REF)} sessions and its strength reading at least ${pctOf(1 - LIGHTER_READING)}% under. They are kept in history and, like a deload, set no target or trend. A session with half or more of its lifts done lighter, marked or read, is a lighter session, and a week with more than half its sessions lighter is left out of the weekly averages. Lighter sessions in a row, ${numWord(NEW_LEVEL.sessions)} or more over ${NEW_LEVEL.days / WEEK_DAYS} weeks or more, are a new level, not a deload, and count again. A convention.</p>
   <p><b>An exercise stopped early</b>, or cut by Short on time, is read by the rule above: with fewer sets than usual it sets no target, and still counts toward its trend. Finish asks first when sets are left.</p>
   <p><b>Make it lighter</b>, after a low check-in, changes only the exercises not started yet. What you already did at full effort still sets next time's target.</p>
   <p><b>An injury</b> flagged on a muscle or a joint (knee, hip, shoulder, elbow, wrist) pauses targets for exercises that load it and caps their load at last time.</p>
   <p><b>Changes apply at once</b>: a new load step, rep range, or heaviest load reaches the exercises in your session that you have not started yet.</p>`
    ],
    [
      'stats',
      'Volume and Stats',
      `<p><b>A hard set</b> is a working set at RIR ${HARD_RIR} or less${off ? ' (with RIR off, every working set)' : ''}. Helper muscles count ${shareWords(HELPER_CREDIT)} a set (Pelland 2025); which muscles are helpers on each lift is the library's own call, a convention. With Settings, Count ${halfLbl()} as half a set on, a working set past RIR ${HARD_RIR} counts ${shareWords(HALF_SET)} toward your weekly sets and targets, planned ones too (a convention); estimates, PRs, recovery, and the per-workout flag still count hard sets only.</p>
   <p><b>Weekly targets</b> are per muscle in Settings, Weekly set targets. ${USUAL_RANGE[0]} to ${USUAL_RANGE[1]} hard sets a week for major muscles is typical, not a ceiling. The muscles lifters train directly for size (chest, lats, upper back, side delts, rear delts, biceps, triceps, quads, hamstrings, glutes, calves, and abs) have a target to start, since the dose-response studies measure such muscles. Every other muscle (traps, forearms, front delts, lower back, obliques, adductors, abductors, serratus, rotator cuff, neck, and tibialis) is tracked only: counted and shown, with no target, until you give it one with Set a target in Weekly set targets or name it a focus (any but serratus, rotator cuff, neck, and tibialis); then it counts everywhere a target counts. A target starting at 0 is met with no sets. A muscle is below target when its weekly average, to one decimal as shown, is under the minimum. On a routine run as a cycle, weeks can differ in which of its days fall in them (two days in turn, three times a week). A muscle under its minimum only because fewer of the days that train it fell in the weeks averaged reads <b>on plan</b> when every session and set the cycle had due in those weeks was done and the plan reaches the target over the whole cycle. The radar on Stats measures each region against its minimum, so on or past the ring is on target. It averages your last ${REGION_WK_DEFAULT} full weeks, from the week after your first; the chips above it switch to ${OTHER_WKS} weeks, for the radar only. During the week, short of the minimum shows as under way, not below.</p>
   <p><b>Lagging strength</b> is a muscle whose lifts are falling, or flat with one of them stalled (a convention); with no clear trend, a stalled lift reads <b>A lift stalled</b>. A muscle whose lifts are all within day-to-day noise reads <b>unclear</b>, never 0%.</p>
   <p><b>Your target and the usual range</b>: picking a ready-made routine sets your minimums to what it plans, so Stats measures you against your plan. Plan, Weekly volume names the muscles that plan puts under the usual range.</p>
   <p><b>Planned sets</b> count the same way: a set planned at RIR ${HARD_RIR + 1} or more is not a planned hard set, and in a deload week the target is halved.</p>
   <p><b>More than ${SESSION_CAP} sets</b> for one muscle in one workout is flagged. That line is a convention from one study not yet peer reviewed (Remmert 2025), which found no extra growth past it.</p>
   <p><b>Three different numbers.</b> The <b>suggested</b> load and reps (grey in a session) are today's target, from your last full session by the rules above. The <b>estimated 1RM</b> (best estimate) is what one all-out rep would be. It comes from a set's load and reps to failure: Brzycki up to ${BRZYCKI_TOP} reps, Epley at ${BRZYCKI_TOP + 1} to ${E1_MAX_REPS}, and no estimate above ${E1_MAX_REPS} reps or above RIR ${E1_MAX_RIR}. It is a gauge of strength that varies ${DAY_SWING_PCT[0]} to ${DAY_SWING_PCT[1]}% day to day, never a load to try. It is shown for compound lifts only; isolation lifts show their best set.</p>
   <p><b>Trends</b> read each session's working sets the same way, averaged, up to ${TREND_MAX_RTF} reps to failure (so high-rep work has a trend too, never shown as a 1RM). RIR is used in a trend only when it is rated on ${pctOf(RIR_TREND.share)}% or more of the lift's sets; otherwise loads and reps alone, so tapping RIR on some days and not others cannot bend it. The ${TREND_WEEKS} weeks are counted back from the lift's own last session, and a trend needs ${TREND_MIN.sessions} sessions spread over ${TREND_MIN.days / WEEK_DAYS} weeks or more (and, on a bodyweight lift, a weigh-in, since it is read at your bodyweight); it says how many weeks it covers. A muscle's trend counts a lift once it has ${MUSCLE_TREND_MIN.sessions} sessions over ${MUSCLE_TREND_MIN.days / WEEK_DAYS} weeks or more, and says the weeks too. A trend shows how many sessions it rests on and its weekly rate with the range an 80% interval allows (about +1.5% a week, likely +1.2% to +1.8%). <b>Weight lifted</b> is load times reps; it falls when the load goes up and reps come down, so it is shown as a number, not as progress.</p>
   <p><b>A lift on Stats</b> says its change in what was lifted: the change in its estimated 1RM on a compound lift you load as a total (a barbell, a plate-loaded machine), the top set at each end on anything else. A number shows only when it points the same way as the trend. The percentages are behind its i. <b>Next session</b> is the target its next workout will show; there are no predictions of where a lift will be.</p>
   <p><b>Goals</b>: on Stats, Lifts, set a goal for a lift as a load for a number of reps (100 x 5). It is reached when a working set matches it, that load or more for those reps or more. Until then it shows how close your best estimate from the last ${BEST_WEEKS} weeks is to what the goal takes done to failure, and, on a compound lift you load as a total, about how much load is left for those reps. It gives no date: your session targets are the steps toward it. On a bodyweight lift the load is the added load.</p>
   <p><b>PRs</b>: a <b>weight PR</b> is more weight than any earlier set of the lift (less help on an assisted one); a <b>best estimate</b> beats every earlier estimate of the lift; a <b>best for its reps</b> beats the earlier best in the same band of reps to failure (${BAND_RANGES.join(', ')}); a <b>rep PR</b> is more reps at a load than ever before, counted only when the set is at least ${pctOf(REP_PR_SHARE)}% as strong as your strongest before it (a convention: 40 x 10 after 95 x 5 is not a PR). A set that is more than one shows the first of these. A load in the other unit, after a change of units or gyms, is read as the earlier load it stands for when it is the nearest load over it on its own spacing (a convention: 155 lb after 70 kg, which is 154.3 lb, is not a weight PR; 157.5 lb is). PRs count on any day, a lighter day, a deload, and an exercise made lighter included, and are announced as you log the set. Only a PR with a new best estimate is announced and counted (on a lift with no estimate, or a bodyweight lift before any weigh-in, any of them); a heavier set or more reps without one is kept in the list and named in the recap as heaviest yet. Counting them all made each load step a PR. On a bodyweight lift, PRs, estimates, trends, and charts are all read at your latest weigh-in for every session, so progress is more reps or more added load, never a change on the scale. Weight lifted uses each day's weigh-in, the work actually done.</p>
   <p><b>Moving</b>: up ${GROW_PCT}% or more with a trend clearly above zero. <b>Falling</b>: down ${GROW_PCT}% or more with a trend clearly below zero, in each rep range you train it in; a lift on a heavy day and a light day falls only when it falls in both, and its line says which range is down. <b>Stalled</b>: flat or falling over the last ${STALL.sessions} sessions (by the middle of the changes between every pair of them, so one good or bad day does not decide it) in each rep range you train it in, or ${STALL.days / WEEK_DAYS} weeks if that covers more (at least ${STALL.min} sessions); a lift on a heavy day and a light day is stalled only when it is stalled in both. With no PR in the last ${STALL.noProgress} of them, nor, in a session of that range done lighter since the third-last, a set stronger than any before it, the load no heavier than at the start of that stretch, and no more reps at that load than any session before it in the stretch, and only while you still train the lift and no injury it loads is flagged (the app holds its load then). Adding load and dropping reps for a while, or adding reps to later sets, as double progression does, is not a stall. A deload is suggested when ${FATIGUE_STALLS} or more main lifts (compound lifts with an estimate) stall together, and not within ${DELOAD_GAP_DAYS / WEEK_DAYS} weeks of a lighter week (more than half its sessions done lighter, counted once it ends or from the second, or a deload begun mid-week, once its last two or more deload sessions were done lighter), a rest week, or a week with nothing trained in it, a week marked as a deload included; isolation and core lifts are listed but not counted for it.</p>
   <p><b>Weekly averages</b> are over the weeks you trained of the last ${AVG_WEEKS}, from the week after your first, or after your first back from a break of more than ${BACK_DAYS / WEEK_DAYS} weeks (${FIRST_WEEK_REASON}); the weeks before such a break are not counted as missed. A lighter week (${LIGHTER_WEEK_WORDS}) or a rest week is swapped for an earlier one. A week with no training is left out rather than counted as zero, and when ${MISSED_WEEKS_SAID} or more of the ${AVG_WEEKS} were missed the Coach says so first.</p>
   <p><b>Consistency</b>: weeks with at least as many sessions as the routine you trained that week planned (one session, when Today starts with a blank session). Each session records what its routine planned then, so changing or deleting the routine later does not rescore its weeks; sessions from before that record began read the routine as it is now. A cycle that is not a week long plans the whole number of sessions under its rate: every other day is 3.5 a week, so 3, for the streak, adherence, and This week alike. Rest weeks are skipped.</p>
   <p><b>Bodyweight</b> trends use ${WEEK_DAYS}-day averages. <b>Waist to height</b>: ${whtrBands(String)} (NICE 2022).</p>`
    ],
    [
      'plan',
      'Plan and your own exercises',
      `<p>A routine has days, and each exercise has sets, a rep range, a target RIR, rest, and a load step. The <b>target RIR</b> is ${DEFAULT_PLAN.rir} unless you change it, a convention: muscle growth improves as sets end closer to failure (Robinson 2024), but going all the way to failure grew muscle no more than stopping 1 to 2 reps short (Refalo 2024) and costs more fatigue. Some lifts in the ready-made routines use 0 or 2. A <b>numbered cycle</b> runs Day 1, 2, 3 in order, so a missed day waits; <b>fixed weekdays</b> pin each day to a weekday.</p>
   <p><b>Your own exercise</b>: Plan, Exercise library, New exercise, or + New exercise when adding one. Set the primary and helper muscles, the equipment, what the number you type means (per dumbbell, total, per side, or stack), bodyweight or assisted, one side at a time, timed, Movement (compound or isolation), the load step, and the heaviest load available. Every number above uses them.</p>
   <p><b>Your training</b> (Settings, and the routine picker on a first run) is optional. Strength starts new barbell, Smith, and machine compounds at ${S.repMin} to ${S.repMax} reps, ${S.rir} in reserve, ${S.rest / MINUTE_S} minutes' rest: heavier loads gave more strength for similar growth (Schoenfeld 2017; ACSM 2009), and 3 minutes' rest beat 1 (Schoenfeld 2016). Both starts them at ${B.repMin} to ${B.repMax}; that and the ${B.rir} in reserve are conventions. Under 1 year, whatever the goal, new exercises start at ${F.repMin} to ${F.repMax} reps (ACSM 2009); compounds stop ${F.rirCompound} reps short and isolation lifts ${F.rirIsolation}, a convention. Size keeps the defaults. Your routine changes only when you tap Apply, which raises rest but never turns a timer of 0 on; under 1 year it raises reps in reserve and keeps your ranges. Focus muscles, up to ${numWord(FOCUS_MAX)}, get weekly targets about ${pctOf(FOCUS_UP - 1)}% higher and the others drop to maintenance, ${shareWords(MAINT_SHARE)} of the usual minimum (Bickel 2011, Spiering 2021); ${pctOf(FOCUS_UP - 1)}% is a convention, and targets you typed stay. With Strength, Pick for me favours a heavy compound that is stalled or within ${pctOf(1 - STR_NEAR)}% of your best, rested, and not done for ${STR_REST} days (both numbers conventions). Days a week marks the ready-made routines that fit; every other day fits 3 or 4.</p>
   <p>Drag ⠿ to reorder exercises or move them between days, and to reorder days.</p>`
    ],
    [
      'sections',
      'Sections',
      `<p>Tap a section's title to fold or open it. Drag its ⠿ to move it; the order is kept. Each time the app opens, every section starts folded, except Sessions on History.</p>
   <p><b>More sections</b>: when a tab has sections hidden, its bottom lists them; tap one to add it. The menu at the top right has Show, hide, or reorder sections. Settings, Layout shows or hides any section (nothing stops being tracked), and Default layout goes back to how a new install starts.</p>
   <p><b>Your settings</b>: Settings has your training (goal, days, minutes, and focus), the rest timer, auto-mark, RIR, units, theme and accent, weekly set targets, and priority muscles.</p>`
    ],
    [
      'data',
      'Your data',
      `${where}
   <p><b>Deleted</b> sessions, cardio, and routines wait in History, Recently deleted: the ${TRASH_MAX} most recent, for ${TRASH_DAYS} days, or until you delete them for good there. A ready-made routine removed unchanged is not kept, since New from a template adds it again. Undo in Settings covers deletes, resets, and imports from the last ${UNDO_DAYS} days; after Erase everything, the first page offers it.</p>
   <p><b>Import workouts</b> reads notes, a spreadsheet, or an export from another app; you check everything before it is saved. On a first run, an import whose workouts repeat (most of them ${timesWord(IMPORT_REPEATS)} or more in its last ${IMPORT_WEEKS} weeks) also makes your routine; otherwise you pick the closest ready-made one. Its days come from the workouts' names (or from the lifts in them when the names are all alike) and keep each day's latest sets and rep range. Your weekly targets then fit that routine.</p>
   ${window.IRONLOG_APP ? '<p><b>Updates</b>: when "Update ready" shows, tap Update.</p>' : ''}
   ${report}`
    ]
  ];
  const open = m.open || '';
  return html`<div class="sheet guide" role="dialog" aria-modal="true" aria-labelledby="guideH"><div class="sheet-h"><h3 id="guideH">Guide</h3><button class="ib" aria-label="Close" data-act="mClose">✕</button></div>
  ${T.map(([k, t, b]) => html`<details class="gsec" data-g=${k} ?open=${open === k}><summary>${t}</summary><div class="gbody">${markup(b)}</div></details>`)}</div>`;
}
