// r56-1c: the stack's review (PENDING 333), each finding as its reproduction
// showed it, two phones (or one, reopened) through one mock cloud, as
// tests/r56-1.js builds them. Each case fails on the stack as reviewed
// (61f6b03; `node tests/r56-1c.js <that page>`); F2 and F3 are in
// tests/r56-1b.js, through the real account service, and F7 in tests/r55-1.js.
//   F1  a log taken back whose save the phone refuses is put back as it was,
//       with its notes, and the sign-in undone: the next start never syncs
//       one account's log under the other's notes;
//   F4  a log kept aside is taken back with its own notes on every path (not
//       asked, Add it), so what the account changed or deleted meanwhile
//       stands;
//   F5  a join with no agreed copy (a note from the build before) matches the
//       two phones' rows to each other, so no set is saved twice;
//   F6  cardio typed on the phone whose copy lost is kept, with or without a
//       ticked set;
//   F9  the same lift twice, the first removed on one phone while the other
//       ticks the second: one block, not two;
//   F10 a warm-up added on one phone while the other ticks stays at the top.
// Then the review of that fix (d04ec3b), each case failing on d04ec3b:
//   G2  a join whose agreed copy has nothing ticked keeps both phones' sets;
//   G4  a phone whose log stops saving keeps its sync notes in step with the
//       log it holds, so reopening never deletes a synced workout, and the
//       menu says the phone is not saving (PENDING 336);
//   G5  a log kept aside comes back as it was when the phone holds nothing of
//       the lifter's: no demo data or second starter routine in the account;
//   G6  Add it with a workout open here and one in the log kept aside: this
//       phone's stays open and the other's ticked sets are saved, said so;
//   G7  cardio edited, or deleted, on either phone merges against the copy
//       both agreed on, and a join of cardio alone says so;
//   G9  the next sets' adjusted load stays on its rows when a merge adds a
//       row above them;
//   G10 a join keeps the order of the session saved on the other phone, a
//       warm-up added there first included.
const { open, engine } = require('./h');
const path = require('path');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || 'index.html';
// The build before r56.1, for the phones a note from an older build comes from (F5).
const OLD = 'baselines/r56.html';
const CLOCK = '2026-10-21T10:00:00';

