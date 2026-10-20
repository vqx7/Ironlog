// r55b: a first sign-in on a phone that already holds a log, from the journey
// audit of r54 (PENDING 324): the standalone build against the stand-in
// Supabase server (tests/fake-supabase.js), as tests/accounts.js runs it. Each
// case fails on r54 (`node tests/r55b.js <a dist folder built from r54>`)
// and was the same on r53:
//   - a new phone's first run (a workout finished, a workout in progress, a
//     weigh-in typed on Set up), signed in to an account with a log without
//     the app being reopened first: kept and merged, where r54 replaced it
//     with the account's copy because the phone had held nothing when the
//     app started;
//   - the merge offers no Undo: undoing it put the phone's own copy back as
//     the truth, and the next sync deleted the account's other sessions on
//     every device;
//   - demo data on the phone never goes into the account;
//   - a problem report opened signed out comes back after signing in from it.
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./h');
const { start, quietHibp } = require('./fake-supabase');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r55b-'));
fs.cpSync(SRC, tmp, { recursive: true });

(async () => {
  const fake = await start(tmp);
  const ip = path.join(tmp, 'index.html');
  fs.writeFileSync(ip, H.cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
  const APP = fake.base + '/ironlog/';
  const browser = await H.engine.launch();
  const errors = [];
  async function device() {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await quietHibp(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push('page error: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push('console: ' + m.text()); });
    const ready = () => page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
    await page.goto(APP); await ready();
    await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); });
    const D = { ctx, page, ev: (f, a) => page.evaluate(f, a) };
    D.reload = async () => { await page.reload(); await ready(); await wait(800); };
    D.synced = () => page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).then(() => true, () => false);
    D.toast = () => page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? { text: t.innerText.replace(/\s+/g, ' '), undo: !!t.querySelector('[data-act="undo"]') } : null; });
    D.signIn = async (email) => {
      const ob = await page.evaluate(() => { const p = document.getElementById('obPage'); return p ? p.dataset.step : null; });
      if (ob) { await page.click('#obPage [data-act="obAcctBack"]'); await wait(200); await page.click('#obPage [data-act="acctOpen"][data-mode="signin"]'); }
      else { await page.click('#saveState'); await wait(200); await page.click('#modal [data-act="acctOpen"][data-mode="signin"]'); }
      await wait(200);
      await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', 'correct horse 9');
      await page.click('#modal [data-act="acctSubmit"]');
      await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
      await D.synced(); await wait(1500);
    };
    return D;
  }
  const docs = (email, pre) => { const u = fake.users.get(email); return u ? [...fake.rows.values()].filter(r => r.user_id === u.id && new RegExp('/' + pre + '-\\d').test(r.path)) : []; };
  const sessIn = email => docs(email, 's').flatMap(r => { try { return (JSON.parse(r.data.json).sessions || []).map(s => (s.demo ? 'demo' : s.id)); } catch (e) { return []; } });
  const bwIn = email => docs(email, 'b').flatMap(r => { try { return (JSON.parse(r.data.json).bodyweights || []).map(b => (b.demo ? 'demo' : b.date)); } catch (e) { return []; } });
  const mk = (id, date, name) => ({ id, date, dayIdx: 0, dayId: null, dayName: name, routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: 100, r: 5, rir: 2, warm: false, drop: false }] }] });
  // An account with a log, made on another phone.
  async function account(email, sessions) {
    fake.addUser(email, 'correct horse 9');
    const O = await device();
    await O.ev(s => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.sessions = s; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); L.render(); }, sessions);
    await O.signIn(email);
    return O;
  }
  // A new phone's first run: no account yet, a ready-made routine picked.
  async function firstRun() {
    const A = await device(); await wait(600);
    await A.page.click('#obPage [data-act="obAcctLater"]'); await wait(300);
    return A;
  }

  // ---- A workout finished on a new phone's first run, then a sign-in in the same run.
  {
    const O = await account('one@example.com', [mk('old1', '2026-10-01', 'Old phone day')]); await O.ctx.close();
    const A = await firstRun();
    await A.page.click('#obPage [data-act="obSample"]'); await wait(300);
    await A.page.click('#modal [data-act="tplPick"][data-k="ul4"]'); await wait(400);
    await A.page.click('#view [data-act="startSession"]'); await wait(400);
    await A.page.fill('#view .sg input[data-f="w"][data-b="0"][data-s="0"]', '135'); await A.page.locator('#view .sg input[data-f="w"][data-b="0"][data-s="0"]').blur(); await wait(200);
    for (let s = 0; s < 3; s++) { await A.page.click(`#view [data-act="sDone"][data-b="0"][data-s="${s}"]`); await wait(200); }
    await A.ev(() => window.__ironlog.ACT.finish()); await wait(300);
    for (let k = 0; k < 4 && await A.ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'confirm'); k++) { await A.page.click('#modal [data-act="mOk"]'); await wait(400); }
    await A.ev(() => window.__ironlog.ACT.mClose()); await wait(200);
    const mine = await A.ev(() => window.__ironlog.state.sessions.map(s => s.id));
    await A.signIn('one@example.com');
    const after = await A.ev(() => window.__ironlog.state.sessions.map(s => s.id).sort());
    const acc = sessIn('one@example.com').sort(); const t = await A.toast();
    ok(mine.length === 1 && after.includes('old1') && after.includes(mine[0]) && acc.includes(mine[0]) && acc.includes('old1'), 'a workout finished on a new phone\'s first run, then signed in to an account with a log, without reopening the app: both are kept, on the phone and in the account (r54 replaced the workout with the account\'s log)', { mine, after, acc });
    ok(t && /Merged/.test(t.text) && !t.undo, 'the phone says it merged, and offers no Undo (r54 offered one that deleted the account\'s sessions)', t);
    await A.ctx.close();
  }
  // ---- A workout in progress and a weigh-in typed on Set up are kept the same way.
  {
    const O = await account('two@example.com', [mk('old2', '2026-10-01', 'Old phone day')]); await O.ctx.close();
    const A = await firstRun();
    await A.page.fill('#obBw', '180'); await A.page.locator('#obBw').blur(); await wait(300);
    await A.page.click('#obPage [data-act="obSample"]'); await wait(300);
    await A.page.click('#modal [data-act="tplPick"][data-k="ul4"]'); await wait(400);
    await A.page.click('#view [data-act="startSession"]'); await wait(400);
    for (let s = 0; s < 2; s++) { await A.page.fill(`#view .sg input[data-f="w"][data-b="0"][data-s="${s}"]`, '135'); await A.page.click(`#view [data-act="sDone"][data-b="0"][data-s="${s}"]`); await wait(200); }
    const bw0 = await A.ev(() => window.__ironlog.state.bodyweights.length);
    await A.signIn('two@example.com');
    const st = await A.ev(() => { const L = window.__ironlog; const d = L.state.draft; return { draft: d ? d.ex[0].sets.filter(x => x.done).length : null, bw: L.state.bodyweights.length, sessions: L.state.sessions.map(s => s.id) }; });
    ok(bw0 === 1 && st.draft === 2 && st.bw === 1 && st.sessions.includes('old2'), 'a workout in progress (2 sets ticked) and the weigh-in typed on Set up are kept through the sign-in, beside the account\'s log (r54 lost both)', { bw0, st });
    ok(bwIn('two@example.com').length === 1, 'and the weigh-in reaches the account', bwIn('two@example.com'));
    await A.ctx.close();
  }
  // ---- Undo is not offered on a merge, and the account keeps every session of every phone.
  {
    const O = await account('three@example.com', [mk('acc1', '2026-10-01', 'Account one'), mk('acc2', '2026-10-03', 'Account two')]);
    const B = await device();
    await B.ev(s => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.sessions = s; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); }, [mk('ph1', '2026-10-05', 'Phone one')]);
    await B.reload();
    await B.signIn('three@example.com');
    const t = await B.toast(); const undo = await B.ev(() => window.__ironlog.undoStack.length);
    await B.ev(() => window.__ironlog.flush()); await wait(800);
    await O.ev(() => window.__ironlog.sync()); await wait(1000);
    const other = await O.ev(() => window.__ironlog.state.sessions.map(s => s.id).sort().join());
    ok(t && /Merged/.test(t.text) && !t.undo && undo === 0 && sessIn('three@example.com').sort().join() === 'acc1,acc2,ph1' && other === 'acc1,acc2,ph1', 'a phone with its own log signs in to an account with a log: merged, no Undo offered or kept in Settings, and the account and the other phone hold all three sessions (r54\'s Undo deleted acc1 and acc2 everywhere)', { t, undo, acc: sessIn('three@example.com'), other });
    await B.ctx.close(); await O.ctx.close();
  }
  // ---- Demo data on the phone never reaches the account.
  {
    const O = await account('four@example.com', [mk('real1', '2026-10-01', 'Real day')]); await O.ctx.close();
    const A = await firstRun();
    await A.page.fill('#obBw', '180'); await A.page.locator('#obBw').blur(); await wait(300);
    await A.page.click('#obPage [data-act="demoLoad"]'); await wait(200); await A.page.click('#modal [data-act="mOk"]'); await wait(600);
    await A.reload();
    const demo0 = await A.ev(() => window.__ironlog.state.sessions.filter(s => s.demo).length);
    await A.signIn('four@example.com');
    const st = await A.ev(() => { const s = window.__ironlog.state; return { demo: s.sessions.filter(x => x.demo).length, demoBw: s.bodyweights.filter(b => b.demo).length, real: s.sessions.filter(x => !x.demo).map(x => x.id).join(), bw: s.bodyweights.filter(b => !b.demo).length }; });
    const acc = sessIn('four@example.com'), accBw = bwIn('four@example.com');
    ok(demo0 > 0 && st.demo === 0 && st.demoBw === 0 && st.real === 'real1' && st.bw === 1 && !acc.includes('demo') && !accBw.includes('demo') && accBw.length === 1, 'demo data loaded on a new phone with a weigh-in typed, the app reopened, then a sign-in: the demo stays out of the phone\'s log and the account, the weigh-in is kept (r54 uploaded ' + demo0 + ' demo sessions)', { demo0, st, acc: acc.filter(x => x === 'demo').length, accBw });
    await A.ctx.close();
  }

  // ---- A problem report opened signed out: signing in from it goes back to it (the journey audit of r54, D13).
  {
    fake.addUser('five@example.com', 'correct horse 9');
    const A = await device();
    await A.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
    await A.page.click('#saveState'); await wait(200); await A.page.click('#modal [data-act="fbOpen"]'); await wait(250);
    const before = await A.ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind; });
    await A.page.click('#modal [data-act="acctOpen"][data-mode="signin"]'); await wait(200);
    await A.page.fill('#modal [data-abind="email"]', 'five@example.com'); await A.page.fill('#modal [data-abind="pw"]', 'correct horse 9');
    await A.page.click('#modal [data-act="acctSubmit"]');
    await A.page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 }); await A.synced(); await wait(800);
    const m = await A.ev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, send: !!document.querySelector('#modal [data-act="fbSend"]') } : null; });
    ok(before === 'feedback' && m && m.kind === 'feedback' && m.send, 'Report a problem opened signed out, then Sign in from it: signed in, and the report is back, ready to write and send (r54 closed it)', { before, m });
    await A.ctx.close();
  }

  ok(!errors.length, 'no page errors', errors.slice(0, 5));
  await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
