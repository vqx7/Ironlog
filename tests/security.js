// Security (r44, V: "make sure the code does not have security flaws, prove it").
// Everything a person can type is put through every screen and sheet as
// markup that would run if it were ever written into the page unescaped:
// names, notes, a routine, its days, a custom exercise, an injury, the
// session in progress, and an import of pasted notes. The suite fails if any
// of it runs, becomes an element, adds an event attribute, or turns into a
// link anywhere but https, mailto or the app itself. It runs on the source
// file and on the standalone build (whose Content Security Policy is a second
// wall; this proves the first one).
const { open } = require('./h'); const { chromium } = require('playwright');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } else console.log('ok  ', m); };
const CLOCK = '2026-10-13T10:00:00';
const wait = ms => new Promise(r => setTimeout(r, ms));
// Each payload names itself, so a hit says which one got through.
const P = ['<img src=x id=pwn1 onerror=__xss=1>', '"><svg id=pwn2 onload=window.__xss=2>', "'><a id=pwn3 href=javascript:window.__xss=3>x</a>", '</textarea><script id=pwn4>window.__xss=4</script>', '${window.__xss=5}'];
const ALL = P.join(' ');

(async () => {
  const browser = await chromium.launch();
  const S = await open('index.html', { browser, clock: CLOCK });
  await S.page.evaluate(p => {
    const L = window.__ironlog; const all = p.join(' '); L.state.settings.onboarded = true; L.makeDemo();
    const s = L.state; s.settings.userName = p[0];
    s.exercises.push({ id: 'xsx', name: p[1], primary: 'chest', secondary: ['triceps'], equip: 'other', bw: false, rare: false, perSide: false, note: all, custom: true });
    const R = L.activeRoutine(); R.name = p[2]; R.days.forEach((d, i) => { if (!d.rest) d.name = p[i % p.length]; });
    const day = R.days.find(d => !d.rest); day.items.unshift({ uid: 'xi1', exId: 'xsx', sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 2.26796185 });
    const ss = s.sessions.filter(x => !x.free).slice(-3);
    for (const x of ss) { x.notes = all; x.dayName = p[3]; x.ex.unshift({ exId: 'xsx', note: all, rr: [8, 12], sets: [{ w: 50, r: 10, rir: 2 }, { w: 50, r: 9, rir: 1 }] }); }
    s.injuries = [{ id: 'xj', m: 'chest', note: all, date: '2026-10-01' }];
    s.cardio.push({ id: 'xc', date: '2026-10-12', kind: 'other', min: 20, note: all });
    s.bodyweights.push({ id: 'xb', date: '2026-10-12', kg: 80, note: all });
    L.state = L.normalize(JSON.parse(JSON.stringify(s))); L.invalidate(); L.saveNow();
  }, P);
  const state = JSON.parse(await S.page.evaluate(() => localStorage.getItem('ironlog.v1')));
  await S.ctx.close();
  ok(JSON.stringify(state).includes('pwn1') && state.settings.userName === P[0], 'the hostile text is stored as typed (nothing to find if it were dropped)');

  for (const file of ['index.html']) {
    const B = await open(file, { browser, clock: CLOCK, state });
    const ev = (f, a) => B.page.evaluate(f, a);
    // Everything wrong on the page now, as a list: an element or attribute from a payload, a link off the app, the flag set.
    const scan = where => ev(w => {
      const out = [];
      if (window.__xss !== undefined) out.push(`${w}: payload ${window.__xss} ran`);
      for (const id of ['pwn1', 'pwn2', 'pwn3', 'pwn4']) if (document.getElementById(id)) out.push(`${w}: element ${id}`);
      for (const el of document.querySelectorAll('*')) {
        for (const a of el.attributes) if (/^on/i.test(a.name)) out.push(`${w}: ${el.tagName.toLowerCase()} ${a.name}`);
        if (el.tagName === 'A' && el.hasAttribute('href')) { const h = el.getAttribute('href'); if (!/^(https:|mailto:|#|LICENSES\.txt$|\.\/|\/)/i.test(h) && h !== '') out.push(`${w}: link ${h.slice(0, 60)}`); }
        if (el.tagName === 'SCRIPT' && el.closest('#view,#modal,#toast')) out.push(`${w}: script in the page`);
      }
      return out;
    }, where);
    const bad = [];
    // The detector itself works: a planted element, attribute and link are each caught.
    await ev(() => document.getElementById('view').insertAdjacentHTML('beforeend', '<span id="pwn1" onclick="1"></span><a id="plant" href="javascript:void 0">x</a>'));
    const caught = await scan('planted');
    await ev(() => { document.getElementById('pwn1').remove(); document.getElementById('plant').remove(); });
    ok(caught.some(x => /element pwn1/.test(x)) && caught.some(x => /onclick/.test(x)) && caught.some(x => /link javascript/.test(x)), 'the scan catches a planted element, event attribute and javascript link', caught);
    const notOpen = [];
    const openAll = () => ev(() => { document.querySelectorAll('details').forEach(d => d.open = true); });
    // Every tab with every section open.
    for (const t of ['today', 'program', 'dash', 'history', 'settings']) {
      await ev(t => { const L = window.__ironlog; L.ui.tab = t; for (const k of Object.keys(L.ui.folds)) delete L.ui.folds[k]; L.ui.dashEx = 'xsx'; L.ui.histOpen = (L.state.sessions[L.state.sessions.length - 1] || {}).id; L.render(); }, t);
      await openAll(); await ev(() => window.__ironlog.render()); await openAll(); await wait(60);
      bad.push(...await scan(t));
    }
    // Sheets that show what was typed.
    const sheets = [
      ['menu', () => { window.__ironlog.ACT.menuOpen(); }],
      ['guide', () => { window.__ironlog.ACT.guideOpen({ dataset: {} }); document.querySelectorAll('#modal details').forEach(d => d.open = true); }],
      ['exercise editor', () => { window.__ironlog.ACT.exEdit({ dataset: { ex: 'xsx' } }); }],
      ['exercise history', () => { window.__ironlog.openModal({ kind: 'exhist', exId: 'xsx' }); }],
      ['goal', () => { window.__ironlog.openModal({ kind: 'goal', exId: 'bench' }); }],
      ['routine picker', () => { window.__ironlog.openModal({ kind: 'templates', from: 'plan' }); }],
      ['injury', () => { window.__ironlog.openModal({ kind: 'injury' }); }],
      ['change day', () => { window.__ironlog.ACT.startAltOpen({ dataset: {} }); }]
    ];
    for (const [name, f] of sheets) {
      await ev(f); await wait(80); if (await ev(() => document.getElementById('modal').hidden)) notOpen.push(name); bad.push(...await scan(name)); await ev(() => { if (window.__ironlog.ui.modal) window.__ironlog.ACT.mClose(); });
    }
    // The session in progress, its exercise menu, and Pick for me.
    await ev(p => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); const R = L.activeRoutine(); const day = R.days.find(d => d.items.some(i => i.exId === 'xsx'));
      L.state.draft = { id: 'dx', date: L.today(), dayIdx: R.days.indexOf(day), dayId: day.id, dayName: day.name, routineId: R.id, notes: p.join(' '), startedAt: Date.now(), ex: day.items.slice(0, 3).map(i => ({ ...L.newBlock(i.exId, { ...i }, {}), note: p.join(' ') })), cardio: [] };
      L.saveNow(); L.render(); }, P);
    await openAll(); await wait(60); bad.push(...await scan('session'));
    for (const [name, f] of [['exercise menu', () => window.__ironlog.ACT.bMenu({ dataset: { b: '0' } })], ['muscles worked', () => window.__ironlog.ACT.bMus({ dataset: { b: '0' } })], ['pick for me', () => window.__ironlog.ACT.pickEx()]]) {
      await ev(f); await wait(80); if (await ev(() => document.getElementById('modal').hidden)) notOpen.push(name); bad.push(...await scan(name)); await ev(() => { if (window.__ironlog.ui.modal) window.__ironlog.ACT.mClose(); });
    }
    // An import of pasted notes whose exercise names are payloads: the preview lists names it does not know.
    await ev(p => window.__ironlog.impStart({ text: `2026-10-01\n${p[0]} 3x10 @ 60\n${p[1]}\n${p[2]} 5x5 100` }), P); await wait(200);
    if (await ev(() => !/pwn/.test(document.getElementById('modal').innerText))) notOpen.push('import preview');
    bad.push(...await scan('import preview'));
    ok(!notOpen.length, 'every sheet listed opened and was scanned, the import preview with the typed names in it', notOpen); await ev(() => { if (window.__ironlog.ui.modal) window.__ironlog.ACT.mClose(); });
    await wait(300);
    ok(!bad.length, `${process.env.IRONLOG_FILE ? 'standalone build' : 'source file'}: on every tab, sheet, the session and an import, typed text never runs, never becomes an element or an event attribute, and no link leads off https`, bad.slice(0, 12));
    const shown = await ev(() => document.getElementById('view').innerText.includes('<img src=x id=pwn1'));
    ok(shown, 'the text shows as typed, as text');
    ok(!B.errors.filter(e => !/net::|Failed to load/.test(e)).length, 'no page errors', B.errors);
    await B.ctx.close();
  }
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
