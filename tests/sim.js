// Phones of the app in Node, for the suites that check the sync on whole histories (tests/rows.js): the typed modules
// of a checkout (sync, storage, act, normalize, rows and what they import), bundled as the page's script is, each
// phone with a storage, a clock, timers and random numbers of its own, against one stand-in account. No browser and
// no screen: the lifter's changes go through `act` (the one way the app changes the log) and the sync's own
// cloudPull and cloudFlush do the rest. The account's documents are a map written only over the copy read, as the
// account's own conditional write is; the account's rows are the SQL of SUPABASE.md itself, on PGlite (rowsdb.js).
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const bundles = new Map();
/** The modules of the checkout at `dir`, as one script that exports what a phone needs. A build before the rows (2.77 and older) has no rows module. */
function bundleOf(dir) {
  if (!bundles.has(dir)) {
    const app = path.join(dir, 'src', 'app');
    const has = f => fs.existsSync(path.join(app, f + '.ts'));
    const built = esbuild.buildSync({
      stdin: {
        contents: [
          "export { cloudPull, cloudFlush, cq, saveNow, syncStart, cloudStop, hasUnsent } from './sync';",
          "export { state, setState, cloud, setFx } from './store';",
          "export { device, load, logBuf, KEY } from './storage';",
          "export { act, undoStep, toTrash } from './act';",
          "export { normalize } from './normalize';",
          "export { chunksOf } from './chunks';",
          "export { canon } from './merge';",
          "export { draftSession } from './session';",
          "export { DISPLAY_VERSION } from './config';",
          has('rows') ? "export { rowsBusy, rowsDiag, ROWS_UPDATE } from './rows';" : ''
        ].join('\n'),
        resolveDir: app, loader: 'ts', sourcefile: 'sim-entry.ts'
      },
      // A checkout unpacked outside the repo (an older build's source) finds the packages in this repo's.
      nodePaths: [path.join(__dirname, '..', 'node_modules')],
      bundle: true, format: 'cjs', platform: 'node', write: false, logLevel: 'silent', banner: { js: '"use strict";' }
    });
    bundles.set(dir, built.outputFiles[0].text);
  }
  return bundles.get(dir);
}
/** Random numbers from a seed, the same on every run. */
function rng(seed) { let x = (seed >>> 0) || 1; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); }
/** A request that got no answer, as the sync reads one. */
const dropped = () => Object.assign(new Error('offline'), { code: 'unavailable' });

/* The stand-in account. Documents by path, written only over the copy read, each write noted. `o.rows`: { R, table,
   name } gives the account rows, on the database `R` (rowsdb.js) as the account named `name`; { missing: true } an
   account whose rows' SQL was never run (every call answers null, as the backend does); absent, a backend that
   knows no rows at all. Every request of phone `who` passes its `net`, before and after the account applies it. */
function accountOf(o = {}) {
  const store = new Map(), writes = [], calls = [];
  const rowsFor = (who, net) => {
    if (!o.rows) return undefined;
    const call = async (name, args) => {
      await net('rows-' + name, 'before');
      calls.push({ who, name, n: name === 'push' ? args[0].length : 0, keys: name === 'push' ? args[0].map(r => r.kind + '/' + r.id) : [] });
      const r = o.rows.missing ? null : await o.rows.R.call(o.rows.name, o.rows.table || 'records', name, args);
      await net('rows-' + name, 'after');
      return r;
    };
    return { push: (rows, top) => call('push', [rows, top]), pull: (since, most) => call('pull', [since, most]), digest: () => call('digest', []), list: (since, most) => call('list', [since, most]) };
  };
  const dbFor = (who, net) => ({
    rows: rowsFor(who, net),
    doc: p => ({
      async get() { await net('get', 'before'); const v = store.get(p); await net('get', 'after'); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; },
      async setIf(doc, seen) {
        await net('set', 'before');
        const now = store.has(p) ? JSON.parse(store.get(p)) : null;
        const still = !seen ? !now : !now ? false : 'w' in seen ? now.w === seen.w : now.w === undefined && (now.at === undefined ? null : Number(now.at)) === seen.at;
        if (still) { store.set(p, JSON.stringify(doc)); writes.push({ who, p }); }
        await net('set', 'after');
        return still;
      }
    }),
    collection: p => ({ async get() { await net('list', 'before'); const docs = [...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => ({ id: k.slice(p.length + 1), exists: true, data: () => JSON.parse(v) })); await net('list', 'after'); return { docs }; } })
  });
  /** The account's documents of user `uid` as the logs they hold, by document id. */
  const all = uid => Object.fromEntries([...store.entries()].filter(([k]) => k.startsWith(`data/users/${uid}/`)).map(([k, v]) => { const d = JSON.parse(v); return [k.slice(`data/users/${uid}/`.length), typeof d.json === 'string' ? JSON.parse(d.json) : d]; }));
  /** The account's rows, as the database's owner reads them. */
  const rows = async () => (o.rows && !o.rows.missing ? o.rows.R.rows(o.rows.name, o.rows.table || 'records') : []);
  return { store, writes, calls, dbFor, all, rows, has: !!o.rows };
}

