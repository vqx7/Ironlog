// r55: V's answers of 2026-10-19 (PENDING 323), each reported by V on the r54
// preview and reproduced on r54 with the real buttons before it was put to V.
// Each case fails on r54 (`node tests/r55.js baselines/r54.html` once r54 is a
// baseline; until then the r54 build on its branch) unless it says it guards
// what r54 already did:
//   - a missed set (a): reps typed as 0 and ticked are kept as 0, a missed
//     set, never replaced by the grey reps; auto-mark ticks a typed 0 as
//     missed; a ticked set corrected to 0 stays ticked, and one whose reps are
//     cleared is unticked (a guard); the next row's grey load is the last set
//     completed, not the missed one; Finish saves it, and asks about a typed 0
//     left unticked as it asks about any reps left unticked; saved, it counts
//     toward no hard set, PR, estimate or target, and History and the next
//     Last line say "missed", the Last column leaving it out;
//   - + Set after a set well under the range (b): the new row takes the
//     adjustment a planned row under it would have had (r54 copied 300 x 1),
//     and after a set in range it copies the load as before (a guard);
//   - a load far off (b): a set more than three times, or under a third of,
//     the heaviest set ticked before it in the session, or more than twice the
//     heaviest ever logged on the lift, asks before it is logged, Log it or
//     Fix it, Fix it going back to the load; an unmarked ramp of warm-ups, a
//     step past the old best and a bodyweight lift's first added load do not
//     ask (guards);
//   - Settings > More (c): one demo button, Load or Clear once loaded, and
//     the version alone until an error is logged, then the count, the errors,
//     Copy diagnostics and Clear log;
//   - a lift trained in two rep ranges (d, PENDING 319) reads falling only
//     when it falls in each, its line naming the range it is down in and the
//     range it is not, the coach and the muscle reading following; the
//     range is named whenever it trains in two; its history line reads the
//     trend's range only; falling in both still falls (a guard).
// Then the journey audit of r54 (PENDING 324), each reproduced on r54 with
// the real buttons first: logging (e), swaps and lighter days (g), the
// sessions after (f), and Plan, the weeks and the screens (h); tests/SUITES.md
// lists every case.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || 'index.html';
const LB = 0.45359237;

