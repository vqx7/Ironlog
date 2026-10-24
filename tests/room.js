// The room a log kept aside leaves (PENDING 333). A phone's browser storage is
// small (localStorage is about 5 MB a site, on an iPhone too), and a log kept
// aside for another account (r56.1, "Use this account's log") is a whole copy
// of a log. It must never crowd out the lifter's own: the next save of the log
// in use must not fail for it, then or years later as that log grows. Undo's
// copies of the log live in IndexedDB for the same reason (storage.ts). Each
// size below is a share of the room this browser measures, so the suite reads
// the same in Chromium and in WebKit:
//   (1) a phone on account A with a log of 40% of the room signs in to account
//       B, whose log is 62% of it, and uses B's log: A's log is kept aside,
//       B's log is saved on the phone (the save does not fail), and the room
//       localStorage holds is B's log and the notes, not A's copy too;
//   (2) every later save of B's log succeeds, and a reload opens on it;
//   (3) signing in to A again brings A's log back from aside, saved on the
//       phone, and B's goes aside in its turn, nothing lost either way.
// `node tests/room.js <page>` runs it on another build.
const { open, engine } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 800) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || 'index.html';
const CLOCK = '2026-10-21T10:00:00';

function cloudOf() {
  const store = new Map(); const who = { now: null };
  const setup = uid => async (ctx, page) => {
    who.now = uid;
    await page.exposeFunction('__who', () => who.now);
    await page.exposeFunction('__dbGet', p => (store.has(p) ? store.get(p) : null));
    await page.exposeFunction('__dbSet', (p, v) => { store.set(p, v); return true; });
    await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
    await page.addInitScript(() => {
      window.claude = { use: async k => {
        if (k === 'user') return { id: async () => window.__who() };
        if (k === 'db') return { doc: p => ({ get: async () => { const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); return true; } }), collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
        return null;
      } };
    });
  };
  return { store, setup, signIn: uid => { who.now = uid; } };
}
// A log of about `chars` characters as saved: one session a day from 2020 on, six lifts of four sets, each set with its row id.
const FILL = ([chars, tag]) => {
  const L = window.__ironlog; const S = L.state; S.settings.onboarded = true;
  const mk = i => ({ id: tag + i, date: new Date(Date.UTC(2020, 0, 1) + i * 864e5).toISOString().slice(0, 10), dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', notes: '', free: true,
    ex: ['bench', 'bbRow', 'ohp', 'pullup', 'dbCurl', 'pushdown'].map(x => ({ exId: x, note: '', rr: null, sets: [0, 1, 2, 3].map(k => ({ w: 100 + k, r: 8, rir: 2, warm: false, drop: false, rid: `${tag}${i}x${k}${x}` })) })) });
  const one = JSON.stringify(mk(0)).length;
  S.sessions = []; for (let i = 0, n = Math.floor((chars - 50000) / one); i < n; i++) S.sessions.push(mk(i));
  L.state = L.normalize(S); L.invalidate(); L.saveNow();
  return L.state.sessions.length;
};
// How much this browser lets a site keep in localStorage, in characters.
const ROOM = () => { let lo = 0, hi = 1 << 24; while (hi - lo > 4096) { const m = (lo + hi) >> 1; try { localStorage.setItem('__room', 'x'.repeat(m)); lo = m; } catch (e) { hi = m; } } localStorage.removeItem('__room'); return lo; };
const held = () => Object.keys(localStorage).reduce((a, k) => a + k.length + (localStorage.getItem(k) || '').length, 0);

