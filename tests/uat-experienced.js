// UAT, an experienced lifter (V, 2026-11-01): the live build driven the way a
// strong, familiar gym-goer uses it, by taps and typing on the session screen,
// with what that lifter expects worked out here from the rules in CLAUDE.md
// and docs/EVIDENCE.md, never read from the app's own functions. It covers
// what the persona suites leave out for this lifter: real numbers (a 225
// bench, a 405 deadlift, a four-digit leg press), warm-ups, a heavy single,
// sets past the estimate's range, a typo that makes a false PR and its fix
// from History, a narrow phone, and a week that slips a day.
//   1  Push day, the fast path: grey loads, warm-ups added, a heavier top set,
//      Finish, the week's hard sets, and the next Push day's load.
//   2  Pull day, a heavy single over the best weight, then back-off sets.
//   3  Legs on a 320 px phone: a 1,000 lb leg press, calf raises past 20 reps.
//   4  A typo that makes a PR, fixed from History.
//   5  A week that slips a day: Monday's Push done on Tuesday (observations
//      for V, not pass or fail: the rule there is V's to set).
// `node tests/uat-experienced.js [page]`; UAT=1,3 runs some.
const { open, engine } = require('./h');
let browser;
const FILE = process.argv[2] || process.env.IRONLOG_FILE || 'index.html';
const fails = [];
const notes = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const note = (m, x) => { notes.push(m); console.log('NOTE', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.env.UAT ? process.env.UAT.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const LB = 0.45359237;
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const MON = '2026-11-02';

async function phone(start, w = 390) {
  const setup = async ctx => { await ctx.addInitScript(`(()=>{const R=Date;let off=new R(${JSON.stringify(start + 'T09:00:00')}).getTime()-R.now();window.__setClock=t=>{off=new R(t).getTime()-R.now();};class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`); };
  const P = await open(FILE, { browser, setup, w, h: 844 });
  const page = P.page;
  const ev = (f, a) => page.evaluate(f, a);
  const sel = (f, b, s) => `#view .sg input[data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
  const draft = () => ev(() => JSON.parse(JSON.stringify(window.__ironlog.state.draft)));
  const modal = () => ev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, title: m.title || '', text: (document.getElementById('modal') || {}).innerText || '' } : null; });
  const H = {
    P, page, ev, sel, draft, modal,
    day: async d => { await ev(t => { window.__setClock(t); const L = window.__ironlog; L.invalidate(); L.render(); }, d + 'T09:00:00'); await wait(100); },
    type: async (f, b, s, v) => { const q = sel(f, b, s); await page.click(q); await page.fill(q, ''); await page.keyboard.type(String(v)); await ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(60); },
    // A tick, unless auto-mark already ticked the row (a second tap would untick it).
    tick: async (b, s) => { const d = await draft(); if (d.ex[b].sets[s].done) return; await page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`); await wait(120); },
    effort: async (b, s, v) => { const q = `#view [data-act="rirOpen"][data-b="${b}"][data-s="${s}"]`; if (!(await page.$(q))) return false; await page.click(q); await wait(80); await page.click(`#view [data-act="rirPick"][data-b="${b}"][data-s="${s}"][data-v="${v}"]`); await wait(80); return true; },
    row: (b, s) => ev(q => { const w = document.querySelector(q[0]), r = document.querySelector(q[1]); return { w: w ? w.value || w.placeholder : null, wTyped: w ? w.value : null, r: r ? r.value || r.placeholder : null }; }, [sel('w', b, s), sel('r', b, s)]),
    text: () => ev(() => document.getElementById('view').innerText),
    opened: () => ev(() => { document.querySelectorAll('#view details:not([open]) > summary').forEach(x => x.click()); return document.getElementById('view').innerText; }),
    go: async t => { await ev(t => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = t; L.render(); }, t); await wait(120); },
    // Sideways scroll on the page, and any field or cell whose text is cut off.
    overflow: () => ev(() => {
      const se = document.scrollingElement;
      const cut = [...document.querySelectorAll('#view input, #view .num, #view .ls')].filter(e => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map(e => (e.value || e.innerText || '').slice(0, 20) + ' [' + e.scrollWidth + '>' + e.clientWidth + ']');
      return { page: se.scrollWidth - se.clientWidth, cut: cut.slice(0, 8) };
    }),
    start: async () => { await page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150); },
    // Finish, saving what was done; the questions asked and the recap's words returned.
    finish: async () => {
      await page.click('#view [data-act="finish"]'); const asked = [];
      for (let k = 0; k < 6; k++) {
        await wait(120);
        const q = await modal();
        if (!q || q.kind !== 'confirm') break;
        asked.push(q.title);
        await page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]');
      }
      await wait(150);
      const m = await modal();
      await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
      return { asked, kind: m && m.kind, text: m ? m.text : '' };
    }
  };
  return H;
}

