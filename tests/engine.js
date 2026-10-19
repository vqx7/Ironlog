// The engine runs alone (phase 3b, r52; ARCHITECTURE.md). The modules of
// the engine and the analytics, bundled for Node with no page, are given the
// wide histories of tests/r52.js as the page normalized them (normalize()
// stays in the legacy script until phase 4), deep-frozen, with the page's
// language and time zone. Each of the names live.ts gives the legacy
// script (r52's 74, routineUpdates since r53, and since r54 plannedSets,
// stallWeeks, avgFirstWeek and lastLighterWeek, read from live.ts) is called
// with the page's own arguments on a fresh model and must
// give the page's answer, then again on a second fresh model; so is each of
// PLAIN, the engine's functions the legacy script calls directly that take
// no model (since r53 avgWeeksTxt, whose lines no adapter reaches). The bundle runs
// strict, so a write to the frozen log, a frozen argument or one of the
// modules' tables (all frozen too) throws and shows as a different answer;
// and on every tenth history the second model reads the log through a proxy
// that records any attempt to change it, so an attempt whose error the code
// catches is seen as well. The functions only the engine calls (sgEasyIn, idxLiftIn and the
// like) are reached through these, and how much of each module runs is
// measured with V8's own coverage and Node's source maps: the lines run in
// each module are a ratchet in ARCHITECTURE.md that may only rise.
// One time zone on every machine, for the page and for Node (the browser
// inherits it), so the same histories run the same lines everywhere and the
// ratchet below reads the same on GitHub as here.
if (process.argv[2] !== '--child') process.env.TZ = 'UTC';
const fs = require('fs'); const path = require('path'); const os = require('os');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..'); const APP = path.join(ROOT, 'src', 'app');
const MODULES = ['model', 'units', 'routines', 'gym', 'format', 'loads', 'analytics', 'time', 'weeks', 'coach', 'engine'];
// The histories of tests/r52.js, all of them, in batches of 100 (each batch's calls are about 100 MB as text).
const K = +process.env.ENGINE_N || 1000, BATCH = 100;
// The engine's functions that take no model and that the digest calls (tests/wide.js), run in Node beside the adapters.
const PLAIN = ['avgWeeksTxt'];
// Every adapter live.ts gives the legacy script, read from live.ts itself, so a new one cannot go uncalled.
const ADAPTERS = [...fs.readFileSync(path.join(APP, 'live.ts'), 'utf8').matchAll(/^export const (\w+) = live\(\w+In\);$/gm)].map(m => m[1]);
// The adapters added since r53, which the digest does not call: tests/wide.js is shared with the comparisons pinned
// to r52 and r53 (tests/r52.js, tests/r53w.js), so their calls are made here, after it, with these arguments.
const EXTRA = { plannedSets: (s) => s.routines.map(r => [r]), stallWeeks: (s, ids) => ids.map(id => [id]), avgFirstWeek: () => [[]], lastLighterWeek: () => [[]] };

