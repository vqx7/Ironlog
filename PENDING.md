# Everything still open (as of r19, 2026-09-27)

This is the tracking list. Items are built only when V says go. Owner items need V; the rest is build work. Nothing is done unless it says so. Numbers are kept stable; finished items move to Done at the bottom.

## In progress (batch 2, approved by V 2026-09-27; ships only after V approves screenshots)
25. Visual design pass. The look reads as generic AI styling: uniform rounded cards and stacked sections under the new colours. Direction from V: draw on Nike Training Club, Apple Fitness, Robinhood and other clean everyday apps of 2026 without copying any, and without moving things or breaking what works. Before and after screenshots of every tab, light and dark, for approval.
26. Stats and Settings layout review (part of 25).
30. At 320 px: long section subtitles and Plan exercise names are cut with an ellipsis; week bar days are 26 px wide; some muscle-map areas (neck) are below 44 px. Fixed as part of 25, since the header and section headers are being redone.
35. 3D body model, stylized (V's choice): smooth sculpted body, each muscle group its own region shaded by this week's sets, drag to rotate, tap a muscle for its numbers. Sits next to the flat map, which stays.
47. Install button: when Ironlog is opened in a browser (not installed). Android Chrome: a real one-tap install. iPhone (Safari or Chrome): Apple allows no install button, so it opens a short picture guide to Share > Add to Home Screen.

## Owner items (V)
1. Delete the `r14-review`, `r15-design` and `r17-accounts` branches on GitHub (the first two hold the old commit with the personal Gmail address; `main` and `gh-pages` are clean). Parked by V on 2026-09-27; come back to it.
2. GitHub Settings > Emails: tick "Keep my email addresses private" and "Block command line pushes that expose my email". Optionally ask GitHub Support to purge cached views of the old commit. Parked with item 1.
3. Retire the Claude artifact: V moved to the installed app on 2026-09-27 (log imported, signed in, syncing). Stop logging there so the two never split.
6. Supabase Part 3 (`SUPABASE.md`): deploy the delete-account function (with Verify JWT off) and run the ping() SQL for the keep-alive. Part 2 (a domain plus a free email sender) is needed before friends sign up: until then confirmation and reset emails reach only the Supabase account's own email address, at most 2 an hour.

## Verification
7. Still unchecked on the real phone: rest timer across a screen lock, the share sheet to Files for backups, the notch in the home-screen app, the "New version ready" bar, and Delete my account once the function is deployed.
8. One to two weeks of real gym use before new features beyond batch 2.
9. Never tested on V's phone: the Claude features and long drag gestures (only stand-ins so far).
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

## Design and engagement (after batch 2)
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
