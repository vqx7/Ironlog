/* Problem reports (r25): their kinds, the words on the sheet, the limits the
   feedback table also enforces, and the check on a report's screenshot
   (phase 3a, r51; moved unchanged from the legacy script, tests/moved.js
   holds them to r50's code). */

/** The kinds a report can be, stored as bug, question and idea. */
export const FB_CATS: readonly (readonly [string, string])[] = [
  ['bug', 'Problem'],
  ['question', 'Question'],
  ['idea', 'Suggestion']
];

/* Per kind: the sheet's title (also in the first line of a report copied as
   text, and the test of whether a kind is known), the label over the text
   box, and the box's placeholder. */
export const FB_TITLE: Readonly<Record<string, string>> = {
  bug: 'Report a problem',
  question: 'Ask a question',
  idea: 'Suggest something'
};
export const FB_ASK: Readonly<Record<string, string>> = {
  bug: 'What went wrong?',
  question: 'Your question',
  idea: 'Your suggestion'
};
export const FB_HINT: Readonly<Record<string, string>> = {
  bug: 'What you tapped, what you expected, what happened',
  question: '',
  idea: ''
};

/** Characters in a report, at least and at most; reports a day; megabytes in its one image. */
export const FB_MIN = 10,
  FB_MAX = 1000,
  FB_DAY = 5,
  FB_IMG_MB = 10;

/** Bytes of attached context, under the 20,000 the feedback table refuses past. */
export const FB_CTX_MAX = 15000;

/** The tip on the report sheet that says what the app attaches to a report (fbContext builds it). */
export const FB_WHAT =
  'Attached by the app: the build, your device and browser, screen size, which screen you came from, whether a session was open, sync status, and up to 10 recent errors with where in the app each happened. Never your workouts. It goes to the app owner.';

/* A report's screenshot is written by whoever sent it, through the API as
   well as the app, so the Inbox shows it only when it is a plain base64 JPEG
   from start to end. Checking only the start let a quote end the src and add
   script to the owner's page (found in the r29 review). */
export const FB_SHOT_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
