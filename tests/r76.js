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
//   2  RC-1 (one list of the loads a lift can use): a load close to a weight the rack has is that weight, by one rule
//      on Your gym's rack and on a rack read from its spacing (BELL_TOL, 45% of the gap). 22.5 kg dumbbells read in lb
//      are 49.6 lb; going heavier mid-workout toward 54 lb, 2.29 offered 50 lb on the rack read from its spacing (a
//      sliver, 0.4 lb, the class NEW-70 fixed only for the step at the top of the range) and nothing on Your gym's
//      rack. Expected: nothing on both, since the next real weight, 55, is past 54. Guards: toward 56 both offer 55;
//      the step at the top of the range is still 55 on both (NEW-70); a load on the rack (50 lb) answers as before.
//   3  R75-6 (RC-2): a saved workout opened from History's Edit is judged against the sessions before it, as the PR
//      list judges it, never against its own saved version. Bench at 95 x 8 on Oct 23, then 100 x 8 on Oct 30, a Weight
//      PR in the list; opened for editing, its 100 x 8 row read as no PR on 2.29 (it was judged against itself, the
//      same 100 x 8 one day "earlier"). Guards: the list says Weight PR before and during the edit; a new workout today
//      at 100 x 8 is still no PR (it ties Oct 30).
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

  if (run(2)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog, LB = 0.45359237, S = L.state;
      S.settings.onboarded = true; S.settings.unit = 'lb';
      const at = (kg, gym) => {
        if (gym) S.settings.gym = gym; else delete S.settings.gym;
        S.sessions = [0, 1, 2].map(i => ({ id: 'h' + i, date: ['2026-10-16', '2026-10-23', '2026-10-30'][i], dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'dbBench', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w: kg, r: 12, rir: 1, warm: false, drop: false })) }] }));
        L.state = L.normalize(S); L.invalidate();
        const ex = L.state.exercises.find(e => e.id === 'dbBench');
        const plan = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 120 };
        const lb = v => (v == null ? null : Math.round((v / LB) * 10) / 10);
        return { to54: lb(L.heavierLoad(ex, plan, kg, 54 * LB)), to56: lb(L.heavierLoad(ex, plan, kg, 56 * LB)), step: lb(kg + L.progStep(ex, plan, kg, kg)) };
      };
      const rack = { u: 'lb', db: { lo: 5, hi: 120, st: 5 } };
      return { spacing: at(22.5), rack: at(22.5, rack), onRack: at(50 * LB), onRackGym: at(50 * LB, rack), eight: at(8 * LB), twelve: at(12 * LB) };
    });
    ok(r.spacing.to54 === null, '2. RC-1: 49.6 lb (22.5 kg) dumbbells, going heavier toward 54 lb, read from the rack\'s spacing: nothing, the next real weight is 55 (2.29: 50 lb, a sliver)', r.spacing);
    ok(r.rack.to54 === null, '2. (a guard) the same on Your gym\'s rack in lb: nothing', r.rack);
    ok(r.spacing.to56 === 55 && r.rack.to56 === 55, '2. (a guard) toward 56 lb both offer 55', r);
    ok(r.spacing.step === 55 && r.rack.step === 55, '2. (a guard, NEW-70) the step at the top of the range is 55 on both', r);
    ok(r.onRack.to54 === null && r.onRack.to56 === 55 && r.onRackGym.to56 === 55, '2. (a guard) from 50 lb on the rack, as before', r);
    ok(r.eight.step === 10 && r.twelve.step === 15, '2. V\'s call of 2026-10-18 (r54): lb dumbbells typed at 8 and 12, off a 5 lb rack, step to the rack\'s next weight, 10 and 15 (2.29\'s half-step patch made 8 go to 15, with no test to say so)', { eight: r.eight, twelve: r.twelve });
    ok(!D.errors.length, '2. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(3)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const ev = (f, a) => D.page.evaluate(f, a), wait = ms => D.page.waitForTimeout(ms);
    await ev(() => {
      const L = window.__ironlog, S = L.state;
      S.settings.onboarded = true; S.settings.unit = 'kg'; S.draft = null;
      const ses = (id, date, w) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Push', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1].map(() => ({ w, r: 8, rir: null, warm: false, drop: false })) }] });
      S.sessions = [ses('e1', '2026-10-23', 95), ses('e2', '2026-10-30', 100)];
      L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.render();
    });
    const listPR = () => ev(() => window.__ironlog.IDX().prs.filter(p => p.sid === 'e2' && p.big).map(p => p.type));
    const before = await listPR();
    await ev(() => window.__ironlog.ACT.histEdit({ dataset: { id: 'e2' } })); await wait(200);
    const mOk = await ev(() => !!document.querySelector('#modal [data-act="mOk"]'));
    if (mOk) { await D.page.click('#modal [data-act="mOk"]'); await wait(200); }
    const edit = await ev(() => { const L = window.__ironlog, d = L.state.draft; return d ? { editing: d.editingId, live: L.livePR('bench', d.ex[0].sets[0], d.date) } : null; });
    const during = await listPR();
    ok(before.join() === 'Weight PR' && during.join() === 'Weight PR', '3. (a guard) the PR list counts Oct 30\'s 100 x 8 as a Weight PR, before and during the edit', { before, during });
    ok(edit && edit.editing === 'e2' && edit.live === 'Weight PR', '3. R75-6: opened from History\'s Edit, its 100 x 8 reads as the Weight PR the list counts (2.29: no PR, judged against its own saved version)', edit);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
    const today = await ev(() => window.__ironlog.livePR('bench', { w: 100, r: 8, rir: null, warm: false, drop: false, done: true }, '2026-11-06'));
    ok(today === null, '3. (a guard) a new workout today at 100 x 8 ties Oct 30: no PR', today);
    ok(!D.errors.length, '3. no page errors', D.errors);
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
