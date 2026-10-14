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

  // ---- 8. Auto-reorder (V 2026-10-13): the first set ticked on an exercise below untouched ones moves it up, to just after the last one touched.
  const K = await open('index.html', { browser, clock: '2026-10-13T10:00:00' });
  const ko = await K.page.evaluate(async () => {
    const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
    L.state.settings.onboarded = true; L.state.settings.autoDone = true; L.makeDemo(); L.saveNow(); L.render(); document.querySelector('[data-act="startSession"]').click(); await w(100);
    const d = L.state.draft; d.ex.forEach(b => { if (b.plan) delete b.plan.ss; }); L.saveNow(); L.render();
    const ids = () => d.ex.map(b => b.exId); const before = ids();
    const top = i => document.getElementById('blk-' + i).getBoundingClientRect().top;
    document.getElementById('blk-2').scrollIntoView(); await w(50); const t0 = top(2); document.querySelector('[data-act="sDone"][data-b="2"][data-s="0"]').click();
    const still = ids().join() === before.join(); await w(2000);
    const one = { ids: ids(), dy: Math.abs(top(0) - t0), done: d.ex[0].sets[0].done };
    // Typed reps tick by auto-mark; the block moves to just after the one touched, and the checkmark tapped within 15 s still confirms it.
    const inp = document.querySelector('[data-f="r"][data-b="3"][data-s="0"]'); inp.value = '8'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    await w(2000); const two = ids();
    document.querySelector('[data-act="sDone"][data-b="1"][data-s="0"]').click(); await w(100);
    const confirmed = d.ex[1].exId === before[3] && d.ex[1].sets[0].done;
    // A second set on a moved exercise moves nothing.
    document.querySelector('[data-act="sDone"][data-b="0"][data-s="1"]').click(); await w(2000); const three = ids();
    // Never in a superset, a past workout, an edit, or past the same lift.
    const b5 = d.ex[5]; b5.sets[0].done = true; const free = L.orderAt(b5);
    b5.plan.ss = 'x'; const ss = L.orderAt(b5); delete b5.plan.ss;
    d.past = true; const past = L.orderAt(b5); delete d.past;
    d.editingId = 'e'; const ed = L.orderAt(b5); delete d.editingId;
    const o3 = d.ex[3].exId; d.ex[3].exId = b5.exId; const same = L.orderAt(b5); d.ex[3].exId = o3;
    // Two first sets ticked inside the wait both move, in the order ticked (r45 review).
    L.state.draft = null; L.saveNow(); L.render(); document.querySelector('[data-act="startSession"]').click(); await w(100);
    const d2 = L.state.draft; d2.ex.forEach(b => { if (b.plan) delete b.plan.ss; }); L.saveNow(); L.render(); const B = d2.ex.map(b => b.exId);
    document.querySelector('[data-act="sDone"][data-b="3"][data-s="0"]').click(); await w(100); document.querySelector('[data-act="sDone"][data-b="5"][data-s="0"]').click(); await w(2000);
    const both = d2.ex.map(b => b.exId).join() === [B[3], B[5], B[0], B[1], B[2], B[4], ...B.slice(6)].join();
    // Undo of Remove puts the exercise back after the one it followed, even after a reorder in between.
    L.ACT.bDel({ dataset: { b: '3' } }); await w(100); // removes B[1]; it followed B[0]
    document.querySelector('[data-act="sDone"][data-b="4"][data-s="0"]').click(); await w(2000); // B[4] moves up past B[2] and B[0]
    L.ACT.undo(); await w(100);
    const undone = d2.ex.map(b => b.exId).slice(0, 6).join() === [B[3], B[5], B[4], B[0], B[1], B[2]].join();
    return { before, still, one, two, confirmed, three, free, ss, past, ed, same, both, undone, order: L.state.draft.ex.map(b => b.exId) };
  });
  const B4 = ko.before;
  ok(ko.still && ko.one.ids.join() === [B4[2], B4[0], B4[1], ...B4.slice(3)].join() && ko.one.done && ko.one.dy < 2, 'the first set ticked on the third exercise moves it to the top after a moment, and it stays where it was on the screen', ko.one);
  ok(ko.two.join() === [B4[2], B4[3], B4[0], B4[1], ...B4.slice(4)].join() && ko.confirmed, 'reps typed on the fourth tick it and move it to just after the one started; the checkmark tapped next still confirms it', { two: ko.two, confirmed: ko.confirmed });
  ok(ko.three.join() === ko.two.join(), 'a second set on a moved exercise moves nothing', ko.three);
  ok(ko.free === 2 && ko.ss === -1 && ko.past === -1 && ko.ed === -1 && ko.same === 4, 'never in a superset, a past workout, or an edit from History, and never past the same lift', ko);
  ok(ko.both && ko.undone, 'two exercises started inside the wait both move, in the order started; Undo of Remove puts an exercise back after the one it followed', ko.order);
  ok(!K.errors.length, 'no page errors (auto-reorder)', K.errors);
  await K.ctx.close();

  // ---- 9. The session in progress finished or discarded on another device says so (audit item 288), not the generic two-devices note.
  {
    const store = new Map();
    const cloudSetup = async (ctx, page) => {
      await page.exposeFunction('__dbGet', p => store.has(p) ? store.get(p) : null);
      await page.exposeFunction('__dbSet', (p, v) => { store.set(p, v); return true; });
      await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
      await page.addInitScript(() => {
        window.claude = { use: async k => {
          if (k === 'user') return { id: async () => 'u1' };
          if (k === 'db') return { doc: p => ({ get: async () => { const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); } }),
            collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
          return null; } };
      });
    };
    const A = await open('index.html', { browser, clock: '2026-10-13T10:00:00', setup: cloudSetup });
    const B = await open('index.html', { browser, clock: '2026-10-13T10:00:00', setup: cloudSetup });
    await wait(800);
    const toastOf = P => P.page.evaluate(() => { const t = document.getElementById('toast'); return t ? t.innerText : ''; });
    const startOnA = async () => { await A.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render(); document.querySelector('[data-act="startSession"]').click(); }); await wait(100);
      await A.page.evaluate(() => window.__ironlog.flush()); await wait(300); await B.page.evaluate(() => window.__ironlog.sync()); await wait(500); };
    await startOnA();
    const onB = await B.page.evaluate(() => !!window.__ironlog.state.draft);
    await B.page.evaluate(() => { window.__ironlog.ACT.discard(); }); await wait(100);
    await B.page.evaluate(() => window.__ironlog.flush()); await wait(300);
    await A.page.evaluate(() => window.__ironlog.sync()); await wait(500);
    const t1 = await toastOf(A); const gone = await A.page.evaluate(() => window.__ironlog.state.draft === null);
    ok(onB && gone && /discarded on another device/.test(t1), 'a session in progress discarded on the other phone: this one says so', { onB, gone, t1 });
    await startOnA();
    await B.page.evaluate(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[0].sets[0].r = 8; d.ex[0].sets[0].w = 50; d.ex[0].sets[0].done = true; d._rampAsked = true; d._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
    await B.page.evaluate(() => window.__ironlog.flush()); await wait(300);
    await A.page.evaluate(() => window.__ironlog.sync()); await wait(500);
    const t2 = await toastOf(A);
    ok(/saved on another device/.test(t2), 'finished on the other phone: this one says it was saved there', t2);
    // An edit from History closed on the other phone is not called saved (r45 review: the session always exists).
    await A.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id: L.state.sessions[L.state.sessions.length - 1].id } }); }); await wait(100);
    await A.page.evaluate(() => window.__ironlog.flush()); await wait(300); await B.page.evaluate(() => window.__ironlog.sync()); await wait(500);
    const hadEdit = await B.page.evaluate(() => { const L = window.__ironlog; const e = !!(L.state.draft && L.state.draft.editingId); L.state.draft = null; L.saveNow(); return e; }); await wait(100); // what Discard's confirm does
    await B.page.evaluate(() => window.__ironlog.flush()); await wait(300);
    await A.page.evaluate(() => window.__ironlog.sync()); await wait(500);
    const t3 = await toastOf(A);
    ok(hadEdit && /edit in progress was closed on another device/.test(t3) && !/saved on another/.test(t3), 'an edit closed on the other phone says so, not saved', t3);
    ok(!A.errors.length && !B.errors.length, 'no page errors (two phones)', [...A.errors, ...B.errors]);
    await A.ctx.close(); await B.ctx.close();
  }

  // ---- 10. A lift logged only as drop sets never counts toward "stalled at once" (audit item 289).
  {
    const Q = await open('index.html', { browser, clock: '2026-10-13T10:00:00' });
    const fs10 = await Q.page.evaluate(() => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true;
      const mk = (i, drop) => ({ id: 'q' + i, date: `2026-09-${String(10 + i * 3).padStart(2, '0')}`, dayName: 'A', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 1, done: true, drop: drop || undefined }, { w: 50, r: 8, rir: 1, done: true, drop: drop || undefined }] }] });
      s.sessions = [0, 1, 2, 3, 4, 5].map(i => mk(i, true)); L.invalidate(); const a = L.fatigueStalls(['bench']);
      s.sessions.push(mk(6, false)); L.invalidate(); const b = L.fatigueStalls(['bench']);
      return { a, b }; });
    ok(fs10.a.length === 0 && fs10.b.join() === 'bench', 'a compound lift logged only as drop sets in its last 6 sessions is left out of "stalled at once"; one main set brings it back', fs10);
    await Q.ctx.close();
  }

  // ---- 11. A problem report's screenshot is at most 500,000 characters, even from a large noisy image (audit item 287).
  {
    const S = await open('index.html', { browser, clock: '2026-10-13T10:00:00' });
    const shot = await S.page.evaluate(async () => { const c = document.createElement('canvas'); c.width = 2400; c.height = 3200; const x = c.getContext('2d'); const im = x.createImageData(c.width, c.height);
      for (let i = 0; i < im.data.length; i++) im.data[i] = (i & 3) === 3 ? 255 : Math.random() * 256; x.putImageData(im, 0, 0);
      const blob = await new Promise(r => c.toBlob(r, 'image/png')); const d = await window.__ironlog.fbShrink(blob);
      const small = document.createElement('canvas'); small.width = 400; small.height = 300; small.getContext('2d').fillRect(0, 0, 100, 100); const d2 = await window.__ironlog.fbShrink(await new Promise(r => small.toBlob(r, 'image/png')));
      return { big: blob.size, len: d ? d.length : null, jpeg: !!d && d.startsWith('data:image/jpeg;base64,'), small: d2 && d2.length }; });
    ok(shot.big > 5e6 && (shot.len === null || (shot.jpeg && shot.len <= 500000)) && shot.small > 0 && shot.small <= 500000, 'screenshots are made 500,000 characters or less (or refused), and an ordinary one goes through', shot);
    await S.ctx.close();
  }

  // ---- 7. A save this build cannot read is kept aside and offered back (the r45 audit: before, it sat in storage with nothing offering it).
  const H = await open('index.html', { browser, clock: '2026-10-13T10:00:00' });
  const good = await H.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); return localStorage.getItem('ironlog.v1'); });
  await H.ctx.close();
  // normalize throws on a save whose routines field is a string with a getter... simplest real case: JSON that parses but whose version field makes normalize throw is hard to make; a save that is not JSON at all is the common one (a truncated write).
  const bad = good.slice(0, Math.floor(good.length * 0.6));
  const I = await open('index.html', { browser, clock: '2026-10-13T10:00:00', setup: async (ctx) => { await ctx.addInitScript(b => { localStorage.setItem('ironlog.v1', b); }, bad); } });
  const kept = await I.page.evaluate(() => ({ aside: (localStorage.getItem('ironlog.v1.unreadable') || '').length, first: !!document.getElementById('obPage'), diag: window.__ironlog.state.sessions.length }));
  ok(kept.aside === bad.length && kept.first && kept.diag === 0, 'a truncated save is kept aside at start, and the app opens fresh', kept);
  await I.page.evaluate(() => { const L = window.__ironlog; L.ACT.obAcctLater && L.ACT.obAcctLater(); L.state.settings.onboarded = true; L.saveNow(); L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); });
  const panel = await I.page.evaluate(() => { const p = document.getElementById('unreadPanel'); return p ? p.innerText : ''; });
  ok(/could not be read/.test(panel) && /Restore it/.test(panel) && /Show its text/.test(panel) && /Forget it/.test(panel), 'Settings, Your data offers the save kept aside: Restore, Show its text, Forget', panel);
  await I.page.click('[data-act="unreadShow"]'); await wait(80);
  const shown = await I.page.evaluate(() => (document.getElementById('mText') || {}).value || '');
  ok(shown === bad, 'Show its text shows the save exactly, as text'); await I.page.evaluate(() => window.__ironlog.ACT.mClose());
  await I.page.click('[data-act="unreadRestore"]'); await wait(80);
  const t1 = await I.page.evaluate(() => document.getElementById('toast').innerText);
  ok(/not valid backup text/.test(t1), 'Restore on a truncated save says it is not valid, and keeps it', t1);
  // A save normalize can read but with damaged records: restored through the import, which says what was skipped, then the copy aside is let go.
  const dmg = (() => { const o = JSON.parse(good); o.sessions = [...o.sessions, { nope: 1 }, 'x']; return JSON.stringify(o); })();
  await I.page.evaluate(d => { localStorage.setItem('ironlog.v1.unreadable', d); window.__ironlog.render(); }, dmg);
  await I.page.click('[data-act="unreadRestore"]'); await wait(80);
  const q = await I.page.evaluate(() => document.querySelector('.sheet') && document.querySelector('.sheet').innerText);
  ok(/damaged record/.test(q || '') && /Replace my data/.test(q || ''), 'a readable save with damaged records restores through the import, which says what is skipped', q);
  await I.page.click('.sheet [data-act="mOk"]'); await wait(150);
  const after = await I.page.evaluate(() => ({ n: window.__ironlog.state.sessions.length, aside: localStorage.getItem('ironlog.v1.unreadable'), panel: !!document.getElementById('unreadPanel') }));
  ok(after.n > 10 && after.aside === null, 'restored: the sessions are back and the copy aside is gone', after);
  // Damaged records in the save itself are counted in Diagnostics at start.
  const J = await open('index.html', { browser, clock: '2026-10-13T10:00:00', setup: async (ctx) => { await ctx.addInitScript(d => { localStorage.setItem('ironlog.v1', d); }, dmg); } });
  const dg = await J.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:more'] = true; L.render(); return document.querySelector('[data-mkey="more"]').innerText; });
  ok(/2 damaged records were skipped when the save was read/.test(dg), 'Diagnostics says how many damaged records the save held', dg.slice(0, 300));
  ok(!I.errors.length && !J.errors.filter(e => !/load/.test(e)).length, 'no page errors', [I.errors, J.errors]);
  await I.ctx.close(); await J.ctx.close();

  await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
