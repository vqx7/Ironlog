const { open } = require('./h'); const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const { chromium } = require('playwright'); const browser = await chromium.launch();
  const P = await open(process.env.F || 'index.html', { browser, touch: true, clock: '2026-09-27T18:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); /* r30: history here, not sample data */ for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of (L.state[k] || [])) delete x.demo; L.invalidate && L.invalidate(); L.ui.tab = 'today'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
  await P.page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(200);
  const g = await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; const ex = L.IDX().byEx[b.exId]; const last = ex[ex.length - 1]; b.sets[0].w = last.pts[0].w; L.render(); return last.pts[0].r; });
  await P.page.fill('[data-f="r"][data-b="0"][data-s="0"]', String(g + 3)); await P.page.dispatchEvent('[data-f="r"][data-b="0"][data-s="0"]', 'change');
  await P.page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(250);
  await P.page.fill('[data-f="r"][data-b="0"][data-s="1"]', '1'); await P.page.dispatchEvent('[data-f="r"][data-b="0"][data-s="1"]', 'change');
  await P.page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await wait(250);
  await ev(() => document.querySelector('[data-act="finish"]').scrollIntoView({ block: 'center' })); await wait(300);
  console.log(JSON.stringify(await ev(() => { const f = document.querySelector('[data-act="finish"]').getBoundingClientRect(); const t = document.getElementById('timer').getBoundingClientRect(); return { finish: [Math.round(f.top), Math.round(f.bottom)], timerTop: Math.round(t.top), vh: innerHeight, doc: document.documentElement.scrollHeight, y: Math.round(scrollY), mainPad: getComputedStyle(document.querySelector('main')).paddingBottom, body: document.body.className, blocks: window.__ironlog.state.draft.ex.map(b => b.exId).join(), modal: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').innerText }; })));
  await browser.close();
})().catch(e => { console.log('ERR', e.message); process.exit(1); });
