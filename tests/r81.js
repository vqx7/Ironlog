// 2.35 (build r81; PENDING.md's tracker), each section written as what a lifter expects and run first on 2.34
// (`node tests/r81.js baselines/r80.html`), where each section fails unless it says it guards:
//   1  NEW-91 (V, 2026-11-08, a screenshot of an edit with every exercise open and no way to fold one): editing a
//      saved session opens every exercise, since all are done and the lifter came to change them, and each has the
//      fold button; folded, it is one line, and it opens again. Guard: an edit folds nothing on its own.
//   2  NEW-90 (V: "no need to shove weight enter in the face just make accessible"): a session has a Bodyweight
//      button in its header that opens the bodyweight sheet with the latest weigh-in; Save logs that day's weigh-in,
//      replacing one logged that day, closes the sheet and leaves the session as it was. A past workout's weigh-in is
//      dated the workout's date. Guard: with a weigh-in logged, the session shows no bodyweight card of its own.
//   3  NEW-89 (V: a way to back out and come back, and Today to default to the workout): Save and leave shows Today
//      with a card for the workout in progress and no Start, the workout kept as it was, and Today's own sections as
//      without a workout; Resume opens the workout; leaving and then coming back to the tab from another one, or opening
//      the app again, opens the workout.
//   4  The new parts fit a 320 px phone with no sideways scroll, with 44 px targets, in light and dark.
//   5  R81-1 (the review of 2.35): stepped away from one workout, a new one that arrives from elsewhere (another tab
//      finished it and started the next) opens on Today; the Resume card is only ever for the workout left.
//   6  R81-3 (the review of 2.35; older): an import keeps an exercise's note on any of its rows, not only its first
//      (a Strong-style file with a warm-up row first), and the workout's note as before.
// R81_ONLY=1,2 runs some sections.
const { open, tab } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R81_ONLY ? process.env.R81_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-08';

/** The app on Today in kg with the demo log as the lifter's own, set up, and optionally weigh-ins removed. */
async function app(o = {}) {
  const D = await open(FILE, { w: o.w || 390, h: 844, dark: !!o.dark, clock: DAY + 'T10:00:00' });
  await D.page.evaluate(({ noBw }) => {
    const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg';
    L.makeDemo(); for (const x of L.state.sessions) delete x.demo; for (const x of L.state.bodyweights) delete x.demo;
    if (noBw) L.state.bodyweights = [];
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.ui.tab = 'today'; L.render();
  }, { noBw: !!o.noBw });
  await wait(400);
  return D;
}
/** Starts today's workout from Today's card. */
async function startToday(D) {
  await D.page.click('[data-act="startSession"]');
  await wait(400);
  return D.page.evaluate(() => !!window.__ironlog.state.draft);
}
/** Each exercise of the session on screen: folded or open, and whether it has the fold button. */
const blocks = D => D.page.evaluate(() => [...document.querySelectorAll('#view section.block')].map(s => ({ folded: s.classList.contains('folded'), foldBtn: !!s.querySelector('[data-act="bFold"]') })));
/** The session in progress as stored: its exercises, sets, loads, reps and ticks. */
const draftOf = D => D.page.evaluate(() => { const d = window.__ironlog.state.draft; return d ? JSON.stringify(d.ex.map(b => [b.exId, b.sets.map(s => [s.w, s.r, !!s.done])])) : null; });

