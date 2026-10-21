// r43 (V's go, 2026-10-12): two changes, each checked against an independent
// working-out here, not the app's own numbers.
// 1. A phone on an older build keeps the fields it does not know (item 278).
//    r42 rebuilt every record from the fields it knew, so a field a newer build
//    added (a lift goal on r38, say) was dropped by any older phone that loaded
//    or synced the log. Now an unknown field rides along untouched, only plain
//    JSON, under a safe name, within a size cap, and a record with nothing
//    unknown is byte for byte what r42 made of it.
// 2. Estimated minutes follow your own sessions (item 279): the median of
//    actual over model for up to 8 timed sessions in 84 days, from 3 on.
const { open } = require('./h'); const { engine } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } else console.log('ok  ', m); };
const CLOCK = '2026-10-13T10:00:00';
const store = new Map();
const cloudSetup = async (ctx, page) => {
  await page.exposeFunction('__dbGet', p => store.has(p) ? store.get(p) : null);
  await page.exposeFunction('__dbSet', (p, v) => { store.set(p, v); return true; });
  await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
  await page.addInitScript(() => {
    window.claude = { use: async k => {
      if (k === 'user') return { id: async () => 'u1' };
      if (k === 'db') return { doc: p => ({ get: async () => { const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); return true; } }),
        collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
      return null; } };
  });
};
const wait = ms => new Promise(r => setTimeout(r, ms));
const min5 = m => m >= 10 ? Math.round(m / 5) * 5 : Math.max(1, Math.round(m));
const median = a => { const s = [...a].sort((x, y) => x - y); const k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };

// A raw save with one field no build knows on every kind of record, made in the page.
const RAW = () => {
  const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo();
  const s = JSON.parse(JSON.stringify(L.state)); const F = { v: 1, list: [1, 'a'], o: { k: true } };
  const R = s.routines[0]; const day = R.days.find(d => d.items.length);
  s.exercises.find(e => e.id === 'bench').fut = F; R.fut = F; day.fut = F; day.items[0].fut = F;
  const ss = s.sessions[s.sessions.length - 1]; ss.fut = F; ss.ex[0].fut = F; ss.ex[0].sets[0].fut = F;
  s.bodyweights.push({ id: 'bw1', date: '2026-10-10', kg: 80, fut: F });
  s.measurements.push({ id: 'm1', date: '2026-10-10', arm: 38, fut: F });
  s.cardio.push({ id: 'c1', date: '2026-10-10', kind: 'other', min: 20, fut: F });
  s.injuries.push({ id: 'j1', m: 'triceps', note: '', date: '2026-10-01', fut: F });
  s.draft = { id: 'd1', date: '2026-10-13', dayName: 'Session', ex: [{ exId: 'bench', plan: {}, fut: F, sets: [{ w: 50, r: 5, fut: F }] }], cardio: [] };
  return { raw: JSON.stringify(s), sid: ss.id, rid: R.id, did: day.id };
};
const PATHS = (s, k) => {
  const R = s.routines.find(r => r.id === k.rid); const day = R && R.days.find(d => d.id === k.did); const ss = s.sessions.find(x => x.id === k.sid);
  return { exercise: s.exercises.find(e => e.id === 'bench'), routine: R, day, item: day && day.items[0], session: ss, block: ss && ss.ex[0], set: ss && ss.ex[0].sets[0],
    bodyweight: s.bodyweights.find(b => b.id === 'bw1'), measurement: s.measurements.find(b => b.id === 'm1'), cardio: s.cardio.find(b => b.id === 'c1'),
    injury: s.injuries.find(b => b.id === 'j1'), draftBlock: s.draft && s.draft.ex[0], draftSet: s.draft && s.draft.ex[0].sets[0] };
};

