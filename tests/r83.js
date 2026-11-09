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
//   6  ST-6: This block vs last on Stats, against a log worked out by hand: 6 weeks by default, Auto from a lighter week,
//      4 weeks; full weeks trained averaged with lighter weeks left out, PRs on any day; nothing before a break of more
//      than 4 weeks; the length kept as a setting only when not the default; the survey behind 6 in the Guide.
// R83_ONLY=1,2,3,4,5,6 runs some sections.
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
      // V, 2026-11-09: two pills side by side, each wholly in the one accent, ends included (V, 09:42), with the number it changes between its ends.
      const pills = await D.page.evaluate(() => [...document.querySelectorAll('#blk-0 .stepr-g')].map(g => { const r = g.getBoundingClientRect(), t = g.querySelector('.stepr-v b'), tr = t && t.getBoundingClientRect(), bs = [...g.querySelectorAll('button')].map(x => x.getBoundingClientRect()); return { top: Math.round(r.top), v: t ? t.textContent : null, inside: !!tr && tr.left >= bs[0].right - 6 && tr.right <= bs[1].left + 6, accent: getComputedStyle(g).backgroundImage === 'none' && getComputedStyle(g).backgroundColor === getComputedStyle(document.documentElement).getPropertyValue('--volt').trim().replace(/^#(..)(..)(..)$/, (m, r, gg, b) => `rgb(${parseInt(r, 16)}, ${parseInt(gg, 16)}, ${parseInt(b, 16)})`) }; }));
      ok(pills.length === 2 && pills[0].top === pills[1].top && pills[0].v === a.w && pills[1].v === a.r && pills.every(p => p.inside && p.accent), `5. (${w} px) two accent pills side by side, the load and the reps shown between minus and plus`, pills);
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
    // A lift with a load step of its own finer than a tenth (the review, REV6-5): each load the step makes, exactly.
    const f = await D.page.evaluate(async () => {
      const L = window.__ironlog, wait = ms => new Promise(r => setTimeout(r, ms));
      L.state.settings.unit = 'kg'; L.state.draft = null; L.ACT.startFree(); await wait(200); if (L.ui.modal) L.ACT.mClose();
      L.state.exercises.find(e => e.id === 'latPulldown').inc = 1.25;
      L.applyPick({ kind: 'picker', mode: 'addBlock', title: '', q: '', m: '' }, 'latPulldown'); await wait(200);
      const bi = L.state.draft.ex.findIndex(x => x.exId === 'latPulldown');
      L.state.draft.ex[bi].sets[0].w = 40; L.invalidate(); L.render(); await wait(100);
      const out = [];
      for (const k of ['heavier', 'heavier', 'heavier', 'lighter']) { document.querySelector(`#blk-${bi} .stepr [aria-label="Set 1: ${k}"]`).click(); await wait(150); out.push(L.state.draft.ex[bi].sets[0].w); }
      return out;
    });
    ok(JSON.stringify(f) === JSON.stringify([41.25, 42.5, 43.75, 42.5]), '5. a 1.25 kg step from 40: 41.25, 42.5 and 43.75 up, 42.5 down, each kept exactly (never rounded to a tenth)', f);
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

  if (run(6)) {
    // Thirteen full weeks of bench, Monday, Wednesday and Friday, 3 sets of 8 at RIR 2 (3 hard sets a session), and this
    // week's three: 60 kg, 65 from 9 weeks back (a PR), the week 4 back done at 52 (a lighter week), 70 from 3 weeks back
    // (a PR) and 72.5 from last Wednesday (a PR). Today is Sunday 2026-11-08; this week began Monday 2026-11-02.
    const D = await app();
    const r = await D.page.evaluate(async () => {
      const L = window.__ironlog, wait = ms => new Promise(r => setTimeout(r, ms));
      const mon = k => { const d = new Date(Date.UTC(2026, 10, 2) - 7 * 86400000 * k); return d.toISOString().slice(0, 10); };
      const day = (k, i) => { const d = new Date(Date.parse(mon(k)) + 2 * i * 86400000); return d.toISOString().slice(0, 10); };
      const S = JSON.parse(JSON.stringify(L.state)); S.sessions = []; S.draft = null; delete S.settings.blockWeeks;
      for (let k = 13; k >= 0; k--) for (let i = 0; i < 3; i++) {
        const w = k === 4 ? 52 : k <= 1 && (k < 1 || i >= 1) ? 72.5 : k <= 3 ? 70 : k <= 9 ? 65 : 60;
        S.sessions.push({ id: `b${k}-${i}`, date: day(k, i), dayIdx: 0, dayName: 'A', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w, r: 8, rir: 2, warm: false, drop: false })) }] });
      }
      L.state = L.normalize(S); L.invalidate();
      const pick = async v => { if (v == null) delete L.state.settings.blockWeeks; else L.state.settings.blockWeeks = v; L.invalidate(); return JSON.parse(JSON.stringify(L.blocks())); };
      const six = await pick(null), auto = await pick('auto'), four = await pick(4);
      // The screen: Consistency's This block vs last, and its length chosen there.
      await pick(null); L.ui.tab = 'dash'; L.render(); await wait(200);
      const sub = document.getElementById('sub-block');
      if (sub && sub.tagName === 'DETAILS') sub.open = true;
      const cells = sub ? [...sub.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(c => c.textContent.trim())) : null;
      const sel = sub && sub.querySelector('select[data-bind="blockWeeks"]');
      if (sel) { sel.value = '4'; sel.dispatchEvent(new Event('change', { bubbles: true })); await wait(200); }
      const kept4 = L.state.settings.blockWeeks;
      const sel2 = document.querySelector('#sub-block select[data-bind="blockWeeks"]');
      if (sel2) { sel2.value = '6'; sel2.dispatchEvent(new Event('change', { bubbles: true })); await wait(200); }
      const kept6 = 'blockWeeks' in L.state.settings;
      L.openModal({ kind: 'guide', open: 'sources' }); await wait(100);
      const guide = document.querySelector('#modal').textContent;
      // After a break of more than 4 weeks: nothing before it is compared.
      const S2 = JSON.parse(JSON.stringify(L.state)); S2.sessions = S2.sessions.filter(x => x.date < '2026-09-01' || x.date >= '2026-10-19');
      L.state = L.normalize(S2); L.invalidate(); L.closeModal && L.closeModal();
      const brk = JSON.parse(JSON.stringify(L.blocks()));
      // Weeks 2 and 3 back missed in the 6-week default: this block's 4 full weeks are 2 trained, 1 lighter, 2 missed.
      const S3 = JSON.parse(JSON.stringify(S)); S3.sessions = S3.sessions.filter(x => !(x.date >= mon(3) && x.date < mon(1)));
      L.state = L.normalize(S3); L.invalidate(); L.ui.tab = 'dash'; L.render(); await wait(200);
      const p3 = document.querySelector('#sub-block p');
      const missed = { now: JSON.parse(JSON.stringify(L.blocks().now)), line: p3 ? p3.textContent : '', lastLine: p3 ? (p3.textContent.split('Last:')[1] || '') : '' };
      return { six, auto, four, cells, kept4, kept6, guide, brk, missed };
    });
    const pick = b => b && { from: b.from, counted: b.counted, sess: b.sess, hard: b.hard, prs: b.prs };
    ok(JSON.stringify(pick(r.six.now)) === JSON.stringify({ from: '2026-09-28', counted: 4, sess: 3, hard: 9, prs: 2 }) && JSON.stringify(pick(r.six.last)) === JSON.stringify({ from: '2026-08-17', counted: 6, sess: 3, hard: 9, prs: 1 }),
      '6. 6 weeks by default: this block from Sep 28, 4 full weeks counted (the lighter week left out), 3 sessions and 9 hard sets a week, 2 PRs; the last from Aug 17, 6 weeks, 1 PR', { now: pick(r.six.now), last: pick(r.six.last) });
    ok(r.auto.auto && JSON.stringify(pick(r.auto.now)) === JSON.stringify({ from: '2026-10-12', counted: 3, sess: 3, hard: 9, prs: 2 }) && JSON.stringify(pick(r.auto.last)) === JSON.stringify({ from: '2026-08-24', counted: 6, sess: 3, hard: 9, prs: 1 }),
      '6. Auto: this block starts after the lighter week (Oct 12); with no week ending the one before in reach, it runs 6 weeks to that week (Aug 24 to Oct 4, 6 full weeks and the PR 9 weeks back)', { now: pick(r.auto.now), last: pick(r.auto.last) });
    ok(JSON.stringify(pick(r.four.now)) === JSON.stringify({ from: '2026-10-12', counted: 3, sess: 3, hard: 9, prs: 2 }) && JSON.stringify(pick(r.four.last)) === JSON.stringify({ from: '2026-09-14', counted: 3, sess: 3, hard: 9, prs: 0 }),
      '6. 4 weeks: Oct 12 on, and Sep 14 to Oct 11 with its lighter week left out and no PR', { now: pick(r.four.now), last: pick(r.four.last) });
    ok(JSON.stringify(r.cells) === JSON.stringify([['Sessions a week', '3', '3'], ['Hard sets a week', '9', '9'], ['PRs', '2', '1']]), "6. Stats' Consistency shows the two blocks side by side", r.cells);
    ok(r.kept4 === 4 && r.kept6 === false, '6. picking 4 weeks there keeps it; back to 6, the setting is absent again (older saves hash as before)', { kept4: r.kept4, kept6: r.kept6 });
    ok(/Rogerson 2024/.test(r.guide), "6. the Guide's Sources name the survey behind 6 weeks", r.guide.slice(-400));
    ok(r.missed && r.missed.now.missed === 2 && r.missed.now.counted === 2 && /2 weeks missed and a lighter week left out/.test(r.missed.line) && !/missed/.test(r.missed.lastLine), '6. a block with weeks missed says so beside its dates, as every weekly average does (the review, REV6-6); one with none says nothing', r.missed);
    ok(r.brk && r.brk.last === null && r.brk.now.from === '2026-10-19', '6. after a break of more than 4 weeks the block starts with the first week back and nothing before the break is compared', r.brk && { now: r.brk.now.from, last: r.brk.last });
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
