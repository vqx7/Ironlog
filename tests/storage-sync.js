// Saving and sync, checked against their written rules (CA-1; the spec "Saving and sync", S-1 to S-33, in the
// project's claude/ironlog-spec-storage-sync-draft2.md, built from the code: sync.ts, storage.ts, merge.ts, act.ts,
// normalize.ts, chunks.ts, account.ts and toast.ts, V's rulings deciding). A feature suite: each section is one rule,
// a lifter's log seeded, the rule's change made as the lifter makes it (a tap, a field typed, a second tab, a second
// phone, the network gone), and what the phone and the account then hold compared with what the rule gives, with the
// rule's numbers and the app's own words. A failure names its rule. Each rule was changed in a copy of the page to
// show its check fails there (PENDING, CA-1). The account is the stand-in the sync suites use (the Claude db the sync
// takes when window.claude exists). The rules that need the real account service run on the built app against the
// stand-in Supabase server: S-22 (Sign out) in tests/accounts.js and tests/storage-sync-account.js, the account
// itself (S-27 to S-33) in tests/accounts.js, tests/breach.js and tests/sql.js. SYNC_ONLY=S-1,S-4 runs some rules.
const { open, tab, engine } = require('./h');
const path = require('path');
const fails = [];
const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1200) : ''); } else console.log('ok  ', m); return !!c; };
const FILE = process.argv[2] || 'index.html';
// The build under test as a page address: the standalone build when the run says so (tests/run.js), as open() takes it.
const CURRENT = FILE === 'index.html' && process.env.IRONLOG_FILE ? process.env.IRONLOG_FILE : FILE;
const ONLY = process.env.SYNC_ONLY ? process.env.SYNC_ONLY.split(',') : null;
const run = id => !ONLY || ONLY.includes(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const DAY = '2026-11-11';
const CLOCK = DAY + 'T10:00:00';
const KEY = 'ironlog.v1';

// The rules' numbers, from the spec (each is the code's, named where it lives).
const SAVE_TYPED_MS = 400; // S-1, act.ts `soon` (sync.ts SYNC_MS.save)
const FLUSH_MS = 1200; // S-1, sync.ts SYNC_MS.flush
const BACKUP_DAYS = 7; // S-5, storage.ts BACKUP_DAYS
const UNDO_MAX = 20, UNDO_DAYS = 7; // S-7, storage.ts
const TRASH_DAYS = 30, TRASH_MAX = 20; // S-8, records.ts
const RETRY_S = [5, 15, 60, 180]; // S-16, sync.ts RETRY_S
const PULL_AFTER_MS = 20000; // S-16, sync.ts SYNC_MS.pullAfter
const NOTICE_READ_MS = 4000; // S-15, toast.ts
// How late a timer may fire on a busy machine before a check calls the rule's number wrong. A timer never fires early.
const LATE_MS = 450;

// The menu button: its words (its label) and the class its dot is drawn from.
const MENU = () => { const el = document.getElementById('saveState'); return { txt: (el.getAttribute('aria-label') || '').replace(/^Menu\. /, ''), cls: ['ok', 'busy', 'warn', 'bad'].find(c => el.classList.contains(c)) || '' }; };
// The toast showing, as the lifter reads it.
const TOAST = () => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText.replace(/\s+/g, ' ').trim() : ''; };
// Every toast a page has shown, in order (a page's init script watches it).
const TOAST_LOG = () => {
  window.__toasts = [];
  const hook = () => {
    const el = document.getElementById('toast');
    if (!el) { setTimeout(hook, 20); return; }
    new MutationObserver(() => {
      if (el.hidden) return;
      const t = el.innerText.replace(/\s+/g, ' ').trim(), last = window.__toasts[window.__toasts.length - 1];
      if (t && (!last || last.text !== t)) window.__toasts.push({ at: Date.now(), text: t });
    }).observe(el, { childList: true, subtree: true, attributes: true, characterData: true });
  };
  hook();
};
/* Every write of the log to this phone's storage, with its time, and a switch that makes them fail as a full phone's
   do (window.__full: true for every key, or a regular expression's source for the keys it matches). */
const STORAGE_WATCH = () => {
  window.__writes = [];
  const set = Storage.prototype.setItem;
  // Kept when phone()'s start-up script for o.full set it first: start-up scripts run in no set order.
  window.__full = window.__full || false;
  Storage.prototype.setItem = function (k, v) {
    if (k === 'ironlog.v1') window.__writes.push({ at: Date.now(), v });
    const f = window.__full;
    if (f === true || (typeof f === 'string' && new RegExp(f).test(k))) { const e = new Error('The quota has been exceeded.'); e.name = 'QuotaExceededError'; e.code = 22; throw e; }
    return set.call(this, k, v);
  };
};
// A tab that does not hear the other tab's saves while window.__deaf is set: its change then meets a save not yet heard.
const DEAF = () => { window.__deaf = false; window.addEventListener('storage', e => { if (window.__deaf) e.stopImmediatePropagation(); }, true); };
/* The sync's waits before a retry, compressed: with window.__fast set, a timer of one of RETRY_S's lengths is noted
   (window.__waits) and runs after 20 ms, so a run of retries takes moments rather than minutes. */
const FAST = s => {
  window.__fast = false; window.__waits = [];
  const st = window.setTimeout;
  window.setTimeout = function (fn, ms, ...a) { if (window.__fast && s.includes(ms)) { window.__waits.push(ms); return st.call(window, fn, 20, ...a); } return st.call(window, fn, ms, ...a); };
};
// The page hidden or shown, as a lifter leaving the app and coming back makes it.
const SHOWN = () => { window.__shown = 'visible'; Object.defineProperty(document, 'visibilityState', { get: () => window.__shown, configurable: true }); };
// When the lifter last typed a key into a field and last tapped, on the page's clock.
const INPUTS = () => { document.addEventListener('input', () => { window.__lastInput = Date.now(); }, true); document.addEventListener('pointerdown', e => { if (e.isTrusted) window.__lastClick = Date.now(); }, true); };

/* One stand-in account per scenario: documents by path, shared by every phone opened on it; each write noted with its
   time and the phone that made it. cloud.fail(code, re) makes the next read or write of a matching path fail with
   that code (as the account's errors carry one); cloud.hold(re) holds matching writes until cloud.release(). */
function cloudOf() {
  const store = new Map(), writes = [], reads = [];
  let failNext = null, held = null, pend = [], heldReads = null, pendReads = [], heldGet = null;
  const setup = (uid, who = uid) => async (ctx, page) => {
    // A read held by holdGet returns the copy as it was when the phone asked, after the gate opens: what a phone that
    // read just before another phone's write then holds.
    await page.exposeFunction('__dbGet', async p => { reads.push({ p, at: Date.now(), uid, who }); if (heldGet && heldGet.who === who && heldGet.re.test(p)) { const h = heldGet; heldGet = null; const was = store.has(p) ? store.get(p) : null; h.reached(); await h.gate; return was; } if (failNext && failNext.re.test(p)) { const c = failNext.code; if (!failNext.keep) failNext = null; return JSON.stringify({ __fail: c }); } return store.has(p) ? store.get(p) : null; });
    await page.exposeFunction('__dbSet', async (p, v, pageAt) => {
      if (failNext && failNext.re.test(p)) { const c = failNext.code; if (!failNext.keep) failNext = null; return JSON.stringify({ __fail: c }); }
      if (held && held.test(p)) await new Promise(r => pend.push(r));
      store.set(p, v); writes.push({ p, at: Date.now(), pageAt, uid, who, v }); return 'ok';
    });
    await page.exposeFunction('__dbList', async p => { reads.push({ p, at: Date.now(), uid, who, list: true }); if (heldReads && heldReads.test(p)) await new Promise(r => pendReads.push(r)); if (failNext && failNext.re.test(p)) { const c = failNext.code; if (!failNext.keep) failNext = null; return JSON.stringify({ __fail: c }); } return JSON.stringify([...store.entries()].filter(([k]) => k.startsWith(p + '/') && !k.slice(p.length + 1).includes('/')).map(([k, v]) => [k.slice(p.length + 1), v])); });
    await page.addInitScript(u => {
      if (window.__uid === undefined) window.__uid = u;
      // A page set offline (window.__offline) refuses every call, as the moved two-phone sections use it.
      const off = () => { if (window.__offline) throw { code: 'unavailable', message: 'offline' }; };
      const failed = r => { if (r && r.startsWith('{"__fail"')) { const c = JSON.parse(r).__fail; const e = new Error(c === 'gone' ? 'This account no longer exists. Your log stays on this phone.' : 'The account refused: ' + c); e.code = c; throw e; } return r; };
      window.claude = { use: async k => {
        if (k === 'user') return window.__uid ? { id: async () => window.__uid } : null;
        if (k === 'db') return {
          doc: p => ({
            get: async () => { off(); if (window.__dbFail && new RegExp(window.__dbFail).test(p)) { window.__dbFail = null; throw new Error('read failed'); } const v = failed(await window.__dbGet(p)); return v == null ? { exists: false, data: () => null } : { exists: true, data: () => JSON.parse(v) }; },
            set: async o => { off(); failed(await window.__dbSet(p, JSON.stringify(o), Date.now())); return true; }
          }),
          collection: p => ({ get: async () => { off(); const l = JSON.parse(failed(await window.__dbList(p))); return { docs: l.map(([id, v]) => ({ id, exists: true, data: () => JSON.parse(v) })) }; } })
        };
        return null;
      } };
    }, uid);
  };
  const ids = uid => [...store.keys()].filter(k => k.startsWith(`data/users/${uid}/`)).map(k => k.slice(`data/users/${uid}/`.length)).sort();
  const doc = (uid, id) => { const v = store.get(`data/users/${uid}/${id}`); return v ? JSON.parse(JSON.parse(v).json) : null; };
  // The documents a phone (`who`, its account's id unless named) wrote for an account since a time on its clock, each with when it sent it.
  const written = (uid, since = 0, who = uid) => writes.filter(w => w.who === who && w.pageAt >= since && w.p.startsWith(`data/users/${uid}/`)).map(w => ({ id: w.p.slice(`data/users/${uid}/`.length), at: w.pageAt }));
  // Every record of a kind the account holds for a user, across its documents (the moved sections' readers).
  const docs = (uid, pre) => [...store.entries()].filter(([k]) => k.startsWith(`data/users/${uid}/${pre}`)).map(([, v]) => JSON.parse(JSON.parse(v).json));
  return {
    store, writes, reads, setup, ids, doc, written,
    sessionsIn: uid => docs(uid, 's-').flatMap(d => d.sessions || []), cardioIn: uid => docs(uid, 's-').flatMap(d => d.cardio || []), bwIn: uid => docs(uid, 'b-').flatMap(d => d.bodyweights || []),
    fail: (code, re = /./, keep = false) => { failNext = { code, re, keep }; },
    clear: () => { failNext = null; },
    hold: re => { held = re; },
    release: () => { held = null; const p = pend; pend = []; p.forEach(r => r()); },
    holdReads: re => { heldReads = re; },
    // The next read of a matching document by phone `who` waits until the promise given resolves; reached() resolves
    // the promise returned, so a check knows the phone has asked and is waiting.
    holdGet: (re, who, gate) => new Promise(r => { heldGet = { re, who, gate, reached: r }; }),
    releaseReads: () => { heldReads = null; const p = pendReads; pendReads = []; p.forEach(r => r()); }
  };
}

// A lifter's session, as History holds one: a date, the routine's first day, and sets of [kg, reps].
const sessionRec = (id, date, sets, more) => ({ id, date, dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: sets.map(([w, r]) => ({ w, r, rir: 2, done: true })) }], ...(more || {}) });

/* A phone: the app opened, its first page passed, the log seeded with `seed` (a function run on the store, as a
   lifter's earlier visits left it), and the toasts and storage writes watched. o.cloud and o.uid sign it in to a
   stand-in account; o.browser shares one browser. */
async function phone(o = {}) {
  const setup = async (ctx, page) => {
    // On the browser profile, so a second tab of it is watched the same way.
    for (const f of [TOAST_LOG, STORAGE_WATCH, DEAF, INPUTS, SHOWN]) await ctx.addInitScript(f);
    await ctx.addInitScript(FAST, RETRY_S.map(x => x * 1000));
    // o.raw: the text the log's key holds when the app first starts (a fresh phone has none, so only the first load
    // writes it); o.full: a pattern of the keys the phone's storage refuses from the start.
    if (o.raw !== undefined || o.full) await ctx.addInitScript(([k, raw, full]) => { if (raw !== null && localStorage.getItem(k) === null) localStorage.setItem(k, raw); if (full) window.__full = full; }, [KEY, o.raw === undefined ? null : o.raw, o.full || '']);
    if (o.cloud) await o.cloud.setup(o.uid === undefined ? 'u1' : o.uid, o.who)(ctx, page);
    if (o.setup) await o.setup(ctx, page);
  };
  const P = await open(FILE, { browser: o.browser, clock: o.clock || CLOCK, w: o.w, tz: o.tz, locale: o.locale, dark: o.dark, setup });
  P.ev = (f, a) => P.page.evaluate(f, a);
  await P.ev(([seed, arg, fresh]) => {
    const L = window.__ironlog; const S = L.state;
    localStorage.setItem(L.KEY + '.installLater', '1'); localStorage.setItem(L.KEY + '.tipWake', '1');
    if (fresh) return;
    S.settings.onboarded = true;
    // The seed is a function of (S, L, arg) written in this file, sent as its source.
    // eslint-disable-next-line no-new-func
    if (seed) new Function('return ' + seed)()(S, L, arg);
    L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); L.ui.tab = 'today'; L.render();
  }, [o.seed ? String(o.seed) : '', o.arg === undefined ? null : o.arg, !!o.fresh]);
  P.menu = () => P.ev(MENU);
  P.toast = () => P.ev(TOAST);
  P.toasts = () => P.ev(() => (window.__toasts || []).map(t => t.text));
  P.stored = () => P.ev(k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return localStorage.getItem(k); } }, KEY);
  P.cloud = () => P.ev(() => window.__ironlog.cloudState());
  P.sync = async () => { await P.ev(() => window.__ironlog.sync()); await wait(120); };
  P.flush = async () => { await P.ev(() => window.__ironlog.flush()); await wait(120); };
  P.synced = (ms = 8000) => P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: ms }).then(() => true, () => false);
  // Synced with everything sent: the first pull done, then what the phone holds sent.
  P.settled = async () => (await P.synced()) && (await P.flush(), await P.synced());
  P.tabTo = async t => { await P.page.click(`#tabs [data-tab="${t}"]`); await wait(150); };
  P.close = () => P.browser && !o.browser ? P.browser.close() : P.ctx.close();
  return P;
}
// A second phone's clock set to the first's, so the two read one time as the same moment (each page's clock starts at
// the time it is given when it loads).
const clockOf = async P => new Date(await P.ev(() => Date.now())).toISOString();
// The routine's first day started from Today's card, as a lifter starts it, and set i of exercise b ticked by its button.
async function start(P) { await P.tabTo('today'); await P.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(250); if (await P.ev(() => !!window.__ironlog.ui.modal)) { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(100); } }
const tickBtn = (b, s) => `#view [data-act="sDone"][data-b="${b}"][data-s="${s}"]`;
async function tick(P, b, s, load = '100', reps = '8') {
  const f = k => `#view input[data-f="${k}"][data-b="${b}"][data-s="${s}"]`;
  if (!(await P.page.inputValue(f('w')))) await P.page.fill(f('w'), load);
  if (!(await P.page.inputValue(f('r')))) await P.page.fill(f('r'), reps);
  await P.page.click(tickBtn(b, s)); await wait(150);
}
// A section of Settings opened by its heading, as a lifter opens it.
async function settingsOpen(P, id) {
  await P.tabTo('settings');
  await P.ev(id => { const d = document.getElementById(id); if (d && d.tagName === 'DETAILS' && !d.open) d.querySelector('summary').click(); }, id);
  await wait(150);
}
// A folded section of a tab opened by its heading, as a lifter opens it (data-sk names it, as 'history:trash').
async function secOpen(P, sk) {
  await P.ev(sk => { const d = document.querySelector(`#view details.sec[data-sk="${sk}"]`); if (d && !d.open) d.querySelector('summary').click(); }, sk);
  await wait(150);
}
// The confirm sheet's main button, as the lifter taps it.
async function confirmOk(P) { await P.page.click('#modal [data-act="mOk"]'); await wait(200); }
// The sets ticked in the workout in progress, as saved on this phone.
const storedTicks = st => (st && st.draft ? st.draft.ex.flatMap(b => b.sets.filter(x => x.done).map(x => [x.w, x.r])) : null);

/* ---------- the moved two-phone sections' phone (from tests/r56-1.js, 2.50) ----------
   A phone as tests/r56-1.js opened one: the starter routine as shipped, its own clock from CLOCK_TWO, the first page
   passed, and helpers that set a workout's rows directly (tick) the way its checks were written; kept as they were so
   every moved check reads what it read there. */
const CLOCK_TWO = '2026-10-21T10:00:00';
const setsOf = d => (d ? d.sets.filter(s => s.done).map(s => `${s.w}x${s.r}`).join(',') : '-');
const okAs = rule => (c, m, x) => ok(c, `${rule}: ${m}`, x);
async function phoneTwo(browser, cloud, uid, fileOrOpts = {}) {
  // The fourth argument is the build to open (tests/r56-1c.js), or options for open (tests/r56-1.js).
  const file = typeof fileOrOpts === 'string' ? fileOrOpts : FILE, opts = typeof fileOrOpts === 'string' ? {} : fileOrOpts;
  const P = await open(file, { browser, clock: CLOCK_TWO, realStarter: true, setup: cloud.setup(uid), ...opts });
  P.ev = (f, a) => P.page.evaluate(f, a);
  await P.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
  P.sync = async () => { await P.ev(() => window.__ironlog.sync()); await wait(150); };
  P.flush = async () => { await P.ev(() => window.__ironlog.flush()); await wait(150); };
  P.draft = () => P.ev(() => { const d = window.__ironlog.state.draft; return d ? { id: d.id, sets: d.ex[0].sets.map(s => ({ w: s.w, r: s.r, done: !!s.done })), n: d.ex.length } : null; });
  P.sessions = () => P.ev(() => window.__ironlog.state.sessions.map(s => ({ id: s.id, sets: s.ex.flatMap(b => b.sets.map(x => [x.w, x.r])) })));
  P.rows = (bi = 0) => P.ev(bi => { const d = window.__ironlog.state.draft; return d ? d.ex[bi].sets.map(s => (s.warm ? 'W:' : '') + (s.done ? `${s.w}x${s.r}` : '-')).join(' ') : null; }, bi);
  P.blocks = () => P.ev(() => { const d = window.__ironlog.state.draft; return d ? d.ex.map(b => `${b.exId}[${b.sets.map(s => (s.done ? `${s.w}x${s.r}` : '-')).join(' ')}]`).join(' ') : null; });
  P.saved = () => P.ev(() => window.__ironlog.state.sessions.map(s => s.ex.map(b => b.sets.map(x => `${x.warm ? 'W' : ''}${x.w}x${x.r}`).join(' ')).join(' | ')));
  // Ticks row i of exercise bi (the first unless given) with a load and reps, as the logger saves a tick: through act,
  // so the workout's clock starts as a tap's does (the review of 2.52, REV13-T3: written by hand, no two-phone check
  // ran with two starts).
  // A build from before act (r56, opened for a note from an older build) is written as that build's logger wrote it.
  P.tick = (i, w, r, bi = 0) => P.ev(([i, w, r, bi]) => { const L = window.__ironlog; const set = () => { const s = L.state.draft.ex[bi].sets[i]; s.w = w; s.r = r; s.done = true; }; if (L.act) L.act(set, { inProgress: true }); else { set(); L.saveNow(); } }, [i, w, r, bi]);
  // Starts the first day with its first exercise only, n rows (4 unless given).
  P.start = (n = 4) => P.ev(n => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; d.ex = d.ex.slice(0, 1); d.ex[0].sets.length = n; d._rampAsked = true; L.saveNow(); }, n);
  P.finish = async () => { await P.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.state.draft._rampAsked = true; L.ACT.finishNow(); }); await wait(300); await P.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); };
  P.toast = () => P.ev(() => { const el = document.getElementById('toast'); return el && !el.hidden ? el.innerText : ''; });
  // Every toast shown since the page opened (or reopened), in order, once each.
  P.watch = () => P.ev(() => { window.__toasts = []; const el = document.getElementById('toast'); if (el) new MutationObserver(() => { if (!el.hidden && el.innerText) window.__toasts.push(el.innerText.replace(/\s+/g, ' ')); }).observe(el, { childList: true, subtree: true, characterData: true, attributes: true }); });
  P.toasts = () => P.ev(() => [...new Set(window.__toasts || [])]);
  await P.watch();
  P.cloudState = () => P.ev(() => window.__ironlog.cloudState());
  P.modal = () => P.ev(() => { const m = window.__ironlog.ui.modal; const el = document.querySelector('#modal .sheet'); return m ? { kind: m.kind, title: m.title || '', text: el ? el.innerText : '', buttons: el ? [...el.querySelectorAll('button')].map(b => b.innerText.trim()) : [] } : null; });
  P.ids = () => P.ev(() => window.__ironlog.state.sessions.map(s => s.id).sort());
  // Signs out keeping the log (the notes kept), then signs in to uid, answering the question if it is asked.
  P.switchTo = async (uid, answer) => {
    await P.ev(() => window.__ironlog.cloudStop());
    await P.ev(uid => { window.__uid = uid; }, uid);
    P.ev(() => window.__ironlog.cloudInit()).catch(() => {}); await wait(900);
    const m = await P.modal();
    if (m && m.kind === 'confirm' && answer) { await P.page.click(`#modal [data-act="${answer}"]`); await wait(1500); }
    return m && m.kind === 'confirm' ? m.title : null;
  };
  P.reopen = async () => { await P.page.goto(P.page.url()); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await P.watch(); await wait(2000); };
  P.draftOf = () => P.ev(() => { const d = window.__ironlog.state.draft; return d ? { id: d.id, rows: d.ex[0].sets.map(s => (s.done ? `${s.w}x${s.r}` : s.w != null ? `typed ${s.w}x${s.r}` : '-')).join(' ') } : null; });
  P.cardio = () => P.ev(() => { const L = window.__ironlog; return { draft: L.state.draft ? (L.state.draft.cardio || []).map(c => `${c.kind} ${c.min}`).join(',') : null, log: L.state.cardio.map(c => `${c.kind} ${c.min}`).join(',') }; });
  return P;
}
// The build before r56.1, for the phones a note from an older build comes from (S-12, moved from tests/r56-1c.js F5 and G2).
const OLD_R56 = 'baselines/r56.html';
// A free session as the moved sections log one, and its save through the app's own path.
const sessionTwo = (id, date, sets) => ({ id, date, dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', notes: '', free: true, ex: [{ exId: 'bench', note: '', rr: null, sets: sets.map(([w, r]) => ({ w, r, rir: 1, warm: false, drop: false })) }] });
const addSession = (P, s) => P.ev(s => { const L = window.__ironlog; L.state.sessions.push(s); L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); }, s);
// From the next save on, the phone's storage refuses the log's key, as a full one does.
const refuseSave = P => P.ev(() => { const KEY = window.__ironlog.KEY; const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === KEY) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return o.call(this, k, v); }; });
// A moved section's pages, checked for page errors at its end, as tests/r56-1.js checked its own.
const noPageErrors = (rule, pages, expected) => { const errors = pages.flatMap(P => P.errors).filter(e => !expected || !expected.test(e)); okAs(rule)(!errors.length, 'no page errors', errors.slice(0, 4)); };

