// The profile photo (2.33 and 2.34; opened large since 2.60, NEW-141). A feature suite (CLAUDE.md, Tests): new checks
// of the profile photo go here. Signed in, as the photo is the account's (on a stand-in account service, so the source
// build; the built app's own account script reads it in tests/storage-sync-account.js). Run on the build before
// (`node tests/photo.js baselines/r105.html`, 2.59) every section fails there.
//   1  A photo picked in the menu is kept as a 1024 px square JPEG (256 until 2.60 and 512 until 2.70, each soft once
//      enlarged: V, 2026-11-15, NEW-169). Opened large on a 393 pt iPhone at 3 pixels a point, it is drawn at about its
//      own size, never stretched. Shrunk by averaging, in the app's own code, so every browser gives the same: a
//      picture of fine black and white lines shrunk 3 times comes out every kept pixel a mix of the lines it covers,
//      never black or white as they are (WebKit's drawImage, every iPhone's browser, read one pixel of each 3 and kept
//      the lines whole: GitHub's WebKit run of 6adeefe, and the same here with that drawing's smoothing off).
//   2  With a photo, a tap on it in the menu opens it large, with Change photo, Remove photo and Close; Change photo
//      puts the new one in the sheet and on the menu button; Remove asks first and then takes it away; with no
//      photo, the menu's photo picks one, as before. Every button there is a 44 px target, and nothing scrolls
//      sideways at 320 px.
//   3  A photo an older build kept at 256 or 512 px is soft opened large, and picked again it is kept at 1024 (V,
//      2026-11-16: his came out sharp once picked again): the first time the menu shows one, and once no other message
//      shows, the app says once to pick it again, with the button to use; not again on that phone, and not for a photo
//      kept at 1024 or one picked smaller than 1024 (picked again, it stays the same). Fails on 2.71
//      (`node tests/photo.js baselines/r117.html`): nothing is said.
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
    await pg.setInputFiles('#modal #menuPhoto input[data-photo]', await pngFile(pg, 3024, 4032)); await photoIn(pg);
    const b = await imgOf(pg, '#saveState img.ssb-ph');
    ok(b && b.src.startsWith('data:image/jpeg;base64,') && b.w === 1024 && b.h === 1024, '1. a photo picked in the menu, a phone camera\'s 3024 x 4032, is kept as a 1024 px square JPEG', b && { w: b.w, h: b.h });
    const size = await pg.evaluate(() => (localStorage.getItem(window.__ironlog.KEY + '.photo') || '').length);
    ok(size > 0 && size < 120000, '1. and still small on the phone', size);
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.browser.close();
    // Fine lines, one pixel each, black and white: shrunk 3 times, each kept pixel is the average of the 3 rows it covers
    // (two of one and one of the other: 85 or 170, as an area average gives), never black or white as the lines are, which
    // is the grain of a photo shrunk by reading one pixel of each 3.
    const G = await app();
    await G.page.click('#saveState'); await wait(200);
    const lines = await G.page.evaluate(() => { const c = document.createElement('canvas'); c.width = 3072; c.height = 3072; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 3072, 3072); x.fillStyle = '#000'; for (let y = 0; y < 3072; y += 2) x.fillRect(0, y, 3072, 1); return c.toDataURL('image/png').split(',')[1]; });
    await G.page.setInputFiles('#modal #menuPhoto input[data-photo]', { name: 'lines.png', mimeType: 'image/png', buffer: Buffer.from(lines, 'base64') }); await photoIn(G.page);
    const grey = await G.page.evaluate(() => new Promise(res => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0, s = 0, s2 = 0, lo = 255, hi = 0; for (let i = 0; i < d.length; i += 4 * 7) { const v = d[i]; n++; s += v; s2 += v * v; lo = Math.min(lo, v); hi = Math.max(hi, v); } const m = s / n; res({ mean: Math.round(m), sd: Math.round(Math.sqrt(s2 / n - m * m) * 10) / 10, lo, hi }); }; im.src = localStorage.getItem(window.__ironlog.KEY + '.photo'); }));
    ok(grey.lo >= 40 && grey.hi <= 215 && grey.mean > 100 && grey.mean < 156, '1. fine black and white lines shrunk to the kept size are averaged: every kept pixel a mix of the lines it covers, none black or white as they are, grey overall', grey);
    await G.browser.close();
    // Opened large on V's iPhone (393 pt, 3 pixels a point): drawn at no more than about its own pixels.
    const I = await open(FILE, { w: 393, h: 852, dpr: 3, clock: '2026-11-12T10:00:00', setup: ctx => ctx.addInitScript(SIGNED_IN) });
    await I.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1'); L.saveNow(); L.render(); });
    await I.page.waitForFunction(() => !!window.__ironlog.acctUser(), null, { timeout: 5000 }).catch(() => {});
    await I.page.evaluate(() => window.__ironlog.render()); await wait(300);
    await I.page.click('#saveState'); await wait(200);
    await I.page.setInputFiles('#modal #menuPhoto input[data-photo]', await pngFile(I.page, 3024, 4032)); await photoIn(I.page); await wait(150);
    await I.page.click('#modal #menuPhoto'); await wait(250);
    const big = await imgOf(I.page, '#modal .sheet img.pbig');
    ok(big && big.shown * 3 <= big.w * 1.1, '1. opened large on a 393 pt iPhone, its pixels cover the screen\'s: shown at no more than about its own size', big && { kept: big.w, shownPt: big.shown, screenPx: big.shown * 3 });
    ok(!I.errors.length, '1. no page errors on the iPhone', I.errors);
    await I.browser.close();
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
    const t = await N.page.evaluate(() => ({ wide: (document.getElementById('page')||document.documentElement).scrollWidth > window.innerWidth, sheetWide: (s => s.scrollWidth > s.clientWidth + 1)(document.querySelector('#modal .sheet')), sizes: [...document.querySelectorAll('#modal .sheet .row .btn, #modal .sheet .sheet-h [aria-label="Close"]')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }) }));
    ok(!t.wide && !t.sheetWide && t.sizes.length === 4 && t.sizes.every(([w, h]) => w >= 44 && h >= 44), '2. at 320 px its buttons are 44 px targets and nothing scrolls sideways', t);
    ok(!N.errors.length, '2. no page errors at 320 px', N.errors);
    await N.browser.close();
  }

  if (run(3)) {
    const TIP = 'Your profile photo was kept small by an earlier version, so it looks soft opened large. Open the menu, tap your photo and choose Change photo to keep it sharp.';
    /** The app opened again holding a photo kept at `edge` px as the phone's copy, as an older build left it, shown in the menu button. */
    const withPhoto = async (edge, D0) => {
      const D = D0 || await app();
      if (edge) await D.page.evaluate(edge => { const c = document.createElement('canvas'); c.width = edge; c.height = edge; const x = c.getContext('2d'); x.fillStyle = '#4a6'; x.fillRect(0, 0, edge, edge); x.fillStyle = '#fff'; x.fillRect(edge / 4, edge / 4, edge / 2, edge / 2); localStorage.setItem(window.__ironlog.KEY + '.photo', c.toDataURL('image/jpeg', 0.85)); }, edge);
      await D.page.reload(); await D.page.waitForFunction(() => window.__ironlog && window.__ironlog.acctUser(), null, { timeout: 8000 }).catch(() => {});
      await D.page.evaluate(() => window.__ironlog.render());
      return D;
    };
    /** Every message shown within `ms`, as read off the page every 200 ms. */
    const said = async (page, ms) => { const seen = []; for (let t = 0; t < ms; t += 200) { const s = await page.evaluate(() => { const e = document.getElementById('toast'); return e && !e.hidden ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }); if (s && !seen.includes(s)) seen.push(s); await wait(200); } return seen; };
    for (const edge of [512, 256]) {
      const D = await withPhoto(edge);
      const shown = await photoIn(D.page);
      // Long enough for it to be read (shown 1.5 s in, read 4 s later): a note is marked said only once read, so one
      // closed before then is said again (REV33-4, messages.js 6).
      const first = await said(D.page, 6500);
      ok(shown && first.includes(TIP), `3. a photo kept at ${edge} px, shown in the menu: the app says once to pick it again, with the button to use`, { shown, said: first });
      await withPhoto(0, D); await photoIn(D.page);
      const again = await said(D.page, 3500);
      ok(!again.includes(TIP), `3. opened again on that phone (${edge} px), it is not said again`, again);
      ok(!D.errors.length, `3. no page errors (${edge} px)`, D.errors);
      await D.browser.close();
    }
    // Another message showing when the photo shows: the tip waits for it to go, never covering it.
    {
      const D = await app();
      await D.page.evaluate(() => { const c = document.createElement('canvas'); c.width = 512; c.height = 512; c.getContext('2d').fillRect(0, 0, 512, 512); localStorage.setItem(window.__ironlog.KEY + '.photo', c.toDataURL('image/jpeg', 0.85)); });
      await D.page.reload(); await D.page.waitForFunction(() => window.__ironlog && window.__ironlog.acctUser(), null, { timeout: 8000 }).catch(() => {});
      await D.page.evaluate(() => { window.__ironlog.toast('Another message', false, 4000); window.__ironlog.render(); });
      const t0 = Date.now(); const log = [];
      for (let t = 0; t < 8000; t += 200) { const s = await D.page.evaluate(() => { const e = document.getElementById('toast'); return e && !e.hidden ? e.innerText.replace(/\s+/g, ' ').trim() : ''; }); log.push([Date.now() - t0, s]); if (s === TIP) break; await wait(200); }
      const lastOther = Math.max(...log.filter(([, s]) => s === 'Another message').map(([t]) => t)), tipAt = (log.find(([, s]) => s === TIP) || [null])[0];
      ok(tipAt != null && lastOther >= 3600 && tipAt > lastOther, '3. with another message showing, the tip waits until it has gone, never covering it', { lastOther, tipAt });
      await D.browser.close();
    }
    for (const edge of [1024, 600]) {
      const D = await withPhoto(edge);
      const shown = await photoIn(D.page);
      const heard = await said(D.page, 3500);
      ok(shown && !heard.includes(TIP), `3. a photo kept at ${edge} px${edge < 1024 ? ' (picked smaller than 1024)' : ''}: nothing is said`, { shown, said: heard });
      await D.browser.close();
    }
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
