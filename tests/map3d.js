// The 3D body on Today: opens from the Flat / 3D switch, loads three.js only
// then, shades every muscle group exactly like the flat map, turns with the
// buttons and a sideways drag, answers a tap with the same detail, keeps one
// canvas across re-renders, remembers the choice, follows changes in the
// numbers, and falls back cleanly when 3D cannot load.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
(async () => {
  const { browser, page, errors } = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-24T18:00:00' });
  const ev = (f, a) => page.evaluate(f, a);
  let threeReq = 0; page.on('request', r => { if (/three/.test(r.url())) threeReq++; });
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.folds['today:map'] = true; L.render(); });
  await page.waitForTimeout(300);
  ok(!!(await ev(() => document.querySelector('.bm-wrap'))) && !(await ev(() => document.getElementById('bm3d'))), 'Flat is the default');
  ok(threeReq === 0, 'three.js is not loaded until 3D is opened');
  await page.click('[data-act="mapView"][data-v="3d"]');
  await page.waitForFunction(() => window.__ironlog.map3d().state === 'ready', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(300);
  const m = await ev(() => { const x = window.__ironlog.map3d(); return { state: x.state, meshes: x.meshes, canvas: x.canvas, colors: x.colors, want: x.want }; });
  ok(m.state === 'ready' && m.canvas && m.meshes > 50, '3D loads and draws (' + m.meshes + ' shapes)', m.state);
  // Every muscle group is shaded from the same status the flat map uses.
  const mism = await ev(() => { const x = window.__ironlog.map3d(); return { colors: x.colors, want: x.want }; });
  const groups = ['neck', 'traps', 'frontDelts', 'sideDelts', 'rearDelts', 'rotatorCuff', 'chest', 'serratus', 'upperBack', 'lats', 'lowerBack', 'abs', 'obliques', 'biceps', 'triceps', 'forearms', 'glutes', 'abductors', 'quads', 'hamstrings', 'adductors', 'calves', 'tibialis'];
  ok(groups.every(g => mism.colors[g]), 'all 23 muscle groups have a region', groups.filter(g => !mism.colors[g]));
  const hex = c => c.trim().toLowerCase();
  // Tracked only, no target: serratus and rotator cuff, and neck and tibialis since r29.
  const TRACK = ['serratus', 'rotatorCuff', 'neck', 'tibialis'];
  const onTarget = groups.filter(g => !TRACK.includes(g));
  ok(onTarget.every(g => mism.colors[g] === hex(mism.want.in)), 'demo data (all on target): every region is the on-target green', onTarget.filter(g => mism.colors[g] !== hex(mism.want.in)).map(g => g + ' ' + mism.colors[g]));
  ok(TRACK.every(g => mism.colors[g] === hex(mism.want.track).replace(/^#?/, '#')), 'serratus, rotator cuff, neck, and tibialis show as tracked only');
  // A change in the numbers shows at once: chest target raised above what was done.
  await ev(() => { const L = window.__ironlog; L.state.settings.bands.chest = [60, 80]; L.invalidate(); L.render(); });
  await page.waitForTimeout(200);
  const c2 = await ev(() => window.__ironlog.map3d().colors.chest);
  ok(c2 === hex(mism.want.under), 'a muscle below target turns amber (' + c2 + ')');
  // One canvas for the whole visit.
  await ev(() => { document.querySelector('#bm3d canvas').__mark = 1; window.__ironlog.render(); });
  ok(await ev(() => !!(document.querySelector('#bm3d canvas') || {}).__mark), 'a re-render reuses the same canvas');
  // Turning.
  await page.click('[data-act="map3dTurn"][data-v="2"]'); await page.waitForTimeout(700);
  ok(Math.abs(Math.cos(await ev(() => window.__ironlog.map3d().yaw)) + 1) < 0.01, 'Back turns the body to show its back');
  await page.click('[data-act="map3dTurn"][data-v="0"]'); await page.waitForTimeout(700);
  ok(Math.abs(Math.cos(await ev(() => window.__ironlog.map3d().yaw)) - 1) < 0.01, 'Front turns it back');
  // Drag sideways turns it.
  const box = await (await page.$('#bm3d canvas')).boundingBox();
  const y0 = await ev(() => window.__ironlog.map3d().yaw);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 6 }); await page.mouse.up();
  const y1 = await ev(() => window.__ironlog.map3d().yaw);
  ok(Math.abs(y1 - y0) > 0.5 && !(await ev(() => window.__ironlog.ui.mapSel)), 'a sideways drag turns it and selects nothing');
  await page.click('[data-act="map3dTurn"][data-v="0"]'); await page.waitForTimeout(700);
  // Tap on the belly: abs, with the same detail as the flat map.
  const bb = await (await page.$('#bm3d canvas')).boundingBox();
  let hit = null, at = null;
  for (let fy = 0.42; fy <= 0.52 && !hit; fy += 0.01) { const p = { x: bb.x + bb.width / 2, y: bb.y + bb.height * fy }; const h = await ev(([x, y]) => window.__ironlog.map3d().pick(x, y), [p.x, p.y]); if (h === 'abs') { hit = h; at = p; } }
  ok(hit === 'abs', 'the middle of the belly is the abs');
  if (at) { await page.mouse.click(at.x, at.y); await page.waitForTimeout(300); }
  ok((await ev(() => window.__ironlog.ui.mapSel)) === 'abs' && /Abs/.test(await ev(() => (document.querySelector('.bm-detail') || {}).innerText || '')), 'a tap opens the muscle\'s numbers');
  ok((await ev(() => window.__ironlog.map3d().glow.join())) === 'abs', 'only the selected region is highlighted');
  // Remembered.
  await page.reload(); await page.waitForFunction(() => window.__ironlog); await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.folds['today:map'] = true; L.render(); });
  await page.waitForFunction(() => window.__ironlog.map3d().state === 'ready' && !!document.querySelector('#bm3d canvas'), null, { timeout: 20000 }).catch(() => {});
  ok(await ev(() => !!document.querySelector('#bm3d canvas')), '3D is remembered after a relaunch');
  // Small phone.
  await page.setViewportSize({ width: 320, height: 640 }); await ev(() => window.__ironlog.render()); await page.waitForTimeout(300);
  ok(await ev(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scrolling at 320 px');
  ok(await ev(() => [...document.querySelectorAll('#bm3d .chip,[data-act="mapView"]')].every(b => b.getBoundingClientRect().height >= 40)), 'turn and view buttons are thumb-sized');
  ok(errors.length === 0, 'no console errors', errors);
  await browser.close();

  // When 3D cannot load: a plain message, and Flat still works.
  const F = await open('index.html', { touch: true, w: 390, h: 844, setup: async (ctx, pg) => { await pg.route(/three/, r => r.abort()); } });
  await F.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.ui.folds['today:map'] = true; L.render(); });
  await F.page.click('[data-act="mapView"][data-v="3d"]');
  await F.page.waitForFunction(() => window.__ironlog.map3d().state === 'fail', null, { timeout: 20000 }).catch(() => {});
  await F.page.waitForTimeout(200);
  ok(/could not load/.test(await F.page.evaluate(() => (document.querySelector('.bm3d-msg') || {}).textContent || '')), '3D blocked: says so plainly');
  await F.page.click('[data-act="mapView"][data-v="flat"]'); await F.page.waitForTimeout(200);
  ok(await F.page.evaluate(() => !!document.querySelector('.bm-wrap svg')), 'and Flat still works');
  ok(!F.errors.filter(e => !/three|Failed to fetch dynamically imported module|net::ERR/i.test(e)).length, 'no other console errors', F.errors);
  await F.browser.close();
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack || e); process.exit(1); });
