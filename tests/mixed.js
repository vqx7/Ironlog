// Two builds on one account (PENDING 333): phones update at different times,
// so for a while after a merge one phone runs the build before (r55, live
// until the stack is merged) and another runs this one, both synced to one
// account through one stand-in cloud (the Claude db the sync takes when
// window.claude exists, as tests/r56-1.js uses it). r56.1 writes a row id on
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
//       decide (pinned), since this build only sees what that phone sends.
// `node tests/mixed.js <older page>` runs it against another build (default
// baselines/r55.html); this build is index.html, or IRONLOG_FILE.
const { open, engine } = require('./h');
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
        if (k === 'db') return { doc: p => ({ get: async () => { const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); return true; } }), collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
        return null;
      } };
    }, uid);
  };
  // The documents' content, by path, without the times a write stamps on them.
  const content = () => JSON.stringify([...store.entries()].filter(([k]) => !k.endsWith('/lock')).sort().map(([k, v]) => [k, JSON.parse(v).json]));
  return { store, setup, content, writes: () => writes };
}
// A phone: a page of the given build on the cloud, signed in as uid, past the first page.
async function phone(browser, cloud, file, uid) {
  const P = await open(file, { browser, clock: CLOCK, realStarter: true, setup: cloud.setup(uid) });
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
  // Starts the first day with its first exercise only, four rows, as tests/r56-1.js does.
  P.start = () => P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.slice(0, 1); d.ex[0].sets.length = 4; d._rampAsked = true; L.saveNow(); });
  // Finishes the workout in progress with any row left unticked answered, as tests/r56-1.js finishes.
  P.finish = async () => { await P.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300); await P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); };
  P.toast = () => P.ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText : ''; });
  return P;
}
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

  const errors = pages.flatMap(P => P.errors);
  ok(!errors.length, 'no page errors', errors.slice(0, 4));
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
