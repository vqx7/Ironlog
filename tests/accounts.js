// Accounts and cloud sync in the standalone app, end to end: the real build
// (supabase-js plus scripts/cloud-supabase.js) against a stand-in Supabase
// server (tests/fake-supabase.js) that keeps the real table rule, each user
// sees only their own rows. Covers sign-up, the confirmation step, wrong
// password, sign-in merging the phone's existing log, a second device, a
// second person, sign-out (keep or remove), emailed links opened in a
// browser (confirm and password reset), an expired token, and the privacy line.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { start } = require('./fake-supabase');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
execFileSync('node', [path.join(__dirname, '..', 'scripts', 'build.js')], { stdio: 'ignore' });
const DIST = path.join(__dirname, '..', 'dist');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-acct-'));
fs.cpSync(DIST, tmp, { recursive: true });

(async () => {
  const fake = await start(tmp);
  // Point the build at the stand-in server instead of the real project.
  const ip = path.join(tmp, 'index.html');
  const html = fs.readFileSync(ip, 'utf8');
  ok(/window\.IRONLOG_SUPABASE=\{"url":"https:\/\/[a-z0-9]+\.supabase\.co","key":"sb_publishable_/.test(html), 'the build carries the project URL and the publishable key');
  ok(!/service_role|sb_secret_/.test(html + fs.readFileSync(path.join(tmp, 'cloud.js'), 'utf8')), 'no secret key anywhere in the build');
  fs.writeFileSync(ip, html.replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`));
  const APP = fake.base + '/ironlog/';
  const browser = await chromium.launch();
  const devices = [];
  async function device(url, sw, fresh) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: sw ? 'allow' : 'block' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // A refused sign-in shows up as a failed request in the console; that is expected here.
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push(m.text()); });
    await page.goto(url || APP); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    // The install offer has its own suite (tests/install.js); here it is dismissed so the account line shows.
    await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); });
    if (!fresh) await page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
    const d = { ctx, page, errors, ev: (f, a) => page.evaluate(f, a) };
    devices.push(d); return d;
  }
  const logOn = (D, id, w) => D.ev(([id, w]) => { const L = window.__ironlog; const R = L.state.routines[0]; L.state.sessions.push({ id, date: '2026-09-25', dayIdx: 0, dayId: R.days[0].id, dayName: 'Chest', routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w, r: 8, rir: 2 }] }] }); L.invalidate(); L.saveNow(); L.render(); }, [id, w]);
  const openData = D => D.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
  const text = (D, sel) => D.ev(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
  const synced = D => D.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).then(() => true, () => false);
  async function fill(D, mode, email, pw) {
    if (email != null) await D.page.fill('#modal [data-abind="email"]', email);
    if (pw != null) await D.page.fill('#modal [data-abind="pw"]', pw);
    await D.page.click('#modal [data-act="acctSubmit"]');
    await D.page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
    await wait(150);
  }
  const sheet = D => D.ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'account' ? { mode: m.mode, err: m.err || '', text: document.getElementById('modal').innerText.replace(/\s+/g, ' ') } : null; });
  const rowsOf = email => { const u = fake.users.get(email); return u ? [...fake.rows.values()].filter(r => r.user_id === u.id) : []; };
  const sessIn = rows => { const out = []; for (const r of rows) if (/\/s-\d/.test(r.path)) { try { for (const s of JSON.parse(r.data.json).sessions || []) out.push(s.id); } catch (e) { /* not a session chunk */ } } return out.sort(); };

  // ---- 0. First run: the welcome card offers an account up front.
  const W = await device(null, false, true); await wait(600);
  const wel = await text(W, '.welcome');
  ok(wel && /free account/.test(wel) && !!(await W.ev(() => document.querySelector('.welcome [data-act="acctOpen"][data-mode="signin"]') && document.querySelector('.welcome [data-act="acctOpen"][data-mode="signup"]'))), 'first run: Sign in and Create account are offered on the welcome card');
  // Item 55: the offer is the first thing on the card, and Create account is a full button, not small text.
  ok(await W.ev(() => { const w = document.querySelector('.welcome'); const a = w.querySelector('#welcomeAcct'); const u = w.querySelector('[data-bind="unit"]'); const r = w.querySelector('[data-act="obSample"]'); const c = a && a.querySelector('[data-mode="signup"]'); return !!a && a.compareDocumentPosition(u) & 4 && a.compareDocumentPosition(r) & 4 && c.classList.contains('primary') && !c.classList.contains('sm') && c.getBoundingClientRect().height >= 44; }), 'first run: the account offer comes before Units and the routine choices, with a full-size Create account button');
  ok(!(await W.ev(() => document.getElementById('acctBar'))), 'first run: no second prompt on top of the welcome card');

  // ---- 1. Signed out: the phone works as before, and Settings offers an account.
  const A = await device();
  await logOn(A, 'sA1', 100);
  await A.ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await wait(200);
  ok(/Only on this phone/.test((await text(A, '#acctBar')) || ''), 'Today: signed out, a slim line offers to set up sync');
  ok(await A.ev(() => { const b = document.getElementById('acctBar'), h = document.querySelector('.hero'); return !!b && !!h && b.getBoundingClientRect().bottom <= h.getBoundingClientRect().top + 1 && b.getBoundingClientRect().height < 70; }), 'Today: the line sits above the session card and stays slim');
  await A.page.click('#acctBar [data-act="acctLater"]'); await wait(150);
  ok(!(await A.ev(() => document.getElementById('acctBar'))), 'Not now hides it');
  await A.page.reload(); await A.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(800);
  ok(!(await A.ev(() => document.getElementById('acctBar'))), 'and it stays hidden after a relaunch');
  await openData(A);
  ok(await A.ev(() => { const p = document.getElementById('acctPanel'), i = document.getElementById('syncInfo'); return !!p && !!i && (p.compareDocumentPosition(i) & 4) > 0; }), 'Your data: the account panel is at the top');
  ok(/Create account/.test(await text(A, '#acctPanel')) && /Sign in/.test(await text(A, '#acctPanel')), 'signed out: Your data offers Create account and Sign in');
  ok(/stays on this device and is sent nowhere unless you sign in/.test(await text(A, '#privacy')), 'signed out: the privacy line says nothing leaves the phone');
  ok(!(await A.ev(() => window.__ironlog.cloudState().on)) && fake.log.filter(l => l.startsWith('GET /rest') || l.startsWith('POST /rest')).length === 0, 'signed out: no requests to the database');

  // ---- 2. Create an account.
  await A.page.click('#acctPanel [data-act="acctOpen"][data-mode="signup"]'); await wait(100);
  ok((await sheet(A)).mode === 'signup', 'Create account opens the sign-up sheet');
  const ac = await A.ev(() => [...document.querySelectorAll('#modal input')].map(i => i.type + ':' + i.autocomplete).join(' '));
  ok(ac === 'email:email password:new-password', 'fields let the phone fill and save the password (' + ac + ')');
  await fill(A, 'signup', 'v@example.com', 'short');
  ok(/8 or more/.test((await sheet(A)).err) && !fake.users.size, 'a short password is refused before anything is sent');
  await fill(A, 'signup', 'not-an-email', 'longenough1');
  ok(/email address/.test((await sheet(A)).err), 'a bad email is refused');
  await fill(A, 'signup', 'V@Example.com ', 'correct horse 1');
  let sh = await sheet(A);
  ok(sh && sh.mode === 'wait' && /confirmation link to v@example\.com/.test(sh.text) && /signs you in by itself/.test(sh.text), 'sign-up asks to confirm the email, and says the app signs in by itself', sh);
  ok(fake.users.has('v@example.com') && !fake.users.get('v@example.com').confirmed, 'the account exists, unconfirmed (email stored lowercase)');
  // Item 61a: "I have confirmed" before the link was opened says so, and nothing is signed in.
  await A.page.click('#modal [data-act="acctWaitNow"]'); await A.page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return m && !m.busy && m.err; }, null, { timeout: 10000 });
  sh = await sheet(A);
  ok(sh && sh.mode === 'wait' && /Not confirmed yet/.test(sh.err) && !(await A.ev(() => window.__ironlog.acctUser())), 'before the link is opened, "I have confirmed" says not yet', sh);
  ok(await A.ev(() => window.__ironlog.acctWaiting() && !Object.keys(localStorage).some(k => (localStorage.getItem(k) || '').includes('correct horse 1'))), 'while waiting, the password is held in memory only, never stored');
  await A.page.click('#modal [data-act="mClose"]');
  ok(!(await A.ev(() => window.__ironlog.acctWaiting())) && !(await A.ev(() => localStorage.getItem('ironlog.v1.acctWait'))), 'closing the sheet stops waiting and forgets the password');

  // ---- 3. Sign in before confirming, then with a wrong password.
  await A.page.click('#acctPanel [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
  await fill(A, 'signin', 'v@example.com', 'correct horse 1');
  ok(/Confirm your email first/.test((await sheet(A)).err), 'before confirming: told to open the link first');
  fake.confirm('v@example.com');
  await fill(A, 'signin', 'v@example.com', 'wrong password');
  ok(/Wrong email or password/.test((await sheet(A)).err), 'wrong password: plain message');
  ok(!(await A.ev(() => window.__ironlog.cloudState().on)), 'still not syncing after failed sign-ins');

  // ---- 4. Sign in: the log on this phone goes up to the account.
  await fill(A, 'signin', null, 'correct horse 1');
  ok(!(await sheet(A)), 'the sheet closes on success');
  ok(await synced(A), 'signed in: sync runs and finishes');
  ok(sessIn(rowsOf('v@example.com')).join() === 'sA1', 'the phone\'s existing session is now in the account', sessIn(rowsOf('v@example.com')));
  ok(rowsOf('v@example.com').some(r => /\/core$/.test(r.path)), 'routines and settings (core) are in the account too');
  await openData(A);
  ok(/Signed in as v@example\.com/.test(await text(A, '#acctPanel')), 'Your data shows who is signed in');
  ok(/syncs to your Ironlog account\. Only you and the app's owner can see it/.test(await text(A, '#privacy')), 'the privacy line says where the log goes and who can see it');
  ok(/Synced/.test(await A.ev(() => document.getElementById('saveState').getAttribute('aria-label'))), 'the header says Synced');
  ok(/Synced to your account and saved on this device/i.test(await A.ev(() => document.getElementById('view').innerText)) && !/Claude account/i.test(await A.ev(() => document.getElementById('view').innerText)), 'Settings says "your account", never "Claude account", in the installed app');
  await A.ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
  ok(!(await A.ev(() => document.getElementById('acctBar'))), 'signed in: no prompt on Today');

  // ---- 5. A second phone signs in and gets the log; changes flow both ways.
  const B = await device();
  await openData(B);
  await B.page.click('#acctPanel [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
  await fill(B, 'signin', 'v@example.com', 'correct horse 1');
  ok(await synced(B), 'second phone: signed in and synced');
  ok((await B.ev(() => window.__ironlog.state.sessions.map(s => s.id).join())) === 'sA1', 'second phone receives the first phone\'s session');
  await logOn(B, 'sB1', 110); await B.ev(() => window.__ironlog.flush()); await wait(300);
  await A.ev(() => window.__ironlog.sync()); await wait(500);
  ok((await A.ev(() => window.__ironlog.state.sessions.map(s => s.id).sort().join())) === 'sA1,sB1', 'first phone receives the second phone\'s session');
  await A.ev(() => { const L = window.__ironlog; L.state.sessions = L.state.sessions.filter(s => s.id !== 'sA1'); L.invalidate(); L.saveNow(); }); await A.ev(() => window.__ironlog.flush()); await wait(300);
  await B.ev(() => window.__ironlog.sync()); await wait(500);
  ok((await B.ev(() => window.__ironlog.state.sessions.map(s => s.id).join())) === 'sB1', 'a delete on one phone reaches the other');

  // ---- 6. A second person: completely separate.
  const C = await device();
  await logOn(C, 'sC1', 60);
  await openData(C);
  await C.page.click('#acctPanel [data-act="acctOpen"][data-mode="signup"]'); await wait(100);
  await fill(C, 'signup', 'friend@example.com', 'another pass 2');
  fake.confirm('friend@example.com');
  // Item 61a: after opening the link, "I have confirmed" signs in with what was just typed.
  await C.page.click('#modal [data-act="acctWaitNow"]');
  ok(await synced(C), 'second person: signed in and synced');
  ok((await C.ev(() => window.__ironlog.state.sessions.map(s => s.id).join())) === 'sC1', 'second person sees only their own log');
  ok(sessIn(rowsOf('friend@example.com')).join() === 'sC1' && sessIn(rowsOf('v@example.com')).join() === 'sB1', 'the database keeps the two accounts apart');
  // The database itself refuses cross-account reads: the stand-in applies the real table rule.
  const cross = await C.ev(async ([base, key]) => {
    const t = JSON.parse(localStorage.getItem('ironlog.auth')).access_token;
    const r = await fetch(base + '/rest/v1/docs?select=path', { headers: { apikey: key, Authorization: 'Bearer ' + t } });
    return (await r.json()).map(x => x.path);
  }, [fake.base, 'x']);
  ok(cross.length > 0 && cross.every(p => p.includes(fake.users.get('friend@example.com').id)), 'a signed-in person can list only their own documents');

  // ---- 7. Sign out: keep a copy, or remove it from the phone.
  await openData(B);
  await B.page.click('#acctPanel [data-act="acctSignOut"]'); await wait(100);
  ok(/Keep a copy on this phone/.test(await text(B, '#modal')), 'sign-out asks whether to keep a copy on the phone');
  await B.page.click('#modal [data-act="mOk"]'); await wait(800);
  ok(!(await B.ev(() => window.__ironlog.cloudState().on)) && (await B.ev(() => window.__ironlog.state.sessions.map(s => s.id).join())) === 'sB1', 'keep: signed out, the log stays on the phone');
  ok(/Create account/.test(await text(B, '#acctPanel')), 'keep: Your data offers sign-in again');
  await logOn(B, 'sB-local', 90); await wait(1500);
  ok(!sessIn(rowsOf('v@example.com')).includes('sB-local'), 'after signing out, nothing more is sent');
  await openData(C);
  await C.page.click('#acctPanel [data-act="acctSignOut"]'); await wait(100);
  await C.page.click('#modal [data-act="mAlt"]'); await wait(1000);
  ok((await C.ev(() => window.__ironlog.state.sessions.length)) === 0 && !(await C.ev(() => window.__ironlog.cloudState().on)), 'remove: signed out and the log is gone from the phone');
  ok(sessIn(rowsOf('friend@example.com')).join() === 'sC1', 'remove: the account still holds the log');
  // Signing back in on that phone brings it back.
  await openData(C);
  await C.page.click('#acctPanel [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
  await fill(C, 'signin', 'friend@example.com', 'another pass 2');
  ok(await synced(C) && (await C.ev(() => window.__ironlog.state.sessions.map(s => s.id).join())) === 'sC1', 'signing back in restores the log from the account');
  // A different account on a phone that held another person's log starts over as a merge, never a continuation.
  ok((await C.ev(() => window.__ironlog.cloudState().acct)) === fake.users.get('friend@example.com').id, 'sync notes are tied to the signed-in account');

  // ---- 8. A confirmation link opened in the browser (not the app) must not upload that browser's data.
  const sess = await (await fetch(fake.base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'v@example.com', password: 'correct horse 1' }) })).json();
  const D = await device();
  await logOn(D, 'junk-in-safari', 20);
  const before = sessIn(rowsOf('v@example.com')).join();
  const frag = `#access_token=${sess.access_token}&expires_at=${sess.expires_at}&expires_in=3600&refresh_token=${sess.refresh_token}&token_type=bearer&type=signup`;
  await D.page.goto(fake.base + '/ironlog/index.html' + frag); await D.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(1500);
  sh = await sheet(D);
  // Item 61b: the confirming browser asks where Ironlog is used, and syncs nothing until answered.
  ok(sh && sh.mode === 'where' && /Email confirmed/i.test(sh.text) && /Where do you use Ironlog\?/.test(sh.text) && /home-screen app/.test(sh.text) && /Here in this browser/.test(sh.text), 'confirmation link in a browser: says it worked and asks where Ironlog is used', sh);
  ok(!(await D.ev(() => window.__ironlog.cloudState().on)), 'nothing syncs in that browser before the answer');
  await D.page.click('#modal [data-act="acctWhere"][data-v="app"]'); await wait(600);
  sh = await sheet(D);
  ok(sh && /Switch back to the app/.test(sh.text) && /signs in by itself/.test(sh.text), '"The home-screen app": says to switch back, where it signs in by itself', sh);
  ok(!(await D.ev(() => window.__ironlog.cloudState().on)) && !(await D.ev(() => window.__ironlog.acctUser())), 'that browser is signed out again and not syncing');
  ok(sessIn(rowsOf('v@example.com')).join() === before, 'nothing that browser held was uploaded', sessIn(rowsOf('v@example.com')));
  ok(!(await D.ev(() => location.hash)), 'the tokens are cleared from the address bar');

  // ---- 8b. Item 61a: the app waiting on "Check your email" signs itself in when it comes back to the front.
  const W2 = await device();
  await logOn(W2, 'sW2', 70);
  await openData(W2);
  await W2.page.click('#acctPanel [data-act="acctOpen"][data-mode="signup"]'); await wait(100);
  await fill(W2, 'signup', 'auto@example.com', 'auto pass 12');
  ok((await sheet(W2) || {}).mode === 'wait' && await W2.ev(() => window.__ironlog.acctWaiting() && !!localStorage.getItem('ironlog.v1.acctWait')), 'after sign-up the app waits (a marker without the password is kept)');
  await W2.ev(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(700);
  sh = await sheet(W2);
  ok(sh && sh.mode === 'wait' && !sh.err && !(await W2.ev(() => window.__ironlog.acctUser())), 'back to the front before the link: still waiting, quietly', sh);
  fake.confirm('auto@example.com');
  await wait(3200);
  await W2.ev(() => document.dispatchEvent(new Event('visibilitychange')));
  ok(await synced(W2), 'the link opened (elsewhere), back to the app: signed in and syncing without typing anything');
  ok(!(await sheet(W2)) && !(await W2.ev(() => window.__ironlog.acctWaiting())) && !(await W2.ev(() => localStorage.getItem('ironlog.v1.acctWait'))), 'the sheet closes, the password is forgotten and the marker removed');
  ok(sessIn(rowsOf('auto@example.com')).join() === 'sW2', 'the phone\'s log is in the new account', sessIn(rowsOf('auto@example.com')));
  ok(/Email confirmed\. Signed in/.test(await W2.ev(() => document.getElementById('toast').innerText)), 'and it says so');

  // ---- 8c. "Here in this browser": that browser stays signed in and syncs its log.
  const tok = async email => (await (await fetch(fake.base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'auto pass 12' }) })).json());
  const linkOf = t => `${fake.base}/ironlog/index.html#access_token=${t.access_token}&expires_at=${t.expires_at}&expires_in=3600&refresh_token=${t.refresh_token}&token_type=bearer&type=signup`;
  const D2 = await device();
  await logOn(D2, 'sD2-here', 75);
  await D2.page.goto(linkOf(await tok('auto@example.com'))); await D2.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(1200);
  await D2.page.click('#modal [data-act="acctWhere"][data-v="here"]');
  ok(await synced(D2) && !(await sheet(D2)), '"Here in this browser": signed in and syncing');
  ok(sessIn(rowsOf('auto@example.com')).includes('sD2-here'), 'that browser\'s log joins the account', sessIn(rowsOf('auto@example.com')));
  // Closing the question without answering is the safe choice: signed out, nothing sent.
  const D3 = await device();
  await logOn(D3, 'sD3-closed', 76);
  await D3.page.goto(linkOf(await tok('auto@example.com'))); await D3.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(1200);
  await D3.page.click('#modal [data-act="mClose"]'); await wait(600);
  ok(!(await D3.ev(() => window.__ironlog.acctUser())) && !(await D3.ev(() => window.__ironlog.cloudState().on)) && !sessIn(rowsOf('auto@example.com')).includes('sD3-closed'), 'no answer: that browser is signed out and nothing is sent');
  // The link opened in the same storage the app waits in (Android shares it): no question, signed in there.
  const D4 = await device();
  await D4.ev(() => localStorage.setItem('ironlog.v1.acctWait', JSON.stringify({ t: Date.now() })));
  await D4.page.goto(linkOf(await tok('auto@example.com'))); await D4.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(1200);
  sh = await sheet(D4);
  ok(sh && sh.mode === 'sent' && /You are signed in/.test(sh.text) && await synced(D4), 'opened where the app waits: signed in and syncing, no question', sh);

  // ---- 9. Password reset: request, then the emailed link opened in a browser.
  await openData(D);
  await D.page.click('#modal [data-act="mClose"]').catch(() => {});
  await D.page.click('#acctPanel [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
  await D.page.click('#modal [data-act="acctMode"][data-mode="forgot"]'); await wait(100);
  await fill(D, 'forgot', 'v@example.com');
  sh = await sheet(D);
  ok(sh && sh.mode === 'sent' && /reset link/.test(sh.text) && fake.log.some(l => l.startsWith('POST /auth/v1/recover')), 'Forgot password sends a reset email', sh);
  const s2 = await (await fetch(fake.base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'v@example.com', password: 'correct horse 1' }) })).json();
  const E = await device();
  await E.page.goto(fake.base + '/ironlog/index.html#access_token=' + s2.access_token + '&expires_at=' + s2.expires_at + '&expires_in=3600&refresh_token=' + s2.refresh_token + '&token_type=bearer&type=recovery');
  await E.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(1500);
  sh = await sheet(E);
  ok(sh && sh.mode === 'newpw', 'the reset link opens "New password"', sh);
  await fill(E, 'newpw', null, 'new horse 3');
  sh = await sheet(E);
  ok(sh && /Password changed/i.test(sh.text) && fake.users.get('v@example.com').password === 'new horse 3', 'the new password is saved', sh);
  ok(!(await E.ev(() => window.__ironlog.cloudState().on)), 'the reset browser is signed out afterwards and never synced');
  // An expired link says so.
  const F = await device(fake.base + '/ironlog/index.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
  await wait(800);
  sh = await sheet(F);
  ok(sh && /expired or was already used/.test(sh.text), 'an expired link: says to ask for a new one', sh);

  // ---- 10. An expired access token refreshes by itself; sync carries on.
  fake.expireTokens();
  await logOn(A, 'sA2', 120); await A.ev(() => window.__ironlog.flush()); await wait(1500);
  ok(sessIn(rowsOf('v@example.com')).includes('sA2') && (await A.ev(() => window.__ironlog.cloudState().status)) === 'synced', 'after the token expires, the next sync refreshes it and succeeds');
  // Old password no longer works; the new one does.
  const G = await device();
  await openData(G);
  await G.page.click('#acctPanel [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
  await fill(G, 'signin', 'v@example.com', 'correct horse 1');
  ok(/Wrong email or password/.test((await sheet(G)).err), 'the old password is refused after a reset');
  await fill(G, 'signin', null, 'new horse 3');
  ok(await synced(G), 'the new password signs in');

  // ---- 11. Opening the app offline while signed in, then getting signal.
  const H = await device(null, true);
  await H.page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  await openData(H);
  await H.page.click('#acctPanel [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
  await fill(H, 'signin', 'v@example.com', 'new horse 3');
  ok(await synced(H), 'installed-app device: signed in and synced');
  await H.ctx.setOffline(true);
  await H.page.reload(); await H.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(1500);
  ok((await H.ev(() => window.__ironlog.state.sessions.some(s => s.id === 'sA2'))) && !!(await H.ev(() => window.__ironlog.acctUser())), 'offline launch: the log is there and the sign-in is kept');
  await logOn(H, 'sH-offline', 130); await H.ev(() => window.__ironlog.flush()); await wait(800);
  ok(!sessIn(rowsOf('v@example.com')).includes('sH-offline'), 'offline: nothing sent, saved on the phone');
  await H.ctx.setOffline(false);
  await H.ev(() => window.dispatchEvent(new Event('online'))); await wait(2500);
  ok(sessIn(rowsOf('v@example.com')).includes('sH-offline') && (await H.ev(() => window.__ironlog.cloudState().status)) === 'synced', 'back online: what was logged offline reaches the account by itself', sessIn(rowsOf('v@example.com')));

  // ---- 12. A table without permissions shows a message instead of quietly stopping.
  fake.setDeny(true);
  await logOn(A, 'sA-denied', 140); await A.ev(() => window.__ironlog.flush()); await wait(800);
  await openData(A);
  const st = await A.ev(() => window.__ironlog.cloudState());
  ok(st.on && /table permissions need fixing/.test(st.err || '') && ((await text(A, '#syncInfo')).match(/table permissions need fixing/g) || []).length === 1, 'refused by the database: says the table permissions need fixing and keeps retrying', st);
  fake.setDeny(false);
  await A.ev(() => window.__ironlog.flush()); await wait(800);
  ok(sessIn(rowsOf('v@example.com')).includes('sA-denied') && (await A.ev(() => window.__ironlog.cloudState().status)) === 'synced', 'once fixed, sync catches up');

  // ---- 13. Delete my account: refused clearly until the function is deployed, then deletes account and synced log, keeps the phone's copy.
  const K = await device();
  await logOn(K, 'sK1', 70);
  await openData(K);
  await K.page.click('#acctPanel [data-act="acctOpen"][data-mode="signup"]'); await wait(100);
  await fill(K, 'signup', 'leaver@example.com', 'bye bye 123'); fake.confirm('leaver@example.com');
  await K.page.click('#modal [data-act="mClose"]');
  await K.page.click('#acctPanel [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
  await fill(K, 'signin', 'leaver@example.com', 'bye bye 123');
  ok(await synced(K) && sessIn(rowsOf('leaver@example.com')).join() === 'sK1', 'a third account is set up and synced');
  await openData(K);
  await K.page.click('#acctPanel [data-act="acctDelete"]'); await wait(100);
  ok(/deleted for good/.test(await text(K, '#modal')), 'Delete asks first and says it is permanent');
  await K.page.click('#modal [data-act="mOk"]'); await wait(1200);
  ok(/not set up yet/.test(await K.ev(() => document.getElementById('toast').innerText)) && fake.users.has('leaver@example.com'), 'before the function is deployed: a clear message, nothing deleted');
  fake.deployDelete(true);
  await openData(K);
  await K.page.click('#acctPanel [data-act="acctDelete"]'); await wait(100);
  await K.page.click('#modal [data-act="mOk"]'); await wait(1500);
  ok(!fake.users.has('leaver@example.com') && [...fake.rows.values()].every(r => !/sK1/.test(JSON.stringify(r.data))), 'deployed: the account and its synced log are gone from the server');
  ok(!(await K.ev(() => window.__ironlog.cloudState().on)) && !(await K.ev(() => window.__ironlog.acctUser())), 'the phone is signed out and no longer syncing');
  ok((await K.ev(() => window.__ironlog.state.sessions.map(s => s.id).join())) === 'sK1', 'the log on the phone is kept');
  ok(sessIn(rowsOf('v@example.com')).length > 0, 'other accounts are untouched');

  // ---- 14. Layout: the sheet and panel fit a small phone.
  await G.page.setViewportSize({ width: 320, height: 640 });
  await openData(G);
  await G.page.click('#acctPanel [data-act="acctSignOut"]'); await wait(100); await G.page.click('#modal [data-act="mClose"]').catch(() => {});
  await G.page.keyboard.press('Escape').catch(() => {});
  await G.ev(() => window.__ironlog.ui.modal && document.querySelector('#modal [data-act="mClose"]') && document.querySelector('#modal [data-act="mClose"]').click());
  const fit = await G.ev(() => document.documentElement.scrollWidth <= window.innerWidth);
  ok(fit, 'no sideways scrolling at 320 px');

  for (const d of devices) ok(!d.errors.length, 'no console errors on a device', d.errors);
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
