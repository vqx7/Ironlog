// The app's messages (the toast at the foot of the page), held to one rule (2.48; V 2026-11-10, after NEW-116: "Should
// there not be a general system architect level rule or logic instead of for just this one toast"). A feature suite
// (CLAUDE.md, Tests). Run on the build before (`node tests/messages.js baselines/r93.html`, 2.47) every section fails
// there but the guards, which say so.
//   1  One tap, one message, nothing lost: what one tap says is joined into one message, never one over another; a
//      later tap's message replaces the last (a guard); an Undo offered by any part stays.
//   2  News about the log from storage and sync is never lost: one covered by a tap's message comes back once that
//      message has gone, and one raised while a tap's message shows waits for it.
//   3  Nothing repeats what is on screen: the bodyweight ask lives on Plan under the bodyweight lift, not in a message.
//   4  A message stays long enough to read: never less than its words take, 0.3 s a word (a convention, docs/EVIDENCE.md),
//      so the 14 words of Hide's message on the account card are still there at 3.6 s, and gone by 5.2 s (REV16-B2: every
//      message without Undo went at 2.6 s, whatever its length).
//   5  A long message lays out across the screen, not in half of it: Hide's 14 words are two lines at 390 px, and at
//      320 px the box is centred inside the screen with nothing to scroll sideways; a short message stays as wide as
//      its words (a guard). REV16-I1, V 2026-11-13: the box laid out in half the screen, four lines 195 px wide.
//   6  A sheet is the lifter busy with something else (2.78.1; V 2026-11-25, "Do not mistime the toasts"): news about
//      the log never shows over one. News raised while a sheet is open waits for it to close; news showing when a
//      sheet opens goes and comes back after it; news raised while other news is unread waits its turn, so neither is
//      lost; a tap's message in a sheet still shows (a guard). A note the app says once waits for a calm moment, goes
//      when a sheet opens over it, and is said another time if it went before it could be read: the rest timer's note
//      about a locked screen, which sat over Finish's sheet and the recap for 6 seconds on 2.78. It goes unsaid once its
//      rest is over, and is marked said only once read, so the app closed while it waits leaves it due (REV33-3 and
//      REV33-4, failing on 2.78.1 as pushed, d06c8176).
//   7  A new lifter's first visit, end to end on the built app in an iPhone's browser (2.78.1): first pages, a
//      ready-made routine, a workout, Finish, the recap, Today again. Read every 40 ms, Today never shows two lines
//      at once (2.78: "Only on this phone" and "Get the app" together after the first workout), and news or a note
//      never shows over an open sheet.
// MESSAGES_ONLY=1,3 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.MESSAGES_ONLY ? process.env.MESSAGES_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-10';

