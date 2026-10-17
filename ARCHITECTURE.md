# Architecture

Where Ironlog's code is going, how it gets there, and the rules that hold on the way. Written in r49 (V, 2026-10-16: real modules, one source for every value, no hard-coding, built like a professional codebase). PENDING item 303 tracks it.

## Why

Ironlog started as a Claude artifact, which has to be one HTML file. When the artifact was retired on 2026-09-27 the code stayed in that shape: one script, every function and value in one shared scope, screens built from HTML strings. r36 cut it into 24 files, but they are pieces of one script, not modules. In that shape any part can read or change any other part, a value can be typed in many places, and nothing but the tests stops either. Typed modules with clear boundaries stop both before the app runs.

## Where it ends

```
src/app/            TypeScript modules, the whole app when this is done
  config.ts         names, versions, addresses: every value defined once (r49)
  types.ts          record shapes: an exercise, a plan item, a set, a session's blocks (r50, r51)
  util.ts           text, ids, dates, numbers, the sync hash, seeded randoms (r50)
  units.ts          units and plates (r50)
  library.ts        muscles, joints, equipment, the exercise library, search (r50)
  routines.ts       the default plan, the ready-made routines, routine helpers (r50)
  formulas.ts       the 1RM estimate, working load, set counting, time (r50)
  store.ts          the shared state: state (replaced by setState), ui, cloud, acct (r51)
  records.ts        the schema version, limits, id checks, record cleaners (r51)
  chunks.ts         the sync documents; merge.ts, the three-way merge (r51)
  session.ts        a session in progress: grey loads, live targets, the Last column (r51)
  profile.ts        Your training; gym.ts, Your gym (r51)
  loads.ts, prs.ts, trend.ts, volume.ts, goals.ts, charts.ts   words and windows the screens share (r51)
  format.ts, layout.ts, icons.ts, feedback.ts, importing.ts    dates and durations, sections, icons, reports, import parsers (r51)
  ...               one module per area, in the order of the phases below
src/01-03, 99       the page's markup and styles
```

- **TypeScript**, strict, checked on every test run (`tests/hygiene.js`).
- **esbuild** bundles it into the one inline script the page needs. Every suite opens the page as a file, where module scripts are refused, and the installed app's Content Security Policy fingerprints each inline script, so the output stays one inline script. A larger toolchain such as Vite (a dev server, with Rollup or Rolldown for production) would add nothing this app uses.
- **Modules with one-way dependencies**: config at the bottom, then data, engine and analytics (pure functions of their inputs), then storage and sync, then the screens. A module never reaches into another's internals. Every file under `src/app/`, at any depth, is a `.ts` module named by its path, in a move or written new, formatted by Prettier, with a comment on every export. Since r51 `tests/hygiene.js` holds each module to its layer in the list below, the one place the layers are written: an import goes only to the same layer or below, a new module is added to the list, and no import goes round in a circle (the bundle turns a module's `const` into `var`, so in a circle a value read before its module has run is `undefined`, not an error).

Layer 0, config and record shapes: config, types
Layer 1, data: util, units, library, routines, formulas, records, gym, profile
Layer 2, engine and analytics: session, loads, prs, trend, volume, goals, importing
Layer 3, storage and sync: chunks, merge, store
Layer 4, screens: format, layout, icons, charts, feedback

- **Screens as components**, one per tab, reading copy and labels from one place.

## How it gets there: the legacy code shrinks

The current code is the **legacy script**: `src/10-*.js` to `src/29-*.js`, joined in name order, still wrapped in its original `(function(){ ... })()` so every `const` and `let` behaves exactly as written. `scripts/join.js` puts `src/09-imports.js` before it: the real `import` lines through which the legacy script reads what has moved to `src/app/`. Each phase moves code out of the legacy parts into modules and deletes the old copy in the same change, so nothing exists twice.

`scripts/depmap.js` parses the legacy script and lists every top-level declaration, what it uses, which values are shared mutable state, and which declarations are pure (no browser, no shared state, all the way down) and can move as they are.

**The ratchet:** the legacy script may never grow. `tests/hygiene.js` fails when it has more top-level declarations or more lines than the numbers below, and also when it has fewer, until the numbers are lowered to match, so each phase locks in what it moved. A change that adds code adds it in `src/app/`.