(async () => {
  /* ---------- S-1: a tap is saved at once; typing once it pauses (0.4 s); the account 1.2 s after the last change ---------- */
  if (run('S-1')) {
    const P = await phone();
    await start(P);
    // The set's load and reps typed, then the tick tapped: read in the same breath as the tap, it is already saved.
    await P.page.fill('#view input[data-f="w"][data-b="0"][data-s="0"]', '100');
    await P.page.fill('#view input[data-f="r"][data-b="0"][data-s="0"]', '8');
    const n0 = await P.ev(() => window.__writes.length);
    await P.page.click(tickBtn(0, 0));
    const st = await P.stored();
    ok(storedTicks(st) && storedTicks(st).length === 1, 'S-1: a ticked set is on the phone the moment it is tapped', storedTicks(st));
    ok((await P.ev(() => window.__writes.length)) === n0 + 1, 'S-1: the tap wrote the log to this phone once', (await P.ev(() => window.__writes.length)) - n0);
    // Typing: the load of set 2, typed key by key into its field.
    const field = '#view input[data-f="w"][data-b="0"][data-s="1"]';
    await P.page.click(field); await wait(SAVE_TYPED_MS + 200);
    const t0 = await P.ev(() => Date.now());
    await P.page.type(field, '77', { delay: 60 });
    await wait(SAVE_TYPED_MS + LATE_MS + 100);
    const last = await P.ev(() => window.__lastInput);
    const w = await P.ev(([t0]) => window.__writes.filter(x => x.at >= t0).map(x => ({ at: x.at, has: (() => { const d = JSON.parse(x.v).draft; return !!d && d.ex[0].sets[1].w != null && Math.abs(d.ex[0].sets[1].w - 77 * 0.45359237) < 0.01; })() })), [t0]);
    const first = w.find(x => x.has);
    ok(w.length === 1 && first, 'S-1: the typed load is saved once, after the last key', w);
    ok(first && first.at - last >= SAVE_TYPED_MS - 2, `S-1: typing is saved only once it pauses, ${SAVE_TYPED_MS} ms after the last key`, { delay: first && first.at - last });
    ok(first && first.at - last <= SAVE_TYPED_MS + LATE_MS, `S-1: typing is saved ${SAVE_TYPED_MS} ms after it pauses, not later`, { delay: first && first.at - last });
    await P.close();

    // With an account: the account's copy follows 1.2 s after the last change.
    const C = cloudOf();
    const A = await phone({ cloud: C, uid: 'u1' });
    ok(await A.synced(), 'S-1: (setup) the phone syncs with its account', await A.cloud());
    await start(A);
    await A.page.fill('#view input[data-f="w"][data-b="0"][data-s="0"]', '100');
    await A.page.fill('#view input[data-f="r"][data-b="0"][data-s="0"]', '8');
    await wait(FLUSH_MS + LATE_MS + 300);
    const since = await A.ev(() => Date.now());
    await A.page.click(tickBtn(0, 0));
    await wait(FLUSH_MS + LATE_MS + 600);
    const tapAt = await A.ev(() => window.__lastClick);
    const dw = C.written('u1', since).filter(x => x.id === 'draft');
    ok(dw.length === 1 && dw[0].at - tapAt >= FLUSH_MS - 2, `S-1: the account's copy is sent ${FLUSH_MS / 1000} s after the last change, not before`, { delay: dw[0] && dw[0].at - tapAt, n: dw.length });
    ok(dw.length === 1 && dw[0].at - tapAt <= FLUSH_MS + LATE_MS, `S-1: the account's copy is sent ${FLUSH_MS / 1000} s after the last change`, { delay: dw[0] && dw[0].at - tapAt });
    const ad = C.doc('u1', 'draft');
    ok(ad && ad.draft && ad.draft.ex[0].sets[0].done === true, 'S-1: the account holds the ticked set', ad && ad.draft && ad.draft.ex[0].sets[0]);
    await A.close();
  }

  /* ---------- S-2: a save that cannot be read is kept aside and never written over ---------- */
  if (run('S-2')) {
    const RAW = '{"version":5,"sessions":[{"id":"s1","date":"2026-11-0';
    // A phone whose save cannot be read when the app starts (phone() then passes the first page, a change the app saves).
    const P = await phone({ raw: RAW });
    ok((await P.ev(k => localStorage.getItem(k + '.unreadable'), KEY)) === RAW, 'S-2: the save the app could not read is kept aside, word for word');
    // A change made after (the first page passed, through the app's one way to change the log): the log is saved, and
    // the save kept aside is still there, never written over.
    await P.ev(() => { const L = window.__ironlog; L.act(() => { L.state.settings.onboarded = true; L.state.settings.lastExport = '2026-11-11'; }); L.render(); });
    const after = await P.stored();
    // Read by the change's own value: phone() saved onboarded while passing the first page (the review, T1).
    ok(after && after.settings && after.settings.lastExport === '2026-11-11', 'S-2: a change made after is saved', after && after.settings && after.settings.lastExport);
    ok((await P.ev(k => localStorage.getItem(k + '.unreadable'), KEY)) === RAW, 'S-2: the save kept aside is never written over by a later save');
    await settingsOpen(P, 'dataSec');
    const panel = await P.ev(() => { const p = document.getElementById('unreadPanel'); return p ? { text: p.innerText.replace(/\s+/g, ' '), btns: [...p.querySelectorAll('button')].map(b => b.innerText.trim()) } : null; });
    ok(panel && /could not be read/.test(panel.text), 'S-2: Settings, Your data, says a save could not be read and was kept aside', panel);
    ok(panel && JSON.stringify(panel.btns) === JSON.stringify(['Restore it', 'Show its text', 'Forget it']), 'S-2: it offers "Restore it", "Show its text" and "Forget it"', panel && panel.btns);
    await P.page.click('#unreadPanel [data-act="unreadShow"]'); await wait(150);
    const shown = await P.ev(() => { const t = document.querySelector('#modal textarea'); return t ? t.value : null; });
    ok(shown === RAW, 'S-2: "Show its text" shows the save kept aside, word for word', shown);
    await P.ev(() => window.__ironlog.ACT.mClose()); await wait(100);
    await P.page.click('#unreadPanel [data-act="unreadForget"]'); await wait(150);
    await confirmOk(P);
    ok((await P.ev(k => localStorage.getItem(k + '.unreadable'), KEY)) === null, 'S-2: "Forget it" deletes the save kept aside');
    await P.close();

    // No room to keep it aside: nothing is saved over it that visit, and the menu says so.
    const Q = await phone({ raw: RAW, full: '\\.unreadable$' });
    const m = await Q.menu();
    ok(m.cls === 'bad' && m.txt === 'Not saving: export a backup', 'S-2: with no room to keep it aside, the menu says "Not saving: export a backup"', m);
    await Q.ev(() => { const L = window.__ironlog; L.act(() => { L.state.settings.onboarded = true; }); L.render(); });
    ok((await Q.ev(k => localStorage.getItem(k), KEY)) === RAW, 'S-2: and nothing is saved over it that visit', (await Q.ev(k => localStorage.getItem(k), KEY) || '').slice(0, 80));
    await Q.close();
  }

  /* ---------- S-3: storage full: every later change tries again; Not saving until one succeeds; nothing thrown away ---------- */
  if (run('S-3')) {
    const C = cloudOf();
    const P = await phone({ cloud: C, uid: 'u3' });
    ok(await P.synced(), 'S-3: (setup) the phone syncs with its account');
    await start(P); await wait(300);
    await P.ev(() => { window.__full = 'ironlog\\.v1$'; });
    await tick(P, 0, 0);
    const m1 = await P.menu();
    ok(m1.cls === 'bad' && m1.txt === 'Not saving: export a backup', 'S-3: a save the full phone refuses says "Not saving: export a backup"', m1);
    const a0 = await P.ev(() => window.__writes.length);
    await tick(P, 0, 1);
    ok((await P.ev(() => window.__writes.length)) > a0, 'S-3: the next change tries to save again', await P.ev(() => window.__writes.length));
    ok((await P.ev(() => window.__ironlog.state.draft.ex[0].sets.filter(s => s.done).length)) === 2, 'S-3: both ticked sets are kept in the open app');
    await wait(FLUSH_MS + LATE_MS + 300);
    const ad = C.doc('u3', 'draft');
    ok(ad && ad.draft && ad.draft.ex[0].sets.filter(s => s.done).length === 2, 'S-3: with an account, the changes still reach it', ad && ad.draft && ad.draft.ex[0].sets.map(s => s.done));
    await P.ev(() => { window.__full = false; });
    await tick(P, 0, 2);
    const st = await P.stored();
    ok(storedTicks(st) && storedTicks(st).length === 3, 'S-3: once a save succeeds, every change made meanwhile is saved', storedTicks(st));
    const m2 = await P.menu();
    ok(m2.cls !== 'bad' && m2.txt !== 'Not saving: export a backup', 'S-3: and the menu no longer says Not saving', m2);
    await P.close();
  }
  if (run('S-3')) {
    /* REV6-S2 (V, 2026-11-09 08:11: "if phone storage is full hold onto draft copy"): a workout set aside while a saved
       session is edited comes back when the edit is saved, and its set-aside copy on the phone is let go only once a
       save of the log holding it succeeds. Until then that copy is the only one the phone keeps: closed and reopened,
       the workout comes back from it. Before 2.55 the copy was dropped as the workout came back, so a phone full then
       lost the workout at the next reload. */
    const seed = (S, L) => { S.sessions = [{ id: 'old', date: '2026-11-07', dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', notes: '', free: true, ex: [{ exId: 'bench', rr: [6, 10], sets: [{ w: 90, r: 8, rir: 2, done: true }] }] }]; };
    const P = await phone({ seed });
    const parked = () => P.ev(k => { const v = localStorage.getItem(k + '.parked'); return v ? JSON.parse(v).draft.id : null; }, KEY);
    await start(P); await tick(P, 0, 0, '100', '8');
    const w0 = (await P.ev(() => window.__ironlog.state.draft)).id;
    await P.tabTo('history'); await P.page.click('#view [data-act="histToggle"][data-id="old"]'); await wait(150);
    await P.page.click('#view [data-act="histEdit"][data-id="old"]'); await wait(300);
    ok((await parked()) === w0 && (await P.ev(() => !!(window.__ironlog.state.draft || {}).editingId)), 'S-3: (setup) the saved session open for editing, the workout set aside', await parked());
    await P.ev(() => { window.__full = 'ironlog\\.v1$'; });
    await P.page.click('#view [data-act="finish"]'); await wait(300);
    for (let k = 0; k < 3 && (await P.ev(() => !!window.__ironlog.ui.modal)); k++) { await P.page.click('#modal [data-act="mOk"]').catch(() => {}); await wait(250); }
    const back = await P.ev(() => { const d = window.__ironlog.state.draft; return d && !d.editingId ? { id: d.id, done: d.ex[0].sets.filter(x => x.done).length } : null; });
    ok(back && back.id === w0 && back.done === 1 && (await P.menu()).cls === 'bad', 'S-3: the edit saved with the phone full: the workout comes back, its set ticked, and the save fails', { back, menu: await P.menu() });
    ok((await parked()) === w0, 'S-3: its set-aside copy stays on the phone while no save holds it (REV6-S2)', await parked());
    const today = await P.ev(() => ({ resume: !!document.querySelector('#view [data-act="wkResume"]'), bring: !!document.querySelector('#view [data-act="parkBack"]') }));
    ok(today.resume && !today.bring, 'S-3: (a guard) Today offers the workout as back (Resume), not as still set aside', today);
    // Closed and opened again with the log never saved since: the edit is what the phone kept, and the workout set
    // aside comes back from its copy when the edit ends.
    await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__ironlog.state); await wait(400);
    const after = await P.ev(() => ({ editing: !!(window.__ironlog.state.draft || {}).editingId }));
    await P.ev(() => window.__ironlog.ACT.discard()); await wait(300);
    for (let k = 0; k < 3 && (await P.ev(() => !!window.__ironlog.ui.modal)); k++) { await P.page.click('#modal [data-act="mOk"]').catch(() => {}); await wait(250); }
    const again = await P.ev(() => { const d = window.__ironlog.state.draft; return d && !d.editingId ? { id: d.id, done: d.ex[0].sets.filter(x => x.done).length } : null; });
    ok(after.editing && again && again.id === w0 && again.done === 1, 'S-3: reopened, the edit the phone kept is cancelled and the workout comes back from its copy, its set ticked (REV6-S2)', { after, again });
    ok((await parked()) === null, 'S-3: (a guard) saved with it, the copy is let go', await parked());
    // A copy let go is never offered again: the workout finished, nothing comes back.
    await P.tabTo('today'); await P.page.click('#view [data-act="wkResume"]').catch(() => {}); await wait(250);
    await P.page.click('#view [data-act="finish"]'); await wait(300);
    for (let k = 0; k < 3 && (await P.ev(() => !!window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind !== 'recap')); k++) { await P.page.click('#modal [data-act="mOk"], #modal button:has-text("Finish now")').catch(() => {}); await wait(250); }
    const end = await P.ev(() => ({ draft: !!window.__ironlog.state.draft, n: window.__ironlog.state.sessions.filter(x => x.id === window.__ironlog.state.sessions[0].id).length, ids: window.__ironlog.state.sessions.map(x => x.id) }));
    ok(!end.draft && end.ids.filter(id => id === w0).length === 1, 'S-3: finished, the workout is one session and nothing comes back after it', end);
    await P.close();
  }

  /* ---------- S-4: the menu button's dot and words ---------- */
  if (run('S-4')) {
    // The dot's colour, read as drawn, beside the colour the stylesheet names for it.
    const DOT = () => { const el = document.querySelector('#saveState .sd'); const cs = getComputedStyle(el); const probe = n => { const d = document.createElement('i'); d.style.color = `var(${n})`; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }; return { shown: cs.display !== 'none', bg: cs.backgroundColor, green: probe('--green'), grey: probe('--muted'), amber: probe('--yellow'), red: probe('--red'), words: getComputedStyle(document.querySelector('#saveState .sst')).display !== 'none' }; };
    const P = await phone({ seed: function (S) { S.settings.lastExport = '2026-11-11'; } });
    let m = await P.menu(), d = await P.ev(DOT);
    ok(m.cls === '' && m.txt === 'Saved on this device' && !d.shown, 'S-4: simply saved on this phone: no dot, "Saved on this device"', { m, d });
    ok(!d.words, 'S-4: on a phone the words stay in the label, not beside the dot', d);
    await P.ev(() => { window.__full = 'ironlog\\.v1$'; }); await start(P); await tick(P, 0, 0);
    m = await P.menu(); d = await P.ev(DOT);
    ok(m.cls === 'bad' && m.txt === 'Not saving: export a backup' && d.shown && d.bg === d.red, 'S-4: nothing being saved: a red dot, "Not saving: export a backup"', { m, d });
    await P.close();

    const W = await phone({ w: 700, seed: function (S) { S.sessions.push({ id: 'b1', date: '2026-11-01', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); } });
    m = await W.menu(); d = await W.ev(DOT);
    ok(m.cls === 'warn' && m.txt === 'Saved · backup due' && d.shown && d.bg === d.amber, 'S-4: a backup due: an amber dot, "Saved · backup due"', { m, d });
    ok(d.words && (await W.ev(() => document.querySelector('#saveState .sst').innerText)) === 'Saved · backup due', 'S-4: on a wider screen the words show beside the dot', d);
    await W.close();

    const C = cloudOf();
    const A = await phone({ cloud: C, uid: 'u4' });
    ok(await A.synced(), 'S-4: (setup) the phone syncs');
    m = await A.menu(); d = await A.ev(DOT);
    ok(m.cls === 'ok' && m.txt === 'Synced' && d.shown && d.bg === d.green, 'S-4: synced: a green dot, "Synced"', { m, d });
    C.hold(/draft$/);
    await start(A); await wait(FLUSH_MS + 400);
    m = await A.menu(); d = await A.ev(DOT);
    ok(m.cls === 'busy' && m.txt === 'Syncing' && d.shown && d.bg === d.grey, 'S-4: while syncing: a grey dot, "Syncing"', { m, d });
    C.release(); await wait(400);
    await A.ctx.setOffline(true);
    C.fail('offline', /./, true);
    await tick(A, 0, 0); await wait(FLUSH_MS + LATE_MS + 300);
    m = await A.menu(); d = await A.ev(DOT);
    ok(m.cls === 'warn' && m.txt === 'Offline, saved on this device' && d.shown && d.bg === d.amber, 'S-4: offline: an amber dot, "Offline, saved on this device"', { m, d });
    C.clear(); await A.ctx.setOffline(false);
    await A.close();
  }

  /* ---------- S-5: when the menu says a backup is due ---------- */
  if (run('S-5')) {
    const DUE = 'Saved · backup due', SAVED = 'Saved on this device';
    const real = function (S) { S.sessions.push({ id: 'b1', date: '2026-11-01', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); };
    const P = await phone({ seed: real });
    ok((await P.menu()).txt === DUE, 'S-5: sessions of your own and no backup ever made: a backup is due at once', await P.menu());
    await P.close();
    for (const [days, due] of [[BACKUP_DAYS, false], [BACKUP_DAYS + 1, true]]) {
      const Q = await phone({ seed: (S, L, a) => { S.sessions.push({ id: 'b1', date: '2026-11-01', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = a; }, arg: new Date(Date.parse(DAY + 'T12:00:00Z') - days * 864e5).toISOString().slice(0, 10) });
      ok((await Q.menu()).txt === (due ? DUE : SAVED), `S-5: the last backup ${days} days ago: ${due ? 'due' : 'not due yet'} (due after more than ${BACKUP_DAYS})`, await Q.menu());
      await Q.close();
    }
    const D = await phone({ seed: function (S) { S.sessions.push({ id: 'd1', demo: true, date: '2026-11-01', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); } });
    ok((await D.menu()).txt === SAVED, 'S-5: demo data never makes a backup due', await D.menu());
    await D.close();
    // The backup file, by its button in Your data: no longer due. The sets spreadsheet is not a backup.
    const E = await phone({ seed: real });
    await settingsOpen(E, 'dataSec');
    const dl1 = E.page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await E.page.click('#dataSec [data-act="exportCsv"]'); await dl1; await wait(250);
    const asked1 = await E.ev(() => { const m = window.__ironlog.ui.modal; return m && m.title; });
    await confirmOk(E);
    ok((await E.menu()).txt === DUE, 'S-5: the sets spreadsheet (CSV) is not a backup: still due once its download is confirmed', { asked1, menu: await E.menu() });
    const dl2 = E.page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await E.page.click('#dataSec [data-act="export"]'); await dl2; await wait(250);
    const asked2 = await E.ev(() => { const m = window.__ironlog.ui.modal; return m && m.title; });
    ok(asked2 === 'Did the file download?' && (await E.menu()).txt === DUE, 'S-5: the backup file counts only once the lifter says it downloaded', { asked2, menu: await E.menu() });
    await confirmOk(E);
    ok((await E.menu()).txt === SAVED && (await E.ev(() => window.__ironlog.state.settings.lastExport)) === DAY, 'S-5: "Export backup", its download confirmed, makes the backup: no longer due', await E.menu());
    await E.close();
    // The backup text copied counts too.
    const T = await phone({ seed: real });
    await settingsOpen(T, 'dataSec');
    await T.page.click('#dataSec [data-act="showBackup"]'); await wait(150);
    // The phone's clipboard takes the text, as a phone's does after the tap.
    await T.ev(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async t => { window.__copied = t; } }, configurable: true }); });
    await T.page.click('#modal [data-act="copyText"]'); await wait(200);
    ok((await T.ev(() => (window.__copied || '').includes('"sessions"'))), 'S-5: (setup) the backup text was copied');
    ok((await T.menu()).txt === SAVED, 'S-5: copying the backup text counts as a backup', await T.menu());
    await T.close();
    // Signed in: an account synced in the last 7 days needs no backup; one that has not synced for longer does.
    const C = cloudOf();
    const A = await phone({ cloud: C, uid: 'u5', seed: real });
    ok(await A.synced(), 'S-5: (setup) the phone syncs');
    ok((await A.menu()).txt === 'Synced' && !(await A.ev(() => window.__ironlog.backupDue())), 'S-5: an account synced in the last 7 days needs no backup', await A.menu());
    await A.ev(d => { window.__ironlog.cloud.last = Date.now() - d * 864e5; window.__ironlog.cloud.status = 'offline'; window.__ironlog.render(); }, BACKUP_DAYS + 1);
    ok(await A.ev(() => window.__ironlog.backupDue()), `S-5: an account that has not synced for more than ${BACKUP_DAYS} days: a backup is due`);
    await settingsOpen(A, 'dataSec');
    const callout = await A.ev(() => { const c = document.querySelector('#dataSec .callout.yellow'); return c ? c.textContent.replace(/\s+/g, ' ').trim() : null; });
    ok(callout === 'Backup due. No backup file yet. Your account has not synced this week. Export one below.', 'S-5: Your data says so in sentences with a space between them (NEW-123)', callout);
    await A.close();
  }

  /* ---------- S-6: two tabs ---------- */
  if (run('S-6')) {
    const A = await phone({ seed: function (S) { S.sessions.push({ id: 'k1', date: '2026-11-03', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }, { id: 'k2', date: '2026-11-05', dayIdx: 0, dayName: 'Day 1', notes: 'first', ex: [{ exId: 'bench', sets: [{ w: 62.5, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; } });
    const B = await tab(A, FILE); B.ev = (f, a) => B.page.evaluate(f, a); await wait(200);
    // A deletes a session in History; B, which has not heard it yet, starts a workout and ticks a set.
    await B.ev(() => { window.__deaf = true; });
    await A.tabTo('history');
    await A.page.click('#view [data-act="histToggle"][data-id="k1"]'); await wait(150);
    await A.page.click('#view [data-act="histDel"][data-id="k1"]'); await wait(150); await confirmOk(A);
    await B.page.click('#tabs [data-tab="today"]'); await wait(150);
    await B.page.click('#view .hero [data-act="startSession"]:not([data-light])'); await wait(250);
    if (await B.ev(() => !!window.__ironlog.ui.modal)) await B.ev(() => window.__ironlog.ACT.mClose());
    await B.page.click(tickBtn(0, 0)); await wait(300);
    await B.ev(() => { window.__deaf = false; });
    const st = await A.stored();
    ok(st && !st.sessions.some(s => s.id === 'k1') && st.draft && storedTicks(st).length === 1, 'S-6: a session deleted in one tab and a set ticked in the other: both kept in the save', st && { sessions: st.sessions.map(s => s.id), draft: storedTicks(st) });
    await wait(300);
    const inA = await A.ev(() => ({ s: window.__ironlog.state.sessions.map(s => s.id), d: !!window.__ironlog.state.draft }));
    const inB = await B.ev(() => ({ s: window.__ironlog.state.sessions.map(s => s.id), d: !!window.__ironlog.state.draft }));
    ok(!inA.s.includes('k1') && inA.d && !inB.s.includes('k1') && inB.d, 'S-6: and both tabs show both changes', { inA, inB });
    // The same record changed in both: the later save is kept, and the app says so.
    await B.ev(() => { window.__deaf = true; });
    await A.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'k2').notes = 'from A'; }); });
    await wait(100);
    await B.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'k2').notes = 'from B'; }); });
    await wait(300);
    await B.ev(() => { window.__deaf = false; });
    const k2 = (await A.stored()).sessions.find(s => s.id === 'k2');
    // 2.49's rule, kept: the tab that has not heard the other's save takes that save's copy (NEW-124 is OPEN: the later
    // edit should be kept; 2.50's first fix let this tab's own copy win, and lost logged sets, REV-1 to REV-4).
    ok(k2 && k2.notes === 'from A', 'S-6: the same record changed in both tabs at once keeps one whole copy, the one saved first (NEW-124: the moment before either tab hears the other)', k2 && k2.notes);
    const said = await B.ev(() => (window.__toasts || []).map(t => t.text));
    // NEW-124: 2.49 said "1 item was edited on two devices. The later edit was kept.", untrue here: the other tab's earlier change was kept.
    ok(said.some(t => t === "1 item was changed in two tabs at once. The other tab's change was kept.") && !said.some(t => /later edit/.test(t)), 'S-6: and the app says what was kept: "1 item was changed in two tabs at once. The other tab\'s change was kept." (NEW-124)', { B: said, A: await A.ev(() => (window.__toasts || []).map(t => t.text)) });
    await A.close();

    // The independent review of 2.50 and 2.51 (REV-1, REV-2, REV-4): a tab that has not heard the other's saves never
    // takes away what the other tab logged. Each fails on 2.50's first fix of NEW-124 and passes on 2.49's build.
    const sheetsShut = async P => { for (let i = 0; i < 5 && (await P.ev(() => !!window.__ironlog.ui.modal)); i++) { if ((await P.ev(() => window.__ironlog.ui.modal.kind)) === 'confirm') await confirmOk(P); else { await P.ev(() => window.__ironlog.ACT.mClose()); await wait(200); } } };
    const draftOf = st => (st && st.draft ? { id: st.draft.id, ticked: st.draft.ex.reduce((n, b) => n + b.sets.filter(x => x.done).length, 0) } : null);
    {
      // REV-1: tab A finishes a workout and starts the next, two sets ticked; tab B, behind, ticks a set in the first.
      const A1 = await phone({ seed: function (S) {
        S.routines = [{ id: 'R1', name: 'Mine', schedule: 'cycle', days: [
          { id: 'A', name: 'Push', rest: false, items: [{ uid: 'i0', exId: 'bench', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 120, ss: null }] },
          { id: 'B', name: 'Pull', rest: false, items: [{ uid: 'j0', exId: 'bbRow', sets: 3, repMin: 6, repMax: 10, rir: 2, rest: 120, ss: null }] }] }];
        S.activeRoutineId = 'R1';
        S.sessions = [{ id: 'last', date: '2026-11-07', dayIdx: 0, dayId: 'A', dayName: 'Push', routineId: 'R1', notes: '', ex: [{ exId: 'bench', rr: [6, 10], ps: 3, sets: [90, 90, 90].map(w => ({ w, r: 8, rir: 2, done: true })) }] },
          { id: 'last2', date: '2026-11-08', dayIdx: 1, dayId: 'B', dayName: 'Pull', routineId: 'R1', notes: '', ex: [{ exId: 'bbRow', rr: [6, 10], ps: 3, sets: [70, 70, 70].map(w => ({ w, r: 8, rir: 2, done: true })) }] }];
        S.settings.lastExport = '2026-11-11'; S.settings.autoDone = false; } });
      const B1 = await tab(A1, FILE); B1.ev = (f, a) => B1.page.evaluate(f, a); await wait(300);
      await start(A1); await A1.page.click(tickBtn(0, 0)); await wait(300);
      await B1.page.click('#tabs [data-tab="today"]'); await wait(300);
      const w1 = (await A1.ev(() => window.__ironlog.state.draft.id));
      await B1.ev(() => { window.__deaf = true; });
      await A1.page.click('#view [data-act="finish"]'); await wait(300); await sheetsShut(A1);
      await start(A1); await sheetsShut(A1);
      const w2 = await A1.ev(() => window.__ironlog.state.draft && window.__ironlog.state.draft.id);
      await A1.page.click(tickBtn(0, 0)); await wait(250); await A1.page.click(tickBtn(0, 1)); await wait(250);
      await B1.page.click(tickBtn(0, 1)); await wait(500);
      await B1.ev(() => { window.__deaf = false; }); await wait(400);
      const st = await A1.stored(), d = draftOf(st);
      ok(w2 && w2 !== w1 && d && d.id === w2 && d.ticked === 2 && st.sessions.filter(x => x.id === w1).length === 1, 'S-6: a tab behind the other ticks a set in a workout the other finished: the new workout and its two ticked sets are kept, and the finished one is saved once (REV-1)', { d, w1, w2, saved: st.sessions.filter(x => x.id === w1).length });
      ok((await A1.ev(() => window.__ironlog.state.draft && window.__ironlog.state.draft.id)) === w2, 'S-6: and the tab that started it still shows the new workout (REV-1)');
      // REV12-6: the set the tab behind ticked in the finished workout is not dropped: it joins the session saved.
      const s1 = st.sessions.find(x => x.id === w1);
      const n1 = s1 ? s1.ex.reduce((n, b) => n + b.sets.length, 0) : 0;
      ok(n1 === 2, 'S-6: and the set the tab behind ticked in the finished workout joins its saved session (REV12-6)', { sets: s1 && s1.ex.map(b => b.sets.map(x => [x.w, x.r])) });
      const saidB1 = await B1.ev(() => (window.__toasts || []).map(t => t.text));
      // Said with what the merge kept, in one message (toast.ts joins what one change says).
      // NEW-136: said as "saved on another device" until 2.56; it was another tab of this phone.
      ok(saidB1.some(t => t.includes('The workout in progress was saved in another tab. What was done here since was added to it.')), 'S-6: and the tab behind says so, as another tab (REV12-6, NEW-136)', saidB1);
      await A1.close();
    }
    {
      // REV-2: a note changed in tab A, then in tab B, which has not heard it; Undo in B's Settings keeps A's note.
      const A2 = await phone({ seed: function (S) { S.sessions.push({ id: 'k3', date: '2026-11-05', dayIdx: 0, dayName: 'Day 1', notes: 'first', ex: [{ exId: 'bench', sets: [{ w: 62.5, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; } });
      const B2 = await tab(A2, FILE); B2.ev = (f, a) => B2.page.evaluate(f, a); await wait(300);
      await B2.ev(() => { window.__deaf = true; });
      await A2.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'k3').notes = 'typed in tab A'; }); });
      await wait(150);
      await B2.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'k3').notes = 'typed in tab B'; }, { undo: true }); });
      await wait(400);
      await B2.ev(() => { window.__deaf = false; }); await wait(200);
      await B2.page.click('#tabs [data-tab="settings"]'); await wait(200);
      await B2.ev(() => { const d = document.getElementById('dataSec'); if (d && d.tagName === 'DETAILS' && !d.open) d.querySelector('summary').click(); }); await wait(200);
      if (await B2.ev(() => !document.querySelector('#dataSec [data-act="undo"]').disabled)) { await B2.page.click('#dataSec [data-act="undo"]'); await wait(500); }
      const note = (await A2.stored()).sessions.find(s => s.id === 'k3').notes;
      ok(note === 'typed in tab A', 'S-6: Undo in the tab that was behind never takes away the note the other tab typed (REV-2)', note);
      await A2.close();
    }
    {
      // REV-4: a load typed in tab A (saved 0.4 s after the last key); within that, tab B ticks the same row.
      const A3 = await phone({ seed: function (S) { S.settings.lastExport = '2026-11-11'; S.settings.autoDone = false; } });
      const B3 = await tab(A3, FILE); B3.ev = (f, a) => B3.page.evaluate(f, a); await wait(300);
      await start(A3); await B3.page.click('#tabs [data-tab="today"]'); await wait(400);
      const f = (k, s) => `#view input[data-f="${k}"][data-b="0"][data-s="${s}"]`;
      await A3.ev(() => { window.__deaf = true; });
      await A3.page.type(f('w', 0), '110', { delay: 30 });
      await B3.page.fill(f('w', 0), '100'); await B3.page.fill(f('r', 0), '8'); await B3.page.click(tickBtn(0, 0));
      await wait(900);
      await A3.ev(() => { window.__deaf = false; }); await wait(300);
      const x = (await A3.stored()).draft.ex[0].sets[0];
      ok(x.done && x.r === 8, 'S-6: a set ticked in one tab while a load was being typed into it in the other is kept (REV-4)', { w: x.w, r: x.r, done: x.done });
      await A3.close();
    }
    {
      // NEW-129: a workout's clock starts at its first set ticked. Open in two tabs that have not heard each other, each
      // ticks its first set, A's first: the workout began at A's tick, and two starts are not two edits that clash.
      const A6 = await phone({ seed: function (S) { S.settings.lastExport = '2026-11-11'; S.settings.autoDone = false; } });
      const B6 = await tab(A6, FILE); B6.ev = (f, a) => B6.page.evaluate(f, a); await wait(300);
      await start(A6); await B6.page.click('#tabs [data-tab="today"]'); await wait(400);
      await A6.ev(() => { window.__deaf = true; }); await B6.ev(() => { window.__deaf = true; });
      const t0 = await A6.ev(() => Date.now());
      await tick(A6, 0, 0); await wait(300);
      const t1 = await A6.ev(() => Date.now());
      await wait(1200);
      await tick(B6, 0, 1); await wait(600);
      await A6.ev(() => { window.__deaf = false; }); await B6.ev(() => { window.__deaf = false; }); await wait(400);
      const st = await A6.stored();
      const said = [...(await A6.ev(() => (window.__toasts || []).map(t => t.text))), ...(await B6.ev(() => (window.__toasts || []).map(t => t.text)))];
      ok(st && st.draft && storedTicks(st).length === 2 && st.draft.begunAt >= t0 && st.draft.begunAt <= t1, 'S-6: one workout in two tabs, each ticking its first set: both sets kept, and it began at the earlier tick', st && st.draft && { ticks: storedTicks(st), begunAt: st.draft.begunAt, t0, t1 });
      ok(!said.some(t => /edited on two devices/.test(t)), 'S-6: and nothing is said about two edits', said);
      await A6.close();
    }
    {
      // NEW-124: a tab left in the background, where it hears nothing, while the other tab changes a note; shown again,
      // it catches up first, so a change made there after is the later one: kept, with nothing said about a clash.
      const A7 = await phone({ seed: function (S) { S.sessions.push({ id: 'k7', date: '2026-11-05', dayIdx: 0, dayName: 'Day 1', notes: 'first', ex: [{ exId: 'bench', sets: [{ w: 62.5, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; } });
      const B7 = await tab(A7, FILE); B7.ev = (f, a) => B7.page.evaluate(f, a); await wait(300);
      const shown = v => B7.ev(v => { Object.defineProperty(document, 'visibilityState', { value: v, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, v);
      await B7.ev(() => { window.__deaf = true; }); await shown('hidden');
      await A7.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'k7').notes = 'typed in tab A'; }); });
      await wait(300);
      // Shown again, still hearing nothing: being shown is what catches it up.
      await shown('visible'); await wait(250);
      const seen = await B7.ev(() => window.__ironlog.state.sessions.find(s => s.id === 'k7').notes);
      ok(seen === 'typed in tab A', 'S-6: a tab shown again catches up with what the other tab saved meanwhile (NEW-124)', seen);
      await B7.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'k7').notes = 'typed in tab B'; }); });
      await wait(400);
      await B7.ev(() => { window.__deaf = false; }); await wait(300);
      const note = (await A7.stored()).sessions.find(s => s.id === 'k7').notes;
      const said7 = [...(await A7.ev(() => (window.__toasts || []).map(t => t.text))), ...(await B7.ev(() => (window.__toasts || []).map(t => t.text)))];
      ok(note === 'typed in tab B' && !said7.some(t => /two devices|two tabs/.test(t)), 'S-6: so the change made there after is the later one: kept, and no clash is said (NEW-124)', { note, said: said7 });
      await A7.close();
    }
    {
      // REV12-6: tab A finishes the workout; tab B, behind, ticks one more set in it. Closed stays closed, and B's set
      // joins the session A saved, as it does when the two are phones on one account.
      const A8 = await phone({ seed: function (S) { S.settings.lastExport = '2026-11-11'; S.settings.autoDone = false; } });
      const B8 = await tab(A8, FILE); B8.ev = (f, a) => B8.page.evaluate(f, a); await wait(300);
      await start(A8); await tick(A8, 0, 0, '100', '8'); await wait(300);
      await B8.page.click('#tabs [data-tab="today"]'); await wait(300);
      const w = await A8.ev(() => window.__ironlog.state.draft.id);
      await B8.ev(() => { window.__deaf = true; });
      await A8.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.state.draft._rampAsked = true; L.ACT.finishNow(); }); await wait(300);
      await A8.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
      await tick(B8, 0, 1, '100', '7'); await wait(500);
      await B8.ev(() => { window.__deaf = false; }); await wait(400);
      const st = await A8.stored(), s = st.sessions.find(x => x.id === w);
      const sets = s ? s.ex.flatMap(b => b.sets.map(x => x.r)) : null;
      ok(!st.draft && JSON.stringify(sets) === '[8,7]', 'S-6: a set ticked in a tab behind the other, in the workout the other finished, joins the saved session, and the workout stays closed (REV12-6)', { draft: !!st.draft, sets });
      const said8 = await B8.ev(() => (window.__toasts || []).map(t => t.text));
      ok(said8.includes('The workout in progress was saved in another tab. What was done here since was added to it.'), 'S-6: and the tab behind says so, as another tab (REV12-6: dropped without a word; NEW-136: "on another device" until 2.56)', said8);
      ok((await B8.ev(() => !window.__ironlog.state.draft)), 'S-6: and the tab behind shows it closed too');
      await A8.close();
    }
    {
      // The review of 2.53 (REV13-8): two sets ticked, both tabs agreed. Tab B types a load in the next row; within its
      // 0.4 s, before it is saved, tab A's Discard is confirmed. A load typed is nothing logged: the discard stands,
      // and the workout does not come back in History.
      const A9 = await phone({ seed: function (S) { S.settings.lastExport = '2026-11-11'; S.settings.autoDone = false; } });
      const B9 = await tab(A9, FILE); B9.ev = (f, a) => B9.page.evaluate(f, a); await wait(300);
      await start(A9); await tick(A9, 0, 0, '100', '8'); await tick(A9, 0, 1, '100', '8'); await wait(300);
      await B9.page.click('#tabs [data-tab="today"]'); await wait(300);
      const w = await A9.ev(() => window.__ironlog.state.draft.id);
      await A9.page.click('#view [data-act="discard"]'); await wait(300);
      await B9.page.fill('#view input[data-f="w"][data-b="0"][data-s="2"]', '110');
      await confirmOk(A9); await wait(900);
      const st = await A9.stored();
      const back = { draft: !!st.draft, inHistory: st.sessions.some(x => x.id === w), tabB: await B9.ev(id => window.__ironlog.state.sessions.some(x => x.id === id), w) };
      ok(!back.draft && !back.inHistory && !back.tabB, 'S-6: a workout discarded in one tab while a load was typed in the other stays discarded, not saved to History (REV13-8)', back);
      await A9.close();
    }
    {
      // REV13-11: Swap open in tab B on the second exercise; tab A moves that exercise up. The lift picked in tab B
      // replaces the exercise the sheet was opened on, now first, not the one now in its place.
      const A10 = await phone({ seed: function (S) { S.settings.lastExport = '2026-11-11'; } });
      const B10 = await tab(A10, FILE); B10.ev = (f, a) => B10.page.evaluate(f, a); await wait(300);
      await start(A10); await B10.page.click('#tabs [data-tab="today"]'); await wait(300);
      const ids0 = await A10.ev(() => window.__ironlog.state.draft.ex.map(b => b.exId));
      await B10.page.click('#view [data-act="bMenu"][data-b="1"]'); await wait(250); await B10.page.click('#modal [data-act="bMenuDo"][data-op="bSwap"]'); await wait(300);
      await A10.page.click('#view [data-act="bMenu"][data-b="1"]'); await wait(250); await A10.page.click('#modal [data-act="bMenuDo"][data-op="bUp"]'); await wait(500);
      const pick = await B10.ev(not => [...document.querySelectorAll('#pickList .pick[data-ex]')].map(p => p.dataset.ex).find(x => !not.includes(x)), ids0);
      if (pick) { await B10.page.click(`#pickList .pick[data-ex="${pick}"]`); await wait(500); }
      const ids1 = (await A10.stored()).draft.ex.map(b => b.exId);
      ok(pick && ids1[0] === pick && ids1[1] === ids0[0], 'S-6: Swap open in one tab while the other moved that exercise: the pick replaces the exercise the sheet was opened on (REV13-11)', { before: ids0, picked: pick, after: ids1 });
      await A10.close();
    }
    {
      // REV15-5: the same with the note sheet, which holds its exercise as `bi`. The first exercise has a note; tab B
      // opens the second's; tab A moves the second up. The note typed in tab B goes on the exercise it was opened on,
      // and the other keeps its own (it went to the exercise moved into the place, over its note).
      const A11 = await phone({ seed: function (S) { S.settings.lastExport = '2026-11-11'; } });
      const B11 = await tab(A11, FILE); B11.ev = (f, a) => B11.page.evaluate(f, a); await wait(300);
      await start(A11); await B11.page.click('#tabs [data-tab="today"]'); await wait(300);
      await A11.ev(() => window.__ironlog.ACT.bNote({ dataset: { b: '0' } })); await wait(250);
      await A11.page.fill('#mNote', 'elbows tucked'); await A11.page.click('#modal [data-act="noteSave"]'); await wait(500);
      const ids0 = await A11.ev(() => window.__ironlog.state.draft.ex.map(b => b.exId));
      await B11.ev(() => window.__ironlog.ACT.bNote({ dataset: { b: '1' } })); await wait(300);
      await A11.page.click('#view [data-act="bMenu"][data-b="1"]'); await wait(250); await A11.page.click('#modal [data-act="bMenuDo"][data-op="bUp"]'); await wait(600);
      if (await B11.ev(() => !!document.getElementById('mNote'))) { await B11.page.fill('#mNote', 'left shoulder clicks'); await B11.page.click('#modal [data-act="noteSave"]'); await wait(600); }
      const notes = (await A11.stored()).draft.ex.map(b => [b.exId, b.note || '']);
      const of = id => (notes.find(n => n[0] === id) || [])[1];
      ok(of(ids0[1]) === 'left shoulder clicks' && of(ids0[0]) === 'elbows tucked', 'S-6: a note typed in one tab while the other moved that exercise goes on the exercise it was opened on, and the other keeps its own (REV15-5)', notes.slice(0, 3));
      await A11.close();
    }
    {
      // REV-3: the same with both tabs signed in to one account: one copy ends up everywhere, and it is said once.
      const C = cloudOf();
      const A4 = await phone({ cloud: C, uid: 'u6r', seed: function (S) { S.sessions.push({ id: 'k4', date: '2026-11-05', dayIdx: 0, dayName: 'Day 1', notes: 'first', ex: [{ exId: 'bench', sets: [{ w: 62.5, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; } });
      const B4 = await tab(A4, FILE, C.setup('u6r', 'B')); B4.ev = (f, a) => B4.page.evaluate(f, a);
      const on = P => P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 10000 }).then(() => true, () => false);
      const onA = await on(A4), onB = await on(B4);
      ok(onA && onB, 'S-6: (setup) both tabs synced to the account', { onA, onB, B: await B4.ev(() => window.__ironlog.cloudState()) });
      await A4.flush(); await B4.ev(() => window.__ironlog.flush()); await wait(500);
      // Every showing of the message counted, the same words shown again included.
      await B4.ev(() => { window.__said = 0; const el = document.getElementById('toast'); new MutationObserver(ms => { if (!el.hidden && ms.some(m => m.type === 'childList' && m.target === el) && /edited on two devices|changed in two tabs/.test(el.innerText)) window.__said++; }).observe(el, { childList: true, subtree: true }); });
      await B4.ev(() => { window.__deaf = true; });
      await A4.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'k4').notes = 'typed in tab A'; }); });
      await wait(2200);
      await B4.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === 'k4').notes = 'typed in tab B'; }); });
      await wait(1000);
      await B4.ev(() => { window.__deaf = false; });
      await wait(2500);
      await A4.flush(); await B4.ev(() => window.__ironlog.flush()); await wait(800);
      const noteOf = st => (st.sessions.find(x => x.id === 'k4') || {}).notes;
      const got = { save: noteOf(await A4.stored()), account: noteOf(C.doc('u6r', 's-2026-11-1') || { sessions: [] }), A: noteOf(await A4.ev(() => window.__ironlog.state)), B: noteOf(await B4.ev(() => window.__ironlog.state)), said: await B4.ev(() => window.__said) };
      ok(got.save === 'typed in tab A' && got.account === got.save && got.A === got.save && got.B === got.save, 'S-6: signed in, the same record changed in both tabs at once: one whole copy on the phone, in the account and in both tabs (REV-3, NEW-124)', got);
      ok(got.said === 1, 'S-6: and the app says it once (REV-3: twice on 2.50\'s first fix)', got.said);
      await A4.close();
    }
    {
      /* REV13-10: both tabs signed in, the workout open in both; tab A finishes it, and tab B, not yet hearing A,
         ticks one more set, which joins the finished session (NEW-124). Nothing was edited twice, so nothing may say
         so: until 2.56 tab B, writing the account's sync notes it held from before A synced the session, wrote over
         A's, tab A took them, and with no agreed copy of the session left it read its own 3 sets against the
         account's 2 as an edit on two devices. */
      const C = cloudOf();
      const A = await phone({ cloud: C, uid: 'u6n' });
      const B = await tab(A, FILE, C.setup('u6n', 'B')); B.ev = (f, a) => B.page.evaluate(f, a);
      B.toasts = () => B.ev(() => (window.__toasts || []).map(t => t.text));
      B.flush = async () => { await B.ev(() => window.__ironlog.flush()); await wait(120); };
      const on = P => P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 10000 }).then(() => true, () => false);
      ok((await on(A)) && (await on(B)), 'S-6: (setup) both tabs synced to the account');
      await start(A); await tick(A, 0, 0); await tick(A, 0, 1); await wait(300);
      await A.flush(); await wait(300);
      if (!(await B.ev(() => !!document.querySelector('#view [data-act="sDone"]')))) { await B.page.click('#tabs [data-tab="today"]'); await wait(200); if (await B.ev(() => !!document.querySelector('#view [data-act="wkResume"]'))) { await B.page.click('#view [data-act="wkResume"]'); await wait(300); } }
      await B.ev(() => { window.__deaf = true; });
      await A.page.click('#view [data-act="finish"]'); await wait(300);
      for (let k = 0; k < 4 && (await A.ev(() => !!window.__ironlog.ui.modal && window.__ironlog.ui.modal.kind !== 'recap')); k++) { await A.page.click('#modal button:has-text("Finish now"), #modal [data-act="mOk"]').catch(() => {}); await wait(300); }
      await A.flush(); await wait(300);
      await tick(B, 0, 2); await wait(500);
      await B.ev(() => { window.__deaf = false; }); await wait(400);
      await B.flush(); await wait(1600); await A.flush(); await B.flush(); await wait(800);
      const setsOf = st => { const x = (st.sessions || []).find(q => q.ex && q.ex[0] && q.ex[0].sets.length && q.date === '2026-11-11'); return x ? x.ex[0].sets.length : null; };
      const acct = C.sessionsIn('u6n').filter(q => q.date === '2026-11-11').map(q => q.ex[0].sets.length);
      const got = { A: setsOf(await A.ev(() => window.__ironlog.state)), B: setsOf(await B.ev(() => window.__ironlog.state)), account: acct, saidA: await A.toasts(), saidB: await B.toasts() };
      ok(got.A === 3 && got.B === 3 && acct.length === 1 && acct[0] === 3, 'S-6: signed in, a set ticked in a tab behind after the other finished: the session has its 3 sets in both tabs and in the account', got);
      ok(![...got.saidA, ...got.saidB].some(t => /edited on two devices|changed in two tabs/.test(t)), 'S-6: and no message says it was edited twice: the tab behind keeps the notes the other wrote (REV13-10)', got);
      ok(got.saidB.some(t => t.includes('The workout in progress was saved in another tab. What was done here since was added to it.')) && ![...got.saidA, ...got.saidB].some(t => /another device/.test(t)), 'S-6: the tab behind says the workout was saved in another tab, and nothing names another device (NEW-136)', got);
      await A.close();
    }
    {
      /* REV15-2: a tab takes in the other tab's sync notes only with the log they describe. Two tabs of one phone and a
         second phone, one account. The second phone logs a session; tab A pulls it; tab B, which has not yet heard tab
         A's save, syncs. Its notes would then say the account holds the session while its log does not, and its sync
         would send the month's sessions without it, taking it off the account and the second phone. */
      const C = cloudOf();
      const A = await phone({ cloud: C, uid: 'u6r2', seed: function (S) { S.settings.lastExport = '2026-11-11'; S.sessions.push({ id: 'k1', date: '2026-11-05', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); } });
      const B = await tab(A, FILE, C.setup('u6r2', 'B')); B.ev = (f, a) => B.page.evaluate(f, a);
      const P2 = await phone({ cloud: C, uid: 'u6r2', who: 'P2', fresh: true });
      await P2.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.saveNow(); });
      const on = P => P.page.waitForFunction(() => { const c = window.__ironlog.cloudState(); return c.on && c.status === 'synced'; }, null, { timeout: 10000 }).then(() => true, () => false);
      ok((await on(A)) && (await on(B)) && (await on(P2)), 'S-6: (setup) two tabs and a second phone synced to one account');
      const has = (P, id) => P.ev(id => window.__ironlog.state.sessions.some(s => s.id === id), id);
      await B.ev(() => { window.__deaf = true; });
      await P2.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.push({ id: 'S', date: '2026-11-06', dayIdx: 0, dayId: null, dayName: 'Day 1', routineId: '', notes: '', demo: false, deload: false, light: false, ex: [{ exId: 'bench', note: '', rr: null, sets: [{ w: 62.5, r: 8, rir: 2, warm: false, drop: false }] }] }); }); });
      await wait(300); await P2.ev(() => window.__ironlog.flush()); await wait(600);
      await A.ev(() => window.__ironlog.sync()); await wait(600);
      const pulled = { A: await has(A, 'S'), B: await has(B, 'S'), account: C.sessionsIn('u6r2').some(x => x.id === 'S') };
      const w0 = C.writes.length;
      await B.ev(() => window.__ironlog.flush()); await wait(800);
      await P2.ev(() => window.__ironlog.sync()); await wait(600);
      const got = { pulled, wroteB: C.writes.slice(w0).filter(w => w.who === 'B').map(w => w.p.split('/').pop()), account: C.sessionsIn('u6r2').some(x => x.id === 'S'), phone2: await has(P2, 'S') };
      ok(got.pulled.A && !got.pulled.B && got.pulled.account && got.account && got.phone2, 'S-6: a tab that has not yet heard the other tab\'s save syncs: a session the other tab pulled stays in the account and on the phone that logged it (REV15-2)', got);
      await P2.close(); await A.close();
    }
  }

  /* ---------- S-7: Undo ---------- */
  if (run('S-7')) {
    const seed = function (S) { for (let i = 1; i <= 24; i++) S.sessions.push({ id: 'u' + i, date: '2026-10-' + String(i + 1).padStart(2, '0'), dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; };
    const P = await phone({ seed });
    await P.tabTo('history');
    const del = async id => { await P.ev(id => { const L = window.__ironlog; L.ACT.histDel({ dataset: { id } }); }, id); await wait(80); await confirmOk(P); };
    await del('u1');
    // A change that offers no Undo (a set ticked) keeps no step; anything logged after the delete stays.
    const n1 = await P.ev(() => window.__ironlog.undoStack.length);
    await start(P); await tick(P, 0, 0);
    ok((await P.ev(() => window.__ironlog.undoStack.length)) === n1, 'S-7: a change that offers no Undo keeps no Undo step', await P.ev(() => window.__ironlog.undoStack.length));
    await settingsOpen(P, 'dataSec');
    await P.page.click('#dataSec [data-act="undo"]'); await wait(250);
    const after = await P.ev(() => ({ back: window.__ironlog.state.sessions.some(s => s.id === 'u1'), draft: !!window.__ironlog.state.draft && window.__ironlog.state.draft.ex[0].sets[0].done }));
    ok(after.back, 'S-7: "Undo" in Settings puts the deleted session back', after);
    ok(after.draft === true, 'S-7: Undo puts back only what that change did: the set ticked after it stays', after);
    // The app closed right after a change, inside the moment Undo waits before writing its steps: the step is kept,
    // and Undo in Settings takes that change back (NEW-130: the step was lost, and Undo took back the change before it).
    // A phone closes an app from the app switcher, so the page is hidden first, as here, then gone.
    {
      const Q = await phone({ seed });
      await Q.tabTo('history');
      await Q.ev(() => { const L = window.__ironlog; L.ACT.histDel({ dataset: { id: 'u5' } }); }); await wait(80);
      await Q.page.click('#modal [data-act="mOk"]'); await wait(50);
      await Q.ev(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await wait(100);
      await Q.page.reload(); await Q.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(500);
      await settingsOpen(Q, 'dataSec');
      const label = await Q.ev(() => document.querySelector('#dataSec [data-act="undo"]').innerText.trim());
      if (await Q.ev(() => !document.querySelector('#dataSec [data-act="undo"]').disabled)) { await Q.page.click('#dataSec [data-act="undo"]'); await wait(250); }
      const back = await Q.ev(() => window.__ironlog.state.sessions.some(s => s.id === 'u5'));
      ok(/^Undo: /.test(label) && back, 'S-7: closed right after a change, the app keeps its Undo step: "Undo" in Settings names it and puts the deleted session back', { label, back });
      await Q.close();
    }
    // The step is stored as the tap that made the change ends, before anything else can happen: a page torn down straight
    // after, in WebKit, ended no write begun then (NEW-139; the step waited 0.4 s, or for the page to be hidden or left).
    {
      const Q = await phone({ seed });
      await Q.tabTo('history');
      const got = await Q.ev(async () => {
        const L = window.__ironlog;
        L.ACT.histDel({ dataset: { id: 'u5' } });
        document.querySelector('#modal [data-act="mOk"]').click();
        // One task later: the tap has ended, and nothing else has run.
        await new Promise(r => setTimeout(r, 0));
        const db = await new Promise(r => { const q = indexedDB.open('ironlog-undo'); q.onsuccess = () => r(q.result); q.onerror = () => r(null); });
        const all = db && db.objectStoreNames.contains('kv') ? await new Promise(r => { const q = db.transaction('kv').objectStore('kv').getAll(); q.onsuccess = () => r(q.result); q.onerror = () => r([]); }) : [];
        const steps = all.flatMap(v => (Array.isArray(v) ? v : [v])).filter(v => v && typeof v.pre === 'string');
        return { mem: L.undoStack.length, stored: steps.length };
      });
      ok(got.mem === 1 && got.stored === 1, 'S-7: a change\'s Undo step is stored as its tap ends (NEW-139)', got);
      await Q.close();
    }
    // Reloaded at once, with no hiding first (Update, the app closed, another address): the page is gone straight after
    // the change, and the step written as it goes still lands. An earlier step, written a second before, is there too,
    // so a lost step would show as Undo taking back that one instead (the review of 2.52, REV13-1).
    {
      const Q = await phone({ seed });
      await Q.tabTo('history');
      const del = async id => { await Q.ev(id => { window.__ironlog.ACT.histDel({ dataset: { id } }); }, id); await wait(80); await Q.page.click('#modal [data-act="mOk"]'); };
      await del('u4'); await wait(1000);
      await del('u5');
      await Q.page.reload(); await Q.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(500);
      await settingsOpen(Q, 'dataSec');
      if (await Q.ev(() => !document.querySelector('#dataSec [data-act="undo"]').disabled)) { await Q.page.click('#dataSec [data-act="undo"]'); await wait(250); }
      const got = await Q.ev(() => ({ u5: window.__ironlog.state.sessions.some(s => s.id === 'u5'), u4: window.__ironlog.state.sessions.some(s => s.id === 'u4') }));
      ok(got.u5 && !got.u4, 'S-7: reloaded at once after a change, with no hiding first, Undo takes that change back, not the one before it (REV13-1)', got);
      await Q.close();
    }
    // Up to 20 steps: 22 more deletions keep the newest 20.
    for (let i = 2; i <= 23; i++) await del('u' + i);
    const steps = await P.ev(() => window.__ironlog.undoStack.length);
    ok(steps === UNDO_MAX, `S-7: Undo keeps ${UNDO_MAX} steps at most`, steps);
    // Across visits, for 7 days: the steps are there after a reload, still there 7 days less an hour later, and gone
    // 7 days and an hour after they were made (the phone's clock moved on between visits).
    await wait(700);
    const reload = async () => { await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(600); return P.ev(() => window.__ironlog.undoStack.length); };
    ok((await reload()) === UNDO_MAX, 'S-7: the steps are kept across visits');
    const later = ms => P.ctx.addInitScript(off => { const R = Date; class D extends R { constructor(...a) { if (a.length) super(...a); else super(R.now() + off); } static now() { return R.now() + off; } } window.Date = D; }, ms);
    await later(UNDO_DAYS * 864e5 - 3600e3);
    ok((await reload()) === UNDO_MAX, `S-7: ${UNDO_DAYS} days less an hour later, the steps are still kept`);
    await later(2 * 3600e3);
    ok((await reload()) === 0, `S-7: ${UNDO_DAYS} days and an hour later, they are gone`);
    await P.close();
  }

  /* ---------- S-8: Recently deleted ---------- */
  if (run('S-8')) {
    const P = await phone({ seed: (S, L, a) => {
      for (let i = 1; i <= 22; i++) S.sessions.push({ id: 't' + i, date: '2026-10-' + String(i + 1).padStart(2, '0'), dayIdx: 0, dayName: 'Day ' + i, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] });
      S.cardio.push({ id: 'c1', date: '2026-11-02', kind: 'run', min: 30 });
      // Two deletions from before: one 30 days ago, kept; one 31 days ago, gone.
      S.trash = [{ id: 'old30', kind: 'session', date: a[0], data: { id: 'old30', date: '2026-09-01', dayName: 'Kept', ex: [] } }, { id: 'old31', kind: 'session', date: a[1], data: { id: 'old31', date: '2026-09-01', dayName: 'Gone', ex: [] } }];
      S.settings.lastExport = '2026-11-11';
    }, arg: [new Date(Date.parse(DAY + 'T12:00:00Z') - TRASH_DAYS * 864e5).toISOString().slice(0, 10), new Date(Date.parse(DAY + 'T12:00:00Z') - (TRASH_DAYS + 1) * 864e5).toISOString().slice(0, 10)] });
    const ids = () => P.ev(() => window.__ironlog.state.trash.map(t => t.id));
    // The days are counted by this phone's date where Recently deleted is shown, and when something is deleted (a
    // change the lifter makes), never where the log is read, so every phone reads one log the same way (REV12-T2,
    // S-26), and never as a change the app makes by itself at open (the review of 2.53, REV13-9: that marked the log
    // as edited then, and an older edit kept here beat a later one made on another phone). The seeded log opened again:
    await P.page.reload(); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(500);
    ok((await P.ev(() => window.__writes.length)) === 0, `S-8: opening the app with a deletion past its ${TRASH_DAYS} days changes nothing in the log (REV13-9)`, await P.ev(() => window.__writes.length));
    await P.tabTo('history'); await secOpen(P, 'history:trash');
    const listed = () => P.ev(() => [...document.querySelectorAll('#view [data-act="restore"]')].map(b => b.dataset.id));
    ok(JSON.stringify(await listed()) === '["old30"]', `S-8: a deletion ${TRASH_DAYS} days old is listed, one ${TRASH_DAYS + 1} days old is not`, await listed());
    // A session deleted in History, by its Delete button and the confirm.
    await P.page.click('#view [data-act="histToggle"][data-id="t22"]'); await wait(150);
    const said = await P.ev(() => { window.__ironlog.ACT.histDel({ dataset: { id: 't22' } }); const m = document.querySelector('#modal .sheet'); return m ? m.innerText.replace(/\s+/g, ' ') : ''; });
    ok(said.includes(`It stays under Recently deleted for ${TRASH_DAYS} days (the ${TRASH_MAX} most recent items are kept).`), 'S-8: the delete says how long Recently deleted keeps it, and how many', said);
    await confirmOk(P);
    ok(!(await P.stored()).trash.some(t => t.id === 'old31') && (await P.stored()).trash.some(t => t.id === 'old30'), `S-8: and that deletion, a change made, drops the one past its ${TRASH_DAYS} days from the save`, (await P.stored()).trash.map(t => t.id));
    await secOpen(P, 'history:trash');
    const row = await P.ev(() => { const b = document.querySelector('#view [data-act="restore"][data-id="t22"]'); return b ? b.closest('li').innerText.replace(/\s+/g, ' ') : null; });
    ok(row && /Day 22, .*deleted/.test(row), 'S-8: the deleted session is listed under Recently deleted in History, newest first', row);
    ok((await ids())[0] === 't22', 'S-8: newest first', await ids());
    // Cardio goes there too.
    await P.ev(() => { window.__ironlog.ACT.cardioDel ? window.__ironlog.ACT.cardioDel({ dataset: { id: 'c1' } }) : 0; }); await wait(100);
    if (await P.ev(() => !!window.__ironlog.ui.modal)) await confirmOk(P);
    ok((await P.ev(() => window.__ironlog.state.trash.filter(t => t.kind === 'cardio').map(t => t.id))).includes('c1'), 'S-8: deleted cardio is kept there too', await ids());
    // Restore puts it back.
    await P.page.click('#view [data-act="restore"][data-id="t22"]'); await wait(200);
    ok(await P.ev(() => window.__ironlog.state.sessions.some(s => s.id === 't22')) && !(await ids()).includes('t22'), 'S-8: Restore puts the session back and takes it off the list');
    // The 20 most recent: 21 more deletions keep 20, the oldest dropped.
    for (let i = 1; i <= 21; i++) { await P.ev(id => window.__ironlog.ACT.histDel({ dataset: { id } }), 't' + i); await wait(40); await P.page.click('#modal [data-act="mOk"]'); await wait(60); }
    const kept = await ids();
    ok(kept.length === TRASH_MAX && kept[0] === 't21' && !kept.includes('old30'), `S-8: Recently deleted keeps the ${TRASH_MAX} most recent, newest first`, kept);
    // Within a size limit: a list past it drops its oldest entries, never the newest.
    // A long session (about 55,000 characters of notes) deleted on top of the 20: the newest stays, the oldest go.
    await P.ev(() => { const L = window.__ironlog; const big = { id: 'huge', date: '2026-11-10', dayIdx: 0, dayName: 'Huge', notes: '', ex: Array.from({ length: 28 }, () => ({ exId: 'bench', notes: 'm'.repeat(1900), sets: [{ w: 60, r: 8, rir: 2, done: true }] })) }; L.act(() => { L.state.sessions.push(big); }); });
    await P.ev(() => window.__ironlog.ACT.histDel({ dataset: { id: 'huge' } })); await wait(40); await P.page.click('#modal [data-act="mOk"]'); await wait(100);
    const sized = await P.ev(() => ({ n: window.__ironlog.state.trash.length, len: JSON.stringify(window.__ironlog.state.trash).length, first: window.__ironlog.state.trash[0].id }));
    ok(sized.first === 'huge' && sized.len <= 60000 && sized.n > 1 && sized.n < TRASH_MAX, 'S-8: within its size limit, the oldest dropped first', sized);
    await P.close();
    // A ready-made routine removed unchanged is not kept; a routine of your own is.
    const R = await phone({ seed: (S, L) => { const T = L.TEMPLATES[0]; S.routines.push({ ...L.routineFromTemplate(T.key), id: 'tpl' }, { ...JSON.parse(JSON.stringify(S.routines[0])), id: 'mine', name: 'Mine' }); S.settings.lastExport = '2026-11-11'; } });
    for (const which of ['tpl', 'mine']) {
      await R.ev(w => { const L = window.__ironlog; const r = w === 'mine' ? L.state.routines.find(x => x.id === 'mine') : L.state.routines.find(x => L.plainTemplate(x)); L.ui.bRoutine = r.id; L.ACT.rDel(); }, which); await wait(80);
      await confirmOk(R);
    }
    const rt = await R.ev(() => window.__ironlog.state.trash.map(t => t.kind + ':' + t.data.name));
    ok(rt.length === 1 && rt[0] === 'routine:Mine', 'S-8: a deleted routine of your own is kept; a ready-made routine removed unchanged is not', rt);
    await R.close();
  }

  /* ---------- S-9: the account holds the log as small documents ---------- */
  if (run('S-9')) {
    const C = cloudOf();
    const P = await phone({ cloud: C, uid: 'u9', seed: S => {
      S.sessions.push({ id: 'a', date: '2026-10-20', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }, { id: 'b', date: '2026-11-03', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] });
      S.cardio.push({ id: 'c', date: '2026-11-04', kind: 'run', min: 30 });
      S.bodyweights.push({ id: 'w', date: '2025-12-30', kg: 80 }, { id: 'w2', date: '2026-11-01', kg: 80.5 });
      S.injuries = [{ id: 'i', m: 'chest', note: '', date: '2026-11-01' }];
      S.settings.lastExport = '2026-11-11';
    } });
    ok(await P.synced(), 'S-9: (setup) the phone syncs');
    await start(P); await wait(FLUSH_MS + LATE_MS + 400);
    ok(JSON.stringify(C.ids('u9')) === JSON.stringify(['b-2025', 'b-2026', 'core', 'draft', 's-2026-10-2', 's-2026-11-1']), 'S-9: the account holds one document for core, one for the workout in progress, one per half-month of sessions, one per year of body data', C.ids('u9'));
    const core = C.doc('u9', 'core');
    ok(core && core.settings && core.routines.length && core.exercises && core.injuries.length === 1 && Array.isArray(core.trash) && core.bodyweights.length === 0 && !core.sessions, 'S-9: core holds settings, routines, exercises, injuries and Recently deleted, and no sessions or body data', core && Object.keys(core));
    const s11 = C.doc('u9', 's-2026-11-1');
    ok(s11 && s11.sessions.map(x => x.id).join() === 'b' && s11.cardio && s11.cardio.map(x => x.id).join() === 'c', 'S-9: cardio rides with the sessions of its half-month', s11);
    ok(C.doc('u9', 'b-2026').bodyweights.map(x => x.id).join() === 'w2' && C.doc('u9', 'b-2025').bodyweights.map(x => x.id).join() === 'w', 'S-9: weigh-ins go in their year\'s document');
    // A set ticked rewrites only the workout's document.
    const since = await P.ev(() => Date.now());
    await tick(P, 0, 0); await wait(FLUSH_MS + LATE_MS + 400);
    const sent = [...new Set(C.written('u9', since).map(w => w.id))];
    ok(JSON.stringify(sent) === '["draft"]', 'S-9: logging a set rewrites only the workout document', sent);
    await P.close();
  }

  /* ---------- S-10: only documents that changed are sent, each only over the copy last read ---------- */
  if (run('S-10')) {
    const C = cloudOf();
    const seed = S => { S.sessions.push({ id: 'a', date: '2026-11-03', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; };
    const A = await phone({ cloud: C, uid: 'u10', seed });
    ok(await A.settled(), 'S-10: (setup) phone A syncs');
    const B = await phone({ cloud: C, uid: 'u10', who: 'B', browser: A.browser, clock: await clockOf(A) });
    ok(await B.settled(), 'S-10: (setup) phone B syncs');
    await B.sync(); await A.sync();
    // A weigh-in on A: only its year's document is sent.
    const since = await A.ev(() => Date.now());
    await A.ev(() => { const L = window.__ironlog; L.act(() => { L.state.bodyweights.push({ id: 'w', date: '2026-11-10', kg: 81 }); }); });
    await wait(FLUSH_MS + LATE_MS + 400);
    const sent = [...new Set(C.written('u10', since).map(w => w.id))];
    ok(JSON.stringify(sent) === '["b-2026"]', 'S-10: only the document that changed is sent', { sent, all: C.writes.filter(w => w.pageAt >= since).map(w => w.who + ':' + w.p.split('/').pop()) });
    // Both phones log a session in the same half-month, B without having read A's: neither erases the other.
    await A.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.push({ id: 'fromA', date: '2026-11-05', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 70, r: 8, rir: 2, done: true }] }] }); }); });
    await B.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.push({ id: 'fromB', date: '2026-11-06', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 72.5, r: 8, rir: 2, done: true }] }] }); }); });
    await A.flush(); await B.flush(); await A.sync(); await B.sync();
    const inDoc = (C.doc('u10', 's-2026-11-1') || { sessions: [] }).sessions.map(x => x.id).sort();
    ok(JSON.stringify(inDoc) === '["a","fromA","fromB"]', 'S-10: two phones writing the same document never erase each other', inDoc);
    const onA = await A.ev(() => window.__ironlog.state.sessions.map(s => s.id).sort()), onB = await B.ev(() => window.__ironlog.state.sessions.map(s => s.id).sort());
    ok(JSON.stringify(onA) === '["a","fromA","fromB"]' && JSON.stringify(onB) === JSON.stringify(onA), 'S-10: and both phones end with both sessions', { onA, onB });
    // A write lands between B's read and B's write: B's write finds the copy it read gone, reads again and merges, and
    // never writes over A's session.
    let open1; const gate = new Promise(r => { open1 = r; });
    const reached = C.holdGet(/\/s-2026-11-1$/, 'B', gate);
    await B.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.push({ id: 'raceB', date: '2026-11-08', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 75, r: 8, rir: 2, done: true }] }] }); }); });
    const bFlush = B.flush();
    await reached;
    await A.ev(() => { const L = window.__ironlog; L.act(() => { L.state.sessions.push({ id: 'raceA', date: '2026-11-09', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 77.5, r: 8, rir: 2, done: true }] }] }); }); });
    await A.flush();
    open1(); await bFlush; await wait(300); await B.flush(); await A.sync();
    const race = (C.doc('u10', 's-2026-11-1') || { sessions: [] }).sessions.map(x => x.id).filter(x => x.startsWith('race')).sort();
    ok(JSON.stringify(race) === '["raceA","raceB"]', 'S-10: a write that lands between another phone\'s read and its write is never written over: that phone reads again and merges', race);
    // Each write went only over the copy its phone had read: once A's session was in the document, no write left it out.
    const ws = C.writes.filter(w => w.p.endsWith('/s-2026-11-1')).map(w => ({ who: w.who, ids: JSON.parse(JSON.parse(w.v).json).sessions.map(x => x.id) }));
    const firstA = ws.findIndex(w => w.ids.includes('fromA'));
    ok(firstA >= 0 && ws.slice(firstA).every(w => w.ids.includes('fromA')) && ws.some(w => w.who === 'B' && w.ids.includes('fromB') && w.ids.includes('fromA')), 'S-10: a phone writes a document only over the copy it last read: B read and merged A\'s session before writing', ws);
    await A.close();
  }

  /* ---------- S-11: a record changed on two devices ---------- */
  if (run('S-11')) {
    const C = cloudOf();
    const seed = S => { for (const id of ['x', 'y', 'z']) S.sessions.push({ id, date: '2026-11-03', dayIdx: 0, dayName: 'Day 1', notes: 'start', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; };
    const A = await phone({ cloud: C, uid: 'u11', seed });
    ok(await A.settled(), 'S-11: (setup) phone A syncs');
    const B = await phone({ cloud: C, uid: 'u11', who: 'B', browser: A.browser, clock: await clockOf(A) });
    ok(await B.settled(), 'S-11: (setup) phone B syncs'); await B.sync();
    ok(await B.page.waitForFunction(() => window.__ironlog.state.sessions.map(s => s.id).sort().join() === 'x,y,z', null, { timeout: 5000 }).then(() => true, () => false), 'S-11: (setup) B holds the three sessions', await B.ev(() => window.__ironlog.state.sessions.map(s => s.id)));
    const note = (P, id, t) => P.ev(([id, t]) => { const L = window.__ironlog; L.act(() => { L.state.sessions.find(s => s.id === id).notes = t; }); }, [id, t]);
    const del = (P, id) => P.ev(id => { const L = window.__ironlog; L.act(() => { L.state.sessions = L.state.sessions.filter(s => s.id !== id); }); }, id);
    const notesOf = P => P.ev(() => Object.fromEntries(window.__ironlog.state.sessions.map(s => [s.id, s.notes])));
    // Changed on one side only, deletions included: that side's version is kept.
    await note(A, 'x', 'edited on A'); await del(A, 'y'); await A.flush(); await B.sync();
    let nb = await notesOf(B);
    ok(nb.x === 'edited on A' && !('y' in nb), 'S-11: changed on one side only, that side is kept, a deletion included', nb);
    // Changed on both: the copy edited later is kept, and the phone says how many.
    await note(A, 'z', 'from A'); await wait(300); await note(B, 'z', 'from B');
    await A.flush(); await B.flush(); await wait(200); await A.sync(); await B.sync();
    const za = (await notesOf(A)).z, zb = (await notesOf(B)).z;
    ok(za === 'from B' && zb === 'from B', 'S-11: changed on both, the copy edited later is kept on both phones', { za, zb });
    const said = await B.toasts();
    ok(said.includes('1 item was edited on two devices. The later edit was kept.'), 'S-11: and the phone that merged says "1 item was edited on two devices. The later edit was kept."', said);
    // Changed on one side, deleted on the other: it is kept.
    await del(A, 'x'); await note(B, 'x', 'kept on B'); await A.flush(); await B.flush(); await A.sync(); await B.sync();
    const xa = (await notesOf(A)).x, xb = (await notesOf(B)).x;
    ok(xa === 'kept on B' && xb === 'kept on B', 'S-11: changed on one side and deleted on the other, it is kept, with the change', { xa, xb });
    await A.close();
  }

  /* ---------- S-12 and S-13: one workout open on two phones; a first sign-in with two workouts in progress (moved from tests/r56-1.js in 2.50, every check kept) ---------- */
  if (run('S-12') || run('S-13')) {
    const browser = await engine.launch();
    const pages = [];
    let ok = okAs('S-12');
    // ---- (1) One workout open on two phones.
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start(); await A.flush();
      // B on A's clock, so "the later edit" below is read on one clock (the review, T3: each phone's clock started at
      // CLOCK_TWO when it loaded, B about 1.5 s behind A, and the check took either edit).
      const B = await phoneTwo(browser, cloud, 'u1', { clock: await clockOf(A) }); pages.push(B);
      await wait(1200);
      const bd = await B.draft();
      ok(bd && bd.id === (await A.draft()).id && bd.n === 1, 'two phones signed in to one account hold the same workout in progress', bd);
      await A.tick(0, 100, 8); await A.flush();
      await B.tick(1, 100, 7); await B.flush();
      await A.sync(); await B.sync();
      const ad = await A.draft(), bd2 = await B.draft();
      ok(setsOf(ad) === '100x8,100x7' && setsOf(bd2) === '100x8,100x7', 'a set ticked on each phone: both phones hold both sets, merged row by row (328 a and c)', { A: setsOf(ad), B: setsOf(bd2) });
      ok(ad && ad.id === bd2.id && (await A.ev(() => window.__ironlog.state.sessions.length)) === 0, 'the workout stays one workout in progress, and no session was saved for it');
      // The same row ticked on both with different reps: the later edit wins, once, and says so.
      await A.tick(2, 100, 6); await wait(400); await B.tick(2, 100, 5);
      await A.flush(); await B.flush(); await A.sync();
      const ad3 = await A.draft(), bd3 = await B.draft();
      ok(setsOf(ad3) === setsOf(bd3) && /100x5$/.test(setsOf(ad3)) && ad3.sets.filter(s => s.done).length === 3, 'the same row ticked on both phones keeps one of the two, the later edit, and the other rows', { A: setsOf(ad3), B: setsOf(bd3) });
      // A set ticked while signed out joins the workout at the next sign-in (328 c).
      await B.ev(() => window.__ironlog.cloudStop());
      ok(!(await B.cloudState()).on, 'B signs out, keeping its log and its sync notes');
      await B.tick(3, 100, 9);
      await A.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets.push({ w: 110, r: 5, rir: null, warm: false, drop: false, done: true, rid: 'r-a5' }); L.saveNow(); });
      await A.flush();
      await B.ev(() => window.__ironlog.cloudInit()); await wait(1200);
      const bd4 = await B.draft(); await A.sync(); const ad4 = await A.draft();
      ok((await B.cloudState()).on && setsOf(bd4).includes('100x9') && setsOf(bd4).includes('110x5') && setsOf(ad4) === setsOf(bd4), 'a set ticked while signed out, and one ticked on the other phone meanwhile, are both there after the sign-in', { A: setsOf(ad4), B: setsOf(bd4) });
      // Finished on B while A ticked more: A's extra set joins the saved session.
      const did = ad4.id;
      await B.ev(() => { window.__ironlog.ACT.finish(); }); await wait(300);
      await B.ev(() => { const L = window.__ironlog; const m = L.ui.modal; if (m) L.ACT.mClose(); }); await B.flush();
      ok(!(await B.draft()) && (await B.sessions()).some(s => s.id === did), 'B finishes the workout: its session is in the account and its draft document is empty', { sessions: (await B.sessions()).length, doc: !!cloud.doc('u1', 'draft').draft });
      await A.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets.push({ w: 120, r: 3, rir: null, warm: false, drop: false, done: true, rid: 'r-a6' }); L.saveNow(); });
      await A.flush(); await wait(1600); await A.flush();
      const as = await A.sessions();
      const joined = as.find(s => s.id === did);
      ok(!(await A.draft()) && joined && joined.sets.some(([w, r]) => w === 120 && r === 3) && joined.sets.length === 6, 'finished on B while A ticked one more: the set joins the saved session on A, and the workout is closed there', { draft: await A.draft(), joined });
      ok(/saved on another device\. What was done here since was added to it/.test(await A.toast()), 'A is told the workout was saved on the other phone, with what was done here since', await A.toast());
      await B.sync();
      const bs = await B.sessions();
      ok(bs.find(s => s.id === did) && bs.find(s => s.id === did).sets.length === 6, 'B then has the joined session, with A\'s extra set', bs.find(s => s.id === did));
      // Discarded on B while A ticked more: A's workout closes, and the sets ticked there are saved as a session (never dropped).
      await A.start(); await A.tick(0, 80, 10); await A.flush(); await B.sync();
      const xid = (await A.draft()).id;
      ok((await B.draft()) && (await B.draft()).id === xid, 'B holds the new workout');
      await B.ev(() => { const L = window.__ironlog; L.ACT.discard(); }); await wait(200);
      await B.page.click('#modal [data-act="mOk"]'); await wait(200); await B.flush();
      ok(!(await B.draft()) && !cloud.doc('u1', 'draft').draft, 'B discards it: its draft document is empty', cloud.doc('u1', 'draft'));
      await A.tick(1, 80, 9); await A.flush(); await wait(1600); await A.flush();
      ok(!(await A.draft()) && (await A.sessions()).some(s => s.id === xid && s.sets.length === 2), 'discarded on B while A ticked another set: A\'s workout closes and its ticked sets are saved as a session', { draft: await A.draft(), sessions: await A.sessions() });
      ok(/closed on another device\. Its ticked sets are saved in History/.test(await A.toast()), 'A is told the workout was closed on the other phone and its sets saved', await A.toast());
      await B.sync();
      ok(!(await B.draft()) && (await B.sessions()).some(s => s.id === xid && s.sets.length === 2), 'B then has that session and stays closed', { draft: await B.draft(), sessions: await B.sessions() });
      // Finished on A while B had ticked a set A had not pulled: B's set joins the session saved on A.
      await A.start(); await A.tick(0, 90, 10); await A.flush(); await B.sync();
      const yid = (await A.draft()).id;
      await B.tick(1, 90, 9); await B.flush();
      await A.tick(2, 90, 8);
      // Finish with a row left unticked: its question answered, as tests/r43.js finishes.
      await A.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
      await A.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await A.flush(); await wait(1600); await A.flush();
      const ys = (await A.sessions()).find(s => s.id === yid);
      ok(!(await A.draft()) && ys && ys.sets.length === 3 && ys.sets.some(([w, r]) => w === 90 && r === 9), 'finished on A while B had ticked a set A had not pulled: B\'s set joins the session saved on A', { draft: await A.draft(), session: ys });
      ok(/Sets ticked on another device were added to the session saved here/.test(await A.toast()), 'A is told so', await A.toast());
      await B.sync();
      const yb = (await B.sessions()).find(s => s.id === yid);
      ok(!(await B.draft()) && yb && yb.sets.length === 3 && /saved on another device/.test(await B.toast()), 'B then holds the saved session with all three sets and is told the workout was saved on another device', { draft: await B.draft(), session: yb, toast: await B.toast() });
      // A saved session opened for editing in History keeps its rows' ids, so a join after an edit still goes row by row.
      const rids0 = await A.ev(id => window.__ironlog.state.sessions.find(s => s.id === id).ex[0].sets.map(x => x.rid), yid);
      await A.ev(id => { const L = window.__ironlog; L.ui.tab = 'history'; L.render(); L.ACT.histEdit({ dataset: { id } }); }, yid); await wait(150);
      const ridsEdit = await A.ev(() => window.__ironlog.state.draft.ex[0].sets.map(x => x.rid));
      await A.ev(() => { const L = window.__ironlog; L.state.draft._rampAsked = true; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
      await A.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); });
      const rids1 = await A.ev(id => window.__ironlog.state.sessions.find(s => s.id === id).ex[0].sets.map(x => x.rid), yid);
      ok(rids0.length === 3 && rids0.every(r => typeof r === 'string') && ridsEdit.join() === rids0.join() && rids1.join() === rids0.join() && !(await A.draft()), 'a saved session edited in History keeps its rows\' ids through the edit and the save', { rids0, ridsEdit, rids1 });
      await A.flush();
      // The connection gone mid-flush, after B finished and A ticked more: the read of the session's document fails, and
      // A's workout stays as it was, its sets with it, for the retry (the join happening then).
      await A.start(); await A.tick(0, 70, 10); await A.flush(); await B.sync();
      const zid = (await A.draft()).id;
      await B.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
      await B.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await B.flush();
      await A.tick(1, 70, 9);
      await A.ev(() => { window.__dbFail = '/s-'; }); await A.flush(); await wait(300);
      ok((await A.draft()) && (await A.draft()).id === zid && setsOf(await A.draft()) === '70x10,70x9' && !(await A.sessions()).some(s => s.id === zid), 'a read of the session\'s document that fails mid-flush leaves the workout here as it was, its sets with it', { draft: await A.draft(), sessions: await A.sessions(), cloud: await A.cloudState() });
      await A.flush(); await wait(1600); await A.flush();
      const zs = (await A.sessions()).find(s => s.id === zid);
      ok(!(await A.draft()) && zs && zs.sets.length === 2, 'the retry joins the set to the saved session and closes the workout', { draft: await A.draft(), session: zs });
      // Two different workouts: the later edit stays in progress, the other's ticked sets are saved on both phones (328 a).
      await A.start(); await A.tick(0, 60, 12); await A.flush();
      // A first sign-in with two workouts in progress (S-13), on the same two-phone setup.
      ok = okAs('S-13');
      const N = await phoneTwo(browser, cloud, 'u1', { state: { settings: { onboarded: true }, sessions: [], draft: null } }); pages.push(N);
      await wait(300);
      // N holds its own workout in progress, ticked, before it first syncs with the account.
      // N's first pull, in the 300 ms above, may already have brought the account's workout; before 2.35, starting a
      // workout replaced it unasked, and since 2.35 a start opens a workout in progress instead (NEW-89), so the setup
      // takes that pulled copy off N itself, leaving N with only its own workout, as the section means.
      await N.ev(() => { const L = window.__ironlog; L.cloudStop(true); L.state.draft = null; L.saveNow(); });
      await N.start(); await N.tick(0, 40, 15);
      const nid = (await N.draft()).id, aid = (await A.draft()).id;
      await N.ev(() => window.__ironlog.cloudInit()); await wait(1500);
      ok((await N.draft()).id === nid && (await N.sessions()).some(s => s.id === aid), 'a first sign-in with two workouts in progress keeps this phone\'s and saves the other\'s ticked sets (r55)');
      await N.flush();
      // The account's phone ticks a set on its own workout before it next pulls, then flushes: its later edit wins.
      await A.tick(1, 60, 11); await A.flush(); await wait(1600); await A.flush();
      ok((await A.draft()).id === aid && (await A.sessions()).some(s => s.id === nid && s.sets.some(([w, r]) => w === 40 && r === 15)), 'the account\'s phone keeps its own workout in progress and saves the other phone\'s ticked sets as a session', { draft: await A.draft(), sessions: await A.sessions() });
      ok(/Sets ticked on another device were saved in History/.test(await A.toast()), 'and says so', await A.toast());
      await N.sync();
      ok((await N.draft()).id === aid && (await N.sessions()).some(s => s.id === nid && s.sets.some(([w, r]) => w === 40 && r === 15)), 'the new phone then holds the account\'s workout in progress, and its own ticked sets are in its History', { draft: await N.draft(), sessions: await N.sessions() });
      ok(/replaced by the one on another device/.test(await N.toast()), 'the new phone is told its workout was replaced', await N.toast());
    }

    ok = okAs('S-12');
    // ---- (1b) A workout whose rows have no ids (begun on a build before r56.1, or rows an older phone added):
    // finished on one phone while the other ticked a row it had not; the join matches the rows without ids by what
    // they hold, since a saved session keeps no unticked rows and a place means nothing there (PENDING 333: matched
    // by place, the set ticked here took the place of the one finished there, and was lost on both phones).
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start();
      await A.ev(() => { const L = window.__ironlog; const b = L.state.draft.ex[0]; b.sets.forEach(x => { delete x.rid; }); Object.assign(b.sets[0], { w: 100, r: 8, done: true }); L.saveNow(); });
      await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1200); await B.sync();
      const id = (await A.draft()).id;
      ok((await B.draft()) && (await B.draft()).id === id && (await B.ev(() => window.__ironlog.state.draft.ex[0].sets.every(x => x.rid === undefined))), 'set up: both phones hold one workout whose rows have no ids');
      await A.tick(1, 100, 7);
      await A.ev(() => { const L = window.__ironlog; L.state.draft._leftAsked = true; L.ACT.finishNow(); }); await wait(300);
      await A.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); }); await A.flush();
      await B.tick(2, 100, 6); await B.flush(); await wait(1600); await B.flush(); await B.sync(); await A.sync();
      const sa = (await A.sessions()).find(s => s.id === id), sb = (await B.sessions()).find(s => s.id === id);
      const all = x => (x ? x.sets.map(([w, r]) => `${w}x${r}`).join(',') : '-');
      ok(sb && all(sb) === '100x8,100x7,100x6' && all(sa) === all(sb) && !(await B.draft()), 'finished on one phone while the other ticked a row it had not, rows without ids: the set joins the session, every set once, in order', { A: all(sa), B: all(sb) });
    }
    noPageErrors('S-12', pages);
    await browser.close();
  }

  /* ---------- S-14: a phone holding another account's log asks before merging (moved from tests/r56-1.js in 2.50, every check kept) ---------- */
  if (run('S-14')) {
    const browser = await engine.launch();
    const pages = [];
    let ok = okAs('S-14');
    // ---- (2) A phone holding another account's log asks before merging (328 b).
    {
      const cloud = cloudOf();
      const P = await phoneTwo(browser, cloud, 'acctA'); pages.push(P);
      await wait(900);
      await P.ev(() => { const L = window.__ironlog; L.state.sessions.push({ id: 's-a1', date: '2026-10-19', dayIdx: 0, dayId: null, dayName: 'Session', routineId: '', notes: '', demo: false, deload: false, light: false, free: true, ex: [{ exId: 'bench', note: '', rr: null, sets: [{ w: 100, r: 8, rir: 1, warm: false, drop: false }] }] }); L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); });
      await P.flush();
      ok(cloud.doc('acctA', 's-2026-10-2') && (await P.cloudState()).acct === 'acctA', 'a phone synced to account A holds its session and its notes name A');
      await P.ev(() => window.__ironlog.cloudStop());
      await P.ev(() => { window.__uid = 'acctB'; });
      P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
      let m = await P.modal();
      ok(m && m.kind === 'confirm' && /another account/.test(m.title) && m.buttons.includes('Add it to this account') && m.buttons.includes("Use this account's log") && m.buttons.includes('Cancel'), 'signing in to account B on a phone holding A\'s log asks: add it, use this account\'s log, or cancel', m);
      // A second start of the sync while the question is open waits.
      await P.ev(() => { window.__ironlog.cloudInit(); }); await wait(300);
      ok((await P.modal()) && !(await P.cloudState()).on, 'another start of the sync while the question is open changes nothing');
      // Another sheet opened over the question (nothing answered) reads as Cancel, and the sync can be started again.
      await P.ev(() => { window.__ironlog.ACT.exEdit({ dataset: { ex: 'bench' } }); }); await wait(500);
      ok((await P.modal()) && (await P.modal()).kind === 'exEdit' && !(await P.cloudState()).on && (await P.cloudState()).acct === 'acctA', 'a sheet opened over the question closes it as Cancel: nothing synced, the notes still name A', { modal: await P.modal(), state: await P.cloudState() });
      await P.ev(() => window.__ironlog.ACT.mClose());
      P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
      m = await P.modal();
      ok(m && m.kind === 'confirm' && /another account/.test(m.title), 'and the next sign-in asks again', m);
      await P.page.click('#modal [data-act="mClose"]'); await wait(500);
      ok(!(await P.cloudState()).on && (await P.cloudState()).acct === 'acctA' && !cloud.store.has('data/users/acctB/core') && (await P.ev(() => window.__ironlog.state.sessions.length)) === 1, 'Cancel: nothing synced, the notes still name A, the log untouched', { state: await P.cloudState(), keys: [...cloud.store.keys()] });
      // Add it: a first link, the merge as it is.
      P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
      await P.page.click('#modal [data-act="mOk"]'); await wait(1500);
      ok((await P.cloudState()).on && (await P.cloudState()).acct === 'acctB' && cloud.doc('acctB', 's-2026-10-2') && cloud.doc('acctB', 's-2026-10-2').sessions.some(s => s.id === 's-a1'), 'Add it: the log merges into account B as a first link', { state: await P.cloudState(), keys: [...cloud.store.keys()] });
      // No room to keep the log aside: nothing is replaced, and the sign-in is undone (the log stays, the notes still name B).
      await P.ev(() => window.__ironlog.cloudStop());
      // The log kept aside goes to IndexedDB (PENDING 333): its write refused there, as a full disk refuses it.
      await P.ev(() => { window.__uid = 'acctG'; const o = IDBObjectStore.prototype.put; window.__put0 = o; IDBObjectStore.prototype.put = function (...a) { if (/-aside$/.test(this.transaction.db.name)) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); return o.apply(this, a); }; });
      P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
      await P.page.click('#modal [data-act="mAlt"]'); await wait(800);
      ok(!(await P.cloudState()).on && (await P.cloudState()).acct === 'acctB' && (await P.ev(() => window.__ironlog.state.sessions.length)) === 1 && /not enough room on this phone to keep the other log aside/.test(await P.toast()) && !(await P.ev(() => window.__ironlog.asideList())).length, 'with no room to keep the log aside, Use this account\'s log replaces nothing: the log and its notes stay, the sign-in is undone, and the phone says why', { state: await P.cloudState(), toast: await P.toast(), aside: await P.ev(() => window.__ironlog.asideList()) });
      await P.ev(() => { IDBObjectStore.prototype.put = window.__put0; });
      // Use this account's log: the phone's log is kept aside for B, account C's own (empty) log is used.
      await P.ev(() => window.__ironlog.cloudStop());
      await P.ev(() => { window.__uid = 'acctC'; });
      P.ev(() => { window.__ironlog.cloudInit(); }); await wait(700);
      await P.page.click('#modal [data-act="mAlt"]'); await wait(1500);
      const st = await P.cloudState();
      ok(st.on && st.acct === 'acctC' && (await P.ev(() => window.__ironlog.state.sessions.length)) === 0 && (await P.ev(() => window.__ironlog.asideList())).some(a => a.acct === 'acctB' && a.sessions === 1), 'Use this account\'s log: the phone starts on C\'s own log, and B\'s log is kept aside on the phone', { state: st, aside: await P.ev(() => window.__ironlog.asideList()) });
      ok(!cloud.store.has('data/users/acctC/s-2026-10-2'), 'nothing of B\'s log reaches account C', [...cloud.store.keys()]);
      // C's log is empty, so the phone is on the Set up page; once set up, Your data says what is kept aside.
      ok(await P.ev(() => !window.__ironlog.state.settings.onboarded && document.body.classList.contains('obmode')), 'a phone starting on an empty account\'s log is on the first-run Set up page', await P.ev(() => document.body.innerText.slice(0, 200)));
      await P.ev(() => { const L = window.__ironlog; L.state.settings.onboarded = true; L.ui.tab = 'settings'; L.render(); });
      ok(await P.ev(() => /kept on this phone/.test((document.getElementById('asideLine') || {}).textContent || '')), 'Your data says a log from another account is kept on this phone', await P.ev(() => ({ line: !!document.getElementById('asideLine'), data: !!document.getElementById('dataSec'), aside: window.__ironlog.asideList(), text: (document.getElementById('dataSec') || {}).textContent })));
      ok((await P.ev(() => window.__ironlog.undoStack.length)) === 0, 'Undo is cleared when another account\'s log is used (a step held the other account\'s log)');
      // Signing in to B again on this phone: C's log (nothing of the lifter's) is not asked about; B's log comes back from aside and syncs as a continuation.
      await P.ev(() => window.__ironlog.cloudStop());
      await P.ev(() => { window.__uid = 'acctB'; });
      await P.ev(() => window.__ironlog.cloudInit()); await wait(1500);
      const st2 = await P.cloudState();
      ok(!(await P.modal()) && st2.on && st2.acct === 'acctB' && (await P.ev(() => window.__ironlog.state.sessions.map(s => s.id).join())) === 's-a1' && !(await P.ev(() => window.__ironlog.asideList())).length, 'signing in to B again: the log kept aside is back, its notes with it, and nothing is kept aside any more', { state: st2, sessions: await P.sessions(), aside: await P.ev(() => window.__ironlog.asideList()) });
      // A deletion made in C while B's log was aside does not reach B (the review's reproduction, reversed: B's notes were kept with its log).
      // Not asked: notes forgotten (a restore, Copy my log in, demo data, Erase everything).
      await P.ev(() => window.__ironlog.cloudStop(true));
      await P.ev(() => { window.__uid = 'acctD'; });
      await P.ev(() => window.__ironlog.cloudInit()); await wait(1200);
      ok(!(await P.modal()) && (await P.cloudState()).acct === 'acctD' && cloud.doc('acctD', 's-2026-10-2'), 'a phone whose notes were forgotten is not asked: a first link, as before', { state: await P.cloudState() });
      // Not asked: nothing of the lifter's on the phone.
      const Q = await phoneTwo(browser, cloud, 'acctE'); pages.push(Q);
      await wait(900);
      await Q.ev(() => window.__ironlog.cloudStop());
      await Q.ev(() => { window.__uid = 'acctF'; });
      await Q.ev(() => window.__ironlog.cloudInit()); await wait(1200);
      ok(!(await Q.modal()) && (await Q.cloudState()).acct === 'acctF', 'a phone with nothing of the lifter\'s on it is not asked', { state: await Q.cloudState() });
    }
    noPageErrors('S-14', pages);
    await browser.close();
  }

  /* ---------- S-24: the sync notes and the error log as saved: what cannot be read is dropped, the rest kept (moved from tests/r56-1.js in 2.50, every check kept) ---------- */
  if (run('S-24')) {
    const browser = await engine.launch();
    const pages = [];
    let ok = okAs('S-24');
    // ---- (3) Damaged notes and log entries are dropped; a cardio kind is one of the list's keys (305).
    {
      const cloud = cloudOf();
      // No cloud on this page: the notes are read as saved and not rewritten by a sync.
      const R = await open(FILE, { browser, clock: CLOCK, realStarter: true, setup: async (ctx, page) => { await page.addInitScript(() => { localStorage.setItem('ironlog.v1', JSON.stringify({ version: 5, settings: { onboarded: true } })); localStorage.setItem('ironlog.v1.sync', JSON.stringify({ meta: { core: { h: 'abc', at: 5, b: null }, draft: { at: 5 }, 'b-2026': 'x' }, editAt: { core: 7, draft: 'x' }, last: 'x', devId: 'dev-1', acct: 'u9' })); localStorage.setItem('ironlog.v1.log', JSON.stringify([{ t: '2026-10-20T10:00:00.000Z', a: 'x', m: 'kept', v: 'r55' }, { t: 1 }, 'x', null])); }); } }); pages.push(R);
      R.ev = (f, a) => R.page.evaluate(f, a);
      const notes = await R.ev(() => { const L = window.__ironlog; return { meta: Object.keys(L.cloud.meta), editAt: L.cloud.editAt, last: L.cloud.last, log: L.logBuf.map(e => e.m) }; });
      ok(notes.meta.join() === 'core' && JSON.stringify(notes.editAt) === '{"core":7}' && notes.last === null, 'with a save on the phone, a sync note without a fingerprint or a time is dropped, an edit time that is no number too, and a last sync that is no number reads as none', notes);
      ok(notes.log.includes('kept') && notes.log.filter(m => /was not readable and was dropped/.test(m)).length === 2 && notes.log.length === 3, 'the error log keeps its real entries and drops the rest, and says which notes were dropped', notes.log);
      const kind = await R.ev(() => window.__ironlog.normalize({ cardio: [{ date: '2026-10-01', min: 20, kind: 'constructor', when: 'toString' }, { date: '2026-10-02', min: 20, kind: ['walk'], when: 'pre' }] }).cardio.map(c => [c.kind, c.when]));
      ok(JSON.stringify(kind) === '[["other","solo"],["other","pre"]]', 'a cardio kind or time that is not one of the list\'s keys reads as other and solo (r56 let a key Object has, and a list, through)', kind);
    }
    noPageErrors('S-24', pages);
    await browser.close();
  }

  /* ---------- S-4 and S-24: the sync's status is one of its five states; a start time a Date cannot hold is dropped (moved from tests/r56-1.js in 2.50, every check kept) ---------- */
  if (run('S-4') || run('S-24')) {
    const browser = await engine.launch();
    const pages = [];
    let ok = okAs('S-4');
    // ---- (4) The sync's status is one of its five states, and (5) a start time a Date cannot hold is dropped (308).
    {
      const cloud = cloudOf();
      const S = await phoneTwo(browser, cloud, 'u7'); pages.push(S);
      await wait(900);
      const seen = await S.ev(async () => { const L = window.__ironlog; const states = new Set([L.cloudState().status]); L.state.settings.timeBudget = 70; L.saveNow(); const t = setInterval(() => states.add(L.cloudState().status), 5); await L.flush(); await L.sync(); clearInterval(t); states.add(L.cloudState().status); return [...states]; });
      ok(seen.every(s => ['local', 'connecting', 'saving', 'synced', 'offline'].includes(s)) && seen.includes('synced'), 'the sync passes through its five states only', seen);
      ok = okAs('S-24');
      const t = await S.ev(() => { const L = window.__ironlog; const st = L.normalize({ sessions: [{ id: 'x1', date: '2026-10-01', t: 1e17, ex: [{ exId: 'bench', sets: [{ w: 100, r: 8 }] }] }, { id: 'x2', date: '2026-10-01', t: 1760000000000, ex: [{ exId: 'bench', sets: [{ w: 100, r: 8 }] }] }], draft: { date: '2026-10-21', startedAt: 1e17, ex: [] } }); return [st.sessions.map(s => s.t), st.draft.startedAt]; });
      ok(JSON.stringify(t) === '[[null,1760000000000],null]'.replace('null,', 'null,') && t[0][0] === undefined && t[0][1] === 1760000000000 && t[1] === null, 'a start time a Date cannot hold is dropped, one it can hold is kept (r56 kept any positive number)', t);
    }
    noPageErrors('S-4', pages);
    await browser.close();
  }

  /* ---------- S-12: one workout open on two phones, the review's findings (F5, F6, F9, F10, G2, G7, G9, G10) (moved from tests/r56-1c.js in 2.50, every check kept) ---------- */
  if (run('S-12')) {
    const browser = await engine.launch();
    const pages = [];
    const ok = okAs('S-12');
    // ---- F5: a workout begun on the build before, one phone updated mid-workout (its note holds no agreed copy).
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1', OLD_R56); pages.push(A);
      await wait(900); await A.start(4); await A.tick(0, 100, 8); await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1', OLD_R56); pages.push(B);
      await wait(1500); await B.sync();
      await B.tick(1, 100, 8); await B.flush(); await A.sync();
      await A.page.goto('file://' + path.resolve(CURRENT)); await A.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await wait(1500);
      ok(!(await A.ev(() => { const m = window.__ironlog.cloud.meta.draft; return !!(m && m.b && m.b.draft); })), 'set up: phone A updated mid-workout, its note from the build before holds no agreed copy');
      await A.ev(() => { window.__offline = true; }); await A.tick(2, 100, 7); await wait(1500);
      await B.finish(); await B.flush();
      await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush();
      const a = await A.saved(), acct = cloud.sessionsIn('u1').map(s => s.ex[0].sets.map(x => `${x.w}x${x.r}`).join(' '));
      ok(a.join() === '100x8 100x8 100x7' && acct.join() === '100x8 100x8 100x7', 'finished on the other phone while the updated one ticked a set offline: the set joins the session once, the two sets both had are one each (on the stack as reviewed: 100x8 100x8 100x8 100x8 100x7)', { a, acct });
    }

    // ---- The review of 2.52 (REV13-5, REV13-6): a workout opened on phone A and taken in by phone B, nothing ticked;
    // B, offline, ticks a set first; A ticks another a moment later and finishes. Each phone's clock started at its own
    // first set, so the copies hold two starts, and the lift A finished was not in the copy both last agreed on. Joined,
    // B's set is kept and nothing is said to have been edited on two devices; the session keeps the start its minutes
    // were timed from at Finish.
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start(4); await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      await B.ev(() => { window.__offline = true; });
      await B.tick(0, 100, 8); await wait(1200);
      await A.tick(1, 100, 7);
      const aStart = await A.ev(() => window.__ironlog.state.draft.begunAt);
      await A.finish(); await A.flush();
      await B.ev(() => { window.__offline = false; }); await B.flush(); await wait(1600); await B.flush(); await A.sync();
      const sb = (await B.ev(() => window.__ironlog.state.sessions.map(s => ({ t: s.t, n: s.ex.reduce((a, b) => a + b.sets.length, 0) }))))[0];
      const said = await B.toasts();
      ok(sb && sb.n === 2 && sb.t === aStart, 'two starts: the set phone B ticked first joins the session, which keeps the start phone A timed it from', { sb, aStart });
      ok(!said.some(t => /edited on two devices/.test(t)) && said.some(t => /What was done here since was added to it/.test(t)), 'two starts: and phone B is told only of the join, not of an item edited on two devices (REV13-5 and REV13-6: "2 items were edited on two devices")', said);
    }

    // ---- NEW-134: one phone finishes the workout and starts the next; the other, offline and behind, ticks one more
    // set in the first, later. The next workout, which notes the one it follows, stands on both, whichever edit was
    // later, since closing is the lifter's call, and the late set joins the finished session (before, the later edit
    // won: the finished workout came back open on both phones and the next one was saved away as a session). The
    // same with the app closed and opened again between the two workouts, the usual order on a phone (REV15-6: what
    // the phone closed was known for the visit only, so the finished workout came back open on both).
    for (const reopen of [false, true]) {
      const said = reopen ? ' (the app closed and opened again between the two workouts, REV15-6)' : '';
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start(4); await A.tick(0, 100, 8); await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      const w1 = (await B.draft()) && (await B.draft()).id;
      await B.ev(() => { window.__offline = true; });
      await A.finish();
      if (reopen) { await A.flush(); await A.reopen(); }
      await A.start(4); await A.tick(0, 110, 8); await A.flush(); await wait(400);
      const w2 = (await A.draft()) && (await A.draft()).id;
      await wait(1100);
      await B.tick(1, 100, 7); await wait(1500);
      await B.ev(() => { window.__offline = false; }); await B.flush(); await wait(1600); await B.flush(); await A.sync(); await wait(600);
      const ad = await A.draft(), bd = await B.draft();
      ok(w1 && w2 && w2 !== w1 && ad && bd && ad.id === w2 && bd.id === w2 && ad.sets[0].done && bd.sets[0].done, 'moved on: the next workout stands on both phones, its set ticked, whichever edit was later' + said, { w1, w2, ad, bd });
      const s1 = async P => { const s = (await P.sessions()).find(x => x.id === w1); return s ? s.sets.map(x => x.join('x')).join(' ') : null; };
      const a1 = await s1(A), b1 = await s1(B), acct = cloud.sessionsIn('u1').filter(s => s.id === w1).map(s => s.ex[0].sets.map(x => `${x.w}x${x.r}`).join(' '));
      ok(a1 === '100x8 100x7' && b1 === a1 && acct.join() === a1, 'moved on: and the set the phone behind ticked late joins the finished session, on both phones and in the account' + said, { a1, b1, acct });
      ok(!(await A.sessions()).some(s => s.id === w2), 'moved on: and the next workout is not saved away as a session' + said, await A.ids());
    }

    // ---- F6: cardio typed on the phone whose copy lost, with a ticked set and without.
    for (const ticks of [true, false]) {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start(3); await A.tick(0, 100, 8); await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      await A.ev(() => { const L = window.__ironlog; L.ACT.cDraftAdd({ dataset: { when: 'post' } }); const c = L.state.draft.cardio[L.state.draft.cardio.length - 1]; c.kind = 'bike'; c.min = 15; L.saveNow(); });
      if (ticks) await A.tick(1, 100, 7);
      await A.ev(() => { window.__offline = true; }); await wait(1500);
      await B.finish(); await B.flush();
      await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
      const mine = await A.ev(() => window.__ironlog.state.cardio.map(c => `${c.kind} ${c.min}`)), theirs = await B.ev(() => window.__ironlog.state.cardio.map(c => `${c.kind} ${c.min}`));
      const acct = cloud.cardioIn('u1').map(c => `${c.kind} ${c.min}`);
      ok(mine.join() === 'bike 15' && theirs.join() === 'bike 15' && acct.join() === 'bike 15' && (!ticks || (await A.saved()).join() === '100x8 100x7'), `the workout finished on the other phone while this one added 15 min of bike${ticks ? ' and ticked a set' : ' and nothing else'}: the bike is kept once, on both phones and in the account${ticks ? ', the set joined to the session' : ''} (on the stack as reviewed it was gone)`, { mine, theirs, acct, saved: await A.saved() });
    }

    // ---- F9: the same lift twice; one phone removes the first, the other ticks the second.
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900);
      await A.ev(() => { const L = window.__ironlog; if (L.ui.modal) L.ACT.mClose(); L.ACT.startSession({ dataset: { day: '0', light: '0' } }); const d = L.state.draft; const b = d.ex[0]; const nb = L.newBlock(b.exId, { ...b.plan, repMin: 12, repMax: 15, sets: 3 }, {}); d.ex = [b, nb]; b.sets.length = 3; d._rampAsked = true; L.saveNow(); });
      await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      await A.ev(() => { const L = window.__ironlog; L.ACT.bDel({ dataset: { b: '0' } }); }); await wait(200);
      if (await A.modal()) await A.ev(() => window.__ironlog.ACT.mOk());
      await A.flush(); await wait(500);
      await B.tick(0, 60, 14, 1); await B.flush(); await wait(1600); await B.flush(); await A.sync();
      const a = await A.blocks(), b = await B.blocks();
      ok(a === b && /^\w+\[60x14 - -\]$/.test(a), 'the same lift twice, the first removed on one phone while the other ticked the second: one block on both, with its set (on the stack as reviewed the ticked block was there twice)', { a, b });
    }

    // ---- F10: a warm-up added on one phone while the other ticks a set.
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start(3); await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      await A.ev(() => window.__ironlog.ACT.wAdd({ dataset: { b: '0' } })); await wait(200);
      await B.tick(0, 100, 8);
      await B.flush(); await A.flush(); await B.sync(); await A.sync();
      const a = await A.rows(), b = await B.rows();
      ok(a === b && a === 'W:- 100x8 - -', 'a warm-up added on one phone while the other ticked the first set: on both, the warm-up is first and the set is kept (on the stack as reviewed the warm-up went to the bottom)', { a, b });
      await A.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets.find(x => x.warm); s.w = 40; s.r = 10; s.done = true; L.saveNow(); });
      await A.finish(); await A.flush();
      ok((await A.saved()).join() === 'W40x10 100x8', 'and the session is saved with the warm-up first', await A.saved());
    }

    // ---- G2: the agreed copy has nothing ticked (both phones on this build, the workout begun on r56, so rows without ids):
    // one phone ticks the first set offline, the other the second and finishes. Both sets are kept (d04ec3b read the empty
    // agreed copy as none and matched the two identical sets as one).
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1', OLD_R56); pages.push(A);
      await wait(900); await A.start(4); await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1', OLD_R56); pages.push(B);
      await wait(1500); await B.sync();
      for (const P of [A, B]) { await P.page.goto('file://' + path.resolve(CURRENT)); await P.page.waitForFunction(() => window.__ironlog && window.__libs && window.__libs.chart); await P.watch(); await wait(1500); }
      await A.ev(() => { const L = window.__ironlog; L.state.draft.ex[0].sets[0].w = 100; L.saveNow(); }); await A.flush(); await B.sync();
      ok(await A.ev(() => { const m = window.__ironlog.cloud.meta.draft; return !!(m && m.b && m.b.draft && !m.b.draft.ex[0].sets.some(s => s.done)); }), 'set up: the agreed copy is on the phone and has nothing ticked');
      await A.ev(() => { window.__offline = true; }); await A.tick(0, 100, 8); await wait(1500);
      await B.tick(1, 100, 8); await B.finish(); await B.flush();
      await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
      const acct = cloud.sessionsIn('u1').map(s => s.ex[0].sets.map(x => `${x.w}x${x.r}`).join(' '));
      ok(acct.join() === '100x8 100x8' && (await A.saved()).join() === '100x8 100x8' && (await B.saved()).join() === '100x8 100x8', 'a set ticked on each phone after an agreed copy with nothing ticked: both kept, on both phones and in the account (d04ec3b: one)', { acct, A: await A.saved(), B: await B.saved() });
    }

    // ---- G7: cardio on a workout open on two phones, against the copy both agreed on (10 min of bike). Edited to 15 min on the
    // phone whose copy loses, or deleted on the phone that finishes: the edit is kept, the deletion stands (d04ec3b: the edit
    // lost, the deleted row back). Then cardio alone joined to a session saved here is said as cardio, not sets.
    for (const how of ['edit', 'del']) {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start(3); await A.tick(0, 100, 8);
      await A.ev(() => { const L = window.__ironlog; L.ACT.cDraftAdd({ dataset: { when: 'post' } }); const c = L.state.draft.cardio[L.state.draft.cardio.length - 1]; c.kind = 'bike'; c.min = 10; L.saveNow(); });
      await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      await A.ev(() => { window.__offline = true; });
      if (how === 'edit') await A.ev(() => { const L = window.__ironlog; L.state.draft.cardio[0].min = 15; L.saveNow(); });
      await A.tick(1, 100, 7);
      if (how === 'del') await B.ev(() => { const L = window.__ironlog; L.state.draft.cardio = []; L.saveNow(); });
      await wait(1500);
      await B.finish(); await B.flush();
      await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
      const acct = cloud.cardioIn('u1').map(c => `${c.kind} ${c.min}`).join();
      const want = how === 'edit' ? 'bike 15' : '';
      ok(acct === want && (await A.cardio()).log === want && (await B.cardio()).log === want && (await A.saved()).join() === '100x8 100x7', how === 'edit' ? 'cardio edited on the phone whose copy lost (10 to 15 min): the edit is kept, on both phones and in the account (d04ec3b: 10)' : 'cardio deleted on the phone that finished: it stays deleted (d04ec3b: back from the other phone\'s copy)', { acct, A: await A.cardio(), B: await B.cardio() });
    }
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start(3); await A.tick(0, 100, 8); await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      await A.ev(() => { window.__offline = true; }); await A.finish(); await wait(1500);
      await B.ev(() => { const L = window.__ironlog; L.ACT.cDraftAdd({ dataset: { when: 'post' } }); const c = L.state.draft.cardio[L.state.draft.cardio.length - 1]; c.kind = 'bike'; c.min = 12; L.saveNow(); });
      await B.flush();
      await A.ev(() => { window.__offline = false; window.__toasts = []; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
      const t = (await A.toasts()).join(' / ');
      ok((await A.cardio()).log === 'bike 12' && /Cardio logged on another device was added to the session saved here/.test(t) && !/Sets ticked/.test(t), 'cardio alone, logged on the other phone, joined to the session saved here: kept, and said as cardio (d04ec3b: "Sets ticked on another device were added")', { cardio: await A.cardio(), t });
    }

    // ---- G9: a set two past the top of the range moves the next sets up (Next sets: 230.5 lb); then a warm-up added on the other
    // phone lands above it in the merge. The adjusted load stays on the rows under the set it came from, and one tap logs it
    // (d04ec3b: the rows showed 220.5 under "Next sets: 230.5 lb", and one tap logged 220.5).
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start(4);
      await A.ev(() => { const L = window.__ironlog; L.state.settings.unit = 'lb'; const b = L.state.draft.ex[0]; b.plan = { ...b.plan, repMin: 8, repMax: 12, rir: 1 }; L.saveNow(); });
      await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      await B.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[0]; s.w = 100; s.r = 14; L.saveNow(); L.render(); });
      await B.ev(() => window.__ironlog.ACT.sDone({ dataset: { b: '0', s: '0' } })); await wait(300);
      const adjW = await B.ev(() => window.__ironlog.state.draft.ex[0].adj && window.__ironlog.state.draft.ex[0].adj.w);
      await A.ev(() => window.__ironlog.ACT.wAdd({ dataset: { b: '0' } })); await wait(200);
      await B.flush(); await A.flush(); await B.sync(); await A.sync();
      await B.ev(() => window.__ironlog.render()); await wait(300);
      const next = await B.ev(() => window.__ironlog.state.draft.ex[0].sets.findIndex(s => !s.warm && !s.done));
      await B.ev(n => window.__ironlog.ACT.sDone({ dataset: { b: '0', s: String(n) } }), next); await wait(300);
      const logged = await B.ev(n => window.__ironlog.state.draft.ex[0].sets[n].w, next);
      ok(adjW > 100 && Math.abs(logged - adjW) < 1e-9 && (await B.rows()).startsWith('W:- 100x14'), 'the next sets moved up from a set of 14 keep that load when a merge adds a warm-up above: one tap logs it (d04ec3b: the old load)', { adjW, logged, rows: await B.rows() });
    }

    // ---- G10: a join keeps the saved session's order: a warm-up the finishing phone added at the top stays first, and the set
    // this phone ticked since is added after (d04ec3b moved the warm-up below the agreed set).
    {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900); await A.start(3); await A.tick(0, 100, 8); await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      await A.ev(() => { window.__offline = true; }); await A.tick(2, 100, 6); await wait(1200);
      await B.ev(() => window.__ironlog.ACT.wAdd({ dataset: { b: '0' } })); await wait(200);
      await B.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[0]; s.w = 60; s.r = 5; s.done = true; L.saveNow(); });
      await B.tick(2, 100, 7); await B.finish(); await B.flush();
      await A.ev(() => { window.__offline = false; }); await A.flush(); await wait(1600); await A.flush(); await B.sync();
      const acct = cloud.sessionsIn('u1').map(s => s.ex.map(b => b.sets.map(x => `${x.warm ? 'W' : ''}${x.w}x${x.r}`).join(' ')).join(' | '));
      ok(acct.join() === 'W60x5 100x8 100x7 100x6' && (await A.saved()).join() === acct.join() && (await B.saved()).join() === acct.join(), 'a join after the other phone added a warm-up at the top and finished: its order stands, the set ticked here added after (d04ec3b: 100x8 W60x5 100x7 100x6)', { acct, A: await A.saved() });
    }
    noPageErrors('S-12', pages, /quota has been exceeded/i);
    await browser.close();
  }

  /* ---------- S-14: a log kept aside and taken back, the review's findings (F1, F4, G5, G6) (moved from tests/r56-1c.js in 2.50, every check kept) ---------- */
  if (run('S-14')) {
    const browser = await engine.launch();
    const pages = [];
    const ok = okAs('S-14');
    // ---- F1: "Use this account's log" for A, with A's log kept aside, and the save of A's log refused.
    {
      const cloud = cloudOf();
      const P = await phoneTwo(browser, cloud, 'acctA'); pages.push(P);
      await wait(900);
      await addSession(P, sessionTwo('s-a1', '2026-10-19', [[100, 8]])); await P.flush();
      await P.switchTo('acctB', 'mAlt');
      await addSession(P, sessionTwo('s-b1', '2026-10-20', [[60, 10]])); await P.flush();
      ok((await P.ids()).join() === 's-b1' && (await P.ev(() => window.__ironlog.asideList())).some(a => a.acct === 'acctA'), 'set up: the phone is on B with s-b1, A\'s log kept aside');
      await P.ev(() => window.__ironlog.cloudStop()); await P.ev(() => { window.__uid = 'acctA'; });
      P.ev(() => window.__ironlog.cloudInit()).catch(() => {}); await wait(900);
      await refuseSave(P);
      await P.page.click('#modal [data-act="mAlt"]'); await wait(1500);
      const st = await P.ev(() => { const K = window.__ironlog.KEY; const n = JSON.parse(localStorage.getItem(K + '.sync')); return { inUse: window.__ironlog.state.sessions.map(x => x.id), saved: JSON.parse(localStorage.getItem(K)).sessions.map(x => x.id), notes: n.acct, on: window.__ironlog.cloudState().on, aside: window.__ironlog.asideList().map(a => a.acct) }; });
      ok(st.inUse.join() === 's-b1' && st.saved.join() === 's-b1' && st.notes === 'acctB' && !st.on, 'the save of A\'s log refused: the log and its notes are put back as they were (B\'s, naming B), and the sync does not start', st);
      ok(st.aside.join() === 'acctA', 'A\'s log is still kept aside, and nothing of B\'s was kept aside in its place', st.aside);
      ok(/could not save this account's log/.test(await P.toast()), 'and the phone says so', await P.toast());
      await P.reopen(); await P.flush();
      ok(cloud.sessionsIn('acctA').map(s => s.id).join() === 's-a1' && cloud.sessionsIn('acctB').map(s => s.id).join() === 's-b1', 'reopened: account A still holds only s-a1 and account B only s-b1 (on the stack as reviewed, B\'s log synced into A as A\'s own and s-a1 was gone)', { a: cloud.sessionsIn('acctA').map(s => s.id), b: cloud.sessionsIn('acctB').map(s => s.id) });
    }
    // F1 with nothing kept aside: "Use this account's log" for a new account C, the save of the new log refused. The phone
    // opens signed in to C each time (the stand-in's account), as the reviewer's reproduction does.
    {
      const cloud = cloudOf();
      const P = await phoneTwo(browser, cloud, 'acctC'); pages.push(P);
      await wait(900);
      await P.switchTo('acctA');
      await addSession(P, sessionTwo('s-a1', '2026-10-19', [[100, 8]])); await P.flush();
      ok(cloud.sessionsIn('acctA').map(s => s.id).join() === 's-a1', 'set up: the phone is on A with s-a1, synced');
      await P.ev(() => window.__ironlog.cloudStop()); await P.ev(() => { window.__uid = 'acctC'; });
      P.ev(() => window.__ironlog.cloudInit()).catch(() => {}); await wait(900);
      await refuseSave(P);
      await P.page.click('#modal [data-act="mAlt"]'); await wait(1500);
      await P.reopen(); await P.flush();
      await P.sync();
      ok(!cloud.sessionsIn('acctC').length && (await P.ev(() => window.__ironlog.cloudState().acct)) === 'acctA', 'the same with nothing kept aside (account C): reopened, nothing of A\'s log is in C, and the notes still name A (on the stack as reviewed, A\'s log was merged into C)', { c: cloud.sessionsIn('acctC').map(s => s.id), acct: await P.ev(() => window.__ironlog.cloudState().acct) });
    }

    // ---- F4: A's log kept aside is taken back with its notes, so an edit and a deletion made in A meanwhile stand.
    for (const how of ['not asked', 'Add it']) {
      const cloud = cloudOf();
      const P = await phoneTwo(browser, cloud, 'acctA'); pages.push(P);
      await wait(900);
      await addSession(P, sessionTwo('s-a1', '2026-10-19', [[100, 8], [100, 8]]));
      await P.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'bw1', date: '2026-10-18', kg: 80 }); L.state = L.normalize(L.state); L.saveNow(); });
      await P.flush();
      await P.switchTo('acctB', 'mAlt');
      // Another phone on A corrects s-a1's second set and deletes the weigh-in.
      const Q = await phoneTwo(browser, cloud, 'acctA'); pages.push(Q);
      await wait(1500); await Q.sync();
      await Q.ev(() => { const L = window.__ironlog; const c = JSON.parse(JSON.stringify(L.state.sessions.find(x => x.id === 's-a1'))); c.ex[0].sets[1].r = 9; L.state.sessions = L.state.sessions.map(x => (x.id === 's-a1' ? c : x)); L.state = L.normalize(L.state); L.invalidate(); L.saveNow(); });
      await Q.ev(() => window.__ironlog.ACT.delBW({ dataset: { id: 'bw1' } })); await Q.page.click('#modal [data-act="mOk"]'); await wait(200); await Q.flush();
      // With Add it, the phone holds something of B's (a weigh-in), so it is asked.
      if (how === 'Add it') { await P.ev(() => { const L = window.__ironlog; L.state.bodyweights.push({ id: 'bwB', date: '2026-10-20', kg: 70 }); L.state = L.normalize(L.state); L.saveNow(); }); await P.flush(); }
      const asked = await P.switchTo('acctA', 'mOk');
      await P.flush(); await Q.sync();
      const sets = (cloud.sessionsIn('acctA').find(s => s.id === 's-a1') || { ex: [{ sets: [] }] }).ex[0].sets.map(x => `${x.w}x${x.r}`).join(',');
      const bw = cloud.bwIn('acctA').map(b => b.id).sort().join();
      ok(!!asked === (how === 'Add it'), `${how}: ${how === 'Add it' ? 'asked, as the phone holds something of B\'s' : 'not asked, as the phone holds nothing of B\'s'}`, asked);
      ok(sets === '100x8,100x9' && bw === (how === 'Add it' ? 'bwB' : ''), `${how}: the log kept aside comes back with its notes, so the set corrected on the other phone and the weigh-in deleted there stand in account A${how === 'Add it' ? ', and B\'s weigh-in is added' : ''} (on the stack as reviewed, a first link undid both)`, { sets, bw });
      ok(!(await P.ev(() => window.__ironlog.asideList())).length, `${how}: nothing is kept aside any more`);
    }

    // ---- G5: a log kept aside for G comes back while the phone holds nothing of the lifter's (demo data, or the starter
    // routine after the menu's Sign out): it comes back as it was, so no demo session or second routine reaches the account.
    for (const how of ['demo', 'signout']) {
      const cloud = cloudOf();
      const P = await phoneTwo(browser, cloud, 'acctG'); pages.push(P);
      await wait(900);
      await addSession(P, sessionTwo('s-g1', '2026-10-19', [[100, 8]])); await P.flush();
      const routines = uid => { const v = cloud.store.get(`data/users/${uid}/core`); return v ? JSON.parse(JSON.parse(v).json).routines.map(r => r.name) : []; };
      const before = routines('acctG').length;
      await P.switchTo('acctH', 'mAlt'); await P.flush();
      if (how === 'demo') { await P.ev(() => window.__ironlog.cloudStop()); await P.ev(() => window.__ironlog.ACT.demoLoad()); await wait(200); await P.ev(() => window.__ironlog.ACT.mOk()); await wait(500); }
      else await P.ev(() => { const L = window.__ironlog; L.cloudStop(true); L.undoForget(); L.state = L.normalize(null); L.state.settings.onboarded = true; L.saveNow(); L.invalidate(); });
      await P.ev(() => { window.__uid = 'acctG'; }); P.ev(() => window.__ironlog.cloudInit()).catch(() => {}); await wait(1500);
      await P.flush(); await wait(1200); await P.flush();
      const g = cloud.sessionsIn('acctG');
      ok(!(await P.modal()) && g.map(s => s.id).join() === 's-g1' && !g.some(s => s.demo) && routines('acctG').length === before, `${how === 'demo' ? 'demo data loaded' : 'the menu\'s Sign out'}, then G again: G's log comes back as it was, with no demo session and no second routine in the account (d04ec3b: ${how === 'demo' ? '29 demo sessions' : 'two "Upper / lower, 4 days"'})`, { sessions: g.length, demo: g.filter(s => s.demo).length, routines: routines('acctG') });
    }

    // ---- G6: Add it, with a workout open on this phone (W_A) and one in the log kept aside for B (W_B): W_A stays open as it
    // was, typed rows and all, and W_B's ticked set is saved in History, said so (d04ec3b opened W_B and closed W_A, unsaid).
    for (const how of ['Add it', 'not asked']) {
      const cloud = cloudOf();
      const P = await phoneTwo(browser, cloud, 'acctB'); pages.push(P);
      await wait(900);
      await P.start(3); await P.tick(0, 100, 8); await P.flush();
      const WB = await P.ev(() => window.__ironlog.state.draft.id);
      await P.switchTo('acctA', 'mAlt'); await P.flush();
      if (how === 'not asked') await P.ev(() => { const L = window.__ironlog; L.cloudStop(true); L.undoForget(); L.state = L.normalize(null); L.state.settings.onboarded = true; L.saveNow(); L.invalidate(); });
      await P.start(3); await P.tick(0, 60, 10);
      await P.ev(() => { const L = window.__ironlog; const s = L.state.draft.ex[0].sets[1]; s.w = 62.5; s.r = 9; L.saveNow(); });
      await P.flush();
      const WA = await P.ev(() => window.__ironlog.state.draft.id);
      await P.switchTo('acctB', how === 'Add it' ? 'mOk' : null);
      await P.flush(); await wait(1200); await P.flush(); await wait(400);
      const d = await P.draftOf(), ss = await P.ev(() => window.__ironlog.state.sessions.map(s => ({ id: s.id, sets: s.ex.map(b => b.sets.map(x => `${x.w}x${x.r}`).join(' ')).join(' | ') })));
      const t = (await P.toasts()).join(' / ');
      ok(d && d.id === WA && d.rows === '60x10 typed 62.5x9 -' && ss.some(s => s.id === WB && s.sets === '100x8') && /kept for this account.*saved in History/.test(t), `${how}: this phone's workout stays open as it was, the one kept for B is saved in History, and the phone says so (d04ec3b: W_B opened, W_A closed, nothing said)`, { d, WA, WB, ss, t });
    }
    noPageErrors('S-14', pages, /quota has been exceeded/i);
    await browser.close();
  }

  /* ---------- S-3: a phone whose save is refused keeps its notes in step (G4, A-1) (moved from tests/r56-1c.js in 2.50, every check kept) ---------- */
  if (run('S-3')) {
    const browser = await engine.launch();
    const pages = [];
    const ok = okAs('S-3');
    // ---- G4: the phone's storage refuses the log's key (full) but not the notes'. A workout finished and synced, then the app
    // reopened: the notes on the phone still describe the log on the phone, so the pull brings the workout back, and nothing is
    // deleted from the account (r55 and d04ec3b saved the notes ahead of the log, and the reopened phone deleted it everywhere).
    {
      const cloud = cloudOf();
      const P = await phoneTwo(browser, cloud, 'u1'); pages.push(P);
      await wait(900);
      await P.start(3); await P.tick(0, 100, 8); await P.finish(); await P.flush(); await wait(400);
      ok(cloud.sessionsIn('u1').length === 1, 'set up: the first workout is in the account');
      await refuseSave(P);
      await P.start(3); await P.tick(0, 102.5, 8); await P.tick(1, 102.5, 8); await P.finish(); await P.flush(); await wait(1500); await P.flush();
      const menu = await P.ev(() => { const el = document.getElementById('saveState'); return el ? el.getAttribute('aria-label') : ''; });
      ok(cloud.sessionsIn('u1').length === 2 && /Not saving/.test(menu), 'the second workout reaches the account, and the menu says the phone is not saving, signed in or not (PENDING 336; d04ec3b: "Synced")', { menu, acct: cloud.sessionsIn('u1').length });
      await P.ev(() => { window.__offline = true; window.__ironlog.state.settings.timeBudget = 70; window.__ironlog.saveNow(); }); await P.flush(); await wait(400);
      ok(/Not saving/.test(await P.ev(() => { const el = document.getElementById('saveState'); return el ? el.getAttribute('aria-label') : ''; })), 'and offline it never says the log is saved on this device (r55 and d04ec3b: "Offline, saved on this device")');
      await P.ev(() => { window.__offline = false; });
      await P.reopen(); await P.sync(); await wait(1500); await P.flush(); await wait(500);
      ok(cloud.sessionsIn('u1').length === 2 && (await P.ev(() => window.__ironlog.state.sessions.length)) === 2, 'reopened: both workouts are in the account and back on the phone (r55 and d04ec3b: the second was deleted everywhere)', { acct: cloud.sessionsIn('u1').length, phone: await P.ev(() => window.__ironlog.state.sessions.length) });
    }

    // ---- A-1 (the r63 audit, r64): a pull, or a flush that takes in the other phone's copy, whose save on this phone is
    // refused. The notes say what the log on this phone holds, so they are not written ahead of it: reopened, the phone
    // pulls the other phone's session again instead of reading it as deleted (r63 deleted it from the account, then from
    // the other phone), and the menu says the phone is not saving.
    for (const how of ['pull', 'flush']) {
      const cloud = cloudOf();
      const A = await phoneTwo(browser, cloud, 'u1'); pages.push(A);
      await wait(900);
      await addSession(A, sessionTwo('s-a1', '2026-10-19', [[100, 8]])); await A.flush();
      const B = await phoneTwo(browser, cloud, 'u1'); pages.push(B);
      await wait(1500); await B.sync();
      await addSession(B, sessionTwo('s-b1', '2026-10-20', [[60, 10]])); await B.flush();
      ok(cloud.sessionsIn('u1').map(s => s.id).sort().join() === 's-a1,s-b1', `A-1 ${how}, set up: the account holds both phones' sessions`, cloud.sessionsIn('u1').map(s => s.id));
      if (how === 'pull') { await refuseSave(A); await A.sync(); }
      // The flush reads the document before writing it: a change saved here to the same half-month document, then the
      // storage full, so the flush takes in B's copy and the write of the log after it is refused.
      else { await A.ev(() => { const L = window.__ironlog; L.state.sessions.find(s => s.id === 's-a1').notes = 'kept'; L.saveNow(); }); await refuseSave(A); await A.flush(); }
      await wait(1200);
      const menu = await A.ev(() => { const el = document.getElementById('saveState'); return el ? el.getAttribute('aria-label') : ''; });
      ok(/Not saving/.test(menu), `A-1 ${how}: with the save refused, the menu says the phone is not saving (r63: "Synced")`, menu);
      await A.reopen(); await A.sync(); await wait(1500); await A.flush(); await wait(600); await B.sync(); await wait(600);
      const acct = cloud.sessionsIn('u1').map(s => s.id).sort().join(), onA = (await A.ids()).join(), onB = (await B.ids()).join();
      ok(acct === 's-a1,s-b1' && onA === 's-a1,s-b1' && onB === 's-a1,s-b1', `A-1 ${how}: reopened, the other phone's session is pulled again, in the account and on both phones (r63: deleted everywhere)`, { acct, onA, onB });
    }
    noPageErrors('S-3', pages, /quota has been exceeded/i);
    await browser.close();
  }

  /* ---------- S-13: a first sign-in keeps everything the phone made beside the account's ---------- */
  if (run('S-13')) {
    const C = cloudOf();
    const A = await phone({ cloud: C, uid: 'u13', seed: S => { S.sessions.push({ id: 'acct', date: '2026-11-02', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; } });
    ok(await A.settled(), 'S-13: (setup) the account holds a log');
    // A phone not yet signed in (the stand-in gives no user until it signs in), with a log of its own.
    const B = await phone({ cloud: C, uid: null, who: 'B', browser: A.browser, clock: await clockOf(A), seed: (S, L) => {
      S.sessions.push({ id: 'mine', date: '2026-11-04', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 62.5, r: 8, rir: 2, done: true }] }] }, { id: 'demo1', demo: true, date: '2026-11-05', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 50, r: 8, rir: 2, done: true }] }] });
      S.bodyweights.push({ id: 'wMine', date: '2026-11-04', kg: 81 }); S.cardio.push({ id: 'cMine', date: '2026-11-04', kind: 'run', min: 25 });
      S.exercises.push({ ...S.exercises.find(e => e.id === 'bench'), id: 'myPress', name: 'My press', custom: true });
      S.routines.push({ ...JSON.parse(JSON.stringify(S.routines[0])), id: 'myRoutine', name: 'My routine' }, { ...L.routineFromTemplate(L.TEMPLATES[0].key), id: 'tplAsCame' });
      S.settings.lastExport = '2026-11-11';
    } });
    ok(!(await B.cloud()).on, 'S-13: (setup) the second phone is not signed in yet');
    const undo0 = await B.ev(() => window.__ironlog.undoStack.length);
    await B.ev(() => { window.__uid = 'u13'; window.__ironlog.cloudInit(); });
    ok(await B.settled(), 'S-13: the phone signs in and syncs');
    await A.sync();
    const sess = C.doc('u13', 's-2026-11-1').sessions.map(x => x.id).sort();
    ok(JSON.stringify(sess) === '["acct","mine"]', 'S-13: the phone\'s sessions are kept beside the account\'s, and demo data never goes in', sess);
    ok(C.doc('u13', 'b-2026').bodyweights.some(x => x.id === 'wMine') && C.doc('u13', 's-2026-11-1').cardio.some(x => x.id === 'cMine'), 'S-13: its weigh-ins and cardio are kept too');
    const core = C.doc('u13', 'core');
    ok(core.exercises.some(e => e.id === 'myPress') && core.routines.some(r => r.id === 'myRoutine'), 'S-13: its custom exercises and routines are kept', core.routines.map(r => r.name));
    // A ready-made routine left as it came goes in too at a first sign-in (the other account's join, S-14, leaves it
    // out), since the phone may be training on it and a spare routine is one tap to delete (V, 2026-11-11, NEW-127).
    ok(core.routines.some(r => r.id === 'tplAsCame'), 'S-13: a ready-made routine the phone kept as it came is kept too (NEW-127)', core.routines.map(r => r.name));
    const onB = await B.ev(() => ({ s: window.__ironlog.state.sessions.filter(s => !s.demo).map(s => s.id).sort(), undo: window.__ironlog.undoStack.length }));
    ok(JSON.stringify(onB.s) === '["acct","mine"]', 'S-13: the phone holds both logs\' sessions', onB);
    ok(onB.undo <= undo0, 'S-13: the sign-in leaves no Undo step to take it back', { before: undo0, after: onB.undo });
    ok((await A.ev(() => window.__ironlog.state.sessions.map(s => s.id).sort().join())) === 'acct,mine', 'S-13: and the account\'s other phone receives them');
    await A.close();
  }

  /* ---------- S-15: news about the log is never lost under a tap's message ---------- */
  if (run('S-15')) {
    const C = cloudOf();
    const seed = S => { for (const id of ['n1', 'n2', 'n3']) S.sessions.push({ id, date: '2026-11-0' + id.slice(1), dayIdx: 0, dayName: 'Day ' + id, notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; };
    const P = await phone({ cloud: C, uid: 'u15', seed });
    ok(await P.settled(), 'S-15: (setup) the phone syncs');
    const GONE = 'This account no longer exists. Your log stays on this phone.';
    const delTap = async id => { await P.tabTo('history'); await P.page.click(`#view [data-act="histToggle"][data-id="${id}"]`); await wait(120); await P.page.click(`#view [data-act="histDel"][data-id="${id}"]`); await wait(120); await confirmOk(P); };
    // News raised while a tap's message shows waits for it.
    await delTap('n1');
    const t0 = await P.ev(() => Date.now());
    ok(/^Session deleted/.test(await P.toast()), 'S-15: (setup) the tap\'s message shows', await P.toast());
    C.fail('gone', /./, true);
    await P.flush(); await wait(300);
    ok(/^Session deleted/.test(await P.toast()), 'S-15: news from the sync raised meanwhile waits: the tap\'s message stays', await P.toast());
    await P.page.waitForFunction(g => { const el = document.getElementById('toast'); return el && !el.hidden && el.innerText.includes(g); }, GONE, { timeout: 12000 }).catch(() => {});
    const t1 = await P.ev(() => Date.now());
    ok((await P.toast()) === GONE, 'S-15: and shows once the tap\'s message has gone', { toast: await P.toast(), after: t1 - t0 });
    C.clear();
    // News covered by a tap's message within 4 seconds comes back once that message has gone.
    await wait(500); await delTap('n2');
    ok(/^Session deleted/.test(await P.toast()), 'S-15: a tap\'s message is never held back: it covers the news', await P.toast());
    const back = await P.page.waitForFunction(g => { const el = document.getElementById('toast'); return el && !el.hidden && el.innerText.includes(g); }, GONE, { timeout: 12000 }).then(() => true, () => false);
    ok(back, `S-15: news shown less than ${NOTICE_READ_MS / 1000} s before a tap covered it comes back after`, await P.toasts());
    await P.close();
  }

  /* ---------- S-16: offline and failed syncs ---------- */
  if (run('S-16')) {
    const C = cloudOf();
    const P = await phone({ cloud: C, uid: 'u16', seed: S => { S.settings.lastExport = '2026-11-11'; } });
    ok(await P.settled(), 'S-16: (setup) the phone syncs');
    // A sync that fails tries again after 5, 15, 60 and 180 s, then every 180 s; the log stays on the phone.
    C.fail('unavailable', /./, true);
    await P.ev(() => { window.__waits = []; window.__fast = true; });
    await start(P); await tick(P, 0, 0);
    await P.page.waitForFunction(n => window.__waits.length >= n, 6, { timeout: 20000 }).catch(() => {});
    const waits = await P.ev(() => window.__waits.slice(0, 6));
    ok(JSON.stringify(waits) === JSON.stringify([5000, 15000, 60000, 180000, 180000, 180000]), 'S-16: a failing sync tries again after 5, 15, 60 and 180 s, then every 180 s', waits);
    ok(storedTicks(await P.stored()).length === 1, 'S-16: the log stays saved on the phone meanwhile');
    C.clear();
    ok(await P.synced(4000), 'S-16: the next try that reaches the account syncs');
    ok(C.doc('u16', 'draft') && C.doc('u16', 'draft').draft.ex[0].sets[0].done === true, 'S-16: and sends what was waiting');
    C.fail('unavailable', /./, true); await P.ev(() => { window.__waits = []; });
    await tick(P, 0, 1);
    await P.page.waitForFunction(() => window.__waits.length >= 1, null, { timeout: 8000 }).catch(() => {});
    ok((await P.ev(() => window.__waits[0])) === 5000, 'S-16: after a sync that worked, the next failure starts again at 5 s', await P.ev(() => window.__waits));
    C.clear(); await P.ev(() => { window.__fast = false; }); await P.synced(6000);
    // With no network the sync waits rather than retrying, and syncs as soon as the phone is back online.
    await P.ctx.setOffline(true); await P.ev(() => { window.__waits = []; window.__fast = true; });
    await tick(P, 0, 2); await wait(FLUSH_MS + LATE_MS + 300);
    const off = await P.ev(() => ({ waits: window.__waits.slice(), menu: (() => { const el = document.getElementById('saveState'); return el.getAttribute('aria-label'); })() }));
    ok(off.waits.length === 0 && /Offline, saved on this device/.test(off.menu), 'S-16: with no network the sync waits, with no retries, and says "Offline, saved on this device"', off);
    await P.ctx.setOffline(false);
    ok(await P.synced(6000), 'S-16: back online, it syncs at once');
    ok(C.doc('u16', 'draft').draft.ex[0].sets.filter(x => x.done).length === 3, 'S-16: and sends what was done offline');
    await P.ev(() => { window.__fast = false; });
    // Back in the app more than 20 s after the last pull, it pulls again; sooner, it does not.
    const pulls = () => C.reads.filter(r => r.list && r.uid === 'u16').length;
    const back = async ago => { await P.ev(ago => { const L = window.__ironlog; L.cloud.lastPull = Date.now() - ago; window.__shown = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); window.__shown = 'visible'; document.dispatchEvent(new Event('visibilitychange')); }, ago); await wait(500); };
    let n0 = pulls(); await back(PULL_AFTER_MS - 1000);
    ok(pulls() === n0, `S-16: back in the app ${(PULL_AFTER_MS - 1000) / 1000} s after the last pull: no pull`, pulls() - n0);
    n0 = pulls(); await back(PULL_AFTER_MS + 1000);
    ok(pulls() === n0 + 1, `S-16: back in the app ${(PULL_AFTER_MS + 1000) / 1000} s after the last pull: it pulls again`, pulls() - n0);
    await P.close();
  }

  /* ---------- S-17, S-18, S-20: the account's answers ---------- */
  for (const [rule, code, said, off] of [
    ['S-17', 'revoked', 'Your sign-in has expired. Sign in again to sync. Your log stays on this phone.', true],
    ['S-18', 'gone', 'This account no longer exists. Your log stays on this phone.', true],
    ['S-20', 'quota_exceeded', null, false]
  ]) {
    if (!run(rule)) continue;
    const C = cloudOf();
    const P = await phone({ cloud: C, uid: 'u' + rule, seed: S => { S.sessions.push({ id: 'keep', date: '2026-11-03', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; } });
    ok(await P.settled(), `${rule}: (setup) the phone syncs`);
    C.fail(code, /./, true);
    await start(P); await tick(P, 0, 0); await wait(FLUSH_MS + LATE_MS + 300);
    const st = await P.stored(), cs = await P.cloud();
    ok(st.sessions.some(x => x.id === 'keep') && storedTicks(st).length === 1, `${rule}: the log stays on the phone, the set just ticked with it`, storedTicks(st));
    if (off) {
      ok(!cs.on, `${rule}: this phone is signed out of the account`, cs);
      ok((await P.toasts()).includes(said), `${rule}: and says "${said}"`, await P.toasts());
    } else {
      ok(cs.on && cs.err === 'The cloud copy is full. Export a backup and delete old demo data.', 'S-20: the account\'s storage full: the app says "The cloud copy is full. Export a backup and delete old demo data."', cs);
      await settingsOpen(P, 'dataSec');
      ok((await P.ev(() => document.getElementById('dataSec').innerText)).includes('The cloud copy is full. Export a backup and delete old demo data.'), 'S-20: Your data says so', await P.ev(() => document.getElementById('dataSec').innerText.slice(0, 400)));
    }
    C.clear(); await P.close();
  }

  /* ---------- S-19: a document over the size cap ---------- */
  if (run('S-19')) {
    const C = cloudOf();
    const P = await phone({ cloud: C, uid: 'u19', seed: S => { S.settings.lastExport = '2026-11-11'; } });
    ok(await P.settled(), 'S-19: (setup) the phone syncs');
    // A half-month of sessions past 250,000 characters (sessions with long notes), and a weigh-in beside it.
    await P.ev(() => { const L = window.__ironlog; L.act(() => { for (let i = 0; i < 70; i++) L.state.sessions.push({ id: 'big' + i, date: '2026-11-0' + (1 + (i % 9)), dayIdx: 0, dayName: 'Day 1', notes: 'n'.repeat(1900), ex: [{ exId: 'bench', notes: 'm'.repeat(1900), sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); L.state.bodyweights.push({ id: 'w', date: '2026-11-10', kg: 80 }); }); });
    const len = await P.ev(() => JSON.stringify(window.__ironlog.chunksOf(window.__ironlog.state)['s-2026-11-1']).length);
    ok(len > 250000, 'S-19: (setup) the half-month document is over the size cap', len);
    await P.flush(); await wait(300);
    const cs = await P.cloud();
    ok(cs.err === 'One month of sessions is too large to sync. Export a backup.', 'S-19: the app says which part of the log is too large to sync', cs);
    ok(!C.doc('u19', 's-2026-11-1') && C.doc('u19', 'b-2026') && C.doc('u19', 'b-2026').bodyweights.length === 1, 'S-19: that document is left unsent, and the others still sync', C.ids('u19'));
    ok((await P.stored()).sessions.length === 70, 'S-19: nothing is lost on the phone');
    await P.close();
  }

  /* ---------- S-21: the first page waits for the first pull ---------- */
  if (run('S-21')) {
    const C = cloudOf();
    const A = await phone({ cloud: C, uid: 'u21', seed: S => { S.sessions.push({ id: 'theirs', date: '2026-11-03', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; } });
    ok(await A.settled(), 'S-21: (setup) the account holds a log');
    C.holdReads(/./);
    const B = await phone({ cloud: C, uid: 'u21', who: 'B', browser: A.browser, fresh: true, clock: await clockOf(A) });
    await wait(400);
    const held = await B.ev(() => ({ splash: !!document.querySelector('#view .ob-splash'), others: [...document.querySelectorAll('#view .ob > *')].map(e => e.className), buttons: document.querySelectorAll('#view button, #view input').length }));
    ok(held.splash && JSON.stringify(held.others) === '["ob-splash"]' && held.buttons === 0, 'S-21: a new phone signed in shows only the logo until the first pull has been tried', held);
    C.releaseReads();
    await B.page.waitForFunction(() => window.__ironlog.state.sessions.some(s => s.id === 'theirs') && !document.querySelector('#view .ob-splash'), null, { timeout: 8000 }).catch(() => {});
    ok(await B.ev(() => window.__ironlog.state.sessions.some(s => s.id === 'theirs') && window.__ironlog.state.settings.onboarded && !document.querySelector('#view .ob-splash')), 'S-21: then the account\'s log, never an empty one first');
    // Signing in on the first page of a phone opened signed out: the logo alone until the account's log is pulled.
    const D = await phone({ cloud: C, uid: null, who: 'D', browser: A.browser, fresh: true, clock: await clockOf(A) });
    await wait(300);
    const before = await D.ev(() => ({ splash: !!document.querySelector('#view .ob-splash'), page: !!document.getElementById('obPage') }));
    C.holdReads(/./);
    // The sign-in started, and the page drawn again as the sign-in sheet closing draws it.
    await D.ev(() => { window.__uid = 'u21'; window.__ironlog.cloudInit(); }); await wait(200);
    await D.ev(() => window.__ironlog.render()); await wait(200);
    const mid = await D.ev(() => ({ splash: !!document.querySelector('#view .ob-splash'), page: !!document.getElementById('obPage') }));
    ok(!before.splash && before.page && mid.splash && !mid.page, 'S-21: signing in on the first page shows only the logo until the account\'s log is pulled', { before, mid });
    C.releaseReads();
    await D.page.waitForFunction(() => window.__ironlog.state.sessions.some(s => s.id === 'theirs'), null, { timeout: 8000 }).catch(() => {});
    ok(await D.ev(() => window.__ironlog.state.sessions.some(s => s.id === 'theirs') && !document.querySelector('#view .ob-splash')), 'S-21: then the account\'s log');
    await A.close();
  }

  /* ---------- S-23: a log replaced while signed out drops the sync notes ---------- */
  if (run('S-23')) {
    const NOTES = () => { const m = JSON.parse(localStorage.getItem('ironlog.v1.sync') || 'null'); return m ? { acct: m.acct || null, docs: Object.keys(m.meta || {}).length } : null; };
    for (const how of ['Erase everything', 'demo data loaded']) {
      const C = cloudOf();
      const P = await phone({ cloud: C, uid: 'u23', seed: S => { S.sessions.push({ id: 's', date: '2026-11-03', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.settings.lastExport = '2026-11-11'; } });
      ok(await P.settled(), `S-23: (setup) the phone syncs (${how})`);
      // Signed out with the log kept on the phone: the notes stay with it (S-22).
      await P.ev(() => window.__ironlog.cloudStop()); await wait(150);
      const kept = await P.ev(NOTES);
      ok(kept && kept.docs > 0, `S-23: signed out keeping the log, the sync notes stay with it (${how})`, kept);
      if (how === 'Erase everything') {
        await settingsOpen(P, 'more');
        await P.ev(() => window.__ironlog.ACT.resetAll()); await wait(100); await confirmOk(P);
      } else {
        await P.ev(() => { const L = window.__ironlog; L.ACT.demoLoad ? L.ACT.demoLoad() : L.makeDemo(); }); await wait(150);
        if (await P.ev(() => !!window.__ironlog.ui.modal)) await confirmOk(P);
      }
      const gone = await P.ev(NOTES);
      ok(gone && gone.docs === 0 && !gone.acct, `S-23: ${how} while signed out drops the notes`, gone);
      await P.close();
    }
  }

  /* ---------- S-25: fields a build does not know are kept; fields unset stay absent ---------- */
  if (run('S-25')) {
    // A save from a newer build: one phone's log with fields this build does not know, opened on a phone as it starts.
    const W = await phone({ seed: S => { S.settings.lastExport = '2026-11-11'; } });
    const st0 = await W.stored(); await W.close();
    st0.sessions.push({ id: 'f', date: '2026-11-03', dayIdx: 0, dayName: 'Day 1', notes: '', zNew: 1, aNew: { x: 2 }, ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true, later: 'y' }] }] });
    st0.settings.zFuture = 'kept';
    const P = await phone({ raw: JSON.stringify(st0) });
    await start(P); await tick(P, 0, 0);
    const st = await P.stored(); const f = st.sessions.find(x => x.id === 'f');
    const extra = Object.keys(f).filter(k => k === 'zNew' || k === 'aNew');
    ok(JSON.stringify(extra) === '["zNew","aNew"]' && f.aNew.x === 2 && f.ex[0].sets[0].later === 'y' && st.settings.zFuture === 'kept', 'S-25: fields this build does not know are kept, in the order they came, through a later save', { extra, set: f.ex[0].sets[0], zFuture: st.settings.zFuture });
    ok(!('pics' in f) && !('nw' in f.ex[0]) && !('pics' in f.ex[0]), 'S-25: an optional field left unset stays absent', { session: Object.keys(f), ex: Object.keys(f.ex[0]) });
    await P.close();
  }

  /* ---------- S-26: reading the log writes nothing that depends on the device ---------- */
  if (run('S-26')) {
    // A lifter's saved log, as one phone wrote it.
    const W = await phone({ seed: S => { S.settings.unit = 'kg'; S.sessions.push({ id: 'a', date: '2026-11-03', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); S.bodyweights.push({ id: 'w', date: '2026-11-01', kg: 80 }); S.cardio.push({ id: 'c', date: '2026-11-02', kind: 'run', min: 30 }); } });
    await start(W); await tick(W, 0, 0);
    const raw = await W.stored(); await W.close();
    const read = async o => { const P = await phone(o); const c = await P.ev(r => JSON.stringify(window.__ironlog.normalize(JSON.parse(r))), JSON.stringify(raw)); await P.close(); return c; };
    const a = await read({ tz: 'America/Los_Angeles', locale: 'en-US', w: 390 });
    const b = await read({ tz: 'Asia/Tokyo', locale: 'de-DE', w: 1024, dark: true });
    // Where they differ, if they do: the first character apart, with what each says there.
    const at = [...a].findIndex((c, i) => c !== b[i]);
    ok(a === b, 'S-26: two phones (another time zone, language, screen and theme) read the same log the same way', a === b ? '' : { a: a.slice(Math.max(0, at - 200), at + 120), b: b.slice(Math.max(0, at - 200), at + 120) });
    // REV12-T2: the two phones above share one date. At one instant (07:30 UTC on Nov 12) it is still Nov 11 in Los
    // Angeles and already Nov 12 in Tokyo; a deletion made on Oct 12 is then 30 days old on one and 31 on the other.
    const instant = '2026-11-12T07:30:00Z';
    const withOld = JSON.stringify({ ...raw, trash: [{ id: 't1', kind: 'session', date: '2026-10-12', data: { id: 't1', date: '2026-10-01', dayName: 'Old', ex: [] } }] });
    const readAt = async tz => { const P = await phone({ tz, clock: instant, fresh: true }); const c = await P.ev(r => JSON.stringify(window.__ironlog.normalize(JSON.parse(r))), withOld); await P.close(); return c; };
    const la = await readAt('America/Los_Angeles'), tokyo = await readAt('Asia/Tokyo');
    ok(la === tokyo, 'S-26: at one instant, a phone where it is Nov 11 and one where it is Nov 12 read a deletion made Oct 12 the same way (REV12-T2)', la === tokyo ? '' : { losAngeles: la.includes('"t1"'), tokyo: tokyo.includes('"t1"') });
    // REV13-12: a log holding one session's id twice with different sets: the copy with fewer sets goes to Recently
    // deleted, the same entry on both phones at that instant.
    const withDup = JSON.stringify({ ...raw, sessions: [...raw.sessions, { ...raw.sessions.find(x => x.id === 'a'), ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }, { w: 60, r: 7, rir: 2, done: true }] }] }] });
    const readDup = async tz => { const P = await phone({ tz, clock: instant, fresh: true }); const c = await P.ev(r => JSON.stringify(window.__ironlog.normalize(JSON.parse(r)).trash), withDup); await P.close(); return c; };
    const laD = await readDup('America/Los_Angeles'), tokyoD = await readDup('Asia/Tokyo');
    ok(laD === tokyoD && /dup/.test(laD), 'S-26: and a session held twice puts the same entry in Recently deleted on both (REV13-12)', laD === tokyoD ? laD.slice(0, 120) : { losAngeles: laD.slice(0, 160), tokyo: tokyoD.slice(0, 160) });
    // REV15-1: the other copy is kept for the lifter, whatever its date. A session from Sep 14 held twice (moved to Sep 20
    // on one phone while its reps were corrected on another): the copy put aside is offered in Recently deleted, and a
    // deletion made after keeps it (dated Sep 14, it was hidden at once and dropped by the next deletion, and the
    // corrected reps were gone).
    {
      const old = { id: 'o', date: '2026-09-14', dayIdx: 0, dayName: 'Day 1', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 9, rir: 2, done: true }, { w: 60, r: 8, rir: 2, done: true }] }] };
      const P = await phone({ arg: old, seed: function (S, L, o) { S.settings.lastExport = '2026-11-11'; S.sessions.push(o, { ...o, date: '2026-09-20', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }, { w: 60, r: 8, rir: 2, done: true }] }] }, { id: 'y', date: '2026-11-03', dayIdx: 0, dayName: 'Day 2', notes: '', ex: [{ exId: 'bench', sets: [{ w: 60, r: 8, rir: 2, done: true }] }] }); } });
      const held = () => P.ev(() => window.__ironlog.state.trash.filter(t => /dup/.test(t.id)).map(t => t.data.ex[0].sets.map(x => x.r).join()));
      await P.tabTo('history');
      const offered = await P.ev(() => { const v = document.getElementById('view'); const el = v.querySelector('details.sec[data-sk="history:trash"]'); if (el && !el.open) el.querySelector('summary').click(); return [...v.querySelectorAll('[data-act="restore"]')].map(b => b.dataset.id).filter(id => /dup/.test(id)).length; });
      ok((await held()).join() === '9,8' && offered === 1, 'S-26: a session held twice and dated weeks back: the copy put aside is offered in Recently deleted (REV15-1)', { held: await held(), offered });
      await P.ev(() => { const L = window.__ironlog; L.ACT.histDel({ dataset: { id: 'y' } }); }); await wait(80); await confirmOk(P); await wait(200);
      ok((await held()).join() === '9,8', 'S-26: and a deletion made after it keeps that copy (REV15-1)', await held());
      await P.close();
    }
  }

  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL the suite stopped:', e && e.stack || e); process.exit(1); });
