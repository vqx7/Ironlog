// r65: the r63 audit's cleanup, which changes nothing a lifter sees but what
// an error leaves behind (PENDING.md's tracker), each case failing on r64
// unless it says it is a guard (`node tests/r65.js <a dist folder built from
// r64>`; `R65_ONLY=1` runs a section):
//   1  A-12: the built app's start script no longer drops its errors: a
//      service worker that cannot register, or storage the browser will not
//      keep, is written to the app's error log under its own area; an update
//      check that fails offline is expected and logs nothing.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', m); };
const ONLY = process.env.R65_ONLY ? process.env.R65_ONLY.split(',').map(Number) : null;
const run = n => !ONLY || ONLY.includes(n);
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r65-'));
  fs.cpSync(SRC, dir, { recursive: true });
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await H.engine.launch();

  // ---- 1. A-12: the start script's errors. The worker's registration and the storage request are made to fail as a
  // browser can make them fail (a worker script that will not load, a private window's storage).
  if (run(1)) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('The worker script could not be loaded'));
      if (navigator.storage) { navigator.storage.persisted = () => Promise.resolve(false); navigator.storage.persist = () => Promise.reject(new Error('Storage may not be kept')); }
    });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
    await page.waitForTimeout(800);
    const logged = await page.evaluate(() => window.__ironlog.logBuf.map(e => [e.a, e.m]));
    ok(logged.some(([a, m]) => a === 'sw-register' && /could not be loaded/.test(m)), '1. a service worker that cannot register is in the error log, with its reason (r64: dropped)', logged);
    ok(logged.some(([a, m]) => a === 'storage-persist' && /may not be kept/.test(m)), '1. storage the browser will not keep is in the error log, with its reason (r64: dropped)', logged);
    ok(!errors.length, '1. no page errors', errors);
    await ctx.close();
    // A guard: an app that starts as it should logs nothing from its start script.
    const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
    await p2.goto(base); await p2.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await p2.waitForTimeout(800);
    const quiet = await p2.evaluate(() => window.__ironlog.logBuf.map(e => e.a).filter(a => /^sw-|^storage-persist/.test(a)));
    ok(!quiet.length, '1. (a guard) an app that starts as it should logs nothing from its start script', quiet);
    await ctx2.close();
  }

  await browser.close(); server.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
