// Shared harness: loads an Ironlog build in Chromium (or WebKit) with CDN libs served locally.
/* IRONLOG_BROWSER picks the engine every suite launches: chromium, the
   default, or webkit, the engine of every browser on an iPhone, Safari and
   the home-screen app included. Suites launch through `engine`, never
   playwright's chromium directly, so one setting moves the whole run. */
const ENGINE = process.env.IRONLOG_BROWSER || 'chromium';
if (!['chromium', 'webkit'].includes(ENGINE)) throw new Error(`IRONLOG_BROWSER is chromium or webkit, not ${ENGINE}`);
const engine = require('playwright')[ENGINE];
const path = require('path');
const fs = require('fs');
const CHART = fs.readFileSync(path.join(__dirname, '..', 'node_modules/chart.js/dist/chart.umd.js'), 'utf8');
const SORT = fs.readFileSync(path.join(__dirname, '..', 'node_modules/sortablejs/Sortable.min.js'), 'utf8');
const THREE = fs.readFileSync(path.join(__dirname, '..', 'node_modules/three/build/three.module.min.js'), 'utf8');
const FD = path.join(__dirname, '..', 'node_modules/@fontsource');
let FCSS = '';
for (const w of [600, 700, 800]) FCSS += `@font-face{font-family:'Big Shoulders Display';font-weight:${w};src:url(https://fonts.local/bsd-${w}.woff2) format('woff2');}`;
for (const w of [400, 500, 600, 700]) FCSS += `@font-face{font-family:'Hanken Grotesk';font-weight:${w};src:url(https://fonts.local/hg-${w}.woff2) format('woff2');}`;
const FILE_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.txt': 'text/plain' };
async function open(file, opts = {}) {
  // IRONLOG_FILE runs the same suites against another build (the standalone dist/index.html).
  if (file === 'index.html' && process.env.IRONLOG_FILE) file = process.env.IRONLOG_FILE;
  const browser = opts.browser || await engine.launch();
  const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: opts.h || 844 }, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.touch, colorScheme: opts.dark ? 'dark' : 'light' });
  // Most suites were written on the six-day routine installs started with
  // before r29; they keep it. opts.realStarter runs a new install as shipped.
  if (!opts.realStarter) await ctx.addInitScript(`window.IRONLOG_STARTER='legacy';`);
  if (opts.clock) await ctx.addInitScript(`(()=>{const T=${JSON.stringify(opts.clock)};const R=Date;const off=new R(T).getTime()-R.now();class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`);
  if (opts.state && !opts.stateOnce) await ctx.addInitScript(`localStorage.setItem('ironlog.v1', ${JSON.stringify(JSON.stringify(opts.state))});`);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { errors.push('pageerror: ' + e.message); if (process.env.IL_STACK) console.log(e.stack); });
  // Software WebGL in headless Chromium reports itself as warnings; that is the test machine, not the app.
  page.on('console', m => { const t = m.text(); if ((m.type() === 'error' || m.type() === 'warning') && !t.includes('Failed to load resource') && !/GroupMarkerNotSet|swiftshader|GL Driver Message|WebGL-0x/i.test(t)) errors.push(m.type() + ': ' + t); });
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('Chart.js') || u.includes('chart.js')) return r.fulfill({ contentType: 'application/javascript', body: CHART });
    if (u.includes('Sortable')) return r.fulfill({ contentType: 'application/javascript', body: SORT });
    if (/three(@[\d.]+)?\/build\/three\.module\.min\.js/.test(u)) return r.fulfill({ contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: THREE });
    // What the page made itself (an object URL for a picked screenshot, a data URL) is its own, never another site's.
    if (u.startsWith('blob:') || u.startsWith('data:')) return r.continue();
    /* A page opened from a file has the origin null. Chromium lets it read
       the files beside it; WebKit sends the ones fetched in CORS mode (web
       fonts are) as cross-origin requests and refuses them ("Origin null is
       not allowed by Access-Control-Allow-Origin"). Only a file page meets
       this: the installed app is served from one https origin. So in WebKit
       the build's own files are served from disk with the header, as that
       origin would serve them. */
    if (u.startsWith('file:')) {
      if (ENGINE !== 'webkit' || r.request().isNavigationRequest()) return r.continue();
      let f; try { f = require('url').fileURLToPath(u); } catch (e) { return r.continue(); }
      if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return r.continue();
      return r.fulfill({ contentType: FILE_TYPES[path.extname(f)] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(f) });
    }
    if (u.includes('fonts.googleapis.com/css')) return r.fulfill({ contentType: 'text/css', body: FCSS });
    let m = u.match(/fonts\.local\/bsd-(\d+)/); if (m) return r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(`${FD}/big-shoulders-display/files/big-shoulders-display-latin-${m[1]}-normal.woff2`) });
    m = u.match(/fonts\.local\/hg-(\d+)/); if (m) return r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(`${FD}/hanken-grotesk/files/hanken-grotesk-latin-${m[1]}-normal.woff2`) });
    return r.abort();
  });
  if (opts.setup) await opts.setup(ctx, page);
  await page.goto('file://' + path.resolve(file));
  await page.waitForFunction(() => window.__libs && window.__libs.chart && window.__libs.sortable);
  await page.evaluate(() => document.fonts.ready);
  return { browser, ctx, page, errors };
}
/* A finger on the screen: tp('touchStart' | 'touchMove' | 'touchEnd', x, y),
   in viewport pixels. Chromium takes real touches through its DevTools
   protocol. WebKit's Playwright driver can only tap, so there the touch is
   built the way Playwright builds one for WebKit (document.createTouch, as
   iOS has it) and sent to the element under the first touch, which keeps
   every later move and the end, as a real touch does. On a WebKit page
   SortableJS listens to these touch events, since it never uses pointer
   events in Safari: the path an iPhone takes, where Chromium takes the
   pointer one. */
