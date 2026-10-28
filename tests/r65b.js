// r65b: the r63 audit's NEW-3, on the built app against the stand-in Supabase
// server (tests/fake-supabase.js), as tests/r64b.js runs its cases. A phone
// opened with its sign-in expired, whose refresh the server refuses: the
// account library signs the phone out itself, and before r65 nothing said so
// (the phone read "Saved on this phone only" as if never signed in). The case
// fails on r64 (`node tests/r65b.js <a dist folder built from r64>`); the
// others are guards, that only a sign-out the phone did not make says so:
//   N1  opened with an expired sign-in the server refuses: "Sign in again to
//       sync" once, signed out, the log kept;
//   N2  Sign out on this phone: no "Sign in again" (a guard);
//   N3  Sign out in another tab: this tab says nothing either (a guard);
//   N4  a sign-in refused during a sync says it once, not twice (a guard on
//       r64's F10, which also signs the phone out);
//   N5  opened with an expired sign-in whose refresh gets no answer: still
//       signed in, nothing said (a guard);
//   N6  a phone never signed in, reopened: nothing said (a guard).
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./h');
const { start, quietHibp } = require('./fake-supabase');
const { NET_MS } = require('../scripts/config');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r65b-'));
fs.cpSync(SRC, tmp, { recursive: true });
const PW = 'correct horse 9';
const REFRESH = '**/auth/v1/token?grant_type=refresh_token*';
const REFUSE = r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }) });
const AGAIN = /Sign in again to sync/;