/* A phone: `dir` its build, `o.clock` { t } its clock in ms (shared between phones for one clock), `o.skew` what its
   own clock is off by, `o.storage` a Map kept across an update (the same storage opened by another build), `o.seed`
   its random numbers. */
function phoneOf(dir, o = {}) {
  const ls = o.storage || new Map();
  const clock = o.clock || { t: Date.UTC(2026, 10, 11, 10) };
  const P = { name: o.name || 'phone', dir, ls, clock, skew: o.skew || 0, toasts: [], off: false, drop: null, hook: null };
  const now = () => clock.t + P.skew;
  const timers = new Map(); let tid = 0;
  const listeners = { storage: [], visibilitychange: [], pagehide: [], online: [], offline: [] };
  const localStorage = {
    getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { if (P.full) throw new Error('QuotaExceededError'); ls.set(k, String(v)); }, removeItem: k => { ls.delete(k); },
    key: i => [...ls.keys()][i] ?? null, get length() { return ls.size; }
  };
  class D extends Date { constructor(...a) { if (a.length) super(...a); else super(now()); } static now() { return now(); } }
  const noop = () => {};
  const listen = (type, fn) => { if (listeners[type]) listeners[type].push(fn); };
  const window = { IRONLOG_STARTER: 'legacy', addEventListener: listen, removeEventListener: noop, scrollTo: noop, matchMedia: () => ({ matches: false }) };
  const document = { addEventListener: listen, removeEventListener: noop, visibilityState: 'visible', getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} } };
  const navigator = { get onLine() { return !P.off; } };
  // A timer of no delay is a turn of the event loop, not a wait: it runs at Node's next turn, whatever the phone's clock says.
  const st = (fn, ms) => { if (!ms) { setImmediate(fn); return 0; } timers.set(++tid, { fn, at: now() + ms }); return tid; };
  const ct = id => { timers.delete(id); };
  const rnd = rng(o.seed || 1);
  const M = Object.create(Math); M.random = rnd;
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', 'localStorage', 'window', 'document', 'navigator', 'setTimeout', 'clearTimeout', 'Date', 'Math', bundleOf(dir))(mod, mod.exports, require, localStorage, window, document, navigator, st, ct, D, M);
  const E = (P.E = mod.exports);
  E.setFx({ render: noop, rerenderKeepScroll: noop, toast: m => { P.toasts.push(String(m)); }, undoToastHide: noop, setSaveState: noop, syncLine: noop, obGate: () => false, ask: async () => 'cancel', closeModal: noop, draftBack: noop });
  /* The network of this phone. Off: every request fails before it reaches the account. `P.drop` = { kind, when, n }:
     the next `n` requests of that kind ('set', 'rows-push', ... or '*') get no answer, before the account applies
     them or after. `P.hook(kind, when)` runs inside every request, while it is in flight: what another phone does
     at that very moment. */
  const net = async (kind, when) => {
    if (P.hook) await P.hook(kind, when);
    if (P.off) throw dropped();
    const d = P.drop;
    if (d && d.n > 0 && (d.kind === '*' || d.kind === kind) && d.when === when) { d.n--; throw dropped(); }
  };
  /** The app's start: the log read from storage (a new log when there is none), then the sync's notes. */
  P.start = seed => {
    if (seed && !ls.has(E.KEY)) { const s = E.normalize(null); seed(s); ls.set(E.KEY, JSON.stringify(E.normalize(s))); }
    E.setState(E.load());
    E.syncStart();
    return P;
  };
  /** Signed in to the account: the sync on, its first pull still to come (as cloudInit leaves it). */
  P.signIn = (acct, uid = 'u') => { E.cloud.db = acct.dbFor(P.name, net); E.cloud.uid = uid; E.cloud.acct = uid; E.cloud.on = true; return P; };
  /** Waits for the rows' pass, which runs outside the sync's queue, to end. */
  P.settle = async () => {
    await E.cloud.chain;
    for (let i = 0; i < 20000 && E.rowsBusy && E.rowsBusy(); i++) await new Promise(r => setImmediate(r));
    await E.cloud.chain;
  };
  /** Timers due by the phone's clock run in order (the edit notes after 800 ms, a flush after 1200 ms, retries). */
  P.tick = async () => {
    for (let guard = 0; guard < 50; guard++) {
      const due = [...timers.entries()].filter(([, x]) => x.at <= now()).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      due[1].fn();
      await E.cloud.chain; await null;
    }
    await P.settle();
  };
  P.edit = change => { E.act(() => change(E.state)); };
  P.flush = async () => { await E.cq(E.cloudFlush); await P.settle(); };
  P.pull = async () => { await E.cq(E.cloudPull); await P.settle(); };
  P.sync = async () => { await P.flush(); await P.pull(); };
  P.state = () => E.state;
  P.notes = () => JSON.parse(ls.get(E.KEY + '.sync') || 'null');
  P.rowNotes = () => JSON.parse(ls.get(E.KEY + '.rows') || 'null');
  P.errors = () => E.logBuf.filter(x => !/^sync-(race|conflict)$/.test(x.a)).map(x => `${x.a}: ${x.m}`);
  return P;
}
module.exports = { phoneOf, accountOf, bundleOf, rng };
