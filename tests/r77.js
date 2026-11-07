// 2.31 (build r77; PENDING.md's tracker, P-S4-7 and 99), each section written as what a lifter expects and run first
// on 2.30 (`node tests/r77.js baselines/r76.html`), where each section fails unless it says it guards:
//   1  P-S4-7: text follows the phone's text size. With a larger text size (the page's root 25% larger), the app's
//      text is 25% larger; on 2.30 every size was in px and stayed put. Guards: at the default size every element on
//      Today, the session, History, Stats, Plan and Settings has the size it had on 2.30, to a hundredth of a pixel
//      (`R77_BASE`, default baselines/r76.html); at the larger size no tab scrolls sideways at 375 px.
// R77_ONLY=1 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const BASE = process.env.R77_BASE || 'baselines/r76.html';
const ONLY = process.env.R77_ONLY ? process.env.R77_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const T = '2026-11-06';
// The tabs by their names in the code (Stats is dash, Plan is program), and the session: Today with a workout open.
const TABS = ['today', 'history', 'dash', 'program', 'settings', 'session'];

// A log with a few weeks of sessions and a workout open, so every tab draws its usual parts.
const seed = () => {
  const L = window.__ironlog, S = L.state;
  S.settings.onboarded = true; S.settings.unit = 'lb';
  const days = ['2026-10-12', '2026-10-15', '2026-10-19', '2026-10-22', '2026-10-26', '2026-10-29', '2026-11-02', '2026-11-05'];
  S.sessions = days.map((date, i) => ({ id: 's' + i, date, dayIdx: 0, dayName: 'Push', notes: '', ex: [
    { exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: 135 * 0.45359237 + i, r: 8, rir: null, warm: false, drop: false })) },
    { exId: 'dbCurl', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w: 12 * 0.45359237, r: 10, rir: null, warm: false, drop: false })) }
  ] }));
  L.state = L.normalize(S); L.invalidate(); L.saveNow();
};

async function sizes(file, root) {
  const D = await open(file, { w: 375, h: 812, clock: T + 'T10:00:00' });
  await D.page.evaluate(seed);
  if (root) await D.page.addStyleTag({ content: `html{font-size:${root} !important}` });
  const out = {};
  // The session last, so the other tabs draw with no workout open.
  for (const tab of TABS) {
    out[tab] = await D.page.evaluate(async tab => {
      const L = window.__ironlog;
      if (tab === 'session') { L.ui.tab = 'today'; if (!L.state.draft) L.ACT.startFree({ dataset: {} }); }
      else { if (L.state.draft) { L.state.draft = null; L.saveNow(); } L.ui.tab = tab; }
      L.render();
      await new Promise(q => setTimeout(q, 200));
      const v = document.getElementById('view');
      const list = [...v.querySelectorAll('*')].filter(e => e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
      return {
        sizes: list.slice(0, 400).map(e => Math.round(parseFloat(getComputedStyle(e).fontSize) * 100) / 100),
        body: parseFloat(getComputedStyle(document.body).fontSize),
        wide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    }, tab);
  }
  const errors = D.errors.slice();
  await D.browser.close();
  return { out, errors };
}

(async () => {
  if (run(1)) {
    const base = await sizes(BASE), now = await sizes(FILE), big = await sizes(FILE, '21.25px');
    for (const tab of TABS) {
      const a = base.out[tab].sizes, b = now.out[tab].sizes;
      const diff = a.length !== b.length ? ['count', a.length, b.length] : a.map((x, i) => [i, x, b[i]]).filter(([, x, y]) => Math.abs(x - y) > 0.01);
      ok(!diff.length || diff[0] === undefined, `1. (a guard) ${tab}: at the default text size every text has the size it had on 2.30`, diff.slice ? diff.slice(0, 8) : diff);
      ok(Math.abs(big.out[tab].body - 20) < 0.01, `1. ${tab}: at a text size 25% larger, the body text is 20 px, not 16 (2.30 kept 16)`, { body: big.out[tab].body });
      ok(!big.out[tab].wide, `1. (a guard) ${tab}: at the larger size nothing scrolls sideways at 375 px`, big.out[tab]);
    }
    ok(!now.errors.length && !big.errors.length, '1. no page errors', [...now.errors, ...big.errors]);
  }
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
