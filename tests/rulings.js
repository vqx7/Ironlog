// V's rulings about numbers, each as concrete cases with the answer the ruling gives (V, 2026-11-06 22:16: rulings
// enforced by tests, never by memory). One table: a case names its ruling, the history it starts from and the answer
// a lifter is owed. A change that moves a ruled answer fails here and names the ruling. Expected answers come from
// the rulings, never from a build: a case that fails on the current build is a finding, reproduced and reported,
// never an expectation edited to match. claude/ironlog-rulings-register.md (the project) lists every ruling and
// where it is enforced; this suite holds the corners no other suite held (NEW-75: r54's 8 lb was pinned at 12 lb only).
// `node tests/rulings.js [file]`; RULINGS_ONLY=A,B,C runs some sections (A loads and steps, B PRs, C readings and
// weekly targets).
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
  // Section B: PRs, as the PR list counts them (IDX().prs, big: counted and announced). Each case: earlier sessions
  // and the session judged (its own flags), all in kg; the ruling says whether that session counts a PR.
  if (run('B')) {
    const B = [
      { rule: 'A PR is a PR on any day (V, 2026-10-18): a heavier, stronger set on a Lighter day counts', ex: 'bench', prev: [[100, 8]], set: [110, 8], flags: { light: true }, want: true },
      { rule: 'A PR is a PR on any day (V, 2026-10-18): on a deload day too', ex: 'bench', prev: [[100, 8]], set: [110, 8], flags: { deload: true }, want: true },
      { rule: 'r58: a heavier set that is not stronger is no counted PR (Heaviest yet)', ex: 'bench', prev: [[100, 10]], set: [105, 3], want: false },
      { rule: 'r58: the same load and reps again is no PR', ex: 'bench', prev: [[100, 8]], set: [100, 8], want: false },
      { rule: 'R72-4 (V, 2026-11-04): a rep more past 12 at the same load counts', ex: 'bench', prev: [[60, 13]], set: [60, 14], want: true },
      { rule: '387-B3 (V, 2026-11-04): a missed set (0 reps) is never a PR, however heavy', ex: 'bench', prev: [[100, 8]], set: [140, 0], want: false },
      { rule: 'A change of units is never a PR: the same load shown in lb', ex: 'bench', prev: [[100, 8]], set: [100, 8], unit: 'lb', want: false }
    ];
    const D = await open(FILE, { w: 390, h: 844, clock: '2026-11-06T10:00:00' });
    const got = await D.page.evaluate(B => {
      const L = window.__ironlog;
      return B.map((c, n) => {
        const S = L.state;
        S.settings.onboarded = true; S.settings.unit = 'kg'; delete S.settings.gym; S.draft = null;
        const day = i => ['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23'][i];
        const mk = (id, date, [w, r], flags) => ({ id, date, dayIdx: 0, dayName: 'A', notes: '', ...(flags || {}), ex: [{ exId: c.ex, rr: [6, 12], sets: [{ w, r, rir: null, warm: false, drop: false }] }] });
        S.sessions = [...c.prev.map((x, i) => mk(`b${n}_${i}`, day(i), x)), mk(`b${n}_x`, '2026-10-30', c.set, c.flags)];
        if (c.unit) S.settings.unit = c.unit;
        L.state = L.normalize(S); L.invalidate();
        return L.IDX().prs.filter(p => p.sid === `b${n}_x` && p.big).map(p => p.type);
      });
    }, B);
    B.forEach((c, i) => ok(got[i].length > 0 === c.want, `B. ${c.rule}`, { counted: got[i] }));
    ok(!D.errors.length, 'B. no page errors', D.errors);
    await D.browser.close();
  }

  // Section C: readings and targets over time, and D: weekly targets.
  if (run('C')) {
    const D = await open(FILE, { w: 390, h: 844, clock: '2026-11-06T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog, S = L.state, PLAN = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 120 };
      S.settings.onboarded = true; S.settings.unit = 'kg'; delete S.settings.gym; S.draft = null;
      const ses = (id, date, w, r) => ({ id, date, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'bench', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w, r, rir: null, warm: false, drop: false })) }] });
      // At the top of the range, then more than four weeks off (Sep 4 to Nov 6).
      S.sessions = [ses('c1', '2026-08-28', 100, 12), ses('c2', '2026-09-04', 100, 12)];
      L.state = L.normalize(S); L.invalidate();
      const back = L.suggest('bench', PLAN, {});
      // The same, trained last week: the step up.
      S.sessions = [ses('c3', '2026-10-23', 100, 12), ses('c4', '2026-10-30', 100, 12)];
      L.state = L.normalize(S); L.invalidate();
      const on = L.suggest('bench', PLAN, {});
      return { back: back.w, backText: back.text, on: on.w, chest: L.hasTarget('chest'), calves: L.hasTarget('calves'), forearms: L.hasTarget('forearms'), serratus: L.hasTarget('serratus') };
    });
    ok(r.back != null && r.back <= 100 + 1e-6, 'C. A break of more than four weeks restarts the readings: no step up from the sets before it (CLAUDE.md, Numbers)', r);
    ok(r.on > 100 + 1e-6, 'C. (control) the same sets last week step up', r);
    ok(r.chest === true && r.calves === true, 'D. r58: chest and calves, trained directly for size, have a weekly target by default (TARGETED)', r);
    ok(r.forearms === false && r.serratus === false, 'D. r58: forearms and serratus are tracked only until the lifter gives them a target', r);
    ok(!D.errors.length, 'C. no page errors', D.errors);
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
