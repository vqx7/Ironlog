// r49: one source for the app's name, version and address (V, 2026-10-16:
// "don't hardcode", asked many times; "like 2.0 so they don't see there have
// been 48 attempts"). src/app/config.ts defines them once; this suite checks
// that what a lifter sees, and what the installed app is built with, is read
// from it. tests/hygiene.js checks the other half: that no copy is typed
// anywhere else.
//
// On the build before r49 the menu said "Build 2026.10.16-r48", the page had
// no app-build tag, the feedback context carried no version, and Diagnostics
// and the recovery screen showed the build alone, so sections 1 and 2 fail
// there. Section 4 holds the storage identifiers to their exact values: they
// are built from STORAGE_ID now, and a phone finds its log only under them.
const fs = require('fs'); const path = require('path');
const { open, build } = require('./h');
const cfg = require('../scripts/config');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } else console.log('ok  ', m); };
const CLOCK = '2026-10-16T18:00:00';
const ROOT = path.join(__dirname, '..');

(async () => {
  const { engine } = require('./h');
  const browser = await engine.launch();

  // ---- 1. The page names itself and its build from config.
  {
    const P = await open('index.html', { browser, clock: CLOCK, realStarter: true });
    await P.page.waitForSelector('.ob-logo', { timeout: 15000 }).catch(() => {});
    const r = await P.page.evaluate(() => ({
      title: document.title, h1: (document.querySelector('header h1.vh') || {}).textContent,
      build: (document.querySelector('meta[name="app-build"]') || {}).content,
      logoName: (document.querySelector('.ob-logo .vh') || {}).textContent,
      logoText: [...document.querySelectorAll('.ob-logo > span[aria-hidden="true"]')].map(s => s.textContent).join(''),
      app: !!window.IRONLOG_APP,
    }));
    ok(r.title === cfg.APP_NAME, `the page title matches the name in config (${cfg.APP_NAME})`, r);
    ok(r.h1 === cfg.APP_NAME, 'the page heading for screen readers matches it', r.h1);
    ok(r.build === cfg.APP_VERSION, 'the page carries its build in the app-build tag', r.build);
    ok(r.logoName === cfg.APP_NAME, 'the logo names the app for screen readers as config does', r.logoName);
    ok(r.logoText === cfg.WORDMARK.strong + cfg.WORDMARK.light, 'the wordmark beside the dumbbell is the one config defines', r.logoText);
    ok(!P.errors.length, 'no page errors (first page)', P.errors);
    await P.page.context().close().catch(() => {});
  }

  // ---- 2. The version people see is 2.0; the build stays where a report needs it.
  {
    const P = await open('index.html', { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => {
      const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.render();
      document.querySelector('#saveState').click(); L.render();
      const menu = (document.getElementById('modal') || {}).textContent || '';
      L.closeModal && L.closeModal();
      L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const settings = document.getElementById('view').textContent;
      const ctx = L.fbContext({ from: 'menu' });
      const key = L.KEY;
      L.ACT.diagCopy(); const diag = JSON.parse((L.ui.modal || {}).text || '{}'); L.ui.modal = null;
      L.ACT.showBackup(); const backup = JSON.parse((L.ui.modal || {}).text || '{}');
      L.ui.modal = null;
      // A screen that cannot be drawn shows the recovery screen, with the version.
      L.ui.tab = 'dash'; Object.defineProperty(L.state, 'sessions', { configurable: true, get() { throw new Error('boom'); } }); L.render();
      const crash = document.getElementById('view').textContent;
      return { menu, settings, crash, key, backupApp: backup.app, diag: { build: diag.build, version: diag.version }, ctx: { build: ctx.build, version: ctx.version }, three: L.THREE_URLS && L.THREE_URLS[0], app: !!window.IRONLOG_APP };
    });
    ok(r.menu.includes(`Version ${cfg.DISPLAY_VERSION}`), `the menu says Version ${cfg.DISPLAY_VERSION}`, r.menu.slice(-200));
    ok(!r.menu.includes(cfg.APP_VERSION) && !/\br\d{2}\b/.test(r.menu), 'and not the build id or a release number', r.menu.slice(-200));
    ok(r.settings.includes(`Version ${cfg.VERSION_LINE}`), `Diagnostics in Settings says Version ${cfg.VERSION_LINE}, so a report can be matched to the code`, (r.settings.match(/Version [^·]+/) || [])[0]);
    ok(/Something broke/.test(r.crash) && r.crash.includes(`version ${cfg.VERSION_LINE}`), 'the recovery screen says the version and the build', r.crash.slice(-160));
    ok(r.diag.build === cfg.APP_VERSION && r.diag.version === cfg.DISPLAY_VERSION, 'Copy diagnostics carries the build and the version people see, under the same keys as a problem report', r.diag);
    ok(r.ctx.build === cfg.APP_VERSION && r.ctx.version === cfg.DISPLAY_VERSION, 'a problem report carries both the build and the version people see', r.ctx);
    // The installed app tries its own copy of three.js first; a page from a file goes to the CDN.
    ok(r.app ? r.three === './vendor/three.module.min.js' : /^https:\/\//.test(r.three) && r.three === cfg.THREE_URLS[0], r.app ? 'the installed app loads its own copy of three.js first' : 'the source page loads three.js from the CDN', r.three);
    // ---- 4 (on the page). The storage identifiers keep their exact values.
    ok(r.key === 'ironlog.v1', 'the log is still stored under "ironlog.v1"', r.key);
    ok(r.backupApp === 'ironlog', 'a backup is still marked {app:"ironlog"}, so every build can restore it', r.backupApp);
    ok(P.errors.filter(e => !/boom/.test(e)).length === 0, 'no page errors (menu and settings) besides the planted one', P.errors);
    await P.page.context().close().catch(() => {});
  }

  // ---- 3. The installed app and the preview are built with the same values.
  {
    build(false); build(true);
    for (const [dir, name, label] of [['dist', cfg.APP_NAME, cfg.APP_NAME], ['dist-preview', cfg.PREVIEW_NAME, cfg.PREVIEW_LABEL]]) {
      const man = JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'manifest.webmanifest'), 'utf8'));
      const html = fs.readFileSync(path.join(ROOT, dir, 'index.html'), 'utf8');
      ok(man.name === name && man.short_name === label, `${dir}: the manifest names the app ${name}, home-screen label ${label}`, { name: man.name, short: man.short_name });
      ok(html.includes(`<title>${name}</title>`), `${dir}: the page title is ${name}`);
      const cloud = fs.readFileSync(path.join(ROOT, dir, 'cloud.js'), 'utf8');
      ok(!/\{\{\w+\}\}/.test(cloud) && cloud.includes(`Sign in with your ${cfg.APP_NAME} account first.`), `${dir}: the account script has the name from config written in, and no placeholder left`);
      // ---- 4 (in the build). The sign-in slot keeps its exact keys.
      ok(cloud.includes("storageKey: PREVIEW ? 'ironlog-preview.auth' : 'ironlog.auth'"), `${dir}: the sign-in slot is still "ironlog.auth" (preview "ironlog-preview.auth")`);
      ok(html.includes(`<meta name="app-build" content="${cfg.APP_VERSION}">`), `${dir}: the build tag matches config`);
    }
    for (const [dir, prefix] of [['dist', 'ironlog-'], ['dist-preview', 'ilpreview-']]) {
      const sw = fs.readFileSync(path.join(ROOT, dir, 'sw.js'), 'utf8');
      ok(sw.includes(`const CACHE="${prefix}${cfg.APP_VERSION}-`), `${dir}: the service worker's cache is "${prefix}" and the build in config`);
    }
    ok(cfg.STORAGE_ID === 'ironlog', 'the storage id is "ironlog", the key every saved log is under');
  }

  await browser.close().catch(() => {});
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
