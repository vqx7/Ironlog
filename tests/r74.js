// 2.29 (build r74; PENDING.md's tracker, item 396, the release V set on 2026-11-05), each section written as what a
// lifter expects and run first on 2.28 (`node tests/r74.js baselines/r73.html`, or on r73's index.html), where each
// section fails unless it says it guards:
//   1  387-B8 and NEW-62 (V, 2026-11-05: an exercise a lifter makes must count exactly as the library's does, with
//      no new settings in the editor): a lifter's own copy of a library core lift (bodyweight, main muscle abs,
//      obliques or neck) logged the same way reads the same everywhere a number is made: no best estimate, the
//      same Stats page, the same PRs, the same next target, the same weight lifted (2.28: the copy got a best
//      estimate, 40.6 kg on a knee raise at 80 kg bodyweight, and a Stats page the library's never shows). The share
//      of bodyweight is the editor's own field, typed as the library's. Every library lift answers as before (a guard:
//      the fingerprint printed is the same on 2.28 and 2.29).
//   2  NEW-69 and NEW-70 (390, V 2026-11-05: "the logic between KG and pounds needs to work and not break"), a lifter
//      who trained in one unit and now trains in the other (a gym in kg when travelling):
//      a. the last load, rounded to one the other unit's plates make by less than a step costs in reps, is the same
//         load: the reps to beat stand (2.28: 185 lb for 8, 8, 8 read in kg was 85 kg for 6+, reps back to the
//         bottom; a 60 lb pressdown done for 15s was 27.5 kg for 10+);
//      b. at the top of the range the step up is a whole step on the dumbbells or rack, never a sliver (2.28: 22.5 kg
//         dumbbells for 12s read in lb were "add 0.4 lb", 50 lb for 8+; NEW-6's rule, V 2026-10-27), with Your gym's
//         rack in lb too;
//      c. guards: in one unit throughout every answer is as before, and a rounding that does cost reps (12.5 kg
//         dumbbells read as 30 lb, 9% heavier, r54) still starts at the bottom of the range.
//   3  387-C6: a set left without an effort rating is read at the lift's usual rating as of its own date, so rating
//      later sessions never changes an old workout's numbers (2.28: Sep 15's 102.5 x 8 x 3, blank, had a best
//      estimate of 136.7 kg, and 127.2 kg once three October sessions were rated 0; the CSV export with it), and
//      today's blank set still reads the usual up to today (a guard).
//   4  NEW-71: with Corrected RIR on, a rated set is corrected by the RIR checks up to its own date, so a check logged
//      later never changes an old workout's estimate (2.28: Sep 15's 100 x 8 at 2 in reserve, 133.3 kg, then 136.7 once
//      two October checks were in), while Settings still shows the correction from every check to today (a guard).
//   5  2.27-F4: Undo keeps what an action changed, not two whole copies of the log. On two years of training (416
//      sessions, a 728 kB log), deleting a session keeps a step a small share of the log, and 20 deletes stay far
//      under two copies each (2.28: 35 MB for 20 steps, all of it rewritten to IndexedDB on each); Undo still puts each
//      session back exactly, newest first, and a set logged after a delete is kept; a step 2.28 saved (whole copies)
//      still undoes after the update; and a 2.28 tab reading 2.29's steps takes none (it would read a part as the
//      whole log), so it cannot undo anything wrongly.
//   6  NEW-72 (394): with no weigh-in, a bodyweight lift done with load added gets no best estimate and no estimate
//      PR (2.28: +20 kg pull-ups read "Best estimate ≈ 28.9 kg" and "best est 28.9 kg total", the added load alone);
//      its reps, weight PRs and next target are as before (a guard), and once a weigh-in is logged its estimates
//      appear, read at that weigh-in (a guard); the Guide says the rule once (394).
//   7  R74-1 (the independent review of 2.29): Undo of an action that made a sync document keeps what was logged in it
//      afterwards: an import, then cardio in its half-month, then Undo keeps the cardio; the year's first tape entry,
//      then a weigh-in that year, then Undo keeps the weigh-in (2.29 before this fix lost both; 2.28 kept them).
//   8  R74-2 (the review): a workout dated in the past says the same PR on the session screen as in its recap and the
//      PR list (2.29 before this fix: "New best estimate ... 136.5 kg", then "No PRs this time").
//   9  R74-3 (the review): with Corrected RIR on, today's usual reads every rating with today's correction, as 2.28
//      did (2.29 before this fix: usual 1, a blank set 1, a set rated 1 read at 2; 2.28: 2, 2, 2); a past date's
//      usual reads the correction known on that date, so a later check still changes no old workout (2.29's own rule, kept).
//   10 R75-1 (the second independent review): a workout dated in the past with ratings or an RIR check of its own
//      says one PR on the session screen, its row, the recap and the PR list (r75 before this fix: a best announced
//      then not counted, or counted and never announced), since a set is read against ratings and checks from
//      before its own day, which an open workout and a saved one share.
// R74_ONLY=1,2 runs some sections.
const { open, tab } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R74_ONLY ? process.env.R74_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const T = '2026-11-05';

// Section 10's helpers, from the second independent review of 2.29 (its scratch lib.js): a log seeded, a workout
// logged through the session screen (sets set as typed, each ticked with its own button), Finish and the recap.
// The log: settings merged in, sessions as given (each {id, date, exId, sets:[[w, r, rir, cal?], ...]} or ex: [...]).
async function seed(D, { settings = {}, sessions = [], bodyweights = [], cardio = [] } = {}) {
  await D.ev(
    ({ settings, sessions, bodyweights, cardio }) => {
      const L = window.__ironlog, S = L.state;
      S.settings.onboarded = true;
      S.settings.unit = 'kg';
      Object.assign(S.settings, settings);
      const mk = ([w, r, rir, cal, warm]) => ({ w, r, rir: rir == null ? null : rir, warm: !!warm, drop: false, ...(cal ? { cal } : {}) });
      S.sessions = sessions.map(s => ({
        id: s.id, date: s.date, dayIdx: 0, dayName: s.dayName || 'A', notes: '', ...(s.free ? { free: true } : {}),
        ex: (s.ex || [{ exId: s.exId, sets: s.sets }]).map(b => ({ exId: b.exId, rr: b.rr || [6, 10], sets: b.sets.map(mk) }))
      }));
      S.bodyweights = bodyweights;
      S.cardio = cardio;
      L.state = L.normalize(S);
      L.invalidate();
      L.saveNow();
      L.undoForget && L.undoForget();
      localStorage.setItem('ironlog.v1.tipWake', '1');
    },
    { settings, sessions, bodyweights, cardio }
  );
  await D.wait(150);
}