(async () => {
  const browser = await engine.launch();

  // ---------- 1. Unknown fields kept ----------
  const P = await open('index.html', { browser, clock: CLOCK });
  const ev = (f, a) => P.page.evaluate(f, a);
  const k = await ev(RAW);
  // The page normalizes; the fields are looked up here, outside the app.
  const [n1, n2] = await ev(raw => { const L = window.__ironlog; const a = L.normalize(JSON.parse(raw)); const b = L.normalize(JSON.parse(JSON.stringify(a))); return [JSON.stringify(a), JSON.stringify(b)]; }, k.raw);
  const p1 = PATHS(JSON.parse(n1), k), p2 = PATHS(JSON.parse(n2), k); const got = {};
  for (const key in p1) got[key] = [p1[key] ? JSON.stringify(p1[key].fut) : 'missing', p2[key] ? JSON.stringify(p2[key].fut) : 'missing'];
  const want = JSON.stringify({ v: 1, list: [1, 'a'], o: { k: true } });
  const NAME = { exercise: 'an exercise', routine: 'a routine', day: 'a routine day', item: 'a routine day\'s exercise', session: 'a saved session', block: 'a saved session\'s exercise', set: 'a saved set', bodyweight: 'a weigh-in', measurement: 'a tape entry', cardio: 'a cardio entry', injury: 'an injury', draftBlock: 'an exercise in the session in progress', draftSet: 'a set in the session in progress' };
  for (const [key, [a, b]] of Object.entries(got)) ok(a === want && b === want, `an unknown field on ${NAME[key]} is kept, and kept through a second load`, [a, b]);

  // The same raw save through r42, as live today: the field is lost (the problem was real).
  const O = await open('baselines/r42.html', { browser, clock: CLOCK });
  const oldN = PATHS(JSON.parse(await O.page.evaluate(raw => JSON.stringify(window.__ironlog.normalize(JSON.parse(raw))), k.raw)), k);
  const old = { ex: oldN.exercise && oldN.exercise.fut, set: oldN.set && oldN.set.fut };
  ok(old.ex === undefined && old.set === undefined, 'r42 drops the same fields (what this fixes)', old);

  // Without unknown fields the result is what r42 made of the same save, so nothing re-syncs.
  const plain = await ev(() => { const L = window.__ironlog; L.makeDemo(); const s = JSON.parse(JSON.stringify(L.state)); s.cardio.push({ id: 'c2', date: '2026-10-11', kind: 'run', min: 30, dist: 5 });
    s.draft = { id: 'd2', date: '2026-10-13', dayName: 'Session', ex: [{ exId: 'bench', plan: { sets: 3, repMin: 6, repMax: 10, jump: 4 }, sets: [{ w: 60, r: 8, done: true }] }], cardio: [] }; return JSON.stringify(s); });
  // Sorted keys, undefined left out: the same reading the sync's fingerprints use, written here.
  const canon = v => v === undefined ? 'null' : v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : '{' + Object.keys(v).filter(x => v[x] !== undefined).sort().map(x => JSON.stringify(x) + ':' + canon(v[x])).join(',') + '}';
  const norm = Pg => Pg.evaluate(raw => JSON.stringify(window.__ironlog.normalize(JSON.parse(raw))), plain);
  const canonNew = canon(JSON.parse(await norm(P.page))), canonOld = canon(JSON.parse(await norm(O.page)));
  ok(canonNew === canonOld && canonNew.length > 1000, 'a save with nothing unknown comes out exactly as r42 made it', [canonNew.length, canonOld.length]);
  await O.ctx.close();

  // A field this build knows but finds invalid is dropped, never kept as if it were new.
  const inv = await ev(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); const R = s.routines[0]; const day = R.days.find(d => d.items.length);
    day.items[0].jump = 'abc'; s.cardio.push({ id: 'c3', date: '2026-10-11', kind: 'run', min: 30, dist: -5 }); s.measurements.push({ id: 'm3', date: '2026-10-11', arm: -2, waist: 80 });
    s.exercises.find(e => e.id === 'bench').goal = { w: 'x', r: 5 };
    const n = L.normalize(s); const nd = n.routines[0].days.find(d => d.id === day.id);
    return { jump: 'jump' in nd.items[0], dist: 'dist' in n.cardio.find(c => c.id === 'c3'), arm: 'arm' in n.measurements.find(m => m.id === 'm3'), waist: n.measurements.find(m => m.id === 'm3').waist, goal: n.exercises.find(e => e.id === 'bench').goal }; });
  ok(!inv.jump && !inv.dist && !inv.arm && inv.waist === 80 && inv.goal === undefined, 'an invalid load jump, distance, tape number or goal is dropped, not kept as unknown', inv);

  // Hostile input: no prototype reached, no odd names, no unbounded growth, nothing run on screen.
  const hos = await ev(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state));
    const raw = JSON.stringify(s).replace('"id":"bench",', '"id":"bench","__proto__":{"polluted":1},"constructor":{"x":1},"toString":"x","a\\"b":1,"<img>":1,"_x":1,"big":"' + 'z'.repeat(3000) + '","one":"' + 'y'.repeat(1500) + '","two":"' + 'w'.repeat(1500) + '","pwn":"<img src=x onerror=window.__pwn=1>",');
    const n = L.normalize(JSON.parse(raw)); const e = n.exercises.find(x => x.id === 'bench');
    L.state = n; L.invalidate(); const seen = [];
    for (const t of ['today', 'program', 'dash', 'history', 'settings']) { L.ui.tab = t; L.render(); seen.push(document.getElementById('view').innerHTML.includes('onerror')); }
    return { polluted: ({}).polluted, proto: Object.getPrototypeOf(e) === Object.prototype, keys: Object.keys(e).filter(x => !['id', 'name', 'primary', 'secondary', 'equip', 'bw', 'rare', 'perSide', 'note', 'custom', 'archived', 'inc', 'plates', 'load', 'timed', 'kind', 'assist', 'bwf', 'maxLoad', 'barKg', 'goal'].includes(x)), size: JSON.stringify(e).length, shown: seen.some(Boolean) }; });
  await wait(300);
  const pwn = await ev(() => window.__pwn);
  ok(hos.polluted === undefined && hos.proto, 'a "__proto__" field reaches no prototype', hos);
  ok(hos.keys.join() === 'one,pwn', 'only plain names are kept, within the size cap (a 3,000-character field and the field past the cap left out)', hos.keys);
  ok(!hos.shown && pwn === undefined, 'a kept field is never put on screen or run', [hos.shown, pwn]);
  // Many small fields (the r43 review: 2,000 keys of 39-letter names passed a cap that counted values only).
  const many = await ev(() => { const L = window.__ironlog; const b = { id: 'bwX', date: '2026-10-01', kg: 80 }; for (let i = 0; i < 2000; i++) b['k' + String(i).padStart(38, '0')] = 0;
    const n = L.normalize({ ...JSON.parse(JSON.stringify(L.state)), bodyweights: [b] }); const o = n.bodyweights.find(x => x.id === 'bwX'); return { extra: Object.keys(o).length - 4, len: JSON.stringify(o).length, max: L.EXTRA_MAX }; });
  ok(many.extra === 20 && many.len < many.max + 200, 'at most 20 unknown fields and 2,000 characters, names included, per record', many);
  await P.ctx.close();

  // ---------- 2. Through the cloud: a newer phone's fields survive this build's edits ----------
  store.clear();
  const A = await open('index.html', { browser, clock: CLOCK, setup: cloudSetup });
  const B = await open('index.html', { browser, clock: CLOCK, setup: cloudSetup });
  await wait(800);
  const sid = await A.page.evaluate(() => { const L = window.__ironlog; const R = L.state.routines[0]; L.state.settings.onboarded = true;
    const e = L.state.exercises.find(x => x.id === 'bench'); e.fut = { from: 'r44' };
    L.state.sessions.push({ id: 'sF', date: '2026-10-12', dayIdx: 0, dayId: R.days[0].id, dayName: 'Chest', routineId: R.id, notes: '', fut: 'session', ex: [{ exId: 'bench', rr: [6, 10], fut: 'block', sets: [{ w: 60, r: 8, rir: 2, fut: 'set' }, { w: 60, r: 8, rir: 2 }] }] });
    L.invalidate(); return 'sF'; });
  await A.page.evaluate(() => window.__ironlog.flush()); await wait(300);
  await B.page.evaluate(() => window.__ironlog.sync()); await wait(500);
  const onB = await B.page.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.id === 'sF'); return { ex: L.state.exercises.find(x => x.id === 'bench').fut, s: s && s.fut, b: s && s.ex[0].fut, set: s && s.ex[0].sets[0].fut }; });
  ok(onB.ex && onB.ex.from === 'r44' && onB.s === 'session' && onB.b === 'block' && onB.set === 'set', 'a second phone receives every field', onB);
  // On B: rename the exercise in the editor, and edit the session from History (a set changed).
  await B.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ACT.exEdit({ dataset: { ex: 'bench' } }); L.ui.modal.e.note = 'flat bench'; L.ACT.exSave(); });
  await B.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id: 'sF' } }); });
  await wait(100);
  await B.page.evaluate(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[0].sets[1].r = 9; d._rampAsked = true; L.ACT.finishNow(); });
  await wait(300);
  await B.page.evaluate(() => window.__ironlog.flush()); await wait(300);
  await A.page.evaluate(() => window.__ironlog.sync()); await wait(500);
  const onA = await A.page.evaluate(() => { const L = window.__ironlog; const e = L.state.exercises.find(x => x.id === 'bench'); const s = L.state.sessions.find(x => x.id === 'sF'); return { ex: e.fut, note: e.note, s: s && s.fut, b: s && s.ex[0].fut, r: s && s.ex[0].sets[1].r }; });
  ok(onA.note === 'flat bench' && onA.ex && onA.ex.from === 'r44', 'an exercise edited on this build keeps the newer field, back on the first phone', onA);
  ok(onA.r === 9 && onA.s === 'session' && onA.b === 'block', 'a session edited from History keeps its own and its exercise\'s newer fields (its sets are what the edit rewrites)', onA);
  ok(!A.errors.length && !B.errors.length, 'no console errors on either phone', [...A.errors, ...B.errors]);
  await A.ctx.close(); await B.ctx.close();

  // A simulated next build that adds a field in the middle of the exercise record (the r43 review:
  // this build put it last, the next one put it back, and each pull rewrote the core document).
  {
    const fs = require('fs'), os = require('os'), path = require('path');
    // Built as a real next build is (r49): the source changed, then bundled by scripts/join.js.
    // The exercise record is read in src/app/normalize.ts (r56), where Prettier lays it out one field a line.
    const part = 'app/normalize.ts', partSrc = fs.readFileSync(path.join(__dirname, '..', 'src', part), 'utf8');
    const anchor = partSrc.match(/id: fixId\(e\.id\),\n( +)name: e\.name,\n/);
    ok(anchor && partSrc.split(anchor[0]).length === 2, 'the simulated next build finds the exercise record to change', part);
    const next = path.join(os.tmpdir(), 'ironlog-next-r43test.html');
    const nextHtml = require('../scripts/join').build({ override: { [part]: partSrc.replace(anchor[0], anchor[0] + anchor[1] + "zz: typeof e.zz === 'string' ? e.zz : undefined,\n") } }).html;
    ok(nextHtml.includes('zz: typeof e.zz') && nextHtml !== fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), 'and the next build carries the new field');
    fs.writeFileSync(next, nextHtml);
    store.clear(); const writes = {}; const set0 = store.set.bind(store); store.set = (k, v) => { const id = k.split('/').pop(); writes[id] = (writes[id] || 0) + 1; return set0(k, v); };
    const X = await open('index.html', { browser, clock: CLOCK, setup: cloudSetup });
    const N = await open(next, { browser, clock: CLOCK, setup: cloudSetup });
    await wait(800);
    await N.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.exercises.find(x => x.id === 'bench').zz = 'hello'; L.invalidate(); });
    await N.page.evaluate(() => window.__ironlog.flush()); await wait(400);
    await X.page.evaluate(() => window.__ironlog.sync()); await wait(600);
    const w0 = writes.core || 0; const seen = [];
    for (let i = 0; i < 4; i++) { await N.page.evaluate(() => window.__ironlog.sync()); await wait(500); await X.page.evaluate(() => window.__ironlog.sync()); await wait(500); seen.push(writes.core || 0); }
    const zz = await X.page.evaluate(() => window.__ironlog.state.exercises.find(x => x.id === 'bench').zz);
    ok(seen[3] === seen[0] && seen[0] - w0 <= 1 && zz === 'hello', 'with a next build that orders the new field differently, the core document settles (no rewrite on every pull) and the field stays', { w0, seen, zz });
    ok(!X.errors.length && !N.errors.length, 'no console errors with the next build', [...X.errors, ...N.errors]);
    await X.ctx.close(); await N.ctx.close(); store.set = set0; fs.unlinkSync(next);
  }

  // ---------- 3. The app itself never writes a field it does not know ----------
  const U = await open('index.html', { browser, clock: CLOCK, touch: true });
  const uev = (f, a) => U.page.evaluate(f, a);
  await uev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.autoDone = true; L.makeDemo(); for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of L.state[k]) delete x.demo; L.invalidate(); L.ui.tab = 'today'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
  await U.page.click('.hero [data-act="startSession"]'); await wait(150);
  for (let s = 0; s < 3; s++) { await U.page.click(`[data-act="sDone"][data-b="0"][data-s="${s}"]`); await wait(120); }
  await U.page.fill('[data-f="r"][data-b="1"][data-s="0"]', '12'); await U.page.click('.ph'); await wait(150);
  const strays = async label => { const r = await uev(() => { const L = window.__ironlog; L.keepExtra.n = 0; L.normalize(JSON.parse(JSON.stringify(L.state))); return L.keepExtra.n; }); ok(r === 0, `no field the app does not know on any record: ${label}`, r); };
  await strays('a session in progress, with sets ticked, typed, and adjusted');
  await uev(() => { const L = window.__ironlog; L.state.draft._rampAsked = true; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
  await strays('after Finish');
  const last = await uev(() => { const L = window.__ironlog; return L.sortedSessions().slice(-1)[0].id; });
  await uev(id => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id } }); }, last); await wait(100);
  await strays('editing a saved session');
  await uev(() => { const L = window.__ironlog; L.state.draft._rampAsked = true; L.ACT.finishNow(); }); await wait(200);
  await uev(() => { const L = window.__ironlog; L.ACT.exEdit({ dataset: { ex: 'bench' } }); L.ui.modal.e.incRaw = '2.5'; L.ui.modal.e.barRaw = '35'; L.ACT.exSave(); }); await wait(100);
  await strays('after editing a saved session and an exercise');
  ok(!U.errors.length, 'no console errors', U.errors);
  await U.ctx.close();

  // ---------- 4. Minutes from your own sessions ----------
  for (const [w, theme] of [[390, 'dark'], [320, 'light']]) {
    const T = ` (${theme}, ${w} px)`;
    const Q = await open('index.html', { browser, clock: CLOCK, w, touch: true });
    const q = (f, a) => Q.page.evaluate(f, a);
    // Timed sessions of the routine's first day at chosen ratios; the model for each is read back
    // and the expected pace worked out here from the durations stored.
    const setup = async (list) => q(([list, theme]) => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.theme = theme; s.sessions = []; s.draft = null;
      const R = s.routines[0]; const di = R.days.findIndex(d => d.items.length); const day = R.days[di]; const out = [];
      list.forEach(([date, ratio, opt], i) => {
        const ss = { id: 'p' + i, date, dayIdx: di, dayId: day.id, dayName: day.name, routineId: R.id, notes: '', durMin: null, demo: !!(opt && opt.demo),
          ex: day.items.map(it => ({ exId: it.exId, rr: [it.repMin, it.repMax], sets: Array.from({ length: it.sets }, () => ({ w: 40, r: it.repMin, rir: 2 })) })) };
        s.sessions.push(ss); L.invalidate(); const m = L.sessModelMin(ss);
        ss.durMin = ratio == null ? null : Math.round(m * ratio); out.push({ date, m, dur: ss.durMin, demo: !!(opt && opt.demo) });
      });
      L.invalidate(); L.ui.tab = 'today'; L.render(); return { out, raw: L.dayMinutes(day, false, true), di };
    }, [list, theme]);
    const heroMin = () => q(() => { const t = document.querySelector('.hero .muted').textContent; const m = t.match(/~(\d+) min/); return m ? +m[1] : null; });
    const paceNow = () => q(() => window.__ironlog.pace());

    let r = await setup([]);
    ok(await paceNow() === 1 && await heroMin() === min5(r.raw), 'no timed sessions: the time model as before' + T, [await paceNow(), await heroMin(), r.raw]);
    r = await setup([['2026-10-01', 1.5], ['2026-10-05', 1.5]]);
    ok(await paceNow() === 1 && await heroMin() === min5(r.raw), 'two timed sessions: still the model' + T, [await paceNow(), await heroMin()]);
    r = await setup([['2026-09-20', 1.2], ['2026-09-27', 1.4], ['2026-10-05', 1.5], ['2026-10-08', 5]]);
    const exp = median(r.out.map(x => x.dur / x.m).filter(x => x >= 1 / 3 && x <= 3));
    const p = await paceNow();
    ok(Math.abs(p - exp) < 1e-9 && Math.abs(p - 1.4) < 0.05, 'three timed sessions: the median of actual over model, a clock left running (5 times) left out' + T, [p, exp]);
    const hm = await heroMin(); const raw = await q(di => { const L = window.__ironlog; const d = L.state.routines[0].days[di]; return L.dayMinutes(d, false, true); }, r.di);
    ok(Math.abs(hm - min5(raw * p)) <= 5 && hm > min5(raw), 'Today\'s ~N min follows that pace' + T, [hm, raw, p]);
    // Old, demo and untimed sessions never count.
    r = await setup([['2026-06-01', 1.5], ['2026-06-08', 1.5], ['2026-06-15', 1.5], ['2026-10-01', 1.5, { demo: true }], ['2026-10-02', 1.5, { demo: true }], ['2026-10-03', 1.5, { demo: true }], ['2026-10-04', null], ['2026-10-05', 1.3]]);
    ok(await paceNow() === 1, 'sessions older than 84 days, demo sessions and untimed ones do not count' + T, await paceNow());
    // Only the newest 8.
    r = await setup([...Array.from({ length: 8 }, (_, i) => [`2026-09-${String(10 + i * 2).padStart(2, '0')}`, 2]), ...Array.from({ length: 8 }, (_, i) => [`2026-10-${String(1 + i).padStart(2, '0')}`, 1.25])]);
    ok(Math.abs(await paceNow() - median(r.out.slice(-8).map(x => x.dur / x.m))) < 1e-9, 'the newest 8 timed sessions set the pace' + T, await paceNow());
    // Supersets in the plan: partners rest once in the model the pace is read against, as in every
    // estimate (the r43 review: a lifter who supersets read 30% fast). Sessions that took exactly the
    // day's own estimate give a pace of 1.
    const ssr = await q(() => { const L = window.__ironlog; const s = L.state; s.sessions = []; const R = s.routines[0]; const di = R.days.findIndex(d => d.items.length >= 4); const day = R.days[di];
      day.items.forEach((it, i) => { it.ss = i % 2 === 0 && day.items[i + 1] ? 'S' + i : (i % 2 ? 'S' + (i - 1) : null); }); L.invalidate();
      const est = L.dayMinutes(day, false, true);
      ['2026-10-01', '2026-10-05', '2026-10-08'].forEach((date, i) => s.sessions.push({ id: 'q' + i, date, dayIdx: di, dayId: day.id, dayName: day.name, routineId: R.id, notes: '', durMin: est,
        ex: day.items.map(it => ({ exId: it.exId, rr: [it.repMin, it.repMax], sets: Array.from({ length: it.sets }, () => ({ w: 40, r: it.repMin, rir: 2 })) })) }));
      L.invalidate(); const out = { est, model: L.sessModelMin(s.sessions[0]), pace: L.pace() }; day.items.forEach(it => { it.ss = null; }); L.invalidate(); return out; });
    ok(ssr.model === ssr.est && Math.abs(ssr.pace - 1) < 0.03, 'supersets: a session as long as its estimate reads as pace 1' + T, ssr);
    // Cardio before or after lifting is in the session's time but not in the model.
    const cr = await setup([['2026-10-01', 1], ['2026-10-05', 1], ['2026-10-08', 1]]);
    const pc = await q(list => { const L = window.__ironlog; const s = L.state; s.cardio = []; list.forEach((x, i) => { const ss = s.sessions[i]; ss.durMin += 15; s.cardio.push({ id: 'cc' + i, date: x.date, kind: 'bike', min: 15, hr: null, when: 'pre', note: '', demo: false }); }); L.invalidate(); const p = L.pace(); s.cardio = []; L.invalidate(); return p; }, cr.out);
    ok(Math.abs(pc - median(cr.out.map(x => x.dur / x.m))) < 1e-9, 'cardio done before lifting is taken off the session\'s time' + T, [pc, cr.out]);

    // In a session: minutes left and Short on time use the same pace.
    r = await setup([['2026-09-27', 1.5], ['2026-10-01', 1.5], ['2026-10-05', 1.5]]);
    const p15 = await paceNow();
    await q(() => localStorage.setItem('ironlog.v1.tipWake', '1'));
    await Q.page.click('.hero [data-act="startSession"]'); await wait(150);
    const sess = await q(() => { const L = window.__ironlog; const d = L.state.draft; const R = L.state.routines[0]; const day = R.days.find(x => x.id === d.dayId);
      const rawItems = { items: d.ex.map(b => ({ ...b.plan, exId: b.exId, sets: b.sets.filter(x => !x.warm).length, rest: +b.plan.rest || 0 })) };
      return { left: L.remainMin(d), plan: L.draftPlanMin(d), raw: L.dayMinutes(rawItems, false, true), meta: document.querySelector('.ph .meta').textContent }; });
    ok(Math.abs(sess.plan - sess.raw * p15) <= 1 && Math.abs(sess.left - sess.raw * p15) <= 1, 'the session\'s planned minutes and minutes left follow the pace' + T, [sess, p15]);
    ok(new RegExp(`~${min5(sess.left)} min left`).test(sess.meta), 'the session header says it as ~N min left' + T, sess.meta);
    const sh = await q(([raw]) => { const L = window.__ironlog; const d = L.state.draft; const budget = Math.round(raw); const pl = L.shortPlan(d, budget); return { budget, changes: pl.changes.length, est: pl.est, over: pl.over }; }, [sess.raw]);
    ok(sh.changes > 0 && sh.est <= sh.budget, 'Short on time trims to fit your pace: a budget the model alone would fit now takes sets off' + T, sh);
    await q(() => { const L = window.__ironlog; L.ACT.discardNow ? L.ACT.discardNow() : (L.state.draft = null); L.invalidate(); });

    // Stats: the average session, and "planned" only while estimates are the model's own.
    const tile = async () => q(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); const k = [...document.querySelectorAll('.kpi')].find(x => /Average session/.test(x.textContent)); return k ? k.textContent : null; });
    let t1 = await tile();
    ok(t1 && !/planned/.test(t1), 'Stats: with your pace in use, no "planned" beside your average (it would be your average again)' + T, t1);
    await setup([['2026-10-01', 4], ['2026-10-05', 4], ['2026-10-08', 4]]);
    t1 = await tile();
    ok(await paceNow() === 1 && t1 && /planned ~\d+ min/.test(t1), 'Stats: with the model in use, "planned ~N min" stays' + T, t1);
    // The Guide says it.
    const g = await q(() => { const L = window.__ironlog; L.ACT.guideOpen(); const s = document.querySelector('#modal'); s.querySelectorAll('details').forEach(d => d.open = true); const t = s.innerText; return { t: /Minutes[\s\S]{0,40}worked out from your sets, reps, and rest/.test(t) && /newest 8/.test(t), over: document.documentElement.scrollWidth > window.innerWidth }; });
    ok(g.t && !g.over, 'the Guide explains the minutes, with no overflow' + T, g);
    ok(!Q.errors.length, 'no console errors' + T, Q.errors);
    await Q.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); console.log('FAIL crashed'); process.exit(1); });
