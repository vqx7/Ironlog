// r34 (V, 2026-10-10): the next sets adjusted from the last one, dashes
// before anything is logged, the weigh-in at setup and on a cadence (and
// bodyweight lifts end to end), Today starting blank for freestyle,
// two-a-days, rest weeks, + Drop, Suggest for the library, the tighter tour.
// Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = 'index.html';
const LB = 0.45359237;

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();

  // ---------- 1. Adjusting the next sets ----------
  {
    const P = await open(FILE, { browser, touch: true, clock: '2026-10-10T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    // A fresh session of one exercise, with one earlier session for its suggestion.
    const setup = (o) => ev(o => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state;
      s.settings.onboarded = true; s.settings.unit = o.kg ? 'kg' : 'lb'; s.settings.autoDone = false; delete s.settings.autoAdj; delete s.settings.gym; s.injuries = [];
      if (o.gym) s.settings.gym = o.gym; if (o.off) s.settings.autoAdj = false; if (o.fill) s.settings.loadFill = 'fill'; else delete s.settings.loadFill;
      const u = v => o.kg ? v : v * LB;
      s.sessions = [{ id: 'h1', date: '2026-10-03', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: o.ex, rr: [o.lo, o.hi], sets: [0, 1, 2].map(i => ({ w: u(o.w), r: o.reps ? o.reps[i] : o.r0 || o.lo + 1, rir: 1, done: true })) }] }];
      s.draft = null; L.state = L.normalize(s); L.invalidate();
      L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose();
      const d = L.state.draft; const plan = { sets: o.sets || 3, repMin: o.lo, repMax: o.hi, rir: o.rir == null ? 1 : o.rir, rest: 90, inc: o.kg ? 2.5 : 5 * LB };
      const b = L.newBlock(o.ex, plan, o.light ? { light: true } : {}); if (o.light) b.light = true; d.ex.push(b);
      if (o.deload) d.deload = true; if (o.past) d.past = true;
      L.saveNow(); L.ui.tab = 'today'; L.render();
      return { sw: b.sw == null ? null : (o.kg ? b.sw : b.sw / LB) };
    }, o);
    const tick = (si, reps, rir) => ev(async ([si, reps, rir]) => {
      const L = window.__ironlog; const b = L.state.draft.ex[0];
      const inp = document.querySelector(`[data-f="r"][data-b="0"][data-s="${si}"]`); inp.value = String(reps);
      inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
      b.sets[si].rir = rir == null ? null : rir;
      document.querySelector(`[data-act="sDone"][data-b="0"][data-s="${si}"]`).click(); await new Promise(r => setTimeout(r, 120));
    }, [si, reps, rir]);
    const read = (kg) => ev(kg => {
      const L = window.__ironlog; const b = L.state.draft.ex[0]; const k = v => v == null ? null : Math.round((kg ? v : v / 0.45359237) * 100) / 100;
      return { adj: b.adj ? { at: b.adj.at, w: k(b.adj.w), from: k(b.adj.from), up: b.adj.up, r: b.adj.r } : null, ph: [...document.querySelectorAll('[data-f="w"][data-b="0"]')].map(i => i.value || i.placeholder), rph: [...document.querySelectorAll('[data-f="r"][data-b="0"]')].map(i => i.value || i.placeholder), line: (document.getElementById('adj-0') || {}).innerText || '', w: b.sets.map(x => k(x.w)) };
    }, kg);

    // Up from rated RIR: 185 x 10 with 4 in reserve on 6 to 10 at RIR 1.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await tick(0, 10, 4);
    let r = await read();
    ok(r.adj && r.adj.up && r.adj.w === 200 && r.ph[1] === '200' && r.ph[2] === '200', 'a set much easier than planned (185 x 10, 4 in reserve, target 1) moves the next sets up: 200, at most 10%, in 5 lb steps', r);
    ok(/Next sets: 200 lb, up because set 1 had 4 in reserve, against a target of 1\./.test(r.line) && /Keep 185 lb/.test(r.line), 'the line says the new load, why, and offers to keep the old one', r.line);
    ok(r.rph[1] === '8', 'the grey reps under it are what the estimate expects at the new load (8)', r.rph);
    await tick(1, 8, 1);
    r = await read();
    ok(r.w[1] === 200 && r.ph[2] === '200' && r.rph[2] === '8', 'set 2 ticked takes 200; set 3 stays on 200 with set 2\'s reps', r);
    // Untick set 1: the adjustment goes with it.
    await ev(async () => { document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').click(); await new Promise(r => setTimeout(r, 100)); });
    r = await read();
    ok(!r.adj, 'unticking the set the adjustment came from removes it', r.adj);

    // Keep: back to 185 for the rest of the session.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await tick(0, 10, 4);
    await ev(() => document.querySelector('#adj-0 [data-act="adjKeep"]').click()); await wait(80);
    r = await read();
    ok(!r.adj && r.ph[1] === '185' && !r.line, 'Keep puts the next sets back on 185 and removes the line', r);
    await tick(1, 11, 4);
    r = await read();
    ok(!r.adj, 'after Keep, that exercise is not adjusted again this session', r.adj);

    // With "Fill in suggested loads" on, the rows hold the numbers: they change, and Keep puts them back.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8, fill: true });
    const filled = await ev(() => window.__ironlog.state.draft.ex[0].sets.map(x => x.w == null ? null : Math.round(x.w / 0.45359237)));
    await tick(0, 10, 4);
    r = await read();
    ok(filled.join() === '185,185,185' && r.w.join() === '185,200,200' && r.ph[1] === '200', 'with suggested loads filled in, the rows still on 185 become 200', { filled, w: r.w });
    await ev(() => document.querySelector('#adj-0 [data-act="adjKeep"]').click()); await wait(80);
    r = await read();
    ok(r.w.join() === '185,185,185' && r.ph[2] === '185', 'and Keep puts them back on 185', r.w);
    // Down: 185 x 4 on 6 to 10 (2 short), effort not rated.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await tick(0, 4, null);
    r = await read();
    ok(r.adj && !r.adj.up && r.adj.w < 185 && r.adj.w % 5 === 0 && /down because set 1 stopped at 4, under your 6/.test(r.line), 'two or more reps under the range moves the next sets down, in whole steps, and says why', r);
    // Building reps up from under the range (last time 185 x 5, 4, 4 on 6 to 10, so the target is more reps at 185):
    // 4 on set 1, one under last time, is not 2 under what was expected, so nothing moves.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, reps: [5, 4, 4] });
    await tick(0, 4, null);
    r = await read();
    ok(!r.adj, 'a lift building reps up from under the range is left alone: 4 reps where last time was 4 does not move the next sets down', r);
    // Normal fatigue: one rep short of the range changes nothing; neither does a set in the range.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await tick(0, 8, 1); await tick(1, 6, 0); await tick(2, 5, 0);
    r = await read();
    ok(!r.adj && !r.line, 'a set in the range, then 6, then 5 (one under, normal fatigue): nothing changes', r);
    // Stopped early: 4 reps with 3 in reserve is not too heavy.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await tick(0, 4, 3);
    r = await read();
    ok(!r.adj, 'a set stopped early (4 reps, 3 in reserve) is not read as too heavy', r.adj);
    // Effort not rated, reps 3 past the top: up.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await tick(0, 13, null);
    r = await read();
    ok(r.adj && r.adj.up && r.adj.w > 185 && r.adj.w <= 185 * 1.1 + 1e-6, 'with effort not rated, 3 or more reps past the top moves up (at most 10%)', r.adj);
    // A typed load below is never changed.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await ev(() => { const i = document.querySelector('[data-f="w"][data-b="0"][data-s="2"]'); i.value = '190'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
    await tick(0, 10, 4);
    r = await read();
    ok(r.ph[1] === '200' && r.ph[2] === '190', 'a load typed on a later set is never changed', r.ph);
    // The rack: dumbbells from Your gym.
    await setup({ ex: 'dbLateral', w: 20, lo: 12, hi: 15, r0: 13, gym: { u: 'lb', db: { lo: 5, hi: 50, st: 5, fine: 2.5, fineTo: 25 } } });
    await tick(0, 19, 4);
    r = await read();
    ok(r.adj && [22.5, 25].includes(r.adj.w), 'on a dumbbell rack the new load is a dumbbell the gym has (20 to ' + (r.adj && r.adj.w) + ')', r.adj);
    // Where it stays off.
    const offCases = [['a lighter day', { light: true }], ['a deload', { deload: true }], ['a past workout', { past: true }], ['the setting off', { off: true }]];
    for (const [name, o] of offCases) {
      await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8, ...o });
      await tick(0, 10, 4); r = await read();
      ok(!r.adj, `off for ${name}`, r.adj);
    }
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await ev(() => { const L = window.__ironlog; L.state.injuries = [{ id: 'i1', m: 'chest', note: '', date: '2026-10-09' }]; L.render(); });
    await tick(0, 10, 4); r = await read();
    ok(!r.adj, 'off for an injured area', r.adj);
    await ev(() => { window.__ironlog.state.injuries = []; });
    await setup({ ex: 'assistPullup', w: -30, lo: 6, hi: 10, r0: 8 });
    await tick(0, 12, 4); r = await read();
    ok(!r.adj, 'off for an assisted lift', r.adj);
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets[0].warm = true; L.render(); });
    await tick(0, 15, 5); r = await read();
    ok(!r.adj, 'off for a warm-up', r.adj);
    // It survives a reload, and Finish saves the adjusted loads; the next session reads them.
    await setup({ ex: 'bench', w: 185, lo: 6, hi: 10, r0: 8 });
    await tick(0, 10, 4);
    await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(300);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    r = await read();
    ok(r.adj && r.adj.w === 200 && r.ph[1] === '200', 'the adjustment is kept through a reload', r);
    await tick(1, 8, 1); await tick(2, 7, 1);
    const fin = await ev(async () => {
      const L = window.__ironlog; L.state.draft._rampAsked = true; L.state.draft._leftAsked = true; L.ACT.finish(); await new Promise(r => setTimeout(r, 300));
      if (L.ui.modal) L.ACT.mClose();
      const s = L.sortedSessions().pop(); const sets = s.ex[0].sets.map(x => Math.round(x.w / 0.45359237));
      const nx = L.suggest('bench', { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 5 * 0.45359237 }, {});
      return { sets, nx: Math.round(nx.w / 0.45359237), text: nx.text };
    });
    ok(fin.sets.join() === '185,200,200' && fin.nx === 200, 'Finish saves 185, 200, 200, and the next session works from 200, the load done for most sets', fin);
    // Settings has the switch, with the rule in its tip.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:timer'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    const sw = await ev(() => { const c = document.querySelector('[data-bind="autoAdj"]'); return c ? { on: c.checked, tip: c.closest('label').querySelector('[data-tip]').dataset.tip } : null; });
    ok(sw && sw.on && /two or more under the range/i.test(sw.tip), 'Settings > Rest timer and logging has it on by default, its rule in the tip', sw);
    await P.page.click('[data-bind="autoAdj"]'); await wait(80);
    ok(await ev(() => window.__ironlog.state.settings.autoAdj === false && !window.__ironlog.adjOn()), 'turning it off is saved');
    await P.page.click('[data-bind="autoAdj"]'); await wait(80);
    ok(await ev(() => window.__ironlog.state.settings.autoAdj === undefined), 'on again leaves nothing stored');
    ok(!P.errors.length, 'adjusting: no page errors', P.errors);
    await P.ctx.close();
  }

  // ---------- 2. Nothing logged yet: dashes, not zeros; the library button ----------
  {
    const P = await open(FILE, { browser, touch: true, clock: '2026-10-10T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const zeros = await ev(() => {
      const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.hidden = []; L.saveNow(); const out = {};
      for (const t of ['today', 'dash', 'history']) {
        L.ui.tab = t; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
        const hits = []; const walk = el => { for (const n of el.childNodes) { if (n.nodeType === 3) { const v = n.textContent.trim(); if (/(^|\s)0(\s|$|%)/.test(v) && !/RIR/.test(v)) hits.push(v); } else if (n.nodeType === 1 && !['OPTION', 'SELECT', 'INPUT', 'TEXTAREA'].includes(n.tagName) && !n.closest('[hidden]')) walk(n); } };
        walk(document.getElementById('view')); out[t] = hits;
      }
      L.ui.tab = 'program'; L.ui.planView = 'program'; L.render(); out.lib = (document.querySelector('.libbtn') || {}).innerText;
      L.ui.tab = 'today'; L.render(); out.ring = (document.querySelector('.ring .rv') || {}).textContent; out.tiles = [...document.querySelectorAll('.tile .tv')].map(x => x.textContent);
      return out;
    });
    ok(!zeros.today.length && !zeros.dash.length && !zeros.history.length, 'before anything is logged, Today, Stats, and History show no bare zeros', zeros);
    ok(zeros.ring === '–' && zeros.tiles.every(x => x === '–'), 'the week ring and At a glance show a dash', zeros);
    ok(/^Exercise library\s*›?$/.test((zeros.lib || '').trim()), 'the Exercise library button has no line under it', zeros.lib);
    const after = await ev(() => {
      const L = window.__ironlog; L.state.sessions = [{ id: 'z1', date: '2026-10-09', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: 60, r: 8, rir: 1, done: true }] }] }];
      L.invalidate(); L.ui.tab = 'today'; L.render(); return { ring: document.querySelector('.ring .rv').textContent, tiles: [...document.querySelectorAll('.tile .tv')].map(x => x.textContent) };
    });
    ok(after.ring !== '–' && after.tiles.every(x => /^\d+$/.test(x)), 'once a session is logged, numbers come back, a real 0 included', after);
    await P.ctx.close();
  }

  // ---------- 3. Weigh-ins and bodyweight lifts ----------
  {
    const P = await open(FILE, { browser, touch: true, clock: '2026-10-10T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    // Set up page: an optional bodyweight.
    // On the build the account page comes first; Continue without an account leads to Set up.
    await ev(() => { const L = window.__ironlog; L.render(); const later = document.querySelector('#obPage [data-act="obAcctLater"]'); if (later) later.click(); });
    await wait(150);
    const setupPage = await ev(() => { const f = document.getElementById('obBw'); return f ? f.closest('label').innerText : null; });
    ok(/Bodyweight\s*\(optional\)/.test(setupPage || ''), 'the Set up page asks for bodyweight, optional', setupPage);
    await P.page.fill('#obBw', '180'); await P.page.dispatchEvent('#obBw', 'change'); await wait(80);
    ok(await ev(() => { const b = window.__ironlog.state.bodyweights; return b.length === 1 && b[0].date === '2026-10-10' && Math.abs(b[0].kg / 0.45359237 - 180) < 0.01; }), 'it is saved as today\'s weigh-in');
    await P.page.fill('#obBw', '181'); await P.page.dispatchEvent('#obBw', 'change'); await wait(80);
    ok(await ev(() => window.__ironlog.state.bodyweights.length === 1 && Math.abs(window.__ironlog.state.bodyweights[0].kg / 0.45359237 - 181) < 0.01), 'typed again, it replaces today\'s rather than adding one');
    // The cadence card on Today.
    const due = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; L.state.settings.onboarded = true;
      L.state.sessions = [{ id: 'w1', date: '2026-10-01', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: 60, r: 8, rir: 1, done: true }] }] }];
      const o = {}; const card = () => !!document.getElementById('bwDue');
      L.state.bodyweights = [{ id: 'b1', date: '2026-09-30', kg: 80 }]; L.invalidate(); L.ui.tab = 'today'; L.render(); o.d10 = card();
      L.state.bodyweights = [{ id: 'b1', date: '2026-09-26', kg: 80 }]; L.render(); o.d14 = card(); o.text = (document.getElementById('bwDue') || {}).innerText;
      L.state.settings.bwEvery = 30; L.render(); o.every30 = card();
      L.state.settings.bwEvery = 7; L.state.bodyweights = [{ id: 'b1', date: '2026-10-02', kg: 80 }]; L.render(); o.every7 = card();
      L.state.settings.bwEvery = 0; L.render(); o.off = card();
      delete L.state.settings.bwEvery; L.state.bodyweights = []; L.render(); o.none = card();
      return o;
    });
    ok(!due.d10 && due.d14 && /Weigh-in due\. Last 176\.4 lb, 14 days ago\./.test(due.text), 'every 2 weeks by default: nothing at 10 days, the card at 14, with the last weigh-in', due);
    ok(!due.every30 && due.every7 && !due.off && due.none, 'every month, every week, off, and no weigh-in at all after a session', due);
    await ev(() => { const L = window.__ironlog; L.state.bodyweights = [{ id: 'b1', date: '2026-09-20', kg: 80 }]; L.render(); });
    await P.page.fill('#bwDueVal', '178'); await P.page.click('#bwDue [data-act="addBW"]'); await wait(100);
    const saved = await ev(() => ({ n: window.__ironlog.state.bodyweights.length, last: window.__ironlog.state.bodyweights.find(b => b.date === '2026-10-10'), card: !!document.getElementById('bwDue') }));
    ok(saved.n === 2 && saved.last && Math.abs(saved.last.kg / 0.45359237 - 178) < 0.01 && !saved.card, 'Save logs it for today and the card goes', saved);
    await ev(() => { const L = window.__ironlog; L.state.bodyweights = [{ id: 'b1', date: '2026-09-20', kg: 80 }]; L.render(); });
    await P.page.click('#bwDue [data-act="bwLater"]'); await wait(80);
    ok(await ev(() => !document.getElementById('bwDue') && localStorage.getItem('ironlog.v1.bwSnooze') === '2026-10-12'), 'Later waits 2 days');
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:general'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    await P.page.selectOption('[data-bind="bwEvery"]', '7'); await wait(60);
    ok(await ev(() => window.__ironlog.state.settings.bwEvery === 7), 'Settings > General sets the reminder (every week)');
    await P.page.selectOption('[data-bind="bwEvery"]', '14'); await wait(60);
    ok(await ev(() => window.__ironlog.state.settings.bwEvery === undefined), 'every 2 weeks, the default, stores nothing');
    // Bodyweight lifts: each session at its own weigh-in, PRs at the latest, suggestions at today's.
    const bwl = await ev(() => {
      const L = window.__ironlog; const s = L.state; s.settings.unit = 'kg';
      s.bodyweights = [{ id: 'b1', date: '2026-08-01', kg: 80 }, { id: 'b2', date: '2026-09-15', kg: 84 }];
      const mk = (id, date, exId, w, r) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId, rr: [6, 10], sets: [0, 1, 2].map(() => ({ w, r, rir: 1, done: true })) }] });
      s.sessions = [mk('p1', '2026-08-10', 'pullup', 0, 8), mk('p2', '2026-09-20', 'pullup', 0, 8), mk('c1', '2026-09-20', 'chinup', 5, 8), mk('d1', '2026-09-20', 'dips', 10, 10), mk('u1', '2026-09-20', 'pushup', 0, 20)];
      L.invalidate(); const I = L.IDX(); const o = {};
      o.at = [L.bwAt('2026-08-10'), L.bwAt('2026-09-20'), L.bwAt('2026-07-01')];
      const pts = I.byEx.pullup.map(x => x.pts[0].load); o.loads = pts.map(v => Math.round(v * 10) / 10);
      o.vol = I.sessVol.filter(x => x.id === 'p1' || x.id === 'p2').map(x => Math.round(x.vol));
      o.pr = I.prs.filter(x => x.exId === 'pullup' && x.big).length;
      const P6 = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 2.5 };
      o.sg = ['pullup', 'chinup', 'dips', 'pushup'].map(id => { const x = L.suggest(id, P6, {}); return [id, x.w, /NaN|undefined/.test(x.text)]; });
      o.lifted = I.sessVol.filter(x => x.date === '2026-09-20').reduce((a, x) => a + x.vol, 0) > 0;
      return o;
    });
    ok(bwl.at.join() === '80,84,80', 'each session uses the weigh-in on or before its date, and one before the first weigh-in uses the first', bwl.at);
    ok(bwl.loads[0] === bwl.loads[1], 'the same pull-ups read the same before and after a heavier weigh-in: estimates are at the latest weigh-in', bwl.loads);
    ok(bwl.vol[0] < bwl.vol[1], 'weight lifted uses each day\'s weigh-in: the work actually done', bwl.vol);
    // The case a reviewer's lifter met: push-ups unchanged for weeks while the scale went down 8 kg.
    const pu = await ev(() => {
      const L = window.__ironlog; const s = L.state; s.settings.unit = 'kg';
      s.bodyweights = [{ id: 'q1', date: '2026-08-20', kg: 88 }, { id: 'q2', date: '2026-09-10', kg: 84 }, { id: 'q3', date: '2026-09-30', kg: 80 }];
      const d0 = Date.parse('2026-08-24T12:00:00'); s.sessions = Array.from({ length: 14 }, (_, i) => ({ id: 'pu' + i, date: new Date(d0 + i * 3.5 * 864e5).toISOString().slice(0, 10), dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'pushup', rr: [15, 20], sets: [0, 1, 2].map(() => ({ w: 0, r: 18, rir: 2, done: true })) }] }));
      L.invalidate(); const st = L.IDX().exStats.pushup; return { falling: st.falling, moving: st.moving, pct: st.pct, stalled: st.stalled, coach: L.coach().text };
    });
    ok(!pu.falling && !/recovery/i.test(pu.coach), 'unchanged push-ups while the scale goes down 8 kg are not read as strength falling, and the coach does not blame recovery', pu);
    ok(bwl.pr === 0, 'the same 8 pull-ups after a heavier weigh-in are not a PR (judged at the latest weigh-in; the first session is the baseline)', bwl.pr);
    ok(bwl.sg.every(([, w, bad]) => w != null && !bad) && bwl.lifted, 'pull-ups, chin-ups, dips, and push-ups all get a suggestion with no gaps, and count in weight lifted', bwl.sg);
    ok(!P.errors.length, 'weigh-ins: no page errors', P.errors);
    await P.ctx.close();
  }

  // ---------- 4. Today starts blank; two-a-days; rest weeks; + Drop; Suggest for the library ----------
  {
    const P = await open(FILE, { browser, touch: true, clock: '2026-10-10T18:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg'; s.bodyweights = [{ id: 'b', date: '2026-10-09', kg: 80 }];
      s.sessions = [{ id: 'f0', date: '2026-10-03', dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w: 60, r: 12, rir: 1, done: true })) }] }];
      L.invalidate(); L.saveNow(); });
    // Freestyle by default.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:timer'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    await P.page.selectOption('[data-bind="todayStart"]', 'free'); await wait(80);
    const fr = await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); const h = document.querySelector('.hero'); return { set: L.state.settings.todayStart, h2: h.querySelector('h2').textContent, start: !!h.querySelector('[data-act="startFree"].primary'), plan: (h.querySelector('[data-act="startSession"]') || {}).innerText || '', preview: !!document.querySelector('[data-mkey="session"]') }; });
    ok(fr.set === 'free' && fr.h2 === 'Blank session' && fr.start && /^Plan: /.test(fr.plan) && !fr.preview, 'Today starts with a blank session: Start session is freestyle, the plan\'s day is one tap away, no plan preview', fr);
    const fs = await ev(() => { const L = window.__ironlog; document.querySelector('.hero [data-act="startFree"]').click(); if (L.ui.modal) L.ACT.mClose(); const d = L.state.draft; d.ex.push(L.newBlock('bench', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 })); return { free: d.free, sw: d.ex[0].sw, target: d.ex[0].target }; });
    ok(fs.free === true && fs.sw === 62.5 && /62\.5/.test(fs.target), 'a freestyle session still suggests from history: 60 x 12 at the top of 8 to 12 goes to 62.5', fs);
    // In freestyle the week is measured against the lifter's own training, not an unused plan's days.
    const fm = await ev(() => {
      const L = window.__ironlog; L.state.draft = null; const s = L.state;
      const mk = (id, date) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w: 60, r: 10, rir: 1, done: true })) }] });
      // Three weeks of 2 sessions each, and this week 3 sessions on 2 days (a two-a-day).
      s.sessions = [mk('a', '2026-09-15'), mk('b', '2026-09-17'), mk('c', '2026-09-22'), mk('d', '2026-09-24'), mk('e', '2026-09-29'), mk('f', '2026-10-01'), mk('g', '2026-10-06'), mk('h', '2026-10-08'), mk('i', '2026-10-08')];
      L.invalidate(); L.ui.tab = 'today'; L.ui.hidden; s.settings.hidden = []; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const wk = document.querySelector('[data-mkey="week"] .sec-s').textContent; const st = L.weekStreak(); const sub = document.querySelector('.hero .muted.small').textContent;
      L.ui.tab = 'dash'; L.render(); const adh = [...document.querySelectorAll('.kpi .l')].map(x => x.textContent).find(t => /Adherence/.test(t));
      return { wk, streak: st.weeks, need: st.need, sub, adh };
    });
    ok(fm.wk === '3 sessions' && fm.streak === 4 && fm.need === 1 && /3 sessions, 9 hard sets this week/.test(fm.sub) && /freestyle, no plan to follow/.test(fm.adh), 'freestyle: This week counts sessions (a two-a-day counts twice), the streak is weeks trained in a row, adherence has no plan', fm);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); delete L.state.settings.todayStart; L.ui.tab = 'today'; L.render(); });
    ok(await ev(() => document.querySelector('.hero h2').textContent !== 'Blank session'), 'back on My plan\'s day, Today shows the plan as before');
    // Two-a-days.
    const two = await ev(() => {
      const L = window.__ironlog; const s = L.state; const o = {};
      const mk = (id, t, w, r) => ({ id, date: '2026-10-09', t, dayIdx: 0, dayId: null, dayName: id === 'am' ? 'Morning' : 'Evening', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w, r, rir: 1, done: true })) }] });
      // Ids chosen so that ordering by id alone would put the evening first.
      s.sessions.push(mk('am', Date.parse('2026-10-09T07:00:00'), 62.5, 10), mk('a0', Date.parse('2026-10-09T18:30:00'), 62.5, 12));
      L.state = L.normalize(s); L.invalidate();
      o.order = L.sortedSessions().filter(x => x.date === '2026-10-09').map(x => x.id).join();
      const x = L.suggest('bench', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 }, {}); o.last = x.last; o.w = x.w;
      return o;
    });
    ok(two.order === 'am,a0', 'two sessions on one day are ordered by the time they started, not by id', two);
    ok(two.w === 65 && /12, 12, 12|12×3|×12/.test(two.last), 'the next suggestion works from the evening session, the later one (62.5 x 12 all sets: 65)', two);
    await ev(() => { const L = window.__ironlog; L.ACT.calDay({ dataset: { date: '2026-10-09' } }); });
    await wait(80);
    const dp = await ev(() => ({ kind: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind, items: [...document.querySelectorAll('#modal [data-act="wkOpen"]')].map(b => b.innerText.replace(/\s+/g, ' ')) }));
    ok(dp.kind === 'daypick' && dp.items.length === 2 && /Morning/.test(dp.items[0]) && /Evening/.test(dp.items[1]), 'a calendar day with two sessions asks which, in the order done', dp);
    await P.page.click('#modal [data-act="wkOpen"]:nth-of-type(2)').catch(() => P.page.evaluate(() => document.querySelectorAll('#modal [data-act="wkOpen"]')[1].click())); await wait(150);
    ok(await ev(() => window.__ironlog.ui.tab === 'history' && window.__ironlog.ui.histOpen === 'a0' && !window.__ironlog.ui.modal), 'picking one opens it in History');
    const save = await ev(async () => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose(); const d = L.state.draft; const b = L.newBlock('bench', { sets: 1, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 }); d.ex.push(b); b.sets[0].r = 8; b.sets[0].done = true; b.sets[0].w = 65; d._rampAsked = true; d._leftAsked = true; L.ACT.finish(); await new Promise(r => setTimeout(r, 200)); if (L.ui.modal) L.ACT.mClose(); const s = L.state.sessions.find(x => x.date === '2026-10-10'); return s ? { t: s.t > 0 } : null; });
    ok(save && save.t, 'a session saved now keeps when it started, for the order within a day', save);
    // Rest weeks.
    const rest = await ev(() => {
      const L = window.__ironlog; const s = L.state; const o = {};
      const wk = d => ({ id: 'r' + d, date: d, dayIdx: 0, dayId: null, dayName: 'T', routineId: '', free: true, notes: '', ex: [{ exId: 'bench', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w: 60, r: 10, rir: 1, done: true })) }] });
      s.sessions = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-28', '2026-10-05'].map(wk);
      L.invalidate();
      const a0 = L.avgWeeks(4); o.missedBefore = a0._missed; o.weeksBefore = a0._weeks;
      s.settings.restWeeks = ['2026-09-21']; L.state = L.normalize(s); L.invalidate();
      const a1 = L.avgWeeks(4); o.missedAfter = a1._missed; o.weeksAfter = a1._weeks;
      o.coach = L.coach().text;
      s.settings.restWeeks = ['2026-10-05']; L.state = L.normalize(s); L.invalidate(); o.coachNow = L.coach().text;
      return o;
    });
    ok(rest.missedBefore === 1 && rest.missedAfter === 0 && rest.weeksAfter === 4, 'a week off counts as missed until it is marked a rest week; then the average reaches past it', rest);
    ok(/Rest week\. Nothing to hit this week\./.test(rest.coachNow), 'during a rest week the coach says so', rest.coachNow);
    await ev(() => { const L = window.__ironlog; delete L.state.settings.restWeeks; L.saveNow(); L.ui.tab = 'today'; L.ui.heroMore = true; L.render(); });
    await P.page.click('[data-act="restWkOpen"]'); await wait(80);
    const sheet = await ev(() => [...document.querySelectorAll('#modal [data-act="restWk"]')].map(b => b.innerText));
    ok(sheet.length === 2 && /^This week/.test(sheet[0]) && /^Last week/.test(sheet[1]), 'More options > Rest week offers this week and last week', sheet);
    await P.page.click('#modal [data-act="restWk"][data-w="2026-10-05"]'); await wait(100);
    ok(await ev(() => JSON.stringify(window.__ironlog.state.settings.restWeeks) === '["2026-10-05"]' && /rest week/.test(document.querySelector('.hero .eyebrow').textContent)), 'marked: saved, and the Today card says rest week');
    await ev(() => window.__ironlog.ACT.mClose()); await ev(() => window.__ironlog.ACT.undo()); await wait(200);
    ok(await ev(() => window.__ironlog.state.settings.restWeeks === undefined), 'Undo takes it back');
    // + Drop.
    const drop = await ev(async () => {
      const L = window.__ironlog; L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose(); const d = L.state.draft; d.ex.push(L.newBlock('bench', { sets: 2, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.5 })); L.render();
      const before = !!document.querySelector('[data-act="dropAdd"][data-b="0"]');
      const i = document.querySelector('[data-f="r"][data-b="0"][data-s="0"]'); i.value = '10'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true }));
      document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').click(); await new Promise(r => setTimeout(r, 100)); L.render();
      const btn = document.querySelector('.row [data-act="dropAdd"][data-b="0"]'); const after = !!btn; if (btn) btn.click(); await new Promise(r => setTimeout(r, 100));
      const b = L.state.draft.ex[0]; const last = b.sets[b.sets.length - 1];
      return { before, after, drop: last.drop, w: last.w, base: b.sets[0].w };
    });
    ok(!drop.before && drop.after && drop.drop && drop.w === drop.base - Math.ceil(drop.base * 0.25 / 2.5 - 1e-6) * 2.5, '+ Drop shows beside + Set once a set is done, and adds a drop set at about 75% in whole 2.5 kg steps (' + drop.base + ' to ' + drop.w + ')', drop);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
    // Suggest for the library.
    const sug = await ev(async () => {
      const L = window.__ironlog; L.state.exercises.push({ id: 'cx1', name: 'Landmine Squat Press', primary: 'quads', secondary: ['frontDelts', 'glutes'], equip: 'landmine', bw: false, rare: false, perSide: false, note: '', custom: true, archived: false });
      L.state = L.normalize(L.state); L.saveNow();
      const e = L.state.exercises.find(x => x.id === 'cx1'); L.openModal({ kind: 'exEdit', e: JSON.parse(JSON.stringify(e)), isNew: false }); await new Promise(r => setTimeout(r, 60));
      const has = !!document.querySelector('#modal [data-act="exSuggest"]'); L.ACT.exSuggest(); await new Promise(r => setTimeout(r, 60));
      const m = L.ui.modal; const lib = L.state.exercises.filter(x => x.id === 'cx1').length;
      L.ACT.mClose();
      L.openModal({ kind: 'exEdit', e: JSON.parse(JSON.stringify(L.state.exercises.find(x => x.id === 'bench'))), isNew: false }); await new Promise(r => setTimeout(r, 60));
      const builtIn = !!document.querySelector('#modal [data-act="exSuggest"]'); L.ACT.mClose();
      return { has, kind: m && m.kind, cat: m && m.cat, msg: m && m.msg, lib, builtIn };
    });
    ok(sug.has && sug.kind === 'feedback' && sug.cat === 'idea' && /Add to the library: Landmine Squat Press\. Main muscle: Quads; also Front delts and Glutes\. Equipment: Landmine\./.test(sug.msg) && !sug.builtIn, 'your own exercise has Suggest for the library, which opens a suggestion to the owner with its details; library exercises do not', sug);
    ok(!P.errors.length, 'Today, two-a-days, rest weeks, drops: no page errors', P.errors);
    await P.ctx.close();
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  await browser.close().catch(() => {});
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
