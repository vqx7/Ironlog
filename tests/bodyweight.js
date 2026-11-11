// Bodyweight, asked for where it matters (372; NEW-116, V 2026-11-10 on the preview: a toast about pull-ups on Today
// over the "is ready" message, with Today's bodyweight card saying the same just below). A feature suite (CLAUDE.md,
// Tests): new checks of the bodyweight note, card and line go here. Run on the build before (`node tests/bodyweight.js
// baselines/r92.html`, 2.46) every section fails there but the guards, which say so.
//   1  Picking a ready-made routine with pull-ups on the first page: its own message stays (the routine is ready, its
//      set targets), with no bodyweight note over it, since Today's card asks right there.
//   2  Adding pull-ups to a Plan day: one message, what was added and the bodyweight note together.
//   3  Adding a ready-made routine on Plan (not made active): its "Tap Make active" stays, with the note in it.
//   4  Adding pull-ups in a session: no note, since the session's card and the line under the lift ask.
//   5  Guards: with a weigh-in no note anywhere; the note once a visit.
// BODYWEIGHT_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.BODYWEIGHT_ONLY ? process.env.BODYWEIGHT_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-10';
// The words the note says, whichever way it is put: the lift counts bodyweight, and where to set it.
const NOTE = /counts your bodyweight/;

// A phone with the starter routine as a first run makes it, signed out, no weigh-in unless bw is given.
async function phone(o = {}) {
  const P = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00', realStarter: true });
  await P.page.evaluate(o => { const L = window.__ironlog; const S = L.state; S.settings.unit = 'lb';
    if (o.onboarded) S.settings.onboarded = true;
    if (o.bw) S.bodyweights = [{ id: 'w1', date: '2026-11-01', kg: o.bw * 0.45359237 }];
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.invalidate(); L.render(); }, o);
  await wait(150);
  return P;
}
// The toast as it stands, or ''.
const toastNow = P => P.page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText.trim() : ''; });
// Pull-ups picked in the exercise picker opened in a mode (addDay on Plan, addBlock in a session).
async function pickPullups(P, mode) {
  await P.page.evaluate(mode => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode, day: 0, title: 'Add', q: '', m: '' }); }, mode);
  await wait(200);
  await P.page.click('#modal [data-act="pickDo"][data-ex="pullup"]'); await wait(300);
}

(async () => {
  if (run(1)) {
    const P = await phone();
    // The first page's Pick a ready-made routine, then Full body, 3 days, trained (its day B has pull-ups).
    await P.page.evaluate(() => window.__ironlog.ACT.obSample({ dataset: {} })); await wait(250);
    await P.page.click('#modal [data-act="tplPick"][data-k="full3t"]'); await wait(300);
    const t = await toastNow(P);
    const card = await P.page.evaluate(() => !!document.getElementById('bwDue'));
    ok(/is ready/.test(t) && !NOTE.test(t), '1. the routine\'s own message stays, with no bodyweight note over it (2.46: "Pull-up counts your bodyweight ..." in its place)', t);
    ok(card, '1. and Today\'s bodyweight card asks, as it did', card);
    ok(!P.errors.length, '1. no page errors', P.errors);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(2)) {
    const P = await phone({ onboarded: true });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); });
    await pickPullups(P, 'addDay');
    const t = await toastNow(P);
    ok(/added to/.test(t) && NOTE.test(t), '2. adding pull-ups to a Plan day says what was added and the bodyweight note, in one message (2.46: the note alone)', t);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(3)) {
    const P = await phone({ onboarded: true });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); L.openModal({ kind: 'templates', from: 'plan' }); });
    await wait(250);
    await P.page.click('#modal [data-act="tplPick"][data-k="full3t"]'); await wait(300);
    const t = await toastNow(P);
    ok(/Tap Make active/.test(t) && NOTE.test(t), '3. adding a ready-made routine on Plan keeps "Tap Make active", with the note in it (2.46: the note alone)', t);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(4)) {
    const P = await phone({ onboarded: true });
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(250);
    await P.page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    await pickPullups(P, 'addBlock');
    const t = await toastNow(P);
    const line = await P.page.evaluate(() => { const L = window.__ironlog; const i = L.state.draft.ex.findIndex(b => b.exId === 'pullup'); const e = document.querySelector(`#blk-${i} .bwwarn`); return { i, line: e ? e.innerText : '' }; });
    ok(!NOTE.test(t), '4. adding pull-ups in a session raises no bodyweight toast (2.46: "Pull-up counts your bodyweight ...")', t);
    ok(line.i >= 0 && /counts only the weight you add/.test(line.line), '4. a guard: the line under the pull-ups still says it', line);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(5)) {
    // With a weigh-in: nothing about bodyweight on Plan.
    let P = await phone({ onboarded: true, bw: 180 });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); });
    await pickPullups(P, 'addDay');
    let t = await toastNow(P);
    ok(/added to/.test(t) && !NOTE.test(t), '5. a guard: with a weigh-in, adding pull-ups says only what was added', t);
    await P.ctx.close(); await P.browser.close();
    // Once a visit: a second pull-up added says no note.
    P = await phone({ onboarded: true });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); });
    await pickPullups(P, 'addDay');
    await P.page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    await P.page.evaluate(() => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode: 'addDay', day: 1, title: 'Add', q: '', m: '' }); }); await wait(200);
    await P.page.click('#modal [data-act="pickDo"][data-ex="dips"]'); await wait(300);
    t = await toastNow(P);
    ok(/added to/.test(t) && !NOTE.test(t), '5. a guard: the note once a visit, so dips added next say only what was added', t);
    await P.ctx.close(); await P.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
