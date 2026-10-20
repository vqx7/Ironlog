// r55.1: the decisions V placed on 2026-10-19 and 20 and the older findings of
// r55's end-to-end audit and second review (PENDING 325, 327 and 328), each
// reproduced on r55 with the real buttons before it was fixed. Each case fails
// on r55 (`node tests/r55-1.js baselines/r55.html`) unless it says it guards
// what r55 already did:
//   - a 0 ticked at a weight well under the session's working load asks, Log
//     it as missed or Fix it (325 a), and at or near it is logged as missed at
//     once (a guard);
//   - a change of units is never a PR: 100 kg x 8, units to lb, then 220.5 x 8
//     typed, as the Last column shows it, is the same load (327 b);
//   - a lift trained in two rep ranges, back after a break, restarts each
//     range on its own first session back: the heavy day after an eased light
//     day is eased too (327 d), and a lift in one range is as before (a guard);
//   - Undo after Make it lighter puts the exercises back as they were, at once
//     and after a set logged on one of them (327 e);
//   - Type or dictate sets asks before a set far off, as a tick does, the sets
//     in range filled and ticked (327 a), and fills sets in range as before (a
//     guard).
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const FILE = process.argv[2] || 'index.html';
const LB = 0.45359237;
const ses = (id, date, exId, rr, sets, extra) => Object.assign({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', free: true, notes: '', ex: [{ exId, rr, sets: sets.map(([w, r, rir]) => ({ w, r, rir: rir === undefined ? 1 : rir, warm: false, drop: false })) }] }, extra || {});

(async () => {
  const P = await open(FILE, { clock: '2026-10-15T10:00:00', realStarter: true });
  const { page } = P; const ev = (f, a) => page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg'; L.saveNow(); localStorage.setItem('ironlog.v1.tipWake', '1'); L.render(); });
  const log = sessions => ev(sessions => { const L = window.__ironlog; const s = L.state; s.sessions = sessions; s.draft = null; s.deloadWeek = null; s.injuries = []; L.state = L.normalize(s); L.invalidate(); L.saveNow(); L.render(); }, sessions);
  const modal = () => ev(() => { const m = window.__ironlog.ui.modal; const el = document.querySelector('#modal .sheet'); return m ? { kind: m.kind, title: m.title || '', text: el ? el.innerText : '', buttons: el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()) : [] } : null; });
  const toastText = () => ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText : ''; });
  const typ = async (sel, v) => { await page.fill(sel, String(v)); await page.dispatchEvent(sel, 'input'); await page.dispatchEvent(sel, 'change'); await wait(60); };
  const W = (b, s) => `.sg input[data-f="w"][data-b="${b}"][data-s="${s}"]`, R = (b, s) => `.sg input[data-f="r"][data-b="${b}"][data-s="${s}"]`;
  const startDay = async di => { await ev(di => { const L = window.__ironlog; L.state.draft = null; L.ui.tab = 'today'; L.ui.todayDay = di; L.render(); }, di); await page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(200); await ev(() => { window.__ironlog.state.draft._rampAsked = true; }); };
  // Answers every question Finish asks until the recap shows; the recap's text.
  const finishRecap = async () => { await ev(() => window.__ironlog.ACT.finish()); await wait(200); for (let k = 0; k < 5; k++) { const m = await modal(); if (!m) return ''; if (m.kind === 'recap') return m.text; await ev(() => window.__ironlog.ACT.mOk()); await wait(200); } return ''; };

  // ---- 327 b: a change of units is never a PR. Bench 100 kg x 8 x 4 twice, units set to lb in Settings, then the same load
  // typed as the Last column shows it, 220.5 lb (100.017 kg). r55 announced a Weight PR and saved one, made of the rounding.
  {
    await log([ses('u1', '2026-10-01', 'bench', [6, 10], Array(4).fill([100, 8])), ses('u2', '2026-10-08', 'bench', [6, 10], Array(4).fill([100, 8]))]);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:general'] = true; L.render(); });
    await page.selectOption('select[data-bind="unit"]', 'lb'); await wait(150);
    await startDay(0);
    await ev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench'); L.saveNow(); L.render(); });
    const shown = await ev(() => String(window.__ironlog.state.draft.ex[0].last || ''));
    const tgtWas = await ev(() => { const b = window.__ironlog.state.draft.ex[0]; return { target: b.target, tgt: b.tgt }; });
    const toasts = [];
    for (let s = 0; s < 4; s++) { await typ(W(0, s), '220.5'); await typ(R(0, s), 8); if (!(await ev(s => window.__ironlog.state.draft.ex[0].sets[s].done, s))) await page.click(`[data-act="sDone"][data-b="0"][data-s="${s}"]`); await wait(150); if ((await modal()) && (await modal()).kind === 'confirm') { await ev(() => window.__ironlog.ACT.mOk()); await wait(100); } toasts.push(await toastText()); }
    const recap = await finishRecap();
    const after = await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); return L.IDX().prs.filter(p => p.date === '2026-10-15').map(p => p.type + ' ' + p.w + 'x' + p.r); });
    ok(/220\.5/.test(shown) && !toasts.some(t => /PR/.test(t)) && !/Weight PR|Rep PR|NEW PR/i.test(recap) && /0 of 1 exercise target beaten/.test(recap) && after.length === 0, '100 kg x 8 last time, units changed to lb, and 220.5 x 8 typed as the Last column shows it: no PR toast, none in the recap or the PR list, and the target not read as beaten by load (r55 counted a Weight PR, and a beaten target, made of rounding)', { shown, toasts: toasts.filter(t => /PR/.test(t)), recap, after });
    await ev(() => { const L = window.__ironlog; L.state.settings.unit = 'kg'; L.saveNow(); });
    // A guard: a step past the old load is still a PR once past what the old load meant.
    await log([ses('u1', '2026-10-01', 'bench', [6, 10], Array(4).fill([100, 8])), ses('u2', '2026-10-08', 'bench', [6, 10], Array(4).fill([100, 8])), ses('u3', '2026-10-15', 'bench', [6, 10], [[225 * LB, 8], [225 * LB, 8]])]);
    const step = await ev(() => window.__ironlog.IDX().prs.filter(p => p.date === '2026-10-15').length);
    ok(step > 0, 'a guard: 225 lb x 8 after 100 kg x 8 is a PR', { step });
  }

  // ---- 327 d: a lift in two rep ranges, back after six weeks off. Day A bench 5 x 3-5, Day B bench 4 x 8-12, to Jul 17; back on
  // Aug 24 with Day B, eased; then Day A on Aug 26. r55 asked Day A for the full 85 kg and more reps than before the break.
  {
    const Q = await open(FILE, { clock: '2026-08-26T10:00:00', realStarter: true, browser: P.browser });
    const qe = (f, a) => Q.page.evaluate(f, a);
    await qe(() => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; s.settings.unit = 'kg';
      const it = (uid, exId, sets, lo, hi, rir) => ({ uid, exId, sets, repMin: lo, repMax: hi, rir, rest: 150, inc: 2.5, ss: null });
      s.routines = [{ id: 'ab', name: 'AB', schedule: 'cycle', days: [{ id: 'dA', name: 'Day A', rest: false, items: [it('a1', 'bench', 5, 3, 5, 2)] }, { id: 'r1', name: 'Rest', rest: true, items: [] }, { id: 'dB', name: 'Day B', rest: false, items: [it('b1', 'bench', 4, 8, 12, 1)] }, { id: 'r2', name: 'Rest', rest: true, items: [] }] }];
      s.activeRoutineId = 'ab'; L.state = L.normalize(s); L.saveNow();
    });
    const day = (id, date, di, rr, sets) => ({ ...ses(id, date, 'bench', rr, sets), dayIdx: di, dayId: di === 0 ? 'dA' : 'dB', dayName: di === 0 ? 'Day A' : 'Day B', routineId: 'ab', free: undefined });
    const hist = [];
    ['2026-06-29', '2026-07-03', '2026-07-08', '2026-07-13', '2026-07-17'].forEach((d, i) => hist.push(day('h' + i, d, 0, [3, 5], [[85, 6], [85, 6], [85, 5], [85, 5], [85, 4]])));
    ['2026-07-01', '2026-07-06', '2026-07-10', '2026-07-15'].forEach((d, i) => hist.push(day('l' + i, d, 2, [8, 12], [[75, 12], [75, 11], [75, 11], [75, 10]])));
    const plan = { sets: 5, repMin: 3, repMax: 5, rir: 2, rest: 150, inc: 2.5 }, lightPlan = { sets: 4, repMin: 8, repMax: 12, rir: 1, rest: 150, inc: 2.5 };
    const read = (sessions, p) => qe(([sessions, p]) => { const L = window.__ironlog; const s = L.state; s.sessions = sessions; s.draft = null; L.state = L.normalize(s); L.invalidate(); const g = L.suggest('bench', p, {}); return { w: g.w, text: g.text, target: g.target }; }, [sessions, p]);
    const lightBack = await read(hist.slice().sort((a, b) => (a.date < b.date ? -1 : 1)), lightPlan);
    const backDay = day('b1', '2026-08-24', 2, [8, 12], [[lightBack.w, 12], [lightBack.w, 12], [lightBack.w, 11], [lightBack.w, 11]]);
    const heavy = await read([...hist, backDay].sort((a, b) => (a.date < b.date ? -1 : 1)), plan);
    ok(lightBack.w < 75 && heavy.w < 85 && heavy.w >= 85 * 0.85 && /Back after/.test(heavy.text), 'bench in 3-5 and 8-12, six weeks off, the 8-12 day back eased: the 3-5 day\'s first session back is eased too, under its 85 kg before the break, and says why (r55 asked for 85 kg and more reps)', { lightBack, heavy });
    // A guard: a lift in one range only, back after the same break, is eased exactly as r55 eased it.
    const one = await read(hist.filter(x => x.dayIdx === 0), plan);
    ok(one.w < 85 && /Back after/.test(one.text), 'a guard: the same lift in one range, back after six weeks, is eased', one);
    await Q.ctx.close();
  }

  // ---- 327 e: Undo after Make it lighter. r55 said "Undone" and left the halved sets, lighter loads and lighter mark.
  {
    await ev(() => { const L = window.__ironlog; const s = L.state; s.sessions = []; s.draft = null; L.makeDemo(); for (const k of ['sessions', 'bodyweights', 'measurements']) for (const x of s[k]) delete x.demo; s.settings.autoDone = false; L.invalidate(); L.saveNow(); });
    const sig = () => ev(() => { const d = window.__ironlog.state.draft; return d.ex.map(b => `${b.exId}${b.light ? '(L)' : ''}:${b.sw}:${b.sets.length}`).join(' '); });
    const logSet = async (b, s, w, r) => { if (w != null) await typ(W(b, s), w); await typ(R(b, s), r); await page.click(`[data-act="sDone"][data-b="${b}"][data-s="${s}"]`); await wait(150); const m = await modal(); if (m && m.kind === 'confirm') { await ev(() => window.__ironlog.ACT.mOk()); await wait(100); } };
    const lighten = async () => {
      await ev(() => { const L = window.__ironlog; L.ui.folds['logger:checkin'] = true; L.render(); }); await wait(80);
      if (!(await page.$('[data-act="makeLight"]'))) { const ks = await ev(() => [...new Set([...document.querySelectorAll('[data-act="chk"]')].map(b => b.dataset.k))]); for (const k of ks) { await page.click(`[data-act="chk"][data-k="${k}"][data-v="1"]`); await wait(80); } }
      await page.click('[data-act="makeLight"]'); await wait(200);
    };
    await startDay(0); await logSet(0, 0, 60, 8);
    const a0 = await sig(); await lighten(); const a1 = await sig();
    await page.click('#toast [data-act="undo"]'); await wait(250);
    const a2 = await sig();
    ok(a1 !== a0 && a2 === a0, 'Make it lighter, then Undo at once: every exercise is back as it was, sets, loads and mark (r55 left them lighter)', { a0, a1, a2 });
    await startDay(0); await logSet(0, 0, 60, 8);
    const b0 = await sig(); await lighten(); await logSet(1, 0, null, 8);
    const b1 = await ev(() => window.__ironlog.state.draft.ex[1].sets[0].done);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); }); await page.click('#view [data-act="undo"]'); await wait(250);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    const b2 = await sig(), kept = await ev(() => window.__ironlog.state.draft.ex[1].sets[0].done);
    const rest = s => s.split(' ').filter((_, i) => i !== 1).join(' ');
    ok(b1 && rest(b2) === rest(b0) && kept, 'Make it lighter, a set logged on a lightened exercise, then Undo from Settings: the others are back as they were and that exercise keeps the set logged since (r55 left all of them lighter)', { b0, b2, kept });
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
  }

  // ---- 327 a: Type or dictate sets asks before a set far off, as a tick does. Bench 100 x 8 x 4 before; "1000x8, 100x8, 100x8"
  // typed in the sheet. r55 filled and ticked all three, and Finish saved a 1000 x 8 Weight PR (best estimate 1285.5 kg).
  {
    const quick = async txt => {
      await log([ses('q1', '2026-10-01', 'bench', [6, 10], Array(4).fill([100, 8])), ses('q2', '2026-10-08', 'bench', [6, 10], Array(4).fill([100, 8]))]);
      await startDay(0);
      await ev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench'); L.saveNow(); L.render(); });
      await page.click('[data-act="bMenu"][data-b="0"]'); await wait(120);
      await page.click('#modal [data-act="bMenuDo"][data-op="bQuick"]'); await wait(150);
      await page.fill('#qTxt', txt); await page.click('#modal [data-act="qFill"]'); await wait(200);
      return { m: await modal(), sets: await ev(() => window.__ironlog.state.draft.ex[0].sets.map(x => `${x.w}x${x.r}${x.done ? '*' : ''}`).join(' ')) };
    };
    const a = await quick('1000x8, 100x8, 100x8');
    ok(a.m && a.m.kind === 'confirm' && a.m.buttons.join('|') === 'Log it|Fix it' && /^1000x8 100x8\* 100x8\*/.test(a.sets), 'Type or dictate sets with "1000x8, 100x8, 100x8": the two sets in range are filled and ticked, and 1000 x 8 waits for Log it or Fix it (r55 ticked all three)', a);
    if (a.m) { await page.click('#modal [data-act="mAlt"]'); await wait(150); }
    const fixW = await ev(() => { const a = document.activeElement; return a && a.dataset ? a.dataset.f + ':' + a.dataset.s : null; });
    await typ(W(0, 0), 100); await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(150);
    const rc = await finishRecap();
    const saved = await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); const s = L.state.sessions.find(x => x.date === '2026-10-15'); return s ? s.ex[0].sets.map(x => x.w + 'x' + x.r).join(' ') : null; });
    ok(fixW === 'w:0' && saved === '100x8 100x8 100x8' && !/Weight PR|Rep PR/.test(rc), 'Fix it goes to that set\'s load; fixed to 100 and ticked, the session saves 100 x 8 three times, no PR (r55 saved 1000 x 8 as a Weight PR)', { fixW, saved });
    const b = await quick('100x80, 8, 8');
    ok(b.m && b.m.kind === 'confirm' && /80 reps/.test(b.m.text) && /^100x80 100x8\* 100x8\*/.test(b.sets), 'and with "100x80, 8, 8": 100 x 80 waits for the question, the reps far past the range (r55 saved a Rep PR of 100 x 80)', b);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.draft = null; L.saveNow(); L.render(); });
    // A guard: sets in range fill and tick at once, with the toast, as before.
    const c = await quick('100x8, 100x8');
    ok(!c.m && /^100x8\* 100x8\*/.test(c.sets) && /2 sets filled and marked done/.test(await toastText()), 'a guard: "100x8, 100x8" fills and ticks both at once, and says so', c);
    await ev(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
  }

  // ---- 325 a (V 2026-10-19): a 0 ticked at a light weight asks first, Log it as missed or Fix it; at or near the working load a 0
  // is logged as missed at once, as in r55. Bench 100 x 8 x 4 before, so the session's working load is 100 kg.
  {
    await log([ses('z1', '2026-10-01', 'bench', [6, 10], Array(4).fill([100, 8])), ses('z2', '2026-10-08', 'bench', [6, 10], Array(4).fill([100, 8]))]);
    await ev(() => { const L = window.__ironlog; L.state.settings.autoDone = false; L.saveNow(); });
    await startDay(0);
    await ev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex = d.ex.filter(b => b.exId === 'bench'); L.saveNow(); L.render(); });
    const sw = await ev(() => window.__ironlog.state.draft.ex[0].sw);
    await typ(W(0, 0), 60); await typ(R(0, 0), 0); await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(150);
    const q = await modal(), q0 = await ev(() => window.__ironlog.state.draft.ex[0].sets[0].done);
    ok(sw === 100 && q && q.kind === 'confirm' && q.buttons.join('|') === 'Log it as missed|Fix it' && !q0, '60 kg x 0 ticked with a 100 kg working load: it asks Log it as missed or Fix it, the set waiting unticked (r55 logged it as missed at once)', { sw, q, q0 });
    if (q) { await page.click('#modal [data-act="mAlt"]'); await wait(150); }
    const fixR = await ev(() => { const a = document.activeElement; return a && a.dataset ? a.dataset.f + ':' + a.dataset.s : null; });
    await typ(R(0, 0), 8); await page.click('[data-act="sDone"][data-b="0"][data-s="0"]'); await wait(150);
    const fixed = await ev(() => { const x = window.__ironlog.state.draft.ex[0].sets[0]; return x.w + 'x' + x.r + (x.done ? '*' : ''); });
    ok(fixR === 'r:0' && fixed === '60x8*', 'Fix it goes to the reps; 8 typed and ticked logs 60 x 8', { fixR, fixed });
    await typ(W(0, 1), 60); await typ(R(0, 1), 0); await page.click('[data-act="sDone"][data-b="0"][data-s="1"]'); await wait(150);
    if (await modal()) { await page.click('#modal [data-act="mOk"]'); await wait(150); }
    const logged = await ev(() => { const x = window.__ironlog.state.draft.ex[0].sets[1]; return x.w + 'x' + x.r + (x.done ? '*' : ''); });
    ok(logged === '60x0*', 'and Log it as missed logs 60 x 0 as a missed set', { logged });
    // Guards: at the working load, and within a tenth of it, a 0 is logged as missed at once, as r55 did.
    await typ(W(0, 2), 100); await typ(R(0, 2), 0); await page.click('[data-act="sDone"][data-b="0"][data-s="2"]'); await wait(150);
    const g1 = { m: await modal(), done: await ev(() => window.__ironlog.state.draft.ex[0].sets[2].done), t: await toastText() };
    await typ(W(0, 3), 92.5); await typ(R(0, 3), 0); await page.click('[data-act="sDone"][data-b="0"][data-s="3"]'); await wait(150);
    const g2 = { m: await modal(), done: await ev(() => window.__ironlog.state.draft.ex[0].sets[3].done) };
    ok(!g1.m && g1.done && /missed/i.test(g1.t) && !g2.m && g2.done, 'a guard: 100 x 0 and 92.5 x 0 are logged as missed at once, nothing asked', { g1, g2 });
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.draft = null; L.saveNow(); L.render(); });
  }

  if (P.errors.length) ok(false, 'no page errors', P.errors);
  await P.browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
