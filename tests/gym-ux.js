// Gym usability fixes from the r14 review: toast placement, removing sets,
// rest timer stability and persistence, Back closing sheets, typed sheets
// surviving a stray tap, set entry order, labels and touch targets.
const { open } = require('./h');
const fails = []; const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const { browser, ctx, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.wakeLock = false; L.makeDemo(); L.ui.tab = 'today'; L.render(); });
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(150);

  // 1. Toast never blocks the set rows.
  await ev(() => { try { localStorage.removeItem('ironlog.v1.tipWake'); } catch (e) {} });
  await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets[0].w = 50; b.sets[0].r = 8; L.render(); });
  await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await page.waitForTimeout(800);
  const tb = await ev(() => { const t = document.getElementById('toast'); const r = t.getBoundingClientRect(); return { shown: !t.hidden, top: r.top, pe: getComputedStyle(t).pointerEvents }; });
  ok(tb.shown && tb.top < 200 && tb.pe === 'none', 'toast shows near the top and lets taps through (' + JSON.stringify(tb) + ')');
  const hit = await ev(() => { const i = document.querySelector('.sg input[data-f="r"][data-b="0"][data-s="1"]'); i.scrollIntoView({ block: 'center' }); const r = i.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === i; });
  ok(hit, 'reps field of the next set is tappable while a toast shows');

  // 2. Rest timer: built once, buttons stay the same nodes across ticks.
  const same = await ev(async () => { const a = document.querySelector('#timer [data-act="tStop"]'); await new Promise(r => setTimeout(r, 700)); return !!a && a === document.querySelector('#timer [data-act="tStop"]') && document.contains(a); });
  ok(same, 'timer buttons are not rebuilt every tick');
  // Persisted across reload.
  ok(await ev(() => +localStorage.getItem('ironlog.v1.timer') > Date.now()), 'rest end time saved on this device');
  await page.reload(); await page.waitForFunction(() => window.__ironlog); await page.waitForTimeout(300);
  const resumed = await ev(() => !document.getElementById('timer').hidden && /\d:\d\d/.test(document.getElementById('timer').textContent));
  ok(resumed, 'rest timer comes back after a reload');
  // +15 after the rest ended counts from now and re-arms the alert.
  await ev(() => { const L = window.__ironlog; L.timer.end = Date.now() - 20000; L.timer.fired = true; });
  await page.waitForTimeout(400);
  await page.click('#timer [data-act="tAdd"]'); await page.waitForTimeout(300);
  const t15 = await ev(() => { const L = window.__ironlog; return { left: Math.round((L.timer.end - Date.now()) / 1000), fired: L.timer.fired }; });
  ok(t15.left >= 13 && t15.left <= 15 && !t15.fired, '+15 after the rest ended gives 15 s and a new alert (' + JSON.stringify(t15) + ')');
  await page.click('#timer [data-act="tStop"]'); await page.waitForTimeout(100);
  ok(await ev(() => document.getElementById('timer').hidden && !localStorage.getItem('ironlog.v1.timer')), 'dismiss hides the timer and forgets the end time');

  // 3. − Set removes a set not yet done; a logged set only with Undo.
  const r1 = await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; const n = b.sets.length; const doneBefore = b.sets.filter(s => s.done).length;
    document.querySelector('[data-act="sDel"][data-b="0"]').click(); const b2 = L.state.draft.ex[0]; return { n, n2: b2.sets.length, doneBefore, doneAfter: b2.sets.filter(s => s.done).length }; });
  ok(r1.n2 === r1.n - 1 && r1.doneAfter === r1.doneBefore, '− Set removed a set that was not done (' + JSON.stringify(r1) + ')');
  const r2 = await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; L.ui.blkOpen.add(L.state.draft.id + ':0:' + b.exId); b.sets.forEach(s => { s.w = 50; s.r = 8; s.done = true; }); L.saveNow(); L.render();
    const n = b.sets.length; document.querySelector('[data-act="sDel"][data-b="0"]').click();
    // r25: a logged set is never removed on one tap; − Set asks first.
    const asked = L.ui.modal && L.ui.modal.kind === 'confirm' && /Remove set/.test(document.getElementById('modal').innerText) && /logged/.test(document.getElementById('modal').innerText); const n1 = L.state.draft.ex[0].sets.length;
    document.querySelector('#modal [data-act="mOk"]').click(); const n2 = L.state.draft.ex[0].sets.length;
    const undo = !!document.querySelector('#toast [data-act="undo"]'); L.ACT.undo(); return { n, asked, n1, n2, undo, n3: L.state.draft.ex[0].sets.length }; });
  ok(r2.asked && r2.n1 === r2.n && r2.n2 === r2.n - 1 && r2.undo && r2.n3 === r2.n, 'removing a logged set asks first, then offers Undo, and Undo brings it back (' + JSON.stringify(r2) + ')');

  // 4. + Set after a drop set takes the working load: grey by default (r25), filled in with "Fill in suggested loads".
  const r3 = await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets.push({ w: 37.5, r: 10, rir: 0, warm: false, drop: true, done: true }); L.render();
    document.querySelector('[data-act="sAdd"][data-b="0"]').click(); const s = L.state.draft.ex[0].sets; return { w: s[s.length - 1].w, grey: L.effW(L.state.draft.ex[0], s.length - 1), drop: s[s.length - 1].drop }; });
  ok(r3.w === null && r3.grey === 50 && !r3.drop, '+ Set after a drop set shows the working load in grey (' + JSON.stringify(r3) + ')');
  const r3b = await ev(() => { const L = window.__ironlog; L.state.settings.loadFill = 'fill'; document.querySelector('[data-act="sAdd"][data-b="0"]').click(); const s = L.state.draft.ex[0].sets; const out = { w: s[s.length - 1].w, drop: s[s.length - 1].drop }; delete L.state.settings.loadFill; return out; });
  ok(r3b.w === 50 && !r3b.drop, '+ Set after a drop set with filled-in loads uses the working load (' + JSON.stringify(r3b) + ')');

  // 5. Grammar and Enter order.
  const word = await ev(() => { const L = window.__ironlog; L.state.draft.ex.forEach((b, i) => b.sets.forEach((s, j) => { s.done = i === 0 && j === 0; })); L.render(); return document.querySelector('.ph .meta').textContent; });
  ok(/^1 set done/.test(word), 'header reads "1 set done": ' + word.slice(0, 20));
  const order = await ev(() => { const a = document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="0"]'); a.focus();
    const key = () => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const seq = []; for (let k = 0; k < 3; k++) { key(); const e = document.activeElement; seq.push(e.dataset.f + e.dataset.s); } return seq.join(','); });
  ok(order === 'r0,w1,r1', 'Enter moves load, reps, next load (' + order + ')');
  const lbl = await ev(() => document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="1"]').getAttribute('aria-label'));
  ok(/set 2 load/.test(lbl), 'set fields are named with exercise and set: ' + lbl);

  // 6. Back closes a sheet and stays in the app; typed sheets survive a stray tap.
  const url0 = page.url();
  await ev(() => window.scrollTo(0, document.body.scrollHeight));
  await page.click('[data-act="pickSession"]'); await page.waitForTimeout(150);
  await page.goBack(); await page.waitForTimeout(250);
  ok(await ev(() => document.getElementById('modal').hidden) && page.url() === url0, 'Back closes the sheet and stays in the app');
  await page.click('[data-act="pickSession"]'); await page.waitForTimeout(150);
  await page.fill('#pickQ', 'curl'); await page.waitForTimeout(80);
  await page.mouse.click(195, 12); await page.waitForTimeout(150);
  ok(await ev(() => document.getElementById('modal').hidden), 'a picker with a search typed still closes on an outside tap');
  await page.click('[data-act="pickSession"]'); await page.waitForTimeout(150);
  await page.fill('#pickQ', 'Zercher Carry'); await page.waitForTimeout(60);
  await page.click('#pickList .pick.new'); await page.waitForTimeout(150);
  await page.fill('[data-ebind="name"]', 'Zercher Carry 2'); await page.waitForTimeout(60);
  await page.mouse.click(195, 12); await page.waitForTimeout(150);
  ok(await ev(() => !document.getElementById('modal').hidden && document.querySelector('[data-ebind="name"]').value === 'Zercher Carry 2'), 'a half-filled new exercise is kept after an outside tap');
  await ev(() => window.__ironlog.ACT.mClose && window.__ironlog.ACT.mClose());
  await ev(() => { if (!document.getElementById('modal').hidden) document.querySelector('#modal [data-act="mClose"]').click(); });

  // 7. Program: move buttons disabled at the ends; touch targets.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = 'routine'; L.ui.openItem = null; L.render(); });
  const mv = await ev(() => { const ups = [...document.querySelectorAll('[data-act="iUp"]')]; const dns = [...document.querySelectorAll('[data-act="iDown"]')];
    return { firstUp: ups.filter(b => b.dataset.i === '0').every(b => b.disabled), someEnabled: ups.some(b => !b.disabled), lastDown: dns.length > 0 }; });
  ok(mv.firstUp && mv.someEnabled, 'first item cannot move up; others can');
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
  const small = await ev(() => { const out = []; for (const el of document.querySelectorAll('button,select,input:not([type=hidden])')) { if (!el.offsetParent) continue; const r = el.getBoundingClientRect();
      const b = getComputedStyle(el, '::before'); const bw = b.content !== 'none' && b.position === 'absolute' ? parseFloat(b.width) : 0; const bh = b.content !== 'none' && b.position === 'absolute' ? parseFloat(b.height) : 0;
      const w = Math.max(r.width, bw), h = Math.max(r.height, bh); if (h < 43.5 && !el.closest('.wkbar') && !el.closest('.map') && !el.classList.contains('wkpull')) out.push(el.outerHTML.slice(0, 70) + ' ' + Math.round(w) + 'x' + Math.round(h)); } return out; });
  // The handle under the week bar (r25) is a full-width strip and a second way in: the pull and History's Calendar button are the main ones.
  ok(small.length === 0, 'logger controls are at least 44 px tall to the touch' + (small.length ? ': ' + small.slice(0, 5).join(' | ') : ''));

  // 8. Back steps back through tabs, sheets first, and a sheet closed with its button costs no extra Back.
  {
    const T = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
    const tp = T.page; const tev = (f, a) => tp.evaluate(f, a);
    await tev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.render(); });
    const tab = () => tev(() => window.__ironlog.ui.tab);
    const url0 = tp.url();
    await tp.click('#tabs [data-tab="program"]'); await tp.click('#tabs [data-tab="dash"]'); await tp.click('#tabs [data-tab="history"]'); await tp.waitForTimeout(100);
    await tp.goBack(); await tp.waitForTimeout(150);
    ok((await tab()) === 'dash', 'Back from History returns to Stats');
    await tp.click('#tabs [data-tab="settings"]'); await tp.waitForTimeout(80);
    await tev(() => { document.querySelectorAll('#view details').forEach(d => d.open = true); document.querySelector('[data-act="showBackup"]').click(); }); await tp.waitForTimeout(150);
    ok(!(await tev(() => document.getElementById('modal').hidden)), 'a sheet is open on Settings');
    await tp.goBack(); await tp.waitForTimeout(150);
    ok((await tev(() => document.getElementById('modal').hidden)) && (await tab()) === 'settings', 'Back closes the sheet first and stays on Settings');
    await tev(() => document.querySelector('[data-act="showBackup"]').click()); await tp.waitForTimeout(150);
    await tev(() => document.querySelector('#modal [data-act="mClose"]').click()); await tp.waitForTimeout(100);
    await tp.click('#tabs [data-tab="today"]'); await tp.waitForTimeout(80);
    await tp.goBack(); await tp.waitForTimeout(150);
    ok((await tab()) === 'settings', 'after a sheet closed with its button, one Back still returns to the previous tab (' + (await tab()) + ')');
    await tp.goBack(); await tp.waitForTimeout(150);
    ok((await tab()) === 'dash', 'and the next Back goes on to Stats');
    await tev(() => { const L = window.__ironlog; const b = document.createElement('button'); b.dataset.sec = 'volume'; L.ACT.goDash(b); }); await tp.waitForTimeout(100);
    await tev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await tp.waitForTimeout(80);
    await tp.goBack(); await tp.waitForTimeout(150);
    ok((await tab()) === 'dash', 'tabs changed from inside the app count too');
    ok(tp.url().split('#')[0] === url0.split('#')[0], 'still inside the app');
    ok(T.errors.length === 0, 'no console errors while going back', T.errors);
    await T.browser.close();
  }

  ok(errors.length === 0, 'no console errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
