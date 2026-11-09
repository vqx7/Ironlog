// 2.37 (build r83; PENDING.md's tracker), each section written as what a lifter expects and run first on 2.36
// (`node tests/r83.js baselines/r82.html` once 2.36 is kept there, or on b91b3c7's page), where each fails unless it
// says it guards:
//   1  NEW-83: in Swap's list, a lift that loads a flagged injury says so (Injury: Knee), the closest matches included;
//      guard: a lift that loads nothing flagged says nothing.
//   2  NEW-87: Your gym offers the change plates as buttons, off until tapped (kg 2, 1.5, 1 and 0.5; lb 1.25); tapped,
//      one is on the gym's list and the plates loads are made from, tapped again it is off; guard: with none tapped, no load moves.
//   3  NEW-85: no lift's note names a study; a log saved before reads the three that did in the new words, the Guide's
//      Sources name them; guard: a note the lifter edited stays as typed.
//   4  NEW-64: the first tick of a lift moves its sets by nothing, at 390 and 320 px: the line on its target ("N of M
//      reps so far") keeps its space from the start, blank until then (picture A of 2026-11-06).
//   5  ST-6: minus and plus under a lift's sets act on its first set not ticked: the load to the next one on the lift's
//      list (its load step: 5 kg and 10 lb on a bar with none of its own), stored as that number typed; the reps by one, a hold's seconds by five; 44 px each,
//      no sideways scroll at 320; the set never ticked by them; after a tick they name the next set and nothing above
//      moves; an assisted lift steps its reps only; guard: none in an edit, where every set is done.
// R83_ONLY=1,2,3,4,5 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R83_ONLY ? process.env.R83_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-08';

/** The app with the demo log as the lifter's own, in kg, on Today; `inj` flagged. */
async function app(o = {}) {
  const D = await open(FILE, { w: o.w || 390, h: 844, dark: !!o.dark, clock: DAY + 'T10:00:00' });
  await D.page.evaluate(inj => {
    const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.unit = 'kg';
    L.makeDemo(); for (const x of L.state.sessions) delete x.demo; for (const x of L.state.bodyweights) delete x.demo;
    L.state.injuries = inj.map((m, i) => ({ id: 'j' + i, m, note: '', date: '2026-11-01' }));
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.invalidate(); L.ui.tab = 'today'; L.render();
  }, o.inj || []);
  await wait(300);
  return D;
}

