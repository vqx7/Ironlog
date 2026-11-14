// Saving and sync on the built app against the stand-in account server (tests/fake-supabase.js): the rules whose
// checks need the real account service, its sign-in sheet, its callbacks and its sign-out (the spec "Saving and sync",
// S-1 to S-33, in the project's claude/ironlog-spec-storage-sync-draft2.md; tests/storage-sync.js holds the rest, and
// tests/accounts.js the account itself). Each section is a suite moved here in 2.51 with every check kept, each
// check named with its rule; the header of each says what it was written to show and on which build it failed.
// ACCOUNT_ONLY=r55b,r80b runs some sections.
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./h');
const { start, quietHibp } = require('./fake-supabase');
const { NET_MS } = require('../scripts/config');
const fails = [];
const okTop = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const okAs = rule => (c, m, x) => okTop(c, `${rule}: ${m}`, x);
const wait = ms => new Promise(r => setTimeout(r, ms));
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const ONLY = process.env.ACCOUNT_ONLY ? process.env.ACCOUNT_ONLY.split(',') : null;

/* ---------- S-13: a first sign-in on a phone that already holds a log (moved from tests/r55b.js in 2.51, every check kept) ----------
   r55b: a first sign-in on a phone that already holds a log, from the journey
   audit of r54 (PENDING 324): the standalone build against the stand-in
   Supabase server (tests/fake-supabase.js), as tests/accounts.js runs it. Each
   case fails on r54 (`node tests/r55b.js <a dist folder built from r54>`)
   and was the same on r53:
     - a new phone's first run (a workout finished, a workout in progress, a
       weigh-in typed on Set up), signed in to an account with a log without
       the app being reopened first: kept and merged, where r54 replaced it
       with the account's copy because the phone had held nothing when the
       app started;
     - the merge offers no Undo: undoing it put the phone's own copy back as
       the truth, and the next sync deleted the account's other sessions on
       every device;
     - demo data on the phone never goes into the account;
     - a problem report opened signed out comes back after signing in from it;
     - from the independent review of r55: demo data stays out of an empty
       account too, a routine built before a first sign-in is kept, and of two
       workouts in progress the other device's ticked sets are saved.
     - from the second review of r55 (each failing on the build it reviewed,
       `node tests/r55b.js <a dist folder built from 3825898>`): a backup
       restored or demo data loaded while signed out keeping a copy forgets the
       sync notes, so signing back in deletes nothing and uploads no demo data;
       the other device's workout kept at a first sign-in keeps its check-in,
       its start and its cardio, and is in that device's History once after it
       is finished there.
*/
async function from_r55b() {
  let ok = okAs('S-13');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r55b-'));
  fs.cpSync(SRC, tmp, { recursive: true });
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
      /* The message that matches, once it shows: since 2.48 news from sync waits for the sign-in's own message ("Signed in.
         Syncing your log.") to go, and is never lost (toast.ts, NEW-118), so it is read when it comes, up to 8 s. */
      D.toastWait = async re => { let t = null; for (let k = 0; k < 40; k++) { t = await D.toast(); if (t && re.test(t.text)) return t; await wait(200); } return t; };
      D.signIn = async (email) => {
        const ob = await page.evaluate(() => { const p = document.getElementById('obPage'); return p ? p.dataset.step : null; });
        if (ob) { if (await page.$('#obPage [data-act="obAcctBack"]')) { await page.click('#obPage [data-act="obAcctBack"]'); await wait(200); } await page.click('#obPage [data-act="acctOpen"][data-mode="signin"]'); }
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
      const acc = sessIn('one@example.com').sort(); const t = await A.toastWait(/Merged/);
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
      const t = await B.toastWait(/Merged/); const undo = await B.ev(() => window.__ironlog.undoStack.length);
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

    // The independent review of r55 (each found on r55 and on r54 too).
    const draftOf = D => D.ev(() => { const d = window.__ironlog.state.draft; return d ? { id: d.id, name: d.dayName, done: d.ex.reduce((a, b) => a + b.sets.filter(x => x.done).length, 0) } : null; });
    const answer = async D => { for (let k = 0; k < 3 && await D.ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'confirm'); k++) { await D.page.click('#modal [data-act="mOk"]'); await wait(300); } };
    // ---- Demo data on a phone, then a sign-in to a new account with nothing in it: the demo stays out of it too.
    {
      fake.addUser('six@example.com', 'correct horse 9');
      const A = await firstRun();
      await A.page.click('#obPage [data-act="demoLoad"]'); await wait(200); await A.page.click('#modal [data-act="mOk"]'); await wait(600);
      const demo0 = await A.ev(() => window.__ironlog.state.sessions.filter(s => s.demo).length);
      await A.signIn('six@example.com');
      const acc = sessIn('six@example.com'), bw = bwIn('six@example.com');
      const ph = await A.ev(() => window.__ironlog.state.sessions.filter(s => s.demo).length);
      ok(demo0 > 0 && !acc.includes('demo') && !bw.includes('demo') && ph === 0, 'demo data loaded on a new phone, then a sign-in to an empty account: none of it reaches the account, and the phone says it was cleared (r54 and the reviewed r55 uploaded the demo\'s ' + demo0 + ' sessions)', { demo0, acc: acc.length, accDemo: acc.filter(x => x === 'demo').length, phone: ph });
      await A.ctx.close();
    }
    // ---- A routine built on a new phone, nothing logged, then a sign-in to an account with a log: the routine is kept beside the account's.
    {
      const O = await account('seven@example.com', [mk('acc7', '2026-10-01', 'Old phone day')]); await O.ctx.close();
      const A = await firstRun();
      await A.page.click('#obPage [data-act="obOwn"]'); await wait(400);
      await A.ev(() => { const L = window.__ironlog; const R = L.activeRoutine(); R.name = 'My new plan'; L.ui.bRoutine = R.id; L.ui.bTarget = 0; L.render(); L.ACT.libAdd({ dataset: { ex: 'bench' } }); L.saveNow(); });
      await A.signIn('seven@example.com');
      const after = await A.ev(() => { const s = window.__ironlog.state; return { routines: s.routines.map(r => r.name), sessions: s.sessions.map(x => x.id) }; });
      await A.ev(() => window.__ironlog.flush()); await wait(800);
      const core = (() => { const u = fake.users.get('seven@example.com'); const r = [...fake.rows.values()].find(x => x.user_id === u.id && /\/core$/.test(x.path)); return r ? JSON.parse(r.data.json) : null; })();
      ok(after.routines.includes('My new plan') && after.sessions.includes('acc7') && core && core.routines.some(r => r.name === 'My new plan'), 'a routine built on a new phone with nothing logged, then a sign-in to an account with a log: it is kept, beside the account\'s log, and synced (r54 replaced it with the account\'s copy)', { after, account: core && core.routines.map(r => r.name) });
      await A.ctx.close();
    }
    // ---- A workout in progress on each of two phones at a first sign-in: neither's ticked sets are lost.
    {
      const O = await account('eight@example.com', [mk('acc8', '2026-10-01', 'Old phone day')]);
      await O.ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
      await O.page.click('#view [data-act="startSession"]'); await wait(400);
      for (let s = 0; s < 2; s++) { await O.page.fill(`#view .sg input[data-f="w"][data-b="0"][data-s="${s}"]`, '225'); await O.page.click(`#view [data-act="sDone"][data-b="0"][data-s="${s}"]`); await wait(200); await answer(O); }
      await O.ev(() => window.__ironlog.flush()); await wait(1200);
      const o0 = await draftOf(O);
      const B = await firstRun();
      await B.page.click('#obPage [data-act="obSample"]'); await wait(300);
      await B.page.click('#modal [data-act="tplPick"][data-k="full3"]'); await wait(400);
      await B.page.click('#view [data-act="startSession"]'); await wait(400);
      await B.page.fill('#view .sg input[data-f="w"][data-b="0"][data-s="0"]', '95'); await B.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(200); await answer(B);
      const b0 = await draftOf(B);
      await B.signIn('eight@example.com');
      const t = await B.toastWait(/other device is saved in History/);
      await B.ev(() => window.__ironlog.flush()); await wait(1000);
      const b1 = await draftOf(B);
      const kept = await B.ev(id => { const s = window.__ironlog.state.sessions.find(x => x.id === id); return s ? s.ex.reduce((a, b) => a + b.sets.length, 0) : 0; }, o0 && o0.id);
      await O.ev(() => window.__ironlog.sync()); await wait(1500);
      const oKept = await O.ev(id => { const s = window.__ironlog.state.sessions.find(x => x.id === id); return s ? s.ex.reduce((a, b) => a + b.sets.length, 0) : 0; }, o0 && o0.id);
      ok(o0 && o0.done === 2 && b0 && b0.done === 1 && b1 && b1.id === b0.id && b1.done === 1 && kept === 2 && oKept === 2 && sessIn('eight@example.com').includes(o0.id) && t && /other device is saved in History/.test(t.text),
        'a workout in progress on the account\'s phone (2 sets ticked) and on a new phone (1 set) at the new phone\'s first sign-in: the new phone\'s stays in progress, the other\'s 2 sets are saved in History on both phones and the account, and the toast says so (r54 lost one of the two)', { o0, b0, b1, kept, oKept, toast: t });
      await B.ctx.close(); await O.ctx.close();
    }

    ok = okAs('S-22');
    // ---- Signed out keeping a copy, then signed back in: edits and deletions made meanwhile on another phone stand, and what
    // this phone logged while signed out is kept (the end-to-end audit of r55: the kept copy undid the edit and brought the
    // deleted session and weigh-in back on every device, since signing back in was read as a first link).
    {
      const A = await account('nine@example.com', [mk('k1', '2026-10-01', 'One'), mk('k2', '2026-10-03', 'Two')]);
      await A.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'w1', date: '2026-10-02', kg: 80, demo: false }, { id: 'w2', date: '2026-10-04', kg: 81, demo: false }); L.saveNow(); });
      await A.ev(() => window.__ironlog.flush()); await wait(1200);
      const B = await device(); await B.signIn('nine@example.com');
      await A.ev(() => window.__ironlog.ACT.acctSignOut()); await wait(300);
      await A.ev(() => { const b = [...document.querySelectorAll('#modal button')].find(x => /keep a copy/i.test(x.innerText)); b.click(); }); await wait(2000);
      await B.ev(() => { const L = window.__ironlog; const S = L.state; S.sessions = S.sessions.filter(x => x.id !== 'k1'); const k2 = S.sessions.find(x => x.id === 'k2'); k2.ex[0].sets[0].r = 4; S.bodyweights = S.bodyweights.filter(b => b.id !== 'w1'); L.saveNow(); });
      await B.ev(() => window.__ironlog.flush()); await wait(1200);
      await A.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.saveNow(); }, mk('k3', '2026-10-05', 'Three, signed out'));
      await A.signIn('nine@example.com');
      await A.ev(() => window.__ironlog.flush()); await wait(1200); await B.ev(() => window.__ironlog.sync()); await wait(1500);
      const read = D => D.ev(() => { const S = window.__ironlog.state; return { s: S.sessions.map(x => x.id + ':' + x.ex[0].sets[0].r).sort().join(), w: S.bodyweights.map(b => b.id).sort().join() }; });
      const a = await read(A), b = await read(B), acc = sessIn('nine@example.com').sort().join(), accW = bwIn('nine@example.com').sort().join();
      ok(a.s === 'k2:4,k3:5' && b.s === a.s && a.w === 'w2' && b.w === 'w2' && acc === 'k2,k3' && accW === '2026-10-04', 'a phone signed out keeping its copy, another phone deleting a session and a weigh-in and changing a set to 4 reps, then the first phone logging a session and signing back in: the edit and the deletions stand, the new session is kept, on both phones and in the account (the reviewed r55 put the old copy back everywhere)', { a, b, acc, accW });
      await A.ctx.close(); await B.ctx.close();
    }
    // ---- Erase everything while signed out keeping a copy does not erase the account at the next sign-in.
    {
      const A = await account('ten@example.com', [mk('e1', '2026-10-01', 'One')]);
      await A.ev(() => window.__ironlog.flush()); await wait(1000);
      await A.ev(() => window.__ironlog.ACT.acctSignOut()); await wait(300);
      await A.ev(() => { const b = [...document.querySelectorAll('#modal button')].find(x => /keep a copy/i.test(x.innerText)); b.click(); }); await wait(2000);
      await A.ev(() => { const L = window.__ironlog; L.ACT.resetAll(); }); await wait(200); await A.page.click('#modal [data-act="mOk"]'); await wait(300);
      await A.signIn('ten@example.com');
      const a = await A.ev(() => window.__ironlog.state.sessions.map(x => x.id).join());
      ok(a === 'e1' && sessIn('ten@example.com').join() === 'e1', 'signed out keeping a copy, Erase everything on this phone, then signed back in: the account keeps its log and the phone gets it back (a guard: the copy erased is this phone\'s only)', { a, acc: sessIn('ten@example.com') });
      await A.ctx.close();
    }

    // ---- The second review of r55: a log replaced while signed out keeping a copy (a backup restored, demo data loaded) is no
    // longer that copy, so the sync notes kept with it are forgotten and the next sign-in is a first link, which removes nothing.
    // The reviewed r55 merged the restored backup against the notes, so the sessions the backup did not hold were deleted from the
    // account and every phone, and loaded demo data went into the account.
    const signOutKeep = async D => { await D.ev(() => window.__ironlog.ACT.acctSignOut()); await wait(300); await D.ev(() => { const b = [...document.querySelectorAll('#modal button')].find(x => /keep a copy/i.test(x.innerText)); b.click(); }); await wait(2000); };
    {
      const A = await account('eleven@example.com', [mk('k1', '2026-10-01', 'One'), mk('k2', '2026-10-03', 'Two'), mk('k3', '2026-10-05', 'Three')]);
      await A.ev(() => window.__ironlog.flush()); await wait(1000);
      const B = await device(); await B.signIn('eleven@example.com');
      const backup = await A.ev(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); s.sessions = s.sessions.filter(x => x.id === 'k1'); s.draft = null; return JSON.stringify({ app: 'ironlog', state: s }); });
      await signOutKeep(A);
      await A.ev(t => window.__ironlog.importData(t), backup); await wait(250); await A.page.click('#modal [data-act="mOk"]'); await wait(1200);
      const restored = await A.ev(() => window.__ironlog.state.sessions.map(x => x.id).sort().join());
      await B.ev(x => { const L = window.__ironlog; L.state.sessions.push(x); L.saveNow(); }, mk('k4', '2026-10-06', 'Four, on B')); await B.ev(() => window.__ironlog.flush()); await wait(1200);
      await A.signIn('eleven@example.com');
      await A.ev(() => window.__ironlog.flush()); await wait(1200); await B.ev(() => window.__ironlog.sync()); await wait(1500);
      const ids = D => D.ev(() => window.__ironlog.state.sessions.map(x => x.id).sort().join());
      const a = await ids(A), b = await ids(B), acc = sessIn('eleven@example.com').sort().join();
      ok(restored === 'k1' && a === 'k1,k2,k3,k4' && b === a && acc === a, 'signed out keeping a copy, a backup with one of three sessions restored on that phone, a session logged on the other, then signed back in: every session stays in the account and on both phones (the reviewed r55 deleted the two the backup did not hold, everywhere)', { restored, a, b, acc });
      await A.ctx.close(); await B.ctx.close();
    }
    {
      const A = await account('twelve@example.com', [mk('d1', '2026-10-01', 'One')]);
      await A.ev(() => window.__ironlog.flush()); await wait(1000);
      await signOutKeep(A);
      await A.ev(() => window.__ironlog.ACT.demoLoad()); await wait(250); await A.page.click('#modal [data-act="mOk"]'); await wait(800);
      const demoHere = await A.ev(() => window.__ironlog.state.sessions.filter(x => x.demo).length);
      await A.signIn('twelve@example.com');
      await A.ev(() => window.__ironlog.flush()); await wait(1200);
      const acc = sessIn('twelve@example.com'), accW = bwIn('twelve@example.com');
      ok(demoHere > 10 && acc.join() === 'd1' && !accW.includes('demo'), 'signed out keeping a copy, demo data loaded, then signed back in: the account gets none of the demo sessions or weigh-ins and keeps its own (the reviewed r55 uploaded 27 demo sessions and 28 weigh-ins)', { demoHere, acc: acc.length, demoW: accW.filter(x => x === 'demo').length });
      await A.ctx.close();
    }
    // ---- The other phone's workout kept at a first sign-in is saved as Finish saves it: with its check-in, its start and its
    // cardio (the reviewed r55 dropped all three). And when that phone then ticks a set before it pulls and finishes, the
    // workout is in its History once, its cardio once (the reviewed r55 held it twice, under one id, until a reload).
    {
      const O = await account('thirteen@example.com', [mk('acc13', '2026-10-01', 'Old phone day')]);
      await O.ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
      await O.page.click('#view [data-act="startSession"]'); await wait(400);
      for (let s = 0; s < 2; s++) { await O.page.fill(`#view .sg input[data-f="w"][data-b="0"][data-s="${s}"]`, '225'); await O.page.click(`#view [data-act="sDone"][data-b="0"][data-s="${s}"]`); await wait(200); await answer(O); }
      await O.ev(() => { const L = window.__ironlog; L.ACT.cDraftAdd({ dataset: { when: 'after' } }); L.state.draft.cardio[0].min = 20; L.state.draft.chk = { sleep: 1, energy: 2, joints: 3 }; L.saveNow(); });
      await O.ev(() => window.__ironlog.flush()); await wait(1200);
      // Its start: when the lifting began (NEW-129), as Finish would save it.
      const o0 = await O.ev(() => { const d = window.__ironlog.state.draft; return { id: d.id, cardio: d.cardio[0].id, t: d.begunAt || d.startedAt }; });
      const B = await firstRun();
      await B.page.click('#obPage [data-act="obSample"]'); await wait(300);
      await B.page.click('#modal [data-act="tplPick"][data-k="full3"]'); await wait(400);
      await B.page.click('#view [data-act="startSession"]'); await wait(400);
      await B.page.fill('#view .sg input[data-f="w"][data-b="0"][data-s="0"]', '95'); await B.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(200); await answer(B);
      await B.signIn('thirteen@example.com');
      await B.ev(() => window.__ironlog.flush()); await wait(1200);
      const onB = await B.ev(([id, cid]) => { const S = window.__ironlog.state; const x = S.sessions.find(q => q.id === id); return { chk: x && x.chk ? Object.values(x.chk).join() : null, t: x ? x.t || null : null, cardio: S.cardio.filter(c => c.id === cid).map(c => c.min).join() }; }, [o0.id, o0.cardio]);
      const accCardio = docs('thirteen@example.com', 's').flatMap(r => (JSON.parse(r.data.json).cardio || []).filter(c => c.id === o0.cardio)).length;
      ok(onB.chk === '1,2,3' && onB.t === o0.t && onB.cardio === '20' && accCardio === 1, 'a workout in progress on the account\'s phone with a check-in and 20 minutes of cardio, kept in History at a new phone\'s first sign-in: its check-in, its start and its cardio are kept with it, on the new phone and in the account (the reviewed r55 dropped all three)', { onB, accCardio, t: o0.t });
      // The account's phone ticks a third set before it pulls, then syncs and finishes.
      await O.page.fill('#view .sg input[data-f="w"][data-b="0"][data-s="2"]', '225'); await O.page.click('#view [data-act="sDone"][data-b="0"][data-s="2"]'); await wait(200); await answer(O);
      await wait(2500); await O.ev(() => window.__ironlog.sync()); await wait(1500);
      const stillO = await draftOf(O);
      await O.ev(() => window.__ironlog.ACT.finish()); await wait(300); await answer(O); await O.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await wait(300);
      const fin = await O.ev(([id, cid]) => { const S = window.__ironlog.state; return { copies: S.sessions.filter(q => q.id === id).map(q => q.ex.reduce((a, b) => a + b.sets.length, 0)).join(), cardio: S.cardio.filter(c => c.id === cid).length }; }, [o0.id, o0.cardio]);
      ok(stillO && stillO.id === o0.id && stillO.done === 3 && fin.copies === '3' && fin.cardio === 1, 'that phone then ticks a third set before it pulls and finishes: its History holds the workout once, with its 3 sets, and its cardio once (the reviewed r55 held it twice, 2 sets and 3, until a reload)', { stillO, fin });
      await B.ctx.close(); await O.ctx.close();
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
}

