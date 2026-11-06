// 2.28 (build r73; PENDING.md's tracker, the 2.27 review's findings 2.27-F2 to 2.27-F13), each written as what a
// lifter expects and run first on 2.27 (`node tests/r73.js baselines/r72.html`), where each section fails:
//   1  2.27-F6: Escape on a sheet with something typed in it keeps the sheet and says so, as a tap outside it, Back
//      and the update bar do (2.27: Escape closed it and the typing was gone). Untyped, Escape still closes it.
//   2  2.27-F13: Finish's "Mark them done and save" carries on after a set far off is answered Log it: the
//      session saves with every set, with no second tap on Finish (2.27: the set ticked, the workout stayed open).
//   3  2.27-F5: a change that fails halfway leaves the log as it was before it: nothing half done is kept, saved
//      or given an Undo step (2.27: the half-changed log stayed, and the next change saved it).
//   4  2.27-F2: unknown fields in a workout in progress and in the log are kept within the limits every record's
//      unknown fields have, and a workout with none comes out key for key as it went in (2.27: kept at any size).
//   5  2.27-F3: every text field a lifter types a name or a note into has a length limit, the same one the save
//      keeps to (2.27: none, so a long paste could make a month too large to sync); text saved longer before the
//      limit existed is edited, never cut (the review of 2.28).
//   6  2.27-F10: an .xlsx file of a megabyte or two that inflates to 200 MB is refused with words, read in pieces
//      and stopped at the limit (2.27: inflated whole first; a 1.5 GB one took 4.5 s here and returned no rows).
//   7  2.27-F10, a guard (no failure reproduced in Chromium on 2.27): a 20,000 by 20,000 px picture and one the
//      size of an iPhone 14 Pro's 48 MP photo are each kept or refused with words, never a crashed page. Its
//      evidence for an iPhone is GitHub's WebKit run.
//   8  393 and V's ask of 2026-11-05 (less explaining on screen): the first page's bodyweight field says only that it
//      is optional, with no sentence in it, and its start options carry no taglines; a sheet's standing text is one
//      short line (the injury sheet and the import sheet, as read).
// R73_ONLY=1,2 runs some sections.
const { open, sourceTexts } = require('./h');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
const ONLY = process.env.R73_ONLY ? process.env.R73_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const wait = ms => new Promise(r => setTimeout(r, ms));
const T = '2026-11-05';

// A page on the demo log with today's workout started, as a lifter starts it from Today.
async function started() {
  const D = await open(FILE, { touch: true, w: 390, h: 844, clock: T + 'T18:00:00' });
  await D.page.evaluate(() => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.autoDone = false; L.makeDemo(); for (const x of S.sessions) delete x.demo; localStorage.setItem('ironlog.v1.tipWake', '1'); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.ui.todayDay = 0; L.render(); });
  await D.page.click('.hero [data-act="startSession"]:not([data-light])'); await wait(500);
  return D;
}

