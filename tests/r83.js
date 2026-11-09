// 2.37 (build r83; PENDING.md's tracker), each section written as what a lifter expects and run first on 2.36
// (`node tests/r83.js baselines/r82.html` once 2.36 is kept there, or on b91b3c7's page), where each fails unless it
// says it guards:
//   1  NEW-83: in Swap's list, a lift that loads a flagged injury says so (Injury: Knee), the closest matches included;
//      guard: a lift that loads nothing flagged says nothing.
//   2  NEW-87: Your gym offers the change plates as buttons, off until tapped (kg 2, 1.5, 1 and 0.5; lb 1.25); tapped,
//      one is on the gym's list and its loads use it, tapped again it is off; guard: with none tapped, no load moves.
// R83_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R83_ONLY ? process.env.R83_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-08';

/** The app with the demo log as the lifter's own, in kg, on Today; `inj` flagged. */
async function app(o = {}) {
  const D = await open(FILE, { w: o.w || 390, h: 844, dark: !!o.dark, clock: DAY + 'T10:00:00' });
  await D.page.evaluate(inj => {
    const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg';
    L.makeDemo(); for (const x of L.state.sessions) delete x.demo; for (const x of L.state.bodyweights) delete x.demo;
    L.state.injuries = inj.map((m, i) => ({ id: 'j' + i, m, note: '', date: '2026-11-01' }));
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render();
  }, o.inj || []);
  await wait(300);
  return D;
}

(async () => {
  if (run(1)) {
    const D = await app({ inj: ['j_knee'] });
    const o = await D.page.evaluate(async () => {
      const L = window.__ironlog;
      L.state.draft = null; L.ACT.startFree(); await new Promise(r => setTimeout(r, 200));
      if (L.ui.modal) L.ACT.mClose();
      L.applyPick({ kind: 'picker', mode: 'addBlock', title: '', q: '', m: '' }, 'backSquat'); await new Promise(r => setTimeout(r, 200));
      const b = L.state.draft.ex.findIndex(x => x.exId === 'backSquat');
      L.openModal({ kind: 'picker', mode: 'swapBlock', b, title: 'Swap', q: '', m: 'quads' }); await new Promise(r => setTimeout(r, 300));
      const rows = [...document.querySelectorAll('#modal .pick[data-ex]')].map(x => ({ id: x.dataset.ex, inj: L.exInjury(L.EX(x.dataset.ex)), tag: /Injury: Knee/.test(x.textContent) }));
      const grp = [...document.querySelectorAll('#modal .pick-grp')].map(x => x.textContent);
      return { rows, grp };
    });
    const onKnee = o.rows.filter(r => r.inj), clear = o.rows.filter(r => !r.inj);
    ok(o.grp.includes('Closest matches') && onKnee.length > 0, '1. (setting up) Swap on back squat lists quads lifts, some loading the knee', o.grp);
    ok(onKnee.every(r => r.tag), '1. every lift in Swap that loads the flagged knee says Injury: Knee', onKnee.filter(r => !r.tag));
    ok(clear.every(r => !r.tag), '1. (a guard) a lift that loads nothing flagged says nothing', clear.filter(r => r.tag));
    await D.browser.close();
  }

  if (run(2)) {
    const D = await app();
    const chips = async () => D.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); return [...document.querySelectorAll('[aria-label="Plates on hand"] button')].map(b => [b.dataset.v, b.getAttribute('aria-pressed')]); });
    const kg = await chips();
    const has = v => kg.find(c => c[0] === v);
    ok(['2', '1.5', '1', '0.5'].every(v => has(v) && has(v)[1] === 'false') && has('20')[1] === 'true', '2. in kg, Your gym offers 2, 1.5, 1 and 0.5 kg as buttons, off, beside the usual plates', kg);
    const before = await D.page.evaluate(() => { const L = window.__ironlog; return L.suggest('bench', L.planFor('bench'), {}).target; });
    ok(await D.page.evaluate(() => !window.__ironlog.state.settings.gym || !window.__ironlog.state.settings.gym.plates), '2. (a guard) with none tapped, the gym keeps no plate list, so no load moves');
    await D.page.evaluate(() => window.__ironlog.ACT.gymPlate({ dataset: { v: '1' } })); // the section may be folded; its tap's own handler
    await D.page.waitForTimeout(200);
    const g1 = await D.page.evaluate(() => (window.__ironlog.state.settings.gym || {}).plates || null);
    ok(Array.isArray(g1) && g1.includes(1) && g1.includes(20), "2. tapping 1 kg puts it on the gym's list with the usual plates", g1);
    await D.page.evaluate(() => window.__ironlog.ACT.gymPlate({ dataset: { v: '1' } })); // the section may be folded; its tap's own handler
    await D.page.waitForTimeout(200);
    const g2 = await D.page.evaluate(() => (window.__ironlog.state.settings.gym || {}).plates || null);
    ok(!g2 || !g2.includes(1), '2. tapping it again takes it off', g2);
    const after = await D.page.evaluate(() => { const L = window.__ironlog; return L.suggest('bench', L.planFor('bench'), {}).target; });
    ok(after === before, '2. (a guard) back to the usual plates, the suggestion is as before', { before, after });
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; L.invalidate(); L.render(); });
    const lb = await chips();
    ok(lb.some(c => c[0] === '1.25' && c[1] === 'false'), '2. in lb, Your gym offers 1.25 lb as a button, off', lb);
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
