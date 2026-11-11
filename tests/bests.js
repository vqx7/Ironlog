// Bests, and the words for them (r47, V 2026-10-15). The questions a lifter
// asks while training.
//
//  "Is it easy to see what your PR was during a today session?"  It was not:
//  the lift's heaviest set was two taps away, under the exercise's menu.
//  "Is that what you mean by target, a target or a PR?"  The two were never
//  told apart anywhere.
//  "Can someone who just started still input a PR they hit before the app?"
//  They can, through History, Log a past workout, and it becomes a real best
//  that drives their targets. Nothing on Today said so.
const { open, engine } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } else console.log('ok  ', m); };
const CLOCK = '2026-10-15T10:00:00';
// The build under test; another (`node tests/bests.js baselines/r92.html`) shows a new check fails there.
const FILE = process.argv[2] || 'index.html';
const LB = 0.45359237;

(async () => {
  const browser = await engine.launch();

  // ---- 1. The heaviest set shows while you train the lift.
  {
    const P = await open(FILE, { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.render();
      document.querySelector('[data-act="startSession"]').click(); L.render();
      return L.state.draft.ex.map((b, i) => ({ lift: L.EX(b.exId).name, line: L.bestLine(b.exId),
        onScreen: /Heaviest /.test(document.getElementById('blk-' + i).textContent) }));
    });
    ok(r.length > 0 && r.every(x => x.line && x.onScreen), 'every lift with history shows its heaviest set during the session', r.filter(x => !x.onScreen).slice(0, 2));
    ok(r.every(x => /^Heaviest /.test(x.line)), 'in the words the bests board uses, not a new name for it', r.map(x => x.line).slice(0, 2));
    ok(!P.errors.length, 'no page errors (heaviest on screen)', P.errors);
    await P.ctx.close();
  }

  // ---- 2. Its date shows only when it adds something: not when the Last line beside it already says it.
  {
    const P = await open(FILE, { browser, clock: CLOCK });
    const r = await P.page.evaluate((lb) => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.makeDemo();
      const ss = L.sortedSessions(); const first = ss[0];
      // A much heavier bench, long before the lift's last session.
      first.ex.push({ exId: 'bench', rr: [3, 5], sets: [{ w: 315 * lb, r: 3, rir: 0, done: true }] });
      L.state = L.normalize(L.state); L.invalidate(); L.saveNow();
      const exps = L.IDX().byEx.bench || [];
      return { old: L.bestLine('bench'), oldDate: first.date, newestExposure: exps.length ? exps[exps.length - 1].date : null,
        sameSession: L.bestLine(L.sortedSessions()[L.sortedSessions().length - 1].ex[0].exId) };
    }, LB);
    ok(/Heaviest 315×3, /.test(r.old), 'a best from an older session carries its date', r);
    ok(r.sameSession && !/, /.test(r.sameSession.replace('Heaviest ', '')), 'a best from the lift\'s last session leaves the date off, since the Last line already shows it', r.sameSession);
    ok(!P.errors.length, 'no page errors (dates)', P.errors);
    await P.ctx.close();
  }

  // ---- 3. A lifter who starts fresh can still bring in what they did before the app.
  {
    const P = await open(FILE, { browser, clock: CLOCK });
    const r = await P.page.evaluate((lb) => { const L = window.__ironlog;
      L.state = L.normalize(null); L.state.settings.onboarded = true; L.state.settings.unit = 'lb'; L.invalidate(); L.saveNow();
      L.ui.tab = 'today'; L.render();
      const offered = document.getElementById('preApp');
      const before = L.allTimeBests('bench');
      // What Log a past workout saves: a freestyle session on an earlier date.
      L.state.sessions = [{ id: 'old', date: '2025-06-01', dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', notes: '', free: true,
        ex: [{ exId: 'bench', rr: [3, 5], sets: [{ w: 225 * lb, r: 5, rir: 0, done: true }] }] }];
      L.state = L.normalize(L.state); L.invalidate(); L.saveNow();
      const after = L.allTimeBests('bench');
      const sg = L.suggest('bench', L.planFor('bench'));
      L.ui.tab = 'dash'; L.ui.folds['dash:lifts'] = true; L.ui.dashEx = 'bench'; L.render();
      document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render();
      return { offeredOnToday: !!(offered && offered.querySelector('[data-act="pastOpen"]')),
        before: !!before, heaviest: after && after.heavy ? Math.round(after.heavy.p.w / lb) : null,
        estimate: after && after.est ? Math.round(after.est.v / lb) : null,
        engineRead: L.whyTarget(sg), statsShows: /225/.test(document.getElementById('view').textContent) };
    }, LB);
    ok(r.offeredOnToday, 'with nothing logged, Today says where lifts done before the app go');
    ok(!r.before && r.heaviest === 225 && r.estimate > 225, 'a pre-app session becomes a real best: heaviest 225, an estimate above it', r);
    ok(r.statsShows, 'and it shows under Stats', r.statsShows);
    /* The engine reads it as a lift back after a long break, 16 months: it starts fresh, said as the time away, and
       nothing from before the break is asked (NEW-110, V 2026-11-10: an old best is never made a goal). Until 2.47
       it started from it, at 90% of 225, as after a break of weeks (r47). */
    ok(/^Back after 16 months: pick a load/.test(r.engineRead) && !/225|205|200/.test(r.engineRead), 'the engine reads it as a lift back after 16 months: it starts fresh, nothing from before asked', r.engineRead);
    ok(!P.errors.length, 'no page errors (pre-app lifts)', P.errors);
    await P.ctx.close();
  }

  // ---- 4. The Guide tells a target and a record apart.
  {
    const P = await open(FILE, { browser, clock: CLOCK });
    const g = await P.page.evaluate(() => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.saveNow(); L.ACT.guideOpen({ dataset: { topic: 'rules' } });
      return (document.getElementById('modal') || {}).textContent.replace(/\s+/g, ' ');
    });
    ok(/A target is not a record/.test(g), 'the Guide says a target is not a record');
    ok(/what to beat in today's session/.test(g) && /best you have ever done/.test(g), 'and says what each one is', g.slice(0, 60));
    ok(/Log a past workout/.test(g), 'and where lifts from before the app go', g.slice(0, 60));
    ok(!P.errors.length, 'no page errors (guide)', P.errors);
    await P.ctx.close();
  }

  // ---- 5. A record from another year says its year wherever a best is shown (NEW-111, found building 2.47: All-time
  //      bests and the heaviest line in a session read a 315 x 1 from 2016 as "Mar 1", this year's).
  {
    const P = await open(FILE, { browser, clock: CLOCK });
    const r = await P.page.evaluate((lb) => { const L = window.__ironlog; const S = L.state;
      S.settings.onboarded = true; S.settings.unit = 'lb';
      S.routines = [{ id: 'R1', name: 'Mine', schedule: 'weekly', days: [{ id: 'd1', name: 'Push', items: [{ uid: 'u1', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 150, ss: null }] }] }];
      S.activeRoutineId = 'R1';
      const one = (id, date, w, r) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', notes: '', free: true, ex: [{ exId: 'bench', rr: [1, 5], sets: [{ w: w * lb, r, rir: 0, done: true }] }] });
      S.sessions = [one('a', '2016-03-01', 315, 1), one('b', '2026-10-01', 185, 5)];
      L.state = L.normalize(S); L.invalidate(); L.saveNow();
      const d = document.createElement('div'); d.innerHTML = L.bestsBoard().html;
      const sum = d.querySelector('.bx[data-ex="bench"] summary .bs');
      // The rep records, heaviest first: 315 x 1 from 2016 is the first row under the header.
      const cell = d.querySelector('.bx[data-ex="bench"] table tr:nth-child(2) td:last-child');
      L.ui.tab = 'today'; L.ui.folds['today:session'] = true; L.render();
      const pv = document.querySelector('#view .pvbest');
      return { line: L.bestLine('bench'), board: sum ? sum.textContent : null, table: cell ? cell.textContent : null, preview: pv ? pv.textContent : null };
    }, LB);
    ok(/, Mar 1, 2016$/.test(r.line), 'the heaviest line in a session says the year of a 2016 record (2.46: "Mar 1")', r);
    ok(/heaviest 315×1, Mar 1, 2016$/.test(r.board) && /2016/.test(r.table || ''), 'All-time bests says it, in the row and in its table of rep records', r);
    ok(/Mar 1, 2016$/.test(r.preview || ''), 'and Today\'s workout preview names the best with its year', r);
    ok(!P.errors.length, 'no page errors (years)', P.errors);
    await P.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
