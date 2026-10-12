// r39 (backlog item 172): an exercise's muscles lit on the body. From a
// session exercise's ⋯ menu, Muscles worked opens a sheet with the main muscle
// in the accent and the helpers lighter, flat by default and on the 3D body
// when 3D is chosen (the same switch and the same renderer as Today's map,
// which takes the body back when the sheet closes). The exercise editor shows
// the flat figures as the muscles are picked. Light and dark, 320 px, and a
// blocked three.js leaving the flat view working.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = 'index.html';
// three.js mixes colours in linear light; the expected helper colour is worked out the same way.
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const srgb = c => { const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.round(Math.max(0, Math.min(1, v)) * 255); };
const rgbOf = h => { h = h.trim().replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const mid = (a, b) => rgbOf(a).map((x, i) => srgb((lin(x) + lin(rgbOf(b)[i])) / 2));
const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) <= 2);

(async () => {
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  for (const dark of [false, true]) {
    const T = dark ? ' (dark)' : ' (light)';
    const P = await open(FILE, { browser, touch: true, dark, w: 390, h: 844, clock: '2026-10-11T12:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    let threeReq = 0; page.on('request', r => { if (/three/.test(r.url())) threeReq++; });
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.folds['today:map'] = true; L.render(); });
    await wait(200);

    // ---------- 1. From a session exercise's menu, flat by default ----------
    const bi = await ev(() => { const L = window.__ironlog; document.querySelector('.hero [data-act="startSession"]').click(); const d = L.state.draft; return d.ex.findIndex(b => { const e = L.EX(b.exId); return e.secondary.filter(k => k !== e.primary).length >= 2; }); });
    ok(bi >= 0, 'a session with an exercise that has two or more helper muscles' + T, bi);
    await ev((bi) => window.__ironlog.openModal({ kind: 'bmenu', b: bi }), bi); await wait(60);
    const menu = await ev(() => { const b = document.querySelector('#modal [data-op="bMus"]'); return b ? { text: b.textContent, h: b.getBoundingClientRect().height } : null; });
    ok(menu && menu.text === 'Muscles worked' && menu.h >= 44, 'the exercise\'s ⋯ menu has Muscles worked' + T, menu);
    await ev(() => document.querySelector('#modal [data-op="bMus"]').click()); await wait(80);
    const flat = await ev((bi) => {
      const L = window.__ironlog; const e = L.EX(L.state.draft.ex[bi].exId); const help = e.secondary.filter(k => k !== e.primary);
      const m = document.getElementById('modal'); const vol = getComputedStyle(document.documentElement).getPropertyValue('--volt').trim();
      const fillOf = sel => { const n = m.querySelector(sel + ' *'); return n ? getComputedStyle(n).fill : null; };
      const probe = document.createElement('i'); probe.style.color = vol; document.body.appendChild(probe); const volRgb = getComputedStyle(probe).color; probe.remove();
      const helpOp = (() => { const n = m.querySelector('.mx.ex-help *'); return n ? getComputedStyle(n).fillOpacity : null; })();
      return {
        name: e.name, h: m.querySelector('h3').textContent, words: m.querySelector('p.small').innerText.replace(/\s+/g, ' ').trim(),
        want: `Main: ${L.ML[e.primary]}` + (help.length ? `. Helpers: ${L.andList(help.map(k => L.ML[k]))} i` : ''), primary: e.primary, help,
        mainGroups: m.querySelectorAll('.mx.ex-main').length, helpGroups: m.querySelectorAll('.mx.ex-help').length,
        mainFill: fillOf('.mx.ex-main'), volRgb, helpOp, flatOn: !!m.querySelector('[data-act="mapView"][data-v="flat"].on'), stage: !!document.getElementById('bm3dx'),
        legend: [...m.querySelectorAll('.bm-legend span')].map(s => s.innerText.trim())
      };
    }, bi);
    ok(flat.h === 'Muscles: ' + flat.name, 'the sheet is titled with the exercise' + T, flat.h);
    ok(flat.words === flat.want && / and /.test(flat.words), 'it says the main muscle and the helpers in a list' + T, flat.words);
    ok(flat.flatOn && !flat.stage && threeReq === 0, 'flat is the default, and three.js is not loaded' + T, { flatOn: flat.flatOn, threeReq });
    ok(flat.mainGroups >= 1 && flat.helpGroups >= flat.help.length && flat.mainFill === flat.volRgb && Number(flat.helpOp) < 0.6, 'the main muscle is in the accent and the helpers lighter' + T, flat);
    ok(flat.legend.join('|') === 'Main|Helper', 'a legend says Main and Helper' + T, flat.legend);

    // ---------- 2. The 3D body ----------
    await ev(() => document.querySelector('#modal [data-act="mapView"][data-v="3d"]').click());
    await page.waitForFunction(() => window.__ironlog.map3d().state === 'ready', null, { timeout: 20000 }).catch(() => {});
    await wait(300);
    const m3 = await ev((bi) => { const L = window.__ironlog; const x = L.map3d(); const e = L.EX(L.state.draft.ex[bi].exId); return { canvas: !!document.querySelector('#bm3dx canvas'), colors: x.colors, want: x.want, primary: e.primary, help: e.secondary.filter(k => k !== e.primary), modal: L.ui.modal && L.ui.modal.kind }; }, bi);
    const hx = c => '#' + c.replace('#', '').toLowerCase();
    ok(m3.modal === 'exMus' && m3.canvas, 'the 3D body draws inside the sheet' + T, m3.modal);
    ok(m3.colors[m3.primary] === hx(m3.want.ex) || near(rgbOf(m3.colors[m3.primary]), rgbOf(m3.want.ex)), 'the main muscle is the accent (' + m3.colors[m3.primary] + ')' + T, m3.want.ex);
    const hw = mid(m3.want.ex, m3.want.base);
    ok(m3.help.every(k => near(rgbOf(m3.colors[k]), hw)), 'each helper is halfway between the accent and the body' + T, m3.help.map(k => [k, m3.colors[k]]));
    const others = Object.keys(m3.colors).filter(k => k !== '_base' && k !== m3.primary && !m3.help.includes(k));
    ok(others.length >= 15 && others.every(k => near(rgbOf(m3.colors[k]), rgbOf(m3.want.none))) && near(rgbOf(m3.colors._base), rgbOf(m3.want.base)), 'every other muscle stays neutral' + T, others.filter(k => !near(rgbOf(m3.colors[k]), rgbOf(m3.want.none))));
    ok((await ev(() => window.__ironlog.map3d().glow.length)) === 0, 'nothing glows as selected' + T);
    await ev(() => document.querySelector('#modal [data-act="map3dTurn"][data-v="2"]').click()); await wait(700);
    ok(Math.abs(Math.cos(await ev(() => window.__ironlog.map3d().yaw)) + 1) < 0.01, 'Back turns the body in the sheet' + T);
    await ev(() => document.querySelector('#modal [data-act="map3dTurn"][data-v="0"]').click()); await wait(700);
    // A tap names the muscle and selects nothing on Today's map.
    const bb = await (await page.$('#bm3dx canvas')).boundingBox();
    let at = null, hit = null;
    for (let fy = 0.42; fy <= 0.52 && !hit; fy += 0.01) { const p = { x: bb.x + bb.width / 2, y: bb.y + bb.height * fy }; const h = await ev(([x, y]) => window.__ironlog.map3d().pick(x, y), [p.x, p.y]); if (h === 'abs') { hit = h; at = p; } }
    if (at) { await page.mouse.click(at.x, at.y); await wait(200); }
    const tap = await ev(() => ({ toast: document.getElementById('toast').innerText, sel: window.__ironlog.ui.mapSel || null, modal: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind }));
    ok(hit === 'abs' && /^Abs/.test(tap.toast) && !tap.sel && tap.modal === 'exMus', 'a tap on the body names the muscle' + T, tap);

    // ---------- 3. Today's map takes the body back ----------
    await ev(() => window.__ironlog.ACT.mClose()); await wait(60);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.ui.tab = 'today'; L.ui.folds['today:map'] = true; L.render(); });
    await page.waitForFunction(() => !!document.querySelector('#bm3d canvas'), null, { timeout: 10000 }).catch(() => {});
    await wait(200);
    const back = await ev(() => { const x = window.__ironlog.map3d(); return { canvas: !!document.querySelector('#bm3d canvas'), chest: x.colors.chest, quads: x.colors.quads, want: x.want }; });
    ok(back.canvas && back.chest === hx(back.want.in) && back.quads === hx(back.want.in), 'closed, Today\'s 3D map has the body back, coloured by the week again' + T, back);
    // Over Today: the sheet borrows the body and gives it back.
    await ev(() => window.__ironlog.openModal({ kind: 'exMus', exId: 'backSquat' })); await wait(200);
    const over = await ev(() => { const x = window.__ironlog.map3d(); return { inSheet: !!document.querySelector('#bm3dx canvas'), inToday: !!document.querySelector('#bm3d canvas'), quads: x.colors.quads, want: x.want }; });
    ok(over.inSheet && !over.inToday && near(rgbOf(over.quads), rgbOf(over.want.ex)), 'opened over Today, the sheet shows the back squat\'s quads lit' + T, over);
    await ev(() => window.__ironlog.ACT.mClose()); await wait(200);
    const after = await ev(() => { const x = window.__ironlog.map3d(); return { inToday: !!document.querySelector('#bm3d canvas'), quads: x.colors.quads, want: x.want, ex: window.__ironlog.map3d && true }; });
    ok(after.inToday && after.quads === hx(after.want.in), 'and gives it back to Today when closed' + T, after);

    // ---------- 4. The exercise editor shows them as they are picked ----------
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = 'library'; L.render(); document.querySelector('[data-act="exEdit"][data-ex="bench"]').click(); });
    await wait(80);
    const ed = await ev(async () => {
      const m = document.getElementById('modal'); const o = {};
      const groups = () => ({ main: [...m.querySelectorAll('.exbody .mx.ex-main')].length, help: [...m.querySelectorAll('.exbody .mx.ex-help')].length });
      o.a = groups(); o.legend = [...m.querySelectorAll('.exbody .bm-legend span')].map(s => s.innerText.trim());
      const chip = [...m.querySelectorAll('[data-act="secToggle"]')].find(b => !b.classList.contains('on') && b.dataset.m === 'abs'); chip.click(); await new Promise(r => setTimeout(r, 60));
      o.b = groups();
      const sel = m.querySelector('[data-ebind="primary"]'); sel.value = 'lats'; sel.dispatchEvent(new Event('change', { bubbles: true })); await new Promise(r => setTimeout(r, 60));
      o.c = groups(); o.wide = document.documentElement.scrollWidth <= innerWidth; window.__ironlog.ACT.mClose();
      return o;
    });
    ok(ed.a.main >= 1 && ed.a.help >= 1 && ed.legend.join('|') === 'Main|Helper', 'the editor shows the bench\'s muscles on the flat body' + T, ed);
    ok(ed.b.help > ed.a.help && ed.c.main >= 1, 'a helper picked, or a new main muscle, shows at once' + T, ed);

    // ---------- 5. 320 px ----------
    await page.setViewportSize({ width: 320, height: 640 });
    await ev(() => window.__ironlog.openModal({ kind: 'exMus', exId: 'bench' })); await wait(300);
    const narrow = await ev(() => ({ wide: document.documentElement.scrollWidth <= innerWidth, canvas: !!document.querySelector('#bm3dx canvas'), w: (document.querySelector('#bm3dx canvas') || { getBoundingClientRect: () => ({ width: 0 }) }).getBoundingClientRect().width, chipH: Math.min(...[...document.querySelectorAll('#modal .chip')].map(b => b.getBoundingClientRect().height)) }));
    ok(narrow.wide && narrow.canvas && narrow.w <= 320 && narrow.chipH >= 44, 'at 320 px the sheet and its body fit, with 44 px buttons' + T, narrow);
    await ev(() => window.__ironlog.ACT.mClose());

    const guide = await ev(() => { const L = window.__ironlog; L.openModal({ kind: 'guide' }); const t = document.getElementById('modal').textContent; L.ACT.mClose(); return t; });
    ok(/Muscles worked, in an exercise's ⋯ menu, shows what it trains on the body/.test(guide), 'the Guide says where Muscles worked is' + T);
    const errs = P.errors.filter(e => !/favicon/.test(e));
    ok(!errs.length, 'no page errors' + T, errs);
    await page.close();
  }

  // ---------- 6. three.js blocked: the sheet says so, flat still works ----------
  {
    const P = await open(FILE, { browser, touch: true, w: 390, h: 844, clock: '2026-10-11T12:00:00' });
    const { page } = P; const ev = (f, a) => page.evaluate(f, a);
    await page.route(/three/, r => r.abort());
    await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.render(); L.openModal({ kind: 'exMus', exId: 'bench' }); });
    await ev(() => document.querySelector('#modal [data-act="mapView"][data-v="3d"]').click());
    await page.waitForFunction(() => window.__ironlog.map3d().state === 'fail', null, { timeout: 20000 }).catch(() => {});
    await wait(200);
    const f = await ev(() => { const m = document.querySelector('#bm3dx .bm3d-msg'); return { state: window.__ironlog.map3d().state, msg: m && !m.hidden ? m.textContent : null }; });
    ok(f.state === 'fail' && /could not load/.test(f.msg || ''), 'three.js blocked: the sheet says the 3D view could not load', f);
    await ev(() => document.querySelector('#modal [data-act="mapView"][data-v="flat"]').click()); await wait(80);
    ok(await ev(() => document.querySelectorAll('#modal .mx.ex-main').length >= 1), 'and Flat still shows the muscles');
    const errs = P.errors.filter(e => !/favicon|three|Failed to fetch|dynamically imported/i.test(e));
    ok(!errs.length, 'no page errors with three.js blocked', errs);
    await page.close();
  }
  await browser.close();
  if (fails.length) { console.log(`\n${fails.length} FAILED`); process.exit(1); }
  console.log('\nALL PASS');
})().catch(e => { console.error(e); process.exit(1); });
