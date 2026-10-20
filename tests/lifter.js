// Lifters over months (r55, V 2026-10-19: "why are the functions not run
// against actual use cases?"). Every other suite checks that behaviour did not
// change, or one case by hand; none asks whether the app does the right thing
// for a person training for months. Here a simulated lifter, whose reps at a
// load follow a strength that grows, holds or drops as set for the profile,
// trains through the app's own flow: the Today card's day started, the load the
// app suggests taken (grey, or filled), the reps the body can do typed, every
// set ticked, Finish answered. Then what a good coach would agree with:
//   - every set logged is saved, on the exercise it was done on;
//   - a lifter getting stronger progresses (more load, or more reps at the
//     same load, as double progression asks), in steps a coach would
//     allow (never more than about a tenth at once after the first sessions),
//     and the load does not swing up and down;
//   - the app never asks for a load the lifter cannot do for the bottom of the
//     range at the planned effort, give or take a rep;
//   - a lifter who stops getting stronger is not pushed up and up: the loads
//     level off, and a lift is read as stalled or holding; one losing
//     strength is never asked for what they cannot do;
//   - after five weeks off, the first session back is lighter, and the weeks
//     before the break are not counted as missed after it;
//   - a change of units mid-log keeps every suggestion on the new unit's step;
//   - Stats tells the truth: the streak, adherence, and no lift read falling
//     for a lifter getting stronger.
// The profiles are conventions of this suite (a strength model, rates of
// growth); the checks are about direction and limits, not exact numbers.
const { open } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); };
const FILE = process.argv[2] || process.env.IRONLOG_FILE || 'index.html';
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const MAIN = ['bench', 'backSquat', 'rdl', 'bbRow', 'latPulldown', 'ohp'];

