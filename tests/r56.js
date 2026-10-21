// r56: storage and sync moved out of the legacy script into typed modules
// (phase 4, ARCHITECTURE.md), and nothing they do changed. Sync rests on
// normalize() writing the same bytes for the same data on every phone and
// every build, so this build and the one before it (baselines/r55.html, the
// newest build published before the move) are given the very same raw logs,
// and every answer must be the same JSON, key order included:
//   - normalize, with the count of damaged records it dropped and of unknown
//     fields it kept (normalize.dropped, keepExtra.n);
//   - chunksOf, the sync documents, and assemble, the log put back from them;
//   - baseOf, each document's merge base, and mergeChunk, the three-way merge
//     of a document edited on two phones, either side winning.
// The raw logs: 240 wide histories (tests/wide.js), and each again damaged by
// a seeded hand (odd values in every kind of field, unknown fields, records
// with the wrong shape, duplicate ids, a broken session in progress, trash of
// every kind), so the cleaning paths run as much as the ordinary ones.
// A guard: it passes before the move as after. Run it on another pair with
// `node tests/r56.js <old page> <new page>`.
const { open } = require('./h');
const { wide } = require('./wide');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } else console.log('ok  ', m); };
const OLD = process.argv[2] || 'baselines/r55.html';
const NEW = process.argv[3] || 'index.html';
const N = 240;

// A seeded hand that damages a raw log, the same way for both pages.
function damage(raw, seed) {
  let a = seed >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  const pick = xs => xs[Math.floor(r() * xs.length)];
  const odd = () => pick([undefined, null, '', 'x', -1, 0, 3.7, '8', 1e20, -1e20, true, false, [], {}, [1, 2], { a: 1 }, 'NaN', '2026-13-40']);
  const s = JSON.parse(JSON.stringify(raw));
  const poke = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 5) return;
    for (const k of Object.keys(o)) {
      if (r() < 0.04) o[k] = odd();
      else if (o[k] && typeof o[k] === 'object') poke(o[k], depth + 1);
    }
    if (!Array.isArray(o) && r() < 0.05) o['zz' + Math.floor(r() * 9)] = pick([1, 'two', { three: 3 }, [4]]);
    if (!Array.isArray(o) && r() < 0.02) o.__proto__x = 1;
  };
  poke(s, 0);
  if (r() < 0.3 && Array.isArray(s.sessions) && s.sessions.length) s.sessions.push(JSON.parse(JSON.stringify(s.sessions[0])));
  if (r() < 0.2 && Array.isArray(s.sessions) && s.sessions.length) { const d = JSON.parse(JSON.stringify(s.sessions[0])); if (d && typeof d === 'object') { d.date = '2025-01-02'; s.sessions.push(d); } }
  if (r() < 0.2) s.sessions = pick([null, {}, 'x', [null, 1, 'x', {}]]);
  if (r() < 0.2) s.draft = pick([{}, { ex: 'x', date: '2026-10-01' }, { ex: [{ exId: 'bench', sets: [null, {}, { w: 'x', r: '' }] }], date: '2026-10-01', plan: 7 }]);
  if (r() < 0.2) s.trash = [{ id: 't1', kind: 'session', date: '2026-10-10', data: { id: 't1', date: '2026-10-01', ex: [] } }, { id: 't2', kind: 'zz', date: 'x', data: null }, null, { id: 't3', kind: 'cardio', date: '2026-10-11', data: { id: 't3', date: '2026-10-01', min: 20 } }];
  if (r() < 0.15) s.version = pick([1, 2, 3, 4, 'x', null]);
  if (r() < 0.1) s.settings = pick([null, 'x', [], {}]);
  if (r() < 0.1) s.routines = pick([[], null, [{ days: 'x' }], [{ id: 'q', days: [null, { items: 'x' }, { items: [null, { exId: 'bench', sets: 'x' }] }] }]]);
  return s;
}

