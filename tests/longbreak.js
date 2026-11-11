// A lift back after a long break (NEW-110; V, 2026-11-10: an old best "shouldn't automatically become a goal nor
// should it block them from achieving other wins", and PRs must not restart for every short break). A feature suite
// (CLAUDE.md, Tests): new checks of a long break go here. Run on the build before (`node tests/longbreak.js
// baselines/r92.html`, 2.46) every section fails there but the guards, which say so.
//   1  More than six months off a lift (LONG_BREAK_DAYS, a rule of thumb) it starts fresh, as a lift never done: no
//      load from before the break, the time away in words; up to six months the way back is the usual 90% (a guard).
//   2  With real sessions before the break: the first session back is fresh, the next sets are not a re-approach to
//      the old load, and the session after it is read by the usual rules, never "on the way back" to the old load.
//   3  A timed hold comes back the same way: fresh, no hold asked from before the break.
//   4  The records stay (guards): All-time bests keeps the old best, and a set weaker than it counts no PR.
//   5  All-time bests shows the best since you came back beside the best ever, only when the best ever is older.
//   6  The recap says a best since you came back that is not a PR; the first session back says none.
//   7  Today's workout and the session screen say the time away, not a load; a load typed far under one from years ago
//      is not taken for a mix-up of per-dumbbell and total.
//  10  The independent reviews of 2.47 (REV10-2 to REV10-5, failing on dd3b40d; REV11-1, failing on cad8921): the recap's
//      best since you came back from this session only, not another the same day; the odd-load check measured against
//      every session once the lift is back; a bodyweight lift back at bodyweight moving by reps, as the engine starts
//      it; no Load due on a lift on a break today, on Today or Stats (2.46 too); and a deload is no break.
//   9  The session's other checks read the lift as its targets do (NEW-113): ten years on, a lighter set is not called
//      a ramp-up by an old best's strength (asked by 2.47 before this fix, not by 2.46, whose return read blank efforts
//      as 2 in reserve), nor a load more than twice an old best a slipped digit (2.46 asked), as on a lift never done;
//      three weeks on they still are (guards).
//   8  The Guide says the rule.
// LONGBREAK_ONLY=1,5 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.LONGBREAK_ONLY ? process.env.LONGBREAK_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-10';
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const PLAN = { sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 150 };

// A lifter in lb with a routine of one day (bench 3 x 6-10 at 2, plank 3 x 30-60 s) and the sessions given, each
// [date, exId, [[lb, reps, rir], ...]], saved as Add an old best and Log a past workout save them (freestyle).
async function lifter(sessions) {
  const P = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00' });
  await P.page.evaluate(([sessions, PLAN]) => {
    const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
    S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false;
    S.routines = [{ id: 'R1', name: 'Mine', schedule: 'weekly', days: [{ id: 'd1', name: 'Push', items: [
      { uid: 'u1', exId: 'bench', sets: PLAN.sets, repMin: PLAN.repMin, repMax: PLAN.repMax, rir: PLAN.rir, rest: PLAN.rest, ss: null }
    ] }] }];
    S.activeRoutineId = 'R1';
    S.sessions = sessions.map(([date, exId, sets, marks], i) => ({ id: 'h' + i, date, dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', notes: '', free: true, ...(marks || {}),
      ex: [{ exId, rr: exId === 'plank' ? [30, 60] : [PLAN.repMin, PLAN.repMax], sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir: rir == null ? null : rir, done: true })) }] }));
    L.state = L.normalize(S);
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
  }, [sessions, PLAN]);
  await wait(100);
  return P;
}
const sug = (P, exId, plan) => P.page.evaluate(([exId, plan]) => { const L = window.__ironlog; const g = L.suggest(exId, plan, {}); return { w: g.w == null ? null : Math.round(g.w / 0.45359237), text: g.text }; }, [exId, plan || PLAN]);
// Finish, answering as one who means to save what was done (as tests/personas.js does), and the recap's text.
async function finish(page) {
  await page.click('#view [data-act="finish"]');
  for (let k = 0; k < 6; k++) {
    await wait(120);
    const q = await page.evaluate(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, title: m.title || '' } : null; });
    if (!q || q.kind !== 'confirm') break;
    await page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]');
  }
  await wait(150);
  const r = await page.evaluate(() => { const L = window.__ironlog; const m = L.ui.modal; const t = m && document.getElementById('modal') ? document.getElementById('modal').innerText : ''; if (m) L.ACT.mClose(); return { kind: m && m.kind, text: t }; });
  return r;
}
// A set typed and ticked on the session screen, as a thumb does.
async function logSet(page, b, s, w, r) {
  for (const [f, v] of [['w', w], ['r', r]]) {
    const q = `#view input[data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
    await page.fill(q, String(v)); await page.dispatchEvent(q, 'change');
  }
  await page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`); await wait(120);
}