async function touchDriver(page) {
  if (ENGINE === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    return (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  }
  return (type, x, y) => page.evaluate(([type, x, y]) => {
    if (type === 'touchStart') window.__ilTouch = document.elementFromPoint(x, y) || document.body;
    const target = window.__ilTouch; if (!target) return;
    const se = document.scrollingElement || document.documentElement;
    const t = document.createTouch(window, target, 1, x + se.scrollLeft, y + se.scrollTop, x, y);
    const end = type === 'touchEnd', one = document.createTouchList(t), none = document.createTouchList();
    target.dispatchEvent(new TouchEvent(type.toLowerCase(), { bubbles: true, cancelable: true, composed: true, view: window, touches: end ? none : one, targetTouches: end ? none : one, changedTouches: one }));
    if (end) window.__ilTouch = null;
  }, [type, x, y]);
}
/* A request the network refused while a suite has the browser offline, as
   WebKit reports it from the service worker: "Unhandled Promise Rejection:
   TypeError: Load failed" and "Fetch API cannot load http://...", which
   Playwright hands over as page errors cut at their first colon. The page
   itself saw no rejection (2026-10-14: every unhandledrejection it heard was
   kept and the list was empty). In these suites the stand-in Supabase shares
   the app's origin, so the worker handles its requests; the real Supabase is
   another origin, which the worker never touches. Chromium reports the same
   refused loads as "Failed to load resource", which those suites already
   leave out. Only for a page error heard while the suite has set offline. */
const offlineLoad = msg => ENGINE === 'webkit' && (msg === 'TypeError: Load failed' || /^\/[\d.]+:\d+\//.test(msg));
/* The installed build carries a Content Security Policy that allows each
   inline script by its hash and network calls only to the Supabase project
   (r29). A suite that points a copy of the build at the stand-in Supabase, or
   edits an inline script (a version number), runs this on the edited page so
   the policy matches it, the way scripts/build.js makes it match what ships. */
function cspFix(html, fakeBase) {
  const crypto = require('crypto');
  if (fakeBase) html = html.replace(/https:\/\/[a-z0-9]+\.supabase\.co wss:\/\/[a-z0-9]+\.supabase\.co/, `${fakeBase} ${fakeBase.replace(/^http/, 'ws')}`);
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
  return html.replace(/script-src 'self'( 'sha256-[^']+')+/, `script-src 'self' ${hashes.join(' ')}`);
}
/* The standalone and preview builds. tests/run.js builds both once before
   running suites side by side (r44) and sets IRONLOG_BUILT for its children,
   since scripts/build.js starts by deleting dist/ and a rebuild in one suite
   would pull it from under another. A suite run on its own still builds. */
function build(preview) {
  if (process.env.IRONLOG_BUILT === '1') return;
  require('child_process').execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build.js'), ...(preview ? ['--preview'] : [])], { stdio: 'ignore' });
}
/* Teardown that cannot hold a suite to the runner's 15 minutes: closing a
   context, the browser or a server goes on after `ms` either way, with a line
   saying what did not finish. It is not a check; every check has run by then. */
function settle(p, what, ms = 30000) {
  let t; const late = new Promise(r => { t = setTimeout(() => { console.log(`note ${what} did not finish in ${ms / 1000} s; went on without it`); r(); }, ms); });
  return Promise.race([Promise.resolve(p).catch(() => {}), late]).finally(() => clearTimeout(t));
}
/* The source files as written (r49): the page parts and the typed modules in
   src/app/, at any depth. The page's script is bundled and carries no
   comments, so a check that must see comments reads these. */
function sourceFiles() {
  const root = path.join(__dirname, '..'); const out = [];
  const walk = d => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (/\.(js|ts|html|css)$/.test(e.name)) out.push(r); } };
  walk('src'); return out.sort();
}
function sourceTexts() { return sourceFiles().map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')); }
module.exports = { open, cspFix, build, engine, ENGINE, touchDriver, offlineLoad, settle, sourceFiles, sourceTexts };
