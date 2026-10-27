// Lifters by persona (PENDING 349; V, 2026-10-15 and 16: acceptance testing
// organised by who uses the app). Every other comparison suite asks whether
// behaviour changed; this one asks whether it is right for the person using
// it, the way that person uses it: the session screen driven by taps and
// typing (the checkmark, the fields, the effort strip, Finish and its
// questions), and what a knowledgeable lifter expects checked from the rules
// in docs/EVIDENCE.md, worked out here rather than read from the app's own
// functions. Each persona's history is seeded as that lifter's own log;
// everything after it goes through the screen.
//   1  a first-time lifter: the Set up page, a ready-made routine, a first
//      session with nothing suggested (a tick waits for the weight), Finish,
//      what History, Today and Stats then say, and the same day a week later;
//   2  steady progress in pounds: double progression (every set at the top of
//      the range adds one step; short of it, beat last time's reps at the
//      load), a PR, and a heavier set that is not one;
//   3  back after six weeks off (V's case, 341): the first session back at
//      about 90% of the last working load with 2 or more in reserve, then
//      V's rules for the next sets and the next session (341 b);
//   4  in kilograms with effort as RPE: the strip reads RPE and stores RIR,
//      loads on the kilogram step, the plates per side, a PR in kilograms;
//   5  at home with bodyweight work: the bodyweight question, pull-ups with
//      no load moving by reps, an assisted lift moving by less help, a plank
//      in seconds;
//   6  the lifter who slips: a load of 0 on the bench (under the bar), a load
//      with a digit too many and reps typed as 105 are asked about and fixed
//      in place, − Set and Undo, a change of units mid-session (nothing
//      stored changes, no PR made of it), an edit from History that the next
//      session reads, a session deleted and restored;
//   7  a deload week with a superset and cardio: half the sets at about 90%
//      in whole steps, the rest timer after the pair, cardio saved, and the
//      week after reading its target from before the deload;
//   8  short on time: Short on time trims sets, nothing typed is lost, and a
//      lift done with fewer sets than usual repeats its target;
//   9  a gym change (r61, 343 7): the leg press marked New machine or gym
//      from its menu reads as a first session (no grey load from the old
//      gym), the new gym's heavier numbers are no PR while the squat, the
//      same bar at either gym, keeps its target and its PR, and the week
//      after the leg press asks from the new gym's own session.
// Run on r59 (`node tests/personas.js baselines/r59.html`) to see which of
// these the build before already got wrong. PERSONAS=1,3 runs some of them.
const { open, engine } = require('./h');
let browser;
const FILE = process.argv[2] || process.env.IRONLOG_FILE || 'index.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.env.PERSONAS ? process.env.PERSONAS.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const LB = 0.45359237;
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

/* A phone whose clock can be moved: the day a session is done is the day
   the clock says, as on a phone. */
async function phone(start, o = {}) {
  const setup = async ctx => { await ctx.addInitScript(`(()=>{const R=Date;let off=new R(${JSON.stringify(start + 'T09:00:00')}).getTime()-R.now();window.__setClock=t=>{off=new R(t).getTime()-R.now();};class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`); };
  const P = await open(FILE, { browser, realStarter: !!o.realStarter, setup, w: 390, h: 844 });
  const page = P.page;
  const ev = (f, a) => page.evaluate(f, a);
  const sel = (f, b, s) => `#view .sg input[data-f="${f}"][data-b="${b}"][data-s="${s}"]`;
  const h = {
    P, page, ev, sel,
    // The day moves on; the page is drawn as it would be when the phone is picked up.
    day: async d => { await ev(t => { window.__setClock(t); const L = window.__ironlog; L.invalidate(); L.render(); }, d + 'T09:00:00'); await wait(100); },
    // A field typed into as a thumb does: focus, the old text replaced, then left (the change).
    type: async (f, b, s, v) => { const q = sel(f, b, s); await page.click(q); await page.fill(q, ''); await page.keyboard.type(String(v)); await ev(() => { const a = document.activeElement; if (a && a.blur) a.blur(); }); await wait(60); },
    tick: async (b, s) => { await page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`); await wait(120); },
    // The effort strip: its button on the row, then the number.
    // Whether the row has the button (a lift with no effort reading, a timed hold, has none).
    effort: async (b, s, v) => { const q = `#view [data-act="rirOpen"][data-b="${b}"][data-s="${s}"]`; if (!(await page.$(q))) return false; await page.click(q); await wait(80); await page.click(`#view [data-act="rirPick"][data-b="${b}"][data-s="${s}"][data-v="${v}"]`); await wait(80); return true; },
    draft: () => ev(() => JSON.parse(JSON.stringify(window.__ironlog.state.draft))),
    // What a row shows: the load typed or in grey, the reps typed or in grey.
    row: (b, s) => ev(q => { const w = document.querySelector(q[0]), r = document.querySelector(q[1]); return { w: w ? w.value || w.placeholder : null, wTyped: w ? w.value : null, r: r ? r.value || r.placeholder : null }; }, [sel('w', b, s), sel('r', b, s)]),
    text: () => ev(() => document.getElementById('view').innerText),
    toast: () => ev(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText.trim() : ''; }),
    quiet: () => ev(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; }),
    // Today's start card, as the lifter taps it.
    start: async () => { await page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150); },
    // Finish, answering each question as one who means to save what was done: finish now, keep the sets as typed, save the ticked ones.
    finish: async () => {
      await page.click('#view [data-act="finish"]'); const asked = [];
      for (let k = 0; k < 6; k++) {
        await wait(120);
        const q = await ev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, title: m.title || '' } : null; });
        if (!q || q.kind !== 'confirm') break;
        asked.push(q.title);
        await page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]');
      }
      await wait(150);
      const m = await ev(() => { const L = window.__ironlog; const m = L.ui.modal; const t = m && document.getElementById('modal') ? document.getElementById('modal').innerText : ''; if (m) L.ACT.mClose(); return { kind: m && m.kind, text: t }; });
      return { asked, recap: m };
    }
  };
  return h;
}

/* A lifter's own log, seeded in the unit they type in: a routine of the days
   given (each lift as [exId, sets, repMin, repMax, RIR, rest, step, superset]),
   and sessions on those days (each lift as [exId, sets as [load, reps, RIR]]),
   loads stored in kilograms as the app stores them. */