(async () => {
  if (run(1)) {
    // An old best entered as a lift's only history, at five distances from today.
    const cases = [
      ['2016-03-01', /^Back after 10 years: pick a load you could lift about 12 times, erring light\./],
      ['2024-03-01', /^Back after 2 years: pick a load/],
      ['2026-04-01', /^Back after 7 months: pick a load/],
      [addD(DAY, -183), /^Back after 6 months: pick a load/],
      // REV10-1, the review of 2.47: 716 to 730 days read "1 years"; months stop at 23, then whole years from 2.
      [addD(DAY, -714), /^Back after 23 months: pick a load/],
      [addD(DAY, -716), /^Back after 2 years: pick a load/],
      [addD(DAY, -730), /^Back after 2 years: pick a load/]
    ];
    for (const [date, want] of cases) {
      const P = await lifter([[date, 'bench', [[315, 1, 0]]]]);
      const g = await sug(P, 'bench');
      ok(g.w == null && want.test(g.text) && !/315|lb/.test(g.text), `1. an old best of 315 x 1 on ${date}, the lift's only history: it starts fresh, no load asked, the time away said (2.46: about 215 lb from it)`, g);
      await P.ctx.close(); await P.browser.close();
    }
    // A guard: six months or less is the usual way back, 90% of the load from before.
    for (const date of [addD(DAY, -182), '2026-08-01']) {
      const P = await lifter([[date, 'bench', [[315, 1, 0]]]]);
      const g = await sug(P, 'bench');
      ok(g.w > 135 && g.w < 315 && /Back after \d+ weeks: about \d+ lb/.test(g.text), `1. a guard: an old best on ${date} (182 days or less) is the usual way back, a load lighter than it`, g);
      await P.ctx.close(); await P.browser.close();
    }
  }

  // Thirteen weeks of bench in 2024, climbing from 185 x 8 to 225 x 8, then nothing until this month.
  const OLD = [];
  for (let k = 0, w = 185; k < 13; k++, w += k % 3 === 0 ? 10 : 0) OLD.push([addD('2024-01-02', 7 * k), 'bench', [[w, 8, 2], [w, 8, 2], [w, 8, 2]]]);
  if (run(2)) {
    let P = await lifter(OLD);
    const g = await sug(P, 'bench');
    ok(g.w == null && /^Back after 2 years: pick a load/.test(g.text) && !/225|195/.test(g.text), '2. two years after real sessions, the first session back starts fresh (2.46: 195 lb, from 225)', g);
    // The next sets after a first set of 135 x 15 at 4 in reserve: the usual caps, not a re-approach to 225.
    const ns = await P.page.evaluate(plan => { const L = window.__ironlog; const LB = 0.45359237;
      const b = { exId: 'bench', plan, sets: [{ w: 135 * LB, r: 15, rir: 4, done: true }, { w: 135 * LB, r: null, rir: null }, { w: 135 * LB, r: null, rir: null }] };
      const n = L.nextSets(b, 0, null); return n ? { w: Math.round(n.w / LB) } : null; }, PLAN);
    ok(ns && ns.w > 135 && ns.w <= 135 * 1.25 + 0.5, '2. on that first session back, 135 x 15 at 4 in reserve moves the next sets up within the usual first-sessions cap (2.46: 175, a re-approach to 225)', ns);
    await P.ctx.close(); await P.browser.close();
    // The session after: read by the usual rules, never on the way back to the old load.
    for (const [r, rir] of [[10, 5], [10, 3]]) {
      P = await lifter([...OLD, ['2026-11-03', 'bench', [[135, r, rir], [135, r, rir], [135, r, rir]]]]);
      const h = await sug(P, 'bench');
      ok(!/way back|Back from the break|225/.test(h.text) && h.w >= 135, `2. after 135 x ${r} x 3 at ${rir} back, the next target is the usual rules' (2.46: "on the way back to 225 lb")`, h);
      await P.ctx.close(); await P.browser.close();
    }
  }

  if (run(3)) {
    const P = await lifter([['2024-03-01', 'plank', [[0, 60, null], [0, 60, null]]]]);
    const g = await sug(P, 'plank', { sets: 3, repMin: 30, repMax: 60, rir: 2, rest: 60 });
    ok(/^Back after 2 years\. Hold for 30-60 seconds each set\.$/.test(g.text), '3. a plank two years off starts fresh: hold for the range, nothing asked from before (2.46: 90% of the old hold)', g);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(4)) {
    // Guards: the old best stays a record, and PRs stay all-time.
    const P = await lifter([['2016-03-01', 'bench', [[315, 1, 0]]], ['2026-11-03', 'bench', [[245, 1, 1]]], ['2026-11-05', 'bench', [[225, 8, 1]]]]);
    const r = await P.page.evaluate(() => { const L = window.__ironlog; const b = L.allTimeBests('bench'); const prs = L.IDX().prs.filter(p => p.exId === 'bench' && p.big);
      return { heavy: b && b.heavy ? [Math.round(b.heavy.p.w / 0.45359237), b.heavy.p.r, b.heavy.date] : null, prs: prs.map(p => [p.date, p.type]) }; });
    ok(JSON.stringify(r.heavy) === JSON.stringify([315, 1, '2016-03-01']), '4. a guard: All-time bests keeps the old best, 315 x 1 in 2016', r);
    // A PR is a set stronger than every earlier one (CLAUDE.md), the old best included: PRs stay all-time.
    ok(!r.prs.length, '4. a guard: 245 x 1 and 225 x 8, each weaker than the old 315 x 1, count no PR', r);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(5)) {
    let P = await lifter([['2016-03-01', 'bench', [[315, 1, 0]]], ['2026-10-20', 'bench', [[245, 3, 1]]], ['2026-11-03', 'bench', [[225, 5, 2]]]]);
    let b = await P.page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = window.__ironlog.bestsBoard().html; const s = d.querySelector('.bx[data-ex="bench"] summary'); return s ? [...s.querySelectorAll('.bs')].map(x => x.textContent.trim()) : null; });
    ok(b && b.length === 2 && /^All time: .*heaviest 315×1, Mar 1, 2016$/.test(b[0]) && /^Since you came back on Oct 20: .*heaviest 245×3, Oct 20$/.test(b[1]), '5. All-time bests: the best ever, and the best since you came back beside it (2.46: the 2016 best alone)', b);
    await P.ctx.close(); await P.browser.close();
    // Guards: no long break, or a best ever made since coming back, shows one line as before.
    for (const [why, sessions] of [
      ['no long break', [['2026-09-01', 'bench', [[205, 5, 2]]], ['2026-10-20', 'bench', [[225, 5, 2]]]]],
      ['the best ever made since coming back', [['2016-03-01', 'bench', [[315, 1, 0]]], ['2026-10-20', 'bench', [[245, 3, 1]]], ['2026-11-03', 'bench', [[325, 1, 0]]]]]
    ]) {
      P = await lifter(sessions);
      b = await P.page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = window.__ironlog.bestsBoard().html; const s = d.querySelector('.bx[data-ex="bench"] summary'); return s ? [...s.querySelectorAll('.bs')].map(x => x.textContent.trim()) : null; });
      ok(b && b.length === 1 && !/All time|came back/.test(b[0]), `5. a guard: ${why}, one line as before`, b);
      await P.ctx.close(); await P.browser.close();
    }
  }

  if (run(6)) {
    const name = 'Barbell Bench Press';
    // The second session back beats the first's 245 x 3, under the old 315: said in the recap, counted as no PR.
    let P = await lifter([['2016-03-01', 'bench', [[315, 1, 0]]], ['2026-11-03', 'bench', [[245, 3, 1]]]]);
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(200);
    await logSet(P.page, 0, 0, 255, 3);
    let fin = await finish(P.page);
    const big = await P.page.evaluate(d => window.__ironlog.IDX().prs.filter(p => p.date === d && p.big).length, DAY);
    ok(fin.kind === 'recap' && new RegExp(`Best since you came back: ${name} 255×3`).test(fin.text) && big === 0, '6. the recap says 255 x 3 is the best since you came back, and no PR is counted (2.46: nothing said)', { fin, big });
    await P.ctx.close(); await P.browser.close();
    // A guard: the first session back has nothing since to beat, so it says none.
    P = await lifter([['2016-03-01', 'bench', [[315, 1, 0]]]]);
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(200);
    await logSet(P.page, 0, 0, 225, 5);
    fin = await finish(P.page);
    ok(fin.kind === 'recap' && !/came back/.test(fin.text), '6. a guard: the first session back says no best since you came back', fin);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(7)) {
    const P = await lifter([['2016-03-01', 'bench', [[315, 1, 0]]]]);
    const today = await P.page.evaluate(() => { const L = window.__ironlog; L.ui.folds['today:session'] = true; L.render(); return document.getElementById('view').innerText; });
    ok(/Back after 10 years: pick a load/.test(today) && !/First time|1 new/.test(today) && !/215/.test(today), '7. Today\'s workout says the bench is back after 10 years, not new and not a load (2.46: "Back after 558 weeks: about 215 lb")', today.slice(0, 900));
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(200);
    const sess = await P.page.evaluate(() => document.getElementById('view').innerText);
    ok(/Back after 10 years: pick a load/.test(sess) && !/about 215/.test(sess), '7. the session screen says it too', sess.slice(0, 900));
    await P.page.fill('#view input[data-f="w"][data-b="0"][data-s="0"]', '135'); await P.page.dispatchEvent('#view input[data-f="w"][data-b="0"][data-s="0"]', 'change'); await wait(100);
    await P.page.evaluate(() => window.__ironlog.mixCheck(0, 0)); await wait(100);
    const toast = await P.page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText : ''; });
    ok(!/well below last time/.test(toast), '7. 135 typed ten years after 315 is not taken for a per-dumbbell mix-up (2.46: "well below last time\'s 315")', toast);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(9)) {
    // The session's sets typed, ticked unrated, and Finish's first question, if any.
    const firstAsk = async (hist, sets) => {
      const P = await lifter(hist);
      await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(200);
      for (const [s, w, r] of sets) await logSet(P.page, 0, s, w, r);
      await P.page.click('#view [data-act="finish"]'); await wait(250);
      const m = await P.page.evaluate(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, title: m.title || '' } : null; });
      await P.ctx.close(); await P.browser.close();
      return m;
    };
    const ramp = [[0, 115, 10], [1, 135, 10], [2, 135, 10]];
    let m = await firstAsk([['2016-03-01', 'bench', [[315, 1, 1]]]], ramp);
    ok(m && m.kind !== 'confirm', '9. 115 x 10 before 135 x 10, ten years after a 315 x 1: Finish does not call it a ramp-up set, as on a lift never done (2.47 before this fix asked; 2.46 did not, reading the blank efforts as a return\'s 2 in reserve)', m);
    m = await firstAsk([['2026-10-20', 'bench', [[315, 1, 1]]]], ramp);
    ok(m && m.kind === 'confirm' && /ramp-up/.test(m.title), '9. a guard: three weeks after a 315 x 1 it still asks, 115 x 10 being easy for that lifter', m);
    // The load typed on a block, as Log it or Fix it reads it.
    const odd = async hist => {
      const P = await lifter(hist);
      await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(200);
      await P.page.fill('#view input[data-f="w"][data-b="0"][data-s="0"]', '225'); await P.page.dispatchEvent('#view input[data-f="w"][data-b="0"][data-s="0"]', 'change'); await wait(100);
      const o = await P.page.evaluate(() => { const L = window.__ironlog; const d = L.state.draft; return L.oddLoad(d.ex[0], 0, d.date); });
      await P.ctx.close(); await P.browser.close();
      return o;
    };
    let o = await odd([['2016-03-01', 'bench', [[95, 5, 2]]]]);
    ok(!o, '9. 225 ten years after a 95 x 5 is not asked about as more than twice the heaviest logged, as on a lift never done (2.46: asked)', o);
    o = await odd([['2026-10-20', 'bench', [[95, 5, 2]]]]);
    ok(/more than twice/.test(o || ''), '9. a guard: three weeks after a 95 x 5 it still asks', o);
  }

  if (run(10)) {
    // REV10-2: a second bench session today, 185 x 5, after the morning's 255 x 3 (the best since coming back).
    let P = await lifter([['2016-03-01', 'bench', [[315, 1, 0]]], ['2026-11-03', 'bench', [[245, 3, 1]]], [DAY, 'bench', [[255, 3, 1]]]]);
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(200);
    await logSet(P.page, 0, 0, 185, 5);
    let fin = await finish(P.page);
    ok(fin.kind === 'recap' && !/came back/.test(fin.text), '10. REV10-2: a second session the same day, 185 x 5, does not claim the morning\'s 255 x 3 as its best since you came back', fin);
    await P.ctx.close(); await P.browser.close();
    // REV10-3: 315 in 2016, back last week at 135 x 8: 285 is no slipped digit, 315 having been logged.
    P = await lifter([['2016-03-01', 'bench', [[315, 1, 0]]], ['2026-11-03', 'bench', [[135, 8, 2]]]]);
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(200);
    await P.page.fill('#view input[data-f="w"][data-b="0"][data-s="0"]', '285'); await P.page.dispatchEvent('#view input[data-f="w"][data-b="0"][data-s="0"]', 'change'); await wait(100);
    let o = await P.page.evaluate(() => { const L = window.__ironlog; const d = L.state.draft; return L.oddLoad(d.ex[0], 0, d.date); });
    ok(!o, '10. REV10-3: back at 135 after a 315 x 1 of 2016, 285 is not asked about as more than twice the heaviest logged', o);
    await P.ctx.close(); await P.browser.close();
    // REV10-4: dips at +45 two years ago start at bodyweight only; after BW x 15 at 4 in reserve the next sets add no load.
    const dips = async hist => {
      const Q = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00' });
      const r = await Q.page.evaluate(([hist, PLAN]) => { const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
        S.settings.onboarded = true; S.settings.unit = 'lb';
        S.bodyweights = [{ id: 'w1', date: '2026-11-01', kg: 180 * LB }];
        S.sessions = hist.map(([date, w], i) => ({ id: 'd' + i, date, dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', notes: '', free: true, ex: [{ exId: 'dips', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: w * LB, r: 8, rir: 2, done: true })) }] }));
        L.state = L.normalize(S); L.invalidate();
        const g = L.suggest('dips', PLAN, {});
        const b = { exId: 'dips', plan: PLAN, sets: [{ w: 0, r: 15, rir: 4, done: true }, { w: null, r: null, rir: null }, { w: null, r: null, rir: null }] };
        const n = L.nextSets(b, 0, null);
        return { text: g.text, next: n ? Math.round(n.w / LB) : null };
      }, [hist, PLAN]);
      await Q.ctx.close(); await Q.browser.close();
      return r;
    };
    let d = await dips([['2024-10-01', 45], ['2024-10-08', 45]]);
    ok(/bodyweight only/.test(d.text) && !(d.next > 0), '10. REV10-4: dips at +45 two years ago start at bodyweight only, and BW x 15 at 4 in reserve adds no load to the next sets', d);
    d = await dips([['2026-10-27', 45], ['2026-11-03', 45]]);
    ok(!/bodyweight only/.test(d.text), '10. a guard: dips at +45 last week are a loaded lift', d);
    // REV10-5: three sessions of 225 x 8 getting easier, then a break: no Load due on Today, nor its line on Stats.
    const easy = async (start, more = []) => {
      const Q = await lifter([...[0, 7, 14].map(k => [addD(start, k), 'bench', [[225, 8, 1 + k / 7], [225, 8, 1 + k / 7], [225, 8, 1 + k / 7]]]), ...more]);
      const r = await Q.page.evaluate(() => { const L = window.__ironlog; L.ui.folds['today:session'] = true; L.render();
        const t = document.getElementById('view').innerText;
        return { today: /Load due/.test(t), easier: !!(L.IDX().exStats.bench || {}).easier }; });
      await Q.ctx.close(); await Q.browser.close();
      return r;
    };
    let e = await easy('2024-10-01');
    ok(!e.today && !e.easier, '10. REV10-5: two years after three easier sessions, no Load due on Today and no getting-easier line (2.46 and 2.47 showed both)', e);
    e = await easy(addD(DAY, -64));
    ok(!e.today && !e.easier, '10. REV10-5: back after six weeks, no Load due either: the way back sets the load', e);
    e = await easy(addD(DAY, -15));
    ok(e.today && e.easier, '10. a guard: trained last week, the Load due stays', e);
    /* REV11-1: a deload ten days ago is training, so the lift is not on a break (the engine reads a break from a
       session of any kind, backDaysIn), and the Load due from the three sessions before it stays, as in 2.46. */
    e = await easy(addD(DAY, -50), [[addD(DAY, -10), 'bench', [[195, 8, 3], [195, 8, 3], [195, 8, 3]], { deload: true }]]);
    ok(e.today && e.easier, '10. REV11-1: three easier sessions, then a deload ten days ago: the Load due stays, as the lift is not on a break (2.47: gone)', e);
  }

  if (run(8)) {
    const P = await lifter([]);
    const g = await P.page.evaluate(() => { window.__ironlog.ACT.guideOpen({ dataset: { topic: 'rules' } }); return (document.getElementById('modal') || {}).textContent.replace(/\s+/g, ' '); });
    ok(/more than 6 months off a lift/i.test(g) && /starts fresh/.test(g) && /best since you came back/i.test(g), '8. the Guide says a lift more than 6 months off starts fresh, and where the best since you came back is shown', g.slice(0, 200));
    await P.ctx.close(); await P.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
