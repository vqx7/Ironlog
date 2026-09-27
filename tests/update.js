// The update prompt in the standalone app (dist/). Serves one build, lets it
// install, then swaps in a second build the way GitHub Pages would after a
// publish, and checks: the first install shows no prompt; the new version
// downloads in the background and waits; "New version ready" appears without
// the page changing under the lifter; Later hides it; it comes back after a
// relaunch; Reload switches to the new version once, with the session in
// progress intact and the old cache gone. Also checks the privacy line.
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const fails = []; const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
const DIST = path.join(__dirname, '..', 'dist');
execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build.js')], { stdio: 'ignore' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-upd-'));
const V1 = path.join(tmp, 'v1'), V2 = path.join(tmp, 'v2');
fs.cpSync(DIST, V1, { recursive: true }); fs.cpSync(DIST, V2, { recursive: true });
// Build two: a different version string and so a different cache name, as a real publish produces.
const v1 = (fs.readFileSync(path.join(V1, 'index.html'), 'utf8').match(/const APP_VERSION='([^']+)'/) || [])[1];
const v2 = v1 + '-next';
for (const f of ['index.html', 'sw.js']) {
  const p = path.join(V2, f); fs.writeFileSync(p, fs.readFileSync(p, 'utf8').split(v1).join(v2));
}
let root = V1;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p.replace(/^\/ironlog\//, '/'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/ironlog/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Full page loads only: the app's own history entries (Back through tabs) are same-page and do not count.
  let navs = 0; page.on('load', () => { navs++; });
  const ready = () => page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
  const ver = () => page.evaluate(() => (document.documentElement.innerHTML.match(/const APP_VERSION='([^']+)'/) || [])[1]);
  const bar = () => page.evaluate(() => { const b = document.getElementById('updbar'); return !!b && !b.hidden && b.getBoundingClientRect().height > 0; });

  await page.goto(base); await ready();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await page.waitForTimeout(500);
  ok(!(await bar()), 'first install: no update prompt');

  // Privacy line, outside Claude.
  const priv = await page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render();
    document.querySelectorAll('#view details').forEach(d => d.open = true); const p = document.getElementById('privacy'); return p ? { t: p.innerText, tip: (p.querySelector('.tipi') || {}).dataset } : null; });
  ok(priv && /no ads, no tracking/.test(priv.t) && /stays on this device and is sent nowhere unless you sign in/.test(priv.t), 'Settings shows the privacy line for the app: ' + (priv && priv.t));
  ok(priv && priv.tip && /GitHub Pages/.test(priv.tip.tip) && /app owner/.test(priv.tip.tip) && /keep a backup file or an account/.test(priv.tip.tip), 'the privacy tip explains the host, the account option and backups');

  // A session in progress with one logged set.
  await page.evaluate(() => { const L = window.__ironlog; L.makeDemo(); L.ui.tab = 'today'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(150);
  await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await page.waitForTimeout(150);
  await page.click('.rirstrip [data-v="2"]'); await page.waitForTimeout(600);

  // Publish build two; the app checks when it comes back to the foreground.
  root = V2;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(() => { const b = document.getElementById('updbar'); return b && !b.hidden; }, null, { timeout: 15000 }).catch(() => {});
  ok(await bar(), 'after a publish, "New version ready" appears');
  ok((await ver()) === v1, 'the page does not change by itself (still ' + (await ver()) + ')');
  const txt = await page.evaluate(() => document.getElementById('updbar').innerText.replace(/\s+/g, ' '));
  ok(/New version ready/.test(txt) && /Reload/.test(txt) && /Later/.test(txt), 'the bar reads: ' + txt);
  const sizes = await page.evaluate(() => [...document.querySelectorAll('#updbar button')].map(b => Math.round(b.getBoundingClientRect().height)));
  ok(sizes.length === 2 && sizes.every(h => h >= 44), 'both buttons are 44 px tall or more (' + sizes.join(', ') + ')');
  const layout = await page.evaluate(() => { const b = document.getElementById('updbar').getBoundingClientRect(); const h = document.querySelector('header.top').getBoundingClientRect();
    return { below: b.top >= h.bottom - 1, fits: document.documentElement.scrollWidth <= window.innerWidth }; });
  ok(layout.below && layout.fits, 'the bar sits under the header without widening the page');
  await page.evaluate(() => window.scrollTo(0, 2000)); await page.waitForTimeout(100);
  ok(await page.evaluate(() => { const b = document.getElementById('updbar').getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; }), 'the bar stays in view while scrolling');

  await page.click('#updbar [data-act="appUpdateLater"]'); await page.waitForTimeout(100);
  ok(!(await bar()), 'Later hides the bar');

  // A relaunch without tapping Reload: still the old version, and the bar is back.
  await page.reload(); await ready(); await page.waitForTimeout(800);
  ok((await ver()) === v1, 'a relaunch alone does not swap versions mid-use');
  ok(await bar(), 'the bar comes back on the next launch');

  // Reload: one switch to the new version, session intact.
  const navsBefore = navs;
  await page.click('#updbar [data-act="appUpdate"]');
  await page.waitForFunction(v => (document.documentElement.innerHTML.match(/const APP_VERSION='([^']+)'/) || [])[1] === v && window.__ironlog, v2, { timeout: 15000 }).catch(() => {});
  await ready().catch(() => {}); await page.waitForTimeout(1500);
  ok((await ver()) === v2, 'Reload switches to the new version (' + (await ver()) + ')');
  ok(navs - navsBefore === 1, 'it reloads exactly once (' + (navs - navsBefore) + ')');
  ok(!(await bar()), 'no prompt after updating');
  const kept = await page.evaluate(() => { const d = window.__ironlog.state.draft; return !!(d && d.ex[0].sets[0].done && d.ex[0].sets[0].rir === 2); });
  ok(kept, 'the session in progress and its logged set survive the update');
  const caches_ = await page.evaluate(async () => (await caches.keys()).filter(k => k.startsWith('ironlog-')));
  ok(caches_.length === 1 && caches_[0].includes(v2), 'only the new version\'s cache is left (' + caches_.join(', ') + ')');

  // Offline after the update still opens the new version.
  await ctx.setOffline(true);
  await page.reload(); await ready();
  ok((await ver()) === v2, 'offline after the update: the new version opens');
  await ctx.setOffline(false);

  // Inside Claude the line says where the log lives there instead.
  const privC = await page.evaluate(() => { window.claude = { use: () => null }; const L = window.__ironlog; L.ui.tab = 'settings'; L.render();
    document.querySelectorAll('#view details').forEach(d => d.open = true); const t = document.getElementById('privacy').innerText; delete window.claude; L.render(); return t; });
  ok(/stored with your Claude account/.test(privC) && !/sent nowhere/.test(privC), 'inside Claude the privacy line names the Claude account: ' + privC);
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fails.length ? 1 : 0);
})();
