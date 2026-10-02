// r23: the header without the wordmark (week days 44 px wide), importing
// workouts from notes, spreadsheets (CSV, pasted cells, .xlsx), Strong and
// Hevy, assisted pull-ups and dips, and Today's This week / At a glance split.
const { open } = require('./h'); const { chromium } = require('playwright');
const fs = require('fs'); const os = require('os'); const path = require('path');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const LB = 0.45359237;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-imp-'));
const file = (n, t) => { const p = path.join(dir, n); fs.writeFileSync(p, t); return p; };
const STRONG = `Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-09-10 18:02:11,"Evening Workout",1h 5m,"Bench Press (Barbell)",W,95,10,0,0,"","",
2026-09-10 18:02:11,"Evening Workout",1h 5m,"Bench Press (Barbell)",1,185,8,0,0,"","",8
2026-09-10 18:02:11,"Evening Workout",1h 5m,"Bench Press (Barbell)",2,185,7,0,0,"","",9
2026-09-10 18:02:11,"Evening Workout",1h 5m,"Lat Pulldown (Cable)",1,140,10,0,0,"","",
2026-09-10 18:02:11,"Evening Workout",1h 5m,"Rest Timer",1,0,0,0,90,"","",
2026-09-10 18:02:11,"Evening Workout",1h 5m,"Running",1,0,0,3.1,1500,"","",
2026-09-10 18:02:11,"Evening Workout",1h 5m,"Plank",1,0,0,0,60,"","",
2026-09-12 07:30:00,"Legs",50m,"Squat (Barbell)",1,225,5,0,0,"","",
2026-09-12 07:30:00,"Legs",50m,"Squat (Barbell)",D,185,8,0,0,"","",
`;
const HEVY = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Upper A","14 Sep 2026, 17:29","14 Sep 2026, 18:40","","Bench Press (Barbell)",,"",0,"warmup",40,10,,,
"Upper A","14 Sep 2026, 17:29","14 Sep 2026, 18:40","","Bench Press (Barbell)",,"",1,"normal",80,8,,,8.5
"Upper A","14 Sep 2026, 17:29","14 Sep 2026, 18:40","","Bicep Curl (Dumbbell)",,"",0,"normal",14,12,,,
"Upper A","14 Sep 2026, 17:29","14 Sep 2026, 18:40","","Bicep Curl (Dumbbell)",,"",1,"failure",14,10,,,
"Upper A","14 Sep 2026, 17:29","14 Sep 2026, 18:40","","Pull Up (Assisted)",,"",0,"normal",-20,8,,,
"Upper A","14 Sep 2026, 17:29","14 Sep 2026, 18:40","","Zottman Curl Weird Thing",,"",0,"normal",10,12,,,
`;
const NOTES = `Sep 20 - Push day
Bench press 185x8, 185x7, 185x6
Incline DB press 3x10 @ 60
Lateral raises
25x15
25x12
Tricep pushdown 50 x 12 x 3