/* ---------- S-18: an account deleted on another phone; demo data while signed in (moved from tests/r55-1b.js in 2.51, every check kept) ----------
   r55-1b: r55.1's account cases, in the standalone build against the stand-in
   Supabase server (tests/fake-supabase.js), as tests/r55b.js runs them. Each
   case fails on r55 (`node tests/r55-1b.js <a dist folder built from r55>`)
   unless it says it guards what r55 did:
     - a phone still signed in to an account deleted on another phone says the
       account no longer exists, signs out with its sync notes forgotten, and
       keeps its log, where r55 kept saying the log would sync (V 2026-10-19);
       an expired sign-in is not read as a deleted account (a guard);
     - Load demo data while signed in is not done, and says why, so no demo
       data reaches the account (PENDING 328 d).
*/
async function from_r55_1b() {
  let ok = okAs('S-18');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r551b-'));
  fs.cpSync(SRC, tmp, { recursive: true });
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
      await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
      const D = { ctx, page, ev: (f, a) => page.evaluate(f, a) };
      D.toast = () => page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText.replace(/\s+/g, ' ') : null; });
      D.signIn = async email => {
        await page.click('#saveState'); await wait(200); await page.click('#modal [data-act="acctOpen"][data-mode="signin"]'); await wait(200);
        await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', 'correct horse 9');
        await page.click('#modal [data-act="acctSubmit"]');
        await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
        await page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
      };
      return D;
    }
    const docs = (email, pre) => { const u = fake.users.get(email); return u ? [...fake.rows.values()].filter(r => r.user_id === u.id && new RegExp('/' + pre + '-\\d').test(r.path)) : []; };
    const sessIn = email => docs(email, 's').flatMap(r => { try { return (JSON.parse(r.data.json).sessions || []).map(s => (s.demo ? 'demo' : s.id)); } catch (e) { return []; } });

    // ---- An account deleted on one phone, while another is still signed in to it.
    {
      fake.addUser('del@example.com', 'correct horse 9'); fake.deployDelete(true);
      const A = await device(), B = await device();
      await A.signIn('del@example.com'); await B.signIn('del@example.com');
      await A.ev(() => window.__ironlog.ACT.acctDelete()); await wait(200); await A.page.click('#modal [data-act="mOk"]'); await wait(1500);
      await B.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'w9', date: L.today(), kg: 80, demo: false }); L.saveNow(); });
      await B.ev(() => window.__ironlog.flush()).catch(() => {}); await wait(2000);
      const b = await B.ev(() => { const L = window.__ironlog; const c = L.cloudState(); return { on: c.on, acct: c.acct, user: !!L.acctUser(), w: L.state.bodyweights.some(x => x.id === 'w9') }; });
      const t = await B.toast();
      ok(!b.on && !b.acct && !b.user && b.w && /no longer exists/.test(t || '') && /stays on this phone/.test(t || ''), 'the other phone, on its next sync after the account was deleted: it says the account no longer exists and its log stays on the phone, is signed out with its sync notes forgotten, and keeps the weigh-in it just logged (r55 kept saying it would sync)', { b, t });
      await A.ctx.close(); await B.ctx.close();
    }
    // A guard: an expired sign-in is not a deleted account.
    {
      fake.addUser('exp@example.com', 'correct horse 9');
      const C = await device(); await C.signIn('exp@example.com');
      fake.expireTokens();
      await C.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'w8', date: L.today(), kg: 81, demo: false }); L.saveNow(); });
      await C.ev(() => window.__ironlog.flush()).catch(() => {}); await wait(2000);
      const t = await C.toast();
      ok(!/no longer exists/.test(t || ''), 'a guard: a sign-in whose token expired is never told the account no longer exists', { t });
      await C.ctx.close();
    }

    // ---- Load demo data while signed in: it asks to sign out first, and nothing of the demo reaches the account.
    {
      fake.addUser('demo@example.com', 'correct horse 9');
      const D = await device();
      await D.ev(() => { const L = window.__ironlog; L.state.sessions.push({ id: 'own1', date: '2026-10-01', dayIdx: 0, dayId: null, dayName: 'Own', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: 100, r: 5, rir: 2, warm: false, drop: false }] }] }); L.state = L.normalize(L.state); L.saveNow(); });
      await D.signIn('demo@example.com');
      await D.ev(() => window.__ironlog.ACT.demoLoad()); await wait(250);
      const q = { modal: await D.ev(() => !!window.__ironlog.ui.modal), toast: await D.toast() };
      await D.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mOk(); });
      await D.ev(() => window.__ironlog.flush()); await wait(1200);
      const demoHere = await D.ev(() => window.__ironlog.state.sessions.filter(x => x.demo).length);
      const acc = sessIn('demo@example.com');
      ok(!q.modal && /stays off your account/.test(q.toast || '') && demoHere === 0 && !acc.includes('demo') && acc.includes('own1'), 'Load demo data while signed in: it says demo data is for before signing in and stays off the account, and no demo session is loaded or reaches the account (r55 loaded 8 weeks of demo data and uploaded it)', { q, demoHere, acc: acc.length });
      await D.ctx.close();
    }

    ok(!errors.length, 'no page errors', errors.slice(0, 5));
    await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------- S-14: the other account's log question through the real account service (moved from tests/r56-1b.js in 2.51, every check kept) ----------
   r56-1b: r56.1's account question (PENDING 328 b) in the standalone build
   against the stand-in Supabase server (tests/fake-supabase.js), as
   tests/r55-1b.js runs its cases: a phone signed out of one account keeping
   its log, then signed in to another, is asked before anything merges, and
   each answer does here, through the real account service (the sign-in
   sheet, the auth callbacks, signOut), what tests/storage-sync.js (S-14) shows it does on
   the mock cloud. Each case fails on a dist built from r56
   (`node tests/r56-1b.js <that folder>`): r56 merged the log into the second
   account at once, unasked. The next two cases are from the stack's review
   (PENDING 333, F2 and F3) and fail on a dist built from the stack as
   reviewed (61f6b03). The last is from the review of the fix commit and fails
   on a dist built from it (d04ec3b) and from 61f6b03: the race is older.
