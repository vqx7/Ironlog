// r66 security (PENDING 378, V 2026-11-01: "ensure no one can ... hack mine or their info or the app").
//   1  A page that frames the app sees no log. GitHub Pages sends no header and a meta Content Security Policy
//      cannot set frame-ancestors, so the app itself refuses to start inside a frame: nothing of the log is drawn,
//      the account is not started, nothing is written to storage, and a short line says to open the app in its own
//      window. The same app opened as a page of its own still draws the log (a guard). Run on the standalone build
//      (dist/), served over http, with the framing page on the app's own origin (so it shares the log's storage and
//      would see it unguarded) and on another origin.
// `node tests/r66s.js <build dir>` runs it on another build (a copy of dist/).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { engine, settle } = require('./h');
const cfg = require('../scripts/config');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
require('./h').build();
const SRC = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'dist');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r66s-'));
fs.cpSync(SRC, DIR, { recursive: true });
// A page on the app's own site that frames the app, and one the other origin serves.
fs.writeFileSync(path.join(DIR, 'framer.html'), '<!doctype html><meta charset="utf-8"><title>framer</title><iframe id="f" src="index.html" width="390" height="700"></iframe>');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };
function server(handler) { const s = http.createServer(handler); return new Promise(r => s.listen(0, '127.0.0.1', () => r(s))); }
const files = (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIR, p.replace(/^\/ironlog\//, '/'));
  if (!f.startsWith(DIR) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
};

(async () => {
  const app = await server(files);
  const base = `http://127.0.0.1:${app.address().port}/ironlog/`;
  // Another origin (localhost, not 127.0.0.1) framing the app.
  const other = await server((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<!doctype html><meta charset="utf-8"><iframe id="f" src="${base}" width="390" height="700"></iframe>`); });
  const otherUrl = `http://localhost:${other.address().port}/`;
  const browser = await engine.launch();

  // ---- 1. A page that frames the app sees no log.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    let page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.userName = 'Framecheck'; L.makeDemo(); L.saveNow(); L.ui.tab = 'history'; L.render(); localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); });
    const names = await page.evaluate(() => { const L = window.__ironlog; return [...new Set(L.state.sessions.flatMap(s => s.ex.map(b => L.exName(b.exId))))].slice(0, 6); });
    const top = await page.evaluate(() => document.getElementById('view').innerText);
    ok(names.length >= 3 && names.some(n => top.includes(n)), 'the app opened on its own draws the log (a guard)', { names, top: top.slice(0, 200) });
    // The app's own tab is closed before the frames open, so what storage holds after is what the frames left. It is
    // read from a page of the site that is not the app (robots.txt), which writes nothing.
    await page.close();
    const store = async () => { const R = await ctx.newPage(); await R.goto(base + 'robots.txt'); const o = await R.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; }); await R.close(); return o; };
    const before = await store();
    ok(Object.keys(before).some(k => k === 'ironlog.v1'), '(the case) the log is in this origin\'s storage');

    for (const [where, url] of [['the app\'s own site', base + 'framer.html'], ['another site', otherUrl]]) {
      const P = await ctx.newPage(); const errs = []; P.on('pageerror', e => errs.push(e.message));
      await P.goto(url); await wait(1500);
      const fr = P.frames().find(f => f !== P.mainFrame() && f.url().startsWith(base));
      if (!fr) { ok(false, `${where}: the frame loaded`); await P.close(); continue; }
      await fr.waitForLoadState('load').catch(() => {}); await wait(500);
      const seen = await fr.evaluate(() => ({ text: document.body.innerText, hook: typeof window.__ironlog, auth: typeof window.ironlogAuth, tabs: !!document.querySelector('#tabs') && getComputedStyle(document.querySelector('#tabs')).display, head: !!document.querySelector('header.top') && getComputedStyle(document.querySelector('header.top')).display, view: (document.getElementById('view') || {}).innerText || '', modal: !!document.getElementById('modal') && !document.getElementById('modal').hidden }));
      ok(!names.some(n => seen.text.includes(n)) && !seen.text.includes('Framecheck') && !/Bench|Squat|Deadlift|kg|lb\b/.test(seen.text), `${where}: the framed app draws none of the log`, seen.text.slice(0, 300));
      ok(new RegExp(cfg.APP_NAME).test(seen.view) && /own window|own tab|inside another/i.test(seen.view) && seen.view.length < 200, `${where}: it says in a short line to open the app in its own window`, seen.view);
      ok(seen.hook === 'undefined' && seen.auth === 'undefined', `${where}: the app and the account do not start in the frame`, { hook: seen.hook, auth: seen.auth });
      ok(seen.tabs === 'none' && seen.head === 'none' && !seen.modal, `${where}: no tabs, header, menu button or sheet to tap through the frame`, seen);
      ok(!errs.length, `${where}: no page errors in the framing page or the frame`, errs);
      await P.close();
    }
    const after = await store();
    ok(JSON.stringify(after) === JSON.stringify(before), 'the framed app wrote nothing to the log\'s storage', Object.keys(after).filter(k => after[k] !== before[k]));
    page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
    ok(await page.evaluate(n => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); return n.some(x => document.getElementById('view').innerText.includes(x)); }, names), 'the app opened on its own again still has its log (a guard)');
    ok(!errors.length, 'no page errors in the app on its own', errors);
    await settle(ctx.close(), 'section 1 context');
  }

  await settle(browser.close(), 'browser'); app.close(); other.close();
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
