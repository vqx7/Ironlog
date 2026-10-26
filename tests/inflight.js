// A workout in progress across an update (r60): the lifter taps Update in
// the middle of a session, the session is saved by the build that was
// running and opened by this one. tests/migration.js carries finished
// sessions from every published build; this carries the session in progress,
// which the session screen reads directly. For every published build since
// r11 (the migration suite's list), a session is started and worked through
// with that build's own actions as a lifter's taps give them (a warm-up, sets
// typed and ticked, one ticked on its grey numbers, one typed and not yet
// ticked, a drop set, a second exercise, cardio and notes), saved, and opened
// here: the screen draws without an error, every value typed is kept and
// shown, the session goes on (a tick, more reps typed), and Finish saves what
// was done.
//   node tests/inflight.js                 every build in the list
//   INFLIGHT_ONLY=r59,r30 node tests/inflight.js   some of them
const { open, engine } = require('./h');
const fs = require('fs');
const FILE = process.argv[2] || 'index.html';
const fails = [];
// Returns whether it held, so a case that cannot go on stops there.
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 900) : ''); } else console.log('ok  ', m); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const LB = 0.45359237;
// The published builds, newest first, as tests/migration.js lists them (one list to keep up).
const BUILDS = fs.readFileSync(__dirname + '/migration.js', 'utf8').split('\n').find(l => l.startsWith('for(const [file,label] of [[')).match(/\['baselines\/[^']+','[^']+'\]/g).map(x => x.match(/'([^']+)','([^']+)'/).slice(1));
const ONLY = process.env.INFLIGHT_ONLY ? process.env.INFLIGHT_ONLY.split(',') : null;

/* The session on the build that was running, by its own actions. Loads are
   typed in whole pounds, so the screen here shows them as typed. Builds
   before r14 have no saveNow; their save is the log as JSON under the one
   key, which is what saveNow writes. */
const WORK = `(() => {
  const L = window.__ironlog, A = L.ACT, LB = ${LB};
  const tap = (act, ds) => A[act]({ dataset: ds });
  // A lifter's own history (the demo's sessions read as the lifter's): a real session saved over demo data takes the demo away.
  L.state.settings.onboarded = true; L.makeDemo();
  L.state.sessions.forEach(s => { delete s.demo; }); (L.state.bodyweights || []).forEach(b => { delete b.demo; }); (L.state.measurements || []).forEach(m => { delete m.demo; }); (L.state.cardio || []).forEach(c => { delete c.demo; });
  const R = L.state.routines.find(r => r.id === L.state.activeRoutineId) || L.state.routines[0];
  const di = R.days.findIndex(x => !x.rest && x.items && x.items.length);
  L.ui.tab = 'today';
  tap('startSession', { day: String(di) });
  const d = L.state.draft;
  tap('wAdd', { b: '0' });
  const b0 = d.ex[0];
  const wi = b0.sets.findIndex(x => x.warm);
  const W = i => b0.sets.findIndex((x, k) => !x.warm && b0.sets.slice(0, k).filter(y => !y.warm).length === i);
  b0.sets[wi].w = 45 * LB; b0.sets[wi].r = 10; tap('sDone', { b: '0', s: String(wi) });
  { const s = b0.sets[W(0)]; s.w = 135 * LB; s.r = 8; s.rir = 2; tap('sDone', { b: '0', s: String(W(0)) }); }
  { const s = b0.sets[W(1)]; s.r = 7; s.rir = 1; tap('sDone', { b: '0', s: String(W(1)) }); }
  { const s = b0.sets[W(2)]; s.r = 6; }
  tap('dropAdd', { b: '0' });
  { const k = b0.sets.findIndex(x => x.drop); if (k >= 0) { const s = b0.sets[k]; s.w = 95 * LB; s.r = 10; tap('sDone', { b: '0', s: String(k) }); } }
  { const b1 = d.ex[1]; const s = b1.sets[0]; s.r = 10; s.rir = 2; tap('sDone', { b: '1', s: '0' }); }
  tap('cDraftAdd', { when: 'post' });
  if (d.cardio && d.cardio[0]) d.cardio[0].min = 12;
  d.notes = 'carried over';
  if (typeof L.saveNow === 'function') L.saveNow(); else localStorage.setItem('ironlog.v1', JSON.stringify(L.state));
  return true;
})()`;
const pick = s => ({ w: s.w == null ? null : s.w, r: s.r == null ? null : s.r, rir: s.rir == null ? null : s.rir, warm: !!s.warm, drop: !!s.drop, done: !!s.done });
const near = (a, b) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) < 1e-6);
const same = (a, b) => near(a.w, b.w) && a.r === b.r && near(a.rir, b.rir) && a.warm === b.warm && a.drop === b.drop && a.done === b.done;

