/* Where this copy of the app runs (r57): the home-screen app or a browser
   tab, a touch screen or not, and how this browser installs it. Moved from
   the legacy script with Settings, which reads them; the screens still there
   import them back. */

declare global {
  interface Window {
    /** The install prompt the browser offered, kept until the lifter taps Install (Chrome and Edge). */
    __installEvt?: unknown;
  }
  interface Navigator {
    /** Safari's own flag for a page opened from the home screen. */
    standalone?: boolean | undefined;
  }
}

/** Running as an installed app (home screen), not in a browser tab or inside Claude. */
export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
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
  return !!window.IRONLOG_APP && !isStandalone() && !(window.claude && typeof window.claude.use === 'function');
}

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
    return v >= 26 ? 'ios-safari26' : 'ios-safari';
  }
  return 'menu';
}