(async () => {
  const browser = await engine.launch();
  const pages = [];
  const cloud = cloudOf();
  const P0 = await open(FILE, { browser, clock: CLOCK, realStarter: true }); pages.push(P0);
  const Q = await P0.page.evaluate(ROOM); await P0.ctx.close();
  console.log(`ok   this browser keeps ${Q} characters a site in localStorage (measured)`);

  // Account B's log, 62% of the room, made on another phone.
  const B = await open(FILE, { browser, clock: CLOCK, realStarter: true, setup: cloud.setup('acctB') }); pages.push(B);
  await wait(900);
  const nB = await B.page.evaluate(FILL, [Math.round(0.62 * Q), 'b']);
  await B.page.evaluate(() => window.__ironlog.flush()); await wait(300); await B.ctx.close();

  // ---- (1) This phone on account A, 40% of the room, signs in to B and uses B's log.
  const P = await open(FILE, { browser, clock: CLOCK, realStarter: true, setup: cloud.setup('acctA') }); pages.push(P);
  P.ev = (f, a) => P.page.evaluate(f, a);
  await wait(900);
  const nA = await P.ev(FILL, [Math.round(0.40 * Q), 'a']);
  await P.ev(() => window.__ironlog.flush()); await wait(300);
  await P.ev(() => window.__ironlog.cloudStop()); cloud.signIn('acctB');
  P.ev(() => { window.__ironlog.cloudInit(); }); await wait(1500);
  ok((await P.ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind)) === 'confirm', 'set up: signing in to B on a phone holding A\'s log asks first', { nA, nB });
  await P.page.click('#modal [data-act="mAlt"]'); await wait(2500);
  const r1 = await P.ev(() => { const L = window.__ironlog; const saved = JSON.parse(localStorage.getItem('ironlog.v1') || '{}'); return { on: L.cloudState().acct, inUse: L.state.sessions.length, saved: (saved.sessions || []).length, aside: L.asideList() }; });
  ok(r1.on === 'acctB' && r1.inUse === nB && r1.aside.some(a => a.acct === 'acctA' && a.sessions === nA), 'Use this account\'s log: the phone is on B\'s log and A\'s is kept aside', r1);
  ok(r1.saved === nB, 'B\'s log is saved on the phone: the save does not fail for the log kept aside', r1);
  const h1 = await P.ev(held);
  ok(h1 < 0.75 * Q, 'localStorage holds the log in use and the notes, not the copy kept aside too', { held: h1, room: Q });

  // ---- (2) Every later save of B's log succeeds, and a reload opens on it.
  const r2 = await P.ev(() => { const L = window.__ironlog; L.state.settings.userName = 'V'; L.saveNow(); const saved = JSON.parse(localStorage.getItem('ironlog.v1') || '{}'); return { name: saved.settings && saved.settings.userName, sessions: (saved.sessions || []).length }; });
  ok(r2.name === 'V' && r2.sessions === nB, 'the next save of B\'s log succeeds', r2);
  await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(2000);
  const r3 = await P.ev(() => { const L = window.__ironlog; return { sessions: L.state.sessions.length, name: L.state.settings.userName, aside: L.asideList() }; });
  ok(r3.sessions === nB && r3.name === 'V' && r3.aside.some(a => a.acct === 'acctA' && a.sessions === nA), 'a reload opens on B\'s log, and A\'s is still kept aside', r3);

  // ---- (3) Signing in to A again: A's log comes back, saved, and B's goes aside.
  await P.ev(() => window.__ironlog.cloudStop()); cloud.signIn('acctA');
  P.ev(() => { window.__ironlog.cloudInit(); }); await wait(1500);
  if ((await P.ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind)) === 'confirm') { await P.page.click('#modal [data-act="mAlt"]'); }
  await wait(2500);
  const r4 = await P.ev(() => { const L = window.__ironlog; const saved = JSON.parse(localStorage.getItem('ironlog.v1') || '{}'); return { on: L.cloudState().acct, inUse: L.state.sessions.length, saved: (saved.sessions || []).length, aside: L.asideList() }; });
  ok(r4.on === 'acctA' && r4.inUse === nA && r4.saved === nA && r4.aside.some(a => a.acct === 'acctB' && a.sessions === nB) && !r4.aside.some(a => a.acct === 'acctA'), 'signing in to A again: A\'s log is back and saved on the phone, B\'s kept aside in its turn', r4);

  const errors = pages.flatMap(X => X.errors).filter(e => !/exceeded the quota|QuotaExceeded/i.test(e));
  ok(!errors.length, 'no page errors', errors.slice(0, 4));
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
