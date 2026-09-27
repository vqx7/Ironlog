# Everything still open (as of r20, 2026-09-27)

This is the tracking list. Items are built only when V says go. Owner items need V; the rest is build work. Nothing is done unless it says so. Numbers are kept stable; finished items move to Done at the bottom.

## Critical, next to build
53. Log a missed workout in two taps, date first (raised by V 2026-09-27: phone left at home, sets on paper or from memory). Today it takes too many steps and is buried: start a session, change the date box inside it, log, Finish (it does save under that date and "next up" moves on correctly). Build: tap any empty past day in the week bar, or "Log a past workout" in History, to open that date first, then pick the routine day or Freestyle; a quick-entry mode for past dates with no rest timer, every set typed in one pass; the session placed in date order, so "next up", last time's numbers and PRs read correctly even when entered after later sessions.
54. Week bar: every day should do something when tapped. Now: a logged day opens it in History, today and future days open Today on that planned day (a preview), but an empty past day does nothing. With 53, an empty past day opens "log a workout for this date"; each day's disc should also look tappable.
55. Account sign-up is not prominent enough. On the first-run card it sits second, after Units, with Sign in and Create account styled as plain text. In a browser, the Install line replaces the account line on Today, so a signed-out person in a browser never sees sign-up on Today. Fix: the account offer first on the welcome card with a real button; on Today while signed out, the account line shows first and Install second (or one combined line); the account panel at the top of Settings > Your data.
56. Install on iPhone: no iPhone browser lets a web page install itself (Apple allows only Share > Add to Home Screen, for every web app), so the button can only show steps, and the current sheet is text heavy. Fix: on iPhone, label it "Add to Home Screen", show a picture of where the Share button is and two short steps, and move the explanations into a tip. Android Chrome keeps its real one-tap install.
57. Light theme: Today's top card stays dark. It was a deliberate r20 choice (a dark feature card in both themes) but reads as a bug. Make it follow the theme.

## Owner items (V)
1. Delete the `r14-review`, `r15-design`, `r17-accounts` and `r20-design` branches on GitHub (`r20-design` is fully merged into `main`) (the first two hold the old commit with the personal Gmail address; `main` and `gh-pages` are clean). Parked by V on 2026-09-27; come back to it.
2. GitHub Settings > Emails: tick "Keep my email addresses private" and "Block command line pushes that expose my email". Optionally ask GitHub Support to purge cached views of the old commit. Parked with item 1.
6. Supabase Part 2 (`SUPABASE.md`): a domain and the Resend email sender, needed before friends sign up. Until then confirmation and reset emails reach only the Supabase account's own email address, at most 2 an hour.

## Verification
7. Still unchecked on the real phone: rest timer across a screen lock, the share sheet to Files for backups, the notch in the home-screen app, and the "New version ready" bar. New in r20, tested in Chromium but not yet in iPhone Safari: auto-mark when the keyboard's Done is tapped on a grey reps field, the 3D body's drag and tap, and the Install guide.
8. One to two weeks of real gym use before new features beyond batch 2.
10. Accounts and sync are tested against a stand-in Supabase server (`tests/accounts.js`), because the build machine cannot reach supabase.co. V confirmed real sign-up and sync on 2026-09-27 (3 rows: core, draft, s-2026-09-2).
11. Some fixes for sheets that held stale data after a cloud refresh (2026-09-23) still have no test.

## Cloud sync and accounts
13. An emailed sign-in link without a password was left out: on an iPhone it opens in Safari, whose storage is separate from the home-screen app. A 6-digit emailed code would work instead, if wanted (needs Part 2's email sender).
15. Client-side encryption, optional and later: the owner cannot read data, but a forgotten passphrase loses the data.
19. Cloud core document: bodyweights and measurements sit in one document; after years of daily weigh-ins it passes 250 KB and stops syncing. Split them by date like sessions.
20. Undo history lives in memory only and is lost on reload (Recently deleted still keeps deleted items for 30 days).
21. The standalone app has no Claude features (debrief, Ask Claude, AI swap, Claude reading typed sets). The code is there but only works inside Claude. Decide: artifact-only, or add another AI service (its key would have to live in a Supabase function, never in the app).

## Publishing
22. GitHub Action: run all suites on every push to `main` and publish `dist/` to `gh-pages` only if they pass.
23. Custom domain, only if wanted, decided before friends install.

## Asked for on 2026-09-27, for later
48. Custom routine generator (the unmet need: most people will not build or import a routine). From a few answers (goal, days a week, minutes per session, equipment, experience, muscles to bring up) build a routine from the library that meets the weekly targets and stays under the per-session flag, then keep adjusting it from the log. First step already taken in r20: six ready-made routines on the first-run card and in Plan. Demand cannot be measured inside the app, because the privacy line promises no tracking; ask friends who try it instead.
49. Age and sex as optional profile fields, only when a feature needs them (for example strength standards or bodyweight-share estimates). r20 adds the optional name only.
50. Fitness app and health integrations. Web APIs with sign-in (Strava, Fitbit, Garmin, Oura, Whoop, Withings) work from the installed web app, with each service's tokens kept in a Supabase function, never in the app. Apple Health and Android Health Connect have no web API: they need the native wrapper (item 46). CSV export already exists.
51. Payments, if Ironlog is ever charged for (information only, nothing built): Stripe Checkout for a subscription or a one-time lifetime price, the Stripe customer portal for cancelling and card changes, and a webhook into a Supabase function that stores who has paid; the app only reads that flag. Needs terms, a privacy policy, a refund policy and sales tax handling (Stripe Tax). If it ever ships in the App Store, Apple's in-app purchase rules apply to digital features.
52. Week bar: at 320 to 430 px the day discs are 44 px tall (from 375 px) but 30 to 37 px wide; 44 px wide needs the logo moved off that row. Left as a design decision for V.

## Design and engagement
27. PR records board: every lift's all-time bests in one place (best e1RM, heaviest set, most reps at a load, with dates). Today PRs show only as a 30-day count, a feed of the latest 15, and one lift at a time.
28. A real PR moment: a celebration on the set and in the recap. Today a PR is only a gold badge.
32. At a glance vs This week on Today overlap in what they show; decide which card owns what (raised 2026-09-24).
33. Order of the section chips at the top of Stats (raised 2026-09-24).

## Training (a conversation, not an app fix)
39. Program review: Chest 17, Quads 15 and Upper back 14 sets in single sessions; Arms and Shoulders days around 80 minutes.

## Optional features (see PROMPT.md)
40. Tape measurement error from your own repeat measurements (TEM, 2.77 x TEM threshold).
41. Setting: count RIR 4-5 as half a set (off by default).
42. RIR calibration split by rep band once there is enough data.
43. Specialisation: Focus on up to 2 muscles.
44. Pick for me "Strength focus".
45. Assisted pull-up and dip load mode (bodyweight minus assistance).
46. Native app wrapper (Capacitor), only if needed: rest timer alerts through a locked screen, Apple Health, a real App Store install. Costs $99 a year for Apple and needs a Mac.

## Done
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
