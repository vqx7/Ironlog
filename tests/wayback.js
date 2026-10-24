// The way back (PENDING 333): reverting a merge on GitHub republishes the
// build before, so a phone that ran this build opens its own storage in the
// older one (one page, its storage kept, reloaded to the other build, as a
// phone reloads to a new version), signed in, with this build's sync notes (the agreed copy of the
// workout kept in the draft's note since r56.1), its row ids on every set
// (`rid`), and a log kept aside for another account. For each older build:
//   (1) everything this build saved is there: every session and set, the
//       workout in progress with its ticked sets, weigh-ins, cardio, a custom
//       exercise, the settings; every tab draws, and nothing errs;
//   (2) it syncs with the account this build left: nothing lost there, and
//       it settles (two rounds write nothing more);
//   (3) a set ticked on the older build, then this build again (the revert
//       undone): the set is there, every row keeps its id, and the log kept
//       aside is still kept.
// `node tests/wayback.js <older page> ...` runs it against other builds
// (default: baselines/r56.html and baselines/r55.html; r55.1's page joins
// them once pull request #49 is merged and its baseline is kept).
const { open, engine } = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 800) : ''); } else console.log('ok  ', m); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const OLDER = process.argv.length > 2 ? process.argv.slice(2) : ['baselines/r56.html', 'baselines/r55.html'];
const CLOCK = '2026-10-21T10:00:00';

// One stand-in cloud: documents by path, shared by every page opened with it, with a count of writes.
function cloudOf() {
  const store = new Map(); let writes = 0; const who = { now: null };
  const setup = uid => async (ctx, page) => {
    await page.exposeFunction('__dbGet', p => (store.has(p) ? store.get(p) : null));
    await page.exposeFunction('__dbSet', (p, v) => { if (store.get(p) !== v) writes++; store.set(p, v); return true; });
    await page.exposeFunction('__dbList', p => JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])));
    // The account signed in survives a reload, as a real sign-in does: the page asks the suite which one it is.
    who.now = uid;
    await page.exposeFunction('__who', () => who.now);
    await page.addInitScript(() => {
      window.claude = { use: async k => {
        if (k === 'user') return { id: async () => window.__who() };
        if (k === 'db') return { doc: p => ({ get: async () => { const v = await window.__dbGet(p); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; }, set: async o => { await window.__dbSet(p, JSON.stringify(o)); return true; } }), collection: p => ({ get: async () => { const l = JSON.parse(await window.__dbList(p)); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } }) };
        return null;
      } };
    });
  };
  const content = () => JSON.stringify([...store.entries()].filter(([k]) => !k.endsWith('/lock')).sort().map(([k, v]) => [k, JSON.parse(v).json]));
  return { store, setup, content, writes: () => writes, signIn: uid => { who.now = uid; } };
}
async function phone(browser, cloud, file, uid) {
  const P = await open(file, { browser, clock: CLOCK, realStarter: true, setup: cloud.setup(uid) });
  P.ev = (f, a) => P.page.evaluate(f, a);
  // The same phone reloaded to another build: its storage (every key, and IndexedDB) stays.
  P.go = async f => { await P.page.goto('file://' + require('path').resolve(f === 'index.html' && process.env.IRONLOG_FILE ? process.env.IRONLOG_FILE : f)); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart && window.__libs.sortable); await wait(1500); };
  P.sync = async () => { await P.ev(() => window.__ironlog.sync()); await wait(150); };
  P.flush = async () => { await P.ev(() => window.__ironlog.flush()); await wait(150); };
  P.settle = async () => { for (let i = 0; i < 2; i++) { await P.flush(); await P.sync(); } };
  P.storage = () => P.ev(() => Object.keys(localStorage).filter(k => k.startsWith('ironlog')).sort().map(k => [k, localStorage.getItem(k)]));
  // What a lifter would miss: each session's sets, the workout in progress, weigh-ins, cardio, custom lifts, the settings typed here.
  P.log = () => P.ev(() => {
    const S = window.__ironlog.state;
    return {
      sessions: S.sessions.map(s => s.id + ':' + s.ex.map(b => b.exId + '=' + b.sets.map(x => `${x.w}x${x.r}@${x.rir}`).join('/')).join(';')).sort(),
      draft: S.draft ? S.draft.id + ':' + S.draft.ex.map(b => b.exId + '=' + b.sets.map(x => (x.done ? `${x.w}x${x.r}` : '-')).join('/')).join(';') : null,
      bw: S.bodyweights.map(b => b.date + '=' + b.kg).sort(), cardio: S.cardio.map(c => c.date + '=' + c.kind + '/' + c.min).sort(),
      custom: S.exercises.filter(e => e.custom).map(e => e.id + '=' + e.name), name: S.settings.userName || null, unit: S.settings.unit, budget: S.settings.timeBudget
    };
  });
  P.rids = () => P.ev(() => { const S = window.__ironlog.state; return [...S.sessions.flatMap(s => s.ex.flatMap(b => b.sets.map(x => x.rid || null))), ...(S.draft ? S.draft.ex.flatMap(b => b.sets.map(x => x.rid || null)) : [])]; });
  return P;
}