(async () => {
  if (run(1)) {
    const D = await app();
    const sid = await D.page.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions.filter(x => x.ex && x.ex.length >= 2).slice(-1)[0]; return s && s.id; });
    await D.page.evaluate(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), sid);
    await wait(400);
    let b = await blocks(D);
    ok(b.length >= 2 && b.every(x => !x.folded), '1. an edit of a saved session opens on every exercise, folding none on its own', b);
    ok(b.length >= 2 && b.every(x => x.foldBtn), '1. each exercise in the edit has the fold button', b);
    if (b.length && b[0].foldBtn) {
      await D.page.click('#blk-0 [data-act="bFold"]');
      await wait(300);
      b = await blocks(D);
      ok(b[0].folded && b.slice(1).every(x => !x.folded), '1. the fold button folds that exercise to one line, the others stay open', b);
      await D.page.click('#blk-0 [data-act="bOpen"]').catch(() => {});
      await wait(300);
      b = await blocks(D);
      ok(!b[0].folded, '1. tapping the folded exercise opens it again', b);
    }
    await D.browser.close();
  }

  if (run(2)) {
    const D = await app();
    ok(await startToday(D), '2. (setting up) a session is open');
    const before = await draftOf(D);
    const btn = await D.page.$('#view .ph [data-act="bwOpen"]');
    ok(!!btn, "2. the session's header has a Bodyweight button");
    ok(!(await D.page.$('#bwAsk')), '2. (a guard) with a weigh-in logged, the session shows no bodyweight card of its own');
    if (btn) {
      await btn.click();
      await wait(300);
      const sheet = await D.page.evaluate(() => { const m = window.__ironlog.ui.modal; const el = document.getElementById('bwSheetVal'); return { kind: m && m.kind, ph: el && el.getAttribute('placeholder'), text: document.getElementById('modal').innerText.replace(/\s+/g, ' ') }; });
      const last = await D.page.evaluate(() => { const L = window.__ironlog; const x = L.state.bodyweights.filter(b => !b.demo).sort((a, b) => (a.date < b.date ? 1 : -1))[0]; return x ? Math.round(x.kg * 10) / 10 : null; });
      ok(sheet.kind === 'bw' && last != null && sheet.text.includes(String(last)), '2. it opens the bodyweight sheet with the latest weigh-in', { sheet, last });
      await D.page.fill('#bwSheetVal', '81.5');
      await D.page.click('#modal [data-act="addBW"]');
      await wait(400);
      const st = await D.page.evaluate(d => { const L = window.__ironlog; return { today: L.state.bodyweights.filter(b => b.date === d).map(b => b.kg), modal: L.ui.modal && L.ui.modal.kind }; }, DAY);
      ok(st.today.length === 1 && Math.abs(st.today[0] - 81.5) < 1e-6 && !st.modal, "2. Save logs today's weigh-in once and closes the sheet", st);
      await btn.click().catch(() => D.page.click('#view .ph [data-act="bwOpen"]'));
      await wait(300);
      await D.page.fill('#bwSheetVal', '82');
      await D.page.click('#modal [data-act="addBW"]');
      await wait(400);
      const st2 = await D.page.evaluate(d => window.__ironlog.state.bodyweights.filter(b => b.date === d).map(b => b.kg), DAY);
      ok(st2.length === 1 && Math.abs(st2[0] - 82) < 1e-6, "2. a second weigh-in the same day replaces the first", st2);
      ok((await draftOf(D)) === before, '2. the session is left exactly as it was');
    }
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
    // A past workout: its weigh-in is dated the workout's date.
    await D.page.evaluate(() => window.__ironlog.ACT.pastOpen({ dataset: { date: '2026-11-05' } }));
    await wait(300);
    await D.page.click('#modal [data-act="pastGo"][data-day="0"]').catch(() => {});
    await wait(500);
    const pb = await D.page.$('#view .ph [data-act="bwOpen"]');
    if (ok(!!pb, "2. a past workout's header has the Bodyweight button too")) {
      await pb.click();
      await wait(300);
      await D.page.fill('#bwSheetVal', '80');
      await D.page.click('#modal [data-act="addBW"]');
      await wait(400);
      const pw = await D.page.evaluate(() => window.__ironlog.state.bodyweights.filter(b => b.date === '2026-11-05').map(b => b.kg));
      ok(pw.length === 1 && Math.abs(pw[0] - 80) < 1e-6, "2. a past workout's weigh-in is dated the workout's date", pw);
    }
    await D.browser.close();
  }

  if (run(3)) {
    const D = await app();
    const secs0 = await D.page.evaluate(() => [...document.querySelectorAll('#view [data-sk]')].map(e => e.dataset.sk).filter(k => k !== 'today:session'));
    ok(await startToday(D), '3. (setting up) a session is open');
    await D.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]').catch(() => {});
    await wait(500);
    const before = await draftOf(D);
    const leave = await D.page.$('#view [data-act="wkAway"]');
    if (ok(!!leave, '3. the session has Save and leave')) {
      await leave.click();
      await wait(400);
      const t = await D.page.evaluate(() => ({ resume: !!document.querySelector('#view [data-act="wkResume"]'), start: !!document.querySelector('#view [data-act="startSession"], #view [data-act="startFree"]'), session: !!document.querySelector('#view section.block'), secs: [...document.querySelectorAll('#view [data-sk]')].map(e => e.dataset.sk), draft: !!window.__ironlog.state.draft }));
      ok(t.resume && !t.start && !t.session && t.draft, '3. Save and leave shows Today with a card to resume the workout, and no Start', t);
      ok(JSON.stringify(t.secs) === JSON.stringify(secs0), "3. Today's own sections are there as without a workout (its Body among them when shown), less the planned day's preview", { secs0, now: t.secs });
      ok((await draftOf(D)) === before, '3. the workout is kept as it was');
      await D.page.click('#view [data-act="wkResume"]').catch(() => {});
      await wait(400);
      ok(await D.page.evaluate(() => !!document.querySelector('#view section.block')), '3. Resume opens the workout');
      ok((await draftOf(D)) === before, '3. resumed with every set as it was');
      await D.page.click('#view [data-act="wkAway"]');
      await wait(300);
      await D.page.click('#tabs button[data-tab="dash"]');
      await wait(300);
      await D.page.click('#tabs button[data-tab="today"]');
      await wait(400);
      ok(await D.page.evaluate(() => !!document.querySelector('#view section.block')), '3. back on the tab from another one, the workout opens');
      await D.page.click('#view [data-act="wkAway"]');
      await wait(300);
      await D.page.evaluate(() => window.__ironlog.saveNow());
      await D.page.reload();
      await D.page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
      await wait(800);
      ok(await D.page.evaluate(() => !!document.querySelector('#view section.block')), '3. opening the app again opens the workout');
      ok((await draftOf(D)) === before, '3. with every set as it was');
    }
    await D.browser.close();
  }

  if (run(4)) {
    for (const dark of [false, true]) {
      const D = await app({ w: 320, dark });
      await startToday(D);
      const m1 = await D.page.evaluate(() => {
        const sw = document.documentElement.scrollWidth > window.innerWidth;
        const small = [...document.querySelectorAll('#view [data-act="bwOpen"], #view [data-act="wkAway"]')].map(e => e.getBoundingClientRect()).filter(r => r.height < 44 || r.width < 44).length;
        return { sw, small, n: document.querySelectorAll('#view [data-act="bwOpen"], #view [data-act="wkAway"]').length };
      });
      ok(m1.n === 2 && !m1.sw && !m1.small, `4. the session's new buttons fit 320 px with 44 px targets (${dark ? 'dark' : 'light'})`, m1);
      await D.page.click('#view [data-act="wkAway"]').catch(() => {});
      await wait(300);
      const m2 = await D.page.evaluate(() => { const r = document.querySelector('#view [data-act="wkResume"]'); const b = r && r.getBoundingClientRect(); return { sw: document.documentElement.scrollWidth > window.innerWidth, h: b ? b.height : 0 }; });
      ok(!m2.sw && m2.h >= 44, `4. the resume card fits 320 px with a 44 px button (${dark ? 'dark' : 'light'})`, m2);
      await D.browser.close();
    }
  }
  if (run(5)) {
    const D = await app();
    await startToday(D);
    await D.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]').catch(() => {});
    await wait(400);
    const left = await D.page.evaluate(() => window.__ironlog.state.draft.id);
    await D.page.click('#view [data-act="wkAway"]').catch(() => {});
    await wait(300);
    const T = await tab(D, FILE);
    await wait(800);
    await T.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); L.state.draft._leftAsked = true; L.ACT.finishNow(); });
    await wait(500);
    await T.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '1' } }); });
    await wait(1000);
    const s = await D.page.evaluate(() => ({ draft: window.__ironlog.state.draft && window.__ironlog.state.draft.id, session: !!document.querySelector('#view section.block'), resume: !!document.getElementById('resumeCard') }));
    ok(s.draft && s.draft !== left && s.session && !s.resume, '5. a new workout that arrives after stepping away from another opens on Today, with no Resume card', s);
    await T.page.close();
    await D.browser.close();
  }

  if (run(6)) {
    const D = await app();
    const CSV = 'Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Notes,Workout Notes\n' +
      '2026-10-01 18:00:00,Push,Bench Press (Barbell),W,40,10,,\n' +
      '2026-10-01 18:00:00,Push,Bench Press (Barbell),1,80,8,seat 4,\n' +
      '2026-10-01 18:00:00,Push,Bench Press (Barbell),2,80,7,left shoulder twinge,slept badly\n' +
      '2026-10-01 18:00:00,Push,Bench Press (Barbell),3,80,6,seat 4,\n';
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.sessions = []; L.saveNow(); });
    await D.page.evaluate(t => window.__ironlog.impStart({ text: t }), CSV);
    await wait(500);
    await D.page.click('#modal [data-act="impGo"]').catch(() => {});
    await wait(600);
    const s = await D.page.evaluate(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); const x = L.state.sessions[0]; return x ? { notes: x.notes, note: x.ex[0].note, sets: x.ex[0].sets.length } : null; });
    ok(s && /seat 4/.test(s.note || '') && /left shoulder twinge/.test(s.note || '') && (s.note.match(/seat 4/g) || []).length === 1, "6. an import keeps an exercise's notes from every row, each once", s);
    ok(s && s.notes === 'slept badly', "6. (a guard) and the workout's note as before", s);
    await D.browser.close();
  }
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
