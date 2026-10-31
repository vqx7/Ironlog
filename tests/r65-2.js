// r65.2: the app feels like an app, not a web page (PENDING 369, V 2026-10-31:
// "when I double tap into part of a screen it zooms into it like a webpage").
// Each case fails on r65 (`node tests/r65-2.js baselines/r65.html`) unless it
// says it is a guard:
//   1  a double tap never zooms the page (touch-action: manipulation on the
//      root, so every tap is a tap); pinch to zoom stays, an accessibility aid
//      iOS keeps whatever a page says;
//   2  a long press on the app's own text (a button, a tab, a row's title) does
//      not select it or open the phone's Copy and Look Up menu, and a tap
//      leaves no grey flash; the buttons' own press feedback (they shrink a
//      little) is what shows a tap;
//   3  a guard: what the lifter types or may copy stays selectable: every
//      field, the text boxes (a backup shown to copy is one), and a load typed
//      into a set is still typed and kept.
const H = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R65_2_ONLY ? process.env.R65_2_ONLY.split(',').map(Number) : null;
const run = n => !ONLY || ONLY.includes(n);

(async () => {
  const P = await H.open(FILE, { clock: '2026-10-24T10:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
  try {
    // A workout open, so there are buttons, rows, tabs and set fields on the page.
    await ev(async () => {
      const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.invalidate(); L.render();
      L.ACT.startSession({ dataset: { day: '0', light: '0' } });
      await new Promise(r => { const t = setInterval(() => { if (document.querySelector('.sg input[data-f="w"]')) { clearInterval(t); r(); } }, 20); });
    });
    const style = (sel, props) => ev(([sel, props]) => {
      const el = document.querySelector(sel); if (!el) return null;
      const cs = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)]));
    }, [sel, props]);
    const sel = s => ev(s => { const el = document.querySelector(s); if (!el) return null; const cs = getComputedStyle(el); return cs.userSelect || cs.webkitUserSelect || cs.getPropertyValue('-webkit-user-select'); }, s);

    if (run(1)) {
      const root = await style('html', ['touch-action']);
      ok(root && root['touch-action'] === 'manipulation', '1. a double tap never zooms: the root takes taps as taps (touch-action: manipulation)', root);
      // The 3D body keeps its own vertical scrolling; the root's rule narrows nothing it needs.
      const canvasRule = await ev(() => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } }).some(r => r.selectorText === '.bm3d-canvas' && /touch-action:\s*pan-y/.test(r.cssText)));
      ok(canvasRule, '1. guard: the 3D body still sets its own vertical scrolling (pan-y)');
    }
    if (run(2)) {
      for (const [s, what] of [['.btn', 'a button'], ['.tabs button', 'a tab'], ['.block h3', "an exercise's name"], ['body', 'the page']]) {
        const u = await sel(s);
        ok(u === 'none', `2. a long press on ${what} selects nothing`, { sel: s, userSelect: u });
      }
      const callout = await ev(() => CSS.supports('-webkit-touch-callout', 'none') ? getComputedStyle(document.querySelector('.btn')).getPropertyValue('-webkit-touch-callout') : 'unsupported');
      ok(callout === 'none' || callout === 'unsupported', '2. a long press opens no Copy and Look Up menu (where the engine has one)', callout);
      const flash = await style('.btn', ['-webkit-tap-highlight-color']);
      ok(flash && /rgba\(0, 0, 0, 0\)|transparent/.test(flash['-webkit-tap-highlight-color']), '2. a tap leaves no grey flash', flash);
      const press = await ev(() => [...document.styleSheets].flatMap(s => { try { return [...s.cssRules]; } catch (e) { return []; } }).some(r => r.selectorText === '.btn:active' && /transform/.test(r.cssText)));
      ok(press, '2. guard: a button still shows its press (it shrinks a little)');
    }
    if (run(3)) {
      const field = await sel('.sg input[data-f="w"]');
      ok(field === 'text' || field === 'auto', '3. guard: a set field stays selectable', field);
      const ta = await ev(() => { const t = document.createElement('textarea'); t.readOnly = true; t.value = '{"a":1}'; document.body.appendChild(t); const cs = getComputedStyle(t); const v = cs.userSelect || cs.webkitUserSelect; t.remove(); return v; });
      ok(ta === 'text' || ta === 'auto', '3. guard: a text box (a backup shown to copy) stays selectable', ta);
      const typed = await ev(async () => {
        const f = document.querySelector('.sg input[data-f="w"]'); f.focus(); f.value = '182.5'; f.dispatchEvent(new Event('input', { bubbles: true })); f.blur();
        f.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 600));
        const L = window.__ironlog; const b = L.state.draft && L.state.draft.ex[0]; const w = b && b.sets[0] && b.sets[0].w;
        return { field: document.querySelector('.sg input[data-f="w"]').value, stored: w };
      });
      ok(typed.field === '182.5' && typed.stored != null, '3. guard: a load typed into a set is still typed and kept', typed);
    }
  } finally { await H.settle(P.ctx.close(), 'context close'); await H.settle(P.browser.close(), 'browser close'); }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('crash', e.stack); process.exit(1); });
