# Everything still open (as of r16, 2026-09-27)

This is the tracking list. Items are built only when V says go; nothing here is scheduled. Owner items need V; the rest is build work. Nothing is done unless it says so.

## Owner items (V)
1. Delete the `r14-review` and `r15-design` branches on GitHub. They still hold the old first commit with the personal Gmail address (`main` and `gh-pages` are clean). Parked by V on 2026-09-27; come back to it.
2. GitHub Settings > Emails: tick "Keep my email addresses private" and "Block command line pushes that expose my email". Optionally ask GitHub Support to purge cached views of the old commit (it stays reachable by its id for a while even after the branches are gone). Parked with item 1.
3. The Claude artifact is still r13 and still has the sync data-loss bugs fixed in r14. V still logs real workouts there. Decide: update it to the current build now, or keep it until cloud sync lands and then retire it.
4. Move data off the artifact once cloud sync exists: export a backup there, install the app from Safari, sign in, import.
5. After importing, set Settings > General > Theme to Dark if wanted: an imported backup brings the old "Match device" setting.
6. Supabase: create the project and the email settings (steps in the setup guide from the 2026-09-27 chat; to be written into `SUPABASE.md` when sync is built).

## Verification
7. V has used r14 on iPhone Safari and Chrome. Still unchecked on the real phone: rest timer across a screen lock, the share sheet to Files for backups, import count matches, the notch in the home-screen app, and the new "New version ready" bar.
8. One to two weeks of real gym use before new features.
9. Never tested on V's phone: the Claude features and long drag gestures (only stand-ins so far).
10. Cloud sync has only ever been tested against a simulated cloud. The Supabase build needs a test against a real project too.
11. Some fixes for sheets that held stale data after a cloud refresh (2026-09-23) still have no test.

## Cloud sync and accounts
12. Cloud sync for the standalone app through `cloudProvider()` / `window.ironlogCloud`, on Supabase: one row per document path, row-level security so each user reads and writes only their own rows.
13. Accounts: email and password sign-up with email confirmation and a forgot-password reset. Emailed sign-in link offered alongside, not instead.
14. Delete my account (needs a server-side function; admin rights cannot live in the app).
15. Client-side encryption, optional and later: the owner cannot read data, but a forgotten passphrase loses the data. Decide once sync works.
16. Supabase free projects pause after 7 days with no activity. Add a keep-alive (for example a scheduled GitHub Action that makes one small request a day).
17. Update the privacy line (`privacyLine()`) and `SUPABASE.md` when sync lands: say what is stored on the server and who can see it.
18. Until sync exists, backups are manual exports. The stated goal, durable saving without manual downloads, is not met yet.
19. Cloud core document: bodyweights and measurements sit in one document; after years of daily weigh-ins it passes 250 KB and stops syncing. Split them by date like sessions.
20. Undo history lives in memory only and is lost on reload (Recently deleted still keeps deleted items for 30 days).
21. The standalone app has no Claude features (debrief, Ask Claude, AI swap, Claude reading typed sets). The code is there but only works inside Claude. Decide: artifact-only, or add another AI service.

## Publishing
22. GitHub Action: run all suites on every push to `main` and publish `dist/` to `gh-pages` only if they pass.
23. Custom domain, only if wanted, decided before friends install.

## Friends readiness
24. Clean first run without demo data leftovers (the welcome card also stays while only demo data is loaded).

## Design and engagement
25. Visual design pass. The look still reads as generic AI styling: same uniform rounded cards and stacked sections under the new colours. Needs type scale, spacing rhythm, card treatment, iconography, less uniform boxes, shown as before and after screenshots for approval before anything ships. Not started.
26. Stats and Settings got the new colours but no layout review of their own (part of 25).
27. PR records board. Today PRs show as a 30-day count on Today, a "Recent PRs" feed of the latest 15 PR events in Stats > Lifts, and a best e1RM for one lift at a time once you pick it. There is no single place listing every lift's all-time bests (best e1RM, heaviest set, most reps at a load, with dates).
28. A real PR moment: a celebration on the set and in the recap. Today a PR is only a gold badge.
29. Back gesture closes sheets but does not step back through tabs.
30. At 320 px: long section subtitles and Plan exercise names are cut with an ellipsis; week bar days are 26 px wide (tap area extended in height only); some muscle-map areas (neck) are below 44 px.
31. The logger help text still describes warm-up and drop as W/D toggles only; add that + Warm and + Drop moved to the exercise menu.
32. At a glance vs This week on Today overlap in what they show; decide which card owns what (raised 2026-09-24).
33. Order of the section chips at the top of Stats (raised 2026-09-24).
34. Comeback: switched off in r15 with a flag, but V wanted it gone. Delete the code outright; ask V before deleting any former bests already saved.
35. A 3D rotatable body model was proposed in an early chat and never built; the app has the flat front and back muscle map.

## Accuracy and wording
36. A set logged at RIR 0 (not a calibration set) is still shifted by the RIR calibration correction. Flagged as a bug on 2026-09-25 and never fixed. Decide with the evidence whether a called failure should be exempt, then fix and test.
37. Recently deleted says items are kept 30 days but never says it holds at most 20; the oldest drop off sooner.
38. Changing a set's RIR can change which sessions count as PRs, because RIR feeds the 1RM estimate. Known side effect, not explained anywhere in the app.

## Training (a conversation, not an app fix)
39. Program review: Chest 17, Quads 15 and Upper back 14 sets in single sessions; Arms and Shoulders days around 80 minutes.

## Optional features (see PROMPT.md)
40. Tape measurement error from your own repeat measurements (TEM, 2.77 x TEM threshold).
41. Setting: count RIR 4-5 as half a set (off by default).
42. RIR calibration split by rep band once there is enough data.
43. Specialisation: Focus on up to 2 muscles.
44. Pick for me "Strength focus".
45. Assisted pull-up and dip load mode (bodyweight minus assistance).
46. Native app wrapper (Capacitor), only if needed: rest timer alerts through a locked screen and Apple Health. Costs $99 a year for Apple and needs a Mac.

## Done recently
- r15: Comeback switched off everywhere (see 34 for full removal).
- r16: "New version ready" bar with Reload and Later in the installed app; it checks for updates whenever the app is reopened, and reloading keeps a session in progress.
- r16: privacy line in Settings > Your data (phone-only wording outside Claude, Claude-account wording inside it).
- r16: fixed a bug where an update installed within 10 minutes of a publish could keep the previous version's page (the browser's cache was used when saving the new files).
- Repo renamed to Ironlog; the app lives at https://vqx7.github.io/Ironlog/.
