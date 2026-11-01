// r66, the session screen (V's list of 2026-11-01, PENDING 372 to 376 and 368),
// each section failing on r65.2 (`node tests/r66b.js baselines/r65-2.html`)
// unless it says it is a guard. `R66B=1,3` runs some sections.
//   1  pictures on notes (373): added from an exercise's note and under the
//      workout's notes, drawn again as a JPEG on the phone (what a file hid,
//      a camera's location among it, is gone), SVG refused, saved with the
//      session by Finish, shown in History after a reload, taken off with a
//      question and put back by Undo; Discard asks when only a picture was
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
//   6  (a guard) Today's main card, light and dark in every accent, looks
//      exactly as on r65.2: 371's steel edge was tried and taken out of r66
//      on V's word (2026-11-01).
//   7  pictures over time (373): a note whose four ids came from a backup
//      restored (no bytes on this phone) shows nothing, still offers
//      + Picture, and keeps the new one; the bytes of a picture taken off are
//      dropped once it has gone unnamed 45 days, while one the log still
//      names, and one on a session in Recently deleted, are kept.
const { open, engine } = require('./h');
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
  const setup = async ctx => { await ctx.addInitScript(`(()=>{const R=Date;let off=new R(${JSON.stringify(start + 'T09:00:00')}).getTime()-R.now();window.__setClock=t=>{off=new R(t).getTime()-R.now();};class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`); };
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
  for (const r of rows) {
    const t = new TextDecoder('latin1').decode(new Uint8Array(await r.blob.arrayBuffer()));
    out.push({ id: r.id, type: r.blob.type, size: r.blob.size, w: r.w, h: r.h, secret: t.includes(secret) });
  }
  db.close();
  return { name, rows: out };
}, SECRET);

(async () => {
  browser = await engine.launch();

  if (run(1)) {
    const H = await phone(MON);
    await seed(H);
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
    ok(d.ex[0].pics && d.ex[0].pics.length === 1, '1. the picture is on the bench\'s note at once', d.ex[0].pics);
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
    ok(d.ex[0].pics.length === 1 && /Only photos/.test(await H.toast()), '1. an SVG is refused with a reason, nothing added', { pics: d.ex[0].pics, toast: await H.toast() });
    // A file that only says it is an image is refused when it cannot be read as one.
    if (await H.page.$(fileSel)) await pickFile(H, fileSel, 'fake.jpg', 'image/jpeg', Buffer.from('MZ this is not a photo'));
    d = await H.draft();
    ok(d.ex[0].pics.length === 1 && /could not be read/.test(await H.toast()), '1. a file that is not a photo is refused', { pics: d.ex[0].pics, toast: await H.toast() });
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
    await H.ev(() => { const L = window.__ironlog; L.ACT.discard(); }); await wait(150);
    await H.ev(() => { const m = document.querySelector('#modal [data-act="mOk"]'); if (m) m.click(); }); await wait(150);
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

  // ---- 5b. Every full-width button looks as it did on r65.2 (read beside r65.2 itself).
  if (run(5)) {
    const R652 = 'baselines/r65-2.html';
    const PROPS = ['padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'border-top-width', 'border-top-color', 'border-radius', 'background-color', 'background-image', 'box-shadow', 'height', 'width', 'font-size', 'font-weight', 'color'];
    const STATES = [
      ['Today', "L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render();"],
      ['the first page', "L.ui.tab = 'today'; L.render();"],
      ['Log a past workout', "L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render(); L.ACT.pastOpen({ dataset: {} });"],
      ['the account sheet', "L.state.settings.onboarded = true; L.render(); L.ACT.acctOpen({ dataset: { mode: 'signup' } });"],
      ['import', "L.state.settings.onboarded = true; L.render(); L.ACT.impOpen({ dataset: {} });"],
      ['an exercise menu', "L.state.settings.onboarded = true; L.ui.tab = 'today'; L.render(); document.querySelector('.hero [data-act=\"startSession\"]').click(); L.ACT.bMenu({ dataset: { b: '0' } });"]
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

  // ---- 6. Today's main card looks exactly as on r65.2 (a guard: 371's steel edge was taken out of r66 on V's word, 2026-11-01).
  if (run(6)) {
    const PROPS = ['background-image', 'background-color', 'box-shadow', 'border-top-width', 'border-top-left-radius', 'padding-top', 'margin-top', 'color', 'width', 'height'];
    const look = async (file, theme, accent) => {
      const P = await open(file, { browser, w: 390, h: 844, dark: theme === 'dark', clock: '2026-11-02T09:00:00' });
      const r = await P.page.evaluate(([t, a, PROPS]) => {
        const L = window.__ironlog; L.state.settings.onboarded = true; L.state.settings.theme = t; L.state.settings.accent = a; L.ui.tab = 'today'; L.render();
        const h = document.querySelector('.hero'); const cs = getComputedStyle(h);
        return PROPS.map(p => p + '=' + cs.getPropertyValue(p)).join(';') + ';before=' + getComputedStyle(h, '::before').content + ';after=' + getComputedStyle(h, '::after').content;
      }, [theme, accent, PROPS]);
      await P.ctx.close();
      return r;
    };
    const off = [];
    for (const theme of ['light', 'dark']) for (const a of ['ember', 'blue', 'volt', 'pink', 'violet', 'cyan', 'red']) {
      const was = await look('baselines/r65-2.html', theme, a), now = await look(FILE, theme, a);
      if (was !== now) off.push({ theme, a, was, now });
    }
    ok(!off.length, '6. Today\'s main card, light and dark in all 7 accents, looks exactly as on r65.2 (no edge added)', off.slice(0, 2));
  }

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
    ok(d.ex[0].pics.length === 4 && mine.length === 1 && d.ex[0].pics[3] === mine[0], '7. the new picture is kept (the oldest unseen id makes room), never the one cut', d.ex[0].pics);
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

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.log('FAIL crashed:', e.stack); try { await browser.close(); } catch (x) { /* closed already */ } process.exit(1); });
