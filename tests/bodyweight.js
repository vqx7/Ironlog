// Bodyweight, asked for where it matters (372; NEW-116, V 2026-11-10 on the preview: a toast about pull-ups on Today
// over the "is ready" message, with Today's bodyweight card saying the same just below). A feature suite (CLAUDE.md,
// Tests): new checks of the bodyweight note, card and line go here. Run on the build before (`node tests/bodyweight.js
// baselines/r92.html`, 2.46) every section fails there but the guards, which say so.
//   1  Picking a ready-made routine with pull-ups on the first page: its own message stays (the routine is ready, its
//      set targets), with no bodyweight note over it, since Today's card asks right there.
//   2  Adding pull-ups to a Plan day: the message says what was added, and Plan asks under the pull-ups (since 2.48, the
//      message rule in toast.ts: an ask lives where it applies; 2.47 put it in the message as a second sentence).
//   3  Adding a ready-made routine on Plan (not made active): its "Tap Make active" stays, nothing over it or in it.
//   4  Adding pull-ups in a session: no note, since the session's card and the line under the lift ask.
//   5  Guards: with a weigh-in, nothing about bodyweight; on Plan the line is under the day's first bodyweight lift only.
//   7  Three bodyweight lifts never done in one session: the first-time paragraph on the first, a short line on the
//      others, as every first-time paragraph (r34.2; NEW-109: until 2.49 only a loaded lift's was shortened, read by
//      its words).
//   6  Editing a saved session (REV11-2): pull-ups added there get the line under the lift too, and its Add bodyweight
//      dates the weigh-in the session's day, as the session's Bodyweight button does.
//   8  The scale's unit (390's Release B): the unit beside a weigh-in field is a tap that marks the scale in the other
//      unit, kept for weigh-ins alone, said with Undo; a number typed in the field is converted, never read again in the
//      other unit; weigh-ins, the latest and the Body card then read in it; back to the app's unit, the setting goes.
//   9  REV17-1: a weigh-in typed, the unit tapped, then Undo: the number typed comes back in its unit and is saved so;
//      tapped there and back it does not drift.
// BODYWEIGHT_ONLY=1,2 runs some sections.
const { open } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.BODYWEIGHT_ONLY ? process.env.BODYWEIGHT_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-10';
// The words the note says, whichever way it is put: the lift counts bodyweight, and where to set it.
const NOTE = /counts your bodyweight/;

// A phone with the starter routine as a first run makes it, signed out, no weigh-in unless bw is given.
async function phone(o = {}) {
  const P = await open(FILE, { w: 390, h: 844, clock: DAY + 'T10:00:00', realStarter: true });
  await P.page.evaluate(o => { const L = window.__ironlog; const S = L.state; S.settings.unit = 'lb';
    if (o.onboarded) S.settings.onboarded = true;
    if (o.bw) S.bodyweights = [{ id: 'w1', date: '2026-11-01', kg: o.bw * 0.45359237 }];
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    L.saveNow(); L.invalidate(); L.render(); }, o);
  await wait(150);
  return P;
}
// The toast as it stands, or ''.
const toastNow = P => P.page.evaluate(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText.trim() : ''; });
// Pull-ups picked in the exercise picker opened in a mode (addDay on Plan, addBlock in a session).
async function pickPullups(P, mode) {
  await P.page.evaluate(mode => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode, day: 0, title: 'Add', q: '', m: '' }); }, mode);
  await wait(200);
  await P.page.click('#modal [data-act="pickDo"][data-ex="pullup"]'); await wait(300);
}

