// Two devices writing the same sync document at the same moment (2.28, the 2.27 review's 2.27-F1): the real build
// (supabase-js plus scripts/cloud-supabase.js) against the stand-in Supabase server, two browser contexts as two
// phones on one account. One device's write is held on its way to the server while the other device writes the same
// document; when it is let go it must not replace the other device's write. Before 2.28 every write was an upsert
// with no condition on what the row held when it was read, so the held write landed over the other and one session
// was lost from both phones and the account, with nothing said (reproduced on 2.27 by the review's script).
// Cases: a month document both devices already have; a document neither has yet (both create it); a row last
// written by a 2.27 phone (no write mark), changed between the read and the write; a server that refuses every
// conditional write for a while (the sync says it is not synced, keeps both logs, and syncs once it can).
// With them, two more of the 2.27 review's findings on the same stand-in server: a workout in progress too large to
// sync is named as that, not as a month of sessions (2.27-F2, case 5), and an account error the app has no words
// for is shown in plain words, the server's own sentence kept only in the error log (2.27-F7, case 6).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { engine } = require('./h');
const { start, quietHibp } = require('./fake-supabase');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
require('./h').build();
const DIST = path.join(__dirname, '..', 'dist');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-race-'));
fs.cpSync(DIST, tmp, { recursive: true });

