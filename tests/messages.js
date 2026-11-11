// The app's messages (the toast at the foot of the page), held to one rule (2.48; V 2026-11-10, after NEW-116: "Should
// there not be a general system architect level rule or logic instead of for just this one toast"). A feature suite
// (CLAUDE.md, Tests). Run on the build before (`node tests/messages.js baselines/r93.html`, 2.47) every section fails
// there but the guards, which say so.
//   1  One tap, one message, nothing lost: what one tap says is joined into one message, never one over another; a
//      later tap's message replaces the last (a guard); an Undo offered by any part stays.
//   2  News about the log from storage and sync is never lost: one covered by a tap's message comes back once that
//      message has gone, and one raised while a tap's message shows waits for it.
//   3  Nothing repeats what is on screen: the bodyweight ask lives on Plan under the bodyweight lift, not in a message.
// MESSAGES_ONLY=1,3 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.MESSAGES_ONLY ? process.env.MESSAGES_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-10';

async function phone() {
  const P = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00', realStarter: true });
  await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'lb';
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.invalidate(); L.render(); });
  await wait(150);
  return P;
}
// The message as it stands ('' when none), and whether it offers Undo.
const shown = P => P.page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? { text: (t.querySelector('span') || t).textContent.trim(), undo: !!t.querySelector('[data-act="undo"]') } : { text: '', undo: false }; });
// A tap somewhere harmless: the user has moved on.
const tapAway = P => P.page.mouse.click(195, 420);

(async () => {
  if (run(1)) {
    // A real tap that says two things: + Create "Band Face Pull" from a Plan day's picker adds it to the day and creates it.
    let P = await phone();
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); });
    await wait(150);
    await P.page.evaluate(() => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode: 'addDay', day: 0, title: 'Add', q: '', m: '' }); }); await wait(200);
    await P.page.fill('#pickQ', 'Band Face Pull'); await P.page.click('#pickList .pick.new'); await wait(100);
    await P.page.selectOption('[data-ebind="primary"]', 'rearDelts');
    await P.page.click('[data-act="exSave"]'); await wait(200);
    let m = await shown(P);
    ok(/added to/.test(m.text) && /created/.test(m.text), '1. creating an exercise from a Plan day\'s picker says both that it was added to the day and that it was created, in one message (2.47: "created and added" over "added to Day 1")', m);
    await P.ctx.close(); await P.browser.close();

    // The rule itself: two messages raised by one tap are one message, each part kept.
    P = await phone();
    await P.page.evaluate(() => { const L = window.__ironlog; L.toast('Bench added to Day 1'); L.toast('It counts toward chest'); });
    m = await shown(P);
    ok(m.text === 'Bench added to Day 1. It counts toward chest', '1. two messages from one tap are joined, each kept (2.47: the second alone)', m);
    // An Undo offered by either part stays on the joined message.
    await tapAway(P); await wait(50);
    await P.page.evaluate(() => { const L = window.__ironlog; L.toast('Set removed', true); L.toast('Rest timer stopped'); });
    m = await shown(P);
    ok(m.undo && /Set removed/.test(m.text) && /Rest timer stopped/.test(m.text), '1. the Undo of one part stays when another joins it', m);
    // A guard: a later tap's message replaces the last, since the lifter has moved on.
    await tapAway(P); await wait(50);
    await P.page.evaluate(() => window.__ironlog.toast('Copied'));
    m = await shown(P);
    ok(m.text === 'Copied', '1. a guard: after another tap, its message replaces the last', m);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(2)) {
    // News about the log, covered by a tap's message before it could be read, comes back once that message has gone.
    let P = await phone();
    const NEWS = 'Sets ticked on another device were saved in History.';
    await P.page.evaluate(n => window.__ironlog.toast(n, null, null, 'notice'), NEWS);
    await wait(300); await tapAway(P); await wait(50);
    await P.page.evaluate(() => window.__ironlog.toast('Copied'));
    let m = await shown(P);
    ok(m.text === 'Copied', '2. a tap\'s message shows at once over news from sync', m);
    await wait(3000);
    m = await shown(P);
    ok(m.text === NEWS, '2. and the news comes back once the tap\'s message has gone (2.47: lost)', m);
    await P.ctx.close(); await P.browser.close();
    // News raised while a tap's message shows waits for it, then shows.
    P = await phone();
    await P.page.evaluate(() => window.__ironlog.toast('Session deleted', true));
    await wait(1000);
    await P.page.evaluate(n => window.__ironlog.toast(n, null, null, 'notice'), NEWS);
    m = await shown(P);
    ok(m.text === 'Session deleted' && m.undo, '2. news from sync waits while a tap\'s message with Undo shows (2.47: the Undo was replaced)', m);
    await wait(5500);
    m = await shown(P);
    ok(m.text === NEWS, '2. then the news shows', m);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(3)) {
    // Plan, a day with pull-ups and no weigh-in: the ask is a line under the pull-ups on Plan, never in a message.
    const P = await phone();
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); }); await wait(150);
    await P.page.evaluate(() => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode: 'addDay', day: 0, title: 'Add', q: '', m: '' }); }); await wait(200);
    await P.page.click('#modal [data-act="pickDo"][data-ex="pullup"]'); await wait(300);
    const m = await shown(P);
    ok(/added to/.test(m.text) && !/bodyweight/.test(m.text), '3. adding pull-ups to a Plan day says only what was added (2.47: the bodyweight ask in the message)', m);
    const line = await P.page.evaluate(() => { const e = [...document.querySelectorAll('#view .bwwarn')].find(x => x.offsetParent !== null); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; });
    ok(/counts only the weight you add/.test(line) && /Add bodyweight/.test(line), '3. Plan says it in place, under the pull-ups, with Add bodyweight (2.47: nothing on Plan)', line);
    await P.page.evaluate(() => { const L = window.__ironlog; L.state.bodyweights = [{ id: 'w1', date: '2026-11-01', kg: 80 }]; L.saveNow(); L.invalidate(); L.render(); }); await wait(100);
    const gone = await P.page.evaluate(() => ![...document.querySelectorAll('#view .bwwarn')].some(x => x.offsetParent !== null));
    ok(gone, '3. a guard: with a weigh-in, Plan says nothing about it', gone);
    await P.ctx.close(); await P.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
