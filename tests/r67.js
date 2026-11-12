// r67 (V's list of 2026-11-02 and the hardening placed with it), each section failing on r66
// (`node tests/r67.js baselines/r66.html`) unless it says it is a guard. `R67=1,3` runs some sections.
//   1  NEW-39, the time of a workout logged after it was done: a session whose
//      sets went in far faster than they can be lifted (12 sets in 5 minutes,
//      under a third of what the app's own time model gives them, the bound
//      its pace already uses) is saved untimed, and the recap says so; one
//      lifted at a real pace keeps its clock minutes (a guard); a past
//      workout and an edit from History take the minutes typed, and a
//      session in progress offers no such field.
//   2  NEW-21: the theme switched on a page already drawn (dark to light and
//      back, on each tab with demo data, every section open) leaves every
//      line in the new theme's colour, the same as the page opened fresh in
//      that theme. WebKit (every iPhone browser) kept Stats' section line in
//      the old colour; Chromium never did, so here it is a guard and the
//      WebKit run on GitHub is the evidence.
//   3  NEW-40, a blank session started on Today: the first lift left a set
//      short (two of three ticked, the third row empty), the next lift's sets
//      done; the screen stays at the lift just finished and does not go back
//      up to the earlier one (it did after every lift once one had a set
//      left, since a blank session has nothing below to bring up). A guard:
//      in a routine, a lift finished still brings up the next one below it.
//      From the follow-up review: a past workout typed in last lift first
//      still brings up the first lift not started above it, as r66 did; only
//      a lift started and left is passed over.
//   4  The slight metal shine on Today's main card (V approved the drawing,
//      2026-11-02): the app's card is, pixel for pixel, the card with the
//      approved draft (docs/design/today-card-shine.css) laid over it, light
//      and dark, in all seven accents, so what shipped is what V saw; and
//      r66's card, without it, fails.
//   5  From the independent review of r67 (R67-1): the minutes typed on a
//      past workout stay with it when the sync, not Finish, saves it as a
//      session: the other phone discards it while this one ticks a set
//      (its sets kept), a first sign-in on a new phone with its own workout
//      in progress, and the other phone finishing it while this one typed
//      the minutes and ticked a set (joined). Each saved it untimed, losing
//      the minutes typed (r66 had no field to type them in, so there the
//      check sets them on the workout as the field does).
//   6  From the same review (R67-2): a session lifted at a real pace whose
//      sets are mostly drop sets keeps its clock minutes. A drop is done
//      straight after its set with no rest of its own (r66), so the time
//      model reads it with that set; read as a full set and a full rest,
//      3 lifts of a top set and 3 drops at 3 minutes' rest made 54 minutes
//      and an honest 17 was saved untimed.
const { open, engine, tab } = require('./h');
let browser;
const FILE = process.argv[2] || process.env.IRONLOG_FILE || 'index.html';
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const ONLY = process.env.R67 ? process.env.R67.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const LB = 0.45359237;
const MON = '2026-11-02';
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

async function phone(start, o = {}) {
  const setup = async ctx => { await ctx.addInitScript(`(()=>{const R=Date;let off=new R(${JSON.stringify(start + 'T09:00:00')}).getTime()-R.now();window.__setClock=t=>{off=new R(t).getTime()-R.now();};class D extends R{constructor(...a){if(a.length)super(...a);else super(R.now()+off);}static now(){return R.now()+off;}}window.Date=D;})()`);  if (o.setup) await ctx.addInitScript(o.setup); };
  const P = o.P ? { ...o.P, page: await o.P.ctx.newPage(), errors: [] } : await open(o.file || FILE, { browser, setup, w: o.w || 390, h: o.h || 844 });
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
  const items = o.items || [{ uid: 'u1', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 5 * LB, ss: null }, { uid: 'u2', exId: 'ohp', sets: 2, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 5 * LB, ss: null }];
  S.routines = [{ id: 'R1', name: 'Mine', schedule: 'weekly', days: [{ id: 'D1', name: 'Push', items }] }]; S.activeRoutineId = 'R1';
  S.sessions = (o.sessions || []);
  L.state = L.normalize(S); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
}, o);

