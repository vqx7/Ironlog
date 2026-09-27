# Everything still open (as of r14, 2026-09-26)

Nothing here is done unless it says partial. Owner items need V; the rest is build work.

## Owner items (V)
1. Delete the `r14-review` and `r15-design` branches on GitHub (they still hold the old first commit with the personal email).
2. GitHub Settings > Emails: tick "Keep my email addresses private" and "Block command line pushes that expose my email". Optionally ask GitHub Support to purge cached views of the old commit.
3. Decide the final app address before anyone installs (keep Testository, or rename the repo now). The installed app and its data are tied to the address.
4. Move data off the Claude artifact: export a backup there, add the app to the home screen from Safari, import inside the home-screen app.
5. After import, set Settings > General > Theme to Dark if wanted: the imported backup brings the old "Match device" setting; dark is only the default for new installs.
6. Decide whether to update the Claude artifact to r14 (it still has the sync data-loss bugs fixed in r14) or retire it after the move.

## Verification never done
7. Real iPhone Safari and home-screen check. All testing so far is Chromium with iPhone emulation. Check: full-screen launch and the notch, offline launch and logging, rest timer across a screen lock, RIR strip above the timer, share sheet to Files for backups, import count matches.
8. One to two weeks of real gym use before new features.

## Durability and accounts
9. Cloud sync for the standalone app (plug into `cloudProvider()` / `window.ironlogCloud`). Supabase or Firebase. Supabase free projects pause after 7 days with no activity.
10. Accounts: email and password sign-up with email confirmation and password reset; emailed sign-in link as an option. Row-level security so each user reads only their own rows.
11. Delete my account (needs a server-side function; admin rights cannot live in the app).
12. Decide on client-side encryption (owner cannot read data; a lost passphrase loses the data) vs plain storage plus a privacy note.
13. Until sync exists, backups are manual weekly exports. The stated goal was durable saving without manual downloads: not met yet.
14. Undo history lives in memory only and is lost on reload (Recently deleted still keeps deleted sessions for its window).
15. Cloud core document: bodyweights and measurements sit in one document; after years of daily weigh-ins it passes 250 KB and stops syncing (other documents keep syncing since r14). Split them by date like sessions.

## Publishing
16. GitHub Action: run all suites on every push to main and publish dist/ to gh-pages only if they pass.
17. In-app "New version ready, tap to reload" prompt (today an update shows only on the second launch).
18. Custom domain, only if wanted, decided before friends install.

## Friends readiness
19. Clean first run without demo data leftovers (the welcome card also stays while only demo data is loaded).
20. Short privacy note in the app.

## Engagement and design asks not finished
21. A real PR moment (celebration on the set and in the recap). Today a PR is only a gold badge.
22. Stats and Settings got the new look but no layout review of their own.
23. Back gesture closes sheets but does not step back through tabs.
24. At 320 px: long section subtitles and Plan exercise names are cut with an ellipsis; the week bar days are 26 px wide (tap area extended in height only); muscle-map areas (e.g. neck) are below 44 px.
25. The logger help text still describes warm-up and drop as W/D toggles only; add that + Warm and + Drop moved to the exercise menu.

## Feature backlog (optional; see PROMPT.md)
26. Tape measurement error from your own repeat measurements (TEM, 2.77 x TEM threshold).
27. Setting: count RIR 4-5 as half a set (off by default).
28. RIR calibration split by rep band once there is enough data.
29. Specialisation: Focus on up to 2 muscles.
30. Pick for me "Strength focus".
31. Assisted pull-up and dip load mode (bodyweight minus assistance).