*/
async function from_r56_1b() {
  let ok = okAs('S-14');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r561b-'));
  fs.cpSync(SRC, tmp, { recursive: true });
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
      await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
      const D = { ctx, page, ev: (f, a) => page.evaluate(f, a) };
      D.toast = () => page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText.replace(/\s+/g, ' ') : null; });
      D.modal = () => page.evaluate(() => { const m = window.__ironlog.ui.modal; const el = document.querySelector('#modal .sheet'); return m ? { kind: m.kind, title: m.title || '', buttons: el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()) : [] } : null; });
      D.cloud = () => page.evaluate(() => { const L = window.__ironlog; const c = L.cloudState(); return { on: c.on, status: c.status, acct: c.acct, user: L.acctUser() ? L.acctUser().email : null, sessions: L.state.sessions.map(s => s.id), aside: L.asideList().map(a => a.sessions), ob: document.body.classList.contains('obmode') }; });
      // Signs in through the sheet; with ask, waits for the question instead of the sync.
      D.signIn = async (email, ask) => {
        await page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
        await page.evaluate(() => window.__ironlog.ACT.acctOpen({ dataset: { mode: 'signin' } })); await wait(200);
        await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', 'correct horse 9');
        await page.click('#modal [data-act="acctSubmit"]');
        if (ask) { await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm'; }, null, { timeout: 15000 }); await wait(300); return; }
        await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
        await page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
      };
      // Sign out, keep a copy on this phone (the sheet's second button), or Sign out (its first: the log leaves the phone, the notes are forgotten).
      D.signOutKeep = async (which = 'mAlt') => {
        await page.evaluate(() => window.__ironlog.ACT.acctSignOut()); await wait(300);
        await page.click(`#modal [data-act="${which}"]`);
        await page.waitForFunction(() => !window.__ironlog.acctUser() && !window.__ironlog.cloudState().on, null, { timeout: 15000 }); await wait(400);
      };
      /* A second tab of the app on the same phone (its storage shared), as a page of this device. A slow one, as a tab in
         the background can be, hears the sign-out 400 ms late and the other tab's sync notes 1500 ms late, and until it
         hears them it reads the notes as it last wrote or heard them: a tab sees another's write only once it arrives. */
      D.tab = async slow => {
        const p2 = await ctx.newPage();
        p2.on('pageerror', e => errors.push('page error: ' + e.message));
        if (slow) await p2.addInitScript(() => {
          const K = 'ironlog.v1.sync', get = Storage.prototype.getItem, set = Storage.prototype.setItem;
          let seen;
          Storage.prototype.getItem = function (k) { return k === K && seen !== undefined ? seen : get.call(this, k); };
          Storage.prototype.setItem = function (k, v) { if (k === K) seen = String(v); return set.call(this, k, v); };
          const add = window.addEventListener.bind(window);
          window.addEventListener = (type, fn, o) => type !== 'storage' || typeof fn !== 'function' ? add(type, fn, o) : add(type, ev => { if (ev.key === K) setTimeout(() => { seen = ev.newValue == null ? undefined : ev.newValue; fn(ev); }, 1500); else fn(ev); }, o);
          let auth;
          Object.defineProperty(window, 'ironlogAuth', { configurable: true, get: () => auth, set: v => { const on = v.onChange.bind(v); v.onChange = cb => on((ev, u) => { if (ev === 'SIGNED_OUT') setTimeout(() => cb(ev, u), 400); else cb(ev, u); }); auth = v; } });
        });
        await p2.goto(APP); await p2.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
        return { page: p2, ev: (f, a) => p2.evaluate(f, a), question: () => p2.evaluate(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? m.title : null; }), cloud: () => p2.evaluate(() => { const L = window.__ironlog; const c = L.cloudState(); return { on: c.on, acct: c.acct, sessions: L.state.sessions.map(s => s.id) }; }) };
      };
      return D;
    }
    const docs = (email, pre) => { const u = fake.users.get(email); return u ? [...fake.rows.values()].filter(r => r.user_id === u.id && new RegExp('/' + pre + '-\\d').test(r.path)) : []; };
    const sessIn = email => docs(email, 's').flatMap(r => { try { return (JSON.parse(r.data.json).sessions || []).map(s => s.id); } catch (e) { return []; } });
    const own = id => ({ id, date: '2026-10-01', dayIdx: 0, dayId: null, dayName: 'Own', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: 100, r: 5, rir: 2, warm: false, drop: false }] }] });

    // ---- A phone with account A's log signs in to account B: asked; Cancel; Use this account's log; back to A.
    {
      fake.addUser('a@example.com', 'correct horse 9'); fake.addUser('b@example.com', 'correct horse 9');
      const P = await device();
      await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, own('own1'));
      await P.signIn('a@example.com');
      ok(sessIn('a@example.com').includes('own1') && (await P.cloud()).acct, 'the phone\'s session is in account A after the first sign-in', { a: sessIn('a@example.com'), cloud: await P.cloud() });
      const aId = (await P.cloud()).acct;
      await P.signOutKeep();
      ok(/copy stays on this phone/.test((await P.toast()) || '') && (await P.cloud()).sessions.includes('own1'), 'signed out of A, keeping the log on the phone', { toast: await P.toast() });
      await P.signIn('b@example.com', true);
      let m = await P.modal();
      ok(m && m.kind === 'confirm' && /another account/.test(m.title) && m.buttons.includes('Add it to this account') && m.buttons.includes("Use this account's log") && m.buttons.includes('Cancel'), 'signing in to account B asks: add the log to this account, use this account\'s log, or cancel (r56 merged it into B unasked)', m);
      await P.page.click('#modal [data-act="mClose"]');
      await P.page.waitForFunction(() => !window.__ironlog.acctUser(), null, { timeout: 15000 }).catch(() => {}); await wait(800);
      let c = await P.cloud();
      ok(!c.user && !c.on && c.acct === aId && c.sessions.includes('own1') && !sessIn('b@example.com').length, 'Cancel: signed out again through the account service, the notes still name A, the log untouched, nothing in B', { cloud: c, b: sessIn('b@example.com') });
      await P.signIn('b@example.com', true);
      await P.page.click('#modal [data-act="mAlt"]');
      await P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
      c = await P.cloud();
      ok(c.user === 'b@example.com' && c.on && c.acct !== aId && !c.sessions.length && c.aside.join() === '1' && !sessIn('b@example.com').includes('own1') && c.ob, 'Use this account\'s log: the phone is on B\'s own log (empty, so on the Set up page), A\'s log is kept aside on the phone, and nothing of it reaches B', { cloud: c, b: sessIn('b@example.com') });
      await P.signOutKeep();
      await P.signIn('a@example.com');
      c = await P.cloud();
      ok(c.user === 'a@example.com' && c.on && c.acct === aId && c.sessions.join() === 'own1' && !c.aside.length && sessIn('a@example.com').filter(x => x === 'own1').length === 1, 'signing in to A again: not asked (B\'s log holds nothing), A\'s log and its notes come back from aside and sync as a continuation, one copy of the session in the account', { cloud: c, a: sessIn('a@example.com') });
      await P.ctx.close();
    }

    // ---- Add it to this account: the log merges into the second account as a first link.
    {
      fake.addUser('c@example.com', 'correct horse 9'); fake.addUser('d@example.com', 'correct horse 9');
      const Q = await device();
      await Q.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, own('own2'));
      await Q.signIn('c@example.com');
      await Q.signOutKeep();
      await Q.signIn('d@example.com', true);
      await Q.page.click('#modal [data-act="mOk"]');
      await Q.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
      const c = await Q.cloud();
      ok(c.user === 'd@example.com' && c.on && c.sessions.includes('own2') && sessIn('d@example.com').includes('own2') && sessIn('c@example.com').includes('own2'), 'Add it to this account: the log is in account D as a first link, and still in C', { cloud: c, c: sessIn('c@example.com'), d: sessIn('d@example.com') });
      await Q.ctx.close();
    }

    // ---- The stack's review (PENDING 333), F2: two tabs of the app on one phone hear one sign-in. One asks; the other waits,
    // then finds the switch made and starts on it, so its answer can never keep aside, under the first account, the log the
    // first tab put in use. On the stack as reviewed both asked, and the second "Use this account's log" put B's empty log
    // aside over A's: a session logged on this phone only was gone.
    {
      fake.addUser('e@example.com', 'correct horse 9'); fake.addUser('f@example.com', 'correct horse 9');
      const P = await device();
      await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, own('own3'));
      await P.signIn('e@example.com');
      await P.signOutKeep();
      await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, { ...own('own4'), date: '2026-10-02' });
      const T = await P.tab(); await wait(800);
      await P.signIn('f@example.com', true); await wait(1500);
      ok((await P.modal()) && (await P.modal()).kind === 'confirm' && !(await T.question()), 'two tabs: signing in to F asks in one tab only; the other waits for it', { tab2: await T.question() });
      await P.page.click('#modal [data-act="mAlt"]');
      await P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(2500);
      // A question still open in the second tab is answered as the first was, as a lifter who sees it would.
      const late = await T.question();
      if (late) { await T.page.click('#modal [data-act="mAlt"]'); await wait(2500); }
      const t2 = await T.cloud(), c1 = await P.cloud();
      ok(!late && t2.acct === c1.acct && !t2.sessions.length && c1.aside.join() === '2', 'the first tab\'s "Use this account\'s log": the second tab is never asked, starts on F\'s log as the first left it, and E\'s log (2 sessions) is kept aside', { t2, c1, late });
      await T.page.close();
      await P.signOutKeep();
      await P.signIn('e@example.com');
      const c = await P.cloud();
      ok(c.sessions.slice().sort().join() === 'own3,own4' && sessIn('e@example.com').includes('own4') && !c.aside.length, 'back in E: the session logged on this phone only is back, on the phone and in the account', { cloud: c, e: sessIn('e@example.com') });
      await P.ctx.close();
    }

    // ---- F3: after "Use this account's log", the menu's Sign out (the log leaves the phone and the notes are forgotten), then
    // the first account again: its log kept aside is taken back, with its notes. On the stack as reviewed it was looked up only
    // while the notes named another account, so it stayed aside for good, and a session logged on this phone only was gone.
    {
      fake.addUser('g@example.com', 'correct horse 9'); fake.addUser('h@example.com', 'correct horse 9');
      const P = await device();
      await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, own('own5'));
      await P.signIn('g@example.com');
      await P.signOutKeep();
      await P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, { ...own('own6'), date: '2026-10-02' });
      await P.signIn('h@example.com', true);
      await P.page.click('#modal [data-act="mAlt"]');
      await P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(1200);
      await P.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
      await P.signOutKeep('mOk');
      ok(!(await P.cloud()).acct && (await P.cloud()).aside.join() === '2', 'set up: signed out of H with the menu\'s Sign out, the notes forgotten, G\'s log (2 sessions) kept aside', await P.cloud());
      await P.signIn('g@example.com');
      const c = await P.cloud();
      ok(c.sessions.slice().sort().join() === 'own5,own6' && sessIn('g@example.com').includes('own6') && !c.aside.length, 'signing in to G again: its log comes back from aside, the session logged on this phone only with it, on the phone and in the account, and nothing is kept aside', { cloud: c, g: sessIn('g@example.com') });
      await P.ctx.close();
    }

    // ---- The review of the fix commit (PENDING 333, its finding 1): two tabs signed in to one account, then the menu's Sign
    // out in one (the log leaves the phone, the notes are forgotten). The other tab, slow to hear it, wrote its old notes back
    // over the forgotten ones and the first tab took them from it, so the next sign-in read the empty log as every session
    // deleted and emptied the account. It also arose unforced, about one run in fifteen.
    {
      fake.addUser('i@example.com', 'correct horse 9');
      const P = await device();
      await P.ev(ss => { const L = window.__ironlog; for (const s of ss) L.state.sessions.push(s); L.state = L.normalize(L.state); L.saveNow(); }, [0, 1, 2].map(i => ({ ...own('own' + (7 + i)), date: '2026-10-0' + (i + 1) })));
      await P.signIn('i@example.com');
      const T = await P.tab(true);
      await T.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).catch(() => {}); await wait(800);
      ok(sessIn('i@example.com').length === 3 && (await T.cloud()).on, 'set up: two tabs signed in to I, its three sessions in the account', { i: sessIn('i@example.com'), t: await T.cloud() });
      await P.signOutKeep('mOk'); await wait(3000);
      const stored = await P.ev(() => { const n = JSON.parse(localStorage.getItem('ironlog.v1.sync') || 'null'); return { acct: n ? n.acct || null : null, docs: n ? Object.keys(n.meta || {}).length : 0 }; });
      ok(!stored.acct && !stored.docs, 'the menu\'s Sign out in one tab: the notes stay forgotten; the slow tab\'s old notes, written before it heard, do not stand (d04ec3b: the notes named I again, with 3 documents)', stored);
      await T.page.close();
      await P.signIn('i@example.com');
      const c = await P.cloud();
      ok(sessIn('i@example.com').length === 3 && c.sessions.length === 3, 'signing in to I again: its three sessions are in the account and back on the phone (d04ec3b and 61f6b03: none, everywhere)', { cloud: c, i: sessIn('i@example.com') });
      await P.ctx.close();
    }

    ok(!errors.length, 'no page errors', errors.slice(0, 5));
    await browser.close(); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------- S-17: a sign-in the server refuses as the phone opens (moved from tests/r65b.js in 2.51, every check kept) ----------
   r65b: the r63 audit's NEW-3, on the built app against the stand-in Supabase
   server (tests/fake-supabase.js), as tests/r64b.js runs its cases. A phone
   opened with its sign-in expired, whose refresh the server refuses: the
   account library signs the phone out itself, and before r65 nothing said so
   (the phone read "Saved on this phone only" as if never signed in). The case
   fails on r64 (`node tests/r65b.js <a dist folder built from r64>`); the
   others are guards, that only a sign-out the phone did not make says so:
     N1  opened with an expired sign-in the server refuses: "Sign in again to
         sync" once, signed out, the log kept;
     N2  Sign out on this phone: no "Sign in again" (a guard);
     N3  Sign out in another tab: this tab says nothing either (a guard), also
         when it hears of it over a minute later (N3b, a phone's background tab);
     N4  a sign-in refused during a sync says it once, not twice (a guard on
         r64's F10, which also signs the phone out);
     N5  opened with an expired sign-in whose refresh gets no answer: still
         signed in, nothing said (a guard);
     N6  a phone never signed in, reopened: nothing said (a guard);
     N7  signed out of one account and into another that the server then
         refuses as the phone opens: said, once (the mark is the first's).
*/
async function from_r65b() {
  let ok = okAs('S-17');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r65b-'));
  fs.cpSync(SRC, tmp, { recursive: true });
  const PW = 'correct horse 9';
  const REFRESH = '**/auth/v1/token?grant_type=refresh_token*';
  const REFUSE = r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' }) });
  const AGAIN = /Sign in again to sync/;
    const fake = await start(tmp);
    const ip = path.join(tmp, 'index.html');
    fs.writeFileSync(ip, H.cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
    const APP = fake.base + '/ironlog/';
    const browser = await H.engine.launch();
    // Each case collects its own lines, printed in a fixed order at the end, since the cases run side by side.
    const results = [];
    function report(name) {
      const lines = [];
      results.push({ name, lines });
      return (c, m, x) => lines.push([!!c, m + (c || x === undefined ? '' : ' ' + JSON.stringify(x))]);
    }
    // Every toast a page shows, kept across its reloads in this tab.
    const TOASTS = () => {
      window.__toasts = JSON.parse(sessionStorage.getItem('__toasts') || '[]');
      const hook = () => {
        const el = document.getElementById('toast');
        if (!el) { setTimeout(hook, 20); return; }
        const seen = () => {
          if (el.hidden) return;
          const t = el.innerText.replace(/\s+/g, ' ').trim(), last = window.__toasts[window.__toasts.length - 1];
          if (t && (!last || last.text !== t || Date.now() - last.at > 3000)) { window.__toasts.push({ at: Date.now(), text: t }); sessionStorage.setItem('__toasts', JSON.stringify(window.__toasts)); }
        };
        // A toast already up when the hook finds the element counts too.
        seen();
        new MutationObserver(seen).observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
      };
      hook();
    };
    async function tabOf(ctx) {
      const page = await ctx.newPage();
      const st = { errors: [] };
      page.on('pageerror', e => st.errors.push('page error: ' + e.message));
      await page.goto(APP); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
      const D = { ctx, page, st, ev: (f, a) => page.evaluate(f, a) };
      D.toasts = () => page.evaluate(() => window.__toasts || []);
      D.again = since => D.toasts().then(t => t.filter(x => x.at >= since && AGAIN.test(x.text)));
      D.user = () => page.evaluate(() => { const u = window.__ironlog.acctUser(); return u ? u.email : null; });
      D.cloud = () => page.evaluate(() => window.__ironlog.cloudState());
      D.synced = (ms = 15000) => page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: ms }).then(() => true, () => false);
      D.signIn = async email => {
        await page.evaluate(() => window.__ironlog.ACT.acctOpen({ dataset: { mode: 'signin' } }));
        await page.waitForSelector('#modal [data-abind="email"]');
        await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', PW);
        await page.click('#modal [data-act="acctSubmit"]');
        await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: NET_MS + 10000 }).catch(() => {});
      };
      // A weigh-in typed on this phone and saved as a tap saves it.
      D.weigh = id => page.evaluate(id => { const L = window.__ironlog; L.state.bodyweights.push({ id, date: L.today(), kg: 80 }); L.saveNow(); }, id);
      D.has = id => page.evaluate(id => window.__ironlog.state.bodyweights.some(b => b.id === id) && (localStorage.getItem('ironlog.v1') || '').includes(id), id);
      // The phone's sign-in as if it had sat closed past its expiry: the server's token expired, and the phone's record of it says so too.
      D.expire = async email => { fake.expireTokens(email); await page.evaluate(() => { const k = 'ironlog.auth'; const s = JSON.parse(localStorage.getItem(k)); s.expires_at = Math.floor(Date.now() / 1000) - 10; localStorage.setItem(k, JSON.stringify(s)); }); };
      D.reload = async () => { await page.reload(); await page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); };
      return D;
    }
    async function phone(o = {}) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
      await quietHibp(ctx);
      await ctx.addInitScript(TOASTS);
      const D = await tabOf(ctx);
      await D.ev(() => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
      D.close = () => H.settle(ctx.close(), 'a context');
      return D;
    }
    // A weigh-in's id for an account (an id keeps to letters, digits and . : - _, or normalize gives it another).
    const wid = email => 'w-' + email.replace(/[^\w]/g, '');
    // A phone signed in and synced, a weigh-in in the account.
    async function signedIn(ok, email) {
      fake.addUser(email, PW);
      const D = await phone();
      await D.signIn(email); await D.synced();
      await D.weigh(wid(email)); await D.ev(() => window.__ironlog.flush()); await D.synced();
      ok((await D.user()) === email, `${email}: signed in and synced`);
      return D;
    }
    const until = async (fn, ms, step = 250) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v || Date.now() > end) return v; await wait(step); } };

    // ---- N1: opened with an expired sign-in the server refuses.
    const n1 = (async () => {
      const ok = report('N1: a sign-in the server refuses as the phone opens');
      const D = await signedIn(ok, 'gone@example.com');
      await D.ctx.route(REFRESH, REFUSE);
      await D.expire('gone@example.com');
      const t = Date.now();
      await D.reload();
      const said = await until(async () => (await D.again(t)).length > 0, 15000);
      await wait(3000);
      const all = await D.again(t);
      // What the phone held, for a failure's line: who it reads as signed in, the sign-in and sign-out records, the sync, and the error log's account lines.
      const held = await D.ev(() => { const L = window.__ironlog; return { user: L.acctUser(), auth: !!localStorage.getItem('ironlog.auth'), out: localStorage.getItem('ironlog.auth.out'), cloud: L.cloudState(), log: (L.logBuf || []).filter(e => /auth|sync|cloud/.test(e.a)).slice(-6).map(e => [e.a, String(e.m).slice(0, 160)]) }; });
      ok(said && all.length === 1, 'the phone opened with a sign-in the server refuses: a toast says to sign in again, once (r64: nothing)', { toasts: await D.toasts(), held });
      ok(!(await D.user()), 'and the phone reads signed out, so Sign in shows');
      ok(await D.has(wid('gone@example.com')), 'the log stays on the phone (the weigh-in, in memory and saved)');
      ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
      await D.close();
    })();

    // ---- N2: Sign out on this phone says what it always said, nothing more.
    const n2 = (async () => {
      const ok = report('N2: Sign out on this phone (a guard)');
      const D = await signedIn(ok, 'out@example.com');
      const t = Date.now();
      await D.ev(() => window.__ironlog.ACT.acctSignOut({ dataset: {} }));
      await D.page.waitForSelector('#modal [data-act="mOk"]', { timeout: 5000 }).then(() => D.page.click('#modal [data-act="mOk"]')).catch(() => {});
      await until(async () => !(await D.user()), 10000);
      await wait(4000);
      ok(!(await D.user()) && !(await D.again(t)).length, 'signed out here: no "Sign in again"', { toasts: await D.toasts() });
      // Reopened after it: nothing either.
      const t2 = Date.now();
      await D.reload(); await wait(4000);
      ok(!(await D.again(t2)).length, 'and reopened after it: nothing said', { toasts: await D.toasts() });
      ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
      await D.close();
    })();

    // ---- N3: Sign out in another tab of the same app.
    const n3 = (async () => {
      const ok = report('N3: Sign out in another tab (a guard)');
      const D = await signedIn(ok, 'twotabs@example.com');
      const B = await tabOf(D.ctx);
      await until(async () => (await B.user()) === 'twotabs@example.com', 10000);
      const t = Date.now();
      await D.ev(() => window.__ironlog.ACT.acctSignOut({ dataset: {} }));
      await D.page.waitForSelector('#modal [data-act="mOk"]', { timeout: 5000 }).then(() => D.page.click('#modal [data-act="mOk"]')).catch(() => {});
      await until(async () => !(await B.user()), 10000);
      await wait(4000);
      ok(!(await B.user()), 'the other tab reads signed out');
      ok(!(await B.again(t)).length && !(await D.again(t)).length, 'neither tab says to sign in again', { a: await D.toasts(), b: await B.toasts() });
      ok(!D.st.errors.length && !B.st.errors.length, 'no page errors', [...D.st.errors, ...B.st.errors].slice(0, 3));
      await D.close();
    })();

    // ---- N3b: Sign out in another tab, heard over a minute later (a phone's background tab, resumed).
    const n3b = (async () => {
      const ok = report('N3b: Sign out in another tab, heard late (a guard)');
      const D = await signedIn(ok, 'late@example.com');
      // The second tab's messages from the other tabs wait while it is away, and arrive when it is back, as a suspended tab's do.
      await D.ctx.addInitScript(() => {
        window.__held = []; window.__hold = false;
        const Orig = window.BroadcastChannel;
        window.BroadcastChannel = class extends Orig {
          constructor(name) {
            super(name); this.__ls = [];
            super.addEventListener('message', ev => { if (window.__hold) window.__held.push([this, ev]); else for (const l of this.__ls) l.call(this, ev); });
          }
          addEventListener(type, fn, o) { if (type === 'message') this.__ls.push(fn); else super.addEventListener(type, fn, o); }
        };
        window.__release = () => { window.__hold = false; for (const [ch, ev] of window.__held.splice(0)) for (const l of ch.__ls) l.call(ch, ev); };
      });
      const B = await tabOf(D.ctx);
      await until(async () => (await B.user()) === 'late@example.com', 10000);
      await B.ev(() => { window.__hold = true; });
      const t = Date.now();
      await D.ev(() => window.__ironlog.ACT.acctSignOut({ dataset: {} }));
      await D.page.waitForSelector('#modal [data-act="mOk"]', { timeout: 5000 }).then(() => D.page.click('#modal [data-act="mOk"]')).catch(() => {});
      await until(async () => !(await D.user()), 10000);
      await wait(65000);
      await B.ev(() => window.__release());
      await until(async () => !(await B.user()), 10000);
      await wait(3000);
      ok(!(await B.again(t)).length, 'the other tab, hearing of the sign-out 65 s later, says nothing (a mark of the sign-out, not a minute\'s grace)', await B.toasts());
      ok(!D.st.errors.length && !B.st.errors.length, 'no page errors', [...D.st.errors, ...B.st.errors].slice(0, 3));
      await D.close();
    })();

    // ---- N4: a sign-in refused during a sync says so once.
    const n4 = (async () => {
      const ok = report('N4: a sign-in refused during a sync, once (a guard on F10)');
      const D = await signedIn(ok, 'mid@example.com');
      fake.expireTokens('mid@example.com');
      await D.ctx.route(REFRESH, REFUSE);
      const t = Date.now();
      await D.weigh('w-mid2'); await D.ev(() => window.__ironlog.flush()).catch(() => {});
      await until(async () => (await D.again(t)).length > 0, 15000);
      await wait(4000);
      ok((await D.again(t)).length === 1, 'the refusal met by a sync: "Sign in again" once, not again as the phone is signed out', { toasts: await D.toasts() });
      ok(await D.has('w-mid2'), 'the weigh-in stays on the phone');
      ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
      await D.close();
    })();

    // ---- N7: signed out of one account, into another, and that one refused as the phone opens, all within a minute.
    const n7 = (async () => {
      const ok = report('N7: another account, refused just after a sign-out');
      const D = await signedIn(ok, 'first@example.com');
      await D.ev(() => window.__ironlog.ACT.acctSignOut({ dataset: {} }));
      await D.page.waitForSelector('#modal [data-act="mOk"]', { timeout: 5000 }).then(() => D.page.click('#modal [data-act="mOk"]')).catch(() => {});
      await until(async () => !(await D.user()), 10000);
      fake.addUser('second@example.com', PW);
      await D.signIn('second@example.com'); await D.synced();
      await D.weigh(wid('second@example.com')); await D.ev(() => window.__ironlog.flush()); await D.synced();
      await D.ctx.route(REFRESH, REFUSE);
      await D.expire('second@example.com');
      const t = Date.now();
      await D.reload();
      await until(async () => (await D.again(t)).length > 0, 15000);
      await wait(3000);
      ok((await D.again(t)).length === 1 && !(await D.user()), 'the second account refused as the phone opens: said once, though the first was signed out a moment before (the mark is the first account\'s)', { toasts: await D.toasts() });
      ok(await D.has(wid('second@example.com')), 'the log stays on the phone');
      ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
      await D.close();
    })();

    // ---- N5: opened with an expired sign-in whose refresh gets no answer.
    const n5 = (async () => {
      const ok = report('N5: a refresh with no answer as the phone opens (a guard)');
      const D = await signedIn(ok, 'quiet@example.com');
      await D.ctx.route(REFRESH, r => r.abort('failed'));
      await D.expire('quiet@example.com');
      const t = Date.now();
      await D.reload();
      // The library's start waits out the limit for the refresh before it answers who is signed in (r64, F3).
      await until(async () => (await D.user()) === 'quiet@example.com', NET_MS + 15000);
      await wait(3000);
      ok(!(await D.again(t)).length && (await D.user()) === 'quiet@example.com', 'no answer is not a refusal: still signed in, nothing said', { user: await D.user(), toasts: await D.toasts() });
      ok(await D.has(wid('quiet@example.com')), 'the log stays on the phone');
      ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
      await D.close();
    })();

    // ---- N6: a phone never signed in.
    const n6 = (async () => {
      const ok = report('N6: a phone never signed in, reopened (a guard)');
      const D = await phone();
      const t = Date.now();
      await D.reload(); await wait(3000);
      ok(!(await D.again(t)).length && !(await D.user()), 'nothing said', await D.toasts());
      ok(!D.st.errors.length, 'no page errors', D.st.errors.slice(0, 3));
      await D.close();
    })();

    await Promise.all([n1, n2, n3, n3b, n4, n5, n6, n7].map(p => p.catch(e => { results.push({ name: 'a case threw', lines: [[false, String(e && e.stack || e)]] }); })));
    for (const r of results) {
      console.log('# ' + r.name);
      for (const [c, m] of r.lines) ok(c, m);
    }
    await H.settle(browser.close(), 'the browser'); await fake.close(); fs.rmSync(tmp, { recursive: true, force: true });
}

