// The screen frame (2.78.1): the page scrolls inside #page and the document never does, so nothing scrolls under the
// bars along the bottom (the tab bar, the rest timer) for an iPhone to misplace them (a friend's iPhone, 2026-11-25:
// after a picker or the keyboard, the tab bar stood halfway up History over the page). A feature suite (CLAUDE.md,
// Tests). On the build before (`node tests/frame.js baselines/r125.html`), 2.78: section 1's checks that the document
// stays at its top fail, while its tab-bar checks pass (in Chromium a bar pinned to the screen never moves; only an
// iPhone moves it), and section 2 fails, having no watch; 3 passes (a guard), and 4 fails only on the document having
// scrolled, the sheet holding the page there too; 5 passes on 2.78 and fails on 2.78.1 as first pushed (d06c8176),
// which counted the status bar twice inside the frame (REV33-1).
//   1  The document never scrolls: on every tab, a long page scrolled by the wheel and (in Chromium) by touch moves the page inside
//      the frame; the document stays at its top, and the tab bar's bottom and the rest timer stay on the screen's
//      bottom edge, as they were before the scroll.
//   2  The document is put back: moved as iOS moves it to show a field above the keyboard, it is put back once no
//      field is typed in (a field losing focus, the visible area changing, the document scrolling), and left alone
//      while one is typed in or the screen is zoomed in.
//   3  (a guard) The suites' sideways checks still see a page wider than the screen: an element wider than the screen
//      in the page makes the frame wider than it shows, so those checks are not empty.
//   4  (a guard) An open sheet holds the page still under it, and the page keeps where it was once the sheet closes.
//   5  With a notched iPhone's status bar (47 px), the frame adds no second status bar: the update bar and Stats' jump
//      bar stick right under the status bar, and whatever the app scrolls into view (a Stats jump, the menu's
//      backups, the next exercise after a lift's last set) lands its own scroll margin under it, where 2.78 put it.
// FRAME_ONLY=1,2 runs some sections.
const { open, ENGINE } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.FRAME_ONLY ? process.env.FRAME_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
// The element the page scrolls in: the frame, or the document on a build before it.
const PAGE = `(document.getElementById('page') || document.scrollingElement)`;

async function phone(touch) {
  const P = await open(FILE, { w: 390, h: 844, touch, clock: '2026-11-25T10:00:00' });
  await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo();
    for (const k of ['installLater', 'acctLater', 'tipWake']) localStorage.setItem(L.KEY + '.' + k, '1');
    L.saveNow(); L.ui.tab = 'history'; L.render(); });
  await wait(200);
  return P;
}
// Where things stand: the document's scroll, the page's, and the bars' edges against the screen's.
const at = P => P.page.evaluate(PAGE => {
  const pg = eval(PAGE), tabs = document.getElementById('tabs').getBoundingClientRect(), tm = document.getElementById('timer');
  const t = tm && !tm.hidden && tm.getClientRects().length ? tm.getBoundingClientRect() : null;
  return { doc: Math.round(window.scrollY), page: Math.round(pg.scrollTop), tabsBottom: Math.round(tabs.bottom), tabsTop: Math.round(tabs.top), timerBottom: t ? Math.round(t.bottom) : null, screen: innerHeight };
}, PAGE);

