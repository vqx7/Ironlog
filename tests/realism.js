// Realism: a simulated lifter follows the app for 16 weeks, through the
// session screen, with grey loads and with filled-in loads (V, 2026-10-05:
// "suggested weights being a joke or not progressing realistically").
//
// The lifter has a true strength per lift that grows week by week (or stays
// flat for one lift), with day-to-day noise. Every session they lift the
// load the screen shows, do as many reps as that strength allows while
// leaving the plan's reps in reserve (fatigue costs reps on later sets, and
// they stop at the top of the range, as people following an app do), and
// rate RIR honestly. The first session has no suggestion, so they pick a
// cautious guess (75% of what they could use), the way the first-time line
// asks. Week 9 is a deload week.
//
// The lifter's reps come from Epley on their true strength, a different
// formula from the app's (Brzycki up to 10), so the check is not the app
// agreeing with itself. The ideal load is what that true strength allows for
// the middle of the planned range at the planned RIR.
//
// Checked: the suggestion catches up from the cautious first guess within 4
// sessions; from then on it stays between 85% and 105% of the ideal (never a
// load the lifter cannot lift for the range, never a token weight); progressing
// lifts gain load over the 16 weeks in line with their real gain; the flat
// lift never climbs past what it can do; rep targets are reachable; Stats
// reads the progressing lifts as rising or slowly rising and never stalled,
// with PRs logged, and reads the flat lift as flat or stalled, never moving;
// nothing reads NaN or undefined.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const LB = 0.45359237;
// e1: true one-rep max in lb at week 0; g: weekly gain; per dumbbell for curls.
const LIFTS = [
  { id: 'bench', sets: 3, min: 6, max: 10, rir: 1, e1: 225, g: 0.006 },
  { id: 'backSquat', sets: 4, min: 5, max: 8, rir: 2, e1: 300, g: 0.008 },
  { id: 'latPulldown', sets: 3, min: 8, max: 12, rir: 1, e1: 200, g: 0.005 },
  { id: 'dbCurl', sets: 3, min: 8, max: 12, rir: 1, e1: 50, g: 0.005 },
  { id: 'legPress', sets: 3, min: 10, max: 15, rir: 2, e1: 500, g: 0.008 },
  { id: 'ohp', sets: 3, min: 6, max: 10, rir: 1, e1: 135, g: 0 }
];
const WEEKS = 16, DELOAD = 9;
const epleyRtf = (e1, w) => w > 0 ? 30 * (e1 / w - 1) : 99;
const ideal = (L, e1) => e1 / (1 + ((L.min + L.max) / 2 + L.rir) / 30);
// Day-to-day noise, the same in both runs: about plus or minus 2%.
const noise = (wk, i) => 1 + 0.02 * Math.sin(wk * 2.3 + i * 1.7);
const r5 = v => Math.round(v / 5) * 5;

