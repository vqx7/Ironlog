// PRs and All-time bests, checked against their written rules (CA-1; the spec "PRs and All-time bests", B-1 to B-19,
// in the project's claude/ironlog-spec-prs-bests.md, built from the code: prs.ts, bests.ts, formulas.ts, worksets.ts
// (livePR, rowPR, prBeat), workfinish.ts's recap, display.ts, stats.ts, today.ts and history.ts, V's rulings deciding,
// and where neither does, what a lifter expects). A feature suite: each section is one rule, a lifter's log seeded, the
// workout started from Today's card and driven by taps and typing as a lifter drives it, and what the toast, the rows,
// the recap and Stats then say compared with what the rule gives, the numbers worked out here from the rule (Brzycki
// to 10 reps to failure, Epley at 11 and 12; docs/EVIDENCE.md), never read from the app. A failure names its rule.
// Each rule was changed in a copy of the page to show its check fails there (PENDING, CA-1). The one count on every
// screen is tests/coherence.js's too; targets are tests/progression.js's. BESTS_ONLY=B-1,B-4 runs some rules.
//
// Moved in whole: this suite's own checks from r47 (the questions a lifter asks while training: "Is it easy to see
// what your PR was during a today session?", "Is that what you mean by target, a target or a PR?", "Can someone who
// just started still input a PR they hit before the app?") under B-17 to B-19, and tests/r32b.js's part 1, bodyweight
// PRs, under B-13 (its part 2, a close variation's first session, is tests/progression.js's P-13), every check kept.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
// The build under test; another (`node tests/bests.js baselines/r99.html`) shows a new check fails there.
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.BESTS_ONLY ? process.env.BESTS_ONLY.split(',') : null;
const run = id => !ONLY || ONLY.includes(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-11';
const LB = 0.45359237;

// The estimate a PR is judged by (B-2), in the unit typed: reps to failure is the reps plus the RIR.
const e1 = (load, rtf) => (rtf <= 10 ? (load * 36) / (37 - rtf) : load * (1 + rtf / 30));
const lbE = v => String(Math.round(v)); // an estimate as the screens show it in lb: whole pounds (fmtE)

// What the screen holds, read as a lifter reads it.
const TOAST_LOG = () => {
  window.__toasts = [];
  const hook = () => {
    const el = document.getElementById('toast');
    if (!el) { setTimeout(hook, 20); return; }
    new MutationObserver(() => {
      if (el.hidden) return;
      const t = el.innerText.replace(/\s+/g, ' ').replace(/ Undo$/, '').trim(), last = window.__toasts[window.__toasts.length - 1];
      if (t && t !== last) window.__toasts.push(t);
    }).observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
  };
  hook();
};

/* A lifter in lb on one day of a routine ("Push": bench 3 x 6 to 10, lateral raise 2 x 10 to 15; o.items replaces
   them, as [exId, sets, repMin, repMax]), with last week's session (bench 185 x 8, 8, 7 and raises 20 x 12, 12, all at
   2 in reserve) unless o.log gives the log: sessions as [date, [[exId, [[load, reps, rir, mark], ...]], ...]], loads in
   lb (kg with o.kg), mark 'w' a warm-up, 'd' a drop set, or fields of the set ({ cal: { at, pred } }, an RIR check).
   o.bw adds weigh-ins as [date, kg]; o.settings sets settings. */
async function lifter(o = {}) {
  const items = o.items || [['bench', 3, 6, 10], ['dbLateral', 2, 10, 15]];
  const log = o.log || [['2026-11-07', [['bench', [[185, 8, 2], [185, 8, 2], [185, 7, 2]]], ['dbLateral', [[20, 12, 2], [20, 12, 2]]]]]];
  const P = await open(FILE, { browser: o.browser, w: 390, h: 844, clock: (o.day || DAY) + 'T10:00:00', setup: async ctx => { await ctx.addInitScript(TOAST_LOG); } });
  P.ev = (f, a) => P.page.evaluate(f, a);
  await P.ev(([items, log, o, LB]) => {
    const L = window.__ironlog; const S = L.state;
    S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.lastExport = '2026-11-11';
    Object.assign(S.settings, o.settings || {});
    S.routines = [{ id: 'R1', name: 'Mine', schedule: 'cycle', days: [{ id: 'A', name: 'Push', rest: false, items: items.map(([exId, sets, repMin, repMax], k) => ({ uid: 'i' + k, exId, sets, repMin, repMax, rir: 2, rest: 90, ss: null })) }] }];
    S.activeRoutineId = 'R1';
    const rrOf = id => { const it = items.find(x => x[0] === id); return it ? [it[2], it[3]] : [6, 10]; };
    S.sessions = log.map(([date, ex], k) => ({ id: 's' + k, date, dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '',
      ex: ex.map(([exId, sets]) => ({ exId, rr: rrOf(exId), sets: sets.map(([w, r, rir, m]) => ({ w: o.kg ? w : w * LB, r, rir, done: true, ...(m === 'w' ? { warm: true } : m === 'd' ? { drop: true } : m && typeof m === 'object' ? m : {}) })) })) }));
    S.bodyweights = (o.bw || []).map(([date, kg], k) => ({ id: 'bw' + k, date, kg }));
    L.state = L.normalize(S);
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
  }, [items, log, { settings: o.settings, kg: !!o.kg, bw: o.bw }, LB]);
  await wait(100);
  P.tap = async (sel, ms = 200) => { await P.page.click(sel); await wait(ms); };
  P.toasts = () => P.ev(() => window.__toasts.slice());
  P.clearToasts = () => P.ev(() => { window.__toasts.length = 0; });
  // The PR toasts since the last clear: a toast naming a PR as the app words them (B-4).
  P.prToasts = async () => (await P.toasts()).filter(t => /^(Weight PR|New best estimate|Rep PR|Time PR|PR):/.test(t));
  // Whether exercise b's row s is marked a PR (the gold row, ST-4).
  P.gold = (b, s) => P.ev(([b, s]) => { const t = document.querySelector(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`); const row = t && t.closest('.sg'); return row ? row.classList.contains('pr') : null; }, [b, s]);
  P.modal = () => P.ev(() => { const m = window.__ironlog.ui.modal; const el = document.querySelector('#modal .sheet'); return m ? { kind: m.kind, text: el ? el.innerText.replace(/\s+/g, ' ') : '', buttons: el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()) : [] } : null; });
  P.close = () => P.browser.close();
  return P;
}
// The day started from Today's card, as a lifter starts it.
async function start(P) { await P.page.click('#tabs [data-tab="today"]'); await wait(120); await P.tap('#view .hero [data-act="startSession"]:not([data-light])', 300); }
const tickSel = (b, s) => `#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`;
const field = (f, b, s) => `#view input[data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
/* A set as a lifter logs it: the load and reps typed (a load of null leaves the field as it is), the effort rated on
   the strip when given, then the tick. */
async function logSet(P, b, s, w, r, rir) {
  if (w != null) await P.page.fill(field('w', b, s), String(w));
  if (r != null) await P.page.fill(field('r', b, s), String(r));
  if (rir != null) { await P.tap(`#view [data-act="rirOpen"][data-b="${b}"][data-s="${s}"]`, 120); await P.tap(`#view [data-act="rirPick"][data-b="${b}"][data-s="${s}"][data-v="${rir}"]`, 120); }
  await P.tap(tickSel(b, s), 250);
}
// Finish, through the sheets it may ask on the way (sets left, a question), to the recap; its text.
async function finish(P) {
  await P.tap('#view [data-act="finish"]', 300);
  for (let k = 0; k < 4; k++) {
    const m = await P.modal();
    if (!m || m.kind === 'recap') break;
    if (m.buttons.includes('Finish now')) await P.tap('#modal button:has-text("Finish now")', 300);
    else await P.tap('#modal [data-act="mOk"]', 300);
  }
  const m = await P.modal();
  return m && m.kind === 'recap' ? m.text : null;
}
// Stats, Lifts, as a lifter opens it: the section and its Recent PRs and All-time bests opened by their titles, each
// line then read as shown.
async function stats(P) {
  const m = await P.modal();
  if (m && m.kind === 'recap') await P.tap('#modal button:has-text("Done")', 200);
  await P.tap('#tabs [data-tab="dash"]', 300);
  for (const sel of ['#sec-exercise', '#sub-prs', '#sub-bests'])
    if (await P.ev(sel => { const d = document.querySelector(sel); return !!d && !d.open; }, sel)) { await P.tap(`${sel} > summary`, 200); }
  return P.ev(() => {
    const txt = el => (el ? el.innerText.replace(/\s+/g, ' ').trim() : null);
    const prs = document.querySelector('#sub-prs');
    const rows = prs ? [...prs.querySelectorAll('.sec-b .row')].map(r => txt(r)) : [];
    const bests = document.querySelector('#sub-bests');
    const board = bests ? [...bests.querySelectorAll('.bx')].map(b => { if (!b.open) b.querySelector('summary').click(); return { ex: b.dataset.ex, lines: [...b.querySelectorAll('summary .bs')].map(txt), est: txt(b.querySelector('p.small')), table: [...b.querySelectorAll('table tr')].slice(1).map(tr => [...tr.querySelectorAll('td')].map(txt)) }; }) : [];
    const kpi = [...document.querySelectorAll('#view .kpi')].map(k => ({ v: txt(k.querySelector('.v')), l: txt(k.querySelector('.l')) })).find(k => /^PRs, last 4 weeks/.test(k.l || ''));
    return { prs: rows, prsText: txt(prs && prs.querySelector('.sec-b')), prsSub: txt(prs && prs.querySelector('summary .sec-s')), board, bestsText: txt(bests && bests.querySelector('.sec-b')), kpi };
  });
}

(async () => {
  /* ---------- B-1: a lift's first session makes no PR ---------- */
  if (run('B-1')) {
    // A first session ever: nothing to beat, so nothing is a PR, and the recap says these are the starting numbers.
    let P = await lifter({ log: [] });
    await start(P);
    await logSet(P, 0, 0, 135, 8); await logSet(P, 0, 1, 135, 8); await logSet(P, 1, 0, 15, 12);
    ok((await P.prToasts()).length === 0 && !(await P.gold(0, 0)) && !(await P.gold(1, 0)), 'B-1: a first session ever: no PR toast and no gold row', await P.toasts());
    let rc = await finish(P);
    ok(/Your first session: these are your starting numbers\./.test(rc || '') && !/NEW PR|PR,/.test(rc || ''), 'B-1: the recap says "Your first session: these are your starting numbers." and names no PR', rc);
    let st = await stats(P);
    ok(/No PRs yet\. Your first session of an exercise sets the baseline\./.test(st.prsText || ''), 'B-1: Recent PRs: "No PRs yet. Your first session of an exercise sets the baseline."', st.prsText);
    await P.close();
    // A lift new to a log with history: its first session makes no PR either, and the recap says there were none.
    P = await lifter({ items: [['bench', 3, 6, 10], ['dbLateral', 2, 10, 15], ['cableCurl', 2, 10, 15]] });
    await start(P);
    await logSet(P, 2, 0, 40, 12); await logSet(P, 2, 1, 50, 10);
    ok((await P.prToasts()).length === 0 && !(await P.gold(2, 0)) && !(await P.gold(2, 1)), 'B-1: a cable curl never done before: 40 x 12 then the heavier 50 x 10 make no PR', await P.toasts());
    rc = await finish(P);
    ok(/No PRs this time\./.test(rc || '') && !/Heaviest yet/.test(rc || ''), 'B-1: the recap says "No PRs this time." and no Heaviest yet: a first session has nothing to beat', rc);
    await P.close();
  }

  /* ---------- B-2 and B-3: only a set stronger than every earlier one is a PR ---------- */
  if (run('B-2') || run('B-3')) {
    const P = await lifter({ items: [['bench', 4, 6, 10], ['dbLateral', 2, 10, 15]] });
    await start(P);
    // Last week's strongest bench set: 185 x 8 at 2 in reserve, 10 reps to failure. A blank effort reads as the
    // lift's usual (2, from its 3 rated sets), so 175 x 10 is 12 to failure and 185 x 9 is 11.
    const best = e1(185, 10), more = e1(175, 12), nine = e1(185, 11);
    ok(more < best && nine > best, 'B-2: worked out from the rule: 175 x 10 scores under 185 x 8, 185 x 9 over it', { best, more, nine });
    await logSet(P, 0, 0, 175, 10);
    ok((await P.prToasts()).length === 0 && !(await P.gold(0, 0)), 'B-3: 175 x 10, more reps than ever at 175 but weaker than 185 x 8: no PR, no gold', await P.toasts());
    // Under 10 reps to failure the score is Brzycki's: 210 x 4 at 2 in reserve (6 to failure) scores 243.9, under
    // 185 x 8's 246.7, where Epley's formula would read it 252.
    ok(e1(210, 6) < best && 210 * (1 + 6 / 30) > best, 'B-2: worked out from the rule: 210 x 4 at 2 in reserve scores under 185 x 8 by Brzycki, over it by Epley', [e1(210, 6), best]);
    await logSet(P, 0, 1, 210, 4);
    ok((await P.prToasts()).length === 0 && !(await P.gold(0, 1)), 'B-2: 210 x 4, heavier but weaker by Brzycki\'s formula under 10 reps to failure: no PR', await P.toasts());
    // And at 9 to failure, next to where the formulas meet: 190 x 7 at 2 scores 244.3 by Brzycki, 247.0 by Epley.
    ok(e1(190, 9) < best && 190 * (1 + 9 / 30) > best, 'B-2: worked out from the rule: 190 x 7 at 2 in reserve scores under 185 x 8 by Brzycki, over it by Epley', [e1(190, 9), best]);
    await logSet(P, 0, 2, 190, 7);
    ok((await P.prToasts()).length === 0 && !(await P.gold(0, 2)), 'B-2: 190 x 7, heavier but weaker by Brzycki\'s formula at 9 reps to failure: no PR', await P.toasts());
    await logSet(P, 0, 3, 185, 9);
    ok((await P.prToasts()).length === 1 && (await P.gold(0, 3)), 'B-3: 185 x 9, stronger than every earlier set: a PR, with a toast and a gold row', await P.toasts());
    // Raises at 20 x 12 at 2 in reserve are 14 to failure, past the 12 where the score stops (B-2): one more rep at
    // the same load and effort scores the same, and with more reps than any set at 20 or heavier is stronger (R72-4).
    await P.clearToasts();
    await logSet(P, 1, 0, 20, 13, 2);
    ok((await P.prToasts()).length === 1 && (await P.gold(1, 0)), 'B-2: raises 20 x 13 at 2 in reserve after 20 x 12: the same score past 12 reps to failure, more reps, so stronger: a PR', await P.toasts());
    await P.close();
  }
  if (run('B-3')) {
    /* A lift with no estimate counts every kind. Leg raises (a lift about one joint) at a weigh-in of 80 kg move 35% of
       it, 28 kg: bodyweight x 12 at 2 in reserve scores 28 x 1.4 (14 to failure, read to 12), and +10 lb x 5 at 2 scores
       32.5 x 36 / 30, under it. On a lift with an estimate that would be Heaviest yet (B-6); here it is a Weight PR. */
    const KG = 80 * 0.35, plus = KG + 10 * LB;
    ok(e1(plus, 7) < e1(KG, 12), 'B-3: worked out from the rule: +10 lb x 5 on leg raises scores under bodyweight x 12', [e1(plus, 7), e1(KG, 12)]);
    let P = await lifter({ items: [['hangingLegRaise', 2, 10, 15]], bw: [['2026-11-01', 80]],
      log: [['2026-11-07', [['hangingLegRaise', [[0, 12, 2], [0, 12, 2]]]]]] });
    await start(P);
    await logSet(P, 0, 0, 10, 5, 2);
    let t = await P.prToasts();
    ok(t.length === 1 && /^Weight PR: Hanging Leg Raise/.test(t[0]) && (await P.gold(0, 0)), 'B-3: leg raises +10 x 5 after bodyweight x 12, weaker by the score, on a lift with no estimate: a counted Weight PR', t);
    await P.close();
    // Pull-ups before any weigh-in: no load is known, so a rep more is a counted Rep PR.
    P = await lifter({ items: [['pullup', 2, 6, 10]], bw: [], log: [['2026-11-07', [['pullup', [[0, 10, 2], [0, 9, 2]]]]]] });
    await start(P);
    await logSet(P, 0, 0, 0, 11);
    t = await P.prToasts();
    ok(t.length === 1 && /^Rep PR: Pull-up/.test(t[0]) && (await P.gold(0, 0)), 'B-3: pull-ups x 11 after x 10 with no weigh-in, no load known: a counted Rep PR', t);
    await P.close();
  }

  /* ---------- B-4 and B-5: one name per lift and session, the biggest news first, and what it beat ---------- */
  if (run('B-4') || run('B-5')) {
    let P = await lifter();
    await start(P);
    await logSet(P, 0, 0, 185, 9);
    let t = await P.prToasts();
    ok(t[0] === `New best estimate: Barbell Bench Press, 185×9 (estimated 1RM ${lbE(e1(185, 11))} lb; was ${lbE(e1(185, 10))})`, 'B-4, B-5: 185 x 9 beats every earlier estimate: "New best estimate", with the 1RM it gives and the one before', t);
    await P.clearToasts();
    await logSet(P, 0, 1, 195, 8);
    t = await P.prToasts();
    ok(t[0] === `Weight PR: Barbell Bench Press, 195×8 (heaviest before 185 lb; best estimate for 6 to 10 reps to failure now ${lbE(e1(195, 10))})`, 'B-4, B-5: 195 x 8, heavier and stronger still: "Weight PR", the heaviest it beat, and the best estimate it set for its reps', t);
    await P.clearToasts();
    await logSet(P, 1, 0, 20, 13, 2);
    t = await P.prToasts();
    ok(t[0] === 'Rep PR: DB Lateral Raise, 20×13 (was 12 reps)', 'B-4, B-5: raises 20 x 13 after 20 x 12: "Rep PR", the reps it beat', t);
    let rc = await finish(P);
    ok(new RegExp(`Barbell Bench Press: Weight PR, 195×8, best estimate ${lbE(e1(195, 10))} lb \\(heaviest before 185 lb\\)`).test(rc || '') && !/Best estimate/.test(rc || ''), 'B-4: one PR for the bench in the recap, the biggest news: the Weight PR, not the best estimate before it', rc);
    ok(/DB Lateral Raise: Rep PR, 20×13 \(was 12 reps at this load or heavier\)/.test(rc || ''), 'B-5: the recap says what the raises beat: "was 12 reps at this load or heavier"', rc);
    let st = await stats(P);
    ok(st.prs.length === 2 && /^Barbell Bench Press Weight PR 195×8 Nov 11/.test(st.prs.find(x => /Bench/.test(x)) || '') && /^DB Lateral Raise Rep PR 20×13 Nov 11/.test(st.prs.find(x => /Lateral/.test(x)) || ''), 'B-4, B-15: Recent PRs: one line a lift, Weight PR 195×8 and Rep PR 20×13, dated Nov 11', st.prs);
    await P.close();

    // An isolation lift's best estimate is said as the set, "PR", never as a 1RM; a timed hold's rep PR is a Time PR.
    P = await lifter({ items: [['dbLateral', 2, 8, 12], ['plank', 2, 30, 60]],
      log: [['2026-11-07', [['dbLateral', [[20, 8, 2], [20, 8, 2]]], ['plank', [[0, 45, null], [0, 40, null]]]]]] });
    await start(P);
    await logSet(P, 0, 0, 20, 9, 2);
    t = await P.prToasts();
    ok(t[0] === 'PR: DB Lateral Raise, 20×9 (your best for 11 to 12 reps to failure)', 'B-4, B-5: raises 20 x 9 after 20 x 8, a higher estimate on an isolation lift: "PR" with the set, the band of reps it is best for', t);
    await P.clearToasts();
    await logSet(P, 1, 0, null, 60);
    t = await P.prToasts();
    ok(t[0] === 'Time PR: Plank, BW for 60s (was 45 s)', 'B-4, B-5: a plank held 60 s after 45: "Time PR", in seconds', t);
    rc = await finish(P);
    ok(/DB Lateral Raise: PR, 20×9 \(your best for that number of reps\)/.test(rc || '') && !/1RM|estimate/.test((rc || '').replace(/Plank.*/, '')), 'B-4, B-5: the recap names the raises\' PR as the set, "your best for that number of reps", no 1RM', rc);
    ok(/Plank: Time PR, BW for 60s \(was 45 s at this load or heavier\)/.test(rc || ''), 'B-5: and the plank\'s Time PR with the seconds it beat', rc);
    st = await stats(P);
    ok(st.prs.some(x => /^DB Lateral Raise PR 20×9 Nov 11/.test(x)) && st.prs.some(x => /^Plank Time PR BW for 60s Nov 11/.test(x)), 'B-4, B-15: Recent PRs tags them "PR" and "Time PR"', st.prs);
    await P.close();

    // An assisted lift: less help is the Weight PR (help typed as a plain number, kept as bodyweight minus it).
    P = await lifter({ items: [['assistPullup', 2, 6, 10]], bw: [['2026-11-01', 80]],
      log: [['2026-11-07', [['assistPullup', [[-66, 8, 2], [-66, 8, 2]]]]]] });
    await start(P);
    await logSet(P, 0, 0, 55, 8);
    t = await P.prToasts();
    ok(/^Weight PR: Assisted Pull-up \(machine\)/.test(t[0] || '') && /less help than ever/.test(t[0] || ''), 'B-4, B-5: an assisted pull-up with 55 lb of help after 66: a Weight PR, "less help than ever"', t);
    await P.close();
  }

  /* ---------- B-6: heavier but not stronger is Heaviest yet, said once and not counted ---------- */
  if (run('B-6')) {
    const P = await lifter();
    await start(P);
    // 195 x 6 at 2 in reserve is 8 to failure, under 185 x 8's 10; raises 25 x 4 at 0, 4 to failure, under 20 x 12's
    // score, which stops at 12 (B-2).
    ok(e1(195, 8) < e1(185, 10) && e1(25, 4) < e1(20, 12), 'B-6: worked out from the rule: both heavier sets score under the strongest before', [e1(195, 8), e1(185, 10), e1(25, 4), e1(20, 12)]);
    await logSet(P, 0, 0, 195, 6);
    await logSet(P, 1, 0, 25, 4, 0);
    ok((await P.prToasts()).length === 0 && !(await P.gold(0, 0)) && !(await P.gold(1, 0)), 'B-6: 195 x 6 and raises 25 x 4, heavier than ever but weaker: no toast, no gold', await P.toasts());
    const rc = await finish(P);
    ok(/Heaviest yet: Barbell Bench Press 195×6 and DB Lateral Raise 25×4/.test(rc || '') && /No PRs this time\./.test(rc || '') && !/NEW PR/.test(rc || ''), 'B-6: the recap says it once, "Heaviest yet: Barbell Bench Press 195×6 and DB Lateral Raise 25×4", and no PR', rc);
    const st = await stats(P);
    ok(st.prs.length === 0 && /No PRs yet/.test(st.prsText || ''), 'B-6: not counted: Recent PRs has none', st.prsText);
    await P.close();
  }
  if (run('B-6')) {
    // Five lifts heavier and weaker: four named, "and 1 more".
    const ids = ['bench', 'ohp', 'bbRow', 'backSquat', 'deadlift'];
    const P = await lifter({ items: ids.map(id => [id, 1, 6, 10]), log: [['2026-11-07', ids.map(id => [id, [[185, 8, 2]]])]] });
    await start(P);
    for (let b = 0; b < ids.length; b++) await logSet(P, b, 0, 195, 6);
    const rc = await finish(P);
    ok(/Heaviest yet: Barbell Bench Press 195×6, Standing Overhead Press 195×6, Barbell Row 195×6, Barbell Back Squat 195×6, and 1 more/.test(rc || ''), 'B-6: five heavier lifts: four named, then "and 1 more"', rc);
    await P.close();
  }

  /* ---------- B-7: the moment, once a set, the same PR the list counts ---------- */
  if (run('B-7')) {
    const P = await lifter();
    await start(P);
    await logSet(P, 0, 0, 185, 9);
    ok((await P.prToasts()).length === 1 && (await P.gold(0, 0)), 'B-7: 185 x 9 ticked: one toast, the row gold', await P.toasts());
    await logSet(P, 0, 1, 185, 9);
    ok((await P.prToasts()).length === 1 && !(await P.gold(0, 1)), 'B-7: a second 185 x 9, no stronger than the PR set before it: no second toast, no gold', await P.toasts());
    await logSet(P, 0, 2, 185, 10);
    let t = await P.prToasts();
    ok(t.length === 2 && t[1] === `New best estimate: Barbell Bench Press, 185×10 (estimated 1RM ${lbE(e1(185, 12))} lb; was ${lbE(e1(185, 10))})` && (await P.gold(0, 2)), 'B-7: 185 x 10, stronger than that: its own toast, against the best before the session, and gold', t);
    // Unticked, the first loses its mark, and the second 185 x 9 is now the first of its kind this session.
    await P.tap(tickSel(0, 0), 250);
    ok(!(await P.gold(0, 0)) && (await P.gold(0, 1)) && (await P.gold(0, 2)), 'B-7: the first set unticked: its mark goes, and the second 185 x 9 is now the session\'s first such PR', [await P.gold(0, 0), await P.gold(0, 1), await P.gold(0, 2)]);
    await P.tap(tickSel(0, 0), 250);
    // Another tab and back: the bench, every set done, is drawn folded with its PR said; opened, every row drawn
    // again marks the same rows.
    await P.tap('#tabs [data-tab="history"]', 150); await P.tap('#tabs [data-tab="today"]', 250);
    const folded = await P.ev(() => { const f = document.querySelector('#blk-0.folded'); return f ? !!f.querySelector('.bf-pr') : null; });
    if (folded !== null) await P.tap('#view [data-act="bOpen"][data-b="0"]', 250);
    ok(folded === true && (await P.gold(0, 0)) && !(await P.gold(0, 1)) && (await P.gold(0, 2)), 'B-7: drawn again, folded once done it says PR, and opened the marks are where they were: the first 185 x 9 and 185 x 10', [folded, await P.gold(0, 0), await P.gold(0, 1), await P.gold(0, 2)]);
    const rc = await finish(P);
    ok(new RegExp(`Barbell Bench Press: Best estimate ${lbE(e1(185, 12))} lb \\(was ${lbE(e1(185, 10))}\\)`).test(rc || ''), 'B-7: saved, the list counts one PR for the bench, the strongest set announced: Best estimate 259', rc);
    const st = await stats(P);
    ok(st.prs.length === 1 && new RegExp(`^Barbell Bench Press Best estimate ${lbE(e1(185, 12))} lb Nov 11`).test(st.prs[0] || ''), 'B-7: Recent PRs holds that same one', st.prs);
    await P.close();
  }

  /* ---------- B-8: warm-ups, drop sets and missed sets make no PR and are never the set to beat ---------- */
  if (run('B-8')) {
    let P = await lifter();
    await start(P);
    await P.tap(`#view [data-act="sWarm"][data-b="0"][data-s="0"]`, 150);
    await logSet(P, 0, 0, 225, 3);
    await logSet(P, 0, 2, 205, 0);
    await P.tap(`#view [data-act="sWarm"][data-b="1"][data-s="1"]`, 150); await P.tap(`#view [data-act="sWarm"][data-b="1"][data-s="1"]`, 150);
    const drop = await P.ev(() => window.__ironlog.state.draft.ex[1].sets[1]);
    await logSet(P, 1, 1, 25, 12);
    ok(drop.drop && (await P.prToasts()).length === 0 && !(await P.gold(0, 0)) && !(await P.gold(0, 2)) && !(await P.gold(1, 1)), 'B-8: a 225 x 3 warm-up, a missed 205 x 0, and a raise drop set of 25 x 12: no PR among them', await P.toasts());
    const rc = await finish(P);
    ok(/No PRs this time\./.test(rc || '') && !/Heaviest yet/.test(rc || ''), 'B-8: the recap names no PR and no Heaviest yet', rc);
    await P.close();
    // Saved in a session before (with the raises done only as drop sets), none of them is the set to beat.
    P = await lifter({ log: [['2026-11-07', [['bench', [[225, 3, 2, 'w'], [185, 8, 2], [185, 8, 2], [205, 0, 2]]], ['dbLateral', [[25, 12, 2, 'd'], [25, 10, 2, 'd']]]]]] });
    await start(P);
    await logSet(P, 0, 0, 195, 8, 2);
    await logSet(P, 1, 0, 25, 13, 2);
    const t = await P.prToasts();
    ok(/^Weight PR: Barbell Bench Press, 195×8 \(heaviest before 185 lb/.test(t[0] || ''), 'B-8: 195 x 8 is a Weight PR over 185: the 225 warm-up and the missed 205 were never the heaviest', t);
    ok(t.length === 1, 'B-8: raises 25 x 13 after raises done only as drop sets (25 x 12 and 25 x 10): no PR, the drop sets feeding none, so this is the lift\'s first session', t);
    await P.close();
  }

  /* ---------- B-9: a change of units or gyms is never a PR ---------- */
  if (run('B-9')) {
    // Last week in kg, 70 kg x 8 (154.3 lb); now in lb: 155 lb is the nearest load over it on 5 lb steps.
    let P = await lifter({ kg: true, items: [['bench', 2, 6, 10]], log: [['2026-11-07', [['bench', [[70, 8, 2], [70, 8, 2]]]]]] });
    await start(P);
    // Rated 2, as the kg sets were: read as its own 155 lb it would be heavier and stronger (8 at 2 in reserve, 10 to failure).
    ok(e1(155, 10) > e1(70 / LB, 10), 'B-9: worked out from the rule: read as 155 lb, it would beat 70 kg x 8', [e1(155, 10), e1(70 / LB, 10)]);
    await logSet(P, 0, 0, 155, 8, 2);
    ok((await P.prToasts()).length === 0 && !(await P.gold(0, 0)), 'B-9: 155 lb x 8 after 70 kg x 8: the same load in the other unit, no PR', await P.toasts());
    let rc = await finish(P);
    ok(/No PRs this time\./.test(rc || '') && !/Heaviest yet/.test(rc || ''), 'B-9: the recap names no PR and no Heaviest yet', rc);
    let st = await stats(P);
    const bench = st.board.find(b => b.ex === 'bench');
    ok(bench && /heaviest 154\.3×8, Nov 7$/.test(bench.lines[0] || ''), 'B-9: All-time bests keeps the 70 kg set as the heaviest, first done Nov 7', bench);
    await P.close();
    // 157.5 lb is past the step 70 kg meant: heavier, and a Weight PR.
    P = await lifter({ kg: true, items: [['bench', 2, 6, 10]], log: [['2026-11-07', [['bench', [[70, 8, 2], [70, 8, 2]]]]]] });
    await start(P);
    await logSet(P, 0, 0, 157.5, 8, 2);
    const t = await P.prToasts();
    ok(/^Weight PR: Barbell Bench Press, 157\.5×8 \(heaviest before 154\.3 lb/.test(t[0] || ''), 'B-9: 157.5 lb x 8 after 70 kg x 8: a Weight PR, the heaviest before named in lb', t);
    await P.close();
  }

  /* ---------- B-10: a PR is a PR on any day ---------- */
  if (run('B-10')) {
    // A Lighter day: half the sets and lighter loads, and still a PR when the set is one.
    let P = await lifter();
    await P.page.click('#tabs [data-tab="today"]'); await wait(120);
    await P.tap('#view .hero [data-act="startAltOpen"]', 120); await P.tap('#modal [data-go="startSession"][data-light="1"]', 300);
    const light = await P.ev(() => !!window.__ironlog.state.draft.light);
    await logSet(P, 0, 0, 195, 8);
    let t = await P.prToasts();
    ok(light && /^Weight PR: Barbell Bench Press, 195×8/.test(t[0] || '') && (await P.gold(0, 0)), 'B-10: on a Lighter day, 195 x 8 is a Weight PR, said as on any day', { light, t });
    await P.close();

    // A past workout dated before every session of the lift is its first by date: 195 x 8 then is no PR, though
    // heavier than Saturday's 185.
    P = await lifter();
    await P.page.click('#tabs [data-tab="today"]'); await wait(120);
    await P.tap('#tabs [data-tab="history"]', 250);
    await P.tap('#view [data-act="pastOpen"]', 250);
    await P.page.fill('#modal [data-pbind="date"]', '2026-11-03'); await P.page.dispatchEvent('#modal [data-pbind="date"]', 'change'); await wait(150);
    await P.tap('#modal [data-act="pastGo"][data-day="0"]', 300);
    const early = await P.ev(() => { const d = window.__ironlog.state.draft; return d && d.past && d.date; });
    await logSet(P, 0, 0, 195, 8);
    const done = await P.ev(() => window.__ironlog.state.draft.ex[0].sets[0].done === true);
    ok(early === '2026-11-03' && done && (await P.prToasts()).length === 0 && !(await P.gold(0, 0)), 'B-10: a workout logged for Tuesday Nov 3, before every bench session: 195 x 8 is its first by date, no PR', { early, t: await P.toasts() });
    await P.close();

    // A past workout logged later is judged against the sessions up to its date: Monday's 195 x 8 beats last
    // Saturday's 185, and today 195 x 8 then beats nothing, Monday's being as strong.
    P = await lifter();
    await P.page.click('#tabs [data-tab="today"]'); await wait(120);
    await P.tap('[data-act="pastOpen"][data-date="2026-11-09"]', 200);
    await P.tap('#modal [data-act="pastGo"][data-day="0"]', 300);
    const past = await P.ev(() => { const d = window.__ironlog.state.draft; return d && d.past && d.date; });
    await logSet(P, 0, 0, 195, 8);
    const pastGold = await P.gold(0, 0);
    let rc = await finish(P);
    ok(past === '2026-11-09' && pastGold && /Barbell Bench Press: Weight PR, 195×8/.test(rc || ''), 'B-10: a workout logged for Monday Nov 9: 195 x 8 is a Weight PR over Saturday\'s 185, on the row and in the recap', { past, pastGold, rc });
    await P.tap('#modal button:has-text("Done")', 200);
    await start(P);
    await P.clearToasts();
    await logSet(P, 0, 0, 195, 8);
    ok((await P.prToasts()).length === 0 && !(await P.gold(0, 0)), 'B-10: today, 195 x 8 is no PR: Monday\'s is as strong', await P.toasts());
    await logSet(P, 0, 1, 200, 8);
    t = await P.prToasts();
    ok(/^Weight PR: Barbell Bench Press, 200×8 \(heaviest before 195 lb/.test(t[0] || ''), 'B-10: and 200 x 8 is one, the heaviest before being Monday\'s 195', t);
    await P.close();

    // An edit from History is judged against the sessions before it, never its own saved copy.
    P = await lifter({ log: [['2026-11-04', [['bench', [[185, 8, 2], [185, 8, 2], [185, 7, 2]]]]], ['2026-11-07', [['bench', [[195, 8, 2], [185, 8, 2], [185, 7, 2]]]]]] });
    await P.tap('#tabs [data-tab="history"]', 250);
    await P.tap('#view [data-act="histToggle"][data-id="s1"]', 200);
    await P.tap('#view [data-act="histEdit"][data-id="s1"]', 300);
    const ed = await P.ev(() => { const d = window.__ironlog.state.draft; return d && d.editingId; });
    ok(ed === 's1' && (await P.gold(0, 0)) && !(await P.gold(0, 1)), 'B-10: Saturday\'s session opened for editing: its 195 x 8 is still marked a PR, judged against the sessions before it', { ed, g0: await P.gold(0, 0) });
    rc = await finish(P);
    const st = await stats(P);
    ok(st.prs.length === 1 && /^Barbell Bench Press Weight PR 195×8 Nov 7/.test(st.prs[0] || ''), 'B-10: saved again, Recent PRs still holds its one PR', { rc, prs: st.prs });
    await P.close();
  }

  /* ---------- B-11: a New machine or gym starts the lift over ---------- */
  if (run('B-11')) {
    const P = await lifter({ log: [['2026-10-31', [['bench', [[185, 7, 2], [185, 7, 2], [135, 15, 2]]]]], ['2026-11-07', [['bench', [[185, 8, 2], [185, 8, 2], [185, 7, 2]]]]]] });
    await start(P);
    await P.tap('#view [data-act="bMenu"][data-b="0"]', 200);
    await P.tap('#modal [data-act="bMenuDo"][data-op="bNew"]', 250);
    const marked = await P.ev(() => /New machine/.test(document.getElementById('blk-0').textContent));
    await logSet(P, 0, 0, 205, 8); await logSet(P, 0, 1, 210, 8);
    ok(marked && (await P.prToasts()).length === 0 && !(await P.gold(0, 0)) && !(await P.gold(0, 1)), 'B-11: marked New machine or gym, 205 x 8 and 210 x 8, heavier than ever at the old gym: no PR, a first session there', await P.toasts());
    const rc = await finish(P);
    ok(/No PRs this time\./.test(rc || '') && !/Heaviest yet/.test(rc || ''), 'B-11: the recap names no PR and no Heaviest yet', rc);
    const st = await stats(P);
    const bench = st.board.find(b => b.ex === 'bench');
    ok(bench && new RegExp(`^best est ${lbE(e1(210, 10))} lb, Nov 11 · heaviest 210×8, Nov 11$`).test(bench.lines[0] || '') && JSON.stringify(bench.table) === JSON.stringify([['210', '8', 'Nov 11']]), 'B-11: All-time bests reads from the new gym: its best estimate and heaviest, 210 x 8, and its one rep record (none of the old gym\'s, 135 x 15 included)', bench);
    ok(st.prs.length === 1 && /^Barbell Bench Press Best estimate 247 lb Nov 7/.test(st.prs[0] || ''), 'B-11: the PR from before (Nov 7) stays in Recent PRs', st.prs);
    await P.close();
  }

  /* ---------- B-12: back after more than six months ---------- */
  if (run('B-12')) {
    const log = [['2025-03-01', [['bench', [[255, 3, 0], [255, 3, 0]]]]], ['2026-10-01', [['bench', [[185, 5, 2], [185, 5, 2]]]]], ['2026-11-07', [['bench', [[195, 5, 2], [195, 5, 2]]]]]];
    let P = await lifter({ items: [['bench', 2, 3, 6]], log });
    await start(P);
    // 205 x 5 at 2 in reserve (7 to failure): stronger than every set since the lift came back, under 255 x 3.
    ok(e1(205, 7) > e1(195, 7) && e1(205, 7) < e1(255, 3), 'B-12: worked out from the rule: 205 x 5 is above every set since the return, under 255 x 3', [e1(205, 7), e1(255, 3)]);
    await logSet(P, 0, 0, 205, 5);
    ok((await P.prToasts()).length === 0 && !(await P.gold(0, 0)), 'B-12: 205 x 5 beats every set since the return but not 255 x 3 from before the break: no PR', await P.toasts());
    let rc = await finish(P);
    ok(/Best since you came back: Barbell Bench Press 205×5/.test(rc || '') && /No PRs this time\./.test(rc || '') && !/Heaviest yet/.test(rc || ''), 'B-12: the recap says "Best since you came back: Barbell Bench Press 205×5", not a PR', rc);
    const st = await stats(P);
    const b = st.board.find(x => x.ex === 'bench');
    ok(b && b.lines[0] === `All time: best est ${lbE(e1(255, 3))} lb, Mar 1, 2025 · heaviest 255×3, Mar 1, 2025` && b.lines[1] === `Since you came back on Oct 1: best est ${lbE(e1(205, 7))} lb, Nov 11 · heaviest 205×5, Nov 11`, 'B-12: All-time bests keeps the best ever, and beside it the best since you came back on Oct 1', b && b.lines);
    await P.close();
    // The first session back says nothing of a best since: there is nothing since to beat.
    P = await lifter({ items: [['bench', 2, 3, 6]], log: log.slice(0, 1) });
    await start(P);
    await logSet(P, 0, 0, 185, 5);
    rc = await finish(P);
    ok(!/Best since you came back/.test(rc || '') && !/NEW PR/.test(rc || ''), 'B-12: the first session back has no "Best since you came back" and no PR', rc);
    await P.close();
    // A set over the best ever is a PR, as on any lift.
    P = await lifter({ items: [['bench', 2, 3, 6]], log });
    await start(P);
    await logSet(P, 0, 0, 260, 3, 0);
    const t = await P.prToasts();
    ok(/^Weight PR: Barbell Bench Press, 260×3 \(heaviest before 255 lb/.test(t[0] || ''), 'B-12: 260 x 3 beats every set ever done, 255 x 3 from before the break included: a Weight PR', t);
    await P.close();
  }

  /* ---------- B-13: bodyweight lifts are judged at the latest weigh-in (moved from tests/r32b.js's part 1) ---------- */
  if (run('B-13')) {
    // Eight weekly sessions, the same sets each time, weigh-ins drifting up.
    const DATES = ['2026-08-19', '2026-08-26', '2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30', '2026-10-07'];
    const BW = [80, 80.4, 80.1, 80.7, 81, 80.6, 81.2, 81.5];
    const seedBW = (L, bw, lists) => {
      const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg'; s.settings.rirMode = 'on'; s.draft = null;
      s.bodyweights = bw.map((kg, i) => ({ id: 'bw' + i, date: lists.dates[i], kg }));
      s.sessions = lists.dates.map((d, i) => ({ id: 's' + i, date: d, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: lists.ex.map(([exId, rr, per]) => ({ exId, rr, sets: per(i).map(([w, r]) => ({ w, r, rir: 1, done: true })) })) }));
      L.invalidate();
    };
    const mk = (id, d, exId, sets, rr, extra) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ...(extra || {}), ex: [{ exId, rr, sets: sets.map(([w, r, rir]) => ({ w, r, rir, done: true })) }] });
    const okR = (c, m, x) => ok(c, 'B-13: ' + m, x);
    const P = await open(FILE, { clock: '2026-10-07T18:00:00' });
    const r = await P.page.evaluate(([D, B, seedS, mkS]) => {
      const seedBW = eval(seedS); const mk = eval(mkS); const L = window.__ironlog; const out = {};
      const same = { dates: D, ex: [['pullup', [6, 10], () => [[0, 8], [0, 8], [0, 7]]], ['hangingLegRaise', [10, 15], () => [[0, 12], [0, 12], [0, 11]]]] };
      seedBW(L, B, same);
      out.prs = L.IDX().prs.map(p => [p.date, p.exId, p.type]); out.n30 = L.prsWithin(30).length;
      const b = L.allTimeBests('pullup'); out.front = b.front.map(f => [f.p.w, f.p.r, f.date]); out.heavy = b.heavy.date;
      const h = L.allTimeBests('hangingLegRaise'); out.hfront = h.front.map(f => [f.p.w, f.p.r, f.date]);
      // A heavier weigh-in today, then the same 8 pull-ups and 12 leg raises live.
      L.state.bodyweights.push({ id: 'bwT', date: '2026-10-08', kg: 82.4 }); L.invalidate();
      out.live8 = L.livePR('pullup', { w: 0, r: 8, rir: 1, done: true }, '2026-10-08');
      out.live12 = L.livePR('hangingLegRaise', { w: 0, r: 12, rir: 1, done: true }, '2026-10-08');
      out.live9 = L.livePR('pullup', { w: 0, r: 9, rir: 1, done: true }, '2026-10-08');
      out.live13 = L.livePR('hangingLegRaise', { w: 0, r: 13, rir: 1, done: true }, '2026-10-08');
      out.liveW = L.livePR('pullup', { w: 5, r: 8, rir: 1, done: true }, '2026-10-08');
      // Real progress still counts: a rep more in week 4, added load in week 7; leg raises a rep more in week 5.
      const grow = { dates: D, ex: [['pullup', [6, 10], i => i >= 6 ? [[5, 8], [5, 8], [5, 7]] : i >= 3 ? [[0, 9], [0, 8], [0, 8]] : [[0, 8], [0, 8], [0, 7]]], ['hangingLegRaise', [10, 15], i => i >= 4 ? [[0, 13], [0, 12], [0, 12]] : [[0, 12], [0, 12], [0, 11]]]] };
      seedBW(L, B, grow);
      out.grow = L.IDX().prs.map(p => [p.date, p.exId, p.type, p.big]);
      // Weigh-ins falling: still nothing from the scale, and the earlier real PR is kept.
      seedBW(L, B.map(v => 160 - v), grow);
      out.fall = L.IDX().prs.map(p => [p.date, p.exId, p.type, p.big]);
      // A loaded lift is judged as before.
      L.state.sessions = [mk('b1', '2026-09-30', 'bench', [[100, 8, 1], [100, 8, 1]], [6, 10]), mk('b2', '2026-10-07', 'bench', [[100, 9, 1], [100, 8, 1]], [6, 10])]; L.invalidate();
      out.bench = L.IDX().prs.map(p => [p.date, p.type, p.big]);
      out.guide = (() => { L.ACT.guideOpen({ dataset: {} }); L.state.modal = null; return /On a bodyweight lift, PRs, estimates, trends, and charts are all read at your latest weigh-in/.test(document.documentElement.innerHTML); })();
      return out;
    }, [DATES, BW, seedBW.toString(), mk.toString()]);
    okR(r.prs.length === 0 && r.n30 === 0, 'eight identical weeks with weigh-ins going up: no PRs listed or counted (r32 had 10)', r);
    okR(r.front.length === 1 && r.front[0][2] === '2026-08-19' && r.heavy === '2026-08-19', 'the bests board dates the pull-up record (8 reps) to the first session, not the heaviest day on the scale', r);
    okR(r.hfront.length === 1 && r.hfront[0][2] === '2026-08-19', 'and the leg raise record (12 reps) too', r.hfront);
    okR(r.live8 === null && r.live12 === null, 'after a weigh-in 0.9 kg up, the same 8 pull-ups and 12 leg raises are not a PR in the session', r);
    okR(!!r.live9 && !!r.live13, 'one more rep is a PR on both (' + r.live9 + ', ' + r.live13 + ')', r);
    okR(r.liveW === 'Weight PR', 'added load on pull-ups is a weight PR', r.liveW);
    const g = r.grow;
    okR(g.some(p => p[0] === '2026-09-09' && p[1] === 'pullup' && p[3]) && g.some(p => p[0] === '2026-09-30' && p[1] === 'pullup' && p[2] === 'Weight PR'), 'real progress still counts: 9 pull-ups (Sep 9) and +5 kg (Sep 30, a weight PR)', g);
    okR(g.some(p => p[0] === '2026-09-16' && p[1] === 'hangingLegRaise' && p[2] === 'Rep PR' && p[3]), 'and 13 leg raises (Sep 16) is a counted rep PR', g);
    okR(g.filter(p => p[1] === 'pullup').length === 2 && g.filter(p => p[1] === 'hangingLegRaise').length === 1, 'and nothing else: one PR per real change, none from the scale', g);
    okR(JSON.stringify(r.fall) === JSON.stringify(g), 'with weigh-ins going down instead, the same PRs, no more and none lost', { fall: r.fall, grow: g });
    okR(r.bench.length === 1 && r.bench[0][0] === '2026-10-07' && r.bench[0][2], 'a loaded lift is judged as before: bench 100 x 9 after 100 x 8 is a counted PR', r.bench);
    okR(r.guide, 'the Guide says bodyweight PRs (and, since r34, estimates, trends, and charts) are read at the latest weigh-in');

    // Through the screen: a session on the heavier day, tick 8 then 9 pull-ups.
    const ui = await P.page.evaluate(([D, B, seedS]) => {
      const seedBW = eval(seedS); const L = window.__ironlog;
      seedBW(L, B, { dates: D, ex: [['pullup', [6, 10], () => [[0, 8], [0, 8], [0, 7]]]] });
      L.state.bodyweights.push({ id: 'bwT', date: '2026-10-07', kg: 82.4 });
      const R = L.state.routines[0]; R.days[0].items = [{ uid: 'p', exId: 'pullup', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.5, ss: null }];
      L.state.sessions = L.state.sessions.filter(s => s.date < '2026-10-07'); L.invalidate();
      L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } });
      return true;
    }, [DATES, BW, seedBW.toString()]);
    const tick = async (si, reps) => {
      await P.page.fill(`.sg input[data-f="r"][data-b="0"][data-s="${si}"]`, String(reps));
      await P.page.click(`[data-act="sDone"][data-b="0"][data-s="${si}"]`); await P.page.waitForTimeout(150);
      return P.page.evaluate(s => { const b = document.querySelector(`[data-act="sDone"][data-b="0"][data-s="${s}"]`); const row = b && b.closest('.sg'); return row ? row.classList.contains('pr') : null; }, si);
    };
    okR(ui && (await tick(0, 8)) === false, 'on screen, 8 pull-ups on a heavier day: no PR mark on the row');
    okR((await tick(1, 9)) === true, 'on screen, 9 pull-ups: the row is marked a PR');
    okR(!P.errors.length, 'part 1 ran with no page errors', P.errors);
    await P.browser.close();
  }

  /* ---------- B-14: one count of PRs, the last 28 days with today ---------- */
  if (run('B-14')) {
    // PRs on Oct 14 (28 days before today: outside the window) and Oct 15 (inside it); the log starts Oct 7, so the
    // 28 days before the window are not covered and Stats shows no "was".
    const P = await lifter({ items: [['bench', 2, 6, 10]], log: [['2026-10-07', [['bench', [[185, 8, 2], [185, 8, 2]]]]], ['2026-10-14', [['bench', [[190, 8, 2], [190, 8, 2]]]]], ['2026-10-15', [['bench', [[195, 8, 2], [195, 8, 2]]]]]] });
    // At a glance, shown from the chip at the foot of Today where a new install keeps it hidden.
    const tile = async () => {
      if (await P.ev(() => !!document.querySelector('#view [data-act="secShow"][data-k="today:tiles"]'))) await P.tap('#view [data-act="secShow"][data-k="today:tiles"]', 250);
      return P.ev(() => { const t = [...document.querySelectorAll('#view .tile')].find(x => /PRs, last 4 weeks/.test(x.textContent)); return t ? { v: t.querySelector('.tv').textContent.trim(), aria: t.getAttribute('aria-label') } : null; });
    };
    let tl = await tile();
    ok(tl && tl.v === '1' && /^1 PRs in the last 4 weeks/.test(tl.aria), 'B-14: Today\'s tile counts Oct 15\'s PR and not Oct 14\'s, 28 days before: 1', tl);
    let st = await stats(P);
    ok(st.kpi && st.kpi.v === '1' && st.kpi.l === 'PRs, last 4 weeks' && /^1 in 4 weeks$/.test(st.prsSub || ''), 'B-14: Stats says the same 1, with no "was" (the log does not cover the 28 days before), and Recent PRs "1 in 4 weeks"', { kpi: st.kpi, sub: st.prsSub });
    ok(st.prs.length === 2, 'B-14, B-15: Recent PRs still lists both (it lists, the count counts the window)', st.prs);
    await P.tap('#tabs [data-tab="history"]', 250);
    const hist = await P.ev(() => [...document.querySelectorAll('#view .prb')].map(b => b.getAttribute('aria-label')));
    ok(hist.length === 2 && hist.every(a => a === '1 PR smashed'), 'B-14: History marks each of the two sessions "1 PR smashed"', hist);
    // A PR today joins the count everywhere.
    await start(P);
    await logSet(P, 0, 0, 200, 8);
    await finish(P);
    await P.tap('#modal button:has-text("Done")', 200);
    await P.tap('#tabs [data-tab="today"]', 250);
    tl = await tile();
    st = await stats(P);
    ok(tl && tl.v === '2' && st.kpi && st.kpi.v === '2' && /^2 in 4 weeks$/.test(st.prsSub || ''), 'B-14: a Weight PR today makes 2 on Today, on Stats and in Recent PRs', { tl, kpi: st.kpi, sub: st.prsSub });
    await P.close();
  }

  /* ---------- B-15: Recent PRs, newest first, fifteen at most ---------- */
  if (run('B-15')) {
    // Seventeen weekly sessions, each 5 lb heavier for the same reps: each a counted Weight PR after the first.
    const log = []; for (let k = 0; k < 17; k++) log.push([new Date(Date.UTC(2026, 6, 15 + 7 * k)).toISOString().slice(0, 10), [['bench', [[150 + 5 * k, 8, 2]]]]]);
    const P = await lifter({ items: [['bench', 1, 6, 10]], log });
    const st = await stats(P);
    ok(st.prs.length === 15 && /Weight PR 230×8 Nov 4$/.test(st.prs[0]) && /Weight PR 160×8 Jul 29$/.test(st.prs[14]), 'B-15: 16 PRs, the 15 newest listed, newest first: 230 x 8 on Nov 4 down to 160 x 8 on Jul 29', st.prs);
    ok(st.prs.every(x => /^Barbell Bench Press Weight PR \d+×8 [A-Z][a-z]{2} \d+$/.test(x)), 'B-15: each line the lift, its tag, the set and its date', st.prs.slice(0, 3));
    await P.close();
  }

  /* ---------- B-16: All-time bests ---------- */
  if (run('B-16')) {
    // Rep records: for each load the most reps where no heavier set did as many; a warm-up and a drop set left out.
    const P = await lifter({ items: [['bench', 3, 6, 10]], log: [
      ['2026-10-01', [['bench', [[225, 3, 2, 'w'], [185, 8, 2], [175, 10, 2]]]]],
      ['2026-10-08', [['bench', [[205, 5, 2], [195, 5, 2], [155, 15, 2, 'd']]]]]] });
    const st = await stats(P);
    const b = st.board.find(x => x.ex === 'bench');
    ok(b && JSON.stringify(b.table) === JSON.stringify([['205', '5', 'Oct 8'], ['185', '8', 'Oct 1'], ['175', '10', 'Oct 1']]), 'B-16: the rep records, heaviest first: 205 x 5, 185 x 8 and 175 x 10, each dated first done; 195 x 5 matched by a heavier set, the warm-up and the drop set left out', b && b.table);
    ok(b && b.lines[0] === `best est ${lbE(e1(185, 10))} lb, Oct 1 · heaviest 205×5, Oct 8` && b.est === 'Best estimate from 185×8.', 'B-16: its best estimate (185 x 8, 247) and its heaviest (205 x 5), each with its date, and the set the estimate is from', b);
    await P.close();
  }
  if (run('B-16')) {
    // Seven lifts: the six with the newest records first, the seventh a tap away.
    const ids = ['bench', 'ohp', 'bbRow', 'backSquat', 'deadlift', 'legPress', 'latPulldown'];
    const P = await lifter({ items: [['bench', 1, 6, 10]], log: ids.map((id, k) => [`2026-10-0${k + 1}`, [[id, [[100, 8, 2]]]]]) });
    let st = await stats(P);
    const shown = st.board.map(x => x.ex);
    ok(JSON.stringify(shown) === JSON.stringify(ids.slice(1).reverse()), 'B-16: six lifts shown, the newest record first (the bench, oldest, is the one left for later)', shown);
    await P.tap('#view [data-act="bestsAll"]', 250);
    st = await stats(P);
    ok(st.board.length === 7 && st.board[6].ex === 'bench', 'B-16: "Show all 7 lifts" shows the seventh', st.board.map(x => x.ex));
    await P.close();
  }

  /* ---------- B-20: a workout's effort is read as of its day ---------- */
  if (run('B-20')) {
    /* RC-3 (387-C6, NEW-71, R75-5; V's go 2026-11-12): a blank effort reads the lift's usual effort, and a rated one,
       with Corrected RIR on, its correction, each from the 12 weeks before the workout's own day, never as of today:
       nothing logged that day or after moves a workout's numbers, so a set reads the same as it is ticked, in the
       recap and on every list (R75-1). Until a lift has a usual effort, its blanks read its first one once it forms,
       so a lifter who starts rating sees no step in the lift's history. Estimates in kg here: Brzycki to 10 reps to
       failure, Epley at 11 and 12, shown to the half kilo. */
    const kgE = v => String(Math.round(v * 2) / 2);
    const bench = st => st.board.find(b => b.ex === 'bench');
    {
      // 387-C6: Sep 15's 102.5 x 8, blank, read with Sep 1 and 8's effort (2 in reserve on six sets): 10 to failure.
      // October's sets at 0 and today's change the usual of today's weeks, never Sep 15's.
      const P = await lifter({ kg: true, settings: { unit: 'kg' }, items: [['bench', 3, 6, 10]], log: [
        ['2026-09-01', [['bench', [[100, 8, 2], [100, 8, 2], [100, 8, 2]]]]], ['2026-09-08', [['bench', [[100, 8, 2], [100, 8, 2], [100, 8, 2]]]]],
        ['2026-09-15', [['bench', [[102.5, 8, null], [102.5, 8, null], [102.5, 8, null]]]]],
        ['2026-10-06', [['bench', [[90, 8, 0], [90, 8, 0], [90, 8, 0]]]]], ['2026-10-13', [['bench', [[90, 8, 0], [90, 8, 0], [90, 8, 0]]]]]] });
      const want = `best est ${kgE(e1(102.5, 10))} kg, Sep 15`;
      let st = await stats(P);
      const before = bench(st) && bench(st).lines[0];
      await start(P);
      for (let k = 0; k < 3; k++) await logSet(P, 0, k, 90, 8, 0);
      await finish(P);
      st = await stats(P);
      const after = bench(st) && bench(st).lines[0];
      ok(before && before.startsWith(want) && after && after.startsWith(want), `B-20: Sep 15's 102.5 x 8, blank, reads the effort of the weeks before it (2 in reserve): "${want}", before and after October's and today's sets at 0 (387-C6)`, { before, after });
      await P.close();
    }
    {
      // NEW-71: with Corrected RIR on, Sep 15's 100 x 8 rated 2 is corrected only by RIR checks up to Sep 15: none, so
      // read as rated (10 to failure). October's two checks, each a rep under-called, correct later workouts' ratings.
      const chk = { cal: { at: 8, pred: 2 } };
      const P = await lifter({ kg: true, settings: { unit: 'kg', rirMode: 'cal' }, items: [['bench', 3, 6, 10]], log: [
        ['2026-09-15', [['bench', [[100, 8, 2], [100, 8, 2], [100, 8, 2]]]]],
        ['2026-10-06', [['bench', [[70, 11, 0, chk]]]]], ['2026-10-13', [['bench', [[70, 11, 0, chk]]]]]] });
      const st = await stats(P);
      const line = bench(st) && bench(st).lines[0];
      ok(line && line.startsWith(`best est ${kgE(e1(100, 10))} kg, Sep 15`), `B-20: with Corrected RIR on, Sep 15's 100 x 8 rated 2 is read as rated, no RIR check being in by its day: "best est ${kgE(e1(100, 10))} kg, Sep 15" (NEW-71: October's checks moved it)`, line);
      await P.close();
    }
    {
      /* R75-5: four sets rated 0 today, then 105 x 8 left blank. It reads the usual of the weeks before today (100 x 8 at
         2, three sets), 10 to failure, past 100 x 8 at 2: a PR, said alike by its row, its toast and the recap. Read
         with today's ratings once saved and without them while open, the row announced a PR the recap did not count. */
      ok(e1(105, 10) > e1(100, 10), 'B-20: worked out from the rule: 105 x 8 read at 2 in reserve is stronger than 100 x 8 at 2', [e1(105, 10), e1(100, 10)]);
      const P = await lifter({ kg: true, settings: { unit: 'kg' }, items: [['bench', 5, 6, 10]], log: [['2026-11-04', [['bench', [[100, 8, 2], [100, 8, 2], [100, 8, 2]]]]]] });
      await start(P);
      for (let k = 0; k < 4; k++) await logSet(P, 0, k, 100, 8, 0);
      await P.clearToasts();
      await logSet(P, 0, 4, 105, 8);
      const t = await P.prToasts(), gold = await P.gold(0, 4);
      const rc = await finish(P);
      ok(t.length === 1 && /Barbell Bench Press, 105×8/.test(t[0]) && gold && /NEW PR/.test(rc || '') && /Barbell Bench Press/.test(rc || '') && !/Heaviest yet/.test(rc || ''), 'B-20: 105 x 8 left blank after four sets rated 0 today: read at the usual of the weeks before (2), a PR on its row, in its toast and in the recap alike (R75-5)', { t, gold, rc });
      await P.close();
    }
    {
      // A lifter who starts rating: Sep 1 and 8 blank, Oct 6 rated 2 (the lift's first usual). The earlier blanks read
      // it too, so the lift's estimate is the same 100 x 8 throughout and its best was first reached Sep 1.
      const P = await lifter({ kg: true, settings: { unit: 'kg' }, items: [['bench', 3, 6, 10]], log: [
        ['2026-09-01', [['bench', [[100, 8, null], [100, 8, null], [100, 8, null]]]]], ['2026-09-08', [['bench', [[100, 8, null], [100, 8, null], [100, 8, null]]]]],
        ['2026-10-06', [['bench', [[100, 8, 2], [100, 8, 2], [100, 8, 2]]]]]] });
      const st = await stats(P);
      const line = bench(st) && bench(st).lines[0];
      ok(line && line.startsWith(`best est ${kgE(e1(100, 10))} kg, Sep 1`), `B-20: a lift first rated Oct 6 reads its earlier blanks at that first usual effort: "best est ${kgE(e1(100, 10))} kg, Sep 1", no step when rating starts`, line);
      await P.close();
      {
      /* R75-4, a guard (the review of 2.29's first try): a lift's first rated day, Oct 6, three sets at 2 and 102.5 x 8
         left blank. The blank reads the usual first formed that day (2), and a later, lighter workout at 0 leaves it. */
      const P = await lifter({ kg: true, settings: { unit: 'kg' }, items: [['bench', 4, 6, 10]], log: [
        ['2026-10-06', [['bench', [[100, 8, 2], [100, 8, 2], [100, 8, 2], [102.5, 8, null]]]]]] });
      const want = `best est ${kgE(e1(102.5, 10))} kg, Oct 6`;
      const before = (b => b && b.lines[0])(bench(await stats(P)));
      await P.ev(() => {
        const L = window.__ironlog; const s0 = L.state.sessions[0];
        L.state.sessions.push({ ...JSON.parse(JSON.stringify(s0)), id: 'later', date: '2026-10-13', ex: [{ ...JSON.parse(JSON.stringify(s0.ex[0])), sets: [0, 1, 2].map(() => ({ w: 80, r: 8, rir: 0, warm: false, drop: false })) }] });
        L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); L.render();
      });
      const after = (b => b && b.lines[0])(bench(await stats(P)));
      ok(before && before.startsWith(want) && after && after.startsWith(want), `B-20: a lift's first rated day reads its blank at the usual first formed that day: "${want}", before and after a later, lighter workout (R75-4)`, { before, after });
      await P.close();
    }
    {
      /* R75-3, a guard (the review of 2.29's first try): History's Edit moving Sep 8's workout, its three sets rated 0, to
         Sep 22. Open, it reads the weeks before Sep 22 without its own saved copy: Sep 1's three sets at 2, a usual of 2,
         as it reads once saved there. Its own Sep 8 ratings read in, the usual would be 1. */
      const P = await lifter({ kg: true, settings: { unit: 'kg' }, items: [['bench', 3, 6, 10]], log: [
        ['2026-09-01', [['bench', [[100, 8, 2], [100, 8, 2], [100, 8, 2]]]]], ['2026-09-08', [['bench', [[100, 8, 0], [100, 8, 0], [100, 8, 0]]]]]] });
      const r = await P.ev(() => {
        const L = window.__ironlog; const id = L.state.sessions[1].id;
        const open = L.rirUsual('bench', { id: 'edit', date: '2026-09-22', editingId: id });
        L.state.sessions[1].date = '2026-09-22'; L.state = L.normalize(L.state); L.invalidate();
        return { open, saved: L.rirUsual('bench', '2026-09-22') };
      });
      ok(r.open === 2 && r.saved === 2, 'B-20: an edit moved to a later day reads its effort without its own saved copy, as once saved there (R75-3)', r);
      await P.close();
    }
  }
  }

  /* ---------- B-17, B-18 and B-19: while training, before the app, and the Guide (moved from this suite's r47 checks) ---------- */
  const { engine } = require('./h');
  const CLOCK = '2026-10-15T10:00:00';
  const browser = await engine.launch();

  // B-17: the heaviest set shows while you train the lift.
  if (run('B-17')) {
    const P = await open(FILE, { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.render();
      document.querySelector('[data-act="startSession"]').click(); L.render();
      return L.state.draft.ex.map((b, i) => ({ lift: L.EX(b.exId).name, line: L.bestLine(b.exId),
        onScreen: /Heaviest /.test(document.getElementById('blk-' + i).textContent) }));
    });
    ok(r.length > 0 && r.every(x => x.line && x.onScreen), 'B-17: every lift with history shows its heaviest set during the session', r.filter(x => !x.onScreen).slice(0, 2));
    ok(r.every(x => /^Heaviest /.test(x.line)), 'B-17: in the words the bests board uses, not a new name for it', r.map(x => x.line).slice(0, 2));
    ok(!P.errors.length, 'B-17: no page errors (heaviest on screen)', P.errors);
    await P.ctx.close();
  }

  // B-17: its date shows only when it adds something: not when the Last line beside it already says it.
  if (run('B-17')) {
    const P = await open(FILE, { browser, clock: CLOCK });
    const r = await P.page.evaluate((lb) => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.makeDemo();
      const ss = L.sortedSessions(); const first = ss[0];
      // A much heavier bench, long before the lift's last session.
      first.ex.push({ exId: 'bench', rr: [3, 5], sets: [{ w: 315 * lb, r: 3, rir: 0, done: true }] });
      L.state = L.normalize(L.state); L.invalidate(); L.saveNow();
      const exps = L.IDX().byEx.bench || [];
      return { old: L.bestLine('bench'), oldDate: first.date, newestExposure: exps.length ? exps[exps.length - 1].date : null,
        sameSession: L.bestLine(L.sortedSessions()[L.sortedSessions().length - 1].ex[0].exId) };
    }, LB);
    ok(/Heaviest 315×3, /.test(r.old), 'B-17: a best from an older session carries its date', r);
    ok(r.sameSession && !/, /.test(r.sameSession.replace('Heaviest ', '')), 'B-17: a best from the lift\'s last session leaves the date off, since the Last line already shows it', r.sameSession);
    ok(!P.errors.length, 'B-17: no page errors (dates)', P.errors);
    await P.ctx.close();
  }

  // B-18: a lifter who starts fresh can still bring in what they did before the app.
  if (run('B-18')) {
    const P = await open(FILE, { browser, clock: CLOCK });
    const r = await P.page.evaluate((lb) => { const L = window.__ironlog;
      L.state = L.normalize(null); L.state.settings.onboarded = true; L.state.settings.unit = 'lb'; L.invalidate(); L.saveNow();
      L.ui.tab = 'today'; L.render();
      const offered = document.getElementById('preApp');
      const before = L.allTimeBests('bench');
      // What Log a past workout saves: a freestyle session on an earlier date.
      L.state.sessions = [{ id: 'old', date: '2025-06-01', dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', notes: '', free: true,
        ex: [{ exId: 'bench', rr: [3, 5], sets: [{ w: 225 * lb, r: 5, rir: 0, done: true }] }] }];
      L.state = L.normalize(L.state); L.invalidate(); L.saveNow();
      const after = L.allTimeBests('bench');
      const sg = L.suggest('bench', L.planFor('bench'));
      L.ui.tab = 'dash'; L.ui.folds['dash:lifts'] = true; L.ui.dashEx = 'bench'; L.render();
      document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render();
      return { offeredOnToday: !!(offered && offered.querySelector('[data-act="pastOpen"]')),
        before: !!before, heaviest: after && after.heavy ? Math.round(after.heavy.p.w / lb) : null,
        estimate: after && after.est ? Math.round(after.est.v / lb) : null,
        engineRead: L.whyTarget(sg), statsShows: /225/.test(document.getElementById('view').textContent) };
    }, LB);
    ok(r.offeredOnToday, 'B-18: with nothing logged, Today says where lifts done before the app go');
    ok(!r.before && r.heaviest === 225 && r.estimate > 225, 'B-18: a pre-app session becomes a real best: heaviest 225, an estimate above it', r);
    ok(r.statsShows, 'B-18: and it shows under Stats', r.statsShows);
    /* The engine reads it as a lift back after a long break, 16 months: it starts fresh, said as the time away, and
       nothing from before the break is asked (NEW-110, V 2026-11-10: an old best is never made a goal). Until 2.47
       it started from it, at 90% of 225, as after a break of weeks (r47). */
    ok(/^Back after 16 months: pick a load/.test(r.engineRead) && !/225|205|200/.test(r.engineRead), 'B-18: the engine reads it as a lift back after 16 months: it starts fresh, nothing from before asked', r.engineRead);
    ok(!P.errors.length, 'B-18: no page errors (pre-app lifts)', P.errors);
    await P.ctx.close();
  }

  // B-19: the Guide tells a target and a record apart, and says what a PR is as the screens count one.
  if (run('B-19')) {
    const P = await open(FILE, { browser, clock: CLOCK });
    const g = await P.page.evaluate(() => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.saveNow(); L.ACT.guideOpen({ dataset: { topic: 'rules' } });
      return (document.getElementById('modal') || {}).textContent.replace(/\s+/g, ' ');
    });
    ok(/A target is not a record/.test(g), 'B-19: the Guide says a target is not a record');
    ok(/what to beat in today's session/.test(g) && /best you have ever done/.test(g), 'B-19: and says what each one is', g.slice(0, 60));
    ok(/Log a past workout/.test(g), 'B-19: and where lifts from before the app go', g.slice(0, 60));
    /* NEW-135 (found building 2.54): the Guide said only a PR with a new best estimate is counted, and that more reps
       without one are named in the recap as heaviest yet. A set stronger than every earlier one is counted, a rep more
       past 12 reps to failure included (R72-4, V 2026-11-04: B-2, B-3), and only a heavier set is named heaviest yet (B-6). */
    ok(/Only a set stronger than every earlier one is announced and counted/.test(g) && !/Only a PR with a new best estimate is announced and counted/.test(g), 'B-19: the Guide says only a set stronger than every earlier one is announced and counted (NEW-135: "Only a PR with a new best estimate")', (g.match(/Only a[^.]*\./) || [])[0]);
    ok(/A heavier set that is not stronger is named in the recap as heaviest yet/.test(g) && !/a heavier set or more reps without one/.test(g), 'B-19: and that a heavier set that is not stronger is named heaviest yet, never more reps (NEW-135)', (g.match(/[^.]*heaviest yet[^.]*\./) || [])[0]);
    ok(!P.errors.length, 'B-19: no page errors (guide)', P.errors);
    await P.ctx.close();
  }

  // B-16 and B-17: a record from another year says its year wherever a best is shown (NEW-111, found building 2.47:
  // All-time bests and the heaviest line in a session read a 315 x 1 from 2016 as "Mar 1", this year's).
  if (run('B-16') || run('B-17')) {
    const P = await open(FILE, { browser, clock: CLOCK });
    const r = await P.page.evaluate((lb) => { const L = window.__ironlog; const S = L.state;
      S.settings.onboarded = true; S.settings.unit = 'lb';
      S.routines = [{ id: 'R1', name: 'Mine', schedule: 'weekly', days: [{ id: 'd1', name: 'Push', items: [{ uid: 'u1', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 150, ss: null }] }] }];
      S.activeRoutineId = 'R1';
      const one = (id, date, w, r) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', notes: '', free: true, ex: [{ exId: 'bench', rr: [1, 5], sets: [{ w: w * lb, r, rir: 0, done: true }] }] });
      S.sessions = [one('a', '2016-03-01', 315, 1), one('b', '2026-10-01', 185, 5)];
      L.state = L.normalize(S); L.invalidate(); L.saveNow();
      const d = document.createElement('div'); d.innerHTML = L.bestsBoard().html;
      const sum = d.querySelector('.bx[data-ex="bench"] summary .bs');
      // The rep records, heaviest first: 315 x 1 from 2016 is the first row under the header.
      const cell = d.querySelector('.bx[data-ex="bench"] table tr:nth-child(2) td:last-child');
      L.ui.tab = 'today'; L.ui.folds['today:session'] = true; L.render();
      const pv = document.querySelector('#view .pvbest');
      return { line: L.bestLine('bench'), board: sum ? sum.textContent : null, table: cell ? cell.textContent : null, preview: pv ? pv.textContent : null };
    }, LB);
    ok(/, Mar 1, 2016$/.test(r.line), 'B-17: the heaviest line in a session says the year of a 2016 record (2.46: "Mar 1")', r);
    ok(/heaviest 315×1, Mar 1, 2016$/.test(r.board) && /2016/.test(r.table || ''), 'B-16: All-time bests says it, in the row and in its table of rep records', r);
    ok(/Mar 1, 2016$/.test(r.preview || ''), 'B-17: and Today\'s workout preview names the best with its year', r);
    ok(!P.errors.length, 'B-16, B-17: no page errors (years)', P.errors);
    await P.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
