// V's rulings about numbers, each as concrete cases with the answer the ruling gives (V, 2026-11-06 22:16: rulings
// enforced by tests, never by memory). One table: a case names its ruling, the history it starts from and the answer
// a lifter is owed. A change that moves a ruled answer fails here and names the ruling. Expected answers come from
// the rulings, never from a build: a case that fails on the current build is a finding, reproduced and reported,
// never an expectation edited to match. claude/ironlog-rulings-register.md (the project) lists every ruling and
// where it is enforced; this suite holds the corners no other suite held (NEW-75: r54's 8 lb was pinned at 12 lb only).
// `node tests/rulings.js [file]`; RULINGS_ONLY=A,B runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.RULINGS_ONLY ? process.env.RULINGS_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(n);

// Section A: loads and steps. Each case: the ruling, the lift, the unit, the load of three earlier sessions (in the
// unit), the reps of the two before the last (`prev`, 12 each when not given) and of the last (`r`), the option
// (light or deload), and the answer: the next load in the unit, a test of it, or the words the target must hold
// (`text`). A session short of its usual sets the target from the last full session before it (the Guide's Last),
// so the cases that check "the target repeats" have full sessions under the top of the range before the short one.
const PLAN = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 120 };
const A = [
  // r54 (V's call, 2026-10-18): lb dumbbells read on a 5 lb rack; 12 steps to 15, 8 to 10, a Lighter day from 12 is 10.
  // The next weight is the rack's (r54); a step large for the load builds reps to it first (NEW-6, V 2026-10-27).
  { rule: 'r54 and NEW-6: 12 lb dumbbells at the top of the range build reps toward 15 (the step of 3 lb is large, so reps first)', ex: 'dbCurl', u: 'lb', w: 12, r: [12, 12, 12], text: /next step, 3 lb\b|add 3 lb\b/, want: 'the next step named is 3 lb, to 15' },
  { rule: 'r54 and NEW-6: 8 lb dumbbells at the top of the range build reps toward 10 (2.29 named 15, NEW-75)', ex: 'dbCurl', u: 'lb', w: 8, r: [12, 12, 12], text: /next step, 2 lb\b|add 2 lb\b/, notText: /next step, 7 lb|add 7 lb/, want: 'the next step named is 2 lb, to 10' },
  { rule: 'r54 (V, 2026-10-18): a Lighter day from 12 lb dumbbells is 10', ex: 'dbCurl', u: 'lb', w: 12, r: [12, 12, 12], opt: { light: true }, want: 10 },
  // 367 (V's pick, 2026-11-02): the step by how a lift is loaded: 10 lb or 5 kg on a bar or a stack, 5 lb or 2 kg each dumbbell.
  { rule: '367 (V, 2026-11-02): a barbell lift steps 10 lb', ex: 'bench', u: 'lb', w: 135, r: [12, 12, 12], want: 145 },
  { rule: '367 (V, 2026-11-02): a barbell lift steps 5 kg', ex: 'bench', u: 'kg', w: 60, r: [12, 12, 12], want: 65 },
  { rule: '367 (V, 2026-11-02): a stack steps 10 lb', ex: 'latPulldown', u: 'lb', w: 100, r: [12, 12, 12], want: 110 },
  { rule: '367 (V, 2026-11-02): a stack steps 5 kg', ex: 'latPulldown', u: 'kg', w: 50, r: [12, 12, 12], want: 55 },
  { rule: '367 (V, 2026-11-02): dumbbells step 2 kg each', ex: 'dbBench', u: 'kg', w: 20, r: [12, 12, 12], want: 22 },
  { rule: '367 (V, 2026-11-02): dumbbells step 5 lb each', ex: 'dbBench', u: 'lb', w: 45, r: [12, 12, 12], want: 50 },
  // r27 and CLAUDE.md Numbers: lighter loads and deloads are whole steps below, never under the empty bar.
  { rule: 'r27: a Lighter day at the empty bar stays at the bar', ex: 'bench', u: 'lb', w: 45, r: [12, 12, 12], opt: { light: true }, test: v => v === 45, want: '45' },
  { rule: 'r27: a deload at the empty bar stays at the bar', ex: 'bench', u: 'lb', w: 45, r: [12, 12, 12], opt: { deload: true }, test: v => v === 45, want: '45' },
  { rule: 'r27: a Lighter day from 95 lb bench is whole 10 lb steps below, never under the bar', ex: 'bench', u: 'lb', w: 95, r: [12, 12, 12], opt: { light: true }, test: v => v >= 45 && v < 95 && Math.abs((95 - v) % 10) < 1e-6, want: '45 to 85 in 10 lb steps' },
  { rule: 'r27: a deload from 60 kg bench is whole 5 kg steps below, never under the bar', ex: 'bench', u: 'kg', w: 60, r: [12, 12, 12], opt: { deload: true }, test: v => v >= 20 && v < 60 && Math.abs((60 - v) % 5) < 1e-6, want: '20 to 55 in 5 kg steps' },
  // V's one rule (2026-10-18) and 387-B3 (V, 2026-11-04): fewer sets, or a missed set (0 reps), repeat the target.
  { rule: 'One rule (control): three full sets at the top after sessions under it steps up', ex: 'bench', u: 'lb', w: 135, prev: [10, 10, 10], r: [12, 12, 12], want: 145 },
  { rule: 'One rule (V, 2026-10-18): two of three sets at the top repeats the target', ex: 'bench', u: 'lb', w: 135, prev: [10, 10, 10], r: [12, 12], want: 135 },
  { rule: '387-B3 (V, 2026-11-04): a missed set (0 reps) never earns a step up', ex: 'bench', u: 'lb', w: 135, prev: [10, 10, 10], r: [12, 12, 0], want: 135 },
  { rule: 'One rule: under the top of the range the load holds', ex: 'bench', u: 'lb', w: 135, prev: [10, 10, 10], r: [10, 10, 10], want: 135 }
];

