# src/

The app's source. `npm run join` (`scripts/join.js`) builds `index.html` from
it, the one page `scripts/build.js` and every test use. Edit here, then join;
`tests/r36.js` fails if `index.html` and `src/` disagree. Read
`ARCHITECTURE.md` first: the code is moving from the legacy script into typed
modules, one phase at a time, and `tests/hygiene.js` enforces the rules.

- `app/`: the typed modules (TypeScript, strict), in the layers
  `ARCHITECTURE.md` sets out. `app/config.ts` is the one place for the app's
  name, version, build, site address and storage id; `types.ts` holds the
  record shapes; `store.ts` owns the shared state (`state`, `ui`, `cloud`,
  `acct`, `acctWait`; the log is replaced only through `setState`). The engine
  and the analytics are functions of a model (`model.ts`), and `live.ts` holds
  the one model the app runs on and the adapters through which the legacy
  script calls them. The legacy script has moved here phase by phase since
  r50. New code goes here.
- `01-head.html`, `02-style.css`, `03-body.html`, `99-tail.html`: the page's
  head, styles, markup and close. `{{NAME}}` placeholders in them are filled
  from `app/config.ts` by the join.
- `09-imports.js`: the `import` lines through which the legacy script reads
  `app/`. The join puts it first, outside the legacy wrapper.
- `10-*.js` to `29-*.js`: the legacy script, cut in r36 where the code had
  section headers. They are pieces of one script in one function scope, kept
  in their original wrapper: a part may use names defined in another. 10 to
  29 run from start-up and reference data through storage, sync, accounts,
  the numbers (15 analytics, 16 the load engine, 17 adjusting the next sets),
  the screens, the sheets and actions, and events. The join bundles them with
  esbuild into the page's one inline script. Since r54 they may be fixed in
  place, with a failing test first; they never grow (the ratchet in
  `ARCHITECTURE.md`).
