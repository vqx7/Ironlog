// r63: the actions, the events, import and the account flow moved into typed
// modules and the legacy script deleted (PENDING 358). Run on r62 (`node
// tests/r63.js baselines/r62.html`, R63_ONLY=n for one section):
//   1  (a guard, the source build) every sheet and part of the page r63
//      moves (the menu, the account sheet in each of its pages, a problem
//      report and its inbox, import, the Guide, the toast, the rest timer's
//      bar, the menu button and the crash screen), opened as the app opens
//      it, in the states a lifter meets it in, has the same elements,
//      attributes, field values and visible text as r62's
//      (baselines/r62.html).
//   2  (a guard, the source build) the import reader, the backup check and
//      the demo, moved from the legacy script into src/app/ (importing.ts,
//      importflow.ts, demo.ts, worksets.ts), give r62's answers call for
//      call on R63_N generated notes and tables (300 by default), with the
//      same random numbers and the same clock in both pages, so even the
//      ids they make are the same: notes read (impFromText), names matched
//      (impMatch), typed sets read (parseSets, every unit, RPE and kind of
//      lift), a notes exercise's sets read as each kind of lift
//      (impTextSets), each preview built in both units (impBuild), the
//      import confirmed on a first run (the routine made from it, the
//      targets fitted), a backup restored, and the demo made from every
//      ready-made routine.
//   3  the time limits and the report's key (PENDING 306 and 309), each
//      failing on r62: a problem report whose send never answers leaves
//      Sending after the sync's limit (20 s) with words that say so, its
//      text kept; the same report sent again carries the same key; signing
//      in, creating an account, a reset link, a new password, the code and a
//      new code each leave their busy state the same way, with the fields as
//      typed; a check of the wait for the email that never answers ends, and
//      the wait goes on.
//   4  (a guard, the source build) the start in typed modules (main.ts,
//      events.ts, screens.ts) does what r62's legacy start did, in its order:
//      every listener and interval the page adds as it opens, on the same
//      target, type and phase, one for one; window.__ironlog with r62's names
//      in r62's order, each the same kind of value; every action r62 had by
//      data-act; and no page errors.
const { engine, screenOf, screenDiff, open } = require('./h');
const cfg = require('../scripts/config');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r62.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const ONLY = process.env.R63_ONLY ? process.env.R63_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const N = +process.env.R63_N || 300;

