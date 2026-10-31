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
//   4  A-9's inline styles: no style attribute in the screens' markup has
//      fixed text (r64 had 342); each is a u- class in the stylesheet, which
//      sets what the attribute did with !important and comes before every
//      other !important rule, so it wins and loses where the attribute did.
//   5  PENDING 304: the import table writes each name once and the type
//      checker is switched off nowhere (r64: 'assisted dip' twice, under a
//      @ts-expect-error); config.ts's values that only the build and the
//      markup read are left out of the page's script (r64: all rode in it),
//      those the page reads kept; and, a guard, the gym's plate lists
//      are the unit's own (gymPlates has read PLATES_KG and PLATES_LB since
//      r54).
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
    // One source for the dark page colour: config's DARK_BG, which every place that needs it reads (the style sheet's
    // dark --bg through {{DARK_BG}}, page.ts and build.js through config), and no other place types the value.
    // Read structurally since r65.1, whose true black (#000000) is also map.ts's 'no glow' for three.js, another meaning.
    const dark = (read('src/app/config.ts').match(/export const DARK_BG = '(#[0-9a-f]{3,6})'/i) || [])[1] || '';
    const css = read('src/02-style.css'), pageTs = read('src/app/page.ts'), build = read('scripts/build.js');
    const bgLines = css.match(/--bg:[^;]*;/g) || [];
    const typed = [...walk('src'), ...walk('scripts')].filter(f => /\.(ts|js|css|html|py)$/.test(f) && !/config\.ts$|map\.ts$/.test(f) && dark && read(f).toLowerCase().includes(dark.toLowerCase()));
    ok(!!dark && bgLines.filter(l => l.includes('{{DARK_BG}}')).length === 2 && /\bDARK_BG\b/.test(pageTs) && (build.match(/cfg\.DARK_BG/g) || []).length >= 2 && typed.length === 0,
      '3. the dark page colour is typed once, in config.ts, and read from there by the style sheet, page.ts and build.js (r64: in the style sheet twice, page.ts and build.js twice)', { dark, bgLines, typed });
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

  // ---- 4. A-9's inline styles, from the source (R65_ROOT names another checkout).
  if (run(4)) {
    const ROOT = process.env.R65_ROOT || path.join(__dirname, '..');
    const app = path.join(ROOT, 'src', 'app');
    const fixed = fs.readdirSync(app).filter(f => f.endsWith('.ts')).flatMap(f => [...fs.readFileSync(path.join(app, f), 'utf8').matchAll(/\bstyle="([^"]*)"/g)].filter(m => !m[1].includes('${')).map(m => `${f}: ${m[1]}`));
    ok(fixed.length === 0, '4. no style attribute in src/app has fixed text (r64: 342)', { count: fixed.length, first: fixed.slice(0, 3) });
    const css = fs.readFileSync(path.join(ROOT, 'src', '02-style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ sel: m[1].trim(), body: m[2], at: m.index }));
    const util = rules.filter(r => /^\.u-[\w-]+$/.test(r.sel));
    const lastUtil = Math.max(...util.map(r => r.at));
    const important = rules.filter(r => !/^\.u-/.test(r.sel) && /!important/.test(r.body));
    ok(util.length > 0 && util.every(r => r.body.split(';').filter(d => d.trim()).every(d => /!important\s*$/.test(d))), `4. each of the ${util.length} u- classes sets every declaration !important, as an attribute wins over every ordinary rule`, util.filter(r => !r.body.split(';').filter(d => d.trim()).every(d => /!important\s*$/.test(d))).map(r => r.sel));
    ok(important.every(r => r.at > lastUtil), '4. every other !important rule comes after the u- classes, so it wins over them as it did over the attribute', important.filter(r => r.at < lastUtil).map(r => r.sel));
  }

  // ---- 5. PENDING 304, from the source (R65_ROOT names another checkout) and the built page (the first argument).
  if (run(5)) {
    const ROOT = process.env.R65_ROOT || path.join(__dirname, '..');
    const app = path.join(ROOT, 'src', 'app');
    const imp = fs.readFileSync(path.join(app, 'importing.ts'), 'utf8');
    const table = (imp.match(/export const IMP_ALIAS[^=]*= \{([\s\S]*?)\n\};/) || [])[1] || '';
    const keys = [...table.matchAll(/^\s*'([^']+)':/gm)].map(m => m[1]);
    const twice = keys.filter((k, i) => keys.indexOf(k) !== i);
    ok(keys.length > 50 && !twice.length, `5. the import table writes each of its ${keys.length} names once (r64: 'assisted dip' twice)`, twice);
    const off = fs.readdirSync(app).filter(f => f.endsWith('.ts') && /(\/\/|\/\*)\s*@ts-(expect-error|ignore|nocheck)\b/.test(fs.readFileSync(path.join(app, f), 'utf8')));
    ok(!off.length, '5. the type checker is switched off nowhere in src/app (r64: one @ts-expect-error, for that key)', off);
    const cfgSrc = fs.readFileSync(path.join(app, 'config.ts'), 'utf8');
    const exported = [...cfgSrc.matchAll(/^export const (\w+)/gm)].map(m => m[1]);
    const others = fs.readdirSync(app).filter(f => f.endsWith('.ts') && f !== 'config.ts').map(f => fs.readFileSync(path.join(app, f), 'utf8')).join('\n');
    const imported = new Set([...others.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'\.\/config'/g)].flatMap(m => m[1].split(',').map(x => x.trim().split(/\s+as\s+/)[0]).filter(Boolean)));
    // What the page needs: a value a module imports, and any config.ts declaration one of those is made from (THREE_URLS from THREE_VERSION).
    const decl = new Map([...cfgSrc.matchAll(/^(?:export )?const (\w+)[\s\S]*?;$/gm)].map(m => [m[1], m[0]]));
    const needed = new Set(imported);
    for (let grew = true; grew; ) { grew = false; for (const k of [...needed]) for (const [d] of decl) if (!needed.has(d) && new RegExp(`\\b${d}\\b`).test((decl.get(k) || '').replace(/^(?:export )?const \w+/, ''))) { needed.add(d); grew = true; } }
    const buildOnly = exported.filter(k => !needed.has(k)), pageRead = exported.filter(k => needed.has(k));
    const page = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
    const declared = k => new RegExp(`\\bvar ${k} =`).test(page);
    ok(buildOnly.length >= 10 && buildOnly.every(k => !declared(k)), `5. none of the ${buildOnly.length} values config.ts defines for the build and the markup alone is in the page's script (r64: all of them)`, buildOnly.filter(declared));
    ok(pageRead.length >= 10 && pageRead.every(declared), `5. (a guard) each of the ${pageRead.length} the page's modules read is in it`, pageRead.filter(k => !declared(k)));
    const gym = fs.readFileSync(path.join(app, 'gym.ts'), 'utf8');
    ok(/return \[\.\.\.\(u === 'kg' \? PLATES_KG : PLATES_LB\)\];/.test(gym) && !/\[45, 35, 25/.test(gym) && !/\[25, 20, 15/.test(gym), '5. (a guard) the gym\'s plate lists are the unit\'s own, PLATES_KG and PLATES_LB, typed once in units.ts (since r54)');
  }

  await browser.close(); server.close();
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
