// r15 design: week ring, focused logger (fold, one-tap sets, RIR strip,
// progress bar, menu), one day at a time in Program, History by week, theme
// default and text contrast in both themes.
const { open } = require('./h');
const fails = []; const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const { browser, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  ok(await ev(() => window.__ironlog.state.settings.theme === 'dark' && document.documentElement.dataset.theme === 'dark'), 'a new install starts in the dark theme');
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of L.state[k]) delete x.demo; L.invalidate(); L.ui.tab = 'today'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });

  // Week ring matches This week.
  const ring = await ev(() => { const L = window.__ironlog; const w = L.weekStats(); const r = document.querySelector('.hero .ring'); return { lbl: r && r.getAttribute('aria-label'), pct: r && r.querySelector('.rv').textContent, got: w.got, tgt: w.tgt }; });
  ok(ring.lbl && ring.lbl.startsWith(`${ring.got} of ${ring.tgt} hard sets`) && ring.pct.startsWith(String(Math.round(ring.got / ring.tgt * 100))), 'hero ring shows this week\'s hard sets against plan (' + ring.lbl + ')');
  await page.click('.hero .ring'); await page.waitForTimeout(400);
  ok(await ev(() => { const el = document.querySelector('[data-sk="today:week"]'); return el && el.open; }), 'tapping the ring opens This week');

  // Logger.
  await ev(() => window.scrollTo(0, 0));
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(150);
  const n0 = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { n: b.sets.length, lastR: b.lastR.slice(), grey: window.__ironlog.greyR(b, 0), load: !!(b.tgt && b.tgt.kind === 'load') }; });
  await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await page.waitForTimeout(120);
  const one = await ev(() => { const s = window.__ironlog.state.draft.ex[0].sets[0]; const inp = document.querySelector('.sg input[data-f="r"][data-b="0"][data-s="0"]'); return { r: s.r, done: s.done, shown: inp.value, strip: !!document.querySelector('.rirstrip[data-b="0"][data-s="0"]') }; });
  // The grey number: last time's reps, or the bottom of the range when a new load is due (r27).
  ok(one.done && one.r === n0.grey && one.shown === String(n0.grey) && (n0.load || n0.grey === n0.lastR[0]), 'done on empty reps logs the grey number, last time\'s reps unless a new load is due (' + one.r + ')', n0);
  ok(!one.strip, 'by default the RIR strip does not open by itself after a set');
  await page.click('.rirb[data-b="0"][data-s="0"]'); await page.waitForTimeout(80);
  ok(await ev(() => !!document.querySelector('.rirstrip[data-b="0"][data-s="0"]')), 'tapping the set\'s RIR box opens the strip');
  await page.click('.rirstrip [data-v="2"]'); await page.waitForTimeout(80);
  const rr = await ev(() => ({ rir: window.__ironlog.state.draft.ex[0].sets[0].rir, btn: document.querySelector('.rirb[data-b="0"][data-s="0"]').textContent, strip: !!document.querySelector('.rirstrip') }));
  ok(rr.rir === 2 && rr.btn === '2' && !rr.strip, 'picking 2 stores RIR 2, shows it and closes the strip');
  await page.click('.rirb[data-b="0"][data-s="1"]'); await page.waitForTimeout(60);
  ok(await ev(() => !!document.querySelector('.rirstrip[data-b="0"][data-s="1"]')), 'tapping an RIR cell opens its strip');
  await page.click('.rirstrip .rs-x'); await page.waitForTimeout(60);
  ok(await ev(() => window.__ironlog.state.draft.ex[0].sets[1].rir == null && !document.querySelector('.rirstrip')), 'the clear button leaves RIR empty');
  const nWork = await ev(() => { const d = window.__ironlog.state.draft; return d.ex.reduce((a, b) => a + b.sets.filter(s => !s.warm).length, 0); });
  ok(await ev(n => document.getElementById('sessOf').textContent === `1 of ${n}`, nWork), 'progress reads 1 of ' + nWork);
  // With "Open the RIR picker after each set" on, it opens by itself after each tick.
  await ev(() => { window.__ironlog.state.settings.rirAsk = true; });
  for (let i = 1; i < n0.n; i++) { await page.click(`[data-act="sDone"][data-b="0"][data-s="${i}"]`); await page.waitForTimeout(80); await page.click(`.rirstrip [data-v="1"]`); await page.waitForTimeout(80); }
  ok(await ev(n => window.__ironlog.state.draft.ex[0].sets.slice(1, n).every(x => x.rir === 1), n0.n), 'with the setting on, the strip opened after each tick and took the rating');
  await ev(() => { delete window.__ironlog.state.settings.rirAsk; });
  await page.waitForTimeout(1600);
  const fold = await ev(() => { const el = document.getElementById('blk-0'); return { folded: el.classList.contains('folded'), text: el.textContent, next: !!document.querySelector('#blk-1 .sg') }; });
  ok(fold.folded && /×/.test(fold.text) && fold.next, 'a finished exercise folds to one line and the next stays open');
  await page.click('#blk-0 .bfold'); await page.waitForTimeout(120);
  ok(await ev(() => !document.getElementById('blk-0').classList.contains('folded') && !!document.querySelector('#blk-0 [data-act="bFold"]')), 'tapping a folded exercise reopens it, with a fold button');
  await page.click('#blk-0 [data-act="bFold"]'); await page.waitForTimeout(120);
  ok(await ev(() => document.getElementById('blk-0').classList.contains('folded')), 'the fold button folds it again');
  // Warm-up and drop set live in the menu now.
  await page.click('#blk-1 [data-act="bMenu"]'); await page.waitForTimeout(100);
  const menu = await ev(() => [...document.querySelectorAll('#modal [data-act="bMenuDo"]')].map(b => b.dataset.op));
  ok(menu.includes('wAdd') && menu.includes('dropAdd'), 'warm-up and drop set are in the exercise menu');
  const nb = await ev(() => window.__ironlog.state.draft.ex[1].sets.length);
  await page.click('#modal [data-op="wAdd"]'); await page.waitForTimeout(120);
  ok(await ev(n => { const s = window.__ironlog.state.draft.ex[1].sets; return s.length === n + 1 && s[0].warm; }, nb), 'Add a warm-up set from the menu works');
  ok(await ev(() => !document.querySelector('#blk-1 [data-act="wAdd"]') && !document.querySelector('#blk-1 [data-act="dropAdd"]')), 'no Warm or Drop buttons on the exercise card');
  // Editing a saved session never folds.
  await ev(() => { const L = window.__ironlog; L.ACT.finishNow ? L.ACT.finishNow() : null; });
  await page.waitForTimeout(200);
  await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose && L.ACT.mClose(); L.ui.modal = null; document.getElementById('modal').hidden = true; });

  // Program: one day open at a time.
  await ev(() => { const L = window.__ironlog; L.state.draft = null; L.ui.tab = 'program'; L.ui.planView = 'routine'; L.ui.folds['program:days'] = true; L.render(); });
  const days = await ev(() => ({ open: document.querySelectorAll('.day .dbody:not([hidden])').length, total: document.querySelectorAll('.day').length }));
  ok(days.open === 1 && days.total > 1, `Program shows 1 of ${days.total} days open`);
  await ev(() => document.querySelectorAll('.day [data-act="dFold"]')[2].click()); await page.waitForTimeout(100);
  const d2 = await ev(() => { const L = window.__ironlog; const open = [...document.querySelectorAll('.day')].findIndex(d => !d.querySelector('.dbody').hidden); return { open, n: document.querySelectorAll('.day .dbody:not([hidden])').length, target: L.ui.bTarget }; });
  ok(d2.n === 1 && d2.open === 2 && d2.target === 2, 'opening Day 3 closes the others and makes it the + target');

  // History by week.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); });
  const hw = await ev(() => { const L = window.__ironlog; const hs = [...document.querySelectorAll('.hweek')]; const ws = L.weekStart(L.today());
    const mine = L.state.sessions.filter(s => s.date >= ws); const sets = mine.reduce((a, s) => a + s.ex.reduce((b, x) => b + x.sets.filter(q => !q.warm && +q.r > 0).length, 0), 0);
    return { first: hs[0] && hs[0].textContent, tip: hs[0] && hs[0].querySelector('.hw-s').dataset.tip, count: hs.length, n: mine.length, sets }; });
  ok(hw.count >= 2 && hw.first.startsWith('This week') && hw.first.includes(`${hw.sets} sets`) && hw.tip.startsWith(`${hw.n} session`), 'History groups by week with totals (' + hw.first + ' | ' + hw.tip + ')');

  // Text contrast of the key pairs in both themes (WCAG AA for normal text).
  const contrast = await ev(() => {
    const lum = c => { const m = c.match(/\d+(\.\d+)?/g).map(Number); const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    const probe = document.createElement('div'); document.body.appendChild(probe);
    const col = v => { probe.style.color = `var(${v})`; return getComputedStyle(probe).color; };
    const out = {};
    for (const ac of ['blue', 'volt', 'ember']) for (const th of ['dark', 'light']) {
      document.documentElement.dataset.theme = th; document.documentElement.dataset.accent = ac;
      const pairs = [['--ink', '--bg'], ['--ink', '--surface'], ['--muted', '--surface'], ['--muted', '--bg'], ['--on-volt', '--volt'], ['--green', '--green-bg'], ['--yellow', '--yellow-bg'], ['--red', '--red-bg'], ['--blue', '--blue-bg'], ['--on-gold', '--gold'], ['--on-hero', '--hero'], ['--volt-line', '--bg'], ['--volt-line', '--surface']];
      out[ac + ' ' + th] = pairs.map(([a, b]) => [a + ' on ' + b, Math.round(ratio(col(a), col(b)) * 100) / 100]);
    }
    probe.remove(); document.documentElement.dataset.theme = 'dark'; document.documentElement.dataset.accent = 'blue'; return out;
  });
  for (const k of Object.keys(contrast)) { const low = contrast[k].filter(([, r]) => r < 4.5); ok(!low.length, `${k}: every key text pair reaches 4.5:1` + (low.length ? ' ' + JSON.stringify(low) : '')); }

  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
