// Regressions for the r14 acceptance pass: in-session Undo, Swap, warm-ups and
// last time's reps, import count, RIR strip above the timer, trimmed targets,
// Short on time, day scrolling, deload count, counts, and timing.
const { open } = require('./h');
const fails = []; const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const { browser, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  const fresh = async () => { await ev(() => { const L = window.__ironlog; L.state.draft = null; L.state.settings.onboarded = true; if (!L.state.sessions.length) L.makeDemo(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.ui.modal = null; document.getElementById('modal').hidden = true; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); window.scrollTo(0, 0); }); };
  const start = async () => { await fresh(); await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(120); };
  const tick = async (b, s) => { await page.click(`[data-act="sDone"][data-b="${b}"][data-s="${s}"]`); await page.waitForTimeout(60); await ev(() => { const st = document.querySelector('.rirstrip [data-v="1"]'); if (st) st.click(); }); await page.waitForTimeout(40); };

  // Time estimate: the session starts at the plan's estimate.
  await fresh();
  const plan = await ev(() => { const m = document.querySelector('.hero .muted').textContent.match(/about (\d+) min/); return m && +m[1]; });
  await start();
  const left = await ev(() => { const m = document.querySelector('.ph .meta').textContent.match(/about (\d+) min left/); return m && +m[1]; });
  ok(plan && plan === left, `plan and session agree on time (${plan} vs ${left})`);

  // Remove an exercise, log a set elsewhere, Undo: the exercise comes back.
  const names0 = await ev(() => window.__ironlog.state.draft.ex.map(b => b.exId));
  await tick(0, 0);
  await ev(() => { const L = window.__ironlog; L.ACT.bDel({ dataset: { b: '2' } }); });
  await tick(1, 0);
  await ev(() => window.__ironlog.ACT.undo());
  const names1 = await ev(() => window.__ironlog.state.draft.ex.map(b => b.exId));
  const kept = await ev(() => window.__ironlog.state.draft.ex[1].sets[0].done);
  ok(JSON.stringify(names0) === JSON.stringify(names1) && kept, 'Undo restores a removed exercise after another set was logged, and keeps that set');

  // − Set on a logged set, then another set logged, then Undo.
  await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[3]; b.sets.forEach(s => { s.w = 50; s.r = 8; s.done = true; }); L.ui.blkOpen.add(L.state.draft.id + ':3:' + b.exId); L.saveNow(); L.render(); });
  const n3 = await ev(() => window.__ironlog.state.draft.ex[3].sets.length);
  await ev(() => document.querySelector('[data-act="sDel"][data-b="3"]').click());
  await tick(1, 1);
  await ev(() => window.__ironlog.ACT.undo());
  ok(await ev(n => window.__ironlog.state.draft.ex[3].sets.length === n && window.__ironlog.state.draft.ex[1].sets[1].done, n3), 'Undo restores a removed logged set after another set was logged');

  // Swap keeps logged sets, and Undo reverses the swap.
  await start();
  const sw0 = await ev(() => { const d = window.__ironlog.state.draft; return { ex: d.ex.map(b => b.exId), n: d.ex[2].sets.length }; });
  await tick(2, 0);
  await ev(() => { const L = window.__ironlog; L.ACT.bSwap({ dataset: { b: '2' } }); });
  await page.waitForTimeout(80);
  await ev(() => document.querySelector('#pickList .pick[data-ex]:not([data-ex="' + window.__ironlog.state.draft.ex[2].exId + '"])').click());
  await page.waitForTimeout(150);
  const sw1 = await ev(() => { const d = window.__ironlog.state.draft; return { ex: d.ex.map(b => b.exId), keptDone: d.ex[2].sets.filter(s => s.done).length, next: d.ex[3].sets.length }; });
  ok(sw1.ex.length === sw0.ex.length + 1 && sw1.ex[2] === sw0.ex[2] && sw1.keptDone === 1 && sw1.next === sw0.n - 1, 'Swap keeps the logged set on the old exercise and gives the new one the sets left (' + JSON.stringify(sw1) + ')');
  await ev(() => window.__ironlog.ACT.undo());
  ok(await ev(e => { const d = window.__ironlog.state.draft; return JSON.stringify(d.ex.map(b => b.exId)) === e && d.ex[2].sets.length > 1 && d.ex[2].sets[0].done; }, JSON.stringify(sw0.ex)), 'Undo reverses the swap');

  // A warm-up added at the top does not shift last time's reps.
  await start();
  const lr = await ev(() => window.__ironlog.state.draft.ex[1].lastR.slice());
  await ev(() => window.__ironlog.ACT.wAdd({ dataset: { b: '1' } })); await page.waitForTimeout(80);
  const ph = await ev(() => [...document.querySelectorAll('.sg input[data-f="r"][data-b="1"]')].map(i => i.placeholder));
  ok(ph[0] === '' && ph[1] === String(lr[0]) && ph[2] === String(lr[1]), 'placeholders after a warm-up: blank, then last time\'s ' + lr.slice(0, 2).join(', ') + ' (' + ph.join('|') + ')');
  await page.click('[data-act="sDone"][data-b="1"][data-s="0"]'); await page.waitForTimeout(60);
  ok(await ev(() => !window.__ironlog.state.draft.ex[1].sets[0].done), 'ticking an empty warm-up asks for reps instead of taking a working set\'s number');
  await tick(1, 1);
  ok(await ev(r => window.__ironlog.state.draft.ex[1].sets[1].r === r, lr[0]), 'working set 1 logs last time\'s first set');
  const num = await ev(() => [...document.querySelectorAll('#blk-1 .sg:not(.head) .n')].map(n => n.textContent));
  ok(num[0] === 'W' && num[1] === '1', 'the warm-up row is marked W and working sets count from 1 (' + num.slice(0, 3).join(',') + ')');
  const wd = await ev(() => { const d = window.__ironlog.state.draft; const w = d.ex.reduce((a, b) => a + b.sets.filter(s => s.done && !s.warm).length, 0); return { head: document.getElementById('doneCount').textContent, bar: document.getElementById('sessOf').textContent, w }; });
  ok(wd.head === String(wd.w) && wd.bar.startsWith(wd.w + ' of'), 'sets done and the bar agree (' + JSON.stringify(wd) + ')');

  // Fewer sets than last time: header count and target follow.
  await start();
  const t0 = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { n: b.sets.length, tgt: b.tgt, text: document.querySelector('#blk-0 .hint b').textContent }; });
  await ev(() => document.querySelector('[data-act="sDel"][data-b="0"]').click()); await page.waitForTimeout(80);
  const t1 = await ev(() => ({ head: document.querySelector('#blk-0 .bh .muted').textContent, text: document.querySelector('#blk-0 .hint b').textContent }));
  if (t0.tgt && t0.tgt.kind === 'reps' && t0.tgt.n === t0.n) {
    const want = t0.tgt.rs.slice(0, t0.n - 1).reduce((a, v) => a + v, 0) + 1;
    ok(t1.head.includes(`${t0.n - 1}×`) && t1.text.includes(`${want}+`) && t1.text.includes(`first ${t0.n - 1} sets`), 'after − Set the header and target use the sets left (' + t1.text + ')');
  } else ok(t1.head.includes(`${t0.n - 1}×`), 'after − Set the header shows the sets left');

  // Short on time from Today, cancelled: no session left behind.
  await fresh();
  await page.click('.hero [data-act="startShort"]'); await page.waitForTimeout(100);
  ok(await ev(() => !!window.__ironlog.state.draft && window.__ironlog.ui.modal.kind === 'short'), 'Short on time opens its sheet');
  await ev(() => document.querySelector('#modal [data-act="mClose"]').click()); await page.waitForTimeout(80);
  ok(await ev(() => !window.__ironlog.state.draft), 'closing the Short on time sheet leaves no session');

  // Short on time mid-session keeps the main lifts.
  await start();
  const sp = await ev(() => { const L = window.__ironlog; const d = L.state.draft; const fl = d.ex.findIndex(b => !L.isCompound(L.EX(b.exId)) && L.EX(b.exId).primary === 'chest');
    d.ex[fl].sets[0].w = 20; d.ex[fl].sets[0].r = 12; d.ex[fl].sets[0].done = true;
    const pl = L.shortPlan(d, 20); return { skipped: pl.changes.filter(c => c.startsWith('Skip')), compounds: d.ex.filter(b => L.isCompound(L.EX(b.exId))).map(b => L.EX(b.exId).name) }; });
  const keptC = sp.compounds.filter(n => !sp.skipped.includes('Skip ' + n));
  ok(keptC.length >= 1 && sp.skipped.some(x => /Pec Deck|Push-up/.test(x)), 'Short on time keeps a main lift and drops isolation work first (kept ' + keptC.join(', ') + '; ' + sp.skipped.join('; ') + ')');

  // Deload count on Today matches the session.
  await fresh();
  const dl = await ev(() => { const L = window.__ironlog; L.state.deloadWeek = L.weekStart(L.today()); L.ui.todayDay = 2; L.render(); const m = document.querySelector('.hero .muted').textContent.match(/(\d+) sets \(deload\)/); return m && +m[1]; });
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(100);
  const dn = await ev(() => { const d = window.__ironlog.state.draft; const n = d.ex.reduce((a, b) => a + b.sets.length, 0); window.__ironlog.state.deloadWeek = null; return n; });
  ok(dl === dn, `deload sets on Today match the session (${dl} vs ${dn})`);

  // Editing a saved session: re-ticking a set does not start the rest timer.
  await fresh();
  await ev(() => { const L = window.__ironlog; const s = L.state.sessions[L.state.sessions.length - 1]; L.ACT.histEdit({ dataset: { id: s.id } }); });
  await page.waitForTimeout(100);
  await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await page.waitForTimeout(40);
  await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await page.waitForTimeout(80);
  ok(await ev(() => document.getElementById('timer').hidden), 'no rest timer while editing a saved session');
  await ev(() => { window.__ironlog.state.draft = null; });

  // Import of the app's own backup reports nothing skipped.
  ok(await ev(() => { const L = window.__ironlog; L.normalize(JSON.parse(JSON.stringify(L.state))); return L.normalize.dropped === 0; }), 'a clean backup reports 0 damaged records');

  // Program: an opened day shows its header below the sticky bar.
  await browser.close();
  const X = await open('index.html', { touch: true, w: 320, h: 640, clock: '2026-09-20T10:00:00' });
  const e2 = (f, a) => X.page.evaluate(f, a);
  await e2(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'program'; L.ui.planView = 'routine'; L.ui.folds['program:days'] = true; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
  await e2(() => document.querySelectorAll('.day [data-act="dFold"]')[3].click()); await X.page.waitForTimeout(900);
  const pos = await e2(() => { const d = document.querySelectorAll('.day')[3].getBoundingClientRect(); const top = document.querySelector('.top').getBoundingClientRect(); return { d: Math.round(d.top), bar: Math.round(top.bottom) }; });
  ok(pos.d >= pos.bar && pos.d < 200, `opened day starts just below the header (${pos.d} vs bar ${pos.bar})`);
  // RIR strip is not left under the rest bar at 320 x 640.
  await e2(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); window.scrollTo(0, 0); });
  await X.page.click('.hero [data-act="startSession"]:not([data-light])'); await X.page.waitForTimeout(120);
  await X.page.click('[data-act="sDone"][data-b="0"][data-s="2"]'); await X.page.waitForTimeout(900);
  const st = await e2(() => { const s = document.querySelector('.rirstrip').getBoundingClientRect(); const t = document.getElementById('timer').getBoundingClientRect(); return { s: Math.round(s.bottom), t: Math.round(t.top) }; });
  ok(st.s <= st.t, `RIR strip sits above the rest bar (${st.s} ≤ ${st.t})`);
  ok(errors.length === 0 && X.errors.length === 0, 'no console errors' + (errors.length || X.errors.length ? ': ' + [...errors, ...X.errors].join(' | ') : ''));
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await X.browser.close(); process.exit(fails.length ? 1 : 0);
})();
