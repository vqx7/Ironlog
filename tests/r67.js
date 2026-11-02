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
const ONLY = process.env.R67 ? process.env.R67.split(',') : null;
const run = n => !ONLY || ONLY.includes(String(n));
const LB = 0.45359237;
const MON = '2026-11-02';
const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);

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
// Every set of the session in progress ticked at its shown numbers, as a lifter entering them does.
const tickAll = H => H.ev(() => { const L = window.__ironlog; for (const b of L.state.draft.ex) for (const s of b.sets) { s.w = s.w == null ? 100 * 0.45359237 : s.w; s.r = s.r || 8; s.done = true; } L.saveNow(); L.render(); });

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

  await browser.close();
  console.log(fails.length ? `\n${fails.length} FAILED` : '\nALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(async e => { console.log('FAIL crashed:', e.stack); try { await browser.close(); } catch (x) { /* closed already */ } process.exit(1); });