// The child: the bundle on the page's histories, under V8's coverage.
if (process.argv[2] === '--child') {
  const { decode, ser, err } = require('./wide');
  const [dataFile, bundleFile] = process.argv.slice(3);
  const E = require(bundleFile);
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  // Every value a module keeps (its tables), frozen, so a write to one by any
  // path throws, an alias included (the second r52 review), but for the date
  // formatters hygiene's rule 6 lists, which only gain entries.
  const STATE_OK = new Set(['DTF']);
  const freezeDeep = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.getOwnPropertyNames(v)) freezeDeep(v[k]); } return v; };
  let tables = 0; for (const [k, v] of Object.entries(E)) if (v && typeof v === 'object' && !STATE_OK.has(k)) { freezeDeep(v); tables++; }
  const out = { locale: Intl.DateTimeFormat().resolvedOptions().locale, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, calls: 0, same: 0, again: 0, first: null, names: {}, tables, watched: 0, writes: [] };
  // A log that records every attempt to change it, even one whose error the
  // code catches (the second r52 review swallowed one): a proxy over an
  // unfrozen copy, each object reached through it watched too.
  const watch = (root, seen) => {
    const wrap = new WeakMap();
    const p = (o, path) => {
      if (!o || typeof o !== 'object') return o;
      if (wrap.has(o)) return wrap.get(o);
      const pr = new Proxy(o, {
        get: (t, k, r) => p(Reflect.get(t, k, r), path + '.' + String(k)),
        set: (t, k) => { seen.push(`${path}.${String(k)} set`); return false; },
        defineProperty: (t, k) => { seen.push(`${path}.${String(k)} defined`); return false; },
        deleteProperty: (t, k) => { seen.push(`${path}.${String(k)} deleted`); return false; },
        setPrototypeOf: () => { seen.push(`${path} prototype set`); return false; },
        preventExtensions: () => { seen.push(`${path} frozen or sealed`); return false; }
      });
      wrap.set(o, pr); return pr;
    };
    return p(root, 'log');
  };
  const freeze = v => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) freeze(v[k]); } return v; };
  for (const h of data.histories) {
    const state = freeze(decode(h.state));
    const byName = new Map();
    for (const line of h.calls) { const [name, args, res] = line.split('\t'); if (!byName.has(name)) byName.set(name, []); byName.get(name).push([args, res]); }
    for (const [tagged, calls] of byName) {
      const name = tagged.replace(/^~/, ''), plain = PLAIN.includes(name), fn = plain ? E[name] : E[name + 'In'];
      out.names[name] = (out.names[name] || 0) + calls.length;
      // Every tenth history's second round runs on the watched log (a proxy is slow).
      const watched = h.seed % 10 === 0;
      for (const round of [0, 1]) {
        const seen = [];
        const M = E.modelOf(round === 1 && watched ? watch(decode(h.state), seen) : state, () => h.today);
        for (const [args, res] of calls) {
          let r; try { r = plain ? fn(...freeze(decode(args))) : fn(M, ...freeze(decode(args))); } catch (e) { r = err(e); }
          const got = typeof fn === 'function' ? ser(r) : 'no such function';
          if (round === 0) { out.calls++; if (got === res) out.same++; else if (!out.first) out.first = { seed: h.seed, name, args: args.slice(0, 300), page: res.slice(0, 400), node: got.slice(0, 400) }; }
          else if (got === res) out.again++;
        }
        if (round === 1 && watched) { out.watched += calls.length; for (const w of seen) if (out.writes.length < 5) out.writes.push(`${name}: ${w}`); if (seen.length) out.wroteAny = true; }
      }
    }
  }
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

const { open, engine, settle } = require('./h');
const { wide, digest, specOf } = require('./wide');
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x !== undefined ? JSON.stringify(x).slice(0, 1500) : ''); } else console.log('ok  ', m); };

// Line coverage of each source file from V8's block coverage of the bundle
// and the bundle's source map: a line counts once it has code mapped to it,
// and is run when any of that code ran.
function lineCoverage(covDir, bundleFile, mapPayload) {
  const { SourceMap } = require('module');
  const url = require('url').pathToFileURL(bundleFile).href;
  // One file per batch: a place counts as run when it ran in any of them.
  const entries = fs.readdirSync(covDir).flatMap(f => JSON.parse(fs.readFileSync(path.join(covDir, f), 'utf8')).result).filter(r => r.url === url);
  if (!entries.length) return null;
  const src = fs.readFileSync(bundleFile, 'utf8');
  const count = new Int32Array(src.length).fill(0);
  for (const entry of entries) {
    const one = new Int32Array(src.length).fill(-1);
    // Outer ranges first, so each inner block's count overwrites the function around it.
    const fns = entry.functions.slice().sort((a, b) => (b.ranges[0].endOffset - b.ranges[0].startOffset) - (a.ranges[0].endOffset - a.ranges[0].startOffset));
    for (const f of fns) for (const r of f.ranges) one.fill(r.count, Math.max(0, r.startOffset), Math.min(src.length, r.endOffset));
    for (let i = 0; i < src.length; i++) if (one[i] > 0) count[i] += one[i];
  }
  const sm = new SourceMap(mapPayload);
  const lines = new Map(); // "file:line" -> run (true) or not
  let off = 0;
  const gen = src.split('\n');
  for (let ln = 0; ln < gen.length; ln++) {
    const text = gen[ln];
    for (let col = 0; col < text.length; col++) {
      if (text[col] === ' ') continue;
      const e = sm.findEntry(ln, col);
      if (!e || !e.originalSource || e.generatedLine !== ln) continue;
      const file = path.basename(e.originalSource).replace(/\.ts$/, '');
      if (!MODULES.includes(file)) continue;
      const key = `${file}:${e.originalLine}`;
      const ran = count[off + col] > 0;
      lines.set(key, lines.get(key) || ran);
    }
    off += text.length + 1;
  }
  const per = {};
  for (const [key, ran] of lines) { const f = key.slice(0, key.indexOf(':')); per[f] = per[f] || { run: 0, all: 0, not: [] }; per[f].all++; if (ran) per[f].run++; else per[f].not.push(+key.slice(key.indexOf(':') + 1) + 1); }
  return per;
}

