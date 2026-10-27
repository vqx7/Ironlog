# Ironlog

A hypertrophy and strength tracker for one lifter, V, used on a phone at the gym. It ships as a standalone
installable web app: built from `src/` into one page, served by GitHub Pages at https://ironapp.org, working
offline, with the log on the phone and an optional account that syncs it. Every pull request also publishes a
preview app at https://ironapp.org/preview/ to try on the phone before merging. Build r62, version 2.16, state schema v5.

The Claude artifact version was retired by V on 2026-09-27 (`OWNER.md` Done): never work on it or republish it.
`cloudProvider()` still takes Claude's db when `window.claude` exists, because the sync suites use it as their
stand-in cloud.

## Where to look

- This file: the rules in force. Read it first; it is kept short on purpose (V, 2026-10-18).
- `docs/ARCHIVE.md`: the code map and the history behind each rule (which bug or ruling made it, where it lives).
  Search it for a function, setting or release name when you need the reason for something. It is not a rule book.
- `docs/EVIDENCE.md`: the sources behind every number, and which numbers are conventions.
- `ARCHITECTURE.md`: the plan for moving the legacy script into typed modules, the module layers, and the ratchet
  numbers `tests/hygiene.js` reads. Read it when moving code or changing what a module imports.
- `PENDING.md`: what is open; an item is built when V says go. `OWNER.md`: the steps only V does, with the exact
  code (`tests/owner-doc.js` keeps it identical to the repo's). `tests/SUITES.md`: what each suite checks.
  `FEEDBACK.md` and `SUPABASE.md`: problem reports and the account backend.

## How work is done (V, 2026-10-18; PENDING 316)

1. One release is one pull request. GitHub runs every suite in Chromium and in WebKit (the engine of every iPhone
   browser) and publishes the preview; V tries it on the phone and merges on GitHub's website.
2. A change a lifter can see gets a test that fails without it, written before the fix, and run on the build
   before it (`node tests/<suite>.js baselines/rN.html`) to show that it fails there.
3. Passing suites say behaviour did not change, not that it is right. Check a number that moves against what a
   knowledgeable lifter expects. A number shown in two places is one function, and `tests/coherence.js` checks
   that screens showing one quantity agree: extend it when a release adds or moves a number a lifter reads.
   `tests/personas.js` drives lifters by persona through the screens by taps and typing and checks them against the
   rules, not the build before (V, 2026-10-25): a release that moves or changes a screen extends it.
4. Old code in the legacy parts may be fixed in place, with the failing test first. A screen that is being changed
   substantially moves into `src/app/` instead. The legacy parts never grow: each build has no more top-level
   declarations and no more lines than the last (the ratchet in `ARCHITECTURE.md`, checked by `tests/hygiene.js`).
5. Releases are stacked (each pull request on the one before), so the preview carries the whole stack and V tries
   it once; V merges them in order. One independent review a stack, over all of it, before the first merge (V,
   2026-10-21), on the strongest model at full effort when the stack touches storage or sync; briefed to report
   correctness and data-loss problems only, each with a reproduction run on the stack and on the build before it,
   report only. Rerun each reproduction before acting; fix what it confirms, with a test; record the rest in
   `PENDING.md`.
6. Storage and sync keep the highest bar, because a lost log cannot be rebuilt (Invariants, Data and Sync). The app has a
   handful of users, each updating to the current build (V, 2026-10-24): devices several builds apart, three phones on
   one workout and similar cases are deferred, not ruled out, and stay tracked in `PENDING.md` (337) until users or V
   bring them back; one phone, one account and two tabs keep the bar.
7. One simple rule over special cases: add a rule only when a lifter would notice it missing (V, 2026-10-18:
   "I dont want to add random complex rules if they are not necessarily going to aid things").
8. The proper thing is done the first time (V, 2026-10-17): a type rather than a cast, one source for a value, a
   test for a new rule, documents kept true. Nothing that works for a lifter is weakened for the sake of the code.
9. Report what was verified and how, and what was not checked. Never report a problem that does not exist.

## What is in this repo

- `src/app/`: the typed modules (TypeScript). `config.ts` is the one place for the app's name, the versions
  (`DISPLAY_VERSION`, `APP_VERSION`), the site address, the library versions and the outside addresses. `store.ts`
  owns the shared state (`state`, `ui`, `cloud`, `acct`, `acctWait`); the log is replaced only through `setState`.
  The engine and the analytics are functions of a model (`model.ts`): each takes `M` (the log, the date the engine
  reads as today, the caches) as its first parameter and its name ends in `In` (`suggestIn`, `IDXIn`, `coachIn`).
  `live.ts` holds the one model the app runs on (`LIVE`) and the adapters through which the legacy script calls
  those functions by their old names (`export const suggest = live(suggestIn);`). Storage and sync are typed since
  r56: `normalize.ts` (the log as every build reads it), `storage.ts` (the keys, where the save stands (`device`),
  the error log (`log`), Undo's steps, a log kept aside for another account, in IndexedDB as Undo's copies are) and
  `sync.ts` (every write of the log, the account's documents, the sync notes, another tab, one workout open on two
  phones, the account question); they reach the screens only through `fx` in `store.ts`, which the legacy script
  fills at start (`render`, `toast`, `ask`, `confirm`, and the session's effects a moved screen calls), and run
  nothing on import (`storageStart()`, `syncStart()`). The screens move here from r57 (phase 5): `view.ts` (the
  host that draws every tab into `#view`, and the parts the moved screens share), `act.ts` (the one way to change
  the log), `history.ts`, `settings.ts`, `plan.ts` and `stats.ts` (its charts in `graphs.ts`, r58), `today.ts` with `week.ts`, `map.ts` and
  `calendar.ts` (r59; three.js loads by address in `outside.ts` alone), the session screen (r60): `workout.ts` (the
  screen, its taps and fields), `worksets.ts` (a set and what a tick changes), `workfinish.ts` (Finish, save, the
  recap), `workdrag.ts` and `workstate.ts` (what they change between draws, as `W`), with `update.ts` (the update
  bar), `display.ts` and `env.ts` for what more than one screen reads, and the sheets (r62): `sheets.ts` (the layer every
  sheet is drawn into: a sheet opened is drawn fresh, the open one drawn again is updated in place) with `sheetsmisc.ts`,
  `sheetslift.ts`, `sheetsplan.ts`, `sheetsexercise.ts`, `sheetspicker.ts` and `sheetsapp.ts`; Pick for me, Swap's
  closest matches, Limited equipment and Short on time are functions of the model in `pick.ts`. A change made inside another change is part
  of it (`act`, r60): one Undo step and one save.
- `src/1*.js`, `src/2*.js`: the legacy script, cut into parts at its section headers (start-up, accounts, the
  screens, sheets, actions and events), one function scope. It reads `src/app/` only through the imports in
  `src/09-imports.js`. `src/01` to `src/03` are the page head, styles and markup.
- `index.html`: the whole app, built from `src/` by `npm run join` (`scripts/join.js`) and committed, because the
  build and every test use this one file. Never edit it by hand; read the source in `src/`.
- `tests/`: Playwright suites that drive the real page. `tests/h.js` is the harness (serves the libraries from
  `node_modules`, blocks every other network call, fakes the clock, seeds storage, injects a mock cloud);
  `IRONLOG_BROWSER=webkit` runs a suite in WebKit. `tests/run.js` runs them all.
- `scripts/build.js`: writes the app to `dist/`, and the preview (`--preview`) to `dist-preview/`, with the fonts,
  libraries, manifest, icons, service worker and Content Security Policy. `scripts/icons.py` draws the icons.
- `scripts/cloud-supabase.js` and `supabase.config.json`: accounts and sync for the installed app (the publishable
  key is public; row level security protects the data). The secret key never goes in this repo.
- `supabase/functions/delete-account/index.ts` and `supabase/functions/feedback-to-issue/index.ts`: the server
  functions for Delete my account and problem reports. `.github/workflows/publish.yml` tests and publishes;
  `.github/workflows/keepalive.yml` pings the free project daily.
- `baselines/`: every published build since r11, with `baselines/SHA256SUMS`. `tests/migration.js` saves data with
  each and loads it into the current build. Never delete them. After publishing, copy the build it replaced here
  and add it to `tests/migration.js`.

## Commands

```
npm install
npm run setup          # Chromium for Playwright (once)
npm run setup:webkit   # WebKit for Playwright (once)
npm run join           # builds index.html from src/ (after any edit in src/); npm run join:check compares
npm test               # every suite, then the lifter-facing ones on dist/; must end "All suites passed"
npm run test:webkit    # every suite in WebKit; add -- --shard 1/4 or -- --jobs 1
npm run build          # writes dist/ only
node scripts/depmap.js # the legacy script's size and what it depends on
```

One suite: `node tests/<name>.js`, or `IRONLOG_BROWSER=webkit node tests/<name>.js`. Each prints `ok` and `FAIL`
lines, then `ALL PASS` (the fuzz suite prints `fuzz clean`). Type check: `npx tsc --noEmit -p .`.

## Invariants (never break these; each was a ruling or a bug, and `docs/ARCHIVE.md` says which)

- **Data:** never lose or overwrite what the lifter typed: loads, reps, targets, settings. A saved set never has an
  empty load. What is stored is always RIR, and every set stores the number exactly as typed. A migration only adds;
  it never overwrites a value the lifter set. A new optional field stays absent when unset, so record hashes and
  sync are unchanged. A change to stored shape needs a `normalize()` default, a migration if it changes meaning,
  and cases in `tests/migration.js`.
- **Sync across builds:** settings keys keep one order across builds; records keep unknown fields in the order they
  came (`keepExtra`); a new field is relied on only once every device runs a build that keeps it. `normalize` writes
  nothing that depends on the device: it also runs in the sync comparison, Undo and imports. A first sign-in keeps
  everything the phone made (sessions, weigh-ins, cardio, a workout in progress, routines, custom exercises) beside the
  account's, with no Undo; of two workouts in progress, the other device's ticked sets are saved; demo data never goes
  into an account (r55).
- **Numbers:** no number without a source in `docs/EVIDENCE.md`; a convention is labelled as one there and in a tip.
  Trends are never shown as a 1RM; a muscle with no clear lift reads unclear, never 0%; weight lifted is never a
  percentage against last week; no projections. Deloads and lighter loads are whole steps, never under the bar on a
  barbell lift typed as the total. One rule for every session (V, 2026-10-18): a lift sets its next target only at
  its usual load and reps for its usual sets (in a session on a day of the routine, the sets its plan gave it that day, saved with it, once a session did them: r58); with fewer sets or a
  clearly weaker reading the target repeats and the session still counts for the trend, stalls and PRs; done
  lighter it sets no target or trend, and done in full on a
  lighter or deload day it is a full session (a day's label never overrides what a lift did). A break of more than
  four weeks restarts a lift's readings, and the weeks counted (averages and adherence) start after it. A session
  marked New machine or gym restarts them too, its PRs, bests and dumbbell steps with them, and keeps every session
  shown (`liftReadIn`, r61). A ticked set
  of 0 reps is a missed set: kept and shown, counted toward no volume, PR, estimate or trend, read by the next target
  as a set short of the range (so sets missed never step a load up, r56.2), and asked about first when its load is well
  under the session's working load (r55.1). With Your gym's plates set, a bar lift's loads are ones the bar and those
  plates make (r55.1). A past week is read against what its routine
  planned then (each session records it, `pw`), never the routine as it is now, and a lift's session by the sets its plan gave it then (`ps`, r58). A PR is a PR on any day, and a change of units or gyms is never one.
  A PR is a set stronger than every earlier one, the same PR on every screen; a heavier set that is not one is
  Heaviest yet (r58). A muscle has a weekly target by default only when lifters train it directly for size
  (`TARGETED`); any other is tracked only until the lifter gives it one, which then counts everywhere (`hasTargetIn`, r58).
- **V's rulings on screen:** the Volume radar is drawn from what was logged, never the routine's plan, and always
  draws; no Planned chip on Stats; the plan's usual-range note is a quiet line on Plan, never a flag and never on
  Stats; no other app is named on screen; no wording about shared phones, someone else or another person; no
  Comeback (former bests); no restyle without V's direction; "on target", the 1RM display and mid-workout
  adjustments on by default are V's calls.
- **Copy:** short, plain, specific; the number and the action on screen, the reasons in a tip or How this works; no
  em dashes, hype or exclamation marks; the serial comma in any list of three; estimated minutes only through
  `estMin` ("~N min"); the first-run Set up page stays under 400 characters, in lines of 45 at most. Code comments
  explain why, not what, in full sentences.
- **Phone:** 44 px touch targets, no sideways scroll at 320 px, light and dark both checked. Rows of seven (the
  week bar, the calendar, Consistency) reach 44 px from 375 px phones up; at 320 px seven cannot. No code follows the
  on-screen keyboard (Safari does not shrink the page for it, and code that did fought iOS): a sheet you type in
  opens tall, its fields at the top, so they are never under it (PENDING 322). No browser here has an on-screen
  keyboard, so a change to how sheets meet it is tried on V's phone before a release carries it.
- **One source (V, r49):** a value that names, identifies or configures the app is defined once, in
  `src/app/config.ts`. Every storage key, cache name and backup mark is built from `STORAGE_ID` ("ironlog"), which
  never changes: a phone finds its log only under those keys (`tests/r49.js` holds them). Outside addresses and
  library versions come from config too; any other outside address must be listed in `ARCHITECTURE.md`.
- **Modules:** new code goes in `src/app/` as strict TypeScript: no `any`, every cast and `!` with a comment saying
  why, every export with a comment saying what it is for, every `catch` logging the error or saying why it is
  expected, formatted by Prettier. A raw value (a save, a document, a note) is read through `rec`, `arr` and
  `parseJson` in `records.ts`, never cast in place. `src/app/` imports only `src/app/` and lit-html (pinned exactly
  in package.json, bundled into the page by `scripts/join.js`, never loaded from an address), each module only from
  its own layer or below (`ARCHITECTURE.md`), never in a circle. A moved screen draws with lit-html and writes to the
  log only inside `act` (the check, the Undo step, the change, the caches dropped, the save and the sync, in that
  order). A function of the
  model reads nothing but the model and its arguments: no clock, randomness, store, page or changing module value
  (new engine or analytics code takes `M` first; the legacy script reaches it through an adapter in `live.ts`).
  `tests/hygiene.js` checks these.
- **Code:** edit `src/`, then `npm run join`. Never reuse a class name the app has (`.tv`). Image tags in the
  script are written `\x3cimg`. Any new inline script, outside host or `eval` needs the Content Security Policy in
  `scripts/build.js` changed with it. Keep `window.__ironlog`: it is how the tests reach in.
- **Tests:** never weaken or delete an assertion to make it pass. Suites reach no outside service. A suite left out
  of the WebKit run is in `WEBKIT_SKIP` in `tests/run.js`, with the reason.

## Releasing

- Bump `APP_VERSION` in `src/app/config.ts` for every published build, and `DISPLAY_VERSION` with it (the minor
  number up one per release, the major for a large change); `STATE_VERSION` only when the stored shape changes.
  The build named at the top of this file is the one in config (`tests/hygiene.js` checks).
- Work on a branch and open a pull request. `.github/workflows/publish.yml` runs every suite in Chromium and in
  WebKit and, if they pass, publishes the preview to `gh-pages` under `preview/` (one slot: the latest pull request
  wins). A merge into `main` runs them again and publishes `dist/` to `gh-pages`. Open apps show "Update ready" with
  Update (r60; "New version ready" with Reload before) the next time they come to the foreground.
- `main` is protected: V merges on GitHub's website. Check GitHub before saying whether a pull request is merged.
- A check that fails on GitHub writes each failing line as an annotation, readable without a sign-in:
  `/repos/vqx7/Ironlog/check-runs/<job id>/annotations`. A suite stopped at the 15-minute limit says so, with the
  last check it passed; teardown goes through `settle` (`tests/h.js`), which names a step that stalls.
- By hand, if the workflow cannot run: `npm test`, then `git worktree add ../pages gh-pages`, copy dist/* in,
  commit, push.
- The comparisons of old builds stay pinned to what they proved: `tests/r36.js` (r35 and r52), `tests/r52.js`
  (r51 and r52) and `tests/r53w.js` (r52 and r53).
