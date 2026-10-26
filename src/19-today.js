/* ---------- TODAY'S SHEETS ----------
   Today is drawn by src/app/today.ts since r59, the session screen by
   src/app/workout.ts since r60, and the sheets they open by src/app/sheets*.ts
   since r62. */
/* The install sheet, the new icon's and a past workout's are in src/app/sheetsapp.ts since r62; the build's install offer, once the browser makes one, redraws the tab that shows Install. */
window.ironlogInstallReady=()=>{if(ui.tab==='today'||ui.tab==='settings')rerenderKeepScroll();};
/* ---------- INSIGHTS ----------
   What the home screen and the dashboard summary say first. Every number here
   is read from the same analytics the detailed sections use (IDX, exStats,
   scores, actualAvg4), so a headline and the section under it cannot
   disagree. This layer only decides what to say, never how to calculate. */
// Counted PRs only (r32): the ones marked big.
// PRs worth announcing within any window. The screens use recent4w (src/app/display.ts); the
// suites reach for this one to check a window of their own.
function prsWithin(days){const from=addDays(today(),-days);return IDX().prs.filter(x=>x.date>=from&&x.big);}
