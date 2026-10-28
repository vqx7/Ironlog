// r65: the r63 audit's cleanup, which changes nothing a lifter sees but what
// an error leaves behind (PENDING.md's tracker), each case failing on r64
// unless it says it is a guard (`node tests/r65.js <a dist folder built from
// r64>`; `R65_ONLY=1` runs a section):
//   1  A-12: the built app's start script no longer drops its errors: a
//      service worker that cannot register, or storage the browser will not
//      keep, is written to the app's error log under its own area; an update
//      check that fails offline is expected and logs nothing.
//   2  A-6 (its band half; the PR half went in r64): a muscle's band by any
//      key is one function of the model (bandOfIn), read by Pick for me and,
//      through its adapter, by Stats, not a copy in each (read from the
//      source files: `node tests/r65.js <dist> 2 <src folder>` reads another).
//   3  A-9: values typed in more than one place now come from the one that
//      decides them: the report limit's message (the account script said its
//      own 5), the focus limit's word ("Two at most"), the Guide's muscle lists
//      (from the tables that give a muscle its target), and the dark page
//      colour (five copies, now config's DARK_BG). The source is read from
//      R65_ROOT (a checkout; the repo by default), the Guide from the page.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const H = require('./h');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 700) : ''); } else console.log('ok  ', m); };
const ONLY = process.env.R65_ONLY ? process.env.R65_ONLY.split(',').map(Number) : null;
const run = n => !ONLY || ONLY.includes(n);
const SRC = process.argv[2] || (H.build(), path.join(__dirname, '..', 'dist'));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain' };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-r65-'));
  fs.cpSync(SRC, dir, { recursive: true });
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(dir, p);
    if (!f.startsWith(dir) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await H.engine.launch();

  // ---- 1. A-12: the start script's errors. The worker's registration and the storage request are made to fail as a
  // browser can make them fail (a worker script that will not load, a private window's storage).
  if (run(1)) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      if (navigator.serviceWorker) navigator.serviceWorker.register = () => Promise.reject(new Error('The worker script could not be loaded'));
      if (navigator.storage) { navigator.storage.persisted = () => Promise.resolve(false); navigator.storage.persist = () => Promise.reject(new Error('Storage may not be kept')); }
    });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base); await page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
    // Until both are logged (a wait that times out is left to the checks below).
    await page.waitForFunction(() => ['sw-register', 'storage-persist'].every(a => window.__ironlog.logBuf.some(e => e.a === a)), null, { timeout: 8000 }).catch(() => {});
    const logged = await page.evaluate(() => window.__ironlog.logBuf.map(e => [e.a, e.m]));
    ok(logged.some(([a, m]) => a === 'sw-register' && /could not be loaded/.test(m)), '1. a service worker that cannot register is in the error log, with its reason (r64: dropped)', logged);
    ok(logged.some(([a, m]) => a === 'storage-persist' && /may not be kept/.test(m)), '1. storage the browser will not keep is in the error log, with its reason (r64: dropped)', logged);
    ok(!errors.length, '1. no page errors', errors);
    await ctx.close();
    // A guard: an app that starts as it should logs nothing from its start script.
    const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
    await p2.goto(base); await p2.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
    // Until the worker is running and the storage asked for: the start script's two requests have answered.
    await p2.evaluate(() => Promise.race([Promise.all([navigator.serviceWorker ? navigator.serviceWorker.ready : null, navigator.storage ? navigator.storage.persisted().then(() => navigator.storage.persist()) : null]), new Promise(r => setTimeout(r, 8000))]));
    const quiet = await p2.evaluate(() => window.__ironlog.logBuf.map(e => e.a).filter(a => /^sw-|^storage-persist/.test(a)));
    ok(!quiet.length, '1. (a guard) an app that starts as it should logs nothing from its start script', quiet);
    await ctx2.close();
  }

  // ---- 2. A-6's band half: one function, no copy (from the source, as tests/hygiene.js reads it).
  if (run(2)) {
    const SRCDIR = process.argv[4] || path.join(__dirname, '..', 'src', 'app');
    const files = fs.readdirSync(SRCDIR).filter(f => f.endsWith('.ts'));
    const copies = files.filter(f => /function bandOf\s*\(/.test(fs.readFileSync(path.join(SRCDIR, f), 'utf8')));
    const one = /export function bandOfIn\(M: Model, m: string\)/.test(fs.readFileSync(path.join(SRCDIR, 'model.ts'), 'utf8'));
    ok(one && !copies.length, '2. a muscle\'s band by any key is one function of the model, bandOfIn, with no copy in a screen or the engine (r64: one in pick.ts, one in stats.ts)', { one, copies });
  }

  // ---- 3. A-9: one source for each value the audit found typed in twice.
  if (run(3)) {
    const ROOT = process.env.R65_ROOT || path.join(__dirname, '..');
    const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
    const walk = d => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    const where = [...walk('src'), ...walk('scripts')].filter(f => /\.(ts|js|css|html|py)$/.test(f) && /#08090b/i.test(read(f)));
    ok(where.length === 1 && where[0] === path.join('src', 'app', 'config.ts'), '3. the dark page colour is typed once, in config.ts (r64: in the style sheet twice, page.ts and build.js twice)', where);
    const cloud = read('scripts/cloud-supabase.js');
    ok(/feedback_rate_limited/.test(cloud) && !/\d+ reports/.test(cloud), '3. the account script names no number of reports; the app says its own limit (r64: "You have sent 5 reports today")', (cloud.match(/[^\n]*reports today[^\n]*/) || [''])[0].trim());
    const day = Number((read('src/app/feedback.ts').match(/\bFB_DAY = (\d+)/) || [])[1]);
    const sql = read('SUPABASE.md');
    const lims = [...sql.matchAll(/>= (\d+) then\s+raise exception 'feedback_rate_limited'/g)].map(m => +m[1]);
    const said = [...sql.matchAll(/(\d+) reports a day/g)].map(m => +m[1]);
    ok(day > 0 && lims.length >= 1 && lims.every(x => x === day) && said.every(x => x === day), `3. (a guard) the database's daily limit, in every version of its function, is the app's FB_DAY (${day})`, { day, lims, said });
    ok(!/toast\('(One|Two|Three|Four|Five|Six) at most/.test(read('src/app/settings.ts')), '3. the focus limit\'s toast spells FOCUS_MAX, not a word typed beside it (r64: "Two at most")');
    ok(!/chest, lats|traps, forearms|serratus, rotator cuff/.test(read('src/app/guide.ts')), '3. the Guide types no list of muscles; it reads them from the tables (r64: three lists typed in)');
    const ctx = await browser.newContext(); const page = await ctx.newPage();
    await page.goto(base); await page.waitForFunction(() => window.__ironlog, null, { timeout: 15000 });
    const g = await page.evaluate(() => {
      const L = window.__ironlog;
      L.ACT.guideOpen();
      const t = document.querySelector('#modal .gsec[data-g="stats"] .gbody').textContent.replace(/\s+/g, ' ');
      const low = m => String(L.ML[m]).toLowerCase();
      const lists = [/train directly for size \(([^)]*)\)/, /Every other muscle \(([^)]*)\)/, /name it a focus \(any but ([^)]*)\)/].map(re => ((t.match(re) || [])[1] || '').split(/, and |, | and /));
      // The muscles in their order (ML is built from the muscle table, as MK is).
      const MK = Object.keys(L.ML);
      return { lists, targeted: MK.filter(m => L.hasTarget(m)).map(low), rest: MK.filter(m => !L.hasTarget(m) && !L.TRACK_ONLY.has(m)).concat([...L.TRACK_ONLY]).map(low), never: [...L.TRACK_ONLY].map(low) };
    });
    const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
    ok(same(g.lists[0], g.targeted), '3. the Guide\'s muscles with a target to start are those with one on a new log', g);
    ok(JSON.stringify(g.lists[1]) === JSON.stringify(g.rest), '3. the Guide\'s tracked-only muscles are the rest, in the muscles\' order, those never a focus last (r64: typed, in another order)', { guide: g.lists[1], tables: g.rest });
    ok(JSON.stringify(g.lists[2]) === JSON.stringify(g.never), '3. the muscles the Guide says cannot be a focus are TRACK_ONLY', { guide: g.lists[2], table: g.never });
    await ctx.close();
  }

  await browser.close(); server.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
