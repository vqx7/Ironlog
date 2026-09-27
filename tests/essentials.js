// r20 essentials: accent colour (blue by default, three choices, remembered),
// the optional name greeting, ready-made routines (first run and Plan), the
// − Set safeguard for rows with reps typed, auto-mark accepting the grey
// suggestion on Next, prefilled targets still in place, RIR blanks.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
(async () => {
  // ---- Accent.
  const A = await open('index.html', { touch: true, w: 390, h: 844, clock: '2026-09-24T18:00:00' });
  let ev = (f, a) => A.page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.ui.tab = 'today'; L.render(); });
  const acc = () => ev(() => ({ a: document.documentElement.dataset.accent, v: getComputedStyle(document.documentElement).getPropertyValue('--volt').trim().toLowerCase(), btn: getComputedStyle(document.querySelector('.hero .btn.primary')).backgroundColor }));
  let x = await acc();
  ok(x.a === 'blue' && x.v === '#2a63f5' && x.btn === 'rgb(42, 99, 245)', 'blue is the default accent, on the Start button too', x);
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:general'] = true; L.render(); });
  ok(await ev(() => document.querySelectorAll('[data-act="accent"]').length === 3 && document.querySelector('[data-act="accent"][data-v="blue"]').classList.contains('on')), 'Settings > General offers Blue, Volt and Ember, Blue selected');
  await A.page.click('[data-act="accent"][data-v="ember"]'); await A.page.waitForTimeout(100);
  x = await acc().catch(() => ({}));
  ok((await ev(() => document.documentElement.dataset.accent)) === 'ember' && (await ev(() => getComputedStyle(document.documentElement).getPropertyValue('--volt').trim().toLowerCase())) === '#ff6a2b', 'picking Ember switches the accent at once');
  await A.page.reload(); await A.page.waitForFunction(() => window.__ironlog);
  ok((await ev(() => document.documentElement.dataset.accent)) === 'ember' && (await ev(() => window.__ironlog.state.settings.accent)) === 'ember', 'the choice is kept (and synced with the rest of Settings)');
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:general'] = true; L.render(); });
  await A.page.click('[data-act="accent"][data-v="blue"]'); await A.page.waitForTimeout(100);
  ok(await ev(() => window.__ironlog.state.settings.accent === undefined && document.documentElement.dataset.accent === 'blue'), 'back to Blue stores nothing extra (the default)');
  // Blue accent: "above target" turns violet so it never looks like "done".
  ok(await ev(() => getComputedStyle(document.documentElement).getPropertyValue('--blue').trim().toLowerCase() === '#b69cff'), 'with blue, the above-target colour is violet');

  // ---- Name.
  await A.page.fill('[data-bind="userName"]', '  Vee  '); await A.page.dispatchEvent('[data-bind="userName"]', 'change'); await A.page.waitForTimeout(100);
  ok(await ev(() => window.__ironlog.state.settings.userName === 'Vee'), 'the name is saved, trimmed');
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
  ok(/Evening, Vee/.test(await ev(() => (document.querySelector('.hero .hello') || {}).textContent || '')), 'Today greets by name');
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); });
  await A.page.fill('[data-bind="userName"]', ''); await A.page.dispatchEvent('[data-bind="userName"]', 'change'); await A.page.waitForTimeout(100);
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
  ok(await ev(() => window.__ironlog.state.settings.userName === undefined && !document.querySelector('.hero .hello')), 'clearing it removes the greeting');

  // ---- − Set: a row with reps typed goes with Undo; an empty row goes quietly.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); window.scrollTo(0, 0); });
  await A.page.click('.hero [data-act="startSession"]:not([data-light])'); await A.page.waitForTimeout(200);
  const n = await ev(() => window.__ironlog.state.draft.ex[0].sets.length);
  const lastIdx = n - 1;
  await A.page.fill(`[data-f="r"][data-b="0"][data-s="${lastIdx}"]`, '9'); await A.page.dispatchEvent(`[data-f="r"][data-b="0"][data-s="${lastIdx}"]`, 'change'); await A.page.waitForTimeout(100);
  const minus = () => ev(() => document.querySelector('[data-act="sDel"][data-b="0"]').click());
  await minus(); await A.page.waitForTimeout(150);
  ok((await ev(() => window.__ironlog.state.draft.ex[0].sets.length)) === n - 1 && /Set removed/.test(await ev(() => document.getElementById('toast').innerText)) && !!(await ev(() => document.querySelector('#toast button'))), 'a row with reps typed: removed with an Undo');
  await ev(() => document.querySelector('#toast button').click()); await A.page.waitForTimeout(150);
  ok(await ev(([n, i]) => { const s = window.__ironlog.state.draft.ex[0].sets; return s.length === n && +s[i].r === 9; }, [n, lastIdx]), 'Undo brings the row back with its reps');
  await A.page.fill(`[data-f="r"][data-b="0"][data-s="${lastIdx}"]`, ''); await A.page.dispatchEvent(`[data-f="r"][data-b="0"][data-s="${lastIdx}"]`, 'input'); await A.page.dispatchEvent(`[data-f="r"][data-b="0"][data-s="${lastIdx}"]`, 'change'); await A.page.waitForTimeout(80);
  await minus(); await A.page.waitForTimeout(150);
  ok((await ev(() => window.__ironlog.state.draft.ex[0].sets.length)) === n - 1, 'an empty row (only the suggested load) is removed straight away');

  // ---- Prefilled fields are still there: loads from the target, reps shown grey from last time.
  const pre = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; const w = document.querySelector('[data-f="w"][data-b="0"][data-s="1"]'); const r = document.querySelector('[data-f="r"][data-b="0"][data-s="1"]'); return { w: w.value, rph: r.placeholder, rv: r.value, last: b.lastR }; });
  ok(+pre.w > 0 && pre.rv === '' && +pre.rph === pre.last[1], 'loads come filled from the target; reps show last time\'s number in grey', pre);

  // ---- Auto-mark: Next on an empty reps field takes the grey number and marks the set done.
  await ev(() => { window.__ironlog.state.settings.autoDone = true; });
  await A.page.focus('[data-f="r"][data-b="0"][data-s="1"]'); await A.page.keyboard.press('Enter'); await A.page.waitForTimeout(200);
  const ad = await ev(() => { const s = window.__ironlog.state.draft.ex[0].sets[1]; return { done: s.done, r: s.r }; });
  ok(ad.done && ad.r === pre.last[1], 'auto-mark on: Next on the grey reps logs them and ticks the set', ad);
  await ev(() => { window.__ironlog.state.settings.autoDone = false; });
  await A.page.focus('[data-f="r"][data-b="0"][data-s="2"]'); await A.page.keyboard.press('Enter'); await A.page.waitForTimeout(200);
  ok(!(await ev(() => window.__ironlog.state.draft.ex[0].sets[2].done)), 'auto-mark off: Next only moves on');
  // Typed reps still auto-mark as before.
  await ev(() => { window.__ironlog.state.settings.autoDone = true; });
  await A.page.fill('[data-f="r"][data-b="0"][data-s="2"]', '7'); await A.page.dispatchEvent('[data-f="r"][data-b="0"][data-s="2"]', 'change'); await A.page.waitForTimeout(150);
  ok(await ev(() => window.__ironlog.state.draft.ex[0].sets[2].done), 'auto-mark on: typing reps and leaving still ticks the set');
  // A screen rebuild while the lifter is still typing (a sync, a timer) is not "leaving the field".
  await A.page.fill('[data-f="r"][data-b="1"][data-s="0"]', '8');
  await ev(() => window.__ironlog.render()); await A.page.waitForTimeout(150);
  ok(await ev(() => { const s = window.__ironlog.state.draft.ex[1].sets[0]; return +s.r === 8 && !s.done; }), 'a rebuild mid-typing keeps the reps and does not tick the set');
  await A.page.fill('[data-f="r"][data-b="1"][data-s="0"]', '8'); await A.page.dispatchEvent('[data-f="r"][data-b="1"][data-s="0"]', 'change'); await A.page.waitForTimeout(150);
  ok(await ev(() => window.__ironlog.state.draft.ex[1].sets[0].done), 'leaving the field afterwards ticks it');
  // Leaving an empty reps field accepts the grey number (the iPhone number pad has no Next key).
  const row = (b, s) => ev(([b, s]) => { const x = window.__ironlog.state.draft.ex[b].sets[s]; return { done: !!x.done, r: x.r, last: window.__ironlog.lastRFor(window.__ironlog.state.draft.ex[b], s) }; }, [b, s]);
  const rs = (b, s) => `.sg input[data-f="r"][data-b="${b}"][data-s="${s}"]`;
  const blank = async () => { const p = await ev(() => { const el = [...document.querySelectorAll('#view p, #view h2, #view h3, #view .muted, #view .small')].find(e => !e.closest('button,a,select,label,input,textarea,[data-act],summary') && e.getBoundingClientRect().top > 60 && e.getBoundingClientRect().bottom < innerHeight - 90 && e.getBoundingClientRect().width > 20); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + 4, y: r.top + r.height / 2 }; }); if (p) await A.page.touchscreen.tap(p.x, p.y); return !!p; };
  await ev(() => { window.__ironlog.state.settings.autoDone = true; });
  await A.page.locator(rs(1, 1)).scrollIntoViewIfNeeded(); await A.page.tap(rs(1, 1)); await A.page.waitForTimeout(80);
  await ev(() => document.activeElement.blur()); await A.page.waitForTimeout(150);
  let g = await row(1, 1);
  ok(g.done && g.r === g.last && g.last > 0, 'auto-mark on: keyboard Done on the grey reps logs them and ticks the set', g);
  await A.page.tap(rs(1, 2)); await A.page.waitForTimeout(80);
  await A.page.tap(`.sg input[data-f="w"][data-b="1"][data-s="2"]`); await A.page.waitForTimeout(150);
  ok(!(await row(1, 2)).done, 'moving from reps to the same row\'s load does not tick it');
  const tapped = await blank(); await A.page.waitForTimeout(150);
  ok(tapped && !(await row(1, 2)).done, 'leaving the load field does not tick it either (only reps confirm a set)');
  await A.page.tap(rs(1, 2)); await A.page.waitForTimeout(80);
  await blank(); await A.page.waitForTimeout(150);
  g = await row(1, 2);
  ok(g.done && g.r === g.last, 'a tap on blank space after the grey reps ticks the set', g);
  await A.page.tap(rs(1, 3)).catch(() => {}); await A.page.waitForTimeout(80);
  const has3 = await ev(() => !!document.querySelector('.sg input[data-f="r"][data-b="1"][data-s="3"]'));
  if (has3) {
    await A.page.tap('[data-act="sDone"][data-b="1"][data-s="3"]'); await A.page.waitForTimeout(250);
    g = await row(1, 3);
    ok(g.done && g.r === g.last, 'tapping the row\'s own checkmark from the reps field ticks it once, not on and off', g);
  }
  // A button tap does that button's job and leaves the set alone.
  await ev(() => { const L = window.__ironlog; L.state.draft.ex[2].sets.forEach(x => { x.done = false; x.r = null; }); L.render(); });
  await A.page.locator(rs(2, 0)).scrollIntoViewIfNeeded(); await A.page.tap(rs(2, 0)); await A.page.waitForTimeout(80);
  const n2 = await ev(() => window.__ironlog.state.draft.ex[2].sets.length);
  await A.page.tap('[data-act="sAdd"][data-b="2"]'); await A.page.waitForTimeout(200);
  ok(!(await row(2, 0)).done && (await ev(() => window.__ironlog.state.draft.ex[2].sets.length)) === n2 + 1, 'tapping + Set from an empty reps field adds a set and ticks nothing');
  await ev(() => { window.__ironlog.state.settings.autoDone = false; });
  await A.page.tap(rs(2, 0)); await A.page.waitForTimeout(80); await ev(() => document.activeElement.blur()); await A.page.waitForTimeout(150);
  ok(!(await row(2, 0)).done, 'auto-mark off: leaving the field never ticks');
  // Cardio inside a session: a filled entry goes with an Undo, an empty one quietly.
  await ev(() => { const L = window.__ironlog; L.state.draft.cardio = [{ id: 'c1', kind: 'walk', when: 'after', min: 12, hr: null, note: '' }, { id: 'c2', kind: 'walk', when: 'after', min: null, hr: null, note: '' }]; L.ui.folds['today:scardio'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
  await ev(() => document.querySelector('[data-act="cDraftDel"][data-c="1"]').click()); await A.page.waitForTimeout(120);
  ok(await ev(() => window.__ironlog.state.draft.cardio.length === 1 && !document.querySelector('#toast button')), 'an empty cardio entry is removed without a prompt');
  await ev(() => document.querySelector('[data-act="cDraftDel"][data-c="0"]').click()); await A.page.waitForTimeout(120);
  ok(await ev(() => window.__ironlog.state.draft.cardio.length === 0 && /removed/.test(document.getElementById('toast').innerText) && !!document.querySelector('#toast button')), 'a filled cardio entry is removed with an Undo');
  await ev(() => document.querySelector('#toast button').click()); await A.page.waitForTimeout(150);
  ok(await ev(() => { const c = window.__ironlog.state.draft.cardio; return c.length === 1 && c[0].min === 12; }), 'Undo brings the cardio entry back with its minutes');
  await ev(() => { window.__ironlog.state.draft.cardio = []; window.__ironlog.render(); });
  // A blank RIR is fine: the set still counts as hard (assumed).
  ok(await ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[1]; return s.rir == null && L.isHard(s, L.EX ? L.EX(L.state.draft.ex[0].exId) : undefined); }), 'a set with RIR left blank still counts as a hard set');
  ok(A.errors.length === 0, 'no console errors', A.errors);
  await A.browser.close();

  // ---- Ready-made routines on the first run.
  const F = await open('index.html', { touch: true, w: 390, h: 844 });
  ev = (f, a) => F.page.evaluate(f, a);
  await F.page.waitForTimeout(400);
  await F.page.click('.welcome [data-act="obSample"]'); await F.page.waitForTimeout(200);
  const list = await ev(() => [...document.querySelectorAll('#modal .tpl')].map(b => b.innerText.replace(/\s+/g, ' ')));
  ok(list.length === 6 && /Full body, 3 days/.test(list[0]) && list.every(t => /about \d+ min/.test(t)), 'first run: six ready-made routines, each with days and minutes', list.map(t => t.slice(0, 60)));
  await F.page.click('#modal [data-act="tplPick"][data-k="ul4"]'); await F.page.waitForTimeout(250);
  const r = await ev(() => { const s = window.__ironlog.state; const R = s.routines.find(x => x.id === s.activeRoutineId); return { name: R.name, n: s.routines.length, days: R.days.map(d => d.name), onb: s.settings.onboarded, tab: window.__ironlog.ui.tab, hero: (document.querySelector('.hero h2') || {}).textContent }; });
  ok(r.name === 'Upper / lower, 4 days' && r.n === 1 && r.onb && r.tab === 'today' && /UPPER A/i.test(r.hero), 'picking one makes it the only, active routine and Today is ready', r);
  // In Plan: add another; the same one twice is not duplicated.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.ui.planView = 'routine'; L.ui.folds['program:routine'] = true; L.render(); document.querySelectorAll('#view details').forEach(d => d.open = true); });
  await ev(() => document.querySelector('[data-act="rTemplate"]').click()); await F.page.waitForTimeout(150);
  await F.page.click('#modal [data-act="tplPick"][data-k="ppl6"]'); await F.page.waitForTimeout(200);
  ok(await ev(() => { const s = window.__ironlog.state; return s.routines.length === 2 && s.routines[s.routines.length - 1].name === 'Push / pull / legs, 6 days' && s.routines.find(x => x.id === s.activeRoutineId).name === 'Upper / lower, 4 days'; }), 'Plan: a template is added without replacing the active routine');
  await ev(() => document.querySelector('[data-act="rTemplate"]').click()); await F.page.waitForTimeout(150);
  await F.page.click('#modal [data-act="tplPick"][data-k="ppl6"]'); await F.page.waitForTimeout(200);
  ok(await ev(() => window.__ironlog.state.routines.length === 2) && /already have this routine/.test(await ev(() => document.getElementById('toast').innerText)), 'the same template twice opens the existing one instead');
  // Every template uses only library exercises and, apart from the two lighter ones, meets the default weekly targets.
  const chk = await ev(() => { const L = window.__ironlog; const ids = new Set(L.state.exercises.map(e => e.id)); const b = L.state.settings.bands; const minor = ['serratus', 'rotatorCuff', 'neck', 'tibialis', 'forearms', 'abductors', 'adductors', 'obliques', 'lowerBack', 'traps'];
    return L.TEMPLATES.map(t => { const r = L.routineFromTemplate(t.key); const miss = []; for (const d of r.days) for (const it of d.items) if (!ids.has(it.exId)) miss.push(it.exId); const ps = L.plannedSets(r); const low = Object.keys(ps).filter(m => !minor.includes(m) && ps[m] < b[m][0]); return { k: t.key, miss, low }; }); });
  ok(chk.every(c => !c.miss.length), 'every template exercise exists in the library', chk.filter(c => c.miss.length));
  ok(chk.filter(c => !['full3', 'db3'].includes(c.k)).every(c => !c.low.length), 'upper/lower, PPL, split and high volume meet the default weekly targets', chk);
  const capHit = await ev(() => { const L = window.__ironlog; const out = []; for (const t of L.TEMPLATES) { const r = L.routineFromTemplate(t.key); for (const d of r.days) { if (d.rest) continue; const ms = L.sessionMuscleSets(d); const o = Object.entries(ms).filter(([, v]) => v > 11); if (o.length) out.push(t.key + ' ' + d.name); } } return out; });
  ok(capHit.every(x => x.startsWith('onemuscle ')), 'no ready-made day passes 11 sets for one muscle, apart from the high-volume one, which says so', capHit);
  ok(await ev(() => /pass 11 sets/.test(window.__ironlog.TEMPLATES.find(t => t.key === 'onemuscle').who)), 'the high-volume template says it passes the per-session flag');
  // A new routine has no history: the load typed on set 1 fills the empty rows below.
  await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); window.scrollTo(0, 0); });
  await F.page.click('.hero [data-act="startSession"]:not([data-light])'); await F.page.waitForTimeout(200);
  const W = (s) => `.sg input[data-f="w"][data-b="0"][data-s="${s}"]`;
  const loads = () => ev(() => [...document.querySelectorAll('.sg input[data-f="w"][data-b="0"]')].map(i => i.value));
  ok((await loads()).every(v => v === ''), 'no history: the load fields start empty');
  await F.page.fill(W(0), '10'); await F.page.dispatchEvent(W(0), 'change'); await F.page.waitForTimeout(80);
  ok((await loads()).every(v => v === '10'), 'the load on set 1 fills the empty rows below', await loads());
  await F.page.fill(W(0), '100'); await F.page.dispatchEvent(W(0), 'change'); await F.page.waitForTimeout(80);
  ok((await loads()).every(v => v === '100'), 'correcting set 1 corrects the rows it filled', await loads());
  await F.page.fill(W(2), '95'); await F.page.dispatchEvent(W(2), 'change'); await F.page.waitForTimeout(80);
  await F.page.fill(W(1), '8'); await F.page.dispatchEvent(W(1), 'change'); await F.page.fill(W(1), '8'); await F.page.waitForTimeout(40);
  await F.page.fill(`.sg input[data-f="r"][data-b="0"][data-s="1"]`, '8'); await F.page.dispatchEvent(`.sg input[data-f="r"][data-b="0"][data-s="1"]`, 'change');
  await F.page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await F.page.waitForTimeout(120);
  await F.page.fill(W(0), '105'); await F.page.dispatchEvent(W(0), 'change'); await F.page.waitForTimeout(80);
  const L3 = await loads();
  ok(L3[0] === '105' && L3[1] === '8' && L3[2] === '95' && L3.slice(3).every(v => v === '105' || v === '95'), 'a row the lifter changed or a done row is never overwritten', L3);
  ok(await ev(() => { const L = window.__ironlog; return L.state.draft.ex[0].sets.every((x, i) => document.querySelector(`.sg input[data-f="w"][data-b="0"][data-s="${i}"]`).value === (x.w == null ? '' : L.fmtW(x.w))); }), 'what the fields show is what is stored');
  ok(F.errors.length === 0, 'no console errors on first run', F.errors);
  await F.browser.close();
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack || e); process.exit(1); });