// The starter routine's ids are made at random, so both builds are given the same ones (as tests/r62.js does).
const FIX = "const m={};L.state.routines.forEach((r,i)=>{m[r.id]='R'+i;r.id='R'+i;});L.state.activeRoutineId=m[L.state.activeRoutineId]||L.state.activeRoutineId;L.state.sessions.forEach(s=>{if(m[s.routineId])s.routineId=m[s.routineId];});L.saveNow();";
const DEMO = 'L.state.settings.onboarded=true;L.makeDemo();' + FIX;
const KG = "L.state.settings.unit='kg';L.saveNow();";
const OWN = "{const s=L.state.sessions.find(x=>x.demo);const c=JSON.parse(JSON.stringify(s));c.id='own1';c.demo=false;c.date='2026-10-01';L.state.sessions.push(c);L.state=L.normalize(L.state);L.invalidate();L.state.settings.lastExport='2026-08-01';L.saveNow();}";
const OPEN = o => `L.openModal(${JSON.stringify(o)});`;
const TAP = (act, ds) => `L.ACT.${act}({dataset:${JSON.stringify(ds)}});`;
const SETTLE = 'await new Promise(r=>setTimeout(r,250));';
// Stand-in services, run before the page's own (screenOf's init): an account signed out or in, and problem reports with an owner reading them.
const AUTH = user => `window.ironlogAuth={landing:null,onChange(){},user(){return Promise.resolve(${user ? JSON.stringify(user) : 'null'});},signIn(){return new Promise(()=>{});},signUp(){return new Promise(()=>{});},signOut(){return Promise.resolve();},resetPassword(){return Promise.resolve();},updatePassword(){return Promise.resolve();},verifyCode(){return new Promise(()=>{});},resendCode(){return Promise.resolve();},deleteAccount(){return Promise.resolve();},release(){}};`;
const OUT = AUTH(null);
const IN = AUTH({ id: 'u63', email: 'lifter@example.com' });
const SHOT = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
const ITEMS = [
  { id: 1, created_at: '2026-10-25T09:12:00Z', category: 'bug', message: 'The timer <stuck> & silent', reply_to: 'a@example.com', context: { build: 'x', errors: [] }, screenshot: SHOT, issue_url: cfg.TICKETS_AT + 'vqx7/ironlog-feedback/issues/7' },
  { id: 2, created_at: '2026-10-24T18:00:00Z', category: 'idea', message: 'Add a\nsecond line', reply_to: null, context: {}, screenshot: null, issue_url: null },
  { id: 3, created_at: '2026-10-23T07:30:00Z', category: 'question', message: 'How is RIR read?', reply_to: 'b@example.com', context: null, screenshot: 'https://example.com/x.png', issue_url: 'https://example.com/not-github' }
];
const FB = reader => `window.ironlogFeedback={send(){return new Promise(()=>{});},isReader(){return Promise.resolve(${reader});},inbox(){return Promise.resolve(${JSON.stringify(ITEMS)});}};`;
const ACC = o => OPEN({ kind: 'account', email: '', pw: '', ...o });
const CSV = 'Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Distance,Seconds\n2026-10-20,Push,Bench Press (Barbell),1,185,8,0,0\n2026-10-20,Push,Bench Press (Barbell),2,185,7,0,0\n2026-10-20,Push,Triceps Pushdown,1,1,40,0,0\n2026-10-20,Push,Plank,1,0,0,0,60\n2026-10-21,Run,Running,1,0,0,5,1800\n2026-10-22,Pull,Mystery Lift,1,100,10,0,0';
const NOTE = 'Oct 20\nBench press 185x8, 185x7, 185x6\nLat pulldown 3x10 @ 120\nsomething unreadable here\nCurls 3x10';
// [name, an account and report service (init), the log, the taps that open it, what it must show, the part read (default the sheet)]
const CASES = [
  ['the menu, no account service', '', DEMO, OPEN({ kind: 'menu' }), /Report a problem/],
  ['the menu, signed out', OUT, DEMO, SETTLE + OPEN({ kind: 'menu' }), /Not signed in/],
  ['the menu, signed in, an owner reading reports', IN + FB(true), DEMO, SETTLE + OPEN({ kind: 'menu' }), /Signed in as[\s\S]*Reports inbox/],
  ['the menu, a backup due', '', DEMO + OWN, OPEN({ kind: 'menu' }), /Backup due/],
  ['the menu, dark, in kilograms', '', DEMO + KG + "L.state.settings.theme='dark';L.saveNow();", OPEN({ kind: 'menu' }), /Your data and backups/],
  ['sign in', OUT, DEMO, SETTLE + ACC({ mode: 'signin' }), /Forgot password/],
  ['sign in, typed, an error said', OUT, DEMO, SETTLE + ACC({ mode: 'signin', email: 'a@b.co', pw: 'secret', err: 'Wrong email or password.' }), /Wrong email or password/],
  ['sign in, the code asked for', OUT, DEMO, SETTLE + ACC({ mode: 'signin', email: 'a@b.co', needCode: true, code: '12' }), /Confirm with the code/],
  ['sign in, busy', OUT, DEMO, SETTLE + ACC({ mode: 'signin', email: 'a@b.co', pw: 'x', busy: true }), /Signing in/],
  ['create an account', OUT, DEMO, SETTLE + ACC({ mode: 'signup' }), /8 or more characters/],
  ['create an account, busy', OUT, DEMO, SETTLE + ACC({ mode: 'signup', email: 'a@b.co', pw: '12345678', busy: true }), /Creating your account/],
  ['a reset link', OUT, DEMO, SETTLE + ACC({ mode: 'forgot', email: 'a@b.co' }), /Email me a reset link/],
  ['a new password', OUT, DEMO, SETTLE + ACC({ mode: 'newpw' }), /Save new password/],
  ['a message', OUT, DEMO, SETTLE + ACC({ mode: 'sent', title: 'Check your email', msg: 'A link <is> on its way & more.' }), /on its way/],
  ['waiting for the email', OUT, DEMO, SETTLE + ACC({ mode: 'wait', email: 'new@example.com' }), /Waiting for the confirmation/],
  ['waiting for the email, checking', OUT, DEMO, SETTLE + ACC({ mode: 'wait', email: 'new@example.com', busy: true, err: 'Not confirmed yet.' }), /Checking/],
  ['where Ironlog is used', OUT, DEMO, SETTLE + ACC({ mode: 'where', title: 'Email confirmed' }), /home-screen app/],
  ['a problem report, no report service', '', DEMO, TAP('fbOpen', {}), /Copy report/],
  ['a problem report, signed out', OUT + FB(false), DEMO, SETTLE + TAP('fbOpen', {}), /Sign in to send a report/],
  ['a problem report, signed in', IN + FB(false), DEMO, SETTLE + TAP('fbOpen', {}), /Replies go to lifter@example.com/],
  ['a question, typed', IN + FB(false), DEMO, SETTLE + TAP('fbOpen', { cat: 'question' }) + "{const t=document.querySelector('[data-fbind=\"msg\"]');t.value='Why <this> & that?';t.dispatchEvent(new Event('input',{bubbles:true}));}", /\d+ \/ \d+/],
  ['a suggestion, an error said', IN + FB(false), DEMO, SETTLE + "L.openModal({kind:'feedback',cat:'idea',msg:'A thought',shot:null,from:'today',err:'Could not send. Try again.'});", /Could not send/],
  ['a report sending', IN + FB(false), DEMO, SETTLE + "L.openModal({kind:'feedback',cat:'bug',msg:'Broken here',shot:null,from:'today',busy:true});", /Sending/],
  ['a report with a screenshot', IN + FB(false), DEMO, SETTLE + `L.openModal({kind:'feedback',cat:'bug',msg:'See the picture',shot:${JSON.stringify(SHOT)},from:'today'});`, /Remove/],
  ['a report sent', IN + FB(false), DEMO, SETTLE + "L.openModal({kind:'feedback',cat:'bug',msg:'x',shot:null,from:'today',sent:true});", /Any reply goes to/],
  ['a report copied', '', DEMO, "L.openModal({kind:'feedback',cat:'bug',msg:'x',shot:null,from:'today',sent:true,copied:true});", /Paste it in a message/],
  ['a report from the crash screen', '', DEMO, TAP('fbOpen', { crash: '1' }), /The app broke on the Today screen/],
  ['a custom exercise suggested for the library', '', DEMO + "L.state.exercises.push({id:'c_x',name:'Zercher <Squat>',primary:'quads',secondary:['glutes'],equip:'barbell',bw:false,rare:false,note:'Bar in the elbows',custom:true,archived:false});L.saveNow();", "L.openModal({kind:'exEdit',isNew:false,e:{...L.EX('c_x'),incRaw:'',maxRaw:'',barRaw:'',bwfRaw:''}});L.ACT.exSuggest();", /Add to the library: Zercher/],
  ['the reports inbox, loading', IN + FB(true), DEMO, SETTLE + "L.openModal({kind:'fbInbox',items:null});", /Loading/],
  ['the reports inbox, empty', IN + FB(true), DEMO, SETTLE + "L.openModal({kind:'fbInbox',items:[]});", /No feedback yet/],
  ['the reports inbox, three reports', IN + FB(true), DEMO, SETTLE + `L.openModal({kind:'fbInbox',items:${JSON.stringify(ITEMS)}});`, /GitHub issue/],
  ['the reports inbox, an error', IN + FB(true), DEMO, SETTLE + "L.openModal({kind:'fbInbox',items:null,err:'Could not load feedback.'});", /Could not load/],
  ['import, the first step', '', DEMO, TAP('impOpen', {}), /What can I import/],
  ['import, nothing pasted', '', DEMO, TAP('impOpen', {}) + 'L.ACT.impRead();' + SETTLE, /Paste your log or choose a file/],
  ['import, notes read', '', DEMO, `L.impStart({text:${JSON.stringify(NOTE)}});` + SETTLE, /Check the import/],
  ['import, notes in kilograms', '', DEMO + KG, `L.impStart({text:${JSON.stringify(NOTE.replace(/185/g, '80'))}});` + SETTLE + "L.ACT.impUnit({dataset:{v:'kg'}});", /Check the import/],
  ['import, a Strong file', '', DEMO, `L.impStart({text:${JSON.stringify(CSV)}});` + SETTLE, /Check the import/],
  ['import, a Strong file read twice', '', DEMO, `await L.impStart({text:${JSON.stringify(CSV)}});` + SETTLE + "L.ACT.impGo();" + SETTLE + `L.impStart({text:${JSON.stringify(CSV)}});` + SETTLE, /already in your log/],
  ['import, a table with no weight column', '', DEMO, "L.impStart({text:'date,exercise,reps\\n2026-10-20,Bench,8'});" + SETTLE, /Which column is which/],
  ['the Guide, a topic open', '', DEMO, OPEN({ kind: 'guide', open: 'data' }), /Your data|backup/i],
  ['the Guide, signed out', OUT + FB(false), DEMO, SETTLE + OPEN({ kind: 'guide', open: 'data' }), /With an account/],
  ['a toast', '', DEMO, "L.toast('Saved <it> & more');", /Saved <it> & more/, 'toast'],
  ['a toast with Undo', '', DEMO, "L.toast('Set removed',true);", /Undo/, 'toast'],
  ['the rest timer', '', DEMO, "L.ui.tab='today';L.render();L.ACT.startSession({dataset:{day:String(L.state.routines.find(r=>r.id===L.state.activeRoutineId).days.findIndex(x=>!x.rest&&x.items.length))}});L.timer.end=Date.now()+90500;L.timer.total=90;document.getElementById('timer').hidden=false;L.ACT.tAdd();", /Rest/, 'timer'],
  ['the rest timer, compact', '', DEMO + 'L.state.settings.timerCompact=true;L.saveNow();', "L.ui.tab='today';L.render();L.ACT.startSession({dataset:{day:String(L.state.routines.find(r=>r.id===L.state.activeRoutineId).days.findIndex(x=>!x.rest&&x.items.length))}});L.timer.end=Date.now()+60500;L.timer.total=60;document.getElementById('timer').hidden=false;L.ACT.tAdd();", /M:SS/, 'timer'],
  ['the menu button', '', DEMO, 'L.render();', /Saved on this device/, 'saveState'],
  // The backup text holds the log's random ids, so it is read as a backup of this app and then emptied in both builds.
  ['the crash screen', '', DEMO, "L.state.draft={ex:null};L.ui.tab='today';L.render();{const t=document.querySelector('#view textarea');const ok=JSON.parse(t.value).app==='ironlog';t.value='';t.textContent=ok?'a backup of this log':'not a backup';}", /something broke on this screen[\s\S]*a backup of this log/i, 'view']
];

