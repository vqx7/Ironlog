// r29.5 (V, 2026-10-04): the common lifts marked (a Common tag, first in the
// exercise picker and in Plan's list, a filter in the library) instead of only
// the less common ones; the target RIR of 1 explained in the Plan editor and
// the Guide; and the Claude-only features (debrief, Ask Claude, suggested
// swaps, Claude reading typed sets) left out of the installed build, which
// never used them, while the source keeps them for the Claude artifact.
// Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fs = require('fs');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const DIST = !!process.env.IRONLOG_FILE;

(async () => {
  const P = await open('index.html', { touch: true, clock: '2026-10-04T10:00:00' });
  const { page } = P; const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });

  // ---- Common lifts.
  const lib = await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = 'library'; L.render(); return { chips: [...document.querySelectorAll('[data-act="libKind"]')].map(b => b.innerText.trim()), on: (document.querySelector('[data-act="libKind"].on') || {}).innerText, i: !!document.querySelector('.chips + .tipi, [aria-label="About Most common and Less common"]') }; });
  ok(lib.chips.join(',') === 'All,Most common,Less common' && lib.on === 'All' && lib.i, 'the library filters All, Most common, and Less common, with an i that says what each means', lib);
  const tagOf = name => ev(n => { const it = [...document.querySelectorAll('#libList .hitem')].find(h => h.querySelector('b').innerText === n); return it ? [...it.querySelectorAll('.tag')].map(t => t.innerText) : null; }, name);
  ok((await tagOf('Barbell Bench Press'))[0] === 'Most common', 'a most-logged lift (Barbell Bench Press) is tagged Most common, first', await tagOf('Barbell Bench Press'));
  ok((await tagOf('Meadows Row')).includes('Less common') && !(await tagOf('Meadows Row')).includes('Most common'), 'a less common lift keeps its Less common tag and is not Most common');
  const neither = await tagOf('Front Squat');
  ok(!neither.includes('Most common') && !neither.includes('Less common'), 'a lift in neither group carries neither tag', neither);
  await page.click('[data-act="libKind"][data-v="common"]'); await wait(100);
  const onlyC = await ev(() => ({ n: document.querySelectorAll('#libList .hitem').length, allC: [...document.querySelectorAll('#libList .hitem')].every(h => { const L = window.__ironlog; const e = L.state.exercises.find(x => x.name === h.querySelector('b').innerText); return L.isCommon(e) && ![...h.querySelectorAll('.tag')].some(t => t.innerText === 'Most common'); }), on: document.querySelector('[data-act="libKind"].on').innerText, pressed: document.querySelector('[data-act="libKind"][data-v="common"]').getAttribute('aria-pressed') }));
  ok(onlyC.n === 30 && onlyC.allC && onlyC.on === 'Most common' && onlyC.pressed === 'true', 'Most common shows only the 30 most-logged lifts (r33: 53 was too many to help), without the tag repeating the filter on every row', onlyC);
  await page.click('[data-act="libKind"][data-v="rare"]'); await wait(100);
  const onlyR = await ev(() => ({ n: document.querySelectorAll('#libList .hitem').length, allR: [...document.querySelectorAll('#libList .hitem')].every(h => { const L = window.__ironlog; const e = L.state.exercises.find(x => x.name === h.querySelector('b').innerText); return e.rare && ![...h.querySelectorAll('.tag')].some(t => t.innerText === 'Less common'); }) }));
  ok(onlyR.n > 10 && onlyR.allR, 'Less common still filters as before', onlyR);
  const chipH = await ev(() => Math.round(document.querySelector('[data-act="libKind"]').getBoundingClientRect().height));
  ok(chipH >= 40, 'filter chips are full-size chips', chipH);
  // Someone who marks a staple as less common does not see it called common.
  const mark = await ev(() => { const L = window.__ironlog; const e = L.state.exercises.find(x => x.id === 'bench'); e.rare = true; L.saveNow(); L.ui.libKind = ''; L.render(); const it = [...document.querySelectorAll('#libList .hitem')].find(h => h.querySelector('b').innerText === 'Barbell Bench Press'); const t = [...it.querySelectorAll('.tag')].map(x => x.innerText); e.rare = false; L.saveNow(); return t; });
  ok(mark.includes('Less common') && !mark.includes('Most common'), 'a most-logged lift marked less common by the lifter reads Less common only', mark);
  // Nothing is stored for it.
  ok(await ev(() => !JSON.stringify(window.__ironlog.state).includes('"common"')), 'nothing about Common is saved in the log');

  // The exercise picker: Common first.
  await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = 'today'; L.render(); });
  await ev(() => { const b = document.querySelector('.hero [data-act="startSession"]'); if (b) b.click(); });
  await wait(200);
  await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.pickSession(); });
  await wait(150);
  const pk = await ev(() => { const g = [...document.querySelectorAll('.pick-grp')].map(x => x.innerText); const all = [...document.querySelectorAll('#pickList > *')]; const iC = all.findIndex(x => x.classList.contains('pick-grp') && /^Most common/i.test(x.innerText)); const iO = all.findIndex(x => x.classList.contains('pick-grp') && /^All other exercises/i.test(x.innerText)); const L = window.__ironlog; const C = id => L.isCommon(L.EX(id)); const between = all.slice(iC + 1, iO).filter(x => x.classList.contains('pick')); const after = all.slice(iO + 1).filter(x => x.classList.contains('pick')); return { g, n: between.length, allC: between.every(x => C(x.dataset.ex)), after: after.some(x => C(x.dataset.ex)), repeat: between.some(x => [...x.querySelectorAll('.tag')].some(t => t.innerText === 'Most common')) }; });
  ok(pk.g.some(x => /^Most common \(30\)$/i.test(x)) && pk.g.some(x => /^All other exercises \(\d+\)$/i.test(x)) && pk.n === 30 && pk.allC && !pk.after && !pk.repeat, 'the picker lists the Most common lifts first, then all the others, with no repeats and no tag repeating the heading', pk);
  // A muscle filter puts the common lifts for that muscle first.
  await page.selectOption('[data-mbind="m"]', 'chest'); await wait(100);
  const chest = await ev(() => [...document.querySelectorAll('#pickList .pick')].filter(x => x.querySelector('b')).map(x => ({ n: x.querySelector('b').innerText, c: [...x.querySelectorAll('.tag')].some(t => t.innerText === 'Most common') })));
  const firstNon = chest.findIndex(x => !x.c), lastC = chest.map(x => x.c).lastIndexOf(true);
  ok(chest.length > 5 && firstNon > 0 && lastC < firstNon, 'with a muscle chosen, its common lifts come first', chest.slice(0, 12));
  await page.selectOption('[data-mbind="m"]', ''); await page.fill('#pickQ', 'curl'); await wait(100);
  const curl = await ev(() => [...document.querySelectorAll('#pickList .pick')].filter(x => x.querySelector('b')).map(x => ({ n: x.querySelector('b').innerText, c: [...x.querySelectorAll('.tag')].some(t => t.innerText === 'Most common') })));
  const fn = curl.findIndex(x => !x.c);
  ok(curl.length > 4 && fn > 0 && curl.slice(fn).every(x => !x.c), 'a search lists the common matches first', curl.map(x => x.n + (x.c ? '*' : '')));
  await ev(() => window.__ironlog.ACT.mClose());

  // Plan's Add exercises list: common first.
  const plan = await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = 'routine'; L.ui.bLibOpen = true; L.ui.bLibQ = ''; L.ui.bLibM = 'biceps'; L.render(); return [...document.querySelectorAll('li.it[data-ex] .imain')].map(x => ({ n: x.querySelector('b').textContent, t: x.querySelector('span').textContent })); });
  const pfn = plan.findIndex(x => !/, common$/.test(x.t));
  ok(plan.length > 4 && pfn > 0 && plan.slice(pfn).every(x => !/, common$/.test(x.t)), "Plan's Add exercises list puts common lifts first and says so", plan.slice(0, 8));

  // ---- The target RIR of 1, explained.
  const tip = await ev(async () => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = 'routine'; L.ui.bLibOpen = false; L.render(); const it = document.querySelector('[data-act="toggleItem"]'); if (it) it.click(); await new Promise(r => setTimeout(r, 100)); const s = document.querySelector(`label.field button.tipi[aria-label="About Target RIR"]`); return s ? { tip: s.dataset.tip, i: true } : null; });
  ok(tip && /Robinson 2024/.test(tip.tip) && /Refalo 2024/.test(tip.tip) && /convention/.test(tip.tip) && !/—/.test(tip.tip), 'the Plan editor says why the target RIR is 1, with its sources, as a convention', tip);
  const guide = await ev(() => { const L = window.__ironlog; L.ACT.guideOpen({ dataset: { g: 'plan' } }); document.querySelectorAll('#modal details').forEach(d => d.open = true); return document.getElementById('modal').innerText; });
  ok(/target RIR is 1 unless you change it/i.test(guide) && /Refalo 2024/.test(guide), 'the Guide says the same under Plan');
  await ev(() => window.__ironlog.ACT.mClose());

  // ---- Claude-only features.
  const html = fs.readFileSync(process.env.IRONLOG_FILE || 'index.html', 'utf8');
  const words = ['AI_STYLE', 'debriefPrompt', 'reviewPrompt', 'swapPrompt', 'aiDigest', 'Ask Claude', 'Debrief with Claude', 'Reading with Claude', 'You are an experienced'];
  if (DIST) {
    ok(words.every(w => !html.includes(w)) && !/\/\*ai\{|\/\*\}ai/.test(html), 'the installed build has none of the Claude prompts, buttons, or markers', words.filter(w => html.includes(w)));
    const ai = await ev(() => { const L = window.__ironlog; return { swap: false, keys: ['aiDebrief', 'aiReview', 'aiAsk', 'bAiSwap', 'aiSwapAsk'].filter(k => L.ACT[k]) }; });
    ok(!ai.keys.length, 'none of their actions exist in the installed build', ai);
  } else {
    ok(words.every(w => html.includes(w)), 'the source keeps them for the Claude artifact');
  }
  // Type or dictate still reads sets, and says the pattern when it cannot.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
  await wait(100);
  const q = await ev(async () => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); const d = L.state.draft; const bi = d.ex.findIndex(b => !L.EX(b.exId).timed); L.ACT.bQuick({ dataset: { b: String(bi) } }); await new Promise(r => setTimeout(r, 50)); document.getElementById('qTxt').value = 'gibberish words'; L.ACT.qFill(); await new Promise(r => setTimeout(r, 50)); const err = L.ui.modal && L.ui.modal.err; document.getElementById('qTxt').value = '100x8, 8, 7 rir 2'; L.ACT.qFill(); await new Promise(r => setTimeout(r, 80)); const b = L.state.draft.ex[bi]; return { err, done: b.sets.filter(s => s.done).map(s => [s.r, s.rir]), open: !!L.ui.modal }; });
  ok(/Try the pattern 225x5, 5, 4 rir 1/.test(q.err || '') && JSON.stringify(q.done.slice(0, 3)) === '[[8,2],[8,2],[7,2]]' && !q.open, 'Type or dictate sets still fills sets, and explains the pattern when it cannot read the text', q);

  ok(!P.errors.length, 'no page errors', P.errors);
  await P.browser.close();
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
