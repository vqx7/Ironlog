// 2.34 (build r80; PENDING.md's tracker): each section written as what a lifter expects and run first on 2.33
// (`node tests/r80.js baselines/r79.html`), where each section fails unless it says it guards:
//   1  R79-2: Short on time never says the session fits when it does not. With every set left holding something the
//      lifter typed, nothing can come off: the sheet says so and why, with the minutes left, and offers no trim.
//      When a trim still leaves the session over, the reason given is the true one (typed sets are kept; started
//      exercises are cut like the rest). Guards: a session that does fit still reads "Everything left fits".
// R80_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R80_ONLY ? process.env.R80_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-04';

/** The demo log, set up, on Today, with the day's workout started. */
async function session(o = {}) {
  const D = await open(FILE, { w: o.w || 390, h: 844, dark: !!o.dark, clock: DAY + 'T18:00:00' });
  await D.page.evaluate(() => {
    const L = window.__ironlog; L.state.settings.onboarded = true;
    L.makeDemo(); for (const x of L.state.sessions) delete x.demo;
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.ui.tab = 'today'; L.render();
  });
  await wait(300);
  await D.page.click('.hero [data-act="startSession"]:not([data-light])');
  await wait(500);
  return D;
}
/** Opens Short on time and taps a chip; returns the sheet's words and whether it offers a trim. */
async function shortAt(page, v) {
  await page.evaluate(() => document.querySelector('[data-act="shortOpen"]').click());
  await wait(300);
  await page.click(`[data-act="shortPick"][data-v="${v}"]`);
  await wait(300);
  return page.evaluate(() => {
    const s = document.querySelector('.sheet');
    return { txt: s ? s.innerText.replace(/\s+/g, ' ') : '', trim: !!document.querySelector('[data-act="shortApply"]'), head: (document.getElementById('sessLeft') || {}).innerText || '' };
  });
}

(async () => {
  if (run(1)) {
    // a. Every set left has reps typed but not ticked: nothing is a blank row, so nothing can come off.
    let D = await session();
    await D.page.evaluate(() => {
      const L = window.__ironlog, d = L.state.draft;
      d.ex.forEach(b => b.sets.forEach(x => { if (!x.warm) x.r = 8; }));
      L.render();
    });
    await wait(300);
    let s = await shortAt(D.page, 15);
    const mins = await D.page.evaluate(() => window.__ironlog.remainMin(window.__ironlog.state.draft));
    ok(!/Everything left fits/.test(s.txt), '1a. typed sets left, 15 min tapped: never "Everything left fits"', s.txt.slice(0, 400));
    ok(/Nothing can come off/.test(s.txt) && /typed/.test(s.txt) && /~\d+ min/.test(s.txt) && !s.trim, '1a. it says nothing can come off, why, and the minutes left, with no trim offered', s.txt.slice(0, 400));
    ok(mins > 15, '1a. the session really is over 15 minutes', mins);
    await D.browser.close();
    // b. Typed sets on the first two exercises only: the rest can be cut, but the session stays over.
    D = await session();
    await D.page.evaluate(() => {
      const L = window.__ironlog, d = L.state.draft;
      d.ex.slice(0, 2).forEach(b => b.sets.forEach(x => { if (!x.warm) x.r = 8; }));
      L.render();
    });
    await wait(300);
    s = await shortAt(D.page, 15);
    ok(s.trim && /Still over/.test(s.txt), '1b. a trim that still leaves it over says so', s.txt.slice(0, 400));
    ok(!/exercises you have started are kept/.test(s.txt) && /typed/.test(s.txt), '1b. and gives the true reason: sets you typed in are kept', s.txt.slice(0, 400));
    await D.browser.close();
    // c. Guard: at the planned minutes the session fits as it is (two exercises ticked, so the minutes left are on a chip).
    D = await session();
    await D.page.evaluate(() => {
      const L = window.__ironlog, d = L.state.draft;
      d.ex.slice(0, 2).forEach(b => b.sets.forEach(x => { if (!x.warm) { x.r = x.r ?? 10; x.w = x.w ?? 50; x.done = true; } }));
      L.render();
    });
    await wait(300);
    const planned = await D.page.evaluate(() => { const L = window.__ironlog; const n = L.remainMin(L.state.draft); return Math.max(5, Math.round(n / 5) * 5); });
    const chip = [15, 20, 30, 45, 60, 75].find(v => v >= planned);
    s = await shortAt(D.page, chip);
    ok(/Everything left fits/.test(s.txt) && !s.trim, `1c. guard: ${chip} min tapped with ~${planned} planned reads "Everything left fits"`, s.txt.slice(0, 300));
    await D.browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
