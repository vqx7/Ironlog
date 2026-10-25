// r58 (PENDING 343): Plan and Stats move into src/app/ (phase 5), with the
// decisions V placed in them. Each case fails on r57 (a page built from the
// r57 branch) and on r56.2 (`node tests/r58.js baselines/r56-2.html`) unless
// it says it guards:
//   P  one PR rule, as the list and the announcement both say it (r32, r34.2):
//      a set is a PR, listed, counted and announced, only when it is stronger
//      than every earlier set; a best within one band of reps alone is neither
//      (r57 and r56.2 announced 92.5 kg x 8 after 120 x 3 as a new best
//      estimate, which Recent PRs never listed).
const { open, engine } = require('./h');
const FILE = process.argv[2] || 'index.html';
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };

(async () => {
  const browser = await engine.launch();
  const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);

  // ---- P. One PR rule for the list and the announcement.
  const pr = await ev(() => {
    const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg';
    const ses = (id, date, sets) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'S', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: sets.map(([w, r, rir]) => ({ w, r, rir, warm: false, drop: false })) }] });
    s.sessions = [ses('a', '2026-10-01', [[120, 3, 0]]), ses('b', '2026-10-08', [[90, 8, 1], [90, 8, 1]])];
    s.draft = null; L.state = L.normalize(s); L.invalidate();
    const out = {};
    const one = (w, r, rir) => { const live = L.livePR('bench', { w, r, rir, done: true }, '2026-10-24'); const st = L.normalize(JSON.parse(JSON.stringify(L.state))); st.sessions.push(ses('x', '2026-10-24', [[w, r, rir]])); const was = L.state; L.state = L.normalize(st); L.invalidate(); const listed = L.IDX().prs.filter(p => p.sid === 'x' && p.big).map(p => p.type); L.state = was; L.invalidate(); return { live, listed }; };
    out.bandBest = one(92.5, 8, 1);   // a best in 6-10, weaker than 120 x 3 at 0
    out.stronger = one(110, 8, 1);    // stronger than every earlier set (a guard)
    return out;
  });
  ok(pr.bandBest.live === null && pr.bandBest.listed.length === 0, 'P. 92.5 kg x 8 after 120 x 3 at RIR 0 and 90 x 8: a best for 6 to 10 reps, weaker than 120 x 3, is neither announced nor listed (r57 and r56.2: announced "New best estimate", not listed)', pr.bandBest);
  ok(!!pr.stronger.live && pr.stronger.listed.length === 1, 'P. 110 x 8, stronger than every earlier set: announced and listed alike (a guard)', pr.stronger);

  ok(P.errors.length === 0, 'no page errors', P.errors);
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
