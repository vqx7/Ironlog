# Ironlog

A lifting log for the phone: plan a routine, log sets at the gym, and see progress, weak points and trends. It works offline and installs to the home screen.

- **Standalone app:** built into `dist/` and served by GitHub Pages from the `gh-pages` branch at https://ironapp.org. The log is kept on the phone; an optional account syncs it between phones (Supabase, `SUPABASE.md`).
- **Preview:** every pull request that passes the tests is also published to https://ironapp.org/preview/, a separate app with its own storage and sync table, to try on a phone before merging.
- **Claude artifact:** retired on 2026-09-27, when the log moved into the installed app. Nothing is published there any more.

## Develop

```
npm install
npm run setup     # Chromium for the tests, once
npm run setup:webkit   # WebKit for the tests, once (every iPhone browser is WebKit)
npm test          # every suite, on the source and on the standalone build
npm run test:webkit    # the same in WebKit
npm run build     # dist/ only
```

`OWNER.md` lists every step the owner does by hand, with the code to paste. `CLAUDE.md` has the rules for changes; `docs/ARCHIVE.md` the code map and the history behind each rule; `docs/EVIDENCE.md` the evidence behind the math; `ARCHITECTURE.md` the module layers. `PENDING.md` lists the open work. Changes go through a pull request: `.github/workflows/publish.yml` runs every suite on it in Chromium and in WebKit, and merging into `main` tests again and publishes the standalone app. `FEEDBACK.md` covers in-app feedback and the ticket loop.