const seed = (H, o) => H.ev(o => {
  const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
  const kg = v => (v == null ? null : o.unit === 'kg' ? v : v * LB);
  S.settings.onboarded = true; S.settings.unit = o.unit; S.settings.autoDone = false;
  if (o.rirScale) S.settings.rirScale = o.rirScale;
  const R = { id: 'R1', name: o.name || 'Mine', schedule: 'weekly', days: o.days.map(d => ({ id: d.id, name: d.name, items: d.items.map(([exId, sets, repMin, repMax, rir, rest, inc, ss], k) => ({ uid: d.id + k, exId, sets, repMin, repMax, rir, rest, inc: kg(inc), ss: ss || null })) })) };
  S.routines = [R]; S.activeRoutineId = 'R1';
  S.sessions = o.sessions.map((x, i) => { const di = o.days.findIndex(d => d.id === x.day); const day = o.days[di]; return { id: 'h' + i, date: x.date, dayIdx: di, dayId: day.id, dayName: day.name, routineId: 'R1', notes: '', ex: x.ex.map(([exId, sets]) => { const it = day.items.find(y => y[0] === exId); return { exId, rr: [it[2], it[3]], sets: sets.map(([w, r, rir]) => ({ w: kg(w), r, rir: rir == null ? null : rir, warm: false, drop: false })) }; }) }; });
  S.bodyweights = (o.bw || []).map(([date, w], i) => ({ id: 'w' + i, date, kg: kg(w) }));
  L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
}, o);
// Last time's set beside a row, as shown (100×8).
const lastCell = (H, b, s) => H.ev(([b, s]) => { const btn = document.querySelector(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`); const ls = btn && btn.closest('.sg') && btn.closest('.sg').querySelector('.ls'); return ls ? ls.innerText.replace(/\s+/g, '') : null; }, [b, s]);
// The effort strip opened on a row and a number tapped by its label (an RPE on the RPE scale).
const effortByLabel = async (H, b, s, label) => { await H.page.click(`#view [data-act="rirOpen"][data-b="${b}"][data-s="${s}"]`); await wait(80); const v = await H.ev(([b, s, label]) => { const x = [...document.querySelectorAll(`#view [data-act="rirPick"][data-b="${b}"][data-s="${s}"]`)].find(e => e.textContent.trim() === label); if (x) x.click(); return x ? x.dataset.v : null; }, [b, s, String(label)]); await wait(80); return v; };

// The end of the run: the browser closed and the count said.
async function finish() {
  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
}

(async () => {
  browser = await engine.launch();
  // ---- 1. A first-time lifter.
  if (run(1)) {
    const T0 = '2026-10-05'; // a Monday
    const H = await phone(T0, { realStarter: true });
    const { ev, page } = H;
    const t0 = await H.text();
    ok(/Pick a ready-made routine/.test(t0), '1. a new install opens on the Set up page', t0.slice(0, 200));
    await ev(() => { const b = document.querySelector('[data-act="obAcctLater"]'); if (b) b.click(); });
    await wait(120);
    await page.click('#view [data-act="obSample"]'); await wait(150);
    await page.click('#modal [data-act="tplPick"][data-k="full3"]'); await wait(200);
    const R = await ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); return { name: R.name, day: R.days.find(d => !d.rest && d.items.length) }; });
    ok(R.name === 'Full body, 3 days', '1. the routine picked is the one in use', R.name);
    const t1 = await H.text();
    ok(t1.toLowerCase().includes(R.day.name.toLowerCase()), `1. Today offers its first day (${R.day.name})`, t1.slice(0, 300));
    await H.start();
    let d = await H.draft();
    ok(d && d.ex.map(b => b.exId).join() === R.day.items.map(i => i.exId).join(), '1. the session holds the day\'s exercises, in order', d && d.ex.map(b => b.exId));
    // Nothing is suggested before anything is logged: no load in grey on any lift that takes one.
    const lifts = await ev(() => { const L = window.__ironlog; return L.state.draft.ex.map((b, i) => { const e = L.EX(b.exId); return { i, id: b.exId, bw: !!e.bw, timed: !!e.timed, equip: e.equip, sets: b.sets.length, plan: b.plan }; }); });
    const loaded = lifts.filter(x => !x.bw && !x.timed);
    const greys = [];
    for (const x of loaded) greys.push((await H.row(x.i, 0)).w);
    ok(loaded.length && greys.every(g => !/\d/.test(g || '')), '1. no load is suggested on a first session', greys);
    // A tick before any weight is typed is refused (344).
    const L0 = loaded[0];
    await H.type('r', L0.i, 0, L0.plan.repMin + 1);
    await H.quiet(); await H.tick(L0.i, 0);
    d = await H.draft();
    ok(!d.ex[L0.i].sets[0].done && (await H.toast()) === 'Add the weight first', '1. a tick with no weight is refused: "Add the weight first"', d.ex[L0.i].sets[0]);
    // Every set of every lift typed and ticked, as the lifter does: a load by equipment, reps one over the bottom of the range, 2 in reserve.
    const LOAD = { barbell: 65, dumbbell: 30, machine: 80, cable: 40, smith: 65, other: 25 };
    const typed = [];
    for (const x of lifts) {
      for (let s = 0; s < x.sets; s++) {
        const w = x.bw || x.timed ? null : (LOAD[x.equip] || 40);
        const r = x.plan.repMin + 1;
        if (w != null) await H.type('w', x.i, s, w);
        await H.type('r', x.i, s, r);
        const rir = (await H.effort(x.i, s, 2)) ? 2 : null;
        await H.tick(x.i, s);
        typed.push({ b: x.i, s, id: x.id, w, r, rir });
      }
    }
    d = await H.draft();
    const notDone = typed.filter(t => !d.ex[t.b].sets[t.s].done);
    ok(!notDone.length, '1. every set typed is ticked', notDone.slice(0, 3));
    const fin = await H.finish();
    ok(fin.recap.kind === 'recap', '1. Finish saves and shows the recap', fin);
    const saved = await ev(() => { const L = window.__ironlog; return { draft: !!L.state.draft, ss: L.state.sessions.map(s => ({ date: s.date, ex: s.ex.map(b => ({ exId: b.exId, sets: b.sets.map(x => [x.w, x.r, x.rir, !!x.warm]) })) })) }; });
    ok(!saved.draft && saved.ss.length === 1 && saved.ss[0].date === T0, '1. one session saved, today', saved.ss.map(s => s.date));
    const lostSets = typed.filter(t => { const b = saved.ss[0] && saved.ss[0].ex.find(e => e.exId === t.id); const x = b && b.sets[t.s]; return !x || x[1] !== t.r || x[2] !== t.rir || (t.w == null ? !(x[0] == null || x[0] === 0) : Math.abs(x[0] / LB - t.w) > 1e-6); });
    ok(!lostSets.length, '1. every set saved as typed: load, reps and RIR', lostSets.slice(0, 3));
    // What the week says: every working set ended at 2 in reserve, so every one is a hard set (RIR 3 or less, Robinson 2024).
    // Sections start folded; opened as a tap on each title opens it.
    const opened = () => ev(() => { document.querySelectorAll('#view details:not([open]) > summary').forEach(x => x.click()); return document.getElementById('view').innerText; });
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await wait(80);
    const t2 = await opened();
    const m = t2.match(/This week\n(\d+) of (\d+) sessions[\s\S]*?([\d.]+) hard sets logged/);
    ok(m && +m[1] === 1 && +m[3] === typed.length, `1. Today's week: 1 session, ${typed.length} hard sets`, m ? m[0] : t2.slice(0, 1500));
    // Chest this week: 1 for a set where chest is the lift's main muscle, a half where it helps (Pelland 2025).
    const chest = await ev(ids => { const L = window.__ironlog; return ids.reduce((a, id) => { const e = L.EX(id); return a + (e.primary === 'chest' ? 1 : (e.secondary || []).includes('chest') ? 0.5 : 0); }, 0); }, typed.map(t => t.id));
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'dash'; L.render(); });
    await wait(80);
    const vol = await opened();
    const hardWk = vol.match(/([\d.]+) hard sets this week/);
    ok(hardWk && +hardWk[1] === typed.length, `1. Stats: ${typed.length} hard sets this week, as Today says`, hardWk && hardWk[0]);
    // The Volume rows for this week (its chip tapped), as drawn: a muscle's name and its sets.
    await page.click('#view [data-act="volMode"][data-v="week"]'); await wait(120);
    const cm = await ev(() => { const r = [...document.querySelectorAll('#view .mrow')].find(x => (x.children[1] || {}).textContent === 'Chest'); return r ? parseFloat(r.querySelector('.r.num').textContent) : null; });
    ok(cm != null && Math.abs(+cm - chest) < 1e-9, `1. Stats: chest this week is ${chest} (1 a direct set, a half a helping one)`, cm != null ? cm : await ev(() => [...document.querySelectorAll('#view .mrow')].map(x => x.innerText.replace(/\s+/g, ' ')).slice(0, 30)));
    // A week later, the same day: last time's loads in grey, last time's sets beside each row, and reps to beat (the sets were inside the range).
    await H.day(addD(T0, 7));
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    const R1 = await ev(() => { const L = window.__ironlog; const R = L.state.routines.find(r => r.id === L.state.activeRoutineId); return R.days.findIndex(d => !d.rest && d.items.length); });
    await ev(di => window.__ironlog.ACT.startSession({ dataset: { day: String(di) } }), R1);
    await wait(150);
    d = await H.draft();
    const off = [];
    for (const x of loaded) {
      const t = typed.find(y => y.b === x.i && y.s === 0);
      const rw = await H.row(x.i, 0);
      const last = await ev(([b]) => { const r = document.querySelectorAll(`#view .sg`); const btn = document.querySelector(`#view [data-act="sDone"][data-b="${b}"][data-s="0"]`); const row = btn && btn.closest('.sg'); const ls = row && row.querySelector('.ls'); return ls ? ls.innerText.replace(/\s+/g, '') : null; }, [x.i]);
      const tg = d.ex[x.i].tgt;
      if (Number(rw.w) !== t.w || last !== `${t.w}×${t.r}` || !tg || tg.kind !== 'reps' || tg.total !== t.r * x.sets) off.push({ id: x.id, grey: rw.w, last, tgt: tg, want: { w: t.w, last: `${t.w}×${t.r}`, total: t.r * x.sets } });
    }
    ok(!off.length, '1. a week later: last time\'s load in grey, its set beside the row, and its reps to beat at that load', off.slice(0, 3));
    ok(!H.P.errors.length, '1. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 2. Steady progress, in pounds.
  if (run(2)) {
    const T0 = '2026-10-12';
    const H = await phone(T0);
    const { ev } = H;
    // A routine of one day: bench press 3 x 6-10 at 1 in reserve, 5 lb a step; two sessions logged.
    await ev(([T0]) => {
      const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
      S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false;
      const R = { id: 'Rp', name: 'Bench', schedule: 'weekly', days: [{ id: 'Dp', name: 'Push', items: [{ uid: 'u1', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB, ss: null }] }] };
      S.routines = [R]; S.activeRoutineId = 'Rp';
      const day = R.days[0];
      const mk = (id, date, sets) => ({ id, date, dayIdx: 0, dayId: 'Dp', dayName: 'Push', routineId: 'Rp', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir, warm: false, drop: false })) }] });
      const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
      S.sessions = [mk('s1', add(T0, -14), [[135, 9, 1], [135, 8, 1], [135, 8, 1]]), mk('s2', add(T0, -7), [[135, 10, 1], [135, 10, 1], [135, 10, 1]])];
      L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
    }, [T0]);
    await H.start();
    let d = await H.draft();
    // Every set reached the top of the range (10) at the target: one step more, 140 (the step costs about a rep at 10, not a large one).
    const r0 = await H.row(0, 0);
    ok(Number(r0.w) === 140 && d.ex[0].tgt && d.ex[0].tgt.kind === 'load', '2. every set at the top of the range: the next session adds one step, 140 lb', { grey: r0.w, tgt: d.ex[0].tgt, hint: d.ex[0].hint });
    // Done at 140 for 8, 7, 7: short of the top, so next time the reps at 140 are to beat (22, and the target says 23).
    for (const [s, r] of [[0, 8], [1, 7], [2, 7]]) { await H.type('r', 0, s, r); await H.effort(0, s, 1); await H.tick(0, s); }
    await H.finish();
    await H.day(addD(T0, 7));
    await H.start();
    d = await H.draft();
    const r1 = await H.row(0, 0);
    ok(Number(r1.w) === 140 && d.ex[0].tgt && d.ex[0].tgt.kind === 'reps' && d.ex[0].tgt.total === 22, '2. short of the top at the new load: the same load, last time\'s 22 reps to beat', { grey: r1.w, tgt: d.ex[0].tgt });
    ok(/2[23]/.test(await H.text()), '2. the screen names the reps to beat', (await H.text()).match(/[^\n]*(beat|Beat)[^\n]*/));
    // A heavier first set that beats every earlier set's estimate is a PR, said once, on the row and in a toast.
    await H.type('w', 0, 0, 150); await H.type('r', 0, 0, 8); await H.effort(0, 0, 1); await H.quiet(); await H.tick(0, 0);
    const pr = await ev(() => { const b = document.querySelector('#view [data-act="sDone"][data-b="0"][data-s="0"]'); const row = b && b.closest('.sg'); return { pr: row && row.dataset.pr, toast: (document.getElementById('toast') || {}).innerText }; });
    ok(!!pr.pr && /PR|best/i.test(pr.toast || ''), '2. 150 x 8 at 1 in reserve beats every earlier set: a PR on the row and in a toast', pr);
    // A heavier set that is not stronger (155 x 2) is not a PR (r58: Heaviest yet).
    await H.type('w', 0, 1, 155); await H.type('r', 0, 1, 2); await H.effort(0, 1, 1); await H.quiet(); await H.tick(0, 1);
    const pr2 = await ev(() => { const b = document.querySelector('#view [data-act="sDone"][data-b="0"][data-s="1"]'); const row = b && b.closest('.sg'); return { pr: row && row.dataset.pr || null, toast: (document.getElementById('toast') || {}).innerText || '' }; });
    ok(!/^PR|New best/.test(pr2.toast) && pr2.pr !== 'Best', '2. 155 x 2, heavier but weaker, is not a PR', pr2);
    ok(!H.P.errors.length, '2. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 3. Back after six weeks off (V on the live r56.1, 341).
  if (run(3)) {
    const T0 = '2026-10-19';
    const seed = async H => H.ev(([T0]) => {
      const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
      S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false;
      const R = { id: 'Rb', name: 'Chest', schedule: 'weekly', days: [{ id: 'Db', name: 'Chest', items: [{ uid: 'u1', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120, inc: 5 * LB, ss: null }] }] };
      S.routines = [R]; S.activeRoutineId = 'Rb';
      const mk = (id, date, sets) => ({ id, date, dayIdx: 0, dayId: 'Db', dayName: 'Chest', routineId: 'Rb', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: sets.map(([w, r, rir]) => ({ w: w * LB, r, rir, warm: false, drop: false })) }] });
      const add = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
      // Three sessions at 185, the last six weeks ago.
      S.sessions = [mk('b1', add(T0, -56), [[185, 8, 1], [185, 7, 1], [185, 7, 1]]), mk('b2', add(T0, -49), [[185, 8, 1], [185, 8, 1], [185, 7, 1]]), mk('b3', add(T0, -42), [[185, 8, 1], [185, 8, 1], [185, 7, 1]])];
      L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
    }, [T0]);
    // The first session back: about 90% of 185 (166.5), down to the step, 165, with 2 or more in reserve (Bosquet 2013; r34.2).
    {
      const H = await phone(T0); await seed(H); await H.start();
      const d = await H.draft(); const r0 = await H.row(0, 0);
      ok(Number(r0.w) === 165 && /Back after 6 weeks/.test(d.ex[0].hint) && /2 or more reps in reserve/.test(d.ex[0].hint), '3. first session back: 165 lb (90% of 185, down to the step), 2 or more in reserve', { grey: r0.w, hint: d.ex[0].hint });
      // 165 x 10 at 3 in reserve: the set says 185 is in reach again. The next sets aim at the bottom of the range with 2 in reserve (V's rule 4): 185 for 6.
      await H.type('r', 0, 0, 10); await H.effort(0, 0, 3); await H.tick(0, 0);
      const a = await H.draft(); const r1 = await H.row(0, 1);
      ok(Number(r1.w) === 185 && a.ex[0].adj && a.ex[0].adj.r === 6, '3. 165 x 10 at 3 in reserve: the next sets go to 185 for 6 (341 b, rule 4)', { grey: r1.w, adj: a.ex[0].adj });
      ok(!H.P.errors.length, '3. no page errors (a)', H.P.errors);
      await H.P.ctx.close();
    }
    {
      const H = await phone(T0); await seed(H); await H.start();
      // 165 x 6 at 3 in reserve: the next sets go to 170 (V's rule 4).
      await H.type('r', 0, 0, 6); await H.effort(0, 0, 3); await H.tick(0, 0);
      const a = await H.draft(); const r1 = await H.row(0, 1);
      ok(Number(r1.w) === 170, '3. 165 x 6 at 3 in reserve: the next sets go to 170 (341 b, rule 4)', { grey: r1.w, adj: a.ex[0].adj });
      await H.P.ctx.close();
    }
    {
      const H = await phone(T0); await seed(H); await H.start();
      // Done as asked: 165 x 8, 8, 8, effort not rated. The next session asks what the return's estimate gives at the usual reps and target, up to 185: 170 (rule 5).
      for (const s of [0, 1, 2]) { await H.type('r', 0, s, 8); await H.tick(0, s); }
      const before = await H.draft();
      await H.finish();
      await H.day(addD(T0, 7)); await H.start();
      const d = await H.draft(); const r0 = await H.row(0, 0);
      ok(Number(r0.w) === 170, '3. done as asked (165 x 8 x 3, unrated): the next session asks 170 (341 b, rule 5), not 165 again', { grey: r0.w, tgt: d.ex[0].tgt, hint: d.ex[0].hint, ticked: before.ex[0].sets.map(s => [s.w && Math.round(s.w / LB), s.r, s.done]) });
      ok(!H.P.errors.length, '3. no page errors (c)', H.P.errors);
      await H.P.ctx.close();
    }
  }

  // ---- 4. Kilograms, effort as RPE.
  if (run(4)) {
    const T0 = '2026-10-19';
    const H = await phone(T0);
    await seed(H, { unit: 'kg', rirScale: 'rpe', days: [{ id: 'D1', name: 'Legs', items: [['backSquat', 3, 6, 10, 2, 180, 2.5]] }], sessions: [{ date: addD(T0, -14), day: 'D1', ex: [['backSquat', [[100, 8, 2], [100, 8, 2], [100, 8, 2]]]] }, { date: addD(T0, -7), day: 'D1', ex: [['backSquat', [[100, 8, 2], [100, 8, 2], [100, 8, 2]]]] }] });
    await H.start();
    let d = await H.draft();
    const r0 = await H.row(0, 0);
    ok(Number(r0.w) === 100 && d.ex[0].tgt && d.ex[0].tgt.kind === 'reps' && d.ex[0].tgt.total === 24, '4. 100 kg x 8 x 3 inside 6-10: the same 100 kg, 24 reps to beat', { grey: r0.w, tgt: d.ex[0].tgt });
    // The strip reads RPE; RPE 8 is stored as 2 in reserve (RPE = 10 - RIR).
    await H.type('r', 0, 0, 9);
    const v = await effortByLabel(H, 0, 0, 8);
    d = await H.draft();
    ok(v === '2' && d.ex[0].sets[0].rir === 2, '4. RPE 8 tapped is stored as 2 in reserve', { v, rir: d.ex[0].sets[0].rir });
    await H.tick(0, 0);
    // The plates for 102.5 kg on the 20 kg bar: 41.25 a side, 25, 15 and 1.25 from the kilogram plates.
    await H.type('w', 0, 1, 102.5);
    const pl = await H.ev(() => { const m = document.getElementById('view').innerText.match(/Per side at [^\n]*/); return m && m[0]; });
    ok(pl === 'Per side at 102.5: 25, 15, 1.25', '4. per side at 102.5 kg: 25, 15, 1.25', pl);
    await H.type('r', 0, 1, 9); await effortByLabel(H, 0, 1, 8); await H.quiet(); await H.tick(0, 1);
    const t = await H.toast();
    ok(/kg/.test(t) && /PR|best/i.test(t), '4. 102.5 x 9 at RPE 8 is a new best, said in kilograms', t);
    ok(!H.P.errors.length, '4. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 5. At home, bodyweight work.
  if (run(5)) {
    const T0 = '2026-10-19';
    const H = await phone(T0);
    await seed(H, { unit: 'lb', days: [{ id: 'D1', name: 'Home', items: [['pullup', 3, 5, 10, 1, 120, 5], ['assistPullup', 3, 6, 10, 1, 90, 5], ['plank', 3, 30, 60, 1, 60, 5]] }], sessions: [{ date: addD(T0, -7), day: 'D1', ex: [['pullup', [[null, 8, 1], [null, 7, 1], [null, 6, 1]]], ['assistPullup', [[-40, 10, 1], [-40, 10, 1], [-40, 10, 1]]], ['plank', [[null, 45, null], [null, 45, null], [null, 40, null]]]] }] });
    await H.start();
    const t = await H.text();
    ok(/Your bodyweight/.test(t), '5. with no weigh-in, the session asks for bodyweight', t.slice(0, 300));
    await H.page.fill('#bwVal', '176'); await H.page.click('#view [data-act="addBW"]'); await wait(150);
    const bw = await H.ev(() => window.__ironlog.state.bodyweights.map(b => Math.round(b.kg / 0.45359237)));
    ok(bw.includes(176) && !/Your bodyweight/.test(await H.text()), '5. bodyweight saved as a weigh-in, and the question goes', bw);
    let d = await H.draft();
    // Pull-ups never done with added load move by reps: no load in grey, last time's 21 reps to beat.
    const p0 = await H.row(0, 0);
    ok(!/\d/.test(p0.wTyped || '') && !(Number(p0.w) > 0) && d.ex[0].tgt && d.ex[0].tgt.kind === 'reps' && d.ex[0].tgt.total === 21, '5. pull-ups: no load added, 21 reps to beat', { row: p0, tgt: d.ex[0].tgt });
    // Every assisted set reached the top of the range: less help, by one step (40 to 35 lb of help).
    const a0 = await H.row(1, 0);
    ok(Number(a0.w) === 35, '5. assisted pull-up at the top of the range with 40 lb of help: 35 lb of help next', { grey: a0.w, hint: d.ex[1].hint });
    // Pull-ups typed and ticked with no load: a bodyweight set needs none.
    for (const [s, r] of [[0, 9], [1, 7], [2, 6]]) { await H.type('r', 0, s, r); await H.tick(0, s); }
    d = await H.draft();
    ok(d.ex[0].sets.every(x => x.done), '5. pull-ups tick with no load typed', d.ex[0].sets.map(x => [x.w, x.r, x.done]));
    // The plank in seconds.
    for (const s of [0, 1, 2]) { await H.type('r', 2, s, 50); await H.tick(2, s); }
    const fin = await H.finish();
    const saved = await H.ev(() => { const s = window.__ironlog.state.sessions.find(x => x.date === '2026-10-19'); return s && s.ex.map(b => ({ exId: b.exId, sets: b.sets.map(x => [x.w, x.r]) })); });
    const pl = saved && saved.find(b => b.exId === 'plank');
    ok(pl && pl.sets.every(x => x[1] === 50), '5. the plank saved as 50 seconds a hold', { saved, asked: fin.asked });
    ok(!H.P.errors.length, '5. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 6. The lifter who slips.
  if (run(6)) {
    const T0 = '2026-10-19';
    const H = await phone(T0);
    const { ev, page } = H;
    await seed(H, { unit: 'lb', days: [{ id: 'D1', name: 'Push', items: [['bench', 3, 6, 10, 1, 120, 5]] }], sessions: [{ date: addD(T0, -7), day: 'D1', ex: [['bench', [[135, 8, 1], [135, 8, 1], [135, 8, 1]]]] }] });
    await H.start();
    // Before any set is done (a lift with every set done folds away): − Set takes an untouched last row quietly (+ Set brings one back).
    let d = await H.draft();
    const n0 = d.ex[0].sets.length;
    await page.click('#view [data-act="sDel"][data-b="0"]'); await wait(120);
    const n1 = (await H.draft()).ex[0].sets.length;
    await page.click('#view [data-act="sAdd"][data-b="0"]'); await wait(120);
    const n2 = (await H.draft()).ex[0].sets.length;
    ok(n1 === n0 - 1 && n2 === n0, '6. − Set takes an untouched row, + Set adds one back', [n0, n1, n2]);
    // − Set takes a blank row first; with every row holding reps it asks, naming the set.
    for (let k = 0; k < n2; k++) await H.type('r', 0, k, 7);
    await page.click('#view [data-act="sDel"][data-b="0"]'); await wait(120);
    const asked = await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? m.title : null; });
    if (asked) await page.click('#modal [data-act="mOk"]');
    await wait(120);
    const n3 = (await H.draft()).ex[0].sets.length;
    await page.click('#toast [data-act="undo"]'); await wait(150);
    const d4 = await H.draft();
    ok(!!asked && n3 === n2 - 1 && d4.ex[0].sets.length === n2 && d4.ex[0].sets[n2 - 1].r === 7, '6. with every row holding reps, − Set asks first, and Undo brings the row back with its reps', { asked, n: [n2, n3, d4.ex[0].sets.length], last: d4.ex[0].sets[n2 - 1] });
    // A load under the bar: 0 lb on the bench (the thumb meant 135), bench pressing air. Asked first; Fix it goes back to the load (V, 2026-10-25).
    await H.type('w', 0, 0, 0); await H.type('r', 0, 0, 8); await H.tick(0, 0);
    let q = await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? m.body : null; });
    ok(!!q && /^0 lb is under the 45 lb bar/.test(q) && !(await H.draft()).ex[0].sets[0].done, '6. 0 lb on the bench is asked about, not logged: under the 45 lb bar', q);
    if (q) await page.click('#modal [data-act="mAlt"]');
    await wait(120);
    const f0 = await ev(() => { const a = document.activeElement; return a && a.dataset ? a.dataset.f + a.dataset.b + a.dataset.s : null; });
    ok(f0 === 'w00', '6. Fix it puts the cursor back in that load', f0);
    // A digit too many: 1350 for 135. Asked first; Fix it goes back to the load, and 135 then logs.
    await H.type('w', 0, 0, 1350); await H.tick(0, 0);
    q = await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? m.title : null; });
    ok(!!q && /1350/.test(q), '6. 1350 lb is asked about before it is logged', q);
    await page.click('#modal [data-act="mAlt"]'); await wait(120);
    const f1 = await ev(() => { const a = document.activeElement; return a && a.dataset ? a.dataset.f + a.dataset.b + a.dataset.s : null; });
    ok(f1 === 'w00', '6. Fix it puts the cursor back in that load', f1);
    await H.type('w', 0, 0, 135); await H.tick(0, 0);
    d = await H.draft();
    ok(d.ex[0].sets[0].done && Math.round(d.ex[0].sets[0].w / LB) === 135, '6. corrected, 135 x 8 logs', d.ex[0].sets[0]);
    // Reps typed as 105 for 10: asked first, fixed in place.
    await H.type('r', 0, 1, 105); await H.tick(0, 1);
    q = await ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? m.title + ' ' + m.body : null; });
    ok(!!q && /105/.test(q), '6. 105 reps are asked about before they are logged', q);
    await page.click('#modal [data-act="mAlt"]'); await wait(120);
    const f2 = await ev(() => { const a = document.activeElement; return a && a.dataset ? a.dataset.f + a.dataset.b + a.dataset.s : null; });
    ok(f2 === 'r01', '6. Fix it puts the cursor back in those reps', f2);
    await H.type('r', 0, 1, 10); await H.tick(0, 1);
    d = await H.draft();
    ok(d.ex[0].sets[1].done && d.ex[0].sets[1].r === 10, '6. corrected, the set logs at 10 reps', d.ex[0].sets[1]);
    // Units changed to kg mid-session in Settings: the rows show kilograms, nothing stored changes, no PR comes of it.
    const st0 = JSON.stringify((await H.draft()).ex[0].sets.map(x => x.w));
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); });
    await wait(80);
    await ev(() => { const s = document.querySelector('#view select[data-bind="unit"]'); s.value = 'kg'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await wait(150);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await wait(100);
    const kgRow = await H.row(0, 0);
    const st1 = JSON.stringify((await H.draft()).ex[0].sets.map(x => x.w));
    ok(Math.abs(Number(kgRow.w) - 61.2) < 0.06 && st1 === st0, '6. in kg the first set shows 61.2 (135 lb), and no stored load changed', { shown: kgRow.w, same: st1 === st0 });
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); });
    await wait(80);
    await ev(() => { const s = document.querySelector('#view select[data-bind="unit"]'); s.value = 'lb'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await wait(100);
    await H.type('r', 0, 2, 8); await H.tick(0, 2);
    await H.finish();
    // An edit from History: the second set was 9, not 10. The next session reads the edit.
    const sid = await ev(() => window.__ironlog.state.sessions.find(s => s.date === '2026-10-19').id);
    await ev(id => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id } }); }, sid);
    await wait(150);
    await H.type('r', 0, 1, 9);
    await page.click('#view [data-act="finish"]'); await wait(200);
    await ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const ed = await ev(id => window.__ironlog.state.sessions.find(s => s.id === id).ex[0].sets.map(x => x.r), sid);
    ok(ed.join() === '8,9,8', '6. the edit is saved: 8, 9, 8', ed);
    await H.day(addD(T0, 7)); await H.start();
    const lc = await lastCell(H, 0, 1);
    d = await H.draft();
    ok(lc === '135×9' && d.ex[0].tgt && d.ex[0].tgt.total === 25, '6. the next session reads the edit: last time 135×9 on set 2, 25 reps to beat', { last: lc, tgt: d.ex[0].tgt });
    await ev(() => { const L = window.__ironlog; L.ACT.discard(); if (L.ui.modal) document.querySelector('#modal [data-act="mOk"]').click(); });
    await wait(150);
    // Deleted from History, then restored from Recently deleted: every set back.
    const before = await ev(id => JSON.stringify(window.__ironlog.state.sessions.find(s => s.id === id).ex), sid);
    await ev(id => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histDel({ dataset: { id } }); }, sid);
    await wait(120);
    await ev(() => { const m = document.querySelector('#modal [data-act="mOk"]'); if (m) m.click(); });
    await wait(120);
    const gone = await ev(id => !window.__ironlog.state.sessions.some(s => s.id === id), sid);
    await ev(() => { const L = window.__ironlog; L.render(); document.querySelectorAll('#view details:not([open]) > summary').forEach(x => x.click()); });
    await wait(80);
    await ev(id => { const b = document.querySelector(`#view [data-act="restore"][data-id="${id}"]`); if (b) b.click(); }, sid);
    await wait(150);
    const back = await ev(id => { const s = window.__ironlog.state.sessions.find(x => x.id === id); return s ? JSON.stringify(s.ex) : null; }, sid);
    ok(gone && back === before, '6. deleted, then restored from Recently deleted with every set', { gone, same: back === before });
    ok(!H.P.errors.length, '6. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 7. A deload week, a superset and cardio.
  if (run(7)) {
    const T0 = '2026-10-19';
    const H = await phone(T0);
    const { ev, page } = H;
    const hist = [[135, 10, 1], [135, 10, 1], [135, 10, 1], [135, 10, 1]], row = [[50, 10, 1], [50, 10, 1], [50, 10, 1], [50, 10, 1]];
    await seed(H, { unit: 'lb', days: [{ id: 'D1', name: 'Upper', items: [['bench', 4, 8, 12, 1, 90, 5, 'A'], ['dbRow', 4, 8, 12, 1, 90, 5, 'A']] }], sessions: [{ date: addD(T0, -14), day: 'D1', ex: [['bench', hist], ['dbRow', row]] }, { date: addD(T0, -7), day: 'D1', ex: [['bench', hist], ['dbRow', row]] }] });
    // The target before the deload: 40 reps at 135 to beat.
    await ev(() => { const L = window.__ironlog; L.state.settings.timerMode = 'auto'; L.state.deloadWeek = L.weekStart(L.today()); L.saveNow(); L.render(); });
    await H.start();
    let d = await H.draft();
    const b0 = await H.row(0, 0), r0 = await H.row(1, 0);
    // A deload: half the sets (4 to 2), about 90% of the load in whole steps, never back on the full load (135 x 0.9 = 121.5, so 120; 50 x 0.9 = 45).
    ok(d.ex[0].sets.length === 2 && d.ex[1].sets.length === 2, '7. a deload halves the sets: 2 of 4', d.ex.map(b => b.sets.length));
    ok(Number(b0.w) === 120 && Number(r0.w) === 45, '7. at about 90% in whole steps: bench 120, row 45', { bench: b0.w, row: r0.w });
    // The superset: no rest after the bench set while the row waits; the rest starts after the row.
    await H.type('r', 0, 0, 10); await H.tick(0, 0);
    const t1 = await ev(() => !document.getElementById('timer').hidden);
    await H.type('r', 1, 0, 10); await H.tick(1, 0);
    const t2 = await ev(() => !document.getElementById('timer').hidden);
    ok(!t1 && t2, '7. in the superset the rest timer starts after the pair, not between', { afterBench: t1, afterRow: t2 });
    for (const [b, s] of [[0, 1], [1, 1]]) { await H.type('r', b, s, 10); await H.tick(b, s); }
    // The Cardio and mobility section opened by its title, as a tap opens it, then + After lifting.
    await ev(() => { const sm = [...document.querySelectorAll('#view details:not([open]) > summary')].find(x => /Cardio/.test(x.textContent)); if (sm) sm.click(); });
    await wait(80);
    await page.click('#view [data-act="cDraftAdd"][data-when="post"]'); await wait(100);
    await page.fill('#view input[data-cf="min"][data-c="0"]', '10'); await ev(() => { const f = document.querySelector('#view input[data-cf="min"][data-c="0"]'); f.dispatchEvent(new Event('input', { bubbles: true })); f.dispatchEvent(new Event('change', { bubbles: true })); });
    await H.finish();
    const c = await ev(() => window.__ironlog.state.cardio.filter(x => x.date === '2026-10-19').map(x => x.min));
    ok(c.join() === '10', '7. the cardio is saved: 10 minutes', c);
    // The week after: the deload set no target, so bench asks to beat the 40 reps at 135 from before it.
    await ev(() => { const L = window.__ironlog; L.state.deloadWeek = null; L.saveNow(); });
    await H.day(addD(T0, 7)); await H.start();
    d = await H.draft();
    const nb = await H.row(0, 0);
    ok(Number(nb.w) === 135 && d.ex[0].tgt && d.ex[0].tgt.kind === 'reps' && d.ex[0].tgt.total === 40, '7. the week after: 135, 40 reps to beat, as before the deload', { grey: nb.w, tgt: d.ex[0].tgt });
    ok(!H.P.errors.length, '7. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 8. Short on time.
  if (run(8)) {
    const T0 = '2026-10-19';
    const H = await phone(T0);
    const { ev } = H;
    const ex = [['bench', [[135, 10, 1], [135, 9, 1], [135, 9, 1]]], ['bbRow', [[135, 10, 1], [135, 10, 1], [135, 9, 1]]], ['ohp', [[85, 8, 1], [85, 8, 1], [85, 7, 1]]], ['dbCurl', [[25, 12, 1], [25, 11, 1], [25, 10, 1]]]];
    await seed(H, { unit: 'lb', days: [{ id: 'D1', name: 'Upper', items: [['bench', 3, 6, 12, 1, 150, 5], ['bbRow', 3, 6, 12, 1, 150, 5], ['ohp', 3, 6, 12, 1, 150, 5], ['dbCurl', 3, 8, 15, 1, 90, 5]] }], sessions: [{ date: addD(T0, -14), day: 'D1', ex }, { date: addD(T0, -7), day: 'D1', ex }] });
    await H.start();
    const d0 = await H.draft();
    const tg0 = d0.ex.map(b => b.tgt && b.tgt.total);
    // A set typed before Short on time is kept.
    await H.type('r', 0, 0, 10); await H.tick(0, 0);
    await ev(() => { const L = window.__ironlog; L.ACT.shortOpen(); L.ui.modal.mins = 15; L.ACT.shortApply(); });
    await wait(150);
    const d1 = await H.draft();
    const fewer = d1.ex.map((b, i) => b.sets.filter(x => !x.warm && !x.drop).length < d0.ex[i].sets.filter(x => !x.warm && !x.drop).length);
    ok(fewer.some(Boolean) && d1.ex[0].sets[0].done && d1.ex[0].sets[0].r === 10, '8. Short on time trims sets and keeps the set done', { sets: d1.ex.map(b => b.sets.length), first: d1.ex[0].sets[0] });
    // Every set left done at last time's numbers (the grey reps), then Finish.
    for (let b = 0; b < d1.ex.length; b++) for (let s = 0; s < d1.ex[b].sets.length; s++) if (!d1.ex[b].sets[s].done) await H.tick(b, s);
    await H.finish();
    await H.day(addD(T0, 7)); await H.start();
    const d2 = await H.draft();
    // A lift done with fewer sets than usual sets no target: it asks the same reps as before (V's one rule).
    const same = d2.ex.map((b, i) => !fewer[i] || (b.tgt && b.tgt.total === tg0[i]));
    ok(same.every(Boolean), '8. each trimmed lift repeats its target the week after', { before: tg0, after: d2.ex.map(b => b.tgt && b.tgt.total), trimmed: fewer });
    ok(!H.P.errors.length, '8. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 9. A gym change (r61, 343 7): a new leg press, the same barbell.
  if (run(9)) {
    const T0 = '2026-10-19';
    const H = await phone(T0);
    // Four Mondays at the old gym: leg press 3 x 10 from 360 to 390 lb, back squat 3 x 6 from 225 to 240 lb, each at 2 in reserve.
    await seed(H, { unit: 'lb', days: [{ id: 'Dg', name: 'Legs', items: [['legPress', 3, 8, 12, 2, 120, 10], ['backSquat', 3, 5, 8, 2, 180, 5]] }],
      sessions: [0, 1, 2, 3].map(i => ({ day: 'Dg', date: addD(T0, -7 * (4 - i)), ex: [['legPress', [0, 1, 2].map(() => [360 + 10 * i, 10, 2])], ['backSquat', [0, 1, 2].map(() => [225 + 5 * i, 6, 2])]] })) });
    await H.start();
    const b0 = await H.draft();
    const lp = b0.ex.findIndex(b => b.exId === 'legPress'), sq = b0.ex.findIndex(b => b.exId === 'backSquat');
    const sqGrey = (await H.row(sq, 0)).w;
    ok(Number((await H.row(lp, 0)).w) >= 390 && Number(sqGrey) >= 240, '9. at the new gym, before marking: both lifts suggest from the old gym (leg press 390 or more, squat 240 or more)', { lp: await H.row(lp, 0), sq: sqGrey });
    // The leg press's menu, as a thumb opens it.
    await H.page.click(`#view [data-act="bMenu"][data-b="${lp}"]`); await wait(100);
    if (!ok(!!(await H.page.$('#modal [data-op="bNew"]')), '9. the leg press\'s menu offers New machine or gym')) { await H.P.ctx.close(); return finish(); }
    await H.page.click('#modal [data-op="bNew"]'); await wait(150);
    const b1 = await H.draft();
    const lpRow = await H.row(lp, 0);
    ok(b1.ex[lp].nw === true && b1.ex[lp].sw == null && !/^\d/.test(lpRow.w || '') && /First time/.test(await H.text()) && (await H.row(sq, 0)).w === sqGrey,
      '9. marked New machine or gym: the leg press has no grey load and reads as a first session; the squat is as it was', { lpRow, nw: b1.ex[lp].nw });
    // The new gym's leg press reads heavier: 500 x 10 at 2 in reserve. The squat at its grey load, 6 reps at 2 in reserve.
    for (const s of [0, 1, 2]) { await H.type('w', lp, s, 500); await H.type('r', lp, s, 10); await H.effort(lp, s, 2); await H.quiet(); await H.tick(lp, s); }
    for (const s of [0, 1, 2]) { await H.type('r', sq, s, 6); await H.effort(sq, s, 2); await H.quiet(); await H.tick(sq, s); }
    const prs = await H.ev(([lp, sq]) => { const n = bi => [...document.querySelectorAll(`#view [data-act="sDone"][data-b="${bi}"]`)].filter(b => b.closest('.sg') && b.closest('.sg').dataset.pr).length; return { lp: n(lp), sq: n(sq) }; }, [lp, sq]);
    ok(prs.lp === 0, '9. 500 x 10 on the new leg press is no PR (the old gym\'s 390 x 10 is another machine)', prs);
    const fin = await H.finish();
    // The squat matched its last (240 x 6 at 2 in reserve), so the recap has no PR at all, and one target, the squat's: the leg press had none to beat.
    ok(/No PRs this time/.test(fin.recap.text || '') && /of 1 exercise target/.test(fin.recap.text || ''), '9. the recap: no PRs, and one target (the squat\'s), the new leg press having none', fin.recap.text);
    // A week later: the leg press asks from 500 x 10 (the new gym's session), the squat from its own last.
    await H.day(addD(T0, 7));
    await H.start();
    const b2 = await H.draft();
    const lp2 = b2.ex.findIndex(b => b.exId === 'legPress');
    const g2 = Number((await H.row(lp2, 0)).w);
    const saved = await H.ev(() => { const L = window.__ironlog; return { n: L.state.sessions.filter(x => x.ex.some(b => b.exId === 'legPress')).length, nw: L.state.sessions.filter(x => x.ex.some(b => b.exId === 'legPress' && b.nw)).length }; });
    ok(g2 >= 500 && !b2.ex[lp2].nw, '9. the week after: the leg press asks from the new gym\'s 500 x 10, unmarked', { grey: g2, tgt: b2.ex[lp2].tgt });
    ok(saved.n === 5 && saved.nw === 1, '9. History keeps all five leg press sessions, the new gym\'s marked', saved);
    ok(!H.P.errors.length, '9. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  return finish();
})().catch(e => { console.error(e); process.exit(1); });
