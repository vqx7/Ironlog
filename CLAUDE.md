# Ironlog

A personal hypertrophy and strength tracker for one lifter. It is used on a phone at the gym, and it is published as a Claude artifact (a hosted single-page app). Build r13, state schema v5.

## What is in this repo

- `index.html`: the whole app. One file of about 5,300 lines: CSS, markup, then one script in an IIFE. It has no build step and no framework. Chart.js 4.4.1 and SortableJS 1.15.2 load from cdnjs, with jsdelivr as fallback, and the fonts come from Google Fonts.
- `tests/`: Playwright suites that drive the real page in Chromium. `tests/h.js` is the harness. It serves Chart.js, Sortable and the fonts from `node_modules`, blocks every other network call, and can fake the clock (`clock`), seed localStorage (`state`), and inject a mock cloud (`setup`).
- `baselines/r11.html` and `baselines/r12.html`: the two previous published builds. `tests/migration.js` saves data with them and loads it into the current build. Never delete them. When you publish a new build, add the build it replaces here.

## Commands

```
npm install
npm run setup     # installs Chromium for Playwright (once)
npm test          # runs every suite; must end with "All suites passed"
```

Run a single suite with `node tests/<name>.js`. Each suite prints `ok`/`FAIL` lines, then `ALL PASS` (the fuzz suite prints `fuzz clean`).

| Suite | Covers |
|---|---|
| unit-math | 1RM formulas, inverses, rep bands, hard sets, drop credit, load modes, tonnage, load steps, time model |
| unit-analytics | stalls (all frequencies), moving/falling with the t interval, projection, PR bands, calibration shrink/cap/expiry and rounding, recovery tiers across doses, WHtR, lighter week, coach, deload rounding |
| dataflow | draft survives reload, save, backup round trip, CSV, delete/restore, two devices syncing through a mock cloud |
| migration | saves from r11 and r12 load with every session, set, setting, custom exercise, prior and injury intact |
| acceptance | load labels, mix-up warning, hover/hold tips, text volume vs r12, full logged session, kg, RIR off, per-side plates |
| flows | picker, create-from-picker, Pick for me, Discard, Limited equipment |
| charts-layout | week bar, charts anchored at first data, range chips, height field, no horizontal overflow at 320–768 px in light and dark |
| cycle-create | cycle projection, freestyle pick, create into a routine day, editor re-render |
| fuzz | 25 random odd logs: no crash, no NaN/undefined/Infinity on any screen |
| integrity | tests/repro/ scenarios: sync races and clock skew, unreadable saves, Undo, two tabs, edit vs delete, hostile ids, duplicates, size cap, storage errors |

## How the code is organised (search for these names)

- **State:** `freshState()`, `normalize()` and `STATE_VERSION`. `normalize()` runs on every load, import and cloud merge, and it validates every field. Any new field needs a default there. New optional fields stay `undefined` when unset, so existing record hashes don't change and cloud sync doesn't treat old records as edited. A migration is a `version < N` block that only adds data and never overwrites a value the user set.
- **Storage:** localStorage key `ironlog.v1`. **Cloud sync:** `cloudInit`, `cloudPull`, `cloudFlush`, `mergeChunk`. It writes to `window.claude.use('db')`, which only exists inside Claude. Data is split into `core`, `draft` and half-month session chunks (`chunksOf`), with a per-record three-way merge. Outside Claude the app runs on localStorage only.
- **Analytics:** `IDX()` builds everything once per change (`invalidate()` clears it): `byEx`, `exStats`, `weekSets`, `weekHard`, `dayMus`, `dayMeta`, `prs`, `scores`. Read from `IDX()` rather than recomputing, so the headline numbers and the detail sections can't disagree.
- **Math:** `e1` (Brzycki up to 10 reps to failure, Epley at 11–12, none above 12; sets above RIR 4 excluded), `e1inv`, `rtfAt`, `rtfBand`. `calStats` and `rirEff` handle RIR calibration: shrink n/(n+3), cap ±2, 12-week window, compound vs isolation, applied only to sets at RIR ≤ 4. Also `suggest` (double progression), `progStep` and `jumpCap`, `recovery`, `rankDays`, `rankExercises`, `setSecs`/`setupSecs`/`dayMinutes`.
- **Load meaning:** `loadMode` (each / total / side / stack / bw), `loadWords`, `loadNote`, `loadHead`, `lmChips`, `tonnage`. Every set stores the number exactly as typed. Estimates and targets stay in that frame, and tonnage counts what actually moved.
- **UI:** `render()` rebuilds `#view` from strings, with the views `viewToday`, `viewLogger`, `viewProgram`, `viewDash`, `viewHistory`, `viewSettings`. `sec()` is the one foldable section component. Actions are `data-act="name"` handled in the `ACT` object. `renderModal`/`renderModalBody` draw the sheets and keep their scroll and focus across re-renders.
- **Tips:** any element with `data-tip` shows it on mouse hover (350 ms), keyboard focus, or a touch hold (480 ms; the click that follows is swallowed). `tipi(text)` makes a small "i" button that shows its tip on a tap. Long explanations go here, not on screen.
- **Test hooks:** `window.__ironlog` exposes state and most functions, and it is how the tests reach in. Keep it.

