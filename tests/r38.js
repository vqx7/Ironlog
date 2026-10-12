// r38 (backlog item 188): lift goals. A goal is a load for a number of reps
// (245 x 5), set on Stats > Lifts. It is reached when a working set matches
// it; until then the line says how close the best estimate of the last 12
// weeks is to what the goal takes done to failure, and about how many weeks
// at the lift's weekly rate only while the lift is clearly rising. Every
// expected number is worked out here from Brzycki, not read from the app.
// Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = 'index.html';
const LB = 0.45359237;
// Brzycki on reps to failure (reps plus RIR), as the targets read sets up to 10.
const brz = (load, rtf) => load * 36 / (37 - rtf);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  for (const dark of [false, true]) {
    const T = dark ? ' (dark)' : ' (light)';
    const P = await open(FILE, { browser, touch: true, dark, w: 375, h: 760, clock: '2026-10-11T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);

    // Bench, five weekly sessions, 180 to 200 lb for 3 x 8 at 1 in reserve.
    const seed = () => ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb';
      s.sessions = [0, 1, 2, 3, 4].map(i => ({ id: 'g' + i, date: L.addDays('2026-09-06', i * 7), dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: (180 + i * 5) * LB, r: 8, rir: 1, done: true })) }] }));
      s.exercises.forEach(e => { delete e.goal; }); s.draft = null; L.state = L.normalize(s); L.invalidate();
    });
    const lifts = (ex) => ev((ex) => { const L = window.__ironlog; L.ui.tab = 'dash'; L.ui.dashEx = ex; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const sec = document.querySelector('#view [data-mkey="exercise"]'); const g = document.getElementById('goalLine'); return { set: !!sec.querySelector('[data-act="goalOpen"]'), line: g ? g.innerText.replace(/\s+/g, ' ').trim() : null, setText: (sec.querySelector('[data-act="goalOpen"]') || {}).textContent || null }; }, ex);
    await seed();

    // ---------- 1. Set a goal through the sheet ----------
    let v = await lifts('bench');
    ok(v.set && v.setText === 'Set a goal' && v.line === null, 'Stats > Lifts offers Set a goal on a lift with none' + T, v);
    await ev(() => document.querySelector('#view [data-act="goalOpen"]').click()); await wait(80);
    const sh = await ev(() => { const m = document.getElementById('modal'); return { h: m.querySelector('h3').textContent, labels: [...m.querySelectorAll('label.field')].map(l => l.firstChild.textContent.trim()), remove: !!m.querySelector('[data-act="goalClear"]'), wide: document.documentElement.scrollWidth <= innerWidth, minH: Math.min(...[...m.querySelectorAll('button.btn')].map(b => b.getBoundingClientRect().height)) }; });
    ok(sh.h === 'Goal: Barbell Bench Press' && sh.labels[0] === 'Load (lb)' && sh.labels[1] === 'Reps' && !sh.remove, 'the goal sheet asks a load and reps, with no Remove before a goal exists' + T, sh);
    ok(sh.wide && sh.minH >= 44, 'the goal sheet fits 375 px with 44 px buttons' + T, sh);
    // Reps out of range and a missing load are refused, nothing saved.
    const bad = await ev(async () => {
      const L = window.__ironlog; const out = {};
      document.getElementById('goalW').value = '245'; document.getElementById('goalR').value = '0'; L.ACT.goalSave(); await new Promise(r => setTimeout(r, 30));
      out.r0 = { goal: L.EX('bench').goal, toast: document.getElementById('toast').innerText, open: !!L.ui.modal };
      document.getElementById('goalW').value = ''; document.getElementById('goalR').value = '5'; L.ACT.goalSave(); await new Promise(r => setTimeout(r, 30));
      out.w0 = { goal: L.EX('bench').goal, toast: document.getElementById('toast').innerText, open: !!L.ui.modal };
      return out;
    });
    ok(bad.r0.goal === undefined && /Reps from 1 to 30/.test(bad.r0.toast) && bad.r0.open, 'reps of 0 are refused and the sheet stays open' + T, bad.r0);
    ok(bad.w0.goal === undefined && /Enter a load/.test(bad.w0.toast) && bad.w0.open, 'no load on a loaded lift is refused' + T, bad.w0);
    await ev(async () => { document.getElementById('goalW').value = '245'; document.getElementById('goalR').value = '5'; document.querySelector('#modal [data-act="goalSave"]').click(); await new Promise(r => setTimeout(r, 80)); });
    const saved = await ev(() => { const L = window.__ironlog; const g = L.EX('bench').goal; return { g, toast: document.getElementById('toast').innerText, modal: !!L.ui.modal, stored: JSON.parse(localStorage.getItem(L.KEY)).exercises.find(e => e.id === 'bench').goal }; });
    ok(saved.g && Math.abs(saved.g.w / LB - 245) < 1e-6 && saved.g.r === 5 && !saved.modal && /Goal set: 245 lb × 5/.test(saved.toast), 'Save keeps 245 lb × 5 (in kg inside) and says so' + T, saved);
    ok(saved.stored && Math.abs(saved.stored.w / LB - 245) < 1e-6 && saved.stored.r === 5, 'the goal is saved on the phone' + T, saved.stored);

    // ---------- 2. How close, and the weeks, worked out here ----------
    // Best estimate of the last 12 weeks: 200 x 8 at 1 in reserve, 9 to failure.
    // The goal: 245 x 5 to failure. Both by Brzycki.
    const cur = brz(200 * LB, 9), need = brz(245 * LB, 5);
    const pct = Math.floor(cur / need * 100);
    v = await lifts('bench');
    const st = await ev(() => { const L = window.__ironlog; return { gs: L.goalState('bench'), slope: L.IDX().exStats.bench.slope, moving: L.IDX().exStats.bench.moving }; });
    // Since r41 a goal has no weeks to reach it (V: guide, do not predict); on a barbell lift it says the load left.
    // The load still to add for 5 reps: 245 less what the estimate allows for 5 (Brzycki, 257.1 x 32/36 = 228.6).
    const left = Math.round(245 - (cur / LB) * 32 / 36);
    ok(Math.abs(st.gs.cur - cur) < 1e-6 && Math.abs(st.gs.need - need) < 1e-6, 'the estimate and the goal\'s need match Brzycki (' + (cur / LB).toFixed(1) + ' of ' + (need / LB).toFixed(1) + ' lb)' + T, st.gs);
    ok(st.moving && st.gs.weeks === undefined, 'a rising lift still gets no weeks to its goal' + T, st.gs);
    ok(!/disagree/.test(await ev(() => document.querySelector('#view [data-mkey="exercise"]').textContent)), 'no "Change and trend disagree" note under the tiles (one change number since r35)' + T);
    ok(v.line === `Goal 245 lb × 5: ${pct}% there, about ${left} lb to go i Change`, 'the line: Goal 245 lb × 5: ' + pct + '% there, about ' + left + ' lb to go' + T, v.line);

    // A lift not clearly rising gets no weeks: the same load every week.
    const flat = await ev(() => { const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.sessions.forEach(x => x.ex[0].sets.forEach(q => { q.w = 200 * LB; })); L.invalidate(); L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const g = document.getElementById('goalLine'); return { line: g.innerText.replace(/\s+/g, ' ').trim(), weeks: L.goalState('bench').weeks, moving: L.IDX().exStats.bench.moving }; });
    ok(!flat.moving && flat.weeks === undefined && flat.line === `Goal 245 lb × 5: ${pct}% there, about ${left} lb to go i Change`, 'a flat lift reads the same way: how close and the load left' + T, flat);
    await seed(); await ev(() => { const L = window.__ironlog; L.state.exercises.find(e => e.id === 'bench').goal = { w: 245 * 0.45359237, r: 5 }; L.invalidate(); });

    // Within reach: the estimate already covers the goal, but no set matched it.
    const reach = await ev(() => { const L = window.__ironlog; const e = L.state.exercises.find(e => e.id === 'bench'); const keep = e.goal; e.goal = { w: 225 * 0.45359237, r: 5 }; L.invalidate(); L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const out = document.getElementById('goalLine').innerText.replace(/\s+/g, ' ').trim(); e.goal = keep; L.invalidate(); return out; });
    // 225 x 5 needs brz(225,5) = 253.1; 200 x 8 at 1 in reserve is 257.1.
    ok(brz(225, 5) < brz(200, 9) && reach === 'Goal 225 lb × 5: within reach i Change', 'an estimate past the goal with no set matching it reads within reach' + T, reach);

    // ---------- 3. Reached ----------
    const hit = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state;
      s.sessions.push({ id: 'gh', date: '2026-10-09', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [3, 5], sets: [{ w: 245 * LB, r: 4, rir: 0, done: true }, { w: 250 * LB, r: 5, rir: 0, done: true }] }] });
      L.state = L.normalize(s); L.invalidate(); L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      return { line: document.getElementById('goalLine').innerText.replace(/\s+/g, ' ').trim(), date: new Date(2026, 9, 9).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) };
    });
    ok(hit.line === `Goal 245 lb × 5: reached ${hit.date} i Change`, 'a working set of 250 x 5 reaches 245 x 5 (245 x 4 did not), with its date' + T, hit);
    await ev(() => { const L = window.__ironlog; L.state.sessions = L.state.sessions.filter(x => x.id !== 'gh'); L.invalidate(); L.render(); });

    // ---------- 4. Change, Remove, Undo ----------
    await lifts('bench');
    await ev(() => document.querySelector('#goalLine [data-act="goalOpen"]').click()); await wait(80);
    const pre = await ev(() => ({ w: document.getElementById('goalW').value, r: document.getElementById('goalR').value, remove: !!document.querySelector('#modal [data-act="goalClear"]') }));
    ok(pre.w === '245' && pre.r === '5' && pre.remove, 'Change opens the sheet with the goal filled in and a Remove goal button' + T, pre);
    await ev(async () => { document.querySelector('#modal [data-act="goalClear"]').click(); await new Promise(r => setTimeout(r, 80)); });
    const rm = await ev(() => { const L = window.__ironlog; return { g: L.EX('bench').goal, toast: document.getElementById('toast').innerText, undo: !!document.querySelector('#toast [data-act="undo"]'), setBtn: document.querySelector('#view [data-act="goalOpen"]').textContent }; });
    ok(rm.g === undefined && /Goal removed/.test(rm.toast) && rm.undo && rm.setBtn === 'Set a goal', 'Remove goal removes it, with Undo, and Set a goal is back' + T, rm);
    await ev(() => window.__ironlog.ACT.undo()); await wait(250);
    const un = await ev(() => { const L = window.__ironlog; const g = L.EX('bench').goal; return g ? { w: g.w / 0.45359237, r: g.r } : null; });
    ok(un && Math.abs(un.w - 245) < 1e-6 && un.r === 5, 'Undo brings the goal back' + T, un);

    // ---------- 5. In kg: the same goal shown in kg ----------
    const kg = await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'kg'; L.invalidate(); L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const t = document.getElementById('goalLine').innerText.replace(/\s+/g, ' '); L.state.settings.unit = 'lb'; L.invalidate(); L.render(); return t; });
    ok(/^Goal 111(\.1)? kg × 5/.test(kg.trim()), 'switched to kg, the goal reads in kg' + T, kg);

    // ---------- 6. Bodyweight lifts: added load, BW alone ----------
    const bw = await ev(async () => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state;
      s.bodyweights = [{ id: 'w1', date: '2026-10-01', kg: 180 * LB }];
      s.sessions.push(...[0, 1, 2].map(i => ({ id: 'p' + i, date: L.addDays('2026-09-20', i * 7), dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'pullup', rr: [6, 10], sets: [0, 1].map(() => ({ w: 10 * LB, r: 8, rir: 1, done: true })) }] })));
      L.state = L.normalize(s); L.invalidate(); L.ui.tab = 'dash'; L.ui.dashEx = 'pullup'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      document.querySelector('#view [data-act="goalOpen"]').click(); await new Promise(r => setTimeout(r, 80));
      const label = document.querySelector('#modal label.field').firstChild.textContent.trim();
      document.getElementById('goalW').value = '45'; document.getElementById('goalR').value = '5'; L.ACT.goalSave(); await new Promise(r => setTimeout(r, 80));
      const a = { label, line: document.getElementById('goalLine').innerText.replace(/\s+/g, ' ').trim(), gs: L.goalState('pullup'), bwl: L.bwRefLoad(L.EX('pullup')) };
      document.querySelector('#goalLine [data-act="goalOpen"]').click(); await new Promise(r => setTimeout(r, 80));
      document.getElementById('goalW').value = ''; document.getElementById('goalR').value = '12'; L.ACT.goalSave(); await new Promise(r => setTimeout(r, 80));
      a.bare = { g: L.EX('pullup').goal, line: document.getElementById('goalLine').innerText.replace(/\s+/g, ' ').trim() };
      return a;
    });
    const bwNeed = brz(bw.bwl + 45 * LB, 5), bwCur = brz(bw.bwl + 10 * LB, 9);
    ok(bw.label === 'Added load (lb)' && /^Goal BW\+45 × 5: \d+% there/.test(bw.line), 'a bodyweight lift takes the added load: Goal BW+45 × 5' + T, bw);
    ok(bw.bwl > 0 && Math.abs(bw.gs.need - bwNeed) < 1e-6 && Math.abs(bw.gs.cur - bwCur) < 1e-6 && bw.line.includes(Math.floor(bwCur / bwNeed * 100) + '% there'), 'its estimate and need include the bodyweight at the latest weigh-in' + T, { gs: bw.gs, bwNeed, bwCur });
    ok(bw.bare.g && bw.bare.g.w === 0 && bw.bare.g.r === 12 && /^Goal BW × 12/.test(bw.bare.line), 'an empty added load on a bodyweight lift is BW alone: Goal BW × 12' + T, bw.bare);

    // With no weigh-in the bodyweight lift has nothing to compare against: it says so, not a number from the added load alone.
    const nobw = await ev(() => { const L = window.__ironlog; const keep = L.state.bodyweights; L.state.bodyweights = []; L.invalidate(); L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const o = { line: document.getElementById('goalLine').innerText.replace(/\s+/g, ' ').trim(), pct: L.goalState('pullup').pct }; L.state.bodyweights = keep; L.invalidate(); L.render(); return o; });
    ok(/^Goal BW × 12: add a weigh-in to see how close/.test(nobw.line) && nobw.pct === null, 'no weigh-in: the bodyweight goal asks for one instead of a number' + T, nobw);

    // ---------- 7. Not offered on timed holds or assisted lifts ----------
    const none = await ev(() => { const L = window.__ironlog; return { plank: L.goalLine('plank'), assist: L.goalLine('assistPullup'), plankState: L.goalState('plank') }; });
    ok(none.plank === '' && none.assist === '' && none.plankState === null, 'no goal on a timed hold or an assisted lift' + T, none);

    // ---------- 8. What is stored ----------
    const norm = await ev(() => {
      const L = window.__ironlog; const base = JSON.parse(JSON.stringify(L.state)); const ex = id => base.exercises.find(e => e.id === id);
      const pick = (id, goal) => { const s = JSON.parse(JSON.stringify(base)); s.exercises.find(e => e.id === id).goal = goal; return L.normalize(s).exercises.find(e => e.id === id).goal; };
      const n = L.normalize(JSON.parse(JSON.stringify(base)));
      return {
        neg: pick('bench', { w: -5, r: 5 }), reps40: pick('bench', { w: 100, r: 40 }), r0: pick('bench', { w: 100, r: 0 }), str: pick('bench', { w: 'x', r: 5 }), arr: pick('bench', [100, 5]), nul: pick('bench', null),
        round: pick('bench', { w: 100, r: 5.4 }), extra: pick('bench', { w: 100, r: 5, note: 'x' }),
        timed: pick('plank', { w: 0, r: 5 }), assist: pick('assistPullup', { w: 0, r: 5 }),
        noKey: (() => { const e = n.exercises.find(e => e.id !== 'bench' && e.id !== 'pullup'); return e.goal === undefined && !JSON.stringify(e).includes('goal'); })(),
        kept: n.exercises.find(e => e.id === 'bench').goal
      };
    });
    ok([norm.neg, norm.reps40, norm.r0, norm.str, norm.arr, norm.nul].every(x => x === undefined), 'a goal below 0, over 30 reps, 0 reps, not a number, or not an object is dropped' + T, norm);
    ok(norm.round && norm.round.r === 5 && norm.round.w === 100 && norm.extra && Object.keys(norm.extra).join() === 'w,r', 'reps are whole and nothing else is kept' + T, { round: norm.round, extra: norm.extra });
    ok(norm.timed === undefined && norm.assist === undefined, 'a goal on a timed or assisted lift is dropped when loaded' + T, norm);
    ok(norm.noKey && norm.kept && Math.abs(norm.kept.w / LB - 245) < 1e-6, 'a lift with no goal has no goal key (synced records unchanged); one with a goal keeps it' + T, norm);

    // ---------- 9. 320 px ----------
    await P.page.setViewportSize({ width: 320, height: 640 });
    const narrow = await ev(async () => { const L = window.__ironlog; L.ui.dashEx = 'bench'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const g = document.getElementById('goalLine'); const w1 = document.documentElement.scrollWidth <= innerWidth; const b = g.querySelector('[data-act="goalOpen"]').getBoundingClientRect(); b && g.querySelector('[data-act="goalOpen"]').click(); await new Promise(r => setTimeout(r, 80)); const w2 = document.documentElement.scrollWidth <= innerWidth; L.ACT.mClose(); return { w1, w2, bh: b.height }; });
    ok(narrow.w1 && narrow.w2 && narrow.bh >= 44, 'at 320 px the goal line and its sheet fit, and Change is 44 px tall' + T, narrow);

    // ---------- 10. The Guide says it ----------
    const guide = await ev(() => { const L = window.__ironlog; L.openModal({ kind: 'guide' }); const t = document.getElementById('modal').textContent; L.ACT.mClose(); return t; });
    ok(/Goals: on Stats, Lifts, set a goal/.test(guide) && !/—/.test(guide), 'the Guide explains goals, with no em dash' + T);

    const errs = P.errors ? P.errors.filter(e => !/favicon/.test(e)) : [];
    ok(!errs.length, 'no page errors' + T, errs);
    await P.page.close();
  }
  await browser.close();
  if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
  console.log('\nALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