(async () => {
  if (run(1)) {
    const P = await phone();
    // The first page's Pick a ready-made routine, then Full body, 3 days, trained (its day B has pull-ups).
    await P.page.evaluate(() => window.__ironlog.ACT.obSample({ dataset: {} })); await wait(250);
    await P.page.click('#modal [data-act="tplPick"][data-k="full3t"]'); await wait(300);
    const t = await toastNow(P);
    const card = await P.page.evaluate(() => !!document.getElementById('bwDue'));
    ok(/is ready/.test(t) && !NOTE.test(t), '1. the routine\'s own message stays, with no bodyweight note over it (2.46: "Pull-up counts your bodyweight ..." in its place)', t);
    ok(card, '1. and Today\'s bodyweight card asks, as it did', card);
    ok(!P.errors.length, '1. no page errors', P.errors);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(2)) {
    const P = await phone({ onboarded: true });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); });
    await pickPullups(P, 'addDay');
    const t = await toastNow(P);
    const line = await P.page.evaluate(() => { const e = [...document.querySelectorAll('#view .bwwarn')].find(x => x.offsetParent !== null); return e ? e.textContent : ''; });
    ok(/added to/.test(t) && !NOTE.test(t) && /counts only the weight you add/.test(line), '2. adding pull-ups to a Plan day says what was added, and Plan asks under the pull-ups (2.46: the note alone, over "added to")', { t, line });
    await P.ctx.close(); await P.browser.close();
  }

  if (run(3)) {
    const P = await phone({ onboarded: true });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); L.openModal({ kind: 'templates', from: 'plan' }); });
    await wait(250);
    await P.page.click('#modal [data-act="tplPick"][data-k="full3t"]'); await wait(300);
    const t = await toastNow(P);
    ok(/Tap Make active/.test(t) && !NOTE.test(t), '3. adding a ready-made routine on Plan keeps "Tap Make active", nothing over it (2.46: the note alone)', t);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(4)) {
    const P = await phone({ onboarded: true });
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(250);
    await P.page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    await pickPullups(P, 'addBlock');
    const t = await toastNow(P);
    const line = await P.page.evaluate(() => { const L = window.__ironlog; const i = L.state.draft.ex.findIndex(b => b.exId === 'pullup'); const e = document.querySelector(`#blk-${i} .bwwarn`); return { i, line: e ? e.innerText : '' }; });
    ok(!NOTE.test(t), '4. adding pull-ups in a session raises no bodyweight toast (2.46: "Pull-up counts your bodyweight ...")', t);
    ok(line.i >= 0 && /counts only the weight you add/.test(line.line), '4. a guard: the line under the pull-ups still says it', line);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(5)) {
    // With a weigh-in: nothing about bodyweight on Plan.
    let P = await phone({ onboarded: true, bw: 180 });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); });
    await pickPullups(P, 'addDay');
    let t = await toastNow(P);
    ok(/added to/.test(t) && !NOTE.test(t), '5. a guard: with a weigh-in, adding pull-ups says only what was added', t);
    await P.ctx.close(); await P.browser.close();
    // On Plan, one line for the day, under its first bodyweight lift: dips added after the pull-ups add no second one.
    P = await phone({ onboarded: true });
    await P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); });
    await pickPullups(P, 'addDay');
    await P.page.evaluate(() => { const L = window.__ironlog; L.openModal({ kind: 'picker', mode: 'addDay', day: 0, title: 'Add', q: '', m: '' }); }); await wait(200);
    await P.page.click('#modal [data-act="pickDo"][data-ex="dips"]'); await wait(300);
    // The day open on Plan: the other days' lists are drawn but hidden.
    const lines = await P.page.evaluate(() => [...document.querySelectorAll('#view .bwwarn')].filter(e => e.offsetParent !== null).map(e => e.closest('[data-uid]') && e.closest('[data-uid]').textContent.slice(0, 20)));
    ok(lines.length === 1 && /Pull-up/.test(lines[0] || ''), '5. a guard: one line on the day, under the pull-ups, the first bodyweight lift', lines);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(6)) {
    // History's Edit on a session of Nov 8 with no weigh-in, then pull-ups added with the picker.
    const P = await phone({ onboarded: true });
    await P.page.evaluate(() => { const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
      S.sessions = [{ id: 's1', date: '2026-11-08', dayIdx: 0, dayId: null, dayName: 'Freestyle', routineId: '', notes: '', free: true,
        ex: [{ exId: 'bench', rr: [6, 10], sets: [0, 1, 2].map(() => ({ w: 135 * LB, r: 8, rir: 2, done: true })) }] }];
      L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.render(); });
    await wait(100);
    await P.page.evaluate(() => window.__ironlog.ACT.histEdit({ dataset: { id: 's1' } })); await wait(300);
    await P.page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.hidden = true; });
    await pickPullups(P, 'addBlock');
    const line = await P.page.evaluate(() => { const L = window.__ironlog; const d = L.state.draft; const i = d.ex.findIndex(b => b.exId === 'pullup'); const e = document.querySelector(`#blk-${i} .bwwarn`); return { editing: d.editingId, i, line: e ? e.innerText.replace(/\s+/g, ' ').trim() : '' }; });
    ok(line.editing === 's1' && line.i >= 0 && /counts only the weight you add/.test(line.line) && /Add bodyweight/.test(line.line), '6. REV11-2: pull-ups added while editing a saved session get the line under them, with Add bodyweight (2.47: nothing said anywhere until saved)', line);
    let sheet = '';
    if (line.line) { await P.page.click(`#blk-${line.i} .bwwarn [data-act="bwOpen"]`); await wait(200);
      sheet = await P.page.evaluate(() => { const m = document.getElementById('modal'); return m ? m.innerText.replace(/\s+/g, ' ') : ''; }); }
    const nov8 = await P.page.evaluate(() => window.__ironlog.fmtDate('2026-11-08'));
    ok(sheet.includes(`Saved as the weigh-in for ${nov8}`), '6. and its Add bodyweight saves the weigh-in for the session\'s day, as the session\'s Bodyweight button does', sheet.slice(0, 300));
    ok(!P.errors.length, '6. no page errors', P.errors);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(7)) {
    const P = await phone({ onboarded: true, bw: 180 });
    await P.page.evaluate(() => { const L = window.__ironlog; const S = L.state;
      S.routines = [{ id: 'R1', name: 'Mine', schedule: 'cycle', days: [{ id: 'A', name: 'Bodyweight', rest: false, items: ['pullup', 'dips', 'pushup'].map((exId, k) => ({ uid: 'A' + k, exId, sets: 3, repMin: 6, repMax: 12, rir: 2, rest: 120, ss: null })) }] }];
      S.activeRoutineId = 'R1'; S.sessions = []; L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); });
    await wait(150);
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(300);
    const hints = await P.page.evaluate(() => [0, 1, 2].map(i => { const e = document.querySelector(`#blk-${i} p.hint`); return e ? e.textContent.trim() : ''; }));
    ok(/^First time: your bodyweight only\. Do 6 to 12 reps/.test(hints[0]) && hints.slice(1).every(h => h === 'First time: bodyweight only; do 6 to 12 reps.'), '7. three new bodyweight lifts: the first-time paragraph on the first, one short line on the others (2.48: the paragraph three times)', hints);
    await P.page.evaluate(() => { const L = window.__ironlog; L.state.draft = null; L.saveNow(); L.render(); });
    /* Each kind of first session says its own paragraph once: a new loaded lift's does not stand for a bodyweight or
       assisted lift's, whose advice differs (an easier version; setting the help). Leg extensions, then pull-ups, dips,
       and assisted pull-ups twice. */
    await P.page.evaluate(() => { const L = window.__ironlog; const S = L.state;
      S.routines[0].days[0].items = ['legExt', 'pullup', 'dips', 'assistPullup', 'assistDip'].map((exId, k) => ({ uid: 'B' + k, exId, sets: 3, repMin: 6, repMax: 12, rir: 2, rest: 120, ss: null }));
      L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render(); });
    await wait(150);
    await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(300);
    const mixed = await P.page.evaluate(() => [0, 1, 2, 3, 4].map(i => { const e = document.querySelector(`#blk-${i} p.hint`); return e ? e.textContent.trim() : ''; }));
    ok(/^First time: pick a load/.test(mixed[0]) && /^First time: your bodyweight only\. Do 6 to 12 reps/.test(mixed[1]) && mixed[2] === 'First time: bodyweight only; do 6 to 12 reps.' && /^First time: set the help/.test(mixed[3]) && /^First time: help for about \d+ reps; do 6 to 12 reps\.$/.test(mixed[4]), '7. a new loaded lift, two bodyweight and two assisted: each kind\'s paragraph once, then its short line', mixed);
    ok(!P.errors.length, '7. no page errors', P.errors);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(8)) {
    const P = await phone({ onboarded: true, bw: 180 });
    await P.page.evaluate(() => window.__ironlog.openModal({ kind: 'bw' })); await wait(200);
    const q = '#modal input#bwSheetVal', tap = '#modal [data-act="bodyUnit"]';
    await P.page.click(q); await P.page.keyboard.type('200');
    const before = await P.page.evaluate(() => ({ u: document.querySelector('#modal [data-act="bodyUnit"]').textContent.trim(), text: document.querySelector('#modal').innerText }));
    // The tap takes a finger 44 px wide and tall over the unit, the box rising from it (the field below), no other control under it.
    const reach = await P.page.evaluate(() => { const sel = '#modal [data-act="bodyUnit"]'; const b = document.querySelector(sel); const r = b.getBoundingClientRect(); const cx = r.left + r.width / 2, bot = r.bottom + 2, top = bot - 44, left = cx - 22;
      const all = [cx - 21, cx, cx + 21].every(x => [bot - 1, bot - 22, top + 1].every(y => { const e = document.elementFromPoint(x, y); return !!e && e.closest(sel) === b; }));
      const others = [...document.querySelectorAll('#modal button, #modal a, #modal input, #modal [data-act]')].filter(e => e !== b && !b.contains(e) && !e.contains(b)).filter(e => { const q = e.getBoundingClientRect(); return q.width && q.height && q.left < left + 44 && q.right > left && q.top < bot && q.bottom > top; }).map(e => e.outerHTML.slice(0, 80));
      return all && !others.length ? true : { all, others }; });
    await P.page.click(tap); await wait(250);
    const after = await P.page.evaluate(() => { const L = window.__ironlog; const f = document.querySelector('#modal input#bwSheetVal'); return { u: document.querySelector('#modal [data-act="bodyUnit"]').textContent.trim(), set: L.state.settings.bwUnit || null, field: f && f.value, text: document.querySelector('#modal').innerText, app: L.state.settings.unit, lift: L.liftU(L.EX('bench')) }; });
    const t1 = await toastNow(P);
    ok(before.u === 'lb' && reach === true && after.u === 'kg' && after.set === 'kg' && after.field === '90.7' && /Latest 81\.6 kg/.test(after.text) && after.app === 'lb' && after.lift === 'lb' && /^Bodyweight in kg/.test(t1),
      '8. the unit beside the field, tapped: weigh-ins in kg, 200 typed in lb shown as 90.7 kg, the latest 180 lb as 81.6 kg, the app and the lifts still in lb, with Undo', { before, reach, after, t1 });
    await P.page.click('#modal [data-act="addBW"]'); await wait(250);
    const saved = await P.page.evaluate(() => { const L = window.__ironlog; const b = [...L.state.bodyweights].sort((a, b) => (a.date < b.date ? 1 : -1))[0]; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); const s = document.getElementById('bwSet'); if (s) s.scrollIntoView(); return { kg: b.kg, line: s ? s.parentElement.innerText : '' }; });
    await wait(150);
    // The number typed, converted and never read again in the other unit: 200 lb exactly, read in kg as 90.7 (REV17-1).
    ok(Math.abs(saved.kg - 200 * 0.45359237) < 1e-9 && /Latest 90\.7 kg/.test(saved.line), '8. saved as the 200 typed, converted (90.7 kg shown), and Settings reads it in kg', saved);
    await P.page.click('#bwSet [data-act="bodyUnit"]'); await wait(250);
    const back = await P.page.evaluate(() => { const L = window.__ironlog; return { set: 'bwUnit' in L.state.settings, line: document.getElementById('bwSet').parentElement.innerText }; });
    ok(!back.set && /Latest 200 lb/.test(back.line), '8. tapped again, weigh-ins follow the app\'s unit again and the setting is gone: 90.7 kg reads 200 lb', back);
    await P.page.click('#toast [data-act="undo"]'); await wait(250);
    const undone = await P.page.evaluate(() => window.__ironlog.state.settings.bwUnit || null);
    ok(undone === 'kg', '8. Undo puts the scale back in kg', undone);
    ok(!P.errors.length, '8. no page errors', P.errors);
    await P.ctx.close(); await P.browser.close();
  }

  if (run(9)) {
    /* REV17-1: a number typed, the unit tapped, then Undo: the field shows what was typed again, in the unit it was typed
       in, and Save stores that (180 lb, never 81.6 lb); tapped there and back it is still 180 (no drift). On Today's Body
       card and the sheet alike. */
    const P = await phone({ onboarded: true, bw: 181 });
    const out = {};
    for (const [where, open, q] of [
      ['the sheet', () => P.page.evaluate(() => window.__ironlog.openModal({ kind: 'bw' })), '#modal input#bwSheetVal'],
      ['Settings', () => P.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); document.getElementById('bwSetVal').scrollIntoView({ block: 'center' }); }), '#view input#bwSetVal']
    ]) {
      await open(); await wait(250);
      await P.page.click(q); await P.page.fill(q, ''); await P.page.keyboard.type('180');
      const tap = q.replace(/input#\w+$/, `[data-act="bodyUnit"][data-in="${q.split('#').pop()}"]`);
      await P.page.click(tap); await wait(200);
      const conv = await P.page.evaluate(q => document.querySelector(q).value, q);
      await P.page.click(tap); await wait(200);
      const back = await P.page.evaluate(q => document.querySelector(q).value, q);
      await P.page.click(tap); await wait(200);
      await P.page.click('#toast [data-act="undo"]'); await wait(250);
      const undone = await P.page.evaluate(q => ({ v: document.querySelector(q).value, u: window.__ironlog.bodyU() }), q);
      const save = q.startsWith('#modal') ? '#modal [data-act="addBW"]' : '#bwSet [data-act="addBW"]';
      await P.page.click(save); await wait(250);
      const kg = await P.page.evaluate(() => { const b = [...window.__ironlog.state.bodyweights].sort((a, b) => (a.date < b.date ? 1 : -1))[0]; return b.kg; });
      out[where] = { conv, back, undone, lb: Math.round(kg / 0.45359237 * 1000) / 1000 };
      await P.page.evaluate(() => { const L = window.__ironlog; L.state.bodyweights = L.state.bodyweights.filter(b => b.date !== L.today()); delete L.state.settings.bwUnit; L.invalidate(); if (L.ui.modal) L.ACT.mClose(); L.render(); }); await wait(150);
    }
    ok(Object.values(out).every(o => o.conv === '81.6' && o.back === '180' && o.undone.v === '180' && o.undone.u === 'lb' && o.lb === 180),
      '9. typed 180, tapped to kg (81.6), back (180), to kg again, then Undo: 180 in lb again, and Save stores 180 lb, on the sheet and in Settings (REV17-1)', out);
    ok(!P.errors.length, '9. no page errors', P.errors);
    await P.ctx.close(); await P.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