(async () => {
  const fake = await start(tmp);
  const ip = path.join(tmp, 'index.html');
  const html = fs.readFileSync(ip, 'utf8');
  fs.writeFileSync(ip, require('./h').cspFix(html.replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
  const APP = fake.base + '/ironlog/';
  const browser = await engine.launch();
  async function device(name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await quietHibp(ctx);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(name + ': ' + e.message));
    await page.goto(APP);
    await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
    return { name, ctx, page, errors, ev: (f, a) => page.evaluate(f, a) };
  }
  const status = D => D.ev(() => window.__ironlog.cloudState().status);
  const synced = D => D.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).then(() => true, () => false);
  async function signIn(D, email) {
    await D.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
    await D.page.click('#acctPanel [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
    await D.page.fill('#modal [data-abind="email"]', email); await D.page.fill('#modal [data-abind="pw"]', 'correct horse 1');
    await D.page.click('#modal [data-act="acctSubmit"]');
    await D.page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
    return synced(D);
  }
  const logOn = (D, id, date, w) => D.ev(([id, date, w]) => { const L = window.__ironlog; const R = L.state.routines[0]; L.state.sessions.push({ id, date, dayIdx: 0, dayId: R.days[0].id, dayName: 'Chest', routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w, r: 8, rir: 2 }] }] }); L.invalidate(); L.saveNow(); L.render(); }, [id, date, w]);
  const ids = D => D.ev(() => window.__ironlog.state.sessions.map(s => s.id).sort().join());
  const has = (list, id) => list.split(',').includes(id);
  const serverIds = uid => { const out = []; for (const r of fake.rows.values()) if (r.user_id === uid && /\/s-\d/.test(r.path)) { try { for (const s of JSON.parse(r.data.json).sessions || []) out.push(s.id); } catch (e) { /* not a session document */ } } return out.sort().join(); };
  /* Holds this device's writes to the docs table (anything but a read) until let go, so the other device can write
     in between: the moment the review's script made, at any speed of connection. */
  async function holdWrites(D) {
    let release; const held = new Promise(r => { release = r; }); const st = { count: 0 };
    await D.ctx.route('**/rest/v1/docs**', async r => { if (r.request().method() !== 'GET') { st.count++; await held; } return r.continue(); });
    return { st, release: async () => { release(); await wait(50); await D.ctx.unroute('**/rest/v1/docs**'); } };
  }
  async function round(A, B) {
    for (let i = 0; i < 2; i++) { await A.ev(() => window.__ironlog.sync()); await wait(700); await B.ev(() => window.__ironlog.sync()); await wait(700); }
  }

  // ---- 1. A month document both phones already have: B's write held while A writes the same month ----
  {
    const user = fake.addUser('one@example.com', 'correct horse 1');
    const A = await device('A'), B = await device('B');
    ok(await signIn(A, 'one@example.com'), '1: A signs in and syncs');
    await logOn(A, 's0', '2026-09-25', 100); await A.ev(() => window.__ironlog.flush()); await wait(500);
    ok(await signIn(B, 'one@example.com'), '1: B signs in and syncs');
    await B.ev(() => window.__ironlog.sync()); await wait(500);
    ok(has(await ids(B), 's0') && serverIds(user.id) === 's0', '1: both phones and the account start with s0', { B: await ids(B), server: serverIds(user.id) });
    const h = await holdWrites(B);
    await logOn(B, 'sB', '2026-09-26', 110);
    const bFlush = B.ev(() => window.__ironlog.flush()); await wait(800);
    ok(h.st.count >= 1, '1: B read the month and its write is on its way, held', h.st);
    await logOn(A, 'sA', '2026-09-27', 120); await A.ev(() => window.__ironlog.flush()); await wait(600);
    ok(serverIds(user.id) === 's0,sA', '1: A wrote the month first', serverIds(user.id));
    await h.release(); await bFlush; await wait(1200);
    await round(A, B);
    const a = await ids(A), b = await ids(B), s = serverIds(user.id);
    ok(has(a, 'sA') && has(a, 'sB'), '1: A keeps its own session and gets B\'s', a);
    ok(has(b, 'sA') && has(b, 'sB'), '1: B keeps its own session and gets A\'s', b);
    ok(s === 's0,sA,sB', '1: the account holds all three sessions', s);
    ok(await status(A) === 'synced' && await status(B) === 'synced', '1: both phones say synced', [await status(A), await status(B)]);
    ok(!A.errors.length && !B.errors.length, '1: no page errors', [...A.errors, ...B.errors]);
    await A.ctx.close(); await B.ctx.close();
  }

  // ---- 2. A document neither phone has yet: both create the same new month at once ----
  {
    const user = fake.addUser('two@example.com', 'correct horse 1');
    const A = await device('A'), B = await device('B');
    ok(await signIn(A, 'two@example.com') && await signIn(B, 'two@example.com'), '2: both phones sign in and sync');
    const h = await holdWrites(B);
    await logOn(B, 'nB', '2026-10-05', 110);
    const bFlush = B.ev(() => window.__ironlog.flush()); await wait(800);
    await logOn(A, 'nA', '2026-10-06', 120); await A.ev(() => window.__ironlog.flush()); await wait(600);
    ok(serverIds(user.id) === 'nA', '2: A created the month first', serverIds(user.id));
    await h.release(); await bFlush; await wait(1200);
    await round(A, B);
    const a = await ids(A), b = await ids(B), s = serverIds(user.id);
    ok(has(a, 'nA') && has(a, 'nB') && has(b, 'nA') && has(b, 'nB'), '2: both phones hold both sessions', { a, b });
    ok(s === 'nA,nB', '2: the account holds both', s);
    ok(!A.errors.length && !B.errors.length, '2: no page errors', [...A.errors, ...B.errors]);
    await A.ctx.close(); await B.ctx.close();
  }

  // ---- 3. A row a 2.27 phone wrote (no write mark), changed by a 2.27 phone between this phone's read and write ----
  {
    const user = fake.addUser('three@example.com', 'correct horse 1');
    const A = await device('A');
    ok(await signIn(A, 'three@example.com'), '3: A signs in and syncs');
    await logOn(A, 'o0', '2026-08-05', 100); await A.ev(() => window.__ironlog.flush()); await wait(600);
    const key = [...fake.rows.keys()].find(k => k.startsWith(user.id + ' ') && k.endsWith('/s-2026-08-1'));
    ok(!!key, '3: the month is in the account', [...fake.rows.keys()]);
    // The row as a 2.27 phone writes it: no write mark.
    const r0 = fake.rows.get(key); const d0 = Object.assign({}, r0.data); delete d0.w; fake.rows.set(key, Object.assign({}, r0, { data: d0 }));
    const h = await holdWrites(A);
    await logOn(A, 'oA', '2026-08-06', 110);
    const aFlush = A.ev(() => window.__ironlog.flush()); await wait(800);
    ok(h.st.count >= 1, '3: A read the month and its write is held', h.st);
    // A 2.27 phone writes the month meanwhile: its session added, a new time, still no write mark.
    const cur = fake.rows.get(key); const chunk = JSON.parse(cur.data.json);
    chunk.sessions.push({ id: 'oOld', date: '2026-08-07', dayIdx: 0, dayName: 'Chest', notes: '', ex: [{ exId: 'bench', sets: [{ w: 90, r: 8, rir: 2 }] }] });
    fake.rows.set(key, Object.assign({}, cur, { data: { v: 1, at: Number(cur.data.at) + 7, et: Number(cur.data.at) + 7, json: JSON.stringify(chunk) } }));
    await h.release(); await aFlush; await wait(1200);
    await A.ev(() => window.__ironlog.sync()); await wait(1000);
    const a = await ids(A), s = serverIds(user.id);
    ok(has(s, 'oOld') && has(s, 'oA') && has(s, 'o0'), '3: the account keeps the 2.27 phone\'s session and A\'s', s);
    ok(has(a, 'oOld') && has(a, 'oA'), '3: A holds both', a);
    ok(!A.errors.length, '3: no page errors', A.errors);
    await A.ctx.close();
  }

  // ---- 4. Every conditional write refused for a while: not synced, nothing lost, then synced ----
  {
    const user = fake.addUser('four@example.com', 'correct horse 1');
    const A = await device('A');
    ok(await signIn(A, 'four@example.com'), '4: A signs in and syncs');
    await logOn(A, 'c0', '2026-07-05', 100); await A.ev(() => window.__ironlog.flush()); await wait(600);
    fake.raceAlways(true);
    await logOn(A, 'cA', '2026-07-06', 110); await A.ev(() => window.__ironlog.flush()); await wait(1500);
    const st = await status(A);
    ok(st !== 'synced', '4: while every write is refused as already changed, the phone does not say synced', st);
    ok(has(await ids(A), 'cA'), '4: the session stays on the phone', await ids(A));
    ok(!has(serverIds(user.id), 'cA'), '4: and is not in the account yet', serverIds(user.id));
    fake.raceAlways(false);
    ok(await A.page.waitForFunction(() => window.__ironlog.cloudState().status === 'synced', null, { timeout: 30000 }).then(() => true, () => false), '4: once writes go through, the phone syncs on its own and says synced');
    ok(serverIds(user.id) === 'c0,cA', '4: the account then holds both sessions', serverIds(user.id));
    ok(!A.errors.length, '4: no page errors', A.errors);
    await A.ctx.close();
  }

  // ---- 5. A workout in progress too large to sync: said as that ----
  {
    fake.addUser('five@example.com', 'correct horse 1');
    const A = await device('A');
    ok(await signIn(A, 'five@example.com'), '5: A signs in and syncs');
    await A.ev(() => { const L = window.__ironlog; const R = L.state.routines[0]; L.state.draft = L.normalize({ draft: { date: '2026-11-05', id: 'big', dayIdx: 0, dayName: 'Chest', routineId: R.id, notes: 'n'.repeat(260000), ex: [], cardio: [] } }).draft; L.saveNow(); });
    await A.ev(() => window.__ironlog.flush()); await wait(1200);
    const c = await A.ev(() => window.__ironlog.cloudState());
    ok(c.status !== 'synced' && /workout in progress is too large/.test(String(c.err)), '5: 2.27-F2: a workout in progress over the size cap is said to be the workout, not a month of sessions (2.27: "One month of sessions is too large")', { status: c.status, err: c.err });
    await A.ctx.close();
  }

  // ---- 6. An account error the app has no words for ----
  {
    fake.addUser('six@example.com', 'correct horse 1');
    const A = await device('A');
    await A.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
    await A.page.click('#acctPanel [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
    fake.failOnce('/auth/v1/token', 500, { code: 500, error_code: 'unexpected_failure', msg: 'pq: relation "auth.refresh_tokens" does not exist' });
    await A.page.fill('#modal [data-abind="email"]', 'six@example.com'); await A.page.fill('#modal [data-abind="pw"]', 'correct horse 1');
    await A.page.click('#modal [data-act="acctSubmit"]');
    await A.page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
    const r = await A.ev(() => ({ sheet: (document.querySelector('#modal') || {}).innerText || '', log: JSON.stringify(window.__ironlog.logBuf) }));
    ok(!/pq:|relation|refresh_tokens/.test(r.sheet) && /Something went wrong with your account/.test(r.sheet), '6: 2.27-F7: an account error with no words of its own is shown in plain words, not the server\'s sentence (2.27: "pq: relation ...")', r.sheet.slice(0, 300));
    ok(/server: pq: relation/.test(r.log), '6: 2.27-F7: the server\'s sentence is kept in the error log, for a problem report', r.log.slice(-400));
    await A.ctx.close();
  }

  await browser.close(); await fake.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
