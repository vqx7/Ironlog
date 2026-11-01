/* A library loaded at run time from an address (r59): three.js for the 3D
   body, which only Today's 3D view needs, so it loads the first time 3D is
   opened instead of with the page (THREE_URLS in config.ts: this build's own
   copy first, then the listed CDNs, as ARCHITECTURE.md lists them). The one
   place a module loads code by address; every other import is a module in
   src/app/ or lit-html (tests/hygiene.js). Since r66 also the sign-up bot
   check's script (Cloudflare Turnstile, captcha.ts), which is a classic
   script, not a module, and loads only when config.ts has its key. */

import { log } from './storage';

/** A module loaded by address, with the address it came from (so a caller that finds it is not what it wanted can say which). */
interface Loaded {
  url: string;
  mod: unknown;
}

/** The module at the first address that loads, in order, or null when none does; each address that fails is logged with its own error. */
export async function loadModule(urls: readonly string[]): Promise<Loaded | null> {
  for (const url of urls) {
    try {
      // The cast says what an address can give: a module of no known shape, which the caller checks.
      return { url, mod: await (import(url) as Promise<unknown>) };
    } catch (e) {
      /* Each failure is kept with its address and the browser's own message and stack, not only that 3D did not
         load; the next address is tried. A file that would not fetch reads the same whether it was missing or
         refused (an import is not told the reply's status), but one that fetched and would not run says why. */
      log('load', {
        message: `${url}: ${e instanceof Error ? e.message : String(e)}`,
        stack: e instanceof Error ? e.stack : undefined
      });
    }
  }
  return null;
}

/** Loads a classic script by address and says whether it loaded; a failure is logged with its address (the sign-up bot check's script, captcha.ts). */
export function loadScript(url: string): Promise<boolean> {
  return new Promise(done => {
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.onload = () => done(true);
    s.onerror = () => {
      log('load', { message: `${url}: did not load` });
      s.remove();
      done(false);
    };
    document.head.appendChild(s);
  });
}
