// r65.1: the look V picked on 2026-10-30 with the look picker (PENDING 364),
// "Main card: Dark steel" in the dark theme and, V the same day, the same card
// in brushed silver in light; his other pick, "Background: True black", he took
// back out the same day. Each case fails on r65 (`node tests/r65-1.js
// baselines/r65.html`) unless it says it is a guard:
//   1  a guard: the dark page keeps r65's dark grey (#08090b) and its cards
//      and fields their greys, whether dark is chosen in Settings or comes
//      from the phone, and config's DARK_BG (read from R65_1_ROOT) is that
//      grey (V took true black back out on 2026-10-30);
//   2  Today's card is brushed steel, dark in dark and silver in light: a
//      steel edge along its top, a fine brushed grain over a metal gradient and
//      a thin rim, with no accent glow; its Start button and week ring lose
//      their glow;
//   3  the session's exercise cards and the Stats numbers carry a steel line
//      along their top in both themes (their border's colour, so nothing
//      moves), and
//      a full-width button, which shares the card's class, has none (NEW-19,
//      found by the review: it fails on 6d85719, r65.1's first commit);
//   4  a guard: every box on Today, a session and Stats, in both themes, is
//      the build before's, and so is every drawn style but on Today's card
//      and the steel lines.
const path = require('path');
const H = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', m); };
const FILE = process.argv[2] || 'index.html';
const BEFORE = process.env.R65_1_BEFORE || path.join(__dirname, '..', 'baselines', 'r65.html');
const ONLY = process.env.R65_1_ONLY ? process.env.R65_1_ONLY.split(',').map(Number) : null;
const run = n => !ONLY || ONLY.includes(n);

// Today, a session with two sets ticked, and Stats, on the demo log, in the theme asked.
const SCREENS = {
  today: `L.ui.tab = 'today'; L.render();`,
  session: `L.ui.tab = 'today'; L.render(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); await until(() => document.querySelector('.block'));
    for (const s of ['0', '1']) { L.ACT.sDone({ dataset: { b: '0', s } }); } L.render();`,
  stats: `L.ui.tab = 'dash'; L.render();`,
};
async function screen(file, name, mode, browser) {
  // mode: 'dark' (chosen in Settings), 'system-dark' (the phone's setting) or 'light'.
  const P = await H.open(file, { browser, clock: '2026-10-24T10:00:00', dark: mode === 'system-dark' });
  // The theme is saved and the page opened again in it, as a lifter sees it. Switched on a page already drawn,
  // WebKit kept one section's top line in the theme it was drawn in (GitHub runs 41169400974 and 41171695059,
  // r65's page as well: tracker NEW-21), which is no part of this release's look.
  await P.page.evaluate(theme => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.theme = theme; L.saveNow(); },
    mode === 'dark' ? 'dark' : mode === 'light' ? 'light' : 'system');
  await P.page.reload();
  await P.page.waitForFunction(() => window.__libs && window.__libs.chart && window.__libs.sortable && window.__ironlog);
  await P.page.evaluate(async ([run]) => {
    const L = window.__ironlog;
    const until = f => new Promise(r => { const t = setInterval(() => { if (f()) { clearInterval(t); r(); } }, 20); });
    // No transitions, so each build is read as it settles.
    const still = document.createElement('style'); still.textContent = '*,*::before,*::after{transition:none!important;animation:none!important}'; document.head.appendChild(still);
    L.makeDemo(); L.invalidate(); L.render();
    await (new Function('L', 'until', 'return (async()=>{' + run + '})()'))(L, until);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, [SCREENS[name]]);
  return P;
}
const css = (P, sel, props) => P.page.evaluate(([sel, props]) => {
  const el = document.querySelector(sel); if (!el) return null;
  const cs = getComputedStyle(el); return Object.fromEntries(props.map(p => [p, cs.getPropertyValue(p)]));
}, [sel, props]);
// Every element's computed style (sorted, so the order a browser lists custom properties in does not matter) and box, but the toast's, which comes and goes on a timer (the rest timer's first tip).
const dump = P => P.page.evaluate(() => [...document.body.querySelectorAll('*')].filter(e => (!e.closest('svg') || e.tagName === 'svg') && !e.closest('#toast')).map(e => {
  const cs = getComputedStyle(e); const kv = [];
  // Custom properties are the style sheet's inputs, not what is drawn; r65.1 adds three, so only drawn properties are compared.
  // A card's steel line is its top border's colour, meant to change; the rest of its style is held.
  const line = e.matches('.block:not(.btn), .kpis');
  for (let i = 0; i < cs.length; i++) if (!cs[i].startsWith('--') && !(line && /^border-(top|block-start)-color$/.test(cs[i]))) kv.push(cs[i] + ':' + cs.getPropertyValue(cs[i]));
  const r = e.getBoundingClientRect();
  return [e.tagName + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : ''), [r.x, r.y, r.width, r.height].map(v => Math.round(v * 10)).join(','), kv.sort().join(';'), !!e.closest('.hero')];
}));

