// r65.3: a double tap never zooms, anywhere (NEW-29; V, 2026-10-31, on r65.2: "I can still double tap into the app
// like a fake webpage"). r65.2 set touch-action: manipulation on the root only. touch-action is not inherited, and the
// touch behaviours an element allows are its own and its ancestors' only up to the nearest scrolling area (a sheet, a
// side-scrolling row): inside one, the root's rule does not reach. iPhone Safari is also unreliable with a rule on the
// root alone. Each case fails on r65.2 (`node tests/r65-3.js baselines/r65.2.html`, or the build before) unless it
// says it is a guard:
//   1  every element on every tab, in a workout and in the sheets that scroll (the menu, the calendar, the Guide, an
//      exercise's sheet) takes taps as taps: touch-action manipulation on the element itself, so no scrolling area
//      between it and the root lets a double tap zoom;
//   2  guards: the grips keep none (a drag is a drag), and the 3D body keeps pan-y (it turns sideways, scrolls up
//      and down).
const H = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 800) : ''); } else console.log('ok  ', m); };
const FILE = process.argv[2] || 'index.html';
const wait = ms => new Promise(r => setTimeout(r, ms));
// The drawn elements that take no touch rule of their own: anything set (none, pan-y, manipulation) is a choice.
const OWN = ['none', 'pan-y', 'pan-x', 'pinch-zoom', 'manipulation'];

(async () => {
  const P = await H.open(FILE, { clock: '2026-10-24T10:00:00', touch: true });
  const ev = (f, a) => P.page.evaluate(f, a);
  try {
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.invalidate(); L.render(); });
    // Every element drawn, with its computed touch-action; the root's own rule is read apart.
    const scan = where => ev(([where, OWN]) => {
      const bad = []; let n = 0;
      for (const el of document.querySelectorAll('body, body *')) {
        if (el.closest('script,style,template,svg defs')) continue;
        const r = el.getBoundingClientRect(); if (!r.width && !r.height) continue;
        n++;
        const v = getComputedStyle(el).touchAction;
        if (!OWN.includes(v)) bad.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ' ' + v);
      }
      return { where, n, bad: [...new Set(bad)].slice(0, 12), count: bad.length };
    }, [where, OWN]);
    const screens = [
      ['Today', async () => { await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); }],
      ['Plan', async () => { await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); }); }],
      ['Stats', async () => { await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); }); }],
      ['History', async () => { await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); }],
      ['Settings', async () => { await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); }); }],
      ['the menu (a sheet)', async () => { await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); L.ACT.menuOpen({ dataset: {} }); L.render(); }); }],
      ['the calendar (a sheet)', async () => { await ev(() => { const L = window.__ironlog; L.ACT.mClose(); L.ACT.calOpen({ dataset: { ym: '2026-10' } }); L.render(); }); }],
      ['the Guide (a sheet)', async () => { await ev(() => { const L = window.__ironlog; L.ACT.mClose(); L.ACT.guideOpen({ dataset: {} }); L.render(); }); }],
      ["an exercise's sheet", async () => { await ev(() => { const L = window.__ironlog; L.ACT.mClose(); L.ACT.exEdit({ dataset: { ex: 'bench' } }); L.render(); }); }],
      ['a workout', async () => { await ev(() => { const L = window.__ironlog; L.ACT.mClose(); L.ui.tab = 'today'; L.render(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); }); }]
    ];
    for (const [name, go] of screens) {
      await go(); await wait(250);
      const s = await scan(name);
      ok(s.n > 20 && s.count === 0, `1. ${name}: every element takes taps as taps (${s.n} drawn)`, s);
    }
    const g = await ev(() => {
      const L = window.__ironlog; L.ui.tab = 'settings'; L.render();
      const pick = sel => { const el = document.querySelector(sel); return el ? getComputedStyle(el).touchAction : 'absent'; };
      const c = document.createElement('canvas'); c.className = 'bm3d-canvas'; document.body.appendChild(c); const cv = getComputedStyle(c).touchAction; c.remove();
      return { grip: pick('.grip, .sgrip, .dgrip, .bgrip'), canvas: cv };
    });
    ok(g.grip === 'none', '2. guard: a grip keeps none, so a drag is a drag', g);
    ok(g.canvas === 'pan-y', '2. guard: the 3D body keeps pan-y', g);
  } finally { await H.settle(P.ctx.close(), 'context close'); await H.settle(P.browser.close(), 'browser close'); }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('crash', e.stack); process.exit(1); });