(async () => {
  if (run(1)) {
    // By touch only in Chromium: Playwright's WebKit can tap but cannot drag a finger the browser scrolls by (a touch
    // event made in the page scrolls nothing), so WebKit takes the wheel alone.
    if (ENGINE !== 'chromium') console.log(`note frame section 1 (${ENGINE}): scrolled by the wheel; the drag by touch runs in Chromium`);
    for (const touch of ENGINE === 'chromium' ? [false, true] : [false]) {
      const P = await phone(touch);
      const how = touch ? 'by touch' : 'by the wheel';
      for (const tab of ['history', 'dash', 'settings', 'program', 'today']) {
        await P.page.evaluate(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); }, tab);
        await wait(150);
        const before = await at(P);
        if (touch) {
          // A finger dragged up the middle of the screen, as a lifter reads down the page: the browser's own touch input,
          // which scrolls as a finger does (a touch event made in the page scrolls nothing).
          const cdp = await P.ctx.newCDPSession(P.page);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y: 600 }] });
          for (let y = 590; y >= 100; y -= 10) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          await P.page.mouse.move(195, 420);
          await P.page.mouse.wheel(0, 700);
        }
        await wait(350);
        const after = await at(P);
        ok(after.page > 0 && after.doc === 0, `1. ${tab}, scrolled ${how}: the page moves inside the frame, the document stays at its top`, { before, after });
        ok(after.tabsBottom === after.screen && after.tabsBottom === before.tabsBottom, `1. ${tab}, scrolled ${how}: the tab bar's bottom is the screen's bottom edge, as before the scroll`, { before, after });
      }
      // A session with the rest timer running: the timer sits on the tab bar, and stays there as the session scrolls.
      await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
      await wait(100);
      await P.page.click('.hero [data-act="startSession"]');
      await wait(300);
      // A set ticked starts the rest timer, as at the gym.
      await P.page.fill('.sg input[data-f="w"]', '50');
      await P.page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      await P.page.click('[data-act="sDone"]');
      await wait(400);
      const t0 = await at(P);
      await P.page.mouse.move(195, 420);
      await P.page.mouse.wheel(0, 600);
      await wait(300);
      const t1 = await at(P);
      ok(t0.timerBottom !== null && t1.timerBottom === t0.timerBottom && t1.timerBottom <= t1.tabsTop + 1 && t1.doc === 0 && t1.page > 0, `1. a session scrolled ${how}: the rest timer stays on the tab bar, where it was`, { t0, t1 });
      await P.browser.close();
    }
  }

  if (run(2)) {
    const P = await phone(true);
    // iOS moves the document to show a field above the keyboard, though the document has nothing to scroll: here the
    // document is given room for a moment and moved, as iOS leaves it.
    const move = () => P.page.evaluate(() => { document.documentElement.style.height = '200%'; document.body.style.height = '200%'; window.scrollTo(0, 300); return window.scrollY; });
    const unroom = () => P.page.evaluate(() => { document.documentElement.style.removeProperty('height'); document.body.style.removeProperty('height'); });
    const docY = () => P.page.evaluate(() => Math.round(window.scrollY));
    const hasSettle = await P.page.evaluate(() => typeof window.__ironlog.frameSettle === 'function');
    ok(hasSettle, '2. the app has a watch that puts the document back');
    // A field typed in: left where iOS holds it while the keyboard is up.
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await wait(100);
    await P.page.click('.hero [data-act="startSession"]');
    await wait(300);
    const field = '.sg input[data-f="w"]';
    await P.page.focus(field);
    const moved = await move();
    await P.page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await wait(100);
    ok(moved === 300 && (await docY()) === 300, '2. while a field is typed in, the document is left where iOS holds it', { moved, now: await docY() });
    // The field loses focus (the keyboard goes): the document is put back.
    await P.page.evaluate(() => document.activeElement.blur());
    await wait(450);
    ok((await docY()) === 0, '2. once the field loses focus, the document is put back at its top', { now: await docY() });
    // A picker (a select) that leaves the document moved without a field typed in: the visible area changing (its
    // size, or where it sits) puts it back. Moved and told in one task and read in it, before the document's own
    // scroll event (which comes in a later task) could put it back instead (REV33-5).
    for (const ev of ['resize', 'scroll']) {
      const vvBack = await P.page.evaluate(ev => {
        const vv = window.visualViewport; if (!vv) return null;
        document.documentElement.style.height = '200%'; document.body.style.height = '200%'; window.scrollTo(0, 300);
        const moved = window.scrollY; vv.dispatchEvent(new Event(ev));
        return { moved, after: Math.round(window.scrollY) };
      }, ev);
      ok(vvBack && vvBack.moved === 300 && vvBack.after === 0, `2. the visible area's ${ev} with no field typed in puts the document back`, vvBack);
      await wait(100);
    }
    // The document scrolled with no field typed in: put back at once.
    await move();
    await P.page.evaluate(() => window.dispatchEvent(new Event('scroll')));
    await wait(100);
    ok((await docY()) === 0, '2. the document scrolling with no field typed in is put back at once', { now: await docY() });
    // Zoomed in by the lifter: the visible area moves on purpose and is left alone.
    const zoomLeft = await P.page.evaluate(() => {
      const vv = window.visualViewport; if (!vv || typeof window.__ironlog.frameSettle !== 'function') return null;
      document.documentElement.style.height = '200%'; document.body.style.height = '200%'; window.scrollTo(0, 300);
      Object.defineProperty(vv, 'scale', { configurable: true, get: () => 2 });
      window.__ironlog.frameSettle();
      const y = window.scrollY;
      delete vv.scale;
      return y;
    });
    ok(zoomLeft === 300, '2. zoomed in, the visible area is left where the lifter moved it', { zoomLeft });
    await unroom();
    await P.browser.close();
  }

  if (run(3)) {
    const P = await phone(false);
    const w = await P.page.evaluate(PAGE => {
      const pg = eval(PAGE), v = document.getElementById('view');
      const before = pg.scrollWidth - pg.clientWidth;
      const wide = document.createElement('div'); wide.style.width = '700px'; wide.style.height = '10px'; v.appendChild(wide);
      const after = pg.scrollWidth - pg.clientWidth; wide.remove();
      return { before, after };
    }, PAGE);
    ok(w.before === 0 && w.after >= 300, '3. (a guard) an element wider than the screen makes the frame wider than it shows, so the suites\' sideways checks see it', w);
    await P.browser.close();
  }

  if (run(4)) {
    const P = await phone(false);
    await P.page.mouse.move(195, 420);
    await P.page.mouse.wheel(0, 500);
    await wait(250);
    const y0 = (await at(P)).page;
    // Opened as the menu button opens it, without scrolling the page back to the button (the bar scrolls away with it).
    await P.page.evaluate(() => window.__ironlog.ACT.menuOpen());
    await wait(300);
    await P.page.mouse.move(195, 200);
    await P.page.mouse.wheel(0, 400);
    await wait(250);
    const held = await at(P);
    await P.page.evaluate(() => window.__ironlog.ACT.mClose());
    await wait(300);
    const back = await at(P);
    ok(y0 > 0 && held.page === y0 && held.doc === 0, '4. (a guard) an open sheet holds the page still under it', { y0, held });
    ok(back.page === y0 && back.doc === 0, '4. (a guard) the page is where it was once the sheet closes', { y0, back });
    await P.browser.close();
  }

  if (run(5)) {
    const NOTCH = 47;
    // Within a pixel: layout rounds sub-pixel heights.
    const at1 = (top, want) => Math.abs(top - want) <= 1;
    // env(safe-area-inset-top) is 0 in a desktop browser: every style rule that reads it is given what a notched
    // iPhone's home-screen app gives it, as tests/r70.js section 11 does.
    const notch = P => P.page.evaluate(n => { for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch (e) { continue; } for (const r of rules) { if (!r.style) continue; for (const k of [...r.style]) { const v = r.style.getPropertyValue(k); if (v.includes('safe-area-inset-top')) r.style.setProperty(k, v.replace(/env\(safe-area-inset-top[^)]*\)/g, n + 'px'), r.style.getPropertyPriority(k)); } } } }, NOTCH);
    const P = await phone(false);
    await notch(P);
    // The update bar, History scrolled far down under it.
    const upd = await P.page.evaluate(async PAGE => {
      const L = window.__ironlog; L.ui.tab = 'history'; L.render(); if (window.ironlogUpdateReady) window.ironlogUpdateReady();
      await new Promise(r => setTimeout(r, 200));
      eval(PAGE).scrollTo(0, 1200); await new Promise(r => setTimeout(r, 200));
      const b = document.getElementById('updbar'); return b && !b.hidden ? Math.round(b.getBoundingClientRect().top) : null;
    }, PAGE);
    ok(upd !== null && at1(upd, NOTCH), '5. the update bar sticks right under the status bar, History scrolled under it', { upd });
    // Each of Stats' jumps: the jump bar stuck under the status bar, the section's heading its scroll margin under it.
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); });
    await wait(300);
    const secs = await P.page.evaluate(() => [...document.querySelectorAll('.jump [data-act="dashJump"]')].map(c => c.dataset.sec));
    const jumps = [];
    for (const sec of secs) jumps.push(await P.page.evaluate(async ([sec, PAGE]) => {
      const pg = eval(PAGE); pg.scrollTo(0, 0); await new Promise(r => setTimeout(r, 100));
      document.querySelector(`.jump [data-sec="${sec}"]`).click();
      // Read once the smooth scroll has ended: the page still for 300 ms, at most 4 s.
      for (let i = 0, y = -1; i < 40 && pg.scrollTop !== y; i++) { y = pg.scrollTop; await new Promise(r => setTimeout(r, 300)); }
      const el = document.getElementById('sec-' + sec);
      return { sec, top: Math.round(el.getBoundingClientRect().top), margin: parseFloat(getComputedStyle(el).scrollMarginTop), bar: Math.round(document.querySelector('.jump').getBoundingClientRect().top), end: pg.scrollTop >= pg.scrollHeight - pg.clientHeight - 1 };
    }, [sec, PAGE]));
    // A section near the page's end cannot be scrolled up that far; the page's end holds it lower.
    const placed = jumps.filter(j => !j.end);
    ok(secs.length >= 2 && placed.length >= 1 && placed.every(j => at1(j.bar, NOTCH) && at1(j.top, NOTCH + j.margin)), "5. a Stats jump sticks the jump bar under the status bar and lands the section's heading its own scroll margin under it", jumps);
    // The menu's backups: Settings' data section just under the status bar.
    const data = await P.page.evaluate(async () => { window.__ironlog.ACT.goBackup(); await new Promise(r => setTimeout(r, 400)); const e = document.getElementById('dataSec'); return e ? { top: Math.round(e.getBoundingClientRect().top), margin: parseFloat(getComputedStyle(e).scrollMarginTop) } : null; });
    ok(data && at1(data.top, NOTCH + data.margin), "5. the menu's backups land Settings' data section under the status bar", data);
    await P.browser.close();
    // The next exercise after a lift's last set: the fold glide lands it its own scroll margin under the status bar.
    const G = await open(FILE, { w: 390, h: 664, touch: true, clock: '2026-11-04T18:00:00' });
    await notch(G);
    await G.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); for (const x of L.state.sessions) delete x.demo;
      for (const k of ['installLater', 'acctLater', 'tipWake']) localStorage.setItem(L.KEY + '.' + k, '1'); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
    await G.page.click('.hero [data-act="startSession"]:not([data-light])');
    await wait(500);
    const n = await G.page.evaluate(() => window.__ironlog.state.draft.ex[0].sets.length);
    for (let si = 0; si < n; si++) {
      const p = await G.page.evaluate(([sel, PAGE]) => { const e = document.querySelector(sel); let r = e.getBoundingClientRect(); if (r.bottom > innerHeight - 200 || r.top < 80) eval(PAGE).scrollBy(0, r.top - innerHeight * 0.45); r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, [`[data-act="sDone"][data-b="0"][data-s="${si}"]`, PAGE]);
      await wait(300);
      await G.page.touchscreen.tap(p.x, p.y);
      await wait(si === n - 1 ? 2800 : 400);
    }
    const glide = await G.page.evaluate(() => { const a = document.getElementById('blk-1'); return { folded: !!document.querySelector('#blk-0.folded'), top: Math.round(a.getBoundingClientRect().top), margin: parseFloat(getComputedStyle(a).scrollMarginTop) }; });
    ok(glide.folded && at1(glide.top, NOTCH + glide.margin), "5. after a lift's last set the next exercise glides to its own scroll margin under the status bar", glide);
    await G.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
