// One whole gym session, end to end, the way it is used, run twice: grey
// loads with auto-mark off, then filled-in loads with auto-mark on. Every
// change is made on top of the ones before it, so a step that quietly undoes
// an earlier one fails here even when each feature passes on its own:
// type and tick sets, Short on time, two kinds of swap, + Set and − Set,
// move an exercise, reload mid-session, Finish, then the saved session in
// History and the calendar, an edit of it, and the next session reading it.
// Last, sessions left open by the live builds before r25 (baselines/r24.html)
// and before r26 (baselines/r25.html), each carrying on in this one.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
(async () => {
  for (const mode of ['grey', 'fill']) {
    const T = mode + ': ';
    const { browser, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
    const ev = (f, a) => page.evaluate(f, a);
    const W = (b, s) => `.sg input[data-f="w"][data-b="${b}"][data-s="${s}"]`, R = (b, s) => `.sg input[data-f="r"][data-b="${b}"][data-s="${s}"]`;
    const type = async (sel, v) => { await page.fill(sel, v); await page.dispatchEvent(sel, 'input'); await page.dispatchEvent(sel, 'change'); await page.waitForTimeout(60); };
    const blur = () => ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    const D = () => ev(() => JSON.parse(JSON.stringify(window.__ironlog.state.draft)));
    const sig = d => d.ex.map(b => ({ id: b.exId, cut: !!b.cut, sets: b.sets.map(x => [x.w, x.r, !!x.done, !!x.warm, !!x.drop]) }));
    const closeModal = () => ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });

    await ev((mode) => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); if (mode === 'fill') { L.state.settings.loadFill = 'fill'; L.state.settings.autoDone = true; } L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); }, mode);
    await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(150);
    const ex0 = await ev(() => window.__ironlog.state.draft.ex[0].exId);
    const kg = await ev(() => window.__ironlog.state.settings.unit === 'lb' ? 100 * 0.45359237 : 100);

    // 1. Type a load and reps on set 1 of the first exercise, and tick it.
    await type(W(0, 0), '100'); await type(R(0, 0), '8');
    if (mode === 'grey') await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); else { await page.focus(W(1, 0)); }
    await page.waitForTimeout(120);
    let s00 = (await D()).ex[0].sets[0];
    ok(s00.done && Math.abs(s00.w - kg) < 1e-6 && s00.r === 8, T + 'set 1 logged with the typed load and reps', s00);

    // 2. Set 2: tick without typing. It takes the grey reps, and the load shown in the field.
    await blur();
    const shown = await ev(() => { const f = document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="1"]'); return f.value || f.placeholder; });
    await page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await page.waitForTimeout(120);
    const s01 = (await D()).ex[0].sets[1];
    ok(s01.done && s01.r > 0 && (await ev((w) => window.__ironlog.fmtW(w), s01.w)) === shown, T + 'set 2 ticked untyped takes the reps and the load the field showed (' + shown + ')', s01);

    // 3. On the second exercise, type reps on set 1 (ticked by auto-mark in fill mode, typed only in grey mode).
    await type(R(1, 0), '11'); await blur(); await page.waitForTimeout(100);
    const s10 = (await D()).ex[1].sets[0];
    ok(s10.r === 11 && s10.done === (mode === 'fill'), T + 'reps typed on the second exercise ' + (mode === 'fill' ? 'tick the set (auto-mark)' : 'stay typed, not ticked'), s10);

    // 4. Short on time. Nothing typed or logged may go.
    const before4 = await D();
    const kept = d => d.ex.reduce((a, b) => a + b.sets.filter(x => x.done || x.r != null).length, 0);
    await ev(() => { const L = window.__ironlog; L.ACT.shortOpen(); L.ui.modal.mins = 20; L.ACT.shortApply(); });
    const after4 = await D();
    ok(kept(after4) === kept(before4) && after4.ex[0].sets.filter(x => x.done).length === 2 && after4.ex[1].sets[0].r === 11, T + 'Short on time keeps every logged and typed set', { before: kept(before4), after: kept(after4) });
    ok(after4.ex.some(b => b.cut), T + 'and trims something');

    // 5. Swap an untouched trimmed exercise: its count and the trimmed mark stay.
    const ti = after4.ex.findIndex(b => b.cut && b.sets.every(x => !x.done && x.r == null && x.rir == null));
    const swapTo = async (bi) => { await ev(b => window.__ironlog.ACT.bSwap({ dataset: { b: String(b) } }), bi); await page.waitForTimeout(80);
      const id = await ev(() => { const inS = new Set(window.__ironlog.state.draft.ex.map(b => b.exId)); const el = [...document.querySelectorAll('#pickList .pick[data-ex]')].find(p => !inS.has(p.dataset.ex)); el.click(); return el.dataset.ex; }); await page.waitForTimeout(150); return id; };
    if (ti >= 0) {
      const n5 = after4.ex[ti].sets.length; const id5 = await swapTo(ti); const b5 = (await D()).ex[ti];
      ok(b5.exId === id5 && b5.sets.length === n5 && b5.cut, T + 'a swap on a trimmed exercise keeps its ' + n5 + ' sets and the trimmed mark', { n: b5.sets.length, cut: b5.cut });
    } else ok(true, T + '(no untouched trimmed exercise to swap this time)');

    // 6. Swap the second exercise, which has a set typed or logged: that set stays with it.
    const n6 = (await D()).ex[1].sets.length; const id6 = await swapTo(1); const d6 = await D();
    ok(d6.ex[1].sets.length === 1 && d6.ex[1].sets[0].r === 11 && d6.ex[2].exId === id6 && d6.ex[2].sets.length === n6 - 1, T + 'a swap keeps the set already entered on the old exercise; the new one takes the rest', { old: d6.ex[1].sets, newN: d6.ex[2].sets.length, n6 });

    // 7. + Set, then − Set: the new empty row goes, quietly.
    const n7 = (await D()).ex[0].sets.length;
    await ev(() => window.__ironlog.ACT.sAdd({ dataset: { b: '0' } }));
    await ev(() => document.querySelector('[data-act="sDel"][data-b="0"]') ? document.querySelector('[data-act="sDel"][data-b="0"]').click() : window.__ironlog.ACT.sDel({ dataset: { b: '0' } }));
    await page.waitForTimeout(80);
    ok((await D()).ex[0].sets.length === n7 && !(await ev(() => window.__ironlog.ui.modal)), T + '+ Set then − Set leaves the exercise as it was, without a prompt');
    // − Set until only filled rows remain: then it asks, and Cancel keeps the logged sets.
    for (let k = 0; k < 8; k++) { if (await ev(() => !!window.__ironlog.ui.modal)) break; await ev(() => window.__ironlog.ACT.sDel({ dataset: { b: '0' } })); }
    const m7 = await ev(() => { const m = window.__ironlog.ui.modal; return m ? m.kind : null; });
    await closeModal();
    ok(m7 === 'confirm' && (await D()).ex[0].sets.filter(x => x.done).length === 2, T + '− Set never takes a logged set without asking', m7);

    // 8. Move an exercise; a finished one opened again stays open.
    await ev(() => { const L = window.__ironlog; L.ACT.bOpen({ dataset: { b: '0' } }); L.ACT.bDown({ dataset: { b: '0' } }); });
    await page.waitForTimeout(60);
    ok(await ev((id) => { const d = window.__ironlog.state.draft; return d.ex[1].exId === id && !document.getElementById('blk-1').classList.contains('folded'); }, ex0), T + 'moved down, the first exercise keeps its sets and stays open');
    await ev(() => window.__ironlog.ACT.bUp({ dataset: { b: '1' } }));

    // 8b. Add an exercise after the trim and log a set on it: it is not trimmed.
    await ev(() => window.__ironlog.ACT.pickSession()); await page.waitForTimeout(80);
    const added = await ev(() => { const inS = new Set(window.__ironlog.state.draft.ex.map(b => b.exId)); const el = [...document.querySelectorAll('#pickList .pick[data-ex]')].find(p => !inS.has(p.dataset.ex)); el.click(); return el.dataset.ex; });
    await page.waitForTimeout(150);
    const ai = await ev((id) => window.__ironlog.state.draft.ex.findIndex(b => b.exId === id), added);
    await type(W(ai, 0), '40'); await type(R(ai, 0), '12');
    if (mode === 'grey') await page.click(`[data-act="sDone"][data-b="${ai}"][data-s="0"]`); else await blur();
    await page.waitForTimeout(120);
    ok(await ev((i) => { const b = window.__ironlog.state.draft.ex[i]; return b.sets[0].done && b.sets[0].r === 12 && !b.cut; }, ai), T + 'an exercise added after the trim is logged and not marked trimmed');

    // 9. Reload mid-session: everything as it was.
    const pre = sig(await D());
    await page.reload(); await page.waitForFunction(() => window.__libs && window.__libs.chart); await page.waitForTimeout(200);
    const post = sig(await D());
    ok(JSON.stringify(pre) === JSON.stringify(post), T + 'a reload mid-session keeps every exercise, set, load, tick and trimmed mark', { pre: pre.slice(0, 2), post: post.slice(0, 2) });

    // 10. Finish. Typed, unticked sets are offered and kept; nothing is saved at load 0 that had a load.
    const exp = await ev(() => { const L = window.__ironlog; const d = L.state.draft; return d.ex.map(b => ({ id: b.exId, n: b.sets.filter(x => x.done || (!x.warm && +x.r > 0)).length, w: b.sets.map((x, i) => (x.done || +x.r > 0) ? L.effW(b, i) : null).filter(v => v != null), cut: !!b.cut })).filter(x => x.n); });
    const n0 = await ev(() => window.__ironlog.state.sessions.length);
    await ev(() => window.__ironlog.ACT.finish()); await page.waitForTimeout(150);
    for (let k = 0; k < 4; k++) { const m = await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? document.getElementById('modal').innerText : null; }); if (!m) break; await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await page.waitForTimeout(150); }
    const saved = await ev(() => { const L = window.__ironlog; return L.state.sessions[L.state.sessions.length - 1]; });
    ok((await ev(() => window.__ironlog.state.sessions.length)) === n0 + 1 && !(await ev(() => window.__ironlog.state.draft)), T + 'Finish saves one session and closes it');
    const got = saved.ex.map(b => ({ id: b.exId, n: b.sets.length, w: b.sets.map(x => x.w), cut: !!b.cut }));
    ok(JSON.stringify(got.map(x => [x.id, x.n, x.cut])) === JSON.stringify(exp.map(x => [x.id, x.n, x.cut])), T + 'the saved session has exactly the sets entered, on the right exercises, with the trimmed marks', { got: got.map(x => [x.id, x.n, x.cut]), exp: exp.map(x => [x.id, x.n, x.cut]) });
    ok(got.every((b, i) => b.w.every((w, j) => Math.abs(w - (exp[i] ? exp[i].w[j] : w)) < 1e-6)), T + 'every saved load is the one the field showed; none fell to 0', { got: got.map(x => x.w), exp: exp.map(x => x.w) });
    await closeModal();

    // 11. History and the calendar find it.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.calOpen(); }); await page.waitForTimeout(80);
    await ev(() => document.querySelector('#modal [data-act="calDay"][data-date="2026-09-20"]').click()); await page.waitForTimeout(150);
    ok(await ev((id) => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.id === L.ui.histOpen); return L.ui.tab === 'history' && !!s && s.date === '2026-09-20'; }, saved.id), T + 'the calendar opens the session from today in History');

    // 12. Edit it from History: change one rep, save. Same number of sessions, the rep changed, loads kept.
    await ev((id) => window.__ironlog.ACT.histEdit({ dataset: { id } }), saved.id); await page.waitForTimeout(150);
    for (let k = 0; k < 2; k++) { if (!(await ev(() => window.__ironlog.ui.modal))) break; await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await page.waitForTimeout(120); }
    await ev(() => window.__ironlog.ACT.bOpen({ dataset: { b: '0' } })); await page.waitForTimeout(60);
    await type(R(0, 0), '9'); await blur();
    await ev(() => window.__ironlog.ACT.finish()); await page.waitForTimeout(150);
    for (let k = 0; k < 4; k++) { if (!(await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm'; }))) break; await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await page.waitForTimeout(150); }
    const ed = await ev((id) => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.id === id); return { n: L.state.sessions.length, r: s && s.ex[0].sets[0].r, w: s && s.ex[0].sets.map(x => x.w) }; }, saved.id);
    ok(ed.n === n0 + 1 && ed.r === 9 && JSON.stringify(ed.w) === JSON.stringify(saved.ex[0].sets.map(x => x.w)), T + 'editing the saved session changes the rep and nothing else', ed);
    await closeModal();

    // 13. The next session reads this one (r26 rule). "Last" is always the
    // most recent session, labelled when it was trimmed; the target of a
    // trimmed exercise still comes from its last full session, and says so.
    const nx = await ev((sid) => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.id === sid);
      return s.ex.map(b => { const nb = L.newBlock(b.exId, { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.27 }, {}); return { id: b.exId, cut: !!b.cut, last: nb.last, basis: nb.basis || null, lastR: nb.lastR, saved: b.sets.filter(x => !x.warm && !x.drop).map(x => x.r) }; }); }, saved.id);
    ok(nx.filter(x => x.cut).every(x => /^Last \(Sep 20, trimmed\)/.test(x.last) && x.basis && x.basis < '2026-09-20'), T + 'a trimmed exercise shows today as Last (labelled trimmed), and its target comes from an earlier full session', nx.filter(x => x.cut).map(x => [x.last, x.basis]));
    ok(nx.filter(x => !x.cut).every(x => /^Last \(Sep 20\):/.test(x.last) && !x.basis), T + 'an exercise not trimmed shows today as Last, with the target from today', nx.filter(x => !x.cut).map(x => [x.last, x.basis]));
    ok(nx.every(x => JSON.stringify(x.lastR) === JSON.stringify(x.saved)), T + 'grey reps next time are the reps logged today, set by set', nx.map(x => [x.lastR, x.saved]));
    ok(nx.some(x => !x.cut) && nx.some(x => x.cut), T + '(both kinds were present, so the checks above mean something)');

    ok(!errors.length, T + 'no page errors (' + errors.join(' | ') + ')');
    await browser.close();
  }

  // ---- A session left open by the live build before r25 (r24) carries on here.
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const O = await open('baselines/r24.html', { browser, touch: true, clock: '2026-09-20T10:00:00' });
  await O.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
  await O.page.click('.hero [data-act="startSession"]:not([data-light])'); await O.page.waitForTimeout(150);
  const old = await O.page.evaluate(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[0].sets[0].w = 50; d.ex[0].sets[0].r = 8; d.ex[0].sets[0].done = true; d.ex[1].sets[0].r = 10; L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); L.saveNow(); return JSON.parse(localStorage.getItem('ironlog.v1')); });
  await O.ctx.close();
  const N = await open('index.html', { browser, touch: true, state: old, clock: '2026-09-20T10:00:00' });
  const ev2 = (f, a) => N.page.evaluate(f, a);
  const nd = await ev2(() => JSON.parse(JSON.stringify(window.__ironlog.state.draft)));
  ok(nd && JSON.stringify(nd.ex.map(b => b.sets.map(x => [x.w, x.r, !!x.done]))) === JSON.stringify(old.draft.ex.map(b => b.sets.map(x => [x.w, x.r, !!x.done]))), 'r24 session in progress: every set, load and tick is the same after the update');
  ok(await ev2(() => [...document.querySelectorAll('.sg input[data-f="w"][data-b="0"]')].every(f => f.value !== '' || f.placeholder !== '')), 'r24 session: its filled-in loads still show');
  await ev2(() => window.__ironlog.ACT.finish()); await N.page.waitForTimeout(150);
  for (let k = 0; k < 4; k++) { if (!(await ev2(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm'; }))) break; await ev2(() => document.querySelector('#modal [data-act="mOk"]').click()); await N.page.waitForTimeout(150); }
  const s2 = await ev2(() => { const L = window.__ironlog; return L.state.sessions[L.state.sessions.length - 1]; });
  ok(s2 && s2.date === '2026-09-20' && s2.ex[0].sets[0].w === 50 && s2.ex[0].sets[0].r === 8 && s2.ex.some(b => b.sets.some(x => x.r === 10)), 'r24 session: Finish saves the logged set and offers to keep the typed one', s2 && s2.ex.slice(0, 2));
  ok(!N.errors.length, 'r24 session: no page errors (' + N.errors.join(' | ') + ')');

  // ---- A session left open by r25, the live build before r26, with grey loads
  // (stored empty, the suggestion kept apart), carries on here: the same rows,
  // the grey numbers still showing, and Finish writes each logged set's load.
  const O5 = await open('baselines/r25.html', { browser, touch: true, clock: '2026-09-20T10:00:00' });
  await O5.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
  await O5.page.click('.hero [data-act="startSession"]:not([data-light])'); await O5.page.waitForTimeout(150);
  const old5 = await O5.page.evaluate(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[0].sets[0].r = 8; document.querySelector('.sg [data-act="sDone"][data-b="0"][data-s="0"]').click(); d.ex[1].sets[0].r = 10; L.ACT.shortOpen(); L.ui.modal.mins = 30; L.ACT.shortApply(); L.saveNow(); return JSON.parse(localStorage.getItem('ironlog.v1')); }).catch(e => ({ err: String(e) }));
  await O5.ctx.close();
  ok(old5 && old5.draft && old5.draft.ex[1].sets[0].w == null && old5.draft.ex[1].sw != null, 'r25 session set up with a grey load stored empty', old5 && (old5.err || old5.draft && old5.draft.ex[1].sets[0]));
  const N5 = await open('index.html', { browser, touch: true, state: old5, clock: '2026-09-20T10:00:00' });
  const ev5 = (f, a) => N5.page.evaluate(f, a);
  const nd5 = await ev5(() => JSON.parse(JSON.stringify(window.__ironlog.state.draft)));
  ok(nd5 && JSON.stringify(nd5.ex.map(b => [b.sw, b.sets.map(x => [x.w, x.r, !!x.done])])) === JSON.stringify(old5.draft.ex.map(b => [b.sw, b.sets.map(x => [x.w, x.r, !!x.done])])), 'r25 session in progress: every set, load, tick and suggestion is the same after the update');
  ok(await ev5(() => { const f = document.querySelector('.sg input[data-f="w"][data-b="1"][data-s="0"]') || document.querySelector('.sg input[data-f="w"][data-b="1"]'); return !!f && f.value === '' && f.placeholder !== ''; }), 'r25 session: an empty load still shows its grey number');
  await ev5(() => window.__ironlog.ACT.finish()); await N5.page.waitForTimeout(150);
  for (let k = 0; k < 4; k++) { if (!(await ev5(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm'; }))) break; await ev5(() => document.querySelector('#modal [data-act="mOk"]').click()); await N5.page.waitForTimeout(150); }
  const s5 = await ev5(() => { const L = window.__ironlog; return L.state.sessions[L.state.sessions.length - 1]; });
  ok(s5 && s5.date === '2026-09-20' && s5.ex.every(b => b.sets.every(x => x.w != null)) && s5.ex[0].sets[0].r === 8 && s5.ex[0].sets[0].w === old5.draft.ex[0].sets[0].w, 'r25 session: Finish saves with every load written, none empty', s5 && s5.ex.slice(0, 2));
  ok(!N5.errors.length, 'r25 session: no page errors (' + N5.errors.join(' | ') + ')');
  await browser.close();

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
