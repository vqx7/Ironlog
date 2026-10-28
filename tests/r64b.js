// r64b: the r63 audit's account, sync-status and update findings (F3 to F7,
// F10), on the built app against the stand-in Supabase server
// (tests/fake-supabase.js), as tests/r55-1b.js runs its cases. Each case
// fails on r63 (`node tests/r64b.js <a dist folder built from r63>`) unless
// it says it is a guard:
//   F3  a request to the account server that never answers (a token refresh
//       held by the route below) stalls the account no longer: it reads as
//       signed in and waiting, Delete and Sign out answer within the limit,
//       "Signed in. Syncing your log." is said only when the sync starts, the
//       app syncs again by itself once the server answers, and a phone not
//       yet set up reaches its first page rather than the logo for good;
//   F4  Update works on an app installed in the same visit;
//   F5  offline and signed in, the menu says Offline and the sync waits for
//       the network, rather than saying Syncing at every retry;
//   F6  offline with an expired sign-in, the phone says it is signed in and
//       waiting, and syncs by itself once online;
//   F7  Sign out with no signal says the phone is signed out;
//   F10 a sign-in the server refuses mid-workout says to sign in again (and
//       a refresh with no answer is never read as one).
// The log stays on the phone throughout, checked in each case.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const H = require('./h');
const { start, quietHibp } = require('./fake-supabase');
const { NET_MS } = require('../scripts/config');
const wait = ms => new Promise(r => setTimeout(r, ms));
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r64b-'));
fs.cpSync(SRC, tmp, { recursive: true });
const PW = 'correct horse 9';
const REFRESH = '**/auth/v1/token?grant_type=refresh_token*';
// What the menu button says (its label), and the toasts a page has shown, each with whether the sync was on as it was said.
const MENU = () => { const el = document.getElementById('saveState'); return el ? (el.getAttribute('aria-label') || '').replace(/^Menu\. /, '') : null; };

