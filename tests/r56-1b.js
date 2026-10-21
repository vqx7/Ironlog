// r56-1b: r56.1's account question (PENDING 328 b) in the standalone build
// against the stand-in Supabase server (tests/fake-supabase.js), as
// tests/r55-1b.js runs its cases: a phone signed out of one account keeping
// its log, then signed in to another, is asked before anything merges, and
// each answer does here, through the real account service (the sign-in
// sheet, the auth callbacks, signOut), what tests/r56-1.js shows it does on
// the mock cloud. Each case fails on a dist built from r56
// (`node tests/r56-1b.js <that folder>`): r56 merged the log into the second
// account at once, unasked.
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./h');
const { start, quietHibp } = require('./fake-supabase');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r561b-'));
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
    D.modal = () => page.evaluate(() => { const m = window.__ironlog.ui.modal; const el = document.querySelector('#modal .sheet'); return m ? { kind: m.kind, title: m.title || '', buttons: el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()) : [] } : null; });
    D.cloud = () => page.evaluate(() => { const L = window.__ironlog; const c = L.cloudState(); return { on: c.on, status: c.status, acct: c.acct, user: L.acctUser() ? L.acctUser().email : null, sessions: L.state.sessions.map(s => s.id), aside: L.asideList().map(a => a.sessions), ob: document.body.classList.contains('obmode') }; });
    // Signs in through the sheet; with ask, waits for the question instead of the sync.
    D.signIn = async (email, ask) => {
      await page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
      await page.evaluate(() => window.__ironlog.ACT.acctOpen({ dataset: { mode: 'signin' } })); await wait(200);
      await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', 'correct horse 9');
      await page.click('#modal [data-act="acctSubmit"]');
      if (ask) { await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm'; }, null, { timeout: 15000 }); await wait(300); return; }
      await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
      await page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
    };
    // Sign out, keep a copy on this phone.
    D.signOutKeep = async () => {
      await page.evaluate(() => window.__ironlog.ACT.acctSignOut()); await wait(300);
      await page.click('#modal [data-act="mAlt"]');
      await page.waitForFunction(() => !window.__ironlog.acctUser() && !window.__ironlog.cloudState().on, null, { timeout: 15000 }); await wait(400);
    };
    return D;
  }
  const docs = (email, pre) => { const u = fake.users.get(email); return u ? [...fake.rows.values()].filter(r => r.user_id === u.id && new RegExp('/' + pre + '-\\d').test(r.path)) : []; };
  const sessIn = email => docs(email, 's').flatMap(r => { try { return (JSON.parse(r.data.json).sessions || []).map(s => s.id); } catch (e) { return []; } });
  const own = id => ({ id, date: '2026-10-01', dayIdx: 0, dayId: null, dayName: 'Own', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: 100, r: 5, rir: 2, warm: false, drop: false }] }] });

  // ---- A phone with account A's log signs in to account B: asked; Cancel; Use this account's log; back to A.
  {
    fake.addUser('a@example.com', 'correct horse 9'); fake.addUser('b@example.com', 'correct horse 9');
    const P = await device();
    await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, own('own1'));
    await P.signIn('a@example.com');
    ok(sessIn('a@example.com').includes('own1') && (await P.cloud()).acct, 'the phone\'s session is in account A after the first sign-in', { a: sessIn('a@example.com'), cloud: await P.cloud() });
    const aId = (await P.cloud()).acct;
    await P.signOutKeep();
    ok(/copy stays on this phone/.test((await P.toast()) || '') && (await P.cloud()).sessions.includes('own1'), 'signed out of A, keeping the log on the phone', { toast: await P.toast() });
    await P.signIn('b@example.com', true);
    let m = await P.modal();
    ok(m && m.kind === 'confirm' && /another account/.test(m.title) && m.buttons.includes('Add it to this account') && m.buttons.includes("Use this account's log") && m.buttons.includes('Cancel'), 'signing in to account B asks: add the log to this account, use this account\'s log, or cancel (r56 merged it into B unasked)', m);
    await P.page.click('#modal [data-act="mClose"]');
    await P.page.waitForFunction(() => !window.__ironlog.acctUser(), null, { timeout: 15000 }).catch(() => {}); await wait(800);
    let c = await P.cloud();
    ok(!c.user && !c.on && c.acct === aId && c.sessions.includes('own1') && !sessIn('b@example.com').length, 'Cancel: signed out again through the account service, the notes still name A, the log untouched, nothing in B', { cloud: c, b: sessIn('b@example.com') });
    await P.signIn('b@example.com', true);
    await P.page.click('#modal [data-act="mAlt"]');
    await P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
    c = await P.cloud();
    ok(c.user === 'b@example.com' && c.on && c.acct !== aId && !c.sessions.length && c.aside.join() === '1' && !sessIn('b@example.com').includes('own1') && c.ob, 'Use this account\'s log: the phone is on B\'s own log (empty, so on the Set up page), A\'s log is kept aside on the phone, and nothing of it reaches B', { cloud: c, b: sessIn('b@example.com') });
    await P.signOutKeep();
    await P.signIn('a@example.com');
    c = await P.cloud();
    ok(c.user === 'a@example.com' && c.on && c.acct === aId && c.sessions.join() === 'own1' && !c.aside.length && sessIn('a@example.com').filter(x => x === 'own1').length === 1, 'signing in to A again: not asked (B\'s log holds nothing), A\'s log and its notes come back from aside and sync as a continuation, one copy of the session in the account', { cloud: c, a: sessIn('a@example.com') });
    await P.ctx.close();
  }

  // ---- Add it to this account: the log merges into the second account as a first link.
  {
    fake.addUser('c@example.com', 'correct horse 9'); fake.addUser('d@example.com', 'correct horse 9');
    const Q = await device();
    await Q.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, own('own2'));
    await Q.signIn('c@example.com');
    await Q.signOutKeep();
    await Q.signIn('d@example.com', true);
    await Q.page.click('#modal [data-act="mOk"]');
    await Q.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
    const c = await Q.cloud();
    ok(c.user === 'd@example.com' && c.on && c.sessions.includes('own2') && sessIn('d@example.com').includes('own2') && sessIn('c@example.com').includes('own2'), 'Add it to this account: the log is in account D as a first link, and still in C', { cloud: c, c: sessIn('c@example.com'), d: sessIn('d@example.com') });
    await Q.ctx.close();
  }

  ok(!errors.length, 'no page errors', errors.slice(0, 5));
  await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