(async () => {
  const browser = await engine.launch();
  for (const [file, label] of BUILDS) {
    if (ONLY && !ONLY.includes(label)) continue;
    // ---- the build that was running
    const P = await open(file, { browser, clock: '2026-10-24T10:00:00' });
    await P.page.evaluate(WORK);
    await wait(150);
    const raw = await P.page.evaluate(() => localStorage.getItem('ironlog.v1'));
    await P.ctx.close();
    const old = JSON.parse(raw);
    const od = old.draft;
    if (!ok(od && od.ex && od.ex.length >= 2, `${label}: a session in progress was saved`, od && Object.keys(od))) continue;
    const oldSets = od.ex.map(b => b.sets.map(pick));
    const typedNotDone = oldSets[0].findIndex(s => !s.done && s.r === 6);
    ok(oldSets[0].some(s => s.warm && s.done) && oldSets[0].filter(s => !s.warm && !s.drop && s.done).length >= 2 && typedNotDone >= 0 && oldSets[1][0].done, `${label}: it holds a warm-up, ticked sets, reps typed and not ticked, and a second exercise`, oldSets.slice(0, 2));

    // ---- this build, opened on that save
    const N = await open(FILE, { browser, state: old, stateOnce: false, clock: '2026-10-24T10:20:00' });
    const ev = (f, a) => N.page.evaluate(f, a);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await wait(150);
    const got = await ev(() => { const L = window.__ironlog; const d = L.state.draft; return d && { ex: d.ex.map(b => ({ exId: b.exId, sets: b.sets.map(s => ({ w: s.w, r: s.r, rir: s.rir, warm: !!s.warm, drop: !!s.drop, done: !!s.done })) })), notes: d.notes, cardio: (d.cardio || []).map(c => c.min), text: document.getElementById('view').innerText }; });
    if (!ok(!!got, `${label}: this build opens the session in progress`)) { await N.ctx.close(); continue; }
    ok(/Finish and save/.test(got.text), `${label}: the session screen is drawn`, got.text.slice(0, 200));
    ok(got.ex.length === od.ex.length && got.ex.every((b, i) => b.exId === od.ex[i].exId), `${label}: every exercise kept, in order`, got.ex.map(b => b.exId));
    const lost = [];
    od.ex.forEach((b, bi) => b.sets.forEach((s, si) => { const g = got.ex[bi] && got.ex[bi].sets[si]; if (!g || !same(pick(s), g)) lost.push({ bi, si, was: pick(s), now: g }); }));
    ok(!lost.length && got.ex.every((b, i) => b.sets.length === od.ex[i].sets.length), `${label}: every set kept as typed (load, reps, RIR, warm-up, drop, ticked)`, lost.slice(0, 3));
    ok(got.notes === 'carried over' && (od.cardio && od.cardio.length ? got.cardio[0] === 12 : true), `${label}: notes and cardio kept`, [got.notes, got.cardio]);
    // What the screen shows is what was typed: each row's load and reps fields.
    const shown = await ev(() => [...document.querySelectorAll('#view .sg input[data-f="w"][data-b="0"]')].map(f => ({ s: +f.dataset.s, w: f.value, ph: f.placeholder, r: (document.querySelector(`#view .sg input[data-f="r"][data-b="0"][data-s="${f.dataset.s}"]`) || {}).value })));
    const want = oldSets[0].map(s => ({ w: s.w == null ? '' : String(Math.round(s.w / LB)), r: s.r == null ? '' : String(s.r) }));
    const off = want.map((w, i) => ({ i, want: w, shown: shown[i] })).filter(x => !x.shown || x.shown.w !== x.want.w || x.shown.r !== x.want.r);
    ok(!off.length, `${label}: the first exercise's rows show the loads and reps typed`, off.slice(0, 3));

    // ---- the session goes on here
    const si = typedNotDone;
    await N.page.click(`#view [data-act="sDone"][data-b="0"][data-s="${si}"]`);
    await wait(150);
    // Reps typed into the second exercise's next set, and ticked.
    const s1 = await ev(() => window.__ironlog.state.draft.ex[1].sets.findIndex(x => !x.done && !x.warm));
    if (s1 >= 0) {
      await N.page.focus(`#view .sg input[data-f="r"][data-b="1"][data-s="${s1}"]`);
      await N.page.keyboard.type('9');
      await N.page.click(`#view [data-act="sDone"][data-b="1"][data-s="${s1}"]`);
      await wait(150);
    }
    const before = await ev(() => { const L = window.__ironlog; const d = L.state.draft; return { done0: d.ex[0].sets.map(s => !!s.done), ex: d.ex.map(b => ({ exId: b.exId, sets: b.sets.filter(s => s.done).map(s => ({ w: s.w, r: s.r, rir: s.rir, warm: !!s.warm, drop: !!s.drop, done: true })) })).filter(b => b.sets.length), n: L.state.sessions.length, nc: L.state.cardio.length }; });
    ok(before.done0[si] === true, `${label}: the set typed on the other build is ticked here`, before.done0);
    // ---- Finish, answering its questions as one who means to save what was done.
    await ev(() => window.__ironlog.ACT.finish({ dataset: {} }));
    for (let k = 0; k < 6; k++) {
      await wait(120);
      const q = await ev(() => { const L = window.__ironlog; const m = L.ui.modal; return m ? { kind: m.kind, title: m.title || '' } : null; });
      if (!q || q.kind !== 'confirm') break;
      if (/sets not done/.test(q.title)) await N.page.click('#modal [data-act="mOk"]');
      else await N.page.click('#modal [data-act="mAlt"]');
    }
    await wait(150);
    const after = await ev(() => { const L = window.__ironlog; const s = [...L.state.sessions].sort((a, b) => (a.t || 0) - (b.t || 0)).pop(); const newest = L.state.sessions.find(x => x.notes === 'carried over'); return { draft: !!L.state.draft, n: L.state.sessions.length, nc: L.state.cardio.length, s: newest && { ex: newest.ex.map(b => ({ exId: b.exId, sets: b.sets.map(x => ({ w: x.w, r: x.r, rir: x.rir, warm: !!x.warm, drop: !!x.drop, done: true })) })) } }; });
    ok(!after.draft && after.n === before.n + 1 && after.s, `${label}: Finish saved the session`, { draft: after.draft, n: [before.n, after.n] });
    if (after.s) {
      const miss = [];
      before.ex.forEach((b, i) => { const g = after.s.ex[i]; if (!g || g.exId !== b.exId || g.sets.length !== b.sets.length || g.sets.some((x, k) => !same(x, b.sets[k]))) miss.push({ i, want: b, got: g }); });
      ok(!miss.length && after.s.ex.length === before.ex.length, `${label}: the saved session holds every set done, on both builds, as typed`, miss.slice(0, 2));
    }
    ok(!od.cardio || !od.cardio.length || after.nc === before.nc + 1, `${label}: its cardio saved`, [before.nc, after.nc]);
    ok(!N.errors.length, `${label}: no page errors`, N.errors);
    await N.ctx.close();
  }
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
