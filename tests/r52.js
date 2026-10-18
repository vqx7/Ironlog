// r52 (phase 3b, ARCHITECTURE.md): the engine and the analytics became
// functions of a model, and the app calls them through live.ts. This suite
// proves the app gets the same answers as r51 on far more than tests/r36.js
// reaches: r51 and this build side by side, the same 1,000 seeded histories
// in each, built to reach injuries, RIR off and RIR checks, half sets, Your
// training, a deload week, rest weeks, freestyle and free sessions, check-in
// answers, demo sessions, priorities and own targets, steps, heaviest loads,
// kinds and load meanings, deleted, archived and custom exercises, a gym with
// dumbbells (fine steps too), kettlebells, plates and a stack in either unit,
// a bar in Settings and on a lift, weekly and cycling routines, superset
// links, one lift on two days with different ranges, sessions on a routine's
// days, timed sessions and cardio, and every day of the week as today. Each
// of the 74 names the legacy script calls through live.ts is called with
// arguments covering each form it takes, and every answer is compared whole,
// with undefined, -0, NaN, Sets and Maps told apart. Identity too, which a
// comparison of values cannot see: EX(id) is the log's own record, prof() the
// log's own profile, IDX() the same object until invalidate. Then the
// scenarios a fresh comparison cannot reach: a page left open past midnight
// from Sunday into Monday, read before and after without a reload; each cache
// read stale on purpose, one at a time; and makeDemo's whole log, since the
// demo calls the engine while it builds it.
//
// r51's test hook does not reach 22 of the 74 names, so r51 is served with
// those added to its hook, at that one place, the rest of its page held to
// the baseline's text; this build's hook has the same 22 (tests/moved.js
// reads that back).
const { open, engine, settle } = require('./h');
const fs = require('fs'); const path = require('path'); const os = require('os');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); };
const ROOT = path.join(__dirname, '..');
const BASE = 'baselines/r51.html';
const N = +process.env.R52_N || 1000;
const HOOK22 = ['U', 'toD', 'fromD', 'loadLabel', 'exName', 'planCredit', 'gymOf', 'isDeloadWeek', 'freeMode', 'injuredSet', 'prLoad', 'statsUpTo', 'readiness', 'bwRef', 'weekRoutine', 'easierText', 'barKg', 'suggestCore', 'loadOf', 'bwLoad', 'hardCredit', 'rirHalfOn'];
// The 74 names the legacy script imports from live.ts, read from src/09-imports.js, so the list cannot drift from the code.
const LIVE74 = (() => { const t = fs.readFileSync(path.join(ROOT, 'src', '09-imports.js'), 'utf8'); const m = t.match(/import \{([^}]*)\} from '\.\/app\/live';/); return m ? m[1].split(',').map(x => x.trim()).filter(Boolean) : []; })();

// r51's page with the 22 names added at the end of its hook, the one change.
function baseWithHook() {
  const html = fs.readFileSync(path.join(ROOT, BASE), 'utf8');
  const at = 'exMusParts, musTrend };';
  const parts = html.split(at);
  if (parts.length !== 2) throw new Error(`${BASE}: the hook's end was not found once`);
  const out = parts[0] + `exMusParts, musTrend, ${HOOK22.join(', ')} };` + parts[1];
  const file = path.join(os.tmpdir(), `ironlog-r52-base-${process.pid}.html`);
  fs.writeFileSync(file, out);
  return { file, same: out.replace(`, ${HOOK22.join(', ')} };`, ' };') === html };
}

const { wide, digest } = require('./wide');

