// 2.33 (build r79; PENDING.md's tracker, ST-1 to ST-5): the elements V picked from the Stitch drafts (2026-11-07), on the
// app's own screens, each section written as what a lifter expects and run first on 2.32
// (`node tests/r79.js <2.32's index.html>`), where each section fails unless it says it guards:
//   1  ST-1: a profile photo picked in the menu shows in the menu button at the top right, kept on this phone only: a
//      small square JPEG under its own key, never in the log, a backup or the account. Remove asks first. A value in
//      storage that is not a JPEG data address is never shown, an SVG is refused, and Erase everything removes it.
//   2  ST-2: once a lifter has an account, one line on Today offers a photo, once per phone: Not now hides it for
//      good, and so does a photo added. Guards: never signed out, in the demo, with a photo, or beside another line.
//   3  ST-3: progress is drawn with the progress gradient, and only progress: the week ring, the rest dial, a
//      session's bar and the week's hard sets bar (sized to the whole track), Today's lines of lifts moving and the
//      exercise sheet's strength line (a flat line too), the same in every accent. Guards: buttons keep the accent.
//   4  ST-4: a PR is gold wherever it is marked: a ticked set that is a PR has a gold bar, History marks each
//      session's counted PRs ("4 PRs smashed") and marks each lift that had one, and Today's "PR last time" is
//      gold; the counts are the counted PRs Today and Stats count. Guards: a session with no PR says none.
//      History's count is a gold cup named "4 PRs smashed", with no text added to the screen (tests/acceptance.js).
//   5  ST-5: the new parts fit a 320 px phone with no sideways scroll, with 44 px targets, in light and dark.
// R79_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R79_ONLY ? process.env.R79_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
// A section that stops on a build without its feature records why and the run goes on (setInputFiles on a field that is not there throws).
const DAY = '2026-11-07';
// A signed-in account, with no sync service behind it (the line on Today reads only who is signed in).
const SIGNED_IN = "window.ironlogAuth={onChange(){},user(){return Promise.resolve({id:'u79',email:'v@example.com'});},signOut(){return Promise.resolve();}};";
const SIGNED_OUT = 'window.ironlogAuth={onChange(){},user(){return Promise.resolve(null);},signOut(){return Promise.resolve();}};';