async function phone(w = 390) {
  const P = await open(FILE, { w, h: 844, clock: DAY + 'T10:00:00', realStarter: true });
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

  if (run(4)) {
    const P = await phone();
    const said = await P.page.evaluate(() => { window.__ironlog.ACT.acctLater(); const t = document.getElementById('toast'); return t.hidden ? '' : t.textContent.trim(); });
    const words = said.split(/\s+/).filter(Boolean).length;
    await wait(3600); const at36 = await shown(P);
    await wait(1600); const at52 = await shown(P);
    ok(words === 14 && /Hidden\. Sign in/.test(at36.text), '4. Hide\'s 14-word message on the account card is still there at 3.6 s, long enough to read', { words, at36 });
    ok(at52.text === '', '4. and gone by 5.2 s, its words read', at52);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(5)) {
    // The box as a lifter sees it: its lines (its height less its padding, over a line's height), where it sits, and
    // whether the page now scrolls sideways.
    const box = P => P.page.evaluate(() => {
      const t = document.getElementById('toast'), cs = getComputedStyle(t), b = t.getBoundingClientRect();
      const inner = b.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      return { text: t.textContent.trim(), w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right),
        lines: Math.round(inner / parseFloat(cs.lineHeight)), page: (document.getElementById('page')||document.documentElement).scrollWidth };
    });
    for (const w of [390, 320]) {
      const P = await phone(w);
      await P.page.evaluate(() => window.__ironlog.ACT.acctLater());
      const long = await box(P);
      if (w === 390) ok(long.lines <= 2 && long.w > w / 2, '5. at 390 px Hide\'s 14 words run across the screen in two lines, not down half of it', long);
      ok(long.left >= 0 && long.right <= w && Math.abs(long.left - (w - long.right)) <= 1 && long.page <= w, `5. at ${w} px the box is centred inside the screen, with nothing to scroll sideways`, long);
      await tapAway(P);
      await P.page.evaluate(() => window.__ironlog.toast('Saved'));
      const short = await box(P);
      ok(short.text === 'Saved' && short.w < w / 2 && short.lines === 1, `5. (a guard) at ${w} px a one-word message stays as wide as its word`, short);
      await P.ctx.close(); await P.browser.close();
    }
  }

  if (run(6)) {
    const P = await phone();
    const sheet = () => P.page.evaluate(() => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode: 'addDay', day: 0, title: 'Add', q: '', m: '' }); });
    const close = () => P.page.evaluate(() => window.__ironlog.ACT.mClose());
    const news = m => P.page.evaluate(m => window.__ironlog.toast(m, null, null, 'notice'), m);
    // The message taken away, as Undo's tap does (on a build before toastHide was on the hook, by hiding it).
    const hide = () => P.page.evaluate(() => { const L = window.__ironlog; if (L.toastHide) L.toastHide(); else document.getElementById('toast').hidden = true; });
    // News raised while a sheet is open waits for it to close.
    await sheet(); await wait(200);
    await news('1 item was edited on two devices. The later edit was kept.'); await wait(150);
    const over = await shown(P);
    await close(); await wait(250);
    const after = await shown(P);
    ok(!over.text && /edited on two devices/.test(after.text), '6. news raised while a sheet is open waits, and shows once the sheet closes (2.78: over the sheet)', { over, after });
    await hide(); await tapAway(P); await wait(100);
    // News showing when a sheet opens goes, and comes back once it closes.
    await news('Signed in. Syncing your log.'); await wait(150);
    await sheet(); await wait(200);
    const under = await shown(P);
    await close(); await wait(250);
    const back = await shown(P);
    ok(!under.text && /Signed in/.test(back.text), '6. news showing when a sheet opens goes, and comes back once it closes', { under, back });
    await hide(); await tapAway(P); await wait(100);
    // News raised while other news is unread waits its turn: both are seen.
    await news('First news'); await wait(100);
    await P.page.evaluate(() => new Promise(r => setTimeout(() => { window.__ironlog.toast('Second news', null, null, 'notice'); r(); }, 0)));
    await wait(100);
    const first = await shown(P);
    const seen = [first.text];
    for (let i = 0; i < 40 && seen.length < 2; i++) { await wait(200); const t = (await shown(P)).text; if (t && t !== seen[seen.length - 1]) seen.push(t); }
    ok(first.text === 'First news' && seen[1] === 'Second news', '6. news raised while other news is unread waits its turn, and both are seen (2.78: the second replaced the first)', seen);
    await hide(); await tapAway(P); await wait(100);
    // The same news again while it shows unread: said once, not twice in a row (REV33-12).
    const twice = await P.page.evaluate(async () => { const L = window.__ironlog; L.toast('Same news', null, 8000, 'notice'); await new Promise(r => setTimeout(r, 300)); L.toast('Same news', null, 8000, 'notice'); return L.toastPending ? L.toastPending() : null; });
    ok(twice && twice.length === 1 && twice[0] === 'Same news', '6. the same news raised again while it shows is said once, not again after it', twice);
    // Everything in line gone, so the checks below start clear on any build.
    await P.page.evaluate(() => { const L = window.__ironlog; for (let i = 0; i < 5 && L.toastPending && L.toastPending().length; i++) L.toastHide(); });
    await tapAway(P); await wait(100);
    // A tap's message in a sheet still shows (a guard).
    await sheet(); await wait(200);
    await P.page.evaluate(() => window.__ironlog.toast('Copied'));
    const tapMsg = await shown(P);
    ok(tapMsg.text === 'Copied', '6. (a guard) a tap\'s message in a sheet still shows: it answers the tap', tapMsg);
    await close(); await hide(); await tapAway(P); await wait(100);
    // A note said once: it waits for a calm moment, goes when a sheet opens over it, and its read check says so.
    // On a build before noteOnce, the note is not said at all.
    await P.page.evaluate(() => { window.__read = []; const L = window.__ironlog; L.toast('A tap answered'); if (L.noteOnce) L.noteOnce('A note said once', 6000, seen => window.__read.push(seen)); });
    await wait(150);
    const waited = await shown(P);
    await hide(); await wait(700);
    const calm = await shown(P);
    await sheet(); await wait(200);
    const gone = await shown(P);
    await wait(4200);
    const read1 = await P.page.evaluate(() => window.__read.slice());
    await close(); await wait(300);
    const notBack = await shown(P);
    ok(waited.text === 'A tap answered' && calm.text === 'A note said once', '6. a note said once waits for a calm moment: after the message showing', { waited, calm });
    ok(!gone.text && read1[0] === false && notBack.text !== 'A note said once', '6. a sheet opening over it sends it away, and it counts as not read, to be said another time (not brought back over the next screen)', { gone, read1, notBack });
    await P.page.evaluate(() => { window.__read = []; const L = window.__ironlog; if (L.noteOnce) L.noteOnce('A note left to be read', 6000, seen => window.__read.push(seen)); });
    await wait(4400);
    ok((await P.page.evaluate(() => window.__read.slice()))[0] === true, '6. a note left on screen through its read time counts as read');
    await P.ctx.close(); await P.browser.close();

    // The rest timer's note on a locked screen, in a real session: a set ticked, then Finish within two seconds.
    const Q = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00', realStarter: true });
    await Q.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'lb'; localStorage.setItem(L.KEY + '.installLater', '1'); L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render(); });
    await wait(150);
    await Q.page.click('.hero [data-act="startSession"]'); await wait(300);
    await Q.page.fill('.sg input[data-f="w"]', '50');
    await Q.page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
    await Q.page.click('[data-act="sDone"]'); await wait(900);
    const said = (await shown(Q)).text;
    await Q.page.click('[data-act="finish"]'); await wait(300);
    const onFinish = await Q.page.evaluate(() => { const t = document.getElementById('toast'), m = document.getElementById('modal'); return { sheet: !m.hidden, toast: t.hidden ? '' : t.textContent }; });
    await wait(4200);
    const mark = await Q.page.evaluate(() => localStorage.getItem(window.__ironlog.KEY + '.tipWake'));
    ok(/locked screen/.test(said), '6. the locked-screen note shows at the first rest', said);
    ok(onFinish.sheet && !/locked screen/.test(onFinish.toast), '6. Finish\'s sheet opening sends the note away: it never sits over the sheet (2.78: 6 seconds over Finish and the recap)', onFinish);
    ok(mark === null, '6. gone before it could be read, the note is left to be said at a later rest', { mark });
    await Q.ctx.close(); await Q.browser.close();

    // A new phone where the note is due (REV33-3, REV33-4): a phone that remembers every message it showed.
    const fresh = async () => {
      const R = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00', realStarter: true });
      await R.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'lb'; localStorage.setItem(L.KEY + '.installLater', '1'); L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render(); });
      await wait(150);
      await R.page.click('.hero [data-act="startSession"]'); await wait(300);
      await R.page.fill('.sg input[data-f="w"]', '50');
      await R.page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
      return R;
    };
    const record = R => R.page.evaluate(() => { window.__said = []; const t = document.getElementById('toast'); new MutationObserver(() => { if (!t.hidden && /locked screen/.test(t.textContent)) window.__said.push({ tab: window.__ironlog.ui.tab, workout: !!window.__ironlog.state.draft }); }).observe(t, { attributes: true, childList: true, subtree: true }); });
    const tipMark = R => R.page.evaluate(() => localStorage.getItem(window.__ironlog.KEY + '.tipWake'));
    // The last set ticked and Finish tapped at once, before the note's first look: the rest is over by the time Finish's
    // sheet and the recap have gone, so the note goes unsaid and stays due (2.78.1 said it on Today after the workout).
    const F = await fresh();
    await record(F);
    await F.page.click('[data-act="sDone"]'); await wait(300);
    await F.page.click('[data-act="finish"]'); await wait(800);
    await F.page.evaluate(() => { const b = document.querySelector('#modal .btn.primary'); if (b) b.click(); }); await wait(3000);
    await F.page.evaluate(() => window.__ironlog.ACT.mClose()); await wait(4500);
    const late = { said: await F.page.evaluate(() => window.__said), saved: await F.page.evaluate(() => window.__ironlog.state.sessions.length), mark: await tipMark(F) };
    ok(late.saved === 1 && late.said.length === 0 && late.mark === null, '6. Finish tapped as the rest began: the note is not said after the workout, with no rest to be about, and stays due', late);
    await F.ctx.close(); await F.browser.close();
    // A sheet opened as the rest began and the app closed while the note waits: the note is said at the next rest and
    // marked once read (2.78.1 marked it before it was said, so it was never said on that phone).
    const C = await fresh();
    await C.page.click('[data-act="sDone"]'); await wait(200);
    await C.page.evaluate(() => window.__ironlog.ACT.menuOpen()); await wait(3000);
    const markClosed = await tipMark(C);
    await C.page.reload(); await C.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(500);
    await record(C);
    await C.page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await wait(1500);
    const saidNext = await C.page.evaluate(() => window.__said.length);
    await wait(4000);
    const markRead = await tipMark(C);
    ok(markClosed === null && saidNext > 0 && markRead === '1', '6. the app closed while the note waits behind a sheet: it is said at the next rest, and marked said once read', { markClosed, saidNext, markRead });
    await C.ctx.close(); await C.browser.close();
  }

  if (run(7)) {
    // The built app, its account code against the stand-in server, in an iPhone's Safari.
    const fs = require('fs'), os = require('os'), path = require('path');
    const H = require('./h');
    const { start } = require('./fake-supabase');
    H.build();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-msg-'));
    fs.cpSync(path.join(__dirname, '..', 'dist'), tmp, { recursive: true });
    const fake = await start(tmp);
    const html = fs.readFileSync(path.join(tmp, 'index.html'), 'utf8');
    fs.writeFileSync(path.join(tmp, 'index.html'), H.cspFix(html.replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
    const browser = await H.engine.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' });
    // Read every 40 ms from the first draw: the lines on Today, the message and whose it is, and whether a sheet is open.
    await ctx.addInitScript(() => {
      const log = (window.__seen = []);
      setInterval(() => {
        const t = document.getElementById('toast'), m = document.getElementById('modal');
        log.push({ lines: [...document.querySelectorAll('.acctbar')].filter(e => e.getClientRects().length).map(e => e.id),
          by: t && !t.hidden ? t.dataset.by || 'tap' : '', text: t && !t.hidden ? t.textContent : '', sheet: !!m && !m.hidden, step: window.__step || '' });
      }, 40);
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const step = async (name, f, ms) => { await page.evaluate(n => { window.__step = n; }, name); await f(); await wait(ms || 900); };
    const all = [];
    await page.goto(fake.base + '/ironlog/'); await wait(2500);
    await step('Continue without an account', () => page.click('[data-act="obAcctLater"]'));
    await step('Pick a ready-made routine', () => page.click('[data-act="obSample"]'));
    await step('a routine picked', () => page.click('[data-act="tplPick"][data-k="full3"]'), 1500);
    await step('Start session', () => page.click('.hero [data-act="startSession"]'), 1200);
    for (let i = 0; i < 3; i++) await step('a set ticked', async () => { const w = await page.$$('.sg input[data-f="w"]'); await w[i].fill('50'); await page.evaluate(() => document.activeElement.blur()); await page.click(`[data-act="sDone"][data-b="0"][data-s="${i}"]`); }, 700);
    await step('Finish', () => page.click('[data-act="finish"]'), 1200);
    await step('Finish anyway', async () => { const b = await page.$('#modal .btn.primary'); if (b) await b.click(); }, 2000);
    await step('the recap closed', () => page.evaluate(() => window.__ironlog.ACT.mClose()), 1500);
    all.push(...(await page.evaluate(() => window.__seen)));
    await step('opened again', () => page.reload(), 3000);
    all.push(...(await page.evaluate(() => window.__seen)));
    const two = all.filter(x => x.lines.length > 1);
    // Whose message it is, as the toast marks it; on a build before the mark, the rest timer's note by its words.
    const overSheet = all.filter(x => x.sheet && (x.by === 'news' || x.by === 'note' || /locked screen/.test(x.text)));
    const saved = await page.evaluate(() => window.__ironlog.state.sessions.filter(x => !x.demo).length);
    ok(saved === 1 && all.some(x => x.lines.length === 1), '7. the first visit runs end to end: a workout saved, and Today offers its one line', { saved, lines: [...new Set(all.map(x => x.lines.join('+')))] });
    ok(!two.length, '7. Today never shows two lines at once, read every 40 ms through the first visit (2.78: two after the first workout)', two.slice(0, 3));
    ok(!overSheet.length, '7. news or a note never shows over an open sheet through the first visit (2.78: the locked-screen note over Finish and the recap)', overSheet.slice(0, 3));
    ok(!errors.length, '7. no page errors', errors);
    await browser.close(); if (fake.close) fake.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