// Clears a confirm or question sheet in the way (its primary button), up to n times; returns their titles.
async function clearAsks(D, n = 4) {
  const seen = [];
  for (let i = 0; i < n; i++) {
    const k = await D.ev(() => { const L = window.__ironlog; return L.ui.modal ? L.ui.modal.kind : null; });
    if (!k || k === 'recap') break;
    const t = await D.ev(() => { const m = document.getElementById('modal'); return m ? m.innerText.replace(/\s+/g, ' ').slice(0, 140) : ''; });
    seen.push(k + ': ' + t);
    const ok = await D.page.$('#modal [data-act="mOk"]');
    if (ok) await ok.click(); else await D.ev(() => window.__ironlog.ACT.mClose && window.__ironlog.ACT.mClose());
    await D.wait(250);
  }
  return seen;
}

// A past workout from History's Log a past workout (or Add an old best with old: true), Freestyle, one lift added
// with the picker. Returns the block index.
async function startPast(D, date, exId, { old = false } = {}) {
  await D.ev(({ date, old }) => {
    const L = window.__ironlog; L.ui.tab = 'history'; L.render();
    if (old) { L.ACT.oldBestOpen(); L.ui.modal.date = date; } else L.ACT.pastOpen({ dataset: { date } });
    L.render();
  }, { date, old });
  await D.wait(200);
  const go = await D.page.$('#modal [data-act="pastGo"][data-day="free"]');
  if (go) await go.click(); else await D.ev(() => window.__ironlog.ACT.pastGo({ dataset: { day: 'free' } }));
  await D.wait(250);
  await addLift(D, exId);
  return D.ev(exId => window.__ironlog.state.draft.ex.findIndex(b => b.exId === exId), exId);
}

// Adds a lift from the open picker (or opens the picker first), then closes it.
async function addLift(D, exId) {
  let pick = await D.page.$(`#modal .pick[data-ex="${exId}"]`);
  if (!pick) {
    await D.ev(() => { const L = window.__ironlog; if (L.ui.modal && L.ui.modal.kind === 'picker') { L.ui.modal.q = ''; L.render(); } });
    pick = await D.page.$(`#modal [data-ex="${exId}"]`);
  }
  if (pick) await pick.click();
  else throw new Error('no picker row for ' + exId);
  await D.wait(250);
  await D.ev(() => { const L = window.__ironlog; if (L.ui.modal && L.ui.modal.kind === 'picker') { L.ACT.mClose ? L.ACT.mClose() : null; } });
  await D.wait(150);
}