/* A strong lifter's log in pounds: a fixed-weekday routine (Mon Push, Tue
   Pull, Wed Legs, the rest of the week rest), two weeks done. Each lift is
   [exId, sets, repMin, repMax, RIR, rest s, step lb]; each session's sets are
   [lb, reps, RIR]. Auto-mark and the effort strip on, as a new install has them. */
const DAYS = [
  { id: 'Dpush', name: 'Push', items: [['bench', 3, 6, 10, 2, 180, 5], ['ohp', 3, 6, 10, 2, 150, 5]] },
  { id: 'Dpull', name: 'Pull', items: [['deadlift', 3, 3, 6, 2, 240, 10], ['bbRow', 3, 8, 12, 2, 120, 5]] },
  { id: 'Dlegs', name: 'Legs', items: [['backSquat', 3, 5, 8, 2, 180, 5], ['legPress', 3, 10, 15, 2, 150, 10], ['standCalf', 3, 12, 20, 1, 90, 10]] },
  { id: 'Dr4', name: 'Rest', rest: true, items: [] }, { id: 'Dr5', name: 'Rest', rest: true, items: [] }, { id: 'Dr6', name: 'Rest', rest: true, items: [] }, { id: 'Dr7', name: 'Rest', rest: true, items: [] }
];
const WEEK = (mon) => [
  { date: mon, day: 'Dpush', ex: [['bench', [[225, 8, 2], [225, 8, 2], [225, 8, 2]]], ['ohp', [[135, 7, 2], [135, 6, 2], [135, 6, 2]]]] },
  { date: addD(mon, 1), day: 'Dpull', ex: [['deadlift', [[405, 5, 1], [405, 5, 1], [405, 5, 1]]], ['bbRow', [[185, 10, 2], [185, 10, 2], [185, 10, 2]]]] },
  { date: addD(mon, 2), day: 'Dlegs', ex: [['backSquat', [[315, 6, 2], [315, 6, 2], [315, 6, 2]]], ['legPress', [[990, 12, 2], [990, 12, 2], [990, 12, 2]]], ['standCalf', [[200, 15, 1], [200, 15, 1], [200, 15, 1]]]] }
];
const seed = (H, sessions) => H.ev(([DAYS, sessions]) => {
  const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
  S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = true;
  const R = { id: 'R1', name: 'PPL', schedule: 'weekly', days: DAYS.map(d => ({ id: d.id, name: d.name, rest: !!d.rest, items: d.items.map(([exId, sets, repMin, repMax, rir, rest, inc], k) => ({ uid: d.id + k, exId, sets, repMin, repMax, rir, rest, inc: inc * LB, ss: null })) })) };
  S.routines = [R]; S.activeRoutineId = 'R1';
  S.sessions = sessions.map((x, i) => { const di = DAYS.findIndex(d => d.id === x.day); const day = DAYS[di]; return { id: 'h' + i, date: x.date, dayIdx: di, dayId: day.id, dayName: day.name, routineId: 'R1', notes: '', ex: x.ex.map(([exId, sets]) => { const it = day.items.find(y => y[0] === exId); return { exId, rr: [it[2], it[3]], sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir, warm: false, drop: false })) }; }) }; });
  L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
}, [DAYS, sessions]);
const HISTORY = [...WEEK(addD(MON, -14)), ...WEEK(addD(MON, -7))];
const blockOf = (d, id) => d.ex.findIndex(b => b.exId === id);
const lbOf = kg => Math.round((kg / LB) * 100) / 100;

