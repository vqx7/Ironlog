# src/

The app's source, in parts. `npm run join` writes them, in name order, into
`index.html`, the one file the Claude artifact, `scripts/build.js` and every
test use. Edit here, then join; `tests/r36.js` fails if `index.html` and
`src/` disagree.

The parts are cut where the code already had section headers, so each one is
plain to find. They are pieces of one page and one script (the app runs in a
single function scope), not separate modules: a part may use names defined in
another. 01 to 03 are the page head, the styles and the markup; 10 to 29 the
script, from start-up and reference data through storage, sync, accounts, the
numbers (15 analytics, 16 the load engine, 17 adjusting the next sets), the
screens, the sheets and actions, and events; 99 closes the page.