// Today's workout, Freestyle, with one lift.
async function startTodayUnused(D, exId) {
  await D.ev(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
  await D.wait(150);
  const r = await D.ev(() => { const L = window.__ironlog; if (L.ACT.startFree) { L.ACT.startFree({ dataset: {} }); return 'free'; } return 'none'; });
  await D.wait(250);
  await D.ev(() => { const L = window.__ironlog; if (!(L.ui.modal && L.ui.modal.kind === 'picker')) L.openModal({ kind: 'picker', mode: 'addBlock', title: 'Add exercise to session', q: '', m: '' }); L.render(); });
  await D.wait(200);
  await addLift(D, exId);
  return D.ev(exId => window.__ironlog.state.draft.ex.findIndex(b => b.exId === exId), exId);
}

// The block's sets replaced by those given ([w, r, rir]), none ticked, as typed into their fields.
async function setRows(D, bi, rows) {
  await D.ev(({ bi, rows }) => {
    const L = window.__ironlog; const b = L.state.draft.ex[bi];
    const t = b.sets.find(x => !x.warm) || b.sets[0];
    b.sets = rows.map(([w, r, rir], i) => ({ ...JSON.parse(JSON.stringify(t)), rid: 'q' + i + Math.random().toString(36).slice(2, 6), w, r, rir: rir == null ? null : rir, warm: false, drop: false, done: false }));
    L.saveNow(); L.render();
  }, { bi, rows });
  await D.wait(150);
}

// Ticks each set with its button in order; after each, the toast shown and the rows marked PR.
async function tickAll(D, bi) {
  const n = await D.ev(bi => window.__ironlog.state.draft.ex[bi].sets.length, bi);
  const out = [];
  for (let si = 0; si < n; si++) {
    await D.ev(() => { const t = document.getElementById('toast'); if (t) { t.hidden = true; t.innerText = ''; } });
    // A folded block or a hidden button: open the block first.
    let btn = await D.page.$(`[data-act="sDone"][data-b="${bi}"][data-s="${si}"]`);
    if (!btn) { await D.ev(bi => { const o = document.querySelector(`[data-act="bOpen"][data-b="${bi}"]`); if (o) o.click(); }, bi); await D.wait(150); btn = await D.page.$(`[data-act="sDone"][data-b="${bi}"][data-s="${si}"]`); }
    await btn.click();
    await D.wait(250);
    const asked = await clearAsks(D, 2);
    const r = await D.ev(bi => {
      const L = window.__ironlog; const t = document.getElementById('toast');
      const d = L.state.draft; const b = d.ex[bi];
      return {
        toast: t && !t.hidden ? t.innerText.replace(/\s+/g, ' ') : '',
        rows: [...document.querySelectorAll(`.sg [data-act="sDone"][data-b="${bi}"]`)].map(x => x.closest('.sg').getAttribute('data-pr') || '-').join(','),
        done: b.sets.map(x => (x.done ? 1 : 0)).join(''),
        progress: (L.blockProgress(b) || {}).text || ''
      };
    }, bi);
    out.push({ si, ...r, asked });
  }
  return out;
}

// Finish, its questions answered with their primary button, then the recap and the saved session's PRs.
async function finish(D, date) {
  await D.ev(() => window.__ironlog.ACT.finish());
  await D.wait(300);
  const asked = await clearAsks(D, 5);
  return D.ev(date => {
    const L = window.__ironlog; const m = document.getElementById('modal');
    const s = [...L.state.sessions].reverse().find(x => x.date === date);
    const I = L.IDX();
    return {
      recap: m && !m.hidden ? m.innerText.replace(/\s+/g, ' ').slice(0, 400) : '',
      saved: !!s,
      prs: s ? I.prs.filter(p => p.sid === s.id).map(p => `${p.type}${p.big ? ' counted' : ''}${p.value != null ? ' ' + Math.round(p.value * 10) / 10 : ''}`) : null
    };
  }, date).then(r => ({ ...r, asked }));
}


(async () => {
  if (run(1)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog; const S = L.state;
      S.settings.onboarded = true; S.settings.unit = 'kg';
      S.bodyweights = [{ id: 'b1', date: '2026-09-01', kg: 80, demo: false }];
      const out = {};
      for (const libId of ['hangingLegRaise', 'kneeRaise', 'russianTwist', 'neckBridge']) {
        const lib = L.state.exercises.find(e => e.id === libId);
        // The lifter's own: the same fields as the library's, made in the editor, with an id of its own.
        // The share of bodyweight is a field the editor already shows (2.28's "Share of bodyweight"); the lifter types
        // the library's figure, so only the id differs.
        const own = Object.assign(JSON.parse(JSON.stringify(lib)), { id: 'own_' + libId, name: 'My ' + lib.name, custom: true, bwf: Math.round((L.tonnage(lib, { w: 0, r: 1 }, '2026-10-01') / 80) * 100) / 100 });
        S.exercises = S.exercises.filter(e => e.id !== own.id).concat([own]);
        const day = (d, id, sets) => ({ id: id + d, date: d, dayIdx: 0, dayName: 'Core', notes: '', ex: [{ exId: id, rr: [8, 15], sets: sets.map(([w, r, rir]) => ({ w, r, rir, warm: false, drop: false })) }] });
        const log = id => [day('2026-10-08', id, [[0, 10, 2], [0, 10, 2], [0, 9, 2]]), day('2026-10-15', id, [[0, 12, 2], [0, 11, 2], [0, 10, 2]]), day('2026-10-22', id, [[5, 10, 2], [5, 10, 2], [5, 9, 2]]), day('2026-10-29', id, [[5, 12, 1], [5, 12, 1], [5, 11, 1]])];
        S.sessions = [...log(libId), ...log(own.id)];
        L.state = L.normalize(S); L.invalidate(); L.saveNow();
        const plan = { sets: 3, repMin: 8, repMax: 15, rir: 1, rest: 90 };
        const read = id => {
          const r1 = v => (v == null ? null : Math.round(v * 10) / 10);
          const idx = (L.IDX().byEx[id] || []).map(x => ({ date: x.date, best: r1(x.best), bb: r1(x.bb), pb: r1(x.pb), pbb: r1(x.pbb), vol: r1(x.vol), topW: x.topW, pts: x.pts.length }));
          const prs = L.IDX().prs.filter(p => p.exId === id).map(p => p.date + ' ' + p.type + (p.big ? ' counted' : ''));
          const st = L.IDX().exStats[id] || null;
          const g = L.suggest(id, plan, {});
          const tons = S.sessions.filter(s => s.ex[0].exId === id).map(s => Math.round(s.ex[0].sets.reduce((a, x) => a + L.tonnage(L.state.exercises.find(e => e.id === id), x, s.date), 0)));
          return { idx, prs, w: g.w, target: g.target, tons, noE1: L.noE1(L.state.exercises.find(e => e.id === id)), st: st && JSON.stringify(st, (k, v) => (k === 'sid' ? undefined : typeof v === 'number' ? Math.round(v * 10) / 10 : v)) };
        };
        out[libId] = { lib: read(libId), own: read(own.id) };
      }
      // Every library lift's answer to the rule, by id, for the guard.
      out.libNoE1 = L.state.exercises.filter(e => !e.custom).map(e => e.id + ':' + (L.noE1(e) ? 1 : 0)).join(',');
      return out;
    });
    for (const id of ['hangingLegRaise', 'kneeRaise', 'russianTwist', 'neckBridge']) {
      const { lib, own } = r[id];
      ok(lib.noE1 && lib.idx.length === 4 && lib.idx.every(x => x.best == null), `1. the library's ${id} has no best estimate (a guard: the test reads the right field)`, lib);
      ok(own.noE1 && JSON.stringify(own.idx) === JSON.stringify(lib.idx), `1. 387-B8: my own ${id} has no best estimate, read session for session as the library's (2.28: an estimate on mine)`, { lib: lib.idx, own: own.idx });
      ok(own.st === lib.st, `1. 387-B8: my own ${id} reads the same on its Stats page as the library's`, { lib: lib.st, own: own.st });
      ok(JSON.stringify(own.prs) === JSON.stringify(lib.prs), `1. 387-B8: my own ${id} makes the same PRs as the library's`, { lib: lib.prs, own: own.prs });
      ok(own.w === lib.w && own.target === lib.target, `1. 387-B8: my own ${id} gets the same next target as the library's`, { lib: [lib.w, lib.target], own: [own.w, own.target] });
      ok(JSON.stringify(own.tons) === JSON.stringify(lib.tons), `1. 387-B8: my own ${id} counts the same weight lifted as the library's`, { lib: lib.tons, own: own.tons });
    }
    ok(typeof r.libNoE1 === 'string' && r.libNoE1.length > 100, '1. the library\'s answers were read (a guard)', r.libNoE1.length);
    console.log('note libNoE1 ' + require('crypto').createHash('sha1').update(r.libNoE1).digest('hex'));
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(2)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const LB = 0.45359237;
    const r = await D.page.evaluate(LB => {
      const L = window.__ironlog;
      const go = (id, unit, kgLoad, reps, lo, hi, gym) => {
        const S = L.state; S.settings.onboarded = true; S.settings.unit = unit;
        if (gym) S.settings.gym = gym; else delete S.settings.gym;
        S.sessions = [0, 1, 2].map(i => ({ id: 'u' + i, date: ['2026-10-15', '2026-10-22', '2026-10-29'][i], dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: id, rr: [lo, hi], sets: [0, 1, 2].map(() => ({ w: kgLoad, r: reps, rir: 1, warm: false, drop: false })) }] }));
        L.state = L.normalize(S); L.invalidate();
        const g = L.suggest(id, { sets: 3, repMin: lo, repMax: hi, rir: 1, rest: 120 }, {});
        return { lb: g.w == null ? null : Math.round((g.w / LB) * 1000) / 1000, kg: g.w == null ? null : Math.round(g.w * 1000) / 1000, kind: g.tgt && g.tgt.kind, repMin: g.tgt && g.tgt.repMin, target: g.target, text: g.text };
      };
      return {
        benchKg: go('bench', 'kg', 185 * LB, 8, 6, 10),
        pressKg: go('pressdown', 'kg', 60 * LB, 15, 10, 15),
        dbLb: go('dbBench', 'lb', 22.5, 12, 8, 12),
        dbLbRack: go('dbBench', 'lb', 22.5, 12, 8, 12, { u: 'lb', db: { lo: 5, hi: 120, st: 5 } }),
        incDb: go('incDb', 'lb', 12.5, 10, 8, 12),
        same: [
          go('bench', 'lb', 185 * LB, 10, 6, 10), go('bench', 'lb', 185 * LB, 8, 6, 10), go('dbBench', 'lb', 50 * LB, 12, 8, 12),
          go('pressdown', 'lb', 60 * LB, 15, 10, 15), go('backSquat', 'kg', 100, 8, 5, 8), go('dbBench', 'kg', 22.5, 12, 8, 12),
          go('backSquat', 'lb', 100, 8, 5, 8, { u: 'kg', plates: [25, 20, 15, 10, 5, 2.5, 1.25] })
        ].map(x => x.target)
      };
    }, LB);
    const { benchKg, pressKg, dbLb, dbLbRack, incDb } = r;
    ok(benchKg.kind === 'reps' && Math.abs(benchKg.kg - 185 * LB) <= 2.5 && /is the nearest load in kg to what you did: aim for 25\+ reps over 3 sets at 85 kg\./.test(benchKg.text), '2a. NEW-69: 185 lb for 8, 8, 8 on 6 to 10, now in kg: the nearest load the plates make, beating 24 reps there, not reps back to 6 (2.28: 85 kg for 6+)', benchKg);
    ok(pressKg.kind === 'reps' && Math.abs(pressKg.kg - 60 * LB) <= 1.25 && !/at 27\.5 kg hit/.test(pressKg.text), '2a. NEW-69: a 60 lb pressdown done for 15, 15, 15 on 10 to 15, now in kg: still building reps at that weight, not 10+ (2.28: 27.5 kg for 10+)', pressKg);
    ok((dbLb.lb >= 54.6 - 0.05 || (dbLb.kind === 'reps' && /build every set to \d+ here first/.test(dbLb.text))) && !/add 0\.\d lb/.test(dbLb.text), '2b. NEW-70: 22.5 kg dumbbells for 12, 12, 12 on 8 to 12, now in lb: a whole step up, 55 lb (or more reps first), never "add 0.4 lb" (2.28: 50 lb for 8+)', dbLb);
    ok((dbLbRack.lb >= 54.6 - 0.05 || (dbLbRack.kind === 'reps' && /build every set to \d+ here first/.test(dbLbRack.text))) && !/add 0\.\d lb/.test(dbLbRack.text), '2b. NEW-70: the same on Your gym\'s dumbbells in lb, 5 to 120 by 5', dbLbRack);
    ok(incDb.lb === 30 && incDb.kind === 'load' && incDb.repMin === 8, '2c. guard (r54): 12.5 kg dumbbells for 10s read in lb go to 30 lb, 9% heavier, for 8+ reps', incDb);
    ok(JSON.stringify(r.same) === JSON.stringify(['195 lb for 6+ reps in every set', '25+ reps over 3 sets at 185 lb', '55 lb per dumbbell for 8+ reps in every set', '46+ reps over 3 sets at 60 lb, building to 17 each', '105 kg for 5+ reps in every set', '25 kg per dumbbell for 8+ reps in every set', '226 lb for 5+ reps in every set']), '2c. guard: lifts in one unit throughout, and a kg gym\'s plates shown in lb, answer as on 2.28', r.same);
    ok(!D.errors.length, '2. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(3)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const fs = require('fs');
    const setUp = withLater => D.page.evaluate(withLater => {
      const L = window.__ironlog, S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg';
      const ses = (i, d, w, reps, rir) => ({ id: 'q' + i, date: d, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: reps.map(r => ({ w, r, rir, warm: false, drop: false })) }] });
      const base = [ses(1, '2026-09-01', 100, [8, 8, 8], 2), ses(2, '2026-09-08', 100, [8, 8, 8], 2), ses(3, '2026-09-15', 102.5, [8, 8, 8], null)];
      const later = [ses(4, '2026-10-06', 102.5, [8, 8, 8], 0), ses(5, '2026-10-13', 102.5, [8, 8, 8], 0), ses(6, '2026-10-20', 102.5, [8, 8, 8], 0)];
      S.sessions = withLater ? [...base, ...later] : base;
      L.state = L.normalize(S); L.invalidate(); L.saveNow();
      const x = L.IDX().byEx.bench.find(e => e.sid === 'q3');
      return { best: Math.round(x.best * 10) / 10, prs: L.IDX().prs.filter(p => p.date === '2026-09-15').map(p => p.type).join(','), today: L.rirEst({ w: 102.5, r: 8, rir: null }, L.EX('bench')) };
    }, withLater);
    const csvRows = async () => {
      const [dl] = await Promise.all([D.page.waitForEvent('download'), D.page.evaluate(() => window.__ironlog.exportCSV())]);
      return fs.readFileSync(await dl.path(), 'utf8').split(/\r?\n/).filter(l => l.startsWith('2026-09-15')).join('|');
    };
    const before = await setUp(false); before.csv = await csvRows();
    const after = await setUp(true); after.csv = await csvRows();
    const r = { before, after };
    ok(r.before.best === 136.7 && r.after.best === r.before.best && r.after.prs === r.before.prs, '3. 387-C6: Sep 15, left unrated, keeps its best estimate and PRs once later sessions are rated (2.28: 136.7 kg, then 127.2)', r);
    ok(r.before.csv && r.after.csv === r.before.csv, '3. 387-C6: the CSV export\'s Sep 15 rows are the same before and after', { before: r.before.csv, after: r.after.csv });
    ok(r.before.today === 2 && r.after.today === 0, '3. guard: a blank set today reads the usual up to today, 2 before October and 0 after', [r.before.today, r.after.today]);
    ok(!D.errors.length, '3. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(4)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog, S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg'; S.settings.rirMode = 'cal';
      const set = (w, r, rir, cal) => ({ w, r, rir, warm: false, drop: false, ...(cal ? { cal } : {}) });
      const ses = (i, d, sets) => ({ id: 'k' + i, date: d, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets }] });
      const base = [ses(1, '2026-09-15', [set(100, 8, 2), set(100, 8, 2), set(100, 8, 2)])];
      // Two RIR checks in October: called 2 in reserve at 8, then 12 done, 2 more than called.
      const later = [ses(2, '2026-10-06', [set(100, 8, 2), set(100, 12, null, { at: 8, pred: 2 })]), ses(3, '2026-10-13', [set(100, 8, 2), set(100, 12, null, { at: 8, pred: 2 })])];
      const read = () => { L.state = L.normalize(S); L.invalidate(); const x = L.IDX().byEx.bench.find(e => e.sid === 'k1'); return { best: Math.round(x.best * 10) / 10, bias: L.calStats().bias, n: L.calStats().recent }; };
      S.sessions = [...base]; const a = read(); S.sessions = [...base, ...later]; const b = read();
      return { a, b };
    });
    ok(r.a.best === 133.3 && r.b.best === r.a.best, '4. NEW-71: Sep 15 keeps its estimate once later RIR checks are in (2.28: 133.3 kg, then 136.7)', r);
    ok(r.a.n === 0 && r.b.n === 2 && r.b.bias > 0, '4. guard: Settings\' correction reads every check to today', r);
    ok(!D.errors.length, '4. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(5)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const ev = (f, a) => D.page.evaluate(f, a);
    const wait = ms => D.page.waitForTimeout(ms);
    await ev(() => {
      const L = window.__ironlog, S = L.state; S.settings.onboarded = true;
      const ids = ['bench', 'backSquat', 'dbBench', 'pressdown', 'incDb', 'skull', 'rdl', 'hackSquat']; const ss = [];
      let d = new Date('2024-11-05T12:00:00'), i = 0;
      while (d < new Date('2026-11-01T12:00:00')) {
        for (const k of [0, 2, 4, 5]) { const x = new Date(d); x.setDate(x.getDate() + k); const ds = x.toISOString().slice(0, 10);
          ss.push({ id: 'p' + i, date: ds, dayIdx: 0, dayName: 'Push', notes: 'felt good', ex: ids.slice(i % 3, (i % 3) + 6).map(e => ({ exId: e, rr: [8, 12], sets: [0, 1, 2, 3].map(j => ({ w: 60 + j, r: 10, rir: 2, warm: false, drop: false })) })) }); i++; }
        d.setDate(d.getDate() + 7);
      }
      S.sessions = ss; L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.undoForget();
    });
    await wait(500);
    const logKB = await ev(() => JSON.stringify(window.__ironlog.state).length / 1024);
    const canon = () => ev(() => JSON.stringify(window.__ironlog.normalize(JSON.parse(JSON.stringify(window.__ironlog.state)))));
    const before = await canon();
    const del = async id => { await ev(id => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histDel({ dataset: { id } }); }, id); await D.page.click('[data-act="mOk"]'); await wait(60); };
    await del('p100');
    const one = await ev(() => { const L = window.__ironlog; const e = L.undoStack[L.undoStack.length - 1]; return JSON.stringify({ ...e, inv: undefined }).length / 1024; });
    ok(one < logKB * 0.1, `5. 2.27-F4: a session deleted on a ${Math.round(logKB)} kB log keeps an Undo step of ${Math.round(one)} kB, under a tenth of the log (2.28: two whole copies)`, { one, logKB });
    for (let k = 0; k < 19; k++) await del('p' + (200 + k * 7));
    await wait(700);
    const all = await ev(() => window.__ironlog.undoStack.reduce((a, e) => a + JSON.stringify({ ...e, inv: undefined }).length, 0) / 1024);
    const saved = await ev(() => new Promise(r => { const q = indexedDB.open('ironlog-undo', 1); q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('stack'); g.onsuccess = () => r(JSON.stringify(g.result || []).length / 1024); }; }));
    ok(all < logKB * 2 && saved < logKB * 2, `5. 2.27-F4: 20 deletes keep ${Math.round(all)} kB of Undo steps, ${Math.round(saved)} kB in IndexedDB, under two copies of the log in all (2.28: about 40 copies)`, { all, saved, logKB });
    // A set logged after the deletes: Undo takes the deletes back and keeps it.
    await ev(() => { const L = window.__ironlog; L.act(() => { L.state.bodyweights.push({ id: 'after', date: '2026-11-05', kg: 81 }); }); });
    for (let k = 0; k < 20; k++) await ev(() => window.__ironlog.ACT.undo());
    const back = await ev(() => { const L = window.__ironlog; const S = JSON.parse(JSON.stringify(L.state)); const kept = S.bodyweights.some(b => b.id === 'after'); S.bodyweights = S.bodyweights.filter(b => b.id !== 'after'); S.trash = []; return { kept, now: JSON.stringify(L.normalize(S)), n: L.state.sessions.length }; });
    const want = JSON.parse(before); want.trash = [];
    const diffKeys = (() => { const a = JSON.parse(back.now), b = want; const out = []; for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) { if (Array.isArray(a[k]) && Array.isArray(b[k])) { const n = Math.max(a[k].length, b[k].length); for (let i = 0; i < n && out.length < 4; i++) if (JSON.stringify(a[k][i]) !== JSON.stringify(b[k][i])) out.push({ k, i, now: JSON.stringify(a[k][i]).slice(0, 300), want: JSON.stringify(b[k][i]).slice(0, 300) }); } else out.push({ k, now: JSON.stringify(a[k]).slice(0, 300), want: JSON.stringify(b[k]).slice(0, 300) }); } return out; })();
    ok(back.kept && back.n === want.sessions.length && back.now === JSON.stringify(want), '5. 2.27-F4: Undo puts all 20 sessions back exactly, and keeps a weigh-in logged after them', { kept: back.kept, n: back.n, diff: diffKeys });
    // A step 2.28 saved, whole copies of the log, read after the update: it still undoes.
    await ev(() => { const L = window.__ironlog; L.undoForget(); });
    await wait(300);
    await ev(async () => { const L = window.__ironlog; const pre = JSON.stringify(L.state); const S = JSON.parse(pre); S.sessions = S.sessions.filter(x => x.id !== 'p300'); const post = JSON.stringify(L.normalize(S));
      L.state = L.normalize(S); L.invalidate(); L.saveNow();
      await new Promise(r => { const q = indexedDB.open('ironlog-undo', 1); q.onsuccess = () => { const tx = q.result.transaction('kv', 'readwrite'); tx.objectStore('kv').put([{ pre, post, t: Date.now() }], 'stack'); tx.oncomplete = r; }; }); });
    await D.page.reload(); await wait(800);
    const old = await ev(() => { const L = window.__ironlog; const n0 = L.undoStack.length; L.ACT.undo(); return { n0, back: L.state.sessions.some(x => x.id === 'p300') }; });
    ok(old.n0 === 1 && old.back, '5. 2.27-F4: a step saved by 2.28 (whole copies) still undoes after the update', old);
    // 2.29 saves a step; a tab still on 2.28 reading it takes none (2.28 reads pre as the whole log).
    // 2.28's build: R74_OLD, else baselines/r73.html once 2.28 is published (CLAUDE.md, Releasing).
    const OLD = process.env.R74_OLD || (require('fs').existsSync('baselines/r73.html') ? 'baselines/r73.html' : null);
    if (OLD) {
      await del('p310'); await wait(700);
      const T2 = await tab(D, OLD); await T2.page.waitForTimeout(800);
      const n28 = await T2.page.evaluate(() => window.__ironlog.undoStack.length);
      ok(n28 === 0, '5. 2.27-F4: a tab on 2.28 takes none of 2.29\'s Undo steps', n28);
    } else console.log('note 5: no 2.28 build here yet (baselines/r73.html is added once 2.28 is published; R74_OLD names one), the 2.28 tab check skipped');
    ok(!D.errors.length, '5. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(6)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog, S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg';
      const ses = (i, d, w, r) => ({ id: 'w' + i, date: d, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'pullup', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w, r, rir: 1, warm: false, drop: false })) }] });
      S.sessions = [ses(1, '2026-10-08', 20, 8), ses(2, '2026-10-15', 20, 9), ses(3, '2026-10-22', 0, 12), ses(4, '2026-10-29', 22.5, 8)];
      const read = () => { L.state = L.normalize(S); L.invalidate(); const I = L.IDX(); const b = L.allTimeBests('pullup');
        return { bests: I.byEx.pullup.map(x => x.best == null ? null : Math.round(x.best)), prs: I.prs.filter(p => p.exId === 'pullup').map(p => p.date + ' ' + p.type), atb: b && b.est ? Math.round(b.est.v) : null,
          next: L.suggest('pullup', { sets: 3, repMin: 6, repMax: 10, rir: 1, rest: 120 }, {}).target }; };
      S.bodyweights = []; const none = read();
      S.bodyweights = [{ id: 'b1', date: '2026-11-01', kg: 80, demo: false }]; const weighed = read();
      return { none, weighed };
    });
    ok(r.none.bests.every(v => v == null) && r.none.atb == null && !r.none.prs.some(p => /e1RM/.test(p)), '6. NEW-72: no weigh-in, weighted pull-ups get no best estimate and no estimate PR (2.28: 26 to 29 kg, the added load alone)', r.none);
    ok(r.none.prs.includes('2026-10-29 Weight PR') && /BW\+22\.5/.test(r.none.next), '6. guard: their weight PR and next target are as before', r.none);
    ok(r.weighed.bests.filter((v, i) => i !== 2).every(v => v != null && v > 100) && r.weighed.atb > 100, '6. guard: once a weigh-in is logged, estimates read the body and the load (over 100 kg at 80 kg; the session of 12 with none added is past the estimate\'s reps either way)', r.weighed);
    const guide = await D.page.evaluate(() => { const L = window.__ironlog; L.ACT.guideOpen({ dataset: {} }); return document.documentElement.innerHTML; });
    ok(/With no weigh-in they count only the weight you add\. Estimates and trends wait for one\./.test(guide), '6. 394: the Guide says once what a bodyweight lift reads with no weigh-in', null);
    ok(!D.errors.length, '6. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(7)) {
    // Import, then cardio in the same half-month from the cardio sheet, then Settings' Undo.
    {
      const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
      const ev = (f, a) => D.page.evaluate(f, a), wait = ms => D.page.waitForTimeout(ms);
      await ev(() => { const L = window.__ironlog, S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg';
        const ses = (i, d) => ({ id: 'own' + i, date: d, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: 100, r: 8, rir: 2, warm: false, drop: false })) }] });
        S.sessions = [ses(1, '2026-10-06'), ses(2, '2026-10-13'), ses(3, '2026-10-20')]; L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.undoForget(); });
      await wait(300);
      await ev(t => window.__ironlog.impStart({ text: t }), 'Nov 3\nSquat 120kg x 5, 120kg x 5'); await wait(300);
      await ev(() => window.__ironlog.ACT.impGo()); await wait(300);
      await ev(() => { const L = window.__ironlog; L.ACT.mClose && L.ACT.mClose(); L.ACT.cardioNew(); }); await wait(200);
      await D.page.fill('#cMin', '30'); await D.page.click('#modal [data-act="cardioSave"]'); await wait(300);
      await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); L.ACT.undo(); }); await wait(300);
      const r = await ev(() => { const L = window.__ironlog; const saved = JSON.parse(localStorage.getItem(L.KEY));
        return { sessions: L.state.sessions.map(s => s.date), cardio: L.state.cardio.map(c => c.date + ' ' + c.min), saved: (saved.cardio || []).length }; });
      ok(r.cardio.length === 1 && r.saved === 1 && !r.sessions.includes('2026-11-03'), '7. R74-1: an import, then 30 min of cardio, then Undo: the import goes and the cardio stays, saved (2.29 before: the cardio deleted too)', r);
      ok(!D.errors.length, '7. no page errors (import)', D.errors);
      await D.browser.close();
    }
    // The year's first tape entry, then a weigh-in that year, then Undo.
    {
      const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
      const ev = (f, a) => D.page.evaluate(f, a), wait = ms => D.page.waitForTimeout(ms);
      await ev(() => { const L = window.__ironlog, S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg';
        S.bodyweights = [{ id: 'old1', date: '2025-12-20', kg: 82, demo: false }]; S.measurements = []; S.settings.hidden = [];
        L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.undoForget(); L.ui.tab = 'today'; L.render(); });
      await wait(300);
      await ev(() => { document.getElementById('ms_waist').value = '84'; window.__ironlog.ACT.addMeas(); }); await wait(200);
      await ev(() => { document.getElementById('bwVal').value = '81'; window.__ironlog.ACT.addBW({ dataset: {} }); }); await wait(200);
      await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); L.ACT.undo(); }); await wait(300);
      const r = await ev(() => { const L = window.__ironlog; const saved = JSON.parse(localStorage.getItem(L.KEY));
        return { bw: L.state.bodyweights.map(b => b.date + ' ' + b.kg), meas: L.state.measurements.length, saved: saved.bodyweights.map(b => b.date) }; });
      ok(r.bw.includes('2026-11-05 81') && r.saved.includes('2026-11-05') && r.meas === 0, '7. R74-1: the year\'s first tape entry, then a weigh-in, then Undo: the tape entry goes and the weigh-in stays, saved (2.29 before: the weigh-in deleted too)', r);
      ok(!D.errors.length, '7. no page errors (tape)', D.errors);
      await D.browser.close();
    }
  }

  if (run(8)) {
    // History's Add an old best on Sep 15: the session screen's PR and the recap's are one.
    const D = await open(FILE, { touch: true, w: 390, h: 844, clock: T + 'T10:00:00' });
    const { page } = D; const ev = (f, a) => page.evaluate(f, a); const wait = ms => page.waitForTimeout(ms);
    await ev(() => { const L = window.__ironlog, S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg';
      const ses = (i, d, w, rir) => ({ id: 'h' + i, date: d, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w, r: 8, rir, warm: false, drop: false })) }] });
      S.sessions = [ses(1, '2026-08-25', 100, 0), ses(2, '2026-09-01', 100, 0), ses(3, '2026-09-08', 100, 0), ses(4, '2026-10-06', 85, 3), ses(5, '2026-10-13', 85, 3), ses(6, '2026-10-20', 85, 3), ses(7, '2026-10-27', 85, 3)];
      L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'history'; L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
    await ev(() => window.__ironlog.ACT.oldBestOpen()); await wait(200);
    await ev(() => { window.__ironlog.ui.modal.date = '2026-09-15'; });
    const go = await page.$('#modal [data-act="pastGo"][data-day="free"]');
    if (go) await go.click(); else await ev(() => window.__ironlog.ACT.pastGo({ dataset: { day: 'free' } }));
    await wait(300);
    const pick = await page.$('#modal .pick[data-ex="bench"]');
    if (pick) await pick.click(); else await ev(() => { const el = document.querySelector('#modal [data-ex="bench"]'); if (el) el.click(); });
    await wait(300);
    const bi = await ev(() => window.__ironlog.state.draft.ex.findIndex(b => b.exId === 'bench'));
    await page.fill(`input[data-b="${bi}"][data-s="0"][data-f="w"]`, '100');
    await page.fill(`input[data-b="${bi}"][data-s="0"][data-f="r"]`, '8');
    await page.press(`input[data-b="${bi}"][data-s="0"][data-f="r"]`, 'Tab'); await wait(400);
    const done = await ev(bi => window.__ironlog.state.draft.ex[bi].sets[0].done, bi);
    if (!done) { await page.click(`[data-act="sDone"][data-b="${bi}"][data-s="0"]`); await wait(300); }
    const toast = await ev(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText : ''; });
    await ev(() => window.__ironlog.ACT.finish()); await wait(300);
    const okBtn = await page.$('#modal [data-act="mOk"]'); if (okBtn) { await okBtn.click(); await wait(300); }
    const after = await ev(() => { const L = window.__ironlog; const s = L.state.sessions.find(x => x.date === '2026-09-15'); const m = document.getElementById('modal');
      return { recap: m && !m.hidden ? m.innerText.replace(/\s+/g, ' ') : '', prs: s ? L.IDX().prs.filter(p => p.sid === s.id && p.big).map(p => p.type) : null }; });
    const toastPR = /New best estimate|PR/.test(toast), recapPR = /NEW PR/.test(after.recap), listPR = !!(after.prs && after.prs.length);
    ok(toastPR === recapPR && recapPR === listPR, '8. R74-2: a workout dated Sep 15 says one PR on the session screen, in the recap and in the PR list (2.29 before: a best estimate announced, then "No PRs this time")', { toast, recap: after.recap.slice(0, 200), prs: after.prs });
    ok(!D.errors.length, '8. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(9)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog, S = L.state; S.settings.onboarded = true; S.settings.unit = 'kg'; S.settings.rirMode = 'cal';
      const set = (w, r, rir, cal) => ({ w, r, rir, warm: false, drop: false, ...(cal ? { cal } : {}) });
      const ses = (i, d, sets) => ({ id: 'k' + i, date: d, dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets }] });
      S.sessions = [ses(1, '2026-08-20', [set(100, 8, 1), set(100, 8, 1), set(100, 8, 1)]), ses(2, '2026-09-03', [set(100, 8, 1), set(100, 8, 1), set(100, 8, 1)]), ses(3, '2026-09-17', [set(100, 8, 1), set(100, 8, 1), set(100, 8, 1)]),
        ses(4, '2026-10-06', [set(95, 8, 1), set(95, 12, null, { at: 8, pred: 2 })]), ses(5, '2026-10-13', [set(95, 8, 1), set(95, 12, null, { at: 8, pred: 2 })])];
      L.state = L.normalize(S); L.invalidate();
      const ex = L.EX('bench');
      return { usual: L.rirUsual('bench'), blank: L.rirEst({ w: 105, r: 8, rir: null, done: true }, ex), rated: L.rirEst({ w: 105, r: 8, rir: 1, done: true }, ex),
        sepUsual: L.rirUsual('bench', '2026-09-20') };
    });
    ok(r.usual === 2 && r.blank === 2 && r.rated === 2, '9. R74-3: Corrected RIR on, today: the usual, a blank set and a set rated at the usual all read 2, as on 2.28 (2.29 before: 1, 1, 2)', r);
    ok(r.sepUsual === 1, '9. NEW-71 kept (2.29\'s own rule, so it fails on 2.28): Sep 20\'s usual reads the correction known then (none), so October\'s checks change no September workout', r);
    ok(!D.errors.length, '9. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(10)) {
    const cases = [
      ['its own two ratings of 0', 'on', [{ id: 'h1', date: '2026-09-01', exId: 'bench', sets: [[100, 8, 2]] }, { id: 'h2', date: '2026-10-06', exId: 'bench', sets: [[85, 8, 3], [85, 8, 3], [85, 8, 3]] }], '2026-09-15', [[100, 8, 0], [100, 8, 0], [100, 8, null]], false],
      ['its own two ratings of 4', 'on', [{ id: 'h1', date: '2026-09-01', exId: 'bench', sets: [[100, 8, 2]] }, { id: 'h2', date: '2026-10-06', exId: 'bench', sets: [[85, 8, 0], [85, 8, 0], [85, 8, 0]] }], '2026-09-15', [[90, 8, 4], [90, 8, 4], [100, 8, null]], false],
      ['its own RIR check, Corrected RIR on', 'cal', [{ id: 'h1', date: '2026-06-01', exId: 'bench', sets: [[100, 8, 2]] }, { id: 'h2', date: '2026-06-03', exId: 'bench', sets: [[80, 12, null, { at: 8, pred: 2 }]] }], '2026-06-10', [[100, 8, 2], [80, 12, null]], true]
    ];
    for (const [name, mode, sessions, date, rows, check] of cases) {
      const D = await open(FILE, { touch: true, w: 390, h: 844, clock: T + 'T10:00:00' });
      D.ev = (f, a) => D.page.evaluate(f, a); D.wait = ms => D.page.waitForTimeout(ms);
      await seed(D, { settings: { rirMode: mode }, sessions });
      const bi = await startPast(D, date, 'bench');
      await setRows(D, bi, rows);
      if (check) await D.ev(bi => { const X = window.__ironlog; X.state.draft.ex[bi].sets[1].cal = { at: 8, pred: 2 }; X.saveNow(); X.render(); }, bi);
      const ticks = await tickAll(D, bi);
      const fin = await finish(D, date);
      const toastPR = ticks.some(t => /New best estimate|PR:/.test(t.toast)), rowPR = /Best|PR/.test(ticks[ticks.length - 1].rows);
      const recapPR = /No PRs this time/.test(fin.recap) ? false : /NEW PR/.test(fin.recap), listPR = !!(fin.prs && fin.prs.some(p => /counted/.test(p)));
      ok(toastPR === rowPR && rowPR === recapPR && recapPR === listPR && fin.saved, `10. R75-1: a past workout with ${name}: the toast, its row, the recap and the PR list say one thing (r75 before: they disagreed)`, { toastPR, rowPR, recapPR, listPR, toasts: ticks.map(t => t.toast).filter(Boolean), recap: fin.recap.slice(0, 160), prs: fin.prs });
      ok(!D.errors.length, `10. no page errors (${name})`, D.errors);
      await D.browser.close();
    }
  }

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
