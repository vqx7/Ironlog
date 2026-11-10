// 2.41 (build r87; PENDING.md's tracker), each section written as what a lifter expects and run first on 2.40
// (`node tests/r87.js baselines/r86.html`), where each fails unless it says it guards:
//   1  NEW-101 (V, 2026-11-09 16:27: "if i start a blank sesh they stay open as I add each exercise ... That dot that
//      used to be there or the dropdown arrow triangle ... should be back, in each exercise on Today session's top
//      right"): every exercise in a session has the fold button at its top right, done or not; tapped, an exercise not
//      done folds to one row naming it with the sets it has done of its sets, and no tick; tapped, it opens again with
//      every number as it was; folding changes nothing in the log; a lift folded by hand takes the pills with it, to the
//      next lift not folded.
//   2  (a guard) a done exercise folds as before: by itself after its last tick, and by its fold button once opened.
//   3  REV7-C (the review of 2.38): the pills' unit label is drawn at full strength, as the number beside it is (it was
//      at 0.75 opacity, 3.4 to 4.1 to 1 on blue, violet, red and pink, under the 4.5 to 1 the stylesheet states).
//   4  REV8-1 (the independent review of 2.36 to 2.41, F1): an edit of a saved session is never set aside, as it is a
//      copy of the log that goes stale: Edit tapped again on the session being edited asks first, as 2.35 did, and an
//      edit open when a past workout is logged asks too; the change saved in the second edit stays.
//   5  REV8-2 (the same review, F2): a lift folded by hand is skipped by everything that says what comes next: after the
//      lift above it is done, the rest card names the one after it, the screen brings that one up, and the pills are on
//      it.
//   6  REV8-3 (the same review, F3; on 2.35 too): Undo after Replace my data, with a backup holding a workout in
//      progress of its own, brings back the workout that was open, its ticked sets with it.
//   7  REV8-O1 (the same review): reps typed in a set and then a minus or plus on its pill with the keyboard still open
//      tick the set, as the same reps typed with the keyboard closed first do (one rule; before, the set stayed unticked).
// R87_ONLY=1,2,3 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R87_ONLY ? process.env.R87_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-09';

/** The app with the demo log as the lifter's own, in kg, on Today. */
async function app(o = {}) {
  const D = await open(FILE, { w: 390, h: 844, dark: !!o.dark, clock: DAY + 'T10:00:00' });
  await D.page.evaluate(acc => {
    const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg';
    if (acc) L.state.settings.accent = acc;
    L.makeDemo(); for (const x of L.state.sessions) delete x.demo; for (const x of L.state.bodyweights) delete x.demo;
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render();
  }, o.accent || null);
  await wait(300);
  return D;
}
const draftEx = D => D.page.evaluate(() => JSON.stringify(window.__ironlog.state.draft.ex.map(b => [b.exId, b.sets.map(s => [s.w, s.r, !!s.done])])));
const folded = D => D.page.evaluate(() => [...document.querySelectorAll('#view section.block')].map(s => s.classList.contains('folded')));
const pillsOn = D => D.page.evaluate(() => [...document.querySelectorAll('#view .stepr')].map(e => +e.closest('[id^="blk-"]').id.slice(4)));

