// r40 (backlog item 41): Settings, Count RIR 4 to 5 as half a set, off by
// default. On, a working set at RIR 4 or 5 counts half toward the weekly hard
// sets, the targets they are read against, This week and the plan's weekly
// sets; estimates, PRs, recovery (dayMus) and the per-workout count stay on
// hard sets only. With RIR off the setting does nothing and is not shown.
// Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = 'index.html';

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  for (const dark of [false, true]) {
    const T = dark ? ' (dark)' : ' (light)';
    const P = await open(FILE, { browser, touch: true, dark, w: 375, h: 760, clock: '2026-10-11T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);

    // Five weeks of bench, once a week on Wednesday: 3 sets at RIR 2, 2 at RIR 4, 1 at RIR 5.
    // Bench: chest 1, front delts and triceps half each.
    const read = () => ev(() => {
      const L = window.__ironlog; L.invalidate(); const I = L.IDX(); const wk = L.weekStart('2026-10-08');
      const e = L.EX('bench'); return { chest: (I.weekSets[wk] || {}).chest, tri: (I.weekSets[wk] || {}).triceps, hard: I.weekHard[wk], day: (I.dayMus['2026-10-08'] || {}).chest, best: I.exStats.bench.best, avg: (L.actualAvg4() || {}).chest, sec: e.secondary.slice(), got: L.weekStats().got, tgt: L.weekStats().tgt };
    });
    await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb'; delete s.settings.rirMode; delete s.settings.rirHalf;
      const sets = [2, 2, 2, 4, 4, 5].map(rir => ({ w: 185 * LB, r: 8, rir, done: true }));
      s.sessions = [0, 1, 2, 3, 4].map(i => ({ id: 'h' + i, date: L.addDays('2026-09-10', i * 7), dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: JSON.parse(JSON.stringify(sets)) }] }));
      s.draft = null; L.state = L.normalize(s); L.invalidate();
    });

    // ---------- 1. Off by default: only RIR 3 or less ----------
    const off = await read();
    ok(off.chest === 3 && off.hard === 3 && off.day === 3 && off.avg === 3, 'off (the default): 3 hard sets of chest a week, the RIR 4 and 5 sets not counted' + T, off);
    ok(off.sec.includes('triceps') && off.tri === 1.5, 'helpers half of that: triceps 1.5' + T, off.tri);

    // ---------- 2. The setting ----------
    const ui1 = await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const b = document.querySelector('input[data-bind="rirHalf"]'); const a = document.querySelector('input[data-bind="rirAsk"]'); return b ? { checked: b.checked, label: b.closest('label').innerText.trim().replace(/\s*i$/, ''), h: b.closest('label').getBoundingClientRect().height, ask: a.closest('label').getBoundingClientRect().height } : null; });
    ok(ui1 && !ui1.checked && ui1.label === 'Count RIR 4 to 5 as half a set' && Math.abs(ui1.h - ui1.ask) < 1, 'Settings has Count RIR 4 to 5 as half a set, off, sized like the switch above it' + T, ui1);
    await ev(() => document.querySelector('input[data-bind="rirHalf"]').click()); await wait(120);
    const onSt = await ev(() => ({ s: window.__ironlog.state.settings.rirHalf, toast: document.getElementById('toast').innerText, stored: JSON.parse(localStorage.getItem(window.__ironlog.KEY)).settings.rirHalf }));
    ok(onSt.s === true && onSt.stored === true && /half a set/.test(onSt.toast), 'ticked, it is saved and says so' + T, onSt);

    // ---------- 3. On: RIR 4 and 5 count half, toward the week only ----------
    const on = await read();
    // 3 hard + 3 sets at RIR 4 or 5 at half = 4.5; triceps half of that.
    ok(on.chest === 4.5 && on.hard === 4.5 && on.tri === 2.25 && on.avg === 4.5, 'on: 3 + 3 x 0.5 = 4.5 sets of chest a week, triceps 2.25, the average too' + T, on);
    ok(on.day === 3, 'recovery and Pick for me still read 3 hard sets that day' + T, on.day);
    ok(on.best === off.best && on.best > 0, 'the best estimate is unchanged' + T, { on: on.best, off: off.best });
    // This week: a session on Thursday of this week.
    const wk = await ev(() => { const L = window.__ironlog; const LB = 0.45359237; L.state.sessions.push({ id: 'tw', date: '2026-10-09', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [2, 4, 5].map(rir => ({ w: 185 * LB, r: 8, rir, done: true })) }] }); L.invalidate(); const got = L.weekStats().got; L.state.sessions = L.state.sessions.filter(x => x.id !== 'tw'); L.invalidate(); return got; });
    ok(wk === 6.5, 'This week: Thursday\'s 4.5 and Friday\'s 1 hard set and 2 halves, 6.5' + T, wk);

    // ---------- 4. The plan's weekly sets ----------
    const plan = await ev(() => {
      const L = window.__ironlog; const R = L.activeRoutine(); const d = R.days.find(x => !x.rest && x.items.length); const keep = JSON.parse(JSON.stringify(R));
      R.days.forEach(x => { if (x !== d) { x.items = []; } }); d.items = [{ ...d.items[0], exId: 'bench', sets: 4, rir: 4 }, { ...d.items[0], uid: 'u2', exId: 'bench', sets: 3, rir: 1 }];
      const f = { on: L.planSetsPerWeek(R, false), deload: L.planSetsPerWeek(R, true) };
      L.state.settings.rirHalf = undefined; delete L.state.settings.rirHalf; f.off = L.planSetsPerWeek(R, false); L.state.settings.rirHalf = true;
      Object.assign(R, keep); return f;
    });
    // Weekly schedule assumed: 3 hard + 4 x 0.5 = 5; off: 3. A deload halves each item: ceil(4/2)=2 x 0.5 + ceil(3/2)=2 = 3.
    ok(plan.off === 3 && plan.on === 5 && plan.deload === 3, 'planned: 3 sets at RIR 1 and 4 at RIR 4 are 5 a week on, 3 off, 3 in a deload week' + T, plan);

    // ---------- 5. RIR off: nothing to do ----------
    const rOff = await ev(() => { const L = window.__ironlog; L.state.settings.rirMode = 'off'; L.invalidate(); L.render(); const I = L.IDX(); const v = (I.weekSets[L.weekStart('2026-10-08')] || {}).chest; const shown = !!document.querySelector('input[data-bind="rirHalf"]'); delete L.state.settings.rirMode; L.invalidate(); L.render(); return { v, shown }; });
    ok(rOff.v === 6 && !rOff.shown, 'with RIR off every working set counts (6), and the setting is hidden' + T, rOff);

    // ---------- 6. Off again, Undo, what is stored ----------
    await ev(() => { document.querySelectorAll('#view details').forEach(d => d.open = true); document.querySelector('input[data-bind="rirHalf"]').click(); }); await wait(120);
    const back = await read();
    ok(back.chest === 3 && (await ev(() => window.__ironlog.state.settings.rirHalf)) === undefined, 'unticked, the week is 3 again and nothing is stored' + T, back.chest);
    await ev(() => window.__ironlog.ACT.undo()); await wait(250);
    ok((await ev(() => window.__ironlog.state.settings.rirHalf)) === true && (await read()).chest === 4.5, 'Undo turns it back on' + T);
    const norm = await ev(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); s.settings.rirHalf = 'yes'; const a = L.normalize(s).settings.rirHalf; s.settings.rirHalf = true; const b = L.normalize(s).settings.rirHalf; delete s.settings.rirHalf; const c = 'rirHalf' in L.normalize(s).settings; return { a, b, c }; });
    ok(norm.a === undefined && norm.b === true && norm.c === false, 'only true is kept; absent otherwise' + T, norm);

    // ---------- 7. The Guide, 320 px ----------
    const guide = await ev(() => { const L = window.__ironlog; L.openModal({ kind: 'guide' }); const t = document.getElementById('modal').textContent; L.ACT.mClose(); return t; });
    ok(/Count RIR 4 to 5 as half a set on, a working set at RIR 4 or 5 counts half/.test(guide), 'the Guide says what it does' + T);
    await P.page.setViewportSize({ width: 320, height: 640 });
    ok(await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); return document.documentElement.scrollWidth <= innerWidth; }), 'Settings fits 320 px' + T);

    const errs = P.errors.filter(e => !/favicon/.test(e));
    ok(!errs.length, 'no page errors' + T, errs);
    await P.page.close();
  }
  await browser.close();
  if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
  console.log('\nALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