(async () => {
  if (run(1)) {
    const D = await app({ inj: ['j_knee'] });
    const o = await D.page.evaluate(async () => {
      const L = window.__ironlog;
      L.state.draft = null; L.ACT.startFree(); await new Promise(r => setTimeout(r, 200));
      if (L.ui.modal) L.ACT.mClose();
      L.applyPick({ kind: 'picker', mode: 'addBlock', title: '', q: '', m: '' }, 'backSquat'); await new Promise(r => setTimeout(r, 200));
      const b = L.state.draft.ex.findIndex(x => x.exId === 'backSquat');
      L.openModal({ kind: 'picker', mode: 'swapBlock', b, title: 'Swap', q: '', m: 'quads' }); await new Promise(r => setTimeout(r, 300));
      const rows = [...document.querySelectorAll('#modal .pick[data-ex]')].map(x => ({ id: x.dataset.ex, inj: L.exInjury(L.EX(x.dataset.ex)), tag: /Injury: Knee/.test(x.textContent) }));
      const grp = [...document.querySelectorAll('#modal .pick-grp')].map(x => x.textContent);
      return { rows, grp };
    });
    const onKnee = o.rows.filter(r => r.inj), clear = o.rows.filter(r => !r.inj);
    ok(o.grp.includes('Closest matches') && onKnee.length > 0, '1. (setting up) Swap on back squat lists quads lifts, some loading the knee', o.grp);
    ok(onKnee.every(r => r.tag), '1. every lift in Swap that loads the flagged knee says Injury: Knee', onKnee.filter(r => !r.tag));
    ok(clear.every(r => !r.tag), '1. (a guard) a lift that loads nothing flagged says nothing', clear.filter(r => r.tag));
    await D.browser.close();
  }

  if (run(2)) {
    const D = await app();
    const chips = async () => D.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); return [...document.querySelectorAll('[aria-label="Plates on hand"] button')].map(b => [b.dataset.v, b.getAttribute('aria-pressed')]); });
    const kg = await chips();
    const has = v => kg.find(c => c[0] === v);
    ok(['2', '1.5', '1', '0.5'].every(v => has(v) && has(v)[1] === 'false') && has('20')[1] === 'true', '2. in kg, Your gym offers 2, 1.5, 1 and 0.5 kg as buttons, off, beside the usual plates', kg);
    const before = await D.page.evaluate(() => { const L = window.__ironlog; return L.suggest('bench', L.planFor('bench'), {}).target; });
    ok(await D.page.evaluate(() => !window.__ironlog.state.settings.gym || !window.__ironlog.state.settings.gym.plates), '2. (a guard) with none tapped, the gym keeps no plate list, so no load moves');
    await D.page.evaluate(() => window.__ironlog.ACT.gymPlate({ dataset: { v: '1' } })); // the section may be folded; its tap's own handler
    await D.page.waitForTimeout(200);
    const g1 = await D.page.evaluate(() => (window.__ironlog.state.settings.gym || {}).plates || null);
    ok(Array.isArray(g1) && g1.includes(1) && g1.includes(20), "2. tapping 1 kg puts it on the gym's list with the usual plates", g1);
    const pl = await D.page.evaluate(() => window.__ironlog.plateList('kg'));
    ok(pl.includes(1), "2. with 1 kg tapped, the gym's plates for every load include it", pl);
    await D.page.evaluate(() => window.__ironlog.ACT.gymPlate({ dataset: { v: '1' } })); // the section may be folded; its tap's own handler
    await D.page.waitForTimeout(200);
    const g2 = await D.page.evaluate(() => (window.__ironlog.state.settings.gym || {}).plates || null);
    ok(!g2 || !g2.includes(1), '2. tapping it again takes it off', g2);
    const after = await D.page.evaluate(() => { const L = window.__ironlog; return L.suggest('bench', L.planFor('bench'), {}).target; });
    ok(after === before, '2. (a guard) back to the usual plates, the suggestion is as before', { before, after });
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; L.invalidate(); L.render(); });
    const lb = await chips();
    ok(lb.some(c => c[0] === '1.25' && c[1] === 'false'), '2. in lb, Your gym offers 1.25 lb as a button, off', lb);
    await D.browser.close();
  }

  if (run(3)) {
    // A log saved before 2.37 holds the three notes as the library gave them then; one the lifter edited stays as typed.
    const OLD = {
      declinePushup: 'Feet on a bench: about 70% of bodyweight, against 64% for a floor push-up (Ebben 2011).',
      ohCableExt: 'Long head at long length. Grew the triceps more than pushdowns in a 2023 study (Maeo et al.).',
      seatedCurl: 'Grew the hamstrings more than lying curls in a 2021 study (Maeo et al.).'
    };
    const MINE = 'Grew the hamstrings more than lying curls in a 2021 study (Maeo et al.). Seat on 4.';
    const D = await app();
    await D.page.evaluate(([OLD, MINE]) => {
      const L = window.__ironlog;
      for (const e of L.state.exercises) if (OLD[e.id]) e.note = OLD[e.id];
      L.state.exercises.find(e => e.id === 'lyingCurl').note = MINE;
      L.saveNow();
    }, [OLD, MINE]);
    await D.page.reload(); await wait(500);
    const o = await D.page.evaluate(() => {
      const L = window.__ironlog;
      const by = id => L.state.exercises.find(e => e.id === id).note;
      const lib = L.state.exercises.filter(e => !e.custom && e.id !== 'lyingCurl').map(e => [e.id, e.note]);
      L.openModal({ kind: 'guide', open: 'sources' });
      const guide = (document.querySelector('#modal') || document.body).textContent;
      return { d: by('declinePushup'), o: by('ohCableExt'), s: by('seatedCurl'), mine: by('lyingCurl'), lib, guide };
    });
    const study = /\b(19|20)\d\d\b|et al/;
    ok(!study.test(o.d) && /about 70% of bodyweight, against 64%/.test(o.d), "3. a log saved before reads the decline push-up's note without the study's name, its numbers kept", o.d);
    ok(!study.test(o.o) && /triceps/.test(o.o) && !study.test(o.s) && /hamstrings/.test(o.s), '3. the overhead triceps extension and seated leg curl notes name no study', [o.o, o.s]);
    ok(o.lib.every(([, n]) => !study.test(n)), "3. no library lift's note names a study", o.lib.filter(([, n]) => study.test(n)));
    ok(o.mine === MINE, '3. (a guard) a note the lifter edited stays as typed, study name and all', o.mine);
    ok(['Maeo 2021', 'Maeo 2023', 'Kinoshita 2023', 'Ebben 2011'].every(x => o.guide.includes(x)), "3. the Guide's Sources name the studies the notes leave out", o.guide.slice(-600));
    await D.browser.close();
  }

  if (run(4)) {
    for (const w of [390, 320]) {
      const D = await app({ w });
      await D.page.click('[data-act="startSession"]'); await wait(400);
      const top = () => D.page.evaluate(() => {
        const r = document.querySelector('#view [data-act="sDone"][data-b="0"][data-s="1"]');
        const tp = document.getElementById('tp-0');
        return { y: r ? Math.round(r.getBoundingClientRect().top + window.scrollY) : null, sy: Math.round(window.scrollY), text: tp ? tp.textContent.trim() : null };
      });
      const a = await top();
      await D.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(400);
      const b = await top();
      ok(a.y != null && b.text, `4. (setting up, ${w} px) the first lift has a second set and, after the first tick, a line on its target`, { a, b });
      ok(a.y === b.y, `4. at ${w} px the first tick moves the sets under the finger by nothing (the line's space is kept from the start)`, { before: a.y, after: b.y, line: b.text });
      await D.browser.close();
    }
  }

  if (run(5)) {
    for (const w of [390, 320]) {
      const D = await app({ w });
      await D.page.click('[data-act="startSession"]'); await wait(400);
      const look = () => D.page.evaluate(() => {
        const L = window.__ironlog, b = L.state.draft.ex[0], st = document.querySelector('#blk-0 .stepr');
        const f = k => document.querySelector(`#view input[data-f="${k}"][data-b="0"][data-s="0"]`);
        const btns = st ? [...st.querySelectorAll('button')].map(x => { const r = x.getBoundingClientRect(); return { l: x.getAttribute('aria-label'), w: Math.round(r.width), h: Math.round(r.height), off: x.disabled }; }) : [];
        return { name: st ? st.querySelector('.stepr-l').textContent : null, btns, w: f('w').value || f('w').placeholder, r: f('r').value || f('r').placeholder, sw: b.sets[0].w, sr: b.sets[0].r, done: b.sets[0].done, ex: b.exId, unit: L.U(), wide: document.documentElement.scrollWidth, y: Math.round(document.querySelector('#view [data-act="sDone"][data-b="0"][data-s="1"]').getBoundingClientRect().top + scrollY) };
      });
      const a = await look();
      ok(a.name === 'Set 1' && a.btns.length === 4 && a.btns.every(x => x.w >= 44 && x.h >= 44 && !x.off), `5. (${w} px) under the first lift's sets: minus and plus for the load and the reps of Set 1, each 44 px`, a);
      ok(a.wide <= w, `5. (${w} px) no sideways scroll`, a.wide);
      await D.page.click('#blk-0 .stepr button[aria-label="Set 1: heavier"]'); await wait(300);
      const b = await look();
      ok(+b.w === +a.w + 5 && b.sw === +b.w && !b.done, `5. (${w} px) plus on a barbell lift in kg: the lift's load step up, 5 kg with none of its own (EQUIP_STEP, V 2026-11-02; ${a.w} to ${+a.w + 5}), stored as that number typed, the set not ticked`, { a: a.w, b: b.w, sw: b.sw, done: b.done });
      await D.page.click('#blk-0 .stepr button[aria-label="Set 1: lighter"]'); await wait(300);
      await D.page.click('#blk-0 .stepr button[aria-label="Set 1: lighter"]'); await wait(300);
      const c = await look();
      ok(+c.w === +a.w - 5, `5. (${w} px) minus twice: one step under where it started`, { a: a.w, c: c.w });
      await D.page.click('#blk-0 .stepr button[aria-label="Set 1: one rep fewer"]'); await wait(300);
      const r = await look();
      ok(r.sr === +a.r - 1 && !r.done, `5. (${w} px) minus on reps: one fewer than shown (${a.r} to ${+a.r - 1}), not ticked`, { a: a.r, sr: r.sr });
      await D.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(400);
      const t = await look();
      ok(t.name === 'Set 2' && t.y === a.y, `5. (${w} px) after Set 1 is ticked the buttons act on Set 2, and the rows above them stay put`, { name: t.name, y: [a.y, t.y] });
      await D.browser.close();
    }
    const D = await app();
    const o = await D.page.evaluate(async () => {
      const L = window.__ironlog, wait = ms => new Promise(r => setTimeout(r, ms));
      L.state.settings.unit = 'lb'; L.state.draft = null; L.ACT.startFree(); await wait(200); if (L.ui.modal) L.ACT.mClose();
      const add = async id => { L.applyPick({ kind: 'picker', mode: 'addBlock', title: '', q: '', m: '' }, id); await wait(200); return L.state.draft.ex.findIndex(x => x.exId === id); };
      const bb = await add('bench'), pa = await add('assistPullup'), pl = await add('plank');
      const strip = bi => document.querySelector(`#blk-${bi} .stepr`);
      const lbl = bi => [...strip(bi).querySelectorAll('button')].map(x => x.getAttribute('aria-label'));
      L.state.draft.ex[bb].sets[0].w = L.fromD(135); L.render(); await wait(100);
      strip(bb).querySelector('[aria-label="Set 1: heavier"]').click(); await wait(200);
      const benchLb = L.state.draft.ex[bb].sets[0].w;
      L.state.draft.ex[pl].sets[0].r = 30; L.render(); await wait(100);
      strip(pl).querySelector('[aria-label="Set 1: more seconds"]').click(); await wait(200);
      return { bench: document.querySelector(`#view input[data-f="w"][data-b="${bb}"][data-s="0"]`).value, benchLb, typed: L.fromD(145), assist: lbl(pa), plank: L.state.draft.ex[pl].sets[0].r };
    });
    ok(o.bench === '145' && o.benchLb === o.typed, '5. in lb, plus on a 135 lb bench is its step up, 145 (10 lb on a bar with no step of its own), stored as 145 typed', o);
    ok(o.assist.length === 2 && o.assist.every(x => /rep/.test(x)), '5. an assisted lift steps only its reps (its field takes the help)', o.assist);
    ok(o.plank === 35, '5. a timed hold steps by 5 seconds (30 to 35)', o.plank);
    const e = await D.page.evaluate(async () => {
      const L = window.__ironlog, wait = ms => new Promise(r => setTimeout(r, ms));
      L.state.draft = null; L.render(); await wait(100);
      const id = L.state.sessions.filter(x => x.ex && x.ex.length).slice(-1)[0].id;
      L.ACT.histEdit({ dataset: { id } }); await wait(300);
      return { editing: !!(L.state.draft && L.state.draft.editingId), strips: document.querySelectorAll('#view .stepr').length };
    });
    ok(e.editing && e.strips === 0, '5. (a guard) editing a saved session, every set done, shows no minus and plus', e);
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
