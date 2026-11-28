// The app's own error log (2.79, SUPABASE.md Part 9) on the built app, its own account code (scripts/cloud-supabase.js)
// and the SQL of Part 9 on a real Postgres engine behind the stand-in server (tests/fake-supabase.js): what is sent
// and in what shape, once a visit, at most ten, held until the account is known, nothing signed out, a hung or a
// failed send holding nothing up, and nothing ever carrying what the lifter typed.
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./h');
const { start, quietHibp } = require('./fake-supabase');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const PW = 'correct horse 9';
// A lone half of a character pair: what a cut through an emoji leaves.
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-errlog-'));
  fs.cpSync(SRC, tmp, { recursive: true });
  const fake = await start(tmp);
  const ip = path.join(tmp, 'index.html');
  fs.writeFileSync(ip, H.cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
  const APP = fake.base + '/ironlog/';
  await fake.recordsOn();
  const browser = await H.engine.launch();
  const pageErrors = [];
  async function device(init) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await quietHibp(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => { if (!/thrown on purpose/.test(e.message)) pageErrors.push(e.message); });
    const ready = () => page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await page.goto(APP); await ready();
    await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
    const D = { ctx, page, ev: (f, a) => page.evaluate(f, a) };
    D.settled = () => page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).then(() => true, () => false);
    D.signIn = async email => {
      await page.click('#saveState'); await wait(250); await page.click('#modal [data-act="acctOpen"][data-mode="signin"]'); await wait(200);
      await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', PW);
      await page.click('#modal [data-act="acctSubmit"]');
      await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
      await D.settled(); await wait(800);
      await page.evaluate(() => { if (window.__ironlog.ui.modal) { const x = document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]'); if (x) x.click(); } });
    };
    D.reload = async () => { await page.reload(); await ready(); await D.settled(); await wait(500); };
    D.err = (area, message, code) => page.evaluate(([a, m, c]) => { const e = new Error(m); if (c) e.code = c; window.__ironlog.log(a, e); }, [area, message, code]);
    return D;
  }
  const sent = () => fake.errors.map(x => x.row);
  const since = n => fake.errors.slice(n).map(x => x.row);

  fake.addUser('err@example.com', PW);
  const A = await device();
  await A.signIn('err@example.com');
  let n0 = fake.errors.length;

  // ---- One error, signed in: its shape, nothing typed in it, and the row never asked back.
  await A.err('import', 'Cannot read "my private note" from jane@example.com at https://example.org/a?token=s3cret#x');
  await wait(800);
  const one = since(n0);
  const r1 = one[0] || {};
  ok(one.length === 1, 'an error thrown with a stack goes to the error log once', one);
  ok(r1.message && /"\.\.\."/.test(r1.message) && !/private|jane|example\.com|s3cret|token/.test(JSON.stringify(r1)), 'what the error quotes, an email address and an address\'s query are not in it', r1);
  ok(r1.version && r1.build && r1.area === 'import' && r1.screen && typeof r1.browser === 'string' && r1.browser.length <= 160 && r1.message.length <= 200 && (r1.stack || '').length <= 400, 'it carries the version, the build, the area, the screen and the browser, within the table\'s sizes', r1);
  const req = fake.errors[n0] || {};
  ok(req.select === null && !/return=representation/.test(req.prefer), 'the row is never asked back', req);
  const fields = Object.keys(r1).sort().join(',');
  ok(fields === 'area,browser,build,message,screen,stack,version', 'only the columns the table opens to the app', fields);
  const rows = await (await fake.recordsOn()).admin('select count(*) as n from public.app_errors');
  ok(Number(rows[0].n) === 1, 'and the account\'s table holds it', rows);

  // ---- The same error again this visit: not sent again. The network's errors, and an entry with no stack, never.
  n0 = fake.errors.length;
  await A.err('import', 'Cannot read "my private note" from jane@example.com at https://example.org/a?token=s3cret#x');
  await A.err('sync-pull', 'no answer in time', 'timeout');
  await A.err('sync-flush', 'Failed to fetch');
  await A.ev(() => window.__ironlog.log('tabs', 'only words, no stack'));
  await wait(800);
  ok(since(n0).length === 0, 'the same error again, the network\'s errors and an entry with no stack are not sent', since(n0));

  // ---- An uncaught error and a rejected promise.
  n0 = fake.errors.length;
  await A.ev(() => { setTimeout(() => { throw new Error('uncaught thrown on purpose'); }); Promise.reject(new Error('rejection thrown on purpose')); });
  await wait(1000);
  const areas = since(n0).map(r => r.area).sort().join(',');
  ok(areas === 'promise,uncaught', 'an uncaught error and a rejected promise are sent', since(n0));

  // ---- At most ten a visit, counted from the page's start (Playwright's blocked service worker logs one of its own as the page loads).
  n0 = fake.errors.length;
  await A.reload();
  for (let i = 0; i < 14; i++) await A.err('engine', 'broke at step ' + i);
  await wait(1200);
  ok(since(n0).length === 10, 'at most ten a visit', since(n0).map(r => r.area + ': ' + r.message));

  // ---- A send that hangs holds nothing up: the next tap answers at once.
  await A.reload();
  fake.errorsHang(true);
  await A.err('engine', 'a send that never answers');
  const t0 = Date.now();
  await A.page.click('button[data-tab="settings"]');
  await A.page.waitForFunction(() => window.__ironlog.ui.tab === 'settings', null, { timeout: 3000 }).catch(() => {});
  ok(Date.now() - t0 < 2500 && (await A.ev(() => window.__ironlog.ui.tab)) === 'settings', 'a send that hangs holds no tap', Date.now() - t0);
  fake.errorsHang(false);

  // ---- A send that fails stops the sends for the visit, and its own failure is kept on the phone, never sent.
  await A.reload();
  fake.errorsFail(true);
  n0 = fake.errors.length;
  await A.err('engine', 'the first after the failure');
  await wait(800);
  await A.err('engine', 'the second after the failure');
  await wait(800);
  fake.errorsFail(false);
  const kept = await A.ev(() => window.__ironlog.logBuf.some(x => x.a === 'errlog'));
  ok(since(n0).length === 1 && kept && !sent().some(r => r.area === 'errlog'), 'a failed send stops the sends for the visit; its failure is kept on the phone and never sent', { sent: since(n0).length, kept });

  // ---- Signed out: nothing.
  const B = await device();
  n0 = fake.errors.length;
  await B.err('engine', 'signed out');
  await wait(800);
  ok(since(n0).length === 0, 'signed out, nothing is sent', since(n0));

  // ---- An error met as the app starts, before it knows the account: held, and sent once it does. A damaged save
  // quotes what was typed in it, an emoji at the cut: none of it is sent, and no half of a character either.
  await A.reload();
  n0 = fake.errors.length;
  const typed = 'my secret note 🏋️ squat day ' + '🏋️'.repeat(120);
  await A.ev(t => { localStorage.setItem('ironlog.v1', '{"sessions":[{"id":"s1","notes":"' + t + '"'); }, typed);
  await A.page.reload();
  await A.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
  await A.settled(); await wait(1500);
  const early = since(n0);
  ok(early.some(r => r.area === 'load'), 'an error met as the app starts is held and sent once the account is known', early);
  ok(!early.some(r => /secret|squat|🏋/.test(JSON.stringify(r)) || LONE.test(r.message) || LONE.test(r.stack)), 'nothing typed in a damaged save is sent, and no half of a character', early);

  ok(pageErrors.length === 0, 'no error on any page', pageErrors.slice(0, 3));
  await browser.close();
  await fake.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
