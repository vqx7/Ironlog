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
    ok(a.canvas && a.data && a.data.every(x => x === 0) && /Nothing logged yet/.test(a.text) && !/plan/i.test(a.text.replace(/Planned/g, '')) && !/Planned (below|above)/.test(a.text), 'nothing logged: the radar still draws, empty against the target ring, says so, and never shows the plan', { t: a.text.slice(0, 200), data: a.data });
    ok(!/Your routine plans fewer/.test(a.weak), 'Muscles has no note about the plan', a.weak.slice(0, 160));
    // One session this week: the chart reads it, labelled as the week so far.
    await ev(() => { const L = window.__ironlog; const R = L.state.routines[0]; const d = R.days.find(x => !x.rest); L.state.sessions.push({ id: 's1', date: '2026-10-01', dayIdx: 0, dayId: d.id, dayName: d.name, routineId: R.id, notes: '', ex: d.items.slice(0, 3).map(it => ({ exId: it.exId, sets: [{ w: 100, r: 8, rir: 2 }, { w: 100, r: 8, rir: 2 }] })) }); L.state = L.normalize(L.state); L.invalidate(); });
    const b = await vol();
    ok(b.canvas && /this week so far/.test(b.text) && b.label === 'Your volume' && b.data.some(x => x > 0) && /Most trained/.test(b.text), 'one session this week: the radar reads it, labelled as this week so far', b.text.slice(0, 220));
    ok(!/Planned (below|above)|routine's plan/.test(b.text), 'and the plan is not on it', b.text.slice(0, 220));
    // Only older training (nothing in the last 4 weeks or this week): the last trained weeks, dated.
    const old = await ev(() => { const L = window.__ironlog; const R = L.state.routines[0]; const d = R.days.find(x => !x.rest); L.state.sessions = ['2026-07-06', '2026-07-08', '2026-07-14', '2026-07-21'].map((date, i) => ({ id: 'o' + i, date, dayIdx: 0, dayId: d.id, dayName: d.name, routineId: R.id, notes: '', ex: d.items.slice(0, 3).map(it => ({ exId: it.exId, sets: [{ w: 100, r: 8, rir: 2 }, { w: 100, r: 8, rir: 2 }] })) })); L.state = L.normalize(L.state); L.invalidate(); const rs = L.regionSrc(); return { label: rs.label, old: rs.old }; });
    const o = await vol();
    ok(old.old && /your last 3 trained weeks, to Jul 26/.test(old.label) && o.canvas && o.data.some(x => x > 0) && /Nothing logged in the last 4 weeks, so this shows your last 3 trained weeks/.test(o.text), 'nothing in the last 4 weeks: the radar draws from your last trained weeks, dated, and says so', { old, t: o.text.slice(0, 260) });
    const cb = await ev(() => { const L = window.__ironlog; return L.coach().text; });
    ok(/Nothing logged in the last 4 weeks/.test(cb), 'back from a break, the coach says nothing was logged lately, not "after your first full week"', cb);
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
    // The sheets and tips not open above (the exercise editor, pickers): the source itself, outside code comments.
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
    const srcHits = [...src.matchAll(/\b[A-Za-z]+(?:-[a-z]+)?, [a-z]+(?:-[a-z]+)?, [a-z]+(?:-[a-z]+)? (?:and|or) [a-z]+/g)].map(m => m[0]).filter(x => !/theme and accent/.test(x)); // one item ("theme and accent") in a longer list that ends ", and priority muscles"
    ok(!srcHits.length, 'no list of three or more one-word items without the serial comma in the source outside comments', srcHits);
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
    const grips = await ev(() => { const bs = [...document.querySelectorAll('#view section.block')]; return { blocks: bs.length, grips: bs.filter(b => b.querySelector(':scope .bgrip')).length, folded: !!document.querySelector('#view section.block.folded .bgrip'), h: Math.round(document.querySelector('.bgrip').getBoundingClientRect().height), label: document.querySelector('.bgrip').getAttribute('aria-label'), touch: [...document.querySelectorAll('#view .bgrip')].map(gr => { gr.scrollIntoView({ block: 'center' }); const g = gr.getBoundingClientRect(); let n = 0; for (let dx = -40; dx <= 40; dx++) if (document.elementFromPoint(g.left + g.width / 2 + dx, g.top + g.height / 2) === gr) n++; return n; }) }; });
    ok(grips.touch.every(n => n >= 44), 'every handle takes a touch 44 px wide', grips.touch);
    ok(grips.blocks > 2 && grips.grips === grips.blocks && grips.folded && grips.h >= 44 && /^Move .+: drag, or use the arrow keys$/.test(grips.label), 'every exercise in a session has a 44 px handle, a finished (folded) one too', grips);
    const ids = () => ev(() => window.__ironlog.state.draft.ex.map(b => b.exId));
    const before = await ids();
    const cdp = await page.context().newCDPSession(page);
    const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await page.locator('.bgrip[data-b="2"]').scrollIntoViewIfNeeded();
    const gb = await page.locator('.bgrip[data-b="2"]').boundingBox();
    const x0 = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2;
    await tp('touchStart', x0, y0); await wait(50);
    await tp('touchMove', x0, y0 + 3); await wait(150);
    // Where the exercise above is once the list has gone to one line each, as a finger aims at what it sees.
    const y1 = await ev(() => Math.round(document.querySelector('#view section.block[data-bi="1"]').getBoundingClientRect().top + 5));
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

  // ---- The independent reviews' findings on session order (r29).
  {
    const P = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-24T18:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.autoDone = true; L.makeDemo(); localStorage.setItem('ironlog.v1.loadAsk', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
    await page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(200);
    // An empty reps field focused, then the handle tapped: leaving for the
    // handle is not "done with this set", so nothing is ticked.
    await page.locator('[data-f="r"][data-b="1"][data-s="0"]').scrollIntoViewIfNeeded();
    await page.focus('[data-f="r"][data-b="1"][data-s="0"]'); await wait(50);
    await page.tap('.bgrip[data-b="1"]'); await wait(300);
    const t1 = await ev(() => { const s = window.__ironlog.state.draft.ex[1].sets[0]; return { done: !!s.done, r: s.r }; });
    ok(!t1.done && (t1.r === '' || t1.r == null), 'tapping a handle while an empty reps field is focused ticks nothing', t1);
    // A move that splits a superset clears the pair, so the rest timer is not left waiting for a partner.
    const ss = await ev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[1].plan.ss = 'P1'; d.ex[2].plan.ss = 'P1'; const a = d.ex[1].exId, b = d.ex[2].exId; L.moveBlock(2, d.ex.length - 1); return { n: d.ex.length, tags: d.ex.filter(x => x.exId === a || x.exId === b).map(x => x.plan.ss || null) }; });
    ok(ss.n >= 4 && ss.tags.every(x => x == null), 'a move that splits a superset clears both tags', ss);
    const ss2 = await ev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[0].plan.ss = 'P2'; d.ex[1].plan.ss = 'P2'; const ids = [d.ex[0].exId, d.ex[1].exId]; L.moveBlock(d.ex.length - 1, 2); return d.ex.filter(x => ids.includes(x.exId)).map(x => x.plan.ss); });
    ok(ss2.every(x => x === 'P2'), 'a move elsewhere leaves an intact superset alone', ss2);
    // Undo of an earlier action that did not touch the order keeps a reorder made after it, and the sets.
    const un = await ev(async () => { const L = window.__ironlog; const d = L.state.draft; d.ex[0].sets[0].done = true; d.ex[0].sets[0].r = 8; L.saveNow(); const first = d.ex[0].exId; L.state.settings.hidden = ['today:map']; L.saveNow(); L.ACT.layoutDefault(); await new Promise(r => setTimeout(r, 50)); L.moveBlock(0, 2); const moved = L.state.draft.ex.map(b => b.exId).join(); await L.ACT.undo(); await new Promise(r => setTimeout(r, 100)); const b = L.state.draft.ex.find(x => x.exId === first); return { kept: L.state.draft.ex.map(b => b.exId).join() === moved, done: !!b.sets[0].done && +b.sets[0].r === 8, undone: L.state.settings.hidden.join() === 'today:map' }; });
    ok(un.kept && un.done && un.undone, 'Undo of an earlier Settings change undoes it, and keeps the session order and the sets', un);
    // 320 px: a finished (folded) exercise with its handle fits the screen.
    for (let i = 0; i < 8; i++) { const sel = `[data-act="sDone"][data-b="0"][data-s="${i}"]`; if (await page.$(sel)) { await page.tap(sel); await wait(80); } }
    await wait(2600);
    await page.setViewportSize({ width: 320, height: 700 }); await ev(() => window.__ironlog.render()); await wait(200);
    const w320 = await ev(() => { const f = document.querySelector('#view section.block.folded'); const r = f && f.getBoundingClientRect(); const gr = f && f.querySelector('.bgrip'); const g = gr && gr.getBoundingClientRect(); const cy = g && g.top + g.height / 2, cx = g && g.left + g.width / 2; let hit = 0; if (g) for (let dx = -40; dx <= 40; dx++) if (document.elementFromPoint(cx + dx, cy) === gr) hit++; return { folded: !!f, sw: document.documentElement.scrollWidth, right: r && Math.round(r.right), grip: hit, h: g && Math.round(g.height) }; });
    ok(w320.folded && w320.sw <= 320 && w320.right <= 320 && w320.grip >= 44 && w320.h >= 44, 'at 320 px a folded exercise and its 44 px handle (touch area) fit, no sideways scroll', w320);
    ok(!P.errors.length, 'no page errors (review fixes, session)', P.errors);
    await P.browser.close();
  }

  // ---- A long drag: open exercises are taller than the screen, so during a
  // drag each shows one line, and the page scrolls at the top and bottom edges.
  {
    const P = await open('index.html', { touch: true, w: 390, h: 700, clock: '2026-09-24T18:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); localStorage.setItem('ironlog.v1.loadAsk', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
    await page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(300);
    const cdp = await page.context().newCDPSession(page);
    const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const ids = () => ev(() => window.__ironlog.state.draft.ex.map(b => b.exId));
    await page.locator('.bgrip[data-b="0"]').scrollIntoViewIfNeeded();
    const tall = await ev(() => Math.round(document.querySelectorAll('#view section.block')[1].getBoundingClientRect().top - window.innerHeight));
    // Down: the first exercise past the second, which starts off-screen.
    await page.locator('.bgrip[data-b="0"]').scrollIntoViewIfNeeded();
    let gb = await page.locator('.bgrip[data-b="0"]').boundingBox(); let x0 = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2;
    const a0 = await ids();
    await tp('touchStart', x0, y0); await wait(60);
    for (let k = 1; k <= 15; k++) { await tp('touchMove', x0, y0 + (560 - y0) * k / 15); await wait(30); }
    const mid = await ev(() => ({ cls: document.body.classList.contains('blkdrag'), gap: (() => { const bs = [...document.querySelectorAll('#view section.block')].filter(b => !b.classList.contains('sortable-chosen')); return Math.round(bs[1].getBoundingClientRect().top - bs[0].getBoundingClientRect().top); })() }));
    await tp('touchEnd', x0, 560); await wait(400);
    const a1 = await ids();
    ok(tall > 0 && mid.cls && mid.gap < 70 && a1.indexOf(a0[0]) >= 2, 'a long drag down: each exercise shows one line while dragging, so the first moves past ones that started off-screen', { belowScreen: tall, mid, to: a1.indexOf(a0[0]) });
    ok(!(await ev(() => document.body.classList.contains('blkdrag'))) && (await ev(() => !!document.querySelector('#view section.block:not(.folded) .sg'))), 'after the drop every exercise opens again', null);
    // Up, from the bottom of the list to the top: the page scrolls at the edge.
    const last = a1.length - 1;
    await page.locator(`.bgrip[data-b="${last}"]`).scrollIntoViewIfNeeded();
    gb = await page.locator(`.bgrip[data-b="${last}"]`).boundingBox(); x0 = gb.x + gb.width / 2; y0 = gb.y + gb.height / 2;
    const sy0 = await ev(() => window.scrollY);
    await tp('touchStart', x0, y0); await wait(60);
    for (let k = 1; k <= 10; k++) { await tp('touchMove', x0, y0 + (75 - y0) * k / 10); await wait(30); }
    for (let k = 0; k < 50; k++) { await tp('touchMove', x0, 75 + (k % 2)); await wait(40); }
    const sy1 = await ev(() => window.scrollY);
    await tp('touchEnd', x0, 75); await wait(400);
    const a2 = await ids();
    ok(sy0 > 200 && sy1 < sy0 - 200 && a2[0] === a1[last], 'held at the top edge, the page scrolls and the last exercise reaches the top', { sy0, sy1, to: a2.indexOf(a1[last]) });
    // A drop keeps the page where it was: the exercise moved is on screen afterwards.
    await ev(() => { window.scrollTo(0, 0); });
    await page.locator('.bgrip[data-b="3"]').scrollIntoViewIfNeeded(); await ev(() => window.scrollBy(0, 200)); await wait(100);
    gb = await page.locator('.bgrip[data-b="3"]').boundingBox(); x0 = gb.x + gb.width / 2; y0 = gb.y + gb.height / 2;
    const b0 = await ids(); const sy2 = await ev(() => window.scrollY);
    await tp('touchStart', x0, y0); await wait(60); await tp('touchMove', x0, y0 + 2); await wait(150); await tp('touchEnd', x0, y0 + 2); await wait(400);
    const jit = await ev((id) => { const i = window.__ironlog.state.draft.ex.findIndex(b => b.exId === id); const r = document.querySelector(`#view section.block[data-bi="${i}"] .bgrip`).getBoundingClientRect(); return { i, top: Math.round(r.top), sy: window.scrollY }; }, b0[3]);
    ok(jit.i === 3 && Math.abs(jit.top - Math.round(gb.y)) < 30 && jit.sy > 0, 'a 2 px wiggle on a handle leaves the exercise in place and the page where it was', { jit, before: Math.round(gb.y), sy2 });
    await tp('touchStart', x0, y0); await wait(60); await tp('touchMove', x0, y0 + 3); await wait(150);
    const y4 = await ev(() => { const bs = [...document.querySelectorAll('#view section.block')].filter(b => !b.classList.contains('sortable-chosen')); return Math.round(bs[4].getBoundingClientRect().top + 30); });
    for (let k = 1; k <= 10; k++) { await tp('touchMove', x0, y0 + (y4 - y0) * k / 10); await wait(30); }
    await tp('touchEnd', x0, y4); await wait(400);
    const drop = await ev((id) => { const i = window.__ironlog.state.draft.ex.findIndex(b => b.exId === id); const r = document.querySelector(`#view section.block[data-bi="${i}"]`).getBoundingClientRect(); return { i, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight }; }, b0[3]);
    ok(drop.i >= 4 && drop.top < drop.vh && drop.bottom > 52, 'after a drop the exercise moved is on screen, not back at the top of the session', drop);
    // The bottom edge sits above the rest timer when it shows.
    await ev(() => { window.scrollTo(0, 0); });
    const tk = await ev(() => { const s = document.querySelector('[data-act="sDone"][data-b="1"][data-s="0"]'); s.scrollIntoView({ block: 'center' }); return true; });
    await page.tap('[data-act="sDone"][data-b="1"][data-s="0"]'); await wait(300);
    const tm = await ev(() => { const t = document.getElementById('timer'); return t && !t.hidden ? Math.round(t.getBoundingClientRect().top) : null; });
    await ev(() => { window.scrollTo(0, 0); }); await wait(100);
    gb = await page.locator('.bgrip[data-b="0"]').boundingBox(); x0 = gb.x + gb.width / 2; y0 = gb.y + gb.height / 2;
    const sy5 = await ev(() => window.scrollY);
    await tp('touchStart', x0, y0); await wait(60);
    for (let k = 1; k <= 10; k++) { await tp('touchMove', x0, y0 + (tm - 20 - y0) * k / 10); await wait(30); }
    for (let k = 0; k < 40; k++) { await tp('touchMove', x0, tm - 20 + (k % 2)); await wait(40); }
    const sy6 = await ev(() => window.scrollY);
    await tp('touchEnd', x0, tm - 20); await wait(400);
    ok(tk && tm && sy6 > sy5 + 100, 'with the rest timer showing, a finger just above it scrolls the page down', { timerTop: tm, sy5, sy6 });
    ok(!(await ev(() => document.body.classList.contains('blkdrag') || !!document.getElementById('view').style.paddingBottom)), 'nothing from the drag is left on the page', null);
    ok(!P.errors.length, 'no page errors (long drag)', P.errors);
    await P.browser.close();
  }

  // ---- The reviews' findings on the numbers: first week, first-run targets, tracked-only everywhere.
  {
    const P = await open('index.html', { clock: '2026-10-07T12:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    // A log that began on a Saturday: that week is not averaged as a full one.
    const fw = await ev(() => {
      const L = window.__ironlog; const R = L.state.routines[0]; const d = R.days.find(x => !x.rest);
      const mk = (id, date) => ({ id, date, dayIdx: 0, dayId: d.id, dayName: d.name, routineId: R.id, notes: '', ex: d.items.slice(0, 3).map(it => ({ exId: it.exId, sets: [{ w: 100, r: 8, rir: 2 }, { w: 100, r: 8, rir: 2 }] })) });
      L.state.settings.onboarded = true; L.state.sessions = [mk('a', '2026-09-26'), mk('b', '2026-09-30')]; L.state = L.normalize(L.state); L.invalidate();
      const one = { ff: L.firstFullWeek(), wk2: L.weekStart('2026-09-30'), weeks: L.actualAvg4()._weeks };
      L.state.sessions = [mk('c', L.weekStart('2026-09-26')), mk('b', '2026-09-30')]; L.state = L.normalize(L.state); L.invalidate();
      return { one, two: { ff: L.firstFullWeek(), wk1: L.weekStart('2026-09-26'), weeks: L.actualAvg4()._weeks } };
    });
    ok(fw.one.ff === fw.one.wk2 && fw.one.weeks === 1, 'a log started mid-week averages from the first full week only', fw.one);
    ok(fw.two.ff === fw.two.wk1 && fw.two.weeks === 2, 'a log started on the first day of a week counts that week', fw.two);
    // Tracked-only muscles in the volume rows and the weekly trend: no target shown.
    const tr = await ev(() => {
      const L = window.__ironlog; L.state.sessions = []; L.makeDemo(); L.invalidate();
      L.ui.tab = 'dash'; L.ui.folds['dash:volume'] = true; L.ui.volMode = 'avg'; L.render();
      const rows = [...document.querySelectorAll('#view [data-mkey="volume"] .mrow')];
      const row = n => rows.find(r => r.children[1] && r.children[1].textContent === n);
      const neck = row('Neck'), chest = row('Chest');
      L.ui.volMode = 'trend'; L.ui.dashMuscle = 'neck'; L.render();
      const ch = window.Chart && window.Chart.getChart(document.getElementById('chMuscle'));
      const neckLines = ch ? ch.data.datasets.filter(x => /_band/.test(x.label)).length : -1;
      L.ui.dashMuscle = 'chest'; L.render();
      const ch2 = window.Chart && window.Chart.getChart(document.getElementById('chMuscle'));
      const chestLines = ch2 ? ch2.data.datasets.filter(x => /_band/.test(x.label)).length : -1;
      return { neckTxt: neck && neck.textContent, neckZone: neck && !!neck.querySelector('.zone'), chestTxt: chest && chest.textContent, chestZone: chest && !!chest.querySelector('.zone'), neckLines, chestLines };
    });
    ok(/tracked/.test(tr.neckTxt) && !tr.neckZone && /\/\d+-\d+/.test(tr.chestTxt) && tr.chestZone, 'volume rows: a tracked-only muscle shows "tracked" and no target zone; others keep theirs', tr);
    ok(tr.neckLines === 0 && tr.chestLines > 0, 'the weekly trend draws target lines only for muscles with a target', tr);
    // Pick for me never chases a tracked-only muscle's "deficit".
    const px = await ev(() => { const L = window.__ironlog; const s = L.state.settings; const keep = s.bands.neck; s.bands.neck = [30, 40]; L.invalidate(); const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); const d = R.days.find(x => !x.rest); const a = L.rankExercises({ ex: [], date: L.today(), dayId: d.id }).map(x => x.m); s.bands.neck = keep; L.invalidate(); return a; });
    ok(Array.isArray(px) && !px.includes('neck'), 'Pick for me does not chase a tracked-only muscle even with a high target', px);
    ok(!P.errors.length, 'no page errors (review fixes, numbers)', P.errors);
    await P.browser.close();
  }

  // ---- First run: picking a ready-made routine fits the weekly targets to it.
  {
    const P = await open('index.html', { w: 390, h: 844, clock: '2026-10-02T12:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => window.__ironlog.ACT.obSample()); await wait(150);
    await page.click('#modal [data-act="tplPick"][data-k="full3"]'); await wait(200);
    const fit = await ev(() => {
      const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); const plan = L.plannedSets(R); const b = L.state.settings.bands;
      const bad = Object.keys(L.BANDS).filter(m => { const want = L.TRACK_ONLY.has(m) ? L.BANDS[m][0] : Math.min(L.BANDS[m][0], Math.floor(plan[m] || 0)); return b[m][0] !== want || b[m][1] !== L.BANDS[m][1]; });
      const short = Object.keys(L.BANDS).filter(m => !L.TRACK_ONLY.has(m) && (plan[m] || 0) < b[m][0]);
      return { bad, short, toast: document.getElementById('toast') ? document.getElementById('toast').textContent : '' };
    });
    ok(!fit.bad.length && !fit.short.length, 'each weekly minimum comes down to what the routine plans, so following it is on target; maximums unchanged', fit);
    ok(/Weekly targets match it/.test(fit.toast), 'and the toast says so', fit.toast);
    // Targets someone already set are never touched.
    const kept = await ev(() => { const L = window.__ironlog; const s = L.state.settings; s.bands = JSON.parse(JSON.stringify(L.BANDS)); s.bands.chest = [12, 22]; const before = JSON.stringify(s.bands); const R = L.routineFromTemplate('ppl6') || L.state.routines[0]; const ch = L.fitTargets(R); return { ch, same: JSON.stringify(s.bands) === before }; });
    ok(kept.ch === false && kept.same, 'targets changed by the lifter are left as they are', kept);
    ok(!P.errors.length, 'no page errors (first-run targets)', P.errors);
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
