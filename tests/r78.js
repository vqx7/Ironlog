// 2.32 (build r78; PENDING.md's tracker, NEW-77 to NEW-81), each section written as what a lifter expects and run first
// on 2.31 (`node tests/r78.js baselines/r77.html`), where each section fails unless it says it guards:
//   1  NEW-77: Short on time trims only when the time left is more than the time given, read as the sheet shows it:
//      "Planned: ~60 min" and 60 tapped says everything fits (2.31 cut Cable Crunch to 2 sets and said "~60 min after
//      the change"). Over the six demo days, a set ticked at a time, no chip at or above the Planned line trims, and
//      the minutes after a trim are the minutes the session then shows. Guards: a chip under the Planned line trims.
//   2  NEW-78 (V, 2026-11-07: "should not be irrational or illogical ... do not overengineer"): a trim fits the time
//      it is given and leaves out nothing that would still fit: after any trim not marked over, no exercise it cut or
//      left out could take back a set (an exercise left out its two) and still fit. Chest day, one set done, 20 min:
//      2.31 left about 8 minutes of work. Guards: done sets are never touched, and a trim never goes over the time.
//   3  NEW-79: a session started with Limited equipment keeps it: Pick for me and Swap's closest matches offer only
//      that equipment (2.31: Face Pull, a cable lift, first, with only dumbbells and bodyweight on). Guards: a session
//      started the usual way has no equipment saved, and its picks are not limited.
//   4  NEW-80: an import's dates are read one way for the whole file: a sheet whose dates show it is day first
//      (16/10/2026) reads 02/10/2026 as 2 October, not 10 February. Guards: a month-first sheet, and a sheet whose
//      dates fit either way, read month first as before; notes are read the same way as a sheet.
//   5  NEW-81: the tape rows' hard sets a week say which weeks they count: the weeks trained, of the weeks between
//      the two measurements, as every weekly average says it (r31). Guards: with every week trained, the sentence is
//      as before.
// R78_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R78_ONLY ? process.env.R78_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAYS = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];
const CHIPS = [15, 20, 30, 45, 60, 75];

// The demo log on a day of its routine, with that day's session started from Today.
async function demoSession(day) {
  const D = await open(FILE, { w: 390, h: 844, clock: day + 'T18:00:00' });
  const pg = D.page;
  await pg.evaluate(() => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; L.makeDemo(); for (const x of S.sessions) delete x.demo; localStorage.setItem('ironlog.v1.tipWake', '1'); L.invalidate(); L.render(); });
  await wait(300);
  return D;
}