(async () => {
  if (run(1)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const pg = D.page;
    await pg.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); });
    const sheet = () => pg.evaluate(() => { const m = window.__ironlog.ui.modal; return m ? m.kind : null; });
    // Untyped: Escape closes the sheet, as before.
    await pg.evaluate(() => window.__ironlog.openModal({ kind: 'injury' })); await wait(200);
    await pg.keyboard.press('Escape'); await wait(200);
    ok(await sheet() === null, '1. 2.27-F6: Escape closes a sheet nothing was typed in (a guard)');
    // Typed: Escape keeps it, says so, and the text is still there.
    await pg.evaluate(() => window.__ironlog.openModal({ kind: 'injury' })); await wait(200);
    await pg.fill('#injNote', 'left elbow, pressing only'); await wait(100);
    await pg.keyboard.press('Escape'); await wait(300);
    const r = await pg.evaluate(() => ({ kind: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind, text: (document.getElementById('injNote') || {}).value, toast: (document.getElementById('toast') || {}).innerText || '' }));
    ok(r.kind === 'injury' && r.text === 'left elbow, pressing only', '1. 2.27-F6: Escape keeps a sheet with something typed in it, the text still there (2.27: closed, the text gone)', r);
    ok(/Save or cancel first/.test(r.toast), '1. 2.27-F6: and says what a tap outside says', r);
    ok(!D.errors.length, '1. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(2)) {
    const D = await started();
    const pg = D.page;
    // Two sets with reps typed, neither ticked: the first far past the range and anything logged (asked about), the second ordinary.
    await pg.fill('.sg input[data-f="r"][data-b="0"][data-s="0"]', '60'); await pg.keyboard.press('Tab');
    await pg.fill('.sg input[data-f="r"][data-b="0"][data-s="1"]', '8'); await pg.keyboard.press('Tab'); await wait(200);
    const n0 = await pg.evaluate(() => window.__ironlog.state.sessions.length);
    await pg.click('[data-act="finish"]'); await wait(300);
    await pg.click('#modal button:has-text("Mark them done and save")'); await wait(400);
    const q = await pg.evaluate(() => (document.querySelector('#modal') || {}).innerText || '');
    ok(/far past/.test(q), '2. 2.27-F13: the set far off is asked about first', q.slice(0, 200));
    await pg.locator('#modal button', { hasText: /^Log it$/ }).click(); await wait(800);
    const r = await pg.evaluate(() => { const L = window.__ironlog; const s = L.state.sessions[L.state.sessions.length - 1]; return { draft: !!L.state.draft, n: L.state.sessions.length, reps: s && s.ex[0] ? s.ex[0].sets.map(x => x.r) : null, modal: L.ui.modal && L.ui.modal.kind }; });
    ok(!r.draft && r.n === n0 + 1, '2. 2.27-F13: answered Log it, Finish carries on and saves the session, with no second tap (2.27: the workout stayed open)', r);
    ok(r.reps && r.reps.includes(60) && r.reps.includes(8), '2. 2.27-F13: with both sets as typed, the one asked about and the other', r);
    ok(!D.errors.length, '2. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(3)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const pg = D.page;
    await pg.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); for (const x of L.state.sessions) delete x.demo; L.invalidate(); L.saveNow(); });
    const r = await pg.evaluate(() => {
      const L = window.__ironlog;
      const before = JSON.stringify(L.state), saved = localStorage.getItem(L.KEY), steps = L.undoStack.length;
      let threw = null;
      try { L.act(() => { L.state.sessions.pop(); L.state.settings.userName = 'half'; throw new Error('a change that fails halfway'); }, { undo: true }); } catch (e) { threw = e.message; }
      const out = { threw, same: JSON.stringify(L.state) === before, savedSame: localStorage.getItem(L.KEY) === saved, steps: L.undoStack.length - steps };
      // The next change saves only itself.
      L.act(() => { L.state.settings.userName = 'Vee'; });
      const after = JSON.parse(localStorage.getItem(L.KEY));
      out.next = { sessions: after.state ? after.state.sessions.length : (after.sessions || []).length, n: JSON.parse(before).sessions.length, name: (after.state || after).settings.userName };
      return out;
    });
    ok(r.threw === 'a change that fails halfway', '3. 2.27-F5: the failure still reaches the crash sheet (the error is thrown on)', r);
    ok(r.same && r.savedSame, '3. 2.27-F5: a change that fails halfway leaves the log and its save as they were (2.27: the session gone and the name changed)', r);
    ok(r.steps === 0, '3. 2.27-F5: and keeps no Undo step for a change that was not made', r);
    ok(r.next.sessions === r.next.n && r.next.name === 'Vee', '3. 2.27-F5: the next change saves itself and nothing of the failed one', r.next);
    // A change to the workout in progress only (the session screen's kind) is put back the same way.
    const D2 = await started();
    const w = await D2.page.evaluate(() => {
      const L = window.__ironlog; const d0 = JSON.stringify(L.state.draft);
      try { L.act(() => { L.state.draft.notes = 'half'; L.state.draft.ex[0].sets.pop(); throw new Error('x'); }, { inProgress: true }); } catch (e) { /* thrown on, as above */ }
      return JSON.stringify(L.state.draft) === d0;
    });
    ok(w, '3. 2.27-F5: a change to the workout in progress that fails halfway leaves the workout as it was');
    // A change to the whole log made inside one to the workout alone, then a failure (the review of 2.28).
    const nest = await D2.page.evaluate(() => {
      const L = window.__ironlog; const n0 = L.state.sessions.length, name0 = L.state.settings.userName, notes0 = L.state.draft.notes;
      try { L.act(() => { L.state.draft.notes = 'half'; L.act(() => { L.state.sessions.pop(); L.state.settings.userName = 'half'; }); throw new Error('x'); }, { inProgress: true }); } catch (e) { /* thrown on */ }
      const mem = { sessions: L.state.sessions.length === n0, name: L.state.settings.userName === name0, notes: L.state.draft.notes === notes0 };
      L.act(() => { L.state.settings.weekStart = L.state.settings.weekStart; });
      const saved = JSON.parse(localStorage.getItem(L.KEY)); const st = saved.state || saved;
      return { mem, savedSessions: st.sessions.length === n0, savedName: st.settings.userName === name0 };
    });
    ok(nest.mem.sessions && nest.mem.name && nest.mem.notes && nest.savedSessions && nest.savedName, '3. 2.27-F5: a whole-log change made inside a workout change that then fails is put back too, and the next change saves none of it (the 2.28 reviewed: the inner change stayed)', nest);
    ok(!D.errors.length && !D2.errors.filter(e => !/fails halfway|^x$/.test(e)).length, '3. no page errors but the planted ones', [...D.errors, ...D2.errors]);
    await D.browser.close(); await D2.browser.close();
  }

  if (run(4)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const r = await D.page.evaluate(() => {
      const L = window.__ironlog;
      // Finish's two flags, as 2.27 writes them once answered (the review of 2.28: dropped, so Finish asked again).
      const draft = { date: '2026-11-05', id: 'd1', dayIdx: 0, dayId: null, startedAt: null, durMin: null, dayName: 'Session', routineId: '', notes: '', editingId: null, deload: false, light: false, cardio: [], ex: [], _leftAsked: true, _rampAsked: true };
      const plain = L.normalize({ draft: JSON.parse(JSON.stringify(draft)) }).draft;
      const big = Object.assign(JSON.parse(JSON.stringify(draft)), { huge: 'x'.repeat(300000) });
      for (let i = 0; i < 30; i++) big['k' + i] = i;
      const d = L.normalize({ draft: big }).draft;
      const st = L.normalize({ huge: 'y'.repeat(300000), ...Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['t' + i, i])) });
      const known = ['version', 'settings', 'exercises', 'routines', 'activeRoutineId', 'sessions', 'bodyweights', 'measurements', 'draft', 'deloadWeek', 'injuries', 'cardio', 'trash'];
      const stExtra = Object.keys(st).filter(k => !known.includes(k));
      return {
        plainOrder: Object.keys(plain).join() === Object.keys(draft).join() + Object.keys(plain).slice(Object.keys(draft).length).map(k => ',' + k).join(''),
        plainSame: Object.keys(draft).every(k => JSON.stringify(plain[k]) === JSON.stringify(draft[k])),
        draftLen: JSON.stringify(d).length, draftHuge: 'huge' in d, draftKeys: Object.keys(d).filter(k => /^k\d+$/.test(k)).length, draftId: d.id,
        stLen: JSON.stringify(stExtra.map(k => st[k])).length, stHuge: 'huge' in st, stKeys: stExtra.length
      };
    });
    ok(r.plainOrder && r.plainSame, '4. 2.27-F2: a workout with no unknown fields comes out key for key as it went in, Finish\'s answered questions kept (so 2.27 and 2.28 phones agree on it; a guard, and the review of 2.28)', r);
    ok(!r.draftHuge && r.draftLen < 20000 && r.draftKeys <= 20 && r.draftId === 'd1', '4. 2.27-F2: a workout\'s unknown fields are kept within the limits a record\'s are, its own fields intact (2.27: 300,000 characters kept)', r);
    ok(!r.stHuge && r.stLen < 20000 && r.stKeys <= 20, '4. 2.27-F2: the log\'s own unknown fields the same', r);
    ok(!D.errors.length, '4. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(5)) {
    // Every free-text field in the screens: a textarea, or a text input that takes no number. The import box, the
    // typed sets and the backup text are what the lifter pastes to be read, never kept as typed; height is read as a
    // number (5'10 or 178); the account's and the report's fields have limits of their own. None of those is a name
    // or a note.
    const READ_ONLY = /id="impText"|id="qTxt"|id="mText"|readonly|u-minh160_fs12|data-abind|data-fbind|data-bind="height"/;
    const src = sourceTexts().join('\n');
    const fields = [...src.matchAll(/<(?:textarea|input type="text")[^>]*>/g)].map(m => m[0]).filter(t => !/inputmode=/.test(t) && !READ_ONLY.test(t));
    const bare = fields.filter(t => !/maxlength=/.test(t));
    ok(fields.length >= 9 && !bare.length, `5. 2.27-F3: every field a name or a note is typed into has a length limit (${fields.length} fields; 2.27: none on notes or names)`, bare);
    // The save keeps to the same limit, whatever reaches the field (a paste past its limit, a value set by a script).
    const D = await started();
    const pg = D.page;
    await pg.click('[data-act="bNote"][data-b="0"]'); await wait(300);
    await pg.evaluate(() => { document.getElementById('mNote').value = 'n'.repeat(9000); });
    await pg.click('#modal [data-act="noteSave"]'); await wait(300);
    const n = await pg.evaluate(() => window.__ironlog.state.draft.ex[0].note.length);
    const lim = await pg.evaluate(() => Number(document.querySelector('[data-bind="draftNotes"]').getAttribute('maxlength')));
    ok(lim >= 2000 && n === lim, '5. 2.27-F3: a note longer than the limit is saved at the limit, the field\'s own (2.27: 9,000 characters kept)', { n, lim });
    // A note saved longer than the limit before it existed is edited, never cut: one character deleted, one gone.
    await pg.evaluate(() => { const L = window.__ironlog; L.act(() => { L.state.draft.notes = 'w'.repeat(6000); }, { inProgress: true }); L.render(); });
    await wait(200);
    await pg.focus('[data-bind="draftNotes"]'); await pg.evaluate(() => { const t = document.querySelector('[data-bind="draftNotes"]'); t.setSelectionRange(t.value.length, t.value.length); });
    await pg.keyboard.press('Backspace'); await wait(700);
    const kept = await pg.evaluate(() => window.__ironlog.state.draft.notes.length);
    ok(kept === 5999, '5. 2.27-F3: a note saved longer than the limit before 2.28 loses one character when one is deleted, never cut to the limit (the 2.28 reviewed: cut to 5,000)', kept);
    ok(!D.errors.length, '5. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(6)) {
    // A zip holding a sheet that inflates to 200 MB of spaces, built without holding 200 MB.
    const zlib = require('zlib');
    const N = 200 * 1024 * 1024, chunk = Buffer.alloc(1 << 20, 32);
    const d = zlib.createDeflateRaw({ level: 9 }); const parts = []; d.on('data', c => parts.push(c));
    const ended = new Promise(r => d.on('end', r));
    for (let left = N; left > 0; left -= chunk.length) if (!d.write(chunk)) await new Promise(r => d.once('drain', r));
    d.end(); await ended;
    const comp = Buffer.concat(parts), name = Buffer.from('xl/worksheets/sheet1.xml');
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(N, 22); lh.writeUInt16LE(name.length, 26);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(N, 24); cd.writeUInt16LE(name.length, 28);
    const local = Buffer.concat([lh, name, comp]), central = Buffer.concat([cd, name]);
    const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(local.length, 16);
    const b64 = Buffer.concat([local, central, end]).toString('base64');
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00' });
    const r = await D.page.evaluate(async b64 => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); try { const rows = await window.__ironlog.impXlsx(u.buffer); return { rows: rows.length }; } catch (e) { return { threw: String(e && e.message || e) }; } }, b64);
    ok(r.threw === 'big', `6. 2.27-F10: a ${Math.round(comp.length / 1024)} KB .xlsx that inflates to 200 MB is stopped at the limit (2.27: inflated whole)`, r);
    // Through the import screen: the words say what to do.
    const fs = require('fs'), os = require('os'), path = require('path');
    const fp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-xlsx-')), 'big.xlsx'); fs.writeFileSync(fp, Buffer.from(b64, 'base64'));
    await D.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.openModal({ kind: 'imp', step: 'input', text: '', err: '' }); }); await wait(300);
    const inp = await D.page.$('#impFile');
    let said = '';
    if (inp) { await inp.setInputFiles(fp); await wait(2500); said = await D.page.evaluate(() => (document.querySelector('#modal') || {}).innerText || ''); }
    ok(/too large to read here/.test(said), '6. 2.27-F10: the import sheet says the spreadsheet is too large to read and to save the sheet as CSV', said.slice(0, 300));
    ok(!D.errors.length, '6. no page errors', D.errors);
    await D.browser.close();
  }

  if (run(7)) {
    const zlib = require('zlib'), fs = require('fs'), os = require('os'), path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-pic-'));
    // A PNG of w by h black pixels, its rows deflated one at a time: a small file of a huge picture.
    const png = (w, h) => {
      const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
      const chunk = (ty, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(ty), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
      const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
      // Every row is the same row of zeros, deflated as a stream so the whole picture is never held.
      const d = zlib.createDeflate({ level: 9 }); const parts = []; d.on('data', c => parts.push(c));
      const row = Buffer.alloc(w * 3 + 1);
      return new Promise(res => { d.on('end', () => res(Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', Buffer.concat(parts)), chunk('IEND', Buffer.alloc(0))]))); let i = 0; (function pump() { while (i < h) { i++; if (!d.write(row)) return d.once('drain', pump); } d.end(); })(); });
    };
    for (const [w, h, what] of [[8064, 6048, 'an iPhone 14 Pro 48 MP photo\'s size'], [20000, 20000, '20,000 by 20,000 px']]) {
      const fp = path.join(dir, `p${w}.png`); fs.writeFileSync(fp, await png(w, h));
      const D = await started();
      let crashed = false; D.page.on('crash', () => { crashed = true; });
      await D.page.setInputFiles('input[data-pic]', fp);
      let r = null;
      for (let i = 0; i < 60 && !crashed; i++) { await wait(500); r = await D.page.evaluate(() => ({ pics: (window.__ironlog.state.draft.pics || []).length, toast: (document.getElementById('toast') || {}).innerText || '' })).catch(e => ({ gone: e.message })); if (r.gone || r.pics || r.toast) break; }
      ok(!crashed && r && !r.gone && (r.pics === 1 || /photo|picture/i.test(r.toast)), `7. 2.27-F10: a picture of ${what} is kept, or refused with words; the page stays (a guard)`, { crashed, r });
      ok(crashed || !D.errors.length, `7. no page errors (${w} px)`, D.errors);
      await D.browser.close().catch(() => {});
    }
  }

  if (run(8)) {
    const D = await open(FILE, { w: 390, h: 844, clock: T + 'T10:00:00', realStarter: true });
    const pg = D.page;
    await wait(600);
    // The standalone build, with an account service, opens on the account page first: past it, as a lifter goes.
    if (await pg.$('[data-act="obAcctLater"]')) { await pg.click('[data-act="obAcctLater"]'); await wait(500); }
    const r = await pg.evaluate(() => { const f = document.getElementById('obBw'); return { ph: f ? f.getAttribute('placeholder') : 'no field', tags: [...document.querySelectorAll('.ob-opt span')].map(x => x.textContent) }; });
    ok(r.ph === null || r.ph === '', '8. 393: the first page\'s bodyweight field has no sentence in it (2.27: "lb, for pull-ups, dips, and push-ups")', r);
    ok(!r.tags.some(t => /as you go|your exercises/.test(t)), '8. the start options carry no taglines (2.27: "Add exercises as you go", "Your days, your exercises")', r.tags);
    await pg.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); L.openModal({ kind: 'injury' }); }); await wait(300);
    const inj = await pg.evaluate(() => [...document.querySelectorAll('#modal p')].map(p => p.textContent.trim()).filter(Boolean));
    await pg.evaluate(() => { const L = window.__ironlog; L.ACT.mClose(); L.openModal({ kind: 'imp', step: 'input', text: '', err: '' }); }); await wait(300);
    const imp = await pg.evaluate(() => [...document.querySelectorAll('#modal p')].map(p => p.textContent.trim()).filter(Boolean));
    const longest = Math.max(...[...inj, ...imp].map(t => t.length));
    ok(longest <= 80, `8. the injury and import sheets' standing lines are short (the longest ${longest} characters; 2.27: 89)`, { inj, imp });
    ok(!D.errors.length, '8. no page errors', D.errors);
    await D.browser.close();
  }

  console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