(async () => {
  browser = await engine.launch();

  // ---- 1. Push day, the fast path.
  if (run(1)) {
    const H = await phone(MON);
    await seed(H, HISTORY);
    const t0 = await H.text();
    ok(/\bpush\b/i.test(t0), '1. Monday: Today offers Push', t0.slice(0, 300));
    await H.start();
    let d = await H.draft();
    const B = blockOf(d, 'bench'), O = blockOf(d, 'ohp');
    ok(B >= 0 && O >= 0, '1. the session holds bench and overhead press', d && d.ex.map(b => b.exId));
    // 225 x 8 x 3 in a 6-10 range: not at the top, so the same load and last time's reps to beat.
    const r0 = await H.row(B, 0);
    ok(Number(r0.w) === 225 && !r0.wTyped, '1. bench: 225 in grey (short of the top of the range, so the same load)', r0);
    // Two warm-ups, as an experienced lifter ramps: at the top, flagged, under 225, from the bar up, in whole 5 lb steps.
    // Each from the exercise's menu, as the lifter reaches it: the menu, then Add a warm-up set.
    const warmUp = async () => { await H.page.click(`#view [data-act="bMenu"][data-b="${B}"]`); await wait(120); await H.page.click(`#modal [data-act="bMenuDo"][data-op="wAdd"]`); await wait(150); const m = await H.modal(); if (m) await H.ev(() => window.__ironlog.ACT.mClose()); };
    await warmUp(); await warmUp();
    d = await H.draft();
    const warms = d.ex[B].sets.map((s, i) => ({ i, s })).filter(x => x.s.warm);
    const wl = [];
    for (const x of warms) wl.push(Number((await H.row(B, x.i)).w));
    ok(warms.length === 2 && warms.every(x => x.i < 2) && wl.every(w => w >= 45 && w < 225 && w % 5 === 0) && wl[0] < wl[1], '1. two warm-ups at the top of the bench, climbing from the bar toward 225 in 5 lb steps', { warms: warms.map(x => x.i), loads: wl });
    const asked = [];
    for (const x of warms) { await H.type('r', B, x.i, 5); await H.tick(B, x.i); const m = await H.modal(); if (m) { asked.push(m.title || m.text.slice(0, 80)); await H.ev(() => window.__ironlog.ACT.mClose()); } }
    // Working sets: 225 (taken from the grey load) x 9 at 2 in reserve, twice; then a heavier top set typed, 235 x 6 at 1.
    const W = warms.length;
    for (const s of [W, W + 1]) { await H.type('r', B, s, 9); await H.effort(B, s, 2); await H.tick(B, s); const m = await H.modal(); if (m) { asked.push(m.title || m.text.slice(0, 80)); await H.ev(() => window.__ironlog.ACT.mClose()); } }
    await H.type('w', B, W + 2, 235); await H.type('r', B, W + 2, 6); await H.effort(B, W + 2, 1); await H.tick(B, W + 2);
    { const m = await H.modal(); if (m) { asked.push(m.title || m.text.slice(0, 80)); await H.ev(() => window.__ironlog.ACT.mClose()); } }
    for (const s of [0, 1, 2]) { await H.type('r', O, s, 7); await H.effort(O, s, 2); await H.tick(O, s); }
    ok(!asked.length, '1. warm-ups, sets on the grey load and a top set 10 lb over it are logged with no question', asked);
    d = await H.draft();
    const notDone = d.ex.flatMap((b, bi) => b.sets.map((s, si) => ({ bi, si, done: s.done }))).filter(x => !x.done);
    ok(!notDone.length, '1. every set ticked', notDone);
    const fin = await H.finish();
    ok(fin.kind === 'recap', '1. Finish saves and shows the recap', fin);
    ok(!fin.asked.length, '1. Finish asks nothing (every set done, nothing far off)', fin.asked);
    // The recap counts working sets only: 3 bench and 3 press, warm-ups left out.
    ok(/^6 working sets, 6 counted/m.test(fin.text), '1. the recap: 6 working sets, 6 counted as hard (warm-ups not counted)', fin.text.slice(0, 400));
    const sv = await H.ev(() => { const s = window.__ironlog.state.sessions.find(x => x.date === '2026-11-02'); return s && s.ex.map(b => ({ id: b.exId, sets: b.sets.map(x => [x.w, x.r, x.rir, !!x.warm]) })); });
    const bs = sv && sv.find(b => b.id === 'bench');
    const want = [...wl.map(w => [w, 5, null, true]), [225, 9, 2, false], [225, 9, 2, false], [235, 6, 1, false]];
    const got = bs && bs.sets.map(([w, r, rir, warm]) => [lbOf(w), r, rir, warm]);
    ok(got && JSON.stringify(got) === JSON.stringify(want), '1. bench saved as done: warm-ups flagged, the grey 225 stored as 225, the top set 235 x 6', { got, want });
    await H.go('today');
    const tt = await H.opened();
    const hm = tt.match(/([\d.]+) hard sets logged/);
    ok(hm && +hm[1] === 6, '1. Today: 6 hard sets this week (warm-ups not counted)', hm ? hm[0] : tt.slice(0, 800));
    await H.go('dash');
    const st = await H.opened();
    const sm = st.match(/([\d.]+) hard sets this week/);
    ok(sm && +sm[1] === 6, '1. Stats agrees: 6 hard sets this week', sm ? sm[0] : st.slice(0, 800));
    // The next Push day: built on 225 x 9, 9 and 235 x 6, so a load of 225 to 240; never below what was just done.
    await H.day(addD(MON, 7)); await H.go('today'); await H.start();
    d = await H.draft();
    const nb = blockOf(d, 'bench');
    const firstWork = d.ex[nb].sets.findIndex(s => !s.warm);
    const nr = await H.row(nb, firstWork);
    ok(Number(nr.w) >= 225 && Number(nr.w) <= 240, `1. the next Push day suggests ${nr.w} lb on the bench (225 to 240 expected)`, { row: nr, tgt: d.ex[nb].tgt, hint: d.ex[nb].hint });
    note(`1. next Push day bench target as shown: ${nr.w} lb x ${nr.r}`, d.ex[nb].tgt);
    ok(!H.P.errors.length, '1. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 2. Pull day: a heavy single over the best weight, then back-off sets.
  if (run(2)) {
    const H = await phone(addD(MON, 1));
    await seed(H, HISTORY);
    await H.start();
    let d = await H.draft();
    const D = blockOf(d, 'deadlift');
    ok(D >= 0, '2. Tuesday: the session is Pull, with the deadlift', d && d.dayName);
    const asked = [];
    // 455 x 1 at 1 in reserve: 50 lb over the best weight, well under twice it, so no question.
    await H.type('w', D, 0, 455); await H.type('r', D, 0, 1); await H.effort(D, 0, 1); await H.tick(D, 0);
    { const m = await H.modal(); if (m) { asked.push(m.title || m.text.slice(0, 120)); await H.ev(() => window.__ironlog.ACT.mClose()); } }
    for (const s of [1, 2]) { await H.type('w', D, s, 405); await H.type('r', D, s, 5); await H.effort(D, s, 1); await H.tick(D, s); const m = await H.modal(); if (m) { asked.push(m.title || m.text.slice(0, 120)); await H.ev(() => window.__ironlog.ACT.mClose()); } }
    ok(!asked.length, '2. a 455 single over a 405 best, and 405 back-offs, are logged with no question', asked);
    const R = blockOf(d, 'bbRow');
    for (const s of [0, 1, 2]) { await H.type('r', R, s, 10); await H.effort(R, s, 2); await H.tick(R, s); }
    const fin = await H.finish();
    // 455 x 1 at 1 in reserve is 2 reps to failure: Brzycki 455 x 36/35 = 468. 405 x 5 at 1 is 6: 405 x 36/31 = 470.
    // Heavier, not stronger: the recap says Heaviest yet, and does not call it a PR.
    const prPart = fin.text.split(/Heaviest yet/)[0];
    ok(/Heaviest yet: [^\n]*Deadlift 455/.test(fin.text), '2. the recap: Heaviest yet, Conventional Deadlift 455 x 1', fin.text.slice(0, 600));
    ok(!/Deadlift[^\n]*(PR|best estimate)/i.test(fin.text.replace(/Heaviest yet:[^\n]*/, '')), '2. the single is not called a PR (468 estimated, under the 470 of 405 x 5 at 1 in reserve)', fin.text.slice(0, 600));
    void prPart;
    ok(!H.P.errors.length, '2. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 3. Legs on a 320 px phone: four-digit loads, sets past 20 reps.
  if (run(3)) {
    const H = await phone(addD(MON, 2), 320);
    await seed(H, HISTORY);
    await H.start();
    let d = await H.draft();
    const S = blockOf(d, 'backSquat'), LP = blockOf(d, 'legPress'), C = blockOf(d, 'standCalf');
    const lp0 = await H.row(LP, 0);
    ok(Number(lp0.w) === 990, '3. leg press: 990 in grey (12 reps, short of 15)', lp0);
    const asked = [];
    const done = async (b, s, w, r, rir) => { if (w != null) await H.type('w', b, s, w); await H.type('r', b, s, r); await H.effort(b, s, rir); await H.tick(b, s); const m = await H.modal(); if (m) { asked.push(m.title || m.text.slice(0, 120)); await H.ev(() => window.__ironlog.ACT.mClose()); } };
    for (const s of [0, 1, 2]) await done(S, s, null, 7, 2);
    // A slipped digit first, as a control on the no-question check: 10000 for 1000 is asked about, Fix it, then 1000.
    // With auto-mark on, the reps typed tick the row and the question comes then; otherwise the tick asks it.
    await H.type('w', LP, 0, 10000); await H.type('r', LP, 0, 15); await wait(150);
    if (!(await H.modal())) { await H.page.click(`#view [data-act="sDone"][data-b="${LP}"][data-s="0"]`); await wait(150); }
    { const m = await H.modal(); ok(!!m && !(await H.draft()).ex[LP].sets[0].done, '3. control: a slipped digit, 10000 on the leg press, is asked about before it is logged', m);
      if (m) { const fix = await H.page.$('#modal [data-act="mCancel"], #modal [data-act="mAlt"]'); if (fix) await fix.click(); else await H.ev(() => window.__ironlog.ACT.mClose()); await wait(120); }
      const d0 = await H.draft(); if (d0.ex[LP].sets[0].done) await H.page.click(`#view [data-act="sDone"][data-b="${LP}"][data-s="0"]`); await wait(100); }
    for (const [s, r] of [[0, 15], [1, 15], [2, 14]]) await done(LP, s, 1000, r, 2);
    for (const [s, r] of [[0, 25], [1, 22], [2, 20]]) await done(C, s, null, r, 0);
    ok(!asked.length, '3. 1,000 lb on the leg press and 25-rep calf sets are logged with no question', asked);
    // Controls, so the checks above cannot pass by seeing nothing: a page made wider than the phone is caught as
    // sideways scroll (the slipped-digit control, 10000 asked about, runs before the leg press sets above).
    await H.ev(() => { const x = document.createElement('div'); x.id = 'wide'; x.style.width = '700px'; x.style.height = '1px'; document.getElementById('view').appendChild(x); });
    ok((await H.overflow()).page > 0, '3. control: a page wider than the phone is caught as sideways scroll');
    await H.ev(() => document.getElementById('wide').remove());
    const o1 = await H.overflow();
    ok(o1.page <= 0 && !o1.cut.length, '3. 320 px session screen: no sideways scroll, no load or rep cut off', o1);
    const fin = await H.finish();
    ok(fin.kind === 'recap', '3. Finish saves', fin);
    // Past 12 reps to failure there is no estimate shown as a 1RM (formulas.ts); the calf line names no estimate.
    const calfLine = (fin.text.match(/Standing Calf Raise[^\n]*\n?[^\n]*/) || [''])[0];
    ok(!/estimate|1RM/i.test(calfLine), '3. calf raises at 25, 22 and 20 reps show no 1RM or best estimate in the recap', calfLine || fin.text.slice(0, 600));
    note('3. recap at 320 px', fin.text.slice(0, 700));
    for (const t of ['history', 'dash', 'today', 'plan']) {
      await H.go(t); await H.opened();
      const o = await H.overflow();
      ok(o.page <= 0 && !o.cut.length, `3. 320 px ${t}: no sideways scroll, no number cut off`, o);
    }
    ok(!H.P.errors.length, '3. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 4. A typo that makes a PR, fixed from History.
  if (run(4)) {
    const H = await phone(MON);
    await seed(H, HISTORY);
    await H.start();
    let d = await H.draft();
    const B = blockOf(d, 'bench'), O = blockOf(d, 'ohp');
    // 255 meant as 225: 30 lb over the best, under twice it, so the app cannot tell it is a slip.
    await H.type('w', B, 0, 255);
    for (const s of [0, 1, 2]) { await H.type('r', B, s, 9); await H.effort(B, s, 2); await H.tick(B, s); }
    for (const s of [0, 1, 2]) { await H.type('r', O, s, 7); await H.effort(O, s, 2); await H.tick(O, s); }
    { const m = await H.modal(); if (m) await H.ev(() => window.__ironlog.ACT.mClose()); }
    const fin = await H.finish();
    ok(/Bench[^\n]*\n?[^\n]*(PR|best estimate)/i.test(fin.text) || /Heaviest yet: [^\n]*Bench/.test(fin.text), '4. the slip shows as a bench PR or heaviest set in the recap (as it would for a real 255)', fin.text.slice(0, 500));
    const sid = await H.ev(() => window.__ironlog.state.sessions.find(s => s.date === '2026-11-02').id);
    await H.ev(id => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id } }); }, sid);
    await wait(150);
    d = await H.draft();
    const EB = blockOf(d, 'bench');
    // The typed 255 was carried to the rows below as their grey load (r25) and saved with them, so the lifter fixes each set.
    for (const s of [0, 1, 2]) await H.type('w', EB, s, 225);
    await H.page.click('#view [data-act="finish"]'); await wait(200);
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const ed = await H.ev(id => window.__ironlog.state.sessions.find(s => s.id === id).ex.find(b => b.exId === 'bench').sets.map(x => Math.round(x.w / 0.45359237)), sid);
    ok(ed.join() === '225,225,225', '4. the fix, typed on each set in History, is saved: 225 on every bench set', ed);
    // Nothing anywhere still shows the 255.
    const where = [];
    for (const t of ['today', 'dash', 'history']) { await H.go(t); const tx = await H.opened(); if (/\b255\b/.test(tx)) where.push(t + ': ' + (tx.match(/[^\n]*\b255\b[^\n]*/) || [''])[0]); }
    ok(!where.length, '4. after the fix, no screen still shows 255 (PR list, bests, History)', where);
    await H.day(addD(MON, 7)); await H.go('today'); await H.start();
    d = await H.draft();
    const nb = blockOf(d, 'bench');
    const nr = await H.row(nb, 0);
    ok(Number(nr.w) >= 225 && Number(nr.w) <= 230, `4. the next Push day reads the fixed 225 x 9 x 3, not 255: ${nr.w} lb`, { row: nr, tgt: d.ex[nb].tgt });
    ok(!H.P.errors.length, '4. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 5. A week that slips a day: Monday missed, Push done on Tuesday.
  if (run(5)) {
    const H = await phone(addD(MON, 1));
    await seed(H, HISTORY);
    const t0 = await H.text();
    note('5. Tuesday after a missed Monday, Today offers', t0.split('\n').slice(0, 12).join(' | '));
    const bar = () => H.ev(() => [...document.querySelectorAll('.w')].map(x => x.getAttribute('aria-label') || x.innerText.replace(/\s+/g, ' ')).filter(Boolean).slice(0, 7));
    note('5. week bar on Tuesday before training', await bar());
    await H.ev(() => window.__ironlog.ACT.startSession({ dataset: { day: '0' } })); await wait(150);
    let d = await H.draft();
    ok(d && d.dayName === 'Push', '5. Push can be started on Tuesday', d && d.dayName);
    for (let b = 0; b < d.ex.length; b++) for (let s = 0; s < d.ex[b].sets.length; s++) { await H.type('r', b, s, 8); await H.effort(b, s, 2); await H.tick(b, s); }
    const fin = await H.finish();
    ok(fin.kind === 'recap', '5. Push saved on Tuesday', fin.asked);
    await H.day(addD(MON, 2)); await H.go('today');
    const t2 = await H.text();
    note('5. Wednesday: Today offers', t2.split('\n').slice(0, 12).join(' | '));
    note('5. week bar on Wednesday', await bar());
    const tt = await H.opened();
    const wk = tt.match(/This week\n(\d+) of (\d+) sessions/);
    note('5. Wednesday: this week\'s count', wk ? wk[0] : null);
    ok(!H.P.errors.length, '5. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 6. A target beaten by load and reps both, past 12 reps: leg press 990 x 12 x 3 last time, today 1,000 x 15, 15, 14.
  // Every set heavier and more reps on every set: a lifter reads that as beaten. Controls: the same done at the target's
  // load (990 x 13 x 3, beaten by reps), and a heavier load inside the estimate's range (bench 235 x 9 x 3 after 225 x 8 x 3).
  if (run(6)) {
    const cases = [
      { name: 'leg press 1,000 x 15, 15, 14 after 990 x 12 x 3', day: 2, ex: 'legPress', sets: [[1000, 15], [1000, 15], [1000, 14]] },
      { name: 'control: leg press 990 x 13 x 3 after 990 x 12 x 3', day: 2, ex: 'legPress', sets: [[990, 13], [990, 13], [990, 13]] },
      { name: 'control: bench 235 x 9 x 3 after 225 x 8 x 3', day: 0, ex: 'bench', sets: [[235, 9], [235, 9], [235, 9]] }
    ];
    for (const c of cases) {
      const H = await phone(addD(MON, c.day));
      await seed(H, HISTORY);
      await H.start();
      let d = await H.draft();
      const b = blockOf(d, c.ex);
      // Only this lift is done; the others are removed from the session first, as a lifter skipping them would.
      for (let k = d.ex.length - 1; k >= 0; k--) if (k !== b) await H.ev(k => { const L = window.__ironlog; L.state.draft.ex.splice(k, 1); L.render(); }, k);
      await wait(120);
      for (const [s, [w, r]] of c.sets.entries()) { await H.type('w', 0, s, w); await H.type('r', 0, s, r); await H.effort(0, s, 2); await H.tick(0, s); const m = await H.modal(); if (m) await H.ev(() => window.__ironlog.ACT.mClose()); }
      const tp = await H.ev(() => { const e = document.getElementById('tp-0'); return e ? e.innerText : null; });
      const fin = await H.finish();
      const line = (fin.text.match(/\d+ of \d+ exercise targets? beaten/) || [''])[0];
      note(`6. ${c.name}: the session screen's progress line read "${tp}"`);
      ok(line === '1 of 1 exercise target beaten', `6. ${c.name}: the recap says the target was beaten`, line || fin.text.slice(0, 400));
      // What the next session asks: never less than the load just done in full.
      await H.day(addD(MON, c.day + 7)); await H.go('today'); await H.start();
      d = await H.draft();
      const nb = blockOf(d, c.ex);
      const nr = await H.row(nb, 0);
      const top = Math.max(...c.sets.map(x => x[0]));
      ok(Number(nr.w) >= top, `6. ${c.name}: the next session asks ${nr.w} lb, not under the ${top} done`, { row: nr, tgt: d.ex[nb].tgt });
      await H.P.ctx.close();
    }
  }

  await browser.close();
  console.log(`\n${notes.length} notes`);
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.log('FAIL crashed:', e.stack); try { await browser.close(); } catch (x) { /* already closed */ } process.exit(1); });
