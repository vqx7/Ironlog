// 2.42 (build r88; PENDING.md's tracker), each section written as what a lifter expects and run first on 2.41
// (`node tests/r88.js baselines/r87.html`), where each fails:
//   1  NEW-103 (V, 2026-11-09 20:55: "We also dont need the text under it saying what plates to load… i dont think it
//      added value only overcrowding"; asked, "Remove it everywhere"): no line of plates is drawn under any lift, a bar
//      lift, a plate-loaded machine or one logged per side, whether a load is typed or stepped, in kg or lb.
//   2  NEW-103, its one setting: Your gym has no Small plates toggle, as it only ever added plates to that line (V,
//      asked: "Remove the toggle"); a log that has it on keeps it, untouched, through a load and a save; the bar's weight
//      says what it is used for now.
//   3  NEW-104 (V, 2026-11-09 20:55: "The plus minus buttons look too big and kind of janky"; picked A of three mocks):
//      the pills sit on the line of "Set N", drawn 32 px tall inside a 44 px tap area; at 390, 375 and 320 px, with a
//      load of 102.5 on a set already ticked, every minus and plus is 44 by 44 px, the number fits between
//      them, clear of each sign, the pills stay on the label's line, and the page never scrolls sideways.
//   4  NEW-105 (V, 2026-11-09 21:41: "Next to the pills where it says the set number Get rid of all the 'comma done'"): on a
//      set already ticked the label is the set's name alone, "Set 1", as on a set not ticked.
// R88_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R88_ONLY ? process.env.R88_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-09';

/** The app with the demo log as the lifter's own, on Today. */
async function app(o = {}) {
  const D = await open(FILE, { w: o.w || 390, h: 844, dark: !!o.dark, clock: DAY + 'T10:00:00' });
  await D.page.evaluate(unit => {
    const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = unit;
    L.makeDemo(); for (const x of L.state.sessions) delete x.demo; for (const x of L.state.bodyweights) delete x.demo;
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render();
  }, o.unit || 'kg');
  await wait(300);
  return D;
}
/** A blank session of these exercises, in order. */
async function freeOf(D, ids) {
  await D.page.evaluate(ids => {
    const L = window.__ironlog; L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose();
    const d = L.state.draft; for (const id of ids) d.ex.push(L.newBlock(id, L.planFor(id, null, null, false, d.date), { before: d.date }));
    L.saveNow(); L.render();
  }, ids);
  await wait(400);
}
const PLATES = /Per side at|On the sleeve at|Plates a side|bar only|not loadable/;
const platesShown = D => D.page.evaluate(re => { const v = document.getElementById('view'); return { el: !!v.querySelector('[id^="pl-"]'), text: (v.innerText.match(new RegExp(re)) || [null])[0] }; }, PLATES.source);

