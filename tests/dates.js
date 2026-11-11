// Dates on screen, held to one rule (NEW-111 and NEW-112, 2.48): a date in another year than today's says its year
// ("Dec 15, 2025"), one in this year does not ("Nov 3"). A feature suite (CLAUDE.md, Tests). Every section fails on
// 2.47 (`node tests/dates.js baselines/r93.html`) but the guards, which say so.
//   1  History: a week heading and a cardio row from last year.
//   2  Stats: "since" the first session, and a lift's sessions in its history sheet.
//   3  Today's Body card: the weigh-ins, the tape table and an injury's "since".
//   4  The session screen: last year's note on the lift.
//   5  Guards: this year's dates in the same places say no year.
// DATES_ONLY=1,3 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.DATES_ONLY ? process.env.DATES_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-10';
const LB = 0.45359237;

// A lifter with bench last year (its last session with a note), squat this year, cardio, weigh-ins, tape and an injury in both years.
async function lifter() {
  const P = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00' });
  await P.page.evaluate(LB => {
    const L = window.__ironlog; const S = L.state;
    S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.hidden = [];
    S.routines = [{ id: 'R1', name: 'Mine', schedule: 'cycle', days: [{ id: 'A', name: 'Push', rest: false, items: [{ uid: 'A0', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 120, ss: null }] }] }];
    S.activeRoutineId = 'R1';
    const ses = (id, date, exId, w, note) => ({ id, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId, rr: [6, 10], sets: [8, 8, 8].map(r => ({ w: w * LB, r, rir: 2, done: true })), ...(note ? { note } : {}) }] });
    S.sessions = [ses('b1', '2025-10-06', 'bench', 185), ses('b2', '2025-12-15', 'bench', 195, 'Felt strong'), ses('q1', '2026-11-03', 'squat', 225)];
    S.cardio = [{ id: 'c1', date: '2025-12-20', kind: 'run', min: 30 }, { id: 'c2', date: '2026-11-04', kind: 'bike', min: 20 }];
    S.bodyweights = [{ id: 'w1', date: '2025-12-01', kg: 180 * LB }, { id: 'w2', date: '2026-11-01', kg: 178 * LB }];
    S.measurements = [{ id: 'm1', date: '2025-12-01', waist: 86 }, { id: 'm2', date: '2026-11-01', waist: 84 }];
    S.injuries = [{ id: 'j1', m: 'j_knee', note: '', date: '2025-12-15' }];
    L.state = L.normalize(S);
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
  }, LB);
  await wait(150);
  return P;
}
const text = (P, sel = '#view') => P.page.evaluate(sel => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\s+/g, ' ') : ''; }, sel);
const tab = (P, t) => P.page.evaluate(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); }, t).then(() => wait(150));

(async () => {
  const P = await lifter();
  // The dates as the app writes them, read from the app's own formatter only for the locale's words.
  const D = await P.page.evaluate(() => { const f = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); const g = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); return { dec15: f('2025-12-15'), dec20: f('2025-12-20'), oct6: f('2025-10-06'), dec1: f('2025-12-01'), wk: f('2025-12-15'), nov1: g('2026-11-01'), nov3: g('2026-11-03') }; });

  if (run(1)) {
    await tab(P, 'history');
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.folds['history:cardio'] = true; L.render(); }); await wait(150);
    const t = await text(P);
    ok(t.includes(`Sessions since ${D.oct6}`), `1. History's "since" says its year (Sessions since ${D.oct6})`, t.slice(0, 300));
    ok(t.toLowerCase().includes(`week of ${D.dec15}`.toLowerCase()), `1. History's week heading from last year says its year ("Week of ${D.dec15}"; 2.47: "Week of Dec 15")`, t.slice(0, 600));
    ok(t.includes(D.dec20), `1. last year's cardio row says its year (${D.dec20})`, t.slice(0, 800));
  }
  if (run(2)) {
    await tab(P, 'dash');
    const t = await text(P);
    ok(t.includes(`since ${D.oct6}`), `2. Stats says sessions logged since ${D.oct6}, with its year`, t.slice(0, 300));
    await P.page.evaluate(() => window.__ironlog.openModal({ kind: 'exhist', exId: 'bench' })); await wait(200);
    const h = await text(P, '#modal');
    ok(h.includes(D.dec15) && h.includes(D.oct6), `2. the bench's history sheet dates its sessions with their year (${D.dec15}, ${D.oct6})`, h.slice(0, 600));
    await P.page.evaluate(() => window.__ironlog.ACT.mClose());
  }
  if (run(3)) {
    await tab(P, 'today');
    await P.page.evaluate(() => { const L = window.__ironlog; for (const k of ['today:body', 'today:tape', 'today:injuries']) L.ui.folds[k] = true; L.render(); }); await wait(150);
    const t = await text(P);
    ok(t.includes(D.dec1), `3. Today's Body card dates last year's weigh-in and tape with their year (${D.dec1})`, t.slice(t.indexOf('Body'), t.indexOf('Body') + 800));
    ok(t.includes(`since ${D.dec15}`), `3. an injury flagged last year says since ${D.dec15}`, t.slice(0, 1500));
  }
  if (run(4)) {
    await tab(P, 'today');
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(250);
    const t = await text(P);
    ok(t.includes(`Your note, ${D.dec15}: Felt strong`), `4. the session shows last year's note with its year (Your note, ${D.dec15})`, t.slice(0, 900));
    await P.page.evaluate(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
  }
  if (run(5)) {
    await tab(P, 'today');
    await P.page.evaluate(() => { const L = window.__ironlog; for (const k of ['today:body', 'today:tape', 'today:injuries']) L.ui.folds[k] = true; L.render(); }); await wait(150);
    const t = await text(P);
    ok(t.includes(D.nov1) && !t.includes(`${D.nov1}, 2026`), `5. a guard: this year's weigh-in says ${D.nov1}, no year`, t.slice(0, 600));
    await tab(P, 'history');
    const h = await text(P);
    ok(!/2026/.test(h), '5. a guard: History says no 2026 anywhere, this year\'s dates without their year', h.slice(0, 600));
  }
  ok(!P.errors.length, 'no page errors', P.errors);
  await P.ctx.close(); await P.browser.close();

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
