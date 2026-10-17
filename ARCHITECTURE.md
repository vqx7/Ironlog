# Architecture

Where Ironlog's code is going, how it gets there, and the rules that hold on the way. Written in r49 (V, 2026-10-16: real modules, one source for every value, no hard-coding, built like a professional codebase). PENDING item 303 tracks it.

## Why

Ironlog started as a Claude artifact, which has to be one HTML file. When the artifact was retired on 2026-09-27 the code stayed in that shape: one script, every function and value in one shared scope, screens built from HTML strings. r36 cut it into 24 files, but they are pieces of one script, not modules. In that shape any part can read or change any other part, a value can be typed in many places, and nothing but the tests stops either. Typed modules with clear boundaries stop both before the app runs.

## Where it ends

```
src/app/            TypeScript modules, the whole app when this is done
  config.ts         names, versions, addresses: every value defined once (r49)
  types.ts          the record shapes: an exercise, a plan item, a session (r50)
  util.ts           text, ids, dates, numbers, the sync hash (r50)
  units.ts          units and plates (r50)
  library.ts        muscles, joints, equipment, the exercise library (r50)
  routines.ts       the default plan and the ready-made routines (r50)
  formulas.ts       the 1RM estimate, working load, set counting, time (r50)
  ...               one module per area, in the order of the phases below
src/01-03, 99       the page's markup and styles
```

- **TypeScript**, strict, checked on every test run (`tests/hygiene.js`).
- **esbuild** bundles it into the one inline script the page needs. Every suite opens the page as a file, where module scripts are refused, and the installed app's Content Security Policy fingerprints each inline script, so the output stays one inline script. A larger toolchain such as Vite (a dev server, with Rollup or Rolldown for production) would add nothing this app uses.
- **Modules with one-way dependencies**: config at the bottom, then data, engine and analytics (pure functions of their inputs), then storage and sync, then the screens. A module never reaches into another's internals.
- **Screens as components**, one per tab, reading copy and labels from one place.

## How it gets there: the legacy code shrinks

The current code is the **legacy script**: `src/10-*.js` to `src/29-*.js`, joined in name order, still wrapped in its original `(function(){ ... })()` so every `const` and `let` behaves exactly as written. `scripts/join.js` puts `src/09-imports.js` before it: the real `import` lines through which the legacy script reads what has moved to `src/app/`. Each phase moves code out of the legacy parts into modules and deletes the old copy in the same change, so nothing exists twice.

`scripts/depmap.js` parses the legacy script and lists every top-level declaration, what it uses, which values are shared mutable state, and which declarations are pure (no browser, no shared state, all the way down) and can move as they are.

**The ratchet:** the legacy script may never grow. `tests/hygiene.js` fails when it has more top-level declarations or more lines than the numbers below, and also when it has fewer, until the numbers are lowered to match, so each phase locks in what it moved. A change that adds code adds it in `src/app/`.

Legacy top-level declarations: 819
Legacy lines: 9863

| Measured (scripts/depmap.js) | r49 | r50 |
|---|---|---|
| Legacy top-level declarations | 928 | 819 |
| Pure, movable as they are | 324 | 215 |
| Shared mutable names | 61 (`ui` written from 12 files, `state` from 10) | 61 |
| Legacy lines | 10,452 | 9,863 |
| In `src/app/` | `config.ts` | and `util`, `units`, `library`, `routines`, `formulas` (109 declarations) |

## The phases

Each phase is its own pull request, tried in the preview before V merges it. Each proves it changes nothing a lifter sees: the full suite in Chromium and WebKit, `tests/coherence.js`, and for the engine and analytics the 2,000 seeded histories of `tests/r36.js` giving identical numbers before and after.

1. **Toolchain and config (r49).** esbuild, TypeScript, `src/app/config.ts`, the version people see (2.0) apart from the build, the single-source and boundary checks, the ratchet. Done in r49.
2. **Pure math and data (r50).** The bottom layers, 109 declarations that read nothing but their arguments, each other and (for `uid` and `today`) the clock and a random number: `util.ts` (text, ids, dates, numbers, the sync hash), `units.ts` (units and plates), `library.ts` (muscles, joints, equipment, the exercise library and what an exercise is), `routines.ts` (the default plan and the ready-made routines) and `formulas.ts` (the 1RM estimate and its inverses, the working load, set counting, the time model and the thresholds behind trends and breaks). Moved as they were: `tests/moved.js` compares each with the same declaration in r49 after esbuild's printer, so types and layout are free and every expression and literal must match, and a one-value change fails it; it also holds every name the moved code uses to what it meant in r49 and allows nothing else at a moved module's top level (an independent review found five ways to change behaviour that passed a comparison of text alone, and each now fails). The bundle gained a "use strict" at its top: the modules ran in sloppy mode inside esbuild's wrapper, where ES modules are always strict. The pure functions that still read a setting or the log (the load step in the unit on screen, the analytics) wait for phase 3. Done in r50.
3. **State with one owner.** `state`, `ui` and `cloud` move into a store module that the legacy code imports under the same names; the engine and analytics are then rewritten to take the state they read as arguments (the engine reads `state` directly in 31 places today), so they become pure and unit-tested.
4. **Storage and sync.** Same storage keys, same sync documents, same key order: `tests/seams.js`, `tests/migration.js` and every baseline hold them to it.
5. **Screens.** One tab at a time as components, Settings first and the session screen last. The legacy script is deleted when it is empty.

## Rules (each enforced by a test, not by memory)

- Moving code changes no code: `tests/moved.js` holds every moved declaration to the build its phase started from, token for token once types and layout are set aside, with every name in it pointing where it did; a moved module holds only imports under their own names and exported declarations, and no other module exports a name that was moved. A declaration changed on purpose after it moved is listed there with the release and the reason.
- Moved code exists once: no legacy declaration takes a module export's name (it would hide the module's copy), every export the legacy script uses is imported, every import is used, and every name the legacy script reads without declaring or importing it is on a list of browser and JavaScript globals, so a missing import fails before the app runs (`tests/hygiene.js`, from `scripts/depmap.js`'s scope-aware reading of the legacy script). An imported name that is shared state (exported with `let`, or written by the legacy script) makes its readers impure in the map.

- A value that names, identifies or configures the app is defined once, in `src/app/config.ts`, and read everywhere else. `tests/hygiene.js` fails on the name, the site address, a build id or the storage id typed anywhere else, in code or markup.
- `src/app/` imports only `src/app/`. The legacy parts import only through `src/09-imports.js`.
- The legacy script never grows, in declarations or in lines (the ratchet above).
- Storage keys keep "ironlog" whatever the app is called: they are built from `STORAGE_ID`, an identifier that never changes, since renaming it would leave saved logs behind. `tests/r49.js` holds the keys to their exact values.
- Moving code changes no behaviour: the suites, the coherence checks and the r36 equivalence say so before a phase is merged.