Monday 9/22
Squat 225 5x5
Pull ups 10, 8, 8
Plank 60s
Some random thought here`;
// A small .xlsx made by hand: a zip holding the sheet XML, stored without compression, plus a deflated copy of the strings.
function xlsx(rows) {
  const zlib = require('zlib');
  const strings = []; const si = v => { let i = strings.indexOf(v); if (i < 0) { strings.push(v); i = strings.length - 1; } return i; };
  const col = i => String.fromCharCode(65 + i);
  const sheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => typeof v === 'number' ? `<c r="${col(ci)}${ri + 1}"><v>${v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="s"><v>${si(v)}</v></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const sst = `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${strings.map(s => `<si><t>${s}</t></si>`).join('')}</sst>`;
  const files = [['xl/worksheets/sheet1.xml', Buffer.from(sheet), 0], ['xl/sharedStrings.xml', Buffer.from(sst), 8]];
  const locals = []; const central = []; let off = 0;
  const crc = b => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xFFFFFFFF; for (const y of b) x = t[(x ^ y) & 0xFF] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0; };
  for (const [name, raw, meth] of files) {
    const data = meth === 8 ? zlib.deflateRawSync(raw) : raw; const nb = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(meth, 8); lh.writeUInt32LE(crc(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nb.length, 26);
    locals.push(lh, nb, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(meth, 10); ch.writeUInt32LE(crc(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nb.length, 28); ch.writeUInt32LE(off, 42);
    central.push(ch, nb); off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...locals, cd, end]);
}
(async () => {
  const browser = await chromium.launch();
  const page = async (opts = {}) => { const A = await open('index.html', { browser, touch: true, clock: '2026-09-28T12:00:00', ...opts }); await A.page.evaluate(u => { const L = window.__ironlog; L.state.settings.onboarded = true; if (u) L.state.settings.unit = u; L.saveNow(); L.render(); localStorage.setItem('ironlog.v1.tipWake', '1'); }, opts.unit || null); return A; };
  const sessTxt = ev => ev(() => { const L = window.__ironlog; return L.state.sessions.filter(s => !s.demo).sort((a, b) => a.date < b.date ? -1 : 1).map(s => s.date + ' ' + s.dayName + ': ' + s.ex.map(b => L.EX(b.exId).name + ' [' + b.sets.map(x => (x.warm ? 'W' : x.drop ? 'D' : '') + Math.round(x.w * 10) / 10 + 'x' + x.r + (x.rir != null ? '@' + x.rir : '')).join(' ') + ']').join('; ')); });
  const openImp = async P => { await P.page.evaluate(() => window.__ironlog.ACT.impOpen()); await wait(120); };
  const choose = async (P, p) => { await openImp(P); await P.page.setInputFiles('#impFile', p); await wait(600); };

  // ---- Header: the wordmark is gone from the bar, the days fill it.
  for (const w of [375, 390, 430]) {
    const A = await page({ w, h: 800 });
    const hd = await A.page.evaluate(() => { const L = window.__ironlog; L.makeDemo(); L.render(); const d = [...document.querySelectorAll('#wkbar .w')].map(e => e.getBoundingClientRect()); const h1 = document.querySelector('header.top h1'); return { minW: Math.min(...d.map(r => r.width)), minH: Math.min(...d.map(r => r.height)), h1: h1 && h1.textContent, h1w: h1 && h1.getBoundingClientRect().width, sw: document.documentElement.scrollWidth }; });
    ok(hd.minW >= 44 && hd.minH >= 44 && hd.h1 === 'Ironlog' && hd.h1w <= 1 && hd.sw <= w, `${w} px: no wordmark in the bar (still named for screen readers), every day 44 px or more`, hd);
    await A.ctx.close();
  }

  // ---- Import from pasted notes.
  {
    const A = await page({ unit: 'lb' }); const ev = (f, a) => A.page.evaluate(f, a);
    await openImp(A);
    await A.page.fill('#impText', NOTES); await A.page.click('[data-act="impRead"]'); await wait(300);
    const pv = await ev(() => { const m = window.__ironlog.ui.modal; return { step: m.step, text: document.getElementById('modal').innerText.replace(/\s+/g, ' ') }; });
    ok(pv.step === 'preview' && /2 sessions/.test(pv.text) && /20 sets/.test(pv.text) && /1 line not understood/.test(pv.text), 'notes: the preview counts 2 sessions and 20 sets, and lists the line it did not understand', pv.text.slice(0, 200));
    ok(await ev(() => /Some random thought here/.test(document.getElementById('modal').innerHTML)), 'the line not understood is shown, not dropped silently');
    await A.page.click('[data-act="impGo"]'); await wait(300);
    const got = await sessTxt(ev);
    const want = ['2026-09-20 Push day: Barbell Bench Press [83.9x8 83.9x7 83.9x6]; Incline DB Press [27.2x10 27.2x10 27.2x10]; DB Lateral Raise [11.3x15 11.3x12]; Triceps Pressdown [22.7x12 22.7x12 22.7x12]',
      '2026-09-22 Imported: Barbell Back Squat [102.1x5 102.1x5 102.1x5 102.1x5 102.1x5]; Pull-up [0x10 0x8 0x8]; Plank [0x60]'];
    ok(JSON.stringify(got) === JSON.stringify(want), 'notes: every exercise, set, date and unit as written (185x8, 3x10 @ 60, sets on the next lines, 50 x 12 x 3, 225 5x5, bodyweight, seconds)', got);
    ok(await ev(() => window.__ironlog.ui.tab === 'history' && /Imported 2 sessions/.test(document.getElementById('toast').innerText) && !!document.querySelector('#toast button')), 'after importing: History, with an Undo');
    ok(await ev(() => window.__ironlog.state.sessions.every(s => s.free === true)), 'imported sessions are freestyle, so a routine\'s next up does not move');
    // The same paste again adds nothing.
    await openImp(A); await A.page.fill('#impText', NOTES); await A.page.click('[data-act="impRead"]'); await wait(300);
    ok(/already in your log, skipped/.test(await ev(() => document.getElementById('modal').innerText)) && await ev(() => document.querySelector('#modal [data-act="impGo"]').disabled), 'importing the same log twice: everything is skipped as already there');
    await A.page.click('#modal [data-act="mClose"]'); await wait(100);
    await ev(() => window.__ironlog.ACT.undo()); await wait(200);
    ok(await ev(() => window.__ironlog.state.sessions.length === 0), 'Undo removes the whole import');
    ok(!A.errors.length, 'no console errors (notes)', A.errors);
    await A.ctx.close();
  }

  // ---- Strong CSV, comma and semicolon: set types, RPE, rest timers and cardio.
  for (const [nm, text] of [['strong.csv', STRONG], ['strong-semicolon.csv', STRONG.replace(/,/g, ';')]]) {
    const A = await page({ unit: 'kg' }); const ev = (f, a) => A.page.evaluate(f, a);
    await choose(A, file(nm, text));
    const m = await ev(() => { const m = window.__ironlog.ui.modal; return { step: m.step, known: m.unitKnown, skipped: m.res.skipped, cardio: m.res.cardio, t: document.getElementById('modal').innerText.replace(/\s+/g, ' ') }; });
    ok(m.step === 'preview' && !m.known && /does not say which; check this/.test(m.t) && m.skipped === 1 && m.cardio === 1, `${nm}: preview asks the unit (Strong does not write it), leaves out the rest timer and the run`, m);
    await A.page.click('[data-act="impUnit"][data-v="lb"]'); await wait(80); await A.page.click('[data-act="impGo"]'); await wait(300);
    const got = await sessTxt(ev);
    ok(JSON.stringify(got) === JSON.stringify(['2026-09-10 Evening Workout: Barbell Bench Press [W43.1x10 83.9x8@2 83.9x7@1]; Lat Pulldown [63.5x10]; Plank [0x60]', '2026-09-12 Legs: Barbell Back Squat [102.1x5 D83.9x8]']),
      `${nm}: warm-up and drop sets marked, set numbers not read as types, RPE 8 read as RIR 2, lb converted`, got);
    await A.ctx.close();
  }

  // ---- Hevy CSV: kg column, set types, failure, RPE, assisted pull-up, a new exercise.
  {
    const A = await page({ unit: 'lb' }); const ev = (f, a) => A.page.evaluate(f, a);
    await choose(A, file('hevy.csv', HEVY));
    const m = await ev(() => { const m = window.__ironlog.ui.modal; return { unit: m.unit, known: m.unitKnown, pick: m.pick }; });
    ok(m.unit === 'kg' && m.known && m.pick['Pull Up (Assisted)'] === 'assistPullup' && m.pick['Zottman Curl Weird Thing'] === 'new', 'Hevy: the kg column is read; the assisted pull-up is matched; an unknown name becomes a new exercise', m);
    await A.page.selectOption('#modal [data-impmus="Zottman Curl Weird Thing"]', 'forearms'); await wait(80);
    await A.page.click('[data-act="impGo"]'); await wait(300);
    const got = await sessTxt(ev);
    ok(got[0] === '2026-09-14 Upper A: Barbell Bench Press [W40x10 80x8@1.5]; DB Curl [14x12 14x10@0]; Assisted Pull-up (machine) [-20x8]; Zottman Curl Weird Thing [10x12]', 'Hevy: warm-up, failure as RIR 0, RPE 8.5 as RIR 1.5, the machine help kept as help', got);
    ok(await ev(() => { const e = window.__ironlog.state.exercises.find(x => x.name === 'Zottman Curl Weird Thing'); return e && e.custom && e.primary === 'forearms'; }), 'the new exercise is created with the muscle chosen in the preview');
    await A.ctx.close();
  }

  // ---- A hand-made sheet: a date written once, a Sets column, kg in the header; and an .xlsx file.
  {
    const A = await page({ unit: 'lb' }); const ev = (f, a) => A.page.evaluate(f, a);
    await choose(A, file('sheet.csv', 'Date,Exercise,Weight (kg),Reps,Sets\n9/15/2026,Leg Press,180,10,3\n,Leg Extension,50,12,3\n9/17/2026,Deadlift,140,5,1\n'));
    await A.page.click('[data-act="impGo"]'); await wait(300);
    ok(JSON.stringify(await sessTxt(ev)) === JSON.stringify(['2026-09-15 Imported: Leg Press [180x10 180x10 180x10]; Leg Extension [50x12 50x12 50x12]', '2026-09-17 Imported: Conventional Deadlift [140x5]']), 'a sheet: the date carries down, Sets repeats the row, kg read from the header', await sessTxt(ev));
    await choose(A, file('log.xlsx', xlsx([['Date', 'Exercise', 'Weight', 'Reps'], [46270, 'Bench Press', 200, 5], [46270, 'Bench Press', 200, 4], ['9/6/2026', 'Pull ups', 0, 12]])));
    const m = await ev(() => { const m = window.__ironlog.ui.modal; return m && m.step; });
    await A.page.click('[data-act="impGo"]'); await wait(300);
    const got = await sessTxt(ev);
    ok(m === 'preview' && got.includes('2026-09-05 Imported: Barbell Bench Press [90.7x5 90.7x4]') && got.includes('2026-09-06 Imported: Pull-up [0x12]'), 'an .xlsx file: dates stored as spreadsheet day numbers and as text both read', got);
    // Cells copied from a spreadsheet and pasted (tabs), with column names the importer does not know: it asks which is which.
    await openImp(A); await A.page.fill('#impText', 'When\tWhat\tLbs\tCount\n9/1/2026\tLeg Press\t400\t10\n'); await A.page.click('[data-act="impRead"]'); await wait(300);
    ok(await ev(() => window.__ironlog.ui.modal.res.needMap && !!document.querySelector('#modal [data-mapf="ex"]')), 'pasted cells with unknown column names: it asks which column is which');
    for (const [f, i] of [['date', '0'], ['ex', '1'], ['w', '2'], ['r', '3']]) await A.page.selectOption(`#modal [data-mapf="${f}"]`, i);
    await A.page.click('[data-act="impMapDone"]'); await wait(200);
    await A.page.click('[data-act="impGo"]'); await wait(300);
    ok((await sessTxt(ev)).some(s => s === '2026-09-01 Imported: Leg Press [181.4x10]'), 'and imports once the columns are chosen');
    ok(!A.errors.length, 'no console errors (sheets)', A.errors);
    await A.ctx.close();
  }

  // ---- Found in review: each case that read wrong before.
  {
    const A = await page({ unit: 'lb' }); const ev = (f, a) => A.page.evaluate(f, a);
    // Bare 3x10 on a bodyweight lift; reps on a line of their own; a date line after them; the preview lists what was read.
    await openImp(A); await A.page.fill('#impText', 'Sep 21\nPull ups 3x10\nBench 185x8\n10/8/7\n9/22\nSquat 225x5\nCurls 82,5x8'); await A.page.click('[data-act="impRead"]'); await wait(300);
    const read = await ev(() => { const d = document.getElementById('impRead'); d.open = true; return d.innerText.replace(/\s+/g, ' '); });
    ok(/Pull-up: BW×10, BW×10, BW×10/.test(read), 'bodyweight "3x10" is 3 sets of 10, and the preview lists what was read', read);
    ok(/Barbell Bench Press: 185×8, 185×10, 185×8, 185×7/.test(read) && /Sep 22/.test(read) && /Barbell Back Squat: 225×5/.test(read), 'reps on their own line (10/8/7) continue the lift at its load; the date line after them still starts a day', read);
    ok(/82\.5×8/.test(read), 'a comma decimal (82,5x8) reads as 82.5', read);
    await A.page.click('#modal [data-act="mClose"]'); await wait(80);
    const tbl = async (nm, text) => { await choose(A, file(nm, text)); return ev(() => { const m = window.__ironlog.ui.modal; return { need: !!m.res.needMap, map: m.tab && m.tab.map, step: m.step }; }); };
    let t = await tbl('kgs.csv', 'Date,Exercise,Weight (kgs),Reps\n2026-09-01,Leg Press,180,10\n');
    ok(!t.need && await ev(() => window.__ironlog.ui.modal.unit === 'kg'), '"Weight (kgs)" is the weight column, in kg');
    await A.page.click('#modal [data-act="mClose"]');
    t = await tbl('odd.csv', 'Date,Exercise,Poundage,Reps\n2026-09-01,Leg Press,400,10\n');
    ok(t.need, 'a weight column it cannot name: it asks instead of importing loads of 0');
    await A.page.click('#modal [data-act="mClose"]');
    t = await tbl('dayanddate.csv', 'Day,Date,Exercise,Weight,Reps\nPush,2024-01-15T08:05:00Z,Bench Press,185,5\n');
    await A.page.click('[data-act="impGo"]'); await wait(300);
    ok((await sessTxt(ev)).some(x => x.startsWith('2024-01-15')), 'Date wins over Day, and an ISO timestamp with T reads', await sessTxt(ev));
    // Strong's rest timer in the Set Order column; a seconds-only row on a lift that counts reps.
    await choose(A, file('strong2.csv', 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE\n2026-09-02 10:00:00,"W",1h,"Bench Press (Barbell)",1,185,5,0,0,"","",\n2026-09-02 10:00:00,"W",1h,"Bench Press (Barbell)",Rest Timer,0,0,0,120,"","",\n2026-09-02 10:00:00,"W",1h,"Bench Press (Barbell)",2,0,0,0,45,"","",\n'));
    const s2 = await ev(() => { const m = window.__ironlog.ui.modal; return { skipped: m.res.skipped, t: document.getElementById('modal').innerText }; });
    ok(s2.skipped === 1 && /1 timed set was left out/.test(s2.t), 'Strong: a rest timer in Set Order is skipped; seconds on a rep lift are left out and said', s2.skipped);
    await A.page.click('[data-act="impUnit"][data-v="lb"]'); await A.page.click('[data-act="impGo"]'); await wait(300);
    ok((await sessTxt(ev)).some(x => x === '2026-09-02 W: Barbell Bench Press [83.9x5]'), 'only the real set is imported', await sessTxt(ev));
    // Ironlog's own CSV export imports back, and into the same log adds nothing.
    const csv = await ev(() => { const L = window.__ironlog; let out = null; const orig = URL.createObjectURL; const B = window.Blob; window.Blob = function (parts, o) { out = parts.join(''); return new B(parts, o); }; try { L.ACT.exportCsv(); } catch (e) { } window.Blob = B; return out; });
    if (csv) {
      await choose(A, file('ironlog.csv', csv));
      const m3 = await ev(() => { const m = window.__ironlog.ui.modal; return { need: !!(m.res && m.res.needMap), t: document.getElementById('modal').innerText.replace(/\s+/g, ' ') }; });
      ok(!m3.need && /already in your log, skipped/.test(m3.t), 'Ironlog\'s own CSV reads back, and into the same log it is all skipped as already there', m3.t.slice(0, 160));
      await A.page.click('#modal [data-act="mClose"]');
    } else ok(false, 'CSV export captured for the round trip');
    ok(!A.errors.length, 'no console errors (review cases)', A.errors);
    await A.ctx.close();
  }

  // ---- Entry points, and a backup file still restores the whole log.
  {
    const A = await page(); const ev = (f, a) => A.page.evaluate(f, a);
    ok(await ev(() => { const L = window.__ironlog; L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); return !!document.querySelector('#view [data-act="impOpen"]') && /replaces everything/.test(document.getElementById('view').innerText); }), 'Settings: Import workouts, and Restore a backup says it replaces everything');
    ok(await ev(() => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); return !!document.querySelector('#view [data-act="impOpen"]'); }), 'History offers Import workouts');
    const bk = await ev(() => { const s = JSON.parse(JSON.stringify(window.__ironlog.state)); s.sessions = [{ id: 'bk1', date: '2026-09-20', dayIdx: 0, dayId: null, dayName: 'X', routineId: '', notes: '', ex: [{ exId: 'bench', sets: [{ w: 100, r: 5, rir: 1, warm: false, drop: false }] }] }]; return JSON.stringify({ app: 'ironlog', state: s }); });
    await choose(A, file('backup.json', bk));
    ok(/Replace all data/.test(await ev(() => document.getElementById('modal').innerText)), 'a backup chosen in the import sheet asks before replacing everything');
    await A.ctx.close();
  }

  // ---- Second review: a load then its reps, a bare 3x10 on a weighted lift, assisted names, the editor the other way.
  {
    const A = await page({ unit: 'lb' }); const ev = (f, a) => A.page.evaluate(f, a);
    const lbTxt = () => ev(() => { const L = window.__ironlog; return L.state.sessions.filter(s => !s.demo).sort((a, b) => a.date < b.date ? -1 : 1).map(s => s.date + ': ' + s.ex.map(b => L.EX(b.exId).name + ' [' + b.sets.map(x => Math.round(x.w / 0.45359237) + 'x' + x.r).join(' ') + ']').join('; ')); });
    const paste = async t => { await openImp(A); await A.page.fill('#impText', t); await A.page.click('[data-act="impRead"]'); await wait(300); return ev(() => document.getElementById('modal').innerText.replace(/\s+/g, ' ')); };
    let pv = await paste('Sep 20\nBench press 185\n10/10/10\nCurl 30\n12/10\nLeg press 270: 12/10/10\nSquat 225x5\nPull ups\n10/10/10\nDips\n12,10');
    ok(/1 session/.test(pv) && !/not understood/.test(pv), 'a load then a line of reps (10/10/10, 12/10) is reps, not a date; "270: 12/10/10" is three sets', pv.slice(0, 160));
    await A.page.click('[data-act="impGo"]'); await wait(300);
    let got = await lbTxt();
    ok(JSON.stringify(got) === JSON.stringify(['2026-09-20: Barbell Bench Press [185x10 185x10 185x10]; DB Curl [30x12 30x10]; Leg Press [270x12 270x10 270x10]; Barbell Back Squat [225x5]; Pull-up [0x10 0x10 0x10]; Dips (chest lean) [0x12 0x10]']), 'every lift on Sep 20 with its load and reps', got);
    await ev(() => { const L = window.__ironlog; L.state.sessions = []; L.saveNow(); L.invalidate(); });
    pv = await paste('Sep 21\nLateral raises 3x15\nRow 135x8\n3x10\nPull ups 3x8');
    ok(/Not imported, no weight given: Lateral raises\b/.test(pv) && /3x10 @ 60/.test(pv), 'a bare 3x15 on a weighted lift is not read as 3 lb: it is named and the fix is shown', pv);
    await A.page.click('[data-act="impGo"]'); await wait(300);
    got = await lbTxt();
    ok(JSON.stringify(got) === JSON.stringify(['2026-09-21: Barbell Row [135x8 135x10 135x10 135x10]; Pull-up [0x8 0x8 0x8]']), 'a bare 3x10 under a loaded line is 3 sets at that load; on a bodyweight lift it is sets of reps', got);
    await ev(() => { const L = window.__ironlog; L.state.sessions = []; L.saveNow(); L.invalidate(); });
    pv = await paste('Date,Exercise,Weight,Reps\n2026-09-22,Chin Up (Assisted),-40,8\n2026-09-22,Triceps Dip (Assisted),30,10\n2026-09-22,Pull-up,-20,8');
    await A.page.click('[data-act="impGo"]'); await wait(300);
    got = await lbTxt();
    ok(JSON.stringify(got) === JSON.stringify(['2026-09-22: Assisted Pull-up (machine) [-40x8 -20x8]; Assisted Dip (machine) [-30x10]']), 'assisted names and a minus weight on a pull-up all land on the assisted machines as help', got);
    // The editor: a pull-up with added-weight sets is not turned into an assisted one.
    await ev(LB => { const L = window.__ironlog; L.state.sessions.push({ id: 'pw', date: '2026-09-15', dayIdx: 0, dayId: null, dayName: 'X', routineId: '', free: true, notes: '', ex: [{ exId: 'pullup', sets: [{ w: 25 * LB, r: 8, rir: 1, warm: false, drop: false }] }] }); L.saveNow(); L.invalidate(); L.ACT.exEdit({ dataset: { ex: 'pullup' } }); }, LB); await wait(150);
    await A.page.check('#modal [data-ebind="assist"]'); await wait(80);
    await ev(() => document.querySelector('#modal [data-act="exSave"]').click()); await wait(200);
    ok(await ev(() => !window.__ironlog.EX('pullup').assist && /added weight/.test(document.getElementById('toast').innerText)), 'turning Assisted on for a lift with added-weight sets is refused, and it says why');
    const mid = await ev(LB => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'bw2', date: '2026-09-01', kg: 180 * LB }); L.state.sessions.push({ id: 'am', date: '2026-09-16', dayIdx: 0, dayId: null, dayName: 'X', routineId: '', free: true, notes: '', ex: [{ exId: 'assistPullup', sets: [10, 10, 9].map(r => ({ w: -60 * LB, r, rir: 1, warm: false, drop: false })) }] }); L.invalidate(); return L.suggest('assistPullup', { sets: 3, repMin: 8, repMax: 12, rir: 1, inc: 5 * LB }).text; }, LB);
    ok(/take some help off\.$/.test(mid) && !/add load/.test(mid), 'assisted, mid-range: the target says to take help off, not add load', mid);
    const bh = await ev(() => { const d = document.createElement('div'); d.innerHTML = window.__ironlog.bestsBoard().html; const t = [...d.querySelectorAll('details')].find(x => /Assisted Pull-up/.test(x.textContent)); return t ? t.querySelector('th').textContent + ' / ' + t.querySelector('td').textContent : null; });
    ok(/^Load \/ BW−\d+$/.test(bh || ''), 'All-time bests: an assisted lift is headed Load, its rows read BW−x', bh);
    ok(!A.errors.length, 'no console errors (second review)', A.errors);
    await A.ctx.close();
  }

  // ---- Assisted pull-up: type the help, progress is less help, deload is more.
  {
    const A = await page({ unit: 'lb' }); const ev = (f, a) => A.page.evaluate(f, a);
    await ev(LB => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'b1', date: '2026-09-01', kg: 180 * LB });
      const add = (id, d, w, rs) => L.state.sessions.push({ id, date: d, dayIdx: 0, dayId: null, dayName: 'X', routineId: '', free: true, notes: '', ex: [{ exId: 'assistPullup', sets: rs.map(r => ({ w: -w * LB, r, rir: 1, warm: false, drop: false })) }] });
      add('a1', '2026-09-10', 60, [10, 10, 10]); add('a2', '2026-09-17', 60, [12, 12, 12]); L.saveNow(); L.invalidate(); L.render(); }, LB);
    const sg = await ev(LB => { const L = window.__ironlog; const p = { sets: 3, repMin: 8, repMax: 12, rir: 1, inc: 5 * LB }; const g = L.suggest('assistPullup', p), d = L.suggest('assistPullup', p, { deload: true }); return { w: Math.round(g.w / LB), t: g.text, dw: Math.round(d.w / LB) }; }, LB);
    ok(sg.w === -55 && /take 5 lb of help off/.test(sg.t) && /BW−60×12/.test(sg.t), 'every set at the top of the range: 5 lb less help next time, written as BW−60', sg);
    ok(sg.dw === -75, 'deload: 90% of 120 lb lifted is 108, so 72 lb of help, rounded up to 75', sg.dw);
    await ev(() => { const L = window.__ironlog; L.state.draft = { id: 'd1', startedAt: Date.now(), date: '2026-09-28', dayIdx: 0, dayId: null, dayName: 'Free', routineId: '', free: true, deload: false, light: false, cardio: [], notes: '', editingId: null, ex: [L.newBlock('assistPullup', { sets: 3, repMin: 8, repMax: 12, rir: 1, rest: 90, inc: 5 * 0.45359237 })] }; L.ui.tab = 'today'; L.render(); });
    const row = await ev(() => { const f = document.querySelector('.sg input[data-f="w"][data-b="0"][data-s="0"]'); return { v: f.value, ph: f.placeholder, head: document.getElementById('blk-0').innerText }; });
    // Grey until typed since r25: the suggested help shows as the field's grey number.
    ok(row.v === '' && row.ph === '55' && /HELP LB/i.test(row.head) && /machine help/.test(row.head), 'in a session: the load field shows the help (55) in grey, headed Help lb', row);
    await A.page.fill('.sg input[data-f="w"][data-b="0"][data-s="0"]', '50'); await A.page.dispatchEvent('.sg input[data-f="w"][data-b="0"][data-s="0"]', 'input');
    ok(await ev(LB => Math.round(window.__ironlog.state.draft.ex[0].sets[0].w / LB) === -50, LB), 'typing 50 stores bodyweight minus 50');
    // Typing -20 means 20 of help; Type or dictate sets reads numbers as help too.
    await A.page.fill('.sg input[data-f="w"][data-b="0"][data-s="1"]', '-20'); await A.page.dispatchEvent('.sg input[data-f="w"][data-b="0"][data-s="1"]', 'input');
    ok(await ev(LB => Math.round(window.__ironlog.state.draft.ex[0].sets[1].w / LB) === -20, LB), 'typing -20 stores 20 of help, not 0');
    await ev(() => window.__ironlog.ACT.bQuick({ dataset: { b: '0' } })); await wait(100);
    await A.page.fill('#qTxt', '45x8'); await ev(() => window.__ironlog.ACT.qFill()); await wait(200);
    ok(await ev(LB => window.__ironlog.state.draft.ex[0].sets.some(q => q.done && Math.round(q.w / LB) === -45 && q.r === 8), LB), 'Type or dictate sets: "45x8" is 45 of help');
    // Without a logged bodyweight: a deload still adds help, and weight lifted is never below 0.
    const nb = await ev(LB => { const L = window.__ironlog; const keep = L.state.bodyweights; L.state.bodyweights = []; L.invalidate(); const d = L.suggest('assistPullup', { sets: 3, repMin: 8, repMax: 12, rir: 1, inc: 5 * LB }, { deload: true }); const t = L.tonnage(L.EX('assistPullup'), { w: -40 * LB, r: 8 }, '2026-09-20'); L.state.bodyweights = keep; L.invalidate(); return { dw: Math.round(d.w / LB), t }; }, LB);
    ok(nb.dw === -70 && nb.t === 0, 'no bodyweight logged: deload is 10% more help (60 to 70), weight lifted is 0 not negative', nb);
    // The editor keeps an exercise with helped sets assisted.
    await ev(() => { const L = window.__ironlog; L.ACT.exEdit({ dataset: { ex: 'assistPullup' } }); }); await wait(150);
    await A.page.uncheck('#modal [data-ebind="assist"]'); await wait(80);
    await ev(() => document.querySelector('#modal [data-act="exSave"]').click()); await wait(200);
    ok(await ev(() => window.__ironlog.EX('assistPullup').assist === true && /stays assisted/.test(document.getElementById('toast').innerText)), 'turning Assisted off with helped sets logged is refused, and it says why');
    // The flag survives a reload, only on bodyweight exercises.
    const n = await ev(() => { const L = window.__ironlog; const x = L.normalize({ exercises: [{ id: 'c1', name: 'A', primary: 'lats', bw: true, assist: true }, { id: 'c2', name: 'B', primary: 'lats', bw: false, assist: true }] }); return [x.exercises.find(e => e.id === 'c1').assist, x.exercises.find(e => e.id === 'c2').assist]; });
    ok(n[0] === true && n[1] === undefined, 'assisted is kept only on a bodyweight exercise', n);
    ok(!A.errors.length, 'no console errors (assisted)', A.errors);
    await A.ctx.close();
  }

  // ---- Today: This week owns this week, At a glance the longer view (item 32).
  {
    const A = await page({ clock: '2026-09-24T18:00:00' }); const ev = (f, a) => A.page.evaluate(f, a);
    const t = await ev(() => { const L = window.__ironlog; L.makeDemo(); L.ui.tab = 'today'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      const wk = document.querySelector('[data-mkey="week"]'), gl = document.querySelector('[data-mkey="tiles"]');
      return { sub: wk.querySelector('.sec-s').textContent, week: wk.innerText.replace(/\s+/g, ' '), tiles: gl.querySelectorAll('.tile').length, glance: gl.innerText.replace(/\s+/g, ' '), prTile: gl.querySelector('[data-sec="bests"]') ? 1 : 0 }; });
    ok(/sessions$/.test(t.sub) && !/sets/.test(t.sub), 'This week header: sessions only (the sets are in the card once)', t.sub);
    ok(/hard sets logged of \d+ planned/.test(t.week) && /lifted/.test(t.week) && /vs last week/.test(t.week), 'This week: hard sets against planned, and weight lifted against last week', t.week);
    ok(t.tiles === 2 && !/lifted this week/.test(t.glance) && t.prTile, 'At a glance: the streak and PRs; weight lifted moved out', t);
    await A.page.click('[data-mkey="tiles"] [data-sec="bests"]'); await wait(300);
    ok(await ev(() => window.__ironlog.ui.tab === 'dash' && document.getElementById('sub-bests') && document.getElementById('sub-bests').open), 'the PR tile opens All-time bests');
    ok(await ev(() => { const b = document.querySelector('.wklift'); return !b || b.getBoundingClientRect().height >= 44; }), 'the weight-lifted line is a 44 px tap target');
    await A.ctx.close();
  }
  console.log(fails.length ? `FAILURES ${fails.length}` : 'ALL PASS');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crashed', e && e.stack || e); process.exit(1); });
