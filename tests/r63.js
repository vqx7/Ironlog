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
const { engine, screenOf, screenDiff } = require('./h');
const cfg = require('../scripts/config');
const FILE = process.argv[2] || 'index.html';
const OLD = 'baselines/r62.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); return !!c; };
const ONLY = process.env.R63_ONLY ? process.env.R63_ONLY.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));

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

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
