// r28 (V, 2026-10-02): the layout a new person starts with and how they find
// the rest. Every section starts folded (Sessions on History excepted); a new
// install hides At a glance, Coach and Body on Today and Schedule and Weekly
// volume on Plan, leads Today with Workout preview, Muscle map, This week and
// Stats with Lifts, and has auto-mark on; an older save keeps what it had.
// The bottom of each tab offers what it can also show; the menu and Settings
// > Help reach the Guide and reports; no ? sits in a section header; Lifts
// lists PRs before Stalls and says how a blank RIR is read; Volume opens on
// the balance chart, from the plan until anything is logged; This week reads
// This month in Month view; the Exercise library has its own button; demo
// data looked at before setting up leaves no settings behind; sections still
// drag after being hidden and shown; the status bar strip; 320 px.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const TABS = ['today', 'program', 'dash', 'history', 'settings'];

(async () => {
  // ---- A new install: the defaults, by the screens a new person sees.
  {
    const P = await open('index.html', { touch: true, dark: true, clock: '2026-10-02T12:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const fresh = await ev(() => { const s = window.__ironlog.state.settings; return { hidden: s.hidden, order: s.secOrder, auto: s.autoDone, ob: window.__ironlog.obActive() }; });
    ok(fresh.ob && fresh.auto === true && JSON.stringify(fresh.hidden) === JSON.stringify(['today:tiles', 'today:coach', 'today:body', 'program:schedule', 'program:pvol']), 'a new install: auto-mark on; At a glance, Coach, Body, Schedule and Weekly volume hidden', fresh);
    // Pick a ready-made routine the way the first-run page does.
    await ev(() => { const L = window.__ironlog; const t = L.TEMPLATES.find(x => /upper/i.test(x.name)); const r = L.routineFromTemplate(t.key); L.state.routines = [r]; L.state.activeRoutineId = r.id; L.state.settings.onboarded = true; localStorage.setItem('ironlog.v1.installLater', '1'); L.render(); });
    const tabState = t => ev(t => { const L = window.__ironlog; L.ui.tab = t; window.scrollTo(0, 0); L.render(); const kids = [...document.querySelectorAll('#view > [data-mkey]')]; return { keys: kids.map(e => e.dataset.mkey), open: kids.filter(e => e.open).map(e => e.dataset.mkey), hb: document.querySelectorAll('#view summary .hb').length, line: !!document.getElementById('moreLine') }; }, t);
    const st = {}; for (const t of TABS) st[t] = await tabState(t);
    ok(st.today.keys.join() === 'session,map,week', 'Today shows Workout preview, Muscle map, This week, in that order', st.today);
    ok(st.program.keys.join() === 'routine,library,days', 'Plan shows Routine, Add exercises, Days', st.program);
    ok(st.dash.keys.join() === 'exercise,volume,weak,consistency,body', 'Stats leads with Lifts, then Volume, Muscles, Consistency, Body', st.dash);
    ok(['today', 'program', 'dash', 'settings'].every(t => st[t].open.length === 0), 'Today, Plan, Stats and Settings open with every section folded', TABS.map(t => [t, st[t].open]));
    ok(st.settings.keys.includes('help') && st.settings.keys.indexOf('help') > st.settings.keys.indexOf('data') && st.settings.keys.indexOf('help') < st.settings.keys.indexOf('reset'), 'Settings has Help near the bottom, after Your data', st.settings.keys);
    ok(TABS.every(t => st[t].hb === 0), 'no ? in any section header on any tab', TABS.map(t => st[t].hb));
    ok(st.today.line && st.program.line && !st.dash.line && !st.history.line && !st.settings.line, 'Today and Plan end with what they can also show; tabs with nothing hidden end without it', TABS.map(t => [t, st[t].line]));
    // Today's Start card fits its date line on one line at 390 px.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    const eb = await ev(() => { const e = document.querySelector('.hero .eyebrow'); const lh = parseFloat(getComputedStyle(e).lineHeight) || 16; return { t: e.innerText, lines: Math.round(e.getBoundingClientRect().height / lh) }; });
    ok(eb.lines === 1 && /^FRI, OCT 2/i.test(eb.t), 'the Start card date line is short and on one line at 390 px', eb);

    // The bottom line on Today: the hidden sections, one tap each.
    const line = await ev(() => [...document.querySelectorAll('#moreLine [data-act="secShow"]')].map(b => b.dataset.k + '=' + b.textContent.trim()));
    ok(line.join('|') === 'today:tiles=+ At a glance|today:coach=+ Coach|today:body=+ Body', 'Today offers + At a glance, + Coach, + Body (Injuries only once one is flagged)', line);
    await page.locator('#moreLine [data-k="today:coach"]').click(); await wait(150);
    const coach = await ev(() => { const d = document.querySelector('#view > [data-mkey="coach"]'); return { shown: !!d, open: d && d.open, hidden: window.__ironlog.state.settings.hidden.includes('today:coach'), toast: document.getElementById('toast').innerText, line: [...document.querySelectorAll('#moreLine [data-act="secShow"]')].map(b => b.dataset.k) }; });
    ok(coach.shown && coach.open && !coach.hidden && /Coach added/.test(coach.toast) && !coach.line.includes('today:coach'), 'tapping + Coach shows it, open, says so, and drops it from the line', coach);
    await ev(() => { const L = window.__ironlog; L.state.injuries = [{ id: 'i1', m: 'chest', note: '', date: '2026-10-01' }]; L.state.settings.hidden.push('today:injuries'); L.render(); });
    ok(await ev(() => [...document.querySelectorAll('#moreLine [data-act="secShow"]')].some(b => b.dataset.k === 'today:injuries')), 'with an injury flagged and Injuries hidden, the line offers it');
    await ev(() => { const L = window.__ironlog; L.state.injuries = []; L.state.settings.hidden = L.state.settings.hidden.filter(k => k !== 'today:injuries'); L.render(); });
    // The link goes to Settings > Layout, open.
    await page.locator('#moreLine [data-act="goLayout"]').click(); await wait(150);
    ok(await ev(() => window.__ironlog.ui.tab === 'settings' && document.querySelector('#view > [data-mkey="layout"]').open), 'Show, hide or reorder sections opens Settings with Layout open');
    // Layout: Default layout is pressed only on the default; it puts it back with Undo.
    const lay = await ev(() => { const b = document.querySelector('[data-act="layoutDefault"]'); return { pressed: b.getAttribute('aria-pressed'), simple: !!document.querySelector('[data-act="layoutSimple"]') }; });
    ok(lay.pressed === 'false' && !lay.simple, 'Default layout is not pressed once Coach was added, and Simple view is gone', lay);
    await ev(() => { const L = window.__ironlog; L.state.settings.secOrder.today = ['week', 'map', 'session']; L.render(); });
    await page.locator('[data-act="layoutDefault"]').click(); await wait(120);
    const back = await ev(() => { const s = window.__ironlog.state.settings; return { hidden: s.hidden.join(), order: s.secOrder.today.join(), pressed: document.querySelector('[data-act="layoutDefault"]').getAttribute('aria-pressed'), undo: !!document.querySelector('#toast [data-act="undo"]') }; });
    ok(back.hidden === 'today:tiles,today:coach,today:body,program:schedule,program:pvol' && back.order.startsWith('session,map,week') && back.pressed === 'true' && back.undo, 'Default layout restores the hidden list and the order, with Undo', back);
    await ev(() => { const L = window.__ironlog; L.state.settings.secOrder.today = ['week', 'session', 'map']; L.ACT.layoutReset(); });
    ok(await ev(() => window.__ironlog.state.settings.secOrder.today.join().startsWith('session,map,week')), 'Reset section order goes back to the default order, not the code order');

    // The menu: a tinted button, and Show, hide or reorder sections in it.
    const btn = await ev(() => { const el = document.getElementById('saveState'); const cs = getComputedStyle(el); return { bg: cs.backgroundColor, ring: cs.boxShadow, color: cs.color, surface: getComputedStyle(document.documentElement).getPropertyValue('--surface-2') }; });
    ok(btn.ring && btn.ring !== 'none' && !/rgba\(0, 0, 0, 0\)/.test(btn.bg) && btn.bg.replace(/\s/g, '') !== btn.surface.trim(), 'the menu button is tinted with the accent and ringed', btn);
    await page.click('#saveState'); await wait(80);
    const rows = await ev(() => [...document.querySelectorAll('#modal .mnu')].map(b => b.textContent.replace('›', '').trim()));
    ok(JSON.stringify(rows) === JSON.stringify(['Report a problem', 'Guide', 'Show, hide or reorder sections', 'Your data and backups']), 'the menu has Show, hide or reorder sections', rows);
    await page.click('#modal [data-act="mClose"]'); await wait(60);
    // Settings > Help.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); });
    await page.locator('#view > [data-mkey="help"] > summary').click(); await wait(60);
    const help = await ev(() => [...document.querySelectorAll('#view > [data-mkey="help"] .sec-b button')].map(b => b.dataset.act + ':' + (b.dataset.cat || '') + ':' + b.textContent.trim()));
    ok(help.join('|') === 'guideOpen::Guide|fbOpen:bug:Report a problem|fbOpen:question:Ask a question|fbOpen:idea:Suggest something', 'Settings, Help: Guide, Report a problem, Ask a question, Suggest something', help);
    await page.locator('#view > [data-mkey="help"] [data-act="guideOpen"]').click(); await wait(80);
    ok(await ev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'guide'), 'and the Guide opens from there');
    const gsec = await ev(() => { const d = document.querySelector('#modal .gsec[data-g="sections"] .gbody'); return d && d.textContent; });
    ok(/every section starts folded/.test(gsec) && /its bottom lists them/.test(gsec) && !/Simple view/.test(gsec), 'the Guide says sections start folded and where to add more', gsec);
    await page.click('#modal [data-act="mClose"]'); await wait(60);

    // Stats: How this works is inside the section; a tap on the title row only folds.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; window.scrollTo(0, 0); L.render(); });
    const sum = await ev(() => { const s = document.querySelector('#view > [data-mkey="exercise"] > summary'); return [...s.children].map(c => c.className); });
    ok(sum.join() === 'sgrip,sec-t,sec-s,chev', 'a Stats header holds only the handle, title, number and arrow', sum);
    await page.locator('#view > [data-mkey="exercise"] > summary .chev').click(); await wait(60);
    const lifts = await ev(() => { const d = document.querySelector('#view > [data-mkey="exercise"]'); return { open: d.open, helpShown: !d.querySelector('.ht').hidden, link: !!d.querySelector('.sec-b > .sec-help .hlink'), subs: [...d.querySelectorAll('.subsec > summary .subsec-t')].map(e => e.textContent), grips: d.querySelectorAll('.subsec .sgrip').length }; });
    ok(lifts.open && !lifts.helpShown && lifts.link, 'tapping the arrow opens Lifts, not its explanation; How this works is the first line inside', lifts);
    ok(lifts.subs.join() === 'Recent PRs,All-time bests,Stalls' && lifts.grips === 0, 'inside Lifts: Recent PRs, All-time bests, then Stalls', lifts.subs);
    const subStyle = await ev(() => { const e = document.querySelector('#view > [data-mkey="exercise"] .subsec'); const cs = getComputedStyle(e); return { bg: cs.backgroundColor, r: parseFloat(cs.borderTopLeftRadius) }; });
    ok(!/rgba\(0, 0, 0, 0\)/.test(subStyle.bg) && subStyle.r >= 8, 'folds inside a section sit on their own surface, so they read as part of it', subStyle);
    await page.locator('#view > [data-mkey="exercise"] .hlink').click(); await wait(60);
    const ht = await ev(() => { const d = document.querySelector('#view > [data-mkey="exercise"]'); const h = d.querySelector('.ht'); return { open: d.open, shown: !h.hidden, text: h.innerText }; });
    ok(ht.open && ht.shown && /usual RIR/.test(ht.text) && !/a blank RIR counts as 0, so it errs low\)/.test(ht.text), 'How this works shows the explanation, and it says a blank RIR reads as your usual RIR', ht.text.slice(0, 160));
    // Volume opens on the balance chart, from the plan while nothing is logged.
    await page.locator('#view > [data-mkey="volume"] > summary').click(); await wait(300);
    const vol = await ev(() => { const d = document.querySelector('#view > [data-mkey="volume"]'); const chips = [...d.querySelectorAll('[data-act="volMode"]')]; const ch = window.Chart && window.Chart.getChart(document.getElementById('chRadar')); return { first: chips[0].dataset.v, on: chips.find(c => c.classList.contains('on')).dataset.v, canvas: !!d.querySelector('#chRadar'), plan: /routine's plan \(nothing logged yet\)/.test(d.innerText), head: (d.querySelector('.headline') || {}).innerText, label: ch && ch.data.datasets[0].label, nonzero: ch && ch.data.datasets[0].data.some(v => v > 0) }; });
    ok(vol.first === 'region' && vol.on === 'region' && vol.canvas && vol.plan && /^Most planned/.test(vol.head) && vol.label === 'Planned volume' && vol.nonzero, 'Volume opens on By region: the radar of the routine\'s plan, labelled as the plan, before anything is logged', vol);
    // After a logged session the same view reads what was done.
    await ev(() => { const L = window.__ironlog; L.makeDemo(); L.invalidate(); L.ui.folds['dash:volume'] = true; L.render(); }); await wait(300);
    const vol2 = await ev(() => { const d = document.querySelector('#view > [data-mkey="volume"]'); const ch = window.Chart && window.Chart.getChart(document.getElementById('chRadar')); return { plan: /routine's plan/.test(d.innerText), head: (d.querySelector('.headline') || {}).innerText, label: ch && ch.data.datasets[0].label }; });
    ok(!vol2.plan && /^Most trained/.test(vol2.head) && vol2.label === 'Your volume', 'with sessions logged it reads them instead', vol2);

    // This week becomes This month in Month view, and back.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); L.ACT.wkView({ dataset: { v: 'month' } }); });
    const m = await ev(() => { const d = document.querySelector('#view > [data-mkey="week"]'); return { t: d.querySelector('.sec-t').textContent, s: d.querySelector('.sec-s').textContent }; });
    const n = await ev(() => window.__ironlog.state.sessions.filter(x => x.date.slice(0, 7) === '2026-10').length);
    ok(m.t === 'This month' && m.s === `${n} session${n === 1 ? '' : 's'}`, 'in Month view the title reads This month with the month\'s sessions', m);
    await ev(() => { const L = window.__ironlog; L.ui.calYm = '2026-09'; L.render(); });
    ok(/September 2026/.test(await ev(() => document.querySelector('#view > [data-mkey="week"] .sec-t').textContent)), 'an earlier month is named');
    await ev(() => { const L = window.__ironlog; L.ACT.wkView({ dataset: { v: 'week' } }); });
    ok(await ev(() => document.querySelector('#view > [data-mkey="week"] .sec-t').textContent === 'This week'), 'and Week puts This week back');

    // Plan: the Exercise library button, and back to Plan.
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); });
    const lb = await ev(() => { const b = document.querySelector('#view .libbtn'); const r = b.getBoundingClientRect(); const hb = document.querySelector('#view .ph .hb').getBoundingClientRect(); return { w: r.width, h: r.height, vw: document.documentElement.clientWidth, text: b.innerText, gap: r.top - hb.bottom }; });
    ok(lb.w >= lb.vw - 40 && lb.h >= 56 && /Exercise library/.test(lb.text) && /\d+ exercises/.test(lb.text), 'Plan: the Exercise library is a full-width button with its count', lb);
    await page.locator('#view .libbtn').click(); await wait(80);
    ok(await ev(() => window.__ironlog.ui.planView === 'library' && /← Plan/.test(document.querySelector('[data-act="planBack"]').textContent)), 'it opens the library, whose back button says Plan');
    await ev(() => { const L = window.__ironlog; L.ui.planView = 'routine'; L.render(); });

    // The status bar strip: fixed at the top, as tall as the safe area, above the header.
    const strip = await ev(() => { const cs = getComputedStyle(document.body, '::before'); const top = getComputedStyle(document.querySelector('.top')); return { pos: cs.position, top: cs.top, z: +cs.zIndex, headZ: +top.zIndex, bg: cs.backgroundColor }; });
    ok(strip.pos === 'fixed' && strip.top === '0px' && strip.z > strip.headZ && !/rgba\(0, 0, 0, 0\)/.test(strip.bg), 'a solid strip covers the status bar area above the header', strip);

    // 320 px: no sideways scroll on any tab with the new line and button.
    await page.setViewportSize({ width: 320, height: 640 });
    const over = [];
    for (const t of TABS) { const w = await ev(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); return document.documentElement.scrollWidth - document.documentElement.clientWidth; }, t); if (w > 0) over.push(t + ':' + w); }
    ok(!over.length, 'no sideways scroll at 320 px on any tab', over);
    ok(!P.errors.length, 'no page errors (new install)', P.errors);
    await P.browser.close();
  }

  // ---- An older save keeps exactly what it had: nothing hidden, its order, auto-mark off.
  {
    const old = { version: 5, settings: { unit: 'lb', theme: 'dark', onboarded: true }, sessions: [], routines: [], exercises: [] };
    const P = await open('index.html', { state: old, clock: '2026-10-02T12:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    const s = await ev(() => { const L = window.__ironlog; const st = L.state.settings; L.ui.tab = 'today'; L.render(); return { hidden: st.hidden, order: st.secOrder, auto: st.autoDone, keys: [...document.querySelectorAll('#view > [data-mkey]')].map(e => e.dataset.mkey) }; });
    ok(s.hidden.length === 0 && Object.keys(s.order).length === 0 && s.auto === false, 'a save from before r28 keeps nothing hidden, no saved order and auto-mark off', s);
    ok(s.keys[0] === 'week' && s.keys.includes('tiles') && s.keys.includes('coach'), 'and its Today looks as it did', s.keys);
    // A save with its own choices keeps them.
    await ev(() => { const L = window.__ironlog; L.state.settings.hidden = ['today:map']; L.state.settings.autoDone = true; L.state.settings.secOrder = { today: ['coach', 'week'] }; L.saveNow(); });
    // What is stored, loaded again the way a reload loads it.
    const s2 = await ev(() => { const L = window.__ironlog; const st = L.normalize(JSON.parse(localStorage.getItem('ironlog.v1'))).settings; return { hidden: st.hidden.join(), auto: st.autoDone, order: (st.secOrder.today || []).join() }; });
    ok(s2.hidden === 'today:map' && s2.auto === true && s2.order === 'coach,week', 'and choices already made load again unchanged', s2);
    ok(!P.errors.length, 'no page errors (older save)', P.errors);
    await P.browser.close();
  }

  // ---- Demo data before setting up leaves no settings behind; with a real log it does not touch them.
  {
    const P = await open('index.html', { clock: '2026-10-02T12:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    ok(await ev(() => window.__ironlog.obActive()), 'first run');
    await page.locator('[data-act="demoLoad"]').first().click(); await wait(60);
    await page.locator('#modal [data-act="mOk"]').click(); await wait(200);
    const d1 = await ev(() => ({ demo: window.__ironlog.state.sessions.length, tab: window.__ironlog.ui.tab }));
    ok(d1.demo > 0 && d1.tab === 'dash', 'Look around with sample data loads the demo', d1);
    // Look around: show everything, reorder, turn auto-mark off, RIR off.
    await ev(() => { const L = window.__ironlog; L.ACT.layoutAll(); L.state.settings.secOrder.today = ['body', 'coach']; L.state.settings.autoDone = false; L.state.settings.rirMode = 'off'; L.saveNow(); });
    // Closing and reopening the app while looking around still remembers what to put back.
    await page.reload(); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await page.locator('[data-act="demoStart"]').click(); await wait(200);
    const d2 = await ev(() => { const L = window.__ironlog; const s = L.state.settings; return { demo: L.state.sessions.length, hidden: s.hidden.join(), order: (s.secOrder.today || []).join(), auto: s.autoDone, rir: s.rirMode, ob: L.obActive(), kept: localStorage.getItem('ironlog.v1.demoSettings') }; });
    ok(d2.demo === 0 && d2.ob && d2.hidden === 'today:tiles,today:coach,today:body,program:schedule,program:pvol' && d2.order.startsWith('session,map,week') && d2.auto === true && d2.rir === 'on' && d2.kept === null, 'Clear demo and set up puts every setting back to the new-install defaults', d2);
    // Someone with their own log who loads the demo from Settings keeps their changes when clearing it.
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.sessions.push({ id: 'real1', date: '2026-10-01', dayName: 'Mine', ex: [] }); L.state = L.normalize(L.state); L.saveNow(); L.ui.tab = 'settings'; L.render(); });
    await ev(() => { const L = window.__ironlog; L.makeDemo(); L.ACT.layoutAll(); L.state.settings.autoDone = false; L.ACT.demoClear(); });
    const d3 = await ev(() => { const s = window.__ironlog.state.settings; return { hidden: s.hidden.length, auto: s.autoDone }; });
    ok(d3.hidden === 0 && d3.auto === false, 'with a log of your own, clearing demo data keeps every change you made', d3);
    ok(!P.errors.length, 'no page errors (demo)', P.errors);
    await P.browser.close();
  }

  // ---- Sections still drag after being hidden and shown (V's report), by finger, on Today, Stats and Settings.
  {
    const P = await open('index.html', { touch: true, clock: '2026-10-02T12:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; const t = L.TEMPLATES.find(x => /upper/i.test(x.name)); const r = L.routineFromTemplate(t.key); L.state.routines = [r]; L.state.activeRoutineId = r.id; L.state.settings.onboarded = true; localStorage.setItem('ironlog.v1.installLater', '1'); L.render(); });
    const cdp = await page.context().newCDPSession(page);
    const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    const order = () => ev(() => [...document.querySelectorAll('#view > [data-mkey]')].map(e => e.dataset.mkey));
    const tab = t => ev(t => { const L = window.__ironlog; L.ui.tab = t; window.scrollTo(0, 0); L.render(); }, t);
    // Settings with Layout open, whatever this visit last did with it.
    const openLayout = async () => { await tab('settings'); if (!(await ev(() => document.querySelector('#view > [data-mkey="layout"]').open))) await page.locator('#view > [data-mkey="layout"] > summary .sec-t').click(); await wait(80); };
    async function drag(from, to) {
      await page.locator(`#view > [data-mkey="${from}"] .sgrip`).first().scrollIntoViewIfNeeded();
      const gb = await page.locator(`#view > [data-mkey="${from}"] .sgrip`).first().boundingBox();
      const tb = await page.locator(`#view > [data-mkey="${to}"]`).first().boundingBox();
      const x0 = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2, y1 = tb.y < gb.y ? tb.y + 5 : tb.y + tb.height - 5;
      await tp('touchStart', x0, y0); await wait(50);
      for (let k = 1; k <= 20; k++) { await tp('touchMove', x0, y0 + (y1 - y0) * k / 20); await wait(25); }
      await wait(200); await tp('touchEnd', x0, y1); await wait(300);
    }
    await openLayout();
    for (const k of ['today:coach', 'today:tiles', 'today:body', 'today:map']) { await page.locator(`[data-act="hideToggle"][data-k="${k}"]`).click(); await wait(60); }
    await tab('today');
    await drag('coach', 'session'); const a = await order();
    ok(a[0] === 'coach', 'Today: a section shown in Settings, Layout drags to the top', a);
    await page.locator('#moreLine [data-k="today:map"]').click(); await wait(150);
    await drag('map', (await order())[0]); const b = await order();
    ok(b[0] === 'map', 'a section added back from the bottom line drags too', b);
    await openLayout();
    await page.locator('[data-act="hideToggle"][data-k="today:week"]').click(); await wait(60); await page.locator('[data-act="hideToggle"][data-k="today:week"]').click(); await wait(60);
    await tab('today'); const c0 = await order(); await drag('body', c0[0]); const c = await order();
    ok(c[0] === 'body' && c.indexOf('week') === c0.indexOf('week') + 1, 'after hiding and showing another section, dragging still works and the shown one kept its place', { c0, c });
    await page.reload(); await page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.sortable);
    await tab('today'); ok((await order()).join() === c.join(), 'the order survives a reload', await order());
    await openLayout();
    await page.locator('[data-act="hideToggle"][data-k="dash:volume"]').click(); await wait(60); await page.locator('[data-act="hideToggle"][data-k="dash:volume"]').click(); await wait(60);
    await tab('dash'); const s0 = await order(); await drag('volume', s0[0]);
    ok((await order())[0] === 'volume', 'Stats: Volume hidden and shown, then dragged to the top', await order());
    await openLayout();
    await page.locator('[data-act="hideToggle"][data-k="settings:timer"]').click(); await wait(60); await page.locator('[data-act="hideToggle"][data-k="settings:timer"]').click(); await wait(60);
    // Fold everything (this visit's choice, so a re-render keeps it) and start from the top, so both ends of the drag are on screen.
    await ev(() => { const L = window.__ironlog; document.querySelectorAll('#view > details').forEach(x => { L.ui.folds[x.dataset.sk] = false; }); L.render(); window.scrollTo(0, 0); }); await wait(100);
    const g0 = await order(); await drag('timer', g0[0]);
    ok((await order())[0] === 'timer', 'Settings: Rest timer hidden and shown, then dragged to the top', await order());
    ok(!P.errors.length, 'no page errors (drag)', P.errors);
    await P.browser.close();
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e.stack || e); process.exit(1); });
