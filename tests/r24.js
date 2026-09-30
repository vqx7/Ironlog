// r24: one change in a session never undoes another. A swap keeps the number
// of sets the exercise has right now (after Short on time, a lighter day, a
// deload, + Set or − Set) and keeps the trimmed mark, so trimmed work stays out
// of trends. Also: Undo, a second swap, a date change and a reload keep it.
const { open } = require('./h');
const fails = []; const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const { browser, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  const fresh = async () => { await ev(() => { const L = window.__ironlog; L.state.draft = null; L.state.settings.onboarded = true; if (!L.state.sessions.length) L.makeDemo(); L.state.deloadWeek = null; L.ui.tab = 'today'; L.ui.todayDay = 0; L.ui.modal = null; document.getElementById('modal').hidden = true; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); window.scrollTo(0, 0); }); };
  const start = async (light) => { await fresh(); await page.click(`.hero [data-act="startSession"]${light ? '[data-light="1"]' : ':not([data-light])'}`); await page.waitForTimeout(120); };
  const work = (bi) => ev(b => { const x = window.__ironlog.state.draft.ex[b]; return x ? x.sets.filter(s => !s.warm && !s.drop).length : -1; }, bi);
  // Swap block bi through the real picker, to the first exercise it lists that is not already in the session.
  const swap = async (bi) => {
    await ev(b => window.__ironlog.ACT.bSwap({ dataset: { b: String(b) } }), bi);
    await page.waitForTimeout(80);
    const id = await ev(() => { const inS = new Set(window.__ironlog.state.draft.ex.map(b => b.exId)); const el = [...document.querySelectorAll('#pickList .pick[data-ex]')].find(p => !inS.has(p.dataset.ex)); if (!el) return null; el.click(); return el.dataset.ex; });
    await page.waitForTimeout(150);
    return id;
  };

  // 1. Short on time, then a swap on a trimmed exercise that has not started.
  await start();
  const trim = await ev(() => { const L = window.__ironlog; const d = L.state.draft; const before = d.ex.map(b => ({ id: b.exId, n: b.sets.length }));
    L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply();
    const after = L.state.draft.ex.map((b, bi) => ({ bi, id: b.exId, n: b.sets.length, cut: !!b.cut }));
    const t = after.find(a => a.cut && a.n < (before.find(x => x.id === a.id) || {}).n);
    return { t, after }; });
  ok(!!trim.t, 'Short on time trims at least one exercise to fewer sets (' + JSON.stringify(trim.after) + ')');
  const bi = trim.t.bi, nTrim = trim.t.n;
  const planSets = await ev(b => window.__ironlog.state.draft.ex[b].plan.sets, bi);
  ok(planSets > nTrim, `the routine plans more sets than were kept (${planSets} planned, ${nTrim} kept)`);
  const newId = await swap(bi);
  ok(!!newId, 'the picker offers another exercise');
  const s1 = await ev(b => { const x = window.__ironlog.state.draft.ex[b]; return { id: x.exId, n: x.sets.length, cut: !!x.cut, plan: x.plan.sets }; }, bi);
  ok(s1.id === newId && s1.n === nTrim, `after the swap the new exercise keeps the trimmed ${nTrim} sets, not the planned ${planSets} (${JSON.stringify(s1)})`);
  ok(s1.cut, 'the swapped-in exercise keeps the trimmed mark, so it stays out of trends');
  ok(s1.plan === nTrim, 'its plan says the same number of sets, so targets and grey reps follow it');

  // 2. A second swap in a row keeps it too.
  await swap(bi);
  ok(await work(bi) === nTrim && await ev(b => !!window.__ironlog.state.draft.ex[b].cut, bi), 'a second swap keeps the trimmed count and mark');

  // 3. Undo puts back the exercise before the last swap, with the same count.
  await ev(() => window.__ironlog.ACT.undo()); await page.waitForTimeout(80);
  ok(await ev((a) => { const x = window.__ironlog.state.draft.ex[a.b]; return x.exId === a.id && x.sets.length === a.n && !!x.cut; }, { b: bi, id: newId, n: nTrim }), 'Undo returns the previous exercise with the trimmed count');

  // 4. A reload keeps the count and the mark.
  await ev(() => window.__ironlog.saveNow());
  await page.reload(); await page.waitForFunction(() => window.__libs && window.__libs.chart); await page.waitForTimeout(150);
  ok(await ev((a) => { const x = window.__ironlog.state.draft.ex[a.b]; return x && x.sets.length === a.n && !!x.cut; }, { b: bi, n: nTrim }), 'after a reload the swapped exercise still has the trimmed count and mark');

  // 5. Changing the session date re-reads targets but keeps set counts and typed loads.
  await ev((b) => { const L = window.__ironlog; const x = L.state.draft.ex[b]; x.sets[0].w = 77; L.saveNow(); L.render(); }, bi);
  const counts0 = await ev(() => window.__ironlog.state.draft.ex.map(b => b.sets.length));
  await ev(() => { const el = document.querySelector('input[data-bind="draftDate"]'); el.value = '2026-09-19'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(120);
  const counts1 = await ev(() => window.__ironlog.state.draft.ex.map(b => b.sets.length));
  ok(JSON.stringify(counts0) === JSON.stringify(counts1), `a date change keeps every exercise's set count (${counts0} vs ${counts1})`);
  ok(await ev(b => window.__ironlog.state.draft.ex[b].sets[0].w === 77, bi), 'a date change keeps a load you typed');

  // 6. Swap after one set is logged on a trimmed exercise: the new one gets only the sets left, and is still trimmed.
  await start();
  const t6 = await ev(() => { const L = window.__ironlog; L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); const d = L.state.draft; const i = d.ex.findIndex(b => b.cut && b.sets.length >= 2); return { i, n: i >= 0 ? d.ex[i].sets.length : 0 }; });
  ok(t6.i >= 0, 'a trimmed exercise with 2 or more sets exists');
  await ev(b => { const L = window.__ironlog; const s = L.state.draft.ex[b].sets[0]; s.w = s.w || 40; s.r = 8; s.done = true; L.saveNow(); L.render(); }, t6.i);
  await swap(t6.i);
  const s6 = await ev(b => { const d = window.__ironlog.state.draft; return { old: d.ex[b].sets.length, oldCut: !!d.ex[b].cut, nw: d.ex[b + 1].sets.length, nwCut: !!d.ex[b + 1].cut }; }, t6.i);
  ok(s6.old === 1 && s6.nw === t6.n - 1, `the logged set stays and the new exercise takes the ${t6.n - 1} left (${JSON.stringify(s6)})`);
  ok(s6.oldCut && s6.nwCut, 'both halves keep the trimmed mark');

  // 7. Lighter day: a swap keeps half the sets.
  await start(true);
  const n7 = await work(0);
  await swap(0);
  ok(await work(0) === n7, `a lighter day's swap keeps its ${n7} sets`);

  // 8. + Set and − Set, then a swap: the count you chose stays.
  await start();
  const n8 = await work(1);
  await ev(() => { const L = window.__ironlog; L.ACT.sAdd({ dataset: { b: '1' } }); L.ACT.sAdd({ dataset: { b: '1' } }); });
  await swap(1);
  ok(await work(1) === n8 + 2, `+ Set twice then a swap keeps ${n8 + 2} sets (got ${await work(1)})`);
  const n8b = await work(2);
  await ev(() => document.querySelector('[data-act="sDel"][data-b="2"]').click()); await page.waitForTimeout(60);
  await swap(2);
  ok(await work(2) === n8b - 1, `− Set then a swap keeps ${n8b - 1} sets (got ${await work(2)})`);

  // 9. Deload week: a swap keeps the deload count.
  await fresh();
  await ev(() => { const L = window.__ironlog; L.state.deloadWeek = L.weekStart(L.today()); L.render(); });
  await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(120);
  const n9 = await work(0);
  await swap(0);
  ok(await work(0) === n9 && await ev(() => !!window.__ironlog.state.draft.deload), `a deload session's swap keeps its ${n9} sets`);
  await ev(() => { window.__ironlog.state.deloadWeek = null; });

  // 10. Finishing a trimmed, swapped session saves the trimmed mark on the new exercise.
  await start();
  const f = await ev(() => { const L = window.__ironlog; L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); const d = L.state.draft; return d.ex.findIndex(b => b.cut && !b.sets.some(s => s.done)); });
  const fid = await swap(f);
  await ev(b => { const L = window.__ironlog; const x = L.state.draft.ex[b]; x.sets.forEach(s => { s.w = s.w == null ? 30 : s.w; s.r = 10; s.done = true; }); L.saveNow(); }, f);
  const saved = await ev(async (id) => { const L = window.__ironlog; const n0 = L.state.sessions.length; L.state.draft.ex = L.state.draft.ex.filter(b => b.sets.some(s => s.done)); L.ACT.finish(); await new Promise(r => setTimeout(r, 200)); const btn = document.querySelector('#modal [data-act="finishGo"],#modal [data-act="finishConfirm"]'); if (btn) { btn.click(); await new Promise(r => setTimeout(r, 200)); } const s = L.state.sessions[L.state.sessions.length - 1]; const b = s && s.ex.find(x => x.exId === id); return { grew: L.state.sessions.length > n0, cut: !!(b && b.cut) }; }, fid);
  ok(saved.grew && saved.cut, 'the saved session keeps the trimmed mark on the swapped-in exercise (' + JSON.stringify(saved) + ')');

  // 11. A session left open by the live build (r23, no stored suggestion) carries on here.
  const O = await open('baselines/r23.html', { browser, touch: true, clock: '2026-09-20T10:00:00' });
  await O.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
  await O.page.click('.hero [data-act="startSession"]:not([data-light])'); await O.page.waitForTimeout(120);
  const old = await O.page.evaluate(() => { const L = window.__ironlog; L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); L.saveNow(); return JSON.parse(localStorage.getItem('ironlog.v1')); });
  await O.ctx.close();
  const N = await open('index.html', { browser, touch: true, state: old, stateOnce: false, clock: '2026-09-20T10:00:00' });
  const nb = await N.page.evaluate(() => { const d = window.__ironlog.state.draft; return d ? { n: d.ex.map(b => b.sets.length), sw: d.ex.map(b => b.sw), cut: d.ex.findIndex(b => b.cut) } : null; });
  ok(nb && nb.n.join() === old.draft.ex.map(b => b.sets.length).join() && nb.sw.every(v => v === undefined), 'an r23 session in progress loads with its trimmed counts and no stored suggestion (' + JSON.stringify(nb) + ')');
  await N.page.evaluate((b) => window.__ironlog.ACT.bSwap({ dataset: { b: String(b) } }), nb.cut); await N.page.waitForTimeout(80);
  await N.page.evaluate(() => { const inS = new Set(window.__ironlog.state.draft.ex.map(b => b.exId)); [...document.querySelectorAll('#pickList .pick[data-ex]')].find(p => !inS.has(p.dataset.ex)).click(); }); await N.page.waitForTimeout(150);
  ok(await N.page.evaluate((a) => { const x = window.__ironlog.state.draft.ex[a.b]; return x.sets.length === a.n && !!x.cut; }, { b: nb.cut, n: nb.n[nb.cut] }), 'a swap in that session keeps its trimmed count and mark');
  ok(!N.errors.length, 'no page errors loading an r23 session (' + N.errors.join(' | ') + ')');
  await N.ctx.close();

  ok(!errors.length, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
