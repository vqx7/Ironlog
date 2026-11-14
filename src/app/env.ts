/* Where this copy of the app runs: the home-screen app or a browser
   tab, a touch screen or not, and how this browser installs it, for
   Settings, the other screens and the account flow. */

import { APP_INSTALLED, prefGet } from './storage';

declare global {
  interface Window {
    /** The install prompt the browser offered, kept until the lifter taps Install (Chrome and Edge's beforeinstallprompt event): its prompt, and the choice it resolves to. */
    __installEvt?: { prompt(): unknown; userChoice?: unknown } | null | undefined;
  }
  interface Navigator {
    /** Safari's own flag for a page opened from the home screen. */
    standalone?: boolean | undefined;
  }
}

/* Running as the installed app, read only from what the browser says of this page itself, because the account flow
   (account.ts: where a sign-in link lands, Sign out's wording), sharing, Settings and problem reports all read it.
   Ironlog's manifest opens standalone; a browser that cannot do that falls back to minimal-ui, and an installed copy
   on a computer can draw its own title bar (window-controls-overlay). None of those is ever a browser tab. Two
   signals are not used: fullscreen, which a browser tab also reports in full screen, and an
   android-app:// referrer, which Chrome on Android gives any page another app opens (a link in Gmail), so a tab
   opened from an email would read as the app and sign itself in. Safari has its own flag. Get the app has one more
   reason to stay away (canInstallHere, below): this browser has installed the app (appinstalled, main.ts). */
/** The display modes only an installed copy of Ironlog opens in. */
const INSTALLED_MODES = ['standalone', 'minimal-ui', 'window-controls-overlay'] as const;
/** Running as an installed app (home screen), not in a browser tab or inside Claude. */
export function isStandalone(): boolean {
  try {
    if (navigator.standalone === true) return true;
    return INSTALLED_MODES.some(m => window.matchMedia(`(display-mode: ${m})`).matches);
  } catch (e) {
    // A browser without matchMedia: read as a tab.
    return false;
  }
}

/** Whether the screen is a touch screen (a coarse pointer). */
export const coarse = (): boolean => {
  try {
    return window.matchMedia('(pointer:coarse)').matches;
  } catch (e) {
    // A browser without matchMedia: read as no touch screen.
    return false;
  }
};

/** Whether this page can be installed from here: the built app, in a browser tab, not inside Claude. */
export function canInstallHere(): boolean {
  return (
    !!window.IRONLOG_APP &&
    !isStandalone() &&
    !prefGet(APP_INSTALLED) &&
    !(window.claude && typeof window.claude.use === 'function')
  );
}

/** The Safari version from which iOS shows its compact bar, where Share sits in the ⋯ menu. */
const IOS_COMPACT_BAR = 26;

/** How this browser installs the app: its own prompt, the steps for Safari (26 or before), Chrome or another browser on an iPhone, or a menu. */
export function installKind(): 'prompt' | 'ios-chrome' | 'ios-other' | 'ios-safari26' | 'ios-safari' | 'menu' {
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (window.__installEvt) return 'prompt';
  /* Safari 26 (iOS 26) hides Share behind the ⋯ button beside the address
     in its default compact bar. Its user agent keeps the OS number frozen,
     but Version/ is Safari's own. */
  if (ios) {
    if (/CriOS/.test(ua)) return 'ios-chrome';
    if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return 'ios-other';
    const v = +((ua.match(/Version\/(\d+)/) || [])[1] || 0);
    return v >= IOS_COMPACT_BAR ? 'ios-safari26' : 'ios-safari';
  }
  return 'menu';
}
