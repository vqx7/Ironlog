# Open work for Ironlog

Paste everything below the line into Claude Code opened on this repo.

---

You are working on Ironlog. Read `CLAUDE.md` first: it has the code map, the rules and the evidence base. `index.html` is the only source. It ships as a Claude artifact and as the standalone app in `dist/` (GitHub Pages, `gh-pages` branch).

Rules: run `npm test` before and after every change, and all suites must pass on both builds. Add tests for every behaviour you change. Never weaken or delete an assertion to make it pass; ask instead. Never lose data: new stored fields get a `normalize()` default, and changes of meaning get a migration and a `tests/migration.js` case. Copy is short and plain, with no em dashes. Bump `APP_VERSION` once per published build. Work on a branch, and summarise each task in 3 lines.

Done in r14: the full review (28 data, math and usability fixes, each with a test), the new design, the focused logger, and the standalone offline app.

Open, in order:
1. **Real iPhone check.** Walk me through a 10-minute checklist on Safari and the home-screen app: install, offline, rest timer and screen lock, the share sheet for backups, the RIR strip, and safe areas at the notch. Fix anything I report, with a test.
2. **Cloud sync for the standalone app,** so friends can each keep private data. Use a free hosted database with email magic-link sign-in and row-level security, one row per document path. Implement `window.ironlogCloud` (see `cloudProvider()` in `index.html`) returning `{db, userId}` with `doc(path).get/set`, an optional `acquire`, and `collection(path).get`. Keep keys out of the repo. Add a mock-backed test in the style of `tests/dataflow.js`. Show me the plan first.
3. **Tape measurement error from my own data.** With 3 or more same-day repeat pairs at a site, compute TEM = sqrt(sum d^2 / 2n) and use 2.77 x TEM as that site's noise threshold. Use 1 cm until then. Add an optional "Measure twice" toggle.
4. **Setting "Count RIR 4-5 as half a set",** off by default. When on, it affects only weekly hard sets and bands, never e1RM.
5. **RIR calibration split by rep band** (1-8 and 9+) once each band has 8 or more pairs in the 12-week window. Below that threshold, pooled calibration stays exactly as it is.
6. **Specialisation:** a Focus flag on at most 2 muscles, which raises their bands about 30% and puts the rest at maintenance. Removing it restores the old bands.
7. **Pick for me "Strength focus":** favour stalled or near-PR lifts not trained for 5 or more days, within recovery. The default ranking does not change.
8. **An "assist" load mode** for assisted pull-ups and dips: net load = bodyweight x share - assistance. It needs a bodyweight entry.
