// r36 (V, 2026-10-11: "Im worried code optimization will break everything"):
// the code split into parts and the two largest functions broken up must
// change nothing. This suite proves it on the engine and the analytics: the
// same random histories (seeded, so every run is the same) go into the build
// this one replaces and into this one, and every number that comes out must be
// identical: IDX() whole (every exposure, trend, stall, PR, weekly set count,
// muscle score), suggest() for each lift in normal, lighter-day, deload and
// past-date form across plans, the coach, the weekly averages and the region
// balance. Then the parts in src/ must join into index.html byte for byte.
// Runs on the source only (the build is checked by every other suite).
const { open } = require('./h');
const fs = require('fs'); const path = require('path');
const { execFileSync } = require('child_process');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); };
const BASE = process.env.R36_BASE || 'baselines/r35.html';
const FILE = process.env.R36_FILE || 'index.html';
const N = +process.env.R36_N || 2000;

// A small seeded generator (mulberry32), so a failure is the same history on every run.
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const LIFTS = [
  ['bench', 135, 5, [6, 10]], ['squat', 185, 5, [5, 8]], ['deadlift', 225, 10, [3, 6]], ['latPulldown', 100, 5, [8, 15]], ['dbCurl', 25, 5, [8, 12]],
  ['dbRow', 50, 5, [8, 12]], ['pushup', 0, 5, [10, 20]], ['pullup', 0, 5, [5, 10]], ['hangingLegRaise', 0, 5, [10, 20]], ['assistPullup', -60, 5, [6, 10]],
  ['plank', 0, 5, [30, 60]], ['bss', 30, 5, [8, 12]], ['incDb', 50, 5, [8, 12]], ['dbLateral', 15, 5, [10, 20]],
];
function history(seed) {
  const r = rng(seed); const pick = a => a[Math.floor(r() * a.length)];
  const kg = r() < 0.3; const LB = 0.45359237; const u = v => kg ? v : v * LB;
  const lifts = LIFTS.filter(() => r() < 0.55); if (lifts.length < 2) lifts.push(LIFTS[0], LIFTS[4]);
  const weeks = 3 + Math.floor(r() * 14); // Ending anywhere from today (Oct 11, day 132 from June 1) to about 6 weeks before, so some lifts are current and some come back after a break.
  const start = 132 - weeks * 7 - Math.floor(r() * 40);
  const sessions = []; const level = {}; let id = 0;
  for (const [ex, w0] of lifts) level[ex] = w0;
  for (let wk = 0; wk < weeks; wk++) {
    const per = 1 + Math.floor(r() * 3); const deloadWk = r() < 0.08;
    for (let k = 0; k < per; k++) {
      if (r() < 0.1) continue;
      const day = start + wk * 7 + k * 2 + (r() < 0.15 ? 0 : 0);
      const date = new Date(Date.UTC(2026, 5, 1) + day * 864e5).toISOString().slice(0, 10);
      const exs = lifts.filter(() => r() < 0.7); if (!exs.length) continue;
      const blocks = [];
      for (const [exId, , step, rr] of exs) {
        const n = 1 + Math.floor(r() * 4); const sets = [];
        let w = level[exId]; if (deloadWk) w = w * 0.9;
        for (let i = 0; i < n; i++) {
          const reps = Math.max(1, rr[0] - 2 + Math.floor(r() * (rr[1] - rr[0] + 5)));
          const rir = r() < 0.25 ? null : Math.floor(r() * 5);
          sets.push({ w: u(Math.round(w)), r: reps, rir, done: true, warm: i === 0 && r() < 0.1 ? true : undefined, drop: i === n - 1 && r() < 0.05 ? true : undefined });
        }
        if (r() < 0.5) level[exId] += (level[exId] < 0 ? 1 : 1) * step * (r() < 0.8 ? 1 : -1);
        blocks.push({ exId, rr: r() < 0.85 ? rr : null, sets, cut: r() < 0.05 ? true : undefined, light: r() < 0.04 ? true : undefined });
      }
      if (r() < 0.06 && blocks.length) blocks.push(JSON.parse(JSON.stringify(blocks[0])));
      sessions.push({ id: 's' + (id++), date, t: r() < 0.5 ? Date.UTC(2026, 5, 1) + day * 864e5 + Math.floor(r() * 12) * 36e5 : undefined, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', deload: deloadWk && r() < 0.6 ? true : undefined, light: r() < 0.03 ? true : undefined, ex: blocks });
    }
  }
  const bws = []; if (r() < 0.7) for (let d = 0; d < weeks * 7; d += 3 + Math.floor(r() * 10)) bws.push({ id: 'b' + d, date: new Date(Date.UTC(2026, 5, 1) + (start + d) * 864e5).toISOString().slice(0, 10), kg: (75 + r() * 15) });
  const gym = r() < 0.25 ? { u: kg ? 'kg' : 'lb', db: kg ? { lo: 2, hi: 40, st: 2 } : { lo: 5, hi: 100, st: 5 } } : undefined;
  const rirScale = pick([undefined, undefined, 'half', 'rpe']);
  const restWeeks = r() < 0.15 && sessions.length ? [new Date(Date.UTC(2026, 5, 1) + (start + 7 * Math.floor(r() * weeks)) * 864e5).toISOString().slice(0, 10)] : [];
  // Every lift in the history, and two never done (a first session, or a start from a close variation).
  const fresh = LIFTS.filter(l => !lifts.includes(l)).slice(0, 2);
  const plans = [...lifts, ...fresh].map(([exId, , , rr]) => ({ exId, plan: { sets: 2 + Math.floor(r() * 3), repMin: rr[0], repMax: rr[1], rir: Math.floor(r() * 3), rest: 90, inc: kg ? 2.5 : 5 * LB } }));
  return { kg, sessions, bws, gym, rirScale, restWeeks, plans, past: sessions.length > 2 ? sessions[Math.floor(sessions.length / 2)].date : null };
}
// Everything the engine says about one history, as one string.
const digest = h => {
  const L = window.__ironlog; const s = L.state;
  s.settings.onboarded = true; s.settings.unit = h.kg ? 'kg' : 'lb'; if (h.gym) s.settings.gym = h.gym; else delete s.settings.gym;
  if (h.rirScale) s.settings.rirScale = h.rirScale; else delete s.settings.rirScale; s.settings.restWeeks = h.restWeeks;
  s.sessions = JSON.parse(JSON.stringify(h.sessions)); s.bodyweights = h.bws; s.draft = null; s.injuries = [];
  L.state = L.normalize(s); L.invalidate();
  // prev (r44) is new and display-only, the sets the Last column shows (from the same session as Last); every other field of a suggestion must match.
  const noPrev = r => { if (!r || typeof r !== 'object') return r; const { prev, ...o } = r; return o; };
  const clean = v => JSON.stringify(v, (k, x) => typeof x === 'function' ? undefined : x instanceof Set ? [...x].sort() : x instanceof Map ? [...x.entries()] : (typeof x === 'number' && !isFinite(x)) ? String(x) : x);
  const out = { idx: clean(L.IDX()), sug: [] };
  for (const { exId, plan } of h.plans) for (const o of [{}, { light: true }, { deload: true }, h.past ? { before: h.past } : null]) if (o) { try { out.sug.push(clean(noPrev(L.suggest(exId, plan, o)))); } catch (e) { out.sug.push('ERR ' + e.message); } }
  try { out.coach = clean(L.coach()); } catch (e) { out.coach = 'ERR ' + e.message; }
  try { out.avg = clean(L.avgWeeks(4)); out.avg8 = clean(L.avgWeeks(8, true)); } catch (e) { out.avg = 'ERR ' + e.message; }
  try { out.reg = clean(L.regionBalance(L.regionSrc().src || {})); } catch (e) { out.reg = 'ERR ' + e.message; }
  try { out.streak = clean(L.weekStreak()); out.stalls = clean(L.stalledIds()); out.movers = clean(L.movers()); } catch (e) { out.streak = 'ERR ' + e.message; }
  return JSON.stringify(out);
};

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const A = await open(BASE, { browser, clock: '2026-10-11T12:00:00' });
  const B = await open(FILE, { browser, clock: '2026-10-11T12:00:00' });
  let same = 0, firstDiff = null, errs = 0; const t0 = Date.now();
  // Each case of the load engine, by the words it writes.
  const BR = { easy: /so that load was light/, past: /well past your/, below: /Drop to /, noStep: /That is (the heaviest|your bodyweight|a fixed)|on bodyweight alone/, top: /hit \d+: (add|take)/, bad: /Every set fell under/, first: /First time/ };
  const cov = { easy: 0, past: 0, below: 0, noStep: 0, top: 0, bad: 0, first: 0, prs: 0, stalled: 0, moving: 0, falling: 0, loadUp: 0, auto: 0, lightWk: 0, scores: 0, back: 0, build: 0, load: 0, reps: 0 };
  for (let i = 0; i < N; i++) {
    const h = history(1000 + i);
    const [a, b] = await Promise.all([A.page.evaluate(digest, h), B.page.evaluate(digest, h)]);
    if (/"ERR /.test(b)) errs++;
    // What the histories reached, so a pass means the paths were exercised, not skipped.
    try { const o = JSON.parse(b); const I = JSON.parse(o.idx); const st = Object.values(I.exStats || {});
      cov.prs += (I.prs || []).length > 0; cov.stalled += st.some(x => x.stalled); cov.moving += st.some(x => x.moving); cov.falling += st.some(x => x.falling); cov.loadUp += st.some(x => x.loadUp);
      cov.auto += Object.values(I.byEx || {}).some(a => a.some(x => x.auto)); cov.lightWk += Object.keys(I.lightWk || {}).length > 0; cov.scores += (I.scores || []).some(x => x.clear);
      const sg = o.sug.join(' '); cov.back += /Back after/.test(sg); cov.build += /building to/.test(sg); cov.load += /"kind\\":\\"load/.test(sg) || /add \d/.test(sg); cov.reps += /reps over/.test(sg); for (const [k, re] of Object.entries(BR)) cov[k] += re.test(sg);
    } catch (e) { /* counted as not reached */ }
    if (a === b) same++;
    else if (!firstDiff) { let k = 0; while (k < a.length && a[k] === b[k]) k++; firstDiff = { seed: 1000 + i, at: k, before: a.slice(Math.max(0, k - 200), k + 200), after: b.slice(Math.max(0, k - 200), k + 200) }; }
  }
  ok(same === N && !errs, `the engine and analytics are identical to ${BASE} on all ${N} random histories (${same} identical, ${Math.round((Date.now() - t0) / 1000)} s)`, firstDiff || { errs });
  console.log('coverage (histories reaching each)', JSON.stringify(cov));
  ok(Object.values(cov).every(n => n >= Math.min(5, N / 50)), 'the histories reach PRs, stalls, rising and falling lifts, heavier loads in range, untagged lighter sessions and weeks, muscle scores, coming back after a break, building reps, load steps and rep targets', cov);
  ok(!A.errors.length && !B.errors.length, 'no page errors in either build', [...A.errors, ...B.errors].slice(0, 5));
  await browser.close();

  // The parts in src/ join into index.html exactly (once the split exists).
  const join = path.join(__dirname, '..', 'scripts', 'join.js');
  if (fs.existsSync(join)) {
    const joined = execFileSync('node', [join, '--stdout'], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    ok(joined === html, 'the parts in src/ join into index.html byte for byte (edit src/, then npm run join)', joined.length + ' vs ' + html.length);
  }
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
