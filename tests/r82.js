// 2.36 (build r82; PENDING.md's tracker), R81-2: fixing an earlier workout never costs the one in progress. Each
// section is written as what a lifter expects and run first on 2.35 (`node tests/r82.js baselines/r81.html`), where
// each fails unless it says it guards:
//   1  With a workout in progress (two sets ticked), Edit on a saved session in History opens the edit at once, the
//      workout set aside, not thrown away; Save changes saves the edit and brings the workout back with both sets,
//      Today offering it (Resume); Resume opens it.
//   2  The same with Cancel on the edit (Discard, its question answered): the workout comes back.
//   3  Log a past workout sets it aside the same way; the past workout saved, it comes back.
//   4  Set aside, the workout survives a reload, and comes back when the edit is saved after it.
//   5  Undo after Save changes (an edit keeps no step, so Undo takes back an earlier one) never overwrites the workout
//      brought back.
//   6  Do again in History with a workout in progress opens that workout (as every start does since 2.35) and
//      replaces nothing.
//   7  A workout set aside for one account is never brought back into another (signed in as someone else); back in
//      its own, Today offers it (Bring it back) until it comes back; Erase everything forgets it. Guard: only one is set aside at a time; a second edit asks first, as before.
//   8  The edit's screen says the workout is set aside; Today's Resume card is for the workout brought back.
//   9  (REV6-1, the review) Signed in, with an edit open and a workout set aside: Sign out, either way, signs nothing
//      out and says why; Cancel edit brings the workout back, and Sign out then takes it to the account, where signing
//      in again finds it in progress.
//   10 (REV6-3) Set aside before the sync had started: it comes back once the edit is saved with the sync on.
//   11 (REV6-4, S-1) Set aside on a phone not signed in, then the first sign-in: it comes back in the account it joined.
//   12 (REV6-2) Undo after Erase everything brings back the workout in progress, and with an edit open the edit and
//      then the workout set aside.
// R82_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R82_ONLY ? process.env.R82_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-08';

/** The app on Today with the demo log as the lifter's own, a workout started and two of its sets ticked. */
async function withWorkout(setup) {
  const D = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00', setup });
  await D.page.evaluate(() => {
    const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg';
    L.makeDemo(); for (const x of L.state.sessions) delete x.demo; for (const x of L.state.bodyweights) delete x.demo;
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.ui.tab = 'today'; L.render();
  });
  await wait(300);
  await D.page.click('[data-act="startSession"]');
  await wait(400);
  await D.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]').catch(() => {});
  await wait(300);
  await D.page.click('#view [data-act="sDone"][data-b="0"][data-s="1"]').catch(() => {});
  await wait(500);
  return D;
}
/** The workout in progress as stored: its id, and each exercise's sets with loads, reps and ticks. */
const live = D => D.page.evaluate(() => { const d = window.__ironlog.state.draft; return d ? { id: d.id, editing: !!d.editingId, past: !!d.past, ex: JSON.stringify(d.ex.map(b => [b.exId, b.sets.map(s => [s.w, s.r, !!s.done])])) } : null; });
/** The id of an older saved session with at least two exercises. */
const oldId = D => D.page.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions.filter(x => x.ex && x.ex.length >= 2 && x.date < '2026-11-08').slice(-1)[0]; return s && s.id; });
/** Answers the open question sheet with its main button, if one is open. */
const answer = async D => { await D.page.click('#modal [data-act="mOk"]').catch(() => {}); await wait(300); };

/* A stand-in account for sections 9 to 11 (the review of 2.36 and 2.37, REV6): the account's documents in Node, the sync
   through Claude's db (cloudProvider takes it when window.claude exists), and the account service (ironlogAuth) for
   signing out. The signed-in account is window.__uid, kept across a reload in sessionStorage. */
function account(store, uid) {
  return async (ctx, page) => {
    await page.exposeFunction('__dbGet', p => (store.has(p) ? store.get(p) : null));
    await page.exposeFunction('__dbSet', (p, v) => { store.set(p, v); return true; });
    await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
    await page.addInitScript(u => {
      const kept = sessionStorage.getItem('t.uid');
      window.__uid = kept === null ? u : kept || null;
      window.claude = { use: async k => {
        if (k === 'user') return window.__uid ? { id: async () => window.__uid } : null;
        if (k === 'db') return { doc: p => ({ get: async () => { const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); return true; } }), collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
        return null;
      } };
      window.ironlogAuth = { onChange() {}, user() { return Promise.resolve(window.__uid ? { id: window.__uid, email: 'v@example.com' } : null); }, signOut() { window.__uid = null; sessionStorage.setItem('t.uid', ''); return Promise.resolve(); }, deleteAccount() { window.__uid = null; sessionStorage.setItem('t.uid', ''); return Promise.resolve(); } };
    }, uid);
  };
}
/** The set-aside workout's account tag as stored, or null with none set aside. */
const parkedTag = D => D.page.evaluate(() => { const v = localStorage.getItem(window.__ironlog.KEY + '.parked'); return v ? JSON.parse(v).uid : null; });
/** Whether the sync is on for the account. */
const syncing = D => D.page.waitForFunction(() => window.__ironlog.cloudState().on, null, { timeout: 15000 }).then(() => true, () => false);
const modalKind = D => D.page.evaluate(() => (window.__ironlog.ui.modal || {}).kind || null);

