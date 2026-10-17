// The tab bar on iOS 26's home-screen app (r51; two iPhone users,
// 2026-10-17: the bar rises and the page shrinks on History, Settings and
// sometimes Plan). iOS 26 gives an installed app's page that is shorter than
// the screen a viewport shorter by the status bar's height, so the fixed bar
// stops above the bottom edge; src/02-style.css holds the page to at least
// the screen's height there. No browser here can be an installed iOS app
// (Chromium does not emulate display-mode, and Playwright's WebKit has no
// home-screen mode), so the bug itself is V's friends' to confirm gone
// (OWNER.md, Checks on your phone). What this suite holds: the rule is on the
// page, scoped to the installed app, on the html element, capped by the
// screen's height and adding the status bar's inset; the browser accepts its
// value (a value it cannot read would be dropped in silence); and outside the
// installed app nothing changes.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
(async () => {
  const { browser, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-24T18:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  const r = await ev(() => {
    const rules = [];
    for (const sh of document.styleSheets) { let list; try { list = sh.cssRules; } catch (e) { continue; } for (const x of list) if (x instanceof CSSMediaRule && /display-mode:\s*standalone/.test(x.conditionText || x.media.mediaText)) for (const y of x.cssRules) rules.push({ sel: y.selectorText, min: y.style.minHeight }); }
    const html = rules.filter(x => x.sel === 'html');
    const value = html.length ? html[0].min : '';
    // The value as the browser reads it on an element of its own.
    const probe = document.createElement('div'); probe.style.minHeight = value; const accepted = probe.style.minHeight !== '';
    return { html, value, accepted, standalone: matchMedia('(display-mode: standalone)').matches, rootMin: getComputedStyle(document.documentElement).minHeight };
  });
  ok(r.html.length === 1, 'the installed app has one rule on the html element', r.html);
  ok(/min\(\s*100lvh\s*,/.test(r.value) && /env\(\s*safe-area-inset-top/.test(r.value) && /100%/.test(r.value), 'it holds the page to the screen\'s height, the viewport plus the status bar\'s inset, capped by 100lvh', r.value);
  ok(r.accepted, 'the browser reads the value (an unreadable one would be dropped in silence)', r.value);
  ok(!r.standalone && (r.rootMin === '0px' || r.rootMin === 'auto'), 'outside the installed app the page is as before (no minimum height)', { standalone: r.standalone, rootMin: r.rootMin });
  // History and Settings, where the users saw it, still fit as before outside the installed app.
  for (const tab of ['history', 'settings']) {
    const s = await ev(t => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = t; L.render(); return { tabs: !!document.querySelector('.tabs'), bottom: Math.round(document.querySelector('.tabs').getBoundingClientRect().bottom), h: innerHeight }; }, tab);
    ok(s.tabs && s.bottom === s.h, `the tab bar sits on the bottom edge on ${tab}`, s);
  }
  ok(errors.length === 0, 'no errors', errors);
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL', e.stack); process.exit(1); });
