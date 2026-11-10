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
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
