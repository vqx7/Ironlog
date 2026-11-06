// 2.29 (build r74; PENDING.md's tracker, item 396, the release V set on 2026-11-05), each section written as what a
// lifter expects and run first on 2.28 (`node tests/r74.js baselines/r73.html`, or on r73's index.html), where each
// section fails unless it says it guards:
//   1  387-B8 and NEW-62 (V, 2026-11-05: an exercise a lifter makes must count exactly as the library's does, with
//      no new settings in the editor): a lifter's own copy of a library core lift (bodyweight, main muscle abs,
//      obliques or neck) logged the same way reads the same everywhere a number is made: no best estimate, the
//      same Stats page, the same PRs, the same next target, the same weight lifted (2.28: the copy got a best
//      estimate, 40.6 kg on a knee raise at 80 kg bodyweight, and a Stats page the library's never shows). The share
//      of bodyweight is the editor's own field, typed as the library's. Every library lift answers as before (a guard:
//      the fingerprint printed is the same on 2.28 and 2.29).
//   2  NEW-69 and NEW-70 (390, V 2026-11-05: "the logic between KG and pounds needs to work and not break"), a lifter
//      who trained in one unit and now trains in the other (a gym in kg when travelling):
//      a. the last load, rounded to one the other unit's plates make by less than a step costs in reps, is the same
//         load: the reps to beat stand (2.28: 185 lb for 8, 8, 8 read in kg was 85 kg for 6+, reps back to the
//         bottom; a 60 lb pressdown done for 15s was 27.5 kg for 10+);
//      b. at the top of the range the step up is a whole step on the dumbbells or rack, never a sliver (2.28: 22.5 kg
//         dumbbells for 12s read in lb were "add 0.4 lb", 50 lb for 8+; NEW-6's rule, V 2026-10-27), with Your gym's
//         rack in lb too;
//      c. guards: in one unit throughout every answer is as before, and a rounding that does cost reps (12.5 kg
//         dumbbells read as 30 lb, 9% heavier, r54) still starts at the bottom of the range.
//   3  387-C6: a set left without an effort rating is read at the lift's usual rating as of its own date, so rating
//      later sessions never changes an old workout's numbers (2.28: Sep 15's 102.5 x 8 x 3, blank, had a best
//      estimate of 136.7 kg, and 127.2 kg once three October sessions were rated 0; the CSV export with it), and
//      today's blank set still reads the usual up to today (a guard).
//   4  NEW-71: with Corrected RIR on, a rated set is corrected by the RIR checks up to its own date, so a check logged
//      later never changes an old workout's estimate (2.28: Sep 15's 100 x 8 at 2 in reserve, 133.3 kg, then 136.7 once
//      two October checks were in), while Settings still shows the correction from every check to today (a guard).
// R74_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R74_ONLY ? process.env.R74_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const T = '2026-11-05';

