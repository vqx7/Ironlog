/* A library loaded at run time from an address (r59): three.js for the 3D
   body, which only Today's 3D view needs, so it loads the first time 3D is
   opened instead of with the page (THREE_URLS in config.ts: this build's own
   copy first, then the listed CDNs, as ARCHITECTURE.md lists them). The one
   place a module loads code by address; every other import is a module in
   src/app/ or lit-html (tests/hygiene.js). */

/** The module at the first address that loads, in order, or null when none does. */
export async function loadModule(urls: readonly string[]): Promise<unknown> {
  for (const url of urls) {
    try {
      // The cast says what an address can give: a module of no known shape, which the caller checks.
      return (await (import(url) as Promise<unknown>)) ?? null;
    } catch (e) {
      // This address did not load (offline, blocked, or gone): the next one is tried.
    }
  }
  return null;
}
