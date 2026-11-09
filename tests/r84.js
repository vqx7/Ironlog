// 2.38 (build r84; PENDING.md's tracker), each section written as what a lifter expects and run first on 2.37
// (`node tests/r84.js baselines/r83.html` once 2.37 is kept there, or on 62c7e09's page), where each fails unless it
// says it guards:
//   1  NEW-98 (V, 2026-11-09: "It will help reduce and avoid the overwhelm"): minus and plus show on the lift you are on,
//      not under every lift: at the start, the first lift; after a tick or a load typed on another lift, that lift; once
//      it is done, the first lift with a set left; in a superset, every lift of the group with a set left (they are done
//      together); after a reload, the first lift with a set left; guard: a lift done shows none.
//   2  NEW-98 with NEW-64's rule (GitHub's run of 2.38: tests/r45.js saw a lift move 93 px when the pills left the lift
//      above it): a tick or a load typed on another lift moves that lift's row by nothing on screen.
// R84_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R84_ONLY ? process.env.R84_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-08';

/** The app with the demo log as the lifter's own, in kg, on Today. */
async function app(o = {}) {
  const D = await open(FILE, { w: o.w || 390, h: 844, dark: !!o.dark, clock: DAY + 'T10:00:00' });
  await D.page.evaluate(() => {
    const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg';
    L.makeDemo(); for (const x of L.state.sessions) delete x.demo; for (const x of L.state.bodyweights) delete x.demo;
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render();
  });
  await wait(300);
  return D;
}

/** The lifts (by place) that show minus and plus now. */
const pillsOn = D => D.page.evaluate(() => [...document.querySelectorAll('#view .stepr')].map(e => +e.closest('[id^="blk-"]').id.slice(4)));
/** Ticks set si of lift bi as a lifter does. */
const tick = async (D, bi, si) => { await D.page.click(`#view [data-act="sDone"][data-b="${bi}"][data-s="${si}"]`); await wait(350); };

(async () => {
  if (run(1)) {
    const D = await app();
    await D.page.click('[data-act="startSession"]'); await wait(500);
    const n = await D.page.evaluate(() => window.__ironlog.state.draft.ex.length);
    ok(n >= 4, '1. (setting up) a session of 4 or more lifts', n);
    ok(JSON.stringify(await pillsOn(D)) === '[0]', '1. at the start, minus and plus show on the first lift only', await pillsOn(D));
    await tick(D, 2, 0);
    ok(JSON.stringify(await pillsOn(D)) === '[2]', '1. after a set of the third lift is ticked, they show on it only', await pillsOn(D));
    // A load typed on the second lift makes it the one you are on.
    await D.page.fill('#view input[data-f="w"][data-b="1"][data-s="0"]', '40'); await wait(350);
    ok(JSON.stringify(await pillsOn(D)) === '[1]', '1. a load typed on the second lift moves them there', await pillsOn(D));
    // Every set of the second lift done: the first lift with a set left.
    const sets1 = await D.page.evaluate(() => window.__ironlog.state.draft.ex[1].sets.length);
    for (let si = 0; si < sets1; si++) await tick(D, 1, si);
    await wait(1200);
    const after = await pillsOn(D);
    ok(JSON.stringify(after) === '[0]', '1. with the second lift done, they go to the first lift with a set left', after);
    ok(!after.includes(1), '1. (a guard) a lift done shows none', after);
    await D.page.reload(); await D.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(600);
    ok(JSON.stringify(await pillsOn(D)) === '[0]', '1. after a reload, the first lift with a set left', await pillsOn(D));
    await D.browser.close();
  }
  if (run(1)) {
    // A superset: lifts 1 and 2 of the session done as one group.
    const D = await app();
    await D.page.click('[data-act="startSession"]'); await wait(500);
    await D.page.evaluate(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[1].plan.ss = 'A'; d.ex[2].plan.ss = 'A'; L.saveNow(); L.render(); });
    await wait(300);
    await tick(D, 1, 0);
    const on = await pillsOn(D);
    ok(JSON.stringify(on) === '[1,2]', '1. in a superset, once a set of it is ticked, minus and plus show on each lift of the group', on);
    await D.browser.close();
  }
  if (run(2)) {
    // NEW-98 must keep NEW-64's rule: a tap moves nothing under the finger. Scrolled so the third lift is mid-screen,
    // with the pills on the first lift above it: a tick there, then a load typed on the second lift.
    const D = await app();
    await D.page.click('[data-act="startSession"]'); await wait(500);
    const at = sel => D.page.evaluate(q => { const e = document.querySelector(q); return e ? Math.round(e.getBoundingClientRect().top) : null; }, sel);
    await D.page.evaluate(() => { const e = document.getElementById('blk-2'); window.scrollBy(0, e.getBoundingClientRect().top - 300); });
    await wait(200);
    const tickSel = '#view [data-act="sDone"][data-b="2"][data-s="0"]';
    const y0 = await at(tickSel);
    await D.page.click(tickSel); await wait(400);
    const y1 = await D.page.evaluate(() => { const L = window.__ironlog, i = L.state.draft.ex.findIndex(x => x.sets[0].done); const e = document.querySelector(`#view [data-act="sDone"][data-b="${i}"][data-s="0"]`); return e ? Math.round(e.getBoundingClientRect().top) : null; });
    ok(y0 != null && Math.abs(y1 - y0) <= 1, '2. a tick on a lift below the one the pills were on moves that row by nothing on screen', { y0, y1 });
    await wait(2500);
    // A load typed on a lift above the one the pills are on: the field stays under the finger.
    await D.page.evaluate(() => { const e = document.getElementById('blk-1'); window.scrollBy(0, e.getBoundingClientRect().top - 300); });
    await wait(200);
    const fSel = '#view input[data-f="w"][data-b="1"][data-s="0"]';
    const f0 = await at(fSel);
    await D.page.fill(fSel, '40'); await wait(400);
    const f1 = await at(fSel);
    ok(f0 != null && Math.abs(f1 - f0) <= 1, '2. a load typed on another lift moves its field by nothing on screen', { f0, f1, on: await pillsOn(D) });
    await D.browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
