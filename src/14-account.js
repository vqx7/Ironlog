/* ---------- account ----------
   The account flow is src/app/account.ts's and problem reports
   src/app/report.ts's since r63; their sheets are src/app/sheetsaccount.ts's.
   Their listeners (a return to the front or online tries the wait for a new
   account's email, or the sync, again) are added here, where they always
   were, before the page's own. */
accountStart();