(async () => {
  if (run(1)) {
    const D = await withWorkout();
    const w0 = await live(D);
    ok(w0 && /true/.test(w0.ex), '1. (setting up) a workout in progress with sets ticked');
    const sid = await oldId(D);
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), sid);
    await wait(400);
    const e = await live(D);
    ok((await modalKind(D)) == null && e && e.editing, '1. Edit opens the edit at once, with no question to replace the workout', { modal: await modalKind(D), e });
    await D.page.click('#view [data-act="finish"]').catch(() => {});
    await wait(300);
    if (await modalKind(D)) await answer(D);
    await wait(400);
    const back = await live(D);
    ok(back && back.id === w0.id && back.ex === w0.ex && !back.editing, '1. Save changes brings the workout back with every set as it was', { w0, back });
    const t = await D.page.evaluate(() => ({ resume: !!document.querySelector('#view [data-act="wkResume"]') }));
    ok(t.resume, "1. Today offers the workout brought back (Resume)", t);
    await D.page.click('#view [data-act="wkResume"]').catch(() => {});
    await wait(300);
    ok(await D.page.evaluate(() => !!document.querySelector('#view section.block')), '1. Resume opens it');
    await D.browser.close();
  }

  if (run(2)) {
    const D = await withWorkout();
    const w0 = await live(D);
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), await oldId(D));
    await wait(400);
    await D.page.evaluate(() => window.__ironlog.ACT.discard());
    await wait(300);
    if (await modalKind(D)) await answer(D);
    await wait(400);
    const back = await live(D);
    ok(back && back.id === w0.id && back.ex === w0.ex, '2. Cancelling the edit brings the workout back as it was', { w0, back });
    await D.browser.close();
  }

  if (run(3)) {
    const D = await withWorkout();
    const w0 = await live(D);
    await D.page.evaluate(() => window.__ironlog.ACT.pastOpen({ dataset: { date: '2026-11-05' } }));
    await wait(300);
    await D.page.click('#modal [data-act="pastGo"][data-day="0"]').catch(() => {});
    await wait(500);
    const p = await live(D);
    ok((await modalKind(D)) == null && p && p.past, '3. Log a past workout opens it at once, the workout set aside', { modal: await modalKind(D), p });
    await D.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]').catch(() => {});
    await wait(300);
    await D.page.evaluate(() => window.__ironlog.ACT.finishNow());
    await wait(500);
    await D.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const back = await live(D);
    const saved = await D.page.evaluate(() => window.__ironlog.state.sessions.some(s => s.date === '2026-11-05'));
    ok(saved && back && back.id === w0.id && back.ex === w0.ex, '3. the past workout saved, the workout comes back as it was', { saved, w0, back });
    await D.browser.close();
  }

  if (run(4)) {
    const D = await withWorkout();
    const w0 = await live(D);
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), await oldId(D));
    await wait(400);
    await D.page.evaluate(() => window.__ironlog.saveNow());
    await D.page.reload();
    await D.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
    await wait(800);
    const e = await live(D);
    ok(e && e.editing, '4. (setting up) after a reload the edit is open');
    await D.page.evaluate(() => window.__ironlog.ACT.finishNow());
    await wait(500);
    const back = await live(D);
    ok(back && back.id === w0.id && back.ex === w0.ex, '4. the workout set aside survives a reload and comes back after the edit', { w0, back });
    await D.browser.close();
  }

  if (run(5)) {
    const D = await withWorkout();
    const w0 = await live(D);
    // An undoable step first (a session deleted), then an edit saved, which keeps none: Undo then takes back the delete,
    // and must leave the workout brought back as it is.
    const gone = await D.page.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions.filter(x => x.date < '2026-11-08').slice(0, 1)[0]; return s.id; });
    await D.page.evaluate(id => window.__ironlog.ACT.histDel({ dataset: { id } }), gone);
    await wait(200);
    await answer(D);
    const sid = await oldId(D);
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), sid);
    await wait(400);
    await D.page.evaluate(() => window.__ironlog.ACT.finishNow());
    await wait(500);
    await D.page.evaluate(() => window.__ironlog.ACT.undo());
    await wait(500);
    const s = await D.page.evaluate(id => ({ back: window.__ironlog.state.sessions.some(x => x.id === id) }), gone);
    const back = await live(D);
    ok(s.back, '5. (setting up) Undo takes back the delete made before the edit', s);
    ok(back && back.id === w0.id && back.ex === w0.ex, '5. Undo after the edit never overwrites the workout brought back', { w0, back });
    await D.browser.close();
  }

  if (run(6)) {
    const D = await withWorkout();
    const w0 = await live(D);
    await D.page.evaluate(id => window.__ironlog.ACT.histRepeat({ dataset: { id } }), await oldId(D));
    await wait(400);
    const k = await modalKind(D);
    const after = await live(D);
    ok(k == null && after && after.id === w0.id && after.ex === w0.ex, '6. Do again with a workout in progress opens that workout and replaces nothing', { k, w0, after });
    await D.browser.close();
  }

  if (run(7)) {
    const D = await withWorkout();
    const w0 = await live(D);
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), await oldId(D));
    await wait(400);
    // A second edit while one workout is set aside asks first, as before 2.36, and the one set aside stays.
    const sid2 = await D.page.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions.filter(x => x.ex && x.ex.length >= 2 && x.date < '2026-11-08').slice(-2)[0]; return s && s.id; });
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), sid2);
    await wait(300);
    ok((await modalKind(D)) === 'confirm', '7. (a guard) a second edit while a workout is set aside asks first');
    await D.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    await wait(200);
    // Another account: the workout set aside stays for its own. Since the review of 2.36 (REV6-3) the account is the one
    // whose log the phone holds (cloud.acct), as signing in sets it, not the sync's alone.
    await D.page.evaluate(() => { const L = window.__ironlog; L.cloud.on = true; L.cloud.uid = 'someone-else'; L.cloud.acct = 'someone-else'; L.ACT.finishNow(); });
    await wait(500);
    const other = await live(D);
    ok(!other || other.id !== w0.id, '7. a workout set aside is never brought back into another account', other);
    await D.page.evaluate(() => { const L = window.__ironlog; L.cloud.on = false; L.cloud.uid = null; L.cloud.acct = null; L.ui.tab = 'today'; L.render(); });
    await wait(300);
    // Back in its own account with nothing open, Today offers it until it comes back.
    const card = await D.page.evaluate(() => !!document.querySelector('#view [data-act="parkBack"]'));
    ok(card, "7. back in its own account, Today offers the workout set aside (Bring it back)");
    await D.page.click('#view [data-act="parkBack"]').catch(() => {});
    await wait(400);
    const home = await live(D);
    ok(home && home.id === w0.id && home.ex === w0.ex && (await D.page.evaluate(() => !!document.querySelector('#view section.block'))), '7. Bring it back opens it with every set', { w0, home });
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), await oldId(D));
    await wait(400);
    await D.page.evaluate(() => window.__ironlog.ACT.resetAll());
    await wait(300);
    await answer(D);
    await wait(500);
    const kept = await D.page.evaluate(() => { const L = window.__ironlog; return Object.keys(localStorage).filter(k => k.startsWith(L.KEY + '.parked')).length; });
    ok(kept === 0, '7. Erase everything forgets a workout set aside', { kept });
    await D.browser.close();
  }

  if (run(8)) {
    const D = await withWorkout();
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), await oldId(D));
    await wait(400);
    const line = await D.page.evaluate(() => (document.getElementById('parkedLine') || {}).textContent || '');
    ok(/set aside/i.test(line), "8. the edit's screen says the workout in progress is set aside", line);
    await D.browser.close();
  }

  if (run(9)) {
    // Signed in, a workout in progress, an earlier session opened to edit: the workout is set aside for this account.
    const store = new Map();
    const D = await withWorkout(account(store, 'u1'));
    ok(await syncing(D), '9. (setting up) signed in and syncing');
    await D.page.evaluate(() => window.__ironlog.flush()); await wait(300);
    const w0 = await live(D);
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), await oldId(D));
    await wait(400);
    // Sign out, either way, while the edit is open: nothing signs out, and the lifter is told what to do first.
    for (const pick of ['mOk', 'mAlt']) {
      await D.page.evaluate(() => window.__ironlog.ACT.acctSignOut()); await wait(300);
      await D.page.click(`#modal [data-act="${pick}"]`).catch(() => {}); await wait(800);
      const st = await D.page.evaluate(() => ({ on: window.__ironlog.cloudState().on, said: (document.querySelector('#toast') || {}).textContent || '' }));
      ok(st.on && (await parkedTag(D)) === 'u1' && /set aside/.test(st.said), `9. with the edit open and a workout set aside, Sign out${pick === 'mAlt' ? ', keeping a copy,' : ''} signs nothing out and says why`, st);
      await D.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    }
    // Cancel the edit: the workout is back; Sign out now takes it to the account with the log, and signing in brings it.
    await D.page.evaluate(() => window.__ironlog.ACT.discard()); await wait(300); await answer(D); await wait(300);
    const back = await live(D);
    ok(back && back.id === w0.id && back.ex === w0.ex, '9. Cancel edit brings the workout back', { w0, back });
    await D.page.evaluate(() => window.__ironlog.ACT.acctSignOut()); await wait(300); await answer(D); await wait(1500);
    ok(!(await D.page.evaluate(() => window.__ironlog.cloudState().on)), '9. (setting up) then Sign out signs out');
    await D.page.evaluate(() => sessionStorage.setItem('t.uid', 'u1'));
    await D.page.reload(); await D.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
    await syncing(D); await wait(1500);
    const again = await live(D);
    ok(again && again.id === w0.id && again.ex === w0.ex, '9. signed in again, the workout is in progress with every set (it went to the account with the log)', { w0, again });
    await D.browser.close();
  }

  if (run(10)) {
    // Reopened while the sync has not started yet (a slow connection): the log is still this account's.
    const D = await withWorkout();
    const w0 = await live(D);
    await D.page.evaluate(() => { const L = window.__ironlog; L.cloud.acct = 'u1'; L.cloud.on = false; L.cloud.uid = null; });
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), await oldId(D));
    await wait(400);
    await D.page.evaluate(() => { const L = window.__ironlog; L.cloud.on = true; L.cloud.uid = 'u1'; L.ACT.finishNow(); });
    await wait(600);
    const back = await live(D);
    ok(back && back.id === w0.id && back.ex === w0.ex, '10. set aside before the sync had started, the workout comes back once the edit is saved with the sync on', { w0, back, tag: await parkedTag(D) });
    await D.page.evaluate(() => { const L = window.__ironlog; L.cloud.on = false; L.cloud.uid = null; L.cloud.acct = null; });
    await D.browser.close();
  }

  if (run(11)) {
    // Not signed in, a workout set aside for an edit, then the first sign-in: the phone's log goes to the account, and the workout with it.
    const store = new Map();
    const D = await withWorkout(account(store, ''));
    const w0 = await live(D);
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), await oldId(D));
    await wait(400);
    await D.page.evaluate(async () => { window.__uid = 'u1'; sessionStorage.setItem('t.uid', 'u1'); await window.__ironlog.cloudInit(); });
    ok(await syncing(D), '11. (setting up) signed in for the first time, the phone\'s log kept');
    await wait(800);
    await D.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.finishNow(); });
    await wait(600);
    const back = await live(D);
    ok(back && back.id === w0.id && back.ex === w0.ex, '11. Save changes after the first sign-in brings the workout back into the account it joined', { w0, back, tag: await parkedTag(D) });
    await D.browser.close();
  }

  if (run(12)) {
    // Erase everything, then Undo: everything comes back, the workout in progress too.
    const D = await withWorkout();
    const w0 = await live(D);
    await D.page.evaluate(() => window.__ironlog.ACT.resetAll()); await wait(300); await answer(D); await wait(400);
    await D.page.evaluate(() => window.__ironlog.ACT.undo()); await wait(600);
    const back = await live(D);
    ok(back && back.id === w0.id && back.ex === w0.ex, '12. Undo after Erase everything brings back the workout in progress', { w0, back });
    // The same with an edit open and the workout set aside: Undo brings the edit back, and saving it the workout.
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), await oldId(D));
    await wait(400);
    await D.page.evaluate(() => window.__ironlog.ACT.resetAll()); await wait(300); await answer(D); await wait(400);
    await D.page.evaluate(() => window.__ironlog.ACT.undo()); await wait(600);
    const e = await live(D);
    await D.page.evaluate(() => window.__ironlog.ACT.finishNow()); await wait(600);
    const back2 = await live(D);
    ok(e && e.editing && back2 && back2.id === w0.id && back2.ex === w0.ex, '12. with an edit open, Undo after Erase everything brings the edit back and, once it is saved, the workout set aside', { e: e && e.editing, w0, back2 });
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