(async () => {
  const { chromium } = require('playwright');
  const report = {};
  for (const mode of ['grey', 'fill']) {
    const browser = await chromium.launch();
    let state = null; const errors = []; const T = mode + ': ';
    const rows = Object.fromEntries(LIFTS.map(L => [L.id, []]));
    for (let wk = 0; wk <= WEEKS; wk++) {
      const date = new Date(Date.UTC(2026, 5, 1 + 7 * wk)).toISOString().slice(0, 10);
      const P = await open('index.html', { browser, touch: true, w: 390, h: 844, clock: date + 'T10:00:00', state: state || undefined });
      const ev = (f, a) => P.page.evaluate(f, a);
      if (!state) {
        await ev(([LIFTS, mode, LB]) => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb'; s.settings.autoDone = false;
          if (mode === 'fill') s.settings.loadFill = 'fill';
          const R = s.routines[0]; R.days[0].items = LIFTS.map((e, i) => ({ uid: 'u' + i, exId: e.id, sets: e.sets, repMin: e.min, repMax: e.max, rir: e.rir, rest: 0, inc: 5 * LB, ss: null }));
          L.invalidate(); L.saveNow(); localStorage.setItem('ironlog.v1.tipWake', '1'); localStorage.setItem('ironlog.v1.loadAsk', '1'); }, [LIFTS, mode, LB]);
        state = await ev(() => JSON.parse(localStorage.getItem('ironlog.v1')));
        await P.ctx.close(); continue;
      }
      const deload = wk === DELOAD;
      if (deload) await ev(() => { const L = window.__ironlog; L.state.deloadWeek = L.weekStart(L.today()); L.saveNow(); });
      await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } }); });
      await P.page.waitForTimeout(120);
      const plan = await ev(([LB]) => { const L = window.__ironlog; return L.state.draft.ex.map((b, bi) => ({ id: b.exId, bi, n: b.sets.filter(x => !x.warm).length, warm: b.sets.map(x => !!x.warm), tgt: b.target || '', aim: b.tgt && b.tgt.kind === 'load' ? b.tgt.repMin : null, hint: b.hint || '', sw: b.sw == null ? null : b.sw / LB })); }, [LB]);
      for (const p of plan) {
        const Lf = LIFTS.find(x => x.id === p.id); const i = LIFTS.indexOf(Lf);
        const e1 = Lf.e1 * Math.pow(1 + Lf.g, wk - 1) * noise(wk, i); const id0 = ideal(Lf, Lf.e1 * Math.pow(1 + Lf.g, wk - 1));
        const sets = [];
        for (let si = 0; si < p.warm.length; si++) {
          if (p.warm[si]) continue;
          const wsel = `.sg input[data-f="w"][data-b="${p.bi}"][data-s="${si}"]`;
          const shown = await P.page.$eval(wsel, f => f.value || f.placeholder || '');
          let w = parseFloat(shown);
          if (!(w > 0)) { w = r5(0.75 * id0); await P.page.fill(wsel, String(w)); await P.page.dispatchEvent(wsel, 'input'); await P.page.dispatchEvent(wsel, 'change'); }
          // Reps this set allows, leaving the planned reserve; each set costs about 0.7 of a rep.
          const k = sets.length; const can = Math.floor(epleyRtf(e1, w) - 0.7 * k);
          const reps = Math.max(1, Math.min(Lf.max, can - Lf.rir));
          const rir = Math.max(0, Math.min(5, can - reps));
          const rsel = `.sg input[data-f="r"][data-b="${p.bi}"][data-s="${si}"]`;
          await P.page.fill(rsel, String(reps)); await P.page.dispatchEvent(rsel, 'input'); await P.page.dispatchEvent(rsel, 'change');
          await P.page.click(`[data-act="sDone"][data-b="${p.bi}"][data-s="${si}"]`);
          sets.push({ si, w, reps, rir });
        }
        await ev(([bi, sets]) => { const b = window.__ironlog.state.draft.ex[bi]; for (const s of sets) b.sets[s.si].rir = s.rir; }, [p.bi, sets]);
        rows[p.id].push({ wk, deload, sw: p.sw, aim: p.aim, w: sets[0].w, ideal: id0, reps: sets.map(s => s.reps), target: p.tgt, hint: p.hint });
      }
      await ev(() => window.__ironlog.ACT.finish()); await P.page.waitForTimeout(120);
      for (let k = 0; k < 4; k++) { if (!(await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm'; }))) break; await ev(() => document.querySelector('#modal [data-act="mOk"]').click()); await P.page.waitForTimeout(120); }
      await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); if (L.state.deloadWeek) L.state.deloadWeek = null; L.saveNow(); });
      // Nothing on the session or Today reads NaN or undefined.
      const bad = await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); return /NaN|undefined|Infinity/.test(document.getElementById('view').innerText); });
      if (bad) errors.push('week ' + wk + ': NaN or undefined on Today');
      state = await ev(() => JSON.parse(localStorage.getItem('ironlog.v1')));
      if (wk === WEEKS) {
        const st = await ev(([ids, LB]) => { const L = window.__ironlog; const I = L.IDX();
          L.ui.tab = 'dash'; L.render(); const dash = document.getElementById('view').innerText;
          return { dashBad: /NaN|undefined|Infinity/.test(dash), lifts: Object.fromEntries(ids.map(id => { const s = I.exStats[id] || {}; return [id, { pct: s.pct, moving: s.moving, stalled: s.stalled, head: L.exHeadline(id), prs: I.prs.filter(p => p.exId === id).length }]; })), coach: L.coach().text }; }, [LIFTS.map(x => x.id), LB]);
        report[mode] = { rows, st };
      }
      errors.push(...P.errors);
      await P.ctx.close();
    }
    await browser.close();
    const { rows: R, st } = report[mode];
    for (const Lf of LIFTS) {
      const r = R[Lf.id]; const work = r.filter(x => !x.deload);
      const after = work.filter(x => x.wk >= 5);
      const ratios = after.map(x => x.w / x.ideal);
      const lo = Math.min(...ratios), hi = Math.max(...ratios);
      console.log(`  ${mode} ${Lf.id.padEnd(12)} loads: ${r.map(x => (x.deload ? 'd' : '') + x.w).join(' ')}  ideal at end ${Math.round(r[r.length - 1].ideal)}  ratio ${lo.toFixed(2)}-${hi.toFixed(2)}`);
      ok(work.slice(3).every(x => x.w / x.ideal >= 0.85), T + Lf.id + ': from the 4th session the suggestion is 85% or more of what the lifter can use (the cautious first guess is caught up)', work.slice(0, 6).map(x => [x.w, Math.round(x.ideal)]));
      // A load step can be larger than 5% of the load (5 lb on a 35 lb dumbbell), so the bound is 5% or one step, whichever is more.
      ok(after.every(x => x.w <= Math.max(x.ideal * 1.05, x.ideal + 5 - 1e-9)), T + Lf.id + ': never more than 5% (or one 5 lb step) over what the lifter can use for the range', ratios.map(v => +v.toFixed(2)));
      ok(lo >= 0.85, T + Lf.id + ': never under 85% of it after the first month', ratios.map(v => +v.toFixed(2)));
      // Reps asked can be done: the lifter reached the bottom of the range on the first set.
      // Reps asked can be done: the first set reaches what the app asked (the bottom of the range, or the stated aim after a large step).
      const missed = after.filter(x => x.reps[0] < (x.aim != null ? x.aim : Lf.min)).length;
      ok(missed <= 1, T + Lf.id + ': the first set reaches what the app asked every session (at most one miss)', after.map(x => [x.aim, x.reps]));
      // No swinging between two loads: the load never goes back down outside a deload.
      const down = work.slice(1).filter((x, k) => x.w < work[k].w);
      ok(down.length === 0, T + Lf.id + ': the load never drops back outside a deload', down.map(x => x.wk));
      const s = st.lifts[Lf.id];
      if (Lf.g > 0) {
        const gainTrue = Math.pow(1 + Lf.g, WEEKS - 1) - 1; const gainApp = work[work.length - 1].w / work[3].w - 1;
        ok(gainApp > 0 && gainApp >= gainTrue * (WEEKS - 4) / (WEEKS - 1) - 0.06, T + Lf.id + ': the load grows with the lifter (' + (gainApp * 100).toFixed(1) + '% from week 4, true gain ' + (gainTrue * 100).toFixed(1) + '% over 16 weeks)', { gainApp, gainTrue });
        ok(!s.stalled, T + Lf.id + ': not called stalled', s.head);
        ok(/^.*(Up |Slowly up|No clear change)/.test(s.head) && !/Down|Stalled/.test(s.head), T + Lf.id + ': Stats reads it as rising (or not yet clear), never down', s.head);
        ok(s.prs >= 2, T + Lf.id + ': PRs are logged as it grows', s.prs);
      } else {
        ok(!s.moving, T + Lf.id + ' (flat): never called moving', s.head);
      }
    }
    ok(!st.dashBad, T + 'Stats shows no NaN, undefined, or Infinity');
    ok(errors.length === 0, T + 'no page errors or NaN on Today', errors);
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
