// r45: confirming sign-up with the 6-digit code from the email (item 61),
// on the real build against the stand-in Supabase (tests/fake-supabase.js),
// which answers as the real service does: only type 'email' verifies a
// sign-up's code, and a wrong, used or expired code all get one 403.
// On an iPhone the emailed link opens in Safari, not the home-screen app,
// so the code is the way in that works from the app itself.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { start, quietHibp } = require('./fake-supabase');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
require('./h').build();
const DIST = path.join(__dirname, '..', 'dist');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r45-'));
fs.cpSync(DIST, tmp, { recursive: true });
const PW = 'correct horse 45';

(async () => {
  const fake = await start(tmp);
  const ip = path.join(tmp, 'index.html');
  fs.writeFileSync(ip, require('./h').cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
  const APP = fake.base + '/ironlog/';
  const browser = await chromium.launch();
  async function device(w) {
    const ctx = await browser.newContext({ viewport: { width: w || 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await quietHibp(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push(m.text()); });
    await page.goto(APP); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
    return { ctx, page, errors, ev: (f, a) => page.evaluate(f, a) };
  }
  const idle = D => D.page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 }).then(() => wait(150));
  const sheet = D => D.ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'account' ? { mode: m.mode, err: m.err || '', text: document.getElementById('modal').innerText.replace(/\s+/g, ' '), code: !!document.querySelector('#modal [data-abind="code"]') } : null; });
  const toastTxt = D => D.ev(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText : ''; });
  async function signUp(D, email) {
    await D.ev(() => window.__ironlog.ACT.acctOpen({ dataset: { mode: 'signup' } }));
    await D.page.fill('#modal [data-abind="email"]', email); await D.page.fill('#modal [data-abind="pw"]', PW);
    await D.page.click('#modal [data-act="acctSubmit"]'); await idle(D);
  }
  async function code(D, c) { await D.page.fill('#modal [data-abind="code"]', c); await D.page.click('#modal [data-act="acctCode"]'); await idle(D); }
  const signedIn = D => D.ev(() => !!window.__ironlog.acctUser());

  // ---- 1. The waiting sheet offers the code; a wrong code says so; the right one, typed with spaces, signs in.
  const A = await device();
  await signUp(A, 'a@x.test');
  let s = await sheet(A);
  ok(s && s.mode === 'wait' && s.code && /Type its code here, or tap its link/.test(s.text) && /Send a new code/.test(s.text) && /I have confirmed/.test(s.text), 'after sign-up the waiting sheet has the code field and Send a new code, and keeps the link and I have confirmed', s);
  const real = fake.codeFor('a@x.test');
  await code(A, real === '000000' ? '111111' : '000000');
  s = await sheet(A);
  ok(s && s.mode === 'wait' && s.err === 'That code is wrong or has expired. Use the newest email, or send a new one.' && !(await signedIn(A)), 'a wrong code: one plain message (the service does not tell wrong from expired), still waiting, not signed in', s);
  await code(A, real.slice(0, 3) + ' ' + real.slice(3));
  await wait(400);
  ok(await signedIn(A) && !(await sheet(A)) && fake.users.get('a@x.test').confirmed, 'the right code, even typed with a space, confirms the account, signs in and closes the sheet', await sheet(A));
  ok(/Email confirmed\. Signed in and syncing\./.test(await toastTxt(A)), 'it says so once', await toastTxt(A));
  ok(await A.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).then(() => true, () => false), 'and the log syncs to the account');
  const stored = await A.ev(() => JSON.stringify(Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))));
  ok(!stored.includes(real) && !stored.includes(PW), 'neither the code nor the password is stored on the phone');
  ok(!A.errors.length, 'no page errors', A.errors);
  await A.ctx.close();

  // ---- 2. Send a new code: once a minute, said plainly; the new one works and the old one no longer does; its link points back at this build.
  const B = await device();
  await signUp(B, 'b@x.test');
  const first = fake.codeFor('b@x.test');
  await B.page.click('#modal [data-act="acctResend"]'); await idle(B);
  s = await sheet(B);
  ok(s && /^Wait \d+ seconds, then send a new code\.$/.test(s.err) && fake.codeFor('b@x.test') === first, 'a new code within the minute: "Wait N seconds", and the code is unchanged', s);
  fake.ageCode('b@x.test', 61000);
  await B.page.click('#modal [data-act="acctResend"]'); await idle(B);
  const second = fake.codeFor('b@x.test');
  ok(second && second !== first && /A new email is on its way/.test(await toastTxt(B)) && (fake.users.get('b@x.test').redirect || '').includes('/ironlog/'), 'after a minute a new email goes out, with its link back to this build', { redirect: fake.users.get('b@x.test').redirect });
  await code(B, first);
  ok(!(await signedIn(B)) && /wrong or has expired/.test((await sheet(B)).err), 'the old code no longer works');
  await code(B, second);
  ok(await signedIn(B), 'the newest code does');
  await B.ctx.close();

  // ---- 3. An expired code is refused; the link opened first (it uses the code up) still signs in, by the password.
  const C = await device();
  await signUp(C, 'c@x.test');
  const cc = fake.codeFor('c@x.test'); fake.ageCode('c@x.test', 3601000);
  await code(C, cc);
  ok(!(await signedIn(C)) && /wrong or has expired/.test((await sheet(C)).err), 'a code over an hour old is refused');
  await C.ctx.close();
  const D = await device();
  await signUp(D, 'd@x.test');
  const dc = fake.codeFor('d@x.test'); fake.confirm('d@x.test');
  await code(D, dc);
  ok(await signedIn(D) && !(await sheet(D)), 'the link was opened first (Safari): the code no longer works, so the password signs in instead, and the sheet closes');
  await D.ctx.close();

  // ---- 4. After the wait is gone (closed, or the app reopened): sign-in says to confirm and offers the code there.
  const E = await device();
  await signUp(E, 'e@x.test');
  const ec = fake.codeFor('e@x.test');
  await E.ev(() => window.__ironlog.ACT.mClose());
  await E.ev(() => window.__ironlog.ACT.acctOpen({ dataset: { mode: 'signin' } }));
  await E.page.fill('#modal [data-abind="email"]', 'e@x.test'); await E.page.fill('#modal [data-abind="pw"]', PW);
  await E.page.click('#modal [data-act="acctSubmit"]'); await idle(E);
  s = await sheet(E);
  ok(s && s.mode === 'signin' && s.code && /Confirm your email first: type the code from the email below, or open its link\./.test(s.err), 'signing in before confirming says to confirm and shows the code field right there', s);
  await E.page.fill('#modal [data-abind="code"]', ec); await E.page.press('#modal [data-abind="code"]', 'Enter'); await idle(E); await wait(300);
  ok(await signedIn(E) && !(await sheet(E)), 'Go on the keyboard in the code field confirms with the code and signs in');
  await E.ctx.close();

  // ---- 5. At 320 px: on screen, 44 px targets, no sideways scroll.
  const F = await device(320);
  await signUp(F, 'f@x.test');
  const lay = await F.ev(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { over: document.documentElement.scrollWidth > innerWidth, code: Math.round(r('#modal [data-abind="code"]').height), btn: Math.round(r('#modal [data-act="acctCode"]').height), link: Math.round(r('#modal [data-act="acctResend"]').height), inp: document.querySelector('#modal [data-abind="code"]').getAttribute('autocomplete') + '/' + document.querySelector('#modal [data-abind="code"]').getAttribute('inputmode') }; });
  ok(!lay.over && lay.code >= 44 && lay.btn >= 44 && lay.link >= 44 && lay.inp === 'one-time-code/numeric', '320 px: the field, the button and the link are 44 px, the phone offers the code from the email, nothing scrolls sideways', lay);
  await F.ctx.close();

  // ---- 6. The same lift again later in a session: dashes and the whole Last line on the later block, never a set from the wrong block.
  const { open } = require('./h');
  const G = await open('index.html', { browser, clock: '2026-10-13T10:00:00' });
  const dup = await G.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.render(); document.querySelector('[data-act="startSession"]').click();
    const d = L.state.draft; // A lift whose target is more reps, so its grey reps are last time's (after a new load they are the range's bottom anyway).
    const b0 = d.ex.find(b => b.prev && b.prev.length && b.tgt && b.tgt.kind === 'reps' && !b.prevOff); const i0 = d.ex.indexOf(b0);
    d.ex.push({ ...JSON.parse(JSON.stringify(b0)) }); const j = d.ex.length - 1; d.ex.splice(j - 1, 0, d.ex.splice(j, 1)[0]); L.saveNow(); L.render();
    const later = d.ex.map((b, i) => ({ b, i })).filter(x => x.b.exId === b0.exId).pop().i;
    const cells = i => [...document.querySelectorAll(`#blk-${i} .sg:not(.head) .ls`)].map(c => c.textContent);
    const hint = i => (document.querySelector(`#blk-${i} .hint .tp`) || {}).textContent;
    const ph = i => [...document.querySelectorAll(`#blk-${i} .sg:not(.head) input[data-f="r"]`)].map(x => x.placeholder);
    return { i0, later, first: cells(i0), second: cells(later), h0: hint(i0), h1: hint(later), last: b0.last, prev: b0.prev, ph0: ph(i0), ph1: ph(later), lastR: b0.lastR, repMin: d.ex[later].plan.repMin, copy: !!document.querySelector(`#blk-${later} [data-act="fillLast"]`) }; });
  ok(dup.later > dup.i0 + 1 && dup.first[0] === dup.prev[0] && dup.second.every(c => c === '–') && dup.h1 === dup.last && dup.h0 !== dup.last, 'the first block shows last time beside its rows; the later one shows dashes and the whole Last line', dup);
  ok(dup.ph0[0] === String(dup.lastR[0]) && dup.ph1[0] === String(dup.repMin) && !dup.copy, 'its grey reps do not repeat the first block\'s either: the bottom of the range, and no Copy last', dup);
  await G.ctx.close();

  await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
