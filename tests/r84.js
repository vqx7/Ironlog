// 2.38 (build r84; PENDING.md's tracker), each section written as what a lifter expects and run first on 2.37
// (`node tests/r84.js baselines/r83.html` once 2.37 is kept there, or on 62c7e09's page), where each fails unless it
// says it guards:
//   1  NEW-98 (V, 2026-11-09: "It will help reduce and avoid the overwhelm"): minus and plus show on the lift you are on,
//      not under every lift: at the start, the first lift; after a tick or a load typed on another lift, that lift; once
//      it is done, the lift the screen brings up next (the next one below not done; lifts found by their exercise, as a
//      first tick moves a lift up on a timer, NEW-102); in a superset, every lift of the group with a set left (they are done
//      together); after a reload, the first lift with a set left; guard: a lift done shows none.
//   2  NEW-98 with NEW-64's rule (GitHub's run of 2.38: tests/r45.js saw a lift move 93 px when the pills left the lift
//      above it): a tick or a load typed on another lift moves that lift's row by nothing on screen.
//   3  REV7-1 (the review of 2.38): a lift done but for an unticked warm-up hands the pills to the next lift.
//   4  NEW-100 (V on the 2.38 preview, 2026-11-09: minus and plus "ticking a set done and moving the next one's weight
//      when you +- on the original set"; V's ruling of 12:57, the recommended rule): they change the set you are on,
//      the one you last typed in, touched, stepped or unticked, and only a tick of yours with the checkmark moves them
//      on. Reps typed in set 1 tick it (auto-mark) and the pills stay on set 1, named beside them, so a minus or
//      plus straight after changes set 1, ticked, and nothing else stored; the checkmark tapped moves them to set 2; a
//      touch on set 2's field moves them there; on the last set they stay on its lift until it folds; guard: a minus
//      or plus never ticks or unticks a set.
// R84_ONLY=1,2,3,4 runs some sections. (The review's REV7-2 to REV7-5 are held in tests/r82.js 13 and 14 and tests/r83.js 7.)
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
  const D = await open(FILE, { w: o.w || 390, h: 844, dark: !!o.dark, touch: !!o.touch, clock: DAY + 'T10:00:00' });
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
/** The workout in progress: its id, whether an edit, and every lift's sets. */
const live = D => D.page.evaluate(() => { const d = window.__ironlog.state.draft; return d ? { id: d.id, editing: !!d.editingId, ex: JSON.stringify(d.ex.map(b => [b.exId, b.sets.map(s => [s.w, s.r, !!s.done])])) } : null; });
const tick = async (D, bi, si) => { await D.page.click(`#view [data-act="sDone"][data-b="${bi}"][data-s="${si}"]`); await wait(350); };

