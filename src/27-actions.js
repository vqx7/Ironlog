/* The page's actions by data-act: every screen's and sheet's, each in its
   module since r63 (each change to the log through act). Two choices name
   another action to run, so they read this whole table and stay with it: the
   exercise menu's (the sheet closes, then the session screen's action it
   names runs) and Change's (the sheet closes first, then the start it names
   runs as the card's button did). */
const ACT={...HISTORY_ACTS,...SETTINGS_ACTS,...PLAN_ACTS,...DASH_ACTS,...TODAY_ACTS,...MAP_ACTS,...WORKOUT_ACTS,...UPDATE_ACTS,...ACCOUNT_ACTS,...REPORT_ACTS,...IMPORT_ACTS,...DEMO_ACTS,...APP_ACTS,...ROUTINE_ACTS,...PICK_ACTS,...START_ACTS,...LIFT_ACTS,
  bMenuDo(t){const op=t.dataset.op;closeModal();const f=ACT[op];if(f)f(t);},
  altGo(t){const go=t.dataset.go;closeModal();if(ACT[go])ACT[go](t);},
};
