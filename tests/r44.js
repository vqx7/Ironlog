// r44 (V's go, 2026-10-13): Your training, an optional profile (item 271,
// with 43 focus muscles and 44 the strength focus in Pick for me). V's answers:
// defaults and new items only, the routine in use only through Apply, typed
// targets kept and only the app's own moved, asked on Set up (skippable) and
// in Settings. Expected numbers are worked out here from the rules, not read
// back from the app's own helpers.
const { open } = require('./h'); const { chromium } = require('playwright');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x).slice(0, 400)); } else console.log('ok  ', m); };
const CLOCK = '2026-10-13T10:00:00';
const wait = ms => new Promise(r => setTimeout(r, ms));
// The default weekly targets as shipped (src/11-data.js), copied, so a change there fails here.
const BANDS = { chest: [10, 20], serratus: [2, 8], lats: [10, 20], upperBack: [10, 20], traps: [6, 16], lowerBack: [3, 10], frontDelts: [4, 12], sideDelts: [10, 20], rearDelts: [8, 16], rotatorCuff: [2, 8], biceps: [10, 20], triceps: [10, 20], forearms: [4, 12], abs: [6, 16], obliques: [3, 10], neck: [2, 10], quads: [10, 20], hamstrings: [10, 20], glutes: [8, 16], adductors: [4, 12], abductors: [4, 12], calves: [8, 16], tibialis: [2, 8] };
const TRACK = new Set(['serratus', 'rotatorCuff', 'neck', 'tibialis']);
const focusBand = (m, f) => TRACK.has(m) || !f.length ? BANDS[m] : f.includes(m) ? [Math.round(BANDS[m][0] * 1.3), Math.round(BANDS[m][1] * 1.3)] : [Math.ceil(BANDS[m][0] / 3), BANDS[m][1]];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const browser = await chromium.launch();
  const P = await open('index.html', { browser, clock: CLOCK });
  const ev = (f, a) => P.page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.render(); });

  // ---------- 1. The stored profile ----------
  const cl = await ev(() => { const c = window.__ironlog.profClean; return [c(null), c({}), c([1]), c({ goal: 'x', exp: 'new', days: 7, focus: ['chest', 'chest', 'neck', 'lats', 'quads'], zz: 1 }), c({ focus: [], days: 4, goal: 'both' }), c({ days: '4', exp: 'adv' })]; });
  ok(same(cl, [null, null, null, { exp: 'new', focus: ['chest', 'lats'] }, { goal: 'both', days: 4 }, { exp: 'adv' }]),
    'the profile keeps only known choices, in one key order, at most two focus muscles and no tracked-only one', cl);
  const nz = await ev(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state));
    const a = L.normalize({ ...s, settings: { ...s.settings, profile: { goal: 'nope' } } }); const b = L.normalize({ ...s, settings: { ...s.settings, profile: { days: 3, goal: 'strength' } } });
    return { gone: 'profile' in a.settings, kept: b.settings.profile, fresh: 'profile' in L.normalize(null).settings }; });
  ok(!nz.gone && !nz.fresh && same(nz.kept, { goal: 'strength', days: 3 }), 'nothing valid stores no profile key at all; a valid one is kept, rebuilt in order', nz);

  // ---------- 2. Defaults by profile ----------
  // With no profile the defaults are r43's exactly, for every exercise not in the routine.
  const O = await open('baselines/r43.html', { browser, clock: CLOCK });
  const plansOf = Pg => Pg.evaluate(() => { const L = window.__ironlog; const R = L.activeRoutine(); const inR = new Set(R.days.flatMap(d => d.items.map(i => i.exId)));
    return L.state.exercises.filter(e => !inR.has(e.id)).map(e => [e.id, JSON.stringify(L.planFor(e.id, R))]); });
  const pNew = await plansOf(P.page), pOld = await plansOf(O.page);
  ok(pNew.length > 50 && same(pNew, pOld), 'with no profile every default plan is what r43 gives', [pNew.length, pOld.length]);
  // A profile saved here is kept by r43 (settings keep keys they do not know), so an older phone never drops it.
  const kept = await O.page.evaluate(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); s.settings.profile = { goal: 'strength', exp: 'mid', days: 4, focus: ['chest'] }; return L.normalize(JSON.parse(JSON.stringify(L.normalize(s)))).settings.profile; });
  ok(same(kept, { goal: 'strength', exp: 'mid', days: 4, focus: ['chest'] }), 'r43 keeps the profile through two loads', kept);
  await O.ctx.close();

  const byProfile = p => ev(p => { const L = window.__ironlog; if (p) L.state.settings.profile = p; else delete L.state.settings.profile; L.invalidate();
    return L.state.exercises.map(e => ({ id: e.id, timed: !!e.timed, comp: L.isCompound(e), est: !e.timed && !e.bw && L.isCompound(e) && !L.noE1(e) && ['barbell', 'smith', 'machine'].includes(e.equip) && !['reverseHyper', 'goodMorning', 'gluteBridge'].includes(e.id), plan: L.defPlan(e.id) })); }, p);
  const none = await byProfile(null); const size = await byProfile({ goal: 'size', exp: 'adv', days: 5 });
  ok(same(none.map(x => x.plan), size.map(x => x.plan)), 'Size keeps every default exactly as with no profile');
  const cls = Object.fromEntries(none.map(x => [x.id, x.est]));
  ok(cls.bench && cls.backSquat && cls.deadlift && cls.machPress && cls.machRow && cls.smithSquat && !cls.reverseHyper && !cls.goblet && !cls.dbRow && !cls.kbSwing && !cls.latPulldown && !cls.dbCurl && !cls.pullup && !cls.legExt, 'heavy compounds are barbell, Smith, and machine compounds (machine presses and rows in; goblet squats, dumbbell rows, swings, cables, curls, pull-ups, and leg extensions out)', cls);
  const D = none[0].plan.inc; const DEF = { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: D };
  const chk = (list, f) => list.filter(x => !same(x.plan, f(x)));
  const str = await byProfile({ goal: 'strength', exp: 'mid' });
  const strBad = chk(str, x => x.timed ? { ...DEF, repMin: 30, repMax: 60, rest: 60 } : x.est ? { ...DEF, repMin: 3, repMax: 6, rir: 2, rest: 180 } : DEF);
  ok(!strBad.length && str.filter(x => x.est).length > 5, 'Strength: heavy compounds start at 3 to 6, 2 in reserve, 3 minutes; everything else as before', strBad.slice(0, 3));
  const both = await byProfile({ goal: 'both', exp: 'adv' });
  const bothBad = chk(both, x => x.timed ? { ...DEF, repMin: 30, repMax: 60, rest: 60 } : x.est ? { ...DEF, repMin: 5, repMax: 8, rir: 2, rest: 180 } : DEF);
  ok(!bothBad.length, 'Both: heavy compounds at 5 to 8, 2 in reserve, 3 minutes', bothBad.slice(0, 3));
  const nw = await byProfile({ goal: 'strength', exp: 'new' });
  const nwBad = chk(nw, x => x.timed ? { ...DEF, repMin: 30, repMax: 60, rest: 60 } : { ...DEF, repMin: 8, repMax: 12, rir: x.comp ? 3 : 2 });
  ok(!nwBad.length, 'under a year: 8 to 12 for every exercise, 3 in reserve on compounds and 2 on isolation, whatever the goal', nwBad.slice(0, 3));
  await byProfile(null);

  // ---------- 3. Settings: Your training ----------
  const openSet = () => ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:profile'] = true; L.ui.folds['settings:timer'] = true; L.render(); });
  await openSet();
  const lay = await ev(() => { const g = [...document.querySelectorAll('#view > details.sec')].map(d => d.dataset.mkey);
    return { first: g[0], inProf: !!document.querySelector('[data-mkey="profile"] [data-bind="timeBudget"]'), inTimer: !!document.querySelector('[data-mkey="timer"] [data-bind="timeBudget"]'), sub: document.querySelector('[data-mkey="profile"] .sec-s').textContent }; });
  ok(lay.first === 'profile' && lay.inProf && !lay.inTimer && lay.sub === 'optional', 'Your training is the first group in Settings, with the time budget moved into it, saying optional while empty', lay);
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="goal"][data-v="strength"]');
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="days"][data-v="4"]');
  await P.page.fill('[data-mkey="profile"] [data-bind="timeBudget"]', '70'); await P.page.locator('[data-mkey="profile"] [data-bind="timeBudget"]').blur(); await wait(100);
  const s1 = await ev(() => { const L = window.__ironlog; L.render(); return { p: L.state.settings.profile, tb: L.state.settings.timeBudget, sub: document.querySelector('[data-mkey="profile"] .sec-s').textContent, on: [...document.querySelectorAll('[data-mkey="profile"] .chip.on')].map(c => c.textContent) }; });
  ok(same(s1.p, { goal: 'strength', days: 4 }) && s1.tb === 70 && s1.sub === 'Strength · 4 days · 70 min' && same(s1.on, ['Strength', '4']), 'a tap sets the goal and the days; the minutes are the time budget; the line under the title says them', s1);
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="goal"][data-v="strength"]');
  ok(same(await ev(() => window.__ironlog.state.settings.profile), { days: 4 }), 'a second tap on the goal clears it');

  // ---------- 4. Focus muscles: only the app's own targets move ----------
  await ev(() => { const L = window.__ironlog; L.state.settings.bands.biceps = [12, 18]; L.saveNow(); L.render(); });
  const bands = () => ev(() => JSON.parse(JSON.stringify(window.__ironlog.state.settings.bands)));
  const want = (f, typed) => { const o = {}; for (const m in BANDS) o[m] = typed && typed[m] ? typed[m] : focusBand(m, f); return o; };
  const diff = (got, exp) => Object.keys(BANDS).filter(m => !same(got[m], exp[m])).map(m => [m, got[m], exp[m]]);
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="chest"]');
  let b = await bands(); let toastTxt = await ev(() => document.getElementById('toast').innerText);
  ok(!diff(b, want(['chest'], { biceps: [12, 18] })).length && b.chest[0] === 13 && b.chest[1] === 26 && b.lats[0] === 4, 'chest as focus: 13 to 26 (30% up), the other major muscles at a third of their minimum, a typed target and tracked-only muscles unchanged', diff(b, want(['chest'], { biceps: [12, 18] })));
  ok(/Weekly targets moved for 18 muscles\. Ones you typed stay\./.test(toastTxt) && /Undo/.test(toastTxt), 'it says how many moved, that typed ones stay, with Undo', toastTxt);
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="quads"]');
  b = await bands();
  ok(!diff(b, want(['chest', 'quads'], { biceps: [12, 18] })).length, 'quads added as a second focus', diff(b, want(['chest', 'quads'], { biceps: [12, 18] })));
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="lats"]');
  const third = await ev(() => ({ f: window.__ironlog.state.settings.profile.focus, t: document.getElementById('toast').innerText }));
  ok(same(third.f, ['chest', 'quads']) && /Two at most/.test(third.t), 'a third focus is refused and says why', third);
  // A target typed while focused stays when the focus comes off.
  await ev(() => { const L = window.__ironlog; L.state.settings.bands.glutes = [9, 15]; L.saveNow(); });
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="chest"]');
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="quads"]');
  b = await bands();
  ok(!diff(b, want([], { biceps: [12, 18], glutes: [9, 15] })).length, 'with no focus left, the app\'s targets are the defaults again and both typed ones stay', diff(b, want([], { biceps: [12, 18], glutes: [9, 15] })));
  await ev(() => window.__ironlog.ACT.undo()); await wait(100);
  const un = await ev(() => ({ f: (window.__ironlog.state.settings.profile || {}).focus, q: window.__ironlog.state.settings.bands.quads }));
  ok(same(un.f, ['quads']) && same(un.q, [13, 26]), 'Undo brings the last focus and its target back', un);
  await ev(() => { const L = window.__ironlog; L.state.settings.profile = { days: 4 }; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.saveNow(); L.render(); });
  // From the r44 review: a target typed back to the plain default while a focus is on was typed, and stays.
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="chest"]');
  await ev(() => { const L = window.__ironlog; L.state.settings.bands.lats = [10, 20]; L.saveNow(); });
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="quads"]');
  b = await bands();
  ok(same(b.lats, [10, 20]) && same(b.quads, [13, 26]) && same(b.hamstrings, [4, 20]), 'a target typed back to the usual numbers while a focus is on stays typed', [b.lats, b.quads]);
  // Undo is exact even with a target typed in between (no snapshot of its own), typed through the real field.
  await ev(() => { const L = window.__ironlog; L.ui.folds['settings:bands'] = true; L.render(); });
  await P.page.fill('[data-band="biceps"][data-bi="0"]', '12'); await P.page.locator('[data-band="biceps"][data-bi="0"]').blur();
  await P.page.fill('[data-band="biceps"][data-bi="1"]', '18'); await P.page.locator('[data-band="biceps"][data-bi="1"]').blur(); await wait(100);
  ok(same((await bands()).biceps, [12, 18]), 'the biceps target typed in Weekly set targets', (await bands()).biceps);
  await ev(() => window.__ironlog.ACT.undo()); await wait(100);
  b = await bands(); const pu = await ev(() => window.__ironlog.state.settings.profile);
  ok(same(pu.focus, ['chest']) && same(b.quads, [4, 20]) && same(b.hamstrings, [4, 20]) && same(b.biceps, [12, 18]) && same(b.lats, [10, 20]), 'Undo after a typed target puts back the focus and what it moved, and keeps the typed ones', [pu, b.quads, b.biceps]);
  await ev(() => window.__ironlog.ACT.undo()); await wait(100);
  b = await bands();
  ok(!(await ev(() => (window.__ironlog.state.settings.profile || {}).focus)) && same(b.chest, [10, 20]) && same(b.hamstrings, [10, 20]) && same(b.biceps, [12, 18]), 'a second Undo takes the first focus off with its targets');
  await ev(() => { const L = window.__ironlog; L.state.settings.profile = { days: 4 }; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.saveNow(); });
  // Targets fitted to the routine on a first run stay fitted through a focus on and off.
  const rt = await ev(() => { const L = window.__ironlog; const R = L.routineFromTemplate('full3'); L.state.routines.push(R); const was = L.state.activeRoutineId; L.state.activeRoutineId = R.id; L.fitTargets(R);
    const fit = JSON.parse(JSON.stringify(L.state.settings.bands)); const plan = L.plannedSets(R);
    const p1 = { ...L.state.settings.profile, focus: ['biceps'] }; L.profMoveBands(L.state.settings.profile, p1); L.state.settings.profile = p1; const on = JSON.parse(JSON.stringify(L.state.settings.bands));
    const note = L.planEvidenceNote(plan);
    const p0 = { days: 4 }; L.profMoveBands(p1, p0); L.state.settings.profile = p0; const off = JSON.parse(JSON.stringify(L.state.settings.bands));
    L.state.routines.pop(); L.state.activeRoutineId = was; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.saveNow(); return { fit, on, off, plan, note }; });
  // A fitted routine: every target of the app's is fitted to the plan, as a first-run pick with the focus would make it.
  const onWant = {}; for (const m in BANDS) { const d = focusBand(m, ['biceps']); onWant[m] = TRACK.has(m) || m === 'biceps' ? d : [Math.min(d[0], Math.floor(rt.plan[m] || 0)), d[1]]; }
  // Plan's note names only muscles whose target was brought down to the plan, not ones a focus put at maintenance.
  const noteWant = Object.keys(BANDS).filter(m => !TRACK.has(m) && BANDS[m][0] >= 8 && onWant[m][0] < Math.min(BANDS[m][0], focusBand(m, ['biceps'])[0]) && (rt.plan[m] || 0) < BANDS[m][0]);
  const noteGot = (rt.note.split('in this plan: ')[1] || '').split('. <')[0];
  ok(noteWant.every(m => noteGot.includes(m === 'upperBack' ? 'Upper back' : m.charAt(0).toUpperCase() + m.slice(1, 4))) && (noteGot.match(/ of /g) || []).length === noteWant.length, 'Plan\'s usual-range note lists only targets brought down to the plan, not a focus\'s maintenance', [noteWant, noteGot]);
  // With a target typed while the focus is on, the others still come back fitted (the r44 review).
  const rt2 = await ev(() => { const L = window.__ironlog; const R = L.routineFromTemplate('full3'); L.state.routines.push(R); const was = L.state.activeRoutineId; L.state.activeRoutineId = R.id;
    for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.fitTargets(R); const fit = JSON.parse(JSON.stringify(L.state.settings.bands));
    const p0 = { days: 4 }, p1 = { days: 4, focus: ['chest'] }; L.profMoveBands(p0, p1); L.state.settings.bands.biceps = [12, 20]; L.profMoveBands(p1, p0); const off = JSON.parse(JSON.stringify(L.state.settings.bands));
    L.state.routines.pop(); L.state.activeRoutineId = was; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.saveNow(); return { fit, off }; });
  ok(!diff(rt2.off, { ...rt2.fit, biceps: [12, 20] }).length, 'a target typed while the focus is on stays, and the others still come back to their fitted numbers', diff(rt2.off, { ...rt2.fit, biceps: [12, 20] }));
  ok(same(rt.off, rt.fit) && !diff(rt.on, onWant).length, 'targets fitted to the routine stay fitted with a focus on and come back exactly when it is off', diff(rt.on, onWant));

  // One typed target that happens to equal the plan does not fit the others (the r44 review).
  const co = await ev(() => { const L = window.__ironlog; const R = L.routineFromTemplate('ul4'); L.state.routines.push(R); const was = L.state.activeRoutineId; L.state.activeRoutineId = R.id;
    for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; const plan = L.plannedSets(R); const m0 = Object.keys(L.BANDS).find(m => !L.TRACK_ONLY.has(m) && Math.floor(plan[m] || 0) < L.BANDS[m][0]);
    L.state.settings.bands[m0] = [Math.floor(plan[m0] || 0), L.BANDS[m0][1]];
    const p0 = { days: 4 }, p1 = { days: 4, focus: ['chest'] }; L.profMoveBands(p0, p1); const on = JSON.parse(JSON.stringify(L.state.settings.bands)); L.profMoveBands(p1, p0); const off = JSON.parse(JSON.stringify(L.state.settings.bands));
    L.state.routines.pop(); L.state.activeRoutineId = was; const typed = [Math.floor(plan[m0] || 0), L.BANDS[m0][1]]; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.saveNow(); return { m0, typed, on, off }; });
  const coWant = want([], { [co.m0]: co.typed }), coOn = want(['chest'], { [co.m0]: co.typed });
  ok(!diff(co.on, coOn).length && !diff(co.off, coWant).length, `a typed ${co.m0} target equal to the plan leaves the others unfitted, and chest goes to 13 to 26`, [diff(co.on, coOn), diff(co.off, coWant)]);

  // Typed back to the app's own number, a target is the app's again (no list of typed targets to get stuck in).
  await ev(() => { const L = window.__ironlog; L.state.settings.profile = { days: 4 }; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.saveNow(); L.render(); });
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="chest"]');
  await ev(() => { const L = window.__ironlog; L.state.settings.bands.lats = [7, 20]; L.saveNow(); L.state.settings.bands.lats = [4, 20]; L.saveNow(); });
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="chest"]');
  ok(same((await bands()).lats, [10, 20]), 'a target typed back to the app\'s number moves with the focus again', (await bands()).lats);
  // Targets fitted before r44 recorded the floors count as typed and stay (the safe side), and Default targets brings everything back.
  const old = await ev(() => { const L = window.__ironlog; const R = L.routineFromTemplate('full3'); L.state.routines.push(R); const was = L.state.activeRoutineId; L.state.activeRoutineId = R.id;
    for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.fitTargets(R); const fit = JSON.parse(JSON.stringify(L.state.settings.bands)); const rec = JSON.parse(JSON.stringify(L.state.settings.bandsFit)); delete L.state.settings.bandsFit;
    const p1 = { days: 4, focus: ['chest'] }; L.profMoveBands({ days: 4 }, p1); L.state.settings.profile = p1; const on = JSON.parse(JSON.stringify(L.state.settings.bands));
    L.ui.tab = 'settings'; L.ui.folds['settings:bands'] = true; L.render(); return { was, rid: R.id, fit, rec, on }; });
  const keptOld = Object.keys(BANDS).filter(m => !TRACK.has(m) && !same(old.fit[m], BANDS[m]));
  ok(keptOld.length > 3 && keptOld.every(m => same(old.on[m], old.fit[m])) && Object.keys(old.rec).length === keptOld.length && keptOld.every(m => old.rec[m] === old.fit[m][0]), 'fitTargets records each floor it set; without that record, fitted targets count as typed and stay', keptOld);
  await P.page.click('[data-act="bandsDefault"]'); await wait(80);
  const dt = await ev(() => ({ b: JSON.parse(JSON.stringify(window.__ironlog.state.settings.bands)), fit: window.__ironlog.state.settings.bandsFit, t: document.getElementById('toast').innerText, dis: document.querySelector('[data-act="bandsDefault"]').disabled }));
  ok(!diff(dt.b, want(['chest'])).length && dt.fit === undefined && /Undo/.test(dt.t) && dt.dis, 'Default targets: every target back to the defaults with the focus, the fit cleared, Undo offered, then the button off', diff(dt.b, want(['chest'])));
  await ev(() => window.__ironlog.ACT.undo()); await wait(80);
  ok(same(await bands(), old.on), 'Undo of Default targets puts them back exactly');
  await ev(k => { const L = window.__ironlog; L.state.routines = L.state.routines.filter(r => r.id !== k.rid); L.state.activeRoutineId = k.was; L.state.settings.profile = { days: 4 }; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.saveNow(); }, old);
  const nf = await ev(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); const f = x => L.normalize({ ...s, settings: { ...s.settings, bandsFit: x } }).settings.bandsFit;
    return [f({ lats: 6, chest: 9.5, neck: 2, nope: 1, quads: -1, calves: 0 }), f([]), f({}), f('x')]; });
  ok(same(nf, [{ lats: 6, calves: 0 }, undefined, undefined, undefined]), 'the recorded floors keep only whole sets on muscles with a target, in muscle order; nothing valid stores no key', nf);

  // From the review of the recorded floors:
  // a focus whose own target was typed says so instead of nothing.
  await ev(() => { const L = window.__ironlog; L.state.settings.profile = { days: 4 }; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.state.settings.bands.chest = [6, 20]; L.saveNow(); L.ui.tab = 'settings'; L.render(); });
  await P.page.click('[data-mkey="profile"] [data-act="profSet"][data-k="focus"][data-v="chest"]');
  const kt = await ev(() => ({ c: window.__ironlog.state.settings.bands.chest, t: document.getElementById('toast').innerText }));
  ok(same(kt.c, [6, 20]) && /Your Chest target is one you set, so it stays\. Default targets in Weekly set targets puts the app's back\./.test(kt.t) && /Undo/.test(kt.t), 'a focus on a typed target leaves it and says why, with Undo for the rest', kt);
  // Undo of Default targets is exact with a target typed in between.
  const ud = await ev(() => { const L = window.__ironlog; L.state.settings.profile = { days: 4 }; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit;
    const R = L.routineFromTemplate('full3'); L.state.routines.push(R); const was = L.state.activeRoutineId; L.state.activeRoutineId = R.id; L.fitTargets(R);
    const b0 = JSON.parse(JSON.stringify(L.state.settings.bands)), f0 = JSON.parse(JSON.stringify(L.state.settings.bandsFit)); L.saveNow(); L.ui.tab = 'settings'; L.ui.folds['settings:bands'] = true; L.render(); return { was, rid: R.id, b0, f0 }; });
  await P.page.click('[data-act="bandsDefault"]'); await wait(80);
  await P.page.fill('[data-band="biceps"][data-bi="0"]', '12'); await P.page.locator('[data-band="biceps"][data-bi="0"]').blur(); await wait(80);
  await ev(() => window.__ironlog.ACT.undo()); await wait(80);
  const ua = await ev(() => ({ b: JSON.parse(JSON.stringify(window.__ironlog.state.settings.bands)), f: window.__ironlog.state.settings.bandsFit }));
  ok(!diff(ua.b, { ...ud.b0, biceps: [12, 20] }).length && same(ua.f, ud.f0), 'Undo of Default targets puts back the fitted targets and their floors, and keeps one typed since', diff(ua.b, { ...ud.b0, biceps: [12, 20] }));
  // r29's guard holds: a second fit to another routine is refused, never raising a minimum.
  const g = await ev(() => { const L = window.__ironlog; const before = JSON.parse(JSON.stringify(L.state.settings.bands)); const r = L.fitTargets(L.routineFromTemplate('ppl6')); return { r, same: JSON.stringify(before) === JSON.stringify(L.state.settings.bands) }; });
  ok(g.r === false && g.same, 'fitting again to another routine is refused, as in r29', g);
  // A focus muscle's floor is recorded at the fit, so taking the focus off brings it to the plan.
  const ff = await ev(k => { const L = window.__ironlog; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.state.settings.profile = { focus: ['chest'] };
    L.profMoveBands({}, L.state.settings.profile); const R = L.state.routines.find(r => r.id === k.rid); L.fitTargets(R); const on = L.state.settings.bands.chest.slice(); const plan = Math.floor(L.plannedSets(R).chest || 0);
    L.profMoveBands(L.state.settings.profile, {}); delete L.state.settings.profile; const off = L.state.settings.bands.chest.slice();
    L.state.routines = L.state.routines.filter(r => r.id !== k.rid); L.state.activeRoutineId = k.was; L.state.settings.profile = { days: 4 }; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.saveNow(); return { on, off, plan }; }, ud);
  ok(ff.plan < 10 && same(ff.on, [13, 26]) && same(ff.off, [ff.plan, 20]), 'a focus muscle keeps 13 to 26 at the fit, and goes to the plan when the focus comes off', ff);

  // A first-run pick fits the focus targets to the routine, as it fits the defaults (r29).
  const ft = await ev(() => { const L = window.__ironlog; L.state.settings.profile = { focus: ['chest'] }; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit;
    L.profMoveBands({}, L.state.settings.profile); const R = L.routineFromTemplate('full3'); const plan = L.plannedSets(R); const changed = L.fitTargets(R);
    const out = { changed, b: JSON.parse(JSON.stringify(L.state.settings.bands)), plan };
    L.state.settings.bands.chest = [11, 22]; out.typed = L.fitTargets(R); return out; });
  const fitWant = {}; for (const m in BANDS) { const d = focusBand(m, ['chest']); fitWant[m] = TRACK.has(m) || m === 'chest' ? d : [Math.min(d[0], Math.floor(ft.plan[m] || 0)), d[1]]; }
  ok(ft.changed && !diff(ft.b, fitWant).length && ft.typed === false, 'a first-run routine pick fits the targets to its plan, the focus muscle kept at its raised target; a typed one stops it, as before', diff(ft.b, fitWant));
  await ev(() => { const L = window.__ironlog; L.state.settings.profile = { days: 4 }; for (const m in L.BANDS) L.state.settings.bands[m] = L.BANDS[m].slice(); delete L.state.settings.bandsFit; L.saveNow(); });

  // ---------- 5. Apply: the routine in use changes only here ----------
  const before = await ev(() => JSON.parse(JSON.stringify(window.__ironlog.activeRoutine())));
  await ev(() => { const L = window.__ironlog; L.state.settings.profile = { goal: 'strength', days: 4 }; L.saveNow(); L.render(); });
  ok(same(await ev(() => JSON.parse(JSON.stringify(window.__ironlog.activeRoutine()))), before), 'setting a goal leaves the routine in use exactly as it was');
  const est = Object.fromEntries(none.map(x => [x.id, x.est]));
  // One heavy compound on no timer (rest 0, on purpose): Apply leaves its rest alone.
  const zero = await ev(est => { const L = window.__ironlog; const R = L.activeRoutine(); for (const d of R.days) for (const it of d.items) if (est[it.exId]) { it.rest = 0; L.saveNow(); return it.uid; } }, est);
  before.days.forEach(d => d.items.forEach(it => { if (it.uid === zero) it.rest = 0; }));
  const expect = JSON.parse(JSON.stringify(before)); let n = 0;
  for (const d of expect.days) for (const it of d.items) if (est[it.exId]) { const ch = it.repMin !== 3 || it.repMax !== 6 || it.rir !== 2 || (+it.rest !== 0 && !(+it.rest >= 180)); if (ch) n++; it.repMin = 3; it.repMax = 6; it.rir = 2; if (+it.rest !== 0 && !(+it.rest >= 180)) it.rest = 180; }
  // A session in progress on a day with a heavy compound not started takes the change; a started one keeps its plan.
  const dr = await ev(() => { const L = window.__ironlog; const R = L.activeRoutine(); const di = R.days.findIndex(d => d.items.filter(i => L.profHeavy(L.EX(i.exId))).length >= 2); const day = R.days[di];
    const its = day.items.filter(i => L.profHeavy(L.EX(i.exId)));
    L.state.draft = { id: 'dX', date: L.today(), dayIdx: di, dayId: day.id, dayName: day.name, routineId: R.id, notes: '', startedAt: Date.now(), ex: its.slice(0, 2).map(i => L.newBlock(i.exId, { ...i }, {})), cardio: [] };
    L.state.draft.ex[1].sets[0].done = true; L.state.draft.ex[1].sets[0].r = 8; L.state.draft.ex[1].sets[0].w = 50; L.saveNow(); L.ui.tab = 'settings'; L.render();
    return { a: its[0].exId, b: its[1].exId, bPlan: JSON.parse(JSON.stringify(L.state.draft.ex[1].plan)) }; });
  const panel = await ev(() => (document.getElementById('profApply') || {}).innerText || '');
  ok(n > 3 && new RegExp(`^${n} exercises in`).test(panel.trim()), `the Apply line counts the ${n} exercises that differ`, panel);
  await P.page.click('[data-act="profApply"]'); await wait(80);
  const cf = await ev(() => document.querySelector('.sheet').innerText);
  ok(/Apply to /.test(cf) && /Heavy compounds go to 3 to 6 reps, 2 in reserve, and at least 3 minutes' rest\./.test(cf) && /Sets and exercises stay as they are/.test(cf), 'Apply asks first, says what changes and what stays', cf);
  await P.page.click('.sheet [data-act="mOk"]'); await wait(100);
  const after = await ev(() => JSON.parse(JSON.stringify(window.__ironlog.activeRoutine())));
  ok(same(after, expect), 'Apply sets heavy compounds to 3 to 6, 2 in reserve, rest raised to 3 minutes, never lowered and never on a rest of 0; nothing else in the routine changes');
  const dr2 = await ev(k => { const d = window.__ironlog.state.draft; return { a: d.ex[0].plan, b: d.ex[1].plan }; }, dr);
  ok(dr2.a.repMin === 3 && dr2.a.repMax === 6 && dr2.a.rir === 2 && same(dr2.b, dr.bPlan), 'the session in progress: an exercise not started takes it, a started one keeps its plan', dr2);
  ok(await ev(() => !document.getElementById('profApply')), 'nothing left to apply: the line is gone');
  await ev(() => window.__ironlog.ACT.undo()); await wait(100);
  ok(same(await ev(() => JSON.parse(JSON.stringify(window.__ironlog.activeRoutine()))), before), 'Undo puts the routine back exactly');
  await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); });
  // Under 1 year, Apply only raises reps in reserve and keeps the ranges (the r44 review: a 5 x 5 became 8 to 12).
  const nwA = await ev(() => { const L = window.__ironlog; const R = L.routineFromTemplate('str5'); L.state.routines.push(R); const was = L.state.activeRoutineId; L.state.activeRoutineId = R.id;
    L.state.settings.profile = { goal: 'size', exp: 'new' }; const pre = JSON.parse(JSON.stringify(R)); const list = L.profApplyList(R).map(x => x.ch);
    L.state.routines.pop(); L.state.activeRoutineId = was; L.state.settings.profile = { days: 4 }; L.saveNow(); return { pre, list }; });
  const nwWant = []; for (const d of nwA.pre.days) for (const it of d.items) if (!(it.rir >= 3)) nwWant.push({ rir: 3 });
  ok(nwWant.length > 0 && same(nwA.list, nwWant), 'under 1 year, Apply on a 5 x 5 raises reps in reserve to 3 and keeps every range', nwA.list);
  // How long a logged session took is read the same with or without a goal (the r44 review: a goal moved ~90 min to ~65).
  const pc = await ev(() => { const L = window.__ironlog; const T = L.today(); const keep = L.state.sessions; L.state.settings.profile = undefined; delete L.state.settings.profile;
    L.state.sessions = [3, 5, 8].map(a => ({ id: 'pf' + a, date: L.addDays(T, -a), notes: '', free: true, durMin: 60, ex: ['backSquat', 'deadlift'].map(id => ({ exId: id, sets: [0, 1, 2, 3].map(() => ({ w: 100, r: 5, rir: 2 })) })) })); L.invalidate();
    const a = L.pace(); L.state.settings.profile = { goal: 'strength' }; L.invalidate(); const b = L.pace(); L.state.sessions = keep; L.state.settings.profile = { days: 4 }; L.invalidate(); L.saveNow(); return [a, b]; });
  ok(pc[0] !== 1 && pc[0] === pc[1], 'your pace reads the same with Strength as without', pc);

  // ---------- 6. Strength focus in Pick for me ----------
  const pk = await ev(() => { const L = window.__ironlog; const T = L.today(); const R = L.activeRoutine();
    const mk = (ago, w) => ({ id: 'sb' + ago, date: L.addDays(T, -ago), dayIdx: 0, dayId: R.days[0].id, dayName: 'Chest', routineId: R.id, notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w, r: 8, rir: 2 })) }] });
    L.state.sessions = [mk(27, 60), mk(20, 62.5), mk(13, 65), mk(6, 67.5)]; L.invalidate();
    const at = (p, ago) => { if (p) L.state.settings.profile = p; else delete L.state.settings.profile; L.invalidate(); const st = L.IDX().exStats.bench; return L.strengthPick(L.EX('bench'), st, L.recovery('chest', T), T); };
    const rank = p => { if (p) L.state.settings.profile = p; else delete L.state.settings.profile; L.invalidate(); return L.rankExercises({ ex: [], date: T }).map(x => ({ id: x.e.id, s: Math.round(x.s * 1000) / 1000, sp: x.sp || null, sets: x.plan.sets })); };
    const out = { str: at({ goal: 'strength' }), size: at({ goal: 'size' }), none: at(null), rNone: rank(null), rSize: rank({ goal: 'size', days: 3, focus: [] }), rStr: rank({ goal: 'strength' }) };
    L.state.sessions.push({ ...mk(2, 67.5), id: 'sb2' }); L.invalidate(); out.recent = at({ goal: 'strength' });
    L.state.sessions = []; delete L.state.settings.profile; L.invalidate(); return out; });
  ok(pk.str === 'near' && pk.size === null && pk.none === null, 'Strength: bench at its best, 6 days since and recovered, is favoured; Size or no profile, not', pk);
  ok(pk.recent === null, 'not once it was done 2 days ago', pk.recent);
  ok(same(pk.rNone, pk.rSize), 'Pick for me ranks exactly the same with Size as with no profile', [pk.rNone, pk.rSize]);
  const bN = pk.rNone.find(x => x.id === 'bench'), bS = pk.rStr.find(x => x.id === 'bench');
  ok(bS && bS.sp === 'near' && (!bN || Math.abs(bS.s - bN.s - 1.2) < 1e-6), 'with Strength, bench ranks 1.2 higher and is in the three picks', [bN, bS]);

  // ---------- 7. Days a week marks the routines that fit ----------
  const tp = await ev(() => { const L = window.__ironlog; const fit = () => { L.openModal({ kind: 'templates', from: 'plan' }); const o = [...document.querySelectorAll('.tpl')].filter(b => /Fits your days/.test(b.innerText)).map(b => b.dataset.k); L.ACT.mClose(); return o; };
    L.state.settings.profile = { days: 4 }; const four = fit(); L.state.settings.profile = { days: 6 }; const six = fit(); delete L.state.settings.profile; const none = fit(); return { four, six, none }; });
  ok(same(tp.four, ['ul4', 'str5']) && same(tp.six, ['ppl6', 'onemuscle']) && !tp.none.length, 'the routine picker marks the ones that fit the days (every other day fits 3 or 4); nothing without days', tp);

  // ---------- 8. Copy ----------
  const cp = await ev(() => { const L = window.__ironlog; L.ACT.guideOpen({ dataset: {} }); const g = document.querySelector('.sheet').textContent; L.ACT.mClose(); L.ui.tab = 'settings'; L.ui.folds['settings:profile'] = true; L.render();
    const tips = [...document.querySelectorAll('[data-mkey="profile"] [data-tip]')].map(e => e.dataset.tip).join(' '); return { g, tips }; });
  ok(/Your training/.test(cp.g) && /Schoenfeld 2017/.test(cp.g) && /Bickel 2011/.test(cp.g) && !/—/.test(cp.g + cp.tips), 'the Guide says what the profile does and where each number comes from; no em dashes', cp.g.length);
  ok(/Schoenfeld 2016/.test(cp.tips) && /Spiering 2021/.test(cp.tips) && /convention/.test(cp.tips), 'the tips in Your training name the sources and the conventions', cp.tips.length);
  ok(!P.errors.length, 'no page errors', P.errors);
  await P.ctx.close();

  // ---------- 8b. Targets fitted before r44: their floors recorded once at start, only when every target matches ----------
  const Q = await open('index.html', { browser, clock: CLOCK });
  const fitted = await Q.page.evaluate(() => { const L = window.__ironlog; const s = L.normalize(JSON.parse(JSON.stringify(L.state))); delete s.settings.profile; delete s.settings.bandsFit; s.draft = null;
    const R = L.routineFromTemplate('full3'); s.routines.push(R); s.activeRoutineId = R.id; const p = L.plannedSets(R); const fit = {};
    for (const m in L.BANDS) { const lo = L.TRACK_ONLY.has(m) ? L.BANDS[m][0] : Math.min(L.BANDS[m][0], Math.floor(p[m] || 0)); s.settings.bands[m] = [lo, L.BANDS[m][1]]; if (lo < L.BANDS[m][0]) fit[m] = lo; }
    const typed = JSON.parse(JSON.stringify(s)); typed.settings.bands.biceps = [12, 20]; return { s, typed, fit }; });
  await Q.ctx.close();
  for (const [st, wantFit, name] of [[fitted.s, fitted.fit, 'a save fitted to its routine gets its floors recorded at start'], [fitted.typed, undefined, 'one typed target and nothing is recorded']]) {
    const B = await open('index.html', { browser, clock: CLOCK, state: st });
    const got = await B.page.evaluate(() => { const r = JSON.parse(localStorage.getItem('ironlog.v1')); return { mem: window.__ironlog.state.settings.bandsFit, saved: r.settings.bandsFit }; });
    ok(same(got.mem, wantFit) && same(got.saved, wantFit), name, got);
    await B.ctx.close();
  }

  // ---------- 8c. The Last column: last time's set beside this time's (V, 2026-10-13) ----------
  for (const [w, dark] of [[390, false], [320, true]]) {
    const tag = `${w} px${dark ? ' dark' : ''}`;
    const G = await open('index.html', { browser, clock: CLOCK, w, h: 900, dark });
    const ge = (f, a) => G.page.evaluate(f, a);
    await ge(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.render(); });
    await G.page.click('[data-act="startSession"]'); await wait(300);
    const lc = await ge(() => { const L = window.__ironlog; const d = L.state.draft; return d.ex.map((b, bi) => {
      const rows = [...document.querySelectorAll(`.sg:not(.head) [data-act="sWarm"][data-b="${bi}"]`)].map(n => n.closest('.sg'));
      const cells = rows.map(r => r.querySelector('.ls').textContent);
      const list = (b.last.match(/\): (.*)\.$/) || [, ''])[1].split(', ').filter(Boolean);
      return { id: b.exId, cells, list, n: b.sets.filter(x => !x.warm && !x.drop).length, hint: (document.querySelector(`#blk-${bi} .hint .tp`) || {}).textContent || '', last: b.last };
    }); });
    const want = lc.filter(x => x.list.length).map(x => ({ id: x.id, ok: x.cells.every((c, i) => c === (x.list[i] || '–')), hint: x.hint === x.last.slice(0, x.last.indexOf('):') + 1) }));
    ok(want.length >= 3 && want.every(x => x.ok && x.hint), `${tag}: each row's Last cell is set n of the session named Last, in order (a dash past it), and the line above names only the session`, [lc[0], want.filter(x => !x.ok || !x.hint)]);
    const lay = await ge(() => { const row = document.querySelector('.sg:not(.head)'); const c = [...row.children].map(x => x.getBoundingClientRect()); const n = row.querySelector('button.n').getBoundingClientRect();
      return { over: document.documentElement.scrollWidth > innerWidth, load: Math.round(c[2].width), reps: Math.round(c[3].width), nh: Math.round(n.height), head: [...document.querySelector('.sg.head').children].map(x => x.textContent).join('|') }; });
    const minLoad = w === 320 ? 47 : 76, minReps = w === 320 ? 36 : 58;
    ok(!lay.over && lay.load >= minLoad && lay.reps >= minReps && lay.nh >= 44 && /^#\|Last\|/.test(lay.head) && !/W\/D/.test(lay.head), `${tag}: no sideways scroll, the load and reps fields within 1 px of r43's width, the set number a 44 px button, no W/D column`, lay);
    // The set number marks a warm-up and a drop, as the W/D button did; the Last cell is blank on them.
    await G.page.click('[data-act="sWarm"][data-b="0"][data-s="0"]');
    const wm = await ge(() => ({ warm: window.__ironlog.state.draft.ex[0].sets[0].warm, t: document.querySelector('[data-act="sWarm"][data-b="0"][data-s="0"]').textContent, c: document.querySelector('[data-act="sWarm"][data-b="0"][data-s="0"]').closest('.sg').querySelector('.ls').textContent }));
    ok(wm.warm === true && wm.t === 'W' && wm.c === '–', `${tag}: a tap on the set number makes it a warm-up (W), with no Last set beside it`, wm);
    await G.page.click('[data-act="sWarm"][data-b="0"][data-s="0"]'); await G.page.click('[data-act="sWarm"][data-b="0"][data-s="0"]');
    ok(await ge(() => { const s = window.__ironlog.state.draft.ex[0].sets[0]; return !s.warm && !s.drop; }), `${tag}: tapping on goes through the same cycle back to a working set`);
    if (w === 390) {
      // A draft from before r44 (no prev) keeps its whole Last line; Finish saves no copy of the column.
      const old = await ge(() => { const L = window.__ironlog; const d = L.state.draft; const bi = d.ex.findIndex(b => b.last && b.prev && b.prev.length); delete d.ex[bi].prev; L.saveNow(); L.render();
        return { bi, hint: document.querySelector(`#blk-${bi} .hint .tp`) && document.querySelector(`#blk-${bi} .hint .tp`).textContent, last: d.ex[bi].last, cell: document.querySelector(`#blk-${bi} .sg:not(.head) .ls`).textContent }; });
      ok(old.bi >= 0 && old.last && old.hint === old.last && old.cell === '–', 'a draft from before r44 keeps its whole Last line and shows dashes in the column', old);
      const pv = await ge(() => { const L = window.__ironlog; const s = JSON.parse(JSON.stringify(L.state)); s.draft.ex[0].prev = ['185×8', 5, 'x'.repeat(60), null, ...Array(40).fill('1×1')]; const n = L.normalize(s).draft.ex[0].prev; s.draft.ex[0].prev = 'no'; return { n, bad: L.normalize(s).draft.ex[0].prev }; });
      ok(pv.n.length === 30 && pv.n[0] === '185×8' && pv.n[1].length === 40 && pv.bad === undefined, 'a stored Last column keeps strings only, 40 characters each, 30 at most; anything else is dropped', pv);
      const fin = await ge(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[0].sets.forEach(s => { s.r = 8; s.done = true; }); L.saveNow(); L.ACT.finishNow(); L.ACT.mClose && L.ACT.mClose(); const ss = L.state.sessions[L.state.sessions.length - 1]; return JSON.stringify(ss).includes('"prev"'); });
      ok(fin === false, 'Finish saves no Last column data with the session');
      // Every path out of the engine carries the sets: a normal day, a lighter day, a deload, back after a break, and a timed hold.
      const paths = await ge(() => { const L = window.__ironlog; const T = L.today(); const R = L.activeRoutine(); const it = R.days.flatMap(d => d.items).find(i => !L.EX(i.exId).timed && (L.IDX().byEx[i.exId] || []).length);
        const o = { n: L.suggest(it.exId, it, {}).prev, l: L.suggest(it.exId, it, { light: true }).prev, d: L.suggest(it.exId, it, { deload: true }).prev };
        L.state.sessions.push({ id: 'pk', date: L.addDays(T, -40), notes: '', free: true, ex: [{ exId: 'plank', sets: [{ w: 0, r: 45 }, { w: 0, r: 50 }] }] });
        L.state.sessions.push({ id: 'pb', date: L.addDays(T, -60), notes: '', free: true, ex: [{ exId: 'hammer', sets: [{ w: 15, r: 10 }, { w: 15, r: 9 }] }] }); L.invalidate();
        o.t = L.suggest('plank', { sets: 2, repMin: 30, repMax: 60, rir: 1, rest: 60 }, {}).prev; o.b = L.suggest('hammer', { sets: 2, repMin: 8, repMax: 12, rir: 1, rest: 60, inc: 2.26796185 }, {}).prev; o.bBack = L.suggest('hammer', { sets: 2, repMin: 8, repMax: 12, rir: 1, rest: 60, inc: 2.26796185 }, {}).back; return o; });
      // From the review: a top single and a pyramid. The column shows the sets at the working load, the ones the grey reps repeat, row for row.
      const al = await ge(() => { const L = window.__ironlog; const T = L.today(); const kg = x => x; const mk = (id, ex, sets) => ({ id, date: L.addDays(T, -3), notes: '', free: true, ex: [{ exId: ex, rr: [6, 10], sets: sets.map(([w, r]) => ({ w, r, rir: 2 })) }] });
        L.state.sessions = L.state.sessions.filter(x => !x.ex.some(e => e.exId === 'bench' || e.exId === 'backSquat'));
        L.state.sessions.push(mk('ts', 'bench', [[100, 1], [90, 8], [90, 8], [90, 7]]), mk('py', 'backSquat', [[100, 10], [110, 8], [120, 6]])); L.invalidate();
        const plan = { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 2.26796185 };
        const one = L.newBlock('bench', plan, {}), py = L.newBlock('backSquat', plan, {});
        const lbl = w => L.fmtW(w);
        return { one: { prev: one.prev, off: one.prevOff, lastR: one.lastR, want: [90, 90, 90].map((w, i) => `${lbl(w)}×${[8, 8, 7][i]}`) }, py: { prev: py.prev, off: py.prevOff, lastR: py.lastR, want: [`${lbl(120)}×6`] } }; });
      ok(same(al.one.prev, al.one.want) && al.one.off === true && same(al.one.lastR, [8, 8, 7]), 'after a top single, the column shows the three working sets beside the rows that repeat them (8, 8, 7), and the line above keeps the single', al.one);
      ok(same(al.py.prev, al.py.want) && al.py.off === true && same(al.py.lastR, [6]), 'after a pyramid, the column shows the set at the working load, the one the grey reps repeat', al.py);
      ok(['n', 'l', 'd'].every(k => Array.isArray(paths[k]) && paths[k].length) && same(paths.n, paths.l) && same(paths.n, paths.d) && same(paths.t, ['BW for 45s', 'BW for 50s']) && paths.bBack > 0 && Array.isArray(paths.b) && paths.b.length === 2, 'a normal day, a lighter day, a deload, a hold and a lift back after weeks off all carry last time\'s sets', paths);
    }
    ok(!G.errors.length, `${tag}: no page errors`, G.errors);
    await G.ctx.close();
  }

  // ---------- 9. On a first run: in the routine picker, folded and optional; Set up stays as short as before ----------
  for (const [w, dark] of [[390, false], [320, false], [320, true]]) {
    const tag = `${w} px${dark ? ' dark' : ''}`;
    const F = await open('index.html', { browser, clock: CLOCK, realStarter: true, w, h: 700, dark });
    const fe = (f, a) => F.page.evaluate(f, a);
    await F.page.waitForSelector('#obPage'); await fe(() => { if (document.querySelector('[data-act="obAcctLater"]')) window.__ironlog.ACT.obAcctLater(); });
    await F.page.waitForSelector('#obPage[data-step="start"]');
    ok(await fe(() => !document.querySelector('#obPage #obProf')), `${tag}: nothing added to the Set up page itself`);
    await F.page.click('[data-act="obSample"]'); await F.page.waitForSelector('.sheet #obProf');
    const c0 = await fe(() => ({ open: !!document.querySelector('#obProf .chip'), p: window.__ironlog.state.settings.profile, fits: document.querySelectorAll('.tpl .pill').length }));
    ok(c0.open === false && c0.p === undefined && c0.fits === 0, `${tag}: Your training in the routine picker starts folded and stores nothing`, c0);
    await F.page.click('#obProf [data-act="obProfTog"]');
    await F.page.click('#obProf [data-act="profSet"][data-k="goal"][data-v="both"]');
    await F.page.click('#obProf [data-act="profSet"][data-k="exp"][data-v="new"]');
    await F.page.click('#obProf [data-act="profSet"][data-k="days"][data-v="3"]');
    const c1 = await fe(() => { const r = [...document.querySelectorAll('#obProf .chip, #obProf .ob-prof-h')].map(c => c.getBoundingClientRect()); return { open: !!document.querySelector('#obProf .chip'), p: window.__ironlog.state.settings.profile, over: document.documentElement.scrollWidth > window.innerWidth || [...document.querySelectorAll('.sheet *')].some(e => e.getBoundingClientRect().right > window.innerWidth + 0.5), h: Math.min(...r.map(x => x.height)), wid: Math.min(...r.map(x => x.width)), focus: !!document.querySelector('#obProf [data-k="focus"]'), fits: [...document.querySelectorAll('.tpl')].filter(b => /Fits your days/.test(b.innerText)).map(b => b.dataset.k) }; });
    ok(c1.open && same(c1.p, { goal: 'both', exp: 'new', days: 3 }) && !c1.over && c1.h >= 44 && c1.wid >= 44 && !c1.focus, `${tag}: it stays open after each tap, saves the choices, 44 px targets, no sideways scroll, no focus muscles here`, c1);
    ok(same(c1.fits, ['full3', 'str5', 'db3']), `${tag}: the routines that fit 3 days are marked right there`, c1.fits);
    ok(!F.errors.length, `${tag}: no page errors`, F.errors);
    await F.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
