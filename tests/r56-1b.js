// r56-1b: r56.1's account question (PENDING 328 b) in the standalone build
// against the stand-in Supabase server (tests/fake-supabase.js), as
// tests/r55-1b.js runs its cases: a phone signed out of one account keeping
// its log, then signed in to another, is asked before anything merges, and
// each answer does here, through the real account service (the sign-in
// sheet, the auth callbacks, signOut), what tests/r56-1.js shows it does on
// the mock cloud. Each case fails on a dist built from r56
// (`node tests/r56-1b.js <that folder>`): r56 merged the log into the second
// account at once, unasked. The last two cases are from the stack's review
// (PENDING 333, F2 and F3) and fail on a dist built from the stack as
// reviewed (61f6b03).
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
    // Sign out, keep a copy on this phone (the sheet's second button), or Sign out (its first: the log leaves the phone, the notes are forgotten).
    D.signOutKeep = async (which = 'mAlt') => {
      await page.evaluate(() => window.__ironlog.ACT.acctSignOut()); await wait(300);
      await page.click(`#modal [data-act="${which}"]`);
      await page.waitForFunction(() => !window.__ironlog.acctUser() && !window.__ironlog.cloudState().on, null, { timeout: 15000 }); await wait(400);
    };
    // A second tab of the app on the same phone (its storage shared), as a page of this device.
    D.tab = async () => {
      const p2 = await ctx.newPage();
      p2.on('pageerror', e => errors.push('page error: ' + e.message));
      await p2.goto(APP); await p2.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
      return { page: p2, ev: (f, a) => p2.evaluate(f, a), question: () => p2.evaluate(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? m.title : null; }), cloud: () => p2.evaluate(() => { const L = window.__ironlog; const c = L.cloudState(); return { on: c.on, acct: c.acct, sessions: L.state.sessions.map(s => s.id) }; }) };
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

  // ---- The stack's review (PENDING 333), F2: two tabs of the app on one phone hear one sign-in. One asks; the other waits,
  // then finds the switch made and starts on it, so its answer can never keep aside, under the first account, the log the
  // first tab put in use. On the stack as reviewed both asked, and the second "Use this account's log" put B's empty log
  // aside over A's: a session logged on this phone only was gone.
  {
    fake.addUser('e@example.com', 'correct horse 9'); fake.addUser('f@example.com', 'correct horse 9');
    const P = await device();
    await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, own('own3'));
    await P.signIn('e@example.com');
    await P.signOutKeep();
    await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, { ...own('own4'), date: '2026-10-02' });
    const T = await P.tab(); await wait(800);
    await P.signIn('f@example.com', true); await wait(1500);
    ok((await P.modal()) && (await P.modal()).kind === 'confirm' && !(await T.question()), 'two tabs: signing in to F asks in one tab only; the other waits for it', { tab2: await T.question() });
    await P.page.click('#modal [data-act="mAlt"]');
    await P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(2500);
    // A question still open in the second tab is answered as the first was, as a lifter who sees it would.
    const late = await T.question();
    if (late) { await T.page.click('#modal [data-act="mAlt"]'); await wait(2500); }
    const t2 = await T.cloud(), c1 = await P.cloud();
    ok(!late && t2.acct === c1.acct && !t2.sessions.length && c1.aside.join() === '2', 'the first tab\'s "Use this account\'s log": the second tab is never asked, starts on F\'s log as the first left it, and E\'s log (2 sessions) is kept aside', { t2, c1, late });
    await T.page.close();
    await P.signOutKeep();
    await P.signIn('e@example.com');
    const c = await P.cloud();
    ok(c.sessions.slice().sort().join() === 'own3,own4' && sessIn('e@example.com').includes('own4') && !c.aside.length, 'back in E: the session logged on this phone only is back, on the phone and in the account', { cloud: c, e: sessIn('e@example.com') });
    await P.ctx.close();
  }

  // ---- F3: after "Use this account's log", the menu's Sign out (the log leaves the phone and the notes are forgotten), then
  // the first account again: its log kept aside is taken back, with its notes. On the stack as reviewed it was looked up only
  // while the notes named another account, so it stayed aside for good, and a session logged on this phone only was gone.
  {
    fake.addUser('g@example.com', 'correct horse 9'); fake.addUser('h@example.com', 'correct horse 9');
    const P = await device();
    await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, own('own5'));
    await P.signIn('g@example.com');
    await P.signOutKeep();
    await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, { ...own('own6'), date: '2026-10-02' });
    await P.signIn('h@example.com', true);
    await P.page.click('#modal [data-act="mAlt"]');
    await P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
    await P.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
    await P.signOutKeep('mOk');
    ok(!(await P.cloud()).acct && (await P.cloud()).aside.join() === '2', 'set up: signed out of H with the menu\'s Sign out, the notes forgotten, G\'s log (2 sessions) kept aside', await P.cloud());
    await P.signIn('g@example.com');
    const c = await P.cloud();
    ok(c.sessions.slice().sort().join() === 'own5,own6' && sessIn('g@example.com').includes('own6') && !c.aside.length, 'signing in to G again: its log comes back from aside, the session logged on this phone only with it, on the phone and in the account, and nothing is kept aside', { cloud: c, g: sessIn('g@example.com') });
    await P.ctx.close();
  }

  ok(!errors.length, 'no page errors', errors.slice(0, 5));
  await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
