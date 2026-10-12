// r42 (V, 2026-10-12): the look without the generated-app defaults, and three
// copy changes. Today's date has no comma ("Mon Oct 12"); the Muscle map's
// summary is a count out of the muscles with a target ("15 of 19 on target");
// workout minutes read "~75 min", not "about 75 min". The look: Today has no
// card, titles are not in capitals, the accent is kept for go and done (Start,
// a ticked set) while the active tab and the library button are ink, no frosted
// bars, and every control that moved keeps its 44 px touch target. Light and
// dark, 390 and 320 px.
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

      // Copy.
      const c = await ev(() => {
        const L = window.__ironlog;
        const eye = document.querySelector('.hero .eyebrow').textContent;
        const meta = document.querySelector('.hero .muted').textContent;
        const map = document.querySelector('[data-sk="today:map"] .sec-s').textContent.trim();
        return { eye, meta, map, track: L.TRACK_ONLY.size, view: document.getElementById('view').innerText };
      });
      ok(/^Mon Oct 12 · /.test(c.eye), 'Today\'s date has no comma: Mon Oct 12' + T, c.eye);
      ok(/· ~\d+ min$/.test(c.meta) && !/about/.test(c.meta), 'the day\'s minutes read ~N min' + T, c.meta);
      ok(!/about \d+ min/.test(c.view), 'nothing on Today says "about N min"' + T);
      // 23 muscle groups (tests/map3d.js), less the tracked-only ones, which have no target.
      const m = c.map.match(/^(\d+) of (\d+) on target$/);
      ok(m && +m[2] === 23 - c.track && +m[1] <= +m[2], 'the Muscle map summary is a count out of the muscles with a target' + T, c.map);

      // Look.
      const s = await ev(() => {
        const cs = e => getComputedStyle(e); const root = cs(document.documentElement);
        const tok = n => { const d = document.createElement('i'); d.style.color = `var(${n})`; document.body.appendChild(d); const v = cs(d).color; d.remove(); return v; };
        const hero = document.querySelector('.hero'), h2 = hero.querySelector('h2'), start = hero.querySelector('[data-act="startSession"]');
        const tab = document.querySelector('.tabs button[aria-current="page"]');
        const box = sel => [...document.querySelectorAll(sel)].map(e => Math.round(e.getBoundingClientRect().height));
        return {
          heroBg: cs(hero).backgroundColor, heroImg: cs(hero).backgroundImage, heroShadow: cs(hero).boxShadow,
          upper: cs(h2).textTransform, startBg: cs(start).backgroundColor, volt: tok('--volt'), ink: tok('--ink'),
          tabBar: getComputedStyle(tab, '::before').backgroundColor,
          blur: [cs(document.querySelector('.top')).backdropFilter, cs(document.querySelector('.tabs')).backdropFilter],
          heroBtns: box('.hero .btn:not(.primary)'), adds: box('.moreline .chip.add'),
          over: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      ok(s.heroBg === 'rgba(0, 0, 0, 0)' && s.heroImg === 'none' && s.heroShadow === 'none', 'Today has no card: no fill, glow or edge' + T, s);
      ok(s.upper === 'none', 'the day\'s name is not set in capitals' + T);
      ok(s.startBg === s.volt, 'Start keeps the accent' + T, [s.startBg, s.volt]);
      ok(s.tabBar === s.ink, 'the active tab is marked in ink, not the accent' + T, [s.tabBar, s.ink]);
      ok(s.blur.every(b => b === 'none'), 'no frosted header or tab bar' + T, s.blur);
      ok(s.heroBtns.length >= 2 && s.heroBtns.every(h => h >= 44) && s.adds.every(h => h >= 44), 'Change, More options and the + section buttons keep 44 px targets' + T, [s.heroBtns, s.adds]);
      ok(!s.over, 'no horizontal overflow on Today' + T);

      // Plan: the library button in ink.
      await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); });
      const lib = await ev(() => { const b = document.querySelector('.libbtn'); const d = document.createElement('i'); d.style.color = 'var(--volt)'; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return { bg: getComputedStyle(b).backgroundColor, icon: getComputedStyle(b.querySelector('.lb-i')).backgroundColor, volt: v }; });
      ok(lib.bg === 'rgba(0, 0, 0, 0)' && lib.icon !== lib.volt, 'the Exercise library button is not in the accent' + T, lib);

      // Session: the exercise is a stretch of the page, a ticked set keeps the accent, minutes read ~N min left.
      await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
      await page.click('.hero [data-act="startSession"]'); await page.waitForTimeout(150);
      // The header as first drawn, before any tick (the first r42 build still said "about" here).
      const m0 = await ev(() => document.querySelector('.ph .meta').textContent);
      ok(/~\d+ min left/.test(m0) && !/about/.test(m0), 'the session header reads ~N min left before any set is ticked' + T, m0);
      await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await page.waitForTimeout(150);
      const ss = await ev(() => {
        const cs = e => getComputedStyle(e); const b = document.querySelector('#view section.block');
        const d = document.createElement('i'); d.style.color = 'var(--volt)'; document.body.appendChild(d); const v = cs(d).color; d.remove();
        return { bg: cs(b).backgroundColor, radius: cs(b).borderTopLeftRadius, tick: cs(document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]')).backgroundColor, volt: v, meta: document.querySelector('.ph .meta').textContent, over: document.documentElement.scrollWidth > window.innerWidth };
      });
      ok(ss.bg === 'rgba(0, 0, 0, 0)' && ss.radius === '0px', 'a session exercise is not a card' + T, ss);
      ok(ss.tick === ss.volt, 'a ticked set keeps the accent' + T, [ss.tick, ss.volt]);
      ok(/~\d+ min left/.test(ss.meta) && !/about/.test(ss.meta), 'the session header reads ~N min left' + T, ss.meta);
      ok(!ss.over, 'no horizontal overflow in the session' + T);
      ok(!errors.length, 'no console errors' + T, errors);
      await browser.close();
    }
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); console.log('FAIL crashed'); process.exit(1); });
