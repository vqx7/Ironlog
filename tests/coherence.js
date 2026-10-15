// Do the screens agree with each other? (r46, after the r45 quality check.)
//
// Every other suite checks that behaviour does not change. None of them asked
// whether two places showing the same quantity show the same number, so three
// different PR counts, two meanings of a week's sessions, and a rest week with
// a plan target all shipped and survived from r38 to r45 with every suite
// green. This suite asks only that question, on whatever the log happens to be,
// so the next number that drifts apart is caught by a machine and not by a
// reader. It states no new rules: it compares the app to itself.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 400) : ''); } else console.log('ok  ', m); };
const FILE = process.argv[2] || 'index.html';

// Everything the screens say, read the way a lifter reads it.
const readAll = () => {
  const L = window.__ironlog; const out = {};
  const num = s => { const m = /(-?\d+(?:\.\d+)?)/.exec(s || ''); return m ? +m[1] : null; };
  L.ui.tab = 'today'; L.render();
  document.querySelectorAll('#view details').forEach(d => { d.open = true; });
  L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
  const ring = document.querySelector('.hero .ring');
  out.ring = ring ? { label: ring.getAttribute('aria-label'), value: ring.querySelector('.rv').textContent } : null;
  out.weekSub = (document.querySelector('[data-mkey="week"] .sec-s') || {}).textContent || '';
  out.wkSets = (document.getElementById('wkSets') || {}).textContent || '';
  const prTile = [...document.querySelectorAll('.tile')].find(t => /PRs/.test(t.textContent));
  out.todayPR = prTile ? { n: num(prTile.querySelector('.tv').textContent), label: prTile.querySelector('.tl').textContent } : null;
  const stTile = [...document.querySelectorAll('.tile')].find(t => /streak/i.test(t.textContent));
  out.todayStreak = stTile ? num(stTile.querySelector('.tv').textContent) : null;
  L.ui.tab = 'dash'; L.render();
  document.querySelectorAll('#view details').forEach(d => { d.open = true; });
  L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
  out.kpis = [...document.querySelectorAll('.kpi')].map(k => ({ v: k.querySelector('.v').textContent, l: k.querySelector('.l').textContent }));
  out.volSub = (document.querySelector('[data-mkey="volume"] .sec-s') || {}).textContent || '';
  out.consSub = (document.querySelector('[data-mkey="consistency"] .sec-s') || {}).textContent || '';
  out.adhLine = (document.getElementById('adhLine') || {}).textContent || '';
  out.dashText = document.getElementById('view').textContent.replace(/\s+/g, ' ');
  out.w = (() => { const w = L.weekStats(); return { planDays: w.planDays, doneDays: w.doneDays, got: w.got, tgt: w.tgt, rest: !!w.rest }; })();
  out.r4 = (() => {
    if (L.recent4w) { const r = L.recent4w(); return { sess: r.sess, prs: r.prs.length, back: r.back }; }
    const d28 = L.addDays(L.today(), -27), d56 = L.addDays(L.today(), -55); const ss = L.sortedSessions();
    return { sess: ss.filter(x => x.date >= d28).length, prs: L.IDX().prs.filter(p => p.big && p.date >= d28).length, back: ss.length > 0 && ss[0].date <= d56 };
  })();
  out.streak = L.weekStreak();
  return out;
};