// A page whose clock can be moved, on the starter routine (Upper / lower, 4 days), in kg unless told.
async function lifter(start, profile) {
  const setup = async ctx => { await ctx.addInitScript(`(()=>{const R=Date;let off=new R(${JSON.stringify(start + 'T08:00:00')}).getTime()-R.now();window.__setClock=t=>{off=new R(t).getTime()-R.now();};class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`); };
  const P = await open(FILE, { realStarter: true, setup });
  const ev = (f, a) => P.page.evaluate(f, a);
  await ev(([profile, start]) => {
    const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg'; L.saveNow();
    // Strength: a one-rep max per lift (kg) that changes week by week as the profile says; reps follow Brzycki's estimate
    // under 10 reps and Epley's above, less the reps left in reserve, and a half rep lost per set as fatigue.
    const base = { bench: 90, bbRow: 80, latPulldown: 70, cableFly: 30, dbLateral: 14, facePull: 30, pressdown: 35, inclineCurl: 16, backSquat: 120, rdl: 120, legExt: 70, seatedCurl: 60, standCalf: 100, cableCrunch: 50, incDb: 34, cableRow: 80, cableLateral: 12, reversePecDeck: 50, ohCableExt: 30, hammer: 20, hackSquat: 140, hipThrust: 140, lyingCurl: 50, bss: 30, seatedCalf: 80, ohp: 55 };
    window.__sim = {
      start, profile,
      grow(date) { const wk = (Date.parse(date) - Date.parse(start)) / 6048e5; let g = 0; for (const [from, to, rate] of profile) { const a = Math.max(from, 0), b = Math.min(to, wk); if (b > a) g += rate * (b - a); } return 1 + g; },
      orm(id, date) { return (base[id] || 50) * this.grow(date); },
      reps(id, w, rir, date, si, plan) {
        const ex = L.EX(id); if (ex && ex.bw) return Math.max(1, Math.min(12 - (rir || 0) - Math.floor(si / 2), (+plan.repMax || 12) + 2));
        const orm = this.orm(id, date); if (!(w > 0)) return +plan.repMin || 8;
        let rtf = w >= orm ? 1 : 37 - 36 * w / orm; if (rtf > 10) rtf = 30 * (orm / w - 1);
        return Math.max(0, Math.floor(rtf - (rir || 0) - si * 0.5));
      },
      firstLoad(id, plan) { const orm = this.orm(id, L.today()); const mid = ((+plan.repMin || 8) + (+plan.repMax || 12)) / 2 + (+plan.rir || 1) + 1; const w = mid <= 10 ? orm * (37 - mid) / 36 : orm / (1 + mid / 30); return Math.max(2.5, Math.round(w / 2.5) * 2.5); }
    };
  }, [profile, start]);
  // One session on the date given, the Today card's day, every planned set, the app's loads.
  const session = async date => {
    await ev(t => { window.__setClock(t); }, date + 'T18:00:00');
    const r = await ev(() => {
      const L = window.__ironlog; const S = window.__sim; L.invalidate(); L.ui.tab = 'today'; L.ui.todayDay = null; L.render();
      const btn = document.querySelector('.hero [data-act="startSession"]:not([data-light="1"])'); if (!btn) return { err: 'no start' };
      L.ACT.startSession({ dataset: { day: btn.dataset.day, light: '0' } });
      const d = L.state.draft; if (!d) return { err: 'no draft' };
      const out = [];
      d.ex.forEach((b, bi) => {
        const first = L.effW(b, 0); const rows = [];
        b.sets.forEach((s, si) => {
          if (s.warm || s.drop) return;
          let w = L.effW(b, si); if (w == null || (!(w > 0) && !L.EX(b.exId).bw)) { w = S.firstLoad(b.exId, b.plan); s.w = w; }
          const rir = +b.plan.rir || 0; const reps = S.reps(b.exId, w, rir, d.date, si, b.plan);
          s.r = reps; s.rir = rir; L.ACT.sDone({ dataset: { b: String(bi), s: String(si) } });
          // A load far off asks first; the simulated lifter typed it on purpose.
          if (L.ui.modal && L.ui.modal.kind === 'confirm') L.ACT.mOk();
          rows.push([w, reps]);
        });
        out.push({ id: b.exId, plan: [+b.plan.repMin, +b.plan.repMax, +b.plan.rir], sugg: first, hint: b.hint || '', rows, can: S.reps(b.exId, first == null ? 0 : first, +b.plan.rir || 0, d.date, 0, b.plan) });
      });
      L.saveNow(); return { ok: true, out, ticked: d.ex.reduce((a, b) => a + b.sets.filter(s => s.done).length, 0) };
    });
    if (r.err) return r;
    await ev(() => window.__ironlog.ACT.finish());
    for (let k = 0; k < 6; k++) {
      const m = await ev(() => { const m = window.__ironlog.ui.modal; return m ? m.kind : null; }); if (!m) break;
      await ev(() => { const L = window.__ironlog; if (L.ui.modal.kind === 'confirm') { if (/ramp-up|warm-up/i.test(document.getElementById('modal').innerText) && L.ui.modal.alt) L.ACT.mAlt(); else L.ACT.mOk(); } else L.ACT.mClose(); });
    }
    const saved = await ev(d => { const s = window.__ironlog.state.sessions.filter(x => x.date === d); return s.length ? s[s.length - 1].ex.reduce((a, b) => a + b.sets.length, 0) : -1; }, date);
    return { ...r, saved, open: await ev(() => !!window.__ironlog.state.draft) };
  };
  return { ...P, ev, session };
}
// Monday, Tuesday, Thursday and Friday of each week from the Monday given.
const weekDays = (mon, weeks) => Array.from({ length: weeks }, (_, w) => [0, 1, 3, 4].map(k => addD(mon, 7 * w + k))).flat();