(async () => {
  const browser = await engine.launch();

  // ---- 1. Every moved sheet and part against r62's (both pages built from src/).
  const textDiff = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return { at: i, r62: a.slice(Math.max(0, i - 80), i + 160), now: b.slice(Math.max(0, i - 80), i + 160) }; };
  // The rest timer's seconds tick between the two pages' reads.
  // A new exercise's id is made at random, as is the time a backup is written, and the build's own name differs by design.
  const steady = t => t.replace(/\b\d:\d\d\b/g, 'M:SS').replace(/--tp: [\d.]+/g, '--tp: N').replace(/\bc_[a-z0-9]{6,}/g, 'c_ID').replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d+Z/g, 'TIME').replace(/\d{4}\.\d\d\.\d\d-r[\d.]+/g, 'BUILD');
  const flat = s => ({ ...s, tree: s.tree.map(steady), text: steady(s.text).replace(/\s+/g, ' ') });
  if (!run(1));
  else if (process.env.IRONLOG_FILE) console.log('note r63 section 1 compares source pages; it runs on the source build');
  else for (const [name, init, seed, prep, want, root] of CASES.filter(c => !process.env.R63_CASE || c[0].includes(process.env.R63_CASE))) {
    const o = { browser, seed, tab: 'today', prep, root: root || 'modal', spaces: true, init: init || undefined };
    const a = flat(await screenOf(OLD, o)), b0 = await screenOf(FILE, o), b = flat(b0);
    const d = screenDiff({ tree: a.tree, text: '' }, { tree: b.tree, text: '' });
    ok(!d, `1. ${name}: the same elements, attributes and field values as r62`, d && { at: d.at, r62: d.before, now: d.now });
    ok(a.text === b.text, `1. ${name}: the same visible text as r62`, a.text === b.text ? '' : textDiff(a.text, b.text));
    ok(!b0.errors.length, `1. ${name}: no page errors`, b0.errors);
    // The case is the part it names (a prep that missed it would compare two empty sheets).
    ok(want.test(b.text) || want.test(b.tree.join('')), `1. ${name}: shown, in that state`, b.text.slice(0, 200));
  }

  // ---- 2. Import, the backup check and the demo against r62's, call for call.
  if (run(2) && !process.env.IRONLOG_FILE) {
    // A small seeded generator, so a failure is the same input on every run.
    const rng = seed => { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
    const NAMES = ['Bench press', 'bench', 'Bench Press (Barbell)', 'Incline DB press', 'incline dumbbell press', 'Lat pulldown', 'Lat Pulldown (Cable)', 'Squat (Barbell)', 'back squat', 'Deadlift (Barbell)', 'RDL', 'Romanian deadlift', 'Lateral raises', 'cable lateral raise', 'Pull Up (Assisted)', 'pullups', 'chin up', 'Dips', 'weighted dips', 'Plank', 'hammer curls', 'Bicep Curl (Dumbbell)', 'preacher curl machine', 'Leg press', 'Hack squat', 'Smith squat', 'Seated cable row', 'Face pull', 'Calf raise', 'Zottman Curl Weird Thing', 'constructor', '__proto__', 'toString', 'Ab wheel', 'Bulgarian split squat', 'Close grip bench', 'Overhead press', 'OHP', 'Front squat', 'Hip thrust'];
    const DATES = ['Sep 20', 'Sept 21 2026', '2026-10-02', '10/3', '3/10/26', 'Monday 5 Oct', 'Tue Oct 6', '7th October', '10.08.2026', ''];
    const SETS = ['185x8, 185x7, 185x6', '3x10 @ 60', '25x15', '8/8/8', '100kg x 5, 5, 4', '225#x5', 'bw x 10, bw+25 x 6', '5 5 4 rir 1', '185x8@2 205x6@1', '225 for 5 5 4 at 1', '3x10', '60x10x3', '20kg 3x12', '95 lbs x 10', '45 for 30 sec', 'bw x 60, 50', '2x8 @ 135', '10/10/10', '135', '4x6 rpe 8'];
    const note = r => { const pick = a => a[Math.floor(r() * a.length)]; const out = []; const days = 1 + Math.floor(r() * 3);
      for (let d = 0; d < days; d++) { const dt = pick(DATES); if (dt) out.push(dt + (r() < 0.3 ? ' - ' + pick(['Push day', 'Legs', 'Upper A', 'Pull']) : '')); const n = 1 + Math.floor(r() * 5);
        for (let i = 0; i < n; i++) { const nm = pick(NAMES); const k = r(); if (k < 0.45) out.push(nm + ' ' + pick(SETS)); else if (k < 0.7) { out.push(nm); out.push(pick(SETS)); if (r() < 0.4) out.push(pick(SETS)); } else if (k < 0.8) { out.push(nm + ' ' + pick(['185', '60', '225'])); out.push(pick(['10/10/10', '8/8/6', '12,10,8'])); } else if (k < 0.9) out.push('- ' + nm + ': ' + pick(SETS)); else out.push(pick(['felt strong today', 'gym was busy', '???', 'warmup 10 min'])); }
        if (r() < 0.3) out.push(''); }
      return out.join(r() < 0.2 ? '\r\n' : '\n'); };
    const table = r => { const pick = a => a[Math.floor(r() * a.length)]; const kind = Math.floor(r() * 3); const rows = [];
      const dates = ['2026-09-10 18:02:11', '2026-09-12 07:30:00', '2026-09-15 06:10:00', '2026-09-17 19:45:00'];
      if (kind === 0) { rows.push('Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE');
        for (const d of dates.slice(0, 1 + Math.floor(r() * 4))) { const w = pick(['"Evening Workout"', '"Legs"', '"Push"', '"Morning Workout"']); for (let i = 0; i < 2 + Math.floor(r() * 4); i++) { const nm = pick(NAMES).replace(/"/g, ''); for (let k = 0; k < 1 + Math.floor(r() * 4); k++) rows.push(`${d},${w},1h 5m,"${nm}",${pick(['W', '1', '2', '3', 'D', 'F'])},${pick([0, 45, 95, 135, 185, 225, -20])},${pick([0, 5, 8, 10, 12, 15])},${pick([0, 0, 3.1])},${pick([0, 0, 60, 1500])},"","",${pick(['', '8', '9', '7.5'])}`); } } }
      else if (kind === 1) { rows.push('"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"');
        for (const d of ['14 Sep 2026, 17:29', '16 Sep 2026, 18:00', '18 Sep 2026, 07:00'].slice(0, 1 + Math.floor(r() * 3))) { const t = pick(['Upper A', 'Lower B', 'Full']); for (let i = 0; i < 2 + Math.floor(r() * 3); i++) { const nm = pick(NAMES).replace(/"/g, ''); const ss = r() < 0.3 ? String(Math.floor(r() * 2)) : ''; for (let k = 0; k < 1 + Math.floor(r() * 3); k++) rows.push(`"${t}","${d}","${d}","","${nm}",${ss},"",${k},"${pick(['warmup', 'normal', 'normal', 'failure', 'dropset'])}",${pick([0, 14, 40, 80, 100, -20])},${pick([5, 8, 10, 12, ''])},${pick(['', '', 2.5])},${pick(['', '', 45])},${pick(['', 8, 8.5, 9])}`); } } }
      else { rows.push(pick(['date,exercise,weight,reps,sets,rir', 'Date\tExercise\tWeight\tReps', 'date,exercise,reps']));
        const tab = rows[0].includes('\t'); for (let i = 0; i < 3 + Math.floor(r() * 8); i++) { const cells = [pick(['2026-09-20', '9/21/2026', '']), pick(NAMES), pick(['185', '60', '', 'bw']), pick(['8', '10', '5', '0']), pick(['3', '1', '']), pick(['1', '2', ''])]; rows.push(cells.slice(0, rows[0].split(tab ? '\t' : ',').length).join(tab ? '\t' : ',')); } }
      return rows.join('\n'); };
    const TYPED = ['235x5, 5, 4 rir 1', '185x8@2 205x6@1', '225 for 5 5 4 at 1', 'bw x 10, bw+25 x 6', '100 x 5 rpe 8', '80x8@8 90x6@9', '5, 5, 5', 'zz', '', '300x101', '135x8@11', 'bw+10x8@2', '60x12, 10, 8', '3x10', '45x30', '225x5 x 5', '1000x8'];
    const digest = async (Q, seed) => Q.page.evaluate(async ({ seed, texts, tables, typed, names }) => {
      const L = window.__ironlog; const out = [];
      // The same random numbers in both pages, so the ids each build makes are the same.
      let a = seed >>> 0; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
      const ser = v => JSON.stringify(v, (k, x) => (x === undefined ? '<undefined>' : typeof x === 'number' && !isFinite(x) ? String(x) : x instanceof Set ? ['<Set>', ...x] : x instanceof Map ? ['<Map>', ...x] : x));
      const call = (name, f) => { let r; try { r = f(); } catch (e) { r = { threw: String(e && e.message) }; } out.push(name + '\t' + ser(r)); return r; };
      const fresh = () => { L.state = L.normalize(null); L.state.settings.onboarded = true; L.invalidate(); };
      const demoed = () => { fresh(); L.makeDemo(); };
      demoed();
      const KG = v => v, LBC = v => v * 0.45359237;
      for (const n of names) call('impMatch ' + n, () => L.impMatch(n));
      const kinds = [L.EX('bench'), L.EX('pullup'), L.EX('plank'), L.EX('assistPullup'), L.EX('dbCurl')];
      for (const t of typed) for (const ex of kinds) { call('parseSets ' + t + ' ' + ex.id, () => L.parseSets(t, ex, null)); call('parseSets@ ' + t + ' ' + ex.id, () => L.parseSets(t, ex, 60, KG, true)); call('parseSets lb ' + t + ' ' + ex.id, () => L.parseSets(t, ex, 100, LBC)); }
      for (const t of texts) {
        const res = call('impFromText', () => L.impFromText(t));
        for (const s of (res && res.sessions) || []) for (const it of s.items.slice(0, 3)) for (const ex of kinds) { call('impTextSets kg', () => L.impTextSets(it, ex, KG)); call('impTextSets lb', () => L.impTextSets(it, ex, LBC)); }
      }
      // Each input previewed, built in both units, and confirmed on a first run (the routine made from it) and over a log.
      const inputs = [...texts.slice(0, Math.ceil(texts.length / 3)), ...tables];
      for (const t of inputs) {
        for (const first of [true, false]) {
          if (first) fresh(); else demoed();
          await L.impStart({ text: t });
          const m = L.ui.modal;
          out.push('preview\t' + ser(m && { kind: m.kind, step: m.step, pick: m.pick, guess: m.guess, unit: m.unit, unitKnown: m.unitKnown, date: m.date, res: m.res, err: m.err }));
          if (!m || m.step !== 'preview' || m.res.needMap) { L.ACT.mClose(); continue; }
          call('impBuild', () => L.impBuild(m));
          m.unit = m.unit === 'kg' ? 'lb' : 'kg';
          call('impBuild other unit', () => L.impBuild(m));
          m.unit = m.unit === 'kg' ? 'lb' : 'kg';
          L.ACT.impGo();
          out.push('after impGo\t' + ser({ state: L.normalize(JSON.parse(JSON.stringify(L.state))), tab: L.ui.tab, modal: L.ui.modal && L.ui.modal.kind, toast: (document.getElementById('toast') || {}).textContent }));
          L.ACT.mClose();
        }
      }
      // A backup restored over the demo, confirmed.
      demoed();
      const backup = JSON.stringify({ app: 'ironlog', state: L.state });
      fresh(); L.importData(backup); out.push('backup asked\t' + ser(L.ui.modal && { kind: L.ui.modal.kind, title: L.ui.modal.title, body: L.ui.modal.body })); L.ACT.mOk();
      out.push('backup in\t' + ser(L.normalize(JSON.parse(JSON.stringify(L.state)))));
      for (const bad of ['not json', '{"state":{}}', '{"exercises":[],"routines":[],"sessions":[{"bad":1}]}']) { L.ACT.mClose(); L.importData(bad); out.push('backup refused\t' + ser({ modal: L.ui.modal && L.ui.modal.kind, toast: (document.getElementById('toast') || {}).textContent })); }
      // The demo from every ready-made routine.
      for (const k of Object.keys(L.TEMPLATES)) { fresh(); const r = L.routineFromTemplate(k); if (!r) continue; L.state.routines = [r]; L.state.activeRoutineId = r.id; L.invalidate(); L.makeDemo(); out.push('demo ' + k + '\t' + ser(L.normalize(JSON.parse(JSON.stringify(L.state))))); }
      return out;
    }, { seed, texts: G.texts, tables: G.tables, typed: TYPED, names: NAMES });
    const r = rng(63000);
    const G = { texts: [], tables: [] };
    for (let i = 0; i < N; i++) G.texts.push(note(r));
    for (let i = 0; i < Math.ceil(N / 3); i++) G.tables.push(table(r));
    const both = [];
    for (const file of [OLD, FILE]) {
      const Q = await open(file, { browser });
      await Q.page.clock.setFixedTime(new Date('2026-10-24T10:00:00'));
      both.push({ out: await digest(Q, 6300), errors: Q.errors.slice() });
      await Q.ctx.close();
    }
    const [a, b] = both.map(x => x.out);
    let first = -1; for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { first = i; break; }
    const where = i => ({ at: i, r62: (a[i] || '').slice(0, 900), now: (b[i] || '').slice(0, 900) });
    ok(a.length > 1000 && first < 0, `2. import, the backup check and the demo: ${b.length} answers the same as r62's (${a.length})`, first < 0 ? '' : where(first));
    ok(!both[1].errors.length, '2. no page errors', both[1].errors.slice(0, 5));
  }

  // ---- 3. The time limits and the report's key (fail on r62).
  if (run(3)) {
    const NET = 20000;
    // Services that never answer, recording what they were sent.
    const HANG = `window.__sent=[];const never=()=>new Promise(()=>{});
      window.ironlogAuth={landing:null,onChange(){},user(){return Promise.resolve(window.__who||null);},signIn(e,p){window.__sent.push(['signIn',e,p]);return never();},signUp(e,p){window.__sent.push(['signUp',e]);return window.__signUpOk?Promise.resolve({confirm:true,user:null}):never();},signOut(){return Promise.resolve();},resetPassword(e){window.__sent.push(['reset',e]);return never();},updatePassword(){window.__sent.push(['newpw']);return never();},verifyCode(e,c){window.__sent.push(['code',e,c]);return never();},resendCode(e){window.__sent.push(['resend',e]);return never();},release(){}};
      window.ironlogFeedback={send(fb){window.__sent.push(['send',fb.client_id||null,fb.message]);return window.__fail?Promise.reject(Object.assign(new Error('No connection. Try again when you have signal.'),{code:'error'})):never();},isReader(){return Promise.resolve(false);}};`;
    const page = async (who) => {
      const Q = await open(FILE, { browser, setup: async ctx => { await ctx.addInitScript((who ? `window.__who=${JSON.stringify(who)};` : '') + HANG); } });
      await Q.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); L.render(); });
      await Q.page.waitForTimeout(300);
      await Q.page.clock.install();
      return Q;
    };
    const sheet = Q => Q.page.evaluate(() => { const m = window.__ironlog.ui.modal || {}; const b = document.querySelector('#modal [data-act="fbSend"],#modal [data-act="acctSubmit"]'); return { kind: m.kind, mode: m.mode, busy: !!m.busy, err: m.err || '', sent: !!m.sent, button: b ? b.textContent.trim() : '', disabled: b ? b.disabled : null, fields: [...document.querySelectorAll('#modal input:not([type=file]),#modal textarea')].map(x => x.value), log: window.__sent }; });
    const late = async Q => { await Q.page.clock.runFor(NET + 1000); await Q.page.waitForTimeout(50); };
    const NO = /No answer\. Check your connection and try again\./;
    { // A report that never answers.
      const Q = await page({ id: 'u1', email: 'lifter@example.com' });
      await Q.page.evaluate(() => window.__ironlog.ACT.fbOpen({ dataset: { cat: 'bug' } }));
      await Q.page.fill('#modal [data-fbind="msg"]', 'The chart froze on Stats');
      await Q.page.click('#modal [data-act="fbSend"]');
      const during = await sheet(Q);
      await late(Q);
      const after = await sheet(Q);
      ok(during.busy && during.button === 'Sending', '3. a report sending says so while it waits', during);
      ok(!after.busy && !after.sent && NO.test(after.err) && after.button === 'Send' && after.disabled === false && after.fields.includes('The chart froze on Stats'), '3. a report whose send never answers leaves Sending after 20 s, says why, and keeps its text', after);
      // Sent again, it carries the same key as the first try.
      await Q.page.click('#modal [data-act="fbSend"]');
      const sends = (await sheet(Q)).log.filter(x => x[0] === 'send');
      ok(sends.length === 2 && sends[0][1] && sends[0][1] === sends[1][1], '3. the same report sent again carries the same key (client_id), so the table keeps it once', sends);
      await Q.ctx.close();
    }
    { // A report refused at once is sent again with its key; a new sheet makes a new key.
      const Q = await page({ id: 'u1', email: 'lifter@example.com' });
      await Q.page.evaluate(() => { window.__fail = true; window.__ironlog.ACT.fbOpen({ dataset: { cat: 'idea' } }); });
      await Q.page.fill('#modal [data-fbind="msg"]', 'A thought about the timer');
      await Q.page.click('#modal [data-act="fbSend"]'); await Q.page.waitForTimeout(50);
      await Q.page.click('#modal [data-act="fbSend"]'); await Q.page.waitForTimeout(50);
      await Q.page.evaluate(() => { const L = window.__ironlog; L.ACT.mClose(); L.ACT.fbOpen({ dataset: { cat: 'bug' } }); });
      await Q.page.fill('#modal [data-fbind="msg"]', 'Another report entirely');
      await Q.page.click('#modal [data-act="fbSend"]'); await Q.page.waitForTimeout(50);
      const k = (await sheet(Q)).log.filter(x => x[0] === 'send').map(x => x[1]);
      ok(k.length === 3 && k[0] && k[0] === k[1] && k[2] && k[2] !== k[0], '3. one report keeps its key through its tries, and the next report has its own', k);
      await Q.ctx.close();
    }
    // Each request the account sheet makes, never answered.
    const ACCT = [
      ['signing in', { mode: 'signin' }, [['email', 'a@b.co'], ['pw', 'secret pass']], 'acctSubmit', 'Signing in'],
      ['creating an account', { mode: 'signup' }, [['email', 'new@b.co'], ['pw', 'long enough pw']], 'acctSubmit', 'Creating your account'],
      ['a reset link', { mode: 'forgot' }, [['email', 'a@b.co']], 'acctSubmit', 'Sending the link'],
      ['a new password', { mode: 'newpw' }, [['pw', 'another long pw']], 'acctSubmit', 'Saving'],
      ['the code', { mode: 'signin', needCode: true }, [['email', 'a@b.co'], ['code', '123456']], 'acctCode', null],
      ['a new code', { mode: 'signin', needCode: true }, [['email', 'a@b.co']], 'acctResend', null]
    ];
    for (const [name, o, fields, act, busyWord] of ACCT) {
      const Q = await page(null);
      await Q.page.evaluate(o => window.__ironlog.openModal({ kind: 'account', email: '', pw: '', ...o }), o);
      for (const [k, v] of fields) await Q.page.fill(`#modal [data-abind="${k}"]`, v);
      await Q.page.click(`#modal [data-act="${act}"]`);
      const during = await sheet(Q);
      await late(Q);
      const after = await sheet(Q);
      ok(during.busy && (!busyWord || during.button === busyWord), `3. ${name}: busy while it waits`, during);
      ok(!after.busy && after.kind === 'account' && NO.test(after.err) && fields.every(([, v]) => after.fields.includes(v)), `3. ${name}: a request that never answers ends after 20 s, says why, and keeps what was typed`, after);
      await Q.ctx.close();
    }
    { // The wait for a new account's email: a check that never answers ends, and the wait goes on.
      const Q = await page(null);
      await Q.page.evaluate(() => { window.__signUpOk = true; window.__ironlog.openModal({ kind: 'account', mode: 'signup', email: '', pw: '' }); });
      await Q.page.fill('#modal [data-abind="email"]', 'new@b.co'); await Q.page.fill('#modal [data-abind="pw"]', 'long enough pw');
      await Q.page.click('#modal [data-act="acctSubmit"]'); await Q.page.waitForTimeout(50);
      await Q.page.click('#modal [data-act="acctWaitNow"]');
      const during = await sheet(Q);
      await late(Q);
      const after = await sheet(Q);
      const still = await Q.page.evaluate(() => window.__ironlog.acctWaiting());
      ok(during.mode === 'wait' && during.busy, '3. the wait for the email: I have confirmed checks', during);
      ok(after.mode === 'wait' && !after.busy && NO.test(after.err) && still, '3. a check that never answers ends after 20 s, says why, and the wait goes on', { after, still });
      // The next check runs (a check left hanging stopped every later one before).
      await Q.page.click('#modal [data-act="acctWaitNow"]');
      const tries = (await sheet(Q)).log.filter(x => x[0] === 'signIn').length;
      ok(tries === 2, '3. and the next check goes out', tries);
      await Q.ctx.close();
    }
  }

  // ---- 4. The start against r62's: the listeners in their order, the suites' hook and the actions.
  if (run(4) && !process.env.IRONLOG_FILE) {
    // Every listener and interval added while the page opens, in order: its target, type and phase, or the interval's period.
    const SPY = `(()=>{const L=window.__adds=[];const at=t=>t===window?'window':t===document?'document':t&&t.nodeName?(t.nodeName+(t.id?'#'+t.id:'')):String(t);
      const add=EventTarget.prototype.addEventListener;EventTarget.prototype.addEventListener=function(type,fn,o){L.push([at(this),type,!!(o===true||(o&&o.capture))].join(' '));return add.call(this,type,fn,o);};
      const si=window.setInterval;window.setInterval=function(f,ms,...a){L.push('interval '+ms);return si.call(this,f,ms,...a);};})();`;
    const seen = [];
    for (const file of [OLD, FILE]) {
      const Q = await open(file, { browser, setup: async ctx => { await ctx.addInitScript(SPY); } });
      await Q.page.waitForTimeout(300);
      seen.push(await Q.page.evaluate(() => {
        const L = window.__ironlog;
        return { adds: window.__adds.slice(), hook: Object.keys(Object.getOwnPropertyDescriptors(L)).map(k => { const d = Object.getOwnPropertyDescriptor(L, k); return k + ' ' + (d.get || d.set ? 'accessor' : typeof d.value); }), acts: Object.keys(L.ACT).sort() };
      }));
      seen[seen.length - 1].errors = Q.errors.slice();
      await Q.ctx.close();
    }
    const [a, b] = seen;
    const firstDiff = (x, y) => { for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) return { at: i, r62: x.slice(Math.max(0, i - 3), i + 4), now: y.slice(Math.max(0, i - 3), i + 4) }; return null; };
    const da = firstDiff(a.adds, b.adds);
    ok(a.adds.length > 20 && !da, `4. the page adds r62's ${a.adds.length} listeners and intervals, in r62's order`, da);
    const dh = firstDiff(a.hook, b.hook);
    ok(a.hook.length > 300 && !dh, `4. window.__ironlog holds r62's ${a.hook.length} names in r62's order, each the same kind of value`, dh);
    // rNewDo sat in r62's table as the helper New routine's Save called by name (ACT.rNewDo(name)): no element named it, and a tap would have handed it the element as the name. It is a function of actsroutine.ts since r63.
    const NOT_TAPS = ['rNewDo'];
    const gone = a.acts.filter(k => !b.acts.includes(k) && !NOT_TAPS.includes(k)), extra = b.acts.filter(k => !a.acts.includes(k));
    ok(NOT_TAPS.every(k => a.acts.includes(k) && !b.acts.includes(k)), '4. r62\'s one helper in the table (rNewDo) is a function now, not an action');
    ok(a.acts.length > 200 && !gone.length && !extra.length, `4. every other one of r62's ${a.acts.length} actions by data-act, and no new one`, { gone, extra });
    ok(!b.errors.length, '4. no page errors', b.errors);
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