(async () => {
  const fake = await start(tmp);
  const ip = path.join(tmp, 'index.html');
  fs.writeFileSync(ip, H.cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
  const APP = fake.base + '/ironlog/';
  const browser = await H.engine.launch();
  // Each case collects its own lines, printed in a fixed order at the end, since the cases run side by side (most of their time is waiting out the limit).
  const results = [];
  function report(name) {
    const lines = [];
    results.push({ name, lines });
    // R64B_SHOW=1 prints what each check read on a pass too (the times it measured).
    return (c, m, x) => lines.push([!!c, m + ((c && !process.env.R64B_SHOW) || x === undefined ? '' : ' ' + JSON.stringify(x))]);
  }
  async function device(ok, o = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: o.sw ? 'allow' : 'block' });
    await quietHibp(ctx);
    await ctx.addInitScript(() => {
      window.__toasts = [];
      const hook = () => {
        const el = document.getElementById('toast');
        if (!el) { setTimeout(hook, 20); return; }
        new MutationObserver(() => {
          if (el.hidden) return;
          const L = window.__ironlog, t = el.innerText.replace(/\s+/g, ' ').trim(), last = window.__toasts[window.__toasts.length - 1];
          if (t && (!last || last.text !== t || Date.now() - last.at > 3000)) window.__toasts.push({ at: Date.now(), text: t, on: !!(L && L.cloudState().on) });
        }).observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
      };
      hook();
    });
    const page = await ctx.newPage();
    const st = { offline: false, errors: [] };
    page.on('pageerror', e => { if (st.offline && H.offlineLoad(e.message)) return; st.errors.push('page error: ' + e.message); });
    await page.goto(APP); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    if (o.sw) await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    await page.evaluate(fresh => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); if (!fresh) { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); } }, !!o.fresh);
    const D = { ctx, page, st, ev: (f, a) => page.evaluate(f, a) };
    D.ready = () => page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
    D.menu = () => page.evaluate(MENU);
    D.toasts = () => page.evaluate(() => window.__toasts || []);
    D.user = () => page.evaluate(() => { const u = window.__ironlog.acctUser(); return u ? u.email : null; });
    D.cloud = () => page.evaluate(() => window.__ironlog.cloudState());
    D.synced = (ms = 15000) => page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: ms }).then(() => true, () => false);
    D.signIn = async (email, from) => {
      if (from) await page.click(from); else await page.evaluate(() => window.__ironlog.ACT.acctOpen({ dataset: { mode: 'signin' } }));
      await wait(200);
      await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', PW);
      await page.click('#modal [data-act="acctSubmit"]');
      await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: NET_MS + 10000 }).catch(() => {});
    };
    // A session logged on this phone, saved as a tap saves it.
    D.log = id => page.evaluate(id => { const L = window.__ironlog; const R = L.state.routines[0]; L.state.sessions.push({ id, date: '2026-10-20', dayIdx: 0, dayId: R.days[0].id, dayName: 'Day', routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2 }] }] }); L.invalidate(); L.saveNow(); }, id);
    D.has = id => page.evaluate(id => window.__ironlog.state.sessions.some(s => s.id === id) && (localStorage.getItem('ironlog.v1') || '').includes(id), id);
    // The phone's sign-in as if it had sat closed past its expiry: the server's token expired, and the phone's record of it says so too.
    D.expire = async email => { fake.expireTokens(email); await page.evaluate(() => { const k = 'ironlog.auth'; const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 10; localStorage.setItem(k, JSON.stringify(s)); }); };
    D.openData = () => page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    D.text = sel => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
    // The first toast after `since` other than the ones listed, waited for up to ms.
    D.answer = async (since, ms, not) => { const end = Date.now() + ms; while (Date.now() < end) { const t = (await D.toasts()).find(x => x.at >= since && !not.includes(x.text)); if (t) return t; await wait(250); } return null; };
    D.close = () => H.settle(ctx.close(), 'a context');
    return D;
  }
  const rows = email => { const u = fake.users.get(email); return u ? [...fake.rows.values()].filter(r => r.user_id === u.id) : []; };
  const sessIn = email => rows(email).filter(r => /\/s-\d/.test(r.path)).flatMap(r => { try { return (JSON.parse(r.data.json).sessions || []).map(s => s.id); } catch (e) { return []; } });
  const bwIn = email => rows(email).filter(r => /\/b-\d/.test(r.path)).flatMap(r => { try { return (JSON.parse(r.data.json).bodyweights || []).map(s => s.id); } catch (e) { return []; } });
  // R64B_ONLY=f7,f10 runs only the cases named (their variable names below), for a quicker rerun of one finding.
  const only = (name, fn) => (!process.env.R64B_ONLY || process.env.R64B_ONLY.split(',').includes(name) ? fn() : Promise.resolve());
  const until = async (fn, ms, step = 500) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await wait(step); } };
  // A phone signed in and synced with one session logged, then relaunched with its sign-in expired while the token refresh never answers.
  async function stalled(ok, email, id) {
    fake.addUser(email, PW);
    const D = await device(ok);
    await D.signIn(email); await D.synced();
    await D.log(id); await D.ev(() => window.__ironlog.flush()); await D.synced();
    ok(sessIn(email).includes(id), `${email}: set up, signed in and synced with ${id} in the account`);
    D.held = () => {};
    await D.ctx.route(REFRESH, D.held);
    await D.expire(email);
    await D.page.reload(); await D.ready();
    D.t0 = Date.now();
    return D;
  }

  // ---- F3: a refresh that never answers, opened after the sign-in expired.
  const f3 = only('f3', async () => {
    const ok = report('F3: a request that never answers');
    const A = await stalled(ok, 'stall@example.com', 'sA1');
    // Delete my account, tapped at once: it answers within the limit (r63: silent for over 60 s). The function is not deployed, so nothing can be deleted.
    await A.ev(() => window.__ironlog.ACT.acctDelete()); await wait(150);
    const tDel = Date.now();
    await A.page.click('#modal [data-act="mOk"]');
    const del = await A.answer(tDel, NET_MS + 8000, ['Deleting your account']);
    ok(del && del.at - tDel <= NET_MS + 2500, 'Delete my account with the server not answering: it answers within the limit', del && { text: del.text, s: (del.at - tDel) / 1000 });
    ok(!del || /No answer\. Check your connection and try again\./.test(del.text), 'and it says there was no answer, in the words the app uses for that', del);
    // Within twice the limit (the library's start tries its refresh twice), it reads as signed in and waiting, not signed out.
    await until(async () => (await A.user()) && /^Offline/.test(await A.menu()), 2 * NET_MS + 5000 - (Date.now() - A.t0));
    const s1 = { user: await A.user(), menu: await A.menu(), cloud: await A.cloud(), s: (Date.now() - A.t0) / 1000 };
    ok(s1.user === 'stall@example.com' && s1.menu === 'Offline, saved on this device', 'with the refresh unanswered, it reads as signed in and waiting (r63: signed out)', s1);
    ok(await A.has('sA1'), 'the log stays on the phone while it waits');
    // The server answers again: a session logged now reaches the account by itself, with no relaunch.
    await A.ctx.unroute(REFRESH, A.held);
    await A.log('sA2');
    const tUp = Date.now();
    const up = await until(() => sessIn('stall@example.com').includes('sA2'), 150000, 1000);
    ok(up, 'once the server answers again, the app syncs again by itself, no relaunch (r63: never)', { s: (Date.now() - tUp) / 1000, menu: await A.menu(), cloud: await A.cloud() });
    ok(await A.has('sA1') && await A.has('sA2'), 'and both sessions are on the phone');
    ok(!A.st.errors.length, 'no page errors', A.st.errors.slice(0, 3));
    await A.close();
  });

  // ---- F3: signing in again while the refresh does not answer.
  const f3s = only('f3s', async () => {
    const ok = report('F3: signing in again while stalled');
    const B = await stalled(ok, 'again@example.com', 'sB1');
    await wait(1000);
    await B.signIn('again@example.com');
    const said = (await B.toasts()).filter(t => /^Signed in\. Syncing your log\./.test(t.text));
    ok(said.every(t => t.on), '"Signed in. Syncing your log." is said only when the sync has started (r63: said with the sync off)', said);
    const going = await B.synced(NET_MS + 15000);
    ok(going || !said.length, 'and when it is said, the log syncs', { cloud: await B.cloud(), menu: await B.menu() });
    await B.log('sB2');
    ok(await until(() => sessIn('again@example.com').includes('sB2'), 30000, 500), 'a session logged after it reaches the account', sessIn('again@example.com'));
    ok(await B.has('sB1') && await B.has('sB2'), 'the log stays on the phone');
    ok(!B.st.errors.length, 'no page errors', B.st.errors.slice(0, 3));
    await B.close();
  });

  // ---- F3: Sign out while the refresh does not answer.
  const f3o = only('f3o', async () => {
    const ok = report('F3: Sign out while stalled');
    const C = await stalled(ok, 'out@example.com', 'sC1');
    await wait(1000);
    await C.ev(() => window.__ironlog.ACT.acctSignOut()); await wait(150);
    const sheet = await C.text('#modal');
    // Keep a copy on this phone, so the log stays whatever happens.
    const tOut = Date.now();
    await C.page.click('#modal [data-act="mAlt"]');
    const out = await C.answer(tOut, NET_MS + 8000, []);
    ok(out && out.at - tOut <= NET_MS + 2500 && /^Signed out/.test(out.text), 'Sign out, a copy kept, with the server not answering: it signs out within the limit and says so (r63: silent for over 60 s)', { sheet, out, s: out && (out.at - tOut) / 1000 });
    const after = { user: await C.user(), on: (await C.cloud()).on, kept: await C.ev(() => !!localStorage.getItem('ironlog.auth')) };
    ok(!after.user && !after.on && !after.kept, 'and the phone is signed out: no account, no sync, no sign-in kept', after);
    ok(await C.has('sC1'), 'the copy kept holds the log');
    ok(!C.st.errors.length, 'no page errors', C.st.errors.slice(0, 3));
    await C.close();
  });

  // ---- Found building F3's fix: a first pull with no answer, then a retry with nothing to send, said Synced and never read the account.
  const f3p = only('f3p', async () => {
    const ok = report('F3: the retry after a pull with no answer');
    fake.addUser('pull@example.com', PW);
    const X = await device(ok), Y = await device(ok);
    await X.signIn('pull@example.com'); await X.synced();
    await Y.signIn('pull@example.com'); await Y.synced();
    const hold = () => {};
    await X.ctx.route('**/rest/v1/docs*', hold);
    await X.page.reload(); await X.ready();
    // While this phone's first pull waits, the other phone logs a session.
    await Y.log('sY1'); await Y.ev(() => window.__ironlog.flush()); await Y.synced();
    ok(sessIn('pull@example.com').includes('sY1'), 'the other phone logged sY1 into the account');
    await until(async () => (await X.cloud()).status === 'offline', NET_MS + 8000);
    await X.ctx.unroute('**/rest/v1/docs*', hold);
    const seen = [];
    const got = await until(async () => { seen.push(await X.menu()); return X.ev(() => window.__ironlog.state.sessions.some(s => s.id === 'sY1')); }, 40000);
    const early = seen.slice(0, -1).includes('Synced');
    ok(got && !early, 'once the server answers, the retry reads the account: the other phone\'s session comes in, and Synced is not said before it (r63: Synced at the retry, the account never read)', { got, said: [...new Set(seen)] });
    ok(!X.st.errors.length && !Y.st.errors.length, 'no page errors', [...X.st.errors, ...Y.st.errors].slice(0, 3));
    await X.close(); await Y.close();
  });

  // ---- F3: a phone signed in on the first page but not set up yet, relaunched with an expired sign-in while the server does not answer.
  const f3b = only('f3b', async () => {
    const ok = report('F3: the splash');
    fake.addUser('first@example.com', PW);
    const D = await device(ok, { fresh: true });
    await D.signIn('first@example.com', '#obPage [data-act="acctOpen"][data-mode="signin"]'); await D.synced();
    const step0 = await D.ev(() => { const p = document.getElementById('obPage'); return p ? p.dataset.step : null; });
    ok(step0 === 'start', 'signed in on the first page, the phone is on Set up', step0);
    const hold = () => {};
    await D.ctx.route('**/auth/v1/**', hold); await D.ctx.route('**/rest/v1/**', hold);
    await D.expire('first@example.com');
    await D.page.reload(); await D.ready();
    const t0 = Date.now();
    const seen = () => D.ev(() => !document.querySelector('.ob-splash') && (!!document.getElementById('obPage') || getComputedStyle(document.querySelector('.tabs')).display !== 'none'));
    const cleared = await until(seen, 45000);
    const v = await D.ev(() => ({ splash: !!document.querySelector('.ob-splash'), step: (document.getElementById('obPage') || { dataset: {} }).dataset.step || null }));
    ok(cleared, 'the splash gives way to the first page or the app (r63: still the logo after 45 s)', { ...v, s: (Date.now() - t0) / 1000 });
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  });

  // ---- F5: offline and signed in, the menu says Offline and waits for the network.
  const f5 = only('f5', async () => {
    const ok = report('F5: offline status');
    fake.addUser('net@example.com', PW);
    const D = await device(ok);
    await D.signIn('net@example.com'); await D.synced();
    await D.ctx.setOffline(true); D.st.offline = true;
    await D.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'wN1', date: L.today(), kg: 80 }); L.saveNow(); });
    await wait(2500);
    const seq = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 45000) { seq.push(await D.menu()); await wait(500); }
    const kinds = [...new Set(seq)];
    ok(kinds.length === 1 && kinds[0] === 'Offline, saved on this device', 'offline with a change to send: the menu says Offline throughout, never Syncing for a retry that cannot reach anything (r63: Syncing at each retry)', { kinds, syncing: seq.filter(x => x === 'Syncing').length / 2 + ' s' });
    ok(await D.ev(() => window.__ironlog.state.bodyweights.some(b => b.id === 'wN1')), 'the weigh-in stays on the phone');
    await D.ctx.setOffline(false); D.st.offline = false;
    const back = await until(() => bwIn('net@example.com').includes('wN1'), 20000);
    ok(back && await D.synced(5000), 'back online, it syncs by itself and says Synced', { menu: await D.menu() });
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  });

  // ---- F6: offline with an expired sign-in, the phone still says it is signed in and waiting.
  const f6 = only('f6', async () => {
    const ok = report('F6: offline with an expired sign-in');
    fake.addUser('away@example.com', PW);
    const D = await device(ok, { sw: true });
    await D.signIn('away@example.com'); await D.synced();
    await D.log('sE1'); await D.ev(() => window.__ironlog.flush()); await D.synced();
    await D.ctx.setOffline(true); D.st.offline = true;
    await D.expire('away@example.com');
    await D.page.reload(); await D.ready(); await wait(5000);
    const menu = await D.menu();
    await D.openData();
    const panel = await D.text('#acctPanel'), info = await D.text('#syncInfo');
    const v = { user: await D.user(), menu, panel, info };
    ok(v.user === 'away@example.com' && menu === 'Offline, saved on this device' && /^Signed in as away@example\.com/.test(panel || '') && /Waiting to sync/.test(info || '') && /It reaches your account when you are back online\./.test(info || ''), 'it says it is signed in and waiting, in the words a signed-in phone uses offline (r63: "Saved on this phone only. Create an account")', v);
    ok(await D.has('sE1'), 'the log stays on the phone');
    await D.log('sE2');
    await D.ctx.setOffline(false); D.st.offline = false;
    const tOn = Date.now();
    const up = await until(() => sessIn('away@example.com').includes('sE2'), 150000, 1000);
    ok(up, 'back online, it syncs by itself', { s: (Date.now() - tOn) / 1000, menu: await D.menu(), cloud: await D.cloud() });
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  });

  // ---- F7: Sign out with no signal says the phone is signed out.
  const f7 = only('f7', async () => {
    const ok = report('F7: Sign out offline');
    fake.addUser('nosig@example.com', PW);
    const D = await device(ok);
    await D.signIn('nosig@example.com'); await D.synced();
    await D.log('sF1'); await D.ev(() => window.__ironlog.flush()); await D.synced();
    await D.ctx.setOffline(true); D.st.offline = true;
    await D.openData();
    await D.page.click('#acctPanel [data-act="acctSignOut"]'); await wait(150);
    const t = Date.now();
    await D.page.click('#modal [data-act="mAlt"]');
    const out = await D.answer(t, 10000, []);
    const after = { user: await D.user(), on: (await D.cloud()).on, kept: await D.ev(() => !!localStorage.getItem('ironlog.auth')) };
    ok(out && out.text === 'Signed out. A copy stays on this phone.' && !after.user && !after.kept, 'Sign out, a copy kept, with no signal: it says it signed out, as it does with signal (r63: "No connection. Try again when you have signal.")', { out, after });
    ok(await D.has('sF1'), 'the copy kept holds the log');
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  });

  // ---- F10: a sign-in the server refuses mid-workout says to sign in again; a refresh with no answer is never read as one.
  async function midWorkout(ok, email) {
    fake.addUser(email, PW);
    const D = await device(ok);
    await D.signIn(email); await D.synced();
    await D.ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); const di = String(R.days.findIndex(x => !x.rest && x.items.length)); L.ui.tab = 'today'; L.ACT.startSession({ dataset: { day: di } }); });
    await wait(300); await D.ev(() => window.__ironlog.flush()); await D.synced();
    return D;
  }
  const tick = D => D.ev(() => { const L = window.__ironlog; const x = L.state.draft.ex[0].sets[0]; x.w = 60; x.r = 8; L.ACT.sDone({ dataset: { b: '0', s: '0' } }); });
  const ticked = D => D.ev(() => { const d = window.__ironlog.state.draft; const s = JSON.parse(localStorage.getItem('ironlog.v1') || '{}').draft; return !!(d && d.ex[0].sets[0].done && s && s.ex[0].sets[0].done); });
  const f10 = only('f10', async () => {
    const ok = report('F10: a refused sign-in');
    const D = await midWorkout(ok, 'refused@example.com');
    fake.expireTokens('refused@example.com');
    await D.ctx.route(REFRESH, r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }) }));
    const t = Date.now();
    await tick(D);
    const said = await D.answer(t, 15000, []);
    ok(said && /Sign in again to sync/.test(said.text), 'the server refuses the sign-in mid-workout: a toast says to sign in again (r63: nothing)', { said, toasts: await D.toasts() });
    ok(await ticked(D), 'the ticked set stays on the phone');
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  });
  const f10g = only('f10g', async () => {
    const ok = report('F10: a refresh with no answer is not a refused sign-in');
    const D = await midWorkout(ok, 'blip@example.com');
    fake.expireTokens('blip@example.com');
    await D.ctx.route(REFRESH, r => r.abort('failed'));
    const t = Date.now();
    await tick(D);
    // The write waits out the limit for the refresh (the library tries it again for up to 30 s), then the sync reads the failure.
    await until(async () => ['offline', 'local'].includes((await D.cloud()).status), NET_MS + 15000);
    // And through its first retry (5 s on), which meets the same refresh.
    await wait(10000);
    const said = (await D.toasts()).filter(x => x.at >= t && /in again/.test(x.text));
    const c = await D.cloud();
    ok(!said.length && c.on && c.status === 'offline', 'a refresh that gets no answer after a refused request: no "sign in again", and the sync waits to retry (r63: read as a refused sign-in, the sync switched off)', { said, c });
    ok(await ticked(D), 'the ticked set stays on the phone');
    ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
    await D.close();
  });

  // ---- F4: Update on an app installed in this same visit (served as tests/update.js serves two builds in turn).
  const f4 = only('f4', async () => {
    const ok = report('F4: Update after a first install');
    const V1 = path.join(tmp, 'v1'), V2 = path.join(tmp, 'v2');
    fs.cpSync(SRC, V1, { recursive: true }); fs.cpSync(SRC, V2, { recursive: true });
    const BUILD_RE = /<meta name="app-build" content="([^"]+)">/;
    const v1 = (fs.readFileSync(path.join(V1, 'index.html'), 'utf8').match(BUILD_RE) || [])[1];
    const v2 = v1 + '-next';
    for (const f of ['index.html', 'sw.js']) { const p = path.join(V2, f); const s = fs.readFileSync(p, 'utf8').split(v1).join(v2); fs.writeFileSync(p, f.endsWith('.html') ? H.cspFix(s) : s); }
    let root = V1;
    const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(root, p.replace(/^\/ironlog\//, '/'));
      if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' }); fs.createReadStream(f).pipe(res);
    });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/ironlog/`;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    // The account library talks to the real project's address in this build; nothing here needs it.
    await ctx.route(/supabase\.co/, r => r.abort());
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let navs = 0; page.on('load', () => { navs++; });
    const ready = () => page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    const ver = () => page.evaluate(() => (document.querySelector('meta[name="app-build"]') || {}).content);
    const bar = () => page.evaluate(() => { const b = document.getElementById('updbar'); return !!b && !b.hidden && b.getBoundingClientRect().height > 0; });
    await page.goto(base); await ready();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
    await wait(800);
    ok(navs === 1 && (await ver()) === v1 && !(await bar()), 'a first install: no reload of its own and no update prompt', { navs });
    await page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.bodyweights.push({ id: 'wU1', date: L.today(), kg: 77 }); L.saveNow(); L.render(); });
    root = V2;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForFunction(() => { const b = document.getElementById('updbar'); return b && !b.hidden; }, null, { timeout: 15000 }).catch(() => {});
    ok(await bar(), 'a publish in the same visit: "Update ready" appears');
    await wait(1500);
    ok(navs === 1 && (await ver()) === v1, 'and nothing reloads before Update is tapped', { navs });
    await page.click('#updbar [data-act="appUpdate"]');
    await page.waitForFunction(v => (document.querySelector('meta[name="app-build"]') || {}).content === v && window.__ironlog, v2, { timeout: 15000 }).catch(() => {});
    await ready().catch(() => {}); await wait(1000);
    ok((await ver()) === v2 && navs === 2, 'Update, tapped on an app installed in this visit, switches to the new version, reloading once (r63: the bar went and the old build stayed)', { ver: await ver(), navs });
    ok(await page.evaluate(() => window.__ironlog.state.bodyweights.some(b => b.id === 'wU1')), 'the log is there after the update');
    ok(!errors.length, 'no page errors', errors.slice(0, 3));
    await H.settle(ctx.close(), 'the update context'); server.close();
  });

  await Promise.all([f3, f3s, f3o, f3p, f3b, f5, f6, f7, f10, f10g, f4].map(p => p.catch(e => { results.push({ name: 'a case threw', lines: [[false, String(e && e.stack || e)]] }); })));
  let fails = 0;
  for (const r of results) {
    console.log('# ' + r.name);
    for (const [c, m] of r.lines) { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); }
  }
  await H.settle(browser.close(), 'the browser'); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  process.exit(fails ? 1 : 0);
})();
