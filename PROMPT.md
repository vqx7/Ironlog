# Prompt for Claude Code

Paste everything below the line into Claude Code, opened in this folder.

---

You are taking over Ironlog, my personal lifting tracker. Read `CLAUDE.md` first. It has the code map, the rules, and the evidence base behind the math. The whole app is `index.html`, and `tests/` holds Playwright suites that must stay green.

## Step 0: set up and prove the baseline

1. Run `npm install`, then `npm run setup`, then `npm test`. All 9 suites must pass before you change anything. If something fails on this machine, fix the harness (paths, Playwright version), not the app, and tell me what you changed.
2. Run `git init`, commit everything as "r13 baseline", and work on a branch per task below.

## Rules for every task

- Follow `CLAUDE.md` exactly: no data loss, a `normalize()` default for any new field, migrations only add data, no number changed without a cited source, short copy with no em dashes, phone first, comments explain why.
- Every behaviour change ships with a test in the right suite. Run `npm test` before each commit. Never weaken or delete an existing assertion to make it pass. If one looks wrong, stop and ask me.
- Keep `window.__ironlog`, the artifact capabilities (`db`, `downloads`, `sample`, `user`), and the one-file build working.
- Bump `APP_VERSION` once per finished task (r14, r15, ...). Leave `STATE_VERSION` alone unless the stored shape changes, and if it does, add a migration case to `tests/migration.js`.
- After each task, give me a short summary: what changed, the tests you added, and anything you weren't sure about.

## Tasks, in order

### 1. Real-phone checks (do first, small)
Add a `tests/mobile-webkit.js` suite that runs the key flows in Playwright WebKit with iPhone 13 emulation: hold-to-tip (480 ms, and the follow-up tap is swallowed), numeric keyboard input types on load, reps and RIR, the rest timer running while the page is backgrounded and then foregrounded, the wake lock failing gracefully, and the load-label chips (each / total / a side / stack / bodyweight) readable at 320 px. Fix anything it finds. Then give me a 10-item checklist to run by hand on my iPhone in Safari.

### 2. Tape measurement error from my own data
Replace the fixed "under about 1 cm is noise" rule. When a site has at least 3 pairs of repeat measurements taken on the same day, compute my technical error of measurement, TEM = sqrt(sum(d^2) / 2n), and use about 2.77 x TEM (the 95% smallest real difference) as the noise threshold for that site. Until there is enough data, fall back to 1 cm. Add an optional "Measure twice" toggle in the body entry form. Show the threshold only in a tip. Put the unit tests in unit-analytics.

### 3. Optional half credit at RIR 4-5 (setting, off by default)
Add a setting under Training: "Count RIR 4-5 as half a set". Off keeps today's behaviour exactly. On gives sets at RIR 4-5 0.5 hard-set credit in `weekHard` and the volume bands. It never feeds e1RM. Explain it in a tip (conservative default; some evidence that sets further from failure still add stimulus).

### 4. RIR calibration split by rep band
Once a lift group (compound or isolation) has at least 8 calibration pairs in both the low-rep (1-8) and high-rep (9-12+) bands within the 12-week window, calibrate each band on its own. Otherwise keep today's pooled calibration. Keep the same shrink and cap. Tests must show that the pooled result is unchanged below the threshold.

### 5. Specialisation mode
Allow per muscle a "Focus" flag (at most 2 muscles) that raises that muscle's weekly target band by about 30% and lowers the non-focus muscles to maintenance (around 6 hard sets). Pick for me and the week bar must respect it. It is off by default, and removing it restores the old bands exactly.

### 6. Pick for me: frequency preference
Add a Pick for me preference, "Strength focus": it favours lifts with a stall or a PR band that is close to moving, and lifts not trained in 5 or more days, while still honouring recovery. Default behaviour must not change. Add flows tests for both modes.

### 7. Assisted exercises
Add a sixth load mode, "assist", for assisted pull-ups and dips. Net load = bodyweight x share - assistance. It shows as "Assist" on the chip. Tonnage and e1RM use the net load and need bodyweight to be set (if it isn't, show a one-line prompt). Library: assisted pull-up and assisted dip. Add a migration test to show that old data is unaffected.

### 8. (Optional, ask me before starting) A standalone version for friends
Plan this first and show me the plan before writing code. The goal is a free, installable PWA hosted on GitHub Pages that friends can use with their own data.
- Put storage behind one adapter with the same interface the cloud sync uses now (`get/set/list/delete` by doc id, as used in `cloudPull`/`cloudFlush`). There are two backends: the Claude artifact `db` (when `window.claude` exists) and localStorage plus a manual backup file (default).
- As an optional third backend, use a free-tier Supabase (or Firebase) with email magic-link sign-in, so each user's data is private to them. Keep keys out of the repo.
- Add a service worker for offline use and a manifest with icons. Bundle Chart.js and Sortable locally for the PWA build.
- Keep one source file. Add a tiny build script that writes `dist/index.html` for Pages. The artifact build must keep working unchanged, and the tests must run against both.

## When you finish a task
Give me: the new build number, a 3-line summary, and the exact command to run the tests. Remind me that to update the live app, I paste `index.html` into Claude and ask it to republish Ironlog at its existing link, then copy the old build into `baselines/`.
