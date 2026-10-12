// r41 (V, 2026-10-12): numbers a lifter can act on, and less on screen.
// A lift's change is said in loads (estimated strength in lb or kg on a
// barbell or machine lift, the top set at each end on anything else), with
// the percentages behind the i; there are no predictions (no 4-week
// projection on the headline or the chart, no weeks to a goal), and the
// next session's target is shown instead. Stats loses the tiles and lines
// that repeated others, Muscles collapses the muscles that need nothing
// done, the bodyweight rate is in lb or kg a week, and Readiness waits for
// a check-in. Expected numbers are worked out here from Brzycki.
// Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = 'index.html';
const brz = (load, rtf) => load * 36 / (37 - rtf);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  for (const dark of [false, true]) {
    const T = dark ? ' (dark)' : ' (light)';
    const P = await open(FILE, { browser, touch: true, dark, w: 375, h: 760, clock: '2026-10-11T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);

    // Five weekly sessions: bench 180 to 200 lb x 8 at 1 in reserve; cable fly 35 lb for 10 to 14; pull-ups BW+5 to BW+25 x 8.
    await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb'; s.settings.hidden = [];
      s.bodyweights = [{ id: 'w0', date: '2026-09-01', kg: 180 * LB }];
      s.sessions = [0, 1, 2, 3, 4].map(i => ({ id: 's' + i, date: L.addDays('2026-09-10', i * 7), dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [
        { exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: (180 + i * 5) * LB, r: 8, rir: 1, done: true })) },
        { exId: 'cableFly', rr: [10, 15], sets: [0, 1].map(() => ({ w: 35 * LB, r: 10 + i, rir: 1, done: true })) },
        { exId: 'pullup', rr: [6, 10], sets: [0, 1].map(() => ({ w: (5 + i * 5) * LB, r: 8, rir: 1, done: true })) }] }));
      s.draft = null; L.state = L.normalize(s); L.invalidate();
    });
    const lift = (id) => ev((id) => {
      const L = window.__ironlog; L.ui.tab = 'dash'; L.ui.dashEx = id; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const sec = document.querySelector('#view [data-mkey="exercise"]'); const h = sec.querySelector('.headline');
      const tip = (h.querySelector('[data-tip]') || { dataset: {} }).dataset.tip || '';
      const ch = window.Chart && window.Chart.getChart && window.Chart.getChart('chEx');
      return { head: h.innerText.replace(/\s*i$/, '').trim(), tip, next: (document.getElementById('nextLine') || {}).innerText || null, tiles: [...sec.querySelectorAll('.kpi .l')].map(x => x.textContent), charts: ch ? ch.data.datasets.map(d => d.label) : null, st: L.IDX().exStats[id] };
    }, id);

    // ---------- 1. A barbell lift's change in pounds of estimated strength ----------
    const b = await lift('bench');
    // The trend's ends are the better of the first two and of the last two sessions: 185 and 200 x 8 at 1 in reserve.
    const gain = Math.round(brz(200, 9) - brz(185, 9));
    ok(b.head.startsWith(`Est. 1RM up about ${gain} lb over 4 weeks.`), `bench: "Est. 1RM up about ${gain} lb over 4 weeks" (Brzycki at 9 to failure, 185 to 200)`, b.head);
    ok(!/%/.test(b.head) && /Change \+8\.1% over 4 weeks\./.test(b.tip) && /About \+[\d.]+% a week/.test(b.tip), 'no percentage on the line; the change (+8.1%) and the weekly rate are behind the i', { head: b.head, tip: b.tip });
    ok(!/in 4 weeks|if it holds/.test(b.head + b.tip), 'no 4-week projection on the headline or its i');
    ok(b.charts && b.charts.length >= 1 && !b.charts.some(l => /trend holds/i.test(l)), 'the chart has no projected line', b.charts);
    ok(b.tiles.length === 2 && /^Best e1RM/.test(b.tiles[0]) && b.tiles[1] === 'Sessions logged', 'two tiles: best estimate and sessions (no change tile repeating the line)', b.tiles);

    // ---------- 2. The next session, the same target the session will show ----------
    const nx = await ev(() => { const L = window.__ironlog; const sg = L.suggest('bench', L.planFor('bench')); return sg.target; });
    ok(b.next === `Next session: ${nx}` && /at 200 lb/.test(nx), 'Next session says the target the session will show (' + nx + ')', b.next);

    // ---------- 3. An isolation lift and a bodyweight lift show top sets ----------
    const f = await lift('cableFly');
    // Best of the first two (35 x 11) and of the last two (35 x 14).
    ok(f.st.moving && f.head.includes('Up over 4 weeks: 35×11 to 35×14.') && !/about \d+ lb/.test(f.head), 'cable fly: "Up over 4 weeks: 35×11 to 35×14" (no estimate in pounds on an isolation lift)', f.head);
    const p = await lift('pullup');
    ok(/^(Up|Slowly up) over 4 weeks: BW\+10×8 to BW\+25×8\./.test(p.head) && !/about \d+ lb/.test(p.head), 'pull-ups: top sets with the added load, not pounds of bodyweight', p.head);

    // ---------- 3b. Numbers only when they agree with the word; pounds only from a 1RM estimate ----------
    const odd = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; const keep = s.sessions;
      // Fly reps falling across sets early on, even later: the trend rises while the best single set goes 14 to 12.
      const fly = [[14, 9, 8], [13, 10, 9], [12, 11, 10], [12, 12, 12], [12, 12, 12]];
      s.sessions = fly.map((rs, i) => ({ id: 'o' + i, date: L.addDays('2026-09-10', i * 7), dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [
        { exId: 'cableFly', rr: [10, 15], sets: rs.map(r => ({ w: 35 * LB, r, rir: 1, done: true })) },
        // Leg press at 16 reps, 1 in reserve: past 12 to failure, so no 1RM estimate.
        { exId: 'legPress', rr: [15, 20], sets: [0, 1, 2].map(() => ({ w: (300 + i * 10) * LB, r: 16, rir: 1, done: true })) }] }));
      L.invalidate(); const head = id => { L.ui.tab = 'dash'; L.ui.dashEx = id; L.render(); return document.querySelector('#view [data-mkey="exercise"] .headline').innerText.replace(/\s*i$/, '').trim(); };
      const o = { fly: head('cableFly'), lp: head('legPress'), flySt: L.IDX().exStats.cableFly.moving, lpBest: L.IDX().exStats.legPress.best };
      s.sessions = keep; L.invalidate(); return o;
    });
    ok(odd.flySt && /Up over 4 weeks\./.test(odd.fly) && !/35×1\d to 35×1\d/.test(odd.fly), 'a fly whose best set fell while the trend rose says "Up" with no pair of sets that reads down', odd.fly);
    ok(odd.lpBest == null && /: 310×16 to 340×16\./.test(odd.lp) && !/about \d+ lb/.test(odd.lp), 'a leg press at 16 reps shows its top sets (310 to 340), not pounds of a 1RM it does not have', odd.lp);

    // ---------- 3c. Next session follows the day due when one lift sits on two days ----------
    const two = await ev(async () => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; const keepS = s.sessions; const keepR = JSON.parse(JSON.stringify(s.routines));
      const R = L.activeRoutine(); const tr = R.days.map((d, i) => i).filter(i => !R.days[i].rest && R.days[i].items.length); const d1 = R.days[tr[0]], d2 = R.days[tr[1]];
      d1.items[0] = { ...d1.items[0], exId: 'bench', repMin: 3, repMax: 5, sets: 3 }; d2.items[0] = { ...d2.items[0], exId: 'bench', repMin: 8, repMax: 12, sets: 3 };
      const ss = [];
      for (let i = 0; i < 4; i++) {
        ss.push({ id: 'h' + i, date: L.addDays('2026-09-14', i * 7), dayIdx: tr[0], dayId: d1.id, dayName: d1.name, routineId: R.id, notes: '', ex: [{ exId: 'bench', rr: [3, 5], sets: [0, 1, 2].map(() => ({ w: (225 + i * 5) * LB, r: 5, rir: 1, done: true })) }] });
        if (i < 3) ss.push({ id: 'l' + i, date: L.addDays('2026-09-16', i * 7), dayIdx: tr[1], dayId: d2.id, dayName: d2.name, routineId: R.id, notes: '', ex: [{ exId: 'bench', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w: (175 + i * 5) * LB, r: 12, rir: 1, done: true })) }] });
      }
      s.sessions = ss; s.draft = null; L.invalidate();
      L.ui.tab = 'dash'; L.ui.dashEx = 'bench'; L.render(); const next = (document.getElementById('nextLine') || {}).innerText;
      // What the session itself shows: start the day due on Today and read the bench block's target.
      L.ui.tab = 'today'; L.ui.todayDay = null; L.render(); document.querySelector('.hero [data-act="startSession"]').click();
      const b = L.state.draft.ex.find(x => x.exId === 'bench'); const due = L.state.draft.dayName; const tgt = b ? b.target : null;
      L.state.draft = null; s.sessions = keepS; s.routines = keepR; L.invalidate(); L.render();
      return { next, tgt, due, heavy: d1.name, light: d2.name };
    });
    ok(two.due === two.light && two.tgt && two.next === `Next session: ${two.tgt}` && /8\+|for 8/.test(two.tgt), 'bench on a 3-5 day and an 8-12 day, the 8-12 day due: Next session is the target that session shows (' + two.tgt + ')', two);

    // ---------- 4. The workout preview: the target only ----------
    const pv = await ev(() => { const L = window.__ironlog; const R = L.activeRoutine(); const d = R.days.find(x => !x.rest && x.items.length); d.items[0].exId = 'bench'; L.ui.tab = 'today'; L.ui.todayDay = R.days.indexOf(d); L.render(); document.querySelectorAll('#view details').forEach(x => x.open = true); const sec = document.querySelector('#view [data-mkey="session"]'); return sec ? sec.innerText : ''; });
    ok(/Today: .*200 lb/.test(pv) && !/Est\. 1RM|Top sets/.test(pv), 'the workout preview shows each target, not the trend history', pv.slice(0, 200));

    // ---------- 5. Goals: no weeks, the gap in pounds on a barbell lift ----------
    const g = await ev(() => { const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.exercises.find(e => e.id === 'bench').goal = { w: 245 * LB, r: 5 }; s.exercises.find(e => e.id === 'cableFly').goal = { w: 50 * LB, r: 12 }; L.invalidate();
      const line = id => { L.ui.tab = 'dash'; L.ui.dashEx = id; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); return document.getElementById('goalLine').innerText.replace(/\s+/g, ' ').trim(); };
      const o = { bench: line('bench'), fly: line('cableFly'), gs: L.goalState('bench') }; return o; });
    // 245 x 5 to failure needs Brzycki 245 x 36/32; the best estimate is 200 x 8 at 1 in reserve.
    // The gap is load for 5 reps: 245 less what 257.1 (Brzycki) allows for 5 reps to failure, 257.1 x 32/36 = 228.6, so 16 lb; not the 19 between the two estimates.
    const need = brz(245, 5), cur = brz(200, 9), gap = Math.round(245 - cur * 32 / 36);
    ok(g.bench === `Goal 245 lb × 5: ${Math.floor(cur / need * 100)}% there, about ${gap} lb to go i Change` && g.gs.weeks === undefined, `bench goal: ${Math.floor(cur / need * 100)}% there, about ${gap} lb to go (load for 5 reps), no weeks`, g.bench);
    ok(/^Goal 50 lb × 12: \d+% there i Change$/.test(g.fly), 'an isolation goal shows how close, with no pounds of estimate', g.fly);

    // ---------- 6. Stats: no tile or line repeating another ----------
    const sum = await ev(() => {
      const L = window.__ironlog; L.ui.tab = 'dash'; L.render();
      const tiles = [...document.querySelectorAll('#view > .kpis .kpi .l, #view .kpis:first-of-type .kpi .l')].map(x => x.textContent);
      const rows = [...document.querySelectorAll('#dashSummary .srow')].map(r => ({ l: r.querySelector('.sl').textContent, t: r.querySelector('.st').textContent }));
      return { tiles, rows, coach: L.coach() };
    });
    ok(!sum.tiles.some(t => /Stalled exercises|Weight lifted this week/.test(t)) && sum.tiles.some(t => /^Adherence/.test(t)) && sum.tiles.some(t => /^Hard sets this week/.test(t)), 'Stats tiles: adherence and hard sets this week; no stall count (the Stuck line says it) and no weight lifted (Today has it)', sum.tiles);
    const mv = sum.rows.find(r => /Moving/i.test(r.l));
    ok(mv && /Barbell Bench Press|Cable Fly|Pull-up/.test(mv.t) && !/%/.test(mv.t) && /over \d weeks/.test(mv.t), 'Moving names the lifts, with no percentages', mv);
    const vol = sum.rows.find(r => /Volume/i.test(r.l)); const chg = sum.rows.find(r => /Change/i.test(r.l));
    ok(sum.coach.act && sum.coach.act.sec === 'volume' && vol && vol.t.startsWith(sum.coach.text) && !chg, 'the coach\'s change is the volume shortfall: said once, on the Volume line', sum.rows);
    // Chest over a low band while the coach's change is another muscle's shortfall: Above is still said.
    const over = await ev(() => { const L = window.__ironlog; const b = L.state.settings.bands; const keep = JSON.parse(JSON.stringify(b)); b.chest = [1, 2]; L.invalidate(); L.ui.tab = 'dash'; L.render();
      const t = [...document.querySelectorAll('#dashSummary .srow')].map(r => r.innerText.replace(/\s+/g, ' ')).join(' | ');
      // Every minimum at 0: no shortfall, so the coach's change is something else and keeps its own line.
      for (const m in b) b[m] = [0, b[m][1]]; L.invalidate(); L.render(); const c = L.coach();
      const rows = [...document.querySelectorAll('#dashSummary .srow')].map(r => ({ l: r.querySelector('.sl').textContent, t: r.querySelector('.st').textContent }));
      L.state.settings.bands = keep; L.invalidate(); return { t, c, rows }; });
    ok(/Volume .*Above: Chest\./i.test(over.t), 'a muscle above its target is still named when the Volume line carries the coach\'s words', over.t);
    const ch2 = over.rows.find(r => /Change/i.test(r.l));
    ok(!(over.c.act && over.c.act.sec === 'volume') && ch2 && ch2.t === over.c.text, 'no shortfall: the coach\'s change keeps its own Change line (' + over.c.text + ')', over.rows);

    // ---------- 7. Muscles: rising at target in one line; words, not percentages ----------
    const mu = await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const sub = [...document.querySelectorAll('#view .subsec')].find(x => /Strength return on volume/.test(x.innerText)); return sub ? sub.innerText : ''; });
    ok(mu && !/[+-]\d+(\.\d)?%/.test(mu), 'Strength return on volume shows no percentages', mu.slice(0, 300));
    ok(/\n(rising|flat|falling|unclear)\n/.test(mu), 'a muscle to act on says rising, flat, falling, or unclear', mu.slice(0, 300));
    // Chest's minimum at 3: rising at its volume, so it joins the one line and has no row of its own.
    const mu2 = await ev(() => { const L = window.__ironlog; const b = L.state.settings.bands; const keep = b.chest.slice(); b.chest = [3, 30]; L.invalidate(); L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); const sub = [...document.querySelectorAll('#view .subsec')].find(x => /Strength return on volume/.test(x.innerText)); b.chest = keep; L.invalidate(); return sub ? sub.innerText : ''; });
    ok(/Rising at (its|their) volume: [^\n]*Chest[^\n]*\. Keep the sets as they are\./.test(mu2) && !/\nChest\n/.test(mu2), 'a muscle rising at its target joins the one line instead of a row', mu2.slice(0, 400));
    const mt = await ev(() => { const L = window.__ironlog; const sc = L.IDX().scores[0]; return sc ? L.musTrend(sc) : ''; });
    ok(mt && !/%/.test(mt), 'a muscle\'s strength trend in words: ' + mt, mt);

    // ---------- 8. Bodyweight: lb or kg a week ----------
    const bw = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.bodyweights = [];
      // 180 lb rising 0.1 lb a day, weighed every other day for 4 weeks. The rate compares 7-day averages:
      // Sep 12 alone (180.0) and the last four weigh-ins (182.5), 2.5 lb over 28 days: 0.625 lb a week, 0.28 kg.
      for (let i = 0; i <= 28; i += 2) s.bodyweights.push({ id: 'b' + i, date: L.addDays('2026-09-12', i), kg: (180 + i * 0.1) * LB });
      L.invalidate(); L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const stat = (document.getElementById('view').innerText.match(/[+−-][\d.]+ lb a week[^\n]*/) || [''])[0];
      s.settings.bwGoalPct = 0.25; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const withGoal = (document.getElementById('view').innerText.match(/[+−-][\d.]+ lb a week[^\n]*/) || [''])[0]; delete s.settings.bwGoalPct;
      s.settings.unit = 'kg'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const kg = (document.getElementById('view').innerText.match(/[+−-][\d.]+ kg a week/) || [''])[0]; s.settings.unit = 'lb';
      L.ui.tab = 'today'; L.render(); const today = (document.querySelector('#view [data-mkey="body"] .sub') || document.querySelector('#view [data-mkey="body"]') || {}).innerText || '';
      s.bodyweights.push({ id: 'same', date: '2026-10-11', kg: s.bodyweights[s.bodyweights.length - 1].kg }); L.invalidate(); L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const same = (document.querySelector('#view [data-mkey="body"]') || {}).innerText || '';
      return { stat, withGoal, kg, today, same };
    });
    ok(/^\+0\.6 lb a week, \w{3} \d+ to \w{3} \d+/.test(bw.stat) && !/%/.test(bw.stat.split(' i')[0]), 'Stats: "+0.6 lb a week" with its dates, no percentage', bw.stat);
    ok(/^\+0\.6 lb a week \(\+0\.3%\)/.test(bw.withGoal), 'with a goal set in percent, the percentage sits beside it', bw.withGoal);
    ok(bw.kg === '+0.3 kg a week', 'in kg: "+0.3 kg a week"', bw.kg);
    ok(/\+0\.6 lb a week/.test(bw.today) && /same as previous/.test(bw.same) && !/−0 vs previous/.test(bw.same), 'Today\'s body line in lb a week; an unchanged weigh-in says "same as previous", never "−0"', { today: bw.today, same: bw.same.slice(0, 120) });

    // ---------- 9. Readiness waits for a check-in ----------
    const rd = await ev(() => { const L = window.__ironlog; const has = () => { L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); return /Readiness and performance/.test(document.getElementById('view').innerText); };
      const none = has(); L.state.sessions[4].chk = { sleep: 3, energy: 3, joints: 3 }; L.invalidate(); const one = has(); delete L.state.sessions[4].chk; L.invalidate(); return { none, one }; });
    ok(!rd.none && rd.one, 'Readiness and performance shows only once a check-in has been answered', rd);

    // ---------- 10. The Guide, 320 px, errors ----------
    const guide = await ev(() => { const L = window.__ironlog; L.openModal({ kind: 'guide' }); const t = document.getElementById('modal').textContent; L.ACT.mClose(); return t; });
    ok(/A lift on Stats says its change in what was lifted/.test(guide) && /there are no predictions/.test(guide) && !/about how many weeks/.test(guide), 'the Guide says changes are in loads and that nothing is predicted' + T);
    await P.page.setViewportSize({ width: 320, height: 640 });
    const narrow = await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.ui.dashEx = 'bench'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); return document.documentElement.scrollWidth <= innerWidth; });
    ok(narrow, 'Stats fits 320 px' + T);
    const errs = P.errors.filter(e => !/favicon/.test(e));
    ok(!errs.length, 'no page errors' + T, errs);
    await P.page.close();
  }
  await browser.close();
  if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
  console.log('\nALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