(async () => {
  // ---- A lifter getting stronger, about 0.6% a week, for ten weeks; units switched to lb in week six.
  {
    const P = await lifter('2026-06-01', [[0, 99, 0.006]]);
    const log = []; let lost = 0, unsaved = 0;
    for (const d of weekDays('2026-06-01', 10)) {
      if (d === '2026-07-06') await P.ev(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; L.saveNow(); L.render(); });
      const r = await P.session(d); if (r.err) { ok(false, 'steady: a session ran on ' + d, r); break; }
      if (r.saved !== r.ticked) lost++; if (r.open) unsaved++;
      log.push({ d, out: r.out });
    }
    ok(log.length === 40 && lost === 0 && unsaved === 0, 'steady: 40 sessions through the app, every ticked set saved, none left open', { n: log.length, lost, unsaved });
    const series = id => log.flatMap(s => s.out.filter(x => x.id === id).map(x => ({ d: s.d, w: x.sugg, can: x.can, rmin: x.plan[0], reps: x.rows.reduce((a, r) => a + r[1], 0) })));
    const jumps = [], swings = [], impossible = [], flat = [];
    for (const id of MAIN) {
      const s = series(id).filter(x => x.w > 0); if (s.length < 6) continue;
      for (let i = 3; i < s.length; i++) if (s[i].w > s[i - 1].w * 1.12 + 1e-6) jumps.push([id, s[i - 1].d, s[i - 1].w, s[i].w]);
      let rev = 0; for (let i = 2; i < s.length; i++) if (s[i - 1].w > s[i - 2].w + 1e-6 && s[i].w < s[i - 1].w - 1e-6) rev++;
      if (rev > 1) swings.push([id, rev]);
      for (const x of s) if (x.can < x.rmin - 1) impossible.push([id, x.d, x.w, x.can, x.rmin]);
      // Double progression: more load, or at the same load (within the rounding of a unit change) more reps.
      const a = s[0], z = s[s.length - 1];
      if (!(z.w > a.w * 1.01 || (Math.abs(z.w - a.w) <= a.w * 0.01 && z.reps > a.reps))) flat.push([id, a.w, a.reps, z.w, z.reps]);
    }
    ok(flat.length === 0, 'steady: every main lift progresses by week ten: more load, or more reps at the same load', flat);
    ok(jumps.length === 0, 'steady: after the first three sessions no load is raised by more than about a tenth at once', jumps);
    ok(swings.length === 0, 'steady: no main lift\'s load goes up then down more than once in ten weeks', swings);
    ok(impossible.length === 0, 'steady: the app never suggests a load the lifter cannot do for the bottom of the range, give or take a rep', impossible.slice(0, 8));
    const st = await P.ev(() => { const L = window.__ironlog; L.invalidate(); const I = L.IDX(); return { streak: L.weekStreak().weeks, falling: Object.entries(I.exStats).filter(([, s]) => s.falling).map(([k]) => k) }; });
    ok(st.streak >= 9, 'steady: four sessions every week reads as a streak of 9 weeks or more', st.streak);
    ok(st.falling.length === 0, 'steady: no lift of a lifter getting stronger reads as falling', st.falling);
    const lbSugg = log.filter(s => s.d >= '2026-07-06').flatMap(s => s.out.filter(x => MAIN.includes(x.id) && x.sugg > 0).map(x => Math.round(x.sugg / 0.45359237 * 100) / 100));
    ok(lbSugg.length > 0 && lbSugg.every(w => Math.abs(w / 2.5 - Math.round(w / 2.5)) < 0.02), 'steady: after the switch to lb, every suggested load is on the lb step', lbSugg.filter(w => Math.abs(w / 2.5 - Math.round(w / 2.5)) >= 0.02).slice(0, 8));
    ok(!P.errors.length, 'steady: no page errors', P.errors);
    await P.browser.close();
  }

  // ---- A lifter who gains for four weeks, then stops gaining for six.
  {
    const P = await lifter('2026-06-01', [[0, 4, 0.008]]);
    const log = [];
    for (const d of weekDays('2026-06-01', 10)) { const r = await P.session(d); if (r.err) { ok(false, 'plateau: a session ran on ' + d, r); break; } log.push({ d, out: r.out }); }
    const over = [], impossible = [];
    for (const id of MAIN) {
      const s = log.flatMap(x => x.out.filter(y => y.id === id).map(y => ({ d: x.d, w: y.sugg, can: y.can, rmin: y.plan[0] }))).filter(x => x.w > 0);
      if (s.length < 6) continue;
      const atStop = Math.max(...s.filter(x => x.d < '2026-06-29').map(x => x.w));
      // Levelled off: in the last three weeks no load more than one step (or 5%) past the heaviest before the gains stopped.
      for (const x of s.filter(x => x.d >= '2026-07-20')) if (x.w > Math.max(atStop * 1.05, atStop + 2.5) + 1e-6) over.push([id, x.d, atStop, x.w]);
      for (const x of s) if (x.can < x.rmin - 1) impossible.push([id, x.d, x.w, x.can, x.rmin]);
    }
    ok(over.length === 0, 'plateau: once the gains stop, the loads level off within a step of where they were', over);
    ok(impossible.length === 0, 'plateau: the app never suggests a load the lifter cannot do for the bottom of the range, give or take a rep', impossible.slice(0, 8));
    const st = await P.ev(() => { const L = window.__ironlog; L.invalidate(); const I = L.IDX(); return { stalled: Object.entries(I.exStats).filter(([, s]) => s.stalled).map(([k]) => k), moving: Object.entries(I.exStats).filter(([, s]) => s.moving).map(([k]) => k) }; });
    ok(st.moving.filter(k => MAIN.includes(k)).length < MAIN.length, 'plateau: after six weeks of no gains, not every main lift still reads as moving', st);
    ok(!P.errors.length, 'plateau: no page errors', P.errors);
    await P.browser.close();
  }

  // ---- A beginner gaining fast (2% a week) for eight weeks, and a lifter losing strength (1% a week) for six after four steady.
  for (const [name, prof, weeks] of [['fast', [[0, 99, 0.02]], 8], ['losing', [[4, 99, -0.01]], 10]]) {
    const P = await lifter('2026-06-01', prof);
    const log = [];
    for (const d of weekDays('2026-06-01', weeks)) { const r = await P.session(d); if (r.err) { ok(false, name + ': a session ran on ' + d, r); break; } log.push({ d, out: r.out, lost: r.saved !== r.ticked }); }
    const jumps = [], impossible = [], stuck = [];
    for (const id of MAIN) {
      const s = log.flatMap(x => x.out.filter(y => y.id === id).map(y => ({ d: x.d, w: y.sugg, can: y.can, rmin: y.plan[0], reps: y.rows.reduce((a, r) => a + r[1], 0) }))).filter(x => x.w > 0);
      if (s.length < 5) continue;
      for (let i = 3; i < s.length; i++) if (s[i].w > s[i - 1].w * 1.12 + 1e-6) jumps.push([id, s[i - 1].d, s[i - 1].w, s[i].w]);
      for (const x of s) if (x.can < x.rmin - 1) impossible.push([id, x.d, x.w, x.can, x.rmin]);
      if (name === 'fast' && !(s[s.length - 1].w > s[0].w * 1.05)) stuck.push([id, s[0].w, s[s.length - 1].w]);
    }
    ok(log.length === weeks * 4 && log.every(x => !x.lost), name + ': every session ran and every ticked set was saved', log.length);
    ok(jumps.length === 0, name + ': after the first three sessions no load is raised by more than about a tenth at once', jumps);
    ok(impossible.length === 0, name + ': the app never suggests a load the lifter cannot do for the bottom of the range, give or take a rep', impossible.slice(0, 8));
    if (name === 'fast') ok(stuck.length === 0, 'fast: a beginner gaining 2% a week is given at least 5% more load on every main lift in eight weeks', stuck);
    ok(!P.errors.length, name + ': no page errors', P.errors);
    await P.browser.close();
  }

  // ---- Four weeks of training, five weeks off, then three weeks back.
  {
    const P = await lifter('2026-06-01', [[0, 4, 0.006], [4, 9, -0.004]]);
    const before = {}; const back = [];
    for (const d of weekDays('2026-06-01', 4)) { const r = await P.session(d); if (r.err) { ok(false, 'break: a session ran on ' + d, r); break; } for (const x of r.out) before[x.id] = x.rows.length ? x.rows[0][0] : before[x.id]; }
    let first = null;
    for (const d of weekDays('2026-08-03', 3)) { const r = await P.session(d); if (r.err) { ok(false, 'break: a session ran on ' + d, r); break; } if (!first) first = r; back.push(r); }
    const heavier = (first ? first.out : []).filter(x => MAIN.includes(x.id) && before[x.id] > 0 && x.sugg > before[x.id] * 0.95 + 1e-6).map(x => [x.id, before[x.id], x.sugg]);
    const said = (first ? first.out : []).filter(x => MAIN.includes(x.id) && before[x.id] > 0).every(x => /Back after \d+ weeks/.test(x.hint));
    ok(first && heavier.length === 0 && said, 'break: the first session back after five weeks off starts each main lift lighter, and says "Back after N weeks"', { heavier, hints: first && first.out.map(x => x.hint.slice(0, 60)) });
    const st = await P.ev(() => { const L = window.__ironlog; L.invalidate(); const a = L.actualAvg4(); return { missed: a ? a._missed : null, coach: L.coach().text }; });
    ok(st.missed === 0 && !/trained in \d+ of the last/.test(st.coach), 'break: three weeks after coming back, the weeks off before are not counted as missed', st);
    ok(!P.errors.length, 'break: no page errors', P.errors);
    await P.browser.close();
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed:', e && e.stack || e); process.exit(1); });
