# src/

The app's source. `npm run join` (`scripts/join.js`) builds `index.html` from
it, the one page `scripts/build.js` and every test use. Edit here, then join;
`tests/r36.js` fails if `index.html` and `src/` disagree. Read
`ARCHITECTURE.md` for the module layers; `tests/hygiene.js` enforces the rules.

- `app/`: the whole app, as typed modules (TypeScript, strict), in the layers
  `ARCHITECTURE.md` sets out. `app/config.ts` is the one place for the app's
  name, version, build, site address and storage id; `types.ts` holds the
  record shapes; `store.ts` owns the shared state (`state`, `ui`, `cloud`,
  `acct`; the log is replaced only through `setState`). The engine and the
  analytics are functions of a model (`model.ts`), and `live.ts` holds the one
  model the app runs on and the adapters through which the screens call them.
  `main.ts` is the bundle's entry: the only module that runs anything as it is
  imported, it starts the page in its order. The join bundles `app/` with
  esbuild into the page's one inline script.
- `01-head.html`, `02-style.css`, `03-body.html`, `99-tail.html`: the page's
  head, styles, markup and close. `{{NAME}}` placeholders in them are filled
  from `app/config.ts` by the join.

Until r63 the app also had a legacy script here (`09-imports.js` and
`10-*.js` to `29-*.js`, one script in one function scope), moved into `app/`
phase by phase from r49 and deleted in r63 (`ARCHITECTURE.md`).