(async () => {
  const P = await open(FILE, { clock: '2026-10-15T10:00:00', realStarter: true });
  const { page } = P; const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'lb'; L.saveNow(); localStorage.setItem('ironlog.v1.tipWake', '1'); L.render(); });
  // A log of these sessions only, nothing in progress.
  const log = sessions => ev(sessions => { const L = window.__ironlog; const s = L.state; s.sessions = sessions; s.draft = null; s.deloadWeek = null; s.injuries = []; L.state = L.normalize(s); L.invalidate(); L.saveNow(); L.render(); }, sessions);
  const ses = (id, date, exId, rr, sets) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId, rr, sets: sets.map(([w, r]) => ({ w, r, rir: 1, warm: false, drop: false })) }] });
  // The starter's first day with only this lift, its rows cut to n when given.
  const start = (exId, n) => ev(([exId, n]) => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === exId); if (n) d.ex[0].sets.length = n; d._rampAsked = true; L.ui.tab = 'today'; L.saveNow(); L.render(); }, [exId, n || 0]);
  const W = s => `.sg input[data-f="w"][data-b="0"][data-s="${s}"]`, R = s => `.sg input[data-f="r"][data-b="0"][data-s="${s}"]`;
  const typ = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'input'); await page.dispatchEvent(sel, 'change'); await wait(60); };
  const row = s => ev(s => { const L = window.__ironlog; const b = L.state.draft.ex[0]; const x = b.sets[s]; return { w: x.w, r: x.r, done: !!x.done, greyW: L.greyW(b, s), greyR: L.greyR(b, s), adj: b.adj || null }; }, s);
  const modal = () => ev(() => { const m = window.__ironlog.ui.modal; const el = document.querySelector('#modal .sheet'); return m ? { kind: m.kind, title: m.title || '', text: el ? el.innerText : '', buttons: el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()) : [] } : null; });
  const toastText = () => ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText : ''; });
  // Ticks a row with its checkmark unless auto-mark already did; a question about the load is answered Log it.
  // Auto-mark ticks a set as its reps field is left, so the question may already be open.
  const tick = async (s, answer) => {
    if (!(await ev(s => window.__ironlog.state.draft.ex[0].sets[s].done || !!window.__ironlog.ui.modal, s))) await page.click(`[data-act="sDone"][data-b="0"][data-s="${s}"]`);
    await wait(120); const m = await modal();
    if (m && m.kind === 'confirm' && answer !== false) { await page.click('#modal [data-act="mOk"]'); await wait(150); }
    return m;
  };
  const finish = async () => { await ev(() => window.__ironlog.ACT.finish()); await wait(150); };
  const near = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-6;

  // ---- (a) Missed sets.
  {
    await log([ses('h1', '2026-10-08', 'bench', [6, 10], [[100 * LB, 8], [100 * LB, 8], [100 * LB, 8], [100 * LB, 8]])]);
    await start('bench');
    await typ(W(0), 100); await typ(R(0), 8); await tick(0);
    await typ(W(1), 120); await typ(R(1), 0);
    const left = await row(1);
    await tick(1); const r1 = await row(1); const t1 = await toastText(); const r2 = await row(2);
    ok(r1.done && r1.r === 0, 'bench 100 x 8, then 120 typed with 0 reps and the checkmark tapped: the set is ticked as missed, 0 reps kept (r54 put the grey 8 in)', { left, r1 });
    ok(/missed/i.test(t1), 'and the app says it was logged as missed: ' + t1, t1);
    ok(near(r2.greyW, 100 * LB) && r2.greyR === 8, 'the next row shows the last set completed in grey, 100 lb for 8, not the missed 120', r2);
    // Auto-mark is on (new installs): a typed 0 is ticked as missed on leaving the field, at the grey load.
    await typ(R(2), 7);
    await typ(R(3), 0); const a3 = await row(3);
    ok(a3.done && a3.r === 0 && near(a3.w, 100 * LB), 'with auto-mark on, typing 0 and leaving the field ticks the set as missed, at the grey load (100 lb)', a3);
    // Corrections: a ticked set changed to 0 stays ticked, as missed; cleared, it is unticked (a guard: r54 unticked a cleared set too).
    await typ(R(3), 6); await typ(R(3), 0); const c0 = await row(3);
    await typ(R(3), ''); const cl = await row(3);
    ok(c0.done && c0.r === 0, 'a ticked 100 x 6 corrected to 0 reps stays ticked, as missed (r54 unticked it, so Finish dropped it)', c0);
    ok(!cl.done && cl.r == null, 'its reps cleared, it is unticked (a guard)', cl);
    await typ(R(3), 0); await wait(1500);
    const folded = await ev(() => { const el = document.querySelector('[data-act="bOpen"][data-b="0"]'); return el ? el.innerText : ''; });
    ok(/120×0 missed/.test(folded) && /100×0 missed/.test(folded), 'every set ticked, the exercise folds to one line that marks the missed sets: ' + folded.replace(/\n/g, ' '), folded);
    await finish();
    const saved = await ev(() => { const L = window.__ironlog; const s = L.state.sessions.find(q => q.date === '2026-10-15'); return s ? s.ex[0].sets.map(x => [Math.round(x.w / 0.45359237), x.r]) : null; });
    ok(JSON.stringify(saved) === '[[100,8],[120,0],[100,7],[100,0]]', 'Finish saves every set as logged, the two missed ones with 0 reps: ' + JSON.stringify(saved), saved);
    const rd = await ev(() => { const L = window.__ironlog; const I = L.IDX(); const x = I.byEx.bench.find(e => e.date === '2026-10-15'); const wk = L.weekStart ? L.weekStart('2026-10-15') : null; return { pts: x ? x.pts.map(p => [Math.round(p.w / 0.45359237), p.r]) : null, hard: wk ? I.weekHard[wk] : null, prs: I.prs.filter(p => p.date === '2026-10-15').map(p => p.type) }; });
    ok(JSON.stringify(rd.pts) === '[[100,8],[100,7]]' && rd.hard === 2 && rd.prs.length === 0, 'the missed sets count toward nothing: two working sets read, two hard sets in the week, and no PR (r54 logged 120 x 8 and called it one)', rd);
    // History says which sets were missed.
    const hist = await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; const s = L.state.sessions.find(q => q.date === '2026-10-15'); L.ui.histOpen = s.id; L.render(); return document.getElementById('view').innerText; });
    ok(/120×0 missed/.test(hist) && /100×0 missed/.test(hist), 'History lists them as "120×0 missed" and "100×0 missed"', hist.slice(0, 600));
    // The next session's Last line names them; the Last column, which the grey reps follow, leaves them out.
    await ev(() => { window.__ironlog.ui.tab = 'today'; });
    await start('bench');
    const nx = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { last: b.last || '', prev: b.prev || null }; });
    ok(/100×8, 120×0 missed, 100×7, 100×0 missed/.test(nx.last), 'the next session\'s Last line lists every set in order, the missed ones marked: ' + nx.last, nx);
    ok(JSON.stringify(nx.prev) === '["100×8","100×7"]', 'and the Last column shows the sets completed, row by row', nx.prev);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
  }
  // A typed 0 left unticked with auto-mark off is asked about at Finish, as any reps left unticked are, and kept when marked done.
  {
    await log([]);
    await ev(() => { const L = window.__ironlog; L.state.settings.autoDone = false; L.saveNow(); });
    await start('bench', 2);
    await typ(W(0), 100); await typ(R(0), 8); await tick(0);
    await typ(W(1), 110); await typ(R(1), 0);
    await finish(); const m = await modal();
    ok(m && m.kind === 'confirm' && /not marked done/.test(m.title), 'auto-mark off, 100 x 8 ticked and 110 x 0 typed but not ticked: Finish asks about the set not marked done (r54 dropped it without a word)', m);
    if (m && m.kind === 'confirm') { await page.click('#modal [data-act="mOk"]'); await wait(200); }
    const saved = await ev(() => { const s = window.__ironlog.state.sessions.find(q => q.date === '2026-10-15'); return s ? s.ex[0].sets.map(x => [Math.round(x.w / 0.45359237), x.r]) : null; });
    ok(JSON.stringify(saved) === '[[100,8],[110,0]]', 'marked done and saved, the missed set is kept: ' + JSON.stringify(saved), saved);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.settings.autoDone = true; L.saveNow(); });
  }

  // ---- (b) + Set after a set well under the range takes the adjustment; and a load far off asks first.
  {
    await log([]);
    await start('bbRow');
    await typ(W(0), 50); await typ(R(0), 6); await tick(0);
    await typ(R(1), 6); await tick(1);
    await typ(W(2), 300); await typ(R(2), 1);
    const m = await tick(2, false); const r2 = await row(2);
    ok(m && m.kind === 'confirm' && /300/.test(m.text) && /50/.test(m.text), 'barbell row 50 x 6 twice, then 300 x 1 ticked: the app asks before logging a load six times the session\'s sets (r54 logged it)', m);
    ok(m && m.buttons.join('|') === 'Log it|Fix it' && !r2.done, 'the question offers Log it and Fix it, and the set waits unticked', { buttons: m && m.buttons, r2 });
    if (m) { await page.click('#modal [data-act="mAlt"]'); await wait(150); }
    const fx = await ev(() => { const a = document.activeElement; return { focus: a && a.matches ? a.matches('.sg input[data-f="w"][data-b="0"][data-s="2"]') : false, done: window.__ironlog.state.draft.ex[0].sets[2].done, modal: !!window.__ironlog.ui.modal }; });
    ok(fx.focus && !fx.done && !fx.modal, 'Fix it closes the question and puts the cursor in that set\'s load, the set still unticked', fx);
    await tick(2);
    const r2b = await row(2);
    ok(r2b.done && r2b.r === 1 && near(r2b.w, 300 * LB), 'Log it logs 300 x 1 as typed (a guard: r54 logged it without asking)', r2b);
    // The exercise folds once every set is ticked; it is opened again for + Set.
    await wait(1500); if (await page.$('[data-act="bOpen"][data-b="0"]')) { await page.click('[data-act="bOpen"][data-b="0"]'); await wait(150); }
    await page.click('[data-act="sAdd"][data-b="0"]'); await wait(150);
    const r3 = await row(3); const line = await ev(() => { const el = document.getElementById('adj-0'); return el ? el.innerText : ''; });
    ok(r3.greyW != null && r3.greyW < 300 * LB - 1e-6 && r3.adj && r3.adj.at === 2 && !r3.adj.up, '+ Set after 300 x 1 on a 6 to 10 range: the new row takes a lighter load, as a planned row would have (r54 copied 300)', r3);
    ok(/Next sets: \d+ lb, down because set 3 stopped at 1, under your 6-10 range/.test(line), 'and says why: ' + line, line);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
  }
  // The same with Fill in suggested loads on: the new row is filled with the lighter load, and Keep puts back the load above.
  {
    await ev(() => { const L = window.__ironlog; L.state.settings.loadFill = 'fill'; L.saveNow(); });
    await start('bbRow');
    await typ(W(0), 50); await typ(R(0), 6); await tick(0);
    await typ(R(1), 6); await tick(1);
    await typ(W(2), 300); await typ(R(2), 1); await tick(2);
    await wait(1500); if (await page.$('[data-act="bOpen"][data-b="0"]')) { await page.click('[data-act="bOpen"][data-b="0"]'); await wait(150); }
    await page.click('[data-act="sAdd"][data-b="0"]'); await wait(150);
    const r3 = await row(3);
    ok(r3.adj && near(r3.w, r3.adj.w) && r3.w < 300 * LB, 'with loads filled in, + Set after 300 x 1 fills the new row with the lighter load (r54 filled 300)', r3);
    if (await page.$('[data-act="adjKeep"][data-b="0"]')) { await page.click('[data-act="adjKeep"][data-b="0"]'); await wait(120); }
    const k3 = await row(3);
    ok(near(k3.w, 300 * LB) && !k3.adj, 'Keep puts the row back on 300 lb (a guard: on r54 it was never moved)', k3);
    await ev(() => { const L = window.__ironlog; delete L.state.settings.loadFill; L.state.draft = null; L.saveNow(); L.render(); });
  }
  // A guard: + Set after sets in range copies the load above, as r54 did.
  {
    await start('bench', 2);
    await typ(W(0), 100); await typ(R(0), 8); await tick(0);
    await typ(R(1), 8); await tick(1);
    await wait(1500); if (await page.$('[data-act="bOpen"][data-b="0"]')) { await page.click('[data-act="bOpen"][data-b="0"]'); await wait(150); }
    await page.click('[data-act="sAdd"][data-b="0"]'); await wait(150);
    const r2 = await row(2);
    ok(near(r2.greyW, 100 * LB) && !r2.adj, '+ Set after bench 100 x 8 twice copies 100 lb (a guard)', r2);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
  }
  // Far off the lift's history: more than twice the heaviest ever logged asks; a step past the old best does not (a guard).
  {
    await log([ses('hh1', '2026-10-08', 'bench', [6, 10], [[225 * LB, 8], [225 * LB, 8]])]);
    await start('bench', 2);
    await typ(W(0), 500); await typ(R(0), 5); const m = await tick(0, false);
    ok(m && m.kind === 'confirm' && /225/.test(m.text), 'bench with 225 lb the heaviest ever logged, 500 x 5 as the first set: the app asks first (r54 logged it)', m);
    if (m) { await page.click('#modal [data-act="mAlt"]'); await wait(120); }
    await typ(W(0), 245); await typ(R(0), 5); const m2 = await tick(0);
    ok(!m2 && (await row(0)).done, 'typed again as 245 x 5, a step past the old best, it is logged without a question (a guard)', m2);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
  }
  // Far under the session's sets: under a third of the heaviest set before it asks (a 30 typed for 300).
  {
    await log([]);
    await start('bench', 2);
    await typ(W(0), 300); await typ(R(0), 5); await tick(0);
    await typ(W(1), 30); await typ(R(1), 5); const m = await tick(1, false);
    ok(m && m.kind === 'confirm' && /30 lb/.test(m.text), 'bench 300 x 5, then 30 x 5: the app asks first (r54 logged it)', m);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.draft = null; L.saveNow(); L.render(); });
  }
  // Guards: an unmarked ramp of warm-ups up to the working load, and a bodyweight lift's first added load, ask nothing.
  {
    await start('bench', 4);
    const asked = [];
    for (const [s, w, r] of [[0, 45, 10], [1, 95, 5], [2, 135, 3], [3, 185, 5]]) { await typ(W(s), w); await typ(R(s), r); const m = await tick(s); if (m) asked.push([w, m.title]); }
    ok(asked.length === 0, 'bench 45 x 10, 95 x 5, 135 x 3 and 185 x 5 with nothing marked as a warm-up: no question (a guard)', asked);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
    await ev(() => { const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; const b = L.newBlock('dips', L.planFor('dips', L.activeRoutine(), null), {}); d.ex = [b]; b.sets.length = 2; d._rampAsked = true; L.saveNow(); L.render(); });
    await typ(R(0), 10); const m0 = await tick(0);
    await typ(W(1), 20); await typ(R(1), 8); const m1 = await tick(1);
    ok(!m0 && !m1, 'dips at bodyweight x 10, then +20 lb x 8 with no weigh-in logged: no question (a guard)', { m0, m1 });
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.draft = null; L.saveNow(); L.render(); });
  }

  // ---- (c) Settings > More: one demo button, and the version alone until an error is logged.
  {
    await log([]);
    const more = () => ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); const g = document.querySelector('#view [data-mkey="more"]'); g.open = true; const acts = [...g.querySelectorAll('[data-act]')].map(b => b.dataset.act); return { acts, text: g.querySelector('.sec-b').innerText, sub: (g.querySelector('.sec-s') || {}).textContent || '' }; });
    const a = await more();
    ok(a.acts.includes('demoLoad') && !a.acts.includes('demoClear'), 'Settings > More with no demo data: Load demo data, and no Clear (r54 showed Clear, disabled)', a.acts);
    ok(/Version \d/.test(a.text) && !/logged error|cloud/.test(a.text) && !a.acts.includes('diagCopy') && !a.acts.includes('diagClear'), 'no error logged: the version alone, with no cloud or error count and no Copy diagnostics or Clear log (r54 showed them all)', a);
    await ev(() => { const L = window.__ironlog; L.makeDemo(); L.saveNow(); });
    const b = await more();
    ok(b.acts.includes('demoClear') && !b.acts.includes('demoLoad') && /demo data loaded/.test(b.sub), 'demo data loaded: Clear demo data in its place, and no Load (r54 kept Load beside it)', b);
    await page.click('#view [data-act="demoClear"]'); await wait(200);
    const c = await more();
    ok(c.acts.includes('demoLoad') && !c.acts.includes('demoClear'), 'cleared, Load demo data is back', c.acts);
    await ev(() => { window.__ironlog.log('test', new Error('A planted error')); });
    const d = await more();
    ok(/1 logged error/.test(d.text) && /A planted error/.test(d.text) && d.acts.includes('diagCopy') && d.acts.includes('diagClear'), 'once an error is logged, Diagnostics shows the count, the error, Copy diagnostics and Clear log (a guard: r54 showed them)', d);
    await page.click('#view [data-act="diagClear"]'); await wait(150);
    const e = await more();
    ok(!/logged error/.test(e.text) && !e.acts.includes('diagCopy'), 'Clear log goes back to the version alone', e);
    await ev(() => { window.__ironlog.ui.tab = 'today'; window.__ironlog.render(); });
  }

  // ---- (d) PENDING 319: a lift trained in two rep ranges reads falling only when it falls in each.
  {
    // Bench on a heavy day (3 to 5, 5 sets) and a light day (8 to 12, 4 sets), each session [days from today, load, reps].
    const hl = (heavy, light) => ev(([heavy, light]) => {
      const L = window.__ironlog; const s = L.state; s.settings.unit = 'kg';
      const it = (uid, sets, lo, hi) => ({ uid, exId: 'bench', sets, repMin: lo, repMax: hi, rir: 1, rest: 150, inc: 2.5, ss: null });
      const rest = n => ({ id: 'hlr' + n, name: 'Rest', rest: true, items: [] });
      const Rt = { id: 'hl2', name: 'Heavy and light', schedule: 'cycle', days: [{ id: 'hlH', name: 'Heavy', rest: false, items: [it('h1', 5, 3, 5)] }, rest(1), rest(2), { id: 'hlL', name: 'Light', rest: false, items: [it('l1', 4, 8, 12)] }, rest(3), rest(4), rest(5)] };
      const one = (id, di, rr, k) => ([n, w, r]) => ({ id: id + n, date: L.addDays('2026-10-15', n), dayIdx: di, dayId: Rt.days[di].id, dayName: Rt.days[di].name, routineId: Rt.id, notes: '', ex: [{ exId: 'bench', rr, sets: Array.from({ length: k }, () => ({ w, r, rir: 1, done: true })) }] });
      s.sessions = [...heavy.map(one('hv', 0, [3, 5], 5)), ...light.map(one('lt', 3, [8, 12], 4))].sort((a, b) => (a.date < b.date ? -1 : 1));
      s.routines = [...s.routines.filter(r => r.id !== Rt.id), Rt]; s.activeRoutineId = Rt.id; s.draft = null; s.injuries = []; s.deloadWeek = null;
      L.state = L.normalize(s); L.invalidate(); L.saveNow();
      const st = L.IDX().exStats.bench; const d = document.createElement('div'); d.innerHTML = L.exHeadline('bench'); const tr = document.createElement('div'); tr.innerHTML = L.liftTrend('bench');
      const sc = L.IDX().scores.find(x => x.m === 'chest');
      return { falling: st.falling, stalled: st.stalled, head: d.innerText.replace(/\s*i$/, ''), tip: (d.querySelector('[data-tip]') || { dataset: {} }).dataset.tip || '', trend: tr.innerText, coach: L.coach().text, chest: sc ? sc.label : null };
    }, [heavy, light]);
    const weeks = (f, g) => [0, 1, 2, 3, 4, 5].map(i => [-1 - 7 * (5 - i) - f, ...g(i)]);
    // Six weeks: the heavy day a step heavier each week, the light day's reps falling, the light day last.
    const a = await hl(weeks(3, i => [100 + 2.5 * i, 5]), weeks(0, i => [70, [12, 11, 10, 9, 8, 8][i]]));
    ok(!a.falling && /^Down over 5 weeks in the 8 to 12 range: 70×12 to 70×8; not in the 3 to 5 range\.$/.test(a.head), 'bench up a step a week on its heavy day (3 to 5) and its light day\'s reps falling (8 to 12), the light day last: not read as falling, and the line says which range is down: ' + a.head + ' (r54: falling, "Look at recovery")', a);
    ok(/falls in each/.test(a.tip) && !/falling/i.test(a.coach) && a.chest !== 'lagging', 'its tip says the rule, the coach does not call chest strength falling, and chest is not read as lagging', a);
    ok(/^Est\. 1RM 93\.5 → 90 → 90 kg/.test(a.trend), 'the lift\'s history line shows the light day\'s last three estimates only, the range its word reads: ' + a.trend + ' (r54 mixed in the heavy day\'s)', a.trend);
    const b = await hl(weeks(0, i => [100 + 2.5 * i, 5]), weeks(3, i => [70, [12, 11, 10, 9, 8, 8][i]]));
    ok(!b.falling && /^Est\. 1RM up about [\d.]+ kg over 5 weeks in the 3 to 5 range\.$/.test(b.head), 'the heavy day last: up, the range named: ' + b.head, b);
    // Both falling, the heavy day 2.5 kg a week lighter for four weeks (under the tenth that reads a session as done lighter)
    // and the light day's reps over two (not yet a stall there, which needs 4 sessions over 3 weeks): falling, not stalled.
    const c = await hl([[-25, 102.5, 5], [-18, 100, 5], [-11, 97.5, 5], [-4, 95, 5]], [[-15, 70, 12], [-8, 70, 10], [-1, 70, 8]]);
    ok(c.falling && !c.stalled && /^Down over 2 weeks in the 8 to 12 range: 70×12 to 70×8\. Look at recovery before adding work\.$/.test(c.head), 'falling in both ranges: falling, with the advice: ' + c.head + ' (a guard but for the range named: r54 called this falling too)', c);
    // The same with the heavy day rising: not falling.
    const e = await hl([[-18, 90, 5], [-11, 95, 5], [-4, 100, 5]], [[-15, 70, 12], [-8, 70, 10], [-1, 70, 8]]);
    ok(!e.falling && /; not in the 3 to 5 range\.$/.test(e.head) && !/falling/i.test(e.coach), 'and with the heavy day rising instead: not falling, the light day\'s range named as down: ' + e.head, e);
    // The heavy day trained once in the window: its range is in use with too few sessions to read, so the lift is not read as falling,
    // and the line says that range cannot tell yet (the review of r55: it said the lift was "not" down there, with no reading behind it).
    const q = await hl([[-11, 100, 5]], [[-15, 70, 12], [-8, 70, 10], [-1, 70, 8]]);
    ok(!q.falling && /^Down over 2 weeks in the 8 to 12 range: 70×12 to 70×8; too few sessions in the 3 to 5 range to tell\.$/.test(q.head), 'the heavy day done once in the window: not read as falling, and the line says the 3 to 5 range has too few sessions to tell: ' + q.head, q);
  }

  // ---- (e) Logging, from the journey audit of r54 (each the same on r53 unless it says so).
  {
    await ev(() => { const L = window.__ironlog; L.state.activeRoutineId = L.state.routines[0].id; L.state.settings.unit = 'lb'; L.saveNow(); });
    await log([ses('e1', '2026-10-08', 'bench', [6, 10], [[100 * LB, 8], [100 * LB, 8]]), ses('e2', '2026-10-08', 'bbRow', [6, 10], [[135 * LB, 8], [135 * LB, 8]])]);
    const two = (n) => ev(n => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench' || b.exId === 'bbRow'); for (const b of d.ex) b.sets.length = n; d._rampAsked = true; L.saveNow(); L.render(); }, n);
    const Wb = (b, s) => `.sg input[data-f="w"][data-b="${b}"][data-s="${s}"]`, Rb = (b, s) => `.sg input[data-f="r"][data-b="${b}"][data-s="${s}"]`;
    const blank = async () => { const pt = await ev(() => { const r = document.querySelector('.ph .meta').getBoundingClientRect(); return { x: r.right - 5, y: r.top + r.height / 2 }; }); await page.mouse.click(pt.x, pt.y); await wait(250); };
    const set = (b, s) => ev(([b, s]) => { const x = window.__ironlog.state.draft.ex[b].sets[s]; return { w: x.w, r: x.r, done: !!x.done, warm: !!x.warm }; }, [b, s]);
    const fields = (b, s) => ev(([b, s]) => { const w = document.querySelector(`.sg input[data-f="w"][data-b="${b}"][data-s="${s}"]`), r = document.querySelector(`.sg input[data-f="r"][data-b="${b}"][data-s="${s}"]`); return { w: w && w.value, r: r && r.value, wph: w && w.placeholder, rph: r && r.placeholder }; }, [b, s]);
    // A decimal load typed while the exercise above folds (1.2 s after its last tick) keeps its decimal (r54 stored 1525 for 152.5).
    await two(2);
    await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(150); await page.click('[data-act="sDone"][data-b="0"][data-s="1"]');
    await page.click(Wb(1, 0)); await page.keyboard.type('152.'); await wait(1700); await page.keyboard.type('5'); await wait(200);
    const fold = await ev(() => !!document.querySelector('#blk-0.folded'));
    const dec = await fields(1, 0); const decS = await set(1, 0);
    ok(fold && dec.w === '152.5' && near(decS.w, 152.5 * LB), 'typing 152.5 into the next exercise\'s load while the one above folds: the field and the log keep 152.5 (r54 made it 1525)', { fold, dec, decS });
    // Clearing a ticked set's reps unticks it, and leaving the field does not tick it again at the grey reps.
    await page.click(Rb(1, 0)); await page.keyboard.type('9'); await blank();
    const t1 = await set(1, 0);
    await page.click(Rb(1, 0)); await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await blank();
    const t2 = await set(1, 0);
    ok(t1.done && t1.r === 9 && !t2.done && t2.r == null, 'barbell row 152.5 x 9 ticked, then its reps cleared and the field left: unticked and empty (r54 ticked it again at the grey 8)', { t1, t2 });
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
    // A checkmark tapped by mistake and tapped again: the row goes back to grey, and Finish does not offer to save it.
    await two(3);
    const g0 = await fields(0, 1);
    await page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await wait(200); await page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await wait(200);
    const g1 = await fields(0, 1); const gs = await set(0, 1);
    ok(!gs.done && gs.w == null && gs.r == null && g1.w === '' && g1.r === '' && g1.wph === g0.wph && g1.rph === g0.rph, 'bench set 2 ticked from its grey numbers and unticked: back to grey, nothing typed (r54 left 100 and 8 typed in)', { g0, g1, gs });
    await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(150);
    await finish(); const fms = [];
    for (let k = 0; k < 3; k++) { const m = await modal(); if (!m || m.kind !== 'confirm') break; fms.push(m.title); if (/not marked done/.test(m.title)) break; await page.click('#modal [data-act="mOk"]'); await wait(200); }
    ok(!fms.some(t => /not marked done/.test(t)), 'Finish then asks nothing about that set (r54 offered to mark it done and save it)', fms);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.draft = null; L.saveNow(); L.render(); });
    // The same on the exercise below untouched ones: ticked by mistake it moves up; unticked within half a minute it goes back.
    await two(2);
    const order = () => ev(() => window.__ironlog.state.draft.ex.map(b => b.exId).join(','));
    const o0 = await order();
    await page.click('[data-act="sDone"][data-b="1"][data-s="0"]'); await wait(1600);
    const o1 = await order();
    await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(1600);
    const o2 = await order();
    ok(o0 === 'bench,bbRow' && o1 === 'bbRow,bench' && o2 === 'bench,bbRow', 'barbell row\'s first set ticked by mistake moves it above the untouched bench; unticked, it goes back below (r54 left it moved): ' + [o0, o1, o2].join(' then '), { o0, o1, o2 });
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
    // Reps far past anything, put off with Cancel: Finish's offer to mark sets done asks about them again rather than saving them.
    await two(2);
    await ev(() => { const d = window.__ironlog.state.draft; d.ex = d.ex.slice(0, 1); window.__ironlog.render(); });
    await typ(Wb(0, 0), 100); await typ(Rb(0, 0), 8); await tick(0);
    await typ(Rb(0, 1), 80); const q1 = await modal();
    if (q1) await ev(() => window.__ironlog.ACT.mClose());
    await finish(); const q2 = await modal();
    if (q2 && /not marked done/.test(q2.title)) { await page.click('#modal [data-act="mOk"]'); await wait(200); }
    const q3 = await modal(); const kept = await ev(() => !!window.__ironlog.state.draft);
    ok(q1 && /far past/.test(q1.text) && q3 && q3.kind === 'confirm' && /80 reps is far past/.test(q3.text) && kept, 'bench 100 x 80 typed (for 8): asked, put off with Cancel, then Finish\'s Mark it done asks about the 80 reps again, nothing saved yet (r54 saved 80 reps with a Rep PR)', { q1, q2, q3, kept });
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.draft = null; L.saveNow(); L.render(); });
    // Half reps: the field shows the whole reps stored (8 for 8.5, a partial rep is not a rep).
    await two(1);
    await typ(Wb(0, 0), 100); await typ(Rb(0, 0), '8.5');
    const hr = await fields(0, 0); const hs = await set(0, 0);
    ok(hs.r === 8 && hr.r === '8', '8.5 typed as reps: 8 stored and shown (r54 stored 9 and showed 8.5)', { hr, hs });
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
    // Warm-ups with reps typed but not ticked are asked about at Finish, as the Guide says, and kept when marked done.
    await ev(() => { const L = window.__ironlog; L.state.settings.autoDone = false; L.saveNow(); });
    await two(2);
    await ev(() => { const L = window.__ironlog; L.ACT.wAdd({ dataset: { b: '0' } }); });
    await typ(Rb(0, 0), 10);
    await page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await wait(120); await page.click('[data-act="sDone"][data-b="0"][data-s="2"]'); await wait(120);
    await ev(() => { const d = window.__ironlog.state.draft; d.ex = d.ex.slice(0, 1); });
    await finish(); const wq = await modal();
    ok(wq && /not marked done/.test(wq.title), 'auto-mark off, a warm-up with 10 reps typed and not ticked: Finish asks about it (r54 dropped it without a word)', wq);
    if (wq && /not marked done/.test(wq.title)) { await page.click('#modal [data-act="mOk"]'); await wait(200); }
    const ws = await ev(() => { const s = window.__ironlog.state.sessions.filter(q => q.date === '2026-10-15').pop(); return s ? s.ex[0].sets.map(x => [x.warm ? 'W' : '', x.r]) : null; });
    ok(JSON.stringify(ws) === '[["W",10],["",8],["",8]]', 'marked done, the warm-up is saved with the working sets: ' + JSON.stringify(ws), ws);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.settings.autoDone = true; L.state.sessions = L.state.sessions.filter(q => q.date !== '2026-10-15'); L.invalidate(); L.saveNow(); });
    // A warm-up with no load is not called a hard set at Finish.
    await two(2);
    await page.click('[data-act="sWarm"][data-b="0"][data-s="0"]'); await wait(150);
    await ev(() => { const x = window.__ironlog.state.draft.ex[0].sets[0]; x.w = null; });
    await typ(Rb(0, 0), 10); await tick(0); await tick(1);
    await ev(() => { const d = window.__ironlog.state.draft; d.ex = d.ex.slice(0, 1); });
    await finish(); const hq = await modal();
    ok(!(hq && /hard sets/.test(hq.text)), 'a warm-up of 10 reps with no load: Finish does not say it counts as a hard set (r54 asked for its load, saying so)', hq);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.draft = null; L.state.sessions = L.state.sessions.filter(q => q.date !== '2026-10-15'); L.invalidate(); L.saveNow(); L.render(); });
    // A long timed hold is asked about in seconds.
    await ev(() => { const L = window.__ironlog; L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; const b = L.newBlock('plank', L.planFor('plank', L.activeRoutine(), null), {}); d.ex = [b]; b.sets.length = 1; d._rampAsked = true; L.saveNow(); L.render(); });
    await typ(Rb(0, 0), 150); const pq = await modal();
    ok(pq && /150 seconds is far past/.test(pq.text) && !/reps/.test(pq.text), 'a plank of 150 s typed: the question speaks of seconds (r54: "150 reps")', pq);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.draft = null; L.saveNow(); L.render(); });
  }

  // ---- After Erase everything the first page is all there is, so it carries the Undo (r54 had it only in Settings, out of reach).
  {
    await log([ses('er1', '2026-10-08', 'bench', [6, 10], [[100 * LB, 8]])]);
    await ev(() => window.__ironlog.ACT.resetAll()); await wait(150); await page.click('#modal [data-act="mOk"]'); await wait(6800);
    const ob = await ev(() => { const p = document.getElementById('obPage'); return { page: !!p, undo: !!(p && p.querySelector('[data-act="undo"]')) }; });
    ok(ob.page && ob.undo, 'Erase everything, and 6.5 s later (the toast gone): the first page offers Undo last delete or reset (r54 offered it nowhere on that page)', ob);
    if (ob.undo) { await page.click('#obPage [data-act="undo"]'); await wait(400); }
    const back = await ev(() => window.__ironlog.state.sessions.map(s => s.id));
    ok(JSON.stringify(back) === '["er1"]', 'and tapping it brings the log back', back);
  }
  // ---- Back on a sheet with something typed in it keeps it open, as a tap outside it does (r54 closed it and lost the text).
  {
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'today'; L.saveNow(); L.render(); });
    await ev(() => window.__ironlog.ACT.cardioNew()); await wait(300);
    await page.fill('#modal input[inputmode="numeric"], #modal input[inputmode="decimal"]', '35'); await wait(150);
    await page.goBack(); await wait(400);
    const b1 = await ev(() => ({ open: !!window.__ironlog.ui.modal, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').innerText }));
    ok(b1.open && /Your changes are still here/.test(b1.toast), 'the cardio sheet with 35 typed, then Back: it stays open and says why (r54 closed it)', b1);
    await ev(() => window.__ironlog.ACT.mClose()); await wait(200);
    const b2 = await ev(() => !!window.__ironlog.ui.modal);
    ok(!b2, 'Cancel still closes it', b2);
  }
  // ---- The rest timer stops when the session is gone: erased, or a backup restored over it (r54 left it running).
  {
    const timerOn = () => ev(() => !document.getElementById('timer').hidden);
    await log([]);
    await ev(() => { const L = window.__ironlog; L.state.settings.timerMode = 'auto'; L.saveNow(); });
    await start('bench', 2);
    await typ(W(0), 100); await typ(R(0), 8); await tick(0);
    const t0 = await timerOn();
    await ev(() => window.__ironlog.ACT.resetAll()); await wait(150); await page.click('#modal [data-act="mOk"]'); await wait(300);
    const t1 = await timerOn();
    ok(t0 && !t1, 'a set ticked starts the rest timer; Erase everything stops it (r54 kept it running on the first page)', { t0, t1 });
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'lb'; L.state.settings.timerMode = 'auto'; L.saveNow(); L.render(); });
    await start('bench', 2);
    await typ(W(0), 100); await typ(R(0), 8); await tick(0);
    const t2 = await timerOn();
    const backup = await ev(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); s.draft = null; return JSON.stringify({ app: 'ironlog', state: s }); });
    await ev(b => window.__ironlog.importData(b), backup); await wait(200);
    for (let k = 0; k < 2; k++) { const m = await modal(); if (m && m.kind === 'confirm') { await page.click('#modal [data-act="mOk"]'); await wait(300); } }
    const t3 = await timerOn(); const dr = await ev(() => !!window.__ironlog.state.draft);
    ok(t2 && !dr && !t3, 'a backup restored over a session in progress stops the timer too (r54 kept it running)', { t2, dr, t3 });
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
  }

  // ---- The app's own CSV read back through Import keeps session notes, minutes, missed sets and cardio (r54 lost them).
  {
    await log([{ ...ses('cv1', '2026-10-08', 'bench', [6, 10], [[100 * LB, 8], [120 * LB, 0], [100 * LB, 7]]), notes: 'felt strong', durMin: 61 }]);
    await ev(() => { const L = window.__ironlog; L.state.cardio = [{ id: 'k1', date: '2026-10-09', kind: 'run', min: 30, hr: 150, when: 'post', dist: 5, note: 'easy' }]; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); });
    const keep = await ev(() => JSON.stringify({ r: window.__ironlog.state.routines, a: window.__ironlog.state.activeRoutineId }));
    const csv = await ev(async () => { const L = window.__ironlog; let out = null; window.claude = { use: async k => (k === 'downloads' ? { save: async o => { out = o.data; } } : null) }; await L.exportCSV(); delete window.claude; return out; });
    await ev(() => { const L = window.__ironlog; L.state.sessions = []; L.state.cardio = []; L.invalidate(); L.saveNow(); L.render(); });
    await ev(t => window.__ironlog.impStart({ text: t }), csv); await wait(300);
    await page.click('#modal [data-act="impGo"]'); await wait(500);
    const back = await ev(() => { const L = window.__ironlog; const s = L.state.sessions[0]; const c = L.state.cardio[0]; return { s: s ? { note: s.notes, dur: s.durMin, sets: s.ex[0].sets.map(x => [Math.round(x.w / 0.45359237), x.r]) } : null, c: c ? { kind: c.kind, min: c.min, hr: c.hr, when: c.when, dist: c.dist, note: c.note } : null }; });
    ok(back.s && back.s.note === 'felt strong' && back.s.dur === 61 && JSON.stringify(back.s.sets) === '[[100,8],[120,0],[100,7]]', 'a session exported to CSV and imported back keeps its note, its 61 minutes and its missed set (r54: no note, no minutes, the missed set dropped)', back.s);
    ok(back.c && back.c.kind === 'run' && back.c.min === 30 && back.c.hr === 150 && back.c.when === 'post' && Math.abs(back.c.dist - 5) < 0.01 && back.c.note === 'easy', 'and the run keeps its 30 minutes, heart rate, when, 5 km and note (r54 left it out, "minutes are needed")', back.c);
    await ev(k => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); const o = JSON.parse(k); L.state.routines = o.r; L.state.activeRoutineId = o.a; L.state.cardio = []; L.saveNow(); }, keep);
  }

  // ---- (g) Swaps and lighter days on the session screen, from the journey audit of r54.
  {
    await log([ses('sw1', '2026-10-08', 'incDb', [8, 12], [[50 * LB, 10], [50 * LB, 10], [50 * LB, 10]]), ses('sw2', '2026-10-08', 'bbRow', [6, 10], [[135 * LB, 8], [135 * LB, 8], [135 * LB, 8]])]);
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; L.saveNow(); });
    const dayOf = id => ev(id => String(window.__ironlog.activeRoutine().days.findIndex(d => d.items.some(i => i.exId === id))), id);
    const startDay = (di, keep) => ev(([di, keep]) => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: di, light: '0' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === keep); d._rampAsked = true; L.ui.tab = 'today'; L.saveNow(); L.render(); }, [di, keep]);
    const swapTo = async (bi, id) => { await page.click(`#blk-${bi} [data-act="bMenu"]`); await wait(150); await page.click('#modal [data-act="bMenuDo"][data-op="bSwap"]'); await wait(200); await ev(id => document.querySelector(`#pickList .pick[data-ex="${id}"]`).click(), id); await wait(250); };
    // Update the routine after a swap: the day takes the plan the new lift was done at (r54 kept the old lift's).
    await startDay(await dayOf('incDb'), 'incDb');
    await swapTo(0, 'cableFly');
    const inS = await ev(() => { const p = window.__ironlog.state.draft.ex[0].plan; return { id: window.__ironlog.state.draft.ex[0].exId, range: p.repMin + '-' + p.repMax, rir: p.rir, rest: p.rest }; });
    const n = await ev(() => window.__ironlog.state.draft.ex[0].sets.length);
    for (let si = 0; si < n; si++) { await typ(W(si), 30); await typ(R(si), 12); await tick(si); }
    await finish(); for (let k = 0; k < 3; k++) { const m = await modal(); if (!m || m.kind !== 'confirm') break; await page.click('#modal [data-act="mOk"]'); await wait(200); }
    const hasUpd = await ev(() => !!document.querySelector('#modal [data-act="applyUpd"]'));
    if (hasUpd) { await page.click('#modal [data-act="applyUpd"]'); await wait(250); }
    const it = await ev(() => { const R = window.__ironlog.activeRoutine(); for (const d of R.days) { const i = d.items.find(x => x.exId === 'cableFly' && d.items.some(y => y.exId !== 'cableFly') && !d.items.some(y => y.exId === 'incDb')); if (i && d.name === 'Upper B') return { range: i.repMin + '-' + i.repMax, rir: i.rir, rest: i.rest }; } return null; });
    ok(inS.id === 'cableFly' && hasUpd && it && it.range === inS.range && it.rir === inS.rir && it.rest === inS.rest, 'incline press swapped for cable fly (done at ' + inS.range + '), then Update the day at Finish: the day plans cable fly as it was done (r54 kept the incline press\'s 8-12, 2 RIR and 120 s)', { inS, it });
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    // A swap on an exercise with every set logged asks: move the sets (logged on the wrong lift) or add the new one after it.
    await startDay(await dayOf('bbRow'), 'bbRow');
    const nr = await ev(() => window.__ironlog.state.draft.ex[0].sets.length);
    for (let si = 0; si < nr; si++) { await typ(W(si), 135); await typ(R(si), 8); await tick(si); }
    await wait(1500); if (await page.$('[data-act="bOpen"][data-b="0"]')) { await page.click('[data-act="bOpen"][data-b="0"]'); await wait(150); }
    await swapTo(0, 'dbRow');
    const q = await modal();
    ok(q && q.kind === 'confirm' && /Every set of Barbell Row is logged/.test(q.title) && q.buttons.join('|') === 'Move the sets|Add One-Arm DB Row|Cancel', 'barbell row with every set ticked, then Swap to dumbbell row: asked whether to move the sets or add it (r54 added it with one set "for the sets left")', q);
    if (q) { await page.click('#modal [data-act="mOk"]'); await wait(250); }
    const mv = await ev(() => window.__ironlog.state.draft.ex.map(b => [b.exId, b.sets.filter(x => x.done).length]));
    ok(JSON.stringify(mv) === `[["dbRow",${nr}]]`, 'Move the sets: the ' + nr + ' sets are on dumbbell row now, and nothing is left on barbell row', mv);
    await ev(() => window.__ironlog.ACT.undo()); await wait(200);
    const un = await ev(() => window.__ironlog.state.draft.ex.map(b => [b.exId, b.sets.filter(x => x.done).length]));
    ok(JSON.stringify(un) === `[["bbRow",${nr}]]`, 'and Undo puts them back on barbell row', un);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
    // Two sets removed with − Set, both beaten: the screen and the recap do not call the target beaten, since the target repeats.
    await log([ses('ms1', '2026-10-01', 'bench', [6, 10], [[100 * LB, 8], [100 * LB, 8], [100 * LB, 8], [100 * LB, 8]]), ses('ms2', '2026-10-08', 'bench', [6, 10], [[100 * LB, 8], [100 * LB, 8], [100 * LB, 8], [100 * LB, 8]])]);
    await start('bench');
    const tg0 = await ev(() => window.__ironlog.state.draft.ex[0].target);
    for (let k = 0; k < 2; k++) { await page.click('[data-act="sDel"][data-b="0"]'); await wait(150); }
    for (let si = 0; si < 2; si++) { await typ(W(si), 100); await typ(R(si), 10); await tick(si); }
    const pr = await ev(() => { const el = document.getElementById('tp-0'); return el ? { text: el.innerText, beat: el.classList.contains('beat') } : null; });
    await finish(); let rc2 = null;
    for (let k = 0; k < 3; k++) { const m = await modal(); if (!m) break; if (m.kind === 'recap') { rc2 = m.text; break; } await page.click('#modal [data-act="mOk"]'); await wait(200); }
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const nx2 = await ev(() => window.__ironlog.suggest('bench', { sets: 4, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 2.5 }, {}).target);
    ok(pr && !pr.beat && /Fewer sets than usual: the target stays/.test(pr.text) && !/target beaten/.test(rc2 || '') && nx2 === tg0, 'bench 100 x 8 x 4 twice, then two sets removed and 100 x 10 x 2 done: the screen says the target stays, the recap counts nothing beaten, and the next target is the same ' + tg0 + ' (r54 said "Beaten" and "1 of 1 exercise target beaten")', { pr, rc2, tg0, nx2 });
    // A lighter day's header says the effort the day asks for, as the target line does, in the lifter's scale.
    await log([ses('lt1', '2026-10-08', 'bbRow', [6, 10], [[135 * LB, 8], [135 * LB, 8], [135 * LB, 8]])]);
    for (const sc of [undefined, 'rpe']) {
      await ev(sc => { const L = window.__ironlog; if (sc) L.state.settings.rirScale = sc; else delete L.state.settings.rirScale; L.saveNow(); }, sc);
      await ev(di => { const L = window.__ironlog; L.ACT.startSession({ dataset: { day: di, light: '1' } }); const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bbRow'); L.ui.tab = 'today'; L.saveNow(); L.render(); }, await dayOf('bbRow'));
      const hd = await ev(() => { const b = document.getElementById('blk-0'); return { head: b.querySelector('.bh .small').innerText, hint: b.querySelector('.hint') ? b.querySelector('.hint').innerText : '' }; });
      const want = sc === 'rpe' ? 'RPE 7 or less' : '3+ RIR';
      const said = sc === 'rpe' ? 'RPE 7 or less' : '3 or more reps in reserve';
      ok(hd.head.includes('@' + want) && hd.hint.includes(said), 'a Lighter day' + (sc ? ' on the RPE scale' : '') + ': the header says @' + want + ' and the line under it ' + said + ' (r54: the plan\'s effort in the header' + (sc ? ', and "reps in reserve" on the RPE scale' : '') + ')', hd);
      await ev(() => { const L = window.__ironlog; L.state.draft = null; delete L.state.settings.rirScale; L.saveNow(); L.render(); });
    }
  }

  // ---- (f) The sessions after, from the journey audit of r54.
  {
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'kg'; L.saveNow(); });
    const sx = (id, date, exId, rr, sets) => ses(id, date, exId, rr, sets.map(([w, r]) => [w, r]));
    const xs = (w, reps) => reps.map(r => [w, r]);
    const next = (exId, plan) => ev(([exId, plan]) => { const g = window.__ironlog.suggest(exId, plan, {}); return { target: g.target, text: g.text, lastR: g.lastR }; }, [exId, plan]);
    const P4 = { sets: 4, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 2.5 }, P3 = { ...P4, sets: 3, rir: 1 };
    const greys = () => ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; return b.sets.map((x, i) => L.greyR(b, i)); });
    // A session stopped short at another load: the target goes back to the last full session's load, and so do the grey reps (new in r54).
    await log([sx('f1', '2026-10-01', 'bench', [6, 10], xs(80, [9, 9, 9, 8])), sx('f2', '2026-10-05', 'bench', [6, 10], xs(80, [9, 9, 9, 9])), sx('f3', '2026-10-08', 'bench', [6, 10], xs(85, [6, 6]))]);
    await start('bench');
    const g1 = await greys(); const tg1 = await ev(() => window.__ironlog.state.draft.ex[0].target || '');
    ok(JSON.stringify(g1) === '[9,9,9,9]' && /37\+ reps over 4 sets at 80 kg/.test(tg1), 'bench 80 x 9 x 4, then 85 x 6 and 6 stopped short: the target is at 80 kg again, and the grey reps are the 9s done there (r54 greyed the 6s done at 85)', { g1, tg1 });
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
    // A guard: stopped short at the same load, its reps are the grey ones.
    await log([sx('f1', '2026-10-01', 'bench', [6, 10], xs(80, [9, 9, 9, 8])), sx('f2', '2026-10-05', 'bench', [6, 10], xs(80, [9, 9, 9, 9])), sx('f3', '2026-10-08', 'bench', [6, 10], xs(80, [10, 10]))]);
    await start('bench'); const g2 = await greys();
    ok(g2[0] === 10 && g2[1] === 10, 'stopped short at the same load (80 x 10 and 10), its 10s are the grey reps (a guard)', g2);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
    // An extra set past the plan's four does not hold the step back.
    await log([sx('g1', '2026-10-01', 'bench', [6, 10], xs(80, [8, 8, 8, 8])), sx('g2', '2026-10-05', 'bench', [6, 10], xs(80, [9, 9, 8, 8])), sx('g3', '2026-10-08', 'bench', [6, 10], xs(80, [10, 10, 10, 10, 8]))]);
    const n4 = await next('bench', P4);
    ok(/^82\.5 kg for \d+\+ reps in every set$/.test(n4.target), 'bench 80 x 10 x 4 on a 4-set plan and a fifth set of 8: the load steps up (r54 asked 41+ reps over 4 sets): ' + n4.target, n4);
    // Reps past the top count as the top: the target stays inside the range, and doing it is a beaten target that steps the load.
    await log([sx('h1', '2026-09-24', 'bench', [6, 10], xs(70, [9, 9, 8, 8])), sx('h2', '2026-10-01', 'bench', [6, 10], xs(70, [11, 11, 9, 10]))]);
    const n5 = await next('bench', P4);
    ok(n5.target === '40+ reps over 4 sets at 70 kg' && /a set past 10 counts as 10/.test(n5.text), 'after 70 x 11, 11, 9 and 10 on 6 to 10: 40+ reps over 4 sets, the 11s counted as 10 (r54 asked 42+, past what the range holds): ' + n5.target, n5);
    await start('bench');
    for (let si = 0; si < 4; si++) { await typ(W(si), 70); await typ(R(si), 10); await tick(si); }
    await finish(); let rc = null;
    for (let k = 0; k < 3; k++) { const m = await modal(); if (!m) break; if (m.kind === 'recap') { rc = m.text; break; } await page.click('#modal [data-act="mOk"]'); await wait(200); }
    const n5b = await next('bench', P4);
    ok(/1 of 1 exercise target beaten/.test(rc || '') && /^72\.5 kg/.test(n5b.target), 'then 70 x 10 x 4: the recap counts the target beaten, and the next session steps up (r54 said 0 of 1 beaten, then stepped up)', { rc, n5b });
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    // A weighted pull-up with no weigh-in is stepped as any loaded lift (r54 judged the step against the added load alone).
    await log([sx('p1', '2026-10-01', 'pullup', [6, 10], xs(5, [10, 10, 10])), sx('p2', '2026-10-08', 'pullup', [6, 10], xs(5, [10, 10, 10]))]);
    await ev(() => { const L = window.__ironlog; L.state.bodyweights = []; L.invalidate(); });
    const p5 = await next('pullup', P3);
    await log([sx('p1', '2026-10-01', 'pullup', [6, 10], xs(20, [10, 10, 10])), sx('p2', '2026-10-08', 'pullup', [6, 10], xs(20, [10, 10, 10]))]);
    const p20 = await next('pullup', P3);
    ok(p5.target === 'BW+7.5 for 6+ reps in every set' && p20.target === 'BW+22.5 for 6+ reps in every set', 'pull-ups at BW+5 and at BW+20 for 10 x 3, no weigh-in: the next step and the bottom of the range, as with a weigh-in (r54: "building to 13" and "5+ reps"): ' + p5.target + '; ' + p20.target, { p5, p20 });
    // An assisted lift at no help is not asked to take help off (r54: BW+2.5, "take 2.5 kg of help off").
    await log([sx('a1', '2026-10-01', 'assistPullup', [6, 10], xs(0, [10, 10, 10])), sx('a2', '2026-10-08', 'assistPullup', [6, 10], xs(0, [10, 10, 10]))]);
    const ap = await next('assistPullup', P3);
    ok(ap.target === '31+ reps over 3 sets at BW' && /With no help left/.test(ap.text) && !/help off/.test(ap.text), 'an assisted pull-up at no help, 10 x 3: more reps at no help, and the lift without the machine after (r54 asked for BW+2.5): ' + ap.target, ap);
    // After a change of units, the bests board and the session's Heaviest line agree with the PR list: 155 lb is 70 kg again, not a record.
    await log([sx('u1', '2026-10-01', 'bench', [6, 10], xs(70, [8, 8, 8])), sx('u2', '2026-10-05', 'bench', [6, 10], xs(70, [8, 8, 8])), sx('u3', '2026-10-08', 'bench', [6, 10], xs(155 * LB, [8, 8, 8]))]);
    const ub = await ev(() => { const L = window.__ironlog; const r = L.allTimeBests('bench'); return { heavy: r.heavy.date, est: r.est.date, front: r.front.map(f => f.date), line: L.bestLine('bench'), prs: L.IDX().prs.filter(p => p.date === '2026-10-08').length }; });
    ok(ub.prs === 0 && ub.heavy === '2026-10-01' && ub.est === '2026-10-01' && ub.front.join() === '2026-10-01' && /^Heaviest 70×8, Oct 1/.test(ub.line), 'bench 70 kg x 8 twice, then 155 lb x 8 at another gym: no PR, and the bests board and the Heaviest line still date the record Oct 1 (r54 showed 70.3 x 8 on Oct 8 as a new heaviest and best estimate)', ub);
    // The PR list names the set the live toast named: of the sets at a new weight, the strongest (r54 named the most reps, beside another set's estimate).
    {
      const raw = (id, date, sets) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: sets.map(([w, r, rir]) => ({ w, r, rir, warm: false, drop: false })) }] });
      await log([raw('w1', '2026-10-01', [[80, 10, 2], [80, 10, 2], [80, 10, 2], [80, 10, 2]]), raw('w2', '2026-10-08', [[82.5, 6, null], [82.5, 10, null], [82.5, 11, null], [82.5, 9, null]])]);
      const wp = await ev(() => window.__ironlog.IDX().prs.filter(p => p.sid === 'w2').map(p => ({ type: p.type, w: p.w, r: p.r, value: p.value && Math.round(p.value * 10) / 10 })));
      ok(wp.length === 1 && wp[0].type === 'Weight PR' && wp[0].r === 10 && wp[0].value === 115.5, 'after 80 x 10 x 4, a session of 82.5 x 6, 10, 11 and 9: the weight PR is 82.5 x 10, whose estimate is the 115.5 it shows (r54 named 82.5 x 11)', wp);
    }
    // A past workout's Heaviest line reads the log as of its day.
    await log([sx('v1', '2026-10-01', 'bench', [6, 10], xs(80, [8, 8, 8])), sx('v2', '2026-10-12', 'bench', [6, 10], xs(82.5, [8, 8, 8]))]);
    const pl = await ev(() => { const L = window.__ironlog; return { past: L.bestLine('bench', '2026-10-05'), now: L.bestLine('bench') }; });
    ok(/^Heaviest 80×8/.test(pl.past) && /^Heaviest 82\.5×8/.test(pl.now), 'a past workout for Oct 5, with 82.5 x 8 logged on Oct 12: its Heaviest line says 80 x 8, as of its day (r54 said 82.5 x 8)', pl);
    // A timed hold seven weeks off is back after a break, as any lift is (r54 asked it to beat its last time).
    await log([sx('pk1', '2026-08-20', 'plank', [30, 60], xs(0, [50, 50, 50])), sx('pk2', '2026-08-27', 'plank', [30, 60], xs(0, [55, 55, 55]))]);
    const pk = await next('plank', { sets: 3, repMin: 30, repMax: 60, rir: 1, rest: 60, inc: 2.5 });
    ok(/Back after 7 weeks/.test(pk.text) && !pk.target && JSON.stringify(pk.lastR) === '[50,50,50]', 'a plank last held 55 s x 3 seven weeks ago: back after 7 weeks, holds about 90% as long (50 s in grey), nothing to beat: ' + pk.text, pk);
    // The Guide's lines on a bad day and on missing the range say the one rule.
    const gd = await ev(() => { const L = window.__ironlog; L.ACT.guideOpen({ dataset: { g: 'rules' } }); const t = document.getElementById('modal').innerText.replace(/\s+/g, ' '); L.ACT.mClose(); return t; });
    ok(/A session clearly below your usual repeats the last target/.test(gd) && /A single session clearly below your usual is not read this way/.test(gd) && !/A bad day, every set under the range at a load you did in it the time before, asks/.test(gd), 'the Guide says a session clearly below the usual repeats the target, where r54 still said one bad day asked for the bottom of the range', gd.slice(0, 200));
  }

  // ---- (h) Plan, the weeks and the screens, from the journey audit of r54.
  {
    const snap = await ev(() => JSON.stringify(window.__ironlog.state));
    const back = () => ev(k => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state = L.normalize(JSON.parse(k)); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); }, snap);
    const openAll = () => ev(() => { const L = window.__ironlog; L.render(); document.querySelectorAll('#view details').forEach(x => { x.open = true; }); L.render(); document.querySelectorAll('#view details').forEach(x => { x.open = true; }); });
    // Sessions on the active routine's training days, in turn, one per date; bench 3 x 8 in each, and `pw` when given.
    const onRoutine = (dates, pw) => ev(([dates, pw]) => { const L = window.__ironlog; const R = L.activeRoutine(); const days = R.days.filter(d => !d.rest);
      return dates.map((date, i) => { const d = days[i % days.length]; return { id: 'rt' + date, date, dayIdx: R.days.indexOf(d), dayId: d.id, dayName: d.name, routineId: R.id, notes: '', ...(pw ? { pw } : {}), ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: 60, r: 8, rir: 2, warm: false, drop: false })) }] }; }); }, [dates, pw || 0]);
    const mtwf = mons => mons.flatMap(m => [0, 1, 3, 4].map(k => new Date(Date.parse(m + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10)));

    // C1: Strength 5 x 5 made active; Plan's header and Today's This week plan the same sets a week.
    await log([]);
    await ev(() => { const L = window.__ironlog; L.state.settings.hidden = []; L.ui.tab = 'program'; L.render(); L.ACT.rTemplate(); document.querySelector('#modal [data-act="tplPick"][data-k="str5"]').click(); L.ACT.rActive(); });
    await ev(() => { window.__ironlog.ui.tab = 'program'; }); await openAll();
    const c1 = await ev(() => { const L = window.__ironlog; const head = document.querySelector('#view .ph .meta').innerText; const hp = document.getElementById('help-pvol'); const help = hp ? hp.textContent : '';
      L.ui.tab = 'today'; L.render(); const wk = document.getElementById('wkSets'); return { head, help, today: wk ? wk.textContent : '' }; });
    const c1n = (/(\d+) planned sets a week/.exec(c1.head) || [])[1], c1t = (/(\d+) hard sets planned|of (\d+) planned/.exec(c1.today) || []).slice(1).find(Boolean);
    ok(c1n && c1n === c1t && /3 sessions a week from its 2 training days/.test(c1.help), 'Strength 5 x 5 made active: Plan\'s header plans ' + c1n + ' sets a week, as Today\'s This week does (' + c1t + '), and Weekly volume says it counts 3 sessions a week from its 2 training days (r54: 46 beside 39, "scaled from a 4-day cycle to 7 days")', c1);
    await back();

    // C2 and C4: a rest week marked under More options on Today.
    await log([]);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.heroMore = false; L.render(); });
    await page.click('[data-act="heroMore"]'); await wait(150); await page.click('[data-act="restWkOpen"]'); await wait(150);
    await page.click('#modal [data-act="restWk"]'); await wait(150); await ev(() => window.__ironlog.ACT.mClose());
    await openAll();
    const rw = await ev(() => { const L = window.__ironlog; const h = document.getElementById('help-wk'); return { rest: L.isRestWeek('2026-10-12'), help: h ? h.textContent : '', bar: [...document.querySelectorAll('#wkbar button')].map(b => b.getAttribute('aria-label')) }; });
    ok(rw.rest && /marked under More options on Today/.test(rw.help), 'a rest week marked under More options on Today: This week\'s help says so (r54 said "marked in Settings", which has no such control)', rw.help);
    ok(rw.bar.length === 7 && rw.bar.every(t => !/planned|missed/.test(t)) && /Mon Oct 12: rest week/.test(rw.bar[0]), 'and the week bar plans nothing in it: no day reads planned or missed, Monday reads rest week (r54: Upper A, planned, under "Rest week. Nothing planned.")', rw.bar);
    await back();

    // C3: Plan > New blank lays out rest days as Build my own does; an exercise added to a rest day makes it a training day by name too.
    await log([]);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); L.ACT.rNew(); });
    await ev(() => { document.getElementById('rNewName').value = 'Blank test'; window.__ironlog.ACT.rNewSave(); });
    const c3 = await ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.name === 'Blank test'); return R ? R.days.map(d => d.rest ? 'rest' : 'train') : null; });
    ok(JSON.stringify(c3) === '["train","rest","train","rest","train","rest","rest"]', 'Plan > New blank: three training days with rest days between, as Build my own lays them out (r54: three training days and no rest, 7 sessions a week)', c3);
    await back();
    const c3b = await ev(() => { const L = window.__ironlog; const R = L.activeRoutine(); const di = R.days.findIndex(d => d.rest); L.ui.tab = 'program'; L.ui.bRoutine = R.id; L.ui.bTarget = di; L.render(); L.ACT.libAdd({ dataset: { ex: 'dbCurl' } }); const d = R.days[di]; return { rest: d.rest, name: d.name }; });
    ok(!c3b.rest && c3b.name === 'Training day', 'an exercise added to the starter\'s rest day: the day trains, and is named Training day, not Rest (r54 kept "Rest", shown on Today and in the week bar)', c3b);
    await back();

    // C6: muscles at a minimum of 0 with nothing logged are on target on the map, as the coach says.
    const bands0 = await ev(() => JSON.stringify(window.__ironlog.state.settings.bands));
    await log([ses('m1', '2026-09-29', 'bench', [6, 10], [[100 * LB, 8], [100 * LB, 8], [100 * LB, 8]]), ses('m2', '2026-10-06', 'bench', [6, 10], [[100 * LB, 8], [100 * LB, 8], [100 * LB, 8]])]);
    await ev(() => { const L = window.__ironlog; for (const m in L.state.settings.bands) L.state.settings.bands[m] = [0, 20]; L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); });
    const c6 = await ev(() => { const L = window.__ironlog; const sub = document.querySelector('[data-mkey="map"] .sec-s'); return { map: sub ? sub.textContent : '', coach: L.coach().text }; });
    const c6m = /(\d+) of (\d+) on target/.exec(c6.map);
    ok(c6m && c6m[1] === c6m[2] && /Every muscle at target/.test(c6.coach), 'every minimum set to 0 and only bench logged: the muscle map says ' + c6.map + ', as the coach says every muscle is at target (r54 counted only the three trained)', c6);
    await ev(b => { const L = window.__ironlog; L.state.settings.bands = JSON.parse(b); L.invalidate(); L.saveNow(); }, bands0);

    // C7 and C8: Finish records what the routine planned a week, and a past week is read by it after the routine changes or goes.
    await log([]);
    await start('bench', 1); await typ(W(0), 100); await typ(R(0), 8); await tick(0); await finish();
    for (let k = 0; k < 3; k++) { const m = await modal(); if (!m) break; if (m.kind === 'confirm') { await page.click('#modal [data-act="mOk"]'); await wait(150); } else { await ev(() => window.__ironlog.ACT.mClose()); break; } }
    const pw = await ev(() => { const L = window.__ironlog; const s = L.state.sessions.find(q => q.date === '2026-10-15'); return s ? s.pw : null; });
    ok(pw === 4, 'a session finished on the four-day starter records that it planned 4 a week (r54 recorded nothing, so a later change rescored its week)', pw);
    await back();
    await ev(async ss => { const L = window.__ironlog; L.state.sessions = ss; L.state.draft = null; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); }, await onRoutine(mtwf(['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']), 4));
    const cons = () => ev(() => { const L = window.__ironlog; L.invalidate(); L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(x => { x.open = true; }); L.render(); document.querySelectorAll('#view details').forEach(x => { x.open = true; }); const t = document.getElementById('view').innerText; return { streak: L.weekStreak().weeks, adh: (/Adherence, previous \d+ full weeks?: (\d+)%/.exec(t) || [])[1] }; });
    const k0 = await cons();
    await ev(() => { const L = window.__ironlog; const R = L.activeRoutine(); const di = R.days.findIndex(d => d.rest); L.ui.tab = 'program'; L.ui.bRoutine = R.id; L.ui.bTarget = di; L.render(); L.ACT.libAdd({ dataset: { ex: 'dbCurl' } }); });
    const k1 = await cons();
    ok(k0.streak === 4 && k0.adh === '100' && k1.streak === 4 && k1.adh === '100', 'four weeks of four sessions on the four-day starter, then a fifth day added in Plan: still a 4-week streak at 100% adherence (r54 rescored them against 5: ' + JSON.stringify(k1) + ')', { k0, k1 });
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); L.ACT.rTemplate(); document.querySelector('#modal [data-act="tplPick"][data-k="ppl6"]').click(); L.ACT.rActive();
      const old = L.state.routines.find(r => r.id !== L.state.activeRoutineId); L.ui.bRoutine = old.id; L.render(); L.ACT.rDel(); const okb = document.querySelector('#modal [data-act="mOk"]'); if (okb) okb.click(); });
    const k2 = await cons();
    const gone = await ev(() => window.__ironlog.state.routines.length);
    ok(gone === 1 && k2.streak === 4 && k2.adh === '100', 'then Push / pull / legs made active and the starter deleted: the weeks trained on it still read 4 of 4 (r54 read them against 6: ' + JSON.stringify(k2) + ')', { gone, k2 });
    await back();

    // C9: bests brought in from June, then the app used from Sep 28: the weeks between are not missed.
    await ev(async ss => { const L = window.__ironlog; const junk = [{ id: 'jn1', date: '2026-06-15', dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: null, sets: [{ w: 80, r: 6, rir: 1, warm: false, drop: false }] }] }, { id: 'jn2', date: '2026-06-17', dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', free: true, notes: '', ex: [{ exId: 'backSquat', rr: null, sets: [{ w: 110, r: 6, rir: 1, warm: false, drop: false }] }] }];
      L.state.sessions = junk.concat(ss); L.state.draft = null; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); }, await onRoutine(mtwf(['2026-09-28', '2026-10-05']).concat(['2026-10-12', '2026-10-13'])));
    const c9 = await cons(); const c9c = await ev(() => { const L = window.__ironlog; const a = L.actualAvg4(); return { coach: L.coach().text, missed: a ? a._missed : null }; });
    ok(c9.adh === '100' && c9c.missed === 0 && !/trained in \d+ of the last/.test(c9c.coach), 'two past workouts from June, then eight sessions from Sep 28 on the starter: adherence 100% and no weeks counted as missed (r54: 50%, and "You trained in 2 of the last 4 weeks")', { c9, c9c });
    await back();

    // C10: pull-ups with no weigh-in: the best set is the most reps, and the trend asks for a weigh-in.
    await log([ses('pu1', '2026-09-17', 'pullup', [6, 10], [[0, 7], [0, 6], [0, 6]]), ses('pu2', '2026-09-24', 'pullup', [6, 10], [[0, 8], [0, 7], [0, 7]]), ses('pu3', '2026-10-01', 'pullup', [6, 10], [[0, 9], [0, 8], [0, 8]]), ses('pu4', '2026-10-08', 'pullup', [6, 10], [[0, 9], [0, 8], [0, 8]])]);
    await ev(() => { const L = window.__ironlog; L.state.bodyweights = []; L.invalidate(); L.saveNow(); L.ui.tab = 'dash'; L.ui.dashEx = 'pullup'; });
    await openAll();
    const c10 = await ev(() => (/Best set[^\n]*/.exec(document.getElementById('view').innerText) || [''])[0]);
    ok(/Best set BW×9/.test(c10) && /A trend needs a weigh-in/.test(c10) && !/A trend needs 3 sessions/.test(c10), 'pull-ups at bodyweight 7, 8, 9 and 9 reps with no weigh-in: Stats says the best set is BW×9 and that a trend needs a weigh-in (r54: BW×7, the first, and "a trend needs 3 sessions" after 4)', c10);

    // And weighted: with no weigh-in a bodyweight lift has no trend, since its readings would be the added load alone (found while fixing C10).
    await log([['2026-09-17', 10], ['2026-09-24', 12.5], ['2026-10-01', 15], ['2026-10-08', 17.5]].map(([d, w], i) => ses('wp' + i, d, 'pullup', [6, 10], [[w, 8], [w, 8], [w, 8]])));
    const wt = async kg => { await ev(kg => { const L = window.__ironlog; L.state.bodyweights = kg ? [{ id: 'bw1', date: '2026-09-01', kg, demo: false }] : []; L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); L.ui.tab = 'dash'; L.ui.dashEx = 'pullup'; }, kg); await openAll(); return ev(() => { const st = window.__ironlog.IDX().exStats.pullup; return { pct: st.pct == null ? null : Math.round(st.pct * 10) / 10, moving: st.moving, line: (/A trend needs a weigh-in[^\n]*|Up[^\n]*over[^\n]*/.exec(document.getElementById('view').innerText) || [''])[0] }; }); };
    const wp0 = await wt(0), wp80 = await wt(80);
    ok(wp0.pct === null && !wp0.moving && /A trend needs a weigh-in/.test(wp0.line) && wp80.pct === 5.4 && wp80.moving, 'pull-ups from BW+10 to BW+17.5 over three weeks: with no weigh-in no trend, and a weigh-in asked for; at an 80 kg weigh-in, up 5.4% (r54 read the added load alone: up 40%)', { wp0, wp80 });

    // C11: on the RPE scale, Plan's effort field is RPE.
    await log([]);
    await ev(() => { const L = window.__ironlog; L.state.settings.rirScale = 'rpe'; L.saveNow(); const R = L.activeRoutine(); const it = R.days[0].items[0]; it.rir = 2; L.ui.tab = 'program'; L.ui.bRoutine = R.id; L.ui.dayFocus = R.days[0].id; L.ui.openItem = it.uid; });
    await openAll();
    const uidc = await ev(() => window.__ironlog.activeRoutine().days[0].items[0].uid);
    const f0 = await ev(u => { const f = document.querySelector(`input[data-it="rir"][data-uid="${u}"]`); return f ? { label: f.closest('label').innerText.trim(), value: f.value } : null; }, uidc);
    if (f0) { await page.fill(`input[data-it="rir"][data-uid="${uidc}"]`, '9'); await page.dispatchEvent(`input[data-it="rir"][data-uid="${uidc}"]`, 'input'); await page.dispatchEvent(`input[data-it="rir"][data-uid="${uidc}"]`, 'change'); await wait(100); }
    const f1 = await ev(() => window.__ironlog.activeRoutine().days[0].items[0].rir);
    ok(f0 && /^Target RPE/.test(f0.label) && f0.value === '8' && f1 === 1, 'on the RPE scale, a plan at 2 in reserve shows Target RPE 8, and typing 9 stores 1 in reserve (r54: Target RIR showing 2, and 9 stored as 9 in reserve, read RPE 1)', { f0, f1 });
    await back();

    // C12: a muscle whose lifts are inside day-to-day noise says so, not "too early".
    await log([[10, 10, 10], [11, 10, 10], [10, 10, 10], [10, 11, 10], [11, 10, 10]].map((p, i) => ses('cu' + i, ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'][i], 'dbCurl', [8, 12], p.map(r => [12, r]))));
    await ev(() => { window.__ironlog.ui.tab = 'dash'; }); await openAll();
    const c12 = await ev(() => { const L = window.__ironlog; const s = L.IDX().scores.find(x => x.m === 'biceps'); const t = document.getElementById('view').innerText; const i = t.indexOf('Strength return on volume'); return { s: s && [s.clear, s.n, !!s.stall], text: t.slice(i, i + 700) }; });
    ok(c12.s && !c12.s[0] && c12.s[1] === 1 && !c12.s[2] && /Strength trend unclear: 1 lift measured, changes within day-to-day noise/.test(c12.text) && !/Too early to tell/.test(c12.text), 'curls flat within day-to-day noise for five weeks: Strength return on volume says biceps\' trend is unclear with 1 lift measured (r54: "Too early to tell: keep logging")', c12);

    // C13: a range changed in Plan reaches the same lift in a blank session.
    await log([]);
    const c13a = await ev(() => { const L = window.__ironlog; L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose(); L.state.draft.ex.push(L.newBlock('bench', L.planFor('bench'), {})); L.saveNow(); const R = L.activeRoutine(); const di = R.days.findIndex(d => d.items.some(i => i.exId === 'bench')); const it = R.days[di].items.find(i => i.exId === 'bench'); L.ui.tab = 'program'; L.ui.bRoutine = R.id; L.ui.dayFocus = R.days[di].id; L.ui.openItem = it.uid; return { uid: it.uid, was: L.state.draft.ex[0].plan.repMin + '-' + L.state.draft.ex[0].plan.repMax }; });
    await openAll();
    for (const [k, v] of [['repMin', '8'], ['repMax', '12']]) { const sel = `input[data-it="${k}"][data-uid="${c13a.uid}"]`; await page.fill(sel, v); await page.dispatchEvent(sel, 'input'); await page.dispatchEvent(sel, 'change'); await wait(100); }
    const c13 = await ev(() => { const p = window.__ironlog.state.draft.ex[0].plan; return p.repMin + '-' + p.repMax; });
    ok(c13a.was !== '8-12' && c13 === '8-12', 'a blank session with bench added (' + c13a.was + ' from the routine), then the routine\'s bench changed to 8 to 12 in Plan before a set: the session\'s bench is 8 to 12 too (r54 kept ' + c13a.was + ')', { c13a, c13 });
    await back();

    // D9 and D10 at 320 px: section summaries are not cut, and Settings' switches and Plan's day names are 44 px tall.
    await page.setViewportSize({ width: 320, height: 700 });
    const cut = [];
    for (const tab of ['program', 'settings', 'dash', 'today']) {
      await ev(t => { const L = window.__ironlog; L.state.settings.hidden = []; L.ui.tab = t; L.render(); }, tab); await wait(150);
      cut.push(...await ev(t => [...document.querySelectorAll('#view summary .sec-s, #view summary .sec-t')].filter(e => e.offsetParent && e.innerText.trim() && e.scrollWidth > e.clientWidth + 1).map(e => t + ': ' + e.innerText.replace(/\s+/g, ' ')), tab));
    }
    ok(cut.length === 0, 'at 320 px no section title or summary is cut (r54 cut Rest timer and logging\'s "auto timer" and Weekly volume\'s "4 under target")', cut);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:timer'] = true; L.render(); });
    const rows = await ev(() => [...document.querySelectorAll('#view label.check-inline')].filter(e => e.offsetParent).map(e => Math.round(e.getBoundingClientRect().height)));
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.folds['program:days'] = true; L.render(); });
    const dn = await ev(() => { const f = document.querySelector('#view input[data-dayname]'); return f ? Math.round(f.getBoundingClientRect().height) : 0; });
    ok(rows.length >= 4 && rows.every(h => h >= 44) && dn >= 44, 'and Settings\' switch rows are at least 44 px tall (' + rows.join(', ') + '; r54: 20), as Plan\'s day name field is (' + dn + '; r54: 40)', { rows, dn });
    await page.setViewportSize({ width: 390, height: 844 });

    // The first-run pages: the update bar, Build my own and Your training in the picker (D8, D11, D12).
    const firstRun = () => ev(() => { const L = window.__ironlog; L.state.sessions = []; L.state.draft = null; L.state.routines = [L.starterRoutine()]; L.state.activeRoutineId = L.state.routines[0].id; L.state.settings.onboarded = false; delete L.state.settings.profile; L.saveNow(); L.ui.tab = 'today'; L.render(); window.scrollTo(0, 0); });
    await firstRun();
    await ev(() => window.ironlogUpdateReady()); await wait(100);
    const d8 = await ev(() => { const b = document.getElementById('updbar').getBoundingClientRect(); const pg = document.getElementById('obPage'); return { bar: [Math.round(b.top), Math.round(b.bottom)], page: pg ? Math.round(pg.getBoundingClientRect().top) : null }; });
    ok(d8.bar[0] <= 1 && d8.page != null && d8.page >= d8.bar[1] - 1, 'a new version ready on the first-run page: the bar sits at the top, above the page, not over it (r54: 52 px down, over the wordmark)', d8);
    await page.click('#updbar [data-act="appUpdateLater"]'); await wait(100);
    await ev(() => { const L = window.__ironlog; L.ui.todayDay = 2; L.ui.folds['program:days'] = false; });
    await page.click('#obPage [data-act="obOwn"]'); await wait(300);
    const d11 = await ev(() => window.__ironlog.state.routines.map(r => r.name));
    const d11b = await ev(() => { const L = window.__ironlog; return { days: L.ui.folds['program:days'], todayDay: L.ui.todayDay }; });
    ok(JSON.stringify(d11) === '["My routine"]', 'Build my own on the first run: My routine replaces the untouched starter, as a ready-made pick does (r54 kept both)', d11);
    ok(d11b.days === true && d11b.todayDay == null, 'and it opens Plan with the days unfolded and no day left picked on Today (a guard: the reviewed r55 lost both to a comment)', d11b);
    await firstRun();
    await page.click('#obPage [data-act="obSample"]'); await wait(250);
    await page.click('#modal [data-act="obProfTog"]'); await wait(150);
    await page.click('#modal [data-act="profSet"][data-k="goal"][data-v="strength"]'); await wait(150);
    await page.click('#modal [data-act="tplPick"][data-k="full3t"]'); await wait(300);
    const d12 = await ev(() => { const L = window.__ironlog; const R = L.activeRoutine(); const it = R.days.flatMap(d => d.items).find(i => i.exId === 'bench'); return { it: it && [it.repMin, it.repMax, it.rir, it.rest], toast: document.getElementById('toast').innerText }; });
    ok(d12.it && d12.it[0] === 3 && d12.it[1] === 6 && d12.it[3] >= 180 && /set to Your training/.test(d12.toast), 'Your training set to Strength in the first-run picker, then a routine picked: its bench press is at 3 to 6 reps with 3 minutes\' rest, and the toast says so (r54 kept 6 to 10, and Settings then offered to apply it)', d12);
    await back();

    // Finish's way of saving an exercise is in one place since r55 (savedEx), so a first sign-in can save another device's
    // workout in progress the same way: r54's own line, copied here as r54 has it, and savedEx give the same saved exercise,
    // key order and blank fields included, on 3,000 random exercises (loads blank, typed or negative, reps as text or
    // halves, RIR blank or as text, warm-ups, drops, RIR checks, kept ranges, plans without a range, marks).
    const same = await ev(src => { const L = window.__ironlog; const r54 = new Function('return (' + src + ')')();
      let seed = 55; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; const pick = a => a[Math.floor(rnd() * a.length)];
      const ser = x => JSON.stringify(x, (k, v) => (v === undefined ? '__undefined' : v));
      let n = 0; const bad = [];
      for (let i = 0; i < 3000; i++) {
        const b = { exId: pick(['bench', 'pullup', 'plank', 'c_x']), plan: pick([undefined, {}, { repMin: 6, repMax: 10 }, { repMin: '8', repMax: '12' }, { repMin: 0, repMax: 5 }, { repMin: 5 }]),
          sets: Array.from({ length: Math.floor(rnd() * 6) }, () => ({ w: pick([null, 0, 52.5, -20, 100]), r: pick([null, '', 0, 8, '8', 8.5, '10']), rir: pick([null, '', 0, 2, '1.5', undefined]), done: rnd() < 0.7, warm: pick([undefined, false, true]), drop: pick([undefined, false, true]), cal: pick([undefined, null, { at: 9, pred: 2 }]) })) };
        if (rnd() < 0.5) b.keepRR = pick([undefined, null, [6, 10]]); if (rnd() < 0.3) b.light = pick([true, false]); if (rnd() < 0.3) b.inj = pick(['chest', '', null]); if (rnd() < 0.5) b.note = pick(['', 'felt good', undefined]);
        const a = ser(r54(b)), c = ser(L.savedEx(b)); n++; if (a !== c && bad.length < 3) bad.push({ a, c });
      }
      return { n, bad }; }, "b=>({exId:b.exId,note:b.note||'',rr:b.keepRR!==undefined?b.keepRR:(b.plan&&+b.plan.repMin>0&&+b.plan.repMax>0?[+b.plan.repMin,+b.plan.repMax]:null),light:b.light?true:undefined,...(b.inj?{inj:b.inj}:{}),sets:b.sets.filter(s=>s.done).map(s=>({w:s.w==null?0:s.w,r:+s.r,rir:s.rir==null||s.rir===''?null:+s.rir,warm:!!s.warm,drop:!!s.drop&&!s.warm,cal:s.cal&&!s.warm?s.cal:undefined}))})");
    ok(same.n === 3000 && same.bad.length === 0, 'Finish saves an exercise exactly as r54 did: r54\'s own line and savedEx agree on 3,000 random exercises, key order and blank fields included', same.bad);

    // D14: the Guide says when an import makes the routine.
    const gd14 = await ev(() => { const L = window.__ironlog; L.ACT.guideOpen({ dataset: { g: 'data' } }); const t = document.getElementById('modal').innerText.replace(/\s+/g, ' '); L.ACT.mClose(); return t; });
    ok(/an import whose workouts repeat \(most of them twice or more in its last 8 weeks\) also makes your routine; otherwise you pick the closest ready-made one/.test(gd14), 'the Guide says an import makes the routine only when its workouts repeat (r54 said every first-run import did; one session does not)', gd14.slice(0, 200));
    await back();
  }

  if (P.errors.length) ok(false, 'no page errors', P.errors);
  await P.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
