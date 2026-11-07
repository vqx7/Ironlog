// 2.30 (build r76; PENDING.md's tracker, RC-4 and NEW-73, V 2026-11-06 19:55 and 20:07), each section written as
// what a lifter expects and run first on 2.29 (`node tests/r76.js baselines/r74.html` or on r75's index.html), where
// each section fails unless it says it guards:
//   1  RC-4 and NEW-73: Undo and Recently deleted are one history. V deleted a session, brought it back, deleted it
//      again and tapped Undo, and read "Undone. 2 steps left", then "3 steps left", a count of every change kept that
//      never reached 0 and said nothing about what was taken back. Expected: Restore is a change like any other, with
//      its own Undo step; Undo says what it took back in words (the same words the change's own message used), never
//      a count; Settings' button names the change it will take back; and the message for a step with nothing left to
//      take back reads as a sentence. Guards: the delete's Undo still brings the session back, and Undo with nothing
//      kept still says so.
// R76_ONLY=1 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R76_ONLY ? process.env.R76_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const T = '2026-11-06';

(async () => {
  if (run(1)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const ev = (f, a) => D.page.evaluate(f, a), wait = ms => D.page.waitForTimeout(ms);
    await ev(() => {
      const L = window.__ironlog, S = L.state;
      S.settings.onboarded = true; S.settings.unit = 'kg'; S.draft = null;
      S.sessions = [{ id: 's1', date: '2026-11-03', dayIdx: 0, dayId: null, dayName: 'Push', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [8, 12], sets: [{ w: 60, r: 8, rir: 2, warm: false, drop: false }] }] }];
      L.state = L.normalize(S); L.invalidate(); L.saveNow();
      L.undoForget(); L.ui.tab = 'history'; L.render();
    });
    const toastText = () => ev(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText.replace(/\s+/g, ' ').trim() : ''; });
    const del = async () => { await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histDel({ dataset: { id: 's1' } }); }); await D.page.click('[data-act="mOk"]'); await wait(150); };
    const restore = async () => { await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); }); await wait(100); await ev(() => window.__ironlog.ACT.restore({ dataset: { id: 's1', k: 'session' } })); await wait(150); };
    const undo = async () => { await ev(() => window.__ironlog.ACT.undo()); await wait(150); return toastText(); };
    const has = () => ev(() => window.__ironlog.state.sessions.some(s => s.id === 's1'));

    // V's sequence: delete, Restore from Recently deleted, delete again, then Undo, Undo, Undo.
    await del();
    ok(!(await has()), '1. (a guard) Delete session removes it');
    await restore();
    const steps1 = await ev(() => window.__ironlog.undoStack.length);
    ok(await has(), '1. (a guard) Restore brings it back');
    ok(steps1 === 2, '1. Restore keeps its own Undo step, like every change (2.29: none, the delete\'s step left behind)', { steps1 });
    await del();
    const u1 = await undo();
    ok(await has(), '1. Undo after the second delete brings the session back', u1);
    ok(!/step/i.test(u1) && /session deleted/i.test(u1), '1. Undo says what it took back, "Session deleted", with no count of steps (2.29: "Undone. 2 steps left")', u1);
    const u2 = await undo();
    ok(!(await has()) && /restored/i.test(u2) && !/step/i.test(u2), '1. the next Undo takes back the Restore, and says so (2.29: "Nothing to undo there", the delete\'s stale step)', { u2, has: await has() });
    const u3 = await undo();
    ok((await has()) && /session deleted/i.test(u3), '1. the next takes back the first delete: one history, newest first', u3);
    const u4 = await undo();
    ok(/nothing left to undo/i.test(u4), '1. (a guard) with nothing kept, Undo says so', u4);

    // Settings' button names the change it would take back, not a count.
    await del();
    const btn = await ev(async () => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); await new Promise(q => setTimeout(q, 150)); const b = document.querySelector('#view [data-act="undo"]'); return b ? { text: b.textContent.replace(/\s+/g, ' ').trim(), tip: b.dataset.tip || '' } : null; });
    ok(btn && /session deleted/i.test(btn.text) && !/available/i.test(btn.text), '1. Settings\' Undo button names the change it takes back (2.29: "Undo last delete or reset (N available)")', btn);
    ok(btn && !/not undoable/i.test(btn.tip), '1. its tip no longer says edits cannot be undone, which was wrong (goals, plans and units are undoable)', btn);

    // A step whose change has since been changed again reads as a sentence a lifter follows.
    const stale = await ev(async () => {
      const L = window.__ironlog;
      L.act(() => { L.state.settings.timeBudget = 50; }, { undo: true });
      L.act(() => { L.state.settings.timeBudget = 60; });
      L.ACT.undo(); await new Promise(q => setTimeout(q, 150));
      const t = document.getElementById('toast'); return t ? t.innerText.replace(/\s+/g, ' ').trim() : '';
    });
    ok(/^Nothing to undo: /.test(stale) && !/there:/.test(stale), '1. a step with nothing left to take back says why in a plain sentence (2.29: "Nothing to undo there: it has changed since.")', stale);
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
