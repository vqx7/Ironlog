/* The values that name and identify the app, each defined once (r49).
   Everything that shows the name, the version or the site reads them from
   here: the screens, the page title and heading (written by scripts/join.js),
   the installed app's manifest and home-screen label (scripts/build.js) and
   the account script's messages. tests/hygiene.js fails when any of them is
   typed anywhere else.

   STORAGE_ID is here too, but it is an identifier, not the name: every
   storage key, cache and backup mark is built from it, and it never changes
   when the name does (see below). */

declare global {
  interface Window {
    IRONLOG_APP?: boolean;
    IRONLOG_ENV?: string;
  }
}

/** The identifier in every storage key, cache name and backup file:
    "ironlog.v1", the undo database, the sign-in slot, the caches, and the
    backup's {app:"ironlog"} mark. NEVER change it, whatever the app is called:
    a phone looks for its log under this exact key, and a different one would
    leave every saved log behind. It is here so it is typed once. */
export const STORAGE_ID = 'ironlog';

/** The app's name, as people see it. */
export const APP_NAME = 'Ironlog';

/** The start of an exported file's name ("ironlog-backup-2026-10-16.json"),
    which a lifter sees in Files, so it follows the name. */
export const FILE_PREFIX = APP_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/** The test build's name and its home-screen label (r24). */
export const PREVIEW_NAME = `${APP_NAME} Preview`;
export const PREVIEW_LABEL = 'Preview';

/** The logo's wordmark (r25): the dumbbell mark is the first letter, the rest
    is set as text. A new name needs a new wordmark, so tests/hygiene.js checks
    the three still spell APP_NAME. `strong` is set in the ink colour at full
    weight, `light` in the muted colour (.ob-logo in the styles). */
export const WORDMARK = { mark: 'I', strong: 'ron', light: 'log' } as const;

/** The version people see (V, 2026-10-16): 2.0 from r49, the minor number up
    by one for each release merged, the major number for a large change. */
export const DISPLAY_VERSION = '2.15';

/** The build: shown beside the version in Diagnostics, problem reports and
    backups, so a report is matched to the exact code; also names the service
    worker's cache. Bump it for every published build (CLAUDE.md, Releasing).
    Problem reports and Copy diagnostics carry it as `build` and the version
    people see as `version`; a backup keeps it under `version`, as every
    build before r49 wrote backups, so old and new backups read the same. */
export const APP_VERSION = '2026.10.26-r61';

/** Version and build together, for Diagnostics and the recovery screen. */
export const VERSION_LINE = `${DISPLAY_VERSION} (build ${APP_VERSION})`;

/** Where the app is published, for the install steps when the page is opened
    from a file (r27); a page on the web reads its own address instead. */
export const SITE_HOST = 'ironapp.org';
export const SITE_DIR_FALLBACK = '/Ironlog';

/* Outside addresses and library versions (r51, from the outside review V
   brought): each is defined here once. The page's library loader and fonts
   read them through scripts/join.js's placeholders, the style sheet's font
   names the same way, scripts/build.js for the installed app's own copies,
   its Content Security Policy and its license list, and the account script
   through the build's placeholders. tests/hygiene.js fails on any of them
   typed anywhere else, and on a version that differs from the one
   package.json pins. */

/** The public CDNs the page falls back to. */
const CDNJS = 'https://cdnjs.cloudflare.com/ajax/libs';
const JSDELIVR = 'https://cdn.jsdelivr.net/npm';
const UNPKG = 'https://unpkg.com';

/** The library versions, as package.json pins them; the installed app ships
    that package's own file. */
export const CHART_VERSION = '4.4.1';
export const SORTABLE_VERSION = '1.15.2';
export const THREE_VERSION = '0.159.0';

/** Where the page loads SortableJS (drag to reorder) and Chart.js from, tried
    in turn; the installed app tries its own copy first (scripts/build.js). */
export const SORTABLE_URLS: readonly string[] = [
  `${CDNJS}/Sortable/${SORTABLE_VERSION}/Sortable.min.js`,
  `${JSDELIVR}/sortablejs@${SORTABLE_VERSION}/Sortable.min.js`
];
export const CHART_URLS: readonly string[] = [
  `${CDNJS}/Chart.js/${CHART_VERSION}/chart.umd.min.js`,
  `${CDNJS}/Chart.js/${CHART_VERSION}/chart.umd.js`,
  `${JSDELIVR}/chart.js@${CHART_VERSION}/dist/chart.umd.js`
];

/** The two typefaces (r20): the display face for headings and big numbers,
    the body face for everything else, and the weights the page uses of each.
    The page asks Google Fonts for them; the installed app ships the same
    weights from the @fontsource packages (scripts/build.js). */
export const FONT_DISPLAY = 'Big Shoulders Display';
export const FONT_DISPLAY_WEIGHTS = '600;700;800';
export const FONT_BODY = 'Hanken Grotesk';
export const FONT_BODY_WEIGHTS = '400;500;600;700';
/** Google Fonts: the style sheet's origin, the font files' origin, and the
    style sheet for the two faces above. */
export const FONTS_ORIGIN = 'https://fonts.googleapis.com';
export const FONT_FILES_ORIGIN = 'https://fonts.gstatic.com';
export const FONTS_CSS = `${FONTS_ORIGIN}/css2?family=${FONT_DISPLAY.replace(/ /g, '+')}:wght@${FONT_DISPLAY_WEIGHTS}&family=${FONT_BODY.replace(/ /g, '+')}:wght@${FONT_BODY_WEIGHTS}&display=swap`;

/** Have I Been Pwned's password range service (r26), which the account
    script asks before an account takes a password; the installed app's
    Content Security Policy allows it. */
export const HIBP_ORIGIN = 'https://api.pwnedpasswords.com';

/** three.js for the 3D body (r20). The installed app ships its own copy and
    loads only that: its Content Security Policy allows script from this site
    alone (scripts/build.js), so the public CDNs, tried after it until r59,
    could never load there and only added failures to the error log. The
    source page loads from the CDNs. This was a text edit in scripts/build.js
    until r49, which broke once the script was bundled. */
const THREE_CDN = [
  `${JSDELIVR}/three@${THREE_VERSION}/build/three.module.min.js`,
  `${UNPKG}/three@${THREE_VERSION}/build/three.module.min.js`
];
/** The addresses map3dLoad tries in turn: the installed app's own copy, or the CDNs. */
export const THREE_URLS: readonly string[] =
  typeof window !== 'undefined' && window.IRONLOG_APP ? ['./vendor/three.module.min.js'] : THREE_CDN;
