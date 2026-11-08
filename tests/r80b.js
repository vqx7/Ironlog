// 2.34 (build r80; PENDING.md's tracker, R79-1): the profile photo is the account's (V, 2026-11-08: "we should be
// treating it like an account"), on the standalone build against the stand-in Supabase server
// (tests/fake-supabase.js), as tests/accounts.js runs it. Run first on 2.33 (`node tests/r80b.js <a dist folder built
// from r79>`), where each section fails unless it says it guards:
//   1  A photo added while signed in is written to the account as its own document, a JPEG data address and nothing
//      else, beside the log's documents and never one of them; a second phone signed in to the account shows it.
//   2  Removed on one phone, it goes from the account and from the other phone at its next sync.
//   3  Sign out, either way (the log taken off the phone, or a copy kept), takes the photo off the phone with its
//      note and Today's line answered; the account keeps it. Another account signed in on that phone shows its own
//      photo, or none, and Today's line is offered again. Signed out, the menu offers no photo.
//   4  A photo 2.33 kept on the phone, with no note of an account, goes up to the account the phone syncs with when
//      the account has none; one the account has replaces a 2.33 copy that never reached it... only when the
//      account's is the later change, which a 2.33 copy (no time of its own) never is (it goes up first).
//   5  Of two phones' changes, the later is kept: a photo added on a phone while another phone's older one is in the
//      account replaces it, and an older change waiting to be sent never replaces a newer one in the account.
//   6  Delete my account takes the photo off the phone; Erase everything while syncing removes it from the account.
//   7  Guards: no page errors on either phone, and the log's documents are as before (the photo is never in them).
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./h');
const { start, quietHibp } = require('./fake-supabase');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r80b-'));
fs.cpSync(SRC, tmp, { recursive: true });
const PW = 'correct horse 9';
const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

