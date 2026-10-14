// r46: the r45 quality check. One 4-week window for sessions and PRs on
// every screen, the 4 weeks before only when the log covers them, adherence
// counting sessions as the ring and streak do, a rest week with no ring, the
// draft synced after the sessions, an edit replaced from another device said
// so, and two speed-ups that must not change a thing (dates, week counts).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const CLOCK = '2026-10-14T10:00:00';

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();

  // ---- 1. Counts: Today's PR tile, the Stats tiles and Recent PRs read one window.
  {
    const P = await open('index.html', { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = []; L.saveNow();
      L.ui.tab = 'today'; L.render(); const tile = [...document.querySelectorAll('.tile')].find(t => /PRs/.test(t.textContent));
      const today = tile && { n: tile.querySelector('.tv').textContent, l: tile.querySelector('.tl').textContent };
      L.ui.tab = 'dash'; L.render(); const kp = [...document.querySelectorAll('.kpi')].map(k => ({ v: k.querySelector('.v').textContent, l: k.querySelector('.l').textContent }));
      const prsSub = (document.querySelector('[data-sk="dash:prs"] .sec-s, [data-sk="dash:prs"] summary') || {}).textContent || document.getElementById('view').textContent.match(/Recent PRs\s*([^A-Z]*?in 4 weeks)/)?.[1];
      const R4 = L.recent4w(); const first = L.sortedSessions()[0].date;
      return { today, kp, prsSub, R4: { sess: R4.sess, prs: R4.prs.length, back: R4.back }, first, view: document.getElementById('view').textContent.replace(/\s+/g, ' ') }; });
    const prT = r.kp.find(k => /^PRs, last 4 weeks/.test(k.l)), seT = r.kp.find(k => /^Sessions, last 4 weeks/.test(k.l));
    ok(r.today && r.today.l === 'PRs, last 4 weeks' && prT && r.today.n === prT.v && +prT.v === r.R4.prs, 'Today\'s PR tile and the Stats tile: the same 4 weeks, the same number', { today: r.today, prT });
    ok(new RegExp(`Recent PRs.{0,40}${r.R4.prs} in 4 weeks`).test(r.view), 'Recent PRs counts the same 4 weeks', r.view.match(/Recent PRs.{0,60}/));
    // The demo log starts 51 days back: under 8 weeks, so no "4 weeks before".
    ok(r.first > '2026-08-20' && !r.R4.back && seT && !/before/.test(seT.l) && !/before/.test(prT.l), 'a log under 8 weeks old gives no 4 weeks before (it would compare against a part of a month)', { first: r.first, seT, prT });
    const r2 = await P.page.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions; const o = JSON.parse(JSON.stringify(s[0])); o.id = 'old1'; o.date = '2026-08-19'; s.push(o); L.state = L.normalize(L.state); L.invalidate(); L.ui.tab = 'dash'; L.render();
      return { back: L.recent4w().back, l: [...document.querySelectorAll('.kpi .l')].map(x => x.textContent) }; });
    ok(r2.back && r2.l.some(t => /^Sessions, last 4 weeks \(\d+ in the 4 weeks before\)$/.test(t)), 'a log reaching back 8 weeks gives the 4 weeks before', r2);
    ok(!P.errors.length, 'no page errors (counts)', P.errors);
    await P.ctx.close();
  }

  // ---- 2. Adherence counts sessions (a two-a-day is two), as the ring, This week and the streak do; week counts unchanged by the cache.
  {
    const P = await open('index.html', { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true;
      const R = L.activeRoutine(); const days = R.days.filter(d => !d.rest); const per = L.plannedPerWeek(R);
      const mk = (id, date, t) => ({ id, date, t, dayIdx: R.days.indexOf(days[0]), dayId: days[0].id, dayName: days[0].name, routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 1, done: true }] }] });
      // Four full weeks before this one, each with per-1 days of which one is a two-a-day: per sessions a week.
      s.sessions = []; let n = 0;
      for (let k = 1; k <= 5; k++) { const ws = L.addDays(L.weekStart(L.today()), -7 * k); for (let d = 0; d < per - 1; d++) s.sessions.push(mk('a' + n++, L.addDays(ws, d))); s.sessions.push(mk('a' + n++, L.addDays(ws, 0), '18:00')); }
      L.state = L.normalize(s); L.invalidate(); L.ui.tab = 'dash'; L.ui.folds['dash:consistency'] = true; L.render();
      const brute = ws => { const e = L.addDays(ws, 6); return L.state.sessions.filter(x => x.date >= ws && x.date <= e).length; };
      const wks = [0, 1, 2, 3, 4, 5].map(k => L.addDays(L.weekStart(L.today()), -7 * k));
      return { per, adh: (document.getElementById('adhLine') || {}).textContent, same: wks.every(w => L.weekSessions(w) === brute(w)), streak: L.weekStreak().weeks }; });
    ok(/: 100% of planned sessions/.test(r.adh) && r.streak >= 4, 'a two-a-day counts as two sessions in adherence, as in the streak (100%, not short a day)', r);
    ok(r.same, 'week session counts read from the cache equal a count of every session', r);
    // Random logs: the cached counts equal a count of every session, every week of two years.
    const rnd = await P.page.evaluate(() => { const L = window.__ironlog; let seed = 11; const q = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; }; let bad = 0;
      for (let t = 0; t < 20; t++) { L.state.sessions = Array.from({ length: Math.floor(q() * 300) }, (_, i) => ({ id: 'r' + t + '_' + i, date: L.addDays(L.today(), -Math.floor(q() * 730)), dayName: 'A', notes: '', ex: [{ exId: 'bench', sets: [{ w: 50, r: 5, done: true }] }] })); L.invalidate();
        for (let k = 0; k < 105; k++) { const ws = L.addDays(L.weekStart(L.today()), -7 * k); const e = L.addDays(ws, 6); if (L.weekSessions(ws) !== L.state.sessions.filter(x => x.date >= ws && x.date <= e).length) bad++; } }
      return bad; });
    ok(rnd === 0, 'on 20 random logs, every week of two years counts the same', rnd);
    // Dates read the same through the kept formatters.
    const dt = await P.page.evaluate(() => { const L = window.__ironlog; let bad = [];
      for (let i = 0; i < 800; i += 7) { const d = L.addDays('2025-01-01', i); const p = new Date(d + 'T12:00:00'); const a = L.fmtDate(d), b = L.fmtDateLong(d);
        const ea = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); const eb = new Date(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        if (a !== ea || b !== eb) bad.push([d, a, ea, b, eb]); }
      return bad; });
    ok(dt.length === 0, 'fmtDate and fmtDateLong read the same as before for 115 dates over two years', dt.slice(0, 3));
    ok(!P.errors.length, 'no page errors (adherence)', P.errors);
    await P.ctx.close();
  }

  // ---- 3. A rest week: no ring, and This week says Rest week.
  {
    const P = await open('index.html', { browser, clock: CLOCK });
    const r = await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.hidden = []; L.makeDemo();
      L.ui.tab = 'today'; L.render(); const before = { ring: !!document.querySelector('.hero .ring'), wk: document.querySelector('[data-mkey="week"] .sec-s').textContent };
      L.state.settings.restWeeks = [L.weekStart(L.today())]; L.invalidate(); L.render();
      return { before, ring: !!document.querySelector('.hero .ring'), wk: document.querySelector('[data-mkey="week"] .sec-s').textContent }; });
    ok(r.before.ring && /of/.test(r.before.wk) && !r.ring && /^Rest week/.test(r.wk), 'a rest week shows no ring and This week says Rest week (not 0 of 4)', r);
    ok(!P.errors.length, 'no page errors (rest week)', P.errors);
    await P.ctx.close();
  }

  // ---- 4. Sync: Finish sends the session before the emptied draft; an edit replaced from another device says so.
  {
    const store = new Map(); const writes = [];
    const cloudSetup = async (ctx, page) => {
      await page.exposeFunction('__dbGet', p => store.has(p) ? store.get(p) : null);
      await page.exposeFunction('__dbSet', (p, v) => { store.set(p, v); writes.push(p.split('/').pop()); return true; });
      await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
      await page.addInitScript(() => {
        window.claude = { use: async k => {
          if (k === 'user') return { id: async () => 'u1' };
          if (k === 'db') return { doc: p => ({ get: async () => { const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); } }),
            collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
          return null; } };
      });
    };
    const A = await open('index.html', { browser, clock: CLOCK, setup: cloudSetup });
    const B = await open('index.html', { browser, clock: CLOCK, setup: cloudSetup });
    await wait(800);
    await A.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render(); document.querySelector('[data-act="startSession"]').click(); }); await wait(100);
    await A.page.evaluate(() => window.__ironlog.flush()); await wait(300);
    writes.length = 0;
    await A.page.evaluate(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[0].sets[0].r = 8; d.ex[0].sets[0].w = 50; d.ex[0].sets[0].done = true; d._rampAsked = true; d._leftAsked = true; L.ACT.finishNow(); }); await wait(200);
    await A.page.evaluate(() => window.__ironlog.flush()); await wait(400);
    const iS = writes.findIndex(w => /^s-/.test(w)), iD = writes.indexOf('draft');
    ok(iS >= 0 && iD > iS, 'Finish: the session document goes up before the emptied draft', writes);
    // An edit from History on A, replaced by a workout started on B.
    await B.page.evaluate(() => window.__ironlog.sync()); await wait(500);
    await A.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id: L.state.sessions[L.state.sessions.length - 1].id } }); }); await wait(100);
    await A.page.evaluate(() => window.__ironlog.flush()); await wait(300); await B.page.evaluate(() => window.__ironlog.sync()); await wait(500);
    await B.page.evaluate(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.ui.tab = 'today'; L.render(); document.querySelector('[data-act="startSession"]').click(); }); await wait(100);
    await B.page.evaluate(() => window.__ironlog.flush()); await wait(300);
    await A.page.evaluate(() => window.__ironlog.sync()); await wait(500);
    const t = await A.page.evaluate(() => ({ toast: document.getElementById('toast').innerText, ed: !!(window.__ironlog.state.draft && window.__ironlog.state.draft.editingId) }));
    ok(/edit in progress was replaced by the workout on another device/.test(t.toast) && !t.ed, 'an edit replaced by a workout started on the other phone says so', t);
    ok(!A.errors.length && !B.errors.length, 'no page errors (two phones)', [...A.errors, ...B.errors]);
    await A.ctx.close(); await B.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
