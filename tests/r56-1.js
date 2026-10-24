// r56.1: the sync changes made on the typed storage and sync code (ARCHITECTURE.md,
// Phase 4 in detail, r56.1), each failing on r56's page unless it says it
// guards what r56 did: `node tests/r56-1.js <r56 page>`. Two phones share one
// stand-in cloud (the Claude db the sync takes when window.claude exists, as
// tests/r22.js uses it), each signed in as the account its page names.
//   (1) one workout open on two phones, both ticking: every set kept, merged
//       row by row (328 a and c); a set ticked while signed out joins the
//       workout at the next sign-in; two different workouts: the later edit
//       stays in progress and the other's ticked sets are saved in History on
//       every phone; a workout finished on one phone while the other ticked
//       more: the extra sets join the saved session;
//   (2) a phone holding another account's log asks before merging (328 b):
//       Cancel syncs nothing and keeps the notes; Add it merges as a first
//       link; Use this account's log keeps the other log aside, and the next
//       sign-in to that account starts from it; a phone with nothing of the
//       lifter's, or whose notes were forgotten, is not asked; a sync started
//       while the question is open waits;
//   (3) a damaged sync note or error-log entry is dropped, not read as it came
//       (305); a cardio kind is one of the list's keys;
//   (4) the sync's status is one of its five states (307);
//   (5) a start time a Date cannot hold is dropped (308).
const { open, engine } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || 'index.html';
const CLOCK = '2026-10-21T10:00:00';

// One stand-in cloud per scenario: documents by path, shared by every page opened with it.
function cloudOf() {
  const store = new Map();
  const setup = uid => async (ctx, page) => {
    await page.exposeFunction('__dbGet', p => (store.has(p) ? store.get(p) : null));
    await page.exposeFunction('__dbSet', (p, v) => { store.set(p, v); return true; });
    await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
    await page.addInitScript(u => {
      window.__uid = u;
      window.claude = { use: async k => {
        if (k === 'user') return { id: async () => window.__uid };
        if (k === 'db') return { doc: p => ({ get: async () => { if (window.__dbFail && new RegExp(window.__dbFail).test(p)) { window.__dbFail = null; throw new Error('read failed'); } const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); return true; } }), collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
        return null;
      } };
    }, uid);
  };
  const doc = (uid, id) => { const v = store.get(`data/users/${uid}/${id}`); return v ? JSON.parse(JSON.parse(v).json) : null; };
  return { store, setup, doc };
}
// A phone: a page on the cloud, signed in as uid, with the first page's flags set so the screens draw the log.
async function phone(browser, cloud, uid, opts = {}) {
  const P = await open(FILE, { browser, clock: CLOCK, realStarter: true, setup: cloud.setup(uid), ...opts });
  P.ev = (f, a) => P.page.evaluate(f, a);
  await P.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
  P.sync = async () => { await P.ev(() => window.__ironlog.sync()); await wait(150); };
  P.flush = async () => { await P.ev(() => window.__ironlog.flush()); await wait(150); };
  P.draft = () => P.ev(() => { const d = window.__ironlog.state.draft; return d ? { id: d.id, sets: d.ex[0].sets.map(s => ({ w: s.w, r: s.r, done: !!s.done })), n: d.ex.length } : null; });
  P.sessions = () => P.ev(() => window.__ironlog.state.sessions.map(s => ({ id: s.id, sets: s.ex.flatMap(b => b.sets.map(x => [x.w, x.r])) })));
  // Ticks row i of the first exercise with a load and reps, as the logger saves a tick.
  P.tick = (i, w, r) => P.ev(([i, w, r]) => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[i]; s.w = w; s.r = r; s.done = true; L.saveNow(); }, [i, w, r]);
  P.start = () => P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.slice(0, 1); d.ex[0].sets.length = 4; d._rampAsked = true; L.saveNow(); });
  P.toast = () => P.ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText : ''; });
  P.cloudState = () => P.ev(() => window.__ironlog.cloudState());
  P.modal = () => P.ev(() => { const m = window.__ironlog.ui.modal; const el = document.querySelector('#modal .sheet'); return m ? { kind: m.kind, title: m.title || '', text: el ? el.innerText : '', buttons: el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()) : [] } : null; });
  return P;
}
const setsOf = d => (d ? d.sets.filter(s => s.done).map(s => `${s.w}x${s.r}`).join(',') : '-');

