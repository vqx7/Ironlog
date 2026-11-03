// r69, less text on screen (V, 2026-11-03: "Aligned with your recommendations as long as we are not losing value or
// creating new problems that are overriding what was already aligned and functional", after a lifter found the app
// text heavy). Each section asserts the slimmer screen, that every word taken from view is one tap away (the tip is
// opened and read), and that what the screen does still works. Each fails on 16d07ff, the build before
// (`node tests/r69.js <that page>`), unless it says it is a guard.
//   1  Today has no greeting, and the Set up page and Settings no Name field; a name stored by an earlier build is
//      kept through a change and a save.
//   2  A tab's foot: the "+ Section" chips with no heading, the link "Edit sections"; a chip still shows its
//      section, the link still opens Layout, and the menu keeps "Show, hide, or reorder sections".
//   3  The session's exercises have no line of load words under them: the load column's heading shows them in full
//      on a tap (per dumbbell, total, bar included, added to bodyweight, stack setting, machine help), and the reps
//      heading of a lift done one side at a time says reps per side; a load typed is stored as before.
//   4  The session's header: with the bar, when it began and the minutes left, the count the bar's alone (and the
//      bar named to a screen reader); a past workout its date; with no sets to count, the count as before.
//   5  With no weigh-in, the bodyweight line is on the first bodyweight lift still open, once, and moves to the
//      next when that one is done; Set it opens the sheet.
//   6  The check-in is behind a Check-in button beside the date: its sheet asks the three questions, saves them on
//      the session as before, offers a lighter session on two low answers, closes on the third, and Finish keeps
//      them; a past workout has none.
//   7  Stats, By region: the weeks read named short ("4-week average"), the sentence in full in its tip.
//   8  Stats, Muscles: "N muscles rising: keep the sets." with every name in its tip (one muscle: singular).
//   9  Stats, Consistency: "Adherence, 4 weeks: 24 of 24", the percentage and the old sentence in its tip; one week
//      singular; the other states as before.
//  10  Stats, By region: "Every region on target." with what that means in the card's tip.
//  11  Settings, Your data: the privacy and suggestions notes one short line each, every word they said in the i,
//      on this device and inside Claude.
//  12  (a guard) Settings, Effort: what RIR is stays on screen (V's r27 ruling, kept: V, 2026-11-03); the setting works.
// `node tests/r69.js [page]`; R69=1,3 runs some.
const { open, engine } = require('./h');
let browser;
const FILE = process.argv[2] || process.env.IRONLOG_FILE || 'index.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.env.R69 ? process.env.R69.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const NOW = '2026-11-03T18:00:00';

// The demo log, as a lifter's own, on Tuesday evening; the page on the tab given, every fold open when asked.
async function demo(tab, o = {}) {
  const P = await open(FILE, { browser, clock: o.clock || NOW });
  await P.page.evaluate(([tab, name]) => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.autoDone = false; if (name) S.settings.userName = name; L.makeDemo(); for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of L.state[k]) delete x.demo; L.invalidate(); L.saveNow(); L.ui.tab = tab; L.render(); }, [tab, o.name || null]);
  await wait(150);
  return P;
}
const openAll = page => page.evaluate(() => { const L = window.__ironlog; for (let k = 0; k < 2; k++) { document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render(); } document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
// What a tap on an element shows in the tip box ('' for nothing), the tip then hidden again.
const tapTip = async (page, sel) => {
  if (!(await page.$(sel))) return null;
  // In view first, as a finger finds it: a scroll hides a tip, and the click's own scroll would land after it shows.
  await page.$eval(sel, e => e.scrollIntoView({ block: 'center' })); await wait(120);
  await page.click(sel); await wait(80);
  const t = await page.evaluate(() => { const b = document.getElementById('tip'); return b && !b.hidden ? b.textContent : ''; });
  await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }))); await wait(40);
  return t;
};
// A line's own words, its i buttons left out.
const own = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const c = e.cloneNode(true); c.querySelectorAll('.tipi').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); }, sel);
const tipOf = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); const i = e && e.querySelector('.tipi'); return i ? i.getAttribute('data-tip') : null; }, sel);
// A blank session holding the exercises given, each on its own plan.
const FREE = ids => `const L=window.__ironlog;L.ui.tab='today';L.ACT.startFree();L.ACT.mClose();{const d=L.state.draft;for(const id of ${JSON.stringify(ids)})d.ex.push(L.newBlock(id,L.planFor(id,null,null,false,d.date),{before:d.date}));L.saveNow();L.render();}`;
const startToday = async page => { await page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(200); };