/* ---------- S-9: the profile photo is the account's (moved from tests/r80b.js in 2.51, every check kept) ----------
   2.34 (build r80; PENDING.md's tracker, R79-1): the profile photo is the account's (V, 2026-11-08: "we should be
   treating it like an account"), on the standalone build against the stand-in Supabase server
   (tests/fake-supabase.js), as tests/accounts.js runs it. Run first on 2.33 (`node tests/r80b.js <a dist folder built
   from r79>`), where each section fails unless it says it guards:
     1  A photo added while signed in is written to the account as its own document, a JPEG data address and nothing
        else, beside the log's documents and never one of them; a second phone signed in to the account shows it.
     2  Removed on one phone, it goes from the account and from the other phone at its next sync.
     3  Sign out, either way (the log taken off the phone, or a copy kept), takes the photo off the phone with its
        note and Today's line answered; the account keeps it. Another account signed in on that phone shows its own
        photo, or none, and Today's line is offered again. Signed out, the menu offers no photo.
     4  A photo 2.33 kept on the phone, with no note of an account, goes up to the account the phone syncs with when
        the account has none; one the account has replaces a 2.33 copy that never reached it... only when the
        account's is the later change, which a 2.33 copy (no time of its own) never is (it goes up first).
     5  Of two phones' changes, the later is kept: a photo added on a phone while another phone's older one is in the
        account replaces it, and an older change waiting to be sent never replaces a newer one in the account.
     6  Delete my account takes the photo off the phone; Erase everything while syncing removes it from the account.
     8  (The review of 2.34, F2) A photo change not yet in the account is never lost at sign-out: Sign out sends it
        first; one the account refuses stops Sign out with "Not in your account yet"; "Keep on this phone and sign
        out" keeps it, and signing back in sends it. Fails on ba0eb22 (the new photo lost) as on 2.33 (phone-only).
     9  (The review of 2.34, F1) A confirmation or reset link opened from Gmail on Android, in a browser tab (referrer
        android-app://com.google.android.gm/), is a tab: it asks "Where do you use Ironlog?", and after a new
        password says to sign in from the home-screen app, leaving the tab signed out. Fails on ba0eb22; 2.33 passes.
     7  Guards: no page errors on either phone, and the log's documents are as before (the photo is never in them).
*/
async function from_r80b() {
  let ok = okAs('S-9');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r80b-'));
  fs.cpSync(SRC, tmp, { recursive: true });
  const PW = 'correct horse 9';
  const JPEG = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
    const fake = await start(tmp);
    const ip = path.join(tmp, 'index.html');
    fs.writeFileSync(ip, H.cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
    const APP = fake.base + '/ironlog/';
    const browser = await H.engine.launch();
    const errors = [];
    /** A phone: the built app, set up, signed out. */
    async function device(init) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
      await quietHibp(ctx);
      if (init) await ctx.addInitScript(init);
      const page = await ctx.newPage();
      page.on('pageerror', e => errors.push('page error: ' + e.message));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of 4\d\d/.test(m.text())) errors.push('console: ' + m.text()); });
      const ready = () => page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart, null, { timeout: 15000 });
      await page.goto(APP); await ready();
      await page.evaluate(() => { localStorage.setItem('ironlog.v1.installLater', '1'); localStorage.setItem('ironlog.v1.tipWake', '1'); const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
      const D = { ctx, page, ev: (f, a) => page.evaluate(f, a) };
      D.reload = async () => { await page.reload(); await ready(); await wait(1200); };
      D.synced = () => page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 15000 }).then(() => true, () => false);
      D.signIn = async email => {
        // After a sign-out that took the log off, the app opens on the first page, which has its own Sign in (as tests/r55b.js reaches it).
        const ob = await page.evaluate(() => { const p = document.getElementById('obPage'); return p ? p.dataset.step : null; });
        if (ob) { if (await page.$('#obPage [data-act="obAcctBack"]')) { await page.click('#obPage [data-act="obAcctBack"]'); await wait(200); } await page.click('#obPage [data-act="acctOpen"][data-mode="signin"]'); }
        else { await page.click('#saveState'); await wait(250); await page.click('#modal [data-act="acctOpen"][data-mode="signin"]'); }
        await wait(200);
        await page.fill('#modal [data-abind="email"]', email); await page.fill('#modal [data-abind="pw"]', PW);
        await page.click('#modal [data-act="acctSubmit"]');
        await page.waitForFunction(() => { const m = window.__ironlog.ui.modal; return !m || !m.busy; }, null, { timeout: 10000 });
        await D.synced(); await wait(1500);
        await page.evaluate(() => { if (window.__ironlog.ui.modal) document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]') && document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]').click(); });
      };
      /** Pulls from the account, as the app does when it comes back to the front. */
      D.pull = async () => { await page.evaluate(() => window.__ironlog.sync()); await wait(1500); await D.synced(); };
      /** What this phone holds and shows: its copy, the note, Today's line answered, the menu button's photo. */
      D.photo = () => page.evaluate(() => ({
        held: localStorage.getItem('ironlog.v1.photo'),
        note: localStorage.getItem('ironlog.v1.photoSync'),
        asked: localStorage.getItem('ironlog.v1.photoAsked'),
        shown: !!document.querySelector('#saveState img.ssb-ph'),
        src: (document.querySelector('#saveState img.ssb-ph') || {}).src || null
      }));
      D.pick = async (color) => {
        await page.click('#saveState'); await wait(300);
        const b64 = await page.evaluate(c => { const cv = document.createElement('canvas'); cv.width = 300; cv.height = 300; const x = cv.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, 300, 300); return cv.toDataURL('image/png').split(',')[1]; }, color);
        // With a photo already, it is changed where a lifter changes it: opened large from the menu, Change photo (2.60).
        if (await page.evaluate(() => !!document.querySelector('#modal #menuPhoto[data-act="photoView"]'))) { await page.click('#modal #menuPhoto'); await wait(250); }
        await page.setInputFiles('#modal input[data-photo]', { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
        await page.waitForFunction(() => !!document.querySelector('#saveState img.ssb-ph'), null, { timeout: 8000 }).catch(() => {});
        await wait(1500);
        await page.evaluate(() => { if (window.__ironlog.ui.modal) document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]') && document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]').click(); });
      };
      D.remove = async () => {
        await page.click('#saveState'); await wait(300);
        await page.click('#modal [data-act="photoDel"]'); await wait(250);
        await page.click('#modal [data-act="mOk"]'); await wait(1500);
        await page.evaluate(() => { if (window.__ironlog.ui.modal) document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]') && document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]').click(); });
      };
      D.signOut = async keep => {
        await page.click('#saveState'); await wait(250);
        await page.click('#modal [data-act="acctSignOut"]'); await wait(300);
        await page.click(keep ? '#modal [data-act="mAlt"]' : '#modal [data-act="mOk"]'); await wait(1500);
      };
      return D;
    }
    const uidOf = email => (fake.users.get(email) || {}).id;
    const photoRow = email => [...fake.rows.values()].find(r => r.user_id === uidOf(email) && /\/photo$/.test(r.path)) || null;
    const photoIn = email => { const r = photoRow(email); if (!r) return undefined; try { return JSON.parse(r.data.json); } catch (e) { return 'unreadable'; } };
    const logPaths = email => [...fake.rows.values()].filter(r => r.user_id === uidOf(email)).map(r => r.path.split('/').pop()).sort();

    fake.addUser('a@example.com', PW);
    fake.addUser('b@example.com', PW);

    // 1. Added on one phone, in the account, on the other phone.
    ok = okAs('S-9');
    const A = await device();
    await A.signIn('a@example.com');
    await A.pick('#c33');
    const inAcct = photoIn('a@example.com');
    ok(typeof inAcct === 'string' && JPEG.test(inAcct), '1. a photo added signed in is in the account as its own document, a JPEG data address', { has: inAcct === undefined ? 'no document' : typeof inAcct });
    ok(logPaths('a@example.com').includes('photo') && !logPaths('a@example.com').some(p => p !== 'photo' && /photo/.test(p)), '1. the account holds it as "photo", beside the log\'s documents', logPaths('a@example.com'));
    const B = await device();
    await B.signIn('a@example.com');
    let pb = await B.photo();
    ok(pb.shown && pb.held === inAcct, '1. the second phone signed in to the account shows the same photo', { shown: pb.shown, same: pb.held === inAcct });

    // 2. Removed on the second phone: gone from the account, and from the first phone at its next sync.
    ok = okAs('S-9');
    await B.remove();
    ok(photoIn('a@example.com') === null, '2. removed on one phone, the account holds no photo', photoIn('a@example.com'));
    await A.reload(); await A.synced(); await wait(800);
    let pa = await A.photo();
    ok(!pa.shown && !pa.held, '2. the first phone shows none after its next sync', pa);

    // 3. Sign out, both ways, takes the photo off the phone; the account keeps it; another account shows its own.
    ok = okAs('S-22');
    await A.pick('#3a6');
    const kept = photoIn('a@example.com');
    ok(typeof kept === 'string' && JPEG.test(kept), '3. a new photo is in the account again', typeof kept);
    await A.signOut(false);
    pa = await A.photo();
    ok(!pa.held && !pa.note && !pa.asked && !pa.shown, '3. signed out with the log taken off: no photo, note or answered line on the phone', pa);
    ok(photoIn('a@example.com') === kept, '3. the account keeps its photo', null);
    const noPick = await A.ev(async () => { document.getElementById('saveState').click(); await new Promise(r => setTimeout(r, 300)); const has = !!document.getElementById('menuPhoto'); document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]') && document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"]').click(); return has; });
    ok(!noPick, '3. signed out, the menu offers no photo');
    await A.signIn('b@example.com');
    pa = await A.photo();
    ok(!pa.shown && !pa.held, '3. another account with no photo, signed in on that phone, shows none', pa);
    // An account with no log lands on Set up after a sign-out took the log off; set up, as the lifter would, then Today.
    await A.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.ui.tab = 'today'; L.render(); });
    await wait(300);
    const line = await A.ev(() => !!document.getElementById('photoBar'));
    ok(line, "3. and Today's line offers a photo again");
    await A.signOut(true);
    pa = await A.photo();
    ok(!pa.held && !pa.note && !pa.asked, '3. signed out keeping a copy of the log: the photo goes too', pa);
    await A.signIn('a@example.com');
    pa = await A.photo();
    ok(pa.shown && pa.held === kept, "3. signed back in to the first account, its photo comes back", { shown: pa.shown, same: pa.held === kept });

    // 4. A photo 2.33 kept on the phone (no note) goes up to an account that has none.
    ok = okAs('S-24');
    fake.addUser('c@example.com', PW);
    const C = await device();
    const old = await C.ev(() => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = '#a63'; x.fillRect(0, 0, 64, 64); return cv.toDataURL('image/jpeg', 0.8); });
    await C.ev(u => localStorage.setItem('ironlog.v1.photo', u), old);
    await C.signIn('c@example.com');
    ok(photoIn('c@example.com') === old, "4. a photo 2.33 kept on the phone goes up to an account that has none", typeof photoIn('c@example.com'));
    const pc = await C.photo();
    ok(pc.shown && pc.held === old && /"up":false/.test(pc.note || ''), '4. and the phone notes it as the account\'s', pc.note);

    // 5. The later change is kept.
    ok = okAs('S-11');
    await A.pick('#36a'); // A writes a newer photo while B still holds none (it removed it in 2)
    const newer = photoIn('a@example.com');
    // B holds a change older than the account's, still to be sent: it must not replace the newer photo.
    await B.ev(() => { localStorage.setItem('ironlog.v1.photoSync', JSON.stringify({ uid: localStorage.getItem('ironlog.v1.photoSync') ? JSON.parse(localStorage.getItem('ironlog.v1.photoSync')).uid : '', et: 1, up: true })); localStorage.removeItem('ironlog.v1.photo'); });
    await B.reload(); await B.synced(); await wait(800);
    pb = await B.photo();
    ok(photoIn('a@example.com') === newer && pb.held === newer, '5. an older change waiting on a phone never replaces the newer photo in the account; the phone takes the newer', { acct: photoIn('a@example.com') === newer, phone: pb.held === newer });

    // 6. Erase everything while syncing removes the photo from the account; Delete my account takes it off the phone.
    ok = okAs('S-31');
    await B.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); });
    await B.ev(() => window.__ironlog.ui && document.querySelector('[data-act="resetAll"]') && document.querySelector('[data-act="resetAll"]').click());
    await wait(300);
    await B.page.click('#modal [data-act="mOk"]').catch(() => {});
    await wait(2500);
    ok(photoIn('a@example.com') === null, '6. Erase everything while syncing removes the photo from the account', photoIn('a@example.com'));
    await C.ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    await wait(300);
    fake.deployDelete(true);
    const delBtn = await C.page.$('[data-act="acctDelete"]');
    if (delBtn) {
      await delBtn.evaluate(e => e.click()); await wait(300);
      await C.page.click('#modal [data-act="mOk"]').catch(() => {});
      await wait(2500);
      const pd = await C.photo();
      ok(!fake.users.has('c@example.com'), '6. (the account is deleted)');
      ok(!pd.held && !pd.note && !pd.shown, '6. Delete my account takes the photo off the phone', pd);
    } else ok(false, '6. Delete my account is reachable in Your data');

    // 8. A photo change not yet in the account, at sign-out (the review's F2).
    ok = okAs('S-22');
    // A step that cannot be taken (a build that signed out where it should not) is a failure of the section, not a crash, so 9 still runs.
    try {
    fake.addUser('f2@example.com', PW);
    const F = await device();
    await F.signIn('f2@example.com');
    await F.pick('#c33');
    const red = photoIn('f2@example.com');
    const refuse = async on => {
      if (!on) return F.page.unroute('**/rest/v1/docs**');
      await F.page.route('**/rest/v1/docs**', async r => {
        const q = r.request(), body = q.postData() || '';
        if (q.method() !== 'GET' && (/photo/.test(q.url()) || /\/photo"/.test(body))) return r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"refused"}' });
        return r.continue();
      });
    };
    await refuse(true);
    await F.pick('#36a');
    const blue = (await F.photo()).held;
    ok(blue && blue !== red && photoIn('f2@example.com') === red, '8. (setting up) a new photo the account refused stays on the phone, the account keeps the old', { phoneNew: blue !== red, acctOld: photoIn('f2@example.com') === red });
    // Still refused at sign-out: Sign out must say it has not reached the account, and remove nothing.
    await F.page.click('#saveState'); await wait(250);
    await F.page.click('#modal [data-act="acctSignOut"]'); await wait(300);
    await F.page.click('#modal [data-act="mOk"]').catch(() => {}); await wait(2500);
    const box = await F.ev(() => { const m = document.getElementById('modal'); return m && !m.hidden ? m.innerText.replace(/\s+/g, ' ') : ''; });
    const still = await F.ev(() => !!window.__ironlog.acctUser());
    ok(/Not in your account yet/.test(box) && still && (await F.photo()).held === blue, '8. a photo the account still refuses stops Sign out with "Not in your account yet", signed in, the photo kept', { box: box.slice(0, 120), signedIn: still });
    await F.ev(() => { const b = document.querySelector('#modal [data-act="mClose"], #modal .sheet-h [aria-label="Close"], #modal [data-act="mCancel"]'); if (b) b.click(); });
    await wait(300);
    // Accepted again: Sign out sends it first, so the account holds the new photo.
    await refuse(false);
    await F.signOut(false);
    ok(photoIn('f2@example.com') === blue, '8. once the account takes it, Sign out sends the new photo before taking it off the phone', { acctIsNew: photoIn('f2@example.com') === blue, acctIsOld: photoIn('f2@example.com') === red });
    await F.signIn('f2@example.com');
    ok((await F.photo()).held === blue, '8. signed back in, the phone shows the new photo');
    // Changed offline, then "Keep on this phone and sign out": kept, and sent when signed back in.
    await F.ctx.setOffline(true); await wait(300);
    await F.pick('#3a3');
    const green = (await F.photo()).held;
    await F.page.click('#saveState'); await wait(250);
    await F.page.click('#modal [data-act="acctSignOut"]'); await wait(300);
    const offBox = await F.ev(() => document.getElementById('modal').innerText.replace(/\s+/g, ' '));
    await F.page.click('#modal [data-act="mOk"]'); await wait(1500);
    ok(/Not in your account yet/.test(offBox) && (await F.photo()).held === green, '8. offline, "Keep on this phone and sign out" keeps the photo changed offline', { box: offBox.slice(0, 80), kept: (await F.photo()).held === green });
    await F.ctx.setOffline(false); await wait(500);
    await F.signIn('f2@example.com');
    ok(photoIn('f2@example.com') === green && (await F.photo()).held === green, '8. signed back in online, the photo changed offline reaches the account and stays on the phone', { acct: photoIn('f2@example.com') === green, phone: (await F.photo()).held === green });
    // Another account on that phone never takes a photo kept for the first.
    await F.signOut(false);
    fake.addUser('f3@example.com', PW);
    await F.signIn('f3@example.com');
    ok(photoIn('f3@example.com') === undefined && !(await F.photo()).held, '8. guard: another account signed in on that phone gets no photo of the first', { acct: photoIn('f3@example.com'), phone: !!(await F.photo()).held });
    } catch (e) { ok(false, '8. the section ran to its end', String(e).slice(0, 200)); }

    // 9. A link from Gmail on Android opens in a browser tab (the review's F1).
    ok = okAs('S-30');
    fake.addUser('g@example.com', PW);
    const tok = async email => (await (await fetch(fake.base + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'x', 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) })).json());
    const link = (t, type) => `${APP}index.html#access_token=${t.access_token}&expires_at=${t.expires_at}&expires_in=3600&refresh_token=${t.refresh_token}&token_type=bearer&type=${type}`;
    const fromGmail = `if (/access_token/.test(location.hash)) Object.defineProperty(Document.prototype, 'referrer', { get() { return 'android-app://com.google.android.gm/'; }, configurable: true });`;
    const sheetOf = D => D.ev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, mode: m.mode } : null; });
    const G = await device(fromGmail);
    await G.page.goto(link(await tok('g@example.com'), 'signup')); await G.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(2500);
    const gs = await sheetOf(G);
    ok(gs && gs.mode === 'where', '9. a confirmation link from Gmail, in a browser tab, asks "Where do you use Ironlog?"', gs);
    const Rr = await device(fromGmail);
    await Rr.page.goto(link(await tok('g@example.com'), 'recovery')); await Rr.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(2000);
    await Rr.page.fill('#modal [data-abind="pw"]', 'brand new horse 7').catch(() => {});
    await Rr.page.click('#modal [data-act="acctSubmit"]').catch(() => {}); await wait(2500);
    const rs = await sheetOf(Rr), rIn = await Rr.ev(() => !!window.__ironlog.acctUser());
    ok(rs && rs.mode === 'sent' && !rIn, '9. after a new password from a Gmail link, the tab says to sign in from the home-screen app and stays signed out', { sheet: rs, signedIn: rIn });

    // 7. Guards.
    ok = okAs('S-9');
    ok(!errors.length, '7. guard: no page errors on any phone', errors.slice(0, 5));
    await browser.close();
    await fake.close();
}

(async () => {
  for (const [name, f] of [['r55b', from_r55b], ['r55-1b', from_r55_1b], ['r56-1b', from_r56_1b], ['r65b', from_r65b], ['r80b', from_r80b]]) {
    if (ONLY && !ONLY.includes(name)) continue;
    await f();
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL the suite stopped:', (e && e.stack) || e); process.exit(1); });