/** The app on Today, set up, optionally with the demo log and an account service. */
async function app(o = {}) {
  const D = await open(FILE, { w: o.w || 390, h: 844, dark: !!o.dark, clock: DAY + 'T10:00:00', setup: o.auth ? ctx => ctx.addInitScript(o.auth) : undefined });
  await D.page.evaluate(({ demo, theme }) => {
    const L = window.__ironlog; L.state.settings.onboarded = true; if (theme) L.state.settings.theme = theme;
    if (demo) { L.makeDemo(); for (const x of L.state.sessions) delete x.demo; }
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.ui.tab = 'today'; L.render();
  }, { demo: !!o.demo, theme: o.theme || null });
  await wait(400);
  return D;
}
/** A photo file made in the page: a PNG of `w` by `h` pixels, as bytes, for a file field. */
async function pngFile(page, w, h) {
  const b64 = await page.evaluate(([w, h]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#4a6'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(w / 4, h / 4, w / 2, h / 2); return c.toDataURL('image/png').split(',')[1]; }, [w, h]);
  return { name: 'me.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
/** Waits for the menu button to show a photo (decoding and redrawing a photo takes a moment on a slow machine). */
const photoIn = page => page.waitForFunction(() => !!document.querySelector('#saveState img.ssb-ph'), null, { timeout: 8000 }).then(() => true, () => false);
/** What the menu button shows: its photo (with the photo's pixel size), or none. */
const button = page => page.evaluate(() => new Promise(res => {
  const b = document.getElementById('saveState'), im = b && b.querySelector('img.ssb-ph');
  if (!im) return res({ photo: false, label: b && b.getAttribute('aria-label') });
  const done = () => res({ photo: true, src: im.getAttribute('src').slice(0, 23), w: im.naturalWidth, h: im.naturalHeight, ph: b.classList.contains('ph'), label: b.getAttribute('aria-label') });
  im.complete ? done() : im.addEventListener('load', done);
}));

(async () => {
  if (run(1)) try {
    const D = await app();
    const pg = D.page;
    await pg.click('#saveState'); await wait(200);
    ok(await pg.evaluate(() => !!document.querySelector('#modal #menuPhoto input[type="file"][data-photo]')), '1. the menu offers a profile photo');
    await pg.setInputFiles('#modal #menuPhoto input[data-photo]', await pngFile(pg, 900, 600)); await photoIn(pg); await wait(150);
    const b = await button(pg);
    ok(b.photo && b.ph && b.src === 'data:image/jpeg;base64,' && b.w === 256 && b.h === 256, '1. the photo shows in the menu button, drawn again as a 256 px square JPEG', b);
    ok(/^Menu\. /.test(b.label || ''), '1. the button is still named the menu, with the save state', b.label);
    ok(await pg.evaluate(() => !!document.querySelector('#modal #menuPhoto img') && /Change/.test(document.querySelector('#modal #menuPhoto').innerText)), '1. the open menu shows it at once, with Change');
    const kept = await pg.evaluate(() => { const L = window.__ironlog; const v = localStorage.getItem(L.KEY + '.photo') || ''; return { key: v.startsWith('data:image/jpeg;base64,'), size: v.length, inLog: /data:image|"photo"/.test(JSON.stringify(L.state)), inSave: /data:image/.test(localStorage.getItem(L.KEY) || '') }; });
    ok(kept.key && kept.size < 120000 && !kept.inLog && !kept.inSave, '1. it is kept under its own key on this phone, small, and nowhere in the log or its save (so never in a backup or the account)', kept);
    // Remove asks first, and takes it away only on the answer.
    await pg.click('#modal [data-act="photoDel"]'); await wait(200);
    const asked = await pg.evaluate(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? m.title : null; });
    ok(asked === 'Remove your profile photo?' && (await button(pg)).photo, '1. Remove asks first, and the photo stays until the answer', asked);
    await pg.click('#modal [data-act="mOk"]'); await wait(300);
    const gone = await button(pg);
    ok(!gone.photo && /^Menu\. /.test(gone.label || '') && (await pg.evaluate(() => localStorage.getItem(window.__ironlog.KEY + '.photo'))) === null, '1. answered, the photo is gone and the menu icon is back', gone);
    // Only a JPEG data address is ever shown.
    for (const v of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'https://example.com/me.jpg', 'javascript:alert(1)', 'data:image/jpeg;base64,abc"><b>x</b>']) {
      await pg.evaluate(v => { const L = window.__ironlog; localStorage.setItem(L.KEY + '.photo', v); L.render(); }, v); await wait(100);
      ok(!(await button(pg)).photo, `1. a stored value that is not a JPEG data address is never shown (${v.slice(0, 24)})`);
    }
    await pg.evaluate(() => { const L = window.__ironlog; localStorage.removeItem(L.KEY + '.photo'); L.ACT.mClose && L.ACT.mClose(); L.render(); });
    // An SVG is refused, with a reason.
    await pg.click('#saveState'); await wait(200);
    await pg.setInputFiles('#modal #menuPhoto input[data-photo]', { name: 'x.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>') }); await wait(500);
    ok(!(await button(pg)).photo && /Only photos/.test(await pg.evaluate(() => (document.getElementById('toast') || {}).innerText || '')), '1. an SVG is refused, saying only photos can be added');
    // Erase everything removes it, as it removes a note's pictures.
    await pg.setInputFiles('#modal #menuPhoto input[data-photo]', await pngFile(pg, 300, 300)); await photoIn(pg);
    ok((await button(pg)).photo, '1. a photo added again');
    await pg.evaluate(() => { const L = window.__ironlog; L.ACT.mClose && L.ACT.mClose(); L.ACT.resetAll(); }); await wait(200);
    await pg.click('#modal [data-act="mOk"]'); await wait(500);
    ok(!(await button(pg)).photo && (await pg.evaluate(() => localStorage.getItem(window.__ironlog.KEY + '.photo'))) === null, '1. Erase everything removes the profile photo');
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.browser.close();
  } catch (e) { ok(false, '1. the section stopped', String(e).slice(0, 300)); }

  if (run(2)) try {
    const line = page => page.evaluate(() => { const b = document.getElementById('photoBar'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : null; });
    const D = await app({ auth: SIGNED_IN });
    await D.page.waitForFunction(() => !!window.__ironlog.acctUser(), null, { timeout: 5000 }).catch(() => {});
    await D.page.evaluate(() => window.__ironlog.render()); await wait(200);
    const t = await line(D.page);
    ok(t === 'Add a profile photo. Add photo ✕' || t === 'Add a profile photo. It shows at the top right, on this phone only. Add photo ✕', '2. signed in with no photo, Today offers one in a slim line', t);
    ok(!/optional/i.test(t || ''), '2. the line does not say optional', t);
    await D.page.click('#photoBar [data-act="photoLater"]'); await wait(200);
    ok((await line(D.page)) === null, '2. Not now hides it');
    await D.page.reload(); await D.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(800);
    await D.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await wait(200);
    ok((await line(D.page)) === null, '2. and stays hidden after a relaunch');
    // A photo added from the line answers it too.
    await D.page.evaluate(() => { const L = window.__ironlog; localStorage.removeItem(L.KEY + '.photoAsked'); L.render(); }); await wait(200);
    await D.page.setInputFiles('#photoBar input[data-photo]', await pngFile(D.page, 400, 400)); await photoIn(D.page); await wait(150);
    ok((await line(D.page)) === null && (await button(D.page)).photo, '2. a photo added from the line shows in the button and the line goes');
    await D.page.evaluate(() => { const L = window.__ironlog; localStorage.removeItem(L.KEY + '.photoAsked'); L.render(); }); await wait(200);
    ok((await line(D.page)) === null, '2. guards: with a photo kept, the line never shows');
    await D.page.evaluate(() => { const L = window.__ironlog; localStorage.removeItem(L.KEY + '.photo'); localStorage.removeItem(L.KEY + '.installLater'); L.render(); }); await wait(200);
    const two = await D.page.evaluate(() => document.querySelectorAll('.acctbar').length);
    ok(two <= 1, '2. guards: never two lines on Today (the install line comes first)', two);
    ok(!D.errors.length, '2. no page errors', D.errors);
    await D.browser.close();
    const O = await app({ auth: SIGNED_OUT });
    await wait(400); await O.page.evaluate(() => window.__ironlog.render()); await wait(200);
    ok((await line(O.page)) === null && !!(await O.page.evaluate(() => document.getElementById('acctBar'))), '2. guards: signed out, only the sync line shows, no photo line');
    await O.browser.close();
    const M = await app({ auth: SIGNED_IN });
    await M.page.waitForFunction(() => !!window.__ironlog.acctUser(), null, { timeout: 5000 }).catch(() => {});
    await M.page.evaluate(() => { const L = window.__ironlog; L.makeDemo(); L.render(); }); await wait(300);
    ok((await line(M.page)) === null, '2. guards: not in the demo');
    await M.browser.close();
  } catch (e) { ok(false, '2. the section stopped', String(e).slice(0, 300)); }

  if (run(3)) try {
    for (const dark of [false, true]) {
      const D = await app({ demo: true, dark, theme: dark ? 'dark' : 'light' });
      const pg = D.page, th = dark ? 'dark' : 'light';
      const g = await pg.evaluate(() => {
        const L = window.__ironlog;
        const gr = document.getElementById('holoG');
        const stops = gr ? [...gr.querySelectorAll('stop')].map(s => getComputedStyle(s).stopColor) : [];
        const root = getComputedStyle(document.documentElement);
        const tok = [1, 2, 3, 4].map(i => root.getPropertyValue('--holo-' + i).trim());
        const rp = document.querySelector('.hero .ring .rp');
        const wk = document.querySelector('#wkbar');
        return { stops, tok, ring: rp ? getComputedStyle(rp).stroke : null, start: (() => { const b = document.querySelector('.hero [data-act="startSession"]'); return b ? getComputedStyle(b).backgroundImage : null; })() };
      });
      const rgb = h => { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
      ok(g.stops.length === 4 && g.stops.every((s, i) => s === rgb(g.tok[i])), `3. (${th}) the page's progress gradient takes its four colours from the stylesheet's tokens`, g);
      ok(/url\(.*#holoG.*\)/.test(g.ring || ''), `3. (${th}) Today's week ring is drawn with it`, g.ring);
      ok(g.start === 'none', `3. (${th}) guards: Start session keeps the accent, no gradient`, g.start);
      // The week's hard sets bar, sized to the whole track.
      await pg.evaluate(() => { document.querySelectorAll('#view details.sec').forEach(d => { if (!d.open) d.querySelector('summary').click(); }); }); await wait(300);
      const bar = await pg.evaluate(() => { const f = document.querySelector('.band .fill.prog'); if (!f) return null; const s = getComputedStyle(f); return { img: s.backgroundImage, size: s.backgroundSize, w: f.getBoundingClientRect().width, track: f.parentElement.getBoundingClientRect().width }; });
      // The size is a share of the fill's own width: that share of the fill is the whole track.
      ok(bar && /linear-gradient/.test(bar.img) && /%/.test(bar.size) && Math.abs((parseFloat(bar.size) / 100) * bar.w - bar.track) < 2, `3. (${th}) the week's hard sets bar is the gradient, laid over the whole track so a part-full bar shows only the part it reached`, bar);
      const lines = await pg.evaluate(() => [...document.querySelectorAll('svg.mvline')].map(s => { const p = s.querySelector('polyline'), id = (p.getAttribute('stroke') || '').replace(/^url\(#(.*)\)$/, '$1'); const lg = id && s.querySelector('linearGradient#' + id); return { id, own: !!lg, units: lg && lg.getAttribute('gradientUnits'), x2: lg && lg.getAttribute('x2'), w: s.viewBox.baseVal.width }; }));
      ok(lines.length > 0 && lines.every(l => l.own && l.units === 'userSpaceOnUse' && +l.x2 === l.w) && new Set(lines.map(l => l.id)).size === lines.length, `3. (${th}) each line of Lifts moving is drawn with its own gradient across its width, each id unique`, lines);
      // A session's bar and the rest dial.
      await pg.click('.hero [data-act="startSession"]'); await wait(300);
      await pg.evaluate(() => { const i = document.querySelector('[data-f="r"][data-b="0"][data-s="0"]'); i.value = '10'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').click(); }); await wait(500);
      const ses = await pg.evaluate(() => { const f = document.getElementById('sessBar'), t = document.querySelector('#timer .tdial .trp'); return { bar: f ? getComputedStyle(f).backgroundImage : null, dial: t ? getComputedStyle(t).stroke : null, done: (() => { const b = document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]'); return b ? getComputedStyle(b).backgroundImage : null; })() }; });
      ok(/linear-gradient/.test(ses.bar || '') && /url\(.*#holoG.*\)/.test(ses.dial || ''), `3. (${th}) the session's bar and the rest dial are drawn with it`, ses);
      ok(ses.done === 'none', `3. (${th}) guards: a ticked set's button keeps the accent`, ses.done);
      ok(!D.errors.length, `3. (${th}) no page errors`, D.errors);
      await D.browser.close();
    }
    // A flat strength line (the same reading every session) still shows: its gradient is laid over the chart's width.
    const F = await app({});
    const flat = await F.page.evaluate(async () => {
      const L = window.__ironlog; const ss = [];
      for (let i = 0; i < 5; i++) ss.push({ id: 'f' + i, date: L.addDays('2026-11-06', -7 * (4 - i)), dayIdx: 0, dayId: null, dayName: 'A', routineId: '', notes: '', ex: [{ exId: 'bench', sets: [1, 2, 3].map(() => ({ w: 100, r: 8, rir: 2, warm: false, drop: false, done: true })) }] });
      L.state.sessions.push(...ss); L.invalidate && L.invalidate(); L.saveNow(); L.render();
      L.openModal({ kind: 'exhist', exId: 'bench' }); await new Promise(r => setTimeout(r, 300));
      const p = document.querySelector('#modal svg polyline.exh-ln'); if (!p) return null;
      const id = (p.getAttribute('stroke') || '').replace(/^url\(#(.*)\)$/, '$1'), lg = p.ownerSVGElement.querySelector('linearGradient#' + id);
      return { h: p.getBBox().height, id, units: lg && lg.getAttribute('gradientUnits'), x2: lg && +lg.getAttribute('x2'), w: p.ownerSVGElement.viewBox.baseVal.width };
    });
    ok(flat && flat.h === 0 && flat.units === 'userSpaceOnUse' && flat.x2 === flat.w, '3. a flat strength line in the exercise sheet is drawn with a gradient across the chart, so it still shows', flat);
    // Every accent: the gradient is the same, the accent stays the accent's.
    const acc = await F.page.evaluate(() => { const L = window.__ironlog; const out = []; for (const a of ['ember', 'blue', 'volt', 'pink', 'violet', 'cyan', 'red']) { L.state.settings.accent = a; L.ACT.mClose && L.ACT.mClose(); L.render(); document.documentElement.dataset.accent = a; const r = getComputedStyle(document.documentElement); out.push([a, r.getPropertyValue('--holo').trim()]); } return out; });
    ok(acc.every(x => x[1] && x[1] === acc[0][1]), '3. the gradient is the same in every accent', acc);
    await F.browser.close();
  } catch (e) { ok(false, '3. the section stopped', String(e).slice(0, 300)); }

  if (run(4)) try {
    const D = await app({ demo: true });
    const pg = D.page;
    // History: every row drawn says its counted PRs, and only those.
    const h = await pg.evaluate(async () => {
      const L = window.__ironlog; L.ui.tab = 'history'; L.render(); await new Promise(r => setTimeout(r, 200));
      const I = L.IDX(), cnt = {};
      for (const p of I.prs) if (p.big) cnt[p.sid] = (cnt[p.sid] || 0) + 1;
      return [...document.querySelectorAll('#view .hitem')].map(it => { const id = it.querySelector('[data-act="histToggle"]').dataset.id; const t = it.querySelector('.prb'); return { id, want: cnt[id] || 0, said: t ? t.getAttribute('aria-label') : null, gold: t ? getComputedStyle(t).backgroundColor : null, text: t ? t.innerText.trim() : null }; });
    });
    const rightN = h.filter(r => r.want ? r.said === `${r.want} ${r.want === 1 ? 'PR' : 'PRs'} smashed` && r.gold === 'rgb(255, 197, 61)' && r.text === '' : r.said === null);
    ok(h.length > 0 && rightN.length === h.length && h.some(r => r.want > 0), '4. History marks each session that had counted PRs with a gold cup named "N PRs smashed" (no added text on screen), the same PRs Today and Stats count', h.filter(r => !rightN.includes(r)).slice(0, 5));
    // A session with no PR says none (a lift done lighter than ever).
    const none = await pg.evaluate(async () => {
      const L = window.__ironlog; L.state.sessions.push({ id: 'np', date: '2026-11-07', dayIdx: 0, dayId: null, dayName: 'Light', routineId: '', notes: '', ex: [{ exId: L.state.sessions[0].ex[0].exId, sets: [{ w: 5, r: 5, rir: 4, warm: false, drop: false, done: true }] }] });
      L.invalidate && L.invalidate(); L.render(); await new Promise(r => setTimeout(r, 200));
      const b = document.querySelector('#view [data-act="histToggle"][data-id="np"]'); return b ? !b.closest('.hitem').querySelector('.prb') : null;
    });
    ok(none === true, '4. guards: a session with no PR says none', none);
    // Opened, each lift that had a counted PR is marked, and only those.
    const open1 = await pg.evaluate(async () => {
      const L = window.__ironlog; const I = L.IDX();
      const s = [...L.state.sessions].filter(x => I.prs.some(p => p.big && p.sid === x.id)).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
      L.ui.histOpen = s.id; L.render(); await new Promise(r => setTimeout(r, 200));
      const want = s.ex.filter(b => I.prs.some(p => p.big && p.sid === s.id && p.exId === b.exId)).map(b => L.exName(b.exId)).sort();
      const it = document.querySelector(`#view [data-act="histToggle"][data-id="${s.id}"]`).closest('.hitem');
      const got = [...it.querySelectorAll('.panel p.hpr')].map(p => p.querySelector('b').innerText.trim()).sort();
      const bar = it.querySelector('.panel p.hpr'); const bs = bar && getComputedStyle(bar, '::before');
      return { want, got, gold: bs ? bs.backgroundColor : null, tok: getComputedStyle(document.documentElement).getPropertyValue('--gold').trim() };
    });
    ok(open1.want.length > 0 && open1.want.join() === open1.got.join(), '4. an opened session marks each lift that had a counted PR, and only those', open1);
    // Today's preview: "PR last time" is gold.
    const today = await pg.evaluate(async () => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.histOpen = null; L.render(); document.querySelectorAll('#view details.sec').forEach(d => { if (!d.open) d.querySelector('summary').click(); }); await new Promise(r => setTimeout(r, 200)); const t = [...document.querySelectorAll('#view .tag')].filter(x => x.innerText.trim() === 'PR last time'); return { n: t.length, gold: t.every(x => x.classList.contains('gold')) }; });
    ok(today.n > 0 && today.gold, '4. Today\'s "PR last time" is gold, as every PR is', today);
    // A ticked set that is a PR has a gold bar beside it.
    await pg.click('.hero [data-act="startSession"]'); await wait(300);
    const sg = await pg.evaluate(async () => {
      const L = window.__ironlog; const b = L.state.draft.ex[0]; const ex = L.EX(b.exId);
      const best = Math.max(...L.state.sessions.flatMap(s => s.ex.filter(x => x.exId === b.exId).flatMap(x => x.sets.map(y => +y.w || 0))));
      const set = (f, v) => { const i = document.querySelector(`[data-f="${f}"][data-b="0"][data-s="0"]`); i.value = String(v); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); };
      // The log keeps kg; the field takes the unit on screen.
      set('w', Math.round(L.toD(best)) + 5); set('r', 12); document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').click();
      await new Promise(r => setTimeout(r, 400));
      const ok2 = document.querySelector('#modal [data-act="mOk"]'); if (ok2) { ok2.click(); await new Promise(r => setTimeout(r, 300)); }
      const row = document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').closest('.sg');
      const bs = getComputedStyle(row, '::before');
      const r2 = document.querySelector('[data-act="sDone"][data-b="0"][data-s="1"]').closest('.sg');
      return { pr: row.classList.contains('pr'), content: bs.content, bg: bs.backgroundColor, other: getComputedStyle(r2, '::before').content, name: ex.name };
    });
    ok(sg.pr && sg.content !== 'none' && /rgb\(255, 197, 61\)/.test(sg.bg), '4. a ticked set that is a PR has a gold bar beside it', sg);
    ok(sg.other === 'none', '4. guards: a set that is not a PR has none', sg.other);
    ok(!D.errors.length, '4. no page errors', D.errors);
    await D.browser.close();
  } catch (e) { ok(false, '4. the section stopped', String(e).slice(0, 300)); }

  if (run(5)) try {
    for (const dark of [false, true]) {
      const D = await app({ w: 320, auth: SIGNED_IN, dark, theme: dark ? 'dark' : 'light' });
      const pg = D.page, th = dark ? 'dark' : 'light';
      await pg.waitForFunction(() => !!window.__ironlog.acctUser(), null, { timeout: 5000 }).catch(() => {});
      await pg.evaluate(() => window.__ironlog.render()); await wait(200);
      const fit = () => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
      const tgt = sel => pg.evaluate(s => [...document.querySelectorAll(s)].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), sel);
      const bar = await tgt('#photoBar .btn, #photoBar .ib');
      ok(bar.length === 2 && (await fit()), `5. (${th}) at 320 px Today's photo line fits, with no sideways scroll`, bar);
      ok(bar.length === 2 && bar.every(([w, h]) => w >= 44 && h >= 44), `5. (${th}) its Add photo and Not now are 44 px targets`, bar);
      await pg.click('#saveState'); await wait(200);
      const menu = await tgt('#modal #menuPhoto .btn');
      ok(menu.length >= 1 && menu.every(([w, h]) => w >= 44 && h >= 44) && (await fit()), `5. (${th}) the menu's photo row fits at 320 px, its buttons 44 px targets`, menu);
      await pg.setInputFiles('#modal #menuPhoto input[data-photo]', await pngFile(pg, 500, 500)); await photoIn(pg);
      const btn = await tgt('#saveState');
      ok(btn[0] && btn[0][0] >= 34 && (await fit()), `5. (${th}) with a photo, the header still fits at 320 px`, btn);
      ok(!D.errors.length, `5. (${th}) no page errors`, D.errors);
      await D.browser.close();
    }
  } catch (e) { ok(false, '5. the section stopped', String(e).slice(0, 300)); }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