(async () => {
  const browser = await engine.launch();
  // Every page opened (its errors are checked at the end).
  const pages = [];

  // ---- (1) One workout open on two phones.
  {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900); await A.start(); await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1200);
    const bd = await B.draft();
    ok(bd && bd.id === (await A.draft()).id && bd.n === 1, 'two phones signed in to one account hold the same workout in progress', bd);
    await A.tick(0, 100, 8); await A.flush();
    await B.tick(1, 100, 7); await B.flush();
    await A.sync(); await B.sync();
    const ad = await A.draft(), bd2 = await B.draft();
    ok(setsOf(ad) === '100x8,100x7' && setsOf(bd2) === '100x8,100x7', 'a set ticked on each phone: both phones hold both sets, merged row by row (328 a and c)', { A: setsOf(ad), B: setsOf(bd2) });
    ok(ad && ad.id === bd2.id && (await A.ev(() => window.__ironlog.state.sessions.length)) === 0, 'the workout stays one workout in progress, and no session was saved for it');
    // The same row ticked on both with different reps: the later edit wins, once, and says so.
    await A.tick(2, 100, 6); await B.tick(2, 100, 5);
    await A.flush(); await B.flush(); await A.sync();
    const ad3 = await A.draft(), bd3 = await B.draft();
    ok(setsOf(ad3) === setsOf(bd3) && /100x[56]$/.test(setsOf(ad3)) && ad3.sets.filter(s => s.done).length === 3, 'the same row ticked on both phones keeps one of the two, the later edit, and the other rows', { A: setsOf(ad3), B: setsOf(bd3) });
    // A set ticked while signed out joins the workout at the next sign-in (328 c).
    await B.ev(() => window.__ironlog.cloudStop());
    ok(!(await B.cloudState()).on, 'B signs out, keeping its log and its sync notes');
    await B.tick(3, 100, 9);
    await A.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets.push({ w: 110, r: 5, rir: null, warm: false, drop: false, done: true, rid: 'r-a5' }); L.saveNow(); });
    await A.flush();
    await B.ev(() => window.__ironlog.cloudInit()); await wait(1200);
    const bd4 = await B.draft(); await A.sync(); const ad4 = await A.draft();
    ok((await B.cloudState()).on && setsOf(bd4).includes('100x9') && setsOf(bd4).includes('110x5') && setsOf(ad4) === setsOf(bd4), 'a set ticked while signed out, and one ticked on the other phone meanwhile, are both there after the sign-in', { A: setsOf(ad4), B: setsOf(bd4) });
    // Finished on B while A ticked more: A's extra set joins the saved session.
    const did = ad4.id;
    await B.ev(() => { window.__ironlog.ACT.finish(); }); await wait(300);
    await B.ev(() => { const L = window.__ironlog; const m = L.ui.modal; if (m) L.ACT.mClose(); }); await B.flush();
    ok(!(await B.draft()) && (await B.sessions()).some(s => s.id === did), 'B finishes the workout: its session is in the account and its draft document is empty', { sessions: (await B.sessions()).length, doc: !!cloud.doc('u1', 'draft').draft });
    await A.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets.push({ w: 120, r: 3, rir: null, warm: false, drop: false, done: true, rid: 'r-a6' }); L.saveNow(); });
    await A.flush(); await wait(1600); await A.flush();
    const as = await A.sessions();
    const joined = as.find(s => s.id === did);
    ok(!(await A.draft()) && joined && joined.sets.some(([w, r]) => w === 120 && r === 3) && joined.sets.length === 6, 'finished on B while A ticked one more: the set joins the saved session on A, and the workout is closed there', { draft: await A.draft(), joined });
    ok(/saved on another device\. What was done here since was added to it/.test(await A.toast()), 'A is told the workout was saved on the other phone, with what was done here since', await A.toast());
    await B.sync();
    const bs = await B.sessions();
    ok(bs.find(s => s.id === did) && bs.find(s => s.id === did).sets.length === 6, 'B then has the joined session, with A\'s extra set', bs.find(s => s.id === did));
    // Discarded on B while A ticked more: A's workout closes, and the sets ticked there are saved as a session (never dropped).
    await A.start(); await A.tick(0, 80, 10); await A.flush(); await B.sync();
    const xid = (await A.draft()).id;
    ok((await B.draft()) && (await B.draft()).id === xid, 'B holds the new workout');
    await B.ev(() => { const L = window.__ironlog; L.ACT.discard(); }); await wait(200);
    await B.page.click('#modal [data-act="mOk"]'); await wait(200); await B.flush();
    ok(!(await B.draft()) && !cloud.doc('u1', 'draft').draft, 'B discards it: its draft document is empty', cloud.doc('u1', 'draft'));
    await A.tick(1, 80, 9); await A.flush(); await wait(1600); await A.flush();
    ok(!(await A.draft()) && (await A.sessions()).some(s => s.id === xid && s.sets.length === 2), 'discarded on B while A ticked another set: A\'s workout closes and its ticked sets are saved as a session', { draft: await A.draft(), sessions: await A.sessions() });
    ok(/closed on another device\. Its ticked sets are saved in History/.test(await A.toast()), 'A is told the workout was closed on the other phone and its sets saved', await A.toast());
    await B.sync();
    ok(!(await B.draft()) && (await B.sessions()).some(s => s.id === xid && s.sets.length === 2), 'B then has that session and stays closed', { draft: await B.draft(), sessions: await B.sessions() });
    // Finished on A while B had ticked a set A had not pulled: B's set joins the session saved on A.
    await A.start(); await A.tick(0, 90, 10); await A.flush(); await B.sync();
    const yid = (await A.draft()).id;
    await B.tick(1, 90, 9); await B.flush();
    await A.tick(2, 90, 8);
    // Finish with a row left unticked: its question answered, as tests/r43.js finishes.
    await A.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
    await A.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await A.flush(); await wait(1600); await A.flush();
    const ys = (await A.sessions()).find(s => s.id === yid);
    ok(!(await A.draft()) && ys && ys.sets.length === 3 && ys.sets.some(([w, r]) => w === 90 && r === 9), 'finished on A while B had ticked a set A had not pulled: B\'s set joins the session saved on A', { draft: await A.draft(), session: ys });
    ok(/Sets ticked on another device were added to the session saved here/.test(await A.toast()), 'A is told so', await A.toast());
    await B.sync();
    const yb = (await B.sessions()).find(s => s.id === yid);
    ok(!(await B.draft()) && yb && yb.sets.length === 3 && /saved on another device/.test(await B.toast()), 'B then holds the saved session with all three sets and is told the workout was saved on another device', { draft: await B.draft(), session: yb, toast: await B.toast() });
    // A saved session opened for editing in History keeps its rows' ids, so a join after an edit still goes row by row.
    const rids0 = await A.ev(id => window.__ironlog.state.sessions.find(s => s.id === id).ex[0].sets.map(x => x.rid), yid);
    await A.ev(id => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id } }); }, yid); await wait(150);
    const ridsEdit = await A.ev(() => window.__ironlog.state.draft.ex[0].sets.map(x => x.rid));
    await A.ev(() => { const L = window.__ironlog; L.state.draft._rampAsked = true; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
    await A.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const rids1 = await A.ev(id => window.__ironlog.state.sessions.find(s => s.id === id).ex[0].sets.map(x => x.rid), yid);
    ok(rids0.length === 3 && rids0.every(r => typeof r === 'string') && ridsEdit.join() === rids0.join() && rids1.join() === rids0.join() && !(await A.draft()), 'a saved session edited in History keeps its rows\' ids through the edit and the save', { rids0, ridsEdit, rids1 });
    await A.flush();
    // The connection gone mid-flush, after B finished and A ticked more: the read of the session's document fails, and
    // A's workout stays as it was, its sets with it, for the retry (the join happening then).
    await A.start(); await A.tick(0, 70, 10); await A.flush(); await B.sync();
    const zid = (await A.draft()).id;
    await B.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
    await B.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await B.flush();
    await A.tick(1, 70, 9);
    await A.ev(() => { window.__dbFail = '/s-'; }); await A.flush(); await wait(300);
    ok((await A.draft()) && (await A.draft()).id === zid && setsOf(await A.draft()) === '70x10,70x9' && !(await A.sessions()).some(s => s.id === zid), 'a read of the session\'s document that fails mid-flush leaves the workout here as it was, its sets with it', { draft: await A.draft(), sessions: await A.sessions(), cloud: await A.cloudState() });
    await A.flush(); await wait(1600); await A.flush();
    const zs = (await A.sessions()).find(s => s.id === zid);
    ok(!(await A.draft()) && zs && zs.sets.length === 2, 'the retry joins the set to the saved session and closes the workout', { draft: await A.draft(), session: zs });
    // Two different workouts: the later edit stays in progress, the other's ticked sets are saved on both phones (328 a).
    await A.start(); await A.tick(0, 60, 12); await A.flush();
    const N = await phone(browser, cloud, 'u1', { state: { settings: { onboarded: true }, sessions: [], draft: null } }); pages.push(N);
    await wait(300);
    // N holds its own workout in progress, ticked, before it first syncs with the account.
    await N.ev(() => window.__ironlog.cloudStop(true));
    await N.start(); await N.tick(0, 40, 15);
    const nid = (await N.draft()).id, aid = (await A.draft()).id;
    await N.ev(() => window.__ironlog.cloudInit()); await wait(1500);
    ok((await N.draft()).id === nid && (await N.sessions()).some(s => s.id === aid), 'a first sign-in with two workouts in progress keeps this phone\'s and saves the other\'s ticked sets (r55)');
    await N.flush();
    // The account's phone ticks a set on its own workout before it next pulls, then flushes: its later edit wins.
    await A.tick(1, 60, 11); await A.flush(); await wait(1600); await A.flush();
    ok((await A.draft()).id === aid && (await A.sessions()).some(s => s.id === nid && s.sets.some(([w, r]) => w === 40 && r === 15)), 'the account\'s phone keeps its own workout in progress and saves the other phone\'s ticked sets as a session', { draft: await A.draft(), sessions: await A.sessions() });
    ok(/Sets ticked on another device were saved in History/.test(await A.toast()), 'and says so', await A.toast());
    await N.sync();
    ok((await N.draft()).id === aid && (await N.sessions()).some(s => s.id === nid && s.sets.some(([w, r]) => w === 40 && r === 15)), 'the new phone then holds the account\'s workout in progress, and its own ticked sets are in its History', { draft: await N.draft(), sessions: await N.sessions() });
    ok(/replaced by the one on another device/.test(await N.toast()), 'the new phone is told its workout was replaced', await N.toast());
  }

  // ---- (1b) A workout whose rows have no ids (begun on a build before r56.1, or rows an older phone added):
  // finished on one phone while the other ticked a row it had not; the join matches the rows without ids by what
  // they hold, since a saved session keeps no unticked rows and a place means nothing there (PENDING 333: matched
  // by place, the set ticked here took the place of the one finished there, and was lost on both phones).
  {
    const cloud = cloudOf();
    const A = await phone(browser, cloud, 'u1'); pages.push(A);
    await wait(900); await A.start();
    await A.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets.forEach(x => { delete x.rid; }); Object.assign(b.sets[0], { w: 100, r: 8, done: true }); L.saveNow(); });
    await A.flush();
    const B = await phone(browser, cloud, 'u1'); pages.push(B);
    await wait(1200); await B.sync();
    const id = (await A.draft()).id;
    ok((await B.draft()) && (await B.draft()).id === id && (await B.ev(() => window.__ironlog.state.draft.ex[0].sets.every(x => x.rid === undefined))), 'set up: both phones hold one workout whose rows have no ids');
    await A.tick(1, 100, 7);
    await A.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
    await A.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await A.flush();
    await B.tick(2, 100, 6); await B.flush(); await wait(1600); await B.flush(); await B.sync(); await A.sync();
    const sa = (await A.sessions()).find(s => s.id === id), sb = (await B.sessions()).find(s => s.id === id);
    const all = x => (x ? x.sets.map(([w, r]) => `${w}x${r}`).join(',') : '-');
    ok(sb && all(sb) === '100x8,100x7,100x6' && all(sa) === all(sb) && !(await B.draft()), 'finished on one phone while the other ticked a row it had not, rows without ids: the set joins the session, every set once, in order', { A: all(sa), B: all(sb) });
  }

  // ---- (2) A phone holding another account's log asks before merging (328 b).
  {
    const cloud = cloudOf();
    const P = await phone(browser, cloud, 'acctA'); pages.push(P);
    await wait(900);
    await P.ev(() => { const L = window.__ironlog; L.state.sessions.push({ id: 's-a1', date: '2026-10-19', dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', notes: '', demo: false, deload: false, light: false, free: true, ex: [{ exId: 'bench', note: '', rr: null, sets: [{ w: 100, r: 8, rir: 1, warm: false, drop: false }] }] }); L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); });
    await P.flush();
    ok(cloud.doc('acctA', 's-2026-10-2') && (await P.cloudState()).acct === 'acctA', 'a phone synced to account A holds its session and its notes name A');
    await P.ev(() => window.__ironlog.cloudStop());
    await P.ev(() => { window.__uid = 'acctB'; });
    P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
    let m = await P.modal();
    ok(m && m.kind === 'confirm' && /another account/.test(m.title) && m.buttons.includes('Add it to this account') && m.buttons.includes("Use this account's log") && m.buttons.includes('Cancel'), 'signing in to account B on a phone holding A\'s log asks: add it, use this account\'s log, or cancel', m);
    // A second start of the sync while the question is open waits.
    await P.ev(() => { window.__ironlog.cloudInit(); }); await wait(300);
    ok((await P.modal()) && !(await P.cloudState()).on, 'another start of the sync while the question is open changes nothing');
    // Another sheet opened over the question (nothing answered) reads as Cancel, and the sync can be started again.
    await P.ev(() => { window.__ironlog.ACT.exEdit({ dataset: { ex: 'bench' } }); }); await wait(500);
    ok((await P.modal()) && (await P.modal()).kind === 'exEdit' && !(await P.cloudState()).on && (await P.cloudState()).acct === 'acctA', 'a sheet opened over the question closes it as Cancel: nothing synced, the notes still name A', { modal: await P.modal(), state: await P.cloudState() });
    await P.ev(() => window.__ironlog.ACT.mClose());
    P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
    m = await P.modal();
    ok(m && m.kind === 'confirm' && /another account/.test(m.title), 'and the next sign-in asks again', m);
    await P.page.click('#modal [data-act="mClose"]'); await wait(500);
    ok(!(await P.cloudState()).on && (await P.cloudState()).acct === 'acctA' && !cloud.store.has('data/users/acctB/core') && (await P.ev(() => window.__ironlog.state.sessions.length)) === 1, 'Cancel: nothing synced, the notes still name A, the log untouched', { state: await P.cloudState(), keys: [...cloud.store.keys()] });
    // Add it: a first link, the merge as it is.
    P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
    await P.page.click('#modal [data-act="mOk"]'); await wait(1500);
    ok((await P.cloudState()).on && (await P.cloudState()).acct === 'acctB' && cloud.doc('acctB', 's-2026-10-2') && cloud.doc('acctB', 's-2026-10-2').sessions.some(s => s.id === 's-a1'), 'Add it: the log merges into account B as a first link', { state: await P.cloudState(), keys: [...cloud.store.keys()] });
    // No room to keep the log aside: nothing is replaced, and the sign-in is undone (the log stays, the notes still name B).
    await P.ev(() => window.__ironlog.cloudStop());
    // The log kept aside goes to IndexedDB (PENDING 333): its write refused there, as a full disk refuses it.
    await P.ev(() => { window.__uid = 'acctG'; const o = IDBObjectStore.prototype.put; window.__put0 = o; IDBObjectStore.prototype.put = function (...a) { if (/-aside$/.test(this.transaction.db.name)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return o.apply(this, a); }; });
    P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
    await P.page.click('#modal [data-act="mAlt"]'); await wait(800);
    ok(!(await P.cloudState()).on && (await P.cloudState()).acct === 'acctB' && (await P.ev(() => window.__ironlog.state.sessions.length)) === 1 && /not enough room on this phone to keep the other log aside/.test(await P.toast()) && !(await P.ev(() => window.__ironlog.asideList())).length, 'with no room to keep the log aside, Use this account\'s log replaces nothing: the log and its notes stay, the sign-in is undone, and the phone says why', { state: await P.cloudState(), toast: await P.toast(), aside: await P.ev(() => window.__ironlog.asideList()) });
    await P.ev(() => { IDBObjectStore.prototype.put = window.__put0; });
    // Use this account's log: the phone's log is kept aside for B, account C's own (empty) log is used.
    await P.ev(() => window.__ironlog.cloudStop());
    await P.ev(() => { window.__uid = 'acctC'; });
    P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
    await P.page.click('#modal [data-act="mAlt"]'); await wait(1500);
    const st = await P.cloudState();
    ok(st.on && st.acct === 'acctC' && (await P.ev(() => window.__ironlog.state.sessions.length)) === 0 && (await P.ev(() => window.__ironlog.asideList())).some(a => a.acct === 'acctB' && a.sessions === 1), 'Use this account\'s log: the phone starts on C\'s own log, and B\'s log is kept aside on the phone', { state: st, aside: await P.ev(() => window.__ironlog.asideList()) });
    ok(!cloud.store.has('data/users/acctC/s-2026-10-2'), 'nothing of B\'s log reaches account C', [...cloud.store.keys()]);
    // C's log is empty, so the phone is on the Set up page; once set up, Your data says what is kept aside.
    ok(await P.ev(() => !window.__ironlog.state.settings.onboarded && document.body.classList.contains('obmode')), 'a phone starting on an empty account\'s log is on the first-run Set up page', await P.ev(() => document.body.innerText.slice(0, 200)));
    await P.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'settings'; L.render(); });
    ok(await P.ev(() => /kept on this phone/.test((document.getElementById('asideLine') || {}).textContent || '')), 'Your data says a log from another account is kept on this phone', await P.ev(() => ({ line: !!document.getElementById('asideLine'), data: !!document.getElementById('dataSec'), aside: window.__ironlog.asideList(), text: (document.getElementById('dataSec') || {}).textContent })));
    ok((await P.ev(() => window.__ironlog.undoStack.length)) === 0, 'Undo is cleared when another account\'s log is used (a step held the other account\'s log)');
    // Signing in to B again on this phone: C's log (nothing of the lifter's) is not asked about; B's log comes back from aside and syncs as a continuation.
    await P.ev(() => window.__ironlog.cloudStop());
    await P.ev(() => { window.__uid = 'acctB'; });
    await P.ev(() => window.__ironlog.cloudInit()); await wait(1500);
    const st2 = await P.cloudState();
    ok(!(await P.modal()) && st2.on && st2.acct === 'acctB' && (await P.ev(() => window.__ironlog.state.sessions.map(s => s.id).join())) === 's-a1' && !(await P.ev(() => window.__ironlog.asideList())).length, 'signing in to B again: the log kept aside is back, its notes with it, and nothing is kept aside any more', { state: st2, sessions: await P.sessions(), aside: await P.ev(() => window.__ironlog.asideList()) });
    // A deletion made in C while B's log was aside does not reach B (the review's reproduction, reversed: B's notes were kept with its log).
    // Not asked: notes forgotten (a restore, Copy my log in, demo data, Erase everything).
    await P.ev(() => window.__ironlog.cloudStop(true));
    await P.ev(() => { window.__uid = 'acctD'; });
    await P.ev(() => window.__ironlog.cloudInit()); await wait(1200);
    ok(!(await P.modal()) && (await P.cloudState()).acct === 'acctD' && cloud.doc('acctD', 's-2026-10-2'), 'a phone whose notes were forgotten is not asked: a first link, as before', { state: await P.cloudState() });
    // Not asked: nothing of the lifter's on the phone.
    const Q = await phone(browser, cloud, 'acctE'); pages.push(Q);
    await wait(900);
    await Q.ev(() => window.__ironlog.cloudStop());
    await Q.ev(() => { window.__uid = 'acctF'; });
    await Q.ev(() => window.__ironlog.cloudInit()); await wait(1200);
    ok(!(await Q.modal()) && (await Q.cloudState()).acct === 'acctF', 'a phone with nothing of the lifter\'s on it is not asked', { state: await Q.cloudState() });
  }

  // ---- (3) Damaged notes and log entries are dropped; a cardio kind is one of the list's keys (305).
  {
    const cloud = cloudOf();
    // No cloud on this page: the notes are read as saved and not rewritten by a sync.
    const R = await open(FILE, { browser, clock: CLOCK, realStarter: true, setup: async (ctx, page) => { await page.addInitScript(() => { localStorage.setItem('ironlog.v1', JSON.stringify({ version: 5, settings: { onboarded: true } })); localStorage.setItem('ironlog.v1.sync', JSON.stringify({ meta: { core: { h: 'abc', at: 5, b: null }, draft: { at: 5 }, 'b-2026': 'x' }, editAt: { core: 7, draft: 'x' }, last: 'x', devId: 'dev-1', acct: 'u9' })); localStorage.setItem('ironlog.v1.log', JSON.stringify([{ t: '2026-10-20T10:00:00.000Z', a: 'x', m: 'kept', v: 'r55' }, { t: 1 }, 'x', null])); }); } }); pages.push(R);
    R.ev = (f, a) => R.page.evaluate(f, a);
    const notes = await R.ev(() => { const L = window.__ironlog; return { meta: Object.keys(L.cloud.meta), editAt: L.cloud.editAt, last: L.cloud.last, log: L.logBuf.map(e => e.m) }; });
    ok(notes.meta.join() === 'core' && JSON.stringify(notes.editAt) === '{"core":7}' && notes.last === null, 'with a save on the phone, a sync note without a fingerprint or a time is dropped, an edit time that is no number too, and a last sync that is no number reads as none', notes);
    ok(notes.log.includes('kept') && notes.log.filter(m => /was not readable and was dropped/.test(m)).length === 2 && notes.log.length === 3, 'the error log keeps its real entries and drops the rest, and says which notes were dropped', notes.log);
    const kind = await R.ev(() => window.__ironlog.normalize({ cardio: [{ date: '2026-10-01', min: 20, kind: 'constructor', when: 'toString' }, { date: '2026-10-02', min: 20, kind: ['walk'], when: 'pre' }] }).cardio.map(c => [c.kind, c.when]));
    ok(JSON.stringify(kind) === '[["other","solo"],["other","pre"]]', 'a cardio kind or time that is not one of the list\'s keys reads as other and solo (r56 let a key Object has, and a list, through)', kind);
  }

  // ---- (4) The sync's status is one of its five states, and (5) a start time a Date cannot hold is dropped (308).
  {
    const cloud = cloudOf();
    const S = await phone(browser, cloud, 'u7'); pages.push(S);
    await wait(900);
    const seen = await S.ev(async () => { const L = window.__ironlog; const states = new Set([L.cloudState().status]); L.state.settings.timeBudget = 70; L.saveNow(); const t = setInterval(() => states.add(L.cloudState().status), 5); await L.flush(); await L.sync(); clearInterval(t); states.add(L.cloudState().status); return [...states]; });
    ok(seen.every(s => ['local', 'connecting', 'saving', 'synced', 'offline'].includes(s)) && seen.includes('synced'), 'the sync passes through its five states only', seen);
    const t = await S.ev(() => { const L = window.__ironlog; const st = L.normalize({ sessions: [{ id: 'x1', date: '2026-10-01', t: 1e17, ex: [{ exId: 'bench', sets: [{ w: 100, r: 8 }] }] }, { id: 'x2', date: '2026-10-01', t: 1760000000000, ex: [{ exId: 'bench', sets: [{ w: 100, r: 8 }] }] }], draft: { date: '2026-10-21', startedAt: 1e17, ex: [] } }); return [st.sessions.map(s => s.t), st.draft.startedAt]; });
    ok(JSON.stringify(t) === '[[null,1760000000000],null]'.replace('null,', 'null,') && t[0][0] === undefined && t[0][1] === 1760000000000 && t[1] === null, 'a start time a Date cannot hold is dropped, one it can hold is kept (r56 kept any positive number)', t);
  }

  const errors = pages.flatMap(P => P.errors);
  ok(!errors.length, 'no page errors', errors.slice(0, 4));
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