(async () => {
  if (run(1)) {
    for (const unit of ['kg', 'lb']) {
      const D = await app({ unit });
      await freeOf(D, ['bench', 'hackSquat', 'legPress', 'squat']);
      const ex = await D.page.evaluate(() => window.__ironlog.state.draft.ex.map(b => b.exId));
      const seen = [];
      for (let bi = 0; bi < ex.length; bi++) {
        await D.page.fill(`#view input[data-f="w"][data-b="${bi}"][data-s="0"]`, unit === 'kg' ? '100' : '225'); await wait(250);
        seen.push({ ex: ex[bi], typed: await platesShown(D) });
        const plus = await D.page.$(`#view .stepr [data-act="sStep"][data-sf="w"][data-d="1"]`);
        if (plus) { await plus.click(); await wait(250); seen[bi].stepped = await platesShown(D); }
      }
      const bad = seen.filter(s => s.typed.el || s.typed.text || (s.stepped && (s.stepped.el || s.stepped.text)));
      ok(seen.length === 4 && !bad.length, `1. ${unit}: no line of plates under a bar lift, a plate-loaded machine or a lift logged per side, typed or stepped`, bad.length ? bad : seen);
      await D.browser.close();
    }
  }

  if (run(2)) {
    const D = await app({ unit: 'lb' });
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.settings.smallPlates = true; L.saveNow(); L.ui.tab = 'settings'; L.render(); });
    await wait(300);
    await D.page.evaluate(() => { const s = document.querySelector('[data-sk="settings:gym"]'); if (s && !s.open) (s.querySelector('summary') || s).click(); });
    await wait(300);
    const ui = await D.page.evaluate(() => ({
      gym: !!document.querySelector('[data-bind="barKg"]'),
      toggle: !!document.querySelector('[data-bind="smallPlates"]'),
      text: /Small plates/.test(document.getElementById('view').innerText),
      barTip: (document.querySelector('#lt-barKg') || {}).getAttribute ? document.querySelector('#lt-barKg').closest('label').innerHTML : ''
    }));
    ok(ui.gym && !ui.toggle && !ui.text, '2. Your gym has no Small plates toggle', ui);
    ok(ui.gym && !/plates-per-side line/.test(ui.barTip), '2. the bar weight no longer says it is for the plates line', ui.barTip.slice(0, 400));
    // The saved setting is the lifter's: kept through a reload and a save.
    await D.page.reload(); await wait(600);
    const kept = await D.page.evaluate(() => { const L = window.__ironlog; L.saveNow(); return { live: L.state.settings.smallPlates, saved: JSON.parse(localStorage.getItem(L.KEY)).settings.smallPlates }; });
    ok(kept.live === true && kept.saved === true, '2. a log with Small plates on keeps it through a reload and a save', kept);
    await D.browser.close();
  }

  if (run(3)) {
    for (const w of [390, 375, 320]) {
      for (const dark of w === 390 ? [false, true] : [false]) {
        const D = await app({ w, dark });
        await D.page.click('[data-act="startSession"]'); await wait(500);
        // 102.5 kg typed in set 1 and ticked, then set 1 touched again: the pills are on set 1, ticked, at 102.5.
        await D.page.fill('#view input[data-f="w"][data-b="0"][data-s="0"]', '102.5'); await wait(200);
        await D.page.fill('#view input[data-f="r"][data-b="0"][data-s="0"]', '10'); await wait(200);
        await D.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"], #view [data-act="tick"][data-b="0"][data-s="0"]').catch(() => {});
        await wait(300);
        await D.page.focus('#view input[data-f="w"][data-b="0"][data-s="0"]'); await wait(200);
        await D.page.evaluate(() => document.activeElement && document.activeElement.blur()); await wait(300);
        const m = await D.page.evaluate(() => {
          const st = document.querySelector('#view .stepr'); if (!st) return null;
          const R = e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
          const head = R(st.querySelector('.stepr-h'));
          const groups = [...st.querySelectorAll('.stepr-g')].map(g => {
            const cs = getComputedStyle(g, '::before');
            const drawn = cs.content && cs.content !== 'none' ? R(g).h - parseFloat(cs.top) - parseFloat(cs.bottom) : R(g).h;
            const [mi, pl] = [...g.querySelectorAll('.stepr-b')].map(R);
            const v = R(g.querySelector('.stepr-v b'));
            return { drawn, g: R(g), mi, pl, v, val: g.querySelector('.stepr-v').innerText };
          });
          return { label: st.querySelector('.stepr-h').innerText, head, st: R(st), groups, sideways: document.scrollingElement.scrollWidth - innerWidth };
        });
        const tag = `${w} px${dark ? ', dark' : ''}`;
        if (!ok(m && m.groups.length === 2, `3. ${tag}: the pills are drawn`, m)) { await D.browser.close(); continue; }
        ok(/^set 1/i.test(m.label) && /102\.5/.test(m.groups[0].val), `3. ${tag}: the case is set 1, ticked, at a load of 102.5`, { label: m.label, val: m.groups[0].val });
        ok(m.groups.every(g => g.drawn <= 34), `3. ${tag}: each pill is drawn at most 34 px tall (it was 48)`, m.groups.map(g => g.drawn));
        ok(m.groups.every(g => g.mi.w >= 44 && g.mi.h >= 44 && g.pl.w >= 44 && g.pl.h >= 44), `3. ${tag}: every minus and plus is a 44 by 44 px target`, m.groups.map(g => [g.mi, g.pl]));
        // The number sits between the glyphs: clear of the middle of each button, where its sign is drawn.
        ok(m.groups.every(g => g.v.l >= g.mi.l + g.mi.w / 2 + 10 && g.v.r <= g.pl.l + g.pl.w / 2 - 10 && g.mi.l >= g.g.l - 0.5 && g.pl.r <= g.g.r + 0.5), `3. ${tag}: the number fits between minus and plus, clear of each sign`, m.groups.map(g => ({ v: g.v, mi: g.mi, pl: g.pl })));
        ok(m.sideways <= 0, `3. ${tag}: no sideways scroll`, m.sideways);
        const mid = (m.head.t + m.head.b) / 2;
        ok(mid > m.groups[0].g.t && mid < m.groups[0].g.b && Math.abs(m.groups[0].g.t - m.groups[1].g.t) < 1, `3. ${tag}: the pills sit on the line of "Set 1"`, { head: m.head, pills: m.groups.map(g => g.g) });
        if (!dark && w === 390) ok(m.label.trim() === 'SET 1' || m.label.trim() === 'Set 1', `4. on a set already ticked the label is "Set 1", with no ", done"`, m.label);
        ok(m.st.h <= 60, `3. ${tag}: the pills take one line, at most 60 px with the rule above them (they took 84)`, m.st.h);
        await D.browser.close();
      }
    }
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
