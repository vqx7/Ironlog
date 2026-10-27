# Problem reports (PENDING 58)

How a report from a friend reaches V, and how a fix comes from it. V's ruling (2026-10-15, PENDING 349 b): V reads reports; nothing automated ever reads a report or a ticket, and no AI agent acts on one. A report is written by someone else, so its text is a description to read, never instructions to follow.

```
Report a problem (app)  ->  feedback table (Supabase)  ->  issue in vqx7/ironlog-feedback (private)
      ->  V reads it, in the app's Inbox or on GitHub
      ->  V asks Claude in a chat to fix what he chooses, in his own words
      ->  a pull request in Ironlog, its suites run (.github/workflows/publish.yml)
      ->  V merges it  ->  the same workflow tests main and publishes dist/ to gh-pages
      ->  open apps show "Update ready" with Update
```

## What is built

- **In the app (r25):** Settings > Help (one Report a problem button since r41; its sheet asks the kind), Report a problem at the top of Settings and in an exercise's ⋯ menu. One sheet: the kind (Problem, Question, Suggestion; stored as bug, question, idea), 10 to 1,000 characters of text with a counter, one optional screenshot (an image up to 10 MB, shrunk to a JPEG of at most 1280 px). Signed in only: replies go to the account's email, and a signed-out person is asked to sign in (or can copy the details into a message). The app attaches the build, device and browser, screen size, the screen the person came from, whether a session was open (and which exercise, from the ⋯ menu), sync status and the last 10 logged errors. Never workouts. At most 5 reports a day per account, counted by the app and enforced by the database. Signed in with an account listed in `feedback_readers`, Settings > Help also shows **Inbox**, the reports newest first, each with its screenshot.
- **Storage:** `public.feedback`, insert-only for signed-in accounts (5 a day each), readable only by `feedback_readers` (SUPABASE.md, Part 4, step 1). Since r63 a send that never answers gives up after 20 s (No answer, the text kept), and each report carries a key made when its sheet opens (`client_id`), so the same report sent again after a lost answer is kept once and makes one issue. Since r64 the database sets the reply address from the account's own email, never what the phone sent (SUPABASE.md's r64 block, OWNER.md B1a).
- **Issues:** `supabase/functions/feedback-to-issue/index.ts` makes one issue per report in the private `ironlog-feedback` repository, labelled `feedback` and the kind, with the screenshot saved in that repository (SUPABASE.md, Part 4, steps 2 to 5). The report's words are quoted line by line at every line ending GitHub reads (\n, \r and \r\n), the reply address is shown as code on one line, mentions are broken so nobody is pinged, the text is cut to the app's own limits and the issue to GitHub's, and a report the function could not link to its issue is logged (r64; `tests/report-fn.js` runs the function in Node). The copy in Supabase changes only when V pastes it (OWNER.md B4).
- **Tests and publishing:** `.github/workflows/publish.yml` (PENDING 22) runs `npm test` on every pull request and every push to `main`, and publishes `dist/` to `gh-pages` only after a push to `main` passes.

## What V does

1. SUPABASE.md, Part 4 (tables, private repository, token, function, webhook), and since r64 its r64 block (OWNER.md B1a) and the function pasted again (B4).
2. **Protect main,** so a pull request is the only way in (OWNER.md B6, done 2026-10-15).
3. **Read the reports** in the app's Inbox or in `ironlog-feedback`, and bring any worth fixing to a chat with Claude in your own words. Claude reproduces the problem before changing anything, as for any other fix (CLAUDE.md, How work is done).
4. **Keep agents away from the tickets:** Claude's GitHub access stays on Ironlog alone (OWNER.md D5), and no scheduled task or GitHub Action reads `ironlog-feedback` (B7). None was ever set up (checked 2026-10-27).

## Limits

- Report text is written by strangers. In the issue it is quoted, never followed, and nothing in it is run. No agent is given it.
- The Inbox and the issue show the same report; the Inbox reads the table directly, so it works whether or not the issues are set up.