(async () => {
  if (run(1) || run(2)) {
    const a = [], b = [], c = [], g = [];
    for (const day of DAYS) {
      const D = await demoSession(day);
      await D.page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(500);
      const r = await D.page.evaluate(({ CHIPS }) => {
        const L = window.__ironlog, d = L.state.draft;
        const min5 = m => (m >= 10 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m)));
        const blank = x => !x.done && x.r == null && x.rir == null;
        // The session as the trim leaves it: each exercise's first `keep` blank work rows kept, the other blank ones gone.
        const applied = (keepOf) => {
          const c = JSON.parse(JSON.stringify(d));
          c.ex.forEach((bl, bi) => { let n = 0; bl.sets = bl.sets.filter(x => { if (x.warm || !blank(x)) return true; n++; return n <= keepOf(bi); }); });
          return c;
        };
        const out = { fits: [], under: [], put: [], touched: [], over: [] };
        const rows = []; d.ex.forEach((bl, bi) => bl.sets.forEach((x, k) => { if (!x.warm) rows.push([bi, k]); }));
        for (let i = 0; i <= rows.length; i++) {
          if (i) { const [bi, k] = rows[i - 1]; const x = d.ex[bi].sets[k]; x.done = true; x.r = 10; x.w = x.w ?? 50; }
          const left = L.remainMin(d);
          if (!left) break;
          for (const v of CHIPS) {
            const p = L.shortPlan(d, v);
            const tag = { day: d.dayName, ticked: i, left, planned: min5(left), chip: v, est: p.est, changes: p.changes };
            if (min5(left) <= v && p.changes.length) out.fits.push(tag);
            if (min5(left) > v && !p.changes.length) out.under.push(tag);
            if (!p.changes.length) continue;
            const keepOf = bi => (p.bl.find(x => x.bi === bi) || { keep: 0 }).keep;
            const after = applied(keepOf);
            const afterMin = L.remainMin(after);
            if (afterMin !== p.est) out.touched.push({ ...tag, why: 'minutes after the trim are not the session\'s', afterMin });
            if (!p.over && min5(afterMin) > v) out.over.push({ ...tag, afterMin });
            // Done work is never touched.
            d.ex.forEach((bl, bi) => { const doneN = bl.sets.filter(x => !x.warm && !blank(x)).length; const kept = after.ex[bi].sets.filter(x => !x.warm && !blank(x)).length; if (kept !== doneN) out.touched.push({ ...tag, bi, why: 'done rows changed' }); });
            if (p.over) continue;
            // Nothing left out would still fit: one more set for an exercise cut, two for one left out.
            for (const x of p.bl) {
              if (x.keep >= x.undone) continue;
              const add = x.keep === 0 && !x.started ? Math.min(2, x.undone) : 1;
              const more = applied(bi => (bi === x.bi ? x.keep + add : keepOf(bi)));
              const m2 = L.remainMin(more);
              if (min5(m2) <= v) out.put.push({ ...tag, back: x.ex.name, add, then: m2 });
            }
          }
        }
        return out;
      }, { CHIPS });
      a.push(...r.fits); b.push(...r.put); c.push(...r.touched, ...r.over); g.push(...r.under);
      await D.browser.close();
    }
    if (run(1)) {
      ok(!a.length, `1. no chip at or above "Planned" trims (${a.length} did)`, a.slice(0, 3));
      ok(!g.length, '1. (a guard) a chip under "Planned" trims', g.slice(0, 3));
    }
    if (run(2)) {
      ok(!b.length, `2. a trim leaves out nothing that would still fit (${b.length} times it did)`, b.slice(0, 3));
      ok(!c.length, '2. (a guard) done sets kept, the minutes after a trim are the session\'s, and a trim not over fits', c.slice(0, 3));
    }
    if (run(1)) {
      // On screen: the Chest day, two sets of its first lift ticked.
      const D = await demoSession('2026-11-02');
      const pg = D.page;
      await pg.click('.hero [data-act="startSession"]:not([data-light])'); await wait(500);
      for (const s of [0, 1]) { await pg.evaluate(s => { const b = window.__ironlog.state.draft.ex[0], x = b.sets.filter(y => !y.warm)[s]; x.r = 10; x.w = x.w ?? 60; }, s); await pg.click(`[data-act="sDone"][data-b="0"][data-s="${s}"]`); await wait(300); }
      await pg.evaluate(() => window.__ironlog.openModal({ kind: 'short', mins: null })); await wait(300);
      const planned = await pg.evaluate(() => (document.querySelector('.sheet').innerText.match(/Planned: ~(\d+) min/) || [])[1]);
      await pg.click(`[data-act="shortPick"][data-v="${planned}"]`); await wait(300);
      const txt = await pg.evaluate(() => document.querySelector('.sheet').innerText.replace(/\s+/g, ' '));
      ok(planned && txt.includes(`Everything left fits in ${planned} minutes as planned.`) && !/Trim the session/.test(txt), `1. "Planned: ~${planned} min", ${planned} tapped: everything fits`, txt.slice(0, 400));
      ok(!D.errors.length, '1. no page errors', D.errors);
      await D.browser.close();
    }
    if (run(2)) {
      // The case 2.31 got wrong: Chest day, one set done, 20 minutes.
      const D = await demoSession('2026-11-02');
      await D.page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(500);
      const r = await D.page.evaluate(() => { const L = window.__ironlog, d = L.state.draft, x = d.ex[0].sets.filter(y => !y.warm)[0]; x.done = true; x.r = 10; x.w = x.w ?? 60; const p = L.shortPlan(d, 20); return { est: p.est, over: p.over, changes: p.changes }; });
      // Fits as the sheet shows minutes (to the nearest 5 from 10 up): 21 reads ~20.
      ok(!r.over && r.est >= 15 && Math.round(r.est / 5) * 5 <= 20, `2. Chest day, one set done, 20 min: about 20 minutes of work kept (${r.est})`, r);
      await D.browser.close();
    }
  }

  if (run(3)) {
    const D = await demoSession('2026-11-03');
    const pg = D.page;
    await pg.click('[data-act="heroMore"]'); await wait(300);
    await pg.click('[data-act="eqOpen"]'); await wait(300);
    const chips = await pg.$$eval('[data-act="eqToggle"]', bs => bs.map(b => [b.dataset.k, b.getAttribute('aria-pressed')]));
    for (const [k, on] of chips) if (!['dumbbell', 'bodyweight'].includes(k) && on === 'true') { await pg.click(`[data-act="eqToggle"][data-k="${k}"]`); await wait(60); }
    const kept = await pg.$$eval('[data-act="eqToggle"][aria-pressed="true"]', bs => bs.map(b => b.dataset.k));
    await pg.click('[data-act="eqStart"]'); await wait(500);
    const r = await pg.evaluate(() => {
      const L = window.__ironlog, d = L.state.draft, EX = id => L.state.exercises.find(e => e.id === id);
      return { picks: L.rankExercises(d).map(x => [x.e.name, x.e.equip]), saved: d.equip, again: (L.normalize(JSON.parse(JSON.stringify(L.state))).draft || {}).equip, first: EX(d.ex[0].exId).primary };
    });
    ok(kept.length === 2, '3. only dumbbells and bodyweight on', kept);
    ok(r.picks.length > 0 && r.picks.every(([, q]) => kept.includes(q)), '3. Pick for me offers only dumbbell and bodyweight lifts', r.picks);
    ok(JSON.stringify(r.saved) === JSON.stringify(kept) && JSON.stringify(r.again) === JSON.stringify(kept), '3. the session keeps its equipment, through a save and load', r);
    // Swap's closest matches for the session's first lift.
    await pg.evaluate(() => { const L = window.__ironlog, d = L.state.draft; L.openModal({ kind: 'picker', mode: 'swapBlock', b: 0, title: 'Swap exercise', q: '', m: L.state.exercises.find(e => e.id === d.ex[0].exId).primary }); });
    await wait(300);
    const sw = await pg.evaluate(() => {
      const L = window.__ironlog, names = [];
      const h = [...document.querySelectorAll('.pick-grp')].find(x => /Closest matches/.test(x.textContent));
      for (let e = h && h.nextElementSibling; e && !e.classList.contains('pick-grp'); e = e.nextElementSibling) { const b = e.querySelector('b'); if (b) names.push(b.textContent.trim()); }
      return names.map(n => [n, (L.state.exercises.find(e => e.name === n) || {}).equip]);
    });
    ok(sw.length > 0 && sw.every(([, q]) => kept.includes(q)), "3. Swap's closest matches are dumbbell and bodyweight lifts", sw);
    ok(!D.errors.length, '3. no page errors', D.errors);
    await D.browser.close();
    // A session started the usual way.
    const E = await demoSession('2026-11-03');
    await E.page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(500);
    const u = await E.page.evaluate(() => { const L = window.__ironlog, d = L.state.draft; return { has: 'equip' in d, eq: [...new Set(L.rankExercises(d).map(x => x.e.equip))] }; });
    ok(!u.has && u.eq.some(q => !['dumbbell', 'bodyweight'].includes(q)), '3. (a guard) a usual session saves no equipment and its picks are not limited', u);
    await E.browser.close();
  }

  if (run(4)) {
    const D = await open(FILE, { clock: '2026-11-07T18:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog;
      L.state.settings.onboarded = true;
      const sheet = csv => { const rows = L.impRows(csv); return L.impFromTable(rows, L.impHeader(rows[0])).sessions.map(s => s.date); };
      const notes = t => L.impFromText(t).sessions.map(s => s.date);
      return {
        dayFirst: sheet('Date,Exercise,Weight,Reps\n02/10/2026,Bench Press,80,8\n09/10/2026,Bench Press,82.5,8\n16/10/2026,Bench Press,82.5,9\n23/10/2026,Bench Press,85,8\n'),
        monthFirst: sheet('Date,Exercise,Weight,Reps\n10/02/2026,Bench Press,80,8\n10/09/2026,Bench Press,82.5,8\n10/16/2026,Bench Press,82.5,9\n'),
        either: sheet('Date,Exercise,Weight,Reps\n03/04/2026,Bench Press,80,8\n04/05/2026,Bench Press,82.5,8\n'),
        notesDayFirst: notes('02/10/2026\nBench press 80x8\n\n16/10/2026\nBench press 82.5x9\n'),
        notesMonthFirst: notes('10/02/2026\nBench press 80x8\n\n10/16/2026\nBench press 82.5x9\n')
      };
    });
    ok(JSON.stringify(r.dayFirst) === JSON.stringify(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23']), '4. a day-first sheet reads 02/10/2026 as 2 October', r.dayFirst);
    ok(JSON.stringify(r.notesDayFirst) === JSON.stringify(['2026-10-02', '2026-10-16']), '4. day-first notes read the same way', r.notesDayFirst);
    ok(JSON.stringify(r.monthFirst) === JSON.stringify(['2026-10-02', '2026-10-09', '2026-10-16']), '4. (a guard) a month-first sheet reads as before', r.monthFirst);
    ok(JSON.stringify(r.either) === JSON.stringify(['2026-03-04', '2026-04-05']), '4. (a guard) dates that fit either way read month first, as before', r.either);
    ok(JSON.stringify(r.notesMonthFirst) === JSON.stringify(['2026-10-02', '2026-10-16']), '4. (a guard) month-first notes read as before', r.notesMonthFirst);
    await D.browser.close();
  }

  if (run(5)) {
    const D = await open(FILE, { clock: '2026-10-14T18:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog, S = L.state;
      S.settings.onboarded = true;
      const curl = d => ({ id: 's' + d, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'dbCurl', rr: [8, 12], sets: Array.from({ length: 10 }, () => ({ w: 12, r: 10, rir: 1, warm: false, drop: false })) }] });
      const at = days => {
        S.measurements = [{ id: 'm1', date: '2026-09-01', arm: 38 }, { id: 'm2', date: '2026-10-13', arm: 39.5 }];
        S.sessions = days.map(curl);
        L.state = L.normalize(S); L.invalidate();
        const row = L.sizeRows()[0];
        return { row, said: L.sizeWhat ? L.sizeWhat(row) : null };
      };
      return { some: at(['2026-09-02', '2026-09-23', '2026-10-07']), all: at(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13']) };
    });
    ok(r.some.said === '10 hard sets a week for Biceps and Triceps, in the 3 weeks you trained of 7', '5. three weeks trained of seven: the sentence says so', r.some);
    ok(r.all.said === '10 hard sets a week for Biceps and Triceps', '5. (a guard) every week trained: the sentence as before', r.all);
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
