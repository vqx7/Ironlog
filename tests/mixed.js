// Two builds on one account (PENDING 333): phones update at different times,
// so for a while after a merge one phone runs the build before (r55, live
// until the stack is merged) and another runs this one, both synced to one
// account through one stand-in cloud (the Claude db the sync takes when
// window.claude exists, as tests/storage-sync.js uses it). r56.1 writes a row id on
// every set (`rid`) and keeps the agreed copy of the workout in its own sync
// note; the build before keeps unknown fields (keepExtra) and never reads
// either. What must hold, each checked here:
//   (1) a log made on this build reaches the older phone whole, each set's
//       row id kept, and syncing it back and forth writes nothing more (the
//       two builds read every document the same, so they never ping-pong);
//   (2) an edit on either phone reaches the other, the row ids kept;
//   (3) one workout open on both phones, ticked on each: when this build
//       merges, every set is kept; the older build's merge is the later edit
//       whole, as it always was, and what that costs is pinned below so a
//       change to it is seen (the reason every phone updates before two are
//       used on one workout: OWNER.md, A24);
//   (4) a workout finished on the older phone while this one ticked one more:
//       the extra set joins the saved session once, last, no set counted
//       twice (the older build saves no row ids, so the join matches its rows
//       by what they hold);
//   (5) a workout finished on this phone while the older one ticked one more:
//       the workout stays closed on both, the session alike on both; whether
//       the set ticked there survives is the older build's own merge's to
//       decide (pinned), since this build only sees what that phone sends;
//   (6) a lift's unit and the scale's (2.66), and the style (2.77.1), reach
//       the older phone, are kept there through its own edits and come back,
//       with nothing more written; Standard picked again reaches it too.
//   (7) the update from 2.69: a phone or tab that takes it reads the log as
//       it is and writes nothing it did not change, so a delete, a correction
//       or an Undo made on 2.69 stands, in two tabs and on two phones.
//   (8) the update from 2.74, which refiles the Preacher Curl (2.75): the
//       refile is no edit, so an edit of that lift made with no signal on
//       another phone stands, and no clash is said.
//   (9) each record's own edit time (2.76) beside a phone still on 2.75, which
//       keeps none: a clash is decided by the documents' times, as on 2.75, and
//       the two builds write nothing more once synced.
//   (10) a record's time that stopped being known (a copy from 2.75 taken
//       in) is not given back by the app's other tab, so the latest edit,
//       made on 2.75, stands.
// `node tests/mixed.js <older page>` runs it against another build (default
// baselines/r55.html); this build is index.html, or IRONLOG_FILE.
const { open, tab, engine } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 800) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const OLD = process.argv[2] || 'baselines/r55.html';
const CLOCK = '2026-10-21T10:00:00';

// One stand-in cloud: documents by path, shared by every page opened with it, with a count of writes.
function cloudOf() {
  const store = new Map(); let writes = 0;
  const setup = uid => async (ctx, page) => {
    await page.exposeFunction('__dbGet', p => (store.has(p) ? store.get(p) : null));
    await page.exposeFunction('__dbSet', (p, v) => { if (store.get(p) !== v) writes++; store.set(p, v); return true; });
    await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
    await page.addInitScript(u => {
      window.__uid = u;
      window.claude = { use: async k => {
        if (k === 'user') return { id: async () => window.__uid };
        // A phone with no signal (window.__offline): every read and write of the account fails, as the network's would.
        const off = () => { if (window.__offline) throw { code: 'unavailable', message: 'offline' }; };
        if (k === 'db') return { doc: p => ({ get: async () => { off(); const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { off(); await window.__dbSet(p, JSON.stringify(o)); return true; } }), collection: p => ({ get: async () => { off(); const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
        return null;
      } };
    }, uid);
  };
  // The documents' content, by path, without the times a write stamps on them.
  const content = () => JSON.stringify([...store.entries()].filter(([k]) => !k.endsWith('/lock')).sort().map(([k, v]) => [k, JSON.parse(v).json]));
  return { store, setup, content, writes: () => writes };
}
// A phone: a page of the given build on the cloud, signed in as uid, past the first page.
async function phone(browser, cloud, file, uid, clock = CLOCK) {
  const P = await open(file, { browser, clock, realStarter: true, setup: cloud.setup(uid) });
  P.ev = (f, a) => P.page.evaluate(f, a);
  await P.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
  P.sync = async () => { await P.ev(() => window.__ironlog.sync()); await wait(150); };
  P.flush = async () => { await P.ev(() => window.__ironlog.flush()); await wait(150); };
  // Both ways, twice: what either phone still had to say has been said.
  P.settle = async () => { for (let i = 0; i < 2; i++) { await P.flush(); await P.sync(); } };
  P.rows = () => P.ev(() => { const d = window.__ironlog.state.draft; return d ? d.ex[0].sets.map(s => ({ w: s.w, r: s.r, done: !!s.done, rid: s.rid || null })) : null; });
  P.done = async () => { const r = await P.rows(); return r ? r.filter(s => s.done).map(s => `${s.w}x${s.r}`).join(',') : '-'; };
  P.session = id => P.ev(id => { const s = window.__ironlog.state.sessions.find(x => x.id === id); return s ? s.ex.flatMap(b => b.sets.map(x => ({ w: x.w, r: x.r, rid: x.rid || null }))) : null; }, id);
  P.draftId = () => P.ev(() => (window.__ironlog.state.draft || {}).id || null);
  // Ticks row i of the first exercise, as the logger saves a tick.
  P.tick = (i, w, r) => P.ev(([i, w, r]) => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[i]; s.w = w; s.r = r; s.done = true; L.saveNow(); }, [i, w, r]);
  // Starts the first day with its first exercise only, four rows, as tests/storage-sync.js's moved two-phone sections do.
  P.start = () => P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.slice(0, 1); d.ex[0].sets.length = 4; d._rampAsked = true; L.saveNow(); });
  // Finishes the workout in progress with any row left unticked answered, as tests/storage-sync.js's moved two-phone sections finish.
  P.finish = async () => { await P.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300); await P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); };
  P.toast = () => P.ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText : ''; });
  return P;
}
// A second page of a phone (tests/h.js tab) given the phone's own helpers, as the same phone.
phone.dress = async (T, P) => { const Q = Object.create(P); Q.page = T.page; Q.errors = T.errors; Q.ev = (f, a) => T.page.evaluate(f, a); Q.sync = async () => { await Q.ev(() => window.__ironlog.sync()); await wait(150); }; Q.flush = async () => { await Q.ev(() => window.__ironlog.flush()); await wait(150); }; Q.settle = async () => { for (let i = 0; i < 2; i++) { await Q.flush(); await Q.sync(); } }; return Q; };
const plain = rows => (rows || []).map(s => `${s.w}x${s.r}`).join(',');

