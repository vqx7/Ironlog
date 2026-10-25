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
  // Seeds a log in the page (by a script, so both builds take the same one) and reads one tab, every section open.
  const shot = async (file, seed, tab, env) => {
    const Q = await open(file, { browser, clock: '2026-10-24T10:00:00' });
    if (env) { await Q.page.context().addInitScript(`window.IRONLOG_ENV=${JSON.stringify(env)};`); await Q.page.reload(); await wait(300); }
    const out = await Q.page.evaluate(async ([seed, tab]) => {
      const L = window.__ironlog;
      (new Function('L', seed))(L);
      L.ui.tab = tab; L.render(); await new Promise(r => setTimeout(r, 120));
      document.querySelectorAll('#view details').forEach(d => { d.open = true; });
      await new Promise(r => setTimeout(r, 120));
      const view = document.getElementById('view');
      // Field state is a property, not markup: written on each element as an attribute to compare.
      for (const el of view.querySelectorAll('input,select,textarea,option,details')) {
        if ('value' in el && el.tagName !== 'DETAILS' && el.tagName !== 'OPTION' && el.type !== 'file') el.setAttribute('p-value', el.value);
        if (el.type === 'checkbox') el.setAttribute('p-checked', String(el.checked));
        if (el.tagName === 'OPTION') el.setAttribute('p-selected', String(el.selected));
        if (el.tagName === 'DETAILS') el.setAttribute('p-open', String(el.open));
        if ('disabled' in el) el.setAttribute('p-disabled', String(el.disabled));
      }
      const byId = id => { const e = document.getElementById(id); return e ? e.textContent.trim() : '?'; };
      // Record ids are made at random by each page's demo data, so each stands for its place in the order first met.
      const ids = new Map(); const idOf = v => { if (!ids.has(v)) ids.set(v, '#' + ids.size); return ids.get(v); };
      // Text split by lit-html's markers is one text, as the old page's was; a class is its set of names.
      const kidsOf = n => { const out = []; let txt = '';
        const flush = () => { const t = txt.replace(/\s+/g, ' ').trim(); if (t) out.push(JSON.stringify(t)); txt = ''; };
        for (const c of n.childNodes) { if (c.nodeType === 3) txt += c.textContent; else if (c.nodeType === 1) { flush(); out.push(walk(c)); } }
        flush(); return out; };
      const walk = n => {
        const at = [...n.attributes].filter(a => !['value', 'checked', 'selected', 'open', 'disabled'].includes(a.name) && !(a.name === 'class' && !a.value.trim()) && !(a.name === 'id' && /^lt/.test(a.value)))
          .map(a => a.name === 'aria-labelledby' ? `${a.name}=>${byId(a.value)}` : a.name === 'class' ? `class=${JSON.stringify(a.value.trim().split(/\s+/).sort().join(' '))}` : a.name === 'data-id' ? `data-id=${idOf(a.value)}` : `${a.name}=${JSON.stringify(a.value)}`).sort();
        return `<${n.tagName.toLowerCase()}${at.length ? ' ' + at.join(' ') : ''}>${kidsOf(n).join('')}</${n.tagName.toLowerCase()}>`;
      };
      // The build's own version line differs by design between the two builds.
      const ver = t => t.replace(/\d+\.\d+ \(build \d{4}\.\d{2}\.\d{2}-r[\d.]+\)/gi, 'VERSION');
      return { tree: kidsOf(view).map(ver), text: ver(view.innerText.replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()) };
    }, [seed, tab]);
    out.errors = Q.errors.slice();
    await Q.page.context().close();
    return out;
  };
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
  const ENVS = [null, 'preview'];
  for (const [name, seed] of SEEDS) for (const tab of ['settings', 'history']) for (const env of ENVS) {
    if (env && name !== 'demo data, lb') continue;
    const a = await shot(OLD, seed, tab, env), b = await shot(FILE, seed, tab, env);
    const firstDiff = (() => { const n = Math.max(a.tree.length, b.tree.length); for (let i = 0; i < n; i++) if (a.tree[i] !== b.tree[i]) { const x = a.tree[i] || '', y = b.tree[i] || ''; let j = 0; while (j < x.length && x[j] === y[j]) j++; return { at: i, r56_2: x.slice(Math.max(0, j - 160), j + 200), now: y.slice(Math.max(0, j - 160), j + 200) }; } return null; })();
    ok(!firstDiff, `4. ${tab}, ${name}${env ? ', the preview' : ''}: the same elements, attributes and field values as r56.2`, firstDiff);
    ok(a.text === b.text, `4. ${tab}, ${name}${env ? ', the preview' : ''}: the same visible text as r56.2`, a.text === b.text ? '' : { r56_2: a.text.slice(0, 400), now: b.text.slice(0, 400) });
    ok(!b.errors.length, `4. ${tab}, ${name}${env ? ', the preview' : ''}: no page errors`, b.errors);
  }
  }
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})();
