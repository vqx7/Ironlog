// r55-1b: r55.1's account cases, in the standalone build against the stand-in
// Supabase server (tests/fake-supabase.js), as tests/r55b.js runs them. Each
// case fails on r55 (`node tests/r55-1b.js <a dist folder built from r55>`)
// unless it says it guards what r55 did:
//   - a phone still signed in to an account deleted on another phone says the
//     account no longer exists, signs out with its sync notes forgotten, and
//     keeps its log, where r55 kept saying the log would sync (V 2026-10-19);
//     an expired sign-in is not read as a deleted account (a guard);
//   - Load demo data while signed in is not done, and says why, so no demo
//     data reaches the account (PENDING 328 d).
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./h');
const { start, quietHibp } = require('./fake-supabase');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r551b-'));
fs.cpSync(SRC, tmp, { recursive: true });

(async () => {
  const fake = await start(tmp);
  const ip = path.join(tmp, 'index.html');
  fs.writeFileSync(ip, H.cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
  const APP = fake.base + '/ironlog/';
  const browser = await H.engine.launch();
  const errors = [];
  async function device() {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await quietHibp(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('page error: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push('console: ' + m.text()); });
    const ready = () => page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await page.goto(APP); await ready();
    await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
    const D = { ctx, page, ev: (f, a) => page.evaluate(f, a) };
    D.toast = () => page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText.replace(/\s+/g, ' ') : null; });
    D.signIn = async email => {
      await page.click('#saveState'); await wait(200); await page.click('#modal [data-act="acctOpen"][data-mode="signin"]'); await wait(200);
      await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', 'correct horse 9');
      await page.click('#modal [data-act="acctSubmit"]');
      await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
      await page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
    };
    return D;
  }
  const docs = (email, pre) => { const u = fake.users.get(email); return u ? [...fake.rows.values()].filter(r => r.user_id === u.id && new RegExp('/' + pre + '-\\d').test(r.path)) : []; };
  const sessIn = email => docs(email, 's').flatMap(r => { try { return (JSON.parse(r.data.json).sessions || []).map(s => (s.demo ? 'demo' : s.id)); } catch (e) { return []; } });

  // ---- An account deleted on one phone, while another is still signed in to it.
  {
    fake.addUser('del@example.com', 'correct horse 9'); fake.deployDelete(true);
    const A = await device(), B = await device();
    await A.signIn('del@example.com'); await B.signIn('del@example.com');
    await A.ev(() => window.__ironlog.ACT.acctDelete()); await wait(200); await A.page.click('#modal [data-act="mOk"]'); await wait(1500);
    await B.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'w9', date: L.today(), kg: 80, demo: false }); L.saveNow(); });
    await B.ev(() => window.__ironlog.flush()).catch(() => {}); await wait(2000);
    const b = await B.ev(() => { const L = window.__ironlog; const c = L.cloudState(); return { on: c.on, acct: c.acct, user: !!L.acctUser(), w: L.state.bodyweights.some(x => x.id === 'w9') }; });
    const t = await B.toast();
    ok(!b.on && !b.acct && !b.user && b.w && /no longer exists/.test(t || '') && /stays on this phone/.test(t || ''), 'the other phone, on its next sync after the account was deleted: it says the account no longer exists and its log stays on the phone, is signed out with its sync notes forgotten, and keeps the weigh-in it just logged (r55 kept saying it would sync)', { b, t });
    await A.ctx.close(); await B.ctx.close();
  }
  // A guard: an expired sign-in is not a deleted account.
  {
    fake.addUser('exp@example.com', 'correct horse 9');
    const C = await device(); await C.signIn('exp@example.com');
    fake.expireTokens();
    await C.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'w8', date: L.today(), kg: 81, demo: false }); L.saveNow(); });
    await C.ev(() => window.__ironlog.flush()).catch(() => {}); await wait(2000);
    const t = await C.toast();
    ok(!/no longer exists/.test(t || ''), 'a guard: a sign-in whose token expired is never told the account no longer exists', { t });
    await C.ctx.close();
  }

  // ---- Load demo data while signed in: it asks to sign out first, and nothing of the demo reaches the account.
  {
    fake.addUser('demo@example.com', 'correct horse 9');
    const D = await device();
    await D.ev(() => { const L = window.__ironlog; L.state.sessions.push({ id: 'own1', date: '2026-10-01', dayIdx: 0, dayId: null, dayName: 'Own', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: 100, r: 5, rir: 2, warm: false, drop: false }] }] }); L.state = L.normalize(L.state); L.saveNow(); });
    await D.signIn('demo@example.com');
    await D.ev(() => window.__ironlog.ACT.demoLoad()); await wait(250);
    const q = { modal: await D.ev(() => !!window.__ironlog.ui.modal), toast: await D.toast() };
    await D.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mOk(); });
    await D.ev(() => window.__ironlog.flush()); await wait(1200);
    const demoHere = await D.ev(() => window.__ironlog.state.sessions.filter(x => x.demo).length);
    const acc = sessIn('demo@example.com');
    ok(!q.modal && /stays off your account/.test(q.toast || '') && demoHere === 0 && !acc.includes('demo') && acc.includes('own1'), 'Load demo data while signed in: it says demo data is for before signing in and stays off the account, and no demo session is loaded or reaches the account (r55 loaded 8 weeks of demo data and uploaded it)', { q, demoHere, acc: acc.length });
    await D.ctx.close();
  }

  ok(!errors.length, 'no page errors', errors.slice(0, 5));
  await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
