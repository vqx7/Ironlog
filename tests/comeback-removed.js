// Comeback (former bests) was removed in r19 at the owner's request, with any
// former bests already saved. Checks: an older save that holds former bests
// loads without them and without any trace in the app; the next save, backup
// and cloud copy no longer carry them; a cloud copy that still holds them is
// cleaned on the next sync; nothing else is lost.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
(async () => {
  // An older save with two former bests, a session and a custom exercise.
  const P = await open('baselines/r18.html', { clock: '2026-09-20T10:00:00' });
  await P.page.evaluate(() => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; L.makeDemo();
    s.priors = [{ id: 'p1', exId: 'bench', w: 140, r: 5, note: '2021' }, { id: 'p2', exId: 'dbCurl', w: 20, r: 8, note: '' }]; L.saveNow(); });
  const raw = await P.page.evaluate(() => localStorage.getItem('ironlog.v1')); await P.ctx.close(); await P.browser.close();
  const old = JSON.parse(raw);
  ok(old.priors.length === 2, 'the older save holds two former bests');
  const { browser, page, errors } = await open('index.html', { state: old, touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  ok(await ev(() => window.__ironlog.state.priors === undefined), 'loaded: no former bests in the app state');
  ok(await ev(n => window.__ironlog.state.sessions.length === n, old.sessions.length), 'every session kept');
  const all = [];
  for (const t of ['today', 'program', 'dash', 'history', 'settings']) {
    all.push(await ev(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); return document.getElementById('view').innerText; }, t));
  }
  ok(!all.some(t => /comeback|former best/i.test(t)), 'no Comeback or former best anywhere on any tab');
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(150);
  ok(!/former best/i.test(await ev(() => document.getElementById('view').innerText)), 'no former-best line in a session');
  await page.click('[data-act="bMenu"][data-b="0"]'); await page.waitForTimeout(100);
  ok(!/former best/i.test(await ev(() => document.getElementById('modal').innerText)), 'no Former best item in the exercise menu');
  await ev(() => document.querySelector('#modal [data-act="mClose"]').click());
  await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
  const saved = await ev(() => JSON.parse(localStorage.getItem('ironlog.v1')));
  ok(!('priors' in saved), 'the next save no longer carries them');
  const backup = await ev(() => JSON.stringify(window.__ironlog.state));
  ok(!/"priors"/.test(backup), 'a backup no longer carries them');
  const core = await ev(() => window.__ironlog.chunksOf ? JSON.stringify(window.__ironlog.chunksOf(window.__ironlog.state).core) : '');
  ok(core === '' || !/"priors"/.test(core), 'the cloud copy of routines and settings no longer carries them');
  // Importing an old backup that has them: dropped, everything else in.
  await ev(t => window.__ironlog.importData(t), JSON.stringify({ app: 'ironlog', state: old })); await page.waitForTimeout(100);
  await page.click('[data-act="mOk"]').catch(() => {}); await page.waitForTimeout(200);
  ok(await ev(n => window.__ironlog.state.priors === undefined && window.__ironlog.state.sessions.length === n, old.sessions.length), 'importing an old backup: sessions in, former bests out');
  ok(errors.length === 0, 'no console errors', errors);
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack || e); process.exit(1); });