(async () => {
  const browser = await H.engine.launch();
  try {
    if (run(1)) {
      for (const mode of ['dark', 'system-dark']) {
        const P = await screen(FILE, 'session', mode, browser);
        const body = await css(P, 'body', ['background-color']);
        const blk = await css(P, '.block', ['background-color']);
        // A set not yet done (a done set's fields take the accent's tint, as before).
        const field = await css(P, '.sg:not(.done):not(.head) input[data-f="w"]', ['background-color']);
        ok(body && body['background-color'] === 'rgb(8, 9, 11)', `1. guard: ${mode}: the page keeps its dark grey (#08090b)`, body);
        ok(blk && blk['background-color'] === 'rgb(19, 21, 24)', `1. guard: ${mode}: a card keeps its grey (#131518)`, blk);
        ok(field && field['background-color'] === 'rgb(28, 31, 35)', `1. guard: ${mode}: a field keeps its grey (#1c1f23)`, field);
        await P.ctx.close();
      }
    }
    if (run(1)) {
      // The phone's bar and the installed app's splash take config's DARK_BG (scripts/build.js, page.ts): read from R65_1_ROOT (a checkout; the repo by default).
      const cfg = require('fs').readFileSync(path.join(process.env.R65_1_ROOT || path.join(__dirname, '..'), 'src/app/config.ts'), 'utf8');
      const m = cfg.match(/export const DARK_BG = '([^']+)'/);
      ok(m && m[1].toLowerCase() === '#08090b', "1. guard: the phone's bar and the installed app's splash keep the page's dark grey (DARK_BG)", m && m[1]);
    }
    if (run(2)) {
      for (const mode of ['dark', 'system-dark', 'light']) {
        const P = await screen(FILE, 'today', mode, browser);
        const hero = await css(P, '.hero', ['background-image', 'box-shadow']);
        const go = await css(P, '.hero .btn.primary', ['box-shadow']);
        const rp = await css(P, '.ring .rp', ['filter']);
        const bi = hero ? hero['background-image'] : '';
        ok(/repeating-linear-gradient/.test(bi) && !/radial-gradient/.test(bi), `2. ${mode}: Today's card is brushed steel, with no accent glow`, hero);
        const edge = mode === 'light' ? /rgb\(154, 161, 169\).*rgb\(255, 255, 255\)/ : /rgb\(62, 67, 74\).*rgb\(217, 221, 225\)/;
        const rim = mode === 'light' ? /rgb\(205, 210, 216\)/ : /rgb\(42, 44, 48\)/;
        ok(edge.test(bi), `2. ${mode}: a steel edge runs along its top`, bi.slice(0, 300));
        ok(hero && /inset/.test(hero['box-shadow']) && rim.test(hero['box-shadow']), `2. ${mode}: a thin rim and a highlight on its top edge`, hero && hero['box-shadow']);
        ok(go && /inset/.test(go['box-shadow']) && !/20px/.test(go['box-shadow']), `2. ${mode}: the Start button has no glow`, go);
        ok(rp && rp.filter === 'none', `2. ${mode}: the week ring has no glow`, rp);
        await P.ctx.close();
      }
    }
    if (run(3)) {
      for (const [mode, steel] of [['dark', 'rgb(138, 145, 153)'], ['light', 'rgb(179, 185, 192)']]) {
        const S = await screen(FILE, 'session', mode, browser);
        const blk = await css(S, '.block', ['border-top-width', 'border-top-color']);
        ok(blk && blk['border-top-width'] === '1px' && blk['border-top-color'] === steel, `3. ${mode}: a session exercise card has a steel line along its top (its border, so nothing moves)`, blk);
        await S.ctx.close();
        const T = await screen(FILE, 'stats', mode, browser);
        const kp = await css(T, '.kpis', ['border-top-width', 'border-top-color']);
        ok(kp && kp['border-top-width'] === '1px' && kp['border-top-color'] === steel, `3. ${mode}: the Stats numbers have the same steel line`, kp);
        await T.ctx.close();
      }
      // NEW-19 (found by r65.1's review): a full-width button (.btn.block) outside a card is no card, so it has no steel line,
      // as on r65: History's "Show N more", and the first-run account page's "I have an account" (markup as today.ts writes it).
      const H2 = await screen(FILE, 'today', 'dark', browser);
      const more = await H2.page.evaluate(async () => {
        const L = window.__ironlog; L.ui.tab = 'history'; L.render();
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const b = document.querySelector('[data-act="histMore"]');
        const ob = document.createElement('div'); ob.className = 'ob'; ob.dataset.step = 'acct';
        ob.innerHTML = '<div class="ob-card"><button class="btn primary block">Create account</button><button class="btn block">I have an account</button></div>';
        document.body.appendChild(ob);
        const top = el => el ? getComputedStyle(el).borderTopColor : null;
        const r = { more: top(b), acct: top(ob.querySelector('.btn:not(.primary)')) }; ob.remove(); return r;
      });
      ok(more.more && !['rgb(138, 145, 153)', 'rgb(179, 185, 192)'].includes(more.more) && !['rgb(138, 145, 153)', 'rgb(179, 185, 192)'].includes(more.acct), "3. a full-width button is no card: no steel line on History's Show more or the first-run account page's buttons (NEW-19)", more);
      await H2.ctx.close();
    }
    if (run(4)) {
      for (const name of Object.keys(SCREENS)) {
        for (const mode of ['light', 'dark']) {
          const A = await screen(BEFORE, name, mode, browser); const a = await dump(A); await A.ctx.close();
          const B = await screen(FILE, name, mode, browser); const b = await dump(B); await B.ctx.close();
          let diff = a.length !== b.length ? { count: [a.length, b.length] } : null;
          for (let i = 0; !diff && i < a.length; i++) {
            if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) diff = { at: i, el: [a[i][0], b[i][0]], box: [a[i][1], b[i][1]] };
            // Both themes keep their colours but on Today's card and the steel lines.
            else if (!a[i][3] && a[i][2] !== b[i][2]) { const x = a[i][2].split(';'), y = new Set(b[i][2].split(';')); diff = { at: i, el: a[i][0], before: x.filter(p => !y.has(p)).slice(0, 4) }; }
          }
          ok(!diff, `4. guard: ${name} in ${mode}: every box and every drawn style outside Today's card and the steel lines is the build before's (${a.length} elements)`, diff);
        }
      }
    }
  } finally { await H.settle(browser.close(), 'browser close'); }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('crash', e.stack); process.exit(1); });
