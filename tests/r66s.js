// r66 security (PENDING 378, V 2026-11-01: "ensure no one can ... hack mine or their info or the app").
//   1  A page that frames the app sees no log. GitHub Pages sends no header and a meta Content Security Policy
//      cannot set frame-ancestors, so the app itself refuses to start inside a frame: nothing of the log is drawn,
//      the account is not started, nothing is written to storage, and a short line says to open the app in its own
//      window. The same app opened as a page of its own still draws the log (a guard). Run on the standalone build
//      (dist/), served over http, with the framing page on the app's own origin (so it shares the log's storage and
//      would see it unguarded) and on another origin.
//   2  The sign-up bot check (Cloudflare Turnstile, which Supabase Auth checks when CAPTCHA protection is on), off
//      until V sets TURNSTILE_SITE_KEY in src/app/config.ts. With no key (as shipped): no Turnstile script or frame is
//      asked for, the account sheet has no check, its policy allows no other site, and sign-up and sign-in send no
//      token (guards). With a key (a real build of a copy of the repo with the key typed into config.ts): the policy
//      allows Turnstile's site for script and frames only, the sheet loads the script once, draws the check, and the
//      token it gives reaches sign-up, sign-in and Forgot password, a fresh one each time; before it has one, the sheet
//      says to wait and sends nothing; and against a server with CAPTCHA on, the build with the key signs up while the
//      build without one is refused (why OWNER.md says the app goes first). Turnstile and Supabase are stand-ins
//      (tests/fake-supabase.js); nothing reaches Cloudflare.
// `node tests/r66s.js <build dir>` runs it on another build (a copy of dist/).
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { engine, settle, cspFix } = require('./h');
const { execFileSync } = require('child_process');
const { start: fakeSupabase, quietHibp } = require('./fake-supabase');
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

  // ---- 2. The sign-up bot check.
  {
    const ROOT = path.join(__dirname, '..');
    const KEY = '1x00000000000000000000AA';
    // A build with the key: a copy of the repo's source and scripts, the key typed into its config.ts, joined and built.
    const KB = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r66s-key-'));
    for (const d of ['src', 'scripts', 'assets']) fs.cpSync(path.join(ROOT, d), path.join(KB, d), { recursive: true });
    for (const f of ['supabase.config.json', 'package.json']) fs.copyFileSync(path.join(ROOT, f), path.join(KB, f));
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(KB, 'node_modules'), 'dir');
    const cf = path.join(KB, 'src/app/config.ts'); const ct = fs.readFileSync(cf, 'utf8');
    const keyed = ct.replace(/export const TURNSTILE_SITE_KEY = '';/, `export const TURNSTILE_SITE_KEY = '${KEY}';`);
    ok(keyed !== ct, 'config.ts has TURNSTILE_SITE_KEY, empty as shipped');
    let built = false;
    if (keyed !== ct) {
      try { fs.writeFileSync(cf, keyed); execFileSync(process.execPath, ['scripts/join.js'], { cwd: KB, stdio: 'pipe' }); execFileSync(process.execPath, ['scripts/build.js', '--out', path.join(KB, 'dist')], { cwd: KB, stdio: 'pipe' }); built = true; } catch (e) { ok(false, 'the build with a key builds', String(e.stderr || e).slice(0, 400)); }
    }
    const ORIGIN = cfg.TURNSTILE_ORIGIN;
    const cspOf = h => (h.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
    const dirOf = (c, d) => ((c.split(';').map(x => x.trim()).find(x => x.startsWith(d + ' ')) || '').split(/\s+/).slice(1));
    const plain = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
    ok(!dirOf(cspOf(plain), 'script-src').some(x => /^https?:/.test(x)) && dirOf(cspOf(plain), 'frame-src').join(' ') === "'none'", 'with no key the policy allows script from this site alone and no frame (a guard)', { script: dirOf(cspOf(plain), 'script-src').filter(x => !/sha256/.test(x)), frame: dirOf(cspOf(plain), 'frame-src') });
    if (built) {
      const kh = fs.readFileSync(path.join(KB, 'dist/index.html'), 'utf8');
      const sc = dirOf(cspOf(kh), 'script-src'), fr = dirOf(cspOf(kh), 'frame-src');
      ok(sc.filter(x => /^https?:/.test(x)).join(' ') === ORIGIN && fr.join(' ') === ORIGIN && !dirOf(cspOf(kh), 'connect-src').includes(ORIGIN), 'with a key the policy adds Turnstile\'s site for script and frames, and nothing else', { sc: sc.filter(x => !/sha256/.test(x)), fr });
    }
    // Two copies served beside the stand-in Supabase, one with no key and one with the key, each pointed at it.
    const NO = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r66s-no-'));
    fs.cpSync(SRC, NO, { recursive: true });
    const fake = await fakeSupabase(NO);
    const point = dir => { const ip = path.join(dir, 'index.html'); fs.writeFileSync(ip, cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base)); };
    point(NO);
    if (built) { fs.cpSync(path.join(KB, 'dist'), path.join(NO, 'keyed'), { recursive: true }); point(path.join(NO, 'keyed')); }
    // The stand-in Turnstile: draws a box, and gives a fresh "tok-" token a moment after it is drawn or reset.
    const TS = `(()=>{let n=0;const W=new Map();window.__tsLoads=(window.__tsLoads||0)+1;const give=(id)=>{const w=W.get(id);if(!w)return;setTimeout(()=>{if(W.get(id)===w)w.o.callback('tok-'+(++n));},60);};
      window.turnstile={render(el,o){const id='w'+(++n);const d=document.createElement('div');d.className='ts-stand-in';d.textContent='Verified';el.appendChild(d);W.set(id,{el,o,d});window.__tsRendered=(window.__tsRendered||[]).concat([{key:o.sitekey}]);give(id);return id;},
      reset(id){give(id);},remove(id){const w=W.get(id);if(w){w.d.remove();W.delete(id);}},getResponse(){return undefined;}};})();`;
    const asked = [];
    async function phone(url) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
      await quietHibp(ctx);
      await ctx.route(`${ORIGIN}/**`, r => { asked.push(r.request().url()); r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: TS }); });
      const page = await ctx.newPage(); const errs = [];
      page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errs.push(m.text()); });
      await page.goto(url); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
      await page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); });
      return { ctx, page, errs, ev: (f, a) => page.evaluate(f, a) };
    }
    const openSheet = async (D, mode) => { await D.ev(m => window.__ironlog.ACT.acctOpen({ dataset: { mode: m } }), mode); await wait(150); };
    const submit = async (D, email, pw) => {
      if (email != null) await D.page.fill('#modal [data-abind="email"]', email);
      if (pw != null) await D.page.fill('#modal [data-abind="pw"]', pw);
      await D.page.click('#modal [data-act="acctSubmit"]');
      await D.page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 15000 }); await wait(200);
      return D.ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'account' ? { mode: m.mode, err: m.err || '' } : null; });
    };
    const seenFrom = n => fake.captchaSeen.slice(n);
    // No key, as shipped.
    {
      const D = await phone(fake.base + '/ironlog/');
      await openSheet(D, 'signup');
      const box = await D.ev(() => ({ box: !!document.querySelector('#modal [data-captcha]'), frames: document.querySelectorAll('iframe').length, loads: window.__tsLoads || 0, ts: typeof window.turnstile }));
      ok(!box.box && !box.frames && !box.loads && box.ts === 'undefined', 'no key: the sign-up sheet has no check and loads nothing (a guard)', box);
      const n0 = fake.captchaSeen.length;
      const r = await submit(D, 'nokey@example.com', 'a strong one 66');
      ok(r && r.mode === 'wait' && fake.users.has('nokey@example.com'), 'no key: sign-up goes through to Check your email, as before (a guard)', r);
      const s = seenFrom(n0);
      ok(s.length === 1 && s[0].path === 'signup' && s[0].token === null, 'no key: sign-up sends no token (a guard)', s);
      fake.addUser('in@example.com', 'a strong one 66');
      await D.ev(() => window.__ironlog.ACT.mClose()); await wait(100); await openSheet(D, 'signin');
      const n1 = fake.captchaSeen.length;
      const r2 = await submit(D, 'in@example.com', 'a strong one 66');
      const s2 = seenFrom(n1).filter(x => x.path === 'token');
      ok(r2 === null && s2.length === 1 && s2[0].token === null, 'no key: sign-in goes through and sends no token (a guard)', { r2, s2 });
      ok(!asked.length, 'no key: nothing is asked of Turnstile\'s site (a guard)', asked);
      ok(!D.errs.length, 'no key: no page errors', D.errs);
      await settle(D.ctx.close(), 'no-key phone');
    }
    if (built) {
      const D = await phone(fake.base + '/ironlog/keyed/');
      ok(!asked.length && (await D.ev(() => window.__tsLoads || 0)) === 0, 'with a key: nothing loads until an account sheet opens', asked);
      await openSheet(D, 'signup');
      await D.page.waitForFunction(() => document.querySelector('#modal [data-captcha] .ts-stand-in'), null, { timeout: 5000 }).catch(() => {});
      const st = await D.ev(() => ({ box: !!document.querySelector('#modal [data-captcha] .ts-stand-in'), r: window.__tsRendered || [], loads: window.__tsLoads || 0 }));
      ok(st.box && st.r.length === 1 && st.r[0].key === KEY && st.loads === 1 && asked.length === 1 && asked[0].startsWith(ORIGIN + '/'), 'with a key: the sign-up sheet loads Turnstile\'s script once and draws the check with the key in config', { st, asked });
      // Typing redraws the sheet; the check stays the one drawn.
      await D.page.fill('#modal [data-abind="email"]', 'key@example.com'); await wait(100);
      ok((await D.ev(() => (window.__tsRendered || []).length)) === 1 && (await D.ev(() => !!document.querySelector('#modal [data-captcha] .ts-stand-in'))), 'with a key: typing in the sheet keeps the one check (not drawn again)');
      await wait(200);
      let n0 = fake.captchaSeen.length;
      const r = await submit(D, 'key@example.com', 'a strong one 66');
      let s = seenFrom(n0);
      ok(r && r.mode === 'wait' && s.length === 1 && s[0].path === 'signup' && /^tok-/.test(s[0].token || ''), 'with a key: the check\'s token reaches the sign-up call', { r, s });
      const used = s[0] && s[0].token;
      fake.addUser('keyin@example.com', 'a strong one 66');
      await D.ev(() => window.__ironlog.ACT.mClose()); await wait(100); await openSheet(D, 'signin'); await wait(300);
      n0 = fake.captchaSeen.length;
      const r2 = await submit(D, 'keyin@example.com', 'a strong one 66');
      s = seenFrom(n0).filter(x => x.path === 'token');
      ok(r2 === null && s.length === 1 && /^tok-/.test(s[0].token || '') && s[0].token !== used, 'with a key: a fresh token reaches the sign-in call', { r2, s });
      await openSheet(D, 'signin'); await D.ev(() => window.__ironlog.ACT.acctMode({ dataset: { mode: 'forgot' } })); await wait(300);
      n0 = fake.captchaSeen.length;
      await submit(D, 'keyin@example.com', null);
      s = seenFrom(n0);
      ok(s.length === 1 && s[0].path === 'recover' && /^tok-/.test(s[0].token || ''), 'with a key: Forgot password sends a token too', s);
      ok((await D.ev(() => window.__tsLoads || 0)) === 1 && asked.length === 1, 'with a key: the script loads once however many sheets open', asked.length);
      // Before the check has given a token, the sheet asks to wait for it, and sends nothing.
      await D.ev(() => { if (window.__ironlog.ui.modal) window.__ironlog.ACT.mClose(); }); await wait(50);
      await D.ev(() => { const t = window.turnstile; const r0 = t.render; t.render = (el, o) => r0(el, { ...o, callback() {} }); }); await openSheet(D, 'signup'); await wait(300);
      n0 = fake.captchaSeen.length;
      const r3 = await submit(D, 'early@example.com', 'a strong one 66');
      ok(r3 && r3.mode === 'signup' && /check/i.test(r3.err) && seenFrom(n0).length === 0, 'with a key: before the check passes, the sheet says to wait for it and sends nothing', { r3, sent: seenFrom(n0) });
      ok(!D.errs.length, 'with a key: no page errors', D.errs);
      await settle(D.ctx.close(), 'keyed phone');
      // CAPTCHA on at the server: the build with a key signs up; the build without one is refused (why the app goes first).
      fake.captcha(true);
      const K = await phone(fake.base + '/ironlog/keyed/'); await openSheet(K, 'signup'); await wait(300);
      const rk = await submit(K, 'on1@example.com', 'a strong one 66');
      ok(rk && rk.mode === 'wait' && fake.users.has('on1@example.com'), 'CAPTCHA on: the build with a key signs up', rk);
      // A wrong password, then the right one, in the same sheet: each try takes a fresh token (a used one is refused).
      fake.addUser('on3@example.com', 'a strong one 66');
      await K.ev(() => window.__ironlog.ACT.mClose()); await wait(100); await openSheet(K, 'signin'); await wait(300);
      const w1 = await submit(K, 'on3@example.com', 'not the password'); await wait(300);
      const w2 = await submit(K, null, 'a strong one 66');
      ok(w1 && /Wrong email or password/.test(w1.err) && w2 === null, 'CAPTCHA on: a wrong password and then the right one in the same sheet signs in (a fresh token for each try)', { w1, w2 });
      await settle(K.ctx.close(), 'keyed phone, captcha on');
      const N = await phone(fake.base + '/ironlog/'); await openSheet(N, 'signup');
      const rn = await submit(N, 'on2@example.com', 'a strong one 66');
      ok(rn && rn.mode === 'signup' && rn.err && !fake.users.has('on2@example.com'), 'CAPTCHA on: the build without a key is refused, so the app must have the key first', rn);
      await settle(N.ctx.close(), 'no-key phone, captcha on');
      fake.captcha(false);
    }
    await fake.close();
    fs.rmSync(NO, { recursive: true, force: true }); fs.rmSync(KB, { recursive: true, force: true });
  }

  await settle(browser.close(), 'browser'); app.close(); other.close();
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
