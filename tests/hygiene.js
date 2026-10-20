// Source hygiene (r42, V: "clean up and optimize what we have", "don't
// hardcode"). Reads the repo, not the page, so it fails at the first sign of
// the kinds of cruft that slipped through earlier sweeps:
// 1. Every file in tests/ is a suite tests/run.js runs, or a helper one of them
//    requires. One-off debug scripts (two sat on main until r42) fail here.
// 2. No CSS selector is defined twice in the same block of src/02-style.css
//    (top level, or inside one @media). A second copy silently overrides the
//    first and hides what a rule really does; eight sat there until r42.
// 3. Estimated minutes are worded in one place, `estMin`. A "~N min" or an
//    "about N min" typed into any other template is how r42's first build
//    missed one spot ("About 40 min after the change").
// 4. One source for every value that names or identifies the app (r49, V:
//    "don't hardcode", asked again and again): the name, the domain and the
//    build exist only in src/app/config.ts. Everything else reads them, and a
//    copy typed anywhere in code, markup or the scripts fails here. Comments
//    may still say the name; they are prose, not values.
// 5. The module boundary (r49, ARCHITECTURE.md): src/app/ never imports the
//    legacy parts, and the typed modules pass the TypeScript checker. Since
//    r50, when code moves: nothing exists twice (no legacy declaration takes
//    a module export's name, which would hide the module's copy), nothing
//    moved is left unimported (the legacy script would fail only when that
//    line ran), nothing is imported that the legacy script does not use, and
//    every name the legacy script reads without declaring or importing it is
//    a known global.
// 6. Nothing behind the model's back (r52, ARCHITECTURE.md phase 3b): the
//    engine and the analytics read the log, the date and their caches only
//    through the model they are given, all the way down.
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
// Every script file under src/: the legacy parts and the typed modules in src/app/.
// src/app/ is read at any depth.
const appFiles = d => fs.readdirSync(path.join(ROOT, 'src', d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? appFiles(d + '/' + e.name) : /\.ts$/.test(e.name) ? [d + '/' + e.name] : []);
const SRC_CODE = [...fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')), ...appFiles('app')];
const cfg = require('../scripts/config');
// The top-level declarations of the legacy script in a published build: the
// function the bundle calls last, found strictly (tests/moved.js held each
// move to it until r54).
function legacyNames(file) {
  const acorn = require('acorn');
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const app = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).reduce((a, b) => (b.length > a.length ? b : a), '');
  const top = acorn.parse(app, { ecmaVersion: 'latest' }).body.filter(st => !(st.type === 'ExpressionStatement' && st.directive));
  const call = st => st && st.type === 'ExpressionStatement' && st.expression.type === 'CallExpression' ? st.expression.callee : null;
  const outer = top.length === 1 && call(top[0]);
  const inner = outer && outer.body && outer.body.body;
  const legacy = inner && call(inner[inner.length - 1]);
  const out = new Set();
  for (const st of (legacy && legacy.body && legacy.body.body) || []) {
    if (st.type === 'FunctionDeclaration') out.add(st.id.name);
    else if (st.type === 'VariableDeclaration') for (const d of st.declarations) if (d.id.type === 'Identifier') out.add(d.id.name);
  }
  return out;
}
const fails = []; const ok = (c, m, x) => { if (!c) { fails.push(m); console.log('FAIL', m, x === undefined ? '' : JSON.stringify(x)); } else console.log('ok  ', m); };

// 1. Orphaned test files.
{
  const run = fs.readFileSync(path.join(__dirname, 'run.js'), 'utf8');
  const listed = new Set(); for (const m of run.matchAll(/const (?:suites|distSuites)=\[([^\]]*)\]/g)) for (const n of m[1].matchAll(/'([^']+)'/g)) listed.add(n[1]);
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.js')).map(f => f.slice(0, -3));
  const required = new Set(['run']);
  for (const f of files) { const src = fs.readFileSync(path.join(__dirname, f + '.js'), 'utf8'); for (const m of src.matchAll(/require\('\.\/([^'.]+)(?:\.js)?'\)/g)) required.add(m[1]); }
  const orphans = files.filter(f => !listed.has(f) && !required.has(f));
  ok(orphans.length === 0, 'every file in tests/ is a suite run.js runs or a helper a suite requires', orphans);
  const missing = [...listed].filter(n => !files.includes(n));
  ok(missing.length === 0, 'every suite run.js names exists', missing);
  // r44: the suite table moved to tests/SUITES.md; it keeps a row for every suite.
  const md = fs.readFileSync(path.join(__dirname, 'SUITES.md'), 'utf8'); const rows = new Set([...md.matchAll(/^\| ([\w-]+) \|/gm)].map(m => m[1]));
  const noRow = [...listed].filter(n => !rows.has(n));
  ok(noRow.length === 0, 'every suite has a row in tests/SUITES.md', noRow);
  // r44: suites run side by side, so none runs scripts/build.js into dist/ itself (it deletes dist/ first); h.js build() does, only when a suite runs alone. Since r51 a suite may run it with --out into a directory of its own.
  const direct = files.filter(f => f !== 'h' && f !== 'run' && /scripts', 'build\.js'|build\.js'\]/.test(fs.readFileSync(path.join(__dirname, f + '.js'), 'utf8')) && !fs.readFileSync(path.join(__dirname, f + '.js'), 'utf8').includes("'--out'"));
  ok(direct.length === 0, 'no suite runs the build into dist/ itself; they call build() from tests/h.js, or build with --out into their own directory', direct);
}

// 2. Duplicated selectors, per block.
{
  // As the page holds it: its {{NAME}} placeholders filled (r51, the font names).
  const css = require('../scripts/join').fill(fs.readFileSync(path.join(ROOT, 'src/02-style.css'), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
  const stack = [{ name: 'top', sels: new Map() }]; let buf = ''; const dups = [];
  for (const ch of css) {
    if (ch === '{') {
      const head = buf.trim().replace(/\s+/g, ' '); buf = '';
      if (head.startsWith('@')) { stack.push({ name: head, sels: new Map(), at: true }); continue; }
      const blk = stack[stack.length - 1];
      if (blk.sels.has(head)) dups.push(`${blk.name} > ${head}`); else blk.sels.set(head, 1);
      stack.push({ name: head, rule: true });
    } else if (ch === '}') { buf = ''; stack.pop(); }
    else if (ch === ';' && !stack[stack.length - 1].rule) buf = '';
    else buf += ch;
  }
  ok(stack.length === 1, 'the stylesheet\'s braces balance');
  ok(dups.length === 0, 'no selector is defined twice in the same block of the stylesheet', dups);
}

// 3. Minutes wording only from estMin.
{
  const hits = [];
  for (const f of SRC_CODE) {
    fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').split('\n').forEach((line, i) => {
      // The definition itself (r51: in src/app/format.ts, laid out with spaces).
      if (/const estMin\s*=/.test(line)) return;
      // "about" before a number that ends the text or is followed by min or minutes;
      // "about ${load} for", "about ${n} reps" and the like are not minutes.
      if (/~\$\{/.test(line) || /[Aa]bout \$\{[^}]*\}\)?(\s*min\b|\s*minutes\b|`)/.test(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  ok(hits.length === 0, 'estimated minutes are worded only by estMin ("~N min"), nowhere by hand', hits);
  const defs = SRC_CODE.filter(f => /const estMin\s*=/.test(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')));
  ok(defs.length === 1, 'estMin is defined once', defs);
}

// 4. One source for the name, the domain, the build and the storage id (r49).
{
  const acorn = require('acorn');
  const CONFIG = 'app/config.ts';
  const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Values that must exist only in config.ts, searched for in code and markup, never in comments.
  const banned = [
    ['the app name', new RegExp(esc(cfg.APP_NAME))],
    ['the site address', new RegExp(esc(cfg.SITE_HOST))],
    ['a build id', /\b\d{4}\.\d{1,2}\.\d{1,2}-r\d+(?:\.\d+)?\b/],
  ];
  // The storage id is also the start of identifiers (window.ironlogAuth,
  // IRONLOG_ENV), so it is looked for inside string, template and pattern
  // tokens only, where storage keys, backup marks and file names live, and
  // only where no letter follows it ("ironlog.v1", "ironlog-backup", "ironlog").
  const idInStrings = new RegExp(esc(cfg.STORAGE_ID) + '(?![A-Za-z_])');
  // A script's code with its comments removed, by the parser, so a URL's //
  // inside a string is never taken for a comment; and its literal tokens.
  const read = (txt, ts) => {
    if (ts) txt = require('esbuild').transformSync(txt, { loader: 'ts' }).code;
    const comments = [];
    const ast = acorn.parse(txt, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true, allowImportExportEverywhere: true, onComment: (b, t, a, z) => comments.push([a, z]) });
    const keep = []; let last = 0; for (const [a, z] of comments) { keep.push(txt.slice(last, a)); last = z; } keep.push(txt.slice(last));
    const lits = []; for (const t of acorn.tokenizer(txt, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true, allowImportExportEverywhere: true })) if (t.type === acorn.tokTypes.string || t.type === acorn.tokTypes.template || t.type === acorn.tokTypes.regexp) lits.push(txt.slice(t.start, t.end));
    return { code: keep.join(' '), lits, ast };
  };
  const files = [
    ...SRC_CODE.filter(f => f !== CONFIG).map(f => ['src/' + f, f.endsWith('.ts') ? 'ts' : 'js']),
    ...fs.readdirSync(path.join(ROOT, 'src')).filter(f => /\.(html|css)$/.test(f)).map(f => ['src/' + f, 'page']),
    // Every script, not a list of them (the r51 review added one the list never read).
    ...fs.readdirSync(path.join(ROOT, 'scripts')).filter(f => f.endsWith('.js')).map(f => ['scripts/' + f, 'js']),
  ];
  // The legacy parts are pieces of one script, so they are read joined.
  const isLegacy = f => /^src\/[12]\d-.+\.js$/.test(f);
  const texts = [['src/10-29 (legacy parts)', read(files.filter(([f]) => isLegacy(f)).map(([f]) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join(''), false)]];
  for (const [f, k] of files) {
    if (isLegacy(f)) continue;
    const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
    if (k === 'page') { const t = raw.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); texts.push([f, { code: t, lits: [t] }]); }
    else texts.push([f, read(raw, k === 'ts')]);
  }
  const near = (t, re) => (t.match(new RegExp('.{0,30}' + re.source + '.{0,30}', re.flags.replace('g', ''))) || [''])[0].trim();
  for (const [what, re] of banned) {
    const hits = texts.filter(([, t]) => re.test(t.code)).map(([f, t]) => `${f}: ${near(t.code, re)}`);
    ok(hits.length === 0, `${what} is typed only in src/app/config.ts, nowhere else in code or markup`, hits);
  }
  const idHits = []; for (const [f, t] of texts) for (const l of t.lits) if (idInStrings.test(l)) idHits.push(`${f}: ${near(l, idInStrings)}`);
  ok(idHits.length === 0, 'the storage id ("ironlog" in keys, caches, backup marks and file names) is typed only in src/app/config.ts', idHits);
  // Nothing config.ts exports is bound again anywhere: declarations, parameters, destructuring, catch, functions, classes.
  const names = new Set(Object.keys(cfg)); const rebound = [];
  const bind = (p, f) => { if (!p) return; if (p.type === 'Identifier') { if (names.has(p.name)) rebound.push(`${f}: ${p.name}`); } else if (p.type === 'ObjectPattern') p.properties.forEach(q => bind(q.type === 'RestElement' ? q.argument : q.value, f)); else if (p.type === 'ArrayPattern') p.elements.forEach(q => bind(q, f)); else if (p.type === 'RestElement') bind(p.argument, f); else if (p.type === 'AssignmentPattern') bind(p.left, f); };
  const walk = (n, f) => { if (!n || typeof n.type !== 'string') return;
    if (n.type === 'VariableDeclarator') bind(n.id, f);
    if (/Function/.test(n.type)) { if (n.id) bind(n.id, f); n.params.forEach(q => bind(q, f)); }
    if (n.type === 'ClassDeclaration' && n.id) bind(n.id, f);
    if (n.type === 'CatchClause') bind(n.param, f);
    for (const k in n) { const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, f)); else if (v && typeof v.type === 'string' && k !== 'type') walk(v, f); } };
  for (const [f, t] of texts) if (t.ast) walk(t.ast, f);
  ok(rebound.length === 0, 'nothing config.ts defines is declared or bound a second time (a local of the same name would hide it)', rebound);
  // Outside addresses, library versions and the font faces (r51, the outside
  // review V brought; ARCHITECTURE.md): config.ts defines each once, and the
  // markup, the style sheet, the build, the account script and the test
  // fixtures read them. Each version is the one package.json pins. Every
  // outside address in src/ and scripts/ (https, http, wss or written from
  // //) is config's, or waits for its phase in ARCHITECTURE.md's list, and a
  // listed one must still be there, so the list only shrinks. Searched for
  // as typed: an address or version assembled from pieces at run time is
  // beyond a search of the text, and is review's to catch.
  {
    const pkg = require('../package.json').devDependencies;
    const pins = { CHART_VERSION: 'chart.js', SORTABLE_VERSION: 'sortablejs', THREE_VERSION: 'three' };
    const off = Object.entries(pins).filter(([k, p]) => typeof cfg[k] !== 'string' || cfg[k] !== pkg[p]).map(([k, p]) => `${k} ${cfg[k]}, package.json ${p} ${pkg[p]}`);
    ok(off.length === 0, 'each library version in config.ts is the exact one package.json pins', off);
    const HOST = /(?:(?:https?|wss?):)?\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,})(?![a-z0-9-])/gi;
    const strs = Object.values(cfg).flatMap(v => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter(x => typeof x === 'string') : []));
    const owned = new Set(strs.flatMap(s => [...s.matchAll(HOST)].map(m => m[1].toLowerCase())));
    ok(['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'api.pwnedpasswords.com'].every(h => owned.has(h)), 'config.ts defines the CDNs, the fonts\' two origins and the password check\'s origin', [...owned]);
    const arch = fs.readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8');
    const line = (arch.match(/^Addresses waiting for their phase: (.+)$/m) || [])[1];
    const waiting = new Map(line ? [...line.matchAll(/([a-z0-9-]+(?:\.[a-z0-9-]+)+) \(([^)]+)\)/g)].map(m => [m[1].toLowerCase(), m[2]]) : []);
    ok(line !== undefined, 'ARCHITECTURE.md lists the outside addresses still waiting for their phase');
    // The values config owns that are not addresses: the versions, the faces and their weights, the style sheet's address whole, and a library's name with the first two parts of its version ("three.js 0.159").
    const short = v => v.split('.').slice(0, 2).join('\\.');
    const named = [['chart\\.js', cfg.CHART_VERSION], ['sortable(?:js)?', cfg.SORTABLE_VERSION], ['three(?:\\.js)?', cfg.THREE_VERSION]].map(([n, v]) => new RegExp(`${n}[\\s@/v-]*${short(v)}(?![\\d])`, 'i'));
    const values = [cfg.CHART_VERSION, cfg.SORTABLE_VERSION, cfg.THREE_VERSION, cfg.FONT_DISPLAY, cfg.FONT_BODY, cfg.FONTS_CSS].map(v => v.toLowerCase());
    // The weights in any spelling of the list: "600;700;800", [600, 700, 800].
    const weights = [cfg.FONT_DISPLAY_WEIGHTS, cfg.FONT_BODY_WEIGHTS].map(w => new RegExp(`(?<![\\d])${w.split(';').join('[\\s\'"]*[,;][\\s\'"]*')}(?![\\d])`));
    // Read as written and with a pattern's escapes undone ("https:\/\/api\.pwned..." is the address), in any case.
    const owns = s0 => { const s = s0.replace(/\\([./])/g, '$1'), low = s.toLowerCase(); return [...[...owned].filter(h => low.includes(h)), ...values.filter(v => low.includes(v)), ...named.filter(re => re.test(s)).map(re => re.source), ...weights.filter(re => re.test(s)).map(re => re.source)]; };
    const hosts = [], copies = [], seen = new Set();
    for (const [f, t] of texts) {
      for (const m of t.code.replace(/\\([./])/g, '$1').matchAll(HOST)) {
        const h = m[1].toLowerCase(); seen.add(h);
        if (!owned.has(h) && !(waiting.has(h) && f === 'src/10-29 (legacy parts)')) hosts.push(`${f}: ${h}`);
      }
      for (const l of [t.code, ...t.lits]) for (const v of owns(l)) copies.push(`${f}: ${v}`);
    }
    // The test fixtures too: a font or address changed in config would otherwise leave them serving the old one. This suite, which states what config must define, excepted.
    for (const f of fs.readdirSync(__dirname).filter(x => x.endsWith('.js') && x !== 'hygiene.js')) {
      const r = read(fs.readFileSync(path.join(__dirname, f), 'utf8'), false);
      for (const l of [r.code, ...r.lits]) for (const v of owns(l)) copies.push(`tests/${f}: ${v}`);
    }
    ok(copies.length === 0, 'the outside addresses, library versions, font faces and weights config.ts defines are typed nowhere else in src/, scripts/ or tests/', [...new Set(copies)]);
    ok(hosts.length === 0, 'every other outside address in src/ or scripts/ waits for its phase in ARCHITECTURE.md, in the legacy script', hosts);
    const gone = [...waiting.keys()].filter(h => !seen.has(h));
    ok(gone.length === 0, 'every address ARCHITECTURE.md lists as waiting is still in the legacy script (a moved one leaves the list)', gone);
  }
  ok((cfg.WORDMARK.mark + cfg.WORDMARK.strong + cfg.WORDMARK.light).toLowerCase() === cfg.APP_NAME.toLowerCase(), 'the logo\'s wordmark spells the app name (a new name needs a new wordmark)', cfg.WORDMARK);
  ok(/^\d+\.\d+$/.test(cfg.DISPLAY_VERSION), 'the version people see is major.minor', cfg.DISPLAY_VERSION);
}

// 5. The module boundary, the ratchet and the type checker (r49).
{
  // Every import, export-from, dynamic import and require in src/app/, at any
  // depth, must resolve inside src/app/.
  const APP = path.join(ROOT, 'src', 'app');
  const ts = require('typescript');
  // The modules by id: the path from src/app/ without `.ts`, at any depth.
  const MODS = SRC_CODE.filter(f => f.startsWith('app/')).map(f => f.slice(4, -3));
  // Every place a module names another file, read from the syntax tree, so a
  // comment that mentions an import is not one (the r51 mutation test found
  // the text scan over-broad): import and export-from statements, type-only
  // ones included, `import x = require()`, `import()` and `require()` calls
  // at any depth. Each must resolve to a `.ts` file inside src/app/.
  const edgesOf = id => {
    const txt = fs.readFileSync(path.join(APP, id + '.ts'), 'utf8');
    const sf = ts.createSourceFile(id, txt, ts.ScriptTarget.Latest, true);
    const out = [];
    const spec = n => (ts.isStringLiteral(n) ? n.text : '(computed)');
    (function walk(n) {
      if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier) out.push({ spec: spec(n.moduleSpecifier), typeOnly: !!(n.importClause && n.importClause.isTypeOnly) || !!n.isTypeOnly });
      else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)) out.push({ spec: spec(n.moduleReference.expression), typeOnly: false });
      else if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && /^(require|__require)$/.test(n.expression.text))) && n.arguments.length) out.push({ spec: spec(n.arguments[0]), typeOnly: false });
      ts.forEachChild(n, walk);
    })(sf);
    return out.map(e => { const abs = path.resolve(path.dirname(path.join(APP, id + '.ts')), e.spec); const rel = path.relative(APP, abs).split(path.sep).join('/'); return { ...e, to: rel, inside: e.spec.startsWith('.') && !rel.startsWith('..') && fs.existsSync(abs + '.ts') }; });
  };
  const EDGES = new Map(MODS.map(id => [id, edgesOf(id)]));
  const out = [];
  for (const [id, es] of EDGES) for (const e of es) if (!e.inside) out.push(`${id}: ${e.spec}`);
  ok(out.length === 0, 'the modules in src/app/ import only each other, never the legacy parts or anything outside', out);
  const legacyImports = fs.readdirSync(path.join(ROOT, 'src')).filter(f => /^[12]\d-.+\.js$/.test(f)).filter(f => /^\s*import[\s('"{*]/m.test(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')));
  ok(legacyImports.length === 0, 'the legacy parts import only through src/09-imports.js', legacyImports);
  // The ratchet (ARCHITECTURE.md): the legacy script never grows, in declarations or in lines.
  const arch = fs.readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8');
  const capD = +((arch.match(/^Legacy top-level declarations: (\d+)$/m) || [])[1]);
  const capL = +((arch.match(/^Legacy lines: (\d+)$/m) || [])[1]);
  const nowD = require('../scripts/depmap').count();
  const nowL = fs.readdirSync(path.join(ROOT, 'src')).filter(f => /^[12]\d-.+\.js$/.test(f)).reduce((n, f) => n + fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').split('\n').length - 1, 0);
  ok(capD > 0 && capL > 0 && nowD <= capD && nowL <= capL, `the legacy script is no larger than ARCHITECTURE.md records (${nowD} of ${capD} declarations, ${nowL} of ${capL} lines); new code goes in src/app/`);
  ok(nowD >= capD && nowL >= capL, 'when code leaves the legacy script, the numbers in ARCHITECTURE.md are lowered to match, so the ratchet holds at the new level', { nowD, capD, nowL, capL });
  // The dependency map counts a module function that reads the store, the
  // live model or the page as shared state for the legacy code that calls it,
  // through any module between (r53, scripts/depmap.js moduleReach). With
  // live.ts as the only rule, the seven legacy declarations that call
  // rirScale, moved to effort.ts in r53, counted as pure though they read a
  // setting. A small source tree of its own, so the check outlives the
  // names it was found with.
  {
    const os = require('os'); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ironlog-depmap-'));
    try {
      fs.mkdirSync(path.join(tmp, 'app'));
      const put = (f, t) => fs.writeFileSync(path.join(tmp, f), t);
      put('app/store.ts', 'export let state: { a: number } = { a: 1 };\n');
      put('app/eff.ts', "import { state } from './store';\nexport const scale = (): number => state.a;\n");
      put('app/via.ts', "import { scale } from './eff';\nexport const twice = (): number => scale() * 2;\n");
      put('app/page.ts', 'export const wide = (): number => window.innerWidth;\n');
      put('app/calc.ts', 'export const two = (): number => 2;\n');
      put('09-imports.js', "import { scale } from './app/eff';\nimport { twice } from './app/via';\nimport { wide } from './app/page';\nimport { two } from './app/calc';\n");
      put('10-a.js', '(function(){\nfunction a(){ return scale(); }\nfunction b(){ return twice(); }\nfunction c(){ return wide(); }\nfunction d(){ return two(); }\nfunction e(){ return d(); }\n})();\n');
      const fx = require('../scripts/depmap').map(tmp); const pure = Object.fromEntries(fx.decls.map(x => [x.name, x.pure]));
      ok(pure.a === false && pure.b === false && pure.c === false && pure.d === true && pure.e === true, 'the dependency map reads a module function that reads the store, directly or through another module, or the page, as not pure for its callers, and one that reads none as pure', pure);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  }
  // Every name the modules export, read from the code esbuild makes of them.
  const esbuild = require('esbuild'), acorn = require('acorn'); const exported = new Map();
  for (const f of SRC_CODE.filter(f => f.startsWith('app/'))) {
    const js = esbuild.transformSync(fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), { loader: 'ts', format: 'esm' }).code;
    for (const st of acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' }).body) if (st.type === 'ExportNamedDeclaration') {
      for (const sp of st.specifiers || []) exported.set(sp.exported.name, f);
      const d = st.declaration; if (d && d.id) exported.set(d.id.name, f); if (d && d.declarations) for (const x of d.declarations) exported.set(x.id.name, f);
    }
  }
  const dm = require('../scripts/depmap').map(path.join(ROOT, 'src'));
  ok(exported.size > 100 && dm.imports.length > 100, `the modules' exports and the legacy script's imports are read (${exported.size} exports, ${dm.imports.length} imports)`);
  const twice = dm.decls.filter(d => exported.has(d.name)).map(d => `${d.file}: ${d.name} (also in src/${exported.get(d.name)})`);
  ok(twice.length === 0, 'no legacy declaration has the name of a module export: moved code exists once, and the module copy is the one that runs', twice);
  const unimported = dm.free.filter(n => exported.has(n)).map(n => `${n} (src/${exported.get(n)})`);
  ok(unimported.length === 0, 'every module export the legacy script uses is imported in src/09-imports.js', unimported);
  const dead = dm.imports.filter(x => !x.used).map(x => `${x.name} from ${x.from}`);
  ok(dead.length === 0, 'every name src/09-imports.js imports is used by the legacy script', dead);
  // The names the legacy script reads without declaring or importing them are
  // the browser's and JavaScript's own (r50 review): a moved name deleted with
  // its import, or misspelt, would otherwise pass every check here and fail
  // only when its line ran. A new global the code really needs goes on this list.
  const GLOBALS = new Set(['Array', 'Blob', 'Boolean', 'CSS', 'DOMParser', 'DataView', 'Date', 'DecompressionStream', 'Error', 'File', 'FileReader', 'Image', 'Infinity', 'Intl', 'JSON', 'Map', 'Math', 'MouseEvent', 'MutationObserver', 'NaN', 'Number', 'Object', 'Promise', 'Response', 'Set', 'String', 'TextDecoder', 'TextEncoder', 'URL', 'Uint8Array', 'WeakMap', 'WeakSet', 'cancelAnimationFrame', 'clearInterval', 'clearTimeout', 'document', 'encodeURIComponent', 'getComputedStyle', 'history', 'indexedDB', 'isFinite', 'isNaN', 'localStorage', 'location', 'matchMedia', 'navigator', 'parseFloat', 'parseInt', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'setInterval', 'setTimeout', 'undefined', 'window']);
  const unknown = dm.free.filter(n => !GLOBALS.has(n));
  ok(dm.free.length > 40 && unknown.length === 0, 'every name the legacy script reads without declaring or importing it is a known browser or JavaScript global', unknown);
  // src/09-imports.js holds named imports from src/app/ and nothing else: an
  // import with no names (`import './x'`, `import {} from './x'`) or a
  // re-export (`export * from './x'`) runs a module for its effects alone,
  // which nothing compares (the two r51 reviews), and a renamed or namespace
  // import would let one name stand for another.
  {
    const txt = fs.readFileSync(path.join(ROOT, 'src', '09-imports.js'), 'utf8'); const odd = [];
    for (const st of acorn.parse(txt, { ecmaVersion: 'latest', sourceType: 'module' }).body) {
      const named = st.type === 'ImportDeclaration' && st.specifiers.length > 0 && st.specifiers.every(sp => sp.type === 'ImportSpecifier' && sp.imported.name === sp.local.name);
      const to = named && st.source.value.startsWith('./app/') ? path.resolve(ROOT, 'src', st.source.value) : null;
      if (!to || !fs.existsSync(to + '.ts')) odd.push(txt.slice(st.start, Math.min(st.end, st.start + 100)));
    }
    ok(odd.length === 0, 'src/09-imports.js holds only imports of names, under their own names, from src/app/', odd);
  }
  // One-way dependencies (ARCHITECTURE.md): config and the record types at
  // the bottom, then data, then the engine and analytics, then storage and
  // sync, then the screens. A module imports only from its own layer or
  // below, and no import goes round in a circle. The bundle turns a module's
  // const into var, so in a circle a value read before its module has run is
  // undefined, not an error (the second r51 review made the store read
  // HIST_PAGE from layout, which read the store, and History's page size came
  // out undefined with every other check green). Type-only imports leave no
  // code and do not count. The layers are written once, in ARCHITECTURE.md
  // ("Layer N, what: module, module"), and read from there.
  {
    const LAYER = {}, twice = [];
    for (const m of fs.readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8').matchAll(/^Layer (\d+), [^:]+: (.+)$/gm)) for (const name of m[2].split(',').map(x => x.trim())) { if (name in LAYER) twice.push(name); LAYER[name] = +m[1]; }
    ok(twice.length === 0, 'ARCHITECTURE.md gives each module one layer', twice);
    const mods = MODS;
    ok(Object.keys(LAYER).length > 20 && mods.every(m => m in LAYER), 'every module in src/app/ has its layer in ARCHITECTURE.md', mods.filter(m => !(m in LAYER)));
    ok(Object.keys(LAYER).every(m => mods.includes(m)), 'every module ARCHITECTURE.md gives a layer exists', Object.keys(LAYER).filter(m => !mods.includes(m)));
    // Every import at any depth and in any form counts (edgesOf), the ones
    // that leave no code too, since a layer is about what a module may know.
    const deps = new Map(), up = [];
    for (const m of mods) {
      const to = EDGES.get(m).map(e => e.to);
      deps.set(m, to);
      for (const t of to) if (!(LAYER[t] <= LAYER[m])) up.push(`${m} (layer ${LAYER[m]}) imports ${t} (layer ${LAYER[t]})`);
    }
    ok(up.length === 0, 'each module imports only from its own layer or below', up);
    const cycles = [], state = new Map();
    const visit = (m, trail) => {
      if (state.get(m) === 2) return; if (state.get(m) === 1) { cycles.push([...trail.slice(trail.indexOf(m)), m].join(' > ')); return; }
      state.set(m, 1); for (const t of deps.get(m) || []) visit(t, [...trail, m]); state.set(m, 2);
    };
    for (const m of mods) visit(m, []);
    ok(cycles.length === 0, 'no import in src/app/ goes round in a circle', cycles);
  }
  // The checker is never switched off: no @ts-nocheck or @ts-ignore, and an
  // expected error only where listed with its reason (the second r51 review
  // hid a copy of the legacy script in config.ts behind @ts-nocheck).
  {
    const EXPECT = { 'importing.ts': 1 }; // the duplicate 'assisted dip' key, kept so the move changes no code (PENDING 304)
    const bad = [];
    // A directive is a comment that opens with it (`// @ts-ignore`); prose that mentions one is not (the r51 mutation test).
    for (const id of MODS) {
      const f = id + '.ts', txt = fs.readFileSync(path.join(APP, f), 'utf8');
      if (/(\/\/|\/\*)\s*@ts-(nocheck|ignore)\b/.test(txt)) bad.push(`${f}: @ts-nocheck or @ts-ignore`);
      const n = (txt.match(/(\/\/|\/\*)\s*@ts-expect-error\b/g) || []).length;
      if (n !== (EXPECT[f] || 0)) bad.push(`${f}: ${n} @ts-expect-error, ${EXPECT[f] || 0} listed`);
    }
    ok(bad.length === 0, 'the type checker is switched off nowhere in src/app/, beyond the one listed exception', bad);
  }
  // Every name a module exports says what it is for, in a comment of its own
  // directly above it, or shares the comment of the group it sits in (related
  // exports with no blank line between them under one comment). A section
  // heading such as `/* ---------- loads ---------- */` is not an explanation.
  // From r51 (V: the code explains itself in plain words).
  {
    const bare = [];
    for (const id of MODS) {
      const f = id + '.ts', txt = fs.readFileSync(path.join(APP, f), 'utf8');
      const sf = ts.createSourceFile(f, txt, ts.ScriptTarget.Latest, true);
      let prevEnd = -1;
      for (const st of sf.statements) {
        const exported = (ts.canHaveModifiers(st) && ts.getModifiers(st) || []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
        if (!exported) { prevEnd = -1; continue; }
        const said = (ts.getLeadingCommentRanges(txt, st.pos) || []).some(c => !/^\/\*\s*-{3,}[\s\S]*-{3,}\s*\*\/$/.test(txt.slice(c.pos, c.end)));
        const grouped = prevEnd >= 0 && !/\n[ \t]*\n/.test(txt.slice(prevEnd, st.getStart(sf)));
        if (!said && !grouped) bare.push(`${f}: ${st.name ? st.name.text : st.declarationList ? st.declarationList.declarations.map(d => d.name.getText(sf)).join(', ') : '?'}`);
        prevEnd = st.end;
      }
    }
    ok(bare.length === 0, 'every name src/app/ exports has a comment saying what it is for', bare);
  }
  // Types say only what is true (r51, the outside review V brought;
  // ARCHITECTURE.md). Read with the type checker, so an `any` is found
  // wherever it is, not only where the word is written: no name (a
  // parameter, a variable, a destructured binding, any identifier read), call,
  // await or property read in src/app/ has the type any, except an expression
  // wrapped directly in a cast, which makes it explicit (JSON.parse is typed
  // any). The other ways to tell TypeScript a type it cannot check count as
  // casts: `as` (other than `as const`), a type predicate (`x is T`), and a
  // parameter annotated where its contextual type is any (a
  // String.replace callback's groups); overloads are refused, since their
  // signatures are not checked against the implementation. Every cast and
  // every `!` (a non-null assertion, or a definite assignment such as
  // `let x!: T`) has a comment naming it ("cast", or a ! standing alone): on
  // its line, alone on the line above, or leading a statement, declaration or
  // property that holds it. A cast whose type is or holds a type parameter is
  // refused, however it is spelled (an alias too), since one generic helper
  // would turn any number of casts into calls the count never sees. Casts, `!` and open
  // types (an index signature, or a Record keyed by string, whose values are
  // unknown or any) are counted against ARCHITECTURE.md's numbers, which only
  // fall: higher fails, and lower fails until the numbers are lowered. What a
  // comment says is review's to judge, and one comment on a declaration may
  // cover several casts in it; the count shows a new one in the diff.
  const appComments = new Map(); // module -> [pos, end] of every comment, from the syntax tree
  // No var in src/app/ (r53, the second review): a var declared inside a
  // block belongs to the whole function, and the scope reading this suite's
  // rules use (scripts/depmap.js, freeNames) takes only a body's own
  // statements as hoisted, so a var could change what a name means and pass.
  // const and let mean what they say where they are.
  {
    const vars = [];
    for (const f of SRC_CODE.filter(f => f.startsWith('app/') && f.endsWith('.ts'))) {
      const sf = ts.createSourceFile(f, fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), ts.ScriptTarget.Latest, true);
      const walk = n => { if (ts.isVariableDeclarationList(n) && !(n.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) vars.push(`${f}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`); ts.forEachChild(n, walk); };
      walk(sf);
    }
    ok(vars.length === 0, 'no var in src/app/: every variable is const or let, so a name means what its block says', vars);
  }
  {
    const CAST = /\bcasts?\b/i, BANG = /(^|[\s(`])!([\s`),.;:]|$)/;
    const conf = ts.parseJsonConfigFileContent(ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile).config, ts.sys, ROOT);
    const prog = ts.createProgram(conf.fileNames, conf.options), ch = prog.getTypeChecker();
    const anys = [], unexplained = [], generic = []; let casts = 0, bangs = 0, open = 0;
    // A type that is any, or holds any as a union member or a type argument (any[] from Array.isArray, Map<any, any> from new Map()).
    const holdsAny = (ty, d = 0) => !!ty && d < 6 && (!!(ty.flags & ts.TypeFlags.Any) || (ty.types || []).some(x => holdsAny(x, d + 1)) || (ty.objectFlags & ts.ObjectFlags.Reference ? ch.getTypeArguments(ty) : []).some(x => holdsAny(x, d + 1)));
    const isAny = n => { try { return holdsAny(ch.getTypeAtLocation(n)); } catch (e) { return false; } };
    // A written type that names a type parameter of a declaration around the cast, anywhere in it: in an
    // object, a function, keyof, a conditional or a type argument, and through any alias, interface or
    // typeof it names (an alias's own parameters, such as Record's, are not the cast's).
    const aroundCast = (s, cast) => (s.declarations || []).some(d => d.getSourceFile() === cast.getSourceFile() && d.parent.pos <= cast.pos && cast.end <= d.parent.end);
    const typeParamIn = (ty, cast, d = 0) => !!ty && d < 6 && ((!!(ty.flags & ts.TypeFlags.TypeParameter) && !!ty.symbol && aroundCast(ty.symbol, cast)) || (ty.types || []).some(x => typeParamIn(x, cast, d + 1)) || (ty.objectFlags & ts.ObjectFlags.Reference ? ch.getTypeArguments(ty) : []).some(x => typeParamIn(x, cast, d + 1)));
    const holdsParam = (node, cast, seen = new Set()) => {
      if (!node) return false;
      if (ts.isTypeReferenceNode(node) || ts.isExpressionWithTypeArguments(node)) {
        const s = ch.getSymbolAtLocation(ts.isTypeReferenceNode(node) ? node.typeName : node.expression);
        if (s && s.flags & ts.SymbolFlags.TypeParameter && aroundCast(s, cast)) return true;
        if (s && s.flags & (ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Interface) && !seen.has(s)) { seen.add(s); for (const dcl of s.declarations || []) if ((ts.isTypeAliasDeclaration(dcl) && holdsParam(dcl.type, cast, seen)) || (ts.isInterfaceDeclaration(dcl) && dcl.getSourceFile() === cast.getSourceFile() && [...(dcl.heritageClauses || []), ...dcl.members].some(m => holdsParam(m, cast, seen)))) return true; }
      }
      // typeof x, where x's type is or holds a type parameter around the cast.
      if (ts.isTypeQueryNode(node)) { try { if (typeParamIn(ch.getTypeAtLocation(node.exprName), cast)) return true; } catch (e) { /* a name the checker cannot type is no type parameter */ } }
      return !!ts.forEachChild(node, k => holdsParam(k, cast, seen) || undefined);
    };
    // A parameter written with a type where the function's contextual type gives it any: an annotation nothing checks.
    const unchecked = p => {
      const fn = p.parent;
      // Typing a parameter unknown where it would be any hides nothing, so it is not counted.
      if (!p.type || p.type.kind === ts.SyntaxKind.UnknownKeyword || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return false;
      const ct = ch.getContextualType(fn), sig = ct && ch.getSignaturesOfType(ct, ts.SignatureKind.Call)[0];
      if (!sig) return false;
      const i = fn.parameters.indexOf(p), ps = sig.parameters, last = ps[ps.length - 1];
      const rest = !!(last && last.valueDeclaration && ts.isParameter(last.valueDeclaration) && last.valueDeclaration.dotDotDotToken);
      let ty;
      if (rest && i >= ps.length - 1) { const r = ch.getTypeOfSymbolAtLocation(last, fn); ty = ch.getIndexTypeOfType(r, ts.IndexKind.Number) || r; }
      else if (i < ps.length) ty = ch.getTypeOfSymbolAtLocation(ps[i], fn);
      return !!(ty && ty.flags & ts.TypeFlags.Any);
    };
    const overloads = [];
    const loose = n => n && (n.kind === ts.SyntaxKind.UnknownKeyword || n.kind === ts.SyntaxKind.AnyKeyword);
    // Marks in moved code (phase 3b, ARCHITECTURE.md): strict TypeScript
    // needs a ! or a cast wherever moved code relies on a fact established in
    // another statement, and a move may not change the code to show it. Such
    // a mark records an assumption the code already made, so it counts
    // against its move's own number, recorded when the move is made and only
    // falling after; every other mark counts against the numbers above. A
    // mark belongs to a move when the top-level declaration holding it has a
    // name (less the In of a function taking the model, M) that was a
    // declaration of the legacy script in the build the move started from:
    // read from that build itself, so a mark in new or changed code can never
    // ride on a move (until r54 tests/moved.js held what a move could change,
    // and fixed each adapter's TypeScript text, so no mark could sit in one).
    const MOVE_MARKS = [...fs.readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8').matchAll(/^Marks in (r\d+)'s moved code \(from (baselines\/[\w.-]+\.html)\): (\d+) casts, (\d+) non-null assertions$/gm)].map(m => ({ release: m[1], baseline: m[2], casts: +m[3], bangs: +m[4], legacy: legacyNames(m[2]), nowCasts: 0, nowBangs: 0 }));
    const markMove = (sf, n) => {
      const st = sf.statements.find(x => x.pos <= n.pos && n.end <= x.end);
      if (!st) return null;
      // The declarator holding the mark, never a neighbour in its statement (the second r52 review).
      const fns = ts.isFunctionDeclaration(st) && st.name ? [[st.name.text, st]] : ts.isVariableStatement(st) ? st.declarationList.declarations.filter(d => ts.isIdentifier(d.name) && d.pos <= n.pos && n.end <= d.end).map(d => [d.name.text, d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer)) ? d.initializer : null]) : [];
      const names = fns.map(([name, f]) => (f && f.parameters.length && ts.isIdentifier(f.parameters[0].name) && f.parameters[0].name.text === 'M' && name.endsWith('In') ? name.slice(0, -2) : name));
      for (const mv of [...MOVE_MARKS].reverse()) if (names.some(x => mv.legacy.has(x))) return mv;
      return null;
    };
    for (const id of MODS) {
      const f = id + '.ts', sf = prog.getSourceFile(path.join(APP, f)), txt = sf.text;
      const at = n => `${f}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
      const lead = n => (ts.getLeadingCommentRanges(txt, n.pos) || []).map(c => txt.slice(c.pos, c.end)).join('\n');
      // Which lines hold a comment and which hold code, from the tokens and
      // the comments around them, so a // inside a string or a regular
      // expression is never taken for one.
      const commentLines = new Set(), codeLines = new Set(), ranges = new Map();
      const mark = (set, a, z) => { for (let l = sf.getLineAndCharacterOfPosition(a).line, e = sf.getLineAndCharacterOfPosition(z).line; l <= e; l++) set.add(l); };
      const tokens = n => {
        for (const c of [...(ts.getLeadingCommentRanges(txt, n.pos) || []), ...(ts.getTrailingCommentRanges(txt, n.end) || [])]) { mark(commentLines, c.pos, c.end); ranges.set(c.pos, [c.pos, c.end]); }
        const kids = n.getChildren(sf);
        if (!kids.length && n.kind !== ts.SyntaxKind.EndOfFileToken) mark(codeLines, n.getStart(sf), n.end);
        kids.forEach(tokens);
      };
      tokens(sf);
      appComments.set(id, [...ranges.values()]);
      const lineComments = l => [...ranges.values()].filter(([a, z]) => sf.getLineAndCharacterOfPosition(a).line <= l && sf.getLineAndCharacterOfPosition(z).line >= l).map(([a, z]) => txt.slice(a, z)).join('\n');
      const named = (n, re, held) => {
        const l = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line;
        const above = l > 0 && commentLines.has(l - 1) && !codeLines.has(l - 1) ? lineComments(l - 1) : '';
        return re.test(lineComments(l)) || re.test(above) || held.some(c => re.test(c));
      };
      const visit = (n, held) => {
        if (n.kind === ts.SyntaxKind.AnyKeyword) anys.push(`${at(n)} the word any`);
        const reads = ts.isIdentifier(n) || ts.isCallExpression(n) || ts.isAwaitExpression(n) || ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n);
        const inType = x => { if (x.parent && ts.isModuleDeclaration(x.parent) && x.parent.name === x) return true; for (let u = x.parent; u; u = u.parent) { if (ts.isTypeNode(u)) return true; if (ts.isStatement(u) || ts.isExpression(u)) return false; } return false; };
        // The property a destructuring takes (`uid` in `const { uid: _u } = it`)
        // names a property, not a value: the checker gives such a name any, and
        // the binding beside it (`_u`) is the value, read here like any other
        // (found in r52, on planFor's `{ uid: _u, ss: _s, ...p }`).
        const propName = x => !!x.parent && ts.isBindingElement(x.parent) && x.parent.propertyName === x;
        const wrapped = x => { let u = x.parent; while (u && (ts.isParenthesizedExpression(u) || (ts.isPropertyAccessExpression(u) && u.name === x))) { x = u; u = u.parent; } return !!u && (ts.isAsExpression(u) || ts.isTypeAssertionExpression(u)); };
        if (reads && !inType(n) && !propName(n) && !wrapped(n) && isAny(n)) anys.push(`${at(n)} ${n.getText(sf).slice(0, 50).replace(/\s+/g, ' ')}`);
        if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isConstructorDeclaration(n)) && !n.body) overloads.push(at(n));
        if (ts.isIndexSignatureDeclaration(n) && loose(n.type)) open++;
        if (ts.isTypeReferenceNode(n) && n.typeName.getText(sf) === 'Record' && n.typeArguments && n.typeArguments.length === 2 && n.typeArguments[0].kind === ts.SyntaxKind.StringKeyword && loose(n.typeArguments[1])) open++;
        const isCast = ((ts.isAsExpression(n) || ts.isTypeAssertionExpression(n)) && n.type.getText(sf) !== 'const') || ts.isTypePredicateNode(n) || (ts.isParameter(n) && unchecked(n));
        const isBang = ts.isNonNullExpression(n) || ((ts.isVariableDeclaration(n) || ts.isPropertyDeclaration(n)) && !!n.exclamationToken);
        const mv = isCast || isBang ? markMove(sf, n) : null;
        if (isCast) {
          if (mv) mv.nowCasts++; else casts++;
          if (!named(n, CAST, held)) unexplained.push(`${at(n)} ${n.getText(sf).slice(0, 50).replace(/\s+/g, ' ')}`);
          if (n.type && holdsParam(n.type, n)) generic.push(`${at(n)} ${n.getText(sf).slice(0, 50)}`);
        }
        if (isBang) {
          if (mv) mv.nowBangs++; else bangs++;
          if (!named(n, BANG, held)) unexplained.push(`${at(n)} ${n.getText(sf).slice(0, 50).replace(/\s+/g, ' ')}`);
        }
        const own = ts.isStatement(n) || ts.isVariableDeclaration(n) || ts.isPropertyAssignment(n) || ts.isClassElement(n) ? [...held, lead(n)] : held;
        ts.forEachChild(n, k => visit(k, own));
      };
      visit(sf, []);
    }
    ok(anys.length === 0, 'no value in src/app/ has the type any, found by the type checker (an expression wrapped in a cast excepted, as the cast makes it explicit)', anys);
    ok(unexplained.length === 0, `every cast and every ! in src/app/ has a comment naming it (${casts} casts, ${bangs} !)`, unexplained);
    ok(generic.length === 0, 'no cast in src/app/ is to a type that is or holds a type parameter (a generic helper would hide casts from the count)', generic);
    ok(overloads.length === 0, 'no function, method or constructor in src/app/ is declared without a body: no overloads (their signatures are not checked against the implementation) and no `declare function`', overloads);
    const arch = fs.readFileSync(path.join(ROOT, 'ARCHITECTURE.md'), 'utf8');
    const cap = re => +((arch.match(re) || [])[1]);
    const cc = cap(/^Casts: (\d+)$/m), cb = cap(/^Non-null assertions: (\d+)$/m), co = cap(/^Open types: (\d+)$/m);
    ok(cc >= 0 && cb >= 0 && co >= 0 && casts <= cc && bangs <= cb && open <= co, `src/app/ has no more casts, ! or open types than ARCHITECTURE.md records (${casts} of ${cc}, ${bangs} of ${cb}, ${open} of ${co})`);
    ok(casts >= cc && bangs >= cb && open >= co, 'when a cast, a ! or an open type goes, the number in ARCHITECTURE.md is lowered to match, so it stays gone', { casts, cc, bangs, cb, open, co });
    for (const mv of MOVE_MARKS) {
      ok(mv.legacy.size > 300, `${mv.release}'s marks are told apart by the legacy declarations of ${mv.baseline} (${mv.legacy.size})`);
      ok(mv.nowCasts <= mv.casts && mv.nowBangs <= mv.bangs, `the code ${mv.release} moved has no more casts or ! than ARCHITECTURE.md records for it (${mv.nowCasts} of ${mv.casts}, ${mv.nowBangs} of ${mv.bangs})`);
      ok(mv.nowCasts >= mv.casts && mv.nowBangs >= mv.bangs, `when a cast or a ! in the code ${mv.release} moved goes, its number in ARCHITECTURE.md is lowered to match`, { casts: mv.nowCasts, recorded: mv.casts, bangs: mv.nowBangs, recordedBangs: mv.bangs });
    }
  }
  // An error handled in a module carries a comment (r51, the outside review):
  // every `catch` block in src/app/, and every handler given to a promise
  // (`.catch(fn)`, `["catch"](fn)`, the second function of `.then`), ends in
  // a throw or holds a comment, read from the syntax tree, saying why the
  // error is expected and what the fallback is; a handler must be written in
  // place, so it can be read. A `finally` may not return, which would swallow
  // an error silently. Whether a comment says why is review's to judge. A
  // module cannot log yet (`log` is legacy until phase 4).
  {
    const silent = [];
    for (const id of MODS) {
      const f = id + '.ts', txt = fs.readFileSync(path.join(APP, f), 'utf8');
      const sf = ts.createSourceFile(f, txt, ts.ScriptTarget.Latest, true);
      const comments = appComments.get(id) || [];
      const where = n => `${f}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
      // A comment in the block itself, not in a function nested inside it.
      const nested = []; const fns = x => { if (x !== undefined && ts.isFunctionLike(x)) nested.push([x.getStart(sf), x.end]); ts.forEachChild(x, fns); };
      fns(sf);
      const hasComment = b => comments.some(([a, z]) => a >= b.getStart(sf) && z <= b.end && !nested.some(([p, q]) => p > b.getStart(sf) && a >= p && z <= q));
      // Ends in a throw: the block's own last statement, so a throw that only sometimes runs, or one in a nested function, does not count.
      const endsInThrow = b => ts.isBlock(b) && b.statements.length > 0 && ts.isThrowStatement(b.statements[b.statements.length - 1]);
      const handler = (fn, at) => {
        if (!fn || !ts.isFunctionLike(fn) || !fn.body) { silent.push(`${where(at)} (a handler not written in place)`); return; }
        if (!hasComment(fn.body) && !endsInThrow(fn.body)) silent.push(where(at));
      };
      // A return, break or continue in a finally ends it early and drops an error in flight.
      const returnsIn = x => ts.isReturnStatement(x) || ts.isBreakStatement(x) || ts.isContinueStatement(x) || (!ts.isFunctionLike(x) && !!ts.forEachChild(x, c => returnsIn(c) || undefined));
      const visit = n => {
        if (ts.isCatchClause(n) && !hasComment(n.block) && !endsInThrow(n.block)) silent.push(where(n));
        if (ts.isTryStatement(n) && n.finallyBlock && returnsIn(n.finallyBlock)) silent.push(`${where(n.finallyBlock)} (a return, break or continue in finally)`);
        if (ts.isCallExpression(n)) {
          const e = n.expression;
          const name = ts.isPropertyAccessExpression(e) ? e.name.text : ts.isElementAccessExpression(e) && ts.isStringLiteralLike(e.argumentExpression) ? e.argumentExpression.text : '';
          if (name === 'catch') handler(n.arguments[0], n);
          if (name === 'then' && n.arguments.length > 1) handler(n.arguments[1], n);
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    ok(silent.length === 0, 'every catch and promise handler in src/app/ ends in a throw or carries a comment saying why the error is expected, and no finally returns, breaks or continues', silent);
  }
  // Every module is laid out by Prettier from the committed .prettierrc.json,
  // so layout is never a matter of taste or of hand (layout never changes
  // code). A data table may keep its rows on
  // their own lines behind `// prettier-ignore`, only at a module's top
  // level and only with a comment directly above saying why; the check
  // prints each so a review sees them. Until r51 the r49 and r50 modules
  // were exempt, which was an exception, not a standard.
  {
    const files = MODS.map(id => path.join(APP, id + '.ts'));
    const { spawnSync } = require('child_process');
    const pr = spawnSync(process.execPath, [require.resolve('prettier/bin/prettier.cjs'), '--check', ...files], { encoding: 'utf8', cwd: ROOT });
    ok(files.length > 20 && pr.status === 0, `every module in src/app/ is formatted by Prettier (${files.length} files)`, (pr.stdout + pr.stderr).trim().split('\n').filter(l => /\[warn\]|error/i.test(l)).slice(0, 10));
    const bad = [], tables = [];
    for (const id of MODS) {
      const f = id + '.ts', txt = fs.readFileSync(path.join(APP, f), 'utf8');
      const sf = ts.createSourceFile(f, txt, ts.ScriptTarget.Latest, true);
      const topRanges = sf.statements.flatMap(st => (ts.getLeadingCommentRanges(txt, st.pos) || []).map(c => ({ ...c, st })));
      for (const m of txt.matchAll(/prettier-ignore/g)) {
        const at = topRanges.find(c => c.pos <= m.index && m.index < c.end);
        if (!at) { bad.push(`${f}: a prettier-ignore inside a declaration, or not a comment of its own`); continue; }
        const before = topRanges.filter(c => c.st === at.st && c.end <= at.pos);
        if (!before.length) { bad.push(`${f}: the prettier-ignore on ${at.st.name ? at.st.name.text : 'a declaration'} has no comment above it saying why`); continue; }
        tables.push(`${f}: ${txt.slice(before[before.length - 1].pos, before[before.length - 1].end).replace(/^\/[/*]\s*|\s*\*\/$/g, '').slice(0, 90)}`);
      }
    }
    ok(bad.length === 0, `a prettier-ignore sits only on a top-level declaration, under a comment saying why (${tables.length}: ${tables.join('; ')})`, bad);
  }
  // The checker's settings are the ones ARCHITECTURE.md relies on, and it
  // reads every module: a tsconfig that covered one file passed everything
  // (the r51 mutation test).
  {
    const read = ts.readConfigFile(path.join(ROOT, 'tsconfig.json'), ts.sys.readFile);
    const conf = read.error ? null : ts.parseJsonConfigFileContent(read.config, ts.sys, ROOT);
    const o = conf ? conf.options : {};
    const need = { strict: true, noUnusedLocals: true, noUnusedParameters: true, noImplicitReturns: true, noFallthroughCasesInSwitch: true, exactOptionalPropertyTypes: true, isolatedModules: true, noEmit: true };
    const off = Object.entries(need).filter(([k, v]) => o[k] !== v).map(([k]) => k);
    const unread = conf ? MODS.filter(id => !conf.fileNames.map(f => path.resolve(f)).includes(path.join(APP, id + '.ts'))) : MODS;
    ok(conf && off.length === 0 && unread.length === 0, 'tsconfig.json keeps the strict settings on and reads every module', { off, unread: unread.slice(0, 5), error: read.error && read.error.messageText });
  }
  const { spawnSync } = require('child_process');
  const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '-p', path.join(ROOT, 'tsconfig.json')], { encoding: 'utf8' });
  ok(tsc.status === 0, 'the typed modules pass the TypeScript checker (strict)', (tsc.stdout + tsc.stderr).trim().split('\n').slice(0, 10));
  // The bundler resolves a module by its path and nothing else: a `browser`
  // or `exports` map in package.json would hand it another file in place of
  // a module (the r51 mutation test), and scripts/join.js pins the
  // extensions it may try.
  {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const maps = ['browser', 'exports', 'imports', 'module', 'main'].filter(k => k in pkg);
    ok(maps.length === 0, 'package.json has no field that maps a module to another file', maps);
    ok(/resolveExtensions:\s*\['\.ts',\s*'\.js'\]/.test(fs.readFileSync(path.join(ROOT, 'scripts', 'join.js'), 'utf8')), 'scripts/join.js resolves imports to .ts and .js files only');
  }
  // scripts/config.js, which the build and the tests read, gives exactly the
  // values src/app/config.ts defines: a loader that changed one passed, with
  // the page saying one build and its meta tag another (the r51 mutation test).
  {
    const out = esbuild.buildSync({ entryPoints: [path.join(APP, 'config.ts')], bundle: true, format: 'cjs', platform: 'neutral', write: false, logLevel: 'silent' }).outputFiles[0].text;
    const file = path.join(require('os').tmpdir(), `ironlog-config-${process.pid}.cjs`); fs.writeFileSync(file, out);
    let direct; try { direct = require(file); } finally { fs.unlinkSync(file); }
    const keys = [...new Set([...Object.keys(direct), ...Object.keys(cfg)])];
    const differ = keys.filter(k => JSON.stringify(direct[k]) !== JSON.stringify(cfg[k]));
    ok(keys.length > 10 && differ.length === 0, 'scripts/config.js gives the values src/app/config.ts defines, no more and no less', differ);
  }
  // The shipped build (dist/, and the preview) is index.html with what
  // scripts/build.js adds: the head script, the account settings, the
  // loader's local copies, the boot script and the install metadata. The
  // app script is index.html's byte for byte, the account settings are
  // supabase.config.json's, the Content Security Policy's hashes are the
  // inline scripts', and everything else build.js writes is pinned by hash
  // in tests/dist-page.json, which changes only when build.js does, on
  // purpose and in review (the r51 review: a timer that wiped the log,
  // put in the boot script, reached dist/ with every check green).
  {
    const crypto = require('crypto'), { spawnSync } = require('child_process');
    const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
    const scripts = h => [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    const pageApp = scripts(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')).sort((a, b) => b.length - a.length)[0];
    const pinned = JSON.parse(fs.readFileSync(path.join(__dirname, 'dist-page.json'), 'utf8'));
    const cloud = JSON.parse(fs.readFileSync(path.join(ROOT, 'supabase.config.json'), 'utf8'));
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ironlog-dist-'));
    for (const [kind, args] of [['live', []], ['preview', ['--preview']]]) {
      const dir = path.join(tmp, kind);
      const b = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build.js'), ...args, '--out', dir], { encoding: 'utf8', cwd: ROOT });
      if (b.status !== 0) { ok(false, `scripts/build.js builds the ${kind} app`, (b.stdout + b.stderr).trim().split('\n').slice(-3)); continue; }
      const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
      const all = scripts(html), app = [...all].sort((a, b) => b.length - a.length)[0];
      ok(app === pageApp, `the ${kind} build's app script is index.html's, byte for byte`);
      const acct = `window.IRONLOG_SUPABASE=${JSON.stringify({ url: cloud.url, key: cloud.key })};`;
      ok(all.includes(acct), `the ${kind} build's account settings are supabase.config.json's`);
      const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [])[1] || '';
      const want = all.map(t => `'sha256-${crypto.createHash('sha256').update(t, 'utf8').digest('base64')}'`);
      ok(want.every(h => csp.includes(h)) && (csp.match(/'sha256-/g) || []).length === want.length, `the ${kind} build's Content Security Policy allows exactly its ${all.length} inline scripts`);
      const rest = html.replace(app, '{{APP}}').replace(acct, '{{ACCT}}').replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*/, '$1{{CSP}}').split(cfg.APP_VERSION).join('{{APP_VERSION}}');
      ok(sha(rest) === pinned[kind], `everything else in the ${kind} build's page is what tests/dist-page.json pins (change it on purpose when scripts/build.js changes)`, { now: sha(rest), pinned: pinned[kind] });
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 6. Nothing behind the model's back (phase 3b, r52; ARCHITECTURE.md). The
// engine and the analytics are functions of a model: the log, the date and
// the caches come in through M and nowhere else. So every function taking
// the model, and every declaration it reaches through any reference (a call,
// or a function passed as a value, such as .filter(isWork) or .sort(sessCmp)),
// in any module and through any import, reads no clock (util's today,
// Date.now, a new Date() with no arguments), nothing random (Math.random,
// util's uid), nothing from the store or the live model, no global but
// JavaScript's own listed below (window, document, storage, timers, fetch,
// performance and crypto are not on it), and no value a module keeps and
// changes at its top level (a let or var, a constant written through by name
// anywhere in src/app/ or by Object's own writers, or a value made at load by
// running a function, whose closure could keep state), other than the one
// listed. Intl is listed: the engine's sentences word dates in the phone's
// language, as they did in r51. The code is read as written, so a value that
// is undefined only when it runs, a write through a local alias, and a read
// built by reflection are beyond it: tests/engine.js freezes every module
// table and watches the log for writes while the engine runs, and review
// reads the rest.
{
  const acorn = require('acorn'), esbuild = require('esbuild');
  const { freeNames, scanWrites } = require('../scripts/depmap');
  const APP = path.join(ROOT, 'src', 'app');
  const ids = SRC_CODE.filter(f => f.startsWith('app/')).map(f => f.slice(4, -3));
  // JavaScript's own names that read nothing outside the code: no clock, no randomness, no page.
  const PURE_GLOBALS = new Set(['Array', 'Boolean', 'Date', 'Error', 'Infinity', 'Intl', 'JSON', 'Map', 'Math', 'NaN', 'Number', 'Object', 'RangeError', 'RegExp', 'Set', 'String', 'Symbol', 'TypeError', 'WeakMap', 'WeakSet', 'isFinite', 'isNaN', 'parseFloat', 'parseInt', 'undefined']);
  // Module values that change after load, allowed where reading them changes no result (each with its reason).
  const STATE_OK = { 'format.DTF': 'a store of date formatters, one per format, made once: the same words with or without it (r46)' };
  // Declarations that read the clock or randomness, by module and name.
  const BANNED = { 'util.today': 'the clock', 'util.uid': 'randomness', 'store.*': 'the store', 'live.*': 'the live model' };
  const mods = new Map();
  for (const id of ids) {
    const js = esbuild.transformSync(fs.readFileSync(path.join(APP, id + '.ts'), 'utf8'), { loader: 'ts', format: 'esm' }).code;
    const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
    const decl = new Map(), kind = new Map(), imp = new Map();
    for (const st of ast.body) {
      const s2 = st.type === 'ExportNamedDeclaration' ? st.declaration : st;
      if (st.type === 'ImportDeclaration') { for (const sp of st.specifiers) imp.set(sp.local.name, { from: path.relative(APP, path.resolve(path.dirname(path.join(APP, id)), st.source.value)).split(path.sep).join('/'), name: sp.imported ? sp.imported.name : '*' }); continue; }
      if (!s2) continue;
      if (s2.type === 'FunctionDeclaration') { decl.set(s2.id.name, s2); kind.set(s2.id.name, 'function'); }
      else if (s2.type === 'VariableDeclaration') for (const d of s2.declarations) if (d.id.type === 'Identifier') { decl.set(d.id.name, d); kind.set(d.id.name, s2.kind); }
    }
    mods.set(id, { js, ast, decl, kind, imp });
  }
  // Every module value written after load: a let or var, or anything a declaration in any module writes through.
  const written = new Set();
  for (const [id, m] of mods) {
    for (const [n, k] of m.kind) if (k !== 'const' && k !== 'function') written.add(`${id}.${n}`);
    for (const [, d] of m.decl) for (const w of scanWrites(d)) { const i = m.imp.get(w); written.add(i ? `${i.from}.${i.name}` : `${id}.${w}`); }
    // And what Object's own writers change: Object.assign, defineProperty,
    // defineProperties and setPrototypeOf on a module's value (the second
    // r52 review wrote one with Object.assign). A write through a local
    // alias is beyond a reading of the code; tests/engine.js freezes every
    // module value, so such a write throws there.
    for (const [, d] of m.decl) (function walk(n) {
      if (!n || typeof n.type !== 'string') return;
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && !n.callee.computed && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Object' && ['assign', 'defineProperty', 'defineProperties', 'setPrototypeOf'].includes(n.callee.property.name) && n.arguments[0]) {
        let t = n.arguments[0]; while (t.type === 'MemberExpression') t = t.object;
        if (t.type === 'Identifier') { const i = m.imp.get(t.name); if (i) written.add(`${i.from}.${i.name}`); else if (m.decl.has(t.name)) written.add(`${id}.${t.name}`); }
      }
      for (const k in n) { if (k === 'type') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
    })(d);
  }
  const starts = [];
  for (const [id, m] of mods) for (const [n, d] of m.decl) { const f = d.type === 'FunctionDeclaration' ? d : d.init && /Function/.test(d.init.type) ? d.init : null; if (f && f.params.length && f.params[0].type === 'Identifier' && f.params[0].name === 'M') starts.push(`${id}.${n}`); }
  const problems = [], seen = new Set();
  // Within one declaration, the clock and randomness in any form the code can
  // be read to name them (the r52 review planted Math['random'](), Date(),
  // new Date(...[]) and a date formatter given no date, and the first rule
  // passed each): Date only as new Date(...) with arguments and none spread,
  // or Date.UTC and Date.parse; Math only as Math.<name>, never random; a
  // global never read through a computed name; and no format() or
  // formatToParts() called without a value, which formats now. A read
  // assembled by reflection (Object.getOwnPropertyDescriptor and the like) is
  // beyond a reading of the code and is review's to catch.
  const inCode = (id, d) => {
    // A global is a name the declaration leaves free that its module neither imports nor declares.
    const out = [], m = mods.get(id), free = new Set([...freeNames(d)].filter(x => !m.imp.has(x) && !m.decl.has(x)));
    (function walk(n, up) {
      if (!n || typeof n.type !== 'string') return;
      const p = up[up.length - 1];
      if (n.type === 'Identifier' && free.has(n.name) && !(p && p.type === 'MemberExpression' && p.property === n && !p.computed) && !(p && p.type === 'Property' && p.key === n && !p.computed && !p.shorthand)) {
        if (n.name === 'Date') {
          const asNew = p && p.type === 'NewExpression' && p.callee === n && p.arguments.length > 0 && p.arguments.every(a => a.type !== 'SpreadElement');
          const asPure = p && p.type === 'MemberExpression' && p.object === n && !p.computed && ['UTC', 'parse'].includes(p.property.name);
          if (!asNew && !asPure) out.push('Date other than new Date(a date) (the clock)');
        }
        if (n.name === 'Math' && !(p && p.type === 'MemberExpression' && p.object === n && !p.computed && p.property.name !== 'random')) out.push('Math.random or Math as a value');
        if (p && p.type === 'MemberExpression' && p.object === n && p.computed) out.push(`a computed read of the global ${n.name}`);
      }
      // A formatter's format reads now when given no date: refused with no
      // argument or with undefined, null or void written in its place, and
      // taken as a value (the second r52 review called a bound one). An
      // argument that is undefined only when the code runs is beyond a
      // reading of the code.
      if (n.type === 'MemberExpression' && !n.computed && ['format', 'formatToParts'].includes(n.property.name)) {
        const call = p && p.type === 'CallExpression' && p.callee === n ? p : null;
        const a = call && call.arguments[0];
        if (!call) out.push(`${n.property.name} taken as a value (it reads now when called with no date)`);
        else if (!a || (a.type === 'Identifier' && a.name === 'undefined') || (a.type === 'Literal' && a.value === null) || (a.type === 'UnaryExpression' && a.operator === 'void') || a.type === 'SpreadElement') out.push(`${n.property.name}() with no date (the clock)`);
      }
      const next = [...up, n];
      for (const k in n) { if (k === 'type') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => walk(x, next)); else if (v && typeof v.type === 'string') walk(v, next); }
    })(d, []);
    return out;
  };
  const visit = (key, trail) => {
    if (seen.has(key)) return; seen.add(key);
    const [id, n] = [key.slice(0, key.indexOf('.')), key.slice(key.indexOf('.') + 1)];
    const ban = BANNED[key] || BANNED[`${id}.*`];
    if (ban) { problems.push(`${trail.join(' > ')} reads ${ban} (${key})`); return; }
    const m = mods.get(id), d = m && m.decl.get(n);
    if (!d) { problems.push(`${trail.join(' > ')}: ${key} is not a declaration of src/app/`); return; }
    if (written.has(key) && !STATE_OK[key]) problems.push(`${trail.join(' > ')} reads ${key}, a value kept and changed at a module's top level`);
    // A value made at load by running a function written in src/app/ (an
    // immediately called function, or one of the modules' own): its closure
    // can keep state no write above shows (the second r52 review kept a
    // counter so).
    if (d.type === 'VariableDeclarator' && d.init && !STATE_OK[key]) (function walk(x) {
      if (!x || typeof x.type !== 'string' || /Function/.test(x.type)) return;
      if (x.type === 'CallExpression' || x.type === 'NewExpression') {
        const c = x.callee;
        if (/Function/.test(c.type) || (c.type === 'Identifier' && (m.decl.has(c.name) || (m.imp.has(c.name) && m.imp.get(c.name).from)))) problems.push(`${[...trail, key].join(' > ')} is made at load by running ${c.type === 'Identifier' ? c.name : 'a function written in place'}, whose closure can keep state`);
      }
      for (const k in x) { if (k === 'type') continue; const v = x[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
    })(d.init);
    for (const x of inCode(id, d)) problems.push(`${[...trail, key].join(' > ')} uses ${x}`);
    for (const u of freeNames(d)) {
      if (u === n) continue;
      const i = m.imp.get(u);
      if (i) visit(`${i.from}.${i.name}`, [...trail, key]);
      else if (m.decl.has(u)) visit(`${id}.${u}`, [...trail, key]);
      else if (!PURE_GLOBALS.has(u)) problems.push(`${[...trail, key].join(' > ')} reads the global ${u}`);
    }
  };
  for (const s0 of starts) visit(s0, []);
  ok(problems.length === 0 && starts.length >= 97 && seen.size > starts.length, `every function taking the model (${starts.length}) and all it reaches (${seen.size - starts.length} more declarations) read the log, the date and the caches only through the model: no clock, randomness, store, live model, page or module state but the listed`, problems.slice(0, 8));
}

// The build this one replaces is kept as a baseline and read by the
// migration and seams suites (r45: CLAUDE.md asked for it, nothing checked).
{
  const ver = (cfg.APP_VERSION.match(/-r(\d+)(?:\.(\d+))?$/) || []).slice(1).map(Number);
  const base = fs.readdirSync(path.join(ROOT, 'baselines')).filter(f => /^r\d+(-\d+)?\.html$/.test(f));
  const num = f => f.replace('.html', '').slice(1).split('-').map(Number);
  const older = base.filter(f => { const [a, b] = num(f); return a < ver[0] || (a === ver[0] && (b || 0) < (ver[1] || 0)); });
  const newest = older.sort((a, b) => { const x = num(a), y = num(b); return x[0] - y[0] || (x[1] || 0) - (y[1] || 0); }).pop();
  ok(ver.length && newest && num(newest)[0] >= ver[0] - 1, `the build before r${ver[0]} is in baselines/ (${newest})`);
  const mig = fs.readFileSync(path.join(__dirname, 'migration.js'), 'utf8');
  const unread = base.filter(f => !mig.includes(`'baselines/${f}'`));
  ok(unread.length === 0, 'every baseline is loaded by tests/migration.js', unread);
  // A baseline is a published build and never changes: each is pinned by
  // hash in baselines/SHA256SUMS, so an edit to one (the r51 review made the
  // same change in a baseline and in the source, and the move check saw no
  // difference) shows as a change to that file in review. A new baseline is
  // added to the list with `sha256sum baselines/<file> >> baselines/SHA256SUMS`.
  {
    const crypto = require('crypto');
    const sums = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'baselines', 'SHA256SUMS'), 'utf8').trim().split('\n').map(l => { const [h, f] = l.trim().split(/\s+\*?/); return [path.basename(f), h]; }));
    const bad = base.filter(f => sums[f] !== crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'baselines', f))).digest('hex')).map(f => `${f}: ${sums[f] ? 'changed' : 'not listed'}`);
    const gone = Object.keys(sums).filter(f => !base.includes(f));
    ok(base.length > 30 && bad.length === 0 && gone.length === 0, 'every baseline is the published build its hash in baselines/SHA256SUMS says', [...bad, ...gone.map(f => `${f}: listed, missing`)]);
  }
}

// The documents against the repository (r46). CLAUDE.md called the Claude
// artifact a shipping channel for 17 days after OWNER.md recorded it retired,
// and 147 lines of its code stayed in src/ because of it. Prose cannot be
// checked by a machine, but the things prose names can be.
{
  const docs = ['CLAUDE.md', 'tests/SUITES.md', 'OWNER.md', 'FEEDBACK.md', 'SUPABASE.md'].filter(f => fs.existsSync(path.join(ROOT, f)));
  const pathish = /`([A-Za-z0-9_.\-]+\/[A-Za-z0-9_.\-\/]+\.[a-z]{2,4})`/g;
  const missing = [];
  for (const d of docs) {
    const txt = fs.readFileSync(path.join(ROOT, d), 'utf8');
    for (const m of txt.matchAll(pathish)) {
      const rel = m[1];
      if (/^(https?|node_modules|data\/)/.test(rel)) continue;
      if (!fs.existsSync(path.join(ROOT, rel))) missing.push(`${d}: ${rel}`);
    }
  }
  ok(missing.length === 0, 'every repo file the documents name exists', missing);

  // What GitHub runs, too (r54): tests/moved.js was deleted in r54 and the workflow still ran it, so every Chromium shard of
  // pull request #47 failed before a suite ran, while every suite passed here, where nothing runs the workflow file.
  const wf = path.join(ROOT, '.github', 'workflows');
  const runs = [];
  for (const f of fs.readdirSync(wf).filter(f => /\.ya?ml$/.test(f)))
    for (const m of fs.readFileSync(path.join(wf, f), 'utf8').matchAll(/\bnode\s+((?:tests|scripts)\/[A-Za-z0-9_.\-\/]+\.js)\b/g)) runs.push([f, m[1]]);
  const gone = runs.filter(([, rel]) => !fs.existsSync(path.join(ROOT, rel))).map(([f, rel]) => `${f}: ${rel}`);
  ok(runs.length >= 3 && gone.length === 0, 'every script a GitHub workflow runs exists (' + runs.length + ')', gone);

  // The source parts, not index.html: since r49 the page's script is bundled
  // and its comments are gone, and the /*ai{ markers were comments.
  const src = fs.readdirSync(path.join(ROOT, 'src')).filter(f => /\.(js|html|css)$/.test(f)).map(f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n') + SRC_CODE.filter(f => f.startsWith('app/')).map(f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
  const back = ['/*ai{', '/*}ai', 'debriefPrompt', 'aiDigest', 'AI_STYLE', 'exProjection', 'loadAskCard', 'SIMPLE_HIDE'].filter(w => src.includes(w));
  ok(back.length === 0, 'nothing the documents record as removed is back in the source', back);

  // A comment added at the end of a line of the legacy script must end the line (r55, the review: one added after
  // Build my own's first statements swallowed two more, so the Days section opened folded and a day picked on Today
  // stayed picked). Code after a line comment reads as a statement end and an assignment or call inside the comment.
  {
    const swallowed = [];
    for (const f of fs.readdirSync(path.join(ROOT, 'src')).filter(f => /^[12]\d-.+\.js$/.test(f)))
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8').split('\n').forEach((l, i) => {
        const at = [l.indexOf('; //'), l.indexOf('} //'), l.indexOf(') //'), l.indexOf(', //')].filter(p => p >= 0);
        if (!at.length) return;
        const tail = l.slice(Math.min(...at) + 3);
        if (/[;{}]\s*[A-Za-z_$][\w$.\[\]']*\s*[=(]/.test(tail) || /\w\.\w+=\w/.test(tail) || /\w\(\);/.test(tail)) swallowed.push(`${f}:${i + 1}: ${tail.slice(0, 120)}`);
      });
    ok(swallowed.length === 0, 'no comment at the end of a legacy line hides code after it', swallowed);
  }

  const cm = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  ok(!/ships two ways|as a Claude artifact \(a hosted/.test(cm), 'CLAUDE.md does not call the retired artifact a shipping channel');
  const ver = (cfg.APP_VERSION.match(/-r([0-9.]+)$/) || [])[1];
  ok(ver && cm.includes(`Build r${ver},`), `CLAUDE.md says the build it is (r${ver})`, (cm.match(/Build r[0-9.]+/) || [])[0]);
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
