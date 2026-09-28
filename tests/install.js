// The install offer in the installable build (dist/): shown only in a
// browser, never once installed; Android/desktop Chrome use the browser's own
// install prompt; an iPhone gets the Share > Add to Home Screen guide for its
// browser; Not now hides it on that device; on Today it sits under the
// account line (item 55); nothing shows in the source file.
const { execFileSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./fake-supabase');
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build.js')], { stdio: 'ignore' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-inst-'));
fs.cpSync(path.join(__dirname, '..', 'dist'), tmp, { recursive: true });
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPHONE_SAFARI_26 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0 Mobile/15E148 Safari/604.1';
(async () => {
  const fake = await start(tmp);
  const html = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(tmp, 'index.html'), html.replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`));
  const APP = fake.base + '/ironlog/';
  const browser = await chromium.launch();
  const all = [];
  async function dev(opts = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block', userAgent: opts.ua });
    if (opts.standalone) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await page.goto(APP); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.render(); });
    await page.waitForTimeout(500);
    const d = { ctx, page, errors, ev: (f, a) => page.evaluate(f, a) }; all.push(d); return d;
  }
  const sheetText = d => d.ev(() => { const m = document.getElementById('modal'); return m && !m.hidden ? m.innerText.replace(/\s+/g, ' ') : ''; });

  // Android or desktop Chrome: the browser's own install prompt.
  const A = await dev();
  ok(!!(await A.ev(() => document.getElementById('installBar'))), 'in a browser: Today offers Install');
  // Item 55: signed out in a browser, the account line comes first and Install second.
  ok(await A.ev(() => { const a = document.getElementById('acctBar'), i = document.getElementById('installBar'), h = document.querySelector('.hero'); return !!a && !!i && a.getBoundingClientRect().bottom <= i.getBoundingClientRect().top + 1 && i.getBoundingClientRect().bottom <= h.getBoundingClientRect().top + 1; }), 'signed out: the account line first, then Install, both above the session card');
  await A.ev(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); });
  await A.page.waitForTimeout(200);
  await A.page.click('#installBar [data-act="install"]'); await A.page.waitForTimeout(300);
  ok((await A.ev(() => window.__prompted)) === 1 && !(await sheetText(A)), 'Install opens the browser\'s own install prompt, once');
  ok(/Installing Ironlog/.test(await A.ev(() => document.getElementById('toast').innerText)), 'accepting says what happens next');
  // No prompt available (Firefox, or already dismissed): menu steps.
  await A.page.click('#installBar [data-act="install"]'); await A.page.waitForTimeout(200);
  ok(/Install app/.test(await sheetText(A)) && /menu/.test(await sheetText(A)), 'without a browser prompt: the menu steps');
  await A.page.click('#modal [data-act="mClose"]');
  // Not now.
  await A.page.click('#installBar [data-act="installLater"]'); await A.page.waitForTimeout(150);
  ok(!(await A.ev(() => document.getElementById('installBar'))) && !!(await A.ev(() => document.getElementById('acctBar'))), 'Not now hides it, and the account line stays');
  await A.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); document.querySelectorAll('#view details').forEach(x => x.open = true); });
  ok(!!(await A.ev(() => document.querySelector('#installPanel [data-act="install"]'))), 'Settings > Your data still offers Install');

  // iPhone Safari: the Share > Add to Home Screen guide.
  const I = await dev({ ua: IPHONE_SAFARI });
  await I.page.click('#installBar [data-act="install"]'); await I.page.waitForTimeout(200);
  let t = await sheetText(I);
  // Item 56: labelled Add to Home Screen, a picture of where Share is, two short steps, the reasons in a tip.
  ok(/^Add to Home Screen/.test(t) && /Share/.test(t) && /bottom/.test(t), 'iPhone Safari: the sheet is titled Add to Home Screen, Share at the bottom', t.slice(0, 160));
  ok(await I.ev(() => document.querySelectorAll('#modal .isteps li').length === 2 && !!document.querySelector('#modal .isteps svg') && !!document.querySelector('#modal svg.ipic[role="img"] .ip-hl')), 'two numbered steps with icons, and a picture with the Share button ringed');
  ok(await I.ev(() => { const tip = document.querySelector('#modal .sheet-h .tipi'); return !!tip && /Apple allows no install button/.test(tip.dataset.tip) && /export a backup here and import it there/.test(tip.dataset.tip); }), 'why there is no install button, and what happens to a browser log, sit in a tip');
  ok(t.length < 260, 'the sheet is short: ' + t.length + ' characters', t);
  ok(await I.ev(() => { const b = document.querySelector('#installBar [data-act="install"]'); return b.textContent === 'Add to Home Screen' && b.getBoundingClientRect().right <= document.documentElement.clientWidth; }), 'the Today button reads Add to Home Screen and fits');
  await I.page.click('#modal [data-act="mClose"]');
  // iOS 26 Safari: Share is behind ⋯ beside the address (the default compact bar).
  const I26 = await dev({ ua: IPHONE_SAFARI_26 });
  await I26.page.click('#installBar [data-act="install"]'); await I26.page.waitForTimeout(200);
  t = await sheetText(I26);
  ok(/⋯/.test(t) && /address/.test(t) && /Share/.test(t) && !/bottom/.test(t), 'iPhone Safari 26: tap ⋯ beside the address, then Share', t.slice(0, 160));
  ok(await I26.ev(() => /⋯ button/.test(document.querySelector('#modal svg.ipic').getAttribute('aria-label'))), 'the picture shows the ⋯ button');
  // A log kept in this browser: one short line says it does not follow the app.
  await I26.page.click('#modal [data-act="mClose"]');
  await I26.ev(() => { const L = window.__ironlog; L.state.sessions.forEach(x => { delete x.demo; }); L.render(); });
  await I26.page.click('#installBar [data-act="install"]'); await I26.page.waitForTimeout(200);
  ok(/does not move by itself/.test(await sheetText(I26)), 'with a real log in this browser, the sheet says it does not move by itself');
  // iPhone Chrome.
  const C = await dev({ ua: IPHONE_CHROME });
  await C.page.click('#installBar [data-act="install"]'); await C.page.waitForTimeout(200);
  t = await sheetText(C);
  ok(/address bar/.test(t) && /Add to Home Screen/.test(t), 'iPhone Chrome: the Share button in the address bar', t.slice(0, 120));
  // Installed: nothing.
  const S = await dev({ ua: IPHONE_SAFARI, standalone: true });
  ok(!(await S.ev(() => document.getElementById('installBar'))), 'installed (home screen): no install offer');
  await S.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); });
  ok(!(await S.ev(() => document.getElementById('installPanel'))), 'installed: none in Settings either');

  // The source file (and the Claude artifact) never offer it.
  const P = await open('index.html', { touch: true, w: 390, h: 844 });
  await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.render(); });
  ok(!(await P.page.evaluate(() => document.getElementById('installBar'))), 'the source file shows no install offer');
  await P.browser.close();

  for (const d of all) ok(!d.errors.length, 'no console errors', d.errors);
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack || e); process.exit(1); });