const finish = async H => {
  await H.page.click('#view [data-act="finish"]');
  for (let k = 0; k < 6; k++) { await wait(150); const q = await H.modal(); if (!q || q.kind !== 'confirm') break; await H.page.click(/sets not done/.test(q.title) ? '#modal [data-act="mOk"]' : '#modal [data-act="mAlt"]'); }
  await wait(150);
  const m = await H.modal();
  await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
  return m ? m.text : '';
};
// Every set of the session in progress ticked at its shown numbers, as a lifter entering them does: through act, the
// one way the app changes the log, so the ticks start the workout's clock as a tap's do (NEW-129).
const tickAll = H => H.ev(() => { const L = window.__ironlog; L.act(() => { for (const b of L.state.draft.ex) for (const s of b.sets) { s.w = s.w == null ? 100 * 0.45359237 : s.w; s.r = s.r || 8; s.done = true; } }, { inProgress: true }); L.render(); });

(async () => {
  browser = await engine.launch();

  // ---- 1. NEW-39: the time of a workout logged after it was done.
  if (run(1)) {
    const items = [['bench', 4], ['ohp', 4], ['cableRow', 4]].map(([exId, sets], i) => ({ uid: 'u' + i, exId, sets, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 5 * LB, ss: null }));
    const cases = [
      { name: '12 sets entered in 5 minutes', min: 5, want: null },
      { name: '12 sets lifted over 52 minutes (a guard)', min: 52, want: 52 }
    ];
    for (const c of cases) {
      const H = await phone(MON);
      await seed(H, { items });
      await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
      const field = await H.page.$('#view input[data-bind="draftMin"]');
      if (c.want == null) ok(!field, '1. a session in progress offers no minutes field (its clock times it)');
      await tickAll(H);
      // The phone's clock moved on by the minutes the session took.
      await H.ev(m => { window.__setClock(window.__ironlog.state.draft.startedAt + m * 60000); }, c.min);
      const recap = await finish(H);
      const got = await H.ev(() => window.__ironlog.state.sessions[0].durMin);
      ok(got === c.want, `1. ${c.name}: saved ${c.want == null ? 'untimed' : c.want + ' minutes'}`, { got });
      if (c.want == null) ok(/Not timed/.test(recap) && !/\b5 minutes\b/.test(recap), '1. ... and the recap says it was not timed, not 5 minutes', recap.slice(0, 400));
      await H.P.ctx.close();
    }
    // A past workout takes the minutes typed; an edit from History shows them and takes a change.
    const H = await phone(MON);
    await seed(H, { items });
    await H.ev(() => window.__ironlog.ACT.pastOpen({ dataset: {} })); await wait(200);
    await H.page.click('#modal [data-act="pastGo"]:not([data-day="free"])'); await wait(250);
    const mf = '#view input[data-bind="draftMin"]';
    ok(!!(await H.page.$(mf)), '1. a past workout offers a minutes field beside its date');
    if (await H.page.$(mf)) { await H.page.fill(mf, '55'); await H.ev(() => document.activeElement && document.activeElement.blur()); await wait(150); }
    await tickAll(H);
    await finish(H);
    const s1 = await H.ev(() => { const s = window.__ironlog.state.sessions[0]; return s && { id: s.id, durMin: s.durMin }; });
    ok(s1 && s1.durMin === 55, '1. ... and is saved with the 55 minutes typed', s1);
    await H.ev(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), s1 && s1.id); await wait(250);
    const shown = await H.ev(() => { const f = document.querySelector('#view input[data-bind="draftMin"]'); return f ? f.value : null; });
    ok(shown === '55', '1. an edit from History shows the minutes saved', shown);
    if (shown != null) { await H.page.fill(mf, '62'); await H.ev(() => document.activeElement && document.activeElement.blur()); await wait(150); }
    await finish(H);
    ok((await H.ev(() => window.__ironlog.state.sessions[0].durMin)) === 62, '1. ... and saves a change to 62');
    // A number past what a workout takes is refused, with the field put back.
    await H.ev(id => window.__ironlog.ACT.histEdit({ dataset: { id } }), s1 && s1.id); await wait(250);
    if (await H.page.$(mf)) { await H.page.fill(mf, '5000'); await H.ev(() => document.activeElement && document.activeElement.blur()); await wait(150); }
    const back = await H.ev(() => ({ v: (document.querySelector('#view input[data-bind="draftMin"]') || {}).value, d: window.__ironlog.state.draft && window.__ironlog.state.draft.durMin }));
    ok(back.v === '62' && back.d === 62, '1. 5000 minutes is refused and 62 stays', back);
    await H.ev(() => { const L = window.__ironlog; L.ACT.discard(); }); await wait(150);
    await H.ev(() => { const m = document.querySelector('#modal [data-act="mOk"]'); if (m) m.click(); }); await wait(150);
    ok(!H.P.errors.length, '1. no page errors', H.P.errors);
    await H.P.ctx.close();
  }

  // ---- 2. NEW-21: every line in the new theme's colour after switching on a drawn page.
  if (run(2)) {
    // Each line drawn: the element (its tag, id and classes, and those of two ancestors), the side and the colour, sorted; a section's line drawn by its summary's ::before is read as well.
    const lines = H => H.ev(() => {
      const name = e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].filter(c => !/^u-|^on$|^open$|^done$/.test(c)).map(c => '.' + c).join('');
      const path = e => [e, e.parentElement, e.parentElement && e.parentElement.parentElement].filter(Boolean).map(name).reverse().join('>');
      const out = [];
      for (const e of document.querySelectorAll('#view *')) {
        if (!e.getClientRects().length) continue;
        const cs = getComputedStyle(e);
        for (const side of ['Top', 'Right', 'Bottom', 'Left'])
          if (parseFloat(cs['border' + side + 'Width']) > 0 && cs['border' + side + 'Style'] !== 'none') out.push(path(e) + ' ' + side + ' ' + cs['border' + side + 'Color']);
        const b = getComputedStyle(e, '::before');
        if (b.content && b.content !== 'none' && b.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(b.height) <= 2) out.push(path(e) + ' ::before ' + b.backgroundColor);
      }
      return out.sort();
    });
    const draw = (H, tab) => H.ev(tab => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = tab; L.render(); document.querySelectorAll('#view details').forEach(d => { d.open = true; }); }, tab);
    const off = [];
    for (const [from, to] of [['dark', 'light'], ['light', 'dark']]) for (const tab of ['dash', 'today', 'program', 'history', 'settings']) {
      const setup = (H, th) => H.ev(th => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.theme = th; L.saveNow(); L.render(); }, th);
      const A = await phone(MON); await setup(A, from); await draw(A, tab); await wait(300);
      // Switched as Settings switches it (its Theme field calls this with the value picked), the page drawn again after.
      await A.ev(to => { const L = window.__ironlog; L.state.settings.theme = to; L.saveNow(); L.render(); }, to); await wait(150);
      await draw(A, tab); await wait(400);
      const got = await lines(A);
      const B = await phone(MON); await setup(B, to); await draw(B, tab); await wait(400);
      const want = await lines(B);
      const g = new Map(), w = new Map();
      for (const x of got) g.set(x, (g.get(x) || 0) + 1);
      for (const x of want) w.set(x, (w.get(x) || 0) + 1);
      const stale = [...g.keys()].filter(k => (g.get(k) || 0) > (w.get(k) || 0));
      if (stale.length) off.push({ from, to, tab, stale: stale.slice(0, 4), n: stale.length });
      await A.P.ctx.close(); await B.P.ctx.close();
    }
    ok(!off.length, '2. after switching the theme on a drawn page, every line on every tab is the new theme\'s, as on the page opened fresh in it', off);
  }

  // ---- 3. NEW-40: a lift finished never takes the screen back up to an earlier one.
  if (run(3)) {
    // As a lifter does it: a set's load and reps typed, then its checkmark tapped.
    const typeSet = async (H, b, s, w, r) => {
      if (w != null) { await H.page.click(`#view input[data-f="w"][data-b="${b}"][data-s="${s}"]`); await H.page.keyboard.type(String(w)); }
      await H.page.click(`#view input[data-f="r"][data-b="${b}"][data-s="${s}"]`); await H.page.keyboard.type(String(r));
      await H.ev(() => document.activeElement && document.activeElement.blur()); await wait(200);
      await H.page.click(`#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`);
    };
    const closeSheet = async H => { await wait(250); await H.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await wait(100); };
    const add = async (H, q) => {
      // A blank session opens the picker as it starts; later ones come from + Add exercise.
      if ((await H.ev(() => { const m = window.__ironlog.ui.modal; return m && m.kind; })) !== 'picker') { await H.page.click('#view [data-act="pickSession"]'); await wait(250); }
      await H.page.fill('#pickQ', q); await wait(250);
      await H.page.click('#modal [data-act="pickDo"]'); await closeSheet(H);
    };
    const H = await phone(MON, { h: 664 });
    await H.ev(() => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.unit = 'lb'; S.settings.autoDone = false; L.saveNow(); L.ui.tab = 'today'; L.render(); });
    await H.ev(() => window.__ironlog.ACT.startFree()); await wait(300);
    const lifts = ['bench press', 'lat pulldown', 'shoulder press'];
    const moved = [];
    for (let k = 0; k < lifts.length; k++) {
      await add(H, lifts[k]);
      const n = await H.ev(k => window.__ironlog.state.draft.ex[k].sets.length, k);
      // The first lift is left a set short: its last row stays empty.
      const doN = k === 0 ? n - 1 : n;
      let y0 = 0;
      for (let s = 0; s < doN; s++) {
        await typeSet(H, k, s, s === 0 ? 100 : null, 10);
        y0 = await H.ev(() => window.scrollY);
        await closeSheet(H);
      }
      await wait(2600);
      const y1 = await H.ev(() => window.scrollY);
      const at = await H.ev(() => ({ first: Math.round(document.getElementById('blk-0').getBoundingClientRect().top), end: Math.round(document.documentElement.scrollHeight - innerHeight) }));
      if (k > 0) moved.push({ lift: k, before: Math.round(y0), after: Math.round(y1), ...at });
    }
    const d = await H.draft();
    ok(d.ex.length === 3 && d.ex[0].sets.filter(x => x.done).length === d.ex[0].sets.length - 1 && d.ex.slice(1).every(b => b.sets.every(x => x.done)), '3. the blank session holds the first lift a set short and the next two done', d.ex.map(b => b.sets.map(x => x.done)));
    // A lift folding at the page's end shortens it, so there the screen can only move up by what folded.
    ok(moved.length === 2 && moved.every(m => (m.after >= m.before - 40 || m.after >= m.end - 2) && !(m.first >= -2 && m.first < 140)), '3. finishing each later lift leaves the screen where it was, not back up at the first', moved);
    ok(!H.P.errors.length, '3. no page errors', H.P.errors);
    await H.P.ctx.close();

    // A guard: in a routine, a lift finished brings up the next one below it, as before.
    const G = await phone(MON, { h: 664 });
    const items = ['bench', 'ohp', 'cableRow', 'latPulldown'].map((exId, i) => ({ uid: 'g' + i, exId, sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 120, inc: 5 * LB, ss: null }));
    await seed(G, { items });
    await G.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(200);
    for (let s = 0; s < 3; s++) { await typeSet(G, 0, s, s === 0 ? 100 : null, 8); await closeSheet(G); }
    await wait(2600);
    const top1 = await G.ev(() => { const e = document.getElementById('blk-1'); return e ? Math.round(e.getBoundingClientRect().top) : null; });
    ok(top1 != null && top1 >= -2 && top1 < 140, '3. (a guard) in a routine, the first lift finished brings the second up to the top of the screen', { top1 });
    await G.P.ctx.close();

    // A past workout typed in last lift first (no first tick moves a lift up in one): the first lift, not started, comes up.
    const Q = await phone(MON, { h: 664 });
    const pItems = ['bench', 'ohp', 'cableRow'].map((exId, i) => ({ uid: 'q' + i, exId, sets: 2, repMin: 6, repMax: 10, rir: 2, rest: 90, inc: 5 * LB, ss: null }));
    await seed(Q, { items: pItems });
    await Q.ev(() => window.__ironlog.ACT.pastOpen({ dataset: {} })); await wait(250);
    await Q.page.click('#modal [data-act="pastGo"]:not([data-day="free"])'); await wait(300);
    await Q.ev(() => { const L = window.__ironlog; L.state.draft._rampAsked = true; L.saveNow(); });
    for (let s = 0; s < 2; s++) { await typeSet(Q, 2, s, s === 0 ? 120 : null, 10); await closeSheet(Q); }
    await wait(2600);
    const up = await Q.ev(() => ({ first: Math.round(document.getElementById('blk-0').getBoundingClientRect().top), done: window.__ironlog.state.draft.ex.map(b => b.sets.filter(x => x.done).length) }));
    ok(up.done.join() === '0,0,2' && up.first >= -2 && up.first < 140, '3. a past workout typed in last lift first: finishing it brings up the first lift, not started yet', up);
    await Q.P.ctx.close();
  }

  // ---- 4. The shine on Today's main card is the drawing V approved, in every theme and accent.
  if (run(4)) {
    const draftCss = require('fs').readFileSync(require('path').join(__dirname, '..', 'docs', 'design', 'today-card-shine.css'), 'utf8');
    // The ring's fill is the only motion on the card; it is stopped so two pictures of one card can be compared.
    const still = '*,*::before,*::after{transition:none!important;animation:none!important}';
    const card = async (theme, accent, css) => {
      const P = await open(FILE, { browser, w: 390, h: 844, dpr: 3, dark: theme === 'dark', clock: '2026-11-02T09:00:00' });
      await P.page.evaluate(([t, a]) => { const L = window.__ironlog; L.state.settings.onboarded = true; L.makeDemo(); L.state.settings.theme = t; L.state.settings.accent = a; L.ui.tab = 'today'; L.render(); }, [theme, accent]);
      await P.page.addStyleTag({ content: still });
      if (css) await P.page.addStyleTag({ content: css });
      await P.page.waitForTimeout(400);
      const box = await (await P.page.$('#view .hero')).boundingBox();
      const png = await P.page.screenshot({ clip: { x: 0, y: Math.max(0, box.y - 12), width: 390, height: box.height + 24 } });
      await P.ctx.close();
      return png;
    };
    const off = [];
    for (const theme of ['light', 'dark']) for (const a of ['ember', 'volt', 'blue', 'pink', 'violet', 'cyan', 'red']) {
      const app = await card(theme, a, null), approved = await card(theme, a, draftCss);
      if (!app.equals(approved)) off.push(theme + ' ' + a);
    }
    ok(!off.length, '4. Today\'s main card is, pixel for pixel, the approved shine, light and dark in all 7 accents', off);
  }

  // ---- 5. R67-1: a past workout's typed minutes kept when the sync saves it.
  if (run(5)) {
    const CLOCK = '2026-10-21T10:00:00';
    // A stand-in account (Claude's db, as tests/storage-sync.js uses it) that every phone signed in as one lifter shares.
    const cloudOf = () => {
      const store = new Map();
      const setup = uid => async (ctx, page) => {
        await page.exposeFunction('__dbGet', p => (store.has(p) ? store.get(p) : null));
        await page.exposeFunction('__dbSet', (p, v) => { store.set(p, v); return true; });
        await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
        await page.addInitScript(u => {
          window.__uid = u;
          window.claude = { use: async k => {
            if (k === 'user') return { id: async () => window.__uid };
            if (k === 'db') return { doc: p => ({ get: async () => { const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); return true; } }), collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
            return null;
          } };
        }, uid);
      };
      return { setup };
    };
    const acct = async (cloud, opts = {}) => {
      const P = await open(FILE, { browser, clock: CLOCK, realStarter: true, setup: cloud.setup('u1'), ...opts });
      P.ev = (f, a) => P.page.evaluate(f, a);
      await P.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
      P.flush = async () => { await P.ev(() => window.__ironlog.flush()); await wait(150); };
      P.tick = (i, w, r) => P.ev(([i, w, r]) => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[i]; s.w = w; s.r = r; s.done = true; L.saveNow(); }, [i, w, r]);
      P.draft = () => P.ev(() => { const d = window.__ironlog.state.draft; return d ? { id: d.id, past: !!d.past, durMin: d.durMin } : null; });
      P.sess = id => P.ev(id => { const s = window.__ironlog.state.sessions.find(x => x.id === id); return s ? { durMin: s.durMin, sets: s.ex.reduce((a, b) => a + b.sets.length, 0) } : null; }, id);
      return P;
    };
    // Log a past workout, its first day, one lift; minutes typed in its field (on r66, which has none, set on the workout as the field sets them).
    const past = async P => {
      await P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ui.tab = 'today'; L.render(); L.ACT.pastOpen({ dataset: {} }); }); await wait(250);
      await P.page.click('#modal [data-act="pastGo"]:not([data-day="free"])'); await wait(300);
      await P.ev(() => { const L = window.__ironlog; const d = L.state.draft; d._rampAsked = true; d.ex = d.ex.slice(0, 1); L.saveNow(); L.render(); });
    };
    const typeMin = async (P, m) => {
      if (await P.page.$('#view input[data-bind="draftMin"]')) { await P.page.fill('#view input[data-bind="draftMin"]', String(m)); await P.ev(() => document.activeElement && document.activeElement.blur()); await wait(150); }
      else await P.ev(m => { const L = window.__ironlog; L.state.draft.durMin = m; L.saveNow(); }, m);
    };
    {
      const cloud = cloudOf();
      const A = await acct(cloud); await wait(900);
      await past(A); await typeMin(A, 55);
      await A.tick(0, 100, 8); await A.flush();
      const B = await acct(cloud); await wait(1200);
      const id = (await A.draft()).id;
      await B.ev(() => window.__ironlog.ACT.discard()); await wait(200);
      await B.page.click('#modal [data-act="mOk"]'); await wait(200); await B.flush();
      await A.tick(1, 100, 7); await A.flush(); await wait(1600); await A.flush();
      const s = await A.sess(id);
      ok(s && s.sets === 2 && s.durMin === 55, '5. discarded on the other phone while this one ticked a set: its sets are saved with the 55 minutes typed', s);
      await A.ctx.close(); await B.ctx.close();
    }
    {
      const cloud = cloudOf();
      const A = await acct(cloud); await wait(900);
      await past(A); await typeMin(A, 48);
      await A.tick(0, 100, 8); await A.flush();
      const id = (await A.draft()).id;
      const N = await acct(cloud, { state: { settings: { onboarded: true }, sessions: [], draft: null } }); await wait(300);
      // N's first pull above may already hold the account's workout; since 2.35 a start opens one in progress instead
      // of replacing it unasked (NEW-89), so the setup takes that pulled copy off N first, as before 2.35 the start did.
      await N.ev(() => { const L = window.__ironlog; L.cloudStop(true); L.state.draft = null; L.saveNow(); });
      await N.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.slice(0, 1); d._rampAsked = true; L.saveNow(); });
      await N.tick(0, 40, 15);
      await N.ev(() => window.__ironlog.cloudInit()); await wait(1500);
      const s = await N.sess(id);
      ok(s && s.durMin === 48, '5. a first sign-in on a phone with its own workout: the account\'s past workout is saved with the 48 minutes typed', s);
      await N.flush(); await wait(300); await A.ev(() => window.__ironlog.sync()); await wait(1700);
      const as = await A.sess(id), ad = await A.draft();
      ok((as && as.durMin === 48) || (ad && ad.id === id && ad.durMin === 48), '5. ... and the phone it was typed on still holds them', { as, ad });
      await A.ctx.close(); await N.ctx.close();
    }
    {
      const cloud = cloudOf();
      const A = await acct(cloud); await wait(900);
      await past(A);
      await A.tick(0, 100, 8); await A.flush();
      const B = await acct(cloud); await wait(1200);
      const id = (await A.draft()).id;
      await typeMin(A, 61);
      await A.tick(1, 100, 7);
      await B.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
      await B.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await B.flush();
      await A.flush(); await wait(1600); await A.flush();
      const s = await A.sess(id);
      ok(s && s.sets === 2 && s.durMin === 61, '5. finished on the other phone while this one typed 61 minutes and ticked a set: the joined session has both', s);
      await A.ctx.close(); await B.ctx.close();
    }
  }

  // ---- 6. R67-2: an honest session of drop sets keeps its clock minutes.
  if (run(6)) {
    const H = await phone(MON);
    const items = ['bench', 'ohp', 'cableRow'].map((exId, i) => ({ uid: 'u' + i, exId, sets: 4, repMin: 6, repMax: 10, rir: 2, rest: 180, inc: 5 * LB, ss: null }));
    await seed(H, { items });
    await H.page.click('#view .hero [data-act="startSession"]:not([data-light="1"])'); await wait(150);
    // Each lift: a top set, then three drops, every one ticked.
    // Through act, as tickAll above, so the ticks start the workout's clock (NEW-129).
    await H.ev(() => { const L = window.__ironlog; L.act(() => { for (const b of L.state.draft.ex) b.sets.forEach((s, i) => { s.w = (100 - i * 15) * 0.45359237; s.r = 8; s.rir = 0; s.drop = i > 0; s.done = true; }); }, { inProgress: true }); L.render(); });
    await H.ev(m => { window.__setClock(window.__ironlog.state.draft.startedAt + m * 60000); }, 17);
    const recap = await finish(H);
    const s = await H.ev(() => { const s = window.__ironlog.state.sessions[0]; return s && { durMin: s.durMin, drops: s.ex.reduce((a, b) => a + b.sets.filter(x => x.drop).length, 0) }; });
    ok(s && s.drops === 9 && s.durMin === 17, '6. 3 lifts of a top set and 3 drops, lifted in 17 minutes at 3 minutes\' rest, are saved as 17 minutes', s);
    ok(/17 minutes/.test(recap) && !/Not timed/.test(recap), '6. ... and the recap says 17 minutes', recap.slice(0, 300));
    await H.P.ctx.close();
  }

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.log('FAIL crashed:', e.stack); try { await browser.close(); } catch (x) { /* closed already */ } process.exit(1); });
