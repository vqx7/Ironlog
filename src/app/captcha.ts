/* The sign-up bot check (r66, PENDING 378, V: "stop bots signing up"):
   Cloudflare Turnstile, which Supabase Auth checks once its CAPTCHA
   protection is on. Off until V sets TURNSTILE_SITE_KEY in config.ts
   (OWNER.md, E1): with it empty this module loads nothing and draws nothing,
   and every account request goes as it did. With a key, the account sheet's
   pages whose requests Supabase checks (sign in, create an account, a reset
   link, and the wait for the confirmation, which signs in and sends new
   codes) carry a box; the first one drawn loads Turnstile's script, once,
   from its own site, and the box gives a token. A token is good for one
   request, so each request takes the one the box has and the box is asked
   for a fresh one. The box shows only when Cloudflare needs a tap. */

import { TURNSTILE_SITE_KEY, TURNSTILE_URL } from './config';
import { loadScript } from './outside';
import { log } from './storage';

/** The options the app gives Turnstile's box: the key, where its token goes, and how it shows. */
interface TurnstileOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': (code?: unknown) => void;
  appearance: 'interaction-only';
  size: 'flexible';
}
/** Turnstile's script's own object (window.turnstile): a box drawn into an element, asked again, or taken away. */
interface Turnstile {
  render(el: HTMLElement, o: TurnstileOptions): string | null | undefined;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    /** Turnstile's script, once loaded (captcha.ts). */
    turnstile?: Turnstile | undefined;
  }
}

/** Whether the bot check is on: config.ts has its key. */
export const captchaOn = (): boolean => !!TURNSTILE_SITE_KEY;

/** The script's load, once asked for: whether it loaded. */
let loading: Promise<boolean> | null = null;
/** The box drawn, and the sheet's element it is in. */
let box: { el: HTMLElement; id: string } | null = null;
/** The token the box gave and no request has used yet. */
let token: string | null = null;
/** Whether the script failed to load for the sheet's element open now (it is tried again for the next sheet). */
let failedFor: HTMLElement | null = null;

/** Takes the box away (its sheet has closed) and forgets its token. */
function drop(): void {
  const b = box;
  box = null;
  token = null;
  if (b && window.turnstile)
    try {
      window.turnstile.remove(b.id);
    } catch (e) {
      log('captcha', e);
    }
}

/** Draws the box into the open account sheet's place for it, once per sheet, loading the script the first time. */
export function captchaMount(): void {
  if (!captchaOn()) return;
  if (box && !box.el.isConnected) drop();
  const el = document.querySelector('#modal [data-captcha]');
  if (!(el instanceof HTMLElement) || (box && box.el === el) || failedFor === el) return;
  if (!loading) loading = loadScript(TURNSTILE_URL);
  const asked = loading;
  asked.then(loaded => {
    const ts = window.turnstile;
    if (!loaded || !ts) {
      // Offline, or the script was blocked: the sheet says so when a request is tried, and the next sheet tries again.
      if (loading === asked) loading = null;
      failedFor = el;
      return;
    }
    if (!el.isConnected || box) return;
    try {
      const id = ts.render(el, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: t => {
          token = t;
        },
        'expired-callback': () => {
          token = null;
        },
        'error-callback': code => {
          token = null;
          log('captcha', { message: `Turnstile error ${String(code)}` });
        },
        appearance: 'interaction-only',
        size: 'flexible'
      });
      if (id) box = { el, id };
    } catch (e) {
      log('captcha', e);
      failedFor = el;
    }
  });
}

/** The token for one account request: undefined when the check is off (the request goes as before), null when it is
    on and has none yet (the sheet says to wait), else the token, which is used up, the box asked for a fresh one. */
export function captchaTake(): string | null | undefined {
  if (!captchaOn()) return undefined;
  if (box && !box.el.isConnected) drop();
  const t = token;
  if (!t) return null;
  token = null;
  const b = box;
  if (b && window.turnstile)
    try {
      window.turnstile.reset(b.id);
    } catch (e) {
      log('captcha', e);
    }
  return t;
}

/** What the sheet says when a request needs the check and it has no token: still working, or it could not load. */
export function captchaWait(): string {
  const el = document.querySelector('#modal [data-captcha]');
  return el && failedFor === el
    ? 'The security check could not load. Check your connection, then close this and try again.'
    : 'Wait a moment for the security check to finish, then try again.';
}