## Rules for changes

1. Don't break what works. Run `npm test` before and after. Add or extend a suite for every behaviour you change.
2. Never lose data. Any change to stored shape needs a `normalize()` default, and a migration if it changes meaning, plus a case in `tests/migration.js`.
3. The math follows the evidence review summarised under "Evidence base" below. Don't change a number without a source. Label conventions as conventions, in a tip.
4. Copy is short, plain and specific. No em dashes, no hype, no exclamation marks. The default screen shows the number and the action; the reasoning goes in a `data-tip` or a `?` help toggle.
5. Phone first: 44 px touch targets, no horizontal overflow at 320 px, and light and dark both checked. `tests/charts-layout.js` checks overflow.
6. Code comments explain why, not what, in full sentences. That is the house style of this file.
7. Bump `APP_VERSION` for every published build, and `STATE_VERSION` only when the stored shape changes.

## Publishing

The live copy is a Claude artifact. To publish, paste `index.html` into Claude (claude.ai) and ask it to republish the Ironlog artifact at its existing link. The page declares the capabilities `db`, `downloads`, `sample` and `user`; keep them. After publishing, copy the build it replaced into `baselines/` and add it to `tests/migration.js`.

## Evidence base (behind the r13 corrections)

- **1RM:** Brzycki up to 10 reps to failure, Epley at 11–12 (they agree at 10). Nuzzo 2024 and Halperin 2022 on how estimates spread at higher reps.
- **Hard sets:** RIR ≤ 3 (Robinson 2024, Refalo 2023). Helper muscles count 0.5 (Pelland 2025).
- **Weekly and per-session volume:** major-muscle bands of 10–20 are typical, not a ceiling. The per-session flag sits above 11 sets (Remmert 2025, preprint).
- **Moving and stalls:** "moving" needs ≥ 3% and a slope whose two-sided 80% interval (Student's t, n−2 degrees of freedom; `t90`) is above zero; estimated 1RM varies 2–8% day to day (Sigvaldsen 2023). Muscle trends count only lifts that are moving or falling. A stall is a flat or falling slope over the last 6 sessions, widened to cover ≥ 21 days when 6 do not (at least 4 sessions).
- **Recovery tiers:** 1, 2 or 3 days by set count, +1 day after failure sets or a new lift, +0.5 after heavy hinges, Nordics or walking lunges, −1 if every set stopped at RIR ≥ 3. This is a rule of thumb, used only for ranking.
- **Bodyweight share:** only the push-up figure is measured (64%, Ebben 2011); the rest are segment-mass estimates.
- **Waist-to-height:** 0.5 / 0.6 bands (NICE 2022).
- **Tape measurements:** changes under about 1 cm are treated as noise.
- **Long-length bonus:** only for exercises backed by trials (seated leg curl, overhead triceps, standing calf raise) or by mechanics (labelled as such).
