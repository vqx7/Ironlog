// r57 (PENDING 340, phase 5 of ARCHITECTURE.md): History and Settings move
// into src/app/ as lit-html screens, and every change they make to the log
// goes through `act`, the one way to change it. Each case fails on r56.2
// (`node tests/r57.js baselines/r56-2.html`) unless it says it guards:
//   1  act does its steps in order: the check first (refused, nothing is kept,
//      changed or written), the Undo step when asked for, the change, the
//      caches dropped, the save on this device and the edit noted for the sync;
//   2  every action History and Settings take that changes the log does all of
//      those steps, read on the page after a tap (an action that skipped the
//      save, the Undo step it promises, the caches or the sync fails here);
//   3  both screens draw from their modules: the page's #view holds the
//      screen lit-html drew, kept between draws, so a field being typed in
//      keeps its focus and its text when the screen draws again;
//   4  (a guard, run on both builds) they look as they did: History and
//      Settings in a range of logs and settings, every section open, give the
//      same elements, attributes, field values and visible text on this build
//      as on r56.2 (baselines/r56-2.html), read after the page's tip pass, with
//      lit-html's markers and the label ids it draws left out.
//   5  from the review of r57, each a guard that also passes on r56.2 (5b
//      fails there too: r56.2 lost two sections from such an order) and failed
//      on r57 as first built: a draw mid-drag drops the drag, an order with a
//      section twice shows it once, and a number typed out of range and
//      confirmed with Enter shows the number saved.
const { open, engine } = require('./h');
const FILE = process.argv[2] || 'index.html';
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 600) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await engine.launch();
  const P = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
  const ev = (f, a) => P.page.evaluate(f, a);
  await ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.render(); });
  await wait(300);

  // ---- 1. act, called directly.
  const hasAct = await ev(() => typeof window.__ironlog.act === 'function');
  ok(hasAct, '1. act is the one way to change the log, reachable for the suites');
  if (hasAct) {
    const r = await ev(async () => {
      const L = window.__ironlog; const KEY = L.KEY; const out = {};
      const idx0 = L.IDX(); const u0 = L.undoStack.length; const saved0 = localStorage.getItem(KEY);
      await new Promise(r => setTimeout(r, 1000)); const e0 = JSON.stringify(L.cloud.editAt);
      // Refused by its check: nothing kept, changed, dropped or written.
      out.refused = L.act(() => { L.state.settings.userName = 'Refused'; }, { check: () => false, undo: true });
      out.refusedClean = L.state.settings.userName !== 'Refused' && L.undoStack.length === u0 && L.IDX() === idx0 && localStorage.getItem(KEY) === saved0;
      // Allowed, with an Undo step: the step holds the log from before the change.
      const seen = [];
      out.done = L.act(() => { seen.push(L.undoStack.length); L.state.settings.userName = 'Actor'; }, { check: () => { seen.push('check'); return true; }, undo: true });
      out.order = seen;
      out.undoKept = L.undoStack.length === u0 + 1 && JSON.parse(L.undoStack[L.undoStack.length - 1].pre).settings.userName !== 'Actor';
      out.dropped = L.IDX() !== idx0;
      out.saved = JSON.parse(localStorage.getItem(KEY)).settings.userName === 'Actor';
      await new Promise(r => setTimeout(r, 1000));
      out.noted = JSON.stringify(L.cloud.editAt) !== e0;
      // Without undo: no step.
      const u1 = L.undoStack.length;
      L.act(() => { L.state.settings.userName = 'Quiet'; });
      out.noUndo = L.undoStack.length === u1 && JSON.parse(localStorage.getItem(KEY)).settings.userName === 'Quiet';
      return out;
    });
    ok(r.refused === false && r.refusedClean, '1. a change its check refuses keeps no Undo step, changes nothing, drops no cache and writes nothing', r);
    ok(r.done === true && JSON.stringify(r.order) === JSON.stringify(['check', r.order[1]]) && typeof r.order[1] === 'number', '1. the check runs first, then the Undo step, then the change', r.order);
    ok(r.undoKept, '1. the Undo step holds the log from before the change', r);
    ok(r.dropped && r.saved, '1. the caches are dropped and the log is saved on this device', r);
    ok(r.noted, '1. the edit is noted for the sync', r);
    ok(r.noUndo, '1. a change that asks for no Undo step keeps none, and is still saved', r);
  }

  // ---- 2. Every action of the two screens that changes the log, from a tap.
  // probe: runs a tap, answers a question if one opens, and reads what was done.
  const probe = (name, tab, sel, undo, prep) => ev(async ([name, tab, sel, undo, prep]) => {
    const L = window.__ironlog; const KEY = L.KEY;
    // What a case starts from is saved and seen by the sync first, so the tap's own change is what is read.
    if (prep) { (new Function('L', prep))(L); L.saveNow(); await new Promise(r => setTimeout(r, 950)); }
    L.ui.tab = tab; L.render(); await new Promise(r => setTimeout(r, 60));
    document.querySelectorAll('#view details').forEach(d => { d.open = true; });
    await new Promise(r => setTimeout(r, 60));
    const el = document.querySelector(sel); if (!el) return { name, missing: sel };
    const idx0 = L.IDX(); const u0 = L.undoStack.length; const s0 = JSON.stringify(L.state); const e0 = JSON.stringify(L.cloud.editAt);
    el.click(); await new Promise(r => setTimeout(r, 80));
    const okb = document.querySelector('#modal [data-act="mOk"]'); if (okb) { okb.click(); await new Promise(r => setTimeout(r, 80)); }
    await new Promise(r => setTimeout(r, 950));
    const s1 = JSON.stringify(L.state);
    return { name, changed: s1 !== s0, saved: localStorage.getItem(KEY) === s1, undo: L.undoStack.length - u0, wantUndo: undo, dropped: L.IDX() !== idx0, noted: JSON.stringify(L.cloud.editAt) !== e0 };
  }, [name, tab, sel, undo, prep || '']);
  const cases = [
    ['accent', 'settings', '[data-act="accent"][data-v="volt"]', 0],
    ['prio', 'settings', '[data-act="prio"][data-m="glutes"]', 0],
    ['hideToggle', 'settings', '[data-act="hideToggle"][data-k="dash:body"]', 0],
    ['layoutAll', 'settings', '[data-act="layoutAll"]', 0, "L.state.settings.hidden=['dash:body'];"],
    ['layoutDefault', 'settings', '[data-act="layoutDefault"]', 1, "L.state.settings.hidden=[];"],
    ['layoutReset', 'settings', '[data-act="layoutReset"]', 1, "L.state.settings.secOrder={settings:['more','help']};"],
    ['profSet', 'settings', '[data-act="profSet"][data-k="goal"][data-v="strength"]', 1],
    ['bandsDefault', 'settings', '[data-act="bandsDefault"]', 1, "L.state.settings.bands.chest=[3,30];"],
    ['gymPlate', 'settings', '[data-act="gymPlate"][data-v="45"]', 1],
    ['gymClear', 'settings', '[data-act="gymClear"]', 1],
    ['trashDel', 'history', '[data-act="trashDel"]', 1, "L.state.trash=[{id:'tx1',kind:'cardio',date:'2026-10-23',data:{id:'tx1',date:'2026-10-20',kind:'walk',min:30,when:'solo'}}];"],
    ['trashEmpty', 'history', '[data-act="trashEmpty"]', 1, "L.state.trash=[{id:'tx2',kind:'cardio',date:'2026-10-23',data:{id:'tx2',date:'2026-10-20',kind:'walk',min:30,when:'solo'}}];"],
    ['restore', 'history', '[data-act="restore"]', 0, "L.state.trash=[{id:'tx3',kind:'cardio',date:'2026-10-23',data:{id:'tx3',date:'2026-10-20',kind:'walk',min:30,when:'solo',hr:null,dist:null,note:''}}];"],
    ['cardioDel', 'history', '[data-act="cardioDel"]', 0, "L.state.cardio.push({id:'cx1',date:'2026-10-22',kind:'walk',min:20,when:'solo',hr:null,dist:null,note:''});"],
    ['histDel', 'history', '[data-act="histDel"]', 1, "L.ui.histOpen=[...L.state.sessions].sort((a,b)=>a.date<b.date?1:-1)[0].id;"],
    ['demoClear', 'settings', '[data-act="demoClear"]', 1]
  ];
  for (const c of cases) {
    const r = await probe(...c);
    if (r.missing) { ok(false, `2. ${c[0]}: its control is on ${c[1]}`, r); continue; }
    ok(r.changed && r.saved && r.dropped && r.noted && r.undo === r.wantUndo, `2. ${c[0]}: changes the log, saves it, drops the caches, notes the edit for the sync${r.wantUndo ? ' and keeps one Undo step' : ', keeping no Undo step as before'}`, r);
  }
  // The settings typed or picked, each through its field.
  const bind = (key, value, tab, prep) => ev(async ([key, value, tab, prep]) => {
    const L = window.__ironlog; const KEY = L.KEY;
    if (prep) { (new Function('L', prep))(L); L.saveNow(); await new Promise(r => setTimeout(r, 950)); }
    L.ui.tab = tab || 'settings'; L.render(); await new Promise(r => setTimeout(r, 60));
    document.querySelectorAll('#view details').forEach(d => { d.open = true; });
    const el = document.querySelector(`#view [data-bind="${key}"]`); if (!el) return { key, missing: true };
    const idx0 = L.IDX(); const s0 = JSON.stringify(L.state); const e0 = JSON.stringify(L.cloud.editAt);
    if (el.type === 'checkbox') el.checked = !el.checked; else el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 950));
    const s1 = JSON.stringify(L.state);
    return { key, changed: s1 !== s0, saved: localStorage.getItem(KEY) === s1, dropped: L.IDX() !== idx0, noted: JSON.stringify(L.cloud.editAt) !== e0 };
  }, [key, value, tab, prep || '']);
  for (const [key, value] of [['unit', 'kg'], ['theme', 'light'], ['userName', 'Vee'], ['bwGoalPct', '0.3'], ['bwEvery', '7'], ['barKg', '20'], ['timeBudget', '70'], ['timerMode', 'manual'], ['timerSound', null], ['timerCompact', null], ['autoDone', null], ['todayStart', 'free'], ['autoAdj', null], ['wakeLock', null], ['rirMode', 'cal'], ['rirScale', 'rpe'], ['rirAsk', null], ['rirHalf', null], ['smallPlates', null]]) {
    const r = await bind(key, value);
    if (r.missing) { ok(false, `2. the ${key} field is on Settings`, r); continue; }
    ok(r.changed && r.saved && r.dropped && r.noted, `2. ${key}: the setting is changed, saved, the caches dropped and the edit noted for the sync`, r);
  }

  // ---- 3. Drawn by lit-html and kept between draws.
  for (const tab of ['settings', 'history']) {
    const r = await ev(async tab => {
      const L = window.__ironlog; L.ui.tab = tab; L.render(); await new Promise(r => setTimeout(r, 60));
      const sel = tab === 'settings' ? '#view [data-bind="userName"]' : '#view [data-bind="histEx"]';
      const first = document.querySelector(sel); const head = document.querySelector('#view .ph');
      if (tab === 'settings') { first.closest('details').open = true; first.focus(); first.value = 'Half typ'; }
      L.render(); await new Promise(r => setTimeout(r, 60));
      const again = document.querySelector(sel);
      return { same: again === first && document.querySelector('#view .ph') === head, focus: tab !== 'settings' || document.activeElement === again, text: tab !== 'settings' || again.value === 'Half typ' };
    }, tab);
    ok(r.same && r.focus && r.text, `3. ${tab}: drawn again, the screen keeps its elements, and a field being typed in keeps its focus and text`, r);
  }

  ok(P.errors.length === 0, 'no page errors', P.errors);

  // ---- 4. The two screens against r56.2's. A comparison of two pages built from src/: the standalone
  // build (IRONLOG_FILE) is the built app, which shows what r56.2's source page never does (Install, the
  // licenses), and no built copy of r56.2 is kept, so the standalone run leaves this section to the source run.
  const OLD = 'baselines/r56-2.html';
  if (process.env.IRONLOG_FILE) console.log('note r57 section 4 compares source pages; it runs on the source build');
  else {
  // Each tab read by the harness's screenOf (tests/h.js), the same reading for both builds.
  const { screenOf, screenDiff } = require('./h');
  // The spaces drawn between elements are read too (screenOf's spaces, since r59), so a space lost or added there shows.
  const shot = (file, seed, tab, env) => screenOf(file, { browser, seed, tab, env, spaces: true });
  const SEEDS = [
    ['a new install', "L.state.settings.onboarded=true;L.saveNow();"],
    ['demo data, lb', "L.state.settings.onboarded=true;L.makeDemo();L.saveNow();"],
    ['demo data, everything set', `
      const s=L.state;s.settings.onboarded=true;L.makeDemo();
      s.settings.unit='kg';s.settings.theme='dark';s.settings.accent='volt';s.settings.userName='Vee';s.settings.bwGoalPct=-0.5;s.settings.bwEvery=7;
      s.settings.gym={u:'kg',db:{lo:2,hi:40,st:2,fine:1,fineTo:10},kb:[8,12,16],plates:[25,20,15,10,5,2.5],stack:5};s.settings.smallPlates=true;s.settings.barKg=15;
      s.settings.profile={goal:'strength',exp:'5',days:4,focus:['chest','biceps']};s.settings.timeBudget=75;
      s.settings.timerMode='manual';s.settings.timerSound=true;s.settings.timerCompact=true;s.settings.autoDone=true;s.settings.loadFill='fill';s.settings.todayStart='free';s.settings.autoAdj=false;s.settings.wakeLock=true;
      s.settings.rirMode='cal';s.settings.rirScale='rpe';s.settings.rirAsk=true;s.settings.rirHalf=true;
      s.settings.hidden=['history:cardio','dash:body','today:coach'];s.settings.secOrder.settings=['more','data','general','profile'];s.settings.secOrder.history=['sessions','trash'];
      s.settings.priorities=['chest','glutes'];s.settings.bands.chest=[12,24];s.settings.lastExport='2026-10-01';
      s.cardio.push({id:'c1',date:'2026-10-20',kind:'walk',min:30,hr:120,when:'post',note:'easy & slow',demo:false,dist:3.2},{id:'c2',date:'2026-10-21',kind:'elliptical',min:20,hr:null,when:'solo',note:'',demo:false});
      s.trash=[{id:'t1',kind:'session',date:'2026-10-23',data:{id:'t1',date:'2026-10-19',dayName:'Push <A>',ex:[]}},{id:'t2',kind:'cardio',date:'2026-10-22',data:{id:'t2',date:'2026-10-18',kind:'walk'}},{id:'t3',kind:'routine',date:'2026-10-21',data:{id:'t3',name:'Old plan',days:[]}}];
      L.ui.histOpen=[...s.sessions].sort((a,b)=>a.date<b.date?1:-1)[1].id;L.ui.gymDb=null;
      L.log('test',new Error('first <error>'));L.log('sync',new Error('second'));L.snapshot();
      L.state=L.normalize(s);L.invalidate();L.saveNow();`],
    ['history filtered to one lift, rack half typed, RIR off', `
      const s=L.state;s.settings.onboarded=true;L.makeDemo();s.settings.rirMode='off';
      const id=Object.keys(L.IDX().byEx)[0];L.ui.histEx=id;L.ui.gymDb={lo:5,hi:50};s.settings.gym={u:'lb',stack:10};L.saveNow();`],
    ['an account service, synced, the built app (signed in is read by tests/accounts.js and r56-1b.js, which sign in)', `
      const s=L.state;s.settings.onboarded=true;L.makeDemo();window.IRONLOG_APP=true;
      window.ironlogAuth={user(){return null;},signOut(){return Promise.resolve();},deleteAccount(){return Promise.resolve();}};
      L.cloud.on=true;L.cloud.status='synced';L.cloud.last=Date.now()-5*60000;L.saveNow();`]
  ];
  /* Settings' Weekly set targets changed on purpose in r58 (339 e: a muscle tracked only offers Set a
     target, one given a target can go back, and the section's how-text says so), held by tests/r58.js
     section 9; that section is left out of both pages here, its elements and its text, and the rest of
     Settings is still held to r56.2. */
  const heldOut = shot => {
    const i = shot.tree.findIndex(t => t.includes('data-mkey="bands"'));
    if (i < 0) return shot;
    const next = (shot.tree[i + 1] || '').match(/<span class="sec-t">"([^"]*)"/);
    // A section's text starts with its grip and its title, as the tree orders them.
    const from = shot.text.indexOf('⠿\nWeekly set targets\n'), to = next ? shot.text.indexOf('⠿\n' + next[1] + '\n', from) : -1;
    return { ...shot, tree: shot.tree.map((t, j) => (j === i ? '(Weekly set targets)' : t)), text: from < 0 ? shot.text : shot.text.slice(0, from) + '(Weekly set targets)\n' + (to < 0 ? '' : shot.text.slice(to)) };
  };
  const ENVS = [null, 'preview'];
  for (const [name, seed] of SEEDS) for (const tab of ['settings', 'history']) for (const env of ENVS) {
    if (env && name !== 'demo data, lb') continue;
    const a = heldOut(await shot(OLD, seed, tab, env)), b = heldOut(await shot(FILE, seed, tab, env));
    const d = screenDiff({ tree: a.tree, text: '' }, { tree: b.tree, text: '' });
    const firstDiff = d && { at: d.at, r56_2: d.before, now: d.now };
    ok(!firstDiff, `4. ${tab}, ${name}${env ? ', the preview' : ''}: the same elements, attributes and field values as r56.2`, firstDiff);
    ok(a.text === b.text, `4. ${tab}, ${name}${env ? ', the preview' : ''}: the same visible text as r56.2`, a.text === b.text ? '' : { r56_2: a.text.slice(0, 400), now: b.text.slice(0, 400) });
    ok(!b.errors.length, `4. ${tab}, ${name}${env ? ', the preview' : ''}: no page errors`, b.errors);
  }
  }

  // ---- 5. From the review of r57 (each also passes on r56.2, failed on r57 as first built).
  // 5a. A draw while a finger is dragging a section (a sync bringing another phone's change redraws the
  // page) drops the drag, as r56.2's fresh page did: the section is back where it was drawn, with no
  // ghost left, nothing saved, and later moves save each section once. r57 as first built left the
  // dragged section where the finger had it, outside what lit-html drew, and the next taps saved
  // Effort (RIR) three times in the order.
  for (const tab of ['settings', 'history']) {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00', touch: true });
    const { touchDriver } = require('./h'); const tp = await touchDriver(Q.page);
    const q = (f, a) => Q.page.evaluate(f, a);
    await q(tab => { const L = window.__ironlog; const s = L.state; s.settings.onboarded = true; L.makeDemo();
      s.cardio.push({ id: 'c1', date: '2026-10-20', kind: 'walk', min: 30, hr: null, when: 'solo', note: '', demo: false });
      s.trash = [{ id: 't1', kind: 'cardio', date: '2026-10-22', data: { id: 't1', date: '2026-10-18', kind: 'walk' } }];
      L.saveNow(); L.ui.tab = tab; L.render(); }, tab);
    await wait(300);
    const read = () => q(tab => ({ dom: [...document.querySelectorAll('#view > [data-mkey]')].map(e => e.dataset.mkey), saved: (window.__ironlog.state.settings.secOrder[tab] || []).slice(), ghost: document.querySelectorAll('#view .sortable-ghost,#view .sortable-chosen').length }), tab);
    const before = await read();
    const [a, b] = tab === 'settings' ? ['rir', 'general'] : [before.dom[before.dom.length - 1], before.dom[0]];
    const gb = await Q.page.locator(`#view > [data-mkey="${a}"] .sgrip`).boundingBox();
    const tb = await Q.page.locator(`#view > [data-mkey="${b}"]`).boundingBox();
    const x0 = gb.x + gb.width / 2, y0 = gb.y + gb.height / 2, y1 = tb.y + 5;
    await tp('touchStart', x0, y0); await wait(50);
    for (let k = 1; k <= 14; k++) { await tp('touchMove', x0, y0 + (y1 - y0) * k / 20); await wait(25); }
    await q(() => window.__ironlog.render()); await wait(50);
    // The finger rests where it drops after the redraw, as a finger does (PENDING 346 b; tests/r58.js): SortableJS reads a touch drag every 50 ms.
    await wait(150);
    await tp('touchEnd', x0, y0 + (y1 - y0) * 14 / 20); await wait(500);
    const after = await read();
    ok(after.dom.join() === before.dom.join() && !after.ghost && after.saved.join() === before.saved.join(), `5a. ${tab}: a draw mid-drag puts the section back where it was drawn, with no ghost and nothing saved`, { before, after });
    // Then a move by the arrow keys saves each section once.
    const k0 = after.dom[1];
    await Q.page.locator(`#view > [data-mkey="${k0}"] .sgrip`).focus(); await Q.page.keyboard.press('ArrowUp'); await wait(250);
    const moved = await read();
    ok(new Set(moved.saved).size === moved.saved.length && moved.dom.length === before.dom.length && moved.dom[0] === k0, `5a. ${tab}: a move after it saves and shows each section once`, moved);
    ok(!Q.errors.length, `5a. ${tab}: no page errors`, Q.errors);
    await Q.page.context().close();
  }
  // 5b. An order saved with a section in it twice (by r57 as first built) shows that section once.
  {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const dom = await Q.page.evaluate(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo();
      L.state.settings.secOrder.settings = ['general', 'profile', 'rir', 'timer', 'rir', 'gym', 'rir', 'layout', 'prio', 'bands', 'data', 'help', 'more'];
      L.saveNow(); L.ui.tab = 'settings'; L.render(); return [...document.querySelectorAll('#view > [data-mkey]')].map(e => e.dataset.mkey); });
    ok(dom.join() === 'general,profile,rir,timer,gym,layout,prio,bands,data,help,more', '5b. a saved order with a section twice shows it once, at its first place', dom);
    await Q.page.context().close();
  }
  // 5c. A number typed out of range and confirmed with Enter shows the number saved, at once and after
  // leaving the field, as r56.2 did (r57 as first built kept the typed 150 while 100 was saved). Text
  // that reads as the number saved (or as no number, as a name does) stays as typed.
  {
    const Q = await open(FILE, { browser, clock: '2026-10-24T10:00:00' });
    const q = (f, a) => Q.page.evaluate(f, a);
    await q(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.saveNow(); L.ui.tab = 'settings'; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); });
    await wait(300);
    for (const [name, sel, typed, want] of [['chest max', 'input[data-band="chest"][data-bi="1"]', '150', '100'], ['bar weight', 'input[data-bind="barKg"]', '500', '110'], ['name', 'input[data-bind="userName"]', '  V   x ', '  V   x ']]) {
      const loc = Q.page.locator(sel).first(); await loc.click(); await loc.fill(typed); await loc.press('Enter'); await wait(300);
      const now = await q(sel => document.querySelector(sel).value, sel);
      await Q.page.locator('#view h2').first().click(); await wait(300);
      const left = await q(sel => document.querySelector(sel).value, sel);
      ok(now === want && left === want, `5c. ${name}: ${JSON.stringify(typed)} and Enter shows ${JSON.stringify(want)}, then and after leaving`, { now, left });
    }
    await Q.page.context().close();
  }
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
