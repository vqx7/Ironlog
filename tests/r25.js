// r25: grey suggested loads (item 71), and the rest of r25 as it lands.
// Loads stay empty and show in grey until typed; ticking a set, auto-mark,
// quick entry and Finish take the grey load; a typed load moves the grey load
// of the rows under it and is never overwritten; "Fill in suggested loads"
// brings back filled rows. Warm-ups, drops, plates and swaps read the grey
// load. A session left open by r24 (filled rows) carries on.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
(async () => {
  const { browser, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  const fresh = async () => { await ev(() => { const L = window.__ironlog; L.state.draft = null; L.state.settings.onboarded = true; if (!L.state.sessions.length) L.makeDemo(); L.state.settings.autoDone = false; L.ui.tab = 'today'; L.ui.todayDay = 0; L.ui.modal = null; document.getElementById('modal').hidden = true; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); window.scrollTo(0, 0); }); };
  const start = async () => { await fresh(); await page.click('.hero [data-act="startSession"]:not([data-light])'); await page.waitForTimeout(120); };
  const W = (b, s) => `.sg input[data-f="w"][data-b="${b}"][data-s="${s}"]`, R = (b, s) => `.sg input[data-f="r"][data-b="${b}"][data-s="${s}"]`;
  const field = (sel) => ev(s => { const e = document.querySelector(s); return e ? { v: e.value, ph: e.placeholder } : null; }, sel);
  const type = async (sel, v) => { await page.fill(sel, v); await page.dispatchEvent(sel, 'input'); await page.dispatchEvent(sel, 'change'); await page.waitForTimeout(60); };
  const tick = async (b, s) => { await page.click(`[data-act="sDone"][data-b="${b}"][data-s="${s}"]`); await page.waitForTimeout(80); };
  const set = (b, s) => ev(([b, s]) => { const x = window.__ironlog.state.draft.ex[b].sets[s]; return { w: x.w, r: x.r, done: x.done }; }, [b, s]);
  const fmt = v => ev(v => window.__ironlog.fmtW(v), v);

  // ---- 1. Grey by default.
  await start();
  const b0 = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { sw: b.sw, ws: b.sets.map(x => x.w), n: b.sets.length }; });
  ok(b0.sw > 0 && b0.ws.every(w => w === null), 'a new session stores no loads in the rows; the suggestion is kept apart', b0);
  const f00 = await field(W(0, 0));
  ok(f00.v === '' && f00.ph === await fmt(b0.sw), 'the load field is empty and shows the suggestion in grey', f00);
  ok(await ev(() => { const e = document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="0"]'); const c = getComputedStyle(e, '::placeholder').color; const v = getComputedStyle(e).color; return c !== v; }), 'the grey load looks different from a typed one');
  await tick(0, 0);
  const s00 = await set(0, 0);
  ok(s00.done && s00.w === b0.sw && (await field(W(0, 0))).v === await fmt(b0.sw), 'ticking the set takes the grey load, and the field now shows it', s00);

  // ---- 2. A typed load moves the grey load below it, and is never overwritten.
  await type(W(0, 1), '105');
  const lb = await ev(() => window.__ironlog.state.settings.unit === 'lb');
  const typed = await ev(() => window.__ironlog.state.draft.ex[0].sets[1].w);
  ok((await field(W(0, 2))).ph === '105' && (await field(W(0, 2))).v === '' && (b0.n < 4 || (await field(W(0, 3))).ph === '105'), 'a load typed on set 2 shows in grey on the empty rows under it', [await field(W(0, 2)), lb]);
  await tick(0, 2);
  ok((await set(0, 2)).w === typed, 'ticking set 3 takes the load typed above it');
  await type(W(0, 1), '');
  ok((await set(0, 2)).w === typed && (await set(0, 2)).done, 'clearing set 2 afterwards leaves the ticked set 3 as it was');
  ok((await field(W(0, 1))).ph === await fmt(b0.sw), 'a cleared row shows the grey load again (the set above it)', await field(W(0, 1)));

  // ---- 3. Auto-mark takes the grey reps and the grey load.
  await ev(() => { window.__ironlog.state.settings.autoDone = true; });
  await page.focus(R(1, 0)); await page.focus(W(2, 0)); await page.waitForTimeout(120);
  const a10 = await ev(() => { const b = window.__ironlog.state.draft.ex[1]; return { w: b.sets[0].w, r: b.sets[0].r, done: b.sets[0].done, sw: b.sw }; });
  ok(a10.done && a10.r > 0 && a10.w === a10.sw, 'auto-mark on leaving an empty reps field takes the grey reps and the grey load', a10);
  await ev(() => { window.__ironlog.state.settings.autoDone = false; });

  // ---- 4. Finish: sets with reps but no tick take their grey load when saved.
  const fin = await ev(async () => { const L = window.__ironlog; const d = L.state.draft; const b = d.ex[3]; b.sets[0].r = 10; L.saveNow();
    const n0 = L.state.sessions.length; L.ACT.finish(); await new Promise(r => setTimeout(r, 150));
    for (let k = 0; k < 4; k++) { const m = document.querySelector('#modal:not([hidden])'); if (!m) break; const btn = m.querySelector('[data-act="mOk"]'); if (!btn) break; btn.click(); await new Promise(r => setTimeout(r, 200)); }
    const s = L.state.sessions[L.state.sessions.length - 1]; const x = s && s.ex.find(e => e.exId === b.exId); return { saved: L.state.sessions.length > n0, w: x ? x.sets[0].w : 'missing', sw: b.sw, weighted: !L.EX(b.exId).bw }; });
  ok(fin.saved && (!fin.weighted || fin.w === fin.sw), 'Finish, ticking the sets with reps, saves them at their grey load, never 0', fin);

  // ---- 5. Warm-up and drop rows, and plates, read the grey load.
  await start();
  const wu = await ev(() => { const L = window.__ironlog; L.ACT.wAdd({ dataset: { b: '0' } }); const b = L.state.draft.ex[0]; return { w: b.sets[0].w, warm: b.sets[0].warm, sw: b.sw }; });
  ok(wu.warm && wu.w > 0 && wu.w < wu.sw, 'a warm-up added before any load is typed is seeded from the grey load', wu);
  const dr = await ev(() => { const L = window.__ironlog; L.ACT.dropAdd({ dataset: { b: '0' } }); const b = L.state.draft.ex[0]; const x = b.sets[b.sets.length - 1]; return { w: x.w, drop: x.drop, sw: b.sw }; });
  ok(dr.drop && dr.w > 0 && dr.w < dr.sw, 'a drop set is seeded from the grey load', dr);
  const pl = await ev(() => { const L = window.__ironlog; const d = L.state.draft; const bi = d.ex.findIndex(b => { const e = L.EX(b.exId); return e.equip === 'barbell'; }); if (bi < 0) return null; L.render(); const el = document.getElementById('pl-' + bi); return el ? el.textContent : ''; });
  ok(pl === null || (pl && !/^0|nothing|empty bar only/i.test(pl) && /\d/.test(pl)), 'the plate helper works from the grey load', pl);

  // ---- 6. Changing the session date: typed loads stay, grey loads follow the new suggestion.
  await start();
  await type(W(0, 0), '77');
  await ev(() => { const el = document.querySelector('input[data-bind="draftDate"]'); el.value = '2026-09-10'; el.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(150);
  const dc = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { w0: b.sets[0].w, w1: b.sets[1].w, sw: b.sw }; });
  ok(dc.w1 === null && (await field(W(0, 0))).v === '77', 'after a date change the typed load stays and the other rows stay grey', dc);

  // ---- 7. Quick entry for a past workout takes the grey load with the typed reps.
  await fresh();
  await ev(() => { const L = window.__ironlog; L.ACT.pastOpen({ dataset: { date: '2026-09-18' } }); });
  await page.waitForTimeout(100);
  await ev(() => document.querySelector('#modal [data-act="pastGo"]').click()); await page.waitForTimeout(150);
  await type(R(0, 0), '9');
  const q = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { done: b.sets[0].done, w: b.sets[0].w, sw: b.sw, past: window.__ironlog.state.draft.past }; });
  ok(q.past && q.done && q.w === q.sw, 'quick entry: typed reps tick the set at its grey load', q);

  // ---- 8. Fill in suggested loads: rows filled, the checkbox is in Settings and survives a reload.
  await fresh();
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
  ok(await ev(() => { const c = document.querySelector('input[data-bind="loadFill"]'); return !!c && !c.checked; }), 'Settings has "Fill in suggested loads", off by default');
  await ev(() => { const c = document.querySelector('input[data-bind="loadFill"]'); c.click(); });
  await page.waitForTimeout(100);
  ok(await ev(() => window.__ironlog.state.settings.loadFill === 'fill'), 'ticking it switches to filled-in loads');
  await ev(() => window.__ironlog.saveNow());
  await page.reload(); await page.waitForFunction(() => window.__libs && window.__libs.chart); await page.waitForTimeout(150);
  ok(await ev(() => window.__ironlog.state.settings.loadFill === 'fill'), 'the choice is kept after a reload');
  await start();
  const fl = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { ws: b.sets.map(x => x.w), sw: b.sw }; });
  ok(fl.ws.every(w => w === fl.sw), 'with it on, new rows come with the suggested load typed in', fl);
  await ev(() => { delete window.__ironlog.state.settings.loadFill; window.__ironlog.saveNow(); });
  ok(await ev(() => { const L = window.__ironlog; return L.normalize(JSON.parse(JSON.stringify(L.state))).settings.loadFill === undefined; }), 'grey is stored as no setting at all, so older saves are unchanged');

  // ---- 9. A swap in grey mode: the new exercise's rows are empty with its own grey load.
  await start();
  await ev(() => window.__ironlog.ACT.bSwap({ dataset: { b: '1' } })); await page.waitForTimeout(80);
  await ev(() => { const inS = new Set(window.__ironlog.state.draft.ex.map(b => b.exId)); [...document.querySelectorAll('#pickList .pick[data-ex]')].find(p => !inS.has(p.dataset.ex)).click(); }); await page.waitForTimeout(150);
  const sw = await ev(() => { const b = window.__ironlog.state.draft.ex[1]; return { ws: b.sets.map(x => x.w), sw: b.sw, ph: document.querySelector('.sg input[data-f="w"][data-b="1"][data-s="0"]').placeholder }; });
  ok(sw.ws.every(w => w === null) && (sw.sw == null ? true : sw.ph === String(sw.sw) || sw.ph !== ''), 'a swapped-in exercise starts with grey loads', sw);

  // ---- 10. Bodyweight lift: grey 0, ticking stores 0 added load.
  const bw = await ev(async () => { const L = window.__ironlog; const d = L.state.draft; const bwEx = L.state.exercises.find(e => e.bw && !e.assist && !e.timed && !e.archived && !L.IDX().byEx[e.id]); const nb = L.newBlock(bwEx.id, { sets: 2, repMin: 6, repMax: 10, rir: 1, rest: 90, inc: 2.27 }, { before: d.date }); d.ex.push(nb); L.saveNow(); L.render(); const bi = d.ex.length - 1;
    const f = document.querySelector(`.sg input[data-f="w"][data-b="${bi}"][data-s="0"]`); const ph = f.placeholder; const r = document.querySelector(`.sg input[data-f="r"][data-b="${bi}"][data-s="0"]`); r.value = '8'; r.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector(`[data-act="sDone"][data-b="${bi}"][data-s="0"]`).click(); await new Promise(r => setTimeout(r, 80)); const x = d.ex[bi].sets[0]; return { ph, w: x.w, done: x.done }; });
  ok(bw.ph === '0' && bw.done && (bw.w === 0 || bw.w === null), 'a bodyweight lift with no history shows 0 in grey and saves no added load', bw);

  // ---- 11. A session left open by r24 (loads filled in) carries on unchanged.
  const O = await open('baselines/r23.html', { browser, touch: true, clock: '2026-09-20T10:00:00' });
  await O.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
  await O.page.click('.hero [data-act="startSession"]:not([data-light])'); await O.page.waitForTimeout(120);
  const old = await O.page.evaluate(() => { window.__ironlog.saveNow(); return JSON.parse(localStorage.getItem('ironlog.v1')); });
  await O.ctx.close();
  const N = await open('index.html', { browser, touch: true, state: old, clock: '2026-09-20T10:00:00' });
  const on = await N.page.evaluate(() => { const b = window.__ironlog.state.draft.ex[0]; return { ws: b.sets.map(x => x.w), v: document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="0"]').value }; });
  ok(on.ws.every(w => w === old.draft.ex[0].sets[0].w) && on.v !== '', 'an older session in progress keeps its filled-in loads', on);
  await N.ctx.close();

  // ---- 12. The new icon: a one-time note on an iPhone home-screen install that had a log before r25.
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
  const asApp = (ua) => async (ctx) => { await ctx.addInitScript(`window.IRONLOG_APP=true;Object.defineProperty(navigator,'standalone',{get:()=>true});${ua ? `Object.defineProperty(navigator,'userAgent',{get:()=>${JSON.stringify(ua)}});` : ''}`); };
  const seeded = await ev(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); s.draft = null; s.settings.onboarded = true; return s; });
  const I1 = await open('index.html', { browser, touch: true, state: seeded, setup: asApp(IPHONE) });
  await I1.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
  ok(await I1.page.evaluate(() => !!document.getElementById('iconBar')), 'an iPhone home-screen app with an older log is told about the new icon');
  await I1.page.click('#iconBar [data-act="iconHow"]'); await I1.page.waitForTimeout(100);
  const ic = await I1.page.evaluate(() => { const m = document.getElementById('modal'); return { t: m.innerText, backup: !!m.querySelector('[data-act="export"]'), steps: m.querySelectorAll('ol.steps li').length }; });
  ok(/removes the log on this phone/.test(ic.t) && ic.backup && ic.steps === 3, 'signed out, the steps come after a warning to sign in or save a backup first', ic);
  await I1.page.click('#modal [data-act="iconLater"]'); await I1.page.waitForTimeout(100);
  ok(await I1.page.evaluate(() => !document.getElementById('iconBar') && !!localStorage.getItem('ironlog.v1.icon25')), 'Done hides the note for good');
  await I1.ctx.close();
  const I2 = await open('index.html', { browser, touch: true, setup: asApp(IPHONE) });
  await I2.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.render(); });
  ok(await I2.page.evaluate(() => !document.getElementById('iconBar')), 'a new install (no log before) already has the new icon: no note');
  await I2.ctx.close();
  const I3 = await open('index.html', { browser, touch: true, state: seeded, setup: asApp('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36') });
  await I3.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
  ok(await I3.page.evaluate(() => !document.getElementById('iconBar')), 'Android refreshes the icon itself: no note');
  await I3.ctx.close();

  // ---- 13. The month calendar (item 74): from History, from Consistency, and by pulling the week bar down.
  await fresh();
  const C = await open('index.html', { browser, touch: true, w: 390, h: 844, clock: '2026-09-30T18:00:00' });
  const cev = (f, a) => C.page.evaluate(f, a);
  await cev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'history'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
  const cal = () => cev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'cal' ? { ym: m.ym, title: document.getElementById('calH').textContent, on: document.querySelectorAll('#modal .cd.on').length, fut: document.querySelectorAll('#modal span.cd.fut').length, futBtn: document.querySelectorAll('#modal button.cd.fut').length } : null; });
  await C.page.click('#view .ph [data-act="calOpen"]'); await C.page.waitForTimeout(100);
  let c1 = await cal();
  ok(c1 && c1.ym === '2026-09' && c1.title === 'September 2026' && c1.on > 0 && c1.futBtn === 0, 'History > Calendar opens this month, lifted days marked, days ahead not tappable', c1);
  ok(await cev(() => document.querySelector('#modal [data-act="calMonth"][data-v="1"]').disabled), 'no months after this one');
  const min = await cev(() => { const L = window.__ironlog; const f = L.state.sessions.map(s => s.date).sort()[0]; return f.slice(0, 7); });
  for (let k = 0; k < 6; k++) { const dis = await cev(() => document.querySelector('#modal [data-act="calMonth"][data-v="-1"]').disabled); if (dis) break; await C.page.click('#modal [data-act="calMonth"][data-v="-1"]'); await C.page.waitForTimeout(50); }
  c1 = await cal();
  ok(c1.ym === min && await cev(() => document.querySelector('#modal [data-act="calMonth"][data-v="-1"]').disabled), 'back to the month of the first session, and no further', [c1.ym, min]);
  // The oldest session: past History's first page, and still opened in place.
  const oldest = await cev(() => [...window.__ironlog.state.sessions].sort((a, b) => a.date < b.date ? -1 : 1)[0]);
  await C.page.click(`#modal [data-act="calDay"][data-date="${oldest.date}"]`); await C.page.waitForTimeout(150);
  ok(await cev((id) => { const L = window.__ironlog; const r = document.querySelector(`[data-act="histToggle"][data-id="${id}"]`); return !L.ui.modal && L.ui.tab === 'history' && L.ui.histOpen === id && !!r && L.ui.histLimit > 25; }, oldest.id), 'tapping a lifted day opens that session in History, even one past the first page');
  // An empty past day logs a workout for it; today opens Today.
  await cev(() => window.__ironlog.ACT.calOpen()); await C.page.waitForTimeout(80);
  const empty = await cev(() => { const b = [...document.querySelectorAll('#modal button.cd:not(.on)')].find(x => x.dataset.date < '2026-09-30'); return b && b.dataset.date; });
  await C.page.click(`#modal [data-act="calDay"][data-date="${empty}"]`); await C.page.waitForTimeout(100);
  ok(await cev((d) => { const m = window.__ironlog.ui.modal; return m && m.kind === 'past' && m.date === d; }, empty), 'an empty past day opens Log a past workout for that date');
  await cev(() => { const L = window.__ironlog; L.ACT.mClose(); L.ACT.calOpen(); }); await C.page.waitForTimeout(80);
  const todayLifted = await cev(() => window.__ironlog.state.sessions.some(s => s.date === '2026-09-30'));
  await C.page.click('#modal [data-act="calDay"][data-date="2026-09-30"]'); await C.page.waitForTimeout(100);
  ok(await cev((l) => !window.__ironlog.ui.modal && window.__ironlog.ui.tab === (l ? 'history' : 'today'), todayLifted), 'today opens its session, or Today when nothing is logged yet');
  // Consistency: a square opens its date.
  await cev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.state.settings.dashFolded = []; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
  const sq = await cev(() => { const b = document.querySelector('.heat button.on'); const f = document.querySelector('.heat div.fut'); return { d: b && b.dataset.date, futDiv: !!f || true }; });
  await cev((d) => document.querySelector(`.heat button[data-date="${d}"]`).click(), sq.d);
  await C.page.waitForTimeout(120);
  ok(await cev((d) => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.id === L.ui.histOpen); return L.ui.tab === 'history' && s && s.date === d; }, sq.d), 'a lifted square in Consistency opens that session', sq);
  // The week bar: a clear pull down opens the calendar, and the day under the finger does not fire.
  await cev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); window.scrollTo(0, 0); });
  const pull = (dy, hold) => cev(async ([dy, hold]) => { const btn = document.querySelectorAll('#wkbar .w')[1]; const r = btn.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const o = (yy) => ({ bubbles: true, cancelable: true, pointerType: 'touch', clientX: x, clientY: yy, pointerId: 11, isPrimary: true, button: 0 });
    btn.dispatchEvent(new PointerEvent('pointerdown', o(y))); if (hold) await new Promise(r => setTimeout(r, hold));
    for (let k = 1; k <= 5; k++) { document.dispatchEvent(new PointerEvent('pointermove', o(y + dy * k / 5))); await new Promise(r => setTimeout(r, 16)); }
    btn.dispatchEvent(new PointerEvent('pointerup', o(y + dy))); btn.click(); await new Promise(r => setTimeout(r, 120));
    const L = window.__ironlog; return { modal: L.ui.modal && L.ui.modal.kind, tab: L.ui.tab }; }, [dy, hold || 0]);
  const p1 = await pull(60);
  ok(p1.modal === 'cal' && p1.tab === 'today', 'pulling the week bar down opens the calendar; the day under the finger is not opened', p1);
  await cev(() => window.__ironlog.ACT.mClose());
  const p2 = await pull(4);
  ok(p2.modal !== 'cal' && (p2.tab === 'history' || p2.modal === 'past' || p2.tab === 'today'), 'a tap that barely moves still opens the day', p2);
  await cev(() => { const L = window.__ironlog; L.ACT.mClose(); L.ui.tab = 'today'; L.render(); });
  const p3 = await pull(20);
  ok(p3.modal !== 'cal', 'a short pull (under 36 px) does not open the calendar', p3);
  await cev(() => { const L = window.__ironlog; L.ACT.mClose(); L.ui.tab = 'today'; L.render(); });
  // The handle opens it with a tap; the header is laid out for it at 320 px too.
  await C.page.click('header .wkpull'); await C.page.waitForTimeout(100);
  ok(await cev(() => window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind === 'cal'), 'a tap on the handle under the week bar opens the calendar');
  await cev(() => window.__ironlog.ACT.mClose());
  for (const w of [320, 375, 390]) {
    await C.page.setViewportSize({ width: w, height: 700 });
    const hd = await cev(() => { const ds = [...document.querySelectorAll('#wkbar .w')].map(e => e.getBoundingClientRect()); const h = document.querySelector('.wkpull').getBoundingClientRect(); return { minW: Math.min(...ds.map(r => r.width)), bottom: Math.max(...ds.map(r => r.bottom)), hTop: h.top, sw: document.documentElement.scrollWidth }; });
    ok((w < 375 || hd.minW >= 44) && hd.hTop >= hd.bottom - 0.5 && hd.sw <= w, `${w} px: the handle sits under the days, days keep their width, no sideways scroll`, hd);
  }
  await cev(() => { window.__ironlog.ACT.calOpen(); }); await C.page.waitForTimeout(80);
  ok(await cev(() => document.documentElement.scrollWidth <= 390 && [...document.querySelectorAll('#modal button.cd')].every(b => b.getBoundingClientRect().height >= 44)), 'calendar days are 44 px tall and fit at 320 px');
  ok(!C.errors.length, 'no page errors in the calendar (' + C.errors.join(' | ') + ')');
  await C.ctx.close();

  // ---- 14. Guardrails and continuity (V's report, 2026-09-30).
  const G = await open('index.html', { browser, touch: true, w: 390, h: 844, clock: '2026-09-20T10:00:00' });
  const gev = (f, a) => G.page.evaluate(f, a);
  const gstart = () => gev(() => { const L = window.__ironlog; L.state.draft = null; L.state.settings.onboarded = true; if (!L.state.sessions.length) L.makeDemo(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.ui.modal = null; document.getElementById('modal').hidden = true; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); L.ACT.startSession({ dataset: { day: '0' } }); });
  const modal = () => gev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, t: document.getElementById('modal').innerText } : null; });
  // Short on time never drops typed sets, and Undo puts back exactly what it took.
  await gstart();
  const t1 = await gev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[2].sets[0].r = 7; d.ex[2].sets[0].w = 40; const before = d.ex.map(b => b.sets.length).join(); L.ACT.shortOpen(); L.ui.modal.mins = 15; L.ACT.shortApply(); const dd = L.state.draft; const b2 = dd.ex.find(b => b.sets.some(x => x.r === 7)); return { before, mid: dd.ex.map(b => b.sets.length).join(), kept: !!b2 }; });
  ok(t1.kept, 'Short on time keeps an exercise with a set typed but not ticked, and keeps that set', t1);
  const t1b = await gev(() => { const L = window.__ironlog; const d = L.state.draft; const id = d.ex[0].exId; d.ex[0].sets[0].r = 8; d.ex[0].sets[0].w = 60; d.ex[0].sets[0].done = true; L.saveNow(); L.ACT.undo(); const b = L.state.draft.ex.find(x => x.exId === id); return { after: L.state.draft.ex.map(b => b.sets.length).join(), logged: !!b && b.sets[0].done }; });
  ok(t1b.after === t1.before && t1b.logged, 'Undo after Short on time restores every row and exercise it took, and keeps a set logged since', [t1.before, t1b.after]);
  // A swap keeps typed, unticked sets on the exercise they were typed on.
  await gstart();
  await gev(() => { const L = window.__ironlog; L.state.draft.ex[0].sets[0].r = 9; L.state.draft.ex[0].sets[0].w = 33; L.render(); L.ACT.bSwap({ dataset: { b: '0' } }); }); await G.page.waitForTimeout(80);
  await gev(() => { const inS = new Set(window.__ironlog.state.draft.ex.map(b => b.exId)); [...document.querySelectorAll('#pickList .pick[data-ex]')].find(p => !inS.has(p.dataset.ex)).click(); }); await G.page.waitForTimeout(150);
  const t2 = await gev(() => { const d = window.__ironlog.state.draft; return { a: d.ex[0].sets.map(x => [x.w, x.r]), b: d.ex[1].sets.length }; });
  ok(t2.a.length === 1 && t2.a[0][1] === 9 && t2.b >= 1, 'a swap keeps a typed set on the old exercise; the new one takes the rest', t2);
  // An exercise opened again stays open when the one above it moves.
  const t3 = await gev(async () => { const L = window.__ironlog; const d = L.state.draft; const b = d.ex[2]; b.sets.forEach(x => { x.w = 50; x.r = 8; x.done = true; }); L.render(); L.ACT.bOpen({ dataset: { b: '2' } }); L.ACT.bUp({ dataset: { b: '1' } }); await new Promise(r => setTimeout(r, 40)); return !document.getElementById('blk-2').classList.contains('folded') && L.state.draft.ex[2] === b; });
  ok(t3, 'an exercise opened again stays open when another exercise moves past it');
  // Discard asks when only a load was typed.
  await gstart();
  await gev(() => { const L = window.__ironlog; L.state.draft.ex[0].sets[0].w = 99; L.saveNow(); L.render(); document.querySelector('[data-act="discard"]').click(); });
  ok((await modal() || {}).kind === 'confirm' && await gev(() => !!window.__ironlog.state.draft), 'Discard asks when a load was typed, even with no reps');
  await gev(() => window.__ironlog.ACT.mClose());
  // Removing an exercise with logged sets asks first.
  await gev(() => { const L = window.__ironlog; const b = L.state.draft.ex[1]; b.sets[0].w = 40; b.sets[0].r = 10; b.sets[0].done = true; L.render(); L.ACT.bDel({ dataset: { b: '1' } }); });
  let m14 = await modal();
  ok(m14 && m14.kind === 'confirm' && /1 logged set/.test(m14.t) && await gev(() => window.__ironlog.state.draft.ex[1].sets[0].done), 'removing an exercise with a logged set asks first, and says what goes', m14);
  await gev(() => window.__ironlog.ACT.mClose());
  const n14 = await gev(() => window.__ironlog.state.draft.ex.length);
  await gev(() => { const L = window.__ironlog; L.ACT.bDel({ dataset: { b: String(L.state.draft.ex.length - 1) } }); });
  ok(!(await modal()) && await gev(() => window.__ironlog.state.draft.ex.length) === n14 - 1, 'an untouched exercise goes straight away, with Undo');
  // History, Body: entries ask before they go.
  await gev(() => { const L = window.__ironlog; L.state.draft = null; L.state.cardio.push({ id: 'cx1', date: '2026-09-19', kind: 'walk', when: 'solo', min: 25, hr: null, note: '' }); L.invalidate(); L.saveNow(); L.ui.tab = 'history'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
  await gev(() => document.querySelector('[data-act="cardioDel"][data-id="cx1"]').click());
  m14 = await modal();
  ok(m14 && m14.kind === 'confirm' && /25 min/.test(m14.t) && await gev(() => window.__ironlog.state.cardio.some(c => c.id === 'cx1')), 'deleting a cardio entry in History asks first', m14);
  await gev(() => document.querySelector('#modal [data-act="mOk"]').click());
  ok(await gev(() => !window.__ironlog.state.cardio.some(c => c.id === 'cx1') && window.__ironlog.state.trash.some(t => t.kind === 'cardio')), 'confirmed, it goes to Recently deleted');
  const bwId = await gev(() => { const L = window.__ironlog; const b = L.state.bodyweights[L.state.bodyweights.length - 1]; L.ACT.delBW({ dataset: { id: b.id } }); return b.id; });
  m14 = await modal();
  ok(m14 && m14.kind === 'confirm' && /weigh-in/i.test(m14.t) && await gev((id) => window.__ironlog.state.bodyweights.some(b => b.id === id), bwId), 'deleting a weigh-in asks first', m14);
  await gev(() => window.__ironlog.ACT.mClose());
  const mId = await gev(() => { const L = window.__ironlog; const x = L.state.measurements[0]; if (!x) return null; L.ACT.delMeas({ dataset: { id: x.id } }); return x.id; });
  m14 = await modal();
  ok(mId && m14 && m14.kind === 'confirm' && await gev((id) => window.__ironlog.state.measurements.some(x => x.id === id), mId), 'deleting a tape entry asks first', m14);
  await gev(() => window.__ironlog.ACT.mClose());
  ok(!G.errors.length, 'no page errors in the guardrail checks (' + G.errors.join(' | ') + ')');
  await G.ctx.close();

  ok(!errors.length, 'no page errors (' + errors.join(' | ') + ')');
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e); process.exit(1); });
