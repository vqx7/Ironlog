// The seams (r45, from the audit's structural risks, item 290). Sync rests on
// normalize() writing the same bytes for the same data: on every device, every
// pull, and between this build and the one before it, still on some phones.
// Nothing enforced that except the migration suite's fixed saves. Here, many
// random saves (odd values, unknown fields, every kind of record, a session
// in progress) must:
//   1. normalize to the same JSON a second time (idempotent, key order too);
//   2. split into sync documents and reassemble to the same documents;
//   3. survive the previous build reading those documents and writing them
//      back: this build reads them to the very same documents, so two phones
//      on two builds never rewrite each other.
const { open } = require('./h');
const fs = require('fs'); const path = require('path');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };
// The newest baseline is the build this one replaces (hygiene.js checks it is there).
const prev = fs.readdirSync(path.join(__dirname, '..', 'baselines')).filter(f => /^r\d+(-\d+)?\.html$/.test(f))
  .sort((a, b) => { const n = f => f.replace('.html', '').slice(1).split('-').map(Number); const x = n(a), y = n(b); return x[0] - y[0] || (x[1] || 0) - (y[1] || 0); }).pop();
const N = 60;

// Random saves, made in the page from the page's own exercises and routines.
const make = (seed) => {
  const L = window.__ironlog; let s0 = seed; const r = () => { s0 = (s0 * 16807) % 2147483647; return s0 / 2147483647; };
  for (let k = 0; k < 8; k++) r(); // small seeds start near 0; let them spread first
  const pick = a => a[Math.floor(r() * a.length)]; const ids = L.state.exercises.map(e => e.id);
  const day = i => { const d = new Date(2026, 9, 12 - i); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const odd = () => pick([undefined, null, '', 'x', -1, 0, 3.7, '8', NaN, { a: 1 }]);
  const st = JSON.parse(JSON.stringify(L.state));
  const set = () => ({ w: r() < 0.1 ? odd() : Math.round(r() * 120), r: r() < 0.1 ? odd() : 1 + Math.floor(r() * 15), rir: r() < 0.3 ? null : r() < 0.1 ? odd() : Math.floor(r() * 5), done: r() < 0.9, warm: r() < 0.1 || undefined, drop: r() < 0.05 || undefined, ...(r() < 0.05 ? { fut: { v: 1 } } : {}) });
  const blk = () => ({ exId: pick(ids), rr: r() < 0.3 ? null : [6, 10], cut: r() < 0.1 || undefined, light: r() < 0.05 || undefined, ...(r() < 0.05 ? { fut: 'b' } : {}), sets: Array.from({ length: 1 + Math.floor(r() * 5) }, set) });
  st.sessions = Array.from({ length: Math.floor(r() * 40) }, (_, i) => ({ id: 's' + seed + '_' + i, date: day(Math.floor(r() * 300)), t: r() < 0.3 ? '0' + Math.floor(r() * 9) + ':30' : undefined, dayIdx: 0, dayName: pick(['A', 'B', '', 'Upper']), routineId: st.activeRoutineId, notes: r() < 0.2 ? 'n<b>"' : '', deload: r() < 0.05, light: r() < 0.05, durMin: r() < 0.5 ? Math.floor(r() * 90) : undefined, ...(r() < 0.05 ? { fut: [1, 'a'] } : {}), ex: Array.from({ length: 1 + Math.floor(r() * 5) }, blk) }));
  st.bodyweights = Array.from({ length: Math.floor(r() * 8) }, (_, i) => ({ id: 'bw' + i, date: day(Math.floor(r() * 400)), kg: r() < 0.1 ? odd() : 60 + r() * 40 }));
  st.measurements = Array.from({ length: Math.floor(r() * 3) }, (_, i) => ({ id: 'm' + i, date: day(Math.floor(r() * 400)), arm: 30 + r() * 10, ...(r() < 0.2 ? { fut: 1 } : {}) }));
  st.cardio = Array.from({ length: Math.floor(r() * 5) }, (_, i) => ({ id: 'c' + i, date: day(Math.floor(r() * 200)), kind: pick(['run', 'other', 'zz']), min: r() < 0.1 ? odd() : Math.floor(r() * 60), dist: r() < 0.3 ? r() * 10 : undefined }));
  const S = st.settings;
  if (r() < 0.5) S.profile = { goal: pick(['size', 'strength', 'both', 'zz']), exp: pick(['new', 'some', 'long']), days: pick([2, 3, 4, 9]), focus: r() < 0.5 ? ['chest'] : [] };
  if (r() < 0.3) S.gym = { u: pick(['kg', 'lb']), db: { lo: 2, hi: 40, st: 2 } };
  if (r() < 0.3) S.rirScale = pick(['half', 'rpe', 'zz']);
  if (r() < 0.3) S.hidden = ['today:body', 'dash:body'];
  if (r() < 0.2) S.zzUnknown = 1;
  // The newest fields, where a round trip through the previous build is most likely to slip (r45 review).
  if (r() < 0.4) S.bandsFit = { chest: 8, quads: 9 };
  if (r() < 0.4) S.restWeeks = [day(70), day(140)];
  if (r() < 0.4) { const e = st.exercises.find(x => x.id === 'bench'); if (e) e.goal = { w: 100, r: 5 }; }
  if (r() < 0.3) { const b = blk(); if (r() < 0.6) { b.prev = ['60 x 8', '60 x 7']; b.prevOff = r() < 0.5 || undefined; b.light = r() < 0.3 || undefined; b.adj = { at: 0, w: 62.5, from: 60, r: 8, up: true, why: 'set 1 went 12 reps, past your 10' }; } st.draft = { id: 'd' + seed, date: day(0), startedAt: Date.now() - 3600e3, dayIdx: 0, dayName: 'A', routineId: st.activeRoutineId, notes: '', ex: [b] }; } else st.draft = null;
  return st;
};
// Reassembling sync documents without a merge: what a device that has only
// the cloud copy builds (the same shape cloudPull's assemble takes).
const reassemble = (L, docs) => {
  const sessions = [], cardio = [], bodyweights = [], measurements = [];
  for (const [id, d] of Object.entries(docs)) {
    if (/^s-/.test(id)) { sessions.push(...(d.sessions || [])); cardio.push(...(d.cardio || [])); }
    if (/^b-/.test(id)) { bodyweights.push(...(d.bodyweights || [])); measurements.push(...(d.measurements || [])); }
  }
  return L.normalize({ ...docs.core, bodyweights, measurements, sessions, cardio, draft: docs.draft ? docs.draft.draft : null });
};
const docsOf = (L, S) => JSON.parse(JSON.stringify(L.chunksOf(S)));

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const C = await open('index.html', { browser, clock: '2026-10-13T10:00:00' });
  const P = await open('baselines/' + prev, { browser, clock: '2026-10-13T10:00:00' });
  const fn = `const make=${make};const reassemble=${reassemble};const docsOf=${docsOf};return {make,reassemble,docsOf};`;
  let idem = 0, round = 0, cross = 0, recs = 0; const bad = [];
  for (let i = 0; i < N; i++) {
    const seed = 1000 + i * 7;
    const cur = await C.page.evaluate(([fn, seed]) => { const { make, reassemble, docsOf } = new Function(fn)(); const L = window.__ironlog; const raw = make(seed);
      const a = L.normalize(JSON.parse(JSON.stringify(raw))); const A = JSON.stringify(a); const B = JSON.stringify(L.normalize(JSON.parse(A)));
      const docs = docsOf(L, a); const back = docsOf(L, reassemble(L, docs));
      return { A, idem: A === B, round: JSON.stringify(back) === JSON.stringify(docs), docs, n: a.sessions.length + a.bodyweights.length + a.cardio.length }; }, [fn, seed]);
    recs += cur.n;
    if (cur.idem) idem++; else bad.push(['idem', seed]);
    if (cur.round) round++; else bad.push(['round', seed]);
    // The previous build reads this build's documents and writes them back.
    const viaPrev = await P.page.evaluate(([fn, docs]) => { const { make, reassemble, docsOf } = new Function(fn)(); const L = window.__ironlog; return docsOf(L, reassemble(L, docs)); }, [fn, cur.docs]);
    const again = await C.page.evaluate(([fn, docs]) => { const { make, reassemble, docsOf } = new Function(fn)(); const L = window.__ironlog; return docsOf(L, reassemble(L, docs)); }, [fn, viaPrev]);
    if (JSON.stringify(again) === JSON.stringify(cur.docs)) cross++; else { const d = Object.keys(cur.docs).find(k => JSON.stringify(cur.docs[k]) !== JSON.stringify(again[k])); bad.push(['cross', seed, d, JSON.stringify(cur.docs[d]).slice(0, 300), JSON.stringify(again[d]).slice(0, 300)]); }
  }
  console.log(`${N} random saves, ${recs} records; previous build: ${prev}`);
  ok(recs > N * 15, `the saves hold real logs (${recs} sessions, weigh-ins, and cardio entries)`);
  ok(idem === N, `normalize is idempotent on every save, key order included (${idem}/${N})`, bad.filter(b => b[0] === 'idem'));
  ok(round === N, `sync documents reassemble to the same documents (${round}/${N})`, bad.filter(b => b[0] === 'round'));
  ok(cross === N, `the previous build (${prev}) writes this build's documents back unchanged (${cross}/${N})`, bad.filter(b => b[0] === 'cross').slice(0, 2));
  ok(!C.errors.length && !P.errors.length, 'no page errors', [C.errors, P.errors]);
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