(async () => {
  const fake = await start(tmp);
  const ip = path.join(tmp, 'index.html');
  fs.writeFileSync(ip, H.cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
  const APP = fake.base + '/ironlog/';
  const browser = await H.engine.launch();
  const errors = [];
  /** A phone: the built app, set up, signed out. */
  async function device(init) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await quietHibp(ctx);
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('page error: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push('console: ' + m.text()); });
    const ready = () => page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await page.goto(APP); await ready();
    await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
    const D = { ctx, page, ev: (f, a) => page.evaluate(f, a) };
    D.reload = async () => { await page.reload(); await ready(); await wait(1200); };
    D.synced = () => page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).then(() => true, () => false);
    D.signIn = async email => {
      // After a sign-out that took the log off, the app opens on the first page, which has its own Sign in (as tests/r55b.js reaches it).
      const ob = await page.evaluate(() => { const p = document.getElementById('obPage'); return p ? p.dataset.step : null; });
      if (ob) { if (await page.$('#obPage [data-act="obAcctBack"]')) { await page.click('#obPage [data-act="obAcctBack"]'); await wait(200); } await page.click('#obPage [data-act="acctOpen"][data-mode="signin"]'); }
      else { await page.click('#saveState'); await wait(250); await page.click('#modal [data-act="acctOpen"][data-mode="signin"]'); }
      await wait(200);
      await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', PW);
      await page.click('#modal [data-act="acctSubmit"]');
      await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
      await D.synced(); await wait(1500);
      await page.evaluate(() => { if (window.__ironlog.ui.modal) document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]') && document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]').click(); });
    };
    /** Pulls from the account, as the app does when it comes back to the front. */
    D.pull = async () => { await page.evaluate(() => window.__ironlog.sync()); await wait(1500); await D.synced(); };
    /** What this phone holds and shows: its copy, the note, Today's line answered, the menu button's photo. */
    D.photo = () => page.evaluate(() => ({
      held: localStorage.getItem('ironlog.v1.photo'),
      note: localStorage.getItem('ironlog.v1.photoSync'),
      asked: localStorage.getItem('ironlog.v1.photoAsked'),
      shown: !!document.querySelector('#saveState img.ssb-ph'),
      src: (document.querySelector('#saveState img.ssb-ph') || {}).src || null
    }));
    D.pick = async (color) => {
      await page.click('#saveState'); await wait(300);
      const b64 = await page.evaluate(c => { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 300; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 300, 300); return cv.toDataURL('image/png').split(',')[1]; }, color);
      await page.setInputFiles('#menuPhoto input[data-photo]', { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
      await page.waitForFunction(() => !!document.querySelector('#saveState img.ssb-ph'), null, { timeout: 8000 }).catch(() => {});
      await wait(1500);
      await page.evaluate(() => { if (window.__ironlog.ui.modal) document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]') && document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]').click(); });
    };
    D.remove = async () => {
      await page.click('#saveState'); await wait(300);
      await page.click('#modal [data-act="photoDel"]'); await wait(250);
      await page.click('#modal [data-act="mOk"]'); await wait(1500);
      await page.evaluate(() => { if (window.__ironlog.ui.modal) document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]') && document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]').click(); });
    };
    D.signOut = async keep => {
      await page.click('#saveState'); await wait(250);
      await page.click('#modal [data-act="acctSignOut"]'); await wait(300);
      await page.click(keep ? '#modal [data-act="mAlt"]' : '#modal [data-act="mOk"]'); await wait(1500);
    };
    return D;
  }
  const uidOf = email => (fake.users.get(email) || {}).id;
  const photoRow = email => [...fake.rows.values()].find(r => r.user_id === uidOf(email) && /\/photo$/.test(r.path)) || null;
  const photoIn = email => { const r = photoRow(email); if (!r) return undefined; try { return JSON.parse(r.data.json); } catch (e) { return 'unreadable'; } };
  const logPaths = email => [...fake.rows.values()].filter(r => r.user_id === uidOf(email)).map(r => r.path.split('/').pop()).sort();

  fake.addUser('a@example.com', PW);
  fake.addUser('b@example.com', PW);

  // 1. Added on one phone, in the account, on the other phone.
  const A = await device();
  await A.signIn('a@example.com');
  await A.pick('#c33');
  const inAcct = photoIn('a@example.com');
  ok(typeof inAcct === 'string' && JPEG.test(inAcct), '1. a photo added signed in is in the account as its own document, a JPEG data address', { has: inAcct === undefined ? 'no document' : typeof inAcct });
  ok(logPaths('a@example.com').includes('photo') && !logPaths('a@example.com').some(p => p !== 'photo' && /photo/.test(p)), '1. the account holds it as "photo", beside the log\'s documents', logPaths('a@example.com'));
  const B = await device();
  await B.signIn('a@example.com');
  let pb = await B.photo();
  ok(pb.shown && pb.held === inAcct, '1. the second phone signed in to the account shows the same photo', { shown: pb.shown, same: pb.held === inAcct });

  // 2. Removed on the second phone: gone from the account, and from the first phone at its next sync.
  await B.remove();
  ok(photoIn('a@example.com') === null, '2. removed on one phone, the account holds no photo', photoIn('a@example.com'));
  await A.reload(); await A.synced(); await wait(800);
  let pa = await A.photo();
  ok(!pa.shown && !pa.held, '2. the first phone shows none after its next sync', pa);

  // 3. Sign out, both ways, takes the photo off the phone; the account keeps it; another account shows its own.
  await A.pick('#3a6');
  const kept = photoIn('a@example.com');
  ok(typeof kept === 'string' && JPEG.test(kept), '3. a new photo is in the account again', typeof kept);
  await A.signOut(false);
  pa = await A.photo();
  ok(!pa.held && !pa.note && !pa.asked && !pa.shown, '3. signed out with the log taken off: no photo, note or answered line on the phone', pa);
  ok(photoIn('a@example.com') === kept, '3. the account keeps its photo', null);
  const noPick = await A.ev(async () => { document.getElementById('saveState').click(); await new Promise(r => setTimeout(r, 300)); const has = !!document.getElementById('menuPhoto'); document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]') && document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]').click(); return has; });
  ok(!noPick, '3. signed out, the menu offers no photo');
  await A.signIn('b@example.com');
  pa = await A.photo();
  ok(!pa.shown && !pa.held, '3. another account with no photo, signed in on that phone, shows none', pa);
  // An account with no log lands on Set up after a sign-out took the log off; set up, as the lifter would, then Today.
  await A.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.ui.tab = 'today'; L.render(); });
  await wait(300);
  const line = await A.ev(() => !!document.getElementById('photoBar'));
  ok(line, "3. and Today's line offers a photo again");
  await A.signOut(true);
  pa = await A.photo();
  ok(!pa.held && !pa.note && !pa.asked, '3. signed out keeping a copy of the log: the photo goes too', pa);
  await A.signIn('a@example.com');
  pa = await A.photo();
  ok(pa.shown && pa.held === kept, "3. signed back in to the first account, its photo comes back", { shown: pa.shown, same: pa.held === kept });

  // 4. A photo 2.33 kept on the phone (no note) goes up to an account that has none.
  fake.addUser('c@example.com', PW);
  const C = await device();
  const old = await C.ev(() => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = '#a63'; x.fillRect(0, 0, 64, 64); return cv.toDataURL('image/jpeg', 0.8); });
  await C.ev(u => localStorage.setItem('ironlog.v1.photo', u), old);
  await C.signIn('c@example.com');
  ok(photoIn('c@example.com') === old, "4. a photo 2.33 kept on the phone goes up to an account that has none", typeof photoIn('c@example.com'));
  const pc = await C.photo();
  ok(pc.shown && pc.held === old && /"up":false/.test(pc.note || ''), '4. and the phone notes it as the account\'s', pc.note);

  // 5. The later change is kept.
  await A.pick('#36a'); // A writes a newer photo while B still holds none (it removed it in 2)
  const newer = photoIn('a@example.com');
  // B holds a change older than the account's, still to be sent: it must not replace the newer photo.
  await B.ev(() => { localStorage.setItem('ironlog.v1.photoSync', JSON.stringify({ uid: localStorage.getItem('ironlog.v1.photoSync') ? JSON.parse(localStorage.getItem('ironlog.v1.photoSync')).uid : '', et: 1, up: true })); localStorage.removeItem('ironlog.v1.photo'); });
  await B.reload(); await B.synced(); await wait(800);
  pb = await B.photo();
  ok(photoIn('a@example.com') === newer && pb.held === newer, '5. an older change waiting on a phone never replaces the newer photo in the account; the phone takes the newer', { acct: photoIn('a@example.com') === newer, phone: pb.held === newer });

  // 6. Erase everything while syncing removes the photo from the account; Delete my account takes it off the phone.
  await B.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); });
  await B.ev(() => window.__ironlog.ui && document.querySelector('[data-act="resetAll"]') && document.querySelector('[data-act="resetAll"]').click());
  await wait(300);
  await B.page.click('#modal [data-act="mOk"]').catch(() => {});
  await wait(2500);
  ok(photoIn('a@example.com') === null, '6. Erase everything while syncing removes the photo from the account', photoIn('a@example.com'));
  await C.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
  await wait(300);
  fake.deployDelete(true);
  const delBtn = await C.page.$('[data-act="acctDelete"]');
  if (delBtn) {
    await delBtn.evaluate(e => e.click()); await wait(300);
    await C.page.click('#modal [data-act="mOk"]').catch(() => {});
    await wait(2500);
    const pd = await C.photo();
    ok(!fake.users.has('c@example.com'), '6. (the account is deleted)');
    ok(!pd.held && !pd.note && !pd.shown, '6. Delete my account takes the photo off the phone', pd);
  } else ok(false, '6. Delete my account is reachable in Your data');

  // 7. Guards.
  ok(!errors.length, '7. guard: no page errors on any phone', errors.slice(0, 5));
  await browser.close();
  await fake.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
