# Everything still open (as of r23, 2026-09-28)

This is the tracking list. Items are built only when V says go. Owner items need V; the rest is build work. Nothing is done unless it says so. Numbers are kept stable; finished items move to Done at the bottom.

## Built in r23, awaiting V's approval (pull request from branch r23)
52 (logo out of the header), 65 (import from notes, spreadsheets, Strong, Hevy), 45 (assisted pull-up and dip), 32 and 33. What each does is under Done > r23 below. Nothing is live until V merges the pull request; the merge then tests and publishes by itself (item 22).

Open count after r23: 28 (3 critical, 3 owner, 3 verification, 19 build or decision items).

## Critical, still open
58. Part 2 needs V: SUPABASE.md, Part 4, steps 1 to 5 (the tables, a private `ironlog-feedback` repository, a GitHub token for it, the function and its webhook), then FEEDBACK.md, "What V does" steps 2 and 3 (protect `main`; choose a scheduled Claude task or Claude's GitHub Action to pick up tickets). Until step 1, Send feedback says it is not set up yet and keeps the text.
61. (c) A 6-digit code in the confirmation email, typed into the app, which works even if the app was closed. Needs owner item 6 (the email sender) first.
63. Check on the iPhone itself (r22 is live: the first-run pages on a fresh install, a PR set's toast and pulse, Undo in Settings after closing the app; after r23 merges: the week bar without the logo, an import from Notes or a spreadsheet file, an assisted pull-up session): the Add to Home Screen guide on iOS 26 Safari (Share is behind ⋯ in the compact bar; checked against MacRumors and a Glide bug report, not on a device), the app signing itself in after the confirmation link (Safari to the home-screen app and back), a past workout from the week bar, the light Today card, and a screenshot picked in Send feedback.

## Owner items (V)
1. Delete the `r14-review`, `r15-design`, `r17-accounts`, `r20-design` `r21` and `r22` branches on GitHub (and `r23` once merged) (`r20-design` is fully merged into `main`) (the first two hold the old commit with the personal Gmail address; `main` and `gh-pages` are clean). Parked by V on 2026-09-27; come back to it.
2. GitHub Settings > Emails: tick "Keep my email addresses private" and "Block command line pushes that expose my email". Optionally ask GitHub Support to purge cached views of the old commit. Parked with item 1.
6. Supabase Part 2 (`SUPABASE.md`): a domain and the Resend email sender, needed before friends sign up. Until then confirmation and reset emails reach only the Supabase account's own email address, at most 2 an hour.

## Verification
7. Still unchecked on the real phone: rest timer across a screen lock, the share sheet to Files for backups, the notch in the home-screen app, and the "New version ready" bar. New in r20, tested in Chromium but not yet in iPhone Safari: auto-mark when the keyboard's Done is tapped on a grey reps field, the 3D body's drag and tap, and the Install guide.
8. One to two weeks of real gym use before new features beyond batch 2.
10. Accounts, sync and feedback are tested against a stand-in Supabase server (`tests/accounts.js`), because the build machine cannot reach supabase.co. V confirmed real sign-up and sync on 2026-09-27 (3 rows: core, draft, s-2026-09-2). The feedback function (`supabase/functions/feedback-to-issue`) and the publish workflow have no automated test here: the first real report and the first merge are their check (Supabase function logs, GitHub Actions tab).

## Cloud sync and accounts
66. Every device should run the same build. While a phone still runs r21 or older, a weigh-in deleted or corrected on that phone is not removed on r22 phones (r22 only adds what an older build writes), and the older phone shows no body data. Nothing is lost. Tell friends to tap Reload when "New version ready" shows. r23 adds one more reason: assisted pull-ups and dips store the load as bodyweight minus help (a negative number), and a phone still on r22 reads those sets as bodyweight only (0) and writes them back that way. Update every device before logging an assisted set.
13. An emailed sign-in link without a password was left out: on an iPhone it opens in Safari, whose storage is separate from the home-screen app. A 6-digit emailed code would work instead, if wanted (needs Part 2's email sender).
15. Client-side encryption, optional and later: the owner cannot read data, but a forgotten passphrase loses the data.
21. The standalone app has no Claude features (debrief, Ask Claude, AI swap, Claude reading typed sets). The code is there but only works inside Claude. Decide: artifact-only, or add another AI service (its key would have to live in a Supabase function, never in the app).

## Publishing
23. Custom domain, only if wanted, decided before friends install.

## Asked for on 2026-09-27, for later
48. Custom routine generator (the unmet need: most people will not build or import a routine). From a few answers (goal, days a week, minutes per session, equipment, experience, muscles to bring up) build a routine from the library that meets the weekly targets and stays under the per-session flag, then keep adjusting it from the log. First step already taken in r20: six ready-made routines on the first-run card and in Plan. Demand cannot be measured inside the app, because the privacy line promises no tracking; ask friends who try it instead.
49. Age and sex as optional profile fields, only when a feature needs them (for example strength standards or bodyweight-share estimates). r20 adds the optional name only.
50. Fitness app and health integrations. Web APIs with sign-in (Strava, Fitbit, Garmin, Oura, Whoop, Withings) work from the installed web app, with each service's tokens kept in a Supabase function, never in the app. Apple Health and Android Health Connect have no web API: they need the native wrapper (item 46). CSV export already exists.
51. Payments, if Ironlog is ever charged for (information only, nothing built): Stripe Checkout for a subscription or a one-time lifetime price, the Stripe customer portal for cancelling and card changes, and a webhook into a Supabase function that stores who has paid; the app only reads that flag. Needs terms, a privacy policy, a refund policy and sales tax handling (Stripe Tax). If it ever ships in the App Store, Apple's in-app purchase rules apply to digital features.
67. Import a photo of a handwritten log. Reading handwriting needs an AI service (see 21). Works today without it: on an iPhone, open the photo, press on the text (Live Text), Copy, and paste into Import workouts; the same for a photo of a whiteboard or a printed sheet.
68. Other apps' exports. Strong, Hevy, FitNotes-style columns ("Weight (kgs)") and any sheet with a header row are tested; JEFIT, Fitbod and others are read through the column picker but not tested against a real export. Add one when a friend sends a file.
69. Notes that give only "Bench 3x10" with no load are read as a load of 3 for 10 reps on a weighted lift (the preview shows it before anything is saved); only bodyweight lifts read a bare 3x10 as sets of reps. Decide whether a bare NxM on a weighted lift should mean sets x reps with the load left blank.

## Training (a conversation, not an app fix)
39. Program review: Chest 17, Quads 15 and Upper back 14 sets in single sessions; Arms and Shoulders days around 80 minutes.

## Optional features (see PROMPT.md)
40. Tape measurement error from your own repeat measurements (TEM, 2.77 x TEM threshold).
41. Setting: count RIR 4-5 as half a set (off by default).
42. RIR calibration split by rep band once there is enough data.
43. Specialisation: Focus on up to 2 muscles.
44. Pick for me "Strength focus".
46. Native app wrapper (Capacitor), only if needed: rest timer alerts through a locked screen, Apple Health, a real App Store install. Costs $99 a year for Apple and needs a Mac.

## Done
- r23 (built 2026-09-28, awaiting approval):
  - 52 (V's request 2026-09-28): the Ironlog wordmark is out of the header (kept for screen readers); the week bar has the whole row, so from 375 px each day is at least 44 px wide as well as tall.
  - 65 (V's request, widened to "any other raw data type"): Import workouts (first-run Set up page, Settings > Your data, History) reads a note pasted from Notes or typed by hand ("Bench 60x8, 60x8" or "3x10 @ 60" under a date line), a spreadsheet (.csv, .tsv, .xlsx, or cells pasted from Excel, Numbers or Google Sheets, with a column picker when the headers are unclear), Strong and Hevy exports, and an Ironlog CSV. A preview shows sessions, sets, dates and units first, asks about any exercise it is unsure of (pick one or create it), lists anything it could not read, and skips rest timers, cardio rows, timed sets and sets already in the log. The import has Undo. Restoring a backup is a separate button that says it replaces everything.
  - 45: Assisted Pull-up and Assisted Dip in the library, and an "Assisted (machine help)" switch on any bodyweight exercise. The field takes the help (55 means 55 lb of help), the label reads BW−55, progress takes help off, a deload adds help, and tonnage counts bodyweight minus help.
  - 32: This week owns the week (sessions, hard sets, lifted); At a glance keeps PRs, streak and bodyweight; the PR tile opens All-time bests.
  - 33: already done 2026-09-24 (the chips follow the section order and hide hidden sections); checked again.
- r22 (approved by V and published 2026-09-28):
  - 64 (V's request 2026-09-28): a new install opens on its own pages. Page 1, Save your log: Create account, I have an account, Not now. Page 2, Set up: optional name, units, then Pick a ready-made routine, Log a workout now, Build my own routine, Import a backup, and Look around with sample data. No tabs or header until a way to start is picked; signing in with an existing log goes straight to Today; a phone whose log was removed at sign-out starts here again. Name is optional (V's choice). A new user's routine comes with exercises, sets, reps and rest but no loads: the first session's loads are typed once (the rest of the rows fill from set 1), and from the second session on, loads and targets come from the log.
  - 27: Stats > Lifts > All-time bests: every lift's best estimate, heaviest set and rep records (most reps at each load, where no heavier set did as many) with the date each was first reached, newest record first; six show at once, Show all lists the rest.
  - 28: the PR moment: a gold toast saying what the set beat, a gold pulse on the row (none with reduced motion), a buzz on Android; the recap opens with a gold block listing each PR against the old record.
  - 19: bodyweights and measurements sync in one document per year instead of inside core. Checked with a real r21 phone and r22 phones on one cloud: an older core is picked up and moved, deletes stick (also when phones update one after another), the two builds do not rewrite each other, and a phone holding only measurements keeps them when signing in (that last one was a bug before r22 too). See 66 for the limit while an r21 phone is still in use.
  - 20: Undo keeps a week of deletes, resets and imports after the app is closed (IndexedDB); a phone whose log is removed at sign-out forgets it.
  - 11: tests that Remove day, Delete routine, Delete exercise, Delete session, the exercise sheet and drags in Plan still apply and save after a cloud refresh replaces the data mid-way.
- r21 (approved by V and published 2026-09-27):
  - 53: Log a past workout, date first, from an empty past day in the week bar or History. The sheet puts the routine day that was due on that date first (the cycle as it stood then, or the weekday), then the other days and Freestyle, and says what is already logged that day. Quick entry: no rest timer, clock or check-in; a set counts as done once its reps are typed. Last time, targets, notes and live PRs are read as of that date; the session saves under it, so next up, targets and PRs after it read correctly. Changing the date in any session re-reads its targets. The recap says where it was saved.
  - 54: every day in the week bar is a button; an empty past day opens 53 and carries a small + once there is a log; the session in progress is marked on its own date.
  - 55: the account offer is first on the welcome card with a full Create account button; on Today, signed out, the account line comes first and Install second; the account panel is at the top of Settings > Your data.
  - 56: on an iPhone the button says Add to Home Screen; the sheet shows a picture of where to tap and two steps, and knows Safari 26 (⋯ beside the address, then Share), older Safari and Chrome; the reasons are in a tip. One line stays only if a log is kept in that browser.
  - 57: the Today card follows the theme (light in light); the rest-timer bar stays dark in both.
  - 59: an empty reps field's grey number falls back to the set above, then the bottom of the planned range, so after a swap to a lift with no history the checkmark, auto-mark and the keyboard's Done work.
  - 60: Discard at the top and beside Finish; asks only when something was entered (a ticked set, typed reps, cardio minutes, a note of your own).
  - 61 (a, b): the app waits on Check your email and signs itself in when it comes back to the front, or on "I have confirmed" (password in memory only, forgotten when the sheet closes or after 30 minutes); the confirming browser asks where Ironlog is used, and skips the question when it shares storage with the waiting app.
  - 62: section subtitles are smaller and state a number or state; the welcome card's explanations, drag hints, the muscle map note, the empty Stats note and the first-session note on every exercise moved into tips or one line.
  - 58 Part 1: Send feedback (Settings, an exercise's ⋯ menu) with kind, text, screenshot and reply address, the context attached, the owner's Inbox, and the privacy line. Part 2's code: the feedback-to-issue function, FEEDBACK.md with the fixer's rules and prompt.
  - 22: `.github/workflows/publish.yml` tests every pull request and every push to `main`, and publishes to `gh-pages` only after a passing push to `main`.
- Item 9 dropped (2026-09-27): it concerned the Claude features, which only run in the Claude artifact, now retired.
- Owner items 3 and 6 (2026-09-27): V retired the Claude artifact and uses only the installed app. Supabase Part 3 done by V: the delete-account function is deployed with Verify JWT off (a plain visit returns 405 "Use POST") and ping() returns "ok", checked from the build machine.
- r20 (approved by V and published 2026-09-27): design pass (25, 26), 320 px fixes (30: nothing is cut off with an ellipsis any more; see 52 for the week bar), stylized 3D body next to the flat map (35), Install button with the iPhone guide (47).
- r20 (V's requests of 2026-09-27): accent picker with Blue as the default (Volt and Ember too); optional name with a greeting on Today; six ready-made routines; RIR picker opens only on tap, with a setting to open it after each set, and "Off" still turns RIR off entirely; a blank RIR is read as your usual RIR on that lift (3 or more rated sets in 12 weeks), else hard and 0 for estimates; the coach no longer asks for RIR on every set; − Set on a row with reps typed and removing a filled cardio entry give an Undo; auto-mark now also accepts the grey reps when you leave the field (keyboard Done, Next or a tap elsewhere), since the iPhone number pad has no Next key; a load typed with no history fills the empty rows below; a screen refresh while typing no longer ticks a set; demo dumbbell loads corrected to per-dumbbell numbers.
- r19 (34): Comeback deleted outright, and saved former bests removed from the phone, backups and the cloud copy (V's choice).
- r19 (36): RIR 0 checked against the evidence and left as is: a set called at 0 is still a call unless a rep failed, and people under-call reps left by about 1 on average, only slightly less near failure (Halperin 2022 meta-analysis: 0.95 reps; closer-to-failure effect small and uncertain). The RIR setting's tip now says so.
- r19 (37, 38, 31): Recently deleted says it keeps the 20 most recent items; the Lifts help explains that changing RIR can add or remove an e1RM PR; the logger help points to the ⋯ menu for new warm-up and drop rows.
- r19 (29): Back steps back through tabs as well as closing sheets.
- r19 (24): first run with demo data shows a short demo note with "Clear demo and set up" instead of the full welcome on top of the demo.
- r19 (14, 16): Delete my account (server function in `supabase/functions/delete-account`, deletes the account and its synced log, keeps the phone's copy) and a daily keep-alive GitHub Action. Both need V's Part 3 steps to go live.
- r18: the account is offered up front (first-run welcome card, and a slim line on Today while signed out, with Not now); fixed "Claude account" wording in the installed app and a doubled error line.
- r17 (12, 17, 18): accounts and cloud sync on Supabase, privacy line naming who can see the data, durable saving once signed in.
- r16: "New version ready" bar; privacy line; fixed updates within 10 minutes of a publish keeping the old page.
- r15: Comeback switched off.
- Repo renamed to Ironlog; the app lives at https://vqx7.github.io/Ironlog/.
- Owner items 4 and 5: V exported from the artifact, imported into the installed app and signed in (2026-09-27).