(async () => {
  const A = await open(OLD, { clock: '2026-10-20T10:00:00', realStarter: true });
  const B = await open(NEW, { clock: '2026-10-20T10:00:00', realStarter: true, browser: A.browser });
  const LIB = await B.page.evaluate(() => window.__ironlog.libExercises());

  const inputs = [];
  for (let i = 0; i < N; i++) { const h = wide(56000 + i, LIB); inputs.push(h.raw); if (i % 2 === 0) inputs.push(damage(h.raw, 56000 + i)); else inputs.push(damage(h.raw, 99000 + i)); }
  inputs.push(null, {}, [], 'x', { settings: {} }, { sessions: [{}] });
  // Hand-made edges: the values the move reads through readers rather than as the old code spread or indexed them.
  const h0 = wide(56999, LIB).raw;
  const withS = (f) => { const r = JSON.parse(JSON.stringify(h0)); f(r); return r; };
  inputs.push(
    { settings: 'x' },                                                                   // a settings value that is a string, spread as its letters
    { settings: ['a', 'b'] },                                                            // and one that is a list
    { settings: { bands: 'x', restWeeks: ['2026-09-28', '2026-09-28', 'x', 7], secOrder: { today: ['a<b', 'ok', 7], dash: 'x' }, folds: ['x"y', 'ok'], hidden: ['today:week', 'nope', 3], homeFolded: ['map', 'x'], priorities: ['chest', 'nope'], bandsFit: { chest: 5, lats: 1.5, neck: 3, quads: 101 } } },
    withS(r => { r.settings.bands = { chest: [90, 10], lats: ['8', '12'], quads: [1, 2, 3] }; }),      // bands the wrong way round, as strings, too long
    withS(r => { r.cardio = [{ date: '2026-10-01', min: 20, kind: ['walk'], when: { a: 1 }, dist: '3.5' }, { date: '2026-10-02', min: 20, kind: 'constructor', when: 'toString' }]; }), // a kind that is a list, and keys Object already has
    withS(r => { r.exercises.push({ id: 'constructor', name: 'x', primary: 'nope', secondary: ['chest', 'nope', 'chest'] }, { id: 'goal', name: 'g', goal: { w: '100', r: 8.4 }, timed: true, bwf: 2 }, { id: 'goal2', name: 'g', goal: { w: 100, r: 8.4 }, assist: true, bw: true }); }),
    withS(r => { r.routines = [{ id: 'r', days: [] }, { id: 'w', schedule: 'weekly', days: [{ items: [{ exId: 'bench', repMin: 12, repMax: 8, jump: '5' }] }] }, { id: 'w8', schedule: 'weekly', days: [1, 2, 3, 4, 5, 6, 7, 8] }]; }),
    withS(r => { r.trash = [{ id: 't', kind: 'routine', date: '2026-10-19', data: r.routines[0] }, { id: r.sessions[0].id, kind: 'session', date: '2026-10-19', data: r.sessions[0] }, { id: r.sessions[1].id, kind: 'session', date: '2026-10-19', data: { ...r.sessions[1], notes: 'edited' } }]; }), // a tombstone that holds, and one an edit outlives
    withS(r => { r.sessions.push({ ...JSON.parse(JSON.stringify(r.sessions[0])), notes: 'twin' }); r.cardio = [{ id: 'c1', date: '2026-10-01', min: 20 }, { id: 'c1', date: '2026-10-02', min: 30 }]; }), // two copies of one id, sessions and cardio
    withS(r => { r.draft = { ex: [{ exId: 'bench', sets: [{ w: null, r: '' }, { w: '80', r: '8', rir: '', done: 1 }], plan: 'x', adj: { at: 1, w: '80', from: 70, r: 8 }, keepRR: ['8', '12'], lastNote: { date: '2026-10-01', text: 'x' }, sw: '70' }], date: '2026-10-20', startedAt: '1760000000000', durMin: 0.4, cardio: [{ kind: 'walk' }, 'x'] }; }),
    withS(r => { r.injuries = [{ m: 'chest', date: 'x' }, { m: 'knee', note: 7 }, { m: 'nope' }, 'x']; r.deloadWeek = 7; r.activeRoutineId = 'missing'; r.version = 1; }),
    withS(r => { r.bodyweights = [{ date: '2026-10-01', kg: '80' }, { date: '2026-10-02', kg: 500 }, { date: 'x', kg: 80 }]; r.measurements = [{ date: '2026-10-01', arm: '40', waist: -1, calf: 400, extra: 1 }, { date: 'x' }]; }),
    withS(r => { r.priors = [1]; r.version = 'x'; r.exercises = r.exercises.map(e => ({ ...e, perSide: 'yes' })); }), // v1 backfill of perSide
    withS(r => { r.version = 4; r.exercises = r.exercises.map(e => ({ ...e, primary: 'chest', secondary: [] })); }) // v5 migration
  );
  let same = 0, lines = 0, first = null, normalizeRuns = 0;
  for (let i = 0; i < inputs.length; i++) {
    const t = JSON.stringify(inputs[i] === undefined ? null : inputs[i]);
    // Every answer of one page for one raw log, as text, so the two pages are compared exactly.
    const run = P => P.page.evaluate(t => {
      const L = window.__ironlog; const out = [];
      // New ids (a starter routine put in an empty list) come from the clock and Math.random: both fixed, the same on both pages.
      const now0 = Date.now, rnd0 = Math.random; let seed = 7; Date.now = () => 1792500000000; Math.random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      try {
      const S = v => { try { return JSON.stringify(v === undefined ? '__undefined' : v); } catch (e) { return 'ERR ' + e.message; } };
      const run = (name, f) => { let v; try { v = f(); } catch (e) { v = 'ERR ' + String(e && e.message); } out.push(name + ' ' + S(v)); return v; };
      L.keepExtra.n = 0;
      const st = run('normalize', () => L.normalize(JSON.parse(t)));
      out.push('dropped ' + L.normalize.dropped + ' kept ' + L.keepExtra.n);
      if (!st || typeof st !== 'object') return out;
      run('again', () => L.normalize(JSON.parse(JSON.stringify(st))));
      const ch = run('chunksOf', () => L.chunksOf(st)) || {};
      run('assemble', () => L.assemble(JSON.parse(JSON.stringify(ch))));
      for (const id of Object.keys(ch).sort()) {
        const d = ch[id]; run('baseOf ' + id, () => L.baseOf(id, d));
        const local = JSON.parse(JSON.stringify(d)), remote = JSON.parse(JSON.stringify(d));
        for (const k of Object.keys(local)) if (Array.isArray(local[k]) && local[k].length) { local[k].shift(); if (Array.isArray(remote[k]) && remote[k][0] && typeof remote[k][0] === 'object') remote[k].push({ ...JSON.parse(JSON.stringify(remote[k][0])), id: 'zzNew' }); }
        if (id === 'core' && local.settings) { local.settings.unit = local.settings.unit === 'kg' ? 'lb' : 'kg'; if (remote.settings) remote.settings.unit = 'kg'; }
        if (id === 'draft') remote.draft = null;
        const base = L.baseOf(id, d);
        for (const rw of [false, true]) { const stat = { conflicts: 0 }; run(`merge ${id} ${rw}`, () => [L.mergeChunk(id, base, local, remote, rw, stat), stat.conflicts]); }
        run(`merge ${id} nobase`, () => L.mergeChunk(id, null, local, remote, false, { conflicts: 0 }));
      }
      return out;
      } finally { Date.now = now0; Math.random = rnd0; }
    }, t);
    const a = await run(A), b = await run(B);
    normalizeRuns++;
    lines += Math.max(a.length, b.length);
    for (let k = 0; k < Math.max(a.length, b.length); k++) {
      if (a[k] === b[k]) same++;
      else if (!first) { const x = String(a[k]), y = String(b[k]); let d = 0; while (d < x.length && x[d] === y[d]) d++; first = { input: i, line: k, at: d, old: x.slice(Math.max(0, d - 120), d + 200), now: y.slice(Math.max(0, d - 120), d + 200) }; }
    }
  }
  ok(normalizeRuns === inputs.length && lines > inputs.length * 10 && same === lines, `the same normalize, drop and kept counts, sync documents, reassembly, merge bases and merges as ${OLD} on ${inputs.length} raw logs, half of them damaged by hand: ${same} of ${lines} answers`, first);
  ok(!A.errors.length && !B.errors.length, 'no page errors', [...A.errors, ...B.errors].slice(0, 4));
  await A.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
