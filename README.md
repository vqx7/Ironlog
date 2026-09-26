# Ironlog kit

This kit is the Ironlog r13 source with its full test suite, ready for Claude Code.

## Start

1. Unzip it, then open the folder in a terminal.
2. Run `npm install && npm run setup && npm test`. It should end with "All suites passed". You need Node 18 or later.
3. Run `claude` in the folder, then paste the prompt from `PROMPT.md`.

## Files

- `index.html`: the app (r13).
- `CLAUDE.md`: the project rules and code map. Claude Code reads it on its own.
- `PROMPT.md`: the next-steps prompt, with 8 tasks in priority order.
- `tests/`: 9 Playwright suites. `npm test` runs all of them.
- `baselines/`: earlier builds, used to prove that saved data survives upgrades.

## Updating the live app

Paste `index.html` into Claude and ask it to republish Ironlog at its existing link. Your data lives with the artifact, so it carries over.