(async () => {
  const browser = await engine.launch();
  const pages = [];
  const cloud = cloudOf();

  // ---- This build: a log of another account kept aside, then the lifter's own log on account u1.
  const N = await phone(browser, cloud, 'index.html', 'z1'); pages.push(N);
  await wait(900);
  await N.ev(() => { const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.sessions.push({ id: 's-z1', date: '2026-10-12', dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', notes: '', free: true, ex: [{ exId: 'bench', note: '', rr: null, sets: [{ w: 60, r: 10, rir: 2, warm: false, drop: false }] }] }); L.state = L.normalize(S); L.invalidate(); L.saveNow(); });
  await N.settle();
  await N.ev(() => window.__ironlog.cloudStop()); cloud.signIn('u1');
  N.ev(() => { window.__ironlog.cloudInit(); }); await wait(800);
  await N.page.click('#modal [data-act="mAlt"]'); await wait(1500);
  const kept = await N.ev(() => window.__ironlog.asideList());
  ok(kept.length === 1 && kept[0].acct === 'z1' && (await N.ev(() => window.__ironlog.cloudState().acct)) === 'u1', 'set up: this build keeps account z1\'s log aside and syncs with u1', kept);
  await N.ev(() => {
    const L = window.__ironlog; const S = L.state; S.settings.onboarded = true; S.settings.userName = 'V'; S.settings.timeBudget = 75;
    S.exercises.push({ id: 'c_neck', name: 'Neck bridge', primary: 'traps', secondary: [], equip: 'bodyweight', bw: true, custom: true, archived: false, note: '' });
    S.bodyweights.push({ id: 'bw1', date: '2026-10-20', kg: 84.2 });
    S.cardio.push({ id: 'c1', date: '2026-10-20', kind: 'walk', min: 25, hr: null, when: 'pre', note: '' });
    L.state = L.normalize(S); L.invalidate(); L.saveNow();
    // A workout ticked and finished, so its sets carry row ids, then one in progress with two sets ticked.
    L.ACT.startSession({ dataset: { day: '0', light: '0' } }); let d = L.state.draft; d._rampAsked = true;
    d.ex[0].sets.forEach((s, i) => { s.w = 100; s.r = 8 - i; s.rir = 1; s.done = true; }); d.ex = d.ex.slice(0, 2); d.ex[1].sets.forEach(s => { s.w = 40; s.r = 12; s.done = true; });
    d._leftAsked = true; L.saveNow(); L.ACT.finishNow(); if (L.ui.modal) L.ACT.mClose();
    L.ACT.startSession({ dataset: { day: '1', light: '0' } }); d = L.state.draft; d._rampAsked = true; d.ex = d.ex.slice(0, 1);
    d.ex[0].sets[0].w = 80; d.ex[0].sets[0].r = 10; d.ex[0].sets[0].done = true; d.ex[0].sets[1].w = 80; d.ex[0].sets[1].r = 9; d.ex[0].sets[1].done = true; L.saveNow();
  });
  await N.settle();
  const mine = await N.log(), rids = await N.rids();
  const notes = await N.ev(() => JSON.parse(localStorage.getItem('ironlog.v1.sync') || '{}'));
  ok(mine.sessions.length === 1 && mine.draft && rids.every(r => typeof r === 'string') && notes.meta && notes.meta.draft && notes.meta.draft.b && notes.meta.draft.b.draft, 'set up: a session and a workout in progress with a row id on every set, and the draft\'s note holding the agreed copy', { mine, notes: Object.keys(notes.meta || {}) });

  for (const OLD of OLDER) {
    const tag = OLD.replace(/^.*\//, '').replace(/\.html$/, '');
    await N.go(OLD);
    const want = (require('fs').readFileSync(OLD, 'utf8').match(/name="app-build" content="([^"]+)"/) || [])[1];
    ok(want && (await N.ev(() => (document.querySelector('meta[name="app-build"]') || {}).content)) === want, `${tag}: the phone reloads to the older build (${want})`);
    const o = await N.log();
    ok(JSON.stringify(o) === JSON.stringify(mine), `${tag}: everything this build saved is there (sessions and sets, the workout in progress, weigh-ins, cardio, a custom lift, settings)`, { o, mine });
    let crash = '';
    for (const t of ['today', 'program', 'dash', 'history', 'settings']) if (await N.ev(t => { const L = window.__ironlog; L.ui.tab = t; L.render(); document.querySelectorAll('details').forEach(d => { d.open = true; }); return document.body.innerText.includes('Something broke'); }, t)) crash += t + ' ';
    ok(!crash, `${tag}: every tab draws`, crash);
    await N.settle();
    ok(JSON.stringify(await N.log()) === JSON.stringify(mine) && (await N.ev(() => window.__ironlog.cloudState().status)) === 'synced', `${tag}: it syncs with the account this build left, nothing lost`, { log: await N.log(), status: await N.ev(() => window.__ironlog.cloudState()) });
    const w1 = cloud.writes(); await N.settle();
    ok(cloud.writes() === w1, `${tag}: and settles: two more rounds write nothing`, { writes: cloud.writes() - w1 });
    // A set ticked on the older build, then this build again on the same storage (the revert undone).
    await N.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[2]; s.w = 80; s.r = 8; s.done = true; L.saveNow(); });
    await N.settle();
    await N.go('index.html'); await N.settle();
    const n2 = await N.log();
    ok(n2.draft === mine.draft.replace(/=80x10\/80x9\/-/, '=80x10/80x9/80x8') && JSON.stringify({ ...n2, draft: null }) === JSON.stringify({ ...mine, draft: null }), `${tag}, then this build again: the set ticked on ${tag} is there, and nothing else changed`, { n2: n2.draft, mine: mine.draft });
    const r2 = await N.rids();
    ok(r2.length === rids.length && r2.join() === rids.join(), `${tag}, then this build again: every row keeps its id`, { r2, rids });
    const k2 = await N.ev(() => window.__ironlog.asideList());
    ok(k2.length === 1 && k2[0].acct === 'z1' && k2[0].sessions === 1, `${tag}, then this build again: the log kept aside for z1 is still kept`, k2);
    // The set taken back off, so the next older build starts from the log as set up.
    await N.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[2]; s.done = false; s.w = null; s.r = null; L.saveNow(); });
    await N.settle();
    ok(JSON.stringify(await N.log()) === JSON.stringify(mine), `${tag}: set back as it was for the next build`, await N.log());
  }

  const errors = pages.flatMap(P => P.errors);
  ok(!errors.length, 'no page errors', errors.slice(0, 4));
  await browser.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
