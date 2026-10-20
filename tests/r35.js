// r35 (V, 2026-10-11): the clean-up V chose after r34.2 went live. One change
// number on a lift (not two that disagree), one way to start (Start, and
// Change for the rest), no card asking grey or filled in, Settings' Demo data,
// Diagnostics and Erase in one More group, an easy set answered with more reps
// when no heavier load fits, and a superset made in a session kept in the plan
// from the recap. Runs on the source and again on dist/ (tests/run.js).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = 'index.html';

(async () => {
  const { engine } = require('./h');
  const browser = await engine.launch();
  for (const dark of [false, true]) {
    const T = dark ? ' (dark)' : ' (light)';
    const P = await open(FILE, { browser, touch: true, dark, w: 375, h: 760, clock: '2026-10-11T12:00:00' });
    const ev = (f, a) => P.page.evaluate(f, a);
    const LB = 0.45359237;

    // ---------- 1. One change number on a lift ----------
    const lift = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'lb';
      s.sessions = [0, 1, 2, 3, 4].map(i => ({ id: 'l' + i, date: L.addDays('2026-09-06', i * 7), dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: (180 + i * 5) * LB, r: 8, rir: 1, done: true })) }] }));
      s.draft = null; L.state = L.normalize(s); L.invalidate(); L.ui.tab = 'dash'; L.ui.dashEx = 'bench'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true);
      const sec = document.querySelector('#view [data-mkey="exercise"]'); const labels = [...sec.querySelectorAll('.kpi .l')].map(x => x.textContent); const tile = [...sec.querySelectorAll('.kpi')].find(k => /^Change/.test(k.querySelector('.l').textContent));
      return { labels, v: tile ? tile.querySelector('.v').textContent : null, pct: L.IDX().exStats.bench.pct, head: sec.innerText };
    });
    // Since r41 the change is said once, on the headline in loads, with the percentage behind its i; no tile repeats it.
    const tipOf = await ev(() => { const h = document.querySelector('#view [data-mkey="exercise"] .headline [data-tip]'); return h ? h.dataset.tip : ''; });
    ok(!lift.labels.some(l => /Change|trend|Fitted/i.test(l)), 'Stats > Lifts: no change tile and no "fitted trend" tile beside the headline' + T, lift.labels);
    ok(/^Est\. 1RM up about \d+ lb over \d weeks/.test(lift.head.split('\n').find(l => /^Est\. 1RM /.test(l)) || '') && tipOf.includes(`Change +${Math.round(lift.pct * 10) / 10}%`), 'one change number: the headline in pounds, the same change as a percentage behind its i (' + Math.round(lift.pct * 10) / 10 + '%)' + T, { head: lift.head.slice(0, 300), tipOf });

    // ---------- 2. One way to start ----------
    const card = await ev(() => {
      const L = window.__ironlog; const s = L.state; s.sessions = []; s.draft = null; delete s.settings.todayStart; L.state = L.normalize(s); L.invalidate(); L.ui.todayDay = null; L.ui.tab = 'today'; L.render();
      const h = document.querySelector('.hero'); return { starts: h.querySelectorAll('[data-act="startSession"],[data-act="startShort"],[data-act="startFree"],[data-act="pickToday"]').length, primary: !!h.querySelector('.btn.primary[data-act="startSession"]'), change: !!h.querySelector('[data-act="startAltOpen"]'), select: !!h.querySelector('select') };
    });
    ok(card.starts === 1 && card.primary && card.change && !card.select, 'the Today card has one Start and a Change button, no list of starts or day select' + T, card);
    await ev(() => document.querySelector('.hero [data-act="startAltOpen"]').click()); await wait(80);
    const sheet = await ev(() => { const m = document.getElementById('modal'); return { title: m.querySelector('h3').textContent, opts: [...m.querySelectorAll('.ob-opt b')].map(b => b.textContent), days: [...m.querySelectorAll('[data-act="dayPick"]')].map(b => b.innerText.replace(/\s+/g, ' ')), cur: m.querySelectorAll('[data-act="dayPick"][aria-current="true"]').length, wide: document.documentElement.scrollWidth <= innerWidth, h: Math.min(...[...m.querySelectorAll('button')].map(b => b.getBoundingClientRect().height)) }; });
    ok(sheet.title === 'Start something else' && sheet.opts.join('|') === 'Lighter day|Short on time|Blank session|Pick for me' && sheet.days.length >= 3 && sheet.cur === 1, 'Change: Lighter day, Short on time, Blank session, Pick for me, and the plan\'s days with today\'s marked' + T, sheet);
    ok(sheet.wide && sheet.h >= 44, 'the Change sheet fits the screen with 44 px buttons' + T, sheet.h);
    // Another day: the card shows it.
    const other = await ev(async () => { const L = window.__ironlog; const b = document.querySelectorAll('#modal [data-act="dayPick"]')[2]; b.click(); await new Promise(r => setTimeout(r, 80)); return { modal: !!L.ui.modal, day: document.querySelector('.hero').dataset.day, td: L.ui.todayDay }; });
    ok(!other.modal && other.day === '2' && other.td === 2, 'a day picked in Change is the day on the card' + T, other);
    // A blank session from Change starts it and closes the sheet.
    await ev(() => document.querySelector('.hero [data-act="startAltOpen"]').click()); await wait(60);
    await ev(() => document.querySelector('#modal [data-go="startFree"]').click()); await wait(120);
    const bl = await ev(() => { const L = window.__ironlog; return { free: !!(L.state.draft && L.state.draft.free), modal: L.ui.modal && L.ui.modal.kind }; });
    ok(bl.free && bl.modal !== 'startAlt', 'Blank session from Change starts a freestyle session' + T, bl);
    // A lighter day from Change starts the day, lighter.
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.ui.todayDay = null; if (L.ui.modal) L.ACT.mClose(); L.render(); document.querySelector('.hero [data-act="startAltOpen"]').click(); });
    await wait(60);
    await ev(() => document.querySelector('#modal [data-go="startSession"][data-light="1"]').click()); await wait(120);
    const lt = await ev(() => { const L = window.__ironlog; const d = L.state.draft; return d ? { light: !!d.light, name: d.dayName } : null; });
    ok(lt && lt.light, 'Lighter day from Change starts the day as a lighter day' + T, lt);
    // Blank-session mode: Change has the plan's day first.
    const fm = await ev(async () => { const L = window.__ironlog; L.state.draft = null; L.state.settings.todayStart = 'free'; L.ui.todayDay = null; L.render(); const h = document.querySelector('.hero'); const one = h.querySelectorAll('[data-act="startFree"]').length; h.querySelector('[data-act="startAltOpen"]').click(); await new Promise(r => setTimeout(r, 60)); const o = [...document.querySelectorAll('#modal .ob-opt b')].map(b => b.textContent); L.ACT.mClose(); delete L.state.settings.todayStart; return { one, o }; });
    ok(fm.one === 1 && /^Plan: /.test(fm.o[0]) && fm.o.includes('Pick for me') && !fm.o.includes('Blank session'), 'with Today starting blank: one Start, and Change offers the plan\'s day first' + T, fm);

    // ---------- 3. No card asking grey or filled in ----------
    const ask = await ev(() => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; delete s.settings.loadFill; try { localStorage.removeItem(L.KEY + '.loadAsk'); } catch (e) { /* none */ }
      const R = L.activeRoutine(); const ids = R.days[0].items.map(i => i.exId);
      s.sessions = [{ id: 'g1', date: '2026-10-04', dayIdx: 0, dayId: R.days[0].id, dayName: R.days[0].name, routineId: R.id, notes: '', ex: ids.map(id => ({ exId: id, sets: [{ w: 50 * LB, r: 10, rir: 1, done: true }] })) }];
      s.draft = null; L.state = L.normalize(s); L.invalidate(); L.ui.todayDay = 0; L.render(); document.querySelector('.hero [data-act="startSession"]').click();
      const d = L.state.draft; return { card: !!document.getElementById('loadAsk'), sw: d.ex.some(b => b.sw != null), fillSetting: !!document.querySelector('[data-bind="loadFill"]') || true };
    });
    ok(ask.sw && !ask.card, 'a session with suggested loads has no card asking grey or filled in' + T, ask);
    const setFill = await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); return !!document.querySelector('input[data-bind="loadFill"]'); });
    ok(setFill, 'Fill in suggested loads is still in Settings for anyone who wants it' + T);

    // ---------- 4. Settings: Demo data, Diagnostics and Erase in one More group at the bottom ----------
    const st = await ev(() => { const keys = [...document.querySelectorAll('#view details.sec')].map(d => d.dataset.mkey); const more = document.querySelector('#view [data-mkey="more"]'); return { keys, last: keys[keys.length - 1], has: more ? more.querySelectorAll('[data-act="demoLoad"],[data-act="demoClear"]').length === 1 && /Version \d/.test(more.textContent) && !!more.querySelector('[data-act="resetAll"]') : false, wide: document.documentElement.scrollWidth <= innerWidth }; });
    // Since r55 (V, 2026-10-19) Demo data is one button, Load or Clear, and Diagnostics shows the version until an error is logged (tests/r55.js).
    ok(st.last === 'more' && !st.keys.some(k => ['demo', 'reset', 'diag'].includes(k)) && st.has && st.wide, 'Settings ends with one More group holding Demo data, the version and Erase everything' + T, st);

    // ---------- 5. An easy set with no heavier load that fits: more reps at the same load ----------
    const easy = await ev(async () => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.settings.unit = 'lb'; s.settings.autoDone = false; delete s.settings.gym;
      s.sessions = [{ id: 'c1', date: '2026-10-04', dayIdx: 0, dayId: null, dayName: 'T', routineId: '', notes: '', ex: [{ exId: 'dbCurl', rr: [8, 12], sets: [0, 1, 2].map(() => ({ w: 20 * LB, r: 9, rir: 1, done: true })) }] }];
      s.draft = null; L.state = L.normalize(s); L.invalidate(); L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose();
      const d = L.state.draft; d.ex.push(L.newBlock('dbCurl', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 60, inc: 5 * LB }, {})); L.saveNow(); L.ui.tab = 'today'; L.render();
      const b = d.ex[0]; const sw = Math.round(b.sw / LB);
      const inp = document.querySelector('[data-f="r"][data-b="0"][data-s="0"]'); inp.value = '10'; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
      b.sets[0].rir = 3; document.querySelector('[data-act="sDone"][data-b="0"][data-s="0"]').click(); await new Promise(r => setTimeout(r, 120));
      return { sw, adj: b.adj ? { w: Math.round(b.adj.w / LB), from: Math.round(b.adj.from / LB), r: b.adj.r } : null, line: (document.getElementById('adj-0') || {}).innerText || '', rph: [...document.querySelectorAll('[data-f="r"][data-b="0"]')].map(i => i.value || i.placeholder), wph: [...document.querySelectorAll('[data-f="w"][data-b="0"]')].map(i => i.value || i.placeholder) };
    });
    // 20 x 10 at 3 in reserve: 13 to failure, Epley 28.7; 12 reps at 1 in reserve wants 20.5, under the next dumbbell (25), so the same 20 for 12.
    ok(easy.sw === 20 && easy.adj && easy.adj.w === 20 && easy.adj.from === 20 && easy.adj.r === 12, 'curls 20 x 10 at 3 in reserve (target 1), no heavier dumbbell fits: the next sets aim for 12 at 20' + T, easy);
    ok(/Next sets: 12 reps at 20 lb/.test(easy.line) && /3 in reserve, against a target of 1/.test(easy.line) && /Keep as it was/.test(easy.line), 'the line says 12 reps at 20 lb, why, and Keep as it was' + T, easy.line);
    ok(easy.rph[1] === '12' && easy.rph[2] === '12' && easy.wph.slice(1).every(v => v === '20'), 'grey reps under it read 12, loads stay 20' + T, easy);
    const kept = await ev(async () => { document.querySelector('[data-act="adjKeep"][data-b="0"]').click(); await new Promise(r => setTimeout(r, 80)); const b = window.__ironlog.state.draft.ex[0]; return { adj: !!b.adj, r1: (document.querySelector('[data-f="r"][data-b="0"][data-s="1"]') || {}).placeholder }; });
    ok(!kept.adj && kept.r1 !== '12', 'Keep as it was puts the grey reps back' + T, kept);

    // ---------- 6. A superset made in a session, kept in the plan from the recap ----------
    const ss = await ev(async () => {
      const L = window.__ironlog; const LB = 0.45359237; const s = L.state; s.sessions = []; s.draft = null; L.state = L.normalize(s); L.invalidate(); L.ui.todayDay = 0; L.ui.tab = 'today'; L.render();
      const R = L.activeRoutine(); const day = R.days[0]; day.items.forEach(i => { i.ss = null; });
      document.querySelector('.hero [data-act="startSession"]').click(); await new Promise(r => setTimeout(r, 100));
      const d = L.state.draft; const a = d.ex[0].exId, c = d.ex[2].exId;
      L.moveBlock(2, 1); // the third exercise next to the first, then linked from the ⋯ menu
      L.ACT.bMenuDo({ dataset: { op: 'bSs', b: '0' } }); await new Promise(r => setTimeout(r, 60));
      const linked = !!d.ex[0].plan.ss && d.ex[0].plan.ss === d.ex[1].plan.ss;
      for (const bi of [0, 1]) d.ex[bi].sets.forEach(x => { x.w = 40 * LB; x.r = 10; x.rir = 1; x.done = true; });
      L.saveNow(); L.ACT.finish(); await new Promise(r => setTimeout(r, 120));
      for (let k = 0; k < 4 && L.ui.modal && L.ui.modal.kind === 'confirm'; k++) { L.ACT.mOk(); await new Promise(r => setTimeout(r, 120)); }
      const m = L.ui.modal; const txt = document.getElementById('modal') ? document.getElementById('modal').innerText : '';
      const offer = !!(m && m.kind === 'recap' && m.upd && m.upd.ss && m.upd.ss.length === 1);
      if (offer) { L.ACT.applyUpd(); await new Promise(r => setTimeout(r, 80)); }
      const items = L.activeRoutine().days[0].items; const ia = items.findIndex(i => i.exId === a), ic = items.findIndex(i => i.exId === c);
      return { linked, offer, txt: (txt.match(/superset[^\n.]*/i) || [''])[0], adjacent: ic === ia + 1, same: !!items[ia].ss && items[ia].ss === items[ic].ss, n: items.length };
    });
    ok(ss.linked && ss.offer && /superset/i.test(ss.txt), 'a superset made in the session is offered at Finish: "' + ss.txt + '"' + T, ss);
    ok(ss.adjacent && ss.same, 'Update puts the pair side by side in the plan, linked' + T, ss);
    ok(!P.errors.length, 'no page errors' + T, P.errors);
    await P.ctx.close().catch(() => {});
  }
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