(async () => {
  // The page's answers and its normalized logs, and its language and time zone.
  const browser = await engine.launch();
  const B = await open('index.html', { browser, setup: async (ctx, page) => { await page.clock.setFixedTime(new Date('2026-10-11T12:00:00')); } });
  const LIB = await B.page.evaluate(() => window.__ironlog.libExercises());
  const intl = await B.page.evaluate(() => { const o = Intl.DateTimeFormat().resolvedOptions(); return { locale: o.locale, timeZone: o.timeZone }; });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-engine-'));
  const histories = [], batches = [];
  for (let i = 0; i < K; i++) {
    const h = wide(52000 + i, LIB);
    await B.page.clock.setFixedTime(new Date(h.today + 'T12:00:00'));
    const d = await B.page.evaluate(digest, specOf(h));
    const lines = d.split('\n');
    const state = lines.find(l => l.startsWith('state ')).slice(6);
    // The calls up to invalidate and it: after it the page reads the caches anew, which a fresh model always does.
    const calls = []; for (const l of lines) { if (l.split('\t').length === 3) calls.push(l); if (l.startsWith('invalidate\t')) break; }
    // The adapters the digest does not call, on the same log the digest leaves loaded.
    const sp = specOf(h);
    calls.push(...await B.page.evaluate(([spec, extra]) => {
      const L = window.__ironlog; const ser = new Function(`return (${spec.ser})`)(), err = new Function(`return (${spec.err})`)();
      const out = [];
      for (const [name, argsOf] of Object.entries(extra)) for (const args of new Function(`return (${argsOf})`)()(L.state, spec.ids)) { let r; try { r = L[name](...args); } catch (e) { r = err(e); } out.push(name + '\t' + ser(args) + '\t' + ser(r)); }
      return out;
    }, [sp, Object.fromEntries(Object.entries(EXTRA).map(([k, f]) => [k, f.toString()]))]));
    histories.push({ seed: 52000 + i, today: h.today, state, calls });
    if (histories.length === BATCH || i === K - 1) { batches.push(path.join(tmp, `data-${batches.length}.json`)); fs.writeFileSync(batches[batches.length - 1], JSON.stringify({ histories })); histories.length = 0; }
  }
  ok(!B.errors.length, 'no page errors while the page answered', B.errors.slice(0, 3));
  await settle(browser.close(), 'closing the browser');

  // The engine's modules, bundled for Node with their source map.
  // The engine's modules, and every other module but the store and the live
  // model (which the engine never reaches), so each table the engine could
  // reach is there to be frozen in the child.
  const others = fs.readdirSync(APP).filter(f => f.endsWith('.ts')).map(f => f.slice(0, -3)).filter(m => !MODULES.includes(m) && !['store', 'live'].includes(m)).sort();
  const entry = [...MODULES, ...others].map(m => `export * from './${m}';`).join('\n');
  // Strict, as the page's bundle is (scripts/join.js) and as modules always
  // are: in sloppy mode a write to a frozen object fails silently, so a write
  // to the log would pass unseen (the r52 review).
  const built = require('esbuild').buildSync({ stdin: { contents: entry, resolveDir: APP, loader: 'ts', sourcefile: 'engine-entry.ts' }, bundle: true, format: 'cjs', platform: 'node', write: false, sourcemap: 'external', outfile: path.join(tmp, 'engine.js'), charset: 'utf8', banner: { js: '"use strict";' }, logLevel: 'silent' });
  const js = built.outputFiles.find(f => f.path.endsWith('.js')), map = built.outputFiles.find(f => f.path.endsWith('.map'));
  ok(js.text.startsWith('"use strict";'), 'the engine runs strict in Node, so a write to the frozen log throws');
  fs.writeFileSync(js.path, js.text); fs.writeFileSync(map.path, map.text);
  const covDir = path.join(tmp, 'cov'); fs.mkdirSync(covDir);
  // The page's language and time zone, so dates are worded as the page words them.
  const lang = intl.locale.replace('-', '_') + '.UTF-8';
  const t0 = Date.now();
  // The batches run side by side, one Node process each, on the cores the machine has spare.
  const runOne = dataFile => new Promise(done => {
    const c = spawn(process.execPath, [__filename, '--child', dataFile, js.path], { env: { ...process.env, NODE_V8_COVERAGE: covDir, TZ: intl.timeZone, LANG: lang, LC_ALL: lang } });
    let out = '', errText = ''; c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { errText += d; });
    c.on('close', () => { try { done(JSON.parse(out)); } catch (e) { done({ crash: (errText || out).slice(0, 1500) }); } });
  });
  const results = []; let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(4, os.cpus().length - 1)) }, async () => { while (next < batches.length) { const i = next++; results[i] = await runOne(batches[i]); } }));
  let res = null;
  const crash = results.find(r => r.crash);
  if (crash) ok(false, 'the engine ran in Node', crash.crash);
  else for (const r of results) { if (!res) res = r; else { res.calls += r.calls; res.same += r.same; res.again += r.again; res.watched += r.watched; res.wroteAny = res.wroteAny || r.wroteAny; res.writes.push(...r.writes); res.first = res.first || r.first; for (const [n, c] of Object.entries(r.names)) res.names[n] = (res.names[n] || 0) + c; } }
  if (res) {
    ok(res.locale === intl.locale && res.timeZone === intl.timeZone, `Node read dates in the page's language and time zone (${intl.locale}, ${intl.timeZone})`, { node: [res.locale, res.timeZone], page: intl });
    const missing = ADAPTERS.filter(n => !(res.names[n] > 0));
    ok(ADAPTERS.length >= 79 && missing.length === 0 && Object.keys(res.names).length === ADAPTERS.length + PLAIN.length && PLAIN.every(n => res.names[n] > 0), `all ${ADAPTERS.length} adapters in live.ts and ${PLAIN.join(', ')} were called in Node (${Object.keys(res.names).length})`, { missing, names: Object.keys(res.names) });
    ok(res.calls > K * 1000 && res.same === res.calls, `each of the ${ADAPTERS.length}, on a fresh model of a frozen log, and ${PLAIN.join(', ')}, gives the page's answer: ${res.same} of ${res.calls} calls over ${K} histories (${Math.round((Date.now() - t0) / 1000)} s)`, res.first);
    ok(res.again === res.calls, `and gives it again on a second fresh model (${res.again} of ${res.calls})`);
    ok(res.tables > 40, `every table the modules keep was frozen for the run, so no write to one passes (${res.tables})`);
    ok(res.watched > 0 && !res.wroteAny, `no call tried to change the log, watched on every tenth history's second round, a caught error included (${res.watched} calls)`, res.writes);
    const per = lineCoverage(covDir, js.path, JSON.parse(map.text));
    ok(per && MODULES.every(m => per[m] && per[m].all > 0), 'V8 measured the lines run in each module of the engine', per);
    if (per) {
      const pct = m => Math.floor((per[m].run / per[m].all) * 1000) / 10;
      const now = Object.fromEntries(MODULES.map(m => [m, pct(m)]));
      console.log('note lines run, per module:', MODULES.map(m => `${m} ${now[m]}% (${per[m].run} of ${per[m].all})`).join(', '));
      // ENGINE_UNRUN=coach,weeks lists the lines of those modules that never ran.
      for (const m of (process.env.ENGINE_UNRUN || '').split(',').filter(x => per[x])) console.log(`note ${m}.ts lines never run: ${per[m].not.sort((a, b) => a - b).join(' ')}`);
      const arch = fs.readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8');
      const line = (arch.match(/^Engine coverage, lines run by tests\/engine\.js: (.+)$/m) || [])[1] || '';
      const rec = Object.fromEntries([...line.matchAll(/([a-z]+) ([\d.]+)%/g)].map(m => [m[1], +m[2]]));
      ok(MODULES.every(m => m in rec), 'ARCHITECTURE.md records the lines run in each module of the engine', rec);
      const low = MODULES.filter(m => now[m] < rec[m]);
      ok(low.length === 0, 'no module of the engine runs fewer lines than ARCHITECTURE.md records (the ratchet only rises)', low.map(m => `${m} ${now[m]}% of ${rec[m]}%`));
      const high = MODULES.filter(m => now[m] > rec[m]);
      ok(high.length === 0, 'when more lines run, the number in ARCHITECTURE.md is raised to match, so it stays', high.map(m => `${m} ${now[m]}%, recorded ${rec[m]}%`));
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.log('FAIL crash', e && e.stack || e); process.exit(1); });