// One stand-in cloud: documents by path, shared by every page opened with it; a page set offline refuses every call.
function cloudOf() {
  const store = new Map();
  const setup = uid => async (ctx, page) => {
    await page.exposeFunction('__dbGet', p => (store.has(p) ? store.get(p) : null));
    await page.exposeFunction('__dbSet', (p, v) => { store.set(p, v); return true; });
    await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
    await page.addInitScript(u => {
      if (window.__uid === undefined) window.__uid = u;
      const off = () => { if (window.__offline) throw { code: 'unavailable', message: 'offline' }; };
      window.claude = { use: async k => {
        if (k === 'user') return { id: async () => window.__uid };
        if (k === 'db') return { doc: p => ({ get: async () => { off(); const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { off(); await window.__dbSet(p, JSON.stringify(o)); return true; } }), collection: p => ({ get: async () => { off(); const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
        return null;
      } };
    }, uid);
  };
  const docs = (uid, pre) => [...store.entries()].filter(([k]) => k.startsWith(`data/users/${uid}/${pre}`)).map(([, v]) => JSON.parse(JSON.parse(v).json));
  return { store, setup, sessionsIn: uid => docs(uid, 's-').flatMap(d => d.sessions || []), cardioIn: uid => docs(uid, 's-').flatMap(d => d.cardio || []), bwIn: uid => docs(uid, 'b-').flatMap(d => d.bodyweights || []) };
}
// A phone: a page of the given build on the cloud, signed in as uid, past the first page.
async function phone(browser, cloud, uid, file = FILE) {
  const P = await open(file, { browser, clock: CLOCK, realStarter: true, setup: cloud.setup(uid) });
  P.ev = (f, a) => P.page.evaluate(f, a);
  await P.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
  P.sync = async () => { await P.ev(() => window.__ironlog.sync()); await wait(150); };
  P.flush = async () => { await P.ev(() => window.__ironlog.flush()); await wait(150); };
  P.rows = (bi = 0) => P.ev(bi => { const d = window.__ironlog.state.draft; return d ? d.ex[bi].sets.map(s => (s.warm ? 'W:' : '') + (s.done ? `${s.w}x${s.r}` : '-')).join(' ') : null; }, bi);
  P.blocks = () => P.ev(() => { const d = window.__ironlog.state.draft; return d ? d.ex.map(b => `${b.exId}[${b.sets.map(s => (s.done ? `${s.w}x${s.r}` : '-')).join(' ')}]`).join(' ') : null; });
  P.saved = () => P.ev(() => window.__ironlog.state.sessions.map(s => s.ex.map(b => b.sets.map(x => `${x.warm ? 'W' : ''}${x.w}x${x.r}`).join(' ')).join(' | ')));
  P.tick = (i, w, r, bi = 0) => P.ev(([i, w, r, bi]) => { const L = window.__ironlog; const s = L.state.draft.ex[bi].sets[i]; s.w = w; s.r = r; s.done = true; L.saveNow(); }, [i, w, r, bi]);
  // Starts the first day with its first exercise only, n rows, as tests/r56-1.js does.
  P.start = n => P.ev(n => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.slice(0, 1); d.ex[0].sets.length = n; d._rampAsked = true; L.saveNow(); }, n);
  P.finish = async () => { await P.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.state.draft._rampAsked = true; L.ACT.finishNow(); }); await wait(300); await P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); };
  P.toast = () => P.ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText : ''; });
  // Every toast shown since the page opened (or reopened), in order, once each.
  P.watch = () => P.ev(() => { window.__toasts = []; const el = document.getElementById('toast'); if (el) new MutationObserver(() => { if (!el.hidden && el.innerText) window.__toasts.push(el.innerText.replace(/\s+/g, ' ')); }).observe(el, { childList: true, subtree: true, characterData: true, attributes: true }); });
  P.toasts = () => P.ev(() => [...new Set(window.__toasts || [])]);
  await P.watch();
  P.modal = () => P.ev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, title: m.title || '' } : null; });
  P.ids = () => P.ev(() => window.__ironlog.state.sessions.map(s => s.id).sort());
  // Signs out keeping the log (the notes kept), then signs in to uid, answering the question if it is asked.
  P.switchTo = async (uid, answer) => {
    await P.ev(() => window.__ironlog.cloudStop());
    await P.ev(uid => { window.__uid = uid; }, uid);
    P.ev(() => window.__ironlog.cloudInit()).catch(() => {}); await wait(900);
    const m = await P.modal();
    if (m && m.kind === 'confirm' && answer) { await P.page.click(`#modal [data-act="${answer}"]`); await wait(1500); }
    return m && m.kind === 'confirm' ? m.title : null;
  };
  P.reopen = async () => { await P.page.goto(P.page.url()); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await P.watch(); await wait(2000); };
  P.draftOf = () => P.ev(() => { const d = window.__ironlog.state.draft; return d ? { id: d.id, rows: d.ex[0].sets.map(s => (s.done ? `${s.w}x${s.r}` : s.w != null ? `typed ${s.w}x${s.r}` : '-')).join(' ') } : null; });
  P.cardio = () => P.ev(() => { const L = window.__ironlog; return { draft: L.state.draft ? (L.state.draft.cardio || []).map(c => `${c.kind} ${c.min}`).join(',') : null, log: L.state.cardio.map(c => `${c.kind} ${c.min}`).join(',') }; });
  return P;
}
const session = (id, date, sets) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', notes: '', free: true, ex: [{ exId: 'bench', note: '', rr: null, sets: sets.map(([w, r]) => ({ w, r, rir: 1, warm: false, drop: false })) }] });
const addSession = (P, s) => P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); }, s);
// From the next save on, the phone's storage refuses the log's key, as a full one does.
const refuseSave = P => P.ev(() => { const KEY = window.__ironlog.KEY; const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === KEY) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return o.call(this, k, v); }; });