(async () => {
  if (run(1)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog; const S = L.state;
      S.settings.onboarded = true; S.settings.unit = 'kg';
      S.bodyweights = [{ id: 'b1', date: '2026-09-01', kg: 80, demo: false }];
      const out = {};
      for (const libId of ['hangingLegRaise', 'kneeRaise', 'russianTwist', 'neckBridge']) {
        const lib = L.state.exercises.find(e => e.id === libId);
        // The lifter's own: the same fields as the library's, made in the editor, with an id of its own.
        // The share of bodyweight is a field the editor already shows (2.28's "Share of bodyweight"); the lifter types
        // the library's figure, so only the id differs.
        const own = Object.assign(JSON.parse(JSON.stringify(lib)), { id: 'own_' + libId, name: 'My ' + lib.name, custom: true, bwf: Math.round((L.tonnage(lib, { w: 0, r: 1 }, '2026-10-01') / 80) * 100) / 100 });
        S.exercises = S.exercises.filter(e => e.id !== own.id).concat([own]);
        const day = (d, id, sets) => ({ id: id + d, date: d, dayIdx: 0, dayName: 'Core', notes: '', ex: [{ exId: id, rr: [8, 15], sets: sets.map(([w, r, rir]) => ({ w, r, rir, warm: false, drop: false })) }] });
        const log = id => [day('2026-10-08', id, [[0, 10, 2], [0, 10, 2], [0, 9, 2]]), day('2026-10-15', id, [[0, 12, 2], [0, 11, 2], [0, 10, 2]]), day('2026-10-22', id, [[5, 10, 2], [5, 10, 2], [5, 9, 2]]), day('2026-10-29', id, [[5, 12, 1], [5, 12, 1], [5, 11, 1]])];
        S.sessions = [...log(libId), ...log(own.id)];
        L.state = L.normalize(S); L.invalidate(); L.saveNow();
        const plan = { sets: 3, repMin: 8, repMax: 15, rir: 1, rest: 90 };
        const read = id => {
          const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
          const idx = (L.IDX().byEx[id] || []).map(x => ({ date: x.date, best: r1(x.best), bb: r1(x.bb), pb: r1(x.pb), pbb: r1(x.pbb), vol: r1(x.vol), topW: x.topW, pts: x.pts.length }));
          const prs = L.IDX().prs.filter(p => p.exId === id).map(p => p.date + ' ' + p.type + (p.big ? ' counted' : ''));
          const st = L.IDX().exStats[id] || null;
          const g = L.suggest(id, plan, {});
          const tons = S.sessions.filter(s => s.ex[0].exId === id).map(s => Math.round(s.ex[0].sets.reduce((a, x) => a + L.tonnage(L.state.exercises.find(e => e.id === id), x, s.date), 0)));
          return { idx, prs, w: g.w, target: g.target, tons, noE1: L.noE1(L.state.exercises.find(e => e.id === id)), st: st && JSON.stringify(st, (k, v) => (k === 'sid' ? undefined : typeof v === 'number' ? Math.round(v * 10) / 10 : v)) };
        };
        out[libId] = { lib: read(libId), own: read(own.id) };
      }
      // Every library lift's answer to the rule, by id, for the guard.
      out.libNoE1 = L.state.exercises.filter(e => !e.custom).map(e => e.id + ':' + (L.noE1(e) ? 1 : 0)).join(',');
      return out;
    });
    for (const id of ['hangingLegRaise', 'kneeRaise', 'russianTwist', 'neckBridge']) {
      const { lib, own } = r[id];
      ok(lib.noE1 && lib.idx.length === 4 && lib.idx.every(x => x.best == null), `1. the library's ${id} has no best estimate (a guard: the test reads the right field)`, lib);
      ok(own.noE1 && JSON.stringify(own.idx) === JSON.stringify(lib.idx), `1. 387-B8: my own ${id} has no best estimate, read session for session as the library's (2.28: an estimate on mine)`, { lib: lib.idx, own: own.idx });
      ok(own.st === lib.st, `1. 387-B8: my own ${id} reads the same on its Stats page as the library's`, { lib: lib.st, own: own.st });
      ok(JSON.stringify(own.prs) === JSON.stringify(lib.prs), `1. 387-B8: my own ${id} makes the same PRs as the library's`, { lib: lib.prs, own: own.prs });
      ok(own.w === lib.w && own.target === lib.target, `1. 387-B8: my own ${id} gets the same next target as the library's`, { lib: [lib.w, lib.target], own: [own.w, own.target] });
      ok(JSON.stringify(own.tons) === JSON.stringify(lib.tons), `1. 387-B8: my own ${id} counts the same weight lifted as the library's`, { lib: lib.tons, own: own.tons });
    }
    ok(typeof r.libNoE1 === 'string' && r.libNoE1.length > 100, '1. the library\'s answers were read (a guard)', r.libNoE1.length);
    console.log('note libNoE1 ' + require('crypto').createHash('sha1').update(r.libNoE1).digest('hex'));
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(2)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const LB = 0.45359237;
    const r = await D.page.evaluate(LB => {
      const L = window.__ironlog;
      const go = (id, unit, kgLoad, reps, lo, hi, gym) => {
        const S = L.state; S.settings.onboarded = true; S.settings.unit = unit;
        if (gym) S.settings.gym = gym; else delete S.settings.gym;
        S.sessions = [0, 1, 2].map(i => ({ id: 'u' + i, date: ['2026-10-15', '2026-10-22', '2026-10-29'][i], dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: id, rr: [lo, hi], sets: [0, 1, 2].map(() => ({ w: kgLoad, r: reps, rir: 1, warm: false, drop: false })) }] }));
        L.state = L.normalize(S); L.invalidate();
        const g = L.suggest(id, { sets: 3, repMin: lo, repMax: hi, rir: 1, rest: 120 }, {});
        return { lb: g.w == null ? null : Math.round((g.w / LB) * 1000) / 1000, kg: g.w == null ? null : Math.round(g.w * 1000) / 1000, kind: g.tgt && g.tgt.kind, repMin: g.tgt && g.tgt.repMin, target: g.target, text: g.text };
      };
      return {
        benchKg: go('bench', 'kg', 185 * LB, 8, 6, 10),
        pressKg: go('pressdown', 'kg', 60 * LB, 15, 10, 15),
        dbLb: go('dbBench', 'lb', 22.5, 12, 8, 12),
        dbLbRack: go('dbBench', 'lb', 22.5, 12, 8, 12, { u: 'lb', db: { lo: 5, hi: 120, st: 5 } }),
        incDb: go('incDb', 'lb', 12.5, 10, 8, 12),
        same: [
          go('bench', 'lb', 185 * LB, 10, 6, 10), go('bench', 'lb', 185 * LB, 8, 6, 10), go('dbBench', 'lb', 50 * LB, 12, 8, 12),
          go('pressdown', 'lb', 60 * LB, 15, 10, 15), go('backSquat', 'kg', 100, 8, 5, 8), go('dbBench', 'kg', 22.5, 12, 8, 12),
          go('backSquat', 'lb', 100, 8, 5, 8, { u: 'kg', plates: [25, 20, 15, 10, 5, 2.5, 1.25] })
        ].map(x => x.target)
      };
    }, LB);
    const { benchKg, pressKg, dbLb, dbLbRack, incDb } = r;
    ok(benchKg.kind === 'reps' && Math.abs(benchKg.kg - 185 * LB) <= 2.5 && /is the nearest load in kg to what you did: aim for 25\+ reps over 3 sets at 85 kg\./.test(benchKg.text), '2a. NEW-69: 185 lb for 8, 8, 8 on 6 to 10, now in kg: the nearest load the plates make, beating 24 reps there, not reps back to 6 (2.28: 85 kg for 6+)', benchKg);
    ok(pressKg.kind === 'reps' && Math.abs(pressKg.kg - 60 * LB) <= 1.25 && !/at 27\.5 kg hit/.test(pressKg.text), '2a. NEW-69: a 60 lb pressdown done for 15, 15, 15 on 10 to 15, now in kg: still building reps at that weight, not 10+ (2.28: 27.5 kg for 10+)', pressKg);
    ok((dbLb.lb >= 54.6 - 0.05 || (dbLb.kind === 'reps' && /build every set to \d+ here first/.test(dbLb.text))) && !/add 0\.\d lb/.test(dbLb.text), '2b. NEW-70: 22.5 kg dumbbells for 12, 12, 12 on 8 to 12, now in lb: a whole step up, 55 lb (or more reps first), never "add 0.4 lb" (2.28: 50 lb for 8+)', dbLb);
    ok((dbLbRack.lb >= 54.6 - 0.05 || (dbLbRack.kind === 'reps' && /build every set to \d+ here first/.test(dbLbRack.text))) && !/add 0\.\d lb/.test(dbLbRack.text), '2b. NEW-70: the same on Your gym\'s dumbbells in lb, 5 to 120 by 5', dbLbRack);
    ok(incDb.lb === 30 && incDb.kind === 'load' && incDb.repMin === 8, '2c. guard (r54): 12.5 kg dumbbells for 10s read in lb go to 30 lb, 9% heavier, for 8+ reps', incDb);
    ok(JSON.stringify(r.same) === JSON.stringify(['195 lb for 6+ reps in every set', '25+ reps over 3 sets at 185 lb', '55 lb per dumbbell for 8+ reps in every set', '46+ reps over 3 sets at 60 lb, building to 17 each', '105 kg for 5+ reps in every set', '25 kg per dumbbell for 8+ reps in every set', '226 lb for 5+ reps in every set']), '2c. guard: lifts in one unit throughout, and a kg gym\'s plates shown in lb, answer as on 2.28', r.same);
    ok(!D.errors.length, '2. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(3)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const fs = require('fs');
    const setUp = withLater => D.page.evaluate(withLater => {
      const L = window.__ironlog, S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg';
      const ses = (i, d, w, reps, rir) => ({ id: 'q' + i, date: d, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: reps.map(r => ({ w, r, rir, warm: false, drop: false })) }] });
      const base = [ses(1, '2026-09-01', 100, [8, 8, 8], 2), ses(2, '2026-09-08', 100, [8, 8, 8], 2), ses(3, '2026-09-15', 102.5, [8, 8, 8], null)];
      const later = [ses(4, '2026-10-06', 102.5, [8, 8, 8], 0), ses(5, '2026-10-13', 102.5, [8, 8, 8], 0), ses(6, '2026-10-20', 102.5, [8, 8, 8], 0)];
      S.sessions = withLater ? [...base, ...later] : base;
      L.state = L.normalize(S); L.invalidate(); L.saveNow();
      const x = L.IDX().byEx.bench.find(e => e.sid === 'q3');
      return { best: Math.round(x.best * 10) / 10, prs: L.IDX().prs.filter(p => p.date === '2026-09-15').map(p => p.type).join(','), today: L.rirEst({ w: 102.5, r: 8, rir: null }, L.EX('bench')) };
    }, withLater);
    const csvRows = async () => {
      const [dl] = await Promise.all([D.page.waitForEvent('download'), D.page.evaluate(() => window.__ironlog.exportCSV())]);
      return fs.readFileSync(await dl.path(), 'utf8').split(/\r?\n/).filter(l => l.startsWith('2026-09-15')).join('|');
    };
    const before = await setUp(false); before.csv = await csvRows();
    const after = await setUp(true); after.csv = await csvRows();
    const r = { before, after };
    ok(r.before.best === 136.7 && r.after.best === r.before.best && r.after.prs === r.before.prs, '3. 387-C6: Sep 15, left unrated, keeps its best estimate and PRs once later sessions are rated (2.28: 136.7 kg, then 127.2)', r);
    ok(r.before.csv && r.after.csv === r.before.csv, '3. 387-C6: the CSV export\'s Sep 15 rows are the same before and after', { before: r.before.csv, after: r.after.csv });
    ok(r.before.today === 2 && r.after.today === 0, '3. guard: a blank set today reads the usual up to today, 2 before October and 0 after', [r.before.today, r.after.today]);
    ok(!D.errors.length, '3. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(4)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog, S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg'; S.settings.rirMode = 'cal';
      const set = (w, r, rir, cal) => ({ w, r, rir, warm: false, drop: false, ...(cal ? { cal } : {}) });
      const ses = (i, d, sets) => ({ id: 'k' + i, date: d, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets }] });
      const base = [ses(1, '2026-09-15', [set(100, 8, 2), set(100, 8, 2), set(100, 8, 2)])];
      // Two RIR checks in October: called 2 in reserve at 8, then 12 done, 2 more than called.
      const later = [ses(2, '2026-10-06', [set(100, 8, 2), set(100, 12, null, { at: 8, pred: 2 })]), ses(3, '2026-10-13', [set(100, 8, 2), set(100, 12, null, { at: 8, pred: 2 })])];
      const read = () => { L.state = L.normalize(S); L.invalidate(); const x = L.IDX().byEx.bench.find(e => e.sid === 'k1'); return { best: Math.round(x.best * 10) / 10, bias: L.calStats().bias, n: L.calStats().recent }; };
      S.sessions = [...base]; const a = read(); S.sessions = [...base, ...later]; const b = read();
      return { a, b };
    });
    ok(r.a.best === 133.3 && r.b.best === r.a.best, '4. NEW-71: Sep 15 keeps its estimate once later RIR checks are in (2.28: 133.3 kg, then 136.7)', r);
    ok(r.a.n === 0 && r.b.n === 2 && r.b.bias > 0, '4. guard: Settings\' correction reads every check to today', r);
    ok(!D.errors.length, '4. no page errors', D.errors);
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
