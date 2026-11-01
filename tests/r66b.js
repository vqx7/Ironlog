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

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.log('FAIL crashed:', e.stack); try { await browser.close(); } catch (x) { /* closed already */ } process.exit(1); });