(async () => {
  const browser = await engine.launch();
  const pages = [];

  // ---- F1: "Use this account's log" for A, with A's log kept aside, and the save of A's log refused.
  {
    const cloud = cloudOf();
    const P = await phone(browser, cloud, 'acctA'); pages.push(P);
    await wait(900);
    await addSession(P, session('s-a1', '2026-10-19', [[100, 8]])); await P.flush();
    await P.switchTo('acctB', 'mAlt');
    await addSession(P, session('s-b1', '2026-10-20', [[60, 10]])); await P.flush();
    ok((await P.ids()).join() === 's-b1' && (await P.ev(() => window.__ironlog.asideList())).some(a => a.acct === 'acctA'), 'set up: the phone is on B with s-b1, A\'s log kept aside');
    await P.ev(() => window.__ironlog.cloudStop()); await P.ev(() => { window.__uid = 'acctA'; });
    P.ev(() => window.__ironlog.cloudInit()).catch(() => {}); await wait(900);
    await refuseSave(P);
    await P.page.click('#modal [data-act="mAlt"]'); await wait(1500);
    const st = await P.ev(() => { const K = window.__ironlog.KEY; const n = JSON.parse(localStorage.getItem(K + '.sync')); return { inUse: window.__ironlog.state.sessions.map(x => x.id), saved: JSON.parse(localStorage.getItem(K)).sessions.map(x => x.id), notes: n.acct, on: window.__ironlog.cloudState().on, aside: window.__ironlog.asideList().map(a => a.acct) }; });
    ok(st.inUse.join() === 's-b1' && st.saved.join() === 's-b1' && st.notes === 'acctB' && !st.on, 'the save of A\'s log refused: the log and its notes are put back as they were (B\'s, naming B), and the sync does not start', st);
    ok(st.aside.join() === 'acctA', 'A\'s log is still kept aside, and nothing of B\'s was kept aside in its place', st.aside);
    ok(/could not save this account's log/.test(await P.toast()), 'and the phone says so', await P.toast());
    await P.reopen(); await P.flush();
    ok(cloud.sessionsIn('acctA').map(s => s.id).join() === 's-a1' && cloud.sessionsIn('acctB').map(s => s.id).join() === 's-b1', 'reopened: account A still holds only s-a1 and account B only s-b1 (on the stack as reviewed, B\'s log synced into A as A\'s own and s-a1 was gone)', { a: cloud.sessionsIn('acctA').map(s => s.id), b: cloud.sessionsIn('acctB').map(s => s.id) });
  }
  // F1 with nothing kept aside: "Use this account's log" for a new account C, the save of the new log refused. The phone
  // opens signed in to C each time (the stand-in's account), as the reviewer's reproduction does.
  {
    const cloud = cloudOf();
    const P = await phone(browser, cloud, 'acctC'); pages.push(P);
    await wait(900);
    await P.switchTo('acctA');
    await addSession(P, session('s-a1', '2026-10-19', [[100, 8]])); await P.flush();
    ok(cloud.sessionsIn('acctA').map(s => s.id).join() === 's-a1', 'set up: the phone is on A with s-a1, synced');
    await P.ev(() => window.__ironlog.cloudStop()); await P.ev(() => { window.__uid = 'acctC'; });
    P.ev(() => window.__ironlog.cloudInit()).catch(() => {}); await wait(900);
    await refuseSave(P);
    await P.page.click('#modal [data-act="mAlt"]'); await wait(1500);
    await P.reopen(); await P.flush();
    await P.sync();
    ok(!cloud.sessionsIn('acctC').length && (await P.ev(() => window.__ironlog.cloudState().acct)) === 'acctA', 'the same with nothing kept aside (account C): reopened, nothing of A\'s log is in C, and the notes still name A (on the stack as reviewed, A\'s log was merged into C)', { c: cloud.sessionsIn('acctC').map(s => s.id), acct: await P.ev(() => window.__ironlog.cloudState().acct) });
  }

  // ---- F4: A's log kept aside is taken back with its notes, so an edit and a deletion made in A meanwhile stand.
  for (const how of ['not asked', 'Add it']) {
    const cloud = cloudOf();
    const P = await phone(browser, cloud, 'acctA'); pages.push(P);
    await wait(900);
    await addSession(P, session('s-a1', '2026-10-19', [[100, 8], [100, 8]]));
    await P.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'bw1', date: '2026-10-18', kg: 80 }); L.state = L.normalize(L.state); L.saveNow(); });
    await P.flush();
    await P.switchTo('acctB', 'mAlt');
    // Another phone on A corrects s-a1's second set and deletes the weigh-in.
    const Q = await phone(browser, cloud, 'acctA'); pages.push(Q);
    await wait(1500); await Q.sync();
    await Q.ev(() => { const L = window.__ironlog; const c = JSON.parse(JSON.stringify(L.state.sessions.find(x => x.id === 's-a1'))); c.ex[0].sets[1].r = 9; L.state.sessions = L.state.sessions.map(x => (x.id === 's-a1' ? c : x)); L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); });
    await Q.ev(() => window.__ironlog.ACT.delBW({ dataset: { id: 'bw1' } })); await Q.page.click('#modal [data-act="mOk"]'); await wait(200); await Q.flush();
    // With Add it, the phone holds something of B's (a weigh-in), so it is asked.
    if (how === 'Add it') { await P.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'bwB', date: '2026-10-20', kg: 70 }); L.state = L.normalize(L.state); L.saveNow(); }); await P.flush(); }
    const asked = await P.switchTo('acctA', 'mOk');
    await P.flush(); await Q.sync();
    const sets = (cloud.sessionsIn('acctA').find(s => s.id === 's-a1') || { ex: [{ sets: [] }] }).ex[0].sets.map(x => `${x.w}x${x.r}`).join(',');
    const bw = cloud.bwIn('acctA').map(b => b.id).sort().join();
    ok(!!asked === (how === 'Add it'), `${how}: ${how === 'Add it' ? 'asked, as the phone holds something of B\'s' : 'not asked, as the phone holds nothing of B\'s'}`, asked);
    ok(sets === '100x8,100x9' && bw === (how === 'Add it' ? 'bwB' : ''), `${how}: the log kept aside comes back with its notes, so the set corrected on the other phone and the weigh-in deleted there stand in account A${how === 'Add it' ? ', and B\'s weigh-in is added' : ''} (on the stack as reviewed, a first link undid both)`, { sets, bw });
    ok(!(await P.ev(() => window.__ironlog.asideList())).length, `${how}: nothing is kept aside any more`);
  }

  // ---- F5: a workout begun on the build before, one phone updated mid-workout (its note holds no agreed copy).
  {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1', OLD); pages.push(A);
    await wait(900); await A.start(4); await A.tick(0, 100, 8); await A.flush();
    const B = await phone(browser, cloud, 'u1', OLD); pages.push(B);
    await wait(1500); await B.sync();
    await B.tick(1, 100, 8); await B.flush(); await A.sync();
    await A.page.goto('file://' + path.resolve(FILE)); await A.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(1500);
    ok(!(await A.ev(() => { const m = window.__ironlog.cloud.meta.draft; return !!(m && m.b && m.b.draft); })), 'set up: phone A updated mid-workout, its note from the build before holds no agreed copy');
    await A.ev(() => { window.__offline = true; }); await A.tick(2, 100, 7); await wait(1500);
    await B.finish(); await B.flush();
    await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush();
    const a = await A.saved(), acct = cloud.sessionsIn('u1').map(s => s.ex[0].sets.map(x => `${x.w}x${x.r}`).join(' '));
    ok(a.join() === '100x8 100x8 100x7' && acct.join() === '100x8 100x8 100x7', 'finished on the other phone while the updated one ticked a set offline: the set joins the session once, the two sets both had are one each (on the stack as reviewed: 100x8 100x8 100x8 100x8 100x7)', { a, acct });
  }

  // ---- F6: cardio typed on the phone whose copy lost, with a ticked set and without.
  for (const ticks of [true, false]) {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900); await A.start(3); await A.tick(0, 100, 8); await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1500); await B.sync();
    await A.ev(() => { const L = window.__ironlog; L.ACT.cDraftAdd({ dataset: { when: 'post' } }); const c = L.state.draft.cardio[L.state.draft.cardio.length - 1]; c.kind = 'bike'; c.min = 15; L.saveNow(); });
    if (ticks) await A.tick(1, 100, 7);
    await A.ev(() => { window.__offline = true; }); await wait(1500);
    await B.finish(); await B.flush();
    await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
    const mine = await A.ev(() => window.__ironlog.state.cardio.map(c => `${c.kind} ${c.min}`)), theirs = await B.ev(() => window.__ironlog.state.cardio.map(c => `${c.kind} ${c.min}`));
    const acct = cloud.cardioIn('u1').map(c => `${c.kind} ${c.min}`);
    ok(mine.join() === 'bike 15' && theirs.join() === 'bike 15' && acct.join() === 'bike 15' && (!ticks || (await A.saved()).join() === '100x8 100x7'), `the workout finished on the other phone while this one added 15 min of bike${ticks ? ' and ticked a set' : ' and nothing else'}: the bike is kept once, on both phones and in the account${ticks ? ', the set joined to the session' : ''} (on the stack as reviewed it was gone)`, { mine, theirs, acct, saved: await A.saved() });
  }

  // ---- F9: the same lift twice; one phone removes the first, the other ticks the second.
  {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900);
    await A.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; const b = d.ex[0]; const nb = L.newBlock(b.exId, { ...b.plan, repMin: 12, repMax: 15, sets: 3 }, {}); d.ex = [b, nb]; b.sets.length = 3; d._rampAsked = true; L.saveNow(); });
    await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1500); await B.sync();
    await A.ev(() => { const L = window.__ironlog; L.ACT.bDel({ dataset: { b: '0' } }); }); await wait(200);
    if (await A.modal()) await A.ev(() => window.__ironlog.ACT.mOk());
    await A.flush(); await wait(500);
    await B.tick(0, 60, 14, 1); await B.flush(); await wait(1600); await B.flush(); await A.sync();
    const a = await A.blocks(), b = await B.blocks();
    ok(a === b && /^\w+\[60x14 - -\]$/.test(a), 'the same lift twice, the first removed on one phone while the other ticked the second: one block on both, with its set (on the stack as reviewed the ticked block was there twice)', { a, b });
  }

  // ---- F10: a warm-up added on one phone while the other ticks a set.
  {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900); await A.start(3); await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1500); await B.sync();
    await A.ev(() => window.__ironlog.ACT.wAdd({ dataset: { b: '0' } })); await wait(200);
    await B.tick(0, 100, 8);
    await B.flush(); await A.flush(); await B.sync(); await A.sync();
    const a = await A.rows(), b = await B.rows();
    ok(a === b && a === 'W:- 100x8 - -', 'a warm-up added on one phone while the other ticked the first set: on both, the warm-up is first and the set is kept (on the stack as reviewed the warm-up went to the bottom)', { a, b });
    await A.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets.find(x => x.warm); s.w = 40; s.r = 10; s.done = true; L.saveNow(); });
    await A.finish(); await A.flush();
    ok((await A.saved()).join() === 'W40x10 100x8', 'and the session is saved with the warm-up first', await A.saved());
  }

  // ---- G2: the agreed copy has nothing ticked (both phones on this build, the workout begun on r56, so rows without ids):
  // one phone ticks the first set offline, the other the second and finishes. Both sets are kept (d04ec3b read the empty
  // agreed copy as none and matched the two identical sets as one).
  {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1', OLD); pages.push(A);
    await wait(900); await A.start(4); await A.flush();
    const B = await phone(browser, cloud, 'u1', OLD); pages.push(B);
    await wait(1500); await B.sync();
    for (const P of [A, B]) { await P.page.goto('file://' + path.resolve(FILE)); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await P.watch(); await wait(1500); }
    await A.ev(() => { const L = window.__ironlog; L.state.draft.ex[0].sets[0].w = 100; L.saveNow(); }); await A.flush(); await B.sync();
    ok(await A.ev(() => { const m = window.__ironlog.cloud.meta.draft; return !!(m && m.b && m.b.draft && !m.b.draft.ex[0].sets.some(s => s.done)); }), 'set up: the agreed copy is on the phone and has nothing ticked');
    await A.ev(() => { window.__offline = true; }); await A.tick(0, 100, 8); await wait(1500);
    await B.tick(1, 100, 8); await B.finish(); await B.flush();
    await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
    const acct = cloud.sessionsIn('u1').map(s => s.ex[0].sets.map(x => `${x.w}x${x.r}`).join(' '));
    ok(acct.join() === '100x8 100x8' && (await A.saved()).join() === '100x8 100x8' && (await B.saved()).join() === '100x8 100x8', 'a set ticked on each phone after an agreed copy with nothing ticked: both kept, on both phones and in the account (d04ec3b: one)', { acct, A: await A.saved(), B: await B.saved() });
  }

  // ---- G4: the phone's storage refuses the log's key (full) but not the notes'. A workout finished and synced, then the app
  // reopened: the notes on the phone still describe the log on the phone, so the pull brings the workout back, and nothing is
  // deleted from the account (r55 and d04ec3b saved the notes ahead of the log, and the reopened phone deleted it everywhere).
  {
    const cloud = cloudOf();
    const P = await phone(browser, cloud, 'u1'); pages.push(P);
    await wait(900);
    await P.start(3); await P.tick(0, 100, 8); await P.finish(); await P.flush(); await wait(400);
    ok(cloud.sessionsIn('u1').length === 1, 'set up: the first workout is in the account');
    await refuseSave(P);
    await P.start(3); await P.tick(0, 102.5, 8); await P.tick(1, 102.5, 8); await P.finish(); await P.flush(); await wait(1500); await P.flush();
    const menu = await P.ev(() => { const el = document.getElementById('saveState'); return el ? el.getAttribute('aria-label') : ''; });
    ok(cloud.sessionsIn('u1').length === 2 && /Not saving/.test(menu), 'the second workout reaches the account, and the menu says the phone is not saving, signed in or not (PENDING 336; d04ec3b: "Synced")', { menu, acct: cloud.sessionsIn('u1').length });
    await P.ev(() => { window.__offline = true; window.__ironlog.state.settings.timeBudget = 70; window.__ironlog.saveNow(); }); await P.flush(); await wait(400);
    ok(/Not saving/.test(await P.ev(() => { const el = document.getElementById('saveState'); return el ? el.getAttribute('aria-label') : ''; })), 'and offline it never says the log is saved on this device (r55 and d04ec3b: "Offline, saved on this device")');
    await P.ev(() => { window.__offline = false; });
    await P.reopen(); await P.sync(); await wait(1500); await P.flush(); await wait(500);
    ok(cloud.sessionsIn('u1').length === 2 && (await P.ev(() => window.__ironlog.state.sessions.length)) === 2, 'reopened: both workouts are in the account and back on the phone (r55 and d04ec3b: the second was deleted everywhere)', { acct: cloud.sessionsIn('u1').length, phone: await P.ev(() => window.__ironlog.state.sessions.length) });
  }

  // ---- A-1 (the r63 audit, r64): a pull, or a flush that takes in the other phone's copy, whose save on this phone is
  // refused. The notes say what the log on this phone holds, so they are not written ahead of it: reopened, the phone
  // pulls the other phone's session again instead of reading it as deleted (r63 deleted it from the account, then from
  // the other phone), and the menu says the phone is not saving.
  for (const how of ['pull', 'flush']) {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900);
    await addSession(A, session('s-a1', '2026-10-19', [[100, 8]])); await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1500); await B.sync();
    await addSession(B, session('s-b1', '2026-10-20', [[60, 10]])); await B.flush();
    ok(cloud.sessionsIn('u1').map(s => s.id).sort().join() === 's-a1,s-b1', `A-1 ${how}, set up: the account holds both phones' sessions`, cloud.sessionsIn('u1').map(s => s.id));
    if (how === 'pull') { await refuseSave(A); await A.sync(); }
    // The flush reads the document before writing it: a change saved here to the same half-month document, then the
    // storage full, so the flush takes in B's copy and the write of the log after it is refused.
    else { await A.ev(() => { const L = window.__ironlog; L.state.sessions.find(s => s.id === 's-a1').notes = 'kept'; L.saveNow(); }); await refuseSave(A); await A.flush(); }
    await wait(1200);
    const menu = await A.ev(() => { const el = document.getElementById('saveState'); return el ? el.getAttribute('aria-label') : ''; });
    ok(/Not saving/.test(menu), `A-1 ${how}: with the save refused, the menu says the phone is not saving (r63: "Synced")`, menu);
    await A.reopen(); await A.sync(); await wait(1500); await A.flush(); await wait(600); await B.sync(); await wait(600);
    const acct = cloud.sessionsIn('u1').map(s => s.id).sort().join(), onA = (await A.ids()).join(), onB = (await B.ids()).join();
    ok(acct === 's-a1,s-b1' && onA === 's-a1,s-b1' && onB === 's-a1,s-b1', `A-1 ${how}: reopened, the other phone's session is pulled again, in the account and on both phones (r63: deleted everywhere)`, { acct, onA, onB });
  }

  // ---- G5: a log kept aside for G comes back while the phone holds nothing of the lifter's (demo data, or the starter
  // routine after the menu's Sign out): it comes back as it was, so no demo session or second routine reaches the account.
  for (const how of ['demo', 'signout']) {
    const cloud = cloudOf();
    const P = await phone(browser, cloud, 'acctG'); pages.push(P);
    await wait(900);
    await addSession(P, session('s-g1', '2026-10-19', [[100, 8]])); await P.flush();
    const routines = uid => { const v = cloud.store.get(`data/users/${uid}/core`); return v ? JSON.parse(JSON.parse(v).json).routines.map(r => r.name) : []; };
    const before = routines('acctG').length;
    await P.switchTo('acctH', 'mAlt'); await P.flush();
    if (how === 'demo') { await P.ev(() => window.__ironlog.cloudStop()); await P.ev(() => window.__ironlog.ACT.demoLoad()); await wait(200); await P.ev(() => window.__ironlog.ACT.mOk()); await wait(500); }
    else await P.ev(() => { const L = window.__ironlog; L.cloudStop(true); L.undoForget(); L.state = L.normalize(null); L.state.settings.onboarded = true; L.saveNow(); L.invalidate(); });
    await P.ev(() => { window.__uid = 'acctG'; }); P.ev(() => window.__ironlog.cloudInit()).catch(() => {}); await wait(1500);
    await P.flush(); await wait(1200); await P.flush();
    const g = cloud.sessionsIn('acctG');
    ok(!(await P.modal()) && g.map(s => s.id).join() === 's-g1' && !g.some(s => s.demo) && routines('acctG').length === before, `${how === 'demo' ? 'demo data loaded' : 'the menu\'s Sign out'}, then G again: G's log comes back as it was, with no demo session and no second routine in the account (d04ec3b: ${how === 'demo' ? '29 demo sessions' : 'two "Upper / lower, 4 days"'})`, { sessions: g.length, demo: g.filter(s => s.demo).length, routines: routines('acctG') });
  }

  // ---- G6: Add it, with a workout open on this phone (W_A) and one in the log kept aside for B (W_B): W_A stays open as it
  // was, typed rows and all, and W_B's ticked set is saved in History, said so (d04ec3b opened W_B and closed W_A, unsaid).
  for (const how of ['Add it', 'not asked']) {
    const cloud = cloudOf();
    const P = await phone(browser, cloud, 'acctB'); pages.push(P);
    await wait(900);
    await P.start(3); await P.tick(0, 100, 8); await P.flush();
    const WB = await P.ev(() => window.__ironlog.state.draft.id);
    await P.switchTo('acctA', 'mAlt'); await P.flush();
    if (how === 'not asked') await P.ev(() => { const L = window.__ironlog; L.cloudStop(true); L.undoForget(); L.state = L.normalize(null); L.state.settings.onboarded = true; L.saveNow(); L.invalidate(); });
    await P.start(3); await P.tick(0, 60, 10);
    await P.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[1]; s.w = 62.5; s.r = 9; L.saveNow(); });
    await P.flush();
    const WA = await P.ev(() => window.__ironlog.state.draft.id);
    await P.switchTo('acctB', how === 'Add it' ? 'mOk' : null);
    await P.flush(); await wait(1200); await P.flush(); await wait(400);
    const d = await P.draftOf(), ss = await P.ev(() => window.__ironlog.state.sessions.map(s => ({ id: s.id, sets: s.ex.map(b => b.sets.map(x => `${x.w}x${x.r}`).join(' ')).join(' | ') })));
    const t = (await P.toasts()).join(' / ');
    ok(d && d.id === WA && d.rows === '60x10 typed 62.5x9 -' && ss.some(s => s.id === WB && s.sets === '100x8') && /kept for this account.*saved in History/.test(t), `${how}: this phone's workout stays open as it was, the one kept for B is saved in History, and the phone says so (d04ec3b: W_B opened, W_A closed, nothing said)`, { d, WA, WB, ss, t });
  }

  // ---- G7: cardio on a workout open on two phones, against the copy both agreed on (10 min of bike). Edited to 15 min on the
  // phone whose copy loses, or deleted on the phone that finishes: the edit is kept, the deletion stands (d04ec3b: the edit
  // lost, the deleted row back). Then cardio alone joined to a session saved here is said as cardio, not sets.
  for (const how of ['edit', 'del']) {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900); await A.start(3); await A.tick(0, 100, 8);
    await A.ev(() => { const L = window.__ironlog; L.ACT.cDraftAdd({ dataset: { when: 'post' } }); const c = L.state.draft.cardio[L.state.draft.cardio.length - 1]; c.kind = 'bike'; c.min = 10; L.saveNow(); });
    await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1500); await B.sync();
    await A.ev(() => { window.__offline = true; });
    if (how === 'edit') await A.ev(() => { const L = window.__ironlog; L.state.draft.cardio[0].min = 15; L.saveNow(); });
    await A.tick(1, 100, 7);
    if (how === 'del') await B.ev(() => { const L = window.__ironlog; L.state.draft.cardio = []; L.saveNow(); });
    await wait(1500);
    await B.finish(); await B.flush();
    await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
    const acct = cloud.cardioIn('u1').map(c => `${c.kind} ${c.min}`).join();
    const want = how === 'edit' ? 'bike 15' : '';
    ok(acct === want && (await A.cardio()).log === want && (await B.cardio()).log === want && (await A.saved()).join() === '100x8 100x7', how === 'edit' ? 'cardio edited on the phone whose copy lost (10 to 15 min): the edit is kept, on both phones and in the account (d04ec3b: 10)' : 'cardio deleted on the phone that finished: it stays deleted (d04ec3b: back from the other phone\'s copy)', { acct, A: await A.cardio(), B: await B.cardio() });
  }
  {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900); await A.start(3); await A.tick(0, 100, 8); await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1500); await B.sync();
    await A.ev(() => { window.__offline = true; }); await A.finish(); await wait(1500);
    await B.ev(() => { const L = window.__ironlog; L.ACT.cDraftAdd({ dataset: { when: 'post' } }); const c = L.state.draft.cardio[L.state.draft.cardio.length - 1]; c.kind = 'bike'; c.min = 12; L.saveNow(); });
    await B.flush();
    await A.ev(() => { window.__offline = false; window.__toasts = []; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
    const t = (await A.toasts()).join(' / ');
    ok((await A.cardio()).log === 'bike 12' && /Cardio logged on another device was added to the session saved here/.test(t) && !/Sets ticked/.test(t), 'cardio alone, logged on the other phone, joined to the session saved here: kept, and said as cardio (d04ec3b: "Sets ticked on another device were added")', { cardio: await A.cardio(), t });
  }

  // ---- G9: a set two past the top of the range moves the next sets up (Next sets: 230.5 lb); then a warm-up added on the other
  // phone lands above it in the merge. The adjusted load stays on the rows under the set it came from, and one tap logs it
  // (d04ec3b: the rows showed 220.5 under "Next sets: 230.5 lb", and one tap logged 220.5).
  {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900); await A.start(4);
    await A.ev(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; const b = L.state.draft.ex[0]; b.plan = { ...b.plan, repMin: 8, repMax: 12, rir: 1 }; L.saveNow(); });
    await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1500); await B.sync();
    await B.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[0]; s.w = 100; s.r = 14; L.saveNow(); L.render(); });
    await B.ev(() => window.__ironlog.ACT.sDone({ dataset: { b: '0', s: '0' } })); await wait(300);
    const adjW = await B.ev(() => window.__ironlog.state.draft.ex[0].adj && window.__ironlog.state.draft.ex[0].adj.w);
    await A.ev(() => window.__ironlog.ACT.wAdd({ dataset: { b: '0' } })); await wait(200);
    await B.flush(); await A.flush(); await B.sync(); await A.sync();
    await B.ev(() => window.__ironlog.render()); await wait(300);
    const next = await B.ev(() => window.__ironlog.state.draft.ex[0].sets.findIndex(s => !s.warm && !s.done));
    await B.ev(n => window.__ironlog.ACT.sDone({ dataset: { b: '0', s: String(n) } }), next); await wait(300);
    const logged = await B.ev(n => window.__ironlog.state.draft.ex[0].sets[n].w, next);
    ok(adjW > 100 && Math.abs(logged - adjW) < 1e-9 && (await B.rows()).startsWith('W:- 100x14'), 'the next sets moved up from a set of 14 keep that load when a merge adds a warm-up above: one tap logs it (d04ec3b: the old load)', { adjW, logged, rows: await B.rows() });
  }

  // ---- G10: a join keeps the saved session's order: a warm-up the finishing phone added at the top stays first, and the set
  // this phone ticked since is added after (d04ec3b moved the warm-up below the agreed set).
  {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900); await A.start(3); await A.tick(0, 100, 8); await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1500); await B.sync();
    await A.ev(() => { window.__offline = true; }); await A.tick(2, 100, 6); await wait(1200);
    await B.ev(() => window.__ironlog.ACT.wAdd({ dataset: { b: '0' } })); await wait(200);
    await B.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[0]; s.w = 60; s.r = 5; s.done = true; L.saveNow(); });
    await B.tick(2, 100, 7); await B.finish(); await B.flush();
    await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
    const acct = cloud.sessionsIn('u1').map(s => s.ex.map(b => b.sets.map(x => `${x.warm ? 'W' : ''}${x.w}x${x.r}`).join(' ')).join(' | '));
    ok(acct.join() === 'W60x5 100x8 100x7 100x6' && (await A.saved()).join() === acct.join() && (await B.saved()).join() === acct.join(), 'a join after the other phone added a warm-up at the top and finished: its order stands, the set ticked here added after (d04ec3b: 100x8 W60x5 100x7 100x6)', { acct, A: await A.saved() });
  }

  const errors = pages.flatMap(P => P.errors).filter(e => !/quota has been exceeded/i.test(e));
  ok(!errors.length, 'no page errors', errors.slice(0, 4));
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
