// The preview build (r24), served under the live app at /preview/ on the same
// site, in one browser with both installed. The live worker lets the preview
// load; each app keeps its own log, undo history, sign-in slot, caches and
// sync table; the same account signs in to both; signing out of the preview
// leaves the live app signed in; the preview offers no Delete my account;
// both open offline; a missing preview table is explained, not silent.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { start, quietHibp } = require('./fake-supabase');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..');
execFileSync('node', [path.join(ROOT, 'scripts', 'build.js')], { stdio: 'ignore' });
execFileSync('node', [path.join(ROOT, 'scripts', 'build.js'), '--preview'], { stdio: 'ignore' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-pv-'));
fs.cpSync(path.join(ROOT, 'dist'), tmp, { recursive: true });
fs.cpSync(path.join(ROOT, 'dist-preview'), path.join(tmp, 'preview'), { recursive: true });

(async () => {
  const fake = await start(tmp);
  for (const f of ['index.html', 'preview/index.html']) {
    const p = path.join(tmp, f); fs.writeFileSync(p, require('./h').cspFix(fs.readFileSync(p, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
  }
  const LIVE = fake.base + '/ironlog/', PV = LIVE + 'preview/';
  fake.addUser('v@example.com', 'pass word 1');
  const rowsOf = (map, email) => { const u = fake.users.get(email); return u ? [...map.values()].filter(r => r.user_id === u.id) : []; };
  const sessIn = rows => { const out = []; for (const r of rows) if (/\/s-\d/.test(r.path)) { try { for (const s of JSON.parse(r.data.json).sessions || []) out.push(s.id); } catch (e) { /* not a session chunk */ } } return out.sort(); };

  // Static files: the preview's own name, icons and scope.
  const man = (d) => JSON.parse(fs.readFileSync(path.join(tmp, d, 'manifest.webmanifest'), 'utf8'));
  ok(man('.').name === 'Ironlog' && man('preview').name === 'Ironlog Preview' && man('preview').short_name === 'Preview', 'the preview installs under its own name');
  ok(!fs.readFileSync(path.join(tmp, 'icons/icon-512.png')).equals(fs.readFileSync(path.join(tmp, 'preview/icons/icon-512.png'))), 'the preview has its own icon');
  const swLive = fs.readFileSync(path.join(tmp, 'sw.js'), 'utf8'), swPv = fs.readFileSync(path.join(tmp, 'preview/sw.js'), 'utf8');
  ok(/const CACHE="ironlog-/.test(swLive) && /const CACHE="ilpreview-/.test(swPv) && !/startsWith\("ironlog-"\)/.test(swPv), 'the two workers name and clear only their own caches');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await quietHibp(ctx);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a);
  const ready = () => page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
  const synced = () => page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).then(() => true, () => false);
  const seed = (id) => ev((id) => { const L = window.__ironlog; L.state.settings.onboarded = true; const R = L.state.routines[0]; L.state.sessions.push({ id, date: '2026-09-25', dayIdx: 0, dayId: R.days[0].id, dayName: 'Chest', routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2 }] }] }); L.invalidate(); L.saveNow(); L.render(); localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1'); }, id);
  const signIn = async () => {
    await ev(() => window.__ironlog.ACT.acctOpen({ dataset: { mode: 'signin' } })); await wait(100);
    await page.fill('#modal [data-abind="email"]', 'v@example.com'); await page.fill('#modal [data-abind="pw"]', 'pass word 1');
    await page.click('#modal [data-act="acctSubmit"]');
    await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 }); await wait(300);
  };
  const openData = () => ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });

  // ---- The live app, installed, with a log, signed in.
  await page.goto(LIVE); await ready();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  ok(await ev(() => window.__ironlog.ENV === 'live' && window.__ironlog.KEY === 'ironlog.v1' && !document.documentElement.dataset.env), 'the live app runs as live, on its usual storage key');
  await seed('live-1');
  await signIn();
  ok(await synced() && sessIn(rowsOf(fake.rows, 'v@example.com')).includes('live-1'), 'live: signed in and the log is in the live table');
  const liveSaved = await ev(() => localStorage.getItem('ironlog.v1'));
  const liveAuth = await ev(() => localStorage.getItem('ironlog.auth'));
  ok(!!liveAuth, 'live: the sign-in is kept in its own slot');

  // ---- The preview, in the same browser, while the live worker is installed.
  await page.goto(PV); await ready(); await wait(500);
  ok(await ev(() => window.__ironlog.ENV === 'preview' && window.__ironlog.KEY === 'ironlog-preview.v1' && document.documentElement.dataset.env === 'preview' && document.title === 'Ironlog Preview'), 'the preview link opens the preview, not the live app its worker would have served');
  ok(await ev(() => !window.__ironlog.state.sessions.some(s => s.id === 'live-1') && !!document.getElementById('obPage')), 'the preview starts with its own empty log and its first-run pages');
  ok(await ev(() => !!document.querySelector('#obPage [data-act="previewCopy"]')), 'its first-run page offers Copy my log from Ironlog');
  ok(await ev(() => !window.__ironlog.acctUser()), 'the preview is not signed in by the live app\'s sign-in');
  await page.waitForFunction(() => navigator.serviceWorker.controller && /\/preview\/sw\.js$/.test(navigator.serviceWorker.controller.scriptURL), null, { timeout: 15000 }).catch(() => {});
  ok(await ev(() => !!navigator.serviceWorker.controller && /\/preview\/sw\.js$/.test(navigator.serviceWorker.controller.scriptURL)), 'the preview runs under its own worker');
  ok(await ev(() => { const t = document.querySelector('.tabs'); return parseFloat(getComputedStyle(t).borderTopWidth) >= 2 && /PREVIEW/.test(getComputedStyle(t, '::before').content); }), 'the preview carries a PREVIEW tag on the tab bar');
  await seed('pv-1');
  const kick = await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); const k = document.querySelector('#view .ph .kick'); return k ? k.textContent : ''; });
  ok(/^Ironlog Preview \d/.test(kick), 'Settings names the preview build (' + kick + ')');
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
  await ev(() => { const L = window.__ironlog; L.snapshot(); L.state.sessions[0].notes = 'undo me'; L.saveNow(); });
  await wait(300);
  ok(await ev(() => localStorage.getItem('ironlog.v1')) === liveSaved, 'the live log in this browser is untouched by the preview');
  ok(await ev(() => /pv-1/.test(localStorage.getItem('ironlog-preview.v1') || '')), 'the preview saves under its own key');
  ok(await ev(async () => { if (!indexedDB.databases) return true; const d = (await indexedDB.databases()).map(x => x.name); return d.includes('ironlog-preview-undo'); }), 'the preview keeps its own undo history');

  // Same account, own table.
  await signIn();
  ok(await synced(), 'the preview signs in with the same account');
  ok(sessIn(rowsOf(fake.rowsPreview, 'v@example.com')).includes('pv-1') && !sessIn(rowsOf(fake.rowsPreview, 'v@example.com')).includes('live-1'), 'the preview syncs to its own table, and does not pull the live log');
  ok(!sessIn(rowsOf(fake.rows, 'v@example.com')).includes('pv-1'), 'nothing from the preview reaches the live table');
  ok(await ev(() => localStorage.getItem('ironlog.auth')) === liveAuth && !!(await ev(() => localStorage.getItem('ironlog-preview.auth'))), 'the preview signs in through its own slot; the live slot is unchanged');
  // r29 (V): Copy my log from Ironlog. With no live copy on this phone (an
  // iPhone keeps the home-screen apps' storage apart) it reads the account's
  // live rows, read-only; the live table is not written.
  const liveRowsBefore = JSON.stringify(rowsOf(fake.rows, 'v@example.com').map(r => [r.path, r.data]));
  const stash = await ev(() => { const v = localStorage.getItem('ironlog.v1'); localStorage.removeItem('ironlog.v1'); return v; });
  await openData();
  ok(await ev(() => !!document.querySelector('#view [data-act="previewCopy"]')), 'Settings > Your data in the preview offers Copy my log from Ironlog');
  await ev(() => window.__ironlog.ACT.previewCopy()); await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm'; }, null, { timeout: 10000 });
  ok(await ev(() => /Replace the preview log/.test(document.getElementById('modal').innerText) && /1 session/.test(document.getElementById('modal').innerText)), 'with a preview log already there it asks first, naming what Ironlog has');
  await page.click('#modal [data-act="mOk"]'); await wait(400);
  ok(await ev(() => { const L = window.__ironlog; return L.state.sessions.some(s => s.id === 'live-1') && !L.state.sessions.some(s => s.id === 'pv-1'); }), 'from the account: the preview now has the real log');
  await page.evaluate(v => localStorage.setItem('ironlog.v1', v), stash);
  await ev(() => window.__ironlog.flush()); await wait(500);
  ok(await synced() && sessIn(rowsOf(fake.rowsPreview, 'v@example.com')).includes('live-1'), 'the copy syncs to the preview table', { pv: sessIn(rowsOf(fake.rowsPreview, 'v@example.com')), cs: await ev(() => window.__ironlog.cloudState()) });
  ok(JSON.stringify(rowsOf(fake.rows, 'v@example.com').map(r => [r.path, r.data])) === liveRowsBefore && await ev(() => localStorage.getItem('ironlog.v1')) === stash, 'the live table and the live log on the phone are unchanged');
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.ui.folds['dash:volume'] = true; L.render(); });
  ok(await ev(() => !!document.getElementById('chRadar') && !/Nothing logged yet/.test(document.querySelector('#view [data-mkey="volume"]').innerText)), 'and the radar draws from it');
  await ev(() => window.__ironlog.ACT.undo()); await wait(400);
  ok(await ev(() => window.__ironlog.state.sessions.some(s => s.id === 'pv-1')), 'Undo puts the preview\'s own log back');
  await openData();
  ok(await ev(() => !!document.querySelector('#acctPanel [data-act="acctSignOut"]') && !document.querySelector('[data-act="acctDelete"]')), 'the preview has Sign out but no Delete my account');
  await page.click('#acctPanel [data-act="acctSignOut"]'); await wait(100);
  await page.click('#modal [data-act="mOk"]'); await wait(800);
  ok(await ev(() => !window.__ironlog.cloudState().on) && await ev(() => localStorage.getItem('ironlog.auth')) === liveAuth, 'signing out of the preview leaves the live app signed in');
  const cacheKeys = await ev(() => caches.keys());
  ok(cacheKeys.some(k => k.startsWith('ironlog-')) && cacheKeys.some(k => k.startsWith('ilpreview-')), 'both apps keep their offline copies side by side (' + cacheKeys.join(', ') + ')');

  // ---- Back to the live app: its log, sign-in and sync as before.
  await page.goto(LIVE); await ready(); await wait(300);
  ok(await ev(() => window.__ironlog.ENV === 'live' && window.__ironlog.state.sessions.some(s => s.id === 'live-1') && !window.__ironlog.state.sessions.some(s => s.id === 'pv-1')), 'the live app shows its own log after the preview was used');
  ok(await synced() && await ev(() => !!window.__ironlog.acctUser()), 'the live app is still signed in and syncing');
  ok((await ev(() => caches.keys())).some(k => k.startsWith('ilpreview-')), 'opening the live app does not remove the preview\'s offline copy');

  // ---- Both open offline.
  await ctx.setOffline(true);
  await page.goto(PV); await ready().catch(() => {});
  ok(await ev(() => window.__ironlog && window.__ironlog.ENV === 'preview').catch(() => false), 'the preview opens offline');
  await page.goto(LIVE); await ready().catch(() => {});
  ok(await ev(() => window.__ironlog && window.__ironlog.ENV === 'live').catch(() => false), 'the live app opens offline');
  await ctx.setOffline(false);

  // ---- The preview table not created yet: a plain message, and the phone keeps the log.
  fake.previewTable(false);
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await quietHibp(ctx2);
  const p2 = await ctx2.newPage();
  await p2.goto(PV); await p2.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
  await p2.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); L.ACT.acctOpen({ dataset: { mode: 'signin' } }); });
  await wait(100);
  await p2.fill('#modal [data-abind="email"]', 'v@example.com'); await p2.fill('#modal [data-abind="pw"]', 'pass word 1');
  await p2.click('#modal [data-act="acctSubmit"]'); await wait(1500);
  const msg = await p2.evaluate(() => { const c = window.__ironlog.cloudState(); return String(c.err || '') + ' ' + document.body.innerText; });
  ok(/Preview sync is not set up yet/.test(msg), 'without the preview table, the preview says sync is not set up yet', msg.slice(0, 300));
  await ctx2.close();

  // Signed out, with the live log on this phone (Android, or one browser): it copies from the phone.
  fake.previewTable(true);
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  const p3 = await ctx3.newPage();
  await p3.goto(LIVE); await p3.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
  await p3.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.sessions.forEach(s => { delete s.demo; }); L.saveNow(); });
  const n3 = await p3.evaluate(() => window.__ironlog.state.sessions.length);
  await p3.goto(PV); await p3.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 }); await wait(300);
  await p3.click('#obPage [data-act="previewCopy"]'); await wait(800);
  const c3 = await p3.evaluate(() => ({ n: window.__ironlog.state.sessions.length, ob: !!document.getElementById('obPage'), toast: document.getElementById('toast').textContent }));
  ok(c3.n === n3 && !c3.ob && /Ironlog is unchanged/.test(c3.toast), 'signed out, it copies the live log kept on this phone, and the first-run pages end', { c3, n3 });
  await ctx3.close();

  ok(!errors.length, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close(); await fake.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
