// Shared harness: loads an Ironlog build in Chromium with CDN libs served locally.
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const CHART = fs.readFileSync(path.join(__dirname, '..', 'node_modules/chart.js/dist/chart.umd.js'), 'utf8');
const SORT = fs.readFileSync(path.join(__dirname, '..', 'node_modules/sortablejs/Sortable.min.js'), 'utf8');
const THREE = fs.readFileSync(path.join(__dirname, '..', 'node_modules/three/build/three.module.min.js'), 'utf8');
const FD = path.join(__dirname, '..', 'node_modules/@fontsource');
let FCSS = '';
for (const w of [600, 700, 800]) FCSS += `@font-face{font-family:'Big Shoulders Display';font-weight:${w};src:url(https://fonts.local/bsd-${w}.woff2) format('woff2');}`;
for (const w of [400, 500, 600, 700]) FCSS += `@font-face{font-family:'Hanken Grotesk';font-weight:${w};src:url(https://fonts.local/hg-${w}.woff2) format('woff2');}`;
async function open(file, opts = {}) {
  // IRONLOG_FILE runs the same suites against another build (the standalone dist/index.html).
  if (file === 'index.html' && process.env.IRONLOG_FILE) file = process.env.IRONLOG_FILE;
  const browser = opts.browser || await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: opts.w || 390, height: opts.h || 844 }, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.touch, colorScheme: opts.dark ? 'dark' : 'light' });
  // Most suites were written on the six-day routine installs started with
  // before r29; they keep it. opts.realStarter runs a new install as shipped.
  if (!opts.realStarter) await ctx.addInitScript(`window.IRONLOG_STARTER='onemuscle';`);
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
    if (u.startsWith('file:')) return r.continue();
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
module.exports = { open, cspFix };
