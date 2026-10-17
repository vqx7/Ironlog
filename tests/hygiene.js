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
const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
// Every script file under src/: the legacy parts and the typed modules in src/app/.
// src/app/ is read at any depth.
const appFiles = d => fs.readdirSync(path.join(ROOT, 'src', d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? appFiles(d + '/' + e.name) : /\.ts$/.test(e.name) ? [d + '/' + e.name] : []);
const SRC_CODE = [...fs.readdirSync(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')), ...appFiles('app')];
const cfg = require('../scripts/config');
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
  // r44: suites run side by side, so none runs scripts/build.js itself (it deletes dist/ first); h.js build() does, only when a suite runs alone.
  const direct = files.filter(f => f !== 'h' && f !== 'run' && /scripts', 'build\.js'|build\.js'\]/.test(fs.readFileSync(path.join(__dirname, f + '.js'), 'utf8')));
  ok(direct.length === 0, 'no suite runs the build itself; they call build() from tests/h.js', direct);
}

// 2. Duplicated selectors, per block.
{
  const css = fs.readFileSync(path.join(ROOT, 'src/02-style.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
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
    ['scripts/build.js', 'js'], ['scripts/join.js', 'js'], ['scripts/cloud-supabase.js', 'js'], ['scripts/config.js', 'js'], ['scripts/depmap.js', 'js'],
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
  // Every module is laid out by Prettier from the committed .prettierrc.json,
  // so layout is never a matter of taste or of hand (layout never changes
  // code, which tests/moved.js proves). A data table may keep its rows on
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

  // The source parts, not index.html: since r49 the page's script is bundled
  // and its comments are gone, and the /*ai{ markers were comments.
  const src = fs.readdirSync(path.join(ROOT, 'src')).filter(f => /\.(js|html|css)$/.test(f)).map(f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n') + SRC_CODE.filter(f => f.startsWith('app/')).map(f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
  const back = ['/*ai{', '/*}ai', 'debriefPrompt', 'aiDigest', 'AI_STYLE', 'exProjection', 'loadAskCard', 'SIMPLE_HIDE'].filter(w => src.includes(w));
  ok(back.length === 0, 'nothing the documents record as removed is back in the source', back);

  const cm = fs.readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8');
  ok(!/ships two ways|as a Claude artifact \(a hosted/.test(cm), 'CLAUDE.md does not call the retired artifact a shipping channel');
  const ver = (cfg.APP_VERSION.match(/-r([0-9.]+)$/) || [])[1];
  ok(ver && cm.includes(`Build r${ver},`), `CLAUDE.md says the build it is (r${ver})`, (cm.match(/Build r[0-9.]+/) || [])[0]);
}

console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS'); process.exit(fails.length ? 1 : 0);
