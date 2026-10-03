// r29 (V, 2026-10-02): the Volume radar reads only what was logged (your
// average, else this week so far, else "Nothing logged yet"), never the
// routine's plan; Muscles has no plan note; neck and tibialis are tracked
// only, so the default targets can be met; lists in sentences use the serial
// (Oxford) comma; a slimmer 3D body still shaded and picked per muscle; and
// exercises in a session move by dragging a handle or with its arrow keys,
// alongside the ⋯ menu's Move up and Move down.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ---- The radar, the plan, tracked-only muscles.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-02T12:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const vol = () => ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.ui.folds['dash:volume'] = true; L.ui.folds['dash:weak'] = true; L.render(); const v = document.querySelector('#view > [data-mkey="volume"]'); const w = document.querySelector('#view > [data-mkey="weak"]'); const ch = window.Chart && window.Chart.getChart(document.getElementById('chRadar')); return { text: v.innerText.replace(/\s+/g, ' '), canvas: !!v.querySelector('#chRadar'), data: ch ? ch.data.datasets[0].data : null, label: ch && ch.data.datasets[0].label, weak: w.innerText.replace(/\s+/g, ' ') }; });
    // A new person with a ready-made routine and nothing logged.
    await ev(() => { const L = window.__ironlog; const r = L.routineFromTemplate('full3'); L.state.routines = [r]; L.state.activeRoutineId = r.id; L.state.settings.onboarded = true; L.invalidate(); });
    const a = await vol();
    ok(!a.canvas && /Nothing logged yet/.test(a.text) && !/plan/i.test(a.text.replace(/Planned/g, '')) && !/Planned (below|above)/.test(a.text), 'nothing logged: the radar says so, with no chart and no mention of the plan', a.text.slice(0, 200));
    ok(!/Your routine plans fewer/.test(a.weak), 'Muscles has no note about the plan', a.weak.slice(0, 160));
    // One session this week: the chart reads it, labelled as the week so far.
    await ev(() => { const L = window.__ironlog; const R = L.state.routines[0]; const d = R.days.find(x => !x.rest); L.state.sessions.push({ id: 's1', date: '2026-10-01', dayIdx: 0, dayId: d.id, dayName: d.name, routineId: R.id, notes: '', ex: d.items.slice(0, 3).map(it => ({ exId: it.exId, sets: [{ w: 100, r: 8, rir: 2 }, { w: 100, r: 8, rir: 2 }] })) }); L.state = L.normalize(L.state); L.invalidate(); });
    const b = await vol();
    ok(b.canvas && /this week so far/.test(b.text) && b.label === 'Your volume' && b.data.some(x => x > 0) && /Most trained/.test(b.text), 'one session this week: the radar reads it, labelled as this week so far', b.text.slice(0, 220));
    ok(!/Planned (below|above)|routine's plan/.test(b.text), 'and the plan is not on it', b.text.slice(0, 220));
    // Weeks of data: the average.
    await ev(() => { const L = window.__ironlog; L.state.sessions = []; L.makeDemo(); L.invalidate(); });
    const c = await vol();
    ok(c.canvas && /week average/.test(c.text) && !/so far/.test(c.text), 'with full weeks logged it reads your average', c.text.slice(0, 200));
    // Neck and tibialis: tracked only, never flagged, no target in their region.
    const t = await ev(() => { const L = window.__ironlog; const reg = L.regionBalance({ abs: 6, obliques: 3, neck: 50, calves: 8, tibialis: 40 }); const core = reg.find(x => x.label === 'Core'), calves = reg.find(x => x.label === 'Calves'); const b = L.state.settings.bands; L.ui.tab = 'dash'; L.ui.folds['dash:weak'] = true; L.render(); const w = document.querySelector('#view > [data-mkey="weak"]').innerText; return { track: ['neck', 'tibialis', 'serratus', 'rotatorCuff'].every(m => L.TRACK_ONLY.has(m)), coreLo: core.lo, coreGot: core.got, want: b.abs[0] + b.obliques[0], calvesLo: calves.lo, calvesWant: b.calves[0], calvesGot: calves.got, flagged: /\bNeck\b|\bTibialis\b/.test(w) }; });
    ok(t.track && t.coreLo === t.want && t.coreGot === 9 && t.calvesLo === t.calvesWant && t.calvesGot === 8 && !t.flagged, 'neck and tibialis are tracked only: never flagged, and left out of their region on both sides', t);
    await ev(() => { const L = window.__ironlog; L.ACT.guideOpen(); });
    const g = await ev(() => document.querySelector('#modal .gsec[data-g="stats"] .gbody').textContent);
    ok(/Serratus, rotator cuff, neck, and tibialis are tracked only/.test(g), 'the Guide says which muscles are tracked only, and why', g.slice(g.indexOf('Serratus'), g.indexOf('Serratus') + 120));
    await ev(() => window.__ironlog.ACT.mClose());
    ok(!P.errors.length, 'no page errors (radar)', P.errors);
    await P.browser.close();
  }

  // ---- The serial comma.
  {
    const P = await open('index.html', { clock: '2026-09-24T18:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const al = await ev(() => { const f = window.__ironlog.andList; return [f(['a']), f(['a', 'b']), f(['a', 'b', 'c']), f(['a', 'b', 'c', 'd', 'e'], 3), f([])]; });
    ok(JSON.stringify(al) === JSON.stringify(['a', 'a and b', 'a, b, and c', 'a, b, c, and 2 more', '']), 'lists in sentences: "a and b", "a, b, and c", "a, b, c, and 2 more"', al);
    // Every tab with every section open, every tip, and the Guide: no series of three or more without the comma.
    const hits = await ev(() => {
      const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.hidden = []; L.makeDemo(); L.invalidate();
      const texts = [];
      const grab = () => { document.querySelectorAll('details').forEach(d => { d.open = true; }); document.querySelectorAll('.ht[hidden]').forEach(e => { e.hidden = false; }); texts.push(document.getElementById('view').textContent); document.querySelectorAll('[data-tip]').forEach(e => texts.push(e.dataset.tip)); };
      for (const tab of ['today', 'program', 'dash', 'history', 'settings']) { L.ui.tab = tab; L.render(); grab(); }
      L.ACT.guideOpen(); texts.push(document.getElementById('modal').textContent); L.ACT.mClose();
      // Pairs inside an item and phrases that only look like a list.
      const fine = ['Epley at 11 and 12', 'counts as hard and as 0', 'errs low and never', 'Schedule and Weekly volume', 'Rest timer and logging', 'W and D', 'rep range and rest', 'theme and accent', 'loads and targets'];
      const re = /(?:^|[^,\w])([A-Za-z][\w'-]*(?: [\w'()-]+){0,3}), ([\w'()-]+(?: [\w'()-]+){0,4}) and ([\w'-]+)/g; const out = new Set();
      for (const t of texts) for (const m of t.matchAll(re)) { const seg = t.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10).replace(/\s+/g, ' '); if (!fine.some(f => seg.includes(f))) out.add(seg); }
      return [...out];
    });
    ok(!hits.length, 'no list of three or more without the serial comma, on any tab, tip or the Guide', hits);
    ok(!P.errors.length, 'no page errors (comma)', P.errors);
    await P.browser.close();
  }

  // ---- Reordering exercises in a session: drag, arrow keys, and the menu all do the same.
  {
    const P = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-24T18:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); localStorage.setItem('ironlog.v1.loadAsk', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
    await page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(200);
    const n0 = await ev(() => window.__ironlog.state.draft.ex[0].sets.length);
    for (let i = 0; i < n0; i++) { const sel = `[data-act="sDone"][data-b="0"][data-s="${i}"]`; if (await page.$(sel)) { await page.tap(sel); await wait(100); } }
    await wait(2600);
    const grips = await ev(() => { const bs = [...document.querySelectorAll('#view section.block')]; return { blocks: bs.length, grips: bs.filter(b => b.querySelector(':scope .bgrip')).length, folded: !!document.querySelector('#view section.block.folded .bgrip'), h: Math.round(document.querySelector('.bgrip').getBoundingClientRect().height), label: document.querySelector('.bgrip').getAttribute('aria-label') }; });
    ok(grips.blocks > 2 && grips.grips === grips.blocks && grips.folded && grips.h >= 44 && /^Move .+: drag, or use the arrow keys$/.test(grips.label), 'every exercise in a session has a 44 px handle, a finished (folded) one too', grips);
    const ids = () => ev(() => window.__ironlog.state.draft.ex.map(b => b.exId));
    const before = await ids();
    const cdp = await page.context().newCDPSession(page);
    const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.locator('.bgrip[data-b="2"]').scrollIntoViewIfNeeded();
    const gb = await page.locator('.bgrip[data-b="2"]').boundingBox(); const tb = await page.locator('section.block[data-bi="1"]').boundingBox();
    const x0 = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2, y1 = tb.y + 5;
    await tp('touchStart', x0, y0); await wait(50);
    for (let k = 1; k <= 20; k++) { await tp('touchMove', x0, y0 + (y1 - y0) * k / 20); await wait(25); }
    await wait(200); await tp('touchEnd', x0, y1); await wait(400);
    const after = await ids();
    ok(after[1] === before[2] && after[2] === before[1] && after.length === before.length, 'a finger drag on the handle moves the exercise up one place', { before: before.slice(0, 4), after: after.slice(0, 4) });
    const kept = await ev(() => { const d = window.__ironlog.state.draft; return { done0: d.ex[0].sets.filter(s => !s.warm).every(s => s.done), folded0: !!document.querySelector('section.block[data-bi="0"].folded') }; });
    ok(kept.done0 && kept.folded0, 'the finished exercise stays done and folded', kept);
    // The arrow keys on the handle.
    await page.locator('.bgrip[data-b="1"]').focus(); await page.keyboard.press('ArrowDown'); await wait(150);
    const k1 = await ids();
    ok(k1[2] === after[1] && k1[1] === after[2], 'the down arrow on the handle moves it down one place', k1.slice(0, 4));
    // The menu's Move up still works and agrees.
    await ev(() => window.__ironlog.ACT.bUp({ dataset: { b: '2' } })); await wait(100);
    const k2 = await ids();
    ok(k2.join() === after.join(), 'Move up from the menu puts it back', k2.slice(0, 4));
    // A reload keeps the order (the draft is saved).
    await page.reload(); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.sortable);
    ok((await ids()).join() === after.join(), 'the new order survives a reload');
    // Sets typed before a move stay with their exercise.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await page.fill('[data-f="r"][data-b="2"][data-s="0"]', '11'); await wait(100);
    const typed = await ev(() => window.__ironlog.state.draft.ex[2].exId);
    await page.locator('.bgrip[data-b="2"]').focus(); await page.keyboard.press('ArrowUp'); await wait(150);
    const moved = await ev(() => { const d = window.__ironlog.state.draft; const b = d.ex[1]; return { id: b.exId, r: b.sets[0].r }; });
    ok(moved.id === typed && +moved.r === 11, 'reps typed on an exercise move with it', moved);
    ok(!P.errors.length, 'no page errors (session order)', P.errors);
    await P.browser.close();
  }

  // ---- The 3D body: slimmer, still every muscle shaded and picked.
  {
    const P = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-24T18:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.folds['today:map'] = true; L.render(); });
    await wait(300); await page.click('[data-act="mapView"][data-v="3d"]');
    await page.waitForFunction(() => window.__ironlog.map3d().state === 'ready', null, { timeout: 20000 }).catch(() => {});
    await wait(500);
    const m = await ev(() => { const x = window.__ironlog.map3d(); return { state: x.state, meshes: x.meshes, n: Object.keys(x.colors).length }; });
    ok(m.state === 'ready' && m.meshes > 50 && m.n >= 23, 'the 3D body draws with all 23 muscle groups', m);
    // The waist is narrower than the chest and the hips: a lifter, not a barrel.
    const prof = await ev(() => { const s = document.documentElement.innerHTML; const i = s.indexOf("const B3_PARTS=["); const t = s.slice(i, s.indexOf('\n', s.indexOf('prof', i))); const pts = JSON.parse(t.slice(t.indexOf('prof:') + 5, t.indexOf(']],', t.indexOf('prof:')) + 2).replace(/([\[,])\./g, '$10.')); const at = y => pts.reduce((b, p) => Math.abs(p[1] - y) < Math.abs(b[1] - y) ? p : b)[0]; return { waist: at(1.07), chest: at(1.32), hips: at(.93) }; });
    ok(prof.waist < prof.chest * 0.75 && prof.waist < prof.hips, 'the torso tapers: waist well under the chest and under the hips', prof);
    ok(!P.errors.length, 'no page errors (3D)', P.errors);
    await P.browser.close();
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e.stack || e); process.exit(1); });
