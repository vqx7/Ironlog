// This week on Today, and the week bar's pull-down (NEW-107; V, 2026-11-10: "Go with option one ... re-attempt fixing
// the top bar as well, so it drags properly"). A feature suite (CLAUDE.md, Tests): new checks of This week and the
// week bar go here. Run on the build before (`node tests/week.js baselines/r91.html`, 2.45) every section fails there.
//   1  Week steps through the weeks as Month steps through months: ‹ › and This week, within the weeks it can show.
//   2  Every day of the week shown is listed with what it holds, and a tap does what the calendar's day does.
//   3  A week before this one reads its own numbers: its sessions against what was planned then, its hard sets,
//      cardio and weight lifted; a week ahead shows the workouts planned; this week keeps everything it showed.
//   4  The pull-down: a finger drawn down from the week bar brings the month calendar down from the top, following
//      the finger; let go past the point and it stays, short of it and it goes back; drawn back up, it closes. A tap
//      on a day and a sideways move are the bar's own.
//   5-8  The independent review of 2.45 and 2.46 (REV9-1 to REV9-4), each failing on the first build of 2.46 (a2a…):
//      the calendar left moved up by a push brought back; a workout done earlier shown planned ahead; an empty past week
//      read against the routine now; a week in another year named without it.
// WEEK_ONLY=1,4 runs some sections.
const { open, touchDriver } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.WEEK_ONLY ? process.env.WEEK_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
// A Wednesday: this week has Monday and Tuesday behind it, today, and four days ahead.
const DAY = '2026-11-11';

// A log of eight weeks on a weekly routine (the demo, kept as the lifter's own), opened on Today with This week open on Week.
async function lifter(opts = {}) {
  const P = await open(FILE, { w: 390, h: 844, touch: true, clock: DAY + 'T10:00:00', ...opts });
  await P.page.evaluate(() => {
    const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'lb';
    L.makeDemo(); for (const x of L.state.sessions) delete x.demo; for (const x of L.state.bodyweights) delete x.demo;
    L.state.settings.hidden = (L.state.settings.hidden || []).filter(k => k !== 'today:week');
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.ui.folds['today:week'] = true; L.ui.wkView = 'week'; L.render();
  });
  await wait(150);
  return P;
}
// What This week shows: its title and subtitle, the heading inside it, its days, and its lines.
const shown = page => page.evaluate(() => {
  const sec = document.querySelector('[data-sk="today:week"]');
  if (!sec) return null;
  const q = s => sec.querySelector(s);
  return {
    title: (q('.sec-t') || q('summary') || { innerText: '' }).innerText,
    sub: (q('.sec-s') || { innerText: '' }).innerText,
    head: (q('.cal-h h4') || { innerText: '' }).innerText,
    prev: !!q('[data-act="wkStep"][data-v="-1"]') && !q('[data-act="wkStep"][data-v="-1"]').disabled,
    next: !!q('[data-act="wkStep"][data-v="1"]') && !q('[data-act="wkStep"][data-v="1"]').disabled,
    days: [...sec.querySelectorAll('.wkdays .wkday')].map(e => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), act: e.getAttribute('data-act'), date: e.getAttribute('data-date'), tag: e.tagName, h: e.getBoundingClientRect().height })),
    text: sec.innerText,
    band: !!q('.band'),
    wide: document.documentElement.scrollWidth > window.innerWidth
  };
});
const tap = (page, sel) => page.evaluate(sel => { const e = document.querySelector(sel); if (e) e.click(); return !!e; }, sel);

