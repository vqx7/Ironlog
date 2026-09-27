// Comeback is switched off (COMEBACK_ON=false): nothing about former bests
// shows anywhere, and former bests already saved are kept untouched.
const { open } = require('./h');
const fails = []; const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const { browser, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo();
    L.state.priors = [{ id: 'p1', exId: 'bench', w: 140, r: 5, note: '2021' }]; L.saveNow(); L.ui.tab = 'today'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
  const txt = () => ev(() => document.getElementById('view').innerText);
  ok(!/comeback/i.test(await txt()) && !(await ev(() => document.querySelector('[data-mkey="comeback"]'))), 'no Comeback section on Today, even with a former best saved');
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:layout'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
  ok(!/comeback/i.test(await txt()), 'Settings > Layout does not list Comeback');
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(150);
  ok(!(await ev(() => document.querySelector('.cbline'))) && !/former best/i.test(await txt()), 'no former-best line in the session');
  const bi = await ev(() => window.__ironlog.state.draft.ex.findIndex(b => b.exId === 'bench'));
  await page.click(`[data-act="bMenu"][data-b="${Math.max(0, bi)}"]`); await page.waitForTimeout(100);
  ok(!(await ev(() => document.querySelector('#modal [data-op="bPrior"]'))), 'no Former best item in the exercise menu');
  await ev(() => document.querySelector('#modal [data-act="mClose"]').click());
  // A heavy set that would have passed the former best: no announcement.
  if (bi >= 0) {
    await ev(b => { const L = window.__ironlog; const s = L.state.draft.ex[b].sets[0]; s.w = 200; s.r = 5; L.render(); }, bi);
    await page.click(`[data-act="sDone"][data-b="${bi}"][data-s="0"]`); await page.waitForTimeout(150);
    ok(!/former best/i.test(await ev(() => document.getElementById('toast').textContent)), 'no "former best passed" toast');
  }
  await ev(() => { const L = window.__ironlog; L.state.draft = null; L.ui.tab = 'program'; L.ui.planView = 'library'; L.render(); });
  await page.fill('input[data-bind="libQ"]', 'Barbell Bench'); await page.waitForTimeout(100);
  await ev(() => document.querySelector('[data-act="exEdit"][data-ex="bench"]').click()); await page.waitForTimeout(100);
  ok(!(await ev(() => document.querySelector('[data-ebind="priorW"]'))) && !/former best/i.test(await ev(() => document.getElementById('modal').innerText)), 'no former-best fields in the exercise editor');
  await ev(() => document.querySelector('[data-act="exSave"]').click()); await page.waitForTimeout(100);
  ok(await ev(() => { const p = window.__ironlog.state.priors; return p.length === 1 && p[0].exId === 'bench' && p[0].w === 140 && p[0].r === 5; }), 'saving the exercise keeps the saved former best untouched');
  await page.reload(); await page.waitForFunction(() => window.__ironlog);
  ok(await ev(() => window.__ironlog.state.priors.length === 1), 'the saved former best survives a reload');
  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