(async () => {
  if (run(1)) {
    const D = await app();
    await D.page.click('[data-act="startSession"]'); await wait(500);
    const n = await D.page.evaluate(() => window.__ironlog.state.draft.ex.length);
    const btns = await D.page.evaluate(() => [...document.querySelectorAll('#view section.block:not(.folded) .bh-acts [data-act="bFold"]')].length);
    ok(n >= 3 && btns === n, '1. every exercise not done has the fold button at its top right', { n, btns });
    // A load typed in the second lift, then the lift folded.
    await D.page.fill('#view input[data-f="w"][data-b="1"][data-s="0"]', '40'); await wait(300);
    const before = await draftEx(D);
    await D.page.click('#view [data-act="bFold"][data-b="1"]'); await wait(300);
    const row = await D.page.evaluate(() => { const s = document.getElementById('blk-1'); const b = s && s.querySelector('.bfold'); return s && { folded: s.classList.contains('folded'), text: b ? b.innerText.replace(/\s+/g, ' ').trim() : '', tick: !!(b && b.querySelector('.bf-ck:not(.bf-todo)')), label: b && b.getAttribute('aria-label') }; });
    const sets1 = await D.page.evaluate(() => window.__ironlog.state.draft.ex[1].sets.filter(s => !s.warm && !s.drop).length);
    ok(row && row.folded && new RegExp(`0 of ${sets1} sets`).test(row.text) && !row.tick, '1. tapped, an exercise not done folds to one row: its name, 0 of its sets done, no tick', row);
    ok(await draftEx(D) === before, '1. folding changes nothing in the workout', { before, after: await draftEx(D) });
    await D.page.click('#view #blk-1 [data-act="bOpen"]'); await wait(300);
    const back = await D.page.evaluate(() => { const f = document.querySelector('#view input[data-f="w"][data-b="1"][data-s="0"]'); return { folded: document.getElementById('blk-1').classList.contains('folded'), w: f && f.value }; });
    ok(!back.folded && back.w === '40', '1. tapped again, it opens with the load typed as it was', back);
    // The lift the pills are on, folded by hand: the pills go to the next lift not folded.
    const on0 = await pillsOn(D);
    await D.page.click(`#view [data-act="bFold"][data-b="${on0[0]}"]`); await wait(300);
    const on1 = await pillsOn(D);
    ok(on0.length === 1 && on1.length === 1 && on1[0] !== on0[0], '1. the lift the pills are on, folded by hand: they go to the next lift not folded', { on0, on1 });
    // A blank session: each exercise added, as a lifter adds it from the picker, has its fold button.
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); if (L.ui.modal) L.ACT.mClose(); L.ACT.startFree(); });
    await wait(300);
    for (const [q, id] of [['bench press', 'bench'], ['pull-up', 'pullup']]) {
      if ((await D.page.evaluate(() => { const m = window.__ironlog.ui.modal; return m && m.kind; })) !== 'picker') await D.page.click('#view [data-act="pickSession"]');
      await wait(200); await D.page.fill('#pickQ', q); await wait(200); await D.page.click(`#modal [data-act="pickDo"][data-ex="${id}"]`); await wait(300);
      await D.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await wait(150);
    }
    const blank = await D.page.evaluate(() => ({ n: window.__ironlog.state.draft.ex.length, btns: [...document.querySelectorAll('#view section.block:not(.folded) .bh-acts [data-act="bFold"]')].length }));
    ok(blank.n === 2 && blank.btns === 2, '1. in a blank session, each exercise added has the fold button', blank);
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.browser.close();
  }
  if (run(2)) {
    const D = await app();
    await D.page.click('[data-act="startSession"]'); await wait(500);
    const sets0 = await D.page.evaluate(() => window.__ironlog.state.draft.ex[0].sets.length);
    for (let si = 0; si < sets0; si++) { await D.page.click(`#view [data-act="sDone"][data-b="0"][data-s="${si}"]`); await wait(350); }
    await wait(2000);
    ok((await folded(D))[0] === true, '2. (a guard) a done exercise folds by itself after its last tick');
    const ck = await D.page.evaluate(() => !!document.querySelector('#blk-0 .bf-ck:not(.bf-todo)'));
    ok(ck, '2. (a guard) folded, a done exercise shows its tick');
    await D.page.click('#view #blk-0 [data-act="bOpen"]'); await wait(300);
    ok((await folded(D))[0] === false, '2. (a guard) opened again, it stays open');
    await D.page.click('#view [data-act="bFold"][data-b="0"]'); await wait(300);
    ok((await folded(D))[0] === true, '2. (a guard) its fold button folds it');
    ok(!D.errors.length, '2. no page errors', D.errors);
    await D.browser.close();
  }
  if (run(3)) {
    const out = [];
    for (const accent of ['blue', 'violet', 'red', 'pink', 'volt', 'ember']) for (const dark of [false, true]) {
      const D = await app({ accent, dark });
      await D.page.click('[data-act="startSession"]'); await wait(500);
      const r = await D.page.evaluate(() => { const s = document.querySelector('#view .stepr-v small'), v = document.querySelector('#view .stepr-v b'); if (!s) return null; const cs = getComputedStyle(s); return { op: cs.opacity, color: cs.color, vcolor: getComputedStyle(v).color }; });
      if (!r || r.op !== '1' || r.color !== r.vcolor) out.push({ accent, dark, r });
      await D.browser.close();
    }
    ok(!out.length, '3. REV7-C: the pills\' unit label is at full strength, the colour of the number beside it, in six accents light and dark', out);
  }

  if (run(4)) {
    const D = await app();
    const sid = await D.page.evaluate(() => window.__ironlog.state.sessions.filter(x => x.ex && x.ex.length >= 2 && x.date < '2026-11-09').slice(-1)[0].id);
    const sets = () => D.page.evaluate(id => JSON.stringify(window.__ironlog.state.sessions.find(x => x.id === id).ex.map(b => b.sets.map(x => [x.w, x.r]))), sid);
    const parked = () => D.page.evaluate(() => !!localStorage.getItem(window.__ironlog.KEY + '.parked'));
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), sid); await wait(400);
    const e1 = await D.page.evaluate(() => window.__ironlog.state.draft.id);
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), sid); await wait(400);
    const asked = await D.page.evaluate(() => (window.__ironlog.ui.modal || {}).kind || null);
    ok(asked === 'confirm' && !(await parked()), '4. Edit tapped again on the session being edited asks first, and sets nothing aside', { asked, parked: await parked() });
    await D.page.click('#modal [data-act="mOk"]', { timeout: 3000 }).catch(() => {}); await wait(400);
    const e2 = await D.page.evaluate(() => window.__ironlog.state.draft.id);
    const r0 = await D.page.evaluate(() => window.__ironlog.state.draft.ex[0].sets[0].r);
    await D.page.fill('#view input[data-f="r"][data-b="0"][data-s="0"]', String(Number(r0) + 3)); await wait(200);
    await D.page.evaluate(() => document.activeElement.blur()); await wait(400);
    await D.page.evaluate(() => window.__ironlog.ACT.finishNow()); await wait(500);
    if (await D.page.evaluate(() => !!window.__ironlog.ui.modal)) { await D.page.click('#modal [data-act="mOk"]').catch(() => {}); await wait(300); }
    const saved = await sets();
    const back = await D.page.evaluate(() => window.__ironlog.state.draft);
    ok(e2 !== e1 && JSON.parse(saved)[0][0][1] === Number(r0) + 3 && !back && !(await parked()), '4. the change saved in the second edit stays, and no stale edit comes back', { saved: saved.slice(0, 80), back: !!back });
    // An edit open, then Log a past workout: asked first, nothing set aside.
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), sid); await wait(400);
    await D.page.evaluate(() => window.__ironlog.ACT.pastOpen({ dataset: { date: '2026-11-05' } })); await wait(300);
    await D.page.click('#modal [data-act="pastGo"][data-day="0"]', { timeout: 3000 }).catch(() => {}); await wait(500);
    const asked2 = await D.page.evaluate(() => (window.__ironlog.ui.modal || {}).kind || null);
    ok(asked2 === 'confirm' && !(await parked()), '4. an edit open when a past workout is logged: asked first, nothing set aside', { asked2, parked: await parked() });
    ok(!D.errors.length, '4. no page errors', D.errors);
    await D.browser.close();
  }
  if (run(5)) {
    const D = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00' });
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg'; L.state.settings.timerMode = 'auto'; L.makeDemo(); for (const x of L.state.sessions) delete x.demo; for (const x of L.state.bodyweights) delete x.demo; localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1'); L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render(); });
    await wait(300); await D.page.click('[data-act="startSession"]'); await wait(500);
    const names = await D.page.evaluate(() => window.__ironlog.state.draft.ex.slice(0, 3).map(b => window.__ironlog.exName(b.exId)));
    await D.page.click('#blk-1 [data-act="bFold"]'); await wait(300);
    const n = await D.page.evaluate(() => window.__ironlog.state.draft.ex[0].sets.length);
    for (let si = 0; si < n; si++) { await D.page.click(`#view [data-act="sDone"][data-b="0"][data-s="${si}"]`); await wait(250); }
    const rest = await D.page.evaluate(() => ((document.getElementById('timer') || {}).textContent || '').replace(/\s+/g, ' '));
    ok(rest.includes('next: ' + names[2]) && !rest.includes(names[1] + ' '), `5. after the lift above a lift folded by hand is done, the rest card names the one after it (${names[2]})`, rest.slice(0, 120));
    await wait(1800);
    const r = await D.page.evaluate(() => ({ pills: [...document.querySelectorAll('#view .stepr')].map(e => +e.closest('[id^="blk-"]').id.slice(4)), top2: Math.round(document.getElementById('blk-2').getBoundingClientRect().top), bar: Math.round((document.querySelector('.wkbar, #wkbar') || document.body).getBoundingClientRect().bottom) }));
    ok(JSON.stringify(r.pills) === '[2]' && r.top2 < 150, '5. the screen brings that lift up and the pills are on it', r);
    ok(!D.errors.length, '5. no page errors', D.errors);
    await D.browser.close();
  }
  if (run(6)) {
    const D = await app();
    await D.page.click('[data-act="startSession"]'); await wait(400);
    for (const si of [0, 1]) { await D.page.click(`#view [data-act="sDone"][data-b="0"][data-s="${si}"]`); await wait(300); }
    const w0 = await D.page.evaluate(() => { const d = window.__ironlog.state.draft; return JSON.stringify([d.id, d.ex.map(b => b.sets.map(s => [s.w, s.r, !!s.done]))]); });
    const backup = await D.page.evaluate(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); s.sessions = s.sessions.slice(2); s.draft = { ...s.draft, id: 'other-workout-id', ex: s.draft.ex.map(b => ({ ...b, sets: b.sets.map(x => ({ ...x, done: false })) })) }; return JSON.stringify(s); });
    await D.page.evaluate(t => window.__ironlog.importData(t), backup); await wait(300);
    await D.page.click('#modal [data-act="mOk"]').catch(() => {}); await wait(500);
    const imported = await D.page.evaluate(() => window.__ironlog.state.draft && window.__ironlog.state.draft.id);
    await D.page.evaluate(() => window.__ironlog.ACT.undo()); await wait(600);
    const w1 = await D.page.evaluate(() => { const d = window.__ironlog.state.draft; return d && JSON.stringify([d.id, d.ex.map(b => b.sets.map(s => [s.w, s.r, !!s.done]))]); });
    ok(imported === 'other-workout-id' && w1 === w0, '6. Undo after Replace my data, the backup holding a workout of its own, brings back the workout that was open, ticked sets and all', { imported, back: (w1 || '').slice(0, 80), was: w0.slice(0, 80) });
    ok(!D.errors.length, '6. no page errors', D.errors);
    await D.browser.close();
  }
  if (run(7)) {
    const D = await open(FILE, { w: 390, h: 844, touch: true, clock: DAY + 'T10:00:00' });
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg'; L.makeDemo(); for (const x of L.state.sessions) delete x.demo; localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1'); L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render(); });
    await wait(300); await D.page.tap('[data-act="startSession"]'); await wait(600);
    await D.page.tap('#view input[data-f="r"][data-b="0"][data-s="0"]'); await D.page.keyboard.type('8'); await wait(100);
    // The keyboard still open: the pill's plus on set 1, straight after the reps.
    await D.page.tap('#blk-0 .stepr-b[data-sf="w"][data-d="1"]'); await wait(600);
    const s0 = await D.page.evaluate(() => { const s = window.__ironlog.state.draft.ex[0].sets[0]; return { r: s.r, done: !!s.done, w: s.w }; });
    ok(s0.r === 8 && s0.done && s0.w != null, '7. reps typed and plus tapped with the keyboard still open: set 1 ticked, with the reps and the load stepped', s0);
    ok(!D.errors.length, '7. no page errors', D.errors);
    await D.browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
