# Ironlog

A lifting log for the phone: plan a routine, log sets at the gym, and see progress, weak points and trends. It works offline and installs to the home screen.

- **Standalone app:** built into `dist/` and served by GitHub Pages from the `gh-pages` branch. Data stays on the phone, so export a backup weekly from Settings > Your data.
- **Preview:** every pull request that passes the tests is also published to https://vqx7.github.io/Ironlog/preview/, a separate app with its own storage and sync table, to try on a phone before merging.
- **Claude artifact:** the same `index.html`, published in Claude, with cloud sync to your Claude account.

## Develop

```
npm install
npm run setup     # Chromium for the tests, once
npm test          # every suite, on the source and on the standalone build
npm run build     # dist/ only
```

`OWNER.md` lists every step the owner does by hand, with the code to paste. `CLAUDE.md` has the code map, the rules for changes, and the evidence behind the math. `PENDING.md` lists the open work. Changes go through a pull request: `.github/workflows/publish.yml` runs every suite on it, and merging into `main` tests again and publishes the standalone app. `FEEDBACK.md` covers in-app feedback and the ticket loop.

## Moving from the Claude artifact to the app

1. In the artifact, go to Settings > Your data > Export backup (.json), and save the file to Files.
2. Open the app link on your iPhone in Safari. Tap Share > Add to Home Screen.
3. Open the app from the home screen. Go to Settings > Your data > Import a backup file, and pick that file.
4. Check that your sessions are there, then keep logging in the app.