(async () => {
  const browser = await engine.launch();
  const pages = [];
  const cloud = cloudOf();
  const N = await phone(browser, cloud, 'index.html', 'u1'); pages.push(N);
  await wait(900);

  // ---- (1) A log made on this build: a workout ticked and finished, so its sets carry row ids.
  await N.start(); await N.tick(0, 100, 8); await N.tick(1, 100, 8); await N.tick(2, 100, 7);
  const s1 = await N.draftId();
  await N.finish(); await N.settle();
  const n1 = await N.session(s1);
  ok(n1 && n1.length === 3 && n1.every(x => typeof x.rid === 'string'), 'set up: a workout finished on this build is saved with a row id on every set', n1);
  const O = await phone(browser, cloud, OLD, 'u1'); pages.push(O);
  await wait(1500); await O.settle();
  const o1 = await O.session(s1);
  ok(o1 && plain(o1) === plain(n1) && o1.map(x => x.rid).join() === n1.map(x => x.rid).join(), 'the older build holds the session whole, each set\'s row id kept', { o1, n1 });
  const before = cloud.content(), w0 = cloud.writes();
  await O.settle(); await N.settle(); await O.settle();
  ok(cloud.content() === before && cloud.writes() === w0, 'syncing back and forth writes nothing more: both builds read every document the same', { writes: cloud.writes() - w0 });

  // ---- (2) An edit on either phone reaches the other, the row ids kept.
  await O.ev(id => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.id === id); s.ex[0].sets[2].r = 6; L.invalidate(); L.saveNow(); }, s1);
  await O.settle(); await N.settle();
  const n2 = await N.session(s1);
  ok(n2 && plain(n2) === '100x8,100x8,100x6' && n2.map(x => x.rid).join() === n1.map(x => x.rid).join(), 'a set edited on the older build reaches this one, its row id kept', n2);
  await N.ev(id => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.id === id); s.ex[0].sets[0].w = 102.5; L.invalidate(); L.saveNow(); }, s1);
  await N.settle(); await O.settle();
  const o2 = await O.session(s1);
  ok(o2 && plain(o2) === '102.5x8,100x8,100x6' && o2.map(x => x.rid).join() === n1.map(x => x.rid).join(), 'and one edited on this build reaches the older one', o2);

  // ---- (3) One workout open on both phones.
  await N.start(); await N.settle(); await O.settle();
  const w3 = await N.draftId();
  ok((await O.draftId()) === w3 && (await O.rows()).every(s => typeof s.rid === 'string'), 'the older build holds this build\'s workout in progress, its rows\' ids kept', await O.rows());
  // The older phone ticks and sends first; this one, not having pulled, ticks another row and merges set by set.
  await O.tick(1, 80, 10); await O.flush();
  await N.tick(0, 80, 12); await N.flush();
  await N.settle(); await O.settle();
  ok((await N.done()) === '80x12,80x10' && (await O.done()) === '80x12,80x10', 'ticked on the older phone first, then on this one: this build merges set by set and both phones hold both sets', { N: await N.done(), O: await O.done() });
  // The older build adds a row of its own (no row id) and ticks it; this one ticks another row meanwhile.
  await O.ev(() => { const L = window.__ironlog; L.ACT.sAdd({ dataset: { b: '0' } }); const b = L.state.draft.ex[0]; const s = b.sets[b.sets.length - 1]; s.w = 80; s.r = 8; s.done = true; L.saveNow(); }); await O.flush();
  await N.tick(2, 80, 9); await N.flush();
  await N.settle(); await O.settle();
  const r3 = await N.rows();
  ok((await N.done()) === (await O.done()) && (await N.done()).split(',').sort().join() === ['80x12', '80x10', '80x9', '80x8'].sort().join() && r3.length === 5, 'a row the older build added, without an id, and a row ticked here meanwhile: every set kept once', { N: await N.done(), O: await O.done(), rows: r3 });
  // The other order: this phone sends first, then the older one, not having pulled, ticks and sends; its merge is the later edit whole.
  await N.tick(3, 80, 7); await N.flush();
  await O.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets[1].rir = 1; L.saveNow(); }); await O.flush();
  await N.settle(); await O.settle();
  const rir1 = await N.ev(() => window.__ironlog.state.draft.ex[0].sets[1].rir), kept7 = (await N.done()).includes('80x7');
  ok((await N.done()) === (await O.done()) && rir1 === (await O.ev(() => window.__ironlog.state.draft.ex[0].sets[1].rir)), 'the two phones end on one copy of the workout', { N: await N.done(), O: await O.done() });
  ok(kept7 !== (rir1 === 1), 'pinned, the older build\'s own merge: of the edit here and the one made there without pulling, it keeps one copy whole, so one of the two is gone (which one goes by the two phones\' clocks), as between two phones on the older build', { kept7, rir1 });

  // ---- (4) Finished on the older phone while this one ticked one more: the set joins the saved session once.
  await N.settle(); await O.settle();
  const had = (await O.rows()).filter(s => s.done).length;
  await O.finish(); await O.flush();
  await N.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets.push({ w: 90, r: 5, rir: null, warm: false, drop: false, done: true, rid: 'r-n-extra' }); L.saveNow(); });
  await N.flush(); await wait(1600); await N.flush(); await N.settle(); await O.settle();
  const j4 = await N.session(w3), o4 = await O.session(w3);
  ok(!(await N.draftId()) && j4 && j4.length === had + 1 && j4.filter(x => x.w === 90 && x.r === 5).length === 1, 'finished on the older phone while this one ticked one more: the set joins the session, every set once', { had, j4 });
  ok(o4 && plain(o4) === plain(j4), 'and the older phone holds the joined session', { o4, j4 });
  const at = j4 ? j4.findIndex(x => x.w === 90 && x.r === 5) : -1;
  ok(at === j4.length - 1, 'the set ticked last is the session\'s last set', { at, j4 });

  // ---- (5) Finished on this phone while the older one ticked one more: closed stays closed, the set kept.
  await N.start(); await N.tick(0, 70, 10); await N.settle(); await O.settle();
  const w5 = await N.draftId();
  ok((await O.draftId()) === w5, 'set up: the older phone holds the new workout');
  await N.finish(); await N.flush();
  await O.tick(1, 70, 9); await O.flush();
  for (let i = 0; i < 3; i++) { await N.settle(); await O.settle(); await wait(400); }
  const n5 = await N.session(w5), o5 = await O.session(w5);
  ok(!(await N.draftId()) && !(await O.draftId()), 'finished here while the older phone ticked one more: the workout is closed on both phones', { N: await N.draftId(), O: await O.draftId() });
  ok(n5 && o5 && plain(n5) === plain(o5) && /^70x10(,70x9)?$/.test(plain(n5)), 'both phones hold the session alike, every set once', { n5, o5 });
  // The set ticked on the older phone reaches this one only if that phone's own merge sends it (its edit read as the later); this build then joins it to the session, and otherwise the older phone drops it itself.
  console.log(`ok   pinned, the older build's own merge: the set ticked there is ${plain(n5).includes('70x9') ? 'kept (its edit read as the later, sent, and joined here)' : 'dropped on that phone (the closed workout read as the later), as between two phones on the older build'}`);
  const w1 = cloud.writes(); await N.settle(); await O.settle(); await N.settle();
  ok(cloud.writes() === w1, 'and the two phones then write nothing more', { writes: cloud.writes() - w1 });

  // ---- (6) A lift's unit and the scale's (2.66, 390's Release B), set on this phone: the older phone keeps them among the
  // fields it does not know (keepExtra), sends them back with its own edits, and the two then write nothing more.
  await N.ev(() => { const L = window.__ironlog; const e = L.state.exercises.find(x => x.id === 'bench'); e.unit = 'kg'; L.state.settings.bwUnit = 'kg'; L.saveNow(); });
  for (let i = 0; i < 2; i++) { await N.settle(); await O.settle(); }
  const ou = await O.ev(() => (window.__ironlog.state.exercises.find(x => x.id === 'bench') || {}).unit || null);
  const keys0 = await N.ev(() => Object.keys(window.__ironlog.state.settings).join());
  await O.ev(() => { const L = window.__ironlog; const e = L.state.exercises.find(x => x.id === 'bench'); e.note = 'older phone'; L.state.settings.theme = 'dark'; L.saveNow(); });
  for (let i = 0; i < 2; i++) { await O.settle(); await N.settle(); }
  const nu = await N.ev(() => { const e = window.__ironlog.state.exercises.find(x => x.id === 'bench'); return e ? [e.unit || null, e.note] : null; });
  ok(ou === 'kg' && nu && nu[0] === 'kg' && nu[1] === 'older phone', 'a lift\'s unit set on this build is kept by the older phone and comes back with that phone\'s edit to the lift', { ou, nu });
  const sn = await N.ev(() => ({ bw: window.__ironlog.state.settings.bwUnit || null, theme: window.__ironlog.state.settings.theme, keys: Object.keys(window.__ironlog.state.settings).join() }));
  ok(sn.bw === 'kg' && sn.theme === 'dark' && sn.keys === keys0, 'the scale\'s unit too, through the older phone\'s edit to the settings, its key where it stood', { sn, keys0 });
  const w6 = cloud.writes(); await N.settle(); await O.settle(); await N.settle();
  ok(cloud.writes() === w6, 'and the two phones then write nothing more', { writes: cloud.writes() - w6 });

  // ---- (6, continued) Sunset Coast's style (2.77.1), picked on this phone: the older phone keeps it among the settings it does not
  // know, sends it back with its own edit to the settings, its key where it stood; Standard picked here then reaches it, and
  // the two write nothing more.
  await N.ev(() => { const L = window.__ironlog; L.state.settings.style = 'sunset'; L.saveNow(); });
  for (let i = 0; i < 2; i++) { await N.settle(); await O.settle(); }
  const os = await O.ev(() => window.__ironlog.state.settings.style || null);
  const keys7 = await N.ev(() => Object.keys(window.__ironlog.state.settings).join());
  await O.ev(() => { const L = window.__ironlog; L.state.settings.theme = 'light'; L.saveNow(); });
  for (let i = 0; i < 2; i++) { await O.settle(); await N.settle(); }
  const ns = await N.ev(() => ({ style: window.__ironlog.state.settings.style || null, page: document.documentElement.dataset.style || null, theme: window.__ironlog.state.settings.theme, keys: Object.keys(window.__ironlog.state.settings).join() }));
  ok(os === 'sunset' && ns.style === 'sunset' && ns.theme === 'light' && ns.keys === keys7, 'the style picked here is kept by the older phone and comes back through its edit to the settings, its key where it stood', { os, ns, keys7 });
  await N.ev(() => { const L = window.__ironlog; delete L.state.settings.style; L.saveNow(); L.render(); });
  for (let i = 0; i < 2; i++) { await N.settle(); await O.settle(); }
  const back7 = { o: await O.ev(() => 'style' in window.__ironlog.state.settings), n: await N.ev(() => 'style' in window.__ironlog.state.settings) };
  ok(!back7.o && !back7.n, 'Standard picked here reaches the older phone: neither keeps the style', back7);
  const w7 = cloud.writes(); await N.settle(); await O.settle(); await N.settle();
  ok(cloud.writes() === w7, 'and the two phones then write nothing more', { writes: cloud.writes() - w7 });

  /* ---- (7) The update from 2.69 (baselines/r115.html). A phone or tab that takes the update reads the log as it is
     (a session names its machine when saved or picked, and a change names those it would move, normalize.ts
     keepMachines) and sends nothing it did not change, so what a device or tab still on 2.69 did stands: a delete
     (REV24-1, REV24-3), a correction with no clash said (REV24-2), and Undo of a step 2.69 kept takes back all it did
     (REV24-5). */
  {
    const R115 = 'baselines/r115.html', LB = 0.45359237;
    const C7 = cloudOf();
    const seedLog = P => P.ev(LB => {
      const L = window.__ironlog; const S = L.state;
      S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.lastExport = '2026-10-21';
      const mk = (id, date, exId, w, rs) => ({ id, date, dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId, rr: [8, 12], sets: rs.map(r => ({ w: w * LB, r, rir: 2, done: true })) }] });
      S.sessions = [mk('m1', '2026-10-03', 'machPress', 200, [11, 11, 10]), mk('f1', '2026-10-06', 'bench', 185, [8, 8, 7]), mk('m2', '2026-10-10', 'machPress', 200, [11, 11, 11]), mk('m3', '2026-10-17', 'machPress', 205, [10, 10, 9])];
      L.state = L.normalize(S); L.invalidate(); L.saveNow();
    }, LB);
    // The update: this page closed and the app opened again on this build, its storage and account kept.
    const update = async (P, uid, C = C7) => { await P.page.close(); const T = await tab(P, 'index.html', uid ? C.setup(uid) : undefined); const Q = await phone.dress(T, P); await wait(600); return Q; };
    const ids = P => P.ev(() => window.__ironlog.state.sessions.map(x => x.id).sort().join(' '));
    // (a) Phone B, still on 2.69, deletes the chest press session of Oct 10 and corrects Oct 17's; phone A then updates.
    const A0 = await phone(browser, C7, R115, 'u7'); pages.push(A0);
    await seedLog(A0); await A0.settle();
    const B = await phone(browser, C7, R115, 'u7'); pages.push(B);
    await wait(900); await B.settle();
    await B.ev(() => { const L = window.__ironlog; L.ACT.histDel({ dataset: { id: 'm2' } }); });
    await wait(200); await B.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mOk(); });
    await B.ev(() => { const L = window.__ironlog; const q = L.state.sessions.find(x => x.id === 'm3'); q.ex[0].sets.forEach(x => { x.r = 12; }); L.saveNow(); });
    await B.settle();
    const A = await update(A0, 'u7'); pages.push(A);
    await A.settle(); await B.settle(); await A.settle();
    const onA = await A.ev(() => { const L = window.__ironlog; const q = L.state.sessions.find(x => x.id === 'm3'); return { ids: L.state.sessions.map(x => x.id).sort().join(' '), m3: q ? q.ex[0].sets.map(x => x.r).join() : null, toast: (document.getElementById('toast') || {}).innerText || '' }; });
    ok(onA.ids === 'f1 m1 m3' && onA.m3 === '12,12,12' && !/edited on two devices/.test(onA.toast), '(7) a phone updated from 2.69: phone B\'s delete (Oct 10) and correction (Oct 17, 12 reps) made on 2.69 stand, with no clash said (REV24-1, REV24-2)', onA);
    ok((await ids(B)) === 'f1 m1 m3', '(7) and phone B, still on 2.69, keeps the session deleted', await ids(B));
    // (b) One phone, two tabs: tab 1 takes the update, tab 2 is still the 2.69 page and deletes Oct 17's session.
    const T0 = await phone(browser, cloudOf(), R115, null); pages.push(T0);
    await seedLog(T0);
    const T2 = await tab(T0, R115); T2.ev = (f, a) => T2.page.evaluate(f, a); pages.push(T2);
    const T1 = await update(T0, null); pages.push(T1);
    await wait(400);
    await T2.ev(() => { const L = window.__ironlog; L.ACT.histDel({ dataset: { id: 'm3' } }); });
    await wait(200); await T2.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mOk(); }); await wait(800);
    const tabs = [await ids(T1), await ids(T2), await T1.ev(() => window.__ironlog.state.trash.map(t => t.id).join())];
    ok(tabs[0] === 'f1 m1 m2' && tabs[1] === 'f1 m1 m2' && tabs[2] === 'm3', '(7) a tab still on 2.69 deletes a chest press session after the other tab updated: it stays deleted in both, in Recently deleted (REV24-3)', tabs);
    // (c) Five sessions imported on 2.69 (three chest press), the app then updated: Settings' Undo takes back all five.
    const U0 = await phone(browser, cloudOf(), R115, null); pages.push(U0);
    await U0.ev(LB => {
      const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb';
      L.state = L.normalize(S); L.saveNow();
      const mk = (id, date, exId, w) => ({ id, date, dayIdx: 0, dayName: 'Imported', notes: '', ex: [{ exId, rr: [8, 12], sets: [10, 10, 9].map(r => ({ w: w * LB, r, rir: 2, done: true })) }] });
      L.act(() => { L.state.sessions.push(mk('i1', '2026-10-03', 'machPress', 200), mk('i2', '2026-10-06', 'bench', 185), mk('i3', '2026-10-10', 'machPress', 200), mk('i4', '2026-10-13', 'bench', 185), mk('i5', '2026-10-17', 'machPress', 205)); }, { undo: true });
      L.toast('Imported 5 sessions', true);
    }, LB);
    await wait(300);
    const U = await update(U0, null); pages.push(U);
    const before = await ids(U);
    await U.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); });
    await wait(200); await U.ev(() => document.querySelectorAll('#view details').forEach(x => { x.open = true; })); await wait(100);
    await U.page.click('#view [data-act="undo"]'); await wait(400);
    ok(before === 'i1 i2 i3 i4 i5' && (await ids(U)) === '', '(7) Undo of an import made on 2.69, after the update, takes back every session it brought in, the machine lifts\' too (REV24-5)', { before, after: await ids(U) });
    // (e) One phone, two tabs, both on this build after the update from 2.69; Erase everything in tab 2: no session
    // comes back from tab 1, which never saved since the update (REV24-3).
    const W0 = await phone(browser, cloudOf(), R115, null); pages.push(W0);
    await seedLog(W0); await wait(300);
    const W1 = await update(W0, null); pages.push(W1);
    const W2 = await tab(W1, 'index.html'); W2.ev = (f, a) => W2.page.evaluate(f, a); pages.push(W2);
    await wait(500);
    const both = [await ids(W1), await ids(W2)];
    await W2.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); }); await wait(200);
    await W2.ev(() => document.querySelectorAll('#view details').forEach(x => { x.open = true; })); await wait(100);
    await W2.page.click('#view [data-act="resetAll"]'); await wait(300); await W2.page.click('#modal [data-act="mOk"]'); await wait(1500);
    const erased = [await ids(W1), await ids(W2), await W1.ev(() => JSON.parse(localStorage.getItem('ironlog.v1')).sessions.length)];
    ok(both[0] === 'f1 m1 m2 m3' && both[1] === both[0] && erased[0] === '' && erased[1] === '' && erased[2] === 0, '(7) two tabs on this build after the update: Erase everything in one leaves no session in either, nor on the phone (REV24-3)', { both, erased });
    // (d) Two phones on 2.69. Phone A, with no signal, corrects Oct 17's chest press (12 reps); an hour later by its
    // clock phone B takes the update and syncs; A, still on 2.69, gets its signal back. B changed nothing, so it sent
    // nothing: the correction stands on both phones and in the account.
    const C8 = cloudOf();
    const D0 = await phone(browser, C8, R115, 'u8'); pages.push(D0);
    await seedLog(D0); await D0.settle();
    const E0 = await phone(browser, C8, R115, 'u8', '2026-10-21T11:00:00'); pages.push(E0);
    await wait(900); await E0.settle();
    await D0.ev(() => { window.__offline = true; const L = window.__ironlog; const q = L.state.sessions.find(x => x.id === 'm3'); q.ex[0].sets.forEach(x => { x.r = 12; }); L.saveNow(); });
    await wait(1500);
    const E = await update(E0, 'u8', C8); pages.push(E);
    await E.settle();
    await D0.ev(() => { window.__offline = false; }); await D0.settle(); await E.settle(); await D0.settle();
    const m3 = async P => P.ev(() => { const q = window.__ironlog.state.sessions.find(x => x.id === 'm3'); return q ? q.ex[0].sets.map(x => x.r).join() : null; });
    const kept = { A: await m3(D0), B: await m3(E), account: JSON.parse(C8.content()).filter(([k]) => /s-2026-10-2$/.test(k)).map(([, j]) => ((JSON.parse(j).sessions || []).find(x => x.id === 'm3') || { ex: [{ sets: [] }] }).ex[0].sets.map(x => x.r).join()).join() };
    ok(kept.A === '12,12,12' && kept.B === '12,12,12' && kept.account === '12,12,12', '(7) a correction made with no signal on a phone still on 2.69 stands after another phone takes the update: on both phones and in the account (REV24-2)', kept);
    // (g) Phone B, still on 2.69 and with no signal, deletes Oct 10's chest press; phone A takes the update and syncs;
    // B gets its signal back: A sent nothing it did not change, so the delete stands on both (NEW-175).
    const CG = cloudOf();
    const GA0 = await phone(browser, CG, R115, 'u9g'); pages.push(GA0);
    await seedLog(GA0); await GA0.settle();
    const GB = await phone(browser, CG, R115, 'u9g'); pages.push(GB);
    await wait(900); await GB.settle();
    await GB.ev(() => { window.__offline = true; const L = window.__ironlog; L.ACT.histDel({ dataset: { id: 'm2' } }); });
    await wait(200); await GB.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mOk(); }); await wait(600);
    const GA = await update(GA0, 'u9g', CG); pages.push(GA);
    await GA.settle();
    await GB.ev(() => { window.__offline = false; }); await GB.settle(); await GA.settle();
    const gone = { A: await ids(GA), B: await ids(GB) };
    ok(gone.A === 'f1 m1 m3' && gone.B === 'f1 m1 m3', '(7) a delete made with no signal on a phone still on 2.69 stands on both phones after the other takes the update (NEW-175)', gone);
    /* (f) A machine picked for a session with no signal is kept when the other phone took the update and made a later
       edit in the same half month (REV25-1): picked on 2.69 before the update, and picked on this build after an update
       taken with no signal. The chest press began a second machine on Oct 17; Oct 24 reads on it by its date, and the
       pick puts it back on the first. */
    for (const how of ['picked on 2.69, then the update', 'the update with no signal, then picked']) {
      const CF = cloudOf(), uid = how.startsWith('picked') ? 'u9a' : 'u9b';
      const F0 = await phone(browser, CF, R115, uid); pages.push(F0);
      await F0.ev(LB => {
        const L = window.__ironlog; const S = L.state;
        S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.lastExport = '2026-10-21';
        const mk = (id, date, w, x) => ({ id, date, dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'machPress', rr: [8, 12], sets: [11, 11, 10].map(r => ({ w: w * LB, r, rir: 2, done: true })), ...(x || {}) }] });
        S.sessions = [mk('g1', '2026-10-03', 200), mk('g2', '2026-10-10', 200), mk('g3', '2026-10-17', 120, { nw: true }), mk('g4', '2026-10-24', 125)];
        L.state = L.normalize(S); L.invalidate(); L.saveNow();
      }, LB);
      await F0.settle();
      const G0 = await phone(browser, CF, R115, uid, '2026-10-21T11:00:00'); pages.push(G0);
      await wait(900); await G0.settle();
      const pick = P => P.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'g4').ex[0].mc = '0'; }); });
      let F = F0;
      if (how.startsWith('picked')) {
        await F0.ev(() => { window.__offline = true; const L = window.__ironlog; L.state.sessions.find(s => s.id === 'g4').ex[0].mc = '0'; L.saveNow(); });
        await wait(600);
      } else {
        await F0.ctx.addInitScript(() => { window.__offline = true; });
        F = await update(F0, uid, CF); pages.push(F);
        await pick(F); await wait(600);
      }
      const G = await update(G0, uid, CF); pages.push(G);
      await G.settle();
      await G.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'g3').ex[0].sets.forEach(x => { x.r = 12; }); }); });
      await G.settle();
      if (how.startsWith('picked')) { F = await update(F0, uid, CF); pages.push(F); }
      else await F.ev(() => { window.__offline = false; });
      await F.settle(); await G.settle(); await F.settle();
      const mcOf = P => P.ev(() => { const q = window.__ironlog.state.sessions.find(s => s.id === 'g4'); return q ? q.ex[0].mc || '-' : 'gone'; });
      const inAcct = (JSON.parse(CF.content()).find(([k]) => k === `data/users/${uid}/s-2026-10-2`) || [null, '{"sessions":[]}'])[1];
      const g4 = { F: await mcOf(F), G: await mcOf(G), account: ((JSON.parse(inAcct).sessions || []).find(s => s.id === 'g4') || { ex: [{}] }).ex[0].mc || '-' };
      ok(g4.F === '0' && g4.G === '0' && g4.account === '0', `(7) a machine picked for a session with no signal (${how}) is kept on both phones and in the account, the other phone having taken the update and made a later edit in the same half month (REV25-1)`, g4);
    }
  }

  /* ---- (8) The update from 2.74 (baselines/r120.html), which refiles the Preacher Curl with the barbells (2.75). The
     refile is read on each phone and never sent (merge.ts savedEquip), so it is no edit of the lift against the copy
     the phones agreed. Two phones on 2.74; phone B, with no signal, writes a note on the Preacher Curl; phone A, later,
     turns "Timer sound" off and syncs (core, the document both records are in, is then A's later). Both take the
     update: B's note stands on both phones and in the account, A's timer too, and no clash is said (REV27-1). */
  {
    const R120 = 'baselines/r120.html', CP = cloudOf(), uid = 'u10';
    // What the toast says on the updated page, each message once.
    const said = () => {
      window.__said = [];
      const hook = () => {
        const el = document.getElementById('toast');
        if (!el) { setTimeout(hook, 20); return; }
        new MutationObserver(() => { const t = el.hidden ? '' : el.innerText.replace(/\s+/g, ' ').trim(); if (t && window.__said[window.__said.length - 1] !== t) window.__said.push(t); }).observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
      };
      hook();
    };
    const update = async P => { await P.ctx.addInitScript(said); await P.page.close(); const T = await tab(P, 'index.html', CP.setup(uid)); const Q = await phone.dress(T, P); await wait(600); return Q; };
    const lift = P => P.ev(() => { const e = window.__ironlog.state.exercises.find(x => x.id === 'preacher'); return e ? `${e.equip}: ${e.note}` : '-'; });
    const A0 = await phone(browser, CP, R120, uid); pages.push(A0);
    await A0.ev(() => { const L = window.__ironlog; L.state.settings.lastExport = '2026-10-21'; L.saveNow(); });
    await A0.settle();
    const B0 = await phone(browser, CP, R120, uid); pages.push(B0);
    await wait(900); await B0.settle(); await A0.settle();
    const was = [await lift(A0), await lift(B0)];
    await B0.ev(() => { window.__offline = true; const L = window.__ironlog; L.act(() => { L.state.exercises.find(x => x.id === 'preacher').note = 'Elbows on the pad'; }); });
    await wait(1200);
    await A0.ev(() => { const L = window.__ironlog; L.act(() => { L.state.settings.timerSound = false; }); });
    await wait(1200); await A0.settle();
    const A = await update(A0); pages.push(A);
    await A.settle();
    const B = await update(B0); pages.push(B);
    await B.settle(); await A.settle(); await B.settle();
    const core = JSON.parse((JSON.parse(CP.content()).find(([k]) => k === `data/users/${uid}/core`) || [null, '{}'])[1]);
    const inAcct = ((core.exercises || []).find(x => x.id === 'preacher') || {});
    const got = { was, A: await lift(A), B: await lift(B), account: `${inAcct.equip}: ${inAcct.note}`, timer: [await A.ev(() => window.__ironlog.state.settings.timerSound), await B.ev(() => window.__ironlog.state.settings.timerSound)].join(), said: [...(await A.ev(() => window.__said || [])), ...(await B.ev(() => window.__said || []))] };
    ok(got.was.join() === 'machine: ,machine: ' && got.A === 'barbell: Elbows on the pad' && got.B === 'barbell: Elbows on the pad' && got.account === 'machine: Elbows on the pad' && got.timer === 'false,false',
      '(8) a note written with no signal on the Preacher Curl on a phone on 2.74 stands after both phones take the update that refiles it, the other phone\'s later "Timer sound" too: read as a barbell lift on both, saved in the account as 2.74 saves it (REV27-1)', got);
    ok(!got.said.some(t => /edited on two devices/i.test(t)), '(8) and no clash is said: the refile is no edit', got.said);
    const w0 = CP.writes(), c0 = CP.content();
    await A.settle(); await B.settle(); await A.settle();
    ok(CP.writes() === w0 && CP.content() === c0, '(8) syncing back and forth after the update writes nothing more', { writes: CP.writes() - w0 });
  }

  /* (9) Each record's own edit time (2.76) beside a phone still on 2.75, which keeps none: a record both phones edit is
     decided by the documents' times, as on 2.75, so the later edit stands whichever build made it; 2.75 writes the
     documents without the times 2.76 sends beside them, so no time outlives an edit it does not describe; and once
     synced the two builds write nothing more. */
  {
    const R121 = 'baselines/r121.html', LB = 0.45359237;
    const C9 = cloudOf();
    const seed9 = P => P.ev(LB => {
      const L = window.__ironlog; const S = L.state;
      S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.lastExport = '2026-10-21';
      const mk = (id, date) => ({ id, date, dayIdx: 0, dayName: 'Day 1', notes: 'start', ex: [{ exId: 'bench', rr: [8, 12], sets: [10, 10, 9].map(r => ({ w: 185 * LB, r, rir: 2, done: true })) }] });
      S.sessions = [mk('o3', '2026-10-03'), mk('o10', '2026-10-10')];
      L.state = L.normalize(S); L.invalidate(); L.saveNow();
    }, LB);
    const note = (P, id, t) => P.ev(([id, t]) => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === id).notes = t; }); }, [id, t]);
    const notesOf = P => P.ev(() => Object.fromEntries(window.__ironlog.state.sessions.map(s => [s.id, s.notes])));
    const nowOf = async P => new Date(await P.ev(() => Date.now())).toISOString();
    const N9 = await phone(browser, C9, 'index.html', 'u9'); pages.push(N9);
    await seed9(N9); await N9.settle();
    const O9 = await phone(browser, C9, R121, 'u9', await nowOf(N9)); pages.push(O9);
    await wait(900); await O9.settle();
    // Each page's clock starts when it opens: each edit below is later than the one before on either phone's clock.
    const gap = Math.abs(Date.parse(await nowOf(N9)) - Date.parse(await nowOf(O9))) + 400;
    // This build edits Oct 3 with no signal; the phone on 2.75 edits it later and syncs; this build's signal comes back.
    await N9.ev(() => { window.__offline = true; });
    await note(N9, 'o3', 'Oct 3, first, on 2.76'); await wait(gap);
    await note(O9, 'o3', 'Oct 3, later, on 2.75'); await O9.settle(); await wait(gap);
    await N9.ev(() => { window.__offline = false; }); await N9.settle(); await O9.settle(); await N9.settle();
    const a = { N: (await notesOf(N9)).o3, O: (await notesOf(O9)).o3 };
    ok(a.N === 'Oct 3, later, on 2.75' && a.O === a.N, "(9) a record edited on this build, then later on a phone still on 2.75: the later edit stands on both, by the documents' times", a);
    // The reverse: 2.75 edits Oct 10 with no signal, this build later, and syncs; then 2.75's signal comes back.
    await O9.ev(() => { window.__offline = true; });
    await note(O9, 'o10', 'Oct 10, first, on 2.75'); await wait(gap);
    await note(N9, 'o10', 'Oct 10, later, on 2.76'); await N9.settle(); await wait(gap);
    await O9.ev(() => { window.__offline = false; }); await O9.settle(); await N9.settle(); await O9.settle();
    const b = { N: (await notesOf(N9)).o10, O: (await notesOf(O9)).o10 };
    ok(b.N === 'Oct 10, later, on 2.76' && b.O === b.N, '(9) the reverse: the later edit, made on this build, stands on both', b);
    const n0 = C9.writes(); await N9.settle(); await O9.settle(); await N9.settle(); await O9.settle();
    ok(C9.writes() === n0, '(9) synced, the two builds write nothing more', { before: n0, after: C9.writes() });
  }

  /* ---- (10) A record's time that stopped being known stays so (2.76, REV27-4). A laptop on this build with the app
     open in two tabs, phone B on this build, phone C still on 2.75 (`baselines/r121.html`, which keeps no record
     times). The laptop writes Nov 3's note; B, with no signal, writes it later; C, later still, writes it and syncs;
     the laptop takes C's copy in (with no time), then writes Nov 10's note in the same half-month and syncs; B's
     signal comes back. C's note, the latest edit, stands everywhere. On the build before this fix the laptop's other
     tab gave back the time of the laptop's own first edit, which went out beside C's copy, so B's edit, later than
     that time, was kept. */
  {
    const R121 = 'baselines/r121.html', C10 = cloudOf(), uid = 'u10t';
    const note = (P, id, t) => P.ev(([id, t]) => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === id).notes = t; }); }, [id, t]);
    const n3Of = P => P.ev(() => (window.__ironlog.state.sessions.find(s => s.id === 'n3') || {}).notes);
    const nowOf = async P => new Date(await P.ev(() => Date.now())).toISOString();
    const X1 = await phone(browser, C10, 'index.html', uid); pages.push(X1);
    await X1.ev(() => {
      const L = window.__ironlog; const S = L.state; S.settings.lastExport = '2026-10-21';
      const mk = (id, date) => ({ id, date, dayIdx: 0, dayName: 'Day 1', notes: 'start', ex: [{ exId: 'bench', rr: [8, 12], sets: [{ w: 80, r: 8, rir: 2, done: true }] }] });
      S.sessions = [mk('n3', '2026-11-03'), mk('n10', '2026-11-10')]; L.state = L.normalize(S); L.invalidate(); L.saveNow();
    });
    await X1.settle();
    const X2 = await phone.dress(await tab(X1, 'index.html', C10.setup(uid)), X1); pages.push(X2);
    await wait(900);
    const B = await phone(browser, C10, 'index.html', uid, await nowOf(X1)); pages.push(B);
    const C = await phone(browser, C10, R121, uid, await nowOf(X1)); pages.push(C);
    await wait(900); await B.settle(); await C.settle(); await X1.settle();
    // Each page's clock starts when it opens: each edit below is well after the one before on every clock.
    const skewOf = async P => Math.abs(Date.parse(await nowOf(X1)) - Date.parse(await nowOf(P)));
    const gap = Math.max(await skewOf(B), await skewOf(C)) + 1200;
    await note(X1, 'n3', 'Nov 3, on the laptop'); await wait(gap); await X1.settle(); await B.settle(); await C.settle();
    await B.ev(() => { window.__offline = true; });
    await note(B, 'n3', 'Nov 3, on B, no signal'); await wait(gap);
    await note(C, 'n3', 'Nov 3, on C, the latest'); await wait(gap); await C.settle();
    // The laptop takes C's copy in; its other tab hears.
    await X1.sync(); await wait(1500);
    await note(X1, 'n10', 'Nov 10, on the laptop'); await wait(gap); await X1.settle(); await wait(600);
    await B.ev(() => { window.__offline = false; }); await B.settle(); await X1.settle(); await C.settle(); await B.settle(); await X1.settle(); await wait(600);
    const doc = JSON.parse((JSON.parse(C10.content()).find(([k]) => k === `data/users/${uid}/s-2026-11-1`) || [null, '{}'])[1]);
    const got = { X1: await n3Of(X1), X2: await n3Of(X2), B: await n3Of(B), C: await n3Of(C), account: ((doc.sessions || []).find(s => s.id === 'n3') || {}).notes };
    ok(Object.values(got).every(v => v === 'Nov 3, on C, the latest'), '(10) a laptop with two tabs takes in a copy from a phone on 2.75 with no time, then edits the half-month: the latest edit of Nov 3, made on 2.75, stands on every tab and phone and in the account over an earlier one made with no signal (REV27-4)', got);
  }

  const errors = pages.flatMap(P => P.errors);
  ok(!errors.length, 'no page errors', errors.slice(0, 4));
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