(async () => {
  const { engine } = require('./h');
  const browser = await engine.launch();

  // ---- An ordinary log.
  {
    const P = await open(FILE, { browser, clock: '2026-10-14T10:00:00' });
    const s = await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = []; L.saveNow(); return true; });
    const r = await P.page.evaluate(readAll);

    // 1. One quantity, one number: PRs in the last 4 weeks.
    const prKpi = r.kpis.find(k => /^PRs, last 4 weeks/.test(k.l));
    ok(r.todayPR && prKpi && r.todayPR.n === +prKpi.v && r.todayPR.n === r.r4.prs,
      'the PR count on Today and on Stats is the same number over the same weeks', { today: r.todayPR, stats: prKpi, r4: r.r4.prs });
    ok(r.todayPR && /4 weeks/.test(r.todayPR.label) && /4 weeks/.test(prKpi.l),
      'and both say the same window', { today: r.todayPR && r.todayPR.label, stats: prKpi && prKpi.l });
    const recent = /Recent PRs[^0-9]{0,30}(\d+) in 4 weeks/.exec(r.dashText);
    ok(!recent || +recent[1] === r.r4.prs, 'Recent PRs counts that same window too', { recent: recent && recent[0], r4: r.r4.prs });

    // 2. Sessions in the last 4 weeks, said once.
    const seKpi = r.kpis.find(k => /^Sessions, last 4 weeks/.test(k.l));
    ok(seKpi && +seKpi.v === r.r4.sess, 'the session count on Stats is the window it names', { kpi: seKpi, r4: r.r4.sess });

    // 3. The ring and This week are the same two numbers.
    ok(r.ring && new RegExp('^' + r.w.doneDays + ' of (about )?' + r.w.planDays + ' sessions').test(r.ring.label)
       && r.ring.value === r.w.doneDays + '/' + r.w.planDays,
      'the ring on Today counts what This week counts', { ring: r.ring, w: r.w });
    ok(r.weekSub.startsWith(r.w.doneDays + ' of'), 'and This week\'s own title agrees with it', { sub: r.weekSub, w: r.w });

    // 4. Hard sets this week, wherever it appears.
    const volN = /(\d+(?:\.\d+)?) hard sets this week/.exec(r.volSub);
    const wkN = /(\d+(?:\.\d+)?) hard sets logged/.exec(r.wkSets);
    ok(volN && wkN && +volN[1] === +wkN[1] && +volN[1] === Math.round(r.w.got * 10) / 10,
      'hard sets this week read the same under Volume and under This week', { vol: r.volSub, wk: r.wkSets, got: r.w.got });

    // 5. The streak on Today is the streak Consistency reports.
    ok(r.todayStreak != null && r.consSub.startsWith(r.todayStreak + '-week streak'),
      'the streak on Today is the streak Consistency shows', { today: r.todayStreak, cons: r.consSub });

    // 6. Nothing claims a number the log cannot support.
    ok(!/in the 4 weeks before/.test(r.dashText) || r.r4.back,
      'a comparison with the 4 weeks before appears only when the log covers them', { back: r.r4.back });
    ok(!P.errors.length, 'no page errors (ordinary log)', P.errors);
    await P.ctx.close();
  }

  // ---- The reason beside a target is the engine's own, so the two cannot drift (r47).
  {
    const P = await open(FILE, { browser, clock: '2026-10-15T10:00:00' });
    const r = await P.page.evaluate(() => { const L = window.__ironlog;
      L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.render();
      document.querySelector('[data-act="startSession"]').click(); L.render();
      return L.state.draft.ex.map((b, i) => { const tip = document.querySelector(`#blk-${i} .hint .tipi`);
        return { target: !!b.target, shown: tip && tip.getAttribute('data-tip'), why: L.whyTarget ? L.whyTarget(b) : null, hint: b.hint || '' }; });
    });
    const withT = r.filter(x => x.target);
    ok(withT.length > 0 && withT.every(x => x.shown && x.shown === x.why),
      "every target on the session screen carries the engine's own reason, word for word", withT.filter(x => x.shown !== x.why).slice(0, 2));
    ok(withT.every(x => x.hint.includes(x.why)), 'and that reason is part of the sentence the engine wrote, never a retelling', withT.filter(x => !x.hint.includes(x.why)).slice(0, 2));
    ok(!P.errors.length, 'no page errors (reason beside target)', P.errors);
    await P.ctx.close();
  }

  // ---- A rest week: no screen asks for work, and none shows a target for it.
  {
    const P = await open(FILE, { browser, clock: '2026-10-14T10:00:00' });
    await P.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.hidden = [];
      L.state.settings.restWeeks = [L.weekStart(L.today())]; L.saveNow(); L.invalidate(); });
    const r = await P.page.evaluate(readAll);
    ok(!r.ring, 'a rest week shows no week ring', r.ring);
    ok(/^Rest week/.test(r.weekSub), 'This week says Rest week', r.weekSub);
    ok(!/of \d+ planned/.test(r.wkSets) && !/\d+ hard sets planned/.test(r.wkSets),
      'and nothing under it states a planned target for a week with no plan', r.wkSets);
    ok(!P.errors.length, 'no page errors (rest week)', P.errors);
    await P.ctx.close();
  }

  // ---- Two sessions in a day: every screen counts a week the same way.
  {
    const P = await open(FILE, { browser, clock: '2026-10-14T10:00:00' });
    const r = await P.page.evaluate(() => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.hidden = [];
      const R = L.activeRoutine(); const days = R.days.filter(d => !d.rest); const per = L.plannedPerWeek(R);
      const mk = (id, date, t) => ({ id, date, t, dayIdx: R.days.indexOf(days[0]), dayId: days[0].id, dayName: days[0].name, routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 1, done: true }] }] });
      s.sessions = []; let n = 0;
      // Each of the last 5 weeks hits the plan, with one of them as a second session on a day already trained.
      for (let k = 1; k <= 5; k++) { const ws = L.addDays(L.weekStart(L.today()), -7 * k);
        for (let d = 0; d < per - 1; d++) s.sessions.push(mk('a' + n++, L.addDays(ws, d)));
        s.sessions.push(mk('a' + n++, L.addDays(ws, 0), '18:00')); }
      L.state = L.normalize(s); L.invalidate(); L.saveNow();
      const out = {}; L.ui.tab = 'dash'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      out.adh = (document.getElementById('adhLine') || {}).textContent || '';
      out.streak = L.weekStreak().weeks; out.per = per;
      return out; });
    const pct = /: (\d+)% of planned sessions \((\d+)\/(\d+)\)/.exec(r.adh);
    ok(pct && +pct[1] === 100 && pct[2] === pct[3],
      'a week that counts for the streak counts in full for adherence, a two-a-day included', { adh: r.adh, streak: r.streak });
    ok(!P.errors.length, 'no page errors (two-a-day)', P.errors);
    await P.ctx.close();
  }

  // ---- A day with two sessions, wherever it is shown (r47): the week bar, the
  // calendar, the day picker, This month's title and History all read one index
  // of sessions by date (dateIndex), in one order (sessCmp). Until r47 each
  // grouped the log itself and the week bar ordered the day by id, so the
  // morning session could be named second.
  {
    const P = await open(FILE, { browser, clock: '2026-10-14T10:00:00' });
    const r = await P.page.evaluate(() => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.hidden = [];
      const R = L.activeRoutine(); const days = R.days.filter(d => !d.rest);
      const mk = (id, date, t, name) => ({ id, date, t, dayIdx: R.days.indexOf(days[0]), dayId: days[0].id, dayName: name, routineId: R.id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 1, done: true }] }] });
      const ws = L.weekStart(L.today()); const mon = ws;
      // The ids are in the opposite order to the clock, so only a reader that orders by start time names the morning first.
      s.sessions = [mk('zz-morning', mon, Date.parse(mon + 'T07:00:00'), 'Morning'), mk('aa-evening', mon, Date.parse(mon + 'T18:00:00'), 'Evening'), mk('bb-other', L.addDays(ws, 2), Date.parse(L.addDays(ws, 2) + 'T09:00:00'), 'Other')];
      L.state = L.normalize(s); L.invalidate(); L.saveNow();
      const out = { mon };
      L.ui.tab = 'today'; L.ui.wkView = 'week'; L.render();
      const wb = [...document.querySelectorAll('#wkbar button')].find(b => b.querySelector('.dn').textContent === String(+mon.slice(8)));
      out.bar = wb ? { name: wb.querySelector('.nm').textContent, label: wb.getAttribute('aria-label') } : null;
      L.ACT.wkView({ dataset: { v: 'month' } }); L.render();
      const cal = document.querySelector(`[data-act="calDay"][data-date="${mon}"]`);
      out.cal = cal ? { x: cal.querySelector('.x').textContent, label: cal.getAttribute('aria-label') } : null;
      out.monthTitle = (document.querySelector('[data-mkey="week"] .sec-s') || {}).textContent || '';
      out.calMarks = [...document.querySelectorAll('[data-act="calDay"].on')].reduce((a, b) => a + (+(b.querySelector('.x').textContent.replace('×', '')) || 1), 0);
      L.ACT.calDay({ dataset: { date: mon } });
      out.pick = [...document.querySelectorAll('#modal [data-act="wkOpen"]')].map(b => b.textContent.trim());
      L.ACT.mClose();
      L.ui.tab = 'history'; L.render();
      out.hist = [...document.querySelectorAll('#view [data-act="histToggle"][data-id]')].map(b => b.dataset.id);
      return out; });
    ok(r.bar && r.bar.name === 'Morning +1' && /Morning, Evening, logged/.test(r.bar.label), 'the week bar names the morning session first and counts the second', r.bar);
    ok(r.cal && r.cal.x === '×2' && /Morning, Evening/.test(r.cal.label), 'the calendar marks the day ×2 in the same order', r.cal);
    ok(r.pick.length === 2 && /^Morning/.test(r.pick[0]) && /^Evening/.test(r.pick[1]), 'the day picker lists them in that order', r.pick);
    ok(/^3 sessions/.test(r.monthTitle) && r.calMarks === 3, 'This month counts what the calendar marks', { title: r.monthTitle, marks: r.calMarks });
    ok(r.hist.indexOf('aa-evening') < r.hist.indexOf('zz-morning') && r.hist.includes('bb-other'), 'History, newest first, puts the evening above the morning', r.hist);
    ok(!P.errors.length, 'no page errors (two sessions in a day)', P.errors);
    await P.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
