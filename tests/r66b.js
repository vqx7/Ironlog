// r66, the session screen (V's list of 2026-11-01, PENDING 372 to 376 and 368),
// each section failing on r65.2 (`node tests/r66b.js baselines/r65-2.html`)
// unless it says it is a guard. `R66B=1,3` runs some sections.
//   1  pictures on notes (373): added from an exercise's note and under the
//      workout's notes, drawn again as a JPEG on the phone (what a file hid,
//      a camera's location among it, is gone), SVG refused, saved with the
//      session by Finish, shown in History after a reload, taken off with a
//      question and put back by Undo, taken off for good by an edit saved
//      (through a reload); Discard asks when only a picture was
//      added; r65.2 keeps a session's pictures through its own save (a guard
//      on the build before); Erase everything takes them off the phone.
//   2  Done with an exercise that has sets left (374): one tap, then Log
//      them as shown (each set left ticked at its grey load and reps, one
//      Undo) or Skip them (taken off, one Undo); the next session reads a
//      skipped exercise as short of its usual sets, so the target repeats;
//      a set left with nothing to take is not logged blind.
//   3  supersets and drop sets (375): a superset is one group, its letter at
//      the top and A1, A2 on the exercises; after A1's set the screen brings
//      up A2's next set, and the rest starts only after the pair; + Drop puts
//      the drop set straight under the set it drops from, marked and named,
//      and ticking that set starts no rest while the drop waits.
//   4  bodyweight (372): with none logged, Today asks from the first day a
//      bodyweight lift is in the routine (Later puts it off), each
//      bodyweight lift in a session says it counts only the weight added and
//      opens a sheet to set it, adding one says so once, and Settings holds
//      the field; one weigh-in later all of it goes quiet.
//   5  368: no button is a block (the card's class); full-width buttons are
//      fullw, and every one of them, in light and dark, in Today, the first
//      page and five sheets, has r65.2's computed look (padding, margins,
//      corners, colours, height), read beside r65.2 itself.
//   6  retired in 2.40 (CL-3): compared r65.2 and r66 as published (docs/ARCHIVE.md).
//   7  pictures over time (373): a note whose four ids came from a backup
//      restored (no bytes on this phone) shows nothing, still offers
//      + Picture, and keeps the new one; the bytes of a picture taken off are
//      dropped once it has gone unnamed 45 days, while one the log still
//      names, and one on a session in Recently deleted, are kept.
//   8  Export CSV (NEW-35): a note a spreadsheet would read as a formula
//      (=, +, -, @) is written with a ' in front, a number (a negative load
//      on an assisted lift among them) as it is, and Ironlog's own export
//      imported back gives every note as typed.
//   9  NEW-30: sets done at one load heavier than a reps target's count
//      toward its reps (a heavier set is at least as hard): leg press 1,000 x
//      15, 15, 14 against 990 for 37+ reads beaten on the screen and in the
//      recap, as do 990 x 13 x 3 and bench 235 x 9 x 3 after 225 x 8 x 3, and
//      the next session's target has moved; heavier sets with fewer reps and
//      a lower estimate (235 x 6 x 3) are not beaten; with loads mixed only
//      the sets at the target's load count, as the next target reads them.
//  10  377: the exercise picker finds a lift by what lifters call it: "rear
//      delt pec deck flyes" finds Reverse Pec Deck (Rear Delt Fly), and
//      "reverse fly", "peck deck", "bicep curl", "hamstring curl", "dumbbell
//      row", "rdl", "ohp", "tricep pushdown", "chest fly", "military press" and
//      "lunges" each find theirs, by the main muscle, a plural or a common
//      name; "bench" still finds only bench presses. A log saved by r65.2,
//      which holds every built-in by name, reads the machine by its new name
//      too and finds it the same way (NEW-37), a name the lifter gave stays,
//      and an import naming Reverse Pec Deck still finds it first.
//  11  pictures (373): a lift done twice in a row is saved as one exercise,
//      and the pictures on both its notes are all kept, through a reload
//      (they were cut to four).
//  12  pictures (373): Undo puts back a picture taken off the workout's
//      notes, as its question says; a second tab open on the same workout
//      shows the four pictures the first added, and its note is full there
//      too (it showed none and cut one when it added its own).
//  13  pictures (373) and the account: signed in, a session saved with a
//      picture; signed out, the log leaves the phone; fifty days of the app's
//      tidy keep the picture, since nothing on the phone can name it while
//      its log is in the account; signed in again, History shows it (the
//      built app with the stand-in account service, on the source run).
//  14  pictures (373) in a browser whose IndexedDB refuses a Blob, as
//      WebKit's private contexts may: each picture is kept as its bytes and
//      type, the refusal logged once, shown in History after a reload, and
//      written back the same way by the tidy.
const { open, engine, tab } = require('./h');
let browser;
const FILE = process.argv[2] || process.env.IRONLOG_FILE || 'index.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.env.R66B ? process.env.R66B.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const LB = 0.45359237;
const MON = '2026-11-02';
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const SECRET = 'IRONLOG-SECRET-GPS-34.0522N-118.2437W';

async function phone(start, o = {}) {
  const setup = async ctx => { await ctx.addInitScript(`(()=>{const R=Date;let off=new R(${JSON.stringify(start + 'T09:00:00')}).getTime()-R.now();window.__setClock=t=>{off=new R(t).getTime()-R.now();};class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`);  if (o.setup) await ctx.addInitScript(o.setup); };
  const P = o.P ? { ...o.P, page: await o.P.ctx.newPage(), errors: [] } : await open(o.file || FILE, { browser, setup, w: o.w || 390, h: 844 });
  if (o.P) {
    P.page.on('pageerror', e => P.errors.push('pageerror: ' + e.message));
    await P.page.route('**/*', require('./h').__serve || (r => r.continue()));
  }
  const page = P.page;
  const ev = (f, a) => page.evaluate(f, a);
  return {
    P, page, ev,
    draft: () => ev(() => JSON.parse(JSON.stringify(window.__ironlog.state.draft))),
    modal: () => ev(() => { const m = window.__ironlog.ui.modal; return m ? { kind: m.kind, title: m.title || '', text: (document.getElementById('modal') || {}).innerText || '' } : null; }),
    toast: () => ev(() => { const t = document.getElementById('toast'); return t && !t.hidden ? t.innerText.trim() : ''; }),
    go: async t => { await ev(t => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = t; L.render(); }, t); await wait(120); }
  };
}

const seed = (H, o = {}) => H.ev(o => {
  const L = window.__ironlog; const S = L.state; const LB = 0.45359237;
  S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false;
  const R = { id: 'R1', name: 'Mine', schedule: 'weekly', days: [{ id: 'D1', name: 'Push', items: [{ uid: 'u1', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 5 * LB, ss: null }, { uid: 'u2', exId: 'ohp', sets: 2, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 5 * LB, ss: null }] }] };
  S.routines = [R]; S.activeRoutineId = 'R1';
  S.sessions = (o.sessions || []);
  L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
}, o);

/* A JPEG made in the page, with a comment segment and an Exif segment each
   carrying a marker, as a camera's location would ride in a photo. */
const jpegWithSecret = H => H.ev(async secret => {
  const c = document.createElement('canvas'); c.width = 2400; c.height = 1800;
  const x = c.getContext('2d'); x.fillStyle = '#c33'; x.fillRect(0, 0, 2400, 1800); x.fillStyle = '#3c3'; x.fillRect(200, 200, 800, 600);
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
  const u = new Uint8Array(await b.arrayBuffer());
  const enc = new TextEncoder();
  const seg = (marker, payload) => { const len = payload.length + 2; return [0xff, marker, len >> 8, len & 255, ...payload]; };
  const com = seg(0xfe, [...enc.encode(secret)]);
  const exif = seg(0xe1, [...enc.encode('Exif\0\0'), ...enc.encode(secret)]);
  const out = new Uint8Array(u.length + com.length + exif.length);
  out.set(u.slice(0, 2), 0); out.set(exif, 2); out.set(com, 2 + exif.length); out.set(u.slice(2), 2 + exif.length + com.length);
  return Array.from(out);
}, SECRET);

const pickFile = async (H, selector, name, mimeType, bytes) => {
  const n0 = await H.ev(() => JSON.stringify(window.__ironlog.state.draft || {}).length);
  await H.page.setInputFiles(selector, { name, mimeType, buffer: Buffer.from(bytes) });
  // The photo is decoded and drawn again before it is added: wait for the session to change or a toast to say why not.
  for (let k = 0; k < 40; k++) { await wait(100); const [n, t] = await H.ev(() => [JSON.stringify(window.__ironlog.state.draft || {}).length, (document.getElementById('toast') || {}).hidden === false]); if (n !== n0 || t) break; }
  await wait(100);
};

// Every picture kept on the phone, read back from IndexedDB: its type, size, and whether its bytes hold the marker.
const stored = H => H.ev(async secret => {
  const dbs = indexedDB.databases ? (await indexedDB.databases()).map(d => d.name) : [];
  const name = dbs.find(n => /-pics$/.test(n || ''));
  if (!name) return { name: null, rows: [] };
  const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const rows = await new Promise(res => { const q = db.transaction('pics').objectStore('pics').getAll(); q.onsuccess = () => res(q.result); q.onerror = () => res([]); });
  const out = [];
  // A row holds the picture, or its bytes and type where the browser's store refused the picture itself.
  for (const r of rows) {
    const buf = r.blob ? await r.blob.arrayBuffer() : r.bytes;
    const t = new TextDecoder('latin1').decode(new Uint8Array(buf));
    out.push({ id: r.id, type: r.blob ? r.blob.type : r.type, size: buf.byteLength, w: r.w, h: r.h, secret: t.includes(secret), as: r.blob ? 'blob' : 'bytes' });
  }
  db.close();
  return { name, rows: out };
}, SECRET);

