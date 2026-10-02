// Breached passwords (r26): the real build against the stand-in Supabase,
// with a stand-in for Have I Been Pwned's range API. A password found in a
// breach is refused at sign-up and when a new password is set, with a plain
// message; a password not found goes through; only the first 5 characters of
// its SHA-1 hash are sent; and when the service cannot be reached, sign-up is
// not blocked.
const { execFileSync } = require('child_process');
const fs = require('fs'); const os = require('os'); const path = require('path'); const crypto = require('crypto');
const { chromium } = require('playwright');
const { start } = require('./fake-supabase');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build.js')], { stdio: 'ignore' });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-hibp-'));
fs.cpSync(path.join(__dirname, '..', 'dist'), tmp, { recursive: true });
const sha = p => crypto.createHash('sha1').update(p).digest('hex').toUpperCase();
const BAD = 'password1234';

(async () => {
  const fake = await start(tmp);
  const ip = path.join(tmp, 'index.html');
  fs.writeFileSync(ip, fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`));
  const browser = await chromium.launch();
  const asked = []; let hibpDown = false;
  async function device() {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await ctx.route('https://api.pwnedpasswords.com/**', r => {
      if (hibpDown) return r.abort();
      const pre = r.request().url().split('/range/')[1]; asked.push({ pre, headers: r.request().headers() });
      // Padded answers: a few endings with count 0, and the bad password's ending when its prefix is asked.
      const b = sha(BAD); let body = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:0\r\nBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB:0';
      if (pre === b.slice(0, 5)) body += '\r\n' + b.slice(5) + ':52314';
      return r.fulfill({ status: 200, contentType: 'text/plain', headers: { 'Access-Control-Allow-Origin': '*' }, body });
    });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(fake.base + '/ironlog/'); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); localStorage.setItem('ironlog.v1.installLater', '1'); });
    return { ctx, page, errors, ev: (f, a) => page.evaluate(f, a) };
  }
  const signup = async (D, email, pw) => {
    await D.ev(() => window.__ironlog.ACT.acctOpen({ dataset: { mode: 'signup' } })); await wait(100);
    await D.page.fill('#modal [data-abind="email"]', email); await D.page.fill('#modal [data-abind="pw"]', pw);
    await D.page.click('#modal [data-act="acctSubmit"]');
    await D.page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 }); await wait(150);
    return D.ev(() => { const m = window.__ironlog.ui.modal; return m ? { mode: m.mode, err: m.err || '' } : null; });
  };
  const D = await device();
  let r = await signup(D, 'a@example.com', BAD);
  ok(r && r.mode === 'signup' && /appeared in a data breach/.test(r.err) && !fake.users.has('a@example.com'), 'a breached password is refused at sign-up, with a plain message, and no account is made', r);
  const a0 = asked[asked.length - 1];
  ok(a0 && a0.pre === sha(BAD).slice(0, 5) && a0.pre.length === 5 && a0.headers['add-padding'] === 'true', 'only the first 5 characters of the password\'s SHA-1 hash are sent, with padding asked for', a0 && a0.pre);
  r = await signup(D, 'a@example.com', 'a strong one 77');
  ok(r && r.mode === 'wait' && fake.users.has('a@example.com'), 'a password not found in a breach goes through to Check your email', r);
  // The service down: sign-up is not blocked.
  hibpDown = true;
  const D2 = await device();
  r = await signup(D2, 'b@example.com', BAD);
  ok(r && r.mode === 'wait' && fake.users.has('b@example.com'), 'when the breach check cannot be reached, sign-up is not blocked', r);
  hibpDown = false;
  // Setting a new password (after a reset link) is checked too.
  fake.confirm('a@example.com');
  const n = await D.ev(async ([bad]) => { try { await window.ironlogAuth.signIn('a@example.com', 'a strong one 77'); await window.ironlogAuth.updatePassword(bad); return 'changed'; } catch (e) { return e.code + ': ' + e.message; } }, [BAD]);
  ok(/^breached: This password has appeared in a data breach/.test(n), 'a breached password is refused as a new password too', n);
  ok(fake.users.get('a@example.com').password === 'a strong one 77', 'and the old password still works');
  ok(!D.errors.length && !D2.errors.length, 'no page errors (' + [...D.errors, ...D2.errors].join(' | ') + ')');
  await browser.close(); await fake.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
