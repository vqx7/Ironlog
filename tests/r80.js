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
//   3  Settings' General is two sections (an Android user via V): Measurements (units, bodyweight goal, weigh-in
//      reminder, height) and Appearance (theme, accent) right after it; a saved order that had General keeps
//      Measurements where General was. Guard: no sideways scroll at 320 px.
//   4  "Get the app" never shows inside the installed app (an Android user via V): opened standalone, in minimal-ui
//      or with its own title bar, or in a browser that has installed it; a tab in full screen or opened from Gmail is
//      a tab (the review's F1). Guard: a
//      plain browser tab still offers it.
//   5  With nothing logged, Today's line leads with Log a past workout, without "Lifted before this app?" (V).
//   6  (The review of 2.34, F4) The Guide's Sources names every study docs/EVIDENCE.md puts behind one of the app's numbers.
// R80_ONLY=1,2 runs some sections.
const fs = require('fs');
const path = require('path');
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
    // The plates line read with them is gone (2.42, NEW-103: V removed it), so is not compared.
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
            // The heaviest load as a lifter types it, in the unit on screen: one typed in the other unit reads on this unit's
            // equipment since 2.65 (390's Release A, tests/progression.js P-42), so it is not this guard's.
            const cap = L.fromD(Math.round(L.toD(at) / 0.05) * 0.05);
            out.push([gu, app, plates.join(','), f(at), f(L.incOf(ex, plan, at)), f(L.lighterLoad(ex, plan, at, at * 0.9)), f(L.heavierLoad(ex, plan, at, at * 1.03)), f(L.capOf({ ...ex, maxLoad: cap }, plan))].join('|'));
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
        // A load the bar and these plates make, a pair at a time, read in the gym's unit within the rounding of a typed load:
        // the plates line's own reading (plateText, gone in 2.42 with the line, NEW-103), kept here as this check's judge.
        const inU = v => (gu === 'lb' ? v / 0.45359237 : v);
        const sideOf = w => { const r = L.platesPerSide([...plates].sort((a, b) => b - a), (inU(w) - inU(L.exBarKg(ex))) / 2, Math.max(1e-6, inU(L.rackTol()) / 2)); return Math.round(r.rest * 100) / 100; };
        const loadable = w => w != null && inU(w) >= inU(L.exBarKg(ex)) - 1e-6 && (sideOf(w) <= 0 || (gu !== app && sideOf(w) < (gu === 'kg' ? 0.1 : 0.25)));
        for (let at = 25; at <= 200; at += 1.3) {
          const got = { lighter: L.lighterLoad(ex, plan, at, at * 0.9), heavier: L.heavierLoad(ex, plan, at, at * 1.03), cap: L.capOf({ ...ex, maxLoad: at }, plan) };
          for (const [k, v] of Object.entries(got)) { n++; if (v != null && !loadable(v)) bad.push({ gu, app, plates: plates.join(','), at, k, v, rest: sideOf(v) }); }
        }
        for (const w of [61, 84.3, 102.1, 140]) {
          const one = (id, date) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [10, 10, 10].map(r => ({ w, r, rir: 2, warm: false, drop: false })) }] });
          s.sessions = [one('g1', '2026-10-01'), one('g2', '2026-10-08')]; L.state = L.normalize(s); L.invalidate();
          for (const o of [{}, { light: true }]) { n++; const v = L.suggest('bench', plan, o).w; if (!loadable(v)) bad.push({ gu, app, w, o, v, rest: sideOf(v) }); }
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
      // Since 2.37 (NEW-87) 1 kg is one of the change plates Your gym always offers as a button, off until tapped, so
      // the plate going reads as its button off; a plate outside the usual and change plates goes from the list too.
      const off = await pg.evaluate(() => { const c = document.querySelector('[data-act="gymPlate"][data-v="1"]'); return { plates: (window.__ironlog.state.settings.gym || {}).plates || null, chip: !!c && c.getAttribute('aria-pressed') !== 'false' }; });
      ok(off.plates === null && !off.chip, '2e. tapped, the added plate goes, and the usual plates are the default again', off);
      const w = await pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      ok(w, '2e. no sideways scroll at 390 px');
    }
    await E.browser.close();
  }

  if (run(3)) {
    const D = await open(FILE, { w: 320, h: 700, clock: DAY + 'T10:00:00' });
    const pg = D.page;
    const read = () => pg.evaluate(() => [...document.querySelectorAll('#view > [data-mkey]')].map(x => x.dataset.mkey));
    await pg.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.ui.tab = 'settings'; L.ui.folds['settings:general'] = true; L.ui.folds['settings:look'] = true; L.render(); });
    await pg.waitForTimeout(300);
    const r = await pg.evaluate(() => {
      const sec = k => document.querySelector(`#view > [data-mkey="${k}"]`);
      const title = k => (sec(k) && (sec(k).querySelector('h2, h3, .sec-t') || {}).textContent || '').trim();
      const has = (k, sel) => !!(sec(k) && sec(k).querySelector(sel));
      return {
        mTitle: title('general'), aTitle: title('look'),
        m: ['[data-bind="unit"]', '[data-bind="bwGoalPct"]', '[data-bind="bwEvery"]'].every(q => has('general', q)) && !has('general', '[data-bind="theme"]') && !has('general', '[data-act="accent"]'),
        a: has('look', '[data-bind="theme"]') && has('look', '[data-act="accent"]') && !has('look', '[data-bind="unit"]'),
        wide: document.documentElement.scrollWidth <= innerWidth
      };
    });
    ok(/Measurements/.test(r.mTitle) && r.m, '3. Measurements holds units, the bodyweight goal and the weigh-in reminder', r);
    ok(/Appearance/.test(r.aTitle) && r.a, '3. Appearance holds the theme and the accent', r);
    const order = await read();
    ok(order.indexOf('look') === order.indexOf('general') + 1, '3. Appearance sits right after Measurements', order);
    await pg.evaluate(() => { const L = window.__ironlog; L.state.settings.secOrder.settings = ['data', 'general', 'profile']; L.render(); });
    await pg.waitForTimeout(200);
    const saved = await read();
    ok(saved.indexOf('data') < saved.indexOf('general') && saved.indexOf('general') < saved.indexOf('profile') && saved.indexOf('look') === saved.indexOf('general') + 1, '3. a saved order with General keeps Measurements where General was against the others, Appearance right after it', saved);
    ok(r.wide, '3. guard: no sideways scroll at 320 px', r);
    await D.browser.close();
  }

  if (run(4)) {
    // The installable build (IRONLOG_APP) in each way it can open; the source file stands in for it with the flag set.
    const bar = async (mode, extra) => {
      const init = `window.IRONLOG_APP=true;${mode ? `(()=>{const m=window.matchMedia.bind(window);window.matchMedia=q=>q==='(display-mode: ${mode})'?{matches:true,media:q,addListener(){},removeListener(){},addEventListener(){},removeEventListener(){}}:m(q);})();` : ''}${extra || ''}`;
      const D = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00', setup: ctx => ctx.addInitScript(init) });
      await D.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.ui.tab = 'today'; L.render(); });
      await D.page.waitForTimeout(300);
      const shown = await D.page.evaluate(() => !!document.getElementById('installBar'));
      await D.browser.close();
      return shown;
    };
    ok(await bar(null), '4. guard: a plain browser tab offers Get the app');
    for (const m of ['standalone', 'minimal-ui', 'window-controls-overlay']) ok(!(await bar(m)), `4. opened as the installed app (${m}), no Get the app`);
    // The review of 2.34 (F1): a browser tab in full screen, or one another Android app opened (a link in Gmail), is a
    // tab, as the account flow must read it; 2.34 at ba0eb22 took both for the installed app.
    ok(await bar('fullscreen'), '4. a browser tab in full screen is still a tab (it offers Get the app)');
    ok(await bar(null, "Object.defineProperty(document,'referrer',{get:()=>'android-app://com.google.android.gm/'});"), '4. a tab opened from Gmail on Android is still a tab (it offers Get the app)');
    ok(!(await bar(null, "localStorage.setItem('ironlog.v1.appInstalled','1');")), '4. a browser that has installed the app no longer offers it');
  }

  if (run(5)) {
    const D = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00' });
    const t = await D.page.evaluate(() => { const L = window.__ironlog; L.state = L.normalize(null); L.state.settings.onboarded = true; L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); const p = document.getElementById('preApp'); return p ? { text: p.innerText.replace(/\s+/g, ' ').trim(), btn: !!p.querySelector('[data-act="pastOpen"]') } : null; });
    ok(t && t.btn && /^Log a past workout/.test(t.text) && !/Lifted before|before this app/.test(t.text), '5. Today leads with Log a past workout, no "Lifted before this app?"', t);
    await D.browser.close();
  }
  if (run(6)) {
    // The review of 2.34 (F4): Sources says the app's numbers come from these studies, so every study docs/EVIDENCE.md
    // names behind one of the app's numbers (its lines for each constant) is named there.
    const ev = fs.readFileSync(path.join(__dirname, '..', 'docs', 'EVIDENCE.md'), 'utf8');
    const named = new Map();
    for (const l of ev.split('\n').filter(x => /^- `[A-Z_0-9]+`/.test(x)))
      for (const m of l.matchAll(/\b([A-Z][a-z]+) ((?:19|20)\d\d)\b/g)) {
        if (/^(V|The|Since|Before|After|From|Until)$/.test(m[1])) continue;
        const k = `${m[1]} ${m[2]}`; if (!named.has(k)) named.set(k, new Set()); named.get(k).add(l.match(/^- `([A-Z_0-9]+)`/)[1]);
      }
    const D = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00' });
    const src = await D.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.modal = { kind: 'guide', open: 'sources' }; L.render(); const d = document.querySelector('#modal .gsec[data-g="sources"] .gbody'); return d ? d.innerText.replace(/\s+/g, ' ') : ''; });
    await D.browser.close();
    const missing = [...named].filter(([k]) => !src.includes(k)).map(([k, v]) => `${k} (${[...v].join(', ')})`);
    ok(named.size >= 15, `6. (a guard) EVIDENCE.md names ${named.size} studies behind the app's numbers`);
    ok(/Numbers come from these studies/.test(src) && !missing.length, "6. the Guide's Sources names every study behind one of the app's numbers", missing);
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
