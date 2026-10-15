// Speed as the log grows (r47). Nothing stopped the app getting slower a year
// at a time: every other suite checks what the numbers are, none how long they
// take. The one that matters is ticking a set, which happens between sets at
// the gym; the rest matter less but are measured so a change shows up here
// rather than on V's phone in two years.
//
// The ceilings are generous on purpose. Measured on a quiet desktop at three
// years of training (624 sessions, about 11,000 sets): a tick is 21 ms, a
// Stats render 70 ms, an index rebuild 91 ms. A phone is roughly 3 to 4 times
// slower, and a CI runner is slower and noisier than either, so each ceiling
// is about four times what was measured. This catches a change that makes
// something several times worse, not ordinary variation.
const { open, engine } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m, x !== undefined ? JSON.stringify(x) : ''); };

const CEIL = { tick: 90, stats: 300, today: 120, idx: 400 };   // milliseconds, three years of training

(async () => {
  const browser = await engine.launch();
  const P = await open('index.html', { browser, clock: '2026-10-15T10:00:00' });
  const r = await P.page.evaluate(async () => {
    const L = window.__ironlog; const w = ms => new Promise(r => setTimeout(r, ms));
    const s = L.state; s.settings.onboarded = true;
    const R = L.activeRoutine(); const days = R.days.filter(x => !x.rest);
    const ids = s.exercises.slice(0, 40).map(e => e.id);
    // Three years at four sessions a week, six lifts of three sets each.
    const ss = []; let n = 0;
    for (let k = 0; k < 156 * 4; k++) ss.push({ id: 'p' + n++, date: L.addDays(L.today(), -(k * 2 + 1)),
      dayIdx: 0, dayId: days[0].id, dayName: days[k % days.length].name, routineId: R.id, notes: '',
      ex: Array.from({ length: 6 }, (_, j) => ({ exId: ids[(n + j) % ids.length], rr: [6, 10],
        sets: Array.from({ length: 3 }, () => ({ w: 40 + ((n + j) % 30) * 2.5, r: 6 + (n % 5), rir: 1, done: true })) })) });
    s.sessions = ss; L.state = L.normalize(s); L.invalidate();
    const med = a => { a = [...a].sort((x, y) => x - y); return +a[Math.floor(a.length / 2)].toFixed(1); };
    const times = (f, reps) => { const out = []; for (let i = 0; i < reps; i++) { const t0 = performance.now(); f(); out.push(performance.now() - t0); } return med(out); };

    const idx = times(() => { L.invalidate(); L.IDX(); }, 3);
    L.IDX();
    const today = times(() => { L.ui.tab = 'today'; L.render(); }, 5);
    const stats = times(() => { L.ui.tab = 'dash'; L.render(); }, 5);

    // Ticking a set, the one a lifter waits on between sets.
    L.state.draft = null; L.saveNow(); L.ui.tab = 'today'; L.render();
    document.querySelector('[data-act="startSession"]').click(); await w(80); L.render();
    const ticks = [];
    for (let i = 0; i < 6; i++) {
      const btn = document.querySelector(`[data-act="sDone"][data-b="0"][data-s="${i % 3}"]`); if (!btn) break;
      const inp = document.querySelector(`[data-f="r"][data-b="0"][data-s="${i % 3}"]`);
      if (inp) { inp.value = '8'; inp.dispatchEvent(new Event('input', { bubbles: true })); }
      const t0 = performance.now(); btn.click(); ticks.push(performance.now() - t0);
    }
    return { sessions: ss.length, sets: ss.length * 18, idx, today, stats, tick: med(ticks) };
  });

  console.log(`  ${r.sessions} sessions, ${r.sets} sets (three years of training)`);
  ok(r.tick <= CEIL.tick, `ticking a set stays under ${CEIL.tick} ms`, r.tick);
  ok(r.today <= CEIL.today, `the Today screen draws under ${CEIL.today} ms`, r.today);
  ok(r.stats <= CEIL.stats, `the Stats screen draws under ${CEIL.stats} ms`, r.stats);
  ok(r.idx <= CEIL.idx, `the analytics rebuild stays under ${CEIL.idx} ms`, r.idx);
  ok(!P.errors.length, 'no page errors', P.errors);
  await P.ctx.close(); await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
