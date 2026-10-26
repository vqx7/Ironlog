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
// The page's two faces and their weights come from src/app/config.ts, as the
// page's and the build's do (r51), each served from its @fontsource package,
// named after the face as scripts/build.js names it.
const cfg = require('../scripts/config');
const FACES = [[cfg.FONT_DISPLAY, cfg.FONT_DISPLAY_WEIGHTS], [cfg.FONT_BODY, cfg.FONT_BODY_WEIGHTS]].map(([family, w]) => [family, family.toLowerCase().replace(/ /g, '-'), w.split(';')]);
let FCSS = '';
for (const [family, dir, weights] of FACES) for (const w of weights) FCSS += `@font-face{font-family:'${family}';font-weight:${w};src:url(https://fonts.local/${dir}-${w}.woff2) format('woff2');}`;
const FILE_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.txt': 'text/plain' };
/* What a page of the app may load: the libraries from node_modules, the fonts, its own files, nothing else. */
function serve(r) {
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
  if (u.startsWith(cfg.FONTS_ORIGIN + '/css')) return r.fulfill({ contentType: 'text/css', body: FCSS });
  const m = u.match(/fonts\.local\/([a-z-]+)-(\d+)\.woff2$/); if (m && FACES.some(([, d, ws]) => d === m[1] && ws.includes(m[2]))) return r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(`${FD}/${m[1]}/files/${m[1]}-latin-${m[2]}-normal.woff2`) });
  return r.abort();
}
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
  await page.route('**/*', serve);
  if (opts.setup) await opts.setup(ctx, page);
  await page.goto('file://' + path.resolve(file));
  await page.waitForFunction(() => window.__libs && window.__libs.chart && window.__libs.sortable);
  await page.evaluate(() => document.fonts.ready);
  return { browser, ctx, page, errors };
}
/* A second tab of the same page in the same browser profile as P (open's
   result): the same storage, so a save in one is a storage event in the
   other, as two tabs of the app on one phone. */
