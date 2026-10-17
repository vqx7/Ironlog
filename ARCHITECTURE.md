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
- **Modules with one-way dependencies**: config at the bottom, then data, engine and analytics (pure functions of their inputs), then storage and sync, then the screens. A module never reaches into another's internals. Since r51 `tests/hygiene.js` holds each module to its layer (0 `config` and `types`; 1 data: `util`, `units`, `library`, `routines`, `formulas`, `records`, `gym`, `profile`; 2 engine and analytics: `session`, `loads`, `prs`, `trend`, `volume`, `goals`, `importing`; 3 storage and sync: `chunks`, `merge`, `store`; 4 screens: `format`, `layout`, `icons`, `charts`, `feedback`), an import goes only to the same layer or below, a new module is given its layer there, and no import goes round in a circle: the bundle turns a module's `const` into `var`, so in a circle a value read before its module has run is `undefined`, not an error.
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

**Built (r51):** 176 declarations moved as listed (one, the .xlsx reader `impXlsx`, is self-contained but uses the browser's DOMParser, so it alone needs a browser to run, while the rest of `importing.ts` loads and runs in Node; the map now counts the web APIs a page provides) and the five shared objects went to `src/app/store.ts` (180 compared with r50, token for token); 18 assignments and the one at start go through `setState`; the 692 statements left in the legacy script are r50's in order once those are read back. Two things changed in the move check along the way: it compares with whitespace minified (esbuild keeps an array's line breaks when it reprints, so a reformatted list read as a change), and code a move adds or changes on purpose (`setState`, `state` declared without a value) carries an executable check in its entry, run against the module itself, since there is no baseline to compare it with. The independent review then found two more holes, each shown passing every check before the fix and failing after: a module that imports another only to run it (`import './x'`), and code added on purpose checked only by its executable check, so `setState` could have cut the log and passed. Now a moved module may not import for effects, every module is in a move or listed as written new, and added or changed code is held to the exact code and names its entry states. Seven comments the move had left beside the wrong code were put back beside theirs (the legacy script's line count rose by 15 for it), `HIST_PAGE` moved to the store so the state layer imports no screen module, and the new modules are formatted with Prettier from a committed `.prettierrc.json` (the r49 and r50 modules keep their hand layout; layout never changes code, which the move check proves). One key in the import parser's name table (`assisted dip`) is written twice with the same value; TypeScript refuses that, so the line carries a marked exception rather than a change, and removing the copy is a change for later. A second independent review, on the fixes, again found no change in behaviour, and four more ways to change it that passed every check, each shown passing before the fix and failing after: code run from `types.ts` or `config.ts`, which no move compared (now `types.ts` must compile to nothing, and `config.ts` to constants made from literals and its own values, read by `tests/moved.js`); a name re-exported under another's name (now a module's name must come from the module that declares it); an import circle between the store and the screen layer that left History's page size `undefined` at start (now the layers and the no-circle rule above); and a copy of the legacy script in a module, read by the move check in place of the real one (now the legacy script is found by the shape `scripts/join.js` gives the bundle, and `@ts-nocheck` and `@ts-ignore` are refused, with the one marked exception listed). `src/09-imports.js` may now hold only named imports from `src/app/` (an empty `import {}` and `export * from` passed the earlier check), and the formatting of the modules from r51 on is checked by Prettier.



## Rules (each enforced by a test, not by memory)

- Moving code changes no code: `tests/moved.js` holds every moved declaration to the build its phase started from, token for token once types, layout and whitespace are set aside, with every name in it pointing where it did; a moved module holds only imports under their own names and exported declarations, and no other module exports a name that was moved. The legacy script a phase leaves behind is the baseline's, statement for statement and in order, once the rewrites the phase lists are read back. A declaration a phase adds or changes on purpose is listed with the reason and an executable check of what it does.
- Moved code exists once: no legacy declaration takes a module export's name (it would hide the module's copy), every export the legacy script uses is imported, every import is used, and every name the legacy script reads without declaring or importing it is on a list of browser and JavaScript globals, so a missing import fails before the app runs (`tests/hygiene.js`, from `scripts/depmap.js`'s scope-aware reading of the legacy script). An imported name that is shared state (exported with `let`, or written by the legacy script) makes its readers impure in the map.

- A value that names, identifies or configures the app is defined once, in `src/app/config.ts`, and read everywhere else. `tests/hygiene.js` fails on the name, the site address, a build id or the storage id typed anywhere else, in code or markup.
- `src/app/` imports only `src/app/`. The legacy parts import only through `src/09-imports.js`.
- The legacy script never grows, in declarations or in lines (the ratchet above).
- Storage keys keep "ironlog" whatever the app is called: they are built from `STORAGE_ID`, an identifier that never changes, since renaming it would leave saved logs behind. `tests/r49.js` holds the keys to their exact values.
- Moving code changes no behaviour: the suites, the coherence checks and the r36 equivalence say so before a phase is merged.
