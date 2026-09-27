// The standalone app (dist/): builds it, serves it over http on localhost,
// and checks what makes it an installable, offline app: nothing loads from
// other sites, the manifest and icons are valid, the service worker takes
// control, and after going offline the app still opens, logs a set and keeps
// it across a reload.
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const fails = []; const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
const DIST = path.join(__dirname, '..', 'dist');
execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build.js')], { stdio: 'ignore' });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p.replace(/^\/ironlog\//, '/'));
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/ironlog/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const outside = []; ctx.on('request', r => { const u = r.url(); if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
  await page.goto(base); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart && window.__libs.sortable, null, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);
  ok(outside.length === 0, 'nothing is loaded from another site' + (outside.length ? ': ' + outside.slice(0, 3).join(', ') : ''));
  const fontsOk = await page.evaluate(() => document.fonts.check("800 20px 'Big Shoulders Display'") && document.fonts.check("400 16px 'Hanken Grotesk'"));
  ok(fontsOk, 'both fonts load from this site');
  // Manifest and icons.
  const man = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const r = await fetch(l.href); const j = await r.json();
    const icons = await Promise.all(j.icons.map(async i => { const res = await fetch(new URL(i.src, l.href)); const b = await res.blob(); const bm = await createImageBitmap(b); return { sizes: i.sizes, w: bm.width, h: bm.height, purpose: i.purpose, ok: res.ok }; }));
    return { j, icons, apple: !!document.querySelector('link[rel=apple-touch-icon]'), theme: document.querySelector('meta[name=theme-color]').content }; });
  ok(man.j.display === 'standalone' && man.j.start_url === './' && man.j.scope === './' && man.j.name === 'Ironlog', 'manifest: standalone, relative start and scope');
  ok(man.icons.length === 3 && man.icons.every(i => i.ok && i.sizes === `${i.w}x${i.h}`) && man.icons.some(i => i.purpose === 'maskable') && man.icons.some(i => i.w >= 512), 'manifest icons exist and match their sizes, with a maskable one');
  ok(man.apple && man.theme === '#0a0b0d', 'iOS home-screen icon and theme colour set');
  // Service worker.
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller || false, null, { timeout: 15000 }).catch(() => {});
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {}); }
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'the service worker controls the page');
  const cached = await page.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks.find(k => k.startsWith('ironlog-'))); return (await c.keys()).length; });
  ok(cached >= 15, `all app files are cached (${cached})`);
  // Offline.
  await page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
  await ctx.setOffline(true);
  await page.reload(); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
  ok(await page.evaluate(() => !!document.querySelector('.hero') && document.querySelectorAll('#view .sec').length > 2), 'offline: the app opens with its data');
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(150);
  await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await page.waitForTimeout(150);
  await page.click('.rirstrip [data-v="1"]'); await page.waitForTimeout(600);
  await page.reload(); await page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
  const kept = await page.evaluate(() => { const d = window.__ironlog.state.draft; return d && d.ex[0].sets[0].done && d.ex[0].sets[0].rir === 1; });
  ok(kept, 'offline: a set logged offline survives a reload');
  ok(await page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); return !!document.querySelector('canvas'); }), 'offline: charts still draw');
  await ctx.setOffline(false);
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); server.close(); process.exit(fails.length ? 1 : 0);
})();