(async () => {
  if (run(1)) {
    const D = await app();
    await D.page.click('[data-act="startSession"]'); await wait(500);
    const n = await D.page.evaluate(() => window.__ironlog.state.draft.ex.length);
    ok(n >= 4, '1. (setting up) a session of 4 or more lifts', n);
    ok(JSON.stringify(await pillsOn(D)) === '[0]', '1. at the start, minus and plus show on the first lift only', await pillsOn(D));
    /* Lifts are found by their exercise, not their place: a lift's first tick moves it up the session (r45) a moment
       later, on a timer, so its place depends on how fast the machine runs (NEW-102: on a loaded machine this section read
       the places before the move as after it, on 2.38's own page too). */
    const [X2, X3] = await D.page.evaluate(() => window.__ironlog.state.draft.ex.slice(1, 3).map(b => b.exId));
    const at = id => D.page.evaluate(id => window.__ironlog.state.draft.ex.findIndex(b => b.exId === id), id);
    await tick(D, await at(X3), 0);
    ok(JSON.stringify(await pillsOn(D)) === `[${await at(X3)}]`, '1. after a set of the third lift is ticked, they show on it only', { on: await pillsOn(D), at: await at(X3) });
    // A load typed on the second lift makes it the one you are on.
    await D.page.fill(`#view input[data-f="w"][data-b="${await at(X2)}"][data-s="0"]`, '40'); await wait(350);
    ok(JSON.stringify(await pillsOn(D)) === `[${await at(X2)}]`, '1. a load typed on the second lift moves them there', { on: await pillsOn(D), at: await at(X2) });
    // Every set of the second lift done.
    const sets1 = await D.page.evaluate(id => window.__ironlog.state.draft.ex.find(b => b.exId === id).sets.length, X2);
    for (let si = 0; si < sets1; si++) await tick(D, await at(X2), si);
    await wait(1200);
    const after = await pillsOn(D);
    // The lift the screen brings up after it: the next one below not done (the review of 2.38, REV7-7, corrected this
    // section's first draft, which sent them to the first lift with a set left, above and off screen).
    const next = await D.page.evaluate(id => { const ex = window.__ironlog.state.draft.ex, i = ex.findIndex(b => b.exId === id); return ex.findIndex((b, j) => j > i && b.sets.some(s => !s.done && !s.warm)); }, X2);
    ok(next > 0 && JSON.stringify(after) === `[${next}]`, '1. with the second lift done, they go to the lift the screen brings up next, the one below it not done', { after, next });
    ok(!after.includes(await at(X2)), '1. (a guard) a lift done shows none', after);
    await D.page.reload(); await D.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(600);
    const first = await D.page.evaluate(() => window.__ironlog.state.draft.ex.findIndex(b => b.sets.some(s => !s.done && !s.warm)));
    ok(JSON.stringify(await pillsOn(D)) === `[${first}]`, '1. after a reload, the first lift with a set left', { on: await pillsOn(D), first });
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
  if (run(3)) {
    // REV7-1: a warm-up left unticked on a lift whose working sets are all ticked: the lift is done (it folds), so the
    // pills go to the next lift with a set left.
    const D = await app();
    await D.page.click('[data-act="startSession"]'); await wait(500);
    await D.page.evaluate(() => window.__ironlog.ACT.wAdd({ dataset: { b: '0' } })); await wait(400);
    const n = await D.page.evaluate(() => window.__ironlog.state.draft.ex[0].sets.length);
    for (let si = 1; si < n; si++) await tick(D, 0, si);
    await wait(1500);
    ok(JSON.stringify(await pillsOn(D)) === '[1]', '3. a lift done but for a warm-up: minus and plus go to the next lift with a set left', await pillsOn(D));
    await D.page.reload(); await D.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 }); await wait(800);
    ok(JSON.stringify(await pillsOn(D)) === '[1]', '3. and the same after a reload', await pillsOn(D));
    await D.browser.close();
  }

  if (run(4)) {
    // As on a phone: a finger, and the keyboard closed by leaving the field (Done, or a tap on the page).
    const sets = D => D.page.evaluate(() => window.__ironlog.state.draft.ex[0].sets.map(s => ({ w: s.w, r: s.r, done: !!s.done })));
    const strip = D => D.page.evaluate(() => {
      const e = document.querySelector('#blk-0 .stepr .stepr-l');
      // The set the buttons change (its number was marked in the accent until 2.43, NEW-106; the label names it now).
      const marked = [...new Set([...document.querySelectorAll('#blk-0 .stepr .stepr-b')].map(x => +x.dataset.s))];
      return { name: e ? e.textContent : null, marked };
    });
    const step = async (D, sf, d) => { await D.page.tap(`#blk-0 .stepr-b[data-sf="${sf}"][data-d="${d}"]`); await wait(450); };
    const typeReps = async (D, si, v) => { await D.page.tap(`#view input[data-f="r"][data-b="0"][data-s="${si}"]`); await D.page.keyboard.type(v); await wait(100); await D.page.evaluate(() => document.activeElement.blur()); await wait(450); };
    const D = await app({ touch: true });
    await D.page.tap('[data-act="startSession"]'); await wait(600);
    const s0 = await sets(D);
    await typeReps(D, 0, '8');
    const a = await sets(D);
    ok(a[0].done && a[0].r === 8, '4. (setting up) reps typed in set 1 tick it, auto-mark being on', a[0]);
    const st = await strip(D);
    ok(st.name === 'Set 1' && JSON.stringify(st.marked) === '[0]', '4. after reps typed in set 1, minus and plus stay on set 1, named ("Set 1", no ", done" since 2.42, NEW-105), and the set they change', st);
    const w0 = await D.page.evaluate(() => { const L = window.__ironlog, b = L.state.draft.ex[0]; return L.effW(b, 0); });
    await step(D, 'w', '1');
    const b1 = await sets(D);
    ok(b1[0].w != null && b1[0].w > w0 && b1[0].done, '4. plus then raises set 1, the set just done, which stays ticked', { w0, s: b1[0] });
    ok(b1.slice(1).every((x, i) => x.w === s0[i + 1].w && x.r === s0[i + 1].r && !x.done), '4. and stores nothing on the sets after it', b1);
    await step(D, 'r', '-1');
    const b2 = await sets(D);
    ok(b2[0].r === 7 && b2[0].done, '4. minus on reps lowers set 1 to 7, still ticked', b2[0]);
    // The checkmark of yours moves them on.
    await D.page.tap('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(450);
    const c = await sets(D);
    ok(c[0].done, '4. (setting up) the checkmark tapped straight after auto-mark keeps set 1 ticked', c[0]);
    const st2 = await strip(D);
    ok(st2.name === 'Set 2' && JSON.stringify(st2.marked) === '[1]', '4. the checkmark tapped moves minus and plus on to set 2', st2);
    await step(D, 'w', '1');
    const c2 = await sets(D);
    ok(c2[1].w != null && !c2[1].done && c2[0].w === b2[0].w, '4. plus then changes set 2, unticked, and leaves set 1', c2);
    // A touch on another set's field moves them there.
    await D.page.tap('#view input[data-f="w"][data-b="0"][data-s="2"]'); await wait(450);
    await D.page.evaluate(() => document.activeElement.blur()); await wait(300);
    const st3 = await strip(D);
    ok(st3.name === 'Set 3' && JSON.stringify(st3.marked) === '[2]', '4. a touch on set 3\'s load moves them to set 3', st3);
    // Guard: no minus or plus ticks or unticks a set.
    const before = (await sets(D)).map(x => x.done);
    for (const [f, d] of [['w', '1'], ['w', '-1'], ['r', '1'], ['r', '-1']]) await step(D, f, d);
    const after = (await sets(D)).map(x => x.done);
    ok(JSON.stringify(before) === JSON.stringify(after), '4. (a guard) minus and plus never tick or untick a set', { before, after });
    // The last set: reps typed tick it and the lift is done; the pills stay on it until the lift folds.
    const n = (await sets(D)).length;
    for (let si = 1; si < n - 1; si++) if (!(await sets(D))[si].done) { await D.page.tap(`#view [data-act="sDone"][data-b="0"][data-s="${si}"]`); await wait(450); }
    await typeReps(D, n - 1, '9');
    const l = await sets(D);
    ok(l.every(x => x.done), '4. (setting up) reps typed in the last set tick it and the lift is done', l);
    const st4 = await strip(D);
    ok(st4.name === `Set ${n}` && JSON.stringify(st4.marked) === `[${n - 1}]`, '4. on the last set they stay on it while the lift waits to fold', st4);
    await step(D, 'r', '1');
    ok((await sets(D))[n - 1].r === 10, '4. and plus then changes the last set', (await sets(D))[n - 1]);
    await wait(2600);
    ok(JSON.stringify(await pillsOn(D)) === '[1]', '4. once the lift folds, they go to the next lift', await pillsOn(D));
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
