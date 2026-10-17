// Nothing builds up as the screens redraw (r51, from the outside review V
// brought; ARCHITECTURE.md, The outside review). Every render rebuilds #view
// from strings, so whatever a screen sets up (a chart, a drag list, a timer,
// the 3D body's WebGL context) must be torn down or reused, or a long gym
// session on a phone slowly fills its memory. `killDynamic` destroys the
// charts and drag lists before each render, the rest timer and the tour stop
// their intervals, and the 3D body builds its renderer once and moves its
// canvas between Today and the exercise sheet. Until r51 nothing tested any
// of it. This suite counts what is alive, through hooks put in before the
// page loads, across the same rounds of every tab, a session, the muscles
// sheet and the 3D body, and holds the count to what is on screen.
// Not repeated on dist/: a page opened from a file cannot import the 3D
// body's module there (the reason map3d is not), and the code is the same.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };

// Counted from the page's first line: intervals set and cleared, WebGL
// contexts made, and drag lists made and destroyed (SortableJS is wrapped as
// it is assigned, since it loads after the page starts).
const HOOKS = `(() => {
  const live = window.__live = { iv: new Set(), webgl: 0, sortMade: 0, sortGone: 0 };
  const si = window.setInterval, ci = window.clearInterval;
  window.setInterval = function (...a) { const id = si.apply(this, a); live.iv.add(id); return id; };
  window.clearInterval = function (id) { live.iv.delete(id); return ci.call(this, id); };
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...r) {
    const c = gc.call(this, kind, ...r);
    if (c && /webgl/i.test(String(kind)) && !this.__gl) { this.__gl = true; live.webgl++; }
    return c;
  };
  let S;
  Object.defineProperty(window, 'Sortable', { configurable: true, get() { return S; }, set(v) {
    S = v;
    if (!v || typeof v.create !== 'function' || v.__counted) return;
    const make = v.create.bind(v);
    v.create = (...a) => { const s = make(...a); live.sortMade++; const d = s.destroy.bind(s); let done = false; s.destroy = () => { if (!done) { done = true; live.sortGone++; } return d(); }; return s; };
    v.__counted = true;
  } });
})();`;

(async () => {
  const { browser, page, errors } = await open('index.html', { w: 390, h: 844, clock: '2026-09-24T18:00:00', setup: ctx => ctx.addInitScript(HOOKS) });
  const ev = (f, a) => page.evaluate(f, a);
  const wait = ms => page.waitForTimeout(ms);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.folds['today:map'] = true; L.render(); });
  await wait(200);
  // The 3D body on Today, built once for the visit.
  await page.click('[data-act="mapView"][data-v="3d"]');
  await page.waitForFunction(() => ['ready', 'fail'].includes(window.__ironlog.map3d().state), null, { timeout: 20000 }).catch(() => {});
  const ready = await ev(() => window.__ironlog.map3d().state === 'ready');

  // What is alive now, against what is on screen.
  const count = () => ev(() => {
    const L = window.__live;
    const canvases = [...document.querySelectorAll('canvas')];
    const charted = canvases.filter(c => window.Chart && window.Chart.getChart(c)).length;
    const liveCharts = window.Chart ? Object.keys(window.Chart.instances).length : 0;
    const lists = [...document.querySelectorAll('*')].filter(el => window.Sortable && window.Sortable.get(el)).length;
    return { charted, liveCharts, sortLive: L.sortMade - L.sortGone, lists, iv: L.iv.size, webgl: L.webgl };
  });

  // One round: every tab with its charts and drag lists open, a session with
  // its exercises draggable, the muscles sheet with the 3D body in it, and
  // back, each drawn several times as a sync or a tap would redraw it.
  const round = async () => {
    for (const tab of ['today', 'program', 'dash', 'history', 'settings']) {
      await ev(t => { const L = window.__ironlog; L.ui.tab = t; ['volume', 'exercise', 'consistency', 'lifts', 'body'].forEach(k => { L.ui.folds['dash:' + k] = true; }); L.ui.volMode = 'trend'; L.ui.dashEx = 'bench'; L.render(); L.render(); }, tab);
      await wait(60);
    }
    await ev(() => { const L = window.__ironlog; if (!L.state.draft) { L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); L.ACT.startSession({ dataset: { day: '0' } }); } L.ui.tab = 'today'; L.render(); L.render(); });
    await wait(60);
    await ev(() => { const L = window.__ironlog; L.openModal({ kind: 'exMus', exId: L.state.draft.ex[0].exId }); });
    await wait(60);
    const three = await ev(() => { const b = document.querySelector('#modal [data-act="mapView"][data-v="3d"]'); if (b) b.click(); return !!b; });
    if (three) await wait(150);
    await ev(() => { const L = window.__ironlog; L.render(); L.ACT.mClose(); L.ui.tab = 'today'; L.render(); });
    await wait(60);
  };

  await round();
  const first = await count();
  for (let i = 0; i < 7; i++) await round();
  // End on Stats, where the most charts are drawn, then count again.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); });
  await wait(120);
  const last = await count();

  ok(last.charted > 0, `Stats draws charts to count (${last.charted})`, last);
  ok(last.liveCharts === last.charted, `the live charts are the ones on screen after eight rounds (${last.liveCharts} live, ${last.charted} on screen)`, last);
  ok(first.sortLive >= 0 && last.sortLive === last.lists, `the live drag lists are the ones on screen (${last.sortLive} live, ${last.lists} on screen)`, { first, last });
  ok(await ev(() => window.__live.sortMade) > 8, 'drag lists were made and torn down through the rounds', await ev(() => window.__live));
  ok(last.iv <= first.iv, `intervals do not accumulate (${first.iv} after the first round, ${last.iv} after the eighth)`, { first, last });
  if (ready) ok(last.webgl === 1, 'the 3D body makes one WebGL context for the whole visit, on Today and in the sheet', last);
  else ok(last.webgl === 0, 'the 3D body could not start here, and no WebGL context was left behind', last);
  // The rest timer's interval stops when the timer does.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); L.ACT.tAdd(); });
  const timing = await ev(() => window.__live.iv.size);
  await ev(() => { document.querySelector('[data-act="tStop"]') ? document.querySelector('[data-act="tStop"]').click() : window.__ironlog.ACT.tStop(); });
  await wait(50);
  const stopped = await ev(() => window.__live.iv.size);
  ok(timing === last.iv + 1 && stopped === last.iv, `the rest timer adds one interval and takes it away when stopped (${last.iv}, ${timing}, ${stopped})`, { timing, stopped });

  ok(errors.length === 0, 'no errors', errors);
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL', e.stack); process.exit(1); });
