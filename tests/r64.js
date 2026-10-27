// r64: the smaller fixes of the r63 audit (PENDING.md's tracker), each case
// failing on r63 (`node tests/r64.js baselines/r63.html`) unless it says it
// guards what r63 did. `node tests/r64.js <page> 3` runs section 3 alone.
//   1  P-S4-2: a best estimate that rounds to the one before it says no
//      "was" number, in the recap and in the toast as the set is ticked.
//   2  P-S4-8: a workout left open overnight says it started yesterday (or
//      on its date), not a bare time that reads as this morning.
const { open, engine } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', m); };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const run = n => !ONLY || ONLY.includes(n);

(async () => {
  const browser = await engine.launch();
  const pages = [];

  // ---- 1. P-S4-2: "Best estimate 8 lb per dumbbell (was 8)". DB bench at 3 kg (6.6 lb) for 7, then for 8, shown in
  // pounds: a little stronger, the same whole pound. The PR stands; a "was" that reads the same number says nothing.
  if (run(1)) {
    const P = await open(FILE, { browser, clock: '2026-10-15T10:00:00' }); pages.push(P);
    const r = await P.page.evaluate(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb';
      const sess = (id, date, w, r) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId: 'dbBench', rr: [6, 15], sets: [{ w, r, rir: 0, warm: false, drop: false }] }] });
      const out = {};
      for (const [k, w, r0] of [['same', 3, 7], ['more', 3, 8]]) {
        s.draft = null; s.sessions = [sess('p1', '2026-10-08', w, r0)];
        L.state = L.normalize(s); L.invalidate(); L.saveNow();
        const set = { w, r: r0 + 1, rir: 0, warm: false, drop: false, done: true }; const kind = L.livePR('dbBench', set, '2026-10-15'); const live = kind ? kind + L.prBeat('dbBench', set, '2026-10-15', kind) : '';
        L.ACT.startFree(); await new Promise(q => setTimeout(q, 120));
        const f = L.state.draft; f.ex = [L.newBlock('dbBench', L.planFor('dbBench', null, null, false, f.date), {})];
        f.ex[0].sets.length = 1; Object.assign(f.ex[0].sets[0], { w, r: r0 + 1, rir: 0, done: true });
        f._rampAsked = true; f._leftAsked = true; L.ACT.finishNow(); await new Promise(q => setTimeout(q, 300));
        const m = L.ui.modal; out[k] = { live, prs: m && m.prs };
        if (L.ui.modal) L.ACT.mClose();
      }
      return out;
    });
    const num = t => ((t || '').match(/(\d+) lb/) || [])[1];
    const same = r.same.prs && r.same.prs[0];
    ok(same && /^Best estimate 8 lb/.test(same.what) && same.was === '', '1. the recap: Best estimate 8 lb per dumbbell, with no "was 8" beside it (r63: "was 8")', r.same);
    ok(typeof r.same.live === 'string' && /estimated 1RM 8 lb/.test(r.same.live) && !/was 8/.test(r.same.live), '1. the toast as the set is ticked: the estimate with no "was 8" (r63: "; was 8")', r.same.live);
    const more = r.more.prs && r.more.prs[0];
    ok(more && /^Best estimate 9 lb/.test(more.what) && more.was === 'was 8' && /was 8/.test(r.more.live || ''), '1. (a guard) a best estimate one pound up still says what it was, in the recap and the toast', r.more);
    ok(num(same && same.what) === '8', '1. (the case) the two estimates round to one number', r.same);
  }

  // ---- 2. P-S4-8: started at 9:00 one morning, still open the next: "started 9:00 AM" read as today.
  if (run(2)) {
    const P = await open(FILE, { browser, clock: '2026-10-27T08:15:00' }); pages.push(P);
    const r = await P.page.evaluate(async () => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true;
      const meta = async startIso => {
        if (L.state.draft) { L.state.draft = null; L.saveNow(); }
        L.ACT.startFree(); await new Promise(q => setTimeout(q, 120));
        L.state.draft.startedAt = new Date(startIso).getTime(); L.saveNow(); L.render(); await new Promise(q => setTimeout(q, 120));
        const el = document.querySelector('#view .ph .meta'); return el ? el.innerText.replace(/\s+/g, ' ') : '';
      };
      return { yesterday: await meta('2026-10-26T09:00:00'), earlier: await meta('2026-10-24T09:00:00'), today: await meta('2026-10-27T07:40:00') };
    });
    ok(/started yesterday/.test(r.yesterday) && !/9:00/.test(r.yesterday), '2. begun yesterday at 9:00 and opened this morning: "started yesterday", not "started 9:00 AM" (r63)', r.yesterday);
    ok(/started (Sat, )?Oct 24/.test(r.earlier) && !/9:00/.test(r.earlier), '2. begun three days before: started on its date', r.earlier);
    ok(/started 7:40/.test(r.today), '2. (a guard) begun this morning: started at its time, as before', r.today);
  }

  const errors = pages.flatMap(P => P.errors);
  ok(!errors.length, 'no page errors', errors.slice(0, 4));
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
