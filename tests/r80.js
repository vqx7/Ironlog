// 2.34 (build r80; PENDING.md's tracker): each section written as what a lifter expects and run first on 2.33
// (`node tests/r80.js baselines/r79.html`), where each section fails unless it says it guards:
//   1  R79-2: Short on time never says the session fits when it does not. With every set left holding something the
//      lifter typed, nothing can come off: the sheet says so and why, with the minutes left, and offers no trim.
//      When a trim still leaves the session over, the reason given is the true one (typed sets are kept; started
//      exercises are cut like the rest). Guards: a session that does fit still reads "Everything left fits".
//   2  NEW-76: Your gym takes any plate. (a) On plates that are whole multiples of the smallest (every usual gym), every
//      load answer is the one 2.33 gave: the step, the lighter and heavier loads, the heaviest available, the
//      suggestion, a lighter day and the plates line, over loads from the bar to 300 kg, in lb and kg gyms with the
//      app in either unit (a guard, run against baselines/r79.html; it passes on 2.33 itself). (b) With plates that
//      are not (10 and 25 lb with no 5s; 1 kg beside 1.25 and 2.5 kg), every load the engine gives a bar lift is one
//      the bar and plates make, and the plates line loads it with nothing left over. (c) The plates line finds the
//      combination greedy misses (3 kg a side from 2.5 and 1 kg plates is 1, 1, 1). (d) A saved gym keeps any plate in
//      whole hundredths up to the heaviest made, heaviest first, each once; a usual list is unchanged. (e) Settings:
//      another plate is added from the field, shows as a chip, and goes with a tap; a bad entry or a repeat says why
//      and changes nothing.
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

  if (run(2)) {
    // a. The same answers as 2.33 on usual plates (a guard), read on both builds.
    const probe = async file => {
      const D = await open(file, { w: 390, h: 844, clock: DAY + 'T10:00:00' });
      const r = await D.page.evaluate(() => {
        const L = window.__ironlog, out = [];
        const gyms = [
          ['lb', 'lb', [45, 35, 25, 10, 5, 2.5]], ['lb', 'lb', [45, 25, 10, 5]], ['lb', 'kg', [45, 35, 25, 10, 5, 2.5]],
          ['kg', 'kg', [25, 20, 15, 10, 5, 2.5, 1.25]], ['kg', 'kg', [20, 10, 5, 2.5]], ['kg', 'lb', [25, 20, 15, 10, 5, 2.5, 1.25]]
        ];
        for (const [gu, app, plates] of gyms) {
          const s = L.state; s.settings.onboarded = true; s.settings.unit = app; s.settings.gym = { u: gu, plates }; delete s.settings.barKg;
          s.sessions = []; s.draft = null; L.state = L.normalize(s); L.invalidate();
          const ex = L.EX('bench'), plan = { sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 150 };
          for (let at = 20; at <= 300; at += 0.37) {
            const f = v => (v == null ? null : Math.round(v * 1000) / 1000);
            out.push([gu, app, plates.join(','), f(at), f(L.incOf(ex, plan, at)), f(L.lighterLoad(ex, plan, at, at * 0.9)), f(L.heavierLoad(ex, plan, at, at * 1.03)), f(L.capOf({ ...ex, maxLoad: at }, plan)), L.plateText(at, 'bar', ex)].join('|'));
          }
          // A suggestion and a lighter day from a logged session at a few loads.
          for (const w of [60, 84.3, 102.1, 140]) {
            const one = (id, date) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [10, 10, 10].map(r => ({ w, r, rir: 2, warm: false, drop: false })) }] });
            s.sessions = [one('g1', '2026-10-01'), one('g2', '2026-10-08')]; L.state = L.normalize(s); L.invalidate();
            out.push([gu, app, w, L.fmtW(L.suggest('bench', plan, {}).w), L.fmtW(L.suggest('bench', plan, { light: true }).w)].join('|'));
          }
        }
        return out;
      });
      await D.browser.close();
      return r;
    };
    const before = await probe('baselines/r79.html'), now = await probe(FILE);
    const diff = now.map((x, i) => [before[i], x]).filter(([a, b]) => a !== b);
    ok(before.length === now.length && before.length > 4000 && !diff.length, `2a. guard: on usual plates every answer matches 2.33 (${now.length} cases)`, diff.slice(0, 6));

    // b. Plates that are not whole multiples of the smallest: every load given is one the plates make.
    const D = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog, bad = [];
      const cases = [['lb', 'lb', [45, 25, 10]], ['kg', 'kg', [20, 10, 5, 2.5, 1.25, 1]], ['kg', 'lb', [20, 10, 5, 2.5, 1.25, 1]]];
      let n = 0;
      for (const [gu, app, plates] of cases) {
        const s = L.state; s.settings.onboarded = true; s.settings.unit = app; s.settings.gym = { u: gu, plates }; delete s.settings.barKg;
        s.sessions = []; s.draft = null; L.state = L.normalize(s); L.invalidate();
        const ex = L.EX('bench'), plan = { sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 150 };
        const loadable = w => w != null && !/not loadable/.test(L.plateText(w, 'bar', ex));
        for (let at = 25; at <= 200; at += 1.3) {
          const got = { lighter: L.lighterLoad(ex, plan, at, at * 0.9), heavier: L.heavierLoad(ex, plan, at, at * 1.03), cap: L.capOf({ ...ex, maxLoad: at }, plan) };
          for (const [k, v] of Object.entries(got)) { n++; if (v != null && !loadable(v)) bad.push({ gu, app, plates: plates.join(','), at, k, v, line: L.plateText(v, 'bar', ex) }); }
        }
        for (const w of [61, 84.3, 102.1, 140]) {
          const one = (id, date) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [10, 10, 10].map(r => ({ w, r, rir: 2, warm: false, drop: false })) }] });
          s.sessions = [one('g1', '2026-10-01'), one('g2', '2026-10-08')]; L.state = L.normalize(s); L.invalidate();
          for (const o of [{}, { light: true }]) { n++; const v = L.suggest('bench', plan, o).w; if (!loadable(v)) bad.push({ gu, app, w, o, v, line: L.plateText(v, 'bar', ex) }); }
        }
      }
      return { n, bad };
    });
    ok(r.n > 400 && !r.bad.length, `2b. plates not all multiples of the smallest: all ${r.n} loads given are ones the bar and plates make`, r.bad.slice(0, 6));

    // c. The plates line finds what greedy misses, and keeps greedy's line where greedy loads it.
    const c = await D.page.evaluate(() => {
      const L = window.__ironlog;
      return { kg3: L.platesPerSide([2.5, 1], 3, 0.001), lb60: L.platesPerSide([45, 35, 25, 10, 5, 2.5], 60, 0.001), kg23: L.platesPerSide([20, 15, 10], 25, 0.001) };
    });
    ok(c.kg3.plates.join(',') === '1,1,1' && Math.abs(c.kg3.rest) < 1e-6, '2c. 3 kg a side from 2.5 and 1 kg plates is 1, 1, 1', c.kg3);
    ok(c.lb60.plates.join(',') === '45,10,5' && Math.abs(c.lb60.rest) < 1e-6, '2c. guard: 60 lb a side stays 45, 10, 5 (the line lifters load)', c.lb60);
    ok(c.kg23.plates.join(',') === '15,10' && Math.abs(c.kg23.rest) < 1e-6, '2c. 25 kg a side from 20, 15 and 10 is 15 and 10, not 20 with 5 left', c.kg23);

    // d. What a saved gym keeps.
    const d = await D.page.evaluate(() => {
      const L = window.__ironlog;
      return {
        mixed: L.gymClean({ u: 'kg', plates: [1, 20, 0, -1, 60, 1.234, 20, '2.5'] }),
        lb: L.gymClean({ u: 'lb', plates: [100, 45, 2.5, 1.25, 0.25, 101] }),
        usual: L.gymClean({ u: 'kg', plates: [25, 20, 15, 10, 5, 2.5, 1.25] })
      };
    });
    ok(JSON.stringify(d.mixed) === JSON.stringify({ u: 'kg', plates: [20, 2.5, 1] }), '2d. a kg gym keeps 20, 2.5 and 1, heaviest first, each once; drops 0, -1, 60 and 1.234', d.mixed);
    ok(JSON.stringify(d.lb) === JSON.stringify({ u: 'lb', plates: [100, 45, 2.5, 1.25, 0.25] }), '2d. a lb gym keeps plates up to 100 lb, down to 0.25', d.lb);
    ok(JSON.stringify(d.usual) === JSON.stringify({ u: 'kg', plates: [25, 20, 15, 10, 5, 2.5, 1.25] }), '2d. guard: a usual list comes back as it went in', d.usual);
    await D.browser.close();

    // e. Settings: add a plate, see it, take it off; a bad entry and a repeat say why.
    const E = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00' });
    const pg = E.page;
    const gymOpen = () => pg.evaluate(() => document.querySelectorAll('#view details[data-sk="settings:gym"]').forEach(d => { d.open = true; }));
    await pg.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg'; L.state.settings.gym = { u: 'kg', plates: [25, 20, 15, 10, 5, 2.5, 1.25] }; L.saveNow(); L.ui.tab = 'settings'; L.ui.folds['settings:gym'] = true; L.render(); });
    await wait(300);
    await gymOpen();
    await wait(200);
    const has = await pg.$('#gymPlateNew');
    ok(!!has, '2e. Settings has a field for another plate');
    if (has) {
      const add = async v => { await gymOpen(); await pg.fill('#gymPlateNew', v); await pg.evaluate(() => document.querySelector('[data-act="gymPlateAdd"]').click()); await wait(350); return pg.evaluate(() => ({ plates: (window.__ironlog.state.settings.gym || {}).plates || null, toast: (document.getElementById('toast') || {}).innerText || '', chip: !!document.querySelector('[data-act="gymPlate"][data-v="1"][aria-pressed="true"]') })); };
      const a = await add('1');
      ok(JSON.stringify(a.plates) === JSON.stringify([25, 20, 15, 10, 5, 2.5, 1.25, 1]) && a.chip, '2e. 1 kg added: saved heaviest first and shown as a chip that is on', a);
      const rep = await add('1,0');
      ok(/already/.test(rep.toast) && rep.plates.length === 8, '2e. the same plate again says it is already there and adds nothing', rep);
      const bad = await add('70');
      ok(/printed on the plate/.test(bad.toast) && bad.plates.length === 8, '2e. 70 kg says what to type and adds nothing', bad);
      await gymOpen(); await pg.evaluate(() => document.querySelector('[data-act="gymPlate"][data-v="1"]').click()); await wait(350);
      const off = await pg.evaluate(() => ({ plates: (window.__ironlog.state.settings.gym || {}).plates || null, chip: !!document.querySelector('[data-act="gymPlate"][data-v="1"]') }));
      ok(off.plates === null && !off.chip, '2e. tapped, the added plate goes, and the usual plates are the default again', off);
      const w = await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      ok(w, '2e. no sideways scroll at 390 px');
    }
    await E.browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
