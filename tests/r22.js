// r22: body data syncing in yearly documents (item 19), checked with a real
// r21 phone and r22 phones on one cloud, so no weigh-in is lost while phones
// run different builds; Undo after a reload (item 20); the first-run pages;
// the PR board and the PR moment (items 27, 28).
const { open } = require('./h'); const { chromium } = require('playwright');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const store = new Map();
const cloudSetup = async (ctx, page) => {
  await page.exposeFunction('__dbGet', p => store.has(p) ? store.get(p) : null);
  await page.exposeFunction('__dbSet', (p, v) => { store.set(p, v); return true; });
  await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
  await page.addInitScript(() => {
    window.claude = { use: async k => {
      if (k === 'user') return { id: async () => 'u1' };
      if (k === 'db') return { doc: p => ({ get: async () => { const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); return true; } }), collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
      return null;
    } };
  });
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const doc = id => { const v = store.get('data/users/u1/' + id); return v ? JSON.parse(JSON.parse(v).json) : null; };
const ids = list => (list || []).map(x => x.id).sort().join();
(async () => {
  const browser = await chromium.launch();
  // ---- 19. Body data in yearly documents, across an r21 phone and r22 phones.
  const O = await open('baselines/r21.html', { browser, clock: '2026-09-26T10:00:00', setup: cloudSetup });
  const oev = (f, a) => O.page.evaluate(f, a);
  await wait(600);
  await oev(() => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true;
    s.bodyweights.push({ id: 'bw1', date: '2025-12-30', kg: 80 }, { id: 'bw2', date: '2026-09-20', kg: 81 });
    s.measurements.push({ id: 'm1', date: '2026-09-20', waist: 84 }); L.saveNow(); });
  await oev(() => window.__ironlog.flush()); await wait(400);
  ok(ids(doc('core').bodyweights) === 'bw1,bw2' && !store.has('data/users/u1/b-2026'), 'r21 phone: weigh-ins sit in core, as before');
  const N = await open('index.html', { browser, clock: '2026-09-26T10:00:00', setup: cloudSetup });
  const nev = (f, a) => N.page.evaluate(f, a);
  await wait(1200); await nev(() => window.__ironlog.flush()); await wait(500);
  ok(await nev(() => { const s = window.__ironlog.state; return s.bodyweights.map(x => x.id).sort().join() === 'bw1,bw2' && s.measurements.map(x => x.id).join() === 'm1'; }), 'r22 phone signs in: gets every weigh-in and measurement from the older core');
  ok(!(doc('core').bodyweights || []).length && !(doc('core').measurements || []).length && ids(doc('b-2025').bodyweights) === 'bw1' && ids(doc('b-2026').bodyweights) === 'bw2' && ids(doc('b-2026').measurements) === 'm1', 'the cloud copy moves them into one document per year, and core no longer holds them', [...store.keys()]);
  // The r21 phone syncs: its core has no weigh-ins now, but nothing is deleted from the cloud.
  await oev(() => window.__ironlog.sync()); await wait(600);
  ok(ids(doc('b-2026').bodyweights) === 'bw2' && ids(doc('b-2025').bodyweights) === 'bw1', 'an r21 phone syncing afterwards never touches the yearly documents');
  // The r21 phone logs a weigh-in: it lands in core, and the r22 phone moves it.
  await oev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'bw3', date: '2026-09-25', kg: 80.5 }); L.saveNow(); });
  await oev(() => window.__ironlog.flush()); await wait(400);
  ok(ids(doc('core').bodyweights) === 'bw3', 'r21 phone: a new weigh-in goes into core');
  await nev(() => window.__ironlog.sync()); await wait(700); await nev(() => window.__ironlog.flush()); await wait(500);
  ok(await nev(() => window.__ironlog.state.bodyweights.map(x => x.id).sort().join() === 'bw1,bw2,bw3'), 'r22 phone picks up the weigh-in the r21 phone wrote');
  ok(ids(doc('b-2026').bodyweights) === 'bw2,bw3' && !(doc('core').bodyweights || []).length, 'and moves it into the 2026 document');
  // Deleting on the r22 phone sticks, even after the r21 phone writes core again.
  await nev(() => { const L = window.__ironlog; L.state.bodyweights = L.state.bodyweights.filter(x => x.id !== 'bw2'); L.saveNow(); });
  await nev(() => window.__ironlog.flush()); await wait(500);
  await oev(() => window.__ironlog.sync()); await wait(500);
  await oev(() => { const L = window.__ironlog; L.state.settings.timeBudget = 70; L.saveNow(); }); await oev(() => window.__ironlog.flush()); await wait(500);
  await nev(() => window.__ironlog.sync()); await wait(700);
  ok(await nev(() => window.__ironlog.state.bodyweights.map(x => x.id).sort().join() === 'bw1,bw3' && window.__ironlog.state.settings.timeBudget === 70), 'a weigh-in deleted on the r22 phone stays deleted; the r21 phone\'s setting still syncs');
  // Two r22 phones: a delete on one and an add on the other both survive.
  const N2 = await open('index.html', { browser, clock: '2026-09-26T10:00:00', setup: cloudSetup });
  const n2 = (f, a) => N2.page.evaluate(f, a);
  await wait(1200);
  ok(await n2(() => window.__ironlog.state.bodyweights.map(x => x.id).sort().join() === 'bw1,bw3' && window.__ironlog.state.measurements.length === 1), 'a second r22 phone gets the same body data');
  await n2(() => { const L = window.__ironlog; L.state.bodyweights = L.state.bodyweights.filter(x => x.id !== 'bw3'); L.saveNow(); }); await n2(() => window.__ironlog.flush()); await wait(500);
  await nev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'bw4', date: '2026-09-26', kg: 80.2 }); L.saveNow(); }); await nev(() => window.__ironlog.flush()); await wait(600);
  await n2(() => window.__ironlog.sync()); await wait(700); await nev(() => window.__ironlog.sync()); await wait(700);
  const both = [await nev(() => window.__ironlog.state.bodyweights.map(x => x.id).sort().join()), await n2(() => window.__ironlog.state.bodyweights.map(x => x.id).sort().join())];
  ok(both[0] === 'bw1,bw4' && both[1] === 'bw1,bw4' && ids(doc('b-2026').bodyweights) === 'bw4', 'delete on one r22 phone, add on the other: both phones and the cloud agree', both);
  ok(await nev(() => window.__ironlog.state.sessions.length === 0) && !O.errors.length && !N.errors.length && !N2.errors.length, 'no console errors on any phone', [...O.errors, ...N.errors, ...N2.errors]);
  await O.ctx.close(); await N.ctx.close(); await N2.ctx.close();

  // ---- 19, found in review: phones updating one after another.
  // Both on r21 and synced; B updates and deletes a weigh-in; then A updates. The delete must stick.
  {
    store.clear();
    const path = require('path'); const NEW = 'file://' + path.resolve('index.html');
    const A = await open('baselines/r21.html', { browser, clock: '2026-09-26T10:00:00', setup: cloudSetup });
    const B = await open('baselines/r21.html', { browser, clock: '2026-09-26T10:00:00', setup: cloudSetup });
    const a = (f, x) => A.page.evaluate(f, x), b = (f, x) => B.page.evaluate(f, x);
    await wait(600);
    await a(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.bodyweights.push({ id: 'x1', date: '2026-09-20', kg: 81 }, { id: 'x2', date: '2026-09-21', kg: 80.8 }); L.saveNow(); });
    await a(() => window.__ironlog.flush()); await wait(400); await b(() => window.__ironlog.sync()); await wait(600); await a(() => window.__ironlog.sync()); await wait(400);
    ok(await b(() => window.__ironlog.state.bodyweights.length === 2), 'two r21 phones in sync with two weigh-ins');
    await B.page.goto(NEW); await B.page.waitForFunction(() => window.__ironlog && window.__ironlog.cloudState().on); await wait(1200);
    await b(() => { const L = window.__ironlog; L.state.bodyweights = L.state.bodyweights.filter(x => x.id !== 'x1'); L.saveNow(); }); await b(() => window.__ironlog.flush()); await wait(600);
    ok(ids(doc('b-2026').bodyweights) === 'x2', 'B updates to r22 and deletes one: the cloud holds the other');
    await A.page.goto(NEW); await A.page.waitForFunction(() => window.__ironlog && window.__ironlog.cloudState().on); await wait(1500);
    await a(() => window.__ironlog.flush()); await wait(600); await b(() => window.__ironlog.sync()); await wait(600);
    const got = [await a(() => window.__ironlog.state.bodyweights.map(x => x.id).join()), await b(() => window.__ironlog.state.bodyweights.map(x => x.id).join()), ids(doc('b-2026').bodyweights)];
    ok(got.every(g => g === 'x2'), 'A updates later: the deleted weigh-in stays deleted everywhere', got);
    ok(!A.errors.length && !B.errors.length, 'no console errors (staggered update)', [...A.errors, ...B.errors]);
    await A.ctx.close(); await B.ctx.close();
  }
  // An r21 phone and an r22 phone together: once in step, syncing again writes nothing.
  {
    store.clear();
    const O2 = await open('baselines/r21.html', { browser, clock: '2026-09-26T10:00:00', setup: cloudSetup });
    const o = (f, x) => O2.page.evaluate(f, x);
    await wait(600);
    await o(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.bodyweights.push({ id: 'y1', date: '2026-09-20', kg: 81 }); L.saveNow(); }); await o(() => window.__ironlog.flush()); await wait(400);
    const N3 = await open('index.html', { browser, clock: '2026-09-26T10:00:00', setup: cloudSetup });
    const n = (f, x) => N3.page.evaluate(f, x);
    await wait(1200);
    for (let i = 0; i < 2; i++) { await n(() => window.__ironlog.flush()); await wait(400); await o(() => window.__ironlog.sync()); await wait(500); await n(() => window.__ironlog.sync()); await wait(500); }
    const at0 = JSON.parse(store.get('data/users/u1/core')).at;
    for (let i = 0; i < 2; i++) { await o(() => window.__ironlog.sync()); await wait(500); await n(() => window.__ironlog.sync()); await wait(500); }
    ok(JSON.parse(store.get('data/users/u1/core')).at === at0, 'r21 and r22 phones in step: further syncs do not rewrite core');
    ok(ids(doc('b-2026').bodyweights) === 'y1', 'and the weigh-in is safe in its yearly document');
    await O2.ctx.close(); await N3.ctx.close();
  }
  // A phone holding only tape measurements signs in to an account with a log: both kept (was lost before r22).
  {
    const M = await open('index.html', { browser, clock: '2026-09-26T10:00:00' });
    const raw = await M.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.measurements.push({ id: 'mm1', date: '2026-09-22', waist: 83 }); L.saveNow(); return localStorage.getItem('ironlog.v1'); });
    await M.ctx.close();
    const M2 = await open('index.html', { browser, clock: '2026-09-26T10:00:00', setup: cloudSetup, state: JSON.parse(raw) });
    await wait(1500);
    ok(await M2.page.evaluate(() => { const s = window.__ironlog.state; return s.measurements.some(x => x.id === 'mm1') && s.bodyweights.some(x => x.id === 'y1'); }), 'measurements-only phone signing in: its measurement and the account\'s weigh-in are both kept');
    await M2.ctx.close();
  }

  // ---- 20. Undo after a reload, and forgotten with a removed log.
  {
    const A = await open('index.html', { browser, touch: true, clock: '2026-09-27T18:00:00' });
    const ev = (f, a) => A.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.sessions.forEach(s => { s.demo = false; }); L.saveNow(); L.render(); });
    const n0 = await ev(() => window.__ironlog.state.sessions.length); const sid = await ev(() => window.__ironlog.state.sessions[5].id);
    await ev(id => window.__ironlog.ACT.histDel({ dataset: { id } }), sid); await wait(100);
    await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await wait(900);
    await A.page.reload(); await A.page.waitForFunction(() => window.__ironlog); await wait(800);
    ok(await ev(() => window.__ironlog.undoStack.length === 1), 'a delete can still be undone after the app is reopened');
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    ok(/1 available/.test(await ev(() => document.querySelector('#view [data-act="undo"]').textContent)) && /last 7 days/.test(await ev(() => document.querySelector('#view [data-act="undo"]').dataset.tip)), 'Settings offers it and says it keeps a week');
    await ev(() => document.querySelector('#view [data-act="undo"]').click()); await wait(300);
    ok(await ev(([id, n]) => window.__ironlog.state.sessions.some(s => s.id === id) && window.__ironlog.state.sessions.length === n, [sid, n0]), 'Undo after the reload brings the session back');
    await ev(() => window.__ironlog.ACT.histDel({ dataset: { id: window.__ironlog.state.sessions[3].id } })); await wait(100);
    await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await wait(900);
    await ev(() => window.__ironlog.undoForget()); await wait(300);
    await A.page.reload(); await A.page.waitForFunction(() => window.__ironlog); await wait(800);
    ok(await ev(() => window.__ironlog.undoStack.length === 0), 'a removed log takes its Undo history with it (shared phone)');
    // Older than a week: gone.
    await ev(() => new Promise(r => { const q = indexedDB.open('ironlog-undo', 1); q.onsuccess = () => { const tx = q.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put([{ pre: JSON.stringify(window.__ironlog.state), post: null, t: Date.now() - 8 * 864e5 }], 'stack'); tx.oncomplete = r; }; }));
    await A.page.reload(); await A.page.waitForFunction(() => window.__ironlog); await wait(800);
    ok(await ev(() => window.__ironlog.undoStack.length === 0), 'Undo history older than 7 days is dropped');
    ok(!A.errors.length, 'no console errors (Undo)', A.errors);
    await A.ctx.close();
  }

  // ---- First run in the source file: no account step, straight to Set up.
  {
    const F = await open('index.html', { browser, touch: true, w: 320, h: 700, clock: '2026-09-27T18:00:00' });
    const ev = (f, a) => F.page.evaluate(f, a);
    await wait(500);
    ok(await ev(() => { const p = document.getElementById('obPage'); return p && p.dataset.step === 'start' && !p.querySelector('[data-act="obAcctBack"]') && getComputedStyle(document.querySelector('.tabs')).display === 'none'; }), 'without accounts (source file): Set up directly, no account page, no tabs');
    ok(await ev(() => document.documentElement.scrollWidth <= 320 && [...document.querySelectorAll('#obPage button, #obPage label.ob-opt, #obPage input:not([type=file])')].every(e => e.getBoundingClientRect().height >= 44)), '320 px: no sideways scroll, every control 44 px tall');
    // Import a backup straight from Set up.
    const bk = await ev(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); s.settings.onboarded = true; s.sessions = [{ id: 'imp1', date: '2026-09-20', dayIdx: 0, dayId: null, dayName: 'Chest', routineId: '', notes: '', ex: [{ exId: 'bench', sets: [{ w: 100, r: 8, rir: 2, warm: false, drop: false }] }] }]; return JSON.stringify({ app: 'ironlog', state: s }); });
    // r23: the Set up option opens the import sheet; a backup file chosen there restores the log as before.
    await F.page.click('#obPage [data-act="impOpen"]'); await wait(150);
    await F.page.setInputFiles('#impFile', { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(bk) }); await wait(400);
    await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await wait(400);
    ok(await ev(() => !document.getElementById('obPage') && window.__ironlog.state.sessions.some(s => s.id === 'imp1') && window.__ironlog.ui.tab === 'today'), 'Import a backup from Set up: the log is in and Today opens');
    // Sample data first, then back to a clean start.
    await ev(() => { const L = window.__ironlog; L.state = L.normalize(null); L.saveNow(); L.invalidate(); L.render(); });
    await F.page.click('#obPage [data-act="demoLoad"]'); await wait(150);
    await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await wait(400);
    ok(await ev(() => !document.getElementById('obPage') && window.__ironlog.state.sessions.length > 0 && getComputedStyle(document.querySelector('.tabs')).display !== 'none'), 'Look around with sample data: the whole app opens with demo data');
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await F.page.click('#demoNote [data-act="demoStart"]'); await wait(300);
    ok(await ev(() => { const p = document.getElementById('obPage'); return p && p.dataset.step === 'start' && window.__ironlog.state.sessions.length === 0; }), 'Clear demo and set up: back on Set up with nothing left');
    ok(!F.errors.length, 'no console errors (first run)', F.errors);
    await F.ctx.close();
  }

  // ---- 27, 28. The PR moment and the all-time bests board.
  {
    const P = await open('index.html', { browser, touch: true, clock: '2026-09-27T18:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); /* r30: history here, not sample data */ for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of (L.state[k] || [])) delete x.demo; L.invalidate && L.invalidate(); L.ui.tab = 'today'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
    await P.page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(200);
    // At last time's load (r30: the demo can end with a load increase due, and a heavier set is a weight PR, not the rep PR checked here).
    const g = await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; const ex = L.IDX().byEx[b.exId]; const last = ex[ex.length - 1]; b.sets[0].w = last.pts[0].w; L.render(); return last.pts[0].r; });
    await P.page.fill('[data-f="r"][data-b="0"][data-s="0"]', String(g + 3)); await P.page.dispatchEvent('[data-f="r"][data-b="0"][data-s="0"]', 'change');
    await P.page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(250);
    const t = await ev(() => ({ text: document.getElementById('toast').innerText, pr: document.getElementById('toast').classList.contains('pr'), flash: !!document.querySelector('.sg.prflash[data-pr]') }));
    ok(t.pr && t.flash && new RegExp(`Rep PR: .*×${g + 3} \\(was ${g} reps\\)`).test(t.text), 'a PR set: gold toast saying what it beat, and a pulse on the row', t);
    // An ordinary set does not celebrate.
    await P.page.fill('[data-f="r"][data-b="0"][data-s="1"]', '1'); await P.page.dispatchEvent('[data-f="r"][data-b="0"][data-s="1"]', 'change');
    await P.page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await wait(250);
    ok(await ev(() => !document.querySelector('[data-act="sDone"][data-b="0"][data-s="1"]').closest('.sg').classList.contains('prflash')), 'an ordinary set: no pulse');
    await ev(() => { window.__ironlog.state.draft._rampAsked = true; window.__ironlog.state.draft._leftAsked = true; }); await P.page.click('[data-act="finish"]'); await wait(400);
    const rc = await ev(() => { const b = document.getElementById('recapPR'); return b ? b.innerText.replace(/\s+/g, ' ') : null; });
    ok(rc && /New PR/i.test(rc) && new RegExp(`×${g + 3}.*was ${g} reps`).test(rc), 'the recap opens with a gold PR block and what it beat', rc);
    await P.page.click('#modal [data-act="mClose"]'); await wait(150);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    const bd = await ev(() => { const L = window.__ironlog; const id = L.state.sessions[L.state.sessions.length - 1].ex[0].exId; const rows = [...document.querySelectorAll('#sub-bests .bx')]; const mine = rows.find(r => r.dataset.ex === id); const b = L.allTimeBests(id);
      return { n: rows.length, lifts: Object.keys(L.IDX().byEx).length, first: rows[0] && rows[0].dataset.ex === id, rec: mine && mine.innerText.replace(/\s+/g, ' '), front: b.front.map(f => [f.p.w, f.p.r]), comp: L.isCompound(L.EX(id)) }; });
    ok(bd.n === Math.min(6, bd.lifts) && bd.first, 'the board shows the six lifts with the newest records, the newest first', bd);
    await ev(() => document.querySelector('#sub-bests [data-act="bestsAll"]').click()); await wait(200);
    ok(await ev(n => document.querySelectorAll('#sub-bests .bx').length === n && !document.querySelector('#sub-bests [data-act="bestsAll"]'), bd.lifts), 'Show all lists every lift');
    ok(bd.front.every((f, i, a) => i === 0 || (f[0] < a[i - 1][0] && f[1] > a[i - 1][1])), 'rep records: heavier loads first, and each lighter load has more reps (no dominated rows)', bd.front);
    // r30: a best estimate (1RM) only for compound lifts; every best carries its own date.
    ok((bd.comp ? /best est [^·]*, [A-Z][a-z]{2} \d/.test(bd.rec) : !/best est/.test(bd.rec)) && /heaviest [^·]*, [A-Z][a-z]{2} \d/.test(bd.rec) && /first done/i.test(bd.rec), 'each lift shows its heaviest set with its own date, a best estimate on compound lifts only, and dated rep records', bd.rec);
    ok(!P.errors.length, 'no console errors (PRs)', P.errors);
    await P.ctx.close();
  }
  // ---- 11. Sheets and drags after a cloud refresh (fixed 2026-09-23, untested until now).
  // A pull replaces the whole state with new objects while a sheet is open; the
  // change confirmed afterwards must land in the new state and be saved.
  {
    const S = await open('index.html', { browser, touch: true, clock: '2026-09-27T18:00:00' });
    const ev = (f, a) => S.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.sessions.forEach(s => { s.demo = false; });
      L.state.routines.push(L.routineFromTemplate('ul4')); L.state.exercises.push({ id: 'c_test', name: 'Test Press', primary: 'chest', secondary: [], equip: 'cable', bw: false, rare: false, note: '', custom: true, archived: false });
      L.saveNow(); L.render();
      window.__refresh = () => { const L = window.__ironlog; L.state = L.normalize(JSON.parse(JSON.stringify(L.state))); L.invalidate(); L.render(); }; });
    const saved = () => ev(() => JSON.parse(localStorage.getItem('ironlog.v1')));
    const okBtn = async () => { await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await wait(400); };
    // Remove a day with exercises in it.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = 'routine'; L.ui.bRoutine = L.state.activeRoutineId; L.render(); });
    const d0 = await ev(() => { const R = window.__ironlog.state.routines.find(r => r.id === window.__ironlog.state.activeRoutineId); return { n: R.days.length, id: R.days[1].id }; });
    await ev(() => window.__ironlog.ACT.dDel({ dataset: { day: '1' } })); await wait(100);
    await ev(() => window.__refresh()); await okBtn();
    let sv = await saved(); let R = sv.routines.find(r => r.id === sv.activeRoutineId);
    ok(R.days.length === d0.n - 1 && !R.days.some(d => d.id === d0.id), 'Remove day, confirmed after a refresh: removed and saved', { was: d0.n, now: R.days.length });
    // Delete a routine.
    const rid = await ev(() => { const L = window.__ironlog; const r = L.state.routines.find(x => x.id !== L.state.activeRoutineId); L.ui.bRoutine = r.id; L.render(); return r.id; });
    await ev(() => window.__ironlog.ACT.rDel()); await wait(100);
    await ev(() => window.__refresh()); await okBtn();
    sv = await saved();
    ok(!sv.routines.some(r => r.id === rid) && sv.trash.some(t => t.kind === 'routine'), 'Delete routine, confirmed after a refresh: gone, in Recently deleted, saved');
    // Delete a custom exercise.
    await ev(() => window.__ironlog.ACT.exDel({ dataset: { ex: 'c_test' } })); await wait(100);
    await ev(() => window.__refresh()); await okBtn();
    sv = await saved();
    ok(!sv.exercises.some(e => e.id === 'c_test'), 'Delete exercise, confirmed after a refresh: removed and saved');
    // Delete a session.
    const sid = await ev(() => window.__ironlog.state.sessions[2].id);
    await ev(id => window.__ironlog.ACT.histDel({ dataset: { id } }), sid); await wait(100);
    await ev(() => window.__refresh()); await okBtn();
    sv = await saved();
    ok(!sv.sessions.some(x => x.id === sid) && sv.trash.some(t => t.kind === 'session' && t.id === sid), 'Delete session, confirmed after a refresh: removed, in Recently deleted, saved');
    // Edit an exercise in its sheet across a refresh.
    await ev(() => window.__ironlog.ACT.exEdit({ dataset: { ex: 'bench' } })); await wait(150);
    await ev(() => window.__refresh()); await wait(100);
    await S.page.fill('#modal [data-ebind="note"]', 'Pause on the chest'); await S.page.dispatchEvent('#modal [data-ebind="note"]', 'change');
    await ev(() => document.querySelector('#modal [data-act="exSave"]').click()); await wait(400);
    sv = await saved();
    ok((sv.exercises.find(e => e.id === 'bench') || {}).note === 'Pause on the chest', 'Exercise sheet saved after a refresh: the edit is kept and saved');
    // Drags finish against the current state.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = 'routine'; L.ui.bRoutine = L.state.activeRoutineId; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render(); });
    await wait(300);
    const before = await ev(() => window.__ironlog.state.routines.find(r => r.id === window.__ironlog.state.activeRoutineId).days.map(d => d.id));
    await ev(() => { window.__refresh(); const dl = document.getElementById('dayList'); window.Sortable.get(dl).options.onEnd({ oldIndex: 0, newIndex: 1, from: dl, to: dl, item: dl.children[0] }); }); await wait(400);
    sv = await saved(); R = sv.routines.find(r => r.id === sv.activeRoutineId);
    ok(R.days[0].id === before[1] && R.days[1].id === before[0], 'reordering days after a refresh: the new order is saved');
    const mv = await ev(() => { window.__refresh(); const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); const lists = [...document.querySelectorAll('ul.items')]; const from = lists[0], to = lists[1]; const exId = R.days[+from.dataset.day].items[0].exId;
      window.Sortable.get(from).options.onEnd({ oldIndex: 0, newIndex: 0, from, to, item: from.children[0] }); return { exId, to: +to.dataset.day }; }); await wait(400);
    sv = await saved(); R = sv.routines.find(r => r.id === sv.activeRoutineId);
    ok(R.days[mv.to].items[0].exId === mv.exId, 'moving an exercise to another day after a refresh: moved and saved', mv);
    ok(!S.errors.length, 'no console errors (refresh)', S.errors);
    await S.ctx.close();
  }
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack || e); process.exit(1); });
