// The profile photo (2.33 and 2.34; opened large since 2.60, NEW-141). A feature suite (CLAUDE.md, Tests): new checks
// of the profile photo go here. Signed in, as the photo is the account's (on a stand-in account service, so the source
// build; the built app's own account script reads it in tests/storage-sync-account.js). Run on the build before
// (`node tests/photo.js baselines/r105.html`, 2.59) every section fails there.
//   1  A photo picked in the menu is kept as a 512 px square JPEG (256 until 2.60, soft once enlarged).
//   2  With a photo, a tap on it in the menu opens it large, with Change photo, Remove photo and Close; Change photo
//      puts the new one in the sheet and on the menu button; Remove asks first and then takes it away; with no
//      photo, the menu's photo picks one, as before. Every button there is a 44 px target, and nothing scrolls
//      sideways at 320 px.
// PHOTO_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.PHOTO_ONLY ? process.env.PHOTO_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
// A signed-in account, with no sync service behind it (the photo is offered only with an account).
const SIGNED_IN = "window.ironlogAuth={onChange(){},user(){return Promise.resolve({id:'uph',email:'v@example.com'});},signOut(){return Promise.resolve();}};";

/** The app on Today, set up, signed in. */
async function app(w = 390) {
  const D = await open(FILE, { w, h: 844, clock: '2026-11-12T10:00:00', setup: ctx => ctx.addInitScript(SIGNED_IN) });
  await D.page.evaluate(() => {
    const L = window.__ironlog; L.state.settings.onboarded = true;
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.ui.tab = 'today'; L.render();
  });
  await D.page.waitForFunction(() => !!window.__ironlog.acctUser(), null, { timeout: 5000 }).catch(() => {});
  await D.page.evaluate(() => window.__ironlog.render()); await wait(300);
  return D;
}
/** A photo file made in the page: a PNG of `w` by `h` pixels in one colour with a white square, as bytes. */
async function pngFile(page, w, h, fill = '#4a6') {
  const b64 = await page.evaluate(([w, h, fill]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = fill; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return c.toDataURL('image/png').split(',')[1]; }, [w, h, fill]);
  return { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
/** Waits for the menu button to show a photo whose address is not `was`. */
const photoIn = (page, was = null) => page.waitForFunction(w => { const i = document.querySelector('#saveState img.ssb-ph'); return !!i && i.getAttribute('src') !== w; }, was, { timeout: 8000 }).then(() => true, () => false);
/** An image's address and pixel size, once it has loaded. */
const imgOf = (page, sel) => page.evaluate(sel => new Promise(res => {
  const im = document.querySelector(sel);
  if (!im) return res(null);
  const done = () => res({ src: im.getAttribute('src'), w: im.naturalWidth, h: im.naturalHeight, shown: Math.round(im.getBoundingClientRect().width) });
  im.complete ? done() : im.addEventListener('load', done);
}), sel);

(async () => {
  if (run(1)) {
    const D = await app();
    const pg = D.page;
    await pg.click('#saveState'); await wait(200);
    await pg.setInputFiles('#modal #menuPhoto input[data-photo]', await pngFile(pg, 1200, 900)); await photoIn(pg);
    const b = await imgOf(pg, '#saveState img.ssb-ph');
    ok(b && b.src.startsWith('data:image/jpeg;base64,') && b.w === 512 && b.h === 512, '1. a photo picked in the menu is kept as a 512 px square JPEG', b);
    const size = await pg.evaluate(() => (localStorage.getItem(window.__ironlog.KEY + '.photo') || '').length);
    ok(size > 0 && size < 120000, '1. and still small on the phone', size);
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(2)) {
    const D = await app();
    const pg = D.page;
    // No photo: the menu's photo picks one, as before.
    await pg.click('#saveState'); await wait(200);
    ok(await pg.evaluate(() => { const m = document.querySelector('#modal #menuPhoto'); return !!m && m.tagName === 'LABEL' && m.getAttribute('aria-label') === 'Add a profile photo' && !!m.querySelector('input[type="file"][data-photo]'); }), '2. with no photo, the menu\'s photo adds one');
    await pg.setInputFiles('#modal #menuPhoto input[data-photo]', await pngFile(pg, 600, 600, '#4a6')); await photoIn(pg); await wait(150);
    const first = await imgOf(pg, '#saveState img.ssb-ph');
    // With one: a tap opens it large.
    ok(await pg.evaluate(() => { const m = document.querySelector('#modal #menuPhoto'); return !!m && m.getAttribute('aria-label') === 'Open your profile photo' && !m.querySelector('input'); }), '2. with a photo, the menu\'s photo is named for opening it');
    await pg.click('#modal #menuPhoto'); await wait(250);
    const big = await imgOf(pg, '#modal .sheet img.pbig');
    const sheet = await pg.evaluate(() => { const m = window.__ironlog.ui.modal; const s = document.querySelector('#modal .sheet'); return { kind: m && m.kind, title: (s && s.querySelector('h3') || {}).textContent, buttons: s ? [...s.querySelectorAll('.row .btn')].map(b => b.textContent.trim()) : [] }; });
    ok(sheet.kind === 'photo' && sheet.title === 'Profile photo' && big && big.src === first.src && big.shown >= 300, '2. a tap on it in the menu opens it large: the same photo, 300 px wide or more', { sheet, big });
    ok(JSON.stringify(sheet.buttons) === JSON.stringify(['Change photo', 'Remove photo', 'Close']), '2. with Change photo, Remove photo and Close', sheet.buttons);
    // Change photo: the new one in the sheet and on the menu button.
    await pg.setInputFiles('#modal .sheet input[data-photo]', await pngFile(pg, 600, 600, '#36a')); await photoIn(pg, first.src); await wait(200);
    const now = await imgOf(pg, '#modal .sheet img.pbig'), btn = await imgOf(pg, '#saveState img.ssb-ph');
    ok(now && btn && now.src !== first.src && now.src === btn.src && (await pg.evaluate(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind)) === 'photo', '2. Change photo puts the new one in the sheet and on the menu button', { now: now && now.src.length, btn: btn && btn.src.length });
    // Remove asks first, then takes it away.
    await pg.click('#modal .sheet [data-act="photoDel"]'); await wait(200);
    const asked = await pg.evaluate(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? m.title : null; });
    ok(asked === 'Remove your profile photo?' && !!(await imgOf(pg, '#saveState img.ssb-ph')), '2. Remove asks first, and the photo stays until the answer', asked);
    await pg.click('#modal [data-act="mOk"]'); await wait(300);
    ok(!(await imgOf(pg, '#saveState img.ssb-ph')) && (await pg.evaluate(() => localStorage.getItem(window.__ironlog.KEY + '.photo'))) === null, '2. answered, the photo is gone');
    ok(!D.errors.length, '2. no page errors', D.errors);
    await D.browser.close();
    // At 320 px: the sheet's buttons are 44 px targets, with no sideways scroll.
    const N = await app(320);
    await N.page.click('#saveState'); await wait(200);
    await N.page.setInputFiles('#modal #menuPhoto input[data-photo]', await pngFile(N.page, 600, 600)); await photoIn(N.page); await wait(150);
    await N.page.click('#modal #menuPhoto'); await wait(250);
    const t = await N.page.evaluate(() => ({ wide: document.documentElement.scrollWidth > window.innerWidth, sheetWide: (s => s.scrollWidth > s.clientWidth + 1)(document.querySelector('#modal .sheet')), sizes: [...document.querySelectorAll('#modal .sheet .row .btn, #modal .sheet .sheet-h [aria-label="Close"]')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) }));
    ok(!t.wide && !t.sheetWide && t.sizes.length === 4 && t.sizes.every(([w, h]) => w >= 44 && h >= 44), '2. at 320 px its buttons are 44 px targets and nothing scrolls sideways', t);
    ok(!N.errors.length, '2. no page errors at 320 px', N.errors);
    await N.browser.close();
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