(async () => {
  if (run(1)) {
    const P = await lifter();
    const { page } = P;
    const a = await shown(page);
    ok(a && a.head.toLowerCase() === 'nov 9 to nov 15' && a.prev && a.next, '1. This week has ‹ and › and names the week by its dates', a && { head: a.head, prev: a.prev, next: a.next });
    await tap(page, '[data-act="wkStep"][data-v="-1"]'); await wait(100);
    const b = await shown(page);
    ok(b && b.head.toLowerCase() === 'nov 2 to nov 8' && b.title === 'Nov 2 to Nov 8', '1. ‹ steps to last week, named by its dates in the heading and the title', b && { head: b.head, title: b.title });
    ok(b && b.days.length === 7 && b.days[0].date === '2026-11-02' && b.days[6].date === '2026-11-08', '1. the week shown is that week, Monday to Sunday', b && b.days.map(d => d.date));
    // Back to the first week with a session, where ‹ stops.
    for (let k = 0; k < 12; k++) { await tap(page, '[data-act="wkStep"][data-v="-1"]'); await wait(40); }
    const c = await shown(page);
    const first = await page.evaluate(() => { const d = window.__ironlog.state.sessions.map(s => s.date).sort()[0]; return d; });
    ok(c && !c.prev && c.days.some(d => d.date <= first) && c.days.some(d => d.date >= first), '1. ‹ stops at the first week with a session', c && { prev: c.prev, first, days: c.days.map(d => d.date) });
    // This week from there, through Week again after Month (the switch starts on this week).
    await tap(page, '[data-act="wkView"][data-v="month"]'); await wait(80);
    await tap(page, '[data-act="wkView"][data-v="week"]'); await wait(80);
    const d = await shown(page);
    ok(d && d.head.toLowerCase() === 'nov 9 to nov 15' && d.title === 'This week', '1. Week, picked again after Month, opens on this week', d && { head: d.head, title: d.title });
    // A year ahead, where › stops.
    for (let k = 0; k < 54; k++) { await tap(page, '[data-act="wkStep"][data-v="1"]'); await wait(20); }
    const e = await shown(page);
    ok(e && !e.next && e.days.length > 0 && e.days[0].date === '2027-11-08', '1. › stops a year ahead', e && { next: e.next, from: e.days.length ? e.days[0].date : null });
    ok(!P.errors.length, '1. no page error', P.errors);
    await P.browser.close();
  }

  if (run(2)) {
    const P = await lifter();
    const { page } = P;
    const a = await shown(page);
    const log = await page.evaluate(() => window.__ironlog.state.sessions.filter(s => s.date >= '2026-11-09' && s.date <= '2026-11-15').map(s => [s.date, s.dayName]));
    const byDate = Object.fromEntries((a ? a.days : []).map(d => [d.date, d]));
    ok(a && a.days.length === 7 && a.days.map(d => d.text.slice(0, 3)).join() === 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', '2. seven rows, Monday to Sunday', a && a.days.map(d => d.text));
    ok(log.length > 0 && log.every(([dt, nm]) => byDate[dt] && byDate[dt].text.includes(nm) && byDate[dt].act === 'calDay'), '2. a day with a session shows its name and opens it as the calendar does', { log, days: a && a.days });
    ok(a && a.days.filter(d => d.date > DAY).every(d => d.tag === 'SPAN' ? !/planned/.test(d.text) : d.act === 'wkGo' && /, planned$/.test(d.text)) && a.days.filter(d => d.date > DAY).some(d => d.act === 'wkGo'), '2. a day ahead shows the workout planned on it, opening it on Today, or nothing', a && a.days.filter(d => d.date > DAY));
    ok(a && a.days.every(d => d.tag === 'SPAN' || d.h >= 44), '2. every row a tap is 44 px tall or more', a && a.days.map(d => d.h));
    ok(a && !a.wide, '2. no sideways scroll at 390 px', a && a.wide);
    // A day with a session: the tap opens it in History (one session) as the calendar's day does.
    const one = log.find(([dt]) => log.filter(x => x[0] === dt).length === 1);
    if (one) {
      await tap(page, `.wkdays [data-date="${one[0]}"]`); await wait(200);
      const where = await page.evaluate(() => ({ tab: window.__ironlog.ui.tab, modal: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind }));
      ok(where.tab === 'history', '2. a tap on a day with a session opens History', where);
    }
    ok(!P.errors.length, '2. no page error', P.errors);
    await P.browser.close();
  }

  if (run(3)) {
    const P = await lifter();
    const { page } = P;
    // Last week's own numbers, worked out here from the log.
    const want = await page.evaluate(() => {
      const L = window.__ironlog; const ws = '2026-11-02', we = '2026-11-08';
      const ss = L.state.sessions.filter(s => s.date >= ws && s.date <= we);
      // What was planned then, as the week's own sessions recorded it; the demo records none (REV9-3).
      const rec = ss.map(x => x.pw).find(x => x);
      return { n: ss.length, rec: rec || null, hard: Math.round((L.IDX().weekHard[ws] || 0) * 10) / 10 };
    });
    await tap(page, '[data-act="wkStep"][data-v="-1"]'); await wait(100);
    const a = await shown(page);
    ok(a && a.sub === (want.rec ? `${want.n} of ${want.rec} sessions` : `${want.n} sessions`), '3. a week before reads its sessions against what was planned then, or alone with no record of it', { sub: a && a.sub, want });
    ok(a && new RegExp(`\\b${String(want.hard).replace('.', '\\.')} hard sets? logged`).test(a.text) && /lifted/.test(a.text), '3. and its hard sets and weight lifted', { text: a && a.text, want });
    ok(a && !a.band, '3. no bar against this week\'s plan on another week', a && a.band);
    // Next week: what is planned.
    await tap(page, '[data-act="wkStep"][data-v="1"]'); await wait(40);
    await tap(page, '[data-act="wkStep"][data-v="1"]'); await wait(100);
    const b = await shown(page);
    const planned = b ? b.days.filter(d => d.act === 'wkGo').length : -1;
    ok(b && b.head.toLowerCase() === 'nov 16 to nov 22' && b.sub === (planned ? `${planned} planned` : 'Nothing planned') && !/hard sets? logged/.test(b.text), '3. a week ahead names the workouts planned in it', b && { head: b.head, sub: b.sub, planned });
    // This week keeps what it had: the bar, the sets line and the title.
    await tap(page, '[data-act="wkStep"][data-v="-1"]'); await wait(100);
    const c = await shown(page);
    ok(c && c.title === 'This week' && c.band && /hard sets logged of \d+ planned/.test(c.text) && /lifted/.test(c.text), '3. this week keeps its bar, its sets against the plan and its weight lifted', c && { title: c.title, band: c.band, text: c.text.slice(0, 300) });
    ok(!P.errors.length, '3. no page error', P.errors);
    await P.browser.close();
  }

  if (run(4)) {
    const P = await lifter();
    const { page } = P;
    const touch = await touchDriver(page);
    const box = await page.evaluate(() => { const r = document.getElementById('wkbar').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    const sheet = () => page.evaluate(() => {
      const m = window.__ironlog.ui.modal; const s = document.querySelector('#modal .sheet');
      if (!s) return { kind: m && m.kind, open: false };
      const r = s.getBoundingClientRect();
      const g = s.querySelector('.cal-g'), gr = g ? g.getBoundingClientRect() : null;
      return { kind: m && m.kind, open: !document.getElementById('modal').hidden, top: s.classList.contains('fromtop'), y: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), grid: gr ? Math.round(gr.height) : 0, gridIn: !!gr && gr.top >= r.top && gr.bottom <= r.bottom + 1, tf: s.style.transform };
    });
    const drag = async (pts, endAfter = true) => { await touch('touchStart', pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) { await touch('touchMove', x, y); await wait(16); } if (endAfter) await touch('touchEnd', 0, 0); await wait(300); };
    // A long pull: the calendar comes down from the top and stays.
    await touch('touchStart', box.x, box.y);
    for (let k = 1; k <= 8; k++) { await touch('touchMove', box.x, box.y + k * 15); await wait(16); }
    const mid = await sheet();
    ok(mid.kind === 'calendar' && mid.top && mid.bottom <= box.y + 8 * 15 + 2 && mid.bottom > box.y, '4. pulled down, the calendar comes from the top and its edge follows the finger', { mid, finger: box.y + 120 });
    await touch('touchEnd', 0, 0); await wait(350);
    const a = await sheet();
    ok(a.open && a.kind === 'calendar' && a.top && a.y <= 1 && !a.tf, '4. let go past the point, it stays open at the top', a);
    ok(a.h > 300 && a.grid > 200 && a.gridIn, '4. laid out as the calendar is: the whole month inside the sheet', a);
    const month = await page.evaluate(() => (document.getElementById('calH') || { innerText: '' }).innerText);
    ok(month === 'NOVEMBER 2026' || month === 'November 2026', '4. on this month', month);
    // Pushed back up a little, it goes back; pushed up far, it closes.
    const sb = await page.evaluate(() => { const r = document.querySelector('#modal .sheet').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 12 }; });
    await drag([[sb.x, sb.y], [sb.x, sb.y - 20], [sb.x, sb.y - 40]]);
    const b = await sheet();
    ok(b.open && b.y <= 1 && !b.tf, '4. a short push up and it goes back', b);
    await drag([[sb.x, sb.y], [sb.x, sb.y - 40], [sb.x, sb.y - 90], [sb.x, sb.y - 140]]);
    const c = await sheet();
    ok(!c.open || c.kind !== 'calendar', '4. pushed up past the point, it closes', c);
    // A short pull goes back.
    await drag([[box.x, box.y], [box.x, box.y + 20], [box.x, box.y + 40]]);
    const d = await sheet();
    ok(!d.open || d.kind !== 'calendar', '4. a short pull goes back, nothing left open', d);
    // A sideways move is the bar's own.
    await drag([[box.x - 60, box.y], [box.x - 20, box.y + 6], [box.x + 40, box.y + 10], [box.x + 90, box.y + 14]]);
    const e = await sheet();
    ok(!e.open || e.kind !== 'calendar', '4. a sideways move opens nothing', e);
    // A tap on a day still does what it did: today opens Today.
    const t = await page.evaluate(() => { const b = document.querySelector('#wkbar .w.today'); if (!b) return { x: 0, y: 0 }; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await page.evaluate(() => { window.__ironlog.ui.tab = 'history'; window.__ironlog.render(); });
    await page.touchscreen.tap(t.x, t.y); await wait(300);
    const f = await page.evaluate(() => ({ tab: window.__ironlog.ui.tab, modal: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind }));
    ok(f.tab === 'today' && f.modal !== 'calendar', '4. a tap on a day in the bar still opens it', f);
    // History's Calendar button still opens the calendar from the bottom, as every sheet.
    await page.evaluate(() => { window.__ironlog.ui.tab = 'history'; window.__ironlog.render(); });
    await tap(page, '[data-act="calOpen"]'); await wait(200);
    const g = await sheet();
    ok(g.open && g.kind === 'calendar' && !g.top, '4. History\'s Calendar still opens from the bottom', g);
    ok(!P.errors.length, '4. no page error', P.errors);
    await P.browser.close();
  }

  if (run(5)) {
    // REV9-1 (the independent review of 2.45 and 2.46): pushed up and brought back down before letting go, the calendar
    // stayed moved up, its header off the screen.
    const P = await lifter();
    const { page } = P;
    const touch = await touchDriver(page);
    const box = await page.evaluate(() => { const r = document.getElementById('wkbar').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await touch('touchStart', box.x, box.y); for (let k = 1; k <= 8; k++) { await touch('touchMove', box.x, box.y + k * 15); await wait(16); } await touch('touchEnd', 0, 0); await wait(350);
    const sb = await page.evaluate(() => { const r = document.querySelector('#modal .sheet').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.bottom - 12 }; });
    for (const back of [-2, 5]) {
      await touch('touchStart', sb.x, sb.y);
      for (const dy of [-20, -45, -65, back]) { await touch('touchMove', sb.x, sb.y + dy); await wait(16); }
      await touch('touchEnd', 0, 0); await wait(350);
      const a = await page.evaluate(() => { const s = document.querySelector('#modal .sheet'); const h = document.getElementById('calH'); return s ? { tf: s.style.transform, drag: s.classList.contains('drag'), y: Math.round(s.getBoundingClientRect().top), head: h ? Math.round(h.getBoundingClientRect().top) : null } : null; });
      ok(a && !a.tf && !a.drag && a.y >= 0 && a.head >= 0, `5. pushed up then brought back to ${back} px before letting go, the calendar goes back in place, its header on screen`, a);
    }
    ok(!P.errors.length, '5. no page error', P.errors);
    await P.browser.close();
  }

  if (run(6)) {
    // REV9-2: on a fixed-weekday routine, a day ahead whose workout was done earlier this week read "planned" under the bar
    // that said "done Wed", and its tap offered the workout again; the month calendar the same.
    const P = await lifter();
    const { page } = P;
    await page.evaluate(() => {
      const L = window.__ironlog; const R = L.activeRoutine();
      R.schedule = 'weekly';
      // Friday's workout (day 4) done today, Wednesday.
      const fri = R.days[4];
      L.state.sessions = L.state.sessions.filter(s => s.date !== '2026-11-11');
      L.state.sessions.push({ id: 'wedFri', date: '2026-11-11', dayIdx: 4, dayId: fri.id, dayName: fri.name, routineId: R.id, notes: '', deload: false, light: false, ex: [{ exId: fri.items[0].exId, rr: [8, 12], note: '', sets: [{ w: 50, r: 10, rir: 2, warm: false }] }] });
      L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); L.render();
    });
    await wait(200);
    const a = await page.evaluate(() => {
      const L = window.__ironlog; const name = L.activeRoutine().days[4].name;
      const row = document.querySelector('.wkdays [data-date="2026-11-13"]');
      const bar = document.querySelector('#wkbar [data-date="2026-11-13"]');
      L.ui.wkView = 'month'; L.render();
      const cell = document.querySelector('.cal-inline [data-date="2026-11-13"]');
      const out = { name, row: row && row.innerText.replace(/\s+/g, ' '), rowAct: row && row.getAttribute('data-act'), bar: bar && bar.getAttribute('aria-label'), cellPlan: !!cell && cell.classList.contains('plan') };
      L.ui.wkView = 'week'; L.render();
      return out;
    });
    ok(a && /done Wed/.test(a.bar || ''), '6. the bar says Friday\'s workout was done Wednesday', a);
    ok(a && a.row && a.row.includes(a.name + ', done Wed') && a.rowAct !== 'wkGo', '6. This week says so too, and its row offers no second start', a);
    ok(a && !a.cellPlan, '6. the month calendar does not show it planned on Friday', a);
    ok(!P.errors.length, '6. no page error', P.errors);
    await P.browser.close();
  }

  if (run(7)) {
    // REV9-3: a past week with no record of what was planned then was read against the routine as it is now
    // (CLAUDE.md: a past week is read against what was planned then). With no record it says its sessions alone.
    const P = await lifter();
    const { page } = P;
    const a = await page.evaluate(() => {
      const L = window.__ironlog; const R = L.activeRoutine();
      L.state.sessions = L.state.sessions.filter(s => !(s.date >= '2026-10-26' && s.date <= '2026-11-01'));
      // Sessions up to Oct 25 record no plan (as the demo's and older builds' do); those from Nov 2 record six a week.
      for (const s of L.state.sessions) { s.routineId = R.id; s.free = undefined; if (s.date >= '2026-11-02') s.pw = 6; else delete s.pw; }
      L.state = L.normalize(L.state); L.invalidate();
      // The routine now plans four days.
      const R2 = L.activeRoutine(); let k = 0; for (const d of R2.days) if (!d.rest && d.items.length && ++k > 4) { d.rest = true; d.items = []; }
      L.invalidate(); L.saveNow();
      const sub = ws => { L.ui.wkWs = ws; L.render(); return document.querySelector('[data-sk="today:week"] .sec-s').innerText; };
      return { kept: sub('2026-11-02'), empty: sub('2026-10-26'), none: sub('2026-10-19') };
    });
    ok(a && a.kept === '6 of 6 sessions', '7. a past week whose sessions recorded its plan reads against it', a);
    ok(a && a.empty === '0 sessions', '7. an empty past week, with nothing to say what was planned then, says its sessions alone', a);
    ok(a && /^\d+ sessions?$/.test(a.none) && !/ of /.test(a.none), '7. so does a week whose sessions recorded no plan, never against the routine now', a);
    ok(!P.errors.length, '7. no page error', P.errors);
    await P.browser.close();
  }

  if (run(8)) {
    // REV9-4: a week in another year was named without its year.
    const P = await lifter();
    const { page } = P;
    const a = await page.evaluate(() => {
      const L = window.__ironlog; const out = {};
      for (const ws of ['2027-01-04', '2026-12-28']) { L.ui.wkWs = ws; L.render(); out[ws] = document.querySelector('[data-sk="today:week"] .sec-t').innerText; }
      return out;
    });
    ok(a['2027-01-04'] === 'Jan 4, 2027 to Jan 10, 2027' && a['2026-12-28'] === 'Dec 28 to Jan 3, 2027', '8. a week in another year names its year', a);
    ok(!P.errors.length, '8. no page error', P.errors);
    await P.browser.close();
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
