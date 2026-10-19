// r24: one change in a session never undoes another. A swap keeps the number
// of sets the exercise has right now (after Short on time, a lighter day, a
// deload, + Set or − Set). Also: Undo, a second swap, a date change and a
// reload keep it. Until r54 a trimmed exercise was marked, and the swap kept
// the mark; since r54 (V's one rule) nothing is marked: each lift is read
// against its own usual, so a trimmed one with fewer sets than usual sets no
// target from the log alone, which case 10 checks after Finish.
const { open } = require('./h');
const fails = []; const ok = (c, m) => { if (!c) { fails.push(m); console.log('FAIL', m); } else console.log('ok  ', m); };
(async () => {
  const { browser, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  const fresh = async () => { await ev(() => { const L = window.__ironlog; L.state.draft = null; L.state.settings.onboarded = true; if (!L.state.sessions.length) L.makeDemo(); /* r30: history here, not sample data */ for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of (L.state[k] || [])) delete x.demo; L.invalidate && L.invalidate(); L.state.deloadWeek = null; L.ui.tab = 'today'; L.ui.todayDay = 0; L.ui.modal = null; document.getElementById('modal').hidden = true; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); window.scrollTo(0, 0); }); };
  // r35: a lighter day starts from the card's Change sheet.
  const start = async (light) => { await fresh(); if (light) { await page.click('.hero [data-act="startAltOpen"]'); await page.waitForTimeout(80); await page.click('#modal [data-go="startSession"][data-light="1"]'); } else await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(120); };
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
    const t = after.find(a => a.n < (before.find(x => x.id === a.id) || {}).n);
    return { t, after }; });
  ok(!!trim.t, 'Short on time trims at least one exercise to fewer sets (' + JSON.stringify(trim.after) + ')');
  ok(trim.after.every(a => !a.cut), 'and marks none of them: since r54 a lift with fewer sets than usual is read so from the log (' + JSON.stringify(trim.after) + ')');
  const bi = trim.t.bi, nTrim = trim.t.n;
  const planSets = await ev(b => window.__ironlog.state.draft.ex[b].plan.sets, bi);
  ok(planSets > nTrim, `the routine plans more sets than were kept (${planSets} planned, ${nTrim} kept)`);
  const newId = await swap(bi);
  ok(!!newId, 'the picker offers another exercise');
  const s1 = await ev(b => { const x = window.__ironlog.state.draft.ex[b]; return { id: x.exId, n: x.sets.length, cut: !!x.cut, plan: x.plan.sets }; }, bi);
  ok(s1.id === newId && s1.n === nTrim, `after the swap the new exercise keeps the trimmed ${nTrim} sets, not the planned ${planSets} (${JSON.stringify(s1)})`);
  ok(!s1.cut, 'and no mark: the swapped-in exercise is read against its own usual, as every lift is (r54)');
  ok(s1.plan === nTrim, 'its plan says the same number of sets, so targets and grey reps follow it');

  // 2. A second swap in a row keeps it too.
  await swap(bi);
  ok(await work(bi) === nTrim, 'a second swap keeps the trimmed count');

  // 3. Undo puts back the exercise before the last swap, with the same count.
  await ev(() => window.__ironlog.ACT.undo()); await page.waitForTimeout(80);
  ok(await ev((a) => { const x = window.__ironlog.state.draft.ex[a.b]; return x.exId === a.id && x.sets.length === a.n; }, { b: bi, id: newId, n: nTrim }), 'Undo returns the previous exercise with the trimmed count');

  // 4. A reload keeps the count.
  await ev(() => window.__ironlog.saveNow());
  await page.reload(); await page.waitForFunction(() => window.__libs && window.__libs.chart); await page.waitForTimeout(150);
  ok(await ev((a) => { const x = window.__ironlog.state.draft.ex[a.b]; return x && x.sets.length === a.n; }, { b: bi, n: nTrim }), 'after a reload the swapped exercise still has the trimmed count');

  // 5. Changing the session date re-reads targets but keeps set counts and typed loads.
  await ev((b) => { const L = window.__ironlog; const x = L.state.draft.ex[b]; x.sets[0].w = 77; L.saveNow(); L.render(); }, bi);
  const counts0 = await ev(() => window.__ironlog.state.draft.ex.map(b => b.sets.length));
  await ev(() => { const el = document.querySelector('input[data-bind="draftDate"]'); el.value = '2026-09-19'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(120);
  const counts1 = await ev(() => window.__ironlog.state.draft.ex.map(b => b.sets.length));
  ok(JSON.stringify(counts0) === JSON.stringify(counts1), `a date change keeps every exercise's set count (${counts0} vs ${counts1})`);
  ok(await ev(b => window.__ironlog.state.draft.ex[b].sets[0].w === 77, bi), 'a date change keeps a load you typed');

  // 6. Swap after one set is logged on a trimmed exercise: the new one gets only the sets left.
  await start();
  const t6 = await ev(() => { const L = window.__ironlog; const n0 = Object.fromEntries(L.state.draft.ex.map(b => [b.exId, b.sets.length])); L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); const d = L.state.draft; const i = d.ex.findIndex(b => b.sets.length < n0[b.exId] && b.sets.length >= 2); return { i, n: i >= 0 ? d.ex[i].sets.length : 0 }; });
  ok(t6.i >= 0, 'a trimmed exercise with 2 or more sets exists');
  await ev(b => { const L = window.__ironlog; const s = L.state.draft.ex[b].sets[0]; s.w = s.w || 40; s.r = 8; s.done = true; L.saveNow(); L.render(); }, t6.i);
  await swap(t6.i);
  const s6 = await ev(b => { const d = window.__ironlog.state.draft; return { old: d.ex[b].sets.length, oldCut: !!d.ex[b].cut, nw: d.ex[b + 1].sets.length, nwCut: !!d.ex[b + 1].cut }; }, t6.i);
  ok(s6.old === 1 && s6.nw === t6.n - 1, `the logged set stays and the new exercise takes the ${t6.n - 1} left (${JSON.stringify(s6)})`);
  ok(!s6.oldCut && !s6.nwCut, 'and neither half is marked (r54)');

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

  // 10. Finishing a trimmed, swapped session: nothing is marked, and the lifts trimmed below their usual read so from the log (r54).
  await start();
  const f0 = await ev(() => Object.fromEntries(window.__ironlog.state.draft.ex.map(b => [b.exId, b.sets.length])));
  const f = await ev(() => { const L = window.__ironlog; const n0 = Object.fromEntries(L.state.draft.ex.map(b => [b.exId, b.sets.length])); L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); const d = L.state.draft; return d.ex.findIndex(b => b.sets.length < n0[b.exId] && !b.sets.some(s => s.done)); });
  // The trimmed lifts left in place, with their sets as Short on time left them, all done.
  const kept = await ev(([f, f0]) => { const L = window.__ironlog; const d = L.state.draft; const out = []; d.ex.forEach((b, i) => { if (i === f || b.sets.length >= f0[b.exId]) return; b.sets.forEach(s => { s.w = s.w == null ? L.greyW(b, b.sets.indexOf(s)) || 30 : s.w; s.r = 10; s.done = true; }); out.push(b.exId); }); L.saveNow(); return out; }, [f, f0]);
  const fid = await swap(f);
  await ev(b => { const L = window.__ironlog; const x = L.state.draft.ex[b]; x.sets.forEach(s => { s.w = s.w == null ? 30 : s.w; s.r = 10; s.done = true; }); L.saveNow(); }, f);
  const saved = await ev(async ([id, kept]) => { const L = window.__ironlog; const n0 = L.state.sessions.length; L.state.draft.ex = L.state.draft.ex.filter(b => b.sets.some(s => s.done)); L.ACT.finish(); await new Promise(r => setTimeout(r, 200)); const btn = document.querySelector('#modal [data-act="finishGo"],#modal [data-act="finishConfirm"]'); if (btn) { btn.click(); await new Promise(r => setTimeout(r, 200)); } const s = L.state.sessions[L.state.sessions.length - 1]; const b = s && s.ex.find(x => x.exId === id); const I = L.IDX(); const read = kept.map(k => { const x = (I.byEx[k] || []).find(q => q.sid === s.id); return { id: k, short: x ? x.short || null : 'none' }; }); return { grew: L.state.sessions.length > n0, saved: !!b, marks: s ? s.ex.filter(x => x.cut).length : -1, read }; }, [fid, kept]);
  ok(saved.grew && saved.saved && saved.marks === 0, 'the session is saved, the swapped-in exercise with it, and no exercise carries a trimmed mark (' + JSON.stringify(saved) + ')');
  ok(saved.read.length > 0 && saved.read.every(r => r.short === 'sets'), 'each lift Short on time left with fewer sets than its usual reads as short of its usual by its sets, so it sets no target (' + JSON.stringify(saved.read) + ')');

  // 11. A session left open by the live build (r23, no stored suggestion) carries on here.
  const O = await open('baselines/r23.html', { browser, touch: true, clock: '2026-09-20T10:00:00' });
  await O.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); /* r30: history here, not sample data */ for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of (L.state[k] || [])) delete x.demo; L.invalidate && L.invalidate(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
  await O.page.click('.hero [data-act="startSession"]:not([data-light])'); await O.page.waitForTimeout(120);
  const old = await O.page.evaluate(() => { const L = window.__ironlog; L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); L.saveNow(); return JSON.parse(localStorage.getItem('ironlog.v1')); });
  await O.ctx.close();
  const N = await open('index.html', { browser, touch: true, state: old, stateOnce: false, clock: '2026-09-20T10:00:00' });
  const nb = await N.page.evaluate(() => { const d = window.__ironlog.state.draft; return d ? { n: d.ex.map(b => b.sets.length), sw: d.ex.map(b => b.sw), cut: d.ex.findIndex(b => b.cut) } : null; });
  ok(nb && nb.n.join() === old.draft.ex.map(b => b.sets.length).join() && nb.sw.every(v => v === undefined), 'an r23 session in progress loads with its trimmed counts and no stored suggestion (' + JSON.stringify(nb) + ')');
  await N.page.evaluate((b) => window.__ironlog.ACT.bSwap({ dataset: { b: String(b) } }), nb.cut); await N.page.waitForTimeout(80);
  await N.page.evaluate(() => { const inS = new Set(window.__ironlog.state.draft.ex.map(b => b.exId)); [...document.querySelectorAll('#pickList .pick[data-ex]')].find(p => !inS.has(p.dataset.ex)).click(); }); await N.page.waitForTimeout(150);
  // r23 filled its rows with the suggested load and stored none, so its rows read as typed: they stay with that exercise, and the mark r23 stored on it is kept as stored (normalize keeps it; nothing reads it since r54).
  ok(await N.page.evaluate((a) => { const x = window.__ironlog.state.draft.ex[a.b]; return x.sets.length === a.n && !!x.cut; }, { b: nb.cut, n: nb.n[nb.cut] }), 'a swap in that session keeps its trimmed count, and the mark r23 stored stays as stored');
  ok(!N.errors.length, 'no page errors loading an r23 session (' + N.errors.join(' | ') + ')');
  await N.ctx.close();

  ok(!errors.length, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