// A section that throws on a build without what it reads (a button that is not there) is a failure, and the rest run.
const guard = async f => { try { await f(); } catch (e) { ok(false, 'a section threw: ' + String(e && e.message).split('\n')[0]); } };

(async () => {
  browser = await engine.launch();

  // ---- 1. No greeting, no Name field; a stored name kept.
  if (run(1)) await guard(async () => {
    const P = await open(FILE, { browser, clock: NOW, realStarter: true });
    const ob = await P.page.evaluate(() => { const L = window.__ironlog; try { localStorage.setItem('ironlog.v1.obAcct', 'later'); } catch (e) { /* a guard */ } L.render(); const o = document.getElementById('obPage'); return { step: o && o.dataset.step, name: !!(o && o.querySelector('[data-bind="userName"]')), units: o ? o.querySelectorAll('[data-act="obUnit"]').length : 0, text: o ? o.innerText : '' }; });
    ok(ob.step === 'start' && !ob.name && ob.units === 2 && !/\bName\b/.test(ob.text), '1. the Set up page asks no name, and still the units', ob);
    await P.ctx.close();
    const D = await demo('today', { name: 'V' });
    const t = await D.page.evaluate(() => ({ hello: !!document.querySelector('.hero .hello'), first: ((document.querySelector('.hero .hero-t') || {}).innerText || '').split('\n')[0], eye: (document.querySelector('.hero .eyebrow') || {}).innerText }));
    ok(!t.hello && t.first === t.eye && /TUE NOV 3/i.test(t.first), '1. Today opens on the day, with no greeting, a name stored or not', t);
    await D.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); });
    await openAll(D.page);
    const s = await D.page.evaluate(() => ({ field: !!document.querySelector('#view [data-bind="userName"]'), units: !!document.querySelector('#view [data-bind="unit"]') }));
    ok(!s.field && s.units, '1. Settings, General has no Name field (Units still there)', s);
    await D.page.selectOption('#view [data-bind="theme"]', 'dark'); await wait(150);
    const kept = await D.page.evaluate(() => { const L = window.__ironlog; L.saveNow(); const raw = JSON.parse(localStorage.getItem('ironlog.v1')); return { theme: raw.settings.theme, name: raw.settings.userName, norm: L.normalize(raw).settings.userName }; });
    ok(kept.theme === 'dark' && kept.name === 'V' && kept.norm === 'V', '1. a name an earlier build stored stays in the log through a change and a save', kept);
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 2. A tab's foot.
  if (run(2)) await guard(async () => {
    const D = await demo('today');
    const f = await D.page.evaluate(() => { const m = document.getElementById('moreLine'); return m ? { text: m.innerText.replace(/\s+/g, ' ').trim(), chips: [...m.querySelectorAll('[data-act="secShow"]')].map(b => b.textContent.trim()), link: (m.querySelector('[data-act="goLayout"]') || {}).textContent } : null; });
    ok(f && !/Add to this tab/.test(f.text) && f.link === 'Edit sections' && f.chips.length >= 1 && f.chips.every(c => /^\+ /.test(c)), '2. the foot: the + chips with no heading, then "Edit sections"', f);
    const k = await D.page.evaluate(() => document.querySelector('#moreLine [data-act="secShow"]').dataset.k);
    await D.page.click('#moreLine [data-act="secShow"]'); await wait(150);
    ok(!(await D.page.evaluate(k => window.__ironlog.state.settings.hidden.includes(k), k)), '2. a chip still shows its section, one tap', k);
    await D.page.click('#moreLine [data-act="goLayout"]'); await wait(150);
    ok(await D.page.evaluate(() => window.__ironlog.ui.tab === 'settings' && !!document.querySelector('#view > [data-mkey="layout"]') && document.querySelector('#view > [data-mkey="layout"]').open), '2. Edit sections opens Settings with Layout open');
    await D.page.evaluate(() => window.__ironlog.ACT.menuOpen()); await wait(100);
    const menu = await D.page.evaluate(() => document.getElementById('modal').innerText);
    ok(/Show, hide, or reorder sections/.test(menu), '2. the menu keeps its item "Show, hide, or reorder sections"', menu);
    ok(!D.errors.length, '2. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 3. The load words: in the column heading's tip, not a line under every exercise.
  if (run(3)) await guard(async () => {
    const D = await demo('today');
    const ids = ['dbCurl', 'bench', 'pullup', 'dbRow', 'assistPullup', 'latPulldown'];
    await D.page.evaluate(FREE(ids)); await wait(200);
    const lines = await D.page.evaluate(() => document.querySelectorAll('#view .lmrow, #view .lm').length);
    ok(lines === 0, '3. no exercise has a line of load words under its name', lines);
    const want = [
      ['dbCurl', /LB EACH/i, 'Load: per dumbbell. Enter the weight of one dumbbell. Weight lifted counts both.'],
      ['bench', /^LB$/i, 'Load: total, bar included. Enter everything on the bar, the bar included.'],
      ['pullup', /^\+LB$/i, 'Load: added to bodyweight. Enter only what you add (belt, vest, dumbbell); 0 for bodyweight. Your logged bodyweight is added for estimates.'],
      ['dbRow', /^LB$/i, 'Load: one dumbbell. Enter the weight of the one dumbbell you hold.'],
      ['assistPullup', /HELP LB/i, 'Load: machine help. Enter the help the machine gives, as on its pin. Less help is progress; your logged bodyweight minus the help is what counts.'],
      ['latPulldown', /^STACK$/i, 'Load: stack setting. Enter the pin setting. It is not comparable across machines.']
    ];
    for (const [id, head, tip] of want) {
      const bi = await D.page.evaluate(id => window.__ironlog.state.draft.ex.findIndex(b => b.exId === id), id);
      const h = await D.page.evaluate(bi => document.querySelector(`#blk-${bi} .sg.head .lh`).innerText.trim(), bi);
      const t = await tapTip(D.page, `#blk-${bi} .sg.head .lh`);
      ok(head.test(h) && t === tip, `3. ${id}: the load heading reads ${h}, and a tap on it says "${tip}"`, { h, t });
    }
    const row = await D.page.evaluate(() => window.__ironlog.state.draft.ex.findIndex(b => b.exId === 'dbRow'));
    const rh = await D.page.evaluate(bi => document.querySelectorAll(`#blk-${bi} .sg.head span`)[3].innerText.trim(), row);
    const rt = await tapTip(D.page, `#blk-${row} .sg.head span:nth-child(4)`);
    ok(/REPS\/SIDE/i.test(rh) && rt === 'Reps per side: reps for one side; do the same on the other. One set still counts as one set.', '3. a lift done one side at a time: Reps/side, and a tap says reps per side in full', { rh, rt });
    const curl = await D.page.evaluate(() => window.__ironlog.state.draft.ex.findIndex(b => b.exId === 'dbCurl'));
    await D.page.fill(`#view input[data-f="w"][data-b="${curl}"][data-s="0"]`, '25'); await D.page.dispatchEvent(`#view input[data-f="w"][data-b="${curl}"][data-s="0"]`, 'change'); await wait(100);
    ok(await D.page.evaluate(bi => Math.abs(window.__ironlog.state.draft.ex[bi].sets[0].w - 25 * 0.45359237) < 1e-9, curl), '3. 25 typed on the curls is stored as 25 lb, per dumbbell, as before');
    ok(!D.errors.length, '3. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 4. The session's header.
  if (run(4)) await guard(async () => {
    const D = await demo('today');
    await startToday(D.page);
    const h = () => D.page.evaluate(() => { const b = document.querySelector('#view .sprog .band'); return { meta: document.querySelector('#view .ph .meta').innerText.trim(), of: (document.getElementById('sessOf') || {}).textContent, role: b && b.getAttribute('role'), vt: b && b.getAttribute('aria-valuetext'), now: b && b.getAttribute('aria-valuenow'), hidden: !!document.querySelector('#view .sprog[aria-hidden]'), n: window.__ironlog.state.draft.ex.reduce((a, x) => a + x.sets.filter(s => !s.warm).length, 0) }; });
    const a = await h();
    ok(/^Started 6:00 PM · ~\d+ min left$/.test(a.meta) && a.of === `0 of ${a.n}`, '4. the header: "Started 6:00 PM · ~N min left", the bar 0 of the sets planned', a);
    ok(a.role === 'progressbar' && a.vt === `0 of ${a.n} sets done` && !a.hidden, '4. the bar says the sets done to a screen reader', a);
    await D.page.fill('#view input[data-f="r"][data-b="0"][data-s="0"]', '8'); await D.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(200);
    const m = await D.page.evaluate(() => { const m = window.__ironlog.ui.modal; return m && m.kind; });
    if (m === 'confirm') { await D.page.click('#modal [data-act="mOk"]'); await wait(150); }
    const b = await h();
    ok(b.of === `1 of ${b.n}` && b.now === '1' && !/sets? done/.test(b.meta), '4. a set ticked: the bar 1 of the sets, the line still no count', b);
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
    await D.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ACT.startFree(); L.ACT.mClose(); L.render(); }); await wait(150);
    const c = await D.page.evaluate(() => ({ meta: document.querySelector('#view .ph .meta').innerText.trim(), count: (document.getElementById('doneCount') || {}).textContent, bar: !!document.querySelector('#view .sprog') }));
    ok(/^0 sets done, started 6:00 PM/.test(c.meta) && c.count === '0' && !c.bar, '4. a blank session with nothing in it: no bar, the count said as before', c);
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); const R = L.activeRoutine(); const di = String(R.days.findIndex(x => !x.rest && x.items.length)); L.ACT.pastOpen({ dataset: { date: '2026-11-02' } }); L.ACT.pastGo({ dataset: { day: di } }); L.render(); }); await wait(200);
    const p = await D.page.evaluate(() => ({ kick: document.querySelector('#view .ph .kick').textContent, meta: document.querySelector('#view .ph .meta').innerText.trim(), bar: !!document.querySelector('#view .sprog') }));
    ok(/Past workout/.test(p.kick) && /^For Mon, Nov 2, 2026/.test(p.meta) && !/sets? done/.test(p.meta) && p.bar, '4. a past workout: the date it is for, the count the bar\'s', p);
    ok(!D.errors.length, '4. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 5. The bodyweight line, once a session.
  if (run(5)) await guard(async () => {
    const D = await demo('today');
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.bodyweights = []; L.invalidate(); L.saveNow(); });
    await D.page.evaluate(FREE(['bench', 'pullup', 'dips', 'pushup'])); await wait(200);
    const w = () => D.page.evaluate(() => [...document.querySelectorAll('#view .bwwarn')].map(e => e.closest('section.block').id));
    const a = await w();
    ok(a.join() === 'blk-1', '5. no weigh-in: the line once, on the pull-ups, the first bodyweight lift', a);
    const t = await D.page.evaluate(() => (document.querySelector('#view .bwwarn') || {}).innerText || '');
    ok(/counts only the weight you add/.test(t), '5. it says what it said', t);
    await D.page.evaluate(() => { const L = window.__ironlog; const b = L.state.draft.ex[1]; for (const s of b.sets) { s.w = 0; s.r = 8; s.done = true; } L.saveNow(); L.render(); }); await wait(150);
    const b = await w();
    ok(b.join() === 'blk-2' && await D.page.evaluate(() => document.getElementById('blk-1').classList.contains('folded')), '5. the pull-ups done and folded: the line moves to the dips', b);
    await D.page.click('#blk-2 [data-act="bwOpen"]'); await wait(150);
    ok(await D.page.evaluate(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'bw'), '5. Set it opens the bodyweight sheet');
    ok(!D.errors.length, '5. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 6. The check-in, behind its button.
  if (run(6)) await guard(async () => {
    const D = await demo('today');
    await startToday(D.page);
    const top = await D.page.evaluate(() => ({ fold: !!document.querySelector('#view [data-sk="logger:checkin"]'), btn: ((document.querySelector('#view .lh-row [data-act="chkOpen"]') || {}).textContent || '').trim() }));
    ok(!top.fold && top.btn === 'Check-in', '6. the session opens with no check-in above the exercises, and a Check-in button beside the date', top);
    await D.page.click('#view [data-act="chkOpen"]'); await wait(150);
    const sh = await D.page.evaluate(() => ({ kind: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind, rows: [...document.querySelectorAll('#modal .ci-row')].map(r => r.querySelector('span').textContent + ':' + r.querySelectorAll('[data-act="chk"]').length) }));
    ok(sh.kind === 'checkin' && sh.rows.length === 3, '6. its sheet asks the three questions', sh);
    await D.page.click('#modal [data-act="chk"][data-k="sleep"][data-v="1"]'); await wait(120);
    await D.page.click('#modal [data-act="chk"][data-k="energy"][data-v="1"]'); await wait(120);
    const two = await D.page.evaluate(() => ({ chk: window.__ironlog.state.draft.chk, open: !!window.__ironlog.ui.modal, on: [...document.querySelectorAll('#modal [data-act="chk"][aria-pressed="true"]')].map(b => b.dataset.k + b.dataset.v).join(), light: !!document.querySelector('#view #readyCard [data-act="makeLight"]') }));
    ok(JSON.stringify(two.chk) === '{"sleep":1,"energy":1}' && two.open && two.on === 'sleep1,energy1', '6. two answers saved on the session as before, shown pressed, the sheet still open', two);
    ok(two.light, '6. two low answers: the session offers Make it lighter at its top, as before', two);
    await D.page.click('#modal [data-act="chk"][data-k="joints"][data-v="3"]'); await wait(150);
    const three = await D.page.evaluate(() => ({ chk: window.__ironlog.state.draft.chk, open: !!window.__ironlog.ui.modal, label: document.querySelector('#view [data-act="chkOpen"]').getAttribute('aria-label') }));
    ok(JSON.stringify(three.chk) === '{"sleep":1,"energy":1,"joints":3}' && !three.open && /^Check-in: /.test(three.label), '6. the third answer saves and closes the sheet, as it folded the check-in away', three);
    await D.page.click('#view [data-act="chkOpen"]'); await wait(120);
    await D.page.click('#modal [data-act="chk"][data-k="joints"][data-v="3"]'); await wait(120);
    ok(await D.page.evaluate(() => JSON.stringify(window.__ironlog.state.draft.chk) === '{"sleep":1,"energy":1}'), '6. tapping an answer again clears it, as before');
    await D.page.click('#modal [data-act="mClose"]'); await wait(100);
    await D.page.click('#view #readyCard [data-act="makeLight"]'); await wait(200);
    ok(await D.page.evaluate(() => window.__ironlog.state.draft.ex.some(b => b.light)), '6. Make it lighter still makes the exercises not started lighter');
    // Finish with one set ticked: the check-in is saved with the session.
    await D.page.evaluate(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets[0].w = b.sets[0].w ?? 0; b.sets[0].r = 8; b.sets[0].done = true; L.saveNow(); L.render(); });
    await D.page.click('#view [data-act="finish"]');
    for (let k = 0; k < 6; k++) { await wait(150); const q = await D.page.evaluate(() => { const m = window.__ironlog.ui.modal; return m && m.kind; }); if (q !== 'confirm') break; await D.page.click('#modal [data-act="mOk"]'); }
    const saved = await D.page.evaluate(() => { const S = window.__ironlog.state; const s = S.sessions.find(x => x.date === '2026-11-03'); return { draft: !!S.draft, chk: s && s.chk }; });
    ok(!saved.draft && JSON.stringify(saved.chk) === '{"sleep":1,"energy":1}', '6. Finish saves the check-in with the session', saved);
    await D.page.evaluate(() => { const L = window.__ironlog; L.ACT.mClose && L.ACT.mClose(); const R = L.activeRoutine(); const di = String(R.days.findIndex(x => !x.rest && x.items.length)); L.ACT.pastOpen({ dataset: { date: '2026-11-01' } }); L.ACT.pastGo({ dataset: { day: di } }); L.render(); }); await wait(200);
    ok(await D.page.evaluate(() => !!window.__ironlog.state.draft && window.__ironlog.state.draft.past && !document.querySelector('#view [data-act="chkOpen"]') && !/Check-in/.test(document.getElementById('view').innerText)), '6. a past workout has no check-in, as before');
    ok(!D.errors.length, '6. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 7 and 10. Stats, By region.
  if (run(7) || run(10)) await guard(async () => {
    const D = await demo('dash');
    await D.page.evaluate(() => { const L = window.__ironlog; L.ui.volMode = 'region'; L.render(); });
    await openAll(D.page);
    const card = await D.page.evaluate(() => { const c = document.getElementById('chRadar').closest('.card'); const p = [...c.querySelectorAll('p.small.muted')].find(x => x.querySelector('.tipi')); const q = p.cloneNode(true); q.querySelectorAll('.tipi').forEach(x => x.remove()); return { head: c.querySelector('.headline').textContent.trim(), line: q.textContent.trim(), tip: p.querySelector('.tipi').getAttribute('data-tip'), label: window.__ironlog.regionSrc().label }; });
    if (run(7)) {
      ok(card.line === '4-week average', '7. the weeks read are named short: "4-week average"', card.line);
      ok(card.tip.startsWith('Using your average over the 4 weeks you trained of the last 5, a lighter week left out. ') && /Hard sets per region against the minimum of your weekly targets/.test(card.tip), '7. its i says the sentence in full, then how to read the chart', card.tip);
      ok(card.label === 'your average over the 4 weeks you trained of the last 5, a lighter week left out', '7. (a guard) the weeks read are the same', card.label);
    }
    if (run(10)) {
      ok(card.head === 'Every region on target.', '10. every region inside its target: "Every region on target."', card.head);
      ok(/Every region at or above its minimum, inside its target\./.test(card.tip), '10. its meaning in the card\'s i', card.tip);
    }
    ok(!D.errors.length, '7. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 8. Stats, Muscles: the muscles rising at their volume.
  if (run(8)) await guard(async () => {
    const D = await demo('dash');
    await openAll(D.page);
    const r = await D.page.evaluate(() => { const p = [...document.querySelectorAll('#view p')].find(x => /rising/i.test(x.textContent) && x.querySelector('.tipi') || /Rising at (its|their) volume/.test(x.textContent)); if (!p) return null; const q = p.cloneNode(true); q.querySelectorAll('.tipi').forEach(x => x.remove()); const i = p.querySelector('.tipi'); return { line: q.textContent.replace(/\s+/g, ' ').trim(), tip: i ? i.getAttribute('data-tip') : null }; });
    const m = r && /^(\d+) muscles rising: keep the sets\.$/.exec(r.line);
    const names = r && r.tip && /^Rising at their volume: (.+)\. Keep the sets as they are\.$/.exec(r.tip);
    const list = names ? names[1].replace(/, and /, ', ').split(', ') : [];
    ok(m && +m[1] === 22, '8. one line: "22 muscles rising: keep the sets."', r);
    ok(names && m && list.length === +m[1] && ['Biceps', 'Obliques', 'Neck', 'Side delts'].every(n => list.includes(n)), '8. its i names every one of them, and says to keep the sets as they are', { tip: r && r.tip, n: list.length });
    const w = await D.page.evaluate(() => { const L = window.__ironlog; return L.risingWords ? [L.risingWords(['Chest']), L.risingWords(['Chest', 'Lats', 'Biceps'])] : null; });
    ok(w && w[0].line === '1 muscle rising: keep the sets.' && w[0].tip === 'Rising at its volume: Chest. Keep the sets as they are.' && w[1].line === '3 muscles rising: keep the sets.' && w[1].tip === 'Rising at their volume: Chest, Lats, and Biceps. Keep the sets as they are.', '8. one muscle is said in the singular, and the names take the serial comma', w);
    ok(!D.errors.length, '8. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 9. Stats, Consistency: adherence.
  if (run(9)) await guard(async () => {
    const D = await demo('dash');
    await openAll(D.page);
    const a = await D.page.evaluate(() => { const p = document.getElementById('adhLine'); const q = p.cloneNode(true); q.querySelectorAll('.tipi').forEach(x => x.remove()); const i = p.querySelector('.tipi'); return { line: q.textContent.replace(/\s+/g, ' ').trim(), tip: i && i.getAttribute('data-tip'), sub: (document.querySelector('[data-mkey="consistency"] .sec-s') || {}).textContent }; });
    ok(a.line === 'Adherence, 4 weeks: 24 of 24', '9. "Adherence, 4 weeks: 24 of 24"', a);
    ok(a.tip === 'Adherence, previous 4 full weeks: 100% of planned sessions (24/24)' && /100% adherence/.test(a.sub), '9. the percentage and the full sentence in its i, the percentage still on the fold', a);
    const t = await tapTip(D.page, '#adhLine .tipi');
    ok(!!t && t === a.tip, '9. a tap on the i shows it', t);
    // One full week since the log began, the week of Oct 26: singular.
    const one = await D.page.evaluate(() => { const L = window.__ironlog; const S = L.state; const R = L.activeRoutine(); const days = R.days.map((d, i) => [d, i]).filter(([d]) => !d.rest && d.items.length);
      const mk = (id, date, di) => ({ id, date, dayIdx: di, dayId: R.days[di].id, dayName: R.days[di].name, routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 1, done: true }] }] });
      S.sessions = []; let n = 0; for (const ws of ['2026-10-26']) days.slice(0, 3).forEach(([, di], k) => S.sessions.push(mk('o' + n++, L.addDays(ws, k), di)));
      L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.render(); for (let k = 0; k < 2; k++) { document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render(); }
      const p = document.getElementById('adhLine'); const q = p.cloneNode(true); q.querySelectorAll('.tipi').forEach(x => x.remove()); const i = p.querySelector('.tipi'); return { line: q.textContent.replace(/\s+/g, ' ').trim(), tip: i && i.getAttribute('data-tip') }; });
    ok(/^Adherence, 1 week: 3 of \d+$/.test(one.line) && /^Adherence, previous 1 full week: \d+% of planned sessions \(3\/\d+\)$/.test(one.tip), '9. one full week: "Adherence, 1 week", in the singular, its i too', one);
    const free = await D.page.evaluate(() => { const L = window.__ironlog; L.state.settings.todayStart = 'free'; L.state.activeRoutineId = null; L.state = L.normalize(L.state); L.invalidate(); L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render(); return ((document.getElementById('adhLine') || {}).textContent || '').trim(); });
    ok(/^Adherence: /.test(free) && !/\d+ of \d+/.test(free), '9. (a guard) the other states read as before', free);
    ok(!D.errors.length, '9. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 11. Settings, Your data: the privacy and suggestions notes.
  if (run(11)) await guard(async () => {
    const D = await demo('settings');
    await openAll(D.page);
    const SAFETY = await D.page.evaluate(() => window.__ironlog.SAFETY_TXT);
    // The source page has no account service; the built app has one, signed out here (signed in: tests/accounts.js).
    const auth = await D.page.evaluate(() => !!window.ironlogAuth);
    const want = auth
      ? ['Privacy: nothing sent without an account.', "No ads, no tracking, and nothing sent without an account. Reports you send go to the app owner. Opening or updating the app downloads it from GitHub Pages, which, like any website host, sees your IP address; after that it works offline. With an account, your log and email are stored in a Supabase database, readable by your account and by the app owner; the email is used only to sign in and reset your password. A new password is checked against known breaches with only the first 5 characters of its hash. Deleting the app or this site's data deletes the copy on this device, so keep a backup file or an account."]
      : ['Privacy: your log stays on this device.', "No account, no ads, no tracking. Your log stays on this device and is sent nowhere. Reports you send go to the app owner. Ironlog has no server. Opening or updating the app downloads it from GitHub Pages, which, like any website host, sees your IP address; after that it works offline. Backup files go only where you save them. Deleting the app or this site's data deletes your log, so keep a backup file."];
    const p = { line: await own(D.page, '#privacy'), tip: await tipOf(D.page, '#privacy') };
    ok(p.line === want[0], `11. the privacy note, one short line${auth ? ' (the built app, signed out)' : ''}`, p.line);
    ok(p.tip === want[1], '11. its i: every word the note said, then the explanation', p.tip);
    const s = { line: await own(D.page, '#safety'), tip: await tipOf(D.page, '#safety') };
    ok(s.line === 'Suggestions: estimates, not medical or coaching advice.', '11. the suggestions note, one short line', s.line);
    ok(s.tip === 'Estimates from your log, not medical or coaching advice. Train within your limits and stop on pain. ' + SAFETY, '11. its i: every word the note said, then the full notice', s.tip);
    const t = await tapTip(D.page, '#privacy .tipi');
    ok(!!t && t === p.tip, '11. a tap on the i shows it', t);
    const c = await D.page.evaluate(() => { window.claude = { use: () => null }; const L = window.__ironlog; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); const e = document.getElementById('privacy'); const q = e.cloneNode(true); q.querySelectorAll('.tipi').forEach(x => x.remove()); const r = { line: q.textContent.replace(/\s+/g, ' ').trim(), tip: e.querySelector('.tipi').getAttribute('data-tip') }; delete window.claude; L.render(); return r; });
    ok(c.line === 'Privacy: stored with your Claude account.' && c.tip === 'No ads, no tracking. Your log is stored with your Claude account. Export and CSV files go only where you save them.', '11. inside Claude: one line, every word in the i', c);
    ok(!D.errors.length, '11. no page errors', D.errors);
    await D.ctx.close();
  });

  // ---- 12. (a guard) Settings, Effort: what RIR is stays on screen, V's ruling of r27, kept by the cuts (V, 2026-11-03:
  // "as long as we are not ... overriding what was already aligned").
  if (run(12)) await guard(async () => {
    const D = await demo('settings');
    await openAll(D.page);
    const r = await D.page.evaluate(() => { const sel = document.querySelector('#view [data-bind="rirMode"]'); const sec = sel.closest('.sec-b'); return /RIR, reps in reserve: reps you could still have done\. RIR 3 or less is a hard set\./.test(sec.innerText); });
    ok(r, '12. (a guard) the line saying what RIR is stays above the setting (V, r27)', r);
    await D.page.selectOption('#view [data-bind="rirMode"]', 'off'); await wait(150);
    ok(await D.page.evaluate(() => window.__ironlog.state.settings.rirMode === 'off'), '12. the setting still sets RIR off');
    ok(!D.errors.length, '12. no page errors', D.errors);
    await D.ctx.close();
  });

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