(async () => {
  browser = await engine.launch();

  if (run(1)) {
    const H = await phone(MON);
    await seed(H);
    // Whether this browser's IndexedDB keeps a Blob (WebKit's private contexts may not): said, not checked; the app keeps bytes where it does not.
    const probe = await H.ev(async () => {
      try {
        const db = await new Promise((res, rej) => { const r = indexedDB.open('r66b-probe', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
        const said = await new Promise(res => { const tx = db.transaction('s', 'readwrite'); tx.objectStore('s').put(new Blob(['x'], { type: 'text/plain' }), 'k'); tx.oncomplete = () => res('kept'); tx.onerror = () => res('refused: ' + (tx.error && tx.error.message)); tx.onabort = () => res('refused: ' + (tx.error && tx.error.message)); });
        db.close(); indexedDB.deleteDatabase('r66b-probe');
        return said;
      } catch (e) { return 'refused: ' + e.message; }
    });
    console.log(`note r66b: this browser's IndexedDB, given a Blob: ${probe}`);
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    // The note button sits on the exercise's card itself, not only in its menu (376).
    const noteBtn = await H.page.$('#view [data-act="bNote"][data-b="0"]');
    ok(!!noteBtn, '1. the bench card has its own note button');
    if (noteBtn) { await noteBtn.click(); await wait(150); }
    const m = await H.modal();
    ok(m && m.kind === 'note', '1. it opens the note sheet', m);
    const fileSel = '#modal input[type="file"][data-pic="0"]';
    ok(!!(await H.page.$(fileSel)), '1. the note sheet offers + Picture');
    const bytes = await jpegWithSecret(H);
    ok(Buffer.from(bytes).includes(Buffer.from(SECRET)), '1. (the test photo carries the marker in its Exif and comment)');
    if (await H.page.$(fileSel)) await pickFile(H, fileSel, 'IMG_0001.jpg', 'image/jpeg', bytes);
    let d = await H.draft();
    // On a failure, what the phone said and what the app logged go with it (WebKit runs only on GitHub).
    const why1 = async () => ({ toast: await H.toast(), log: await H.ev(() => window.__ironlog.logBuf.filter(x => /pics|storage/.test(x.a)).map(x => x.a + ': ' + x.m + (x.s ? ' @ ' + x.s.split('\n')[1] : ''))) });
    ok(d.ex[0].pics && d.ex[0].pics.length === 1, '1. the picture is on the bench\'s note at once', { pics: d.ex[0].pics, ...(d.ex[0].pics ? {} : await why1()) });
    const thumbIn = await H.ev(() => { const i = document.querySelector('#modal .pthumb img'); return i ? { src: i.src.slice(0, 5), w: i.naturalWidth } : null; });
    ok(thumbIn && thumbIn.src === 'blob:' && thumbIn.w > 0, '1. its thumbnail shows in the sheet', thumbIn);
    const st = await stored(H);
    const r0 = st.rows[0];
    ok(st.rows.length === 1 && r0.type === 'image/jpeg' && Math.max(r0.w, r0.h) <= 1600 && r0.w > 0, '1. kept as a JPEG drawn again at 1600 px at most (2400 x 1800 in)', st);
    ok(r0 && !r0.secret, '1. what the file hid (a camera\'s location, a comment) is not in what is kept', r0);
    // An SVG is refused: it can carry script, and it is not a photo.
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>`);
    if (await H.page.$(fileSel)) await pickFile(H, fileSel, 'x.svg', 'image/svg+xml', svg);
    d = await H.draft();
    ok((d.ex[0].pics || []).length === 1 && /Only photos/.test(await H.toast()), '1. an SVG is refused with a reason, nothing added', { pics: d.ex[0].pics, toast: await H.toast() });
    // A file that only says it is an image is refused when it cannot be read as one.
    if (await H.page.$(fileSel)) await pickFile(H, fileSel, 'fake.jpg', 'image/jpeg', Buffer.from('MZ this is not a photo'));
    d = await H.draft();
    ok((d.ex[0].pics || []).length === 1 && /could not be read/.test(await H.toast()), '1. a file that is not a photo is refused', { pics: d.ex[0].pics, toast: await H.toast() });
    await H.ev(() => { document.getElementById('mNote').value = 'Seat 4'; });
    await H.page.click('#modal [data-act="noteSave"]'); await wait(150);
    const card = await H.ev(() => { const i = document.querySelector('#blk-0 .pthumb img'); return i ? i.naturalWidth : 0; });
    ok(card > 0, '1. the card shows the picture under the note');
    // The workout's notes take a picture too.
    const nSel = '#view input[type="file"][data-pic="n"]';
    ok(!!(await H.page.$(nSel)), '1. the workout\'s notes offer + Picture');
    if (await H.page.$(nSel)) await pickFile(H, nSel, 'IMG_0002.jpg', 'image/jpeg', bytes);
    for (let k = 0; k < 30; k++) { d = await H.draft(); if (d.pics) break; await wait(100); }
    ok(d.pics && d.pics.length === 1, '1. the picture is on the workout\'s notes', d.pics);
    // Discard asks when nothing but pictures were added (here a note too; checked alone below).
    // Finish: a set ticked so the session saves.
    await H.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets[0].w = 225 * 0.45359237; b.sets[0].r = 8; b.sets[0].done = true; L.saveNow(); L.render(); });
    await H.page.click('#view [data-act="finish"]');
    for (let k = 0; k < 5; k++) { await wait(150); const q = await H.modal(); if (!q || q.kind !== 'confirm') break; await H.page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]'); }
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const s = await H.ev(() => { const s = window.__ironlog.state.sessions[0]; return s && { pics: s.pics, ex: s.ex.map(b => ({ exId: b.exId, pics: b.pics, keys: Object.keys(b) })), keys: Object.keys(s) }; });
    ok(s && s.pics && s.pics.length === 1 && s.ex[0].pics && s.ex[0].pics.length === 1, '1. Finish saves both notes\' pictures with the session', s);
    ok(s && s.keys[s.keys.length - 1] === 'pics' && s.ex[0].keys[s.ex[0].keys.length - 1] === 'pics', '1. saved last, where a reload writes them', s && { keys: s.keys, ex: s.ex[0].keys });
    const norm = await H.ev(() => { const L = window.__ironlog; const n1 = L.normalize(JSON.parse(JSON.stringify(L.state))); const n2 = L.normalize(JSON.parse(JSON.stringify(n1))); const s1 = n1.sessions[0]; return { same: JSON.stringify(n1.sessions) === JSON.stringify(n2.sessions), pics: s1.pics, ex: s1.ex[0].pics }; });
    ok(norm.same && norm.pics && norm.pics.length === 1 && norm.ex && norm.ex.length === 1, '1. a reload keeps both, and reads the same text twice', norm);
    // After a reload, History shows them.
    await H.page.reload(); await H.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(500);
    await H.go('history');
    await H.page.click('#view [data-act="histToggle"]');
    await wait(200);
    const hist = await H.ev(() => [...document.querySelectorAll('#view .pthumb img')].map(i => i.naturalWidth));
    ok(hist.length === 2 && hist.every(w => w > 0), '1. after a reload History shows both pictures', { hist, panels: await H.ev(() => ({ n: document.querySelectorAll('#view .panel').length, acts: [...document.querySelectorAll('#view [data-act]')].map(e => e.dataset.act).slice(0, 30), sess: window.__ironlog.state.sessions.map(s => s.pics) })) });
    // Opened from History: large, with nothing to remove there.
    if (hist.length) { await H.page.click('#view .pthumb'); await wait(150); }
    const big = await H.ev(() => { const i = document.querySelector('#modal .pbig'); return { w: i ? i.naturalWidth : 0, remove: !!document.querySelector('#modal [data-act="picRemove"]') }; });
    ok(big.w > 0 && !big.remove, '1. a picture opens large from History, with no Remove there', big);
    await H.ev(() => window.__ironlog.ACT.mClose());
    // Taken off in an edit: asked first, then Undo puts it back.
    const sid = await H.ev(() => window.__ironlog.state.sessions[0].id);
    await H.ev(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), sid); await wait(200);
    d = await H.draft();
    ok(d && d.ex[0].pics && d.ex[0].pics.length === 1, '1. an edit from History opens with the pictures', d && d.ex[0].pics);
    await H.page.click('#blk-0 .pthumb'); await wait(150);
    await H.page.click('#modal [data-act="picRemove"]'); await wait(150);
    const q = await H.modal();
    ok(q && q.kind === 'confirm' && /Remove this picture/.test(q.title), '1. Remove asks first', q);
    await H.page.click('#modal [data-act="mOk"]'); await wait(150);
    d = await H.draft();
    ok(!d.ex[0].pics, '1. removed: the field is gone, not left empty', d.ex[0]);
    await H.ev(() => window.__ironlog.ACT.undo && window.__ironlog.ACT.undo()); await wait(150);
    const und = await H.ev(() => { const b = document.querySelector('#toast [data-act="toastUndo"], #toast button'); if (b) b.click(); return !!b; });
    await wait(200);
    d = await H.draft();
    ok(d.ex[0].pics && d.ex[0].pics.length === 1, '1. Undo puts it back', { undoTapped: und, pics: d.ex[0].pics });
    // Taken off for good: the exercise's picture and the workout's both removed in the edit, and the edit saved. The
    // saved session holds neither, through a reload: an edit's save never brings back from the old copy what was taken off.
    for (const sel of ['#blk-0 .pthumb', '#view .pthumb[data-at="n"]']) {
      await H.page.click(sel); await wait(150);
      await H.page.click('#modal [data-act="picRemove"]'); await wait(150);
      await H.page.click('#modal [data-act="mOk"]'); await wait(150);
    }
    await H.page.click('#view [data-act="finish"]'); await wait(300);
    for (let k = 0; k < 4; k++) { const m = await H.modal(); if (!m) break; if (m.kind === 'confirm') await H.page.click('#modal [data-act="mOk"]'); else await H.ev(() => window.__ironlog.ACT.mClose()); await wait(150); }
    const off = () => H.ev(id => { const s = window.__ironlog.state.sessions.find(x => x.id === id); return s ? { saved: true, pics: s.pics || null, ex0: s.ex[0].pics || null, keys: Object.keys(s).includes('pics') } : { saved: false }; }, sid);
    const off1 = await off();
    ok(off1.saved && !off1.pics && !off1.ex0 && !off1.keys, '1. both taken off in an edit and saved: the session holds neither picture', off1);
    await H.page.reload(); await H.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(400);
    const off2 = await off();
    ok(off2.saved && !off2.pics && !off2.ex0, '1. ... and neither comes back after a reload', off2);
    // Discard asks when only a picture was added.
    await H.go('today');
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    if (await H.page.$(nSel)) await pickFile(H, nSel, 'IMG_0003.jpg', 'image/jpeg', bytes);
    await H.page.click('#view [data-act="discard"]'); await wait(150);
    const dq = await H.modal();
    ok(dq && dq.kind === 'confirm', '1. Discard asks first when only a picture was added', dq);
    await H.ev(() => { const m = document.querySelector('#modal [data-act="mOk"]'); if (m) m.click(); }); await wait(150);
    // Erase everything: pictures off the phone.
    await H.go('settings');
    await H.ev(() => window.__ironlog.ACT.resetAll()); await wait(150);
    const eq = await H.modal();
    ok(eq && /Pictures on this phone go too/.test(eq.text), '1. Erase everything says pictures go too', eq && eq.text);
    await H.page.click('#modal [data-act="mOk"]'); await wait(600);
    const after = await stored(H);
    ok(after.rows.length === 0, '1. after Erase everything no picture is left on the phone', after);
    ok(!H.P.errors.length, '1. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 2. Done with sets left.
  if (run(2)) {
    const H = await phone(MON);
    const hist = [0, 7].map((k, i) => ({ id: 'h' + i, date: addD(MON, -14 + k), dayIdx: 0, dayId: 'D1', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [1, 2, 3].map(() => ({ w: 225 * LB, r: 8, rir: 2, warm: false, drop: false })) }] }));
    await seed(H, { sessions: hist });
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    ok(!(await H.page.$('#view [data-act="bDoneAll"][data-b="0"]')), '2. no Done before a set is done');
    // Set 1 done by hand, then Done: Log them as shown.
    await H.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets[0].r = 9; L.render(); });
    await H.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(150);
    ok(!!(await H.page.$('#view [data-act="bDoneAll"][data-b="0"]')), '2. Done shows once a set is done and sets are left');
    await H.page.click('#view [data-act="bDoneAll"][data-b="0"]'); await wait(150);
    let q = await H.modal();
    ok(q && q.kind === 'confirm' && /2 sets left/.test(q.title) && /Log them as shown/.test(q.text) && /Skip them/.test(q.text), '2. one question: log the 2 left as shown, or skip them', q);
    await H.page.click('#modal [data-act="mOk"]'); await wait(200);
    let d = await H.draft();
    const b0 = d.ex[0];
    ok(b0.sets.length === 3 && b0.sets.every(x => x.done) && b0.sets.slice(1).every(x => Math.round(x.w / LB) === 225 && x.r === 8), '2. Log: both left ticked at their grey 225 x 8', b0.sets.map(x => [x.done, Math.round(x.w / LB), x.r]));
    await H.ev(() => { const b = document.querySelector('#toast button'); if (b) b.click(); }); await wait(200);
    d = await H.draft();
    ok(d.ex[0].sets.filter(x => x.done).length === 1, '2. one Undo takes the whole Log back', d.ex[0].sets.map(x => x.done));
    // As shown means as shown: set 2 typed far easier than planned (12 at 5 in reserve) would move set 3's grey numbers
    // once ticked; Log takes what set 3 showed when Done was tapped, 225 x 8 (it took 245 x 9 before this was fixed).
    await H.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets; s[1].w = 225 * 0.45359237; s[1].r = 12; s[1].rir = 5; L.render(); });
    const shown3 = await H.ev(() => { const w = document.querySelector('[data-f="w"][data-b="0"][data-s="2"]'), r = document.querySelector('[data-f="r"][data-b="0"][data-s="2"]'); return [w.value || w.placeholder, r.value || r.placeholder]; });
    await H.page.click('#view [data-act="bDoneAll"][data-b="0"]'); await wait(150);
    await H.page.click('#modal [data-act="mOk"]'); await wait(200);
    d = await H.draft();
    const got3 = [String(Math.round(d.ex[0].sets[2].w / LB)), String(d.ex[0].sets[2].r)];
    ok(JSON.stringify(got3) === JSON.stringify(shown3) && shown3[0] === '225', '2. Log ticks each set at what it showed when Done was tapped, not what a tick before it changed it to', { shown3, got3 });
    await H.ev(() => { const b = document.querySelector('#toast button'); if (b) b.click(); }); await wait(200);
    await H.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets; s[1].w = null; s[1].r = null; s[1].rir = null; L.render(); });
    // Skip them on the press.
    await H.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[1]; b.sets[0].w = 135 * 0.45359237; b.sets[0].r = 8; L.render(); });
    await H.page.click('#view [data-act="sDone"][data-b="1"][data-s="0"]'); await wait(150);
    await H.page.click('#view [data-act="bDoneAll"][data-b="1"]'); await wait(150);
    q = await H.modal();
    ok(q && /1 set left/.test(q.title), '2. the press asks about its 1 set left', q);
    await H.page.click('#modal [data-act="mAlt"]'); await wait(200);
    d = await H.draft();
    ok(d.ex[1].sets.length === 1 && d.ex[1].sets[0].done, '2. Skip: the set left is taken off, the done one kept', d.ex[1].sets);
    // A set left typed far off (a slipped digit, 3000) is not logged blind: it is ticked on its own, where it is asked about; only Skip is offered.
    await H.ev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex.push(L.newBlock('dbRow', { sets: 2, repMin: 8, repMax: 12, rir: 2, rest: 90, inc: 2.5 })); const b = d.ex[d.ex.length - 1]; b.sets[0].w = 30; b.sets[0].r = 10; b.sets[0].done = true; b.sets[1].w = 300; b.sets[1].r = 10; L.render(); });
    const k = d.ex.length;
    await H.page.click(`#view [data-act="bDoneAll"][data-b="${k}"]`); await wait(150);
    q = await H.modal();
    ok(q && /looks far off/.test(q.text) && /Set 2/.test(q.text) && !(await H.page.$('#modal [data-act="mAlt"]')), '2. a set left typed far off: it names it, says to tick it on its own, and offers only Skip', q);
    await H.ev(() => window.__ironlog.ACT.mClose());
    // Finish with the bench in full and the press skipped: the next week the press repeats its target.
    await H.page.click('#view [data-act="bDoneAll"][data-b="0"]'); await wait(150); await H.page.click('#modal [data-act="mOk"]'); await wait(200);
    await H.ev(() => { const L = window.__ironlog; L.state.draft.ex.pop(); L.render(); });
    await H.page.click('#view [data-act="finish"]');
    for (let j = 0; j < 5; j++) { await wait(150); const m = await H.modal(); if (!m || m.kind !== 'confirm') break; await H.page.click('#modal [data-act="mAlt"]'); }
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const saved = await H.ev(() => window.__ironlog.state.sessions.find(s => s.date === '2026-11-02').ex.map(b => [b.exId, b.sets.length]));
    ok(JSON.stringify(saved) === JSON.stringify([['bench', 3], ['ohp', 1]]), '2. saved: bench 3 sets, press 1', saved);
    await H.ev(t => { window.__setClock(t); const L = window.__ironlog; L.invalidate(); L.render(); }, addD(MON, 7) + 'T09:00:00'); await wait(100);
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    d = await H.draft();
    ok(d.ex[1].tgt && Math.round(d.ex[1].tgt.w / LB) === 135, '2. the next week the press asks 135 again: one set of two is short of its usual, so the target repeats', d.ex[1].tgt);
    ok(!H.P.errors.length, '2. no page errors', H.P.errors);
    await H.P.ctx.close();
  }
  if (run(2)) {
    // As shown means as typed: a 0 typed in a set left is a missed set, logged as one, never the grey reps (the review of r66).
    const H = await phone(MON);
    const hist = [0, 7].map((k, i) => ({ id: 'h' + i, date: addD(MON, -14 + k), dayIdx: 0, dayId: 'D1', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'bench', rr: [6, 10], sets: [1, 2, 3].map(() => ({ w: 225 * LB, r: 8, rir: 2, warm: false, drop: false })) }] }));
    await seed(H, { sessions: hist });
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    await H.ev(() => { const L = window.__ironlog; L.state.draft.ex[0].sets[0].r = 8; L.render(); });
    await H.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(150);
    await H.page.fill('[data-f="r"][data-b="0"][data-s="1"]', '0'); await H.ev(() => document.activeElement && document.activeElement.blur()); await wait(150);
    await H.page.click('#view [data-act="bDoneAll"][data-b="0"]'); await wait(150);
    await H.page.click('#modal [data-act="mOk"]'); await wait(200);
    let d = await H.draft();
    const got = d.ex[0].sets.map(x => [x.done, Math.round(x.w / LB), x.r]);
    ok(JSON.stringify(got) === JSON.stringify([[true, 225, 8], [true, 225, 0], [true, 225, 8]]), '2. a 0 typed in a set left is logged as a missed set (225 x 0), the others as shown', got);
    // A warm-up alone left (every working set done): Done asks about it as a set, says nothing of the target, and Log keeps it as a warm-up.
    await H.ev(() => { const L = window.__ironlog; L.ACT.wAdd({ dataset: { b: '1' } }); if (L.ui.modal) L.ACT.mClose(); }); await wait(150);
    await H.ev(() => { const L = window.__ironlog; for (const s of L.state.draft.ex[1].sets) if (!s.warm) { s.w = 135 * 0.45359237; s.r = 8; s.done = true; } L.saveNow(); L.render(); }); await wait(150);
    await H.ev(() => window.__ironlog.ACT.bOpen({ dataset: { b: '1' } })); await wait(150);
    await H.page.fill('[data-f="w"][data-b="1"][data-s="0"]', '95'); await H.ev(() => document.activeElement && document.activeElement.blur()); await wait(150);
    const wShown = await H.ev(() => { const w = document.querySelector('[data-f="w"][data-b="1"][data-s="0"]'), r = document.querySelector('[data-f="r"][data-b="1"][data-s="0"]'); return [Number(w.value || w.placeholder), Number(r.value || r.placeholder)]; });
    await H.page.click('#view [data-act="bDoneAll"][data-b="1"]'); await wait(150);
    const q = await H.modal();
    ok(q && /1 set left/.test(q.title) && !/target repeats/.test(q.text) && /Log them as shown/.test(q.text), '2. a warm-up alone left: one question, nothing said of the target', q);
    await H.page.click('#modal [data-act="mOk"]'); await wait(200);
    d = await H.draft();
    const wu = d.ex[1].sets[0];
    ok(d.ex[1].sets.length === 3 && wu.warm && wu.done && Math.round(wu.w / LB) === wShown[0] && wu.r === wShown[1] && wShown[0] > 0, '2. ... Log keeps it, ticked as a warm-up at what it showed', { shown: wShown, sets: d.ex[1].sets.map(x => [x.warm, x.done, Math.round(x.w / LB), x.r]) });
    // A drop set alone left is not a working set short either: nothing said of the target.
    await H.ev(() => window.__ironlog.ACT.bOpen({ dataset: { b: '1' } })); await wait(150);
    await H.page.click('#view [data-act="dropAdd"][data-b="1"]'); await wait(150);
    await H.page.click('#view [data-act="bDoneAll"][data-b="1"]'); await wait(150);
    const qd = await H.modal();
    ok(qd && /1 set left/.test(qd.title) && !/target repeats/.test(qd.text), '2. a drop set alone left: nothing said of the target', qd);
    await H.ev(() => window.__ironlog.ACT.mClose());
    ok(!H.P.errors.length, '2. no page errors (a 0 typed, a warm-up left)', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 3. Supersets and drop sets.
  if (run(3)) {
    const H = await phone(MON);
    await seed(H);
    await H.ev(() => { const L = window.__ironlog; const R = L.state.routines[0]; R.days[0].items[0].ss = 'g1'; R.days[0].items[1].ss = 'g1'; L.state.settings.timerMode = 'auto'; L.state = L.normalize(L.state); L.saveNow(); L.render(); });
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    const look = await H.ev(() => [0, 1].map(i => { const s = document.getElementById('blk-' + i); return { cls: s.className, top: (s.querySelector('.ssh') || {}).innerText || '', lbl: (s.querySelector('.sslbl') || {}).innerText || '' }; }));
    ok(/ss-first/.test(look[0].cls) && /ss-last/.test(look[1].cls) && /Superset A/i.test(look[0].top) && !look[1].top && look[0].lbl === 'A1' && look[1].lbl === 'A2', '3. one group: Superset A at the top, A1 and A2 on the exercises', look);
    const boxed = await H.ev(() => { const a = document.getElementById('blk-0').getBoundingClientRect(), b = document.getElementById('blk-1').getBoundingClientRect(); return Math.round(b.top - a.bottom); });
    ok(boxed <= 1, '3. the two cards meet edge to edge (one box)', boxed);
    await H.ev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[0].sets[0].w = 225 * 0.45359237; d.ex[0].sets[0].r = 8; d.ex[1].sets[0].w = 135 * 0.45359237; d.ex[1].sets[0].r = 8; L.render(); });
    await H.ev(() => window.scrollTo(0, 0));
    await H.page.click('#view [data-act="sDone"][data-b="0"][data-s="0"]'); await wait(900);
    const timer1 = await H.ev(() => !document.getElementById('timer').hidden);
    const seen = await H.ev(() => { const r = document.querySelector('[data-act="sDone"][data-b="1"][data-s="0"]').closest('.sg').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; });
    ok(!timer1, '3. after A1\'s set: no rest yet');
    ok(seen, '3. after A1\'s set the screen brings up A2\'s set');
    await H.page.click('#view [data-act="sDone"][data-b="1"][data-s="0"]'); await wait(300);
    ok(await H.ev(() => !document.getElementById('timer').hidden), '3. after A2\'s set: the rest starts');
    await H.ev(() => window.__ironlog.ACT.tStop && window.__ironlog.ACT.tStop());
    // + Drop on A1 goes under its set 1, before sets 2 and 3.
    await H.page.click('#view [data-act="dropAdd"][data-b="0"]'); await wait(200);
    let d = await H.draft();
    ok(d.ex[0].sets[1].drop && !d.ex[0].sets[2].drop && d.ex[0].sets.length === 4, '3. + Drop puts the drop set straight under set 1', d.ex[0].sets.map(x => (x.drop ? 'D' : x.done ? 'x' : 'o')));
    const row = await H.ev(() => { const r = document.querySelector('[data-act="sDone"][data-b="0"][data-s="1"]').closest('.sg'); return { cls: r.className, n: r.querySelector('.wbtn').innerText, ls: r.querySelector('.ls').innerText }; });
    ok(/sgdrop/.test(row.cls) && row.n === '↳' && row.ls === 'Drop', '3. the drop row is set in, marked ↳ and named Drop', row);
    // Set 2 ticked with a drop waiting under it: no rest before the drop.
    await H.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets.splice(1, 1); b.sets[1].w = 225 * 0.45359237; b.sets[1].r = 8; L.render(); });
    await H.ev(() => { const L = window.__ironlog; const d = L.state.draft; d.ex[1].sets[1].done = true; d.ex[1].sets[1].w = 135 * 0.45359237; d.ex[1].sets[1].r = 8; d.ex[1].sets[2] && (d.ex[1].sets.length = 2); L.render(); });
    await H.page.click('#view [data-act="sDone"][data-b="0"][data-s="1"]'); await wait(150);
    await H.page.click('#view [data-act="dropAdd"][data-b="0"]'); await wait(150);
    await H.ev(() => window.__ironlog.ACT.tStop && window.__ironlog.ACT.tStop());
    await H.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets[1].done = false; L.render(); });
    await H.page.click('#view [data-act="sDone"][data-b="0"][data-s="1"]'); await wait(300);
    ok(await H.ev(() => document.getElementById('timer').hidden), '3. a set with a drop waiting under it starts no rest');
    await H.page.click('#view [data-act="sDone"][data-b="0"][data-s="2"]'); await wait(300);
    ok(await H.ev(() => !document.getElementById('timer').hidden), '3. the drop done, the rest starts');
    ok(!H.P.errors.length, '3. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 4. Bodyweight.
  if (run(4)) {
    const H = await phone(MON);
    await seed(H);
    await H.ev(() => { const L = window.__ironlog; L.state.routines[0].days[0].items.push({ uid: 'u3', exId: 'pullup', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 0, ss: null }); L.state = L.normalize(L.state); L.saveNow(); L.render(); });
    const t0 = await H.ev(() => document.getElementById('view').innerText);
    ok(/Your bodyweight/.test(t0) && !!(await H.page.$('#bwDue')), '4. no weigh-in and pull-ups in the routine: Today asks from the first day', t0.slice(0, 400));
    await H.page.click('#bwDue [data-act="bwLater"]'); await wait(120);
    ok(!(await H.page.$('#bwDue')), '4. Later puts it off');
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    const d = await H.draft();
    const pb = d.ex.findIndex(b => b.exId === 'pullup');
    const warn = await H.ev(i => { const e = document.querySelector(`#blk-${i} .bwwarn`); return e ? e.innerText : ''; }, pb);
    ok(/counts only the weight you add/.test(warn), '4. the pull-ups say they count only the weight added', warn);
    ok(!(await H.ev(() => !!document.querySelector('#blk-0 .bwwarn'))), '4. the bench says nothing about bodyweight');
    await H.page.click(`#blk-${pb} [data-act="bwOpen"]`); await wait(150);
    const m = await H.modal();
    ok(m && m.kind === 'bw' && /you type only what you add/.test(m.text) && /Optional/.test(m.text), '4. Set it opens the bodyweight sheet: what it counts, optional', m);
    await H.ev(() => { document.getElementById('bwSheetVal').value = '180'; });
    await H.page.click('#modal [data-act="addBW"]'); await wait(200);
    const after = await H.ev(i => ({ modal: !!window.__ironlog.ui.modal, warn: !!document.querySelector(`#blk-${i} .bwwarn`), bw: window.__ironlog.state.bodyweights.map(b => Math.round(b.kg / 0.45359237)) }), pb);
    ok(!after.modal && !after.warn && after.bw.join() === '180', '4. saved: the sheet closes, the line goes, one weigh-in of 180', after);
    await H.go('settings');
    await H.ev(() => document.querySelectorAll('#view details:not([open]) > summary').forEach(x => x.click())); await wait(120);
    const st = await H.ev(() => { const e = document.getElementById('bwSet'); return e ? e.parentElement.innerText : ''; });
    ok(/Latest 180/.test(st), '4. Settings holds the bodyweight field, with the latest', st.slice(0, 200));
    ok(!H.P.errors.length, '4. no page errors', H.P.errors);
    await H.P.ctx.close();
    // Adding a bodyweight lift to a plan day says so once, without a sheet in the way.
    const H2 = await phone(MON);
    await seed(H2);
    await H2.ev(() => { const L = window.__ironlog; L.ui.tab = 'program'; L.render(); L.openModal({ kind: 'picker', mode: 'addDay', day: 0, title: 'Add', q: 'pull-up', m: '' }); });
    await wait(150);
    await H2.page.click('#modal [data-act="pickDo"][data-ex="pullup"]'); await wait(250);
    const said = await H2.ev(() => { const L = window.__ironlog; const t = document.getElementById('toast'); return { modal: L.ui.modal && L.ui.modal.kind, toast: t && !t.hidden ? t.innerText : '', added: L.state.routines[0].days[0].items.some(i => i.exId === 'pullup') }; });
    ok(said.added && !said.modal && /counts your bodyweight/.test(said.toast), '4. adding pull-ups to a plan day says it counts bodyweight, no sheet in the way', said);
    await H2.P.ctx.close();
  }

  // ---- 5. 368: a button is never a block.
  if (run(5)) {
    const H = await phone(MON);
    await seed(H);
    const r = await H.ev(async () => {
      const L = window.__ironlog; const out = { both: 0, full: [] };
      for (const t of ['today', 'program', 'history', 'settings', 'dash']) { L.ui.tab = t; L.render(); await new Promise(r => setTimeout(r, 60)); out.both += document.querySelectorAll('.btn.block').length; }
      L.ui.tab = 'today'; L.render(); L.ACT.pastOpen({ dataset: {} }); await new Promise(r => setTimeout(r, 100));
      out.both += document.querySelectorAll('.btn.block').length;
      out.full = [...document.querySelectorAll('#modal .btn.fullw')].map(b => Math.round(b.getBoundingClientRect().width - b.parentElement.getBoundingClientRect().width + parseFloat(getComputedStyle(b.parentElement).paddingLeft) + parseFloat(getComputedStyle(b.parentElement).paddingRight)));
      return out;
    });
    ok(r.both === 0, '5. no button carries the card\'s class block', r);
    ok(r.full.length && r.full.every(x => Math.abs(x) <= 1), '5. a fullw button fills its row', r.full);
    await H.P.ctx.close();
  }

  // ---- 5b. Every full-width button looks as it did on r65.2 (read beside r65.2 itself). A comparison of two pages built
  // from src/: the standalone build (IRONLOG_FILE) shows buttons r65.2's source page never does (Create account and I have
  // an account on the first page), so the standalone run leaves this section to the source run, as r57's section 4 does.
  if (run(5) && process.env.IRONLOG_FILE) console.log('note r66b section 5b compares source pages; it runs on the source build');
  else if (run(5)) {
    const R652 = 'baselines/r65-2.html';
    const PROPS = ['padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'border-top-width', 'border-top-color', 'border-radius', 'background-color', 'background-image', 'box-shadow', 'height', 'width', 'font-size', 'font-weight', 'color'];
    const STATES = [
      ['Today', "L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render();"],
      ['the first page', "L.ui.tab = 'today'; L.render();"],
      ['Log a past workout', "L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render(); L.ACT.pastOpen({ dataset: {} });"],
      ['the account sheet', "L.state.settings.onboarded = true; L.render(); L.ACT.acctOpen({ dataset: { mode: 'signup' } });"],
      ['import', "L.state.settings.onboarded = true; L.render(); L.ACT.impOpen({ dataset: {} });"],
      // Every lift on a 5 lb step of its own in both builds: r68 gives a barbell lift a 10 lb default on purpose (367),
      // which the menu's Load step button names, and this compares the buttons' look.
      ['an exercise menu', "L.state.settings.onboarded = true; for (const e of L.state.exercises) e.inc = 5 * 0.45359237; L.ui.tab = 'today'; L.render(); document.querySelector('.hero [data-act=\"startSession\"]').click(); L.ACT.bMenu({ dataset: { b: '0' } });"]
    ];
    const read = async (file, dark, code) => {
      const P = await open(file, { browser, w: 390, h: 844, dark, clock: '2026-11-02T09:00:00' });
      await P.page.evaluate(`(L => { L.state.settings.theme = '${dark ? 'dark' : 'light'}'; ${code} })(window.__ironlog)`);
      await wait(250);
      const got = await P.page.evaluate(PROPS => [...document.querySelectorAll('.btn.block, .btn.fullw')].map(e => { const cs = getComputedStyle(e); return { k: (e.dataset.act || '') + ':' + e.innerText.trim().slice(0, 30), s: PROPS.map(p => p + '=' + cs.getPropertyValue(p)).join(';') }; }), PROPS);
      await P.ctx.close();
      return got;
    };
    const off = []; let n = 0;
    for (const dark of [false, true]) for (const [name, code] of STATES) {
      const a = await read(R652, dark, code), b = await read(FILE, dark, code);
      n += b.length;
      if (a.length !== b.length) off.push({ name, dark, count: [a.length, b.length] });
      a.forEach((x, i) => { if (!b[i] || x.k !== b[i].k || x.s !== b[i].s) off.push({ name, dark, was: x, now: b[i] }); });
    }
    ok(n > 50 && !off.length, `5. all ${n} full-width buttons, light and dark, look exactly as on r65.2`, off.slice(0, 3));
  }

  // ---- 6. Retired in 2.40 (CL-3): it compared Today's main card on r65.2 and r66 as published, so it read no code of the
  // build under test; the card's look since is held by tests/r67.js section 4 (docs/ARCHIVE.md).

  // ---- 7. Pictures over time.
  if (run(7)) {
    const H = await phone(MON);
    await seed(H);
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    // A backup restored on a new phone: the note names four pictures whose bytes stayed on the old one.
    await H.ev(() => { const L = window.__ironlog; L.state.draft.ex[0].pics = ['pdead001', 'pdead002', 'pdead003', 'pdead004']; L.saveNow(); L.render(); });
    await H.page.click('#view [data-act="bNote"][data-b="0"]'); await wait(150);
    const sheet = await H.ev(() => ({ thumbs: document.querySelectorAll('#modal .pthumb').length, add: !!document.querySelector('#modal input[type="file"][data-pic="0"]') }));
    ok(sheet.thumbs === 0 && sheet.add, '7. four pictures from a restored backup, not on this phone: none shown, + Picture still offered', sheet);
    const bytes = await jpegWithSecret(H);
    if (sheet.add) await pickFile(H, '#modal input[type="file"][data-pic="0"]', 'new.jpg', 'image/jpeg', bytes);
    let d; for (let k = 0; k < 30; k++) { d = await H.draft(); if (d.ex[0].pics.some(x => !/^pdead/.test(x))) break; await wait(100); }
    const mine = d.ex[0].pics.filter(x => !/^pdead/.test(x));
    /* Every id is kept with the new one: an id this phone does not hold may name a picture another tab or phone holds
       (the review of r66 showed a tab opened earlier cutting a picture the other had just added), so none is dropped. */
    ok(d.ex[0].pics.length === 5 && mine.length === 1 && d.ex[0].pics[4] === mine[0] && ['pdead001', 'pdead002', 'pdead003', 'pdead004'].every(x => d.ex[0].pics.includes(x)), '7. the new picture is kept, and every id from the backup with it', d.ex[0].pics);
    await H.ev(() => window.__ironlog.ACT.mClose());
    // Three pictures: A stays on a saved session, B is taken off, C goes with a session deleted to Recently deleted.
    await H.ev(() => { const L = window.__ironlog; L.state.draft.ex[0].pics = []; L.state.draft.pics = []; L.render(); });
    const add = async sel => { const before = JSON.stringify(await H.draft()); await pickFile(H, sel, 'x.jpg', 'image/jpeg', bytes); for (let k = 0; k < 30 && JSON.stringify(await H.draft()) === before; k++) await wait(100); };
    await add('#view input[type="file"][data-pic="n"]');
    await add('#view input[type="file"][data-pic="n"]');
    d = await H.draft();
    const [A, B] = d.pics;
    await H.ev(b => { const L = window.__ironlog; const d = L.state.draft; d.pics = d.pics.filter(x => x !== b); const s = d.ex[0].sets[0]; s.w = 100; s.r = 8; s.done = true; L.saveNow(); L.render(); }, B);
    await H.page.click('#view [data-act="finish"]');
    for (let k = 0; k < 5; k++) { await wait(150); const q = await H.modal(); if (!q || q.kind !== 'confirm') break; await H.page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]'); }
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    // A second session the same day, with C, then deleted (it waits in Recently deleted).
    await H.go('today');
    await H.ev(() => window.__ironlog.ACT.startSession({ dataset: { day: '0' } })); await wait(150);
    await add('#view input[type="file"][data-pic="n"]');
    const C = (await H.draft()).pics[0];
    await H.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[0]; s.w = 100; s.r = 8; s.done = true; L.saveNow(); L.render(); });
    await H.page.click('#view [data-act="finish"]');
    for (let k = 0; k < 5; k++) { await wait(150); const q = await H.modal(); if (!q || q.kind !== 'confirm') break; await H.page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]'); }
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const dbg = await H.ev(c => ({ C: c, draft: !!window.__ironlog.state.draft, ss: window.__ironlog.state.sessions.map(s => [s.date, s.pics]), modal: window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind }), C);
    const s2 = await H.ev(c => window.__ironlog.state.sessions.find(s => (s.pics || []).includes(c)), C);
    if (!ok(!!s2, '7. (the second session with its picture saved)', dbg)) throw new Error('no second session');
    const sid2 = s2.id;
    await H.ev(id => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histDel({ dataset: { id } }); }, sid2); await wait(150);
    await H.ev(() => { const m = document.querySelector('#modal [data-act="mOk"]'); if (m) m.click(); }); await wait(200);
    const ids = rows => rows.map(r => r.id).sort().join();
    // The new picture from the backup case, cleared off its note above, is unnamed too (D).
    const D = mine[0];
    // The phone's clock moved on, and the tidy it runs at start run now.
    const at = async days => { await H.ev(async t => { window.__setClock(t); await window.__ironlog.picsTidy(); }, addD(MON, days) + 'T09:00:00'); await wait(100); return (await stored(H)).rows; };
    let rows = await at(20);
    ok(ids(rows) === [A, B, C, D].sort().join(), '7. after 20 days every picture is still on the phone (Undo and Recently deleted can still reach them)', { have: ids(rows) });
    rows = await at(44);
    ok(ids(rows) === [A, B, C, D].sort().join(), '7. at 44 days too', { have: ids(rows) });
    rows = await at(50);
    ok(ids(rows) === [A, C].sort().join(), '7. after 45 days unnamed, the pictures taken off are dropped; the one on a saved session and the one in Recently deleted stay', { have: ids(rows), A, B, C, D });
    rows = await at(400);
    ok(rows.some(r => r.id === A), '7. a picture the log names is never dropped, however long', { have: ids(rows) });
    // A reload reads what the tidy left: the dropped are gone, the kept still show.
    await H.page.reload(); await H.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(600);
    await H.go('history'); await H.page.click('#view [data-act="histToggle"]'); await wait(200);
    const shown = await H.ev(() => [...document.querySelectorAll('#view .pthumb img')].map(i => i.naturalWidth));
    ok(shown.length === 1 && shown[0] > 0, '7. after a reload the saved session still shows its picture', shown);
    ok(!H.P.errors.length, '7. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 8. Export CSV: no formula cells.
  if (run(8)) {
    const H = await phone(MON);
    await seed(H, { sessions: [{ id: 'c1', date: '2026-10-30', dayIdx: 0, dayId: 'D1', dayName: 'Push', routineId: 'R1', notes: '=HYPERLINK("http://x.example","click")', ex: [
      { exId: 'bench', rr: [6, 10], note: '+cmd|calc', sets: [{ w: 100, r: 8, rir: 2, warm: false, drop: false }] },
      { exId: 'assistPullup', rr: [6, 10], note: '@SUM(1+1)', sets: [{ w: -20, r: 8, rir: 2, warm: false, drop: false }] },
      { exId: 'ohp', rr: [6, 10], note: '-2+3', sets: [{ w: 40, r: 8, rir: 2, warm: false, drop: false }] }] }] });
    const csv = await H.ev(async () => { const L = window.__ironlog; let out = null; window.claude = { use: async k => (k === 'downloads' ? { save: async o => { out = o.data; } } : null) }; await L.exportCSV(); delete window.claude; return out; });
    const rows = (csv || '').split(/\r?\n/).filter(Boolean);
    const head = rows[0].split(',');
    const cells = r => { const out = []; let cur = '', q = false; for (let i = 0; i < r.length; i++) { const ch = r[i]; if (q) { if (ch === '"' && r[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    const body = rows.slice(1).map(cells);
    const col = n => head.indexOf(n);
    const formula = body.flatMap(r => r).filter(c => /^[=+\-@\t\r]/.test(c) && !/^[-+]?\d+(?:[.,]\d+)?$/.test(c));
    ok(!formula.length, '8. no cell of the export starts as a formula (=, +, -, @)', formula);
    const notes = body.map(r => [r[col('exercise_note')], r[col('session_note')]]);
    ok(notes.some(n => n[0] === "'+cmd|calc") && notes.some(n => n[0] === "'@SUM(1+1)") && notes.some(n => n[0] === "'-2+3") && notes.every(n => n[1] === '\'=HYPERLINK("http://x.example","click")'), '8. each such note is written with a \' in front', notes);
    const lw = body.find(r => r[col('exercise')] && /Assisted/.test(r[col('exercise')]));
    ok(lw && /^-\d+(\.\d+)?$/.test(lw[col(head.find(h => /^load_(lb|kg)$/.test(h)))]), '8. a negative load (the help on an assisted lift) stays a number', lw);
    // Imported back into an empty log, every note is as typed.
    await H.ev(() => { const L = window.__ironlog; L.state.sessions = []; L.invalidate(); L.saveNow(); L.render(); });
    await H.ev(t => window.__ironlog.impStart({ text: t }), csv); await wait(300);
    await H.page.click('#modal [data-act="impGo"]'); await wait(500);
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const back = await H.ev(() => { const s = window.__ironlog.state.sessions[0]; return s ? { notes: s.notes, ex: s.ex.map(b => b.note) } : null; });
    ok(back && back.notes === '=HYPERLINK("http://x.example","click")' && JSON.stringify(back.ex) === JSON.stringify(['+cmd|calc', '@SUM(1+1)', '-2+3']), '8. imported back, every note is as typed', back);
    // A note that starts with the lifter's own ' before =, +, - or @ keeps that ' through the export and back (the review of r66).
    const typed = { notes: "'@home' gym, short on time", ex: ["'+5 lb' next time", "'-1 hole' on the seat", "''=two marks", "'-5"] };
    await seed(H, { sessions: [{ id: 'c2', date: '2026-10-30', dayIdx: 0, dayId: 'D1', dayName: 'Push', routineId: 'R1', notes: typed.notes, ex: typed.ex.map((note, i) => ({ exId: ['bench', 'ohp', 'dbRow', 'bbCurl'][i], rr: [6, 10], note, sets: [{ w: 40, r: 8, rir: 2, warm: false, drop: false }] })) }] });
    const csv2 = await H.ev(async () => { const L = window.__ironlog; let out = null; window.claude = { use: async k => (k === 'downloads' ? { save: async o => { out = o.data; } } : null) }; await L.exportCSV(); delete window.claude; return out; });
    await H.ev(() => { const L = window.__ironlog; L.state.sessions = []; L.invalidate(); L.saveNow(); L.render(); });
    await H.ev(t => window.__ironlog.impStart({ text: t }), csv2); await wait(300);
    await H.page.click('#modal [data-act="impGo"]'); await wait(500);
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const back2 = await H.ev(() => { const s = window.__ironlog.state.sessions[0]; return s ? { notes: s.notes, ex: s.ex.map(b => b.note) } : null; });
    ok(back2 && JSON.stringify(back2) === JSON.stringify(typed), "8. a note starting with the lifter's own ' (before =, +, - or @, or two of them) comes back as typed", { typed, back2 });
    ok(!H.P.errors.length, '8. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 9. NEW-30: a reps target beaten by heavier sets.
  if (run(9)) {
    const CASES = [
      { name: 'leg press 1,000 x 15, 15, 14 after 990 x 12 x 3', ex: 'legPress', rr: [10, 15], step: 10, last: [990, 12], sets: [[1000, 15], [1000, 15], [1000, 14]], beat: true, line: /^Beaten: 44 reps at that load or heavier, last time 36/ },
      { name: 'leg press 990 x 13 x 3 after 990 x 12 x 3 (a guard)', ex: 'legPress', rr: [10, 15], step: 10, last: [990, 12], sets: [[990, 13], [990, 13], [990, 13]], beat: true, line: /^Beaten: 39 reps at that load, last time 36/ },
      { name: 'bench 235 x 9 x 3 after 225 x 8 x 3', ex: 'bench', rr: [6, 10], step: 5, last: [225, 8], sets: [[235, 9], [235, 9], [235, 9]], beat: true, line: /^Beaten: 27 reps at that load or heavier, last time 24/ },
      { name: 'bench 235 x 6 x 3 after 225 x 8 x 3 (heavier, fewer reps, a lower estimate)', ex: 'bench', rr: [6, 10], step: 5, last: [225, 8], sets: [[235, 6], [235, 6], [235, 6]], beat: false, line: /Heavier than target/ },
      /* Loads mixed: the next target reads only the sets at the target's load (the review of r66), so the line and the
         recap do too, as r65.2 did; counting the heavier set said Beaten while the next target repeated. */
      { name: 'leg press 1,000 x 13, then 990 x 12 twice, after 990 x 12 x 3 (loads mixed)', ex: 'legPress', rr: [10, 15], step: 10, last: [990, 12], sets: [[1000, 13], [990, 12], [990, 12]], beat: false, line: /^24 of 37 reps so far at that load$/ },
      { name: 'leg press 990 x 12 twice, then 1,000 x 13, after 990 x 12 x 3 (loads mixed)', ex: 'legPress', rr: [10, 15], step: 10, last: [990, 12], sets: [[990, 12], [990, 12], [1000, 13]], beat: false, line: /^24 of 37 reps so far at that load$/ },
      { name: 'lateral raise 25 x 16, then 20 x 15 twice, after 20 x 15 x 3 (loads mixed)', ex: 'dbLateral', rr: [12, 20], step: 5, last: [20, 15], sets: [[25, 16], [20, 15], [20, 15]], beat: false, line: /^30 of 46 reps so far at that load$/ }
    ];
    for (const c of CASES) {
      const H = await phone(MON);
      await H.ev(c => { const L = window.__ironlog; const S = L.state; const LB = 0.45359237; S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false;
        S.routines = [{ id: 'R1', name: 'M', schedule: 'weekly', days: [{ id: 'D1', name: 'Day', items: [{ uid: 'u1', exId: c.ex, sets: 3, repMin: c.rr[0], repMax: c.rr[1], rir: 2, rest: 120, inc: c.step * LB, ss: null }] }] }]; S.activeRoutineId = 'R1';
        S.sessions = ['2026-10-19', '2026-10-26'].map((date, i) => ({ id: 'h' + i, date, dayIdx: 0, dayId: 'D1', dayName: 'Day', routineId: 'R1', notes: '', ex: [{ exId: c.ex, rr: c.rr, sets: [1, 2, 3].map(() => ({ w: c.last[0] * LB, r: c.last[1], rir: 2, warm: false, drop: false })) }] }));
        L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.render(); }, c);
      await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
      const tgt0 = await H.ev(() => JSON.stringify(window.__ironlog.state.draft.ex[0].tgt));
      for (const [k, [w, r]] of c.sets.entries()) {
        await H.ev(([k, w, r]) => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[k]; s.w = w * 0.45359237; s.r = r; s.rir = 2; L.render(); }, [k, w, r]);
        await H.page.click(`#view [data-act="sDone"][data-b="0"][data-s="${k}"]`); await wait(120);
        const m = await H.modal(); if (m) await H.ev(() => window.__ironlog.ACT.mClose());
      }
      const line = await H.ev(() => { const e = document.getElementById('tp-0'); return e ? e.innerText : ''; });
      await H.page.click('#view [data-act="finish"]');
      for (let k = 0; k < 5; k++) { await wait(150); const q = await H.modal(); if (!q || q.kind !== 'confirm') break; await H.page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]'); }
      await wait(150);
      const recap = await H.ev(() => (document.getElementById('modal') || {}).innerText || '');
      const said = (recap.match(/\d+ of \d+ exercise targets? beaten/) || [''])[0];
      ok(c.line.test(line) && said === (c.beat ? '1 of 1 exercise target beaten' : '0 of 1 exercise target beaten'), `9. ${c.name}: ${c.beat ? 'beaten' : 'not beaten'}, on the screen and in the recap`, { line, said });
      // Beaten is never said of a target the next session asks again: a week on, the target has moved.
      if (c.beat) {
        await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); window.__setClock('2026-11-09T09:00:00'); L.invalidate(); L.ui.tab = 'today'; L.render(); }); await wait(150);
        await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
        const next = await H.ev(() => { const d = window.__ironlog.state.draft; return d && d.ex[0] ? JSON.stringify(d.ex[0].tgt) : null; });
        ok(next && next !== tgt0, `9. ${c.name}: and the next session's target has moved`, { today: tgt0, next });
      }
      await H.P.ctx.close();
    }
  }

  // ---- 10. 377: search finds lifts by what lifters call them.
  if (run(10)) {
    const H = await phone(MON);
    await seed(H);
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    await H.page.click('#view [data-act="pickSession"]'); await wait(200);
    const find = async q => { await H.page.fill('#pickQ', ''); await H.page.type('#pickQ', q); await wait(250); return H.ev(() => [...document.querySelectorAll('#modal [data-act="pickDo"]')].map(b => b.dataset.ex)); };
    const want = [
      ['rear delt pec deck flyes', ['reversePecDeck']], ['rear delt fly', ['reversePecDeck', 'cableRearFly', 'dbRearFly']], ['reverse fly', ['reversePecDeck']], ['peck deck', ['pecDeck', 'reversePecDeck']],
      ['bicep curl', ['bbCurl', 'hammer', 'preacher']], ['hamstring curl', ['seatedCurl', 'lyingCurl']], ['dumbbell row', ['dbRow']], ['rdl', ['rdl']], ['ohp', ['ohp']],
      ['tricep pushdown', ['pressdown']], ['chest fly', ['cableFly', 'pecDeck']], ['military press', ['ohp']], ['lunges', ['walkingLunge']]
    ];
    // The ids above are the library's own; read them from it by name so a renamed id fails loudly rather than passing.
    const ids = await H.ev(() => Object.fromEntries(window.__ironlog.state.exercises.map(e => [e.id, e.name])));
    const off = [];
    for (const [q, list] of want) {
      const got = await find(q);
      const missing = list.filter(id => !got.includes(id) && ids[id]);
      const unknown = list.filter(id => !ids[id]);
      if (missing.length || unknown.length) off.push({ q, missing, unknown, got: got.slice(0, 8) });
    }
    ok(!off.length, `10. ${want.length} searches a lifter types each find their lift`, off);
    const bench = await find('bench');
    const names = await H.ev(b => b.map(id => window.__ironlog.state.exercises.find(e => e.id === id).name), bench);
    ok(bench.length > 0 && names.every(n => /bench/i.test(n)), '10. "bench" still finds bench presses only', names);
    ok(ids.reversePecDeck === 'Reverse Pec Deck (Rear Delt Fly)', '10. the machine is named by both names', ids.reversePecDeck);
    await H.P.ctx.close();

    /* NEW-37: a log saved before r66 holds every built-in lift by name, so the library's new name has to reach it on
       load, or the lifter who asked (V, whose phone holds such a log) still cannot find the machine. A name the
       lifter gave a built-in, and a lift of their own named as the library once named the machine, stay theirs; an
       import naming the machine as before still finds it first (r65.2 did, at 1.00). */
    const O = await open('baselines/r65-2.html', { browser, clock: MON + 'T09:00:00' });
    const raw = await O.page.evaluate(() => {
      const L = window.__ironlog; const s = L.state; s.settings.onboarded = true;
      s.exercises.find(e => e.id === 'dbRearFly').name = 'My rear flyes';
      s.exercises.push({ id: 'c_rpd', name: 'Reverse Pec Deck', primary: 'rearDelts', secondary: [], equip: 'machine', bw: false, custom: true, archived: false, note: '' });
      L.saveNow(); return localStorage.getItem('ironlog.v1');
    });
    await O.ctx.close();
    const old = JSON.parse(raw);
    const N = await open(FILE, { browser, state: old, clock: MON + 'T09:00:00' });
    const by = await N.page.evaluate(() => { const L = window.__ironlog; const n = id => (L.state.exercises.find(e => e.id === id) || {}).name; return { held: null, rpd: n('reversePecDeck'), own: n('dbRearFly'), custom: n('c_rpd'), imp: L.impMatch('Reverse Pec Deck').slice(0, 2).map(x => x.id + ' ' + x.sc.toFixed(2)) }; });
    by.held = (old.exercises.find(e => e.id === 'reversePecDeck') || {}).name;
    ok(by.held === 'Reverse Pec Deck' && by.rpd === 'Reverse Pec Deck (Rear Delt Fly)', '10. a log saved by r65.2 (the machine stored as Reverse Pec Deck) reads it by its new name', by);
    ok(by.own === 'My rear flyes' && by.custom === 'Reverse Pec Deck', "10. ... a built-in the lifter named, and the lifter's own lift of the old name, keep their names", by);
    ok(/^reversePecDeck 1\.00$/.test(by.imp[0] || ''), '10. ... an import naming Reverse Pec Deck finds the machine first, as on r65.2', by.imp);
    await N.page.evaluate(() => { const L = window.__ironlog; L.ui.tab = 'today'; L.render(); });
    await N.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    await N.page.click('#view [data-act="pickSession"]'); await wait(200);
    const off2 = [];
    for (const q of ['rear delt pec deck flyes', 'rear delt fly', 'reverse fly']) {
      await N.page.fill('#pickQ', ''); await N.page.type('#pickQ', q); await wait(250);
      const got = await N.page.evaluate(() => [...document.querySelectorAll('#modal [data-act="pickDo"]')].map(b => b.dataset.ex));
      if (!got.includes('reversePecDeck')) off2.push({ q, got: got.slice(0, 6) });
    }
    ok(!off2.length, '10. ... and its picker finds the machine by "rear delt pec deck flyes", "rear delt fly" and "reverse fly"', off2);
    ok(!N.errors.length, '10. ... no page errors', N.errors);
    await N.ctx.close();
  }

  // ---- 11. A lift done twice in a row is saved as one exercise (joinAdjacent): its two notes' pictures are all kept.
  if (run(11)) {
    const H = await phone(MON);
    await seed(H);
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    // Bench twice in a row (bench, bench, overhead press), as a lifter gets by adding it again and moving it up.
    await H.ev(() => { const L = window.__ironlog; const d = L.state.draft; const b = JSON.parse(JSON.stringify(d.ex[0])); b.bid = (b.bid || 'b') + 'x2'; d.ex.splice(1, 0, b); L.saveNow(); L.render(); });
    const bytes = await jpegWithSecret(H);
    for (const bi of [0, 1]) for (let k = 0; k < 3; k++) {
      await H.ev(bi => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.bNote({ dataset: { b: String(bi) } }); }, bi); await wait(150);
      const sel = `#modal input[type="file"][data-pic="${bi}"]`;
      if (await H.page.$(sel)) await pickFile(H, sel, `IMG_${bi}${k}.jpg`, 'image/jpeg', bytes);
    }
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    let d = await H.draft();
    const held = [d.ex[0].pics || [], d.ex[1].pics || []];
    ok(held[0].length === 3 && held[1].length === 3, '11. three pictures on each bench\'s note', held.map(x => x.length));
    await H.ev(() => { const L = window.__ironlog; const LB = 0.45359237; for (const b of L.state.draft.ex.slice(0, 2)) { b.sets[0].w = 225 * LB; b.sets[0].r = 8; b.sets[0].done = true; } L.saveNow(); L.render(); });
    await H.page.click('#view [data-act="finish"]');
    for (let k = 0; k < 5; k++) { await wait(150); const q = await H.modal(); if (!q || q.kind !== 'confirm') break; await H.page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]'); }
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    const want = [...held[0], ...held[1]];
    const saved = await H.ev(() => { const s = window.__ironlog.state.sessions[0]; return s ? s.ex.filter(b => b.exId === 'bench').map(b => b.pics || []) : null; });
    ok(saved && saved.length === 1 && saved[0].length === 6 && want.every(id => saved[0].includes(id)), '11. saved as one bench, with all six pictures', { saved, want });
    await H.page.reload(); await H.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(500);
    const after = await H.ev(() => { const s = window.__ironlog.state.sessions[0]; return s ? s.ex.filter(b => b.exId === 'bench').map(b => (b.pics || []).length) : null; });
    ok(after && after[0] === 6, '11. ... and all six after a reload', after);
    ok(!H.P.errors.length, '11. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 12. Pictures and Undo, and two tabs of the app on one phone (the review of r66).
  if (run(12)) {
    const H = await phone(MON);
    await seed(H);
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    const bytes = await jpegWithSecret(H);
    // A picture under the workout's notes, taken off with its question, then put back by the toast's Undo.
    await pickFile(H, '#view input[type="file"][data-pic="n"]', 'n.jpg', 'image/jpeg', bytes);
    let d = await H.draft();
    const n0 = d.pics || [];
    ok(n0.length === 1, "12. a picture under the workout's notes", n0);
    await H.page.click('#view .pthumb[data-at="n"]'); await wait(150);
    await H.page.click('#modal [data-act="picRemove"]'); await wait(150);
    await H.page.click('#modal [data-act="mOk"]'); await wait(200);
    d = await H.draft();
    ok(!d.pics, '12. Remove picture takes it off', d.pics);
    await H.ev(() => { const b = document.querySelector('#toast button'); if (b) b.click(); }); await wait(250);
    d = await H.draft();
    const thumbs = await H.ev(() => document.querySelectorAll('#view .pthumb[data-at="n"]').length);
    ok(d.pics && d.pics.length === 1 && d.pics[0] === n0[0] && thumbs === 1, "12. Undo puts it back under the workout's notes, as the question says", { pics: d.pics, thumbs });
    // A second tab, open on the same workout before the first adds four pictures to the bench's note.
    const T = await tab(H.P, FILE);
    await wait(600);
    await H.page.bringToFront();
    await H.page.click('#view [data-act="bNote"][data-b="0"]'); await wait(150);
    for (let k = 0; k < 4; k++) await pickFile(H, '#modal input[type="file"][data-pic="0"]', `a${k}.jpg`, 'image/jpeg', bytes);
    await H.ev(() => window.__ironlog.ACT.mClose());
    const idsA = (await H.draft()).ex[0].pics || [];
    ok(idsA.length === 4, "12. four pictures on the bench's note in the first tab", idsA);
    await T.page.bringToFront(); await wait(600);
    const inB = await T.page.evaluate(() => ({ ids: (window.__ironlog.state.draft.ex[0].pics || []).length, thumbs: document.querySelectorAll('#blk-0 .pthumb').length }));
    ok(inB.ids === 4 && inB.thumbs === 4, '12. the second tab shows all four', inB);
    await T.page.click('#view [data-act="bNote"][data-b="0"]'); await wait(150);
    const roomB = await T.page.evaluate(() => !!document.querySelector('#modal input[type="file"][data-pic="0"]'));
    ok(!roomB, '12. ... and its note is full there too: no + Picture', roomB);
    await T.page.evaluate(() => window.__ironlog.ACT.mClose());
    /* A note filled by another tab in the moment before this one's photo is ready (its four kept on the phone, this tab
       not yet told): the room is counted again once the photo is prepared, and the fifth is not added. */
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.draft.ex[1].pics = undefined; L.saveNow(); L.render(); });
    await H.page.click('#view [data-act="bNote"][data-b="1"]'); await wait(150);
    const race = await H.ev(async () => {
      const L = window.__ironlog;
      const name = (await indexedDB.databases()).map(d => d.name).find(n => /-pics$/.test(n || ''));
      const db = await new Promise((res, rej) => { const r = indexedDB.open(name); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      const ids = ['pothertab01', 'pothertab02', 'pothertab03', 'pothertab04'];
      await new Promise(res => { const tx = db.transaction('pics', 'readwrite'); const st = tx.objectStore('pics'); for (const id of ids) st.put({ id, bytes: new Uint8Array([255, 216, 255, 217]).buffer, type: 'image/jpeg', w: 1, h: 1, t: Date.now(), seen: Date.now(), own: '' }); tx.oncomplete = res; tx.onerror = res; });
      db.close();
      L.state.draft.ex[1].pics = ids;
      return !!document.querySelector('#modal input[type="file"][data-pic="1"]');
    });
    ok(race, '12. (the note sheet still offers + Picture: this tab has not been told)', race);
    if (race) await pickFile(H, '#modal input[type="file"][data-pic="1"]', 'late.jpg', 'image/jpeg', bytes);
    await wait(300);
    const after = await H.ev(() => (window.__ironlog.state.draft.ex[1].pics || []).length);
    ok(after === 4 && /A note holds 4 pictures/.test(await H.toast()), '12. the note filled meanwhile takes no fifth: counted again once the photo is ready, and said', { after, toast: await H.toast() });
    ok(!T.errors.length && !H.P.errors.length, '12. no page errors in either tab', [...T.errors, ...H.P.errors]);
    await H.P.ctx.close();
  }

  // ---- 13. Pictures through a sign-out (the review of r66): the built app with the stand-in account service.
  if (run(13) && process.env.IRONLOG_FILE) console.log('note r66b section 13 builds the app with the stand-in account; it runs on the source build');
  else if (run(13)) {
    const fs = require('fs'), os = require('os'), path = require('path');
    const { start, quietHibp } = require('./fake-supabase');
    const { cspFix, build, settle } = require('./h');
    build();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r66b-'));
    fs.cpSync(path.join(__dirname, '..', 'dist'), tmp, { recursive: true });
    const fake = await start(tmp);
    const ip = path.join(tmp, 'index.html');
    fs.writeFileSync(ip, cspFix(fs.readFileSync(ip, 'utf8').replace(/"url":"https:\/\/[a-z0-9]+\.supabase\.co"/, `"url":"${fake.base}"`), fake.base));
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
    await quietHibp(ctx);
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(fake.base + '/ironlog/'); await page.waitForFunction(() => window.__ironlog && document.getElementById('obPage'), null, { timeout: 15000 });
    const H = { page, P: { errors }, ev: (f, a) => page.evaluate(f, a) };
    const synced = () => page.waitForFunction(() => { const L = window.__ironlog; return L.acctUser() && L.cloudState().on && L.cloudState().status === 'synced'; }, null, { timeout: 20000 }).then(() => true, () => false);
    await page.click('#obPage [data-act="acctOpen"][data-mode="signup"]'); await wait(100);
    await page.fill('#modal [data-abind="email"]', 'pics@example.com'); await page.fill('#modal [data-abind="pw"]', 'a good pass 9');
    await page.click('#modal [data-act="acctSubmit"]'); await wait(800);
    fake.confirm('pics@example.com');
    await page.click('#modal [data-act="acctWaitNow"]').catch(() => {}); await wait(1500);
    ok(await synced(), '13. a new account signs in and syncs');
    // A workout with a picture under its notes, finished and synced.
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.state.settings.onboarded = true; L.ACT.startFree(); if (L.ui.modal) L.ACT.mClose(); const d = L.state.draft; d.ex.push(L.newBlock('bench', { sets: 1, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 2.5 })); const b = d.ex[0]; b.sets[0].w = 100; b.sets[0].r = 8; b.sets[0].done = true; L.ui.tab = 'today'; L.saveNow(); L.render(); });
    await wait(300);
    await pickFile(H, '#view input[type="file"][data-pic="n"]', 'n.jpg', 'image/jpeg', await jpegWithSecret(H));
    const pid = await H.ev(() => (window.__ironlog.state.draft.pics || [])[0] || null);
    await page.click('#view [data-act="finish"]');
    for (let k = 0; k < 5; k++) { await wait(200); const q = await H.ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind === 'confirm' ? m.title || '' : null; }); if (q == null) break; await page.click(/sets not done/.test(q) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]'); }
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    await wait(1500); await synced();
    const saved = await H.ev(id => window.__ironlog.state.sessions.some(s => (s.pics || []).includes(id)), pid);
    ok(!!pid && saved, '13. the session is saved with its picture', { pid, saved });
    // Sign out, the phone's copy going with it (the first answer), as the question offers.
    await H.ev(() => window.__ironlog.ACT.acctSignOut()); await wait(150);
    await page.click('#modal [data-act="mOk"]'); await wait(1500);
    ok(await H.ev(() => !window.__ironlog.acctUser() && window.__ironlog.state.sessions.length === 0), '13. signed out: the log has gone from the phone');
    // Fifty days pass, the app opened now and then (its tidy runs at each start).
    await H.ev(async () => { await window.__ironlog.picsTidy(Date.now() + 20 * 864e5); await window.__ironlog.picsTidy(Date.now() + 50 * 864e5); });
    const kept = (await stored(H)).rows.some(r => r.id === pid);
    ok(kept, "13. the picture stays on the phone while its log is in the account (nothing on this phone can name it then)", { pid, rows: (await stored(H)).rows.map(r => r.id) });
    // Signing in again brings the log back, the picture with it.
    await page.click('#obPage [data-act="acctOpen"][data-mode="signin"]'); await wait(100);
    await page.fill('#modal [data-abind="email"]', 'pics@example.com'); await page.fill('#modal [data-abind="pw"]', 'a good pass 9');
    await page.click('#modal [data-act="acctSubmit"]');
    ok(await synced(), '13. signed in again');
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = 'history'; L.render(); }); await wait(300);
    await page.click('#view [data-act="histToggle"]').catch(() => {}); await wait(300);
    const back = await H.ev(id => ({ named: window.__ironlog.state.sessions.some(s => (s.pics || []).includes(id)), shown: [...document.querySelectorAll('#view .pthumb img')].filter(i => i.naturalWidth > 0).length }), pid);
    ok(back.named && back.shown === 1, '13. after signing in again History shows the picture', back);
    ok(!errors.length, '13. no page errors', errors);
    await settle(ctx.close(), 'closing the account phone');
    await settle(fake.close(), 'closing the stand-in account service');
  }

  // ---- 14. A browser whose IndexedDB refuses a Blob (as WebKit's private contexts may): the picture's bytes are kept instead.
  if (run(14)) {
    // The store refuses any row that carries a Blob, as such a browser does, and takes everything else.
    const refuse = `(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(v,...a){if(v&&typeof v==='object'&&Object.values(v).some(x=>x instanceof Blob))throw new DOMException('Error preparing Blob/File data to be stored in object store','UnknownError');return put.call(this,v,...a);};})();`;
    const H = await phone(MON, { setup: refuse });
    await seed(H);
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    const bytes = await jpegWithSecret(H);
    await pickFile(H, '#view input[type="file"][data-pic="n"]', 'n.jpg', 'image/jpeg', bytes);
    await pickFile(H, '#view input[type="file"][data-pic="n"]', 'm.jpg', 'image/jpeg', bytes);
    let d = await H.draft();
    const st = await stored(H);
    ok(d.pics && d.pics.length === 2 && st.rows.length === 2 && st.rows.every(r => r.as === 'bytes' && r.type === 'image/jpeg' && !r.secret), '14. both pictures kept, as bytes, still drawn again with nothing hidden kept', { pics: d.pics, rows: st.rows });
    const errs = await H.ev(() => window.__ironlog.logBuf.filter(x => x.a === 'pics-write').length);
    ok(errs === 1, '14. the refusal is logged once, not for every picture', errs);
    await H.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[0]; s.w = 100; s.r = 8; s.done = true; L.saveNow(); L.render(); });
    await H.page.click('#view [data-act="finish"]');
    for (let k = 0; k < 5; k++) { await wait(150); const q = await H.modal(); if (!q || q.kind !== 'confirm') break; await H.page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]'); }
    await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
    await H.page.reload(); await H.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(500);
    await H.go('history');
    await H.page.click('#view [data-act="histToggle"]'); await wait(300);
    const shown = await H.ev(() => [...document.querySelectorAll('#view .pthumb img')].map(i => i.naturalWidth));
    ok(shown.length === 2 && shown.every(w => w > 0), '14. after a reload History shows both, read back from their bytes', shown);
    // The tidy writes a row back as it was kept: as bytes, which the store takes.
    await H.ev(async () => { await window.__ironlog.picsTidy(Date.now() + 3 * 864e5); });
    const st2 = await stored(H);
    ok(st2.rows.length === 2 && st2.rows.every(r => r.as === 'bytes'), '14. the tidy writes them back as bytes', st2.rows.map(r => r.as));
    ok(!H.P.errors.length, '14. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.log('FAIL crashed:', e.stack); try { await browser.close(); } catch (x) { /* closed already */ } process.exit(1); });
