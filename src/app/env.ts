/* Where this copy of the app runs (r57): the home-screen app or a browser
   tab, a touch screen or not, and how this browser installs it. Moved from
   the legacy script with Settings, which reads them; the other screens and
   the account flow import them from here. */

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

/* Every way an installed copy opens is the app, never a tab (2.34: V's Android friend saw "Get the app" inside the
   installed app). Chrome and Safari report display-mode standalone, but an installed web app can also open
   fullscreen or in minimal-ui, or on a computer as window-controls-overlay; Safari has its own flag; and an Android
   app wrapping the site opens it with an android-app:// referrer. Once this browser has installed the app
   (appinstalled, main.ts), its tabs stop offering it too (APP_INSTALLED). */
/** The display modes an installed web app opens in. */
const INSTALLED_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'] as const;
/** Running as an installed app (home screen), not in a browser tab or inside Claude. */
export function isStandalone(): boolean {
  try {
    if (navigator.standalone === true) return true;
    if (INSTALLED_MODES.some(m => window.matchMedia(`(display-mode: ${m})`).matches)) return true;
    return typeof document.referrer === 'string' && document.referrer.startsWith('android-app://');
  } catch (e) {
    // A browser without matchMedia: read as a tab, as before the move.
    return false;
  }
}

/** Whether the screen is a touch screen (a coarse pointer). */
export const coarse = (): boolean => {
  try {
    return window.matchMedia('(pointer:coarse)').matches;
  } catch (e) {
    // A browser without matchMedia: read as no touch screen, as before the move.
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