(async () => {
  ok(LIVE74.length === 74, `src/09-imports.js imports the 74 adapters this suite calls (${LIVE74.length})`);
  const base = baseWithHook();
  ok(base.same, `${BASE} is served as published, but for the 22 names added at the end of its test hook`);
  const browser = await engine.launch();
  const T0 = new Date('2026-10-11T12:00:00');
  const setup = async (ctx, page) => { await page.clock.setFixedTime(T0); };
  const A = await open(base.file, { browser, setup });
  const B = await open('index.html', { browser, setup });
  const hooks = await Promise.all([A, B].map(P => P.page.evaluate(names => names.filter(n => typeof window.__ironlog[n] !== 'function'), LIVE74)));
  ok(hooks[0].length === 0 && hooks[1].length === 0, 'both builds\' test hooks reach all 74 names', hooks);
  const LIB = await B.page.evaluate(() => window.__ironlog.libExercises());

  // The histories.
  let same = 0, firstDiff = null, errs = 0, size = 0, lines = 0; const t0 = Date.now(); const called = new Set();
  const cov = {};
  const hit = (k, c) => { cov[k] = (cov[k] || 0) + (c ? 1 : 0); };
  const BR = { easy: /so that load was light/, past: /well past your/, below: /Drop to /, noStep: /That is (the heaviest|your bodyweight|a fixed)|on bodyweight alone/, top: /hit \d+: (add|take)/, bad: /Every set fell under/, first: /First time/, back: /Back after/, build: /building to/, inj: /Injury flagged/, kin: /from your /, holds: /Beat \d+s /, light: /Lighter day/, deload: /Deload/ };
  for (let i = 0; i < N; i++) {
    const h = wide(52000 + i, LIB);
    const when = new Date(h.today + 'T12:00:00');
    await Promise.all([A.page.clock.setFixedTime(when), B.page.clock.setFixedTime(when)]);
    const spec = { raw: JSON.stringify(h.raw), today: h.today, ids: h.ids };
    const [a, b] = await Promise.all([A.page.evaluate(digest, spec), B.page.evaluate(digest, spec)]);
    if (a === b) same++;
    else if (!firstDiff) { const la = a.split('\n'), lb = b.split('\n'); let k = 0; while (k < la.length && la[k] === lb[k]) k++; firstDiff = { seed: 52000 + i, line: k, r51: (la[k] || '').slice(0, 600), r52: (lb[k] || '').slice(0, 600) }; }
    const calls = b.split('\n').map(l => l.split('\t')).filter(c => c.length === 3);
    if (calls.some(([n, , r]) => ['suggest', 'IDX', 'coach'].includes(n) && r.startsWith('"ERR'))) errs++;
    // What the histories reached, read from the normalized log and the answers, so a pass means each path ran.
    // (The digest writes undefined as ~undef; read back as absent here.)
    const st = JSON.parse(b.slice(6, b.indexOf('\n')), (k, v) => (v === '~undef' ? undefined : v));
    size += b.length; lines += b.split('\n').length;
    for (const [n] of calls) called.add(n.replace(/^~/, ''));
    const S = st.settings;
    const dow = new Date(h.today + 'T12:00:00').getDay(); hit('today weekday ' + dow, true);
    hit('injury', st.injuries.length > 0); hit('RIR off', S.rirMode === 'off'); hit('RIR corrected', S.rirMode === 'cal'); hit('RIR checks', st.sessions.some(x => x.ex.some(e => e.sets.some(y => y.cal)))); hit('half sets', S.rirHalf === true);
    hit('Your training', !!S.profile); hit('a focus', !!(S.profile && S.profile.focus)); hit('deload week', !!st.deloadWeek); hit('rest weeks', !!S.restWeeks); hit('freestyle', S.todayStart === 'free'); hit('free sessions', st.sessions.some(x => x.free));
    hit('check-ins', st.sessions.some(x => x.chk)); hit('demo sessions', st.sessions.some(x => x.demo)); hit('priorities', S.priorities.length > 0);
    hit('own targets', !!h.raw.settings.bands && Object.keys(h.raw.settings.bands).length > 0);
    const exs = st.exercises.filter(e => h.ids.includes(e.id));
    hit('a step on a lift', exs.some(e => e.inc != null)); hit('heaviest load', exs.some(e => e.maxLoad != null)); hit('a kind set', exs.some(e => e.kind)); hit('a load meaning set', exs.some(e => e.load)); hit('a lift\'s own bar', exs.some(e => e.barKg)); hit('a goal', exs.some(e => e.goal));
    hit('archived', exs.some(e => e.archived)); hit('custom', exs.some(e => e.custom)); hit('deleted lift in the log', st.sessions.some(x => x.ex.some(e => !st.exercises.some(q => q.id === e.exId))));
    hit('gym dumbbells', !!(S.gym && S.gym.db)); hit('gym fine steps', !!(S.gym && S.gym.db && S.gym.db.fine)); hit('gym kettlebells', !!(S.gym && S.gym.kb)); hit('gym plates', !!(S.gym && S.gym.plates)); hit('gym stack', !!(S.gym && S.gym.stack));
    hit('gym in kg', !!(S.gym && S.gym.u === 'kg')); hit('gym in lb', !!(S.gym && S.gym.u === 'lb')); hit('gym unit other than the app\'s', !!(S.gym && S.gym.u !== S.unit)); hit('bar in Settings', S.barKg != null);
    hit('weekly routine', st.routines.some(r => r.schedule === 'weekly')); hit('cycling routine', st.routines.some(r => r.schedule === 'cycle')); hit('superset links', st.routines.some(r => r.days.some(d => d.items.some(it => it.ss))));
    hit('one lift on two days, two ranges', st.routines.some(r => { const m = {}; for (const d of r.days) for (const it of d.items) (m[it.exId] = m[it.exId] || new Set()).add(it.repMin + '-' + it.repMax); return Object.values(m).some(x => x.size > 1); }));
    hit('sessions on routine days', st.sessions.some(x => x.dayId)); hit('timed sessions', st.sessions.filter(x => x.durMin).length >= 3); hit('cardio', st.cardio.length > 0); hit('kg', S.unit === 'kg'); hit('lb', S.unit === 'lb');
    for (const [k, re] of Object.entries(BR)) hit('engine: ' + k, calls.some(([n, , r]) => (n === 'suggest' || n === 'suggestCore') && re.test(r)));
    hit('PRs', /"prs":\[\{/.test(b)); hit('a stall', /"stalled":true/.test(b)); hit('a lighter week', /"lightWk":\{"/.test(b)); hit('a rack', calls.some(([n, , r]) => n === 'gymRack' && r.startsWith('[')));
  }
  ok(same === N, `the 74 give the same answers as r51 on all ${N} wide histories, every day of the week as today (${same} identical, ${Math.round((Date.now() - t0) / 1000)} s)`, firstDiff);
  ok(errs === 0, 'no history made suggest, IDX or the coach throw in this build', errs);
  ok(LIVE74.every(n => called.has(n)), 'every one of the 74 was called and its answers compared', LIVE74.filter(n => !called.has(n)));
  console.log(`note each history's answers: ${Math.round(lines / N)} calls, ${Math.round(size / N / 1000)} kB on average`);
  console.log('coverage (histories reaching each)', JSON.stringify(cov));
  const thin = Object.entries(cov).filter(([, n]) => n < Math.min(5, N / 50));
  ok(Object.keys(cov).length > 60 && thin.length === 0, 'the histories reach every feature and every case of the engine listed above', thin);

  // Identity, read from a history in this build alone: what the comparison above shows to agree, here held to what it must be.
  {
    const h = wide(52000, LIB); const spec = { raw: JSON.stringify(h.raw), today: h.today, ids: h.ids };
    await B.page.clock.setFixedTime(new Date(h.today + 'T12:00:00'));
    const d = await B.page.evaluate(digest, spec);
    const idn = JSON.parse(d.split('\n').find(l => l.startsWith('identity ')).slice(9));
    const fresh = JSON.parse(d.split('\n').find(l => l.startsWith('fresh ')).slice(6));
    ok(idn.filter(x => x[0] === 'EX is the record').every(x => x[2] === true) && idn.some(x => x[0] === 'EX is the record'), 'EX(id) is the log\'s own exercise record');
    ok(idn.find(x => x[0] === 'caches kept').slice(1).every(x => x === true), 'IDX, dateIndex and calStats are each the same object until invalidate, and activeRoutine is the log\'s own routine', idn.find(x => x[0] === 'caches kept'));
    ok(fresh.every(x => x === true), 'invalidate makes IDX, dateIndex and calStats build anew', fresh);
  }
  {
    const prof = await Promise.all([A, B].map(P => P.page.evaluate(() => { const L = window.__ironlog; const s = L.state; s.settings.profile = { goal: 'both', exp: 'mid' }; L.invalidate(); return [L.prof() === s.settings.profile, L.prof() === L.prof()]; })));
    ok(JSON.stringify(prof[0]) === JSON.stringify(prof[1]) && prof[1][0] === true, 'prof() is the log\'s own profile, in both builds', prof);
  }

  // Past midnight in a page left open: Sunday 23:59:30, then Monday 00:00:30,
  // no reload, read before and after invalidate. Caches built on Sunday are
  // read on Monday exactly as r51 read them.
  {
    const keys = ['isDeloadWeek', 'weekStats', 'weekStreak', 'coach', 'recentLighter', 'firstFullWeek', 'actualAvg4', 'paceRatios', 'pace', 'movers', 'stalledIds', 'readiness'];
    const read = ([ids, keys]) => { const L = window.__ironlog; const err = e => 'ERR ' + (e && e.name) + ': ' + String(e && e.message).replace(/\b([A-Za-z_$][\w$]*)In\(/g, '$1('); const o = {}; for (const k of keys) { try { o[k] = JSON.stringify(k === 'recentLighter' ? L[k](28) : L[k]()); } catch (e) { o[k] = err(e); } } for (const id of ids) { try { o['s ' + id] = JSON.stringify(L.suggest(id, L.planFor(id), {})); o['d ' + id] = JSON.stringify(L.daysOff(id)); } catch (e) { o['s ' + id] = err(e); } } o.idx = JSON.stringify(L.IDX().anchor); o.dix = JSON.stringify(Object.keys(L.dateIndex().weekN)); return JSON.stringify(o); };
    let agree = 0, differs = 0, firstOff = null, turned = 0; const M = 40;
    for (let i = 0; i < M; i++) {
      const h = wide(53000 + i, LIB);
      h.raw.deloadWeek = 'THIS_WEEK';
      const sun = new Date('2026-10-11T23:59:30'), mon = new Date('2026-10-12T00:00:30');
      const run = async P => {
        await P.page.clock.setFixedTime(sun);
        await P.page.evaluate(raw => { const L = window.__ironlog; const r = JSON.parse(raw); const d = new Date(); const g = (d.getDay() + 6) % 7; d.setDate(d.getDate() - g); r.deloadWeek = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; L.state = L.normalize(r); L.invalidate(); }, JSON.stringify(h.raw));
        const before = await P.page.evaluate(read, [h.ids, keys]);
        await P.page.clock.setFixedTime(mon);
        const stale = await P.page.evaluate(read, [h.ids, keys]);
        await P.page.evaluate(() => window.__ironlog.invalidate());
        const after = await P.page.evaluate(read, [h.ids, keys]);
        return [before, stale, after];
      };
      const [a, b] = [await run(A), await run(B)];
      if (JSON.stringify(a) === JSON.stringify(b)) agree++;
      else { differs++; if (!firstOff) { const j = a.findIndex((x, n) => x !== b[n]); const oa = JSON.parse(a[j]), ob = JSON.parse(b[j]); const key = Object.keys(oa).find(q => oa[q] !== ob[q]); firstOff = { seed: 53000 + i, read: ['before midnight', 'after, caches from Sunday', 'after invalidate'][j], key, r51: String(oa[key]).slice(0, 400), r52: String(ob[key]).slice(0, 400) }; } }
      if (b[0] !== b[2]) turned++;
    }
    ok(differs === 0, `a page left open from Sunday into Monday reads the same as r51 before midnight, after it with the caches built on Sunday, and after invalidate (${agree} of ${M} histories)`, firstOff);
    ok(turned > M / 2, `the week turns over at midnight in this build (${turned} of ${M} histories read differently on Monday)`);
  }

  // Each cache read stale on purpose, one at a time: the log changed and read
  // again before invalidate, then after it. r51 kept each cache until
  // invalidate; this build must keep each exactly as long.
  {
    const cases = {
      EXMAP: { build: 'L.EX(s.exercises[0].id)', change: "s.exercises.push({ ...s.exercises[0], id: 'zz-new', name: 'New lift' })", read: "[L.EX('zz-new').name, L.exName('zz-new')]" },
      _idx: { build: 'L.IDX()', change: 's.sessions.push({ ...s.sessions[s.sessions.length - 1], id: "zz-s", date: s.sessions[s.sessions.length - 1].date })', read: 'Object.keys(L.IDX().byEx).map(k => L.IDX().byEx[k].length)' },
      _dix: { build: 'L.dateIndex()', change: 's.sessions.push({ ...s.sessions[0], id: "zz-d", date: "2026-10-10" })', read: 'L.dateIndex().byDate["2026-10-10"] ? L.dateIndex().byDate["2026-10-10"].length : 0' },
      _cal: { build: 'L.calStats()', change: 's.sessions.forEach(x => x.ex.forEach(b => b.sets.forEach(y => { if (y.rir != null) y.cal = { at: y.r + y.rir + 1, pred: y.rir }; })))', read: 'L.calStats()' },
      _rirUse: { build: 'ids.map(id => L.rirUsual(id))', change: 's.sessions.forEach(x => x.ex.forEach(b => b.sets.forEach(y => { y.rir = 4; })))', read: 'ids.map(id => L.rirUsual(id))' },
      _bwRef: { build: 'L.bwRef()', change: 's.bodyweights.push({ id: "zz-b", date: "2026-10-10", kg: 123 })', read: '[L.bwRef(), ids.map(id => L.bwRefLoad(L.EX(id)))]' },
      _pace: { build: 'L.pace()', change: 's.sessions.forEach(x => { x.durMin = 200; })', read: '[L.pace(), L.paceRatios().length]' },
      _rack: { build: 'ids.map(id => { try { return L.rackStep(L.EX(id)); } catch (e) { return "ERR"; } })', change: 's.sessions.forEach(x => x.ex.forEach(b => b.sets.forEach(y => { y.w = y.w + 0.37; })))', read: 'ids.map(id => { try { return L.rackStep(L.EX(id)); } catch (e) { return "ERR"; } })' },
      weekRid: { build: 'L.weekRoutine(L.state.sessions.length ? L.state.sessions[0].date : "2026-10-05")', change: 's.routines.push({ ...s.routines[0], id: "zz-r", name: "Swapped" }); s.sessions.forEach(x => { x.routineId = "zz-r"; })', read: 'L.weekRoutine(L.state.sessions.length ? L.state.sessions[0].date : "2026-10-05").name' },
    };
    const run = async (P, h, c) => P.page.evaluate(([raw, ids, c]) => {
      const L = window.__ironlog; L.state = L.normalize(JSON.parse(raw)); L.invalidate(); const s = L.state;
      const ev = t => { try { return JSON.stringify(new Function('L', 's', 'ids', `return (${t});`)(L, s, ids)); } catch (e) { return 'ERR ' + (e && e.name) + ': ' + String(e && e.message).replace(/\b([A-Za-z_$][\w$]*)In\(/g, '$1('); } };
      const built = ev(c.build); ev(c.read); new Function('L', 's', 'ids', c.change)(L, s, ids);
      const stale = ev(c.read); L.invalidate(); const after = ev(c.read);
      return [built, stale, after];
    }, [JSON.stringify(h.raw), h.ids, c]);
    const bad = [], moved = [];
    for (const [name, c] of Object.entries(cases)) {
      let agree = 0, changed = 0;
      // Twelve logs with sessions to change (an empty one has nothing to go stale).
      const logs = []; for (let i = 0; logs.length < 12; i++) { const h = wide(54000 + i, LIB); if (h.raw.sessions.length >= 3) logs.push([54000 + i, h]); }
      for (const [seed, h] of logs) {
        await Promise.all([A, B].map(P => P.page.clock.setFixedTime(new Date(h.today + 'T12:00:00'))));
        const a = await run(A, h, c), b = await run(B, h, c);
        if (JSON.stringify(a) === JSON.stringify(b)) agree++; else if (bad.length < 3) bad.push({ cache: name, seed, r51: a.map(x => String(x).slice(0, 200)), r52: b.map(x => String(x).slice(0, 200)) });
        if (b[1] !== b[2]) changed++;
      }
      if (agree < 12 && !bad.some(x => x.cache === name)) bad.push({ cache: name });
      moved.push(`${name} ${changed}`);
    }
    ok(bad.length === 0, 'each cache read stale on purpose (EXMAP, _idx, _dix, _cal, _rirUse, _bwRef, _pace, and the _rack and weekRid marks) gives r51\'s answers before invalidate and after it', bad);
    console.log('note stale reads that changed after invalidate, per cache (of 12):', moved.join(', '));
  }

  // makeDemo calls the engine while it builds the demo log, so the log it
  // builds depends on when each cache fills: compared whole, its seed being
  // fixed, with the random ids set aside (each id read as the order it first
  // appears in).
  {
    const demo = P => P.page.evaluate(() => {
      const L = window.__ironlog; L.state = L.normalize(null); L.invalidate(); L.makeDemo(); L.invalidate();
      const ids = new Map(); const canon = v => (typeof v === 'string' && /^[a-z0-9]{8,}$/i.test(v) && /\d/.test(v) && /[a-z]/i.test(v) ? (ids.has(v) || ids.set(v, '#' + ids.size), ids.get(v)) : v);
      const walk = x => (Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, walk(v)])) : canon(x));
      return JSON.stringify({ state: walk(L.state), idx: walk(JSON.parse(JSON.stringify(L.IDX()))), coach: walk(L.coach()) });
    });
    await Promise.all([A, B].map(P => P.page.clock.setFixedTime(new Date('2026-10-14T12:00:00'))));
    const [a, b] = [await demo(A), await demo(B)];
    let k = 0; while (k < a.length && a[k] === b[k]) k++;
    ok(a === b && JSON.parse(b).state.sessions.length > 20, `makeDemo builds the same log as r51, and the engine reads it the same (${JSON.parse(b).state.sessions.length} sessions)`, a === b ? undefined : { at: k, r51: a.slice(Math.max(0, k - 150), k + 150), r52: b.slice(Math.max(0, k - 150), k + 150) });
  }

  ok(!A.errors.length && !B.errors.length, 'no page errors in either build', [...A.errors, ...B.errors].slice(0, 5));
  await settle(browser.close(), 'closing the browser');
  fs.rmSync(base.file, { force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