(async () => {
  if (run('A')) {
    const D = await open(FILE, { w: 390, h: 844, clock: '2026-11-06T10:00:00' });
    const got = await D.page.evaluate(({ A, PLAN }) => {
      const L = window.__ironlog, LB = 0.45359237;
      let seq = 0;
      return A.map(c => {
        const S = L.state;
        S.settings.onboarded = true; S.settings.unit = c.u; delete S.settings.gym; S.draft = null;
        const kg = c.u === 'lb' ? c.w * LB : c.w;
        seq++;
        S.sessions = ['2026-10-16', '2026-10-23', '2026-10-30'].map((date, i) => ({ id: `a${seq}_${i}`, date, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: c.ex, rr: [PLAN.repMin, PLAN.repMax], sets: (i === 2 ? c.r : c.prev || [12, 12, 12]).map(r => ({ w: kg, r, rir: 1, warm: false, drop: false })) }] }));
        L.state = L.normalize(S); L.invalidate();
        try {
          const g = L.suggest(c.ex, PLAN, c.opt || {});
          return { w: g.w == null ? null : Math.round((c.u === 'lb' ? g.w / LB : g.w) * 100) / 100, words: `${g.text || ''} | ${g.target || ''}` };
        } catch (e) { return 'error: ' + e; }
      });
    }, { A: A.map(({ test, text, notText, ...c }) => c), PLAN });
    A.forEach((c, i) => {
      const g = got[i], v = g && g.w;
      const pass = c.text ? c.text.test(g.words) && (!c.notText || !c.notText.test(g.words)) : typeof v === 'number' && (c.test ? c.test(v) : Math.abs(v - c.want) < 1e-6);
      ok(pass, `A. ${c.rule}: ${c.u} ${c.w} x ${c.r.join(', ')}${c.opt ? ' ' + Object.keys(c.opt)[0] : ''} -> ${c.want}`, g);
    });
    ok(!D.errors.length, 'A. no page errors', D.errors);
    await D.browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
