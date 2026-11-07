// 2.31 (build r77; PENDING.md's tracker, R77-1), each section written as what a lifter expects and run first on 2.30
// (`node tests/r77.js baselines/r76.html`), where each section fails unless it says it guards:
//   1  R77-1 (the review of 2.31): with Your gym's plates set and a heaviest available that falls between the loads
//      the plates make, the step up at the top of the range never passes it. 2.30 asked 155 lb with 150 lb the most
//      there is (from 145, 185, 195, 205, 215 and 245 lb); held to the heaviest available, the load holds. Guards:
//      with a heaviest available a whole plate step above, the step is taken; with none set, the step is taken.
//   2  R77-2: held at the heaviest available because the plates make nothing between it and last time, the target
//      says so in plain words (more reps at that load, the heaviest available), never "add 0 kg, which is the heaviest
//      available" (2.30). The heaviest available reads as the heaviest load the plates make under the one set.
// R77_ONLY=1 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R77_ONLY ? process.env.R77_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));

(async () => {
  if (run(1)) {
    const D = await open(FILE, { clock: '2026-10-15T10:00:00' });
    const got = await D.page.evaluate(() => {
      const L = window.__ironlog, S = L.state, LB = 0.45359237, PLAN = { sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 150 };
      S.settings.onboarded = true;
      const out = [];
      const cases = [['lb', 145, 150], ['lb', 145, 152.5], ['lb', 205, 210], ['lb', 245, 250], ['kg', 100, 102], ['lb', 145, 155], ['kg', 100, 105], ['lb', 145, null], ['kg', 100, null]];
      cases.forEach(([u, top, cap], n) => {
        S.settings.unit = u; S.settings.gym = u === 'kg' ? { u, plates: [25, 20, 15, 10, 5, 2.5] } : { u, plates: [45, 35, 25, 10, 5] };
        const k = u === 'kg' ? 1 : LB;
        S.draft = null;
        S.sessions = ['2026-10-01', '2026-10-08'].map((date, i) => ({ id: `p${n}_${i}`, date, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [10, 10, 10].map(r => ({ w: top * k, r, rir: 2, warm: false, drop: false })) }] }));
        const e = S.exercises.find(x => x.id === 'bench');
        if (cap == null) delete e.maxLoad; else e.maxLoad = cap * k;
        L.state = L.normalize(S); L.invalidate();
        const g = L.suggest('bench', PLAN, {});
        out.push({ u, top, cap, next: Math.round((g.w / k) * 100) / 100 });
      });
      delete L.state.exercises.find(x => x.id === 'bench').maxLoad;
      return out;
    });
    for (const c of got) {
      const step = c.u === 'kg' ? 5 : 10;
      if (c.cap != null && c.cap < c.top + step) ok(c.next <= c.cap + 1e-6, `1. ${c.top} ${c.u} at the top of the range with ${c.cap} ${c.u} the heaviest available: never past it (got ${c.next})`, c);
      else ok(Math.abs(c.next - (c.top + step)) < 1e-6, `1. (a guard) ${c.top} ${c.u} with ${c.cap == null ? 'no heaviest set' : c.cap + ' ' + c.u + ' the heaviest available'}: the step to ${c.top + step} is taken`, c);
    }
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.browser.close();
  }
  if (run(2)) {
    const D = await open(FILE, { clock: '2026-10-15T10:00:00' });
    const got = await D.page.evaluate(() => {
      const L = window.__ironlog, S = L.state, LB = 0.45359237, PLAN = { sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 150 };
      S.settings.onboarded = true;
      return [['kg', 100, 102], ['lb', 225, 230]].map(([u, top, cap], n) => {
        S.settings.unit = u; S.settings.gym = u === 'kg' ? { u, plates: [25, 20, 15, 10, 5, 2.5] } : { u, plates: [45, 35, 25, 10, 5] };
        const k = u === 'kg' ? 1 : LB;
        S.draft = null;
        S.sessions = ['2026-10-01', '2026-10-08'].map((date, i) => ({ id: `q${n}_${i}`, date, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [10, 10, 10].map(r => ({ w: top * k, r, rir: 2, warm: false, drop: false })) }] }));
        S.exercises.find(x => x.id === 'bench').maxLoad = cap * k;
        L.state = L.normalize(S); L.invalidate();
        const g = L.suggest('bench', PLAN, {});
        const ex = L.state.exercises.find(x => x.id === 'bench');
        const out = { u, top, cap, next: Math.round((g.w / k) * 100) / 100, text: g.text, target: g.target, capRead: Math.round((L.capOf(ex, PLAN, top * k) / k) * 100) / 100 };
        delete ex.maxLoad;
        return out;
      });
    });
    for (const c of got) {
      ok(c.next === c.top && !/add 0 /.test(c.text), `2. ${c.top} ${c.u} with ${c.cap} the heaviest available: the load holds and no "add 0 ${c.u}"`, c);
      ok(/heaviest available/.test(c.target) && /reps/.test(c.target), `2. ${c.top} ${c.u}: the target asks for more reps at the heaviest available`, c);
      ok(c.capRead === c.top, `2. the heaviest available reads as the heaviest load the plates make under ${c.cap} ${c.u}: ${c.top}`, c);
    }
    ok(!D.errors.length, '2. no page errors', D.errors);
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