async function tab(P, file) {
  if (file === 'index.html' && process.env.IRONLOG_FILE) file = process.env.IRONLOG_FILE;
  const page = await P.ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await page.route('**/*', serve);
  await page.goto('file://' + path.resolve(file));
  await page.waitForFunction(() => window.__libs && window.__libs.chart && window.__libs.sortable);
  return { page, errors };
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
/* A screen as a lifter sees it, to compare two builds (phase 5, r57 on: a
   screen that moves into src/app/ must look exactly as it did). `seed` is a
   script given the page's window.__ironlog as L (the same text on both
   builds, so both read the same log); `prep`, run after the tab is drawn,
   may open or pick things on it (a day, an item, a mode). Every section and
   fold is opened, then the screen is read as a tree: each element with its
   attributes (a class as its set of names; a record id as its place in the
   order first met, since demo data makes ids at random; a field's state,
   which is a property, as p- attributes; a label's id by the text it names;
   a chart's canvas without the size Chart.js gives it), and the text in it,
   lit-html's markers merged away; and the visible text. The build's own
   version line is left out, as it differs by design. Each run of text has
   its spaces collapsed to one and is trimmed, so a space at either end of
   it, as between a date and a tag after it, is not read; `spaces` (r59)
   keeps that one space at an end beside an element laid out inline, and a
   run of spaces alone between two of them, which is where a browser draws
   a space, so a space lost or added between a date and a tag reads as a
   difference (text set to keep its spaces, as pre does, is read the same
   way). */
async function screenOf(file, { browser, seed, tab, env, prep, clock, root, init, spaces }) {
  const Q = await open(file, { browser, clock: clock || '2026-10-24T10:00:00' });
  // A preview build (env), or a script run before the page's own (init, r59: an account service), takes a reload.
  if (env || init) { await Q.page.context().addInitScript(`${env ? `window.IRONLOG_ENV=${JSON.stringify(env)};` : ''}${init || ''}`); await Q.page.reload(); await Q.page.waitForTimeout(300); }
  const out = await Q.page.evaluate(async ([seed, tab, prep, rootId, spaces]) => {
    const L = window.__ironlog; const wait = ms => new Promise(r => setTimeout(r, ms));
    (new Function('L', seed))(L);
    L.ui.tab = tab; L.render(); await wait(120);
    if (prep) { await (new Function('L', 'return (async()=>{' + prep + '})()'))(L); await wait(150); }
    document.querySelectorAll('#view details').forEach(d => { d.open = true; });
    await wait(150);
    // The part of the page read: the tab (#view) unless another is named (r59: the week bar, a sheet).
    const view = document.getElementById(rootId || 'view');
    for (const el of view.querySelectorAll('input,select,textarea,option,details')) {
      if ('value' in el && el.tagName !== 'DETAILS' && el.tagName !== 'OPTION' && el.type !== 'file') el.setAttribute('p-value', el.value);
      if (el.type === 'checkbox') el.setAttribute('p-checked', String(el.checked));
      if (el.tagName === 'OPTION') el.setAttribute('p-selected', String(el.selected));
      if (el.tagName === 'DETAILS') el.setAttribute('p-open', String(el.open));
      if ('disabled' in el) el.setAttribute('p-disabled', String(el.disabled));
    }
    const byId = id => { const e = document.getElementById(id); return e ? e.textContent.trim() : '?'; };
    const ids = new Map(); const idOf = v => { if (!ids.has(v)) ids.set(v, '#' + ids.size); return ids.get(v); };
    const RID = new Set(['data-id', 'data-uid', 'data-did', 'data-sid', 'data-moveto']);
    // An element beside which a space shows: one laid out inline (a space beside a block, or at a block's edge, is not drawn; at an inline element's edge it is).
    const inl = e => !!e && getComputedStyle(e).display.startsWith('inline');
    const kidsOf = n => { const out = []; let txt = '', prev = null;
      const flush = next => {
        let t = txt.replace(/\s+/g, ' ');
        if (!spaces) t = t.trim();
        else { const lead = t.startsWith(' ') && (prev ? inl(prev) : inl(n)), trail = t.endsWith(' ') && (next ? inl(next) : inl(n)); t = t.trim(); t = t ? (lead ? ' ' : '') + t + (trail ? ' ' : '') : lead && trail ? ' ' : ''; }
        if (t) out.push(JSON.stringify(t)); txt = ''; };
      for (const c of n.childNodes) { if (c.nodeType === 3) txt += c.textContent; else if (c.nodeType === 1) { flush(c); out.push(walk(c)); prev = c; } }
      flush(null); return out; };
    const walk = n => {
      const canvas = n.tagName === 'CANVAS';
      const at = [...n.attributes].filter(a => !['value', 'checked', 'selected', 'open', 'disabled'].includes(a.name) && !(a.name === 'class' && !a.value.trim()) && !(a.name === 'id' && /^lt/.test(a.value)) && !(canvas && ['width', 'height', 'style'].includes(a.name)))
        .map(a => a.name === 'aria-labelledby' ? `${a.name}=>${byId(a.value)}` : a.name === 'class' ? `class=${JSON.stringify(a.value.trim().split(/\s+/).sort().join(' '))}` : RID.has(a.name) ? `${a.name}=${idOf(a.value)}` : `${a.name}=${JSON.stringify(a.value)}`).sort();
      return `<${n.tagName.toLowerCase()}${at.length ? ' ' + at.join(' ') : ''}>${canvas ? '' : kidsOf(n).join('')}</${n.tagName.toLowerCase()}>`;
    };
    const ver = t => t.replace(/\d+\.\d+ \(build \d{4}\.\d{2}\.\d{2}-r[\d.]+\)/gi, 'VERSION');
    return { tree: kidsOf(view).map(ver), text: ver(view.innerText.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()) };
  }, [seed, tab, prep || '', root || '', !!spaces]);
  out.errors = Q.errors.slice();
  await Q.page.context().close();
  return out;
}
/* The first place two screens read by screenOf differ, with the text around
   it on each side, or null when they are the same. */
function screenDiff(a, b) {
  const n = Math.max(a.tree.length, b.tree.length);
  for (let i = 0; i < n; i++) if (a.tree[i] !== b.tree[i]) { const x = a.tree[i] || '', y = b.tree[i] || ''; let j = 0; while (j < x.length && x[j] === y[j]) j++; return { at: i, before: x.slice(Math.max(0, j - 160), j + 200), now: y.slice(Math.max(0, j - 160), j + 200) }; }
  return a.text === b.text ? null : { text: true, before: a.text.slice(0, 400), now: b.text.slice(0, 400) };
}
module.exports = { open, tab, cspFix, build, engine, ENGINE, touchDriver, offlineLoad, settle, sourceFiles, sourceTexts, screenOf, screenDiff };