Legacy top-level declarations: 638
Legacy lines: 9134

| Measured (scripts/depmap.js) | r49 | r50 | r51 |
|---|---|---|---|
| Legacy top-level declarations | 928 | 819 | 638 |
| Pure, movable as they are | 324 | 215 (214 by r51's rule, which also counts browser-only APIs such as DOMParser) | 39 (each waits for its phase, below) |
| Shared mutable names | 61 (`ui` written from 12 files, `state` from 10) | 61 | 56 (`state`, `ui`, `cloud`, `acct` and `acctWait` are the store's) |
| Legacy lines | 10,452 | 9,863 | 9,134 |
| In `src/app/` | `config.ts` | and `util`, `units`, `library`, `routines`, `formulas` (109 declarations) | and 18 more modules, the store among them (182 declarations: 176 moved, the four shared objects, `state` and `setState`) |

## The phases

Each phase is its own pull request, tried in the preview before V merges it. Each proves it changes nothing a lifter sees: the full suite in Chromium and WebKit, `tests/coherence.js`, and for the engine and analytics the 2,000 seeded histories of `tests/r36.js` giving identical numbers before and after.

1. **Toolchain and config (r49).** esbuild, TypeScript, `src/app/config.ts`, the version people see (2.0) apart from the build, the single-source and boundary checks, the ratchet. Done in r49.
2. **Pure math and data (r50).** The bottom layers, 109 declarations that read nothing but their arguments, each other and (for `uid` and `today`) the clock and a random number: `util.ts` (text, ids, dates, numbers, the sync hash), `units.ts` (units and plates), `library.ts` (muscles, joints, equipment, the exercise library and what an exercise is), `routines.ts` (the default plan and the ready-made routines) and `formulas.ts` (the 1RM estimate and its inverses, the working load, set counting, the time model and the thresholds behind trends and breaks). Moved as they were: `tests/moved.js` compares each with the same declaration in r49 after esbuild's printer, so types and layout are free and every expression and literal must match, and a one-value change fails it; it also holds every name the moved code uses to what it meant in r49 and allows nothing else at a moved module's top level (an independent review found five ways to change behaviour that passed a comparison of text alone, and each now fails). The bundle gained a "use strict" at its top: the modules ran in sloppy mode inside esbuild's wrapper, where ES modules are always strict. The pure functions that still read a setting or the log (the load step in the unit on screen, the analytics) wait for phase 3. Done in r50.
3. **State with one owner**, in two releases (V, 2026-10-17: six releases from here, grouped only where grouping adds no risk).
   - **3a (r51): the rest of the self-contained code, and one owner for the shared state.** Done in r51, as planned below.
   - **3b (r52): the engine and analytics take what they read as arguments.** `suggest`, `IDX()` and the readers around them stop reaching for `state` and the settings and are passed them, so they become pure functions with unit tests of their own; `tests/r36.js` (2,000 seeded histories) proves every number unchanged.
4. **Storage and sync (r53), alone.** Same storage keys, same sync documents, same key order: `tests/seams.js`, `tests/migration.js` and every baseline hold them to it. Nothing rides along: a fault across devices must have one suspect, and the log is the one thing that cannot be repaired afterwards.
5. **Screens (r54 to r56).** As components, two tabs a release: Settings and History, then Plan and Stats, then Today and the session screen last, alone, since it is used mid-workout. The legacy script is deleted when it is empty.

### Phase 3a in detail (r51)

**Part 1: 176 self-contained declarations move** (of the 215 the map calls pure; the other 39 are listed below with the reason each waits). Each goes where it belongs in the finished design, not to the nearest file:

| Module | What it holds |
|---|---|
| `routines.ts` (grows) | routine helpers: a week's training days, superset links and letters, sets a day, a routine's signature, the template count line, the target RIR tip |
| `library.ts` (grows) | exercise search by words, Most common first, its tip |
| `formulas.ts`, `util.ts` (grow) | the load jump tip beside `jumpPct`; the seeded random numbers |
| `profile.ts` | Your training: the choices, focus numbers, `profClean`, its tips |
| `records.ts` | what a stored record may hold: the schema version, limits, id checks, the cleaners for calibration, check-in and targets, session order, the trash limits |
| `gym.ts` | Your gym: plates, dumbbells, `gymClean`, plate modes |
| `chunks.ts` | how the log splits into sync documents |
| `merge.ts` | record fingerprints and the three-way merge, and Undo's merge of a session in progress |
| `session.ts` | a session in progress: grey and effective loads, live targets, the Last column, joining repeated lifts, rest after a block, a blank session, the edit fingerprint, hints said once |
| `loads.ts` | what a load number means, in words |
| `prs.ts`, `trend.ts`, `volume.ts`, `goals.ts` | PR names and bands; a lift's trend window and ends; below and above a target; a goal's gap |
| `importing.ts` | the import parsers: dates, CSV, .xlsx, names, headers, sets typed as text |
| `feedback.ts` | problem report kinds, limits and the screenshot check |
| `layout.ts`, `charts.ts`, `format.ts`, `icons.ts` | sections and their order, accents, sheets with fields; chart windows; dates, durations and counts in words (`estMin` among them); the logo and icons |

Moving into a module that already exists (`routines.ts` and three others) is checked like a new one: `tests/moved.js` is generalized so a module can take declarations from more than one phase, each compared with the baseline of the phase that moved it.

**What waits, and why** (39): the screen markup (`pageHead`, `pickRow`, `tipi`, the body map and its shapes, the safety line, the code field, and the like) moves as components in phase 5, not as strings into a module first; the analytics steps that are pure on their own (`idxLightWeeks`, `calSummary`, `avgWeeksTxt`, `musTrend`, the size map, readiness words) and the engine case `sgBadDay` move with `IDX()` and `suggest` in 3b, so neither subsystem is split across two places; `UNDO_MAX` and `UNDO_TTL` share a statement with the undo store and `logCut` belongs to the log, so they move with storage in phase 4; `EMAIL_RE` moves with the account sheets and `howToUrl` with `howToLink`, its markup; `aiInit` and `aiOn` (with the `AI` object beside them, which is not pure, since one place writes its `ctl` and another reads it) are stubs left by the retired Claude features (r46), which always answer "off": removing them is a change, not a move, so it is listed for V instead of done here.

**Part 2: one owner for the shared state.** `src/app/store.ts` declares `state`, `ui`, `cloud`, `acct` and `acctWait`; the legacy script imports them under the same names, so every reader is unchanged. An import cannot be assigned to, so the 19 places that replace the whole log (`state=normalize(...)`, a restore, a sign-in, Undo) call `setState(...)`, which assigns and returns the value as the assignment did. That is the whole change: `tests/moved.js` gains a check that every statement left in the legacy script is the same as in r50 once `setState(x)` is read back as `state=x`, so nothing else can slip in. The properties of `ui`, `cloud` and the log are still written from many places; giving those writes one path is 3b's and phase 5's work, and this release does not claim it.

**Unchanged by 3a:** storage keys, `normalize()`, the sync documents and their order, every screen. **Proof before V sees it:** `tests/moved.js` (code and names, as in r50, plus the legacy rewrite check), `tests/hygiene.js`, `tests/r36.js`, `tests/coherence.js`, every suite in Chromium and WebKit, and an independent review that has not seen the work. Version 2.2, build r51.

**Built (r51):** 176 declarations moved as listed (one, the .xlsx reader `impXlsx`, is self-contained but uses the browser's DOMParser, so it alone needs a browser to run, while the rest of `importing.ts` loads and runs in Node; the map now counts the web APIs a page provides) and the five shared objects went to `src/app/store.ts` (180 compared with r50, token for token); 18 assignments and the one at start go through `setState`; the 692 statements left in the legacy script are r50's in order once those are read back. Two things changed in the move check along the way: it compares with whitespace minified (esbuild keeps an array's line breaks when it reprints, so a reformatted list read as a change), and code a move adds or changes on purpose (`setState`, `state` declared without a value) carries an executable check in its entry, run against the module itself, since there is no baseline to compare it with. The independent review then found two more holes, each shown passing every check before the fix and failing after: a module that imports another only to run it (`import './x'`), and code added on purpose checked only by its executable check, so `setState` could have cut the log and passed. Now a moved module may not import for effects, every module is in a move or listed as written new, and added or changed code is held to the exact code and names its entry states. Seven comments the move had left beside the wrong code were put back beside theirs (the legacy script's line count rose by 15 for it), `HIST_PAGE` moved to the store so the state layer imports no screen module, and every module is formatted with Prettier from a committed `.prettierrc.json`, checked on every run (at first the r49 and r50 modules kept their hand layout, an exception removed later in r51; the exercise library and the two routine builders (`defaultRoutine` and `TEMPLATES`, functions whose bodies are the tables) keep one record a line behind a `prettier-ignore`, allowed only at a module's top level under a comment saying why, and printed by the check; layout never changes code, which the move check proves). One key in the import parser's name table (`assisted dip`) is written twice with the same value; TypeScript refuses that, so the line carries a marked exception rather than a change, and removing the copy is a change for later. A second independent review, on the fixes, again found no change in behaviour, and four more ways to change it that passed every check, each shown passing before the fix and failing after: code run from `types.ts` or `config.ts`, which no move compared (now `types.ts` must compile to nothing, and `config.ts` to constants made from literals and its own values, read by `tests/moved.js`); a name re-exported under another's name (now a module's name must come from the module that declares it); an import circle between the store and the screen layer that left History's page size `undefined` at start (now the layers and the no-circle rule above); and a copy of the legacy script in a module, read by the move check in place of the real one (now the legacy script is found by the shape `scripts/join.js` gives the bundle, and `@ts-nocheck` and `@ts-ignore` are refused, with the one marked exception listed). `src/09-imports.js` may now hold only named imports from `src/app/` (an empty `import {}` and `export * from` passed the earlier check), and the formatting of the modules from r51 on is checked by Prettier.

A mutation test followed (37 edits that change the built page, each run against the checks): 15 passed every check, from five causes, each now closed and each mutant replayed to a failure. The causes and the rules that answer them: (1) the checks read `src/app/` one level deep, by file name, and matched an import by its base name, so a module in a subfolder under a known name, or a `.tsx` beside a `.ts`, was read by nothing while the bundle took it; now every file under `src/app/` at any depth must be a `.ts` file, a module is named by its path, an import is resolved from the importing file's own place, and `scripts/join.js` pins the extensions the bundler may try. (2) Nothing compared the module code on the page with the modules, so a build script that injected a file, a `package.json` field that swapped a module in, a replace on the bundle's text, a page edited by hand and a second inline script all passed; now `tests/moved.js` checks that `index.html` is exactly what `scripts/join.js` builds, that the script starts strict, that outside the legacy script the page holds only declarations, each one module's by name and code and every module's on the page once, that no two modules declare one name (so the bundler renames nothing), and that the page's other inline scripts are the baseline's; `package.json` may carry no field that maps a module elsewhere. (3) A binding made by destructuring (`const { Math } = ...`, `const [] = [...]`) was not counted as a declaration, so code could run on load or take a global's name; now only plain names pass. (4) The legacy locator took the last script of the legacy shape, so a copy appended after the real one was compared in its place; now there must be exactly one, and `scripts/join.js` refuses legacy parts that are more than the one call. (5) Config, `tsconfig.json` and `scripts/config.js` had no guard: a config value that read a page flag passed with Node seeing the other branch (now only `THREE_URLS` may read `IRONLOG_APP`), a `tsconfig.json` covering one file passed (now its strict settings and its coverage of every module are checked), and a config loader that changed a value passed (now its values must equal the module's). Two checks were over-broad and are not now: a comment that mentions an import or a `@ts-ignore` no longer fails (imports are read from the syntax tree, a directive is a comment that opens with it), and `src/09-imports.js` may import any module that exists, in a subfolder or not.

The release's own review then found five more things, each closed: an assertion (every import used) had been deleted by accident with the formatter block it sat under, and is back; the page around the app script (markup, styles, the loader, any handler attribute) is now held to the baseline's, build id aside, unless a move entry says the release changes the page and why; what `scripts/build.js` adds to the shipped page (the head and boot scripts, the install metadata) is pinned by hash in `tests/dist-page.json`, its app script must be `index.html`'s byte for byte, its account settings `supabase.config.json`'s, and its Content Security Policy must allow exactly its inline scripts (a timer that wiped the log, put in the boot script, had reached `dist/` with every check green); every baseline is pinned by hash in `baselines/SHA256SUMS`, so an edit to one is a visible change to that file; and the workflow runs `tests/hygiene.js` and `tests/moved.js` on their own before the runner, so a runner that dropped one could not hide it.

**A change to the legacy script between phases.** The statement-for-statement check holds the legacy script to the last move's baseline, so a fix to legacy code is not made by editing it in place: a fix is new code, and new code goes in `src/app/` (rule 9). When a legacy function needs to change, it moves first, as a declaration listed in the move with `changed` (its new code, the names it uses and an executable check) or, for a rewrite too large to state in an entry, as `added` code held by a suite the entry names, which must exist and run; the legacy copy is deleted in the same change, so the ratchet holds. Phase 3b rewrites `suggest` and `IDX` to take what they read as arguments, so it uses that second form, and the entry mechanism for it (`held: 'tests/<suite>.js'`, with the suite's existence and place in `tests/run.js` checked) is added to `tests/moved.js` in 3b with its own test, not before it is needed. A change a lifter sees goes through the ordinary suites, `tests/coherence.js` among them, as every release before the move did.

### The outside review (V, 2026-10-17)

V brought two lists of engineering practice from another assistant (Gemini) and asked that every point that applies be in place, checked against the code rather than assumed. Each point was checked in the source. In place already: this file and CLAUDE.md as the rules every session reads, the plan written before the code, strict TypeScript with Prettier, every suite in Chromium and WebKit on every pull request with `main` protected, `normalize()` validating every field of every load, import and cloud merge, the cloud settings validated at build (`scripts/build.js`), sync writing whole documents by id (so a repeat changes nothing) and retrying at 5, 15, 60 and 180 s through one queue, network buttons that ignore a second tap while busy and confirm sheets that close before they act, no `console` call anywhere, one structured log (time, area, build, the first lines of the stack, reset tokens cut out) that travels with a crash report, and a teardown on every render for charts, drag lists, the rest timer and the tour, with the 3D renderer built once. Not taken, with the reason: Zod or another schema library (it would replace `normalize()`, whose key order and kept unknown fields sync depends on, for nothing it does not already check), OpenTelemetry (it needs a server collecting use of the app, which V tied to the privacy and legal work, item 192), React's patterns (there is no framework), and ESLint (the compiler options in `tsconfig.json` and the checks in `tests/hygiene.js` cover what it would add here).

**Added in r51, each a check that fails without it** (nothing a lifter sees changes):

1. **Types say only what is true.** No `any` in `src/app/`. Every cast (other than `as const`) and every `!` has its reason in a comment: on its own line, on the line above, or leading a statement that holds it and naming it ("cast", or the `!`). The counts below are a ratchet, as the legacy script's size is: higher fails, and lower fails until the numbers are lowered, so a cast replaced by a real type stays replaced. The open index signatures (`[field: string]: unknown`, on the shared state the untyped legacy script still writes) are counted the same way and close as their writers move.

Casts: 37
Non-null assertions: 24
Open index signatures: 6

2. **Outside addresses and library versions are defined once**, in `src/app/config.ts`: the Chart.js and SortableJS versions and their addresses, three.js's version, the fonts stylesheet and its two origins, and the password check's origin. The markup reads them through `scripts/join.js`'s placeholders, `scripts/build.js` reads them for its replacements, its Content Security Policy and its license list, and `scripts/cloud-supabase.js` through the build's placeholders. Each version equals the one `package.json` pins. `tests/hygiene.js` fails on any of them typed anywhere else in `src/` or `scripts/`, and on any other outside address there that is not config's or listed below with the phase that moves it:

Addresses waiting for their phase: www.youtube.com (howToUrl, phase 5)

3. **An error handled in a module says why.** Every `catch` in `src/app/` either throws or carries a comment saying why the error is expected and what the fallback is. `log` is legacy until phase 4, so a module cannot log yet; once it moves, the rule becomes: log it, or say why it is expected. 36 of the legacy script's 160 `catch` blocks have none of a log, a throw or a comment (counted on its syntax tree); each meets the rule as its code moves, since the rule reads every module.
4. **Nothing builds up as the screens redraw** (`tests/cleanup.js`): through repeated renders of every tab, a session, a sheet and the 3D body, the live charts equal the charts on screen, the live drag lists equal the lists on screen, intervals do not accumulate, and one WebGL context is made.

**Placed in the phase whose code they change**, each with the check that will hold it (PENDING 305 to 307):

- Phase 3b: the engine and analytics, once pure, get unit tests run in Node against the modules themselves, with coverage measured per module and held by a ratchet, as every module that changes afterwards does (the unit suites today run 80 checks on the math and analytics in the page).
- Phase 4 (305): one storage module reads every stored value, each key through a typed check of every entry (today the sync bookkeeping, the edit times and two device markers are checked only at the top level); `tests/hygiene.js` then fails on `localStorage` or a parse of stored text anywhere else. `log` moves here too, and with it rule 3 tightens.
- Phase 4 and 5 (307): the sync status becomes one typed set of states with one function that moves between them; the account flow (sign in, create, waiting for the email, the code) becomes one typed set of states in place of the `busy`, `coding` and timer flags that can contradict each other; the account errors' `code` values become one typed list; and the open index signatures close as their writers move (the ratchet above).
- With the menu's sheets in phase 5 (306, and an SQL step for V): a problem report gets a time limit, so Sending cannot hang, and a key made on the phone with a unique column in the table, so a retry after a lost reply does not make a second report and a second ticket.

**What no test guards, by design:** the checks themselves. The tables in `tests/moved.js` (`MOVES`, `NEW_MODULES`) and `tests/hygiene.js` (`EXPECT`, `GLOBALS`), the layer list and the ratchet numbers in this file, the pinned hashes in `tests/dist-page.json` and `baselines/SHA256SUMS`, `scripts/depmap.js` (whose name resolution `tests/moved.js` relies on), `scripts/join.js`, `scripts/build.js`, `tests/run.js` and the workflow can each be edited to admit a change, and only review of the pull request catches that. That is the standard answer: a check cannot guard its own text. `main` is protected (`OWNER.md` B6, done 2026-10-15): a merge needs a pull request and the `test` check green, so that review is where every such edit is seen.



## Rules (each enforced by a test, not by memory)

- Moving code changes no code: `tests/moved.js` holds every moved declaration to the build its phase started from, token for token once types, layout and whitespace are set aside, with every name in it pointing where it did; a moved module holds only imports under their own names and exported declarations, and no other module exports a name that was moved. The legacy script a phase leaves behind is the baseline's, statement for statement and in order, once the rewrites the phase lists are read back. A declaration a phase adds or changes on purpose is listed with the reason and an executable check of what it does.
- Moved code exists once: no legacy declaration takes a module export's name (it would hide the module's copy), every export the legacy script uses is imported, every import is used, and every name the legacy script reads without declaring or importing it is on a list of browser and JavaScript globals, so a missing import fails before the app runs (`tests/hygiene.js`, from `scripts/depmap.js`'s scope-aware reading of the legacy script). An imported name that is shared state (exported with `let`, or written by the legacy script) makes its readers impure in the map.

- A value that names, identifies or configures the app is defined once, in `src/app/config.ts`, and read everywhere else. `tests/hygiene.js` fails on the name, the site address, a build id or the storage id typed anywhere else, in code or markup.
- `src/app/` imports only `src/app/`. The legacy parts import only through `src/09-imports.js`.
- The legacy script never grows, in declarations or in lines (the ratchet above).
- Types say only what is true: no `any` in `src/app/`; every cast and `!` has its reason in a comment; the casts, `!` and open index signatures only fall in number (the ratchet in The outside review); every `catch` in a module throws or says why (`tests/hygiene.js`).
- Outside addresses, library versions and the font faces are config's, like the name; any other outside address waits in The outside review's list for its phase (`tests/hygiene.js`).
- Nothing a screen sets up outlives the render that drew it: charts, drag lists, intervals and the 3D body's one WebGL context (`tests/cleanup.js`).
- Storage keys keep "ironlog" whatever the app is called: they are built from `STORAGE_ID`, an identifier that never changes, since renaming it would leave saved logs behind. `tests/r49.js` holds the keys to their exact values.
- Moving code changes no behaviour: the suites, the coherence checks and the r36 equivalence say so before a phase is merged.