(async () => {
  const fake = await start(tmp);
  const ip = path.join(tmp, 'index.html');
  fs.writeFileSync(ip, H.cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
  const APP = fake.base + '/ironlog/';
  const browser = await H.engine.launch();
  // Each case collects its own lines, printed in a fixed order at the end, since the cases run side by side.
  const results = [];
  function report(name) {
    const lines = [];
    results.push({ name, lines });
    return (c, m, x) => lines.push([!!c, m + (c || x === undefined ? '' : ' ' + JSON.stringify(x))]);
  }
  // Every toast a page shows, kept across its reloads in this tab.
  const TOASTS = () => {
    window.__toasts = JSON.parse(sessionStorage.getItem('__toasts') || '[]');
    const hook = () => {
      const el = document.getElementById('toast');
      if (!el) { setTimeout(hook, 20); return; }
      const seen = () => {
        if (el.hidden) return;
        const t = el.innerText.replace(/\s+/g, ' ').trim(), last = window.__toasts[window.__toasts.length - 1];
        if (t && (!last || last.text !== t || Date.now() - last.at > 3000)) { window.__toasts.push({ at: Date.now(), text: t }); sessionStorage.setItem('__toasts', JSON.stringify(window.__toasts)); }
      };
      // A toast already up when the hook finds the element counts too.
      seen();
      new MutationObserver(seen).observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
    };
    hook();
  };
  async function tabOf(ctx) {
    const page = await ctx.newPage();
    const st = { errors: [] };
    page.on('pageerror', e => st.errors.push('page error: ' + e.message));
    await page.goto(APP); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    const D = { ctx, page, st, ev: (f, a) => page.evaluate(f, a) };
    D.toasts = () => page.evaluate(() => window.__toasts || []);
    D.again = since => D.toasts().then(t => t.filter(x => x.at >= since && AGAIN.test(x.text)));
    D.user = () => page.evaluate(() => { const u = window.__ironlog.acctUser(); return u ? u.email : null; });
    D.cloud = () => page.evaluate(() => window.__ironlog.cloudState());
    D.synced = (ms = 15000) => page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: ms }).then(() => true, () => false);
    D.signIn = async email => {
      await page.evaluate(() => window.__ironlog.ACT.acctOpen({ dataset: { mode: 'signin' } }));
      await page.waitForSelector('#modal [data-abind="email"]');
      await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', PW);
      await page.click('#modal [data-act="acctSubmit"]');
      await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: NET_MS + 10000 }).catch(() => {});
    };
    // A weigh-in typed on this phone and saved as a tap saves it.
    D.weigh = id => page.evaluate(id => { const L = window.__ironlog; L.state.bodyweights.push({ id, date: L.today(), kg: 80 }); L.saveNow(); }, id);
    D.has = id => page.evaluate(id => window.__ironlog.state.bodyweights.some(b => b.id === id) && (localStorage.getItem('ironlog.v1') || '').includes(id), id);
    // The phone's sign-in as if it had sat closed past its expiry: the server's token expired, and the phone's record of it says so too.
    D.expire = async email => { fake.expireTokens(email); await page.evaluate(() => { const k = 'ironlog.auth'; const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 10; localStorage.setItem(k, JSON.stringify(s)); }); };
    D.reload = async () => { await page.reload(); await page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); };
    return D;
  }
  async function phone(o = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await quietHibp(ctx);
    await ctx.addInitScript(TOASTS);
    const D = await tabOf(ctx);
    await D.ev(() => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
    D.close = () => H.settle(ctx.close(), 'a context');
    return D;
  }
  // A weigh-in's id for an account (an id keeps to letters, digits and . : - _, or normalize gives it another).
  const wid = email => 'w-' + email.replace(/[^\w]/g, '');
  // A phone signed in and synced, a weigh-in in the account.
  async function signedIn(ok, email) {
    fake.addUser(email, PW);
    const D = await phone();
    await D.signIn(email); await D.synced();
    await D.weigh(wid(email)); await D.ev(() => window.__ironlog.flush()); await D.synced();
    ok((await D.user()) === email, `${email}: signed in and synced`);
    return D;
  }
  const until = async (fn, ms, step = 250) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await wait(step); } };

  // ---- N1: opened with an expired sign-in the server refuses.
  const n1 = (async () => {
    const ok = report('N1: a sign-in the server refuses as the phone opens');
    const D = await signedIn(ok, 'gone@example.com');
    await D.ctx.route(REFRESH, REFUSE);
    await D.expire('gone@example.com');
    const t = Date.now();
    await D.reload();
    const said = await until(async () => (await D.again(t)).length > 0, 15000);
    await wait(3000);
    const all = await D.again(t);
    // What the phone held, for a failure's line: who it reads as signed in, the sign-in and sign-out records, the sync, and the error log's account lines.
    const held = await D.ev(() => { const L = window.__ironlog; return { user: L.acctUser(), auth: !!localStorage.getItem('ironlog.auth'), out: localStorage.getItem('ironlog.auth.out'), cloud: L.cloudState(), log: (L.logBuf || []).filter(e => /auth|sync|cloud/.test(e.a)).slice(-6).map(e => [e.a, String(e.m).slice(0, 160)]) }; });
    ok(said && all.length === 1, 'the phone opened with a sign-in the server refuses: a toast says to sign in again, once (r64: nothing)', { toasts: await D.toasts(), held });
    ok(!(await D.user()), 'and the phone reads signed out, so Sign in shows');
    ok(await D.has(wid('gone@example.com')), 'the log stays on the phone (the weigh-in, in memory and saved)');
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  })();

  // ---- N2: Sign out on this phone says what it always said, nothing more.
  const n2 = (async () => {
    const ok = report('N2: Sign out on this phone (a guard)');
    const D = await signedIn(ok, 'out@example.com');
    const t = Date.now();
    await D.ev(() => window.__ironlog.ACT.acctSignOut({ dataset: {} }));
    await D.page.waitForSelector('#modal [data-act="mOk"]', { timeout: 5000 }).then(() => D.page.click('#modal [data-act="mOk"]')).catch(() => {});
    await until(async () => !(await D.user()), 10000);
    await wait(4000);
    ok(!(await D.user()) && !(await D.again(t)).length, 'signed out here: no "Sign in again"', { toasts: await D.toasts() });
    // Reopened after it: nothing either.
    const t2 = Date.now();
    await D.reload(); await wait(4000);
    ok(!(await D.again(t2)).length, 'and reopened after it: nothing said', { toasts: await D.toasts() });
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  })();

  // ---- N3: Sign out in another tab of the same app.
  const n3 = (async () => {
    const ok = report('N3: Sign out in another tab (a guard)');
    const D = await signedIn(ok, 'twotabs@example.com');
    const B = await tabOf(D.ctx);
    await until(async () => (await B.user()) === 'twotabs@example.com', 10000);
    const t = Date.now();
    await D.ev(() => window.__ironlog.ACT.acctSignOut({ dataset: {} }));
    await D.page.waitForSelector('#modal [data-act="mOk"]', { timeout: 5000 }).then(() => D.page.click('#modal [data-act="mOk"]')).catch(() => {});
    await until(async () => !(await B.user()), 10000);
    await wait(4000);
    ok(!(await B.user()), 'the other tab reads signed out');
    ok(!(await B.again(t)).length && !(await D.again(t)).length, 'neither tab says to sign in again', { a: await D.toasts(), b: await B.toasts() });
    ok(!D.st.errors.length && !B.st.errors.length, 'no page errors', [...D.st.errors, ...B.st.errors].slice(0, 3));
    await D.close();
  })();

  // ---- N4: a sign-in refused during a sync says so once.
  const n4 = (async () => {
    const ok = report('N4: a sign-in refused during a sync, once (a guard on F10)');
    const D = await signedIn(ok, 'mid@example.com');
    fake.expireTokens('mid@example.com');
    await D.ctx.route(REFRESH, REFUSE);
    const t = Date.now();
    await D.weigh('w-mid2'); await D.ev(() => window.__ironlog.flush()).catch(() => {});
    await until(async () => (await D.again(t)).length > 0, 15000);
    await wait(4000);
    ok((await D.again(t)).length === 1, 'the refusal met by a sync: "Sign in again" once, not again as the phone is signed out', { toasts: await D.toasts() });
    ok(await D.has('w-mid2'), 'the weigh-in stays on the phone');
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  })();

  // ---- N5: opened with an expired sign-in whose refresh gets no answer.
  const n5 = (async () => {
    const ok = report('N5: a refresh with no answer as the phone opens (a guard)');
    const D = await signedIn(ok, 'quiet@example.com');
    await D.ctx.route(REFRESH, r => r.abort('failed'));
    await D.expire('quiet@example.com');
    const t = Date.now();
    await D.reload();
    // The library's start waits out the limit for the refresh before it answers who is signed in (r64, F3).
    await until(async () => (await D.user()) === 'quiet@example.com', NET_MS + 15000);
    await wait(3000);
    ok(!(await D.again(t)).length && (await D.user()) === 'quiet@example.com', 'no answer is not a refusal: still signed in, nothing said', { user: await D.user(), toasts: await D.toasts() });
    ok(await D.has(wid('quiet@example.com')), 'the log stays on the phone');
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  })();

  // ---- N6: a phone never signed in.
  const n6 = (async () => {
    const ok = report('N6: a phone never signed in, reopened (a guard)');
    const D = await phone();
    const t = Date.now();
    await D.reload(); await wait(3000);
    ok(!(await D.again(t)).length && !(await D.user()), 'nothing said', await D.toasts());
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  })();

  await Promise.all([n1, n2, n3, n4, n5, n6].map(p => p.catch(e => { results.push({ name: 'a case threw', lines: [[false, String(e && e.stack || e)]] }); })));
  let fails = 0;
  for (const r of results) {
    console.log('# ' + r.name);
    for (const [c, m] of r.lines) { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); }
  }
  await H.settle(browser.close(), 'the browser'); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
