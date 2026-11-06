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

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
