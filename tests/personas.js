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
//      V's rules for the next sets and the next session (341 b, and since
//      r64 V's decision 1: a set back in the range whose estimate gives a
//      heavier load moves the next sets, a blank effort there read as 2 in
//      reserve);
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
//  10  Pick for me, Limited equipment and Short on time (r62).
//  11  switching from notes, and reporting a problem (r63: import, the
//      account's sheets and problem reports moved): a new install imports
//      a notes app's workouts typed in pounds from the Set up page (each set
//      stored as typed, in kilograms, on its own date, matched to the
//      library's lifts), gets a routine made from them, adds a Strong
//      export (its RPE stored as RIR, its warm-up kept as one), and its first
//      session suggests last time's load or one step on; a report sent with
//      no connection leaves Sending within the sync's limit with words that
//      say so and the text kept, and goes when sent again; the owner's
//      inbox shows each report's text as written, with a ticket link only
//      to a real ticket. (Signing up with the email's code is
//      tests/accounts.js's, on the real account script and a stand-in
//      Supabase.)
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
  const setup = async ctx => { if (o.init) await ctx.addInitScript(o.init); await ctx.addInitScript(`(()=>{const R=Date;let off=new R(${JSON.stringify(start + 'T09:00:00')}).getTime()-R.now();window.__setClock=t=>{off=new R(t).getTime()-R.now();};class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`); };
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
      // V's own case (decision 1, r64): 165 x 10 rated 2 in reserve, as the return asked. 12 to failure, Epley 165 x (1 + 12/30) = 231.0;
      // the bottom of the range with 2 in reserve is 8 to failure: 231.0 x 29/36 = 186.1, past 185, so 185; there 37 - 36 x 185/231.0 = 8.17 to failure, less 2: 6.
      await H.type('r', 0, 0, 10); await H.effort(0, 0, 2); await H.tick(0, 0);
      const a = await H.draft(); const r1 = await H.row(0, 1);
      ok(Number(r1.w) === 185 && a.ex[0].adj && a.ex[0].adj.r === 6, '3. 165 x 10 at 2 in reserve: the next sets go to 185 for 6 (decision 1; r63: they stayed at 165)', { grey: r1.w, adj: a.ex[0].adj });
      await H.P.ctx.close();
    }
    {
      const H = await phone(T0); await seed(H); await H.start();
      /* Done as asked: 165 x 8, 8, 8, effort not rated. Set 1 read as 2 in reserve (decision 1, r64) is 10 to failure, 165 x 36/27 = 220.0;
         the bottom of the range with 2 in reserve, 8 to failure: 220.0 x 29/36 = 177.2, so 175; there 37 - 36 x 175/220.0 = 8.36, less 2: 6.
         The lifter keeps 165, as the return asked, and the next session asks what the return's estimate gives at the usual 8 reps and the
         planned 1 in reserve, up to 185: 220.0 x 28/36 = 171.1, so 170 (rule 5, decision 1). */
      await H.type('r', 0, 0, 8); await H.tick(0, 0);
      const up = await H.draft(); const u1 = await H.row(0, 1);
      ok(Number(u1.w) === 175 && up.ex[0].adj && up.ex[0].adj.r === 6, '3. 165 x 8 unrated, read as 2 in reserve: the next sets go to 175 for 6 (decision 1; r63: they stayed at 165)', { grey: u1.w, adj: up.ex[0].adj });
      if (await H.page.$('#view [data-act="adjKeep"][data-b="0"]')) { await H.page.click('#view [data-act="adjKeep"][data-b="0"]'); await wait(120); }
      const kept = await H.row(0, 1);
      ok(Number(kept.w) === 165, '3. Keep 165: the next sets go back to 165', kept);
      for (const s of [1, 2]) { await H.type('r', 0, s, 8); await H.tick(0, s); }
      const before = await H.draft();
      await H.finish();
      await H.day(addD(T0, 7)); await H.start();
      const d = await H.draft(); const r0 = await H.row(0, 0);
      ok(Number(r0.w) === 170, '3. done as asked (165 x 8 x 3, unrated): the next session asks 170 (341 b, rule 5), not 165 again', { grey: r0.w, tgt: d.ex[0].tgt, hint: d.ex[0].hint, ticked: before.ex[0].sets.map(s => [s.w && Math.round(s.w / LB), s.r, s.done]) });
      ok(!H.P.errors.length, '3. no page errors (c)', H.P.errors);
      await H.P.ctx.close();
    }
    {
      /* The way back at full strength (V's decision 1, r64), by taps: the return 165 x 10 x 3 at 2 in reserve (the next sets kept at
         165), then each session's sets as a full-strength lifter does them. The usual reps before the break are 8 at 1 in reserve, 9 to failure:
           165 x 10 at 2, 12 to failure, Epley 231.0; x 28/36 = 179.7: 175 next;
           175 x 9 at 1, 10 to failure, Brzycki 175 x 36/27 = 233.3; x 28/36 = 181.5: 180 next;
           180 x 9 at 1, 10 to failure, 240.0; x 28/36 = 186.7, past 185: 185 next, the load from before the break. */
      const H = await phone(T0); await seed(H);
      const sess = async (day, r, rir) => {
        await H.day(day); await H.start();
        const g = Number((await H.row(0, 0)).w);
        for (const s of [0, 1, 2]) {
          await H.type('r', 0, s, r); await H.effort(0, s, rir); await H.tick(0, s);
          if (await H.page.$('#view [data-act="adjKeep"][data-b="0"]')) { await H.page.click('#view [data-act="adjKeep"][data-b="0"]'); await wait(120); }
        }
        await H.finish();
        return g;
      };
      // The routine's chest day is a Monday: a session a week.
      const asked = [await sess(T0, 10, 2), await sess(addD(T0, 7), 9, 1), await sess(addD(T0, 14), 9, 1)];
      await H.day(addD(T0, 21)); await H.start();
      asked.push(Number((await H.row(0, 0)).w));
      ok(asked.join() === '165,175,180,185', '3. back at full strength by taps: 165, then 175, 180 and 185 (decision 1; r63: 165, 175, 175, 175)', asked);
      ok(!H.P.errors.length, '3. no page errors (d)', H.P.errors);
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

  // ---- 10. Pick for me, Limited equipment and Short on time (r62: their sheets and rules moved, pick.ts).
  if (run(10)) {
    const T0 = '2026-10-19'; // a Monday: the plan says Push
    const H = await phone(T0);
    const { ev, page } = H;
    // Push on Mondays, Pull on Tuesdays. Push was trained hard on Saturday (12 hard sets for chest, two days ago:
    // a dose that needs 3 days); Pull last five weeks ago, so the back has had nothing for over three weeks.
    const push = [['bench', [[185, 8, 1], [185, 8, 1], [185, 7, 0], [185, 7, 0], [185, 6, 0], [185, 6, 0]]], ['dbBench', [[60, 10, 1], [60, 9, 1], [60, 9, 0], [60, 8, 0], [60, 8, 0], [60, 8, 0]]]];
    const pull = [['bbRow', [[135, 10, 2], [135, 10, 2], [135, 9, 2]]], ['latPulldown', [[120, 10, 2], [120, 10, 2], [120, 9, 2]]]];
    await seed(H, { unit: 'lb', days: [{ id: 'Dp', name: 'Push', items: [['bench', 3, 6, 10, 1, 150, 5], ['dbBench', 3, 8, 12, 1, 120, 5]] }, { id: 'Dl', name: 'Pull', items: [['bbRow', 3, 6, 12, 1, 150, 5], ['latPulldown', 3, 8, 12, 1, 120, 5]] }, ...[3, 4, 5, 6, 7].map(n => ({ id: 'Dr' + n, name: 'Rest', items: [] }))],
      sessions: [{ date: addD(T0, -35), day: 'Dl', ex: pull }, { date: addD(T0, -2), day: 'Dp', ex: push }] });
    // Pick for me from Change, by taps: the back's day beats the plan's, which leans on a chest still recovering.
    await page.click('#view [data-act="startAltOpen"]'); await wait(150);
    await page.click('#modal [data-act="altGo"][data-go="pickToday"]'); await wait(200);
    const pt = await ev(() => document.getElementById('modal').innerText.replace(/\s+/g, ' '));
    ok(/Pull fits today better than Push, next in your plan: Push leans on muscles that may still be recovering\./.test(pt), '10. Pick for me: Pull fits today better than the plan\'s Push, whose chest is still recovering', pt.slice(0, 300));
    const first = await ev(() => { const c = document.querySelector('#modal .pcard.best'); return c ? c.innerText.replace(/\s+/g, ' ') : ''; });
    ok(/Pull/.test(first) && /Best fit/.test(first) && /not trained hard in 3 weeks|Last done 35 days ago/.test(first), '10. the best fit is Pull, and it says the back has had nothing for weeks', first.slice(0, 300));
    // Start from the Pull card: the session is the Pull day.
    await page.click('#modal .pcard.best [data-act="startSession"]:not([data-light])'); await wait(250);
    const d = await H.draft();
    ok(d && d.dayName === 'Pull' && d.ex.map(b => b.exId).join() === 'bbRow,latPulldown', '10. Start on the best fit begins the Pull day', d && { day: d.dayName, ex: d.ex.map(b => b.exId) });
    // Short on time at 15 minutes with one set done: the trim keeps that set, and what is left fits or says it is still over.
    await H.type('w', 0, 0, 135); await H.type('r', 0, 0, 10); if (!(await H.draft()).ex[0].sets[0].done) await H.tick(0, 0);
    await page.click('#view [data-act="shortOpen"]'); await wait(150);
    await page.click('#modal [data-act="shortPick"][data-v="15"]'); await wait(150);
    const st = await ev(() => document.getElementById('modal').innerText.replace(/\s+/g, ' '));
    const est = +((st.match(/~(\d+) min after the change/) || [])[1] || NaN);
    ok(/→ \d+ sets?/.test(st) && /Done sets are never touched/.test(st) && (est <= 15 || /Still over/.test(st)), '10. Short on time at 15 minutes lists the sets it takes off and fits 15 minutes', st.slice(0, 300));
    await page.click('#modal [data-act="shortApply"]'); await wait(200);
    const dt = await H.draft();
    ok(dt.ex[0].sets[0].done && dt.ex[0].sets[0].r === 10 && dt.ex.every(b => b.sets.filter(x => !x.warm).length >= 2), '10. Trim the session keeps the set done and at least 2 sets of each lift (SHORT_MIN_SETS)', dt.ex.map(b => [b.exId, b.sets.length, b.sets[0].done]));
    // Every set left done, then Pick for me inside the session: never a chest lift (recovering, and already at its target this week).
    for (let b = 0; b < dt.ex.length; b++) for (let s = 0; s < dt.ex[b].sets.length; s++) { if (dt.ex[b].sets[s].done) continue; await H.type('w', b, s, b === 0 ? 135 : 120); await H.type('r', b, s, 10); const now = await H.draft(); if (!now.ex[b].sets[s].done) await H.tick(b, s); }
    await ev(() => window.__ironlog.ACT.pickEx({ dataset: {} })); await wait(200);
    const picks = await ev(() => [...document.querySelectorAll('#modal .pcard')].map(c => ({ name: c.querySelector('b').textContent, text: c.innerText.replace(/\s+/g, ' '), ex: c.querySelector('[data-act="pickExAdd"]').dataset.ex, sets: +c.querySelector('[data-act="pickExAdd"]').dataset.sets })));
    const prim = await ev(ids => ids.map(id => window.__ironlog.EX(id).primary), picks.map(p => p.ex));
    ok(picks.length === 3 && !prim.includes('chest'), '10. in the session, Pick for me offers three lifts and none for the chest', { picks: picks.map(p => p.name), prim });
    ok(picks.every(p => /hard sets in the last 7 days, counting this session/.test(p.text) && /× /.test(p.text)), '10. each pick says its muscle\'s week and its sets', picks.map(p => p.text.slice(0, 160)));
    // Add the best fit: it joins the session with the sets the card shows.
    await page.click('#modal .pcard.best [data-act="pickExAdd"]'); await wait(250);
    const d2 = await H.draft();
    const added = d2.ex[d2.ex.length - 1];
    ok(added.exId === picks[0].ex && added.sets.filter(x => !x.warm).length === picks[0].sets, '10. Add to session adds the first pick with the sets its card shows', { added: added.exId, sets: added.sets.length, card: picks[0] });
    await H.finish();
    // Limited equipment the week after, from Today, by taps: no barbell, so the bench becomes a chest lift on other equipment.
    await H.day(addD(T0, 7));
    if (!(await page.$('#view [data-act="eqOpen"]'))) { await page.click('#view [data-act="heroMore"]'); await wait(150); }
    await page.click('#view [data-act="eqOpen"]'); await wait(150);
    const on = await ev(() => document.querySelector('#modal [data-act="eqToggle"][data-k="barbell"]').getAttribute('aria-pressed'));
    if (on === 'true') { await page.click('#modal [data-act="eqToggle"][data-k="barbell"]'); await wait(150); }
    const sw = await ev(() => document.querySelector('#modal .eqsw') ? document.querySelector('#modal .eqsw').innerText : '');
    await page.click('#modal [data-act="eqStart"]'); await wait(250);
    const d4 = await H.draft();
    const lifts = await ev(ids => ids.map(id => { const e = window.__ironlog.EX(id); return { id, primary: e.primary, equip: e.equip }; }), d4.ex.map(b => b.exId));
    ok(/Barbell Bench Press →/.test(sw) && !lifts.some(e => e.equip === 'barbell') && lifts.some(e => e.primary === 'chest') && d4.ex[0].sets.filter(x => !x.warm).length === 3, '10. Limited equipment without a barbell swaps the bench for a chest lift on other equipment, its 3 planned sets kept', { sw, lifts });
    ok(!H.P.errors.length, '10. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 11. Switching from notes, and reporting a problem (r63).
  if (run(11)) {
    const T0 = '2026-10-05'; // a Monday
    // Signed in as the app's owner, who reads reports; a report service whose first send never answers (no connection), then answers.
    // The tickets' address is config's (TICKETS_AT); the second link only starts like it.
    const TICKETS_AT = require('../scripts/config').TICKETS_AT;
    const ITEMS = [
      { id: 1, created_at: '2026-10-04T09:12:00Z', category: 'bug', message: 'The timer <b>stuck</b> & went silent', reply_to: 'a@example.com', context: {}, screenshot: null, issue_url: TICKETS_AT + 'vqx7/ironlog-feedback/issues/7' },
      { id: 2, created_at: '2026-10-03T18:00:00Z', category: 'idea', message: 'A dark theme for the plates line', reply_to: null, context: {}, screenshot: null, issue_url: TICKETS_AT.replace(/\/$/, '.example.net/') + 'issues/8' }
    ];
    const init = `window.ironlogAuth={landing:null,onChange(){},user(){return Promise.resolve({id:'u11',email:'owner@example.com'});},signIn(){return new Promise(()=>{});},signUp(){return new Promise(()=>{});},signOut(){return Promise.resolve();},resetPassword(){return Promise.resolve();},updatePassword(){return Promise.resolve();},release(){}};
      window.__sent=[];window.ironlogFeedback={send(r){window.__sent.push(r);return window.__sent.length===1?new Promise(()=>{}):Promise.resolve();},isReader(){return Promise.resolve(true);},inbox(){return Promise.resolve(${JSON.stringify(ITEMS)});}};`;
    const H = await phone(T0, { realStarter: true, init });
    const { ev, page } = H;
    // From the Set up page: Import my workouts, the notes pasted, read, in pounds, imported.
    // Two weeks of two days, so the days repeat and a routine can be made from them (with nothing repeated the routine picker opens instead).
    const LOGGED = [
      ['2026-09-24', 'Sep 24 Push', [['Bench press', [[180, 8], [180, 8], [180, 8]]], ['Incline DB press', [[55, 10], [55, 10], [55, 10]]]]],
      ['2026-09-26', 'Sep 26 Legs', [['Squat (Barbell)', [[215, 5], [215, 5], [215, 5]]], ['Leg press', [[340, 12], [340, 12], [340, 12]]]]],
      ['2026-10-01', 'Oct 1 Push', [['Bench press', [[185, 8], [185, 8], [185, 7]]], ['Incline DB press', [[60, 10], [60, 10], [60, 9]]]]],
      ['2026-10-03', 'Oct 3 Legs', [['Squat (Barbell)', [[225, 5], [225, 5], [225, 5]]], ['Leg press', [[360, 12], [360, 12], [360, 10]]]]]
    ];
    const NOTES = LOGGED.map(([, head, lifts]) => [head, ...lifts.map(([n, sets]) => n + ' ' + sets.map(([w, r]) => `${w}x${r}`).join(', '))].join('\n')).join('\n\n') + '\n';
    await ev(() => { const b = document.querySelector('[data-act="obAcctLater"]'); if (b) b.click(); });
    await wait(120);
    await page.click('#view [data-act="impOpen"]'); await wait(150);
    await page.fill('#impText', NOTES);
    await page.click('#modal [data-act="impRead"]'); await wait(300);
    const pv = await ev(() => { const m = window.__ironlog.ui.modal; return { step: m && m.step, unitKnown: m && m.unitKnown, text: document.getElementById('modal').innerText }; });
    ok(pv.step === 'preview' && /4 sessions/.test(pv.text), '11. the notes read as four sessions, shown before anything is saved', pv.text.slice(0, 300));
    if (await page.$('#modal [data-act="impUnit"][data-v="lb"]')) { await page.click('#modal [data-act="impUnit"][data-v="lb"]'); await wait(150); }
    await page.click('#modal [data-act="impGo"]'); await wait(400);
    const after = await ev(() => { const L = window.__ironlog; return { sessions: L.state.sessions.map(s => ({ date: s.date, ex: s.ex.map(b => ({ id: b.exId, name: L.EX(b.exId).name, custom: !!L.EX(b.exId).custom, sets: b.sets.map(x => [x.w, x.r]) })) })), routine: L.state.routines.find(r => r.id === L.state.activeRoutineId), onboarded: L.state.settings.onboarded }; });
    const S = [...after.sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
    ok(S.length === 4 && S.every((s, i) => s.date === LOGGED[i][0]), '11. each session is saved on its own date', S.map(s => s.date));
    const asTyped = S.length === 4 && S.every((s, i) => s.ex.length === 2 && s.ex.every((b, j) => { const sets = LOGGED[i][2][j][1]; return b.sets.length === sets.length && b.sets.every(([w, r], k) => Math.abs(w - sets[k][0] * LB) < 1e-9 && r === sets[k][1]); }));
    ok(asTyped, '11. every set is stored as typed: the pounds in kilograms exactly, the reps as typed', S.map(s => s.ex.map(b => [b.name, b.sets])));
    const all = S.flatMap(s => s.ex);
    const LIKE = [/bench/i, /incline/i, /squat/i, /leg press/i];
    ok(all.every(b => !b.custom) && S.every(s => s.ex.every((b, j) => LIKE[(s.date === '2026-09-24' || s.date === '2026-10-01' ? 0 : 2) + j].test(b.name))), '11. each lift is matched to the library\'s, none made new', all.map(b => b.name));
    const R = after.routine;
    const trained = R ? R.days.filter(d => !d.rest && d.items.length) : [];
    ok(after.onboarded && trained.length === 2 && trained.every(d => d.items.length === 2) && trained.map(d => d.name).sort().join() === 'Legs,Push', '11. a routine is made from the days that repeat, Push and Legs, and the app opens on it', R && R.days.map(d => [d.name, d.items.map(i => i.exId)]));
    // Then a Strong export with two older weeks, from Settings: added beside the notes' sessions, its RPE stored as RIR, its warm-up as one.
    const STRONG = ['Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
      '2026-09-17 18:02:11,"Push",1h 5m,"Bench Press (Barbell)",W,95,10,0,0,"","",',
      '2026-09-17 18:02:11,"Push",1h 5m,"Bench Press (Barbell)",1,175,8,0,0,"","",8',
      '2026-09-17 18:02:11,"Push",1h 5m,"Bench Press (Barbell)",2,175,8,0,0,"","",9',
      '2026-09-19 07:30:00,"Legs",50m,"Squat (Barbell)",1,205,5,0,0,"","",7.5',
      '2026-09-19 07:30:00,"Legs",50m,"Squat (Barbell)",2,205,5,0,0,"","",8'].join('\n') + '\n';
    const fs = require('fs'), os = require('os'), path = require('path');
    const strongFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-p11-')), 'strong.csv'); fs.writeFileSync(strongFile, STRONG);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.ui.folds['settings:data'] = true; L.render(); }); await wait(150);
    await page.click('#view [data-act="impOpen"]'); await wait(150);
    await page.setInputFiles('#impFile', strongFile); await wait(600);
    if (await page.$('#modal [data-act="impUnit"][data-v="lb"]')) { await page.click('#modal [data-act="impUnit"][data-v="lb"]'); await wait(150); }
    await page.click('#modal [data-act="impGo"]'); await wait(400);
    const st = await ev(() => { const L = window.__ironlog; return L.state.sessions.filter(s => s.date < '2026-09-24').map(s => ({ date: s.date, ex: s.ex.map(b => ({ name: L.EX(b.exId).name, sets: b.sets.map(x => [x.w, x.r, x.rir, !!x.warm]) })) })).sort((a, b) => (a.date < b.date ? -1 : 1)); });
    const bs = st[0] && st[0].ex[0], sq = st[1] && st[1].ex[0];
    ok(st.length === 2 && st[0].date === '2026-09-17' && st[1].date === '2026-09-19' && /bench/i.test(bs.name) && /squat/i.test(sq.name), '11. a Strong export adds its two sessions on their dates, matched to the library', st);
    ok(bs && bs.sets.length === 3 && bs.sets[0][3] === true && Math.abs(bs.sets[1][0] - 175 * LB) < 1e-9 && bs.sets[1][2] === 2 && bs.sets[2][2] === 1 && sq.sets[0][2] === 2.5, '11. its warm-up is kept as one, its loads as typed, and its RPE 8, 9 and 7.5 stored as RIR 2, 1 and 2.5', st);
    await ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); }); await wait(150);
    // The first session from it: each lift's grey load is last time's, or at most one step (about 5%) on, never below it.
    await H.start();
    const d1 = await H.draft();
    const last = id => { const b = [...all].reverse().find(x => x.id === id); return b ? Math.max(...b.sets.map(x => x[0])) / LB : null; };
    const loads = [];
    for (let b = 0; b < (d1 ? d1.ex.length : 0); b++) { const r = await H.row(b, 0); loads.push({ id: d1.ex[b].exId, grey: +r.w, last: last(d1.ex[b].exId) }); }
    ok(loads.length === 2 && loads.every(x => x.last != null && x.grey >= x.last - 1e-6 && x.grey <= x.last * 1.06 + 1e-6), '11. its first session suggests last time\'s load or one step on, for each lift', loads);
    // A report from the menu, mid-session, with no connection: Sending, then within the sync's limit (20 s) words that say so, the text kept.
    await page.click('[data-act="menuOpen"]'); await wait(150);
    await page.click('#modal [data-act="fbOpen"]'); await wait(150);
    const MSG = 'The rest timer stopped when the phone locked.';
    await page.fill('#modal textarea[data-fbind="msg"]', MSG); await wait(60);
    await page.click('#modal [data-act="fbSend"]'); await wait(150);
    const busy = await ev(() => document.getElementById('modal').innerText);
    await wait(21000);
    const late = await ev(() => { const m = window.__ironlog.ui.modal; return { busy: m && m.busy, err: m && m.err, text: document.getElementById('modal').innerText, field: (document.querySelector('#modal textarea[data-fbind="msg"]') || {}).value }; });
    ok(/Sending/.test(busy) && !late.busy && /No answer/.test(late.err || '') && late.field === MSG, '11. a report sent with no connection says Sending, then no answer within 20 s, its text kept', { busy: busy.slice(0, 200), late });
    await page.click('#modal [data-act="fbSend"]'); await wait(300);
    const sent = await ev(() => ({ sent: window.__sent.map(r => [r.message, r.client_id]), text: document.getElementById('modal').innerText }));
    ok(sent.sent.length === 2 && sent.sent[1][0] === MSG && sent.sent[0][1] === sent.sent[1][1] && /Thanks/.test(sent.text), '11. sent again it goes, under the same key as the first try (so a lost answer cannot make it twice)', sent);
    // The owner's inbox, from the menu: each report's words as written, a ticket link only to a real ticket.
    // The report's sheet closed by its ✕, then the menu.
    await page.click('#modal [data-act="mClose"]'); await wait(150);
    await page.click('[data-act="menuOpen"]'); await wait(150);
    await page.click('#modal [data-act="fbInbox"]'); await wait(300);
    const inbox = await ev(() => ({ text: document.getElementById('modal').innerText, links: [...document.querySelectorAll('#modal a')].map(a => a.getAttribute('href')), bold: document.querySelectorAll('#modal li b').length }));
    ok(inbox.text.includes('The timer <b>stuck</b> & went silent') && inbox.bold === 0, '11. the inbox shows a report\'s words as written, markup and all, never as markup', inbox.text.slice(0, 300));
    ok(inbox.links.length === 1 && inbox.links[0] === ITEMS[0].issue_url, '11. a ticket link only to the real ticket, none for an address that merely starts like one', inbox.links);
    ok(!H.P.errors.length, '11. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 12. A lifter who picks the Red accent and trains (r65.2, PENDING 369 and 370): every step a tap or typing.
  if (run(12)) {
    const T0 = '2026-10-05'; // a Monday
    const H = await phone(T0);
    const { ev, page } = H;
    await seed(H, { unit: 'lb', days: [{ id: 'A', name: 'Push', items: [['bench', 3, 6, 10, 1, 180, 5]] }], sessions: [{ day: 'A', date: '2026-09-28', ex: [['bench', [[185, 8, 1], [185, 8, 1], [185, 7, 1]]]] }] });
    // Settings > General, the Red chip, as a thumb taps it.
    await page.click('#tabs [data-tab="settings"]'); await wait(150);
    await ev(() => { const L = window.__ironlog; L.ui.folds['settings:general'] = true; L.render(); });
    await page.click('#view [data-act="accent"][data-v="red"]'); await wait(150);
    // The magenta is a deeper one in light and a brighter one in dark, as each theme's red was.
    const col = () => ev(() => { const g = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim().toLowerCase(); return { volt: g('--volt'), red: g('--red'), dark: getComputedStyle(document.body).backgroundColor === 'rgb(8, 9, 11)' }; });
    const c = await col();
    const MAG = c.dark ? { hex: '#f472d0', rgb: 'rgb(244, 114, 208)' } : { hex: '#a3168f', rgb: 'rgb(163, 22, 143)' };
    ok(c.volt === '#ff2d46' && c.red === MAG.hex, '12. tapping Red makes the accent red and the red status colour magenta', c);
    await page.click('#tabs [data-tab="today"]'); await wait(150);
    await H.start();
    const discard = await ev(() => { const b = document.querySelector('#view .ph [data-act="discard"]'); return b ? getComputedStyle(b).color : null; });
    ok(discard === MAG.rgb, '12. Discard reads in the magenta, not the accent', discard);
    // A set typed and ticked; the load then selected whole and typed over, as a thumb fixes a typo.
    await H.type('w', 0, 0, 185); await H.type('r', 0, 0, 9); await H.tick(0, 0);
    const tickBg = await ev(() => getComputedStyle(document.querySelector('#view [data-act="sDone"][data-b="0"][data-s="0"]')).backgroundColor);
    ok(tickBg === 'rgb(255, 45, 70)', '12. a done set is ticked in the accent', tickBg);
    const q = H.sel('w', 0, 1); await page.click(q); await page.keyboard.type('190');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A'); await page.keyboard.type('195');
    await ev(() => document.activeElement.blur()); await wait(80);
    const typed = await ev(s => document.querySelector(s).value, q);
    ok(typed === '195', '12. a load typed, selected whole and typed over reads as the last typing (fields stay selectable)', typed);
    await H.type('r', 0, 1, 8); await H.tick(0, 1);
    // A set missed: 0 reps at the working load, ticked; it keeps the accent's tick and says missed.
    await H.type('w', 0, 2, 195); await H.type('r', 0, 2, 0); await H.tick(0, 2);
    await wait(100);
    const ask = await ev(() => { const m = window.__ironlog.ui.modal; return m ? m.title || m.kind : null; });
    if (ask) await page.click('#modal [data-act="mOk"]').catch(() => {}), await wait(120);
    const miss = await ev(() => { const b = document.querySelector('#view [data-act="sDone"][data-b="0"][data-s="2"]'); return b ? { label: b.getAttribute('aria-label'), bg: getComputedStyle(b).backgroundColor } : null; });
    ok(miss && /missed/.test(miss.label) && miss.bg === 'rgb(255, 45, 70)', '12. a 0-rep set ticked says missed and keeps the accent\'s tick, as in every accent', miss);
    const fin = await H.finish();
    const saved = await ev(() => { const S = window.__ironlog.state.sessions; const x = S[S.length - 1]; return x && x.date === '2026-10-05' ? x.ex[0].sets.map(s => [Math.round(s.w / 0.45359237), s.r]) : null; });
    ok(JSON.stringify(saved) === JSON.stringify([[185, 9], [195, 8], [195, 0]]), '12. Finish saves the three sets as typed, the missed one with them', { saved, fin });
    // The week bar: today trained, in the accent; a page reload keeps Red.
    await page.reload(); await page.waitForFunction(() => window.__ironlog && window.__ironlog.state); await wait(200);
    const after = await ev(() => ({ acc: document.documentElement.dataset.accent, set: window.__ironlog.state.settings.accent }));
    ok(after.acc === 'red' && after.set === 'red', '12. Red is still chosen after a reload', after);
    // History: the session's row counts the two sets done (a missed set counts toward no volume); opened, it shows all three, the missed one said.
    await page.click('#tabs [data-tab="history"]'); await wait(150);
    const sid = await ev(() => { const S = window.__ironlog.state.sessions; return S[S.length - 1].id; });
    await page.click(`#view [data-act="histToggle"][data-id="${sid}"]`); await wait(150);
    const hist = await ev(id => { const b = document.querySelector(`#view [data-act="histToggle"][data-id="${id}"]`); const it = b && b.closest('.hitem'); return it ? it.innerText : null; }, sid);
    ok(hist && /2 sets/.test(hist) && /missed/i.test(hist) && /195/.test(hist), '12. History opens the session: two sets counted, the missed one shown and said', hist);
    await H.P.ctx.close();
  }

  return finish();
})().catch(e => { console.error(e); process.exit(1); });
