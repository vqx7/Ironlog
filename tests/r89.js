// 2.43 (build r89; PENDING.md's tracker), run first on 2.42 (`node tests/r89.js baselines/r88.html`), where it fails:
//   1  NEW-106 (V, 2026-11-09 22:26: "What is the filled in solid accent circle on the set ... necessary? ... it feels
//      like a bit much"; 22:32: "I'll get rid of that solid accent circle"): no set's number is drawn in the accent to
//      say minus and plus are on it; the label beside them names that set, and it is the set they change, as the pills
//      move from set to set by a type, a tick and a touch.
// R89_ONLY=1 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R89_ONLY ? process.env.R89_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-09';

(async () => {
  if (run(1)) {
    for (const dark of [false, true]) {
      const D = await open(FILE, { w: 390, h: 844, dark, touch: true, clock: DAY + 'T10:00:00' });
      await D.page.evaluate(() => {
        const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'lb';
        L.makeDemo(); for (const x of L.state.sessions) delete x.demo;
        localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
        L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render();
      });
      await wait(300);
      await D.page.tap('[data-act="startSession"]'); await wait(600);
      // What the screen says about the set the pills are on: the label, the set their buttons change, and any number in the accent.
      const look = () => D.page.evaluate(() => {
        const st = document.querySelector('#blk-0 .stepr');
        const volt = getComputedStyle(document.documentElement).getPropertyValue('--volt').trim().toLowerCase();
        const hex = c => { const m = /rgba?\((\d+), (\d+), (\d+)/.exec(c); return m ? '#' + [m[1], m[2], m[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : c; };
        const accented = [...document.querySelectorAll('#blk-0 .sg:not(.head) .n')].filter(n => { const s = getComputedStyle(n); return s.backgroundImage !== 'none' || hex(s.backgroundColor) === volt; }).map(n => +n.dataset.s);
        const sets = st ? [...new Set([...st.querySelectorAll('.stepr-b')].map(b => +b.dataset.s))] : [];
        const wn = si => [...document.querySelectorAll('#blk-0 .sg:not(.head) .n')].slice(0, si + 1).filter(n => !n.classList.contains('warm') && !n.classList.contains('drop')).length;
        return { label: st ? st.querySelector('.stepr-h').textContent.trim() : null, sets, named: sets.length === 1 ? `Set ${wn(sets[0])}` : null, accented };
      });
      const tag = dark ? 'dark' : 'light';
      const steps = [];
      steps.push(['at the start', await look()]);
      await D.page.tap('#view input[data-f="r"][data-b="0"][data-s="0"]'); await D.page.keyboard.type('8'); await D.page.evaluate(() => document.activeElement.blur()); await wait(450);
      steps.push(['reps typed in set 1, ticked by them', await look()]);
      await D.page.tap('#view [data-act="sDone"][data-b="0"][data-s="1"]'); await wait(450);
      steps.push(['set 2 ticked, so they go to set 3', await look()]);
      await D.page.tap('#view input[data-f="w"][data-b="0"][data-s="0"]'); await D.page.evaluate(() => document.activeElement.blur()); await wait(450);
      steps.push(['set 1 touched again', await look()]);
      for (const [when, l] of steps) {
        ok(l.sets.length === 1 && l.label === l.named, `1. ${tag}, ${when}: the label names the set minus and plus change`, l);
        ok(!l.accented.length, `1. ${tag}, ${when}: no set's number is drawn in the accent`, l);
      }
      await D.browser.close();
    }
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
