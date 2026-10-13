// r42 (V, 2026-10-12): three copy changes, nothing else. Today's date has no
// comma ("Mon Oct 12"); the Muscle map's summary is a count out of the muscles
// with a target ("15 of 19 on target"); workout minutes read "~75 min" and
// "~70 min left", never "about". Light and dark, 390 and 320 px.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x)); } else console.log('ok  ', m); };
(async () => {
  for (const theme of ['dark', 'light']) {
    for (const w of [390, 320]) {
      const T = ` (${theme}, ${w} px)`;
      const { browser, page, errors } = await open('index.html', { touch: true, w, h: 844, clock: '2026-10-12T10:00:00', realStarter: true });
      const ev = (f, a) => page.evaluate(f, a);
      await ev(t => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.theme = t; L.makeDemo(); for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of L.state[k]) delete x.demo; L.invalidate(); L.ui.tab = 'today'; L.render(); }, theme);
      await page.waitForTimeout(200);
      const c = await ev(() => {
        const L = window.__ironlog;
        return { eye: document.querySelector('.hero .eyebrow').textContent, meta: document.querySelector('.hero .muted').textContent,
          map: document.querySelector('[data-sk="today:map"] .sec-s').textContent.trim(), track: L.TRACK_ONLY.size,
          view: document.getElementById('view').innerText, over: document.documentElement.scrollWidth > window.innerWidth };
      });
      ok(/^Mon Oct 12 · /.test(c.eye), 'Today\'s date has no comma: Mon Oct 12' + T, c.eye);
      ok(/· ~\d+ min$/.test(c.meta) && !/about/.test(c.meta), 'the day\'s minutes read ~N min' + T, c.meta);
      ok(!/about \d+ min/.test(c.view), 'nothing on Today says "about N min"' + T);
      // 23 muscle groups (tests/map3d.js), less the tracked-only ones, which have no target.
      const m = c.map.match(/^(\d+) of (\d+) on target$/);
      ok(m && +m[2] === 23 - c.track && +m[1] <= +m[2], 'the Muscle map summary is a count out of the muscles with a target' + T, c.map);
      ok(!c.over, 'no horizontal overflow on Today' + T);
      // This week so far, before a full week is averaged.
      await ev(() => { const L = window.__ironlog; L.ui.mapSrc = 'week'; L.render(); });
      const wk = await ev(() => document.querySelector('[data-sk="today:map"] .sec-s').textContent.trim());
      ok(/^\d+ of \d+ on target/.test(wk), 'the This week view says the same count' + T, wk);
      // Session header: as first drawn, and after a tick.
      await ev(() => { const L = window.__ironlog; L.ui.mapSrc = 'avg'; L.render(); });
      await page.click('.hero [data-act="startSession"]'); await page.waitForTimeout(150);
      const m0 = await ev(() => document.querySelector('.ph .meta').textContent);
      ok(/~\d+ min left/.test(m0) && !/about/.test(m0), 'the session header reads ~N min left before any set is ticked' + T, m0);
      await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await page.waitForTimeout(150);
      const m1 = await ev(() => document.querySelector('.ph .meta').textContent);
      ok(/~\d+ min left/.test(m1) && !/about/.test(m1), 'and after a set is ticked' + T, m1);
      ok(!errors.length, 'no console errors' + T, errors);
      await browser.close();
    }
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); console.log('FAIL crashed'); process.exit(1); });
